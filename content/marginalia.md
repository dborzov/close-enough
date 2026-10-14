---
title: The running example
kicker: Meet the product
goal: One invented company, one real dataset, and two budgets to hit. Everything from here to the end of Part 6 is measured against this setup.
---

::: story Priya, co-founder of Marginalia | WEEK 1 · THE PITCH
"Marginalia is search for the inside of books. You type *the part where she falls so long she wonders if she'll come out on the other side of the world*, and we take you to the paragraph in *Alice in Wonderland*. No keywords, just meaning. We start with the public-domain catalogue on Project Gutenberg, about 75,000 books."
:::

Priya and her co-founder are two people with a GPU budget and a single search server. They are about to discover that the hard part of their product is not the model. It is storing what the model produces.

::: aside About the characters
Priya and Marginalia are invented to keep the numbers concrete. The books, the vectors and every measurement are real.
:::

## From a book to a sequence of vectors

Cut each book into short overlapping [windows]{.def .k-vec} of text and embed each one.

::: widget pipeline | From a book to vectors
**The pipeline** 48-word windows with a stride of 24, so each window shares half its words with the next. Each coloured column on the right is one real embedding (the first 24 of its {{d}} coordinates; colour shows sign and size). Neighbouring columns look alike. Hold on to that.
:::

```python Embed a book | sentence-transformers
from sentence_transformers import SentenceTransformer
import numpy as np

def windows(words, size=48, stride=24):
    for s in range(0, max(1, len(words) - size + 1), stride):
        yield " ".join(words[s:s + size])

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")   # 384-d
words = open("alice.txt").read().split()
X = model.encode(list(windows(words)), batch_size=256,
                 normalize_embeddings=True)   # (n_windows, 384) float32, unit length
np.save("alice.f32.npy", X)                   # 1,536 bytes per window
```

## The data used in this book

::: stats
- **18**{.k-vec} books from the NLTK Gutenberg corpus
- **{{n_windows|,}}**{.k-vec} windows (48 words, stride 24)
- **{{d}}**{.k-vec} dimensions, float32, unit length
- **{{n_train|,}} / {{n_db|,}}**{.k-q} windows for training / for the database
:::

The split mimics Marginalia's reality:

- **Train** on 12 books. Codebooks, rotations and probability models are fitted here.
- **Database**: four *other* books (*Moby-Dick*, *Emma*, *The Innocence of Father Brown*, *Leaves of Grass*). Everything is scored here.
- **Queries**: {{n_queries}} windows from two more (*Alice in Wonderland*, *Hamlet*).

::: warn Held-out, always
A compressor that is fitted and scored on the same vectors flatters itself. Every error, recall and bit count in this book is on books the compressor never saw.
:::

## Two jobs, two budgets

::: story Priya | WEEK 3 · THE SPREADSHEET
"75,000 books at about 4,000 windows each is 300 million vectors. At 384 floats each that's **{{marg_raw_gb|.0f}} GB**. Our search box has 8 GB we can give to the index. And separately, we need to keep the exact embeddings somewhere: re-embedding everything costs real GPU money, and the model we use today will be retired someday."
:::

::: stats
- **300 M**{.k-vec} windows
- **1,536 B**{.k-res} per vector as 384 × float32
- **≈ 16 B**{.k-q} per vector to fit an 8 GB index, with ids
- **bit-exact**{.k-bits} for the archive copy, as small as possible
:::

So Marginalia has two different compression problems.

::: cards
- **The search index (lossy)**{.k-q}
  About a 100× reduction. Information may be lost, as long as nearest neighbours stay nearest. → Parts 3, 4 and 5
- **The archive and the wire (lossless)**{.k-bits}
  Every bit must come back. Here the tools of the first half become *predictors* and *probability models*. → Part 6
:::

::: svg asymmetry | Encode once, compare often
**The asymmetry** A vector is [encoded]{.k-enc} once, when it enters the index. It is [decoded]{.k-dec} or [compared]{.k-q} every time a query touches it. This is why it can be worth making encoding very expensive.
:::

## The five-number scorecard

Every method is a different trade between five quantities. After each method you will see a strip like this:

```score EXAMPLE
good distortion | low
bad encode | expensive
good search | cheap
ok training | moderate
```

- **Rate**{.k-bits}: bits per vector. Mostly held fixed at 64 bits (8 bytes) for comparisons.
- **Distortion**{.k-res}: relative squared error $\lVert x-\hat x\rVert^2 / \lVert x - \bar x\rVert^2$, and search [[recall@10]].
- **Encode cost**{.k-enc}: compute to turn $x$ into its code. Paid once per vector.
- **Search cost**{.k-q}: compute to compare a query with a code. Paid on every query, for every candidate.
- **Training cost**{.k-book}: compute and data to learn the codebooks.

::: check
- Marginalia turns books into a *sequence* of unit vectors, 300 million of them.
- Two jobs: a lossy search index at about 16 bytes per vector, and a lossless archive.
- Encoding happens once; searching happens on every query.
:::
