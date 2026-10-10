import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { installPlugin, tempRoot, runClaudeHook, gitBash, windows } from './helpers/claude-hooks.mjs';
import { readRun, shouldRunHook } from '../../hooks/lib/harness-activity.mjs';
import { summarizeState } from '../../hooks/lib/codex-workflow.mjs';
import { prepareQuality, prepareFinalRegression } from './helpers/completion-quality.mjs';
import { completionHtml, passingBrowserReport } from './helpers/routing.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
import { hasCompleteTopicContract } from '../../scripts/lib/topic-contract.mjs';
import { spawnSync } from 'node:child_process';

const variants = windows ? ['ps1', ...(gitBash ? ['sh'] : [])] : ['sh'];
const planning = 'planning-first-20-v1';
const fresh = 'planning-first-14-v1';
const readProgress = root => JSON.parse(readFileSync(join(root, 'step_archive/progress.json'), 'utf8'));
const codexState = (profile, total, extra = {}) => ({ schema_version: 2, workflow_profile: profile,
  workflow_id: 'planning-hook-fixture', total_steps: total, status: 'running', current_step: 1, completed_steps: [], ...extra });

function seedOldRun(plugin, root, profile) {
  const legacy = profile === 'legacy-50-v1'; const total = legacy ? 50 : 36;
  const directory = legacy ? 'step_archive/archived' : `step_archive/profiles/${profile}/archived`;
  mkdirSync(join(root, directory), { recursive: true });
  for (let step = 1; step <= total; step++) {
    const name = `step${String(step).padStart(3, '0')}.md`;
    copyFileSync(join(plugin, legacy ? 'assets/steps' : `assets/profiles/${profile}/steps`, name), join(root, directory, name));
  }
  const state = { current_step: 2, completed_steps: [1], skipped_steps: [], failed_steps: [], total_steps: total,
    run_started_at: '2026-10-04T00:00:00.000Z', session_history: [], metrics: {} };
  if (!legacy) {
    Object.assign(state, { schema_version: 2, workflow_profile: profile });
    writeFileSync(join(root, 'step_archive/workflow-profile.json'), JSON.stringify({ schema_version: 2, workflow_profile: profile, total_steps: total }));
  }
  writeFileSync(join(root, 'step_archive/progress.json'), JSON.stringify(state));
  mkdirSync(join(root, 'step_archive/TOPIC'), { recursive: true });
  writeFileSync(join(root, 'step_archive/TOPIC/TOPIC.md'), '# Existing request\nRetain this original topic.\n');
  return { state, directory };
}

test('Codex ownership recognizes planning20 while retaining explicit36 and legacy50', () => {
  for (const [profile, total] of [[planning, 20], ['research-free-36-v1', 36], ['legacy-50-v1', 50]]) {
    assert.deepEqual(summarizeState(codexState(profile, total)), { kind: 'valid', workflowId: 'planning-hook-fixture',
      status: 'running', step: 1, completed: 0, total, workflowProfile: profile });
    const done = summarizeState(codexState(profile, total, { status: 'completed', current_step: null,
      completed_steps: Array.from({ length: total }, (_, i) => i + 1) }));
    assert.equal(done.kind, 'valid'); assert.equal(done.step, total);
  }
  const { workflow_profile, ...legacy } = codexState('legacy-50-v1', 50, { schema_version: 1 });
  assert.equal(summarizeState(legacy).kind, 'valid');
});

test('Codex ownership rejects mixed profile counts, invented earlier completion and unsupported schemas', () => {
  for (const state of [codexState(planning, 36), codexState('research-free-36-v1', 20), codexState('legacy-50-v1', 20),
    codexState(planning, 20, { schema_version: 1 }), codexState(planning, 20, { schema_version: 3 }),
    codexState('unknown-profile', 20), codexState(planning, 20, { total_steps: '20' }),
    codexState(planning, 20, { current_step: 17 }), codexState(planning, 20, { completed_steps: [2], current_step: 3 })]) {
    assert.equal(summarizeState(state).kind, 'invalid', JSON.stringify(state));
  }
});

