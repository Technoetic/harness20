import { validateRouteManifest } from './route-contract.mjs';
import { parseStrictJson } from './strict-json.mjs';

function passingMetrics(value) {
  return value?.pass === true && Array.isArray(value.errors) && value.errors.length === 0 && value.blocked_requests === 0 &&
    Array.isArray(value.violations) && value.violations.length === 0 && Array.isArray(value.accessibility_incomplete) &&
    value.horizontal_overflow === false && Number.isInteger(value.visible_text_length) && value.visible_text_length > 0 &&
    Number.isInteger(value.focusable_elements) && value.focusable_elements >= 0;
}

function validNavigationProbe(value, unavailable) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === 'available,property_present' &&
    typeof value.available === 'boolean' && typeof value.property_present === 'boolean' &&
    (!value.available || value.property_present) && (!unavailable || (!value.available && !value.property_present));
}

export function readBrowserReportBytes(bytes, expectedRouting) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 1024 * 1024) throw new Error('Browser report exceeds its size limit');
  let report;
  try { report = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Browser report must be valid UTF-8 JSON'); }
  if (report?.schema_version !== 3 || report.verdict !== 'PASS' || report.error ||
    report.artifact_path !== 'dist/index.html' || !/^[a-f0-9]{64}$/.test(report.artifact_sha256 ?? '') ||
    typeof report.generated_at !== 'string' || !Number.isFinite(Date.parse(report.generated_at)) ||
    !Array.isArray(report.viewports) || report.viewports.length !== 2 ||
    !Array.isArray(report.compatibility?.navigation_api_unavailable?.viewports) ||
    report.compatibility.navigation_api_unavailable.viewports.length !== 2) throw new Error('Browser report is missing a passing schema-v3 artifact-bound result and compatibility checks');
  const routing = validateRouteManifest(report.routing);
  if (expectedRouting && JSON.stringify(routing) !== JSON.stringify(validateRouteManifest(expectedRouting))) throw new Error('Browser report routing does not match the final HTML manifest');
  for (const scenario of [{ unavailable: false, viewports: report.viewports },
    { unavailable: true, viewports: report.compatibility.navigation_api_unavailable.viewports }]) {
    for (const expected of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      const view = scenario.viewports.find(item => item?.name === expected.name);
      if (!view || view.width !== expected.width || view.height !== expected.height || !passingMetrics(view) ||
        typeof view.keyboard_focus !== 'boolean' || (view.focusable_elements > 0 && view.keyboard_focus !== true) ||
        !validNavigationProbe(view.navigation_api, scenario.unavailable) ||
        view.screenshot !== `step_archive/screenshots/verified-${scenario.unavailable ? 'navigation-api-unavailable-' : ''}${expected.name}.png` || view.initial_entry !== true || view.unknown_fallback !== true ||
        !Array.isArray(view.routes) || view.routes.length !== routing.routes.length) throw new Error('Browser report viewport did not pass measured route checks');
      for (const [index, route] of routing.routes.entries()) {
        const measured = view.routes[index], nav = measured?.navigation;
        if (measured?.id !== route.id || measured?.path !== route.path || !passingMetrics(measured) || measured.direct_entry !== true || measured.reload !== true ||
          !validNavigationProbe(measured.navigation_api, scenario.unavailable)) throw new Error('Browser report lacks exact per-route measurements and API probes');
        const single = routing.routes.length === 1;
        if (single ? (nav?.status !== 'not-applicable' || nav?.reason !== 'single-screen') :
          (nav?.status !== 'pass' || nav.back !== true || nav.forward !== true || nav.target_id === route.id || !routing.routes.some(item => item.id === nav.target_id))) throw new Error('Browser report route navigation did not pass history checks');
      }
    }
  }
  return report;
}

export function validateBrowserReportBytes(bytes, expectedRouting) {
  return readBrowserReportBytes(bytes, expectedRouting).artifact_sha256;
}
