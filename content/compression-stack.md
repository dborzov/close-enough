---
title: "Compression is a stack"
kicker: The frame for Parts 3 to 6
goal: "PCA or vector quantization?" is like asking "a map or a car?" They do different jobs. Almost every practical compressor is the same four layers, and each layer exploits a different kind of structure.
---

## A question that dissolves

A natural first question about compressing embeddings: is [[PCA]] better than [[vector quantization]], or the other way round?

::: pull
PCA compresses nothing. Rotating the axes still leaves you storing 384 floats.

It saves space only once you *throw away* the small directions or *give them fewer bits*. That second step is quantization.
:::

So the question is never "PCA or VQ?" It is "which transform, and which quantizer after it?"

## Four layers

From JPEG and MP3 to Faiss indexes and neural codecs, practical compressors are built from the same four layers.

::: wide
| Layer | Question it answers | Tools | Structure it exploits | In this book |
|---|---|---|---|---|
| **1 · Transform**{.k-enc} | Which directions matter? | PCA / SVD, rotations (OPQ), DCT, learned encoders | Correlation between coordinates | [[@spectrum-and-bits]], [[@transforms]] |
| **2 · Quantize**{.k-book} | How do I turn numbers into a few bits? | Scalar (int8, int4, binary) or vector ([[k-means]], [[PQ]], [[RQ]], additive) | Limited precision that matters; clusters | [[@scalar-quantization]], Part 4, Part 5 |
| **3 · Predict**{.k-res} | Can I guess this from what I already have? | Previous vector, earlier coordinates, a coarse code | Order: sequences, neighbours | [[@prediction]] |
| **4 · Entropy-code**{.k-bits} | Common symbols deserve shorter codes | [[Huffman]], [[arithmetic coding]], [[ANS]] | Uneven probabilities | [[@entropy-coders]] |
:::

::: note The pattern in something you already use
JPEG is a fixed transform (the DCT), then scalar quantization with a table of step sizes, then Huffman coding. One tool per layer; layer 3 appears only for the block averages.
:::

## Lossy and lossless are the same stack

The difference is only where information is allowed to leak:

- **Lossy**: layer 2 discards information. Layers 1, 3 and 4 are there to make that loss land where it hurts least and to make the surviving symbols cheap.
- **Lossless**: nothing may be discarded, so layer 2 changes role. A quantizer's output becomes a *prediction*, and the exact difference is entropy-coded. Part 6 is about this.

## What each family is good at

::: cards
- **Transform + scalar**
  [[transform coding|Transform coding]]: rotate, give each coordinate its own number of bits, round. Near-optimal for bell-shaped data at about one bit per dimension and above. No search to encode.
- **Vector quantizers**
  Spend bits on whole vectors, so they can spend *a fraction of a bit* per coordinate, and they can sit on clusters. They win at very low rates.
- **Hybrids**
  [[OPQ]] is a rotation followed by product quantization. [[IVF]] with residual codes is a coarse vector quantizer followed by a fine one. Real systems are almost always hybrids.
:::

::: aside The two regimes
An index in RAM lives at 0.1 to 1 bit per dimension. An archive or a re-ranking tier lives at 4 to 16. Different regimes, different winners. [[@measured]] shows the crossover on real data.
:::

::: check
- Transform, quantize, predict, entropy-code: four layers, four kinds of structure.
- PCA is a layer-1 tool, VQ a layer-2 tool; they are combined, not compared.
- Lossless compression reuses the stack with the quantizer demoted to a predictor.
:::
