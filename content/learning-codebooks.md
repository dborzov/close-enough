---
title: Learning the codebooks
kicker: Training
goal: So far the codebooks were given. Learning them is the easy half, because the decoder is linear. The trap is that free codebooks have a great many parameters.
---

## The decoder update is least squares

Fix the codes for $N$ training vectors. Build a sparse $N \times MK$ matrix $B$ with one 1 in each of the $M$ blocks of every row, marking the entry that row uses. Stack all codebooks into one $MK \times d$ matrix $C$.

The reconstruction of the whole training set is then $\kdec{\hat X} = B\,\kbook{C}$, and the best codebooks for those codes solve a plain least-squares problem:

$$ \kbook{C^\star} \;=\; \arg\min_C \lVert \kvec{X} - B\,C \rVert_F^2 \;=\; (B^\top B)^{-1} B^\top X $$

```python Alternate: encode, then solve for the codebooks | numpy
def update_codebooks(X, codes, K):
    N, M = codes.shape
    B = np.zeros((N, M * K))                  # sparse in practice
    B[np.arange(N)[:, None], np.arange(M) * K + codes] = 1
    C = np.linalg.lstsq(B, X, rcond=None)[0]  # (M*K, d)
    return np.split(C, M)

codebooks = rq_train(X)                       # the starting point matters a lot
for epoch in range(10):
    codes = encode(X, codebooks)              # beam / ICM: expensive
    codebooks = update_codebooks(X, codes, K) # least squares: cheap
```

This is [[k-means]] with a different assignment step.

::: pull
Training inherits the encoder's cost.

Every epoch re-encodes the whole training set with the expensive encoder. That is why LSQ-style methods spent much of their engineering on fast GPU encoding.
:::

## The overfitting trap

::: measured On Marginalia's data
Eight codebooks of 256 × {{d}} have **{{codebook_params|,}}** free parameters. Trained on {{n_train|,}} windows, [[LSQ]] reaches a relative error of **{{lsq_train_err|.2f}}**{.k-dec} on the training books and **{{lsq_err|.2f}}**{.k-res} on the database books.

The gap is overfitting. A strong encoder plus free codebooks will happily memorise the training set.
:::

Three defences, in order of preference:

1. **More data than parameters.** Marginalia has 300 million vectors to train on; the experiment here had {{n_train|,}}, about one sample per ten parameters.
2. **Regularise.** A ridge term in the least-squares solve keeps rarely used codewords from chasing noise.
3. **Always score on held-out vectors.** It is the only way to notice.

::: aside The same gap, seen from the encoder
[[@encoding-is-hard]] found that a 16-wide beam was no better than a 4-wide one on held-out books. Same cause: more search fits the training set better and transfers less.
:::

::: check
- Training alternates: encode (hard, combinatorial) ↔ codebook update (least squares).
- Training therefore costs as much as encoding the training set, many times over.
- Free codebooks have hundreds of thousands of parameters; measure on held-out data.
:::
