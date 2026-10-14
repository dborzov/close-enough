---
title: The shape of the cloud
kicker: Stage 1 · Reading the space
goal: Three more experiments, this time on the shape of the whole cloud of embeddings. It sits off to one side, uses far fewer directions than it has, and a text moves through it in small steps. These three facts decide how compressible the vectors are.
---

The previous page asked what directions *mean*. This one asks what the cloud of all {{n_windows|,}} passage embeddings *looks like*: where it sits, how many directions it really uses, and how a book moves through it. Same format as before: each section opens with an experiment, explains it, and ends with the experiment again.

## The cloud sits off to one side {#lopsided}

:::: lab cloud-shape | The lopsided cloud
::: question
Pick two passages from two different books at random. If the arrows pointed every which way, they would be nearly perpendicular, with cosine close to 0. Are they?
:::
::: recipe
1. Embed every passage of the 18 books in the corpus: `{{n_windows|,}}` passages of `48 words`, `384 numbers` each, length 1.
2. **Pairs.** Draw `{{rp_n|,}}` random pairs of passages from two different books, and compute the cosine of each pair. As a baseline, do the same for pairs of directions drawn uniformly at random in 384 dimensions.
3. **Reach toward the average.** Average all the arrows. For every passage, compute the cosine between its arrow and the direction of that average.
4. **Neighbours.** Take `{{rp_hub_m|,}}` passages at random. For each, find its 10 nearest among the others. Count how many times each passage is picked.
5. The checkbox repeats steps 2 and 4 after subtracting the average arrow from every arrow (and scaling each back to length 1).
:::
::: legend
- !colour **Three tabs, three measurements.** Each has its own title saying exactly what is counted.
- !bar **Shaded areas** are histograms: how many pairs, or passages, fall at each value. **Grey** is always the no-structure baseline of random directions.
- !dash **Dashed vertical lines** mark zero and the averages.
- !line **In the third tab**, each line shows how many passages were picked 0, 1, 2… times. Every passage picks exactly 10, so 10 is the fair share.
:::
::: look
- In the first tab, where is the bulk of the red, compared with the grey? Now tick "subtract the average passage first".
- In the second tab, does any passage point away from the average?
- In the third tab, how many times is the most popular passage picked? And how many passages are never picked?
:::
::::

Two random passages from different books have an average cosine of {{rp_raw_mean|.2f}}, not 0. That is an angle of about {{rp_raw_deg|.0f}}° instead of 90°. The whole cloud leans one way. The average of all the arrows has length {{mean_norm|.2f}}, where arrows pointing in every direction would average to almost nothing. Every passage reaches toward that average: {{rp_along_mean|.2f}} on average, and almost none fall below zero.

This is [[anisotropy]]: the vectors crowd into a cone instead of filling the sphere. It comes from training. Every passage shares some features with every other (it is English, it is prose, it is a book), and those shared features add up to one common direction.

A related effect is [[hubness]]: a few passages end up close to everybody. In the third tab, the most popular passage is among the 10 nearest of {{rp_hub_max_raw}} others, {{rp_hub_ratio|.0f}} times its fair share, while {{rp_hub_zero_raw}} passages are nobody's neighbour. Random directions show nothing like it: the grey line stops at {{rp_hub_max_rand}}. Hubs show up in search results for every query whether or not they are relevant.

Two things make hubs. One is the lean: passages near the middle of the cone are close to everything. The other is crowding: the King James Bible is 38% of all passages, and the passages at the centre of that crowd are close to a great many others. All five top hubs are Bible verses.

The fix is one line, and every compression method in this book applies it first: **subtract the mean vector.** It brings the average cosine of random pairs to {{rp_cen_mean|.2f}}. It removes the part of hubness that comes from the lean, cutting the worst hub from {{rp_hub_max_raw}} picks to {{rp_hub_max_cen}} and the passages nobody picks from {{rp_hub_zero_raw}} to {{rp_hub_zero_cen}}, but crowding stays. It does not make the cloud round either. Real pairs still spread more widely than random directions (±{{rp_cen_std|.2f}} against ±{{rp_iso_std|.2f}}), because the cloud is not a ball. That is the next section.

