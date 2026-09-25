---
description: harness50 진행 상태 리셋 — progress.json을 current_step=1, completed=[]로 초기화. step_archive/archived/ 본문은 건드리지 않는다.
---

# /harness-reset

먼저 `step_archive/.harness50-codex/state.json`이 있는지 확인한다. 있으면 이 작업 공간은
Codex 상태 관리자가 소유하므로 progress.json을 만들거나 덮어쓰지 않고, 다음 1줄만 보고하고
종료한다: `harness50: Codex workflow 작업 공간 — Claude progress는 리셋하지 않음. Codex workflow
리셋은 Codex의 $harness50-reset으로 사용자가 직접 실행`.

`step_archive/progress.json`이 없으면 만들지 않고 `harness50: 리셋할 진행 기록 없음 — /webapp <주제>로 시작`
1줄 보고 후 종료한다.

그 외에는 `step_archive/progress.json`을 다음 형식으로 덮어쓴다:

```json
{
  "current_step": 1,
  "completed_steps": [],
  "skipped_steps": [],
  "failed_steps": [],
  "total_steps": 50,
  "metrics": { "total_duration_minutes": 0, "total_sessions": 0, "steps_per_session_avg": 0 },
  "session_history": [],
  "last_updated": "<현재 ISO>"
}
```

## 보존 대상 (삭제 금지)

- `step_archive/archived/step001~050.md` (본문 그대로)
- `step_archive/specs/SPEC-*.md` (자동 생성된 SPEC들)
- `step_archive/outputs/trust5_r*.md` (Trust5 결과)
- `step_archive/TOPIC/TOPIC.md` (사용자가 명시 삭제 요청 시에만)

## 출력

1줄 보고: `harness50 리셋 완료 — step001부터 재시작 가능 (새 주제는 리셋 후 /webapp <주제>)`

추가 출력·확인 질문 금지.
