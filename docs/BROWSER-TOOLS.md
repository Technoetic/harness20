# Browser verification backends

Harness50 needs a real browser for the final output check (`scripts/verify-output.mjs`),
for the E2E step and for the evaluator screenshots. Since 2.5.0 the verifier is a
dispatcher with two interchangeable backends:

| Backend | Where it lives | Use it when |
|:---|:---|:---|
| `playwright` | `browser-verifier/` (its own `package.json`; nothing in the plugin root depends on it) | CI, and machines that allow Playwright. Fresh Chromium contexts, headless, full API. |
| `aside` | `scripts/lib/browser-backend-aside.mjs` driving the Aside CLI (`aside repl`) | Machines where Playwright is not allowed or not installed. Runs inside the user's Aside Browser. |

Both backends produce the same schema-v3 `step_archive/outputs/browser-output.json`
and the same four screenshots. The gate (`scripts/lib/browser-report.mjs`) reads named
report fields only, so a passing report from either backend satisfies Steps 44–50. CI
keeps Playwright; the Aside backend exists so that a workstation without Playwright can
still finish the curriculum with measured evidence.

## Availability and selection

```text
node scripts/verify-output.mjs --probe
```

prints `{ "backends": { "playwright": true|false, "aside": true|false }, "selected": "playwright"|"aside"|null, "tool_version": "..." }`
without launching a browser and exits 0 only when a backend was selected.

