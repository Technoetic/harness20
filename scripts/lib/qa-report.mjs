import { randomUUID } from 'node:crypto';
import { parseStrictJson } from './strict-json.mjs';
import { open, unlink } from 'node:fs/promises';
import { physicalWorkspace, safePath, readSafe, writeSafe, sha256 } from './quality-files.mjs';

import { workflowContext, recheckWorkflowContext, evidenceDirectory } from './workflow-context.mjs';

const BASE = 'step_archive/outputs/qa-reports';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/;
const LIMIT = 64 * 1024;
const SECRET = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]|\bbearer\s+\S+|\b(?:sk|ghp|github_pat)[_-][a-zA-Z0-9_-]{16,}|https?:\/\/[^\s/]+:[^\s/]+@)/i;
const error = () => new Error('QA evidence rejected: invalid, unsafe, changed or already recorded input.');
const require = condition => { if (!condition) throw error(); };
const bytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const stepName = step => `step${String(step).padStart(3, '0')}`;
const pointerPath = (step, base) => `${base}/${stepName(step)}.latest.json`;

function object(value, fields) {
  require(value && typeof value === 'object' && !Array.isArray(value));
  require(Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)));
}
function text(value, max = 1024, empty = false) {
  require(typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0));
  require(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) && !SECRET.test(value));
  return value;
}
function list(value, max, min = 0) {
  require(Array.isArray(value) && value.length >= min && value.length <= max);
  return value;
}
function stepNumber(step) { require(Number.isInteger(step) && step >= 1 && step <= 50); }
function identifier(value) { text(value, 80); require(ID.test(value)); return value; }
function unique(values) { require(new Set(values.map(value => value.toLowerCase())).size === values.length); }
function evidencePath(name, kind) {
  text(name, 240);
  require(!name.includes('\\') && !name.includes(':') && !/[\r\n\t]/.test(name));
  const parts = name.split('/');
  require(parts.every(part => part && !part.startsWith('.') && !/[. ]$/.test(part) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) &&
    !/^(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/i.test(part) &&
    !/\.(?:pem|key|p12|pfx)$/i.test(part)));
  require(!parts.some(part => ['node_modules', 'coverage'].includes(part.toLowerCase())));
  if (kind === 'artifact') require(parts[0].toLowerCase() !== 'step_archive');
  else require((name.startsWith('step_archive/outputs/') || name.startsWith('step_archive/screenshots/') ||
      /^step_archive\/step\d{3}_[^/]+$/.test(name)) && !name.toLowerCase().startsWith(`${BASE}/`));
  return name;
}
function checks(value) {
  const result = list(value, 64, 1).map(check => {
    object(check, ['id', 'requirement']);
    return { id: identifier(check.id), requirement: text(check.requirement, 512) };
  });
  unique(result.map(check => check.id));
  return result;
}
async function hashes(root, paths, kind) {
  unique(paths);
  let total = 0;
  const result = [];
  for (const path of paths) {
    evidencePath(path, kind);
    const data = await readSafe(root, path);
    total += data.length;
    require(total <= 64 * 1024 * 1024);
    result.push({ path, sha256: sha256(data) });
  }
  return result;
}
function entries(value, kind, max) {
  return list(value, max).map(entry => {
    object(entry, ['path', 'sha256']);
    evidencePath(entry.path, kind);
    require(HASH.test(entry.sha256));
    return { ...entry };
  });
}
async function sameFiles(root, captured, kind) {
  const current = await hashes(root, captured.map(entry => entry.path), kind);
  require(JSON.stringify(current) === JSON.stringify(captured));
}
async function json(root, path) {
  const data = await readSafe(root, path, LIMIT);
  return { value: parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(data)), digest: sha256(data) };
}
async function writeOnce(root, path, data) {
  require(data.length <= LIMIT);
  const target = await safePath(root, path, { createParents: true });
  const handle = await open(target, 'wx', 0o600);
  let success = false;
  try { await handle.writeFile(data); await handle.sync(); success = true; }
  finally {
    await handle.close();
    if (!success) await unlink(target).catch(() => {});
  }
}
function snapshotShape(value, step, id) {
  object(value, ['schema_version', 'snapshot_id', 'step', 'created_at', 'artifacts', 'checks']);
  require(value.schema_version === 1 && value.step === step && value.snapshot_id === id && UUID.test(id));
  require(typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at)));
  list(value.artifacts, 128, 1);
  entries(value.artifacts, 'artifact', 128);
  unique(value.artifacts.map(entry => entry.path));
  checks(value.checks);
}
async function snapshotRead(root, step, id, base) {
  require(typeof id === 'string' && UUID.test(id));
  const loaded = await json(root, `${base}/${id}.snapshot.json`);
  snapshotShape(loaded.value, step, id);
  return loaded;
}
function recordInput(input, snapshot) {
  object(input, ['snapshot_id', 'verifier', 'outcomes', 'next_actions']);
  require(input.snapshot_id === snapshot.snapshot_id);
  object(input.verifier, ['id', 'mode']);
  identifier(input.verifier.id);
  require(['independent', 'same-agent'].includes(input.verifier.mode));
  const outcomes = list(input.outcomes, 64, 1).map(outcome => {
    object(outcome, ['id', 'status', 'observation', 'evidence_paths', 'next_check']);
    identifier(outcome.id);
    require(['pass', 'fail', 'unverified'].includes(outcome.status));
    text(outcome.observation);
    text(outcome.next_check, 512, outcome.status === 'pass');
    list(outcome.evidence_paths, 8, outcome.status === 'pass' ? 1 : 0).forEach(path => evidencePath(path, 'evidence'));
    unique(outcome.evidence_paths);
    return { ...outcome, evidence_paths: [...outcome.evidence_paths] };
  });
  unique(outcomes.map(outcome => outcome.id));
  require(outcomes.length === snapshot.checks.length && snapshot.checks.every(check => outcomes.some(outcome => outcome.id === check.id)));
  list(input.next_actions, 3).forEach(action => text(action, 512));
  return { ...input, verifier: { ...input.verifier }, outcomes, next_actions: [...input.next_actions] };
}
function reportShape(report, snapshot, step, snapshotDigest) {
  object(report, ['schema_version', 'step', 'snapshot_id', 'snapshot_sha256', 'verifier', 'outcomes', 'next_actions', 'verdict']);
  require(report.schema_version === 1 && report.step === step && report.snapshot_sha256 === snapshotDigest);
  list(report.outcomes, 64, 1);
  const outcomes = report.outcomes.map(outcome => {
    object(outcome, ['id', 'status', 'observation', 'evidence', 'next_check']);
    entries(outcome.evidence, 'evidence', 8);
    return { id: outcome.id, status: outcome.status, observation: outcome.observation,
      evidence_paths: outcome.evidence.map(entry => entry.path), next_check: outcome.next_check };
  });
  recordInput({ snapshot_id: report.snapshot_id, verifier: report.verifier, outcomes, next_actions: report.next_actions }, snapshot);
  require(report.verdict === (outcomes.every(outcome => outcome.status === 'pass') ? 'PASS' : 'INCOMPLETE'));
}

