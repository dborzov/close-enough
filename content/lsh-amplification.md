---
title: Turning a gentle slope into a cliff
kicker: Amplification
goal: One bit barely separates neighbours from strangers. Combine k bits with AND and L tables with OR and the collision curve becomes an S. Choosing k and L is the whole design problem, and it has a closed form.
---

## AND: make buckets selective

Concatenate $k$ independent bits into one bucket key. Two points share a bucket only if they agree on **all** $k$:

$$ \Pr[\text{same bucket}] \;=\; p^{\,k} $$

Strangers are filtered out exponentially fast: $\kres{p_2}^k$. With $p_2 = {{p_rand|.2f}}$ and $k = 12$, a random point lands in the query's bucket once in about {{p2_k12_inv|,.0f}}.

Unfortunately neighbours are filtered too: $\kdec{p_1}^{k}$ with $p_1 = {{p_nn10|.2f}}$ and $k = 12$ is about {{p1_k12|.3f}}. One table almost never contains the neighbour.

## OR: give neighbours more chances

Build $L$ independent tables, each with its own $k$ bits. A point is a candidate if it shares a bucket with the query in **any** table:

$$ \Pr[\text{candidate}] \;=\; 1 - \big(1 - p^{\,k}\big)^{L} $$

This is the [[AND-OR construction]], or [[amplification]]. As a function of similarity it is an S-curve: near zero for dissimilar points, near one for similar points, with a transition that sharpens as $k$ and $L$ grow together.

::: widget lsh-scurve
**Set k and L** The faint dotted line is a single bit. The dashed markers are a true 10th neighbour and a random pair on Marginalia's data. Where a marker meets the curve is, roughly, your recall (green) and the share of the database you will have to scan (red). When your settings match a measured configuration, the measurement appears below.
:::

::: try Find a good index
1. Set **k = 12, L = 1**. Almost nothing collides, neighbours included.
2. Raise **L** to 64. Recall climbs. So does the red dot: you are scanning more.
3. Now try **k = 8, L = 64**. More recall, far more scanning.
4. Try to get the green dot above 0.9 with the red dot below 0.01. On this data you cannot. The next section says why.
:::

## How to choose k and L

Let $N$ be the size of the database. The classical recipe (Indyk and Motwani):

::: steps
1. **Choose $k$ so that strangers are rare.** Set $p_2^{\,k} = 1/N$, which gives about one stranger per table: $k = \dfrac{\ln N}{\ln(1/p_2)}$.
2. **Choose $L$ so that a neighbour is found.** A neighbour is in a given table with probability $p_1^{\,k}$, so you need about $L = 1/p_1^{\,k}$ tables.
3. **Substitute.** $p_1^{\,k} = N^{-\rho}$ where
:::

$$ \kcode{\rho} \;=\; \frac{\ln(1/\kdec{p_1})}{\ln(1/\kres{p_2})} \qquad\Longrightarrow\qquad L \approx N^{\rho}, \qquad \text{query work} \approx N^{\rho}, \qquad \text{memory} \approx N^{1+\rho} $$

The exponent [ρ]{.def .k-code} is always below 1 because $p_1 > p_2$. That is the sense in which LSH is provably sublinear.

::: measured ρ on Marginalia's embeddings
With $p_1 = {{p_nn10|.3f}}$ and $p_2 = {{p_rand|.3f}}$:

$$ \rho = \frac{\ln(1/{{p_nn10|.3f}})}{\ln(1/{{p_rand|.3f}})} = {{lsh_rho|.2f}} $$

Sublinear, but only just. For a million vectors $N^{\rho}$ is about {{lsh_nrho_million|,.0f}}; for the {{lsh_n|,}} vectors here it is about {{lsh_nrho_here|,.0f}} candidates per query, {{lsh_nrho_here_frac|.0%}} of the database.
:::

::: key What ρ really says
LSH is fast when neighbours are *much* closer than typical points: near-duplicates, where $p_1 \approx 1$ and $\rho \approx 0$. It is slow when "near" means cosine 0.3 against a background of 0.1, which is the normal situation for semantic search.
:::

## The memory bill

Every table stores a pointer for every vector. $L$ tables cost $L \times N \times 4$ bytes before you store a single vector: at $L = 64$ that is 256 bytes per vector of index overhead, as much as an HNSW graph and far more than an IVF index, which stores each vector once.

::: check
- AND over k bits: collision probability $p^k$, which makes buckets selective.
- OR over L tables: $1-(1-p^k)^L$, which rescues recall.
- With $k = \ln N/\ln(1/p_2)$ and $L = N^{\rho}$, query time is about $N^{\rho}$, where $\rho = \ln(1/p_1)/\ln(1/p_2)$.
- On real embeddings ρ is about {{lsh_rho|.2f}}: the gap between neighbours and strangers is too small for LSH to shine.
:::
