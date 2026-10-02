---
name: step001
phase: preflight
---

# Step 1 - 하네스 프리플라이트 체크

## 목표

미리 준비된 튜토리얼 주제 입력이 현재 작업에 충분한지 검증하고, 작업에 필요한
도구의 가용성을 확인한다. 일반 권한 확인 절차를 유지하며, 이 문서에 선언된
산출물과 수락 증거만 만든다.

## 입력과 산출물

- 입력: `step_archive/TOPIC/TOPIC.md`
- 필수 선행 항목:
- 산출물: `step_archive/step001_preflight.md`
- 네트워크: 누락된 도구를 설치해야 할 때 사용할 수 있다.
- 시각 검토: 필요하지 않다.

## 1. 튜토리얼 주제 점검

`step_archive/TOPIC/TOPIC.md`는 workflow가 미리 준비하고 해시로 고정한 읽기 전용
입력이다. 이 단계에서는 해당 파일을 절대 수정하지 않는다. 다음 필드가 존재하고
현재 작업에서 밝힌 주제와 제약을 충분히 표현하는지만 확인한다.

- `topic`: 한 줄 주제
- `audience`: 대상 독자
- `interactive`: 상호작용 요구
- `real_world_apps`: 참고할 실제 사례
- `constraints`: 구현 및 표현 제약
- `decisions`: 이미 결정된 모호한 항목과 짧은 이유

새 workflow의 `init`은 짧은 자연어 요청에서도 위 여섯 필드를 준비한 뒤 저장하고
해시를 고정한다. 필드는 Markdown 제목 또는 YAML 항목으로 표현할 수 있다.
`original_request`가 있으면 원문과 명시 제약이 보존되었는지 함께 확인한다.
사용자가 생략한 항목을 `기본값`으로 명시하여 채운 것은 유효한 입력이며,
사용자의 추가 결정이나 승인으로 해석하지 않는다. 기본값은 원문의 명시 조건보다
우선할 수 없다. 사용자가 내부 필드 이름을 직접 입력하지 않았다는 이유만으로
실패시키거나 새 폴더를 요구하지 않는다. 실제 누락·모순·원문 손실은 여전히 실패다.

구버전에서 필수 항목 없이 고정된 입력은 다음 재시도 전 webapp 스킬의
`repair-topic` 관리자 명령으로 복구할 수 있다. 완료 기록이 없는 native 워크플로의 첫 단계에만
적용하며 원문 백업과 해시 검증을 거친다. 이 단계에서 TOPIC을 직접 편집하지 않는다.

단일 HTML 웹앱에는 플러그인의 `docs/ROUTING.md` 화면 주소 계약을 적용한다.
독립 화면마다 고유 URL을 부여하고 기본은 hash 라우팅으로 한다. 주제 파일을
고쳐 기본값을 주입하지 말고 프리플라이트 보고서에 적용 방식을 기록해 후속 설계로
전달한다. 명시된 사용자 제약과 충돌하면 충돌을 보고한다. 실제 한 화면이면 하나만 선언한다.
URL 형식과 구현 backend는 별개다. HTTP(S)에서 실제 사용 가능한 Navigation API를
우선 선택하고 미지원 환경은 URL 모드에 맞는 기존 History API/hash로 처리한다.
파일 직접 열기를 지원하려면 hash manifest를 선택한다. history manifest는 HTTP(S)가
필요하며 실행 환경에 따라 mode를 암묵 변환하지 않는다. 정상 브라우저와 API 비가용
환경의 검증 계획을 전달한다.

파일이 누락되었거나 필수 필드가 현재 주제와 제약을 설명하기에 불충분하면 이
단계를 실패로 처리한다. 파일 바이트를 변경하지 않은 채 원인과 안전한 사용자
조치만 프리플라이트 보고서에 남긴다. 입력에서 발견한 자격 증명, 토큰, 개인 식별
정보는 보고서로 옮기지 않는다.

## 2. 도구 인벤토리

