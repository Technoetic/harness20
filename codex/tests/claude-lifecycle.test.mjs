import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { hookShellTimeout } from './helpers/claude-hooks.mjs';

const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const windows = process.platform === 'win32';
const bashOnWindows = windows && process.env.H50_TEST_BASH === '1';
const shell = bashOnWindows ? 'C:/Program Files/Git/bin/bash.exe' : windows ? 'powershell.exe' : 'bash';
const ext = bashOnWindows || !windows ? 'sh' : 'ps1';
// The bracketed name keeps the direct .ps1 hooks on -LiteralPath: a wildcard Test-Path,
// Get-Content or Set-Content misses a project such as 'project [30]' and the hook goes quiet.
const PROJECT_NAMES = ['project', 'project [30]'];
function testEachProject(title, fn) {
  for (const name of PROJECT_NAMES) test(`${title} (project "${name}")`, t => fn(t, name));
}
function fixture(t, projectName) {
  const root = mkdtempSync(join(tmpdir(), 'h50-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plugin = join(root, 'cache', 'plugin', '2.2');
  cpSync(join(repo, 'hooks'), join(plugin, 'hooks'), { recursive: true });
  cpSync(join(repo, 'assets'), join(plugin, 'assets'), { recursive: true });
  cpSync(join(repo, 'scripts'), join(plugin, 'scripts'), { recursive: true });
  const project = join(root, projectName); const other = join(root, 'other');
  mkdirSync(project); mkdirSync(other);
  const run = (name, event = {}, envRoot = '', cwd = other) => {
    const path = join(plugin, 'hooks', `${name}.${ext}`);
    const args = bashOnWindows ? ['-c', 'uname(){ echo Linux; }; python3(){ python "$@"; }; export -f uname python3; bash "$1"', 'fixture', path.replaceAll('\\', '/')] : windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path] : [path];
    const result = spawnSync(shell, args, { cwd, input: JSON.stringify(event), encoding: 'utf8', timeout: hookShellTimeout(ext),
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', CLAUDE_PROJECT_DIR: envRoot } });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.equal(result.stderr.trim(), '', result.stderr);
    return result.stdout.trim();
  };
  const state = (completed = [], current = 1) => {
    mkdirSync(join(project, 'step_archive', 'archived'), { recursive: true });
    for (let n = 1; n <= 3; n++) writeFileSync(join(project, 'step_archive', 'archived', `step00${n}.md`), '# Test\n## Task\n');
    writeFileSync(join(project, 'step_archive', 'progress.json'), JSON.stringify({ last_updated: '', total_steps: 50, current_step: current, completed_steps: completed, failed_steps: [], metrics: { total_sessions: 0 }, session_history: [] }));
  };
  return { plugin, project, other, run, state };
}
testEachProject('exact installed startup bytes use event cwd and environment precedence', (t, name) => {
  const f = fixture(t, name);
  f.run('webapp-trigger', { cwd: f.project, prompt: '/webapp fractions' });
  assert.ok(existsSync(join(f.project, 'step_archive', 'progress.json')));
  assert.ok(!existsSync(join(f.other, 'step_archive')));
  f.run('webapp-trigger', { cwd: f.project, prompt: '/webapp fractions' }, f.other);
  assert.ok(existsSync(join(f.other, 'step_archive', 'progress.json')));
});
testEachProject('writer preserves first unfinished step; loader and Stop agree', (t, name) => {
  const f = fixture(t, name); f.state();
  f.run('step-progress-writer', { cwd: f.project, last_assistant_message: 'Step 003/50 완료' });
  const p = JSON.parse(readFileSync(join(f.project, 'step_archive', 'progress.json'), 'utf8'));
  assert.deepEqual(p.completed_steps, [3]); assert.equal(p.current_step, 1);
  assert.match(f.run('step-progress-loader', { cwd: f.project }), /step001/);
  assert.match(JSON.parse(f.run('step-auto-continue', { cwd: f.project })).reason, /step001/);
  f.run('spec-generator', { cwd: f.project });
  assert.ok(existsSync(join(f.project, 'step_archive', 'specs', 'SPEC-001.md')));
});
// A hand edit can move current_step off the first unfinished step (harness-activity 'drift'). The
// writer puts it back even with nothing new to record, keeps a pause, and leaves an aligned paused
// run byte for byte. The PowerShell writer skips its write while another test file holds the
// machine-wide Global\step-progress-writer-mutex, so each check reruns it (bounded).
testEachProject('writer puts a drifted cursor back on the first unfinished step and keeps a pause', (t, name) => {
  const f = fixture(t, name);
  const file = join(f.project, 'step_archive', 'progress.json');
  const read = () => JSON.parse(readFileSync(file, 'utf8'));
  const stop = message => ({ cwd: f.project, last_assistant_message: message });
  const writeUntil = (event, done) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      f.run('step-progress-writer', event);
      if (done(read())) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 * attempt);
    }
    return read();
  };
  // (a) Nothing new to record: only the cursor moves back.
  f.state([2], 3);
  let p = writeUntil(stop(''), progress => progress.current_step === 1);
  assert.deepEqual(p.completed_steps, [2]); assert.equal(p.current_step, 1);
  // (b) A completion line is recorded, and the cursor follows the first unfinished step.
  f.state([2], 3);
  p = writeUntil(stop('Step 001/50 완료'), progress => progress.completed_steps.includes(1));
  assert.deepEqual(p.completed_steps, [1, 2]); assert.equal(p.current_step, 3);
  // (c) A paused run: the cursor moves back and the pause fields stay.
  f.state([2], 3);
  writeFileSync(file, JSON.stringify({ ...read(), paused: true, pause_reason: 'user-request' }));
  p = writeUntil(stop(''), progress => progress.current_step === 1);
  assert.deepEqual([p.completed_steps, p.current_step, p.paused, p.pause_reason], [[2], 1, true, 'user-request']);
  // (d) A paused run with an aligned cursor: nothing to do, not a byte changes.
  f.state([2], 1);
  writeFileSync(file, JSON.stringify({ ...read(), paused: true, pause_reason: 'user-request' }));
  const bytes = readFileSync(file);
  f.run('step-progress-writer', stop(''));
  assert.deepEqual(readFileSync(file), bytes);
  // (e) A hand-edited progress.json without last_updated: no error on stderr (run() checks it).
  f.state([2], 3);
  const { last_updated: _stamp, ...unstamped } = read();
  writeFileSync(file, JSON.stringify(unstamped));
  p = writeUntil(stop(''), progress => progress.current_step === 1);
  assert.equal(p.current_step, 1); assert.equal(typeof p.last_updated, 'string');
});
testEachProject('Stop is project scoped, bounded, sticky on stall, and resets after progress', (t, name) => {
  const f = fixture(t, name); f.state();
  const event = { cwd: f.project, session_id: 'same-session', stop_hook_active: true };
  for (let i = 0; i < 3; i++) assert.equal(JSON.parse(f.run('step-auto-continue', event)).decision, 'block');
  assert.equal(f.run('step-auto-continue', event), '');
  assert.equal(f.run('step-auto-continue', event), '');
  cpSync(join(f.project, 'step_archive'), join(f.other, 'step_archive'), { recursive: true });
  // Remove only copied runtime state, so this is an independent project.
  for (const name of ['step-auto-continue.same-session.state']) rmSync(join(f.other, 'step_archive', name), { force: true });
  assert.equal(JSON.parse(f.run('step-auto-continue', { ...event, cwd: f.other })).decision, 'block');
  f.state([1], 2);
  assert.match(JSON.parse(f.run('step-auto-continue', event)).reason, /step002/);
  f.state(Array.from({ length: 50 }, (_, i) => i + 1), 50); assert.equal(f.run('step-auto-continue', event), '');
});
testEachProject('the loader never creates progress.json and natural language never bootstraps', (t, name) => {
  const f = fixture(t, name);
  assert.equal(f.run('step-progress-loader', { cwd: f.project }), '');
  assert.equal(f.run('step-progress-loader', {}, '', f.project), '');
  assert.ok(!existsSync(join(f.project, 'step_archive')), 'SessionStart must not create step_archive/');
  for (const prompt of ['회사 매출 대시보드 만들어줘', '웹앱 튜토리얼 만들어줘', '@step_archive/archived/step001.md 절대 복종', '/webapp']) {
    assert.equal(f.run('webapp-trigger', { cwd: f.project, prompt }), '', prompt);
  }
  assert.ok(!existsSync(join(f.project, 'step_archive')), 'a natural-language prompt must not bootstrap');
});
testEachProject('/webapp leaves a run with completed steps unchanged', (t, name) => {
  const f = fixture(t, name); f.state([1], 2);
  mkdirSync(join(f.project, 'step_archive', 'TOPIC'));
  writeFileSync(join(f.project, 'step_archive', 'TOPIC', 'TOPIC.md'), '---\ntopic: first\n---\n');
  const bytes = () => ['progress.json', 'TOPIC/TOPIC.md'].map(file => readFileSync(join(f.project, 'step_archive', file)));
  const before = bytes();
  const lines = f.run('webapp-trigger', { cwd: f.project, prompt: '/webapp x' }).split(/\r?\n/);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /^\[HARNESS\] webapp trigger skipped: step_archive\/progress\.json already records 1\/50 completed steps/);
  assert.deepEqual(bytes(), before);
});
testEachProject('Stop uses process cwd fallback and releases missing, paused, malformed state', (t, name) => {
  const f = fixture(t, name);
  assert.equal(f.run('step-auto-continue', { cwd: f.project }), '');
  f.state([3], 3);
  assert.match(JSON.parse(f.run('step-auto-continue', {}, '', f.project)).reason, /step001/);
  const path = join(f.project, 'step_archive', 'progress.json');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify({ ...state, paused: true }));
  assert.equal(f.run('step-auto-continue', { cwd: f.project }), '');
  writeFileSync(path, '{broken');
  assert.equal(f.run('step-auto-continue', { cwd: f.project }), '');
});
// The completion report route (harness-rules §2) reaches the model through SPEC-050, which
// step050.md reads first. [^\r\n] keeps the matches exact on the CRLF .ps1 source and output.
testEachProject('Step 50 SPEC alone carries the final summary instruction', (t, name) => {
  const f = fixture(t, name);
  mkdirSync(join(f.project, 'step_archive', 'archived'), { recursive: true });
  for (const n of [49, 50]) writeFileSync(join(f.project, 'step_archive', 'archived', `step0${n}.md`), `# Step ${n}\n## 검증\n- x\n`);
  writeFileSync(join(f.project, 'step_archive', 'progress.json'), JSON.stringify({ last_updated: '', total_steps: 50, current_step: 50,
    completed_steps: Array.from({ length: 49 }, (_, i) => i + 1), failed_steps: [] }));
  f.run('spec-generator', { cwd: f.project });
  const spec = n => readFileSync(join(f.project, 'step_archive', 'specs', `SPEC-0${n}.md`), 'utf8');
  const line = /- 50단계 마무리:[^\r\n]*/;
  const shLine = readFileSync(join(repo, 'hooks', 'spec-generator.sh'), 'utf8').match(line)[0].replace(/'$/, '');
  const psLine = readFileSync(join(repo, 'hooks', 'spec-generator.ps1'), 'utf8').match(line)[0].replace(/' \} else \{ '' \}$/, '');
  assert.equal(shLine, psLine);
  assert.match(shLine, /^- 50단계 마무리: [^\r\n]*node "<plugin-root>\/scripts\/final-summary\.mjs" --workspace "<project-root>"[^\r\n]*\(harness-rules §2\)$/);
  const lines = spec(50).split(/\r?\n/);
  const milestone = lines.findIndex(text => text.startsWith('- 품질 마일스톤('));
  assert.ok(milestone > 0, spec(50));
  assert.equal(lines[milestone + 1], shLine);
  assert.equal(lines.filter(text => text.startsWith('- 50단계 마무리:')).length, 1);
  assert.doesNotMatch(spec(49), /final-summary|50단계 마무리/);
});
