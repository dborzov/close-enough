---
title: Random cuts against learned cuts
kicker: LSH as an index, measured
goal: The theory predicted LSH would struggle on these vectors. Here is the measurement, the standard fixes, the other LSH families, and the jobs where hashing is still the right tool.
---

## The measurement

Same database, same queries, three kinds of index. The x axis is how much of the database each query had to be compared with; the y axis is how many of the true top 10 were found.

::: widget lsh-frontier
**Up and to the left is better** Each blue curve is LSH with a fixed number of bits per table, running from 1 table to 64. Pink is multi-probe LSH. Green is IVF, the k-means partition of [[@partitioning]], with its `nprobe` raised from 1 to 32.
:::

::: stats
- **{{ix_lsh_8_16_rec|.0%}}**{.k-res} recall for LSH (k = 8, 16 tables) at {{ix_lsh_8_16_frac|.0%}} of the database
- **{{ix_mp_12_16_rec|.0%}}**{.k-enc} multi-probe LSH (k = 12, 16 tables) at {{ix_mp_12_16_frac|.0%}}
- **{{ix_ivf256_16_rec|.0%}}**{.k-dec} IVF with 256 lists, `nprobe` 16, at {{ix_ivf256_16_frac|.0%}}
:::

At equal work, the learned partition finds about twice as many neighbours, with one table instead of sixteen.

## Why learned cuts win

::: cols
**Random hyperplanes cut through clusters.** A hyperplane chosen without looking at the data is as likely to slice a tight group of related passages in half as to pass between two groups.

**k-means puts boundaries in the gaps.** Its cells follow the density of the data, so a query's neighbours are usually in its own cell or the next one over.
:::

This is the same lesson as PQ against OPQ and RQ in Part 4: structure that is *learned from the data* beats structure that is imposed on it.

## The standard fixes

::: cards
- **[[multi-probe|Multi-probe]]**
  A query whose projection onto some hyperplane is close to zero was nearly on the other side. So also look in the buckets you get by flipping the least certain bits. One table then does the work of several, and memory drops by the same factor.
- **Data-dependent hashing**
  Learn the hyperplanes: PCA directions, k-means boundaries, or trained hash functions. At that point you are doing quantization under another name, and you have given up the "no training" advantage.
- **Centre and whiten first**
  SimHash cuts through the origin. If the data sits in a cone off to one side ([[anisotropy]]), most random hyperplanes miss it entirely and the bits are wasted. Subtract the mean before hashing.
:::

## Other families for other distances

| Family | Similarity it is sensitive to | One hash | Used for |
|---|---|---|---|
| [[SimHash]] | angle / cosine | sign of a random projection | text and embedding dedup, binary sketches |
| p-stable (E2LSH) | Euclidean distance | $\lfloor (r\cdot x + b)/w \rfloor$ with Gaussian $r$ | L2 search |
| Cross-polytope | angle | nearest signed axis after a random rotation | the best known ρ for angles; FALCONN |
| [[MinHash]] | Jaccard overlap of sets | minimum of a random hash over the set's elements | near-duplicate documents, training-set dedup |

::: aside MinHash in one line
For two sets $A$ and $B$, the probability that their minimum hash values coincide is exactly $|A\cap B| / |A\cup B|$. It has the same structure as SimHash, with Jaccard similarity in place of $1-\theta/\pi$.
:::

## Where hashing is still the right tool

::: cards four
- **Near-duplicate detection**
  Duplicates have $p_1 \approx 1$, so ρ is near 0 and a handful of tables finds essentially all of them. MinHash-LSH over word shingles is still how web crawls and LLM training sets are deduplicated.
- **Streaming and churn**
  A new vector is hashed and inserted in microseconds, with no retraining and no rebuild. Deletes are just as easy.
- **No training data, or shifting data**
  A learned partition fitted to last month's vectors degrades when the distribution moves. Random hyperplanes do not care.
- **Guarantees and sampling**
  LSH gives *probabilities* you can reason about. That makes it useful for estimating sums over neighbours, as in LSH-based sampling for sparse attention ([[@rhymes]]).
:::

```score LSH AS AN INDEX
bad recall per unit of work | about half of IVF here
good build | no training, instant inserts
bad memory | L pointers per vector
good guarantees | provable, data-independent
```

::: check
- On real embeddings, IVF finds roughly twice the neighbours of LSH for the same work.
- Multi-probe trades tables for extra bucket probes; data-dependent hashing turns into quantization.
- LSH remains the tool for near-duplicates, streaming inserts and settings without training data.
:::
