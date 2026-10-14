---
title: Measured on real embeddings
kicker: The numbers
goal: Enough toy problems. Every method so far, on the same real vectors, at the same budget of 64 bits. Then what one sequence-aware trick adds for almost nothing.
---

## The setup

Each method compresses {{d}} floats into **64 bits**: a 192× reduction. Codebooks are trained on {{n_train|,}} windows and scored on the {{n_db|,}} windows of four other books. Recall is [[10-recall@10]] over {{n_queries}} queries from yet other books, with **no re-ranking**.

::: widget bench64 | Every method at 64 bits
**Read it left to right** Each step down in error costs a step right in encode time. Hover for details. The [pink]{style="color:var(--s5)"} points use the order of the windows, explained below.
:::

## Five lessons

**1. Freeing the codebooks helps most.** From PQ to greedy RQ the error falls {{pq_to_rq_cut|.0%}} for a few times the encode cost. A learned rotation (OPQ) recovers most of that gap by itself, which says PQ's weakness is correlated blocks.

**2. Better encoders give diminishing returns.** A beam of 4 costs {{beam4_cost|.1f}}× greedy for {{rq_to_beam4_cut|.1%}} less error. A beam of 16 costs {{beam16_cost|.0f}}× and gains nothing on held-out books. LSQ gets {{rq_to_lsq_cut|.0%}} at {{lsq_cost|.0f}}×.

**3. Squared error is not recall.** Keeping the top 8 principal directions has only somewhat more error than PQ but half the recall ({{pca8_rec|.2f}} against {{pq_rec|.2f}}). It throws away the many small directions that separate near neighbours.

**4. Eight bytes for {{d}} dimensions is brutal.** The best recall here is {{lsq_rec|.2f}}. That is a shortlist, not an answer. Real systems [[re-rank]], and Priya will budget more than 8 bytes.

**5. These embeddings are harder than older ones.** The earlier write-up this book grew from ran the same benchmark on averaged word vectors and saw roughly a third less error at every step. A contrastively trained transformer spreads information over more directions (an effective dimension of {{pr|.0f}}), and that is exactly what makes it a better embedder and a worse compression target.

## A cheap trick that beats the expensive ones

Marginalia's windows arrive in reading order, and consecutive windows have cosine {{lag1|.2f}}. So instead of quantizing $x_t$, quantize what the previous window did not already tell you:

$$ \text{predict } \tilde x_t = \alpha\,\kdec{\hat x_{t-1}}, \qquad \text{code } \kres{e_t} = \kvec{x_t} - \tilde x_t \text{ with RQ}, \qquad \kdec{\hat x_t} = \tilde x_t + \hat e_t $$

Video encoders do not predict every block. They try both ways and keep the better one, paying a flag bit. Same here: code each window independently *and* predictively, keep whichever is closer.

::: stats
- **{{rq_err|.3f}}**{.k-res} greedy RQ, each window alone
- **{{pred_always_err|.3f}}**{.k-res} always predict from the previous window
- **{{pred_mode_err|.3f}}**{.k-dec} predict only when it helps ({{pred_frac|.0%}} of windows)
- **{{beam4_err|.3f}}**{.k-enc} beam 4, for comparison ({{beam4_cost|.1f}}× the encode time)
:::

With the per-window choice, locality buys **{{rq_to_mode_cut|.0%}} less error than greedy RQ at about twice its cost**, more than any beam width achieved. And the two combine: the beam can encode the prediction errors too.

::: warn The bill: random access
Predictive codes depend on the previous reconstruction, so:

- To score window $t$ you need $\hat x_{t-1}$, which needs $\hat x_{t-2}$, back to a [[keyframe]]. IVF scans lists in cluster order, not reading order, so predictive codes do not fit an IVF index.
- A *sequential* scan survives: $\langle q, \hat x_t\rangle = \alpha\langle q, \hat x_{t-1}\rangle + \sum_m T_m[i_m]$, one multiply-add per window on top of the usual lookups.

Prediction belongs in archives and streams. [[@prediction]] returns to it properly.
:::

## What Priya takes away

::: story Priya | WEEK 6 · AFTER THE BENCHMARK
"So 8 bytes won't cut it on its own, and going from greedy RQ to anything fancier is a rounding error next to going from 8 bytes to 16. We'll take 16-byte RQ with a small beam in RAM, and re-rank the top couple of hundred against int8 vectors on SSD."
:::

At 16 bytes (128 bits) RQ's error is {{sw_rq_128_err|.2f}} and its recall before re-ranking {{sw_rq_128_rec|.2f}}; at 32 bytes, {{sw_rq_256_err|.2f}} and {{sw_rq_256_rec|.2f}}.

::: check
- At 64 bits: PQ {{pq_err|.2f}}, OPQ {{opq_err|.2f}}, greedy RQ {{rq_err|.2f}}, LSQ {{lsq_err|.2f}} relative error.
- The big steps are freeing the codebooks and adding bytes; heavier encoders add a few percent.
- Using the order of the data beats heavier search, but costs random access.
:::
