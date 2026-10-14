---
title: Our experiments
kicker: Part 9 · From the workbench
goal: Overviews of our own experiments, with toys to explain the mechanism, measured results to test it, and enough detail to see what remains uncertain.
---

::: lede
A vector has 256 coordinates. Does it need 256 numbers in storage? Before building a codec, we can look at the vectors themselves: where they vary, what carries over to another sequence, and how much error a shortcut leaves behind.
:::

This part collects experiment overviews from **kvdiff**, our project for studying and compressing transformer [[KV cache|KV caches]]. The earlier chapters supply the tools; here we use them on a model's internal vectors and follow the measurements where they lead.

::: cards four
- **The question**
  Start with one concrete thing we want to know about the vectors.
- **The mechanism**
  Try a small live toy before looking at the model's data.
- **The measurement**
  Name the model, samples, splits and averaging rule behind each result.
- **The catch**
  Separate an observation, a model calculation and a demonstrated codec.
:::

## From kvdiff

::: cards
- **[The shape of cached values](@kvdiff-v-spectrum)**{.k-vec}
  Experiment 03 · Qwen 3.5 2B · five GSM8K sequences. A concentrated spectrum, a stubborn tail, and a first test of whether PCA directions transfer between sequences.
:::

::: aside Where these results come from
These are our project's existing measurements, adapted for this book. Importing an overview does not re-run the experiment. Each page records the original analysis and snapshot; the figure data ship with the website.
:::

## What comes next

As the project grows, this section will collect more overviews: compression at equal storage budgets, the effect on attention outputs and next-token loss, and transfer to new sequences and tasks. Each will connect back to the relevant geometry, quantization and information-theory chapters.

::: check
- The figures distinguish synthetic toys from measured model data.
- A low reconstruction error still needs a model-output check.
- A promising ideal rate still needs an actual codec, with all storage counted.
:::
