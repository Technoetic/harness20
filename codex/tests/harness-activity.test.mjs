// hooks/lib/harness-activity.mjs: the single activity judgement behind run-hook.mjs,
// approval-policy.mjs, quality-gate.mjs --hook and webapp-trigger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  ACTIVE_STATUSES, EXPLICIT_WEBAPP, HOOK_GATES, MAX_PROGRESS_BYTES, STEP_COUNT,
  classifyProgress, codexOwned, isActive, readRun, shouldRunHook, webappPrecheck
} from '../../hooks/lib/harness-activity.mjs';
import { repo, tempRoot, tree, windows } from './helpers/claude-hooks.mjs';

const cli = join(repo, 'hooks', 'lib', 'harness-activity.mjs');
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const run = (completed = [], current = 1, extra = {}) => ({ total_steps: 50, completed_steps: completed, current_step: current, ...extra });
const ASCII_LINE = /^[\x20-\x7e]+$/;

test('constants keep the documented values', () => {
  assert.equal(STEP_COUNT, 50);
  assert.deepEqual([...ACTIVE_STATUSES], ['active', 'running', 'in_progress']);
  assert.equal(MAX_PROGRESS_BYTES, 1024 * 1024);
  assert.ok(Object.isFrozen(HOOK_GATES));
});

test('classifyProgress: invalid structures', () => {
  const cases = {
    'empty object': {},
    null: null,
    array: [],
    string: 'x',
    'gap before current': run([2], 3),
    'current past first gap': run([], 2),
    'string current': run([], '1'),
    duplicate: run([1, 1], 2),
    zero: run([0], 1),
    'past last': run([51], 1),
    'string completed': run(['1'], 1),
    'total 107': run([], 1, { total_steps: 107 }),
    'total missing': { completed_steps: [], current_step: 1 },
    'total as string': run([], 1, { total_steps: '50' }),
    'all done but current 1': run(range(1, 50), 1),
    'completed missing': { total_steps: 50, current_step: 1 },
    'completed null': run(null, 1)
  };
  for (const [name, state] of Object.entries(cases)) assert.deepEqual(classifyProgress(state), { phase: 'invalid' }, name);
});

test('classifyProgress: running follows the first unfinished step', () => {
  assert.deepEqual(classifyProgress(run()), { phase: 'running', next: 1, completed: 0 });
  assert.deepEqual(classifyProgress(run([1, 2], 3)), { phase: 'running', next: 3, completed: 2 });
  // The writer's QA gate can leave a gap and move current_step back to it.
  assert.deepEqual(classifyProgress(run([1, 2, 4], 3)), { phase: 'running', next: 3, completed: 3 });
  assert.equal(classifyProgress(run([], 1, { paused: false })).phase, 'running');
  assert.equal(classifyProgress(run([], 1, { status: 'running' })).phase, 'running');
  for (const status of ACTIVE_STATUSES) assert.equal(classifyProgress(run([], 1, { status })).phase, 'running', status);
});

test('classifyProgress: paused, stopped and finished', () => {
  for (const paused of [true, 'yes', null, 0]) assert.deepEqual(classifyProgress(run([], 1, { paused })), { phase: 'paused' }, String(paused));
  assert.deepEqual(classifyProgress(run([], 1, { status: 'paused' })), { phase: 'paused' });
  for (const status of ['cancelled', 'completed', '', null]) assert.deepEqual(classifyProgress(run([], 1, { status })), { phase: 'stopped' }, String(status));
  assert.deepEqual(classifyProgress(run(range(1, 50), 50)), { phase: 'finished', completed: 50 });
  assert.deepEqual(classifyProgress(run(range(1, 50), 51)), { phase: 'finished', completed: 50 });
  assert.deepEqual(classifyProgress(run(range(1, 50), 52)), { phase: 'invalid' });
});

// A project with optional progress, step body and Codex state below the given parent.
function project(t, name, { progress, body, codex } = {}) {
  const root = join(tempRoot(t, 'h50-activity-'), name);
  mkdirSync(root);
  if (progress !== undefined || body || codex !== undefined) mkdirSync(join(root, 'step_archive'));
  if (progress !== undefined) writeFileSync(join(root, 'step_archive', 'progress.json'), typeof progress === 'string' ? progress : JSON.stringify(progress));
  if (body === 'archived') {
    mkdirSync(join(root, 'step_archive', 'archived'));
    writeFileSync(join(root, 'step_archive', 'archived', 'step001.md'), '# Step 1\n');
  } else if (body === 'flat') {
    writeFileSync(join(root, 'step_archive', 'step001.md'), '# Step 1\n');
  }
  if (codex !== undefined) {
    mkdirSync(join(root, 'step_archive', '.harness50-codex'));
    const state = join(root, 'step_archive', '.harness50-codex', 'state.json');
    if (codex === 'directory') mkdirSync(state);
    else writeFileSync(state, codex);
  }
  return root;
}

