#!/usr/bin/env bash
# Windows guard: skip on git-bash / MSYS / Cygwin (ps1 counterpart runs there)
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
# step-obedience-guard.sh — UserPromptSubmit hook (macOS/Linux)
set -u
RAW="$(cat || true)"
EVENT_CWD=""
if command -v python3 >/dev/null 2>&1; then
  EVENT_CWD="$(printf '%s' "$RAW" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("cwd", "") if isinstance(d,dict) else "")' 2>/dev/null || true)"
fi
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-${EVENT_CWD:-$PWD}}"

PROGRESS_FILE="$PROJECT_ROOT/step_archive/progress.json"
ARCHIVED_DIR="$PROJECT_ROOT/step_archive/archived"
# Codex coexistence (mirrors step-obedience-guard.ps1): no Claude step reminder while the
# Codex state manager owns this workspace.
if [ -e "$PROJECT_ROOT/step_archive/.harness50-codex/state.json" ]; then exit 0; fi
[ -f "$PROGRESS_FILE" ] || exit 0

# Parse progress without jq. Without python3 the state is unknown, so say nothing rather than
# invent one. tr drops the CR that a Windows python prints, which would break the numbers below.
command -v python3 >/dev/null 2>&1 || exit 0
TOTAL=""; DONE=""; NEXT=""
read -r TOTAL DONE NEXT < <(python3 - "$PROGRESS_FILE" <<'PY' | tr -d '\r'
import json,sys
try:
    p=json.load(open(sys.argv[1],encoding="utf-8"))
    total=int(p.get("total_steps",50))
    done=p.get("completed_steps") or []
    done_set=set(int(x) for x in done)
except Exception:
    raise SystemExit(0)
nxt=None
for i in range(1,total+1):
    if i not in done_set: nxt=i; break
print(total, len(done), nxt if nxt is not None else 0)
PY
)
case "$TOTAL:$DONE:$NEXT" in
  *[!0-9:]*|:*|*::*|*:) exit 0 ;;
esac

[ "$DONE" -ge "$TOTAL" ] && exit 0
[ "$NEXT" = "0" ] && exit 0

# archived/ first, then the flat step_archive/ copy (mirrors step-obedience-guard.ps1).
NEXT_FMT="$(printf 'step%03d' "$NEXT")"
if [ -f "$ARCHIVED_DIR/$NEXT_FMT.md" ]; then
  NEXT_REL="step_archive/archived/$NEXT_FMT.md"
elif [ -f "$PROJECT_ROOT/step_archive/$NEXT_FMT.md" ]; then
  NEXT_REL="step_archive/$NEXT_FMT.md"
else
  exit 0
fi

# Same single line as step-obedience-guard.ps1.
printf '[HARNESS] %s/%s done. Next: %s (read+execute, no user confirmation). User direct requests still take priority.\n' "$DONE" "$TOTAL" "$NEXT_REL"
exit 0
