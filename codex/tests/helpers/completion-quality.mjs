import { LEGACY_WORKFLOW_PROFILE, getWorkflowProfile } from "../../../scripts/lib/workflow-profiles.mjs";
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runQualityGate } from '../../../scripts/lib/quality.mjs';
import { snapshotQa, recordQa } from '../../../scripts/lib/qa-report.mjs';

// Minimal measured evidence for scheduler-only simulations, not product quality.
export async function prepareSchedulerMilestone(root, step, workflowProfile = LEGACY_WORKFLOW_PROFILE) {
  const profile = getWorkflowProfile(workflowProfile);
  if (!profile.milestones.quality.includes(step)) return;
  if (step === profile.milestones.final) {
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist/index.html'), '<html><body>Scheduler fixture</body></html>');
    await prepareFinalRegression(root, { workflowProfile });
  }
  await prepareQuality(root);
}

export async function prepareQuality(root, { fail = false } = {}) {
  await mkdir(join(root, 'coverage'), { recursive: true });
  const summary = JSON.stringify({ total: Object.fromEntries(
    ['lines', 'statements', 'functions', 'branches'].map(name => [name, { total: 10, covered: 9 }])
  ) });
  const checks = Object.fromEntries(['test', 'lint', 'typecheck', 'security'].map(name => [name,
    { command: [process.execPath, '-e', 'process.exit(0)'] }
  ]));
  checks.test.command = [process.execPath, '-e', `require('node:fs').writeFileSync('coverage/coverage-summary.json', ${JSON.stringify(summary)})`];
  if (fail) checks.security.command = [process.execPath, '-e', 'process.exit(7)'];
  await writeFile(join(root, 'harness50.quality.json'), JSON.stringify({ schema_version: 1, checks,
    coverage: { path: 'coverage/coverage-summary.json', minimum: 85 } }));
  assert.equal((await runQualityGate(root)).verdict, fail ? 'FAIL' : 'PASS');
}

export async function prepareFinalRegression(root, { status = 'pass', workflowProfile = LEGACY_WORKFLOW_PROFILE } = {}) {
  const checks = ['e2e', 'screenshot', 'keyboard', 'mouse', 'design', 'console'].map(name => ({
    id: `${name}-regression`, requirement: `Verify final ${name} regression.`
  }));
  await mkdir(join(root, 'step_archive/outputs'), { recursive: true });
  await writeFile(join(root, 'step_archive/outputs/final-matrix.json'), '{"checks":"fixture observations"}');
  const snapshot = await snapshotQa(root, getWorkflowProfile(workflowProfile).milestones.final, { artifacts: ['dist/index.html'], checks });
  const result = await recordQa(root, getWorkflowProfile(workflowProfile).milestones.final, {
    snapshot_id: snapshot.snapshot_id, verifier: { id: 'fixture-independent-reviewer', mode: 'independent' },
    outcomes: checks.map(({ id }) => ({ id, status, observation: `Observed ${id}.`,
      evidence_paths: ['step_archive/outputs/final-matrix.json'], next_check: status === 'pass' ? '' : 'Repair and rerun.' })),
    next_actions: status === 'pass' ? [] : ['Repair and rerun.']
  });
  assert.equal(result.verdict, status === 'pass' ? 'PASS' : 'INCOMPLETE');
}
