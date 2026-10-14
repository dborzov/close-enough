---
title: Fix all but one
kicker: Local search and exact answers
goal: The opposite strategy to beam search starts from a complete code and improves it one codebook at a time. Then a lab to compare every encoder fairly, and an exact solver to measure them against.
---

## Iterated conditional modes

Beam search builds a code left to right. [[icm|Iterated conditional modes]] (ICM) starts from a complete code, say greedy's, and improves it:

::: steps
1. Pick one codebook $m$.
2. Freeze the other $M-1$ choices.
3. The error is now a function of $i_m$ alone. Scan its $K$ entries and take the best: the *conditional mode*.
4. Move to the next codebook. Repeat until nothing changes.
:::

It is a decades-old trick from image restoration (Besag, 1986) and the core of [[LSQ]] (Martinez et al., 2016) and LSQ++ (2018).

::: widget icm | ICM, one step at a time
**Step through it** Each row is a codebook; each cell shows how good that entry would be given the current choice in every other row. Brighter is better; the yellow outline is the current choice. Each update moves the outline to the brightest cell of the row marked ▸, so the error on the right never goes up. When every outline sits on its row's best cell, ICM is stuck. Perturb two rows to escape.
:::

```python ICM, and LSQ's perturb-and-retry around it | numpy
def icm_encode(x, codebooks, codes, n_iter=4):
    codes, M = codes.copy(), len(codebooks)
    for _ in range(n_iter):
        for m, C in enumerate(codebooks):
            rest = sum(codebooks[j][codes[j]] for j in range(M) if j != m)
            codes[m] = ((x - rest - C) ** 2).sum(1).argmin()  # conditional mode
    return codes

def lsq_encode(x, codebooks, init, n_restarts=4, n_perturb=2, rng=np.random.default_rng()):
    err = lambda c: ((x - sum(C[i] for C, i in zip(codebooks, c))) ** 2).sum()
    best = icm_encode(x, codebooks, init)
    for _ in range(n_restarts):               # stochastic local search
        c = best.copy()
        m = rng.choice(len(c), n_perturb, replace=False)
        c[m] = rng.integers(len(codebooks[0]), size=n_perturb)
        c = icm_encode(x, codebooks, c)
        if err(c) < err(best):
            best = c
    return best
```

::: aside Why GPUs like ICM
Each sweep is $MK$ candidates with no data-dependent branching, so it vectorises across millions of vectors at once. Beam search needs a sort per stage, which is less friendly.
:::

## The encoder lab

Now compare them fairly. Same problem ($d = 8$, $M = 4$, $K = 16$), 120 test vectors, true optimum by brute force.

The slider sets how much the codebooks **overlap**. At 0 each codebook lives in its own two dimensions, exactly like PQ, so every pairwise term is zero. At 1 every codeword points freely in all 8 dimensions.

::: widget encoder-lab | Encoders against the optimum
**Move the overlap slider** The x axis is compute in table lookups per vector (log scale); the y axis is how far above the optimum each encoder lands on average. Hover the points.
:::

::: try What to look for
1. **Overlap 0.** Every method hits the optimum: no edges, so greedy *is* exact.
2. **Raise it.** Greedy lands far above.
3. **ICM from greedy** improves a little and then sticks; perturbing helps more.
4. **Beam search** buys the most per lookup here, and its curve flattens: the last few percent cost ten times more.
5. **The white point** is brute force. At real sizes ($K = 256$, $M = 8$) it would sit near $10^{20}$.
:::

## Exact answers: integer linear programming

Sometimes you want the true optimum: to know how far a heuristic is from it, or for tiny codebooks.

::: deep The encoding problem as an integer linear program
Let binary $z_{mk} = 1$ when codebook $m$ picks entry $k$, and for every interacting pair a variable $y_{mk,m'l}$ meant to equal $z_{mk} z_{m'l}$:

$$
\begin{aligned}
\min_{z,\,y}\quad & \sum_{m,k} \kbook{u_{mk}}\, z_{mk} \;+\; \sum_{m<m'} \sum_{k,l} \kenc{p_{mk,m'l}}\, y_{mk,m'l} \\
\text{s.t.}\quad & \textstyle\sum_k z_{mk} = 1 \quad \text{(one entry per codebook)} \\
& y_{mk,m'l} \le z_{mk},\quad y_{mk,m'l} \le z_{m'l},\quad y_{mk,m'l} \ge z_{mk} + z_{m'l} - 1 \\
& z, y \in \{0, 1\}
\end{aligned}
$$

The three inequalities force $y$ to be the AND of the two $z$'s, turning the quadratic term into a linear one. Both bounds are needed because the pairwise costs can have either sign.

```python
from scipy.optimize import milp, LinearConstraint, Bounds

def ilp_encode(x, codebooks):
    M, K = len(codebooks), len(codebooks[0])
    unary = np.concatenate([(C ** 2).sum(1) - 2 * C @ x for C in codebooks])
    pairs = [(m, k, n, l) for m in range(M) for n in range(m + 1, M)
             for k in range(K) for l in range(K)]
    pair_cost = np.array([2 * codebooks[m][k] @ codebooks[n][l] for m, k, n, l in pairs])
    nz, ny = M * K, len(pairs)
    rows, lo, hi = [], [], []
    def add(coefs, a, b):
        r = np.zeros(nz + ny)
        for i, v in coefs: r[i] = v
        rows.append(r); lo.append(a); hi.append(b)
    for m in range(M):                         # one-hot per codebook
        add([(m * K + k, 1) for k in range(K)], 1, 1)
    for j, (m, k, n, l) in enumerate(pairs):   # y = z_mk AND z_nl
        zi, zj, yj = m * K + k, n * K + l, nz + j
        add([(yj, 1), (zi, -1)], -np.inf, 0)
        add([(yj, 1), (zj, -1)], -np.inf, 0)
        add([(yj, 1), (zi, -1), (zj, -1)], -1, np.inf)
    res = milp(np.concatenate([unary, pair_cost]),
               constraints=LinearConstraint(np.array(rows), lo, hi),
               integrality=np.ones(nz + ny), bounds=Bounds(0, 1))
    return res.x[:nz].reshape(M, K).argmax(1)
```
:::

Count the variables for a production setting, $M = 8$ and $K = 256$: $MK + \binom{M}{2}K^2 \approx 1.8$ million binaries, *per vector*. So an [[ILP]] (and its cousins: QUBO formulations, LP relaxations with rounding) is a measuring stick and a research tool, not how you encode 300 million embeddings.

```score ADDITIVE (AQ / LSQ)
good distortion | lowest
bad encode | B× to 100× RQ
good search | M lookups + norm
bad training | re-encodes the data every epoch
```

::: check
- ICM re-optimises one codebook's choice at a time and stops at a local minimum; random perturbations (LSQ) escape it.
- With no overlap between codebooks every encoder is exact; the harder the overlap, the more search pays.
- An ILP gives the exact optimum and is only practical as a yardstick.
:::
