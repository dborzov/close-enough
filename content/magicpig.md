---
title: "MagicPIG: don't pick the tallest"
kicker: Paper club · Chen et al., 2024
goal: Fast attention usually reads only the highest-scoring keys. MagicPIG argues that this answers the wrong question, samples instead, and turns the humblest hash in this book into exactly the right tool. We follow the argument with toys, re-measure it on a real model, and say where we are not convinced.
---

::: lede
You need the average height of 100,000 people, and you may measure only 2,000 of them. Which 2,000? Not the tallest, obviously: you would get the height of a basketball team. You would pick at random. Keeping only the highest attention weights makes a related mistake: it can lose the combined contribution of many small weights. MagicPIG explores this failure, and its fix leads somewhere unexpected: to [[SimHash]], the random-hyperplane hash from Part 5 that we had written off as too dumb for real data.
:::

::: aside The paper
Chen, Sadhukhan, Ye, Zhou, Zhang, Nolte, Tian, Douze, Bottou, Jia, Chen. *MagicPIG: LSH Sampling for Efficient LLM Generation.* [arXiv:2410.16179v4](https://arxiv.org/abs/2410.16179v4), ICLR 2025 spotlight. We read v4 (December 2024). CMU and Meta; Matthijs Douze co-wrote FAISS. [Code](https://github.com/Infini-AI-Lab/MagicPIG).
:::

::: cards four
- **The problem**{.k-res}
  Every new token reads every cached key and value. At long context that is most of the work.
- **The usual fix**{.k-book}
  Find the few keys with the highest scores. Ignore the rest.
- **The objection**{.k-q}
  Keeping only the largest weights can miss the crowd. Sampling can account for it.
- **The trick**{.k-code}
  A hash that knows how likely it was to pick each key.
:::

## 12 GiB for every new token {#cost}

An LLM generates one **token** at a time: a word, a piece of a word, or punctuation. In each layer, attention heads produce a [query]{.k-q}, a vector describing what to look for. They compare it with the cached [keys]{.k-book} of earlier tokens, turn those scores into weights with a softmax, and average the corresponding [values]{.k-dec}. Keys decide how much to listen; values carry what is said. That is the soft nearest-neighbour lookup of [[@rhymes]], with the [[KV cache]] as the database.

Do the [napkin arithmetic](@napkin-math) for Llama-3.1-8B holding a 96k-token document (here 96 × 1,024 = 98,304 tokens): 32 layers × 8 key–value heads × 128 numbers × 2 (key and value) × 2 bytes is 128 KiB per token. That is ==12 GiB, read in full, for every new token it writes==. At a hypothetical sustained 1 TB/s, those bytes alone take about 13 ms to read. This is a bandwidth estimate for a single sequence, not a measured decoding time.

::: aside Why reading, not computing
During single-sequence decoding, each cached key and value is used for relatively little arithmetic. Reading the cache can dominate long-context attention. Reducing those reads helps, though model weights, hashing, transfers and other layers still take time.
:::

The obvious idea, if you have read Part 2: when most of the softmax weight lands on a handful of keys, find those with an index and skip the rest. This is [[TopK attention]], and it is what most fast-attention methods approximate.

MagicPIG's first move is to ask whether TopK is even the right target.

::: pull
Attention does not want the nearest keys. It wants an *average*.

A search engine returns a list, and you judge it by recall. Attention returns a weighted mean of the values, and a mean has its own rules.
:::

## Picking the tallest {#tallest}

Here is a picture that makes the difference visible. Pretend each value is a single number, and put each token on a number line at its value. Draw it as a stick whose height is its attention weight. The attention output is then the **balance point** of all the sticks. In the formula, $i$ runs over cached tokens, $d$ is the number of coordinates in a head, and $q\cdot k_i$ is its query–key dot product. Softmax exponentiates these scaled scores and divides by their sum, so the weights $w_i$ are positive and add to 1:

$$ \kdec{o} \;=\; \sum_i w_i\, \kdec{v_i}, \qquad w_i = \operatorname{softmax}_i\!\big(\kq{q}\cdot\kbook{k_i}/\sqrt d\big) $$

TopK keeps the tallest sticks and finds *their* balance point. Sampling draws tokens independently **with replacement**, each with probability equal to its weight, and averages their values. A token drawn twice counts twice, even though its value only needs to be loaded once. The height analogy motivates sampling; the stick picture shows the actual weighted problem.

::: widget pig-topk | TopK against sampling
**Pick a scenario, then draw samples** Red sticks are the ones TopK reads. The red arrow is how far its answer misses. Each purple dot uses as many draws as TopK reads tokens; repeated draws need only one value load.
:::

::: try Three situations
1. **One needle.** A single token holds 92% of the weight. TopK with *one* token is within 0.02 of the truth. This is the world TopK was designed for.
2. **A loud few, a quiet crowd.** Six tokens score high and say one thing; thirty-four score lower and say another. TopK reads the six loudest, which hold 39% of the weight, and answers **0.21**. The truth is **0.55**. Drag the budget up: the error shrinks slowly, because every quiet token is individually unimpressive.
3. **Draw 200 samples** in the same scenario. Each estimate wobbles, but the cloud sits on the truth. The TopK arrow never moves: run it a thousand times and you get the same wrong answer a thousand times.
:::

That last point is the whole argument, and one line of algebra makes it exact.

::: key TopK misses by a fixed amount
Call the weight TopK keeps $M$, the balance point of the kept sticks $\kdec{a}$ and of the skipped ones $\kdec{b}$. Then the truth is $o = M a + (1-M)\, b$, TopK answers $a$, and

$$ \kres{o - \hat o_{\text{TopK}}} \;=\; (1 - M)\,(\kdec{b} - \kdec{a}). $$

**The weight it skipped, times how different the skipped tokens are.** That is a bias: no amount of repetition removes it.
:::

Sampling has the opposite character. It is [[unbiased]], and its typical miss shrinks like $1/\sqrt{B}$ with the number of draws $B$. It does not care how the weight is spread, only how much the values disagree:

$$ \mathbb{E}\,\hat o_{\text{sample}} = o, \qquad \mathbb{E}\,\lVert \hat o_{\text{sample}} - o\rVert^2 = \frac{1}{B}\;\mathbb{E}_{i\sim w}\lVert v_i - o\rVert^2. $$

::: aside When is attention a crowd?
Ask a model "which word appears most often in this document?" The answer lives in thousands of small weights, not a few large ones. The paper's Figure 1 shows exact TopK collapsing on exactly such tasks while doing fine on needle-in-a-haystack.
:::

::: aside Peaked is cheap too
When one key dominates, most draws hit it and you only read it once. The paper's Theorem 3.3: $B$ draws touch at most $1 + B(1 - \max_i w_i)$ distinct keys, on average.
:::

Try the **sink** scenario before moving on. One token takes half the weight and contributes almost nothing; everyone else is flat. TopK grabs the sink and a few neighbours, and lands near 0.2 when the truth is 0.35. Remember this one: real models do it, and we will meet it again.

## The catch: you cannot sample without looking {#catch}

There is an obvious problem. To sample keys in proportion to their weights you need the weights, and the weights need every score $\kq{q}\cdot\kbook{k_i}$. Computing every score still requires reading all the keys. It saves the value reads, but leaves much of attention's work intact. The paper calls this the *oracle*, and it saves almost nothing.

So we need to sample from something *cheap* that is only roughly right, and then repair the "roughly". Statisticians have done this for seventy years. It is [[importance sampling]]: draw from a convenient guess $u$, and weigh each draw by how much the guess under- or over-sampled it.

$$ \hat o \;=\; \frac{\sum_{\text{draws } i} \frac{w_i}{u_i}\, \kdec{v_i}}{\sum_{\text{draws } i} \frac{w_i}{u_i}} $$

::: widget pig-importance | Importance sampling
**Slide the guess from uniform to exact** The purple bars are where we can afford to sample; the grey sticks are where we should. Red dots average the draws as they come; green dots re-weight them by w / u.
:::

::: try Break the guess
1. Slide the guess all the way to **uniform**. The plain average (red) now answers a different question entirely: the unweighted mean of all tokens. The correction pulls the green estimates toward the truth, but with few draws their average can still miss it.
2. Slide to **exact**. The two rows coincide: that is the oracle.
3. Raise **draws per estimate** and watch the green cloud tighten. Matching the true weights helps in this toy; a poor guess can cause both large variance and finite-sample bias.
:::

::: aside The softmax hides a gift
We never know $w_i$ itself, because its denominator sums over every key. But the same unknown denominator appears on the top and bottom of $\hat o$ and cancels. All we need is $e^{\kq{q}\cdot\kbook{k_i}/\sqrt d}$ for the keys we actually drew.
:::

There is a price for cancelling that unknown denominator. This is **self-normalized** importance sampling: a ratio of two random sums. Unlike the direct sampling average above, it is generally **biased at finite sample sizes**. With independent draws and a positive proposal probability wherever $w_i>0$, it converges to the right answer as the number of draws grows.

Look at what the correction needs: for every key we drew, we must know its sampling probability $u_i$. It must also be positive for every key that contributes. Ordinary deterministic HNSW or IVF retrieval leaves some keys with zero chance, so it cannot supply this correction for the omitted keys. A randomized index could in principle work; SimHash makes the probabilities particularly easy to compute.

So the question becomes: **is there a cheap way to pick keys that knows its own odds?** Before answering, look at what the keys are like.

## Where the keys live {#geometry}

Part 1 taught us to look at the cloud before choosing a tool ([[@shape-of-the-cloud]]). The paper does exactly that for keys and queries, and finds something that shapes everything after. We repeated the measurement on a different model, a different text and a different tokenizer.

::: widget pig-cone | Two cones and a sink
**Switch between the views** Every key and query of Qwen2.5-1.5B-Instruct reading the first 16,384 tokens of *Emma*. *One head*: how keys and queries spread around the mean key direction. *One query*: its cosine with every key, before and after subtracting the mean key. *All layers*: the same through the network.
:::

::: measured Three findings that held up
- **Keys crowd into a narrow cone.** Average cosine with the mean key: **0.67**. Unrelated random directions would average near 0. This is [[anisotropy]], the same lean as sentence embeddings.
- **Queries point away from it.** Their cosine with the mean key averages **−0.24**. For an index, the questions come from a different place than the data.
- **The first token's key is a constant.** Start the text with 32 different tokens: the key at position 0 barely moves (cosine **0.99**). Its value is short (**0.35×** an average value's length), and it takes **24%** of all attention.
:::

