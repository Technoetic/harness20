import { mkdtempSync, rmSync } from 'node:fs';
import { after } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, link, symlink } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const adapter = await import('../../scripts/lib/jev-judge.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const call = async (name, ...args) => {
  assert.equal(typeof adapter[name], 'function', `${name} must be implemented`);
  return adapter[name](...args);
};
const prepare = (...args) => call('prepareJevJudgment', ...args);
const run = (...args) => call('runJevJudgment', ...args);
const inspect = (...args) => call('inspectJevJudgment', ...args);
const sourcePath = 'step_archive/step016_claims.md';
const excerpt = 'The proposal includes a year filter.';
const instructions = 'Does the selected evidence support the year-filter claim?';
const budgetFixture = mkdtempSync(join(tmpdir(), 'harness36-jev-synthetic-budget-'));
after(() => rmSync(budgetFixture, { recursive: true, force: true }));
const freshBudget = () => mkdtempSync(join(budgetFixture, 'call-'));
const key = 'synthetic-judgment-key-only';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const input = () => ({ schema_version: 1, step: 16,
  sources: [{ path: sourcePath, excerpt }],
  questions: [{ id: 'claim', instructions, choices: {
    supported: 'The claim has direct support.', unsupported: 'The claim is contradicted.',
    unknown: 'The supplied evidence is insufficient.',
  }, abstain: 'unknown' }],
});
const response = () => ({ model: 'jev-1.13.0', answers: { claim: {
  type: 'choice', choice: 'supported', probabilities: { supported: .9, unsupported: .05, unknown: .05 }, confidence: .9,
} }, usage: { input_tokens: 32, output_tokens: 5 } });
const json = value => new Response(JSON.stringify(value), { status: 200 });
const opts = fetchImpl => ({ allowNetwork: true, apiKey: key, fetchImpl, budgetRoot: freshBudget() });

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness50-jev-judge-'));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'harness50-jev-judge-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'step_archive'), { recursive: true });
  await writeFile(join(root, sourcePath), `Unselected private context.\n${excerpt}\n`);
  await writeFile(join(root, 'progress.json'), '{"current_step":16,"completed":[1]}');
  return root;
}

async function stored(root, result) {
  assert.match(result.report_path, /^step_archive\/outputs\/jev-judgments\/[a-f0-9]{64}\.json$/);
  const bytes = await readFile(join(root, result.report_path));
  assert.ok(result.report_path.endsWith(`${hash(bytes)}.json`));
  return JSON.parse(bytes);
}

test('offline preparation binds exact normalized excerpts and all seven checkpoints without exposing prose', async t => {
  const root = await fixture(t);
  const value = input();
  value.sources[0].excerpt = 'Café\nSecond line.';
  await writeFile(join(root, sourcePath), 'Unselected\r\nCafe\u0301\r\nSecond line.\r\n');
  for (const step of [16, 24, 25, 30, 37, 45, 49]) {
    value.step = step;
    const result = await prepare(root, value);
    assert.equal(result.status, 'prepared');
    assert.equal(result.role, 'advisory');
    assert.equal(result.step, step);
    assert.equal(result.min_confidence, .8);
    assert.equal(result.question_count, 1);
    assert.deepEqual(result.questions, [{ id: 'claim', choices: ['supported', 'unknown', 'unsupported'], abstain: 'unknown' }]);
    assert.equal(result.sources[0].sha256, hash(await readFile(join(root, sourcePath))));
    assert.equal(result.sources[0].excerpt_hash, hash(value.sources[0].excerpt));
    for (const field of ['input_hash', 'request_hash', 'policy_hash']) assert.match(result[field], /^[a-f0-9]{64}$/);
    for (const forbidden of ['Café', 'Unselected', instructions, 'The claim has']) assert.ok(!JSON.stringify(result).includes(forbidden));
  }
  await assert.rejects(readFile(join(root, 'step_archive/outputs')), { code: 'ENOENT' });
});

test('hashes distinguish changed questions, thresholds and excerpts and canonicalize choice order', async t => {
  const root = await fixture(t);
  const first = await prepare(root, input());
  for (const change of [x => { x.questions[0].instructions += ' Check carefully.'; },
    x => { x.questions[0].choices.supported += ' Be explicit.'; },
    x => { x.sources[0].excerpt = 'includes a year filter'; },
    x => { x.questions[0].abstain = 'unsupported'; }]) {
    const value = input(); change(value);
    const next = await prepare(root, value);
    assert.notEqual(next.input_hash, first.input_hash);
    assert.notEqual(next.request_hash, first.request_hash);
  }
  const threshold = input(); threshold.min_confidence = .95;
  const next = await prepare(root, threshold);
  assert.notEqual(next.input_hash, first.input_hash);
  assert.equal(next.request_hash, first.request_hash);
  const reordered = input();
  reordered.questions[0].choices = Object.fromEntries(Object.entries(reordered.questions[0].choices).reverse());
  assert.equal((await prepare(root, reordered)).request_hash, first.request_hash);
});

