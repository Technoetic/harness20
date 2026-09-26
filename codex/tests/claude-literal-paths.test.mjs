// PowerShell treats [ ] in a -Path argument as a wildcard class, so a project folder such as
// 'x [30]' or a Next.js file such as src/[id].js used to make the .ps1 hooks go quiet: Test-Path
// returned False, Get-Content threw and Get-ChildItem found nothing. These tests run the hooks
// on bracketed paths through the native variant (PowerShell on Windows, bash elsewhere).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { gitBash, hookShellTimeout, installPlugin, nativeVariant, runClaudeHook, tempRoot, windows } from './helpers/claude-hooks.mjs';

// Git Bash emulation on Windows (H50_TEST_BASH=1): mx-tag-validator.sh pastes the progress path
// into python source, where C:\Users would read as an escape, so the .sh variant gets forward
// slashes there. PowerShell and POSIX use the path as is.
const spell = path => (windows && nativeVariant === 'sh' ? path.replaceAll('\\', '/') : path);

test('mx-tag-validator checks src/[id].js in a bracketed project', t => {
  const root = tempRoot(t, 'h50-literal-');
  const plugin = installPlugin(root);
  const project = join(root, 'x [30]');
  mkdirSync(join(project, 'step_archive'), { recursive: true });
  mkdirSync(join(project, 'src'));
  writeFileSync(join(project, 'step_archive', 'progress.json'), JSON.stringify({
    total_steps: 50, current_step: 15, completed_steps: Array.from({ length: 14 }, (_, index) => index + 1), failed_steps: []
  }));
  for (const file of ['[id].js', 'plain.js']) {
    const filePath = join(project, 'src', file);
    writeFileSync(filePath, 'export const value = 1;\n');
    const result = runClaudeHook(plugin, 'mx-tag-validator', {
      hook_event_name: 'PostToolUse', cwd: spell(project), tool_name: 'Write', tool_input: { file_path: spell(filePath), content: 'x' }
    }, { stripCR: true });
    assert.equal(result.status, 0, result.stderr);
    // Known channel difference, out of scope here: the .ps1 hook reports through stdout
    // additionalContext, the .sh hook through stderr.
    const channel = nativeVariant === 'ps1' ? result.stdout : result.stderr;
    assert.notEqual(channel.trim(), '', `${file}: no warning`);
    const warning = nativeVariant === 'ps1' ? JSON.parse(channel).hookSpecificOutput.additionalContext : channel;
    assert.match(warning, /has no @MX tags/, file);
    assert.ok(warning.includes(file), `${file}: ${warning}`);
  }
});

function runBundler(plugin, project) {
  const script = join(plugin, 'hooks', `html-bundler.${nativeVariant}`);
  let command;
  let args;
  if (nativeVariant === 'ps1') {
    command = 'powershell.exe';
    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ProjectRoot', project];
  } else if (windows) {
    if (!gitBash) throw new Error('Git Bash is required to run html-bundler.sh on Windows');
    command = gitBash;
    args = ['-c', 'uname(){ echo Linux; }; python3(){ python "$@"; }; export -f uname python3; bash "$@"', 'fixture',
      script.replaceAll('\\', '/'), spell(project)];
  } else {
    command = 'bash';
    args = [script, project];
  }
  const result = spawnSync(command, args, {
    cwd: plugin, encoding: 'utf8', timeout: hookShellTimeout(nativeVariant),
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', CLAUDE_PROJECT_DIR: '' }
  });
  if (result.error) throw result.error;
  return result;
}

test('html-bundler bundles a bracketed project and skips a directory named like a script', t => {
  const root = tempRoot(t, 'h50-literal-');
  const plugin = installPlugin(root);
  const project = join(root, 'b [30]');
  const src = join(project, 'src');
  mkdirSync(join(src, 'sub'), { recursive: true });
  mkdirSync(join(src, 'vendor.js'));
  writeFileSync(join(src, 'index.html'), '<!doctype html>\n<html><head><title>t</title><link rel="stylesheet" href="style.css"></head>\n<body><script type="module" src="app.js"></script></body></html>\n');
  // A backslash and a $& in the code must come through as written: they used to be read as
  // re escapes (bash variant) and .NET substitutions (PowerShell variant) during injection.
  writeFileSync(join(src, 'app.js'), "import { helper } from './sub/x.mjs';\nexport const digits = /\\d+/;\nexport const token = '$&';\nexport function app() { return helper(); }\n");
  writeFileSync(join(src, 'style.css'), 'body { margin: 0; }\n');
  writeFileSync(join(src, 'sub', 'x.mjs'), 'export function helper() { return 1; }\n');
  writeFileSync(join(src, 'vendor.js', 'a.css'), '.vendor-a { color: red; }\n');

  const result = runBundler(plugin, project);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  // ASCII tail of the summary line: two stylesheets and two scripts, the vendor.js folder not
  // among the scripts.
  assert.match(result.stdout, /css=2 js=2/);
  const html = readFileSync(join(project, 'dist', 'index.html'), 'utf8');
  assert.ok(html.includes('// app.js'), html);
  assert.ok(html.includes('x.mjs'), html);
  assert.ok(html.includes('/* style.css'), html);
  assert.ok(html.includes('.vendor-a { color: red; }'), html);
  assert.doesNotMatch(html, /^\/\/ vendor\.js$/m);
  assert.ok(html.includes('const digits = /\\d+/;'), html);
  assert.ok(html.includes("const token = '$&';"), html);
});
