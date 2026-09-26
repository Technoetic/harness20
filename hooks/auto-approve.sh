#!/usr/bin/env bash
# Windows guard: skip on git-bash / MSYS / Cygwin (ps1 counterpart runs there)
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
# auto-approve.sh — PreToolUse hook (Write|Edit|MultiEdit|NotebookEdit|WebSearch, macOS/Linux)
# A relay of hooks/lib/approval-policy.mjs auto mode: allow is printed only when the policy
# answers 'eligible' (an active run; an in-project edit that is not sensitive, execution-linked or
# workflow state, and whose Edit/MultiEdit text holds no command hooks/lib/command-guard.mjs would
# block or ask about; or a WebSearch). Bash and WebFetch are never eligible. Anything else,
# including a missing node, prints nothing and keeps the host permission prompt. destructive-guard
# runs in parallel and its exit 2 takes precedence over an allow.
set -u
RAW="$(cat 2>/dev/null || true)"
[ -z "$RAW" ] && exit 0

# A missing runtime or failed policy check can never grant approval.
NODE="${HARNESS50_NODE:-}"
[ -x "$NODE" ] || NODE="$(command -v node 2>/dev/null || true)"
[ -n "$NODE" ] || exit 0

POLICY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ELIGIBILITY="$(printf '%s' "$RAW" | "$NODE" "$POLICY_ROOT/lib/approval-policy.mjs" auto 2>/dev/null)" || exit 0
[ "$ELIGIBILITY" = eligible ] || exit 0
printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"harness50 autopilot mode: eligible edit or WebSearch in an active run"}}'
exit 0
