---
title: Bits as a compressed sketch
kicker: LSH as a compressor
goal: Forget buckets. Keep a few hundred sign bits per vector and compare bit strings. This is what "binary quantization" is, it needs no training, and with two refinements it is far better than its reputation.
---

## From collision probability to an estimator

Take $b$ random hyperplanes and store the $b$ sign bits of each vector. For two vectors at angle $\theta$, each bit differs independently with probability $\theta/\pi$. So the [[Hamming distance]] $H$ between the bit strings estimates the angle:

$$ \hat\theta \;=\; \pi\,\frac{H}{b} \qquad\qquad \operatorname{sd}(\hat\theta) \;=\; \pi\sqrt{\frac{(\theta/\pi)(1-\theta/\pi)}{b}} $$

The error falls like $1/\sqrt{b}$: four times the bits, half the error.

::: widget sketch-estimate
**Choose the number of bits** Each dot is a real pair of passages. With 64 bits the estimate is a blur; with 1,024 it hugs the diagonal.
:::

::: measured The formula holds
Typical angle error on real pairs: {{est_rmse_64|.3f}} rad with 64 bits, {{est_rmse_256|.3f}} with 256, {{est_rmse_1024|.3f}} with 1,024. The formula predicts {{est_theory_64|.3f}}, {{est_theory_256|.3f}} and {{est_theory_1024|.3f}}.
:::

Comparing two bit strings is an XOR and a population count: a few machine instructions for 64 bits, and the fastest similarity computation there is.

```python Binary sketches and Hamming search | numpy
bits = np.packbits((X - mean) @ R.T > 0, axis=1)       # N x (b/8) bytes
qbit = np.packbits((q - mean) @ R.T > 0)
ham = np.unpackbits(bits ^ qbit, axis=1).sum(1)        # XOR + popcount
shortlist = np.argpartition(ham, 100)[:100]            # then re-rank exactly
```

## How good is the shortlist?

The pattern is always the same: rank everything by the sketch, keep a shortlist, [[re-rank]] the shortlist with better vectors.

::: widget sketch-recall
**Pick the shortlist size** Recall of the true top 10 after re-ranking, against the size of the sketch. All three lines use the same number of stored bits per vector; they differ in which hyperplanes are used and in how the query is treated.
:::

Three lessons are in that chart.

### 1 · Which hyperplanes matters

- **Signs of the raw coordinates** ("binary quantization" as shipped in vector databases) are SimHash with the hyperplanes aligned to the axes. At 384 bits and a shortlist of 100 they reach {{sk_coord_sign_384_100|.2f}}.
- **Signs of PCA coefficients** are *worse*: {{sk_pca_sign_384_100|.2f}}. The leading directions have large variance and the trailing ones almost none, so most bits are spent on directions that carry nothing. One bit per direction wants every direction to matter equally.
- **A random rotation** spreads the variance evenly across all coordinates, which is the best case for one bit each.

### 2 · Do not quantize the query

The database must be compressed. The query does not have to be. Score each stored bit string against the *float* query:

$$ \text{score}(\kq{q}, \kcode{\text{bits}_x}) \;=\; \sum_{i=1}^{b} \kcode{s_i}\,(r_i\cdot \kq{q}), \qquad \kcode{s_i} = \operatorname{sign}(r_i \cdot x) \in \{-1, +1\} $$

This is the same asymmetry as [[ADC]] in Part 4, and it removes half the quantization noise.

::: stats
- **{{sk_rot_sign_384_100|.2f}}**{.k-res} 384 rotated bits, Hamming (both sides quantized)
- **{{sk_rot_asym_384_100|.2f}}**{.k-dec} the same 384 bits, float query
- **{{sk_rot_asym_384_1000|.2f}}**{.k-dec} the same, with a shortlist of 1,000
:::

All at 48 bytes per vector, with no training beyond the mean.

### 3 · Bits are cheap, so use more

At 1,536 bits (192 bytes, the size of int4) the asymmetric sketch with a shortlist of 100 reaches {{sk_asym_1536_100|.2f}}.

## RaBitQ: the modern version

[[RaBitQ]] (2024) packages lessons 1 and 2 with a guarantee:

::: steps
1. Centre the vectors (on an IVF centroid) and normalize.
2. Apply one random *rotation* and keep the signs: $d$ bits.
3. Store two extra scalars per vector that correct for how far the sign pattern is from the true direction.
4. Estimate the distance to a float query with an **unbiased** estimator whose error is bounded with high probability.
:::

The error bound is what matters in practice: it tells the system *which* candidates are uncertain enough to need re-ranking, instead of re-ranking a fixed number.

## Bits against codebooks

| Code | Size | Training | Recall@10, no re-ranking |
|---|---|---|---|
| 384 sign bits, Hamming | 48 B | none | {{sk_rot_sign_384_10|.2f}} |
| 384 sign bits, float query | 48 B | none | {{sk_rot_asym_384_10|.2f}} |
| 1 bit per coordinate with learned levels, float query | 48 B | two numbers per coordinate | {{sw_scalar_384_rec|.2f}} |
| RQ, 32 stages | 32 B | 32 codebooks | {{sw_rq_256_rec|.2f}} |
| OPQ, 64 blocks | 64 B | a rotation + 64 codebooks | {{sw_opq_512_rec|.2f}} |

Per bit, learned codebooks are better. Binary sketches win on everything else: nothing to train, nothing to go stale when the data shifts, encoding at memory speed, and a comparison that is one XOR.

::: pull
Binary codes are a first-pass filter, not an answer.

Their job is to make the shortlist cheap. With a float query and a shortlist of a few hundred, 48 bytes per vector is enough to hand the re-ranker almost every true neighbour.
:::

::: check
- Hamming distance over b random sign bits estimates the angle with error proportional to $1/\sqrt b$.
- Binary quantization is SimHash with axis-aligned hyperplanes; rotate first so that every bit matters.
- Keep the query in floats: the asymmetric score roughly halves the noise.
- RaBitQ adds an unbiased estimator and an error bound that says what to re-rank.
:::
