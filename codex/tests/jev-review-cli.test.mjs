import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../scripts/jev-review.mjs', import.meta.url));
const diagnostic = { error: { code: 'JEV_COMMAND_FAILED', message: 'Jev review command failed' } };
const topic = 'The page must provide a year filter.';
const planPath = 'step_archive/step025_planning_chunk1.md';
const excerpt = 'A year filter is provided above the chart.';
const input = { schema_version: 1, topic_excerpt: topic, planning: [{ path: planPath, excerpt }],
  requirements: [{ id: 'year-filter', text: topic }] };

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness50-jev-cli-'));
  t.after(async () => {
    assert.equal(dirname(root), tmpdir());
    assert.ok(basename(root).startsWith('harness50-jev-cli-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'step_archive', 'TOPIC'), { recursive: true });
  await writeFile(join(root, 'step_archive', 'TOPIC', 'TOPIC.md'), topic);
  await writeFile(join(root, planPath), excerpt);
  return root;
}

function run(args, stdin = '', { mockService = false } = {}) {
  const env = { ...process.env };
  delete env.TYPESAFE_API_KEY;
  // Every CLI test replaces fetch locally; no test can contact the service.
  let preloadCode = 'globalThis.fetch=()=>{throw Error("UNEXPECTED_FETCH")}';
  if (mockService) {
    env.TYPESAFE_API_KEY = 'synthetic-cli-key-only';
    preloadCode = `globalThis.fetch=async()=>new Response(JSON.stringify({
      model:'jev-1.13.0',answers:{'year-filter':{type:'choice',choice:'unmet',
      probabilities:{met:0,unmet:1,insufficient_evidence:0},confidence:1}},
      usage:{input_tokens:40,output_tokens:8}}))`;
  }
  const preload = 'data:text/javascript,' + encodeURIComponent(preloadCode);
  const result = spawnSync(process.execPath, ['--import', preload, cli, ...args], {
    input: stdin, encoding: 'utf8', env, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}

function success(result, exit = 0) {
  assert.equal(result.status, exit, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function failure(result) {
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), diagnostic);
}

test('Jev CLI rejects ambiguous flags and missing network opt-in without side effects', async t => {
  const root = await workspace(t);
  const base = ['prepare', '--workspace', root, '--input', '-'];
  for (const args of [
    [], ['unknown'], [...base, '--extra', 'private-value'], [...base, '--workspace', root],
    [...base, '--allow-network'], ['prepare', '--workspace', root],
    ['prepare', '--workspace', root, '--input', 'private.json'],
    ['prepare', '--workspace=' + root, '--input', '-'],
    ['run', '--workspace', root, '--input', '-'],
    ['run', '--workspace', root, '--input', '-', '--allow-network', '--allow-network'],
    ['run', '--workspace', root, '--input', '-', '--allow-network', 'true'],
    ['run', '--workspace', root, '--input', '-', '--allow-network', '--api-key', 'private-value'],
    ['inspect', '--workspace', root, '--report', 'private.json', '--input', '-']
  ]) failure(run(args, JSON.stringify(input)));
  assert.deepEqual((await readdir(join(root, 'step_archive'))).sort(), ['TOPIC', 'step025_planning_chunk1.md']);
});

test('Jev CLI rejects malformed or excessive stdin with sanitized diagnostics', async t => {
  const root = await workspace(t);
  const args = ['prepare', '--workspace', root, '--input', '-'];
  for (const stdin of ['', '{"private-value":', '[]', 'null', '{} {}', Buffer.from([0xc3, 0x28]),
    JSON.stringify({ private: 'sensitive-value'.repeat(6000) }), JSON.stringify({ ...input, private: 'private-value' }),
    JSON.stringify({ ...input, topic_excerpt: 'private-value' })]) failure(run(args, stdin));
});

test('Jev CLI prepares offline and prints provenance without source text', async t => {
  const root = await workspace(t);
  const result = run(['prepare', '--workspace', root, '--input', '-'], JSON.stringify(input));
  const prepared = success(result);
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.role, 'advisory');
  assert.equal(prepared.step, 25);
  assert.equal(prepared.criterion_count, 1);
  assert.equal(result.stdout.includes(topic), false);
  assert.equal(result.stdout.includes(excerpt), false);
  assert.deepEqual((await readdir(join(root, 'step_archive'))).sort(), ['TOPIC', 'step025_planning_chunk1.md']);
});

test('Jev CLI missing credentials stays unverified and source edits make inspection stale', async t => {
  const root = await workspace(t);
  const reviewed = success(run(['run', '--workspace', root, '--input', '-', '--allow-network'], JSON.stringify(input)), 2);
  assert.equal(reviewed.status, 'unverified');
  assert.match(reviewed.report_path, /^step_archive\/outputs\/jev-reviews\/[a-f0-9]{64}\.json$/);
  const inspectArgs = ['inspect', '--workspace', root, '--report', reviewed.report_path];
  const current = success(run(inspectArgs), 2);
  assert.equal(current.status, 'current');
  assert.equal(current.review_status, 'unverified');
  await writeFile(join(root, planPath), 'Changed planning.');
  assert.equal(success(run(inspectArgs), 2).status, 'stale');
  assert.equal(success(run(['inspect', '--workspace', root, '--report', '../private.json']), 2).status, 'invalid');
});

test('Jev CLI successful service response stays advisory even when the criterion is unmet', async t => {
  const root = await workspace(t);
  const result = run(['run', '--workspace', root, '--input', '-', '--allow-network'],
    JSON.stringify(input), { mockService: true });
  const reviewed = success(result);
  assert.equal(reviewed.status, 'reviewed');
  assert.equal(reviewed.role, 'advisory');
  assert.equal(reviewed.results[0].choice, 'unmet');
  for (const value of [topic, excerpt, 'synthetic-cli-key-only', 'PASS']) assert.equal(result.stdout.includes(value), false);
  const inspected = success(run(['inspect', '--workspace', root, '--report', reviewed.report_path]));
  assert.equal(inspected.status, 'current');
  assert.equal(inspected.review_status, 'reviewed');
  assert.equal(inspected.results[0].choice, 'unmet');
});
