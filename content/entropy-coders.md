---
title: The entropy-coder zoo
kicker: Lossless compression · Layer 4
goal: The model says a value has probability q. Something must now emit about −log₂ q bits. Four families do it, with different speeds and different ways of falling short, and the right choice follows from the shape and width of the distribution.
---

## The job

After modelling, each coordinate is an integer residual with a known distribution: a bell curve of known spread. The coder's only task is to approach $-\log_2 q$ bits per value.

::: widget coders | Four entropy coders against the entropy
**Slide the spread** Average bits per value for four coders on a residual of spread σ, against the entropy. Start at σ ≈ 15, where Marginalia's residuals live. Then slide left, below σ = 1. Switch to *Laplace* to see why audio codecs choose differently.
:::

## The four families

::: cards four
- **Fixed width**
  Every value gets $\lceil\log_2(\text{range})\rceil$ bits. No model, no state, random access to every value. Wastes the whole gap between $\log_2(\text{range})$ and the entropy: about a bit and a half per coordinate at any σ.
- **[[Golomb–Rice]]**
  A one-parameter code: the low $k$ bits verbatim, the rest in unary. No tables, branch-light, and near-optimal *for Laplace-shaped data*. On a bell curve it overpays by a few percent.
- **[[Huffman coding]]**
  The best code with a whole number of bits per symbol. Within about 1% of the entropy when there are many symbols; hopeless below 1 bit per symbol. Needs a table per distinct distribution.
- **[[Arithmetic coding]] and [[ANS]]**
  Treat the whole message as one number. Fractional bits per symbol, so within a fraction of a percent of the model's cross-entropy at any σ. ANS gets there at close to Huffman speed.
:::

## Choosing for embeddings

Three facts decide it.

**1 · The distributions are wide.** With σ around 13 to 22 steps, each coordinate carries 5.5 to 6.5 bits. In that regime Huffman is within a percent and even Rice is tolerable. The sub-one-bit regime where arithmetic coding is indispensable does not arise for int8 embeddings (it does for the indices in [[@code-entropy]]).

**2 · Every coordinate has its own distribution.** There are {{d}} different spreads, and with prediction the *centre* moves for every single value. A Huffman table per (coordinate, centre) pair is out of the question. Coders that take a probability *interval* per symbol handle this naturally: compute the bell curve's cumulative distribution at $r \pm \tfrac12$ and hand over the interval.

**3 · The model is static.** The spreads are fitted once and shipped. Nothing needs to adapt while coding, so the per-symbol work is one cumulative-distribution evaluation and one coder step.

::: key The pick
A static **quantized-Gaussian model per coordinate, coded with rANS or a range coder.** Fractional bits, no per-context tables, and the same code path for every row of the ladder.
:::

## Does a real coder match the "ideal" numbers?

Every bit count in this part is $-\log_2 q$ summed up: an *ideal* code length. Here is the same data through an actual range coder.

::: measured A real coder on 4,000 held-out vectors
| | Bits per vector |
|---|---|
| Ideal: $-\sum\log_2 q$ | {{rc_ideal|,.1f}} |
| Range coder output (constriction library) | {{rc_bits|,.1f}} |
| Overhead | {{rc_over|.3%}} |

Decoded output identical to the input. Encoding took {{rc_enc|.0f}} µs per vector and decoding {{rc_dec|.0f}} µs, called once per vector from Python; a batched or SIMD implementation is many times faster.
:::

So "ideal" is not an idealisation. Modern coders realise the model's cross-entropy to within a few thousandths.

## Practicalities that decide a format

| Concern | What to do |
|---|---|
| **Probabilities must be integers** | ANS and range coders work with frequencies that sum to a power of two (say $2^{16}$). Quantize the bell curve's CDF to that grid, *deterministically*, and give every representable value at least one count so that nothing is impossible. |
| **Tails** | Clip the model to a finite range and add an escape symbol followed by raw bits for anything outside. It costs nothing on average and removes a failure mode. |
| **Speed** | Interleave 4 to 8 independent rANS states and decode them with SIMD. Coordinates are independent given the model, so this parallelises perfectly, *unless* the model is triangular prediction, where coordinate $j$ needs coordinates before it. |
| **rANS is last-in, first-out** | It decodes in the reverse order of encoding. Encode each block backwards so that decoding runs forwards. |
| **Adaptive or static?** | Adaptive models (update counts as you go) need no shipped parameters but force sequential decoding and cost speed. With a fitted parametric model there is nothing to adapt. |

::: aside The interaction to notice
Triangular prediction is sequential across coordinates; fast entropy decoding wants them independent. One compromise is *block-triangular* prediction: coordinates in a block of 16 are predicted from earlier blocks only, and decoded in parallel within the block. You give back a little of the gain for a lot of speed.
:::

::: check
- Fixed width, Rice, Huffman, arithmetic/ANS: in that order they get closer to the entropy and need more machinery.
- For wide, per-coordinate bell curves with moving centres, a static Gaussian model with rANS or range coding is the natural fit.
- A real coder lands within {{rc_over|.2%}} of the ideal code length.
:::
