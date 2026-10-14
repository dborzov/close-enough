---
title: Paper club
kicker: Part 8 · How we read papers
goal: One paper per chapter, read with everything in this book at hand. We say what it claims in our own words, re-measure what we can, and say plainly when something looks off.
---

::: lede
The first seven parts built a toolkit: embeddings and their geometry, indexes, quantizers, hashing, entropy. This part turns the toolkit around and points it at research papers. Each chapter takes one paper and asks what it tells us about vectors, and whether we believe it.
:::

## Why a paper club

Papers in this field are written to be accepted, not to be understood by the next reader. They use their own notation, report the experiments that worked, and present design choices as inevitable. A paper club reads against that grain. The questions are the ones you would ask a colleague who had just presented the paper:

::: cards four
- **What is the idea, in our words?**
  Strip the paper down to one or two mechanisms and restate them in the language of this book: [[cosine]] or [[MIPS]], recall or estimation error, bits per vector, $-\log_2 p$.
- **What does it tell us about vectors?**
  The interesting part is rarely the headline number. It is the measurement or the observation in Section 3 that says something about how real vectors are shaped.
- **What did we check ourselves?**
  Wherever a claim can be tested on a laptop or one GPU, we test it. These checks appear in boxes marked *Measured*, and the scripts are in `experiments/`.
- **What looks off?**
  Missing baselines, a guarantee that is weaker than it sounds, a number that does not match its own table. We say so, explain why, and keep the doubts separate from the facts.
:::

::: aside A PDF is not an oracle
A paper on arXiv has been checked by its authors and, at best, by three reviewers on a deadline. It is a claim with evidence attached, not a result. When we disagree with a paper we show the arithmetic, and when we cannot tell, we say that too.
:::

## How a chapter is laid out

::: steps
1. **The paper in one paragraph.** What problem, what idea, what result, and where it was published.
2. **Why we are reading it.** The pages of this book it touches.
3. **The ideas, one at a time.** Each restated in our notation, with a figure. Where the paper's derivation is sound and classical, we say so and move on.
4. **Measured.** Our own re-run of the claims we can reach, on open models and the same Gutenberg books as the rest of the book.
5. **Raised eyebrows.** A numbered list of what we would ask the authors.
6. **What it suggests.** The big picture: what changes in how we think about embeddings, search or compression.
:::

## The papers

::: cards
- **[MagicPIG: LSH sampling for efficient LLM generation](@magicpig)**{.k-code}
  Chen et al., 2024 (ICLR 2025). Attention over the [[KV cache]] is a weighted average, so approximating it is an *estimation* problem, not a search problem. [[SimHash]] buckets turn out to be a sampler with a known probability. Touches Parts 1, 5 and 7.
:::

::: check
- Each chapter restates one paper in this book's language and connects it to earlier pages.
- *Measured* boxes are our own re-runs, not the paper's numbers.
- Doubts are listed explicitly and argued, not implied.
:::
