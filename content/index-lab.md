---
title: "The index lab"
kicker: Stage 2 · Try all four
goal: The same 1,600 points, four indexes, computed live in your browser. Turn the knobs and watch the trade every real system tunes.
---

::: widget ann-lab | Four indexes on one map
**Tap the map to move the query** Switch between brute force, LSH, IVF and a graph. In every mode the yellow dots are what the index returned, the rings are the true ten nearest, and blue marks what the index had to examine.
:::

::: try Four experiments
1. **IVF, `nprobe = 1`.** Move the query near a cell boundary. Recall drops: the missing neighbours are just across the line. Raise `nprobe` until they come back.
2. **LSH, 1 table.** Raise *bits per table* to 10. The bucket shrinks, the work drops and the neighbours vanish. Now add tables.
3. **Graph, `efSearch = 10`.** Find a query where the amber path stops short. Widen the search.
4. **For each mode,** find the cheapest setting that gives 10 out of 10. Which one touches the least data?
:::

## The trade-offs at a glance

::: wide
| Index | Core idea | Speed | Memory | Recall | Updates | Typical home |
|---|---|---|---|---|---|---|
| Flat (brute force) | Check everything | [slow at scale]{.bad} | full vectors | [exact]{.g} | trivial | under 1 M vectors, GPUs, re-ranking |
| k-d / RP trees | Split space into boxes | [fine in low d]{.o} | moderate | [drops in high d]{.o} | rebuild | geo data, Annoy |
| LSH | Hash so that neighbours collide | [fast]{.o} | [many tables]{.bad} | [needs many tables]{.o} | [easy]{.g} | dedup, streaming, theory |
| IVF | k-means cells, scan a few | [fast]{.g} | vectors + small overhead | [tunable]{.o} | [easy]{.g} | large corpora, object storage |
| PQ / IVF-PQ | Compress to bytes, compare codes | [fast]{.g} | [tiny]{.g} | [lossy; re-rank fixes it]{.o} | needs trained codebooks | billion scale, GPUs |
| HNSW | Layered neighbour graph | [fastest at high recall]{.g} | [vectors + links in RAM]{.bad} | [high]{.g} | [inserts fine, deletes hard]{.o} | default in vector DBs |
| DiskANN | Graph laid out for SSD | [fast]{.g} | [small RAM]{.g} | [high]{.g} | [harder]{.o} | billions on one node |
| ScaNN | Partition + ranking-aware quantization | [very fast]{.g} | [small]{.g} | [high]{.g} | batch rebuilds | Google products |
:::

::: qa So what is FAISS, exactly?
[[FAISS]] (Facebook AI Similarity Search, 2017) is a C++/Python *library* of index types: Flat, IVF, PQ, HNSW and their combinations, with GPU versions. It is the reference toolkit of the field.

It is *not* a database: no server, no metadata filters, no replication. Vector databases wrap ideas like these in storage, APIs, filtering and scaling. Some embed FAISS or hnswlib directly.

```python
import faiss
index = faiss.index_factory(768, "IVF4096,PQ64")  # 4096 k-means cells, 64-byte codes
index.train(sample)            # learn centroids and PQ codebooks
index.add(X)                   # encode and file every vector
index.nprobe = 16              # cells scanned per query
D, I = index.search(q[None, :], 10)
```
:::

## Two things every real system adds

- **[[re-ranking|Re-ranking]].** Fetch the top 100 with the cheap index, then re-score them with full-precision vectors or a [[cross-encoder]].
- **Filtering.** "Only documents this user can see, from 2025." Surprisingly hard to combine with graph search, and a large part of what differentiates vector databases.

::: check
- Every index has one knob that buys recall with work.
- Flat is exact and simple; IVF and PQ scale by partitioning and compressing; HNSW is fastest when RAM is plentiful.
- FAISS is a library of these pieces; a vector database is a product built around them.
:::
