# OWASP hardening verification

This report covers local harness36 hardening against the user's supplied 122-page OWASP LLM Top 10 2026 PDF (SHA256 `ef87993a4e50ae9d83b41ff7a3d3e6320a82dfa8d4ec6bf98d0ce264b2e6108e`). It is not an OWASP certification or confirmation of the provided document's final publication status.

- `task_id`: `harness36-owasp-full-20261006`
- `artifact_paths`: branch `fix/owasp-full-20261006`, baseline `dfd9226b5e2be0c55e81f0cad80444ce95c67bae`, local worktree `D:/harness50-worktrees/owasp-full-20261006`; `docs/SECURITY.md`, design/plan under `docs/superpowers/`; raw evidence `D:/harness50-worktrees/owasp-full-evidence-20261006`.
- `verification_commands_and_results`: Complete frozen V5: 1760 tests / 1756 pass / 0 fail / 4 environment skips / 0 cancelled, exit 0; 1442.266 seconds. All 485 physical source files were unchanged before/after and independently matched current source. New OWASP regression cases: 54 across five files. Independent replays: root input/supply 12/12; Jev 11/11 (including 14-process reservation race); tool controls 12/12 plus final dispatcher 2/2 and measured-receipt aggregate 1/1; output previous 14/14; final all-backend output/browser contracts 37/37; installed Aside rejection 6/6. Final prechecks passed: syntax for 56 changed modules, pinned dependency security audit and whitespace checks. All 106 indexed stages across three profiles validate; 174 historical stage files and PORTING remain byte-identical to the clean baseline worktree.
- `assumptions`: the user's repeated request authorizes finishing applicable local code hardening and verification. Native host permissions remain authoritative. A Jev answer is advisory, not authority or measured evidence. Default planning20 and historical 36/50 execution history stay intact.
- `unresolved`: current native browser adapters cannot provide verified all-transport host network isolation, so generated-output execution is unavailable and rejects before artifact serving/navigation. Provider monetary/output-token ceilings and arbitrary child OS/network restrictions require host enforcement. CI, Node 22, Linux/macOS execution, public release and installed-cache updates are not claimed by this local run. Vector/embedding/semantic-cache/model-training capabilities are absent, with an explicit future integration gate. Browser measurement reports remain unsigned evidence, not independent host-isolation attestation.
- `next_safe_action`: retain the verified local commit and raw evidence. To enable generated-output verification, implement a supported native host egress adapter and independently replay TCP/UDP/preconnect/fresh-frame attacks before enabling it. Current plugin code has no artifact/workspace/CLI/environment opt-out.
- `verified_by`: independent root/input/supply, Jev, runtime and output replays are preserved below. Final all-backend gate: Codex `/root/owasp_runtime`, 37/37 contract replay plus 3/3 additional environment/lock/invalid-lock attempts; zero backend loads, availability probes or execution. Codex `/root/owasp_external` independently reviewed common/direct gate placement. Complete-suite reconciliation: Codex `/root/owasp_external`, 2026-10-05T18:19:22.902328Z, normal complete V5 exit 0, exact TAP totals and all 485 before/after/current physical hashes matched. Final eight applied/staged vault records: Codex `/root/owasp_outputs`, 2026-10-05T18:26:49.662887Z, historical-body preservation, exact patch/index bytes and actual staged validator exit 0.

## Implemented controls

Deterministic registered-tool policy mediates arguments, sensitive paths, URLs, edits and native auto-approval. Paused, completed or corrupt workflow metadata cannot silence established-workflow guards. Guard stdin/JSON is bounded; watchdog, missing native script and runtime errors deny with exit 2, keeping the 2.5/4.5-second budgets.

An additional actual policy replay found that registered Write/Edit/MultiEdit and
literal shell writes could directly replace canonical browser/quality measurement
JSON. Protect those two host-produced files and destructive parent replacement;
report reads, ordinary advisory notes and native review of existing trusted runner
commands remain available. This is deterministic tool mediation, not cryptographic
producer authentication or protection against every independently authorized OS
program. The final attack replay and source freeze record the corrected boundary.
The aggregate test failed before the fix and passed after it; an independent
replay passed 1/1 without skips in 6.083 seconds, with both frozen file hashes
matching. It exercises both real adapters, registered edits, literal shell writes,
directory replacement, junctions and hardlinks while preserving the original
synthetic receipt bytes and permitted reads/ordinary note writes.

Strict JSON rejects duplicate and escaped duplicate keys, nonfinite numbers, excessive depth/nodes and malformed Unicode. Physical file reads allocate bounded bytes, reject links and recheck identity; tree traversal has aggregate/file/directory/depth caps. New Claude bootstraps tag and automatically pin original TOPIC; common Codex evidence contexts check actual TOPIC against the persisted pin. Untagged historical Claude bindings remain compatible and are not described as newly pinned.

