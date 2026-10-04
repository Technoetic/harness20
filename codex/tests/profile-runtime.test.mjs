import { inspectQa } from '../../scripts/lib/qa-report.mjs';
import { prepareSchedulerMilestone } from './helpers/completion-quality.mjs';
import { readState, writeStateAtomic } from '../scripts/lib/state-store.mjs';
import { pathsFor } from '../scripts/lib/paths.mjs';
import { summarizeState, contextLine } from '../../hooks/lib/codex-workflow.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInitialState, validateState } from '../scripts/lib/schema.mjs';
import { parseReceipt, reconcileReceipts, readReceipts } from '../scripts/lib/receipts.mjs';
import { loadStepContract, validateCompletionEvidence } from '../scripts/lib/acceptance.mjs';
import { normalizeClaudeProgress, importClaudeProgress } from '../scripts/lib/importer.mjs';
import { initWorkflow, beginStep, completeStep, showWorkflow, pauseWorkflow, resumeWorkflow, reconcileWorkflow, resetWorkflow } from '../scripts/lib/workflow.mjs';
import { makeWorkspace, makePluginFixture, writeClaudeFixture } from './helpers/workspace.mjs';
import { runCli } from './helpers/run-cli.mjs';
import { handleSessionStart } from '../hooks/session-start.mjs';
import { failStep } from '../scripts/lib/workflow.mjs';
import { dirname } from 'node:path';
import { completionHtml, passingBrowserReport } from './helpers/routing.mjs';
import { prepareQuality, prepareFinalRegression } from './helpers/completion-quality.mjs';
import { hashFile } from './helpers/workspace.mjs';

const profile = 'research-free-36-v1';
const at = '2026-10-02T00:00:00.000Z';
const initial = () => createInitialState({workflowId:'run', workspaceRoot:'C:/fixture',topicSha256:'a'.repeat(64),now:at,workflowProfile:profile});
const receipt = step => ({schema_version:2,workflow_profile:profile,workflow_id:'run',step,attempt_id:`attempt-${step}`,provenance:'codex-verified',completed_at:at,summary:'Verified',evidence:[]});
test('fresh state is strict explicit36 and every cursor respects36', () => {
 const state=initial(); assert.equal(state.schema_version,2); assert.equal(state.workflow_profile,profile); assert.equal(state.total_steps,36);
 for (const mutation of [{workflow_profile:'unknown'}, {total_steps:50}, {schema_version:1}, {workflow_profile:undefined}, {completed_steps:Array.from({length:36},(_,i)=>i+1),current_step:37}]) assert.throws(()=>validateState({...state,...mutation}));
 assert.throws(()=>validateState({...state, extra:true}));
});
test('36 receipts reach terminal state and mixed definitions fail closed',()=>{
 const state=initial(); const receipts=Array.from({length:36},(_,i)=>receipt(i+1));
 assert.equal(parseReceipt(receipts[0]).workflow_profile,profile);
 assert.throws(()=>parseReceipt(receipt(37)));
 const done=reconcileReceipts(state,receipts).state; assert.equal(done.status,'completed'); assert.equal(done.current_step,null);
 const old={...receipt(1),schema_version:1};delete old.workflow_profile;
 assert.equal(reconcileReceipts(state,[old]).state.blocked_reason,'RECEIPT_PROFILE_MISMATCH');
});
test('selected loader uses physical36 source and mandatory quality26,30,36',async()=>{
 const root=resolve(import.meta.dirname,'../..');
 const contract=await loadStepContract(root,17,profile); assert.match(contract.target,/profiles\/research-free-36-v1\/steps\/step017.md$/); assert.equal(contract.phase,'planning');
 await assert.rejects(()=>loadStepContract(root,37,profile));
 const workspaceRoot=await makeWorkspace(); for(const number of [26,30,36]) await assert.rejects(()=>validateCompletionEvidence({workflowProfile:profile,contract:{number,id:`step${number}`,acceptance:[{id:'ok',kind:'check',required:true,description:'ok'}]},evidence:[{acceptance_id:'ok',kind:'check',ok:true,detail:'ok'}],workspaceRoot}),{code:'ACCEPTANCE_QUALITY_INCOMPLETE'});
});
test('new36 replay cannot use historical browser lock exception',async()=>{
 const contract=await loadStepContract(resolve(import.meta.dirname,'../..'),3,profile);
 const legacyEvidence=contract.acceptance.filter(d=>d.id!=='browser-backend-lock').map(d=>({acceptance_id:d.id,kind:d.kind,ok:true,detail:'verified',...(d.kind==='artifact'?{artifact_path:d.path,artifact_sha256:'a'.repeat(64)}:{}),...(d.kind==='command'?{command:d.command,exit_code:0}:{})}));
 await assert.rejects(()=>validateCompletionEvidence({workflowProfile:profile,contract,evidence:legacyEvidence,persistedEvidence:legacyEvidence}),{code:'ACCEPTANCE_MISSING'});
});
test('explicit36 Claude progress imports with profile and bounds',()=>{
 const value=normalizeClaudeProgress({schema_version:2,workflow_profile:profile,total_steps:36,current_step:36,completed_steps:Array.from({length:36},(_,i)=>i+1)});
 assert.equal(value.workflow_profile,profile);assert.equal(value.current_step,null);
 assert.throws(()=>normalizeClaudeProgress({total_steps:36,current_step:1,completed_steps:[]}));
});
test('public fresh init and begin expose selected trusted body and reject step37',async()=>{
 const workspaceRoot=await makeWorkspace();const state=await initWorkflow({workspaceRoot,workflowProfile:profile,topic:'Profile lifecycle',now:at});
 assert.equal(state.total_steps,36);
 const begun=await beginStep({workspaceRoot,step:1,marker:state.continuation,now:at});assert.equal(begun.step_target,`codex/assets/profiles/${profile}/steps/step001.md`);
 const shown=await showWorkflow({workspaceRoot});assert.equal(shown.workflow_profile,profile);
 await assert.rejects(()=>beginStep({workspaceRoot,step:37,now:at}),{code:'STEP_RANGE'});
});


