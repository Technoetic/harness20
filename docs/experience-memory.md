# Verified experience memory

This optional local layer retains sanitized failure context, QA-backed repair
lessons, immutable observations and retirement records. It provides bounded
context from explicitly selected, digest-pinned public sources. All text is
untrusted data. Saved advice cannot execute commands, grant approval, clear
failure counts, change workflow state, publish receipts or replace required
acceptance evidence. The existing state manager, TOPIC pin, guards, QA protocol
and profile contracts remain authoritative.

The orchestrator alone writes lesson records, observations and retirements
sequentially. Workers may inspect and propose structured input. Before a retry,
inspect failure and the relevant QA round; after an actual repair and current
recorded QA PASS, explicitly register its lesson. Restart recovery uses explicit
inspection. SessionStart does not automatically inject memory or perform new
memory I/O. No installed settings, providers, network service or dependencies
are changed. Node.js 22 or later and the standard library are sufficient.

## Command interface

Resolve tools from the trusted installed plugin root. Every command takes exactly
one workspace and stdin object; input files, unknown/duplicate flags, duplicate
JSON fields, unknown schema fields, invalid UTF-8 and non-object input are rejected.
Use JSON serialization and UTF-8 stdin; never interpolate user text into shell
code. Input is bounded to 256 KiB and existing stream timeouts apply.

```text
node <plugin>/scripts/workflow-memory.mjs failure --workspace ROOT --input -
node <plugin>/scripts/workflow-memory.mjs record  --workspace ROOT --input -
node <plugin>/scripts/workflow-memory.mjs inspect --workspace ROOT --input -
node <plugin>/scripts/workflow-memory.mjs observe --workspace ROOT --input -
node <plugin>/scripts/workflow-memory.mjs retire  --workspace ROOT --input -
node <plugin>/scripts/task-context.mjs retrieve --workspace ROOT --input -
node <plugin>/scripts/task-context.mjs validate --workspace ROOT --input -
```

Exit 0 means recorded/current/historical memory, or current context/declarations.
It never means the product passed acceptance. Exit 2 means missing, unsupported,
blocked, invalid or unavailable. Missing/unsupported/blocked results are fixed
advisory JSON on stdout. Invalid/unavailable commands write only a fixed
`MEMORY_COMMAND_FAILED` or `CONTEXT_COMMAND_FAILED` diagnostic on stderr; they do
not echo input, filesystem paths or raw exceptions. Do not retry a blocked request
by weakening mandatory scope or bypassing a rejected source policy.

## Binding and source references

Every manifest/sidecar stores a four-field `binding`: repository root identity
SHA256, workflow profile, workflow generation SHA256, and pinned TOPIC SHA256.
Obtain it through `memoryWorkspace(ROOT).binding`, which narrowly verifies trusted
workflow metadata and TOPIC. Do not invent it, copy it across repositories, read
private settings, or enumerate archives. Default lesson inspection stays in this
namespace. Historical workflows lacking a supported generation return
`unsupported`; their existing profiles, receipts and normal execution remain
readable, and no migration is automatic.

A source reference has exactly `path`, `file_sha256`, `start_byte`, `end_byte`, and
`range_sha256`. Offsets are inclusive start/exclusive end in the original UTF-8
bytes. Both the whole-file hash and the selected-range hash are required. Reject
partial UTF-8 boundaries; a range is indivisible and never silently truncated.
Classify an explicitly selected path before opening it using
`assertMemorySourcePath(path, kind)`. Only then read bounded bytes through
`readSafe`, hash them, choose an authorized range, and verify it with
`readMemorySource`. Its `file_bytes` is numeric whole-file size, not excerpt size.

Kinds are `repository-source`, `approved-artifact` and `lesson`. Private config,
secrets, hidden/tool directories, links/hardlink aliases, workflow control files
and arbitrary archived records are refused. Approved artifacts are exact selected
safe paths under `step_archive/outputs/`, `step_archive/specs/` or
`step_archive/screenshots/`; this is not authorization to scan those folders.
TOPIC is available only through the narrow binding operation. Secret-like content
is refused even in an otherwise eligible source. An allowed manifest cannot
override these restrictions.