test('network requires explicit true and a key and records a reusable but unverified report', async t => {
  const root = await fixture(t);
  let calls = 0;
  for (const allowNetwork of [undefined, false, 1, 'true']) {
    const result = await run(root, input(), { allowNetwork, apiKey: key, fetchImpl: () => { calls++; } });
    assert.equal(result.status, 'unverified');
    assert.equal(result.error_code, 'network_disabled');
    assert.equal((await stored(root, result)).status, 'unverified');
    const checked = await inspect(root, result.report_path);
    assert.equal(checked.status, 'current');
    assert.equal(checked.review_status, 'unverified');
  }
  const missing = await run(root, input(), { allowNetwork: true, fetchImpl: () => { calls++; } });
  assert.equal(missing.error_code, 'missing_api_key');
  assert.equal(calls, 0);
});

test('one fixed-model batch transmits only selected prose and preserves categorical evidence', async t => {
  const root = await fixture(t);
  const prepared = await prepare(root, input());
  let calls = 0;
  const result = await run(root, input(), opts(async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(request.redirect, 'error');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, `Bearer ${key}`);
    assert.ok(request.signal instanceof AbortSignal);
    const payload = JSON.parse(request.body);
    assert.deepEqual(Object.keys(payload).sort(), ['model', 'questions', 'state']);
    assert.equal(payload.model, 'jev-1.13.0');
    assert.ok(!Object.hasOwn(payload.state, 'min_confidence'));
    assert.deepEqual(payload.state.sources, [excerpt]);
    assert.equal(payload.questions.claim.type, 'choice');
    assert.deepEqual(payload.questions.claim.criteria, input().questions[0].choices);
    assert.ok(payload.questions.claim.instructions.includes(instructions));
    assert.ok(payload.questions.claim.instructions.includes('unknown'));
    assert.ok(!request.body.includes(sourcePath));
    assert.ok(!request.body.includes('Unselected'));
    return json(response());
  }));
  assert.equal(calls, 1);
  assert.equal(result.status, 'reviewed');
  const report = await stored(root, result);
  assert.equal(report.results[0].choice, 'supported');
  assert.equal(report.results[0].confidence, .9);
  const checked = await inspect(root, result.report_path);
  assert.equal(checked.status, 'current');
  assert.equal(checked.review_status, 'reviewed');
  assert.deepEqual(checked.sources, prepared.sources);
  assert.equal(checked.request_hash, prepared.request_hash);
  assert.equal(checked.policy_hash, prepared.policy_hash);
  for (const forbidden of [excerpt, instructions, key, 'Unselected', 'The claim has']) assert.ok(!JSON.stringify({ report, result, checked }).includes(forbidden));
  assert.equal(await readFile(join(root, 'progress.json'), 'utf8'), '{"current_step":16,"completed":[1]}');
});

test('Unicode categorical labels and independent questions are reviewed without English-only assumptions', async t => {
  const root = await fixture(t);
  const value = input();
  value.questions[0].choices = { '충족': 'The condition is supported.', '명시적 충돌': 'The condition conflicts.', '근거 부족': 'There is insufficient evidence.' };
  value.questions[0].abstain = '근거 부족';
  value.questions.push({ id: 'alternative', instructions: 'Are these alternatives distinct?',
    choices: { distinct: 'Distinct.', overlap: 'Overlapping.', abstain: 'Unclear.' }, abstain: 'abstain' });
  const answer = response();
  answer.answers.claim = { type: 'choice', choice: '충족', probabilities: { '충족': .9, '명시적 충돌': .05, '근거 부족': .05 }, confidence: .9 };
  answer.answers.alternative = { type: 'choice', choice: 'overlap', probabilities: { distinct: .1, overlap: .8, abstain: .1 }, confidence: .85 };
  const result = await run(root, value, opts(async () => json(answer)));
  assert.equal(result.status, 'reviewed');
  assert.deepEqual(result.results.map(item => item.choice), ['충족', 'overlap']);
  assert.equal((await inspect(root, result.report_path)).review_status, 'reviewed');
});

