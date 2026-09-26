#!/usr/bin/env bash
# Windows guard: skip on git-bash / MSYS / Cygwin (ps1 counterpart runs there)
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
# destructive-guard.sh — PreToolUse(Bash) hook (macOS/Linux)
# A relay: hooks/lib/command-guard.mjs decides for this script and for destructive-guard.ps1 alike.
#   block: exit 2 with the rule on stderr (cannot be approved)
#   ask:   a PreToolUse permission decision 'ask' on stdout (the user confirms)
#   pass:  no output, exit 0 (the host permission checks apply)
# The event is handed to node on stdin and is never evaluated here. Without node the hook makes no
# decision (exit 0); run-hook.mjs always passes the node it runs on as HARNESS50_NODE.
set -u
RAW="$(cat 2>/dev/null || true)"
[ -z "$RAW" ] && exit 0

NODE="${HARNESS50_NODE:-}"
[ -x "$NODE" ] || NODE="$(command -v node 2>/dev/null || true)"
[ -n "$NODE" ] || exit 0

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "$DIR/lib/command-guard.mjs" ]; then
  echo 'Harness50: hooks/lib/command-guard.mjs is missing; destructive-guard made no decision.' >&2
  exit 1
fi
printf '%s' "$RAW" | "$NODE" "$DIR/lib/command-guard.mjs" pretool
exit $?
