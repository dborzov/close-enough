---
title: Encoding is the hard part
kicker: Search over codes
goal: Expand the squared error and the structure of the problem falls out as a graph. The shape of that graph is the whole trade-off between quality and encoding cost.
---

## The energy and its graph

Write $c_m$ for the chosen entry of codebook $m$. Expanding the square:

$$ \Big\lVert \kvec{x} - \sum_{m} \kbook{c_m} \Big\rVert^2 \;=\; \lVert x\rVert^2 \;+\; \sum_{m} \underbrace{\kbook{\big(\lVert c_m\rVert^2 - 2\langle x, c_m\rangle\big)}}_{\text{unary: one choice at a time}} \;+\; \sum_{m<m'} \underbrace{\kenc{2\,\langle c_m, c_{m'}\rangle}}_{\text{pairwise: choices interact}} $$

- The [unary]{.k-book} terms say how much codebook $m$ likes each entry on its own. Entries pointing along $x$ are good.
- The [pairwise]{.k-enc} terms say how two choices interact. Two entries pointing the same way overshoot, so they are penalised together.

If you have met graphical models, this is an [energy]{.def .k-enc} over a graph with $M$ nodes, each taking one of $K$ labels, with an edge for every interacting pair. Minimising such an energy on a general graph is NP-hard.

::: svg energy-graphs | Four methods as graphs
**One picture, four methods** [Nodes]{.k-book} are codebooks, [edges]{.k-enc} are non-zero pairwise terms. PQ deletes the edges by construction. Tree quantization lets codebooks overlap only in a tree pattern, so exact encoding is dynamic programming. Unconstrained [[additive quantization]] keeps every edge.
:::

::: pull
Restricting codebooks deletes edges: easy encoding, worse codebook. Freeing them adds edges: better codebook, harder encoding.

Distortion and encode cost are two sides of one choice: how much the codebooks may overlap.
:::

::: aside What makes all the encoders fast
The pairwise terms do not depend on $x$, so they are computed **once**, as $\binom{M}{2}$ tables of size $K \times K$. The unary terms need $MK$ dot products per vector. After that, scoring any candidate code is table lookups and additions. All the costs below are counted in those lookups.
:::

## Beam search: greedy, but hedge your bets

Greedy keeps one partial code after each stage. [[beam search|Beam search]] keeps the $B$ best.

::: steps
1. Start with one empty code.
2. At stage $m$, extend each of the $B$ survivors by all $K$ entries.
3. Score the $BK$ candidates by the error of their partial sum.
4. Keep the best $B$. Go to the next stage.
:::

With $B = 1$ it is greedy RQ. This is the encoder of the original additive quantization paper (Babenko and Lempitsky, 2014) and what Faiss uses for its residual quantizer (`max_beam_size`).

::: widget beam | Beam search over codebooks
**Try B = 1, then raise it** One test vector from an 8-dimensional problem with $M = 4$ codebooks of $K = 16$. Each column is a stage; each dot is a candidate partial code, at a height equal to its error. Mint dots survive, faint ones are pruned. The dashed line is the true optimum, found by checking all 65,536 codes.
:::

```python Beam search | numpy
def beam_encode(x, codebooks, B=8):
    beam = [((), x)]                       # (partial code, residual)
    for C in codebooks:
        cand = []
        for code, r in beam:
            err = ((r - C) ** 2).sum(1)    # all K extensions
            for k in np.argsort(err)[:B]:  # at most B children each
                cand.append((err[k], code + (k,), r - C[k]))
        cand.sort(key=lambda t: t[0])
        beam = [(c, r) for _, c, r in cand[:B]]
    return np.array(beam[0][0])
```

Cost grows linearly in $B$. Beam search never revises a decision; it only keeps more of them open.

::: measured Wider is not always better
On Marginalia's vectors, a beam of 4 cuts the error from {{rq_err|.3f}} to {{beam4_err|.3f}} at {{beam4_cost|.1f}}× the encode time. A beam of 16 costs {{beam16_cost|.0f}}× and lands at {{beam16_err|.3f}}: no better on held-out books. The wider beam fits the training books more tightly, and that does not transfer.
:::

::: check
- Encoding minimises unary + pairwise energy; the pairwise graph's shape sets the difficulty.
- PQ has no edges, trees are exactly solvable, free additive codebooks are fully connected.
- Beam search keeps B partial codes per stage; gains flatten quickly.
:::
