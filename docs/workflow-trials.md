# Explicit offline workflow trials

The trial helper freezes comparison conditions, records paired caller-reported
observations and projects redacted Codex receipt metadata. It is optional and is
never activated by a hook. It does not run models, tools, shell commands, network
requests, credentials, browser probes or external actions. It never updates
workflow state, QA reports or completion receipts.

All results are advisory. A comparison describes saved observations; it does not
reproduce a benchmark, measure a remote effect, prove model improvement or
authorize workflow completion, installation, publication or release. Existing
workflow managers and acceptance checks retain their authority.

## Commands and APIs

Run from the installed plugin or source directory with Node 22 or newer:

```text
node scripts/workflow-trials.mjs prepare --workspace PROJECT --input -
node scripts/workflow-trials.mjs inspect --workspace PROJECT --input -
node scripts/workflow-trials.mjs record --workspace PROJECT --input -
node scripts/workflow-trials.mjs compare --workspace PROJECT --input -
node scripts/workflow-trials.mjs trace --workspace PROJECT --input -
```

Each command accepts one strict JSON object on UTF-8 stdin, at most 64 KiB. Unknown
fields, duplicate JSON keys, aliases, links, control files and secret-like inputs
are rejected with a generic diagnostic. Exit0 means a valid current result;
exit2 means rejection, `hold`, `stale`, `unsupported` or `unavailable`.

The shared API is `scripts/lib/workflow-trials.mjs`:

| Function | Input | Result |
| --- | --- | --- |
| `prepareTrial(workspace,input)` | Frozen conditions below | `prepared`, manifest path/digest, replay flag |
| `inspectTrial(workspace,selector)` | Trial ID and exact manifest digest | Current manifest or `stale` |
| `recordTrial(workspace,input)` | One observation below | Immutable record path/digest, replay flag |
| `compareTrials(workspace,selector)` | Trial ID and exact manifest digest | `compared` or `hold`, counts and summed deltas |
| `exportTrace(workspace,{})` | Empty object | Current flat receipt events, or explicit unsupported/unavailable |

Preparation requires an existing modern workflow generation. Legacy50 trials
are unsupported because their shared identity lacks a generation pin; trace
projection can still inspect valid legacy Codex receipts. Claude-only workspaces
can use trials but trace reports `unsupported` because Codex receipts are absent.

## Frozen conditions

Preparation takes exactly these fields:

- `trial_id`, `task_id`: public identifiers, letters/digits/underscore/hyphen.
- `scenarios`:1–16 unique `{id,check_ids}` cases; each case lists1–32 QA check IDs.
- `sources`:1–32 explicitly selected safe source references.
- `model_id`, `provider_id`: caller-declared public IDs, not credentials.
- `budgets`: positive integer `{actions,tokens}`, common to both arms.
- `tool_set_sha256`, `config_sha256`: caller-declared64-character SHA256 hashes.
- `variants`: distinct `{baseline_sha256,candidate_sha256}` prompt/candidate hashes.

The candidate hash is the sole permitted variable between arms. Tool/config and
provider/model declarations are comparison identities, not independently probed
runtime facts. Budgets do not enforce limits on the host's live tools or model.

A source reference is
`{path,file_sha256,start_byte,end_byte,range_sha256}`. Offsets select a nonempty
UTF-8 byte range of at most16KiB; the complete file and selected range must match
their hashes. Source reads use the existing memory reference policy. Select
repository sources or approved artifacts explicitly; the helper never enumerates
the workspace. Control, secret, excluded, linked and trial-record paths cannot be
used as source/evidence inputs.

The stored manifest also pins the shared repository-location identity, workflow
profile/generation, TOPIC bytes, current completed receipt bytes and the selected
plugin's complete step index plus both hosts' step-body bytes. Changed conditions
invalidate later use. Exact files are scoped under
`step_archive/outputs/workflow-trials/<profile>/<generation>/`.

