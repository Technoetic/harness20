import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, existsSync, writeFileSync, copyFileSync, readdirSync, unlinkSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { installPlugin, tempRoot, runClaudeHook } from './helpers/claude-hooks.mjs';
import { readRun } from '../../hooks/lib/harness-activity.mjs';
import { spawnSync } from 'node:child_process';
import { snapshotQa, recordQa, inspectQa } from '../../scripts/lib/qa-report.mjs';
import { prepareQuality, prepareFinalRegression } from './helpers/completion-quality.mjs';
import { completionHtml, passingBrowserReport } from './helpers/routing.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';

// Explicit existing36 fixture: changing the fresh default must never reinterpret this run.
function existing36(plugin, root, topic) {
  const directory = join(root, 'step_archive/profiles/research-free-36-v1/archived');
  mkdirSync(directory, { recursive: true });
  for (let step = 1; step <= 36; step++) {
    const name = `step${String(step).padStart(3, '0')}.md`;
    copyFileSync(join(plugin, 'assets/profiles/research-free-36-v1/steps', name), join(directory, name));
  }
  const identity = { schema_version: 2, workflow_profile: 'research-free-36-v1', total_steps: 36 };
  writeFileSync(join(root, 'step_archive/workflow-profile.json'), JSON.stringify(identity));
  writeFileSync(join(root, 'step_archive/progress.json'), JSON.stringify({ ...identity,
    run_started_at: '2026-10-04T00:00:00.000Z', current_step: 1, completed_steps: [], skipped_steps: [],
    failed_steps: [], session_history: [], metrics: { total_sessions: 0 } }));
  mkdirSync(join(root, 'step_archive/TOPIC'), { recursive: true });
  writeFileSync(join(root, 'step_archive/TOPIC/TOPIC.md'), `# Existing36 topic\n${topic}\n`);
}

function recordSuccessfulStep(plugin, root, step) {
  // A parallel fixture may hold the native writer's machine-wide mutex. It defers safely;
  // wait for an actual recorded completion without weakening any gate or completion assertion.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = runClaudeHook(plugin, 'step-progress-writer', { cwd: root, last_assistant_message: `Step ${step}/36 완료` });
    assert.equal(result.status, 0, result.stderr);
    const state = JSON.parse(readFileSync(join(root, 'step_archive/progress.json'), 'utf8'));
    if (state.completed_steps.includes(step)) return result;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 * attempt);
  }
  assert.fail(`Step ${step}/36 was not recorded after bounded native writer attempts`);
}

