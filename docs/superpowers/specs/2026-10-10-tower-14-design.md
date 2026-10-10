# Fourteen-step workflow and Tower-derived trials

The user requests removal of current default steps 3–8 and applicable ideas from
moatai-io/towersource. This supersedes the earlier unapproved fifteen-step
recommendation. Implement the request locally, preserving active older runs.
Publication and live host installation are outside this implementation request.

## Workflow contract

Add `planning-first-14-v1` and make it the fresh default. Preserve every existing
50/36/20 step body, index, count and persisted identity. Original steps are
`[25,30,37,38,39,41,42,44,45,46,47,48,49,50]`. Coordinates: planning1, design2,
implementation3, build4, quality4/8/14, independent QA5/10/11/12,
Jev1/2/3/9/13, E2E9, final14. Name `harness20` remains unchanged.

Environment preparation belongs at the end of design2, after independent design
PASS. It owns `step_archive/step002_환경준비.md` and the existing browser-backend
lock. Essential dependency preparation remains conditional on normal authority,
project declarations and actual checks; no implicit package fetching or backend
substitution. New2 must require the environment report and validated lock.
Expose environment milestone2 explicitly; do not pretend original31 remains.

Implementation3 creates its task ownership/dependency table before edits, in its
implementation manifest. It consumes design2 and environment2, without old
index/context/encoding artifacts. Carry UTF-8 without BOM and LF instructions
into implementation; build4 verifies the relevant source/output bytes. Preserve
all quality, independent QA and Jev checkpoints. Regenerate both host bodies and
source-bound canonical indexes. Derive accepted lesson profile paths from the
registry while retaining path exclusions and generation scoping.

Fix deployment-summary zero padding at E2E9. Make MX warnings start at the
selected profile's implementation milestone, preserving historical legacy50
threshold15 as a compatibility exception; modern thresholds14=3,20=9,36=25.
Malformed or conflicting workflow metadata must not produce guessed coordinates.
Document that current host-network-isolation verifier still cannot produce a
genuine final PASS without an isolation adapter. Do not weaken that gate or
claim a synthetic manager walkthrough is live end-to-end success.

## Explicit offline trial helper

Add `scripts/workflow-trials.mjs`, shared small modules and Node tests. Commands
are `prepare`, `inspect`, `record`, `compare`, `trace`, using explicit workspace
and bounded strict-JSON stdin. No hooks call them automatically. They never call
models, network, shell tools, credentials or external actions, or mutate workflow
state, QA or completion receipts. Every report is advisory and labels observations
as caller-reported, not a reproduced benchmark or independently measured outcome.

Frozen manifests bind current workflow profile/generation/TOPIC/repository identity,
the selected plugin step contracts/bodies, explicitly approved source references,
model/provider IDs, common action/token budgets and caller-declared tool/config
hashes. Candidate/prompt variant hashes are the only permitted variable. Read
selected sources through existing source-reference policy; never enumerate the
workspace or read control, secret, excluded or linked files. Immutable content IDs
and scoped files under `step_archive/outputs/workflow-trials/<profile>/<generation>`
must be verified on every operation. Changed sources, TOPIC, profile, generation,
plugin contracts or receipts invalidate use. Recheck before and after writes.
Identical record replay may reuse exact bytes; conflicting same trial/arm refuses
overwrite. Concurrent writes fail closed; no universal exactly-once guarantee.

Record bounded numerical observations for declared task/scenario/trial IDs and
`baseline`/`candidate` arms: outcome, actions/tokens/duration and hard-failure state.
PASS observations require current `inspectQa()` PASS with the exact report digest;
observed evidence hashes are explicit and current. Hard fail, missing pair, stale
QA, changed bindings, inconsistent budgets/coverage or missing evidence yields
`hold`, never an averaged-away success. A comparison aggregates matching pairs
and counts/deltas; it cannot authorize release or assert real-model improvement.
No record body/metrics are interpreted as commands.

`trace` reads the current Codex state and exact receipt files via guarded paths,
validates persisted receipts, filters the current workflow and rechecks identity.
It emits only flat IDs/coordinates/timestamps/provenance/digests/acceptance kind
and boolean results. Drop summary, detail, command, file text, prompt, response,
auth and nested caller values. It is a read-only projection, not a second receipt
store. Claude-only workspaces report unsupported explicitly. Bound reads/output.

## Source provenance

Tower commit `76268c2969f20ccbea66d6582206c26e81ba7983`, Apache-2.0.
Use design ideas, no code copying or new dependencies:
- `packages/backend/services/harness/harness-manifest.ts`
- `packages/backend/services/harness/harness-fingerprint.ts`
- `packages/backend/services/harness/harness-eval-runner.ts`
- `packages/backend/services/ai-run-trace-events.ts`

Provider/budget binding and saved-observation offline comparison are adaptations.
Tower's live evaluator invokes a model/grader. Its shallow trace scrubber is not
copied. A generic external-operation ledger or new authentication gate is deferred
because this plugin does not own universal host dispatch/authentication.

## Acceptance and handoff

Meaningful tests cover both managers' default14 behavior, old20/36/50 resume,
environment lock enforcement in new2, QA/Jev coordinates, lesson round trip,
padding at9, profile-specific MX warnings, frozen conditions, mismatched pairs,
stale QA/evidence, sensitive/linked inputs, immutable conflict/replay and trace
redaction. Run full repository tests, browser-verifier unit tests, all-profile
validator, security audit, compilation/syntax and whitespace checks. An independent
read-only agent re-executes critical checks and reviews the final diff.
Integrate clean committed source locally after verification. Keep NS records
partial and local-only, with six handoff fields and independently verified evidence.
