import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, link, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeDirectoryLink, makeWorkspace } from "./helpers/workspace.mjs";
import { completionHtml } from "./helpers/routing.mjs";
import {
  INVALID_LOCK,
  LOCK_PATH,
  MISSING_TOOLS,
  lockedUnavailableMessage,
  readBackendLock,
  resolveBackend,
  writeBackendLock
} from "../../scripts/lib/browser-backend-lock.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const VERIFY = join(repoRoot, "scripts", "verify-output.mjs");
const LOCK_SEGMENTS = LOCK_PATH.split("/");
const INSTALL_HINT = /playwright install|chromium|browser-verifier|npm ci/i;

const validLock = (selected = "aside") => ({
  schema_version: 1,
  selected,
  tool_version: "1.0.0",
  probed_at: "2026-09-23T00:00:00.000Z"
});

async function writeLock(root, value) {
  await mkdir(join(root, "step_archive", "outputs"), { recursive: true });
  const bytes = typeof value === "string" || Buffer.isBuffer(value) ? value : `${JSON.stringify(value)}\n`;
  await writeFile(join(root, ...LOCK_SEGMENTS), bytes);
}

async function projectWithDist() {
  const root = await makeWorkspace();
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist", "index.html"), completionHtml);
  return root;
}

// PATH holds only the given directories, and an inherited backend override is dropped, so
// `aside --version` fails with ENOENT unless a directory provides a stand-in.
function envWithPath(...directories) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
    key.toUpperCase() !== "PATH" && key !== "HARNESS50_BROWSER_BACKEND"
  )));
  env.PATH = directories.join(delimiter);
  return env;
}

async function emptyDirectory() {
  const directory = join(await makeWorkspace(), "empty");
  await mkdir(directory);
  return directory;
}

// A stand-in `aside` executable: the node binary answers `--version` with a version number,
// which is all the Aside backend's availability probe checks. It is never asked to run.
async function fakeAsideDirectory() {
  const directory = join(await makeWorkspace(), "bin");
  await mkdir(directory);
  const target = join(directory, process.platform === "win32" ? "aside.exe" : "aside");
  try { await link(process.execPath, target); }
  catch { await copyFile(process.execPath, target); }
  return directory;
}

function run(file, args, options) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 60000, ...options }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : -1) : 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

const cli = (args, { env, cwd = repoRoot }) => run(process.execPath, [VERIFY, ...args], { env, cwd });

test("a missing lock or missing lock directory means no lock", async () => {
  const root = await makeWorkspace();
  assert.equal(await readBackendLock(root), null);
  await mkdir(join(root, "step_archive"));
  assert.equal(await readBackendLock(root), null);
  await mkdir(join(root, "step_archive", "outputs"));
  assert.equal(await readBackendLock(root), null);
});

test("a valid lock is returned normalized and unknown extra keys are ignored", async () => {
  const root = await makeWorkspace();
  await writeLock(root, { ...validLock("aside"), note: "added by a later version" });
  assert.deepEqual(await readBackendLock(root), validLock("aside"));
  await writeLock(root, { ...validLock("playwright"), tool_version: null, probed_at: "2026-09-23T09:15:00+09:00" });
  assert.deepEqual(await readBackendLock(root), { ...validLock("playwright"), tool_version: null, probed_at: "2026-09-23T09:15:00+09:00" });
});

test("invalid locks fail closed with a repair message that suggests no install", async () => {
  assert.match(INVALID_LOCK, /step_archive\/outputs\/browser-backend\.json/);
  assert.match(INVALID_LOCK, /--lock/);
  assert.doesNotMatch(INVALID_LOCK, INSTALL_HINT);
  const { probed_at: _omitted, ...withoutProbedAt } = validLock();
  const cases = {
    "invalid UTF-8": Buffer.from([0x7b, 0xff, 0x7d]),
    "byte order mark": `\uFEFF${JSON.stringify(validLock())}`,
    "truncated JSON": "{\"schema_version\":1,",
    "array": "[]",
    "null": "null",
    "schema version 2": { ...validLock(), schema_version: 2 },
    "unknown backend": { ...validLock(), selected: "chrome" },
    "auto is not a lock": { ...validLock(), selected: "auto" },
    "numeric tool version": { ...validLock(), tool_version: 7 },
    "oversized tool version": { ...validLock(), tool_version: "1".repeat(257) },
    "missing probed_at": withoutProbedAt,
    "free-text probed_at": { ...validLock(), probed_at: "yesterday" },
    "impossible probed_at": { ...validLock(), probed_at: "2026-13-45T99:00:00Z" },
    "oversized file": JSON.stringify({ ...validLock(), padding: "x".repeat(5000) })
  };
  for (const [name, value] of Object.entries(cases)) {
    const root = await makeWorkspace();
    await writeLock(root, value);
    await assert.rejects(readBackendLock(root), (error) => error.message === INVALID_LOCK, name);
  }

  const directoryLock = await makeWorkspace();
  await mkdir(join(directoryLock, ...LOCK_SEGMENTS), { recursive: true });
  await assert.rejects(readBackendLock(directoryLock), (error) => error.message === INVALID_LOCK, "directory at the lock path");
});

