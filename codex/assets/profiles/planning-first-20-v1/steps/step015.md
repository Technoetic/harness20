---
name: step015
phase: e2e
---

# Step 15 - E2E 테스트


## 목표

현재 build를 실제 사용자 흐름으로 검증한다. 주제와 설계에서 동적으로 시나리오를
도출하고, 프로젝트가 선언한 E2E 러너(`npm run e2e`)와 선언된 E2E script만 사용해 전체
suite가 재현 가능하게 통과하는지 독립적으로 확인한다.

## 입력과 산출물

- 입력: `step_archive/TOPIC/TOPIC.md`
- 입력: `step_archive/step002_레이아웃설계_chunk1.md`
- 입력: `step_archive/step002_전체설계_chunk1.md`
- 입력: `step_archive/step003_환경준비.md`
- 입력: `step_archive/step010_smoke_test.md`
- 입력: `dist/index.html`
- 입력: `step_archive/outputs/browser-backend.json`
- 입력: `step_archive/step014_routing검증.md`
- 입력: `step_archive/outputs/trust5_r2.md`
- 필수 선행 항목: `step002`, `step003`, `step010`, `step014`
- 산출물: `step_archive/step015_e2e테스트결과.md`
- 네트워크: browser readiness와 이미 승인되고 준비된 배포 대상의 읽기 전용 검증에만 제한적으로 사용한다. 승인된 Jev 선택 API도 허용한다.
- 시각 검토: 필요하지 않다.

## 실행 역할

가능한 경우 E2E 실행·보정자 역할과 E2E 독립 검증자 역할을 서로 다른 실행 주체에
맡긴다. 실행·보정자는 test와 application의 실패 원인을 최소 범위로 고치고, 독립
검증자는 산출물과 application source를 수정하지 않는다. 위임 기능을 사용할 수
없으면 현재 실행자가 두 역할을 명확히 분리해 순서대로 수행하고, 별도 역할을
위임했다고 기록하지 않는다. 정상 권한 확인을 유지하고 자동 승인이나 권한 우회를
금지한다.

## 사전 준비와 시나리오 설계

project manifest와 lockfile을 확인해 프로젝트가 선언한 E2E 러너 dependency, 선언된 E2E
script, 기존 러너 configuration과 browser readiness를 먼저 검증한다. 러너 구현(어떤 브라우저
자동화 도구인지)은 검사하지 않는다. implicit package download을 금지하며, 프로젝트 밖
package나 임시 최신 버전을 가져오지 않는다. 기존 러너 configuration은 보존하고 필요한
test만 현재 ownership에 맞춰 추가한다.

로컬 dependency가 없으면 필수 입력이 누락된 것으로 차단한다. dependency는 있지만
browser binary가 없으면 로컬 package가 제공하는 installer만 최대 3회 정상 권한 흐름으로
설치 시도한다. 각 시도의 exact command, exit code와 결과를 기록하며, 세 번 안에
준비되지 않으면 차단한다.

환경 준비 3단계가 `step_archive/outputs/browser-backend.json`에 브라우저 검증 backend를 고정했으면
browser readiness와 E2E 러너는 그 고정 backend만 사용한다. 준비되지 않았으면 그 backend만
복구하고 다른 backend의 package나 browser binary를 설치하지 않는다. 위 installer 시도도
고정 backend가 쓰는 browser에만 적용한다. 예를 들어 Aside로 고정된 작업공간의 러너는
Aside로 브라우저를 구동하며 Playwright browser binary를 내려받지 않는다. 잠금 파일이 없거나 유효하지 않으면 필수 환경 입력 누락으로 차단하고 3단계의 환경 증거를 복구한다.

topic, design, built application과 실제 user flow를 읽고 성공 흐름, 실패 흐름, 상태
전이와 project-specific edge case 최소 2개를 포함하는 시나리오 manifest를 작성한다.
고정된 예제나 존재하지 않는 화면을 발명하지 않는다.

