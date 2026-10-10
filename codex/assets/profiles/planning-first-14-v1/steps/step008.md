---
name: step008
phase: review
---

> 2.2 품질 게이트: 변경 뒤 플러그인 `scripts/quality-gate.mjs`를 `--workspace
> "<project-root>"`로 실행하고 종료 코드 0 및 현재 소스에 대한 PASS를 확인한다.
> 설정은 `docs/QUALITY.md`를 따른다. 누락·실패·오래된 증거로 마일스톤을 완료하지 않는다.

# Step 8 - 클라이언트 사이드 라우팅

## 목표

3단계가 만든 최초 application 구현을 다시 시작하지 않는다. 6단계 JavaScript 모듈화,
7단계 CSS 분리와 5단계 레이아웃 검증을 반영한 현재 source와 단일 최종 HTML에 클라이언트 사이드
라우팅을 통합하고 회귀를 점검한다. semantic document structure, accessibility,
reference와 current build 계약도 함께 보존한 뒤 독립 검증으로
두 번째 quality milestone을 기록한다.

이 단계는 routing 통합과 milestone gate를 소유한다. 9단계의 전체 E2E와 실제 배포 경로
검증, 14단계의 최종 browser·console 검증을 대신하거나 미리 완료하지 않는다.

## 입력과 산출물

- 입력: `step_archive/step002_레이아웃설계_chunk1.md`
- 입력: `step_archive/step002_전체설계_chunk1.md`
- 입력: `step_archive/step004_smoke_test.md`
- 입력: `step_archive/outputs/trust5_r1.md`
- 입력: `dist/index.html`
- 입력: `step_archive/step006_js모듈화.md`
- 입력: `step_archive/step007_css분리.md`
- 입력: `step_archive/outputs/step005_검증_r1.md`
- 필수 선행 항목: `step002`, `step004`, `step006`, `step007`, `step005`
- 산출물: `step_archive/step008_routing검증.md`
- 산출물: `step_archive/outputs/trust5_r2.md`

- 네트워크: 사용하지 않는다.
- 시각 검토: 필요하지 않다.

## 실행 역할

가능한 경우 라우팅 통합 구현자 역할과 milestone 독립 검증자 역할을 서로 다른 실행
주체에 맡긴다. 구현자는 선언된 routing ownership만 바꾸며,
독립 검증자는 산출물과 application source를 수정하지 않는다. 위임 기능을 사용할 수 없으면
현재 실행자가 두 역할을 명확히 분리해 순서대로 수행하고, 별도 역할을 위임했다고 기록하지
않는다. 정상 권한 확인을 유지하고 자동 승인이나 권한 우회를 금지한다.

## routing 통합과 회귀 범위

`docs/ROUTING.md`를 기준으로 build가 만드는 단일 최종 `dist/index.html` 안의 route
manifest, 각 `data-harness-screen` root와 canonical URL을 일대일로 대조한다. manifest의
모든 화면에는 정확히 하나의 root와 URL이 있고, 현재 URL의 화면 하나만 보인다.
document title, active navigation, heading focus와 scroll 결과가 URL·화면 전환과 함께
갱신되는지 확인한다. 여러 화면인 앱은 각 화면의 다른 선언 화면으로 향하는 실제
`a[href]` 이동도 확인한다.

모든 선언 route에 대해 initial load, deep link, reload를 확인한다. 여러 화면인 앱은
각 화면의 outgoing navigation과 Back/Forward traversal도 검사한다. empty 또는 unknown route는 fallback 화면을 렌더링하고
추가 history entry 없이 canonical fallback URL로 replace해야 한다. 실제 앱에 존재하는
일반 fragment의 anchor target, focus와 scroll 결과도 기록한다. 한 화면 앱의 outgoing link와
화면 간 Back/Forward는 `not-applicable: single-screen`으로 기록하고, 직접 진입·reload·fallback은 실행한다.

