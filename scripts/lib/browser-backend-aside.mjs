// Aside backend for scripts/verify-output.mjs (see the dispatcher for the contract).
// Describes the same unit sequence inside the user's Aside Browser through
// `aside repl`: one CLI call ("chunk") per scenario x viewport x unit, each against a fresh
// 127.0.0.1 origin (fresh storage) that serves the artifact with an injected bridge script.
// Measured constraints (docs/BROWSER-TOOLS.md): no file://, 120 s per call, output only inside
// the CLI session directory, shared profile, fixed 1440x900 tab (viewports are iframes).
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSafe, sha256 } from './quality-files.mjs';
import { requireHostNetworkIsolation as requireNativeIsolation, testOnly as isolationTestOnly } from './host-network-isolation.mjs';
import { BLANK_PAGE, HARNESS_PREFIX, bridgeScript, chunkScript, hostPage } from './aside/page-scripts.mjs';

const ASIDE = 'aside';
const DEADLINE = 'Browser verification exceeded its deadline';
const MISSING_ASIDE = 'Browser tools missing: install the Aside CLI (aside --version) and start the Aside app';
const MISSING_AXE = 'Browser tools missing: run npm ci in the plugin checkout (axe-core)';
const RESULT_PREFIX = '__H50__';
const AXE_SHA256 = 'c24f097bd2f451d4f933e8bc7d8d539f8672a2ebcb5cc9f9f3eec8ca9470a0c1';
const MAX_TOTAL_MS = 600000;
export function createAsideBudget(timeoutMs, now = Date.now) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000 || typeof now !== 'function') throw new Error('Invalid Aside execution budget');
  const deadline = now() + MAX_TOTAL_MS;
  return Object.freeze({ total_timeout_ms: MAX_TOTAL_MS, remaining: () => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('Aside aggregate verification budget exceeded');
    return Math.min(timeoutMs, remaining);
  } });
}
// HTTP CSP is imposed by the host response, never generated markup. It does not
// block all transports: WebRTC STUN and preconnect bypass it in current Aside.
// Native execution therefore stays disabled until a verified per-tab host egress
// adapter exists. No browser constructor masking or workspace attestation can
// establish that capability.
// Browser sandbox and a distinct randomized loopback host bound the application's
// effects while retaining same-origin storage and Navigation API within the app.
const CSP_APP = "default-src data: blob:; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; sandbox allow-scripts allow-same-origin";
const CSP_HOST = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; object-src 'none'; worker-src 'none'";
const PERMISSIONS_POLICY = 'accelerometer=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), microphone=(), payment=(), publickey-credentials-create=(), publickey-credentials-get=(), serial=(), usb=()';

function exec(args, { timeout, maxBuffer = 16 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    execFile(ASIDE, args, { windowsHide: true, maxBuffer, timeout, encoding: 'utf8' }, (error, stdout, stderr) => resolve({ error, stdout: stdout ?? '', stderr: stderr ?? '' }));
  });
}

export const testOnly = Object.freeze({
  registerFakeExecutor(execute) {
    if (typeof execute !== 'function' || execute === exec) throw new Error('Expected a trusted fake unit-test executor');
    return isolationTestOnly.registerFakeAsideExecutor(execute);
  }
});
function requireHostNetworkIsolation(execute) {
  requireNativeIsolation('aside', { execute });
}

export async function available() {
  try {
    const { error, stdout } = await exec(['--version'], { timeout: 10000 });
    return !error && /\d/.test(stdout);
  } catch { return false; }
}

let versionCache;
export async function toolVersion() {
  try {
    versionCache ??= await exec(['--version'], { timeout: 10000 }).then(({ error, stdout }) => (!error && stdout.trim()) || null);
    return versionCache;
  } catch { return null; }
}

export function verifyAxeBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024 || sha256(bytes) !== AXE_SHA256) throw new Error('axe-core pinned content integrity check failed');
  return bytes;
}

async function loadAxe() {
  let bytes;
  try { bytes = await readSafe(fileURLToPath(new URL('../../', import.meta.url)), 'node_modules/axe-core/axe.min.js', 2 * 1024 * 1024); }
  catch { throw new Error(MISSING_AXE); }
  return verifyAxeBytes(bytes);
}

