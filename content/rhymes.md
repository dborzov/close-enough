---
title: The same math in other places
kicker: Rhymes
goal: Once you see "compare a query vector to many stored vectors and use the closest", you see it everywhere. The most important instance sits inside every LLM.
---

## Attention is a soft nearest-neighbour lookup

In a transformer the current token produces a [query]{.k-q}. Every earlier token has stored a [key]{.k-book} and a [value]{.k-dec}. The query is compared with all keys by dot product, a softmax turns the scores into weights, and the output is the weighted mix of values.

$$ \text{out} \;=\; \sum_i \underbrace{\frac{\exp(\kq{q}\cdot \kbook{k_i}/\sqrt d)}{\sum_j \exp(\kq{q}\cdot \kbook{k_j}/\sqrt d)}}_{\text{weight of key } i}\ \kdec{v_i} $$

Replace "softmax" with "take the top 1" and you have exactly a nearest-neighbour lookup that returns a stored payload. The [[KV cache]] is the datastore.

```python Attention | numpy
scores = K @ q / np.sqrt(d)   # similarity of the query to every stored key (MIPS!)
w = softmax(scores)           # a soft version of "pick the nearest"
out = w @ V                   # blend of the values of the closest keys
```

::: widget attention | Attention as soft nearest neighbour
**Drag the query arrow, then lower the temperature** Arrow thickness is attention weight. At low temperature one key takes nearly all the weight: hard nearest-neighbour retrieval. When the weight is concentrated in a few keys you only need to *find* those few, which is an ANN problem.
:::

## Similar, and different

| | Vector database | Attention over the KV cache |
|---|---|---|
| Stored items | documents; fixed, updated occasionally | previous tokens; appended every step |
| Count | millions to billions | thousands to millions, per layer, per head |
| Similarity | cosine on normalized vectors | scaled dot product (unnormalized: MIPS) |
| Result | a hard top-k list | a soft weighted average of all values |
| Vectors learned | by a separate, frozen embedding model | jointly, by the network that uses them |
| Queries | one per user request | one per token, per layer, per head |

## Where the two worlds have merged

::: cards
- **ANN inside attention**
  Reformer (2020) hashed queries and keys with [[LSH]] so that each token attends only within its bucket. Memorizing Transformers kept old keys and values in an external store and fetched the top k. Recent long-context methods select or sample the KV entries most likely to matter, using clustering, graphs or LSH from Parts 2 and 5.
- **Compressing the KV cache**
  The KV cache is often the memory bottleneck of serving LLMs, and the toolbox is Parts 3 and 4 again: quantize keys and values to 2 to 4 bits, or store a low-rank latent instead of full keys and values. PCA and PQ under other names.
- **Hidden states as search keys**
  kNN-LM uses the LLM's final hidden state as a query into a FAISS index of (hidden state → next token) pairs and blends the neighbours' next tokens into the prediction.
- **Directions in hidden states**
  Interpretability treats hidden states the way [[@geometry-of-embeddings]] treats embeddings: linear probes test whether a concept is a direction, steering vectors add one, sparse autoencoders split [[superposition|superposed]] features apart.
- **Quantization everywhere**
  [[k-means]] (Lloyd, Bell Labs, 1957) → vector quantization in audio and image codecs → PQ for search → VQ-VAE and residual-VQ tokenizers in neural audio codecs → [[semantic IDs]] for recommenders → additive quantization of LLM weights.
- **Low-rank factorization**
  LSA's SVD, matrix-factorization recommenders, word2vec's implicit factorization, LoRA fine-tuning, latent attention. All say: a big table of interactions can be reproduced by dot products of short vectors.
- **Sketching**
  The [[Johnson–Lindenstrauss lemma]], [[SimHash]], [[MinHash]], Bloom filters, Count-Min: tiny random summaries that answer approximate questions.
- **Compression as modelling**
  Part 6's lesson, that code length is $-\log_2 q$, is the same identity that makes a language model's loss a compression rate. A better predictor *is* a better compressor.
:::

::: check
- Attention is a soft nearest-neighbour lookup over keys, with the KV cache as its datastore.
- LSH, clustering and quantization are being applied inside transformers for long contexts and smaller caches.
- Quantization, low-rank factorization and sketching recur across search, codecs, recommenders and LLMs.
:::
