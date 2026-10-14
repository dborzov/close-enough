---
title: "MagicPIG: attention as estimation, not search"
kicker: Paper club · Chen et al., 2024
goal: An LLM's attention output is a weighted average over the KV cache. MagicPIG argues that approximating it is a sampling problem, not a nearest-neighbour problem, and uses SimHash as a sampler with a known probability. We restate the idea in this book's language, re-measure it on real KV vectors, and list what looks off.
---

::: lede
MagicPIG is a paper about making long-context LLM generation cheaper. Read from this book's side of the table, it is about something more general: what to do with a vector index when the consumer of the results wants an *average* rather than a *list*. Along the way it reports a striking piece of geometry about the keys and queries inside a transformer, and turns [[SimHash]], the most data-oblivious index in Part 5, into the right tool precisely *because* it is oblivious.
:::

::: note The paper
Zhuoming Chen, Ranajoy Sadhukhan, Zihao Ye, Yang Zhou, Jianyu Zhang, Niklas Nolte, Yuandong Tian, Matthijs Douze, Léon Bottou, Zhihao Jia, Beidi Chen. *MagicPIG: LSH Sampling for Efficient LLM Generation.* [arXiv:2410.16179](https://arxiv.org/abs/2410.16179) (we read v4, December 2024), ICLR 2025 spotlight. CMU, University of Washington, NYU and Meta; Douze is a co-author of FAISS. Code: [github.com/Infini-AI-Lab/MagicPIG](https://github.com/Infini-AI-Lab/MagicPIG).
:::

## The paper in one paragraph

During generation, every new token's [query]{.k-q} is compared with the [keys]{.k-book} of all earlier tokens, and the output is a softmax-weighted average of their [values]{.k-dec}. With 100k tokens of context, reading the whole [[KV cache]] for every token, layer and head dominates the cost. The popular fix is [[sparse-attention|TopK attention]]: find the few keys with the highest scores and ignore the rest. MagicPIG says this is the wrong goal. The output is an *expectation*, and the unbiased way to approximate an expectation is to *sample*, then correct for how you sampled. They sample with SimHash tables (the [[AND-OR construction]] from [[@lsh-amplification]]), compute each key's exact probability of being sampled from its angle to the query, and re-weight. The hash tables and the attention arithmetic live on the CPU, and the GPU keeps only the model. They report accuracy within a few points of full attention while reading 2 to 5% of the keys, and up to 5× higher throughput.

## Why we are reading it

::: cards
- **Attention is a soft kNN**{.k-q}
  [[@rhymes]] showed that attention is a soft nearest-neighbour lookup over the KV cache. MagicPIG asks what "approximate" should mean when the lookup is soft.
- **SimHash, the S-curve and the memory bill**{.k-code}
  The sampler is exactly the $k$-bit, $L$-table construction from Part 5, with one twist. The memory bill from [[@lsh-amplification]] comes due, in full.
- **Anisotropy and centring**{.k-vec}
  Keys and queries sit in narrow cones, like the embeddings in [[@shape-of-the-cloud]] and [[@know-your-data]]. Subtracting the mean, the one-line fix every chapter of Part 3 applies first, decides whether the method works at all.
- **Estimators and bits**{.k-bits}
  Unbiased estimators from a few random bits ([[@bits-as-sketches]]), $-\log u$ as a correction measured in surprisal, and the [[entropy]] of the attention distribution as the number of keys that matter.
:::

## Idea 1: the output is an average, so estimate it {#estimation}

Write the attention weights as a probability distribution over the $n$ cached tokens:

$$ w_i = \frac{\exp(\kq{q}\cdot\kbook{k_i}/\sqrt d)}{\sum_j \exp(\kq{q}\cdot\kbook{k_j}/\sqrt d)}, \qquad \kdec{o} \;=\; \sum_i w_i\,\kdec{v_i} \;=\; \mathbb{E}_{i\sim w}\big[\kdec{v_i}\big] $$

A vector database returns a *set*, and we judge it by recall. Attention consumes a *number*: the average of the values under $w$. Those are different jobs, and they fail differently.

**TopK** keeps the $m$ largest weights and renormalizes over them. Split the weight into the head it keeps (total mass $M$, weighted mean of values $\kdec{a}$) and the tail it drops (mass $1-M$, weighted mean $\kdec{b}$). Then $o = M a + (1-M) b$, TopK returns $a$, and its error is exactly

$$ \kres{o - \hat o_{\text{TopK}}} \;=\; (1-M)\,(\kdec{b} - \kdec{a}) $$

The error is the dropped mass times how different the dropped values are from the kept ones. It does not shrink with luck or repetition: it is a **bias**. It is small when the tail is light *or* when the tail looks like the head, and large when many small weights together point somewhere the big ones do not. That is what aggregation tasks look like ("which word occurs most often in this document?"), and the paper's Figure 1 shows exact TopK collapsing on them.

**Sampling** draws $B$ indices from $w$ and averages their values. It is unbiased, and its error depends on the spread of the values, not on how the mass is shaped:

$$ \mathbb{E}\big[\hat o_{\text{sample}}\big] = o, \qquad \mathbb{E}\,\lVert \hat o_{\text{sample}} - o\rVert^2 \;=\; \frac{1}{B}\,\mathbb{E}_{i\sim w}\lVert v_i - o\rVert^2 $$

A peaked distribution is cheap too: the paper's Theorem 3.3 bounds the number of *distinct* keys among $B$ draws by $1 + B(1 - \max_i w_i)$, because repeated draws of the same key are read once.

::: deep Where the TopK identity comes from
Let $H$ be the kept set, $M = \sum_{i\in H} w_i$, $a = \frac1M\sum_{i\in H} w_i v_i$ and $b = \frac{1}{1-M}\sum_{i\notin H} w_i v_i$. Then $o = \sum_i w_i v_i = M a + (1-M) b$. TopK returns $\sum_{i\in H} \frac{w_i}{M} v_i = a$, so $o - a = (1-M)(b-a)$. Nothing is approximate. A corollary: any estimator that keeps the head exactly and gets the tail's mean $b$ right *in expectation* removes the bias completely. That is the hybrid we measure below.
:::

::: aside The zoo in the appendix
The paper's Appendix F explains the bias with a zoo: average food per animal, estimated from the "top" animals. The example works but blurs what "top" means. The identity above is the whole story: TopK is biased by the tail mass times the gap between tail and head.
:::

## Idea 2: two cones and a sink {#geometry}

Why not just find the TopK keys with an ANN index? Section 3 of the paper answers with geometry, and it is the most interesting part of the paper for this book.

::: widget pig-cone | Two cones and a sink
**Switch between the views** We recorded every key and query of Qwen2.5-1.5B-Instruct reading the first 16,384 tokens of Jane Austen's *Emma*. *One head* shows how the keys and the queries spread around the mean key direction. *One query* shows its cosine with every key, before and after subtracting the mean key. *All layers* repeats the measurement through the network.
:::

The paper makes three observations about Llama, and on a different model, a different text and a different tokenizer, all three hold:

::: measured The geometry, re-measured
On Qwen2.5-1.5B-Instruct, averaged over 28 layers:

- **The keys sit in a narrow cone.** A key's cosine with the mean key is **0.67** on average (0.54 to 1.00 by layer). Random directions in 128 dimensions would give about 0. This is [[anisotropy]], exactly as in the sentence embeddings of [[@shape-of-the-cloud]].
- **The queries point away from it.** A query's cosine with the mean key is **−0.24** on average, down to −0.45. For an ANN index the queries come from a different distribution than the data.
- **The first token's key is a constant.** Feed 32 different single tokens: the key at position 0 has mutual cosine **0.99** across them. The mean key direction is just as stable: **0.97** across 50 passages from 18 books. The sink key points *against* the mean key in most layers (cosine down to −0.61; the paper reports −0.8 to −0.9 on Llama), queries lean *toward* it (+0.46), and its value vector is short: **0.35×** the length of an average value.
:::

The picture this paints is the [[attention sink]]. The softmax must hand out a total weight of 1 even when nothing in the context is relevant. The model has learned to park that weight on the first token, whose key is the same whatever the token is and whose value is short enough to add little to the output. It is a built-in "none of the above". On our text it takes **24%** of all attention on average, up to 43% in some layers. Seen from Part 1, the sink is a [[hubness|hub]] by design: a point that is everybody's neighbour.

::: aside A sink by construction
Some later architectures make this explicit instead of leaving it to training: a learned per-head logit in the softmax denominator gives every head a place to put weight that adds nothing to the output. The geometry above is what that looks like when it is learned implicitly.
:::

Two consequences follow, and the paper draws both:

1. **The sink makes attention look sparser than it is.** With the sink in, a few keys hold most of the weight. Take it out and the rest is flatter.
2. **Search is hard here.** Queries live in a cone the keys do not occupy, so an index trained on the keys' distribution partitions the wrong region. The paper cites the observation that IVF needs to scan over 30% of the keys to find the exact TopK.

### Centring is free, and it is everything

The fix is the same one-liner as for sentence embeddings: subtract the mean key. In attention it is exactly free, because the softmax ignores a constant added to every score:

$$ \kq{q}\cdot(\kbook{k_i} - \mu) \;=\; \kq{q}\cdot\kbook{k_i} - \underbrace{\kq{q}\cdot\mu}_{\text{same for every } i} $$

Only the keys can be shifted. Subtracting something from the query would change each score by a different amount $c\cdot k_i$ and change the answer. It is the same asymmetry as in [[ADC]]: the stored side can be transformed freely, and the query has to be taken as it comes.

For random hyperplanes, centring is not cosmetic. In the *one query* view, the raw keys sit at an average cosine of −0.28 from the query: all on one side of it, all hashing alike. After centring they spread around 0. The paper's ablation (Figure 9a) shows retrieval accuracy falling to almost zero without centring, because fewer than 0.1% of keys ever collide with the query.

## Idea 3: SimHash as a sampler with a known probability {#sampler}

Sampling from $w$ exactly requires every score, which costs as much as attention itself (the paper calls this the oracle). So the paper samples from a different distribution $u$ that is cheap to draw from, and corrects with [[importance sampling]]:

$$ \hat o \;=\; \frac{\sum_{i\in S} \frac{\tilde w_i}{u_i}\, \kdec{v_i}}{\sum_{i\in S} \frac{\tilde w_i}{u_i}}, \qquad \tilde w_i = e^{\,\kq{q}\cdot\kbook{k_i}/\sqrt d} $$

where $S$ is the set of sampled keys and $u_i$ is the probability that key $i$ ends up in $S$. This only works if $u_i$ is *known*, for every sampled key, exactly. And that is where SimHash shines.

Part 5 used random hyperplanes two ways: [as an address](@lsh-amplification) and [as a sketch](@bits-as-sketches). MagicPIG adds a third: **as a sampler**. Hash the centred keys into $L$ tables of $K$ sign bits each, hash the query the same way, and sample every key that shares its bucket with the query in **at least two** tables. Because SimHash collides with probability $p = 1-\theta/\pi$, the sampling probability is a closed-form function of the angle:

$$ \kcode{u_i} \;=\; 1 - (1-p_i^{K})^{L} - L\,p_i^{K}(1-p_i^{K})^{L-1}, \qquad p_i = 1 - \frac{\theta(\kq{q}, \kbook{k_i}-\mu)}{\pi} $$

The first two terms are the familiar S-curve. The third removes keys that collide in exactly one table, which makes the curve steeper (the paper says requiring two hits "greatly improves accuracy").

::: widget pig-scurve | The sampling curve
**Set K and L, and switch between one and two tables** The curve is the probability that a key is sampled, given its cosine with the query. Behind it: one real query's 16,384 centred keys (grey, how many sit at each cosine) and its attention weight (green, where the mass sits; the spike is the sink). The readout integrates the two: how many keys you read, and how much of the attention mass sits on keys you read.
:::

::: key Obliviousness, turned into an asset
Part 5 called LSH's data-obliviousness its weakness: a learned index (IVF, HNSW) adapts to the data and finds neighbours with far less work. But a learned index cannot tell you the *probability* that it returned item $i$; it either does or does not. SimHash can, from one arccos. That number is what makes the re-weighting, and hence an unbiased estimate, possible.
:::

In code, the correction is one subtraction inside the softmax:

```python MagicPIG's estimator for one query | after Algorithm 1
s = (K_S @ q) / np.sqrt(d)                     # scores of the sampled keys only
p = 1 - np.arccos(cos(q, K_S - mu)) / np.pi    # SimHash collision probability per table
u = 1 - (1 - p**K)**L - L * p**K * (1 - p**K)**(L - 1)
w = softmax(np.concatenate([s - np.log(u), s_static]))   # static = sink + recent tokens, exact
o_hat = w @ np.concatenate([V_S, V_static])
```

::: aside −log u is a surprisal
In the language of Part 6, $-\log_2 u_i$ is the number of bits of surprise in the event "key $i$ was sampled". The estimator adds exactly that surprise back to the key's score. Rarely sampled keys count for more when they do show up.
:::

## The memory bill comes due {#memory}

The hash tables live in CPU memory, and [[@lsh-amplification]] warned what they cost: one pointer per key per table. The paper's own Table 8 makes the point sharper than the text does. Do the arithmetic for Llama-3.1-8B at 96k tokens (32 layers, 8 KV heads, head dimension 128):

| Per key, per layer, per KV head | Bytes |
|---|---|
| the key and the value, bfloat16 | $2 \times 128 \times 2 = 512$ |
| the hash tables at $(K, L) = (10, 150)$: 150 int32 pointers | $150 \times 4 = 600$ |
| the hash codes themselves, if stored: 1,500 bits | 188 |

::: stats
- **12 GiB**{.k-dec} the whole KV cache, 96k tokens
- **14 GiB**{.k-code} the hash tables (the paper's Table 8 says 14 GB)
- **0.2%**{.k-q} of the key bytes read to find the candidates: $L \cdot n/2^K = 14{,}400$ pointers against 98,304 keys
:::

The index is larger than the data it indexes. That is fine for the paper's goal: GPU memory is scarce, CPU memory is cheap, and the cost of finding candidates is tiny in bytes (the paper rounds it to zero, and the arithmetic agrees). But the introduction's third complaint about prior work is that it does "no memory saving". MagicPIG does not save memory either: it moves the cache to the CPU and adds more than its own size next to it.

## Measured: our re-run {#measured}

We re-implemented Algorithm 1 directly from the paper: centred keys, SimHash with one set of random hyperplanes shared by all heads, sampling on at least two collisions, the $1/u$ correction, and the first 4 and last 64 tokens kept exact. We ran it on the 64 last positions of the same 16k-token context, for every head of every layer (21,504 attention rows). Against it, three *oracles* that are allowed to see every score: TopK, sampling from $w$, and a hybrid that keeps the top half of the budget exactly and samples the tail.

::: widget pig-estimators | Estimators at a budget
**Turn centring and the exact sink and local tokens on and off** Curves: the oracles at budgets from 0.1% to 20% of the keys. Diamonds: MagicPIG at the paper's three settings. Square: the sink and the 64 most recent tokens alone.
:::

::: measured What we found
- **The budgets match the paper.** (8, 75), (9, 120) and (10, 150) read **5.1%, 3.9% and 2.1%** of the keys; the paper's Table 9 says 5%, 4% and 2%.
- **Sampling beats TopK, as an oracle.** At a 2% budget, TopK's relative error is **12.1%**; sampling from $w$ is about **6%**; the hybrid is **4.5%**.
- **MagicPIG gets most of the way but not all.** At 2.1% of the keys its error is **16.4%**, at 5.1% **12.5%**, both worse than oracle TopK at the same budget (12.1% and 7.6%). It beats TopK in 6 of the 28 layers: the ones where TopK is worst, and attention is least concentrated.
- **Centring is essential.** Without it, the error rises to **36 to 50%**.
- **The exact tokens carry a lot.** Without the sink and the local window kept exact, MagicPIG's error is **48 to 64%**. The sink and window alone, 0.4% of the keys, give 40%.
:::

Two caveats keep this in proportion. First, the three curves are oracles: they need every score, which costs half of full attention, while MagicPIG reads 0.2% of the key bytes to choose. Second, relative error of the attention output is a proxy. The paper's own Appendix B finds that the estimator with the lowest variance is *worse* downstream. Our measurement tests the mechanism on its own terms, not the paper's benchmark scores.

## Raised eyebrows {#doubts}

::: qa 1. Is attention really "not sparse"?
Partly. The paper shows the top 20% of keys covering only 70 to 80% of the weight in some layers, on tasks built to need the whole context (count the most common words). On our novel, the top 20% cover **97%** on average, never less than 91%, and **96%** with the sink removed. The [[entropy]] of the weights says the same: the effective number of keys, $e^{H(w)}$, is **1.8%** of the context (3.7% without the sink). Sparsity depends on the task. The claim to take away is narrower and still important: when the weight *is* spread, TopK's bias is large, and sampling handles it.
:::

::: qa 2. TopK or sampling: why choose?
The paper sets them up as rivals. The textbook answer is to stratify: take the heavy items exactly and sample the rest, which removes TopK's bias and most of sampling's variance. Our hybrid oracle does this and wins at every budget. MagicPIG is in fact such a hybrid already: the sink and the last 64 tokens are kept exact, and our measurement says they matter more than any other component. A year later, vAttention ([arXiv:2510.05688](https://arxiv.org/abs/2510.05688), ICLR 2026) made "top-k plus sampling" the method and attached (ε, δ) guarantees to it.
:::

::: qa 3. What do the "theoretical guarantees" guarantee?
The estimator is unbiased (more precisely, consistent; a ratio of two unbiased sums is slightly biased) *over the random draw of the hyperplanes*. But the hyperplanes are drawn once, and shared by every head, layer and token of a generation. For a given model run, which keys are sampled is a deterministic function of their angles. There is no bound on the error of a particular output, and the variance can be large: $u_i$ follows the *angle* to the query while $w_i$ follows the *dot product*, so a long key at a moderate angle has a large weight and a small chance of being sampled. The paper describes the standard trick that turns dot products into angles ([[MIPS]] to cosine, Eq. 8), then reports that it does not use it, because it did not help.
:::

::: qa 4. Who deserves the credit?
The sink and the local window are kept exact on the GPU, and two whole layers (0 and 16 on Llama) are never approximated. The paper does not report what those choices alone achieve. In our measurement, removing the exact tokens hurts more than removing centring. That does not make the method wrong, but a fair comparison needs a "sink + window + a few exact layers" baseline at the same budget.
:::

::: qa 5. "Less than 2% degradation"?
On average, mostly. Within the tables there are bigger drops. Table 1: GSM8K on Llama-3.1-8B goes from 77.6 to 72.7. Table 3: Llama3-8B-ProLong on RULER from 88.2 to 83.6 at the default (10, 150). Table 6, multi-step arithmetic (5 operations): **26.8 → 11.7** at (10, 150), recovering to 20.7 at (10, 300). Reasoning chains compound small errors in every step, and that is where the cheapest settings hurt most. On LongBench, the paper's main baseline Quest is within a point of MagicPIG (70.6 against 70.3 and 70.7).
:::

::: qa 6. How fast, against what?
The RTX 4090 result (54 ms per token at 96k) is simulated, on an L20 GPU with a memory cap, against full attention on the CPU with an estimated bandwidth. Most of the throughput gain comes from fitting much larger batches once the KV cache is off the GPU. The obvious competitor for that, compressing the cache with 2- to 4-bit quantization (KIVI and QServe, which the paper cites; Parts 3 and 4 of this book), is not in the comparison. Headline numbers also changed between arXiv versions, so cite the version you read.
:::

::: qa 7. What about RoPE?
The keys being hashed are the rotated keys: rotary position embeddings turn each pair of coordinates by a position-dependent angle. The paper does not discuss how much of the cone, or of the query–key mismatch, comes from position rather than content. A later paper from the FAISS group, Saap ([arXiv:2502.08246](https://arxiv.org/abs/2502.08246)), argues that RoPE and the different query and key distributions are exactly why shared partitions fail, and learns separate partitions for queries and keys instead.
:::

## What it suggests {#suggests}

::: cards
- **"Close enough" depends on the consumer**{.k-q}
  Recall@k is the right metric when a human reads a list. When a model averages the results, the right metric is the error of the average, and an unbiased sample can beat the true top k. RAG systems that summarize many retrieved passages are closer to the second case than to the first.
- **Randomness you can account for**{.k-code}
  A clever index with unknown inclusion probabilities can only be as good as its recall. A dumb random one with *known* probabilities supports an unbiased estimator. RaBitQ's unbiased distance estimates in [[@bits-as-sketches]] make the same trade.
- **KV vectors are embeddings, pathologies included**{.k-vec}
  Anisotropy, a stable mean direction, hubs: the key cloud inside an LLM has the same shape problems as a sentence-embedding cloud, and the same first fix, centring. The sink is the extreme hub, and here it has a job.
- **The bits are not where they should be**{.k-bits}
  MagicPIG spends 1,500 hash bits (and 600 bytes of pointers) per key to *choose* keys, then reads the 512-byte key and value at full precision. The rest of this book suggests the opposite allocation: compressed keys to choose with, as in [[ADC]], and exact values only where the weight is.
:::

::: check
- Attention's output is an expectation under the softmax weights. TopK is biased by exactly the dropped mass times the gap between dropped and kept values; sampling is unbiased.
- Keys sit in a narrow cone, queries point away from it, and the first token's key is a near-constant sink. Centring the keys is free for the softmax and essential for hashing.
- SimHash gives each key a known sampling probability from its angle alone, and dividing by it (subtracting $\log u$ in the softmax) makes the estimate unbiased.
- On our re-run, the budgets reproduce, oracle sampling beats oracle TopK, and MagicPIG lands between them, carried largely by the exact sink and local tokens.
- The hash tables are larger than the KV cache. The method moves memory to the CPU; it does not save it.
:::
