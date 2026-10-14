"""Named numbers for the prose. content/*.md refers to them as {{name}} or {{name|.2f}}.

Numbers come from data/results.json and imported data/lab snapshots, so rebuilding updates the text.
A missing name is a build error, which keeps the prose from drifting away from the measurements.
"""
from __future__ import annotations

import math
import json
import statistics
from pathlib import Path


def facts(R: dict) -> dict:
    if not R:
        return {}
    f: dict = {}
    p, m = R["props"], R["meta"]
    d = p["d"]
    f.update(
        d=d, n_windows=m["n_windows"], n_train=m["n_train"], n_db=m["n_db"], n_queries=R["lossy"]["n_q"],
        raw_bytes=d * 4, raw_bits=d * 32,
        var8=p["cumvar"]["8"], var32=p["cumvar"]["32"], var64=p["cumvar"]["64"], var128=p["cumvar"]["128"], var256=p["cumvar"]["256"],
        pr=p["participation_ratio"], lag1=p["lag_cos"]["1"], lag2=p["lag_cos"]["2"], lag16=p["lag_cos"]["16"], lag256=p["lag_cos"]["256"],
        mean_norm=p["mean_norm"], rand_cos=p["rand_cos_mean"], rand_cos_std=p["rand_cos_std"], alpha=p["alpha"],
        max_abs=p["max_abs"], coord_std=p["coord_std"], kurtosis=p["coord_kurtosis"], dead_dims=p["dead_dims"], rank=p["rank"],
        top1_var=p["spectrum"][0],
    )
    f["pred_gain"] = 1 / (1 - f["alpha"] ** 2)
    # how many directions hold 67% / 90% of the variance
    cum, k67, k90 = 0.0, None, None
    for i, v in enumerate(p["spectrum"]):
        cum += v
        if k67 is None and cum >= 0.67:
            k67 = i + 1
        if k90 is None and cum >= 0.90:
            k90 = i + 1
    f.update(k67=k67, k90=k90, k67_pct=k67 / d, k90_pct=k90 / d)

    # ---- lossy at 64 bits
    rows = {r["name"]: r for r in R["lossy"]["rows"]}
    short = {"pca8": "PCA→8 dims + int8", "pq": "PQ 8×8", "opq": "OPQ 8×8", "rq": "RQ greedy", "beam4": "RQ beam 4",
             "beam16": "RQ beam 16", "lsq": "LSQ (ICM + restarts)", "pred_always": "Predictive RQ (always predict)",
             "pred_mode": "Predictive RQ + mode decision"}
    for k, name in short.items():
        if name in rows:
            f[f"{k}_err"], f[f"{k}_rec"], f[f"{k}_us"] = rows[name]["relmse"], rows[name]["recall"], rows[name]["enc_us"]
    f["pq_to_rq_cut"] = 1 - f["rq_err"] / f["pq_err"]
    f["pq_to_opq_cut"] = 1 - f["opq_err"] / f["pq_err"]
    f["rq_to_beam4_cut"] = 1 - f["beam4_err"] / f["rq_err"]
    f["beam16_cost"] = f["beam16_us"] / f["rq_us"]
    f["beam4_cost"] = f["beam4_us"] / f["rq_us"]
    f["lsq_cost"] = f["lsq_us"] / f["rq_us"]
    f["rq_to_lsq_cut"] = 1 - f["lsq_err"] / f["rq_err"]
    f["rq_to_mode_cut"] = 1 - f["pred_mode_err"] / f["rq_err"]
    f["pred_frac"] = R["lossy"]["pred_frac"]
    f["alpha_closed"] = R["lossy"]["alpha_closed"]
    lsq_note = rows[short["lsq"]]["note"]
    f["lsq_train_err"] = float(lsq_note.split()[-1])
    f["codebook_params"] = 8 * 256 * d

    # ---- rate sweep
    sw = {(q["fam"], q["bits"]): q for q in R["sweep"]["points"]}
    for fam in ("scalar", "pca_sq", "pq", "opq", "rq"):
        for bits in (64, 128, 256, 384, 512, 768, 1536, 3072):
            if (fam, bits) in sw:
                f[f"sw_{fam}_{bits}_err"], f[f"sw_{fam}_{bits}_rec"] = sw[(fam, bits)]["relmse"], sw[(fam, bits)]["recall"]
    f["pca64_dims"] = sw[("pca_sq", 64)]["dims_used"]
    f["pca512_dims"] = sw[("pca_sq", 512)]["dims_used"]

    # ---- entropy of the codes
    ce = R["code_entropy"]
    f["ce_marg"] = sum(e["marg"] for e in ce)
    f["ce_cond"] = sum(min(e["marg"], e["cond"]) for e in ce)
    f["ce_saving"] = 1 - f["ce_marg"] / 64
    f["ce_cond_saving"] = 1 - f["ce_cond"] / 64
    f["ce_s1_marg"], f["ce_s1_cond"], f["ce_s1_repeat"] = ce[0]["marg"], ce[0]["cond"], ce[0]["repeat"]

    # ---- lossless
    L = R["lossless"]
    i8 = L["int8"]
    f["i8_raw"] = 8 * d
    f["i8_step"] = i8["step"]
    f["i8_entropy"] = i8["entropy only"]
    f["i8_prev"] = i8["previous window"]
    best = min(i8["sweep"], key=lambda r: r["total"])
    bestt = min(i8["sweep"], key=lambda r: r["total_temporal"])
    f["i8_best_m"], f["i8_best"] = best["m"], best["total"]
    f["i8_bestt_m"], f["i8_bestt"] = bestt["m"], bestt["total_temporal"]
    f["i8_rq_saving"] = 1 - best["total"] / f["i8_entropy"]
    f["i8_m8_err"] = i8["sweep"][8]["relmse"]
    f["i8_m8_saved"] = i8["sweep"][0]["resid_bits"] - i8["sweep"][8]["resid_bits"]
    f["i8_m8_pred"] = d / 2 * math.log2(1 / i8["sweep"][8]["relmse"])
    f["stage_threshold"] = 1 - 2 ** (-16 / d)
    sw_ = i8["sweep"]
    f["stage9_cut"] = 1 - sw_[9]["relmse"] / sw_[8]["relmse"]
    f["stage10_cut"] = 1 - sw_[10]["relmse"] / sw_[9]["relmse"]
    f["stage12_cut"] = 1 - sw_[12]["relmse"] / sw_[11]["relmse"]
    f16 = L["fixed16"]
    f["f16_raw"], f["f16_entropy"], f["f16_prev"] = 16 * d, f16["entropy only"], f16["previous window"]
    f["f16_best"] = min(r["total_temporal"] for r in f16["sweep"])
    mo = L["models"]["0"]
    f.update(mo_flat=mo["flat"], mo_one=mo["one_gauss"], mo_gauss=mo["gauss"], mo_lap=mo["laplace"], mo_hist=mo["hist"])
    f["mo_lap_penalty"] = mo["laplace"] - mo["gauss"]
    f["mo_gauss_saving"] = 1 - mo["gauss"] / mo["flat"]
    f["mvn"] = L["mvn_bits"]
    f["coding_gain"] = L["coding_gain_bits"]
    ps = min(L["pca_side"], key=lambda r: r["total"])
    f["pca_side_best"], f["pca_side_s"], f["pca_side_side"], f["pca_side_resid"] = ps["total"], ps["s"], ps["side_bits"], ps["resid_bits"]
    f["pca_side_s1"] = L["pca_side"][-1]["total"]
    for r in L["near"]:
        f[f"near{r['eps']}"] = r["bits"]
    f["near1_saving"] = L["near"][0]["bits"] - L["near"][1]["bits"]
    rc = L.get("real_coder")
    if rc:
        f.update(rc_bits=rc["bits"], rc_ideal=rc["ideal"], rc_over=rc["bits"] / rc["ideal"] - 1, rc_enc=rc["enc_us"], rc_dec=rc["dec_us"])
    h = L["hist"]
    f.update(resid_std0=h["rq0_std"], resid_std0t=h["rq0t_std"], resid_std8=h["rq8_std"], resid_std8t=h["rq8t_std"])

    # ---- the ladder
    ld = R["ladder"]
    for k in ("marginal", "temporal", "chol", "temporal_chol", "var", "var_chol", "rq8", "rq8_chol", "rq8_temporal_chol",
              "wire_marginal", "wire_chol", "wire_rq8_chol_given_code", "chol_us"):
        f[f"ld_{k}"] = ld[k]
    f["ld_flat"] = ld["flat"]
    for k in ("marginal", "temporal", "chol", "temporal_chol", "var_chol", "wire_chol", "wire_rq8_chol_given_code"):
        f[f"ld_{k}_saving"] = 1 - ld[k] / ld["flat"]
        f[f"ld_{k}_bytes"] = ld[k] / 8
    f["ld_best_ratio"] = ld["flat"] / ld["temporal_chol"]
    f["ld_chol_gain"] = ld["marginal"] - ld["chol"]
    f["ld_temporal_gain"] = ld["marginal"] - ld["temporal"]
    f["ld_rq_gain"] = ld["marginal"] - ld["rq8"]
    f["ld_shape_gain"] = ld["flat"] - ld["marginal"]
    f["archive_gb_raw"] = 300e6 * d / 1e9
    f["archive_gb_best"] = 300e6 * ld["temporal_chol"] / 8 / 1e9
    f["chol_params"] = d * (d - 1) // 2

    f["key64_cost"] = (ld["chol"] - ld["temporal_chol"]) / 64
    f["key16_cost"] = (ld["chol"] - ld["temporal_chol"]) / 16
    f["rq_resid_gain_marg"] = ld["marginal"] - (ld["rq8"] - 64)
    f["rq_resid_gain_chol"] = ld["chol"] - (ld["rq8_chol"] - 64)
    f["rq_chol_cost"] = ld["rq8_chol"] - ld["chol"]
    f["rq_tchol_cost"] = ld["rq8_temporal_chol"] - ld["temporal_chol"]
    f["var_gain"] = ld["temporal"] - ld["var"]
    f["temporal_bits_theory"] = -0.5 * math.log2(1 - ld["beta0"] ** 2) * d
    f["beta0"] = ld["beta0"]
    f["per_dim_temporal"] = -0.5 * math.log2(1 - ld["beta0"] ** 2)
    f["wire_gain_vs_zstd"] = 1 - ld["wire_chol"] / R["wire"]["zstd"]
    f["resp_raw_kb"] = 100 * d / 1000
    f["resp_best_kb"] = 100 * ld["wire_chol"] / 8 / 1000

    # ---- floats
    F = R["floats"]
    f["bitsum32"] = sum(F["bitH32"])
    f["bitsum16"] = sum(F["bitH16"])
    for k, v in F["tables"]["fp32"].items():
        f["fp32_" + k.replace(" ", "_").replace("+", "_")] = v
    for k, v in F["tables"]["fp16"].items():
        f["fp16_" + k.replace(" ", "_").replace("+", "_")] = v
    f["fp32_zstd_saving"] = 1 - F["tables"]["fp32"]["zstd"] / 32
    f["fp32_shuffle_saving"] = 1 - F["tables"]["fp32"]["shuffle+zstd"] / 32
    f["fp16_shuffle_saving"] = 1 - F["tables"]["fp16"]["shuffle+zstd"] / 16
    f["n_float_values"] = F["n_values"]
    f["mantissa_noise"] = math.log2(R["lossless"]["hist"]["rq8_std"] * i8["step"] / 2 ** -28)

    # ---- LSH
    S = R["lsh"]
    f.update(lsh_n=S["N"], cos_nn1=S["cos_nn1"], cos_nn10=S["cos_nn10"], cos_rand=S["cos_rand"], cosc_nn10=S["cosc_nn10"], cosc_rand=S["cosc_rand"])
    f["p_nn10"] = 1 - math.acos(S["cosc_nn10"]) / math.pi
    f["p_rand"] = 1 - math.acos(S["cosc_rand"]) / math.pi
    f["lsh_rho"] = math.log(1 / f["p_nn10"]) / math.log(1 / f["p_rand"])
    sk = {(s["kind"], s["bits"]): s for s in S["sketch"]}
    for kind in ("simhash", "asym", "pca_sign", "coord_sign", "rot_sign", "rot_asym", "coord_sign_uncentred"):
        for bits in (64, 128, 256, 384, 768, 1536):
            if (kind, bits) in sk:
                for r in ("10", "100", "1000"):
                    f[f"sk_{kind}_{bits}_{r}"] = sk[(kind, bits)][r]
    for b, e in S["estimate"].items():
        f[f"est_rmse_{b}"], f[f"est_theory_{b}"] = e["rmse"], e["theory"]
    ix = S["index"]
    get = lambda **kw: next(r for r in ix if all(r.get(k) == v for k, v in kw.items()))
    for name, kw in (("lsh_8_64", dict(kind="lsh", k=8, L=64)), ("lsh_12_64", dict(kind="lsh", k=12, L=64)), ("lsh_8_16", dict(kind="lsh", k=8, L=16)),
                     ("mp_12_16", dict(kind="multiprobe", k=12, L=16)), ("lsh_12_16", dict(kind="lsh", k=12, L=16)),
                     ("ivf256_4", dict(kind="ivf256", nprobe=4)), ("ivf256_16", dict(kind="ivf256", nprobe=16)), ("ivf64_16", dict(kind="ivf64", nprobe=16))):
        r = get(**kw)
        f[f"ix_{name}_frac"], f[f"ix_{name}_rec"] = r["frac"], r["recall"]

    N = S["N"]
    f["lsh_nrho_here"] = N ** f["lsh_rho"]
    f["lsh_nrho_here_frac"] = N ** f["lsh_rho"] / N
    f["lsh_nrho_million"] = 1e6 ** f["lsh_rho"]
    f["p2_k12_inv"] = 1 / f["p_rand"] ** 12
    f["p1_k12"] = f["p_nn10"] ** 12
    f["angle_nn10"] = math.degrees(math.acos(S["cosc_nn10"]))
    f["angle_rand"] = math.degrees(math.acos(S["cosc_rand"]))

    # ---- wire
    Wr = R["wire"]
    for k, v in Wr.items():
        f["w_" + k] = v
    f["w_zstd_saving"] = 1 - Wr["zstd"] / Wr["raw"]
    f["w_static_saving"] = 1 - Wr["static_model"] / Wr["raw"]

    # ---- napkin math for the running example
    f["marg_vectors"] = 300e6
    f["marg_raw_gb"] = 300e6 * d * 4 / 1e9
    f["marg_int8_gb"] = 300e6 * d / 1e9
    f["marg_index_bytes"] = 8e9 / 300e6

    # ---- the geometry experiments (experiments/geometry.py); every section's summary under a short prefix
    deg = lambda c: math.degrees(math.acos(c))
    prefix = dict(geo_map="map", geo_nn="nn", geo_dials="dials", geo_pairs="pairs", geo_random="rp", geo_spectrum="sp", geo_walk="walk")
    for sec, pre in prefix.items():
        for k, v in R.get(sec, {}).items():
            if isinstance(v, dict):
                for kk, vv in v.items():
                    f[f"{pre}_{k}_{kk}"] = vv
            else:
                f[f"{pre}_{k}"] = v
    if "geo_map" in R:
        f["map_rest"] = 1 - f["map_var1"] - f["map_var2"]
        f["nn_median_deg"] = deg(f["nn_median_cos"])
        f["nn_tenth_deg"] = deg(f["nn_tenth_median"])
        f["dials_angle"] = deg(f["dials_cos_dirs"])
        f["rp_raw_deg"] = deg(f["rp_raw_mean"])
        f["walk_drop"] = f["walk_lag1"] - f["walk_lag2"]
        f["rp_hub_ratio"] = f["rp_hub_max_raw"] / 10
    # ---- kvdiff: imported plotted values, not a new experiment run
    kv_path = Path(__file__).resolve().parent / "data/lab/kvdiff-v-spectrum.json"
    if kv_path.exists():
        kv = json.loads(kv_path.read_text())
        for k in (8, 32, 64):
            f[f"kv_cv{k}"] = statistics.mean(r[5] for r in kv["transfer"] if r[3] == k and r[4] == 0)
        f["kv_tail32"] = 1 - f["kv_cv32"]
        f["kv_mean23"] = next(r["mean_share"] for r in kv["layer_profile"] if r["layer"] == 23)
        for basis, label in (("own (first half)", "own"), ("other threads", "other")):
            f[f"kv_104_{label}"] = next(r["captured"] for r in kv["temporal"] if r["case_no"] == 104 and r["basis"] == basis)
        rates = []
        for spectrum in kv["spectra"].values():
            target = .05 * sum(spectrum)
            lo, hi = 0., max(spectrum)
            for _ in range(80):
                theta = (lo + hi) / 2
                if sum(min(v, theta) for v in spectrum) > target:
                    hi = theta
                else:
                    lo = theta
            rates.append(.5 * sum(math.log2(v / theta) for v in spectrum if v > theta))
        f["kv_rate5"] = statistics.median(rates)
    return f
