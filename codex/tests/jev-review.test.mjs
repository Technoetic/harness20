import { mkdtempSync, rmSync } from 'node:fs';
import { after } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, symlink, link, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import * as adapter from '../../scripts/lib/jev-review.mjs';

const call = (name, ...args) => {
  assert.equal(typeof adapter[name], 'function', `${name} must be implemented`);
  return adapter[name](...args);
};
const prepare = (...args) => call('prepareJevReview', ...args);
const run = (...args) => call('runJevReview', ...args);
const inspect = (...args) => call('inspectJevReview', ...args);
const budgetFixture = mkdtempSync(join(tmpdir(), 'harness36-jev-synthetic-budget-'));
after(() => rmSync(budgetFixture, { recursive: true, force: true }));
const freshBudget = () => mkdtempSync(join(budgetFixture, 'call-'));
const key = 'synthetic-review-key-only';
const topic = 'The page must provide a year filter.';
const plan = 'A year filter is provided above the chart.';
const planPath = 'step_archive/step025_planning_chunk1.md';
const topicPath = 'step_archive/TOPIC/TOPIC.md';
const input = () => ({ schema_version: 1, topic_excerpt: topic,
  planning: [{ path: planPath, excerpt: plan }], requirements: [{ id: 'year-filter', text: topic }] });
const apiResponse = () => ({ model: 'jev-1.13.0', answers: { 'year-filter': {
  type: 'choice', choice: 'met', probabilities: { met: .9, unmet: .05, insufficient_evidence: .05 }, confidence: .8,
} }, usage: { input_tokens: 32, output_tokens: 5 } });
const jsonResponse = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
const opts = fetchImpl => ({ allowNetwork: true, apiKey: key, fetchImpl, budgetRoot: freshBudget() });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness50-jev-'));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + '\\harness50-jev-') || resolve(root).startsWith(resolve(tmpdir()) + '/harness50-jev-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'step_archive/TOPIC'), { recursive: true });
  await writeFile(join(root, topicPath), `Unselected topic context.\n${topic}\n`);
  await writeFile(join(root, planPath), `Unselected planning context.\n${plan}\n`);
  await writeFile(join(root, 'progress.json'), '{"current_step":25,"completed":[1]}');
  return root;
}

async function stored(root, result) {
  assert.match(result.report_path, /^step_archive\/outputs\/jev-reviews\/[a-f0-9]{64}\.json$/);
  const bytes = await readFile(join(root, result.report_path));
  assert.ok(result.report_path.endsWith(`${hash(bytes)}.json`));
  return JSON.parse(bytes);
}

test('prepare binds real sources offline without leaking selected or unselected text', async t => {
  const root = await fixture(t);
  const result = await prepare(root, input());
  assert.equal(result.status, 'prepared');
  assert.equal(result.role, 'advisory');
  assert.equal(result.step, 25);
  assert.equal(result.criterion_count, 1);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].sha256, hash(await readFile(join(root, topicPath))));
  for (const field of ['input_sha256', 'request_sha256', 'policy_sha256']) assert.match(result[field], /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes(topic));
  assert.ok(!JSON.stringify(result).includes('Unselected'));
});

test('run is offline without explicit true and missing key never calls transport', async t => {
  const root = await fixture(t);
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error('must not call'); };
  for (const allowNetwork of [undefined, false, 'true', 1]) {
    const result = await run(root, input(), { allowNetwork, apiKey: key, fetchImpl });
    assert.equal(result.status, 'unverified');
    assert.equal(result.error_code, 'network_disabled');
    assert.equal((await stored(root, result)).status, 'unverified');
  }
  const result = await run(root, input(), { allowNetwork: true, fetchImpl });
  assert.equal(result.error_code, 'missing_api_key');
  assert.equal(result.status, 'unverified');
  assert.equal(calls, 0);
});