This complete example emits resolved command inputs for an existing public
`src/app.mjs`, a manager-recorded failure and a current actual QA PASS for `total`.
Run it as host-controlled JavaScript from the plugin root; set `root` to the
selected temporary/project workspace. It reads only classified selected public
files and narrowly scoped manager/QA helpers, prints references rather than
source bytes, and does not execute or register advice.

```js
import { memoryWorkspace, assertMemorySourcePath, readMemorySource }
  from './scripts/lib/memory-policy.mjs';
import { inspectFailure } from './scripts/lib/workflow-memory.mjs';
import { inspectQa } from './scripts/lib/qa-report.mjs';
import { readSafe, sha256 } from './scripts/lib/quality-files.mjs';
const root = process.argv[2];
const { binding } = await memoryWorkspace(root);
const path = 'src/app.mjs'; // Explicitly selected public candidate, never a secret.
assertMemorySourcePath(path, 'repository-source');
const bytes = await readSafe(root, path, 8 * 1024 * 1024);
const source = { path, file_sha256: sha256(bytes), start_byte: 0,
  end_byte: bytes.length, range_sha256: sha256(bytes) };
await readMemorySource(root, source, {kind:'repository-source'}); // <=16 KiB excerpt.
const failed = await inspectFailure(root, {});
const qa = await inspectQa(root, 1);
if (!['current','historical'].includes(failed.status) ||
    qa.status !== 'current' || qa.verdict !== 'PASS' || !qa.preserve.includes('total')) {
  throw Error('Actual failure and current total QA evidence required');
}
const verification = {step:1, report_sha256:qa.report_sha256, check_ids:['total']};
const record = {
  task_id:'total-task', failure:{step:failed.record.step, attempt_id:failed.record.attempt_id},
  repair_observation:'Corrected the total; executed the check and observed seven.',
  scope:{task_ids:['total-task'], source_paths:[path], check_ids:['total']},
  sources:[source], verification,
  validity:{from:'2026-10-08T00:00:00.000Z', until:'2026-11-08T00:00:00.000Z'},
  related_ids:[], supersedes:[]
};
const inspect = {task_id:'total-task',sources:[source],check_ids:['total'],
  max_results:8,max_bytes:16384,as_of:'2026-10-08T01:00:00.000Z'};
console.log(JSON.stringify({binding, failure:record.failure, record, inspect}));
```

Send the emitted `record` object itself to the `record` command, not the enclosing
example object. The memory store independently rechecks current QA, selected
checks and all source hashes; the example's inspection is not a proof substitute.
Validity dates are an explicit host decision and must fit the intended use.

## Failure, lesson and observation requests

`failure` accepts `{}` for the current attempt, or an optional step and/or attempt
selector. Use manager-returned attempt IDs; the manager derives them and an
`idFactory` seed is not necessarily the attempt ID. Generic `failStep` captures
the frozen failure automatically after authoritative state/event writes under
its existing guard. Auxiliary storage failure cannot suppress the failure count.
Stored evidence includes digests, not raw detail or commands.

```json
{"step":1,"attempt_id":"attempt-manager-returned-id"}
```

`record` requires exactly the fields in the resolved example above. QA's
`report_sha256` must identify a current recorded PASS; selected `check_ids` must
be preserved, and each current source must be an artifact in that report. No
caller `success` flag or arbitrary verification path is accepted. The verifier's
recorded mode remains explicit; same-agent QA is not independent review. Exact
semantic duplicates return the same lesson ID; related/superseded IDs must name
existing records. Namespace paths are manager-derived, never caller directory
components. Records remain immutable.

