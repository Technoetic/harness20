import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { makeWorkspace } from './helpers/workspace.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const dispatcher = path.join(repo, 'hooks/run-hook.mjs');
const activity = path.join(repo, 'hooks/lib/harness-activity.mjs');
const expected = {
  SessionStart: [['', 'step-progress-loader', 30]],
  UserPromptSubmit: [['', 'webapp-trigger', 10], ['', 'step-obedience-guard', 5]],
  PreToolUse: [['Bash', 'destructive-guard', 5], ['Write|Edit|MultiEdit|NotebookEdit|WebSearch', 'auto-approve', 3]],
  PermissionRequest: [['Bash|Write|Edit|MultiEdit|NotebookEdit|WebFetch|WebSearch', 'permission-request-guard', 5]],
  PostToolUse: [['Write|Edit', 'mx-tag-validator', 10], ['Write|Edit', 'lsp-autofix', 30]],
  Stop: [['', 'step-progress-writer', 30], ['', 'spec-generator', 15], ['', 'trust5-validator', 60], ['', 'step-auto-continue', 10]],
};
test('Claude manifest has a hooks envelope and one dispatcher per preserved registration', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'hooks/hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(config), ['hooks']);
  assert.deepEqual(Object.keys(config.hooks).sort(), Object.keys(expected).sort());
  for (const [event, registrations] of Object.entries(expected)) {
    const actual = config.hooks[event].flatMap(group => group.hooks.map(hook => {
      assert.equal(hook.type, 'command');
      const match = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/run-hook\.mjs" ([a-z0-9-]+)$/.exec(hook.command);
      assert.ok(match, hook.command);
      return [group.matcher || '', match[1], hook.timeout];
    }));
    assert.deepEqual(actual, registrations);
  }
});
test('dispatcher rejects missing, unknown, traversal, and extra hook arguments', () => {
  for (const args of [[], ['unknown'], ['../webapp-trigger'], ['webapp-trigger', 'extra'], ['__proto__']]) {
    const result = spawnSync(process.execPath, [dispatcher, ...args], { encoding: 'utf8', input: '{}', timeout: 5000 });
    assert.equal(result.status, 64, result.stderr);
    assert.equal(result.stdout, '');
  }
});
test('dispatcher runs only native shell and preserves stdin, output, and exit code', async () => {
  const root = await makeWorkspace();
  fs.copyFileSync(dispatcher, path.join(root, 'run-hook.mjs'));
  fs.mkdirSync(path.join(root, 'lib'));
  fs.copyFileSync(activity, path.join(root, 'lib', 'harness-activity.mjs'));
  const windows = process.platform === 'win32';
  // Only the native counterpart exists; attempting the other platform fails.
  fs.writeFileSync(path.join(root, windows ? 'destructive-guard.ps1' : 'destructive-guard.sh'), windows
    ? "$ErrorActionPreference = 'Stop'\n$raw = [Console]::In.ReadToEnd()\n[Console]::Out.Write($raw)\n[Console]::Error.Write('fixture stderr')\nexit 2\n"
    : "#!/usr/bin/env bash\ncat\nprintf 'fixture stderr' >&2\nexit 2\n");
  // The guards start only in a Harness50 workspace, so the event names a project with an active run.
  const project = path.join(root, 'active');
  fs.mkdirSync(path.join(project, 'step_archive', 'archived'), { recursive: true });
  fs.writeFileSync(path.join(project, 'step_archive', 'progress.json'), JSON.stringify({ current_step: 1, total_steps: 50, completed_steps: [] }));
  fs.writeFileSync(path.join(project, 'step_archive', 'archived', 'step001.md'), '# Step 1\n');
  const event = JSON.stringify({ stop_hook_active: true, cwd: project });
  const result = spawnSync(process.execPath, [path.join(root, 'run-hook.mjs'), 'destructive-guard'], {
    input: event, encoding: 'utf8', timeout: 10000, env: { ...process.env, CLAUDE_PROJECT_DIR: '' }
  });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, event);
  assert.equal(result.stderr, 'fixture stderr');
});
test('dispatcher budgets cover every registration and stay below the manifest timeout', () => {
  const source = fs.readFileSync(dispatcher, 'utf8');
  const literal = /const budgets = (\{[^}]*\});/.exec(source);
  assert.ok(literal, 'run-hook.mjs keeps its budgets as a one-line JSON literal');
  const budgets = JSON.parse(literal[1]);
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'hooks/hooks.json'), 'utf8'));
  const timeouts = new Map();
  for (const groups of Object.values(config.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) timeouts.set(/ ([a-z0-9-]+)$/.exec(hook.command)[1], hook.timeout);
    }
  }
  assert.deepEqual(Object.keys(budgets).sort(), [...timeouts.keys()].sort());
  for (const [name, timeout] of timeouts) {
    assert.ok(budgets[name] >= timeout * 1000 - 2000 && budgets[name] < timeout * 1000, `${name}: ${budgets[name]} ms for a ${timeout} s host timeout`);
  }
});

