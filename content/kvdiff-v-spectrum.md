---
title: The shape of cached values
kicker: Our experiments · kvdiff 03
goal: 256 numbers per cached value. Explore what changes across tokens, how much the tail costs, and whether one sequence can lend its PCA directions to another.
---

::: lede
Every new token leaves a trail of vectors behind it. The cache grows. Are we paying to store directions that barely change?
:::

If the values form a thin cloud, perhaps we can describe that cloud with fewer numbers. But ==a thin cloud and a safely discardable tail are different things==. Let's try the idea, then ask whether the same description works on another sequence.

::: aside The pilot, not a codec
Our kvdiff experiment uses **Qwen 3.5 2B**, five greedy-decoded GSM8K math sequences and **4,719 token positions**, combining prompts and responses. These are imported results from the overview built on 14 October 2026, not a new model run. Only cached **V** is studied here; K remains outside this study until its positional rotation has a validated correction.
:::

## One token, one vector

Take a math prompt and the model's answer. We call that whole sequence a **thread**. At each token position, each cached attention layer and KV head contributes a value vector: 256 coordinates. This is the value half of the [[KV cache]] from [[@rhymes]].

::: widget kv-axes | Walk into one V tensor
**Choose a thread, layer and head.** The grid is a schematic, not a heatmap: each square stands for coordinates, with no tensor values plotted. The counts and prompt boundary come from the dataset metadata.
:::

Fixing those three axes gives a `[tokens, 256]` matrix: one **block**. Its 341–2,548 rows are token positions, not separate PCA directions. Five threads × six cached layers × two heads give 60 blocks.

Within a block, how do the 256 numbers vary across rows? We subtract the block's mean vector and use [[PCA]] to find directions in coordinate space that capture that variation. Each direction combines coordinates. It isn't a token, a layer or a head.

::: aside Blocks and chunks
A block spans a whole sequence at one layer and head. A **32-token chunk** is a short contiguous run along its token axis, used for splitting samples. Layer numbers are zero-based; only 3, 7, 11, 15, 19 and 23 have cached tensors in this dataset.
:::

## Try a smaller world

Imagine V had two coordinates. Each token would be a point on a plane. A round cloud needs both directions. A thin cloud mostly changes along one. Which line should we keep?

::: widget kv-projection | Keep a line, lose the distance to it
**Rotate the kept direction.** Points are synthetic tokens, green marks their reconstructions, and red segments show the error. The cross is the mean. The same points are reused as you move the controls; units are arbitrary.
:::

::: try A line through the cloud
1. Set thickness to 25% and click **Align with the cloud**. Most variation survives along that line.
2. Turn the line to 120°. It now runs across the cloud; the residuals grow.
3. Align again, then add a constant offset. Raw energy in the mean rises, while centred variance retained stays the same.
:::

When the line follows the cloud, little variation is lost. Turn it across the cloud and the error jumps. Add an offset and the cloud travels, while its centred shape stays the same. This is the geometry of [transform coding](@transforms) in miniature.

So let's order the real directions from strongest to weakest. But what if each weak direction is small, and there are hundreds of them?

## A small dimension number can hide a long tail

[[effective dimension]] measures concentration. It doesn't say how many coordinates you can keep without much error. These three toy spectra make the distinction visible.

::: widget kv-tail | Concentration is not a truncation rank
**Switch spectra, then move the rank.** The exact-rank and flat presets spread variance equally over 32 or 256 directions. The long tail uses variance proportional to $i^{-1.2}$; it is a toy, not a fit to V. Blue bars are retained, red bars discarded. Square-root bar heights make the weak tail visible.
:::

::: try Count what is left behind
1. Choose **Exactly 32** and retain 32 directions. All variance survives.
2. Choose **Long tail**, still keeping 32. A small effective dimension coexists with substantial discarded variance.
3. Choose **Equal in 256**. Keeping 32 now retains only one eighth; there is no preferred small subspace.
:::

