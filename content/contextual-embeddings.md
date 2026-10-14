---
title: Context arrives
kicker: Stage 1 · Where vectors come from
goal: A transformer gives every word a different vector in every sentence. Turning that into one vector per passage takes two more steps, and one of them is routinely misunderstood.
---

## One word, many vectors

ELMo and then BERT (2018) produced a different vector for each word *in each sentence*. "Bank" in "river bank" and in "bank account" now get different vectors, because every layer of the transformer mixes in information from the surrounding tokens.

That solves the jaguar problem. It does not yet give us one vector per passage.

## From token vectors to one embedding

::: svg embed-pipeline
**The pipeline** A text embedding model reuses an LLM-style backbone end to end, not just its first layer. The blue box is where word2vec-era vectors live; the yellow box is what an embedding API returns.
:::

Read the figure left to right:

1. **Tokenize** the text into integer ids.
2. **Look up** each id in a table. This is a fixed vector per token, context-free.
3. **Run all the layers.** Attention lets each position absorb its neighbours.
4. **Take the last layer's hidden states**: one contextual vector per token.
5. **Pool** them into one vector, usually by averaging ([[pooling|mean pooling]]) or by taking one special token's state.
6. **Normalize** to length 1.

::: qa So is a text embedding just the LLM's first layer, the token embedding table?
**No, and this is the single most common confusion.** The first layer (`wte` in GPT code) is a lookup table: token id in, fixed vector out. It is exactly word2vec's kind of table. It knows nothing about context, and it gives one vector per token, not one per passage.

A modern text [[embedding]] runs the *whole* text through *all* the layers, pools the last layer, and then, crucially, the model is **fine-tuned so that distances mean "relevant to each other"**. Without that fine-tuning, raw LLM hidden states make mediocre search vectors.
:::

## Why the raw states are not enough

A pretrained language model was trained to predict tokens. Nothing in that goal asks "are these two texts about the same thing?" So its raw vectors are organised around whatever helps prediction:

- formatting and punctuation,
- how frequent the words are,
- position in the text.

Two passages about the same topic can sit far apart, and two unrelated passages with the same layout can sit close. The next page is the fix.

::: aside Bidirectional attention
A chat model hides the future from each token so that it can be trained to predict the next one. An embedder has no next token to predict, so many embedders switch the same backbone to *bidirectional* attention: every token sees every other. EmbeddingGemma does this to a Gemma backbone.
:::

::: check
- Transformers produce contextual vectors: one per token, per sentence.
- An embedding is the pooled, normalized last layer of the whole model, not its first layer.
- A model trained to predict tokens does not automatically produce vectors where distance means relevance.
:::
