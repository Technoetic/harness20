# Jev semantic checkpoints

Extend the existing optional Step25 adapter to seven host-driven checkpoints: 16 (claim support), 24 (research sufficiency), 25 (requirements), 30 (distinct alternatives), 37 (explanation), 45 (scenario coverage), and 49 (finding classification). Jev is advisory; deterministic tests, visual inspection, independent reviewers, and completion writers retain their existing authority.

## Interface and boundaries

- Keep `jev-review.mjs` and its version-one reports compatible.
- Add `scripts/lib/jev-judge.mjs` exporting `prepareJevJudgment(root, input)`, `runJevJudgment(root, input, options)`, and `inspectJevJudgment(root, reportPath)`; add the `scripts/jev-judge.mjs` CLI with prepare/run/inspect.
- Input: `{schema_version:1, step, sources:[{path,excerpt}], questions:[{id,instructions,choices:{choice:criterion},abstain}], min_confidence?}`. Only the seven listed steps; 1–4 exact excerpts, 1–12 questions, 2–12 choices, mandatory abstention. Default threshold 0.8 is a review heuristic, not calibrated accuracy.
- Source files are explicitly selected UTF-8 `.md`, `.txt`, or `.json` files under `step_archive/`, excluding hidden, credential, generated Jev report, and control-state paths. Step37 first persists selected implementation prose as evidence; the resulting judgment concerns that text only, never executable correctness. No automatic discovery or bulk upload.
- Reuse existing safe filesystem primitives, rejecting symlinks, hardlinks, aliases, and unsafe paths. Bind raw source hashes plus normalized exact excerpts before and after the network request. Bound file and request/response sizes. Do not persist excerpts, instructions, criteria, or provider free text in reports.
- Fixed TypeSafe endpoint/model, explicit `allowNetwork`, environment key, no redirects/retries, bounded timeout, strict response schema and choice/probability validation. Failures remain unverified; abstentions or low confidence need host review.
- Persist content-addressed advisory reports under `step_archive/outputs/jev-judgments/`. Inspect verifies policy, structure, content digest, and current source hashes. Prepare returns request/policy/source hashes to compare before reusing a current report. Report integrity is local consistency, not provider attestation.

## Host routing

Both Claude and Codex invoke the helper after checkpoint evidence is ready when the active task authorizes Jev and sending those excerpts. Reuse existing authorization; a key or stage number alone is insufficient. Inspect and compare input/request/source/policy hashes before reusing a prior result, including local threshold and abstention policy. One batch per unchanged checkpoint is host policy, not an enforced global quota. Unavailable Jev falls back to the existing independent review with the reason recorded. Update network metadata to allow the explicitly scoped optional API call; this never grants general browsing permission.

## Implementation and verification

1. Core library and meaningful adversarial tests; preserve the previous adapter.
2. CLI and subprocess tests, docs/examples, seven paired step instructions, routing entry points, registry hashes and network consistency.
3. Independent read-only review; full Node suite, step validation, plugin/Claude checks, public synthetic real-API smoke. No private vault material sent.
4. Version 2.7.0; reviewable commit/PR, exact-commit CI, release archive, existing-authorized installation with settings preservation and installed-byte verification.
5. Update existing vault plugin note, ADR, index/log, tasks/handoff; explicit-file local commit and mirror only; remember durable outcomes.

## Handoff

- task_id: harness50-jev-checkpoints-20260920
- artifact_paths: scripts/lib/jev-judge.mjs; scripts/jev-judge.mjs; docs/jev-checkpoints.md; seven Claude/Codex step pairs
- verification_commands_and_results: final npm test passed (1264 tests; 1262 pass; 2 existing Windows link skips; zero failures); Claude regression copy 45/45; step validator 50; independent focused tests 264/264; executable guide examples 7/7. Seven real API calls using public fictional Korean prose yielded 14 expected choices including seven abstentions; source/hash inspection was independently replayed for all seven reports.
- assumptions: automatic checkpoint routing is the stated default; existing release/install authorization continues
- unresolved: exact-commit CI, release publication and installed-byte verification pending; live host execution of all 50 steps and business accuracy are not established by synthetic examples
- next_safe_action: commit the reviewed implementation and verify CI, release assets and existing-authorized installation
- verified_by: Codex /root/checkpoint_independent_review, 2026-09-20 17:59:47 KST, 264/264 tests and seven offline report/input replays PASS; no Critical/Important defects. Runtime source and legacy gates remain unchanged after review. Step25 confidence 0.57 and Step45 confidence 0.74 correctly retain host review under the default 0.8 threshold.
