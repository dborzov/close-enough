---
title: Everything is a probability model
kicker: Lossless compression · The PDF view
goal: The coder charges −log₂ q bits. So the bill is the cross-entropy between the data and your model, and the first thing to get right is the shape of the curve for a single coordinate.
---

## What you pay

If values really follow $p$ and the coder assumes $q$, the average cost per value is the [[cross-entropy]]:

$$ \underbrace{-\sum_x p(x)\log_2 \kbits{q}(x)}_{\text{what you pay}} \;=\; \underbrace{H(p)}_{\text{what you must pay}} \;+\; \underbrace{D(p\,\Vert\, \kbits{q})}_{\text{what a wrong model costs}} $$

The [[KL divergence]] is pure waste, and it is always positive. A better model is the only way to shrink it.

## From a density to bits

Embedding coordinates are continuous numbers on a grid of step $\kbook{\Delta}$. If the underlying density is $f$, the probability of the grid cell at $x$ is about $f(x)\,\Delta$, so

$$ \text{bits per coordinate} \;\approx\; \underbrace{h(f)}_{\text{differential entropy}} \;-\; \log_2 \kbook{\Delta} $$

For a bell curve with spread $\sigma$, the [[differential entropy]] is $\tfrac12\log_2(2\pi e\,\sigma^2)$, which gives the formula this whole part leans on:

::: key Bits for a Gaussian coordinate on a grid
$$ \kbits{\text{bits}} \;\approx\; \log_2\frac{\kres{\sigma}}{\kbook{\Delta}} \;+\; 2.05 $$

Halve the spread $\sigma$ and you save one bit. Halve the step $\Delta$ and you pay one more.
:::

Everything a model can do is on the left of that formula: **make σ smaller.** Everything the choice of target does is on the right.

## Look at the actual distribution

::: widget pdf-models | Probability models for a coordinate
**Choose what is being coded and how it is modelled** Bars are the measured histogram, pooled over every coordinate of every held-out vector. The line is the model. The readout compares what this model charges with the entropy of the histogram itself; the difference is the KL waste. Try *Laplace*, then *flat*, then drag the width.
:::

::: try Things to try
1. **Gaussian, width 1.00.** The waste is a few thousandths of a bit. The curve fits.
2. **Laplace.** The peak is too sharp and the tails too heavy: you pay for it at every value.
3. **Flat 8 bits.** This is raw int8: the model says every value from −128 to 127 is equally likely.
4. **Drag the width to 0.5, then to 2.** A model that is too narrow is punished far harder than one that is too wide: tail values cost many bits.
5. **Switch the data** to *after both predictions*. The histogram narrows, and the bill falls by $\log_2$ of the ratio of spreads.
:::

## Measured: what the model's shape costs

The same int8 values under five models, each fitted on the training books and charged on held-out books.

| Model $q$ for one coordinate | Parameters | Bits per vector | versus raw |
|---|---|---|---|
| Flat: every value equally likely | 0 | {{mo_flat|,.0f}} | — |
| One bell curve for all coordinates | 2 | {{mo_one|,.0f}} | −{{mo_gauss_saving|.0%}} |
| **A bell curve per coordinate** | 2 × {{d}} | **{{mo_gauss|,.0f}}** | −{{ld_marginal_saving|.0%}} |
| A Laplace curve per coordinate | 2 × {{d}} | {{mo_lap|,.0f}} | |
| A full histogram per coordinate | 513 × {{d}} | {{mo_hist|,.0f}} | |

Three readings:

- **The shape is worth {{ld_shape_gain|,.0f}} bits per vector.** That is more than every other trick in this part put together.
- **Gaussian beats Laplace by {{mo_lap_penalty|.0f}} bits.** Audio and image residuals are Laplace-shaped, which is why FLAC and JPEG-LS use codes built for that. Embedding coordinates are not: their excess kurtosis is {{kurtosis|.2f}}.
- **A free-form histogram buys nothing.** With {{mo_hist|,.0f}} against {{mo_gauss|,.0f}} bits, 200 times the parameters make no difference. Two numbers per coordinate capture the whole marginal distribution.

::: aside Why a bell curve?
Each coordinate of a pooled, normalized embedding is a sum of many small contributions from many tokens and many hidden units. Sums like that tend to a Gaussian. The model was not asked to produce bell curves; the central limit theorem did it.
:::

## What is still on the table

A per-coordinate model treats the {{d}} coordinates as independent and each vector as unrelated to the last. Both are false:

- coordinates are correlated with each other → [[@transforms]];
- each window resembles the previous one → [[@prediction]].

The benchmark to beat is {{mo_gauss|,.0f}} bits.

::: check
- Cost = entropy + KL divergence. The model's fit is the only thing you control.
- A Gaussian coordinate on a grid costs about $\log_2(\sigma/\Delta) + 2.05$ bits.
- For embeddings, one bell curve per coordinate removes {{ld_marginal_saving|.0%}} of raw int8 and no fancier marginal model does better.
:::
