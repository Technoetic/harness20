// Playwright backend for scripts/verify-output.mjs (see the dispatcher for the contract).
// `playwright` and `@axe-core/playwright` are imported lazily so this module loads
// (and `node --check` passes) without the packages installed.
import { createRequire } from 'node:module';
import { requireHostNetworkIsolation } from '../scripts/lib/host-network-isolation.mjs';

export async function available() {
  try { await import('playwright'); return true; }
  catch { return false; }
}

export async function toolVersion() {
  try { return createRequire(import.meta.url)('playwright/package.json').version ?? null; }
  catch { return null; }
}

async function probeNavigationApi(page, unavailable) {
  const observed = await page.evaluate(() => ({
    available: typeof window.navigation?.navigate === 'function' && typeof window.navigation.addEventListener === 'function' && window.navigation.currentEntry != null &&
      typeof window.NavigateEvent?.prototype?.intercept === 'function',
    property_present: 'navigation' in window
  }));
  if (unavailable && (observed.available || observed.property_present)) throw new Error('Navigation API absence could not be verified');
  return observed;
}

async function assertScreen(page, routing, route, phase, unavailable, routeUrl) {
  await probeNavigationApi(page, unavailable);
  try {
    await page.waitForFunction(({ routing, id, url }) => {
      if (location.href !== url) return false;
      const declarations = [...document.querySelectorAll('#harness50-routes')];
      if (declarations.length !== 1 || declarations[0].tagName !== 'SCRIPT' || declarations[0].parentElement !== document.head || declarations[0].getAttribute('type') !== 'application/json') return false;
      let manifest;
      try { manifest = JSON.parse(declarations[0].textContent); } catch { return false; }
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
    }, { routing, id: route.id, url: routeUrl(routing, route.path) }, { timeout: 3000 });
  } catch { throw new Error(`Route ${route.id} failed ${phase}: URL and visible screen must agree`); }
  return probeNavigationApi(page, unavailable);
}

async function measure(page, AxeBuilder) {
  const metrics = await page.evaluate(() => ({
    horizontal_overflow: document.documentElement.scrollWidth > innerWidth + 1,
    visible_text_length: document.body.innerText.trim().length,
    dom_content_loaded_ms: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? null,
    focusable_elements: [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0).length
  }));
  const analysis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return { ...metrics, violations: analysis.violations.map(item => ({ id: item.id, impact: item.impact, affected_nodes: item.nodes.length })), accessibility_incomplete: analysis.incomplete.map(item => item.id) };
}

async function outgoingLink(page, routing, route, routeUrl) {
  const links = page.locator('a[href]');
  for (let index = 0; index < await links.count(); index++) {
    const link = links.nth(index);
    if (!await link.isVisible() || await link.getAttribute('download') !== null || ![null, '', '_self'].includes(await link.getAttribute('target'))) continue;
    const href = await link.evaluate(node => node.href);
    const target = routing.routes.find(item => item.id !== route.id && routeUrl(routing, item.path) === href);
    if (target) return { link, target };
  }
  throw new Error(`Route ${route.id} has no visible link to another declared screen`);
}