test('one pinned choice batch contains selected excerpts only and stores categorical provenance', async t => {
  const root = await fixture(t);
  let calls = 0;
  const result = await run(root, input(), opts(async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.Authorization, `Bearer ${key}`);
    assert.ok(request.signal instanceof AbortSignal);
    const payload = JSON.parse(request.body);
    assert.deepEqual(Object.keys(payload).sort(), ['model', 'questions', 'state']);
    assert.equal(payload.model, 'jev-1.13.0');
    assert.deepEqual(payload.state, { topic, planning: [plan] });
    assert.deepEqual(Object.keys(payload.questions), ['year-filter']);
    assert.equal(payload.questions['year-filter'].type, 'choice');
    assert.deepEqual(Object.keys(payload.questions['year-filter'].criteria).sort(), ['insufficient_evidence', 'met', 'unmet']);
    assert.ok(payload.questions['year-filter'].instructions.includes(topic));
    assert.ok(!request.body.includes(planPath));
    return jsonResponse({ ...apiResponse(), ignored: `raw service text ${topic} ${key}` });
  }));
  assert.equal(calls, 1);
  assert.equal(result.status, 'reviewed');
  const report = await stored(root, result);
  assert.equal(report.role, 'advisory');
  assert.equal(report.step, 25);
  assert.equal(report.results[0].id, 'year-filter');
  assert.equal(report.results[0].choice, 'met');
  assert.equal(report.results[0].confidence, .8);
  assert.deepEqual(report.usage, { input_tokens: 32, output_tokens: 5 });
  const text = JSON.stringify({ result, report });
  for (const forbidden of [topic, plan, key, 'Unselected', 'raw service text', 'PASS']) assert.ok(!text.includes(forbidden));
  assert.equal(await readFile(join(root, 'progress.json'), 'utf8'), '{"current_step":25,"completed":[1]}');
  assert.equal((await inspect(root, result.report_path)).status, 'current');
});

test('invalid excerpt, fields, paths, requirement IDs and recognized secrets fail before transmission', async t => {
  const root = await fixture(t);
  const mutations = [
    x => { x.extra = true; }, x => { x.schema_version = 2; }, x => { x.topic_excerpt = 'absent'; },
    x => { x.planning[0].excerpt = 'absent'; }, x => { x.requirements[0].text = 'absent'; },
    x => { x.planning[0].extra = true; }, x => { x.requirements[0].extra = true; },
    x => { x.requirements.push({ ...x.requirements[0] }); }, x => { x.requirements[0].id = '__proto__'; },
    x => { x.requirements[0].id = 'a/b'; }, x => { x.planning = []; }, x => { x.requirements = []; },
    x => { x.planning.push({ ...x.planning[0] }); }, x => { x.requirements = Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, text: topic })); },
    ...['../.env', 'step_archive/../.env', 'step_archive/step025_credentials.md', 'step_archive/step024_plan.md',
      'step_archive/step025_dir/plan.md', 'C:/secrets.md', 'step_archive\\step025_plan.md', 'https://example.com/plan.md'].map(path => x => { x.planning[0].path = path; }),
    ...['sk-1234567890abcdefghijklmnopqrstuvwxyz', 'Authorization: Bearer synthetic-token', 'password = "secret-value"',
      '-----BEGIN PRIVATE KEY-----', 'ghp_abcdefghijklmnopqrstuvwxyz1234567890'].map(secret => x => { x.topic_excerpt = secret; x.requirements[0].text = secret; }),
    x => { x.topic_excerpt = '\ud800'; }, x => { x.topic_excerpt = 'a'.repeat(65537); },
  ];
  let calls = 0;
  for (const mutate of mutations) {
    const value = input(); mutate(value);
    await assert.rejects(() => run(root, value, opts(() => { calls++; })), error => {
      assert.equal(error.code, 'invalid_input');
      assert.equal(error.message, 'Invalid Jev review input.');
      return true;
    });
  }
  assert.equal(calls, 0);
});