URL mode와 browser API를 별개로 다룬다. HTTP(S)에서 `navigation.navigate`와
`navigation.addEventListener`가 함수이고, `navigation.currentEntry`가 null이 아니며,
`NavigateEvent.prototype.intercept`를 실제로 사용할 수 있을 때만 Navigation API backend를
선택한다. 각 navigate event의 `canIntercept`도 확인한다. 그 외에는 manifest가 선언한
History API 또는 hash backend를 사용한다. 동시에 backend 하나만 활성화하고 두 분기 모두
initial URL을 명시적으로 렌더링한다. capability 차이 때문에 hash/history URL mode를
암묵적으로 바꾸거나 file URL에 가상 history path를 만들지 않는다.

modified click, 새 tab·window target, download, 외부 URL, form submit과 일반
`#section` anchor는 브라우저 native behavior를 보존한다. 앱 hash는 `#/...`와 일반
fragment를 구분한다. 중복 render·history entry를 만들지 않으며 실제 Navigation API 분기와
API가 없거나 일부 capability만 있는 fallback 분기를 각각 검사한다. URL 동작만으로
사용 API를 단정하지 말고 지원 HTTP(S) 브라우저의 실제 interception과 선택 backend를
관측한다. 가짜 API 주입만으로 native 분기의 증거를 대체하지 않는다.

hash mode의 HTTP와 직접 file 동작을 확인하고, history mode이면 app-document 경로를 같은
최종 HTML로 돌려주는 server fallback 설정과 로컬 직접 진입·reload 결과를 확인한다.
API·asset 경로의 진짜 404도 함께 검토해 catch-all 범위를 제한한다. hash/file에서는
server rewrite가 불필요한 사유와 실제 동작을 기록한다. 내부 fallback fixture나 정적
검사는 배포 rewrite 증거가 아니다. 실제 배포 환경의 direct visit와 refresh 증거는
9단계 전체 E2E에서 이미 승인되고 준비된 배포 대상이 있을 때 수집한다. 대상이 없으면
로컬 검증과 배포 검증 대기를 구분하며, 14단계는 현재 HTML에 결합된 최종 browser 보고서를 검증한다.

## 개발 source와 최종 HTML 경계

화면별 DOM은 같은 HTML 안에서 서로 다른 `data-harness-screen` root와 canonical URL에
연결하면 충분하다. HTML을 별도 component로 추출하는 작업은 선택 사항이며 이 단계의
완료 조건이 아니다. 기존 heading hierarchy, document order와 progressive enhancement를
보존한다.

개발 source의 JavaScript는 external JavaScript reference로, CSS는 external CSS
reference로 유지한다. 개발 source에 inline script, style element, style attribute를
만들지 않는다. 이 규칙은 개발 source에 한정한다. build가 만드는 self-contained
`dist/index.html`의 최종 bundling과 `docs/ROUTING.md`가 요구하는 정확히 하나의 inline
`<script id="harness50-routes" type="application/json">` data manifest를 금지하지 않는다.

## 구조와 접근성 검증

source와 rendered DOM을 대조해 semantic landmark, accessible label, keyboard order,
visible focus, form state와 live region을 확인한다. 모든 asset reference와 stylesheet,
module, link, image path가 존재하고 expected target을 가리키는지 검사한다. 중복 ID,
깨진 reference, empty accessible name 또는 landmark hierarchy 오류는 차단한다.

화면 전환 뒤 title·active state·heading focus·scroll 순서가 일관되고, 숨긴 screen이
접근성 tree와 tab order에 남지 않는지 확인한다. native link, form과 anchor 동작을
가로채거나 focus를 잃는 회귀도 차단한다.

## 현재 build 검증

project manifest에 선언된 정확한 build 명령을 정상 권한 흐름으로 실행하고 exit code
0만 성공으로 인정한다. build가 만든 `dist/index.html`이 symbolic link가 아닌 일반
파일이며 0바이트보다 크고, UTF-8 content에 대소문자와 attribute를 허용하는 `<html`
opening과 `</html>` closing boundary가 있는지 확인한다. 이전 artifact가 아닌지
before/after metadata와 digest도 기록한다.

