/* Interactive figures for the codebook chapters. Ported from the original "Codebooks that add up" post. */
(function () {
'use strict';
const { C, setup, view, grid, dot, arrow, rgba, mix, mulberry32, gaussFn, draggable, redraws, chip, fmt, esc, reduceMotion } = CE.lib;
const $ = s => document.querySelector(s);

CE.widget('codebook-hero', el => {
  el.innerHTML = `<canvas id="cv-hero" class="drag" style="height:min(62vw,400px)" aria-label="Three small codebooks of arrows. The chosen arrows chain together to approximate a target point."></canvas>
      <div class="readout" id="hero-out">&nbsp;</div>`;
  const cv = $('#cv-hero'), out = $('#hero-out');
  const L = [1.2, 0.6, 0.3], off = [0.3, 1.0, 0.55];
  const cols = () => [C.book, C.cb2, C.dec];
  const books = L.map((l, m) => [0, 1, 2, 3].map(k => { const a = off[m] + k * Math.PI / 2; return [l * Math.cos(a), l * Math.sin(a)]; }));
  const sums = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) sums.push({ code: [i, j, k], p: [books[0][i][0] + books[1][j][0] + books[2][k][0], books[0][i][1] + books[1][j][1] + books[2][k][1]] });
  let tgt = [1.1, 0.75], user = false, V = null;
  function enc(x) { let best = null, be = Infinity; for (const s of sums) { const e = (x[0] - s.p[0]) ** 2 + (x[1] - s.p[1]) ** 2; if (e < be) { be = e; best = s; } } return [best, be]; }
  function draw() {
    const { ctx, w, h } = setup(cv); V = view(w, h, 0, 0, 2.05);
    grid(ctx, V, w, h, 0.5);
    for (const s of sums) dot(ctx, V.X(s.p[0]), V.Y(s.p[1]), 2.3, rgba(C.ink, 0.35));
    const [best, be] = enc(tgt), cl = cols();
    let p = [0, 0];
    for (let m = 0; m < 3; m++) {
      for (let k = 0; k < 4; k++) if (k !== best.code[m]) { const q = [p[0] + books[m][k][0], p[1] + books[m][k][1]]; arrow(ctx, V.X(p[0]), V.Y(p[1]), V.X(q[0]), V.Y(q[1]), rgba(cl[m], 0.22), 1.3, 6); }
      const q = [p[0] + books[m][best.code[m]][0], p[1] + books[m][best.code[m]][1]];
      arrow(ctx, V.X(p[0]), V.Y(p[1]), V.X(q[0]), V.Y(q[1]), cl[m], 3.2, 11); p = q;
    }
    ctx.setLineDash([4, 4]); ctx.strokeStyle = C.res; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(V.X(p[0]), V.Y(p[1])); ctx.lineTo(V.X(tgt[0]), V.Y(tgt[1])); ctx.stroke(); ctx.setLineDash([]);
    dot(ctx, V.X(p[0]), V.Y(p[1]), 5.5, C.bg2, C.dec, 2.5);
    dot(ctx, V.X(tgt[0]), V.Y(tgt[1]), 7.5, C.vec);
    ctx.font = '20px Caveat, cursive'; ctx.fillStyle = C.vec; ctx.fillText('x', V.X(tgt[0]) + 10, V.Y(tgt[1]) - 8);
    ctx.fillStyle = C.dec; ctx.fillText('x̂', V.X(p[0]) - 22, V.Y(p[1]) + 20);
    out.innerHTML = `code = [${chip(best.code[0], cl[0])}, ${chip(best.code[1], cl[1])}, ${chip(best.code[2], cl[2])}] &nbsp;·&nbsp; ${chip('6 bits', C.bits)} &nbsp;·&nbsp; squared error ${chip(be.toFixed(3), C.res)} &nbsp;·&nbsp; 12 stored arrows → 64 reachable points`;
  }
  draggable(cv, () => { user = true; return 1; }, (a, p) => { tgt = V.inv(p[0], p[1]); draw(); });
  redraws.push(draw); draw();
  let t0 = null;
  function loop(t) { if (user) return; if (t0 === null) t0 = t; const s = (t - t0) / 1000; tgt = [1.1 * Math.cos(s * 0.33) + 0.35 * Math.cos(s * 0.9), 0.75 * Math.sin(s * 0.47) + 0.4 * Math.sin(s * 1.1)]; draw(); requestAnimationFrame(loop); }
  if (!reduceMotion) requestAnimationFrame(loop);
});

CE.widget('vq', el => {
  el.innerHTML = `<div class="two">
      <canvas id="cv-vq" style="height:min(70vw,380px)" aria-label="2D points coloured by their nearest centroid."></canvas>
      <div class="side"><canvas id="cv-vq-chart" style="height:min(70vw,380px)" aria-label="Distortion versus bits chart."></canvas></div>
    </div>
    <div class="controls">
      <label for="vq-bits">bits per point <input id="vq-bits" type="range" min="0" max="7" step="1" value="3"></label>
      <span class="mono k-code" id="vq-k"></span>
    </div>
    <div class="readout" id="vq-out">&nbsp;</div>`;
  const cv = $('#cv-vq'), cc = $('#cv-vq-chart'), out = $('#vq-out'), sl = $('#vq-bits'), kl = $('#vq-k');
  const r = mulberry32(11), g = gaussFn(r);
  const cl = [[-1.4, 0.9, 0.5, 0.2, 0.4], [1.2, 1.1, 0.3, 0.6, -0.6], [0, -0.2, 0.7, 0.25, 0.9], [-1.1, -1.3, 0.4, 0.2, 0], [1.5, -1, 0.25, 0.45, 1.2]];
  const pts = [];
  for (let i = 0; i < 900; i++) { const c = cl[i % 5], a = g() * c[2], b = g() * c[3], ca = Math.cos(c[4]), sa = Math.sin(c[4]); pts.push([c[0] + a * ca - b * sa, c[1] + a * sa + b * ca]); }
  function kmeans(K, seed) {
    const rr = mulberry32(seed); const cent = [pts[Math.floor(rr() * pts.length)].slice()]; const d2 = new Float64Array(pts.length).fill(Infinity);
    while (cent.length < K) { const c = cent[cent.length - 1]; let tot = 0; for (let i = 0; i < pts.length; i++) { const e = (pts[i][0] - c[0]) ** 2 + (pts[i][1] - c[1]) ** 2; if (e < d2[i]) d2[i] = e; tot += d2[i]; } let u = rr() * tot, i = 0; for (; i < pts.length - 1; i++) { u -= d2[i]; if (u <= 0) break; } cent.push(pts[i].slice()); }
    const asg = new Int32Array(pts.length); let mse = 0;
    for (let it = 0; it < 30; it++) {
      mse = 0;
      for (let i = 0; i < pts.length; i++) { let b = 0, be = Infinity; for (let k = 0; k < K; k++) { const e = (pts[i][0] - cent[k][0]) ** 2 + (pts[i][1] - cent[k][1]) ** 2; if (e < be) { be = e; b = k; } } asg[i] = b; mse += be; }
      mse /= pts.length;
      const s = cent.map(() => [0, 0, 0]); for (let i = 0; i < pts.length; i++) { s[asg[i]][0] += pts[i][0]; s[asg[i]][1] += pts[i][1]; s[asg[i]][2]++; }
      for (let k = 0; k < K; k++) if (s[k][2]) cent[k] = [s[k][0] / s[k][2], s[k][1] / s[k][2]];
    }
    return { cent, asg, mse, K };
  }
  const res = []; for (let b = 0; b <= 7; b++) res.push(kmeans(1 << b, 100 + b));
  const pal = () => [C.book, C.cb2, C.dec, C.res, C.q, C.bits, C.vec, C.code];
  function draw() {
    const b = +sl.value, R = res[b];
    let { ctx, w, h } = setup(cv); const V = view(w, h, 0.05, -0.1, 2.45);
    grid(ctx, V, w, h, 1);
    const P = pal();
    for (let i = 0; i < pts.length; i++) dot(ctx, V.X(pts[i][0]), V.Y(pts[i][1]), 2, rgba(P[R.asg[i] % 8], 0.65));
    for (const c of R.cent) dot(ctx, V.X(c[0]), V.Y(c[1]), 4.5, C.ink, C.bg2, 2);
    kl.textContent = `K = ${R.K}`;
    out.innerHTML = `${chip(b + ' bits', C.bits)} → codebook of ${chip('K = ' + R.K, C.book)} centroids &nbsp;·&nbsp; mean squared error ${chip(R.mse.toFixed(4), C.res)}${b ? ` &nbsp;·&nbsp; ×${(res[b - 1].mse / R.mse).toFixed(2)} better than ${b - 1} bits` : ''}`;
    ({ ctx, w, h } = setup(cc));
    const pad = { l: 46, r: 14, t: 26, b: 36 };
    const ys = res.map(q => Math.log2(q.mse)), ymax = Math.ceil(Math.max(...ys)), ymin = Math.floor(Math.min(...ys)) - 0.5;
    const X = x => pad.l + x / 7 * (w - pad.l - pad.r), Y = y => pad.t + (ymax - y) / (ymax - ymin) * (h - pad.t - pad.b);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.strokeStyle = rgba(C.ink, 0.08); ctx.lineWidth = 1; ctx.textAlign = 'center';
    for (let x = 0; x <= 7; x++) { ctx.beginPath(); ctx.moveTo(X(x), pad.t); ctx.lineTo(X(x), h - pad.b); ctx.stroke(); ctx.fillText(x, X(x), h - pad.b + 15); }
    ctx.fillText('bits', (pad.l + w - pad.r) / 2, h - 6); ctx.textAlign = 'right';
    for (let y = Math.ceil(ymin); y <= ymax; y++) { ctx.beginPath(); ctx.moveTo(pad.l, Y(y)); ctx.lineTo(w - pad.r, Y(y)); ctx.stroke(); ctx.fillText('2^' + y, pad.l - 6, Y(y) + 4); }
    ctx.textAlign = 'left'; ctx.fillText('error (log scale)', pad.l, 14);
    ctx.setLineDash([5, 5]); ctx.strokeStyle = rgba(C.ink, 0.45); ctx.beginPath(); ctx.moveTo(X(2), Y(ys[4] + 2)); ctx.lineTo(X(7), Y(ys[4] - 3)); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '19px Caveat, cursive'; ctx.fillStyle = C.ink2; ctx.fillText('½ per bit', X(5.1), Y(ys[4] - 1.2) - 10);
    ctx.strokeStyle = C.res; ctx.lineWidth = 2.4; ctx.beginPath(); ys.forEach((y, i) => i ? ctx.lineTo(X(i), Y(y)) : ctx.moveTo(X(i), Y(y))); ctx.stroke();
    ys.forEach((y, i) => dot(ctx, X(i), Y(y), i === b ? 6.5 : 3.5, i === b ? C.vec : C.res));
  }
  sl.addEventListener('input', draw); redraws.push(draw); draw();
});

CE.widget('sum-trick', el => {
  el.innerHTML = `<canvas id="cv-sum" class="drag" style="height:min(78vw,430px)" aria-label="Two codebooks of four arrows and the sixteen sums they generate, over a 2D data cloud."></canvas>
    <div class="controls">
      <span class="seg" role="group" aria-label="Codebook constraint">
        <button class="btn" id="sum-add" aria-pressed="true">Additive: any direction</button>
        <button class="btn" id="sum-prod" aria-pressed="false">Product: A on x, B on y</button>
      </span>
      <button class="btn" id="sum-fit">Fit codebooks</button>
    </div>
    <div class="readout" id="sum-out">&nbsp;</div>`;
  const cv = $('#cv-sum'), out = $('#sum-out'), bAdd = $('#sum-add'), bProd = $('#sum-prod'), bFit = $('#sum-fit');
  const r = mulberry32(5), g = gaussFn(r);
  const th = 0.62, u = [Math.cos(th), Math.sin(th)], v = [-Math.sin(th), Math.cos(th)];
  const pts = [];
  for (let i = 0; i < 480; i++) { const c = [-1.35, -0.15, 1.25][i % 3], off = [0.25, -0.2, 0.15][i % 3]; const a = c + g() * 0.42, b = off + g() * 0.2; pts.push([a * u[0] + b * v[0], a * u[1] + b * v[1]]); }
  let mode = 'add', A, B, V = null; const saved = {}, fitMse = {};
  function encodeAll(A, B) { const asg = []; let mse = 0; for (const p of pts) { let bi = 0, bj = 0, be = Infinity; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const e = (p[0] - A[i][0] - B[j][0]) ** 2 + (p[1] - A[i][1] - B[j][1]) ** 2; if (e < be) { be = e; bi = i; bj = j; } } asg.push([bi, bj]); mse += be; } return { asg, mse: mse / pts.length }; }
  function solve(M, y) { const n = y.length, a = M.map((row, i) => row.concat([y[i]])); for (let c = 0; c < n; c++) { let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i; [a[c], a[p]] = [a[p], a[c]]; for (let i = 0; i < n; i++) if (i !== c) { const f = a[i][c] / a[c][c]; for (let k = c; k <= n; k++) a[i][k] -= f * a[c][k]; } } return a.map((row, i) => row[n] / row[i]); }
  function km1d(vals) { const s = vals.slice().sort((a, b) => a - b); let c = [0.125, 0.375, 0.625, 0.875].map(q => s[Math.floor(q * s.length)]); for (let it = 0; it < 40; it++) { const acc = c.map(() => [0, 0]); for (const x of vals) { let b = 0; for (let k = 1; k < 4; k++) if (Math.abs(x - c[k]) < Math.abs(x - c[b])) b = k; acc[b][0] += x; acc[b][1]++; } c = c.map((cv, k) => acc[k][1] ? acc[k][0] / acc[k][1] : cv); } return c; }
  function fit(md) {
    if (md === 'prod') { A = km1d(pts.map(p => p[0])).map(a => [a, 0]); B = km1d(pts.map(p => p[1])).map(b => [0, b]); }
    else {
      const rr = mulberry32(9); A = [0, 1, 2, 3].map(() => pts[Math.floor(rr() * pts.length)].slice()); B = [0, 1, 2, 3].map(() => [(rr() - 0.5) * 0.4, (rr() - 0.5) * 0.4]);
      for (let it = 0; it < 40; it++) {
        const { asg } = encodeAll(A, B); const G = Array.from({ length: 8 }, () => new Array(8).fill(0)); const rx = new Array(8).fill(0), ry = new Array(8).fill(0);
        asg.forEach(([i, j], n) => { const a = i, b = 4 + j; G[a][a]++; G[b][b]++; G[a][b]++; G[b][a]++; rx[a] += pts[n][0]; rx[b] += pts[n][0]; ry[a] += pts[n][1]; ry[b] += pts[n][1]; });
        for (let k = 0; k < 8; k++) G[k][k] += 1e-3;
        const sx = solve(G.map(r => r.slice()), rx), sy = solve(G.map(r => r.slice()), ry);
        A = [0, 1, 2, 3].map(k => [sx[k], sy[k]]); B = [0, 1, 2, 3].map(k => [sx[4 + k], sy[4 + k]]);
      }
    }
    saved[md] = { A: A.map(a => a.slice()), B: B.map(b => b.slice()) }; fitMse[md] = encodeAll(A, B).mse;
  }
  fit('prod'); fit('add'); A = saved.add.A.map(a => a.slice()); B = saved.add.B.map(b => b.slice());
  function draw() {
    const { ctx, w, h } = setup(cv); V = view(w, h, 0, 0, 2.05); grid(ctx, V, w, h, 0.5);
    const { asg, mse } = encodeAll(A, B);
    ctx.strokeStyle = rgba(C.res, 0.25); ctx.lineWidth = 1; ctx.beginPath();
    asg.forEach(([i, j], n) => { const p = pts[n]; ctx.moveTo(V.X(p[0]), V.Y(p[1])); ctx.lineTo(V.X(A[i][0] + B[j][0]), V.Y(A[i][1] + B[j][1])); }); ctx.stroke();
    for (const p of pts) dot(ctx, V.X(p[0]), V.Y(p[1]), 1.8, rgba(C.vec, 0.75));
    for (const a of A) for (const b of B) dot(ctx, V.X(a[0] + b[0]), V.Y(a[1] + b[1]), 4.2, C.dec, C.bg2, 1.5);
    for (const a of A) { arrow(ctx, V.X(0), V.Y(0), V.X(a[0]), V.Y(a[1]), C.book, 2.6, 10); dot(ctx, V.X(a[0]), V.Y(a[1]), 7, null, rgba(C.book, 0.6), 1.5); }
    for (const b of B) { arrow(ctx, V.X(0), V.Y(0), V.X(b[0]), V.Y(b[1]), C.cb2, 2.6, 10); dot(ctx, V.X(b[0]), V.Y(b[1]), 7, null, rgba(C.cb2, 0.6), 1.5); }
    out.innerHTML = `${chip('A', C.book)}: 4 arrows, ${chip('B', C.cb2)}: 4 arrows → ${chip('16 sums', C.dec)}, ${chip('4 bits', C.bits)} per point &nbsp;·&nbsp; error now ${chip(mse.toFixed(4), C.res)} &nbsp;·&nbsp; best fit: additive ${chip(fitMse.add.toFixed(4), C.dec)}, product ${chip(fitMse.prod.toFixed(4), C.enc)}`;
  }
  draggable(cv, p => { let best = null, bd = 18; A.forEach((a, i) => { const d = Math.hypot(V.X(a[0]) - p[0], V.Y(a[1]) - p[1]); if (d < bd) { bd = d; best = ['A', i]; } }); B.forEach((b, i) => { const d = Math.hypot(V.X(b[0]) - p[0], V.Y(b[1]) - p[1]); if (d < bd) { bd = d; best = ['B', i]; } }); return best; },
    (a, p) => { const q = V.inv(p[0], p[1]); if (a[0] === 'A') A[a[1]] = mode === 'prod' ? [q[0], 0] : q; else B[a[1]] = mode === 'prod' ? [0, q[1]] : q; draw(); });
  function setMode(md) { mode = md; bAdd.setAttribute('aria-pressed', md === 'add'); bProd.setAttribute('aria-pressed', md === 'prod'); A = saved[md].A.map(a => a.slice()); B = saved[md].B.map(b => b.slice()); draw(); }
  bAdd.addEventListener('click', () => setMode('add')); bProd.addEventListener('click', () => setMode('prod'));
  bFit.addEventListener('click', () => { fit(mode); A = saved[mode].A.map(a => a.slice()); B = saved[mode].B.map(b => b.slice()); draw(); });
  redraws.push(draw); draw();
});

