---
title: "MagicPIG: don't pick the tallest"
kicker: Paper club · Chen et al., 2024
goal: Fast attention usually reads only the highest-scoring keys. MagicPIG argues that this answers the wrong question, samples instead, and turns the humblest hash in this book into exactly the right tool. We follow the argument with toys, re-measure it on a real model, and say where we are not convinced.
---

::: lede
You need the average height of 100,000 people, and you may measure only 2,000 of them. Which 2,000? Not the tallest, obviously: you would get the height of a basketball team. You would pick at random. Yet almost every trick for making an LLM's attention fast does the first thing. This paper noticed, and its fix leads somewhere unexpected: to [[SimHash]], the random-hyperplane hash from Part 5 that we had written off as too dumb for real data.
:::

::: aside The paper
Chen, Sadhukhan, Ye, Zhou, Zhang, Nolte, Tian, **Douze**, **Bottou**, Jia, Chen. *MagicPIG: LSH Sampling for Efficient LLM Generation.* [arXiv:2410.16179](https://arxiv.org/abs/2410.16179), ICLR 2025 spotlight. We read v4 (December 2024). CMU and Meta; Matthijs Douze co-wrote FAISS. [Code](https://github.com/Infini-AI-Lab/MagicPIG).
:::

::: cards four
- **The problem**{.k-res}
  Every new token reads every cached key and value. At long context that is most of the work.
- **The usual fix**{.k-book}
  Find the few keys with the highest scores. Ignore the rest.
- **The objection**{.k-q}
  That answer is biased. A random sample is not.
- **The trick**{.k-code}
  A hash that knows how likely it was to pick each key.
:::

## 12 GiB for every word {#cost}

When an LLM writes a word, each layer's [query]{.k-q} is compared with the [key]{.k-book} of every earlier token, and the [values]{.k-dec} are averaged with the resulting weights. That is the soft nearest-neighbour lookup of [[@rhymes]], with the [[KV cache]] as the database.

Do the [napkin arithmetic](@napkin-math) for Llama-3.1-8B holding a 96k-token document: 32 layers × 8 key–value heads × 128 numbers × 2 (key and value) × 2 bytes is 128 KiB per token. That is ==12 GiB, read in full, for every single word it writes==. At a GPU's 1 TB/s, that is 12 ms of pure reading per token, before any arithmetic.

::: aside Why reading, not computing
Generating one token at a time does very little arithmetic per byte fetched, so the speed limit is memory bandwidth. Halve the bytes you read and you nearly halve the time.
:::

The obvious idea, if you have read Part 2: most of the softmax weight lands on a handful of keys. So find those with an index, read only them, skip the rest. This is [[TopK attention]], and it is what most fast-attention methods approximate.

MagicPIG's first move is to ask whether TopK is even the right target.

::: pull
Attention does not want the nearest keys. It wants an *average*.

A search engine returns a list, and you judge it by recall. Attention returns a weighted mean of the values, and a mean has its own rules.
:::

## Picking the tallest {#tallest}

Here is a picture that makes the difference visible. Pretend each value is a single number, and put each token on a number line at its value. Draw it as a stick whose height is its attention weight. The attention output is then the **balance point** of all the sticks:

$$ \kdec{o} \;=\; \sum_i w_i\, \kdec{v_i}, \qquad w_i = \operatorname{softmax}_i\!\big(\kq{q}\cdot\kbook{k_i}/\sqrt d\big) $$

TopK keeps the tallest sticks and finds *their* balance point. Sampling picks sticks at random, each with probability equal to its height, and averages where they stand.

::: widget pig-topk | TopK against sampling
**Pick a scenario, then draw samples** Red sticks are the ones TopK reads. The red arrow is how far its answer misses. Each purple dot is one sampling estimate that reads the same number of tokens.
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

There is an obvious problem. To sample keys in proportion to their weights you need the weights, and the weights need every score $\kq{q}\cdot\kbook{k_i}$. Computing every score is half the cost of attention. The paper calls this the *oracle*, and it saves almost nothing.

So we need to sample from something *cheap* that is only roughly right, and then repair the "roughly". Statisticians have done this for seventy years. It is [[importance sampling]]: draw from a convenient guess $u$, and weigh each draw by how much the guess under- or over-sampled it.

$$ \hat o \;=\; \frac{\sum_{\text{draws } i} \frac{w_i}{u_i}\, \kdec{v_i}}{\sum_{\text{draws } i} \frac{w_i}{u_i}} $$

::: widget pig-importance | Importance sampling
**Slide the guess from uniform to exact** The purple bars are where we can afford to sample; the grey sticks are where we should. Red dots average the draws as they come; green dots re-weight them by w / u.
:::

::: try Break the guess
1. Slide the guess all the way to **uniform**. The plain average (red) now answers a different question entirely: the unweighted mean of all tokens. The re-weighted answer (green) is still centred on the truth; it is just noisier.
2. Slide to **exact**. The two rows coincide: that is the oracle.
3. In between, a better guess means a tighter green cloud. A bad guess costs samples, never correctness.
:::

::: aside The softmax hides a gift
We never know $w_i$ itself, because its denominator sums over every key. But the same unknown denominator appears on the top and bottom of $\hat o$ and cancels. All we need is $e^{\kq{q}\cdot\kbook{k_i}/\sqrt d}$ for the keys we actually drew.
:::

Look at what the correction needs: for every key we drew, ==the exact probability $u_i$ that we would draw it==. Not an estimate, not a rank: the probability. That rules out almost every index in Part 2. An HNSW graph or an IVF list either returns a key or it doesn't, and it cannot tell you the odds.

So the question becomes: **is there a cheap way to pick keys that knows its own odds?** Before answering, look at what the keys are like.

## Where the keys live {#geometry}

Part 1 taught us to look at the cloud before choosing a tool ([[@shape-of-the-cloud]]). The paper does exactly that for keys and queries, and finds something that shapes everything after. We repeated the measurement on a different model, a different text and a different tokenizer.

::: widget pig-cone | Two cones and a sink
**Switch between the views** Every key and query of Qwen2.5-1.5B-Instruct reading the first 16,384 tokens of *Emma*. *One head*: how keys and queries spread around the mean key direction. *One query*: its cosine with every key, before and after subtracting the mean key. *All layers*: the same through the network.
:::

::: measured Three findings that held up
- **Keys crowd into a narrow cone.** Average cosine with the mean key: **0.67**. Random directions would give 0. This is [[anisotropy]], the same lean as sentence embeddings.
- **Queries point away from it.** Their cosine with the mean key averages **−0.24**. For an index, the questions come from a different place than the data.
- **The first token's key is a constant.** Start the text with 32 different tokens: the key at position 0 barely moves (cosine **0.99**). Its value is short (**0.35×** an average value's length), and it takes **24%** of all attention.
:::

