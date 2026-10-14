---
title: What the geometry means
kicker: Stage 1 · Reading the space
goal: Four experiments on real embeddings, each shown first with no explanation, then explained, then shown again. Meaning lives in angles and directions, and "similar" means whatever the training data said.
---

This page is built around **experiments** on real embeddings. Each section opens with one: what was done to the text, how to read the picture, and a few things to look for, without any explanation. Look first, and notice what you notice. Then read the section. At its end the same experiment comes back with a guided reading. Click a step and the figure changes to show it.

The first experiment is the whole page in one picture. It comes back at the end.

:::: lab meaning-map | The meaning map
::: question
Six books are cut into passages, and each passage becomes a list of 384 numbers. Nobody tells the model which book a passage came from. Do passages from the same book still land near each other?
:::
::: recipe
1. Take six public-domain books: *Alice in Wonderland*, *Hamlet*, *Macbeth*, *Sense and Sensibility*, *Emma* and the King James Bible.
2. Cut each book into passages of `48 words`. A new passage starts every `24 words`, so each passage overlaps the next by half.
3. Pick `220` passages from each book at random, `{{map_n|,}}` in all.
4. Give each passage to the embedding model `all-MiniLM-L6-v2`. It returns `384 numbers`, scaled so that, read as an arrow, they have length 1.
5. Subtract the average arrow from every arrow. Find the direction along which the {{map_n|,}} arrows spread out most (*direction 1*), and the next one at right angles to it (*direction 2*). These are the first two [[pca|principal directions]].
6. Place each passage by how far its arrow reaches along direction 1 (across) and direction 2 (up).
:::
::: legend
- !dot **One dot** is one passage of 48 words. Hover to read it. Click to pin it.
- !colour **Colour** is the book the passage comes from. Click a book in the legend to hide it.
- !x **Across and up** are the reach along direction 1 and direction 2. Zero is the average passage. Both axes use the same scale.
- !line **Lines** appear when you pin a passage. They join it to its 10 nearest passages, measured with all 384 numbers, not just the two shown here.
:::
::: look
- Which books keep to themselves, and which share ground?
- Pin a dot in the middle of a book's region. Do its ten nearest passages sit next to it on the map?
- Set the axes to directions 3 and 4. What separates now?
:::
::::

## Similarity is angle {#angle}

:::: lab neighbours | Nearest passages
::: question
Take one passage. Of eighty thousand others, which point most nearly the same way? Are they about the same thing?
:::
::: recipe
1. Cut 17 public-domain books into passages of `48 words`, as before: `{{nn_n|,}}` passages.
2. Embed every passage: `384 numbers` each, length 1.
3. Choose one passage as the *query*: ten famous ones picked by hand, and six drawn at random.
4. Compute the [[cosine]] between the query and every other passage: multiply the two lists of 384 numbers position by position and add up the products.
5. Leave out the two passages next to the query in its own book. They share half their words with it.
6. Sort. Show the ten highest, and count how many passages land at each value.
:::
::: legend
- !bar **Grey bars** count the passages at each cosine with the query, in bins 0.02 wide. Each gridline up is ten times more passages than the one below. **Blue bars** inside them count only passages from the query's own book.
- !dot **Numbered dots** mark the 10 nearest passages at their cosine. The list below the chart gives their text.
- !x **Across** is the cosine with the query. The small number under each value is the same thing as an angle between the two arrows.
:::
::: look
- Read the ten nearest to "Alice falls down the rabbit hole". What do they share?
- Where is the bulk of the grey bars? Is it at zero?
- Pick a passage drawn at random. Are its neighbours as convincing?
:::
::::

Every embedding here has length 1. Its only information is its **direction**, so comparing two embeddings means comparing two directions: measuring the angle between them.

The cosine of that angle is easy to compute. For two vectors of length 1 it is the sum of products of matching coordinates:

$$\cos\theta = x_1 y_1 + x_2 y_2 + \dots + x_{384} y_{384}$$

A cosine of 1 means the same direction, 0 means perpendicular, and $-1$ means opposite. The distance between the tips of the two arrows carries the same information, because $\lVert x - y\rVert^2 = 2 - 2\cos\theta$, so ranking by cosine and ranking by distance give the same order ([[@closeness]]).

