---
name: step001
persistence: session
---

# Step 1 - 하네스 프리플라이트 체크

<!-- MOAI-ENRICHED v1 -->
> **🛠 TOOLING STEP** — 외부 도구 설치/검증. Plan-Run-Sync 분리 미적용.
> 모델 정책: **haiku** (조사·설치).
> SPEC 자동 생성: step_archive/specs/SPEC-001.md (Stop hook).

모든 도구 설치 검증, progress.json 상태 확인(읽기만), .claude/ 경로 치환 맵을 확인한다.
**또한 `/webapp <주제>`가 `step_archive/TOPIC/TOPIC.md`의 `session_prompt`에 기록한 원문에서 튜토리얼 주제를 추출하여 같은 파일에 고정한다 (이후 모든 Step이 참조).**

## 실행 내용

### 0. 튜토리얼 주제 픽업 (TOPIC.md 생성)

**이 Step의 가장 먼저 수행해야 할 작업이다.**

`step_archive/TOPIC/TOPIC.md`의 `session_prompt` 블록에서 다음 항목을 추출한다:

- **주제(topic)**: 한 줄. 예) "데이터 압축과 부호화", "이미지 처리 알고리즘", "정규식 기초".
- **타깃 사용자(audience)**: "초보자 학습용" / "중급 개발자" 등.
- **인터랙티브 요구(interactive)**: 사용자가 명시한 경우 "필수" 등.
- **참고 사례(real_world_apps)**: "대중 앱 사례 참고" 등 사용자가 적시한 가이드.
- **기타 제약(constraints)**: "직관적", "단일 HTML", "다국어" 등.
- **화면 주소 기본 계약**: 단일 HTML 안에서도 독립 화면마다 고유 URL을 부여한다.
  기본은 hash 라우팅이다. 플러그인의 `docs/ROUTING.md`를 참조하고 이 계약을
  기획·설계·구현·E2E에 전달한다. 실제 단일 화면이면 하나만 선언하며 화면을 발명하지 않는다.
  URL 형식과 구현 backend를 구분한다. HTTP(S)에서 실제 사용 가능한 Navigation API를
  우선 선택하고 미지원 환경은 선언한 URL 모드에 맞는 기존 History API/hash로 처리한다.
  파일 직접 열기를 지원하려면 hash manifest를 선택한다. history manifest는 HTTP(S)가
  필요하며 실행 환경에 따라 mode를 암묵 변환하지 않는다. 정상 브라우저와 API 비가용
  환경 모두 검증한다.

**`step_archive/TOPIC/TOPIC.md`** 파일을 다음 형식으로 작성한다 (`created`와 `session_prompt`는 바이트 그대로 두고 그 아래 필드만 채워 다시 쓴다):

```markdown
---
created: <YYYY-MM-DD>
session_prompt: |
  <사용자 원문 프롬프트 전문 - 줄바꿈 그대로 보존>
---

# 튜토리얼 주제

- topic: <한 줄 요약>
- audience: <타깃>
- interactive: <필수/선택>
- real_world_apps: <참고 사례>
- constraints:
  - <제약 1>
  - <제약 2>
  - 디자인 제외(사용자): <사용자가 빼 달라고 한 시각 스타일 원문. 없으면 이 줄을 쓰지 않는다>
  - 디자인 제외(하네스 기본, 설계가 채택 사유를 기록하면 예외): 크림·오프화이트 페이지 바탕 / 제목 속 이탤릭 강조어 / 01·02·03 장식 번호 섹션 라벨 / 코드 밖 모노스페이스 라벨 / 알약형 버튼 / 맹목적 Inter·Roboto·Arial / 보라 계열 그라데이션 배경 / 무조건 중앙정렬 카드 / 과도한 border-radius / 획일적 단색 배경

## 세부 의도

<2~5줄로 사용자 의도 정리>

## 후속 Step에서 본 파일을 참조하는 위치

- step017 (기획): 주제·타깃·제약을 기획 입력으로 사용
- step018 (통합 설계): 인터랙티브 요구와 디자인 제약 반영, 디자인 제외 줄을 설계 계약 exclude로 고정
- step025 (구현): 단일 HTML/번들 구조 결정에 반영
```

**디자인 제외 줄:** `constraints`의 마지막 줄은 위 `디자인 제외(하네스 기본, …)` 줄을 글자 그대로 둔다. 사용자 프롬프트가 빼 달라고 한 시각 스타일이 있으면 그 앞 `디자인 제외(사용자):` 줄에 원문대로 옮긴다. 사용자가 기본 목록의 스타일을 직접 요구하면(예: 크림색 종이 느낌) 기본 줄은 그대로 두고 그 요구를 일반 제약 줄로 옮긴다. 18단계가 그 요구를 채택 사유로 기록한다. 아래 규칙으로 기존 TOPIC.md를 그대로 두는 경우에도 기본 줄이 없으면 추가한다.

