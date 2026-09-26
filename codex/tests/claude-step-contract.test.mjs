// Claude step bodies end an exhausted retry or review loop with a named pause instead of moving
// on, do not point at hooks that are not bundled, do not ask the model to edit progress.json, take
// the topic from the TOPIC.md session_prompt and check Biome by its scoped package name (PR-B B3).
// Static checks over assets/steps, codex/assets/steps, the Codex index and the harness-rules
// constitution. Each judgement is a pure function that throws, so the mutation cases can reuse it
// and prove that a check can fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODEL_PAUSE_REASONS } from '../../scripts/lib/pause-state.mjs';

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

// The one ending of an exhausted three-retry budget, the Self-Calibration lead and the ending of a
// bounded review loop. Same characters as the PR-B WP4 substitution script.
const TAIL = '3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. ' +
  '완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, ' +
  '그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.';
const SC_LEAD = '- 불확실한 부분은 결정하고 `결정/사유: <결정> — <사유>` 줄로 기록한다(헌법 §1). N이면 재실행한다. ';
const FIX_LEAD = '- N이면 해당 부분을 보완하고 재평가한다. ';
const LOOP_TAIL = '한도 소진이나 같은 필수 항목의 연속 미수정으로 끝나면 `required-input-missing`, 필수 실행·시각 검사 기능이 없으면 ' +
  '`required-tool-failed`로 헌법 §2-1 명명된 멈춤을 기록하고 턴을 끝낸다.';
const RETRY = '3회 재시도 후에도';
// Where the tail sits: the Self-Calibration section (FIX_LEAD in 37, 41, 42, SC_LEAD elsewhere) and
// the '## 오류 발생 시' section. 33, 34, 41 and 42 carry both.
const SELF_CAL_STEPS = [1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 21, 31, 33, 34, 37, 41, 42];
const FIX_LEAD_STEPS = [37, 41, 42];
const ERROR_STEPS = [2, 16, 18, 20, 22, 23, 26, 27, 28, 29, 30, 33, 34, 41, 42, 46];
const LOOP_STEPS = [24, 25, 29, 39, 40, 43, 47, 48, 49, 50];
const count = (content, needle) => content.split(needle).length - 1;

// A '## heading' section runs to the next '## ' heading or '---' rule.
function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => /^## /.test(line) || line === '---');
  return rest.slice(0, end < 0 ? rest.length : end).join('\n');
}

// C1: no body moves on after a failure, asks for a free-form user intervention or parks the step
// as INCOMPLETE without a named pause.
const MOVE_ON = /오류 기록 후 다음 Step 진행|오류를 기록하고 다음 Step으로 진행|사용자 개입 요청|INCOMPLETE로 현재 단계에 머문다/;
function assertNoMoveOn(label, content) {
  assert.doesNotMatch(content, MOVE_ON, `${label}: moves on or parks without a named pause`);
}

// C2: every exhausted three-retry budget ends with the one TAIL.
function assertRetryTail(label, content) {
  for (let at = content.indexOf(RETRY); at >= 0; at = content.indexOf(RETRY, at + RETRY.length)) {
    assert.ok(content.startsWith(TAIL, at), `${label}: '${RETRY}' at offset ${at} is not the named-pause tail`);
  }
}
function assertTailSections(n, content) {
  assertRetryTail(`step${pad(n)}`, content);
  const selfCal = section(content, '## Self-Calibration');
  const errors = section(content, '## 오류 발생 시');
  if (SELF_CAL_STEPS.includes(n)) {
    assert.notEqual(selfCal, null, `step${pad(n)}: '## Self-Calibration' heading`);
    const lead = FIX_LEAD_STEPS.includes(n) ? FIX_LEAD : SC_LEAD;
    assert.ok(selfCal.split('\n').includes(lead + TAIL), `step${pad(n)}: Self-Calibration tail`);
  } else if (selfCal !== null) {
    assert.ok(!selfCal.includes(TAIL), `step${pad(n)}: unexpected Self-Calibration tail`);
  }
  if (ERROR_STEPS.includes(n)) {
    assert.notEqual(errors, null, `step${pad(n)}: '## 오류 발생 시' heading`);
    assert.ok(errors.includes(TAIL), `step${pad(n)}: '## 오류 발생 시' tail`);
  } else if (errors !== null) {
    assert.ok(!errors.includes(TAIL), `step${pad(n)}: unexpected '## 오류 발생 시' tail`);
  }
}

