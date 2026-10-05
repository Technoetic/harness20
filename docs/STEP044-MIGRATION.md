# Routing integration: current profiles and legacy report migration

Fresh `planning-first-20-v1` routing is Step14 and writes
`step_archive/step014_routing검증.md` using `routing-integration-report`; Steps15–20 consume it.
Explicit `research-free-36-v1` retains Step30, `step_archive/step030_routing검증.md`
and consumers31–36. Neither profile has the old044 artifact fallback; missing current
routing checks remain incomplete. Existing legacy50 uses Step44 and the unchanged
historical receipt/input rules below. Never renumber old evidence.

## Legacy50: Step44 report migration

Since v2.4.3, the routing integration report is
`step_archive/step044_routing검증.md` and its artifact acceptance ID is
`routing-integration-report`. New Step 44 executions and their completion
receipts must use this name. Steps 45–50 declare the new report as an input.

## Existing workspaces

Do not rename, overwrite or delete an existing report or completion receipt just
to change its name. Historical evidence keeps its original path and digest.

When resuming a workspace that already completed Step 44:

1. Prefer the current report path if it exists. Read it as input; its existence
   alone does not establish current quality or completion.
2. If it is absent, inspect the verified historical Step 44 receipt or the
   existing imported Claude progress record that marks Step 44 complete.
3. Only for that completed historical step, read the existing
   `step_archive/step044_html컴포넌트화.md` as the prior routing report. Record
   the actual input path. For a native receipt, compare the current file with
   its recorded artifact digest before consuming it; a mismatch blocks this
   input fallback. Imported progress has no native artifact digest: record that
   limitation. This is historical input, not a new completion or a claim that
   current routing checks passed.
4. If neither report exists, stop and report the missing input. Do not create an
   empty replacement, invent evidence, or mark the missing input as passed.

An unfinished Step 44 must perform the current checks and write the current
report path. There is no old-path fallback for a new Step 44 completion.

## Historical receipt validation

The runtime recognizes the old `html-componentization-report` ID and old report
path only when replaying an already persisted Step 44 completion receipt. It
continues to validate the persisted artifact digest against submitted evidence,
all required checks, receipt schema and identity, and conflicts. A changed evidence digest,
missing routing check or mismatched ID/path pair is not accepted. Replay does
not reopen historical artifact files and does not attest to their current bytes;
input consumption follows the separate checks above. The receipt itself is
never rewritten.

Imported Claude progress does not supply a native acceptance receipt. Its report
may be used as historical input under the rule above, but it is not upgraded to
a native receipt or to current measured-quality evidence. Fresh completion
always uses the new ID/path and the current quality gates.
