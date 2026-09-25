---
description: harness50 명명된 멈춤 해제 — paused를 풀고 첫 미완료 step부터 자율주행을 이어간다.
---

# /harness-resume

1. `step_archive/.harness50-codex/state.json`이 있으면 Codex workflow 작업 공간이다. 아무것도 쓰지 않고
   다음 1줄만 보고한다: `harness50: Codex workflow 작업 공간 — Codex의 $webapp resume을 사용`
2. 그 외에는 harness50 플러그인의 멈춤 CLI를 한 번 실행한다. `step_archive/progress.json`을 직접 편집하지 않는다.

   ```
   node "<plugin-root>/scripts/harness-pause.mjs" resume --workspace "<project-root>"
   ```

   `<plugin-root>`는 이 명령 파일이 든 harness50 플러그인 폴더(`commands/`의 상위), `<project-root>`는 현재
   프로젝트 루트다. exit 2면 stderr JSON의 `error.code`를 1줄로 보고하고 끝낸다.
3. `changed`가 false여도(멈춰 있지 않았어도) 이어간다. `resumed_from.reason`이
   `permission-denied`·`required-tool-failed`·`required-input-missing`이면 그 원인이 풀렸는지 먼저 확인한다.
   풀리지 않았으면 헌법 §2-1 절차로 다시 멈추고 멈춤 보고 한 줄로 턴을 끝낸다. `user-request`는 이 명령 자체가
   해제 요청이다.
4. 출력의 `next_step`이 null이면(모든 step 완료 기록) `harness50: 재개할 step 없음 — 모든 step 완료` 1줄로 끝낸다.
   아니면 `step_archive/archived/stepNNN.md`(없으면 `step_archive/stepNNN.md`)를 읽고 `/webapp` 연속 실행 규약대로
   진행한다: 실행 → `Step NNN/50 완료` 1줄 보고 → 즉시 다음 step.
