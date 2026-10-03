#!/usr/bin/env bash
# Windows guard: skip on git-bash / MSYS / Cygwin (ps1 counterpart runs there)
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
# permission-request-guard.sh — PermissionRequest hook (macOS/Linux)
# Another plugin's PermissionRequest hook can answer allow and rewrite the tool input
# (hookSpecificOutput.decision.updatedInput, https://code.claude.com/docs/en/hooks). This hook
# denies such requests again, with a deny decision and exit 2 ("exit 2 -> Denies the permission"):
#   1. writes to protected or invalid paths (hooks/lib/approval-policy.mjs guard mode);
#   2. Bash commands in the block set of hooks/lib/command-guard.mjs, the same set that
#      destructive-guard blocks, so a command destructive-guard leaves to the user is never denied
#      here; and dangerous WebFetch URLs.
# Edits are never denied for their content. Anything else prints nothing (the user's dialog or
# another plugin decides). A relay: the decisions come from the two node modules, as in
# permission-request-guard.ps1, which skips the check that cannot decide for the tool.
set -u
RAW="$(cat 2>/dev/null || true)"
[ -z "$RAW" ] && exit 0

NODE="${HARNESS50_NODE:-}"
[ -x "$NODE" ] || NODE="$(command -v node 2>/dev/null || true)"
[ -n "$NODE" ] || exit 0

LIB="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib"
# 1. Canonical and physical plugin protection.
PROTECTION="$(printf '%s' "$RAW" | "$NODE" "$LIB/approval-policy.mjs" guard 2>/dev/null)"
if [ "$PROTECTION" = protected ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","reason":"harness36: protected or invalid path"}}}'
  exit 2
fi

# 2. The command catalog's block set and dangerous URLs. node's stderr is inherited.
if [ ! -f "$LIB/command-guard.mjs" ]; then
  echo 'Harness36: hooks/lib/command-guard.mjs is missing; permission-request-guard made no decision.' >&2
  exit 1
fi
printf '%s' "$RAW" | "$NODE" "$LIB/command-guard.mjs" permission
[ "$?" -eq 2 ] && exit 2
exit 0
