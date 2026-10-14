---
title: Where you see this in practice
kicker: Stage 3 · Products
goal: Each use case has the same shape. What it was before embeddings, what it is now, and what forced the change. Then the landscape of tools, sorted by what they actually are.
---

## Six use cases

::: cards
- **Document and web search**
  *Then* Keyword matching with [[BM25]] in Lucene, Solr and Elasticsearch; hand-made synonym lists.

  *Now* [[hybrid search|Hybrid]]: BM25 and dense vectors side by side, merged (often with reciprocal rank fusion), then a [[cross-encoder]] re-ranks the top results.

  *Why* Pretrained transformers made dense retrieval win on paraphrased questions. Keywords still win on product codes, names and rare terms, so neither replaced the other.
- **RAG: chat over your documents**
  *Then* Did not exist in this form.

  *Now* Split documents into chunks, embed them, store them in a [[vector database]], retrieve the top k for each question, paste them into the prompt.

  *Why* LLMs know nothing private or recent and cannot fit everything into context. The 2023 vector-database boom was mostly this.
- **Recommendations**
  *Then* Collaborative filtering and matrix factorization: a user vector and an item vector whose dot product predicts a rating. These were already embeddings.

  *Now* [[two-tower|Two-tower]] networks produce user and item vectors; ANN retrieves candidates; a heavy model ranks them ([[@the-funnel]]).

  *Why* Deep towers can use text, images, history and context, and still end in a dot product you can index.
- **Image and multimodal search**
  *Then* Hand-designed local descriptors (SIFT) and "bags of visual words". This is the problem [[PQ]] and FAISS were built for: the classic benchmarks are called SIFT1B and Deep1B.

  *Now* CLIP-style models put images and text in one space: search photos by sentence, find similar products from a photo.

  *Why* Learned features beat hand-made ones once deep networks arrived.
- **Deduplication**
  *Then* [[MinHash]] and [[SimHash]] over word shingles (AltaVista, Google's crawler).

  *Now* Still MinHash-LSH for text overlap, often followed by embedding-based "semantic dedup" to remove paraphrased copies from LLM training sets.

  *Why* Overlap is cheap and reliable at trillions of tokens; embeddings catch what overlap misses.
- **Everything else with "find similar"**
  Face recognition, fraud and anomaly detection (what is unusually far from everything?), ad matching, code search, product matching across catalogues, music similarity, support-ticket routing, clustering and topic discovery.
:::

## The tool landscape

::: wide
| Tool | What it is | Algorithms inside | Story |
|---|---|---|---|
| Lucene / Elasticsearch / OpenSearch / Solr | search engines | BM25 inverted index; HNSW for vectors | The keyword incumbents; added vector search around 2022 and now do hybrid. |
| Annoy | library (Spotify, 2013) | random projection trees | An early favourite; Spotify itself moved to Voyager (HNSW) in 2023. |
| FAISS | library (Meta, 2017) | Flat, IVF, PQ, RQ, HNSW, GPU | The reference toolkit; inside many other systems. |
| hnswlib | library | HNSW | The reference HNSW from its authors; widely embedded. |
| ScaNN | library (Google, 2020) | partitioning + anisotropic quantization | Powers Google's managed vector search. |
| DiskANN | library (Microsoft, 2019) | Vamana graph on SSD | Used in Bing and Azure databases. |
| Milvus, Qdrant, Weaviate, Chroma | open-source vector DBs | mostly HNSW + quantization; Milvus also IVF, DiskANN, GPU | Born 2019 to 2022; boomed with RAG in 2023. |
| Pinecone | managed vector DB | proprietary | The best-known managed option. |
| pgvector | Postgres extension | IVFFlat, HNSW | "Just use Postgres": vectors next to your rows. Very popular at moderate scale. |
| Vespa | search + ranking engine | HNSW, BM25, ML ranking | Built for the retrieve-then-rank pattern. |
| turbopuffer, LanceDB, S3 Vectors | object-storage-first | clustering-style indexes on cheap storage | The cost wave: slower per query, far cheaper per vector. |
| cuVS (CAGRA) | NVIDIA GPU library | GPU graphs and IVF-PQ | Building and searching huge indexes on GPUs. |
:::

For the embedding models themselves: hosted APIs (OpenAI `text-embedding-3`, Google `gemini-embedding`, Cohere, Voyage) and open weights (all-MiniLM, BGE, E5, GTE, Nomic, Qwen3-Embedding, EmbeddingGemma). The `sentence-transformers` library is the usual way to run the open ones.

::: aside Library, engine, or database?
A *library* (FAISS, hnswlib) is an index you call from your own process. An *engine* (Lucene, Vespa) adds text search and ranking. A *database* adds storage, filtering, replication and an API. Most confusion about "which vector DB" dissolves once you ask which of the three you need.
:::

::: check
- Search, RAG, recommendations, multimodal search and dedup all reduce to "embed, then find neighbours".
- Keyword and vector search coexist; hybrid plus re-ranking is the norm.
- Tools differ mainly in whether they are a library, an engine or a database.
:::
