// Page-side code for the Aside backend (scripts/lib/browser-backend-aside.mjs):
// the bridge injected into the application document, the host page that frames it at the
// requested viewport, and the generator for the `aside repl` chunk script. The chunk script is
// passed to the CLI as one argv element, so it uses single quotes only and stays well under the
// argument limit; values embedded into it are validated by route-contract.mjs (ids, paths) or
// produced here (origin, sizes, names).
export const HARNESS_PREFIX = '/__harness50__/';
export const MAX_CHUNK_SCRIPT_LENGTH = 28000;

// The bridge runs first in the main world (served right after <head>) and mirrors what the
// Playwright backend observes through page events: console.error, uncaught errors, dialogs,
// popups and CSP-blocked requests. Isolated-world evaluate cannot see main-world expandos, so
// the state is published on document.documentElement.dataset and probes are answered through
// DOM events (h50probe, h50take) that cross worlds.
export function bridgeScript(unavailable) {
  return '<script>(function(){' +
    'var d=document.documentElement.dataset;var s={errors:[],blocked:0};' +
    'var save=function(){try{d.h50=JSON.stringify(s);}catch(e){}};' +
    'var rec=function(k){if(s.errors.length<100){s.errors.push(k);}save();};' +
    (unavailable ? 'if(!Reflect.deleteProperty(window,\'navigation\')||(\'navigation\' in window)||typeof window.navigation!==\'undefined\'){rec(\'init-failed\');}' : '') +
    'var ce=console.error;console.error=function(){rec(\'console.error\');try{return ce.apply(console,arguments);}catch(e){}};' +
    'window.addEventListener(\'error\',function(){rec(\'pageerror\');});' +
    'window.addEventListener(\'unhandledrejection\',function(){rec(\'pageerror\');});' +
    'window.alert=function(){rec(\'unexpected-dialog\');};' +
    'window.confirm=function(){rec(\'unexpected-dialog\');return false;};' +
    'window.prompt=function(){rec(\'unexpected-dialog\');return null;};' +
    'window.open=function(){rec(\'unexpected-popup\');return null;};' +
    // Playwright sees a popup and closes it; here a real tab would open in the user's browser, so
    // targeted activations are stopped before the default action (capture phase). _top/_parent
    // would leave the host frame, which a top-level page would not: they stay in the frame.
    'document.addEventListener(\'click\',function(e){var a=e.target&&e.target.closest?e.target.closest(\'a[href],area[href]\'):null;if(!a)return;var t=a.getAttribute(\'target\');if(!t||t===\'_self\')return;e.preventDefault();' +
    'if(t===\'_top\'||t===\'_parent\'){location.assign(a.href);}else{rec(\'unexpected-popup\');}},true);' +
    'document.addEventListener(\'submit\',function(e){var f=e.target;var b=e.submitter&&e.submitter.hasAttribute(\'formtarget\')?e.submitter:null;var t=b?b.getAttribute(\'formtarget\'):(f&&f.getAttribute?f.getAttribute(\'target\'):null);if(!t||t===\'_self\')return;' +
    'if(t===\'_top\'||t===\'_parent\'){(b||f).setAttribute(b?\'formtarget\':\'target\',\'_self\');return;}e.preventDefault();rec(\'unexpected-popup\');},true);' +
    'document.addEventListener(\'securitypolicyviolation\',function(){s.blocked++;rec(\'requestfailed\');});' +
    'document.addEventListener(\'h50take\',function(){d.h50take=JSON.stringify(s);s={errors:[],blocked:0};save();});' +
    'document.addEventListener(\'h50probe\',function(){var n=window.navigation;d.h50probe=JSON.stringify({' +
    'available:typeof n!==\'undefined\'&&n!==null&&typeof n.navigate===\'function\'&&typeof n.addEventListener===\'function\'&&n.currentEntry!=null&&' +
    'typeof (window.NavigateEvent&&window.NavigateEvent.prototype&&window.NavigateEvent.prototype.intercept)===\'function\',' +
    'property_present:(\'navigation\' in window)});});' +
    'save();})();</script>';
}

