import test from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { mkdir, readFile, writeFile, link, rename } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname, basename } from 'node:path';
import { makeWorkspace, makePluginFixture, makeDirectoryLink } from './helpers/workspace.mjs';
import { initWorkflow, beginStep, completeStep } from '../scripts/lib/workflow.mjs';
import { snapshotQa, recordQa } from '../../scripts/lib/qa-report.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';

const api = await import('../../scripts/lib/workflow-trials.mjs').catch(() => ({}));
const now = '2026-10-10T00:00:00.000Z';
const ref = (path, text) => ({path,file_sha256:sha256(text),start_byte:0,end_byte:Buffer.byteLength(text),range_sha256:sha256(text)});
async function fixture() {
  assert.equal(typeof api.prepareTrial, 'function', 'offline trials API must exist');
  const root = await makeWorkspace();
  await initWorkflow({workspaceRoot:root,workflowProfile:'planning-first-20-v1',topic:'Public total fixture.',now,idFactory:()=> 'trial-run'});
  await mkdir(join(root,'src')); await writeFile(join(root,'src/app.js'),'export const total = 7;');
  await mkdir(join(root,'step_archive/outputs'),{recursive:true});
  await writeFile(join(root,'step_archive/outputs/observed.json'),'{"total":7}');
  const source = ref('src/app.js','export const total = 7;');
  const evidence = ref('step_archive/outputs/observed.json','{"total":7}');
  const snapshot = await snapshotQa(root,1,{artifacts:['src/app.js'],checks:[{id:'total',requirement:'The displayed total equals seven.'}]});
  const qa = await recordQa(root,1,{snapshot_id:snapshot.snapshot_id,verifier:{id:'independent-reviewer',mode:'independent'},
    outcomes:[{id:'total',status:'pass',observation:'Observed seven.',evidence_paths:[evidence.path],next_check:''}],next_actions:[]});
  const input = {trial_id:'public-trial',task_id:'total-task',scenarios:[{id:'normal',check_ids:['total']}],sources:[source],
    model_id:'public-model',provider_id:'public-provider',budgets:{actions:8,tokens:1000},tool_set_sha256:sha256('public-tools'),
    config_sha256:sha256('public-config'),variants:{baseline_sha256:sha256('prompt-old'),candidate_sha256:sha256('prompt-new')}};
  return {root,input,source,evidence,qa};
}
async function prepared() {const f=await fixture();return {...f,saved:await api.prepareTrial(f.root,f.input)};}
function observation(f, arm='baseline') { return {trial_id:f.input.trial_id,manifest_sha256:f.saved.manifest_sha256,
  task_id:f.input.task_id,scenario_id:'normal',arm,variant_sha256:f.input.variants[`${arm}_sha256`],
  model_id:f.input.model_id,provider_id:f.input.provider_id,budgets:f.input.budgets,check_ids:['total'],outcome:'pass',
  actions:arm==='baseline'?6:4,tokens:arm==='baseline'?600:400,duration_ms:arm==='baseline'?200:100,hard_failure:false,
  qa:{step:1,report_sha256:f.qa.report_sha256},evidence:[f.evidence]}; }
const selector = f => ({trial_id:f.input.trial_id,manifest_sha256:f.saved.manifest_sha256});

test('frozen preparation and exact record replay preserve immutable bytes and workflow state', async()=>{
  const f=await prepared(), state=await readFile(join(f.root,'step_archive/.harness50-codex/state.json'));
  assert.equal(f.saved.advisory,true);assert.equal(f.saved.observation_origin,'caller-reported');
  assert.equal((await api.prepareTrial(f.root,f.input)).manifest_sha256,f.saved.manifest_sha256);
  const record=await api.recordTrial(f.root,observation(f));const bytes=await readFile(join(f.root,record.record_path));
  assert.equal((await api.recordTrial(f.root,observation(f))).replayed,true);
  assert.deepEqual(await readFile(join(f.root,record.record_path)),bytes);
  await assert.rejects(()=>api.recordTrial(f.root,{...observation(f),actions:5}),e=>e.code==='TRIAL_CONFLICT');
  await assert.rejects(()=>api.prepareTrial(f.root,{...f.input,model_id:'another-model'}),e=>e.code==='TRIAL_CONFLICT');
  assert.deepEqual(await readFile(join(f.root,'step_archive/.harness50-codex/state.json')),state);
});

