import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, link } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkspace, makeDirectoryLink } from './helpers/workspace.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
import { memoryWorkspace } from '../../scripts/lib/memory-policy.mjs';
import { retrieveTaskContext } from '../../scripts/lib/memory-context.mjs';
import { initWorkflow, beginStep, failStep } from '../scripts/lib/workflow.mjs';
import { captureFailure, recordLesson, retireLesson } from '../../scripts/lib/workflow-memory.mjs';
import { snapshotQa, recordQa } from '../../scripts/lib/qa-report.mjs';
import { readBudgetUsage, withReadBudget } from '../../scripts/lib/read-budget.mjs';
import { readState, writeStateAtomic } from '../scripts/lib/state-store.mjs';

async function fixture() {
  const root = await makeWorkspace();
  await mkdir(join(root, 'step_archive/TOPIC'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'step_archive/TOPIC/TOPIC.md'), 'Public fixture scope\n');
  const profile = 'planning-first-20-v1';
  await writeFile(join(root, 'step_archive/progress.json'), JSON.stringify({schema_version:2,workflow_profile:profile,total_steps:20,current_step:1,completed_steps:[],run_started_at:'2026-10-08T00:00:00.000Z'}));
  await writeFile(join(root, 'step_archive/workflow-profile.json'), JSON.stringify({schema_version:2,workflow_profile:profile,total_steps:20}));
  const binding = (await memoryWorkspace(root)).binding;
  const entries = [];
  async function source(id, text, extra={}) {
    const bytes = Buffer.from(text), path = `docs/${id}.txt`;
    await writeFile(join(root,path),bytes);
    const reference={path,file_sha256:sha256(bytes),start_byte:0,end_byte:bytes.length,range_sha256:sha256(bytes)};
    entries.push({id,kind:'repository-source',role:'candidate',mandatory:false,reference,...extra});
    return entries.at(-1);
  }
  async function retrieve(extra={}) {
    const manifest={schema_version:1,binding,sources:entries};
    const bytes=Buffer.from(JSON.stringify(manifest));
    await writeFile(join(root,'docs/context.json'),bytes);
    return retrieveTaskContext(root,{manifest_path:'docs/context.json',manifest_sha256:sha256(bytes),query:'repair',budget_bytes:8192,as_of:'2026-10-08T01:00:00.000Z',...extra});
  }
  return {root,binding,entries,source,retrieve};
}

test('retrieval preserves mandatory scope, ranks matches, and accounts complete serialized bytes', async()=>{
  const f=await fixture();
  await f.source('scope','Required public scope',{role:'scope',mandatory:true});
  await f.source('repair','repair repair restart');
  await f.source('irrelevant','oranges');
  const a=await f.retrieve(), b=await f.retrieve();
  assert.deepEqual(a,b);
  assert.equal(a.status,'current');
  assert.deepEqual(a.sources.map(s=>s.id),['scope','repair']);
  assert.equal(a.serialized_bytes,Buffer.byteLength(JSON.stringify(a)));
  assert.ok(a.serialized_bytes<=8192);
  assert.equal(a.omissions[0].reason,'no_match');
  assert.equal(a.sources[0].text,'Required public scope');
});

test('indivisible mandatory excerpts block safely while optional budget omissions remain bounded',async()=>{
  const f=await fixture(); await f.source('scope','scope '.repeat(400),{role:'scope',mandatory:true});
  const blocked=await f.retrieve({budget_bytes:1024});
  assert.equal(blocked.status,'blocked'); assert.equal(blocked.diagnostic,'mandatory_context_exceeds_budget');
  assert.ok(Buffer.byteLength(JSON.stringify(blocked))<=1024);
  f.entries[0].role='candidate';f.entries[0].mandatory=false;
  const optional=await f.retrieve({query:'scope',budget_bytes:1024});
  assert.equal(optional.status,'current');assert.equal(optional.sources.length,0);
  assert.equal(optional.omissions[0].reason,'budget');
  assert.equal(optional.serialized_bytes,Buffer.byteLength(JSON.stringify(optional)));
});