`inspect` requires task ID, sources, check IDs, positive `max_results` (up to 128),
`max_bytes` (1–64 KiB), and a millisecond UTC `as_of`. Optional `selected_ids`
select exact lesson hashes, `include_metrics:false` avoids observation projections,
and `origins` explicitly selects cross-generation `{path,sha256}` records. There
is no bulk archive lookup. Origin use still requires matching repository/profile/
topic/task/source scope, current QA proof and hashes. Stale supplied references
are rejected; supply newly verified references to learn that an old lesson no
longer applies. Expiry, retirement, supersession and withdrawn proof remove
applicability.

```json
{"task_id":"total-task","sources":[{"path":"src/app.mjs","file_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","start_byte":0,"end_byte":24,"range_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"check_ids":["total"],"max_results":8,"max_bytes":16384,"as_of":"2026-10-08T01:00:00.000Z","selected_ids":["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],"include_metrics":false,"origins":[]}
```

The literal hashes in schema examples are syntactically valid illustrative values,
not proof. Replace them with actual verified hashes from the bounded procedure
and command results; do not send them as evidence.

After a later actual attempt, `observe` records an immutable observation. Outcomes
are `resolved`, `recurred`, `adverse`, or `unknown`; `applicable` is an explicit
observer label, checked against current scope/evidence. An optional `verification`
contains the current step/report/check fields from an actual QA round. It is
required to count a result as currently verified, and that proof must come from
QA recorded with an actual independent verifier. A same-agent QA round keeps its
mode and does not enter the independent verified denominator. Supplied outcome
labels alone never prove success.

```json
{"lesson_id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","observation_id":"retry-2","applicable":true,"outcome":"resolved","observed_at":"2026-10-08T02:00:00.000Z","task_id":"total-task","sources":[{"path":"src/app.mjs","file_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","start_byte":0,"end_byte":24,"range_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"check_ids":["total"],"verification":{"step":1,"report_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","check_ids":["total"]}}
```

Inspection reports eligible attempts, known outcomes, observer-labelled outcomes
and current verified evidence with separate denominators. Unknown outcomes do
not enter known-outcome rates. Zero denominators produce `null`, not perfect or
zero success rates. Retirement removes advice from applicability without erasing
failure, QA, original lesson, observation or receipt provenance.

```json
{"lesson_id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","retired_at":"2026-10-08T03:00:00.000Z","reason":"The product requirement changed; preserve history and withdraw this advice."}
```

## Selected context

A manifest is a schema-version-1 object with binding and up to 128 explicit
sources. Each entry has a unique ID, kind, role, mandatory flag and reference;
optional `work_unit_id` limits candidates, and `links` references only declared
source IDs. Roles `scope` and `blocker` require `mandatory:true` and remain
mandatory across work-unit selection. Optional candidates may be omitted with
bounded IDs/reasons; source text is never silently cut.

```json
{"schema_version":1,"binding":{"repository_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","workflow_profile":"planning-first-20-v1","workflow_generation":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","topic_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"sources":[{"id":"scope","kind":"repository-source","role":"scope","mandatory":true,"reference":{"path":"docs/scope.txt","file_sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","start_byte":0,"end_byte":18,"range_sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}},{"id":"repair","kind":"repository-source","role":"candidate","mandatory":false,"work_unit_id":"repair","links":["scope"],"reference":{"path":"src/app.mjs","file_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","start_byte":0,"end_byte":24,"range_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}}]}
```

Write the host-selected manifest to an eligible explicit path, then classify and
hash its exact bytes using the same procedure. Request:

```json
{"manifest_path":"docs/context.json","manifest_sha256":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","query":"repair total calculation","work_unit_id":"repair","budget_bytes":8192,"as_of":"2026-10-08T01:00:00.000Z","backend":"hybrid","expand_links":true}
```

