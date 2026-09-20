---
description: 웹앱 인터랙티브 튜토리얼 1회 입력 → step001~050 자율주행 완주. /webapp <주제>
argument-hint: <주제 한 줄>
---

# /webapp — harness50 자율주행 시작

**입력**: `$ARGUMENTS` (예: `다익스트라 최단경로 알고리즘`, `OAuth 2.0 인증 흐름`, `B-tree 인덱스`)

## 즉시 실행 절차 (사용자 확인 없이)

1. **harness-rules skill 로드** — 본 세션의 절대 헌법.
   `Skill` 도구로 `harness50:harness-rules` 호출.

2. **TOPIC.md 작성** — `step_archive/TOPIC/TOPIC.md`에 다음 형식으로 쓴다.
   `webapp-trigger` hook이 자동 처리하지 않은 경우의 폴백.

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