for (const owner of ['codex20', 'claude36']) test(`direct topic initialization refuses ${owner} without changing frozen data`, t => {
  const base = tempRoot(t, 'h36-topic-owner-'); const plugin = installPlugin(base);
    const root = join(base, owner); mkdirSync(root);
    seedOldRun(plugin, root, 'research-free-36-v1');
    const protectedFiles = ['step_archive/TOPIC/TOPIC.md', 'step_archive/progress.json', 'step_archive/workflow-profile.json'];
    if (owner === 'codex20') {
      mkdirSync(join(root, 'step_archive/.harness50-codex'));
      const file = 'step_archive/.harness50-codex/state.json';
      writeFileSync(join(root, file), JSON.stringify(codexState(planning, 20))); protectedFiles.push(file);
    }
    const before = protectedFiles.map(file => readFileSync(join(root, file)));
    const result = spawnSync(process.execPath, [join(plugin, 'hooks/lib/workflow-profile.mjs'), 'topic', root], {
      input: JSON.stringify({ prompt: '/webapp Unauthorized topic replacement' }), encoding: 'utf8'
    });
    assert.equal(result.status, 1, `${owner}: ${result.stderr}`);
    protectedFiles.forEach((file, index) => assert.deepEqual(readFileSync(join(root, file)), before[index], `${owner}: ${file}`));
});

