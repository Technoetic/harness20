# Changelog

## Unreleased

- Register the Claude `auto-approve` hook only for edits and WebSearch (`Write|Edit|MultiEdit|NotebookEdit|WebSearch`). Bash and WebFetch were never eligible for approval (`hooks/lib/approval-policy.mjs`), so decisions are unchanged, and a Bash call no longer starts PowerShell and Node just to defer.
- `hooks/run-hook.mjs` now gives every hook a budget shorter than its `hooks/hooks.json` timeout. A hook that runs past it is stopped with its whole process tree (`taskkill /T /F` on Windows, where a Node started by PowerShell would otherwise keep the output pipe open) and exits 1 without a decision, which leaves the normal permission flow in place. On 2026-09-25 the host timeout did not end two `auto-approve` runs that stayed alive for 15 and 32 minutes. PowerShell hooks also start with `-NonInteractive`.
- The `destructive-guard` block message and the Bash deny of `permission-request-guard` now say that the whole command text is checked, including quoted strings and heredoc bodies, and name the file route for message text: write it with the Write tool, then pass `git commit -F <file>` or `gh pr create --body-file <file>`. They also say not to move a blocked command into a script and to ask the user when the command itself must run.
- PowerShell hooks now handle project paths that contain brackets (-LiteralPath); the duplicate wildcard gate in auto-approve.ps1 is removed. Before, a project such as `x [30]` or a file such as `src/[id].js` made the `.ps1` hooks go quiet: `Test-Path` returned False, `Get-Content` threw, `Set-Content`/`Out-File` failed and `Get-ChildItem`/`Copy-Item`/`Move-Item` did nothing. When neither `CLAUDE_PROJECT_DIR` nor the event `cwd` is set, the hooks fall back to the process working directory, because PowerShell 5.1 started in a bracketed folder reports `$PSHOME` from `Get-Location`. The step 38 `html-bundler` tool gets the same fixes on both variants (the bash one read `[ ]` in the project path as a glob class), no longer reads a directory named like `vendor.js` as a script, and inserts code containing `\` or `$&` as written.

## 2.9.0 — 2026-09-23

- Lock the Step 3 browser backend. `node scripts/verify-output.mjs --probe --lock --workspace "<project-root>"` records the choice in `step_archive/outputs/browser-backend.json` (`schema_version`, `selected`, `tool_version`, `probed_at`). An explicit `--backend` or `HARNESS50_BROWSER_BACKEND` still wins. Otherwise `auto` uses only the locked backend and fails with a message naming only that backend instead of silently switching to Playwright once Playwright is installed. Projects without a lock keep the Playwright → Aside order. An invalid, BOM-prefixed, oversized or aliased lock fails closed with a repair hint. Plain `--probe` output is unchanged. `--probe --workspace` adds `lock` and `error`, and `--lock` requires an explicit workspace. The browser report records `backend_selection`.
- Make `hooks/validate-tools.ps1`/`.sh` hints backend-aware with the same lock read. A project locked to Aside is told that Playwright is not needed, with no install command. A project locked to Playwright keeps the `npm ci` / `npx playwright install chromium` path without being pointed at Aside. Projects without a lock see the previous hint byte for byte. Both variants read the lock by path, so a caller in another directory or `[ ]` in the project path cannot make them miss it.
- Steps 3, 31, 45 and 50 on both hosts now carry the lock. Step 3 writes it and prepares only one backend, and the Codex contract adds the required `browser-backend-lock` artifact while `browser-backend-probe` stays `node scripts/verify-output.mjs --probe`. Step 31 keeps the locked backend as a non-project dependency, and the Claude text backfills a missing lock from the Step 3 report. Steps 45 and 50 repair only the locked backend and never install another backend's package or browser binary. Intentional policy change: under an Aside lock, the Step 45 E2E runner drives Aside instead of downloading Playwright browsers. Only workspaces currently on Step 3 see the new Codex acceptance; completed steps are unaffected, and a Step 3 receipt written before the lock still replays when `complete` is retried.
- Document the lock in `docs/BROWSER-TOOLS.md` ("Backend lock (Step 3)": schema, precedence, messages, deliberate re-selection), `docs/QUALITY.md`, `docs/ROUTING.md`, the README, the evaluator skill and the harness rules. The harness rules also reach in-progress Claude projects whose archived step files predate the lock. The old advice to prefer Playwright for the final Step 50 evidence is replaced: keep the locked backend.
- Claude hooks now defer to Codex workflow state. When `step_archive/.harness50-codex/state.json` exists, the Codex state manager owns the workspace. The Claude SessionStart loader no longer creates, migrates or session-counts `progress.json`. It prints one ASCII line from the new read-only `hooks/lib/codex-workflow.mjs` probe, for example `Codex workflow <id> is running at step 30/50`. The line points to `codex/scripts/harness-state.mjs` and `codex/skills/webapp/SKILL.md`. An unreadable, partial or untrusted state prints a warning instead of its content. Previously a Codex-started project opened in Claude Code got a fresh `progress.json` at step 1.
- Stop no longer blocks in Codex workspaces. `step-auto-continue` exits before any read or write, with no `decision: block` and no stall `.state` file. `step-progress-writer` leaves `progress.json` and its `.bak` untouched. `spec-generator`, `step-obedience-guard` and the trust5 Stop gate (`scripts/quality-gate.mjs --hook`) also stay silent, even next to a stale Claude `progress.json`. Previously every turn end demanded step001.
- `webapp-trigger` no longer re-initializes a Codex workspace. It reports that it was skipped and leaves the Codex-pinned `TOPIC.md`, `progress.json` and `step_archive/` unchanged. The Claude `/webapp`, `/harness-status` and `/harness-reset` commands check for Codex state first. They never fall back to writing TOPIC or `progress.json` there, and they report or continue through the Codex state manager instead.
- Claude permission prompts return in Codex workspaces. The loader-created `progress.json` used to make Claude auto-approve eligible edits there. `hooks/lib/approval-policy.mjs`, which both `auto-approve` variants use, now grants nothing while anything exists at `state.json`, even next to a stale or imported `progress.json`. Claude edits under `step_archive/.harness50-codex/` never get hook approval in any workspace, the same as `progress.json` (now also under other letter cases or 8.3 short names), so an agent cannot silence the Stop gates without a prompt. Apart from those edits, workspaces without `state.json`, including those whose state a Codex reset moved into `backups/`, keep the previous behaviour on every path. Each `.ps1` hook and its `.sh` counterpart carry the same gate, covered by `codex/tests/claude-codex-coexistence.test.mjs`. The suite runs every hook check under a project name with `[ ]` and under a plain one: a hook that still looks up `progress.json` with a wildcard `Test-Path` misses it under `[ ]`, so only the plain name proves that the Windows `.ps1` gates themselves hold.

## 2.8.0 — 2026-09-20

- Add `scripts/jev-ask.mjs prepare|run --input -` for direct inline questions without a workspace or fabricated source file. Preserve native Noul probability, abstaining Choice and ordered-rubric Score results, with exact response validation and sanitized advisory output.
- Route user-requested Jev-first work across all eligible judgments, including chat and arithmetic beyond the seven checkpoints. Reuse standing authorization and matching reports, split unsupported generation/tools into host work, and disclose Jev use or host fallback without duplicate calls.
- Bound UTF-8 stdin, wire and responses to 64 KiB; reject duplicate keys, invalid schemas, recognizable secrets and actual auth-key exposure. Keep network opt-in, fixed endpoint/model, deadlines, no redirects/retries, and no automatic file reads or writes.
- Preserve existing `jev-review` and `jev-judge` contracts, policy hashes, file provenance and stored reports, along with required tests, permission boundaries, step sources, completion writers and historical workflow records.

## 2.7.0 — 2026-09-20

- Add an advisory Jev choice-judgment CLI for Steps 16, 24, 25, 30, 37, 45 and 49, covering evidence support, research sufficiency, requirements, alternatives, explanations, scenario coverage and finding classification. Both hosts route authorized checkpoint reviews automatically and reuse prior authorization and matching current reports.
- Require explicit selected text excerpts and an abstention choice; report low confidence and insufficient evidence as needing review. Bound network requests and validate categorical responses, source freshness and content-addressed reports without retaining source prose or provider explanations.
- Preserve the Step25 adapter and reports, deterministic tests, visual review, reviewer separation and completion writers. Scoped optional API metadata does not grant general browsing permission; unavailable Jev returns to the existing review with a recorded reason.

## 2.6.0 — 2026-09-20

- Add an optional Step 25 Jev planning review for both hosts through `scripts/jev-review.mjs prepare|run|inspect`. Only explicitly selected topic and planning excerpts are eligible; network calls require `--allow-network` and `TYPESAFE_API_KEY`.
- Pin the TypeSafe endpoint and Jev model, bound input and response sizes and request duration, reject recognizable credentials, and retain immutable advisory reports with source hashes and categorical results. Changed inputs and failed calls remain unverified; existing reviewers, completion gates and permissions stay authoritative.
- Document the opt-in workflow and add library and CLI regression tests for source binding, secret rejection, transport failures, response validation, freshness, report integrity and sanitized output.

## 2.5.0 — 2026-09-16

- Turn `scripts/verify-output.mjs` into a dispatcher over two browser verification backends. Playwright now lives isolated in `browser-verifier/` (its own `package.json`, used by CI and by machines that allow it); the new `aside` backend drives the Aside CLI (`aside repl`) on machines where Playwright is not allowed or not installed. Both produce the same schema-v3 report and four screenshots; the completion gate reads named fields only and does not distinguish backends.
- Add `--backend auto|playwright|aside` (also `HARNESS50_BROWSER_BACKEND`), `--timeout <ms>` (the `timeoutMs` option; per chunk under Aside) and `--probe`, which prints backend availability and the `auto` selection without launching a browser. `auto` prefers Playwright and falls back to Aside; with neither installed the run fails with an explicit install message. Remove `playwright`/`@axe-core/playwright` from the root devDependencies.
- Record a top-level `environment` block in the browser report (`backend`, `isolation`, `deadline_scope`, `viewport_mode`, `screenshot_mode`, `browser`, `dpr`, `color_scheme`, `reduced_motion`, `language`, `tool_version`) so shared-profile Aside evidence discloses the user's colour scheme, language, DPR and extensions instead of passing as fresh-context evidence.
- Make the curriculum tool-neutral: Steps 3 and 4 are titled as browser-backend and accessibility-tool checks rather than Playwright/`@axe-core/playwright` installs, and Step 45 runs only the project's own `npm run e2e` command (`project-e2e-runner-only`) instead of prescribing `npx playwright test`.
- Add `docs/BROWSER-TOOLS.md` with the availability order, the measured Aside workarounds (iframe mobile viewport, server-injected init script, CSP request blocking, dataset console bridge, `history.back()` via evaluate, screenshot retry (parity-flipping attempts, no primer), reload via `location.reload()` with an iframe re-creation fallback (script reloads are inert unless the Navigation API was removed), session artifacts directory, per-chunk origins), Aside limits and the `environment` block. Update `docs/QUALITY.md`, `docs/ROUTING.md`, `docs/RETIRED-VALIDATORS.md`, the evaluator skill and the README to refer to it; a passing schema-v3 report remains required while the backend is free.
- Extend `hooks/validate-tools.sh`/`.ps1` with an `aside` tool (`aside --version`) and make the `axe` check tool-neutral (resolve `axe-core`, falling back to `@axe-core/playwright`).

Validation includes automated contract/runtime tests and Aside CLI measurements on Windows. It does not attest to a native Linux/macOS Aside run, a live-model run of all 50 steps or a deployed application.

## 2.4.3 — 2026-09-12

- Name the Step 44 report `step044_routing검증.md` and its acceptance item `routing-integration-report`, matching the routing integration and validation work. Update both hosts and all downstream input contracts together.
- Keep the old report name and acceptance ID only in the migration guide and historical receipt compatibility. Fresh completion requires the new pair and all current quality gates; replay preserves original receipts and artifact digests.
- Explain how completed native and imported workspaces can read prior reports as historical input without fabricating current validation evidence. Remove Step 42's assumption that HTML was already componentized.

## 2.4.2 — 2026-09-12

- Preserve the installed Codex continuous-execution fixes: process successive manager-selected work units within the active turn, and keep a pending continuation paired with its Stop delivery while resuming. Existing permissions, pause behavior and per-step completion gates still apply.
- Enforce fresh measured quality reports at Codex Steps 38, 44 and 50. Bind new final completion to the current HTML, desktop/mobile screenshots and six regression categories; apply the same final regression inspection to Claude completion hooks.
- Preserve exact replay of historical Step 5 and Step 50 receipts without weakening new completion requirements or fabricating current evidence.
- Bound GitHub reference searches to three queries and distinguish an exhausted search with no suitable references from transport or permission failures. Carry the verified no-reference decision into downstream planning without fabricated clones.
- Repair Step 24 research inside the current attempt with bounded supplemental rounds and an immutable manifest. Correct host-specific input paths and propagate accepted supplemental evidence into planning, design and review.
- Revalidate the final Claude Step 29 plan after augmentation and carry its hash into Step 30. Align runner selection with tool installation and permit a justified c8 skip when an alternative supplies measured coverage.
- Keep required Claude QA failures incomplete at Steps 39, 40, 43, 46, 47 and 48. Require local HTTP routing/fallback verification, reuse the tested URL and build hash, and distinguish pending deployment verification from completed local work.

Validation includes automated contract/runtime tests, Brave browser checks, installed-copy Claude checks and Git Bash hook tests on Windows. It does not attest to native Linux/macOS execution, a live-model run of all 50 steps or a deployed application.

## 2.4.1 — 2026-09-11

- Prepare the six-field topic contract from short or partial Codex init input before freezing its hash. Preserve original requests, explicit values, and complete contract bytes; identify generated defaults without inventing user decisions.
- Document the stdin JSON init command and align Step 1 with generated defaults. Preserve immutable topic handling during normal execution, import, and reset.
- Add regression coverage for short Korean requests, partial and empty fields, complete contracts, whitespace rejection, and non-overwriting initialization.
- Add bounded `repair-topic` recovery for native workflows stuck before Step 1 completion. Preserve original bytes and audit history, verify the pinned hash, and require a new resumed attempt without advancing or fabricating completion.
- Clarify that a trusted Stop hook continues one user request across later turns. Exercise all 50 manager/hook handoffs in an isolated scheduler test; this does not attest to a live host or a finished product.

## 2.4.0 — 2026-09-10

- Align Claude Step 49 and evaluator guidance with bounded, pass-only mandatory acceptance: retain unresolved findings as incomplete and keep preference scores advisory. Failed workers no longer emit completion receipts.
- Add a shared `qa-report.mjs` snapshot/record/inspect helper and connect it to relevant Claude and Codex QA attempts. Carry sanitized observations and next checks into retries without changing workflow state or metadata-only events.
- Bind mandatory outcomes to an explicit candidate file inventory and hashed evidence. Preserve immutable round reports; changed or missing evidence clears current preservation claims. Reports supplement existing gates and do not attest to execution, verifier identity or undeclared project files.

## 2.3.2 — 2026-09-07

- Make Step 44 a client-side routing checkpoint without requiring HTML component extraction. A single HTML can contain the routed screen regions directly.
- Remove the componentization completion check from Claude and Codex, and retain routing, semantic structure, accessibility and current-build checks. Keep all 50 steps.
- Keep the legacy report path and artifact ID solely for downstream compatibility; their names do not impose a componentization requirement.

## 2.3.1 — 2026-09-07 (unreleased preparation)

- Rename Step 44 to **클라이언트 사이드 라우팅** in Claude, Codex and the step index, keeping the workflow at exactly 50 steps.
- Make routing integration after source modularization an explicit Step 44 responsibility. Require evidence for the screen/URL map, deep links and traversal, Navigation API and History/hash backends, mode-specific fallback configuration, and native browser behavior before the second quality milestone.
- Retain HTML componentization as a supporting requirement, clarify separate development assets versus the single bundled HTML, and stop the Claude step when required checks fail.
- Preserve the existing Step 44 report path and artifact acceptance ID for downstream compatibility. Step 45 retains deployment-server verification and Step 50 retains final browser-report validation.

## 2.3.0 — 2026-09-07

- Require a stable URL for every independent screen while keeping a single self-contained HTML entry point. Carry the route contract through Claude and Codex design, implementation and completion steps.
- Prefer the Navigation API on capable HTTP(S) pages, with a single History/hash backend when unavailable. Restore the initial URL, preserve ordinary links and document anchors, and retain direct-file support through an explicit hash manifest.
- Validate deep links, reloads, traversal, active navigation and screen titles for every declared route at desktop and mobile sizes. Schema-3 evidence also requires the same checks with the Navigation API actually removed before page startup.
- Bind completion evidence to the exact HTML and route manifest, reject incomplete compatibility reports, and preserve recovery of existing historical completion receipts.
- Add a complete inline router example, routing and server-fallback guidance, and a combined 45-case browser regression suite covering native interception, fallback, partial capabilities, anchors, forms and new tabs.

Existing apps are not migrated automatically. History paths require an HTTP(S) server fallback; direct-file use requires hash routing. Browser evidence covers Chromium/Brave and does not certify Firefox, Safari, production rewrite settings or live-model workflow completion.

## 2.2.0

- Repair Windows PowerShell 5.1 parsing by shipping compatible bytes; test installed scripts without encoding repair copies.
- Register Claude hooks using the native envelope schema and dispatch only the current operating system's shell.
- Resolve Claude project roots from host context, isolate Stop retries by project/session, and consistently use the first unfinished step.
- Limit Claude automatic approval to eligible project edits and WebSearch in valid active workflows. Shell commands and WebFetch retain host permission handling. Protect canonical sensitive paths and versioned plugin cache locations.
- Isolate Codex parent control from subagent prompts, recognize qualified plugin skill names and recover stale empty locks with generation checks.
- Replace directory-presence Trust5 scores with bounded command outcomes, measured coverage and source fingerprints.
- Validate final HTML and provide a Chromium/axe verifier with desktop/mobile reports and screenshots.
- Test Node 22/24 across Windows, Linux and macOS, and pin validation dependencies and CI actions.
- Run CLI entry points through physical path aliases correctly; exercise crash gaps using deterministic fault injection.

This release validates software behavior and deliberately broken output fixtures. It does not claim a live-model tutorial benchmark or guaranteed aesthetic/learning-quality rating.
