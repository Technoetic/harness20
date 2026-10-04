# Planning-first 20-stage verification

- `task_id`: `harness36-planning-first-20-20261004`
- `artifact_paths`: branch `feat/planning-first-20-20261004`, worktree `D:/harness50-worktrees/planning-first-20-20261004`, baseline `65fa1f31b5c0b933c6a1a43bb0e087f07dd5c22d`; design and plan under `docs/superpowers/`, local version preparation `docs/releases/v3.1.0.md`. Raw logs, exit records, manifests and browser artifacts: `D:/harness50-worktrees/planning-first-20-evidence-20261004/`.
- `verification_commands_and_results`: final independent `npm test`: 1,706 tests, 1,698 passed, 4 failed, 4 skipped, exit 1. The four existing hook watchdog failures are recorded below; all four passed isolated replay (two runs of 2/2, each exit 0). Focused checks, independent source review and actual Aside browser checks passed as detailed below. This is not a single passing full suite.
- `assumptions`: the user's removal request, planning-first choice and “가자” authorize the approved local implementation. New executions use twenty stages starting at planning. Existing 36/50 executions keep their definitions and history. Plugin name and commands remain `harness36`; 3.1.0 is local preparation, while the public release and real installed caches remain 3.0.0.
- `unresolved`: the full invocation returned exit 1; its four watchdog failures passed separate low-load reruns. No single passing full-suite invocation is claimed. Playwright-specific browser tests fail without their dependency on this Aside-only host. CI, Node 22, macOS/Linux native execution and a model-driven complete twenty-stage application build were not run.
- `next_safe_action`: preserve the reviewed local branch and evidence for subsequent use. Public release and real installed caches remain 3.0.0; 3.1.0 is local preparation.
- `verified_by`: read-only Codex `/root/semantic_business_evidence`, 2026-10-04 12:08:36 KST, independent instruction/index/runtime verification; this agent's own documentation is excluded. Read-only Codex `/root/release_metadata`, 2026-10-04 12:35:23 KST, checked other authors' runtime, hooks, package metadata and documentation, executed the final full suite (four failures preserved, exit 1), and verified all four isolated replays passed in two runs (each exit 0). It authored new instructions, so their independent source review belongs to the first reviewer.

## Implemented behavior

`planning-first-20-v1` is the default for a fresh execution. It retains old research-free stages 17–36 as new stages 1–20, with no earlier discovery/preflight work in the new sequence. Its original legacy coordinates are 25, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 42, 44, 45, 46, 47, 48, 49 and 50. Old explicit research-free36 and legacy50 states and receipts retain their meaning. Unknown profiles, inconsistent schema/count combinations and mixed bindings fail closed.

Planning is stage 1, design 2, environment/backend lock 3, implementation 9, measured quality 10/14/20, independent QA 11/16/17/18, E2E 15, final design 19 and final verification 20. Jev reference checkpoints are 1/2/9/15/19; the historical36 policy hash remains `8b2754566775198f537b407e516cb4033a863587b7870e126d84a5d87e4bf06d`. Final measured browser evidence and the six-matrix contract remain required. Named pauses, ownership boundaries and ordinary permission checks retain their behavior.

Both native triggers prepare the frozen original request and six TOPIC fields before planning. Codex automatically pins and checks `state.topic_sha256`. Claude preserves the original and six fields; its writer and independent verifier record and compare input SHA-256 themselves. Claude progress does not automatically pin a TOPIC hash. Initial planning and verifier handoffs use explicit current-attempt artifact paths and profile/generation/attempt/TOPIC-digest bindings.

## Regression evidence

| Check | Actual result |
|---|---|
| Baseline profile/runtime/steps/evidence/Claude subset | 52/52 passed before implementation |
| Final runtime/package/offline guide checks | 41/41 passed; fresh trigger 2/2 passed |
| Native twenty-stage transitions, old-profile compatibility and isolated packaged preflight | 13/13 passed |
| Shared TOPIC initialization and repair | 42/42 passed; baseline normalizer implementation retained |
| New instruction constraints | Independent 13/13 passed |
| New native shell hooks | 16/16 passed |
| Existing36 Claude hooks after bounded mutex retry in the success fixture | 5/5 passed |
| Changed fresh-start/reset fixtures; schema/path ownership probe | 9/9 and 1/1 passed |
| Guide and actual offline Jev examples for 20/36/50 | 11/11 passed |
| Four full-suite watchdog failures replayed with no concurrent full suite | Paused 2/2 + corrupt/finished 2/2 passed; both exit 0 |
| Historical bodies/indexes | 172 bodies + 2 indexes, 174/174 unchanged against baseline bytes/SHA |
| All indexed profiles and host parity | 106 steps / 3 profiles passed |
| Independent new instruction snapshot | 41/41 hashes matched |
| Independent syntax and diff checks | 24 Node/Bash and 4 PowerShell parses passed; `git diff --check` exit 0 |

