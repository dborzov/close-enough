---
title: Hash functions that like their neighbours
kicker: Locality-sensitive hashing
goal: An ordinary hash scatters similar inputs. LSH is designed so that near points collide more often than far ones. For angles, the whole construction is one random hyperplane and one line of geometry.
---

## The definition

A family of hash functions is [[lsh|locality-sensitive]] if, for a randomly drawn member $h$:

$$ \text{close points: } \Pr[h(x) = h(y)] \ge \kdec{p_1} \qquad\qquad \text{far points: } \Pr[h(x) = h(y)] \le \kres{p_2} \qquad\qquad \kdec{p_1} > \kres{p_2} $$

"Close" and "far" are two thresholds on the distance you care about. Everything LSH can do follows from how far apart $p_1$ and $p_2$ are.

::: aside What makes it different from every other index
An LSH family is chosen **without looking at the data**. That is its strength (no training, provable guarantees, new points are hashed the instant they arrive) and, as the next pages measure, its weakness.
:::

## SimHash: one hyperplane, one bit

For [[cosine]] similarity the classic family is Charikar's [[SimHash]] (2002). Draw a random direction $r$ and record which side of its hyperplane the vector falls on:

$$ h_r(\kvec{x}) \;=\; \operatorname{sign}(r \cdot \kvec{x}) $$

When do two vectors get different bits? Exactly when the hyperplane passes *between* them.

::: widget simhash-toy | Random hyperplanes in the plane
**Drag the two arrows** Red lines are hyperplanes that separate the query from the document. In the plane a random line through the origin has a random angle, and it separates the arrows exactly when it falls inside the yellow angle between them.
:::

That picture is the proof. The two vectors span a plane; only the hyperplane's trace in that plane matters; that trace is a line at a uniformly random angle; and it separates the vectors when it lands inside an angle of size $\theta$ out of $\pi$:

$$ \Pr\big[h_r(x) \ne h_r(y)\big] \;=\; \frac{\kvec{\theta}}{\pi} \qquad\Longrightarrow\qquad \Pr[\text{same bit}] \;=\; 1 - \frac{\theta}{\pi} $$

It holds in any number of dimensions, because only that one plane matters.

```python SimHash | numpy
R = np.random.randn(n_bits, d)        # one random hyperplane per bit
bits = (X @ R.T) > 0                  # (N, n_bits) booleans
# two rows differ in about  n_bits * angle / pi  positions
```

## Does it hold on real embeddings?

::: widget lsh-collision | Collision probability, measured
**Measured** Dots: the fraction of 2,048 random hyperplanes on which real query–passage pairs agree, grouped by their true angle. Line: $1-\theta/\pi$. The two dashed markers are the angles that matter for search on this data.
:::

The formula is exact. The bad news is where the markers sit.

::: measured The gap LSH has to work with
After centring, a query's true 10th neighbour is at cosine {{cosc_nn10|.2f}} and a random passage at {{cosc_rand|.2f}}. In collision probabilities:

- [**$p_1$ = {{p_nn10|.3f}}**]{.k-dec} for a true neighbour,
- [**$p_2$ = {{p_rand|.3f}}**]{.k-res} for a random point.

One bit agrees {{p_nn10|.0%}} of the time for a neighbour and {{p_rand|.0%}} of the time for a stranger.
:::

::: pull
A single hash bit is a very weak witness.

On this data even a 10th-nearest neighbour is {{angle_nn10|.0f}}° away, and a random passage {{angle_rand|.0f}}°. The whole craft of LSH is amplifying a small gap between two probabilities.
:::

## Two ways to use the bits

The same random bits serve two quite different purposes, and the rest of this part takes them in turn.

::: cards
- **As an address**{.k-q}
  Concatenate a few bits into a bucket key and look only in the query's bucket. This is LSH as an *index*. → [[@lsh-amplification]], [[@lsh-in-practice]]
- **As a sketch**{.k-code}
  Keep hundreds of bits per vector and compare bit strings with [[Hamming distance]]. This is LSH as a *compressor*, and it is how "binary quantization" in vector databases works. → [[@bits-as-sketches]]
:::

::: aside The lemma underneath
Random projections preserve geometry: the [[Johnson–Lindenstrauss lemma]] says that projecting $N$ points onto about $\log N / \epsilon^2$ random directions keeps all pairwise distances within a factor $1 \pm \epsilon$. SimHash keeps only the *sign* of each projection, which is enough to recover angles.
:::

::: check
- An LSH family makes close points collide with probability at least $p_1$ and far points at most $p_2$.
- SimHash: one random hyperplane per bit; two vectors at angle θ disagree with probability θ/π.
- On real embeddings $p_1$ and $p_2$ are close ({{p_nn10|.2f}} against {{p_rand|.2f}}), so one bit is not enough.
:::
