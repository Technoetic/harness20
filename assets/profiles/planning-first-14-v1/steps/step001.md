---
name: step001
persistence: session
---

# Step 1 - 기획: 요구사항 기반 (독립 검증 루프)

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-001.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step001_*.md` 저장 후 1줄 완료 보고 `Step 001/14 완료`.
>
> **모델 정책**: 구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step009 전)

## Memory-of-Thought

새 실행의 첫 기획에는 이전 기획 단계가 없다. 고정된 TOPIC과 사용자가 명시적으로
제공한 자료만 입력으로 읽으며, 저장된 다른 프로필이나 이전 실행의 산출물을 찾아 읽지 않는다.
재시도일 때만 관리자가 확인한 `planning-first-14-v1`, 현재 `workflow_generation`
(`run_started_at` 또는 `workflow_id`에서 검증한 실행 세대), 현재 기획 시도와의 연결,
TOPIC 입력 digest가 모두 일치하는 자기 기획·검증 기록의 명시 경로를 읽는다.
출처가 확인되지 않은 기록은 사용하지 않고 현재 고정 입력으로 기획을 작성한다.
이전 실행의 실패 패턴이나 완료 증거를 현재 실행의 선행 조건이나 검증으로 가져오지 않는다.

## 실행 내용

사용자 요청과 명시적으로 제공된 자료를 기반으로 기획 문서 초안을 작성한다. **기획 작성자와 검증자를 분리하여** 요구사항가 기획에 충실히 반영되었는지 확인한다.

## 핵심 원칙: 작성 에이전트 ≠ 검증 에이전트

기획을 작성한 에이전트가 스스로 "요구사항를 잘 반영했다"고 판단하는 것을 **금지**한다.

**필요한 파일:**

- `step_archive/TOPIC/TOPIC.md` (튜토리얼 주제 — **필수, 가장 먼저 Read. 기획의 모든 결정이 본 주제·타깃·제약을 충족해야 한다**)
- 사용자가 명시적으로 제공한 자료 (전체 요구사항)

TOPIC은 초기화 관리자가 여섯 필드와 사용자 원문을 보존한 읽기 전용 입력이다.
기획 작성자와 독립 검증자는 현재 TOPIC 입력 바이트의 SHA-256을 각각 기록하고 대조한다.
두 기록이 다르거나 검증 중 입력 바이트가 바뀌면 이 단계를 완료하지 않는다.
`decisions`와 `original_request`가 있으면 원문·명시 제약·기본값 표시를 함께 대조한다.
기본값을 새로운 사용자 결정이나 승인으로 해석하지 않는다. 필수 주제 필드의 실제 누락·모순·
원문 손실은 차단하며 TOPIC 바이트를 직접 고치거나 이전 단계 완료 기록을 만들지 않는다.
이 단계는 앞선 프리플라이트나 의존성 게이트 보고서를 요구하지 않는다.

Class 지향으로 기획한다.

플러그인 `docs/ROUTING.md`에 따라 독립 화면 목록과 화면별 사용자 목적을 기획에
포함한다. 각 화면에는 공유·직접 접속 가능한 URL이 필요하다. 단순 필터·대화상자는
독립 화면과 구분하고, 실제 단일 화면 앱에 불필요한 화면을 추가하지 않는다.
검증자는 메뉴 아래 화면이 누락되지 않았는지 확인해 2단계 주소 설계에 전달한다.

## 주제 충실성 (필수)

기획 작성 에이전트(A)와 검증 에이전트(B) 모두 `step_archive/TOPIC/TOPIC.md`를 먼저 Read한다.

- 검증 에이전트 B의 판정 축에 다음을 추가한다:
  - **주제 일치**: 기획 결과물이 TOPIC.md의 `topic`을 실제로 다루는가? (관련 없는 주제로 표류 금지)
  - **타깃 적합성**: TOPIC.md의 `audience`에 적합한 난이도·설명 방식인가?
  - **인터랙티브 충족**: TOPIC.md의 `interactive` 요구가 기획에 반영되었는가?
  - **사례 반영**: TOPIC.md의 `real_world_apps`에 명시된 대중 앱 사례가 기획에 포함되었는가?
- 위 4축 중 하나라도 부족하면 FAIL 처리한다.

## 실행 순서

### 1단계: 기획 작성 에이전트 (에이전트 A) 실행

에이전트 A가 사용자가 명시적으로 제공한 자료를 기반으로 기획 문서 초안을 작성한다.

결과: 이번 시도에 실제 생성한 기획 청크의 명시 경로·SHA-256 목록 (500줄 이하/청크)
작성자는 각 청크 manifest에 현재 프로필, 실행 세대, 기획 시도 식별자와 TOPIC 입력 digest를 기록한다.

### 2단계: 요구 반영 검증 에이전트 (에이전트 B) 실행

**에이전트 B의 역할: 요구사항가 기획에 반영되었는지 검증만 수행. 기획 수정 금지.**

에이전트 B에게 전달할 프롬프트 (N = 현재 라운드 번호):
호출자는 아래 실행 세대·시도·digest 자리와 파일 목록을 검증한 실제 값으로 채운다.
인계 값을 확인할 수 없으면 추정하거나 다른 실행의 기록으로 채우지 않는다.

```
너는 요구 반영 검증자다. 기획을 수정하지 않는다. 반영 여부 판정만 한다.