for (const name of ['x', 'x [30]']) {
  test(`readRun classifies project folders (project "${name}")`, t => {
    assert.deepEqual(readRun(project(t, name)), { phase: 'absent' });
    const fileArchive = project(t, name);
    writeFileSync(join(fileArchive, 'step_archive'), 'not a directory');
    assert.deepEqual(readRun(fileArchive), { phase: 'absent' });

    for (const codex of ['{"schema_version":1,"status":"running"}', 'directory', '{broken']) {
      assert.deepEqual(readRun(project(t, name, { progress: run(), body: 'archived', codex })), { phase: 'codex' }, codex);
    }
    assert.deepEqual(readRun(project(t, name, { progress: '{broken', body: 'archived' })), { phase: 'invalid' });
    const folder = project(t, name, { body: 'archived' });
    mkdirSync(join(folder, 'step_archive', 'progress.json'));
    assert.deepEqual(readRun(folder), { phase: 'invalid' });
    const oversized = JSON.stringify({ ...run(), padding: 'x'.repeat(MAX_PROGRESS_BYTES) });
    assert.deepEqual(readRun(project(t, name, { progress: oversized, body: 'archived' })), { phase: 'invalid' });

    assert.deepEqual(readRun(project(t, name, { progress: run() })), { phase: 'stale', next: 1, completed: 0 });
    assert.deepEqual(readRun(project(t, name, { progress: run(), body: 'archived' })), { phase: 'active', next: 1, completed: 0, stepBody: 'archived' });
    assert.deepEqual(readRun(project(t, name, { progress: run(), body: 'flat' })), { phase: 'active', next: 1, completed: 0, stepBody: 'flat' });
    const bom = project(t, name, { progress: `\uFEFF${JSON.stringify(run())}`, body: 'archived' });
    assert.equal(readRun(bom).phase, 'active');
    assert.equal(isActive(bom), true);
    assert.equal(readRun(project(t, name, { progress: run([], 1, { paused: true }), body: 'archived' })).phase, 'paused');
    assert.equal(readRun(project(t, name, { progress: run(range(1, 50), 50) })).phase, 'finished');
  });
}

test('readRun rejects a progress.json reached through a link that leaves the project', t => {
  const outside = project(t, 'outside', { progress: run(), body: 'archived' });
  const root = project(t, 'inside');
  try {
    symlinkSync(join(outside, 'step_archive'), join(root, 'step_archive'), windows ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) return t.skip(`directory links unavailable: ${error.code}`);
    throw error;
  }
  assert.equal(readRun(outside).phase, 'active');
  assert.deepEqual(readRun(root), { phase: 'invalid' });
});

test('codexOwned counts any entry, dangling links included', t => {
  assert.equal(codexOwned(project(t, 'none')), false);
  assert.equal(codexOwned(project(t, 'file', { codex: '' })), true);
  assert.equal(codexOwned(project(t, 'dir', { codex: 'directory' })), true);
  const dangling = project(t, 'dangling');
  mkdirSync(join(dangling, 'step_archive', '.harness50-codex'), { recursive: true });
  try {
    symlinkSync(join(dangling, 'missing'), join(dangling, 'step_archive', '.harness50-codex', 'state.json'), windows ? 'junction' : 'file');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) return t.skip(`links unavailable: ${error.code}`);
    throw error;
  }
  assert.equal(codexOwned(dangling), true);
});

