# Harness50 Codex Step-Porting Contract

This index is a two-phase contract. Every row records the immutable Claude
source path and SHA-256 digest before its Codex target is written. A source
digest mismatch requires review; it never authorizes copying or overwriting a
Codex target.

## Required transformations

- Replace provider and model names with provider-neutral role language.
- Replace Claude tool names with the action or capability being requested.
- Replace `.claude` paths with approved shared `step_archive/` paths or the
  Codex-only `step_archive/.harness50-codex/` path as appropriate.
- Do not use transcripts as completion evidence or derive completion by
  parsing transcripts.
- A step ends its own work unit after submitting evidence. The webapp orchestrator
  uses only the manager's successful completion response to select the next work
  unit in the current turn; it never infers a successor or skips acceptance.
- Step-local instructions to stop at the current step return control to that
  orchestrator. User pause, pending permission, external blockers and the manager's
  blocked state still stop execution. Trust remains required to execute hooks.
- Remove stale references to steps 69, 81, 84, 104, and 107.
- Do not depend on retired validator or checker scripts. Express validation
  as a current command, artifact, or deterministic check instead.

## Index phases

An entry starts as `ported: false` with its identity, source digest, title,
phase, and exact successor. It becomes `ported: true` only when the Codex
target exists and has complete input, output, dependency, network, visual
review, and acceptance metadata.

Acceptance entries use unique stable ids. Each has `kind` (`command`,
`artifact`, or `check`), a boolean `required`, and a deterministic
description. Artifacts declare workspace-relative paths; commands declare a
successful command or command pattern. A required visual review declares both
a screenshot artifact and an inspection check, and remains blocked whenever
visual inspection is unavailable.

## Source change procedure

1. Change the Claude source first. `node codex/scripts/validate-steps.mjs` then
   stops at the first changed row with `SOURCE_CHANGED_REVIEW_REQUIRED`. That
   stop is the review gate, not a failure to route around.
2. For each changed source, compare `git diff <base> -- assets/steps/stepNNN.md`
   with the Codex target and decide: carry the same obligation over in Codex
   terms, or record why the target already meets it. Do not port Claude-only
   devices such as the named pause, `harness-pause.mjs`, `progress.json` or the
   Stop hook wording.
3. A changed target must pass the forbidden-token scan.
4. When an acceptance id, command or path changes, or a new required item is
   added, give `historicalReplayContract` in `codex/scripts/lib/acceptance.mjs`
   a branch that replays the earlier receipts and add a
   `codex/tests/completion-quality.test.mjs` case for it (steps 3, 5, 14, 30
   and 50 are the precedents).
5. Re-pin `source_sha256` in `index.json` and the same literals in
   `codex/tests/steps-validator.test.mjs` and
   `codex/tests/steps-parity.test.mjs`. When a target changed, also update the
   `EXPECTED_*_TARGET_SHA256` maps in `steps-validator.test.mjs`.
6. Confirm that `node codex/scripts/validate-steps.mjs` prints
   `validated 50 indexed step(s)`.
7. Put a per-step table in the pull request: source digest change, Codex
   decision and reason.
