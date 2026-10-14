---
title: Codebooks that add up
kicker: Multi-codebook quantization
goal: Keep M small codebooks of K vectors. Approximate every data point by choosing one vector from each and adding them. You store 2,048 vectors and get 2⁶⁴.
---

## The sum trick

$$ \kvec{x} \;\approx\; \kdec{\hat x} \;=\; \kbook{c^{1}}_{\kcode{i_1}} + \kbook{c^{2}}_{\kcode{i_2}} + \cdots + \kbook{c^{M}}_{\kcode{i_M}}, \qquad \kcode{i_m} \in \{0, \dots, K-1\} $$

The code for $x$ is the tuple $(\kcode{i_1}, \dots, \kcode{i_M})$: $M \log_2 K$ bits. With $M = 8$ and $K = 256$ that is 8 bytes.

::: stats
- **2,048**{.k-book} vectors stored ($M \cdot K$)
- **2⁶⁴**{.k-dec} points reachable ($K^M = 256^8$)
- **8 B**{.k-code} per code
:::

::: widget codebook-hero | Three codebooks that add up
**Drag the yellow point** Three [[codebooks]] of four arrows each: big, medium, small. Pick one arrow from each and chain them. Only 12 arrows are stored, yet 4 × 4 × 4 = 64 grey points are reachable.
:::

Now the smallest interesting case with data: two codebooks, [A]{.k-book} and [B]{style="color:var(--cb2)"}, four arrows each.

::: widget sum-trick | Sums of codewords
**Drag the arrow tips** Each mint dot is Aᵢ + Bⱼ, so moving one arrow moves four dots at once. Then switch to the product constraint and press *Fit*: the sums are forced onto an axis-aligned grid, which wastes points on a tilted cloud.
:::

## Two things to take from playing with it

**Decoding is trivial.**{.k-dec} Given the code, $\hat x$ is $M$ table lookups and $M-1$ vector additions. The decoder never sees the giant implicit codebook.

**Encoding got hard.**{.k-enc} To find the best code we would have to consider all $K^M$ combinations: the same $2^{64}$ we called impossible. The big search has not gone away. ==It has moved from the decoder to the encoder.==

::: key The theme of the next three pages
Every method from here is an answer to "how do you encode?" There are three broad answers:

- **Restrict the codebooks**{.k-book} so that the search falls apart into small pieces: product quantization, below.
- **Search greedily**{.k-enc}: residual quantization, [[@residual-quantization]].
- **Search hard**{.k-code}: beam search, ICM, exact solvers, [[@encoding-is-hard]] and [[@icm-and-exact]].
:::

## Restrict: product quantization

The *Product* button is [[product quantization]] (PQ; Jégou, Douze and Schmid, 2011). Split the $d$ dimensions into $M$ blocks. Codebook $m$ only has non-zeros in block $m$. Codewords from different codebooks are then perpendicular, and the error separates:

$$ \Big\lVert \kvec{x} - \sum_m \kbook{c^m}_{i_m} \Big\rVert^2 \;=\; \sum_{m=1}^{M} \big\lVert \kvec{x^{(m)}} - \kbook{c^{m}}_{i_m} \big\rVert^2 $$

Each term depends on one index only, so each is minimised separately: $M$ independent nearest-neighbour searches over $K$ entries. That is the whole encoder. Training is k-means in each block.

```python Product quantization | numpy
def pq_encode(X, codebooks):        # M arrays of shape (K, d/M)
    blocks = np.split(X, len(codebooks), axis=1)
    return np.stack([nearest(B, C) for B, C in zip(blocks, codebooks)], axis=1)

def pq_decode(codes, codebooks):
    return np.concatenate([C[codes[:, m]] for m, C in enumerate(codebooks)], axis=1)
```

The price is what you saw. The implicit codebook is a *grid* aligned with the blocks. When dimensions are correlated across blocks, and in embeddings they always are, much of the grid sits where no data lives.

[[OPQ]] (Ge et al., 2013) learns a rotation first, tilting the grid toward the data. It helps a great deal; the grid is still a grid.

::: measured How much the rotation is worth
At 64 bits on held-out books: PQ leaves a relative error of **{{pq_err|.2f}}**{.k-res}; OPQ, the same quantizer after a learned rotation, **{{opq_err|.2f}}**{.k-dec}. That is {{pq_to_opq_cut|.0%}} less error from layer 1 of the stack alone.
:::

```score PQ / OPQ
ok distortion | medium
good encode | K·d, trivial
good search | M lookups
good training | k-means per block
```

::: check
- M codebooks × K entries give $K^M$ reachable points from $MK$ stored vectors.
- Decoding is M lookups. Encoding is a search over $K^M$ combinations.
- PQ makes the search trivial by forcing the codebooks into separate blocks, at the cost of a grid-shaped codebook.
:::
