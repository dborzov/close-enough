# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy", "scipy", "torch", "sentence-transformers", "faiss-cpu", "nltk",
#   "zstandard", "constriction",
# ]
# ///
"""Every number and chart in the book comes from this script.

    uv run experiments/run.py            # run what is not cached yet
    uv run experiments/run.py lossy lsh  # force-rerun named sections

Output: data/results.json (read by build.py and by the page widgets).
"""
from __future__ import annotations

import json
import sys
import time

import numpy as np
from scipy.special import erf

from common import OUT, cached, load_data, log, same_book_pairs, splits

RNG = np.random.default_rng(0)
K = 256


# --------------------------------------------------------------------------- helpers
def relmse(X, Xh, mu):
    return float(((X - Xh) ** 2).sum() / ((X - mu) ** 2).sum())


def recall_at(Q, Xdb, Xh, k=10):
    """10-recall@10: exact top-k by inner product vs top-k against the reconstruction."""
    true = np.argsort(-(Q @ Xdb.T), axis=1)[:, :k]
    got = np.argsort(-(Q @ Xh.T), axis=1)[:, :k]
    return float(np.mean([len(set(a) & set(b)) / k for a, b in zip(true, got)]))


def books_of(rq):
    import faiss

    return faiss.vector_to_array(rq.codebooks).reshape(rq.M, K, rq.d).copy()


def rq_decode(codes, books, m=None):
    m = codes.shape[1] if m is None else m
    out = np.zeros((codes.shape[0], books.shape[2]), dtype=np.float32)
    for j in range(m):
        out += books[j][codes[:, j]]
    return out


def timed_us(fn, X, n=2000):
    import faiss

    faiss.omp_set_num_threads(1)
    x = np.ascontiguousarray(X[:n])
    fn(x[:50])
    t = time.perf_counter()
    fn(x)
    dt = (time.perf_counter() - t) / len(x) * 1e6
    faiss.omp_set_num_threads(16)
    return float(dt)


def train_rq(Xtr, M, beam=1):
    import faiss

    rq = faiss.ResidualQuantizer(Xtr.shape[1], M, 8)
    rq.train_type = faiss.ResidualQuantizer.Train_default
    rq.max_beam_size = beam
    rq.train(np.ascontiguousarray(Xtr))
    return rq


def rq_codes(rq, X, beam=None):
    if beam is not None:
        rq.max_beam_size = beam
    return rq.compute_codes(np.ascontiguousarray(X)).astype(np.int64)


# --------------------------------------------------------------------------- A. properties
@cached("props")
def sec_props(D):
    X, book = D["X"], D["book"]
    mu = X.mean(0)
    Xc = X - mu
    ev = np.linalg.svd(Xc, compute_uv=False) ** 2
    ev /= ev.sum()
    same = same_book_pairs(book)
    lag = {}
    for L in (1, 2, 4, 8, 16, 64, 256):
        m = np.zeros(len(X), bool)
        m[L:] = book[L:] == book[:-L]
        lag[L] = float((X[L:] * X[:-L]).sum(1)[m[L:]].mean())
    i, j = RNG.integers(0, len(X), 20000), RNG.integers(0, len(X), 20000)
    rc = (X[i] * X[j]).sum(1)
    rcc = (Xc[i] * Xc[j]).sum(1) / (np.linalg.norm(Xc[i], axis=1) * np.linalg.norm(Xc[j], axis=1))
    alpha = float((Xc[1:] * Xc[:-1]).sum(1)[same[1:]].sum() / (Xc[:-1] ** 2).sum(1)[same[1:]].sum())
    demo = D["demo"]
    sim = np.round(demo @ demo.T * 100).astype(int)
    dc = demo - demo.mean(0)
    U, S, Vt = np.linalg.svd(dc, full_matrices=False)
    traj = (dc @ Vt[:2].T).round(4)
    return dict(
        d=int(X.shape[1]),
        n=int(len(X)),
        spectrum=ev.tolist(),
        cumvar={str(k): float(ev[:k].sum()) for k in (8, 16, 32, 64, 128, 256)},
        participation_ratio=float(1 / (ev**2).sum()),
        lag_cos={str(k): v for k, v in lag.items()},
        mean_norm=float(np.linalg.norm(mu)),
        rand_cos_mean=float(rc.mean()),
        rand_cos_std=float(rc.std()),
        rand_cos_centred_std=float(rcc.std()),
        alpha=alpha,
        max_abs=float(np.abs(X).max()),
        coord_std=float(X.std()),
        coord_kurtosis=float(((Xc[:, Xc.std(0) > 1e-9] / Xc.std(0)[Xc.std(0) > 1e-9]) ** 4).mean() - 3),
        dead_dims=int((Xc.std(0) < 1e-9).sum()),
        rank=int((ev > 1e-10).sum()),
        moby=dict(
            sim=sim.tolist(),
            traj=traj.tolist(),
            snip=[str(s)[:240] for s in D["demo_texts"]],
            chapters=json.loads(str(D["chapters"])),
        ),
        seqbars=demo[:12, :24].round(4).tolist(),
    )


