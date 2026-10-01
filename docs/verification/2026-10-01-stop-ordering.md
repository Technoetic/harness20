# Stop ordering and transcript scan measurements (2026-10-01)

Measurements behind the 2.12.0 changes to `step-progress-writer` and the `stop-advance` sequence.
They were taken on one Windows 11 machine with Windows PowerShell 5.1 and Node.js 22, by a script
that builds a scratch workspace and dispatches the real hooks through `hooks/run-hook.mjs`. They are
a record of what was seen, not a benchmark, and the timings vary with machine load.

## Scenario

- `step_archive/progress.json`: `total_steps` 50, steps 1-11 recorded, `current_step` 12,
  `status: running`; step bodies 12 and 13 present.
- A transcript of N assistant entries, each holding one text block of about 480 characters, followed
  by one entry with the text `Step 012/50 완료`. N = 20 (12 KiB), 2,000 (1.1 MiB) and 8,000
  (4.6 MiB).
- The Stop event: `transcript_path` set, `last_assistant_message` = `Step 012/50 완료`,
  `stop_hook_active` false.
- "Stale Next": step-auto-continue named step 012, the step just reported, instead of 013.

## Before (2.11.0 hooks, writer and step-auto-continue started in parallel)

| Transcript | Writer | step-auto-continue | Stale Next | Step 12 recorded |
|---|---|---|---|---|
| 12 KiB | 1.4 s | 1.5 s | 1 of 4 | 4 of 4 |
| 1.1 MiB | 2.5-2.9 s | 1.5 s | 4 of 4 | 4 of 4 |
| 4.6 MiB | 29.3 s (stopped at its 28 s budget) | 1.5 s | 4 of 4 | 0 of 4 |

The 4.6 MiB writer did not finish: it parsed every line and joined 8,000 text blocks by repeated
string concatenation, which grows with the square of the number of blocks.

## After (2.12.0)

- Writer only, same transcripts, still started in parallel with step-auto-continue: 1.4-1.8 s for
  every size, step 12 recorded 9 of 9; stale Next 6 of 9 (the ordering was not yet changed).
- `stop-advance` (writer, then step-auto-continue): 12 of 12 recorded, stale Next 0 of 12, about
  1.7-1.9 s per Stop.

These timings were taken with a filter that kept only lines holding 완료. It now also keeps lines with
료 or its JSON escape and lines with a code fence, so the steps found match a scan of every line (the
fence state runs across text blocks). In the independent check of 2026-10-02, a 6.39 MiB transcript
in which every line passes the filter took 1.7 s.

The regression tests that pin these behaviours are `codex/tests/claude-writer-transcript.test.mjs`
(T5: a 6 MiB transcript through `run-hook.mjs` stays inside the writer budget) and the `stop-advance`
tests in `codex/tests/claude-manifest.test.mjs` (order, gates and timeouts).