const HOOKS = Object.keys(HOOK_GATES);
const PHASES = ['absent', 'stale', 'paused', 'stopped', 'invalid', 'finished', 'codex', 'active'];
const EXPECTED = {
  'destructive-guard': PHASES,
  'permission-request-guard': PHASES,
  'webapp-trigger': [],
  'step-progress-loader': ['codex', 'active'],
  'trust5-validator': ['finished', 'active'],
  'step-obedience-guard': ['active'],
  'auto-approve': ['active'],
  'mx-tag-validator': ['active'],
  'lsp-autofix': ['active'],
  'step-progress-writer': ['active'],
  'spec-generator': ['active'],
  'step-auto-continue': ['active']
};
function phaseProject(t, phase) {
  const settings = {
    absent: {},
    stale: { progress: run() },
    paused: { progress: run([], 1, { paused: true }), body: 'archived' },
    stopped: { progress: run([], 1, { status: 'cancelled' }), body: 'archived' },
    invalid: { progress: run([], 1, { total_steps: 107 }), body: 'archived' },
    finished: { progress: run(range(1, 50), 50), body: 'archived' },
    codex: { progress: run(), body: 'archived', codex: '{}' },
    active: { progress: run(), body: 'archived' }
  }[phase];
  const root = project(t, `phase ${phase} [30]`, settings);
  assert.equal(readRun(root).phase, phase);
  return root;
}

test('shouldRunHook: 12 hooks by run phase', t => {
  assert.deepEqual(HOOKS.sort(), Object.keys(EXPECTED).sort());
  for (const phase of PHASES) {
    const root = phaseProject(t, phase);
    const event = JSON.stringify({ cwd: root });
    for (const hook of HOOKS) {
      assert.equal(shouldRunHook(hook, event, { CLAUDE_PROJECT_DIR: '' }, root), EXPECTED[hook].includes(phase), `${hook} in ${phase}`);
    }
    // The explicit command starts webapp-trigger in every phase; its own precheck decides the rest.
    assert.equal(shouldRunHook('webapp-trigger', JSON.stringify({ cwd: root, prompt: '/webapp x' }), { CLAUDE_PROJECT_DIR: '' }, root), true, phase);
    // CLAUDE_PROJECT_DIR wins over the event cwd, which wins over the process cwd.
    assert.equal(shouldRunHook('auto-approve', JSON.stringify({ cwd: 'Z:/nowhere' }), { CLAUDE_PROJECT_DIR: root }, repo), phase === 'active', phase);
    assert.equal(shouldRunHook('auto-approve', '{}', { CLAUDE_PROJECT_DIR: '' }, root), phase === 'active', phase);
  }
});

test('shouldRunHook: broken events start only the guards; unknown names use the active gate', t => {
  const active = phaseProject(t, 'active');
  const absent = phaseProject(t, 'absent');
  for (const raw of ['{broken', '', 'null', '[]', '"text"', '42']) {
    for (const hook of HOOKS) {
      assert.equal(shouldRunHook(hook, raw, { CLAUDE_PROJECT_DIR: active }, active), HOOK_GATES[hook] === 'always', `${hook} with ${JSON.stringify(raw)}`);
    }
  }
  assert.equal(shouldRunHook('future-hook', JSON.stringify({ cwd: active }), { CLAUDE_PROJECT_DIR: '' }, active), true);
  assert.equal(shouldRunHook('future-hook', JSON.stringify({ cwd: absent }), { CLAUDE_PROJECT_DIR: '' }, absent), false);
  assert.equal(shouldRunHook('__proto__', JSON.stringify({ cwd: absent }), { CLAUDE_PROJECT_DIR: '' }, absent), false);
  assert.equal(shouldRunHook('auto-approve', JSON.stringify({ cwd: 42 }), { CLAUDE_PROJECT_DIR: '' }, active), false);
  assert.equal(shouldRunHook('auto-approve', Buffer.from(JSON.stringify({ cwd: active })), { CLAUDE_PROJECT_DIR: '' }, absent), true);
});

test('EXPLICIT_WEBAPP accepts only a first-line /webapp command with a topic', () => {
  for (const prompt of ['/webapp fractions', '  /webapp x', '\t/webapp x', '/harness50:webapp x', '/webapp x\n더', '/webapp 논문 트렌드']) {
    assert.equal(EXPLICIT_WEBAPP.test(prompt), true, JSON.stringify(prompt));
  }
  for (const prompt of ['/webapp', '/webapp   ', '/webappx y', '/WEBAPP x', 'please /webapp x', '\n/webapp x', '/webapp\nx',
    '웹앱 튜토리얼 만들어줘', '회사 매출 대시보드 만들어줘', '@step_archive/archived/step001.md 절대 복종', 'webapp 생성',
    '인터렉티브 필수', '/other:webapp x']) {
    assert.equal(EXPLICIT_WEBAPP.test(prompt), false, JSON.stringify(prompt));
  }
});

