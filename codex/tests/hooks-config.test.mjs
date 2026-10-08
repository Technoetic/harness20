import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, readFile, readdir } from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import { configuredHookInvocation, runConfiguredHook } from "./helpers/run-hook.mjs";
import { makeWorkspace } from "./helpers/workspace.mjs";

const configUrl = new URL("../hooks/hooks.json", import.meta.url);
const expectedScripts = new Map([
  ["PreToolUse", "pre-tool-use.mjs"],
  ["SessionStart", "session-start.mjs"],
  ["UserPromptSubmit", "user-prompt-submit.mjs"],
  ["Stop", "stop.mjs"]
]);

function allCommandHandlers(config) {
  return Object.entries(config.hooks).flatMap(([eventName, groups]) =>
    groups.flatMap(group => group.hooks.map(handler => ({ eventName, group, handler })))
  );
}

function expandRoot(command, pluginRoot) {
  return command.replaceAll("${PLUGIN_ROOT}", pluginRoot);
}

function quotedScript(command) {
  const match = /^node "([^"]+)"$/.exec(command);
  assert.ok(match, `command is not one quoted node script: ${command}`);
  return match[1];
}

function assertResolvedScript(command, pluginRoot, flavor, expectedScript) {
  const expanded = expandRoot(command, pluginRoot);
  const script = quotedScript(expanded);
  const expected = flavor.resolve(pluginRoot, "codex", "hooks", expectedScript);
  assert.equal(flavor.resolve(script), expected);
  const relative = flavor.relative(flavor.resolve(pluginRoot), flavor.resolve(script));
  assert.ok(relative !== "" && relative !== ".." && !relative.startsWith(`..${flavor.sep}`));
}

test("hook config contains exactly four synchronous lifecycle and guard commands", async () => {
  const config = JSON.parse(await readFile(configUrl, "utf8"));
  assert.deepEqual(Object.keys(config), ["hooks"]);
  assert.deepEqual(Object.keys(config.hooks).sort(), ["PreToolUse", "SessionStart", "Stop", "UserPromptSubmit"]);
  assert.equal(allCommandHandlers(config).length, 4);

  for (const [eventName, groups] of Object.entries(config.hooks)) {
    assert.equal(groups.length, 1);
    if (eventName === "PreToolUse") {
      assert.deepEqual(Object.keys(groups[0]), ["matcher", "hooks"]);
      assert.equal(groups[0].matcher, "Bash|apply_patch|Read|Write|Edit|MultiEdit|NotebookEdit|WebFetch|WebSearch");
    } else {
      assert.deepEqual(Object.keys(groups[0]), ["hooks"]);
      assert.equal(groups[0].matcher, undefined);
    }
    assert.equal(groups[0].hooks.length, 1);
    const handler = groups[0].hooks[0];
    const target = expectedScripts.get(eventName);
    assert.deepEqual(handler, {
      type: "command",
      command: `node "${"${PLUGIN_ROOT}"}/codex/hooks/${target}"`,
      commandWindows: `node "${"${PLUGIN_ROOT}"}/codex/hooks/${target}"`,
      timeout: 10
    });
    assert.notEqual(handler.async, true);
  }
});

test("POSIX and Windows command fields resolve exactly inside realistic installed roots", async () => {
  const config = JSON.parse(await readFile(configUrl, "utf8"));
  const posixRoot = "/opt/Harness50 packages/release;safe-root";
  const windowsRoot = "C:\\Program Files\\Harness50 & adapters\\release";
  for (const { eventName, handler } of allCommandHandlers(config)) {
    const target = expectedScripts.get(eventName);
    assertResolvedScript(handler.command, posixRoot, posix, target);
    assertResolvedScript(handler.commandWindows, windowsRoot, win32, target);
  }
});

test("PLUGIN_ROOT remains the exact quoted Codex discovery placeholder", async () => {
  const config = JSON.parse(await readFile(configUrl, "utf8"));
  for (const { handler } of allCommandHandlers(config)) {
    for (const field of ["command", "commandWindows"]) {
      assert.equal((handler[field].match(/\$\{PLUGIN_ROOT\}/g) ?? []).length, 1);
      assert.match(handler[field], /^node "\$\{PLUGIN_ROOT\}\/codex\/hooks\/[a-z-]+\.mjs"$/);
    }
  }
});

