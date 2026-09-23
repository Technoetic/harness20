// Step 3 browser backend lock. Step 3 probes the validation checkout once and records the
// selected backend inside the project; every later `auto` verification reuses that choice
// instead of re-running the Playwright -> Aside order, so a project that chose Aside never
// switches (or is told to install Playwright/Chromium) later on.
//
// Precedence (see docs/BROWSER-TOOLS.md, "Backend lock (Step 3)"):
//   1. an explicit backend (`--backend playwright|aside` or HARNESS50_BROWSER_BACKEND) wins and
//      the lock is not consulted;
//   2. otherwise a valid lock picks the backend, which must be available (no fallback);
//   3. without a lock the historical `auto` order applies: playwright, then aside.
// A missing lock (ENOENT) means "no lock"; any other problem fails closed.
import { readSafe, writeSafe } from './quality-files.mjs';

export const LOCK_PATH = 'step_archive/outputs/browser-backend.json';
export const LOCKABLE_BACKENDS = Object.freeze(['playwright', 'aside']);
export const MISSING_TOOLS = 'Browser tools missing: install browser-verifier (cd browser-verifier && npm ci && npx playwright install chromium) or the Aside CLI (aside --version)';
export const INVALID_LOCK = `Browser backend lock ${LOCK_PATH} is invalid; rerun the Step 3 probe with --backend <name> --lock to record the backend Step 3 selected`;

const LOCK_LIMIT = 4096;
const TOOL_VERSION_LIMIT = 256;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const KEEP = 'Keep the locked backend; do not install another browser backend or browser binaries. To change backends deliberately, rerun the Step 3 probe with --backend <name> --lock.';
const REPAIR = {
  aside: 'start the Aside app and check that `aside --version` works in this shell.',
  playwright: 'run npm ci in browser-verifier/ of the validation checkout (Chromium: npx playwright install chromium).'
};

const isLockable = value => LOCKABLE_BACKENDS.includes(value);
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isToolVersion = value => value === null || (typeof value === 'string' && value.length <= TOOL_VERSION_LIMIT);

// Names only the locked backend, so an Aside project is never pointed at Playwright and a
// Playwright project is never pointed at Aside.
export function lockedUnavailableMessage(name) {
  if (!isLockable(name)) throw new Error('Invalid browser backend');
  return `Browser backend locked to ${name} by ${LOCK_PATH} (Step 3) is not available: ${REPAIR[name]} ${KEEP}`;
}

// Validates lock bytes: strict UTF-8 JSON (no BOM), schema_version 1, a lockable backend, a
// string-or-null tool_version and an ISO-8601 probed_at. Unknown extra keys are ignored.
export function parseBackendLock(bytes) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { throw new Error(INVALID_LOCK); }
  if (!isPlainObject(value) || value.schema_version !== 1 || !isLockable(value.selected) || !isToolVersion(value.tool_version) ||
    typeof value.probed_at !== 'string' || !ISO_TIMESTAMP.test(value.probed_at) || !Number.isFinite(Date.parse(value.probed_at))) {
    throw new Error(INVALID_LOCK);
  }
  return { schema_version: 1, selected: value.selected, tool_version: value.tool_version, probed_at: value.probed_at };
}

// `root` must already be a physical workspace (physicalWorkspace()). Returns null only when the
// lock (or one of its parent directories) does not exist.
export async function readBackendLock(root) {
  let bytes;
  try { bytes = await readSafe(root, LOCK_PATH, LOCK_LIMIT); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(INVALID_LOCK);
  }
  return parseBackendLock(bytes);
}

export async function writeBackendLock(root, { selected, tool_version = null, now = new Date() } = {}) {
  if (!isLockable(selected)) throw new Error('Invalid browser backend');
  if (tool_version !== null && typeof tool_version !== 'string') throw new Error('Invalid browser tool version');
  const probedAt = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(probedAt.getTime())) throw new Error('Invalid browser probe time');
  const version = tool_version === null ? null : tool_version.slice(0, TOOL_VERSION_LIMIT);
  const lock = { schema_version: 1, selected, tool_version: version, probed_at: probedAt.toISOString() };
  await writeSafe(root, LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

// Returns the backend name to run. An explicit backend is returned as-is (its own module
// reports why it cannot run); `auto` follows the lock, then the historical order.
// `isAvailable(name)` may be sync or async and is only asked about backends that matter.
export async function resolveBackend(requested, lock, isAvailable) {
  if (isLockable(requested)) return requested;
  if (requested !== 'auto') throw new Error('Invalid browser backend');
  if (lock) {
    if (!isLockable(lock.selected)) throw new Error(INVALID_LOCK);
    if (await isAvailable(lock.selected)) return lock.selected;
    throw new Error(lockedUnavailableMessage(lock.selected));
  }
  for (const name of LOCKABLE_BACKENDS) if (await isAvailable(name)) return name;
  throw new Error(MISSING_TOOLS);
}
