---
title: "Every bit must come back"
kicker: Lossless compression · The frame
goal: Two jobs need exact vectors, an archive and a network response, and they want different codecs. Both are the same machine underneath, and that machine has exactly one job, which is to assign probabilities.
---

::: story Priya | WEEK 9 · THE ARCHIVE
"The canonical copy is what we would re-index from if we switch quantizers, and what we re-rank against. It has to be exact. But storing 300 million vectors forever, and shipping a couple of hundred of them to the ranker on every query, adds up. How small can an *exact* copy get, and does the answer differ between the disk and the wire?"
:::

This part assumes you are comfortable with [[entropy]], [[Huffman coding]] and the idea of a probability model. It looks at one question from that angle: *what is the probability distribution of an embedding, and how closely can a practical coder follow it?*

## Two jobs

::: cards
- **The archive**{.k-bits}
  Written once, read rarely and *sequentially*, a book at a time. Encoding can be slow. The vectors arrive in reading order, so each one can lean on the one before. Goal: the fewest bytes on disk.
- **The wire**{.k-q}
  A search returns 50 to 200 vectors scattered all over the corpus, to be re-ranked a few milliseconds later. Each vector must decode *on its own*, fast, with no neighbours for context. Goal: fewer bytes per response without adding latency.
:::

The archive may use every trick. The wire may only use tricks that need nothing but the vector itself and a small model both ends already hold.

## What does "exact" mean?

Lossless is always relative to some representation. Choose it first, because it sets the size of the problem more than any coder will.

| Target | Bits per coordinate | What it preserves | Verdict |
|---|---|---|---|
| float32, as the model produced it | 32 | 24 bits of mantissa, about 20 of them noise | hardest; little to gain ([[@floats-are-stubborn]]) |
| float16 | 16 | about 11 significant bits | reasonable |
| 16-bit fixed point, step $2^{-15}$ | 16 | the same precision, on a uniform grid | clean arithmetic |
| [[int8]], one global step | 8 | what most vector databases already serve | the practical choice |

Most of this part uses the **int8** target: each coordinate is an integer between −127 and 127, with one step equal to {{i8_step|.4f}}. Raw, that is {{i8_raw|,}} bits per vector.

## One machine

Every lossless coder for numbers has the same two halves.

::: svg codec-pipeline
**The codec** A *model* looks at the context (whatever the decoder will also have) and outputs a guess and an uncertainty. The entropy coder turns the actual value into about −log₂ q bits. The decoder runs the same model on the same context and inverts the coder.
:::

::: key The only equation in this part that matters
An ideal entropy coder spends

$$ \kbits{\ell(x)} \;=\; -\log_2 \kbits{q}(\kvec{x} \mid \text{context}) \ \text{bits} $$

on the value $x$, where $q$ is the model's probability for it. Everything else is the question of how to make $q$ large on the data you actually see.
:::

So building a codec means building a probability model. The four layers of [[@compression-stack]] are four ways to improve it:

| Layer | What it does to the model $q$ | Page |
|---|---|---|
| **The marginal shape** | choose the right curve for one coordinate | [[@pdf-view]] |
| **Transform**{.k-enc} | remove correlation *between coordinates* | [[@transforms]] |
| **Predict**{.k-res} | condition on context: the previous vector, a coarse code | [[@prediction]] |
| **Entropy-code**{.k-bits} | realise $-\log_2 q$ bits in practice | [[@entropy-coders]] |
| **Allocate** | decide how many bits each layer may spend | [[@bit-allocation]] |

## Where this part ends up

To set expectations, here is the final scoreboard for the archive. Each row adds one idea to the model.

::: widget ladder
**Measured** Bits per vector for an int8-exact copy of four held-out books, with an ideal entropy coder (a real one lands within a tenth of a percent, [[@entropy-coders]]).
:::

Two things stand out before any theory:

1. **The first step is the biggest.** Simply knowing that coordinates follow a bell curve saves {{ld_marginal_saving|.0%}}. No prediction, no transform.
2. **The total is modest.** {{ld_best_ratio|.2f}}× smaller is the honest ceiling for these embeddings at int8. Most of an embedding's bits describe detail that nothing predicts.

::: aside What would change the picture
A coarser target. Every bit of precision you decide you do not need is 384 bits per vector, more than everything else on that chart together. [[@two-codecs]] returns to that.
:::

::: check
- Two jobs: an archive (sequential, slow encode allowed) and the wire (random access, fast decode).
- "Exact" needs a target; int8 is the practical one.
- A lossless codec is a probability model plus an entropy coder, and code length is $-\log_2 q$.
:::
