---
name: step015
persistence: session
---

# Step 15 - madge 순환 의존성 탐지 환경 설치

> **🔖 @MX 태그 의무화 진입점 (MoAI mx-tag-protocol SoT 준수)**
>
> Step 015 이후 모든 신규 소스 파일은 MoAI-ADK 정식 4종 태그 체계를 따른다:
> ```js
> // @MX:NOTE: <컨텍스트·의도 — 매직 상수, 비즈니스 규칙>
> // @MX:WARN: <위험 영역>  (@MX:REASON 필수)
> // @MX:ANCHOR: <불변 계약 fan_in≥3>  (@MX:REASON 필수)
> // @MX:TODO: <미완료 작업>
> ```
> 최소 @MX:NOTE 1개 권장. `mx-tag-validator.ps1`가 PostToolUse(Write/Edit)에서 자동 검증 (fail-open).
> 출처: MoAI/.claude/rules/moai/workflow/mx-tag-protocol.md

## 설치

```bash
npm install -D madge
```

## 검증

`npx --no-install madge --version`로 확인한다. `npx`에는 `--no-install`을 붙여 설치되지 않은 패키지를 내려받지 않는다. 없으면 위 `## 설치` 명령으로 설치하고 다시 확인한다. 설치와 확인을 합쳐 최대 3회 시도하며 정상 권한 확인을 유지한다.

`step_archive/step015_madge_test.md`에 명령, 종료 코드, 확인된 버전 또는 `SKIP`과 사유를 기록한다. 패키지 이름·디렉터리 존재만으로 성공을 적지 않는다.

이 도구는 선택이다. 끝내 쓸 수 없으면 `SKIP`과 사유·대체 방법을 기록하고 완료한다. 자동 검증 훅은 번들되지 않는다.

서브에이전트는 항상 haiku를 사용한다.

## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- N 또는 불확실한 부분이 있으면 재실행한다. 3회 재시도 후에도 미달이면 오류 기록 후 다음 Step 진행.

---

이 지침을 완료한 즉시 자동으로 step016.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.