현재 실행 인계 값:
- workflow_profile: planning-first-14-v1
- workflow_generation: 관리자가 확인한 현재 실행 세대
- planning_attempt: 현재 기획 시도 식별자
- topic_sha256: 작성자가 기록한 현재 TOPIC 입력 SHA-256
호출자는 이번 시도에 실제 생성한 기획 청크의 명시 경로·SHA-256 목록만 전달한다.
이 인계 값과 각 파일의 출처·현재 바이트를 대조하며 다른 실행의 기획·청크·보고서를 탐색하지 않는다.

1. TOPIC과 사용자 요청·제공 자료를 먼저 Read한다. 요구 ID, 실제 출처 경로와 SHA-256을 대조한다.
   - 현재 TOPIC digest가 topic_sha256과 일치해야 한다.
   - 필수 요구 누락·충돌, 프로필·실행 세대·시도 연결 누락 또는 hash 불일치는 INCOMPLETE다.

2. 호출자가 명시 경로·SHA-256 목록으로 전달한 이번 시도의 기획 문서를 Read한다.
   - 각 manifest의 workflow_profile, workflow_generation, planning_attempt, topic_sha256을 현재 인계와 대조한다.

3. 재시도일 때만 호출자가 명시 경로·SHA-256으로 전달한 자기 이전 라운드 검증 결과를 Read한다.
   - 같은 프로필·실행 세대·TOPIC digest 및 현재 기획 시도와의 연결이 확인된 기록만 사용한다.
   - 출처가 확인되지 않은 기록은 사용하지 않고 현재 고정 입력과 이번 시도의 기획을 검증한다.

4. 다음 축으로 검증한다:
   - **데이터 기반**: 기획의 각 결정이 제공 자료에 근거하는가 (명시적으로 제공된 자료)
   - **누락**: 요청에 명시된 중요 패턴이 기획에 빠지지 않았는가
   - **왜곡**: 요구사항가 기획에서 잘못 해석/변형되지 않았는가
   - **출처**: 기획의 주요 결정마다 출처(요청·제공 자료의 파일·절)가 추적 가능한가

5. 결과를 `step_archive/outputs/step001_검증_rN.md`에 저장한다.
   - 현재 인계 네 값, 실제 검사한 명시 경로·SHA-256과 대응 요구 축을 기록한다.
   - 반영 충실하면: "PASS"로 시작
   - 부족하면: "FAIL"로 시작하고 누락/왜곡 항목 구체적 나열
