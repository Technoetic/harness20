# Harness20 verified experience memory

The user approved the previously presented package: preserve generic failure and verified repair evidence, retrieve relevant bounded context, and evaluate later actions and poisoned memory. Implementation is confined to this repository and isolated feature branch. Publication and changes to installed host settings are separate operations.

## Purpose and success

A restarted coding session can inspect why its current step failed, find an applicable repair backed by current evidence, and test whether that guidance improves the next action. Stored advice never changes workflow state, clears failure counts, supplies approval, executes commands, or replaces acceptance evidence.

Existing immutable TOPIC, profile/generation bindings, receipts, locks, QA observations and state transitions remain authoritative. Existing profiles and historical receipts remain readable. Features requiring a generation return an explicit unsupported result for legacy workflows without one.

## Components

### 1. Failure and verified lesson memory

`scripts/lib/workflow-memory.mjs` stores bounded immutable auxiliary records under `step_archive/outputs/workflow-memory/<profile>/<generation>/`. `failStep` captures its already-frozen evidence after its current state/event writes while retaining its mutation guard. The state/event schemas and returned state shape are unchanged. An unsafe or unavailable auxiliary directory cannot prevent the original failure count; authoritative guard violations still propagate.

Failure records contain the workflow/profile/generation/topic, step, attempt, timestamp, a sanitized observed-cause summary, an optional next check, and evidence hashes. They never contain raw evidence details or raw commands. A manager-derived hash names each attempt record; caller strings never become directory components. Identical replay is idempotent and conflicting content is rejected.

Lessons require a current successful QA report whose digest, selected check IDs and source hashes are independently inspected. Caller-authored success flags and arbitrary verification paths are rejected. Record the originating failure, repair observation, applicable task/source/check scope, current source hashes, verification reference, explicit validity interval, and bounded related/superseded lesson IDs. Exact duplicates merge by a stable semantic-content digest; observations remain immutable separate records.

Lesson observations distinguish applicable versus inapplicable attempts and resolved, recurred, adverse or unknown outcomes. Known-outcome and current-evidence denominators are reported separately; zero denominators produce null rates. Retirement/supersession removes applicability without erasing provenance or changing original QA/receipts.

Default lesson inspection is confined to the current namespace. Cross-generation use requires an explicitly selected origin record with an expected digest, matching repository/profile/topic/task/source scope and current source/verification checks. There is no bulk archive scan or automatic migration of prior memories.

### 2. Approved task context and declaration validation

`scripts/lib/memory-context.mjs` builds a deterministic read-only pack from an explicitly selected, digest-pinned manifest. A shared `memory-policy.mjs` supplies safe binding, path/text/schema validation, and source-reference checks. Binding contains repository root identity hash, workflow profile, workflow generation and pinned topic hash.

Source references contain portable relative path, whole-file SHA256, inclusive/exclusive byte offsets and selected-range SHA256. Reject partial UTF-8 boundaries. Classify paths before reading; refuse secrets, private settings/configuration, hidden/tool directories, arbitrary archives and workflow control metadata as candidates. Pinned TOPIC is read only through the narrow binding operation. Archive candidates must be exact selected safe artifacts. Source excerpts are untrusted data.

Use Node standard library only. Manifest limits: 128 sources, 256 KiB input, 8 MiB per source file, 32 MiB aggregate source reads, 16 KiB per excerpt and 2 KiB query. Output budget is 1 KiB to 64 KiB of complete serialized UTF-8 JSON, including metadata. Every declared scope/blocker excerpt is mandatory and indivisible. If mandatory content exceeds the budget, return blocked with a fixed safe diagnostic. Optional selection reports bounded omission IDs/reasons and never silently truncates source text.

BM25 uses fixed k1=1.2 and b=0.75 with Unicode NFKC/lowercase tokenization. Hybrid mode combines the actual BM25 and token-overlap rank lists using RRF k=60. Ties are deterministic. Explicit source-ID references may expand at most two hops; this is bounded reference traversal. Expired/superseded lessons are excluded. Recheck binding and accepted source hashes before returning. No embedding/model/network/process invocation or persistent search cache is added.

`scripts/lib/memory-manifest.mjs` validates typed work-unit, declared read-ledger and checkpoint sidecars. A work unit owns 1-3 distinct files; ownership is globally unique; dependencies are closed and acyclic. Read ranges are bounded and hash-checked; overlapping repeated reads for the same decision require a referenced earlier read and an explicit reason. Checkpoints contain change/test-evidence pointers, blockers and next-safe-action; a claimed passed checkpoint requires current hashed test evidence with a declared zero exit code. Recorded commands are never executed by the validator.

These checks validate declarations, not actual tool history or semantic completeness. The initial integration uses explicit CLI validation and executor instructions. It does not alter existing profile indexes, step contracts or historical receipt acceptance to require new artifacts.

### 3. Host integration and evaluation

`scripts/workflow-memory.mjs` exposes bounded structured stdin commands for failure inspection, lesson recording/inspection, observation and retirement. `scripts/task-context.mjs` exposes retrieval and sidecar validation. Use existing strict JSON and safe output helpers. Unknown/duplicate flags and schema fields fail with fixed diagnostics; never print supplied input or exception text.

Codex and Claude executor guidance calls the tools when appropriate: inspect failure/QA before retry, register only verified repairs, validate supplied sidecars, and retrieve selected relevant context. SessionStart may add a bounded advisory current-failure pointer and safe unavailable diagnostic, preserving its current authoritative status text and guard. No host settings, provider, automatic approval or installed plugin changes are made.

`scripts/lib/memory-evaluation.mjs` and `scripts/evaluate-memory.mjs` run offline public synthetic scenarios with memory off/on under the same fixed action budget. Score actual preconditions/postconditions, recurrence, unsafe actions and no-answer handling across interruption/retry, changed sources/requirements, inapplicable/expired lessons, poisoning and source withdrawal. This is a deterministic workflow fixture, not a reproduced paper benchmark or an LLM/business performance claim. A new-feature integration test separately drives real manager/QA/memory APIs in temporary workspaces.

## Reference scope

SimpleMem: cited structured units and exact deduplication. A-MEM: explicit evidence/lesson links. Zep/Graphiti: validity and supersession. qmd: BM25 and rank fusion. HippoRAG 2: bounded reference traversal. Letta Code: persistent lessons and honest outcome denominators. MemoryArena/LongMemEval V2: later-action and changed-fact/no-answer evaluation. MINJA: poisoned memory and withdrawal/residue tests. Full original algorithms, external servers and reported paper scores are not part of this implementation.

## Verification and review

Run meaningful red/green tests for new behavior and adversarial boundaries. Reuse the existing complete test suite, security audit, step/profile/package validators and clean Git checks. A fresh read-only reviewer checks the branch and independently reruns selected important evidence. Resolve critical/important findings before completion. Record commands/results, assumptions, unresolved limits and next-safe-action in the branch's verification artifact.
