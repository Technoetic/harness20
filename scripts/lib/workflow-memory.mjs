// Immutable advisory records. Workflow state, receipts and QA stay authoritative.
import { open, lstat, readdir, realpath, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readSafe, safePath, sha256, writeSafe } from './quality-files.mjs';
import { inspectQa } from './qa-report.mjs';
import {
  MemoryError, memoryError, memoryRequire as require, memoryObject as object, memoryText as text,
  memoryId as id, memoryHash as hash, memoryList as list, memoryUnique as unique, memoryTime as time,
  memoryCanonical as canonical, memoryWorkspace, recheckMemoryWorkspace, assertMemoryBinding,
  assertMemorySourcePath, memorySourceReference, readMemorySource, memoryJson, sanitizedMemoryReason
} from './memory-policy.mjs';

const LIMIT=16*1024;
const failureName=attempt=>sha256(attempt);
const encode=value=>Buffer.from(`${canonical(value)}\n`);
const failPath=(w,step,attempt)=>`${w.base}/failures/step${String(step).padStart(3,'0')}/${failureName(attempt)}.json`;
const lessonPath=(w,lessonId)=>`${w.base}/lessons/${hash(lessonId)}.json`;
const auxiliary=error=>({status:error?.code==='MEMORY_UNSUPPORTED'?'unsupported':'unavailable',advisory:true,
  code:error instanceof MemoryError?error.code:'MEMORY_UNAVAILABLE'});
