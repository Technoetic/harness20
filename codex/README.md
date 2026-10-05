# harness20 for Codex

Harness20의 Codex 어댑터는 기획부터 시작하는 기본20 절차를 20개의 검증 가능한 단계로 실행하되, Codex의 정상 권한 확인과 명시적인 후크 신뢰 절차를 유지합니다. Claude Code 설치와 기존 동작은 [루트 안내서](../README.md)를 참고하세요.

## Workflow profiles / 새20와 기존36·50

공개 저장소·플러그인·마켓플레이스 이름은 **harness20**입니다. Claude Code는 `/harness20:webapp <주제>`, Codex는 `$harness20:webapp <주제>`로 시작합니다. 새 실행은 schema2·`planning-first-20-v1`의 **20단계**를 선택합니다. 기존36의 17단계 요구사항 기획을 새1로 삼고 앞의 1–16단계를 새 실행에서 제거했습니다.

초기화 관리자가 사용자 원문과 명시 조건을 TOPIC의 여섯 필드로 보존합니다.
Codex는 `state.topic_sha256`에 TOPIC 해시를 고정하고 관리자가 현재 바이트를 검증합니다.
새 Claude 실행은 원문·여섯 필드를 보존하고 원문 TOPIC 해시를 자동 고정·검증합니다.
과거 미표식 Claude 바인딩은 호환 실행이며 새 정책의 자동 고정이 적용됐다고 표시하지 않습니다.
첫 기획은 TOPIC·명시 제공 자료를 검토하며 삭제된 프리플라이트·도구·의존성 게이트 산출물을
요구하지 않습니다. 입력은 사용자 요구, TOPIC, 제공 자료, **2단계 설계 계약**과 현재 측정 출력입니다.
필수 API 대상·버전·스키마·인증·오류/재시도 계약이 없으면 누락 요구사항으로 남깁니다.
이전 단계 완료를 만들어 내거나 테스트 통과를 외부 사실의 최신성 증명으로 쓰지 않습니다.

명시적 `research-free-36-v1`은 36단계와 기존 기획17·설계18·구현25·E2E31·최종36을,
`legacy-50-v1`과 프로필 없는 schema-v1 이력은 원래50단계를 유지합니다. 진행 중·멈춤·차단·완료,
Claude 가져오기, archived 본문, 복구와 영수증 replay의 번호·해시·의미를 보존합니다.
기존 이력을 새 번호나 새 증거로 바꾸지 않습니다. Codex reset은 제어 메타데이터를 보관하고
비활성화하며 다음 명시적 시작이 기본20을 선택합니다. Claude reset은 선택 프로필을 보존하고
새 실행 경계에서 멈춥니다. 손상된 메타데이터/바인딩은 일관된 기록을 복원한 뒤 재시도하며
reset으로 추정 복구하지 않습니다.

새 본문: Claude `assets/profiles/planning-first-20-v1/steps/`,
Codex `codex/assets/profiles/planning-first-20-v1/steps/`입니다. 기존36은 각 호스트의
`assets/profiles/research-free-36-v1/steps/`, legacy50은 `assets/steps/`를 유지합니다.
Codex는 `begin.step_target`을 플러그인 루트 기준으로 읽고, Claude는 resolver의 `step_body`와
`body_directory`를 읽습니다. 새 Claude archive는 `step_archive/profiles/planning-first-20-v1/archived/`,
기존36 archive는 `step_archive/profiles/research-free-36-v1/archived/`이며 바인딩은
`step_archive/workflow-profile.json`입니다. 프로필·개수·본문·바인딩 불일치는 실행을 차단합니다.
상태·완료 인계의 분모와 QA/Jev 증거 경로는 선택된 프로필과 실행 세대에서 가져옵니다.

새20의 기획1·설계2 뒤 환경 준비3이 실제 가용 브라우저 백엔드 확인과 잠금을 맡습니다.
기존36·50의 도구3과 환경19·31은 원래 의미를 유지합니다. 새20 품질 게이트는 **10·14·20**,
독립 QA는 **11·16·17·18**, E2E는 **15**, 최종 설계는 **19**입니다.
Jev 체크포인트는 **1·2·9·15·19**이며, 최대5라운드·필수 finding·접근성·키보드·마우스·회귀
검증은 그대로 요구합니다. 기획부터 시작해도 권한이나 완료 기준을 완화하지 않습니다.

