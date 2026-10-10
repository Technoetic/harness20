// Advisory memory policy. No workspace enumeration, commands or network access.
import { resolve } from 'node:path';
import { physicalWorkspace, readSafe, sha256 } from './quality-files.mjs';
import { workflowContext } from './workflow-context.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { unsafeJevText } from './sensitive-data.mjs';
import { WORKFLOW_PROFILE_IDS, LEGACY_WORKFLOW_PROFILE } from './workflow-profiles.mjs';

export const MEMORY_LIMITS = Object.freeze({ manifest:256*1024, file:8*1024*1024,
  aggregate:32*1024*1024, excerpt:16*1024, query:2048, output:64*1024, sources:128 });
const HASH = /^[a-f0-9]{64}$/;
const CONTROL_DOCUMENT = /^(?:(?:agents|claude|gemini|codex)(?:\.(?:local|override))?|skill|memory|topic)\.md$/i;
const SECRET = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]|\bbearer\s+\S+|\b(?:sk|ghp|github_pat)[_-][a-zA-Z0-9_-]{16,}|https?:\/\/[^\s/]+:[^\s/]+@)/i;
const CODES = new Set(['MEMORY_INVALID','MEMORY_UNSUPPORTED','MEMORY_UNAVAILABLE','MEMORY_CHANGED','MEMORY_CONFLICT','MEMORY_BUDGET','MEMORY_UNVERIFIED']);
export class MemoryError extends Error {
  constructor(code='MEMORY_INVALID') { super('Memory input unavailable: invalid, unsafe, changed or unverified.');
    this.name='MemoryError'; this.code=CODES.has(code)?code:'MEMORY_INVALID'; }
}
export const memoryError = code => new MemoryError(code);
export function memoryRequire(condition, code='MEMORY_INVALID') { if(!condition) throw memoryError(code); }
export function memoryObject(value, required, optional=[]) {
  memoryRequire(value && typeof value==='object' && !Array.isArray(value));
  memoryRequire(required.every(key=>Object.hasOwn(value,key)) && Object.keys(value).every(key=>[...required,...optional].includes(key)));
  return value;
}
export function memoryText(value,maxBytes=1024,{empty=false}={}) {
  memoryRequire(typeof value==='string' && Buffer.byteLength(value)<=maxBytes && (empty || value.trim().length>0));
  memoryRequire(!unsafeJevText(value) && !SECRET.test(value));
  // JSON also needs scalar Unicode, rather than lone surrogate replacement.
  memoryRequire(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(value))===value);
  return value;
}
export function memoryId(value) { memoryText(value,80); memoryRequire(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value)); return value; }
export function memoryHash(value) { memoryRequire(typeof value==='string' && HASH.test(value)); return value; }
export function memoryList(value,max,min=0) { memoryRequire(Array.isArray(value)&&value.length>=min&&value.length<=max); return value; }
export function memoryUnique(values) { memoryRequire(new Set(values.map(v=>v.toLowerCase())).size===values.length); return values; }
export function memoryTime(value) {
  memoryRequire(typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value);
  return value;
}
export function memoryCanonical(value) {
  if(Array.isArray(value)) return `[${value.map(memoryCanonical).join(',')}]`;
  if(value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${memoryCanonical(value[k])}`).join(',')}}`;
  memoryRequire(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)));
  return JSON.stringify(value);
}
export async function memoryJson(root,path,maxBytes=MEMORY_LIMITS.manifest) {
  try { const bytes=await readSafe(root,path,maxBytes); return {value:parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:sha256(bytes)}; }
  catch(error) { if(error?.code==='ENOENT') throw error; throw memoryError('MEMORY_UNAVAILABLE'); }
}
export function assertMemoryBinding(value,expected) {
  const keys=['repository_sha256','workflow_profile','workflow_generation','topic_sha256'];
  memoryObject(value,keys); memoryHash(value.repository_sha256); memoryHash(value.workflow_generation);
  memoryHash(value.topic_sha256); memoryId(value.workflow_profile);
  if(expected!==undefined) { memoryObject(expected,keys); memoryRequire(keys.every(k=>value[k]===expected[k]),'MEMORY_CHANGED'); }
  return value;
}
export async function memoryWorkspace(workspaceRoot) {
  try {
    const root=await physicalWorkspace(workspaceRoot);
    const normalized=p=>process.platform==='win32'?p.toLowerCase():p;
    memoryRequire(normalized(root)===normalized(resolve(workspaceRoot)),'MEMORY_UNAVAILABLE');
    const context=await workflowContext(root);
    if(!context.generation) throw memoryError('MEMORY_UNSUPPORTED');
    const topic=await readSafe(root,'step_archive/TOPIC/TOPIC.md',1024*1024);
    const binding={repository_sha256:sha256(normalized(root)),workflow_profile:context.profile.id,
      workflow_generation:context.generation,topic_sha256:sha256(topic)};
    assertMemoryBinding(binding);
    return {root,context,binding,base:`step_archive/outputs/workflow-memory/${context.namespace}`};
  } catch(error) { if(error instanceof MemoryError) throw error; throw memoryError('MEMORY_UNAVAILABLE'); }
}
export async function recheckMemoryWorkspace(workspace) {
  const next=await memoryWorkspace(workspace.root); assertMemoryBinding(next.binding,workspace.binding); return next;
}
export function assertMemorySourcePath(path,kind='repository-source') {
  memoryText(path,240);
  memoryRequire(['repository-source','approved-artifact','lesson'].includes(kind));
  memoryRequire(!path.includes('\\')&&!path.includes(':')&&!/[\r\n\t]/.test(path));
  const parts=path.split('/');
  // Classify agent instructions and workflow controls before opening a source.
  // Compatibility forms and case changes cannot turn controls into candidates.
  memoryRequire(!parts.some(p=>CONTROL_DOCUMENT.test(p.normalize('NFKC'))));
  memoryRequire(parts.every(p=>p&&!p.startsWith('.')&&!/[. ]$/.test(p)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)
    && !/^(?:id_rsa|id_ed25519|credentials?|secrets?|private|settings|config|token|password)(?:[._-]|$)/i.test(p)
    && !/\.(?:pem|key|p12|pfx|kdbx)$/i.test(p)));
  memoryRequire(!parts.some(p=>['node_modules','coverage','test-results','playwright-report','memoryhub-mcp'].includes(p.toLowerCase())));
  if(kind==='repository-source') memoryRequire(parts[0].toLowerCase()!=='step_archive');
  if(kind==='approved-artifact') {
    memoryRequire(/^step_archive\/(?:outputs|specs|screenshots)\//.test(path));
    memoryRequire(!/^step_archive\/outputs\/(?:workflow-memory|qa-reports|quality-reports|jev)(?:\/|$)/i.test(path));
  }
  if(kind==='lesson') {
    const match=/^step_archive\/outputs\/workflow-memory\/([^/]+)\/[a-f0-9]{64}\/lessons\/[a-f0-9]{64}\.json$/.exec(path);
    // Legacy unmarked runs have no generation-scoped memory. Accept only
    // registered modern profiles; record readers still verify exact bindings.
    memoryRequire(match && match[1] !== LEGACY_WORKFLOW_PROFILE && WORKFLOW_PROFILE_IDS.includes(match[1]));
  }
  return path;
}
export function memorySourceReference(reference) {
  memoryObject(reference,['path','file_sha256','start_byte','end_byte','range_sha256']);
  memoryHash(reference.file_sha256); memoryHash(reference.range_sha256);
  memoryRequire(Number.isSafeInteger(reference.start_byte)&&Number.isSafeInteger(reference.end_byte)
    && reference.start_byte>=0&&reference.end_byte>reference.start_byte
    &&reference.end_byte-reference.start_byte<=MEMORY_LIMITS.excerpt);
  return {...reference};
}
export async function readMemorySource(root,reference,limits={}) {
  try {
    memoryObject(limits,[],['kind','max_file_bytes','max_excerpt_bytes']);
    const ref=memorySourceReference(reference),kind=limits.kind??'repository-source';
    assertMemorySourcePath(ref.path,kind);
    const fileLimit=limits.max_file_bytes??MEMORY_LIMITS.file,excerptLimit=limits.max_excerpt_bytes??MEMORY_LIMITS.excerpt;
    memoryRequire(Number.isSafeInteger(fileLimit)&&fileLimit>=1&&fileLimit<=MEMORY_LIMITS.file
      &&Number.isSafeInteger(excerptLimit)&&excerptLimit>=1&&excerptLimit<=MEMORY_LIMITS.excerpt);
    const data=await readSafe(root,ref.path,fileLimit);
    memoryRequire(data.length>=ref.end_byte&&sha256(data)===ref.file_sha256,'MEMORY_CHANGED');
    const boundary=offset=>offset===data.length||(data[offset]&0xc0)!==0x80;
    memoryRequire(boundary(ref.start_byte)&&boundary(ref.end_byte));
    memoryRequire(ref.end_byte-ref.start_byte<=excerptLimit);
    if(kind==='lesson') memoryRequire(ref.start_byte===0&&ref.end_byte===data.length);
    const bytes=Buffer.from(data.subarray(ref.start_byte,ref.end_byte));
    memoryRequire(sha256(bytes)===ref.range_sha256,'MEMORY_CHANGED');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes); memoryText(text,excerptLimit);
    return {...ref,text,bytes,file_bytes:data.length};
  } catch(error) { if(error instanceof MemoryError) throw error; throw memoryError('MEMORY_UNAVAILABLE'); }
}
export function sanitizedMemoryReason(value) {
  if(typeof value!=='string'||SECRET.test(value)||unsafeJevText(value)) return 'Observed step failure; inspect approved evidence.';
  let text=value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
  while(Buffer.byteLength(text)>512) text=text.slice(0,-1);
  // Avoid half a surrogate after byte-bound truncation.
  if(/[\uD800-\uDBFF]$/.test(text)) text=text.slice(0,-1);
  return text||'Observed step failure; inspect approved evidence.';
}
