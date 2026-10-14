---
title: Meaning from context
kicker: Stage 1 · Where vectors come from
goal: Words do not overlap, meanings do. The fix is seventy years old and fits in one sentence.
---

## The problem with keywords

Someone types *"how do I fix a flat"*. The perfect document is titled *"Repairing a punctured bicycle tyre"*. They share zero words.

Classic search (Salton's vector space model and its descendant [[BM25]], which still powers Lucene and Elasticsearch) represents a text as a vector with **one dimension per vocabulary word**. Different words sit on different axes, so "flat" and "punctured" are perpendicular: similarity zero.

What we want instead is a space with a few hundred to a few thousand axes that do not correspond to words at all, where texts about the same thing land near each other however they are worded. Such a vector is a [dense embedding]{.def .k-vec}: dense because every coordinate is non-zero, unlike the sparse one-slot-per-word vectors.

## The founding idea

::: pull
You shall know a word by the company it keeps.

J. R. Firth, 1957. This is the [[distributional hypothesis]]: words used in similar contexts have similar meanings.
:::

"Coffee" and "tea" both appear near "cup", "hot", "drink", "morning". Describe each word by the contexts it appears in, and similar words get similar descriptions automatically. Nobody has to tell the machine what tea is.

The first practical version just counted:

1. Build a giant matrix of how often each word appears with each context word.
2. Squeeze it down to a few hundred dimensions with an [[SVD]], the matrix version of "find the main directions of variation".

That is [[lsa|Latent Semantic Analysis]] (1990). The squeeze forces words that behave alike to share coordinates.

## word2vec: predict instead of count

In 2013 Tomas Mikolov's team at Google flipped it around. Keep a table with one learned vector per word and train it on a simple game: given a word, can you tell its real neighbours in a sentence from random words? The only way to win is to give words that share contexts similar vectors.

```python Skip-gram with negative sampling, the whole idea | numpy
# Two tables of shape (vocab_size, d), random at the start.
# For every (center, context) pair in real text, plus k random "negative" words:
pos = sigmoid(W_in[center] @ W_out[context])       # want this near 1
neg = sigmoid(-W_in[center] @ W_out[negatives].T)  # want each near 1 (dot product low)
loss = -log(pos) - log(neg).sum()
# Gradient descent nudges the vectors. Afterwards keep W_in: those are "the embeddings".
```

Two things made it famous:

- **Speed.** It trained on billions of words on one machine.
- **Directions that mean something.** The step from "man" to "woman" is roughly the same vector as from "king" to "queen".

::: widget word-space | A toy word space
**Drag the star, or tap a word** A hand-placed two-dimensional toy, not a real model. Real embeddings have hundreds of dimensions but the logic is the same: similar items cluster, and consistent offsets (gender, royalty, age) act like directions you can add. Try the analogy button, then switch the distance to cosine and see which neighbours change.
:::

::: aside Cousins, not rivals
A year later Levy and Goldberg showed that [[word2vec]] is implicitly factorizing a matrix of word–context statistics. So [[LSA]] and word2vec both find a low-dimensional space where dot products reproduce co-occurrence counts. One counts and then compresses; the other compresses as it goes.
:::

## Where it runs out

The limits of word2vec point straight at the next page:

- **One vector per word.** "Jaguar", the cat and the car, gets one compromise vector stuck between the two meanings. Tap *Query "jaguar"* in the playground to see where it lands.
- **Words, not sentences.** Averaging word vectors throws away word order and negation: "dog bites man" and "man bites dog" come out identical.

::: check
- Sparse keyword vectors cannot see that two different words mean the same thing.
- The distributional hypothesis turns "meaning" into something countable: shared contexts.
- LSA and word2vec both compress co-occurrence statistics into a few hundred dimensions.
- A table of word vectors has no context and no notion of a sentence.
:::
