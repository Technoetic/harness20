// Claude step bodies do not point at hooks that are not bundled, do not ask the model to edit
// progress.json, take the topic from the TOPIC.md session_prompt and check Biome by its scoped
// package name (PR-B B3). Static checks over assets/steps, codex/assets/steps and the Codex index.
// Each judgement is a pure function that throws, so the mutation cases can reuse it and prove
// that a check can fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const text = file => readFileSync(join(repo, file), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const pad = n => String(n).padStart(3, '0');
const claudeStep = n => text(`assets/steps/step${pad(n)}.md`);
const codexStep = n => text(`codex/assets/steps/step${pad(n)}.md`);
function bodies(dir) {
  const names = readdirSync(join(repo, dir)).filter(name => /^step\d{3}\.md$/.test(name)).sort();
  assert.equal(names.length, 50, `${dir}: step body count`);
  return new Map(names.map(name => [name, text(`${dir}/${name}`)]));
}
const claudeBodies = () => bodies('assets/steps');
const codexBodies = () => bodies('codex/assets/steps');
const indexText = () => text('codex/assets/steps/index.json');

const SCOPED_BIOME = 'npx --no-install @biomejs/biome --version';
const OPTIONAL_TOOL_STEPS = [8, 9, 11, 15];
const REQUIRED_TOOL_STEPS = [10, 12, 13, 14];

// A '## heading' section runs to the next '## ' heading or '---' rule.
function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => /^## /.test(line) || line === '---');
  return rest.slice(0, end < 0 ? rest.length : end).join('\n');
}

// C5: the model never writes progress.json and no body names the missing loader or rule file.
const PROGRESS_WRITES = [
  /failure_patterns/,
  /progress\.json[^\n]*(?:배열에|추가한다|초기화)/,
  /step-progress-loader[^\n]*(?:생성|만든)/,
  /NEW-WORK-규칙\.md/
];
function assertNoProgressWrites(label, content) {
  for (const pattern of PROGRESS_WRITES) assert.doesNotMatch(content, pattern, `${label}: ${pattern}`);
}

// C6: no body runs a project .claude/hooks script. A *-validator/*-checker .ps1 name is allowed
// only for the two bundled hooks or on a line that records the old script as retired/missing.
const BUNDLED_VALIDATORS = new Set(['mx-tag-validator.ps1', 'trust5-validator.ps1']);
function assertNoUnbundledValidators(label, content) {
  assert.doesNotMatch(content, /\.claude[\\/]hooks/, `${label}: .claude/hooks`);
  for (const line of content.split('\n')) {
    for (const [name] of line.matchAll(/[\w-]+-(?:validator|checker)\.ps1/g)) {
      if (BUNDLED_VALIDATORS.has(name)) continue;
      assert.match(line, /구 [\w-]+\.ps1은 (?:retired|존재하지 않음)/, `${label}: unbundled ${name}`);
    }
  }
}

// C7: `npx biome` resolves the unrelated npm package `biome`; both hosts use the scoped name.
function assertScopedBiome(label, content) {
  assert.doesNotMatch(content, /npx biome\b/, `${label}: npx biome`);
}

// C8: step 1 reads the topic from the session_prompt that /webapp wrote and only reads progress.json.
function assertTopicSource(content) {
  assert.match(content, /`step_archive\/TOPIC\/TOPIC\.md`의 `session_prompt` 블록에서 다음 항목을 추출한다:/);
  assert.match(content, /`created`와 `session_prompt`는 바이트 그대로 두고 그 아래 필드만 채워 다시 쓴다/);
  assert.doesNotMatch(content, /\(이미 있으면 덮어쓴다\)/);
  assert.doesNotMatch(content, /본 세션[^\n]*프롬프트에서/);
  assert.ok(content.split('\n').includes('### 3. progress.json 상태 확인 (읽기 전용)'), 'read-only progress.json heading');
}

// C9: steps 8-15 keep the '## 검증' heading (SPEC extraction, hooks/spec-generator.sh) and check the
// CLI directly with npx --no-install; optional tools record SKIP, required tools say so.
function assertToolCheck(n, content) {
  const check = section(content, '## 검증');
  assert.notEqual(check, null, `step${pad(n)}: '## 검증' heading`);
  assert.doesNotMatch(check, /\bnpx (?!--no-install )/, `step${pad(n)}: npx without --no-install`);
  assert.match(check, /자동 검증 훅은 번들되지 않는다/, `step${pad(n)}: unbundled hook note`);
  if (OPTIONAL_TOOL_STEPS.includes(n)) {
    assert.match(check, /이 도구는 선택이다\. 끝내 쓸 수 없으면 `SKIP`과 사유·대체 방법을 기록하고 완료한다\./,
      `step${pad(n)}: optional tool SKIP`);
  } else {
    assert.ok(REQUIRED_TOOL_STEPS.includes(n), `step${pad(n)}: classified`);
    assert.match(check, /이 도구는 필수다\./, `step${pad(n)}: required`);
    assert.doesNotMatch(check, /SKIP|선택/, `step${pad(n)}: a required tool is never skipped`);
  }
}