That first-token key is the [[attention sink]]. The softmax *must* hand out a total weight of 1, even when nothing in the context is relevant. One interpretation is that training gives the model a place to park weight on a token whose short value changes the output relatively little. It acts like "none of the above", and it is the sink scenario from the toy above.

::: aside A hub by design
In [[@shape-of-the-cloud]], [[hubness|hubs]] were passages close to everybody, an accident of the geometry. Here the hub appears to serve a useful role. Some newer architectures make it explicit, with a learned per-head "nothing" slot in the softmax.
:::

Now think of hashing these keys with random hyperplanes. It goes badly.

## A hash that knows its odds {#hash}

[[@lsh-idea]] built [[SimHash]] from one fact: a random hyperplane separates two vectors with probability $\theta/\pi$, where $\theta$ is the angle between them. Take $K$ hyperplanes, write down which side of each a vector falls on, and you have a $K$-bit bucket. Vectors pointing the same way tend to share buckets.

Here is the picture in two dimensions, with keys shaped like the real ones.

::: widget pig-hash | Hashing a cone
**Toggle between raw and centred keys, and drag the query** Grey lines are random hyperplanes, and they cut the plane into buckets. The shaded wedge is the query's bucket. Ringed keys share it. Dot size is attention weight.
:::

With raw keys, nothing works. The keys sit in one narrow cone and the query points elsewhere, so the query's bucket is nearly empty. The paper's ablation found that **fewer than 0.1%** of keys ever collided with the query, and retrieval accuracy fell to almost zero.

