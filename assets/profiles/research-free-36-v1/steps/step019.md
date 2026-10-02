---
name: step019
persistence: session
---

# Step 19 - 환경 준비

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-019.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step019_*.md` 저장 후 1줄 완료 보고 `Step 019/36 완료`.
>
> **모델 정책**: 구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step031 전)

## 실행 내용

step018 설계 청크(`step018_레이아웃설계_chunk*.md`, `step018_전체설계_chunk*.md`)에서 필요한 라이브러리를 추출해 `package.json`·lockfile과 대조한다. 빠진 패키지만 프로젝트의 패키지 관리자로 설치하고(정상 권한 확인 유지) 설치 여부를 명령 종료 코드로 확인해 `step_archive/step019_환경준비.md`에 기록한다. 자동 검사 훅은 번들되지 않는다.

## 브라우저 검증 백엔드 유지

브라우저 검증 백엔드는 프로젝트 의존성이 아니다. Step 3이 `step_archive/outputs/browser-backend.json`에 고정한 백엔드를 그대로 유지하고, 다른 백엔드의 package나 browser binary(Playwright·Chromium 또는 Aside CLI)를 설치하지 않는다.

잠금 파일이 없는 기존 프로젝트는 `step_archive/step003_playwright_test.md`에 기록된 selected 값으로 검증 체크아웃에서 `node scripts/verify-output.mjs --probe --backend <selected> --lock --workspace "<project-root>"`를 한 번 실행해 고정한다. 그 백엔드를 지금 사용할 수 없으면 그 백엔드만 복구한다.

## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- 불확실한 부분은 결정하고 `결정/사유: <결정> — <사유>` 줄로 기록한다(헌법 §1). N이면 재실행한다. 3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, 그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.

---

이 지침을 완료한 즉시 자동으로 step020.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.



## 정의별 입력·산출물 계약

- 입력: `step_archive/outputs/step018_설계선택.md`
- 입력: `step_archive/step018_레이아웃설계_chunk1.md`
- 입력: `step_archive/step018_전체설계_chunk1.md`
- 산출물: `step_archive/step019_환경준비.md`

필수 수락 항목: `environment-preparation-report`, `selected-design-and-manifests`, `required-dependencies-only`, `bounded-resolution-smoke`, `permission-preservation`