test('source size, aggregate size, invalid UTF-8 and linked sources are rejected', async t => {
  const root = await fixture(t);
  await writeFile(join(root, planPath), Buffer.concat([Buffer.from(plan), Buffer.from([0xff])]));
  await assert.rejects(() => prepare(root, input()), { code: 'invalid_input' });
  await writeFile(join(root, planPath), plan + 'x'.repeat(256 * 1024));
  await assert.rejects(() => prepare(root, input()), { code: 'invalid_input' });
  const value = input();
  value.planning = [];
  await writeFile(join(root, topicPath), topic + 'x'.repeat(220 * 1024));
  for (let i = 0; i < 4; i++) {
    const path = `step_archive/step025_part${i}.md`;
    value.planning.push({ path, excerpt: plan });
    await writeFile(join(root, path), plan + 'x'.repeat(220 * 1024));
  }
  await assert.rejects(() => prepare(root, value), { code: 'invalid_input' });
  await writeFile(join(root, topicPath), topic);
  await rm(join(root, planPath));
  await link(join(root, topicPath), join(root, planPath));
  await assert.rejects(() => prepare(root, input()), { code: 'invalid_input' });
});

test('selected credential content is refused even when present verbatim in an allowed file', async t => {
  const root = await fixture(t);
  for (const excerpt of ['TYPESAFE_API_KEY=synthetic-secret-value', 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
    'Authorization: Bearer synthetic-token', 'password = "secret-value"', '-----BEGIN PRIVATE KEY-----',
    'ghp_abcdefghijklmnopqrstuvwxyz1234567890']) {
    const value = input();
    value.planning[0].excerpt = excerpt;
    await writeFile(join(root, planPath), excerpt);
    await assert.rejects(() => prepare(root, value), { code: 'invalid_input' });
  }
});

test('prepare rejects recognizable TypeSafe keys in verbatim topic or planning excerpts', async t => {
  const root = await fixture(t);
  const syntheticKey = `apikey_${'a1'.repeat(16)}_${'b2'.repeat(32)}`;
  for (const location of ['topic', 'planning']) {
    const value = input();
    if (location === 'topic') {
      value.topic_excerpt = `${topic}\n${syntheticKey}`;
      await writeFile(join(root, topicPath), value.topic_excerpt);
    } else {
      value.planning[0].excerpt = `${plan}\n${syntheticKey}`;
      await writeFile(join(root, planPath), value.planning[0].excerpt);
    }
    await assert.rejects(() => prepare(root, value), error => {
      assert.equal(error.code, 'invalid_input');
      assert.equal(error.message, 'Invalid Jev review input.');
      assert.ok(!String(error).includes(syntheticKey));
      return true;
    });
  }
  await assert.rejects(() => readFile(join(root, 'step_archive/outputs')), { code: 'ENOENT' });
});

test('HTTP failures and transport errors retain only safe categorized errors without retries', async t => {
  const root = await fixture(t);
  for (const [status, code] of [[401, 'authentication'], [403, 'authentication'], [429, 'rate_limit'], [302, 'transport'], [500, 'transport']]) {
    let calls = 0;
    const result = await run(root, input(), opts(async () => {
      calls++;
      return new Response(`${topic} ${key}`, { status });
    }));
    assert.equal(result.status, 'unverified');
    assert.equal(result.error_code, code);
    assert.equal(calls, 1);
    const report = await stored(root, result);
    assert.deepEqual(report.results, []);
    assert.ok(!JSON.stringify(report).includes(key));
    assert.ok(!JSON.stringify(result).includes(topic));
  }
  const failed = await run(root, input(), opts(async () => { throw new Error(`service ${key}`); }));
  assert.equal(failed.error_code, 'transport');
  assert.ok(!JSON.stringify(await stored(root, failed)).includes(key));
});