test('36 native lifecycle completes all36 receipts with measured milestones and terminal replay', async()=>{
 const workspaceRoot=await makeWorkspace();const pluginRoot=await makePluginFixture({workflowProfile:profile});
 let state=await initWorkflow({workspaceRoot,workflowProfile:profile,topic:'Native36 scheduling fixture'});
 for(let step=1;step<=36;step++){
   const begun=await beginStep({workspaceRoot,step,marker:state.continuation});
   await prepareSchedulerMilestone(workspaceRoot,step,profile);
   const args={workspaceRoot,pluginRoot,step,attemptId:begun.attempt.id,summary:`step ${step}`,evidence:[{acceptance_id:'state-transition',kind:'check',ok:true,detail:'Verified fixture transition'}]};
   state=await completeStep(args);
   if(step===1 || step===36) assert.deepEqual(await completeStep(args),state);
 }
 assert.equal(state.status,'completed');assert.equal(state.current_step,null);
 const receipts=await readReceipts(workspaceRoot);assert.equal(receipts.length,36);assert.ok(receipts.every(r=>r.workflow_profile===profile));
 assert.equal((await reconcileWorkflow({workspaceRoot})).status,'completed');
 assert.equal((await showWorkflow({workspaceRoot})).completions.total,36);
 await assert.rejects(()=>completeStep({workspaceRoot,pluginRoot,step:37,attemptId:'x',summary:'x',evidence:[]}),{code:'STEP_RANGE'});
});
test('profile36 import preserves source bytes, sparse prefix and matching receipt identities',async()=>{
 const workspaceRoot=await makeWorkspace();const pluginRoot=await makePluginFixture({workflowProfile:profile});
 const bytes=await writeClaudeFixture(workspaceRoot,{schema_version:2,workflow_profile:profile,total_steps:36,current_step:4,completed_steps:[1,2,4]}, {bom:true});
 const args={workspaceRoot,pluginRoot};const result=await importClaudeProgress(args);
 assert.equal(result.state.workflow_profile,profile);assert.deepEqual(result.state.completed_steps,[1,2]);assert.equal(result.state.current_step,3);
 assert.ok(result.warnings.some(w=>w.includes('sparse')));assert.deepEqual(await readFile(join(workspaceRoot,'step_archive/progress.json')),bytes);
 assert.ok((await readReceipts(workspaceRoot)).every(r=>r.workflow_profile===profile));
 await assert.rejects(()=>importClaudeProgress(args),{code:"CODEX_STATE_EXISTS"});
 assert.deepEqual(await readState(workspaceRoot),result.state);
});
test('profile36 receipt-first recovery, pause/resume and mixed-profile show/recovery isolation',async()=>{
 const workspaceRoot=await makeWorkspace();const pluginRoot=await makePluginFixture({workflowProfile:profile});
 const initial=await initWorkflow({workspaceRoot,workflowProfile:profile,topic:'Recovery fixture'});
 const begun=await beginStep({workspaceRoot,step:1,marker:initial.continuation});
 const args={workspaceRoot,pluginRoot,step:1,attemptId:begun.attempt.id,summary:'first',evidence:[{acceptance_id:'state-transition',kind:'check',ok:true,detail:'verified'}]};
 await completeStep(args);await writeStateAtomic(workspaceRoot,begun.state);
 assert.equal((await reconcileWorkflow({workspaceRoot})).current_step,2);
 const paused=await pauseWorkflow({workspaceRoot,reason:'user-request'});assert.equal(paused.status,'paused');
 assert.equal((await resumeWorkflow({workspaceRoot})).current_step,2);
 const path=join(pathsFor(workspaceRoot).receiptsDir,'step001.json');const r=JSON.parse(await readFile(path,'utf8'));r.schema_version=1;delete r.workflow_profile;await writeFile(path,JSON.stringify(r));
 assert.equal((await showWorkflow({workspaceRoot})).completions.total,0);
 assert.equal((await reconcileWorkflow({workspaceRoot})).blocked_reason,'RECEIPT_PROFILE_MISMATCH');
});
test('read-only shared Codex probe recognizes36 and rejects ambiguous profile counts',()=>{
 const state=initial();const result=summarizeState(state);assert.equal(result.kind,'valid');assert.match(contextLine(result),/1\/36/);
 for(const value of [{...state,total_steps:50},{...state,workflow_profile:'unknown'},{...state,schema_version:1}]) assert.equal(summarizeState(value).kind,'invalid');
});
test('runtime profile contracts reject source drift and invalid dependency references',async()=>{
 const root=await makePluginFixture({workflowProfile:profile});const source=join(root,`assets/profiles/${profile}/steps/step001.md`);
 await writeFile(source,'changed source');await assert.rejects(()=>loadStepContract(root,1,profile),{code:'STEP_CONTRACT_INVALID'});
 const other=await makePluginFixture({workflowProfile:profile});const path=join(other,`codex/assets/profiles/${profile}/steps/index.json`);const index=JSON.parse(await readFile(path,'utf8'));index.steps[0].requires=['step037'];await writeFile(path,JSON.stringify(index));
 await assert.rejects(()=>loadStepContract(other,1,profile),{code:'STEP_CONTRACT_INVALID'});
});
test('CLI defaults20 and session context reflects selected total',async()=>{
 const workspaceRoot=await makeWorkspace();
 const result=await runCli(['init','--workspace',workspaceRoot,'--input','-'],{input:{topic:'Fresh public CLI36'}});
 assert.equal(result.code,0,result.stderr);const state=JSON.parse(result.stdout);assert.equal(state.total_steps,20);assert.equal(state.workflow_profile,'planning-first-20-v1');
 const hook=await handleSessionStart({}, {workspaceRoot});assert.match(hook.hookSpecificOutput.additionalContext,/0\/20 complete/);
 const rejected=await runCli(['begin','--workspace',workspaceRoot,'--step','37','--input','-'],{input:{marker:state.continuation}});
 assert.notEqual(rejected.code,0);assert.equal(JSON.parse(rejected.stderr).error.code,'STEP_RANGE');
 await assert.rejects(()=>failStep({workspaceRoot,step:37,attemptId:'bad',reason:'bad',evidence:[]}),{code:'STEP_RANGE'});
});
test('schema2 importer rejects string counts and reset archives legacy without reinterpreting it',async()=>{
 assert.throws(()=>normalizeClaudeProgress({schema_version:2,workflow_profile:profile,total_steps:'36',current_step:1,completed_steps:[]}),{code:'CLAUDE_TOTAL_STEPS'});
 const workspaceRoot=await makeWorkspace();const before=await initWorkflow({workspaceRoot,workflowProfile:'legacy-50-v1',topic:'Legacy reset'});
 const {backupPath}=await resetWorkflow({workspaceRoot});const archived=JSON.parse(await readFile(join(backupPath,'state.json'),'utf8'));
 assert.deepEqual(archived,before);assert.equal((await showWorkflow({workspaceRoot})).active,false);
 const fresh=await initWorkflow({workspaceRoot:await makeWorkspace(),topic:'Explicit fresh run after retained archive'});assert.equal(fresh.workflow_profile,'planning-first-20-v1');
});
test('canonical final36 preserves console, screenshots, current HTML and six-matrix independent evidence',async()=>{
 const contract=await loadStepContract(resolve(import.meta.dirname,'../..'),36,profile);
 const workspaceRoot=await makeWorkspace();const evidence=[];
 for(const item of contract.acceptance.filter(d=>d.required)){
   const e={acceptance_id:item.id,kind:item.kind,ok:true,detail:'Synthetic independent fixture observation'};
   if(item.kind==='artifact'){
     const path=join(workspaceRoot,item.path);await mkdir(dirname(path),{recursive:true});
     await writeFile(path,item.validator==='html-document'?completionHtml:`Fixture ${item.id}`);
     e.artifact_path=item.path;
   }
   if(item.kind==='command'){e.command=item.command??'npm run build';e.exit_code=0;}
   evidence.push(e);
 }
 for(const item of contract.acceptance.filter(d=>d.validator==='browser-output')) await writeFile(join(workspaceRoot,item.path),JSON.stringify(passingBrowserReport(await hashFile(join(workspaceRoot,'dist/index.html')))));
 await prepareFinalRegression(workspaceRoot,{workflowProfile:profile});await prepareQuality(workspaceRoot);
 const input={contract,workflowProfile:profile,evidence,workspaceRoot};
 const valid=await validateCompletionEvidence(input);assert.ok(valid.evidence.some(e=>e.acceptance_id==='final-regression-report'));
 for(const id of ['final-desktop-screenshot','final-mobile-screenshot','final-visual-inspection']) await assert.rejects(()=>validateCompletionEvidence({...input,evidence:evidence.filter(e=>e.acceptance_id!==id)}),{code:'ACCEPTANCE_MISSING'});
 await prepareFinalRegression(workspaceRoot,{workflowProfile:profile,status:'fail'});await prepareQuality(workspaceRoot);
 await assert.rejects(()=>validateCompletionEvidence(input),{code:'ACCEPTANCE_FINAL_REGRESSION_INCOMPLETE'});
 await writeFile(join(workspaceRoot,'dist/index.html'),'<html><body>Replaced final build</body></html>');
 await assert.rejects(()=>validateCompletionEvidence(input),{code:'ACCEPTANCE_ARTIFACT_CONTENT'});
});
test('schema2 replay cannot omit runtime reports even through a minimal contract',async()=>{
 for(const number of [26,30,36]){
 const contract={number,id:`step${number}`,acceptance:[{id:'ok',kind:'check',required:true,description:'Verified'}]};
 const evidence=[{acceptance_id:'ok',kind:'check',ok:true,detail:'ok'}];
 await assert.rejects(()=>validateCompletionEvidence({contract,workflowProfile:profile,evidence,persistedEvidence:evidence}),{code:'ACCEPTANCE_MISSING'});
 }
});
test('completion reads valid state before resolving contracts and rejects mixed receipt retry',async()=>{
 const workspaceRoot=await makeWorkspace();const pluginRoot=await makePluginFixture({workflowProfile:profile});
 const state=await initWorkflow({workspaceRoot,workflowProfile:profile,topic:'Profile binding fixture'});const begun=await beginStep({workspaceRoot,step:1,marker:state.continuation});
 const args={workspaceRoot,pluginRoot,step:1,attemptId:begun.attempt.id,summary:'first',evidence:[{acceptance_id:'state-transition',kind:'check',ok:true,detail:'verified'}]};
 await completeStep(args);const path=join(pathsFor(workspaceRoot).receiptsDir,'step001.json');const receipt=JSON.parse(await readFile(path,'utf8'));receipt.schema_version=1;delete receipt.workflow_profile;await writeFile(path,JSON.stringify(receipt));
 await assert.rejects(()=>completeStep(args),{code:'RECEIPT_PROFILE_MISMATCH'});
 await writeFile(pathsFor(workspaceRoot).statePath,JSON.stringify({...state,total_steps:50}));
 await assert.rejects(()=>completeStep({...args,pluginRoot:'missing-plugin'}),{code:'STATE_INVALID'});
});
test('unknown fresh profile fails before creating topic or workflow metadata',async()=>{
 const workspaceRoot=await makeWorkspace();
 await assert.rejects(()=>initWorkflow({workspaceRoot,workflowProfile:'../unknown',topic:'Must not publish'}));
 await assert.rejects(()=>readFile(join(workspaceRoot,'step_archive/TOPIC/TOPIC.md')),{code:'ENOENT'});
 assert.equal(await readState(workspaceRoot),null);
});
test('direct explicit-profile acceptance rejects out-of-range contracts and malformed replay evidence',async()=>{
 const contract=number=>({number,id:`step${number}`,acceptance:[{id:'ok',kind:'check',required:true,description:'ok'}]});
 const evidence=[{acceptance_id:'ok',kind:'check',ok:true,detail:'verified'}];
 await assert.rejects(()=>validateCompletionEvidence({workflowProfile:profile,contract:contract(37),evidence}),{code:'STEP_CONTRACT_INVALID'});
 await assert.rejects(()=>validateCompletionEvidence({workflowProfile:profile,contract:contract(26),evidence,persistedEvidence:{}}),{code:'EVIDENCE_INVALID'});
});


