---
title: Where should the bits go?
kicker: Lossless compression · The balance
goal: A layered codec has dials. How many quantizer stages, how fine a step for the side information, how often a keyframe. They all have the same answer, which is to keep spending on a layer while each bit spent there saves more than a bit elsewhere.
---

## The two-part code

Some predictors are not free. A coarse code (an [[RQ]] code, quantized [[PCA]] coefficients) must be *stored* before it can be used to predict. The file then has two parts:

$$ \kbits{\text{total bits}} \;=\; \underbrace{\kcode{\text{side information}}}_{\text{describes the guess}} \;+\; \underbrace{\kres{\text{residual}}}_{\text{exact value given the guess}} $$

This is a [[two-part code]], and choosing how much to spend on the first part is the [[minimum description length]] principle in its plainest form.

::: svg lossless-coder
**A quantizer as side information** The stored file is the [code]{.k-code} plus the [entropy-coded residual]{.k-bits}. The decoder recomputes the prediction from the code, so adding the residual restores every bit.
:::

## The exchange rate

From [[@pdf-view]], a coordinate costs $\log_2(\sigma/\Delta) + 2.05$ bits. Across $d$ coordinates, with $D$ the total squared error of the guess:

$$ \kres{\text{residual bits}} \;\approx\; \frac{d}{2}\log_2 \kres{D} \;+\; \text{const} $$

::: key Halve the error, save a bit per dimension
Quartering $D$ (halving the RMS error) saves $d$ bits. So a stage that costs 8 bits is worth adding only if it shrinks $D$ by more than a factor of

$$ 2^{-16/d} \qquad\text{which for } d = {{d}} \text{ is a cut of } {{stage_threshold|.1%}} $$
:::

In lossy mode the depth of a quantizer is set by a memory budget. In lossless mode it is set by the data: ==keep adding stages while each one cuts the error by more than {{stage_threshold|.1%}}.==

## Dial 1: how many RQ stages?

The progressive property of RQ ([[@residual-quantization]]) lets us train one deep stack of 24 stages and choose the depth afterwards.

::: widget lossless-sweep
**Hover the chart** Bits per vector to store the database books exactly, against the number of RQ stages $m$ used as the predictor. [Pink band]{.k-code}: the code, 8 bits per stage. [Dashed lime]{.k-bits}: the residual alone. Solid lime: the total. The dashed baselines use no quantizer.
:::

The rule predicts the minimum:

| Stage | Cuts the error by | Above {{stage_threshold|.1%}}? |
|---|---|---|
| 9 | {{stage9_cut|.1%}} | yes: add it |
| 10 | {{stage10_cut|.1%}} | about break-even |
| 12 | {{stage12_cut|.1%}} | about break-even, and falling |

The measured optimum is $m = {{i8_best_m}}$ at {{i8_best|,.0f}} bits, and the curve is nearly flat from 8 to 12: exactly the break-even zone.

::: aside How well the formula holds
From 0 to 8 stages the error falls to {{i8_m8_err|.2f}} of its starting value. The formula predicts $\tfrac{{{d}}}{2}\log_2(1/{{i8_m8_err|.2f}}) = {{i8_m8_pred|.0f}}$ bits of residual saved; the measured saving is {{i8_m8_saved|.0f}}. It overshoots a little because the quantizer does not shrink every coordinate equally.
:::

## Dial 2: how fine a step for the side information?

Use quantized PCA coefficients as side information instead, with one step size $s$ for all of them. Small directions round to zero and cost almost nothing, so this is water-filling ([[@spectrum-and-bits]]) with a single knob.

::: widget side-info
**Two kinds of side information on one axis** x: bits spent on the side information. y: total bits, zoomed. Both curves are shallow bowls with a minimum.
:::

Read the two ends of the orange curve:

- **Too coarse** (left): the side information ignores most of the correlation, and the per-coordinate residual model pays for it.
- **Too fine** (right): the coefficients describe noise that the residual has to describe again on a different grid. The total climbs back to where it started.

## The general rule

Every dial is the same problem. Spend bits on layer A while the *marginal* saving in layer B exceeds one bit per bit:

$$ \frac{\partial\,\kres{\text{residual bits}}}{\partial\,\kcode{\text{side bits}}} \;=\; -1 \quad\text{at the optimum} $$

In rate–distortion language this is the equal-slope condition: at the best allocation, every component is working at the same exchange rate. [[Reverse water-filling]] is the special case where the components are principal directions.

## When side information pays, and when it does not

This is the part that the formula cannot tell you, and where measuring earns its keep.

::: measured The same 64 bits of RQ code, against two residual models
| Residual model | Without RQ | With RQ-8 (code included) | RQ's net effect |
|---|---|---|---|
| A bell curve per coordinate | {{ld_marginal|,.0f}} | {{ld_rq8|,.0f}} | **saves {{ld_rq_gain|.0f}} bits** |
| Triangular prediction | {{ld_chol|,.0f}} | {{ld_rq8_chol|,.0f}} | **costs {{rq_chol_cost|.0f}} bits** |
| Triangular + previous window | {{ld_temporal_chol|,.0f}} | {{ld_rq8_temporal_chol|,.0f}} | costs {{rq_tchol_cost|.0f}} bits |
:::

Against a weak residual model, the quantizer code removes {{rq_resid_gain_marg|.0f}} bits of residual for a price of 64. Against a strong one it removes only {{rq_resid_gain_chol|.0f}}, less than it costs.

::: pull
Side information pays only for structure the residual model cannot already see.

A codebook and a linear predictor were both describing the same thing: the ellipsoidal shape of the cloud. Once the linear model has it for free, the codebook is charging rent.
:::

A codebook would still earn its place if the data had strong *non-linear* structure: tight, well-separated clusters, where knowing the cluster changes not just the mean but the whole local covariance. These embeddings are close to one big Gaussian (remember the kurtosis of {{kurtosis|.2f}}), so there is little of that to find.

::: aside When the code is free
If the vector is already in a search index, its RQ code already exists and the client may already hold it. Then the 64 bits cost nothing and the comparison flips. [[@two-codecs]] uses exactly this on the wire.
:::

## The hyperparameter sheet

| Dial | Trades | How to set it | On this data |
|---|---|---|---|
| Target precision Δ | fidelity ↔ everything | the largest step that leaves recall intact | int8: 4× before any coder |
| Marginal model | parameters ↔ KL waste | fit, compare cross-entropy on held-out data | Gaussian per coordinate |
| Temporal coefficient β | — | least squares on training pairs | {{beta0|.2f}} |
| Keyframe interval $K$ | random access ↔ bits | cost is (keyframe − predicted) / $K$ | 64: +{{key64_cost|.1f}} bits |
| RQ stages $m$ | code bits ↔ residual bits | add while a stage cuts error > $2^{-16/d}$ | 0 with a triangular model; {{i8_best_m}} without |
| PCA step $s$ | side bits ↔ residual bits | sweep; the bowl is shallow | {{pca_side_s}} |
| Block size of triangular prediction | decode speed ↔ bits | measure both | full, for the archive |

::: check
- Two-part code: total = side information + residual. Halving the error saves one bit per dimension.
- Add an 8-bit stage only if it cuts the error by more than $2^{-16/d}$ ({{stage_threshold|.1%}} at $d$ = {{d}}).
- Every dial is set where a bit spent saves exactly a bit elsewhere.
- Side information helps only with structure the residual model cannot capture on its own.
:::
