# Research-free 36 local implementation — verification record

Status: local implementation complete. Final held implementation HEAD `d8692fdc98be81855c51b25d38e82239804cf673`, full suite and independent scoped re-review PASS. Final evidence recorded2026-10-02 23:56KST. This record commit adds verification evidence only; implementation files remain at the tested HEAD.

- task_id: `harness50-research-free-36-20261002`.
- artifact_paths: branch `feat/research-free-36-20261002`, worktree `D:/harness50-worktrees/research-free-36-20261002`; approved `docs/superpowers/specs/2026-10-02-research-free-36-design.md` and `docs/superpowers/plans/2026-10-02-research-free-36.md`; profile-specific assets, shared registry/evidence, Codex runtime, Claude hooks and current guides; this final record and adjacent evidence.
- verification_commands_and_results: `npm test` on clean held `d8692fd`:1662 tests,1658 pass,0 fail,4 skip,350272.4491ms,exit0 (wall350.688s). Environment Windows, Node24.19.0; PowerShell5.1 and installed GitBash5.3.15. Main npm test uses concurrency4, no browser invocation. Independent tests below are actual runs on the specified implementation heads.
- assumptions: exactly original16–20,22–24,26–29,40,43 removed; all surviving order and gate IDs retained. New profile `research-free-36-v1`; preserved `legacy-50-v1`. Missing external/API contract facts remain unverified. Local source delivery only.
- unresolved: No remaining reviewed implementation finding or test failure. Product browser execution, real installation/cache/hook trust and live AfterTrust event delivery are outside this verification. Recorded independent verifier mode is checked; external reviewer identity is not authenticated.
- next_safe_action: retain the local reviewed branch; publication and installation require a separate authorized task.
- verified_by: Codex `/root/final_branch_review`,2026-10-02 23:51:22KST: scoped9f6c558..d8692fd SpecCompliancePASS/CodeQualityPASS; independently reranD3(1/1), five affected suites(28/28),86 indexed definitions and102 frozen legacy bytes. All requested fixes addressed; no introduced scoped breakage. The separate controller full suite subsequently passed at the same held implementation HEAD.

## Acceptance and compatibility

Fresh Claude/Codex starts select36. Unmarked/schema-v1 records retain exact legacy50 meaning; unknown profiles, inconsistent counts, actual malformed records and cross-profile receipts fail closed. No automatic renumbering/reset/migration. Generation-scoped new QA/Jev/quality reports cannot reuse old50 or previous-run evidence. Original source/index/hash/receipt and legacy replay policy remain unchanged.

New milestones: design18; implementation25; quality26/30/36; independent QA27/32/33/34; Jev17/18/25/31/35; final36 checks all six regression matrices against current HTML, screenshots, browser console and build evidence. Mandatory independent reviews, PASS/severity criteria and round limits remain.

Codex reset archives before a subsequent explicit default36 initialization. Claude reset preserves its selected profile, bodies and meaning, rotates the generation and pauses for user-request. A corrupted profile record is restored, never guessed.

## Verification chronology

| Stage | Implementation head | Actual outcome |
| --- | --- | --- |
| Definitions | f0c2fa9 | Independent86 contracts/5 tests PASS; frozen50 bytes unchanged. |
| Codex runtime | 430f897 | Independent2 same-agent-negative final36 tests PASS after fix; earlier18 runtime/1BOM/86 contracts PASS. |
| Shared evidence/Claude | 5606c98 | Independent13 malformed-record/orphan-marker negative/control tests PASS after fix; earlier11 profile/native,5Bash,34 contracts and86 definitions PASS. |
| Docs/package | 9f6c558 | Independent4 actual isolated package/public-example tests PASS. Real installed cache/trust was untouched. |
| Broad branch review | c8721c7..9f6c558 | Independent55 core/native/install/example tests,5 GitBash scenarios and86 contracts PASS. No Critical/Important product defect; Minor new35 prior range and full integration readiness below required correction. |
| First final integration | 9f6c558 | `npm test`:1660 tests,1652 pass,4 fail,4 skip;344543.9729ms. D3/V5/V7 stale prose assertions, public Jev example missing-root initialization. This run is not GREEN. |
| Consolidated final fix | d8692fd |75 focused tests PASS; missing-root default36/explicit50 examples and new35 range regression were RED before the fix. No manager/runtime/schema/index-hash change. |
| Final scoped independent re-review | d8692fd |D3 1/1 and five affected suites28/28 PASS;86 contracts and102 frozen legacy bytes PASS. All fixes addressed, no introduced breakage. |
| Final clean-head integration | d8692fd |`npm test`:1662 tests,1658 pass,0 fail,4 skip,350272.4491ms,exit0. Source held unchanged throughout. |

Earlier failed full runs were followed by scoped fixes; they were never represented as final passing runs. Task2 full1629 had1BOM failure, Task3 full1643 had12 failures; affected focused checks passed after the relevant fixes. The final clean-head run above is the completion gate.

Broad `verified_by`: Codex `/root/final_branch_review`,2026-10-02 23:46KST, read-only c8721c7..9f6c558. Scope included all retained order/gates, legacy byte identity, state/receipt/hash boundaries, generation isolation, PS1/SH/reset/coexistence/protected paths, final regression, shared packaged dependencies and current guides. Optional additional compatibility run ended exit1 on the knownD3 failure when termination was requested; no successful aggregate is claimed for it.

## Implementation provenance

