---
description: 웹앱 인터랙티브 튜토리얼 1회 입력 → step001~050 자율주행 완주. /webapp <주제>
argument-hint: <주제 한 줄>
---

# /webapp — harness50 자율주행 시작

**입력**: `$ARGUMENTS` (예: `다익스트라 최단경로 알고리즘`, `OAuth 2.0 인증 흐름`, `B-tree 인덱스`)

**실행 전 분기:** 직접 Jev 질문이나 유지 중인 Jev-first 선호에 따른 일반 질문만
요청됐으면 아래 **Jev-first 요청 라우팅**으로 답하고 종료한다. workflow 제어를
요청하지 않은 경우 즉시 실행 절차에 들어가거나 TOPIC·progress를 만들지 않는다.
웹앱 시작·재개 등 실제 제어 요청이 있을 때만 다음 절차를 수행한다.
자연어 요청은 자동 시작하지 않는다(시작은 `/webapp <주제>`).

**Codex 작업 공간 분기:** `step_archive/.harness50-codex/state.json`이 있으면 Codex 상태
관리자가 이 작업 공간을 소유한다. 아래 절차를 수행하지 않는다. TOPIC.md·progress.json을
만들거나 덮어쓰지 않고, step001로 돌아가지도 않는다. SessionStart나 webapp-trigger가 알린
Codex 단계부터 harness50 플러그인의 `codex/scripts/harness-state.mjs`(`show` → `resume` →
`begin` → `complete`)와 `codex/skills/webapp/SKILL.md` 절차로 이어간다. 다른 주제는 별도
작업 공간에서 시작한다. 상태 파일을 읽을 수 없으면 `show` 결과만 보고하고, 복구나 리셋은
사용자가 결정한다.

## 즉시 실행 절차 (사용자 확인 없이)

1. **harness-rules skill 로드** — 본 세션의 절대 헌법.
   `Skill` 도구로 `harness50:harness-rules` 호출.

2. **TOPIC.md 작성** — `step_archive/TOPIC/TOPIC.md`에 다음 형식으로 쓴다.
   `webapp-trigger` hook이 자동 처리하지 않은 경우의 폴백.
   훅 출력에 `webapp trigger skipped` 줄이 있으면 TOPIC.md·progress.json을 쓰지 않고 그 줄의
   안내만 전한 뒤 끝낸다. 이 대체 작성은 `step_archive/TOPIC/TOPIC.md`가 없을 때만 한다.

   ```markdown
   ---
   created: <오늘 날짜>
   session_prompt: |
     $ARGUMENTS

     "$ARGUMENTS" 튜토리얼을 생성한다.
     인터랙티브는 필수다.
     웹으로,
     초보자 학습용으로,
     대중 앱 사례를 참고,
     직관적으로 이해할 수 있게
     생성한다.

     @step_archive/archived/step001.md 절대 복종한다.
   ---

   # 튜토리얼 주제

   - topic: $ARGUMENTS
   - audience: 초보자 학습용
   - interactive: 필수
   - real_world_apps: 대중 앱 사례 참고
   - constraints:
     - 단일 HTML 인터랙티브 웹 튜토리얼
     - 독립 화면마다 고유 URL 부여, 기본 hash 라우팅, 지원 HTTP(S)에서는 Navigation API 우선 및 호환 backend 제공, docs/ROUTING.md 계약 준수
     - 파일 직접 열기를 지원하려면 hash manifest 선택, history manifest는 HTTP(S) 필요, 실행 환경에 따른 mode 암묵 변환 금지
     - AI Slop 방지 전역 제약 준수
     - 한국어 본문 + 기술 용어 영문 병기
   ```

3. **step001.md Read** — `step_archive/archived/step001.md` 1회 읽기.

4. **연속 실행** — 본문 지시대로 실행 → "Step 001/50 완료" 보고 → 즉시 step002.md Read → … → step050.md까지 멈추지 않고 진행.

## Jev-first 요청 라우팅