BM25 uses fixed k1=1.2, b=0.75 and Unicode NFKC/lowercase tokenization. Hybrid
combines actual BM25 and token-overlap ranks with RRF k=60; deterministic ties use
source IDs. Optional explicit link expansion traverses at most two hops. It is
bounded reference traversal, not learned graph retrieval. `budget_bytes` is
1,024–65,536 bytes of the entire serialized UTF-8 JSON, including metadata and
omissions. `serialized_bytes` reports that complete size. Mandatory content that
cannot fit returns `blocked` with `mandatory_context_exceeds_budget`.

A lesson candidate must also include `lesson` metadata with `id`, `record_path`,
`record_sha256`, `task_id`, `sources`, and `check_ids`. Obtain them from a real
record result and its registered scope. Its reference selects the whole immutable
lesson record; path/hash must match the metadata. Only applicable verified lessons
can return. This host-controlled builder emits a complete valid lesson entry:

```js
// saved is the actual `record` result; recordInput is its exact validated input.
assertMemorySourcePath(saved.record_path, 'lesson');
const lessonBytes = await readSafe(root, saved.record_path, 16 * 1024);
const lessonEntry = {id:'verified-repair',kind:'lesson',role:'candidate',mandatory:false,
  reference:{path:saved.record_path,file_sha256:sha256(lessonBytes),start_byte:0,
    end_byte:lessonBytes.length,range_sha256:sha256(lessonBytes)},
  lesson:{id:saved.lesson_id,record_path:saved.record_path,
    record_sha256:saved.record_sha256,task_id:recordInput.task_id,
    sources:recordInput.sources,check_ids:recordInput.verification.check_ids}};
console.log(JSON.stringify(lessonEntry));
```

Limits are 256 KiB per manifest, 8 MiB per source, 32 MiB actual aggregate reads
per request including nested QA checks/rechecks, 16 KiB per selected excerpt,
2 KiB query, and 128 sources. No network/model/embedding call, command execution,
or persistent search cache is added. Binding and source hashes are rechecked
before a pack returns; insufficient budgets or changed evidence stay unavailable.

## Declared work, reads and checkpoints

`validate` reads only the exact digest-pinned sidecars selected by the host.
Work units own 1–3 distinct eligible repository files, with globally unique
ownership and closed acyclic dependencies. Example:

```json
{"schema_version":1,"binding":{"repository_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","workflow_profile":"planning-first-20-v1","workflow_generation":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","topic_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"work_units":[{"id":"repair","files":["src/app.mjs"],"depends_on":[]},{"id":"review","files":["docs/review.txt"],"depends_on":["repair"]}]}
```

A read ledger pins the work-unit file digest and declares exact source ranges.
Repeated overlapping reads of the same path for the same decision require
`repeat_of` with all overlapping earlier read IDs plus a nonempty `reason`.

```json
{"schema_version":1,"binding":{"repository_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","workflow_profile":"planning-first-20-v1","workflow_generation":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","topic_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"work_units_sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","reads":[{"id":"read-1","work_unit_id":"repair","decision_id":"fix-total","kind":"repository-source","reference":{"path":"src/app.mjs","file_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","start_byte":0,"end_byte":24,"range_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}},{"id":"read-2","work_unit_id":"repair","decision_id":"fix-total","kind":"repository-source","reference":{"path":"src/app.mjs","file_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","start_byte":0,"end_byte":24,"range_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"},"repeat_of":["read-1"],"reason":"Recheck the same bytes before final review."}]}
```

Checkpoints declare changes, test evidence, blockers and next-safe-action. A
claimed `passed` checkpoint requires at least one current hashed evidence
reference with declared zero exit code. The validator never executes `command`.
This checks the declaration and its current bytes, not whether a test actually
ran, whether its assertion was meaningful, or whether requirements are complete.

```json
{"schema_version":1,"binding":{"repository_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","workflow_profile":"planning-first-20-v1","workflow_generation":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","topic_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"work_units_sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","checkpoints":[{"id":"repair-check","work_unit_id":"repair","status":"passed","changes":[{"path":"src/app.mjs","file_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","start_byte":0,"end_byte":24,"range_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}],"test_evidence":[{"reference":{"path":"step_archive/outputs/actual-check.json","file_sha256":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","start_byte":0,"end_byte":34,"range_sha256":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"},"exit_code":0,"command":"node host-controlled-total-check.mjs"}],"blockers":[],"next_safe_action":"Request the existing independent review."}]}
```

