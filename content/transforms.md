---
title: The transform zoo
kicker: Lossless compression · Layer 1
goal: Coordinates are correlated, and a per-coordinate model cannot see it. A rotation would fix that, except that a rotation destroys the integer grid. The lossless answer is a triangular transform, which turns out to be prediction in disguise.
---

## What correlation costs

Code two correlated coordinates separately and you pay for the same information twice.

::: widget decorrelate
**Rotate the coding axes** Each axis is coded with its own bell curve, costing about $\log_2 \sigma$ bits. The panel shows the total relative to the original axes. Snap to the principal axes: that is the lowest a rotation can go. Then read the last line.
:::

For Gaussian data the saving from perfect decorrelation has a closed form, the [[coding gain]]:

$$ \kbits{G} \;=\; \frac12 \sum_{i=1}^{d} \log_2 \frac{\sigma_i^2}{\lambda_i} \;=\; \frac{d}{2}\,\log_2 \frac{\text{arithmetic mean of the variances}}{\text{geometric mean of the eigenvalues}} $$

where $\sigma_i^2$ are the variances of the coordinates as given and $\lambda_i$ the [[spectrum]]. A flat spectrum gives no gain. A lopsided one gives a lot.

::: measured The prize
On Marginalia's int8 vectors the coding gain is **{{coding_gain|.0f}} bits per vector**, about {{ld_chol_gain|.0f}} of which survive on held-out books. That is the second-largest item on the ladder.
:::

## The zoo

| Transform | Decorrelates | Exactly invertible on integers? | Cost per vector | Used in |
|---|---|---|---|---|
| [[PCA]] / KLT rotation | fully (linearly) | **no** | $d^2$ | lossy [[transform coding]] |
| DCT, Hadamard, random rotation | partly, no training | no (Hadamard: nearly) | $d \log d$ | JPEG, [[OPQ]]-style preprocessing |
| [[byte shuffle]], bit planes | nothing; regroups | yes | $d$ | Blosc, generic float pipelines |
| Delta / XOR with a neighbour | along one axis | yes | $d$ | time series, [[@prediction]] |
| Lifting (integer rotations) | approximately | yes | $d^2$ | JPEG 2000, lossless audio |
| **Triangular prediction** | fully (linearly) | **yes** | $d^2/2$ | this page |

## Why you cannot just rotate

A rotation is exactly what the lossy world uses ([[@spectrum-and-bits]]). For lossless coding it has a fatal flaw.

::: svg lattice
**The grid does not survive** Left: the int8 values sit on a square grid. Right: after a rotation the same points sit on a tilted grid. Rounding the rotated coordinates to integers moves each point, and nothing guarantees it can be moved back.
:::

The obvious workaround is to quantize the rotated coefficients, reconstruct, and code the exact leftover separately. That works, and it has a knob: the step $s$ used for the coefficients.

::: measured Rotate, quantize, and code the leftover
PCA coefficients quantized with step $s$, plus the exact integer difference:

- $s = {{pca_side_s}}$ (best): **{{pca_side_best|,.0f}} bits**, split {{pca_side_side|,.0f}} for coefficients + {{pca_side_resid|,.0f}} for the leftover;
- $s = 1$ (as fine as the data): **{{pca_side_s1|,.0f}} bits**, barely better than no transform at all ({{mo_gauss|,.0f}}).

At fine steps the rounding of the coefficients and the rounding of the data are two different grids, and you pay for the mismatch in every coordinate.
:::

It helps ({{mo_gauss|,.0f}} → {{pca_side_best|,.0f}}), but it leaves most of the prize on the table.

## The lossless twin of a rotation

Go back to the playground and read its last line: *predicting y from x reaches exactly the same number as the best rotation.*

That is not a coincidence. A rotation diagonalises the covariance with an orthogonal matrix. A **triangular** matrix does it too:

$$ \Sigma \;=\; \kbook{L}\,\kbook{L}^{\!\top} \qquad\text{(Cholesky)} \qquad\Longrightarrow\qquad \sum_i \log_2 \kres{L_{ii}} \;=\; \tfrac12 \log_2 \det \Sigma \;=\; \tfrac12\sum_i \log_2 \lambda_i $$

Read row $j$ of $L$ as a recipe: *predict coordinate $j$ from coordinates $1 \dots j-1$; what is left has spread $L_{jj}$.* The product of those leftover spreads equals the product of the eigenvalues' square roots. Same volume, same bits.

And unlike a rotation, it never leaves the grid:

::: steps
1. Coordinate 1 is coded as it is.
2. Coordinate 2: the decoder already has coordinate 1 *exactly*, computes the same prediction, rounds it the same way, and adds the coded difference. Exact.
3. Coordinate 3: predicted from the exact 1 and 2. And so on.
:::

```python Triangular prediction: the lossless decorrelator | numpy + scipy
from scipy.linalg import solve_triangular

m = X_train.mean(0)
L = np.linalg.cholesky(np.cov((X_train - m).T) + np.eye(d) / 12)   # fit once

def innovations(x):                    # encoder side; x is a vector of integers
    z = solve_triangular(L, x - m, lower=True)
    return z * np.diag(L)              # x_j minus its prediction from x_1..x_{j-1}
# coordinate j is then coded with a bell curve of spread L[j, j] around its prediction
```

::: widget cond-std
**What the earlier coordinates explain** Blue: each coordinate's spread on its own. Orange: its spread once the coordinates before it are known. The gap, on a log scale, is the saving.
:::

::: measured The triangular predictor
Per-coordinate model: {{ld_marginal|,.0f}} bits. With triangular prediction: **{{ld_chol|,.0f}} bits**, a further {{ld_chol_gain|.0f}} bits per vector, and within a rounding error of the ideal joint-Gaussian bound ({{mvn|,.0f}}).

The cost is one triangular solve: {{chol_params|,}} multiply-adds per vector, about {{ld_chol_us|.0f}} µs in numpy. The model is a {{d}} × {{d}} matrix, 300 kB, shared by every vector.
:::

::: aside The connection to side information
Quantized PCA coefficients are a *description sent ahead of the data*. Triangular prediction sends nothing ahead: the data itself is the context. [[@bit-allocation]] compares the two approaches head to head.
:::

::: check
- Decorrelation is worth $\tfrac12\sum\log_2(\sigma_i^2/\lambda_i)$ bits: {{coding_gain|.0f}} per vector here.
- A rotation breaks the integer grid, so it cannot be used directly for lossless coding.
- Predicting each coordinate from the earlier ones (a triangular transform) captures the same gain and is exactly invertible.
:::