test('matching paired observations report hand-checked deltas without completion authority',async()=>{
  const f=await prepared();await api.recordTrial(f.root,observation(f));await api.recordTrial(f.root,observation(f,'candidate'));
  const result=await api.compareTrials(f.root,selector(f));assert.equal(result.status,'compared');assert.equal(result.advisory,true);
  assert.equal(result.pair_count,1);assert.deepEqual(result.deltas,{actions:-2,tokens:-200,duration_ms:-100,passed:0});
  assert.equal(result.observation_origin,'caller-reported');assert.equal(Object.hasOwn(result,'promote'),false);
});

test('missing pairs and hard failures hold rather than average away incomplete work',async()=>{
  const f=await prepared();await api.recordTrial(f.root,observation(f));
  assert.equal((await api.compareTrials(f.root,selector(f))).status,'hold');
  await api.recordTrial(f.root,{...observation(f,'candidate'),outcome:'fail',hard_failure:true,qa:null});
  const result=await api.compareTrials(f.root,selector(f));assert.equal(result.status,'hold');assert.ok(result.reasons.includes('hard_failure'));
});

test('recording rejects changed model, provider, budget, task, variant and scenario coverage',async()=>{
  const f=await prepared();for(const change of [{model_id:'other'},{provider_id:'other'},{budgets:{actions:9,tokens:1000}},
    {task_id:'other-task'},{variant_sha256:sha256('other')},{scenario_id:'absent'},{check_ids:['invented']},
    {actions:9},{tokens:1001},{duration_ms:-1},{hard_failure:'false'}])
    await assert.rejects(()=>api.recordTrial(f.root,{...observation(f),...change}));
});

test('PASS requires exact current QA digest and all declared passing checks',async()=>{
  const f=await prepared();for(const qa of [null,{step:1,report_sha256:'0'.repeat(64)},{step:2,report_sha256:f.qa.report_sha256}])
    await assert.rejects(()=>api.recordTrial(f.root,{...observation(f),qa}));
  await writeFile(join(f.root,f.evidence.path),'changed evidence');
  await assert.rejects(()=>api.recordTrial(f.root,observation(f)));
});

test('every declared passing check must intersect the caller-selected evidence hashes',async()=>{
  const f=await fixture();await writeFile(join(f.root,'step_archive/outputs/second.json'),'{"second":true}');
  const snapshot=await snapshotQa(f.root,1,{artifacts:['src/app.js'],checks:[{id:'total',requirement:'Seven.'},{id:'second',requirement:'Second observed.'}]});
  const qa=await recordQa(f.root,1,{snapshot_id:snapshot.snapshot_id,verifier:{id:'reviewer',mode:'independent'},
    outcomes:[{id:'total',status:'pass',observation:'Seven.',evidence_paths:[f.evidence.path],next_check:''},
      {id:'second',status:'pass',observation:'Observed.',evidence_paths:['step_archive/outputs/second.json'],next_check:''}],next_actions:[]});
  f.input.scenarios[0].check_ids=['total','second'];f.saved=await api.prepareTrial(f.root,f.input);f.qa=qa;
  await assert.rejects(()=>api.recordTrial(f.root,{...observation(f),check_ids:['total','second']}),e=>e.code==='TRIAL_UNVERIFIED');
});

test('QA inspection refuses control and unselected artifact bodies even when the stored report passes',async()=>{
  for(const path of ['AGENTS.md','src/unselected.js']) {
    const f=await fixture();await writeFile(join(f.root,path),'PUBLIC_UNSELECTED_BODY_DO_NOT_READ');
    const snapshot=await snapshotQa(f.root,1,{artifacts:['src/app.js',path],checks:[{id:'total',requirement:'Seven.'}]});
    f.qa=await recordQa(f.root,1,{snapshot_id:snapshot.snapshot_id,verifier:{id:'public-reviewer',mode:'independent'},
      outcomes:[{id:'total',status:'pass',observation:'Seven.',evidence_paths:[f.evidence.path],next_check:''}],next_actions:[]});
    f.saved=await api.prepareTrial(f.root,f.input);
    await assert.rejects(()=>api.recordTrial(f.root,observation(f)),e=>e.code==='TRIAL_UNVERIFIED'&&!e.message.includes('PUBLIC_UNSELECTED'));
  }
});