// The host page sizes the application frame; its own CSP only admits same-origin frames, so a
// frame navigation elsewhere is a counted violation (Playwright aborts the same navigation).
export function hostPage(width, height) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>harness50 host</title><link rel="icon" href="data:,">' +
    `<style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}iframe{display:block;border:0;width:${width}px;height:${height}px}</style>` +
    '<script>(function(){var n=0;document.addEventListener(\'securitypolicyviolation\',function(){n++;document.documentElement.dataset.h50blocked=String(n);});})();</script>' +
    '</head><body><iframe id="app" title="application" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe></body></html>';
}

export const BLANK_PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>blank</title><link rel="icon" href="data:,"></head><body></body></html>';

function literal(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string' || /["\\'\r\n\u2028\u2029]/.test(value)) throw new Error('Unsafe value for the Aside chunk script');
  return `'${value}'`;
}

function routingLiteral(routing) {
  return `{schema_version:${literal(routing.schema_version)},mode:${literal(routing.mode)},fallback:${literal(routing.fallback)},routes:[` +
    routing.routes.map(route => `{id:${literal(route.id)},path:${literal(route.path)}}`).join(',') + ']}';
}

// One chunk = one `aside repl` call = one Playwright `withPage` unit: the initial-entry unit or
// one route unit, for one scenario and one viewport. The result line is prefixed with __H50__.
export function chunkScript({ routing, unavailable, origin, hostOrigin, width, height, unit, routeIndex, shotName, entryPath, unknownPath }) {
  const appUrl = new URL(origin), hostUrl = new URL(hostOrigin);
  if (appUrl.protocol !== 'http:' || hostUrl.protocol !== 'http:' || !/^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(appUrl.hostname)
      || hostUrl.hostname !== '127.0.0.1' || appUrl.hostname === hostUrl.hostname) throw new Error('Aside execution requires distinct loopback cookie hosts');
  const script = `
const T0 = Date.now(); const timings = {}; const lap = k => { timings[k] = Date.now() - T0; };
const R = ${routingLiteral(routing)};
const U = ${literal(unavailable)}; const O = ${literal(origin)}; const W = ${literal(width)}; const H = ${literal(height)};
const HOST_ORIGIN = ${literal(hostOrigin)};
const UNIT = ${literal(unit)}; const ROUTE_INDEX = ${literal(routeIndex)}; const SHOT = ${literal(shotName)};
const PREFIX = ${literal(HARNESS_PREFIX)}; const ENTRY = O + ${literal(entryPath)}; const UNKNOWN_PATH = ${literal(unknownPath)};
const HOST = HOST_ORIGIN + PREFIX + 'host.html?w=' + W + '&h=' + H; const BLANK = HOST_ORIGIN + PREFIX + 'blank.html'; const AXE = HOST_ORIGIN + PREFIX + 'axe.min.js';
const href = path => R.mode === 'hash' ? ENTRY + '#' + path : O + path;
const fallback = R.routes.find(route => route.id === R.fallback);
const out = { errors: [], blocked: 0 }; let page = null; let env = null; let axeSource = null;
const fail = message => { throw new Error(message); };
// Aside leaves cross-origin frame.url() cached at about:blank. The frame's
// isolated-world location is authoritative and remains accessible through CDP.
const isApp = async frame => { try { const url = await frame.evaluate(() => location.href); return url.indexOf(O + '/') === 0 && url.indexOf(PREFIX) < 0; } catch (error) { return false; } };
const isBlank = async frame => { try { return await frame.evaluate(() => location.href) === BLANK; } catch (error) { return false; } };
const complete = () => document.readyState === 'complete';
const settled = () => document.readyState === 'complete' && !!document.documentElement.dataset.h50;
const fresh = () => document.readyState === 'complete' && !!document.documentElement.dataset.h50 && !document.documentElement.dataset.h50old;
async function find(match, predicate, what) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    for (const frame of page.frames()) {
      if (!(await match(frame))) continue;
      try { if (await frame.evaluate(predicate)) return frame; } catch (error) {}
    }
    await sleep(100);
  }
  fail(what + ' did not load');
}
async function take(frame) {
  let raw = null;
  try { raw = await frame.evaluate(() => { document.dispatchEvent(new Event('h50take')); return document.documentElement.dataset.h50take || null; }); } catch (error) {}
  if (!raw) return;
  const state = JSON.parse(raw);
  for (const kind of state.errors) if (out.errors.length < 100) out.errors.push(kind);
  out.blocked += state.blocked;
}
async function leave(frame) {
  await take(frame);
  try { await frame.evaluate(() => { document.documentElement.dataset.h50old = '1'; }); } catch (error) {}
}
async function setSrc(url) { await page.evaluate(target => { document.getElementById('app').src = target; }, url); }
async function load(url, current, sameDocument) {
  if (current) { if (sameDocument) await take(current); else await leave(current); }
  await setSrc(url);
  const frame = await find(isApp, sameDocument ? settled : fresh, 'Application frame');
  if (!env) env = await frame.evaluate(() => ({ ua: navigator.userAgent, dpr: devicePixelRatio, dark: matchMedia('(prefers-color-scheme: dark)').matches,
    reduced_motion: matchMedia('(prefers-reduced-motion: reduce)').matches, language: navigator.language }));
  return frame;
}
// A real location.reload() is tried first (Playwright parity: navigation type 'reload'). Measured:
// script reloads (location.reload, same-URL assign/src) are inert in a normal document in the Aside
// browser but complete once the bridge removed window.navigation (2026-09-16 E2E: 6/6 vs 0/6), so
// when no fresh document appears within a short bound the frame is re-created at its current URL:
// a cold re-entry of the same entry with the tab's storage kept (reload-type-specific behaviour is
// then not exercised; timings.reload_mode records which path ran).
async function reload(frame) {
  const url = await frame.evaluate(() => location.href);
  await leave(frame);
  try { await frame.evaluate(() => { setTimeout(() => location.reload(), 0); }); } catch (error) {}
  const started = Date.now();
  while (Date.now() - started < 1000) {
    for (const candidate of page.frames()) {
      if (!(await isApp(candidate))) continue;
      try { if (await candidate.evaluate(fresh)) { timings.reload_mode = 'reload'; return candidate; } } catch (error) {}
    }
    await sleep(100);
  }
  timings.reload_mode = 'cold-entry';
  await page.evaluate(target => {
    const old = document.getElementById('app'), next = document.createElement('iframe');
    next.id = 'app'; next.title = 'application'; next.setAttribute('sandbox','allow-scripts allow-same-origin'); next.referrerPolicy = 'no-referrer'; old.replaceWith(next); next.src = target;
  }, url);
  return find(isApp, fresh, 'Application frame');
}
async function probe(frame) {
  const raw = await frame.evaluate(() => { document.dispatchEvent(new Event('h50probe')); return document.documentElement.dataset.h50probe || null; });
  if (!raw) fail('Navigation API probe did not answer');
  const observed = JSON.parse(raw);
  if (U && (observed.available || observed.property_present)) fail('Navigation API absence could not be verified');
  return observed;
}
const AGREE = args => {
  const routing = args[0], id = args[1], url = args[2];
  if (location.href !== url) return false;
  const declarations = [...document.querySelectorAll('#harness50-routes')];
  if (declarations.length !== 1 || declarations[0].tagName !== 'SCRIPT' || declarations[0].parentElement !== document.head || declarations[0].getAttribute('type') !== 'application/json') return false;
  let manifest;
  try { manifest = JSON.parse(declarations[0].textContent); } catch (error) { return false; }
  if (manifest.schema_version !== routing.schema_version || manifest.mode !== routing.mode || manifest.fallback !== routing.fallback ||
    !Array.isArray(manifest.routes) || manifest.routes.length !== routing.routes.length ||
    !manifest.routes.every((route, index) => route?.id === routing.routes[index].id && route?.path === routing.routes[index].path)) return false;
  const roots = [...document.querySelectorAll('[data-harness-screen]')];
  if (roots.length !== routing.routes.length) return false;
  return routing.routes.every(route => {
    const matching = roots.filter(root => root.getAttribute('data-harness-screen') === route.id);
    if (matching.length !== 1) return false;
    const root = matching[0];
    const visible = root.getClientRects().length > 0 && root.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    return visible === (route.id === id);
  });
};
async function assertScreen(frame, route, phase) {
  await probe(frame);
  const started = Date.now(); let agreed = false;
  while (Date.now() - started < 3000) {
    try { if (await frame.evaluate(AGREE, [R, route.id, href(route.path)])) { agreed = true; break; } } catch (error) {}
    await sleep(100);
  }
  if (!agreed) fail('Route ' + route.id + ' failed ' + phase + ': URL and visible screen must agree');
  return probe(frame);
}
async function measure(frame) {
  const metrics = await frame.evaluate(() => ({
    horizontal_overflow: document.documentElement.scrollWidth > innerWidth + 1,
    visible_text_length: document.body.innerText.trim().length,
    dom_content_loaded_ms: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? null,
    focusable_elements: [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0).length
  }));
  if (!axeSource) { const response = await fetch(AXE); if (!response.ok) fail('axe-core could not be fetched'); axeSource = await response.text(); }
  if (!(await frame.evaluate(() => typeof axe === 'object' && axe !== null))) await frame.evaluate(axeSource);
  const analysis = await frame.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    .then(result => ({ violations: result.violations.map(item => ({ id: item.id, impact: item.impact, affected_nodes: item.nodes.length })), accessibility_incomplete: result.incomplete.map(item => item.id) })));
  return { ...metrics, ...analysis };
}
const FOCUSED = () => !!document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement;
async function pressTab(frame) {
  if (!(await frame.evaluate(FOCUSED))) await page.evaluate(() => { document.getElementById('app').focus(); });
  await page.keyboard.press('Tab');
  await sleep(150);
  return frame.evaluate(FOCUSED);
}
// Measured: CDP captures alternate hang/succeed per attempt, whatever the timeout, so a failed
// attempt flips the parity and the retry lands on the good slot (no primer: it consumes a slot).
async function screenshot() {
  let last = null;
  for (const timeout of [4000, 8000, 8000]) {
    try { await page.screenshot({ path: './artifacts/' + SHOT, clip: { x: 0, y: 0, width: W, height: H }, timeout }); lap('shot-' + timeout); return; }
    catch (error) { last = error; }
  }
  fail('Screenshot failed: ' + String(last && last.message || last));
}
// The chosen link is tagged with a marker attribute so the locator click (a trusted event, which
// pierces open shadow roots) and the evaluate fallback address the same element.
const LINK = args => {
  const routing = args[0], id = args[1], entry = args[2], origin = args[3];
  const target = path => routing.mode === 'hash' ? entry + '#' + path : origin + path;
  for (const previous of document.querySelectorAll('[data-h50-link]')) previous.removeAttribute('data-h50-link');
  const links = [...document.querySelectorAll('a[href]')];
  for (let index = 0; index < links.length; index++) {
    const link = links[index];
    if (!(link.getClientRects().length > 0 && link.checkVisibility({ checkVisibilityCSS: true })) || link.getAttribute('download') !== null ||
      ![null, '', '_self'].includes(link.getAttribute('target'))) continue;
    const found = routing.routes.find(item => item.id !== id && target(item.path) === link.href);
    if (found) { link.setAttribute('data-h50-link', ''); return { target_id: found.id }; }
  }
  return null;
};
const UNTAG = () => { for (const tagged of document.querySelectorAll('[data-h50-link]')) tagged.removeAttribute('data-h50-link'); };
// Only this chunk's fresh randomized app origin is eligible. Never touch the
// host origin or any user tab. Cleanup has a separate short ceiling and the
// CLI call remains under its own aggregate/per-chunk host deadline.
async function cleanupFreshStorage() {
  for (const frame of page.frames()) {
    if (!(await isApp(frame))) continue;
    const clear = frame.evaluate(async expected => {
      if (location.origin !== expected) return false;
      try { localStorage.clear(); sessionStorage.clear(); } catch (error) {}
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim();
        if (name) { document.cookie = name + '=; Max-Age=0; Path=/'; document.cookie = name + '=; Max-Age=0'; }
      }
      if (typeof caches !== 'undefined') { for (const name of await caches.keys()) await caches.delete(name); }
      if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
        for (const db of await indexedDB.databases()) if (db.name) await new Promise(resolve => {
          const request = indexedDB.deleteDatabase(db.name); request.onsuccess = request.onerror = request.onblocked = () => resolve();
        });
      }
      return true;
    }, O).catch(() => false);
    await clear;
  }
}
async function click(frame, target) {
  try { await frame.locator('[data-h50-link]').first().click({ timeout: 5000 }); } catch (error) {}
  // A successful locator call in Aside can target the frame's cached pre-navigation
  // document. Confirm the actual URL before accepting the click as an action.
  if ((await frame.evaluate(() => location.href)) !== href(target.path)) {
    await frame.evaluate(() => { document.querySelector('[data-h50-link]').click(); });
  }
  try { await frame.evaluate(UNTAG); } catch (error) {}
}
async function initialUnit() {
  await find(isBlank, complete, 'Blank frame');
  const historyBefore = await page.evaluate(() => history.length);
  let frame = await load(ENTRY, null, false); lap('entry');
  const navigation_api = await assertScreen(frame, fallback, 'initial entry');
  if ((await frame.evaluate(() => history.length)) !== historyBefore + 1) fail('Initial fallback must replace its URL');
  await frame.evaluate(() => document.fonts.ready.then(() => true));
  const metrics = await measure(frame); lap('measure');
  const keyboard_focus = await pressTab(frame);
  await screenshot(); lap('screenshot');
  const historyAtEntry = await frame.evaluate(() => history.length);
  frame = await load(href(UNKNOWN_PATH), frame, R.mode === 'hash');
  await assertScreen(frame, fallback, 'unknown fallback');
  if ((await frame.evaluate(() => history.length)) !== historyAtEntry + 1) fail('Unknown fallback must replace its URL');
  await take(frame); lap('unknown');
  return { ...metrics, navigation_api, keyboard_focus, screenshot: SHOT, initial_entry: true, unknown_fallback: true };
}
async function routeUnit() {
  const route = R.routes[ROUTE_INDEX];
  await find(isBlank, complete, 'Blank frame');
  let frame = await load(href(route.path), null, false); lap('entry');
  const navigation_api = await assertScreen(frame, route, 'direct entry'); lap('direct-entry');
  await frame.evaluate(() => document.fonts.ready.then(() => true));
  const direct = await measure(frame); lap('direct');
  frame = await reload(frame); lap('reloaded');
  await assertScreen(frame, route, 'reload');
  const reloaded = await measure(frame); lap('reload');
  let navigation = { status: 'not-applicable', reason: 'single-screen' };
  if (R.routes.length > 1) {
    const link = await frame.evaluate(LINK, [R, route.id, ENTRY, O]);
    if (!link) fail('Route ' + route.id + ' has no visible link to another declared screen');
    const target = R.routes.find(item => item.id === link.target_id);
    await take(frame);
    await click(frame, target);
    await assertScreen(frame, target, 'navigation');
    await take(frame);
    await frame.evaluate(() => { setTimeout(() => history.back(), 0); });
    frame = await find(isApp, settled, 'Application frame');
    await assertScreen(frame, route, 'back');
    await take(frame);
    await frame.evaluate(() => { setTimeout(() => history.forward(), 0); });
    frame = await find(isApp, settled, 'Application frame');
    await assertScreen(frame, target, 'forward');
    navigation = { status: 'pass', target_id: target.id, back: true, forward: true };
    lap('navigation');
  }
  await take(frame);
  return { ...route, ...reloaded, horizontal_overflow: direct.horizontal_overflow || reloaded.horizontal_overflow,
    visible_text_length: Math.min(direct.visible_text_length, reloaded.visible_text_length),
    violations: [...direct.violations, ...reloaded.violations], accessibility_incomplete: [...new Set([...direct.accessibility_incomplete, ...reloaded.accessibility_incomplete])],
    direct_entry: true, reload: true, navigation, navigation_api };
}
await (async () => {
  let report;
  try {
    page = await openTab(HOST); lap('open');
    await setSrc(BLANK);
    const result = UNIT === 'initial' ? await initialUnit() : await routeUnit();
    const hostBlocked = Number(await page.evaluate(() => document.documentElement.dataset.h50blocked || 0)) || 0;
    out.blocked += hostBlocked;
    for (let count = 0; count < hostBlocked && out.errors.length < 100; count++) out.errors.push('requestfailed');
    report = { ok: true, result, errors: out.errors, blocked: out.blocked, env, pwd: String(pwd), timings };
  } catch (error) {
    report = { ok: false, error: String(error && error.message || error), timings };
  } finally {
    if (page) { try { await Promise.race([cleanupFreshStorage(), sleep(15000)]); } catch (error) {} try { await closeTab(page); } catch (error) {} }
  }
  lap('close'); report.timings = timings;
  console.log('__H50__' + JSON.stringify(report));
})();
`;
  if (script.includes('"')) throw new Error('Aside chunk script must not contain double quotes');
  if (script.length > MAX_CHUNK_SCRIPT_LENGTH) throw new Error('Aside chunk script exceeds the CLI argument limit');
  return script;
}
