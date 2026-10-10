---
name: step008
persistence: session
---

> 2.2 품질 게이트: 변경 뒤 플러그인 `scripts/quality-gate.mjs`를 `--workspace
> "<project-root>"`로 실행하고 종료 코드 0 및 현재 소스에 대한 PASS를 확인한다.
> 설정은 `docs/QUALITY.md`를 따른다. 누락·실패·오래된 증거는 다음 단계로 넘기지 않는다.

# Step 8 - 클라이언트 사이드 라우팅

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-008.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step008_routing검증.md`와 `step_archive/outputs/trust5_r2.md`를 저장하고 검증 결과를 보고한다.
>
> **모델 정책**: 구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 3단계 최초 구현과 6단계 JavaScript 모듈화, 7단계 CSS 분리 뒤의 routing 통합·회귀 gate. 9단계 전체 E2E와 14단계 최종 검증은 그대로 유지한다.

## 목표와 범위

3단계의 최초 routing 구현을 다시 시작하지 않는다. 6·7단계가 반영된 현재 source와
단일 최종 HTML을 기준으로 `docs/ROUTING.md` 계약을 통합하고 회귀를 점검한다. 기존의
semantic document structure, 접근성, reference, current build와 독립 quality
milestone gate도 함께 보존한다.

라우팅 검증 보고서는 `step_archive/step008_routing검증.md`에 기록한다.
이 단계의 내부 fixture나 정적 검사는 실제 배포 rewrite 증거가 아니며, 실제 배포 direct visit와
refresh 검증은 9단계에서 이미 승인되고 준비된 배포 대상이 있을 때만 수행한다.
배포 대상이 없으면 로컬 검증과 배포 검증 대기를 구분하며, 14단계는 현재 HTML에 결합된 최종 browser 보고서를 검증한다.

## 개발 source와 최종 HTML 경계

- 개발 HTML entry는 `src/index.html`에 둔다.
- 화면별 DOM은 같은 HTML 안에서 서로 다른 `data-harness-screen` root와 canonical URL에
  연결하면 충분하다. HTML을 별도 component로 추출하는 작업은 선택 사항이며 이 단계의
  완료 조건이 아니다.
- heading hierarchy, document order와 progressive enhancement를 보존한다.
- 개발 source의 JS/CSS는 external JavaScript/CSS 파일로 참조하고 inline script, style
  element, style attribute를 만들지 않는다.
- external 정책은 개발 source에 한정한다. bundler가 만드는 self-contained
  `dist/index.html`과 정확히 하나의 inline
  `<script id="harness50-routes" type="application/json">` data manifest를 허용하고 검증한다.

semantic landmark, accessible label, keyboard order, visible focus, form state, live region,
중복 ID와 모든 asset reference를 source와 rendered DOM에서 점검한다.
manifest의 정확한 build 명령이 exit code 0인지, current `dist/index.html`이 symlink가 아닌
regular nonempty UTF-8 파일이고 `<html`/`</html>` boundary를 갖는지도 확인한다.

## routing 통합과 회귀 점검

`docs/ROUTING.md`를 기준으로 다음을 모두 실행하고 명령, 관측값과 판정을 라우팅 검증 보고서에
남긴다.

1. 단일 최종 `dist/index.html`의 route manifest, `data-harness-screen` root와 canonical
   URL을 일대일로 대조한다. 현재 URL의 screen root 하나만 표시하며 document title,
   active navigation, heading focus와 scroll을 확인한다. 여러 화면인 앱은 각 화면의
   다른 선언 화면으로 향하는 실제 `a[href]`도 확인한다.
2. 모든 route에서 initial load, deep link, reload를 확인한다. 여러 화면인 앱은 각 화면의
   outgoing navigation과 Back/Forward도 검사한다. empty·unknown route는 fallback을
   렌더링하고 추가 entry 없이 canonical URL로
   replace해야 한다. 실제 앱에 존재하는 일반 fragment도 target으로 이동해야 한다.
   한 화면 앱의 outgoing link와 화면 간 Back/Forward는 `not-applicable: single-screen`으로
   기록하고 직접 진입·reload·fallback은 검사한다.
3. HTTP(S)에서 `navigation.navigate`와 `navigation.addEventListener`가 함수이고,
   `navigation.currentEntry`가 null이 아니며, `NavigateEvent.prototype.intercept`가 실제로
   사용 가능한 경우에만 Navigation API backend를 고른다. event별 `canIntercept`도 확인한다.
   그렇지 않으면 manifest에 선언된 History API 또는 hash fallback을 쓴다. backend는 정확히
   하나만 활성화하고 initial URL을 명시적으로 render한다. capability에 따라 hash/history
   URL mode를 몰래 바꾸거나 file URL에 가상 history path를 만들지 않는다.
4. modified click, 새 tab·window target, download, 외부 URL, form submit과 일반
   `#section` anchor의 native behavior를 보존한다. 앱 hash `#/...`와 일반 fragment를
   구분하고 중복 render·history entry를 만들지 않는다. 실제 Navigation API 분기와 API가
   없거나 일부 capability만 있는 fallback 분기를 각각 검사한다. URL 동작만으로 사용 API를
   단정하지 말고 실제 지원 HTTP(S) 브라우저의 interception과 backend 선택을 관측한다.
   가짜 API 주입만으로 native 분기 증거를 대체하지 않는다.
5. hash mode의 HTTP와 직접 file 동작을 점검한다. history mode이면 app-document 경로를
   같은 최종 HTML로 돌리고 API·asset missing은 진짜 404로 남기는 server fallback 구성을
   검토하고 로컬 직접 진입·reload도 확인한다. hash/file에서는 rewrite가 불필요한 사유와
   동작을 기록한다. 내부 fallback server의 성공을 실제 배포 설정 증거로 기록하지 않는다.

