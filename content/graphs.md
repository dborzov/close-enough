---
title: Walk toward the query
kicker: Stage 2 · Graph indexes
goal: Link every vector to a handful of near neighbours. To search, start anywhere and keep hopping to whichever neighbour is closer. It is the default index of the vector-database era.
---

## Asking for directions

Connect every vector to a few of its near neighbours. To search:

::: steps
1. Start at a fixed entry point.
2. Look at its neighbours. Hop to whichever is closest to the query.
3. Keep a short list of the best points seen so far.
4. Stop when no neighbour of anything on the list improves it.
:::

It is like asking for directions in a city: every person points you somewhere closer.

## HNSW: add highways

A flat neighbour graph has a weakness. If the entry point is far from the query, the walk takes many short hops.

[[HNSW]] (Hierarchical Navigable Small World, Malkov and Yashunin, 2016) adds layers, the same idea as a skip list:

- **Top layers** are sparse, with long-range links: highways that cross the space in a few hops.
- **Lower layers** get denser.
- **The bottom layer** holds every vector and refines locally.

| Knob | What it sets | More of it means |
|---|---|---|
| `M` | links per node | better recall, more memory |
| `efConstruction` | search width while building | better graph, slower build |
| [[efSearch]] | search width per query | better recall, slower query |

## What it costs

Graphs gave the best speed–recall trade-off on benchmarks and became the default in nearly every vector database. The price:

- **Memory.** The vectors *plus* the links, usually all in RAM. At `M = 32` the links alone are about 256 bytes per vector, the size of a whole compressed index.
- **Deletes are painful.** Removing a node tears holes in everyone's neighbour lists.
- **Filters are awkward.** "Only documents from 2025" can disconnect the graph the walk depends on.

## Relatives

::: cards
- **[[DiskANN]]** (Microsoft, 2019)
  A graph (Vamana) designed to be read from SSD, with only compressed vectors in RAM. A billion vectors on one machine.
- **CAGRA** (NVIDIA)
  Graphs built and searched on GPUs.
- **NSW, NSG, and others**
  Different rules for which links to keep. The search loop is the same.
:::

::: aside Graphs still need compression
The walk compares the query with a few thousand vectors. DiskANN makes those comparisons against [[PQ]] codes held in RAM and only reads exact vectors from disk at the end. A graph decides *which* vectors to look at; Parts 3 and 4 decide how cheaply each look can be made.
:::

::: check
- A graph index walks greedily toward the query, keeping the best `efSearch` candidates.
- HNSW's layers make the first long stretch take only a few hops.
- The cost is RAM for links, hard deletes and awkward filtering.
:::
