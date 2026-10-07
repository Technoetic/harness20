# Harness20 Experience Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Preserve verified failure/repair experience, provide bounded source-bound task context, and measure later actions while preserving workflow authority.

**Architecture:** Auxiliary immutable memory records and typed context manifests use existing guarded file/JSON/QA helpers. Explicit local CLIs and executor guidance integrate them with current workflows; state, event and receipt schemas remain unchanged.

**Tech Stack:** Node.js >=22 standard library; existing repository helpers; no new dependency, model, embedding, process runner or network service.

**Spec:** `docs/superpowers/specs/2026-10-08-experience-memory-design.md`

## Global Constraints

- Existing immutable TOPIC, profile/generation bindings, receipts, locks, QA observations and state transitions remain authoritative.
- Existing profiles and historical receipts remain readable.
- State/event schemas and failStep returned state shape are unchanged.
- Secrets, hidden/tool directories, private configuration and workflow controls are never retrieval candidates.
- Node.js >=22 standard library only; no new dependency, model, network service or execution authority.
- Limits: 128 sources; 256 KiB manifest; 8 MiB source; 32 MiB aggregate reads; 16 KiB excerpt; 2 KiB query; complete JSON output budget 1-64 KiB.
- Existing profile indexes/step acceptance contracts are unchanged; sidecar validation checks declarations only.

## Review Focus

- Auxiliary write failure must not corrupt or suppress authoritative failure counting.
- A stale/forged success report cannot register a verified lesson.
- An explicit manifest cannot authorize private/control paths, links, or stale source reads.
- Cross-run lessons require explicit current binding and checks; generation mismatch never restores state.
- Small budgets, unknown outcomes and absent evidence must yield honest blocked/null/unverified results.

### Task 1: Shared policy and verified failure/lesson store

**Files:** Create `scripts/lib/memory-policy.mjs`, `scripts/lib/workflow-memory.mjs`, `codex/tests/workflow-memory.test.mjs`. Modify `codex/scripts/lib/workflow.mjs` only after the baseline test run finishes.

**Interfaces:**
- `memoryWorkspace(workspaceRoot)` -> `{root, context, binding, base}`; unsupported generation throws a fixed typed memory error.
- `assertMemoryBinding(value, expected)`; `assertMemorySourcePath(path, kind)`; `readMemorySource(root, reference, limits)` -> verified `{path,file_sha256,start_byte,end_byte,range_sha256,text}`.
- `captureFailure({workspaceRoot,workflowId,topicSha256,step,attemptId,failedAt,reason,evidence})` -> recorded/unavailable/unsupported auxiliary result.
- `inspectFailure(workspaceRoot,{step,attempt_id})` -> current/historical/missing advisory record.
- `recordLesson(workspaceRoot,input)`, `inspectLessons(workspaceRoot,input)`, `observeLesson(workspaceRoot,input)`, `retireLesson(workspaceRoot,input)` -> bounded immutable advisory records/projections.
- `inspectLessons` accepts `{task_id,sources,check_ids,max_results,max_bytes,as_of,origins?}`; origins are exact `{path,sha256}` selections. Export any safe JSON/source helpers needed downstream with stable signatures.

- [ ] Write meaningful tests for preserved failure behavior, secret/control rejection, immutable replay/conflicts, current QA-backed lesson registration, validity/scope/source changes and honest outcome denominators.
- [ ] Run the new tests and record the expected missing-feature failures.
- [ ] Implement the shared policy and memory store; integrate guarded postcommit failStep capture without changing its return/state/event contract.
- [ ] Run covering workflow/memory tests, record results and self-review.
- [ ] Report exact owned paths and test evidence to root; root commits only reviewed task paths.

### Task 2: Bounded retrieval and declaration validators

**Files:** Create `scripts/lib/memory-context.mjs`, `scripts/lib/memory-manifest.mjs`, `codex/tests/memory-context.test.mjs`, `codex/tests/memory-manifest.test.mjs`.

