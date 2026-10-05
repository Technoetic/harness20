import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile, readdir, link } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { reserveJevBudget, JEV_BUDGET_LIMITS } from '../../scripts/lib/jev-budget.mjs';
import { validateJevStructure } from '../../scripts/lib/sensitive-data.mjs';
import { prepareJevAsk, runJevAsk } from '../../scripts/lib/jev-ask.mjs';
import { prepareJevJudgment, runJevJudgment } from '../../scripts/lib/jev-judge.mjs';
import { prepareJevReview, runJevReview } from '../../scripts/lib/jev-review.mjs';

const key = 'synthetic-owasp-key-only';
const ask = text => ({ schema_version: 1, context: { kind: 'selected_text', text },
  questions: [{ id: 'claim', type: 'noul', instructions: 'Is the claim supported?' }] });
const answer = () => new Response(JSON.stringify({ model: 'jev-1.13.0', answers: {
  claim: { type: 'noul', noul: .99 } }, usage: { input_tokens: 10, output_tokens: 2 } }));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness36-owasp-jev-'));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'harness36-owasp-jev-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test('invisible credential and instruction controls are rejected before any Jev request', async t => {
  const root = await fixture(t);
  const forbidden = ['pass\u200bword=private', 'password\uff1dprivate', 'private\u202econtext',
    'hidden\u{E0061}tag', 'hidden\ufe0fvariant', 'https://someone:private@example.test/'];
  for (const value of forbidden) {
    let calls = 0;
    await assert.rejects(runJevAsk(ask(value), { allowNetwork: true, apiKey: key, budgetRoot: root,
      fetchImpl: () => { calls++; return answer(); } }), { code: 'invalid_input' });
    assert.equal(calls, 0);
  }
  assert.equal((await prepareJevAsk(ask('한국어 기준과 일반 문장.'))).status, 'prepared');
});

test('file judgments and legacy reviews use the same sensitive and invisible text guard', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'step_archive/TOPIC'), { recursive: true });
  const text = 'pass\u200bword=private';
  await writeFile(join(root, 'step_archive/step025_plan.md'), text);
  await writeFile(join(root, 'step_archive/TOPIC/TOPIC.md'), text);
  const judge = { schema_version: 1, step: 25, sources: [{ path: 'step_archive/step025_plan.md', excerpt: text }],
    questions: [{ id: 'claim', instructions: 'Check claim', choices: { yes: 'Yes', unknown: 'Unknown' }, abstain: 'unknown' }] };
  await assert.rejects(prepareJevJudgment(root, judge), { code: 'invalid_input' });
  await assert.rejects(prepareJevReview(root, { schema_version: 1, topic_excerpt: text,
    planning: [{ path: 'step_archive/step025_plan.md', excerpt: text }], requirements: [{ id: 'claim', text }] }), { code: 'invalid_input' });
});

test('all three response parsers reject duplicate decoded keys rather than accept the last value', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'step_archive/TOPIC'), { recursive: true });
  await writeFile(join(root, 'step_archive/step025_plan.md'), 'A supported claim.');
  await writeFile(join(root, 'step_archive/TOPIC/TOPIC.md'), 'A supported claim.');
  const judge = { schema_version: 1, step: 25, sources: [{ path: 'step_archive/step025_plan.md', excerpt: 'A supported claim.' }],
    questions: [{ id: 'claim', instructions: 'Check claim', choices: { yes: 'Yes', unknown: 'Unknown' }, abstain: 'unknown' }] };
  const review = { schema_version: 1, topic_excerpt: 'A supported claim.', planning: judge.sources,
    requirements: [{ id: 'claim', text: 'A supported claim.' }] };
  const json = JSON.stringify({ model: 'jev-1.13.0', answers: { claim: { type: 'choice', choice: 'yes',
    probabilities: { yes: 1, unknown: 0 }, confidence: 1 } }, usage: { input_tokens: 10, output_tokens: 2 } });
  const legacy = JSON.stringify({ model: 'jev-1.13.0', answers: { claim: { type: 'choice', choice: 'met',
    probabilities: { met: 1, unmet: 0, insufficient_evidence: 0 }, confidence: 1 } }, usage: { input_tokens: 10, output_tokens: 2 } });
  for (const [run, value, body] of [[runJevJudgment, judge, json], [runJevReview, review, legacy]]) {
    const result = await run(root, value, { allowNetwork: true, apiKey: key, budgetRoot: join(root, 'budget'),
      fetchImpl: async () => new Response(body.replace('"confidence":1', '"confidence":0,"\\u0063onfidence":1')) });
    assert.equal(result.error_code, 'malformed_response');
    assert.deepEqual(result.results, []);
  }
});

