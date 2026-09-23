#!/usr/bin/env node
// Browser verification dispatcher. The measurement itself lives in a backend module:
//   playwright -> ../browser-verifier/backend-playwright.mjs (fresh headless Chromium contexts; CI)
//   aside      -> ./lib/browser-backend-aside.mjs (the user's Aside Browser via `aside repl`)
// Backend interface: `available()` -> boolean (cheap, never throws) and `run(ctx)` which fills
// report.viewports / report.compatibility.navigation_api_unavailable.viewports, writes the four
// screenshots, sets report.environment and throws Error(message) on any failure.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { physicalWorkspace, readSafe, writeSafe, sha256 } from './lib/quality-files.mjs';
import { readRouteManifestBytes, ROUTE_ENTRY_PATH, UNKNOWN_ROUTE_PATH } from './lib/route-contract.mjs';
import { readBackendLock, resolveBackend, writeBackendLock } from './lib/browser-backend-lock.mjs';

export const ENTRY = 'http://harness50.local/index.html';
export const ARTIFACT = 'dist/index.html';
export const REPORT = 'step_archive/outputs/browser-output.json';

export const ORIGIN = 'http://harness50.local';
export const VIEWPORTS = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }];
export const routeUrl = (routing, path) => routing.mode === 'hash' ? `${ENTRY}#${path}` : `${ORIGIN}${path}`;
export const screenshotPath = (unavailable, viewportName) => `step_archive/screenshots/verified-${unavailable ? 'navigation-api-unavailable-' : ''}${viewportName}.png`;

export function passes(metrics) {
  return metrics.errors.length === 0 && metrics.blocked_requests === 0 && metrics.violations.length === 0 && !metrics.horizontal_overflow && metrics.visible_text_length > 0;
}

const BACKENDS = ['auto', 'playwright', 'aside'];
const BACKEND_MODULES = { playwright: '../browser-verifier/backend-playwright.mjs', aside: './lib/browser-backend-aside.mjs' };
const MISSING_PLAYWRIGHT = 'Browser tools missing: run npm ci in the plugin checkout, then npx playwright install chromium';

function loadBackend(name) {
  return import(BACKEND_MODULES[name]);
}

async function backendAvailable(name) {
  try { return (await (await loadBackend(name)).available()) === true; }
  catch { return false; }
}

function validateBackend(backend) {
  if (!BACKENDS.includes(backend)) throw new Error('Invalid browser backend');
  return backend;
}

// Reports which backends can run here without launching a browser. Without a workspace the
// output is `{ backends, selected, tool_version }` and `auto` uses the historical order. With a
// workspace, `auto` honours its Step 3 lock (see ./lib/browser-backend-lock.mjs) and the result
// adds `lock` (plus `error` when nothing may run); `lock: true` also records the selection.
export async function probeBackends(backend = process.env.HARNESS50_BROWSER_BACKEND || 'auto', { workspaceRoot, lock: record = false } = {}) {
  validateBackend(backend);
  if (record && workspaceRoot === undefined) throw new Error('--lock requires --workspace "<project-root>"');
  const root = workspaceRoot === undefined ? null : await physicalWorkspace(workspaceRoot);
  // `auto` fails closed on an invalid lock; an explicit backend ignores (and may replace) it.
  const current = root === null ? null : backend === 'auto' ? await readBackendLock(root) : await readBackendLock(root).catch(() => 'invalid');
  const backends = { playwright: await backendAvailable('playwright'), aside: await backendAvailable('aside') };
  let selected = null, error = null;
  if (backend !== 'auto') {
    selected = backends[backend] ? backend : null;
  } else {
    try { selected = await resolveBackend('auto', current, name => backends[name]); }
    catch (reason) { error = reason.message; }
  }
  let tool_version = null;
  if (selected) {
    try { const module = await loadBackend(selected); tool_version = typeof module.toolVersion === 'function' ? (await module.toolVersion()) ?? null : null; }
    catch { tool_version = null; }
  }
  if (root === null) return { backends, selected, tool_version };
  const result = { backends, selected, tool_version, lock: current };
  if (record) {
    result.previous = current;
    if (selected) result.lock = await writeBackendLock(root, { selected, tool_version });
  }
  if (!selected) result.error = error ?? `Browser backend ${backend} is not available`;
  return result;
}

