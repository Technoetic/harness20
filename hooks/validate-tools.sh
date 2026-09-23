#!/usr/bin/env bash
# Windows guard: skip on git-bash / MSYS / Cygwin (ps1 counterpart runs there)
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
# validate-tools.sh - on-demand wrapper for step003~014 환경 검증
# Usage: bash hooks/validate-tools.sh <playwright|aside|axe|biome|stylelint|c8|jscpd>
#   playwright / aside : browser verification backends (either one satisfies docs/BROWSER-TOOLS.md)
#   axe                : axe-core (tool-neutral), falling back to @axe-core/playwright
set -u
TOOL="${1:-}"
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$PROJECT_ROOT" || exit 1

# Step 3 locks the project's browser backend in step_archive/outputs/browser-backend.json.
# Missing-tool hints then name only that backend (docs/BROWSER-TOOLS.md, "Backend lock (Step 3)").
# The same node one-liner as validate-tools.ps1 prints the locked backend or nothing.
LOCK_FILE="step_archive/outputs/browser-backend.json"
locked_backend() {
  node -e "try{const j=JSON.parse(require('fs').readFileSync('step_archive/outputs/browser-backend.json','utf8'));if(j&&j.schema_version===1&&(j.selected==='playwright'||j.selected==='aside'))process.stdout.write(j.selected)}catch(e){}" 2>/dev/null
}

case "$TOOL" in
  playwright)
    # Resolve the installed package (plugin browser-verifier/ first, then the project) instead of
    # `npx playwright`, which would install the package from the registry when it is missing.
    BROWSER_VERIFIER="$(cd "$(dirname "$0")/.." && pwd)/browser-verifier"
    if node -e "const p=require.resolve('playwright/package.json',{paths:process.argv.slice(1)});console.log('playwright: '+require(p).version+' ('+require('path').dirname(p)+')')" "$BROWSER_VERIFIER" "$PROJECT_ROOT" 2>/dev/null; then
      exit 0
    else
      case "$(locked_backend)" in
        aside) echo "playwright: missing (not needed: this project is locked to the aside backend by $LOCK_FILE; keep it and do not install Playwright or Chromium)" ;;
        playwright) echo "playwright: missing (cd browser-verifier && npm ci && npx playwright install chromium; this project is locked to the playwright backend by $LOCK_FILE)" ;;
        *) echo "playwright: missing (cd browser-verifier && npm ci && npx playwright install chromium, or use the aside backend)" ;;
      esac
      exit 1
    fi
    ;;
  aside)
    aside --version
    status=$?
    if [ "$status" -ne 0 ]; then
      case "$(locked_backend)" in
        playwright) echo "aside: not needed: this project is locked to the playwright backend by $LOCK_FILE; keep it and do not install the Aside CLI" ;;
        aside) echo "aside: this project is locked to the aside backend by $LOCK_FILE; start the Aside app and check aside --version in this shell; do not install Playwright or Chromium" ;;
      esac
    fi
    exit "$status"
    ;;
  axe)
    if node -e 'require.resolve("axe-core")' >/dev/null 2>&1; then
      echo "axe-core: OK"
    elif node -e 'require.resolve("@axe-core/playwright")' >/dev/null 2>&1; then
      echo "axe-core: OK (@axe-core/playwright)"
    else
      echo "axe-core: FAIL"; exit 1
    fi
    ;;
  biome) npx biome --version ;;
  stylelint) npx stylelint --version ;;
  c8) npx c8 --version ;;
  jscpd) npx jscpd --version ;;
  *) echo "Unknown tool: $TOOL (use playwright|aside|axe|biome|stylelint|c8|jscpd)"; exit 1 ;;
esac
