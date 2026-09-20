import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../scripts/jev-ask.mjs', import.meta.url));
const input = { schema_version: 1, context: { kind: 'user_input', text: 'Is 1 + 1 = 2?' },
  questions: [{ id: 'answer', type: 'noul', instructions: 'Is the arithmetic statement true?' }] };
const diagnostic = { error: { code: 'JEV_COMMAND_FAILED', message: 'Jev direct question command failed' } };

function run(args, stdin = JSON.stringify(input), { cwd, apiKey, probability } = {}) {
  const env = { ...process.env };
  delete env.TYPESAFE_API_KEY;
  if (apiKey !== undefined) env.TYPESAFE_API_KEY = apiKey;
  const preload = probability === undefined ? 'globalThis.fetch=()=>{throw Error("UNEXPECTED_FETCH")}'
    : `globalThis.fetch=async()=>new Response(JSON.stringify({model:'jev-1.13.0',answers:{answer:{type:'noul',noul:${probability}}},usage:{input_tokens:20,output_tokens:4}}))`;
  const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(preload), cli, ...args], {
    input: stdin, encoding: 'utf8', env, cwd, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}

test('direct prepare needs no workspace, creates no files and emits only advisory metadata', async t => {
  const root = await mkdtemp(join(tmpdir(), 'harness50-jev-ask-cli-'));
  t.after(async () => {
    assert.equal(dirname(root), tmpdir());
    assert.ok(basename(root).startsWith('harness50-jev-ask-cli-'));
    await rm(root, { recursive: true, force: true });
  });
  const result = run(['prepare', '--input', '-'], JSON.stringify(input), { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const value = JSON.parse(result.stdout);
  assert.equal(value.status, 'prepared');
  assert.equal(value.evidence_binding, 'inline_not_file_verified');
  assert.equal(value.network_attempted, false);
  assert.ok(!result.stdout.includes(input.context.text));
  assert.ok(!result.stdout.includes(input.questions[0].instructions));
  assert.deepEqual(await readdir(root), []);
});

test('direct CLI rejects ambiguous flags before stdin and cannot accept keys or file paths', () => {
  const base = ['prepare', '--input', '-'];
  for (const args of [[], ['inspect'], [...base, '--input', '-'], [...base, '--allow-network'],
    [...base, '--workspace', 'private'], ['run', '--input', '-'], ['prepare', '--input', 'private.json'],
    ['run', '--input', '-', '--allow-network', '--api-key', 'private'],
    ['run', '--input', '-', '--allow-network', '--allow-network']]) {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), diagnostic);
  }
});

test('direct CLI rejects duplicate keys, invalid UTF8, nonfinite numbers and oversized stdin', () => {
  for (const stdin of ['', 'null', '[]', '{} {}', '{"private":', Buffer.from([0xc3, 0x28]),
    JSON.stringify(input).replace('"schema_version":1', '"schema_version":1,"schema_version":1'),
    JSON.stringify(input).replace('"kind":"user_input"', '"kind":"user_input","ki\\u006ed":"selected_text"'),
    JSON.stringify({ ...input, min_confidence: 1 }).replace('"min_confidence":1', '"min_confidence":1e999'),
    JSON.stringify({ ...input, context: { kind: 'user_input', text: 'x'.repeat(65536) } })]) {
    const result = run(['prepare', '--input', '-'], stdin);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), diagnostic);
  }
});

test('direct CLI never echoes the actual auth key in prepare or run', () => {
  const apiKey = 'synthetic-direct-key';
  const value = structuredClone(input); value.context.text += apiKey;
  for (const command of ['prepare', 'run']) {
    const args = [command, '--input', '-', ...(command === 'run' ? ['--allow-network'] : [])];
    const result = run(args, JSON.stringify(value), { apiKey });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), diagnostic);
  }
});

test('direct CLI distinguishes missing key, native judgment and uncertain judgment', () => {
  const args = ['run', '--input', '-', '--allow-network'];
  const missing = run(args);
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stdout).error_code, 'missing_api_key');
  for (const [probability, code, status] of [[.98, 0, 'reviewed'], [.5, 2, 'needs_review']]) {
    const result = run(args, JSON.stringify(input), { apiKey: 'synthetic-direct-key', probability });
    assert.equal(result.status, code, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.status, status);
    assert.equal(value.network_attempted, true);
    assert.deepEqual(value.results, [{ id: 'answer', type: 'noul', noul: probability }]);
  }
});