The formula names what we just saw. If direction $i$ has variance $\lambda_i$, the participation ratio is

$$ \mathrm{PR} = \frac{(\sum_i \lambda_i)^2}{\sum_i \lambda_i^2}. $$

Equal variance in $d$ directions gives PR $=d$. A long tail can contribute a lot to the numerator while contributing little to the sum of squares. The same distinction matters for the embedding cloud in [[@know-your-data]].

### Now try the actual values

Choose a layer and head below. We pool all five sequences' token rows **after centring each sequence separately**. That leaves one 4,719 × 256 matrix for the selected layer and head.

:::: lab kv-spectrum | The measured V spectrum
::: question
How much variation survives when we keep only the strongest directions?
:::
::: recipe
1. Select one of six cached layers and one of two KV heads.
2. Subtract each sequence's own mean and concatenate its token rows.
3. Fit PCA to all `4,719` rows; sort the `256` variances and add their shares.
:::
::: legend
- !bar **Blue bars** are retained directions; red bars are discarded.
- !line **The cumulative curve** adds variance shares from strongest to weakest.
:::
::: look
- Move the rank: does the tail end cleanly anywhere?
- This is an in-sample spectrum. The longest sequence supplies over half the rows.
:::
::::

::: measured Fitting the cloud is easier than predicting it
Across the **60 individual blocks**, the top 32 directions capture about **70% in-sample**, but **{{kv_cv32|.0%}} on held-out chunks**. Keeping 8 / 32 / 64 directions captures **{{kv_cv8|.0%}} / {{kv_cv32|.0%}} / {{kv_cv64|.0%}}** of held-out centred variance, with each block weighted equally.

The median split-half-corrected participation ratio is about **43 out of 256**. That headline uses per-block estimates; it is not the PR of the pooled spectrum above.
:::

::: pull
The weak directions are collectively expensive to discard.
:::

Keeping only 32 leaves **{{kv_tail32|.0%}} of held-out squared variation** behind. This points toward [fewer bits on weak directions](@spectrum-and-bits), rather than deleting them. It is reconstruction error, not a measured change in model accuracy.

## Could we learn the directions once?

A tailored basis for every sequence costs fitting time and storage. Reusing a basis would be more useful. Where could we borrow it from?

::: cards four
- **Own thread**
  Same sequence, layer and head; fit one set of chunks and score another.
- **Other threads**
  Change the sequence; keep layer and head fixed.
- **Other head**
  Change the head; keep sequence and layer fixed.
- **Next layer**
  Change the layer; keep sequence and head fixed.
:::

::: widget kv-transfer | Borrowing PCA directions
**Choose the target thread, layer and head.** “All” averages selected target blocks equally. The dashed reference is a randomly oriented subspace's expected share, $k/256$. Other-thread fits exclude the target; next-layer fits use the next cached layer, with 23 wrapping to 3. Fit sizes differ.
:::

The other-thread basis works much better than a random orientation here. The other head and next layer stay near random **in their stored coordinate systems**. A learned alignment could reveal related information; this plot doesn't rule that out.

::: aside Why some curves stop short
Short sequences give chunk splits fewer than 256 fitting directions. The own-thread curve can flatten before 100%, even at $k=256$. Extra unfitted directions aren't filled in.
:::

Promising—but the competitors didn't get the same fitting sample sizes. Own-thread fits use chunk cross-validation; other-thread fits use all remaining sequences. What happens if both get the same budget?

## Give both bases 160 fitting tokens

For each target, its own basis now uses **160 tokens from its first half**. The borrowed basis uses **160 tokens from other threads**, at the same layer and head. Both retain **32 directions** and describe the target's second half.

::: widget kv-temporal | Equal fit sizes, past to future
**Compare each pair of bars.** Blue uses the thread's own past; purple uses other threads. Each value averages 12 layer × head blocks and three random draws. Past and future are separated in time, though residual dependence may remain.
:::

