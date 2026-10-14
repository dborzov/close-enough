---
title: Be greedy
kicker: Residual quantization
goal: Let every codebook use all the dimensions. Quantize, subtract, quantize what is left. It is cheap, it is good, and it is not optimal.
---

## Quantize what is left

Now let every codebook use all $d$ dimensions. The simplest encoder:

::: steps
1. Pick the best entry from codebook 1.
2. Subtract it. What remains is the [residual]{.def .k-res}.
3. Quantize the residual with codebook 2.
4. Repeat for all $M$ codebooks.
:::

Train the same way: k-means on $x$, then k-means on the residuals, and so on. This is [[residual quantization]] (RQ), an old idea from signal coding (Juang and Gray, 1982) that came back for vector search and for neural audio codecs.

```python Residual quantization | numpy
def rq_encode(X, codebooks):        # M arrays of shape (K, d)
    R, codes = X.copy(), []
    for C in codebooks:
        i = nearest(R, C)
        codes.append(i)
        R -= C[i]                   # the next stage sees only what's left
    return np.stack(codes, axis=1)

def additive_decode(codes, codebooks):
    return sum(C[codes[:, m]] for m, C in enumerate(codebooks))
```

Greedy is cheap: $O(MKd)$, the same order as PQ. But it is not optimal.

::: widget rq-greedy | Greedy residual quantization
**Drag the target** The dashed [gold]{style="color:var(--cb2)"} path is greedy; the solid [mint]{.k-dec} path is the best of all 64 combinations. Greedy commits to the closest first arrow even when a slightly worse first arrow would let the smaller arrows land closer.
:::

## The shape of the failure

Stage $m$ chooses without knowing what stages $m+1, \dots, M$ can do. The readout under the figure says how often that matters in the toy; press *New codebooks* a few times to see it vary.

## A side effect worth remembering

::: key The progressive property
Any prefix of an RQ code is itself a valid, coarser code. Truncate 8 bytes to 4 and you still get a reasonable $\hat x$.
:::

This is used in three places later:

- **One model, many bitrates.** Neural audio codecs randomly drop later stages during training so that one model serves every bitrate ([[@bells-and-whistles]]).
- **Depth chosen afterwards.** For lossless coding you can train 24 stages and decide how many to use later, even per vector ([[@bit-allocation]]).
- **Refinement on the wire.** Send the first stages now and the rest if the client asks ([[@two-codecs]]).

## Measured

::: measured Freeing the codebooks
At 64 bits on held-out books:

| | Relative error | Recall@10 | Encode |
|---|---|---|---|
| PQ, 8 blocks | {{pq_err|.3f}} | {{pq_rec|.3f}} | {{pq_us|.0f}} µs |
| OPQ | {{opq_err|.3f}} | {{opq_rec|.3f}} | {{opq_us|.0f}} µs |
| **RQ, greedy** | **{{rq_err|.3f}}** | **{{rq_rec|.3f}}** | {{rq_us|.0f}} µs |

From PQ to greedy RQ the error falls by {{pq_to_rq_cut|.0%}}. That is the grid-versus-free picture of the previous page, measured.
:::

```score RQ (GREEDY)
good distortion | low-medium
good encode | M·K·d
good search | M lookups (+ norm)
ok training | M sequential k-means
```

::: check
- RQ quantizes the residual of the previous stage; every codebook is free to point anywhere.
- Greedy encoding is cheap and suboptimal: early stages cannot see what later ones could fix.
- Any prefix of the code is a coarser code.
:::
