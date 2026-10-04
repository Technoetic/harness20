---
name: step019
persistence: session
---

# Step 19 - 디자인 시각 검증 (독립 검증 루프)


<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-019.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/outputs/step019_검증_rN.md` 저장. 최종 `PASS`일 때만 1줄 완료 보고 `Step 019/20 완료`. 필수 항목이 남으면 `INCOMPLETE`를 결과 파일에 기록하고 헌법 §2-1 명명된 멈춤으로 끝낸다(아래 중단 조건).
>
> **모델 정책**: 구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: E2E 검증 구간 (최종 게이트 step020)

프로젝트 유형, UI 특성, 대상 디바이스를 분석하여 검증 범위와 뷰포트를 동적으로 결정한다.

브라우저 자동화 도구(docs/BROWSER-TOOLS.md 절차표)로 주요 페이지/뷰를 스크린샷 촬영하고, Claude가 직접 Read하여 디자인 어색함을 점검한다.
문제 발견 시 아래의 최대 5라운드 안에서 코드를 수정하고 재검증한다. 모든 필수 항목이 통과해야 완료한다.
"웹 앱"이 아니면 프로젝트 유형에 적합한 시각 검증 방법을 선택한다.

**이 단계에서 절대로 superpowers:brainstorming을 사용하지 않는다.**

**스크린샷 없이 통과 처리 금지. 반드시 Claude가 직접 스크린샷을 눈으로 확인한다.**

## 판정 기준

검증 전에 Step/SPEC의 필수 acceptance, 선택된 디자인 토큰과 제외 목록(`step_archive/step002_레이아웃설계_chunk1.md`의 `harness50-design-contract`, 플러그인 `docs/DESIGN-CONTRACT.md`), 명시된 요구사항·설계 계약를 확인한다.
각 finding은 해당 기준과 관찰한 스크린샷 영역 또는 실제 검사 결과에 연결한다.

- **필수 finding (`Critical` / `Important`)**: 기능·접근성·보안 결함, 필수 acceptance/디자인 토큰 위반, 또는 설계 계약 `exclude`에서 `adopted: false`인 항목에 해당하는 스타일(최소 `Important`). 필수 검사 실패는 중요도와 관계없이 완료를 차단한다.
- **참고 의견 (`advisory`)**: 필수 기준 위반의 근거가 없는 미관·선호 제안. 필수 항목을 통과했다면 이 의견만으로 `FAIL`을 만들거나 수정을 반복하지 않는다.
- 참고 점수나 선호 의견으로 필수 finding을 강등하거나 실패·누락·스킵을 `PASS`로 바꾸지 않는다.
- 필수 finding마다 위치(소스 `file:line`, 또는 route·viewport·selector·스크린샷 파일과 영역), 기준(어긴 acceptance·토큰·설계 계약의 출처), 기대/관찰, 재현(route·viewport·선행 조작)을 모두 쓴다. 기준을 인용할 수 없는 지적은 `advisory`다.
- 필수 선행 입력이 없거나 필요한 증거를 확보할 실행·시각 검사 기능이 없으면 `INCOMPLETE`로 기록하고 차단한다. 이 단계에서 만들 스크린샷은 아래 촬영 절차에서 확보하며 최종 판정 시 필수 증거의 누락을 확인한다. 코드 분석은 실제 이미지를 여는 시각 검사를 대체하지 못한다.

## 핵심 원칙: 작성 에이전트 ≠ 검증 에이전트

- **에이전트 B (검증 전문)**: Sonnet - 스크린샷 검증, 문제 판정, 합격/불합격 결정만 담당. **코드 수정 금지**
- **에이전트 A (수정 전문)**: Sonnet - 에이전트 B의 판정에 따라 코드만 수정. **합격/불합격 판정 금지**

이 분리를 통해 검증자의 편견 없는 판정과 수정자의 빠른 피드백 루프를 보장한다.

---

## 🚨 검증 태도 (절대 준수)

**최대한 예민하고 세심하게 본다.** "괜찮아 보인다"는 판단을 경계한다.

- **1px 단위까지 의심한다** — 미세한 정렬 어긋남, 간격 불균일, 테두리 불일치도 관찰하고 필수 기준과 비교한다
- **필수 기준의 허용 범위를 지킨다** — 근사치로 통과시키지 않고, 기준에 없는 정밀도나 취향을 새 필수 조건으로 만들지 않는다
- **빈 공간을 의심한다** — 불필요한 여백, 비대칭 공백, 콘텐츠 없는 빈 영역을 모두 점검한다
- **일반 사용자의 첫인상으로 본다** — 개발자 시선이 아니라, 처음 보는 사람이 "어색하다"고 느낄 수 있는 모든 것을 잡아낸다
- **스크린샷을 확대해서 본다** — 전체 레이아웃뿐 아니라 개별 컴포넌트, 텍스트 렌더링, 아이콘 선명도까지 확인한다
- **비교 검증한다** — 같은 역할의 요소들(버튼끼리, 카드끼리, 섹션끼리)이 시각적으로 동일한 규칙을 따르는지 교차 비교한다
- **어색함의 원인을 정확히 특정한다** — "뭔가 이상하다"로 끝내지 않고, 어떤 속성(margin, padding, font-size, color, border-radius 등)이 몇 px/어떤 값으로 잘못되었는지 명시한다
- **관찰과 판정을 나눈다** — 위 태도로 찾은 어색함은 모두 적되, 판정 기준의 필수 기준을 인용할 수 있을 때만 `Critical`/`Important`로 올린다. 나머지는 `advisory`다

## 사전 분석 (동적 결정)

1. **프로젝트 UI 특성 파악**
   - step002_레이아웃설계_chunk*.md (레이아웃 설계)에서 UI 구조/컴포넌트 목록 추출
   - step002_전체설계_chunk*.md (전체 설계)에서 UI 구조/컴포넌트 목록 추출
   - 반응형 여부, 대상 디바이스, 레이아웃 방식 파악
   - 사용된 CSS 프레임워크/디자인 시스템 확인

2. **검증 뷰포트 결정**
   - 프로젝트 대상 디바이스에 맞는 뷰포트 선택
   - 반응형이 아닌 경우 주요 뷰포트 1개만 사용
   - 반응형인 경우 브레이크포인트 기준으로 뷰포트 목록 구성

3. **검증 항목 결정**
   - 프로젝트에 실제 존재하는 UI 요소 기반으로 검증 항목 구성
   - 해당 없는 항목은 제외 (예: 반응형 아니면 반응형 검증 제외)

## 검증 관점 (해당하는 항목만 동적 선택)

- **레이아웃**: 정렬 일관성, 간격 균일성, 배치 의도 부합 여부
- **색상**: 대비 충분성, 팔레트 일관성, 강조색 적절성
- **타이포그래피**: 크기 계층 구조, 굵기 적절성, 줄 간격 가독성
- **반응형**: 뷰포트별 요소 겹침/잘림, 전환 자연스러움, 터치 타겟 크기
- **여백**: 가장자리 여유, 섹션 간 간격, 내부 패딩 균일성
- **겹침/잘림**: 위치 지정 요소 간섭, overflow 잘림, z-index 충돌
- **시각적 완성도**: 전체적인 균형감, 시각적 노이즈, 미완성 느낌
- **AI Slop 징후 (필수 점검)**: 아래 징후를 설계 계약·필수 acceptance와 대조한다. 계약 `exclude`에 있고 `adopted: false`인 항목의 위반은 `Important` 필수 finding(`FAIL`)이고, 계약에 없는 징후는 `advisory`로 기록한다. 폰트 이름만으로 금지하지 않는다 — 계약 항목이 근거다.
  - Inter/Roboto/Arial 폰트 노출 여부 (`generic-sans`)
  - 보라 계열 그라데이션 배경의 맥락 없는 사용 (`purple-gradient`)
  - 모든 카드가 중앙정렬만 되어 있는 획일적 구조 (`centered-cards`)
  - 과도한 border-radius — 계약 `tokens.radius` 밖 값, 헌법 §5 허용값 [0, 4, 8, 12, 16] 밖 값 (`excess-radius`)
  - 획일적 단색 배경 (`flat-background`)
  - 크림·오프화이트 페이지 바탕 (`cream-background`)
  - 제목 속 이탤릭 강조어 (`italic-heading-accent`)
  - 01·02·03 장식 번호 섹션 라벨 (`numbered-section-labels`)
  - 코드 밖 모노스페이스 라벨 (`monospace-labels`)
  - 알약형 버튼 (`pill-buttons`)
  - 계약의 `topic-N` 항목 (사용자 제외)
  - 임의 헥스 코드(토큰 미매핑) 사용 징후
  - 클릭 가능 요소의 hover/focus 상태 누락
  - Empty State 디자인 부재 (데이터 0 시 레이아웃 붕괴)

## AI Slop 게이트 검증 (필수)

무작위로 **10개** 컴포넌트를 샘플링하여 설계 계약 `tokens`에 대한 다음 매핑 여부를 확인한다:
색상 / 타이포그래피 / 간격(4·8pt) / border-radius / shadow.

- **8개 미만**이 설계 계약 `tokens`에 매핑되었다면 `FAIL`로 기록하고 베이스라인을 수리한다.
- 수리 후 재검증도 같은 최대 5라운드에 포함한다. 수리 모드 전환으로 회차를 초기화하지 않는다.

## 실행 방법

1. 사전 분석 결과를 기반으로 뷰포트 목록과 검증 대상 페이지/뷰 결정
2. 각 조합(뷰포트 × 페이지)마다 브라우저 자동화 절차 작성 및 실행
3. 스크린샷을 `step_archive/screenshots/design/` 에 저장

## 검증 절차 (각 뷰포트 × 페이지 조합마다 반복)

### 1단계: 스크린샷 촬영

브라우저 자동화 절차 실행 → 스크린샷을 `step_archive/screenshots/design/` 에 저장

### 2단계: 에이전트 B의 역할 (검증)

스크린샷을 직접 Read하여 시각적으로 확인하고 **판정과 근거 기록만 수행한다**:
- 검증 태도를 따라 최대한 예민하게 검증
- 각 관점(레이아웃, 색상, 타이포그래피 등)에서 문제 식별
- 판정 결과:
  - **PASS**: 모든 필수 항목 통과, 미해결 `Critical`/`Important` 없음 → 해당 조합 종료. 참고 의견은 별도 기록
  - **FAIL**: 필수 finding을 위치·기준·기대/관찰·재현 네 필드로 기록하여 에이전트 A에 전달
  - **INCOMPLETE**: 필수 증거·실행 기능 부재 또는 아래 중단 조건 충족 → 차단 사유를 기록하고 현재 단계에서 중단

### 3단계: 에이전트 A의 역할 (수정)

1. 에이전트 B의 FAIL 판정과 구체적 지적사항을 받는다.
2. **코드만 수정한다** (CSS/HTML/스타일):
   - 에이전트 B가 지적한 부분에 집중
3. 스크립트 재실행 → 스크린샷 재촬영
4. 재촬영한 스크린샷을 에이전트 B에 전달

### 4단계: 반복 제한: 최대 5라운드

최초 판정을 1라운드로 세며, 수정 후 독립 재검증을 포함해 최대 5라운드까지 수행한다.
한 라운드는 선정한 모든 뷰포트 × 페이지 조합의 판정을 포함한다. 수리·재촬영으로 회차를 초기화하지 않는다.

**중단 조건:**
1. **모든 필수 항목 PASS**이고 미해결 `Critical`/`Important` 없음 → 검증 완료
2. **동일 필수 finding 3연속 [미수정]** → `INCOMPLETE`, 차단 원인과 시도한 수정을 기록하고 중단
3. **5라운드 후 미해결 필수 finding** → `INCOMPLETE`, 남은 오류와 다음 안전한 조치를 기록하고 중단

미해결 `Critical` 또는 `Important`가 하나라도 있으면 완료를 차단한다.
스킵이나 미해결 finding은 통과 또는 완료 증거가 아니다. 중단 시 다음 Step으로 진행하거나 완료 문구를 출력하지 않는다.
한도 소진이나 같은 필수 항목의 연속 미수정으로 끝나면 `required-input-missing`, 필수 실행·시각 검사 기능이 없으면 `required-tool-failed`로 헌법 §2-1 명명된 멈춤을 기록하고 턴을 끝낸다.

## Jev 의미 체크포인트

필수 기준과 실제 관찰 finding이 준비되면 `criterion_violation`, `preference`, `insufficient_evidence`로 분류한다. `insufficient_evidence`를 실패로 단정하지 않는다. 선택한 관찰 텍스트만 평가하며 필수 이미지 검사·독립 시각 판정·Critical/Important 미해결 차단은 그대로 유지한다.

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

## 실패 패턴 기록

에이전트 B는 각 라운드 결과를 `step_archive/outputs/step019_검증_rN.md`에 저장한다.
- 현재 Step `19`, 라운드, 최종 판정, 뷰포트·페이지, 필수 기준, finding 중요도·위치·기준·기대/관찰·재현과 증거 경로를 기록한다.
- 설계 계약 `exclude` 항목마다 준수·위반·채택 예외 중 하나와 근거 스크린샷 영역을 기록한다.
- 도중 발생한 FAIL도 해결 여부·재검증 결과와 함께 보존한다. 참고 의견은 필수 finding과 분리한다.
- 중단 시 남은 필수 finding, 차단 원인, 시도한 수정, 다음 안전한 조치를 적는다.
- 비밀값·개인정보·원시 로그를 복사하지 않고 필요한 요약과 프로젝트 상대 증거 경로만 남긴다.
- 검증·수정 에이전트는 `progress.json` 등 공유 workflow 상태를 직접 수정하지 않는다. 완료 반영은 기존 workflow writer가 소유한다.

### 최종 확인

모든 조합(뷰포트 × 페이지)에서 필수 항목과 필수 증거가 `PASS`이고 미해결 `Critical`/`Important`가 없음을 확인한 뒤에만 다음 단계 진행

합리적인 선에서 최대한 많은 서브에이전트를 병렬로 사용한다 (동시 실행 최대 10개).

- **에이전트 B (검증)**: sonnet 사용 - 스크린샷 검증 담당
- **에이전트 A (수정)**: sonnet 사용 - 코드 수정 담당

---

최종 `PASS`로 이 지침을 완료한 경우에만 자동으로 step020.md를 읽고 수행한다. `INCOMPLETE`이면 완료를 보고하지 않고 헌법 §2-1 명명된 멈춤으로 끝낸다.

## 정의별 입력·산출물 계약

- 입력: `step_archive/step002_레이아웃설계_chunk1.md`
- 입력: `step_archive/step002_전체설계_chunk1.md`
- 입력: `step_archive/step010_smoke_test.md`
- 입력: `dist/index.html`
- 입력: `step_archive/step014_routing검증.md`
- 입력: `step_archive/outputs/trust5_r2.md`
- 입력: `step_archive/step017_keyboard검증.md`
- 입력: `step_archive/step018_마우스검증.md`
- 입력: `step_archive/outputs/step011_검증_r1.md`
- 산출물: `step_archive/outputs/step019_검증_r1.md`
- 산출물: `step_archive/screenshots/design/step019-primary-r1.png`

필수 수락 항목: `design-visual-report`, `design-primary-screenshot`, `eight-axis-design-review`, `design-token-contract-traceability`, `stable-component-sample`, `independent-design-verifier`, `visual-inspection-required`, `bounded-pass-loop`