```json
{"work_units_path":"docs/work-units.json","work_units_sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","read_ledger_path":"docs/read-ledger.json","read_ledger_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","checkpoints_path":"docs/checkpoints.json","checkpoints_sha256":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}
```

`read_ledger_path`/digest and `checkpoints_path`/digest are optional paired fields.
Successful output explicitly says `declaration_only:true` and
`actual_tool_history_verified:false`. Existing profile indexes, step contracts,
receipt acceptance and required milestones are unchanged.

## Evidence and scoped references

Run `node --test codex/tests/workflow-memory-cli.test.mjs
codex/tests/task-context-cli.test.mjs codex/tests/memory-integration.test.mjs` as a
single command. The integration test uses real temporary init/begin/fail APIs,
executes a host-controlled wrong and repaired candidate, records actual QA
source/evidence hashes, registers/retrieves a lesson through fresh CLI processes,
rejects changed evidence and checks poisoned advice against byte-identical state,
events and receipts. Only explicit manager completion changes the failure count.

`node scripts/evaluate-memory.mjs` runs offline paired memory-off/on public
synthetic later-action fixtures with the same fixed action budget. It measures
fixture pre/postconditions, recurrence, unsafe/no-answer actions and explicit
denominators across retry, changed sources/requirements, expiry, poisoning and
withdrawal. It is not a reproduced paper benchmark, LLM evaluation, or a claim
about user/business performance. Synthetic fixtures and declared ledgers do not
prove real-world tool history or complete prompt-injection resistance.

| Primary paper/project | Pattern implemented here | Limit |
| --- | --- | --- |
| [SimpleMem paper](https://arxiv.org/abs/2601.02553), [official code](https://github.com/aiming-lab/SimpleMem) | Structured evidence/repair units and exact semantic deduplication | No full memory compression algorithm |
| [A-MEM paper](https://arxiv.org/abs/2502.12110), [official code](https://github.com/WujiangXu/A-mem-sys) | Explicit related/superseded evidence and lesson links | No autonomous memory evolution |
| [Zep paper](https://arxiv.org/abs/2501.13956), [Graphiti](https://github.com/getzep/graphiti) | Validity intervals, provenance and supersession | No external temporal graph server |
| [qmd](https://github.com/tobi/qmd) | Deterministic BM25 and actual rank fusion | No vector embeddings or learned reranker |
| [HippoRAG 2 paper](https://arxiv.org/abs/2502.14802), [official code](https://github.com/OSU-NLP-Group/HippoRAG) | Bounded two-hop explicit source references | No knowledge graph, PPR or original retrieval pipeline |
| [Letta Code](https://github.com/letta-ai/letta-code) | Persistent verified lessons and honest outcome denominators | No agent-runtime or model integration |
| [MemoryArena paper](https://arxiv.org/abs/2602.16313), [official code](https://github.com/ZexueHe/MemoryArena) | Later-action paired workflow checks | Public deterministic fixtures only |
| [LongMemEval V2 paper](https://arxiv.org/abs/2605.12493), [official code](https://github.com/xiaowu0162/LongMemEval-V2) | Changed facts, insufficient evidence and no-answer checks | No reproduction of the dataset or reported scores |
| [MINJA paper](https://arxiv.org/abs/2503.03704), [official code](https://github.com/dsh3n77/MINJA) | Poisoned advice, withdrawal and residue checks | No claim of universal attack resistance |

The pattern selection follows [agentic-vault's versioned memory-pattern mapping](https://github.com/Technoetic/agentic-vault/blob/v0.19.0/docs/memory-patterns.md).
These are scoped engineering references; the harness does not claim to implement
the full papers, reproduce their benchmark numbers or use their external services.