test('wrong model, answer set, labels, distributions and confidence cannot become reviewed', async t => {
  const root = await fixture(t);
  const mutations = [
    x => { x.model = 'jev-latest'; }, x => { delete x.answers['year-filter']; },
    x => { x.answers.extra = structuredClone(x.answers['year-filter']); },
    x => { x.answers['year-filter'].type = 'boolean'; }, x => { x.answers['year-filter'].choice = 'PASS'; },
    x => { x.answers['year-filter'].choice = 'unmet'; }, x => { delete x.answers['year-filter'].confidence; },
    x => { x.answers['year-filter'].confidence = -1; }, x => { x.answers['year-filter'].confidence = 1.1; },
    x => { x.answers['year-filter'].confidence = '0.8'; }, x => { x.answers['year-filter'].probabilities.met = .8; },
    x => { x.answers['year-filter'].probabilities.met = -1; }, x => { x.answers['year-filter'].probabilities.other = 0; },
    x => { delete x.answers['year-filter'].probabilities.unmet; }, x => { x.usage.input_tokens = -1; },
  ];
  for (const mutate of mutations) {
    const response = apiResponse(); mutate(response);
    const result = await run(root, input(), opts(async () => jsonResponse(response)));
    assert.equal(result.status, 'unverified');
    assert.equal(result.error_code, 'malformed_response');
    assert.deepEqual((await stored(root, result)).results, []);
  }
  for (const body of ['{invalid', JSON.stringify(apiResponse()).replace('"confidence":0.8', '"confidence":1e999')]) {
    const result = await run(root, input(), opts(async () => new Response(body)));
    assert.equal(result.error_code, 'malformed_response');
  }
});

test('body streaming cap and UTF-8 validation apply without trusting content-length', async t => {
  const root = await fixture(t);
  for (const response of [
    new Response(' '.repeat(65537)),
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32768)); controller.enqueue(new Uint8Array(32769)); controller.close(); } })),
    new Response(Buffer.from([0xff, 0xfe])),
  ]) {
    const result = await run(root, input(), opts(async () => response));
    assert.equal(result.status, 'unverified');
    assert.equal(result.error_code, 'malformed_response');
  }
});

test('deadline covers hung fetch and hung response body and aborts transport', async t => {
  const root = await fixture(t);
  for (const hangBody of [false, true]) {
    let signal;
    const result = await run(root, input(), { ...opts(async (_url, request) => {
      signal = request.signal;
      if (!hangBody) return new Promise(() => {});
      return new Response(new ReadableStream({ start() {} }));
    }), timeoutMs: 20 });
    assert.equal(result.error_code, 'timeout');
    assert.equal(signal.aborted, true);
    assert.deepEqual((await stored(root, result)).results, []);
  }
});

test('source mutation while receiving an answer invalidates every result', async t => {
  const root = await fixture(t);
  const result = await run(root, input(), opts(async () => {
    await writeFile(join(root, planPath), plan + '\nChanged during the request.');
    return jsonResponse(apiResponse());
  }));
  assert.equal(result.status, 'unverified');
  assert.equal(result.error_code, 'input_changed');
  assert.deepEqual((await stored(root, result)).results, []);
});

test('sources are checked again before transmission and changing them prevents any call', async t => {
  const root = await fixture(t);
  let calls = 0;
  const options = { allowNetwork: true, budgetRoot: freshBudget(), fetchImpl: () => { calls++; return jsonResponse(apiResponse()); },
    get apiKey() {
      writeFileSync(join(root, topicPath), topic + '\nChanged after preparation.');
      return key;
    },
  };
  const result = await run(root, input(), options);
  assert.equal(calls, 0);
  assert.equal(result.error_code, 'input_changed');
  assert.equal(result.status, 'unverified');
});

