import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import { makeWorkspace } from './helpers/workspace.mjs';
import { runQualityGate } from '../../scripts/lib/quality.mjs';
import { hostPage, chunkScript } from '../../scripts/lib/aside/page-scripts.mjs';
import { startVerificationServers } from '../../scripts/lib/browser-backend-aside.mjs';
import * as asideBackend from '../../scripts/lib/browser-backend-aside.mjs';
import { commandEnvironment } from '../../scripts/lib/quality.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
import { verifyOutput } from '../../scripts/verify-output.mjs';
import * as playwrightBackend from '../../browser-verifier/backend-playwright.mjs';
import { routeManifestScript } from './helpers/routing.mjs';

const summary = { total: Object.fromEntries(['lines', 'statements', 'functions', 'branches'].map(name => [name, { total: 10, covered: 9 }])) };
const coverage = `require('node:fs').writeFileSync('coverage/coverage-summary.json',${JSON.stringify(JSON.stringify(summary))});`;
async function fixture(testCode, lintCode = 'process.exit(0)') {
  const root = await makeWorkspace();
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'coverage'));
  await mkdir(join(root, 'step_archive', 'outputs'), { recursive: true });
  await writeFile(join(root, 'src', 'app.js'), 'export const answer = 42;');
  const checks = Object.fromEntries(['test', 'lint', 'typecheck', 'security'].map(name => [name, { command: [process.execPath, '-e', name === 'test' ? coverage + testCode : name === 'lint' ? lintCode : 'process.exit(0)'] }]));
  await writeFile(join(root, 'harness50.quality.json'), JSON.stringify({ schema_version: 1, checks, coverage: { path: 'coverage/coverage-summary.json', minimum: 85 } }));
  return root;
}

test('quality child commands cannot inherit parent API credentials or runtime injection variables', async () => {
  process.env.HARNESS_OWASP_TEST_API_KEY = 'synthetic-credential-do-not-inherit';
  process.env.HARNESS_OWASP_TEST_SECRET = 'synthetic-sensitive-value';
  const root = await fixture("if(process.env.HARNESS_OWASP_TEST_API_KEY || process.env.HARNESS_OWASP_TEST_SECRET) process.exit(19);");
  try {
    const result = await runQualityGate(root);
    assert.equal(result.checks.test.exit_code, 0, 'child received a synthetic parent credential');
    assert.equal(result.verdict, 'PASS');
  } finally {
    delete process.env.HARNESS_OWASP_TEST_API_KEY;
    delete process.env.HARNESS_OWASP_TEST_SECRET;
  }
});

test('changed quality configuration stops the next executable before it writes an attack marker', async () => {
  const root = await fixture("const fs=require('node:fs'); const p='harness50.quality.json'; fs.appendFileSync(p,' ');", "require('node:fs').writeFileSync('step_archive/outputs/attacker-ran','bad');");
  const result = await runQualityGate(root);
  assert.equal(result.verdict, 'FAIL');
  assert.match(result.error, /config.*changed|changed.*config/i);
  await assert.rejects(access(join(root, 'step_archive', 'outputs', 'attacker-ran')), { code: 'ENOENT' });
});

test('changed source stops subsequent quality commands before further side effects', async () => {
  const root = await fixture("require('node:fs').appendFileSync('src/app.js','\\n// tampered');", "require('node:fs').writeFileSync('step_archive/outputs/attacker-ran','bad');");
  const result = await runQualityGate(root);
  assert.equal(result.verdict, 'FAIL');
  await assert.rejects(access(join(root, 'step_archive', 'outputs', 'attacker-ran')), { code: 'ENOENT' });
});