test("aliased locks are rejected instead of followed", async (t) => {
  const hardLinked = await makeWorkspace();
  await writeLock(hardLinked, validLock());
  await link(join(hardLinked, ...LOCK_SEGMENTS), join(hardLinked, "second-name.json"));
  await assert.rejects(readBackendLock(hardLinked), (error) => error.message === INVALID_LOCK, "hard link");

  const elsewhere = await makeWorkspace();
  await writeLock(elsewhere, validLock());
  const junctioned = await makeWorkspace();
  await mkdir(join(junctioned, "step_archive"));
  await makeDirectoryLink(join(elsewhere, "step_archive", "outputs"), join(junctioned, "step_archive", "outputs"));
  await assert.rejects(readBackendLock(junctioned), (error) => error.message === INVALID_LOCK, "linked outputs directory");

  const symlinked = await makeWorkspace();
  await mkdir(join(symlinked, "step_archive", "outputs"), { recursive: true });
  try { await symlink(join(elsewhere, ...LOCK_SEGMENTS), join(symlinked, ...LOCK_SEGMENTS), "file"); }
  catch (error) {
    t.diagnostic(`file symlinks unavailable: ${error.code}`);
    return;
  }
  await assert.rejects(readBackendLock(symlinked), (error) => error.message === INVALID_LOCK, "symlinked lock file");
});

test("writing a lock creates its directory and stores four keys as LF JSON", async () => {
  const root = await makeWorkspace();
  const lock = await writeBackendLock(root, { selected: "aside", tool_version: "1.26.916.1741", now: new Date("2026-09-23T01:02:03.000Z") });
  assert.deepEqual(lock, { schema_version: 1, selected: "aside", tool_version: "1.26.916.1741", probed_at: "2026-09-23T01:02:03.000Z" });
  const text = await readFile(join(root, ...LOCK_SEGMENTS), "utf8");
  assert.equal(text, `${JSON.stringify(lock, null, 2)}\n`);
  assert.equal(text.includes("\r"), false);
  assert.deepEqual(Object.keys(JSON.parse(text)), ["schema_version", "selected", "tool_version", "probed_at"]);
  assert.deepEqual(await readBackendLock(root), lock);

  const replaced = await writeBackendLock(root, { selected: "playwright", tool_version: "9".repeat(300) });
  assert.equal(replaced.tool_version.length, 256);
  assert.deepEqual(await readBackendLock(root), replaced);
  assert.deepEqual(await readdir(join(root, "step_archive", "outputs")), ["browser-backend.json"]);

  await assert.rejects(writeBackendLock(root, { selected: "auto" }), /Invalid browser backend/);
  await assert.rejects(writeBackendLock(root, { selected: "aside", tool_version: 3 }), /Invalid browser tool version/);
  await assert.rejects(writeBackendLock(root, { selected: "aside", now: "not a time" }), /Invalid browser probe time/);
  assert.deepEqual(await readBackendLock(root), replaced);
});

function availability(map) {
  const asked = [];
  return { asked, isAvailable: async (name) => { asked.push(name); return map[name] === true; } };
}

test("an explicit backend wins over any lock without consulting availability", async () => {
  for (const requested of ["playwright", "aside"]) {
    for (const lock of [null, validLock("aside"), validLock("playwright"), { selected: "chrome" }]) {
      const probe = availability({});
      assert.equal(await resolveBackend(requested, lock, probe.isAvailable), requested);
      assert.deepEqual(probe.asked, []);
    }
  }
  await assert.rejects(resolveBackend("chrome", null, () => true), /Invalid browser backend/);
});

test("auto follows the lock even when the other backend is available", async () => {
  for (const selected of ["aside", "playwright"]) {
    const probe = availability({ playwright: true, aside: true });
    assert.equal(await resolveBackend("auto", validLock(selected), probe.isAvailable), selected);
    assert.deepEqual(probe.asked, [selected]);
  }
});