The first integration run began before the final candidate freeze: `integration-first.log` and `integration-first.json` record 1,706 tests, 1,695 passed, 7 failed, 4 skipped and exit 1 (1,753,325.6337 ms). Six failures assumed old first-step artifacts or old guide coordinates; their focused fresh reruns passed after the fixtures were corrected. One existing36 success fixture encountered the unchanged global writer mutex's bounded deferral. Its success assertion now uses a bounded retry, and the five-case rerun passed. Product guards and their budgets were not relaxed.

The independent final run used frozen product, instruction and documentation bytes. Four fixture-only corrections were verified before their workers loaded them. `independent-npm-test.log` and its exit JSON record 1,706 tests, 1,698 passed, 4 failed, 4 skipped, 0 cancelled, exit 1, 1,440,752.0875 ms. These four failures have explicit watchdog stderr: two paused-state obedience hooks exceeded 4.5 seconds, a corrupt-state auto-approve hook exceeded 2.5 seconds, and a finished-state destructive hook exceeded 4.5 seconds. `independent-watchdog-baseline.json` verifies the relevant hook/wrapper bytes and budgets are unchanged. Two full suites were running concurrently during these cases; process snapshots and an additional paused-under-load reproduction are preserved. After both full suites ended, two isolated TAP runs passed all four named failures: paused bracket/plain 2/2 (27,479.3293 ms), then corrupt/finished plain 2/2 (19,271.1891 ms), each exit 0, fail 0, skipped 0. The first selector accidentally omitted the latter cases because a Korean literal was damaged in a PowerShell-to-Python pipe; the actual count exposed that omission and a UTF-8/ASCII-escape selector verified the remaining two cases. Both raw logs are retained. Concurrent startup load is the supported environmental explanation; the whole-suite exit remains 1 and is not rewritten as a pass.

`final-candidate-hashes-v4.json` pins 467 tested physical files, excluding only this result document. Its SHA-256 is `f570acb942a8ee713107722b7512f45df9abdac5dfafcfe9d90579ac635482dd`. The independent post-suite comparison found zero drift across all 467 files. Original candidate manifests and red/failing logs remain available.

## Browser evidence and limits

An initial `npm run test:browser` invocation explicitly selected Playwright and returned exit 1: 22 tests, 10 passed and 12 failed because the Playwright dependency is absent. No Playwright browser launched or dependency/browser was installed. This result is retained as a failure, not recast as a pass or skip. Browser implementation files are unchanged from the baseline.

After the required `aside-up.ps1`, the actual permitted Aside probe reported availability. A synthetic fixture copied the existing three-screen example, explicitly locked Aside, then used automatic backend resolution from that lock. The measured report passed PC/mobile with Navigation API present/absent: four views, twelve route observations and four screenshots. A broken fixture with an empty button and thrown error returned expected exit 1/FAIL across four views, with 28 console errors and 28 accessibility violations. `aside-verification.json`, `aside-negative.json`, raw logs and generated browser reports preserve these outcomes. The initial missing-manifest negative attempt is also retained separately. Only fixture tabs were closed; the existing browser window and user tabs were retained.

## Review findings resolved

Independent review found that Claude initialization previously supplied only `session_prompt`, while planning needs six frozen fields. Both shell triggers now use the shared TOPIC normalizer; actual hook tests cover complete input, unspecified-field provenance, ownership refusal and existing-history refusal.

Review also found broad prior-step report globs in initial planning and verifier B handoffs. They now use current request evidence and explicit bounded current-attempt manifests, including hashes and the four execution bindings. New regression cases failed before these corrections and passed afterward. Guides distinguish automatic Codex hash pinning from Claude's manual writer/verifier SHA comparison.
