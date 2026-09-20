# Optional Jev planning review implementation plan

> For agentic workers: use test-driven implementation and an independent final review. User authorized execution of the Step 25 advisory proposal on 2026-09-20.

**Goal:** Let either host explicitly run Jev against selected public/non-sensitive Step 25 planning excerpts and retain a reproducible advisory report.

**Architecture:** A shared Node library validates and binds explicitly selected excerpts to local source hashes, calls the fixed TypeSafe endpoint once, and records only categorical results and provenance. A CLI exposes prepare/run/inspect. Step 25 documents this opt-in lane; existing reviewers and completion/permission state remain authoritative.

**Tech stack:** Node >=22 built-ins, existing safe file utilities, native fetch, node:test. No SDK dependency.

**Spec:** Design and contracts below; approved conversation scope is an optional Step 25 assistant, not a replacement gate.

## Global constraints

- No hook, workflow writer, receipt, mandatory acceptance or Trust5 changes.
- No automatic network call. `run` requires `--allow-network` and `TYPESAFE_API_KEY`; prepare/inspect are offline.
- Fixed HTTPS endpoint `https://api.typesafe.ai/v1/systemone`, model `jev-1.13.0`, one request, no retries or redirects, bounded body/timeout.
- Only caller-selected excerpts from `step_archive/TOPIC/TOPIC.md` and `step_archive/step025_*.md` may be sent. No file discovery, raw logs, screenshots, arbitrary URLs, or credential files.
- Credential values, service error bodies, and source text must not appear in reports or diagnostics. Reject recognizable credentials in proposed excerpts; this is not a complete sensitive-data detector.
- No `PASS` or workflow completion authority comes from a Jev result. Unknown/failed/changed input is unverified, never success.
- Local verification uses synthetic/public fixtures only. Browser operations use Aside; do not install/run Playwright on this PC.

## Design and contracts

Input schema (unknown fields rejected):

```json
{
  "schema_version": 1,
  "topic_excerpt": "The page must provide a year filter.",
  "planning": [{"path": "step_archive/step025_planning_chunk1.md", "excerpt": "A year filter is provided above the chart."}],
  "requirements": [{"id": "year-filter", "text": "The page must provide a year filter."}]
}
```

The topic excerpt must exist verbatim in TOPIC.md, each plan excerpt in its named source, and each requirement in the selected topic excerpt. Exact paths/hashes are local provenance; only selected text and criterion IDs go to the API. At most 4 planning files, 12 unique requirements, 64 KiB serialized input/payload/response, 256 KiB per source, 1 MiB aggregate local source reads; reject traversal, linked files and invalid UTF-8.

Exports from `scripts/lib/jev-review.mjs`:

```js
prepareJevReview(workspaceRoot, input) // offline safe summary; no source text
runJevReview(workspaceRoot, input, {allowNetwork, apiKey, fetchImpl, timeoutMs})
inspectJevReview(workspaceRoot, reportPath) // offline hash/freshness check
```

`run` stores a new content-addressed report under `step_archive/outputs/jev-reviews/<sha256>.json`. Summaries have `role: 'advisory'`, `step: 25`, and status `prepared`, `reviewed`, `unverified`, `current`, `stale`, or `invalid` as appropriate. Reports bind model/policy, selected-input hash, request hash, source hashes, generated time, criteria IDs and Choice results (`met`, `unmet`, `insufficient_evidence`). Record confidence/distributions without treating them as calibrated accuracy. Sanitized error codes distinguish authentication, rate limit, timeout, transport, malformed response and input changes. No free-text service output is retained.

CLI: `node scripts/jev-review.mjs prepare --workspace <dir> --input -`; `run` uses the same flags plus `--allow-network`; `inspect --workspace <dir> --report step_archive/outputs/jev-reviews/<sha>.json`. Exit 0 means preparation/report generation/current provenance, not product acceptance; exit 2 means invalid/unverified/stale. Input is JSON on stdin, never a credential argument.

## Review focus

1. Default/offline invocation cannot reach fetch, even with a key present.
2. Mismatched excerpts, linked/traversing paths, duplicate IDs and credential-shaped content fail before transmission.
3. Missing/extra answers, wrong model/type/label, malformed probabilities, redirects and oversized/slow responses never count as verified.
4. Source edits during a call or after report creation make the review unverified/stale.
5. CLI errors/stdout and report bodies must not echo credentials, excerpts or raw API errors; no state/receipt files are changed.

