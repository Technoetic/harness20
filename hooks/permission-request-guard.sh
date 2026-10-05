#!/usr/bin/env bash
# Windows guard: skip on git-bash / MSYS / Cygwin (ps1 counterpart runs there)
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
# permission-request-guard.sh - bounded deterministic relay; input stays data on stdin.
set -u
NODE="${HARNESS50_NODE:-}"
[ -x "$NODE" ] || NODE="$(command -v node 2>/dev/null || true)"
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "$NODE" ] || [ ! -f "$DIR/lib/command-guard.mjs" ]; then
  echo 'BLOCKED: Harness36 guard runtime is unavailable.' >&2
  exit 2
fi
"$NODE" "$DIR/lib/command-guard.mjs" permission
CODE=$?
[ "$CODE" -eq 0 ] && exit 0
[ "$CODE" -eq 2 ] || echo 'BLOCKED: Harness36 guard could not validate this tool request.' >&2
exit 2
