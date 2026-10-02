import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const steps = [16, 24, 25, 30, 37, 45, 49];

test('both host step contracts route authorized excerpts through the generic advisory helper', async () => {
  for (const number of steps) {
    for (const prefix of ['assets', 'codex/assets']) {
      const path = `${prefix}/steps/step${String(number).padStart(3, '0')}.md`;
      const text = await read(path);
      assert.match(text, /## Jev 의미 체크포인트/, path);
      assert.match(text, /현재 작업[^]*Jev[^]*발췌문[^]*외부 전송[^]*승인/, path);
      assert.match(text, /기존 승인[^]*재확인하지 않는다/, path);
      assert.match(text, /단계 도달[^]*TYPESAFE_API_KEY[^]*승인[^]*아니다/, path);
      assert.match(text, /scripts\/jev-judge\.mjs/, path);
      assert.match(text, /prepare[^]*inspect[^]*request_hash[^]*policy_hash[^]*input_hash[^]*sources/, path);
      assert.match(text, /변하지 않은 입력[^]*한 배치[^]*호스트 정책/, path);
      assert.match(text, /독립 검증[^]*완료/, path);
      assert.match(text, /docs\/jev-checkpoints\.md/, path);
    }
  }
});

test('checkpoint metadata allows only the documented optional API exception', async () => {
  const index = JSON.parse(await read('codex/assets/steps/index.json'));
  for (const number of steps) {
    const step = index.steps[number - 1];
    assert.equal(step.network, true, step.id);
    const text = await read(step.target);
    assert.match(text, /네트워크:[^\n]*Jev[^\n]*선택[^\n]*API/, step.id);
    assert.match(text, /일반 웹 탐색[^]*허용하지 않는다/, step.id);
  }
});

test('host entry points carry authorization, deduplication and unchanged completion ownership', async () => {
  for (const path of ['commands/webapp.md', 'codex/skills/webapp/SKILL.md', 'agents/step-executor.md']) {
    const text = await read(path);
    assert.match(text, /16[^\n]*24[^\n]*25[^\n]*30[^\n]*37[^\n]*45[^\n]*49/, path);
    assert.match(text, /jev-judge\.mjs/, path);
    assert.match(text, /request_hash[^]*policy_hash[^]*input_hash[^]*sources/, path);
    assert.match(text, /기존 승인[^]*재확인하지 않는다|reuse existing authorization[^]*do not ask again/i, path);
    assert.match(text, /한 배치[^]*호스트 정책|one batch[^]*host policy/i, path);
    assert.match(text, /독립 검증|independent review/i, path);
  }
});

test('implementation prose is persisted and findings can remain insufficient evidence', async () => {
  for (const prefix of ['assets', 'codex/assets']) {
    const implementation = await read(`${prefix}/steps/step037.md`);
    assert.match(implementation, /step_archive\/step037_구현manifest\.md[^]*본문 발췌문[^]*저장/);
    assert.match(implementation, /텍스트만[^]*실행 정확성[^]*증명하지 않는다/);
    const findings = await read(`${prefix}/steps/step049.md`);
    assert.match(findings, /criterion_violation[^]*preference[^]*insufficient_evidence/);
    assert.match(findings, /insufficient_evidence[^]*실패[^]*단정하지 않는다/);
  }
});

test('Step25 keeps legacy compatibility without duplicate automatic invocation', async () => {
  for (const prefix of ['assets', 'codex/assets']) {
    const text = await read(`${prefix}/steps/step025.md`);
    assert.match(text, /JEV-REVIEW\.md/);
    assert.match(text, /jev-review\.mjs[^]*호환/);
    assert.match(text, /중복 호출하지 않는다/);
    assert.doesNotMatch(text, /workflow가 자동 실행하지 않는다/);
  }
});

test('guide includes executable public examples for every checkpoint and protects gate authority', async () => {
  const text = await read('docs/jev-checkpoints.md');
  for (const number of steps) assert.match(text, new RegExp(`\\[${number}, `));
  assert.match(text, /--allow-network/);
  assert.match(text, /insufficient_evidence/);
  assert.match(text, /provider attestation/);
  assert.match(text, /하드 쿼터가 아니다/);
  assert.match(await read('docs/QUALITY.md'), /jev-checkpoints\.md/);
});

for (const { profile, total, checkpoints, flags } of [
  { profile: 'research-free-36-v1', total: 36, checkpoints: [17, 18, 25, 31, 35], flags: [] },
  { profile: 'legacy-50-v1', total: 50, checkpoints: [16, 24, 25, 30, 37, 45, 49], flags: ['--legacy'] }
]) test(`documented ${profile} inputs prepare offline in a missing workspace through the actual CLI`, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'harness50-jev-routing-'));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    assert.ok(basename(directory).startsWith('harness50-jev-routing-'));
    await rm(directory, { recursive: true, force: true });
  });
  const guide = await read('docs/jev-checkpoints.md');
  const script = /```javascript\n([^]*?)\n```/.exec(guide)?.[1];
  assert.ok(script, 'missing runnable synthetic example');
  const example = join(directory, 'jev-examples.mjs');
  await writeFile(example, script, 'utf8');
  const workspace = join(directory, 'workspace');
  const result = spawnSync(process.execPath, [example, fileURLToPath(root), workspace, ...flags], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, TYPESAFE_API_KEY: '' }
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const prepared = result.stdout.trim().split('\n').map(line => {
    const match = /^step (\d+): (.*)$/.exec(line);
    assert.ok(match, 'unexpected example output');
    const report = JSON.parse(match[2]);
    assert.equal(report.status, 'prepared');
    assert.equal(report.step, Number(match[1]));
    assert.equal(report.questions[0].abstain, 'insufficient_evidence');
    assert.equal(report.sources.length, 1);
    return report.step;
  });
  assert.deepEqual(prepared, checkpoints);
  const state = JSON.parse(await readFile(join(workspace, 'step_archive/.harness50-codex/state.json'), 'utf8'));
  assert.equal(state.total_steps, total);
  assert.equal(state.workflow_profile ?? 'legacy-50-v1', profile);
  assert.equal(state.schema_version, profile === 'legacy-50-v1' ? 1 : 2);
});