test('stale QA and observed evidence invalidate a previously saved pair',async()=>{
  const f=await prepared();await api.recordTrial(f.root,observation(f));await api.recordTrial(f.root,observation(f,'candidate'));
  await writeFile(join(f.root,f.evidence.path),'changed evidence');
  assert.equal((await api.compareTrials(f.root,selector(f))).status,'hold');
});

test('changed saved observation bytes cannot silently become a different valid comparison',async()=>{
  const f=await prepared(),saved=await api.recordTrial(f.root,observation(f));await api.recordTrial(f.root,observation(f,'candidate'));
  const record=JSON.parse(await readFile(join(f.root,saved.record_path),'utf8'));record.actions=5;
  await writeFile(join(f.root,saved.record_path),JSON.stringify(record));
  assert.equal((await api.compareTrials(f.root,selector(f))).status,'hold');
});

test('changed sources, TOPIC or workflow generation invalidate frozen manifests',async()=>{
  for(const path of ['src/app.js','step_archive/TOPIC/TOPIC.md','step_archive/.harness50-codex/state.json']) {
    const f=await prepared();if(path.endsWith('state.json')) {const state=JSON.parse(await readFile(join(f.root,path),'utf8'));state.workflow_id='other-run';await writeFile(join(f.root,path),JSON.stringify(state));}
    else await writeFile(join(f.root,path),'changed');
    assert.equal((await api.inspectTrial(f.root,selector(f))).status,'stale');
    await assert.rejects(()=>api.recordTrial(f.root,observation(f)));
  }
});

test('selected plugin body bytes are pinned independently of workspace sources',async()=>{
  const f=await fixture(),pluginRoot=await makePluginFixture({workflowProfile:'planning-first-20-v1'});
  const saved=await api.prepareTrial(f.root,f.input,{pluginRoot});
  await writeFile(join(pluginRoot,'codex/assets/profiles/planning-first-20-v1/steps/step001.md'),'changed plugin body');
  assert.equal((await api.inspectTrial(f.root,{trial_id:f.input.trial_id,manifest_sha256:saved.manifest_sha256},{pluginRoot})).status,'stale');
});

test('source controls, secrets, excluded files, linked files and nested caller data are rejected without leaks',async()=>{
  const f=await fixture();for(const path of ['src/config.json','.env','AGENTS.md','node_modules/a.js','step_archive/.harness50-codex/state.json'])
    await assert.rejects(()=>api.prepareTrial(f.root,{...f.input,sources:[{...f.source,path}]}),e=>!e.message.includes(path));
  await link(join(f.root,'src/app.js'),join(f.root,'src/linked.js'));
  await assert.rejects(()=>api.prepareTrial(f.root,{...f.input,sources:[{...f.source,path:'src/linked.js'}]}));
  for(const change of [{provider_id:'password=SECRET_SENTINEL'},{config:{auth:'SECRET_SENTINEL'}},{model_id:{nested:'SECRET_SENTINEL'}}])
    await assert.rejects(()=>api.prepareTrial(f.root,{...f.input,...change}),e=>!e.message.includes('SECRET_SENTINEL'));
});

test('linked auxiliary output paths fail closed without writing outside workspace',async()=>{
  const f=await fixture(),outside=await makeWorkspace();await makeDirectoryLink(outside,join(f.root,'step_archive/outputs/workflow-trials'));
  await assert.rejects(()=>api.prepareTrial(f.root,f.input));
});

test('a parent junction swapped at exclusive-open time receives no manifest payload bytes',async()=>{
  const f=await fixture(),outside=await makeWorkspace(),original=fsPromises.open;let injected=false;
  f.input.trial_id='public-write-race';
  fsPromises.open=async(path,...args)=>{
    if(!injected&&args[0]==='wx'&&String(path).endsWith('public-write-race.manifest.json')) {
      injected=true;const parent=dirname(path);await rename(parent,`${parent}.public-held`);await makeDirectoryLink(outside,parent);
    }
    return original(path,...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(()=>api.prepareTrial(f.root,f.input));assert.equal(injected,true);
    const escaped=await readFile(join(outside,basename('public-write-race.manifest.json')));
    assert.equal(escaped.length,0,'rejection must occur before payload bytes are written');
  } finally {fsPromises.open=original;syncBuiltinESMExports();}
});

test('concurrent identical and conflicting records never overwrite an established arm',async()=>{
  const f=await prepared(),a=observation(f),b={...a,actions:5};
  const outcomes=await Promise.allSettled([api.recordTrial(f.root,a),api.recordTrial(f.root,b)]);
  assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);
  const success=outcomes.find(v=>v.status==='fulfilled').value;
  const bytes=await readFile(join(f.root,success.record_path));
  const stored=JSON.parse(bytes);assert.ok([5,6].includes(stored.actions));
  const replay={...a,actions:stored.actions};assert.equal((await api.recordTrial(f.root,replay)).replayed,true);
  assert.deepEqual(await readFile(join(f.root,success.record_path)),bytes);
});

