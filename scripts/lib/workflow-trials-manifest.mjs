import { physicalWorkspace, readSafe, sha256 } from './quality-files.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { assertMemoryBinding } from './memory-policy.mjs';
import { validateLoadedContract } from '../../codex/scripts/lib/acceptance.mjs';
import { DEFAULT_PLUGIN_ROOT, TRIAL_LIMITS, bounded, snapshot, object, identifier, textId, list, ids,
  hash, budgets, canonical, bytes, requireTrial, trialWorkspace, recheckWorkspace, references, json, writeOnce, selector } from './workflow-trials-policy.mjs';

const manifestPath = (workspace,id) => `${workspace.base}/${id}.manifest.json`;
function conditions(input) {
  object(input,['trial_id','task_id','scenarios','sources','model_id','provider_id','budgets','tool_set_sha256','config_sha256','variants']);
  identifier(input.trial_id);identifier(input.task_id);textId(input.model_id);textId(input.provider_id);budgets(input.budgets);
  hash(input.tool_set_sha256);hash(input.config_sha256);object(input.variants,['baseline_sha256','candidate_sha256']);
  hash(input.variants.baseline_sha256);hash(input.variants.candidate_sha256);
  requireTrial(input.variants.baseline_sha256!==input.variants.candidate_sha256);
  list(input.sources,TRIAL_LIMITS.sources,1);
  const seen=new Set();list(input.scenarios,TRIAL_LIMITS.scenarios,1);
  for(const scenario of input.scenarios) {
    object(scenario,['id','check_ids']);identifier(scenario.id);requireTrial(!seen.has(scenario.id.toLowerCase()));seen.add(scenario.id.toLowerCase());
    scenario.check_ids=ids(scenario.check_ids);
  }
  return input;
}
async function pluginBinding(pluginRoot,profile) {
  const root=await physicalWorkspace(pluginRoot),indexBytes=await readSafe(root,profile.indexPath,2*1024*1024);
  const index=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(indexBytes));
  requireTrial(index.schema_version===2&&index.workflow_profile===profile.id&&index.total_steps===profile.stepCount&&
    Array.isArray(index.steps)&&index.steps.length===profile.stepCount);
  const files=[{path:profile.indexPath,sha256:sha256(indexBytes)}];
  for(let i=0;i<index.steps.length;i++) {
    const contract=validateLoadedContract(index.steps[i],i+1,profile.id);
    requireTrial(contract.source.startsWith(`${profile.sourceDirectory}/`)&&contract.target.startsWith(`${profile.targetDirectory}/`));
    const source=await readSafe(root,contract.source,1024*1024),target=await readSafe(root,contract.target,1024*1024);
    requireTrial(sha256(source)===contract.source_sha256);
    files.push({path:contract.source,sha256:sha256(source)},{path:contract.target,sha256:sha256(target)});
  }
  return {sha256:sha256(bytes(files)),files};
}
export async function validateManifest(workspace,manifest,options={}) {
  object(manifest,['schema_version','advisory','observation_origin','binding','plugin','receipts','conditions']);
  requireTrial(manifest.schema_version===1&&manifest.advisory===true&&manifest.observation_origin==='caller-reported');
  assertMemoryBinding(manifest.binding,workspace.binding);conditions(manifest.conditions);
  requireTrial(canonical(manifest.receipts)===canonical(workspace.receipts),'TRIAL_CHANGED');
  requireTrial(canonical(manifest.plugin)===canonical(await pluginBinding(options.pluginRoot??DEFAULT_PLUGIN_ROOT,workspace.context.profile)),'TRIAL_CHANGED');
  await references(workspace.root,manifest.conditions.sources);await recheckWorkspace(workspace);
}
export async function loadTrial(workspaceRoot,input,options={}) {
  const selected=selector(input),workspace=await trialWorkspace(workspaceRoot);
  const loaded=await json(workspace.root,manifestPath(workspace,selected.trial_id));
  requireTrial(loaded.sha256===selected.manifest_sha256,'TRIAL_CHANGED');
  requireTrial(loaded.value.conditions?.trial_id===selected.trial_id);
  await validateManifest(workspace,loaded.value,options);
  return {workspace,manifest:loaded.value,selected,manifest_path:manifestPath(workspace,selected.trial_id),manifest_sha256:loaded.sha256};
}
export async function recheckTrial(trial,options={}) {
  const next=await json(trial.workspace.root,trial.manifest_path);
  requireTrial(next.sha256===trial.manifest_sha256,'TRIAL_CHANGED');await validateManifest(trial.workspace,next.value,options);
}
export async function prepareTrial(workspaceRoot,input,options={}) {
  return bounded(async()=>{
    const selected=conditions(snapshot(input)),workspace=await trialWorkspace(workspaceRoot);
    await references(workspace.root,selected.sources);
    const manifest={schema_version:1,advisory:true,observation_origin:'caller-reported',binding:workspace.binding,
      plugin:await pluginBinding(options.pluginRoot??DEFAULT_PLUGIN_ROOT,workspace.context.profile),receipts:workspace.receipts,conditions:selected};
    const saved=await writeOnce(workspace.root,manifestPath(workspace,selected.trial_id),manifest,()=>validateManifest(workspace,manifest,options));
    return {status:'prepared',advisory:true,observation_origin:'caller-reported',trial_id:selected.trial_id,
      manifest_path:saved.path,manifest_sha256:saved.sha256,replayed:saved.replayed};
  });
}
export async function inspectTrial(workspaceRoot,input,options={}) {
  return bounded(async()=>{
    selector(input);
    try {const trial=await loadTrial(workspaceRoot,input,options);await recheckTrial(trial,options);
      return {status:'current',advisory:true,observation_origin:'caller-reported',manifest:trial.manifest,manifest_sha256:trial.manifest_sha256};}
    catch {return {status:'stale',advisory:true,diagnostic:'frozen_trial_unavailable'};}
  });
}