test("an unavailable locked backend never falls back and names only itself", async () => {
  const aside = availability({ playwright: true, aside: false });
  await assert.rejects(resolveBackend("auto", validLock("aside"), aside.isAvailable), (error) => error.message === lockedUnavailableMessage("aside"));
  assert.deepEqual(aside.asked, ["aside"]);
  const asideMessage = lockedUnavailableMessage("aside");
  assert.match(asideMessage, /locked to aside/);
  assert.match(asideMessage, /aside --version/);
  assert.match(asideMessage, /do not install another browser backend or browser binaries/);
  assert.doesNotMatch(asideMessage, /playwright|chromium|browser-verifier|npm/i);

  const playwright = availability({ playwright: false, aside: true });
  await assert.rejects(resolveBackend("auto", validLock("playwright"), playwright.isAvailable), (error) => error.message === lockedUnavailableMessage("playwright"));
  assert.deepEqual(playwright.asked, ["playwright"]);
  const playwrightMessage = lockedUnavailableMessage("playwright");
  assert.match(playwrightMessage, /locked to playwright/);
  assert.match(playwrightMessage, /npm ci in browser-verifier\//);
  assert.match(playwrightMessage, /npx playwright install chromium/);
  assert.doesNotMatch(playwrightMessage, /aside/i);

  assert.throws(() => lockedUnavailableMessage("auto"), /Invalid browser backend/);
});

test("auto without a lock keeps the historical order and message", async () => {
  assert.equal(await resolveBackend("auto", null, availability({ playwright: true, aside: true }).isAvailable), "playwright");
  assert.equal(await resolveBackend("auto", null, availability({ aside: true }).isAvailable), "aside");
  await assert.rejects(resolveBackend("auto", null, availability({}).isAvailable), (error) => error.message === MISSING_TOOLS);
  assert.equal(MISSING_TOOLS, "Browser tools missing: install browser-verifier (cd browser-verifier && npm ci && npx playwright install chromium) or the Aside CLI (aside --version)");
});

test("verify-output fails closed on an invalid lock and still writes its report", async () => {
  const root = await projectWithDist();
  await writeLock(root, "{broken");
  // Run with no Aside CLI on PATH so that even a regression cannot drive the user's browser.
  const result = await cli(["--workspace", root, "--backend", "auto"], { env: envWithPath(await emptyDirectory()) });
  assert.equal(result.code, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.error, INVALID_LOCK);
  assert.equal(report.backend_selection, undefined);
  assert.equal(report.environment, undefined);
  const stored = JSON.parse(await readFile(join(root, "step_archive", "outputs", "browser-output.json"), "utf8"));
  assert.equal(stored.error, INVALID_LOCK);
});

test("verify-output with an aside lock and no Aside CLI fails without switching to Playwright", async () => {
  const root = await projectWithDist();
  await writeLock(root, validLock("aside"));
  const result = await cli(["--workspace", root], { env: envWithPath(await emptyDirectory()) });
  assert.equal(result.code, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.error, lockedUnavailableMessage("aside"));
  assert.doesNotMatch(report.error, INSTALL_HINT);
  assert.equal(report.environment, undefined, "no backend may run");
  const stored = JSON.parse(await readFile(join(root, "step_archive", "outputs", "browser-output.json"), "utf8"));
  assert.equal(stored.error, report.error);
  assert.deepEqual(await readBackendLock(root), validLock("aside"), "verification never rewrites the lock");
});

test("plain --probe keeps its historical output shape", async () => {
  const result = await cli(["--probe"], { env: envWithPath(await emptyDirectory()) });
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output), ["backends", "selected", "tool_version"]);
  assert.equal(output.backends.aside, false);
  assert.equal(result.code, output.selected ? 0 : 1);
});

test("--lock requires --probe and an explicit workspace", async () => {
  const cwd = await makeWorkspace();
  for (const args of [["--probe", "--lock"], ["--lock"], ["--lock", "--workspace", cwd], ["--workspace", cwd, "--lock", "--backend", "aside"]]) {
    const result = await cli(args, { env: envWithPath(await emptyDirectory()), cwd });
    assert.equal(result.code, 1, args.join(" "));
    assert.match(result.stderr, /--probe --lock --workspace/, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
  }
  assert.deepEqual(await readdir(cwd), []);
});

test("--probe --workspace reports the lock and refuses an unavailable locked backend", async () => {
  const root = await makeWorkspace();
  await writeLock(root, validLock("aside"));
  const result = await cli(["--probe", "--workspace", root], { env: envWithPath(await emptyDirectory()) });
  assert.equal(result.code, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.selected, null);
  assert.equal(output.backends.aside, false);
  assert.deepEqual(output.lock, validLock("aside"));
  assert.equal(output.error, lockedUnavailableMessage("aside"));
});

test("--probe --workspace fails closed on an invalid lock", async () => {
  const root = await makeWorkspace();
  await writeLock(root, "{broken");
  const result = await cli(["--probe", "--workspace", root], { env: envWithPath(await emptyDirectory()) });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /browser-backend\.json is invalid/);
});