## Tasks

- [x] 1. Library and boundary tests: demonstrate red for the missing adapter, implement local input binding, one-call transport, safe reports and inspect; run focused tests.
- [x] 2. CLI and CLI tests: demonstrate red for argument/network opt-in behavior, implement strict commands and stdin handling; test real child-process entry points without external calls.
- [x] 3. User guide and Step 25 integration: provide an executable synthetic example and explicit external-transfer choice, preserve existing mandatory review protocol, document statuses/key setup.
- [x] 4. Verify: run focused and full Node suites, independent source review, and live public-fixture checks with the user-provided credential; report real model outcomes separately from software test outcomes. Commit reviewed files locally and record handoff.

## Execution record

- 2026-09-20: isolated branch `feat/jev-planning-review` at `D:/harness50-worktrees/jev-review-20260920`, based on main `86b7f93`; installed existing lockfile dependencies with scripts disabled. User supplied a credential after implementation began; it is configured outside repositories in the Windows user environment, never in this plan.
- Library tests initially failed for the absent implementation (13/13); CLI tests initially failed for the absent entry point (4/4). Final focused adapter/CLI tests: 24 passed, no failures/skips. Additional regressions cover a credential appearing in a source filename and recognizable TypeSafe credentials in selected excerpts.
- Two real service calls using public synthetic fixtures (English and Korean, three criteria each) returned the expected `met`, `unmet`, `insufficient_evidence` choices and `current` provenance. Model: `jev-1.13.0`; usage: English 696 input / 139 output tokens, Korean 777 / 139. These six easy cases verify connectivity and response compatibility; they do not establish production accuracy or calibrated confidence.
- The guide's PowerShell fixture ran offline with the key removed and fetch disabled; `prepare` exited 0 without exposing excerpts. Claude isolated regression: 45 passed, 0 failed.
- The first full suite exposed the existing source-hash review requirement after editing Claude Step 25. Ported the optional section to Codex, reviewed the source, and updated only Step 25's source hash and its two snapshot expectations. Existing acceptance fields and `network: false` remain unchanged; Codex describes external Jev as a separate explicitly invoked advisory review without overriding host permissions. Step validator/parity tests: 190 passed, no failures/skips; `validate-steps.mjs`: 50 indexed steps valid.
- Final full suite: `node --test --test-reporter=spec codex/tests/*.test.mjs` => 1,234 tests, 1,232 passed, 0 failed, 2 skipped (Windows symlink limitations), 64.721 seconds. No local Playwright installation or browser execution.
- Independent read-only reviewer `/root/gates_independent_review`, 2026-09-20 16:26:35 +09:00: 214/214 focused Jev + step validation/parity tests passed, diff checks passed, both live fixture reports independently inspected as `current` / `reviewed`. No blocking findings. The `unmet` guide definition was aligned with the actual explicit-conflict criterion.

## Handoff

- `task_id`: `harness50-jev-planning-review-20260920`
- `artifact_paths`: `scripts/jev-review.mjs`, `scripts/lib/jev-review.mjs`, `codex/tests/jev-review*.test.mjs`, `docs/JEV-REVIEW.md`, both hosts' Step 25 instructions and the reviewed Step 25 index hash.
- `verification_commands_and_results`: full Node suite 1,232 passed / 2 skipped / 0 failed; isolated Claude regression 45 passed / 0 failed; independent focused suite 214 passed / 0 failed; two live public-fixture calls with six expected choices; source hashes remain current on inspection.
- `assumptions`: selected excerpts are explicitly authorized for external transfer; results are advisory only. No new SDK/package dependency and no automatic API execution.
- `unresolved`: broader real-task evaluation, remote CI/release, and installed-plugin updates are not performed by this local feature change.
- `next_safe_action`: use the documented CLI from this checkout for explicitly selected public/non-sensitive excerpts; preserve the reviewed branch for a subsequent release.
- `verified_by`: Codex `/root/gates_independent_review`, 2026-09-20 16:26:35 +09:00, PASS.