All three Jev transports share credential/structured-input filtering, a fixed HTTPS endpoint, response/request bounds and durable pre-call user-wide reservations. Different keys, processes and workflow resets share the 12/minute, 200/day and request-byte ceilings; repeated identical requests are capped. Failures consume quota; corruption, links, persistent locking and clock regression fail closed. Old policy receipts stay inspectable; hardened policies require fresh judgments.

Quality execution uses exact argv without shell expansion, a minimal environment and stable config/source/scope rechecks before and after each program. `--prepare` renders exact commands; an optional config digest pins bytes and does not create approval or an OS sandbox. Pinned lockfiles are checked against reviewed versions, SHA512, origin and exact transitive graphs before CI install; lifecycle injection and synchronized fake version/integrity attacks are rejected. Browser axe bytes have an independent pinned SHA256.

## Actual browser gap and final behavior

Earlier origin/sandbox/CSP fixtures passed HTTP-request, parent/cookie/permission/worker tests and routed benign views. Independent Chrome/153 tests then demonstrated WebRTC STUN sends 4 UDP packets and preconnect opens 2 TCP connections while HTTP request counts remain zero. A `webrtc 'block'` CSP directive did not close the actual engine gap. The exposed Aside API lacks route, init-script and native network enforcement primitives.

The final native adapters reject both benign and hostile generated artifacts before server creation, dependency loading or browser navigation. Independent Aside instrumented paths made 0 application-server listen attempts, 0 browser artifact-execution calls, 0 TCP/UDP/HTTP/execution effects, and preserved user tabs. CLI version and tab-list observations are benign host diagnostics, separate from artifact execution. The six-check installed-Aside runner passes by measuring this refusal; it is not an executed benign-page PASS. A source review also found the previous Playwright backend reachable through explicit/environment/automatic/locked selection without this gate. The common dispatcher and direct backend entry gates close that shipping fallback. Its no-execution tests use controlled loaders/getters; no Playwright package or browser is called on the NS workstation. Trusted fake unit executors exercise inner plumbing through an explicit test-only registration; native execution, CLI input, workspace JSON and environment cannot enroll themselves.

## Completed failed run and contract corrections

The first complete frozen run, V4, exited 1: 1759 tests, 1751 pass, 4 fail and 4 environment skips. The full TAP and unchanged 485-file snapshot remain preserved. These are the actual four failures, rather than an inference from the earlier interrupted output:

- The Codex hook-config test still expected the historical two-tool matcher instead of the hardened nine-tool matcher.
- Its selective installed fixture omitted `quality-files`, `strict-json`, `tool-policy` and `sensitive-data`. A causal native replay obtained exit 1, empty stdout and `ERR_MODULE_NOT_FOUND` for `quality-files` from `state-store`; the real shipping file set contains the dependencies.
- The packaged installation preflight also retained the historical matcher and returned `HOOK_CONFIG_INVALID`. Update the canonical matcher and required physical shared-module inventory; it adds no hook import/execution path.
- The existing isolated native regression expected ask/pass for five literal secret/admin/startup-file mutations. Those same five commands produced ten correct guard denials across DG and PRG. Preserve all 116 commands per OS, change only these expectations and add five explicit no-auto-allow checks.

Focused reproduction was 5 tests / 2 pass / 3 fail / exit 1; the same selected cases then passed 5/5 with no skip, including exact native LF-JSON, a benign Bash deferral, a registered Read sensitive-path denial and unchanged metadata. The native regression changed from 247 checks / 237 pass / 10 fail to 252 pass / 0 fail / exit 0, preserving all 20 protected source/staged hashes. Those four contract corrections changed no runtime guard code, budgets or test pooling. Independent replay passed all 8 hook/preflight cases (19.605 seconds) and the isolated 252-check native wrapper (168.754 seconds). The subsequent measured-receipt path-policy delta is separately tested. The second complete V5 run is recorded with its actual result below.

## Final complete verification

The single final V5 command was `node --test --test-concurrency=2 --test-timeout=600000 --test-reporter=tap codex/tests/*.test.mjs`, explicitly expanding all 68 test files. It normally completed on Windows, PowerShell 5.1.26100.9444 and Node v24.19.0: **1760 tests, 1756 pass, 0 fail, 4 skipped, 0 cancelled, 0 todo; exit 0**. Wall time 1442.266 seconds; TAP duration 1441926.2517 ms.

The complete raw TAP SHA256 is `12aae0b493a73898e9046aeb1067ee164628bc384eb4bb2db9688918cbcbd8f9`. Before, after and an independent fresh current manifest match all 485 physical source files. The independent reconciliation is `independent-final-full-review.json`; the four actual environment skips are preserved below, not counted as executed passes.

- `ok 30 - the probe never follows a symbolic link to state.json # SKIP symbolic links need extra privilege on this Windows host`
- `ok 149 - stop-advance: a forwarded SIGTERM during the writer starts no further part # SKIP`
- `ok 547 - POSIX direct source, topic, and step-definition file symlinks are rejected # SKIP`
- `ok 3 - file symlinks are rejected when the host permits creating one # SKIP file symlinks unavailable: EPERM`

