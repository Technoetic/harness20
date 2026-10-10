import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getWorkflowProfile, originalStepNumber } from '../../scripts/lib/workflow-profiles.mjs';
import { initWorkflow, beginStep, completeStep, failStep, pauseWorkflow, resumeWorkflow, reconcileWorkflow } from '../scripts/lib/workflow.mjs';
import { loadStepContract, validateCompletionEvidence } from '../scripts/lib/acceptance.mjs';
import { validateAllProfiles, validateRepositoryParity } from '../scripts/validate-steps.mjs';
import { makeWorkspace, makePluginFixture } from './helpers/workspace.mjs';
import { prepareSchedulerMilestone } from './helpers/completion-quality.mjs';
import { snapshotQa, recordQa } from '../../scripts/lib/qa-report.mjs';
import { assertMemorySourcePath } from '../../scripts/lib/memory-policy.mjs';
import { recordLesson, inspectLessons } from '../../scripts/lib/workflow-memory.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
import { workflowContext } from '../../scripts/lib/workflow-context.mjs';

const repo = resolve(import.meta.dirname, '../..');
const profile = 'planning-first-14-v1';
const backend = 'step_archive/outputs/browser-backend.json';
const environment = 'step_archive/step002_환경준비.md';
const now = '2026-10-10T04:00:00.000Z';
const reference = (path,bytes) => ({path,file_sha256:sha256(bytes),start_byte:0,end_byte:bytes.length,range_sha256:sha256(bytes)});

test('fresh native initialization selects fourteen steps and retained gate coordinates', async () => {
  const state=await initWorkflow({workspaceRoot:await makeWorkspace(),topic:'Explicit fresh calculator request.'});
  assert.equal(state.workflow_profile,profile);
  assert.equal(state.total_steps,14);
  const p=getWorkflowProfile(profile);
  assert.deepEqual(p.originalSteps,[25,30,37,38,39,41,42,44,45,46,47,48,49,50]);
  assert.deepEqual(p.milestones.quality,[4,8,14]);
  assert.deepEqual(p.milestones.independentQa,[5,10,11,12]);
  assert.deepEqual(p.milestones.jev,[1,2,3,9,13]);
  assert.equal(p.milestones.environment,2);
  assert.equal(p.milestones.implementation,3);
  assert.equal(p.milestones.e2e,9);
  assert.equal(originalStepNumber(profile,2),30,'Environment folding must not falsify design provenance');
});

