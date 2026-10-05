import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { after } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { prepareJevAsk as prepare, runJevAsk as run, parseJevAskJson as parse, readJevAskInput as read } from '../../scripts/lib/jev-ask.mjs';

const budgetFixture = mkdtempSync(join(tmpdir(), 'harness36-jev-synthetic-budget-'));
after(() => rmSync(budgetFixture, { recursive: true, force: true }));
const freshBudget = () => mkdtempSync(join(budgetFixture, 'call-'));
const key = 'synthetic-direct-key';
const input = () => ({ schema_version: 1, context: { kind: 'user_input', text: 'Is 1 + 1 = 2? Hello, friend.' },
  questions: [
    { id: 'arithmetic', type: 'noul', instructions: 'Is the arithmetic statement true?', criteria: { true: 'True.', false: 'False.' } },
    { id: 'answer', type: 'choice', instructions: 'Select the sum of one and one.', criteria: { one: '1', two: '2', unknown: 'Insufficient evidence.' }, abstain: 'unknown' },
    { id: 'tone', type: 'score', instructions: 'Rate the friendliness of the greeting.', criteria: ['Hostile', 'Neutral', 'Friendly'] },
  ] });
const response = () => ({ model: 'jev-1.13.0', answers: {
  arithmetic: { type: 'noul', noul: .98 },
  answer: { type: 'choice', choice: 'two', probabilities: { one: 0, two: 1, unknown: 0 }, confidence: 1 },
  tone: { type: 'score', score: 1.99, legend: { 0: 'Hostile', 1: 'Neutral', 2: 'Friendly' }, probabilities: { 0: 0, 1: .01, 2: .99 }, confidence: .98 },
}, usage: { input_tokens: 73, output_tokens: 14 } });
const json = value => new Response(JSON.stringify(value));
const options = fetchImpl => ({ allowNetwork: true, apiKey: key, fetchImpl, budgetRoot: freshBudget() });

test('direct native types preserve probabilities and rubric meaning with no invented Noul confidence', async () => {
  const prepared = await prepare(input());
  let calls = 0;
  const result = await run(input(), options(async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(request.redirect, 'error');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, `Bearer ${key}`);
    assert.ok(request.signal instanceof AbortSignal);
    const payload = JSON.parse(request.body);
    assert.deepEqual(Object.keys(payload).sort(), ['model', 'questions', 'state']);
    assert.equal(payload.model, 'jev-1.13.0');
    assert.deepEqual(payload.state, { context: input().context });
    assert.deepEqual(payload.questions.tone.criteria, ['Hostile', 'Neutral', 'Friendly']);
    assert.deepEqual(payload.questions.arithmetic.criteria, { true: 'True.', false: 'False.' });
    assert.match(payload.questions.answer.instructions, /unknown/);
    return json(response());
  }));
  assert.equal(calls, 1);
  assert.equal(result.status, 'reviewed');
  assert.equal(result.role, 'advisory');
  assert.equal(result.evidence_binding, 'inline_not_file_verified');
  assert.equal(result.network_attempted, true);
  assert.equal(result.request_hash, prepared.request_hash);
  assert.deepEqual(result.results, [
    { id: 'arithmetic', type: 'noul', noul: .98 },
    { id: 'answer', type: 'choice', choice: 'two', probabilities: { one: 0, two: 1, unknown: 0 }, confidence: 1 },
    { id: 'tone', type: 'score', score: 1.99, legend: { 0: 'Hostile', 1: 'Neutral', 2: 'Friendly' }, probabilities: { 0: 0, 1: .01, 2: .99 }, confidence: .98 },
  ]);
  for (const value of [prepared, result]) {
    for (const field of ['input_hash', 'request_hash', 'policy_hash']) assert.match(value[field], /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(value).includes(input().context.text));
    assert.ok(!JSON.stringify(value).includes(input().questions[0].instructions));
    assert.ok(!JSON.stringify(value).includes(key));
  }
});

