import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { makeWorkspace } from './helpers/workspace.mjs';
import { getWorkflowProfile } from '../../scripts/lib/workflow-profiles.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));

test('public stage table matches retained runtime coordinates in both host guides', async () => {
  const selected = getWorkflowProfile('research-free-36-v1');
  for (const path of ['README.md', 'codex/README.md']) {
    const text = await readFile(join(repo, path), 'utf8');
    const table = text.match(/\| New \| Original \| Role \|\n([^]*?)(?=\n\n)/)?.[0];
    assert.ok(table, path);
    const coordinates = [...table.matchAll(/^\| (\d+)(?:–(\d+))? \| (\d+)(?:–(\d+))? \|/gm)]
      .flatMap(([, first, last, originalFirst, originalLast]) => {
        const count = Number(last ?? first) - Number(first) + 1;
        assert.equal(Number(originalLast ?? originalFirst) - Number(originalFirst) + 1, count);
        return Array.from({ length: count }, (_, i) => [Number(first) + i, Number(originalFirst) + i]);
      });
    assert.deepEqual(coordinates, selected.originalSteps.map((original, i) => [i + 1, original]), path);
  }
});

test('public Jev example prepares the actual five new and seven legacy checkpoints without network', async () => {
  const guide = await readFile(join(repo, 'docs/jev-checkpoints.md'), 'utf8');
  const script = guide.match(/```javascript\n([^]*?)\n```/)?.[1];
  assert.ok(script, 'public executable example must exist');
  const exampleRoot = await makeWorkspace();
  const scriptPath = join(exampleRoot, 'jev-examples.mjs');
  await writeFile(scriptPath, script, 'utf8');
  for (const profile of ['research-free-36-v1', 'legacy-50-v1']) {
    const workspace = await makeWorkspace();
    const args = [scriptPath, repo, workspace, ...(profile === 'legacy-50-v1' ? ['--legacy'] : [])];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const lines = result.stdout.trim().split('\n');
    assert.deepEqual(lines.map(line => Number(line.match(/^step (\d+):/)?.[1])), [...getWorkflowProfile(profile).milestones.jev]);
    for (const line of lines) assert.equal(JSON.parse(line.replace(/^step \d+: /, '')).status, 'prepared');
    const state = JSON.parse(await readFile(join(workspace, 'step_archive/.harness50-codex/state.json'), 'utf8'));
    assert.equal(state.total_steps, getWorkflowProfile(profile).stepCount);
  }
});
