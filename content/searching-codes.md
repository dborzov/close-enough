---
title: Searching without decoding
kicker: Using the codes
goal: Compression is half the story. The other half is that a query can be scored against codes directly, and this is where additive codebooks repay their expensive encoder.
---

## Asymmetric distance computation

A query $\kq{q}$ arrives and we want its inner product with millions of compressed vectors. Because the reconstruction is a sum, so is the inner product:

$$ \langle \kq{q}, \kdec{\hat x}\rangle \;=\; \sum_{m=1}^{M} \underbrace{\langle \kq{q}, \kbook{c^{m}}_{\kcode{i_m}}\rangle}_{\text{table } T_m[\kcode{i_m}]} $$

::: steps
1. **Once per query:** compute the $M \times K$ table $T_m[k] = \langle q, c^m_k \rangle$. That is 2,048 dot products.
2. **Per database vector:** $M$ lookups and $M-1$ additions. No reconstruction, no $d$-dimensional arithmetic.
:::

This is [[adc|asymmetric distance computation]] (ADC): the query stays exact, the database is compressed.

::: widget adc | Asymmetric distance computation
**ADC** The [pink]{.k-code} cells are the entries the code picks. The search cost is the same $M$ lookups for PQ, RQ and additive codes.
:::

::: key Why the expensive encoder is worth it
At query time PQ, RQ and LSQ codes all cost exactly $M$ lookups. The encoder's extra effort is free forever after.
:::

```python ADC search | numpy
def adc_search(q, codes, codebooks, norms_sq, topk=10):
    M = codes.shape[1]
    luts = np.stack([C @ q for C in codebooks])  # (M, K), once per query
    ip = luts[np.arange(M), codes].sum(1)        # M lookups per vector
    dist = norms_sq - 2 * ip                     # ||q||² is the same for everyone
    return np.argsort(dist)[:topk]
```

## The norm term

$$ \lVert \kq{q} - \kdec{\hat x}\rVert^2 \;=\; \lVert q\rVert^2 \;-\; 2\langle q, \hat x\rangle \;+\; \kenc{\lVert \hat x\rVert^2} $$

- The first term is the same for every candidate.
- The middle one is the table sum.
- The last, $\lVert\hat x\rVert^2$, contains all the pairwise terms $2\langle c_m, c_{m'}\rangle$ again.

For PQ those are zero (perpendicular blocks). For additive codes they are not, so the standard fix is to compute $\lVert \hat x \rVert^2$ at encoding time and **store it, quantized to one extra byte**. Eight bytes become nine.

For inner-product search on normalized embeddings, which is Marginalia's case, you do not need it at all.

## Three tricks production systems stack on top

::: cards three
- **[[fast-scan|Fast-scan]]**
  With $K = 16$ (4-bit codes) each table has 16 entries. Quantized to 8 bits, a whole table fits in one SIMD register and a single shuffle instruction does 16 to 32 lookups at once.
- **[[IVF]]**
  A coarse k-means first, so that only a few lists are scanned per query. It is literally one more quantization stage, used for routing.
- **[[re-ranking|Re-ranking]]**
  Take the top 100 by ADC and re-score them with exact vectors from cheaper storage. This hides most of the quantization error from the final ranking.
:::

```python In practice: Faiss index-factory strings | faiss
import faiss
d = 384
index = faiss.index_factory(d, "IVF4096,RQ16x8_Nqint8")    # 16 B code + 1 B norm
faiss.extract_index_ivf(index).rq.max_beam_size = 4         # the beam B
index.train(train_vectors)        # k-means for IVF, then the RQ codebooks
index.add(all_vectors)
index.nprobe = 32                 # lists scanned per query
D, I = index.search(queries, 100) # a shortlist; re-rank it with exact vectors
# alternatives: "OPQ16_384,IVF4096,PQ16x8"  "IVF4096,LSQ16x8_Nqint8"
#               "IVF4096,PRQ2x8x8_Nqint8"   "IVF4096,PQ32x4fs" (fast-scan)
```

::: aside Reading the strings
`RQ16x8` is 16 codebooks of 2⁸ entries. `_Nqint8` stores the norm in 8 bits. `PRQ2x8x8` is a product of 2 residual quantizers. `fs` is the fast-scan layout.
:::

::: check
- ADC scores a query against a code with M table lookups, the same for PQ, RQ and additive codes.
- Additive codes need $\lVert\hat x\rVert^2$ for L2 search: one extra byte. Not for inner product.
- Fast-scan, IVF and re-ranking are what turn a quantizer into a search system.
:::
