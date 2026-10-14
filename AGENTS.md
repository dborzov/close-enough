# Notes for agents writing this book

How to write pages for *Close Enough*. Syntax lives in `content/README.md`; this file is about voice, pacing and layout.

## Tell a story, don't file a report

The reader is already curious. Write like a good blog post or a 3Blue1Brown video: a motivated walk where each step answers a question the previous step raised.

- **Open with a hook, not a summary.** A puzzle, a surprising number, an everyday analogy ("estimate the average height from 2,000 people: would you pick the tallest?"). Notation comes after the reader wants it.
- **Never write an abstract-style paragraph.** Long sentences that pack problem, method and result together ("X proposes Y, which leverages Z to achieve W") help nobody. If a page needs an at-a-glance summary, use four short cards (problem / usual fix / objection / trick), one sentence each.
- **Motivate every turn.** Before "next we do X", show why X is the natural thing to want: a catch, a wall, a question. End sections on that question.
- **Intuition before formula.** Show the picture or the toy, let the reader see the effect, then give the one-line formula that names it. Put derivations in `::: deep` blocks.
- **Short paragraphs, plain words, active voice.** One idea per paragraph. Concrete numbers beat adjectives.

## Make the page rich, not a wall of text

Use the whole toolkit, and vary it so no stretch of the page is just paragraphs:

- `::: aside` for side facts, sources, version notes and "by the way" remarks: they go in the margin.
- `::: pull` for the one sentence the section is about; `==highlight==` for the key phrase in a paragraph.
- `::: key`, `::: measured`, `::: try` (guided steps for a figure), `::: qa` (a question with a one-line bold verdict first), `::: cards`, `::: steps`, `::: stats`.
- Glossary terms give hover cards for free: add a term to `content/glossary.yml` whenever a reader might need a reminder (`[[term]]`).
- Cross-link generously to earlier pages (`[[@slug]]`, `[text](@slug)`): the point of the later parts is to connect back.
- Concept colours (`\kq{}`, `[text]{.k-res}` …) keep the same meaning everywhere.

## Show it: toys first, real data second

- **Every mathematical point gets a picture.** Prefer a small interactive toy (`theme/js/widgets/`) that isolates the mechanism: draggable vectors, a slider for the one parameter that matters, a button that draws random samples. Toys are computed live and need no data.
- **Then the real thing.** After the toy, show the same effect measured on real vectors (`experiments/*.py` → `data/lab/*.json`), so the reader sees the toy was honest.
- Pair a toy with a `::: try` block: three numbered things to do, each with what to look for.
- Captions start with a bold instruction ("**Drag the query**"), then say what the marks mean.

## Paper club chapters

- Restate the paper in this book's language and notation; connect it to earlier pages.
- Re-measure what can be measured on an open model, and say so in `::: measured` boxes. Never present the paper's numbers as ours.
- Read critically. A PDF is a claim with evidence, not a source of truth. When something looks off, say so plainly with the arithmetic, in a "Raised eyebrows" section of `::: qa` boxes, each opening with a bold one-line verdict.
- Care about the big picture: what the paper suggests about embeddings, search, compression and information theory.

## Mechanics

- Build with `uv run build.py`; it fails on unknown terms, broken links and unnamed figures (`::: widget name | A short name`).
- Check figures in a browser in both light and dark themes, and at phone width.
