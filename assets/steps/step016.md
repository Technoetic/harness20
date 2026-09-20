---
name: step016
persistence: session
---

# Step 16 - 전체 조사

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-016.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step016_*.md` 저장 후 1줄 완료 보고 `Step 016/50 완료`.
>
> **모델 정책**: 조사·구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step045 전)

**참조 파일:**

- `step_archive/TOPIC/TOPIC.md` (튜토리얼 주제 — **필수, 가장 먼저 Read**)
- step002_context전략_chunk*.md

## 주제 픽업 (필수)

조사 시작 전 반드시 `step_archive/TOPIC/TOPIC.md`를 Read하여 `topic`, `audience`, `real_world_apps`, `constraints`를 파악한다.

- 조사 키워드는 `topic`을 중심으로 도출한다 (예: topic="데이터 압축과 부호화" → "허프만 코딩 시각화", "LZ77 인터랙티브 데모", "Base64 튜토리얼 사이트", "압축 알고리즘 학습용 웹앱").
- `real_world_apps`에 적힌 사례(예: ZIP/JPEG/QR)는 조사 대상에 반드시 포함한다.
- `audience`가 "초보자"이면 조사 대상도 초보자용 학습 자료·시각화 도구를 우선한다.

## Step-Back

실행 전에 먼저 답하라:
- 이 조사의 핵심 목적이 무엇인가? (한 문장)
- 이 조사 결과가 이후 어느 Step에 영향을 주는가?
- 조사에서 반드시 확인해야 할 핵심 항목 3가지는?

합리적인 선에서 최대한 많은 서브에이전트를 병렬로 사용해 (동시 실행 최대 10개) 오직 조사만을 수행한다.

## 🚨 절대 규칙: 웹 데이터 수집

**다음 도구 사용 절대 금지:**

- ❌ WebFetch 도구 (자동 차단 불가 - 수동 준수 필수)
- ❌ WebSearch 도구 (자동 차단 불가 - 수동 준수 필수)
- ❌ 사전 지식만으로 문서 작성

**반드시 브라우저 자동화 도구(docs/BROWSER-TOOLS.md: Aside CLI 또는 Playwright)로만 웹 데이터 수집:**

### 실행 방법

**1단계: 각 URL마다 브라우저 자동화 수집 절차 실행**

각 서브에이전트에게 다음 템플릿으로 조사 지시 (절차 이름: `browser-research-[N]`, 백엔드별 구체 API는 docs/BROWSER-TOOLS.md 절차표):

1. 절차표 'Open the page' 행으로 `${TARGET_URL}` 방문
2. 절차표 'Screenshot' 행으로 전체 페이지(fullPage) 캡처 → `step_archive/screenshots/research-${N}.png`
   (Aside CLI는 실패 시 재시도(타임아웃 4000/8000/8000 ms) 뒤 세션 `./artifacts/`에 저장되므로 `step_archive/screenshots/`로 복사한다)
3. 절차표 'Extract text / DOM metrics' 행으로 `document.body.innerText` 추출 → `step_archive/research-raw-${N}.txt` (UTF-8)
4. 절차표 'Clean up' 행으로 탭/컨텍스트 닫기

**2단계: Bash 도구로 수집 절차 실행 (선택 백엔드의 실행법은 docs/BROWSER-TOOLS.md)**

```bash
# Playwright 백엔드
node browser-research-1.js
node browser-research-2.js
...
# Aside CLI 백엔드 (호출당 120초, 호출마다 새 세션, 스크립트는 인자 1개·28,000자 미만·import/require 불가)
aside repl "<browser-research-1 스크립트 본문>"
aside repl "<browser-research-2 스크립트 본문>"
...
```

**3단계: 수집된 데이터 분석 및 문서화**

`step_archive/research-raw-*.txt` 파일들을 읽고 step016_조사결과_chunk*.md로 정리

---

## tokei 코드 규모 베이스라인

조사 시작 전 `tokei src/ --output json > step_archive/tokei-baseline.json` 실행하여 현재 프로젝트의 코드/주석/공백 라인 수를 기록한다. 이 베이스라인을 이후 리팩토링/최적화/Dead Code 단계에서 비교 기준으로 사용한다.

## ⚠️ 검증 체크리스트

**스크린샷과 원본 데이터가 없으면 조사 무효!**

### 🔧 자동 검증 스크립트

**Step 16 완료 후 실행:**

```powershell
## 전체 청크 일괄 검증 (구 step03-validator.ps1은 존재하지 않음 — 2026-06-10 M07 정정)
.\.claude\hooks\research-validator.ps1
```

**각 조사결과 청크 검증:**

```powershell
## 단일 파일 검증
.\.claude\hooks\research-chunk-validator.ps1 -FilePath "step016_조사결과_chunk1.md"

