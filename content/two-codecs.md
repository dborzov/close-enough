---
title: Two codecs
kicker: Lossless compression · Putting it together
goal: The archive and the wire want the same model with different context. Here are both designs, what each saves, the checklist that makes a format survive contact with production, and the dial between lossless and lossy.
---

## The archive codec

Sequential, per book, written once. It can use everything.

::: steps
1. **Round to the target.** int8 with one global step. This is the only lossy act, and it is a decision, not a side effect.
2. **Subtract the mean** (one vector of {{d}} integers in the header).
3. **Predict from the previous window:** $\beta \cdot x_{t-1}$ with $\beta = {{beta0|.2f}}$, rounded. Every 64th window is a [[keyframe]] and skips this step.
4. **Predict each coordinate from the earlier ones** with a triangular matrix (a {{d}} × {{d}} fixed-point table in the header).
5. **Entropy-code** each prediction error with a quantized bell curve of that coordinate's spread, using rANS.
6. **Chunk** the stream at keyframes and write an index of chunk offsets.
:::

::: stats
- **{{ld_flat|,.0f}}**{.k-res} bits per vector, raw int8
- **{{ld_temporal_chol|,.0f}}**{.k-bits} bits with the full model
- **{{ld_best_ratio|.2f}}×**{.k-dec} smaller
- **{{archive_gb_best|.0f}} GB**{.k-vec} instead of {{archive_gb_raw|.0f}} GB for 300 M vectors
:::

## The wire codec

A response holds 50 to 200 vectors from all over the corpus. There is no previous window: step 3 is unavailable. Everything else applies to a single vector on its own.

::: widget wire-sizes | Compressing a search response
**A search response, measured** 300 queries, the top 50 vectors of each. General-purpose compression against a model that both ends hold.
:::

Three observations:

- **zstd barely helps** ({{w_zstd_saving|.0%}}), even with a dictionary trained on similar vectors. There are no repeated byte strings in a batch of embeddings.
- **A shipped model helps a lot.** A bell curve per coordinate saves {{w_static_saving|.0%}}; adding triangular prediction saves {{ld_wire_chol_saving|.0%}}. The client needs the same two tables, loaded once.
- **Use what the client already has.** If the client holds the search index's RQ code for each result, the code is free side information, and the remaining bits drop to {{ld_wire_rq8_chol_given_code|,.0f}}. The economics of [[@bit-allocation]] flip when the code costs nothing.

For a response of 100 vectors that is {{resp_best_kb|.0f}} kB instead of {{resp_raw_kb|.0f}} kB.

::: aside Progressive responses
RQ codes are prefix-decodable ([[@residual-quantization]]). A server can send the 16-byte codes first, let the client re-rank approximately, and send exact refinements only for the handful of candidates still in contention. Most of the bytes are never sent.
:::

## Side by side

| | Archive | Wire |
|---|---|---|
| Access pattern | sequential, a book at a time | random, a vector at a time |
| Context available | previous window + earlier coordinates | earlier coordinates (+ the index code, if held) |
| Encode speed | irrelevant | matters: per request |
| Decode speed | moderate | critical: adds to latency |
| Model | global tables in the file header | the same tables, versioned, shipped once |
| Bits per vector (int8) | {{ld_temporal_chol|,.0f}} | {{ld_wire_chol|,.0f}}, or {{ld_wire_rq8_chol_given_code|,.0f}} given the code |
| Framing | chunks at keyframes + offset index | length-prefixed, one vector per record |

## The format checklist

The compression ratio is the easy part. These are what make a format last.

::: cards
- **Determinism**
  All prediction arithmetic in integers, with a specified rounding. Test by decoding on a different CPU architecture.
- **Version the model**
  The tables *are* the format. A hash of the model in every chunk header; refuse to decode on mismatch.
- **Bound the damage**
  A checksum per chunk. A flipped bit should cost one chunk, not one book.
- **Escape hatch**
  An escape symbol for out-of-range values and a raw mode for chunks where the model does worse than 8 bits. Then the worst case is raw + a few bytes.
- **Fit on what you store**
  Spreads and tables fitted on a sample of the corpus itself, not on some other corpus ([[@code-entropy]] shows what a mismatched model costs).
- **Measure decode time first**
  The triangular solve is {{chol_params|,}} multiply-adds per vector. On the wire, check that it costs less than the bytes it saves.
:::

## The dial: near-lossless

Between "bit-exact" and "8 bytes, lossy" is a continuum. [[near-lossless|Near-lossless]] coding guarantees every coordinate within $\pm\epsilon$ steps: quantize the prediction error with step $2\epsilon + 1$ instead of 1 and keep the rest of the machine.

Each doubling of the step saves about one bit per coordinate, as the $\log_2(\sigma/\Delta)$ formula promises.

| Guarantee per coordinate | Bits per vector | versus exact |
|---|---|---|
| exact (ε = 0) | {{near0|,.0f}} | — |
| within ±1 step | {{near1|,.0f}} | −{{near1_saving|.0f}} |
| within ±2 steps | {{near2|,.0f}} | |
| within ±5 steps | {{near5|,.0f}} | |
| within ±8 steps | {{near8|,.0f}} | |

*(Measured with the RQ-8 predictor and per-coordinate model; the same offsets apply to any row of the ladder.)*

::: key The largest saving in this part
Going from exact to ±1 step saves {{near1_saving|.0f}} bits per vector. That one decision is worth more than the previous-window predictor and the triangular predictor combined. Precision is the dial that matters; everything else is tuning.
:::

## What Marginalia ships

::: story Priya | WEEK 12 · THE ARCHITECTURE
"Three tiers, each with the compressor that fits its job. And one honest surprise: the fancy codebooks we built for search turned out not to help the archive. A matrix and a bell curve did."
:::

::: svg three-tiers | One product, three compressors
**One product, three compressors** The RAM tier is encoder-heavy and lossy. The SSD tier is cheap both ways. The archive is lossless and sequential, and is what lets Marginalia retrain codebooks or change quantizers later without paying to re-embed.
:::

::: check
- Archive: int8 → mean → previous window → earlier coordinates → rANS, chunked at keyframes. {{ld_best_ratio|.2f}}× smaller than raw int8.
- Wire: the same minus the previous window; a model on both ends beats zstd by a wide margin.
- A format needs deterministic arithmetic, versioned models, chunk checksums and an escape path.
- The precision you choose outweighs every modelling trick.
:::
