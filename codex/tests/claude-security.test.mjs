import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PROJECT_NAMES, installPlugin, runClaudeHook, tempRoot } from './helpers/claude-hooks.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const windows = process.platform === 'win32';
const bashOnWindows = windows && process.env.H50_TEST_BASH === '1';
const active = { current_step: 1, total_steps: 50, completed_steps: [] };
function fixture(t, state = active) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h50-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'step_archive'));
  if (state !== null) fs.writeFileSync(path.join(root, 'step_archive/progress.json'), typeof state === 'string' ? state : JSON.stringify(state));
  return root;
}
// Runs a hook from the repository without judging its stderr; run() requires stderr to be empty.
function runRaw(root, hook, event, env = {}, cwd = root) {
  const script = path.join(repo, 'hooks', hook + (windows && !bashOnWindows ? '.ps1' : '.sh'));
  const shell = bashOnWindows ? 'C:/Program Files/Git/bin/bash.exe' : windows ? 'powershell.exe' : 'bash';
  const args = bashOnWindows ? ['-c', 'uname(){ echo Linux; }; python3(){ python "$@" | tr -d "\\r"; }; export -f uname python3; bash "$1"', 'fixture', script.replaceAll('\\', '/')] : windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script] : [script];
  const result = spawnSync(shell, args, {
    cwd, input: JSON.stringify(event), encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', CLAUDE_PROJECT_DIR: root, ...env },
  });
  assert.equal(result.error, undefined);
  return { status: result.status, output: result.stdout.trim(), stderr: result.stderr };
}
function run(root, hook, event, env = {}, cwd = root) {
  const result = runRaw(root, hook, event, env, cwd);
  assert.equal(result.stderr, '', result.stderr);
  return { status: result.status, output: result.output };
}
const write = (file_path) => ({ tool_name: 'Write', tool_input: { file_path, content: 'example' } });
test('shipping hook allows an ordinary project write in bootstrap state', t => {
  const root = fixture(t);
  assert.match(run(root, 'auto-approve', write('src/app.js')).output, /"allow"/);
});
for (const [name, state] of Object.entries({ missing: null, malformed: '{', empty: {}, completed: { ...active, current_step: 50, completed_steps: Array.from({ length: 50 }, (_, i) => i + 1) }, paused: { ...active, paused: true }, statusPaused: { ...active, status: 'paused' }, gap: { ...active, current_step: 3, completed_steps: [2] }, inconsistent: { ...active, current_step: 2 }, strings: { ...active, current_step: '1' } })) {
  test(`autoapproval defers for ${name} state`, t => {
    assert.equal(run(fixture(t, state), 'auto-approve', write('src/app.js')).output, '');
  });
}
for (const target of ['.claude/subdir/../settings.json', '/cache/harness50/2.1.0/hooks/auto-approve.ps1', path.join(repo, 'hooks/auto-approve.ps1')]) {
  test(`protect canonical target ${target}`, t => {
    const root = fixture(t);
    assert.equal(run(root, 'auto-approve', write(target)).output, '');
    const guard = run(root, 'permission-request-guard', write(target));
    assert.equal(guard.status, 2);
    assert.match(guard.output, /"deny"/);
  });
}
test('arbitrary shell and out-of-project writes require normal permission', t => {
  const root = fixture(t);
  assert.equal(run(root, 'auto-approve', { tool_name: 'Bash', tool_input: { command: 'echo hello' } }).output, '');
  assert.equal(run(root, 'auto-approve', write('../outside.txt')).output, '');
});
test('existing destructive command denial remains (payload never executed)', t => {
  const root = fixture(t);
  const event = { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } };
  assert.equal(run(root, 'auto-approve', event).output, '');
  // A Bash deny explains the file route on stderr (see the guard wording tests below).
  const guard = runRaw(root, 'permission-request-guard', event);
  assert.equal(guard.status, 2);
  assert.match(guard.stderr, /Do not move commands into a script/);
});
test('event cwd is used when project environment is absent', t => {
  const root = fixture(t);
  assert.match(run(root, 'auto-approve', { ...write('src/app.js'), cwd: root }, { CLAUDE_PROJECT_DIR: '' }, repo).output, /"allow"/);
});
test('Unicode event cwd survives the PowerShell to Node pipe', t => {
  const parent = fixture(t);
  const root = path.join(parent, '프로젝트');
  fs.mkdirSync(path.join(root, 'step_archive'), { recursive: true });
  fs.writeFileSync(path.join(root, 'step_archive/progress.json'), JSON.stringify(active));
  assert.match(run(root, 'auto-approve', { ...write('src/app.js'), cwd: root }, { CLAUDE_PROJECT_DIR: '' }, repo).output, /"allow"/);
});
test('hard links to protected files do not grant write approval', t => {
  const root = fixture(t);
  const privatePath = path.join(root, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(privatePath));
  fs.writeFileSync(privatePath, '{}');
  fs.linkSync(privatePath, path.join(root, 'innocent.json'));
  assert.equal(run(root, 'auto-approve', write('innocent.json')).output, '');
});
test('parent traversal after a directory link cannot hide its protected target', t => {
  const root = fixture(t);
  const protectedChild = path.join(root, '.claude', 'child');
  fs.mkdirSync(protectedChild, { recursive: true });
  fs.symlinkSync(protectedChild, path.join(root, 'alias'), windows ? 'junction' : 'dir');
  const event = write('alias/../settings.json');
  assert.equal(run(root, 'auto-approve', event).output, '');
  assert.equal(run(root, 'permission-request-guard', event).status, 2);
});
test('canonical linked directories cannot escape project scope or plugin protection', t => {
  const root = fixture(t);
  const outside = fixture(t);
  fs.symlinkSync(outside, path.join(root, 'outside'), windows ? 'junction' : 'dir');
  fs.symlinkSync(path.join(repo, 'hooks'), path.join(root, 'plugin'), windows ? 'junction' : 'dir');
  assert.equal(run(root, 'auto-approve', write('outside/file.txt')).output, '');
  assert.equal(run(root, 'auto-approve', write('plugin/auto-approve.ps1')).output, '');
  assert.equal(run(root, 'permission-request-guard', write('plugin/auto-approve.ps1')).status, 2);
});
test('WebSearch and middle workflow project edits are eligible; WebFetch defers', t => {
  const root = fixture(t, { ...active, current_step: 3, completed_steps: [1, 2] });
  assert.match(run(root, 'auto-approve', write('src/app.js')).output, /"allow"/);
  assert.match(run(root, 'auto-approve', { tool_name: 'WebSearch', tool_input: { query: 'css' } }).output, /"allow"/);
  assert.equal(run(root, 'auto-approve', { tool_name: 'WebFetch', tool_input: { url: 'https://example.com' } }).output, '');
  assert.equal(run(root, 'auto-approve', write('step_archive/progress.json')).output, '');
});
// 8.3 alias of an existing path's last component, or null when the volume creates no short names.
function shortName(target) {
  if (!windows) return null;
  const result = spawnSync(`for %I in ("${target}") do @echo %~sI`, { shell: true, encoding: 'utf8', timeout: 15000 });
  const alias = path.basename(result.stdout.trim());
  return result.status === 0 && alias && alias.toLowerCase() !== path.basename(target).toLowerCase() ? alias : null;
}
test('Codex workflow state paths never receive write approval in an active Claude workflow', t => {
  // A state.json there would silence the Claude Stop gates, just like a rewritten progress.json.
  const root = fixture(t, { ...active, current_step: 40, completed_steps: Array.from({ length: 39 }, (_, i) => i + 1) });
  assert.match(run(root, 'auto-approve', write('src/app.js')).output, /"allow"/);
  const targets = ['step_archive/.harness50-codex/state.json', 'step_archive/.harness50-codex', 'step_archive/.harness50-codex/backups/reset-1/state.json',
    'STEP_ARCHIVE/.Harness50-Codex/state.json', 'step_archive/.harness50-codex./state.json', 'step_archive/.harness50-codex/state.json::$DATA',
    'STEP_ARCHIVE/PROGRESS.JSON', path.join(root, 'step_archive', '.harness50-codex', 'state.json')];
  for (const target of targets) assert.equal(run(root, 'auto-approve', write(target)).output, '', target);
  const codexDirectory = path.join(root, 'step_archive', '.harness50-codex');
  fs.mkdirSync(codexDirectory);
  for (const target of targets) assert.equal(run(root, 'auto-approve', write(target)).output, '', `${target} (existing directory)`);
  for (const alias of [shortName(codexDirectory) && `step_archive/${shortName(codexDirectory)}/state.json`,
    shortName(path.join(root, 'step_archive')) && `${shortName(path.join(root, 'step_archive'))}/.harness50-codex/state.json`]) {
    if (alias) assert.equal(run(root, 'auto-approve', write(alias)).output, '', alias);
  }
  assert.match(run(root, 'auto-approve', write('step_archive/.harness50-codex-notes.md')).output, /"allow"/);
});
for (const [name, create] of Object.entries({
  'running state': file => fs.writeFileSync(file, JSON.stringify({ schema_version: 1, workflow_id: 'wf', status: 'running', current_step: 30, completed_steps: Array.from({ length: 29 }, (_, i) => i + 1) })),
  'empty object': file => fs.writeFileSync(file, '{}'),
  'empty file': file => fs.writeFileSync(file, ''),
  directory: file => fs.mkdirSync(file),
})) {
  test(`Codex state (${name}) turns autoapproval off next to an active progress.json`, t => {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, 'step_archive', '.harness50-codex'));
    create(path.join(root, 'step_archive', '.harness50-codex', 'state.json'));
    assert.equal(run(root, 'auto-approve', write('src/app.js')).output, '');
    assert.equal(run(root, 'auto-approve', { tool_name: 'WebSearch', tool_input: { query: 'css' } }).output, '');
  });
}
test('dangling directory links cannot grant project write approval', t => {
  const root = fixture(t);
  const outside = fixture(t);
  fs.symlinkSync(path.join(outside, 'missing'), path.join(root, 'dangling'), windows ? 'junction' : 'dir');
  assert.equal(run(root, 'auto-approve', write('dangling/file.txt')).output, '');
});
test('missing Node runtime cannot grant approval', t => {
  const root = fixture(t);
  const script = path.join(repo, 'hooks', windows ? 'auto-approve.ps1' : 'auto-approve.sh');
  const executable = windows ? path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe') : '/bin/bash';
  const result = spawnSync(executable, windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script] : [script], {
    cwd: root, input: JSON.stringify(write('src/app.js')), encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PATH: root, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

// The guards read the whole command text, quoted strings and heredoc bodies included. A block
// caused by message text should point at the file route instead of inviting a workaround.
// Windows runs the .ps1 hooks and POSIX (or H50_TEST_BASH=1) the .sh hooks, so each wording set
// is checked where it ships.
const bodyCommand = 'gh pr create --title t --body "Never run git reset --hard on shared branches"';
const heredocCommand = "gh pr create --title t --body-file - <<'EOF'\n- `git reset --hard` counts as deletion\nEOF";
function installedGuard(t) {
  const root = tempRoot(t, 'h50-guard-');
  const plugin = installPlugin(root);
  const project = path.join(root, PROJECT_NAMES[0]);
  fs.mkdirSync(project);
  const run = (hook, event) => runClaudeHook(plugin, hook, event, { cwd: project, env: { CLAUDE_PROJECT_DIR: project }, stripCR: true });
  return { plugin, project, run };
}
function assertFileRoute(stderr) {
  assert.match(stderr, /--body-file <file>/);
  assert.match(stderr, /git commit -F <file>/);
  assert.match(stderr, /Do not move commands into a script/);
}
test('destructive-guard blocks quoted body text but names the file route', t => {
  const { run } = installedGuard(t);
  const bash = command => run('destructive-guard', { tool_name: 'Bash', tool_input: { command } });
  for (const command of [bodyCommand, heredocCommand]) {
    const result = bash(command);
    assert.equal(result.status, 2, command);
    assertFileRoute(result.stderr);
  }
  for (const command of ['git reset --hard HEAD~1', 'bash -c "git reset --hard"', 'git commit -m "$(git reset --hard)"', 'rm -rf /']) {
    assert.equal(bash(command).status, 2, command);
  }
  // Known boundary: --force alone in a message is not one of the patterns.
  assert.equal(bash('git commit -m "docs: explain why we avoid --force"').status, 0);
});
test('permission-request-guard explains the file route for Bash denies only', t => {
  const { plugin, project, run } = installedGuard(t);
  const bash = run('permission-request-guard', { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: bodyCommand } });
  assert.equal(bash.status, 2);
  assert.match(bash.stdout, /"behavior":"deny"/);
  assertFileRoute(bash.stderr);
  fs.symlinkSync(path.join(plugin, 'hooks'), path.join(project, 'plugin'), windows ? 'junction' : 'dir');
  const edit = run('permission-request-guard', { hook_event_name: 'PermissionRequest', ...write('plugin/auto-approve.ps1') });
  assert.equal(edit.status, 2);
  assert.match(edit.stdout, /"deny"/);
  assert.equal(edit.stderr, '');
});
