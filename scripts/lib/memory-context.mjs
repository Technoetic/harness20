// Retrieval is a bounded advisory projection of explicitly pinned, untrusted data.
import { memoryWorkspace, assertMemoryBinding, memoryCanonical, memoryId } from './memory-policy.mjs';
import { withReadBudget } from './read-budget.mjs';
import { inspectLessons, validateLessonRecord } from './workflow-memory.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { unsafeJevText } from './sensitive-data.mjs';
import { contractObject, contractId, contractHash, contractArray, contractSnapshot, contractReference,
  pinnedContextJson, sourceReader } from './memory-manifest.mjs';

const compare=(a,b)=>a<b?-1:a>b?1:0;
const tokens=text=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
function instant(value) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Invalid task context');
  const normalized=value.replace(/(?:\.(\d{1,3}))?Z$/,(_,fraction)=>`.${(fraction??'').padEnd(3,'0')}Z`);
  if(new Date(value).toISOString()!==normalized)throw Error('Invalid task context');
  return Date.parse(value);
}
function finalized(value) {
  let size=0;
  for(let i=0;i<8;i++) {value.serialized_bytes=size;const next=Buffer.byteLength(JSON.stringify(value));if(next===size)return value;size=next;}
  throw Error('Invalid task context');
}
function ranking(entries,query,backend) {
  const q=[...new Set(tokens(query))],documents=entries.map(entry=>tokens(entry.text)), N=documents.length;
  const average=N?documents.reduce((n,d)=>n+d.length,0)/N:0;
  const df=new Map(q.map(word=>[word,documents.filter(doc=>doc.includes(word)).length]));
  const bm25=entries.map((entry,i)=>{
    const doc=documents[i];let score=0,overlap=0;
    for(const word of q) {
      const freq=doc.filter(w=>w===word).length;
      if(!freq)continue;overlap++;
      const idf=Math.log(1+(N-df.get(word)+0.5)/(df.get(word)+0.5));
      score+=idf*(freq*2.2)/(freq+1.2*(0.25+0.75*doc.length/(average||1)));
    }
    return {entry,score,overlap};
  });
  const ordered=(items,key)=>items.filter(v=>v[key]>0).sort((a,b)=>b[key]-a[key]||compare(a.entry.id,b.entry.id));
  const bm=ordered(bm25,'score');
  if(backend==='bm25')return bm;
  const overlap=ordered(bm25,'overlap'),rrf=new Map();
  for(const list of [bm,overlap])list.forEach((v,i)=>rrf.set(v.entry.id,(rrf.get(v.entry.id)??0)+1/(60+i+1)));
  return bm25.filter(v=>rrf.has(v.entry.id)).map(v=>({...v,score:rrf.get(v.entry.id)})).sort((a,b)=>b.score-a.score||compare(a.entry.id,b.entry.id));
}
function validateEntry(entry,knownIds) {
  contractObject(entry,['id','kind','role','mandatory','reference'],['work_unit_id','links','lesson']);contractId(entry.id);
  if(!['repository-source','approved-artifact','lesson'].includes(entry.kind)||!['scope','blocker','candidate'].includes(entry.role)
      ||typeof entry.mandatory!=='boolean'||(['scope','blocker'].includes(entry.role)&&!entry.mandatory))throw Error('Invalid task context');
  contractReference(entry.reference);if(entry.work_unit_id!==undefined)contractId(entry.work_unit_id);
  const links=entry.links===undefined?[]:contractArray(entry.links,128);links.forEach(contractId);
  if(new Set(links).size!==links.length||links.some(id=>!knownIds.has(id)))throw Error('Invalid task context');
  if(entry.kind==='lesson') {
    if(entry.mandatory||entry.role!=='candidate')throw Error('Invalid task context');
    const meta=entry.lesson;contractObject(meta,['id','record_path','record_sha256','task_id','sources','check_ids']);
    contractHash(meta.id);contractHash(meta.record_sha256);memoryId(meta.task_id);contractArray(meta.sources);meta.sources.forEach(contractReference);
    contractArray(meta.check_ids).forEach(memoryId);
    if(meta.record_path!==entry.reference.path||meta.record_sha256!==entry.reference.file_sha256)throw Error('Invalid task context');
  } else if(entry.lesson!==undefined)throw Error('Invalid task context');
}
function lessonGroups(entries,binding) {
  const groups=new Map();
  for(const entry of entries.filter(v=>v.kind==='lesson')) {
    const record=parseStrictJson(entry.text);validateLessonRecord(record);
    if(record.lesson_id!==entry.lesson.id)throw Error('Invalid task context');
    const task_id=entry.lesson.task_id,sources=[...entry.lesson.sources].sort((a,b)=>compare(a.path,b.path)),check_ids=[...entry.lesson.check_ids].sort(compare);
    const origin=record.binding.workflow_generation!==binding.workflow_generation;
    const key=memoryCanonical({task_id,sources,check_ids,generation:record.binding.workflow_generation});
    if(!groups.has(key))groups.set(key,{task_id,sources,check_ids,origin,entries:[]});
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()];
}
async function applicableLessons(root,groups,as_of) {
  const active=new Set();
  // Groups share one exact selected source/check/task scope. Only selected
  // records and actual superseding provenance are verified; no metrics scans.
  for(const group of groups) {
    let offset=0;
    while(offset<group.entries.length) {
      const entries=[];let bytes=0;
      while(offset<group.entries.length&&entries.length<(group.origin?32:128)) {
        const entry=group.entries[offset],cost=Buffer.byteLength(entry.text)+512;
        if(entries.length&&bytes+cost>48*1024)break;
        entries.push(entry);offset++;bytes+=cost;
      }
      const origins=group.origin?[...new Map(entries.map(e=>[e.lesson.record_path,{path:e.lesson.record_path,sha256:e.lesson.record_sha256}])).values()]:[];
      const result=await inspectLessons(root,{task_id:group.task_id,sources:group.sources,check_ids:group.check_ids,
        max_results:128,max_bytes:65536,as_of,origins,selected_ids:[...new Set(entries.map(e=>e.lesson.id))],include_metrics:false});
      if(result.status==='current')for(const entry of entries)
        if(result.lessons.some(v=>v.lesson_id===entry.lesson.id&&v.record_sha256===entry.lesson.record_sha256))active.add(entry.id);
    }
  }
  return active;
}
async function retrieveWithinBudget(workspaceRoot,input) {
  try {
    const options=contractSnapshot(input);
    contractObject(options,['manifest_path','manifest_sha256','query','budget_bytes','as_of'],['work_unit_id','backend','expand_links']);
    const backend=options.backend??'bm25';
    if(!['bm25','hybrid'].includes(backend)||typeof options.query!=='string'||Buffer.byteLength(options.query)>2048||unsafeJevText(options.query)
       ||!Number.isSafeInteger(options.budget_bytes)||options.budget_bytes<1024||options.budget_bytes>65536
       ||(options.expand_links!==undefined&&typeof options.expand_links!=='boolean'))throw Error('Invalid task context');
    options.as_of=new Date(instant(options.as_of)).toISOString();if(options.work_unit_id!==undefined)contractId(options.work_unit_id);
    const {root,binding}=await memoryWorkspace(workspaceRoot);
    const manifest=await pinnedContextJson(root,options.manifest_path,options.manifest_sha256);
    contractObject(manifest,['schema_version','binding','sources']);
    if(manifest.schema_version!==1)throw Error('Invalid task context');assertMemoryBinding(manifest.binding,binding);
    const entries=contractArray(manifest.sources),known=new Set();
    for(const entry of entries) {contractId(entry.id);if(known.has(entry.id))throw Error('Invalid task context');known.add(entry.id);}
    entries.forEach(e=>validateEntry(e,known));const reader=sourceReader(root),considered=[],omissions=[];
    for(const entry of entries) {
      // Classify and verify every selected manifest source, even sources which
      // would not rank. A manifest never bypasses the source access boundary.
      const source=await reader.read(entry.reference,entry.kind);const enriched={...entry,text:source.text};
      if(!entry.mandatory&&entry.work_unit_id!==undefined&&entry.work_unit_id!==options.work_unit_id)omissions.push({id:entry.id,reason:'work_unit'});
      else considered.push(enriched);
    }
    const groups=lessonGroups(considered,binding),activeLessons=await applicableLessons(root,groups,options.as_of);
    const eligible=considered.filter(entry=>{if(entry.kind!=='lesson'||activeLessons.has(entry.id))return true;omissions.push({id:entry.id,reason:'inactive_lesson'});return false;});
    const mandatory=eligible.filter(e=>e.mandatory).sort((a,b)=>compare(a.id,b.id));
    const optional=eligible.filter(e=>!e.mandatory),ranked=ranking(optional,options.query,backend);
    const selectedIds=new Set([...mandatory.map(e=>e.id),...ranked.map(v=>v.entry.id)]),linked=[];
    if(options.expand_links) {
      const byId=new Map(eligible.map(e=>[e.id,e]));let frontier=[...mandatory,...ranked.map(v=>v.entry)];
      for(let hop=0;hop<2;hop++) {
        const next=[];
        for(const current of frontier)for(const id of [...(current.links??[])].sort(compare)) {
          const entry=byId.get(id);if(entry&&!selectedIds.has(id)){selectedIds.add(id);next.push(entry);linked.push({entry,score:0});}
        }
        frontier=next;
      }
    }
    const candidates=[...ranked,...linked];
    for(const entry of optional)if(!selectedIds.has(entry.id))omissions.push({id:entry.id,reason:'no_match'});
    const pack={status:'current',advisory:true,untrusted_data:true,binding,manifest_sha256:options.manifest_sha256,backend,
      sources:[],omissions:[],omitted_count:entries.length-mandatory.length,omission_details_omitted:0,serialized_bytes:0};
    const projection=(entry,score)=>({id:entry.id,role:entry.role,mandatory:entry.mandatory,reference:entry.reference,text:entry.text,retrieval_score:score});
    pack.sources=mandatory.map(e=>projection(e,null));
    const blocked=()=>finalized({status:'blocked',advisory:true,diagnostic:'mandatory_context_exceeds_budget',sources:[],serialized_bytes:0});
    // Account for complete JSON, not merely excerpt text. Omission details are
    // bounded and their excluded count is always explicit.
    async function recheck() {
      await reader.recheck();await pinnedContextJson(root,options.manifest_path,options.manifest_sha256);
      const currentLessons=await applicableLessons(root,groups,options.as_of);
      if(eligible.some(entry=>entry.kind==='lesson'&&!currentLessons.has(entry.id)))throw Error('Invalid task context');
      assertMemoryBinding((await memoryWorkspace(root)).binding,binding);
    }
    if(finalized(pack).serialized_bytes>options.budget_bytes){await recheck();return blocked();}
    for(const item of candidates) {
      pack.sources.push(projection(item.entry,item.score));pack.omitted_count=entries.length-pack.sources.length;
      if(finalized(pack).serialized_bytes>options.budget_bytes){pack.sources.pop();pack.omitted_count=entries.length-pack.sources.length;omissions.push({id:item.entry.id,reason:'budget'});}
    }
    omissions.sort((a,b)=>compare(a.id,b.id));pack.omission_details_omitted=omissions.length;
    for(const omission of omissions) {
      pack.omissions.push(omission);pack.omission_details_omitted--;
      if(finalized(pack).serialized_bytes>options.budget_bytes){pack.omissions.pop();pack.omission_details_omitted++;}
    }
    if(finalized(pack).serialized_bytes>options.budget_bytes){await recheck();return blocked();}
    await recheck();
    return finalized(pack);
  } catch(error) {
    if(error?.code==='MEMORY_UNSUPPORTED')return finalized({status:'unsupported',advisory:true,diagnostic:'unsupported_legacy_workflow',sources:[],serialized_bytes:0});
    if(error?.code==='READ_BUDGET_EXCEEDED')throw error;
    throw Error('Invalid task context');
  }
}
export async function retrieveTaskContext(workspaceRoot,input) {
  try {return await withReadBudget(32*1024*1024,()=>retrieveWithinBudget(workspaceRoot,input));}
  catch(error) {
    if(error?.code==='READ_BUDGET_EXCEEDED')return finalized({status:'blocked',advisory:true,diagnostic:'context_read_budget_exceeded',sources:[],serialized_bytes:0});
    throw Error('Invalid task context');
  }
}