test('response-body edits and redirects cannot bypass freshness or transport restrictions', async t => {
  const root = await fixture(t);
  const edited = await run(root, input(), opts(async () => new Response(new ReadableStream({
    async start(controller) {
      await writeFile(join(root, topicPath), topic + '\nChanged while streaming.');
      controller.enqueue(Buffer.from(JSON.stringify(apiResponse())));
      controller.close();
    },
  }))));
  assert.equal(edited.error_code, 'input_changed');
  const response = jsonResponse(apiResponse());
  Object.defineProperty(response, 'redirected', { value: true });
  const redirected = await run(root, input(), opts(async () => response));
  assert.equal(redirected.error_code, 'transport');
});

test('linked output parents are refused without writing through the link', async t => {
  const root = await fixture(t);
  const elsewhere = join(root, 'elsewhere');
  await mkdir(elsewhere);
  await symlink(elsewhere, join(root, 'step_archive/outputs'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(() => run(root, input()), { code: 'report_write_failed' });
  await assert.rejects(() => readFile(join(elsewhere, 'jev-reviews')), { code: 'ENOENT' });
});

test('option bounds and selected actual-key content fail before transmission', async t => {
  const root = await fixture(t);
  let calls = 0;
  for (const timeoutMs of [0, -1, 30001, '1000', NaN, Infinity]) {
    await assert.rejects(() => run(root, input(), { ...opts(() => { calls++; }), timeoutMs }), { code: 'invalid_input' });
  }
  const value = input();
  value.planning[0].excerpt = `Plan includes ${key}.`;
  await writeFile(join(root, planPath), value.planning[0].excerpt);
  await assert.rejects(() => run(root, value, opts(() => { calls++; })), { code: 'invalid_input' });
  assert.equal(calls, 0);
});

test('the actual API key cannot be retained through a selected source filename', async t => {
  const root = await fixture(t);
  const value = input();
  value.planning[0].path = `step_archive/step025_${key}.md`;
  await writeFile(join(root, value.planning[0].path), plan);
  let calls = 0;
  await assert.rejects(() => run(root, value, opts(async () => { calls++; return jsonResponse(apiResponse()); })), { code: 'invalid_input' });
  assert.equal(calls, 0);
});

test('inspect detects later source edits, report tamper, invalid shapes and report symlinks', async t => {
  const root = await fixture(t);
  const result = await run(root, input(), opts(async () => jsonResponse(apiResponse())));
  assert.equal((await inspect(root, result.report_path)).status, 'current');
  await writeFile(join(root, planPath), plan + '\nLater source edit.');
  assert.equal((await inspect(root, result.report_path)).status, 'stale');
  const bytes = await readFile(join(root, result.report_path));
  await writeFile(join(root, result.report_path), Buffer.concat([bytes, Buffer.from(' ')]));
  assert.equal((await inspect(root, result.report_path)).status, 'invalid');
  const forged = Buffer.from(JSON.stringify({ status: 'reviewed', role: 'advisory', step: 25 }));
  const forgedPath = `step_archive/outputs/jev-reviews/${hash(forged)}.json`;
  await writeFile(join(root, forgedPath), forged);
  assert.equal((await inspect(root, forgedPath)).status, 'invalid');
  assert.equal((await inspect(root, '../.env')).status, 'invalid');
  const originalPath = `step_archive/outputs/jev-reviews/${hash(bytes)}.json`;
  await rm(join(root, originalPath));
  try { await symlink(join(root, forgedPath), join(root, originalPath)); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  assert.equal((await inspect(root, originalPath)).status, 'invalid');
});

test('report shape validation rejects rehashed injection fields instead of echoing them', async t => {
  const root = await fixture(t);
  const result = await run(root, input(), opts(async () => jsonResponse(apiResponse())));
  const report = await stored(root, result);
  report.results[0].notes = `${topic} ${key}`;
  const bytes = Buffer.from(JSON.stringify(report));
  const path = `step_archive/outputs/jev-reviews/${hash(bytes)}.json`;
  await writeFile(join(root, path), bytes);
  const checked = await inspect(root, path);
  assert.equal(checked.status, 'invalid');
  assert.ok(!JSON.stringify(checked).includes(key));
});
