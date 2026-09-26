# Design contract: visual tokens and exclusions

Step 30 fixes the visual tokens and the named list of design styles to leave out in
one block. Steps 37, 43 and 49 and the evaluator use only this block as "the selected
design tokens" and "the exclusion list". Both hosts write and read the same format;
only the default list differs.

## Location and format

`step_archive/step030_레이아웃설계_chunk1.md` holds exactly one fenced block whose
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

- Claude: the five `legacy` items and the five `host` items. The `host` items are the
  default styles named by the Opus 5.5 prompting guide (2026-09); the harness keeps
  them as a Claude default only.
- Codex: the five `legacy` items and no `host` items. Nothing shows that other models
  fall back on those five styles.
- Both: every style the TOPIC asks to leave out becomes a `topic-N` item. Claude
  writes them on the `디자인 제외(사용자):` line of `constraints`; Codex reads
  `constraints` and the original request.
- Readers apply every item with `adopted: false`, whatever its `source`, so a
  workspace moved between hosts keeps its contract.

## Exceptions

A `legacy` or `host` item may be adopted only when the TOPIC asks for that style or
the selected aesthetic cannot exist without it. Step 30 then sets `adopted: true`,
writes the reason in `exception_reason` and repeats it in the layout design as one
`결정/사유: <id> 채택 — <사유>` line, so the step 50 summary lists it. A `topic` item
is never adopted; a TOPIC that both asks for and excludes a style blocks step 30.

## Precedence and judgement

- The contract wins over reference fidelity. Step 37 does not copy an excluded
  element from a capture, step 43 does not report it as missing (it records
  `excluded-by-contract` with the id), and the evaluator does not deduct design
  fidelity for it.
- At step 49 an element that matches an item with `adopted: false` is at least an
  `Important` finding. A style preference outside the contract is advisory.
- Values outside `tokens` are token violations, as before.

## Workspaces without a contract

A workspace that finished step 30 before this contract existed has no block. Do not
edit the step 30 outputs. The current step writes the contract it uses once in its
own report, marked `reconstructed`: `tokens` from the values the layout design
already names, `exclude` from the default list of the host that runs the step and
the TOPIC exclusions. Missing values stay missing; do not invent them.

## Asking again

To leave out a style you saw in a result, add `디자인 제외: <style>` to the next
`/webapp` or `$webapp` request. It becomes a `topic-N` item.

## Not covered

No script checks CSS against these items yet; the checks are the reviews above.
