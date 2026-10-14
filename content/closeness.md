---
title: What does "close" mean?
kicker: The bridge between stages
goal: Three similarity measures cover almost everything, and on unit vectors they agree. Exact search is simple and good for longer than you would think; the trouble is a property of high dimensions.
---

## Three measures

Once everything is a vector, search becomes: given query $\kq{q}$, return the $k$ stored vectors most similar to it. That is the [[knn|k-nearest-neighbour]] problem.

| Measure | Formula | What it cares about | Where you see it |
|---|---|---|---|
| [[Cosine similarity]] | $\dfrac{a\cdot b}{\lVert a\rVert\,\lVert b\rVert}$ | Only the angle | Text embeddings; the default almost everywhere |
| [[Dot product]] | $a\cdot b$ | Angle *and* length: long vectors win | Recommenders (length can encode popularity), attention. Searching it is called [[MIPS]] |
| Euclidean ([[L2]]) | $\lVert a-b\rVert$ | Straight-line distance | Images, classic benchmarks, [[k-means]] |

## On unit vectors they are one measure

Expand the squared distance between two vectors of length 1:

$$ \lVert \kq{q}-\kvec{x}\rVert^2 \;=\; \underbrace{\lVert q\rVert^2}_{1} + \underbrace{\lVert x\rVert^2}_{1} - 2\,\kq{q}\cdot\kvec{x} \;=\; 2 - 2\cos\theta $$

Bigger cosine means smaller distance. Same neighbours, same order.

::: key Why APIs return unit vectors
Once vectors are normalized, cosine, dot product and Euclidean distance give the **same ranking**. You can use whichever your index computes fastest, and you can measure compression error as plain squared distance.
:::

```python Three measures, one ranking | numpy
a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
cos  = a @ b
l2sq = ((a - b) ** 2).sum()     # equals 2 - 2*cos for unit vectors
```

## Exact search is fine, for a while

```python Brute force | numpy
X = embed(corpus)                        # (N, d), rows normalized
q = embed(["how do I reset my router"])[0]
scores = X @ q                           # N*d multiply-adds: one matrix-vector product
top10 = np.argpartition(-scores, 10)[:10]
# N = 1M, d = 768: ~3 GB of floats, ~0.77 billion multiply-adds per query.
# A modern CPU does that in tens of milliseconds. A GPU, batched, in far less.
```

Up to about a million vectors with modest traffic, brute force is often the right answer. The trouble starts when one of three things happens:

- hundreds of millions of vectors,
- thousands of queries per second,
- the vectors no longer fit in memory.

Then you need an index, and indexes run into a wall.

## The villain: distances concentrate

In two dimensions, "near" and "far" are very different. Slide the dimension up and watch what happens to the gap.

::: widget dim-curse | Distances in high dimensions
**Slide d from 2 to 1,024** In high dimensions almost every random point sits at distance √2 from the query, which is to say at a right angle to it. The nearest point is barely nearer than the farthest.
:::

::: warn The curse of dimensionality
Any index that works by cutting space into boxes relies on most boxes being far from the query. When everything is about equally far, no box can be ruled out, and the index degenerates into looking at everything.
:::

There is a way out, and it is the reason vector search works at all: **real embeddings are not random points.** They have clusters, a lopsided [[spectrum]] and an [[intrinsic dimension]] far below the nominal one ([[@geometry-of-embeddings]]). On real data the nearest neighbour *is* much nearer than a random point. In this book's data a query's 10th neighbour has cosine {{cos_nn10|.2f}}; a random passage, {{cos_rand|.2f}}.

::: check
- kNN: find the k most similar stored vectors. Cosine, dot product and L2 agree on unit vectors.
- Brute force is one matrix product and is fine up to roughly a million vectors.
- In high dimensions random points are all nearly equidistant; indexes survive only because real data has structure.
:::