Two things in the experiment are worth saying out loud.

**Nearness is relative.** A typical passage sits at cosine {{nn_median_cos|.2f}} from the query, an angle of about {{nn_median_deg|.0f}}°. The ten nearest sit around {{nn_tenth_median|.2f}}, about {{nn_tenth_deg|.0f}}°. In 384 dimensions almost everything is nearly perpendicular to everything else, so "close" means "far out in the right-hand tail". No passage is at 0°, and a cosine of 0.6 means nothing until you see how few passages reach it.

**Near means "the model treats them alike".** Often that is meaning: the creation story in Genesis finds Milton's retelling of it in *Paradise Lost*. Sometimes it is form: Hamlet's soliloquy finds other lines of the same play, mostly because they share speaker tags and stage directions. Which of the two wins depends on what the model was trained to notice, which is the subject of the third section.

:::: lab neighbours again
::: reading
1. {angle} **A cosine is an angle.** Read the small numbers under the axis. A typical passage is about {{nn_median_deg|.0f}}° away from the query; the nearest are around {{nn_tenth_deg|.0f}}°. Nothing is near 0°, and almost nothing is past 90°.
2. {tail} **Nearest is the far tail.** The ten nearest passages are the faint shaded strip at the right edge: ten out of {{nn_n|,}}. The cosine is only meaningful compared with everything else.
3. {crossbook} **The same story in another book.** Among the neighbours of the creation story: three passages of *Paradise Lost*, which retells Genesis, and one from *The Man Who Was Thursday*. The model was never told these books are related.
4. {words} **Shared words help, but are not needed.** Psalm 23's two nearest passages quote it word for word: a children's story book that includes the psalm. Further down the list are Bible verses that share no longer word with it at all, close because they share register and subject.
5. {form} **Form counts too.** "To be, or not to be" mostly finds other lines of *Hamlet* that start with a speaker tag such as `Ham.`, or contain a stage direction like `Enter`. The model sees that this is a play script before it sees what the speech is about.
6. {random} **Random queries behave the same way.** A passage drawn at random gets neighbours from its own book and its own kind of text, just like the famous ones.
:::
::::

## Directions carry attributes {#directions}

:::: lab dials | Two dials
::: question
Is there a direction in the space that means "good versus bad", and another that means "past versus present"? Can simple averaging find them?
:::
::: recipe
1. Write {{dials_n_sit}} everyday situations, each in four versions: good or bad, past or present. "We had a wonderful dinner at the new restaurant." / "We are having a horrible dinner at the new restaurant." `{{dials_n_sent}} sentences`.
2. Embed each sentence: `384 numbers`, length 1.
3. Split the situations into two halves. The *fitting half* (`10` situations) is used to find the directions. The other `10` are held out to test them.
4. The **sentiment direction** is the average good sentence minus the average bad one, in the fitting half. The **tense direction** is the average past sentence minus the average present one. Each is scaled to length 1.
5. Subtract the average fitting sentence from every sentence. Place each by how far it reaches along the two directions.
6. To score an axis, put a threshold halfway between the two groups' averages (fitting half only) and count the held-out sentences that land on the correct side.
:::
::: legend
- !dot **A filled dot** is a sentence in the past tense. !hollow A **ring** is in the present. **Blue** is the good version, **orange** the bad one.
- !x **Across and up** are the reach along the two directions. The menus put other axes there: a random direction, or one of the 384 coordinates on its own.
- !line **Right panel**: every one of the 384 coordinates used alone as the axis, scored the same way and sorted best first. The dashed lines are the two directions.
:::
::: look
- Do the four kinds of sentence take four corners? These are the held-out sentences: the directions never saw them.
- Put the random direction across. What happens to the blue and orange dots?
- Click the best point in the right panel. Is the best single coordinate as good as the direction?
:::
::::

Averaging twenty sentences found a direction that sorts the held-out sentences by sentiment {{dials_acc_good|.0%}} of the time, and another that sorts them by tense {{dials_acc_past|.0%}} of the time. A random direction, the control, sorts sentiment {{dials_acc_random|.0%}} of the time: about as good as a coin on forty sentences.