test("--probe --lock records nothing when the requested backend is unavailable", async () => {
  const root = await makeWorkspace();
  const result = await cli(["--probe", "--lock", "--backend", "aside", "--workspace", root], { env: envWithPath(await emptyDirectory()) });
  assert.equal(result.code, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.selected, null);
  assert.equal(output.lock, null);
  assert.equal(output.previous, null);
  assert.match(output.error, /aside is not available/);
  assert.equal(existsSync(join(root, "step_archive")), false);
});

test("--probe --lock records the Step 3 backend, keeps it on auto and replaces it only explicitly", async () => {
  const env = envWithPath(await fakeAsideDirectory());
  const root = await makeWorkspace();

  const first = await cli(["--probe", "--lock", "--backend", "aside", "--workspace", root], { env });
  assert.equal(first.code, 0, first.stderr);
  const recorded = JSON.parse(first.stdout);
  assert.equal(recorded.selected, "aside");
  assert.equal(recorded.previous, null);
  assert.equal(recorded.lock.selected, "aside");
  assert.equal(recorded.lock.tool_version, recorded.tool_version);
  assert.deepEqual(await readBackendLock(root), recorded.lock);

  // Whether or not Playwright is installed here, auto keeps the locked Aside backend.
  const refreshed = await cli(["--probe", "--lock", "--workspace", root], { env });
  assert.equal(refreshed.code, 0, refreshed.stderr);
  const kept = JSON.parse(refreshed.stdout);
  assert.equal(kept.selected, "aside");
  assert.deepEqual(kept.previous, recorded.lock);
  assert.deepEqual(await readBackendLock(root), kept.lock);

  // The environment override counts as an explicit choice and wins over a Playwright lock.
  await writeLock(root, validLock("playwright"));
  const overridden = await cli(["--probe", "--workspace", root], { env: { ...env, HARNESS50_BROWSER_BACKEND: "aside" } });
  assert.equal(overridden.code, 0, overridden.stderr);
  assert.equal(JSON.parse(overridden.stdout).selected, "aside");
  assert.deepEqual(JSON.parse(overridden.stdout).lock, validLock("playwright"));

  // An explicit backend deliberately replaces the lock, which also repairs an invalid one.
  await writeLock(root, "{broken");
  const repaired = await cli(["--probe", "--lock", "--backend", "aside", "--workspace", root], { env });
  assert.equal(repaired.code, 0, repaired.stderr);
  assert.equal(JSON.parse(repaired.stdout).previous, "invalid");
  assert.equal((await readBackendLock(root)).selected, "aside");
});

// validate-tools hooks: the same lock read and the same hints on both hosts.
const HOOK_LINES = {
  playwrightDefault: "playwright: missing (cd browser-verifier && npm ci && npx playwright install chromium, or use the aside backend)",
  playwrightLockedAside: "playwright: missing (not needed: this project is locked to the aside backend by step_archive/outputs/browser-backend.json; keep it and do not install Playwright or Chromium)",
  playwrightLockedPlaywright: "playwright: missing (cd browser-verifier && npm ci && npx playwright install chromium; this project is locked to the playwright backend by step_archive/outputs/browser-backend.json)",
  asideLockedPlaywright: "aside: not needed: this project is locked to the playwright backend by step_archive/outputs/browser-backend.json; keep it and do not install the Aside CLI",
  asideLockedAside: "aside: this project is locked to the aside backend by step_archive/outputs/browser-backend.json; start the Aside app and check aside --version in this shell; do not install Playwright or Chromium"
};

test("hook hint texts are backend-aware", () => {
  assert.doesNotMatch(HOOK_LINES.playwrightLockedAside, /npm ci|npx|playwright install/i);
  assert.doesNotMatch(HOOK_LINES.asideLockedAside, /npm ci|npx|playwright install/i);
  assert.doesNotMatch(HOOK_LINES.playwrightLockedPlaywright, /aside/i);
});