test("Codex substitution executes the selected hook through the native host shell", async () => {
  const config = JSON.parse(await readFile(configUrl, "utf8"));
  const checkoutRoot = fileURLToPath(new URL("../..", import.meta.url));
  const holder = await makeWorkspace();
  const pluginRoot = join(holder, "installed plugin root with spaces");
  await mkdir(join(pluginRoot, "codex"), { recursive: true });
  await cp(join(checkoutRoot, "codex", "hooks"), join(pluginRoot, "codex", "hooks"), {
    recursive: true
  });
  await cp(join(checkoutRoot, "codex", "scripts"), join(pluginRoot, "codex", "scripts"), {
    recursive: true
  });
  await mkdir(join(pluginRoot, "scripts", "lib"), { recursive: true });
  // Exact shared dependency closure for the two native hook entrypoints exercised here.
  for (const name of ["workflow-profiles.mjs", "json-io.mjs", "errors.mjs", "quality-files.mjs",
    "strict-json.mjs", "tool-policy.mjs", "sensitive-data.mjs", "read-budget.mjs"]) {
    await cp(join(checkoutRoot, "scripts", "lib", name), join(pluginRoot, "scripts", "lib", name));
  }
  assert.match(pluginRoot, /\s/);
  const root = await makeWorkspace();
  const handler = config.hooks.SessionStart[0].hooks[0];
  const command = process.platform === "win32" ? handler.commandWindows : handler.command;
  const invocation = configuredHookInvocation(command, pluginRoot);
  const expanded = expandRoot(command, pluginRoot);
  if (process.platform === "win32") {
    assert.equal(invocation.executable, process.env.COMSPEC ?? process.env.ComSpec ?? "cmd.exe");
    assert.deepEqual(invocation.args, ["/C", `"${expanded}"`]);
    assert.equal(invocation.windowsVerbatimArguments, true);
  } else {
    assert.equal(invocation.executable, process.env.SHELL || "/bin/sh");
    assert.deepEqual(invocation.args, ["-lc", expanded]);
    assert.equal(invocation.windowsVerbatimArguments, false);
  }
  const result = await runConfiguredHook(command, {
    hook_event_name: "SessionStart",
    cwd: root,
    source: "clear",
    session_id: "native-command-smoke",
    transcript_path: null,
    permission_mode: "default",
    model: "gpt-5.6-codex"
  }, { pluginRoot, cwd: root });
  assert.equal(result.code, 0);
  assert.deepEqual(result.output, {});
  assert.equal(result.stdout, "{}\n");
  assert.equal(result.stderr, "");

  // Established workflow scope remains guarded even when no state is available.
  const metadataRoot = join(root, "step_archive", ".harness50-codex");
  await mkdir(metadataRoot, { recursive: true });
  const guardHandler = config.hooks.PreToolUse[0].hooks[0];
  const guardCommand = process.platform === "win32" ? guardHandler.commandWindows : guardHandler.command;
  const wireEvent = {
    hook_event_name: "PreToolUse",
    cwd: root,
    turn_id: "native-guard-turn",
    tool_use_id: "native-guard-tool",
    session_id: "native-command-smoke",
    transcript_path: null,
    permission_mode: "default",
    model: "gpt-5.6-codex"
  };
  const harmless = await runConfiguredHook(guardCommand, {
    ...wireEvent, tool_name: "Bash", tool_input: { command: "git status --short" }
  }, { pluginRoot, cwd: root });
  assert.equal(harmless.code, 0);
  assert.deepEqual(harmless.output, {});
  assert.equal(harmless.stdout, "{}\n");
  assert.equal(harmless.stderr, "");

  const secretRead = await runConfiguredHook(guardCommand, {
    ...wireEvent, tool_name: "Read", tool_input: { file_path: join(root, ".env") }
  }, { pluginRoot, cwd: root });
  const expectedDenial = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Harness20 blocked this operation (rule: protected-path)."
    }
  };
  assert.equal(secretRead.code, 0);
  assert.deepEqual(secretRead.output, expectedDenial);
  assert.equal(secretRead.stdout, `${JSON.stringify(expectedDenial)}\n`);
  assert.equal(secretRead.stderr, "");
  assert.deepEqual(await readdir(metadataRoot), []);
});
