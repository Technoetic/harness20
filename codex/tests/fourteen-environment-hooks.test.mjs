import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installPlugin, tempRoot, runClaudeHook, windows, gitBash } from './helpers/claude-hooks.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
import { workflowContext } from '../../scripts/lib/workflow-context.mjs';
import { snapshotQa, recordQa, inspectQa } from '../../scripts/lib/qa-report.mjs';
import { prepareQuality } from './helpers/completion-quality.mjs';
import { prepareEnvironmentFixture } from './helpers/environment.mjs';

const variants=windows?['ps1',...(gitBash?['sh']:[])]:['sh'];
for (const variant of variants) {
test(`${variant} actual Claude writer refuses missing, malformed or failed environment2 evidence`,async t=>{
  const base=tempRoot(t,'h14-environment-'),plugin=installPlugin(base);
  const root=join(base,'project');mkdirSync(root);
  const run=(name,event={})=>{
    const result=runClaudeHook(plugin,name,{cwd:root,...event},{variant,stripCR:true});
    assert.equal(result.status,0,result.stderr);return result.stdout;
  };
  run('webapp-trigger',{prompt:'/webapp Public environment acceptance fixture'});
  const state=JSON.parse(readFileSync(join(root,'step_archive/progress.json'),'utf8'));
  assert.equal(state.workflow_profile,'planning-first-14-v1');
  writeFileSync(join(root,'step_archive/progress.json'),JSON.stringify({...state,completed_steps:[1],current_step:2}));
  const progress=()=>JSON.parse(readFileSync(join(root,'step_archive/progress.json'),'utf8'));
  const complete=()=>run('step-progress-writer',{last_assistant_message:'Step 002/14 완료\nStep 003/14 완료'});
  complete();assert.deepEqual(progress().completed_steps,[1],'A completion line alone cannot establish environment readiness');
  const outputs=join(root,'step_archive/outputs');mkdirSync(outputs,{recursive:true});
  const lockPath=join(outputs,'browser-backend.json');
  const reportPath=join(root,'step_archive/step002_환경준비.md');
  const selectedPath=join(outputs,'step002_설계선택.md');writeFileSync(selectedPath,'Independent selected design fixture\n');
  writeFileSync(lockPath,'{}');writeFileSync(reportPath,'Unstructured claimed PASS\n');
  complete();assert.deepEqual(progress().completed_steps,[1],'Malformed backend lock cannot pass');
  const context=await workflowContext(root);
  const finalPath=join(outputs,'step002_최종검증.md');
  const finalReport='Independent design fixture review\nfinal-verdict: PASS\n';
  const layoutPath=join(root,'step_archive/step002_레이아웃설계_chunk1.md');
  const overallPath=join(root,'step_archive/step002_전체설계_chunk1.md');
  writeFileSync(layoutPath,'Fixture layout\n');writeFileSync(overallPath,'Fixture overall design\n');
  const lock=JSON.stringify({schema_version:1,selected:'aside',tool_version:'fixture-1',probed_at:'2026-10-10T04:00:00.000Z'});
  writeFileSync(lockPath,lock);
  const record={schema_version:1,workflow_profile:context.profile.id,workflow_generation:context.generation,
    selected:'aside',tool_version:'fixture-1',browser_ready:false,dependencies_ready:true,
    backend_lock_sha256:sha256(lock),selected_design_sha256:sha256(readFileSync(selectedPath)),
    final_design_verification_sha256:sha256(finalReport),layout_design_sha256:sha256(readFileSync(layoutPath)),overall_design_sha256:sha256(readFileSync(overallPath))};
  const report=value=>'# Observed environment fixture\n\n```json harness20-environment\n'+JSON.stringify(value)+'\n```\n';
  writeFileSync(reportPath,report(record));complete();assert.deepEqual(progress().completed_steps,[1],'Failed browser readiness cannot pass');
  writeFileSync(reportPath,report({...record,browser_ready:true,workflow_generation:'a'.repeat(64)}));
  complete();assert.deepEqual(progress().completed_steps,[1],'A previous generation cannot authorize completion');
  writeFileSync(reportPath,report({...record,browser_ready:true}));
  complete();assert.deepEqual(progress().completed_steps,[1],'Independent design verification report is required before environment completion');
  writeFileSync(finalPath,'Independent report mentions PASS but ends FAIL\nfinal-verdict: FAIL\n');
  complete();assert.deepEqual(progress().completed_steps,[1],'A report mentioning PASS cannot override a final FAIL verdict');
  writeFileSync(finalPath,finalReport);
  writeFileSync(reportPath,report({...record,browser_ready:true,final_design_verification_sha256:'a'.repeat(64)}));
  complete();assert.deepEqual(progress().completed_steps,[1],'Stale final design report digest cannot authorize environment completion');
  writeFileSync(reportPath,report({...record,browser_ready:true}));writeFileSync(layoutPath,'Changed layout\n');
  complete();assert.deepEqual(progress().completed_steps,[1],'Design edits invalidate prior environment observations');
  writeFileSync(layoutPath,'Fixture layout\n');
  complete();assert.deepEqual(progress().completed_steps,[1,2,3],'Current structured evidence allows the contiguous claimed batch to advance');
});

test(`${variant} actual new14 writer preserves prerequisites when a later QA report passes`,async t=>{
  const base=tempRoot(t,'h14-prefix-'),plugin=installPlugin(base),root=join(base,'project');mkdirSync(root);
  const run=(event={})=>{
    const result=runClaudeHook(plugin,'step-progress-writer',{cwd:root,...event},{variant,stripCR:true});
    assert.equal(result.status,0,result.stderr);
  };
  const trigger=runClaudeHook(plugin,'webapp-trigger',{cwd:root,prompt:'/webapp Public ordered progress fixture'},{variant,stripCR:true});
  assert.equal(trigger.status,0,trigger.stderr);
  const path=join(root,'step_archive/progress.json');
  const state=JSON.parse(readFileSync(path,'utf8'));
  const progress=()=>JSON.parse(readFileSync(path,'utf8'));
  const seed=completed=>writeFileSync(path,JSON.stringify({...state,completed_steps:completed,current_step:completed.length+1}));
  seed([1,3]);
  await prepareEnvironmentFixture(root);
  const before=readFileSync(path);
  run({last_assistant_message:'Step 002/14 완료'});
  assert.deepEqual(readFileSync(path),before,'An inconsistent persisted prefix must fail closed without rewriting progress');
  seed([]);
  run({last_assistant_message:'Step 001/14 완료\nStep 002/14 완료\nStep 003/14 완료'});
  assert.deepEqual(progress().completed_steps,[1,2,3],'A fully supported batch can advance in dependency order');
  mkdirSync(join(root,'dist'),{recursive:true});writeFileSync(join(root,'dist/index.html'),'<html><body>QA fixture</body></html>');
  writeFileSync(join(root,'step_archive/outputs/qa-proof.json'),'{"observed":true}');
  await prepareQuality(root,{fail:true});
  const snapshot=await snapshotQa(root,5,{artifacts:['dist/index.html'],checks:[{id:'qa-layout',requirement:'Observe fixture layout.'}]});
  await recordQa(root,5,{snapshot_id:snapshot.snapshot_id,verifier:{id:'fixture-independent-reviewer',mode:'independent'},
    outcomes:[{id:'qa-layout',status:'pass',observation:'Observed fixture layout.',evidence_paths:['step_archive/outputs/qa-proof.json'],next_check:''}],next_actions:[]});
  assert.equal((await inspectQa(root,5)).verdict,'PASS','The later QA evidence really passes independently of the quality failure');
  run({last_assistant_message:'Step 004/14 완료\nStep 005/14 완료'});
  assert.deepEqual(progress().completed_steps,[1,2,3],'Rejected quality4 must also withhold independently passing QA5');
  assert.equal(progress().current_step,4);
});
}
