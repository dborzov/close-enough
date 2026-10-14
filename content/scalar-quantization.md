---
title: Scalar quantization
kicker: Layer 2 · The simplest quantizer
goal: Round each coordinate on its own. It needs no training, it is what most vector databases ship, and one small formula explains both why it works and where it stops.
---

## Rounding with a step

Pick a step size $\kbook{\Delta}$ and round each coordinate to the nearest multiple of it. With $b$ bits you get $2^b$ levels.

If the step is small compared with the spread of the data, the rounding error is spread evenly between $-\Delta/2$ and $+\Delta/2$. The variance of a uniform distribution of width $\Delta$ is

$$ \kres{D} \;=\; \frac{\kbook{\Delta}^2}{12} $$

::: key Six decibels per bit
One more bit halves $\Delta$, which **quarters** the squared error. In signal-processing units a factor of 4 is 6.02 dB. This single fact reappears on almost every later page.
:::

::: widget scalar-quant | Scalar quantization: bits and clipping
**Slide the bits, then the clip range** With few bits you must choose: a wide range wastes levels on values that almost never occur, a narrow one clips the tails (red). Press *best c* to see the compromise move outward as bits are added.
:::

Two more things to notice in the readout:

- **The output's entropy is below $b$.** The middle levels are used far more than the outer ones. An entropy coder could store the same indices in fewer bits, which is layer 4 of the stack.
- **$\Delta^2/12$ is accurate from about 3 bits up.** Below that the "small step" assumption fails.

## The three you will meet

| Name | Bits per coordinate | Size of a 384-d vector | Training | Typical use |
|---|---|---|---|---|
| float32 | 32 | 1,536 B | none | the model's output |
| float16 | 16 | 768 B | none | storage; almost no loss |
| [[int8]] | 8 | 384 B | a min and max | the default "quantized" option in vector DBs |
| int4 | 4 | 192 B | per-coordinate ranges | when RAM is tight |
| [[binary quantization|binary]] | 1 | 48 B | none | first-pass filter with re-ranking |

::: measured On Marginalia's vectors
Per-coordinate quantizers fitted on the training books, scored on held-out books, **without** re-ranking:

| Bits per coordinate | Vector size | Relative squared error | 10-recall@10 |
|---|---|---|---|
| 1 | 48 B | {{sw_scalar_384_err|.3f}} | {{sw_scalar_384_rec|.2f}} |
| 2 | 96 B | {{sw_scalar_768_err|.3f}} | {{sw_scalar_768_rec|.2f}} |
| 4 | 192 B | {{sw_scalar_1536_err|.4f}} | {{sw_scalar_1536_rec|.2f}} |
| 8 | 384 B | {{sw_scalar_3072_err|.5f}} | {{sw_scalar_3072_rec|.2f}} |
:::

At 8 bits the top-10 lists are almost untouched. At 1 bit, recall without re-ranking is poor, yet [[@bits-as-sketches]] shows the same bits are an excellent *shortlist* generator.

## Where it stops

Scalar quantization treats every coordinate alone, so it is blind to two things:

1. **Correlation between coordinates.** Each coordinate's range is coded as if the others told you nothing. A rotation first ([[@spectrum-and-bits]]) fixes the linear part of that.
2. **The floor of one bit.** There is no way to give a coordinate a third of a bit. Marginalia's index budget is 16 bytes for {{d}} dimensions: 0.33 bits per dimension.

```score SCALAR / BINARY
bad distortion at 16 bytes | not reachable
good encode | one rounding per coordinate
good search | SIMD integer dot products
good training | none
```

::: pull
To spend less than one bit per coordinate, you have to stop quantizing coordinates and start quantizing vectors.
:::

::: check
- Uniform rounding with step Δ has error Δ²/12; each extra bit quarters it.
- int8 costs almost nothing in recall; 1 bit per coordinate needs re-ranking.
- Scalar quantizers cannot go below 1 bit per dimension and cannot see correlations.
:::
