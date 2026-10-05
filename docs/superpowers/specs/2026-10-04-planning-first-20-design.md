# Planning-first twenty-step workflow

User-approved brief (2026-10-04): start harness36 at the current requirements-planning
step 17 and remove the preceding steps from new executions. Renumber the retained
work to 1–20. The user approved this proposal with “가자”.

## Behavior

- Fresh Claude and Codex runs select `planning-first-20-v1`, schema 2, total 20.
- Its original legacy coordinates are `[25,30,31,32,33,34,35,36,37,38,39,41,42,44,45,46,47,48,49,50]`.
- New step 1 is requirements planning, 2 design, 3 environment preparation,
  9 implementation, 10/14/20 measured quality, 15 E2E, 19 final design, 20 final regression.
- Jev checkpoints are 1/2/9/15/19. Independent QA remains 11/16/17/18.
- Initialization freezes the original request in TOPIC with the existing six-field
  normalization. Planning checks that contract and explicitly supplied sources.
  Missing essential requirements remain missing; no earlier completion is invented.
- New step 1 has no prerequisite step or deleted gate artifact. New E2E takes its
  environment/tool evidence from new step 3, not deleted preflight artifacts.
- Browser backend selection is owned by the retained environment preparation step 3.
  Its actual available backend is verified before use; no unsupported backend,
  auto-approval, browser installation, or reduced visual acceptance is introduced.
- Retain all downstream independent reviews, bounded five-round loops, required
  findings, routing, accessibility, keyboard/mouse, browser and regression gates.
- Fresh progress/receipts/QA and evidence paths use the new definition. Incompatible
  profile/count/evidence combinations fail closed.

## Compatibility

Explicit `research-free-36-v1` and `legacy-50-v1` states resume with their original
counts, milestones, instruction paths and hashes. Unmarked/schema-1 legacy records
remain fifty-step records. Preserve all 172 existing step bodies and prior indexes
byte-for-byte. Do not delete or rewrite user TOPIC, workflow state, archives, receipts,
QA history, plugin caches or previous releases. Product state mutations use managers.

The default switch must not invalidate otherwise-current research-free-36 Jev reports.
All supported profiles are validated, including profiles that are no longer defaults.
Final-summary output uses the selected profile's E2E coordinate.

## Scope and validation

Keep the `harness36` plugin/command name and `.harness50-codex` storage name. Node >=22,
existing dependency set and security boundaries remain. Version preparation is 3.1.0;
this local implementation does not itself authorize remote publication or installation.

Validate fresh planning entry through native manager and Claude hook fixtures, full
twenty-step progression, same-profile resume and recovery, mixed-profile rejection,
source/index hashes, all gates, Jev report compatibility, final summary and Bash/
PowerShell integration. Run `npm test`, browser-verifier tests and all-profile parity.
Independent read-only code review and verification must precede completion claims.

The earlier actual Jev direction judgment is reused only as advisory meaning review:
choice `fits`, confidence 0.98, input hash
`0c1255f3b6d41524d3c8ef63bb7fd40e6e56c0124608f3175cdbf38a8b7f663c`.
It does not grant completion or publication authority.
