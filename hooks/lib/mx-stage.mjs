#!/usr/bin/env node
// Read-only coordinates for an advisory hook; malformed metadata has no default.
import { physicalWorkspace, readSafe, sha256 } from '../../scripts/lib/quality-files.mjs';
import { parseStrictJson } from '../../scripts/lib/strict-json.mjs';
import { LEGACY_WORKFLOW_PROFILE, resolveWorkflowProfile } from '../../scripts/lib/workflow-profiles.mjs';
import { workflowContext, recheckWorkflowContext } from '../../scripts/lib/workflow-context.mjs';
import { classifyProgress, codexOwned } from './harness-activity.mjs';

async function main() {
  if (process.argv.length !== 3) throw Error('Invalid arguments');
  const root = await physicalWorkspace(process.argv[2]);
  if (codexOwned(root)) throw Error('Different owner');
  const path = 'step_archive/progress.json';
  const bytes = await readSafe(root, path, 1024 * 1024);
  const state = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''));
  if (classifyProgress(state).phase !== 'running') throw Error('Inactive or inconsistent progress');
  const profile = resolveWorkflowProfile(state);
  const context = await workflowContext(root);
  if (context.profile.id !== profile.id) throw Error('Conflicting profile');
  // Historical unmarked50 projects started receiving advice at15. Preserve it.
  const threshold = profile.id === LEGACY_WORKFLOW_PROFILE ? 15 : profile.milestones.implementation;
  if (!Number.isInteger(threshold) || threshold < 1) throw Error('Unknown coordinate');
  await recheckWorkflowContext(root, context);
  if (codexOwned(root) || sha256(await readSafe(root, path, 1024 * 1024)) !== sha256(bytes)) throw Error('Changed progress');
  process.stdout.write(String(threshold));
}
main().catch(() => { process.exitCode = 2; });
