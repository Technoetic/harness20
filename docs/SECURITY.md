# Security boundaries and OWASP coverage

This implementation uses the user's supplied OWASP LLM Top 10 2026 PDF (122 pages, SHA256 `ef87993a4e50ae9d83b41ff7a3d3e6320a82dfa8d4ec6bf98d0ce264b2e6108e`). Its numbering differs from 2025. This is engineering hardening against that reference, not OWASP certification or a claim that the provided PDF is a final publication.

Assume a model can follow malicious instructions. Authorization, transport limits, source validation and browser isolation belong in host code. External text and Jev responses are data and advice; they cannot widen the user's scope or authorize a tool. Previously granted user authorization remains valid for the exact applicable work; routine reversible work does not need repeated approval. Privileged, irreversible or external effects require the native host's concrete action review and applicable user authorization.

## Controls

| Provided risk | Enforced plugin controls | Verification |
|---|---|---|
| LLM01 Prompt injection | Shared pre-execution read/write/fetch policy; scope/admin paths protected; automatic TOPIC SHA pin in new Claude bootstraps and Codex evidence contexts; outbound hidden Unicode rejected | `owasp-tools`, `owasp-input-boundaries`, `owasp-jev` |
| LLM02 Sensitive information disclosure | Central structured/literal credential scanner; selected bounded excerpts; sanitized guard logs; minimal quality child environment | `owasp-jev`, `owasp-tools`, `owasp-output` |
| LLM03 Excessive agency | No automatic shell/fetch approval; exact argument/path checks; preauthorized registered tools checked; paused/finished/corrupt metadata cannot disable guards | `owasp-tools`, `harness-activity`, `guard`, `claude-security` |
| LLM04 Supply chain | Exact reviewed package versions, SHA512, origins and graph; no install/pre/post lifecycle hooks; CI gate before install; verified axe code before browser injection; immutable plugin writes protected | `owasp-supply-chain`, `owasp-output`, `npm --ignore-scripts run verify:security` |
| LLM05 Data/model poisoning | Duplicate-free bounded JSON, physical single-link reads, before/after file identity checks, generation/scope/source/config binding; canonical host measurement files protected from registered-tool mutation | `owasp-input-boundaries`, `qa-report`, `profile-evidence`, `owasp-output`, `owasp-tools` |
| LLM06 Unbounded consumption | Pre-call durable user-wide reservations, concurrency lock and repetition ceiling; finite stdin/JSON/file/tree/output/deadline limits | `owasp-jev`, `owasp-input-boundaries`, `owasp-tools`, `owasp-output` |
| LLM07 Misinformation | Jev remains advisory; low-confidence/abstained output needs review; current measured evidence is required; direct registered-tool mutation of host measurement receipts is denied | Existing judgment/report/quality/final-regression suites, forged-result attacks and `owasp-tools` |
| LLM08 Hidden context exposure | Sensitive/context/state reads protected; no implicit whole-workspace outbound context; key-free child env/logs | `owasp-tools`, `owasp-output`, explicit excerpt tests |
| LLM09 Vector/embedding weaknesses | No vector index, embeddings, semantic cache or model-training ingestion in this plugin; explicit file retrieval stays bounded | Source/dependency audit; future integration gate below |
| LLM10 Improper output handling | Strict response schemas; argv child execution without shell expansion; stable reviewed config; generated HTML requires verified host network isolation before execution; origin/sandbox/CSP/permissions are additional controls | `owasp-output`, actual `owasp-aside-live.mjs` rejection and independent TCP/UDP bypass probes |

Test names above refer to `codex/tests/*.test.mjs`. `codex/tests/owasp-aside-live.mjs` runs only when explicitly invoked with an available Aside browser. It never installs or launches Playwright. Start Aside using your deployment's authorized helper first; on the NS workstation this is `00-meta/scripts/aside-up.ps1`. The browser window is retained and only the runner's own tabs are eligible for cleanup.

## Durable Jev limits

The three Jev transports share one user-wide ledger in `~/.harness36-security/jev-budget`, across CLI processes, API keys and workflow resets. The historical storage name stays unchanged when the public plugin becomes harness20, so renaming does not reset quota enforcement. Reserve before dispatch; authentication failures, timeouts and malformed responses consume the reservation. UTC day/minute boundaries apply.

- 12 requests/minute and 200 requests/day.
- 786432 UTF8 request bytes/minute and 8 MiB/day; at most 65536 bytes/request.
- At most 3 identical requests per key/day.
- No retries or refunds. Corrupt, linked, regressing-clock or persistently locked storage blocks new calls. Do not automatically delete or reset it. An operator must inspect and repair under host authorization.

