"""Shared helpers for the experiments: data loading, embedding, caching."""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
CACHE.mkdir(exist_ok=True)
OUT = HERE.parent / "data"
OUT.mkdir(exist_ok=True)

MODEL = "sentence-transformers/all-MiniLM-L6-v2"
WINDOW, STRIDE = 48, 24

DB_BOOKS = ["melville-moby_dick.txt", "austen-emma.txt", "chesterton-brown.txt", "whitman-leaves.txt"]
QUERY_BOOKS = ["carroll-alice.txt", "shakespeare-hamlet.txt"]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def gutenberg():
    import nltk

    nltk.data.path.insert(0, str(CACHE / "nltk"))
    try:
        from nltk.corpus import gutenberg as g

        g.fileids()
    except LookupError:
        nltk.download("gutenberg", download_dir=str(CACHE / "nltk"), quiet=True)
        from nltk.corpus import gutenberg as g
    return g


def windows(words, size=WINDOW, stride=STRIDE):
    return [" ".join(words[s : s + size]) for s in range(0, max(1, len(words) - size + 1), stride)]


def embed(texts, batch=512):
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(MODEL, device="cuda")
    X = model.encode(texts, batch_size=batch, normalize_embeddings=True, show_progress_bar=False)
    return np.asarray(X, dtype=np.float32)


def load_data():
    """Returns dict with X (all windows), book id per window, split masks, texts of the Moby demo slice."""
    f = CACHE / "emb.npz"
    if f.exists():
        z = np.load(f, allow_pickle=True)
        return {k: z[k] for k in z.files}
    g = gutenberg()
    ids = g.fileids()
    texts, book = [], []
    for b, fid in enumerate(ids):
        w = windows(g.raw(fid).split())
        texts += w
        book += [b] * len(w)
    log(f"{len(ids)} books, {len(texts)} windows; embedding with {MODEL}")
    X = embed(texts)
    # Moby-Dick demo slice: 240 windows starting at chapter 1
    words = g.raw("melville-moby_dick.txt").split()
    ch = {}
    for i in range(len(words) - 1):
        if words[i] == "CHAPTER" and words[i + 1] in ("1", "2", "3", "4") and words[i + 1] not in ch:
            ch[words[i + 1]] = i
    start = ch["1"] + 3  # skip "CHAPTER 1 Loomings."
    demo_words = words[start:]
    demo_texts = windows(demo_words)[:240]
    demo = embed(demo_texts)
    chapters = [[0, "Loomings"], [(ch["2"] - start) // STRIDE, "The Carpet-Bag"], [(ch["3"] - start) // STRIDE, "The Spouter-Inn"]]
    out = dict(
        X=X,
        book=np.array(book, dtype=np.int32),
        ids=np.array(ids),
        demo=demo,
        demo_texts=np.array(demo_texts),
        chapters=np.array(json.dumps(chapters)),
    )
    np.savez(f, **out)
    return out


def splits(D):
    ids = list(D["ids"])
    book = D["book"]
    db_ids = [ids.index(b) for b in DB_BOOKS]
    q_ids = [ids.index(b) for b in QUERY_BOOKS]
    db = np.isin(book, db_ids)
    qm = np.isin(book, q_ids)
    tr = ~(db | qm)
    return tr, db, qm


def cached(name):
    """Decorator: cache a section's JSON result so re-runs only redo what changed."""

    def deco(fn):
        def wrap(*a, force=False, **k):
            f = CACHE / f"sec_{name}.json"
            if f.exists() and not force:
                return json.loads(f.read_text())
            t = time.time()
            log(f"[{name}] running")
            r = fn(*a, **k)
            f.write_text(json.dumps(r))
            log(f"[{name}] done in {time.time() - t:.1f}s")
            return r

        return wrap

    return deco


def same_book_pairs(book):
    """Boolean mask m[t] = True when window t and t-1 are in the same book (m[0] False)."""
    m = np.zeros(len(book), dtype=bool)
    m[1:] = book[1:] == book[:-1]
    return m