test('canonical metadata changes with semantics and retains type identity for no-file questions', async () => {
  const first = await prepare(input());
  for (const change of [x => { x.context.text += '!'; }, x => { x.context.kind = 'selected_text'; },
    x => { x.questions[0].instructions += '!'; }, x => { x.questions[2].criteria.reverse(); },
    x => { x.questions[1].abstain = 'one'; }]) {
    const value = input(); change(value);
    assert.notEqual((await prepare(value)).request_hash, first.request_hash);
  }
  const reordered = input(); reordered.questions[1].criteria = { unknown: 'Insufficient evidence.', two: '2', one: '1' };
  assert.equal((await prepare(reordered)).request_hash, first.request_hash);
  const threshold = input(); threshold.min_confidence = .9;
  assert.notEqual((await prepare(threshold)).input_hash, first.input_hash);
  assert.equal((await prepare(threshold)).request_hash, first.request_hash);
  const optional = input(); delete optional.questions[0].criteria;
  assert.equal((await prepare(optional)).status, 'prepared');
});

test('network requires explicit authorization and a key and never attempts a fallback request', async () => {
  let calls = 0;
  for (const allowNetwork of [undefined, false, 1, 'true']) {
    const result = await run(input(), { allowNetwork, apiKey: key, fetchImpl: () => { calls++; } });
    assert.equal(result.status, 'unverified');
    assert.equal(result.network_attempted, false);
    assert.equal(result.error_code, 'network_disabled');
  }
  const missing = await run(input(), { allowNetwork: true, fetchImpl: () => { calls++; } });
  assert.equal(missing.error_code, 'missing_api_key');
  assert.equal(missing.network_attempted, false);
  assert.equal(calls, 0);
});

test('review reasons identify native abstention, confidence and Noul decisiveness separately', async () => {
  const answer = response();
  answer.answers.arithmetic.noul = .5;
  answer.answers.answer = { type: 'choice', choice: 'unknown', probabilities: { one: 0, two: 0, unknown: 1 }, confidence: 1 };
  answer.answers.tone.confidence = .7;
  const result = await run(input(), options(async () => json(answer)));
  assert.deepEqual(result.review_reasons, [
    { id: 'arithmetic', reason: 'low_decisiveness' }, { id: 'answer', reason: 'abstained' }, { id: 'tone', reason: 'low_confidence' },
  ]);
});

test('rubric text can repeat and documented rounding tolerance remains bounded', async () => {
  const value = input(); value.questions[2].criteria = ['Same', 'Same', 'Friendly'];
  const answer = response(); answer.answers.tone.legend = { 0: 'Same', 1: 'Same', 2: 'Friendly' };
  answer.answers.tone.score = 1.98;
  assert.equal((await run(value, options(async () => json(answer)))).status, 'reviewed');
  answer.answers.tone.score = 1.979;
  assert.equal((await run(value, options(async () => json(answer)))).error_code, 'malformed_response');
});

test('request overhead cannot push an otherwise bounded input beyond the wire limit', async () => {
  const value = input(); value.context.text = 'x'.repeat(64600);
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < 65536);
  await assert.rejects(prepare(value), { code: 'invalid_input' });
});

test('Noul decisiveness, native confidence and Choice abstention remain separate review signals', async () => {
  for (const [type, patch, threshold, status] of [
    ['arithmetic', { noul: .5 }, 0, 'needs_review'], ['arithmetic', { noul: .79 }, .8, 'needs_review'],
    ['arithmetic', { noul: .1 }, .8, 'reviewed'], ['arithmetic', { noul: .8 }, .8, 'reviewed'],
    ['answer', { confidence: .79 }, .8, 'needs_review'], ['tone', { confidence: .79 }, .8, 'needs_review'],
    ['answer', { choice: 'unknown', probabilities: { one: 0, two: 0, unknown: 1 } }, 0, 'needs_review'],
  ]) {
    const value = input(); value.min_confidence = threshold;
    const answer = response(); Object.assign(answer.answers[type], patch);
    assert.equal((await run(value, options(async () => json(answer)))).status, status);
  }
});

