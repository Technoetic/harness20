// Shared setup for Claude hook tests: an installed plugin copy, a temporary project, and the
// native or emulated shell that runs one hook script or the run-hook.mjs dispatcher.
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repo = fileURLToPath(new URL('../../../', import.meta.url));
export const windows = process.platform === 'win32';
const gitBashPath = 'C:/Program Files/Git/bin/bash.exe';
export const gitBash = windows && existsSync(gitBashPath) ? gitBashPath : null;
// H50_TEST_BASH=1 runs the .sh hooks through Git Bash on Windows, pretending to be Linux.
export const bashOnWindows = windows && process.env.H50_TEST_BASH === '1';
export const nativeVariant = !windows || bashOnWindows ? 'sh' : 'ps1';

// The bracketed name exercises PowerShell wildcard path handling; the plain name makes sure a
// result does not depend on the brackets alone.
export const PROJECT_NAMES = ['h50 작업 [30]', 'h50 작업 30'];

export function testEachName(title, options, fn) {
  if (typeof options === 'function') [fn, options] = [options, {}];
  for (const name of PROJECT_NAMES) test(`${title} (project "${name}")`, options, t => fn(t, name));
}

// Physical path: macOS tmpdir() is /var/folders/... behind the /private symlink, and hooks that
// derive the project root from their cwd see the physical form.
export function tempRoot(t, prefix) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// Same layout as an installed plugin cache entry. Hooks that write logs next to themselves then
// write into the copy, never into the repository.
export function installPlugin(root, dirs = ['hooks', 'assets', 'scripts']) {
  const plugin = join(root, 'cache', 'plugin', '2.2');
  for (const dir of dirs) cpSync(join(repo, dir), join(plugin, dir), { recursive: true });
  return plugin;
}

// Claude Code sets CLAUDE_PROJECT_DIR, and a test runner started inside it inherits the value,
// so every run states it explicitly.
function hookEnv(env) {
  return { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', CLAUDE_PROJECT_DIR: '', ...env };
}

const input = event => typeof event === 'string' ? event : JSON.stringify(event);

// Spawn limit for one hook script run. Windows PowerShell 5.1 can take more than 60 s to start
// on a fresh CI runner (tag run 36205595180: the first powershell.exe of several files went past
// 60 s), so .ps1 gets 180 s. Git Bash emulation forks dozens of processes per hook call and gets
// 300 s. No retry: a retry would hide a real hang and double the time spent.
export function hookShellTimeout(variant = nativeVariant) {
  if (!windows) return 60000;
  return variant === 'ps1' ? 180000 : 300000;
}

// Runs hooks/<name>.<variant> directly. On Windows the .sh variant runs in Git Bash with uname
// reporting Linux and python standing in for python3. stripCR drops the CR that Windows python
// prints, for hooks that compare parsed values exactly.
export function runClaudeHook(plugin, name, event = {}, { variant = nativeVariant, cwd, env = {}, stripCR = false, timeoutMs } = {}) {
  const script = join(plugin, 'hooks', `${name}.${variant}`);
  let command;
  let args;
  if (variant === 'ps1') {
    command = 'powershell.exe';
    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
  } else if (windows) {
    if (!gitBash) throw new Error(`Git Bash is required to run ${name}.sh on Windows`);
    const python = stripCR ? 'python3(){ python "$@" | tr -d "\\r"; }' : 'python3(){ python "$@"; }';
    command = gitBash;
    args = ['-c', `uname(){ echo Linux; }; ${python}; export -f uname python3; bash "$1"`, 'fixture', script.replaceAll('\\', '/')];
  } else {
    command = 'bash';
    args = [script];
  }
  const timeout = timeoutMs ?? hookShellTimeout(variant);
  const result = spawnSync(command, args, { cwd, input: input(event), encoding: 'utf8', timeout, env: hookEnv(env) });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Runs the installed dispatcher exactly as hooks/hooks.json does: node run-hook.mjs <name>.
export function runDispatcher(plugin, name, eventOrString = {}, { cwd, env = {}, timeoutMs = 20000 } = {}) {
  const result = spawnSync(process.execPath, [join(plugin, 'hooks', 'run-hook.mjs'), name], {
    cwd, input: input(eventOrString), encoding: 'utf8', timeout: timeoutMs, env: hookEnv(env)
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Every directory and file below root as sorted [relative path, sha256 or 'dir'] pairs, so
// "unchanged" means byte-identical.
export function tree(root) {
  const entries = [];
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const key = relative(root, full).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        entries.push([key, 'dir']);
        walk(full);
      } else {
        // Links and other special entries are recorded without being followed.
        entries.push([key, entry.isFile() ? createHash('sha256').update(readFileSync(full)).digest('hex') : 'other']);
      }
    }
  };
  walk(root);
  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
