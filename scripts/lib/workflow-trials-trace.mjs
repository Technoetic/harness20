import { physicalWorkspace } from './quality-files.mjs';
import { workflowContext, recheckWorkflowContext } from './workflow-context.mjs';
import { memoryId } from './memory-policy.mjs';
import { bounded, snapshot, object, currentState, currentReceipts, canonical, requireTrial } from './workflow-trials-policy.mjs';

export async function exportTrace(workspaceRoot,input) {
  return bounded(async()=>{
    object(snapshot(input),[]);
    try {
      const root=await physicalWorkspace(workspaceRoot),state=await currentState(root);
      if(!state)return {status:'unsupported',advisory:true,diagnostic:'codex_receipts_unavailable'};
      const context=await workflowContext(root),receipts=await currentReceipts(root,state.value),events=[];
      memoryId(state.value.workflow_id);
      for(const {receipt,sha256:digest} of receipts) {
        if(receipt.attempt_id!==null)memoryId(receipt.attempt_id);
        for(const evidence of receipt.evidence) {
          if(evidence.acceptance_id!==null)memoryId(evidence.acceptance_id);
          events.push({workflow_id:receipt.workflow_id,workflow_profile:context.profile.id,step:receipt.step,
            attempt_id:receipt.attempt_id,completed_at:receipt.completed_at,provenance:receipt.provenance,
            receipt_sha256:digest,acceptance_id:evidence.acceptance_id,kind:evidence.kind,ok:evidence.ok,
            artifact_sha256:evidence.artifact_sha256??null});
        }
      }
      await recheckWorkflowContext(root,context);const next=await currentState(root);
      requireTrial(next&&next.sha256===state.sha256);
      const again=await currentReceipts(root,next.value);
      requireTrial(canonical(again.map(({step,sha256:digest})=>({step,sha256:digest})))===
        canonical(receipts.map(({step,sha256:digest})=>({step,sha256:digest}))));
      return {status:'current',advisory:true,workflow_profile:context.profile.id,workflow_generation:context.generation,
        receipt_count:receipts.length,events};
    } catch {return {status:'unavailable',advisory:true,diagnostic:'current_receipts_unavailable'};}
  });
}
