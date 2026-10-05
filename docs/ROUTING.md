# One HTML file, a URL for every screen

Generated applications keep one self-contained `dist/index.html`. Each independent
screen has a canonical URL that restores that screen when opened directly, shared,
reloaded, or reached with the browser's Back and Forward buttons.

Hash routing is the default: `index.html#/`, `index.html#/orders`, and
`index.html#/settings`. It works on a static host and when the HTML is opened as a
file. History routing can use `/orders` or `/orders.html`, but the deployment server
must serve the same HTML for those navigation paths. Changing a URL must also
change the visible screen; changing a screen must update the URL.

## Navigation API with a compatible router

The URL mode and the browser API are separate choices. Keep the manifest's static
`hash` or `history` mode. On HTTP(S), prefer the Navigation API when its navigation
methods (`navigate` and `addEventListener`), a non-null `currentEntry`, and
`NavigateEvent.prototype.intercept` are
usable. Otherwise use the existing History API or hash handling for that URL mode.
The presence of `window.navigation` alone is insufficient. Use the default hash
manifest for direct-file operation; a history manifest requires HTTP(S) hosting.
Do not silently change the declared URL mode or use virtual file paths.

Install exactly one backend. The native backend listens for `navigate` and checks
`canIntercept` for each event. The fallback backend handles ordinary app links and
`popstate`/`hashchange` as appropriate. Both explicitly render the initial URL,
since the first document load does not emit a `navigate` event. Both restore the
correct screen for history traversal and canonicalize unknown app routes with a
replacement, including an unknown `#/...` hash reached in the running app.

Handle only app navigation. Preserve modified clicks, new-tab targets, downloads,
external links, form submissions and ordinary `#section` anchors. App hashes use
the `#/...` namespace. Keep title, active-link semantics, focus and scroll behavior
consistent without duplicate renders or extra history entries. If rendering loads
data asynchronously, consume the navigation event's abort signal and prevent an
abandoned navigation from overwriting the current screen.

The single-file example implements this capability selection with a hash manifest.
For a deployed history variant, change the manifest mode and its route link hrefs
together, and configure the server to return the same HTML for the declared paths.
Navigation API support does not supply that deployment fallback.