// The activity gate: a fake script for every registered hook records its stdin in <name>.ran, so
// a sentinel file shows exactly which hooks the dispatcher started.
const GUARDS = ['destructive-guard', 'permission-request-guard'];
const ACTIVITY_GATED = ['step-progress-loader', 'step-obedience-guard', 'auto-approve', 'mx-tag-validator', 'lsp-autofix',
  'step-progress-writer', 'spec-generator', 'trust5-validator', 'step-auto-continue'];
async function gatedDispatcher({ withLib = true } = {}) {
  const root = await makeWorkspace();
  const hooks = path.join(root, 'plugin', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.copyFileSync(dispatcher, path.join(hooks, 'run-hook.mjs'));
  if (withLib) {
    fs.mkdirSync(path.join(hooks, 'lib'));
    fs.copyFileSync(activity, path.join(hooks, 'lib', 'harness-activity.mjs'));
  }
  const windows = process.platform === 'win32';
  for (const name of [...GUARDS, ...ACTIVITY_GATED, 'webapp-trigger']) {
    fs.writeFileSync(path.join(hooks, name + (windows ? '.ps1' : '.sh')), windows
      ? `$raw = [Console]::In.ReadToEnd()\n[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '${name}.ran'), $raw)\n`
      : `cat > "$(dirname "$0")/${name}.ran"\n`);
  }
  const empty = path.join(root, 'empty');
  const active = path.join(root, 'active');
  fs.mkdirSync(empty);
  fs.mkdirSync(path.join(active, 'step_archive', 'archived'), { recursive: true });
  fs.writeFileSync(path.join(active, 'step_archive', 'progress.json'), JSON.stringify({ current_step: 1, total_steps: 50, completed_steps: [] }));
  fs.writeFileSync(path.join(active, 'step_archive', 'archived', 'step001.md'), '# Step 1\n');
  const call = (name, event) => {
    const sentinel = path.join(hooks, `${name}.ran`);
    fs.rmSync(sentinel, { force: true });
    // A test runner started inside Claude Code inherits CLAUDE_PROJECT_DIR, so it is cleared here.
    const result = spawnSync(process.execPath, [path.join(hooks, 'run-hook.mjs'), name], {
      input: event, encoding: 'utf8', timeout: 20000, env: { ...process.env, CLAUDE_PROJECT_DIR: '' }
    });
    assert.equal(result.error, undefined, name);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.equal(result.stdout, '', name);
    assert.equal(result.stderr, '', name);
    return fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8') : null;
  };
  return { empty, active, hooks, call };
}
test('dispatcher starts activity-gated hooks and the two guards only in a project with a run', async () => {
  const f = await gatedDispatcher();
  for (const name of [...GUARDS, ...ACTIVITY_GATED]) {
    assert.equal(f.call(name, JSON.stringify({ cwd: f.empty, prompt: 'hello', tool_name: 'Bash' })), null, `${name} in an empty project`);
    const event = JSON.stringify({ cwd: f.active, session_id: 's', note: 'bytes pass through' });
    assert.equal(f.call(name, event), event, `${name} in an active project`);
  }
});
test('dispatcher hands the hook the node it runs on', async () => {
  const f = await gatedDispatcher();
  const windows = process.platform === 'win32';
  fs.writeFileSync(path.join(f.hooks, windows ? 'destructive-guard.ps1' : 'destructive-guard.sh'), windows
    ? "$null = [Console]::In.ReadToEnd()\n[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'destructive-guard.ran'), $env:HARNESS50_NODE)\n"
    : 'cat >/dev/null\nprintf \'%s\' "$HARNESS50_NODE" > "$(dirname "$0")/destructive-guard.ran"\n');
  assert.equal(f.call('destructive-guard', JSON.stringify({ cwd: f.active, tool_name: 'Bash' })), process.execPath);
});
test('dispatcher starts webapp-trigger only for an explicit /webapp command', async () => {
  const f = await gatedDispatcher();
  const explicit = JSON.stringify({ cwd: f.empty, prompt: '/webapp x' });
  assert.equal(f.call('webapp-trigger', explicit), explicit);
  for (const prompt of ['hello', '회사 매출 대시보드 만들어줘', '/webapp', '/webappx y', 'please /webapp x']) {
    assert.equal(f.call('webapp-trigger', JSON.stringify({ cwd: f.active, prompt })), null, prompt);
  }
  assert.equal(f.call('webapp-trigger', '{broken'), null);
});
test('dispatcher without hooks/lib starts only the two guards', async () => {
  const f = await gatedDispatcher({ withLib: false });
  for (const name of [...ACTIVITY_GATED, 'webapp-trigger']) {
    assert.equal(f.call(name, JSON.stringify({ cwd: f.active, prompt: '/webapp x' })), null, name);
  }
  for (const name of GUARDS) {
    const event = JSON.stringify({ cwd: f.active, tool_name: 'Bash' });
    assert.equal(f.call(name, event), event, name);
  }
});

// Watchdog fixtures use hooks the dispatcher always starts (the two guards), so a copy of
// run-hook.mjs without hooks/lib next to it still spawns them.
async function dispatcherCopy(fixtures) {
  const root = await makeWorkspace();
  fs.copyFileSync(dispatcher, path.join(root, 'run-hook.mjs'));
  for (const [file, text] of Object.entries(fixtures)) fs.writeFileSync(path.join(root, file), text);
  return root;
}
// True when the process recorded in file no longer exists. A survivor is ended at once so a
// failing run does not leave it behind.
function ended(file) {
  const pid = Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
  assert.ok(Number.isInteger(pid) && pid > 0, `pid file ${file}`);
  try {
    process.kill(pid, 0);
  } catch (error) {
    return error.code === 'ESRCH';
  }
  try { process.kill(pid); } catch {}
  return false;
}
test('dispatcher stops a hook that outlives its budget and leaves no child', async () => {
  const windows = process.platform === 'win32';
  const root = await dispatcherCopy(windows
    ? { 'permission-request-guard.ps1': "Set-Content -LiteralPath (Join-Path $PSScriptRoot 'child.pid') -Value $PID\nStart-Sleep -Seconds 60\n" }
    : { 'permission-request-guard.sh': 'echo $$ > "$(dirname "$0")/child.pid"; exec sleep 60\n' });
  const pidFile = path.join(root, 'child.pid');
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(root, 'run-hook.mjs'), 'permission-request-guard'], { input: '{}', encoding: 'utf8', timeout: 20000 });
  const elapsed = Date.now() - started;
  assert.ok(ended(pidFile), 'the hook process is still running');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /permission-request-guard did not finish within 4\.5 s/);
  assert.ok(elapsed < 10000, `returned after ${elapsed} ms`);
});
test('stdin that never ends cannot hold a hook past its budget', async () => {
  const windows = process.platform === 'win32';
  const root = await dispatcherCopy(windows
    ? { 'destructive-guard.ps1': '$null = [Console]::In.ReadToEnd()\n' }
    : { 'destructive-guard.sh': 'exec cat >/dev/null\n' });
  const child = spawn(process.execPath, [path.join(root, 'run-hook.mjs'), 'destructive-guard'], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  // An unfinished event and no end of input: the hook would wait forever on its own.
  child.stdin.write('{"tool_name":"Bash"');
  let timer;
  try {
    const code = await Promise.race([
      new Promise(resolve => child.once('close', resolve)),
      new Promise(resolve => { timer = setTimeout(() => resolve('still running'), 10000); })
    ]);
    assert.equal(code, 1, stderr);
    assert.equal(stdout, '');
    assert.match(stderr, /destructive-guard did not finish within 4\.5 s/);
  } finally {
    clearTimeout(timer);
    child.stdin.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
});
test('the watchdog also ends processes the PowerShell hook started', { skip: process.platform !== 'win32' }, async () => {
  const root = await makeWorkspace();
  const pidFile = path.join(root, 'grandchild.pid');
  const node = process.execPath.replaceAll("'", "''");
  const script = `require('fs').writeFileSync('${pidFile.replaceAll('\\', '/')}', String(process.pid)); setTimeout(() => {}, 60000)`;
  fs.copyFileSync(dispatcher, path.join(root, 'run-hook.mjs'));
  fs.writeFileSync(path.join(root, 'permission-request-guard.ps1'),
    `$raw = [Console]::In.ReadToEnd()\n$x = $raw | & '${node}' -e "${script}" 2>$null\n`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(root, 'run-hook.mjs'), 'permission-request-guard'], { input: '{}', encoding: 'utf8', timeout: 20000 });
  const elapsed = Date.now() - started;
  assert.ok(ended(pidFile), 'the node started by PowerShell is still running');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /permission-request-guard did not finish within 4\.5 s/);
  // Without the tree kill the node started by PowerShell keeps the output pipe open for 20 s.
  assert.ok(elapsed < 10000, `returned after ${elapsed} ms`);
});