test('Aside application frame is sandboxed and distinct from its privileged host origin', () => {
  const page = hostPage(1440, 900);
  assert.match(page, /sandbox="allow-scripts allow-same-origin"/);
  assert.match(page, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(page, /allow-top-navigation|allow-popups|allow-forms|allow-downloads/);
  const script = chunkScript({ routing: { schema_version: 1, mode: 'hash', fallback: 'home', routes: [{ id: 'home', path: '/home' }] }, unavailable: false,
    origin: 'http://127.22.33.44:31002', hostOrigin: 'http://127.0.0.1:31001', width: 1440, height: 900, unit: 'initial', routeIndex: -1, shotName: 'safe.png', entryPath: '/index.html', unknownPath: '/unknown' });
  assert.match(script, /127\.0\.0\.1:31001/);
  assert.match(script, /127\.22\.33\.44:31002/);
  assert.match(script, /next\.setAttribute\('sandbox',/);
  assert.throws(() => chunkScript({ routing: { schema_version: 1, mode: 'hash', fallback: 'home', routes: [{ id: 'home', path: '/home' }] }, unavailable: false,
    origin: 'http://127.0.0.1:31002', hostOrigin: 'http://127.0.0.1:31001', width: 1440, height: 900, unit: 'initial', routeIndex: -1, shotName: 'safe.png', entryPath: '/index.html', unknownPath: '/unknown' }), /distinct.*host|cookie/i);
});

test('child environment rejects runtime loaders and credential variables regardless of casing', () => {
  const env = commandEnvironment({ Path: 'safe-system-path', SystemRoot: 'C:/Windows', NODE_OPTIONS: '--require attacker.js', PYTHONPATH: 'attacker',
    LD_PRELOAD: 'attacker.so', TYPESAFE_API_KEY: 'synthetic', GITHUB_TOKEN: 'synthetic', NPM_CONFIG_USERCONFIG: 'attacker.npmrc', harmless_but_not_allowlisted: 'value' });
  assert.deepEqual(env, { Path: 'safe-system-path', SystemRoot: 'C:/Windows' });
});

test('aggregate quality budget stops the next configured command', async () => {
  const root = await fixture('const end=Date.now()+150; while(Date.now()<end){};', "require('node:fs').writeFileSync('step_archive/outputs/attacker-ran','bad');");
  const result = await runQualityGate(root, { timeoutMs: 2000, totalTimeoutMs: 200 });
  assert.equal(result.verdict, 'FAIL');
  assert.match(result.error, /budget/i);
  await assert.rejects(access(join(root, 'step_archive', 'outputs', 'attacker-ran')), { code: 'ENOENT' });
  await assert.rejects(runQualityGate(root, { totalTimeoutMs: 480001 }), /total quality timeout/);
});

test('explicit host config hash mismatch blocks the first configured executable', async () => {
  const root = await fixture("require('node:fs').writeFileSync('step_archive/outputs/attacker-ran','bad');");
  const result = await runQualityGate(root, { approvedConfigSha256: '0'.repeat(64) });
  assert.equal(result.verdict, 'FAIL');
  assert.match(result.error, /approved.*config|config.*approval/i);
  await assert.rejects(access(join(root, 'step_archive', 'outputs', 'attacker-ran')), { code: 'ENOENT' });
  const hash = sha256(await readFile(join(root, 'harness50.quality.json')));
  assert.equal((await runQualityGate(root, { approvedConfigSha256: hash })).verdict, 'PASS');
});

test('quality CLI prepare renders exact action manifest without executing a command', async () => {
  const root = await fixture("require('node:fs').writeFileSync('step_archive/outputs/attacker-ran','bad');");
  const cli = fileURLToPath(new URL('../../scripts/quality-gate.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, [cli, '--workspace', root, '--prepare'], { windowsHide: true, timeout: 10000 });
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.action, 'execute-quality-config');
  assert.equal(manifest.config_sha256, sha256(await readFile(join(root, 'harness50.quality.json'))));
  assert.deepEqual(Object.keys(manifest.checks), ['test', 'lint', 'typecheck', 'security']);
  assert.ok(Array.isArray(manifest.environment_keys));
  assert.equal(manifest.os_sandbox, false);
  assert.equal(manifest.requires_native_host_authorization, true);
  await assert.rejects(access(join(root, 'step_archive', 'outputs', 'attacker-ran')), { code: 'ENOENT' });
});

test('known credential literals are rejected before argv execution or report disclosure', async () => {
  const credential = 'sk-' + 'SyntheticCredentialValue1234567890';
  const root = await fixture(`require('node:fs').writeFileSync('step_archive/outputs/attacker-ran',${JSON.stringify(credential)});`);
  const result = await runQualityGate(root);
  assert.equal(result.verdict, 'FAIL');
  assert.match(result.error, /credential|sensitive/i);
  assert.equal(JSON.stringify(result).includes(credential), false);
  await assert.rejects(access(join(root, 'step_archive', 'outputs', 'attacker-ran')), { code: 'ENOENT' });
});

test('quality configuration duplicate keys cannot hide an executable from review', async () => {
  const root = await fixture('process.exit(0);');
  const bytes = await readFile(join(root, 'harness50.quality.json'), 'utf8');
  await writeFile(join(root, 'harness50.quality.json'), bytes.replace('"schema_version":1', '"schema_version":1,"schema_version":1'));
  const result = await runQualityGate(root);
  assert.equal(result.verdict, 'FAIL');
  assert.deepEqual(result.checks, {});
});

test('installed browser verifier dependency must match pinned content before execution', async () => {
  assert.equal(typeof asideBackend.verifyAxeBytes, 'function', 'dependency currently has no content integrity guard');
  const axe = await readFile(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url));
  assert.doesNotThrow(() => asideBackend.verifyAxeBytes(axe));
  const modified = Buffer.from(axe);
  modified[0] ^= 1;
  assert.throws(() => asideBackend.verifyAxeBytes(modified), /integrity|pinned/i);
});

test('Aside aggregate hard budget covers preflight and shrinks the final chunk timeout', async () => {
  assert.equal(typeof asideBackend.createAsideBudget, 'function', 'browser chunks currently have no aggregate ceiling');
  let clock = 0;
  const budget = asideBackend.createAsideBudget(120000, () => clock);
  assert.equal(budget.remaining(), 120000);
  clock = 550000;
  assert.equal(budget.remaining(), 50000);
  clock = 600000;
  assert.throws(() => budget.remaining(), /aggregate.*budget|total.*deadline/i);
  let executions = 0;
  clock = 0;
  await assert.rejects(asideBackend.run({ timeoutMs: 120000, report: {} }, {
    now: () => clock,
    readAxe: async () => { clock = 600001; return Buffer.alloc(0); },
    getToolVersion: async () => 'synthetic',
    execute: asideBackend.testOnly.registerFakeExecutor(async () => { executions++; return {}; })
  }), /aggregate.*budget|total.*deadline/i);
  assert.equal(executions, 0, 'expired preflight must not open a browser chunk');
});

test('native Aside refuses untrusted execution before artifact servers or browser preflight', async () => {
  let preflightTouched = false;
  const report = {};
  await assert.rejects(asideBackend.run({ timeoutMs: 120000, report }, {
    readAxe: async () => { preflightTouched = true; throw new Error('Preflight already reached'); }
  }), error => error.code === 'ASIDE_NETWORK_ISOLATION_UNSUPPORTED');
  assert.equal(preflightTouched, false, 'gate must precede dependency reads, artifact servers and openTab');
  await assert.rejects(startVerificationServers({ document: Buffer.from('<html></html>'), allowed: new Set(['/index.html']), axe: Buffer.alloc(0) }), error => error.code === 'ASIDE_NETWORK_ISOLATION_UNSUPPORTED');
  await assert.rejects(asideBackend.run({ timeoutMs: 120000, report: {} }, { execute: async () => ({}) }), error => error.code === 'ASIDE_NETWORK_ISOLATION_UNSUPPORTED');
});

test('Aside HTTP response imposes capability restrictions independent of generated markup', async () => {
  const servers = await startVerificationServers({ document: Buffer.from('<html><head></head><body>safe</body></html>'), allowed: new Set(['/index.html']), axe: Buffer.from('/* test */') },
    { execute: asideBackend.testOnly.registerFakeExecutor(async () => ({})) });
  try {
    assert.notEqual(new URL(servers.origin).hostname, new URL(servers.hostOrigin).hostname, 'ports alone do not isolate cookie hosts');
    const response = await fetch(`${servers.origin}/index.html`);
    assert.equal(response.status, 200);
    const policy = response.headers.get('content-security-policy');
    for (const directive of ["connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", 'sandbox allow-scripts allow-same-origin', `frame-ancestors ${servers.hostOrigin}`]) assert.ok(policy.includes(directive), directive);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('permissions-policy'), /publickey-credentials-get=\(\)/);
    const host = await fetch(`${servers.hostOrigin}/__harness50__/host.html`);
    assert.ok(host.headers.get('content-security-policy').includes(`frame-src 'self' ${servers.origin}`));
    assert.equal((await fetch(`${servers.origin}/__harness50__/host.html`)).status, 404);
    assert.equal((await fetch(`${servers.hostOrigin}/index.html`)).status, 404);
  } finally { await servers.close(); }
});

test('every dispatcher selection rejects generated HTML before loading any browser backend', async () => {
  const key = Symbol.for('harness36.unit.backend-counters');
  const counts = { loads: 0, available: 0, run: 0 };
  globalThis[key] = counts;
  const fake = `export async function available(){globalThis[Symbol.for('harness36.unit.backend-counters')].available++;return true;}
export async function toolVersion(){return 'trusted-unit-fake';}
export async function run(){globalThis[Symbol.for('harness36.unit.backend-counters')].run++;throw new Error('UNTRUSTED_ARTIFACT_EXECUTED_IN_FAKE_BACKEND');}`;
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/scripts/verify-output.mjs') && ['./lib/browser-backend-aside.mjs', '../browser-verifier/backend-playwright.mjs'].includes(specifier)) {
      counts.loads++;
      return { url: 'data:text/javascript,' + encodeURIComponent(fake), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  } });
  const old = process.env.HARNESS50_BROWSER_BACKEND;
  const failures = [];
  try {
    for (const selection of [
      { name: 'explicit-playwright', backend: 'playwright' },
      { name: 'environment-playwright', env: 'playwright' },
      { name: 'locked-playwright', backend: 'auto', lock: 'playwright' },
      { name: 'automatic-playwright', backend: 'auto' },
      { name: 'explicit-aside', backend: 'aside' }
    ]) {
      delete process.env.HARNESS50_BROWSER_BACKEND;
      if (selection.env) process.env.HARNESS50_BROWSER_BACKEND = selection.env;
      const root = await makeWorkspace();
      await mkdir(join(root, 'dist'));
      await writeFile(join(root, 'dist', 'index.html'), `<!doctype html><html><head>${routeManifestScript()}</head><body><main data-harness-screen="home"><h1>Generated fixture</h1><script>fetch('http://127.0.0.1:1/marker')</script></main></body></html>`);
      if (selection.lock) {
        await mkdir(join(root, 'step_archive', 'outputs'), { recursive: true });
        await writeFile(join(root, 'step_archive', 'outputs', 'browser-backend.json'), JSON.stringify({ schema_version: 1, selected: selection.lock, tool_version: 'synthetic', probed_at: '2026-10-06T00:00:00Z' }));
      }
      const result = await verifyOutput(root, { ...(selection.backend ? { backend: selection.backend } : {}), hostIsolation: true, network_isolation: 'approved', allowUnisolated: true });
      if (result.verdict !== 'FAIL' || result.environment?.network_isolation !== 'missing-host-all-transport-egress'
        || !/verified per-tab host network isolation is required/.test(result.error) || result.viewports.length !== 0
        || result.compatibility.navigation_api_unavailable.viewports.length !== 0) failures.push(selection.name + ': ' + result.error);
      await assert.rejects(access(join(root, 'step_archive', 'screenshots')), { code: 'ENOENT' });
    }
    assert.deepEqual(failures, [], 'no selection or JSON-shaped flag may bypass native isolation');
    assert.deepEqual(counts, { loads: 0, available: 0, run: 0 }, 'gate must precede backend import, availability probe and untrusted execution');
  } finally {
    hooks.deregister();
    delete globalThis[key];
    if (old === undefined) delete process.env.HARNESS50_BROWSER_BACKEND;
    else process.env.HARNESS50_BROWSER_BACKEND = old;
  }
});

test('direct alternative backend refuses before accessing generated bytes or lazy package imports', async () => {
  let reads = 0;
  const report = {};
  await assert.rejects(playwrightBackend.run({
    report,
    get bytes() { reads++; throw new Error('GENERATED_ARTIFACT_ACCESSED_BEFORE_GATE'); }
  }), error => error.code === 'BROWSER_NETWORK_ISOLATION_UNSUPPORTED');
  assert.equal(reads, 0);
  assert.equal(report.environment?.network_isolation, 'missing-host-all-transport-egress');
});
