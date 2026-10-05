#!/usr/bin/env node
// Claude named pause (harness-rules 2-1): the only writer of paused and pause_* in
// step_archive/progress.json.
//
//   node harness-pause.mjs pause  --workspace <root> --reason <code> --note <text> [--evidence step_archive/<file>]
//   node harness-pause.mjs resume --workspace <root>
//   node harness-pause.mjs status --workspace <root>
//   node harness-pause.mjs reset  --workspace <root>
//
// Model codes (permission-denied, required-tool-failed, required-input-missing) need --evidence;
// user-request (/harness-pause) does not. reset (/harness-reset) replaces progress.json with a new
// run at step 1 (a new run_started_at) that waits in a user-request pause, preserving the validated
// profile. Invalid metadata is refused; step bodies, TOPIC.md, specs and outputs are preserved. stdout is one
// JSON line; errors are one JSON line on stderr. Exit codes: 0 done, 1 I/O failure, 2 refused by
// workspace state, 64 usage, 75 the file kept changing. Nothing is created: no step_archive/, no
// progress.json. A Codex workspace is refused (use Codex $webapp pause/resume or
// $harness20-reset there). Uses no codex/ module.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MODEL_PAUSE_REASONS, NOTE_MAX, PAUSE_REASONS,
  applyPause, applyResume, firstUnfinished, pauseDetails, resetProgress, summary, validateProgress
} from './lib/pause-state.mjs';
import { physicalWorkspace, readSafe, sha256, writeSafe } from './lib/quality-files.mjs';

import { resolveWorkflowProfile } from './lib/workflow-profiles.mjs';
import { archiveDirectory, claudeStepBody } from './lib/claude-profile.mjs';
import { workflowContext, recheckWorkflowContext } from './lib/workflow-context.mjs';

const PROGRESS = 'step_archive/progress.json';
const PROGRESS_LIMIT = 1024 * 1024;
const FLAGS = { pause: ['workspace', 'reason', 'note', 'evidence'], resume: ['workspace'], status: ['workspace'], reset: ['workspace'] };
const CONTROL = /[\x00-\x1f\x7f\u2028\u2029]/;
const ATTEMPTS = 3;

class PauseError extends Error {
  constructor(exit, code, message) {
    super(message);
    this.exit = exit;
    this.code = code;
  }
}
const usage = message => new PauseError(64, 'PAUSE_USAGE', message);

// `--flag value` pairs only, as in scripts/qa-report.mjs.
function parseArgs(argv) {
  const [command, ...args] = argv;
  if (!Object.hasOwn(FLAGS, command ?? '')) throw usage('Expected pause, resume, status or reset');
  if (args.length % 2 !== 0) throw usage('Arguments must be --flag value pairs');
  const allowed = new Set(FLAGS[command]);
  const options = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    const name = flag.startsWith('--') ? flag.slice(2) : '';
    if (!allowed.has(name) || Object.hasOwn(options, name) || typeof value !== 'string' || !value.trim() ||
        value.startsWith('--') || value.includes('\0')) {
      throw usage(`Unknown, repeated or empty flag for ${command}`);
    }
    options[name] = value;
  }
  if (!options.workspace) throw usage('--workspace is required');
  if (command !== 'pause') return { command, workspace: options.workspace };

  if (!PAUSE_REASONS.includes(options.reason)) throw usage(`--reason must be one of ${PAUSE_REASONS.join(', ')}`);
  if (options.note === undefined) throw usage('--note is required');
  const note = options.note.trim();
  if ([...note].length > NOTE_MAX || CONTROL.test(note)) throw usage(`--note must be one line of at most ${NOTE_MAX} characters`);
  if (options.evidence === undefined && MODEL_PAUSE_REASONS.includes(options.reason)) {
    throw usage(`--evidence is required for ${options.reason}`);
  }
  if (options.evidence !== undefined && (!options.evidence.startsWith('step_archive/') || CONTROL.test(options.evidence))) {
    throw new PauseError(64, 'PAUSE_EVIDENCE_INVALID', '--evidence must be a relative path that starts with step_archive/');
  }
  return { command, workspace: options.workspace, reason: options.reason, note, evidence: options.evidence ?? null };
}

// Any entry at the Codex state path, even a directory or a link, means the Codex state manager
// owns the workspace (hooks/lib/harness-activity.mjs codexOwned).
async function codexOwned(root) {
  try {
    await lstat(join(root, 'step_archive', '.harness50-codex', 'state.json'));
    return true;
  } catch (error) {
    return !['ENOENT', 'ENOTDIR'].includes(error?.code);
  }
}

