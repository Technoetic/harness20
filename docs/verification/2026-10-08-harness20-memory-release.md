# harness20 v4.1.0 release preparation and evidence

This report preserves the measured implementation validation before version and
release documentation changes. Public CI, publication and installation must be
measured for their exact release commit. Their final evidence belongs in the
release `verification.json`; this preparation report does not substitute local
results or the earlier v4.0.0 CI for those gates.

- `task_id`: `harness20-memory-release-20261008`.
- `artifact_paths`: implementation commit
  `2cd0f1a68c134059d30861c19fd7ffcff446b3f0`, tree
  `802adf833a5f8fe014607a01a2b81fec7a720a35`; release branch
  `release/4.1.0-experience-memory`; guide `docs/releases/v4.1.0.md`; feature
  contract `docs/experience-memory.md`. Local raw implementation evidence is
  `D:/harness50-worktrees/experience-memory-20261008/.superpowers/sdd/2026-10-08-experience-memory-plan/`;
  coordinator release evidence is
  `D:/harness50-worktrees/experience-memory-release-20261008/.superpowers/release-0410/`.
- `verification_commands_and_results`: the actual standard `npm test`, expanded
  as `node --test --test-concurrency=4 --test-timeout=600000 codex/tests/*.test.mjs`,
  completed on Windows Node 24.19.0 at the implementation commit with **1,840
  total, 1,836 pass, 0 fail, 0 cancelled, 4 existing platform skips, exit 0**;
  duration 1,435,150.1786 ms. The recorded interval was
  `2026-10-08T00:04:02.0336160Z` to `2026-10-08T00:27:59.0019137Z`.
  Independent lightweight validators on that exact source passed all 106 indexed
  stages across three profiles and dependency integrity inputs (one root and
  four browser-verifier packages). Dependency validation neither installs nor
  launches a browser and is not vulnerability certification. Release preparation
  changes version metadata, its existing version expectations and documentation;
  exact fresh targeted commands and final CI are retained separately.
- `assumptions`: the user explicitly authorizes public release and installation
  into the existing Claude Code and Codex plugin configuration. Optional additive
  memory commands retain existing workflow authority and public identity, so
  this is version 4.1.0. Actual Jev advisory SemVer Choice selected `minor_410`
  with confidence 1 from a self-contained conceptual question; it grants no
  permission and verifies no source files. Previous activation scopes, disabled
  projects, old caches and unrelated plugins must be preserved.
- `unresolved`: this preparation report does not itself assert fresh complete
  release CI, a public release or updated installed bytes. Those are required
  coordinator steps with separate exact evidence. Hook trust remains manual and
  a fresh host session is required to load changed plugin content. Cooperative
  lifecycle locking does not prevent administrative rollback or cryptographically
  attest an author. Declared reads/checkpoints are not actual tool-history proof;
  same-agent QA is not independent QA; synthetic evaluation is not a real-model
  or business benchmark. Existing generated-HTML, provider and OS boundaries
  remain in `docs/SECURITY.md`.
- `next_safe_action`: independently review the release metadata and docs, run the
  required complete public OS/Node matrix for the exact candidate, merge and tag
  the verified source, publish canonical Git-blob ZIP bytes and checksums, update
  both native plugin installations after preserving rollback material, and
  independently check published and installed bytes without initializing a live
  workflow or bypassing native hook trust.
- `verified_by`: Codex `/root/review_experience_final` independently reconciled
  the implementation source, raw full-test counts and evidence hashes, and reran
  the source profile/dependency validators at `2026-10-08T09:31:53+09:00`.
  Its product-fix replay passed 11/11 and selective-fixture replay passed 3/3.
  This attribution covers the implementation evidence, not yet the later
  release metadata, public assets or actual installation.

## Immutable local evidence

| Artifact | SHA256 |
| --- | --- |
| `final-npm-test-fixed.log` | `9ad0b6276bb7e75c052a1e83779ef520ee1cc72315c043e2c789deca2eeafda0` |
| `final-npm-test-fixed-exit.json` | `b79633ea34edf6c5029cf7b8d843251eee3dc0574b9f841e348d3581cd463baa` |
| `final-evaluation.json` | `07343111bba9efc0ac152b3a2d919d14b5107d077ba484e7382aa9d19d47b729` |

The earlier completed implementation suite had 1,828 passes and eight failures
at `12f3f437d611d6b2b8d2e8f8289a9554de09eb26`. Seven failures were a selective
test-package copy list missing the new `read-budget.mjs` dependency; one was the
missing already-pinned root `axe-core` asset. The copy list was corrected and
`npm ci --ignore-scripts --no-audit --no-fund` restored the existing root-only
dependency before the successful complete run. No local browser dependency or
browser was installed or launched for that repair. Failed and interrupted logs
remain preserved; a withdrawn composite-coverage proposal is not presented as a
passing complete suite.

The four existing Windows environment exclusions concern a privileged symbolic
link state probe, forwarded SIGTERM during writer operation, a POSIX direct
source/topic/definition symlink case and unavailable file symlinks (`EPERM`).
None is a new feature skip. Actual cross-platform and Node 22 behavior is
established by the release's fresh public CI, not inferred from this Windows
Node 24 implementation run.