```

에이전트 B는 haiku를 사용한다.

### 3단계: 판정 확인

- **PASS** → 다음 Step으로 이동
- **FAIL** → 4단계 (기획 보강 에이전트 A)

### 4단계: 기획 보강 에이전트 (에이전트 A) 실행

에이전트 A가 검증 피드백을 반영하여 기획 문서를 보강한다. 통과 판정하지 않는다.

### 반복 제한: 최대 5라운드

최대 5라운드까지 수정·재검증한다. 같은 필수 항목이 2연속 미수정이면 조기 종료한다.
모든 필수 항목의 현재 증거가 PASS일 때만 완료한다. 실패·누락·미검증 또는 한도 소진이면
미해결 항목과 다음 검사를 기록하고 현재 Step을 INCOMPLETE로 인계한다.
필수 실패를 스킵하거나 완료 보고 후 다음 Step으로 진행하지 않는다.
한도 소진이나 같은 필수 항목의 연속 미수정으로 끝나면 `required-input-missing`, 필수 실행·시각 검사 기능이 없으면 `required-tool-failed`로 헌법 §2-1 명명된 멈춤을 기록하고 턴을 끝낸다.

## 제공 API 계약과 미확정 요구

API를 사용하는 경우 사용자가 제공한 명세·자료 또는 명시적으로 선언한 계약에서
target, version, schema, auth, rate-limit, error, retry 정책을 추출한다. 요구 ID와
출처 파일·절·SHA-256을 연결한다. 누락된 필수 항목은 missing requirements로 남겨
차단하거나 명시적인 계약 결정을 받는다. 대상이 없으면 근거 있는 N/A를 기록한다.
추정한 최신 외부 사실이나 실행하지 않은 검증을 PASS로 기록하지 않는다.
테스트 결과는 선언한 계약의 동작 증거이며 외부 사실의 현재성을 증명하지 않는다.

## Jev 의미 체크포인트

TOPIC의 요구와 기획의 대응 문장이 준비되면 선택한 요구가 명시적으로 반영됐는지 묻는다. 기존 `scripts/jev-review.mjs`와 `docs/JEV-REVIEW.md`는 버전 1 호환 경로다. 새 자동 검토는 일반 helper만 사용하며 두 어댑터를 중복 호출하지 않는다.

현재 작업에서 Jev 사용과 선택한 발췌문의 외부 전송이 승인된 경우 호스트가 자동 호출한다.
기존 승인이 해당 범위를 포함하면 재확인하지 않는다. 단계 도달이나 `TYPESAFE_API_KEY` 존재는 승인이 아니다.
승인이 없거나 서비스가 불가하면 이유를 기존 단계 보고서에 기록하고 독립 검증을 계속한다.

신뢰한 플러그인의 `node "<plugin-root>/scripts/jev-judge.mjs" prepare --workspace ROOT --input -`로 준비한다.
재사용 전 `inspect --workspace ROOT --report PATH`의 상태와 현재 prepare의 `request_hash`, `policy_hash`, `input_hash`, `sources`를 모두 대조한다.
새 호출은 동일 JSON으로 `run --workspace ROOT --input - --allow-network`를 실행한다.
변하지 않은 입력에는 한 배치만 호출하는 호스트 정책을 적용하며 전역 하드 쿼터로 해석하지 않는다.
`unverified`·`stale`는 판정 근거로 쓰지 않고 abstain·낮은 confidence는 호스트가 원본을 검토한다.
승인된 선택 API 예외는 일반 웹 탐색이나 새 자료 수집을 허용하지 않는다.

입력 파일·발췌문 범위, 동의·중복 방지·보고서 검사는 `docs/jev-checkpoints.md`를 따른다.
기존 독립 검증·Acceptance·실제 검사와 완료 writer는 유지한다. Jev 결과나 `current`는 PASS 또는 완료 권한이 아니다.

## 실패 패턴 기록

종료 시(PASS 또는 INCOMPLETE) 도중 FAIL 항목과 해결 여부를 이 Step 검증 보고서의 `## 실패 패턴` 절에 적는다. PASS로 끝나도 도중 FAIL은 남긴다. `step_archive/progress.json`은 수정하지 않는다(완료는 Stop 훅, 멈춤은 `harness-pause.mjs`만 기록한다).

## 주의사항

- 에이전트 A가 스스로 "잘 반영했다"고 판단하는 것을 금지한다
- 에이전트 B가 기획을 수정하는 것을 금지한다
- 에이전트 B의 현재 PASS만 완료 조건이다. 실패·한도 소진은 미완료 종료 조건이다

합리적인 선에서 최대한 많은 서브에이전트를 병렬로 사용해야 한다 (동시 실행 최대 10개).

**기획 결과는 청크 단위로 저장한다:**

```
step001_planning_chunk1.md (500줄 이하)
step001_planning_chunk2.md (500줄 이하)
step001_planning_chunk3.md (500줄 이하)
...
```

서브에이전트는 항상 haiku를 사용한다.

## Self-Calibration

기획 완료 후 다음을 스스로 평가하라:
- 이전 실패 패턴을 피하고 있는가? (Y/N)
- N이면 해당 부분을 보완하고 재평가한다.

---

필수 요구와 현재 검증 증거가 모두 PASS일 때만 이 지침을 완료하고 자동으로 step002.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.

## 정의별 입력·산출물 계약

- 입력: `step_archive/TOPIC/TOPIC.md`
- 산출물: `step_archive/step001_planning_chunk1.md`
- 산출물: `step_archive/outputs/step001_검증.md`

필수 수락 항목: `base-planning-snapshot`, `planning-verification-report`, `topic-fidelity`, `requirements-traceability`, `planning-chunks-bounded`, `bounded-independent-review`, `pass-verdict`, `provided-api-contract`