A project whose Step 3 recorded a [backend lock](#backend-lock-step-3) uses only the
locked backend under `auto`. Without a lock, the selection order for `--backend auto`
(the default) is:

1. `playwright` if `browser-verifier/backend-playwright.mjs` can load the `playwright` package.
2. `aside` if `aside --version` succeeds. This only proves the CLI is installed: the
   Aside app (daemon) must also be running, otherwise the run fails with the verbatim
   `Aside isn't running on this machine.` line. `--probe` does not start or contact the app.
3. Otherwise the run fails with
   `Browser tools missing: install browser-verifier (cd browser-verifier && npm ci && npx playwright install chromium) or the Aside CLI (aside --version)`.

Force a backend with the flag, or with the environment variable `HARNESS50_BROWSER_BACKEND`
(an explicit backend also overrides a Step 3 lock):

```text
node scripts/verify-output.mjs --workspace "<project-root>" --backend auto
node scripts/verify-output.mjs --workspace "<project-root>" --backend playwright
node scripts/verify-output.mjs --workspace "<project-root>" --backend aside
```

`--executable-path` still selects a Chromium-based binary for the Playwright backend.
`--timeout <ms>` (the `timeoutMs` option of `verifyOutput()`; integer 1000–120000,
default 60000) bounds the whole run under Playwright but applies **per chunk** (one
`aside repl` call) under the Aside backend, because every call gets a fresh 120 s
session. Measured floor: an Aside chunk needs at least ~9–14 s (`openTab` alone is a
fixed ~5.4 s), so values below ~10000 fail with `Browser verification exceeded its
deadline`; a full three-route run is about 16 chunks × ~8 s ≈ 120–150 s.

Install one backend. Once Step 3 has locked a backend, install and repair only that one:

```text
# Playwright (CI, allowed machines)
cd browser-verifier && npm ci && npx playwright install chromium

# Aside CLI (machines without Playwright)
aside --version          # the Aside app must be running and an account logged in
```

Check with the tool hook: `bash hooks/validate-tools.sh aside` or
`powershell -File hooks/validate-tools.ps1 -Tool aside`. The `axe` tool check resolves
`axe-core` from the project (root devDependency) and falls back to `@axe-core/playwright`.

## Backend lock (Step 3)

Step 3 probes once and records its choice inside the project, so later steps reuse it
instead of re-running the `auto` order:

```text
node scripts/verify-output.mjs --probe --lock --workspace "<project-root>"
```

This writes `step_archive/outputs/browser-backend.json` (UTF-8 without BOM, LF, trailing
newline; unknown extra keys are ignored when read):

```json
{
  "schema_version": 1,
  "selected": "aside",
  "tool_version": "1.26.916.1741",
  "probed_at": "2026-09-23T01:02:03.000Z"
}
```

Precedence for `verify-output` runs and for `--probe --workspace`:

1. An explicit `--backend playwright|aside` or `HARNESS50_BROWSER_BACKEND` wins, and the
   lock is not read. The report records
   `backend_selection: { requested, source: "explicit" | "lock" | "auto-order", backend }`,
   so a global environment override stays visible.
2. Otherwise (`auto`) a valid lock picks the backend. If that backend is unavailable, the
   run fails and does not fall back to the other backend. The message names only the
   locked backend's repair, for example:

   ```text
   Browser backend locked to aside by step_archive/outputs/browser-backend.json (Step 3) is not available: start the Aside app and check that `aside --version` works in this shell. Keep the locked backend; do not install another browser backend or browser binaries. To change backends deliberately, rerun the Step 3 probe with --backend <name> --lock.
   ```

   For a Playwright lock, the repair is `npm ci` in `browser-verifier/` plus
   `npx playwright install chromium`.
3. Without a lock, the order above applies unchanged.

A missing lock means that there is no lock. Every other problem fails closed with
`Browser backend lock step_archive/outputs/browser-backend.json is invalid; rerun the Step 3 probe with --backend <name> --lock to record the backend Step 3 selected`.
That covers invalid UTF-8 or JSON, a BOM, `schema_version` other than 1, a `selected`
other than `playwright`/`aside`, a non-string `tool_version`, an unparseable
`probed_at`, a file over 4 KiB, and a symlinked, hard-linked or aliased path.

- **Install only the locked backend.** A project locked to `aside` never needs Playwright
  or its Chromium download. In that case `hooks/validate-tools.*` report Playwright as
  "not needed" instead of printing the install hint. A project locked to `playwright`
  keeps the Playwright install path and is not pointed at Aside.
- **Only Step 3 writes the lock**, and only after the workflow is initialized. A Codex
  workspace must not contain `step_archive/outputs/` before `$webapp` init. `--lock`
  refuses to run without `--probe` and an explicit `--workspace`, so the lock never lands
  in the checkout itself.
- **Probe output.** Without `--workspace`, `--probe` prints exactly the object above.
  With `--workspace` it also prints `lock` (the lock object, `null`, or `"invalid"` when
  an explicit backend ignored a bad lock), plus `error` when nothing may run. With
  `--lock` it also prints `previous`. It exits 0 only when a backend was selected (and,
  with `--lock`, recorded).
- **Changing backends is deliberate.** Rerun the Step 3 command with
  `--backend <name> --lock`. The same command repairs an invalid lock. A project started
  before the lock existed can record the backend named in
  `step_archive/step003_playwright_test.md` this way (Claude Step 31 does so).
- The lock prevents accidental switches. It is not a security boundary: deleting the
  file or passing an explicit backend bypasses it.

## Procedure table: curriculum needs → Playwright → `aside repl`

The Aside column records what was measured on Aside CLI 1.26.906.1630 (Chrome 152) on
2026-09-16. `aside repl "<js>"` runs Playwright-style JavaScript inside the user's
Aside Browser: one shot, 120 s per call, a new session per call, the script passed as
one argv element (keep it under about 28,000 characters; no `import`/`require`).

| Need | Playwright | `aside repl` equivalent |
|:---|:---|:---|
| Open the page | `browser.newContext()` → `page.goto(url)` | `const page = await openTab(url)`; `file://` is refused, so serve `dist/index.html` with a local `http://127.0.0.1:<port>/` server. The dispatcher's `ORIGIN`/`routeUrl` still name the routes; the backend maps them onto the local port. |
| Fresh storage per scenario | New browser context | New 127.0.0.1 **port** per chunk = new origin = empty localStorage/sessionStorage/IndexedDB/CacheStorage/service workers. Send `Cache-Control: no-store`. Cookies are host-scoped; expire any via a `document.cookie` loop. |
| Mobile viewport 390×844 | `newContext({ viewport })` | No `setViewportSize`. Serve a host page containing `<iframe width="390" height="844">`, set `iframe.src` **after** load via `page.evaluate`, then `const frame = page.frames().find(f => f.url().includes(...))` and poll `frame.evaluate(() => document.readyState)`. The backend frames **both** viewports this way (desktop 1440×900 iframe in the fixed 1440×900 tab; `environment.viewport_mode` = `iframe`). |
| Init script (remove Navigation API before startup) | `context.addInitScript` | No `addInitScript`/`addScriptTag`. The local server injects `<script>` right after `<head>`; it runs before app scripts in the main world (`Reflect.deleteProperty(window, 'navigation')` works). |
| Block external requests / WebSockets | `context.route('**', abort)` + `routeWebSocket` | No `route`. The server sends a `default-src 'none'`-style CSP header so even same-origin subresources are blocked like Playwright's abort; the page counts `securitypolicyviolation` events into `blocked_requests`. |
| Console and page errors | `page.on('console')`, `page.on('pageerror')` | Events never arrive. The injected bridge overrides `console.error` and listens to `error`/`unhandledrejection`, writing into `document.documentElement.dataset`; read back with `frame.evaluate`. (Iframe evaluate runs in an isolated world for expando properties; `dataset` attributes stay visible.) |
| Extract text / DOM metrics | `page.evaluate`, `$eval` | `page.evaluate(fn|string)` and `frame.evaluate` only; no `$eval`/`waitForFunction` — poll with `sleep(ms)`. |
| Keyboard / mouse | `page.keyboard.press('Tab')`, `page.mouse`, `locator.click()` | Same names exist; `page.keyboard.press('Tab')` moved focus inside the iframe. `document.hasFocus()` stays `false` even after `bringToFront()`, but input arrives via CDP. |
| Back / Forward | `page.goBack()`, `page.goForward()` | `page.goBack` times out on hash navigation; use `frame.evaluate(() => history.back())` / `history.forward()` and poll the URL/screen. |
| Direct entry / reload | `page.goto(routeUrl)`, `page.reload()` | Direct entry: set `iframe.src` to the route URL and poll for the fresh document. Reload: `location.reload()`, same-URL `location.assign`, same-URL `iframe.src` and page-level reload are **inert** in a normal document (measured: no server request), but a real `location.reload()` completes in ~0.1 s once the bridge has removed `window.navigation` (E2E on 2026-09-16: 6/6 reloads in the API-unavailable scenario, 0/6 in the main scenario — consistent with the Aside browser intercepting navigations through the Navigation API). The backend therefore tries `location.reload()` first and polls ~1 s for a fresh document; when nothing happens it removes the iframe and creates a new one with the same `src` (a cold re-entry with the tab's storage kept), then polls `readyState`. Reload-type-specific behaviour (`performance.getEntriesByType('navigation')[0].type === 'reload'`) is exercised only where the real reload ran; the chunk timings record `reload_mode: reload|cold-entry`. |
| axe WCAG A/AA | `@axe-core/playwright` `AxeBuilder` | `fetch('http://127.0.0.1:<port>/axe.min.js')` from the daemon (cookie-bearing, not subject to page CSP; 580 KB in 0.5 s) then `frame.evaluate(source + '; return axe.run(...)')`. About 0.9 s per view. |
| Screenshot | `page.screenshot({ path, fullPage })` | CDP capture alternates hang/succeed per attempt regardless of timeout or primer; retry `page.screenshot({ path: './artifacts/NAME.png', clip: { x, y, width, height }, timeout })` with 4000/8000/8000 ms (a failed slot flips the parity and the next attempt lands on the good slot, 1.3–1.8 s); do not spend a slot on a primer. `fullPage` also works. Absolute paths are rejected; the PNG lands in `<pwd>/artifacts/NAME.png` where `pwd` is the session directory (`C:\Users\<user>\.aside\u\0\sessions\<id>`) — `console.log(pwd)` so Node can copy it into `step_archive/screenshots/`. `locator.screenshot()` fails with `Invalid parameters`. |
| Clean up | Close the context | `await closeTab(page)` — the tab is visible in the user's browser until then. |

Timing per chunk (load + probes + axe + screenshot) is about 6–14 s: CLI spawn
~0.6 s, `openTab` ~5.4 s fixed cost (0.4–5.5 s measured), axe fetch+inject+run ~0.9 s,
screenshot ~1.6 s, reload attempt ≤1 s. A full run (two viewports × two scenarios ×
(initial + every route)) is 4 + 4 × routes chunks — about 16 chunks and 120–150 s for
three routes; the backend splits work into chunks so no single call approaches the
120 s limit, and `verifyOutput({ timeoutMs })` / `--timeout` bounds each chunk.

Reference spike scripts that measured the table above are kept read-only outside this
repository (`aside-spike-20260916/`: `server.py`, `host2.html`, `app2.html`, `t1..t9.js`).

## Aside limits

- **No `file://`.** Everything is served over `http://127.0.0.1`.
- **120 s per call, one session per call.** Long route inventories are chunked. Tabs
  cannot be reused across sessions: `listBrowserTabs()` → `attachBrowserTab(targetId)`
  reattaches a tab within a session only, and a tab left by a killed session stays
  visible ~40 s until the daemon reaps it. `frame.url()` is stale after same-document
  (hash/pushState) changes — read `frame.evaluate(() => location.href)` instead.
- **Output only inside the session directory.** `fs`/`path` are rooted at the session
  directory; anything else fails with `Path escapes Project and session roots`. Node
  copies artifacts out afterwards.
- **Shared profile, visible tabs, no headless.** The automation runs inside the user's
  logged-in Aside Browser: no incognito, no isolated profile, no headless mode. Tell
  the user not to touch the tabs while a run is active, and close tabs when done.
  The bridge overrides `window.open` and stops anchor/form activations whose `target`
  is `_blank` or a named window (counted as `unexpected-popup`, default prevented, so
  no tab opens in the user's browser; `_top`/`_parent` stay inside the frame, as they
  would on a top-level page). Residual: an app that opens windows in a way the bridge
  cannot intercept (e.g. after `stopPropagation` at the capture phase, or from a
  worker) opens a real tab in the user's profile, which is neither counted nor closed.
- **Reload may be a cold re-entry.** Script reloads are inert in a normal document
  (they run once `window.navigation` is removed, see the procedure table), so the
  main-scenario reload phase re-creates the iframe at its current URL (tab storage
  kept). Behaviour that only appears on a real reload can pass under Aside in the main
  scenario and fail under Playwright; the API-unavailable scenario does exercise it.
- **Error kinds are not comparable across backends.** Playwright records an extra
  `console.error` ("Failed to load resource") per aborted request that the Aside
  bridge's `console.error` override never sees; a service-worker registration is
  blocked by the CSP under Aside and counted as `blocked_requests` + `requestfailed`,
  whereas Playwright's `serviceWorkers: 'block'` prevents it silently. Verdicts agree;
  error lists and counts need not.
- **Page-level CSP that forbids inline scripts is unsupported.** An artifact whose own
  `<meta http-equiv="Content-Security-Policy">` restricts `script-src` to nonces/hashes
  blocks the injected bridge (Playwright's `addInitScript` bypasses CSP); every chunk
  then fails with `Navigation API probe did not answer` / `Application frame did not
  load`. Use the Playwright backend for such artifacts. A `<base href>` element is not
  policed by either backend (the app CSP carries no `base-uri`/`form-action`).
- **Missing APIs.** `setViewportSize`, `addInitScript`, `addScriptTag`, `route`,
  `routeWebSocket`, `newContext`/`context`, `emulateMedia`, `exposeFunction`,
  `waitForFunction`, `$eval`, `page.on('console'|'pageerror')` (no events),
  `installPageScript`. Every one has a workaround in the table above.
- **Fixed environment.** Viewport 1440×900, DPR 1, `prefers-color-scheme` follows the
  user's OS (dark on the measured PC), language follows the profile (ko-KR), Chrome 152
  with whatever extensions the profile has.
- **A-grade data stays local.** `aside repl` keeps page content on the machine; `aside
  "<natural-language task>"` sends page content to a cloud model provider, so the
  backend never uses it.

## Report `environment` block

Every run writes a top-level `environment` key so a reviewer can tell which backend
produced the evidence and under what conditions:

```json
"environment": {
  "backend": "playwright | aside",
  "isolation": "fresh-context | shared-profile",
  "deadline_scope": "run | chunk",
  "viewport_mode": "context | iframe",
  "screenshot_mode": "full-page | viewport-clip",
  "browser": "Chromium 131 | Chrome/152 | null",
  "dpr": 1,
  "color_scheme": "light | dark | null",
  "reduced_motion": false,
  "language": "en-US | ko-KR | null",
  "tool_version": "1.63.0 | 1.26.906.1630 | null"
}
```

`scripts/lib/browser-report.mjs` reads named fields only, so `environment` never changes
the verdict. It is disclosure: **shared-profile evidence reveals the user's colour
scheme, language, DPR and installed extensions**, and a reviewer must not treat a
dark-scheme ko-KR shared-profile screenshot as equivalent to a light-scheme fresh-context
capture. When both backends are available at Step 3, `auto` selects and locks
`playwright`. Once a project is locked, keep the locked backend for all evidence,
including the final Step 50 report, and do not install the other backend to replace it.

## 요약 (한국어)

- 최종 HTML 검증기(`scripts/verify-output.mjs`)는 2.5.0부터 디스패처이며 백엔드는 두 가지다.
  **Playwright**는 `browser-verifier/`에 격리돼 CI와 허용 PC에서 쓰고, **Aside CLI**
  (`aside repl`)는 Playwright가 금지된 PC에서 쓴다. 두 백엔드 모두 같은 schema-v3 보고서와
  4장의 스크린샷을 만들고, 게이트는 백엔드를 구분하지 않는다.
- `node scripts/verify-output.mjs --probe`로 가용 백엔드를 확인하고,
  `--backend auto|playwright|aside`(또는 환경변수 `HARNESS50_BROWSER_BACKEND`)로 선택한다.
  잠금 파일이 없을 때 auto는 Playwright → Aside 순서다.
- Step 3은 `node scripts/verify-output.mjs --probe --lock --workspace "<project-root>"`로 선택을
  `step_archive/outputs/browser-backend.json`에 고정한다. 그 뒤 `--backend` 없는 검증은 고정
  백엔드만 쓰고, 사용할 수 없으면 다른 백엔드로 넘어가지 않고 그 백엔드의 복구 방법만 안내한다.
  명시적 `--backend`/환경변수가 우선하며, 잘못된 잠금 파일은 실패로 처리한다(fail closed).
  고정된 백엔드만 설치·복구하고 다른 백엔드(예: Aside 고정 프로젝트의 Playwright·Chromium)는
  설치하지 않는다. 백엔드를 바꾸려면 `--backend <name> --lock`으로 다시 고정한다.
- Aside 우회로(모두 실측): 모바일 뷰포트는 390×844 iframe, 초기화 스크립트는 서버가
  `<head>` 직후 주입, 외부 요청 차단은 CSP 헤더 + `securitypolicyviolation` 집계, 콘솔·페이지
  오류는 `dataset` 브리지, 뒤로/앞으로는 `history.back()` evaluate, 스크린샷은 실패 시
  재시도(타임아웃 4000/8000/8000 ms, 프라이머 없음) 뒤 `./artifacts/`에 저장해 Node가 복사,
  새로고침은 `location.reload()`를 먼저 시도하고(주 시나리오에서는 무반응, Navigation API
  제거 시나리오에서는 실제 reload 동작) 무반응이면 iframe 재생성(콜드 재진입), 저장소 격리는 청크마다
  새 127.0.0.1 포트. 청크당 ≥ ~10초가 필요하며(`openTab` ~5.4초 고정) 3라우트 전체 실행은
  약 120–150초다.
- Aside 제약: `file://` 불가, 호출당 120초·세션마다 새로 시작, 출력은 세션 폴더 안으로만,
  사용자의 로그인 프로필과 보이는 탭을 공유(헤드리스·시크릿 없음).
- 보고서의 `environment` 블록은 백엔드·격리 수준·색 구성표·언어·DPR 등을 공개한다.
  공유 프로필 증거는 사용자 환경(다크 모드, ko-KR, 확장 프로그램)을 노출하므로 검토자가
  구분해 읽어야 한다. CI는 Playwright를 유지한다.
