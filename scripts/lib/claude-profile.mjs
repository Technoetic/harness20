import fs from 'node:fs';
import { parseStrictJson } from './strict-json.mjs';
import { assertWorkflowTopicPin } from './workflow-security.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWorkflowProfile, LEGACY_WORKFLOW_PROFILE } from './workflow-profiles.mjs';

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
export const archiveDirectory = profile => profile.id === LEGACY_WORKFLOW_PROFILE
  ? 'step_archive/archived' : `step_archive/profiles/${profile.id}/archived`;

function physicalFile(root, name) {
  let target = root;
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i++) {
    target = path.join(target, parts[i]);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) throw new Error('Unsafe step body');
  }
  return target;
}
export function readPhysicalFileSync(root,name,limit) {
  const target=physicalFile(root,name), fd=fs.openSync(target,'r');
  try {
    const before=fs.fstatSync(fd,{bigint:true});
    if(!before.isFile() || before.nlink !== 1n || before.size > BigInt(limit)) throw Error('Unsafe or oversized profile input');
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length) {const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)break;offset+=n;}
    const extra=Buffer.alloc(1),after=fs.fstatSync(fd,{bigint:true});
    physicalFile(root,name);
    const final=fs.lstatSync(target,{bigint:true});
    if(offset!==bytes.length || fs.readSync(fd,extra,0,1,offset) || ['ino','dev','nlink','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k] || before[k]!==final[k])) throw Error('Profile input changed while reading');
    return bytes;
  }finally{fs.closeSync(fd);}
}
export function checkClaudeProfileBinding(root, profile) {
  let bytes;
  try { bytes = readPhysicalFileSync(root, 'step_archive/workflow-profile.json',4096); }
  catch (error) { if (error.code === 'ENOENT' && profile.id === LEGACY_WORKFLOW_PROFILE) return; throw error; }
  const binding=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if (resolveWorkflowProfile(binding).id !== profile.id) throw new Error('Workspace profile binding conflicts with progress');
  if(Object.hasOwn(binding,'security_policy'))assertWorkflowTopicPin(binding,readPhysicalFileSync(root,'step_archive/TOPIC/TOPIC.md',1024*1024));
}

// New archived bodies retain the selected physical definition; no flat/legacy fallback.
export function claudeStepBody(root, state, step) {
  const profile = resolveWorkflowProfile(state);
  checkClaudeProfileBinding(root, profile);
  if (!Number.isInteger(step) || step < 1 || step > profile.stepCount) throw new Error('Invalid step');
  const name = `step${String(step).padStart(3, '0')}.md`;
  const relative = `${archiveDirectory(profile)}/${name}`;
  if (profile.id !== LEGACY_WORKFLOW_PROFILE) {
    if (typeof state.run_started_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(state.run_started_at) || !Number.isFinite(Date.parse(state.run_started_at))) throw new Error('Invalid run generation');
    const archived = readPhysicalFileSync(root, relative,1024*1024);
    const original = readPhysicalFileSync(pluginRoot, `${profile.sourceDirectory}/${name}`,1024*1024);
    if (!archived.equals(original)) throw new Error('Archived profile body does not match its definition');
    return relative;
  }
  try { physicalFile(root, relative); return relative; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const flat = `step_archive/${name}`;
  physicalFile(root, flat); return flat;
}
