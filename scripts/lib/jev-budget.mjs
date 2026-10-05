import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { physicalWorkspace, safePath, readSafe, writeSafe } from './quality-files.mjs';
import { parseStrictJson } from './strict-json.mjs';

export const JEV_BUDGET_LIMITS = Object.freeze({ scope: 'user-global-across-api-keys-and-workflows', requests_per_minute: 12, requests_per_day: 200,
  reserved_input_bytes_per_minute: 786432, reserved_input_bytes_per_day: 8 * 1024 * 1024,
  same_request_per_day: 3, request_bytes: 65536, lock_wait_ms: 2000 });
const HASH = /^[a-f0-9]{64}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const exact = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const integer = value => Number.isSafeInteger(value) && value >= 0;
function fail(code) { const error = new Error('Jev request budget denied.'); error.code = code; throw error; }

function validate(value) {
  if (!exact(value, ['schema_version', 'day', 'minute', 'last_seen', 'day_requests', 'minute_requests',
    'day_input_bytes', 'minute_input_bytes', 'request_attempts']) || value.schema_version !== 1
    || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)
    || !['minute', 'last_seen', 'day_requests', 'minute_requests', 'day_input_bytes', 'minute_input_bytes'].every(k => integer(value[k]))
    || value.day_requests > JEV_BUDGET_LIMITS.requests_per_day || value.minute_requests > JEV_BUDGET_LIMITS.requests_per_minute
    || value.minute_requests > value.day_requests || value.minute_input_bytes > value.day_input_bytes
    || value.day_input_bytes > JEV_BUDGET_LIMITS.reserved_input_bytes_per_day
    || value.minute_input_bytes > JEV_BUDGET_LIMITS.reserved_input_bytes_per_minute
    || !Array.isArray(value.request_attempts) || value.request_attempts.length > JEV_BUDGET_LIMITS.requests_per_day) fail('budget_unavailable');
  let count = 0;
  const hashes = new Set();
  for (const row of value.request_attempts) {
    if (!exact(row, ['request_hash', 'attempts']) || !HASH.test(row.request_hash)
        || !integer(row.attempts) || row.attempts < 1 || row.attempts > JEV_BUDGET_LIMITS.same_request_per_day
        || hashes.has(row.request_hash)) fail('budget_unavailable');
    hashes.add(row.request_hash); count += row.attempts;
  }
  if (count !== value.day_requests) fail('budget_unavailable');
  // A malformed historical bucket must not look like a legitimate new day.
  if (new Date(value.last_seen).toISOString().slice(0, 10) !== value.day
      || Math.floor(value.last_seen / 60000) !== value.minute
      || value.day_input_bytes < value.day_requests || value.minute_input_bytes < value.minute_requests
      || value.day_input_bytes > value.day_requests * JEV_BUDGET_LIMITS.request_bytes
      || value.minute_input_bytes > value.minute_requests * JEV_BUDGET_LIMITS.request_bytes) fail('budget_unavailable');
}

async function lock(root, name) {
  const deadline = Date.now() + JEV_BUDGET_LIMITS.lock_wait_ms;
  for (;;) {
    const path = await safePath(root, name);
    try {
      const handle = await open(path, 'wx', 0o600);
      const marker = randomUUID();
      try { await handle.writeFile(marker); await handle.sync(); }
      catch (error) { await handle.close(); throw error; }
      const owned = await handle.stat({ bigint: true });
      return async () => {
        try {
          await safePath(root, name);
          const current = await lstat(path, { bigint: true });
          if (current.ino !== owned.ino || current.dev !== owned.dev || current.nlink !== 1n
              || !(await readSafe(root, name, 64)).equals(Buffer.from(marker))) fail('budget_unavailable');
          await unlink(path);
        } finally { await handle.close(); }
      };
    } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) fail('budget_unavailable');
      // Existing locks are never deleted automatically, including after a crash.
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

// Reserve before dispatch, including calls that fail or time out. There are no
// refunds and no input/options capable of increasing the compiled ceilings.
// This controls this adapter's requests, not the provider's monetary billing or
// another process with OS permission to modify this trusted user-state directory.
export async function reserveJevBudget({ apiKey, request, budgetRoot } = {}) {
  let release;
  try {
    if (typeof apiKey !== 'string' || !apiKey || typeof request !== 'string') fail('budget_unavailable');
    const bytes = Buffer.byteLength(request);
    if (bytes < 1 || bytes > JEV_BUDGET_LIMITS.request_bytes) fail('budget_exhausted');
    const selectedRoot = budgetRoot ?? process.env.HARNESS36_JEV_BUDGET_ROOT ?? join(homedir(), '.harness36-security', 'jev-budget');
    if (typeof selectedRoot !== 'string' || !isAbsolute(selectedRoot)) fail('budget_unavailable');
    await mkdir(selectedRoot, { recursive: true, mode: 0o700 });
    const root = await physicalWorkspace(selectedRoot);
    // One user ledger spans all keys and all workflow generations. Rotating bad
    // credentials must not turn authentication failures into unbounded traffic.
    const identity = hash(apiKey), name = 'user-global.json';
    release = await lock(root, 'user-global.lock');
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10), minute = Math.floor(now / 60000);
    let value;
    try { value = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(await readSafe(root, name, 32768))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (value) { validate(value); if (value.last_seen > now || value.day > day || value.minute > minute) fail('budget_unavailable'); }
    if (!value || value.day !== day) value = { schema_version: 1, day, minute, last_seen: now,
      day_requests: 0, minute_requests: 0, day_input_bytes: 0, minute_input_bytes: 0, request_attempts: [] };
    if (value.minute !== minute) { value.minute = minute; value.minute_requests = 0; value.minute_input_bytes = 0; }
    const requestHash = hash(JSON.stringify([identity, hash(request)]));
    const existing = value.request_attempts.find(row => row.request_hash === requestHash);
    if (value.day_requests >= JEV_BUDGET_LIMITS.requests_per_day || value.minute_requests >= JEV_BUDGET_LIMITS.requests_per_minute
        || value.day_input_bytes + bytes > JEV_BUDGET_LIMITS.reserved_input_bytes_per_day
        || value.minute_input_bytes + bytes > JEV_BUDGET_LIMITS.reserved_input_bytes_per_minute
        || (existing?.attempts ?? 0) >= JEV_BUDGET_LIMITS.same_request_per_day) fail('budget_exhausted');
    value.last_seen = now; value.day_requests++; value.minute_requests++;
    value.day_input_bytes += bytes; value.minute_input_bytes += bytes;
    if (existing) existing.attempts++; else value.request_attempts.push({ request_hash: requestHash, attempts: 1 });
    await writeSafe(root, name, Buffer.from(JSON.stringify(value) + '\n'));
  } catch (error) {
    fail(error.code === 'budget_exhausted' ? 'budget_exhausted' : 'budget_unavailable');
  } finally {
    if (release) { try { await release(); } catch { fail('budget_unavailable'); } }
  }
}
