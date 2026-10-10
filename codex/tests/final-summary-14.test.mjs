// Behavioral regression: E2E9 reports must use three-digit filenames.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';
import { writeFinalSummary } from '../../scripts/lib/final-summary.mjs';

test('fourteen-step final summary reads deployment9..14 and excludes neighboring coordinates', async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, 'step_archive/TOPIC'), { recursive: true });
  await mkdir(join(root, 'step_archive/outputs'), { recursive: true });
  await writeFile(join(root, 'step_archive/TOPIC/TOPIC.md'), '# Public synthetic summary topic\n');
  const binding = { schema_version: 2, workflow_profile: 'planning-first-14-v1', total_steps: 14 };
  await writeFile(join(root, 'step_archive/workflow-profile.json'), JSON.stringify(binding));
  await writeFile(join(root, 'step_archive/progress.json'), JSON.stringify({ ...binding,
    current_step: 14, completed_steps: [], run_started_at: '2026-10-10T03:00:00.000Z' }));
  const fixtures = {
    'step_archive/step009_e2e.md': 'deployment-verification: pending\n',
    'step_archive/step014_final.md': 'deployment-verification: verified\n',
    'step_archive/step008_prior.md': 'deployment-verification: before-range\n',
    'step_archive/step015_later.md': 'deployment-verification: after-range\n',
    'step_archive/step09_unpadded.md': 'deployment-verification: unpadded\n',
  };
  for (const [path, text] of Object.entries(fixtures)) await writeFile(join(root, path), text);
  const result = await writeFinalSummary(root);
  assert.match(result.text, /배포 검증 대기\(pending\) `step_archive\/step009_e2e.md:1`/);
  assert.match(result.text, /배포 검증 기록 `verified` `step_archive\/step014_final.md:1`/);
  assert.doesNotMatch(result.text, /before-range|after-range|unpadded/);
  for (const [path, text] of Object.entries(fixtures)) assert.equal(await readFile(join(root, path), 'utf8'), text);
});
