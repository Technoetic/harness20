#!/usr/bin/env node
// Explicit installed-Aside regression. Start Aside using the approved startup first.
// The current adapter must reject both normal and hostile artifacts before serving
// or opening a tab. This opt-in runner is outside npm test and accepts no overrides.
import { verifyOutput } from '../../scripts/verify-output.mjs';
import { toolVersion } from '../../scripts/lib/browser-backend-aside.mjs';
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';

if (process.argv.length !== 2) throw new Error('This isolation regression accepts no override options');
const exec = promisify(execFile);
async function tabs() {
  const { stdout } = await exec('aside', ['repl',
    "console.log('__TABS__'+JSON.stringify((await listBrowserTabs()).map(tab=>tab.targetId).sort()));"
  ], { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' });
  const line = stdout.split(/\r?\n/).find(value => value.startsWith('__TABS__'));
  if (!line) throw new Error('Aside did not report its tab identifiers');
  return JSON.parse(line.slice('__TABS__'.length));
}
const observations = { tcp_connections: 0, http_requests: 0, artifact_executions: 0, udp_packets: 0 };
const tcp = createServer((request, response) => {
  observations.http_requests++;
  if (request.url === '/artifact-executed') observations.artifact_executions++;
  response.end('synthetic execution probe');
});
tcp.on('connection', () => observations.tcp_connections++);
const udp = createSocket('udp4');
udp.on('message', () => observations.udp_packets++);
let udpBound = false;
try {
  await new Promise((resolve, reject) => {
    tcp.once('error', reject);
    tcp.listen(0, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => {
    udp.once('error', reject);
    udp.bind(0, '127.0.0.1', () => { udpBound = true; resolve(); });
  });
  const target = `http://127.0.0.1:${tcp.address().port}`;
  const hostile = Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Hostile network fixture</title>
<script id="harness50-routes" type="application/json">{"schema_version":1,"mode":"hash","fallback":"home","routes":[{"id":"home","path":"/home"}]}</script>
<link rel="preconnect" href="${target}"></head><body><main data-harness-screen="home"><h1>Hostile network fixture</h1></main><script>
fetch('${target}/artifact-executed').catch(()=>{});
try {
  const rtc=new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${udp.address().port}'}]});
  rtc.createDataChannel('synthetic');
  rtc.createOffer().then(offer=>rtc.setLocalDescription(offer)).catch(()=>{});
} catch {}
</script></body></html>`);
  const version = await toolVersion();
  if (!version) throw new Error('Installed Aside CLI is unavailable');
  const before = await tabs();
  const reports = [];
  for (const [name, bytes] of [
    ['hostile', hostile],
    ['benign', await readFile(new URL('../../examples/routed-single-file.html', import.meta.url))]
  ]) {
    const root = await makeWorkspace();
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist', 'index.html'), bytes);
    reports.push({ fixture: name, result: await verifyOutput(root, { backend: 'aside', timeoutMs: 120000 }) });
  }
  const after = await tabs();
  const checks = {
    all_artifacts_rejected: reports.every(item => item.result.verdict === 'FAIL'
      && item.result.environment?.network_isolation === 'missing-host-all-transport-egress'
      && /verified per-tab host network isolation is required/.test(item.result.error)),
    no_artifact_execution: observations.artifact_executions === 0,
    no_http_requests: observations.http_requests === 0,
    no_preconnect_tcp: observations.tcp_connections === 0,
    no_webrtc_udp: observations.udp_packets === 0,
    user_tabs_preserved: JSON.stringify(before) === JSON.stringify(after)
  };
  const report = { verdict: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', tool_version: version, checks, observations, reports };
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'PASS') process.exitCode = 1;
} catch (error) {
  console.error(`OWASP Aside isolation smoke: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (tcp.listening) {
    tcp.closeAllConnections();
    await new Promise(resolve => tcp.close(resolve));
  }
  if (udpBound) await new Promise(resolve => udp.close(resolve));
}
