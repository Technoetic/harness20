// Visual and console verifiers block only on criterion violations and report where, why and how
// to reproduce (PR-B D3); screenshot judgement never runs on haiku (PR-B D9). Static checks over
// the Claude step bodies, the evaluator and executor prompts, the constitution and the shared
// QA report guide, plus one Codex step 50 sentence. Each assert helper is also run against a
// mutated copy so a check that cannot fail is caught.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const text = file => readFileSync(join(repo, file), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const step = n => text(`assets/steps/step${String(n).padStart(3, '0')}.md`);

const FIELD_LINES = [
  '- 위치: 소스 `file:line`, 또는 route·viewport·selector·스크린샷 파일과 영역',
  '- 기준: 어긴 명세·토큰·acceptance의 출처(파일과 절 또는 줄)',
  '- 기대/관찰: 기대값과 관찰값(예: gap 24px 기대, 40px 관찰)',
  '- 재현: 같은 화면을 다시 보는 route·viewport·선행 조작'
];
const BLANKET = [/사소한 위화감/, /자연스러운가/, /부족한 부분이 (?:있|없)으면/, /Awwwards (?:수준|수상작처럼|수상작 수준)/];

function assertVerifierPrompt(content, label) {
  for (const pattern of BLANKET) assert.doesNotMatch(content, pattern, `${label}: ${pattern}`);
  const fields = content.split('\n').map(line => line.trim()).filter(line => /^- (?:위치|기준|기대\/관찰|재현): /.test(line));
  assert.deepEqual(fields, FIELD_LINES, `${label}: finding fields`);
  assert.match(content, /필수 finding\(`Critical`\/`Important`\): 설계 명세·선택 토큰·필수 acceptance를 어긴 것, 또는 기능·접근성 결함/, label);
  assert.match(content, /`advisory`: 어긴 기준을 인용할 수 없는 미관·선호 의견\. advisory만 남으면 PASS이며 수정 대상이 아니다/, label);
}

// A line that gives haiku a judgement must hand the judgement to the main session or sonnet+.
// "판정 금지" (step 50 fixer) and "판정을 적지 않는다" deny a judgement, so they do not count.
function haikuJudgementLines(content) {
  return content.split('\n').filter(line => /haiku/i.test(line)
    && /판정/.test(line.replace(/판정 금지|판정을 적지 않는다/g, '')) && !/sonnet 이상/.test(line));
}

test('V1 the Claude visual verifier prompts (039, 040, 043) drop blanket FAIL wording and share one finding format', () => {
  for (const n of [39, 40, 43]) {
    const content = step(n);
    assertVerifierPrompt(content, `step0${n}`);
    assert.match(content, /"FAIL"로 시작하고 필수 finding을 위 네 필드로|필수 finding을 위 네 필드로 기록하여 에이전트 A에 전달/, `step0${n}`);
  }
  assert.match(step(43), /설계가 채택하지 않은 요소는 advisory다/);
  assert.match(step(40), /설계가 채택하지 않은 참고 이미지의 요소는 필수 기준이 아니다/);
});

test('V1m the prompt check rejects the old blanket wording and a missing field', () => {
  const good = step(39);
  const mutations = {
    trivial: good.replace('관찰한 것은 모두 적는다.', '사소한 위화감도 놓치지 않는다. 관찰한 것은 모두 적는다.'),
    blanketFail: good.replace('하나라도 있으면: "FAIL"로 시작', '부족한 부분이 있으면: "FAIL"로 시작'),
    noRepro: good.replace(`     ${FIELD_LINES[3]}\n`, ''),
    advisoryBlocks: good.replace('advisory만 남으면 PASS이며 수정 대상이 아니다', 'advisory도 FAIL이다')
  };
  for (const [name, mutated] of Object.entries(mutations)) {
    assert.notEqual(mutated, good, name);
    assert.throws(() => assertVerifierPrompt(mutated, name), undefined, name);
  }
});

