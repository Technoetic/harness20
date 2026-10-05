// Shared guarded identity resolution; hook-only installations do not need codex/.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { readSafe, sha256 } from './quality-files.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { assertWorkflowTopicPin, WORKFLOW_SECURITY_POLICY } from './workflow-security.mjs';
import { getWorkflowProfile, resolveWorkflowProfile, LEGACY_WORKFLOW_PROFILE } from './workflow-profiles.mjs';

const CODEX = 'step_archive/.harness50-codex/state.json';
const CLAUDE = 'step_archive/progress.json';
async function present(root, name) {
  try { await lstat(join(root, name)); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function workflowContext(root, { workflowProfile } = {}) {
  if (workflowProfile !== undefined) getWorkflowProfile(workflowProfile);
  const file = await present(root, CODEX) ? CODEX : await present(root, CLAUDE) ? CLAUDE : null;
  // A leftover binding is workflow metadata, even when its progress record is missing.
  if (!file && await present(root, 'step_archive/workflow-profile.json')) throw new Error('Workspace profile binding has no progress record');
  const record = file ? parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(await readSafe(root, file, 1024 * 1024)).replace(/^\uFEFF/, '')) : null;
  const profile = file ? resolveWorkflowProfile(record) : getWorkflowProfile(LEGACY_WORKFLOW_PROFILE);
  if(file === CODEX)assertWorkflowTopicPin({security_policy:WORKFLOW_SECURITY_POLICY,topic_sha256:record.topic_sha256},await readSafe(root,'step_archive/TOPIC/TOPIC.md',1024*1024));
  if (file === CLAUDE && (profile.id !== LEGACY_WORKFLOW_PROFILE || await present(root, 'step_archive/workflow-profile.json'))) {
    const binding = parseStrictJson((await readSafe(root, 'step_archive/workflow-profile.json', 4096)).toString('utf8'));
    if (resolveWorkflowProfile(binding).id !== profile.id) throw new Error('Workspace profile binding conflicts with progress');
    if (Object.hasOwn(binding,'security_policy')) assertWorkflowTopicPin(binding,await readSafe(root,'step_archive/TOPIC/TOPIC.md',1024*1024));
  }
  if (workflowProfile !== undefined && workflowProfile !== profile.id) throw new Error('Workflow profile conflicts with active metadata');
  let generation = null;
  if (profile.id !== LEGACY_WORKFLOW_PROFILE) {
    const value = file === CODEX ? record.workflow_id : record.run_started_at;
    if (typeof value !== 'string' || (file === CODEX
      ? value.trim().length === 0
      : !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)))) {
      throw new Error('Workflow generation is missing or invalid');
    }
    generation = sha256(JSON.stringify([file === CODEX ? 'codex' : 'claude', value]));
  }
  return { profile, generation, namespace: generation ? `${profile.id}/${generation}` : '',
    binding: generation ? { workflow_profile: profile.id, workflow_generation: generation } : {} };
}
export async function recheckWorkflowContext(root, context) {
  const next = await workflowContext(root, { workflowProfile: context.profile.id });
  if (next.generation !== context.generation) throw new Error('Workflow generation changed');
}
export function evidenceDirectory(base, context) {
  return context.namespace ? `${base}/${context.namespace}` : base;
}
