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
| `widget name \| A short name` | an interactive figure from `theme/js/widgets/`; the body is its caption. The name (required) is shown after the figure number and in the browse page |
| `svg name \| A short name` | a diagram from `figures/name.svg`; the body is its caption |

## Experiments

An experiment is a figure that leads a section: shown first with no explanation, then explained by the prose, then shown again with a guided reading. Write the first look as

```markdown
:::: lab meaning-map | The meaning map
::: question
The one question the experiment answers.
:::
::: recipe
1. Each step of what was done to the data, with the parameters as `code`.
:::
::: legend
- !dot **One dot** is one passage. Start an item with a glyph to draw it beside the text.
:::
::: look
- What to look for before reading on.
:::
::::
```

and the second look, anywhere later in the book, as

```markdown
:::: lab meaning-map again
::: reading
1. {books} **What this step shows.** Clicking the step calls the widget's `books` view.
:::
::::
```

The build numbers experiments per page ("Experiment 1.5A"), and a second look carries the first look's question, recipe and key in a folded panel. A third look names itself (`:::: lab alice-walk prediction`). Glyphs: `dot ring hollow dots line thick dash bar cell x y colour arrow ramp hover`.

An experiment's widget calls `CE.lib.withLab(el, '<data>', build)` to load `data/lab/<data>.json` (written by `experiments/geometry.py`), and `CE.lib.lab(el, {view: fn})` to wire up the reading steps. `page.html?show=<figure id>:<view>` opens a page with a step already selected.

A fenced block with the language `score` draws a scorecard strip (`good`, `ok` or `bad`, then `label | value` per line).
A code fence may carry a title: ` ```python Title | right-hand label `.

## Adding an interactive figure

Register it in any file under `theme/js/widgets/`:

```js
CE.widget('my-figure', el => { el.innerHTML = '…'; /* draw */ });
```

Helpers (canvas setup, an SVG chart kit, tooltips, the theme colours) are in `theme/js/lib.js`.
A file that mentions `DATA.` gets `data/results.json` loaded on the pages that use it.

## The browse page

`browse.html` is generated: every experiment, figure, diagram, box (key idea, measured, pitfall, in practice, exercise, checkpoint) and titled code block, with a link to its place. The same list feeds the search in the contents overlay. Nothing to maintain by hand; a box's title (`::: warn The curse`) becomes its entry title.