The two directions sit at {{dials_angle|.0f}}° to each other, almost exactly perpendicular. They work like two independent dials: moving a sentence along one does not move it along the other.

This is the *linear representation hypothesis*: attributes such as sentiment, tense, plurality, formality or language often correspond to roughly consistent directions. The famous analogy trick is the same fact. If "good minus bad" is a fixed direction, adding it to any bad sentence should point toward the good version of that same sentence.

### No coordinate is in charge

The other half of the experiment asks whether a single one of the 384 coordinates could do the same job. The best one, chosen on the fitting half, sorts only {{dials_best_coord_good|.0%}} of the held-out sentences by sentiment and {{dials_best_coord_past|.0%}} by tense, and most coordinates are close to a coin flip.

There is a simple reason. Rotate the whole space and every cosine stays the same, so training has no reason to line a concept up with an axis. Each attribute is spread over many coordinates, and each coordinate takes part in many attributes. Models even pack more concepts than they have dimensions by letting their directions overlap slightly ([[superposition]]). Dimension 217 is not "sentiment". Meaning is in directions, and directions are mixtures of coordinates.

:::: lab dials again
::: reading
1. {dials} **Four corners.** Held-out sentences land in the corner of their kind: good to the right, bad to the left, past up, present down.
2. {parallel} **Nearly the same step in every situation.** Each arrow goes from the good to the bad version of one sentence. They all point left by a similar amount, though not exactly in parallel. That shared step is what makes "add the difference" analogies work, and the scatter around it is why they work only roughly.
3. {random} **A random direction sorts nothing.** Across is now a random direction. Blue and orange mix: {{dials_acc_random|.0%}} sorted correctly, near chance. Up still sorts tense.
4. {coord} **No coordinate is the sentiment coordinate.** Across is the best single coordinate. The colours overlap far more than along the direction, and the right panel shows that most coordinates are worse.
:::
::::

## "Similar" means what the training said {#similar}

:::: lab hot-cold | Hot and cold
::: question
Which sentence does the model place closer to "The soup is hot.": "The soup is cold.", or "The broth is scalding."?
:::
::: recipe
1. Write {{pairs_n}} short *anchor* sentences, such as "The soup is hot."
2. Give each anchor four partners: its **opposite**, made by flipping one word ("The soup is cold."); its **negation** ("The soup is not hot."); a **paraphrase** that means the same in other words ("The broth is scalding."); and an **unrelated** sentence ("The car is parked outside.").
3. Embed all `80` sentences with the same model.
4. Compute the cosine between each anchor and each of its four partners: `64` pairs.
5. Count the words the two sentences share: distinct words in both, divided by distinct words in either.
:::
::: legend
- !dot **One dot** is one anchor–partner pair, placed at their cosine. Each row is one kind of partner, and so is each colour.
- !bar **A thick tick** marks the average of the row.
- !ring **Ringed dots** joined by a dashed line are the four partners of the anchor chosen in the menu. Hovering a dot chooses its anchor.
- !x **Against shared words** switches the picture: across is the share of words in common, up is the cosine.
:::
::: look
- Which row sits furthest to the right: the opposites, the negations or the paraphrases?
- Is there an anchor where the paraphrase beats the opposite?
:::
::::

On average the model puts the opposite at cosine {{pairs_mean_opposite|.2f}}, the negation at {{pairs_mean_negated|.2f}} and the paraphrase at only {{pairs_mean_paraphrase|.2f}}. The opposite beat the paraphrase for {{pairs_opp_beats_para}} anchors out of {{pairs_n}}.

This is not a bug. "The soup is hot" and "The soup is cold" are about the same thing: the temperature of the soup. They use the same words, would appear in the same conversations, and answer the same question. A model that learns from context ([[@meaning-from-context]]) or from pairs of related texts ([[@contrastive-training]]) learns *relatedness*: what tends to show up together. Pure [[word2vec]] puts "hot" next to "cold" for the same reason.