That first-token key is the [[attention sink]]. The softmax *must* hand out a total weight of 1, even when nothing in the context is relevant. The model learns to park the leftover weight on the first token, whose short value adds little to the output. It is a built-in "none of the above", and it is the sink scenario from the toy above.

::: aside A hub by design
In [[@shape-of-the-cloud]], [[hubness|hubs]] were passages close to everybody, an accident of the geometry. The sink is a hub on purpose. Some newer architectures make it explicit, with a learned per-head "nothing" slot in the softmax.
:::

Now think of hashing these keys with random hyperplanes. It goes badly.

## A hash that knows its odds {#hash}

[[@lsh-idea]] built [[SimHash]] from one fact: a random hyperplane separates two vectors with probability $\theta/\pi$, where $\theta$ is the angle between them. Take $K$ hyperplanes, write down which side of each a vector falls on, and you have a $K$-bit bucket. Vectors pointing the same way tend to share buckets.

Here is the picture in two dimensions, with keys shaped like the real ones.

::: widget pig-hash | Hashing a cone
**Toggle between raw and centred keys, and drag the query** Grey lines are random hyperplanes, and they cut the plane into buckets. The shaded wedge is the query's bucket. Ringed keys share it. Dot size is attention weight.
:::

With raw keys, nothing works. The keys sit in one narrow cone and the query points elsewhere, so the query's bucket is nearly empty. The paper's ablation found that **fewer than 0.1%** of keys ever collided with the query, and retrieval accuracy fell to almost zero.

Now press **centred keys**. The cone slides onto the origin, the lines slice through it, and the keys that land in the query's wedge are the ones pointing its way: the heavy ones. And attention does not notice, because every score shifts by the same amount:

$$ \kq{q}\cdot(\kbook{k_i} - \mu) \;=\; \kq{q}\cdot\kbook{k_i} \;-\; \underbrace{\kq{q}\cdot\mu}_{\text{the same for every key}} $$

and the softmax ignores anything added equally to every score. This is the same one-line fix that every compression method in Part 3 applies first. Here it is free, and it decides whether the method works at all.

::: aside Only one side can move
You may shift the keys but not the query: subtracting something from $q$ would change each score by a different amount. Part 4 met the same asymmetry in [[ADC]]: the stored side can be transformed at will, and the query is taken as it comes.
:::

Here is the payoff. Because SimHash collides with probability $1 - \theta/\pi$ per bit, the chance that a key is picked is ==a formula of its angle to the query, and nothing else==. MagicPIG builds $L$ tables of $K$ bits and samples a key if it shares the query's bucket in **at least two** of them:

$$ \kcode{u_i} \;=\; 1 - (1-p_i^{K})^{L} - L\,p_i^{K}(1-p_i^{K})^{L-1}, \qquad p_i = 1 - \frac{\theta(\kq{q},\ \kbook{k_i} - \mu)}{\pi}. $$

The first two terms are the S-curve from [[@lsh-amplification]]: none of the $L$ tables collide, versus at least one. The third removes keys that collide in exactly one, which makes the curve steeper. Here it is over one real query's 16,384 keys:

::: widget pig-scurve | The sampling curve on real keys
**Set K and L, and compare one table with two** The curve is the probability that a key is sampled, given its cosine with the query. Grey: how many of this query's centred keys sit at each cosine. Green: where its attention weight sits; the spike is the sink.
:::

::: key Dumb turns out to be the point
Part 5 called LSH's obliviousness its weakness: it ignores the data, so learned indexes beat it. But obliviousness is exactly what makes $u_i$ computable from one arccos. A smarter index finds better keys, but it cannot say how likely it was to find them, and without that you cannot correct the estimate.
:::

The whole estimator, for one query, is five lines:

```python MagicPIG's estimate for one query | after Algorithm 1
s = (K_S @ q) / np.sqrt(d)                     # scores of the sampled keys only
p = 1 - np.arccos(cos(q, K_S - mu)) / np.pi    # SimHash: chance one bit agrees
u = 1 - (1 - p**K)**L - L * p**K * (1 - p**K)**(L - 1)
w = softmax(np.concatenate([s - np.log(u), s_exact]))   # sink + recent tokens: exact
o_hat = w @ np.concatenate([V_S, V_exact])
```

::: aside −log u is a surprisal
In Part 6's language, $-\log_2 u_i$ is the number of bits of surprise in "key $i$ was sampled". The estimator adds exactly that surprise to the key's score: a rarely sampled key counts for more when it does turn up.
:::

## The bill {#bill}

LSH has a well-known price, and [[@lsh-amplification]] warned about it: every table stores a pointer to every key.

::: widget pig-memory | The memory bill
**Slide K and L** Bytes per key, per layer, per head. The paper's settings put $L$ between 75 and 150.
:::

At the paper's default (10, 150), the tables are ==bigger than the KV cache they index==: 600 bytes of pointers to find a 512-byte key and value. The paper's own Table 8 lists 14 GB of tables for Llama-3.1-8B at 96k tokens. That is fine for its purpose: the tables live in plentiful CPU memory, and only the model stays on the GPU. Finding the candidates is cheap in bytes, about $L \cdot n / 2^K$ = 14,400 pointers per query, 0.2% of the key bytes, so the paper's "zero search cost" is fair. But it is a move, not a saving.

## Did it work? We checked {#measured}

We re-implemented Algorithm 1 from the paper's description and ran it on every head of every layer of Qwen2.5-1.5B, at the last 64 positions of the same 16k-token text: 21,504 attention rows. We compared it with three *oracles* that may see every score: TopK, sampling from the true weights, and a hybrid that reads the top half of its budget exactly and samples the rest.

::: widget pig-estimators | Estimators at a budget
**Turn centring and the exact sink and local tokens on and off** Lines: the oracles at budgets from 0.1% to 20% of the keys. Diamonds: MagicPIG at the paper's three settings. Square: the sink and the 64 most recent tokens alone.
:::

