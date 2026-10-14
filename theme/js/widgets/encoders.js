/* Interactive figures for the encoder chapters (beam search, ICM, the encoder lab). Ported from the original "Codebooks that add up" post. */
(function () {
'use strict';
const { C, setup, view, grid, dot, arrow, rgba, mix, mulberry32, gaussFn, draggable, redraws, chip, fmt, esc, reduceMotion } = CE.lib;
const $ = s => document.querySelector(s);

/* shared toy problem: d = 8, M = 4 codebooks of K = 16 */
const LAB = { d: 8, M: 4, K: 16, N: 120 };
const lab = { rho: 0.6, seed: 21, P: null, sel: 0, listeners: [], selListeners: [] };
function pwi(m, n, k, l) { return ((m * LAB.M + n) * LAB.K + k) * LAB.K + l; }
function makeProblem(rho, seed) {
  const noise = 0.35;
  const { d, M, K, N } = LAB, r = mulberry32(seed), g = gaussFn(r);
  const scales = [1, 0.8, 0.64, 0.5]; const CB = [];
  for (let m = 0; m < M; m++) { const book = []; for (let k = 0; k < K; k++) { const blk = Array.from({ length: d }, (_, i) => (Math.floor(i / 2) === m ? g() / Math.SQRT2 : 0)); const free = Array.from({ length: d }, () => g() / Math.sqrt(d)); book.push(blk.map((b, i) => scales[m] * (Math.sqrt(1 - rho) * b + Math.sqrt(rho) * free[i]))); } CB.push(book); }
  const dotp = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const PW = new Float64Array(M * M * K * K);
  for (let m = 0; m < M; m++) for (let n = 0; n < M; n++) if (m !== n) for (let k = 0; k < K; k++) for (let l = 0; l < K; l++) PW[((m * M + n) * K + k) * K + l] = 2 * dotp(CB[m][k], CB[n][l]);
  const UN = [], XX = [];
  for (let t = 0; t < N; t++) { const x = new Array(d).fill(0); for (let m = 0; m < M; m++) { const c = CB[m][Math.floor(r() * K)]; for (let i = 0; i < d; i++) x[i] += c[i]; } for (let i = 0; i < d; i++) x[i] += g() * noise; const u = new Float64Array(M * K); for (let m = 0; m < M; m++) for (let k = 0; k < K; k++) u[m * K + k] = dotp(CB[m][k], CB[m][k]) - 2 * dotp(x, CB[m][k]); UN.push(u); XX.push(dotp(x, x)); }
  const P = { PW, UN, XX, opt: [] }; for (let t = 0; t < N; t++) P.opt.push(exhaustive(P, t)); return P;
}
function energy(P, t, code) { const { M, K } = LAB, u = P.UN[t]; let e = P.XX[t]; for (let m = 0; m < M; m++) { e += u[m * K + code[m]]; for (let n = m + 1; n < M; n++) e += P.PW[pwi(m, n, code[m], code[n])]; } return e; }
function exhaustive(P, t) {
  const K = LAB.K, u = P.UN[t], W = P.PW; let best = Infinity, bc = null;
  for (let a = 0; a < K; a++) { const e0 = P.XX[t] + u[a]; for (let b = 0; b < K; b++) { const e1 = e0 + u[K + b] + W[pwi(0, 1, a, b)]; for (let c = 0; c < K; c++) { const e2 = e1 + u[2 * K + c] + W[pwi(0, 2, a, c)] + W[pwi(1, 2, b, c)]; for (let d = 0; d < K; d++) { const e3 = e2 + u[3 * K + d] + W[pwi(0, 3, a, d)] + W[pwi(1, 3, b, d)] + W[pwi(2, 3, c, d)]; if (e3 < best) { best = e3; bc = [a, b, c, d]; } } } } }
  return { code: bc, e: best, cost: K + K * K * 2 + K ** 3 * 3 + K ** 4 * 4 };
}
function beam(P, t, B, record) {
  const { M, K } = LAB, u = P.UN[t]; let states = [{ code: [], e: P.XX[t] }]; let cost = 0; const stages = [];
  for (let m = 0; m < M; m++) {
    const cand = [];
    states.forEach((s, si) => { for (let k = 0; k < K; k++) { let e = s.e + u[m * K + k]; for (let j = 0; j < m; j++) e += P.PW[pwi(j, m, s.code[j], k)]; cost += 1 + m; cand.push({ code: s.code.concat([k]), e, parent: si, k }); } });
    const kept = cand.slice().sort((a, b) => a.e - b.e).slice(0, B);
    if (record) stages.push({ cand, kept: new Set(kept), parents: states });
    states = kept;
  }
  return { code: states[0].code, e: states[0].e, cost, stages };
}
function condE(P, t, code, m, k) { const { M, K } = LAB; let e = P.UN[t][m * K + k]; for (let j = 0; j < M; j++) if (j !== m) e += P.PW[pwi(j, m, code[j], k)]; return e; }
function icm(P, t, code, T) { const { M, K } = LAB; code = code.slice(); let cost = 0; for (let it = 0; it < T; it++) { let changed = false; for (let m = 0; m < M; m++) { let b = code[m], be = Infinity; for (let k = 0; k < K; k++) { const e = condE(P, t, code, m, k); if (e < be) { be = e; b = k; } } cost += K * M; if (b !== code[m]) { code[m] = b; changed = true; } } if (!changed) break; } return { code, e: energy(P, t, code), cost }; }
function icmRestarts(P, t, R, T, rr) { const g0 = beam(P, t, 1, false); let cur = icm(P, t, g0.code, T); let cost = g0.cost + cur.cost; for (let r = 0; r < R; r++) { const c = cur.code.slice(); const m1 = Math.floor(rr() * 4); let m2 = Math.floor(rr() * 3); if (m2 >= m1) m2++; c[m1] = Math.floor(rr() * LAB.K); c[m2] = Math.floor(rr() * LAB.K); const res = icm(P, t, c, T); cost += res.cost; if (res.e < cur.e) cur = { code: res.code, e: res.e }; } return { code: cur.code, e: cur.e, cost }; }
function rebuildLab() {
  lab.P = makeProblem(lab.rho, lab.seed); const P = lab.P; lab.sel = 0;
  for (let t = 0; t < LAB.N; t++) { const o = P.opt[t].e, g = beam(P, t, 1, false), i = icm(P, t, g.code, 20), b3 = beam(P, t, 3, false), b8 = beam(P, t, 8, false); if (i.e > o * 1.05 && b3.e > o + 1e-9 && b8.e < o + 1e-9) { lab.sel = t; break; } }
  lab.listeners.forEach(f => f());
}
let labT = null;
function joinLab() { if (lab.P) lab.listeners.forEach(f => f()); else { clearTimeout(labT); labT = setTimeout(rebuildLab, 30); } }

CE.widget('beam', el => {
  el.innerHTML = `<canvas id="cv-beam" style="height:min(80vw,400px)" aria-label="Beam search candidates at each stage, plotted by partial error."></canvas>
    <div class="controls">
      <label for="beam-b">beam width B <input id="beam-b" type="range" min="1" max="8" step="1" value="3"></label>
      <span class="mono k-enc" id="beam-bv">B = 3</span>
      <button class="btn" id="beam-next">Another vector</button>
    </div>
    <div class="readout" id="beam-out">&nbsp;</div>`;
  const cv = $('#cv-beam'), out = $('#beam-out'), sl = $('#beam-b'), bv = $('#beam-bv'), bn = $('#beam-next');
  function draw() {
    if (!lab.P) return;
    const P = lab.P, t = lab.sel, B = +sl.value, opt = P.opt[t]; const res = beam(P, t, B, true); bv.textContent = 'B = ' + B;
    const { ctx, w, h } = setup(cv); const pad = { l: 56, r: 18, t: 26, b: 34 };
    let emax = P.XX[t]; res.stages.forEach(s => s.cand.forEach(c => { if (c.e > emax) emax = c.e; })); const emin = Math.min(opt.e, 0); emax *= 1.04;
    const colW = (w - pad.l - pad.r) / 4.6, sx = m => pad.l + 0.3 * colW + m * colW, Y = e => pad.t + (emax - e) / (emax - emin) * (h - pad.t - pad.b);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.textAlign = 'center';
    ['start', 'codebook 1', 'codebook 2', 'codebook 3', 'codebook 4'].forEach((s, i) => ctx.fillText(s, sx(i) + (i ? colW * 0.32 : 0), h - 10));
    ctx.textAlign = 'right'; ctx.strokeStyle = rgba(C.ink, 0.07); ctx.lineWidth = 1;
    const step = Math.pow(10, Math.floor(Math.log10(emax / 3)));
    for (let e = 0; e <= emax; e += step) { ctx.beginPath(); ctx.moveTo(pad.l, Y(e)); ctx.lineTo(w - pad.r, Y(e)); ctx.stroke(); ctx.fillText(e.toFixed(step < 1 ? 1 : 0), pad.l - 6, Y(e) + 4); }
    ctx.save(); ctx.translate(14, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('squared error of partial sum', 0, 0); ctx.restore();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = rgba(C.ink, 0.75); ctx.beginPath(); ctx.moveTo(pad.l, Y(opt.e)); ctx.lineTo(w - pad.r, Y(opt.e)); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'left'; ctx.font = '19px Caveat, cursive'; ctx.fillStyle = C.ink; ctx.fillText('true optimum', pad.l + 4, Y(opt.e) - 6);
    let prevPos = [[sx(0), Y(P.XX[t])]]; dot(ctx, prevPos[0][0], prevPos[0][1], 5, C.dec);
    res.stages.forEach((st, m) => {
      const nP = st.parents.length;
      const pos = st.cand.map(c => [sx(m + 1) + (c.parent / Math.max(1, nP)) * colW * 0.62 + (c.k / LAB.K) * colW * 0.62 / Math.max(1, nP), Y(c.e)]);
      st.cand.forEach((c, i) => { if (!st.kept.has(c)) dot(ctx, pos[i][0], pos[i][1], 2.1, rgba(C.enc, 0.35)); });
      st.cand.forEach((c, i) => { if (st.kept.has(c)) { const pp = prevPos[c.parent]; ctx.strokeStyle = rgba(C.dec, 0.6); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(pp[0], pp[1]); ctx.lineTo(pos[i][0], pos[i][1]); ctx.stroke(); } });
      const newPrev = []; [...st.kept].forEach(c => { const i = st.cand.indexOf(c); newPrev.push(pos[i]); dot(ctx, pos[i][0], pos[i][1], 4.2, C.dec); }); prevPos = newPrev;
    });
    dot(ctx, prevPos[0][0], prevPos[0][1], 7.5, null, C.vec, 2.5);
    const ex = (res.e - opt.e) / opt.e * 100;
    out.innerHTML = `vector #${t + 1} &nbsp;·&nbsp; beam ${chip('B = ' + B, C.enc)} ends at error ${chip(res.e.toFixed(3), C.dec)} &nbsp;·&nbsp; optimum ${opt.e.toFixed(3)} &nbsp;·&nbsp; ${ex < 1e-6 ? chip('found the optimum', C.dec) : chip(ex.toFixed(1) + '% above optimum', C.res)} &nbsp;·&nbsp; ${res.cost.toLocaleString()} lookups`;
  }
  sl.addEventListener('input', draw);
  bn.addEventListener('click', () => { lab.sel = (lab.sel + 1) % LAB.N; lab.selListeners.forEach(f => f()); });
  lab.listeners.push(draw); lab.selListeners.push(draw); redraws.push(draw);
  joinLab();
});

CE.widget('icm', el => {
  el.innerHTML = `<div class="two">
      <canvas id="cv-icm" style="height:min(64vw,300px)" aria-label="Grid of conditional costs per codebook entry."></canvas>
      <div class="side"><canvas id="cv-icm-trace" style="height:min(64vw,300px)" aria-label="Error trace over ICM steps."></canvas></div>
    </div>
    <div class="controls">
      <button class="btn" id="icm-step">Update next row</button>
      <button class="btn" id="icm-run">Run until stuck</button>
      <button class="btn" id="icm-kick">Perturb 2 rows</button>
      <button class="btn" id="icm-reset">Reset to greedy</button>
    </div>
    <div class="readout" id="icm-out">&nbsp;</div>`;
  const cv = $('#cv-icm'), ct = $('#cv-icm-trace'), out = $('#icm-out');
  const st = { code: null, next: 0, trace: [], t: -1, rr: mulberry32(77), msg: '' };
  function reset() { const P = lab.P; st.t = lab.sel; st.code = beam(P, st.t, 1, false).code; st.next = 0; st.trace = [energy(P, st.t, st.code)]; st.msg = 'starting from the greedy (RQ) code'; }
  function step() { const P = lab.P, m = st.next; let b = st.code[m], be = Infinity; for (let k = 0; k < LAB.K; k++) { const e = condE(P, st.t, st.code, m, k); if (e < be) { be = e; b = k; } } const changed = b !== st.code[m]; st.code[m] = b; st.next = (m + 1) % LAB.M; st.trace.push(energy(P, st.t, st.code)); return changed; }
  function stuck() { const P = lab.P; for (let m = 0; m < LAB.M; m++) { const cur = condE(P, st.t, st.code, m, st.code[m]); for (let k = 0; k < LAB.K; k++) if (condE(P, st.t, st.code, m, k) < cur - 1e-12) return false; } return true; }
  function draw() {
    if (!lab.P) return; if (st.t !== lab.sel || !st.code) reset();
    const P = lab.P, opt = P.opt[st.t];
    let { ctx, w, h } = setup(cv);
    const padL = 92, padT = 30, padB = 12, padR = 14, cw = (w - padL - padR) / LAB.K, chh = Math.min(48, (h - padT - padB) / LAB.M);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = C.faint;
    for (let k = 0; k < LAB.K; k++) if (cw > 18 || k % 3 === 0) ctx.fillText(k, padL + (k + 0.5) * cw, padT - 10);
    for (let m = 0; m < LAB.M; m++) {
      const y = padT + m * chh; const vals = []; for (let k = 0; k < LAB.K; k++) vals.push(condE(P, st.t, st.code, m, k));
      const lo = Math.min(...vals), hi = Math.max(...vals);
      ctx.textAlign = 'left'; ctx.fillStyle = m === st.next ? C.enc : C.muted; ctx.fillText((m === st.next ? '▸ ' : '  ') + 'book ' + (m + 1), 6, y + chh / 2 + 4);
      vals.forEach((v, k) => { const q = 1 - (v - lo) / Math.max(1e-9, hi - lo); ctx.fillStyle = rgba(C.book, 0.06 + 0.88 * q * q); ctx.fillRect(padL + k * cw + 1, y + 2, cw - 2, chh - 4); if (v === lo) dot(ctx, padL + (k + 0.5) * cw, y + chh / 2, 2.6, C.ink); });
      ctx.strokeStyle = C.vec; ctx.lineWidth = 2.4; ctx.strokeRect(padL + st.code[m] * cw + 1, y + 2, cw - 2, chh - 4);
    }
    ({ ctx, w, h } = setup(ct));
    const pl = 48, pr = 12, pt = 22, pb = 26, tr = st.trace, emax = Math.max(...tr) * 1.02, emin = Math.min(opt.e, ...tr) * 0.96, n = Math.max(8, tr.length - 1);
    const X = i => pl + i / n * (w - pl - pr), Y = e => pt + (emax - e) / (emax - emin) * (h - pt - pb);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText('error after each update', pl, 13);
    ctx.textAlign = 'right'; ctx.fillText(emax.toFixed(2), pl - 5, pt + 4); ctx.fillText(emin.toFixed(2), pl - 5, h - pb + 4);
    ctx.textAlign = 'center'; ctx.fillText('updates', (pl + w - pr) / 2, h - 6);
    ctx.setLineDash([5, 5]); ctx.strokeStyle = rgba(C.ink, 0.75); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pl, Y(opt.e)); ctx.lineTo(w - pr, Y(opt.e)); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'left'; ctx.font = '18px Caveat, cursive'; ctx.fillStyle = C.ink; ctx.fillText('optimum', pl + 4, Y(opt.e) - 5);
    ctx.strokeStyle = C.enc; ctx.lineWidth = 2.2; ctx.beginPath(); tr.forEach((e, i) => i ? ctx.lineTo(X(i), Y(e)) : ctx.moveTo(X(i), Y(e))); ctx.stroke();
    dot(ctx, X(tr.length - 1), Y(tr[tr.length - 1]), 4.5, C.vec);
    const cur = tr[tr.length - 1], isOpt = cur - opt.e < 1e-9, isStuck = stuck();
    out.innerHTML = `vector #${st.t + 1} &nbsp;·&nbsp; code [${st.code}] &nbsp;·&nbsp; error ${chip(cur.toFixed(3), C.enc)} (optimum ${opt.e.toFixed(3)}) &nbsp;·&nbsp; ${isOpt ? chip('at the global optimum', C.dec) : isStuck ? chip('stuck: no single change helps. Try a perturbation', C.res) : 'still improving'}${st.msg ? ' &nbsp;·&nbsp; ' + st.msg : ''}`;
  }
  $('#icm-step').addEventListener('click', () => { st.msg = ''; step(); draw(); });
  $('#icm-run').addEventListener('click', () => { let quiet = 0, n = 0; st.msg = ''; while (n < 60 && quiet < LAB.M) { quiet = step() ? 0 : quiet + 1; n++; } draw(); });
  $('#icm-kick').addEventListener('click', () => { const m1 = Math.floor(st.rr() * 4); let m2 = Math.floor(st.rr() * 3); if (m2 >= m1) m2++; st.code[m1] = Math.floor(st.rr() * LAB.K); st.code[m2] = Math.floor(st.rr() * LAB.K); st.trace.push(energy(lab.P, st.t, st.code)); st.msg = `randomized books ${m1 + 1} and ${m2 + 1}`; draw(); });
  $('#icm-reset').addEventListener('click', () => { reset(); draw(); });
  lab.listeners.push(() => { st.t = -1; draw(); }); lab.selListeners.push(draw); redraws.push(draw);
  joinLab();
});

CE.widget('encoder-lab', el => {
  el.innerHTML = `<canvas id="cv-lab" style="height:min(80vw,420px)" aria-label="Excess error versus compute for greedy, beam search, ICM, ICM with restarts, and exhaustive search."></canvas>
    <div class="controls">
      <label for="lab-rho">codebook overlap <input id="lab-rho" type="range" min="0" max="1" step="0.1" value="0.6"></label>
      <span class="mono k-enc" id="lab-rhov">0.6</span>
      <button class="btn" id="lab-seed">New codebooks</button>
    </div>
    <div class="readout" id="lab-out">&nbsp;</div>`;
  const cv = $('#cv-lab'), out = $('#lab-out'), sl = $('#lab-rho'), rv = $('#lab-rhov'), bs = $('#lab-seed');
  let series = [], exh = null, hover = null, pts = [];
  function compute() {
    const P = lab.P, N = LAB.N;
    const agg = run => { let ex = 0, cost = 0, hit = 0; for (let t = 0; t < N; t++) { const r = run(t), o = P.opt[t]; ex += (r.e - o.e) / o.e * 100; cost += r.cost; if (r.e - o.e < 1e-9) hit++; } return { ex: ex / N, cost: cost / N, hit: hit / N * 100 }; };
    const beamS = [1, 2, 4, 8, 16, 32, 64].map(B => Object.assign(agg(t => beam(P, t, B, false)), { label: B === 1 ? 'greedy (B=1)' : 'B=' + B }));
    const icmS = [1, 2, 4, 8].map(T => Object.assign(agg(t => { const g = beam(P, t, 1, false); const r = icm(P, t, g.code, T); return { e: r.e, cost: g.cost + r.cost }; }), { label: T + (T > 1 ? ' sweeps' : ' sweep') }));
    const rr = mulberry32(5);
    const rsS = [2, 4, 8, 16, 32].map(R => Object.assign(agg(t => icmRestarts(P, t, R, 3, rr)), { label: R + ' restarts' }));
    series = [{ name: 'Beam search', ck: 'dec', pts: beamS }, { name: 'ICM from greedy', ck: 'enc', pts: icmS }, { name: 'ICM + perturb/restart (LSQ-style)', ck: 'q', pts: rsS }];
    exh = { cost: P.opt[0].cost, ex: 0, hit: 100, label: 'exhaustive' };
  }
  function draw() {
    if (!series.length) return;
    const { ctx, w, h } = setup(cv); const pad = { l: 54, r: 22, t: 44, b: 42 }, lx0 = 1, lx1 = 6;
    let ymax = 0; series.forEach(s => s.pts.forEach(p => { if (p.ex > ymax) ymax = p.ex; })); ymax = Math.max(1, ymax * 1.12);
    const X = c => pad.l + (Math.log10(c) - lx0) / (lx1 - lx0) * (w - pad.l - pad.r), Y = e => pad.t + (ymax - e) / ymax * (h - pad.t - pad.b);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.strokeStyle = rgba(C.ink, 0.07); ctx.lineWidth = 1; ctx.textAlign = 'center';
    for (let e = lx0; e <= lx1; e++) { ctx.beginPath(); ctx.moveTo(X(10 ** e), pad.t); ctx.lineTo(X(10 ** e), h - pad.b); ctx.stroke(); ctx.fillText('10' + '⁰¹²³⁴⁵⁶'[e], X(10 ** e), h - pad.b + 16); }
    ctx.fillText('table lookups per vector (log scale)', (pad.l + w - pad.r) / 2, h - 8); ctx.textAlign = 'right';
    const ystep = ymax > 40 ? 10 : ymax > 16 ? 5 : ymax > 6 ? 2 : 1;
    for (let e = 0; e <= ymax; e += ystep) { ctx.beginPath(); ctx.moveTo(pad.l, Y(e)); ctx.lineTo(w - pad.r, Y(e)); ctx.stroke(); ctx.fillText(e + '%', pad.l - 6, Y(e) + 4); }
    ctx.textAlign = 'left'; ctx.fillText('average error above the optimum', pad.l, 16);
    let lx = pad.l; const ly = 34; series.forEach(s => { dot(ctx, lx + 5, ly - 4, 4.5, C[s.ck]); ctx.fillStyle = C.ink; ctx.fillText(s.name, lx + 14, ly); lx += ctx.measureText(s.name).width + 34; });
    pts = [];
    series.forEach(s => { const col = C[s.ck]; ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.beginPath(); s.pts.forEach((p, i) => { const x = X(p.cost), y = Y(p.ex); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); s.pts.forEach(p => { const x = X(p.cost), y = Y(p.ex); dot(ctx, x, y, 4.2, col, C.bg2, 1.5); pts.push({ x, y, p, s }); }); });
    const ex = X(exh.cost), ey = Y(0); dot(ctx, ex, ey, 6.5, C.ink, C.bg2, 2); pts.push({ x: ex, y: ey, p: exh, s: { name: 'Exhaustive' } });
    ctx.font = '19px Caveat, cursive'; ctx.fillStyle = C.ink; ctx.textAlign = 'right'; ctx.fillText('exhaustive: 65,536 codes', ex - 10, ey - 30);
    const g = series[0].pts[0]; ctx.textAlign = 'left'; ctx.fillStyle = C.dec; ctx.fillText('greedy RQ', X(g.cost) + 8, Y(g.ex) - 8);
    if (hover) {
      const { x, y, p, s } = hover; dot(ctx, x, y, 7.5, null, C.vec, 2.2);
      const lines = [`${s.name}: ${p.label}`, `${Math.round(p.cost).toLocaleString()} lookups`, `${p.ex.toFixed(2)}% above optimum`, `optimal on ${p.hit.toFixed(0)}% of vectors`];
      ctx.font = '11px "JetBrains Mono", monospace'; const tw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16, th = lines.length * 16 + 10;
      let tx = x + 12, ty = y - th - 8; if (tx + tw > w - 4) tx = x - tw - 12; if (ty < 4) ty = y + 12;
      ctx.fillStyle = rgba(C.bg3, 0.97); ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.fillRect(tx, ty, tw, th); ctx.strokeRect(tx, ty, tw, th);
      ctx.fillStyle = C.ink; ctx.textAlign = 'left'; lines.forEach((l, i) => ctx.fillText(l, tx + 8, ty + 18 + i * 16));
    }
    const b8 = series[0].pts[3], r8 = series[2].pts[2], gr = series[0].pts[0];
    out.innerHTML = `overlap ${chip(lab.rho.toFixed(1), C.enc)} &nbsp;·&nbsp; greedy: ${chip(gr.ex.toFixed(1) + '%', C.dec)} above optimum, optimal on ${gr.hit.toFixed(0)}% &nbsp;·&nbsp; beam 8: ${chip(b8.ex.toFixed(1) + '%', C.dec)}, optimal on ${b8.hit.toFixed(0)}% &nbsp;·&nbsp; ICM + 8 restarts: ${chip(r8.ex.toFixed(1) + '%', C.q)}, optimal on ${r8.hit.toFixed(0)}% &nbsp;·&nbsp; <span style="color:var(--muted)">hover points for details</span>`;
  }
  cv.style.touchAction = 'pan-y';
  cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; let best = null, bd = 22; pts.forEach(q => { const d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = q; } }); if (best !== hover) { hover = best; draw(); } });
  cv.addEventListener('pointerleave', () => { hover = null; draw(); });
  function recompute() { out.innerHTML = '<span style="color:var(--muted)">computing 120 exhaustive searches…</span>'; setTimeout(rebuildLab, 30); }
  sl.addEventListener('input', () => { rv.textContent = (+sl.value).toFixed(1); });
  sl.addEventListener('change', () => { lab.rho = +sl.value; recompute(); });
  bs.addEventListener('click', () => { lab.seed += 1; recompute(); });
  lab.listeners.unshift(() => { compute(); hover = null; draw(); }); redraws.push(draw);
  joinLab();
});

})();
