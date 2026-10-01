import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeWorkspace } from './helpers/workspace.mjs';
import { snapshotQa, recordQa } from '../../scripts/lib/qa-report.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const windows = process.platform === 'win32';
const bashFixture = windows && process.env.H50_TEST_BASH === '1';
const qaSteps = [39, 40, 43, 46, 47, 48];

async function fixture(step, historical = false) {
  const base = await makeWorkspace();
  const project = join(base, 'project');
  const plugin = join(base, 'plugin');
  for (const dir of ['hooks', 'scripts', 'codex/scripts']) cpSync(join(repo, dir), join(plugin, dir), { recursive: true });
  mkdirSync(join(project, 'step_archive', 'outputs'), { recursive: true });
  mkdirSync(join(project, 'dist'));
  writeFileSync(join(project, 'dist', 'index.html'), '<h1>Candidate</h1>');
  writeFileSync(join(project, 'step_archive', `step${String(step).padStart(3, '0')}.md`), '# QA');
  writeFileSync(join(project, 'step_archive', 'outputs', 'observations.txt'), 'Actual observations');
  const progress = join(project, 'step_archive', 'progress.json');
  writeFileSync(progress, JSON.stringify({ total_steps: 50, current_step: historical ? step + 1 : step,
    completed_steps: Array.from({ length: historical ? step : step - 1 }, (_, i) => i + 1), last_updated: '' }));
  // The writer skips a Stop, logging it next to itself, when another process holds the machine-wide
  // Global\step-progress-writer-mutex (or the project's flock) for 5 s. Such a run is repeated
  // (bounded), so the refusal file always reflects the run being checked.
  const log = join(plugin, 'hooks', 'step-progress-writer.log');
  const logged = () => existsSync(log) ? readFileSync(log, 'utf8') : '';
  const run = () => {
    const script = join(plugin, 'hooks', `step-progress-writer.${windows && !bashFixture ? 'ps1' : 'sh'}`);
    const shell = bashFixture ? 'C:/Program Files/Git/bin/bash.exe' : windows ? 'powershell.exe' : 'bash';
    const args = bashFixture ? ['-c', 'uname(){ echo Linux; }; python3(){ python "$@"; }; export -f uname python3; bash "$1"', 'fixture', script.replaceAll('\\', '/')]
      : windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script] : [script];
    for (let attempt = 1; ; attempt += 1) {
      const before = logged().length;
      const result = spawnSync(shell, args, {
        cwd: base, input: JSON.stringify({ cwd: project, last_assistant_message: `Step ${String(step).padStart(3, '0')}/50 완료` }),
        encoding: 'utf8', timeout: 30000, env: { ...process.env, CLAUDE_PROJECT_DIR: '', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
      });
      assert.equal(result.status, 0, result.stderr || String(result.error));
      assert.equal(result.stderr.trim(), '');
      if (attempt === 4 || !/mutex acquire FAILED|flock timeout/.test(logged().slice(before))) {
        return JSON.parse(readFileSync(progress, 'utf8'));
      }
    }
  };
  const report = async status => {
    const snapshot = await snapshotQa(project, step, { artifacts: ['dist/index.html'], checks: [{ id: 'required-matrix', requirement: 'All required cases pass.' }] });
    await recordQa(project, step, { snapshot_id: snapshot.snapshot_id, verifier: { id: 'qa-reviewer', mode: 'independent' },
      outcomes: [{ id: 'required-matrix', status, observation: 'Recorded actual matrix result.',
        evidence_paths: status === 'unverified' ? [] : ['step_archive/outputs/observations.txt'], next_check: status === 'pass' ? '' : 'Rerun the failed cases.' }],
      next_actions: status === 'pass' ? [] : ['Rerun the required cases.'] });
  };
  // Refused completions kept for step-auto-continue, or null when the file is absent.
  const refusalFile = join(project, 'step_archive', 'progress-refusals.json');
  const refusals = () => existsSync(refusalFile) ? JSON.parse(readFileSync(refusalFile, 'utf8')) : null;
  return { project, run, report, refusals };
}

for (const step of qaSteps) {
  test(`Claude Step ${step} refuses missing, failed, unverified and stale QA before recording current PASS`, async () => {
    const f = await fixture(step);
    // Each refusal is kept with the status qa-report.mjs inspect reported (scripts/lib/qa-report.mjs).
    const incomplete = status => {
      const progress = f.run();
      assert.equal(progress.current_step, step);
      assert.equal(progress.completed_steps.includes(step), false);
      assert.deepEqual(f.refusals(), { schema_version: 1, run_started_at: null,
        refusals: [{ step, gate: 'qa', status, verdict: 'INCOMPLETE', detail: '' }] });
    };
    incomplete('missing');
    await f.report('fail'); incomplete('current');
    await f.report('unverified'); incomplete('current');
    await f.report('pass');
    writeFileSync(join(f.project, 'dist', 'index.html'), '<h1>Changed candidate</h1>'); incomplete('stale');
    await f.report('pass');
    writeFileSync(join(f.project, 'step_archive', 'outputs', 'observations.txt'), 'Changed evidence'); incomplete('stale');
    await f.report('pass');
    const completed = f.run();
    assert.equal(completed.current_step, step + 1);
    assert.equal(completed.completed_steps.includes(step), true);
    assert.equal(f.refusals(), null, 'a recorded completion removes the refusal file');
  });
}

test('Claude historical QA completion is preserved without retroactive reports', async () => {
  const f = await fixture(48, true);
  assert.equal(f.run().completed_steps.includes(48), true);
  assert.equal(f.refusals(), null);
});
