// New14 rejects impossible completion histories before any hook chooses a step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProgress } from '../../hooks/lib/harness-activity.mjs';

const state = (profile, total, done, current) => ({ schema_version: 2,
  workflow_profile: profile, total_steps: total, completed_steps: done, current_step: current });

test('new14 nonprefix histories are invalid while old20 retains its historical merge behavior', () => {
  assert.equal(classifyProgress(state('planning-first-14-v1', 14, [1, 3], 2)).phase, 'invalid');
  assert.equal(classifyProgress(state('planning-first-20-v1', 20, [1, 3], 2)).phase, 'running');
  assert.equal(classifyProgress(state('planning-first-14-v1', 14, [1, 2, 3], 4)).phase, 'running');
});