| New | Original | Role |
| --- | --- | --- |
| 1 | 25 | Requirements-based planning |
| 2 | 30 | Integrated design |
| 3 | 31 | Environment and browser backend |
| 4 | 32 | File allocation and index |
| 5 | 33 | Duplication baseline |
| 6 | 34 | Unused-code baseline |
| 7 | 35 | Context policy |
| 8 | 36 | Encoding policy |
| 9 | 37 | Implementation |
| 10 | 38 | Build smoke and quality round 1 |
| 11 | 39 | Independent layout verification |
| 12 | 41 | JavaScript modules |
| 13 | 42 | CSS separation |
| 14 | 44 | Routing integration and quality round 2 |
| 15 | 45 | E2E |
| 16 | 46 | Independent screenshot E2E |
| 17 | 47 | Independent keyboard visual verification |
| 18 | 48 | Independent mouse visual verification |
| 19 | 49 | Final design verification |
| 20 | 50 | Console, final build and full regression; quality round 3 |


## Host commands / 호스트 명령

| Host | Start | Status | Reset |
|---|---|---|---|
| Claude Code | `/harness20:webapp <topic>` | `/harness20:harness-status` | `/harness20:harness-reset` |
| Codex | `$harness20:webapp <topic>` | `$harness20:harness20-status` | `$harness20:harness20-reset` |

짧은 이름도 사용할 수 있습니다: Claude Code의 `/webapp`, `/harness-status`, `/harness-reset`과 Codex의 `$webapp`, `$harness20-status`, `$harness20-reset`. 각 시작 명령에는 주제를 붙입니다.

Codex does not provide a `/webapp` slash command. 진행 중인 Codex 워크플로를 이어가려면 `$webapp resume`, 자동 이어가기를 일시 정지하려면 `$webapp pause`를 사용하세요.

플러그인 이름을 포함한 `$harness20:webapp`, `$harness20:harness20-status`, `$harness20:harness20-reset`도 지원합니다. 하위 에이전트의 요청은 부모 워크플로를 일시정지하지 않습니다.

Codex는 설치할 때 Claude Code `commands/*.md`의 일부를 `source-command-<이름>` 스킬로 바꿔 플러그인 캐시(`.codex-plugin/migrated-command-skills/`)에 둘 수 있습니다. 이 변환은 호스트 동작이며, 어떤 명령이 바뀌는지는 Codex 버전과 명령 내용에 따라 다릅니다(관측: 2.10.0 설치에서는 reset·resume, 2.9.0에서는 reset·status). Codex에서는 위 표의 스킬과 `$webapp pause`·`$webapp resume`을 사용하세요. 이관된 스킬이 선택되어도 다섯 Claude 명령은 모두 Codex 작업 공간(`step_archive/.harness50-codex/state.json`)을 먼저 확인하므로, 그 공간에서는 Claude `progress.json`과 TOPIC을 만들거나 바꾸지 않고, Codex 명령을 안내하거나 Codex 상태 관리자 절차를 따릅니다.

## Jev-first direct questions

When requested, Jev-first applies to every eligible typed judgment, including chat
and arithmetic outside the selected workflow checkpoints. Standing authorization for
selected ordinary nonsecret input is reused without a prompt for every question.
The webapp skill also activates for a direct Jev question or an authorized standing
Jev-first preference; no `$webapp` start command or workflow initialization is needed.
The direct `scripts/jev-ask.mjs prepare|run --input -` CLI needs no workflow or source
file; `run` also requires `--allow-network`. It preserves native Noul, abstaining
Choice and ordered-rubric Score results. File-derived reviews retain their existing
source-bound adapters and reports. Free generation, observation and actual tools
remain host work; unsupported or unavailable results receive a visible fallback
reason. No Jev result completes a step or replaces required tests or permissions.
See the [direct question guide](../docs/jev-first.md) for the JSON contract and limits.