The gap is small in several threads. But thread 104 pushes back: its own past captures **{{kv_104_own|.0%}}**, other threads **{{kv_104_other|.0%}}**. Its answer repeatedly revisits the same arithmetic; only **58%** of token 4-grams are distinct. Repetition is a plausible contributor, not a demonstrated cause. Thread 286 has an unexplained gap too.

::: key Share within a layer and head, then test new sequences
These five sequences suggest a reusable basis is worth trying. They don't settle transfer across tasks. Fit the mean, basis and quantizer without using the evaluation sequence.
:::

:::: deep Another check: pool more axes
Start with one block. Adding threads changes sequence only; adding the other head changes head only; adding layers changes layer only. Every source block is centred separately before concatenation.

::: widget kv-pooling | What pooling does to dimension
**Compare the scopes.** Bars show split-half-corrected PR, averaged over all 60 seed blocks. Hover also gives naive PR at matched token counts. Other threads raise dimension less than other heads or layers in their stored coordinates.
:::

| Thread | Tokens | Distinct 4-grams | Naive PR | Corrected PR | Own past, k=32 | Other threads, k=32 |
|---|---:|---:|---:|---:|---:|---:|
| 12 | 740 | 86% | 42.8 | 50.5 | 44% | 42% |
| 104 | 2,548 | 58% | 37.2 | 38.6 | 57% | 42% |
| 286 | 341 | 87% | 33.2 | 45.0 | 58% | 47% |
| 474 | 457 | 86% | 35.3 | 44.3 | 46% | 45% |
| 493 | 633 | 81% | 39.0 | 47.5 | 48% | 44% |

PR is averaged over layers and heads. The last two columns use the equal-size temporal test, not the chunk-cross-validation curves.
::::

## What if most of the vector is an offset?

Remember moving the toy cloud without changing its shape? A large raw norm can likewise come from a constant component. We need to separate the shape of the centred cloud, the energy in its mean, and the size of the raw vectors.

::: widget kv-layers | Shape, mean and norm across depth
**Switch the quantity.** Every point averages threads and heads at one cached layer. Centred effective dimension changes mildly; the norm grows about sixfold from layer 3 to 23, and the mean's energy share rises sharply at layer 23.
:::

::: measured Layer 23's large mean
The within-sequence mean accounts for **{{kv_mean23|.0%}} of raw energy**, averaged across five threads and two heads. Each sequence supplied its **own** mean. Whether a mean learned elsewhere transfers is still untested.
:::

::: qa Can we replace the values by their mean?
**Energy share alone doesn't justify it.** A codec must predict or store the mean and count its error and storage. A mean-only ablation must measure attention-output changes and next-token loss before proposing mean-only storage.
:::

::: deep The two energies in the toy
For a mean $\mu$ and centred token vector $z$, $x=\mu+z$. Averaging over the block gives $\mathbb E\|x\|^2=\|\mu\|^2+\mathbb E\|z\|^2$. The projection toy changes the first term with its offset control and the second with its thickness control. Centred reconstruction error is measured against the second term.
:::

## Are short sequences fooling us?

With fewer rows, PCA can mistake sampling noise for a strong pattern. Neighbouring tokens are correlated too. If short sequences look simpler, is that the data—or the estimator?

::: widget kv-calibration | Sample size and apparent dimension
**Switch between synthetic data and real windows.** The synthetic Gaussian has the measured layer-11 V covariance and token autocorrelation $\rho=0.55$; the dotted line is its true PR. Real contiguous windows come from thread 104, layer 11, head 0; their reference is the whole thread's corrected estimate.
:::

::: widget kv-threads | Short threads gain more from correction
**Compare the linked dots.** Blue is naive PR, purple is corrected PR, averaged over layers and heads. Labels identify threads. The horizontal axis is sequence length on a log scale.
:::