// C3: bounded review loops name the pause codes; step 49's last transition line ends in a named
// pause, not a bare stop.
function assertLoopTail(n, content) {
  assert.ok(content.split('\n').includes(LOOP_TAIL), `step${pad(n)}: loop tail line`);
  if (n === 49) {
    const last = content.trimEnd().split('\n').at(-1);
    assert.match(last, /명명된 멈춤/, 'step049: last transition line names the pause');
    assert.ok(!last.endsWith('현재 단계에서 멈춘다.'), 'step049: last transition line is a bare stop');
  }
}

// C4: the only pause codes a body may name are the ones the model may choose.
function assertPauseCodes(label, content) {
  for (const [token] of content.matchAll(/\b(?:permission|required|user)-[a-z-]+\b/g)) {
    assert.ok(MODEL_PAUSE_REASONS.includes(token), `${label}: ${token} is not a model pause reason`);
  }
}

// C10: the constitution's body-reading paragraph names the codes and the exceptions, and quotes
// the old move-on wording only in the sentence about bodies archived before the upgrade.
const OLD_BODIES = '업그레이드 전에 `step_archive/archived/`로 복사된 옛 본문은 그대로 쓰인다:';
function assertBodyReading(skill) {
  const paragraph = skill.split('\n').find(line => line.startsWith('단계 본문 해석: '));
  assert.ok(paragraph, "harness-rules: '단계 본문 해석' paragraph");
  for (const needle of [...MODEL_PAUSE_REASONS.map(code => `\`${code}\``), '`SKIP`', '`SPEC-NNN.md`', '`결정/사유`']) {
    assert.ok(paragraph.includes(needle), `harness-rules: body-reading paragraph lacks ${needle}`);
  }
  const archived = paragraph.indexOf(OLD_BODIES);
  assert.ok(archived >= 0, 'harness-rules: archived-body sentence');
  assert.equal(count(skill, '오류 기록 후 다음 Step 진행'), 1, 'harness-rules: old move-on wording occurs once');
  assert.ok(paragraph.slice(archived).includes('"오류 기록 후 다음 Step 진행"은 필수 도구·필수 입력 미달일 때만 이 절차로 바뀌며'),
    'harness-rules: old move-on wording only inside the archived-body sentence');
}

// The haiku worker hands an exhausted body retry back with the same codes.
const EXECUTOR_CODES = '(평가 라운드 한도 소진과 단계 본문의 3회 재시도 소진은 required-input-missing, 필수 도구면 required-tool-failed)';
function assertExecutorCodes(executor) {
  assert.ok(executor.includes(`아래 한 줄로 인계한다${EXECUTOR_CODES}.`), 'step-executor: body retry exhaustion codes');
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

test('C1 no Claude step body moves on after a failure or parks without a named pause', () => {
  for (const [name, content] of claudeBodies()) assertNoMoveOn(name, content);
});

test('C2 every exhausted three-retry budget ends with the one named-pause tail in its section', () => {
  let tails = 0;
  let retries = 0;
  for (let n = 1; n <= 50; n += 1) {
    const content = claudeStep(n);
    assertTailSections(n, content);
    tails += count(content, TAIL);
    retries += count(content, RETRY);
  }
  assert.equal(SELF_CAL_STEPS.length + ERROR_STEPS.length, 36);
  assert.equal(tails, 36, 'named-pause tails');
  assert.equal(retries, 36, `'${RETRY}' places`);
  assert.equal(count(claudeStep(1), RETRY), 1, 'step001: the required-tool policy line does not reuse the retry wording');
  assert.match(claudeStep(1), /- \*\*필수 도구 실패\*\*: 서로 다른 조치로 3회 시도해도 실패하면[^\n]*`required-tool-failed` 명명된 멈춤으로 끝낸다\./);
});

test('C3 bounded review loops end with the loop tail and step 49 ends in a named pause', () => {
  let loops = 0;
  for (const n of LOOP_STEPS) assertLoopTail(n, claudeStep(n));
  for (const [, content] of claudeBodies()) loops += count(content, LOOP_TAIL);
  assert.equal(loops, 11, 'loop tails (step 50 has two)');
  assert.equal(count(claudeStep(50), LOOP_TAIL), 2, 'step050: exit conditions and final regression');
  assert.doesNotMatch(claudeStep(49), /현재 단계에서 멈춘다/, 'step049: a bare stop remains');
});

test('C4 step bodies name only the pause codes the model may choose', () => {
  assert.deepEqual([...MODEL_PAUSE_REASONS].sort(), ['permission-denied', 'required-input-missing', 'required-tool-failed']);
  for (const [name, content] of claudeBodies()) {
    assertPauseCodes(name, content);
    assert.doesNotMatch(content, /user-request/, `${name}: user-request is the user's code`);
  }
});

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

test('C10 the constitution reads new bodies strictly and keeps the 2.10.0 reading for archived ones', () => {
  assertBodyReading(text('skills/harness-rules/SKILL.md'));
  assertExecutorCodes(text('agents/step-executor.md'));
});

test('C12 PORTING.md documents the source change procedure', () => {
  const procedure = section(text('codex/assets/steps/PORTING.md'), '## Source change procedure');
  assert.notEqual(procedure, null, "PORTING.md: '## Source change procedure' heading");
  const items = procedure.split('\n').filter(line => /^\d\. /.test(line)).map(line => Number(line[0]));
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7]);
  for (const needle of ['SOURCE_CHANGED_REVIEW_REQUIRED', 'historicalReplayContract', 'EXPECTED_*_TARGET_SHA256', 'validated 50 indexed step(s)']) {
    assert.ok(procedure.includes(needle), `PORTING.md: ${needle}`);
  }
});