// Places the bridge right after <head …> (else after <html …>, else first) without parsing
// the untrusted document; byte offsets come from the latin1 view so the artifact bytes are kept.
// Tags inside `<!-- … -->` are skipped, as the route contract skips comments before the head.
function inject(bytes, bridge) {
  const text = bytes.toString('latin1');
  const comments = [];
  let scan = text.indexOf('<!--');
  while (scan >= 0) {
    const end = text.indexOf('-->', scan + 4);
    comments.push([scan, end < 0 ? text.length : end + 3]);
    scan = end < 0 ? -1 : text.indexOf('<!--', end + 3);
  }
  const commented = index => comments.some(([start, end]) => index >= start && index < end);
  const locate = pattern => { for (const match of text.matchAll(pattern)) if (!commented(match.index)) return match; return null; };
  const tag = locate(/<head(?:\s(?:[^"'>]|"[^"]*"|'[^']*')*)?>/gi) ?? locate(/<html(?:\s(?:[^"'>]|"[^"]*"|'[^']*')*)?>/gi);
  const at = tag ? tag.index + tag[0].length : 0;
  return Buffer.concat([bytes.subarray(0, at), Buffer.from(bridge, 'utf8'), bytes.subarray(at)]);
}

export async function startVerificationServers({ document, allowed, axe }, { execute = exec, testBindHost } = {}) {
  requireHostNetworkIsolation(execute);
  // The existing registered-fake gate must succeed before this portable unit
  // fixture option is inspected. No native adapter can use it to open a server.
  if (testBindHost !== undefined && testBindHost !== 'localhost') throw new Error('Invalid trusted HTTP fixture bind host');
  const state = { blocked: 0, application_requests: 0, host_requests: 0 };
  const html = (response, body, csp) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp, 'permissions-policy': PERMISSIONS_POLICY,
      'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-length': Buffer.byteLength(body) });
    response.end(body);
  };
  // Cookie scope ignores ports. A fresh IP host, not merely a fresh port, avoids
  // sharing the user's localhost cookies with generated JavaScript.
  const ipBytes = randomBytes(3);
  const appHost = testBindHost ?? `127.${ipBytes[0] || 2}.${ipBytes[1] || 2}.${ipBytes[2] || 2}`;
  let hostOrigin, origin;
  const denied = response => { state.blocked++; response.writeHead(404, { 'cache-control': 'no-store' }); response.end(); };
  const handler = application => (request, response) => {
    if (application) state.application_requests++; else state.host_requests++;
    let url;
    try { url = new URL(request.url, 'http://127.0.0.1'); } catch { url = null; }
    const pathname = url?.pathname, size = name => Math.min(4096, Math.max(1, Math.trunc(Number(url.searchParams.get(name))) || 1));
    if (!url || request.method !== 'GET' || request.headers.host !== new URL(application ? origin : hostOrigin).host) return denied(response);
    if (application) {
      if (!url.search && allowed.has(pathname)) html(response, document, `${CSP_APP}; frame-ancestors ${hostOrigin}`);
      else denied(response);
    } else if (pathname === `${HARNESS_PREFIX}host.html`) html(response, hostPage(size('w'), size('h')), `${CSP_HOST}; frame-src 'self' ${origin}`);
    else if (pathname === `${HARNESS_PREFIX}blank.html`) html(response, BLANK_PAGE, `${CSP_HOST}; frame-src 'none'`);
    else if (pathname === `${HARNESS_PREFIX}axe.min.js`) { response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'content-length': axe.length }); response.end(axe); }
    else denied(response);
  };
  const appServer = createServer(handler(true)), hostServer = createServer(handler(false));
  const close = server => new Promise(done => {
    server.closeAllConnections();
    if (!server.listening) return done();
    server.close(() => done());
  });
  const listen = (server, host) => new Promise((resolve, reject) => {
    server.on('connection', socket => socket.setNoDelay(true));
    server.once('error', reject);
    server.listen(0, host, () => resolve(`http://${host}:${server.address().port}`));
  });
  try {
    origin = await listen(appServer, appHost);
    hostOrigin = await listen(hostServer, '127.0.0.1');
    return { origin, hostOrigin, state, close: () => Promise.all([close(appServer), close(hostServer)]) };
  } catch (error) { await Promise.all([close(appServer), close(hostServer)]); throw error; }
}