test('V2 step 49, the evaluator and the constitution require location, criterion, expected/observed and reproduction', () => {
  const s49 = step(49);
  assert.match(s49, /필수 finding마다 위치\(소스 `file:line`, 또는 route·viewport·selector·스크린샷 파일과 영역\), 기준[^\n]*기대\/관찰, 재현[^\n]*기준을 인용할 수 없는 지적은 `advisory`다/);
  assert.match(s49, /\*\*관찰과 판정을 나눈다\*\*/);
  assert.match(s49, /\*\*FAIL\*\*: 필수 finding을 위치·기준·기대\/관찰·재현 네 필드로/);
  const evaluator = text('skills/evaluator/SKILL.md');
  assert.match(evaluator, /^> 1\. `Critical`\/`Important` \| 위치: [^\n]*\| 기준: [^\n]*\| 기대\/관찰: [^\n]*\| 재현: /m);
  assert.doesNotMatch(evaluator, /중요도 \+ 필수 기준: 구체적 설명/);
  const rules = text('skills/harness-rules/SKILL.md');
  const s11 = /^## 11\. 검증 판정과 finding 형식\n([\s\S]*?)(?=^## |^---$)/m.exec(rules);
  assert.ok(s11, 'harness-rules has no section 11');
  assert.match(s11[1], /인용할 기준이 없는 미관·선호 의견은 `advisory`/);
  assert.match(s11[1], /위치를 못 찾았다는 이유로 필수 finding을 `advisory`로 낮추지 않는다/);
  assert.match(s11[1], /"사소한 위화감도 놓치지 않는다"와 "부족한 부분이 있으면 FAIL"은 관찰을 빠짐없이 적으라는 뜻/);
});

test('V3 console findings use fixed fields on both hosts', () => {
  const claude = step(50);
  assert.doesNotMatch(claude, /보고 형식과 항목은 에이전트 B가 판단한다/);
  const fields = claude.split('\n').map(line => line.trim()).filter(line => /^- (?:상태|범주|메시지|stack|진입 순서|분류): /.test(line)).map(line => line.split(':')[0]);
  assert.deepEqual(fields, ['- 상태', '- 범주', '- 메시지', '- stack', '- 진입 순서', '- 분류']);
  assert.match(claude, /- stack: 첫 애플리케이션 프레임의 `file:line`/);
  const codex = text('codex/assets/steps/step050.md');
  const section = /^## 도달 가능 상태와 오류 수집\n([\s\S]*?)(?=^## )/m.exec(codex);
  assert.ok(section, 'codex step050 has no collection section');
  assert.match(section[1].replace(/\s+/g, ' '), /각 오류 finding에는 상태 stable key, 오류 범주, redact한 메시지와 stack의 첫 application `file:line`을 기록한다\. stack이 없으면 없다고 적는다\./);
});

test('V4 no Claude step gives screenshot or error judgement to haiku', () => {
  const files = readdirSync(join(repo, 'assets', 'steps')).filter(name => /^step\d{3}\.md$/.test(name));
  assert.equal(files.length, 50);
  const hits = files.flatMap(name => haikuJudgementLines(text(`assets/steps/${name}`)).map(line => `${name}: ${line.trim()}`));
  assert.deepEqual(hits, []);
  for (const n of [46, 47, 48]) {
    const content = step(n);
    assert.doesNotMatch(content, /^서브에이전트는 항상 haiku를 사용한다\.$/m, `step0${n}`);
    assert.match(content, /^서브에이전트는 haiku로 [^\n]*메인 세션[^\n]*sonnet 이상[^\n]*\(헌법 §7\)[^\n]*판정을 적지 않는다\.$/m, `step0${n}`);
  }
  const verifierLines = step(50).split('\n').filter(line => /^- \*\*에이전트 B /.test(line));
  assert.equal(verifierLines.length, 2, 'step050 keeps its two agent B role lines');
  for (const line of verifierLines) {
    assert.match(line, /메인 세션 또는 sonnet 이상/, line);
  }
});

test('V4m the haiku check catches the restored 2.10.0 lines', () => {
  for (const line of ['- **에이전트 B (검증 전문)**: Haiku - 에러 수집, 분류, 판정만 담당. **수정 금지**', '- **에이전트 B (검증)**: haiku 사용 - 에러 수집/판정 담당']) {
    assert.deepEqual(haikuJudgementLines(`x\n${line}\ny`), [line]);
  }
});

