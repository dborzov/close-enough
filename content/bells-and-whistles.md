---
title: Bells and whistles
kicker: Add-ons
goal: With the core in place, these are the add-ons you will meet in real systems. Each one attacks one cell of the scorecard.
---

## Before the quantizer

::: cards
- **Shape the data first**
  **Centre** it, so that codebooks do not spend capacity on the mean. For PQ, **rotate**: a learned rotation ([[OPQ]]) or even a random one balances variance across blocks. **Reduce dimension** with [[PCA]] or a [[Matryoshka]]-trained model. That cuts encoder cost; cutting too far hurts recall ([[@measured]]).
- **Divide first: IVF + residuals**
  Run a VQ with thousands of centroids and encode each vector's [[residual]] from its centroid. Queries scan only the closest lists, and residuals are smaller and more uniform than raw vectors, so the fine codes get more accurate too.
:::

## Inside the quantizer

::: cards
- **Mix the families: product of additive**
  Split the dimensions into 2 to 4 blocks, as in PQ, and run an additive quantizer inside each. Encoding is cheaper because each search is smaller, while each block keeps free-direction codebooks. Faiss calls these `PRQ` and `PLSQ`.
- **Smaller codebooks, faster scans**
  $K = 16$ with twice as many codebooks costs the same bits as $K = 256$, loses a little accuracy, and enables SIMD [[fast-scan]].
- **Handle the norm**
  Additive codes need $\lVert\hat x\rVert^2$ for L2 search: store it as a float, quantize it to 4 to 8 bits, or give it a tiny codebook. For normalized embeddings with inner-product search, skip it.
- **Quantize for the ranking, not the vector**
  [[ScaNN]]'s insight: an error *parallel* to a vector changes its inner products with queries that are close to it; an error *perpendicular* to it mostly does not. So penalise the parallel part more when choosing codewords. Same codebooks, a different loss, better recall.
:::

## After the quantizer

::: cards
- **Re-ranking and refinement**
  Retrieve a shortlist with the compact code, then re-score it with a finer code or the original vectors (`RFlat` in Faiss strings). This is why 16 bytes in RAM can be enough.
- **Compress the ids too**
  An index also stores an id per vector, often 4 to 8 bytes: as much as the code. Inside an IVF list, sorted ids can be delta-coded and entropy-coded. Marginalia's ids are (book, offset), and neighbouring windows often land in the same list, so the gaps are small.
- **Compress the codes**
  The stored indices are not uniformly used. An entropy coder shrinks them further, at the price of fast scans. → [[@code-entropy]]
:::

## Neural codebooks

[[QINCo]] (Huijben et al., 2024) keeps the residual structure but *generates* each stage's codebook with a small network conditioned on the reconstruction so far. In this book's terms, codebook $m$ depends on the choices $i_1 \dots i_{m-1}$, so later codebooks can specialise.

- Error drops substantially.
- The decoder now runs a network per step, so it re-ranks shortlists; it does not scan.
- QINCo2 (2025) improves the encoding search with candidate pre-selection and beam search, and pairs the codes with a fast approximate decoder for the first pass.

## Same idea, other fields

Residual vector quantization is the bottleneck of neural audio codecs such as SoundStream and EnCodec, which train the codebooks end to end. They randomly drop later quantizers during training so that one model serves many bitrates: the progressive property of [[@residual-quantization]] put to work.

Recommenders reuse it again as [[semantic IDs]] ([[@the-funnel]]), and LLM weight compression borrows additive quantization directly (AQLM).

::: check
- Centre, rotate and partition before quantizing; re-rank and compress ids after.
- Mixed families (product of additive, 4-bit fast-scan) trade a little accuracy for encoding or scanning speed.
- Neural codebooks have the lowest error and the most expensive decoder.
:::