See the [browser API guide](https://developer.chrome.com/docs/web-platform/navigation-api)
and [opaque-origin restrictions in the HTML standard](https://html.spec.whatwg.org/multipage/nav-history-apis.html#navigation-api-entries-and-events-disabled).

## Design and markup

Inventory independent screens during planning. In fresh Step 2, record each screen's
ID, purpose, canonical path, incoming links, and expected screen after reload.
Carry the complete inventory through subsequent design and implementation work.
Filters, transient dialogs and controls do not need their own route unless they
represent independent screens. A genuinely one-screen application declares one
route; do not add empty screens to satisfy a count.

Place exactly one manifest script directly in the explicit HTML `<head>`:

```html
<script id="harness50-routes" type="application/json">
{
  "schema_version": 1,
  "mode": "hash",
  "fallback": "home",
  "routes": [
    { "id": "home", "path": "/" },
    { "id": "orders", "path": "/orders" },
    { "id": "settings", "path": "/settings" }
  ]
}
</script>
```

Each route ID identifies one screen root. The active root is visible and all
other screen roots are hidden. Every marked root must occur in the manifest.

```html
<nav aria-label="Main navigation">
  <a href="#/">Home</a>
  <a href="#/orders">Orders</a>
</nav>
<main>
  <section data-harness-screen="home"><h1>Home</h1></section>
  <section data-harness-screen="orders" hidden><h1>Orders</h1></section>
</main>
```

The router reads the current URL at startup and after hash/history changes.
Navigation uses real `a[href]` links. Each screen in a multi-screen app must have
at least one visible link to another declared screen; an all-to-all menu is not
required. Handle modified clicks normally so users can open links in new tabs.
Update the title, active-navigation semantics and focus when the screen changes.
Ensure CSS cannot accidentally override `[hidden]`.

An empty entry URL and unknown route must render `fallback` and replace the URL
with that route's canonical URL, without creating an extra history entry. The
fallback names a declared route ID. Do not silently leave the wrong URL visible.

Use [the complete inline example](../examples/routed-single-file.html) as a working
reference. It contains three screens, ordinary links, title/focus updates and no
external runtime assets. Its content is a small example, not a required app layout.

## Bounded route contract

- `schema_version` is `1`; `mode` is `hash` or `history`.
- Manifest JSON is at most 32 KiB and contains 1–50 routes.
- IDs match `[A-Za-z][A-Za-z0-9_-]{0,63}` and are unique.
- Paths are unique, at most 256 ASCII characters, and begin with `/`.
- `/` is valid. Other paths contain nonempty slash-separated segments starting
  with a letter, digit, underscore or hyphen; subsequent characters may also be
  dot or tilde. `/orders/123` and `/orders.html` are valid concrete routes.
- Query strings, fragments, percent escapes, backslashes, duplicate/trailing
  slashes, and traversal segments are rejected. `/index.html` is the reserved
  entry point; `/__harness50_unknown_route__` is reserved for the fallback probe.
- Use literal quoted `id` and `type` attributes on the manifest script. Commented,
  duplicate, inert, foreign-content and ambiguously placed manifests are rejected.
  Place the manifest directly in a normal explicit head, not inside a template,
  noscript element, or another script's text.
- The conservative extractor requires literal HTML ID values throughout the
  document (no character references), unique attributes, and ordinary script raw
  text without escaped-state `<!--` or literal `<script` sequences. It rejects
  ambiguous markup instead of attempting browser HTML error recovery.

The manifest describes finite concrete routes. An app with dynamic detail IDs
must include representative concrete detail routes and separately test its other
valid and invalid parameter cases. A finite manifest is not proof of every
possible application state.

For fresh planning-first20 the design/implementation/routing/E2E/final stages are 2/9/14/15/20.
Explicit research-free36 retains 18/25/30/31/36 and report030.
Explicit legacy50 retains 30/37/44/45/50 and report044; existing historical
receipt fallback applies only there. The manifest capacity remains 1–50 routes.

## Verification

Step 14 is **클라이언트 사이드 라우팅** (client-side routing). Step 2 designs
the route inventory and Step 9 implements it; Step 14 integrates and rechecks it
after JavaScript modularization, CSS separation and design corrections. Its
required completion checks cover the screen/URL map, deep links and traversal,
native and compatible backends, mode-specific server fallback, and ordinary
browser behavior. HTML component extraction is not a completion requirement:
screen regions in the same HTML can be selected directly from the current URL.
Development JavaScript and CSS stay in separate source files; the build bundles
them into the one self-contained HTML, including its inert JSON route manifest.

Step 14 writes `step_archive/step014_routing검증.md` under the
`routing-integration-report` artifact acceptance ID. Steps 15–20 consume this
routing, structure, accessibility and build evidence. Missing or failed routing
checks block a new completion. Existing workspaces follow
[the legacy Step44 migration guide](STEP044-MIGRATION.md); historical receipts stay
immutable and are not promoted to current validation evidence. Step 14 reviews the server fallback
configuration and local direct entry; Step 15 requires local history-mode direct
entry and reload, and repeats them on a real deployment only when an authorized
target is already available. Otherwise it records deployment verification as
pending and scopes completion to the local artifact. Step 20 still requires the
final schema-3 browser report bound to the current HTML.

Run the verifier from a checkout with one [browser backend](BROWSER-TOOLS.md)
installed (Playwright in `browser-verifier/`, or the Aside CLI):

```text
node "<validation-checkout>/scripts/verify-output.mjs" --probe
node "<validation-checkout>/scripts/verify-output.mjs" --workspace "<project-root>" --backend auto
```

`--backend playwright` or `--backend aside` forces a backend; `auto` prefers Playwright
and falls back to Aside. A Step 3 environment lock (original tool3 in old36/50) (`step_archive/outputs/browser-backend.json`)
takes precedence over that order: `auto` then uses only the locked backend
([backend lock](BROWSER-TOOLS.md#backend-lock-step-3)). With the Playwright backend, `--executable-path "<browser-path>"`
selects an installed Chromium-based browser explicitly.

The browser report uses **schema version 3**, with the exact `routing` manifest,
the final HTML SHA-256, and desktop/mobile results in two mandatory scenarios:
an untouched browser and a browser with the Navigation API removed before app
startup. Every route in each scenario is checked for:

1. Cold direct entry and visible-screen/URL agreement.
2. Reload restoring the same route and screen.
3. A real outgoing link, its destination screen, Back, and Forward.
4. Runtime/console/network errors, accessibility and horizontal overflow.

Normal results are in `viewports`. Forced-fallback results are in
`compatibility.navigation_api_unavailable.viewports`; they contain the same exact
route inventory and viewport measurements. The verifier removes the API before
each document loads, confirms its absence throughout route checks, and fails if
it cannot establish that condition. Screenshots for this scenario use
`verified-navigation-api-unavailable-desktop.png` and
`verified-navigation-api-unavailable-mobile.png` in `step_archive/screenshots/`.
Both scenarios share the existing overall deadline and network restrictions.

`navigation_api.available` and `navigation_api.property_present` report observed
capability, not proof that an application used the native backend. Step 15 must
also demonstrate native interception in a capable browser, as well as correct
behavior when the API is missing or present but unusable. The shipped router has
real-browser regression coverage for these cases and for direct `file://` use.

Initial entry and an unknown route must both resolve to the declared fallback.
One-screen apps explicitly record navigation as `not-applicable` with reason
`single-screen`; direct entry, reload, fallback and quality checks still run.
Failures in either scenario, omitted routes, duplicate results, old reports and changed HTML cannot
satisfy fresh completion. Existing historical receipts retain their recovery
semantics; replaying a receipt does not perform a new browser verification.

Codex validates the route inventory against the same stable HTML bytes it hashes.
Both hosts check current quality, browser and final regression evidence before recording a fresh Step 20.
The inspection command does not execute project commands or launch a browser:

```text
node "<plugin-root>/scripts/quality-gate.mjs" --inspect-final --workspace "<project-root>"
```

History-mode verification serves the same HTML at the declared paths in an isolated
browser context. **This proves application routing, not deployment rewrites.**
Step 15 also checks direct entry and refresh on an already authorized, available
deployment target. Without one, `deployment-verification: pending` is explicit;
local completion does not claim deployment readiness. If deployment is itself a
user requirement, pending verification cannot satisfy that requirement. No step
implicitly authorizes a deployment. Record the serving URL, mode, fallback and
tested build digest for reuse in Steps 16–20. Live evidence applies only to the
deployed revision that was checked, not to later local builds.
Keep project-specific E2E for title, focus, active
navigation, dialogs, filters, asynchronous data, and other states.
