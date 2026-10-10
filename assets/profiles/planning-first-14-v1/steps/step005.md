---
name: step005
persistence: session
---

# Step 5 - 레이아웃 스크린샷 검증 (독립 검증 루프)

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-005.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step005_*.md` 저장 후 1줄 완료 보고 `Step 005/14 완료`.
>
> **모델 정책**: 구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step009 전)

Step 3에서 구현된 레이아웃이 설계대로 구현되었는지 **작성자와 검증자를 분리하여** 검증한다.

## QA 완료 증거 (필수)

신뢰한 설치 플러그인의 `docs/QA-REPORTS.md`와 `scripts/qa-report.mjs`를 사용한다.
각 시도 시작에 `inspect --workspace "<project-root>" --step 5`으로 이전 실패를 확인한다.
수정과 필요한 build를 마친 뒤 검증 전에 `snapshot`을 만든다. 실제 소스·설정·검증 대상
산출물과 본문의 모든 필수 검사(화면·viewport·상태 조합 포함)를 명시한다.
검증자의 실제 관찰과 스크린샷·실행 결과를 `record`로 기록한 뒤 다시 `inspect`한다.
`status=current`와 `verdict=PASS`를 모두 확인해야 완료 보고 및 다음 Step 진입이 가능하다.
필수 실패·증거 누락·미실행·stale은 INCOMPLETE다. 수정 뒤에는 새 snapshot과 재검증이 필요하다.
검증 전 snapshot을 검증 후 새로 만들어 과거 결과를 현재 PASS로 바꾸지 않는다.

## 핵심 원칙: 작성 에이전트 ≠ 검증 에이전트

같은 에이전트가 작성하고 스스로 통과 판정하는 것을 **금지**한다. 반드시 독립된 두 에이전트를 사용한다.

**필요한 파일:**

- step002_레이아웃설계_chunk*.md (레이아웃 설계)
- step002_전체설계_chunk*.md (전체 설계)

**이 단계에서 절대로 superpowers:brainstorming을 사용하지 않는다.**

**스크린샷 없이 통과 처리 금지. 반드시 Claude가 직접 스크린샷을 눈으로 확인한다.**

## 실행 순서

### 1단계: 구현 스크린샷 촬영

브라우저 자동화 도구(docs/BROWSER-TOOLS.md 절차표)로 현재 구현의 스크린샷을 뷰포트별로 촬영한다:
- 데스크톱 (1920×1080): `step_archive/screenshots/layout-verify-desktop-r1.png` (Aside 백엔드는 탭 고정 1440×900 — 실제 캡처 크기를 기록)
- 태블릿 (768×1024): `step_archive/screenshots/layout-verify-tablet-r1.png`
- 모바일 (390×844): `step_archive/screenshots/layout-verify-mobile-r1.png`

### 2단계: 검증 에이전트 (에이전트 B) 실행

**에이전트 B의 역할: 비교 검증만 수행. 코드 수정 금지.**

에이전트 B에게 전달할 프롬프트 (N = 현재 라운드 번호):

```
너는 레이아웃 검증자다. 코드를 수정하지 않는다. 비교 판정만 한다.

1. 설계 문서를 모두 Read한다:
   - `step_archive/step002_전체설계_chunk*.md` (Glob 검색)

2. 구현 스크린샷을 모두 Read한다:
   - `step_archive/screenshots/layout-verify-desktop-rN.png`
   - `step_archive/screenshots/layout-verify-tablet-rN.png`
   - `step_archive/screenshots/layout-verify-mobile-rN.png`

3. 이전 라운드 검증 결과가 있으면 모두 Read한다:
   - `step_archive/outputs/step005_검증_r*.md` (Glob 검색)
   - 이전 라운드에서 FAIL로 지적한 항목이 수정되었는지 반드시 확인한다

4. 설계 명세와 헌법 §5 토큰을 항목별로 대조한다. 인상 질문 대신 viewport마다 아래 질문에 답한다:
   - 배치: 설계가 정한 영역 분할·순서·비율이 그대로인가
   - 간격: 요소 사이 간격이 설계 값 또는 허용 배수(4·8·16·24·32px) 안에 있고, 같은 역할 요소끼리 같은가
   - 타이포그래피: 제목·본문·부가 텍스트의 크기·굵기 계층이 설계 값과 같은가
   - 색·대비: 선택 팔레트 밖 색이 없고 본문 대비가 WCAG AA(4.5:1) 이상인가
   - 반응형: 겹침·잘림·가로 스크롤·44×44 미만 터치 타깃이 없는가
   - 상태: 포커스 표시·hover·빈 상태가 설계대로 보이는가
   관찰한 것은 모두 적는다. 이전 라운드 finding은 [수정됨] 또는 [미수정]으로 표시한다.

5. 아래 판정 규칙으로 관찰을 분류한다.
   판정 규칙:
   - 필수 finding(`Critical`/`Important`): 설계 명세·선택 토큰·필수 acceptance를 어긴 것, 또는 기능·접근성 결함(겹침·잘림·가림·조작 불가 포함)
   - `advisory`: 어긴 기준을 인용할 수 없는 미관·선호 의견. advisory만 남으면 PASS이며 수정 대상이 아니다
   - 필수 finding마다 네 필드를 모두 쓴다:
     - 위치: 소스 `file:line`, 또는 route·viewport·selector·스크린샷 파일과 영역
     - 기준: 어긴 명세·토큰·acceptance의 출처(파일과 절 또는 줄)
     - 기대/관찰: 기대값과 관찰값(예: gap 24px 기대, 40px 관찰)
     - 재현: 같은 화면을 다시 보는 route·viewport·선행 조작

