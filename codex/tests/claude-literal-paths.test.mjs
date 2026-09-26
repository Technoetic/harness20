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
    assert.equal(result.stderr, '', file);
    assert.notEqual(result.stdout.trim(), '', `${file}: no warning`);
    const warning = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.match(warning, /has no @MX tags/, file);
    assert.ok(warning.includes(file), `${file}: ${warning}`);
  }
});

// An exit-0 PostToolUse hook reaches Claude only through stdout additionalContext. Both variants
// print the same JSON with the same words, and both match the tags case-sensitively.
test('mx-tag-validator speaks through additionalContext with the same words on every host', t => {
  const root = tempRoot(t, 'h50-literal-');
  const plugin = installPlugin(root);
  const project = join(root, 'x [30]');
  mkdirSync(join(project, 'step_archive'), { recursive: true });
  mkdirSync(join(project, 'src'));
  writeFileSync(join(project, 'step_archive', 'progress.json'), JSON.stringify({
    total_steps: 50, current_step: 15, completed_steps: Array.from({ length: 14 }, (_, index) => index + 1), failed_steps: []
  }));
  const noTags = filePath => `[@MX-WARN] ${filePath} has no @MX tags (NOTE/WARN/ANCHOR/TODO) — add at top: // @MX:NOTE: <컨텍스트·의도>, 조건부로 @MX:WARN/@MX:ANCHOR(+@MX:REASON)/@MX:TODO (MoAI mx-tag-protocol SoT)`;
  const noReason = filePath => `[@MX-WARN] ${filePath} has WARN/ANCHOR but missing @MX:REASON sub-line — add // @MX:REASON: <근거>`;
  for (const [file, content, expected] of [
    ['none.js', 'export const value = 1;\n', noTags],
    ['warn.js', '// @MX:WARN: x\nexport const value = 1;\n', noReason],
    ['lower.js', '// @mx:note: x\nexport const value = 1;\n', noTags],
    ['note.js', '// @MX:NOTE: x\nexport const value = 1;\n', null]
  ]) {
    const filePath = spell(join(project, 'src', file));
    writeFileSync(join(project, 'src', file), content);
    const result = runClaudeHook(plugin, 'mx-tag-validator', {
      hook_event_name: 'PostToolUse', cwd: spell(project), tool_name: 'Write', tool_input: { file_path: filePath, content: 'x' }
    }, { stripCR: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '', file);
    if (!expected) {
      assert.equal(result.stdout, '', file);
      continue;
    }
    assert.deepEqual(JSON.parse(result.stdout), {
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: expected(filePath) }
    }, file);
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

// Imports and exports are removed per statement, not per line, so what is left is valid code:
// the old line filter left the tail of a multi-line import and a bare `default`. import() and
// import.meta are not statements and stay. A local @import is dropped (every src/ stylesheet is
// inlined anyway) and a remote one moves to the top of <style>, where a browser still reads it.
test('html-bundler keeps module code valid and injects once', t => {
  const root = tempRoot(t, 'h50-literal-');
  const plugin = installPlugin(root);
  const project = join(root, 'm [30]');
  const src = join(project, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'index.html'), '<head><link rel="stylesheet" href="a.css"></head><body><textarea></body></textarea><script src="app.js" ></script ></body>');
  writeFileSync(join(src, 'app.js'), 'import {\n  helper,\n} from "./x.js";\nimport "./side.js";\nexport default\n  function main() { return helper(); }\nexport * from "./x.js";\n');
  writeFileSync(join(src, 'x.js'), 'import { y } from "./y.js"\nexport const keep = 1\nconst url = import.meta.url; import(\'./lazy.js\');\n');
  writeFileSync(join(src, 'a.css'), '@import "./reset.css";\n@import url(https://fonts.example/x.css);\nbody{margin:0}\n');

  const result = runBundler(plugin, project);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  // The whole summary line, Hangul included: the PowerShell variant now writes UTF-8.
  assert.match(result.stdout, /html-bundler: dist\/index\.html 생성 완료 \(\d+ bytes, css=1 js=2\)/);
  const html = readFileSync(join(project, 'dist', 'index.html'), 'utf8');

  assert.equal(html.match(/<script/g)?.length, 1, html);
  assert.ok(!html.includes('src="app.js"'), html);
  assert.ok(html.includes('<textarea></body></textarea><script>\n'), html);
  assert.ok(html.slice(0, html.lastIndexOf('</body>')).endsWith('\n</script>\n'), `the script block must sit right before the last </body>\n${html}`);
  assert.equal(html.match(/<style>/g)?.length, 1, html);
  assert.ok(html.includes('<style>\n@import url(https://fonts.example/x.css);\n/* a.css */\n'), html);
  assert.equal(html.match(/@import/g)?.length, 1, html);
  assert.ok(!html.includes('reset.css'), html);
  assert.ok(html.includes('</style>\n</head>'), html);

  const script = html.slice(html.indexOf('<script>\n') + '<script>\n'.length, html.lastIndexOf('</script>'));
  for (const kept of ['function main() { return helper(); }', 'const keep = 1', 'import.meta.url', "import('./lazy.js')"]) {
    assert.ok(script.includes(kept), `${kept}\n${script}`);
  }
  // No import or export statement is left. Only the module goal accepts import.meta, so the syntax
  // check below parses a module, and this line rules out the statements that goal would accept.
  assert.doesNotMatch(script, /^[ \t]*(?:export\b|import\b(?![ \t]*[.(]))/m, script);
  const bundle = join(root, 'bundle.mjs');
  writeFileSync(bundle, script);
  const check = spawnSync(process.execPath, ['--check', bundle], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});

// The style goes before the first </head> and the script before the last </body>, once each, by
// inserting at the found position. An earlier </head> or </body> can be text inside a <template>
// or a script string: the PowerShell variant used to inject at every match, the bash variant at
// the first one. Substitution tokens in the code come through as written.
test('html-bundler injects style before the first </head> and scripts before the last </body>', t => {
  const root = tempRoot(t, 'h50-literal-');
  const plugin = installPlugin(root);
  const project = join(root, 'i [30]');
  const src = join(project, 'src');
  mkdirSync(src, { recursive: true });
  const template = '<template id="snippet"><p>&lt;/body&gt;</p></head></body></template>';
  writeFileSync(join(src, 'index.html'), `<!doctype html>\n<html><head><title>t</title><link rel="stylesheet" href="style.css"></head>\n<body>${template}\n<h1>x</h1><script type="module" src="app.js"></script></BODY></html>\n`);
  const declaration = 'const t = "$&|$1|$$|$`|$\'|\\d";';
  writeFileSync(join(src, 'app.js'), `export ${declaration}\n`);
  writeFileSync(join(src, 'style.css'), 'body { margin: 0; }\n');

  const result = runBundler(plugin, project);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const html = readFileSync(join(project, 'dist', 'index.html'), 'utf8');
  assert.equal(html.match(/<style>/g)?.length, 1, html);
  assert.equal(html.match(/<script/g)?.length, 1, html);
  assert.ok(html.includes('<head><title>t</title><style>\n'), html);
  assert.ok(html.includes('</style>\n</head>\n<body>'), html);
  assert.ok(html.includes(`<body>${template}\n<h1>x</h1><script>\n`), html);
  assert.ok(html.includes('\n</script>\n</BODY></html>'), html);
  assert.ok(html.includes(declaration), html);
});