test("validate-tools hooks carry identical lock reads and hint texts", async () => {
  const ps1 = await readFile(join(repoRoot, "hooks", "validate-tools.ps1"), "utf8");
  const sh = await readFile(join(repoRoot, "hooks", "validate-tools.sh"), "utf8");
  const oneLiner = (text) => text.match(/try\{const j=JSON\.parse[^"]*catch\(e\)\{\}/g);
  assert.equal(oneLiner(ps1)?.length, 1);
  assert.deepEqual(oneLiner(sh), oneLiner(ps1));
  const hints = (text, variable) => Object.values(HOOK_LINES).map((line) => (
    text.includes(line.replace("step_archive/outputs/browser-backend.json", variable))
  ));
  assert.deepEqual(hints(ps1, "$lockFile"), [true, true, true, true, true]);
  assert.deepEqual(hints(sh, "$LOCK_FILE"), [true, true, true, true, true]);
});

async function hookFixture(lock) {
  const base = await makeWorkspace();
  const plugin = join(base, "plugin");
  const project = join(base, "project");
  await mkdir(join(plugin, "hooks"), { recursive: true });
  await mkdir(join(plugin, "browser-verifier"));
  await mkdir(project);
  for (const name of ["validate-tools.ps1", "validate-tools.sh"]) {
    await copyFile(join(repoRoot, "hooks", name), join(plugin, "hooks", name));
  }
  if (lock) await writeLock(project, lock);
  return { plugin, project };
}

async function runHook(fixture, tool) {
  const nodeDirectory = dirname(process.execPath);
  if (process.platform === "win32") {
    const system32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
    return run(join(system32, "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(fixture.plugin, "hooks", "validate-tools.ps1"), "-Tool", tool],
      { cwd: fixture.project, env: { ...envWithPath(nodeDirectory, system32), CLAUDE_PROJECT_DIR: fixture.project } });
  }
  return run("bash", [join(fixture.plugin, "hooks", "validate-tools.sh"), tool],
    { cwd: fixture.project, env: { ...envWithPath(nodeDirectory, "/usr/bin", "/bin"), CLAUDE_PROJECT_DIR: fixture.project } });
}

const lines = (output) => output.replace(/\r\n/g, "\n").trim().split("\n").map((line) => line.trimEnd());

test("validate-tools playwright hints follow the Step 3 lock", async (t) => {
  const baseline = await runHook(await hookFixture(null), "playwright");
  if (baseline.code === 0) {
    t.skip("playwright resolves in this environment; the missing-tool hints cannot be exercised");
    return;
  }
  assert.equal(baseline.code, 1, baseline.stderr);
  assert.deepEqual(lines(baseline.stdout), [HOOK_LINES.playwrightDefault]);

  const lockedAside = await runHook(await hookFixture(validLock("aside")), "playwright");
  assert.equal(lockedAside.code, 1, lockedAside.stderr);
  assert.deepEqual(lines(lockedAside.stdout), [HOOK_LINES.playwrightLockedAside]);

  const lockedPlaywright = await runHook(await hookFixture(validLock("playwright")), "playwright");
  assert.equal(lockedPlaywright.code, 1, lockedPlaywright.stderr);
  assert.deepEqual(lines(lockedPlaywright.stdout), [HOOK_LINES.playwrightLockedPlaywright]);

  const invalid = await runHook(await hookFixture({ ...validLock("aside"), schema_version: 2 }), "playwright");
  assert.deepEqual(lines(invalid.stdout), [HOOK_LINES.playwrightDefault]);
});

test("validate-tools aside hints follow the Step 3 lock", async (t) => {
  const baseline = await runHook(await hookFixture(null), "aside");
  if (baseline.code === 0) {
    t.skip("aside resolves in this environment; the missing-tool hints cannot be exercised");
    return;
  }
  assert.notEqual(baseline.code, 0);
  assert.doesNotMatch(baseline.stdout, /locked/);

  const lockedPlaywright = await runHook(await hookFixture(validLock("playwright")), "aside");
  assert.equal(lockedPlaywright.code, baseline.code);
  assert.equal(lines(lockedPlaywright.stdout).at(-1), HOOK_LINES.asideLockedPlaywright);

  const lockedAside = await runHook(await hookFixture(validLock("aside")), "aside");
  assert.equal(lockedAside.code, baseline.code);
  assert.equal(lines(lockedAside.stdout).at(-1), HOOK_LINES.asideLockedAside);
});
