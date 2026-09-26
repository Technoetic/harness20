---
name: step043
persistence: session
---

# Step 43 - Awwwards 디자인 검증 및 CSS 보강 (독립 검증 루프)

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-043.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step043_*.md` 저장 후 1줄 완료 보고 `Step 043/50 완료`.
>
> **모델 정책**: 조사·구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step045 전)

Step 37에서 구현된 CSS가 Awwwards 조사 결과를 충실히 반영했는지 **작성자와 검증자를 분리하여** 검증하고 보강한다.

## 최종 조사 기준

`step_archive/outputs/step024_검증_r1.md`의 최종 PASS manifest와 통합 분석을 먼저 읽는다.
비교 기준은 기존 참고 이미지와 최종 manifest에서 채택한 보충 이미지·조사 축을 모두 포함한다.
검증자는 보충 원문·스크린샷도 직접 열어 확인한다. 기존 glob에 없는 보충 이미지를 누락하거나
보충 전에 부족하다고 판정된 Step 23 결론만으로 비교 기준을 되돌리지 않는다.

## 설계 제외 계약 우선

비교 기준에는 `step_archive/step030_레이아웃설계_chunk1.md`의 `harness50-design-contract` 블록(플러그인 `docs/DESIGN-CONTRACT.md`)도 들어간다. `exclude`에서 `adopted: false`인 항목에 해당하는 Awwwards 요소는 구현에 없어도 부족한 부분이 아니다 (목록 우선). 검증자는 그 차이를 필수 finding이나 advisory로 넣지 않고 `제외 계약: <id>`로 따로 적는다. 수정자는 피드백에 있더라도 그 스타일을 들여오지 않는다.

## QA 완료 증거 (필수)

신뢰한 설치 플러그인의 `docs/QA-REPORTS.md`와 `scripts/qa-report.mjs`를 사용한다.
각 시도 시작에 `inspect --workspace "<project-root>" --step 43`으로 이전 실패를 확인한다.
수정과 필요한 build를 마친 뒤 검증 전에 `snapshot`을 만든다. 실제 소스·설정·검증 대상
산출물과 본문의 모든 필수 검사(화면·viewport·상태 조합 포함)를 명시한다.
검증자의 실제 관찰과 스크린샷·실행 결과를 `record`로 기록한 뒤 다시 `inspect`한다.
`status=current`와 `verdict=PASS`를 모두 확인해야 완료 보고 및 다음 Step 진입이 가능하다.
필수 실패·증거 누락·미실행·stale은 INCOMPLETE다. 수정 뒤에는 새 snapshot과 재검증이 필요하다.
검증 전 snapshot을 검증 후 새로 만들어 과거 결과를 현재 PASS로 바꾸지 않는다.

## 핵심 원칙: 작성 에이전트 ≠ 검증 에이전트

같은 에이전트가 작성하고 스스로 통과 판정하는 것을 **금지**한다. 반드시 독립된 두 에이전트를 사용한다.

## 실행 순서

### 1단계: 구현 스크린샷 촬영

브라우저 자동화 도구(docs/BROWSER-TOOLS.md 절차표)로 현재 구현의 스크린샷을 촬영하여 `step_archive/screenshots/compare-awwwards-applied-r1.png`에 저장한다 (Aside 백엔드는 탭 고정 1440×900 — 실제 캡처 크기를 기록).

### 2단계: 검증 에이전트 (에이전트 B) 실행

**에이전트 B의 역할: 비교 검증만 수행. CSS 수정 금지.**

에이전트 B에게 전달할 프롬프트 (N = 현재 라운드 번호 1–5):

```
너는 디자인 검증자다. CSS를 수정하지 않는다. 비교 판정만 한다.

1. `step_archive/outputs/step024_검증_r1.md`의 최종 PASS manifest와 통합 분석·조사 축을 먼저 Read한다.
   - 채택한 모든 기존·보충 원문과 이미지의 정확한 경로를 해석하고 SHA-256을 대조한다.
   - 원문을 읽고 이미지는 직접 열어 확인한다. 기존 glob만으로 입력을 제한하지 않는다.
   - 최종 PASS 누락, 입력 누락·hash 불일치 또는 필수 이미지 미검사는 INCOMPLETE다.
   - `step_archive/step030_레이아웃설계_chunk1.md`의 `harness50-design-contract` 블록도 Read한다. `exclude`에서 `adopted: false`인 항목에 해당하는 원본 요소는 부족한 부분으로 적지 않고 `제외 계약: <id>`로 따로 적는다 (목록 우선).

2. 구현 스크린샷을 Read한다:
   - `step_archive/screenshots/compare-awwwards-applied-rN.png`

3. 이전 라운드 검증 결과가 있으면 모두 Read한다:
   - `step_archive/outputs/step043_검증_r*.md` (Glob 검색)
   - 이전 라운드에서 FAIL로 지적한 항목이 수정되었는지 반드시 확인한다

