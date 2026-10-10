import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';
import { initWorkflow } from '../scripts/lib/workflow.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';

const command=fileURLToPath(new URL('../../scripts/workflow-trials.mjs',import.meta.url));
const run=(args,input)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[command,...args],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.on('error',()=>{});child.stdin.end(input);
});
async function fixture() {
  const root=await makeWorkspace();await initWorkflow({workspaceRoot:root,workflowProfile:'planning-first-20-v1',topic:'Public CLI fixture.',
    now:'2026-10-10T00:00:00.000Z',idFactory:()=> 'public-cli-run'});return root;
}
test('CLI trace returns metadata without changing state or invoking caller command values',async()=>{
  const root=await fixture(),path=join(root,'step_archive/.harness50-codex/state.json'),before=await readFile(path);
  const result=await run(['trace','--workspace',root,'--input','-'],'{}');
  assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).receipt_count,0);
  assert.deepEqual(await readFile(path),before);
});
test('CLI rejects unknown/duplicate flags, nested data, duplicate JSON keys, oversized input and raw secrets with generic diagnostics',async()=>{
  const root=await fixture();for(const [args,input] of [
    [['trace','--workspace',root,'--input','-'],'{"auth":{"secret":"SECRET_SENTINEL"}}'],
    [['trace','--workspace',root,'--input','-'],'{"key":1,"key":2}'],
    [['trace','--workspace',root,'--input','-'],JSON.stringify({text:'x'.repeat(70000)})],
    [['trace','--workspace',root,'--workspace',root],'{}'],
    [['trace','--workspace',root,'--input','a-file'],'{}'],
    [['exec','--workspace',root,'--input','-'],'{"command":"SECRET_SENTINEL"}']]) {
    const result=await run(args,input);assert.equal(result.code,2);assert.equal(result.stdout,'');
    assert.equal(JSON.parse(result.stderr).error.code,'TRIAL_COMMAND_FAILED');assert.ok(!result.stderr.includes('SECRET_SENTINEL'));
  }
});
test('CLI prepare and inspect freeze public sources while missing observations produce an advisory hold',async()=>{
  const root=await fixture(),text='export const publicValue = 7;';await mkdir(join(root,'src'));await writeFile(join(root,'src/app.js'),text);
  const input={trial_id:'public-cli-trial',task_id:'public-task',scenarios:[{id:'normal',check_ids:['public-check']}],
    sources:[{path:'src/app.js',file_sha256:sha256(text),start_byte:0,end_byte:Buffer.byteLength(text),range_sha256:sha256(text)}],
    model_id:'declared-model',provider_id:'declared-provider',budgets:{actions:8,tokens:1000},tool_set_sha256:sha256('tools'),
    config_sha256:sha256('config'),variants:{baseline_sha256:sha256('old'),candidate_sha256:sha256('new')}};
  const prepared=await run(['prepare','--workspace',root,'--input','-'],JSON.stringify(input));assert.equal(prepared.code,0,prepared.stderr);
  const selected={trial_id:input.trial_id,manifest_sha256:JSON.parse(prepared.stdout).manifest_sha256};
  const inspected=await run(['inspect','--workspace',root,'--input','-'],JSON.stringify(selected));assert.equal(inspected.code,0,inspected.stderr);
  const compared=await run(['compare','--workspace',root,'--input','-'],JSON.stringify(selected));assert.equal(compared.code,2,compared.stderr);
  assert.equal(JSON.parse(compared.stdout).status,'hold');assert.equal(JSON.parse(compared.stdout).advisory,true);
});