test('Unicode normalization and actual hybrid ranks are deterministic; links stop after two hops',async()=>{
  const f=await fixture();
  await f.source('a','ＲＥＰＡＩＲ',{links:['b']});await f.source('b','linked',{links:['c']});
  await f.source('c','second hop',{links:['d']});await f.source('d','third hop');
  const a=await f.retrieve({backend:'hybrid',expand_links:true});
  assert.deepEqual(a.sources.map(s=>s.id),['a','b','c']);
  assert.deepEqual(a,await f.retrieve({backend:'hybrid',expand_links:true}));
});

test('hybrid fuses BM25 and overlap rank lists with fixed RRF60 instead of copying BM25',async()=>{
  const f=await fixture();await f.source('a','restart '.repeat(20));await f.source('b','repair restart '+'padding '.repeat(100));await f.source('c','repair '.repeat(20));
  const bm=await f.retrieve({query:'repair restart',backend:'bm25'}), hybrid=await f.retrieve({query:'repair restart',backend:'hybrid'});
  assert.deepEqual(bm.sources.map(s=>s.id),['a','c','b']);assert.deepEqual(hybrid.sources.map(s=>s.id),['a','b','c']);
  assert.equal(hybrid.sources[0].retrieval_score,1/61+1/62);
});

test('scope and blocker excerpts remain mandatory across work unit selection; omission IDs are bounded',async()=>{
  const f=await fixture();await f.source('scope','scope',{role:'scope',mandatory:true,work_unit_id:'another'});
  await f.source('blocker','blocker',{role:'blocker',mandatory:true});
  for(let i=0;i<126;i++)await f.source(`candidate${i}`,'repair '.repeat(80));
  const result=await f.retrieve({work_unit_id:'one',budget_bytes:2048});
  assert.equal(result.status,'current');assert.deepEqual(result.sources.map(s=>s.id),['blocker','scope']);
  assert.equal(result.omitted_count,126);assert.equal(result.omissions.length+result.omission_details_omitted,126);
  assert.ok(result.serialized_bytes<=2048);
});

test('physical links and hardlink aliases are rejected before source content can escape',async()=>{
  const f=await fixture();const s=await f.source('safe','repair');
  await link(join(f.root,s.reference.path),join(f.root,'docs/alias.txt'));
  s.reference.path='docs/alias.txt';await assert.rejects(f.retrieve(),/Invalid task context/);
  const outside=await makeWorkspace();await writeFile(join(outside,'data.txt'),'repair');
  await makeDirectoryLink(outside,join(f.root,'linked'));
  s.reference.path='linked/data.txt';await assert.rejects(f.retrieve(),/Invalid task context/);
});