:::: lab cloud-shape again
::: reading
1. {offset} **Everything leans one way.** Red sits to the right of grey: two unrelated passages have an average cosine of {{rp_raw_mean|.2f}}. Random directions in 384 dimensions sit at 0, give or take {{rp_iso_std|.2f}}.
2. {centred} **Subtracting the average fixes the lean.** With the average passage removed, red is centred on zero. It is still wider than grey: the cloud is not a ball.
3. {cone} **A cone, not a sphere.** Every passage reaches toward the average, {{rp_along_mean|.2f}} on average. For random directions this reach would be a narrow bump around zero.
4. {hubs} **Hubs.** The red line has a long tail to the right: passages picked as a neighbour up to {{rp_hub_max_raw}} times, where random directions (grey) never pass {{rp_hub_max_rand}}. The list below the chart shows the top five: all from the Bible, the biggest crowd in the corpus.
5. {hubsfix} **Centring helps, a little.** With the average subtracted, the worst hub drops to {{rp_hub_max_cen}} picks and the top five now include *Emma*, but the green line's tail is nearly as long as the red one. The remaining hubs come from crowding, not from the lean.
:::
::::

## Fewer real directions than dimensions {#few-directions}

:::: lab spectrum-lab | How many directions are used?
::: question
Each passage has 384 numbers. Does the cloud spread equally in all 384 directions, or mostly in a few?
:::
::: recipe
1. Take all `{{n_windows|,}}` passages and subtract their average arrow.
2. Find the [[pca|principal directions]]: the direction along which the cloud spreads most, then the most-spread direction at right angles to it, and so on, `384` in all.
3. For each direction, measure the share of the total variation that lies along it (its eigenvalue, as a share). Sort from largest to smallest: this is the [[eigenvalue spectrum]].
4. **Controls.** *Shuffled coordinates*: shuffle each coordinate's values among the passages separately, which keeps every coordinate's spread but breaks how they move together. *Random data*: draw numbers with no structure at all, same size.
5. **Neighbours.** For `1,000` passages, find the 10 nearest among `20,000` others, using all 384 numbers. Then again using only the first *k* principal directions, or *k* of the original coordinates picked at random. Count how many of the 10 are found again.
:::
::: legend
- !bar **Top chart**: one bar per principal direction, its share of the variance. Only the first 96 of 384 are drawn; the rest are thinner still.
- !line **Bottom chart**: share of the true 10 nearest neighbours found again, against the number of directions kept, *k*. The dashed line is the share of the variance kept.
- !x **The slider** sets *k* in both charts.
:::
::: look
- How many bars does it take before they become small?
- Tick both controls. What does a cloud with no structure look like?
- Keeping 64 of 384 directions keeps most of the variance. Does it keep most of the neighbours?
:::
::::

The spread is concentrated. The first 8 directions hold {{var8|.0%}} of the variance, the first 64 hold {{var64|.0%}}. A single number summarises it, the *participation ratio* $1/\sum_i p_i^2$ where $p_i$ is the share of direction $i$. It counts how many directions are effectively in use: **{{sp_pr_real|.0f}}** here, against {{sp_pr_shuffled|.0f}} for the shuffled control and {{sp_pr_random|.0f}} for random data. This is a low [[intrinsic dimension]]: the data lies near a much smaller surface than the space it lives in.

The shuffled control is the telling one. It has exactly the same 384 coordinates with exactly the same spreads, and its spectrum is flat. The concentration comes entirely from coordinates **moving together**, which is the previous page's point again: meaning lives in combinations of coordinates, not in any one of them.

The bottom chart adds a warning. Keeping the first 64 directions keeps {{var64|.0%}} of the variance but finds only {{sp_rec_pca_64|.0%}} of each passage's true ten nearest neighbours. Most of the variance is the coarse part: which book, what kind of text. What separates a passage from its closest rivals lives in the long, thin tail. A compressor should spend most of its bits on the first directions, and still some on the rest ([[@spectrum-and-bits]]).

:::: lab spectrum-lab again
::: reading
1. {head} **A few directions carry a lot.** The first 8 bars hold {{var8|.0%}} of the variance. After them the bars shrink slowly, into a tail that is long and thin.
2. {shuffled} **Structure is correlation.** Shuffling each coordinate separately keeps its spread but breaks the way coordinates move together, and the spectrum goes flat, like the random data.
3. {neighbours} **Variance is not neighbours.** At 64 directions the dashed line is at {{var64|.0%}}, but only {{sp_rec_pca_64|.0%}} of the 10 nearest survive. The fine distinctions are in the tail.
4. {coords} **Directions beat coordinates.** At every *k*, the first principal directions find more neighbours than the same number of original coordinates: {{sp_rec_pca_128|.0%}} against {{sp_rec_coords_128|.0%}} at 128.
:::
::::

## A text is a path {#path}

