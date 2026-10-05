import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defaultWorkflowProfile, getWorkflowProfile, resolveWorkflowProfile } from '../../scripts/lib/workflow-profiles.mjs';
import { createInitialState, validateState } from '../scripts/lib/schema.mjs';
import { initWorkflow, beginStep, completeStep, showWorkflow, pauseWorkflow, resumeWorkflow, reconcileWorkflow } from '../scripts/lib/workflow.mjs';
import { readReceipts } from '../scripts/lib/receipts.mjs';
import { loadStepContract } from '../scripts/lib/acceptance.mjs';
import { makeWorkspace, makePluginFixture } from './helpers/workspace.mjs';
import { prepareSchedulerMilestone } from './helpers/completion-quality.mjs';
import { prepareJevJudgment, runJevJudgment, inspectJevJudgment } from '../../scripts/lib/jev-judge.mjs';
import { writeFinalSummary } from '../../scripts/lib/final-summary.mjs';
import { validateAllProfiles } from '../scripts/validate-steps.mjs';

const profile = 'planning-first-20-v1';
const repo = resolve(import.meta.dirname, '../..');
const oldPolicy = '8b2754566775198f537b407e516cb4033a863587b7870e126d84a5d87e4bf06d';

test('fresh selection starts with planning and exposes twenty retained gates', () => {
  const p = defaultWorkflowProfile();
  assert.equal(p.id, profile); assert.equal(p.stepCount, 20);
  assert.deepEqual(p.originalSteps, [25,30,31,32,33,34,35,36,37,38,39,41,42,44,45,46,47,48,49,50]);
  assert.deepEqual(p.milestones.quality, [10,14,20]);
  assert.deepEqual(p.milestones.independentQa, [11,16,17,18]);
  assert.deepEqual(p.milestones.jev, [1,2,9,15,19]);
  assert.equal(p.milestones.planning, 1); assert.equal(p.milestones.design, 2);
  assert.equal(p.milestones.implementation, 9); assert.equal(p.milestones.final, 20);
});

test('persisted old definitions and mismatched counts are independent of the new default', () => {
  for (const [id, count] of [['legacy-50-v1',50], ['research-free-36-v1',36], [profile,20]]) {
    assert.equal(resolveWorkflowProfile({schema_version:2,workflow_profile:id,total_steps:count}).stepCount,count);
    for (const wrong of [20,36,50].filter(n=>n!==count))
      assert.throws(()=>resolveWorkflowProfile({schema_version:2,workflow_profile:id,total_steps:wrong}));
  }
  assert.equal(resolveWorkflowProfile({total_steps:50}).id,'legacy-50-v1');
  assert.equal(getWorkflowProfile('research-free-36-v1').milestones.planning,17);
});

test('native fresh entry needs only the request and begins planning without deleted artifacts', async () => {
  const root = await makeWorkspace();
  const state = await initWorkflow({workspaceRoot:root,topic:'Build a small calculator with accessible keyboard controls.'});
  assert.equal(state.workflow_profile,profile); assert.equal(state.total_steps,20);
  assert.deepEqual(state.completed_steps,[]); assert.equal(state.current_step,1);
  const begun = await beginStep({workspaceRoot:root,step:1,marker:state.continuation});
  assert.equal(begun.step_target,`codex/assets/profiles/${profile}/steps/step001.md`);
  const contract = await loadStepContract(repo,1,profile);
  assert.deepEqual(contract.requires,[]);
  assert.deepEqual(contract.inputs,['step_archive/TOPIC/TOPIC.md']);
  assert.ok(contract.acceptance.some(a=>a.id==='requirements-traceability' && a.required));
  await assert.rejects(()=>beginStep({workspaceRoot:root,step:21}),{code:'STEP_RANGE'});
});

