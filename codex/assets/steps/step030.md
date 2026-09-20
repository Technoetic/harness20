---
name: step030
phase: planning
---

# Step 30 - 통합 설계 (레이아웃 + 전체)

## 목표

29단계에서 검증된 통합 기획과 주제 계약을 바탕으로 서로 다른 세 설계안을 비교하고,
독립 선택자가 고른 하나만 레이아웃·Class·비동기 설계로 구체화한다. 실제 구현이나
패키지 설치는 수행하지 않는다.

## 입력과 산출물

- 입력: `step_archive/TOPIC/TOPIC.md`
- 입력: `step_archive/step029_planning_chunk1.md`
- 입력: `step_archive/outputs/step029_검증.md`
- 필수 선행 항목: `step029`
- 산출물: `step_archive/outputs/step030_설계대안.md`
- 산출물: `step_archive/outputs/step030_설계선택.md`
- 산출물: `step_archive/step030_레이아웃설계_chunk1.md`
- 산출물: `step_archive/step030_전체설계_chunk1.md`
- 산출물: `step_archive/outputs/step030_최종검증.md`
- 네트워크: 승인된 Jev 선택 API만 허용한다. 일반 웹 탐색과 새 자료 수집은 사용하지 않는다.
- 시각 검토: 필요하지 않다.

## 실행 역할

가능한 경우 설계 작성자 역할, 대안을 수정하지 않는 독립 선택자 역할, 최종 독립
검증자 역할을 서로 나눈다. 작성자는 대안과 선택된 설계만 작성하고, 독립 선택자는
비교·선택만 수행한다. 최종 독립 검증자는 작성 산출물을 수정하지 않는다. 위임 기능을
사용할 수 없으면 현재 실행자가 세 역할을 명확히 분리해 순서대로 수행하고, 별도
역할을 위임했다고 기록하지 않는다. 정상 권한 확인을 유지하고 자동 승인이나 권한
우회를 금지한다.

## 주제와 기획 확인

어떤 설계 활동보다 가장 먼저 `step_archive/TOPIC/TOPIC.md`를 읽고 `topic`,
`audience`, `interactive`, `real_world_apps`, `constraints`를 고정한다. 그 뒤 29단계
기획과 검증 보고서의 최종 `PASS`를 확인한다. 입력이 없거나 제약이 상충하면 설계를
추정하지 않고 차단한다.

## 첫 설계 활동: 구조화된 대안 탐색

첫 설계 활동은 구조화된 브레인스토밍과 대안 탐색이다. 외부 기능의 특정 이름이나
호출 형식에 의존하지 않는다. 사용자에게 옵션을 질문하지 않고 주제 제약 안에서
가능한 결정을 내리며, 각 결정의 근거와 기각 기준을 대안 문서에 기록한다.

작성자는 `step_archive/outputs/step030_설계대안.md`에 설계안 A, 설계안 B, 설계안 C를
작성한다. 세 안의 레이아웃 구조, Class·모듈 아키텍처와 반응형 전략은 실질적으로 달라야
한다. 각 안은 29단계 요구 추적표, 장단점, 실패 상태, 구현 위험과 접근성
영향을 포함한다. 이름만 바꾸거나 색상만 바꾼 안은 허용하지 않는다.

## 독립 선택

독립 선택자는 대안을 수정하지 않고 정확히 하나만 선택해
`step_archive/outputs/step030_설계선택.md`에 기록한다. 유지보수성, 반응형 구현 난이도,
조사 적합성, 접근성을 같은 척도로 평가하고 선택 근거와 기각 근거를 남긴다. 동점은
주제 제약의 우선순위로 해소하며 작성자와 협상해 판정을 바꾸지 않는다.

작성자는 선택된 안만 사용해 `step_archive/step030_레이아웃설계_chunk1.md`와
`step_archive/step030_전체설계_chunk1.md`를 작성한다. 선택되지 않은 안을 혼합하려면
선택 판정이 무효이므로 차단한다.

## Class 설계 계약

주요 기능은 Class 단위의 단일 책임으로 나누고 상속보다 합성을 우선한다. 모든
의존성은 생성자 주입으로 전달하며 전역 상태와 암묵적 singleton을 두지 않는다.
외부 계약은 public API, 내부 상태와 helper는 private API로 구분한다. 각 Class의
불변식, 소유 상태, 입력·출력, 오류와 협력 객체를 명시한다.

설계 산출물에는 클래스 다이어그램, Class 의존 관계도, public async 시그니처,
주요 비동기 시퀀스 다이어그램과 생성부터 종료까지의 라이프사이클을 포함한다.
구성 요소 경계는 29단계 기능과 API 계약의 provenance 식별자에 연결한다.

## 비동기와 성능 계약

생성자는 가볍고 동기적으로 유지하며 초기화와 시작을 `async init()`과
`async start()`로 분리한다. I/O, DOM 준비, 애니메이션과 timer는 Promise 기반
async 흐름으로 설계한다. 취소는 AbortSignal 같은 명시적 신호, 오류는 경계별 typed
결과나 예외 정책, 병렬 작업은 독립성과 실패 결합 방식을 명시한다. 불필요한 순차
대기, callback 중첩과 처리되지 않은 rejection을 허용하지 않는다.

성능 계약에는 frame budget, 입력 debounce/throttle, passive listener, 큰 작업의
yield 또는 worker 분리, 병렬성 상한, cache 수명과 cleanup을 포함한다. lifecycle은
`new` → `await init()` → `await start()` → cancel/shutdown 순서와 부분 실패 복구를 보인다.

## 레이아웃·상호작용·접근성 계약