**사용자 프롬프트가 명확하지 않은 경우에도 질문하지 않는다.** 헌법 §1에 따라 즉시 결정·기록한다. 모호한 항목은 "결정/사유" 줄에 1줄로 남긴다.

**`topic`~`constraints` 필드가 이미 채워져 있고 `session_prompt`와 모순되지 않으면** 그대로 둔다 (같은 주제로 재진입할 때 손실 방지).

### 1. 도구 설치 일괄 검증

다음 도구가 설치되어 있는지 확인한다. 미설치 시 자동 설치를 시도한다 (최대 3회 재시도).

| 도구 | 확인 명령 | 설치 명령 | 필수/선택 |
|:---|:---|:---|:---|
| Node.js | node --version | - | 필수 |
| npm | npm --version | - | 필수 |
| 브라우저 검증 백엔드 (docs/BROWSER-TOOLS.md: Aside CLI 또는 Playwright) | 플러그인 체크아웃에서 node scripts/verify-output.mjs --probe (selected != null, 종료 코드 0) | docs/BROWSER-TOOLS.md 절차대로 백엔드 준비 (Aside: 앱 실행 + aside --version / Playwright: browser-verifier/ 에서 npm ci 후 chromium 설치) | 필수 |
| Biome | npx --no-install @biomejs/biome --version | npm i -D @biomejs/biome | 필수 |
| Stylelint | npx stylelint --version | npm i -D stylelint | 필수 |
| Vitest/Jest | package.json·lockfile 설치 현황 조사 | 6단계 선택 후 설치 | 조사 |
| c8 | npx c8 --version | npm i -D c8 | 선택 |
| jscpd | npx jscpd --version | npm i -D jscpd | 선택 |
| madge | npx madge --version | npm i -D madge | 선택 |
| tokei | tokei --version | scoop install tokei | 선택 |
| semgrep | semgrep --version | pip install semgrep | 선택 |

### 2. 실패 처리 정책

- **필수 도구 실패**: 서로 다른 조치로 3회 시도해도 실패하면 결과 파일에 기록하고 헌법 §2-1 `required-tool-failed` 명명된 멈춤으로 끝낸다. 다음 Step으로 가지 않는다.
- **선택 도구 실패**: `SKIP`과 사유를 기록하고 계속 진행한다. 해당 도구가 필요한 Step은 `SKIP`과 대체 방법을 기록한다.

### 3. progress.json 상태 확인 (읽기 전용)

`/webapp <주제>`가 만든 step_archive/progress.json을 읽어 NEW/RESUMED를 확인한다. 이 파일은 직접 만들거나 고치지 않는다(완료는 Stop 훅, 멈춤은 `scripts/harness-pause.mjs`만 기록한다). 없으면 결과 파일에 `progress.json 없음 — /webapp 부트스트랩 미실행`을 적는다.

### 4. .claude/ 경로 치환 맵 확인

이후 Step에서 .claude/에 저장하라는 지시가 있으면 step_archive/로 경로를 치환한다.
치환 규칙:
- .claude/xxx.md -> step_archive/xxx.md
- step_archive/screenshots/ -> step_archive/screenshots/
- step_archive/ -> step_archive/ (이중 경로 방지)

### 5. 결과 기록

검증 결과를 step_archive/step001_preflight.md에 저장한다:
- 도구별 설치 상태 (OK/FAIL/SKIP)
- progress.json 상태 (NEW/RESUMED from stepNNN)
- 총 소요 시간

서브에이전트는 항상 haiku를 사용한다.

## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- 불확실한 부분은 결정하고 `결정/사유: <결정> — <사유>` 줄로 기록한다(헌법 §1). N이면 재실행한다. 3회 재시도 후에도 해결되지 않으면 오류·미해결 항목·다음 검사를 현재 Step 결과 파일에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지하고 헌법 §2-1 명명된 멈춤으로 끝낸다(필수 도구 실패 `required-tool-failed`, 권한 거부 `permission-denied`, 그 밖의 한도 소진 `required-input-missing`). 선택 도구를 쓸 수 없는 것은 미달이 아니다 — `SKIP`과 사유를 기록한다.

## 테스트 러너와 커버리지 인계

1단계는 Vitest/Jest를 강제 설치하지 않는다. 6단계에서 기존 프로젝트와 빌드 근거로 러너를 선택한 다음 선택한 러너만 필수로 설치·검증한다. c8은 5단계에서도 선택 사항이다. c8의 SKIP은 커버리지 측정 면제가 아니다. 6단계의 Vitest coverage-v8 또는 Jest coverage를 사용하여 이후 품질 게이트의 실제 측정 보고서를 생성해야 한다.

---

이 지침을 완료한 즉시 자동으로 step002.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.

## 정의별 입력·산출물 계약

- 입력: `step_archive/TOPIC/TOPIC.md`
- 산출물: `step_archive/step001_preflight.md`

필수 수락 항목: `topic-contract`, `preflight-report`, `node-runtime-version`, `npm-cli-version`, `required-tool-inventory`, `optional-tool-disposition`
