---
name: step031
persistence: session
---

# Step 31 - 환경 준비

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-031.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step031_*.md` 저장 후 1줄 완료 보고 `Step 031/50 완료`.
>
> **모델 정책**: 조사·구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step045 전)

## 실행 내용

step030 설계 청크(`step030_레이아웃설계_chunk*.md`, `step030_전체설계_chunk*.md`)에서 필요한 라이브러리를 추출해 `package.json`·lockfile과 대조한다. 빠진 패키지만 프로젝트의 패키지 관리자로 설치하고(정상 권한 확인 유지) 설치 여부를 명령 종료 코드로 확인해 `step_archive/step031_환경준비.md`에 기록한다. 자동 검사 훅은 번들되지 않는다.

## 브라우저 검증 백엔드 유지

브라우저 검증 백엔드는 프로젝트 의존성이 아니다. Step 3이 `step_archive/outputs/browser-backend.json`에 고정한 백엔드를 그대로 유지하고, 다른 백엔드의 package나 browser binary(Playwright·Chromium 또는 Aside CLI)를 설치하지 않는다.

잠금 파일이 없는 기존 프로젝트는 `step_archive/step003_playwright_test.md`에 기록된 selected 값으로 검증 체크아웃에서 `node scripts/verify-output.mjs --probe --backend <selected> --lock --workspace "<project-root>"`를 한 번 실행해 고정한다. 그 백엔드를 지금 사용할 수 없으면 그 백엔드만 복구한다.

## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- N 또는 불확실한 부분이 있으면 재실행한다. 3회 재시도 후에도 미달이면 오류 기록 후 다음 Step 진행.

---

이 지침을 완료한 즉시 자동으로 step032.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.