레이아웃 설계에는 반응형 breakpoint, 각 화면 상태, 키보드 순서, 포커스 이동·복원,
reduced-motion 대체, 터치 target과 명암 기준을 포함한다. desktop/tablet/mobile의
영역 배치·비율·우선순위, loading/empty/error/disabled 상태와 모든 상호작용의
trigger, feedback, cancel, recovery를 텍스트 wireframe과 표로 명시한다.

플러그인 `docs/ROUTING.md`의 화면별 URL 계약을 모든 대안과 최종 설계에 적용한다.
전체 설계에 **화면 ID / 목적 / canonical path / 진입 링크 / 새로고침 후 기대 화면**
표를 작성해 기획의 모든 독립 화면과 일대일 대응시킨다. 산출물은 단일 HTML이며
기본은 `index.html#/orders` hash 라우팅이다. history 모드는 같은 HTML을 제공하는
서버 fallback 설정과 실제 배포 URL 검증 계획이 있을 때만 선택하고 이유를 기록한다.
정적 manifest의 schema version 1과 URL 형식인 `mode`를 유지한다. HTTP(S)에서 `navigation.currentEntry`가
null이 아니고 실제 `intercept` capability가 있을 때 Navigation API를 우선 선택하며
API 이름의 존재만으로 판단하지 않는다. 미지원 환경은 선언 모드에 맞는 기존 History
API/hash를 사용한다. 파일 직접 열기를 지원하려면 hash manifest를 선택한다.
history manifest는 HTTP(S)가 필요하며 실행 환경에 따라 mode를 암묵 변환하지 않는다.
backend는 하나만 설치하며 첫 문서 로드는 이벤트를 기다리지 않고 현재 URL로 초기화한다.
앱 hash 경로의 모든 변경과
unknown fallback 복원, 수정키 클릭·다른 target·download·외부 링크·form·일반 문서
앵커 우회를 설계한다. 일반 `#section`과 앱 경로 `#/orders`를 구별한다.
`harness50-routes` JSON manifest, `[data-harness-screen]` 루트, 실제 `a[href]` 이동,
직접 접속·새로고침·뒤로/앞으로 가기의 URL→화면 복원과 unknown-route fallback을
설계한다. 제목·활성 메뉴·포커스 갱신을 포함하고 URL 없는 화면 전이는 허용하지 않는다.
실제 한 화면이면 한 경로만 선언하며 불필요한 화면을 만들지 않는다.
실제 Navigation API 분기와 앱 시작 전 API를 제거한 호환 분기를 검증할 방법도 기록한다.

각 설계 청크는 500줄 이하이다. 첫 청크 manifest에 입력 digest, 선택 문서 digest,
포함 diagram, 요구 추적과 줄 수를 기록한다. 선언되지 않은 추가 청크를 만들지 않는다.

## 최종 독립 검증

최종 독립 검증자는 대안의 실질적 차이, 선택의 독립성, 선택된 안만의 구현,
요구 추적, Class·async·반응형·접근성 계약을 입력부터 다시 확인한다. 모든 라운드는
`step_archive/outputs/step030_최종검증.md`라는 동일한 선언 보고서의 라운드별 섹션에
기록하고 최대 5라운드만 수행한다.

- `PASS`: 모든 필수 계약이 증거와 diagram으로 완결된 경우에만 완료한다.
- `FAIL`: 완료 증거가 될 수 없다. 작성자만 설계를 보정하고 독립 검증자가 재판정한다.
- 선택자는 재보정 중에도 대안을 수정하거나 새 안을 끼워 넣지 않는다.
- 5라운드까지 `PASS`가 없으면 workflow를 차단하고 미해결 항목을 같은 보고서에
  기록한다.

## 최종 보완 증거 인계

29단계의 최종 PASS 기획에 계승된 24단계 보완 manifest·통합 분석 provenance를 설계 입력으로 사용한다.
원래 23단계 결론만으로 되돌아가지 않고 29단계가 검증한 최종 조사 축·대안과 보완 경로·hash를 설계 결정에 연결한다.
보완이 없으면 기획의 빈 보완 manifest를 계승한다. 새 네트워크 수집이나 이전 증거 수정은 하지 않는다.

## Jev 의미 체크포인트

설계 대안 둘의 구조·제약 설명이 준비되면 표현만 바꾼 안인지 실질적으로 다른 구조인지 묻는다. 세 대안 생성, 독립 선택자와 최종 설계 검증은 그대로 수행한다.

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

## 완료 조건

- `design-alternatives`: 실질적으로 다른 A/B/C 세 안이 있다.
- `design-selection`: 독립 선택자가 같은 기준으로 정확히 하나를 선택했다.
- `layout-design-chunk-1`: 선택된 안의 완전한 레이아웃 설계가 있다.
- `overall-design-chunk-1`: 선택된 안의 완전한 Class·async 설계가 있다.
- `final-design-verification`: 단일 보고서의 최종 판정이 `PASS`다.
- `structured-brainstorming-first`: 대안 탐색이 첫 설계 활동이었다.
- `independent-selector`: 선택자는 대안을 수정하지 않았다.
- `class-architecture-contract`: Class 경계, 주입과 API가 완전하다.
- `async-lifecycle-contract`: 비동기 lifecycle, 오류·취소·병렬·성능이 완전하다.
- `responsive-accessibility-contract`: 반응형·상태·접근성 계약이 완전하다.
- `design-chunks-bounded`: manifest와 각 청크가 일치하며 500줄 이하이다.
- `pass-verdict`: 최종 독립 검증자가 근거 있는 `PASS`를 기록했다.

검증 결과와 다섯 산출물 경로를 수락 증거로 제출하고 현재 단계에서 멈춘다.
workflow 상태와 영수증만이 이후 진행을 소유한다.
