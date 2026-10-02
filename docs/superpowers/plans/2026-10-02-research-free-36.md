# Research-free 36 implementation plan

Approved design: `docs/superpowers/specs/2026-10-02-research-free-36-design.md`.

## Global constraints

- Fresh runs default to `research-free-36-v1`; definition-less schema-v1 records mean `legacy-50-v1`.
- Preserve legacy source bytes, hashes, receipt meanings, imports, recovery and archived instructions.
- Remove only original steps 16–20, 22–24, 26–29, 40 and 43 and their research prerequisites. Retain all surviving review and measured-quality gates.
- No secret access, permission expansion, remote push, publication or installation. Do not run Playwright.
- Meaningful RED/GREEN tests precede behavior changes. Keep locks, guarded filesystem access, trust and explicit-start policies.

## Task 1: Definition registry and 36-step contracts

Create one shared definition registry with strict identifiers, counts, old/new mapping and path/milestone helpers. Freeze the legacy canonical 50 source/index files and add profile-specific 36 source/index files. Rewrite new planning, design, implementation, module, routing and final visual contracts to use requirements and observed evidence. Generate hashes from actual source bytes. Extend parity/contract validation to both definitions and add behavioral profile validation tests. Existing canonical50 remains the explicit legacy source; new runtime resolvers select the profile-specific36 source. Do not update old source files to disguise a migration.

## Task 2: Codex state, receipts, acceptance and import

Add an explicit versioned definition field for fresh36 state/receipts while accepting unchanged legacy schema-v1 records. Use state-selected totals/contracts in init, begin, complete, reconciliation, reset, continuation and stop processing. Receipt replay binds definition identity and final gates. Import legacy50 as legacy; import new36 only with explicit consistent profile metadata. Extend CLI and skill loading to return the correct profile/body. Exercise new36 full lifecycle and legacy running/paused/blocked/completed/recovery/import and cross-profile rejection. Adapt legacy fixtures explicitly instead of weakening validation.

## Task 3: Shared evidence, Claude hooks and checkpoints

Use shared profile resolution for QA/quality/final-regression/final-summary milestones and Jev checkpoint routing. Fresh Claude triggers create36 metadata and profile-specific archived sources; legacy archives remain intact. Loaders, writers, guards, autonomous advancement, named pauses, trust, coexistence and package validation must honor selected counts and source identity in both PS1 and SH. Preserve immutable evidence paths/bindings and explicit invocation rules. Add executable Windows-hook, source parity and fail-closed profile tests.

## Task 4: Documentation, integration and independent verification

Update public README/Codex guides, skills and surviving quality/routing/design/QA/checkpoint instructions for default36 and legacy compatibility. Check that the documented path/number commands actually match runtime contracts. Run repository parity, focused lifecycle/hook/security checks and the full Node suite. Request an independent whole-branch review and independent rerun of core validation; fix important findings. Record final design decision in the vault with compliant partial edits and commit only our notes. Leave a clean committed local branch and report actual test evidence and any remaining limitations.

## Task handoffs

Each task report records `task_id`, `artifact_paths`, `verification_commands_and_results`, `assumptions`, `unresolved`, `next_safe_action`, plus RED/GREEN and commit evidence. Reports and review packages live in ignored `.superpowers/sdd/research-free-36/`. Review each task before advancing. The final controller reruns integration checks and obtains an independent read-only review.
