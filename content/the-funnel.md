---
title: The funnel
kicker: Stage 3 · System design at scale
goal: Do big feeds use vector search, or does a ranking model replace it? Both, in different stages. No model can score billions of items per request, so every large system is a funnel.
---

## Cheap narrows, expensive orders

::: svg funnel
**The funnel** Cheap methods narrow billions of items to thousands; expensive methods order the thousands. ANN lives in the first stage.
:::

::: cards three
- **Retrieval**
  Several candidate sources in parallel: a [[two-tower]] model with an ANN index, plus "accounts you follow", "watched together", trending. Each returns hundreds to thousands. Microseconds per item.
- **Ranking**
  A heavy model ([[DLRM]]-style, or a transformer over your history) scores each candidate with rich *cross features*: this user's history with this creator, at this time of day. Milliseconds per batch.
- **Re-ranking**
  Diversity (not ten cat videos in a row), freshness, integrity filters, ads blending, business rules. Produces the final screen.
:::

::: qa Why can't the ranking model do retrieval directly?
The ranker computes score = $f(\text{user}, \text{item}, \text{context})$ with features that mix the user and the item. Nothing can be precomputed per item, so every item must run through the network for every request.

A two-tower model deliberately restricts itself to score = $u \cdot v$, with $u$ depending only on the user and $v$ only on the item. That is a weaker model, but $v$ can be computed ahead of time for every item and indexed, and the search becomes [[MIPS]].

**Retrieval trades accuracy for indexability; ranking spends the accuracy back on a small set.**
:::

It is the same bargain as a [[bi-encoder]] with a [[cross-encoder]] in text search, and the same as a compressed index with exact [[re-ranking]] in Part 4.

## Generative retrieval

The newer twist: items get [[semantic IDs]], short sequences of codes produced by [[residual quantization]] of their embeddings, and a transformer *generates* the IDs of items to recommend, much as an LLM generates tokens.

That is Part 4's idea of turning a vector into codes, reused as a vocabulary.

## Niches by scale

| Vectors | Typical use | What people actually do |
|---|---|---|
| 10³–10⁵ | prototype, personal notes, a small app | NumPy brute force, Chroma, sqlite-vec. No index needed. |
| 10⁵–10⁷ | most company RAG, product search | HNSW in RAM: pgvector, Qdrant, Weaviate, Elasticsearch. Often hybrid with BM25 and a re-ranker. |
| 10⁷–10⁹ | large catalogues, marketplaces, big archives | Quantization (int8, binary, PQ), sharding, DiskANN-style SSD indexes. Filtering becomes a design topic. |
| 10⁹–10¹¹ | web search, social feeds, ads, training-set dedup | Custom serving systems, IVF-PQ on GPUs, ScaNN or DiskANN, aggressive compression, frequent rebuilds. |

Marginalia, at 3 × 10⁸, sits in the third row, which is why its story has been about compression.

## What bites, in the order teams discover it

::: steps
1. **Freshness.** New items need vectors and index entries within minutes.
2. **Filters.** ANN plus "in stock, in Canada" without killing recall.
3. **Model upgrades.** A new embedding model means re-embedding everything; vectors from two models are not comparable. This is the argument for Marginalia's lossless archive of *text offsets and vectors*.
4. **Cost.** RAM first, then GPUs.
5. **Evaluation.** Recall against what? You need labelled relevance, not just ANN recall.
:::

::: check
- Large systems retrieve cheaply with an indexable model, then rank expensively.
- Two-tower models are restricted to a dot product precisely so that item vectors can be indexed.
- The right index depends mostly on how many vectors you have.
:::