export async function snapshotQa(workspaceRoot, step, input, options = {}) {
  try {
    stepNumber(step);
    object(input, ['artifacts', 'checks']);
    const names = [...list(input.artifacts, 128, 1)];
    const criteria = checks(input.checks);
    const root = await physicalWorkspace(workspaceRoot);
    const context = await workflowContext(root, options);
    require(step <= context.profile.stepCount);
    const base = evidenceDirectory(BASE, context);
    const artifacts = await hashes(root, names, 'artifact');
    const snapshot = { schema_version: 1, snapshot_id: randomUUID(), step, created_at: new Date().toISOString(), artifacts, checks: criteria };
    await sameFiles(root, artifacts, 'artifact');
    await recheckWorkflowContext(root, context);
    await writeOnce(root, `${base}/${snapshot.snapshot_id}.snapshot.json`, bytes(snapshot));
    return { snapshot_id: snapshot.snapshot_id, step };
  } catch { throw error(); }
}

export async function recordQa(workspaceRoot, step, raw, options = {}) {
  try {
    stepNumber(step);
    const inputCopy = structuredClone(raw);
    const root = await physicalWorkspace(workspaceRoot);
    const context = await workflowContext(root, options);
    require(step <= context.profile.stepCount);
    const base = evidenceDirectory(BASE, context);
    const loaded = await snapshotRead(root, step, inputCopy?.snapshot_id, base);
    const snapshot = loaded.value;
    const input = recordInput(inputCopy, snapshot);
    await sameFiles(root, snapshot.artifacts, 'artifact');
    const outcomes = [];
    const evidencePaths = [...new Set(input.outcomes.flatMap(outcome => outcome.evidence_paths))];
    require(evidencePaths.length <= 128);
    const evidence = await hashes(root, evidencePaths, 'evidence');
    for (const { evidence_paths, ...outcome } of input.outcomes) {
      outcomes.push({ ...outcome, evidence: evidence_paths.map(path => evidence.find(entry => entry.path === path)) });
    }
    const report = { schema_version: 1, step, snapshot_id: snapshot.snapshot_id, snapshot_sha256: loaded.digest,
      verifier: input.verifier, outcomes, next_actions: input.next_actions,
      verdict: outcomes.every(outcome => outcome.status === 'pass') ? 'PASS' : 'INCOMPLETE' };
    const data = bytes(report);
    require(data.length <= LIMIT);
    await sameFiles(root, snapshot.artifacts, 'artifact');
    await sameFiles(root, evidence, 'evidence');
    require((await snapshotRead(root, step, snapshot.snapshot_id, base)).digest === loaded.digest);
    await recheckWorkflowContext(root, context);
    const reportDigest = sha256(data);
    // A per-snapshot claim prevents concurrent calls from publishing different assessments.
    // A process crash can leave an unusable claim; take a new snapshot, never silently steal it.
    await writeOnce(root, `${base}/${snapshot.snapshot_id}.recorded.json`, bytes({ report_sha256: reportDigest }));
    await writeOnce(root, `${base}/${reportDigest}.report.json`, data);
    await recheckWorkflowContext(root, context);
    await writeSafe(root, pointerPath(step, base), bytes({ schema_version: 1, step, report_sha256: reportDigest }));
    return { status: 'recorded', step, report_sha256: reportDigest, verdict: report.verdict };
  } catch { throw error(); }
}

