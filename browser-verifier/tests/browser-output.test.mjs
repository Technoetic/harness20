import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { makeWorkspace } from '../../codex/tests/helpers/workspace.mjs';
import { verifyOutput } from '../../scripts/verify-output.mjs';
import { routeManifestScript } from '../../codex/tests/helpers/routing.mjs';

const browserOptions = { backend: 'playwright', ...(process.env.HARNESS50_BROWSER_PATH ? { executablePath: process.env.HARNESS50_BROWSER_PATH } : {}) };

// Native adapters currently lack verified all-transport host isolation. These
// tests prove refusal, not browser measurements or a fictional supported host.
async function assertUnsupported(report, root) {
  assert.equal(report.verdict, 'FAIL', JSON.stringify(report));
  assert.match(report.error, /verified per-tab host network isolation is required/);
  assert.equal(report.environment?.network_isolation, 'missing-host-all-transport-egress');
  assert.deepEqual(report.viewports, []);
  assert.deepEqual(report.compatibility.navigation_api_unavailable.viewports, []);
  await assert.rejects(access(join(root, 'step_archive', 'screenshots')), { code: 'ENOENT' });
}

test('browser CLI invoked through a directory alias rejects a missing artifact', async () => {
  const root = await makeWorkspace();
  const alias = join(root, 'cli');
  await symlink(fileURLToPath(new URL('../../scripts/', import.meta.url)), alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(promisify(execFile)(process.execPath, [join(alias, 'verify-output.mjs'), '--workspace', root]),
    error => error.code === 1 && JSON.parse(error.stdout).verdict === 'FAIL');
});

const document = (body, { routed = true } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Interactive example</title><style>body{margin:24px;background:#fff;color:#111;font:18px Arial}button{font:inherit;padding:12px}</style>${routed ? routeManifestScript() : ''}</head><body><main ${routed ? 'data-harness-screen="home"' : ''}><h1>Interactive example</h1>${body}</main>${routed ? '<script>function render(){if(location.hash!=="#/")history.replaceState(null,"","#/")}addEventListener("hashchange",render);render()</script>' : ''}</body></html>`;
async function fixture(body) {
  const root = await makeWorkspace();
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist', 'index.html'), document(body));
  return root;
}

test('native verification refuses a working document without host network isolation', async () => {
  const root = await fixture('<p>Explore an accessible interactive example.</p><button onclick="this.textContent=\'Activated\'">Activate</button>');
  const report = await verifyOutput(root, browserOptions);
  await assertUnsupported(report, root);
  assert.match(report.artifact_sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.schema_version, 3);
});

test('runtime-error and network-dependency artifact is refused before browser execution', async () => {
  const root = await fixture('<button></button><script>throw new Error("fixture failure")</script><script src="https://example.invalid/dependency.js"></script>');
  const report = await verifyOutput(root, browserOptions);
  await assertUnsupported(report, root);
});

test('overflow artifact is refused without fabricated measurements', async () => {
  const root = await fixture('<p style="width:1000px">Overflow</p>');
  const report = await verifyOutput(root, browserOptions);
  await assertUnsupported(report, root);
});

test('a nonterminating page is refused before its script can stall a browser', { timeout: 20000 }, async () => {
  const root = await fixture('<script>while (true) {}</script>');
  const started = Date.now();
  const report = await verifyOutput(root, { ...browserOptions, timeoutMs: 1000 });
  await assertUnsupported(report, root);
  assert.ok(Date.now() - started < 15000, 'browser deadline did not bound the stalled page');
});

test('a URL-less single HTML without the screen manifest fails fresh verification', async () => {
  const root = await fixture('<p>Screen tabs do not create addresses.</p><button>Orders</button>');
  await writeFile(join(root, 'dist/index.html'), document('<button>Orders</button>', { routed: false }));
  const report = await verifyOutput(root, browserOptions);
  assert.equal(report.verdict, 'FAIL');
  assert.match(report.error, /manifest/i);
});

async function routingFixture(mode = 'hash', fault = '') {
  const manifest = { schema_version: 1, mode, fallback: 'home', routes: [{ id: 'home', path: '/' }, { id: 'orders', path: '/orders' }, { id: 'settings', path: '/settings.html' }] };
  const href = path => mode === 'hash' ? `#${path}` : path;
  const screens = manifest.routes.map((route, index) => `<section data-harness-screen="${route.id}" hidden><h2>${route.id}</h2><p>Independent ${route.id} screen.</p><a href="${href(manifest.routes[(index + 1) % 3].path)}">Next screen</a>${fault === 'route-errors' && route.id === 'orders' ? '<button></button><p style="width:2000px">Orders overflow</p>' : ''}</section>`).join('');
  const app = `<script>
    const routes=${JSON.stringify(manifest.routes)}, mode=${JSON.stringify(mode)}, fault=${JSON.stringify(fault)};
    if(fault==='restore-api-on-reload'&&!('navigation' in window)&&performance.getEntriesByType('navigation')[0]?.type==='reload')Object.defineProperty(window,'navigation',{value:undefined});
    function path(){return mode==='hash'?location.hash.slice(1):location.pathname}
    function href(path){return mode==='hash'?'#'+path:path}
    function show(route){document.querySelectorAll('[data-harness-screen]').forEach(el=>el.hidden=el.dataset.harnessScreen!==route.id);document.title=route.id}
    function render(initial=false){
      let route=routes.find(route=>route.path===path());
      if(!route){if(fault==='unknown'&&path().includes('__harness50_unknown'))return;route=routes[0];history.replaceState(null,'',href(route.path))}
      if(fault==='direct'&&initial)route=routes[0];
      if(fault==='reload'&&performance.getEntriesByType('navigation')[0]?.type==='reload')route=routes[0];
      show(route);
      if(fault==='route-errors'&&route.id==='orders'){console.error('orders only');fetch('https://example.invalid/orders')}
    }
    addEventListener(mode==='hash'?'hashchange':'popstate',()=>{if(fault!=='history')render()});
    document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link)return;event.preventDefault();const target=routes.find(route=>href(route.path)===link.getAttribute('href'));if(fault!=='url-less'&&!(fault==='fallback-url-less'&&!('navigation' in window)))history.pushState(null,'',href(target.path));show(target)});
    render(true);
  </script>`;
  let html = document(screens, { routed: false }).replace('</head>', `${routeManifestScript(manifest)}</head>`).replace('</body>', `${app}</body>`);
  if(fault==='duplicate-root')html=html.replace('</main>','<section data-harness-screen="orders" hidden>Duplicate</section></main>');
  if(fault==='omitted-root')html=html.replace('data-harness-screen="orders"','data-harness-screen="undeclared"');
  if(fault==='property-order')html=html.replace(routeManifestScript(manifest),routeManifestScript({...manifest,routes:manifest.routes.map(route=>({path:route.path,id:route.id}))}));
  const root = await makeWorkspace();
  await mkdir(join(root,'dist'));
  await writeFile(join(root,'dist/index.html'),html);
  return root;
}

for (const mode of ['hash', 'history']) test(`${mode} routing artifact is refused without host network isolation`, async () => {
  const root = await routingFixture(mode);
  const report = await verifyOutput(root, browserOptions);
  await assertUnsupported(report, root);
  assert.equal(report.schema_version,3);
});

test('broken fallback app is refused before native or unavailable-API execution',async()=>{
  const root=await routingFixture('history','fallback-url-less');
  await assertUnsupported(await verifyOutput(root,browserOptions),root);
});

test('API-restoring artifact is refused before browser execution',async()=>{
  const root=await routingFixture('history','restore-api-on-reload');
  await assertUnsupported(await verifyOutput(root,browserOptions),root);
});

test('partial native Navigation API artifacts are refused without measurements',async()=>{
  for(const partial of ['{navigate(){},addEventListener(){},currentEntry:null}','{navigate(){},currentEntry:{}}']){
    const root=await fixture(`<script>if("navigation" in window)Object.defineProperty(window,"navigation",{value:${partial}})</script>`);
    const report=await verifyOutput(root,browserOptions);
    await assertUnsupported(report,root);
  }
});

test('valid route JSON property ordering cannot bypass host isolation',async()=>{
  const root=await routingFixture('hash','property-order');
  await assertUnsupported(await verifyOutput(root,browserOptions),root);
});

for(const fault of ['url-less','direct','reload','history','unknown','duplicate-root','omitted-root'])test(`route artifact ${fault} is refused before application behavior`,async()=>{
  const root=await routingFixture('hash',fault);
  await assertUnsupported(await verifyOutput(root,{...browserOptions,timeoutMs:20000}),root);
});

test('non-initial-screen network and error artifact is refused before execution',async()=>{
  const root=await routingFixture('hash','route-errors');
  await assertUnsupported(await verifyOutput(root,browserOptions),root);
});

test('the shipped three-screen example receives an honest unsupported result',async()=>{
  const root=await makeWorkspace();await mkdir(join(root,'dist'));
  await writeFile(join(root,'dist/index.html'),await readFile(new URL('../../examples/routed-single-file.html',import.meta.url)));
  const report=await verifyOutput(root,browserOptions);
  await assertUnsupported(report,root);
  assert.deepEqual(report.routing.routes.map(route=>route.id),['home','orders','settings']);
});
