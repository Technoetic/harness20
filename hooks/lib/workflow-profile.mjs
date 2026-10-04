#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { physicalWorkspace, readSafe, writeSafe } from '../../scripts/lib/quality-files.mjs';
import { defaultWorkflowProfile, resolveWorkflowProfile } from '../../scripts/lib/workflow-profiles.mjs';
import { archiveDirectory, claudeStepBody } from '../../scripts/lib/claude-profile.mjs';
import { workflowContext, recheckWorkflowContext } from '../../scripts/lib/workflow-context.mjs';

import { publishProfileSpecs } from '../../scripts/lib/claude-spec.mjs';
import { hasCompleteTopicContract, prepareTopicContract } from '../../scripts/lib/topic-contract.mjs';
import { codexOwned } from './harness-activity.mjs';

const [command, workspace] = process.argv.slice(2);
try {
  const root = await physicalWorkspace(workspace);
  if (command === 'bootstrap') {
    const plugin = await physicalWorkspace(fileURLToPath(new URL('../../', import.meta.url)));
    const profile = defaultWorkflowProfile();
    const bodies = [];
    // Reject linked, aliased or malformed existing binding before archive publication.
    try { resolveWorkflowProfile(JSON.parse((await readSafe(root, 'step_archive/workflow-profile.json', 4096)).toString('utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Read and validate all allowlisted sources before publishing any archive body.
    for (let step = 1; step <= profile.stepCount; step++) {
      const name = `step${String(step).padStart(3, '0')}.md`;
      const bytes = await readSafe(plugin, `${profile.sourceDirectory}/${name}`);
      const destination = `${archiveDirectory(profile)}/${name}`;
      try { if (!(await readSafe(root, destination)).equals(bytes)) throw new Error('Conflicting archived body'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      bodies.push({ destination, bytes });
    }
    for (const body of bodies) await writeSafe(root, body.destination, body.bytes);
    await writeSafe(root, 'step_archive/workflow-profile.json', JSON.stringify({ schema_version: 2, workflow_profile: profile.id, total_steps: profile.stepCount }) + '\n');
    console.log(JSON.stringify({ workflow_profile: profile.id, total: profile.stepCount, body_directory: archiveDirectory(profile) }));
  } else if (command === 'topic') {
    const bytes = readFileSync(0);
    if (bytes.length > 1024 * 1024) throw new Error('Oversized request');
    const event = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    if (!event || Array.isArray(event) || typeof event.prompt !== 'string' || !event.prompt.trim()) throw new Error('Missing explicit request');
    const topic = prepareTopicContract(event.prompt);
    if (!hasCompleteTopicContract(topic)) throw new Error('Incomplete topic contract');
    // Bootstrap may have selected a new binding for an existing zero-completion run.
    // Recheck the original record's count and history without reinterpreting that binding.
    if (codexOwned(root)) throw new Error('Codex owns this workspace');
    try {
      const previous = JSON.parse((await readSafe(root, 'step_archive/progress.json', 1024 * 1024)).toString('utf8').replace(/^\uFEFF/, ''));
      resolveWorkflowProfile(previous);
      if (!Array.isArray(previous.completed_steps) || previous.completed_steps.length !== 0) throw new Error('Existing completion history');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (codexOwned(root)) throw new Error('Codex owns this workspace');
    await writeSafe(root, 'step_archive/TOPIC/TOPIC.md', topic);
    console.log('TOPIC contract initialized.');
  } else if (command === 'spec') {
    console.log(`SPEC generated: ${await publishProfileSpecs(root)}`);
  } else if (command === 'resolve') {
    const context = await workflowContext(root);
    const state = JSON.parse((await readSafe(root, 'step_archive/progress.json')).toString('utf8').replace(/^\uFEFF/, ''));
    const profile = resolveWorkflowProfile(state);
    if (profile.id !== context.profile.id) throw new Error('Conflicting workspace owner');
    if (!Array.isArray(state.completed_steps) || state.completed_steps.some(n => !Number.isInteger(n) || n < 1 || n > profile.stepCount) || new Set(state.completed_steps).size !== state.completed_steps.length) throw new Error('Invalid completion history');
    if (context.generation) for (let step = 1; step <= profile.stepCount; step++) claudeStepBody(root, state, step);
    const next = profile.originalSteps.findIndex((_, i) => !state.completed_steps.includes(i + 1)) + 1;
    const body = next ? claudeStepBody(root, state, next) : null;
    await recheckWorkflowContext(root, context);
    console.log(JSON.stringify({ workflow_profile: profile.id, total: profile.stepCount, body_directory: archiveDirectory(profile),
      run_started_at: state.run_started_at ?? null, next_step: next || null, step_body: body, milestones: profile.milestones }));
  } else throw new Error('Invalid command');
} catch {
  console.error('Workflow profile or archive is invalid; no step is authorized.');
  process.exitCode = 1;
}
