---
name: step003
phase: implementation
---

# Step 3 - 환경 준비

## 목표

선택된 통합 설계와 실제 프로젝트 선언을 대조해 구현에 필요한 의존성만 준비한다.
설치가 필요할 때에도 프로젝트가 쓰는 package manager와 lockfile을 보존하며, 필수
의존성을 검증하지 못하면 성공을 추정하지 않고 차단한다.

## 입력과 산출물

- 입력: `step_archive/outputs/step002_설계선택.md`
- 입력: `step_archive/step002_레이아웃설계_chunk1.md`
- 입력: `step_archive/step002_전체설계_chunk1.md`
- 필수 선행 항목: `step002`
- 산출물: `step_archive/step003_환경준비.md`
- 산출물: `step_archive/outputs/browser-backend.json`
- 네트워크: 조건부로 사용한다. 필요한 프로젝트 의존성을 설치할 때만 허용한다.
- 시각 검토: 필요하지 않다.

## 실행 역할

가능한 경우 환경 준비 실행자 역할과 환경 준비 독립 검증자 역할을 서로 나눈다.
실행자는 선언된 의존성의 확인과 필요한 준비만 수행하고, 독립 검증자는 작성 산출물을
수정하지 않는다. 위임 기능을 사용할 수 없으면 현재 실행자가 두 역할을 명확히 분리해
순서대로 수행하고, 별도 역할을 위임했다고 기록하지 않는다. 정상 권한 확인을 유지하고
자동 승인이나 권한 우회를 금지한다.

## 환경 확인과 설치

먼저 `step002_설계선택.md`, `step002_레이아웃설계_chunk1.md`,
`step002_전체설계_chunk1.md`가 같은 선택안을 가리키는지 확인한다. 프로젝트 루트에서
존재하는 모든 project manifest와 대응 lockfile을 식별하고, 선언된 package manager,
script, dependency와 현재 설치 상태를 읽는다. 없는 manifest나 lockfile을 발명하지
않고 서로 충돌하는 선언은 차단 사유로 기록한다.

선택된 설계에 필수인 프로젝트 의존성만 준비 대상으로 삼는다. 이미 선언되고 해석되는
의존성은 다시 설치하지 않는다. 누락된 필수 항목이 있을 때만 프로젝트가 선언한 package
manager의 명령을 제안하고 정상 권한 확인을 거쳐 실행한다. 각 항목은 최대 3회까지만
시도하며, 매 시도 뒤 실제 resolve, version, 최소 smoke 결과와 exit code를 확인한다.
세 번 안에 모두 검증되지 않거나 lockfile이 예상 밖으로 바뀌면 이 단계를 실패로 차단한다.

## 브라우저 검증 백엔드 선택과 고정

이 3단계는 현재 실행의 브라우저 검증 백엔드와 잠금 파일을 소유한다. 먼저 사용자·호스트의
브라우저 제한과 플러그인 `docs/BROWSER-TOOLS.md`를 확인하고 허용된 백엔드만 선택한다.
브라우저 검증 백엔드는 프로젝트 의존성이 아니며 별도 검증 체크아웃에서 확인한다.
이미 유효한 `step_archive/outputs/browser-backend.json`이 있으면 그 selected 값만 사용한다.
잠금 파일이 손상되거나 선택값이 현재 명시 제약과 충돌하면 추정하거나 다른 백엔드로
넘어가지 않고 차단한다.

잠금 파일이 없는 새 실행은 선택한 백엔드의 실제 가용성을 확인한 뒤 정상 권한 흐름으로
아래 probe를 실행해 현재 프로젝트에 고정한다. `selected`가 null이 아니고 명령 종료 코드가
0이며 저장한 selected·tool_version이 관측한 결과와 같아야 완료할 수 있다.

```text
node "<validation-checkout>/scripts/verify-output.mjs" --probe --backend <selected> --lock --workspace "<project-root>"
```

프로젝트에 존재하는 잠금 파일은 `--probe --workspace "<project-root>"`로 같은 백엔드를
재확인한다. probe는 CLI/package 가용성만 확인하므로 선택한 백엔드의 정상 작동도 실제
최소 smoke로 확인한다. Aside의 경우 실행 중인 앱/데몬에 연결되는지 확인한다. 사용 가능한
것처럼 추정하지 않으며 명령·버전·smoke 결과·종료 코드와 selected 값을 환경 보고서에 남긴다.
필수 가용성을 검증할 수 없으면 최대 3회 정상 권한의 필요한 복구만 시도한 뒤 차단한다.
다른 백엔드의 package나 browser binary를 설치하지 않고 사용자 승인 없는 백엔드 변경은
하지 않는다. 잠금 파일에는 비밀·원시 환경 변수·인증 정보를 기록하지 않는다.

이후 브라우저 검증(Step 15·20 포함)은 같은 잠금 파일만 사용한다. 환경 준비 보고서
`step_archive/step003_환경준비.md`와 잠금 JSON은 현재 실행의 필수 산출물이다.

`step_archive/step003_환경준비.md`에는 선택 설계 digest, 발견한 manifest와 lockfile,
필수 의존성 근거, 실행한 정확한 명령과 exit code, resolve 경로, version, smoke 결과,
변경된 선언 파일을 기록한다. 환경 변수 원문이나 credential은 기록하지 않는다.

## 독립 검증

독립 검증자는 설계에 없는 패키지가 추가되지 않았는지, 선언된 package manager와
lockfile이 유지됐는지, 모든 필수 항목의 resolve·version·smoke 증거가 일치하는지
처음부터 대조한다. 실패나 미확인을 `PASS`로 바꾸지 않는다.

## 완료 조건

- `browser-backend-lock`: 실제 가용성이 검증된 selected 백엔드 잠금 JSON이 현재 실행에 저장됐다.
- `bounded-browser-readiness`: 선택한 백엔드의 실제 readiness smoke와 관측 버전이 잠금·환경 보고서와 일치하며 미검증은 차단했다.

- `environment-preparation-report`: 환경 준비 보고서가 선언 경로에 존재한다.
- `selected-design-and-manifests`: 선택 설계와 실제 project manifest를 모두 대조했다.
- `required-dependencies-only`: 선택 설계에 필수인 의존성만 대상으로 삼았다.
- `bounded-resolution-smoke`: 모든 필수 항목이 제한된 시도 안에 검증됐다.
- `permission-preservation`: 조건부 설치가 정상 권한 흐름을 유지했다.

보고서와 검증 결과를 수락 증거로 제출하고 현재 단계에서 멈춘다. workflow 상태와
영수증만이 이후 진행을 소유한다.