## Codex installation / 설치

### Local checkout

현재 브랜치의 Codex 지원을 확인하려면 저장소를 체크아웃한 뒤 그 루트를 로컬 마켓플레이스로 등록합니다.

```text
codex plugin marketplace add <path-to-harness20>
codex plugin add harness20@harness20
```

### GitHub source

공개 저장소에서 다음 경로로 설치할 수 있습니다.

```text
codex plugin marketplace add Technoetic/harness20
codex plugin add harness20@harness20
```

The published repository includes both Claude Code and Codex adapters. 어느 경로를 사용하든 설치만으로 후크가 신뢰되지는 않습니다.

### Remove / 제거

```text
codex plugin remove harness20@harness20
```

이 명령은 로컬 설정과 캐시에서 플러그인을 지웁니다. 마켓플레이스 등록까지 지우려면 이어서 `codex plugin marketplace remove harness20`을 실행합니다. 진행 중인 워크플로는 캐시 안의 `codex/scripts/harness-state.mjs`를 쓰므로, 제거하거나 `codex plugin add`로 갱신하기 전에 `$webapp pause`로 멈추거나 워크플로를 완료하세요. 갱신도 이전 버전의 캐시를 지웁니다.

## Permissions and continuation / 권한과 이어가기

- Normal Codex permission confirmations remain in effect for every command.
- Harness20 never auto-approves commands and never changes sandbox or approval settings.
- Each later turn receives at most one one-step continuation marker; that marker schedules work but grants no permission.
- Submitted command evidence is validated only as a string and exit status; the Harness20 runtime never executes that submitted command.
- The guard is a bounded, deny-only defense, not a shell sandbox; benign commands are never approved by the hook and still follow normal Codex permissions.

`$webapp <주제>` 한 번으로 현재 대화에서 순차 실행을 시작합니다. 한 작업 단위에서는
상태 관리자가 선택한 단계 하나만 수행하고, 증거를 제출해 `complete`가 성공하면 반환된
현재 단계와 마커로 다음 작업 단위를 바로 시작합니다. 중간 완료는 진행 메시지로 알리며
단계마다 최종 응답을 보내거나 재입력을 요구하지 않습니다. 같은 주제로 기존 작업이 있으면
완료 기록을 보존한 채 재개 절차를 수행합니다.

한 줄 요청만으로 시작할 수 있습니다. `init`이 여섯 주제 필드와 명시된 기본값을 준비하고
전체 원문을 보존한 뒤 해시를 고정합니다. 사용자가 내부 필드 이름을 작성할 필요는 없습니다.
현재 대화에서 진행하는 데 Stop 후크는 필요하지 않습니다. 훅을 실행하거나 신뢰 설정을
바꾸는 대신 기존 상태 관리자의 정식 명령만 사용합니다. 전체 완료, 사용자 일시정지,
실제 권한·외부 입력 대기, 관리자 차단 상태에서는 멈춥니다. 복구 가능한 실패는 같은
단계에서 새 마커로 재시도하되, 연속 3회 실패 제한을 `resume`으로 초기화하지 않습니다.
외부 입력 대기로 대화를 끝내야 하면 실행 중인 상태를 `pause`로 저장해 같은 대기의
자동 반복을 막습니다. 현재 대화에서 처리 중인 일반 도구 권한 확인은 그대로 기다립니다.
호스트가 대화를 강제로 종료한 뒤의 자동 재개는 별도이며, 신뢰된 Stop 후크와 실제
호스트 전달이 필요합니다. 앱 종료·사용량 제한 이후의 무인 재시작을 보장하지 않습니다.

