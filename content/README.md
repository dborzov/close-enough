# Writing pages

Each page is one markdown file with a small header:

```markdown
---
title: Scalar quantization
kicker: Layer 2 · The simplest quantizer
goal: One or two sentences shown under the title and in link previews.
---
```

Add the file's name to `book.yml` to place it in the reading order.

## Beyond plain markdown

| Write | Get |
|---|---|
| `[[HNSW]]`, `[[rq\|residual quantization]]` | a glossary term with a hover card (the build fails if the term is unknown) |
| `[[@measured]]`, `[text](@measured)` | a link to another page, with a preview and a "read" tick |
| `{{pq_err\|.2f}}` | a measured number from `facts.py`, formatted (`.0%` turns a fraction into a percentage) |
| `$x$`, `$$ … $$` | math, pre-rendered. `\kvec{x}`, `\kbook{c}`, `\kcode{i}`, `\kres{e}`, `\kenc{}`, `\kdec{}`, `\kq{q}`, `\kbits{R}` paint a symbol in its concept colour |
| `[text]{.k-book}`, `**text**{.k-res}` | concept-coloured prose; add `.def` for a highlighted definition |
| `==text==` | highlighter |
| `## Title {#my-id}` | a section with a fixed anchor |

The first mention of any glossary term on a page is linked automatically.

## Blocks

Open with `::: name optional title`, close with `:::`.

| Block | Use |
|---|---|
| `note`, `key`, `warn`, `practice`, `measured`, `try`, `check` | boxes: remark, key idea, pitfall, practice, a measured result, exercises, the end-of-page checkpoint |
| `aside Title` | a side note (in the margin on wide screens) |
| `pull` | a magazine pull-quote; a second paragraph becomes the small print |
| `lede` | an opening paragraph with a drop cap |
| `qa The question?` | a question-and-answer box |
| `deep Title` | a collapsed derivation |
| `story Name \| WEEK 3 · LABEL` | the running story |
| `stats` | a list becomes stat tiles; start each item with a bold number |
| `cards`, `cards three`, `cards four` | a list becomes cards; start each item with a bold title |
| `steps` | a numbered list becomes a stepped path |
| `cols`, `wide` | two columns; a full-width block (for wide tables) |
| `widget name` | an interactive figure from `theme/js/widgets/`; the body is its caption |
| `svg name` | a diagram from `figures/name.svg`; the body is its caption |

A fenced block with the language `score` draws a scorecard strip (`good`, `ok` or `bad`, then `label | value` per line).
A code fence may carry a title: ` ```python Title | right-hand label `.

## Adding an interactive figure

Register it in any file under `theme/js/widgets/`:

```js
CE.widget('my-figure', el => { el.innerHTML = '…'; /* draw */ });
```

Helpers (canvas setup, an SVG chart kit, tooltips, the theme colours) are in `theme/js/lib.js`.
A file that mentions `DATA.` gets `data/results.json` loaded on the pages that use it.
