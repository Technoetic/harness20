# harness20 release verification

This report records preparation for the explicitly requested public rename, local installation and GitHub release. Actual final CI, merged/tagged commit, published assets and installed-byte checks are retained in the release `verification.json` and the coordinator's release evidence; preparation checks are not substituted for those later measurements.

- `task_id`: `harness20-release-20261006`
- `artifact_paths`: branch `feat/harness20-release-20261006`, baseline `d4c8f769abce2926ffbcee902011cbb57e1bd75c`, public candidate name `harness20`, version `4.0.0`; local evidence `D:/harness50-worktrees/harness20-release-evidence-20261006`; current release guide `docs/releases/v4.0.0.md`.
- `verification_commands_and_results`: canonical identity first failed with actual `harness36` versus expected `harness20`. Updated package/skill/guide contracts pass 21/21, independently replayed 21/21. Runtime canonical trigger, paused controls and both native/Codex cache protection had 4/4 failing cases, then 4/4 pass. Installation profile checks pass 4/4 after reproducing an incorrectly accepted simultaneous active legacy36 installation. Test-only IPC cleanup first reproduced three failures, then passed all 60 lock-store cases and an independent five-case replay. Dependency security audit, 106 indexed stages and whitespace checks pass. Broader affected runtime checks, final CI matrix, actual release artifacts and installation verification remain separate required results.
- `assumptions`: the user authorizes renaming, local installation and GitHub publication; `harness20` matches the new default twenty-stage workflow. The canonical installed identity/host namespace migration is a major version change. Generic Jev design advice selected public-only identity migration (confidence 0.88) and a major release (0.80); it supplied no permission or source verification.
- `unresolved`: native generated-HTML execution is intentionally unavailable without verified host TCP/UDP egress isolation. Existing provider/OS/unsigned-evidence limits are described in `docs/SECURITY.md`. Actual package installation does not grant native hook trust; changed definitions need manual host review. This candidate report does not claim a published release, updated installation, complete fresh CI or an executed full twenty-stage user workflow.
- `next_safe_action`: complete independent affected-runtime checks and all six OS/Node CI jobs, merge only the verified head, publish the exact release commit and checksummed artifacts, install that package, and independently compare installed bytes while preserving earlier caches and project disable preferences.
- `verified_by`: Codex `/root/release_audit` independently replayed package 21/21 and reviewed metadata/namespace/history/persistence; Codex `/root/owasp_runtime` independently replayed five IPC cleanup cases. Exact timestamps, source hashes, commands and results are in the separate six-field evidence records.

## Migration and evidence boundaries

Public identity, display text, commands and status/reset skill names become harness20. Current parsers also accept prior 36/50 input aliases, while rejecting mixed namespace controls. Parser compatibility does not activate or install old host namespaces.

All 174 historical stage/index files and PORTING retain their original bytes. Existing workflow storage, profile/schema IDs, quality/routing contracts and `.harness36-security/jev-budget` remain unchanged. The quota implementation matches the previously verified commit; renaming does not create a new quota ledger.

Cache-tamper protections add the new identity and retain both old ones. Native installation preflight rejects active identity conflicts and malformed legacy activation values, preserves disabled old cache fixtures, validates exact manifests, dependencies, skills and all 106 stage definitions, and does not fabricate an AfterTrust receipt.

An existing public Ubuntu CI failure showed an IPC `EPIPE` during actor cleanup. The test-only correction passes a callback, tolerates only closed-channel/`EPIPE` cleanup races, waits for actual child exit with the existing five-second grace period, and propagates unexpected errors. Production locks, assertions, hook timeouts and approval policy are preserved.

The preceding OWASP complete suite and its failed/partial predecessors remain immutable historical records. Fresh release CI and installation results must identify their actual commit, assets and observed execution rather than relabeling those older results.
