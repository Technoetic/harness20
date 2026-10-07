import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';
import { initWorkflow, beginStep, failStep } from '../scripts/lib/workflow.mjs';
import { snapshotQa, recordQa } from '../../scripts/lib/qa-report.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';

const cli = fileURLToPath(new URL('../../scripts/workflow-memory.mjs', import.meta.url));
const now = '2026-10-08T00:00:00.000Z';
const diagnostic = {error:{code:'MEMORY_COMMAND_FAILED',message:'Workflow memory command failed'}};
function run(args,input='') {
  const r=spawnSync(process.execPath,[cli,...args],{input,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
  assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;
}
function call(root,command,input,exit=0) {
  const r=run([command,'--workspace',root,'--input','-'],JSON.stringify(input));
  assert.equal(r.status,exit,r.stderr||r.stdout);assert.equal(r.stderr,'');return JSON.parse(r.stdout);
}
function failed(r) {assert.equal(r.status,2);assert.equal(r.stdout,'');assert.deepEqual(JSON.parse(r.stderr),diagnostic);}
async function fixture() {
  const root=await makeWorkspace();
  const state=await initWorkflow({workspaceRoot:root,topic:'Repair public total fixture.',now,idFactory:()=> 'cli-generation'});
  const begun=await beginStep({workspaceRoot:root,step:1,marker:state.continuation,now,idFactory:()=> 'cli-attempt'});
  await failStep({workspaceRoot:root,step:1,attemptId:begun.attempt.id,reason:'Wrong total.',evidence:[],now});
  await mkdir(join(root,'src'));const bytes=Buffer.from('export const total = 7;');await writeFile(join(root,'src/app.js'),bytes);
  // The host actually checks the candidate before declaring its QA outcome.
  assert.equal(Number(bytes.toString().match(/total = (\d+)/)[1]),7);
  await writeFile(join(root,'step_archive/outputs/check.json'),JSON.stringify({observed_total:7,exit_code:0}));
  const snapshot=await snapshotQa(root,1,{artifacts:['src/app.js'],checks:[{id:'total',requirement:'Total equals seven.'}]});
  const qa=await recordQa(root,1,{snapshot_id:snapshot.snapshot_id,verifier:{id:'fixture-host',mode:'same-agent'},outcomes:[{
    id:'total',status:'pass',observation:'Host observed total seven.',evidence_paths:['step_archive/outputs/check.json'],next_check:''}],next_actions:[]});
  const source={path:'src/app.js',file_sha256:sha256(bytes),start_byte:0,end_byte:bytes.length,range_sha256:sha256(bytes)};
  const input={task_id:'total-task',failure:{step:1,attempt_id:begun.attempt.id},repair_observation:'Corrected the total.',
    scope:{task_ids:['total-task'],source_paths:['src/app.js'],check_ids:['total']},sources:[source],
    verification:{step:1,report_sha256:qa.report_sha256,check_ids:['total']},validity:{from:now,until:'2026-11-08T00:00:00.000Z'},related_ids:[],supersedes:[]};
  return {root,input,source};
}

test('memory CLI rejects unknown, duplicate, missing and ambiguous flags with fixed diagnostics',async()=>{
  const root=await makeWorkspace(),base=['failure','--workspace',root,'--input','-'];
  for(const args of [[],['unknown'],[...base,'--extra','SECRET_SENTINEL'],[...base,'--workspace',root],
    ['failure','--workspace',root],['failure','--workspace',root,'--input','secret.json'],
    ['failure','--workspace='+root,'--input','-'],[...base,'SECRET_SENTINEL']]) failed(run(args,'{}'));
});
test('memory CLI rejects malformed, duplicate-field, oversized, secret and unknown-field JSON safely',async()=>{
  const {root}=await fixture(),args=['failure','--workspace',root,'--input','-'];
  for(const input of ['', '[]','null','{} {}','{"step":1,"step":2}',Buffer.from([0xc3,0x28]),
    JSON.stringify({private:'SECRET_SENTINEL'.repeat(25000)}),'{"password":"SECRET_SENTINEL"}',
    '{"attempt_id":"password=SECRET_SENTINEL"}']) failed(run(args,input));
});
test('memory CLI exposes real failure, verified record, inspection, observation and retirement',async()=>{
  const f=await fixture();assert.equal(call(f.root,'failure',f.input.failure).status,'current');
  const saved=call(f.root,'record',f.input);assert.equal(saved.status,'recorded');
  const query={task_id:'total-task',sources:[f.source],check_ids:['total'],max_results:8,max_bytes:16384,as_of:now};
  assert.equal(call(f.root,'inspect',query).lessons[0].lesson_id,saved.lesson_id);
  assert.equal(call(f.root,'observe',{lesson_id:saved.lesson_id,observation_id:'retry1',applicable:true,outcome:'resolved',
    observed_at:now,task_id:'total-task',sources:[f.source],check_ids:['total'],verification:f.input.verification}).status,'recorded');
  assert.equal(call(f.root,'retire',{lesson_id:saved.lesson_id,retired_at:now,reason:'Requirement changed.'}).status,'recorded');
  assert.equal(call(f.root,'inspect',query).lessons.length,0);
});
test('memory CLI refuses caller success and stale source without echoing supplied details',async()=>{
  const f=await fixture();failed(run(['record','--workspace',f.root,'--input','-'],JSON.stringify({...f.input,success:true})));
  await writeFile(join(f.root,'src/app.js'),'export const total = 8;');
  failed(run(['record','--workspace',f.root,'--input','-'],JSON.stringify(f.input)));
});
test('every memory CLI command reports generationless legacy as explicitly unsupported',async()=>{
  const f=await fixture(),root=await makeWorkspace();await initWorkflow({workspaceRoot:root,workflowProfile:'legacy-50-v1',topic:'Public legacy fixture.',now,idFactory:()=> 'legacy-cli'});
  const query={task_id:'total-task',sources:[f.source],check_ids:['total'],max_results:8,max_bytes:16384,as_of:now};
  const lesson_id='a'.repeat(64);
  for(const [command,input] of [['failure',{}],['record',f.input],['inspect',query],
    ['observe',{lesson_id,observation_id:'legacy-outcome',applicable:false,outcome:'unknown',observed_at:now,task_id:'total-task',sources:[f.source],check_ids:['total']}],
    ['retire',{lesson_id,retired_at:now,reason:'Withdraw legacy advice.'}]]) {
    const result=call(root,command,input,2);assert.equal(result.status,'unsupported');assert.equal(result.advisory,true);
  }
});