function step(value) { require(Number.isInteger(value)&&value>=1&&value<=50); return value; }
function ids(values,max=32,min=0) { return unique(list(values,max,min).map(id)).sort(); }
function hashes(values,max=16) { return unique(list(values,max).map(hash)).sort(); }
function sources(values) {
  const refs=list(values,128,1).map(memorySourceReference);
  unique(refs.map(ref=>assertMemorySourcePath(ref.path,'repository-source')));
  return refs.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
function scope(value) {
  object(value,['task_ids','source_paths','check_ids']);
  return {task_ids:ids(value.task_ids,32,1),source_paths:unique(list(value.source_paths,128,1)
    .map(path=>assertMemorySourcePath(path,'repository-source'))).sort(),check_ids:ids(value.check_ids,64,1)};
}
function verification(value) {
  object(value,['step','report_sha256','check_ids']);
  return {step:step(value.step),report_sha256:hash(value.report_sha256),check_ids:ids(value.check_ids,64,1)};
}
function validity(value) {
  object(value,['from','until']); const result={from:time(value.from),until:time(value.until)};
  require(Date.parse(result.from)<Date.parse(result.until)); return result;
}
function semantic(record) { const {lesson_id,...rest}=record; return rest; }
export function validateLessonRecord(value) {
  object(value,['schema_version','kind','lesson_id','binding','task_id','failure','repair_observation',
    'scope','sources','verification','validity','related_ids','supersedes']);
  require(value.schema_version===1&&value.kind==='lesson'); hash(value.lesson_id); assertMemoryBinding(value.binding);
  id(value.task_id); text(value.repair_observation,2048); scope(value.scope); sources(value.sources);
  verification(value.verification); validity(value.validity); hashes(value.related_ids); hashes(value.supersedes);
  object(value.failure,['step','attempt_id','record_path','record_sha256']); step(value.failure.step);
  text(value.failure.attempt_id,240); hash(value.failure.record_sha256);
  require(value.failure.record_path===`step_archive/outputs/workflow-memory/${value.binding.workflow_profile}/${value.binding.workflow_generation}/failures/step${String(value.failure.step).padStart(3,'0')}/${failureName(value.failure.attempt_id)}.json`);
  require(value.scope.task_ids.includes(value.task_id)&&canonical(value.scope.source_paths)===canonical(value.sources.map(ref=>ref.path).sort())
    &&canonical(value.scope.check_ids)===canonical(value.verification.check_ids));
  require(sha256(canonical(semantic(value)))===value.lesson_id);
  require(encode(value).length<=LIMIT);
  return structuredClone(value);
}
async function writeOnce(w,path,value) {
  const bytes=encode(value); require(bytes.length<=LIMIT,'MEMORY_BUDGET');
  await recheckMemoryWorkspace(w);
  const target=await safePath(w.root,path,{createParents:true});
  let handle;
  try { handle=await open(target,'wx',0o600); }
  catch(error) {
    if(error?.code!=='EEXIST') throw error;
    require((await readSafe(w.root,path,LIMIT)).equals(bytes),'MEMORY_CONFLICT');
    await recheckMemoryWorkspace(w); return {path,sha256:sha256(bytes),replayed:true};
  }
  let success=false;
  try { await handle.writeFile(bytes); await handle.sync(); success=true; }
  finally { await handle.close(); if(!success) await unlink(target).catch(()=>{}); }
  await safePath(w.root,path); require((await readSafe(w.root,path,LIMIT)).equals(bytes),'MEMORY_CHANGED');
  await recheckMemoryWorkspace(w); return {path,sha256:sha256(bytes),replayed:false};
}
async function recordRead(w,path) { const loaded=await memoryJson(w.root,path,LIMIT); return loaded; }
async function lessonRead(w,path,expectedHash,origin=false) {
  assertMemorySourcePath(path,'lesson');
  if(!origin) require(path.startsWith(`${w.base}/lessons/`));
  const loaded=await recordRead(w,path);
  if(expectedHash!==undefined) require(loaded.sha256===hash(expectedHash),'MEMORY_CHANGED');
  const record=validateLessonRecord(loaded.value);
  require(path===`step_archive/outputs/workflow-memory/${record.binding.workflow_profile}/${record.binding.workflow_generation}/lessons/${record.lesson_id}.json`);
  if(origin) {
    for(const key of ['repository_sha256','workflow_profile','topic_sha256']) require(record.binding[key]===w.binding[key],'MEMORY_CHANGED');
  } else assertMemoryBinding(record.binding,w.binding);
  return {...loaded,record,path};
}
async function names(w,directory,max=512) {
  // Only the selected namespace is enumerated, never archives or other generations.
  const path=resolve(w.root,directory);
  try {
    let current=w.root;
    for(const part of directory.split('/')) {
      current=join(current,part); const stat=await lstat(current);
      require(stat.isDirectory()&&!stat.isSymbolicLink());
      const physical=await realpath(current);
      require(process.platform==='win32'?physical.toLowerCase()===current.toLowerCase():physical===current);
    }
    const before=await lstat(path,{bigint:true}); const result=await readdir(path);
    require(result.length<=max,'MEMORY_BUDGET'); const after=await lstat(path,{bigint:true});
    require(before.dev===after.dev&&before.ino===after.ino&&!after.isSymbolicLink());
    return result.sort();
  } catch(error) { if(error?.code==='ENOENT') return []; throw error; }
}
function failureShape(record,w) {
  object(record,['schema_version','kind','binding','workflow_id','step','attempt_id','failed_at','reason','evidence']);
  require(record.schema_version===1&&record.kind==='failure'); assertMemoryBinding(record.binding,w.binding);
  text(record.workflow_id,240); step(record.step); text(record.attempt_id,240); time(record.failed_at);
  text(record.reason,512); require(!/[\r\n]/.test(record.reason));
  list(record.evidence,128).forEach(item=>{
    object(item,['kind','ok','detail_sha256'],['acceptance_id','command_sha256','artifact_path_sha256','artifact_sha256']);
    require(['check','command','artifact','import'].includes(item.kind)); require(typeof item.ok==='boolean');
    hash(item.detail_sha256); if(item.command_sha256!==undefined) hash(item.command_sha256);
    if(item.artifact_path_sha256!==undefined) hash(item.artifact_path_sha256);
    if(item.artifact_sha256!==undefined) hash(item.artifact_sha256);
    if(item.acceptance_id!==undefined&&item.acceptance_id!==null) id(item.acceptance_id);
  });
  return record;
}
export async function captureFailure({workspaceRoot,workflowId,topicSha256,step:stepValue,attemptId,failedAt,reason,evidence}) {
  try {
    // No repeated evaluation of caller evidence getters; the manager supplies its frozen copy.
    const frozen=structuredClone(evidence); const w=await memoryWorkspace(workspaceRoot);
    text(workflowId,240); hash(topicSha256); text(attemptId,240); step(stepValue); time(failedAt);
    require(w.binding.topic_sha256===topicSha256);
    const state=(await memoryJson(w.root,'step_archive/.harness50-codex/state.json',1024*1024)).value;
    require(state.workflow_id===workflowId&&state.current_attempt?.id===attemptId&&state.current_attempt.step===stepValue
      &&state.current_attempt.failure_recorded===true);
    const safeEvidence=list(frozen,128).map(item=>{
      object(item,['kind','detail','ok'],['acceptance_id','command','artifact_path','artifact_sha256','exit_code']);
      require(['check','command','artifact','import'].includes(item.kind)&&typeof item.ok==='boolean'&&typeof item.detail==='string');
      const result={kind:item.kind,ok:item.ok,detail_sha256:sha256(item.detail)};
      if(item.command!==undefined) {require(typeof item.command==='string');result.command_sha256=sha256(item.command);}
      if(item.artifact_path!==undefined) {require(typeof item.artifact_path==='string');result.artifact_path_sha256=sha256(item.artifact_path);}
      if(item.artifact_sha256!==undefined) result.artifact_sha256=hash(item.artifact_sha256);
      if(item.acceptance_id!==undefined) result.acceptance_id=item.acceptance_id===null?null:id(item.acceptance_id);
      return result;
    });
    const record={schema_version:1,kind:'failure',binding:w.binding,workflow_id:workflowId,step:stepValue,
      attempt_id:attemptId,failed_at:failedAt,reason:sanitizedMemoryReason(reason),evidence:safeEvidence};
    failureShape(record,w); const saved=await writeOnce(w,failPath(w,stepValue,attemptId),record);
    return {status:'recorded',advisory:true,record_path:saved.path,record_sha256:saved.sha256,replayed:saved.replayed};
  } catch(error) { return auxiliary(error); }
}
export async function inspectFailure(workspaceRoot,input={}) {
  try {
    object(input,[],['step','attempt_id']); const w=await memoryWorkspace(workspaceRoot);
    const state=(await memoryJson(w.root,'step_archive/.harness50-codex/state.json',1024*1024)).value;
    const stepValue=step(input.step??state.current_step),attempt=input.attempt_id??state.current_attempt?.id;
    if(!attempt) return {status:'missing',advisory:true}; text(attempt,240);
    const path=failPath(w,stepValue,attempt); let loaded;
    try { loaded=await recordRead(w,path); } catch(error) { if(error?.code==='ENOENT') return {status:'missing',advisory:true}; throw error; }
    const record=failureShape(loaded.value,w); require(record.attempt_id===attempt&&record.step===stepValue&&record.workflow_id===state.workflow_id);
    await recheckMemoryWorkspace(w);
    return {status:state.current_attempt?.id===attempt&&state.current_step===stepValue?'current':'historical',
      advisory:true,record_path:path,record_sha256:loaded.sha256,record};
  } catch(error) { return auxiliary(error); }
}
async function readSources(w,refs) {
  let total=0;
  for(const ref of refs) { const loaded=await readMemorySource(w.root,ref,{}); total+=loaded.file_bytes; require(total<=32*1024*1024,'MEMORY_BUDGET'); }
}
async function currentQa(w,proof,refs) {
  const qa=await inspectQa(w.root,proof.step,{pathPolicy:(path,kind)=>
    assertMemorySourcePath(path,kind==='artifact'?'repository-source':'approved-artifact')});
  require(qa.status==='current'&&qa.verdict==='PASS'&&qa.report_sha256===proof.report_sha256,'MEMORY_UNVERIFIED');
  require(proof.check_ids.every(check=>qa.preserve.includes(check)),'MEMORY_UNVERIFIED');
  require(refs.every(ref=>qa.artifacts.some(artifact=>artifact.path===ref.path&&artifact.sha256===ref.file_sha256)),'MEMORY_UNVERIFIED');
  return qa;
}
async function originQa(w,record) {
  // Exact selected origin proof; no generation scan or imported success flag.
  const base=`step_archive/outputs/qa-reports/${record.binding.workflow_profile}/${record.binding.workflow_generation}`;
  const loaded=await memoryJson(w.root,`${base}/${record.verification.report_sha256}.report.json`,64*1024);
  require(loaded.sha256===record.verification.report_sha256,'MEMORY_CHANGED');
  const report=loaded.value;
  object(report,['schema_version','step','snapshot_id','snapshot_sha256','verifier','outcomes','next_actions','verdict']);
  require(report.schema_version===1&&report.step===record.verification.step&&report.verdict==='PASS');
  require(typeof report.snapshot_id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(report.snapshot_id));
  const snapshot=await memoryJson(w.root,`${base}/${report.snapshot_id}.snapshot.json`,64*1024);
  require(snapshot.sha256===report.snapshot_sha256);
  object(snapshot.value,['schema_version','snapshot_id','step','created_at','artifacts','checks']);
  require(snapshot.value.schema_version===1&&snapshot.value.snapshot_id===report.snapshot_id&&snapshot.value.step===report.step);
  time(snapshot.value.created_at); object(report.verifier,['id','mode']); id(report.verifier.id);
  require(['independent','same-agent'].includes(report.verifier.mode));
  const checks=list(snapshot.value.checks,64,1).map(check=>{object(check,['id','requirement']);text(check.requirement,512);return id(check.id);});unique(checks);
  const outcomes=list(report.outcomes,64,1).map(outcome=>{
    object(outcome,['id','status','observation','evidence','next_check']); id(outcome.id);
    require(outcome.status==='pass');text(outcome.observation);text(outcome.next_check,512,{empty:true});
    list(outcome.evidence,8,1);return outcome;
  });
  unique(outcomes.map(outcome=>outcome.id));require(canonical(checks.sort())===canonical(outcomes.map(outcome=>outcome.id).sort()));
  require(record.verification.check_ids.every(check=>checks.includes(check)));
  list(report.next_actions,3).forEach(action=>text(action,512));
  const artifacts=list(snapshot.value.artifacts,128,1);unique(artifacts.map(entry=>entry.path));
  const entries=[...artifacts,...outcomes.flatMap(outcome=>outcome.evidence)]; let total=0;
  for(const entry of entries) {
    object(entry,['path','sha256']);hash(entry.sha256);
    assertMemorySourcePath(entry.path,entry.path.startsWith('step_archive/')?'approved-artifact':'repository-source');
    const bytes=await readSafe(w.root,entry.path);total+=bytes.length;require(total<=32*1024*1024);
    require(sha256(bytes)===entry.sha256,'MEMORY_CHANGED');
  }
  require(record.sources.every(ref=>artifacts.some(entry=>entry.path===ref.path&&entry.sha256===ref.file_sha256)));
  const claim=await memoryJson(w.root,`${base}/${report.snapshot_id}.recorded.json`,1024);
  object(claim.value,['report_sha256']);require(claim.value.report_sha256===loaded.sha256);
  const pointer=await memoryJson(w.root,`${base}/step${String(report.step).padStart(3,'0')}.latest.json`,1024);
  object(pointer.value,['schema_version','step','report_sha256']);require(pointer.value.schema_version===1&&pointer.value.step===report.step&&pointer.value.report_sha256===loaded.sha256);
  require((await memoryJson(w.root,`${base}/${loaded.sha256}.report.json`,64*1024)).sha256===loaded.sha256);
  require((await memoryJson(w.root,`${base}/${report.snapshot_id}.snapshot.json`,64*1024)).sha256===snapshot.sha256);
}
async function registered(w,lessonIds) {
  for(const lessonId of lessonIds) await lessonRead(w,lessonPath(w,lessonId));
}
const originBase=record=>`step_archive/outputs/workflow-memory/${record.binding.workflow_profile}/${record.binding.workflow_generation}`;
const lifecyclePath=record=>`${originBase(record)}/lifecycle/${record.lesson_id}.json`;
// Cooperative namespace exclusion protects read/modify/replace against other
// memory writers. Contention and abandoned locks fail closed; no stale stealing.
async function lifecycleWrite(w,operation) {
  await recheckMemoryWorkspace(w);
  const path=`${w.base}/lifecycle.lock`,target=await safePath(w.root,path,{createParents:true});
  let handle;
  try {handle=await open(target,'wx',0o600);} catch(error) {
    if(error?.code==='EEXIST')throw memoryError('MEMORY_CONFLICT');throw error;
  }
  const token=Buffer.from(randomUUID());
  try {await handle.writeFile(token);await handle.sync();await handle.close();handle=null;return await operation();}
  finally {
    if(handle)await handle.close();
    if((await readSafe(w.root,path,128)).equals(token))await unlink(await safePath(w.root,path));
  }
}
async function lifecycleRead(w,lesson) {
  const loaded=await recordRead(w,lifecyclePath(lesson.record)),value=loaded.value;
  object(value,['schema_version','kind','binding','lesson_id','record_sha256','supersessions','retirements']);
  require(value.schema_version===1&&value.kind==='lesson-lifecycle');
  assertMemoryBinding(value.binding,lesson.record.binding);
  require(value.lesson_id===lesson.record.lesson_id&&value.record_sha256===lesson.sha256,'MEMORY_CHANGED');
  const replacements=list(value.supersessions,32).map(ref=>{
    object(ref,['lesson_id','record_sha256','from']);hash(ref.lesson_id);hash(ref.record_sha256);time(ref.from);return ref.lesson_id;
  });unique(replacements);
  const retirements=list(value.retirements,32).map(ref=>{
    object(ref,['retirement_id','record_sha256','retired_at']);hash(ref.retirement_id);hash(ref.record_sha256);time(ref.retired_at);return ref.retirement_id;
  });unique(retirements);
  return loaded;
}
async function lifecycleAppend(w,lesson,field,entry) {
  const loaded=await lifecycleRead(w,lesson),value=loaded.value;
  if(value[field].some(ref=>canonical(ref)===canonical(entry)))return;
  value[field].push(entry);value[field].sort((a,b)=>canonical(a).localeCompare(canonical(b),'en'));
  require(value[field].length<=32,'MEMORY_BUDGET');const bytes=encode(value);require(bytes.length<=LIMIT,'MEMORY_BUDGET');
  const path=lifecyclePath(lesson.record);
  require((await recordRead(w,path)).sha256===loaded.sha256,'MEMORY_CHANGED');
  await recheckMemoryWorkspace(w);await writeSafe(w.root,path,bytes);
  require((await recordRead(w,path)).sha256===sha256(bytes),'MEMORY_CHANGED');
}
async function lifecycleInitialize(w,record) {
  const sha=sha256(encode(record)),lesson={record,sha256:sha};
  try {await lifecycleRead(w,lesson);return;} catch(error) {if(error?.code!=='ENOENT')throw error;}
  // Older/missing metadata cannot be reconstructed from an incomplete history.
  try {await recordRead(w,lessonPath(w,record.lesson_id));throw memoryError('MEMORY_UNVERIFIED');}
  catch(error) {if(error?.code!=='ENOENT')throw error;}
  await writeOnce(w,lifecyclePath(record),{schema_version:1,kind:'lesson-lifecycle',binding:record.binding,
    lesson_id:record.lesson_id,record_sha256:sha,supersessions:[],retirements:[]});
}
async function originLifecycle(w,lesson,asOf) {
  const loaded=await lifecycleRead(w,lesson),base=originBase(lesson.record);let superseded=false,retired=false;
  // These are exact named, bounded provenance reads, never an origin archive scan.
  for(const ref of loaded.value.supersessions) {
    const replacement=await lessonRead(w,`${base}/lessons/${ref.lesson_id}.json`,ref.record_sha256,true);
    assertMemoryBinding(replacement.record.binding,lesson.record.binding);
    require(replacement.record.supersedes.includes(lesson.record.lesson_id)&&replacement.record.validity.from===ref.from);
    if(Date.parse(ref.from)<=Date.parse(asOf))superseded=true;
  }
  for(const ref of loaded.value.retirements) {
    const retirement=await recordRead(w,`${base}/retirements/${ref.retirement_id}.json`),r=retirement.value;
    require(retirement.sha256===ref.record_sha256&&sha256(canonical(r))===ref.retirement_id);
    object(r,['schema_version','kind','binding','lesson_id','retired_at','reason']);
    require(r.schema_version===1&&r.kind==='retirement'&&r.lesson_id===lesson.record.lesson_id&&r.retired_at===ref.retired_at);
    assertMemoryBinding(r.binding,lesson.record.binding);time(r.retired_at);text(r.reason,512);
    if(Date.parse(ref.retired_at)<=Date.parse(asOf))retired=true;
  }
  require((await recordRead(w,lifecyclePath(lesson.record))).sha256===loaded.sha256,'MEMORY_CHANGED');
  return {sha256:loaded.sha256,superseded,retired};
}
export async function recordLesson(workspaceRoot,raw) {
  try {
    const input=structuredClone(raw); object(input,['task_id','failure','repair_observation','scope','sources','verification','validity','related_ids','supersedes']);
    const w=await memoryWorkspace(workspaceRoot); id(input.task_id);text(input.repair_observation,2048);
    object(input.failure,['step','attempt_id']);step(input.failure.step);text(input.failure.attempt_id,240);
    const captured=await inspectFailure(w.root,input.failure);require(['current','historical'].includes(captured.status),'MEMORY_UNVERIFIED');
    const refs=sources(input.sources),proof=verification(input.verification),applies=scope(input.scope);
    require(applies.task_ids.includes(input.task_id)&&canonical(applies.source_paths)===canonical(refs.map(ref=>ref.path).sort())
      &&canonical(applies.check_ids)===canonical(proof.check_ids));
    const related=hashes(input.related_ids),supersedes=hashes(input.supersedes);
    await registered(w,[...new Set([...related,...supersedes])]);
    await readSources(w,refs);await currentQa(w,proof,refs);
    const content={schema_version:1,kind:'lesson',binding:w.binding,task_id:input.task_id,
      failure:{...input.failure,record_path:captured.record_path,record_sha256:captured.record_sha256},
      repair_observation:input.repair_observation,scope:applies,sources:refs,verification:proof,
      validity:validity(input.validity),related_ids:related,supersedes};
    const record={...content,lesson_id:sha256(canonical(content))};validateLessonRecord(record);
    await readSources(w,refs);await currentQa(w,proof,refs);await recheckMemoryWorkspace(w);
    const saved=await lifecycleWrite(w,async()=>{
      await lifecycleInitialize(w,record);
      // Publish revocations first. A partial registration leaves missing proof,
      // which causes origin inspection to abstain until exact replay completes.
      for(const lessonId of supersedes)await lifecycleAppend(w,await lessonRead(w,lessonPath(w,lessonId)),
        'supersessions',{lesson_id:record.lesson_id,record_sha256:sha256(encode(record)),from:record.validity.from});
      return writeOnce(w,lessonPath(w,record.lesson_id),record);
    });
    return {status:'recorded',advisory:true,lesson_id:record.lesson_id,record_path:saved.path,record_sha256:saved.sha256,replayed:saved.replayed};
  } catch(error) { throw error instanceof MemoryError?error:memoryError('MEMORY_UNAVAILABLE'); }
}
function appliesTo(record,input) {
  return record.scope.task_ids.includes(input.task_id)&&record.scope.check_ids.every(check=>input.check_ids.includes(check))
    &&record.sources.every(ref=>input.sources.some(source=>canonical(source)===canonical(ref)))
    &&Date.parse(input.as_of)>=Date.parse(record.validity.from)&&Date.parse(input.as_of)<Date.parse(record.validity.until);
}
async function active(w,record,asOf,origin=false) {
  const prefix=origin?`step_archive/outputs/workflow-memory/${record.binding.workflow_profile}/${record.binding.workflow_generation}`:w.base;
  for(const name of await names(w,`${prefix}/retirements`,512)) {
    require(/^[a-f0-9]{64}\.json$/.test(name));const loaded=await recordRead(w,`${prefix}/retirements/${name}`);const r=loaded.value;
    object(r,['schema_version','kind','binding','lesson_id','retired_at','reason']);require(r.schema_version===1&&r.kind==='retirement');
    assertMemoryBinding(r.binding,record.binding);hash(r.lesson_id);time(r.retired_at);text(r.reason,512);
    require(name===`${sha256(canonical(r))}.json`);
    if(r.lesson_id===record.lesson_id&&Date.parse(r.retired_at)<=Date.parse(asOf)) return false;
  }
  return true;
}
async function supersededIds(w,asOf,candidates) {
  if(candidates===undefined) {
    candidates=[];
    for(const name of await names(w,`${w.base}/lessons`)) {
      require(/^[a-f0-9]{64}\.json$/.test(name));
      candidates.push(await lessonRead(w,`${w.base}/lessons/${name}`));
    }
  }
  // A registered replacement revokes applicability from its validity start.
  // Its later retirement or expiry does not reactivate the original lesson.
  return new Set(candidates.filter(candidate=>Date.parse(candidate.record.validity.from)<=Date.parse(asOf))
    .flatMap(candidate=>candidate.record.supersedes));
}
function observationShape(record,binding) {
  object(record,['schema_version','kind','binding','lesson_id','observation_id','applicable','outcome','observed_at','task_id','sources','check_ids','verification_current'],['verification']);
  require(record.schema_version===1&&record.kind==='observation');assertMemoryBinding(record.binding,binding);
  hash(record.lesson_id);id(record.observation_id);require(typeof record.applicable==='boolean'&&typeof record.verification_current==='boolean');
  require(['resolved','recurred','adverse','unknown'].includes(record.outcome));time(record.observed_at);id(record.task_id);
  sources(record.sources);ids(record.check_ids,64,1);if(record.verification)verification(record.verification);
  require(!record.verification_current||Boolean(record.verification)); return record;
}
async function statistics(w,lesson,asOf,origin=false) {
  const base=origin?`step_archive/outputs/workflow-memory/${lesson.binding.workflow_profile}/${lesson.binding.workflow_generation}`:w.base;
  const records=[];
  for(const name of await names(w,`${base}/observations/${lesson.lesson_id}`,256)) {
    require(/^[a-f0-9]{64}\.json$/.test(name));const loaded=await recordRead(w,`${base}/observations/${lesson.lesson_id}/${name}`);
    const record=observationShape(loaded.value,lesson.binding);require(record.lesson_id===lesson.lesson_id&&name===`${sha256(record.observation_id)}.json`);
    if(Date.parse(record.observed_at)<=Date.parse(asOf)) records.push(record);
  }
  const eligible=records.filter(r=>r.applicable),known=eligible.filter(r=>r.outcome!=='unknown');
  let currentEvidence=0,currentVerified=0,verifiedKnown=0,verifiedResolved=0;
  for(const record of eligible) {
    try {await readSources(w,record.sources); if(!origin)await currentQa(w,lesson.verification,lesson.sources);else await originQa(w,lesson);currentEvidence++;
      if(record.verification_current&&record.verification) {
        const qa=await currentQa(w,record.verification,record.sources);
        if(qa.report.verifier.mode==='independent') {
          currentVerified++;
          if(record.outcome!=='unknown') {verifiedKnown++;if(record.outcome==='resolved')verifiedResolved++;}
        }
      }
    } catch { /* Labels remain provenance, but changed evidence cannot count as current. */ }
  }
  const count=outcome=>known.filter(r=>r.outcome===outcome).length;
  return {observations:records.length,eligible_attempts:eligible.length,known_outcomes:known.length,
    observer_labelled_known_outcomes:known.length,current_evidence_attempts:currentEvidence,current_verified_attempts:currentVerified,
    current_verified_known_outcomes:verifiedKnown,current_verified_resolved:verifiedResolved,
    resolved:count('resolved'),recurred:count('recurred'),adverse:count('adverse'),unknown:eligible.length-known.length,
    resolved_rate:known.length?count('resolved')/known.length:null,recurrence_rate:known.length?count('recurred')/known.length:null,
    adverse_rate:known.length?count('adverse')/known.length:null,verified_rate:eligible.length?currentVerified/eligible.length:null,
    verified_resolved_rate:verifiedKnown?verifiedResolved/verifiedKnown:null};
}
export async function inspectLessons(workspaceRoot,raw) {
  try {
    const input=structuredClone(raw);object(input,['task_id','sources','check_ids','max_results','max_bytes','as_of'],['origins','selected_ids','include_metrics']);
    id(input.task_id);input.sources=sources(input.sources);input.check_ids=ids(input.check_ids,64,1);time(input.as_of);
    require(Number.isInteger(input.max_results)&&input.max_results>=1&&input.max_results<=128);
    require(Number.isInteger(input.max_bytes)&&input.max_bytes>=1024&&input.max_bytes<=64*1024);
    if(input.selected_ids!==undefined)input.selected_ids=hashes(input.selected_ids,128);
    if(input.include_metrics!==undefined)require(typeof input.include_metrics==='boolean');
    const w=await memoryWorkspace(workspaceRoot);const candidates=[];const omitted=[];
    for(const name of await names(w,`${w.base}/lessons`)) {
      require(/^[a-f0-9]{64}\.json$/.test(name));candidates.push(await lessonRead(w,`${w.base}/lessons/${name}`));
    }
    for(const selection of list(input.origins??[],32)) {
      object(selection,['path','sha256']);assertMemorySourcePath(selection.path,'lesson');hash(selection.sha256);
      require(!candidates.some(candidate=>candidate.path===selection.path));
      candidates.push({...await lessonRead(w,selection.path,selection.sha256,true),origin:true});
    }
    const result={status:'current',advisory:true,binding:w.binding,lessons:[],omitted};
    const applicable=[];
    for(const candidate of candidates) {
      const record=candidate.record;
      if(input.selected_ids!==undefined&&!input.selected_ids.includes(record.lesson_id))continue;
      if(!appliesTo(record,input)) {omitted.push({lesson_id:record.lesson_id,reason:'inapplicable'});continue;}
      try {
        if(candidate.origin) {
          candidate.lifecycle=await originLifecycle(w,candidate,input.as_of);
          if(candidate.lifecycle.superseded||candidate.lifecycle.retired) {
            omitted.push({lesson_id:record.lesson_id,reason:candidate.lifecycle.superseded?'superseded':'retired'});continue;
          }
        } else if(!await active(w,record,input.as_of)) {omitted.push({lesson_id:record.lesson_id,reason:'retired'});continue;}
        await readSources(w,record.sources);
        if(candidate.origin) await originQa(w,record);else await currentQa(w,record.verification,record.sources);
        const failure=await recordRead(w,record.failure.record_path);require(failure.sha256===record.failure.record_sha256);
        failureShape(failure.value,{...w,binding:record.binding});
      } catch {omitted.push({lesson_id:record.lesson_id,reason:'stale-or-unverified'});continue;}
      applicable.push(candidate);
    }
    // Supersession is provenance, not a temporary ranking choice. Retiring or
    // expiring the replacement does not silently reactivate its predecessor.
    const superseded=await supersededIds(w,input.as_of,candidates);
    for(const candidate of applicable.sort((a,b)=>a.record.lesson_id.localeCompare(b.record.lesson_id))) {
      if(superseded.has(candidate.record.lesson_id)) {omitted.push({lesson_id:candidate.record.lesson_id,reason:'superseded'});continue;}
      const projection={...candidate.record,record_path:candidate.path,record_sha256:candidate.sha256,
        ...(input.include_metrics===false?{}:{statistics:await statistics(w,candidate.record,input.as_of,candidate.origin)})};
      if(result.lessons.length>=input.max_results) {omitted.push({lesson_id:projection.lesson_id,reason:'max-results'});continue;}
      result.lessons.push(projection);
      if(Buffer.byteLength(JSON.stringify(result))>input.max_bytes) {result.lessons.pop();omitted.push({lesson_id:projection.lesson_id,reason:'budget'});}
    }
    if(Buffer.byteLength(JSON.stringify(result))>input.max_bytes) return {status:'blocked',advisory:true,code:'MEMORY_BUDGET'};
    await readSources(w,input.sources);await recheckMemoryWorkspace(w);
    // Reinspect every accepted QA proof and exact record after selection.
    for(const projection of result.lessons) {
      const c=applicable.find(candidate=>candidate.record.lesson_id===projection.lesson_id);
      await lessonRead(w,c.path,c.sha256,c.origin);
      if(c.origin)await originQa(w,c.record);else await currentQa(w,c.record.verification,c.record.sources);
      if(c.origin) {
        const lifecycle=await originLifecycle(w,c,input.as_of);
        require(lifecycle.sha256===c.lifecycle.sha256&&!lifecycle.superseded&&!lifecycle.retired,'MEMORY_CHANGED');
      } else require(await active(w,c.record,input.as_of),'MEMORY_CHANGED');
    }
    return result;
  } catch(error) { return auxiliary(error); }
}
export async function observeLesson(workspaceRoot,raw) {
  try {
    const input=structuredClone(raw);object(input,['lesson_id','observation_id','applicable','outcome','observed_at','task_id','sources','check_ids'],['verification']);
    hash(input.lesson_id);id(input.observation_id);id(input.task_id);time(input.observed_at);
    require(typeof input.applicable==='boolean'&&['resolved','recurred','adverse','unknown'].includes(input.outcome));
    const w=await memoryWorkspace(workspaceRoot),loaded=await lessonRead(w,lessonPath(w,input.lesson_id));
    const refs=sources(input.sources),checks=ids(input.check_ids,64,1);
    const applicable=appliesTo(loaded.record,{task_id:input.task_id,sources:refs,check_ids:checks,as_of:input.observed_at})
      &&await active(w,loaded.record,input.observed_at)
      &&!(await supersededIds(w,input.observed_at)).has(loaded.record.lesson_id);
    require(applicable===input.applicable,'MEMORY_UNVERIFIED');
    await readSources(w,refs);
    let proof,verified=false;
    if(input.verification) {
      proof=verification(input.verification);
      require(canonical(proof.check_ids)===canonical(loaded.record.scope.check_ids),'MEMORY_UNVERIFIED');
      const qa=await currentQa(w,proof,refs);verified=qa.report.verifier.mode==='independent';
    }
    const record={schema_version:1,kind:'observation',binding:w.binding,lesson_id:input.lesson_id,
      observation_id:input.observation_id,applicable,outcome:input.outcome,observed_at:input.observed_at,
      task_id:input.task_id,sources:refs,check_ids:checks,verification_current:verified,...(proof?{verification:proof}:{})};
    observationShape(record,w.binding);
    const saved=await writeOnce(w,`${w.base}/observations/${record.lesson_id}/${sha256(record.observation_id)}.json`,record);
    return {status:'recorded',advisory:true,record_path:saved.path,record_sha256:saved.sha256,replayed:saved.replayed};
  } catch(error) {throw error instanceof MemoryError?error:memoryError('MEMORY_UNAVAILABLE');}
}
export async function retireLesson(workspaceRoot,raw) {
  try {
    const input=structuredClone(raw);object(input,['lesson_id','retired_at','reason']);hash(input.lesson_id);time(input.retired_at);text(input.reason,512);
    const w=await memoryWorkspace(workspaceRoot),lesson=await lessonRead(w,lessonPath(w,input.lesson_id));
    const record={schema_version:1,kind:'retirement',binding:w.binding,...input};
    const saved=await lifecycleWrite(w,async()=>{
      const retirement_id=sha256(canonical(record));
      await lifecycleAppend(w,lesson,'retirements',{retirement_id,record_sha256:sha256(encode(record)),retired_at:record.retired_at});
      return writeOnce(w,`${w.base}/retirements/${retirement_id}.json`,record);
    });
    return {status:'recorded',advisory:true,record_path:saved.path,record_sha256:saved.sha256,replayed:saved.replayed};
  } catch(error) {throw error instanceof MemoryError?error:memoryError('MEMORY_UNAVAILABLE');}
}