test('actual pinned verified lesson records filter expiry, supersession, retirement and changed evidence',async()=>{
  const root=await makeWorkspace(), now='2026-10-08T00:00:00.000Z';
  const state=await initWorkflow({workspaceRoot:root,topic:'Public repair task.',now,idFactory:()=> 'context-generation'});
  const begun=await beginStep({workspaceRoot:root,step:1,marker:state.continuation,now:'2026-10-08T00:00:01.000Z',idFactory:()=> 'context-attempt'});
  await mkdir(join(root,'src'));await writeFile(join(root,'src/app.js'),'export const total = 7;');
  const text=await readFile(join(root,'src/app.js')),source={path:'src/app.js',file_sha256:sha256(text),start_byte:0,end_byte:text.length,range_sha256:sha256(text)};
  const failedAt='2026-10-08T00:00:02.000Z';
  await failStep({workspaceRoot:root,step:1,attemptId:begun.attempt.id,reason:'Incorrect total.',evidence:[],now:failedAt});
  assert.equal((await captureFailure({workspaceRoot:root,workflowId:begun.state.workflow_id,topicSha256:begun.state.topic_sha256,step:1,attemptId:begun.attempt.id,failedAt,reason:'Incorrect total.',evidence:[]})).status,'recorded');
  await writeFile(join(root,'step_archive/outputs/proof.json'),'{"total":7}');
  const snapshot=await snapshotQa(root,1,{artifacts:['src/app.js'],checks:[{id:'total',requirement:'Total equals seven.'}]});
  const qa=await recordQa(root,1,{snapshot_id:snapshot.snapshot_id,verifier:{id:'context-reviewer',mode:'independent'},outcomes:[{id:'total',status:'pass',observation:'Seven observed.',evidence_paths:['step_archive/outputs/proof.json'],next_check:''}],next_actions:[]});
  const input={task_id:'total-task',failure:{step:1,attempt_id:begun.attempt.id},repair_observation:'Repair the total calculation.',scope:{task_ids:['total-task'],source_paths:['src/app.js'],check_ids:['total']},sources:[source],verification:{step:1,report_sha256:qa.report_sha256,check_ids:['total']},validity:{from:now,until:'2026-11-08T00:00:00.000Z'},related_ids:[],supersedes:[]};
  const first=await recordLesson(root,input),workspace=await memoryWorkspace(root);
  async function retrieve(lesson,as_of=now) {
    const path=`${workspace.base}/lessons/${lesson.lesson_id}.json`,bytes=await readFile(join(root,path));
    const reference={path,file_sha256:sha256(bytes),start_byte:0,end_byte:bytes.length,range_sha256:sha256(bytes)};
    const manifest={schema_version:1,binding:(await memoryWorkspace(root)).binding,sources:[{id:'lesson',kind:'lesson',role:'candidate',mandatory:false,reference,lesson:{id:lesson.lesson_id,record_path:path,record_sha256:sha256(bytes),task_id:'total-task',sources:[source],check_ids:['total']}}]};
    await mkdir(join(root,'docs'),{recursive:true});const raw=Buffer.from(JSON.stringify(manifest));await writeFile(join(root,'docs/context.json'),raw);
    return retrieveTaskContext(root,{manifest_path:'docs/context.json',manifest_sha256:sha256(raw),query:'repair',budget_bytes:8192,as_of});
  }
  assert.equal((await retrieve(first)).sources.length,1);
  assert.equal((await retrieve(first,'2026-12-01T00:00:00.000Z')).sources.length,0);
  const second=await recordLesson(root,{...input,repair_observation:'Repair with a safer exact total.',supersedes:[first.lesson_id]});
  assert.equal((await retrieve(first)).sources.length,0);assert.equal((await retrieve(second)).sources.length,1);
  await retireLesson(root,{lesson_id:second.lesson_id,retired_at:now,reason:'Requirement withdrawn.'});
  assert.equal((await retrieve(second)).sources.length,0);
  const stateBefore=await readState(root);await writeStateAtomic(root,{...stateBefore,workflow_id:'context-next-generation',
    continuation:{...stateBefore.continuation,workflow_id:'context-next-generation'}});
  assert.equal((await retrieve(first)).sources.length,0,'selecting only the superseded origin must omit it');
  assert.equal((await retrieve(second)).sources.length,0,'retired origin remains inactive');
  await writeStateAtomic(root,stateBefore);
  await writeFile(join(root,'step_archive/outputs/proof.json'),'changed');
  assert.equal((await retrieve(first)).sources.length,0);
  // The selected lesson JSON is small; its independently pinned QA evidence is
  // deliberately large. The request must meter nested proof reads as well.
  await writeFile(join(root,'step_archive/outputs/proof.json'),Buffer.alloc(8*1024*1024,0x61));
  const bigSnapshot=await snapshotQa(root,1,{artifacts:['src/app.js'],checks:[{id:'total',requirement:'Total equals seven.'}]});
  const bigQa=await recordQa(root,1,{snapshot_id:bigSnapshot.snapshot_id,verifier:{id:'context-reviewer',mode:'independent'},outcomes:[{id:'total',status:'pass',observation:'Seven observed.',evidence_paths:['step_archive/outputs/proof.json'],next_check:''}],next_actions:[]});
  const bigLesson=await recordLesson(root,{...input,repair_observation:'Repair backed by large public proof.',verification:{...input.verification,report_sha256:bigQa.report_sha256}});
  let usage;
  await assert.rejects(withReadBudget(32*1024*1024,async()=>{
    const result=await retrieve(bigLesson);usage=readBudgetUsage();
    assert.equal(result.status,'blocked','proof quota overflow must not appear as a successful empty context');
    assert.equal(result.diagnostic,'context_read_budget_exceeded');
  }),error=>error.code==='READ_BUDGET_EXCEEDED');
  assert.ok(usage.used>8*1024*1024,'nested QA evidence must be charged to the same request');
  assert.ok(usage.used<=32*1024*1024);
});