test('C5 no step body edits progress.json or cites the missing loader or rule file', () => {
  for (const [name, content] of claudeBodies()) assertNoProgressWrites(name, content);
  for (const n of [25, 39, 43]) {
    assert.match(claudeStep(n), /`## 실패 패턴` 절에 적는다[^\n]*`step_archive\/progress\.json`은 수정하지 않는다/, `step${pad(n)}`);
  }
});

test('C6 no Claude step body runs an unbundled validator or a .claude/hooks script', () => {
  for (const [name, content] of claudeBodies()) assertNoUnbundledValidators(name, content);
});

test('C7 both hosts and the Codex index check Biome with the scoped package name', () => {
  for (const [name, content] of claudeBodies()) assertScopedBiome(`claude ${name}`, content);
  for (const [name, content] of codexBodies()) assertScopedBiome(`codex ${name}`, content);
  assertScopedBiome('index.json', indexText());
  const step14 = JSON.parse(indexText()).steps.find(item => item.id === 'step014');
  assert.equal(step14.acceptance.find(item => item.id === 'biome-version').command, SCOPED_BIOME);
  assert.ok(codexStep(14).includes(`\`\`\`text\n${SCOPED_BIOME}\n\`\`\``), 'codex step014 command block');
  assert.ok(section(claudeStep(14), '## 검증').includes(`\`${SCOPED_BIOME}\``), 'claude step014 check');
  assert.ok(claudeStep(1).includes(`| Biome | ${SCOPED_BIOME} |`), 'claude step001 table');
  assert.ok(codexStep(1).includes(`| 필수 | Biome | \`${SCOPED_BIOME}\` |`), 'codex step001 table');
});

test('C8 step 1 takes the topic from session_prompt and only reads progress.json', () => {
  assertTopicSource(claudeStep(1));
});

test('C9 steps 8-15 check their CLI directly and classify it like the Codex index', () => {
  const index = JSON.parse(indexText());
  for (const n of [...OPTIONAL_TOOL_STEPS, ...REQUIRED_TOOL_STEPS].sort((a, b) => a - b)) {
    assertToolCheck(n, claudeStep(n));
    const version = index.steps[n - 1].acceptance.find(item => item.kind === 'command');
    assert.equal(version.required, REQUIRED_TOOL_STEPS.includes(n), `step${pad(n)}: Codex classification`);
  }
});

test('C6m/C7m the validator and Biome checks reject a reintroduced hook or unscoped Biome', () => {
  const step8 = claudeStep(8);
  const hook = step8.replace('## 검증\n', '## 검증\n\n**Hook**: `.claude/hooks/jscpd-validator.ps1`\n');
  assert.notEqual(hook, step8);
  assert.throws(() => assertNoUnbundledValidators('step008 mutated', hook));
  const bare = step8.replace('## 검증\n', '## 검증\n\n`jscpd-validator.ps1`을 실행한다.\n');
  assert.notEqual(bare, step8);
  assert.throws(() => assertNoUnbundledValidators('step008 bare', bare));

  const step1 = claudeStep(1);
  const biome = step1.replace(`| Biome | ${SCOPED_BIOME} |`, '| Biome | `npx biome --version` |');
  assert.notEqual(biome, step1);
  assert.throws(() => assertScopedBiome('step001 mutated', biome));
});

test('C5m/C8m/C9m the progress, topic and tool checks reject the old wording', () => {
  const step25 = claudeStep(25);
  const progress = `${step25}\n종료 시 \`step_archive/progress.json\`의 \`failure_patterns\` 배열에 FAIL 항목을 추가한다.\n`;
  assert.notEqual(progress, step25);
  assert.throws(() => assertNoProgressWrites('step025 mutated', progress));

  const step1 = claudeStep(1);
  const overwrite = step1.replace('(`created`와 `session_prompt`는 바이트 그대로 두고 그 아래 필드만 채워 다시 쓴다)', '(이미 있으면 덮어쓴다)');
  assert.notEqual(overwrite, step1);
  assert.throws(() => assertTopicSource(overwrite));

  const step8 = claudeStep(8);
  const noSkip = step8.replace('끝내 쓸 수 없으면 `SKIP`과 사유·대체 방법을 기록하고 완료한다. ', '');
  assert.notEqual(noSkip, step8);
  assert.throws(() => assertToolCheck(8, noSkip));
  const unscoped = step8.replace('`npx --no-install jscpd --version`', '`npx jscpd --version`');
  assert.notEqual(unscoped, step8);
  assert.throws(() => assertToolCheck(8, unscoped));
  const step10 = claudeStep(10);
  const skipRequired = step10.replace('이 도구는 필수다.', '이 도구는 필수다. 쓸 수 없으면 `SKIP`과 사유를 기록한다.');
  assert.notEqual(skipRequired, step10);
  assert.throws(() => assertToolCheck(10, skipRequired));
  const step13 = claudeStep(13);
  const heading = step13.replace('## 검증\n', '## 확인\n');
  assert.notEqual(heading, step13);
  assert.throws(() => assertToolCheck(13, heading));
});
