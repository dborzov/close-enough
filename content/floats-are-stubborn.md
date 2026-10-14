---
title: Floats are stubborn
kicker: Lossless compression · Choosing the target
goal: If "exact" means the raw float32 from the model, almost nothing helps, and the reason is visible bit by bit. This page is the argument for deciding how much precision you trust before compressing anything.
---

## Where the bits go

Here is the measured [[entropy]] of each of the 32 bit positions, across all {{n_float_values|,}} float32 values in the database books.

::: widget float-bits | The bits of a float32
**Where the bits go** Top: six real values from the first window of *Alice in Wonderland*, bit by bit: [sign]{.k-q}, [exponent]{.k-enc}, [mantissa]{.k-book}. Bottom: the entropy of each bit position over the whole dataset. A bar at full height is a fair coin.
:::

- **The sign** is a coin flip: 1 bit.
- **The exponent** is mostly predictable: every value is small, so its top bits never change.
- **The mantissa** is a coin flip from about its fourth bit onward.

The per-bit entropies sum to **{{bitsum32|.1f}} of 32 bits**. A coder that treats bits independently cannot beat that, and a good predictor barely changes it.

::: key Why prediction cannot help
Suppose a model predicts a coordinate to within ±{{resid_std8|.0f}} int8 steps, which is about ±0.035. A float32 of that size has a resolution near $2^{-28}$. The number of bits still unknown is

$$ \log_2 \frac{0.035}{2^{-28}} \;\approx\; {{mantissa_noise|.0f}} \ \text{bits} $$

Those bits are numerical noise from the model's arithmetic. No structure in the data predicts them.
:::

## Measured

| Method | float32, bits per value | float16, bits per value |
|---|---|---|
| raw | 32.0 | 16.0 |
| [[zstd]] at level 19 | {{fp32_zstd|.1f}} | {{fp16_zstd|.1f}} |
| [[byte shuffle]] + zstd | {{fp32_shuffle_zstd|.1f}} | {{fp16_shuffle_zstd|.1f}} |
| XOR with the previous window + shuffle + zstd | {{fp32_xor_prev_shuffle_zstd|.1f}} | {{fp16_xor_prev_shuffle_zstd|.1f}} |
| 16-stage RQ prediction + shuffle + zstd | {{fp32_rq_pred_shuffle_zstd|.1f}} | {{fp16_rq_pred_shuffle_zstd|.1f}} |

- zstd alone saves {{fp32_zstd_saving|.0%}}.
- Shuffling the bytes first, so that all the exponent bytes sit together, saves {{fp32_shuffle_saving|.0%}}. This is what Blosc does, and it is the entire win.
- Predicting from the previous window or from a 16-stage quantizer adds **nothing**. In the float domain the prediction only rearranges noise.

::: aside Float tricks that do exist
XOR with the previous value (Gorilla), integer-mapped prediction (fpzip), and error-bounded coders such as SZ and ZFP. All of them hit the same mantissa-noise floor when asked for bit-exact float32.
:::

## The lesson

::: pull
Decide how many bits you actually trust. Then compress exactly at that precision.

A model's outputs are not accurate to 24 bits. The low mantissa bits differ between GPU models, batch sizes and library versions.
:::

Rounding to a coarser grid is not a loss of information you had. It is a refusal to store noise you never wanted.

| Target | Raw | Best lossless found | Saving |
|---|---|---|---|
| float32 | {{raw_bits|,}} bits | about {{d}} × {{fp32_shuffle_zstd|.1f}} | {{fp32_shuffle_saving|.0%}} |
| 16-bit fixed point | {{f16_raw|,}} | {{f16_best|,.0f}} | modelled as in the next pages |
| int8 | {{i8_raw|,}} | {{ld_temporal_chol|,.0f}} | {{ld_temporal_chol_saving|.0%}} |

The int8 copy is 4× smaller than float32 before any coder runs, and it is the only one of the three where a model has something to grab.

::: warn Check that the target is good enough
Rounding to int8 moves each coordinate by at most half a step. On this data that leaves [[recall@10]] at {{sw_scalar_3072_rec|.2f}} against exact search ([[@scalar-quantization]]). If you re-rank against the int8 copy, that is your ceiling; decide whether it is acceptable before making int8 the canonical format.
:::

::: check
- A float32 embedding coordinate has about {{bitsum32|.0f}} bits of entropy, nearly all of it mantissa noise.
- Byte-shuffling plus zstd is the practical limit for bit-exact floats; predictors do not help.
- Pick the precision you trust (int8 or 16-bit fixed point) and be exact at that precision.
:::