::: measured What we found
- **The budgets reproduce.** (8, 75), (9, 120) and (10, 150) read **5.1%, 3.9% and 2.1%** of the keys; the paper says 5%, 4% and 2%.
- **Sampling beats TopK, as an oracle.** At a 2% budget TopK misses by **12.1%**, sampling by about **6%**, the hybrid by **4.5%**.
- **MagicPIG lands between them.** **16.4%** at 2.1% of the keys, **12.5%** at 5.1%: worse than oracle TopK at the same budget, but without ever computing the scores TopK needs. It wins in 6 of the 28 layers, the ones where attention is most spread out.
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
**You shouldn't.** The textbook answer is to stratify: read the heavy keys exactly and sample the rest. Our hybrid does that and beats both at every budget. MagicPIG is secretly such a hybrid already, since the sink and recent tokens are kept exact. vAttention ([arXiv:2510.05688](https://arxiv.org/abs/2510.05688), ICLR 2026) later made "top-k plus sampling" the method itself.
:::

::: qa What do the "theoretical guarantees" guarantee?
**Less than it sounds.** The estimate is unbiased *on average over random hyperplanes*. But the hyperplanes are drawn once and shared by every head, layer and token, so in any one run the choice of keys is fixed. And $u_i$ follows the angle while $w_i$ follows the dot product, so a long key at a modest angle gets a big weight and a small chance: high variance. The paper describes the standard dot-product-to-angle trick for [[MIPS]] (its Eq. 8), then reports that it does not use it.
:::

::: qa Who deserves the credit?
**Unclear.** The sink and the 64 most recent tokens are always exact, and two whole layers are never approximated. The paper never reports what those alone achieve. In our run they matter more than centring.
:::

::: qa "Less than 2% degradation"?
**On average.** Inside the tables: GSM8K falls from 77.6 to 72.7, and five-step arithmetic from **26.8 to 11.7** at the default setting. Long chains of reasoning compound small errors at every step.
:::

::: qa How fast, against what?
**A simulation, against the wrong rival.** The RTX 4090 result is simulated on another GPU with a memory cap. Most of the throughput gain comes from bigger batches once the cache leaves the GPU. Compressing the cache to 2–4 bits does the same, and that comparison (Parts 3 and 4 of this book) is missing.
:::

::: aside What about RoPE?
The hashed keys have been rotated by [[RoPE]]. How much of the cone, and of the query–key mismatch, is position rather than content? The paper doesn't say. A later paper from the FAISS group, [Saap](https://arxiv.org/abs/2502.08246), blames exactly this for shared partitions failing, and learns separate ones for queries and keys.
:::

## What it suggests {#suggests}

::: cards
- **"Close enough" depends on who is asking**{.k-q}
  Recall@k is right when a person reads a list. When a model averages the results, the error of the average is what counts, and a random sample can beat the true top k. A RAG system that summarizes twenty passages is closer to the second case.
- **Randomness you can account for**{.k-code}
  A clever index with unknown odds is only as good as its recall. A dumb one with *known* odds supports an unbiased estimate. RaBitQ's unbiased distances in [[@bits-as-sketches]] make the same trade.
- **KV vectors are embeddings, quirks included**{.k-vec}
  A lopsided cone, a stable mean direction, a giant hub: the key cloud inside an LLM has the shape problems of a sentence-embedding cloud, and the same first fix.
- **The bits are in the wrong place**{.k-bits}
  MagicPIG spends 1,500 hash bits and 600 bytes of pointers per key to *choose* keys, then reads them at full precision. The rest of this book suggests the reverse: small codes to choose with, as in [[ADC]], and full precision only where the weight is.
:::

::: check
- Attention's output is an average. TopK misses it by (skipped weight) × (how different the skipped values are), every time; sampling is unbiased.
- Sampling from a cheap guess works if you know each draw's probability, and divide by it.
- Keys sit in a cone, queries point away, and the first token is a constant sink. Centring the keys is free for the softmax and essential for hashing.
- SimHash gives each key a sampling probability from its angle alone, which is what makes the correction possible.
- On a real model the idea mostly holds up; the exact sink and recent tokens carry much of the weight, and the hash tables outweigh the cache.
:::