test('C11 the tail, loop, pause-code and constitution checks reject the old wording', () => {
  const step41 = claudeStep(41);
  const oldR4 = '- N이면 해당 부분을 보완하고 재평가한다. 3회 재시도 후에도 미달이면 오류를 기록하고 현재 Step을 INCOMPLETE로 인계한다. 다음 Step으로 진행하지 않는다.';
  const r4 = step41.replace(FIX_LEAD + TAIL, oldR4);
  assert.notEqual(r4, step41);
  assert.throws(() => assertTailSections(41, r4));
  assert.throws(() => assertRetryTail('step041 mutated', r4));

  const step49 = claudeStep(49);
  const noLoop = step49.replace(`${LOOP_TAIL}\n`, '');
  assert.notEqual(noLoop, step49);
  assert.throws(() => assertLoopTail(49, noLoop));
  const bareStop = step49.replace('`INCOMPLETE`이면 완료를 보고하지 않고 헌법 §2-1 명명된 멈춤으로 끝낸다.', '`INCOMPLETE`이면 현재 단계에서 멈춘다.');
  assert.notEqual(bareStop, step49);
  assert.throws(() => assertLoopTail(49, bareStop));

  const step41UserRequest = `${step41}\n멈추면 \`harness-pause.mjs\`를 reason user-request로 실행한다.\n`;
  assert.notEqual(step41UserRequest, step41);
  assert.throws(() => assertPauseCodes('step041 mutated', step41UserRequest));

  const step6 = claudeStep(6);
  const parked = step6.replace(SC_LEAD + TAIL, '- N 또는 불확실한 부분이 있으면 재실행한다. 3회 재시도 후에도 미달이면 오류와 필요한 조치를 기록하고 INCOMPLETE로 현재 단계에 머문다.');
  assert.notEqual(parked, step6);
  assert.throws(() => assertNoMoveOn('step006 mutated', parked));

  const skill = text('skills/harness-rules/SKILL.md');
  const oldReading = skill.replace(/^단계 본문 해석: .*$/m,
    '단계 본문 해석: "사용자 개입 요청"은 이 절차를 뜻한다. "현재 단계에서 멈춘다"는 완료를 보고하지 않고 다음 단계로 가지 않는다는 뜻이다. ' +
    '원인이 위 사유면 이 절차로 멈추고, 아니면 허용된 라운드 안에서 현재 단계를 고친다. ' +
    '필수 도구·필수 입력이 미달이면 "오류 기록 후 다음 Step 진행" 문구보다 이 절이 우선한다.');
  assert.notEqual(oldReading, skill);
  assert.throws(() => assertBodyReading(oldReading));
  const noArchived = skill.replace(OLD_BODIES, '옛 본문은 그대로 쓰인다:');
  assert.notEqual(noArchived, skill);
  assert.throws(() => assertBodyReading(noArchived));

  const executor = text('agents/step-executor.md');
  const oldExecutor = executor.replace(EXECUTOR_CODES, '(평가 라운드 한도 소진은 required-input-missing)');
  assert.notEqual(oldExecutor, executor);
  assert.throws(() => assertExecutorCodes(oldExecutor));
});