Request bytes are a conservative input reservation, not a measured tokenizer, output/thinking-token budget or currency cap. `budgetRoot` and `HARNESS36_JEV_BUDGET_ROOT` are trusted-host/test dependency injection, never JSON input permissions. Protect their configuration and the physical directory with host permissions. New guarded command/path requests that alter this security scope are blocked; a program with independent OS write access is outside the plugin's enforcement boundary.

Hardened Jev policy hashes intentionally differ from previous policies, including old36. Old workflow/receipt/history bytes remain. An old advisory report does not become a judgment under the new policy; obtain fresh evidence when required. Existing untagged Claude bindings remain compatible historical runs; new bootstraps always write `security_policy: owasp-v1` plus the original TOPIC digest. Do not label an untagged historical run as newly pinned.

## Host and deployment responsibilities

The plugin checks registered Claude/Codex adapter tool names in established workflows. An unrelated directory without workflow state keeps native host permissions and does not activate workflow guards. Once a workflow exists, paused, completed, malformed and missing progress metadata cannot disable its guards. Unknown connector/tool aliases retain native host permissions; they are not auto-granted. Parsed URL checks reject nonpublic literal IPs and obvious internal names, userinfo and unsafe schemes. DNS rebinding, redirects in unrelated host tools and internal network reach require the host's egress/firewall policy.

Quality checks are explicitly authorized project programs, not an OS sandbox. They receive a minimal environment, execute without shell expansion and stop when checked source/config/scope changes. Use `quality-gate.mjs --prepare --workspace <root>` to render all four exact argv arrays and their config digest before authorizing execution. `--config-sha256 <digest>` pins execution to those bytes; the digest alone is not human approval. The native host must review the exact commands and apply least-privilege identity, filesystem/network restrictions and provider/account spending caps appropriate to the project. A credential scanner cannot identify all private business prose or every encoding.

Canonical `step_archive/outputs/browser-output.json` and `quality-gate.json` are
host-produced measurements. Registered file mutations and recognized literal shell
writes cannot edit or replace them; destructive replacement of their parent output
directory is also blocked. Reading reports, writing ordinary advisory notes and
running the existing trusted verifier programs remain available under native host
review. This protects that tool boundary, not every independently authorized OS
program. The files remain unsigned local evidence; a JSON assertion cannot attest
the producer or native network isolation.

The installed Aside API has no supported per-tab host network enforcement. Independent actual-browser attacks bypassed CSP with WebRTC STUN (4 local UDP packets) and preconnect (2 local TCP connections, 0 HTTP requests). Counting HTTP requests or hiding JavaScript constructors cannot establish network isolation. Generated-output verification therefore requires a common host isolation gate for every backend, including explicit, environment, automatic and previously locked selections. Each direct backend entry also enforces the gate. Current native adapters reject before artifact serving or navigation; a fresh Chromium context and HTTP/WebSocket routing alone cannot satisfy the all-transport requirement. No artifact, workspace configuration or CLI flag can waive it. Enabling a future backend requires a reviewed host implementation with TCP/UDP/preconnect and fresh-frame attack evidence; a browser-page assertion is insufficient.

The origin, sandbox, CSP and permission controls remain additional protections for a supported backend. Earlier benign route and HTTP attack measurements describe those controls before the final capability gate, not a current successful Aside preview. The verifier retains a 600-second aggregate deadline, shrinking per-call timeouts and a 15-second cleanup ceiling. Browser measurement is local evidence, not signed attestation or proof against all browser vulnerabilities. Global browser profiles and firewall rules are not changed by this plugin.

The reviewed checkout and expected release digest are the supply-chain trust anchor. A checksum bundled with an attacker-controlled package cannot authenticate that package. Review the source commit, verify package/installed bytes independently, then enable hooks under native host trust. CI remains `contents: read` with commit-pinned actions and `npm ci --ignore-scripts`.

## Gate for future capabilities

Adding a vector/embedding/semantic-cache integration requires a new reviewed threat model and tests for tenant and chunk ACLs enforced inside retrieval, separate indexes by trust zone, authenticated/rate-limited endpoints, provenance and compromised-batch invalidation. Adding training or durable instruction-bearing memory requires vetted source provenance, dataset isolation, explicit memory-write authorization and poisoning regressions. Current non-applicability does not approve either future feature.
