---
name: step004
phase: preflight
---

# Step 4 - 접근성 검사(axe) 환경 확인

## 목표

검증 체크아웃에서 접근성 엔진 `axe-core`를 해석할 수 있고 선택한 브라우저 검증 백엔드
(docs/BROWSER-TOOLS.md: Playwright는 AxeBuilder, Aside는 로컬 서버에서 axe.min.js 주입)와
호환되는지 확인한다.

## 입력과 산출물

- 입력: `step_archive/step003_playwright_test.md`
- 필수 선행 항목: `step003`
- 산출물: `step_archive/step004_axe_core_test.md`
- 네트워크: 패키지 설치가 필요할 때 사용할 수 있다.
- 시각 검토: 필요하지 않다.

## 실행

1. 브라우저 환경 보고서가 selected 백엔드를 기록했는지 확인한다.
2. 검증 체크아웃 루트에서 다음 명령을 그대로 실행한다.

```text
node -e "require.resolve('axe-core')"
```

패키지를 해석할 수 없으면 검증 체크아웃에서 다음 설치 명령을 독립적으로 실행할 수 있다.

```text
npm install --save-dev --save-exact axe-core@4.13.0 --ignore-scripts
```

정상 권한 확인을 유지하며 설치와 확인을 최대 세 번까지만 시도한다. 설치된 axe-core
버전과 선택 백엔드의 주입 방식(docs/BROWSER-TOOLS.md 절차표 'axe WCAG A/AA' 행)을
비교하고, 접근성 검사 모듈을 불러올 수 있는지 확인한다. 호환되지 않으면 근거와 필요한 사용자 조치를 기록하고 완료하지
않는다.

## 환경 보고서

`step_archive/step004_axe_core_test.md`에 다음 내용을 기록한다.

- 패키지 해석 명령과 종료 코드
- 설치된 패키지 버전
- axe-core 버전, 선택 백엔드와 호환성 판단 근거
- 재시도 횟수와 최종 결과
- 실패했다면 비밀값이 제거된 오류 범주

## 완료 조건

- `axe-package-resolves`: 선언된 패키지 해석 명령이 종료 코드 0으로 끝난다.
- `axe-environment-report`: 환경 보고서가 존재한다.
- `axe-backend-compatibility`: 선택한 브라우저 검증 백엔드와의 호환성이 근거와 함께 확인된다.

검증 결과를 수락 증거로 제출하고 이 단계에서 멈춘다.