4. 원본과 구현을 비교한다. 비교 기준은 step030 설계가 최종 manifest에서 채택한 조사 패턴이다.
   설계가 채택했는데 구현에 빠졌거나 다르게 구현된 요소는 필수 finding이다.
   참고 이미지에는 있지만 설계가 채택하지 않은 요소는 advisory다. 1번에서 `제외 계약: <id>`로 적은 요소는 advisory로도 적지 않는다.
   기준 필드에는 채택 근거인 Awwwards 스크린샷 경로·영역과 step030 설계의 절을 함께 쓴다.
   이전 라운드에서 지적한 항목은: [수정됨] 또는 [미수정]으로 표시한다.
   판정 규칙:
   - 필수 finding(`Critical`/`Important`): 설계 명세·선택 토큰·필수 acceptance를 어긴 것, 또는 기능·접근성 결함(겹침·잘림·가림·조작 불가 포함)
   - `advisory`: 어긴 기준을 인용할 수 없는 미관·선호 의견. advisory만 남으면 PASS이며 수정 대상이 아니다
   - 필수 finding마다 네 필드를 모두 쓴다:
     - 위치: 소스 `file:line`, 또는 route·viewport·selector·스크린샷 파일과 영역
     - 기준: 어긴 명세·토큰·acceptance의 출처(파일과 절 또는 줄)
     - 기대/관찰: 기대값과 관찰값(예: gap 24px 기대, 40px 관찰)
     - 재현: 같은 화면을 다시 보는 route·viewport·선행 조작

5. 결과를 `step_archive/outputs/step043_검증_rN.md`에 저장한다.
   - 실제 검사한 기존·보충 입력의 경로·SHA-256과 통합 조사 축별 관찰을 기록한다.
   - 미해결 필수 finding이 없으면: "PASS"로 시작하고 advisory는 따로 적는다
   - 하나라도 있으면: "FAIL"로 시작하고 필수 finding을 위 네 필드로 나열한다
```

에이전트 B는 sonnet을 사용한다 (스크린샷 분석 필요).

### 3단계: 판정 확인

`step043_검증_rN.md`를 Read한다.

- **PASS로 시작하면** → QA 보고서 기록·현재 PASS 확인 후 다음 Step으로 이동
- **FAIL로 시작하면** → 4단계로 진행

### 4단계: 수정 에이전트 (에이전트 A) 실행

**에이전트 A의 역할: 검증 피드백을 반영하여 CSS 수정만 수행. 통과 판정 금지.**

에이전트 A에게 전달할 프롬프트 (N = 현재 라운드 번호):

```
너는 CSS 수정자다. 통과 여부를 판정하지 않는다. 피드백을 반영만 한다.

1. 최신 검증 피드백을 Read한다:
   - `step_archive/outputs/step043_검증_rN.md`

2. 이전 라운드 수정 내역이 있으면 Read한다:
   - `step_archive/outputs/step043_수정_r*.md` (Glob 검색)
   - 이전에 수정했는데 [미수정]으로 판정된 항목은 다른 방식으로 재수정한다

3. `step_archive/outputs/step024_검증_r1.md`의 최종 PASS manifest와 통합 분석·조사 축을 먼저 Read한다.
   - 채택한 모든 기존·보충 원문과 이미지의 정확한 경로를 해석하고 SHA-256을 대조한다.
   - 원문을 읽고 이미지는 직접 열어 확인한다. 기존 glob만으로 입력을 제한하지 않는다.
   - 최종 PASS 누락, 입력 누락·hash 불일치 또는 필수 이미지 미검사는 INCOMPLETE다.
   - 같은 계약 블록을 Read한다. `exclude`에서 `adopted: false`인 항목의 스타일은 피드백에 있어도 들여오지 않는다.

4. 피드백에 나열된 부족한 부분을 `src/css/*.css`, `src/js/Visualizer.js`에 반영한다.

5. 수정 내역을 `step_archive/outputs/step043_수정_rN.md`에 기록한다.
   실제 읽은 기존·보충 입력의 경로·SHA-256과 수정에 반영한 통합 조사 축도 기록한다.
```

에이전트 A는 sonnet을 사용한다 (스크린샷 분석 필요).

### 5단계: 재촬영 → 2단계로 돌아가기

수정 후 브라우저 자동화 도구로 스크린샷을 `step_archive/screenshots/compare-awwwards-applied-rN.png` (N = 다음 라운드 번호)로 재촬영하고, 2단계(에이전트 B 검증)부터 반복한다.

### 반복 제한: 최대 5라운드

최대 5라운드까지 수정·재검증한다. 같은 필수 항목이 3연속 미수정이면 조기 종료한다.
모든 필수 항목의 현재 증거가 PASS일 때만 완료한다. 실패·누락·미검증 또는 한도 소진이면
미해결 항목과 다음 검사를 기록하고 현재 Step을 INCOMPLETE로 인계한다.
필수 실패를 스킵하거나 완료 보고 후 다음 Step으로 진행하지 않는다.

## 실패 패턴 기록

종료 시(PASS 또는 INCOMPLETE) 도중 FAIL 항목과 해결 여부를 이 Step 검증 보고서의 `## 실패 패턴` 절에 적는다. PASS로 끝나도 도중 FAIL은 남긴다. `step_archive/progress.json`은 수정하지 않는다(완료는 Stop 훅, 멈춤은 `harness-pause.mjs`만 기록한다).

## 파일 구조 규칙

- CSS는 `src/css/*.css` 로 분리 유지
- `src/index.html`에서 `<link rel="stylesheet" href="css/...">` 로 참조
- **`<style>` 태그 인라인 삽입 금지** — 빌드 단계에서 번들러가 자동 처리

## 주의사항

- 에이전트 A가 스스로 "통과"라고 판단하는 것을 금지한다
- 에이전트 B가 CSS를 수정하는 것을 금지한다
- 두 에이전트 모두 sonnet을 사용한다
- 에이전트 B의 현재 PASS만 완료 조건이다. 실패·한도 소진은 미완료 종료 조건이다

**이 단계에서 절대로 superpowers:brainstorming을 사용하지 않는다.**

---

필수 요구와 현재 검증 증거가 모두 PASS일 때만 이 지침을 완료하고 자동으로 step044.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.

