---
title: Squeezing the codes themselves
kicker: Lossless on top of lossy
goal: The stored indices of a lossy quantizer are not uniformly used, and neither are the ids next to them. An entropy coder shrinks both for free. The catch is that the index can no longer be scanned in place.
---

## The indices are not uniform

A [[PQ]] or [[RQ]] code stores each index in a flat 8 bits. That is optimal only if all 256 codewords of a stage are used equally often. They are not: some are popular, and later RQ stages have skewed usage.

An [[entropy coder]] can store each index in about $-\log_2 p$ bits instead.

::: widget code-entropy | Bits per index, per RQ stage
**Bits per index, per RQ stage** Grey outline: the flat 8 bits. Blue: an ideal coder that knows how often each codeword is used. Orange: one that also knows the same stage's index in the *previous window*.
:::

::: stats
- **64.0**{.k-res} bits per vector as stored
- **{{ce_marg|.1f}}**{.k-bits} with a frequency table per stage ({{ce_saving|.0%}} smaller)
- **{{ce_cond|.1f}}**{.k-bits} conditioning on the previous window ({{ce_cond_saving|.0%}} smaller)
:::

```python Ideal code length of the stored indices | numpy
def code_entropy_bits(codes_train, codes_test, K=256):
    total = 0.0
    for m in range(codes_train.shape[1]):
        p = np.bincount(codes_train[:, m], minlength=K) + 0.5
        p /= p.sum()
        total += -np.log2(p[codes_test[:, m]]).mean()   # ideal code length
    return total                                       # bits per vector
```

## Where the saving is

- **Stage 1 remembers.** The first, coarse stage says roughly *what kind of passage this is*. It repeats its previous value {{ce_s1_repeat|.0%}} of the time, and conditioning on it cuts its cost from {{ce_s1_marg|.1f}} to {{ce_s1_cond|.1f}} bits.
- **Later stages forget.** They encode fine detail that changes from window to window. Conditioning buys a few tenths of a bit.

::: aside A surprise in the first bar
Stage 1's frequency model costs slightly *more* than 8 bits on held-out books. The codeword frequencies learned on twelve training books do not match four different books: one author's favourite topics are another's rare ones. A model fitted to the wrong distribution can be worse than no model. In production you would fit the table on the data being stored and ship it in the file header.
:::

## The catch

Variable-length codes cannot be scanned with SIMD [[fast-scan]], and they must be decoded before [[ADC]] can use them. So this is for **storage and transport**, not for the hot index in RAM:

| | In RAM, being searched | On disk or on the wire |
|---|---|---|
| Fixed 8-bit indices | yes: random access, SIMD | wasteful |
| Entropy-coded indices | no | yes: {{ce_saving|.0%}} to {{ce_cond_saving|.0%}} smaller |

## The ids deserve the same treatment

An index stores an id next to every code, often 4 to 8 bytes: as much as the code itself.

- **Inside an IVF list, sort the ids** and store the gaps between consecutive ones. Gaps are small and skewed, exactly what a [[Golomb–Rice]] code or [[ANS]] handles well.
- **Marginalia's ids are (book, offset).** Neighbouring windows of a book often land in the same list, so many gaps are exactly 1.

::: aside The order is information too
A database is a *set*. If the order of $N$ vectors does not matter, choosing it cleverly can save up to $\log_2 N!$ bits. *Random Cycle Coding* does this for cluster assignments using bits-back coding. Marginalia's windows have a meaningful order, so there the order is data, not slack.
:::

::: check
- RQ indices carry about {{ce_marg|.0f}} bits of information in 64 stored bits; conditioning on the previous window gets to {{ce_cond|.0f}}.
- The coarse first stage is the most predictable; the model must match the data it is used on.
- Entropy-coded indices and delta-coded ids are for storage and transport, not for the scanned index.
:::