Now press **centred keys**. The cone slides onto the origin, the lines slice through it, and the keys that land in the query's wedge point its way. This can favour high scores, although key length matters too. And attention does not notice, because every score shifts by the same amount:

$$ \kq{q}\cdot(\kbook{k_i} - \mu) \;=\; \kq{q}\cdot\kbook{k_i} \;-\; \underbrace{\kq{q}\cdot\mu}_{\text{the same for every key}} $$

and the softmax ignores anything added equally to every score. This is the same one-line fix that every compression method in Part 3 applies first. Here it is free, and it decides whether the method works at all.

::: aside Only one side can move
You may shift the keys but not the query: subtracting something from $q$ would change each score by a different amount. Part 4 met the same asymmetry in [[ADC]]: the stored and query sides can be treated differently. Here it is specifically a common translation of the keys that preserves attention; arbitrary transformations would not.
:::

The toy drew repeated independent samples from a distribution whose probabilities sum to 1. MagicPIG instead selects a **set** $S$: each key is included once or left out. Now $u_i$ means the probability that key $i$ is included, not the probability of a single draw; the $u_i$ need not sum to 1. The same ratio uses one $\tilde w_i/u_i$ contribution per selected key. Keys' inclusion events may be correlated because they share hyperplanes.

Here is the payoff. Because SimHash collides with probability $1 - \theta/\pi$ per bit, the chance that a key is picked is ==a formula of its angle to the query, and nothing else==. MagicPIG builds $L$ tables of $K$ bits and samples a key if it shares the query's bucket in **at least two** of them:

