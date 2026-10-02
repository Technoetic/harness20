---
name: step021
persistence: session
---

# Step 21 - jscpd 코드 중복 베이스라인 수집

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-021.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step021_*.md` 저장 후 1줄 완료 보고 `Step 021/36 완료`.
>
> **모델 정책**: 구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step031 전)

## 실행 내용

`npx jscpd src/ --reporters json --output step_archive/jscpd-baseline/` 실행하여 현재 코드 중복률을 측정한다.

이 베이스라인을 이후 리팩토링/최적화 단계에서 비교 기준으로 사용한다.

## 결과 저장

- `step_archive/jscpd-baseline/` 디렉토리에 JSON 리포트 저장
- 중복률 요약을 `step_archive/step021_jscpd베이스라인.md`에 기록

서브에이전트는 항상 haiku를 사용한다.


## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- 불확실한 부분은 결정하고 `결정/사유: <결정> — <사유>` 줄로 기록한다(헌법 §1). N이면 재실행한다. 3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, 그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.

## 오류 발생 시

오류 발생 시 원인을 분석하고 수정한 뒤 재시도한다. 3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, 그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.


---

이 지침을 완료한 즉시 자동으로 step022.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.



## 정의별 입력·산출물 계약

- 입력: `step_archive/step020_파일인덱스_chunk1.md`
- 산출물: `step_archive/step021_jscpd베이스라인.md`

필수 수락 항목: `jscpd-baseline-summary`, `preimplementation-duplication-snapshot`, `optional-jscpd-disposition`, `duplication-fallback`
