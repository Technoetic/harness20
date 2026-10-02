---
name: step005
persistence: session
---

# Step 5 - c8 코드 커버리지 환경 설치

c8은 1단계와 동일하게 선택 도구다. `step_archive/step001_preflight.md`의 결과를 읽는다.
사용 가능하면 `npx c8 --version`을 실행하고 종료 코드와 버전을 기록한다.
없으면 정상 권한 확인 아래 설치·검증을 최대 3회 시도할 수 있다. 이미 근거 있는 SKIP이면 재설치를 강제하지 않는다.
`step_archive/step005_c8_test.md`에 OK 또는 이유가 있는 SKIP, 시도 횟수와 대안을 기록한다.
SKIP이면 6단계에서 선택한 Vitest coverage-v8 또는 Jest coverage로 실제 측정한다.
이후 품질 게이트의 측정 커버리지 요건은 생략할 수 없다. c8 전용 Hook 성공을 완료 필수 조건으로 삼지 않는다.
보고서와 대안이 확인된 경우에만 완료하고 step006.md로 진행한다.

## 정의별 입력·산출물 계약

- 입력: `step_archive/step001_preflight.md`
- 산출물: `step_archive/step005_c8_test.md`

필수 수락 항목: `c8-disposition`, `c8-environment-report`