test('abstention and low confidence require host review regardless of otherwise valid answers', async t => {
  const root = await fixture(t);
  for (const [choice, confidence, min, want] of [
    ['unknown', .99, .8, 'needs_review'], ['supported', .79, .8, 'needs_review'],
    ['supported', .8, .8, 'reviewed'], ['supported', .9, .95, 'needs_review'],
  ]) {
    const value = input(); value.min_confidence = min;
    const answer = response();
    answer.answers.claim.choice = choice;
    answer.answers.claim.confidence = confidence;
    answer.answers.claim.probabilities = choice === 'unknown' ? { supported: .01, unsupported: 0, unknown: .99 } : { supported: .9, unsupported: .05, unknown: .05 };
    const result = await run(root, value, opts(async () => json(answer)));
    assert.equal(result.status, want);
    assert.equal((await inspect(root, result.report_path)).review_status, want);
  }
});

test('input rejects invalid schema, missing abstention, duplicate IDs, unsupported steps and oversized batches', async t => {
  const root = await fixture(t);
  const changes = [x => { x.extra = true; }, x => { x.schema_version = 2; }, x => { x.step = 17; },
    x => { x.step = '16'; }, x => { x.sources = []; }, x => { x.questions = []; },
    x => { x.sources[0].extra = true; }, x => { x.questions[0].extra = true; },
    x => { x.sources[0].excerpt = 'absent'; }, x => { x.sources.push({ ...x.sources[0] }); },
    x => { x.questions.push(structuredClone(x.questions[0])); }, x => { delete x.questions[0].abstain; },
    x => { x.questions[0].abstain = 'missing'; }, x => { x.questions[0].id = '__proto__'; },
    x => { x.questions[0].choices = { unknown: 'Cannot tell.' }; },
    x => { x.questions[0].choices = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`c${i}`, 'Criterion.'])); x.questions[0].abstain = 'c0'; },
    x => { x.questions = Array.from({ length: 13 }, (_, i) => ({ ...x.questions[0], id: `q${i}` })); },
    x => { x.sources = Array.from({ length: 5 }, (_, i) => ({ path: `step_archive/a${i}.md`, excerpt })); },
    ...[-.1, 1.1, '0.8', NaN, Infinity].map(n => x => { x.min_confidence = n; }),
    x => { x.questions[0].instructions = '\ud800'; }, x => { x.sources[0].excerpt = 'a'.repeat(65537); },
    x => { x.questions[0].choices.constructor = 'Untrusted label.'; },
  ];
  let calls = 0;
  for (const change of changes) {
    const value = input(); change(value);
    await assert.rejects(run(root, value, opts(() => { calls++; })), { code: 'invalid_input' });
  }
  assert.equal(calls, 0);
});

test('only selected archive text files are eligible and hidden credential report and state paths are denied', async t => {
  const root = await fixture(t);
  const denied = ['../.env', 'step_archive/../.env', 'step_archive\\claims.md', 'C:/claims.md', 'src/code.mjs',
    'step_archive/code.js', 'step_archive/.hidden/claims.md', 'step_archive/secrets.md', 'step_archive/API_KEY.txt',
    'step_archive/credentials/claims.md', 'step_archive/progress.json', 'step_archive/state.json',
    'step_archive/outputs/jev-reviews/abc.json', 'step_archive/outputs/jev-judgments/abc.json',
    'step_archive/a./claims.md', 'step_archive/a /claims.md', 'step_archive/claims.md:secret',
    'step_archive/CON.md', 'step_archive/COM1.txt'];
  for (const path of denied) {
    const value = input(); value.sources[0].path = path;
    await assert.rejects(prepare(root, value), { code: 'invalid_input' });
  }
  for (const path of ['step_archive/selected.md', 'step_archive/selected.txt', 'step_archive/selected.json']) {
    await writeFile(join(root, path), excerpt);
    const value = input(); value.sources[0].path = path;
    assert.equal((await prepare(root, value)).status, 'prepared');
  }
});