**Interfaces:**
- Consume Task 1's `memoryWorkspace`, binding/path/source validators. While it is being written, agree exact imports with root and do not edit its files.
- `retrieveTaskContext(workspaceRoot,{manifest_path,manifest_sha256,query,work_unit_id?,budget_bytes,as_of,backend?,expand_links?})` -> bounded deterministic advisory JSON with selected references, omissions and serialized byte count.
- `inspectContextContracts(workspaceRoot,{work_units_path,work_units_sha256,read_ledger_path?,read_ledger_sha256?,checkpoints_path?,checkpoints_sha256?})` -> current/invalid declaration-only result and verified digests.
- Work-unit/ledger/checkpoint schemas follow the spec and use the same four-field binding and source reference types.

- [ ] Write red tests for mandatory budget preservation, deterministic BM25/hybrid/link traversal, temporal lessons, changed hashes, malicious paths, partial UTF-8 and serialized-output accounting.
- [ ] Write red tests for duplicate ownership, cyclic/missing dependencies, invalid/overlapping read spans, stale checkpoints and fabricated passed evidence.
- [ ] Implement pure schemas/validators and safe read-only retrieval.
- [ ] Run covering tests and record red/green results; return exact API/schema examples for integration.
- [ ] Report owned paths and self-review; root commits only reviewed task paths.

### Task 3: Offline later-action evaluation

**Files:** Create `scripts/lib/memory-evaluation.mjs`, `scripts/evaluate-memory.mjs`, `codex/tests/memory-evaluation.test.mjs`. Avoid Task 1/2 files.

**Interfaces:**
- `evaluateMemoryWorkflows({action_budget=8}={})` -> deterministic paired fixture report with per-scenario observed actions, pre/postcondition outcomes, recurrence, unsafe/no-answer and explicit denominators/budgets.
- CLI accepts only validated fixed options, executes no supplied command, and prints sanitized JSON.
- This fixture is offline and synthetic; Task 4 tests actual manager/QA/store/context integration separately.

- [ ] Write red tests covering interruption/retry, changed source, expired/inapplicable lesson, poisoning and withdrawal with actual fixture state transitions.
- [ ] Implement paired memory-off/on evaluation, enforce identical action budgets, and record honest unknown/zero denominators.
- [ ] Run evaluator and covering tests, record limitations and self-review.
- [ ] Report owned paths; root commits only reviewed task paths.

### Task 4: CLIs, executor integration, documentation and real temporary workflow

**Files:** Create `scripts/workflow-memory.mjs`, `scripts/task-context.mjs`, `codex/tests/workflow-memory-cli.test.mjs`, `codex/tests/task-context-cli.test.mjs`, `codex/tests/memory-integration.test.mjs`, `docs/experience-memory.md`. Modify `agents/step-executor.md`, `codex/skills/webapp/SKILL.md`, optional guarded `codex/hooks/session-start.mjs`, `README.md`.

**Interfaces:** Consume the exact Task 1/2/3 exports. CLI memory commands: `failure`, `record`, `inspect`, `observe`, `retire`; context commands: `retrieve`, `validate`; all use `--workspace ROOT --input -` and existing strict bounded stdin/output helpers. Optional current-failure hook pointer stays bounded and advisory.

- [ ] Write red CLI tests for success paths, unknown/duplicate flags, malformed/oversized/secret JSON and safe diagnostics.
- [ ] Write a real temporary-workspace test for fail -> inspect -> repair/QA -> record -> applicable retrieval -> restart, preserving authoritative counts/receipts and testing source changes/poisoned advice.
- [ ] Implement CLI routing and executor guidance. Add precise usage/schema examples, nine source mappings, unsupported legacy and synthetic evaluation limits.
- [ ] Run covering CLI/hook/integration/package/step/profile tests.
- [ ] Obtain independent whole-branch review and rerun important verification; resolve critical/important findings.
- [ ] Run full suite/security/diff checks, commit reviewed paths and write six-field verification results with `verified_by`.

## Execution bookkeeping

Root owns a Git-ignored `.superpowers/experience-memory-20261008/` ledger, task reports and review packages. Task 1/2/3 own disjoint files and may execute in parallel; Task 2 depends only on the agreed shared helper interfaces. Task 4 begins after these interfaces/tests are ready. Existing-file edits wait for the clean baseline run. Git commits are serialized by root, with explicit file lists. No worker publishes, merges, installs plugins or changes host settings.