test('strict question schemas reject missing abstention, extra fields, invalid labels, IDs, rubric and thresholds', async () => {
  const changes = [x => { x.extra = true; }, x => { x.schema_version = 2; }, x => { x.context.extra = true; },
    x => { x.context.kind = 'file'; }, x => { x.context.text = ''; }, x => { x.context.text = '\ud800'; },
    x => { x.questions = []; }, x => { x.questions.push(structuredClone(x.questions[0])); },
    x => { x.questions[0].id = '__proto__'; }, x => { x.questions[0].id = 'bad.id'; },
    x => { x.questions[0].type = 'text'; }, x => { x.questions[0].extra = true; },
    x => { x.questions[0].criteria = { true: 'True' }; }, x => { x.questions[0].abstain = 'false'; },
    x => { delete x.questions[1].abstain; }, x => { x.questions[1].abstain = 'absent'; },
    x => { x.questions[1].criteria = { unknown: 'Unclear' }; }, x => { x.questions[1].criteria.constructor = 'Other'; },
    x => { x.questions[2].criteria = ['Only one']; }, x => { x.questions[2].criteria = ['Valid', '']; },
    x => { x.questions[2].criteria = ['a','b','c','d','e','f','g','h','i','j','k']; },
    x => { x.questions = Array.from({ length: 13 }, (_, i) => ({ ...x.questions[0], id: `q${i}` })); },
    ...[-.1, 1.1, '0.8', NaN, Infinity].map(n => x => { x.min_confidence = n; }),
  ];
  let calls = 0;
  for (const change of changes) {
    const value = input(); change(value);
    await assert.rejects(run(value, options(() => { calls++; })), { code: 'invalid_input' });
  }
  assert.equal(calls, 0);
});

test('Unicode choices, full 255-choice boundary and 10-level score are supported', async () => {
  const value = input(); value.questions[1].criteria = { '하나': '1', '둘': '2', '근거 부족': 'Unclear.' }; value.questions[1].abstain = '근거 부족';
  const answer = response(); answer.answers.answer = { type: 'choice', choice: '둘', probabilities: { '하나': 0, '둘': 1, '근거 부족': 0 }, confidence: 1 };
  assert.equal((await run(value, options(async () => json(answer)))).results[1].choice, '둘');
  value.questions[1].criteria = Object.fromEntries(Array.from({ length: 255 }, (_, i) => [`c${i}`, `Choice ${i}`])); value.questions[1].abstain = 'c0';
  value.questions[2].criteria = Array.from({ length: 10 }, (_, i) => `Level ${i}`);
  assert.equal((await prepare(value)).status, 'prepared');
  value.questions[1].criteria.c255 = 'Too many';
  await assert.rejects(prepare(value), { code: 'invalid_input' });
});

test('choice label limit counts Unicode codepoints rather than UTF16 units', async () => {
  const value = input(); value.questions[1].criteria = { ['😀'.repeat(64)]: 'A category', unknown: 'Unclear' };
  assert.equal((await prepare(value)).status, 'prepared');
  value.questions[1].criteria['😀'.repeat(65)] = 'Too long';
  await assert.rejects(prepare(value), { code: 'invalid_input' });
});

test('secrets in context, criteria, instructions, metadata or the actual key never reach transport', async () => {
  let calls = 0;
  const secrets = [key, 'TYPESAFE_API_KEY=synthetic-secret-value', `apikey_${'a1'.repeat(16)}_${'b2'.repeat(32)}`,
    'Authorization: Bearer synthetic-token', 'password = "secret-value"', '-----BEGIN PRIVATE KEY-----',
    'sk-1234567890abcdefghijklmnopqrstuvwxyz', 'ghp_abcdefghijklmnopqrstuvwxyz1234567890'];
  for (const sensitive of secrets) {
    for (const set of [x => { x.context.text = sensitive; }, x => { x.questions[0].instructions = sensitive; },
      x => { x.questions[1].criteria.one = sensitive; }, x => { x.questions[2].criteria[0] = sensitive; },
      x => { x.questions[0].id = sensitive; }, x => { x.questions[1].criteria[sensitive] = 'Category'; }]) {
      const value = input(); set(value);
      await assert.rejects(run(value, options(() => { calls++; })), error => {
        assert.equal(error.code, 'invalid_input'); assert.ok(!String(error).includes(sensitive)); return true;
      });
    }
  }
  assert.equal(calls, 0);
});

