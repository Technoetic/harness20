---
name: step003
persistence: session
---

# Step 3 - 브라우저 자동화 환경 확인

<!-- MOAI-ENRICHED v1 -->
> **🛠 TOOLING STEP** — 외부 도구 설치/검증. Plan-Run-Sync 분리 미적용.
> 모델 정책: **haiku** (조사·설치).
> SPEC 자동 생성: step_archive/specs/SPEC-003.md (Stop hook).

**확인 명령**: 플러그인 체크아웃에서 `node scripts/verify-output.mjs --probe` — 가용 백엔드(Aside CLI 또는 Playwright)를 JSON으로 보고한다 (docs/BROWSER-TOOLS.md)

**백엔드 고정 명령**: probe가 백엔드를 선택하면 같은 체크아웃에서 `node scripts/verify-output.mjs --probe --lock --workspace "<project-root>"`를 실행해 그 선택을 프로젝트의 `step_archive/outputs/browser-backend.json`에 고정한다 (schema_version, selected, tool_version, probed_at). 이후 `--backend` 없이 실행하는 모든 브라우저 검증(Step 45·50 포함)은 이 고정 백엔드만 사용하며, 사용할 수 없어도 다른 백엔드로 넘어가지 않는다. 백엔드를 의도적으로 바꿀 때만 `--backend <name>`을 더해 고정 명령을 다시 실행한다.

## 검증

`--probe`와 고정 명령 실행 후 다음을 확인:
- `step_archive/step003_playwright_test.md` 파일 생성 확인 (probe JSON의 backends.playwright / backends.aside / selected / tool_version, 고정 명령의 종료 코드와 `step_archive/outputs/browser-backend.json` 경로·내용 기록)
- `step_archive/outputs/browser-backend.json` 존재 확인 (`selected`가 probe의 selected와 같음)
- `--probe` 종료 코드 확인 (0: selected 백엔드 있음, 1: 가용 백엔드 없음)

**검증 실패 시:**
1. `--probe` 출력 JSON 분석
2. 에러 원인 파악 (가용 백엔드 없음: Aside 앱 미실행·aside CLI 없음, 또는 browser-verifier/ 미설치 등 — docs/BROWSER-TOOLS.md)
3. 필요한 조치 수행 — 백엔드는 하나만 준비한다. probe가 이미 백엔드를 선택했으면(예: Aside 사용 가능) 다른 백엔드의 package나 browser binary(Playwright·Chromium 등)를 추가로 설치하지 않는다
4. `--probe`와 고정 명령 재실행
5. 검증 통과할 때까지 반복

서브에이전트는 항상 haiku를 사용한다.

## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- 불확실한 부분은 결정하고 `결정/사유: <결정> — <사유>` 줄로 기록한다(헌법 §1). N이면 재실행한다. 3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, 그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.

---

이 지침을 완료한 즉시 자동으로 step004.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.

