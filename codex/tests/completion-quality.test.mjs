import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStepContract, validateCompletionEvidence } from '../scripts/lib/acceptance.mjs';
import { makeWorkspace, hashFile, makePluginFixture, writeClaudeCompletedPrefix } from './helpers/workspace.mjs';
import { prepareQuality, prepareFinalRegression } from './helpers/completion-quality.mjs';
import { importClaudeProgress } from '../scripts/lib/importer.mjs';
import { beginStep, completeStep, resumeWorkflow } from '../scripts/lib/workflow.mjs';
import { readReceipts, writeReceiptExclusive } from '../scripts/lib/receipts.mjs';
import { readState } from '../scripts/lib/state-store.mjs';

const evidence = [{ acceptance_id: 'verified', kind: 'check', detail: 'verified', ok: true }];
const contractFor = number => ({ number, id: `step${String(number).padStart(3, '0')}`, acceptance: [
  { id: 'verified', kind: 'check', required: true, description: 'Verified project.' }
] });

for (const step of [38, 44, 50]) {
  for (const condition of ['missing', 'failed', 'stale-source', 'stale-config', 'stale-coverage']) {
    test(`new step ${step} rejects ${condition} measured quality`, async () => {
      const root = await makeWorkspace();
      if (condition !== 'missing') await prepareQuality(root, { fail: condition === 'failed' });
      if (condition === 'stale-source') await writeFile(join(root, 'app.js'), 'changed source');
      if (condition === 'stale-config') await writeFile(join(root, 'harness50.quality.json'), '{}');
      if (condition === 'stale-coverage') await writeFile(join(root, 'coverage/coverage-summary.json'), '{}');
      await assert.rejects(validateCompletionEvidence({ contract: contractFor(step), evidence, workspaceRoot: root }),
        error => error.code === 'ACCEPTANCE_QUALITY_INCOMPLETE');
    });
  }
  test(`step ${step} binds current reports and recovers receipt without rereading current files`, async () => {
    const root = await makeWorkspace();
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist/index.html'), '<html><body>Final</body></html>');
    await prepareQuality(root);
    if (step === 50) await prepareFinalRegression(root);
    const contract = contractFor(step);
    const result = await validateCompletionEvidence({ contract, evidence, workspaceRoot: root });
    const quality = result.evidence.find(item => item.acceptance_id === 'measured-quality-report');
    assert.ok(quality?.detail.includes(await hashFile(join(root, 'step_archive/outputs/quality-gate.json'))));
    if (step === 50) assert.ok(result.evidence.some(item => item.acceptance_id === 'final-regression-report'));
    await unlink(join(root, 'step_archive/outputs/quality-gate.json'));
    await writeFile(join(root, 'dist/index.html'), 'changed');
    assert.deepEqual(await validateCompletionEvidence({ contract, evidence, workspaceRoot: root,
      persistedEvidence: result.evidence }), result);
    assert.deepEqual((await validateCompletionEvidence({ contract, evidence, workspaceRoot: root,
      persistedEvidence: evidence })).evidence, evidence);
  });
}

test('step 50 requires final regression in addition to measured quality', async () => {
  const root = await makeWorkspace();
  await prepareQuality(root);
  await assert.rejects(validateCompletionEvidence({ contract: contractFor(50), evidence, workspaceRoot: root }),
    error => error.code === 'ACCEPTANCE_FINAL_REGRESSION_INCOMPLETE');
});

for (const step of [38, 44, 50]) {
  test(`step ${step} never writes a new receipt on incomplete quality and recovers a successful retry`, async () => {
    const root = await makeWorkspace();
    const pluginRoot = await makePluginFixture();
    const evidence = [{ acceptance_id: 'state-transition', kind: 'check', detail: 'checked', ok: true }];
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist/index.html'), '<html><body>Candidate</body></html>');
    await writeClaudeCompletedPrefix(root, step - 1);
    await importClaudeProgress({ workspaceRoot: root, pluginRoot });
    const resumed = await resumeWorkflow({ workspaceRoot: root, sessionId: 'quality-session' });
    const started = await beginStep({ workspaceRoot: root, step, sessionId: 'quality-session', marker: resumed.continuation });
    const args = { workspaceRoot: root, pluginRoot, step, attemptId: started.attempt.id,
      summary: 'Current measured quality', evidence };
    for (const condition of ['missing', 'failed', 'stale']) {
      if (condition !== 'missing') await prepareQuality(root, { fail: condition === 'failed' });
      if (condition === 'stale') await writeFile(join(root, 'changed.js'), 'changed');
      await assert.rejects(completeStep(args), error => error.code === 'ACCEPTANCE_QUALITY_INCOMPLETE');
      assert.equal((await readReceipts(root)).some(receipt => receipt.step === step), false);
      assert.equal((await readState(root)).current_attempt.id, started.attempt.id);
    }
    await prepareQuality(root);
    if (step === 50) {
      await assert.rejects(completeStep(args), error => error.code === 'ACCEPTANCE_FINAL_REGRESSION_INCOMPLETE');
      assert.equal((await readReceipts(root)).some(receipt => receipt.step === step), false);
      for (const condition of ['failed', 'stale']) {
        await prepareFinalRegression(root, { status: condition === 'failed' ? 'fail' : 'pass' });
        if (condition === 'stale') await writeFile(join(root, 'step_archive/outputs/final-matrix.json'), 'changed observations');
        await assert.rejects(completeStep(args), error => error.code === 'ACCEPTANCE_FINAL_REGRESSION_INCOMPLETE');
        assert.equal((await readReceipts(root)).some(receipt => receipt.step === step), false);
      }
      await prepareFinalRegression(root);
    }
    await completeStep(args);
    const receipt = (await readReceipts(root)).find(receipt => receipt.step === step);
    assert.ok(receipt.evidence.some(item => item.acceptance_id === 'measured-quality-report'));
    await unlink(join(root, 'step_archive/outputs/quality-gate.json'));
    await completeStep(args);
    assert.deepEqual((await readReceipts(root)).find(item => item.step === step), receipt);
  });
}