구버전에서 한 줄 입력이 그대로 고정돼 Step 1이 실패했다면 `$webapp resume`은 먼저
`repair-topic --workspace "<project-root>"`를 적용할 수 있습니다. 이 명령은 새 주제를
받지 않고 기존 해시와 원문을 검증해 누락된 항목만 보완합니다. 원문은 백업으로 남고
워크플로는 1단계의 일시정지 상태가 되며, 이어서 `resume`으로 새 시도를 시작합니다.
완료 기록이나 가져온 이력이 있거나 실행 중인 시도가 미완료이면 복구하지 않습니다.
이 조건을 만족하는 첫 단계 재개에서는 TOPIC의 겉모양과 관계없이 관리자에게 복구 여부를
판단하게 합니다. 복구 중 TOPIC 저장 직후 중단돼도 재시도로 상태 해시를 연결할 수 있습니다.
정상적인 기존 TOPIC은 변경하지 않으며, 실제 호스트의 후크 신뢰 설정도 변경하지 않습니다.

## Migration and reset / 마이그레이션과 리셋

### harness36 → harness20 설치 전환

v4.0.0은 설치 ID와 명령 namespace를 `harness20`으로 바꿉니다. 기존 `harness36` 또는 `harness50` 설치가 자동으로 개명되지는 않습니다. 진행 중인 실행은 먼저 일시 정지하고, 기존 플러그인을 해당 설치 범위에서 비활성화한 뒤 새 `harness20`을 설치·활성화하세요. 두 이름의 플러그인을 동시에 활성화하지 마세요. 이전에 특정 프로젝트에서 꺼 둔 설정은 새 이름에서도 유지합니다. v3.0.0의 `harness50`→`harness36` 전환 이력은 루트 안내서의 과거 절에 보존합니다.

기존 플러그인 캐시는 롤백과 다른 프로젝트를 위해 보존합니다. 전환 중에는 기존 설치를 제거하거나 캐시 폴더를 개명하지 않습니다. `step_archive/.harness50-codex/`, Claude 진행 기록, TOPIC, 단계 본문과 산출물은 이동·개명 없이 이어서 사용합니다. 기존 36/50 실행의 프로필과 계약 식별자도 유지합니다. 새 설치 후 호스트를 다시 시작하고 Codex의 변경된 훅 정의는 직접 검토·신뢰해야 합니다.

사용자 공용 Jev 장부 `~/.harness36-security/jev-budget`과 기존 `HARNESS36_JEV_BUDGET_ROOT`는 유지합니다. 개명으로 호출·입력 예약 한도를 초기화하지 않습니다. 생성 HTML의 네이티브 브라우저 실행은 전체 전송 격리가 지원될 때까지 거부되며, 설치 여부나 가용성 probe가 격리를 증명하지 않습니다. 통제와 한계는 [보안 안내](../docs/SECURITY.md)를 따릅니다.


- Only when no Codex workflow exists, existing Claude progress may be imported read-only once.
- Codex never writes back to Claude progress and never merges later Claude changes.
- Reset archives and deactivates only Codex control metadata.
- Reset preserves Claude progress, TOPIC, shared outputs, project source, and application source.

가져온 Claude 완료 기록은 `imported`, Codex가 새로 검증한 완료 기록은 `codex_verified`로 구분됩니다. `$harness20-reset`은 복구 가능한 백업 경로를 보고하고 자동으로 새 워크플로를 시작하지 않습니다.
가져오기나 영수증 복구 결과가 이미 `completed`라면 이 구분을 유지해 결과를 보고하며,
완료된 작업에 다시 `resume`을 호출하지 않습니다.

Claude Code hooks defer to an existing Codex workflow. While `step_archive/.harness50-codex/state.json` exists, they never create, rewrite or advance Claude `progress.json`, never block Stop, never auto-approve Claude edits and never re-initialize TOPIC; SessionStart reports the Codex step in one line instead. The two Claude guards still check Bash commands there, because a Claude session has no other Harness20 guard in a Codex workspace.
같은 작업 공간을 Claude Code에서 열어도 진행 기준은 Codex 상태 관리자입니다. 이어서 진행하려면 `codex/skills/webapp/SKILL.md`의 상태 관리자 절차(`show`·`resume`·`begin`·`complete`)를 따르며, 대화 속 완료 보고는 단계를 진행시키지 않습니다. 리셋 뒤 `state.json`이 백업으로 옮겨지면 Claude 훅은 기존 동작으로 돌아갑니다.