CE.widget('rq-greedy', el => {
  el.innerHTML = `<canvas id="cv-rq" class="drag" style="height:min(70vw,390px)" aria-label="Greedy residual path versus the optimal path for a target point."></canvas>
    <div class="controls"><button class="btn" id="rq-new">New codebooks</button></div>
    <div class="readout" id="rq-out">&nbsp;</div>`;
  const cv = $('#cv-rq'), out = $('#rq-out'), bNew = $('#rq-new');
  let seed = 3, books, tgt = [0.55, 0.62], V = null, stats = '';
  function err(x, code) { let p = [0, 0]; code.forEach((k, m) => { p[0] += books[m][k][0]; p[1] += books[m][k][1]; }); return (x[0] - p[0]) ** 2 + (x[1] - p[1]) ** 2; }
  function greedy(x) { let r = x.slice(); const code = []; for (let m = 0; m < 3; m++) { let b = 0, be = Infinity; for (let k = 0; k < 4; k++) { const e = (r[0] - books[m][k][0]) ** 2 + (r[1] - books[m][k][1]) ** 2; if (e < be) { be = e; b = k; } } code.push(b); r = [r[0] - books[m][b][0], r[1] - books[m][b][1]]; } return { code, e: err(x, code) }; }
  function optimal(x) { let best = null, be = Infinity; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) { const e = err(x, [i, j, k]); if (e < be) { be = e; best = [i, j, k]; } } return { code: best, e: be }; }
  function make() {
    const r = mulberry32(seed); const sc = [1.15, 0.7, 0.42];
    books = sc.map(s => [0, 1, 2, 3].map(() => { const a = r() * Math.PI * 2, l = s * (0.65 + 0.35 * r()); return [l * Math.cos(a), l * Math.sin(a)]; }));
    const rr = mulberry32(seed + 99); let same = 0, eg = 0, eo = 0; const N = 4000;
    for (let n = 0; n < N; n++) { const a = rr() * Math.PI * 2, rad = 1.7 * Math.sqrt(rr()), x = [rad * Math.cos(a), rad * Math.sin(a)]; const G = greedy(x), O = optimal(x); eg += G.e; eo += O.e; if (G.e - O.e < 1e-12) same++; }
    stats = `over 4,000 random targets: greedy finds the best code ${chip((100 * same / N).toFixed(0) + '%', C.cb2)} of the time; its average error is ${chip((eg / eo).toFixed(2) + '×', C.res)} the optimum's`;
  }
  function path(ctx, code, col, dashed) { let p = [0, 0]; if (dashed) ctx.setLineDash([6, 5]); code.forEach((k, m) => { const q = [p[0] + books[m][k][0], p[1] + books[m][k][1]]; arrow(ctx, V.X(p[0]), V.Y(p[1]), V.X(q[0]), V.Y(q[1]), col, dashed ? 2.4 : 3.2, 10); p = q; }); ctx.setLineDash([]); return p; }
  function draw() {
    const { ctx, w, h } = setup(cv); V = view(w, h, 0, 0, 2.0); grid(ctx, V, w, h, 0.5);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) { const p = [books[0][i][0] + books[1][j][0] + books[2][k][0], books[0][i][1] + books[1][j][1] + books[2][k][1]]; dot(ctx, V.X(p[0]), V.Y(p[1]), 2.3, rgba(C.ink, 0.3)); }
    const G = greedy(tgt), O = optimal(tgt);
    const po = path(ctx, O.code, C.dec, false), pg = path(ctx, G.code, C.cb2, true);
    dot(ctx, V.X(po[0]), V.Y(po[1]), 5.5, C.bg2, C.dec, 2.5); dot(ctx, V.X(pg[0]), V.Y(pg[1]), 5.5, C.bg2, C.cb2, 2.5); dot(ctx, V.X(tgt[0]), V.Y(tgt[1]), 7.5, C.vec);
    ctx.font = '20px Caveat, cursive'; ctx.fillStyle = C.cb2; ctx.fillText('greedy', V.X(pg[0]) + 10, V.Y(pg[1]) + 4); ctx.fillStyle = C.dec; ctx.fillText('optimal', V.X(po[0]) + 10, V.Y(po[1]) + 20);
    const same = G.code.join() === O.code.join();
    out.innerHTML = `greedy [${G.code}] error ${chip(G.e.toFixed(3), C.cb2)} &nbsp;·&nbsp; optimal [${O.code}] error ${chip(O.e.toFixed(3), C.dec)} &nbsp;·&nbsp; ${same ? 'they agree here' : chip('greedy is ' + (G.e / Math.max(O.e, 1e-9)).toFixed(1) + '× worse here', C.res)}<br>${stats}`;
  }
  draggable(cv, () => 1, (a, p) => { tgt = V.inv(p[0], p[1]); draw(); });
  bNew.addEventListener('click', () => { seed++; make(); draw(); });
  make(); redraws.push(() => { make(); draw(); }); draw();
});

