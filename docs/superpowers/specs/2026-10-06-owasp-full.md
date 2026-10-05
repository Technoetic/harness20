# OWASP hardening design

User authorization: complete the applicable OWASP hardening of harness36, preserving the planning-first twenty-step workflow and historical 36/50 runs. Local source changes and verification are authorized; public release and live installation are separate operations.

Reference: user-supplied `OWASP-GenAI-LLM-Top-10-2026-v1.0.pdf`, 122 pages, SHA256 `ef87993a4e50ae9d83b41ff7a3d3e6320a82dfa8d4ec6bf98d0ce264b2e6108e`. This is the provided document, not a certification or a claim about its final publication status. Its numbering is authoritative for this work.

## Architecture

Assume an injected model can attempt an unsafe action. Deterministic host code checks tool arguments, file identities, transport destinations, schemas and quotas. Preserve native host review for commands and high-impact actions; a model's classification cannot grant permissions. Separate generated browser content from the privileged verifier. Carry evidence hashes and current workflow generation across delegated work. Protect host browser/quality measurement receipts from direct registered-tool mutation; preserve report reads and native review of trusted runner programs.

Enforcement scope is the plugin's registered hooks, CLI entry points, API transport, evidence storage and output verifier. Native host permissions, OS process isolation, provider billing caps and DNS/network firewall policy remain deployment responsibilities. A local request quota does not establish a dollar cap or sandbox arbitrary child code.

## Required coverage and exit criteria

| Supplied ID | Risk | Required controls and adversarial evidence |
|---|---|---|
| LLM01 | Prompt injection | Pre-execution read/write/fetch mediation; admin-state and sensitive path protection; invisible control rejection for outbound judgment material; external content remains advisory. Test malicious edits/URLs/control text. |
| LLM02 | Sensitive information disclosure | Central outbound credential scanning of values and structured keys; bounded selected excerpts; no raw command secrets in logs; minimal quality-child environment. Test nested credentials, literal keys, hidden Unicode and inherited env. |
| LLM03 | Excessive agency | Shared deterministic tool policy and native host review; no automatic shell/fetch grants; protect scope/state/admin changes during stopped runs too. Test preauthorized tools and completed/paused workflows. |
| LLM04 | Supply chain | Pinned dependencies and lockfile integrity audit, no new runtime dependencies, mandatory release security gate and provenance. Test floating versions, untrusted URLs, missing integrity and lifecycle injection. |
| LLM05 | Data/model poisoning | Strict duplicate-free bounded JSON, physical bounded source reads, current generation and unchanged source/config checks. No training capability; adding one requires a new security review. Test duplicate keys, stale/mutated sources and linked files. |
| LLM06 | Unbounded consumption | Persistent pre-call Jev reservations shared across processes and workflow resets, immutable call/byte/repetition ceilings, bounded JSON/file/tree/stdin/child output and deadlines. Test concurrency, corruption, repeats and timeout consumption. |
| LLM07 | Misinformation | Advisory semantic judgments and abstention do not establish PASS; keep deterministic measured evidence and binding. Test forged/schema-valid/stale evidence rejection and preserve historical reports. |
| LLM08 | Hidden context exposure | Reject sensitive/identity/context files at mediated reads, no whole-workspace automatic API context, minimal child env and logs. Test context-file reads and key leakage. |
| LLM09 | Vector/embedding weaknesses | Current plugin has no vector index, embeddings, semantic cache or training ingestion; document verified non-applicability and a mandatory future integration gate (tenant/chunk ACLs, trust segregation, provenance). Existing file retrieval is bounded and explicit, not a vector implementation. |
| LLM10 | Improper output handling | Strict untrusted JSON; argv execution without shell expansion and stable checked config; generated HTML requires verified all-transport host network isolation before execution. Origin, sandbox, CSP and permissions are additional protections. Test actual TCP/UDP/preconnect bypasses and reject unsupported native backends at both common and direct entries before artifact execution. |

## Limits and compatibility

- Keep all 174 old step bodies/indexes and the porting guide unchanged; default remains `planning-first-20-v1`.
- Preserve historical state/evidence inspection. New API judgments use hardened policy identifiers rather than presenting old decisions as newly verified.
- No new Playwright usage on this workstation. Actual browser verification uses Aside after its authorized startup helper.
- No secret contents, environment dumps or bulk vault transmission. Jev architecture advice uses a self-contained design question only.
- Quota ceilings: 12 calls/minute, 200/day, 786432 request bytes/minute, 8 MiB/day, at most 3 identical requests/day. Failures consume reservations; corrupt/locked storage fails closed. Provider output tokens and account spending require provider enforcement.
- Evidence readers allocate at most the configured byte bound plus a one-byte growth probe; source tree traversal has depth/directory/file/aggregate bounds.
- A completed implementation requires new attack tests, affected regressions, one whole suite at a time, and review by another agent. Preserve raw failures; do not relax host watchdog budgets to conceal them.
- Independent Chrome/153 probes found CSP bypasses (WebRTC UDP and preconnect TCP); the installed Aside API exposes no host enforcement primitive. Source review also identified an alternative-backend selection bypass. Close every shipping path by rejecting generated-output execution at the dispatcher and each native backend entry until a supported host isolation implementation exists. No workspace/CLI opt-out and no global browser/firewall changes. No Playwright package or browser invocation on the NS workstation.

## Design decision evidence

Jev direct API advice (one self-contained choice, no file contents) selected deterministic controls with explicit deployment boundaries, probability/confidence 1.0. Input hash `39197714de58226571f639b4302eb6944f38f3d5bc2cba28716b0db92782138d`, request hash `a3b84ffbdd45e18401a711208488b9e9c0ae1a091dab66e5547a29d0b289f9a1`; 592 input/58 output tokens. This supports the design choice only and is neither authorization nor a security verification.

A second self-contained hypothetical browser design choice selected fail-closed execution when native isolation is unsupported, confidence 1.0. Actual prepare/run both exited 0; input hash `2fb056197e7521ccb3690bbefb756bdc6f3b819bd2c57990410493920e6e4125`, request hash `5c92e40e6169893939fe78cf7e62a53332887c42588a6443d4dc86feccf76750`; 595 input/54 output tokens. No file contents or browser observations were sent. The host's actual attack probes and code verification establish the operational facts independently.