An identical preparation reuses the exact bytes. A different preparation under
the same trial ID refuses overwrite; select another trial ID for a new experiment.
The helper checks bindings before and after writes and checks the opened file's
identity and physical ancestry before writing payload bytes. A parent-path race
at exclusive open may still create an empty file before rejection. Node's
path-based APIs cannot guarantee protection against every ancestor change after
the final check; use a workspace whose directories other processes cannot mutate
concurrently. Concurrent conflicts fail closed; this is not an OS-anchored path
guarantee or universal exactly-once guarantee.

## Observations and comparison

Record one observation per declared scenario and `baseline`/`candidate` arm:

```json
{
  "trial_id":"public-trial",
  "manifest_sha256":"REPLACE_WITH_PREPARED_DIGEST",
  "task_id":"public-task",
  "scenario_id":"normal",
  "arm":"baseline",
  "variant_sha256":"REPLACE_WITH_BASELINE_VARIANT_DIGEST",
  "model_id":"declared-model",
  "provider_id":"declared-provider",
  "budgets":{"actions":8,"tokens":1000},
  "check_ids":["public-check"],
  "outcome":"pass",
  "actions":6,
  "tokens":600,
  "duration_ms":200,
  "hard_failure":false,
  "qa":{"step":1,"report_sha256":"REPLACE_WITH_CURRENT_QA_DIGEST"},
  "evidence":[]
}
```

The placeholder example is intentionally rejected until actual digests and at
least one safe evidence reference are provided. Outcomes are `pass`, `fail` or
`unknown`. Counts must be nonnegative integers within the declared action/token
budgets; duration is nonnegative milliseconds. A PASS needs the exact current
`inspectQa()` PASS digest, every declared check passing, and selected evidence
hashes intersecting every declared check's recorded evidence. Every selected
evidence reference must belong to a declared passing check. QA body reads are
restricted to the frozen source paths and the observation's selected evidence;
a report containing any other artifact/evidence body is rejected before that
body is opened. This verifies current
stored QA and files; action/token/duration observations remain caller-reported.

`inspect` and `compare` select `{trial_id,manifest_sha256}`. Comparison reads only
the expected scenario-arm files. It rechecks sources, receipts, manifests, QA and
observed evidence. Missing pairs/evidence, stale QA, changed bindings, unknown or
failed outcomes and any hard failure produce `hold`. Hard failures are never
averaged away. A valid comparison reports summed candidate-minus-baseline
`actions`, `tokens`, `duration_ms` and pass-count deltas. One sample exists per
scenario/arm; declare multiple scenarios for repeated cases. It provides no
statistical confidence or promotion recommendation. Record bodies use immutable
content-addressed filenames; each scenario/arm has an immutable digest pointer.
Every comparison verifies those digests and rechecks pointer/body bytes.

## Executable public fixture

From this repository, supply the following JavaScript on stdin to
`node --input-type=module -` (for example, a PowerShell here-string). It creates a public
temporary workspace, records current synthetic QA, and compares explicitly
invented observations. It performs no live model/tool/network evaluation:

