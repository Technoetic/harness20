# OWASP hardening implementation plan

> For agentic workers: use subagent-driven-development for independent boundaries and verification-before-completion for final claims.

**Goal:** Close all applicable plugin control gaps against the supplied ten OWASP risks and verify attacks against actual execution boundaries.

**Architecture:** Shared bounded parsers/readers underpin host tool policy, Jev quotas and isolated output verification. Local source and raw evidence live in separate directories. Host/provider responsibilities are stated explicitly.

**Tech stack:** Node.js ESM, PowerShell/Bash hooks, existing axe-core, Aside CLI; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-06-owasp-full.md`.

## Global constraints

Preserve old 36/50 records and 174 source files, existing hook timeouts and default20. Never print keys or run Playwright here. Never call two whole suites concurrently. All meaningful changes require red/green attack evidence and independent review.

## Review focus

Duplicate and escaped duplicate JSON keys; growing or linked source files; preauthorized and paused-workflow tools; concurrent/restarted/repeated API clients; malicious HTML in the real browser.

## Tasks

- [x] Root: add strict bounded JSON scanner and integrate CLI/state/context decoding. Add real duplicate/depth/finite/Unicode attack tests before product edits.
- [x] Root: bound physical reads before allocation and traversal depth/directories; test hardlink/growth/oversized/deep trees.
- [x] Runtime agent: add shared tool/path/URL mediation, preauthorized hook coverage, content scanning and sanitized logs; protect canonical host measurement receipts and their parent replacement from registered mutation; record red/green attacks.
- [x] External agent: add shared sensitive-data validation and persistent atomic Jev reservations; wire all three transports and test process concurrency/corruption/timeout quotas.
- [x] Output agent: strip inherited credentials from quality subprocesses and recheck exact config/source before each execution. Test Aside origin/sandbox/CSP controls against real attacks; require native all-transport isolation in the common dispatcher and every backend, rejecting unsupported adapters before generated output execution.
- [x] Root: add lockfile/dependency security audit and release gate, complete applicability/control/evidence matrix and future vector/training gate.
- [x] Cross-review: review code by another agent and re-run meaningful attacks; fix all blocking findings.
- [x] Verification: affected regressions, a complete frozen full suite, actual Aside benign/adversarial refusal measurements, all-backend no-execution attacks, old file/hash parity and whitespace checks. Preserve partial runs and explain any genuine deployment-only boundary. Completed frozen V5: 1760 tests / 1756 pass / 0 fail / 4 environment skips / exit 0; independently reconciled 485 unchanged physical files.
- [x] Record: update source verification report and NS own notes/ADR/handoff/tasks/index/log, commit exact owned paths locally, and remember durable decisions. No remote NS push. Exact owned source and eight NS paths committed; applied/staged records independently checked; MemoryHub remember succeeded.
