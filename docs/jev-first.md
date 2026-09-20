# Jev-first direct questions

When the user requests Jev-first, send every eligible typed judgment in the current
request to Jev first. Ordinary chat and arithmetic are included, regardless of
difficulty or workflow stage. This is a host routing instruction, not an automatic
global interceptor. A standing preference can authorize ordinary selected nonsecret
input; reuse that scope without asking again for each question. Keys alone are not
authorization. A direct question does not start or change a Harness50 workflow.

The native [TypeSafe API](https://docs.typesafe.ai/api) supports these three types:

| Type | Input criteria | Result | Review signal |
|---|---|---|---|
| `noul` | Optional exact `{"true":"...","false":"..."}` | `noul` probability of true | `max(p,1-p)` below threshold, or exact `p=.5` |
| `choice` | 2–255 labels and descriptions; mandatory `abstain` label | Choice, probabilities, confidence | Abstention or low native confidence |
| `score` | Ordered array of 2–10 rubric levels | Weighted score, legend, probabilities, confidence | Low native confidence |

Noul does not return native confidence. Its derived decisiveness is only a review
heuristic. Score uses levels numbered `0..N-1`, and its value must match the weighted
distribution within `0.01 + 1e-9`; it is not a free integer answer. Probability sums
must be within `1e-6` of one. The default `min_confidence: 0.8` does not promise
calibrated accuracy. Native Noul and Score cannot guarantee abstention: establish
applicability and enough context before using them. Prefer abstaining Choice for
evidence-dependent questions.

## Input and commands

Use Node.js 22+ and the trusted installed plugin path. Serialize JSON to UTF-8 stdin;
do not interpolate user text into shell commands. No workspace or temporary evidence
file is required. For this public arithmetic question:

```json
{
  "schema_version": 1,
  "context": {"kind": "user_input", "text": "Is 1 + 1 = 2?"},
  "questions": [{
    "id": "answer",
    "type": "noul",
    "instructions": "Is this statement true in ordinary natural-number arithmetic?",
    "criteria": {"true": "True", "false": "False"}
  }],
  "min_confidence": 0.8
}
```

Pass that JSON to `node <plugin-root>/scripts/jev-ask.mjs prepare --input -`.
After validating the metadata and reusing existing authorization, pass the same
JSON to `node <plugin-root>/scripts/jev-ask.mjs run --input - --allow-network`.
The key is read only from `TYPESAFE_API_KEY`; no key flag, config or `.env` loader
exists. Preparation stays offline and rejects input containing that actual key too.

`context.kind` is `user_input` or `selected_text`, describing material explicitly
supplied by the caller. `context.text` and instructions must be nonblank. There are
1–12 questions with unique IDs matching `[a-z][a-z0-9_-]{0,63}`. Each question has
`id`, `type`, `instructions` and its type's `criteria`; Noul may omit criteria.
Only Choice also has `abstain`, which must name a supplied category. Unicode category
labels up to 64 characters are supported; unsafe control characters and reserved
prototype names are rejected. Extra fields, duplicate JSON keys, nonfinite numbers,
invalid UTF-8 and recognizable credentials are rejected before any request.

Example Choice: `{"id":"sum","type":"choice","instructions":"Select 1+1.",
"criteria":{"one":"1","two":"2","unknown":"Cannot establish an answer"},
"abstain":"unknown"}`. Example Score: `{"id":"tone","type":"score",
"instructions":"Rate greeting friendliness.","criteria":["Hostile","Neutral","Friendly"]}`.

## Results and boundaries

Prepare emits metadata and hashes without the context, instructions or rubric prose.
Run emits `status: reviewed|needs_review|unverified`, `role: advisory`,
`evidence_binding: inline_not_file_verified`, model and input/request/policy hashes,
`network_attempted`, ordered `results`, `review_reasons`, usage and an allowlisted
`error_code` or null. Noul results contain `id`, `type`, `noul`; Choice preserves
choice/probabilities/confidence; Score preserves score/legend/probabilities/confidence.
Score legend text must exactly equal the supplied rubric. No arbitrary provider
explanation is accepted. Exit zero means prepared or reviewed; other outcomes exit 2.
Malformed command/input errors produce a fixed sanitized JSON diagnostic on stderr.

Input, request and response each have a 64 KiB cap. The endpoint and model are fixed
to `https://api.typesafe.ai/v1/systemone` and `jev-1.13.0`. Requests have a 10-second
deadline, no retry and no redirects. The adapter reads stdin and writes stdout/stderr;
it does not discover files, read chat history, or store a report. The caller may
retain sanitized stdout in its already authorized evidence location.

Use existing [file checkpoints](jev-checkpoints.md) when judging selected file-derived
evidence. Do not relabel excluded or secret file content as inline material. Do not
automatically transmit the entire history, workspace, hidden context or private bulk.
Collect needed current facts and environment observations first. Mixed requests are
split into eligible judgments and host generation/execution; open text/code/art,
browser/file operations and real tests remain host work. Jev may assess candidates
after the host collects evidence. Missing evidence is not a proven negative.

Prefer an existing current file report when it already answers the same question.
Reuse a direct result only when current prepare input/request/policy hashes all
match. One designated caller sends one batch per unchanged request, without automatic
retry or duplicate worker calls. Mark an actual validated response `Jev used`, or
state `Host fallback: <reason>` for unsupported, unavailable or uncalled work. Keep
uncertain results for host review. Existing permissions, deterministic tests,
independent reviewers, final gates, state writers and completion history retain
their authority. This route does not provide permission or completion evidence.