CE.widget('predictive', el => {
  el.innerHTML = `<canvas id="cv-pred" style="height:min(70vw,400px)" aria-label="A 2D sequence coded independently or predictively, with errors drawn."></canvas>
    <div class="controls">
      <label for="pred-rho">locality ρ <input id="pred-rho" type="range" min="0" max="0.98" step="0.02" value="0.9"></label>
      <span class="mono k-res" id="pred-rhov">0.90</span>
      <span class="seg" role="group" aria-label="Coding method">
        <button class="btn" id="pred-ind" aria-pressed="false">Independent VQ</button>
        <button class="btn" id="pred-p" aria-pressed="true">Predictive</button>
      </span>
    </div>
    <div class="readout" id="pred-out">&nbsp;</div>`;
  const cv = $('#cv-pred'), out = $('#pred-out'), sl = $('#pred-rho'), rv = $('#pred-rhov'), bI = $('#pred-ind'), bP = $('#pred-p'); if (!cv) return;
  const K = 16, KEY = 16, T = 120, NTR = 3000;
  const gT = gaussFn(mulberry32(31)), gR = gaussFn(mulberry32(32));
  const epsShow = Array.from({ length: T }, () => [gT(), gT()]), epsTrain = Array.from({ length: NTR }, () => [gR(), gR()]);
  const statPts = Array.from({ length: 3000 }, () => [gR(), gR()]);
  function km(P, K, seed) { const rr = mulberry32(seed); let c = Array.from({ length: K }, () => P[Math.floor(rr() * P.length)].slice()); for (let it = 0; it < 20; it++) { const acc = c.map(() => [0, 0, 0]); for (const p of P) { let b = 0, be = Infinity; for (let k = 0; k < K; k++) { const e = (p[0] - c[k][0]) ** 2 + (p[1] - c[k][1]) ** 2; if (e < be) { be = e; b = k; } } acc[b][0] += p[0]; acc[b][1] += p[1]; acc[b][2]++; } c = c.map((v, k) => acc[k][2] ? [acc[k][0] / acc[k][2], acc[k][1] / acc[k][2]] : v); } return c; }
  const near = (p, c) => { let b = 0, be = Infinity; for (let k = 0; k < c.length; k++) { const e = (p[0] - c[k][0]) ** 2 + (p[1] - c[k][1]) ** 2; if (e < be) { be = e; b = k; } } return c[b]; };
  const Cind = km(statPts, K, 3);
  function seq(eps, rho) { const s = Math.sqrt(1 - rho * rho); const x = [[eps[0][0], eps[0][1]]]; for (let t = 1; t < eps.length; t++) x.push([rho * x[t - 1][0] + s * eps[t][0], rho * x[t - 1][1] + s * eps[t][1]]); return x; }
  function code(X, rho, Cp, predictive) {
    const R = [], E = [], keys = []; let mse = 0;
    for (let t = 0; t < X.length; t++) {
      let xh;
      if (!predictive || t % KEY === 0) { xh = near(X[t], Cind); keys.push(t); }
      else { const pr = [rho * R[t - 1][0], rho * R[t - 1][1]], e = [X[t][0] - pr[0], X[t][1] - pr[1]]; E.push(e); const q = near(e, Cp); xh = [pr[0] + q[0], pr[1] + q[1]]; }
      R.push(xh); mse += (X[t][0] - xh[0]) ** 2 + (X[t][1] - xh[1]) ** 2;
    }
    return { R, E, keys, mse: mse / X.length / 2 };
  }
  let cache = {}, mode = 'p';
  function prep(rho) {
    if (cache.rho === rho) return cache;
    const Xtr = seq(epsTrain, rho);
    let Cp = Cind.map(c => [c[0] * Math.sqrt(1 - rho * rho + 0.02), c[1] * Math.sqrt(1 - rho * rho + 0.02)]);
    for (let it = 0; it < 3; it++) { const r = code(Xtr, rho, Cp, true); Cp = km(r.E, K, 7 + it); }
    const ind = code(Xtr, rho, Cp, false), pre = code(Xtr, rho, Cp, true);
    cache = { rho, Cp, mInd: ind.mse, mPre: pre.mse, Xs: seq(epsShow, rho) };
    return cache;
  }
  function draw() {
    const rho = +sl.value; rv.textContent = rho.toFixed(2); const P = prep(rho);
    const res = code(P.Xs, rho, P.Cp, mode === 'p');
    const { ctx, w, h } = setup(cv); const V = view(w, h, 0, 0, 3.0); grid(ctx, V, w, h, 1);
    ctx.strokeStyle = rgba(C.vec, 0.35); ctx.lineWidth = 1.3; ctx.beginPath(); P.Xs.forEach((p, i) => i ? ctx.lineTo(V.X(p[0]), V.Y(p[1])) : ctx.moveTo(V.X(p[0]), V.Y(p[1]))); ctx.stroke();
    P.Xs.forEach((p, t) => { const r = res.R[t]; ctx.strokeStyle = rgba(C.res, 0.85); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(V.X(p[0]), V.Y(p[1])); ctx.lineTo(V.X(r[0]), V.Y(r[1])); ctx.stroke(); });
    P.Xs.forEach(p => dot(ctx, V.X(p[0]), V.Y(p[1]), 2.4, C.vec));
    res.R.forEach((r, t) => { if (mode === 'p' && t % KEY === 0) { const x = V.X(r[0]), y = V.Y(r[1]); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill(); } else dot(ctx, V.X(r[0]), V.Y(r[1]), 3, C.dec); });
    if (mode === 'i') Cind.forEach(c => dot(ctx, V.X(c[0]), V.Y(c[1]), 4.5, null, rgba(C.book, 0.9), 1.6));
    ctx.font = '20px Caveat, cursive'; ctx.fillStyle = C.ink2; ctx.textAlign = 'left'; ctx.fillText(mode === 'p' ? 'predictive: codebook for the surprise' : 'independent: codebook for the vectors (blue rings)', 12, 24);
    const gain = 1 / (1 - rho * rho), meas = P.mInd / P.mPre;
    out.innerHTML = `ρ = ${chip(rho.toFixed(2), C.res)} &nbsp;·&nbsp; MSE independent ${chip(P.mInd.toFixed(3), C.book)} &nbsp;·&nbsp; predictive ${chip(P.mPre.toFixed(3), C.dec)} &nbsp;·&nbsp; measured gain ${chip('×' + meas.toFixed(2), meas >= 1 ? C.dec : C.res)} &nbsp;·&nbsp; theory 1/(1−ρ²) = ${chip('×' + gain.toFixed(2), C.vec)} <span style="color:var(--muted)">(theory ignores keyframes and quantization noise fed back)</span>`;
  }
  sl.addEventListener('input', draw);
  bI.addEventListener('click', () => { mode = 'i'; bI.setAttribute('aria-pressed', 'true'); bP.setAttribute('aria-pressed', 'false'); draw(); });
  bP.addEventListener('click', () => { mode = 'p'; bP.setAttribute('aria-pressed', 'true'); bI.setAttribute('aria-pressed', 'false'); draw(); });
  redraws.push(draw); draw();
});

})();