test('repeated API calls stop before a fourth same-input attempt and count HTTP failures', async t => {
  const budgetRoot = await fixture(t);
  let calls = 0;
  const options = { allowNetwork: true, apiKey: key, budgetRoot,
    fetchImpl: async () => { calls++; return new Response('ignored', { status: 429 }); } };
  for (let i = 0; i < 3; i++) assert.equal((await runJevAsk(ask('same bounded claim'), options)).error_code, 'rate_limit');
  const stopped = await runJevAsk(ask('same bounded claim'), { ...options, maxRequests: Infinity });
  assert.equal(stopped.error_code, 'budget_exhausted');
  assert.equal(stopped.network_attempted, false);
  assert.equal(calls, 3);
  assert.ok(!JSON.stringify(stopped).includes(key));
});

test('API-key shared minute cap applies to different inputs and survives fresh processes', async t => {
  const budgetRoot = await fixture(t);
  // The quota resets at a UTC minute. Start away from that legitimate boundary
  // so the race checks one bucket rather than accidentally exercising two.
  const remaining = 60000 - (Date.now() % 60000);
  if (remaining < 10000) await new Promise(resolve => setTimeout(resolve, remaining + 20));
  const moduleUrl = pathToFileURL(resolve('scripts/lib/jev-budget.mjs')).href;
  const jobs = Array.from({ length: 14 }, (_, i) => new Promise((resolveJob, rejectJob) => {
    const child = spawn(process.execPath, ['--input-type=module', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', b => { output += b; });
    child.stderr.on('data', b => { errors += b; });
    child.once('error', rejectJob);
    child.once('close', code => code === 0 ? resolveJob(output.trim()) : rejectJob(new Error(errors)));
    child.stdin.end(`import {reserveJevBudget} from ${JSON.stringify(moduleUrl)};\n` +
      `try {await reserveJevBudget({apiKey:${JSON.stringify(key)},request:${JSON.stringify('bounded-'+i)},budgetRoot:${JSON.stringify(budgetRoot)}});console.log('reserved')}catch(e){console.log(e.code)}`);
  }));
  const results = await Promise.all(jobs);
  assert.equal(results.filter(x => x === 'reserved').length, 12);
  assert.equal(results.filter(x => x === 'budget_exhausted').length, 2);
});

test('corrupt and aliased budget files fail closed and never silently reset counters', async t => {
  const budgetRoot = await fixture(t);
  const options = { allowNetwork: true, apiKey: key, budgetRoot, fetchImpl: async () => answer() };
  assert.equal((await runJevAsk(ask('first claim'), options)).status, 'reviewed');
  const name = (await readdir(budgetRoot)).find(x => x.endsWith('.json'));
  assert.ok(name, 'a durable reservation must exist before the API call');
  const original = await readFile(join(budgetRoot, name));
  await writeFile(join(budgetRoot, name), '{"bad":true}');
  let calls = 0;
  const denied = await runJevAsk(ask('different claim'), { ...options, fetchImpl: async () => { calls++; return answer(); } });
  assert.equal(denied.error_code, 'budget_unavailable');
  assert.equal(calls, 0);
  assert.equal(await readFile(join(budgetRoot, name), 'utf8'), '{"bad":true}');
  await writeFile(join(budgetRoot, name), original);
  await link(join(budgetRoot, name), join(budgetRoot, 'alias'));
  assert.equal((await runJevAsk(ask('third claim'), options)).error_code, 'budget_unavailable');
});

test('daily call and input-byte ceilings are enforced before dispatch independently of the minute cap', async t => {
  const budgetRoot = await fixture(t);
  await reserveJevBudget({ apiKey: key, request: 'first', budgetRoot });
  const name = (await readdir(budgetRoot)).find(x => x.endsWith('.json'));
  const path = join(budgetRoot, name);
  const original = JSON.parse(await readFile(path, 'utf8'));
  const seeded = { ...original, day_requests: 199, minute_requests: 0, day_input_bytes: 19900, minute_input_bytes: 0,
    request_attempts: Array.from({ length: 199 }, (_, i) => ({
      request_hash: createHash('sha256').update(`historical-${i}`).digest('hex'), attempts: 1 })) };
  await writeFile(path, JSON.stringify(seeded));
  await reserveJevBudget({ apiKey: key, request: 'daily final permitted', budgetRoot });
  await assert.rejects(reserveJevBudget({ apiKey: key, request: 'daily forbidden', budgetRoot }), { code: 'budget_exhausted' });
  seeded.day_requests = 199;
  seeded.day_input_bytes = JEV_BUDGET_LIMITS.reserved_input_bytes_per_day - 8;
  await writeFile(path, JSON.stringify(seeded));
  await assert.rejects(reserveJevBudget({ apiKey: key, request: 'ninebytes', budgetRoot }), { code: 'budget_exhausted' });
  assert.equal(JSON.parse(await readFile(path, 'utf8')).day_input_bytes, seeded.day_input_bytes);
});

test('timeouts consume durable reservations and an abandoned lock cannot reset the budget', async t => {
  const budgetRoot = await fixture(t);
  let calls = 0;
  const options = { allowNetwork: true, apiKey: key, budgetRoot, timeoutMs: 10,
    fetchImpl: () => { calls++; return new Promise(() => {}); } };
  for (let i = 0; i < 3; i++) assert.equal((await runJevAsk(ask('hung request'), options)).error_code, 'timeout');
  assert.equal((await runJevAsk(ask('hung request'), options)).error_code, 'budget_exhausted');
  assert.equal(calls, 3);
  const name = (await readdir(budgetRoot)).find(x => x.endsWith('.json'));
  assert.equal(JSON.parse(await readFile(join(budgetRoot, name), 'utf8')).day_requests, 3);
  await writeFile(join(budgetRoot, name.replace('.json', '.lock')), 'abandoned host lock');
  const blocked = await runJevAsk(ask('another request'), { ...options, fetchImpl: () => { assert.fail('locked budget must not dispatch'); } });
  assert.equal(blocked.error_code, 'budget_unavailable');
  assert.equal(await readFile(join(budgetRoot, name.replace('.json', '.lock')), 'utf8'), 'abandoned host lock');
});

test('outbound structure rejects credential-labelled scalars, cycles, excessive nodes, and accessor execution', () => {
  for (const value of [{ password: true }, { access_token: 123 }, { 'ＡＰＩ＿ＫＥＹ': 'hidden' },
    { rows: Array.from({ length: 10001 }, () => 'bounded') }]) assert.throws(() => validateJevStructure(value));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => validateJevStructure(cyclic));
  let accessed = false;
  assert.throws(() => validateJevStructure({ get context() { accessed = true; return 'unexpected'; } }));
  assert.equal(accessed, false);
  assert.doesNotThrow(() => validateJevStructure({ choice: 'ordinary question label', secret: null }));
});

test('invalid calendar and inconsistent timestamp buckets are corrupt ledgers rather than a quota reset', async t => {
  const budgetRoot = await fixture(t);
  await reserveJevBudget({ apiKey: key, request: 'first', budgetRoot });
  const name = (await readdir(budgetRoot)).find(x => x.endsWith('.json'));
  const path = join(budgetRoot, name), original = JSON.parse(await readFile(path, 'utf8'));
  for (const changes of [{ day: '2000-99-99' }, { day: '2000-01-01' }, { minute: 1 }, { day_input_bytes: 0 }]) {
    await writeFile(path, JSON.stringify({ ...original, ...changes }));
    await assert.rejects(reserveJevBudget({ apiKey: key, request: 'second', budgetRoot }), { code: 'budget_unavailable' });
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { ...original, ...changes });
  }
});

test('rotating invalid API keys cannot evade the user shared request ceiling', async t => {
  const budgetRoot = await fixture(t);
  const remaining = 60000 - (Date.now() % 60000);
  if (remaining < 2000) await new Promise(resolve => setTimeout(resolve, remaining + 20));
  let calls = 0;
  for (let i = 0; i < 13; i++) {
    const result = await runJevAsk(ask('same claim with rotating credentials'), { allowNetwork: true, budgetRoot,
      apiKey: `synthetic-rotation-${i}`, fetchImpl: async () => { calls++; return new Response('discarded', { status: 401 }); } });
    assert.equal(result.error_code, i < 12 ? 'authentication' : 'budget_exhausted');
  }
  assert.equal(calls, 12);
});