test('new36 completion rejects a current six-matrix same-agent report even with a minimal contract', async () => {
  const workspaceRoot = await makeWorkspace();
  await mkdir(join(workspaceRoot, 'dist'), { recursive: true });
  await writeFile(join(workspaceRoot, 'dist/index.html'), '<html><body>Final fixture</body></html>');
  await prepareFinalRegression(workspaceRoot, { workflowProfile: profile, verifierMode: 'same-agent' });
  await prepareQuality(workspaceRoot);
  const qa = await inspectQa(workspaceRoot, 36);
  assert.equal(qa.status, 'current');
  assert.equal(qa.verdict, 'PASS');
  assert.equal(qa.report.verifier.mode, 'same-agent');
  assert.equal(qa.report.outcomes.length, 6);
  const input = {
    workflowProfile: profile,
    workspaceRoot,
    contract: { number: 36, id: 'step036', acceptance: [
      { id: 'ok', kind: 'check', required: true, description: 'Fixture completion' }
    ] },
    evidence: [{ acceptance_id: 'ok', kind: 'check', ok: true, detail: 'Verified fixture' }]
  };
  await assert.rejects(() => validateCompletionEvidence(input), { code: 'ACCEPTANCE_FINAL_REGRESSION_INCOMPLETE' });
  await prepareFinalRegression(workspaceRoot, { workflowProfile: profile });
  await prepareQuality(workspaceRoot);
  const accepted = await validateCompletionEvidence(input);
  assert.ok(accepted.evidence.some(item => item.acceptance_id === 'final-regression-report'));
});
