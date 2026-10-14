# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "torch", "transformers", "accelerate", "nltk"]
# ///
"""Paper club: MagicPIG (Chen et al., 2024) checked on real KV vectors.

    uv run experiments/magicpig.py

Reads 16k tokens of a Gutenberg book with Qwen2.5-1.5B-Instruct, records the post-RoPE queries, keys and values
of every layer, and measures: the geometry of the key and query clouds, how concentrated attention is, and how
well TopK, sampling and a re-implementation of MagicPIG's LSH sampling estimate the attention output.
Output: data/lab/magicpig.json (about 1 minute on an RTX 5080 after the model is downloaded).
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "lab" / "magicpig.json"
CACHE = Path(__file__).resolve().parent / "cache"

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
BOOK = "austen-emma.txt"
N = 16384            # context length (the paper's error plots use 16k)
T = 64               # the last T positions act as decoding queries
STATIC_SINK, STATIC_LOCAL = 4, 64   # MagicPIG keeps these tokens exact, on the GPU
CONFIGS = [(8, 75), (9, 120), (10, 150)]
BUDGETS = [0.0025, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2]
DEV = "cuda"
torch.manual_seed(0)


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


# ---------------------------------------------------------------- recording q, k, v after RoPE
REC: dict[int, dict] = {}
KEEP_Q = None  # positions whose queries are kept


def recording(module, query, key, value, attention_mask, **kw):
    from transformers.integrations.sdpa_attention import sdpa_attention_forward

    # query is (batch, heads, seq, d); key and value are (batch, kv_heads, seq, d), before the GQA repeat
    REC[module.layer_idx] = dict(q=query[:, :, KEEP_Q].float(), k=key.float(), v=value.float())
    return sdpa_attention_forward(module, query, key, value, attention_mask, **kw)


def load():
    from transformers import AttentionInterface, AutoModelForCausalLM, AutoTokenizer

    AttentionInterface.register("recording", recording)
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.bfloat16, attn_implementation="recording").to(DEV).eval()
    return tok, model


@torch.no_grad()
def run(model, ids, keep_q):
    global KEEP_Q
    REC.clear()
    KEEP_Q = keep_q
    model(torch.as_tensor(ids, device=DEV)[None], use_cache=False, logits_to_keep=1)
    return {l: {k: t[0] for k, t in r.items()} for l, r in REC.items()}


def cos(a, b):
    return torch.nn.functional.cosine_similarity(a, b, dim=-1)


def hist(x, lo, hi, nb, w=None):
    h = torch.histc(x.float(), nb, lo, hi) if w is None else torch.zeros(nb, device=x.device).index_add_(
        0, ((x.clamp(lo, hi - 1e-6) - lo) / (hi - lo) * nb).long(), w.float())
    return [round(float(v), 6) for v in (h / h.sum())]


# ---------------------------------------------------------------- estimators (rows = decoding queries)
def ent(x):
    return -(x * torch.log(x.clamp_min(1e-30))).sum(-1)


def rel_err(est, o):
    return ((est - o).norm(dim=-1) / o.norm(dim=-1))


def topk_est(w, V, kk):
    idx = w.topk(kk, dim=-1).indices
    m = torch.zeros_like(w).scatter_(1, idx, 1.0) * w
    return (m / m.sum(-1, keepdim=True)) @ V, torch.full((w.shape[0],), kk, device=w.device, dtype=torch.float)


def sample_est(w, V, B):
    draws = torch.multinomial(w, B, replacement=True)
    cnt = torch.zeros_like(w).scatter_add_(1, draws, torch.ones_like(draws, dtype=w.dtype))
    return (cnt / B) @ V, (cnt > 0).sum(-1).float()


def hybrid_est(w, V, k1, B):
    """Exact top k1, plus B draws from the rest: the textbook 'take the big ones, sample the tail'."""
    idx = w.topk(k1, dim=-1).indices
    top = torch.zeros_like(w).scatter_(1, idx, 1.0).bool()
    head = torch.where(top, w, 0.0)
    tail = w - head
    mt = tail.sum(-1, keepdim=True)
    # in very peaked heads the tail can underflow to exactly 0; its share mt is then 0 too and any draw will do
    draws = torch.multinomial(torch.where(mt > 0, tail, 1.0), B, replacement=True)
    cnt = torch.zeros_like(w).scatter_add_(1, draws, torch.ones_like(draws, dtype=w.dtype))
    return head @ V + mt * ((cnt / B) @ V), (k1 + (cnt > 0).sum(-1)).float()


def magicpig_est(q, K, V, s, valid, static, W, Kb, Lt, center, mu):
    """MagicPIG (Algorithm 1): keys sharing a SimHash code with q in >= 2 of L tables are sampled with
    probability u_i (Eq. 10) and re-weighted by 1/u_i inside the softmax; static tokens are exact."""
    Kc = K - mu if center else K
    kb = (Kc @ W > 0).view(K.shape[0], Lt, Kb)
    qb = (q @ W > 0).view(q.shape[0], Lt, Kb)
    pw = 1 << torch.arange(Kb, device=K.device)
    kc, qc = (kb * pw).sum(-1), (qb * pw).sum(-1)                 # (n, L), (T, L) integer hash codes
    hits = (qc[:, None, :] == kc[None, :, :]).sum(-1)             # (T, n)
    lsh = (hits >= 2) & valid & ~static
    c = torch.nn.functional.normalize(q, dim=-1) @ torch.nn.functional.normalize(Kc, dim=-1).T
    p = 1 - torch.arccos(c.clamp(-1, 1)) / math.pi
    pk = p ** Kb
    u = 1 - (1 - pk) ** Lt - Lt * pk * (1 - pk) ** (Lt - 1)
    logit = torch.where(lsh, s - torch.log(u.clamp_min(1e-30)), torch.where(static & valid, s, -math.inf))
    a = torch.softmax(logit, -1)
    return a @ V, (lsh | (static & valid)).sum(-1).float()


def main():
    g = gutenberg()
    tok, model = load()
    cfg = model.config
    H, G, D, NL = cfg.num_attention_heads, cfg.num_key_value_heads, cfg.hidden_size // cfg.num_attention_heads, cfg.num_hidden_layers
    rep = H // G
    scale = D ** -0.5
    log(f"{MODEL}: {NL} layers, {H} query heads, {G} kv heads, head dim {D}")

    # ---------- 1. the sink key barely depends on the token (paper Fig 5a)
    rng = np.random.default_rng(0)
    vocab = [i for i in rng.choice(min(tok.vocab_size, 150000), 400, replace=False) if tok.decode([int(i)]).strip().isalpha()][:32]
    sinks = {l: [] for l in range(NL)}
    for t in vocab:
        r = run(model, [int(t)], [0])
        for l in range(NL):
            sinks[l].append(r[l]["k"][:, 0])                     # (G, D)
    sink_stab = []
    for l in range(NL):
        S = torch.stack(sinks[l], 1)                              # (G, 32, D)
        C = cos(S[:, :, None], S[:, None, :])
        off = ~torch.eye(C.shape[1], dtype=torch.bool, device=DEV)
        sink_stab.append(dict(mean=float(C[:, off].mean()), min=float(C[:, off].min())))
    log("sink stability", np.mean([x["mean"] for x in sink_stab]))

    # ---------- 2. the mean key direction barely depends on the text (paper Fig 5b): 50 passages of 1,024 tokens
    texts = []
    for f in g.fileids():
        ids = tok(g.raw(f))["input_ids"]
        for j in range(3):
            st = len(ids) // 4 * (j + 1) - 512
            texts.append(ids[st:st + 1024])
    texts = texts[:50]
    mus = {l: [] for l in range(NL)}
    for ids in texts:
        r = run(model, ids, [0])
        for l in range(NL):
            mus[l].append(r[l]["k"][:, 1:].mean(1))               # leave out the first token
    mean_stab = []
    for l in range(NL):
        M = torch.stack(mus[l], 1)
        C = cos(M[:, :, None], M[:, None, :])
        off = ~torch.eye(C.shape[1], dtype=torch.bool, device=DEV)
        mean_stab.append(dict(mean=float(C[:, off].mean()), min=float(C[:, off].min())))
    log("mean-key stability", np.mean([x["mean"] for x in mean_stab]))

    # ---------- 3. one long context, all layers
    ids = tok(g.raw(BOOK))["input_ids"][:N]
    keep = list(range(0, N - T, 64)) + list(range(N - T, N))     # every 64th query for geometry, plus the decoding rows
    rec = run(model, ids, keep)
    del model
    torch.cuda.empty_cache()
    dec = torch.arange(len(keep) - T, len(keep), device=DEV)     # rows of the kept queries that are decoding queries
    pos = torch.arange(N - T, N, device=DEV)
    ar = torch.arange(N, device=DEV)
    valid = ar[None, :] <= pos[:, None]                          # causal mask, (T, N)
    static = (ar[None, :] < STATIC_SINK) | (ar[None, :] > pos[:, None] - STATIC_LOCAL)
    W = {Kb: torch.randn(D, Kb * Lt, device=DEV, generator=torch.Generator(DEV).manual_seed(1)) for Kb, Lt in CONFIGS}

    geo, spars, layer_err = [], [], []
    acc = {m: {} for m in ("topk", "oracle", "hybrid")}
    pig = {}
    show = {}
    for l in range(NL):
        r = rec[l]
        g_cos_k, g_cos_q, g_sink, g_qsink, g_vsink = [], [], [], [], []
        sp = dict(sink=[], top20=[], top20_nosink=[], eff=[], eff_nosink=[])
        lerr = {}
        for h in range(H):
            gi = h // rep
            K, V, Qall = r["k"][gi], r["v"][gi], r["q"][h]
            mu = K[1:].mean(0)
            q = Qall[dec]
            # geometry (paper Fig 2c, 5c, 11)
            if h % rep == 0:
                g_cos_k.append(cos(K[1:], mu).mean())
                g_sink.append(cos(K[0], mu))
                g_vsink.append(V[0].norm() / V[1:].norm(dim=-1).mean())
            g_cos_q.append(cos(Qall, mu).mean())
            g_qsink.append(cos(Qall, K[0]).mean())
            # exact attention
            s = torch.where(valid, (q @ K.T) * scale, -math.inf)
            w = torch.softmax(s, -1)
            o = w @ V
            # how concentrated is it?
            ws = w.sort(-1, descending=True).values
            n_ = pos.float() + 1
            k20 = (0.2 * n_).long()
            cs = ws.cumsum(-1)
            sp["sink"].append(w[:, 0].mean())
            sp["top20"].append(cs.gather(1, k20[:, None] - 1).mean())
            wn = w.clone()
            wn[:, 0] = 0
            wn = wn / wn.sum(-1, keepdim=True)
            csn = wn.sort(-1, descending=True).values.cumsum(-1)
            sp["top20_nosink"].append(csn.gather(1, k20[:, None] - 1).mean())
            sp["eff"].append((ent(w).exp() / n_).mean())
            sp["eff_nosink"].append((ent(wn).exp() / n_).mean())
            # estimators at matched budgets
            for b in BUDGETS:
                kk = max(1, round(b * N))
                est, used = topk_est(w, V, kk)
                e = float(rel_err(est, o).mean())
                acc["topk"].setdefault(b, []).append((e, float((used / n_).mean())))
                lerr.setdefault(("topk", b), []).append(e)
            for B in (16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384):
                est, used = sample_est(w, V, B)
                acc["oracle"].setdefault(B, []).append((float(rel_err(est, o).mean()), float((used / n_).mean())))
            for b in BUDGETS:
                k1 = max(1, round(b * N / 2))
                est, used = hybrid_est(w, V, k1, k1)
                acc["hybrid"].setdefault(b, []).append((float(rel_err(est, o).mean()), float((used / n_).mean())))
            for Kb, Lt in CONFIGS:
                for center in (True, False):
                    for use_static in (True, False):
                        stt = static if use_static else torch.zeros_like(static)
                        est, used = magicpig_est(q, K, V, s, valid, stt, W[Kb], Kb, Lt, center, mu)
                        e = rel_err(est, o)
                        key = (Kb, Lt, center, use_static)
                        pig.setdefault(key, []).append((float(e.nan_to_num(1.0).mean()), float((used / n_).mean())))
                        if center and use_static and (Kb, Lt) == (10, 150):
                            lerr.setdefault(("pig", 0), []).append(float(e.mean()))
            # static set alone: attention sink + local window (StreamingLLM)
            a = torch.softmax(torch.where(static & valid, s, -math.inf), -1)
            pig.setdefault("static", []).append((float(rel_err(a @ V, o).mean()), float(((static & valid).sum(-1) / n_).mean())))
            # one representative row for the picture of the cone and the hash curve
            if (l, h) == (SHOW_LAYER, SHOW_HEAD):
                qq = q[-1]
                show = dict(
                    layer=l, head=h,
                    raw=dict(count=hist(cos(qq[None], K), -1, 1, 80), mass=hist(cos(qq[None], K), -1, 1, 80, w[-1])),
                    centered=dict(count=hist(cos(qq[None], K - mu), -1, 1, 80), mass=hist(cos(qq[None], K - mu), -1, 1, 80, w[-1])),
                    k_mu=hist(cos(K[1:], mu), -1, 1, 80), q_mu=hist(cos(Qall, mu), -1, 1, 80),
                    sink_mu=float(cos(K[0], mu)), q_sink=float(cos(qq, K[0])), sink_mass=float(w[-1, 0]),
                )
        geo.append(dict(k_mu=float(torch.stack(g_cos_k).mean()), q_mu=float(torch.stack(g_cos_q).mean()),
                        sink_mu=float(torch.stack(g_sink).mean()), q_sink=float(torch.stack(g_qsink).mean()),
                        v_sink=float(torch.stack(g_vsink).mean()), sink_stab=sink_stab[l]["mean"], mean_stab=mean_stab[l]["mean"]))
        spars.append({k: round(float(torch.stack(v).mean()), 4) for k, v in sp.items()})
        layer_err.append(dict(topk_2=float(np.mean(lerr[("topk", 0.02)])), pig=float(np.mean(lerr[("pig", 0)]))))
        log(f"layer {l:2d}: k·mu {geo[-1]['k_mu']:+.2f} q·mu {geo[-1]['q_mu']:+.2f} sink·mu {geo[-1]['sink_mu']:+.2f} "
            f"sink mass {spars[-1]['sink']:.2f} top20 {spars[-1]['top20']:.2f}/{spars[-1]['top20_nosink']:.2f} "
            f"err topk2% {layer_err[-1]['topk_2']:.3f} pig {layer_err[-1]['pig']:.3f}")

    mean2 = lambda xs: [round(float(np.mean([x[0] for x in xs])), 4), round(float(np.mean([x[1] for x in xs])), 5)]
    out = dict(
        model=MODEL, book=BOOK, n=N, t=T, layers=NL, heads=H, kv_heads=G, head_dim=D,
        geometry=geo, sparsity=spars, layer_err=layer_err, show=show,
        curves={m: [dict(zip(("err", "budget"), mean2(v))) | {"x": b} for b, v in sorted(d.items())] for m, d in acc.items()},
        magicpig=[dict(K=k[0], L=k[1], centered=k[2], static=k[3], **dict(zip(("err", "budget"), mean2(v))))
                  for k, v in pig.items() if k != "static"],
        static=dict(zip(("err", "budget"), mean2(pig["static"]))),
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    log("wrote", OUT.relative_to(ROOT))
    for k, v in out["curves"].items():
        log(k, [(c["budget"], c["err"]) for c in v])
    for m in out["magicpig"]:
        log("magicpig", m)
    log("static", out["static"])


SHOW_LAYER, SHOW_HEAD = 14, 0

if __name__ == "__main__":
    main()
