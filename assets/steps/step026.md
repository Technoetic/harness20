---
name: step026
persistence: session
---

# Step 26 - 기획 보강: GitHub 조사결과

<!-- MOAI-ENRICHED v1 -->
> **📐 Plan → Run → Sync** (MoAI-ADK 워크플로우)
> - **Plan**: 본 Step의 SPEC 자동 생성 `step_archive/specs/SPEC-026.md` 를 먼저 읽고 Acceptance 기준을 확정한다.
> - **Run**: 본문 지침대로 실행. 구현 산출물에는 `@MX:NOTE` 최소 1개 부착 (위험 시 `@MX:WARN` + `@MX:REASON`, 계약 시 `@MX:ANCHOR` + `@MX:REASON`, 미완료 시 `@MX:TODO`). MoAI mx-tag-protocol SoT 준수.
> - **Sync**: 결과 파일 `step_archive/step026_*.md` 저장 후 1줄 완료 보고 `Step 026/50 완료`.
>
> **모델 정책**: 조사·구현 서브에이전트 = **haiku** (CLAUDE.md 정책 준수). 평가 라운드만 sonnet.
>
> **위치**: 구현·정리 구간 (E2E 검증 step045 전)

## Memory-of-Thought

기획 전에 다음을 확인하라:
- 이전 단계 검증 보고서(`step_archive/outputs/step0*_검증*.md`)의 `## 실패 패턴` 절(있으면) — 이전에 실패한 패턴을 반복하지 않는다
- 이전 기획 Step의 결과 파일 — 중복되거나 상충되는 내용이 없는지 확인한다
- 성공한 기획 패턴이 있으면 재활용한다

## 실행 내용

step017 GitHub 조사결과를 기반으로 기획 문서를 보강한다.

**최종 조사 입력:** `step_archive/outputs/step024_검증_r1.md`의 최종 판정과 보충 수집 manifest를 먼저 읽는다.
원래 조사 청크와 manifest가 가리키는 `step_archive/supplemental/step024/<attempt-id>/round-N/`의
보충 원문·재분석을 함께 반영한다. 최종 검증이 미완료이면 이 단계도 진행하지 않는다.
기존 출처를 보존하고 각 결정에서 원본 또는 보충 출처를 추적 가능하게 기록한다.

**필요한 파일:**
- step025_planning_chunk*.md (기획 문서)
- step017_조사결과_chunk*.md (GitHub 조사결과)

기획 문서를 읽고, step017 GitHub 조사결과에서 반영할 내용을 식별하여 기획 문서를 업데이트한다.

step017/019의 검증된 `exhausted-no-reference` 처분이면 해당 출처 보강을 적용 불가로 명시하고 기존 기획을 유지한다.
없는 clone·API·코드 패턴을 만들지 않는다. 네트워크·권한 실패나 미완료 조사를 no-reference로 바꾸지 않는다.

Class 지향으로 기획한다.

합리적인 선에서 최대한 많은 서브에이전트를 병렬로 사용해야 한다 (동시 실행 최대 10개).

**보강된 기획 결과는 기존 청크를 덮어쓴다:**

```
step025_planning_chunk1.md (500줄 이하)
step025_planning_chunk2.md (500줄 이하)
step025_planning_chunk3.md (500줄 이하)
...
```

**작성 규칙**:
- 각 청크는 500줄 이하로 작성 (성능 최적화)
- 저장 후 각 청크가 500줄 이하이고 UTF-8(BOM 없음)인지 직접 확인한다. 자동 검증 훅은 번들되지 않는다.
- 청크 그대로 유지 (병합 안 함)

서브에이전트는 항상 haiku를 사용한다.


## Self-Calibration

기획 완료 후 다음을 스스로 평가하라:
- 이전 실패 패턴을 피하고 있는가? (Y/N)
- N이면 해당 부분을 보완하고 재평가한다.

## 오류 발생 시

오류 발생 시 원인을 분석하고 수정한 뒤 재시도한다. 3회 재시도 후에도 실패하면 오류·미해결 항목·다음 검사를 기록하고 현재 Step을 INCOMPLETE로 인계한다. 완료 보고와 다음 Step 진입은 금지한다.


---

필수 요구와 현재 검증 증거가 모두 PASS일 때만 이 지침을 완료하고 자동으로 step027.md를 읽고 수행한다. 사용자 확인을 기다리지 않는다.


