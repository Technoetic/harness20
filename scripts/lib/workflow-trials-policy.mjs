// Explicit offline observations only. These records confer no workflow authority.
import { open, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readSafe, safePath, sha256 } from './quality-files.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { contractSnapshot, contractId } from './memory-manifest.mjs';
import { memoryObject, memoryText, memoryHash, memoryList, memoryUnique, memoryCanonical,
  memoryWorkspace, recheckMemoryWorkspace, readMemorySource } from './memory-policy.mjs';
import { validateState } from '../../codex/scripts/lib/schema.mjs';
import { parseReceipt, receiptMatchesState } from '../../codex/scripts/lib/receipts.mjs';
import { withReadBudget } from './read-budget.mjs';

export const TRIAL_LIMITS = Object.freeze({input:64*1024,output:256*1024,read:64*1024*1024,scenarios:16,sources:32,file:256*1024});
export const DEFAULT_PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const STATE_PATH = 'step_archive/.harness50-codex/state.json';
export const receiptName = step => `step_archive/.harness50-codex/receipts/step${String(step).padStart(3,'0')}.json`;
export class TrialError extends Error {
  constructor(code='TRIAL_INVALID') {super('Offline trial rejected: invalid, unsafe, changed or unverified input.');this.code=code;}
}
export const requireTrial = (condition,code='TRIAL_INVALID') => {if(!condition)throw new TrialError(code);};
export const object = memoryObject;
export const hash = memoryHash;
export const identifier = contractId;
export const textId = value => {memoryText(value,128);requireTrial(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(value));return value;};
export const canonical = memoryCanonical;
export const bytes = value => Buffer.from(`${canonical(value)}\n`);
export function snapshot(input) {
  const value=contractSnapshot(input);requireTrial(bytes(value).length<=TRIAL_LIMITS.input);return value;
}
export function list(value,max=TRIAL_LIMITS.sources,min=0) {return memoryList(value,max,min);}
export function ids(value) {const result=list(value,32,1).map(identifier);memoryUnique(result);return [...result].sort();}
export function integer(value,max,min=0) {requireTrial(Number.isSafeInteger(value)&&value>=min&&value<=max);return value;}
export function budgets(value) {object(value,['actions','tokens']);integer(value.actions,1000000,1);integer(value.tokens,1000000000,1);return value;}
export function selector(input) {const value=snapshot(input);object(value,['trial_id','manifest_sha256']);identifier(value.trial_id);hash(value.manifest_sha256);return value;}
export function output(value) {requireTrial(bytes(value).length<=TRIAL_LIMITS.output);return value;}
export async function bounded(callback) {
  try {return output(await withReadBudget(TRIAL_LIMITS.read,callback));}
  catch(error) {if(error instanceof TrialError)throw error;throw new TrialError();}
}
export async function json(root,path,limit=TRIAL_LIMITS.file) {
  const data=await readSafe(root,path,limit);
  return {value:parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(data)),sha256:sha256(data),bytes:data};
}
export async function writeOnce(root,path,value,recheck) {
  const data=bytes(value);requireTrial(data.length<=TRIAL_LIMITS.file);
  await recheck();const target=await safePath(root,path,{createParents:true});
  let handle;
  try {handle=await open(target,'wx',0o600);}
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    const existing=await readSafe(root,path,TRIAL_LIMITS.file);
    requireTrial(existing.equals(data),'TRIAL_CONFLICT');await recheck();
    return {path,sha256:sha256(data),replayed:true};
  }
  try {
    // Exclusive open can follow a parent changed after the first path check.
    // Validate the opened inode and physical ancestry before sending payload bytes.
    const beforeWrite=async()=>{
      await safePath(root,path);const named=await lstat(target,{bigint:true}),opened=await handle.stat({bigint:true});
      requireTrial(opened.isFile()&&opened.nlink===1n&&opened.size===0n&&named.ino===opened.ino&&named.dev===opened.dev);
    };
    await beforeWrite();await recheck();await beforeWrite();
    await handle.writeFile(data);await handle.sync();
    const opened=await handle.stat();requireTrial(opened.isFile()&&opened.nlink===1);
    await safePath(root,path);requireTrial((await readSafe(root,path,TRIAL_LIMITS.file)).equals(data));
    await recheck();return {path,sha256:sha256(data),replayed:false};
  } finally {await handle.close();}
}
export async function currentState(root) {
  try {const loaded=await json(root,STATE_PATH,1024*1024);validateState(loaded.value);return loaded;}
  catch(error) {if(error.code==='ENOENT')return null;throw error;}
}
export async function currentReceipts(root,state) {
  if(!state)return [];
  const result=[];
  for(const step of state.completed_steps) {
    const loaded=await json(root,receiptName(step));const receipt=parseReceipt(loaded.value);
    requireTrial(receipt.step===step&&receiptMatchesState(receipt,state));
    result.push({step,sha256:loaded.sha256,receipt});
  }
  return result;
}
export async function trialWorkspace(workspaceRoot) {
  const workspace=await memoryWorkspace(workspaceRoot),state=await currentState(workspace.root);
  const receipts=await currentReceipts(workspace.root,state?.value);
  return {...workspace,base:`step_archive/outputs/workflow-trials/${workspace.context.namespace}`,
    receipts:receipts.map(({step,sha256:digest})=>({step,sha256:digest}))};
}
export async function recheckWorkspace(workspace) {
  await recheckMemoryWorkspace(workspace);
  const state=await currentState(workspace.root),receipts=await currentReceipts(workspace.root,state?.value);
  requireTrial(canonical(receipts.map(({step,sha256:digest})=>({step,sha256:digest})))===canonical(workspace.receipts),'TRIAL_CHANGED');
}
export async function references(root,values) {
  list(values);const keys=[];
  for(const reference of values) {
    requireTrial(typeof reference?.path==='string'&&!/^step_archive\/outputs\/workflow-trials(?:\/|$)/i.test(reference.path));
    const kind=reference.path.startsWith('step_archive/')?'approved-artifact':'repository-source';
    await readMemorySource(root,reference,{kind});keys.push(canonical(reference));
  }
  memoryUnique(keys);
}
