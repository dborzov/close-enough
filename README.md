# Close Enough

A visual primer on embeddings, vector search, and the mathematics of compressing vectors.
45 short pages, about 35 interactive figures, every number measured on real embeddings.

**Read it:** https://borzov.ca/close-enough/

## How it is put together

Content, look and data are kept apart:

| Path | What lives there |
|---|---|
| `content/*.md` | The chapters, one markdown file per page. `content/README.md` documents the syntax. |
| `content/glossary.yml` | Every term, with its one-line reminder and the page that explains it. |
| `book.yml` | Title, parts and reading order. |
| `theme/` | Everything visual: the page template, CSS, navigation and progress code, and the interactive figures (`theme/js/widgets/`). |
| `figures/*.svg` | Static diagrams, included from markdown by name. |
| `experiments/` | The scripts that produce every measurement. |
| `data/results.json` | Their output. Charts read it; numbers in the prose are substituted from it at build time (`facts.py`). |
| `build.py` | Markdown + theme + data → `dist/`. |

## Build

Needs [uv](https://docs.astral.sh/uv/) and Node (used once per build to pre-render the math with KaTeX).

```sh
uv run build.py            # writes dist/
uv run build.py --serve    # and serves it on http://localhost:8000
```

The build fails on a broken cross-reference, an unknown glossary term, a missing figure, or a number in the
text that is not in the results. Pushing to `main` deploys `dist/` to GitHub Pages.

## Re-run the experiments

Needs a GPU for the embedding step (about 90 seconds on an RTX 5080; the rest runs on CPU in about ten minutes).

```sh
uv run experiments/run.py          # everything not cached yet
uv run experiments/run.py lsh      # force one section
```

It embeds the 18 books of the NLTK Gutenberg corpus with `all-MiniLM-L6-v2` (48-word windows, stride 24),
fits every quantizer and probability model on 12 books, and scores them on 4 others with queries from 2 more.
Then rebuild: the charts and the prose pick up the new numbers.

## Credits

The field-guide chapters, the codebook chapters and several playgrounds grew out of conversations with Claude;
the measurements were re-run from scratch on transformer embeddings for this book.
