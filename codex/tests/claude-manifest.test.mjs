import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { makeWorkspace } from './helpers/workspace.mjs';
import { readRun } from '../../hooks/lib/harness-activity.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const dispatcher = path.join(repo, 'hooks/run-hook.mjs');
const activity = path.join(repo, 'hooks/lib/harness-activity.mjs');
function copyDispatcher(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(dispatcher, target);
  const shared = path.resolve(path.dirname(target), '../scripts/lib');
  fs.mkdirSync(shared, { recursive: true });
  for (const name of ['strict-json.mjs', 'tool-policy.mjs', 'sensitive-data.mjs']) {
    fs.copyFileSync(path.join(repo, 'scripts/lib', name), path.join(shared, name));
  }
}
function copyActivity(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(activity, target);
  const shared = path.resolve(path.dirname(target), '../../scripts/lib');
  fs.mkdirSync(shared, { recursive: true });
  for (const name of ['workflow-profiles.mjs', 'claude-profile.mjs', 'workflow-security.mjs', 'quality-files.mjs', 'strict-json.mjs']) fs.copyFileSync(path.join(repo, 'scripts/lib', name), path.join(shared, name));
}
const expected = {
  SessionStart: [['', 'step-progress-loader', 30]],
  UserPromptSubmit: [['', 'webapp-trigger', 10], ['', 'step-obedience-guard', 5]],
  PreToolUse: [['Bash|Read|Write|Edit|MultiEdit|NotebookEdit|WebFetch|WebSearch', 'destructive-guard', 5], ['Write|Edit|MultiEdit|NotebookEdit|WebSearch', 'auto-approve', 3]],
  PermissionRequest: [['Bash|Read|Write|Edit|MultiEdit|NotebookEdit|WebFetch|WebSearch', 'permission-request-guard', 5]],
  PostToolUse: [['Write|Edit', 'mx-tag-validator', 10], ['Write|Edit', 'lsp-autofix', 30]],
  Stop: [['', 'stop-advance', 45], ['', 'spec-generator', 15], ['', 'trust5-validator', 60]],
};
test('Claude manifest has a hooks envelope and one dispatcher per preserved registration', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'hooks/hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(config), ['hooks']);
  assert.deepEqual(Object.keys(config.hooks).sort(), Object.keys(expected).sort());
  for (const [event, registrations] of Object.entries(expected)) {
    const actual = config.hooks[event].flatMap(group => group.hooks.map(hook => {
      assert.equal(hook.type, 'command');
      const match = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/run-hook\.mjs" ([a-z0-9-]+)$/.exec(hook.command);
      assert.ok(match, hook.command);
      return [group.matcher || '', match[1], hook.timeout];
    }));
    assert.deepEqual(actual, registrations);
  }
});
test('dispatcher rejects missing, unknown, traversal, and extra hook arguments', () => {
  for (const args of [[], ['unknown'], ['../webapp-trigger'], ['webapp-trigger', 'extra'], ['__proto__']]) {
    const result = spawnSync(process.execPath, [dispatcher, ...args], { encoding: 'utf8', input: '{}', timeout: 5000 });
    assert.equal(result.status, 64, result.stderr);
    assert.equal(result.stdout, '');
  }
});
test('dispatcher runs only native shell and preserves stdin, output, and exit code', async () => {
  const root = path.join(await makeWorkspace(), 'hooks');
  fs.mkdirSync(root);
  copyDispatcher(path.join(root, 'run-hook.mjs'));
  fs.mkdirSync(path.join(root, 'lib'));
  copyActivity(path.join(root, 'lib', 'harness-activity.mjs'));
  const windows = process.platform === 'win32';
  // Only the native counterpart exists; attempting the other platform fails.
  fs.writeFileSync(path.join(root, windows ? 'destructive-guard.ps1' : 'destructive-guard.sh'), windows
    ? "$ErrorActionPreference = 'Stop'\n$raw = [Console]::In.ReadToEnd()\n[Console]::Out.Write($raw)\n[Console]::Error.Write('fixture stderr')\nexit 2\n"
    : "#!/usr/bin/env bash\ncat\nprintf 'fixture stderr' >&2\nexit 2\n");
  // The guards start only in a Harness50 workspace, so the event names a project with an active run.
  const project = path.join(root, 'active');
  fs.mkdirSync(path.join(project, 'step_archive', 'archived'), { recursive: true });
  fs.writeFileSync(path.join(project, 'step_archive', 'progress.json'), JSON.stringify({ current_step: 1, total_steps: 50, completed_steps: [] }));
  fs.writeFileSync(path.join(project, 'step_archive', 'archived', 'step001.md'), '# Step 1\n');
  const event = JSON.stringify({ stop_hook_active: true, cwd: project });
  const result = spawnSync(process.execPath, [path.join(root, 'run-hook.mjs'), 'destructive-guard'], {
    input: event, encoding: 'utf8', timeout: 10000, env: { ...process.env, CLAUDE_PROJECT_DIR: '' }
  });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, event);
  assert.equal(result.stderr, 'fixture stderr');
});
test('dispatcher budgets cover every registration and sequence part and stay below the manifest timeout', () => {
  const source = fs.readFileSync(dispatcher, 'utf8');
  const table = name => {
    const literal = new RegExp(`const ${name} = (\\{[^}]*\\});`).exec(source);
    assert.ok(literal, `run-hook.mjs keeps its ${name} as a one-line JSON literal`);
    return JSON.parse(literal[1]);
  };
  const budgets = table('budgets');
  const sequences = table('sequences');
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'hooks/hooks.json'), 'utf8'));
  const timeouts = new Map();
  for (const groups of Object.values(config.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) timeouts.set(/ ([a-z0-9-]+)$/.exec(hook.command)[1], hook.timeout);
    }
  }
  assert.deepEqual(sequences, { 'stop-advance': ['step-progress-writer', 'step-auto-continue'] });
  // A sequence is registered in hooks.json; its parts are not, and keep budgets for direct calls.
  const parts = Object.values(sequences).flat();
  for (const name of Object.keys(sequences)) assert.ok(timeouts.has(name), `${name} is registered in hooks/hooks.json`);
  for (const part of parts) assert.equal(timeouts.has(part), false, `${part} runs inside a sequence, not as its own registration`);
  assert.deepEqual(Object.keys(budgets).sort(), [...new Set([...timeouts.keys(), ...parts])].sort());
  for (const [name, timeout] of timeouts) {
    assert.ok(budgets[name] >= timeout * 1000 - 2000 && budgets[name] < timeout * 1000, `${name}: ${budgets[name]} ms for a ${timeout} s host timeout`);
  }
  // The parts run one after the other on their own budgets; a stopped part's tree needs time to end.
  for (const [name, list] of Object.entries(sequences)) {
    const sum = list.reduce((total, part) => total + budgets[part], 0);
    // Each part that runs out of time also gets up to 2 s for ending its process tree.
    assert.ok(budgets[name] >= sum + 2000 * list.length, `${name}: ${budgets[name]} ms for parts with ${sum} ms of budgets`);
  }
});