# --------------------------------------------------------------------------- C. lossy @ 64 bits
@cached("lossy")
def sec_lossy(D):
    import faiss

    X = D["X"]
    tr, db, qm = splits(D)
    mu = X[tr].mean(0)
    Xtr, Xdb = X[tr] - mu, X[db] - mu
    Q = X[qm][RNG.choice(qm.sum(), 500, replace=False)]
    Qc = Q - mu
    Xdb_raw = X[db]
    d = X.shape[1]
    zero = np.zeros(d, np.float32)
    rows = []

    def add(name, kind, Xh, enc_us, bits=64, note=""):
        rows.append(
            dict(name=name, kind=kind, relmse=relmse(Xdb, Xh, zero), enc_us=enc_us,
                 recall=recall_at(Q, Xdb_raw, Xh + mu), bits=bits, note=note)
        )
        log("   ", rows[-1]["name"], f"{rows[-1]['relmse']:.4f}", f"{rows[-1]['recall']:.3f}", f"{enc_us:.1f}us")

    # PCA -> 8 dims + int8
    U = np.linalg.svd(Xtr, full_matrices=False)[2][:8]
    sc = np.abs(Xtr @ U.T).max(0) / 127

    def pca8(x):
        return np.clip(np.round((x @ U.T) / sc), -127, 127)

    add("PCA→8 dims + int8", "scalar", (pca8(Xdb) * sc) @ U, timed_us(pca8, Xdb))

    pq = faiss.ProductQuantizer(d, 8, 8)
    pq.train(Xtr)
    add("PQ 8×8", "pq", pq.decode(pq.compute_codes(Xdb)), timed_us(pq.compute_codes, Xdb))

    opq = faiss.OPQMatrix(d, 8)
    opq.train(Xtr)
    pq2 = faiss.ProductQuantizer(d, 8, 8)
    pq2.train(opq.apply(Xtr))
    enc = lambda x: pq2.compute_codes(opq.apply(x))
    add("OPQ 8×8", "pq", opq.reverse_transform(pq2.decode(enc(Xdb))), timed_us(enc, Xdb))

    rq = train_rq(Xtr, 8, beam=1)
    Bk = books_of(rq)
    c_g = rq_codes(rq, Xdb, 1)
    Xh_g = rq_decode(c_g, Bk)
    add("RQ greedy", "add", Xh_g, timed_us(lambda x: rq_codes(rq, x, 1), Xdb))
    for B in (4, 16):
        rqb = train_rq(Xtr, 8, beam=B)
        add(f"RQ beam {B}", "add", rq_decode(rq_codes(rqb, Xdb, B), books_of(rqb)),
            timed_us(lambda x: rq_codes(rqb, x, B), Xdb, n=500))

    try:
        lsq = faiss.LocalSearchQuantizer(d, 8, 8)
        lsq.train_iters = 10
        lsq.encode_ils_iters = 8
        lsq.train(Xtr)
        tr_err = relmse(Xtr[:20000], lsq.decode(lsq.compute_codes(Xtr[:20000])), zero)
        add("LSQ (ICM + restarts)", "add", lsq.decode(lsq.compute_codes(Xdb)),
            timed_us(lsq.compute_codes, Xdb, n=500), note=f"train error {tr_err:.3f}")
    except Exception as e:  # noqa: BLE001
        log("LSQ failed", e)

    # ---- predictive RQ (closed loop), with and without mode decision
    book_db = D["book"][db]
    Xh_tr = rq_decode(rq_codes(rq, Xtr, 1), Bk)
    same_tr = same_book_pairs(D["book"][tr])
    alpha = float((Xtr[1:] * Xh_tr[:-1]).sum(1)[same_tr[1:]].sum() / (Xh_tr[:-1] ** 2).sum(1)[same_tr[1:]].sum())
    E = (Xtr[1:] - alpha * Xh_tr[:-1])[same_tr[1:]]
    rqe = train_rq(E, 8, beam=1)
    Be = books_of(rqe)

    def run_pred(mode_decision, key=64):
        out = np.zeros_like(Xdb)
        used, prev, t0 = 0, None, 0
        for t in range(len(Xdb)):
            if t == 0 or book_db[t] != book_db[t - 1]:
                t0 = t
            x = Xdb[t]
            if (t - t0) % key == 0:
                xh = Xh_g[t]
            else:
                pred = alpha * prev
                ce = rq_codes(rqe, (x - pred)[None], 1)
                xi = pred + rq_decode(ce, Be)[0]
                if mode_decision and ((x - Xh_g[t]) ** 2).sum() <= ((x - xi) ** 2).sum():
                    xh = Xh_g[t]
                else:
                    xh, used = xi, used + 1
            out[t] = prev = xh
        return out, used / len(Xdb)

    base_us = rows[3]["enc_us"]
    Xa, _ = run_pred(False)
    add("Predictive RQ (always predict)", "seq", Xa, base_us * 2, note="closed loop, keyframe every 64")
    Xm, frac = run_pred(True)
    add("Predictive RQ + mode decision", "seq", Xm, base_us * 2, bits=65,
        note=f"{frac * 100:.0f}% of windows use prediction")
    return dict(rows=rows, alpha_closed=alpha, pred_frac=frac, n_db=int(db.sum()), n_train=int(tr.sum()), n_q=500)


# --------------------------------------------------------------------------- C2. rate sweep
def lloyd_1d(x, levels, iters=12):
    """Lloyd-Max scalar quantizer for one coordinate. Returns sorted reproduction levels."""
    if levels >= 32:  # start from an evenly spaced grid: equal-probability cells are a poor start at high resolution
        m, sd = x.mean(), x.std()
        c = m + sd * np.linspace(-3.6, 3.6, levels)
        iters = 30
    else:
        c = np.quantile(x, (np.arange(levels) + 0.5) / levels)
    for _ in range(iters):
        edges = (c[1:] + c[:-1]) / 2
        idx = np.searchsorted(edges, x)
        s = np.bincount(idx, weights=x, minlength=levels)
        n = np.bincount(idx, minlength=levels)
        c = np.where(n > 0, s / np.maximum(n, 1), c)
        c.sort()
    return c


def sq_apply(x, c):
    return c[np.searchsorted((c[1:] + c[:-1]) / 2, x)]


def waterfill_bits(lam, total):
    """Greedy integer bit allocation: give the next bit to the direction with the largest remaining error."""
    b = np.zeros(len(lam), int)
    err = lam.copy()
    for _ in range(total):
        i = int(np.argmax(err))
        b[i] += 1
        err[i] /= 4
    return b


