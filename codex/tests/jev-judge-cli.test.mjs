import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../scripts/jev-judge.mjs', import.meta.url));
const diagnostic = { error: { code: 'JEV_COMMAND_FAILED', message: 'Jev judgment command failed' } };
const excerpt = 'The demonstration interface provides a year selector above its chart.';
const sourcePath = 'step_archive/step025_planning_chunk1.md';
const input = { schema_version: 1, step: 25, sources: [{ path: sourcePath, excerpt }],
  questions: [{ id: 'year-selector', instructions: 'Does the interface have a year selector?',
    choices: { yes: 'Explicitly provided.', no: 'Explicitly absent.', unknown: 'Insufficient evidence.' }, abstain: 'unknown' }] };

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness50-jev-judge-cli-'));
  t.after(async () => {
    assert.equal(dirname(root), tmpdir());
    assert.ok(basename(root).startsWith('harness50-jev-judge-cli-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'step_archive'));
  await writeFile(join(root, sourcePath), excerpt);
  return root;
}

function run(args, stdin = '', choice) {
  const env = { ...process.env };
  delete env.TYPESAFE_API_KEY;
  let preloadCode = 'globalThis.fetch=()=>{throw Error("UNEXPECTED_FETCH")}';
  if (choice) {
    env.TYPESAFE_API_KEY = 'synthetic-cli-key-only';
    preloadCode = `globalThis.fetch=async()=>new Response(JSON.stringify({model:'jev-1.13.0',
      answers:{'year-selector':{type:'choice',choice:${JSON.stringify(choice)},
      probabilities:{yes:${choice === 'yes' ? 1 : 0},no:0,unknown:${choice === 'unknown' ? 1 : 0}},confidence:1}},
      usage:{input_tokens:40,output_tokens:8}}))`;
  }
  const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(preloadCode), cli, ...args], {
    input: stdin, encoding: 'utf8', env, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}

function resultJson(result, status = 0) {
  assert.equal(result.status, status, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('judgment CLI rejects ambiguous arguments before any network or writes', async t => {
  const root = await workspace(t);
  const base = ['prepare', '--workspace', root, '--input', '-'];
  for (const args of [[], ['unknown'], [...base, '--extra', 'private-value'], [...base, '--workspace', root],
    [...base, '--allow-network'], ['run', '--workspace', root, '--input', '-'],
    ['run', '--workspace', root, '--input', '-', '--allow-network', '--api-key', 'private-value'],
    ['run', '--workspace', root, '--input', '-', '--allow-network', '--allow-network'],
    ['prepare', '--workspace', root, '--input', 'private.json'],
    ['inspect', '--workspace', root, '--report', 'private.json', '--input', '-']]) {
    const result = run(args, JSON.stringify(input));
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), diagnostic);
  }
  assert.deepEqual(await readdir(join(root, 'step_archive')), ['step025_planning_chunk1.md']);
});

test('judgment CLI malformed input is sanitized and never includes submitted material', async t => {
  const root = await workspace(t);
  for (const stdin of ['', '{"private-value":', 'null', '[]', '{} {}', Buffer.from([0xc3, 0x28]),
    JSON.stringify({ private: 'sensitive-value'.repeat(6000) }), JSON.stringify({ ...input, step: 50 })]) {
    const result = run(['prepare', '--workspace', root, '--input', '-'], stdin);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), diagnostic);
  }
});

test('judgment CLI prepare is offline, read-only, and does not echo evidence', async t => {
  const root = await workspace(t);
  const result = run(['prepare', '--workspace', root, '--input', '-'], JSON.stringify(input));
  const value = resultJson(result);
  assert.equal(value.status, 'prepared');
  assert.equal(value.role, 'advisory');
  assert.equal(value.step, 25);
  assert.match(value.request_hash, /^[a-f0-9]{64}$/);
  assert.equal(result.stdout.includes(excerpt), false);
  assert.deepEqual(await readdir(join(root, 'step_archive')), ['step025_planning_chunk1.md']);
});

test('judgment CLI missing key produces unverified report; changed source is stale', async t => {
  const root = await workspace(t);
  const value = resultJson(run(['run', '--workspace', root, '--input', '-', '--allow-network'], JSON.stringify(input)), 2);
  assert.equal(value.status, 'unverified');
  assert.match(value.report_path, /^step_archive\/outputs\/jev-judgments\/[a-f0-9]{64}\.json$/);
  const args = ['inspect', '--workspace', root, '--report', value.report_path];
  const current = resultJson(run(args), 2);
  assert.equal(current.status, 'current');
  assert.equal(current.review_status, 'unverified');
  await writeFile(join(root, sourcePath), 'Changed evidence.');
  assert.equal(resultJson(run(args), 2).status, 'stale');
  assert.equal(resultJson(run(['inspect', '--workspace', root, '--report', '../private.json']), 2).status, 'invalid');
});

test('judgment CLI separates reviewed from abstained even for a valid service response', async t => {
  const root = await workspace(t);
  for (const [choice, expected, exit] of [['yes', 'reviewed', 0], ['unknown', 'needs_review', 2]]) {
    const result = run(['run', '--workspace', root, '--input', '-', '--allow-network'], JSON.stringify(input), choice);
    const value = resultJson(result, exit);
    assert.equal(value.status, expected);
    assert.equal(value.role, 'advisory');
    assert.equal(value.results[0].choice, choice);
    for (const text of [excerpt, 'synthetic-cli-key-only', 'PASS']) assert.equal(result.stdout.includes(text), false);
    const inspected = resultJson(run(['inspect', '--workspace', root, '--report', value.report_path]), exit);
    assert.equal(inspected.status, 'current');
    assert.equal(inspected.review_status, expected);
    assert.equal(inspected.request_hash, value.request_hash);
  }
});
