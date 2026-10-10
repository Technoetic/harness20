import { inspectQa } from './qa-report.mjs';
import { assertMemorySourcePath } from './memory-policy.mjs';
import { sha256 } from './quality-files.mjs';
import { loadTrial, recheckTrial } from './workflow-trials-manifest.mjs';
import { bounded, snapshot, object, identifier, textId, list, ids, hash, budgets, integer, canonical,
  requireTrial, references, json, writeOnce, selector, bytes } from './workflow-trials-policy.mjs';

const RECORD_FIELDS=['trial_id','manifest_sha256','task_id','scenario_id','arm','variant_sha256','model_id','provider_id','budgets',
  'check_ids','outcome','actions','tokens','duration_ms','hard_failure','qa','evidence'];
const armPath = (trial,record) => `${trial.workspace.base}/${record.trial_id}/${record.scenario_id}.${record.arm}.json`;
const contentPath = (trial,digest) => `${trial.workspace.base}/${trial.selected.trial_id}/records/${digest}.json`;
function recordShape(value,conditions) {
  object(value,RECORD_FIELDS);identifier(value.trial_id);identifier(value.task_id);identifier(value.scenario_id);hash(value.manifest_sha256);
  requireTrial(['baseline','candidate'].includes(value.arm));hash(value.variant_sha256);textId(value.model_id);textId(value.provider_id);
  budgets(value.budgets);value.check_ids=ids(value.check_ids);requireTrial(['pass','fail','unknown'].includes(value.outcome));
  integer(value.actions,value.budgets.actions);integer(value.tokens,value.budgets.tokens);integer(value.duration_ms,1000000000000);
  requireTrial(typeof value.hard_failure==='boolean'&&!(value.outcome==='pass'&&value.hard_failure));
  if(value.qa!==null) {object(value.qa,['step','report_sha256']);integer(value.qa.step,50,1);hash(value.qa.report_sha256);}
  list(value.evidence,32,value.outcome==='pass'?1:0);
  const scenario=conditions.scenarios.find(item=>item.id===value.scenario_id);
  requireTrial(scenario&&value.trial_id===conditions.trial_id&&value.task_id===conditions.task_id&&
    value.model_id===conditions.model_id&&value.provider_id===conditions.provider_id&&canonical(value.budgets)===canonical(conditions.budgets)&&
    canonical(value.check_ids)===canonical(scenario.check_ids)&&value.variant_sha256===conditions.variants[`${value.arm}_sha256`]);
  return value;
}
async function verifyObservation(trial,record) {
  await references(trial.workspace.root,record.evidence);
  if(record.outcome==='pass') {
    requireTrial(record.qa!==null,'TRIAL_UNVERIFIED');
    const selected=new Set([...trial.manifest.conditions.sources,...record.evidence].map(reference=>reference.path));
    const qa=await inspectQa(trial.workspace.root,record.qa.step,{pathPolicy:(path,kind)=>{
      assertMemorySourcePath(path,kind==='artifact'?'repository-source':'approved-artifact');
      requireTrial(selected.has(path),'TRIAL_UNVERIFIED');
    }});
    requireTrial(qa.status==='current'&&qa.verdict==='PASS'&&qa.report_sha256===record.qa.report_sha256,'TRIAL_UNVERIFIED');
    const outcomes=qa.report.outcomes.filter(item=>record.check_ids.includes(item.id));
    requireTrial(outcomes.length===record.check_ids.length&&outcomes.every(item=>item.status==='pass'),'TRIAL_UNVERIFIED');
    requireTrial(outcomes.every(item=>record.evidence.some(reference=>item.evidence.some(evidence=>
      evidence.path===reference.path&&evidence.sha256===reference.file_sha256))),'TRIAL_UNVERIFIED');
    requireTrial(record.evidence.every(reference=>outcomes.some(item=>item.evidence.some(evidence=>
      evidence.path===reference.path&&evidence.sha256===reference.file_sha256))),'TRIAL_UNVERIFIED');
  }
}
export async function recordTrial(workspaceRoot,input,options={}) {
  return bounded(async()=>{
    const selected=snapshot(input),trial=await loadTrial(workspaceRoot,{trial_id:selected.trial_id,manifest_sha256:selected.manifest_sha256},options);
    const record=recordShape(selected,trial.manifest.conditions);
    const recheck=async()=>{await recheckTrial(trial,options);await verifyObservation(trial,record);};
    await recheck();const digest=sha256(bytes(record));
    const saved=await writeOnce(trial.workspace.root,contentPath(trial,digest),record,recheck);
    await writeOnce(trial.workspace.root,armPath(trial,record),{schema_version:1,record_sha256:digest},async()=>{
      await recheck();requireTrial((await json(trial.workspace.root,saved.path)).sha256===digest,'TRIAL_CHANGED');
    });
    return {status:'recorded',advisory:true,observation_origin:'caller-reported',record_path:saved.path,record_sha256:saved.sha256,replayed:saved.replayed};
  });
}
export async function compareTrials(workspaceRoot,input,options={}) {
  return bounded(async()=>{
    selector(input);let trial;
    try {trial=await loadTrial(workspaceRoot,input,options);}
    catch {return {status:'hold',advisory:true,observation_origin:'caller-reported',reasons:['frozen_conditions_changed'],pair_count:0};}
    const reasons=new Set(),pairs=[],pins=[];
    for(const scenario of trial.manifest.conditions.scenarios) {
      const arms={};
      for(const arm of ['baseline','candidate']) {
        const pointerPath=armPath(trial,{trial_id:trial.selected.trial_id,scenario_id:scenario.id,arm});
        try {
          const pointer=await json(trial.workspace.root,pointerPath);object(pointer.value,['schema_version','record_sha256']);
          requireTrial(pointer.value.schema_version===1);hash(pointer.value.record_sha256);
          const path=contentPath(trial,pointer.value.record_sha256),loaded=await json(trial.workspace.root,path);
          requireTrial(loaded.sha256===pointer.value.record_sha256,'TRIAL_CHANGED');
          const record=recordShape(loaded.value,trial.manifest.conditions);
          requireTrial(record.manifest_sha256===trial.manifest_sha256&&record.arm===arm&&record.scenario_id===scenario.id);
          await verifyObservation(trial,record);arms[arm]=record;
          pins.push({path,sha256:loaded.sha256,pointerPath,pointer_sha256:pointer.sha256,record});
        } catch(error) {reasons.add(error.code==='ENOENT'?'missing_pair':'observation_unavailable');}
      }
      if(arms.baseline&&arms.candidate) {
        if(arms.baseline.hard_failure||arms.candidate.hard_failure)reasons.add('hard_failure');
        if([arms.baseline,arms.candidate].some(record=>record.outcome!=='pass'||!record.evidence.length))reasons.add('incomplete_observation');
        pairs.push({scenario_id:scenario.id,baseline:arms.baseline,candidate:arms.candidate});
      }
    }
    try {
      for(const pin of pins) {
        requireTrial((await json(trial.workspace.root,pin.path)).sha256===pin.sha256&&
          (await json(trial.workspace.root,pin.pointerPath)).sha256===pin.pointer_sha256);
        await verifyObservation(trial,pin.record);
      }
      await recheckTrial(trial,options);
    } catch {reasons.add('observation_changed');}
    const deltas={actions:0,tokens:0,duration_ms:0,passed:0};
    for(const pair of pairs) {
      for(const metric of ['actions','tokens','duration_ms'])deltas[metric]+=pair.candidate[metric]-pair.baseline[metric];
      deltas.passed+=Number(pair.candidate.outcome==='pass')-Number(pair.baseline.outcome==='pass');
    }
    return {status:reasons.size?'hold':'compared',advisory:true,observation_origin:'caller-reported',
      reasons:[...reasons].sort(),pair_count:pairs.length,expected_pair_count:trial.manifest.conditions.scenarios.length,deltas};
  });
}