test('lesson inspection batches bounded projections without silently losing a relevant late record',async()=>{
  const root=await makeWorkspace(),now='2026-10-08T00:00:00.000Z';
  const state=await initWorkflow({workspaceRoot:root,topic:'Public bounded batch task.',now,idFactory:()=> 'batch-generation'});
  const begun=await beginStep({workspaceRoot:root,step:1,marker:state.continuation,now:'2026-10-08T00:00:01.000Z',idFactory:()=> 'batch-attempt'});
  const failedAt='2026-10-08T00:00:02.000Z';await failStep({workspaceRoot:root,step:1,attemptId:begun.attempt.id,reason:'Repair required.',evidence:[],now:failedAt});
  assert.equal((await captureFailure({workspaceRoot:root,workflowId:begun.state.workflow_id,topicSha256:begun.state.topic_sha256,step:1,attemptId:begun.attempt.id,failedAt,reason:'Repair required.',evidence:[]})).status,'recorded');
  await mkdir(join(root,'src'));const text=Buffer.from('export const result = 7;');await writeFile(join(root,'src/app.js'),text);
  const source={path:'src/app.js',file_sha256:sha256(text),start_byte:0,end_byte:text.length,range_sha256:sha256(text)};
  await writeFile(join(root,'step_archive/outputs/proof.json'),'{"result":7}');
  const snapshot=await snapshotQa(root,1,{artifacts:['src/app.js'],checks:[{id:'result',requirement:'Result equals seven.'}]});
  const qa=await recordQa(root,1,{snapshot_id:snapshot.snapshot_id,verifier:{id:'batch-reviewer',mode:'independent'},outcomes:[{id:'result',status:'pass',observation:'Seven observed.',evidence_paths:['step_archive/outputs/proof.json'],next_check:''}],next_actions:[]});
  const common={task_id:'batch-task',failure:{step:1,attempt_id:begun.attempt.id},scope:{task_ids:['batch-task'],source_paths:['src/app.js'],check_ids:['result']},sources:[source],verification:{step:1,report_sha256:qa.report_sha256,check_ids:['result']},validity:{from:now,until:'2026-11-08T00:00:00.000Z'},related_ids:[],supersedes:[]};
  const sources=[];let selected=null,total=0;
  for(let i=0;i<40;i++) {
    const lesson=await recordLesson(root,{...common,repair_observation:`Repair observation ${i}: `+'bounded public detail '.repeat(30)});
    const bytes=await readFile(join(root,lesson.record_path));total+=bytes.length;
    const entry={id:`lesson${i}`,kind:'lesson',role:'candidate',mandatory:false,
      reference:{path:lesson.record_path,file_sha256:sha256(bytes),start_byte:0,end_byte:bytes.length,range_sha256:sha256(bytes)},
      lesson:{id:lesson.lesson_id,record_path:lesson.record_path,record_sha256:sha256(bytes),task_id:'batch-task',sources:[source],check_ids:['result']}};
    sources.push(entry);if(!selected||entry.lesson.id>selected.lesson.id)selected=entry;
  }
  assert.ok(total>65536);
  await mkdir(join(root,'docs'));const raw=Buffer.from(JSON.stringify({schema_version:1,binding:(await memoryWorkspace(root)).binding,sources}));await writeFile(join(root,'docs/context.json'),raw);
  const result=await retrieveTaskContext(root,{manifest_path:'docs/context.json',manifest_sha256:sha256(raw),query:selected.lesson.id,budget_bytes:8192,as_of:now});
  assert.deepEqual(result.sources.map(s=>s.id),[selected.id]);
});