- 9b3935d: approved design/plan.
- a2a986b and f0c2fa9: new36 definitions/registry and coordinate corrections.
- 39af80a and430f897: profile-aware Codex runtime and independent final-mode enforcement.
- ba90d42 and5606c98: shared evidence/Claude hooks, exact unchanged IO implementation lift, malformed-record/orphan-binding rejection.
- 9f6c558: current guides/evaluator routing and isolated package verification. Install-smoke expected version now derives from unchanged2.12.0 manifests; this is validation compatibility, not a version bump.
- d8692fd: consolidated final integration fix,9 files,33 insertions/11 deletions; new35 target coordinates, selected-total assertions with mutation guards retained, public example root initialization and trusted historical routing prose.

## Rulings made during integration

1. Real unmarked Harness50 progress must have the exact legacy50 shape; marked records require allowlisted profile/count. Miniature generic pause fixtures were adapted rather than accepting arbitrary production counts. Cost if wrong: unsupported non-Harness50 callers using arbitrary totals need a separate generic API. No such supported mode was identified.
2. New generated SPEC aliases bind profile/generation. Before replacing mismatched aliases, preserve original bytes in guarded immutable `step_archive/specs/history/<sha256>/`; archive failure leaves original untouched. Legacy generation is unchanged and SPEC is advisory. Cost if wrong: curated unmarked SPEC requires restoration from its preserved copy to become active again.

Architecture/profile/reset rulings implement the approved compatibility boundary and are described above. No parked load-bearing source finding remains after the approved scoped re-review. Full-suite readiness confirmed by the separate held-head run.

## Supplementary Jev evidence

The trusted installed2.12.0 direct adapter made one actual authorized batch call for the two integration rulings; no retries. Saved exact input/result are adjacent to this record. `model=jev-1.13.0`, `role=advisory`, `evidence_binding=inline_not_file_verified`, `status=needs_review`, network_attempted=true. SPEC bind-and-preserve probability.98/confidence.97; strict-known progress probability.84/confidence.77 (below.8 threshold). Host retained the explicit approved profile boundary; this is not blanket Jev approval or completion authority. Initial host rulings preceded the supplementary call, so no Jev-first chronology is claimed. A local unsupported `--help` command attempt was an adapter argument error, not an API judgment.

- input_hash:8bb62b2cc20346abc0ad59f756bbf662b0a322f53bfd7af569d2052b3b3e8bbe
- request_hash:8eefe604d9b6e44da326d607181d889c18e6b4685877cfe99e7357f0440ab57f
- policy_hash:ad37d9890b8ecae45f9d3f82f0a9241e9d08f0d7486955a32b2a2132ae1c29d5

Reference exercises used fresh read-only agents against baseline/current skill text. They established correct selected bodies/counts, research-free prerequisites, legacy routing and capture-only handoff/round semantics. They did not execute live workflows or supply observations that could justify product PASS.

Scoped independent commands: `node --test --test-name-pattern="D3 " codex/tests/claude-named-pause.test.mjs`; `node --test` for `claude-verifier-judgement.test.mjs`, `jev-checkpoint-routing.test.mjs`, `profile-guide-examples.test.mjs`, `profile-steps.test.mjs` and `workflow-profiles.test.mjs`; `node codex/scripts/validate-steps.mjs --all-profiles`; filesystem byte comparison to `git show c8721c7:<legacy-path>`; scoped `git diff --check`. These checks ran independently; the controller's final full run is separate.

## Preserved raw evidence and platform limits

Adjacent directory `2026-10-02-research-free-36/` retains both actual final-attempt logs, focused RED/GREEN logs and exact supplementary Jev input/result. The failed first attempt is preserved separately; only the final held-head exit0 result establishes full-suite completion.

Four full-suite skips were existing platform/privilege limits:

- ﹣ the probe never follows a symbolic link to state.json (2.1593ms) # symbolic links need extra privilege on this Windows host
- ﹣ stop-advance: a forwarded SIGTERM during the writer starts no further part (0.1854ms) # SKIP
- ﹣ POSIX direct source, topic, and step-definition file symlinks are rejected (0.0753ms) # SKIP
- ﹣ file symlinks are rejected when the host permits creating one (1.4616ms) # file symlinks unavailable: EPERM

Actual GitBash5/5 independent scenarios supplement the Windows full suite; no Linux/macOS run is claimed. Browser validator fixtures establish evidence acceptance/rejection, not live UI correctness. No Playwright install/package/browser invocation or live AfterTrust lifecycle was executed. No version manifest, main checkout, installed cache, active workflow or remote publication was changed.

Evidence SHA256:

- `final-fix-focused-green.log`: `d1af85d47c2e0b06a42c368fb1e165d8df997094cdb58ec6bc299db07c86236b`
- `final-fix-red.log`: `a7b41c1bdd6f873e327b0facc79135837992fc8ee942656c9011140756c0c1eb`
- `final-full-test.log`: `9eeac74073992a756b3d5cac7c1a139a1ff50a582211ae6003b3958dd35c2ae9`
- `first-final-full-test.log`: `3d7c1245242bf65d29987b4847eefe73eb85b075e9f648b75d53e4a3a1d6fcbb`
- `jev-rulings-input.json`: `019ec3a936079e9d665bdac026d6ec99097b7529af1211fd2a356f225fbfb69d`
- `jev-rulings-result.json`: `74c2c88caa083f65015fd4b0043e0297f700e18ed6244b44d4ef76c35884f9ed`
