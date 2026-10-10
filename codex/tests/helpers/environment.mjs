// Synthetic host-observation fixture. This exercises the real inspection and
// completion boundary, without claiming a live browser readiness measurement.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workflowContext } from '../../../scripts/lib/workflow-context.mjs';
import { sha256 } from '../../../scripts/lib/quality-files.mjs';

export async function prepareEnvironmentFixture(root) {
  const context=await workflowContext(root);
  const outputs=join(root,'step_archive/outputs');await mkdir(outputs,{recursive:true});
  const selected='step_archive/outputs/step002_설계선택.md';
  try { await readFile(join(root,selected)); }
  catch(error) { if(error.code!=='ENOENT') throw error;await writeFile(join(root,selected),'Synthetic selected design\n'); }
  const finalDesign='step_archive/outputs/step002_최종검증.md';
  const layout='step_archive/step002_레이아웃설계_chunk1.md',overall='step_archive/step002_전체설계_chunk1.md';
  await writeFile(join(root,finalDesign),'Synthetic independent design report\nfinal-verdict: PASS\n');
  await writeFile(join(root,layout),'Synthetic layout design\n');await writeFile(join(root,overall),'Synthetic overall design\n');
  const lock=JSON.stringify({schema_version:1,selected:'aside',tool_version:'fixture-1',probed_at:'2026-10-10T04:00:00.000Z'});
  await writeFile(join(outputs,'browser-backend.json'),lock);
  const record={schema_version:1,workflow_profile:context.profile.id,workflow_generation:context.generation,
    selected:'aside',tool_version:'fixture-1',browser_ready:true,dependencies_ready:true,
    backend_lock_sha256:sha256(lock),selected_design_sha256:sha256(await readFile(join(root,selected))),
    final_design_verification_sha256:sha256(await readFile(join(root,finalDesign))),
    layout_design_sha256:sha256(await readFile(join(root,layout))),overall_design_sha256:sha256(await readFile(join(root,overall)))};
  await writeFile(join(root,'step_archive/step002_환경준비.md'),'# Synthetic host observations\n\n```json harness20-environment\n'+JSON.stringify(record)+'\n```\n');
}