웹앱은 `docs/ROUTING.md`와 2단계 주소 표의 모든 경로를 desktop/mobile에서 검사한다.
직접 접속·새로고침·실제 링크 이동·뒤로/앞으로·unknown fallback마다 URL과 보이는
`data-harness-screen` ID를 함께 단언한다. 주소 없는 화면 전이 또는 주소만 바뀌는
구현은 실패다. 한 화면인 경우 이동만 해당 없음으로 기록하고 나머지 검사는 실행한다.
기본 브라우저와 앱 시작 전에 Navigation API를 제거한 환경에서 동일한 전체 경로를
검사한다. 실제 지원 HTTP(S) 브라우저의 native 분기와 강제 호환 분기의 실행 증거를
모두 남긴다. 가짜 API만 주입한 테스트는 native 증거가 아니며 URL/화면 동작만으로
사용 API를 단정하지 않는다. 실제 capability와 backend 선택의 프로젝트별 관측도 기록한다.
두 환경에서 cold bootstrap·앱 hash 변경·unknown fallback·수정키/다른 target/download/
외부 링크/form/일반 문서 앵커 우회를 검증한다. schema version 3 보고서의 기본
`viewports`와 `compatibility.navigation_api_unavailable.viewports`가 각각 desktop/mobile의
모든 경로를 포함해야 하며 두 시나리오를 동일한 공통 검사 제한 시간 안에서 실행한다.
파일 직접 열기 지원은 hash manifest로 검증한다. history manifest는 HTTP(S)가 필요하며
실행 환경에 따라 mode를 암묵 변환해 테스트하지 않는다.
history 모드는 로컬 HTTP 서버의 fallback 설정과 직접 접속·새로고침 증거가 필수다.
사용자가 이미 승인한 실제 배포 대상이 준비되어 있을 때만 그 서버에서도 검증한다.
대상이나 권한이 없으면 `deployment-verification: pending`과 사유를 기록하고 로컬
완료 범위를 명시한다. 이 단계는 배포를 실행하거나 권한을 새로 만들지 않는다.
실제 배포까지 사용자 요구사항에 포함되어 있으면 대기를 전체 완료로 바꾸지 않는다.
검사기 내부 fallback은 배포 설정의 증거가 아니다. 제목·활성 메뉴·포커스 전이도 E2E로 확인한다.
보고서에 local serving URL, hash/history mode, fallback 설정과 검사한 build SHA-256을
남기고 16~20단계에 전달한다. 배포 검증은 확인한 배포 버전에만 유효하다.

## 전체 E2E 실행과 독립 검증

project manifest에 선언되어 acceptance pattern과 일치하는 정확한 E2E script로 전체
suite를 실행하고 exit code 0만 성공으로 인정한다. 일부 spec만 선택하거나 optional
mode로 실행하지 않는다. 실패 원인과 exact failing scenario를 기록하고 최소 변경을
적용한 뒤 다시 전체 suite를 실행한다.

최대 5라운드 안에서 실행·보정과 독립 검증을 반복한다. 독립 검증자는 시나리오
manifest, 전체 command output, exit code, edge-case coverage와 변경 범위를 처음부터
확인한다. `Critical` 또는 `Important` finding이 하나라도 미해결이면 차단한다. 필수
입력, 필수 증거 또는 실행 capability가 없거나 사용할 수 없으면 차단한다. 모든 필수
항목이 증거와 함께 `PASS`인 경우에만 보고서를 확정한다. 스킵이나 미해결 finding은
통과 또는 완료 증거가 아니다.

`step_archive/step015_e2e테스트결과.md`에는 scenario manifest, 최소 두 edge case,
browser readiness 시도, exact E2E command, 전체 suite 결과, 각 라운드와 최종 독립
판정을 기록한다. credential이나 환경 비밀은 기록하지 않는다.

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

## 완료 조건

- `e2e-test-report`: project-specific scenario와 전체 suite 증거가 기록됐다.
- `project-e2e-command`: 선언된 exact local E2E script가 성공했다.
- `project-e2e-runner-only`: 프로젝트가 선언한 E2E 러너(`npm run e2e`)만 사용했고 그 구현은 검사하지 않았으며 implicit download가 없었다.
- `bounded-browser-readiness`: browser 설치 시도가 정상 권한으로 최대 3회 이내였다.
- `dynamic-scenario-coverage`: topic, design, build와 user flow가 시나리오에 반영됐다.
- `edge-case-coverage`: project-specific edge case를 최소 2개 검증했다.
- `independent-e2e-verifier`: 비수정 독립 검증자가 전체 증거를 확인했다.
- `bounded-pass-loop`: 5라운드 안에 미해결 finding 없는 `PASS`를 얻었다.

보고서를 수락 증거로 제출하고 현재 단계에서 멈춘다. workflow 상태와 영수증만이 이후
진행을 소유한다.
