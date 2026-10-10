# harness20 v4.2.0 release preparation

This report records implementation evidence before release metadata preparation.
It does not substitute that evidence for exact release-commit CI or installed
bytes. The user explicitly authorizes public release and updating both existing
native plugin installations.

- `task_id`: `harness20-tower-release-20261010`.
- `artifact_paths`: implementation commit
  `7e77d371f4b0515157bbfe2834d790f5264e91a2`; release branch
  `release/4.2.0-tower-14`; [release guide](../releases/v4.2.0.md),
  [feature contract](../workflow-trials.md), and final release `verification.json`.
- `verification_commands_and_results`: actual local full command
  `node --test --test-concurrency=1 --test-timeout=600000 codex/tests/*.test.mjs`
  completed with 1,880 tests, 1,870 passes, six failures, four existing platform
  skips and zero cancellations, exit 1. Five failures concerned stale guide or
  default-profile expectations; one concerned the absent, already-declared
  root `axe-core` dependency. Eight documentation/test files were corrected and
  one trailing ASCII space removed from the new Codex stage 1. The other 549 of
  the original 558 source files remained byte-identical. Historical 215 profile
  body/index files were unchanged. Root `npm ci --ignore-scripts` installed only
  the declared `axe-core` package; its pinned bytes were verified. The corrective
  command covered 15 complete test files with 324 passes, zero failures or skips
  and exit 0. Composite verification explicitly preserves the original exit 1;
  it is not presented as a second passing full local suite. Four profiles and
  120 indexed stages, dependency integrity, syntax and isolated browser refusal
  guards were separately checked. Implementation review was bound to the exact
  committed Git blobs and both local worktrees.
- `assumptions`: public identity remains `harness20`; existing20/36/50 runs retain
  their original interfaces and state. Optional new features and a shorter
  default for new runs are released as minor version 4.2.0. Actual Jev conceptual
  Choice selected minor with confidence 0.69 (`needs_review`); host review used
  measured existing-profile compatibility. The advisory grants no permission
  and verifies no repository files.
- `unresolved`: this preparation report does not assert a passing fresh release
  matrix, publication, downloaded asset verification or installed-byte checks.
  Those separate gates are measured in the final public verification asset.
  Real-model effectiveness and live product E2E have not been measured. Local
  browser automation remains restricted to the selected permitted backend;
  the existing remote release CI runs its repository browser fixtures.
- `next_safe_action`: independently review version metadata and guides, run
  the existing OS/Node CI matrix for the exact candidate, merge and tag verified
  source, publish canonical Git-blob ZIP/checksums, preserve rollback material,
  update both native installations and independently check installed bytes and
  preserved configuration without starting a live workflow or trusting hooks.
- `verified_by`: Codex `/root/h20_independent_review`,
  `2026-10-10T05:40:31.117Z`, PASS for implementation commit `7e77d371…`; this
  attribution covers implementation evidence, not later publication or installation.
