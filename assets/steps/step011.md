---
name: step011
persistence: session
---

# Step 11 - tokei 코드 통계 환경 설치

<!-- MOAI-ENRICHED v1 -->
> **🛠 TOOLING STEP** — 외부 도구 설치/검증. Plan-Run-Sync 분리 미적용.
> 모델 정책: **haiku** (조사·설치).
> SPEC 자동 생성: step_archive/specs/SPEC-011.md (Stop hook).

## 검증

`tokei --version`로 확인한다. 없으면 `scoop install tokei`·`brew install tokei`·`cargo install tokei` 중 이 PC에서 쓸 수 있는 명령으로 설치하고 다시 확인한다. 설치와 확인을 합쳐 최대 3회 시도하며 정상 권한 확인을 유지한다.

`step_archive/step011_tokei_test.md`에 명령, 종료 코드, 확인된 버전 또는 `SKIP`과 사유를 기록한다. 패키지 이름·디렉터리 존재만으로 성공을 적지 않는다.

이 도구는 선택이다. 끝내 쓸 수 없으면 `SKIP`과 사유·대체 방법을 기록하고 완료한다. 자동 검증 훅은 번들되지 않는다.

서브에이전트는 항상 haiku를 사용한다.

## Self-Calibration

실행 완료 후 다음을 스스로 평가하라:

- 이 Step의 목표가 100% 달성되었는가? (Y/N)
- 불확실한 부분이 있는가? (있으면 구체적으로 명시)
- N 또는 불확실한 부분이 있으면 재실행한다. 3회 재시도 후에도 미달이면 오류 기록 후 다음 Step 진행.

---

이 지침을 완료한 즉시 자동으로 step012.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.

