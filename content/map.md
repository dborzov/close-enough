---
title: The whole map
kicker: Orientation
goal: Three jobs. Every term you have heard lives in exactly one of them, and knowing which one is most of the battle.
---

::: lede
When terms refuse to fall into a big picture, it is usually because they belong to different layers of one system and get mentioned in the same breath. "Gemma embeddings", "cosine", "HNSW", "FAISS", "Pinecone" and "two-tower" are each an answer to a *different* question.
:::

## Three boxes

Keep these three boxes in your head and every new word has a place to go.

::: cards three
- **1 · Turn things into vectors**
  *The question* How do we give every item coordinates so that close in space means similar in meaning?

  *Ideas* meaning from context · neural networks learn features · [[contrastive|contrastive training]] pulls matches together

  *Names you will meet* [[LSA]], [[word2vec]], BERT, Sentence-BERT, CLIP, E5, BGE, OpenAI `text-embedding-3`, `gemini-embedding`, EmbeddingGemma
- **2 · Find the nearest ones, fast**
  *The question* Given a query point, which of a billion stored points are closest, answered in milliseconds?

  *Ideas* a distance · partition the space · compress the points · navigate a graph

  *Names you will meet* [[kNN]], [[ANN]], [[LSH]], [[IVF]], [[PQ]], [[HNSW]], [[DiskANN]], [[ScaNN]], [[FAISS]]
- **3 · Build something with it**
  *The question* Where do the neighbours go next, and how does this fit into a product?

  *Ideas* retrieve cheaply, rank expensively · mix with keyword search · filters, freshness, cost

  *Names you will meet* semantic search, [[RAG]], [[two-tower]] recommenders, [[DLRM]], Elasticsearch, pgvector, Pinecone, Qdrant, Milvus
:::

## The entire pipeline in nine lines

Everything in this book is about making one of these lines better, cheaper or faster.

```python The naive version of all three stages | numpy
# Stage 1: the same model embeds the corpus and the query
X = embed(documents)          # N texts  -> (N, d) matrix, each row has length 1
q = embed([query])[0]         # one vector of length d

# Stage 2, the naive version: one dot product per document
scores = X @ q                # cost grows with N * d
best = scores.argsort()[::-1][:5]

# Stage 3: use the neighbours (here: retrieval-augmented generation)
answer = llm(query, context=[documents[i] for i in best])
```

::: pull
`X` is too big to keep. `X @ q` is too slow to run. Most of this book is about those two facts.

Part 2 attacks the second one by not looking at most of `X`. Parts 3 to 6 attack the first by storing `X` in far fewer bits.
:::

## A fourth box hiding inside the second

Storing the vectors turns out to be its own subject. A [[vector database]] spends most of its engineering on it, and the tools have a structure of their own:

| Layer | Question it answers | Tools | Where |
|---|---|---|---|
| **Transform** | Which directions matter? | [[PCA]], rotations, learned encoders | [[@spectrum-and-bits]] |
| **Quantize** | How do I turn numbers into a few bits? | scalar ([[int8]], binary) or vector ([[kmeans|k-means]], PQ, [[RQ]]) | Part 4 |
| **Predict** | Can I guess this from what I already have? | previous vector, neighbouring coordinates | [[@prediction]] |
| **Entropy-code** | Common symbols deserve short codes | [[Huffman]], [[arithmetic coding]], [[ANS]] | [[@entropy-coders]] |

::: aside One rhyme to watch for
Attention inside every LLM performs a soft version of stage 2 on every token: a query vector is compared with stored key vectors and the most similar ones contribute. [[@rhymes]] ties this back to the [[KV cache]].
:::

::: check
- Stage 1 makes vectors, stage 2 finds near ones, stage 3 uses them.
- A term is easier to learn once you know which stage it belongs to.
- Compression is a stack of four layers that sits inside stage 2.
:::
