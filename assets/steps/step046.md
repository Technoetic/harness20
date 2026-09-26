---
name: step046
persistence: session
---

# Step 46 - 스크린샷 기반 상세 E2E 테스트

이전 버전에서 완료한 44단계의 보고서를 입력으로 읽을 때는
`docs/STEP044-MIGRATION.md`의 입력 호환 절차를 따른다.

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-046.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step046_*.md` 저장 후 1줄 완료 보고 `Step 046/50 완료`.
>
> **모델 정책**: 조사·구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: E2E 검증 구간 (최종 게이트 step050)

## QA 완료 증거 (필수)

신뢰한 설치 플러그인의 `docs/QA-REPORTS.md`와 `scripts/qa-report.mjs`를 사용한다.
각 시도 시작에 `inspect --workspace "<project-root>" --step 46`으로 이전 실패를 확인한다.
수정과 필요한 build를 마친 뒤 검증 전에 `snapshot`을 만든다. 실제 소스·설정·검증 대상
산출물과 본문의 모든 필수 검사(화면·viewport·상태 조합 포함)를 명시한다.
검증자의 실제 관찰과 스크린샷·실행 결과를 `record`로 기록한 뒤 다시 `inspect`한다.
`status=current`와 `verdict=PASS`를 모두 확인해야 완료 보고 및 다음 Step 진입이 가능하다.
필수 실패·증거 누락·미실행·stale은 INCOMPLETE다. 수정 뒤에는 새 snapshot과 재검증이 필요하다.
검증 전 snapshot을 검증 후 새로 만들어 과거 결과를 현재 PASS로 바꾸지 않는다.

## Step-Back

실행 전에 먼저 답하라:
- 이 테스트의 핵심 목적은? (한 문장)
- 테스트 실패 시 어느 Step으로 돌아가야 하는가?
- 반드시 확인해야 할 엣지 케이스 2가지는?

프로젝트 특성을 분석하여 테스트 범위와 검증 항목을 동적으로 결정한다.

브라우저 자동화 도구(docs/BROWSER-TOOLS.md 절차표)로 스크린샷을 촬영하며 상세한 E2E 테스트를 수행한다.

웹앱의 각 독립 화면은 `docs/ROUTING.md` manifest의 canonical URL로 직접 진입해
촬영한다. viewport·URL·화면 ID·상태·스크린샷의 대응표를 기록하고 URL과 보이는
화면이 일치하는지 비교한다. 링크 이동 후 결과만으로 직접 진입 검사를 대체하지 않는다.
기본 브라우저와 앱 시작 전 Navigation API 비가용 시나리오를 구분해 동일한 화면·URL·
viewport 조합을 검증한다. 스크린샷의 화면 일치만으로 실제 사용 backend를 단정하지 않는다.
"웹 앱"이 아니면 프로젝트 유형에 적합한 스크린샷 기반 테스트를 수행한다.

합리적인 선에서 최대한 많은 서브에이전트를 병렬로 사용한다 (동시 실행 최대 10개).

**스크린샷 E2E 테스트 단계에서 절대로 superpowers:brainstorming을 사용하지 않는다.**

서브에이전트는 haiku로 촬영·브라우저 조작·증거 수집만 한다. 스크린샷을 열어 URL과 보이는 화면의 일치·시각 결함·PASS/FAIL을 판정하는 일은 메인 세션이 하거나 sonnet 이상 서브에이전트에 맡긴다(헌법 §7). haiku 서브에이전트는 스크린샷 경로·viewport·URL·화면 ID·상태만 돌려주고 판정을 적지 않는다.

## 검증 서버와 라우팅 입력

Step 45에서 검증한 서버 실행 방법·base URL·manifest routing mode를 재사용한다.
서버를 재시작해야 하면 같은 설정으로 시작하고 준비 상태를 확인한다. history mode는 HTTP(S)와
SPA fallback을 유지하며 file://로 바꾸지 않는다. hash mode도 Step 45에서 검증한 serving mode를 유지한다.
각 화면의 canonical URL을 사용하고 보고서에 base URL·mode·화면 ID를 기록한다.

## 결과 저장

결과를 step_archive/screenshots/e2e/에 저장한다.



## Self-Calibration

테스트 완료 후:
- 모든 테스트가 통과했는가? (Y/N)
- Step-Back에서 정의한 엣지 케이스가 모두 커버되었는가? (Y/N)
- N이면 재실행한다.

## 오류 발생 시

오류 발생 시 원인을 분석하고 수정한 뒤 재시도한다. 3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, 그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.


---

필수 요구와 현재 검증 증거가 모두 PASS일 때만 이 지침을 완료하고 자동으로 step047.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.