test('trace projects flat receipt metadata, omits commands and text, and leaves authoritative files unchanged',async()=>{
  const f=await fixture(),pluginRoot=await makePluginFixture({workflowProfile:'planning-first-20-v1'});
  const state=JSON.parse(await readFile(join(f.root,'step_archive/.harness50-codex/state.json'),'utf8'));
  const begun=await beginStep({workspaceRoot:f.root,step:1,marker:state.continuation,now:'2026-10-10T00:00:01.000Z',idFactory:()=> 'trace-attempt'});
  await completeStep({workspaceRoot:f.root,pluginRoot,step:1,attemptId:begun.attempt.id,summary:'PRIVATE_SUMMARY_DO_NOT_EMIT',
    evidence:[{acceptance_id:'state-transition',kind:'check',detail:'DO_NOT_EXECUTE_OR_EMIT',ok:true}],now:'2026-10-10T00:00:02.000Z'});
  const path='step_archive/.harness50-codex/receipts/step001.json';
  const receipt=JSON.parse(await readFile(join(f.root,path),'utf8'));
  receipt.evidence.push({acceptance_id:'public-command',kind:'command',detail:'PRIVATE_COMMAND_DETAIL',ok:true,command:'DO_NOT_EXECUTE_OR_EMIT'});
  await writeFile(join(f.root,path),JSON.stringify(receipt));const bytes=await readFile(join(f.root,path));
  const trace=await api.exportTrace(f.root,{});assert.equal(trace.status,'current');assert.equal(trace.receipt_count,1);
  const text=JSON.stringify(trace);assert.ok(!text.includes('PRIVATE_SUMMARY'));assert.ok(!text.includes('DO_NOT_EXECUTE'));
  assert.equal(trace.events[0].step,1);assert.equal(trace.events[0].ok,true);assert.equal(trace.events[0].kind,'check');
  assert.ok(trace.events.every(event=>Object.values(event).every(value=>value===null||typeof value!=='object')));
  assert.deepEqual(await readFile(join(f.root,path)),bytes);
});

test('trace rejects nested or foreign receipts and aliases with generic redacted diagnostics',async()=>{
  for(const mode of ['nested','foreign','alias']) {
    const f=await fixture(),state=JSON.parse(await readFile(join(f.root,'step_archive/.harness50-codex/state.json'),'utf8'));
    state.completed_steps=[1];state.current_step=2;state.continuation=null;state.current_attempt=null;state.status='paused';state.paused_reason='public pause';
    await writeFile(join(f.root,'step_archive/.harness50-codex/state.json'),JSON.stringify(state));
    const receipt={schema_version:2,workflow_profile:'planning-first-20-v1',workflow_id:mode==='foreign'?'other-run':state.workflow_id,
      step:1,attempt_id:'public-attempt',provenance:'codex-verified',completed_at:now,summary:'DO_NOT_EMIT',
      evidence:[{acceptance_id:'total',kind:'check',detail:'public observation',ok:true,...(mode==='nested'?{nested:{auth:'SECRET_SENTINEL'}}:{})}]};
    await mkdir(join(f.root,'step_archive/.harness50-codex/receipts'),{recursive:true});
    const path=join(f.root,'step_archive/.harness50-codex/receipts/step001.json');await writeFile(path,JSON.stringify(receipt));
    if(mode==='alias')await link(path,join(f.root,'src/receipt-alias.json'));
    const result=await api.exportTrace(f.root,{});assert.equal(result.status,'unavailable');assert.ok(!JSON.stringify(result).includes('SECRET_SENTINEL'));
  }
});