test('report replacement or source mutation while binding quality cannot pass', async () => {
  for (const target of ['step_archive/outputs/quality-gate.json', 'app.js']) {
    const root = await makeWorkspace();
    await prepareQuality(root);
    await assert.rejects(validateCompletionEvidence({ contract: contractFor(38), evidence, workspaceRoot: root,
      afterArtifactOpen: async ({ absolutePath }) => {
        if (absolutePath.endsWith('quality-gate.json')) await writeFile(join(root, target), 'changed');
      }
    }), error => ['ACCEPTANCE_ARTIFACT_CHANGED', 'ACCEPTANCE_QUALITY_INCOMPLETE'].includes(error.code));
  }
});

const currentPluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const finalVisualIds = ['final-desktop-screenshot', 'final-mobile-screenshot', 'final-visual-inspection'];
// Declarations added after a published release; receipts written before them lack this evidence.
const laterIds = [...finalVisualIds, 'browser-backend-lock'];
function historicalEvidence(contract) {
  return contract.acceptance.filter(item => item.required && !laterIds.includes(item.id)).map(item => {
    if (item.id === 'c8-disposition') return { acceptance_id: 'c8-version', kind: 'command',
      // Exact published b4b4b8f Step 5 declaration, verified with git show.
      detail: 'Historical c8 version verified', ok: true, command: 'npx c8 --version', exit_code: 0 };
    const evidence = { acceptance_id: item.id, kind: item.kind, detail: 'Historical verification', ok: true };
    if (item.kind === 'artifact') return { ...evidence, artifact_path: item.path, artifact_sha256: 'a'.repeat(64) };
    if (item.kind === 'command') return { ...evidence, command: item.command ?? 'npm run build', exit_code: 0 };
    return evidence;
  });
}

for (const step of [3, 5, 50]) {
  test(`current real step ${step} contract recovers its legacy receipt without new evidence or file reads`, async () => {
    const root = await makeWorkspace();
    const contract = await loadStepContract(currentPluginRoot, step);
    const persistedEvidence = historicalEvidence(contract);
    await writeClaudeCompletedPrefix(root, step - 1);
    await importClaudeProgress({ workspaceRoot: root, pluginRoot: currentPluginRoot });
    const resumed = await resumeWorkflow({ workspaceRoot: root, sessionId: 'legacy-session' });
    const started = await beginStep({ workspaceRoot: root, step, sessionId: 'legacy-session', marker: resumed.continuation });
    await writeReceiptExclusive(root, { schema_version: 1, workflow_id: started.state.workflow_id, step,
      attempt_id: started.attempt.id, provenance: 'codex-verified', completed_at: new Date().toISOString(),
      summary: 'Legacy completed step', evidence: persistedEvidence });
    const receipt = (await readReceipts(root)).find(item => item.step === step);
    const evidence = persistedEvidence.map(({ artifact_sha256, ...item }) => item);
    const args = { workspaceRoot: root, pluginRoot: currentPluginRoot, step, attemptId: started.attempt.id,
      summary: receipt.summary, evidence };
    await completeStep(args);
    await completeStep(args);
    assert.deepEqual((await readReceipts(root)).find(item => item.step === step), receipt);
    await assert.rejects(completeStep({ ...args, evidence: evidence.map((item, index) => index === 0
      ? { ...item, detail: 'Conflicting new claim' } : item) }), error => error.code === 'RECEIPT_CONFLICT');
    await assert.rejects(validateCompletionEvidence({ contract, evidence, workspaceRoot: root }),
      error => ['ACCEPTANCE_UNKNOWN', 'ACCEPTANCE_MISSING'].includes(error.code));
  });
}

test('legacy replay compatibility retains exact c8 command and all earlier required final evidence', async () => {
  const workspaceRoot = await makeWorkspace();
  const c8 = await loadStepContract(currentPluginRoot, 5);
  for (const command of ['npm exec -- c8 --version', 'npm exec --offline -- c8 --version']) {
    const changedCommand = historicalEvidence(c8).map(item => item.acceptance_id === 'c8-version'
      ? { ...item, command } : item);
    await assert.rejects(validateCompletionEvidence({ contract: c8, workspaceRoot,
      evidence: changedCommand, persistedEvidence: changedCommand }), error => error.code === 'ACCEPTANCE_COMMAND_MISMATCH');
  }
  const final = await loadStepContract(currentPluginRoot, 50);
  const old = historicalEvidence(final);
  const missingOld = old.filter(item => item.acceptance_id !== 'console-errors-zero');
  await assert.rejects(validateCompletionEvidence({ contract: final, workspaceRoot,
    evidence: missingOld, persistedEvidence: missingOld }), error => error.code === 'ACCEPTANCE_MISSING');
  const partialNew = [...old, { acceptance_id: 'final-visual-inspection', kind: 'check', detail: 'New claim', ok: true }];
  await assert.rejects(validateCompletionEvidence({ contract: final, workspaceRoot,
    evidence: partialNew, persistedEvidence: partialNew }), error => error.code === 'ACCEPTANCE_MISSING');
});
