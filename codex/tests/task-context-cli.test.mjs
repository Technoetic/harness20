import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';
import { initWorkflow } from '../scripts/lib/workflow.mjs';
import { memoryWorkspace } from '../../scripts/lib/memory-policy.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
const cli=fileURLToPath(new URL('../../scripts/task-context.mjs',import.meta.url));
const diagnostic={error:{code:'CONTEXT_COMMAND_FAILED',message:'Task context command failed'}};
function run(args,input='') {const r=spawnSync(process.execPath,[cli,...args],{input,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
function failed(r) {assert.equal(r.status,2);assert.equal(r.stdout,'');assert.deepEqual(JSON.parse(r.stderr),diagnostic);}
async function fixture() {
  const root=await makeWorkspace();await initWorkflow({workspaceRoot:root,topic:'Public context fixture.',now:'2026-10-08T00:00:00.000Z',idFactory:()=> 'context-cli'});
  const {binding}=await memoryWorkspace(root);await mkdir(join(root,'docs'));
  const bytes=Buffer.from('repair public scope');await writeFile(join(root,'docs/source.txt'),bytes);
  const reference={path:'docs/source.txt',file_sha256:sha256(bytes),start_byte:0,end_byte:bytes.length,range_sha256:sha256(bytes)};
  const manifest=Buffer.from(JSON.stringify({schema_version:1,binding,sources:[{id:'scope',kind:'repository-source',role:'scope',mandatory:true,reference}]}));
  await writeFile(join(root,'docs/context.json'),manifest);
  const units=Buffer.from(JSON.stringify({schema_version:1,binding,work_units:[{id:'repair',files:['docs/source.txt'],depends_on:[]}]}));await writeFile(join(root,'docs/units.json'),units);
  return {root,retrieve:{manifest_path:'docs/context.json',manifest_sha256:sha256(manifest),query:'repair',budget_bytes:8192,as_of:'2026-10-08T00:00:00.000Z'},validate:{work_units_path:'docs/units.json',work_units_sha256:sha256(units)}};
}
test('context CLI rejects unknown, duplicate and non-stdin flags with safe diagnostics',async()=>{
  const root=await makeWorkspace(),base=['retrieve','--workspace',root,'--input','-'];
  for(const args of [[],['unknown'],[...base,'--extra','SECRET_SENTINEL'],[...base,'--input','-'],['retrieve','--workspace',root],['retrieve','--workspace',root,'--input','private.json'],[...base,'SECRET_SENTINEL']])failed(run(args,'{}'));
});
test('context CLI rejects malformed, duplicate-field, oversized and secret JSON with no echo',async()=>{
  const f=await fixture(),args=['retrieve','--workspace',f.root,'--input','-'];
  for(const input of ['', '[]','null','{} {}','{"query":"a","query":"b"}',Buffer.from([0xc3,0x28]),
    JSON.stringify({private:'SECRET_SENTINEL'.repeat(25000)}),JSON.stringify({...f.retrieve,password:'SECRET_SENTINEL'}),
    JSON.stringify({...f.retrieve,query:'password=SECRET_SENTINEL'})])failed(run(args,input));
});
test('context CLI retrieves a pinned source and validates actual declarations',async()=>{
  const f=await fixture();for(const [command,input] of [['retrieve',f.retrieve],['validate',f.validate]]) {
    const r=run([command,'--workspace',f.root,'--input','-'],JSON.stringify(input));assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');const value=JSON.parse(r.stdout);assert.equal(value.status,'current');assert.equal(value.advisory,true);
    if(command==='retrieve'){assert.equal(value.sources[0].text,'repair public scope');assert.equal(value.serialized_bytes,Buffer.byteLength(JSON.stringify(value)));}
    else {assert.equal(value.declaration_only,true);assert.equal(value.actual_tool_history_verified,false);}
  }
});
test('context CLI blocks stale digests and denied manifest paths without disclosing paths',async()=>{
  const f=await fixture(),args=['retrieve','--workspace',f.root,'--input','-'];await writeFile(join(f.root,'docs/source.txt'),'changed source');failed(run(args,JSON.stringify(f.retrieve)));
  failed(run(args,JSON.stringify({...f.retrieve,manifest_path:'.env'})));
  failed(run(['validate','--workspace',f.root,'--input','-'],JSON.stringify({...f.validate,unexpected:'SECRET_SENTINEL'})));
});
