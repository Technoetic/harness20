---
description: harness50 진행 상태 조회 — 현재 step / 완료 step 수 / Trust5 결과
---

# /harness-status

`step_archive/progress.json`을 읽어 한 줄로 보고:

```
harness50: <completed>/50 완료 | current=<stepNNN 또는 -> | r1=<판정> r2=<판정> r3=<판정>
```

- current는 첫 미완료 Step이다. 50/50이면 `-`로 쓴다.
- `paused`가 있고 `false`가 아니거나 `status`가 `paused`이면(명명된 멈춤, 헌법 §2-1) 줄 끝에
  ` | 멈춤: <pause_reason> @step<paused_step> — <pause_note>`를 붙인다. pause_reason이
  `permission-denied`·`required-tool-failed`·`required-input-missing`·`user-request`가 아니면 `unknown`,
  paused_step이 없거나 범위 밖이면 첫 미완료 Step을 쓴다.
- progress.json 없으면: "harness50 비활성 — /webapp <주제> 로 시작"
- 단, `step_archive/.harness50-codex/state.json`이 있으면 progress.json 대신 harness50 플러그인의
  `node codex/scripts/harness-state.mjs show --workspace "<project-root>"` 결과(`status`, `current_step`,
  완료 수)로 `harness50 (Codex): <status> | current=<stepNNN 또는 -> | <completed>/50 완료`를 보고한다.
  `current_step`이 null이면(완료된 워크플로 등) `current=-`로 쓴다.
  이 경우 progress.json 유무로 비활성이라고 판단하지 않는다.
- <판정>은 step_archive/outputs/trust5_rN.md의 `Verdict:` 줄 값(PASS·FAIL·INCOMPLETE), 파일이 없으면 `-`. 점수(예: 42/50)는 쓰지 않는다(docs/QUALITY.md)

추가 출력 금지. 1줄 보고만.