## 모든 청크 일괄 검증
Get-ChildItem "step016_조사결과_chunk*.md" | ForEach-Object {
    .\.claude\hooks\research-chunk-validator.ps1 -FilePath $_.FullName
}
```

## ❌ 금지 사항

- **사전 지식만으로 문서 작성 절대 금지**

  - "내가 알기로는...", "일반적으로...", "보통..." 같은 표현 사용 시 즉시 중단
  - 모든 정보는 **반드시 브라우저 자동화 도구로 수집한 실제 웹 데이터**에서 가져와야 함
  - 스크린샷과 원본 텍스트 파일이 없으면 해당 내용 작성 불가
- **이 단계에서 절대로 GitHub를 조사하지 않는다.**
- **이 단계에서 절대로 "planning.md"를 생성하지 않는다. 오직 조사만 한다.**
- **이 단계에서 절대로 "design.md"를 생성하지 않는다. 오직 조사만 한다.**
- **이 단계에서 절대로 superpowers:brainstorming을 사용하지 않는다.**

## ✅ 올바른 작업 흐름 예시

**잘못된 방식 (금지):**

```
서브에이전트: "이 기술은 XXX입니다. YYY 방식을 사용하며..."
→ ❌ 사전 지식 사용, 검증 불가
```

**올바른 방식 (필수):**

```
1. Bash: 브라우저 자동화 수집 절차 실행 (browser-research-topic1, docs/BROWSER-TOOLS.md)
2. Read: step_archive/research-raw-topic1.txt
3. 서브에이전트: "browser-research-topic1 실행 결과:
   - 스크린샷: step_archive/screenshots/topic1.png
   - 원본 데이터: step_archive/research-raw-topic1.txt
   - 출처: https://example.com/topic1
   - 수집 시각: 2026-02-15 04:50:23

   수집된 내용:
   'This technology is...'"
→ ✅ 브라우저 자동화 도구로 수집, 검증 가능
```

**조사결과는 청크 단위로 저장한다:**

```
step016_조사결과_chunk1.md (500줄 이하)
step016_조사결과_chunk2.md (500줄 이하)
step016_조사결과_chunk3.md (500줄 이하)
...
```

**작성 규칙**:

- 각 청크는 500줄 이하로 작성 (성능 최적화)
- 저장 시 PostToolUse 훅(research-chunk-validator.ps1)이 각 청크 자동 검증 (BOM/CRLF/줄수/파일크기)
- 청크 그대로 유지 (병합 안 함)

서브에이전트는 항상 haiku를 사용한다.


## CoVe (Chain-of-Verification)

조사 완료 후 체크리스트:
- [ ] Step-Back에서 정의한 핵심 항목 3가지가 모두 조사되었는가?
- [ ] 조사 결과가 청크 파일에 빠짐없이 저장되었는가?
- [ ] 이후 Step에서 참조할 수 있는 형식으로 정리되었는가?

미완료 항목이 있으면 해당 항목만 재조사한다.

## Jev 의미 체크포인트

조사 청크의 사실 주장과 대응 원문이 준비되면 해당 주장 하나를 원문이 뒷받침하는지 묻는다. 원문과 주장 발췌문을 함께 선택한다. URL·수집 경로·hash 대조는 기존 절차로 수행한다.

현재 작업에서 Jev 사용과 선택한 발췌문의 외부 전송이 승인된 경우 호스트가 자동 호출한다.
기존 승인이 해당 범위를 포함하면 재확인하지 않는다. 단계 도달이나 `TYPESAFE_API_KEY` 존재는 승인이 아니다.
승인이 없거나 서비스가 불가하면 이유를 기존 단계 보고서에 기록하고 독립 검증을 계속한다.

신뢰한 플러그인의 `node "<plugin-root>/scripts/jev-judge.mjs" prepare --workspace ROOT --input -`로 준비한다.
재사용 전 `inspect --workspace ROOT --report PATH`의 상태와 현재 prepare의 `request_hash`, `policy_hash`, `input_hash`, `sources`를 모두 대조한다.
새 호출은 동일 JSON으로 `run --workspace ROOT --input - --allow-network`를 실행한다.
변하지 않은 입력에는 한 배치만 호출하는 호스트 정책을 적용하며 전역 하드 쿼터로 해석하지 않는다.
`unverified`·`stale`는 판정 근거로 쓰지 않고 abstain·낮은 confidence는 호스트가 원본을 검토한다.
승인된 선택 API 예외는 일반 웹 탐색이나 새 자료 수집을 허용하지 않는다.

입력 파일·발췌문 범위, 동의·중복 방지·보고서 검사는 `docs/jev-checkpoints.md`를 따른다.
기존 독립 검증·Acceptance·실제 검사와 완료 writer는 유지한다. Jev 결과나 `current`는 PASS 또는 완료 권한이 아니다.

## 오류 발생 시

오류 발생 시 원인을 분석하고 수정한 뒤 재시도한다. 3회 재시도 후에도 실패하면 오류를 기록하고 다음 Step으로 진행한다.


---

이 지침을 완료한 즉시 자동으로 step017.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.


