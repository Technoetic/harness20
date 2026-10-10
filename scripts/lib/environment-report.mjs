// Read-only inspection of the new14 design/environment boundary. Report fields
// record host observations; this inspector never runs or installs any tool.
import { physicalWorkspace, readSafe, sha256 } from './quality-files.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { parseBackendLock, LOCK_PATH } from './browser-backend-lock.mjs';
import { workflowContext, recheckWorkflowContext } from './workflow-context.mjs';
import { PLANNING_FIRST_14_V1_WORKFLOW_PROFILE } from './workflow-profiles.mjs';

export const ENVIRONMENT_REPORT_PATH='step_archive/step002_환경준비.md';
const DESIGN='step_archive/outputs/step002_설계선택.md';
const FINAL_DESIGN='step_archive/outputs/step002_최종검증.md';
const LAYOUT='step_archive/step002_레이아웃설계_chunk1.md';
const OVERALL='step_archive/step002_전체설계_chunk1.md';
const FIELDS=['schema_version','workflow_profile','workflow_generation','selected','tool_version',
  'browser_ready','dependencies_ready','backend_lock_sha256','selected_design_sha256',
  'final_design_verification_sha256','layout_design_sha256','overall_design_sha256'];

export async function inspectEnvironmentReport(workspaceRoot,{reportBytes}={}) {
  try {
    const root=await physicalWorkspace(workspaceRoot);
    const context=await workflowContext(root);
    if(context.profile.id!==PLANNING_FIRST_14_V1_WORKFLOW_PROFILE||!context.generation) throw Error('Unsupported environment boundary');
    const bytes=await readSafe(root,ENVIRONMENT_REPORT_PATH,1024*1024);
    if(reportBytes!==undefined&&(!Buffer.isBuffer(reportBytes)||!bytes.equals(reportBytes))) throw Error('Changed environment report');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const blocks=[...text.matchAll(/^```json harness20-environment\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)];
    if(blocks.length!==1) throw Error('Missing environment observations');
    const record=parseStrictJson(blocks[0][1]);
    if(!record||Array.isArray(record)||typeof record!=='object'||Object.keys(record).length!==FIELDS.length
      ||!FIELDS.every(key=>Object.hasOwn(record,key))||record.schema_version!==1
      ||record.workflow_profile!==context.profile.id||record.workflow_generation!==context.generation
      ||record.browser_ready!==true||record.dependencies_ready!==true) throw Error('Invalid environment observations');
    const lockBytes=await readSafe(root,LOCK_PATH,4096),lock=parseBackendLock(lockBytes);
    const designBytes=await readSafe(root,DESIGN,1024*1024);
    const finalBytes=await readSafe(root,FINAL_DESIGN,1024*1024);
    const layoutBytes=await readSafe(root,LAYOUT,1024*1024),overallBytes=await readSafe(root,OVERALL,1024*1024);
    const finalLines=new TextDecoder('utf-8',{fatal:true}).decode(finalBytes).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const verdicts=finalLines.filter(line=>/^final-verdict: (?:PASS|FAIL|INCOMPLETE)$/.test(line));
    // This confirms the caller's explicit final report verdict; it does not
    // authenticate reviewer independence or reproduce design verification.
    if(verdicts.length!==1||verdicts[0]!=='final-verdict: PASS'||finalLines.at(-1)!=='final-verdict: PASS') throw Error('Design verification is not PASS');
    if(!designBytes.length||record.backend_lock_sha256!==sha256(lockBytes)||record.selected_design_sha256!==sha256(designBytes)
      ||!layoutBytes.length||!overallBytes.length||record.final_design_verification_sha256!==sha256(finalBytes)
      ||record.layout_design_sha256!==sha256(layoutBytes)||record.overall_design_sha256!==sha256(overallBytes)
      ||record.selected!==lock.selected||typeof record.tool_version!=='string'||!record.tool_version.trim()
      ||record.tool_version!==lock.tool_version) throw Error('Changed environment evidence');
    await recheckWorkflowContext(root,context);
    // Check the exact observed artifacts again before accepting a boundary.
    if(!(await readSafe(root,ENVIRONMENT_REPORT_PATH,1024*1024)).equals(bytes)
      ||!(await readSafe(root,LOCK_PATH,4096)).equals(lockBytes)
      ||!(await readSafe(root,DESIGN,1024*1024)).equals(designBytes)
      ||!(await readSafe(root,FINAL_DESIGN,1024*1024)).equals(finalBytes)
      ||!(await readSafe(root,LAYOUT,1024*1024)).equals(layoutBytes)
      ||!(await readSafe(root,OVERALL,1024*1024)).equals(overallBytes)) throw Error('Changed environment evidence');
    await recheckWorkflowContext(root,context);
    return {status:'current',verdict:'PASS',report_sha256:sha256(bytes),backend_lock_sha256:sha256(lockBytes)};
  } catch {
    return {status:'unavailable',verdict:'FAIL',error:'environment-evidence-missing-invalid-or-stale'};
  }
}
