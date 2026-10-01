import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeWorkspace } from './helpers/workspace.mjs';
import { runQualityGate } from '../../scripts/lib/quality.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
import { passingBrowserReport } from './helpers/routing.mjs';
import { recordPassingFinalRegression } from './helpers/final-regression.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const windows = process.platform === 'win32';
const bashFixture = windows && process.env.H50_TEST_BASH === '1';

async function fixture(completed = 49) {
  const base = await makeWorkspace();
  const project = join(base, 'project');
  const plugin = join(base, 'cache', 'plugin');
  for (const dir of ['hooks', 'scripts']) cpSync(join(repo, dir), join(plugin, dir), { recursive: true });
  mkdirSync(join(project, 'step_archive', 'archived'), { recursive: true });
  mkdirSync(join(project, 'dist'));
  mkdirSync(join(project, 'coverage'));
  writeFileSync(join(project, 'step_archive', 'archived', 'step050.md'), '# Final step\n');
  const progress = join(project, 'step_archive', 'progress.json');
  writeFileSync(progress, JSON.stringify({ last_updated: '', total_steps: 50, current_step: 50,
    completed_steps: Array.from({ length: completed }, (_, i) => i + 1) }));
  const manifest = { schema_version: 1, mode: 'hash', fallback: 'home', routes: [{ id: 'home', path: '/' }] };
  writeFileSync(join(project, 'dist', 'index.html'), `<!doctype html><html lang="en"><head><script id="harness50-routes" type="application/json">${JSON.stringify(manifest)}</script><title>Home</title></head><body><main data-harness-screen="home"><h1>Home</h1></main></body></html>`);
  const coverage = { total: Object.fromEntries(['lines', 'statements', 'functions', 'branches'].map(name => [name, { total: 1, covered: 1 }])) };
  const checks = Object.fromEntries(['test', 'lint', 'typecheck', 'security'].map(name => [name, { command: [process.execPath, '-e', 'process.exit(0)'] }]));
  checks.test.command = [process.execPath, '-e', `require('node:fs').appendFileSync('step_archive/command-runs.txt','run\\n');require('node:fs').writeFileSync('coverage/coverage-summary.json',${JSON.stringify(JSON.stringify(coverage))})`];
  writeFileSync(join(project, 'harness50.quality.json'), JSON.stringify({ schema_version: 1, checks, coverage: { path: 'coverage/coverage-summary.json', minimum: 85 } }));
  assert.equal((await runQualityGate(project)).verdict, 'PASS');
  const runs = readFileSync(join(project, 'step_archive', 'command-runs.txt'), 'utf8');
  // The writer skips a Stop, logging it next to itself, when another process holds the machine-wide
  // Global\step-progress-writer-mutex (or the project's flock) for 5 s. Such a run is repeated
  // (bounded), so the refusal file always reflects the run being checked.
  const log = join(plugin, 'hooks', 'step-progress-writer.log');
  const logged = () => existsSync(log) ? readFileSync(log, 'utf8') : '';
  const run = (name, event = {}) => {
    const script = join(plugin, 'hooks', `${name}.${windows && !bashFixture ? 'ps1' : 'sh'}`);
    const shell = bashFixture ? 'C:/Program Files/Git/bin/bash.exe' : windows ? 'powershell.exe' : 'bash';
    const args = bashFixture ? ['-c', 'uname(){ echo Linux; }; python3(){ python "$@"; }; export -f uname python3; bash "$1"', 'fixture', script.replaceAll('\\', '/')]
      : windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script] : [script];
    for (let attempt = 1; ; attempt += 1) {
      const before = logged().length;
      const result = spawnSync(shell, args, { cwd: base, input: JSON.stringify({ cwd: project, ...event }),
        encoding: 'utf8', timeout: 30000, env: { ...process.env, CLAUDE_PROJECT_DIR: '', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
      assert.equal(result.status, 0, result.stderr || String(result.error));
      assert.equal(result.stderr.trim(), '');
      if (name !== 'step-progress-writer' || attempt === 4 || !/mutex acquire FAILED|flock timeout/.test(logged().slice(before))) {
        return result.stdout.trim();
      }
    }
  };
  const noCommands = () => assert.equal(readFileSync(join(project, 'step_archive', 'command-runs.txt'), 'utf8'), runs);
  // A refused Step 50 is kept for step-auto-continue: one final-gate entry whose detail is the
  // inspector error without the absolute project path.
  const refusalFile = join(project, 'step_archive', 'progress-refusals.json');
  const refused = () => {
    const { refusals: [refusal, ...others], ...file } = JSON.parse(readFileSync(refusalFile, 'utf8'));
    assert.deepEqual(file, { schema_version: 1, run_started_at: null });
    assert.deepEqual(others, []);
    const { detail, ...entry } = refusal;
    assert.deepEqual(entry, { step: 50, gate: 'final', status: '', verdict: 'INCOMPLETE' });
    assert.ok(detail.length > 0 && detail.length <= 160, detail);
    for (const form of [project, project.replaceAll('\\', '/')]) {
      assert.equal(detail.toLowerCase().includes(form.toLowerCase()), false, detail);
    }
    return detail;
  };
  const noRefusal = () => assert.equal(existsSync(refusalFile), false, 'no refusal file');
  return { project, plugin, progress, manifest, run, noCommands, refused, noRefusal };
}

test('Claude cannot record new Step 50 from completion text without browser route evidence', async () => {
  const f = await fixture();
  f.run('step-progress-writer', { last_assistant_message: 'Step 050/50 완료' });
  const progress = JSON.parse(readFileSync(f.progress, 'utf8'));
  assert.equal(progress.completed_steps.length, 49);
  assert.equal(progress.current_step, 50);
  // The browser inspector names the missing report by path; the writer keeps it as <project-root>.
  assert.match(f.refused(), /<project-root>/);
  f.noCommands();
});

test('final inspection never reruns project commands and rejects missing browser evidence', async () => {
  const f = await fixture();
  const result = spawnSync(process.execPath, [join(f.plugin, 'scripts', 'quality-gate.mjs'), '--inspect-final', '--workspace', f.project], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 1, result.stdout || result.stderr);
  assert.notEqual(JSON.parse(result.stdout).verdict, 'PASS');
  f.noCommands();
});

test('Claude final completion rejects missing regression matrices despite passing quality and browser evidence', async () => {
  const f = await fixture();
  const browser = passingBrowserReport(sha256(readFileSync(join(f.project, 'dist', 'index.html'))), f.manifest);
  writeFileSync(join(f.project, 'step_archive', 'outputs', 'browser-output.json'), JSON.stringify(browser));
  f.run('step-progress-writer', { last_assistant_message: 'Step 050/50 완료' });
  assert.equal(JSON.parse(readFileSync(f.progress, 'utf8')).completed_steps.length, 49);
  f.refused();
  assert.match(f.run('trust5-validator'), /"decision":"block"/);
  f.noCommands();
});

test('final Stop milestone is incomplete at Step 50 until browser evidence passes', async () => {
  const f = await fixture();
  const output = f.run('trust5-validator');
  assert.match(output, /"decision":"block"/);
  const report = join(f.project, 'step_archive', 'outputs', 'trust5_r3.md');
  assert.ok(existsSync(report));
  assert.match(readFileSync(report, 'utf8'), /Verdict: INCOMPLETE/);
  assert.equal(f.run('trust5-validator', { stop_hook_active: true }), '');
  f.noCommands();
});

test('historical Claude Step 50 remains recorded without retroactive browser verification', async () => {
  const f = await fixture(50);
  f.run('step-progress-writer', { last_assistant_message: 'Step 050/50 완료' });
  assert.equal(JSON.parse(readFileSync(f.progress, 'utf8')).completed_steps.length, 50);
  f.noRefusal();
  f.noCommands();
});

test('Claude final writer rejects old, incomplete and mismatched evidence, then records a valid v3 result', async () => {
  const f = await fixture();
  await recordPassingFinalRegression(f.project);
  const reportPath = join(f.project, 'step_archive', 'outputs', 'browser-output.json');
  const valid = passingBrowserReport(sha256(readFileSync(join(f.project, 'dist', 'index.html'))), f.manifest);
  for (const mutate of [
    report => { report.schema_version = 1; },
    report => { report.schema_version = 2; },
    report => { delete report.compatibility; },
    report => { report.compatibility.navigation_api_unavailable.viewports[0].routes = []; },
    report => { delete report.routing; },
    report => { report.viewports[0].routes = []; },
    report => { report.viewports[1].routes[0].reload = false; },
    report => { report.artifact_sha256 = '0'.repeat(64); },
    report => { report.routing.routes[0].path = '/different'; for (const view of report.viewports) view.routes[0].path = '/different'; }
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    writeFileSync(reportPath, JSON.stringify(changed));
    f.run('step-progress-writer', { last_assistant_message: 'Step 050/50 완료' });
    assert.equal(JSON.parse(readFileSync(f.progress, 'utf8')).completed_steps.length, 49);
    f.refused();
  }
  writeFileSync(reportPath, JSON.stringify(valid));
  assert.equal(f.run('trust5-validator'), '');
  assert.match(readFileSync(join(f.project, 'step_archive', 'outputs', 'trust5_r3.md'), 'utf8'), /Verdict: PASS/);
  f.run('step-progress-writer', { last_assistant_message: 'Step 050/50 완료' });
  assert.equal(JSON.parse(readFileSync(f.progress, 'utf8')).completed_steps.length, 50);
  f.noRefusal();
  f.noCommands();
});

// harness-rules §2: the step 50 message is the completion line followed by the unchanged
// scripts/final-summary.mjs output. The summary quotes a decision that mentions step 49, whose
// body exists here, and must neither block Step 50 nor record step 49.
test('final summary printed after the completion line keeps Step 50 recording exact', async () => {
  const f = await fixture(48);
  writeFileSync(join(f.project, 'step_archive', 'archived', 'step049.md'), '# Step 49\n');
  await recordPassingFinalRegression(f.project);
  const browser = passingBrowserReport(sha256(readFileSync(join(f.project, 'dist', 'index.html'))), f.manifest);
  writeFileSync(join(f.project, 'step_archive', 'outputs', 'browser-output.json'), JSON.stringify(browser));
  writeFileSync(join(f.project, 'step_archive', 'step025_plan.md'), '## 결정/사유\n\n- Step 49 완료 표기를 인용한 결정\n');
  // The installed copy has only hooks/ and scripts/, so the CLI must not import codex/.
  const summary = spawnSync(process.execPath, [join(f.plugin, 'scripts', 'final-summary.mjs'), '--workspace', f.project], { encoding: 'utf8', timeout: 60000 });
  assert.equal(summary.status, 0, summary.stderr);
  assert.match(summary.stdout, /^## 사용자 확인 필요\n/);
  assert.match(summary.stdout, /Step 49 완료 표기/);
  assert.equal(readFileSync(join(f.project, 'step_archive', 'outputs', 'final-summary.md'), 'utf8'), summary.stdout);
  f.run('step-progress-writer', { last_assistant_message: `Step 050/50 완료\n${summary.stdout}` });
  const progress = JSON.parse(readFileSync(f.progress, 'utf8'));
  assert.deepEqual(progress.completed_steps, [...Array.from({ length: 48 }, (_, i) => i + 1), 50]);
  f.noRefusal();
  f.noCommands();
});
