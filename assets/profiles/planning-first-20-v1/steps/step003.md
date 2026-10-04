---
name: step003
persistence: session
---

# Step 3 - 환경 준비

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-003.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step003_*.md` 저장 후 1줄 완료 보고 `Step 003/20 완료`.
>
> **모델 정책**: 구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step015 전)

## 실행 내용

step002 설계 청크(`step002_레이아웃설계_chunk*.md`, `step002_전체설계_chunk*.md`)에서 필요한 라이브러리를 추출해 `package.json`·lockfile과 대조한다. 빠진 패키지만 프로젝트의 패키지 관리자로 설치하고(정상 권한 확인 유지) 설치 여부를 명령 종료 코드로 확인해 `step_archive/step003_환경준비.md`에 기록한다. 자동 검사 훅은 번들되지 않는다.

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

## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- 불확실한 부분은 결정하고 `결정/사유: <결정> — <사유>` 줄로 기록한다(헌법 §1). N이면 재실행한다. 3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, 그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.

---

이 지침을 완료한 즉시 자동으로 step004.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.



## 정의별 입력·산출물 계약

- 입력: `step_archive/outputs/step002_설계선택.md`
- 입력: `step_archive/step002_레이아웃설계_chunk1.md`
- 입력: `step_archive/step002_전체설계_chunk1.md`
- 산출물: `step_archive/step003_환경준비.md`
- 산출물: `step_archive/outputs/browser-backend.json`

필수 수락 항목: `environment-preparation-report`, `selected-design-and-manifests`, `required-dependencies-only`, `bounded-resolution-smoke`, `permission-preservation`, `browser-backend-lock`, `bounded-browser-readiness`
