---
name: step048
persistence: session
---

# Step 48 - 마우스 인터랙션 시각 검증

이전 버전에서 완료한 44단계의 보고서를 입력으로 읽을 때는
`docs/STEP044-MIGRATION.md`의 입력 호환 절차를 따른다.

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-048.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step048_*.md` 저장 후 1줄 완료 보고 `Step 048/50 완료`.
>
> **모델 정책**: 조사·구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: E2E 검증 구간 (최종 게이트 step050)

브라우저 자동화 도구(docs/BROWSER-TOOLS.md 절차표 'Keyboard / mouse'·'Screenshot' 행)로 마우스 인터랙션을 직접 수행하며 스크린샷을 촬영하고, Claude가 스크린샷을 직접 Read하여 시각적으로 확인한다.
문제 발견 시 코드를 수정하고 재검증을 반복한다. 모든 항목이 통과할 때까지 반복한다.

**이 단계에서 절대로 superpowers:brainstorming을 사용하지 않는다.**

**스크린샷 없이 통과 처리 금지. 반드시 Claude가 직접 스크린샷을 눈으로 확인한다.**

## QA 완료 증거 (필수)

신뢰한 설치 플러그인의 `docs/QA-REPORTS.md`와 `scripts/qa-report.mjs`를 사용한다.
각 시도 시작에 `inspect --workspace "<project-root>" --step 48`으로 이전 실패를 확인한다.
수정과 필요한 build를 마친 뒤 검증 전에 `snapshot`을 만든다. 실제 소스·설정·검증 대상
산출물과 본문의 모든 필수 검사(화면·viewport·상태 조합 포함)를 명시한다.
검증자의 실제 관찰과 스크린샷·실행 결과를 `record`로 기록한 뒤 다시 `inspect`한다.
`status=current`와 `verdict=PASS`를 모두 확인해야 완료 보고 및 다음 Step 진입이 가능하다.
필수 실패·증거 누락·미실행·stale은 INCOMPLETE다. 수정 뒤에는 새 snapshot과 재검증이 필요하다.
검증 전 snapshot을 검증 후 새로 만들어 과거 결과를 현재 PASS로 바꾸지 않는다.

## 검증 항목

각 항목마다 인터랙션 전후 스크린샷을 쌍으로 촬영하여 `step_archive/screenshots/mouse/` 에 저장한다.

### 1. Hover
- 버튼, 링크, 카드 등 hover 가능한 요소에 마우스를 올린다
- hover 전 스크린샷 → hover 후 스크린샷
- 확인: 색상 변화, 툴팁 표시, 커서 변경, 애니메이션 동작

### 2. Click
- 버튼, 링크, 체크박스, 라디오 등 클릭 가능한 요소를 클릭한다
- click 전 스크린샷 → click 후 스크린샷
- 확인: 화면 전환, 상태 변화, 팝업/모달 표시, 선택 상태

### 3. Right Click (Context Menu)
- 우클릭 컨텍스트 메뉴가 있는 요소를 우클릭한다
- 우클릭 전 스크린샷 → 우클릭 후 스크린샷
- 확인: 컨텍스트 메뉴 표시, 메뉴 항목, 위치 정확성

### 4. Double Click
- 더블클릭으로 활성화되는 요소를 더블클릭한다
- 더블클릭 전 스크린샷 → 더블클릭 후 스크린샷
- 확인: 편집 모드 진입, 선택 상태, 특수 동작

### 5. Drag & Drop
- 드래그 가능한 요소를 드래그하여 대상 위치에 놓는다
- drag 전 → drag 중 → drop 후 스크린샷
- 확인: 드래그 시각 피드백, 드롭 결과, 원래 위치 변화

### 6. Scroll
- 페이지 및 스크롤 가능한 컨테이너를 마우스 휠로 스크롤한다
- 스크롤 전 → 중간 → 끝 스크린샷
- 확인: sticky 요소, 무한 스크롤, lazy load, 스크롤바 동작

## 검증 서버와 라우팅 입력

Step 45에서 검증한 서버 실행 방법·base URL·manifest routing mode를 재사용한다.
서버를 재시작해야 하면 같은 설정으로 시작하고 준비 상태를 확인한다. history mode는 HTTP(S)와
SPA fallback을 유지하며 file://로 바꾸지 않는다. hash mode도 Step 45에서 검증한 serving mode를 유지한다.
각 화면의 canonical URL을 사용하고 보고서에 base URL·mode·화면 ID를 기록한다.

## 실행 방법

각 항목마다 브라우저 자동화 절차를 작성하여 실행한다 (구체 API는 docs/BROWSER-TOOLS.md 절차표):

1. Step 45의 검증된 base URL + 해당 화면 canonical path(`HARNESS50_QA_URL`, 없으면 오류로 중단)로 페이지 열기
2. 인터랙션 전 스크린샷 → `step_archive/screenshots/mouse/[항목]-before.png`
3. 마우스 인터랙션: hover / click / 우클릭 / 더블클릭 / drag & drop / 스크롤(wheel)
4. 인터랙션 후 스크린샷 → `step_archive/screenshots/mouse/[항목]-after.png`
5. 탭/컨텍스트 닫기

백엔드별 호출은 docs/BROWSER-TOOLS.md 절차표('Keyboard / mouse'·'Screenshot' 행)를 따른다. Aside CLI에서 drag & drop은 `page.dragAndDrop`이 실측되지 않았으므로 `page.mouse.move/down/up`으로 조합하고, 스크린샷은 실패 시 재시도(타임아웃 4000/8000/8000 ms) 뒤 세션 `./artifacts/`에 저장되므로 `step_archive/`로 복사한다.

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

필수 요구와 현재 검증 증거가 모두 PASS일 때만 이 지침을 완료하고 자동으로 step049.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.


