---
title: From spectrum to bit budget
kicker: Layer 1 meets layer 2
goal: The eigenvalue spectrum says where the information is. Information theory turns it into an exact recipe for where the bits should go, and the recipe has a picture.
---

## The rule

Rotate the data onto its [[principal directions]]. Direction $i$ now has variance $\lambda_i$: its bar in the [[spectrum]]. For bell-shaped data, [[rate–distortion]] theory gives the best possible way to split a bit budget among the directions. It is called [[reverse water-filling]].

::: steps
1. Pick a water level $\kbook{\theta}$.
2. Give direction $i$ about $\tfrac12 \log_2(\lambda_i/\theta)$ bits.
3. Directions whose bar is below the water get **zero bits**.
:::

$$ \kbits{R} \;=\; \sum_{i\,:\,\lambda_i > \theta} \tfrac12 \log_2\frac{\lambda_i}{\kbook{\theta}} \qquad\qquad \kres{D} \;=\; \sum_i \min(\lambda_i,\ \kbook{\theta}) $$

Big bars get many bits, small bars a few, tiny bars none. After coding, every direction that got bits has the *same* leftover error $\theta$, and every direction that did not is lost entirely.

::: widget waterfill | Reverse water-filling
**Drag the budget** This is the real spectrum of the embeddings. The lime part of each bar is what gets described; the faded red part is the error that remains. At 8 bytes, how many directions get anything at all?
:::

::: aside Why halves and logs
One extra bit on a coordinate halves its quantization step and quarters its squared error. So $b$ bits shrink variance $\lambda$ to $\lambda\,4^{-b}$. Setting that equal to $\theta$ gives $b = \tfrac12\log_2(\lambda/\theta)$. [[@scalar-quantization]] derives the factor of 4.
:::

## "Keep the top 8 dimensions" is a crude version of this

Truncating to the top 8 principal directions and storing each as int8 spends 8 bits on each of 8 directions and nothing on the rest. Water-filling says that is the wrong shape:

- the 9th direction is almost as important as the 8th, and gets zero;
- the 1st gets 8 bits when it deserves about 3.

::: measured The same 64 bits, two shapes
- Top 8 directions × 8 bits: relative error **{{pca8_err|.2f}}**{.k-res}, recall {{pca8_rec|.2f}}.
- Water-filled over {{pca64_dims}} directions, 1 to 3 bits each: relative error **{{sw_pca_sq_64_err|.2f}}**{.k-dec}, recall {{sw_pca_sq_64_rec|.2f}}.

Same transform, same total bits, same trivial encoder. Only the allocation changed.
:::

## How good can transform + scalar get?

For Gaussian data, PCA + scalar quantization + the right allocation gets close to the theoretical best at moderate and high rates. The remaining gap is small and *fixed*:

::: key The quarter-bit tax
A scalar quantizer followed by an entropy coder is about **¼ bit per dimension** (1.53 dB) worse than the best possible quantizer, at any rate. It is the price of rounding each coordinate into a cube-shaped cell when a rounder cell would pack space better.
:::

A quarter of a bit is nothing if you are spending 8 bits per dimension. It is ruinous if your whole budget is 0.2.

## So why does anyone use vector quantization?

Two reasons, and both are visible in measurements.

::: cards
- **Very low rates**
  At 8 bytes for {{d}} dimensions you have about 0.17 bits per dimension. A scalar quantizer cannot spend a fraction of a bit on a coordinate. A vector quantizer spends bits on whole vectors, so it can.
- **Data that is not one bell**
  Embeddings form clusters: topics, genres, languages. PCA only sees the ellipse around the whole cloud. A [[codebook]] can put its points right on the clusters.
:::

::: widget rate-sweep | Error against bits, measured
**Measured, from 4 bytes to 384 bytes** Each dot is a full train-and-evaluate run on held-out books. The dashed line is the Gaussian bound from water-filling. Switch to recall to see what the error means for search.
:::

Read the chart from left to right:

- **Left (under 128 bits):** vector quantizers lead. At 64 bits RQ reaches {{sw_rq_64_err|.2f}} against {{sw_pca_sq_64_err|.2f}} for PCA + scalar and {{sw_pq_64_err|.2f}} for plain PQ.
- **Middle (about 1 bit per dimension):** everything converges. At 512 bits OPQ, PCA + scalar and RQ are at {{sw_opq_512_err|.2f}}, {{sw_pca_sq_512_err|.2f}} and {{sw_rq_512_err|.2f}}.
- **Right (several bits per dimension):** plain scalar quantization of the raw coordinates is as good as anything, needs no training and is trivial to run. That is why many vector databases simply ship int8.

::: aside The hybrid
[[OPQ]] is a rotation in the spirit of PCA followed by a vector quantizer. It beats each of its parts on its own across most of the chart, which is the stack in action.
:::

## What to read for the theory

- **Goyal, "Theoretical Foundations of Transform Coding"** (IEEE Signal Processing Magazine, 2001). Exactly this page's question.
- **Cover and Thomas, *Elements of Information Theory*,** the rate–distortion chapter. Reverse water-filling comes from here.
- **Gersho and Gray, *Vector Quantization and Signal Compression*.** The deep dive on layer 2.

::: check
- Water-filling: direction $i$ gets $\tfrac12\log_2(\lambda_i/\theta)$ bits; directions below the water level get none.
- Transform + scalar is within ¼ bit per dimension of optimal, which is excellent at high rates and fatal at very low ones.
- Vector quantizers win below roughly one bit per dimension and on clustered data.
:::
