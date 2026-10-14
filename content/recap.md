---
title: The whole thing, and where to go next
kicker: Wrap-up
goal: Seven sentences, the measured numbers on one card, a learning path that adds detail without losing the map, and the papers worth your time.
---

## Seven sentences

::: lede
Meaning can be learned from context, and a neural network trained contrastively turns any item into a point where nearness means relevance.
:::

Searching those points is the nearest-neighbour problem, which high dimensions make hard, so we trade a little accuracy for a lot of speed.

The tricks are to partition the space (hashing, clustering), compress the points (quantization), or navigate between them (graphs), and production systems combine all three.

Compression is a stack: a transform says which directions matter, a quantizer turns them into bits, prediction uses what the decoder already has, and an entropy coder prices what is left.

At a fraction of a bit per dimension, sums of small codebooks give a huge implicit codebook for the price of a hard encoding problem; at a bit per dimension and above, a rotation and a rounding do as well.

When every bit must come back, the job is a probability model: for embeddings, a bell curve per coordinate, a triangular predictor and the previous vector get within a rounding error of what linear methods can do.

And the same query–key similarity sits at the heart of attention, which is why search, compression and language models keep borrowing each other's tools.

## The numbers on one card

All on {{d}}-dimensional MiniLM embeddings of held-out books.

::: stats
- **{{pr|.0f}}**{.k-vec} effective dimensions out of {{d}}
- **{{lag1|.2f}}**{.k-vec} cosine between consecutive windows
- **{{pq_err|.2f}} → {{rq_err|.2f}} → {{lsq_err|.2f}}**{.k-book} relative error at 64 bits: PQ → RQ → LSQ
- **{{sw_scalar_3072_rec|.2f}}**{.k-dec} recall@10 with plain int8
- **{{sk_rot_asym_384_100|.2f}}**{.k-code} recall@10 from 48-byte sign sketches, re-ranking 100
- **{{ix_ivf256_16_rec|.0%}} vs {{ix_lsh_8_16_rec|.0%}}**{.k-q} recall of IVF vs LSH at equal work
- **{{fp32_shuffle_saving|.0%}}**{.k-res} the most a lossless coder saves on float32
- **{{ld_temporal_chol_saving|.0%}}**{.k-bits} saved on exact int8 with the full model
:::

## A learning path

::: steps
1. Embed 1,000 sentences with `sentence-transformers`, search by brute-force NumPy, and look at the failures. You will feel what the model thinks "similar" means.
2. Train a tiny word2vec on a small corpus. Watch the analogy directions appear.
3. Write the InfoNCE loss and fine-tune a small encoder on question–answer pairs. Compare retrieval before and after.
4. In FAISS, index a million vectors as Flat, IVF, PQ, IVF-PQ and HNSW. Plot recall@10 against queries per second. Then browse ann-benchmarks.com.
5. Compute the spectrum of your own embeddings and run the water-filling allocation of [[@spectrum-and-bits]] on it.
6. Write an int8 lossless coder: a Gaussian per coordinate and an off-the-shelf range coder. Add triangular prediction. Check your numbers against [[@codec-big-picture]].
7. Revisit attention as key–value retrieval: kNN-LM, Memorizing Transformers, KV-cache compression.
:::

## Further reading

::: cols
#### Foundations

- Gray and Neuhoff, "Quantization", IEEE Trans. Information Theory, 1998. The survey.
- Goyal, "Theoretical Foundations of Transform Coding", 2001.
- Cover and Thomas, *Elements of Information Theory*: rate–distortion.
- Sayood, *Introduction to Data Compression*: all four layers, readable.
- Gersho and Gray, *Vector Quantization and Signal Compression*.

#### Embeddings

- Mikolov et al., word2vec, 2013. Levy and Goldberg, 2014.
- Reimers and Gurevych, [Sentence-BERT](https://arxiv.org/abs/1908.10084), 2019.
- Kusupati et al., [Matryoshka representation learning](https://arxiv.org/abs/2205.13147), 2022.
- Ethayarajh, [How contextual are contextualized word representations?](https://arxiv.org/abs/1909.00512), 2019.

#### Search and quantization

- Jégou, Douze, Schmid, [Product quantization for nearest neighbor search](https://inria.hal.science/inria-00514462), 2011.
- Ge et al., Optimized product quantization, 2013.
- Babenko and Lempitsky, Additive quantization, 2014; Tree quantization, 2015.
- Martinez et al., LSQ, 2016, and LSQ++, 2018.
- Malkov and Yashunin, [HNSW](https://arxiv.org/abs/1603.09320), 2016.
- Douze et al., [The Faiss library](https://arxiv.org/abs/2401.08281), 2024.
- Huijben et al., [QINCo](https://arxiv.org/abs/2401.14732), 2024.

#### Hashing

- Indyk and Motwani, Approximate nearest neighbors, 1998.
- Charikar, Similarity estimation techniques from rounding algorithms, 2002.
- Andoni et al., [Practical and optimal LSH for angular distance](https://arxiv.org/abs/1509.02897), 2015.
- Gao and Long, [RaBitQ](https://arxiv.org/abs/2405.12497), 2024.

#### Entropy and lossless coding

- Duda, [Asymmetric numeral systems](https://arxiv.org/abs/1311.2540), 2013.
- Pelkonen et al., Gorilla, VLDB 2015, for float time series.
- Severo et al., [Random Cycle Coding](https://arxiv.org/abs/2412.00369), on the order of a set.

#### Systems

- Covington et al., Deep Neural Networks for YouTube Recommendations, 2016.
- Subramanya et al., DiskANN, 2019.
- Guo et al., [ScaNN: anisotropic vector quantization](https://arxiv.org/abs/1908.10396), 2020.
:::

::: note About this book
Written in October 2026. Model and product details move fast, so check model cards and documentation before relying on a specific number. Every playground runs locally in your browser; every measurement can be regenerated from the repository with one command. The visual style owes a debt to 3Blue1Brown.
:::