$$ \kcode{u_i} \;=\; 1 - (1-p_i^{K})^{L} - L\,p_i^{K}(1-p_i^{K})^{L-1}, \qquad p_i = 1 - \frac{\theta(\kq{q},\ \kbook{k_i} - \mu)}{\pi}. $$

Assume the bits and tables use independent random hyperplanes. Then $p_i^K$ is a collision in one table, and the formula subtracts the probabilities of zero hits and exactly one hit from 1. The first two terms are the S-curve from [[@lsh-amplification]]: none of the $L$ tables collide, versus at least one. The third removes keys that collide in exactly one, which makes the curve steeper. Here it is over one real query's 16,384 keys:

::: widget pig-scurve | The sampling curve on real keys
**Set K and L, and compare requiring one collision with requiring two** The curve is the probability that a key is sampled, given its cosine with the query. Grey: how many of this query's centred keys sit at each cosine. Green: where its attention weight sits; the spike is the sink.
:::

::: key Dumb turns out to be the point
Part 5 called LSH's obliviousness its weakness: it ignores the data, so learned indexes beat it. But obliviousness is exactly what makes $u_i$ computable from one arccos. A learned index may find better neighbours, but its ordinary retrieval rule does not supply positive, known inclusion probabilities for the whole population. SimHash supplies the ingredient this estimator needs.
:::

The core estimator, for one query, is five lines. $S$ excludes the exact set (sink and recent tokens), so no token is counted twice. `s_exact` contains their ordinary attention scores. This is a mathematical sketch; production code also needs stable probability arithmetic and handling of zero-length vectors:

```python MagicPIG's estimate for one query | after Algorithm 1
s = (K_S @ q) / np.sqrt(d)                     # scores of the sampled keys only
p = 1 - np.arccos(cos(q, K_S - mu)) / np.pi    # SimHash: chance one bit agrees
u = 1 - (1 - p**K)**L - L * p**K * (1 - p**K)**(L - 1)
w = softmax(np.concatenate([s - np.log(u), s_exact]))   # sink + recent tokens: exact
o_hat = w @ np.concatenate([V_S, V_exact])
```

::: aside −log u is a surprisal
In Part 6's language, $-\log_2 u_i$ is the number of bits of surprise in "key $i$ was sampled". The code uses natural logs, so its score correction is in nats; multiply the bit surprisal by $\ln 2$ to get the same quantity. A rarely sampled key gets a larger correction: it counts for more when it does turn up.
:::

## The bill {#bill}

