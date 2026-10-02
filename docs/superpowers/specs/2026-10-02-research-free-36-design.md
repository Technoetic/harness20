# Research-free 36-step workflow

The user approved this design with “진행해” on 2026-10-02. New workflows use 36 steps. Existing workflows keep their original 50-step definition and evidence meanings.

## Scope

Remove original research steps 16–20, 22–24, 26–29, 40 and 43. Keep the dependency gate, planning, integrated design, implementation and every independent review and quality gate. Do not introduce extra consolidation or reorder surviving steps.

| New | Original | Role |
| --- | --- | --- |
| 1–15 | 1–15 | Startup, tools and baseline |
| 16 | 21 | Dependency gate |
| 17 | 25 | Requirements-based planning |
| 18 | 30 | Integrated design |
| 19 | 31 | Environment |
| 20 | 32 | File allocation and index |
| 21 | 33 | Duplication baseline |
| 22 | 34 | Unused-code baseline |
| 23 | 35 | Context policy |
| 24 | 36 | Encoding policy |
| 25 | 37 | Implementation |
| 26 | 38 | Build smoke and quality round 1 |
| 27 | 39 | Layout verification |
| 28 | 41 | JavaScript modules |
| 29 | 42 | CSS separation |
| 30 | 44 | Routing integration and quality round 2 |
| 31 | 45 | E2E |
| 32 | 46 | Screenshot E2E |
| 33 | 47 | Keyboard visual verification |
| 34 | 48 | Mouse visual verification |
| 35 | 49 | Final design verification |
| 36 | 50 | Console, final build and full regression; quality round 3 |

## Requirements and evidence

Planning traces the user request, TOPIC and explicitly provided materials to requirements and decisions. Design traces those requirements to alternatives, selected tokens, component contracts and accessibility behavior. Implementation and visual reviews compare the declared design contract with current code and measured output.

Remove dependencies on research files, external reference screenshots, supplemental-research manifests and research-provenance checks. Keep actual application asset paths, current output screenshots, independent reviewers, five-round review limits, PASS requirements, severity blocking, stable sampling, route/API scenario checks, keyboard/mouse behavior, console and final same-HTML evidence.

An API contract must come from the user's supplied specification/materials or an explicitly declared contract. Missing target/version/schema/auth/rate-limit/error/retry details remain missing requirements; they must not become invented research findings. This change removes mandatory external investigation; it does not claim that tests establish the currency of external facts.

## Definition and compatibility boundary

The two definitions have stable identifiers: `legacy-50-v1` and `research-free-36-v1`. Definition-less schema-v1 state and receipts retain legacy-50 meaning. Fresh runtime state must explicitly identify the 36-step definition. Reject unknown definitions, inconsistent counts and cross-definition receipts or contracts.

Preserve legacy source bodies and contract hashes. Existing running, paused, blocked and completed state, imported Claude progress, archived instructions, recovery and receipt replay must continue with the legacy definition. Do not silently renumber, reset, reinterpret or migrate existing completion evidence. Keep definition selection explicit in loaders, hooks, acceptance, QA milestones, Jev checkpoints and final-summary routing.

Fresh Claude and Codex starts select 36. A reset may start a fresh default-36 run only after preserving the previous run's records according to existing reset safeguards. Existing profile detection must fail closed on malformed or ambiguous state. Cross-platform hooks must agree on definition, source path, cursor bounds and terminal behavior.

## Delivery and validation

Deliver committed local changes on `feat/research-free-36-20261002` in `D:/harness50-worktrees/research-free-36-20261002`. Remote publication and installation are outside this authorization.

Validate both step definitions, executable fresh-36 lifecycle, legacy lifecycle/recovery/import, profile isolation, removed-stage dependencies, retained gates, actual Windows hooks and POSIX parity. Use meaningful behavioral regressions and the existing full Node test suite. No Playwright browser is installed or executed in this workspace; browser evidence validation uses existing fixtures. Independent read-only verification must rerun relevant commands before completion.
