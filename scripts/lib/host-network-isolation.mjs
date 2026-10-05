// Native generated-HTML execution policy shared by every shipping backend.
// No current adapter supplies a verified per-tab all-transport host boundary.
// Request routing, CSP, fresh profiles and JavaScript masking do not establish it.
// Workspace JSON, CLI arguments and environment variables cannot grant capability.
const FAKE_ASIDE_EXECUTORS = new WeakSet();

// This seam models an adapter only in trusted Node unit tests. It is restricted to
// Aside's injected fake executor; it never enrolls a native adapter or dispatcher.
export const testOnly = Object.freeze({
  registerFakeAsideExecutor(execute) {
    if (typeof execute !== 'function') throw new Error('Expected a trusted fake unit-test executor');
    FAKE_ASIDE_EXECUTORS.add(execute);
    return execute;
  }
});

export function requireHostNetworkIsolation(backend, { execute, report } = {}) {
  if (backend === 'aside' && FAKE_ASIDE_EXECUTORS.has(execute)) return;
  if (report) report.environment = {
    backend, isolation: 'unsupported', network_isolation: 'missing-host-all-transport-egress'
  };
  const error = new Error('Generated HTML execution is unavailable: verified per-tab host network isolation is required. HTTP CSP and browser request routes are not all-transport egress controls. No shipped browser backend provides the required native host isolation. No artifact was served or opened.');
  error.code = backend === 'aside' ? 'ASIDE_NETWORK_ISOLATION_UNSUPPORTED' : 'BROWSER_NETWORK_ISOLATION_UNSUPPORTED';
  throw error;
}
