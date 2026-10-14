---
title: The prediction zoo
kicker: Lossless compression · Layer 3
goal: A prediction is a conditional distribution. Anything the decoder already holds can be conditioned on, and each kind of context narrows the bell curve by a measurable amount. Here are the kinds, what each is worth on real embeddings, and the one rule that changes between lossy and lossless.
---

## Prediction is conditioning

The per-coordinate model on [[@pdf-view]] codes $x$ with $q(x)$. A predictor replaces that with $q(x \mid \text{context})$: a narrower curve, centred on a better guess.

How much narrower? If the context has correlation $\rho$ with the coordinate, the best linear guess leaves a spread of

$$ \kres{\sigma_{\text{after}}} \;=\; \sigma\,\sqrt{1-\rho^2} \qquad\Longrightarrow\qquad \text{saving} \;=\; \tfrac12\log_2\frac{1}{1-\rho^2}\ \text{bits per coordinate} $$

The energy ratio $1/(1-\rho^2)$ is the classical [[prediction gain]].

::: widget cond-pdf | What a known neighbour saves
**Slide ρ** The wide curve is a coordinate on its own; the narrow one is the same coordinate once a correlated value is known. The saving in bits is the log of the ratio of widths.
:::

::: key Prediction is worth little until ρ is large
$\rho = 0.5$ saves 0.21 bits per coordinate. $\rho = 0.9$ saves 1.2. $\rho = 0.99$ saves 2.8. This is why video compresses a hundredfold (consecutive frames are nearly identical) and embeddings do not.
:::

## The zoo

Anything the decoder has before it decodes $x_t$ can be context.

| Predictor | Context | Guess for $x_t$ | Parameters | Needs order? |
|---|---|---|---|---|
| The mean | nothing | $\mu$ | $d$ | no |
| **Previous vector** ([[delta coding]]) | $x_{t-1}$ | $\beta\,x_{t-1}$ | 1 | yes |
| Linear, full matrix | $x_{t-1}$ | $A\,x_{t-1}$ | $d^2$ | yes |
| **Earlier coordinates** (triangular) | $x_{t,1..j-1}$ | row $j$ of $L$ | $d^2/2$ | no |
| A coarse code ([[side information]]) | an RQ or PCA code stored first | its reconstruction | codebooks | no |
| Nearest stored neighbour | the index | a similar vector already decoded | none | a graph |
| The query | the client's own query vector | $a\,q$ | 1 | no (wire only) |

Two of these are free in the sense that they send nothing extra: the previous vector and the earlier coordinates. The coarse code costs bits up front and gets [[@bit-allocation|its own page]].

## Measured: the previous window

Consecutive windows of a book have correlation {{beta0|.2f}} after centring. The formula predicts a saving of {{per_dim_temporal|.2f}} bits per coordinate, or {{temporal_bits_theory|.0f}} bits per vector.

::: stats
- **{{ld_marginal|,.0f}}**{.k-res} bits: a bell curve per coordinate
- **{{ld_temporal|,.0f}}**{.k-dec} bits: predict $\beta\,x_{t-1}$ first (one parameter)
- **{{ld_var|,.0f}}**{.k-enc} bits: predict $A\,x_{t-1}$ with a full {{d}} × {{d}} matrix
:::

The measured saving is {{ld_temporal_gain|.0f}} bits, as predicted. And 147,000 extra parameters buy {{var_gain|.0f}} more bits: the relationship between neighbouring windows really is "the same vector, faded".

## The two free predictors stack

Previous-window prediction removes what the *last passage* explains. Triangular prediction ([[@transforms]]) removes what the *other coordinates* explain. They are about different things, so:

::: measured Both together
$$ {{ld_marginal|,.0f}} \;\xrightarrow{\ \text{previous window}\ }\; {{ld_temporal|,.0f}} \;\xrightarrow{\ \text{earlier coordinates}\ }\; \mathbf{ {{ld_temporal_chol|,.0f}} }\ \text{bits} $$

That is {{ld_temporal_chol_saving|.0%}} below raw int8, and it is the best archive model in this book.
:::

## The rule that changes: open or closed loop

In **lossy** predictive coding the decoder only has reconstructions, so the encoder must predict from the reconstruction too:

::: warn Closed loop, or drift
Predict from $\hat x_{t-1}$, never from $x_{t-1}$. If the encoder predicts from the original and the decoder from its approximation, they disagree a little at every step and the disagreement accumulates. That failure is called *drift*.
:::

::: widget predictive | Quantizing prediction errors
**The lossy case, in two dimensions** The same 4 bits per step either way: a 16-entry codebook for the vectors themselves, or for the prediction errors. [Yellow]{.k-vec}: the true path. [Mint]{.k-dec}: the reconstruction. [Red]{.k-res}: the error. Diamonds are [[keyframes]], coded independently every 16 steps. Slide ρ down to 0.5 and the advantage evaporates.
:::

In **lossless** coding the distinction disappears: the decoder has the previous vector *exactly*, so predicting from the original is predicting from the reconstruction. There is no drift to manage. What remains is a different discipline:

::: warn Determinism is part of the format
The decoder must compute *exactly* the same prediction as the encoder, on any machine. Floating-point sums in a different order, a different BLAS, or float32 against float64 can flip one rounding and corrupt everything after it. Fix the arithmetic: store the model in fixed point and predict with integers, or pin the summation order and precision.
:::

## Keyframes buy random access

A chain of predictions must be decoded from its start. Break the chain every $K$ vectors with a [[keyframe]] (a vector coded with no temporal context) and you can start decoding at any keyframe.

The price is small, because a keyframe still gets the triangular predictor:

| Keyframe every | Extra bits per vector | Worst-case vectors decoded to reach one |
|---|---|---|
| 16 | {{key16_cost|.1f}} | 16 |
| 64 | {{key64_cost|.1f}} | 64 |
| never | 0 | the whole book |

At {{key64_cost|.1f}} bits per vector there is no reason to economise on keyframes.

## Predict only when it helps

Video encoders try each block both ways and keep the better, paying a flag bit. The same *mode decision* applies here: at a chapter break the previous window is a bad predictor, and coding the vector independently is cheaper. In the lossy experiment of [[@measured]] the choice mattered a great deal ({{pred_frac|.0%}} of windows chose prediction). In lossless coding it is a smaller refinement, because a bad prediction costs a few bits where a lossy codec would lose accuracy.

::: check
- A predictor narrows the bell curve by $\sqrt{1-\rho^2}$, saving $\tfrac12\log_2\frac{1}{1-\rho^2}$ bits per coordinate.
- The previous window saves {{ld_temporal_gain|.0f}} bits per vector with one parameter; a full matrix adds almost nothing.
- Previous-window and earlier-coordinate prediction stack to {{ld_temporal_chol|,.0f}} bits.
- Lossy prediction must be closed-loop; lossless prediction must be bit-exactly deterministic.
:::
