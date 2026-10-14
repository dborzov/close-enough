"""Experiments for "What the geometry means" and "The shape of the cloud".

Each section returns a small summary (kept in data/results.json, used by the prose) and,
under the key "lab", the data one interactive figure needs (written to data/lab/<name>.json).
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np

from common import STRIDE, WINDOW, cached, embed, gutenberg, windows

RNG_SEED = 0
HERE = Path(__file__).resolve().parent

# The six books of the meaning map: two by Austen, two by Shakespeare, and two loners.
MAP_BOOKS = [
    ("carroll-alice.txt", "Alice in Wonderland", "Lewis Carroll"),
    ("shakespeare-hamlet.txt", "Hamlet", "Shakespeare"),
    ("shakespeare-macbeth.txt", "Macbeth", "Shakespeare"),
    ("austen-sense.txt", "Sense and Sensibility", "Jane Austen"),
    ("austen-emma.txt", "Emma", "Jane Austen"),
    ("bible-kjv.txt", "The King James Bible", "many authors"),
]
PER_BOOK = 220

TITLES = {
    "austen-emma.txt": "Emma", "austen-persuasion.txt": "Persuasion", "austen-sense.txt": "Sense and Sensibility",
    "bible-kjv.txt": "The King James Bible", "blake-poems.txt": "Blake, Poems", "bryant-stories.txt": "Bryant, Stories to Tell Children",
    "burgess-busterbrown.txt": "The Adventures of Buster Bear", "carroll-alice.txt": "Alice in Wonderland",
    "chesterton-ball.txt": "The Ball and the Cross", "chesterton-brown.txt": "The Innocence of Father Brown",
    "chesterton-thursday.txt": "The Man Who Was Thursday", "edgeworth-parents.txt": "Edgeworth, The Parent's Assistant",
    "melville-moby_dick.txt": "Moby-Dick", "milton-paradise.txt": "Paradise Lost", "shakespeare-caesar.txt": "Julius Caesar",
    "shakespeare-hamlet.txt": "Hamlet", "shakespeare-macbeth.txt": "Macbeth", "whitman-leaves.txt": "Leaves of Grass",
}

# Hand-picked queries for the neighbours experiment: (book, a phrase the passage starts near, short label).
QUERIES = [
    ("carroll-alice.txt", "Down, down, down. Would the fall", "Alice falls down the rabbit hole"),
    ("carroll-alice.txt", "'Who are YOU?' said the Caterpillar", "The Caterpillar asks who Alice is"),
    ("carroll-alice.txt", "'Off with her head!' the Queen shouted", "The Queen of Hearts loses her temper"),
    ("shakespeare-hamlet.txt", "To be, or not to be", "Hamlet: to be, or not to be"),
    ("shakespeare-macbeth.txt", "Double, double", "The witches at the cauldron"),
    ("bible-kjv.txt", "In the beginning God created", "Genesis: the creation"),
    ("bible-kjv.txt", "The LORD is my shepherd", "Psalm 23: the Lord is my shepherd"),
    ("austen-emma.txt", "Emma Woodhouse, handsome, clever, and rich", "Emma: the opening"),
    ("austen-sense.txt", "The family of Dashwood", "Sense and Sensibility: the opening"),
    ("whitman-leaves.txt", "I celebrate myself", "Whitman: Song of Myself"),
]
N_RANDOM_QUERIES = 6


# The book's readers do not need Moby-Dick: the passages these figures show come from the other 17 books.
SKIP = "melville-moby_dick.txt"


def shown(D):
    """Mask of windows whose text may appear in a figure."""
    return D["book"] != book_index(D, SKIP)


def r3(a, n=3):
    return np.round(np.asarray(a, dtype=np.float64), n).tolist()


def all_texts(D):
    """Window texts aligned with D["X"] (the same windowing that produced the embeddings)."""
    g = gutenberg()
    out = []
    for fid in D["ids"]:
        out += windows(g.raw(str(fid)).split())
    assert len(out) == len(D["X"]), (len(out), len(D["X"]))
    return out


def book_index(D, fid):
    return list(map(str, D["ids"])).index(fid)


def window_range(D, b):
    idx = np.flatnonzero(D["book"] == b)
    return idx[0], idx[-1] + 1


def find_window(D, fid, phrase):
    """Index (into X) of the window that starts closest before a phrase."""
    g = gutenberg()
    flat = " ".join(g.raw(fid).split())
    at = flat.find(phrase)
    if at >= 0:
        i = len(flat[:at].split())
        lo, _ = window_range(D, book_index(D, fid))
        return int(lo + max(0, round((i - 2) / STRIDE)))  # the window that starts nearest the phrase
    raise ValueError(f"phrase not found in {fid}: {phrase}")


def sentences():
    import yaml

    return yaml.safe_load((HERE / "sentences.yml").read_text())


def hist(v, lo, hi, step):
    edges = np.arange(lo, hi + step / 2, step)
    c, _ = np.histogram(np.clip(v, lo, hi - 1e-9), bins=edges)
    return c.tolist()


# --------------------------------------------------------------------------- the meaning map
@cached("geo_map")
def sec_map(D):
    X, texts = D["X"], all_texts(D)
    rng = np.random.default_rng(1)
    sel, bk = [], []
    for k, (fid, _, _) in enumerate(MAP_BOOKS):
        lo, hi = window_range(D, book_index(D, fid))
        s = np.sort(rng.choice(np.arange(lo + 1, hi), PER_BOOK, replace=False))  # window 0 holds the title line
        sel += s.tolist()
        bk += [k] * PER_BOOK
    sel, bk = np.array(sel), np.array(bk)
    P = X[sel].astype(np.float64)
    mu = P.mean(0)
    Pc = P - mu
    _, S, Vt = np.linalg.svd(Pc, full_matrices=False)
    var = S**2 / (S**2).sum()
    pcs = Pc @ Vt[:6].T
    mhat = mu / np.linalg.norm(mu)
    v1 = Vt[0] - (Vt[0] @ mhat) * mhat
    v1 /= np.linalg.norm(v1)
    along, across = P @ mhat, P @ v1

    G = P @ P.T
    np.fill_diagonal(G, -np.inf)
    nn = np.argsort(-G, axis=1)[:, :10]
    same_book = float((bk[nn] == bk[:, None]).mean())
    # how many of the true 10 nearest are also among the 10 nearest on the flat (2-D) map
    d2 = ((pcs[:, None, :2] - pcs[None, :, :2]) ** 2).sum(-1)
    np.fill_diagonal(d2, np.inf)
    nn2 = np.argsort(d2, axis=1)[:, :10]
    kept2d = float(np.mean([len(set(a) & set(b)) / 10 for a, b in zip(nn, nn2)]))

    lo_of = {k: window_range(D, book_index(D, f))[0] for k, (f, _, _) in enumerate(MAP_BOOKS)}
    pts = [
        dict(b=int(b), w=int(i - lo_of[b]), t=texts[i], p=r3(pcs[n]), m=round(float(along[n]), 3), a=round(float(across[n]), 3),
             nn=nn[n].tolist(), nc=r3(G[n, nn[n]]))
        for n, (i, b) in enumerate(zip(sel, bk))
    ]
    books = [dict(file=f, title=t, author=a, windows=int((D["book"] == book_index(D, f)).sum())) for f, t, a in MAP_BOOKS]
    lab = dict(books=books, points=pts, var=r3(var[:12], 4), mean_norm=round(float(np.linalg.norm(mu)), 3), d=int(X.shape[1]),
               per_book=PER_BOOK, same_book=same_book, kept2d=kept2d)
    return dict(lab=lab, var1=float(var[0]), var2=float(var[1]), var6=float(var[:6].sum()), same_book=same_book, kept2d=kept2d,
                n=int(len(sel)), mean_norm=float(np.linalg.norm(mu)), along_min=float(along.min()), along_mean=float(along.mean()))


# --------------------------------------------------------------------------- nearest passages
@cached("geo_nn")
def sec_nn(D):
    X, book, texts = D["X"], D["book"], all_texts(D)
    ids = list(map(str, D["ids"]))
    rng = np.random.default_rng(2)
    qs = [(find_window(D, f, p), lab, True) for f, p, lab in QUERIES]
    ok = shown(D)
    for i in rng.choice(np.flatnonzero(ok), N_RANDOM_QUERIES, replace=False):
        qs.append((int(i), f"Random passage from {TITLES[ids[book[i]]]}", False))
    stop = set("the and that with have this from they them their there were what when which would will your shall unto said".split())

    def words(s):
        return {w for w in re.findall(r"[a-z]+", s.lower()) if len(w) > 3 and w not in stop}

    lo_hist, hi_hist, step = -0.2, 1.0, 0.02
    out, tenth = [], []
    for i, label, curated in qs:
        c = X @ X[i]
        far = ok.copy()
        far[max(0, i - 1) : i + 2] &= book[max(0, i - 1) : i + 2] != book[i]  # itself and the two windows that share words with it
        cand = np.flatnonzero(far)
        top = cand[np.argsort(-c[cand])[:10]]
        tenth.append(float(c[top[-1]]))
        same = book == book[i]
        wq = words(texts[i])
        out.append(dict(
            label=label, curated=curated, book=TITLES[ids[book[i]]], text=texts[i],
            hist_same=hist(c[far & same], lo_hist, hi_hist, step), hist_other=hist(c[far & ~same], lo_hist, hi_hist, step),
            top=[dict(book=TITLES[ids[book[j]]], same=bool(book[j] == book[i]), cos=round(float(c[j]), 3), text=texts[j],
                      shared=sorted(wq & words(texts[j]))) for j in top],
            n_above={str(t): int((c[far] >= t).sum()) for t in (0.3, 0.4, 0.5, 0.6)},
            median=round(float(np.median(c[far])), 3),
        ))
    lab = dict(queries=out, lo=lo_hist, hi=hi_hist, step=step, n=int(ok.sum()), books=len(ids) - 1)
    return dict(lab=lab, n=int(ok.sum()), n_queries=len(qs), tenth_median=float(np.median(tenth)),
                median_cos=float(np.median([q["median"] for q in out])))


# --------------------------------------------------------------------------- two dials: sentiment and tense
@cached("geo_dials")
def sec_dials(D):
    S = sentences()["dials"]
    sent = [s for group in S for s in group]
    V = embed(sent).astype(np.float64)
    n = len(S)
    sit = np.repeat(np.arange(n), 4)
    good = np.tile([1, 1, -1, -1], n)
    past = np.tile([1, -1, 1, -1], n)
    fit = sit % 2 == 0
    test = ~fit
    centre = V[fit].mean(0)

    def direction(lab):
        v = V[fit & (lab > 0)].mean(0) - V[fit & (lab < 0)].mean(0)
        return v / np.linalg.norm(v)

    ds, dt = direction(good), direction(past)
    rnd = np.random.default_rng(3).normal(size=V.shape[1])
    rnd /= np.linalg.norm(rnd)

    def acc(proj, lab):
        """Threshold halfway between the two class means on the fit half; accuracy on the test half."""
        a, b = proj[fit & (lab > 0)].mean(), proj[fit & (lab < 0)].mean()
        pred = np.where((proj - (a + b) / 2) * np.sign(a - b) > 0, 1, -1)
        return float((pred[test] == lab[test]).mean())

    Vc = V - centre
    coord_acc = {name: [acc(Vc[:, k], lab) if V[:, k].std() > 1e-9 else 0.5 for k in range(V.shape[1])]
                 for name, lab in (("good", good), ("past", past))}
    scale = float(np.abs(V).max() / 127)
    lab = dict(
        sentences=sent, situation=sit.tolist(), good=good.tolist(), past=past.tolist(), fit=fit.tolist(),
        q=np.round(V / scale).astype(int).ravel().tolist(), scale=scale, d=int(V.shape[1]),
        centre=r3(centre, 5), dirs=dict(good=r3(ds, 5), past=r3(dt, 5), random=r3(rnd, 5)),
        acc=dict(good=acc(Vc @ ds, good), past=acc(Vc @ dt, past), random_good=acc(Vc @ rnd, good), random_past=acc(Vc @ rnd, past)),
        coord_acc={k: r3(v) for k, v in coord_acc.items()}, cos_dirs=float(ds @ dt),
    )
    return dict(lab=lab, acc_good=lab["acc"]["good"], acc_past=lab["acc"]["past"], acc_random=lab["acc"]["random_good"],
                best_coord_good=max(coord_acc["good"]), best_coord_past=max(coord_acc["past"]), cos_dirs=float(ds @ dt),
                n_sent=len(sent), n_sit=n)


# --------------------------------------------------------------------------- hot and cold
@cached("geo_pairs")
def sec_pairs(D):
    P = sentences()["pairs"]
    flat = [s for row in P for s in row]
    V = embed(flat).astype(np.float64).reshape(len(P), 5, -1)
    kinds = ["opposite", "negated", "paraphrase", "unrelated"]

    def overlap(a, b):
        wa, wb = set(re.findall(r"[a-z]+", a.lower())), set(re.findall(r"[a-z]+", b.lower()))
        return len(wa & wb) / len(wa | wb)

    rows = []
    for i, row in enumerate(P):
        rows.append(dict(anchor=row[0], partners=[dict(kind=k, text=row[j + 1], cos=round(float(V[i, 0] @ V[i, j + 1]), 3),
                                                       overlap=round(overlap(row[0], row[j + 1]), 3)) for j, k in enumerate(kinds)]))
    mean = {k: float(np.mean([r["partners"][j]["cos"] for r in rows])) for j, k in enumerate(kinds)}
    opp_beats_para = sum(r["partners"][0]["cos"] > r["partners"][2]["cos"] for r in rows)
    neg_beats_para = sum(r["partners"][1]["cos"] > r["partners"][2]["cos"] for r in rows)
    ov = np.array([[p["overlap"], p["cos"]] for r in rows for p in r["partners"]])
    corr = float(np.corrcoef(ov[:, 0], ov[:, 1])[0, 1])
    lab = dict(kinds=kinds, rows=rows, mean=mean, opp_beats_para=opp_beats_para, neg_beats_para=neg_beats_para, corr=corr)
    return dict(lab=lab, n=len(rows), mean_opposite=mean["opposite"], mean_negated=mean["negated"], mean_paraphrase=mean["paraphrase"],
                mean_unrelated=mean["unrelated"], opp_beats_para=opp_beats_para, neg_beats_para=neg_beats_para, overlap_corr=corr)


# --------------------------------------------------------------------------- random pairs, the cone, hubs
@cached("geo_random")
def sec_random(D):
    X, book, texts = D["X"].astype(np.float64), D["book"], all_texts(D)
    ids = list(map(str, D["ids"]))
    rng = np.random.default_rng(4)
    d = X.shape[1]
    mu = X.mean(0)
    Xc = X - mu
    Xcn = Xc / np.linalg.norm(Xc, axis=1, keepdims=True)
    n = 20000
    i, j = rng.integers(0, len(X), 3 * n), rng.integers(0, len(X), 3 * n)
    keep = book[i] != book[j]
    i, j = i[keep][:n], j[keep][:n]
    raw = (X[i] * X[j]).sum(1)
    cen = (Xcn[i] * Xcn[j]).sum(1)
    G = rng.normal(size=(2 * n, d))
    G /= np.linalg.norm(G, axis=1, keepdims=True)
    iso = (G[:n] * G[n:]).sum(1)
    lo, hi, step = -0.3, 1.0, 0.02
    mhat = mu / np.linalg.norm(mu)
    along = X @ mhat

    # hubness: how many other passages' 10-nearest lists each passage appears in
    m = 8000
    s = rng.choice(np.flatnonzero(shown(D)), m, replace=False)

    def k_occ(A):
        Gm = A @ A.T
        np.fill_diagonal(Gm, -np.inf)
        nn = np.argpartition(-Gm, 10, axis=1)[:, :10]
        return np.bincount(nn.ravel(), minlength=len(A))

    occ = dict(raw=k_occ(X[s]), centred=k_occ(Xcn[s]), random=k_occ(G[:m]))

    def skew(v):
        v = v.astype(np.float64)
        return float(((v - v.mean()) ** 3).mean() / v.std() ** 3)

    hubs = {}
    for k in ("raw", "centred"):
        top = np.argsort(-occ[k])[:5]
        hubs[k] = [dict(n=int(occ[k][t]), book=TITLES[ids[book[s[t]]]], text=texts[s[t]]) for t in top]
    cap = 60
    lab = dict(
        lo=lo, hi=hi, step=step, n=n, d=d,
        hist=dict(raw=hist(raw, lo, hi, step), centred=hist(cen, lo, hi, step), random=hist(iso, lo, hi, step)),
        stats={k: dict(mean=float(v.mean()), std=float(v.std())) for k, v in (("raw", raw), ("centred", cen), ("random", iso))},
        mean_norm=float(np.linalg.norm(mu)), along=dict(hist=hist(along, -0.3, 1, 0.02), lo=-0.3, mean=float(along.mean()), min=float(along.min())),
        hub_m=m, hub_cap=cap, occ={k: np.bincount(np.minimum(v, cap), minlength=cap + 1).tolist() for k, v in occ.items()},
        occ_max={k: int(v.max()) for k, v in occ.items()}, occ_zero={k: int((v == 0).sum()) for k, v in occ.items()},
        skew={k: skew(v) for k, v in occ.items()}, hubs=hubs,
    )
    return dict(lab=lab, n=n, raw_mean=float(raw.mean()), raw_std=float(raw.std()), cen_mean=float(cen.mean()), cen_std=float(cen.std()),
                iso_std=float(iso.std()), along_mean=float(along.mean()), along_min=float(along.min()),
                hub_max_raw=int(occ["raw"].max()), hub_max_cen=int(occ["centred"].max()), hub_max_rand=int(occ["random"].max()),
                hub_zero_raw=int((occ["raw"] == 0).sum()), hub_zero_cen=int((occ["centred"] == 0).sum()), hub_m=m,
                skew_raw=lab["skew"]["raw"], skew_cen=lab["skew"]["centred"], skew_rand=lab["skew"]["random"])


# --------------------------------------------------------------------------- spectrum against two baselines
@cached("geo_spectrum")
def sec_spectrum(D):
    X = D["X"].astype(np.float64)
    rng = np.random.default_rng(5)
    d = X.shape[1]
    mu = X.mean(0)
    Xc = X - mu
    _, S, Vt = np.linalg.svd(Xc, full_matrices=False)

    def share(s):
        e = s**2
        return e / e.sum()

    ev = share(S)
    Sh = np.column_stack([rng.permutation(Xc[:, k]) for k in range(d)])  # same coordinates, pairings broken
    ev_sh = share(np.linalg.svd(Sh, compute_uv=False))
    G = rng.normal(size=X.shape)
    ev_iso = share(np.linalg.svd(G - G.mean(0), compute_uv=False))

    def pr(e):
        return float(1 / (e**2).sum())

    # do the 10 nearest neighbours survive keeping only k directions?
    q = rng.choice(len(X), 1000, replace=False)
    rest = np.setdiff1d(np.arange(len(X)), q)
    db = rng.choice(rest, 20000, replace=False)
    Q, B = Xc[q], Xc[db]

    def top10(A, Bm):
        d2 = (Bm**2).sum(1)[None, :] - 2 * A @ Bm.T
        return np.argpartition(d2, 10, axis=1)[:, :10]

    true = top10(Q, B)
    ks = [1, 2, 4, 8, 16, 32, 48, 64, 96, 128, 192, 256, 384]
    perm = rng.permutation(d)
    rec = dict(pca=[], coords=[])
    for k in ks:
        P = Vt[:k].T
        for name, (A, Bm) in (("pca", (Q @ P, B @ P)), ("coords", (Q[:, perm[:k]], B[:, perm[:k]]))):
            got = top10(A, Bm)
            rec[name].append(float(np.mean([len(set(a) & set(b)) / 10 for a, b in zip(true, got)])))
    lab = dict(d=d, n=int(len(X)), ev=r3(ev, 6), ev_shuffled=r3(ev_sh, 6), ev_random=r3(ev_iso, 6),
               pr=dict(real=pr(ev), shuffled=pr(ev_sh), random=pr(ev_iso)), ks=ks, recall=rec, n_q=1000, n_db=20000)
    return dict(lab=lab, pr_real=pr(ev), pr_shuffled=pr(ev_sh), pr_random=pr(ev_iso),
                rec_pca={str(k): v for k, v in zip(ks, rec["pca"])}, rec_coords={str(k): v for k, v in zip(ks, rec["coords"])},
                sh_top8=float(ev_sh[:8].sum()), iso_top8=float(ev_iso[:8].sum()))


# --------------------------------------------------------------------------- a walk through Alice
ALICE = "carroll-alice.txt"


def alice_slice(D, n_chapters=3):
    """Window indices (into X) covering the first chapters of Alice, and the chapter starts within the slice."""
    g = gutenberg()
    words = g.raw(ALICE).split()
    starts, names = [], []
    raw = g.raw(ALICE)
    for m in re.finditer(r"CHAPTER ([IVX]+)\. (.+)", raw):
        starts.append(len(raw[: m.start()].split()))
        names.append(m.group(2).strip())
    lo, _ = window_range(D, book_index(D, ALICE))
    a, b = starts[0] // STRIDE, starts[n_chapters] // STRIDE
    chapters = [[(s // STRIDE) - a, nm] for s, nm in zip(starts[:n_chapters], names[:n_chapters])]
    return np.arange(lo + a, lo + b), chapters, words


@cached("geo_walk")
def sec_walk(D):
    X, book, texts = D["X"].astype(np.float64), D["book"], all_texts(D)
    idx, chapters, _ = alice_slice(D)
    W = X[idx]
    sim = np.round(W @ W.T * 100).astype(int)
    Wc = W - W.mean(0)
    _, S, Vt = np.linalg.svd(Wc, full_matrices=False)
    var = S**2 / (S**2).sum()
    traj = Wc @ Vt[:2].T
    b = book_index(D, ALICE)
    lo, hi = window_range(D, b)
    A = X[lo:hi]

    def lag_curve(M, L):
        return float((M[L:] * M[:-L]).sum(1).mean())

    lags = list(range(1, 65))
    alice_lag = [lag_curve(A, L) for L in lags]
    corpus_lag = []
    for L in lags:
        m = np.zeros(len(X), bool)
        m[L:] = book[L:] == book[:-L]
        corpus_lag.append(float((X[L:] * X[:-L]).sum(1)[m[L:]].mean()))
    rng = np.random.default_rng(6)
    i, j = rng.integers(lo, hi, 20000), rng.integers(lo, hi, 20000)
    alice_rand = float((A[i - lo] * A[j - lo]).sum(1).mean())
    # chapters as blocks: average cosine of passages at least 8 apart (no shared words, past the steepest fall), same vs different chapter
    ch = np.zeros(len(idx), int)
    for k, (start, _) in enumerate(chapters):
        ch[start:] = k
    a, b = np.triu_indices(len(idx), 8)
    G = W @ W.T
    within, across = float(G[a, b][ch[a] == ch[b]].mean()), float(G[a, b][ch[a] != ch[b]].mean())
    lab = dict(within=within, across=across, sim=sim.tolist(), traj=r3(traj, 4), var=r3(var[:2], 4), texts=[texts[k] for k in idx], chapters=chapters,
               lags=lags, alice_lag=r3(alice_lag), corpus_lag=r3(corpus_lag), alice_rand=alice_rand, n_alice=int(hi - lo),
               window=WINDOW, stride=STRIDE)
    return dict(lab=lab, n=int(len(idx)), lag1=alice_lag[0], lag2=alice_lag[1], lag8=alice_lag[7], lag64=alice_lag[63],
                rand=alice_rand, var2=float(var[:2].sum()), within=within, across=across)


SECTIONS = (("geo_map", sec_map), ("geo_nn", sec_nn), ("geo_dials", sec_dials), ("geo_pairs", sec_pairs),
            ("geo_random", sec_random), ("geo_spectrum", sec_spectrum), ("geo_walk", sec_walk))