test('Claude bootstrap selects fourteen physical bodies without mutating an older flat archive', async () => {
  const root=await makeWorkspace();
  await mkdir(join(root,'step_archive'),{recursive:true});
  await writeFile(join(root,'step_archive/step050.md'),'Preserved historical body\n');
  const before=await readFile(join(root,'step_archive/step050.md'));
  const result=spawnSync(process.execPath,[join(repo,'hooks/lib/workflow-profile.mjs'),'bootstrap',root],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  const info=JSON.parse(result.stdout);
  assert.equal(info.workflow_profile,profile);assert.equal(info.total,14);
  assert.equal(info.body_directory,'step_archive/profiles/planning-first-14-v1/archived');
  assert.deepEqual(await readFile(join(root,'step_archive/step050.md')),before);
  assert.deepEqual(await readFile(join(root,info.body_directory,'step002.md')),await readFile(join(repo,'assets/profiles',profile,'steps/step002.md')));
});

test('all four physical profiles validate while every earlier step body and index remains byte-identical', async () => {
  const reports=await validateAllProfiles(repo);
  assert.deepEqual(reports.map(r=>r.steps.length).sort((a,b)=>a-b),[14,20,36,50]);
  const hashes=JSON.parse(await readFile(new URL('./fixtures/previous-profile-sha256.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(hashes).length,215);
  for(const [path,digest] of Object.entries(hashes)) assert.equal(sha256(await readFile(join(repo,path))),digest,path);
});

test('design completion cannot omit environment evidence or mark failed readiness successful', async () => {
  const contract=await loadStepContract(repo,2,profile);
  assert.ok(contract.outputs.includes(environment));assert.ok(contract.outputs.includes(backend));
  const root=await makeWorkspace();
  await initWorkflow({workspaceRoot:root,workflowProfile:profile,topic:'Environment acceptance fixture.'});
  const finalDesign='step_archive/outputs/step002_최종검증.md';
  const evidence=[];
  for(const item of contract.acceptance.filter(a=>a.required)) {
    assert.notEqual(item.kind,'command','This contract uses actual artifact/check evidence');
    const entry={acceptance_id:item.id,kind:item.kind,ok:true,detail:'Synthetic acceptance-boundary fixture, not live readiness.'};
    if(item.kind==='artifact') {
      entry.artifact_path=item.path;
      await mkdir(join(root,item.path,'..'),{recursive:true});
      await writeFile(join(root,item.path),item.path===backend?JSON.stringify({schema_version:1,selected:'aside',tool_version:'fixture',probed_at:now}):item.path===finalDesign?'Independent report\nfinal-verdict: PASS\n':'Fixture evidence\n');
    }
    evidence.push(entry);
  }
  const context=await workflowContext(root);
  const record={schema_version:1,workflow_profile:profile,workflow_generation:context.generation,
    selected:'aside',tool_version:'fixture',browser_ready:true,dependencies_ready:true,
    backend_lock_sha256:sha256(await readFile(join(root,backend))),
    selected_design_sha256:sha256(await readFile(join(root,'step_archive/outputs/step002_설계선택.md'))),
    final_design_verification_sha256:sha256(await readFile(join(root,finalDesign))),
    layout_design_sha256:sha256(await readFile(join(root,'step_archive/step002_레이아웃설계_chunk1.md'))),
    overall_design_sha256:sha256(await readFile(join(root,'step_archive/step002_전체설계_chunk1.md')))};
  const report=value=>'# Host observations\n\n```json harness20-environment\n'+JSON.stringify(value)+'\n```\n';
  await writeFile(join(root,environment),report(record));
  const validate=values=>validateCompletionEvidence({contract,evidence:values,workspaceRoot:root,workflowProfile:profile});
  await writeFile(join(root,finalDesign),'Independent report\nfinal-verdict: FAIL\n');
  await assert.rejects(()=>validate(evidence),{code:'ACCEPTANCE_ARTIFACT_CONTENT'});
  await writeFile(join(root,finalDesign),'Independent report\nfinal-verdict: PASS\n');
  await writeFile(join(root,environment),report({...record,final_design_verification_sha256:'a'.repeat(64)}));
  await assert.rejects(()=>validate(evidence),{code:'ACCEPTANCE_ARTIFACT_CONTENT'});
  await writeFile(join(root,environment),report(record));
  for(const id of ['environment-preparation-report','browser-backend-lock','bounded-browser-readiness']) {
    await assert.rejects(()=>validate(evidence.filter(e=>e.acceptance_id!==id)),error=>error.code==='ACCEPTANCE_MISSING'&&error.details.missing.includes(id));
  }
  await assert.rejects(()=>validate(evidence.map(e=>e.acceptance_id==='bounded-browser-readiness'?{...e,ok:false}:e)),{code:'ACCEPTANCE_MISSING'});
  assert.deepEqual((await validate(evidence)).missing_required,[]);
  for(const path of [environment,backend]) {
    const bytes=await readFile(join(root,path));await rm(join(root,path));
    await assert.rejects(()=>validate(evidence),{code:path===environment?'ACCEPTANCE_ARTIFACT_MISSING':'ACCEPTANCE_ARTIFACT_CONTENT'});
    await writeFile(join(root,path),bytes);
  }
  await writeFile(join(root,environment),report({...record,browser_ready:false}));
  await assert.rejects(()=>validate(evidence),{code:'ACCEPTANCE_ARTIFACT_CONTENT'});
  await writeFile(join(root,environment),report(record));
  for(const malformed of ['{}','not JSON',JSON.stringify({schema_version:1,selected:'unapproved',tool_version:'fixture',probed_at:now})]) {
    await writeFile(join(root,backend),malformed);
    await assert.rejects(()=>validate(evidence),{code:'ACCEPTANCE_ARTIFACT_CONTENT'});
  }
});

test('implementation and later browser gates consume the environment owned by design2', async () => {
  const result=await validateRepositoryParity(repo,profile);
  for(const step of [3,9,14]) {
    const contract=result.steps[step-1];
    assert.ok(contract.requires.includes('step002'),`step${step} requires design/environment2`);
    assert.ok(contract.inputs.includes(backend),`step${step} consumes the backend lock`);
  }
  const removed=/(?:step003_환경준비|파일인덱스_chunk|jscpd베이스라인|knip베이스라인|컨텍스트정책\.md|인코딩정책\.md)/;
  assert.doesNotMatch(JSON.stringify(result.steps),removed);
  for(const contract of result.steps) for(const host of ['source','target']) assert.doesNotMatch(await readFile(join(repo,contract[host]),'utf8'),removed,contract[host]);
});

test('fourteen synthetic transitions enforce existing milestones and preserve terminal replay', async () => {
  const root=await makeWorkspace(),pluginRoot=await makePluginFixture({workflowProfile:profile});
  let state=await initWorkflow({workspaceRoot:root,topic:'Synthetic fourteen-step manager lifecycle.'});
  for(let step=1;step<=14;step++) {
    const begun=await beginStep({workspaceRoot:root,step,marker:state.continuation});
    await prepareSchedulerMilestone(root,step,profile);
    const input={workspaceRoot:root,pluginRoot,step,attemptId:begun.attempt.id,summary:'Synthetic state transition; not generated-output verification.',evidence:[{acceptance_id:'state-transition',kind:'check',ok:true,detail:'Observed fixture transition.'}]};
    state=await completeStep(input);
    if(step===14) assert.deepEqual(await completeStep(input),state);
  }
  assert.equal(state.status,'completed');assert.equal(state.current_step,null);
  assert.equal((await reconcileWorkflow({workspaceRoot:root})).completed_steps.length,14);
});

test('explicit twenty, thirty-six and fifty workflows pause and resume their original identities', async () => {
  for(const [id,total] of [['planning-first-20-v1',20],['research-free-36-v1',36],['legacy-50-v1',50]]) {
    const root=await makeWorkspace();
    await initWorkflow({workspaceRoot:root,workflowProfile:id,topic:'Historical profile continuation fixture.'});
    await pauseWorkflow({workspaceRoot:root,reason:'user-request'});
    const resumed=await resumeWorkflow({workspaceRoot:root});
    assert.equal(resumed.workflow_profile??'legacy-50-v1',id);assert.equal(resumed.total_steps,total);assert.equal(resumed.current_step,1);
  }
});

test('a saved fourteen-profile repair lesson is readable and cannot cross profile boundaries', async () => {
  const root=await makeWorkspace();
  const state=await initWorkflow({workspaceRoot:root,topic:'Public fixture repair.',now});
  assert.equal(state.workflow_profile,profile);
  const begun=await beginStep({workspaceRoot:root,step:1,marker:state.continuation,now});
  await failStep({workspaceRoot:root,step:1,attemptId:begun.attempt.id,reason:'Host observed fixture check failure.',evidence:[],now});
  await mkdir(join(root,'src'));await mkdir(join(root,'step_archive/outputs'),{recursive:true});
  const sourceBytes=Buffer.from('export const total=7;\n');
  await writeFile(join(root,'src/app.mjs'),sourceBytes);
  await writeFile(join(root,'step_archive/outputs/check.json'),'Observed required total seven\n');
  const snapshot=await snapshotQa(root,1,{artifacts:['src/app.mjs'],checks:[{id:'total',requirement:'Required total is seven.'}]});
  const qa=await recordQa(root,1,{snapshot_id:snapshot.snapshot_id,verifier:{id:'fixture-host',mode:'same-agent'},outcomes:[{id:'total',status:'pass',observation:'Host fixture observed required total.',evidence_paths:['step_archive/outputs/check.json'],next_check:''}],next_actions:[]});
  const source=reference('src/app.mjs',sourceBytes);
  const saved=await recordLesson(root,{task_id:'total-task',failure:{step:1,attempt_id:begun.attempt.id},repair_observation:'Rerun the required fixture check.',scope:{task_ids:['total-task'],source_paths:['src/app.mjs'],check_ids:['total']},sources:[source],verification:{step:1,report_sha256:qa.report_sha256,check_ids:['total']},validity:{from:now,until:'2026-11-10T00:00:00.000Z'},related_ids:[],supersedes:[]});
  assert.ok(saved.record_path.startsWith('step_archive/outputs/workflow-memory/planning-first-14-v1/'));
  const found=await inspectLessons(root,{task_id:'total-task',sources:[source],check_ids:['total'],max_results:8,max_bytes:16384,as_of:now});
  assert.equal(found.lessons[0].lesson_id,saved.lesson_id);
  const suffix=`/${'a'.repeat(64)}/lessons/${'b'.repeat(64)}.json`;
  assert.throws(()=>assertMemorySourcePath('step_archive/outputs/workflow-memory/unregistered-v1'+suffix,'lesson'));
  assert.throws(()=>assertMemorySourcePath('step_archive/outputs/workflow-memory/planning-first-14-v1/../'+suffix,'lesson'));
});
