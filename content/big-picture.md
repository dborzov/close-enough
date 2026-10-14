---
title: The big picture
kicker: Placing the tools
goal: Step back from algorithms. The most useful single axis for placing a compression method is where it spends its compute. Then one table with everything, and a decision guide.
---

## Encoder-heavy against decoder-heavy

Video codecs are the classic deliberate asymmetry: a film is encoded once, slowly, and decoded millions of times. Vector indexes have the same shape ([[@marginalia]]). Additive codebooks are the vector-search version of that bargain.

::: widget method-map
**A qualitative map** Horizontal: work to encode one vector. Vertical: work to decode or score one. Dot size: error at a tight budget (bigger is worse). A ring means the method needs the vectors in sequence order. Positions are judgement calls informed by the measurements, not measurements.
:::

- **Bottom left, cheap both ways:** scalar quantization, binary codes, PCA truncation. Excellent at several bits per dimension; poor at a fraction of a bit.
- **Lower middle:** PQ and OPQ. The workhorse when ingest rate matters.
- **Bottom right, encoder-heavy:** RQ with beams, additive quantization, LSQ. The same search cost as PQ, better codes, paid at build time.
- **Predictive and entropy-coded variants:** a better rate for storage and transport, at the cost of random access and SIMD scans.
- **Top, decoder-heavy:** neural decoders. The lowest error, but decoding runs a network, so they re-rank shortlists.

## The full scorecard

::: wide
| Method | Implicit codebook | Encode | Search / decode | Training | Error at a tight budget | Random access | Best for |
|---|---|---|---|---|---|---|---|
| Scalar / binary | per-coordinate grid | [trivial]{.g} | [trivial]{.g} | [none]{.g} | [high]{.bad} | [yes]{.g} | ≥ 4 bits/dim; first-stage filter |
| VQ (k-means) | K points | [K·d]{.o} | [1 lookup]{.g} | [k-means]{.o} | [high]{.bad} | [yes]{.g} | the IVF coarse quantizer |
| PQ / OPQ | (rotated) grid | [K·d]{.g} | [M lookups]{.g} | [k-means per block]{.g} | [medium]{.o} | [yes]{.g} | fast ingest, generous budgets |
| RQ, greedy | free sums | [M·K·d]{.g} | [M lookups + norm]{.g} | [sequential k-means]{.o} | [low]{.g} | [yes]{.g} | the default free-codebook choice |
| RQ, beam B | free sums | [B × greedy]{.o} | [M lookups + norm]{.g} | [B × greedy]{.o} | [lower]{.g} | [yes]{.g} | static, memory-bound indexes |
| AQ / LSQ (ICM) | free sums | [restarts × M²K]{.bad} | [M lookups + norm]{.g} | [re-encode per epoch]{.bad} | [lowest linear]{.g} | [yes]{.g} | GPU builds, tight budgets |
| Predictive RQ | sums, conditioned on the past | [2 × greedy]{.o} | [sequential only]{.o} | [closed-loop]{.o} | [low]{.g} | [keyframes]{.bad} | streams, archives with locality |
| + entropy-coded codes | same | [+ cheap]{.g} | [decode first]{.bad} | [count frequencies]{.g} | same, fewer bits | [blocks]{.o} | storage, transport |
| Lossless (model + ANS) | exact | [model + coder]{.o} | [full decode]{.bad} | [fit tables]{.g} | [zero]{.g} | [blocks]{.o} | the canonical archive, the wire |
| Neural codebooks | input-dependent sums | [network per candidate]{.bad} | [network per step]{.bad} | [SGD, GPU]{.bad} | [lowest]{.g} | [yes]{.g} | re-ranking shortlists |
:::

## A decision guide

::: cards
- **Reach for additive codebooks**{.k-enc}
  RQ with a small beam, or LSQ: when the corpus is large and mostly static, memory per vector is the binding constraint, the budget is tight (8 to 32 bytes), and you can afford a long batch job at build time.
- **Prefer PQ / OPQ**{.k-book}
  When vectors must be indexed the moment they arrive, encoding runs on CPU at ingest, or the budget is generous enough that the gap is small.
- **Prefer scalar or binary**{.k-vec}
  When you can spend a bit or more per dimension, want no training, or need a cheap first-pass filter. With a float query and re-ranking, 1 bit per dimension goes a long way ([[@bits-as-sketches]]).
- **Add prediction and entropy coding**{.k-res}
  When data comes in sequences and is read sequentially: archives, transfer, streaming. Keep them out of the random-access search path.
- **For exact copies**{.k-bits}
  Choose the precision first. Then a bell curve per coordinate, triangular prediction, the previous vector if there is one, and ANS. Measure before adding anything cleverer ([[@bit-allocation]]).
- **Use hashing**{.k-code}
  For near-duplicates, for streams with heavy churn, and when there is nothing to train on ([[@lsh-in-practice]]).
:::

::: check
- Place a compressor by where it spends compute (encode or decode) and by how much order it needs.
- Additive codebooks are the encoder-heavy, decode-cheap tool for static, memory-bound indexes.
- A real product mixes tiers: compact codes in RAM, finer vectors for re-ranking, a lossless archive.
:::