test('HOOK_GATES names exactly the hooks registered in hooks/hooks.json', () => {
  const config = JSON.parse(readFileSync(join(repo, 'hooks', 'hooks.json'), 'utf8'));
  const names = new Set();
  for (const groups of Object.values(config.hooks)) {
    for (const group of groups) for (const hook of group.hooks) names.add(/run-hook\.mjs" ([a-z0-9-]+)$/.exec(hook.command)[1]);
  }
  assert.deepEqual(Object.keys(HOOK_GATES).sort(), [...names].sort());
});

test('webappPrecheck issues only where no completed step would be lost', t => {
  assert.equal(webappPrecheck(project(t, 'none')), 'issue');
  assert.equal(webappPrecheck(project(t, 'empty [30]', { progress: run() })), 'issue');
  assert.equal(webappPrecheck(project(t, 'no field', { progress: { current_step: 1 } })), 'issue');
  // Paused, stopped and body-less runs without completed steps may start a new topic.
  assert.equal(webappPrecheck(project(t, 'paused', { progress: run([], 1, { paused: true }) })), 'issue');
  const lines = {
    recorded: webappPrecheck(project(t, 'recorded', { progress: run([1], 2), body: 'archived' })),
    finished: webappPrecheck(project(t, 'finished', { progress: run(range(1, 50), 50) })),
    broken: webappPrecheck(project(t, 'broken', { progress: '{broken' })),
    array: webappPrecheck(project(t, 'array', { progress: '[1]' })),
    notArray: webappPrecheck(project(t, 'not array', { progress: { completed_steps: 'x' } })),
    codex: webappPrecheck(project(t, 'codex', { progress: run(), codex: '{}' }))
  };
  assert.match(lines.recorded, /^\[HARNESS\] webapp trigger skipped: step_archive\/progress\.json already records 1\/50 completed steps/);
  assert.match(lines.recorded, /run \/harness-reset first and then \/webapp <topic> for a new topic\.$/);
  assert.match(lines.finished, /already records 50\/50 completed steps/);
  for (const key of ['broken', 'array', 'notArray']) assert.match(lines[key], /^\[HARNESS\] webapp trigger skipped: step_archive\/progress\.json is unreadable or invalid/, key);
  assert.match(lines.codex, /^\[HARNESS\] webapp trigger skipped: a Codex workflow owns this workspace/);
  for (const [key, line] of Object.entries(lines)) {
    assert.match(line, ASCII_LINE, key);
    assert.doesNotMatch(line, /\n/, key);
  }
});

test('CLI prints one ASCII line, writes nothing and always exits 0', t => {
  const base = tempRoot(t, 'h50-activity-cli-');
  const roots = {
    absent: join(base, 'absent [30]'),
    active: join(base, 'active 작업'),
    recorded: join(base, 'recorded'),
    broken: join(base, 'broken')
  };
  for (const root of Object.values(roots)) mkdirSync(root);
  for (const key of ['active', 'recorded', 'broken']) mkdirSync(join(roots[key], 'step_archive', 'archived'), { recursive: true });
  writeFileSync(join(roots.active, 'step_archive', 'progress.json'), JSON.stringify(run()));
  writeFileSync(join(roots.active, 'step_archive', 'archived', 'step001.md'), '# Step 1\n');
  writeFileSync(join(roots.recorded, 'step_archive', 'progress.json'), JSON.stringify(run([1], 2)));
  writeFileSync(join(roots.broken, 'step_archive', 'progress.json'), '{broken');
  const before = tree(base);
  const call = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, args.join(' '));
    assert.equal(result.stderr, '', args.join(' '));
    assert.match(result.stdout, /^[\x20-\x7e]+\n$/, args.join(' '));
    return result.stdout.trim();
  };
  assert.equal(call('phase', roots.absent), 'absent');
  assert.equal(call('phase', roots.active), 'active');
  assert.equal(call('phase', join(roots.active, '.')), 'active');
  assert.equal(call('phase', roots.broken), 'invalid');
  assert.equal(call('phase'), 'invalid');
  assert.equal(call('precheck-webapp', roots.absent), 'issue');
  assert.equal(call('precheck-webapp', roots.active), 'issue');
  assert.match(call('precheck-webapp', roots.recorded), /already records 1\/50/);
  assert.match(call('precheck-webapp', roots.broken), /unreadable or invalid/);
  assert.match(call('precheck-webapp'), /unreadable or invalid/);
  assert.equal(call('unknown', roots.active), 'invalid');
  assert.deepEqual(tree(base), before);
});