LSH has a well-known price, and [[@lsh-amplification]] warned about it: every table stores a pointer to every key.

::: widget pig-memory | The memory bill
**Slide K and L** Bytes per key, per layer, per head. The paper's settings put $L$ between 75 and 150.
:::

At the paper's default (10, 150), the tables are ==bigger than the KV cache they index==: 600 bytes of 32-bit token indices beside a 512-byte key–value pair. Across 98,304 tokens, 32 layers and 8 KV heads, that is **14.1 GiB of table entries plus 12 GiB of KV data**, before bucket metadata and other overhead. Table 8 reports roughly 14 GB of tables. The figure also shows packed hash bits as a separate, optional storage cost; they are not another mandatory copy of the tables.

Finding candidates is cheap *in bytes*, under the simplifying assumption of evenly filled buckets. A query scans about $L n/2^K = 14{,}400$ entries, or 57,600 bytes of indices. That is **0.23% of the 25,165,824 key bytes** for one KV head in one layer. It excludes reading the selected keys and values, computing hashes, and counting duplicate hits. Small byte traffic does not mean zero elapsed time.

The system's aim is to save **GPU memory**. Most cached keys and values, the tables, and sampled attention computation move to the CPU; the GPU runs the model, computes hashes, and handles the exact attention subset. This lets larger contexts or batches fit in VRAM, at the cost of more total memory and a dependency on CPU bandwidth.

## Did it work? We checked {#measured}

We re-implemented the sampling estimator in Algorithm 1 from the paper's description and ran it on every head of every layer of Qwen2.5-1.5B, at the last 64 positions of the same 16k-token text: 21,504 attention rows. We compared it with three *oracles* that may see every score: TopK, sampling from the true weights, and a hybrid that reads the top half of its budget exactly and samples the rest.

::: widget pig-estimators | Estimators at a budget
**Turn centring and the exact sink and local tokens on and off** Lines: the oracles at budgets from 0.1% to 20% of the keys. Diamonds: MagicPIG at the paper's three settings. Square: the sink and the 64 most recent tokens alone.
:::

Error here means $\lVert \hat o-o\rVert_2/\lVert o\rVert_2$, averaged over attention rows. Budgets count **distinct keys read**, including the exact subset; the oracle sampling curves count repeated draws only once. This checks attention outputs on one fixed input, not generation quality or system speed. We used one hash seed and did not reproduce the CPU–GPU serving system.

::: measured What we found
- **The budgets reproduce.** (8, 75), (9, 120) and (10, 150) read **5.1%, 3.9% and 2.1%** of the keys; the paper says 5%, 4% and 2%.
- **Sampling beats TopK, as an oracle.** At a 2% budget TopK misses by **12.1%**, sampling by about **6%**, the hybrid by **4.5%**.
- **MagicPIG trails the oracles on average.** **16.4%** at 2.1% of the keys, **12.5%** at 5.1%: worse than oracle TopK at the same budget, but without ever computing the scores TopK needs. It wins in 6 of the 28 layers, the ones where attention is most spread out.
- **Centring is essential.** Without it: **36–50%**.
- **The exact tokens do a lot of the work.** Without the sink and recent tokens kept exact: **48–64%**.
:::

::: aside A proxy, honestly
We measure the error of the attention output, as the paper's own Figures 4 and 6 do. Downstream accuracy is a different thing: the paper's Appendix B finds that the lowest-variance estimator is *worse* on benchmarks.
:::

## Raised eyebrows {#doubts}

The core idea is right, and it is a good one. These are the questions we would put to the authors.

::: qa Is attention really "not sparse"?
**Depends on the task.** The paper's 70–80% coverage for the top 20% of keys comes from tasks built to need everything (counting words). On our novel the top 20% hold **97%** of the weight, 96% without the sink. The [[entropy]] agrees: the effective number of keys, $e^{H(w)}$, is under 2% of the context. The lasting claim is narrower: *when* weight is spread, TopK's bias is large.
:::

