import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWorkflowProfile, LEGACY_WORKFLOW_PROFILE } from './workflow-profiles.mjs';

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
export const archiveDirectory = profile => profile.id === LEGACY_WORKFLOW_PROFILE
  ? 'step_archive/archived' : `step_archive/profiles/${profile.id}/archived`;

function physicalFile(root, name) {
  let target = root;
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i++) {
    target = path.join(target, parts[i]);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) throw new Error('Unsafe step body');
  }
  return target;
}
export function checkClaudeProfileBinding(root, profile) {
  let bytes;
  try { bytes = fs.readFileSync(physicalFile(root, 'step_archive/workflow-profile.json')); }
  catch (error) { if (error.code === 'ENOENT' && profile.id === LEGACY_WORKFLOW_PROFILE) return; throw error; }
  if (bytes.length > 4096 || resolveWorkflowProfile(JSON.parse(bytes.toString('utf8'))).id !== profile.id) throw new Error('Workspace profile binding conflicts with progress');
}

// New archived bodies retain the selected physical definition; no flat/legacy fallback.
export function claudeStepBody(root, state, step) {
  const profile = resolveWorkflowProfile(state);
  checkClaudeProfileBinding(root, profile);
  if (!Number.isInteger(step) || step < 1 || step > profile.stepCount) throw new Error('Invalid step');
  const name = `step${String(step).padStart(3, '0')}.md`;
  const relative = `${archiveDirectory(profile)}/${name}`;
  if (profile.id !== LEGACY_WORKFLOW_PROFILE) {
    if (typeof state.run_started_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(state.run_started_at) || !Number.isFinite(Date.parse(state.run_started_at))) throw new Error('Invalid run generation');
    const archived = fs.readFileSync(physicalFile(root, relative));
    const original = fs.readFileSync(physicalFile(pluginRoot, `${profile.sourceDirectory}/${name}`));
    if (!archived.equals(original)) throw new Error('Archived profile body does not match its definition');
    return relative;
  }
  try { physicalFile(root, relative); return relative; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const flat = `step_archive/${name}`;
  physicalFile(root, flat); return flat;
}