export async function inspectQa(workspaceRoot, step, options = {}) {
  const empty = status => ({ status, step, verdict: 'INCOMPLETE', preserve: [] });
  try {
    stepNumber(step);
    const root = await physicalWorkspace(workspaceRoot);
    const context = await workflowContext(root, options);
    require(step <= context.profile.stepCount);
    const base = evidenceDirectory(BASE, context);
    let pointer;
    try { pointer = (await json(root, pointerPath(step, base))).value; }
    catch (failure) { if (failure.code === 'ENOENT') return empty('missing'); throw failure; }
    object(pointer, ['schema_version', 'step', 'report_sha256']);
    require(pointer.schema_version === 1 && pointer.step === step && HASH.test(pointer.report_sha256));
    const loaded = await json(root, `${base}/${pointer.report_sha256}.report.json`);
    require(loaded.digest === pointer.report_sha256);
    const report = loaded.value;
    const snapshot = await snapshotRead(root, step, report.snapshot_id, base);
    reportShape(report, snapshot.value, step, snapshot.digest);
    const claim = (await json(root, `${base}/${report.snapshot_id}.recorded.json`)).value;
    object(claim, ['report_sha256']);
    require(claim.report_sha256 === loaded.digest);
    let current = true;
    try {
      await sameFiles(root, snapshot.value.artifacts, 'artifact');
      const evidence = [...new Map(report.outcomes.flatMap(outcome => outcome.evidence).map(entry => [entry.path, entry])).values()];
      require(evidence.length <= 128);
      await sameFiles(root, evidence, 'evidence');
      await sameFiles(root, snapshot.value.artifacts, 'artifact');
    } catch { current = false; }
    require((await json(root, pointerPath(step, base))).value.report_sha256 === loaded.digest);
    require((await json(root, `${base}/${loaded.digest}.report.json`)).digest === loaded.digest);
    require((await snapshotRead(root, step, report.snapshot_id, base)).digest === snapshot.digest);
    await recheckWorkflowContext(root, context);
    return { status: current ? 'current' : 'stale', step, verdict: current ? report.verdict : 'INCOMPLETE',
      preserve: current ? report.outcomes.filter(outcome => outcome.status === 'pass').map(outcome => outcome.id) : [],
      report_sha256: loaded.digest, report_path: `${base}/${loaded.digest}.report.json`, pointer_path: pointerPath(step, base), artifacts: snapshot.value.artifacts, report };
  } catch { return empty('invalid'); }
}