사용자가 Jev-first 또는 가능한 판단을 Jev에 먼저 맡기도록 요청하면, 유지 중인
선호·승인 범위를 포함해 **현재 요청의 모든 지원되는 판단**에 먼저 적용한다.
쉽거나 명백한 질문, 산술, 일반 대화, 아래 7단계 밖이라는 이유로 생략하지 않는다.
독립 질문·명시적으로 선택한 인라인 텍스트는 설치 플러그인의 `scripts/jev-ask.mjs`
`prepare --input -` 다음 `run --input - --allow-network`로 처리한다.
워크스페이스나 가짜 근거 파일을 만들지 않는다. 입력·타입·결과 계약은
`docs/jev-first.md`를 따른다. 직접 질문만 처리하는 요청은 workflow를 시작하지 않는다.

Noul은 명제의 참 확률, Choice는 근거 부족 선택지를 포함한 후보 선택,
Score는 순서 있는 2–10개 기준의 가중 평점이다. Noul에 제공되지 않은 confidence를
붙이거나 Score를 임의 숫자 생성기로 사용하지 않는다. 필요한 최신·환경 근거를
먼저 수집하고, 근거가 부족한 질문은 보류 가능한 Choice를 우선 사용한다.
자유 글·코드·이미지 생성과 실제 도구·브라우저·파일·테스트 실행은 호스트가 담당한다.
혼합 요청은 지원되는 판단과 호스트 실행으로 나누고 검증된 자료만 평가한다.

이미 승인된 평범한 비밀 없는 질문의 전송 범위는 재사용하며 매번 재확인하지 않는다.
전체 대화·워크스페이스·숨은 자료를 자동 수집하거나 파일 제한을 인라인 재분류로
우회하지 않는다. 파일에서 파생된 판단에는 아래 기존 파일 경로를 우선 사용한다.
현재 파일 보고서가 같은 질문을 답했으면 직접 호출을 추가하지 않는다. 직접 결과도
현재 `prepare`의 `input_hash`, `request_hash`, `policy_hash`가 일치하면 재사용한다.
한 책임자만 변하지 않은 요청에 한 배치를 호출하며 자동 재시도하지 않는다.
실제 검증된 응답에는 짧게 `Jev 사용`을, 미호출·미지원·실패에는
`호스트 처리: <이유>`를 표시한다. 낮은 확신·abstain은 검토 대상으로 남긴다.
기존 권한·독립 검증·필수 테스트·완료 writer는 그대로 적용한다.

## Jev 체크포인트 라우팅

16·24·25·30·37·45·49단계의 선택 근거가 준비되면 신뢰한 설치 플러그인의
`scripts/jev-judge.mjs`와 `docs/jev-checkpoints.md`를 따른다. 현재 작업에서 Jev 사용과
해당 발췌문의 외부 전송이 승인된 경우 자동 호출한다. 기존 승인이 범위를 포함하면
재확인하지 않는다. 단계 도달이나 키 존재, workflow 시작 자체는 전송 승인이 아니다.
승인 또는 서비스가 없으면 이유를 단계 보고서에 남기고 기존 독립 검증을 수행한다.

호출 책임자를 해당 step-executor로 정하고 승인 범위와 선택 근거를 인계한다.
워커가 반환한 보고서는 `inspect`하고 현재 `prepare`의 `request_hash`, `policy_hash`,
`input_hash`, `sources`를 대조한다. 재사용할 판정이 없을 때만 같은 JSON으로
`run --workspace ROOT --input - --allow-network`를 실행한다. 변하지 않은 입력에는
한 배치만 호출하는 호스트 정책이며 전역 하드 쿼터가 아니다. 호출자와 워커는 중복 호출하지 않는다.
일반 웹 탐색 권한은 늘어나지 않는다. abstain·낮은 confidence는 호스트 검토 대상으로 남기고
Jev 결과로 기존 필수 Acceptance·시각 검사·E2E·독립 검증·완료 writer를 대체하지 않는다.

## 절대 준수

- 사용자에게 어떤 질문도 하지 마라
- "진행할까요" / "어떻게 할까요" / "다음 턴에서 재개" 모두 금지
- 토큰 한도 직전까지 한 턴 안에서 가능한 한 많은 step 실행
- Stop hook이 자동 재개를 처리하므로 인위적으로 턴을 끊지 마라
- 각 step 완료는 1줄 보고 ("Step NNN/50 완료")만

## 다음 행동

지금 즉시 step001부터 시작하라. 본 명령어는 이미 자율주행 진입 신호다.