각 명령은 독립적으로 실행하고 결과를 기록한다.

| 분류 | 도구 | 확인 명령 |
|:---|:---|:---|
| 필수 | Node.js | `node --version` |
| 필수 | npm | `npm --version` |
| 필수 | 브라우저 검증 백엔드 (docs/BROWSER-TOOLS.md: Aside CLI 또는 Playwright) | 검증 체크아웃에서 `node scripts/verify-output.mjs --probe` (selected가 null이 아니면 성공) |
| 필수 | Biome | `npx --no-install @biomejs/biome --version` |
| 필수 | Stylelint | `npx stylelint --version` |
| 조사 | Vitest/Jest | `package.json`과 lockfile 설치 현황 확인; 선택·검증은 6단계 |
| 선택 | c8 | `npx c8 --version` |
| 선택 | jscpd | `npx jscpd --version` |
| 선택 | madge | `npx madge --version` |
| 선택 | tokei | `tokei --version` |
| 선택 | semgrep | `semgrep --version` |

Windows에서 PowerShell의 ps1 실행 정책 때문에 npm/npx 명령이 차단되면
실행 정책을 변경하지 않고 같은 배포의 `npm.cmd`/`npx.cmd`로 확인한다.
Biome 패키지 선택이 필요하면 `npx --yes --package @biomejs/biome biome --version`을 사용한다.

필수 도구가 없으면 프로젝트가 이미 사용하는 패키지 관리 방식을 우선해 설치를
최대 세 번 시도한다. 매 시도에서 정상 권한 확인을 유지한다. 필수 도구가 모두
실제로 사용 가능해야 `required-tool-inventory`를 충족한다. 하나라도 사용할 수
없으면 이 단계를 완료하지 않고 `required-tool-inventory`에 `ok: true`를 제출하지
않는다. 차단 또는 실패 보고서는 진단 자료일 뿐 필수 도구의 수락 증거가 아니다.

선택 도구는 확인 결과를 `OK`로 기록하거나, 사용할 수 없는 이유와 이후 작업의
안전한 대체 방식을 명시한 `SKIP`으로 기록한다. `SKIP`은 선택 도구에만 허용하며
필수 도구 누락을 숨기는 데 사용할 수 없다.

## 3. 프리플라이트 보고서

`step_archive/step001_preflight.md`에 다음 내용을 기록한다.

- 주제 파일의 존재 여부와 필수 필드 충족 여부
- 필수 및 선택 도구별 명령, 종료 코드, 상태
- 설치를 시도했다면 시도 횟수와 최종 결과
- 총 소요 시간
- 비밀값을 포함하지 않은 오류 범주와 필요한 사용자 조치

환경 변수 값, 인증 정보, 명령 출력에 섞인 비밀값은 보고서에 저장하지 않는다.

## 테스트 러너와 커버리지 인계

1단계는 Vitest/Jest를 강제 설치하지 않는다. 6단계에서 기존 프로젝트와 빌드 근거로 러너를 선택한 다음 선택한 러너만 필수로 설치·검증한다. c8은 5단계에서도 선택 사항이다. c8의 SKIP은 커버리지 측정 면제가 아니다. 6단계의 Vitest coverage-v8 또는 Jest coverage를 사용하여 이후 품질 게이트의 실제 측정 보고서를 생성해야 한다.

## 완료 조건

다음 수락 증거가 모두 준비되어야 한다.

- `topic-contract`: 읽기 전용 주제 입력이 존재하고 충분하며 바이트가 변경되지 않음
- `preflight-report`: 프리플라이트 보고서
- `node-runtime-version`: `node --version` 성공
- `npm-cli-version`: `npm --version` 성공
- `required-tool-inventory`: 제한된 재시도 뒤 모든 필수 도구가 실제로 사용 가능함
- `optional-tool-disposition`: 모든 선택 도구가 `OK` 또는 이유가 있는 안전한 `SKIP`

검증 결과를 수락 증거로 제출하고 이 단계에서 멈춘다.