async function readProgress(root) {
  try {
    return await readSafe(root, PROGRESS, PROGRESS_LIMIT);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      throw new PauseError(2, 'PAUSE_NO_WORKFLOW', 'No step_archive/progress.json in this workspace; nothing was created. Start a run with /webapp <topic>.');
    }
    // readSafe's own checks (link, alias, hard link, size) carry no system error code.
    if (!error?.code) throw new PauseError(2, 'PAUSE_STATE_INVALID', 'step_archive/progress.json is not a small, unaliased regular file');
    throw new PauseError(1, 'PAUSE_IO', 'step_archive/progress.json could not be read');
  }
}

function parseProgress(bytes) {
  let progress;
  try {
    progress = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new PauseError(2, 'PAUSE_STATE_INVALID', 'step_archive/progress.json is not valid JSON');
  }
  if (!validateProgress(progress)) {
    throw new PauseError(2, 'PAUSE_STATE_INVALID', 'step_archive/progress.json needs consistent workflow profile/count and distinct completed steps in range');
  }
  return progress;
}

async function checkEvidence(root, evidence) {
  let bytes;
  try {
    bytes = await readSafe(root, evidence);
  } catch {
    throw new PauseError(64, 'PAUSE_EVIDENCE_INVALID', '--evidence must name a readable regular file under step_archive/');
  }
  if (bytes.length === 0) throw new PauseError(64, 'PAUSE_EVIDENCE_INVALID', '--evidence must not be empty');
}

// Same local format as the step-progress writer: yyyy-MM-ddTHH:mm:ss.
const two = value => String(value).padStart(2, '0');
const localStamp = date => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let root;
  try {
    root = await physicalWorkspace(options.workspace);
  } catch {
    throw new PauseError(2, 'PAUSE_WORKSPACE_INVALID', '--workspace must be an existing directory that is not a link');
  }
  if (await codexOwned(root)) {
    throw new PauseError(2, 'PAUSE_CODEX_WORKSPACE', 'A Codex workflow owns this workspace (step_archive/.harness50-codex/state.json); use Codex $webapp pause/resume instead.');
  }
  // Compare and swap: the file must be byte-identical just before the write, or the change is
  // computed again from the new content.
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const bytes = await readProgress(root);
    // Reset preserves the selected definition, so malformed metadata must be repaired from
    // known records before any new generation can be published.
    const progress = parseProgress(bytes);
    let context;
    try { context = await workflowContext(root); } catch { throw new PauseError(2, 'PAUSE_STATE_INVALID', 'Invalid workflow identity or generation'); }
    if (options.command === 'status') return { action: 'status', changed: false, ...summary(progress), ...pauseDetails(progress) };
    let result;
    if (options.command === 'reset') {
      result = { changed: true, next: resetProgress({ now: new Date(Math.max(Date.now(), (Date.parse(progress.run_started_at) || 0) + 1)), workflowProfile: context.profile.id }) };
    } else if (options.command === 'pause') {
      if (!firstUnfinished(progress)) throw new PauseError(2, 'PAUSE_COMPLETED', 'Every step is recorded as completed; there is nothing to pause');
      if (options.evidence) await checkEvidence(root, options.evidence);
      result = applyPause(progress, { reason: options.reason, note: options.note, evidence: options.evidence, now: new Date() });
    } else {
      result = applyResume(progress, { now: new Date() });
    }
    const nextStep = firstUnfinished(result.next);
    let stepBody = null;
    if (options.command === 'resume' && nextStep) {
      try { stepBody = claudeStepBody(root, result.next, nextStep); } catch { throw new PauseError(2, 'PAUSE_STATE_INVALID', 'Selected step body is missing or conflicts with profile'); }
    }
    await recheckWorkflowContext(root, context);
    if (result.changed) {
      if (sha256(await readProgress(root)) !== sha256(bytes)) continue;
      result.next.last_updated = localStamp(new Date());
      try {
        await writeSafe(root, PROGRESS, Buffer.from(`${JSON.stringify(result.next, null, 2)}\n`, 'utf8'));
      } catch {
        throw new PauseError(1, 'PAUSE_IO', 'step_archive/progress.json could not be written; it is unchanged');
      }
    }
    const output = { action: options.command, changed: result.changed, ...summary(result.next) };
    output.workflow_profile = context.profile.id;
    output.body_directory = archiveDirectory(context.profile);
    output.step_body = stepBody;
    if (options.command === 'resume') output.resumed_from = result.resumedFrom;
    return output;
  }
  throw new PauseError(75, 'PAUSE_CONFLICT', `step_archive/progress.json changed during each of ${ATTEMPTS} attempts; nothing was written`);
}

main().then(output => {
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 0;
}, error => {
  const known = error instanceof PauseError;
  process.exitCode = known ? error.exit : 1;
  process.stderr.write(`${JSON.stringify({ error: { code: known ? error.code : 'PAUSE_IO', message: known ? error.message : 'Unexpected failure; nothing was written' } })}\n`);
});