:::: lab alice-walk | A walk through Alice
::: question
Read a book passage by passage. Does the embedding jump around at random, or walk?
:::
::: recipe
1. Take the first three chapters of *Alice in Wonderland*: "Down the Rabbit-Hole", "The Pool of Tears" and "A Caucus-Race and a Long Tale".
2. Cut them into passages of `48 words`, one every `24 words`, as everywhere in this book: `{{walk_n}}` passages, in reading order.
3. Embed each: `384 numbers`, length 1.
4. **Grid.** Compute the cosine of every passage with every other: a {{walk_n}} × {{walk_n}} table.
5. **Path.** Subtract the average of these passages, find their first two principal directions, place each passage by its reach along them, and join the dots in reading order.
6. **Fading.** Over the whole book, average the cosine between passages that are 1, 2, 3 … 64 passages apart.
:::
::: legend
- !cell **One cell** of the grid compares passage *i* (its row) with passage *j* (its column). Brighter is a higher cosine; the colour bar under the grid gives the scale. Coloured bars along the edges mark the chapters.
- !dot **One dot** of the path is one passage. !thick The **thick line** follows the average position of neighbouring passages; the slider sets how many.
- !line **Bottom chart**: average cosine against distance in the text. The dashed line is two passages of *Alice* picked at random.
:::
::: look
- What is the brightest part of the grid, apart from the diagonal itself?
- Do the chapters show up as squares?
- Does the path wander off and come back, or drift steadily?
:::
::::

Embeddings of a sequence are not a bag of points. Neighbouring passages share half their words, so of course they are similar: cosine {{walk_lag1|.2f}}. But the similarity does not vanish when the shared words do. Two passages apart, with no word in common, the cosine is still {{walk_lag2|.2f}}, and it stays above the level of two random passages of *Alice* ({{walk_rand|.2f}}) for as far as the chart goes. A book stays on its topic, and a chapter on its scene.

So the vectors form a path that moves in small steps. That matters for compression: if you know where the path was, you can guess where it goes next and store only the surprise. Video codecs, audio codecs and DPCM all live on that one fact; [[@prediction]] puts it to work.

:::: lab alice-walk again
::: reading
1. {diagonal} **Locality.** The bright band along the diagonal: each passage resembles the passages just before and after it.
2. {blocks} **Chapters are faint blocks.** The outlined squares are the chapters. Passages of the same chapter are only slightly more alike than passages of different chapters: {{walk_within|.2f}} against {{walk_across|.2f}} on average (for passages at least 8 apart). The scene changes, but the book's voice does not.
3. {path} **The path walks.** The thick line moves smoothly. Each chapter occupies its own part of the plane and the walk drifts from one to the next.
4. {lag} **Similarity fades slowly.** From {{walk_lag1|.2f}} at one passage apart to {{walk_lag2|.2f}} at two (no shared words), then a slow decline that stays above the random line.
:::
::::

## Back to the map, one last time {#map-shape}

The meaning map from the previous page showed the cloud after subtracting the average. Here it is without that step, seen from the side: across is the direction of the average passage, and the true origin, the zero vector, is marked.

:::: lab meaning-map shape
::: reading
1. {cone} **The cone, seen from the side.** Every passage is far from the origin along the average direction, between {{map_along_min|.2f}} and about 0.7. None comes near zero, and the dashed circle shows the length 1 that every arrow has. This is the lean of the first section.
2. {centred} **The map you saw first.** Subtracting the average moves the origin into the middle of the cloud, and the directions of greatest spread become the axes.
:::
::::

## The same three, with numbers

::: stats
- **{{rand_cos|.2f}}**{.k-res} average cosine between two *random* passages. Unrelated texts are not perpendicular.
- **{{mean_norm|.2f}}**{.k-res} length of the mean vector. All vectors have length 1, so nearly half of each one is shared by everybody.
- **{{pr|.0f}}**{.k-vec} effective number of directions, out of {{d}} (the participation ratio).
- **{{lag2|.2f}}**{.k-vec} cosine between passages two apart in the text, with no word in common.
:::

## Why this matters for the rest of the book

| Property | What it buys |
|---|---|
| Unit length | Cosine, dot product and distance give the same ranking, so error can be measured as plain squared distance |
| A shared mean | Subtract it once and stop spending bits on it |
| A lopsided [[spectrum]] | A few directions deserve many bits, most deserve few ([[@spectrum-and-bits]]) |
| Clusters by topic | A learned [[codebook]] can sit on the clusters (Part 4) |
| Neighbours in the text are neighbours in space | Sequences can be predicted ([[@prediction]]) |

::: check
- The cloud leans one way: random pairs have cosine {{rp_raw_mean|.2f}}, not 0. Subtract the mean first.
- A few passages become everyone's neighbour (hubs). Centring removes the part caused by the lean; crowded regions keep the rest.
- About {{sp_pr_real|.0f}} directions out of {{d}} are effectively used, because coordinates move together.
- Most variance is not most neighbours: the thin tail separates close rivals.
- A text is a path through the space, and paths are predictable.
:::
