---
title: Close Enough
layout: page cover
goal: A visual primer on embeddings, vector search, and the mathematics of compressing vectors.
---

<div class="hero">
<div class="kicker"><b class="k-vec">embeddings</b> · <b class="k-q">vector search</b> · <b class="k-book">quantization</b> · <b class="k-bits">lossless codecs</b></div>
<h1>Close <span class="g">Enough</span></h1>
<p class="dek">A visual primer on how machines turn meaning into points in space, how they find the nearest points among billions, and how few bits a point really needs.</p>
<div class="byline"><span>44 short pages</span><span>about 35 interactive figures</span><span>every number measured on real embeddings</span><span>numpy sketches throughout</span></div>
<div id="continue"></div>
</div>

::: widget nn-hero
**The whole field in one picture** A query (the star) drifts through a cloud of embedded items, always linked to its six nearest neighbours. Part 1 is about where the points come from, Part 2 about finding the neighbours quickly, and Parts 3 to 6 about storing the points in far fewer bits than they arrive in.
:::

## How this book works

::: cards three
- **Small pages, one idea each**
  Every page answers one question and ends with a checkpoint. Most take three to six minutes. The bar at the top and the ticks in the contents remember what you have read, on this device.
- **Show, then tell**
  Wherever a claim can be tried, there is a playground: drag a point, move a slider, watch the number. Figures marked *measured* use real embeddings, not toy data.
- **No term left hanging**
  Dotted-underlined words such as [[HNSW]] or [[rq|residual quantization]] open a one-line reminder. Press <kbd>t</kbd> for the contents, <kbd>g</kbd> for the glossary, <kbd>←</kbd> <kbd>→</kbd> to turn pages.
:::

Colours carry meaning, and they mean the same thing in the text, the equations, the figures and the code:

<div class="legend">
<span class="chip k-vec"><i></i><span>data vector x</span></span>
<span class="chip k-q"><i></i><span>query, search time</span></span>
<span class="chip k-book"><i></i><span>codebook, index structure</span></span>
<span class="chip k-code"><i></i><span>code: the stored integers</span></span>
<span class="chip k-dec"><i></i><span>reconstruction x̂</span></span>
<span class="chip k-res"><i></i><span>residual, error</span></span>
<span class="chip k-enc"><i></i><span>encoder work</span></span>
<span class="chip k-bits"><i></i><span>bits, entropy, models</span></span>
</div>

::: aside Who this is for
You know some linear algebra and a little Python, and you have met entropy and Huffman codes. You do not need to know how a transformer works; where it matters, the book says what you need.
:::

## The parts {#parts}

<div id="partgrid" class="partgrid"></div>

## Three ways through {#progress}

::: steps
1. **The bird's-eye tour (about an hour).** Parts 1 and 2, then [[@big-picture]] and [[@recap]]. You will be able to place every term you meet in a vector-database changelog.
2. **The compression track.** Part 3 for the frame, Part 4 for codebooks, then [[@measured]] for the numbers. This is the route if you need to shrink an index.
3. **The deep end.** Part 5 on hashing and Part 6 on building a lossless codec assume you are comfortable with entropy and probability models. They are self-contained after Part 3.
:::

## Where the numbers come from

::: measured One dataset, used everywhere
All measurements use **{{n_windows|,}} passages** from 18 public-domain books, embedded with the open model `all-MiniLM-L6-v2` into **{{d}} dimensions**. Codebooks and probability models are always fitted on some books ({{n_train|,}} passages) and scored on *other* books ({{n_db|,}} passages), with queries from yet other books. The scripts are in the repository; one command regenerates every chart and every number in the text.
:::

This book grew out of three long conversations: a field guide to embeddings and search, a deep dive on additive codebooks, and a note on where PCA fits. It keeps their examples and adds two chapters they only hinted at: hashing, and exact compression.