6. 결과를 `step_archive/outputs/step005_검증_rN.md`에 저장한다.
   - 미해결 필수 finding이 없으면: "PASS"로 시작하고 advisory는 따로 적는다
   - 하나라도 있으면: "FAIL"로 시작하고 필수 finding을 위 네 필드로 나열한다
```

에이전트 B는 sonnet을 사용한다 (스크린샷 분석 필요).

### 3단계: 판정 확인

`step005_검증_rN.md`를 Read한다.

- **PASS로 시작하면** → QA 보고서 기록·현재 PASS 확인 후 다음 Step으로 이동
- **FAIL로 시작하면** → 4단계로 진행

### 4단계: 수정 에이전트 (에이전트 A) 실행

**에이전트 A의 역할: 검증 피드백을 반영하여 코드 수정만 수행. 통과 판정 금지.**

에이전트 A에게 전달할 프롬프트 (N = 현재 라운드 번호):

```
너는 레이아웃 수정자다. 통과 여부를 판정하지 않는다. 피드백을 반영만 한다.

1. 최신 검증 피드백을 Read한다:
   - `step_archive/outputs/step005_검증_rN.md`

2. 이전 라운드 수정 내역이 있으면 Read한다:
   - `step_archive/outputs/step005_수정_r*.md` (Glob 검색)
   - 이전에 수정했는데 [미수정]으로 판정된 항목은 다른 방식으로 재수정한다

3. 설계 문서를 Read한다:
   - `step_archive/step002_전체설계_chunk*.md` (Glob 검색)

4. 피드백에 나열된 부족한 부분을 `src/css/*.css`, `src/index.html`, `src/js/*.js`에 반영한다.

5. 수정 내역을 `step_archive/outputs/step005_수정_rN.md`에 기록한다.
```

에이전트 A는 sonnet을 사용한다 (스크린샷 문맥 필요).

### 5단계: 재촬영 → 2단계로 돌아가기

수정 후 브라우저 자동화 도구로 스크린샷을 재촬영하고 (N = 다음 라운드), 2단계(에이전트 B 검증)부터 반복한다.

### 반복 제한: 최대 5라운드

최대 5라운드까지 수정·재검증한다. 같은 필수 항목이 3연속 미수정이면 조기 종료한다.
모든 필수 항목의 현재 증거가 PASS일 때만 완료한다. 실패·누락·미검증 또는 한도 소진이면
미해결 항목과 다음 검사를 기록하고 현재 Step을 INCOMPLETE로 인계한다.
필수 실패를 스킵하거나 완료 보고 후 다음 Step으로 진행하지 않는다.
한도 소진이나 같은 필수 항목의 연속 미수정으로 끝나면 `required-input-missing`, 필수 실행·시각 검사 기능이 없으면 `required-tool-failed`로 헌법 §2-1 명명된 멈춤을 기록하고 턴을 끝낸다.

## 실패 패턴 기록

종료 시(PASS 또는 INCOMPLETE) 도중 FAIL 항목과 해결 여부를 이 Step 검증 보고서의 `## 실패 패턴` 절에 적는다. PASS로 끝나도 도중 FAIL은 남긴다. `step_archive/progress.json`은 수정하지 않는다(완료는 Stop 훅, 멈춤은 `harness-pause.mjs`만 기록한다).

## 주의사항

- 에이전트 A가 스스로 "통과"라고 판단하는 것을 금지한다
- 에이전트 B가 코드를 수정하는 것을 금지한다
- 두 에이전트 모두 sonnet을 사용한다
- 에이전트 B의 현재 PASS만 완료 조건이다. 실패·한도 소진은 미완료 종료 조건이다

---

필수 요구와 현재 검증 증거가 모두 PASS일 때만 이 지침을 완료하고 자동으로 step006.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.



## 정의별 입력·산출물 계약

- 입력: `step_archive/step002_레이아웃설계_chunk1.md`
- 입력: `step_archive/step002_전체설계_chunk1.md`
- 입력: `step_archive/step003_구현manifest.md`
- 입력: `step_archive/step004_smoke_test.md`
- 입력: `step_archive/outputs/trust5_r1.md`
- 입력: `dist/index.html`
- 산출물: `step_archive/screenshots/layout-verify-desktop-r1.png`
- 산출물: `step_archive/screenshots/layout-verify-tablet-r1.png`
- 산출물: `step_archive/screenshots/layout-verify-mobile-r1.png`
- 산출물: `step_archive/outputs/step005_검증_r1.md`

필수 수락 항목: `layout-desktop-screenshot`, `layout-tablet-screenshot`, `layout-mobile-screenshot`, `layout-verification-report`, `exact-layout-viewports`, `design-responsive-accessibility`, `independent-layout-verifier`, `visual-inspection-required`, `bounded-pass-loop`
