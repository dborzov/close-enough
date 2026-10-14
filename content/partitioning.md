---
title: Cut the space into pieces
kicker: Stage 2 · Trees, hashing, clustering
goal: Three ways to partition space, in the order they were invented. Each one fixes the previous one's blind spot, and the last one wins by looking at the data.
---

## Family 1 · Trees: boxes

A [[k-d tree]] (Bentley, 1975) cuts space along one coordinate at a time, so a query only descends into nearby boxes.

- **Excellent in 2 to 10 dimensions**: maps, geometry, games.
- **Hopeless at 768**: with one cut per level, a tree over a billion points uses only about 30 of the 768 coordinates. The query's neighbours end up spread across most boxes ([[@closeness]]).

Random projection trees (Spotify's Annoy, 2013) split along random directions instead and build a forest of them. Good enough for music recommendations at the time; now mostly superseded.

## Family 2 · Hashing: make collisions mean closeness

A normal hash function scatters similar inputs. [[lsh|Locality-sensitive hashing]] (Indyk and Motwani, 1998) does the opposite: it is designed so that *close points are likely to land in the same bucket*.

For cosine similarity the classic version is Charikar's [[SimHash]]. Each bit records which side of a random hyperplane the vector falls on.

```python SimHash in three lines | numpy
R = np.random.randn(d, 16)              # 16 random hyperplanes through the origin
signature = lambda v: tuple(v @ R > 0)  # 16 bits
# For vectors at angle theta, each bit differs with probability theta / pi.
```

Similar vectors share most bits and so share a bucket. Several tables catch the near-misses.

::: aside Why this gets a whole part later
LSH needs no training and comes with proofs. On dense embeddings it loses to the next family as an *index*, yet the same random bits turn out to be an excellent *compressor*. Part 5 measures both.
:::

## Family 3 · Clustering: learn where the data is

The insight that took over: real data is clumpy, so *learn* the partition from the data.

::: steps
1. Run [[k-means]] to get, say, 4,096 centroids.
2. Assign every vector to its nearest centroid. That gives 4,096 lists.
3. At query time, find the few centroids closest to the query.
4. Scan only those lists.
:::

This is the [[ivf|inverted file index]] (IVF), named after the inverted index of keyword search. The knob is [[nprobe]]: how many lists to scan.

$$ \text{work per query} \;\approx\; \underbrace{K}_{\text{compare to centroids}} \;+\; \underbrace{\texttt{nprobe}\cdot \tfrac{N}{K}}_{\text{scan the lists}} $$

With $K \approx \sqrt{N}$ both terms are about $\sqrt N$: a thousand-fold saving at a million vectors.

::: measured Random cuts versus learned cuts
On this book's {{lsh_n|,}} database passages, comparing about {{ix_ivf256_16_frac|.0%}} of the database with each query:

- LSH with 16 tables of 8 bits finds **{{ix_lsh_8_16_rec|.0%}}**{.k-res} of the true top 10.
- IVF with 256 lists finds **{{ix_ivf256_16_rec|.0%}}**{.k-dec}.

Random hyperplanes ignore where the data is. k-means does not. The full comparison is on [[@lsh-in-practice]].
:::

## The cluster id is already compression

Notice what IVF did besides routing. Knowing that a vector is in list 2,317 of 4,096 tells you 12 bits about where it is. Store only the difference from the centroid (the [[residual]]) and that difference is smaller and easier to compress than the vector was.

That observation, taken seriously, is Part 4.

::: check
- Trees cut along coordinates and stop pruning in high dimensions.
- LSH cuts at random: no training, provable, but blind to the data.
- IVF cuts where k-means says the data is. `nprobe` trades speed for recall.
:::
