import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';
import { snapshotQa, recordQa, inspectQa } from '../../scripts/lib/qa-report.mjs';
import { inspectQualityReport } from '../../scripts/lib/quality.mjs';
import { prepareQuality } from './helpers/completion-quality.mjs';
import { prepareJevJudgment } from '../../scripts/lib/jev-judge.mjs';
import { runJevJudgment, inspectJevJudgment } from '../../scripts/lib/jev-judge.mjs';
import { writeFinalSummary } from '../../scripts/lib/final-summary.mjs';
import { workflowContext, recheckWorkflowContext } from '../../scripts/lib/workflow-context.mjs';
import { createInitialState, validateState } from '../scripts/lib/schema.mjs';

const profile = 'research-free-36-v1';
async function progress(root, overrides = {}) {
  await mkdir(join(root, 'step_archive'), { recursive: true });
  await writeFile(join(root, 'step_archive/workflow-profile.json'), JSON.stringify({ schema_version: 2, workflow_profile: profile, total_steps: 36 }));
  await writeFile(join(root, 'step_archive/progress.json'), JSON.stringify({ schema_version: 2,
    workflow_profile: profile, total_steps: 36, current_step: 27, completed_steps: [],
    run_started_at: '2026-10-02T01:00:00.000Z', ...overrides }));
}
async function candidate() {
  const root = await makeWorkspace();
  await mkdir(join(root, 'step_archive/outputs'), { recursive: true });
  await writeFile(join(root, 'app.js'), 'candidate');
  await writeFile(join(root, 'step_archive/outputs/observed.md'), 'Observed candidate.');
  return root;
}
async function assessment(root, step) {
  const snapshot = await snapshotQa(root, step, { artifacts: ['app.js'], checks: [{ id: 'layout', requirement: 'Correct layout.' }] });
  await recordQa(root, step, { snapshot_id: snapshot.snapshot_id, verifier: { id: 'reviewer', mode: 'independent' },
    outcomes: [{ id: 'layout', status: 'pass', observation: 'Correct.', evidence_paths: ['step_archive/outputs/observed.md'], next_check: '' }], next_actions: [] });
  return snapshot;
}
test('new profile cannot inherit same-number legacy QA or a previous run generation', async () => {
  const root = await candidate();
  await assessment(root, 27);
  await progress(root);
  assert.equal((await inspectQa(root, 27)).status, 'missing');
  await assessment(root, 27);
  const current = await inspectQa(root, 27);
  assert.equal(current.verdict, 'PASS');
  assert.match(current.report_path, /research-free-36-v1\/[a-f0-9]{64}\//);
  await progress(root, { run_started_at: '2026-10-02T02:00:00.000Z' });
  assert.equal((await inspectQa(root, 27)).status, 'missing');
});
test('new measured quality is bound to current profile and generation even with unchanged source', async () => {
  const root = await candidate();
  await progress(root);
  await prepareQuality(root);
  assert.equal((await inspectQualityReport(root)).verdict, 'PASS');
  assert.equal((await inspectQualityReport(root, { workflowProfile: 'legacy-50-v1' })).verdict, 'INCOMPLETE');
  await progress(root, { run_started_at: '2026-10-02T02:00:00.000Z' });
  assert.equal((await inspectQualityReport(root)).verdict, 'INCOMPLETE');
});
test('actual invalid or conflicting profile metadata rejects QA writes and reads', async () => {
  const root = await candidate();
  await assessment(root, 27);
  await progress(root, { total_steps: 50 });
  assert.equal((await inspectQa(root, 27)).status, 'invalid');
  await assert.rejects(() => assessment(root, 27));
});

for (const file of ['progress.json', '.harness50-codex/state.json']) {
  for (const value of [null, false, 0, '']) {
    test(`present ${file} containing ${JSON.stringify(value)} cannot fall back to legacy evidence`, async () => {
      const root = await candidate();
      await assessment(root, 27);
      const before = await workflowContext(root);
      assert.equal((await inspectQa(root, 27)).verdict, 'PASS');
      await mkdir(join(root, 'step_archive/.harness50-codex'), { recursive: true });
      await writeFile(join(root, 'step_archive', file), JSON.stringify(value));
      assert.equal((await inspectQa(root, 27)).status, 'invalid');
      await assert.rejects(() => workflowContext(root));
      await assert.rejects(() => recheckWorkflowContext(root, before));
      await assert.rejects(() => assessment(root, 27));
    });
  }
}

for (const marker of [
  { schema_version: 2, workflow_profile: profile, total_steps: 36 },
  { schema_version: 999 }
]) {
  test(`orphan profile marker schema${marker.schema_version} cannot reactivate legacy QA`, async () => {
    const root = await candidate();
    await assessment(root, 27);
    const before = await workflowContext(root);
    await writeFile(join(root, 'step_archive/workflow-profile.json'), JSON.stringify(marker));
    assert.equal((await inspectQa(root, 27)).status, 'invalid');
    await assert.rejects(() => workflowContext(root));
    await assert.rejects(() => recheckWorkflowContext(root, before));
    await assert.rejects(() => assessment(root, 27));
    const summary = await writeFinalSummary(root);
    assert.match(summary.text, /workflow profile\/generation \(형식 오류\)/);
    assert.doesNotMatch(summary.text, /step050\.latest/);
  });
}

test('a genuinely metadata-free legacy evidence workspace retains its exact fallback', async () => {
  const root = await candidate();
  await assessment(root, 27);
  const context = await workflowContext(root);
  assert.equal(context.profile.id, 'legacy-50-v1');
  assert.equal(context.generation, null);
  assert.equal((await inspectQa(root, 27)).verdict, 'PASS');
});

for (const workflowProfile of ['legacy-50-v1', profile]) {
  test(`valid Codex ${workflowProfile} ownership ignores stale Claude metadata and marker`, async () => {
    const root = await candidate();
    await assessment(root, 27);
    const state = createInitialState({ workflowProfile, workflowId: 'valid-owner', workspaceRoot: root,
      topicSha256: (await import('../../scripts/lib/quality-files.mjs')).sha256('Synthetic approved scope.'), now: '2026-10-02T01:00:00.000Z' });
    validateState(state);
    await mkdir(join(root,'step_archive/TOPIC'),{recursive:true});
    await writeFile(join(root,'step_archive/TOPIC/TOPIC.md'),'Synthetic approved scope.');
    await mkdir(join(root, 'step_archive/.harness50-codex'), { recursive: true });
    await writeFile(join(root, 'step_archive/.harness50-codex/state.json'), JSON.stringify(state));
    await writeFile(join(root, 'step_archive/progress.json'), 'null');
    await writeFile(join(root, 'step_archive/workflow-profile.json'), JSON.stringify({ schema_version: 999 }));
    assert.equal((await workflowContext(root)).profile.id, workflowProfile);
    assert.equal((await inspectQa(root, 27)).status, workflowProfile === profile ? 'missing' : 'current');
    await assessment(root, 27);
    assert.equal((await inspectQa(root, 27)).verdict, 'PASS');
  });
}
test('generic Jev helper accepts new planning17 and rejects removed old checkpoints', async () => {
  const root = await candidate(); await progress(root);
  const input = { schema_version: 1, step: 17, sources: [{ path: 'step_archive/outputs/observed.md', excerpt: 'Observed candidate.' }],
    questions: [{ id: 'ready', instructions: 'Requirements covered?', choices: { yes: 'Covered', abstain: 'Unknown' }, abstain: 'abstain' }] };
  const prepared = await prepareJevJudgment(root, input);
  assert.equal(prepared.workflow_profile, profile);
  const saved = await runJevJudgment(root, input);
  assert.equal(saved.error_code, 'network_disabled');
  assert.match(saved.report_path, /research-free-36-v1\/[a-f0-9]{64}\//);
  assert.equal((await inspectJevJudgment(root, saved.report_path)).status, 'current');
  await progress(root, { run_started_at: '2026-10-02T03:00:00.000Z' });
  assert.equal((await inspectJevJudgment(root, saved.report_path)).status, 'invalid');
  await assert.rejects(() => prepareJevJudgment(root, { ...input, step: 16 }));
});
test('Codex workflow_id isolates QA across fresh generations and profile option mismatches fail closed', async () => {
  const root = await candidate();
  const state = createInitialState({workflowProfile:profile,workflowId:'00000000-0000-4000-8000-000000000001',workspaceRoot:root,
    topicSha256:(await import('../../scripts/lib/quality-files.mjs')).sha256('Synthetic approved scope.'),now:'2026-10-06T00:00:00.000Z'});
  await mkdir(join(root,'step_archive/TOPIC'),{recursive:true});
  await writeFile(join(root,'step_archive/TOPIC/TOPIC.md'),'Synthetic approved scope.');
  await mkdir(join(root, 'step_archive/.harness50-codex'), { recursive: true });
  const writeState = value => writeFile(join(root, 'step_archive/.harness50-codex/state.json'), JSON.stringify(value));
  await writeState(state); await assessment(root, 27);
  assert.equal((await inspectQa(root, 27)).verdict, 'PASS');
  assert.equal((await inspectQa(root, 27, { workflowProfile: 'legacy-50-v1' })).status, 'invalid');
  await writeState({ ...state, workflow_id: '00000000-0000-4000-8000-000000000002' });
  assert.equal((await inspectQa(root, 27)).status, 'missing');
});
test('new final summary selects current generation step36 and deployment31 instead of legacy records', async () => {
  const root = await candidate(); await progress(root);
  await writeFile(join(root, 'step_archive/step031_e2e.md'), 'deployment-verification: pending');
  await writeFile(join(root, 'step_archive/step045_old.md'), 'deployment-verification: pending');
  const summary = await writeFinalSummary(root);
  assert.equal(summary.written, true);
  assert.match(summary.text, /step031_e2e\.md/);
  assert.doesNotMatch(summary.text, /step045_old\.md|step050\.latest/);
  assert.match(summary.text, /research-free-36-v1\/[a-f0-9]{64}\/step036\.latest/);
});
