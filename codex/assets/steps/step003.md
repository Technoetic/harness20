---
name: step003
phase: preflight
---

# Step 3 - 브라우저 자동화 환경 확인

## 목표

브라우저 검증 백엔드(docs/BROWSER-TOOLS.md: Aside CLI 또는 Playwright) 중 하나를 실제 명령 실행에
사용할 수 있는지 확인하고, 빈 페이지를 캡처한 PNG와 환경 보고서를 남긴다. PNG는 실행
증거이며 시각 품질 검토를 뜻하지 않는다. 선택한 백엔드는 프로젝트에 고정해 이후의 모든
브라우저 검증이 같은 백엔드를 사용하게 한다.

## 입력과 산출물

- 입력: `step_archive/step001_preflight.md`
- 필수 선행 항목: `step001`
- 산출물: `step_archive/step003_playwright_test.md`
- 산출물: `step_archive/screenshots/step003_playwright_smoke.png`
- 산출물: `step_archive/outputs/browser-backend.json`
- 네트워크: 패키지나 브라우저 설치가 필요할 때 사용할 수 있다.
- 시각 검토: 필요하지 않다.

## 실행

1. 프리플라이트 보고서에서 브라우저 검증 백엔드 상태를 확인한다.
2. `step_archive/screenshots` 디렉터리를 준비한다.
3. 검증 체크아웃 루트에서 다음 명령을 그대로 한 번 실행하고 출력 JSON(backends, selected,
   tool_version)을 보관한다.

```text
node scripts/verify-output.mjs --probe
```

4. probe가 백엔드를 선택하면 같은 체크아웃 루트에서 다음 명령으로 그 선택을 프로젝트에
   고정한다. 출력 JSON의 `lock`이 `step_archive/outputs/browser-backend.json`에 기록된
   내용(schema_version, selected, tool_version, probed_at)이다.

```text
node scripts/verify-output.mjs --probe --lock --workspace "<project-root>"
```

5. 고정된 백엔드로 빈 페이지(about:blank) smoke 캡처를
   `step_archive/screenshots/step003_playwright_smoke.png`에 저장한다 — 백엔드별 명령은
   docs/BROWSER-TOOLS.md 절차표('Screenshot' 행).

고정 파일이 있으면 `--backend` 없이 실행하는 이후의 브라우저 검증은 고정 backend만 사용하며,
사용할 수 없어도 다른 backend로 넘어가지 않는다. 백엔드를 의도적으로 바꿀 때만
`--backend <name>`을 더해 고정 명령을 다시 실행한다.

probe가 selected: null을 보고하면 비밀값을 제외한 오류 범주를 진단하고 docs/BROWSER-TOOLS.md에
따라 두 백엔드 중 하나만 준비한다: Aside CLI는 Aside 앱 실행 후 `aside --version`, Playwright는
검증 체크아웃의 `browser-verifier/`에서 `npm ci`와 Chromium 설치. probe가 이미 백엔드를
선택했으면 다른 backend의 package나 browser binary를 설치하지 않는다.

설치와 smoke 실행은 정상 권한 확인을 유지하며 최대 세 번까지만 시도한다. 제한된
재시도 뒤에도 실패하면 오류 범주와 사용자 조치를 보고서에 기록하고 완료 증거를
제출하지 않는다.

## 환경 보고서

`step_archive/step003_playwright_test.md`에 다음 내용을 기록한다.

- probe JSON: backends.playwright / backends.aside / selected / tool_version
- 고정 명령의 종료 코드와 `step_archive/outputs/browser-backend.json`의 selected, tool_version, probed_at
- smoke 명령과 종료 코드
- PNG 상대 경로, 존재 여부, 0보다 큰 파일 크기
- 재시도 횟수와 최종 결과
- 실패했다면 비밀값이 제거된 오류 범주

## 완료 조건

- `browser-backend-probe`: 선언된 probe 명령이 종료 코드 0으로 끝나고 selected 백엔드를 보고한다.
- `browser-backend-lock`: 고정 파일이 선언된 경로에 있고 selected가 probe 결과와 같다.
- `browser-smoke-screenshot`: PNG가 선언된 경로에 존재하며 비어 있지 않다.
- `browser-environment-report`: 환경 보고서가 probe 결과와 smoke 결과를 기록한다.

검증 결과를 수락 증거로 제출하고 이 단계에서 멈춘다.
