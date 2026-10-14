---
title: "Interlude: seventy years in one page"
kicker: History
goal: Two groups worked on two problems for decades and barely spoke. Around 2016 to 2020 the threads met, and industry kept pulling both forward.
---

One group wanted computers to have a sense of *meaning*: to know that "car" and "automobile" are the same thing. Another, mostly in signal processing and algorithms, wanted to find the *closest point* in a big pile of points without checking every one.

::: widget timeline narrow | Seventy years of vector search
**Filter by thread** [Representations]{.k-book} is the story of Part 1. [Search algorithms]{.k-vec} is Parts 2 to 5. [Industry]{.k-dec} is Part 7.
:::

## Three things to notice

1. **The oldest entry on the search side is a compression result.** Lloyd's 1957 quantizer for telephone signals became [[k-means]], which is the engine inside [[IVF]] and [[PQ]] today. Search and compression have been the same subject from the start.
2. **Embeddings existed in industry before deep learning.** The Netflix Prize (2006 to 2009) was won by matrix factorization: users and films as short vectors whose dot product predicts a rating.
3. **The 2023 boom was one use case.** [[HNSW]] was published in 2016 and FAISS in 2017. What changed in 2023 was that chatbots needed [[rag|retrieval]].

::: check
- Two threads: how to make vectors that carry meaning, and how to search and store vectors.
- They merged when pretrained transformers made dense retrieval beat keyword search.
:::
