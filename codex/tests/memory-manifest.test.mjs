import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
import { memoryWorkspace } from '../../scripts/lib/memory-policy.mjs';
import { inspectContextContracts } from '../../scripts/lib/memory-manifest.mjs';
import { initWorkflow } from '../scripts/lib/workflow.mjs';

async function fixture() {
  const root=await makeWorkspace();await mkdir(join(root,'step_archive/TOPIC'),{recursive:true});await mkdir(join(root,'docs'));
  await writeFile(join(root,'step_archive/TOPIC/TOPIC.md'),'Scope\n');
  const workflow_profile='planning-first-20-v1';
  await writeFile(join(root,'step_archive/progress.json'),JSON.stringify({schema_version:2,workflow_profile,total_steps:20,current_step:1,completed_steps:[],run_started_at:'2026-10-08T00:00:00.000Z'}));
  await writeFile(join(root,'step_archive/workflow-profile.json'),JSON.stringify({schema_version:2,workflow_profile,total_steps:20}));
  const binding=(await memoryWorkspace(root)).binding;
  const units={schema_version:1,binding,work_units:[{id:'one',files:['docs/source.txt'],depends_on:[]},{id:'two',files:['docs/other.txt'],depends_on:['one']}]};
  const bytes=Buffer.from('public source evidence');await writeFile(join(root,'docs/source.txt'),bytes);
  const ref={path:'docs/source.txt',file_sha256:sha256(bytes),start_byte:0,end_byte:bytes.length,range_sha256:sha256(bytes)};
  const ledger={schema_version:1,binding,work_units_sha256:null,reads:[{id:'read1',work_unit_id:'one',decision_id:'decision',kind:'repository-source',reference:ref}]};
  const checkpoints={schema_version:1,binding,work_units_sha256:null,checkpoints:[{id:'checkpoint',work_unit_id:'one',status:'passed',changes:[ref],test_evidence:[{reference:ref,exit_code:0,command:'declared command; never execute'}],blockers:[],next_safe_action:'Review'}]};
  async function inspect({withLedger=true,withCheckpoints=true}={}) {
    const unitBytes=Buffer.from(JSON.stringify(units)), digest=sha256(unitBytes);
    ledger.work_units_sha256=digest;checkpoints.work_units_sha256=digest;
    const input={work_units_path:'docs/units.json',work_units_sha256:digest};
    await writeFile(join(root,input.work_units_path),unitBytes);
    for (const [prefix,value,include] of [['read_ledger',ledger,withLedger],['checkpoints',checkpoints,withCheckpoints]]) if(include) {
      const b=Buffer.from(JSON.stringify(value));input[`${prefix}_path`]=`docs/${prefix}.json`;input[`${prefix}_sha256`]=sha256(b);await writeFile(join(root,input[`${prefix}_path`]),b);
    }
    return inspectContextContracts(root,input);
  }
  return {root,units,ledger,checkpoints,ref,inspect};
}

test('valid declarations report verified digests and explicitly never attest actual tool history',async()=>{
  const f=await fixture();const r=await f.inspect();assert.equal(r.status,'current');assert.equal(r.declaration_only,true);assert.equal(r.actual_tool_history_verified,false);assert.equal(Object.keys(r.digests).length,3);
});
test('file ownership is global, bounded, and dependencies must be a closed DAG',async()=>{
  for(const mutate of [f=>f.units.work_units[1].files=['docs/source.txt'],f=>f.units.work_units[0].files=[],f=>f.units.work_units[0].depends_on=['two'],f=>f.units.work_units[1].depends_on=['missing']]) {
    const f=await fixture();mutate(f);assert.equal((await f.inspect()).status,'invalid');
  }
});
test('repeated overlapping reads require referenced earlier reads and an explicit reason',async()=>{
  const f=await fixture();f.ledger.reads.push({...f.ledger.reads[0],id:'read2'});
  assert.equal((await f.inspect()).status,'invalid');
  f.ledger.reads[1].repeat_of=['read1'];f.ledger.reads[1].reason='Check repair against same decision';assert.equal((await f.inspect()).status,'current');
  f.ledger.reads[1].repeat_of=['future'];assert.equal((await f.inspect()).status,'invalid');
});
test('stale sources/checkpoints and fabricated or nonzero passed test evidence are invalid',async()=>{
  const f=await fixture();f.checkpoints.checkpoints[0].test_evidence=[];assert.equal((await f.inspect()).status,'invalid');
  f.checkpoints.checkpoints[0].test_evidence=[{reference:f.ref,exit_code:1}];assert.equal((await f.inspect()).status,'invalid');
  f.checkpoints.checkpoints[0].test_evidence=[{reference:f.ref,exit_code:0}];
  await writeFile(join(f.root,f.ref.path),'stale');assert.equal((await f.inspect()).status,'invalid');
});
test('invalid ranges, extra fields and private sidecars fail with fixed diagnostics',async()=>{
  const f=await fixture();f.ledger.reads[0].reference={...f.ref,end_byte:999};const r=await f.inspect();assert.equal(r.status,'invalid');assert.equal(r.diagnostic,'invalid_context_contracts');
  f.ledger.reads[0].reference=f.ref;f.units.approved=true;assert.equal((await f.inspect()).status,'invalid');
  const privateResult=await inspectContextContracts(f.root,{work_units_path:'.env',work_units_sha256:'a'.repeat(64)});assert.equal(privateResult.status,'invalid');
});

test('planned checkpoints validate declarations without fabricating test execution',async()=>{
  const f=await fixture();const checkpoint=f.checkpoints.checkpoints[0];checkpoint.status='planned';checkpoint.changes=[];checkpoint.test_evidence=[];
  assert.equal((await f.inspect()).status,'current');checkpoint.status='passed';assert.equal((await f.inspect()).status,'invalid');
});

test('checkpoint changes stay inside the owning work unit',async()=>{
  const f=await fixture();f.units.work_units[0].files=['docs/another.txt'];assert.equal((await f.inspect()).status,'invalid');
});

test('partial sidecar pins and duplicate JSON keys are invalid with no supplied diagnostic text',async()=>{
  const f=await fixture();const result=await f.inspect();assert.equal(result.status,'current');
  const raw=Buffer.from(JSON.stringify(f.units).replace('"schema_version":1','"schema_version":1,"schema_version":1'));
  await writeFile(join(f.root,'docs/ambiguous.json'),raw);
  assert.equal((await inspectContextContracts(f.root,{work_units_path:'docs/ambiguous.json',work_units_sha256:sha256(raw)})).status,'invalid');
  const bytes=Buffer.from(JSON.stringify(f.units));await writeFile(join(f.root,'docs/units.json'),bytes);
  assert.equal((await inspectContextContracts(f.root,{work_units_path:'docs/units.json',work_units_sha256:sha256(bytes),read_ledger_path:'docs/read_ledger.json'})).status,'invalid');
});

test('legacy declaration validation reports unsupported instead of claiming current/invalid generation',async()=>{
  const root=await makeWorkspace();await initWorkflow({workspaceRoot:root,workflowProfile:'legacy-50-v1',topic:'Legacy scope.',now:'2026-10-08T00:00:00.000Z',idFactory:()=> 'legacy-contract'});
  const result=await inspectContextContracts(root,{work_units_path:'docs/units.json',work_units_sha256:'a'.repeat(64)});
  assert.equal(result.status,'unsupported');assert.equal(result.diagnostic,'unsupported_legacy_workflow');assert.equal(result.actual_tool_history_verified,false);
});