@cached("sweep")
def sec_sweep(D):
    import faiss

    X = D["X"]
    tr, db, qm = splits(D)
    mu = X[tr].mean(0)
    Xtr, Xdb = X[tr] - mu, X[db] - mu
    Q = X[qm][RNG.choice(qm.sum(), 500, replace=False)]
    Xdb_raw = X[db]
    d = X.shape[1]
    zero = np.zeros(d, np.float32)
    out = []

    def add(fam, bits, Xh, **kw):
        out.append(dict(fam=fam, bits=int(bits), relmse=relmse(Xdb, Xh, zero), recall=recall_at(Q, Xdb_raw, Xh + mu), **kw))
        log("   ", fam, bits, f"{out[-1]['relmse']:.4f}", f"{out[-1]['recall']:.3f}")

    # scalar, raw basis: b bits for every coordinate
    for b in (1, 2, 3, 4, 6, 8):
        Xh = np.empty_like(Xdb)
        for j in range(d):
            Xh[:, j] = sq_apply(Xdb[:, j], lloyd_1d(Xtr[:, j], 2**b))
        add("scalar", d * b, Xh, bpd=b)
    # PCA + water-filled scalar
    U, S, Vt = np.linalg.svd(Xtr, full_matrices=False)
    lam = S**2 / len(Xtr)
    Ptr, Pdb = Xtr @ Vt.T, Xdb @ Vt.T
    alloc = {}
    for bits in (32, 64, 128, 256, 512, 768, 1536):
        b = waterfill_bits(lam.copy(), bits)
        Ph = np.zeros_like(Pdb)
        for j in np.nonzero(b)[0]:
            Ph[:, j] = sq_apply(Pdb[:, j], lloyd_1d(Ptr[:, j], 2 ** int(b[j])))
        add("pca_sq", bits, Ph @ Vt, dims_used=int((b > 0).sum()), max_bits=int(b.max()))
        alloc[str(bits)] = b[:64].tolist()
    for bits in (32, 64, 128, 256, 512):
        M = bits // 8
        pq = faiss.ProductQuantizer(d, M, 8)
        pq.train(Xtr)
        add("pq", bits, pq.decode(pq.compute_codes(Xdb)))
        opq = faiss.OPQMatrix(d, M)
        opq.train(Xtr)
        pq2 = faiss.ProductQuantizer(d, M, 8)
        pq2.train(opq.apply(Xtr))
        add("opq", bits, opq.reverse_transform(pq2.decode(pq2.compute_codes(opq.apply(Xdb)))))
    rq = train_rq(Xtr, 64, beam=1)
    Bk = books_of(rq)
    c = rq_codes(rq, Xdb, 1)
    for bits in (32, 64, 128, 256, 512):
        add("rq", bits, rq_decode(c, Bk, bits // 8))
    # Gaussian rate-distortion bound (reverse water-filling) from the spectrum
    bound = []
    for theta in np.geomspace(lam.max(), lam.min() * 1e-3, 80):
        Dm = np.minimum(lam, theta).sum()
        R = 0.5 * np.log2(np.maximum(lam / theta, 1)).sum()
        bound.append([float(R), float(Dm / lam.sum())])
    return dict(points=out, bound=bound, alloc=alloc, lam=(lam / lam.sum()).tolist())


# --------------------------------------------------------------------------- D. entropy of codes
@cached("code_entropy")
def sec_code_entropy(D):
    X = D["X"]
    tr, db, _ = splits(D)
    mu = X[tr].mean(0)
    rq = train_rq(X[tr] - mu, 8, 1)
    ctr, cdb = rq_codes(rq, X[tr] - mu, 1), rq_codes(rq, X[db] - mu, 1)
    s_tr, s_db = same_book_pairs(D["book"][tr]), same_book_pairs(D["book"][db])
    out = []
    for m in range(8):
        p = np.bincount(ctr[:, m], minlength=K) + 0.5
        p /= p.sum()
        marg = float(-np.log2(p[cdb[:, m]]).mean())
        # conditional on the previous window's index, interpolated with the marginal
        T = np.zeros((K, K))
        np.add.at(T, (ctr[:-1, m][s_tr[1:]], ctr[1:, m][s_tr[1:]]), 1)
        best = marg
        for lamb in (0.3, 0.5, 0.7, 0.85):
            Pc = lamb * T / np.maximum(T.sum(1, keepdims=True), 1) + (1 - lamb) * p
            v = -np.log2(Pc[cdb[:-1, m][s_db[1:]], cdb[1:, m][s_db[1:]]]).mean()
            best = min(best, float(v))
        rep = float((cdb[1:, m] == cdb[:-1, m])[s_db[1:]].mean())
        out.append(dict(stage=m + 1, marg=marg, cond=best, repeat=rep))
    return out


# --------------------------------------------------------------------------- E. lossless, integer targets
SQ2 = np.sqrt(2.0)


def gauss_bits(R, mu, sd):
    """Ideal code length (bits, per column summed over rows / n) of integers R under a discretised Gaussian."""
    sd = np.maximum(sd, 0.05)
    hi = 0.5 * (1 + erf((R + 0.5 - mu) / (sd * SQ2)))
    lo = 0.5 * (1 + erf((R - 0.5 - mu) / (sd * SQ2)))
    return -np.log2(np.maximum(hi - lo, 1e-9) * (1 - 1e-6) + 1e-12)


def lap_cdf(x, mu, b):
    z = (x - mu) / b
    return np.where(z < 0, 0.5 * np.exp(np.minimum(z, 0)), 1 - 0.5 * np.exp(-np.maximum(z, 0)))


def laplace_bits(R, mu, b):
    b = np.maximum(b, 0.05)
    p = lap_cdf(R + 0.5, mu, b) - lap_cdf(R - 0.5, mu, b)
    return -np.log2(np.maximum(p, 1e-9) * (1 - 1e-6) + 1e-12)


def model_bits(Rtr, Rte, kind="best"):
    """Per-dimension parametric model fitted on training residuals; returns bits per vector on the test set."""
    mu, sd = Rtr.mean(0), Rtr.std(0)
    med = np.median(Rtr, axis=0)
    bb = np.abs(Rtr - med).mean(0)
    g = gauss_bits(Rte, mu, sd).mean(0)
    l = laplace_bits(Rte, med, bb).mean(0)
    if kind == "gauss":
        return float(g.sum())
    if kind == "laplace":
        return float(l.sum())
    gt = gauss_bits(Rtr[:20000], mu, sd).mean(0)
    lt = laplace_bits(Rtr[:20000], med, bb).mean(0)
    return float(np.where(gt <= lt, g, l).sum())


def hist_bits(Rtr, Rte, lo=-256, hi=256):
    """Per-dimension empirical histogram model (add-half smoothing)."""
    tot = 0.0
    n = hi - lo + 1
    for j in range(Rtr.shape[1]):
        h = np.bincount(np.clip(Rtr[:, j], lo, hi) - lo, minlength=n) + 0.5
        p = h / h.sum()
        tot += -np.log2(p[np.clip(Rte[:, j], lo, hi) - lo]).mean()
    return float(tot)


def temporal(R, same, beta):
    """Residual of residual: r_t - round(beta * r_{t-1}) inside a book; first window of a book kept as is."""
    out = R.copy()
    pred = np.round(beta * R[:-1]).astype(np.int64)
    out[1:][same[1:]] -= pred[same[1:]]
    return out


def fit_beta(R, same):
    a, b = R[1:][same[1:]].astype(np.float64), R[:-1][same[1:]].astype(np.float64)
    return float((a * b).sum() / (b * b).sum())


@cached("lossless")
def sec_lossless(D):
    X = D["X"].astype(np.float64)
    tr, db, _ = splits(D)
    mu = X[tr].mean(0)
    s_tr, s_db = same_book_pairs(D["book"][tr]), same_book_pairs(D["book"][db])
    d = X.shape[1]
    rq = train_rq((X[tr] - mu).astype(np.float32), 24, 1)
    Bk = books_of(rq).astype(np.float64)
    ctr, cdb = rq_codes(rq, (X[tr] - mu).astype(np.float32), 1), rq_codes(rq, (X[db] - mu).astype(np.float32), 1)
    res = {}
    hist = {}
    for name, step, raw_bits in (("int8", float(np.abs(X).max() / 127), 8), ("fixed16", 2.0**-15, 16)):
        Itr, Idb = np.round(X[tr] / step).astype(np.int64), np.round(X[db] / step).astype(np.int64)
        mui = np.round(mu / step).astype(np.int64)
        R0tr, R0db = Itr - mui, Idb - mui
        ent = model_bits(R0tr, R0db)
        b0 = fit_beta(R0tr, s_tr)
        prev = model_bits(temporal(R0tr, s_tr, b0), temporal(R0db, s_db, b0))
        sweep = []
        htr, hdb = np.zeros_like(X[tr]), np.zeros_like(X[db])
        for m in range(25):
            if m > 0:
                htr += Bk[m - 1][ctr[:, m - 1]]
                hdb += Bk[m - 1][cdb[:, m - 1]]
            Rtr = Itr - np.round((htr + mu) / step).astype(np.int64)
            Rdb = Idb - np.round((hdb + mu) / step).astype(np.int64)
            rb = model_bits(Rtr, Rdb)
            beta = fit_beta(Rtr, s_tr)
            rbt = model_bits(temporal(Rtr, s_tr, beta), temporal(Rdb, s_db, beta))
            sweep.append(dict(m=m, code_bits=8 * m, resid_bits=rb, total=8 * m + rb, beta=beta,
                              resid_bits_temporal=rbt, total_temporal=8 * m + rbt,
                              relmse=float(((X[db] - mu - hdb) ** 2).sum() / ((X[db] - mu) ** 2).sum()),
                              resid_std=float(Rdb.std())))
            if name == "int8" and m in (0, 8):
                hist[f"rq{m}"] = np.bincount(np.clip(Rdb.ravel(), -40, 40) + 40, minlength=81).tolist()
                hist[f"rq{m}_std"] = float(Rdb.std())
                Rt = temporal(Rdb, s_db, beta)
                hist[f"rq{m}t"] = np.bincount(np.clip(Rt.ravel(), -40, 40) + 40, minlength=81).tolist()
                hist[f"rq{m}t_std"] = float(Rt.std())
        res[name] = {"step": step, "raw_bits": raw_bits, "entropy only": ent, "previous window": prev,
                     "beta0": b0, "sweep": sweep}
        if name == "int8":
            # ---- what the residual model costs: the same residuals under different PDF models (m = 0 and m = 8)
            models = {}
            for m in (0, 8):
                htr = sum(Bk[j][ctr[:, j]] for j in range(m)) if m else 0
                hdb = sum(Bk[j][cdb[:, j]] for j in range(m)) if m else 0
                Rtr = Itr - np.round((htr + mu) / step).astype(np.int64)
                Rdb = Idb - np.round((hdb + mu) / step).astype(np.int64)
                g1 = float(gauss_bits(Rdb, Rtr.mean(), Rtr.std()).mean() * d)
                models[str(m)] = dict(
                    flat=8.0 * d, one_gauss=g1, gauss=model_bits(Rtr, Rdb, "gauss"),
                    laplace=model_bits(Rtr, Rdb, "laplace"), hist=hist_bits(Rtr, Rdb),
                )
            res["models"] = models
            # one coordinate's raw histogram (in int8 units), for the PDF page
            j = int(np.argsort(R0db.std(0))[d // 2])
            hist["dim"] = j
            hist["raw_dim"] = np.bincount(np.clip(Idb[:, j], -127, 127) + 127, minlength=255).tolist()
            hist["raw_all"] = np.bincount(np.clip(Idb.ravel(), -127, 127) + 127, minlength=255).tolist()
            hist["raw_dim_mu"], hist["raw_dim_sd"] = float(Itr[:, j].mean()), float(Itr[:, j].std())
            hist["raw_all_sd"] = float(Idb.std())
            hist["std_per_dim"] = np.sort(R0db.std(0))[::-1].round(3).tolist()
            # ---- the ideal linear-Gaussian coder: cross-entropy under N(mu, Sigma) fitted on train
            C = np.cov((Itr - Itr.mean(0)).T) + np.eye(d) / 12
            Lc = np.linalg.cholesky(C)
            z = np.linalg.solve(Lc, (Idb - Itr.mean(0)).T)
            nll = 0.5 * (z**2).sum(0) + np.log(np.diag(Lc)).sum() + 0.5 * d * np.log(2 * np.pi)
            res["mvn_bits"] = float(nll.mean() / np.log(2))
            ev = np.linalg.eigvalsh(C)
            res["indep_gauss_bits"] = float(0.5 * np.log2(2 * np.pi * np.e * np.diag(C)).sum())
            res["coding_gain_bits"] = float(0.5 * (np.log2(np.diag(C)).sum() - np.log2(ev).sum()))
            # ---- PCA side information with one step size s (entropy-coded uniform scalar quantizer)
            U = np.linalg.svd(Itr - Itr.mean(0), full_matrices=False)[2]
            m0 = Itr.mean(0)
            Ptr, Pdb = (Itr - m0) @ U.T, (Idb - m0) @ U.T
            pca = []
            for s in (64, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1.5, 1):
                qtr, qdb = np.round(Ptr / s).astype(np.int64), np.round(Pdb / s).astype(np.int64)
                side = model_bits(qtr, qdb)
                Rtr = Itr - np.round(m0 + (qtr * s) @ U).astype(np.int64)
                Rdb = Idb - np.round(m0 + (qdb * s) @ U).astype(np.int64)
                rb = model_bits(Rtr, Rdb)
                pca.append(dict(s=s, side_bits=side, resid_bits=rb, total=side + rb,
                                dims_nonzero=int((np.abs(qdb).mean(0) > 0.02).sum())))
            res["pca_side"] = pca
            # ---- near-lossless: quantise the RQ-8 residual with step 2*eps+1
            htr = sum(Bk[j][ctr[:, j]] for j in range(8))
            hdb = sum(Bk[j][cdb[:, j]] for j in range(8))
            Rtr = Itr - np.round((htr + mu) / step).astype(np.int64)
            Rdb = Idb - np.round((hdb + mu) / step).astype(np.int64)
            near = []
            for eps in (0, 1, 2, 3, 5, 8):
                w = 2 * eps + 1
                near.append(dict(eps=eps, bits=64 + model_bits(np.round(Rtr / w).astype(np.int64), np.round(Rdb / w).astype(np.int64)),
                                 max_err=eps, rmse_int=float(np.sqrt(((Rdb - np.round(Rdb / w) * w) ** 2).mean()))))
            res["near"] = near
            # ---- a real range coder (constriction) on the RQ-8 + temporal residual, to check "ideal" is honest
            try:
                import constriction

                beta = fit_beta(Rtr, s_tr)
                Ttr, Tdb = temporal(Rtr, s_tr, beta), temporal(Rdb, s_db, beta)
                mus, sds = Ttr.mean(0), np.maximum(Ttr.std(0), 0.3)
                fam = constriction.stream.model.QuantizedGaussian(-200, 200)
                n = 4000
                sym = np.clip(Tdb[:n], -200, 200).astype(np.int32)
                t = time.perf_counter()
                coder = constriction.stream.queue.RangeEncoder()
                for i in range(n):
                    coder.encode(sym[i], fam, mus, sds)
                comp = coder.get_compressed()
                t_enc = (time.perf_counter() - t) / n * 1e6
                t = time.perf_counter()
                dec = constriction.stream.queue.RangeDecoder(comp)
                back = np.stack([dec.decode(fam, mus, sds) for _ in range(n)])
                t_dec = (time.perf_counter() - t) / n * 1e6
                res["real_coder"] = dict(
                    bits=float(len(comp) * 32 / n) + 64, ideal=float(gauss_bits(sym, mus, sds).sum() / n) + 64,
                    exact=bool((back == sym).all()), enc_us=t_enc, dec_us=t_dec, n=n)
            except Exception as e:  # noqa: BLE001
                log("constriction failed:", repr(e))
    res["hist"] = hist
    return res



# --------------------------------------------------------------------------- E2. the lossless ladder
def chol_fit(Rtr):
    m = Rtr.mean(0)
    C = np.cov((Rtr - m).T) + np.eye(Rtr.shape[1]) / 12
    return m, np.linalg.cholesky(C)


def chol_bits(model, R):
    """Each coordinate predicted from the coordinates before it (a triangular, hence lossless, decorrelator).
    With C = L L^T the prediction error of coordinate j is L_jj * z_j and its conditional std is L_jj."""
    from scipy.linalg import solve_triangular

    m, Lc = model
    Z = solve_triangular(Lc, (R - m).T, lower=True).T
    dg = np.diag(Lc)
    return float(gauss_bits(Z * dg, 0.0, dg).mean(0).sum())


@cached("ladder")
def sec_ladder(D):
    from scipy.linalg import solve_triangular

    X = D["X"].astype(np.float64)
    tr, db, qm = splits(D)
    live = X[tr].std(0) > 1e-9
    mu = X[tr].mean(0)
    step = float(np.abs(X).max() / 127)
    s_tr, s_db = same_book_pairs(D["book"][tr]), same_book_pairs(D["book"][db])
    Itr, Idb = np.round(X[tr] / step).astype(np.int64), np.round(X[db] / step).astype(np.int64)
    mui = np.round(mu / step).astype(np.int64)
    d = X.shape[1]
    R0tr, R0db = (Itr - mui)[:, live], (Idb - mui)[:, live]
    dead_bits = 0.0  # constant coordinates cost nothing once the decoder knows the constant
    out = {"flat": 8.0 * d, "dead": int((~live).sum())}
    out["marginal"] = model_bits(R0tr, R0db)
    b0 = fit_beta(R0tr, s_tr)
    Ttr, Tdb = temporal(R0tr, s_tr, b0), temporal(R0db, s_db, b0)
    out["temporal"] = model_bits(Ttr, Tdb)
    out["chol"] = chol_bits(chol_fit(R0tr), R0db)
    out["temporal_chol"] = chol_bits(chol_fit(Ttr[s_tr]), Tdb[s_db]) * s_db.mean() + chol_bits(chol_fit(R0tr), R0db[~s_db]) * (~s_db).mean()
    # full linear prediction from the previous window (a d x d matrix), then the triangular decorrelator
    P, Y = R0tr[:-1][s_tr[1:]].astype(np.float64), R0tr[1:][s_tr[1:]].astype(np.float64)
    A = np.linalg.solve(P.T @ P + 50.0 * len(P) * np.eye(P.shape[1]) / 100, P.T @ Y)
    Vtr = R0tr.copy(); Vtr[1:][s_tr[1:]] -= np.round(P @ A).astype(np.int64)
    Vdb = R0db.copy(); Vdb[1:][s_db[1:]] -= np.round(R0db[:-1][s_db[1:]] @ A).astype(np.int64)
    out["var"] = model_bits(Vtr[s_tr], Vdb[s_db]) * s_db.mean() + model_bits(R0tr, R0db[~s_db]) * (~s_db).mean()
    out["var_chol"] = chol_bits(chol_fit(Vtr[s_tr]), Vdb[s_db]) * s_db.mean() + chol_bits(chol_fit(R0tr), R0db[~s_db]) * (~s_db).mean()
    # RQ-8 side information first
    rq = train_rq((X[tr] - mu).astype(np.float32), 8, 1)
    Bk = books_of(rq).astype(np.float64)
    ctr, cdb = rq_codes(rq, (X[tr] - mu).astype(np.float32), 1), rq_codes(rq, (X[db] - mu).astype(np.float32), 1)
    Qtr = (Itr - np.round((rq_decode(ctr, Bk) + mu) / step).astype(np.int64))[:, live]
    Qdb = (Idb - np.round((rq_decode(cdb, Bk) + mu) / step).astype(np.int64))[:, live]
    out["rq8"] = 64 + model_bits(Qtr, Qdb)
    out["rq8_chol"] = 64 + chol_bits(chol_fit(Qtr), Qdb)
    bq = fit_beta(Qtr, s_tr)
    QTtr, QTdb = temporal(Qtr, s_tr, bq), temporal(Qdb, s_db, bq)
    out["rq8_temporal_chol"] = 64 + chol_bits(chol_fit(QTtr), QTdb)
    # conditional std profile: how much of each coordinate the earlier coordinates explain
    m, Lc = chol_fit(R0tr)
    out["cond_std"] = np.diag(Lc).round(3).tolist()
    out["marg_std"] = R0tr.std(0).round(3).tolist()
    # decode cost of the triangular predictor (numpy, one core, batched)
    t = time.perf_counter()
    solve_triangular(Lc, (R0db[:4000] - m).T, lower=True)
    out["chol_us"] = float((time.perf_counter() - t) / 4000 * 1e6)
    # banded / truncated variants: predict coordinate j from only its k most useful predecessors is costly to fit;
    # the cheap knob is "first r principal scores as side information", measured in sec_lossless (pca_side).
    # wire format: unrelated vectors (a top-50 response), no temporal context available
    Q = X[qm][RNG.choice(qm.sum(), 300, replace=False)]
    sel = np.unique(np.argsort(-(Q @ X[db].T), axis=1)[:, :50])
    out["wire_marginal"] = model_bits(R0tr, R0db[sel])
    out["wire_chol"] = chol_bits(chol_fit(R0tr), R0db[sel])
    out["wire_rq8_chol_given_code"] = chol_bits(chol_fit(Qtr), Qdb[sel])
    out["beta0"] = b0
    # pooled histograms (int8 units) of what is left to code after each modelling step, for the PDF figures
    def hist(V):
        V = np.asarray(V)
        return dict(h=np.bincount(np.clip(np.round(V).astype(np.int64).ravel(), -100, 100) + 100, minlength=201).tolist(),
                    sd=float(V.std()), mean=float(V.mean()))
    mT, LT = chol_fit(Ttr[s_tr])
    out["hist"] = dict(
        raw=hist(Idb[:, live]),
        centred=hist(R0db),
        temporal=hist(Tdb[s_db]),
        chol=hist(solve_triangular(Lc, (R0db - m).T, lower=True).T * np.diag(Lc)),
        temporal_chol=hist(solve_triangular(LT, (Tdb[s_db] - mT).T, lower=True).T * np.diag(LT)),
    )
    j = int(np.argsort(R0db.std(0))[R0db.shape[1] // 2])
    out["hist"]["one_dim"] = hist(Idb[:, live][:, j])
    return out

# --------------------------------------------------------------------------- F. floats
def bit_entropy(u, nbits):
    out = []
    for b in range(nbits - 1, -1, -1):
        p = float(((u >> np.uint64(b)) & np.uint64(1)).mean())
        out.append(0.0 if p in (0.0, 1.0) else float(-p * np.log2(p) - (1 - p) * np.log2(1 - p)))
    return out


@cached("floats")
def sec_floats(D):
    import zstandard

    X = D["X"]
    tr, db, _ = splits(D)
    Xdb = np.ascontiguousarray(X[db][:6000])
    z = zstandard.ZstdCompressor(level=19)
    mu = X[tr].mean(0)
    rq = train_rq(X[tr] - mu, 16, 4)
    pred = rq_decode(rq_codes(rq, Xdb - mu, 4), books_of(rq)) + mu

    def bits(buf, n):
        return len(z.compress(buf)) * 8 / n

    def shuffle(a):
        return np.ascontiguousarray(a.view(np.uint8).reshape(-1, a.dtype.itemsize).T).tobytes()

    out = {}
    for name, dt, ut in (("fp32", np.float32, np.uint32), ("fp16", np.float16, np.uint16)):
        A = Xdb.astype(dt)
        n = A.size
        U = A.view(ut)
        P = pred.astype(dt).view(ut)
        delta = A.copy().view(ut)
        delta[1:] = U[1:] ^ U[:-1]
        out[name] = {
            "raw": dt().itemsize * 8,
            "zstd": bits(A.tobytes(), n),
            "shuffle+zstd": bits(shuffle(A), n),
            "xor prev+shuffle+zstd": bits(shuffle(delta), n),
            "rq pred+shuffle+zstd": bits(shuffle((U - P).astype(ut)), n) + 16 * 8 / A.shape[1],
        }
    u32 = X[db].view(np.uint32).ravel().astype(np.uint64)
    u16 = X[db].astype(np.float16).view(np.uint16).ravel().astype(np.uint64)
    ex = D["demo"][0, :6]
    return dict(
        tables=out, bitH32=bit_entropy(u32, 32), bitH16=bit_entropy(u16, 16),
        examples=ex.tolist(), bits=[format(int(v), "032b") for v in ex.view(np.uint32)], n_values=int(u32.size),
    )


# --------------------------------------------------------------------------- I. LSH
def pack(bits):
    return np.packbits(bits, axis=1)


POP = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint16)


def hamming(qb, xb):
    """(Q, B) packed bits vs (N, B) -> (Q, N) Hamming distances."""
    out = np.zeros((qb.shape[0], xb.shape[0]), dtype=np.uint16)
    for j in range(qb.shape[1]):
        out += POP[qb[:, j : j + 1] ^ xb[None, :, j]]
    return out


@cached("lsh")
def sec_lsh(D):
    import faiss

    X = D["X"]
    tr, db, qm = splits(D)
    mu = X[tr].mean(0)
    Xdb, Q = X[db], X[qm][RNG.choice(qm.sum(), 500, replace=False)]
    N, d = Xdb.shape
    S = Q @ Xdb.T
    true = np.argsort(-S, axis=1)[:, :10]
    tset = [set(r) for r in true]
    Xc, Qc = Xdb - mu, Q - mu
    Xn, Qn = Xc / np.linalg.norm(Xc, axis=1, keepdims=True), Qc / np.linalg.norm(Qc, axis=1, keepdims=True)
    res = {"N": int(N), "nq": 500}

    # 1. collision probability per bit vs angle (theory: 1 - theta/pi)
    R = RNG.standard_normal((2048, d)).astype(np.float32)
    bx, bq = (Xn @ R.T) > 0, (Qn @ R.T) > 0
    i, j = RNG.integers(0, 500, 6000), RNG.integers(0, N, 6000)
    nn = true[i, RNG.integers(0, 10, 6000)]
    j = np.where(RNG.random(6000) < 0.4, nn, j)
    theta = np.arccos(np.clip((Qn[i] * Xn[j]).sum(1), -1, 1))
    agree = (bq[i] == bx[j])
    edges = np.linspace(0, np.pi, 25)
    coll = []
    for a, b in zip(edges[:-1], edges[1:]):
        m = (theta >= a) & (theta < b)
        if m.sum() >= 5:
            coll.append([float(theta[m].mean()), float(agree[m].mean()), int(m.sum())])
    res["collision"] = coll
    # 2. angle estimate from b bits: scatter + RMSE vs theory
    est = {}
    for b in (64, 256, 1024):
        th_hat = np.pi * (1 - agree[:, :b].mean(1))
        est[str(b)] = dict(
            rmse=float(np.sqrt(((th_hat - theta) ** 2).mean())),
            theory=float(np.sqrt((np.pi**2 * (theta / np.pi) * (1 - theta / np.pi) / b).mean())),
            pts=np.stack([np.cos(theta[:400]), np.cos(th_hat[:400])], 1).round(3).tolist(),
        )
    res["estimate"] = est

    # 3. bits as a compressed sketch: rank by Hamming, re-rank a shortlist exactly
    def rerank_recall(score, shortlist):
        """score: (Q, N) larger = better."""
        out = {}
        order = np.argsort(-score, axis=1)[:, : max(shortlist)]
        for r in shortlist:
            cand = order[:, :r]
            got = [c[np.argsort(-S[q, c])[:10]] for q, c in enumerate(cand)]
            out[str(r)] = float(np.mean([len(tset[q] & set(g)) / 10 for q, g in enumerate(got)]))
        return out

    SL = (10, 30, 100, 300, 1000)
    Vt = np.linalg.svd(X[tr] - mu, full_matrices=False)[2]
    sketch = []
    for b in (64, 128, 256, 384, 768, 1536):
        px, pq_ = Xc @ R[:b].T, Qc @ R[:b].T
        hb = -hamming(pack(pq_ > 0), pack(px > 0)).astype(np.float32)
        sketch.append(dict(kind="simhash", bits=b, **rerank_recall(hb, SL)))
        asym = pq_ @ np.sign(px).T  # float query against sign bits
        sketch.append(dict(kind="asym", bits=b, **rerank_recall(asym, SL)))
        if b <= d:
            px, pq_ = Xc @ Vt[:b].T, Qc @ Vt[:b].T
            sketch.append(dict(kind="pca_sign", bits=b, **rerank_recall(-hamming(pack(pq_ > 0), pack(px > 0)).astype(np.float32), SL)))
        log("    sketch", b, sketch[-1])
    hb = -hamming(pack(Qc > 0), pack(Xc > 0)).astype(np.float32)
    sketch.append(dict(kind="coord_sign", bits=d, **rerank_recall(hb, SL)))
    hb = -hamming(pack(Q > 0), pack(Xdb > 0)).astype(np.float32)
    sketch.append(dict(kind="coord_sign_uncentred", bits=d, **rerank_recall(hb, SL)))
    # random *rotation* (orthogonal) at b = d: the RaBitQ-style code
    Rot = np.linalg.qr(RNG.standard_normal((d, d)))[0].astype(np.float32)
    px, pq_ = Xn @ Rot.T, Qn @ Rot.T
    sketch.append(dict(kind="rot_sign", bits=d, **rerank_recall(-hamming(pack(pq_ > 0), pack(px > 0)).astype(np.float32), SL)))
    sketch.append(dict(kind="rot_asym", bits=d, **rerank_recall(pq_ @ np.sign(px).T, SL)))
    res["sketch"] = sketch

    # 4. LSH as an index: k bits per table, L tables; fraction of the database touched vs recall
    def lsh_index(k, L, probes=0):
        Rk = RNG.standard_normal((L, k, d)).astype(np.float32)
        w = (1 << np.arange(k)).astype(np.int64)
        frac, rec = [], []
        tables = []
        for t in range(L):
            keys = ((Xc @ Rk[t].T) > 0) @ w
            order = np.argsort(keys, kind="stable")
            tables.append((keys[order], order))
        for q in range(len(Q)):
            cand = []
            for t in range(L):
                pr = Qc[q] @ Rk[t].T
                key = int((pr > 0) @ w)
                keys = [key]
                if probes:
                    flip = np.argsort(np.abs(pr))[:probes]  # the bits most likely to be wrong
                    keys += [key ^ int(w[f]) for f in flip]
                ks, order = tables[t]
                for kk in keys:
                    a, b_ = np.searchsorted(ks, kk), np.searchsorted(ks, kk, side="right")
                    cand.append(order[a:b_])
            c = np.unique(np.concatenate(cand)) if cand else np.array([], int)
            frac.append(len(c) / N)
            rec.append(len(tset[q] & set(c[np.argsort(-S[q, c])[:10]])) / 10 if len(c) else 0.0)
        return float(np.mean(frac)), float(np.mean(rec))

    idx = []
    for k in (8, 10, 12, 14, 16):
        for L in (1, 2, 4, 8, 16, 32, 64):
            f, r = lsh_index(k, L)
            idx.append(dict(kind="lsh", k=k, L=L, frac=f, recall=r))
        log("    lsh k", k, idx[-1])
    for k in (12, 16):
        for L in (1, 2, 4, 8, 16):
            f, r = lsh_index(k, L, probes=k)
            idx.append(dict(kind="multiprobe", k=k, L=L, frac=f, recall=r))
    for nlist in (64, 256):
        km = faiss.Kmeans(d, nlist, niter=20, seed=1)
        km.train(np.ascontiguousarray(Xc))
        asg = km.index.search(np.ascontiguousarray(Xc), 1)[1].ravel()
        near = km.index.search(np.ascontiguousarray(Qc), 32)[1]
        for nprobe in (1, 2, 4, 8, 16, 32):
            frac, rec = [], []
            for q in range(len(Q)):
                c = np.nonzero(np.isin(asg, near[q, :nprobe]))[0]
                frac.append((len(c) + nlist) / N)
                rec.append(len(tset[q] & set(c[np.argsort(-S[q, c])[:10]])) / 10)
            idx.append(dict(kind=f"ivf{nlist}", nprobe=nprobe, frac=float(np.mean(frac)), recall=float(np.mean(rec))))
    res["index"] = idx
    # similarity of the 10th neighbour and of a random pair: the gap LSH has to work with
    res["cos_nn10"] = float(np.take_along_axis(S, true[:, 9:10], 1).mean())
    res["cos_nn1"] = float(np.take_along_axis(S, true[:, 0:1], 1).mean())
    res["cos_rand"] = float(S.mean())
    cn = Qn @ Xn.T
    res["cosc_nn10"] = float(np.take_along_axis(cn, true[:, 9:10], 1).mean())
    res["cosc_rand"] = float(cn.mean())
    return res


# --------------------------------------------------------------------------- J. wire format
@cached("wire")
def sec_wire(D):
    """Sizes for a search response: top-k vectors that are NOT neighbours in the text, int8 target."""
    import zstandard

    X = D["X"].astype(np.float64)
    tr, db, qm = splits(D)
    mu = X[tr].mean(0)
    step = float(np.abs(X).max() / 127)
    d = X.shape[1]
    Itr, Idb = np.round(X[tr] / step).astype(np.int64), np.round(X[db] / step).astype(np.int64)
    Q = X[qm][RNG.choice(qm.sum(), 300, replace=False)]
    top = np.argsort(-(Q @ X[db].T), axis=1)[:, :50]
    rq = train_rq((X[tr] - mu).astype(np.float32), 16, 1)
    Bk = books_of(rq).astype(np.float64)
    ctr, cdb = rq_codes(rq, (X[tr] - mu).astype(np.float32), 1), rq_codes(rq, (X[db] - mu).astype(np.float32), 1)
    mui = np.round(mu / step).astype(np.int64)
    z19, z3 = zstandard.ZstdCompressor(level=19), zstandard.ZstdCompressor(level=3)
    dic = zstandard.train_dictionary(110_000, [Itr[i : i + 50].astype(np.int8).tobytes() for i in range(0, 40000, 50)])
    zd = zstandard.ZstdCompressor(level=19, dict_data=dic)

    def per_response(fn):
        return float(np.mean([fn(Idb[t]) for t in top]) / 50)

    out = {"raw": 8.0 * d}
    out["zstd"] = per_response(lambda a: len(z19.compress(a.astype(np.int8).tobytes())) * 8)
    out["zstd_dict"] = per_response(lambda a: len(zd.compress(a.astype(np.int8).tobytes())) * 8)
    sel = np.unique(top)
    out["static_model"] = model_bits(Itr - mui, Idb[sel] - mui)
    for m in (8, 16):
        htr = sum(Bk[j][ctr[:, j]] for j in range(m))
        hdb = sum(Bk[j][cdb[:, j]] for j in range(m))
        Rtr = Itr - np.round((htr + mu) / step).astype(np.int64)
        Rdb = Idb - np.round((hdb + mu) / step).astype(np.int64)
        rb = model_bits(Rtr, Rdb[sel])
        out[f"rq{m}_residual_only"] = rb  # the client already holds the index code
        out[f"rq{m}_code_plus_residual"] = rb + 8 * m
    # responses are similar to each other (same query): predict each from the query vector the client already has
    qi = np.round(Q / step).astype(np.int64)
    a = float(np.mean([(Idb[t] - mui).ravel() @ np.repeat((qi[k] - mui)[None], 50, 0).ravel() / (50 * ((qi[k] - mui) ** 2).sum()) for k, t in enumerate(top)]))
    Rq = np.concatenate([Idb[t] - mui - np.round(a * (qi[k] - mui)).astype(np.int64) for k, t in enumerate(top)])
    # fit on a held-out half of the responses
    h = len(Rq) // 2
    out["query_as_predictor"] = model_bits(Rq[:h], Rq[h:])
    out["query_alpha"] = a
    out["mean_cos_top50"] = float(np.mean([(Q[k] @ X[db][t].T).mean() for k, t in enumerate(top)]))
    return out


# --------------------------------------------------------------------------- main
def main():
    force = set(sys.argv[1:])
    D = load_data()
    log("data", D["X"].shape)
    R = {"meta": dict(model="sentence-transformers/all-MiniLM-L6-v2", corpus="NLTK Gutenberg, 18 books",
                      window=48, stride=24, date=time.strftime("%Y-%m-%d"))}
    for name, fn in (("props", sec_props), ("lossy", sec_lossy), ("sweep", sec_sweep),
                     ("code_entropy", sec_code_entropy), ("lossless", sec_lossless), ("ladder", sec_ladder), ("floats", sec_floats),
                     ("lsh", sec_lsh), ("wire", sec_wire)):
        try:
            R[name] = fn(D, force=name in force or "all" in force)
        except Exception as e:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            log(f"[{name}] FAILED: {e!r}")
    tr, db, qm = splits(D)
    R["meta"].update(n_windows=int(len(D["X"])), n_train=int(tr.sum()), n_db=int(db.sum()), n_query_pool=int(qm.sum()),
                     d=int(D["X"].shape[1]))
    (OUT / "results.json").write_text(json.dumps(R))
    log("wrote", OUT / "results.json", f"{(OUT / 'results.json').stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