```js
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initWorkflow } from './codex/scripts/lib/workflow.mjs';
import { snapshotQa, recordQa } from './scripts/lib/qa-report.mjs';
import { sha256 } from './scripts/lib/quality-files.mjs';
import { prepareTrial, inspectTrial, recordTrial, compareTrials, exportTrace } from './scripts/lib/workflow-trials.mjs';
const root=await mkdtemp(join(tmpdir(),'harness20-public-trial-'));
await initWorkflow({workspaceRoot:root,workflowProfile:'planning-first-20-v1',topic:'Public synthetic fixture.'});
await mkdir(join(root,'src'));
await mkdir(join(root,'step_archive/outputs'),{recursive:true});
await writeFile(join(root,'src/app.js'),'export const total = 7;');
await writeFile(join(root,'step_archive/outputs/observed.json'),'{"total":7}');
const reference=(path,text)=>({path,file_sha256:sha256(text),start_byte:0,end_byte:Buffer.byteLength(text),range_sha256:sha256(text)});
const snapshot=await snapshotQa(root,1,{artifacts:['src/app.js'],checks:[{id:'total',requirement:'The total equals seven.'}]});
const qa=await recordQa(root,1,{snapshot_id:snapshot.snapshot_id,verifier:{id:'public-reviewer',mode:'same-agent'},
  outcomes:[{id:'total',status:'pass',observation:'Synthetic fixture contains seven.',evidence_paths:['step_archive/outputs/observed.json'],next_check:''}],next_actions:[]});
const common={trial_id:'public-trial',task_id:'total-task',scenarios:[{id:'normal',check_ids:['total']}],
  sources:[reference('src/app.js','export const total = 7;')],model_id:'declared-model',provider_id:'declared-provider',
  budgets:{actions:8,tokens:1000},tool_set_sha256:sha256('declared-tools'),config_sha256:sha256('declared-config'),
  variants:{baseline_sha256:sha256('old-prompt'),candidate_sha256:sha256('new-prompt')}};
const prepared=await prepareTrial(root,common);
const selected={trial_id:common.trial_id,manifest_sha256:prepared.manifest_sha256};
console.log(await inspectTrial(root,selected));
for(const arm of ['baseline','candidate']) await recordTrial(root,{...selected,task_id:common.task_id,scenario_id:'normal',arm,
  variant_sha256:common.variants[`${arm}_sha256`],model_id:common.model_id,provider_id:common.provider_id,budgets:common.budgets,
  check_ids:['total'],outcome:'pass',actions:arm==='baseline'?6:4,tokens:arm==='baseline'?600:400,duration_ms:arm==='baseline'?200:100,
  hard_failure:false,qa:{step:1,report_sha256:qa.report_sha256},evidence:[reference('step_archive/outputs/observed.json','{"total":7}')]});
console.log(await compareTrials(root,selected));
console.log(await exportTrace(root,{}));
console.log('Public temporary workspace:',root);
```

The fixture's `-2/-200/-100` deltas are invented observations, not performance
measurements. Its trace has zero completed receipts because it completes no step.
To project an existing project's receipt metadata from PowerShell:

```powershell
'{}' | node scripts/workflow-trials.mjs trace --workspace 'D:/your-project' --input -
```

## Trace boundaries and Tower provenance

Trace reads only validated current Codex state and its exact completed
`stepNNN.json` receipt paths through guarded reads. It filters current workflow
identity and rechecks state/receipt bytes. Events contain only flat IDs,
coordinates, timestamps, provenance, digests, acceptance kinds and boolean
results. Summary/detail/command text, prompts, responses, file contents,
authentication and nested caller values are never projected. Corrupt or aliased
receipts yield a generic `unavailable`; this is not a second receipt store.

Design ideas come from [Tower commit76268c2](https://github.com/moatai-io/towersource/tree/76268c2969f20ccbea66d6582206c26e81ba7983),
licensed under [Apache-2.0](https://github.com/moatai-io/towersource/blob/76268c2969f20ccbea66d6582206c26e81ba7983/LICENSE):
[immutable manifests](https://github.com/moatai-io/towersource/blob/76268c2969f20ccbea66d6582206c26e81ba7983/packages/backend/services/harness/harness-manifest.ts),
[runtime fingerprints](https://github.com/moatai-io/towersource/blob/76268c2969f20ccbea66d6582206c26e81ba7983/packages/backend/services/harness/harness-fingerprint.ts),
[same-condition behavioral comparison](https://github.com/moatai-io/towersource/blob/76268c2969f20ccbea66d6582206c26e81ba7983/packages/backend/services/harness/harness-eval-runner.ts)
and [separate structural traces](https://github.com/moatai-io/towersource/blob/76268c2969f20ccbea66d6582206c26e81ba7983/packages/backend/services/ai-run-trace-events.ts).
No Tower code or dependencies are copied. Provider/budget binding and offline
saved-observation comparison are adaptations: Tower's live evaluator invokes a
model and grader. Its shallow payload scrubber is not reused. External-operation
idempotency ledgers and connector authentication gates remain outside this helper.
