---
title: Napkin math
kicker: Stage 2 · How big is big?
goal: Before choosing an index, multiply three numbers. At a billion vectors memory is the bill, and the vector is far bigger than the information in it.
---

## Orders of magnitude

| Vectors | Typical use |
|---|---|
| 10⁴–10⁷ | a company's documents chunked for [[RAG]] |
| 10⁸ | a large e-commerce catalogue, a news archive |
| 10⁹–10¹¹ | web search, social posts, ad inventory, deduplicating an LLM training set |

::: widget napkin
**Slide the numbers yourself** The vertical ticks are a 16 GB laptop, an 80 GB GPU, 1 TB of server RAM and a 100 TB cluster, on a log scale: each step to the right is ten times more. [[HNSW]] adds roughly 2 × M × 4 bytes of links per vector on top (about 256 bytes at M = 32).
:::

## Where is the redundancy?

A 768-dimensional float32 vector spends 24,576 bits. The meaning it carries is far smaller, for three reasons. Each one becomes a chapter.

::: cards three
- **Precision is wasted**
  float32 gives about 7 significant digits. The model's own noise is far larger. Rounding each number to 8 bits barely changes rankings; even keeping only the *sign* preserves a surprising amount.

  → [[@scalar-quantization]], [[@bits-as-sketches]]
- **Coordinates are correlated**
  The data lives near a lower-dimensional surface, so many coordinates are partly predictable from others.

  → [[@spectrum-and-bits]], Part 4, [[@transforms]]
- **Vectors are correlated with each other**
  They come in clusters, and in sequences. A cluster id is already a few bits of information.

  → [[@partitioning]], [[@prediction]]
:::

::: qa Why not just zip them?
General-purpose compressors such as gzip or [[zstd]] look for *exact repeated byte patterns*. The low bits of a float are essentially noise, so there is nothing to repeat. On this book's embeddings zstd at its highest setting saves **{{fp32_zstd_saving|.0%}}** ([[@floats-are-stubborn]]).

The big wins come from *lossy, task-aware* compression: throw away information that does not change which neighbours come back. In information-theory terms this is [[rate–distortion]], with distortion measured in lost recall, not lost bits.
:::

## The cheap tricks, in three lines

```python Scalar and binary quantization | numpy
x = X.astype(np.float32)                                     # 768 dims: 3,072 bytes each
int8 = np.round(x / np.abs(x).max(0) * 127).astype(np.int8)  # 768 bytes, 4x smaller
bits = np.packbits(x > 0, axis=1)                            # 96 bytes, 32x smaller
# Search the bits with Hamming distance (XOR + popcount), take the top 200,
# then re-rank those with the float vectors kept on disk.
```

## The standard production pattern

::: pull
A compressed index in fast memory, full-precision vectors on cheap storage, and a re-ranked shortlist in between.

Newer systems (DiskANN, turbopuffer, LanceDB, S3 Vectors) push ever more onto cheap storage and accept a few extra milliseconds, because past a billion vectors RAM is the dominant cost.
:::

::: check
- Size = vectors × dimensions × bytes per number. Compute it before anything else.
- The redundancy is in precision, in correlation between coordinates, and in correlation between vectors.
- Generic compressors cannot see any of the three.
:::
