# 참조되지만 번들되지 않는 검증기 (retired / 수동 폴백)

harness50의 옛 step 본문은 아래 `*-validator.ps1` / `*-checker.ps1` 스크립트 실행을
지시했지만, **플러그인은 이들을 번들하지 않는다.** 과거 원본 프로젝트(`.claude/hooks/`)에서
개발용으로 쓰이던 검증기들의 잔존 참조였다. 현재 step 본문은 이 검증기를 지시하지 않는다.
배포 플러그인의 `hooks/`에는 다음 3개만 실존한다:

- `mx-tag-validator.ps1` / `.sh` (PostToolUse 바인딩)
- `trust5-validator.ps1` / `.sh` (Stop 바인딩)
- `html-bundler.ps1` / `.sh` (새36의 step026, legacy50의 step038에서 호출, 부트스트랩 시 `step_archive/tools/`로 복사)

## 정책 (약속-실제 정합, 2026-07 평가 반영)

- **현재 step 본문**은 아래 검증기를 지시하지 않는다. 대응 CLI를 직접 확인한다
  (8~15단계는 `npx --no-install <bin> --version` 등). 선택 도구(jscpd·semgrep·tokei·madge)를
  쓸 수 없으면 `SKIP`과 사유를 기록한다. 청크 규칙(500줄 이하, BOM 없음)도 직접 확인한다.
- **업그레이드 전 실행의 옛 본문**: `webapp-trigger`는 없는 본문만 `step_archive/archived/`로
  복사하고 `/harness-reset`도 archived/를 보존한다. 그래서 업그레이드 전에 복사된 옛 본문은
  여전히 아래 검증기를 지시한다. 그 검증기가 없으면 **그 검증은 건너뛴다(fail-open)**.
  자율주행이 이로 인해 멈추지 않는다.
- 실제 품질 검증이 필요하면 사용자가 대응 **CLI를 수동 실행**한다. 대부분 표준 도구다:
  - `tokei` (LOC), `c8` (커버리지), `@biomejs/biome` (lint/format), `stylelint`,
    `semgrep` (보안), 브라우저 백엔드 + `axe-core` (E2E/접근성 — [BROWSER-TOOLS.md](BROWSER-TOOLS.md)),
    `jscpd` (중복), `madge`/`knip` (데드코드/의존성), `@lhci/cli` (Lighthouse)
- 이 목록은 `AGENTS.md`의 "프로젝트 의존성(1회)" 설치 명령과 일치한다. 브라우저 도구는
  Playwright(`browser-verifier/`) 또는 Aside CLI 중 PC가 허용하는 쪽을 쓴다.

## 옛 본문이 참조하던 미번들 스크립트 (24종, 이력)

| 스크립트 | 대응 실제 도구 | 참조 step(예) |
|:---|:---|:---|
| tokei-validator.ps1 | `tokei` | step011 |
| dependency-checker.ps1 | `madge` / `knip` | step031 |
| research-chunk-validator.ps1 | (청크 줄 수·BOM 직접 확인 — chunk-writer 스킬 `### 검증`) | 조사 step 다수 |
| research-validator.ps1 | (수동 검토) | 조사 step |
| build-validator.ps1 | `html-bundler.ps1` + 브라우저 백엔드(`verify-output.mjs`) | step038 (본문에 retired 명시됨) |
| c8-validator.ps1 | `c8` | 디버깅 step |
| biome-validator.ps1 / linting-validator.ps1 / formatting-validator.ps1 | `biome check` | 구현 step |
| stylelint-validator.ps1 | `stylelint --fix` | CSS step |
| semgrep-validator.ps1 | `semgrep --config=auto` | 보안 step |
| playwright-validator.ps1 / e2e-validator.ps1 / ui-regression-validator.ps1 | 프로젝트의 `npm run e2e` (백엔드는 [BROWSER-TOOLS.md](BROWSER-TOOLS.md)) | 검증 step |
| accessibility-validator.ps1 / axe-core-validator.ps1 | `axe-core` (브라우저 백엔드가 주입) | 접근성 step |
| jscpd-validator.ps1 | `jscpd` | 중복 검사 step |
| madge-validator.ps1 / knip-validator.ps1 / deadcode-validator.ps1 | `madge` / `knip` | 데드코드 step |
| lhci-validator.ps1 / load-test-validator.ps1 | `@lhci/cli` | 성능 step |
| type-safety-validator.ps1 | `tsc --noEmit` | 타입 step |
| refactoring-validator.ps1 / step03-validator.ps1 | (수동 검토) | 리팩터/조사 step |

> **정직성 노트**: 현재 step 본문은 위 CLI 직접 확인으로 치환됐다. 옛 본문에 한해 부재를
> 감추지 않고 fail-open으로 명시한다.