export async function run(ctx) {
  // Direct callers obey the same gate, before artifact access, package imports,
  // browser launch or any context routing can execute untrusted document bytes.
  requireHostNetworkIsolation('playwright', { report: ctx?.report });
  const { root, bytes, routing, report, timeoutMs, executablePath, viewports, entry, origin, routeUrl, passes, screenshotPath, writeSafe, ROUTE_ENTRY_PATH, UNKNOWN_ROUTE_PATH } = ctx;
  let browser, deadline;
  try {
    const started = Date.now();
    deadline = setTimeout(() => { report.error = 'Browser verification exceeded its deadline'; browser?.close().catch(() => {}); }, timeoutMs);
    const [{ chromium }, { default: AxeBuilder }] = await Promise.all([import('playwright'), import('@axe-core/playwright')]);
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), timeout: Math.max(1, Math.min(timeoutMs - (Date.now() - started), 15000)) });
    if (report.error) throw new Error(report.error);
    report.environment = { backend: 'playwright', isolation: 'fresh-context', deadline_scope: 'run', viewport_mode: 'context', screenshot_mode: 'full-page',
      browser: browser.version(), dpr: 1, color_scheme: 'light', reduced_motion: true, language: null, tool_version: await toolVersion() };
    const allowed = new Set([ROUTE_ENTRY_PATH, ...(routing.mode === 'history' ? [...routing.routes.map(route => route.path), UNKNOWN_ROUTE_PATH] : [])]);
    async function withPage(viewport, unavailable, task) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce' });
      if (unavailable) await context.addInitScript(() => {
        // Delete instead of assigning undefined: applications may feature-detect
        // with `in`. Run before application scripts on every new document.
        if (!Reflect.deleteProperty(window, 'navigation') || 'navigation' in window || typeof window.navigation !== 'undefined') {
          throw new Error('Navigation API could not be made unavailable');
        }
      });
      const errors = [];
      let blockedRequests = 0;
      let page;
      const recordError = kind => { if (errors.length < 100) errors.push(kind); };
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.isNavigationRequest() && request.frame() === page?.mainFrame() && url.origin === origin && !url.search && allowed.has(url.pathname)) await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: bytes });
        else { blockedRequests++; await route.abort('blockedbyclient'); }
      });
      await context.routeWebSocket('**/*', socket => { blockedRequests++; socket.close(); });
      page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', () => recordError('pageerror'));
      page.on('console', message => { if (message.type() === 'error') recordError('console.error'); });
      page.on('crash', () => recordError('crash'));
      page.on('dialog', dialog => { recordError('unexpected-dialog'); dialog.dismiss().catch(() => {}); });
      page.on('popup', popup => { recordError('unexpected-popup'); popup.close().catch(() => {}); });
      page.on('requestfailed', () => recordError('requestfailed'));
      try {
        const result = await task(page);
        return { ...result, errors, blocked_requests: blockedRequests };
      } finally { await context.close(); }
    }
    const fallback = routing.routes.find(route => route.id === routing.fallback);
    for (const scenario of [{ unavailable: false, viewports: report.viewports },
      { unavailable: true, viewports: report.compatibility.navigation_api_unavailable.viewports }]) {
      for (const viewport of viewports) {
        const initial = await withPage(viewport, scenario.unavailable, async page => {
          const historyBefore = await page.evaluate(() => history.length);
          await page.goto(entry, { waitUntil: 'load', timeout: 10000 });
          const navigationApi = await assertScreen(page, routing, fallback, 'initial entry', scenario.unavailable, routeUrl);
          if (await page.evaluate(() => history.length) !== historyBefore + 1) throw new Error('Initial fallback must replace its URL');
          await page.evaluate(() => document.fonts.ready);
          const metrics = await measure(page, AxeBuilder);
          await page.keyboard.press('Tab');
          const keyboardFocus = await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== document.documentElement);
          const screenshot = screenshotPath(scenario.unavailable, viewport.name);
          await writeSafe(root, screenshot, await page.screenshot({ fullPage: true, animations: 'disabled', timeout: 10000 }));
          const historyAtEntry = await page.evaluate(() => history.length);
          await page.goto(routeUrl(routing, UNKNOWN_ROUTE_PATH), { waitUntil: 'load', timeout: 10000 });
          await assertScreen(page, routing, fallback, 'unknown fallback', scenario.unavailable, routeUrl);
          if (await page.evaluate(() => history.length) !== historyAtEntry + 1) throw new Error('Unknown fallback must replace its URL');
          return { ...metrics, navigation_api: navigationApi, keyboard_focus: keyboardFocus, screenshot, initial_entry: true, unknown_fallback: true };
        });
        const view = { ...viewport, ...initial, routes: [], pass: false };
        scenario.viewports.push(view);
        for (const route of routing.routes) {
          const result = await withPage(viewport, scenario.unavailable, async page => {
            await page.goto(routeUrl(routing, route.path), { waitUntil: 'load', timeout: 10000 });
            const navigationApi = await assertScreen(page, routing, route, 'direct entry', scenario.unavailable, routeUrl);
            await page.evaluate(() => document.fonts.ready);
            const direct = await measure(page, AxeBuilder);
            await page.reload({ waitUntil: 'load', timeout: 10000 });
            await assertScreen(page, routing, route, 'reload', scenario.unavailable, routeUrl);
            const reloaded = await measure(page, AxeBuilder);
            let navigation = { status: 'not-applicable', reason: 'single-screen' };
            if (routing.routes.length > 1) {
              const { link, target } = await outgoingLink(page, routing, route, routeUrl);
              await link.click();
              await assertScreen(page, routing, target, 'navigation', scenario.unavailable, routeUrl);
              await page.goBack({ waitUntil: 'load', timeout: 10000 });
              await assertScreen(page, routing, route, 'back', scenario.unavailable, routeUrl);
              await page.goForward({ waitUntil: 'load', timeout: 10000 });
              await assertScreen(page, routing, target, 'forward', scenario.unavailable, routeUrl);
              navigation = { status: 'pass', target_id: target.id, back: true, forward: true };
            }
            return { ...route, ...reloaded, horizontal_overflow: direct.horizontal_overflow || reloaded.horizontal_overflow,
              visible_text_length: Math.min(direct.visible_text_length, reloaded.visible_text_length),
              violations: [...direct.violations, ...reloaded.violations], accessibility_incomplete: [...new Set([...direct.accessibility_incomplete, ...reloaded.accessibility_incomplete])],
              direct_entry: true, reload: true, navigation, navigation_api: navigationApi };
          });
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
  } catch (error) {
    // A deadline that fired mid-run closes the browser; report the deadline, not the resulting Playwright error.
    if (report.error === 'Browser verification exceeded its deadline') throw new Error(report.error);
    throw error;
  } finally { clearTimeout(deadline); await browser?.close().catch(() => {}); }
}