// The activity gate: a fake script for every hook name that runs a script of its own (each
// hooks.json registration but the stop-advance sequence, plus that sequence's two parts, which stay
// callable by name) records its stdin in <name>.ran, so a sentinel file shows exactly which hooks
// the dispatcher started. The sequence has its own fixture below.
const GUARDS = ['destructive-guard', 'permission-request-guard'];
const ACTIVITY_GATED = ['step-progress-loader', 'step-obedience-guard', 'auto-approve', 'mx-tag-validator', 'lsp-autofix',
  'step-progress-writer', 'spec-generator', 'trust5-validator', 'step-auto-continue'];
async function gatedDispatcher({ withLib = true } = {}) {
  const root = await makeWorkspace();
  const hooks = path.join(root, 'plugin', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  copyDispatcher(path.join(hooks, 'run-hook.mjs'));
  if (withLib) {
    fs.mkdirSync(path.join(hooks, 'lib'));
    copyActivity(path.join(hooks, 'lib', 'harness-activity.mjs'));
  }
  const windows = process.platform === 'win32';
  for (const name of [...GUARDS, ...ACTIVITY_GATED, 'webapp-trigger']) {
    fs.writeFileSync(path.join(hooks, name + (windows ? '.ps1' : '.sh')), windows
      ? `$raw = [Console]::In.ReadToEnd()\n[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '${name}.ran'), $raw)\n`
      : `cat > "$(dirname "$0")/${name}.ran"\n`);
  }
  const empty = path.join(root, 'empty');
  const active = path.join(root, 'active');
  fs.mkdirSync(empty);
  fs.mkdirSync(path.join(active, 'step_archive', 'archived'), { recursive: true });
  fs.writeFileSync(path.join(active, 'step_archive', 'progress.json'), JSON.stringify({ current_step: 1, total_steps: 50, completed_steps: [] }));
  fs.writeFileSync(path.join(active, 'step_archive', 'archived', 'step001.md'), '# Step 1\n');
  const call = (name, event) => {
    const sentinel = path.join(hooks, `${name}.ran`);
    fs.rmSync(sentinel, { force: true });
    // A test runner started inside Claude Code inherits CLAUDE_PROJECT_DIR, so it is cleared here.
    const result = spawnSync(process.execPath, [path.join(hooks, 'run-hook.mjs'), name], {
      input: event, encoding: 'utf8', timeout: 20000, env: { ...process.env, CLAUDE_PROJECT_DIR: '' }
    });
    assert.equal(result.error, undefined, name);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.equal(result.stdout, '', name);
    assert.equal(result.stderr, '', name);
    return fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8') : null;
  };
  return { root, empty, active, hooks, call };
}
test('dispatcher starts activity-gated hooks and the two guards only in a project with a run', async () => {
  const f = await gatedDispatcher();
  for (const name of [...GUARDS, ...ACTIVITY_GATED]) {
    assert.equal(f.call(name, JSON.stringify({ cwd: f.empty, prompt: 'hello', tool_name: 'Bash' })), null, `${name} in an empty project`);
    const event = JSON.stringify({ cwd: f.active, session_id: 's', note: 'bytes pass through' });
    assert.equal(f.call(name, event), event, `${name} in an active project`);
  }
});
test('dispatcher hands the hook the node it runs on', async () => {
  const f = await gatedDispatcher();
  const windows = process.platform === 'win32';
  fs.writeFileSync(path.join(f.hooks, windows ? 'destructive-guard.ps1' : 'destructive-guard.sh'), windows
    ? "$null = [Console]::In.ReadToEnd()\n[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'destructive-guard.ran'), $env:HARNESS50_NODE)\n"
    : 'cat >/dev/null\nprintf \'%s\' "$HARNESS50_NODE" > "$(dirname "$0")/destructive-guard.ran"\n');
  assert.equal(f.call('destructive-guard', JSON.stringify({ cwd: f.active, tool_name: 'Bash' })), process.execPath);
});
test('dispatcher starts webapp-trigger only for an explicit /webapp command', async () => {
  const f = await gatedDispatcher();
  const explicit = JSON.stringify({ cwd: f.empty, prompt: '/webapp x' });
  assert.equal(f.call('webapp-trigger', explicit), explicit);
  for (const prompt of ['hello', '회사 매출 대시보드 만들어줘', '/webapp', '/webappx y', 'please /webapp x']) {
    assert.equal(f.call('webapp-trigger', JSON.stringify({ cwd: f.active, prompt })), null, prompt);
  }
  assert.equal(f.call('webapp-trigger', '{broken'), null);
});
test('dispatcher without hooks/lib starts only the two guards', async () => {
  const f = await gatedDispatcher({ withLib: false });
  for (const name of [...ACTIVITY_GATED, 'webapp-trigger']) {
    assert.equal(f.call(name, JSON.stringify({ cwd: f.active, prompt: '/webapp x' })), null, name);
  }
  for (const name of GUARDS) {
    const event = JSON.stringify({ cwd: f.active, tool_name: 'Bash' });
    assert.equal(f.call(name, event), event, name);
  }
});

// stop-advance with fake parts. Each part records its stdin bytes in <name>.ran and a time in
// <name>.time (epoch ms): the writer when it ends, after a short sleep, and step-auto-continue when
// its process was created, so parts started together would overlap. PowerShell takes that time from
// the process, because two PowerShells started together can reach their first line over a second
// apart; bash starts at once, so its first line stands for it. The fake writer prints noise that
// must not reach stdout, exits with H50_FAKE_WRITER_EXIT and, with H50_FAKE_PROGRESS set, replaces
// that progress.json as the real writer moves a run on. step-auto-continue exits with
// H50_FAKE_NEXT_EXIT.
const WRITER = 'step-progress-writer';
const NEXT = 'step-auto-continue';
const NEXT_OUTPUT = '{"decision":"block","reason":"fake step-auto-continue"}\n';
const RUN = { current_step: 1, total_steps: 50, completed_steps: [] };
const ALL_STEPS = Array.from({ length: 50 }, (_, index) => index + 1);
async function sequenceDispatcher(options) {
  const f = await gatedDispatcher(options);
  const parts = process.platform === 'win32' ? {
    [`${WRITER}.ps1`]: [
      '$stdin = New-Object System.IO.MemoryStream',
      '[Console]::OpenStandardInput().CopyTo($stdin)',
      `[System.IO.File]::WriteAllBytes((Join-Path $PSScriptRoot '${WRITER}.ran'), $stdin.ToArray())`,
      'Start-Sleep -Milliseconds 500',
      'if ($env:H50_FAKE_PROGRESS) { [System.IO.File]::WriteAllText($env:H50_FAKE_PROGRESS, $env:H50_FAKE_PROGRESS_JSON) }',
      "[Console]::Out.Write('writer noise' + [char]10)",
      `[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '${WRITER}.time'), [string][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())`,
      'exit [int]$env:H50_FAKE_WRITER_EXIT'
    ],
    [`${NEXT}.ps1`]: [
      `[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '${NEXT}.time'), [string]([DateTimeOffset](Get-Process -Id $PID).StartTime).ToUnixTimeMilliseconds())`,
      '$stdin = New-Object System.IO.MemoryStream',
      '[Console]::OpenStandardInput().CopyTo($stdin)',
      `[System.IO.File]::WriteAllBytes((Join-Path $PSScriptRoot '${NEXT}.ran'), $stdin.ToArray())`,
      `[Console]::Out.Write('${NEXT_OUTPUT.trim()}' + [char]10)`,
      'exit [int]$env:H50_FAKE_NEXT_EXIT'
    ]
  } : {
    [`${WRITER}.sh`]: [
      `cat > "$(dirname "$0")/${WRITER}.ran"`,
      'sleep 0.5',
      'if [ -n "${H50_FAKE_PROGRESS:-}" ]; then printf \'%s\' "$H50_FAKE_PROGRESS_JSON" > "$H50_FAKE_PROGRESS"; fi',
      'echo "writer noise"',
      `"$HARNESS50_NODE" -p 'Date.now()' </dev/null > "$(dirname "$0")/${WRITER}.time"`,
      'exit "${H50_FAKE_WRITER_EXIT:-0}"'
    ],
    [`${NEXT}.sh`]: [
      `"$HARNESS50_NODE" -p 'Date.now()' </dev/null > "$(dirname "$0")/${NEXT}.time"`,
      `cat > "$(dirname "$0")/${NEXT}.ran"`,
      `printf '%s\\n' '${NEXT_OUTPUT.trim()}'`,
      'exit "${H50_FAKE_NEXT_EXIT:-0}"'
    ]
  };
  for (const [file, lines] of Object.entries(parts)) fs.writeFileSync(path.join(f.hooks, file), `${lines.join('\n')}\n`);
  // A project next to the plugin with this progress.json and, unless body is false, step 1's body.
  const project = (name, progress, { body = true, codex = false } = {}) => {
    const root = path.join(f.root, name);
    fs.mkdirSync(path.join(root, 'step_archive', 'archived'), { recursive: true });
    fs.writeFileSync(path.join(root, 'step_archive', 'progress.json'), JSON.stringify(progress));
    if (body) fs.writeFileSync(path.join(root, 'step_archive', 'archived', 'step001.md'), '# Step 1\n');
    if (codex) {
      fs.mkdirSync(path.join(root, 'step_archive', '.harness50-codex'));
      fs.writeFileSync(path.join(root, 'step_archive', '.harness50-codex', 'state.json'), '{}');
    }
    return root;
  };
  // One Stop as hooks.json runs it. The non-ASCII message shows each part gets the exact bytes.
  const stopAdvance = (cwd, env = {}) => {
    const read = file => fs.existsSync(path.join(f.hooks, file)) ? fs.readFileSync(path.join(f.hooks, file)) : null;
    for (const name of [WRITER, NEXT]) for (const file of [`${name}.ran`, `${name}.time`]) fs.rmSync(path.join(f.hooks, file), { force: true });
    const event = JSON.stringify({ hook_event_name: 'Stop', session_id: 's', stop_hook_active: false, last_assistant_message: 'Step 001/50 완료', cwd });
    // Up to two PowerShell starts, so the limit is generous.
    const result = spawnSync(process.execPath, [path.join(f.hooks, 'run-hook.mjs'), 'stop-advance'], {
      input: event, encoding: 'utf8', timeout: 60000, env: { ...process.env, CLAUDE_PROJECT_DIR: '', ...env }
    });
    assert.equal(result.error, undefined, 'stop-advance');
    return {
      event: Buffer.from(event), status: result.status, stdout: result.stdout, stderr: result.stderr,
      ran: [WRITER, NEXT].filter(name => read(`${name}.ran`) !== null), writer: read(`${WRITER}.ran`), next: read(`${NEXT}.ran`),
      writerEnded: Number(String(read(`${WRITER}.time`)).trim()), nextStarted: Number(String(read(`${NEXT}.time`)).trim())
    };
  };
  return { ...f, project, stopAdvance };
}
// Both parts ran, and step-auto-continue's process was created only after the writer had ended.
function assertWriterFirst(result) {
  assert.deepEqual(result.ran, [WRITER, NEXT]);
  assert.ok(result.nextStarted >= result.writerEnded, `step-auto-continue started at ${result.nextStarted}, the writer ended at ${result.writerEnded}`);
}
test('stop-advance runs the progress writer, then step-auto-continue, and passes on only its answer', async () => {
  const f = await sequenceDispatcher();
  const result = f.stopAdvance(f.active);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  // The writer's stdout is dropped: the block JSON is the whole output.
  assert.equal(result.stdout, NEXT_OUTPUT);
  assertWriterFirst(result);
  assert.deepEqual(result.writer, result.event);
  assert.deepEqual(result.next, result.event);
});
test('stop-advance: a failing writer still lets step-auto-continue answer, and its exit code is returned', async () => {
  const f = await sequenceDispatcher();
  const failed = f.stopAdvance(f.active, { H50_FAKE_WRITER_EXIT: '1' });
  assert.deepEqual([failed.status, failed.stdout, failed.stderr], [0, NEXT_OUTPUT, '']);
  assertWriterFirst(failed);
  const blocked = f.stopAdvance(f.active, { H50_FAKE_NEXT_EXIT: '2' });
  assert.deepEqual([blocked.status, blocked.stdout, blocked.stderr], [2, NEXT_OUTPUT, '']);
  assertWriterFirst(blocked);
});
test('stop-advance in a paused or drifted run starts only the writer', async () => {
  const f = await sequenceDispatcher();
  const paused = f.project('paused', { ...RUN, paused: true });
  assert.equal(readRun(paused).phase, 'paused');
  // The writer fails as well: with no step-auto-continue the dispatcher still exits 0.
  const pausedStop = f.stopAdvance(paused, { H50_FAKE_WRITER_EXIT: '1' });
  assert.deepEqual([pausedStop.status, pausedStop.stdout, pausedStop.stderr, pausedStop.ran], [0, '', '', [WRITER]]);
  assert.deepEqual(pausedStop.writer, pausedStop.event);
  // The writer puts the cursor back, so the run is active afterwards; step-auto-continue still
  // stays silent because its gate failed before the writer ran.
  const drift = f.project('drift', { ...RUN, completed_steps: [2], current_step: 3 });
  assert.equal(readRun(drift).phase, 'drift');
  const driftStop = f.stopAdvance(drift, {
    H50_FAKE_PROGRESS: path.join(drift, 'step_archive', 'progress.json'),
    H50_FAKE_PROGRESS_JSON: JSON.stringify({ ...RUN, completed_steps: [2] })
  });
  assert.deepEqual([driftStop.status, driftStop.stdout, driftStop.stderr, driftStop.ran], [0, '', '', [WRITER]]);
  assert.equal(readRun(drift).phase, 'active');
});
test('stop-advance: step-auto-continue stays silent when the writer finishes the run', async () => {
  const f = await sequenceDispatcher();
  const result = f.stopAdvance(f.active, {
    H50_FAKE_PROGRESS: path.join(f.active, 'step_archive', 'progress.json'),
    H50_FAKE_PROGRESS_JSON: JSON.stringify({ ...RUN, completed_steps: ALL_STEPS, current_step: 51 })
  });
  assert.deepEqual([result.status, result.stdout, result.stderr, result.ran], [0, '', '', [WRITER]]);
  assert.equal(readRun(f.active).phase, 'finished');
});
test('stop-advance starts no part outside a Claude run', async () => {
  const f = await sequenceDispatcher();
  const projects = {
    empty: f.empty,
    'loader-created progress without step bodies': f.project('stale', RUN, { body: false }),
    'finished run': f.project('finished', { ...RUN, completed_steps: ALL_STEPS, current_step: 50 }),
    'Codex workspace': f.project('codex', RUN, { codex: true })
  };
  for (const [kind, project] of Object.entries(projects)) {
    const result = f.stopAdvance(project);
    assert.deepEqual([result.status, result.stdout, result.stderr, result.ran], [0, '', '', []], kind);
  }
});
test('stop-advance without hooks/lib starts neither part', async () => {
  const f = await sequenceDispatcher({ withLib: false });
  const result = f.stopAdvance(f.active);
  assert.deepEqual([result.status, result.stdout, result.stderr, result.ran], [0, '', '', []]);
});
// A writer that outlives its part budget: this copy of run-hook.mjs gives it 1.5 s. The fake writer
// waits on a node child that would write late.marker after 3 s, the way a slow inspector would. The
// whole part (on macOS and Linux its process group) must end, so nothing is written after
// step-auto-continue has started, and step-auto-continue still answers.
test('stop-advance: a writer past its budget is stopped with all it started, and step-auto-continue still answers', async () => {
  const f = await sequenceDispatcher();
  const copy = path.join(f.hooks, 'run-hook.mjs');
  const source = fs.readFileSync(copy, 'utf8');
  assert.match(source, /"step-progress-writer":28000/);
  fs.writeFileSync(copy, source.replace('"step-progress-writer":28000', '"step-progress-writer":1500'));
  const marker = path.join(f.hooks, 'late.marker');
  const late = "setTimeout(()=>require('fs').writeFileSync(process.argv[1],'late'),3000)";
  fs.writeFileSync(path.join(f.hooks, `${WRITER}${process.platform === 'win32' ? '.ps1' : '.sh'}`), process.platform === 'win32'
    ? `$null = [Console]::In.ReadToEnd()\n[Console]::Out.Write('writer noise' + [char]10)\n& $env:HARNESS50_NODE -e "${late}" (Join-Path $PSScriptRoot 'late.marker')\n`
    : `cat >/dev/null\necho "writer noise"\n"$HARNESS50_NODE" -e "${late}" "$(dirname "$0")/late.marker"\n`);
  const result = f.stopAdvance(f.active);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, NEXT_OUTPUT);
  assert.match(result.stderr, /step-progress-writer did not finish within 1\.5 s/);
  assert.deepEqual(result.ran, [NEXT]);
  // Past the moment the node child would have written.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000);
  assert.equal(fs.existsSync(marker), false, 'a process the stopped writer started kept running');
});
// SIGTERM forwarded during the writer ends the sequence: step-auto-continue does not start.
// Windows has no catchable SIGTERM for a child process, so this runs on macOS and Linux.
test('stop-advance: a forwarded SIGTERM during the writer starts no further part', { skip: process.platform === 'win32' }, async () => {
  const f = await sequenceDispatcher();
  fs.writeFileSync(path.join(f.hooks, `${WRITER}.sh`), `cat > "$(dirname "$0")/${WRITER}.ran"\nsleep 5\n`);
  const event = JSON.stringify({ hook_event_name: 'Stop', session_id: 's', stop_hook_active: false, cwd: f.active });
  const child = spawn(process.execPath, [path.join(f.hooks, 'run-hook.mjs'), 'stop-advance'], { env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stdin.end(event);
  const ranFile = path.join(f.hooks, `${WRITER}.ran`);
  for (let waited = 0; !fs.existsSync(ranFile) && waited < 20000; waited += 100) await new Promise(resolve => setTimeout(resolve, 100));
  child.kill('SIGTERM');
  const code = await new Promise(resolve => child.once('close', resolve));
  assert.equal(code, 143);
  assert.equal(stdout, '');
  assert.equal(fs.existsSync(path.join(f.hooks, `${NEXT}.ran`)), false);
});

// Watchdog fixtures use hooks the dispatcher always starts (the two guards), so a copy of
// run-hook.mjs without hooks/lib next to it still spawns them.
async function dispatcherCopy(fixtures) {
  const root = path.join(await makeWorkspace(), 'hooks');
  copyDispatcher(path.join(root, 'run-hook.mjs'));
  for (const [file, text] of Object.entries(fixtures)) fs.writeFileSync(path.join(root, file), text);
  return root;
}
// True when the process recorded in file no longer exists. A survivor is ended at once so a
// failing run does not leave it behind.
function ended(file) {
  const pid = Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
  assert.ok(Number.isInteger(pid) && pid > 0, `pid file ${file}`);
  try {
    process.kill(pid, 0);
  } catch (error) {
    return error.code === 'ESRCH';
  }
  try { process.kill(pid); } catch {}
  return false;
}
test('dispatcher stops a hook that outlives its budget and leaves no child', async () => {
  const windows = process.platform === 'win32';
  const root = await dispatcherCopy(windows
    ? { 'permission-request-guard.ps1': "Set-Content -LiteralPath (Join-Path $PSScriptRoot 'child.pid') -Value $PID\nStart-Sleep -Seconds 60\n" }
    : { 'permission-request-guard.sh': 'echo $$ > "$(dirname "$0")/child.pid"; exec sleep 60\n' });
  const pidFile = path.join(root, 'child.pid');
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(root, 'run-hook.mjs'), 'permission-request-guard'], { input: '{}', encoding: 'utf8', timeout: 20000 });
  const elapsed = Date.now() - started;
  assert.ok(ended(pidFile), 'the hook process is still running');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /permission-request-guard did not finish within 4\.5 s/);
  assert.ok(elapsed < 10000, `returned after ${elapsed} ms`);
});
test('stdin that never ends cannot hold a hook past its budget', async () => {
  const windows = process.platform === 'win32';
  const root = await dispatcherCopy(windows
    ? { 'destructive-guard.ps1': '$null = [Console]::In.ReadToEnd()\n' }
    : { 'destructive-guard.sh': 'exec cat >/dev/null\n' });
  const child = spawn(process.execPath, [path.join(root, 'run-hook.mjs'), 'destructive-guard'], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  // An unfinished event and no end of input: the hook would wait forever on its own.
  child.stdin.write('{"tool_name":"Bash"');
  let timer;
  try {
    const code = await Promise.race([
      new Promise(resolve => child.once('close', resolve)),
      new Promise(resolve => { timer = setTimeout(() => resolve('still running'), 10000); })
    ]);
    assert.equal(code, 2, stderr);
    assert.equal(stdout, '');
    assert.match(stderr, /destructive-guard did not finish within 4\.5 s/);
  } finally {
    clearTimeout(timer);
    child.stdin.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
});
test('the watchdog also ends processes the PowerShell hook started', { skip: process.platform !== 'win32' }, async () => {
  const root = await dispatcherCopy({});
  const pidFile = path.join(root, 'grandchild.pid');
  const node = process.execPath.replaceAll("'", "''");
  const script = `require('fs').writeFileSync('${pidFile.replaceAll('\\', '/')}', String(process.pid)); setTimeout(() => {}, 60000)`;
  fs.writeFileSync(path.join(root, 'permission-request-guard.ps1'),
    `$raw = [Console]::In.ReadToEnd()\n$x = $raw | & '${node}' -e "${script}" 2>$null\n`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(root, 'run-hook.mjs'), 'permission-request-guard'], { input: '{}', encoding: 'utf8', timeout: 20000 });
  const elapsed = Date.now() - started;
  assert.ok(ended(pidFile), 'the node started by PowerShell is still running');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /permission-request-guard did not finish within 4\.5 s/);
  // Without the tree kill the node started by PowerShell keeps the output pipe open for 20 s.
  assert.ok(elapsed < 10000, `returned after ${elapsed} ms`);
});