::: qa Why choose between TopK and sampling?
**You shouldn't.** The textbook answer is to stratify: read the heavy keys exactly and sample the rest. Our oracle hybrid does that and has lower average error across the measured budget range. Finding the heavy keys cheaply is still the unsolved part of this baseline. MagicPIG is secretly such a hybrid already, since the sink and recent tokens are kept exact. vAttention ([arXiv:2510.05688](https://arxiv.org/abs/2510.05688), ICLR 2026) later made "top-k plus sampling" the method itself.
:::

::: qa What do the "theoretical guarantees" guarantee?
**The oracle guarantee does not transfer unchanged.** The numerator and denominator sums are individually unbiased over random hyperplanes when inclusion probabilities are positive. Their ratio generally is not. The independent-draw convergence result in Section 4.1 also does not by itself prove the same result for correlated LSH inclusions. With a fixed hash seed, the selected set for a fixed query and cache is deterministic; later queries can still select different sets. And $u_i$ follows the angle while $w_i$ follows the dot product, so a long key at a modest angle gets a big weight and a small chance: high variance. The paper describes the standard dot-product-to-angle trick for [[MIPS]] (its Eq. 8), then reports that it does not use it.
:::

::: qa Who deserves the credit?
**Unclear.** The sink and the 64 most recent tokens are always exact, and two whole layers are never approximated. The paper never reports what those alone achieve. In our run they matter more than centring.
:::

::: qa "Less than 2% degradation"?
**On average.** Inside the tables: GSM8K falls from 77.6 to 72.7, and five-step arithmetic from **26.8 to 11.7** at the default setting. Long chains of reasoning compound small errors at every step.
:::

::: qa How fast, against what?
**Hardware details and baselines matter.** The RTX 4090 result is simulated on another GPU with a memory cap. Most of the throughput gain comes from bigger batches once the cache leaves the GPU. Compressing the cache to 2–4 bits also reduces VRAM use, with different accuracy and bandwidth tradeoffs. A comparison with that alternative (Parts 3 and 4 of this book) would help establish when offloading plus sampling wins.
:::

::: aside What about RoPE?
The hashed keys have been rotated by [[RoPE]]. How much of the cone, and of the query–key mismatch, is position rather than content? The paper doesn't say. A later paper from the FAISS group, [Saap](https://arxiv.org/abs/2502.08246), blames exactly this for shared partitions failing, and learns separate ones for queries and keys.
:::

## What it suggests {#suggests}

::: cards
- **"Close enough" depends on who is asking**{.k-q}
  Recall@k is right when a person reads a list. When a model averages the results, the error of the average is what counts, and a random sample can beat the true top k. A RAG system that summarizes twenty passages is closer to the second case.
- **Randomness you can account for**{.k-code}
  A clever index with unknown odds is only as good as its recall. A random one with *known*, positive odds supports an inclusion-corrected estimate; normalizing it still introduces finite-sample bias. RaBitQ's unbiased distances in [[@bits-as-sketches]] make the same trade.
- **KV vectors are embeddings, quirks included**{.k-vec}
  A lopsided cone, a stable mean direction, a giant hub: the key cloud inside an LLM has the shape problems of a sentence-embedding cloud, and the same first fix.
- **The bits are in the wrong place**{.k-bits}
  MagicPIG computes 1,500 hash bits and stores 600 bytes of table entries per key to *choose* keys, then reads the selected keys and values at bfloat16 precision. The rest of this book suggests the reverse: small codes to choose with, as in [[ADC]], and full precision only where the weight is.
:::

::: check
- Attention's output is an average. TopK misses it by (skipped weight) × (how different the skipped values are), every time; direct sampling from the true weights is unbiased.
- Sampling from a cheap guess needs known, positive probabilities and inverse-probability weighting. The normalized ratio can still be biased at finite sample sizes.
- Keys sit in a cone, queries point away, and the first token is a constant sink. Centring the keys is free for the softmax and essential for hashing.
- SimHash gives each key a sampling probability from its angle alone, which is what makes the correction possible.
- On a real model the idea mostly holds up; the exact sink and recent tokens carry much of the weight, and the hash tables outweigh the cache.
:::
