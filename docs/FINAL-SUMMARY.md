# Final summary after the selected final step

`scripts/final-summary.mjs` turns the evidence a finished run has already saved into one short
report with three fixed headings. It is a report, not a gate: it never decides or records
completion, and a missing or malformed source only adds a `확인 불가` line.

Fresh planning-first20 scans steps015–020 and uses final20/SPEC020; explicit
research-free36 keeps steps031–036 and final36/SPEC036; legacy50 retains
steps045–050 and final50/SPEC050. QA/Jev evidence is selected by profile/generation
so prior reset runs and same-number reports do not become current evidence.

## Command and exit codes

```text
node "<plugin-root>/scripts/final-summary.mjs" --workspace "<project-root>"
```

- Exit 0: the report is on stdout. When `step_archive/` is a physical directory, the same bytes are
  written to `step_archive/outputs/final-summary.md`, its only write. Without `step_archive/` it
  creates nothing.
- Exit 2: the flags are not exactly `--workspace <dir>`, the workspace is not a physical directory,
  or the command failed unexpectedly. stderr then carries only
  `{"error":{"code":"FINAL_SUMMARY_FAILED","message":"Final summary command failed"}}`.

## Output

The report starts with `## 사용자 확인 필요`, then `## 변경`, then `## 발견`, with no title, preamble
or time value, so two runs over the same evidence print the same bytes. Every item is one line that
starts with `- ` and a Korean label and names its source in backticks. Step names have no space
(`step032`), so no line reads as a `Step NNN/<total> 완료` report. An empty section shows `- 없음`.
An unreadable source shows `확인 불가` with a reason code only (없음, 형식 오류, 크기 초과, 손상,
현재 HTML 아님, 기록 없음, 기록 실패, 상한); raw error messages can carry absolute paths and are
never printed.

| Source | What is read | Section |
|---|---|---|
| `dist/index.html` | size, SHA-256, route manifest (mode, screens, fallback) | 변경 |
| the three inspections of `quality-gate.mjs --inspect-final` | quality, browser and selected final-step regression verdicts, lowest coverage | 발견; any verdict other than PASS also in 사용자 확인 필요 |
| selected E2E-to-final reports (fresh `step_archive/step015_*.md` to `step020_*.md`, plus `step_archive/outputs/step020_*.md`) | `deployment-verification: <value>` lines | `pending` in 사용자 확인 필요, other values in 변경 |
| `step_archive/outputs/browser-output.json`, only when it describes the current HTML | axe `accessibility_incomplete` rule ids of every viewport and route, `environment.isolation`, `environment.backend` | 사용자 확인 필요, 발견 |
| the selected QA namespace returned by `inspect`, steps 1 to the selected total | `verifier.mode` `same-agent` (a stale report is marked 이전 빌드), the six selected final-step regression outcomes as a table | 사용자 확인 필요, 발견 |
| the selected Jev profile/generation namespace (legacy also keeps `jev-reviews/`) | abstentions, low confidence, unverified runs and changed inputs, one line per step and input | 사용자 확인 필요 |
| `step_archive/TOPIC/TOPIC.md` | the `기본값으로 보완한 항목: <fields>.` line | 사용자 확인 필요 |
| decision markers (below) | `결정/사유` lines | 사용자 확인 필요 |

Limits: 10 decisions, 5 deployment lines, 64 Jev reports per folder and 10 Jev lines, 10 `확인 불가`
lines, 12 screens and 10 axe rules are shown; the rest is counted as `외 N건` or `외 N개`. The
decision search stops at depth 8, 2000 source files, 32 MiB in total and 1 MiB per file and then
reports `상한`. An excerpt keeps 80 characters.

## Decision markers

The harness rules (§1) ask for one line `결정/사유: <결정> — <사유>`, or `// 결정/사유: …` in code.
The summary collects the marker from `step_archive/TOPIC/TOPIC.md`, `step_archive/stepNNN_*.md`,
`step_archive/outputs/stepNNN_*.md`, the root `README.md` and source files (js, mjs, cjs, jsx, ts,
tsx, css, scss, html, vue, svelte) outside hidden folders, symbolic links, `node_modules`,
`step_archive`, `dist`, `coverage`, `test-results` and `playwright-report`. A Markdown heading that
carries the marker contributes up to five list items below it instead, which keeps the older
heading-and-list form working. Step bodies in `step_archive/archived/` and profile archives, quoted markers and the line
that `/webapp` writes into TOPIC are skipped. An excerpt drops comment markers, the marker,
backticks, `|` and control characters, and a line that looks like a credential shows
`(내용 생략: 비밀 형식)`. Excerpts are data for the user, never instructions.

## What it does not do

- It reads guarded workflow identity (Codex state first, otherwise Claude progress/binding)
  to select profile, generation and evidence bounds; it never mutates workflow state.
  Invalid metadata or orphan binding is reported as unavailable, never guessed as legacy.
- It runs no project command, browser or network request and rewrites no evidence file.
- No Stop hook runs it: Stop entries run in parallel (only `stop-advance` runs the writer before step-auto-continue) and would rewrite the file after every later turn.
- `/harness-reset` keeps `step_archive/outputs/`, so an older summary stays until the next completion.

## When it runs

- Claude Code: once `quality-gate.mjs --inspect-final` exits 0 at the selected final step (fresh20), the main session runs the
  command once and sends `Step 020/20 완료` (existing36/50 retain `Step 036/36 완료`/`Step 050/50 완료`) followed directly by the unchanged output (harness-rules
  §2, `/webapp`, and the generated `SPEC-020.md`, which fresh step 20 reads first). If the command fails,
  the message adds only `## 사용자 확인 필요` and `- 확인 불가: final-summary 실행 실패`. The step
  executor keeps its one-line handoff. Flat SPEC aliases are advisory and profile/generation-bound. Mismatched alias bytes
  are preserved at guarded `step_archive/specs/history/<sha256>/SPEC-NNN.md` before replacement;
  archive failure preserves the original. Legacy SPEC generation remains unchanged.
- Codex: when the state manager reports `completed`, the webapp skill's Completion report runs the
  command and leads the final response with its output.