The correction reduces short-sequence bias. It doesn't make time-correlated samples independent. These five math answers, with prompts and responses combined, are a pilot—not a population-wide statement about V.

::: deep Why split halves help, and where they still fail
Separate sets of 32-token chunks give covariance estimates $S_A$ and $S_B$. The corrected participation ratio is

$$ \widehat{\mathrm{PR}} = \frac{\operatorname{tr}(S_A)\operatorname{tr}(S_B)}{\operatorname{tr}(S_A S_B)}. $$

The estimate is averaged over random chunk splits. Independent halves reduce the sampling-noise contribution to the second covariance moment. Temporal dependence, estimated means and ratio bias remain. The temporal transfer test separates past and future, but long-range dependence can remain there too.
:::

## So where might the savings come from?

The tail makes truncation expensive. A more promising first codec would keep a basis per layer and head, then spend fewer bits on weaker directions. That's the [reverse water-filling idea](@spectrum-and-bits) applied inside a transformer.

::: widget kv-rate | An ideal rate, not a demonstrated codec
**Read toward stricter error on the right.** Solid blue is the ideal Gaussian rate from the measured spectra, taking the median over 12 layer × head covariances. The dashed reference spreads the same total variance equally over 256 directions. Both omit mean/basis storage and coding overhead.
:::

At **5% squared error relative to centred variance**, that Gaussian calculation gives **{{kv_rate5|.0f}} bits per vector**, against **4,096 bits** for 256 bf16 numbers. This is room to investigate, not a measured compression ratio. Non-Gaussian structure could help; practical coding costs could hurt. The metric weights each coordinate equally; model sensitivity may not.

::: deep The bit-allocation calculation
Choose a water level $\theta$ so that $\sum_i\min(\lambda_i,\theta)=D$, where $D$ is the allowed squared error in absolute variance units. Then

$$ \kbits{R}=\tfrac12\sum_{\lambda_i>\theta}\log_2(\lambda_i/\theta). $$

The figure divides $D$ by total centred variance to report relative error. This is the ideal asymptotic rate for a Gaussian source, not a universal lower bound on codecs for real V.
:::

## What would we try next?

::: cards three
- **Make a held-out codec**
  Learn mean, basis and quantizer on training sequences. Compare reduced precision, projection and additive quantization at equal total storage. Change course if the savings disappear on new sequences.
- **Check model-output error**
  Measure attention outputs and next-token loss under V compression. Squared error is only a proxy; modest V error could still damage the model.
- **Widen the lens**
  Separate prompt and response roles. Repeat equal-size transfer across tasks and decoding styles. Adapt the basis if fixed layer × head directions don't transfer.
:::

## Reproduce and trace the results

The original analysis lives in the **kvdiff** project on this machine. From that checkout:

```sh Open the experiment | kvdiff
uv run marimo edit notebooks/03_v_spectrum.py
```

```sh Rebuild the original overview | kvdiff
uv run python overview_src/build.py 03_v_spectrum
```

From the **Close Enough** checkout, import the rebuilt overview and rebuild the book:

```sh Import the measurements | Close Enough
uv run experiments/import_kvdiff.py /attic/d/kvdiff/overviews/03_v_spectrum.html
uv run build.py
```

::: aside Snapshot provenance
Source: `overviews/03_v_spectrum.html`, built **2026-10-14 19:03 UTC** from `a9f360e+uncommitted`. Analysis and figure definitions: `overview_src/pages/03_v_spectrum.py`; notebook: `notebooks/03_v_spectrum.py`. The imported JSON records the source SHA-256 and exact plotted values. The website ships that snapshot and runs without access to the local project.
:::

::: check
- A concentrated spectrum does not make its tail cheap to delete: 32 directions leave about 44% of held-out variation behind.
- Bases transfer best between these sequences at a fixed layer and head, with exceptions that need wider testing.
- Large means and uneven spectra suggest compression opportunities; neither proves a useful codec or acceptable model-output error.
:::