current build의 최종 HTML에서 route manifest와 screen root를 다시 파싱하고, 개발 source의
external asset 정책과 최종 dist bundling을 서로 다른 검사로 기록한다. source external
reference 검사만으로 final routing이나 self-contained dist를 통과 처리하지 않는다.

## 독립 milestone 검증
새 완료 영수증을 만들 때 런타임은 `inspectQualityReport`로
`step_archive/outputs/quality-gate.json`의 현재 `PASS`를 다시 검사한다. 테스트·린트·타입·보안
검사와 측정 커버리지가 현재 소스·설정·커버리지 파일에 결합되어야 한다. 보고서 누락·실패·변경은
현재 시도를 미완료로 남기며 새 영수증을 만들지 않는다. 검증한 보고서 SHA-256은 런타임이
`measured-quality-report` 증거로 영수증에 기록한다. 기존 영수증의 재시도·복구는 과거 기록을
보존하며 현재 보고서로 기존 영수증을 다시 쓰지 않는다.


milestone 독립 검증자는 external reference, rendered structure, accessibility, current
build, `dist/index.html`과 다섯 routing 완료 조건을 처음부터 다시
확인한다. application source, 8단계 보고서와 milestone을 직접 수정하지 않는다. 누락,
실행하지 않은 검사, 오래된 증거 또는 실패 결과를 `PASS`로 바꾸지 않는다.

build, structure, accessibility와 routing 검사가 모두 `PASS`인 뒤에만
`step_archive/outputs/trust5_r2.md`를 만든다. finding 또는 검사 실패가 있으면 시도별 명령,
exit code와 원인을 보고서에 기록하고 현재 단계에서 멈춘다. 실패한 상태로 9단계에
진행하지 않는다.

`step_archive/step008_routing검증.md`에는 source와 rendered 구조,
reference·accessibility 결과, route/screen/URL map, backend capability와 선택,
traversal·native behavior·server fallback 검토, 정확한 build command·exit code, dist
metadata와 digest, 독립 판정을 기록한다.

## 완료 조건

- `routing-integration-report`: 라우팅 검증 보고서에 routing·구조·접근성·build 증거와 독립 판정이 기록됐다.
- `review-milestone`: 모든 필수 gate 뒤 두 번째 quality milestone이 기록됐다.
- `project-build-command`: manifest의 정확한 non-optional build가 성공했다.
- `external-assets-only`: 개발 source의 JavaScript와 CSS가 external reference이며 final bundling과 JSON data manifest가 검증됐다.
- `accessibility-reference-integrity`: 구조·label·keyboard·focus·asset reference가 유효하다.
- `dist-html-boundary`: current build의 dist HTML이 regular·nonempty·boundary 조건을 충족한다.
- `independent-milestone-verifier`: 비수정 독립 검증자가 모든 gate를 확인했다.
- `pass-only-quality-milestone`: 모든 필수 검사가 `PASS`인 뒤에만 milestone을 만들었다.
- `routing-screen-url-map`: 단일 최종 HTML의 manifest, screen root와 canonical URL이 일대일로 일치한다.
- `routing-deep-link-traversal`: initial·deep link·reload·unknown replace와 여러 화면의 outgoing·Back/Forward가 통과했다. 한 화면의 화면 간 이동은 `not-applicable: single-screen`으로 기록했다.
- `routing-navigation-backends`: 엄격한 Navigation API capability와 History/hash fallback 중 정확히 하나의 backend가 선언 URL mode 그대로 동작한다.
- `routing-server-fallback`: hash/file 동작과 history server fallback 구성을 검토하고 내부 fallback을 배포 증거로 오인하지 않았다.
- `routing-native-behavior`: native link·form·anchor와 title·active·focus·scroll 동작이 보존됐다.

보고서와 milestone 및 검증 결과를 수락 증거로 제출하고 현재 단계에서 멈춘다.
workflow 상태와 영수증만이 이후 진행을 소유한다.