test('all twenty native transitions preserve measured gates and terminal replay', async () => {
  const root = await makeWorkspace(); const pluginRoot = await makePluginFixture({workflowProfile:profile});
  let state = await initWorkflow({workspaceRoot:root,topic:'Synthetic twenty-step lifecycle'});
  for (let step=1;step<=20;step++) {
    const begun = await beginStep({workspaceRoot:root,step,marker:state.continuation});
    await prepareSchedulerMilestone(root,step,profile);
    const input={workspaceRoot:root,pluginRoot,step,attemptId:begun.attempt.id,summary:`Observed fixture transition ${step}`,
      evidence:[{acceptance_id:'state-transition',kind:'check',ok:true,detail:'Synthetic state-machine fixture, not product completion.'}]};
    state=await completeStep(input);
    if (step===1 || step===20) assert.deepEqual(await completeStep(input),state);
  }
  assert.equal(state.status,'completed'); assert.equal(state.current_step,null);
  assert.equal((await readReceipts(root)).length,20);
  assert.equal((await reconcileWorkflow({workspaceRoot:root})).status,'completed');
});

test('explicit36 and legacy50 pause/resume retain their original definitions', async () => {
  for (const [id,count] of [['research-free-36-v1',36],['legacy-50-v1',50]]) {
    const root=await makeWorkspace();
    const before=await initWorkflow({workspaceRoot:root,workflowProfile:id,topic:'Existing definition resume fixture'});
    assert.equal(before.total_steps,count);
    await pauseWorkflow({workspaceRoot:root,reason:'user-request'});
    const after=await resumeWorkflow({workspaceRoot:root});
    assert.equal(after.workflow_profile ?? 'legacy-50-v1',id); assert.equal(after.total_steps,count);assert.equal(after.current_step,1);
    assert.equal((await showWorkflow({workspaceRoot:root})).workflow_profile ?? 'legacy-50-v1',id);
  }
  const state=createInitialState({workflowId:'fixture',workspaceRoot:'C:/fixture',topicSha256:'a'.repeat(64),now:'2026-10-04T00:00:00.000Z'});
  assert.equal(state.total_steps,20);assert.throws(()=>validateState({...state,total_steps:36}));
});

const judgment = step => ({schema_version:1,step,sources:[{path:'step_archive/outputs/input.md',excerpt:'Synthetic selected requirements.'}],
  questions:[{id:'covered',instructions:'Are requirements covered?',choices:{yes:'Covered',unknown:'Insufficient evidence'},abstain:'unknown'}]});
async function judgeFixture(id) {
  const root=await makeWorkspace();await initWorkflow({workspaceRoot:root,workflowProfile:id,topic:'Synthetic evidence binding'});
  await mkdir(join(root,'step_archive/outputs'),{recursive:true});
  await writeFile(join(root,'step_archive/outputs/input.md'),'Synthetic selected requirements.');
  return root;
}
test('old36 resumes retain history while new judgments use the hardened security policy', async () => {
  const root=await judgeFixture('research-free-36-v1');
  const before=await prepareJevJudgment(root,judgment(17));assert.notEqual(before.policy_hash,oldPolicy);
  const saved=await runJevJudgment(root,judgment(17));
  assert.equal(saved.error_code,'network_disabled');
  assert.equal((await inspectJevJudgment(root,saved.report_path)).status,'current');
});
test('new20 Jev uses only its own checkpoints and a distinct policy', async () => {
  const root=await judgeFixture(profile);
  const first=await prepareJevJudgment(root,judgment(1));assert.equal(first.workflow_profile,profile);
  assert.notEqual(first.policy_hash,oldPolicy);
  for (const step of [1,2,9,15,19]) assert.equal((await prepareJevJudgment(root,judgment(step))).step,step);
  for (const step of [3,17,20,25,31]) await assert.rejects(()=>prepareJevJudgment(root,judgment(step)));
});

test('shorter final summary collects deployment status from its own E2E step15', async () => {
  const root=await judgeFixture(profile);
  await writeFile(join(root,'step_archive/step015_e2e.md'),'deployment-verification: pending\n');
  const report=await writeFinalSummary(root);
  assert.match(report.text,/배포 검증 대기\(pending\).*step015_e2e/);
  assert.doesNotMatch(report.text,/step031_\*\.md/);
});

test('all-profile validation includes previous36 alongside legacy50 and fresh20', async () => {
  const reports=await validateAllProfiles(repo);
  assert.equal(reports.length,3);
  assert.deepEqual(reports.map(r=>r.steps.length).sort((a,b)=>a-b),[20,36,50]);
});