## Hook trust gate / 후크 신뢰 게이트

1. Start a fresh Codex session after installation and verify that all three skills are visible.
2. Open `/hooks` and inspect the exact installed `codex/hooks/hooks.json` definition and its four synchronous handlers: `PreToolUse`, `SessionStart`, `UserPromptSubmit`, and `Stop`.
3. Confirm that no approval hook is present, then manually trust only those exact current definitions.
4. Changed hook hashes require review and manual trust again; never bypass or automate this trust step.

확인할 세 스킬은 `$webapp`, `$harness20-status`, `$harness20-reset`입니다. Codex가 Claude 명령에서 옮긴 `source-command-*` 스킬은 이 세 스킬에 포함되지 않습니다. Hook execution stops at this trust gate until the user confirms the review. 설치 자동화가 훅 신뢰를 대신 처리해서는 안 됩니다. 스킬의 현재 대화 내 순차 실행은 훅을 실행하지 않으므로 이 신뢰 조작을 요구하지 않습니다.

### When the workflow waits after every step / 매 단계 대기할 때

이전 스킬은 단계마다 종료하고 Stop 후크를 기다렸기 때문에, 후크가 신뢰되지 않으면
매 단계 대기했습니다. 최신 스킬은 성공한 작업 단위 뒤 같은 대화에서 계속 진행합니다.
업데이트 후 새 대화에서 스킬을 불러오고 `$webapp resume`으로 보존된 작업을 이어갈 수 있습니다.

An enabled plugin and `features.hooks = true` do not prove that its hooks can run.
An enabled hook marked `untrusted` is skipped. This prevents hook-based scheduling
after a real turn ending, not the active-turn execution loop. For that optional
cross-turn recovery, inspect Harness20's four current definitions in `/hooks` and
review and trust them manually. Repeated `$webapp resume` commands do not repair
missing hook trust. Never reset a healthy workflow to address this problem.

For read-only diagnostics, the installed app-server protocol exposes `hooks/list`
with `cwds` set to the project directory. After the normal `initialize`/`initialized`
handshake, inspect `pluginId`, `eventName`, `enabled`, `trustStatus`, `warnings`, and
`errors`. A fresh app-server query reports current configuration; it does not prove
what an already-running IDE process loaded or whether a Stop event was delivered.
Do not invoke trust-changing RPCs or execute hooks as part of this inspection.

The healthy cross-turn fallback is: an evidenced checkpoint, a synchronous Stop hook returning
`decision: "block"` with the continuation marker, and the host submitting that exact
marker as the next prompt. Observe a real subsequent turn before claiming that
automatic continuation works in the current host. If all hooks are trusted and
enabled but no follow-up arrives, investigate hook errors and host delivery rather
than assuming the IDE cannot support hooks.

`resume` also supports a running workflow that already has a pending continuation.
It preserves completed steps and TOPIC, issues a fresh marker, and invalidates old
markers without requiring a preliminary `pause`.

공식 동작과 후크 신뢰 절차: [Codex hooks](https://learn.chatgpt.com/docs/hooks).

## Host compatibility / 호스트 호환성

Claude Code keeps its slash commands; version 2.2 repairs installed hooks and limits automatic approval to eligible project edits and WebSearch. Codex는 자동 승인하지 않으며 기존 영수증·마이그레이션 규칙을 유지합니다.

Automatic continuation after an actual host turn ends requires enabled, trusted Codex hooks; active-turn execution does not.
Skill discovery alone does not prove that the current host delivers continuation events.

패키지 진입점은 [Codex manifest](../.codex-plugin/plugin.json), 신뢰 검토 대상은 [hook definition](hooks/hooks.json), 실행 절차는 [`skills/`](skills/)에서 확인할 수 있습니다.

최종 HTML의 내용 검증, 실제 명령 종료 코드에 근거한 품질 게이트와 Chromium 검사는 [품질 검증 안내](../docs/QUALITY.md)에 설명합니다. 자동 검사와 별개로 실제 사용자에게 유용한 튜토리얼인지 검토해야 합니다.
