---
title: What the geometry means
kicker: Stage 1 · Reading the space
goal: An embedding is a set of coordinates in a learned space where the training objective defined "near". Six properties follow, and three of them decide how compressible the vectors are.
---

## Six properties

::: cols
**Similarity is angle.** Two vectors pointing the same way mean similar things. That is why [[cosine]] dominates ([[@closeness]]).

**Directions encode attributes.** Gender, tense, plurality, sentiment and language often correspond to roughly consistent directions. The analogy trick is the famous case; the general claim is the *linear representation hypothesis*.

**Single axes usually mean nothing.** Dimension 417 is not "animal-ness". Concepts are spread over many dimensions, and models pack more concepts than dimensions by overlapping them ([[superposition]]).

**"Similar" means what the training data said.** Pure [[word2vec]] puts "hot" next to "cold": same contexts. A retrieval model trained on question–answer pairs encodes *relevance* more than synonymy.

**The space is lopsided.** Vectors crowd into a cone ([[anisotropy]]), and some points become everyone's neighbour ([[hubness]]).

**Fewer real degrees of freedom than dimensions.** The data lies near a much lower-dimensional surface ([[intrinsic dimension]]).
:::

## The same three, with numbers

The last three properties are easy to state and easy to wave away. Here they are on the {{n_windows|,}} real embeddings this book uses ({{d}} dimensions, `all-MiniLM-L6-v2`).

::: stats
- **{{rand_cos|.2f}}**{.k-res} average cosine between two *random* passages. Unrelated texts are not perpendicular.
- **{{mean_norm|.2f}}**{.k-res} length of the mean vector. All vectors have length 1, so nearly half of each one is shared by everybody.
- **{{pr|.0f}}**{.k-vec} effective number of dimensions, out of {{d}} (the participation ratio).
- **{{rank}}**{.k-book} directions with any variance at all. {{dead_dims}} coordinates of this model never change.
:::

::: measured Anisotropy is not subtle
If directions were spread evenly, two random passages would have cosine 0 give or take {{rand_cos_std|.2f}}. The measured average is {{rand_cos|.2f}}. The whole cloud sits off to one side of the origin, like a cluster of stars seen from far away.

The fix is one line, and every compression method in this book applies it first: **subtract the mean vector.**
:::

## Why this matters for the rest of the book

| Property | What it buys |
|---|---|
| Unit length | Cosine, dot product and distance give the same ranking, so error can be measured as plain squared distance |
| A shared mean | Subtract it once and stop spending bits on it |
| A lopsided [[spectrum]] | A few directions deserve many bits, most deserve few ([[@spectrum-and-bits]]) |
| Clusters by topic | A learned [[codebook]] can sit on the clusters (Part 4) |
| Neighbours in the text are neighbours in space | Sequences can be predicted ([[@prediction]]) |

::: aside Terms to search
The umbrella terms are *representation learning*, *metric learning*, *dense retrieval* and, on the theory side, the *linear representation hypothesis* and the *platonic representation hypothesis*: the observation that different models trained on different data converge on similar geometry.
:::

::: check
- Meaning lives in directions and angles, not in individual coordinates.
- Real embeddings are off-centre and low-dimensional in effect: {{pr|.0f}} effective dimensions out of {{d}} here.
- Those two facts are the raw material of every compression method that follows.
:::
