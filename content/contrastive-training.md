---
title: The secret ingredient
kicker: Stage 1 · Where vectors come from
goal: Train directly for the thing you want. Show the model pairs that should match, and make everything else in the batch the wrong answer.
---

## Pull together, push apart

Sentence-BERT (2019) showed the fix for the problem on the previous page. Give the model pairs that *should* match (a question and its answer, a title and its article, a caption and its image), make their vectors close, and push everything else away.

::: svg contrastive | Contrastive training
**Contrastive training** The query pulls its positive closer and pushes negatives away. The woodworking passage is a [[hard negative]]: it shares the word "router" but answers a different question.
:::

## The loss, in four lines

```python InfoNCE, the loss behind nearly every modern embedding model | numpy
# q, p: (B, d) normalized embeddings of B queries and their matching passages
logits = (q @ p.T) / 0.05            # B x B similarity matrix, sharpened by a temperature
labels = np.arange(B)                # the right answer for row i is column i (the diagonal)
loss = cross_entropy(logits, labels) # classify "which passage is mine?" among B candidates
```

It is literally a classification over the batch: *which of these B passages belongs to my query?*

$$ \mathcal{L} = -\frac{1}{B}\sum_{i=1}^{B} \log \frac{\exp(\kq{q_i}\cdot \kvec{p_i}/\tau)}{\sum_{j=1}^{B}\exp(\kq{q_i}\cdot \kvec{p_j}/\tau)} $$

Three knobs follow directly from the formula:

- **Batch size $B$.** More candidates per question make a harder, more informative game.
- **Temperature $\tau$.** Small values make the model care about near-misses.
- **Hard negatives.** Passages that look relevant but are not teach the fine distinctions that random negatives never test.

The same recipe trains image–text models (CLIP), face recognition (FaceNet) and recommender towers.

::: aside Where the pairs come from
Hundreds of millions of noisy title–body and question–answer pairs scraped from the web, then smaller curated sets (search logs, entailment datasets), and increasingly **synthetic pairs written by LLMs**: give a big model a passage and ask it for a query that the passage answers.
:::

## What the big labs ship today

Since about 2023 the recipe has converged:

::: key The modern recipe
Start from a strong pretrained LLM, then fine-tune it [[contrastive|contrastively]] into an embedder.
:::

- Google describes `gemini-embedding-001` as initialized from Gemini, with mean pooling, a projection, and contrastive training on large mixes that include synthetic data.
- **EmbeddingGemma** (2025, about 300 M parameters) starts from a Gemma 3 backbone switched to bidirectional attention, trained contrastively and by distillation from a larger embedder.
- Open models such as E5-Mistral, NV-Embed and Qwen3-Embedding follow similar recipes. Some pool the last token instead of the mean.

Model cards change between releases, so check the card for exact details.

## Four terms from every model card

::: cards
- **Task prefixes**
  `"query: …"` versus `"passage: …"`. A search query and the document that answers it look different, so the model is told which side it is embedding. This is *asymmetric* retrieval.
- **[[matryoshka|Matryoshka]] dimensions**
  Trained so that the first 256 of 3,072 numbers already carry most of the meaning. Truncate to save storage. It is a learned version of the idea on [[@spectrum-and-bits]].
- **[[Bi-encoder]] versus [[cross-encoder]]**
  Embedders encode query and document separately, which is what makes precomputing and indexing possible. A cross-encoder reads both together: far more accurate, far too slow for a million documents, so it re-ranks the top 50 to 100.
- **[[MTEB]]**
  The standard leaderboard, comparing models across retrieval, clustering and classification.
:::

::: check
- Contrastive training makes distance mean relevance, by classifying the right partner among a batch.
- Batch size, temperature and hard negatives are the levers.
- Modern embedders are LLM backbones fine-tuned this way; a bi-encoder is what makes indexing possible.
:::
