// Sidecars describe declared reads and evidence. They confer no execution authority.
import { memoryWorkspace, assertMemoryBinding, assertMemorySourcePath, readMemorySource, memoryJson } from './memory-policy.mjs';
import { unsafeJevText } from './sensitive-data.mjs';

const MAX_JSON = 256 * 1024;
const MAX_READS = 32 * 1024 * 1024;
const HEX = /^[a-f0-9]{64}$/;
export function contractObject(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || required.some(k => !Object.hasOwn(value,k))
      || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) throw Error('Invalid declaration');
}
export function contractId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) throw Error('Invalid declaration');
  return value;
}
export function contractHash(value) { if (typeof value !== 'string' || !HEX.test(value)) throw Error('Invalid declaration'); return value; }
export function contractText(value, limit = 2048) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > limit || unsafeJevText(value)) throw Error('Invalid declaration');
  return value;
}
export function contractArray(value, max = 128) {
  if (!Array.isArray(value) || value.length > max) throw Error('Invalid declaration');return value;
}
export function contractSnapshot(value) {
  let nodes=0;
  function clone(v,depth) {
    if (++nodes>10000 || depth>32) throw Error('Invalid declaration');
    if (v===null || typeof v==='boolean' || typeof v==='string') return v;
    if(typeof v==='number' && Number.isFinite(v))return v;
    if(!v || typeof v!=='object' || ![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(v)))throw Error('Invalid declaration');
    const result=Array.isArray(v)?[]:{}, fields=Object.getOwnPropertyDescriptors(v);
    if(Array.isArray(v)&&v.length>10000)throw Error('Invalid declaration');
    for(const key of Reflect.ownKeys(fields)) {
      if(key==='length'&&Array.isArray(v))continue;
      const field=fields[key];
      if(typeof key!=='string'||!field.enumerable||!Object.hasOwn(field,'value')||key==='__proto__')throw Error('Invalid declaration');
      Object.defineProperty(result,key,{value:clone(field.value,depth+1),enumerable:true,writable:true,configurable:true});
    }
    if(Array.isArray(v)&&result.length!==v.length)throw Error('Invalid declaration');
    return result;
  }
  return clone(value,0);
}
export function contextPathKind(path) {
  return typeof path==='string' && /^step_archive\/(?:outputs|specs|screenshots)\//.test(path) ? 'approved-artifact' : 'repository-source';
}
export async function pinnedContextJson(root,path,digest) {
  contractHash(digest);assertMemorySourcePath(path,contextPathKind(path));
  const result=await memoryJson(root,path,MAX_JSON);
  if(result.sha256!==digest)throw Error('Invalid declaration');
  return result.value;
}
export function contractReference(ref) {
  contractObject(ref,['path','file_sha256','start_byte','end_byte','range_sha256']);
  contractHash(ref.file_sha256);contractHash(ref.range_sha256);
  if(!Number.isSafeInteger(ref.start_byte)||!Number.isSafeInteger(ref.end_byte)||ref.start_byte<0||ref.end_byte<=ref.start_byte||ref.end_byte-ref.start_byte>16384)throw Error('Invalid declaration');
}
export function sourceReader(root) {
  const verified=[];let total=0;
  async function read(reference,kind=contextPathKind(reference?.path),track=true) {
    contractReference(reference);assertMemorySourcePath(reference.path,kind);
    const source=await readMemorySource(root,reference,{kind,max_file_bytes:8*1024*1024,max_excerpt_bytes:16384});
    total+=source.file_bytes;
    if(total>MAX_READS || (track && total>MAX_READS/2))throw Error('Invalid declaration');
    if(track)verified.push({reference,kind});
    return source;
  }
  return {read,async recheck(){for(const {reference,kind} of verified)await read(reference,kind,false);}};
}
function validateHeader(value,binding,collection) {
  contractObject(value,['schema_version','binding',collection],collection==='work_units'?[]:['work_units_sha256']);
  if(value.schema_version!==1)throw Error('Invalid declaration');assertMemoryBinding(value.binding,binding);
}
function validateWorkUnits(value,binding) {
  validateHeader(value,binding,'work_units');const units=new Map(),owners=new Set();
  for(const unit of contractArray(value.work_units)) {
    contractObject(unit,['id','files','depends_on']);contractId(unit.id);
    if(units.has(unit.id))throw Error('Invalid declaration');
    if(contractArray(unit.files,3).length<1)throw Error('Invalid declaration');
    for(const path of unit.files) {
      assertMemorySourcePath(path,'repository-source');
      const key=path.toLowerCase();if(owners.has(key))throw Error('Invalid declaration');owners.add(key);
    }
    const dependencies=contractArray(unit.depends_on);dependencies.forEach(contractId);
    if(new Set(dependencies).size!==dependencies.length)throw Error('Invalid declaration');units.set(unit.id,unit);
  }
  if(!units.size)throw Error('Invalid declaration');
  const active=new Set(),done=new Set();
  function visit(id) {
    if(active.has(id)||!units.has(id))throw Error('Invalid declaration');if(done.has(id))return;
    active.add(id);units.get(id).depends_on.forEach(visit);active.delete(id);done.add(id);
  }
  for(const id of units.keys())visit(id);return units;
}
function assertUnit(units,id) { contractId(id);if(!units.has(id))throw Error('Invalid declaration'); }
function isOverlap(a,b) {return a.reference.path.toLowerCase()===b.reference.path.toLowerCase()&&a.decision_id===b.decision_id&&a.reference.start_byte<b.reference.end_byte&&b.reference.start_byte<a.reference.end_byte;}
async function validateLedger(value,binding,digest,units,reader) {
  validateHeader(value,binding,'reads');if(value.work_units_sha256!==digest)throw Error('Invalid declaration');
  const previous=new Map();
  for(const item of contractArray(value.reads)) {
    contractObject(item,['id','work_unit_id','decision_id','kind','reference'],['repeat_of','reason']);
    contractId(item.id);contractId(item.decision_id);assertUnit(units,item.work_unit_id);
    if(previous.has(item.id)||!['repository-source','approved-artifact'].includes(item.kind))throw Error('Invalid declaration');
    const overlaps=[...previous.values()].filter(prior=>isOverlap(item,prior));
    if(item.repeat_of!==undefined || item.reason!==undefined || overlaps.length) {
      contractText(item.reason);const refs=contractArray(item.repeat_of);
      if(!refs.length||new Set(refs).size!==refs.length||refs.some(id=>!previous.has(id))||overlaps.some(prior=>!refs.includes(prior.id))
         ||refs.some(id=>!isOverlap(item,previous.get(id))))throw Error('Invalid declaration');
    }
    await reader.read(item.reference,item.kind);previous.set(item.id,item);
  }
}
async function validateCheckpoints(value,binding,digest,units,reader) {
  validateHeader(value,binding,'checkpoints');if(value.work_units_sha256!==digest)throw Error('Invalid declaration');const ids=new Set();
  for(const item of contractArray(value.checkpoints)) {
    contractObject(item,['id','work_unit_id','status','changes','test_evidence','blockers','next_safe_action']);
    contractId(item.id);assertUnit(units,item.work_unit_id);
    if(ids.has(item.id)||!['planned','in_progress','blocked','passed'].includes(item.status))throw Error('Invalid declaration');ids.add(item.id);
    contractText(item.next_safe_action);contractArray(item.blockers).forEach(v=>contractText(v));
    const changes=contractArray(item.changes);for(const ref of changes) {
      if(!units.get(item.work_unit_id).files.some(path=>path.toLowerCase()===ref?.path?.toLowerCase()))throw Error('Invalid declaration');
      await reader.read(ref);
    }
    const evidence=contractArray(item.test_evidence);
    for(const proof of evidence) {
      contractObject(proof,['reference','exit_code'],['command']);
      if(!Number.isSafeInteger(proof.exit_code)||proof.exit_code<0||proof.exit_code>255)throw Error('Invalid declaration');
      if(proof.command!==undefined)contractText(proof.command);
      await reader.read(proof.reference);
    }
    if(item.status==='passed'&&(!changes.length||!evidence.length||evidence.some(p=>p.exit_code!==0)||item.blockers.length))throw Error('Invalid declaration');
  }
}
export async function inspectContextContracts(workspaceRoot,input) {
  try {
    const options=contractSnapshot(input);
    contractObject(options,['work_units_path','work_units_sha256'],['read_ledger_path','read_ledger_sha256','checkpoints_path','checkpoints_sha256']);
    const workspace=await memoryWorkspace(workspaceRoot), {root,binding}=workspace;
    const loaded=[];
    async function load(prefix) {
      const path=options[`${prefix}_path`],digest=options[`${prefix}_sha256`];
      if(path===undefined&&digest===undefined)return null;
      if(path===undefined||digest===undefined)throw Error('Invalid declaration');
      const value=await pinnedContextJson(root,path,digest);loaded.push({prefix,path,digest});return value;
    }
    const workUnits=await load('work_units');const units=validateWorkUnits(workUnits,binding),reader=sourceReader(root);
    const ledger=await load('read_ledger');if(ledger)await validateLedger(ledger,binding,options.work_units_sha256,units,reader);
    const checkpoints=await load('checkpoints');if(checkpoints)await validateCheckpoints(checkpoints,binding,options.work_units_sha256,units,reader);
    await reader.recheck();for(const item of loaded)await pinnedContextJson(root,item.path,item.digest);
    assertMemoryBinding((await memoryWorkspace(root)).binding,binding);
    return {status:'current',advisory:true,declaration_only:true,actual_tool_history_verified:false,binding,
      digests:Object.fromEntries(loaded.map(v=>[v.prefix,v.digest])),work_unit_count:units.size};
  } catch(error) {return {status:error?.code==='MEMORY_UNSUPPORTED'?'unsupported':'invalid',advisory:true,declaration_only:true,
    actual_tool_history_verified:false,diagnostic:error?.code==='MEMORY_UNSUPPORTED'?'unsupported_legacy_workflow':'invalid_context_contracts'};}
}
