---
name: step047
persistence: session
---

# Step 47 - 키보드 인터랙션 시각 검증

이전 버전에서 완료한 44단계의 보고서를 입력으로 읽을 때는
`docs/STEP044-MIGRATION.md`의 입력 호환 절차를 따른다.

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-047.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step047_*.md` 저장 후 1줄 완료 보고 `Step 047/50 완료`.
>
> **모델 정책**: 조사·구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: E2E 검증 구간 (최종 게이트 step050)

브라우저 자동화 도구(docs/BROWSER-TOOLS.md 절차표 'Keyboard / mouse'·'Screenshot' 행)로 키보드 인터랙션을 직접 수행하며 스크린샷을 촬영하고, Claude가 스크린샷을 직접 Read하여 시각적으로 확인한다.
문제 발견 시 코드를 수정하고 재검증을 반복한다. 모든 항목이 통과할 때까지 반복한다.

**이 단계에서 절대로 superpowers:brainstorming을 사용하지 않는다.**

**스크린샷 없이 통과 처리 금지. 반드시 Claude가 직접 스크린샷을 눈으로 확인한다.**

## QA 완료 증거 (필수)

신뢰한 설치 플러그인의 `docs/QA-REPORTS.md`와 `scripts/qa-report.mjs`를 사용한다.
각 시도 시작에 `inspect --workspace "<project-root>" --step 47`으로 이전 실패를 확인한다.
수정과 필요한 build를 마친 뒤 검증 전에 `snapshot`을 만든다. 실제 소스·설정·검증 대상
산출물과 본문의 모든 필수 검사(화면·viewport·상태 조합 포함)를 명시한다.
검증자의 실제 관찰과 스크린샷·실행 결과를 `record`로 기록한 뒤 다시 `inspect`한다.
`status=current`와 `verdict=PASS`를 모두 확인해야 완료 보고 및 다음 Step 진입이 가능하다.
필수 실패·증거 누락·미실행·stale은 INCOMPLETE다. 수정 뒤에는 새 snapshot과 재검증이 필요하다.
검증 전 snapshot을 검증 후 새로 만들어 과거 결과를 현재 PASS로 바꾸지 않는다.

## 검증 항목

각 항목마다 인터랙션 전후 스크린샷을 쌍으로 촬영하여 `step_archive/screenshots/keyboard/` 에 저장한다.

### 1. Tab 네비게이션
- Tab 키로 포커스를 순서대로 이동한다
- 포커스 이동 전 → 각 요소에 포커스된 후 스크린샷
- 확인: 포커스 링 표시, 포커스 순서(논리적 흐름), 포커스 트랩(모달 내 순환)

### 2. Shift+Tab 역방향 네비게이션
- Shift+Tab으로 포커스를 역방향으로 이동한다
- 역방향 이동 전 → 이동 후 스크린샷
- 확인: 역방향 포커스 이동, 포커스 순서 일관성

### 3. Enter / Space 활성화
- 버튼, 링크, 체크박스, 라디오 등에 포커스 후 Enter/Space를 누른다
- 활성화 전 → 활성화 후 스크린샷
- 확인: 버튼 클릭 효과, 체크박스 토글, 링크 이동, 드롭다운 열림

### 4. 방향키 조작
- 드롭다운, 라디오 그룹, 슬라이더, 탭 패널 등에서 방향키를 사용한다
- 조작 전 → 조작 후 스크린샷
- 확인: 선택 항목 이동, 값 변경, 시각적 피드백

### 5. Escape 키
- 모달, 드롭다운, 툴팁, 팝오버 등이 열린 상태에서 Escape를 누른다
- Escape 전 → Escape 후 스크린샷
- 확인: 닫힘 동작, 포커스 복귀 위치

### 6. 단축키
- 앱에서 제공하는 키보드 단축키(Ctrl+Z, Ctrl+S 등)를 실행한다
- 단축키 실행 전 → 실행 후 스크린샷
- 확인: 기능 정상 동작, 시각적 피드백

### 7. 입력 필드 키보드 입력
- 텍스트, 숫자, 날짜 등 입력 필드에 키보드로 값을 입력한다
- 입력 전 → 입력 중 → 입력 완료 후 스크린샷
- 확인: 입력 반영, 유효성 검사 표시, 자동완성 동작

## 검증 서버와 라우팅 입력

Step 45에서 검증한 서버 실행 방법·base URL·manifest routing mode를 재사용한다.
서버를 재시작해야 하면 같은 설정으로 시작하고 준비 상태를 확인한다. history mode는 HTTP(S)와
SPA fallback을 유지하며 file://로 바꾸지 않는다. hash mode도 Step 45에서 검증한 serving mode를 유지한다.
각 화면의 canonical URL을 사용하고 보고서에 base URL·mode·화면 ID를 기록한다.

## 실행 방법

각 항목마다 브라우저 자동화 절차를 작성하여 실행한다 (구체 API는 docs/BROWSER-TOOLS.md 절차표):

1. Step 45의 검증된 base URL + 해당 화면 canonical path(`HARNESS50_QA_URL`, 없으면 오류로 중단)로 페이지 열기
2. 인터랙션 전 스크린샷 → `step_archive/screenshots/keyboard/[항목]-before.png`
3. 키보드 인터랙션: Tab 이동 / Shift+Tab 역방향 / Enter 활성화 / Escape 닫기 / 텍스트 입력
4. 인터랙션 후 스크린샷 → `step_archive/screenshots/keyboard/[항목]-after.png`
5. 탭/컨텍스트 닫기

백엔드별 호출은 docs/BROWSER-TOOLS.md 절차표('Keyboard / mouse'·'Screenshot' 행)를 따른다. Aside CLI는 `page.keyboard.press('Tab')`으로 포커스가 이동하며(`document.hasFocus()`는 false로 남는다), 스크린샷은 실패 시 재시도(타임아웃 4000/8000/8000 ms) 뒤 세션 `./artifacts/`에 저장되므로 `step_archive/`로 복사한다.

## 검증 절차 (항목마다 반복)

1. 브라우저 자동화 절차 실행 → 스크린샷 저장
2. Claude가 스크린샷을 직접 Read하여 시각적으로 확인
3. **문제 발견 시:**
   - 위치(route·viewport·selector 또는 소스 `file:line`)·기대 동작과 관찰 동작·재현 조작 순서를 기록
   - 해당 소스 코드 수정
   - 스크립트 재실행 → 스크린샷 재촬영
   - Claude가 다시 직접 확인
   - **최대 5라운드 안에서 수정·재검증; 한도 소진 시 INCOMPLETE**
4. 모든 항목 통과 확인 후 다음 단계 진행

### 반복 제한: 최대 5라운드

최대 5라운드까지 수정·재검증한다. 같은 필수 항목이 3연속 미수정이면 조기 종료한다.
모든 필수 항목의 현재 증거가 PASS일 때만 완료한다. 실패·누락·미검증 또는 한도 소진이면
미해결 항목과 다음 검사를 기록하고 현재 Step을 INCOMPLETE로 인계한다.
필수 실패를 스킵하거나 완료 보고 후 다음 Step으로 진행하지 않는다.
한도 소진이나 같은 필수 항목의 연속 미수정으로 끝나면 `required-input-missing`, 필수 실행·시각 검사 기능이 없으면 `required-tool-failed`로 헌법 §2-1 명명된 멈춤을 기록하고 턴을 끝낸다.

서브에이전트는 haiku로 브라우저 조작·촬영·증거 수집만 한다. 전후 스크린샷을 열어 PASS/FAIL을 판정하는 일은 위 검증 절차대로 메인 세션이 직접 하거나 sonnet 이상 서브에이전트에 맡긴다(헌법 §7). haiku 서브에이전트는 스크린샷 경로·항목·조작 순서만 돌려주고 판정을 적지 않는다.

## CoVe (Chain-of-Verification)

검증 완료 후 체크리스트:
- [ ] 검증 기준이 모두 통과되었는가?
- [ ] 예외 케이스가 누락되지 않았는가?
- [ ] 검증 결과가 다음 Step에서 참조 가능한 형식으로 저장되었는가?

## Self-Calibration

- 이 검증 결과를 신뢰할 수 있는가? (Y/N)
- N이면 검증을 재실행한다.

---

필수 요구와 현재 검증 증거가 모두 PASS일 때만 이 지침을 완료하고 자동으로 step048.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.