for (const variant of variants) {
  const run = (plugin, name, root, event = {}) => {
    const result = runClaudeHook(plugin, name, { cwd: root, ...event }, { variant, stripCR: true });
    assert.equal(result.status, 0, `${name}.${variant}: ${result.stderr}`); return result.stdout;
  };
  const complete = (plugin, root, step, total) => {
    // The native writer uses a machine-wide mutex; another test fixture may briefly hold it.
    for (let attempt = 1; attempt <= 5; attempt++) {
      run(plugin, 'step-progress-writer', root, { last_assistant_message: `Step ${step}/${total} 완료` });
      if (readProgress(root).completed_steps.includes(step)) return;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 * attempt);
    }
    assert.fail(`Step ${step}/${total} was not recorded`);
  };
  test(`${variant} fresh planning14 starts without removed preflight artifacts and follows selected instructions`, t => {
    const base = tempRoot(t, 'h36-planning-hooks-'); const plugin = installPlugin(base);
    const root = join(base, 'project'); mkdirSync(root);
    const trigger = run(plugin, 'webapp-trigger', root, { prompt: '/harness20:webapp Requirements planning fixture' });
    const state = readProgress(root);
    assert.equal(state.workflow_profile, fresh); assert.equal(state.total_steps, 14);
    assert.equal(state.schema_version, 2); assert.equal(state.current_step, 1); assert.deepEqual(state.completed_steps, []);
    const topic = readFileSync(join(root, 'step_archive/TOPIC/TOPIC.md'), 'utf8');
    assert.match(topic, /Requirements planning fixture/);
    assert.equal(hasCompleteTopicContract(topic), true, 'Planning begins with the frozen six-field contract');
    assert.match(trigger, /required-input-missing/);
    const directory = `step_archive/profiles/${fresh}/archived`;
    assert.equal(readdirSync(join(root, directory)).filter(name => /^step\d{3}\.md$/.test(name)).length, 14);
    assert.equal(existsSync(join(root, 'step_archive/step016_gate_status.md')), false);
    assert.equal(existsSync(join(root, 'step_archive/step001_preflight.md')), false);
    assert.equal(readRun(root).phase, 'active');
    for (const name of ['step-progress-loader', 'spec-generator', 'step-progress-writer', 'step-auto-continue']) {
      assert.equal(shouldRunHook(name, JSON.stringify({ cwd: root }), { CLAUDE_PROJECT_DIR: '' }), true, name);
    }
    assert.match(trigger, /total=14/); assert.match(trigger, /001\/14/); assert.match(trigger, /step014/);
    assert.match(trigger, /profiles\/planning-first-14-v1\/archived\/step001\.md/);
    assert.doesNotMatch(trigger, /research-free-36-v1|step036|001\/36/);
    assert.match(run(plugin, 'step-progress-loader', root), /profiles\/planning-first-14-v1\/archived\/step001\.md/);
    // Prior flat archives remain history and cannot change a profile's instruction count.
    const oldFlat = join(root, 'step_archive/step050.md');
    writeFileSync(oldFlat, '# Preserved legacy instruction\n');
    const oldBytes = readFileSync(oldFlat);
    assert.doesNotMatch(run(plugin, 'step-progress-loader', root), /total_steps mismatch/);
    assert.deepEqual(readFileSync(oldFlat), oldBytes);
    run(plugin, 'spec-generator', root);
    const spec = readFileSync(join(root, 'step_archive/specs/SPEC-001.md'), 'utf8');
    assert.match(spec, /workflow_profile: planning-first-14-v1/);
    assert.match(spec, /profiles\/planning-first-14-v1\/archived\/step001\.md/);
    complete(plugin, root, 1, 14);
    assert.deepEqual(readProgress(root).completed_steps, [1]);
    assert.match(run(plugin, 'step-auto-continue', root), /profiles\/planning-first-14-v1\/archived\/step002\.md/);
    for (const step of [4, 5, 8, 10, 11, 12, 14]) {
      writeFileSync(join(root, 'step_archive/progress.json'), JSON.stringify({ ...state, current_step: step,
        completed_steps: Array.from({ length: step - 1 }, (_, i) => i + 1) }));
      run(plugin, 'step-progress-writer', root, { last_assistant_message: `Step ${step}/14 완료` });
      assert.equal(readProgress(root).completed_steps.includes(step), false, `Gate ${step} requires measured evidence`);
    }
  });

  test(`${variant} old36 and unmarked50 resume without selecting the new default or rewriting the topic`, t => {
    const base = tempRoot(t, 'h36-old-hook-resume-'); const plugin = installPlugin(base);
    for (const profile of ['research-free-36-v1', 'legacy-50-v1']) {
      const root = join(base, profile); mkdirSync(root); const { state, directory } = seedOldRun(plugin, root, profile);
      const topic = readFileSync(join(root, 'step_archive/TOPIC/TOPIC.md'));
      const loader = run(plugin, 'step-progress-loader', root); assert.ok(loader.includes(`${directory}/step002.md`), loader);
      assert.equal(readRun(root).phase, 'active');
      assert.match(run(plugin, 'webapp-trigger', root, { prompt: '/webapp Different request' }), new RegExp(`already records 1/${state.total_steps}`));
      assert.deepEqual(readFileSync(join(root, 'step_archive/TOPIC/TOPIC.md')), topic);
      run(plugin, 'spec-generator', root);
      if (state.total_steps === 36) assert.match(readFileSync(join(root, 'step_archive/specs/SPEC-002.md'), 'utf8'), /workflow_profile: research-free-36-v1/);
      complete(plugin, root, 2, state.total_steps);
      assert.deepEqual(readProgress(root).completed_steps, [1, 2]);
      assert.ok(run(plugin, 'step-auto-continue', root).includes(`${directory}/step003.md`));
      assert.equal(readProgress(root).total_steps, state.total_steps);
    }
  });

  test(`${variant} native initialization freezes explicit six-field requests and normalizes unspecified fields before planning`, t => {
    const base = tempRoot(t, 'h36-topic-contract-'); const plugin = installPlugin(base);
    const incompleteRoot = join(base, 'incomplete'); mkdirSync(incompleteRoot);
    const raw = '/harness20:webapp Plan a dashboard from the supplied requirements';
    run(plugin, 'webapp-trigger', incompleteRoot, { prompt: raw });
    const normalized = readFileSync(join(incompleteRoot, 'step_archive/TOPIC/TOPIC.md'), 'utf8');
    assert.equal(hasCompleteTopicContract(normalized), true);
    assert.match(normalized, /## original_request/); assert.ok(normalized.includes(raw));
    assert.match(normalized, /## initialization_notes/);
    for (const field of ['topic', 'audience', 'interactive', 'real_world_apps', 'constraints', 'decisions']) {
      assert.ok(normalized.includes(`## ${field}\n`), field);
    }
    const completeRoot = join(base, 'complete [20]'); mkdirSync(completeRoot);
    const explicit = '/webapp Preserve explicit requirements\n\n## topic\n\nPlant dashboard\n\n## audience\n\nPlant engineers\n\n' +
      '## interactive\n\nKeyboard filtering\n\n## real_world_apps\n\nUse only supplied examples\n\n' +
      '## constraints\n\nKeep the approved offline scope\n\n## decisions\n\nUse the supplied requirements verbatim\n';
    run(plugin, 'webapp-trigger', completeRoot, { prompt: explicit });
    const frozen = readFileSync(join(completeRoot, 'step_archive/TOPIC/TOPIC.md'), 'utf8');
    assert.equal(hasCompleteTopicContract(frozen), true);
    assert.equal(frozen, explicit, 'Already-complete requests retain every original byte');
    const progressBefore = readFileSync(join(completeRoot, 'step_archive/progress.json'));
    run(plugin, 'spec-generator', completeRoot);
    assert.equal(readFileSync(join(completeRoot, 'step_archive/TOPIC/TOPIC.md'), 'utf8'), explicit);
    assert.deepEqual(readFileSync(join(completeRoot, 'step_archive/progress.json')), progressBefore);
  });

  test(`${variant} conflicting profile binding never activates or advances a mixed run`, t => {
    const base = tempRoot(t, 'h36-mixed-hooks-'); const plugin = installPlugin(base);
    const root = join(base, 'project'); mkdirSync(root);
    const { state } = seedOldRun(plugin, root, 'research-free-36-v1');
    writeFileSync(join(root, 'step_archive/progress.json'), JSON.stringify({ ...state, workflow_profile: planning, total_steps: 20 }));
    const before = readFileSync(join(root, 'step_archive/progress.json'));
    assert.equal(readRun(root).phase, 'invalid');
    for (const name of ['step-progress-loader', 'spec-generator', 'step-progress-writer', 'step-auto-continue']) {
      run(plugin, name, root, { last_assistant_message: 'Step 002/20 완료' });
      assert.deepEqual(readFileSync(join(root, 'step_archive/progress.json')), before, name);
    }
    assert.equal(existsSync(join(root, 'step_archive/specs/SPEC-002.md')), false);
    assert.match(run(plugin, 'webapp-trigger', root, { prompt: '/webapp Different request' }), /invalid/);
    assert.deepEqual(readFileSync(join(root, 'step_archive/progress.json')), before);
  });

  test(`${variant} planning14 final completion requires and accepts current measured browser and six-matrix evidence`, async t => {
    const base = tempRoot(t, 'h36-planning20-final-'); const plugin = installPlugin(base);
    const root = join(base, 'project'); mkdirSync(root);
    run(plugin, 'webapp-trigger', root, { prompt: '/webapp Measured final fixture' });
    const state = readProgress(root);
    writeFileSync(join(root, 'step_archive/progress.json'), JSON.stringify({ ...state, current_step: 14,
      completed_steps: Array.from({ length: 13 }, (_, i) => i + 1) }));
    mkdirSync(join(root, 'dist')); mkdirSync(join(root, 'step_archive/outputs'));
    writeFileSync(join(root, 'dist/index.html'), completionHtml);
    writeFileSync(join(root, 'step_archive/outputs/browser-output.json'), JSON.stringify(passingBrowserReport(sha256(completionHtml))));
    await prepareFinalRegression(root, { workflowProfile: fresh });
    await prepareQuality(root);
    complete(plugin, root, 14, 14);
    assert.deepEqual(readProgress(root).completed_steps, Array.from({ length: 14 }, (_, i) => i + 1));
    assert.equal(readRun(root).phase, 'finished');
    assert.equal(run(plugin, 'step-auto-continue', root).trim(), '');
  });

  test(`${variant} planning20 Codex ownership leaves every Claude state and instruction untouched`, t => {
    const base = tempRoot(t, 'h36-codex20-hook-'); const plugin = installPlugin(base);
    const root = join(base, 'project'); mkdirSync(root);
    seedOldRun(plugin, root, 'research-free-36-v1');
    mkdirSync(join(root, 'step_archive/.harness50-codex'));
    const codexFile = join(root, 'step_archive/.harness50-codex/state.json');
    writeFileSync(codexFile, JSON.stringify(codexState(planning, 20)));
    const progressBefore = readFileSync(join(root, 'step_archive/progress.json')); const codexBefore = readFileSync(codexFile);
    const loader = run(plugin, 'step-progress-loader', root);
    assert.match(loader, /Codex workflow .*step 1\/20/); assert.doesNotMatch(loader, /WARNING/);
    for (const name of ['webapp-trigger', 'spec-generator', 'step-progress-writer', 'step-auto-continue']) {
      run(plugin, name, root, { prompt: '/webapp Different request', last_assistant_message: 'Step 001/20 완료' });
      assert.deepEqual(readFileSync(join(root, 'step_archive/progress.json')), progressBefore, name);
      assert.deepEqual(readFileSync(codexFile), codexBefore, name);
    }
    assert.equal(existsSync(join(root, 'step_archive/specs/SPEC-001.md')), false);
  });
}