test('recognized credentials in instructions criteria excerpts and metadata never reach reports or transport', async t => {
  const root = await fixture(t);
  const secrets = ['TYPESAFE_API_KEY=synthetic-secret-value', `apikey_${'a1'.repeat(16)}_${'b2'.repeat(32)}`,
    'Authorization: Bearer synthetic-token', 'password = "secret-value"', '-----BEGIN PRIVATE KEY-----',
    'sk-1234567890abcdefghijklmnopqrstuvwxyz', 'ghp_abcdefghijklmnopqrstuvwxyz1234567890'];
  for (const sensitive of secrets) {
    for (const field of ['excerpt', 'instructions', 'criterion']) {
      const value = input();
      if (field === 'excerpt') { value.sources[0].excerpt = sensitive; await writeFile(join(root, sourcePath), sensitive); }
      else if (field === 'instructions') value.questions[0].instructions = sensitive;
      else value.questions[0].choices.supported = sensitive;
      await assert.rejects(prepare(root, value), error => {
        assert.equal(error.code, 'invalid_input'); assert.ok(!String(error).includes(sensitive)); return true;
      });
    }
  }
  await assert.rejects(readFile(join(root, 'step_archive/outputs')), { code: 'ENOENT' });
});

test('source UTF-8, size, links and aliases fail closed', async t => {
  const root = await fixture(t);
  await writeFile(join(root, sourcePath), Buffer.concat([Buffer.from(excerpt), Buffer.from([0xff])]));
  await assert.rejects(prepare(root, input()), { code: 'invalid_input' });
  await writeFile(join(root, sourcePath), excerpt + 'x'.repeat(256 * 1024));
  await assert.rejects(prepare(root, input()), { code: 'invalid_input' });
  await rm(join(root, sourcePath));
  await link(join(root, 'progress.json'), join(root, sourcePath));
  await assert.rejects(prepare(root, input()), { code: 'invalid_input' });
  await rm(join(root, sourcePath));
  await mkdir(join(root, 'elsewhere'));
  await writeFile(join(root, 'elsewhere/claims.md'), excerpt);
  await symlink(join(root, 'elsewhere'), join(root, 'step_archive/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const value = input(); value.sources[0].path = 'step_archive/linked/claims.md';
  await assert.rejects(prepare(root, value), { code: 'invalid_input' });
});

test('all HTTP and thrown errors are sanitized and never retried', async t => {
  const root = await fixture(t);
  for (const [status, expected] of [[401, 'authentication'], [403, 'authentication'], [429, 'rate_limit'], [302, 'transport'], [500, 'transport']]) {
    let calls = 0;
    const result = await run(root, input(), opts(async () => { calls++; return new Response(`${key} ${excerpt}`, { status }); }));
    assert.equal(result.status, 'unverified'); assert.equal(result.error_code, expected); assert.equal(calls, 1);
    const report = await stored(root, result);
    assert.deepEqual(report.results, []); assert.ok(!JSON.stringify(report).includes(key));
  }
  const result = await run(root, input(), opts(async () => { throw new Error(key); }));
  assert.equal(result.error_code, 'transport');
  assert.ok(!JSON.stringify(result).includes(key));
  const redirected = json(response()); Object.defineProperty(redirected, 'redirected', { value: true });
  assert.equal((await run(root, input(), opts(async () => redirected))).error_code, 'transport');
});

test('invalid response schemas labels distributions usage and free text cannot become a judgment', async t => {
  const root = await fixture(t);
  const changes = [x => { x.model = 'jev-latest'; }, x => { delete x.answers.claim; },
    x => { x.answers.extra = x.answers.claim; }, x => { x.answers.claim.type = 'boolean'; },
    x => { x.answers.claim.choice = 'PASS'; }, x => { x.answers.claim.choice = 'unsupported'; },
    x => { x.answers.claim.probabilities.supported = .8; }, x => { x.answers.claim.probabilities.extra = 0; },
    x => { delete x.answers.claim.probabilities.unknown; }, x => { x.answers.claim.probabilities.unknown = -.1; },
    x => { x.answers.claim.confidence = '0.9'; }, x => { x.answers.claim.confidence = 1.1; },
    x => { delete x.answers.claim.confidence; }, x => { x.usage.input_tokens = -1; },
    x => { x.answers.claim.explanation = key; }, x => { x.extra = key; }, x => { x.usage.extra = key; }];
  for (const change of changes) {
    const value = response(); change(value);
    const result = await run(root, input(), opts(async () => json(value)));
    assert.equal(result.error_code, 'malformed_response'); assert.equal(result.status, 'unverified');
    assert.deepEqual((await stored(root, result)).results, []);
    assert.ok(!JSON.stringify(result).includes(key));
  }
});

test('streaming body cap and fatal UTF-8 decoding apply without trusting headers', async t => {
  const root = await fixture(t);
  for (const body of ['{invalid', ' '.repeat(65537), Buffer.from([0xff, 0xfe]),
    new ReadableStream({ start(c) { c.enqueue(new Uint8Array(32768)); c.enqueue(new Uint8Array(32769)); c.close(); } })]) {
    const result = await run(root, input(), opts(async () => new Response(body)));
    assert.equal(result.error_code, 'malformed_response');
  }
});

test('timeout aborts hung fetch and hung response body', async t => {
  const root = await fixture(t);
  for (const bodyHang of [false, true]) {
    let signal;
    const result = await run(root, input(), { ...opts(async (_url, request) => {
      signal = request.signal;
      return bodyHang ? new Response(new ReadableStream({ start() {} })) : new Promise(() => {});
    }), timeoutMs: 20 });
    assert.equal(result.error_code, 'timeout'); assert.equal(signal.aborted, true);
  }
});

test('source snapshots before sending and after body completion prevent raced judgments', async t => {
  const root = await fixture(t);
  let calls = 0;
  const options = { allowNetwork: true, budgetRoot: freshBudget(), fetchImpl: async () => { calls++; return json(response()); },
    get apiKey() { writeFileSync(join(root, sourcePath), excerpt + '\nChanged before sending.'); return key; } };
  const before = await run(root, input(), options);
  assert.equal(before.error_code, 'input_changed'); assert.equal(calls, 0);
  const after = await run(root, input(), opts(async () => new Response(new ReadableStream({
    async start(c) { await writeFile(join(root, sourcePath), excerpt + '\nChanged during streaming.'); c.enqueue(Buffer.from(JSON.stringify(response()))); c.close(); },
  }))));
  assert.equal(after.error_code, 'input_changed'); assert.deepEqual(after.results, []);
});

test('timeouts and actual-key content in request or retained metadata are rejected before sending', async t => {
  const root = await fixture(t);
  let calls = 0;
  for (const timeoutMs of [0, -1, 30001, '1000', NaN, Infinity]) {
    await assert.rejects(run(root, input(), { ...opts(() => { calls++; }), timeoutMs }), { code: 'invalid_input' });
  }
  for (const location of ['excerpt', 'path', 'id', 'choice']) {
    const value = input();
    if (location === 'excerpt') value.sources[0].excerpt = `Contains ${key}.`;
    if (location === 'path') value.sources[0].path = `step_archive/${key}.md`;
    if (location === 'id') value.questions[0].id = key;
    if (location === 'choice') value.questions[0].choices[key] = 'A category.';
    await writeFile(join(root, value.sources[0].path), value.sources[0].excerpt);
    await assert.rejects(run(root, value, opts(() => { calls++; })), { code: 'invalid_input' });
  }
  assert.equal(calls, 0);
});

test('linked report directories are refused and no linked target is written', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'elsewhere'));
  await symlink(join(root, 'elsewhere'), join(root, 'step_archive/outputs'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(run(root, input()), { code: 'report_write_failed' });
  await assert.rejects(readFile(join(root, 'elsewhere/jev-judgments')), { code: 'ENOENT' });
});

test('inspect checks current source bytes and rejects tampering, rehashed free text and altered policy', async t => {
  const root = await fixture(t);
  const result = await run(root, input(), opts(async () => json(response())));
  const original = await stored(root, result);
  await writeFile(join(root, sourcePath), excerpt + '\nLater edit.');
  assert.equal((await inspect(root, result.report_path)).status, 'stale');
  const raw = await readFile(join(root, result.report_path));
  await writeFile(join(root, result.report_path), Buffer.concat([raw, Buffer.from(' ')]));
  assert.equal((await inspect(root, result.report_path)).status, 'invalid');
  const changes = [x => { x.results[0].notes = key; }, x => { x.policy_hash = '0'.repeat(64); },
    x => { x.status = 'needs_review'; }, x => { x.questions[0].abstain = 'absent'; },
    x => { x.sources[0].path = '../.env'; }, x => { x.sources[0].excerpt_hash = 'bad'; },
    x => { x.questions[0].instructions = key; }, x => { x.extra = key; }];
  for (const change of changes) {
    const value = structuredClone(original); change(value);
    const bytes = Buffer.from(JSON.stringify(value));
    const path = `step_archive/outputs/jev-judgments/${hash(bytes)}.json`;
    await writeFile(join(root, path), bytes);
    const checked = await inspect(root, path);
    assert.equal(checked.status, 'invalid'); assert.ok(!JSON.stringify(checked).includes(key));
  }
  assert.equal((await inspect(root, '../.env')).status, 'invalid');
});