test('V5 the constitution routes screenshot judgement off haiku and the executor hands it back', () => {
  const rules = text('skills/harness-rules/SKILL.md');
  const s7 = /^## 7\. 모델·캐시 보존\n([\s\S]*?)(?=^## )/m.exec(rules);
  assert.ok(s7, 'harness-rules has no section 7');
  assert.match(s7[1], /^  - 스크린샷·이미지를 읽고 판단하는 일[^\n]*\*\*메인 세션 또는 sonnet 이상\*\*[^\n]*haiku는 촬영·브라우저 조작·증거 수집만[^\n]*"서브에이전트는 항상 haiku"라고 해도 판정은 이 행을 따른다/m);
  const executor = text('agents/step-executor.md');
  assert.match(executor, /^model: haiku$/m, 'the worker model stays haiku (decision: keep cost, move the judgement)');
  const section = /^## 시각 판정 금지\n([\s\S]*?)(?=^## )/m.exec(executor);
  assert.ok(section, 'step-executor has no visual judgement section');
  assert.match(section[1], /통째로 맡기지 않는다/);
  assert.match(section[1], /판정, QA `record`, Jev 체크포인트 호출, 완료 보고는 하지 않는다/);
  // The hand-back reuses the existing incomplete line, so no hook or writer parses a new format.
  assert.match(section[1], /^Step NNN\/<total> 미완료 \| QA: unavailable \| 다음 검사: 시각 판정 필요 — step_archive\/outputs\/stepNNN_capture\.md$/m);
  assert.match(executor, /^Step NNN\/<total> 미완료 \| QA: <report_sha256 또는 unavailable> \| 다음 검사: /m);
  assert.match(text('commands/webapp.md'), /호출 책임자를 그 단계를 실행하는 주체 하나로 정하고\(보통 step-executor, 시각 판정을 돌려받은 단계는 판정하는 호출자\)/);
});

test('V6 the QA report guide defines observation and next_check for a finding', () => {
  const guide = text('docs/QA-REPORTS.md').replace(/\s+/g, ' ');
  assert.match(guide, /write the `observation` as the location, the violated criterion and the expected versus observed value/);
  assert.match(guide, /Write `next_check` as the exact way to reproduce it: the route without sensitive query values, the viewport and the ordered actions/);
  assert.match(guide, /An aesthetic opinion that cites no criterion is advisory/);
});

// B1 + B2 join (PR-B WP2): at step 43 an excluded reference element is neither a required finding
// nor advisory, and constitution section 11 names the step 30 design contract as the token and
// exclusion source, with the section 5 values as the fallback for runs without a contract.
function assertExclusionJoin(step43, rules, label) {
  const precedence = /^## 설계 제외 계약 우선\n([\s\S]*?)(?=^## )/m.exec(step43);
  assert.ok(precedence, `${label}: step043 has no design exclusion precedence section`);
  assert.match(precedence[1], /검증자는 그 차이를 필수 finding이나 advisory로 넣지 않고 `제외 계약: <id>`로 따로 적는다\./, label);
  assert.match(step43, /^   참고 이미지에는 있지만 설계가 채택하지 않은 요소는 advisory다\. 1번에서 `제외 계약: <id>`로 적은 요소는 advisory로도 적지 않는다\.$/m, label);
  const s11 = /^## 11\. 검증 판정과 finding 형식\n([\s\S]*?)(?=^## |^---$)/m.exec(rules);
  assert.ok(s11, `${label}: harness-rules has no section 11`);
  assert.match(s11[1], /선택된 디자인 토큰과 제외 목록은 위 표의 프로필별 설계 계약\(`harness50-design-contract`\)이고/, label);
  assert.match(s11[1], /계약 `exclude`에서 `adopted: false`인 항목의 위반은 최소 `Important`다\./, label);
  assert.match(s11[1], /계약이 없는 이전 legacy50 실행은 §5의 수치를 기준으로 쓴다\./, label);
  assert.match(s11[1], /새36의 필수 계약 누락은 INCOMPLETE다\./, label);
}

test('V7 step 43 keeps design exclusions out of findings and section 11 names the design contract', () => {
  const s43 = step(43);
  const rules = text('skills/harness-rules/SKILL.md');
  assertExclusionJoin(s43, rules, 'current');
  const mutations = {
    precedenceFail: [s43.replace('필수 finding이나 advisory로 넣지 않고', 'FAIL 항목에 넣지 않고'), rules],
    advisoryExclusion: [s43.replace(' 1번에서 `제외 계약: <id>`로 적은 요소는 advisory로도 적지 않는다.', ''), rules],
    noContract: [s43, rules.replace('위 표의 프로필별 설계 계약(`harness50-design-contract`)이고', '헌법 §5 값이고')],
    unadoptedAdvisory: [s43, rules.replace('위반은 최소 `Important`다.', '위반은 `advisory`다.')],
    noFallback: [s43, rules.replace(' 계약이 없는 이전 legacy50 실행은 §5의 수치를 기준으로 쓴다.', '')],
    newContractOptional: [s43, rules.replace('새36의 필수 계약 누락은 INCOMPLETE다.', '새36의 필수 계약 누락은 PASS다.')]
  };
  for (const [name, [mutatedStep, mutatedRules]] of Object.entries(mutations)) {
    assert.ok(mutatedStep !== s43 || mutatedRules !== rules, name);
    assert.throws(() => assertExclusionJoin(mutatedStep, mutatedRules, name), undefined, name);
  }
});