## 실행과 독립 검증

가능하면 라우팅 통합 구현자 역할과 milestone 독립 검증자 역할을 분리한다. 구현자는 선언한
routing ownership만 변경한다. 독립 검증자는 application source, 라우팅 검증 보고서, milestone을
수정하지 않고 structure·accessibility·reference·build와 다섯 routing 완료 조건을 처음부터
재검사한다. 위임할 수 없으면 한 실행자가 역할을 분리해 순서대로 수행하며 위임했다고
기록하지 않는다.

모든 필수 검사가 `PASS`인 뒤에만 `step_archive/outputs/trust5_r2.md`를 만든다. 누락,
실행하지 않은 검사, 오래된 증거와 실패 결과는 `PASS`가 아니다. 오류를 분석하고 수정한 뒤
최대 3회까지 재검사할 수 있다. 3회 뒤에도 실패하면 시도별 명령, exit code와 원인을
라우팅 검증 보고서에 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지한다.
한도 소진이나 같은 필수 항목의 연속 미수정으로 끝나면 `required-input-missing`, 필수 실행·시각 검사 기능이 없으면 `required-tool-failed`로 헌법 §2-1 명명된 멈춤을 기록하고 턴을 끝낸다.
멈춤의 증거 파일(`--evidence`)은 라우팅 검증 보고서 `step_archive/step008_routing검증.md`이고, `--note`는 헌법 §2-1대로 작은따옴표로 감싼 사용자가 할 일 1문장이다.

## 완료 조건

- `routing-integration-report`: 라우팅 검증 보고서에 routing·구조·접근성·build 증거와 독립 판정이 기록됐다.
- `review-milestone`: 모든 필수 gate 뒤 두 번째 quality milestone이 기록됐다.
- `project-build-command`: manifest의 정확한 non-optional build가 성공했다.
- `external-assets-only`: 개발 source의 JS/CSS external 정책과 final bundling·JSON data manifest가 함께 검증됐다.
- `accessibility-reference-integrity`: 구조·label·keyboard·focus·asset reference가 유효하다.
- `dist-html-boundary`: current build의 dist HTML이 regular·nonempty·boundary 조건을 충족한다.
- `independent-milestone-verifier`: source·보고서를 수정하지 않는 독립 검증자가 모든 gate를 확인했다.
- `pass-only-quality-milestone`: 누락이나 실패 없이 모든 필수 검사가 `PASS`인 뒤에만 milestone을 만들었다.
- `routing-screen-url-map`: 단일 최종 HTML의 manifest, screen root와 canonical URL이 일대일로 일치한다.
- `routing-deep-link-traversal`: initial·deep link·reload·unknown replace와 여러 화면의 outgoing·Back/Forward가 통과했다. 한 화면의 화면 간 이동은 `not-applicable: single-screen`으로 기록했다.
- `routing-navigation-backends`: 엄격한 Navigation API capability와 History/hash fallback 중 하나의 backend만 선언 URL mode 그대로 동작한다.
- `routing-server-fallback`: hash/file 동작과 history server fallback 구성을 검토하고 내부 fallback을 배포 증거로 오인하지 않았다.
- `routing-native-behavior`: native link·form·anchor와 title·active·focus·scroll 동작이 보존됐다.

## Budget Forcing

완료 선언 전에 빠뜨린 route, browser backend, native behavior와 구조·접근성 edge case가 없는지
검토한다. 검토하지 않았거나 필수 증거 하나라도 누락되면 완료를 선언하지 않는다.

## Self-Calibration

- 구조·접근성·build 요구가 모두 충족됐는가? (Y/N)
- 다섯 routing 완료 조건이 모두 실제 증거로 통과했는가? (Y/N)
- 독립 검증자가 source·보고서를 수정하지 않고 같은 결론을 냈는가? (Y/N)

하나라도 N이면 보완 후 재검사한다. 최대 3회 뒤에도 N이면 N인 항목과 시도별 원인을 라우팅 검증 보고서에
기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지한다.
한도 소진이나 같은 필수 항목의 연속 미수정으로 끝나면 `required-input-missing`, 필수 실행·시각 검사 기능이 없으면 `required-tool-failed`로 헌법 §2-1 명명된 멈춤을 기록하고 턴을 끝낸다.
모두 Y이고 품질 게이트가 PASS일 때만 workflow가 step009로 진행할 수 있다.

## 정의별 입력·산출물 계약

- 입력: `step_archive/step002_레이아웃설계_chunk1.md`
- 입력: `step_archive/step002_전체설계_chunk1.md`
- 입력: `step_archive/step004_smoke_test.md`
- 입력: `step_archive/outputs/trust5_r1.md`
- 입력: `dist/index.html`
- 입력: `step_archive/step006_js모듈화.md`
- 입력: `step_archive/step007_css분리.md`
- 입력: `step_archive/outputs/step005_검증_r1.md`
- 산출물: `step_archive/step008_routing검증.md`
- 산출물: `step_archive/outputs/trust5_r2.md`

필수 수락 항목: `routing-integration-report`, `review-milestone`, `project-build-command`, `external-assets-only`, `accessibility-reference-integrity`, `dist-html-boundary`, `independent-milestone-verifier`, `pass-only-quality-milestone`, `routing-screen-url-map`, `routing-deep-link-traversal`, `routing-navigation-backends`, `routing-server-fallback`, `routing-native-behavior`