const stripAnsi = text => text.replace(/\x1b\[[0-9;]*m/g, '');

function parseResult(stdout) {
  for (const line of stripAnsi(stdout).split(/\r?\n/)) {
    if (!line.startsWith(RESULT_PREFIX)) continue;
    try { return JSON.parse(line.slice(RESULT_PREFIX.length)); } catch { return null; }
  }
  return null;
}

function failureMessage(error, stdout, stderr) {
  const text = stripAnsi(`${stderr}\n${stdout}`);
  const notRunning = /Aside isn't running[^\r\n]*/.exec(text);
  if (notRunning) return notRunning[0].trim();
  if (error?.code === 'ENOENT') return MISSING_ASIDE;
  const first = text.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('✔') && !/^\[ok \|/.test(line));
  return `aside repl failed${first ? `: ${first.slice(0, 300)}` : ''}`;
}

async function screenshotBytes(sessionDir, name) {
  if (typeof sessionDir !== 'string' || !isAbsolute(sessionDir)) throw new Error('Aside session directory was not reported');
  const path = join(sessionDir, 'artifacts', name);
  let bytes;
  try { bytes = await readFile(path); }
  catch { throw new Error('Screenshot was not produced'); }
  await unlink(path).catch(() => {});
  if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('Screenshot was not a PNG');
  return bytes;
}

// Dependency seams are for trusted host tests only. Artifact bytes/JSON never
// select an executor, a clock, a dependency loader or a larger budget.
export async function run(ctx, { execute = exec, now = Date.now, readAxe = loadAxe, getToolVersion = toolVersion } = {}) {
  const { root, bytes, routing, report, timeoutMs, viewports, origin: contractOrigin, routeUrl, passes, screenshotPath, writeSafe, ROUTE_ENTRY_PATH, UNKNOWN_ROUTE_PATH } = ctx;
  const budget = createAsideBudget(timeoutMs, now);
  try { requireHostNetworkIsolation(execute); }
  catch (error) {
    if (report) report.environment = { backend: 'aside', isolation: 'unsupported', network_isolation: 'missing-host-all-transport-egress',
      total_timeout_ms: budget.total_timeout_ms, cleanup_timeout_ms: 15000 };
    throw error;
  }
  const axe = await readAxe();
  budget.remaining();
  const tool_version = await getToolVersion();
  budget.remaining();
  report.environment = { backend: 'aside', isolation: 'cross-origin-sandbox-in-shared-profile', deadline_scope: 'aggregate-and-chunk', total_timeout_ms: budget.total_timeout_ms,
    cleanup_timeout_ms: 15000, viewport_mode: 'iframe', screenshot_mode: 'viewport-clip',
    browser: null, dpr: null, color_scheme: null, reduced_motion: null, language: null, tool_version };
  const allowed = new Set([ROUTE_ENTRY_PATH, ...(routing.mode === 'history' ? [...routing.routes.map(route => route.path), UNKNOWN_ROUTE_PATH] : [])]);
  const documents = { available: inject(bytes, bridgeScript(false)), unavailable: inject(bytes, bridgeScript(true)) };
  // The chunk script rebuilds route URLs on its own origin; refuse silently diverging schemes.
  for (const path of [...routing.routes.map(route => route.path), UNKNOWN_ROUTE_PATH]) {
    if (routeUrl(routing, path) !== `${contractOrigin}${routing.mode === 'hash' ? `${ROUTE_ENTRY_PATH}#${path}` : path}`) throw new Error('Aside backend cannot map the route URL scheme');
  }

  // deadline_scope is 'chunk': timeoutMs bounds each CLI call. Measured: a chunk killed at the
  // deadline leaves its tab visible for about 40 s until the Aside daemon reaps the session.
  async function chunk({ unavailable, viewport, unit, routeIndex, shotName }) {
    budget.remaining();
    const server = await startVerificationServers({ document: unavailable ? documents.unavailable : documents.available, allowed, axe }, { execute });
    const started = Date.now();
    try {
      // The dispatcher's ORIGIN/routeUrl name the routes; this chunk serves them from its own origin.
      const script = chunkScript({ routing, unavailable, origin: server.origin, hostOrigin: server.hostOrigin, width: viewport.width, height: viewport.height, unit, routeIndex, shotName,
        entryPath: ROUTE_ENTRY_PATH, unknownPath: UNKNOWN_ROUTE_PATH });
      const { error, stdout, stderr } = await execute(['repl', script], { timeout: budget.remaining() });
      budget.remaining();
      if (error?.killed) throw new Error(DEADLINE);
      const result = parseResult(stdout);
      if (process.env.HARNESS50_ASIDE_DEBUG) process.stderr.write(`[aside] ${unit}${routeIndex >= 0 ? `#${routeIndex}` : ''} exit=${error?.code ?? 0} stdout=${JSON.stringify(stripAnsi(stdout).slice(-1500))} stderr=${JSON.stringify(stderr.slice(0, 500))}\n`);
      if (!result) throw new Error(failureMessage(error, stdout, stderr));
      if (!result.ok) {
        ctx.onChunk?.({ unavailable, viewport: viewport.name, unit, routeIndex, ms: Date.now() - started, timings: result.timings, error: result.error });
        throw new Error(result.error || 'aside repl failed');
      }
      if (report.environment.browser === null && result.env) {
        const chrome = /Chrome\/(\d+)/.exec(result.env.ua ?? '');
        Object.assign(report.environment, { browser: chrome ? `Chrome/${chrome[1]}` : null, dpr: result.env.dpr ?? null,
          color_scheme: result.env.dark ? 'dark' : 'light', reduced_motion: result.env.reduced_motion ?? null, language: result.env.language ?? null });
      }
      const errors = [...result.errors];
      for (let count = 0; count < server.state.blocked && errors.length < 100; count++) errors.push('requestfailed');
      const value = { ...result.result, errors, blocked_requests: result.blocked + server.state.blocked };
      if (shotName) value.screenshot_bytes = await screenshotBytes(result.pwd, shotName);
      ctx.onChunk?.({ unavailable, viewport: viewport.name, unit, routeIndex, ms: Date.now() - started, timings: result.timings });
      return value;
    } finally { await server.close(); }
  }

  for (const scenario of [{ unavailable: false, viewports: report.viewports }, { unavailable: true, viewports: report.compatibility.navigation_api_unavailable.viewports }]) {
    for (const viewport of viewports) {
      const shotName = `h50-${scenario.unavailable ? 'compat' : 'main'}-${viewport.name}-${randomBytes(4).toString('hex')}.png`;
      const { screenshot_bytes, ...initial } = await chunk({ unavailable: scenario.unavailable, viewport, unit: 'initial', routeIndex: -1, shotName });
      initial.screenshot = screenshotPath(scenario.unavailable, viewport.name);
      await writeSafe(root, initial.screenshot, screenshot_bytes);
      const view = { ...viewport, ...initial, routes: [], pass: false };
      scenario.viewports.push(view);
      for (const [routeIndex] of routing.routes.entries()) {
        const result = await chunk({ unavailable: scenario.unavailable, viewport, unit: 'route', routeIndex, shotName: null });
        result.pass = passes(result);
        view.routes.push(result);
        view.errors.push(...result.errors);
        view.blocked_requests += result.blocked_requests;
        view.violations.push(...result.violations);
        view.horizontal_overflow ||= result.horizontal_overflow;
        view.accessibility_incomplete = [...new Set([...view.accessibility_incomplete, ...result.accessibility_incomplete])];
      }
      view.pass = passes(view) && (view.focusable_elements === 0 || view.keyboard_focus) && view.routes.every(route => route.pass);
    }
  }
}
