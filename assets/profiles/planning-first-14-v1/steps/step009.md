---
name: step009
persistence: session
---

# Step 9 - E2E 테스트


<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-009.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step009_*.md` 저장 후 1줄 완료 보고 `Step 009/14 완료`.
>
> **모델 정책**: 구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: E2E 검증 구간 (최종 게이트 step014)

## 사전 체크

E2E 시작 전 아래를 확인하고, 미비하면 사용자에게 묻지 않고 즉시 조치한다.

1. 브라우저 검증 백엔드: 플러그인 체크아웃에서 `node scripts/verify-output.mjs --probe --workspace "<project-root>"` — 환경 준비 Step 2이 `step_archive/outputs/browser-backend.json`에 고정한 백엔드가 있으면 selected는 그 백엔드뿐이다. selected가 null이면 출력의 error가 가리키는 그 백엔드만 docs/BROWSER-TOOLS.md에 따라 복구하고 (최대 3회) 다른 백엔드의 package나 browser binary를 설치하지 않는다. 잠금 파일이 없으면 필수 환경 입력 누락으로 차단한다
2. 프로젝트가 선언한 E2E 러너(`npm run e2e`)와 그 설정 파일 존재 — 없으면 프로젝트 구조에 맞게 직접 생성한다. 러너 구현은 검사하지 않는다
3. `dist/index.html` 존재 — 없으면 `npm.cmd run build`를 먼저 실행한다
4. 별도 테스트 파일 매핑 단계가 없으므로, E2E 테스트 스펙은 이 단계에서 직접 작성한다

## Step-Back

실행 전에 먼저 답하라:
- 이 테스트의 핵심 목적은? (한 문장)
- 테스트 실패 시 어느 Step으로 돌아가야 하는가?
- 반드시 확인해야 할 엣지 케이스 2가지는?

프로젝트 특성을 분석하여 테스트 범위와 검증 항목을 동적으로 결정한다.

프로젝트가 선언한 E2E 러너(`npm run e2e`)를 사용하여 E2E 테스트를 수행한다. 브라우저 검증은 환경 준비 Step 2이 고정한 백엔드(`step_archive/outputs/browser-backend.json`, docs/BROWSER-TOOLS.md)로 수행하고, 잠금 파일이 없으면 필수 환경 입력 누락으로 차단한다. E2E 러너가 쓰는 브라우저도 고정 백엔드 범위 안에서 준비한다: Aside로 고정된 프로젝트의 러너는 Aside(`aside repl` 스크립트 등)로 브라우저를 구동하며 Playwright browser binary를 내려받지 않는다.

단일 HTML 웹앱은 플러그인 `docs/ROUTING.md`의 모든 선언 경로를 검사한다. desktop과
mobile에서 각 URL 직접 접속·새로고침, 실제 링크 이동, 뒤로/앞으로 가기와 알 수 없는
주소 fallback을 검증하고 매번 주소와 보이는 화면 ID를 함께 단언한다. 화면만 바뀌거나
주소만 바뀌는 구현은 실패다. 여러 화면일 때 이동 검사를 생략하지 않는다. 한 화면은
이동만 해당 없음으로 기록하며 직접 접속·새로고침·fallback은 계속 검사한다.
기본 브라우저와 앱 시작 전에 Navigation API를 제거한 환경에서 동일한 전체 경로를
검사한다. 실제 지원 HTTP(S) 브라우저의 native Navigation API 분기와 강제 호환 분기
실행 증거가 모두 필요하며, API를 흉내 낸 객체만으로 native 통과를 주장하지 않는다.
capability와 선택 backend의 프로젝트별 관측을 기록한다. URL/화면 일치만으로 어떤 API를
사용했는지 증명했다고 쓰지 않는다. 두 환경에서 cold bootstrap·앱 hash 변경·unknown
fallback·수정키/다른 target/download/외부 링크/form/일반 문서 앵커 우회도 검사한다.
두 시나리오는 schema version 3 보고서의 기본 `viewports`와
`compatibility.navigation_api_unavailable.viewports`에 각각 desktop/mobile 전체 결과를
남긴다. 어느 한쪽도 생략하지 않으며 동일한 공통 검사 제한 시간 안에서 실행한다.
파일 직접 열기 지원은 hash manifest로 검증한다. history manifest는 HTTP(S)가 필요하며
실행 환경에 따라 mode를 암묵 변환해 테스트하지 않는다.
history 모드는 로컬 HTTP 서버의 fallback 설정과 직접 접속·새로고침을 필수로 검증한다.
사용자가 이미 승인한 실제 배포 대상이 준비되어 있을 때만 그 서버에서도 같은 검사를
수행한다. 대상이나 권한이 없으면 `deployment-verification: pending`과 사유를 기록하고
로컬 완료 범위를 명시한다. 이 단계가 배포를 자동 실행하거나 새 권한을 만들지 않는다.
실제 배포까지 사용자 요구사항에 포함되어 있으면 대기를 전체 완료로 바꾸지 않는다.
로컬 검사기가 제공하는 fallback만으로 배포 설정까지 통과했다고 주장하지 않는다.
보고서에 local serving URL, hash/history mode, fallback 설정, 검사한 build SHA-256을
남기고 10~14단계가 같은 실행 환경을 사용하게 한다. 배포 검증은 확인한 배포 버전에만 유효하다.
"웹 앱"이 아니면 프로젝트 유형에 적합한 E2E 테스트를 수행한다.

합리적인 선에서 최대한 많은 서브에이전트를 병렬로 사용한다 (동시 실행 최대 10개).

**E2E 테스트 단계에서 절대로 superpowers:brainstorming을 사용하지 않는다.**

**검증:**
- 프로젝트가 선언한 E2E 스크립트(`npm run e2e`) 실행 결과 전체 PASS로 직접 검증 (구 e2e-validator.ps1은 retired — 2026-06-10 M07 정정)

**검증 실패 시:**
- 실패한 테스트 케이스 분석
- 테스트 실패 원인 수정
- 검증 통과할 때까지 반복

서브에이전트는 항상 haiku를 사용한다.

## 결과 저장

결과를 step_archive/step009_e2e테스트결과.md에 저장한다.


## Jev 의미 체크포인트

요구·사용자 흐름과 시나리오 설명이 준비되면 시나리오가 선택한 요구를 의미상 다루는지 묻는다. 시나리오의 문장 평가는 프로젝트 E2E 실제 실행과 독립 검증을 대체하지 않는다.

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

## Self-Calibration

테스트 완료 후:
- 모든 테스트가 통과했는가? (Y/N)
- Step-Back에서 정의한 엣지 케이스가 모두 커버되었는가? (Y/N)
- N이면 재실행한다.

---

이 지침을 완료한 즉시 자동으로 step010.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.

## 정의별 입력·산출물 계약

- 입력: `step_archive/TOPIC/TOPIC.md`
- 입력: `step_archive/step002_레이아웃설계_chunk1.md`
- 입력: `step_archive/step002_전체설계_chunk1.md`
- 입력: `step_archive/step004_smoke_test.md`
- 입력: `dist/index.html`
- 입력: `step_archive/step008_routing검증.md`
- 입력: `step_archive/outputs/trust5_r2.md`
- 입력: `step_archive/step002_환경준비.md`
- 입력: `step_archive/outputs/browser-backend.json`
- 산출물: `step_archive/step009_e2e테스트결과.md`

필수 수락 항목: `e2e-test-report`, `project-e2e-command`, `project-e2e-runner-only`, `bounded-browser-readiness`, `dynamic-scenario-coverage`, `edge-case-coverage`, `independent-e2e-verifier`, `bounded-pass-loop`