What counts as "similar" is set by the training data. `all-MiniLM-L6-v2` was trained on about a billion pairs such as questions and their answers, titles and their articles, and duplicate questions. It learned to bring together texts that would be useful to each other in a search, and for search that is usually right: someone asking about the soup's temperature wants both sentences. It also learned to lean on shared words: across the 64 pairs, the correlation between cosine and the share of words in common is {{pairs_overlap_corr|.2f}}.

::: warn Embeddings find topic, not truth
A vector search for "the treatment works" will happily return "the treatment does not work". If your application needs to tell a claim from its opposite (fact checking, contradiction detection, sentiment), check what your model was trained on, or rerank the results with a model that reads both texts together.
:::

:::: lab hot-cold again
::: reading
1. {rows} **Opposites are neighbours.** The opposite and negation rows sit far to the right, around {{pairs_mean_opposite|.2f}}. The paraphrases trail at {{pairs_mean_paraphrase|.2f}}, and unrelated sentences sit at zero, perpendicular.
2. {water} **The extreme case.** "The water is not deep." is almost the same vector as "The water is deep." (0.96). "You cannot touch the bottom here.", which says the same thing in different words, is barely related (0.14).
3. {overlap} **Shared words predict much of it.** Plotted against the share of words in common, the pairs line up from bottom left to top right. Opposites and negations share almost every word; paraphrases share almost none.
:::
::::

## Back to the map {#map-again}

The first experiment again, with what the three sections explained.

:::: lab meaning-map again
::: reading
1. {books} **Books become regions.** Nothing in the recipe mentions books, yet each book holds its own patch. Of each passage's ten nearest passages (measured with all 384 numbers), {{map_same_book|.0%}} come from the same book. A book has a vocabulary, a cast and a voice, and every passage carries some of each.
2. {authors} **Neighbours by kind.** With *Alice* and the Bible hidden, the two Austen novels share one region and the two Shakespeare plays another. Same author, same form, same vocabulary: what the model learned to notice (section 3).
3. {shadow} **The map is a shadow.** Directions 1 and 2 hold only {{map_var1|.0%}} and {{map_var2|.0%}} of the spread; the other 382 directions, {{map_rest|.0%}} of it, are flattened onto the page. The pinned passage's true neighbours are scattered across the map. On average only {{map_kept2d|.0%}} of a passage's ten true neighbours are among its ten nearest on the map. Use a map like this to see regions, never to judge who is close to whom.
4. {deeper} **Other directions, other distinctions.** Directions 3 and 4 hold less of the spread and separate different things. Direction 3 pulls *Alice*, the only children's book, away from everything else; the Bible, far off on the first map, now sits in the middle of the crowd. Each direction is one more dial ([section 2](#directions)), and the dials further down the list make finer and finer distinctions.
:::
::::

## What the experiments showed

| Property | The evidence on this page |
|---|---|
| Similarity is angle | Typical passages are about {{nn_median_deg|.0f}}° apart, nearest neighbours about {{nn_tenth_deg|.0f}}° |
| Attributes are directions | Averaging found sentiment and tense directions that sort held-out sentences {{dials_acc_good|.0%}} and {{dials_acc_past|.0%}} correctly |
| Single axes mean little | The best single coordinate manages {{dials_best_coord_good|.0%}} |
| "Similar" is set by training | Opposites score {{pairs_mean_opposite|.2f}}, paraphrases {{pairs_mean_paraphrase|.2f}} |
| A 2-D picture is a shadow | Only {{map_kept2d|.0%}} of true neighbours stay neighbours on the map |

The next page turns from what the directions mean to the shape of the whole cloud: where it sits, how many directions it really uses, and how a text moves through it ([[@shape-of-the-cloud]]).

::: aside Terms to search
The umbrella terms are *representation learning*, *metric learning*, *dense retrieval* and, on the theory side, the *linear representation hypothesis* and the *platonic representation hypothesis*: the observation that different models trained on different data converge on similar geometry.
:::

::: check
- Embeddings are directions; closeness is the angle between them, and it only means something relative to everything else.
- Attributes such as sentiment and tense are directions, found by averaging differences, and no single coordinate carries them.
- "Similar" means what the training data put together: opposites are often closer than paraphrases.
- A two-dimensional picture of embeddings shows regions, not neighbours.
:::
