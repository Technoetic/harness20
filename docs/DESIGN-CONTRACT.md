# Design contract: visual tokens and exclusions

For fresh `planning-first-14-v1`, Step 2 fixes the visual tokens and exclusions.
Implementation 3, independent layout review 5 and final design review 13 compare supplied
requirements/materials, that contract and measured current output. External
reference captures and research-provenance files are not prerequisites.
Both hosts use the same contract format. The default exclusion list and
conflicting TOPIC rules below remain host-specific.

Explicit `research-free-36-v1` retains design18, implementation25, layout27 and final35,
with `step018_레이아웃설계_chunk1.md`. Explicit `legacy-50-v1` keeps design30, implementation37, reference43 and final49,
its original `step030_레이아웃설계_chunk1.md` path and archived reference method.

## Location and format

`step_archive/step002_레이아웃설계_chunk1.md` holds exactly one fenced block whose
info string is `json harness50-design-contract`:

```json harness50-design-contract
{
  "schema_version": 1,
  "tokens": {
    "colors": { "background": "#ffffff", "surface": "#f2f2f2", "text": "#1a1a1a", "accent": "#0b57d0" },
    "fonts": { "ui": "Helvetica Neue", "code": "JetBrains Mono" },
    "type": { "sizes": [14, 16, 20, 32], "weights": [400, 700] },
    "spacing": [4, 8, 16, 24, 32],
    "radius": [0, 4, 8],
    "shadow": []
  },
  "exclude": [
    { "id": "generic-sans", "source": "legacy", "signature": "Inter, Roboto or Arial as the UI face without a token reason", "adopted": false, "exception_reason": null },
    { "id": "topic-1", "source": "topic", "signature": "그림자 카드", "adopted": false, "exception_reason": null }
  ]
}
```

The values are an example.

- `tokens` names every value the implementation may use: `colors` (`background`,
  `surface`, `text` and one `accent`; add other named colours only when the layout
  needs them), `fonts` (`ui`, `code`), `type` (`sizes`, `weights`), and `spacing`,
  `radius` and `shadow` in px. The Claude host keeps them inside the limits of
  `skills/harness-rules/SKILL.md` §5.
- Each `exclude` item has `id`, `source` (`legacy`, `host` or `topic`), `signature`
  (the role and the CSS that make the style, never a font or colour name alone),
  `adopted` (boolean) and `exception_reason` (a string when `adopted` is true,
  otherwise `null`).

## Items

| id | source | Leaves out | Does not cover |
|---|---|---|---|
| `generic-sans` | legacy | Inter, Roboto or Arial as the UI face without a token reason | a face the TOPIC names |
| `purple-gradient` | legacy | purple gradient backgrounds without a content reason | a data colour scale |
| `centered-cards` | legacy | every section built as a centred card | a single centred dialog or empty state |
| `excess-radius` | legacy | a corner radius outside `tokens.radius` | — |
| `flat-background` | legacy | one flat colour for the whole page with no section contrast | — |
| `cream-background` | host | a cream, ivory, beige or tinted off-white page background (body, main, screen roots) | pure `#ffffff`, a neutral light grey surface, a dark background |
| `italic-heading-accent` | host | italic on only some words inside h1–h3 (`em`, `i`, `font-style: italic`) | quotation, species or title conventions |
| `numbered-section-labels` | host | zero-padded numbers used as section decoration (01, 02 / …, CSS counters included) | an ordered list or a "N단계" step title that carries real order |
| `monospace-labels` | host | monospace on eyebrows, badges, tags, navigation, buttons or section labels | `code`, `pre`, `kbd`, `samp` and code values or commands |
| `pill-buttons` | host | pill corners on buttons and link buttons (radius ≥ height / 2, 9999px, 50%, rounded-full) | square round icon buttons, toggle tracks, avatars |
| `topic-N` | topic | each style the TOPIC asks to leave out, kept verbatim in `signature` | — |

## Defaults per host

- **Claude**: the five `legacy` items and the five `host` items. The `host` items are the
  default styles named by the Opus 5.5 prompting guide (2026-09); the harness keeps
  them as a Claude default only.
- **Codex**: the five `legacy` items and no `host` items. Nothing shows that other models
  fall back on those five styles.
- Both: every style the TOPIC asks to leave out becomes a `topic-N` item. Claude
  writes them on the `디자인 제외(사용자):` line of `constraints`; Codex reads
  `constraints` and the original request.
- Readers apply every item with `adopted: false`, whatever its `source`, so a
  workspace moved between hosts keeps its contract.

## Exceptions

A `legacy` or `host` item may be adopted only when the TOPIC asks for that style or
the selected aesthetic cannot exist without it. Step 2 then sets `adopted: true`,
writes the reason in `exception_reason` and repeats it in the layout design as one
`결정/사유: <id> 채택 — <사유>` line (the Claude fresh14 step14 summary lists these lines; existing20/36/50 retain their final20/36/50 summaries).
A `topic` item is never adopted. When the TOPIC both asks for and excludes the same
style:

- **Claude**: the exclusion wins. The `topic` item stays `adopted: false`, the design
  leaves the style out, and step 2 records the choice as one `결정/사유` line. An
  ambiguous request is decided, not a reason for a named pause (constitution §1 and
  §2-1).
- **Codex**: step 2 blocks instead of guessing (Codex step 2, 시각 토큰·제외 계약).

## Precedence and judgement

- The contract wins over a supplied reference. Fresh planning-first14 and explicit20 review the current output
  against the Step2 contract; an excluded reference element is not required.
  Explicit legacy Step43 keeps its difference notation: **Claude** as `제외 계약: <id>`,
  **Codex** as `excluded-by-contract` plus id.
- At fresh step13 (explicit20 step19, explicit36 step35 and legacy50 step49), an element that matches an item with `adopted: false` is at least an
  `Important` finding. A style preference outside the contract is advisory.
- Values outside `tokens` are token violations, as before.

Fresh14 and existing20 must have their Step2 contract; explicit research-free36 still requires its Step18 contract. A missing required block remains missing
input; do not apply the historical fallback below to a fresh run.

## Legacy workspaces without a contract

Only an existing legacy50 workspace that finished step 30 before this contract existed has no block. Do not
edit the step 30 outputs.

- **Codex** (steps 37, 43 and 49 read this procedure): the current step writes the
  contract it uses once in its own report, marked `reconstructed`: `tokens` from the
  values the layout design already names, `exclude` from the Codex defaults (the five
  `legacy` items) and the TOPIC exclusions. Missing values stay missing; do not
  invent them.
- **Claude**: do not reconstruct a contract. Such a run started before the upgrade and
  keeps its archived step bodies. Its verifiers and the evaluator use the constitution
  §5 numbers only (`skills/harness-rules/SKILL.md` §11), and the `host` items are not
  required criteria for it, so a 2.10.0 design that chose one of those styles is not
  an `Important` finding.

## Asking again

To leave out a style you saw in a result, add `디자인 제외: <style>` to the next
`/webapp` or `$webapp` request. It becomes a `topic-N` item.

## Not covered

No script checks CSS against these items yet; the checks are the reviews above.

Explicit `planning-first-20-v1` runs keep environment3, implementation9, E2E15,
final20, quality10/14/20, QA11/16/17/18 and Jev1/2/9/15/19, with their original
profile/generation evidence paths. Existing20/36/50 bodies and indexes are preserved.