test('changed sources, partial UTF8 spans, invalid schemas and binding changes are rejected',async()=>{
  const f=await fixture();const s=await f.source('unicode','한글 repair');
  s.reference.start_byte=1;s.reference.range_sha256=sha256(Buffer.from('한글 repair').subarray(1));
  await assert.rejects(f.retrieve(),/Invalid task context/);
  s.reference.start_byte=0;s.reference.range_sha256=s.reference.file_sha256;
  await writeFile(join(f.root,s.reference.path),'changed');
  await assert.rejects(f.retrieve(),/Invalid task context/);
  await f.source('other','repair',{surprise:true});
  await assert.rejects(f.retrieve(),/Invalid task context/);
});

test('private/control paths and forged lesson approvals cannot authorize retrieval',async()=>{
  const f=await fixture();const s=await f.source('safe','repair');
  for(const path of ['.env','step_archive/progress.json','.git/config','docs/../secret.txt','settings.json']) {
    s.reference.path=path;await assert.rejects(f.retrieve(),/Invalid task context/);
  }
  s.reference.path='docs/safe.txt';s.kind='lesson';s.lesson={approved:true};
  await assert.rejects(f.retrieve(),/Invalid task context/);
});

test('bounded inputs reject extra schemas, changed manifest pins, oversized queries and impossible timestamps',async()=>{
  const f=await fixture();await f.source('safe','repair');
  for(const options of [{budget_bytes:1023},{budget_bytes:65537},{query:'x'.repeat(2049)},{backend:'model'},
    {expand_links:'yes'},{as_of:'2026-02-31T00:00:00.000Z'},{manifest_sha256:'0'.repeat(64)},{extra:true}])
    await assert.rejects(f.retrieve(options),/Invalid task context/);
  let called=false;const malicious={manifest_path:'docs/context.json',get query(){called=true;return 'repair';}};
  await assert.rejects(retrieveTaskContext(f.root,malicious),/Invalid task context/);assert.equal(called,false);
  f.binding.workflow_generation='0'.repeat(64);await assert.rejects(f.retrieve(),/Invalid task context/);
});

test('source count, excerpt bytes, file bytes and aggregate initial-plus-recheck reads are bounded',async()=>{
  const f=await fixture();const s=await f.source('safe','repair');
  for(let i=0;i<128;i++)f.entries.push({...s,id:`more${i}`});
  await assert.rejects(f.retrieve(),/Invalid task context/);f.entries.splice(1);
  const giant=Buffer.alloc(8*1024*1024+1,0x61);await writeFile(join(f.root,s.reference.path),giant);
  s.reference.file_sha256=sha256(giant);s.reference.end_byte=6;s.reference.range_sha256=sha256(giant.subarray(0,6));
  await assert.rejects(f.retrieve(),/Invalid task context/);
  const large=giant.subarray(0,8*1024*1024);await writeFile(join(f.root,s.reference.path),large);s.reference.file_sha256=sha256(large);
  f.entries.push({...s,id:'again'},{...s,id:'third'});await assert.rejects(f.retrieve(),/Invalid task context/);
  f.entries.splice(1);s.reference.end_byte=16385;s.reference.range_sha256=sha256(large.subarray(0,16385));await assert.rejects(f.retrieve(),/Invalid task context/);
});

test('legacy workflows without a generation report explicit unsupported advisory result',async()=>{
  const root=await makeWorkspace();await initWorkflow({workspaceRoot:root,workflowProfile:'legacy-50-v1',topic:'Legacy scope.',now:'2026-10-08T00:00:00.000Z',idFactory:()=> 'legacy-context'});
  const result=await retrieveTaskContext(root,{manifest_path:'docs/context.json',manifest_sha256:'a'.repeat(64),query:'repair',budget_bytes:1024,as_of:'2026-10-08T00:00:00.000Z'});
  assert.equal(result.status,'unsupported');assert.equal(result.diagnostic,'unsupported_legacy_workflow');
  assert.equal(result.serialized_bytes,Buffer.byteLength(JSON.stringify(result)));
});

test('concurrent retrieval budgets remain isolated and nested callers cannot reset a smaller allowance',async()=>{
  const a=await fixture(),b=await fixture();await a.source('safe','repair');await b.source('safe','repair');
  const results=await Promise.all([withReadBudget(1024,()=>a.retrieve()).then(r=>r.status==='blocked',()=>true),b.retrieve()]);
  assert.equal(results[0],true);assert.equal(results[1].status,'current');
});
