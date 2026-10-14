---
title: Finding neighbours without checking everyone
kicker: Stage 2 · The problem
goal: A database index answers "where is exactly this key?" Nearest-neighbour search has no exact key. The whole field rests on one trick and one honest measurement.
---

## Not a lookup

A normal database index (a hash table or a B-tree) answers *where is exactly this key?* in constant or logarithmic time. Nearest-neighbour search asks a different question. There is no exact key, only "closest".

::: key The one trick
Look at a small, well-chosen fraction of the data and hope the true neighbours are in it.
:::

When we allow small mistakes in exchange for speed, [[kNN]] becomes [[ann|approximate nearest-neighbour]] search. That is what every [[vector database]] actually does.

## The honest measurement

The quality measure is [[recall@k]]:

$$ \text{recall@}k \;=\; \frac{\lvert\, \text{returned top-}k \;\cap\; \text{true top-}k \,\rvert}{k} $$

Of the true 10 nearest, how many did we return? A recall of 0.95 means one query in two is missing one of its ten true neighbours.

::: stats
- **0.1–5%** of the data touched per query, typically
- **90–99%**{.k-dec} recall for that work
- **~100×**{.k-q} faster than brute force at a billion vectors
:::

::: qa Can we get O(1) lookups, like a hash table?
Not for exact nearest neighbours in high dimensions; that is believed to be impossible in general. What we get is *sublinear*:

- [[LSH]] has provable bounds of the form $O(N^{\rho})$ with $\rho < 1$ ([[@lsh-amplification]]).
- Graph indexes behave roughly like $O(\log N)$ hops in practice.

Hashing does give O(1) per bucket lookup, but you need many hash tables to avoid missing neighbours, so the total is not constant.
:::

## Four families

Each family is a different answer to *how do I pick which fraction to look at?*

::: cards four
- **Trees**
  Split the space into boxes and descend into the boxes near the query. Great in a few dimensions. → [[@partitioning]]
- **Hashing**
  Design hash functions so that close points collide. Simple and data-independent. → [[@partitioning]], then all of Part 5
- **Clustering and quantization**
  Learn where the data actually is, file each vector under its cluster, and compress what you store. → [[@partitioning]], then Parts 3 and 4
- **Graphs**
  Link every vector to its near neighbours and walk downhill toward the query. → [[@graphs]]
:::

Production systems combine them: a partition to narrow down, compressed codes to scan cheaply, and exact vectors to [[re-rank]] a shortlist.

::: check
- ANN trades a little recall for a lot of speed by examining a small fraction of the data.
- Recall@k is measured against exact brute-force results.
- Trees, hashing, clustering and graphs are four ways of choosing the fraction.
:::
