# Planning-first Twenty-step Implementation Plan

> For agentic workers: apply subagent-driven-development or executing-plans with
> test-driven-development. Continue through all authorized local tasks.

**Goal:** Start fresh harness36 workflows at requirements planning in twenty steps.
**Architecture:** Add an explicit profile and retain old profiles as immutable
compatibility definitions; managers resolve each persisted profile independently.
**Tech Stack:** Node.js >=22, existing Bash/PowerShell hooks, Markdown contracts.
**Spec:** `docs/superpowers/specs/2026-10-04-planning-first-20-design.md`

## Global Constraints

- New profile `planning-first-20-v1`, steps 1–20, schema 2.
- Keep 172 existing step bodies and all previous indexes byte-for-byte.
- Preserve actual user work, TOPIC, archives, receipts and activation settings.
- No extra dependency, auto-approval, reduced quality gate or invented completion.
- All external Jev results remain advisory and selected-source-bound.
- Local version 3.1.0 preparation only; no remote publication or actual cache update.

## Review Focus

- A fresh workspace without any deleted preflight/gate artifact starts planning.
- Existing 36/50 workflows and current Jev reports retain their meanings.
- Wrong-profile receipts, hook ownership and continuation cannot advance new work.
- Browser/E2E evidence follows retained environment preparation and mandatory gates.
- Final summary includes E2E/quality/routing evidence in the shorter definition.

### Task 1: Registry and manager routing

Files: shared profile registry, Codex validator/state/evidence routing, profile tests.
Produces: profile ID constants and `WORKFLOW_PROFILE_IDS`; twenty-step coordinates.

- [ ] Add failing tests for default20, explicit old36/50 and profile/count rejection.
- [ ] Run tests and preserve the expected RED log.
- [ ] Add the new profile and make profile iteration include every supported ID.
- [ ] Verify fresh entry and old profile routing; commit tested behavior.

### Task 2: Twenty instruction contracts

Files: new `assets/profiles/planning-first-20-v1/steps/` and matching Codex directory.
Consumes: Task 1 profile coordinates. Produces: forty new bodies and hashed index.

- [ ] Add failing parity/dependency/gate tests before generating instructions.
- [ ] Rebase retained old36 steps17–36 to1–20; remove deleted prerequisites.
- [ ] Make first planning read TOPIC/user sources and environment step own backend.
- [ ] Verify every reference, required acceptance and index hash; preserve old bodies.

### Task 3: Claude and hook integration

Files: Claude profile integration, Codex ownership, trigger/spec hooks and hook tests.
Consumes: new profile registry and instruction paths. Produces: profile-safe host entry.

- [ ] Add failing fresh20/old36/legacy50/mixed-profile hook tests.
- [ ] Replace hardcoded fresh36 branches with selected-profile values in both shells.
- [ ] Verify fresh trigger, specification, continuation, ownership and recovery.

### Task 4: Evidence compatibility and summaries

Files: Jev judgment policy resolution, final-summary collection and relevant tests.

- [ ] Add regressions for retained old36 Jev report hashes and new20 checkpoints.
- [ ] Derive policy by selected profile while keeping existing policy hashes stable.
- [ ] Add failing shorter-profile E2E/final summary evidence tests and fix collection.
- [ ] Verify cross-profile evidence rejection and nonempty selected-profile summaries.

### Task 5: Current docs and local release preparation

Files: README/host entry docs, browser contract, Jev/quality/QA/final/routing docs,
version manifests, release and verification records; preserve historical documents.

- [ ] Explain planning-first20 and the three supported resume definitions.
- [ ] Update current step references and every browser-owner contract.
- [ ] Prepare3.1.0 metadata and reproducible verification evidence.

### Task 6: Full validation and independent review

- [ ] Run all-profile source/index parity and `git diff --check`.
- [ ] Run `npm test` and `npm run test:browser`, preserving actual counts/skips/errors.
- [ ] Independently review final code and rerun meaningful verification commands.
- [ ] Fix material findings with reproducing regression tests; complete required checks.
- [ ] Commit local branch and NS records; report implementation and deployment scope.