async function selectBackend(backend, root) {
  if (backend !== 'auto') return { name: backend, module: await loadBackend(backend), source: 'explicit' };
  const lock = await readBackendLock(root);
  const name = await resolveBackend('auto', lock, backendAvailable);
  return { name, module: await loadBackend(name), source: lock ? 'lock' : 'auto-order' };
}

export async function verifyOutput(workspaceRoot, { timeoutMs = 60000, executablePath, backend = process.env.HARNESS50_BROWSER_BACKEND || 'auto' } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('Invalid browser timeout');
  if (executablePath !== undefined && (typeof executablePath !== 'string' || !executablePath.trim())) throw new Error('Invalid browser executable path');
  validateBackend(backend);
  const root = await physicalWorkspace(workspaceRoot);
  const report = { schema_version: 3, generated_at: new Date().toISOString(), artifact_path: ARTIFACT, verdict: 'FAIL', viewports: [],
    compatibility: { navigation_api_unavailable: { viewports: [] } } };
  let selected = backend;
  try {
    const bytes = await readSafe(root, ARTIFACT);
    const routing = readRouteManifestBytes(bytes);
    report.routing = routing;
    report.artifact_sha256 = sha256(bytes);
    const { name, module, source } = await selectBackend(backend, root);
    selected = name;
    report.backend_selection = { requested: backend, source, backend: name };
    await module.run({ root, bytes, routing, report, timeoutMs, executablePath, viewports: VIEWPORTS, entry: ENTRY, origin: ORIGIN,
      routeUrl, passes, screenshotPath, readSafe, writeSafe, sha256, ROUTE_ENTRY_PATH, UNKNOWN_ROUTE_PATH });
    if (sha256(await readSafe(root, ARTIFACT)) !== report.artifact_sha256) throw new Error('HTML changed during browser verification');
    const allViews = [...report.viewports, ...report.compatibility.navigation_api_unavailable.viewports];
    if (!report.error && allViews.length === 4 && allViews.every(view => view.pass)) report.verdict = 'PASS';
  } catch (error) { report.error = selected === 'playwright' && error.code === 'ERR_MODULE_NOT_FOUND' ? MISSING_PLAYWRIGHT : error.message; }
  await writeSafe(root, REPORT, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const offset = args.indexOf('--workspace');
  const root = offset === -1 ? process.cwd() : args[offset + 1];
  const executableOffset = args.indexOf('--executable-path');
  const executablePath = executableOffset === -1 ? undefined : args[executableOffset + 1];
  const backendOffset = args.indexOf('--backend');
  const backend = backendOffset === -1 ? undefined : args[backendOffset + 1];
  const timeoutOffset = args.indexOf('--timeout');
  const timeout = timeoutOffset === -1 ? undefined : args[timeoutOffset + 1];
  // --timeout is validated by verifyOutput (integer 1000..120000 ms; per chunk under the Aside backend).
  const timeoutMs = timeout === undefined ? undefined : /^\d{1,7}$/.test(timeout) ? Number(timeout) : NaN;
  const probe = args.includes('--probe');
  const lock = args.includes('--lock');
  if (!root || (executableOffset !== -1 && !executablePath) || (backendOffset !== -1 && !backend) || (timeoutOffset !== -1 && !timeout)) { console.error('--workspace, --executable-path, --backend and --timeout require values'); process.exitCode = 1; }
  // The lock always lands in an explicitly named project, never in the checkout's own directory.
  else if (lock && (!probe || offset === -1)) { console.error('--lock records the Step 3 backend: use --probe --lock --workspace "<project-root>" [--backend playwright|aside]'); process.exitCode = 1; }
  else if (probe) probeBackends(backend, offset === -1 ? {} : { workspaceRoot: root, lock }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.selected ? 0 : 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
  else verifyOutput(root, { executablePath, ...(backend ? { backend } : {}), ...(timeoutMs !== undefined ? { timeoutMs } : {}) }).then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.verdict === 'PASS' ? 0 : 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