test('response validation rejects type coercion, free text, distributions and arbitrary numeric scores', async () => {
  const changes = [x => { x.model = 'jev-latest'; }, x => { delete x.answers.arithmetic; }, x => { x.answers.extra = {}; },
    x => { x.answers.arithmetic.noul = '0.98'; }, x => { x.answers.arithmetic.noul = 1.1; },
    x => { x.answers.arithmetic.confidence = 1; }, x => { x.answers.arithmetic.type = 'choice'; },
    x => { x.answers.answer.choice = 'one'; }, x => { x.answers.answer.probabilities.two = .9; },
    x => { x.answers.answer.probabilities.extra = 0; }, x => { x.answers.answer.confidence = null; },
    x => { x.answers.tone.score = 42; }, x => { x.answers.tone.score = 1; }, x => { x.answers.tone.score = '1.99'; },
    x => { x.answers.tone.legend[0] = 'Provider invented explanation'; }, x => { x.answers.tone.legend[3] = 'Extra'; },
    x => { x.answers.tone.probabilities[2] = .9; }, x => { x.answers.tone.probabilities[0] = -.1; },
    x => { x.answers.tone.confidence = 1.1; }, x => { delete x.answers.tone.legend; },
    x => { x.answers.tone.explanation = key; }, x => { x.extra = key; }, x => { x.usage.extra = key; },
    x => { x.usage.input_tokens = -1; }, x => { x.usage.output_tokens = 1.5; },
  ];
  for (const change of changes) {
    const answer = response(); change(answer);
    const result = await run(input(), options(async () => json(answer)));
    assert.equal(result.status, 'unverified');
    assert.equal(result.error_code, 'malformed_response');
    assert.deepEqual(result.results, []);
    assert.ok(!JSON.stringify(result).includes(key));
  }
});

test('HTTP errors, redirects and thrown errors are sanitized without retries', async () => {
  for (const [status, code] of [[401, 'authentication'], [403, 'authentication'], [429, 'rate_limit'], [302, 'transport'], [500, 'transport']]) {
    let calls = 0;
    const result = await run(input(), options(async () => { calls++; return new Response(key, { status }); }));
    assert.equal(calls, 1); assert.equal(result.error_code, code); assert.equal(result.network_attempted, true);
    assert.ok(!JSON.stringify(result).includes(key));
  }
  const failed = await run(input(), options(async () => { throw new Error(key); }));
  assert.equal(failed.error_code, 'transport');
  const redirected = json(response()); Object.defineProperty(redirected, 'redirected', { value: true });
  assert.equal((await run(input(), options(async () => redirected))).error_code, 'transport');
});

test('input and responses reject duplicate keys, malformed Unicode and unbounded bytes', async () => {
  for (const bytes of [Buffer.from([0xff]), Buffer.from('\ufeff{}'), Buffer.from(' '.repeat(65537)), Buffer.from('{"a":1,"a":2}'),
    Buffer.from('{"a":{"b":1,"b":2}}'), Buffer.from('{"a":1,"\\u0061":2}')]) {
    assert.throws(() => parse(bytes), { code: 'invalid_input' });
  }
  assert.deepEqual(await read(Readable.from([Buffer.from(JSON.stringify(input()))])), input());
  for (const body of [Buffer.from([0xff]), ' '.repeat(65537), JSON.stringify(response()).replace('"noul":0.98', '"noul":0.98,"noul":0.98'),
    new ReadableStream({ start(c) { c.enqueue(new Uint8Array(32768)); c.enqueue(new Uint8Array(32769)); c.close(); } })]) {
    const result = await run(input(), options(async () => new Response(body)));
    assert.equal(result.error_code, 'malformed_response');
  }
});

test('deadlines bound input, hung fetch and response streams and invalid limits never call transport', async () => {
  await assert.rejects(read(new Readable({ read() {} }), { timeoutMs: 10 }), { code: 'invalid_input' });
  for (const bodyHang of [false, true]) {
    let signal;
    const result = await run(input(), { ...options(async (_url, request) => {
      signal = request.signal;
      return bodyHang ? new Response(new ReadableStream({ start() {} })) : new Promise(() => {});
    }), timeoutMs: 20 });
    assert.equal(result.error_code, 'timeout'); assert.equal(signal.aborted, true);
  }
  for (const timeoutMs of [0, -1, 30001, '1000', NaN, Infinity]) {
    await assert.rejects(run(input(), { ...options(() => { assert.fail('Unexpected fetch'); }), timeoutMs }), { code: 'invalid_input' });
  }
});