Syntax checks passed for all 56 changed MJS modules and the four changed Bash scripts. Dependency audit, all 106 indexed steps and whitespace checks passed. Historical 174 files and PORTING remained byte-identical. Bash syntax is not a Linux/macOS native execution or CI result.

Only this verification report and completion-plan documentation may change after the frozen complete suite. Commit integrity compares every committed blob with physical source and permits only Git's UTF-8 CRLF normalization; all runtime bytes must still match the final whole snapshot.

## Local record closure

Primary source commit: `259812d22b7729a40bc0826b2ced74c8e75f0a13`, exactly 77 owned paths. Independent primary commit audit reconciles all 485 committed blobs with physical files: 463 byte-identical and 22 UTF-8 CRLF normalization only, with zero mismatches and a clean source worktree. Runtime files remain identical to the frozen complete suite; only this report and completion-plan documentation changed afterward.

NS vault commit: `0299b1df3ee134140de002e9aed2fc297a90e03a`, exactly eight owned Markdown records. The full verification note, ADR-038, handoff, task, index, hot context, log and existing harness note were added/partially updated. An independent actor compared the applied/staged bytes and preserved historical bodies, and reran `python 00-meta/scripts/vault_healthcheck.py --vault . --staged` and staged whitespace checks with exit 0. The normal commit also ran its configured pre-commit hook; no hook bypass or remote NS push occurred. The eight owned records are clean after commit; unrelated pre-existing vault changes were preserved, so the entire vault is not claimed clean.

MemoryHub `remember` succeeded with one ingestion and memory update triggered. Public/main and known installed 3.0.0 metadata were observed separately; this task did not publish or update installed caches. Local preparation stays 3.1.0.

Closure evidence: `source-primary-commit.json`, `independent-source-primary-commit-review.json`, `source-commit-integrity.json`, `ns-final-commit.json`, `outputs-independent-ns-filled-patch-review.json`, `outputs-independent-ns-applied-staged-review.json`, `outputs-independent-ns-staged-validator.log` and `memory-final-commit.json`.

## Raw evidence

- `final-full.tap`, `final-full-result.json`, `source-before-full-v5.json`, `source-after-full-v5.json`: final complete suite and physical source snapshot.
- `exploratory-full-aborted.log`, `exploratory-full-aborted-result.json`: original concurrency-4 partial failure preserved; it is neither a complete suite nor a normal npm exit result.
- `exploratory-full2-stopped-for-dispatch-gate.log/result.json`, `independent-full2-stop-review.json`: the subsequent frozen 483-file concurrency-2 run stopped to close the newly discovered shipping fallback; 220 pass markers, no failure marker, no complete-suite result and no source mutation. Its owned process tree was verified absent before the fix.
- `failed-full-v4.tap`, `failed-full-v4-result.json`, `independent-full-v4-review.json`: first complete concurrency-2 run, 1759 tests / 1751 pass / 4 fail / 4 environment skips / exit 1, 1385.047 seconds. All 485 physical source files stayed unchanged. Failures identify the old two-tool matcher in a test and packaged preflight, a selected-install fixture missing four new shared imports, and legacy native regression expectations that still allowed now-protected secret/admin paths. This complete failed run is preserved separately from both interrupted runs and the final result.
- `final-prechecks.json`, `historical-files-parity.json`: syntax/security/parity/whitespace and old-file preservation.
- `measured-host-receipts-red-v5.tap`, `measured-host-receipts-green-v5.tap`, `measured-host-receipts-source-freeze-v5.json`, `independent-v5-measured-receipts-review.json`: measured-report mutation gap, corrected registered-tool policy, independently replayed aggregate attack and exact source hashes.
- `hooks-config-contracts-source-freeze-v5.json`, `outputs-legacy-security-expectations-freeze.json`, `independent-v5-contract-regression-review.json`: preserved native hook/preflight and 252-check legacy regression corrections and independent replays.
- `independent-external-root-review.json`, `independent-jev-source-review.json`, `independent-outputs-runtime-review.json`, `independent-output-review-v2.json`: independent reviews, actual replays and source hashes.
- `independent-browser-shipping-gate-37.tap`, `independent-browser-extra-replay.log`, final shipping-gate review: 37/37 current output/browser contracts and 3/3 additional env/locked Aside and invalid-lock spoof attempts, with zero backend import/probe/run counters. Current generated-browser cases assert unsupported refusal; unchanged trusted-example Navigation API CI tests were not run locally.
- `independent-webrtc-probe.json`, `independent-webrtc-block-probe.json`, `independent-preconnect-probe.json`: the preserved real browser bypasses.
- `independent-aside-failclosed-probe.json` and final manual-runner evidence: corrected refusal behavior. Earlier browser-success files are historical measurements of the intermediate implementation.
- Red/green input, supply-chain, Jev, runtime and output logs preserve the original attack failures; no watchdog budget was increased.

Two bounded self-contained Jev design choices used actual API calls and selected deterministic controls and fail-closed unsupported browser execution (each confidence 1.0). They transmitted no file contents, credentials, full conversation or browser observations. Actual code/test/browser facts come from host tools and independent agents.
