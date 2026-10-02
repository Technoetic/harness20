---
name: step006
persistence: session
---

# Step 6 - Vitest/Jest 유닛 테스트 러너 환경 설치

<!-- MOAI-ENRICHED v1 -->
> **🛠 TOOLING STEP** — 외부 도구 설치/검증. Plan-Run-Sync 분리 미적용.
> 모델 정책: **haiku** (조사·설치).
> SPEC 자동 생성: step_archive/specs/SPEC-006.md (Stop hook).

프로젝트의 빌드 도구를 분석하여 적합한 테스트 러너를 설치한다.

## 설치 판단 기준

1. `package.json`에서 빌드 도구 확인
   - **Vite 기반** → `vitest` 설치
   - **Webpack/CRA 기반** → `jest` + `ts-jest` 설치
   - **판단 불가** → `vitest` 설치 (경량, 설정 최소)

2. 이미 설치되어 있으면 건너뛴다

## Vitest 설치 시

```bash
npm install -D vitest @vitest/coverage-v8
```

## Jest 설치 시

```bash
npm install -D jest ts-jest @types/jest
```

## 설치 확인

```bash
## Vitest
npx vitest --version

## Jest
npx jest --version
```

설치 확인 후 버전 번호가 출력되면 성공이다.

서브에이전트는 항상 haiku를 사용한다.

## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- 불확실한 부분은 결정하고 `결정/사유: <결정> — <사유>` 줄로 기록한다(헌법 §1). N이면 재실행한다. 3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, 그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.

## 프리플라이트 인계 확인

1단계의 러너 항목은 설치 현황 조사이며 선택은 이 단계에서 확정한다. 기존 테스트와 호환되는 러너를 우선하고 선택하지 않은 러너는 설치하지 않는다. 5단계에서 c8을 SKIP했다면 Vitest의 coverage-v8 또는 Jest coverage 실행 설정과 이후 실제 측정 명령을 환경 보고서에 기록한다. 커버리지 도구 선택이 품질 게이트의 측정 요건을 없애지 않는다.

---

이 지침을 완료한 즉시 자동으로 step007.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.


## 정의별 입력·산출물 계약

- 입력: `package.json`
- 입력: `step_archive/step001_preflight.md`
- 산출물: `step_archive/step006_test_runner_test.md`

필수 수락 항목: `test-runner-version`, `test-runner-environment-report`, `test-runner-selection`