test('explicit native Claude36 resumes profile-only archived instructions', t => {
  const base = tempRoot(t, 'h50-profile-'); const plugin = installPlugin(base);
  const root = join(base, 'project'); mkdirSync(root);
  existing36(plugin, root, 'Profile fixture');
  const state = JSON.parse(readFileSync(join(root, 'step_archive/progress.json'), 'utf8'));
  assert.equal(state.total_steps, 36);
  assert.equal(state.workflow_profile, 'research-free-36-v1');
  assert.equal(state.schema_version, 2);
  assert.equal(existsSync(join(root, 'step_archive/archived/step017.md')), false);
  assert.equal(existsSync(join(root, 'step_archive/profiles/research-free-36-v1/archived/step017.md')), true);
  assert.equal(readRun(root).phase, 'active');
  const loader = runClaudeHook(plugin, 'step-progress-loader', { cwd: root });
  assert.match(loader.stdout, /profiles\/research-free-36-v1\/archived\/step001\.md/);
  const writer = recordSuccessfulStep(plugin, root, 1);
  assert.equal(writer.status, 0, writer.stderr);
  const read = () => JSON.parse(readFileSync(join(root, 'step_archive/progress.json'), 'utf8'));
  assert.deepEqual(read().completed_steps, [1]);
  const continuation = runClaudeHook(plugin, 'step-auto-continue', { cwd: root });
  assert.match(continuation.stdout, /profiles\/research-free-36-v1\/archived\/step002\.md/);
  mkdirSync(join(root, 'step_archive/archived'), { recursive: true });
  copyFileSync(join(plugin, 'assets/steps/step002.md'), join(root, 'step_archive/archived/step002.md'));
  const { schema_version, workflow_profile, ...unmarked } = read();
  writeFileSync(join(root, 'step_archive/progress.json'), JSON.stringify({ ...unmarked, total_steps: 50 }));
  assert.equal(readRun(root).phase, 'invalid', 'Editing both profile and count cannot select an old coexisting archive');
  for (const step of [26, 27, 30, 32, 33, 34, 36]) {
    writeFileSync(join(root, 'step_archive/progress.json'), JSON.stringify({ ...state,
      current_step: step, completed_steps: Array.from({ length: step - 1 }, (_, i) => i + 1) }));
    const result = runClaudeHook(plugin, 'step-progress-writer', { cwd: root, last_assistant_message: `Step ${step}/36 완료` });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(read().completed_steps.includes(step), false, `Gate ${step} cannot be bypassed with total36`);
  }
  copyFileSync(join(plugin, 'assets/steps/step036.md'), join(root, 'step_archive/profiles/research-free-36-v1/archived/step036.md'));
  assert.equal(readRun(root).phase, 'invalid');
  const before = readFileSync(join(root, 'step_archive/progress.json'));
  runClaudeHook(plugin, 'step-progress-writer', { cwd: root, last_assistant_message: 'Step 036/36 완료' });
  assert.deepEqual(readFileSync(join(root, 'step_archive/progress.json')), before);
});
test('Claude36 pause resume returns selected body; reset preserves profile and isolates previous QA', async t => {
  const base = tempRoot(t, 'h50-profile-reset-'); const plugin = installPlugin(base);
  const root = join(base, 'project'); mkdirSync(root);
  existing36(plugin, root, 'Reset fixture');
  const file = join(root, 'step_archive/progress.json');
  const state = JSON.parse(readFileSync(file, 'utf8'));
  const cli = (command, ...extra) => {
    const result = spawnSync(process.execPath, [join(plugin, 'scripts/harness-pause.mjs'), command, '--workspace', root, ...extra], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
  };
  cli('pause', '--reason', 'user-request', '--note', 'Pause fixture');
  const resumed = cli('resume');
  assert.equal(resumed.total, 36);
  assert.equal(resumed.step_body, 'step_archive/profiles/research-free-36-v1/archived/step001.md');
  writeFileSync(join(root, 'app.js'), 'candidate'); mkdirSync(join(root, 'step_archive/outputs'));
  writeFileSync(join(root, 'step_archive/outputs/test.md'), 'observed');
  const snap = await snapshotQa(root, 27, { artifacts: ['app.js'], checks: [{ id: 'layout', requirement: 'Correct.' }] });
  await recordQa(root, 27, { snapshot_id: snap.snapshot_id, verifier: { id: 'reviewer', mode: 'independent' },
    outcomes: [{ id: 'layout', status: 'pass', observation: 'Correct.', evidence_paths: ['step_archive/outputs/test.md'], next_check: '' }], next_actions: [] });
  assert.equal((await inspectQa(root, 27)).verdict, 'PASS');
  writeFileSync(file, JSON.stringify({ ...state, current_step: 27, completed_steps: Array.from({ length: 26 }, (_, i) => i + 1) }));
  const completedQa = recordSuccessfulStep(plugin, root, 27);
  assert.equal(completedQa.status, 0, completedQa.stderr);
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).completed_steps.includes(27), 'A hooks+scripts-only install can inspect and accept current QA');
  const reset = cli('reset');
  assert.equal(reset.total, 36); assert.equal(reset.paused, true);
  assert.equal(reset.workflow_profile, 'research-free-36-v1');
  assert.notEqual(JSON.parse(readFileSync(file, 'utf8')).run_started_at, state.run_started_at);
  assert.equal((await inspectQa(root, 27)).status, 'missing');
  const invalid = { ...state, total_steps: 50 }; writeFileSync(file, JSON.stringify(invalid));
  const refused = spawnSync(process.execPath, [join(plugin, 'scripts/harness-pause.mjs'), 'reset', '--workspace', root], { encoding: 'utf8' });
  assert.equal(refused.status, 2); assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), invalid);
});
test('new36 native SPEC publication preserves old bytes and replaces stale profile and reset generation hints', t => {
  const base = tempRoot(t, 'h50-profile-spec-'); const plugin = installPlugin(base);
  const root = join(base, 'project'); mkdirSync(root);
  existing36(plugin, root, 'SPEC fixture');
  const progressFile = join(root, 'step_archive/progress.json');
  const state = JSON.parse(readFileSync(progressFile, 'utf8'));
  mkdirSync(join(root, 'step_archive/specs'));
  const old = '# Legacy SPEC17\nOriginal research step, immutable history.\n';
  const specFile = join(root, 'step_archive/specs/SPEC-017.md'); writeFileSync(specFile, old);
  writeFileSync(progressFile, JSON.stringify({ ...state, current_step: 17, completed_steps: Array.from({ length: 16 }, (_, i) => i + 1) }));
  for (let i = 0; i < 2; i++) runClaudeHook(plugin, 'spec-generator', { cwd: root });
  const current = readFileSync(specFile, 'utf8');
  assert.match(current, /workflow_profile: research-free-36-v1/);
  assert.match(current, /profiles\/research-free-36-v1\/archived\/step017\.md/);
  const history = join(root, 'step_archive/specs/history');
  const saved = readdirSync(history).flatMap(hash => readdirSync(join(history, hash)).map(file => readFileSync(join(history, hash, file), 'utf8')));
  assert.ok(saved.includes(old));
  writeFileSync(progressFile, JSON.stringify({ ...state, current_step: 17, completed_steps: Array.from({ length: 16 }, (_, i) => i + 1), run_started_at: '2026-10-03T00:00:00.000Z' }));
  for (let i = 0; i < 2; i++) runClaudeHook(plugin, 'spec-generator', { cwd: root });
  assert.notEqual(readFileSync(specFile, 'utf8'), current);
});
test('native final36 records only current measured browser and six-matrix evidence', async t => {
  const base = tempRoot(t, 'h50-profile-final-'); const plugin = installPlugin(base);
  const root = join(base, 'project'); mkdirSync(root);
  existing36(plugin, root, 'Final fixture');
  const file = join(root, 'step_archive/progress.json'); const state = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...state, current_step: 36, completed_steps: Array.from({ length: 35 }, (_, i) => i + 1) }));
  mkdirSync(join(root, 'dist')); mkdirSync(join(root, 'step_archive/outputs'));
  writeFileSync(join(root, 'dist/index.html'), completionHtml);
  writeFileSync(join(root, 'step_archive/outputs/browser-output.json'), JSON.stringify(passingBrowserReport(sha256(completionHtml))));
  await prepareFinalRegression(root, { workflowProfile: 'research-free-36-v1' });
  await prepareQuality(root);
  const result = recordSuccessfulStep(plugin, root, 36);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).completed_steps.length, 36);
  assert.equal(readRun(root).phase, 'finished');
  assert.equal(runClaudeHook(plugin, 'step-auto-continue', { cwd: root }).stdout.trim(), '');
  unlinkSync(join(root, 'step_archive/workflow-profile.json'));
  assert.equal(readRun(root).phase, 'invalid', 'Missing new binding must not report a completed valid run');
  assert.equal((await inspectQa(root, 36)).status, 'invalid');
});
test('native bootstrap refuses an aliased binding before publishing topic progress or bodies', t => {
  const base = tempRoot(t, 'h50-profile-binding-'); const plugin = installPlugin(base);
  const root = join(base, 'project'); mkdirSync(join(root, 'step_archive'), { recursive: true });
  const outside = join(base, 'binding.json'); const bytes = JSON.stringify({ schema_version: 2, workflow_profile: 'research-free-36-v1', total_steps: 36 });
  writeFileSync(outside, bytes); linkSync(outside, join(root, 'step_archive/workflow-profile.json'));
  const result = runClaudeHook(plugin, 'webapp-trigger', { cwd: root, prompt: '/webapp Binding fixture' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bootstrap failed/);
  assert.deepEqual(readdirSync(join(root, 'step_archive')), ['workflow-profile.json']);
  assert.equal(readFileSync(outside, 'utf8'), bytes);
});
