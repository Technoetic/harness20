import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';
import { snapshotQa, recordQa } from '../../scripts/lib/qa-report.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';

const api = await import('../../scripts/lib/final-regression.mjs').catch(() => ({}));
const categories = ['e2e-regression', 'screenshot-regression', 'keyboard-regression',
  'mouse-regression', 'design-regression', 'console-regression'];

async function fixture({ ids = categories, artifacts = ['dist/index.html'], status = 'pass', step = 50, verifierMode = 'independent' } = {}) {
  const root = await makeWorkspace();
  await mkdir(join(root, 'dist'), { recursive: true });
  await mkdir(join(root, 'step_archive/outputs'), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), '<html><body><button>Continue</button></body></html>');
  await writeFile(join(root, 'src.js'), 'export const enabled = true;');
  const snapshot = await snapshotQa(root, step, { artifacts,
    checks: ids.map(id => ({ id, requirement: `Rerun the full ${id} matrix on the final candidate.` })) });
  const outcomes = [];
  for (const id of ids) {
    const path = `step_archive/outputs/${id}.json`;
    await writeFile(join(root, path), JSON.stringify({ observed: id, status }));
    outcomes.push({ id, status, observation: 'Fixture measurement recorded.', evidence_paths: [path],
      next_check: status === 'pass' ? '' : 'Repair and rerun the matrix.' });
  }
  const saved = await recordQa(root, step, { snapshot_id: snapshot.snapshot_id,
    verifier: { id: 'fixture-reviewer', mode: verifierMode }, outcomes,
    next_actions: status === 'pass' ? [] : ['Rerun the failed matrix.'] });
  return { root, saved };
}

test('final completion requires a recorded regression assessment', async () => {
  assert.equal(typeof api.inspectFinalRegression, 'function');
  const result = await api.inspectFinalRegression(await makeWorkspace());
  assert.equal(result.verdict, 'INCOMPLETE');
});

test('each of the six final regression categories is mandatory', async () => {
  for (const omitted of categories) {
    const { root } = await fixture({ ids: categories.filter(id => id !== omitted) });
    assert.equal((await api.inspectFinalRegression(root)).verdict, 'INCOMPLETE', omitted);
  }
});

test('regression PASS must bind the delivered HTML rather than unrelated source alone', async () => {
  const { root } = await fixture({ artifacts: ['src.js'] });
  assert.equal((await api.inspectFinalRegression(root)).verdict, 'INCOMPLETE');
});

test('failed and unexecuted final matrices cannot count as complete', async () => {
  for (const status of ['fail', 'unverified']) {
    const { root } = await fixture({ status });
    assert.equal((await api.inspectFinalRegression(root)).verdict, 'INCOMPLETE');
  }
});

test('changing final HTML or observed evidence invalidates the final regression assessment', async () => {
  for (const path of ['dist/index.html', 'step_archive/outputs/keyboard-regression.json']) {
    const { root } = await fixture();
    await writeFile(join(root, path), 'changed after testing');
    assert.equal((await api.inspectFinalRegression(root)).verdict, 'INCOMPLETE', path);
  }
});

test('current complete matrices expose the immutable report and final HTML digests', async () => {
  const { root, saved } = await fixture({ ids: [...categories, 'product-specific-check'] });
  const result = await api.inspectFinalRegression(root);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.report_sha256, saved.report_sha256);
  assert.equal(result.report_path, `step_archive/outputs/qa-reports/${saved.report_sha256}.report.json`);
  assert.equal(result.artifact_sha256, sha256(await readFile(join(root, 'dist/index.html'))));
});


test('new36 final regression requires declared independent mode while legacy50 retains its existing contract', async () => {
  const sameAgent36 = await fixture({ step: 36, verifierMode: 'same-agent' });
  assert.equal(sameAgent36.saved.verdict, 'PASS');
  const rejected = await api.inspectFinalRegression(sameAgent36.root, 'research-free-36-v1');
  assert.equal(rejected.verdict, 'INCOMPLETE');
  assert.match(rejected.error, /independent/i);

  const independent36 = await fixture({ step: 36 });
  assert.equal((await api.inspectFinalRegression(independent36.root, 'research-free-36-v1')).verdict, 'PASS');
  const sameAgent50 = await fixture({ verifierMode: 'same-agent' });
  assert.equal((await api.inspectFinalRegression(sameAgent50.root)).verdict, 'PASS');
});
