---
title: Know your data
kicker: Before compressing anything
goal: Four properties of these vectors decide what every later method can and cannot do. Each takes a line of numpy to measure.
---

## Unit length: everything is in the direction

Normalized embeddings live on a sphere, so [[cosine]] equals the [[inner product]] and equals $1 - \tfrac12\lVert x - y\rVert^2$ ([[@closeness]]). That is why compression error can be measured as plain squared distance.

## Centre first

The mean vector of this data has length **{{mean_norm|.2f}}**, and two random windows have cosine **{{rand_cos|.2f}}** instead of 0. This is [[anisotropy]]: the cloud sits in a cone off to one side.

For compression the fix is one subtraction. Remove the mean before quantizing, so that codebooks do not spend bits re-describing it.

## Variance is concentrated in a few directions

Take the covariance of the centred vectors and look at its eigenvalues: the variance along each [[pca|principal direction]]. Sorted from largest to smallest, this is the [[eigenvalue spectrum]].

::: widget spectrum | Variance per principal direction
**Hover the bars** The first 8 directions (yellow) hold {{var8|.0%}} of the variance, the first 64 hold {{var64|.0%}}, and the first 128 hold {{var128|.0%}}.
:::

Read it both ways:

- **A few directions carry a lot.** {{k67}} of {{d}} directions ({{k67_pct|.0%}} of the axes) hold 67% of the signal. Any good compressor will spend most of its bits there.
- **The tail is long.** The remaining {{var64|.0%}}-to-100% is spread thinly over three hundred directions. Throwing them all away loses the fine distinctions that separate near neighbours, as [[@measured]] will show.

::: aside Not "67% of the axes"
It is easy to misread such a chart as "most of the signal lies along 67% of the axes". It is the reverse: 67% of the signal lies along about {{k67_pct|.0%}} of the axes. That lopsidedness *is* the structure.
:::

```python Measure it yourself | numpy
Xc = X - X.mean(0)
ev = np.linalg.svd(Xc, compute_uv=False) ** 2
ev /= ev.sum()
print("variance in the top 64 directions:", ev[:64].sum())     # {{var64|.2f}}
print("participation ratio:", 1 / (ev ** 2).sum())             # about {{pr|.0f}}
```

## Neighbours in the text are neighbours in space

These are not independent vectors. They are a [sequence]{.def .k-vec}. You met this experiment in [[@shape-of-the-cloud#path]]; here it is again, read for what it offers a compressor.

:::: lab alice-walk prediction
::: reading
1. {diagonal} **The previous passage is a good guess.** The bright diagonal says each vector is close to the one before it. Store the difference from a prediction, not the vector itself.
2. {lag} **The guess decays slowly.** One passage back is much better than two, and two is still better than a random passage. A predictor should lean on the most recent vector and on the book's own average.
:::
::::

::: stats
- **{{lag1|.2f}}**{.k-vec} cosine between a window and the next (they share half their words)
- **{{lag2|.2f}}**{.k-vec} two windows apart (no shared words)
- **{{lag16|.2f}}**{.k-vec} sixteen apart
- **{{rand_cos|.2f}}**{.k-res} two random windows from anywhere
:::

::: pull
Embeddings of a sequence are not a bag of points. They are a path, and paths are predictable.

Video codecs, audio codecs and DPCM all live off that one fact. [[@prediction]] puts it to work.
:::

## And the numbers themselves

Each coordinate is a float32 with a typical size of {{coord_std|.3f}} (the largest in the whole set is {{max_abs|.2f}}). Their distribution is a nearly perfect bell curve: the excess kurtosis is {{kurtosis|.2f}}, where 0 is exactly Gaussian. That fact will matter twice: it makes scalar quantization theory apply cleanly ([[@scalar-quantization]]), and it picks the probability model in Part 6.

::: check
- Centre the vectors: the mean has length {{mean_norm|.2f}} and carries no information about any one passage.
- The spectrum is lopsided: {{k67}} directions hold two thirds of the variance; the effective dimension is about {{pr|.0f}}.
- Consecutive windows have cosine {{lag1|.2f}}: the data is a path.
- Coordinates are bell-shaped.
:::
