/* Small mathematical playgrounds: nothing here uses measured data, everything is computed live. */
(function () {
'use strict';
const L = CE.lib, { C, chip, plot, hover, legend, setup, view, grid, dot, arrow, rgba, mulberry32, gaussFn, draggable, redraws, num } = L;
const V = k => `var(--${k})`;
const pct = (v, n) => (v * 100).toFixed(n == null ? 0 : n) + '%';
const mk = (el, h) => { el.innerHTML = h; return id => el.querySelector(id); };
const normal = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

/* ---------- distances concentrate in high dimensions ---------- */
CE.widget('dim-curse', el => {
  const q = mk(el, '<div class="chart-title">Distances from one query to 2,000 random points</div><div class="chart-sub">points drawn uniformly on the unit sphere in d dimensions · histogram of Euclidean distance to the query</div><div class="chartwrap"></div><div class="controls"><label>dimensions d <input type="range" id="dc-d" min="1" max="10" step="0.25" value="1"></label><output id="dc-v"></output><span class="seg"><button class="btn" data-d="1">2</button><button class="btn" data-d="3.32">10</button><button class="btn" data-d="6.64">100</button><button class="btn" data-d="9.58">768</button></span></div><div class="readout"></div>');
  const host = q('.chartwrap'), sl = q('#dc-d');
  function draw() {
    const d = Math.max(2, Math.round(Math.pow(2, +sl.value))), r = mulberry32(7 + d), g = gaussFn(r), n = 2000;
    q('#dc-v').textContent = 'd = ' + d;
    const unit = () => { const v = new Float64Array(d); let s = 0; for (let i = 0; i < d; i++) { v[i] = g(); s += v[i] * v[i]; } s = Math.sqrt(s); for (let i = 0; i < d; i++) v[i] /= s; return v; };
    const qv = unit(), dist = [];
    for (let k = 0; k < n; k++) { const v = unit(); let s = 0; for (let i = 0; i < d; i++) s += (v[i] - qv[i]) ** 2; dist.push(Math.sqrt(s)); }
    const nb = 60, h = new Array(nb).fill(0); dist.forEach(x => h[Math.min(nb - 1, Math.floor(x / 2 * nb))]++);
    const ymax = Math.max(...h) * 1.15;
    const P = plot(host, { w: 900, h: 300, pad: { l: 46, r: 16, t: 22, b: 44 }, x: { min: 0, max: 2, ticks: [0, 0.5, 1, 1.414, 2], fmt: v => (v === 1.414 ? '√2' : v), label: 'distance to the query (0 = identical, 2 = opposite)' }, y: { min: 0, max: ymax, ticks: [], label: 'number of points' } });
    const bw = P.X(2 / nb) - P.X(0);
    h.forEach((v, i) => { if (v) P.add(`<rect x="${(P.X(i * 2 / nb) + 0.5).toFixed(1)}" y="${P.Y(v).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${(P.Y(0) - P.Y(v)).toFixed(1)}" rx="1.5" fill="${V('k-q')}"/>`); });
    const mn = Math.min(...dist), mx = Math.max(...dist);
    [[mn, 'nearest', 'k-dec', 'end'], [mx, 'farthest', 'k-res', 'start']].forEach(([v, t, c, a]) => P.add(`<line x1="${P.X(v)}" x2="${P.X(v)}" y1="${P.p.t}" y2="${P.Y(0)}" stroke="${V(c)}" stroke-width="2"/><text x="${P.X(v) + (a === 'end' ? -6 : 6)}" y="${P.p.t + 12}" text-anchor="${a}" style="fill:${V(c)}">${t} ${v.toFixed(2)}</text>`));
    P.done();
    q('.readout').innerHTML = `d = ${chip(d, C.q)} · nearest ${chip(mn.toFixed(3), C.dec)} · farthest ${chip(mx.toFixed(3), C.res)} · farthest is ${chip((mx / Math.max(mn, 1e-6)).toFixed(mx / mn > 20 ? 0 : 2) + '×', C.vec)} the nearest ${d >= 100 ? '<span class="dim">· almost everything sits at √2: every random point is nearly perpendicular to the query</span>' : '<span class="dim">· in low dimensions "near" and "far" are very different things</span>'}`;
  }
  sl.addEventListener('input', draw); el.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { sl.value = b.dataset.d; draw(); })); draw();
});

/* ---------- scalar quantizer on a bell curve ---------- */
CE.widget('scalar-quant', el => {
  const q = mk(el, '<div class="chart-title">Rounding one coordinate to 2ᵇ levels</div><div class="chart-sub">curve: the coordinate\'s distribution (σ = 1) · ticks: reproduction levels · shaded: what is clipped</div><div class="chartwrap"></div><div class="controls"><label>bits b <input type="range" id="sq-b" min="1" max="8" step="1" value="3"></label><output id="sq-bv"></output><label>clip at ±c·σ <input type="range" id="sq-c" min="0.6" max="5" step="0.1" value="2.2"></label><output id="sq-cv"></output><button class="btn" id="sq-best">best c for this b</button></div><div class="readout"></div>');
  const host = q('.chartwrap'), sb = q('#sq-b'), sc = q('#sq-c');
  function stats(b, c) { // uniform quantizer with 2^b cells on [-c, c]; numerically integrate
    const n = 1 << b, step = 2 * c / n; let mse = 0, H = 0; const P = [];
    for (let i = 0; i < n; i++) { const lo = i === 0 ? -9 : -c + i * step, hi = i === n - 1 ? 9 : -c + (i + 1) * step, rep = -c + (i + 0.5) * step; let p = 0, e = 0; const m = 60; for (let k = 0; k < m; k++) { const x = lo + (k + 0.5) * (hi - lo) / m, w = normal(x) * (hi - lo) / m; p += w; e += w * (x - rep) ** 2; } mse += e; P.push(p); if (p > 1e-12) H -= p * Math.log2(p); }
    return { mse, H, step, n };
  }
  function best(b) { let bc = 1, bm = 9; for (let c = 0.6; c <= 5; c += 0.05) { const m = stats(b, c).mse; if (m < bm) { bm = m; bc = c; } } return bc; }
  function draw() {
    const b = +sb.value, c = +sc.value, S = stats(b, c); q('#sq-bv').textContent = b + ' bits · ' + S.n + ' levels'; q('#sq-cv').textContent = '±' + c.toFixed(1) + 'σ';
    const P = plot(host, { w: 900, h: 280, pad: { l: 20, r: 16, t: 14, b: 40 }, x: { min: -5, max: 5, ticks: [-4, -3, -2, -1, 0, 1, 2, 3, 4], fmt: v => v + 'σ', label: 'value of the coordinate' }, y: { min: 0, max: 0.44, ticks: [] } });
    const curve = []; for (let x = -5; x <= 5.001; x += 0.05) curve.push([x, normal(x)]);
    const area = (a, z, col, op) => { const pts = curve.filter(p => p[0] >= a && p[0] <= z); if (pts.length < 2) return; P.add(`<polygon points="${P.X(pts[0][0])},${P.Y(0)} ${pts.map(p => `${P.X(p[0]).toFixed(1)},${P.Y(p[1]).toFixed(1)}`).join(' ')} ${P.X(pts[pts.length - 1][0])},${P.Y(0)}" fill="${col}" opacity="${op}"/>`); };
    area(-5, -c, V('k-res'), 0.45); area(c, 5, V('k-res'), 0.45); area(-c, c, V('k-book'), 0.14);
    if (S.n <= 64) for (let i = 0; i <= S.n; i++) { const x = -c + i * S.step; P.add(`<line x1="${P.X(x)}" x2="${P.X(x)}" y1="${P.Y(0)}" y2="${P.Y(normal(x))}" stroke="${V('k-book')}" stroke-width="1" opacity=".7"/>`); }
    if (S.n <= 64) for (let i = 0; i < S.n; i++) { const x = -c + (i + 0.5) * S.step; P.add(`<circle cx="${P.X(x)}" cy="${P.Y(0)}" r="${S.n > 32 ? 2 : 3.5}" fill="${V('k-dec')}"/>`); }
    P.line(curve, V('k-vec'), 2.4); P.done();
    const snr = 10 * Math.log10(1 / S.mse), prev = b > 1 ? stats(b - 1, best(b - 1)).mse : null, opt = stats(b, best(b)).mse;
    q('.readout').innerHTML = `step Δ = ${chip(S.step.toFixed(3) + 'σ', C.book)} · squared error ${chip(S.mse.toExponential(2), C.res)} of the signal (${chip(snr.toFixed(1) + ' dB', C.dec)}) · Δ²/12 would predict ${(S.step ** 2 / 12).toExponential(2)} · entropy of the output ${chip(S.H.toFixed(2) + ' bits', C.bits)} of the ${b} stored${prev ? ` <span class="dim">· with the best clip, ${b} bits has ${(prev / opt).toFixed(1)}× less error than ${b - 1}</span>` : ''}`;
  }
  sb.addEventListener('input', draw); sc.addEventListener('input', draw); q('#sq-best').addEventListener('click', () => { sc.value = best(+sb.value).toFixed(1); draw(); }); draw();
});

/* ---------- prediction narrows the distribution ---------- */
CE.widget('cond-pdf', el => {
  const q = mk(el, '<div class="chart-title">What a prediction is worth, in bits</div><div class="chart-sub">wide curve: a coordinate before prediction · narrow curve: the same coordinate once you know a value correlated with it</div><div class="chartwrap"></div><div class="controls"><label>correlation ρ <input type="range" id="cp-r" min="0" max="0.99" step="0.01" value="0.63"></label><output id="cp-v"></output><span class="seg"><button class="btn" data-r="0.63">this book\'s windows (0.63)</button><button class="btn" data-r="0.9">0.9</button><button class="btn" data-r="0.99">0.99</button></span></div><div class="readout"></div>');
  const host = q('.chartwrap'), sl = q('#cp-r');
  function draw() {
    const rho = +sl.value, s = Math.sqrt(1 - rho * rho); q('#cp-v').textContent = rho.toFixed(2);
    const P = plot(host, { w: 900, h: 280, pad: { l: 20, r: 16, t: 14, b: 40 }, x: { min: -3.5, max: 3.5, ticks: [-3, -2, -1, 0, 1, 2, 3], fmt: v => v + 'σ', label: 'value (centred on the prediction for the narrow curve)' }, y: { min: 0, max: Math.min(3, 0.42 / s), ticks: [] } });
    const c1 = [], c2 = []; for (let x = -3.5; x <= 3.501; x += 0.02) { c1.push([x, normal(x)]); c2.push([x, Math.min(3, normal(x / s) / s)]); }
    const poly = (c, col) => P.add(`<polygon points="${P.X(-3.5)},${P.Y(0)} ${c.map(p => `${P.X(p[0]).toFixed(1)},${P.Y(p[1]).toFixed(1)}`).join(' ')} ${P.X(3.5)},${P.Y(0)}" fill="${col}" opacity=".16"/>`);
    poly(c1, V('k-vec')); poly(c2, V('k-res')); P.line(c1, V('k-vec'), 2.2); P.line(c2, V('k-res'), 2.2);
    P.add(`<text x="${P.X(-2.2)}" y="${P.Y(normal(2.2)) - 14}" class="t-hand" style="fill:${V('k-vec')}">before: σ</text><text x="${P.X(s * 1.1) + 8}" y="${P.Y(normal(1.1) / s)}" class="t-hand" style="fill:${V('k-res')}">after: σ·√(1−ρ²) = ${s.toFixed(2)}σ</text>`);
    P.done();
    const bits = -Math.log2(s);
    q('.readout').innerHTML = `ρ = ${chip(rho.toFixed(2), C.res)} · spread shrinks to ${chip(s.toFixed(3), C.res)} of what it was · energy by ×${(1 / (s * s)).toFixed(2)} · that saves ${chip(bits.toFixed(2) + ' bits per coordinate', C.bits)} at any fixed precision · × 384 coordinates = ${chip(num(bits * 384) + ' bits per vector', C.bits)} <span class="dim">· ρ = 0.5 saves only 0.21 bits; you need ρ near 1 for prediction to be worth much</span>`;
  }
  sl.addEventListener('input', draw); el.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { sl.value = b.dataset.r; draw(); })); draw();
});

/* ---------- rotation versus prediction on a correlated cloud ---------- */
CE.widget('decorrelate', el => {
  const q = mk(el, '<div class="two even"><canvas id="de-cv" class="drag" style="height:min(80vw,380px)" aria-label="A correlated two-dimensional cloud with a rotatable pair of axes"></canvas><div class="side sidepanel"><div class="ctl"><label>correlation of the two coordinates <output id="de-rv"></output></label><input type="range" id="de-r" min="0" max="0.98" step="0.01" value="0.8"></div><div class="ctl"><label>angle of the coding axes <output id="de-av"></output></label><input type="range" id="de-a" min="0" max="90" step="1" value="0"></div><span class="seg"><button class="btn" id="de-pca">snap to principal axes</button><button class="btn" id="de-raw">original axes</button></span><dl class="kv" id="de-kv"></dl><div class="note" id="de-note"></div></div></div>');
  const cv = q('#de-cv'), sr = q('#de-r'), sa = q('#de-a'); const r0 = mulberry32(3), g = gaussFn(r0), Z = Array.from({ length: 600 }, () => [g(), g()]);
  function draw() {
    const rho = +sr.value, a = +sa.value * Math.PI / 180, s2 = Math.sqrt(1 - rho * rho);
    q('#de-rv').textContent = rho.toFixed(2); q('#de-av').textContent = sa.value + '°';
    const { ctx, w, h } = setup(cv), Vw = view(w, h, 0, 0, 3.4); grid(ctx, Vw, w, h, 1);
    Z.forEach(z => { const x = z[0], y = rho * z[0] + s2 * z[1]; dot(ctx, Vw.X(x), Vw.Y(y), 1.8, rgba(C.vec, 0.6)); });
    const u = [Math.cos(a), Math.sin(a)], v = [-Math.sin(a), Math.cos(a)];
    const va = u[0] * u[0] + u[1] * u[1] + 2 * rho * u[0] * u[1], vb = v[0] * v[0] + v[1] * v[1] + 2 * rho * v[0] * v[1];
    arrow(ctx, Vw.X(-u[0] * 3), Vw.Y(-u[1] * 3), Vw.X(u[0] * 3), Vw.Y(u[1] * 3), C.book, 2.4, 10); arrow(ctx, Vw.X(-v[0] * 3), Vw.Y(-v[1] * 3), Vw.X(v[0] * 3), Vw.Y(v[1] * 3), C.code, 2.4, 10);
    ctx.font = '19px Caveat, cursive'; ctx.fillStyle = C.book; ctx.fillText('axis 1: σ = ' + Math.sqrt(va).toFixed(2), Vw.X(u[0] * 2.2) + 8, Vw.Y(u[1] * 2.2) + 18); ctx.fillStyle = C.code; ctx.fillText('axis 2: σ = ' + Math.sqrt(vb).toFixed(2), Vw.X(v[0] * 2.2) + 8, Vw.Y(v[1] * 2.2) - 6);
    const bits = 0.5 * Math.log2(va * vb), best = 0.5 * Math.log2(1 - rho * rho), raw = 0;
    q('#de-kv').innerHTML = `<dt>bits for both axes, relative to the original ones</dt><dd>${bits <= 0 ? '' : '+'}${bits.toFixed(2)}</dd><dt>best any rotation can do</dt><dd>${best.toFixed(2)}</dd><dt>predict y from x instead (no rotation)</dt><dd>${best.toFixed(2)}</dd>`;
    q('#de-note').innerHTML = Math.abs(bits - best) < 0.02 ? 'At the principal axes the two coordinates are uncorrelated and the bill is as low as a rotation can make it. Predicting y from x reaches <b>exactly the same number</b>, and it never leaves the integer grid.' : 'Coding each axis separately costs about log₂ σ₁ + log₂ σ₂ bits. Rotate the axes and watch the sum: it is smallest when the axes line up with the cloud.';
  }
  sr.addEventListener('input', draw); sa.addEventListener('input', draw); q('#de-pca').addEventListener('click', () => { sa.value = 45; draw(); }); q('#de-raw').addEventListener('click', () => { sa.value = 0; draw(); });
  redraws.push(draw); draw();
});

/* ---------- entropy coders compared on one residual distribution ---------- */
CE.widget('coders', el => {
  const q = mk(el, '<div class="chart-title">Four ways to store one residual value</div><div class="chart-sub">average bits per value for an integer residual with spread σ · lower is better · the ideal is the entropy</div><div class="chartwrap"></div><div class="controls"><label>spread σ (in integer steps) <input type="range" id="co-s" min="-1.5" max="5.5" step="0.05" value="3.9"></label><output id="co-v"></output><span class="seg"><button class="btn" data-k="gauss" aria-pressed="true">bell curve (embeddings)</button><button class="btn" data-k="laplace" aria-pressed="false">Laplace (audio, images)</button></span></div><div class="readout"></div>');
  const host = q('.chartwrap'), sl = q('#co-s'); let kind = 'gauss';
  function pmf(sd) { const R = Math.ceil(Math.max(8, sd * 8)), p = []; const b = sd / Math.SQRT2; for (let k = -R; k <= R; k++) p.push(kind === 'gauss' ? L.Phi((k + 0.5) / sd) - L.Phi((k - 0.5) / sd) : L.lapCdf(k + 0.5, b) - L.lapCdf(k - 0.5, b)); const s = p.reduce((a, b) => a + b, 0); return { p: p.map(v => v / s), R }; }
  function huffman(p) { // average code length via the sum of merged weights
    const h = p.filter(v => v > 0).slice().sort((a, b) => a - b); if (h.length < 2) return 1; let total = 0;
    const q1 = h, q2 = []; let i = 0, j = 0; const pop = () => (i < q1.length && (j >= q2.length || q1[i] <= q2[j]) ? q1[i++] : q2[j++]);
    while ((q1.length - i) + (q2.length - j) > 1) { const a = pop(), b = pop(); total += a + b; q2.push(a + b); } return total;
  }
  function rice(p, R) { let best = 1e9, bk = 0; for (let k = 0; k < 14; k++) { let s = 0; for (let n = -R; n <= R; n++) { const u = n >= 0 ? 2 * n : -2 * n - 1; s += p[n + R] * ((u >> k) + 1 + k); } if (s < best) { best = s; bk = k; } } return [best, bk]; }
  function draw() {
    const sd = Math.pow(2, +sl.value), { p, R } = pmf(sd); q('#co-v').textContent = 'σ = ' + (sd < 10 ? sd.toFixed(2) : sd.toFixed(0));
    const H = -p.reduce((a, v) => a + (v > 0 ? v * Math.log2(v) : 0), 0), hf = huffman(p), [rc, k] = rice(p, R), fixed = Math.max(1, Math.ceil(Math.log2(2 * Math.ceil(sd * 4) + 1)));
    const rows = [['fixed width (covers ±4σ)', fixed, 'faint'], ['Golomb–Rice, best k = ' + k, rc, 's4'], ['Huffman table', hf, 's1'], ['arithmetic coding / ANS', H + 0.002, 's3'], ['entropy (the limit)', H, 'k-bits']];
    const W = 900, rh = 36, pl = 250, pr = 190, Hh = rows.length * rh + 26, mx = Math.max(fixed, rc, hf) * 1.02, X = v => pl + v / mx * (W - pl - pr);
    let s = ''; rows.forEach(([lab, v, col], i) => { const y = 10 + i * rh; s += `<text x="${pl - 12}" y="${y + 16}" text-anchor="end">${lab}</text><rect x="${pl}" y="${y}" width="${Math.max(2, X(v) - pl)}" height="${rh - 12}" rx="4" fill="${V(col)}"/><text x="${X(v) + 8}" y="${y + 16}" class="t-ink">${v.toFixed(2)} bits${i < 4 ? ` <tspan style="fill:var(--muted)">+${pct(v / H - 1, v / H - 1 < 0.1 ? 1 : 0)}</tspan>` : ''}</text>`; });
    host.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="bits per value for four entropy coders">${s}</svg>`;
    q('.readout').innerHTML = `Entropy ${chip(H.toFixed(2) + ' bits', C.bits)} ≈ log₂ σ + ${kind === 'gauss' ? '2.05' : '1.94'} · Huffman wastes ${chip(pct(hf / H - 1, 1), hf / H - 1 > 0.05 ? C.res : C.dec)}, Golomb–Rice ${chip(pct(rc / H - 1, 1), rc / H - 1 > 0.05 ? C.res : C.dec)} ${sd < 1 ? '<span class="dim">· below about one bit per value, whole-bit codes cannot follow the entropy down: this is where arithmetic coding and ANS earn their keep</span>' : kind === 'gauss' ? '<span class="dim">· Rice codes are built for Laplace-shaped data; on a bell curve they overpay a little at every σ</span>' : '<span class="dim">· on Laplace-shaped residuals a Rice code is close to free, which is why FLAC uses it</span>'}`;
  }
  sl.addEventListener('input', draw); el.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.k; el.querySelectorAll('[data-k]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); })); draw();
});

/* ---------- SimHash in the plane ---------- */
CE.widget('simhash-toy', el => {
  const q = mk(el, '<div class="two"><canvas id="sh-cv" class="drag" style="height:min(80vw,400px)" aria-label="Two vectors and random lines through the origin; lines that separate the vectors are highlighted"></canvas><div class="side sidepanel"><div class="ctl"><label>random hyperplanes (bits) <output id="sh-nv"></output></label><input type="range" id="sh-n" min="1" max="7" step="0.5" value="4"></div><button class="btn" id="sh-new">New random hyperplanes</button><dl class="kv" id="sh-kv"></dl><div class="note" id="sh-note"></div></div></div>');
  const cv = q('#sh-cv'), sn = q('#sh-n'); let seed = 5, a1 = 0.35, a2 = 1.25, Vw = null;
  function draw() {
    const n = Math.round(Math.pow(2, +sn.value)), r = mulberry32(seed); q('#sh-nv').textContent = n;
    const { ctx, w, h } = setup(cv); Vw = view(w, h, 0, 0, 1.35); grid(ctx, Vw, w, h, 0.5);
    let diff = 0; const bitsA = [], bitsB = [];
    for (let i = 0; i < n; i++) { const t = r() * Math.PI, nx = Math.cos(t), ny = Math.sin(t); const sa = nx * Math.cos(a1) + ny * Math.sin(a1) > 0, sb = nx * Math.cos(a2) + ny * Math.sin(a2) > 0; const sep = sa !== sb; if (sep) diff++; if (i < 24) { bitsA.push(sa ? 1 : 0); bitsB.push(sb ? 1 : 0); }
      if (n <= 64 || sep || i % 4 === 0) { ctx.strokeStyle = sep ? rgba(C.res, n > 64 ? 0.5 : 0.85) : rgba(C.ink, n > 32 ? 0.08 : 0.16); ctx.lineWidth = sep ? 1.6 : 1; ctx.beginPath(); ctx.moveTo(Vw.X(ny * 2), Vw.Y(-nx * 2)); ctx.lineTo(Vw.X(-ny * 2), Vw.Y(nx * 2)); ctx.stroke(); } }
    ctx.strokeStyle = rgba(C.ink, 0.25); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(Vw.X(0), Vw.Y(0), Vw.s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C.vec; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Vw.X(0), Vw.Y(0), Vw.s * 0.3, -Math.max(a1, a2), -Math.min(a1, a2)); ctx.stroke();
    arrow(ctx, Vw.X(0), Vw.Y(0), Vw.X(Math.cos(a1)), Vw.Y(Math.sin(a1)), C.q, 3.2, 12); arrow(ctx, Vw.X(0), Vw.Y(0), Vw.X(Math.cos(a2)), Vw.Y(Math.sin(a2)), C.dec, 3.2, 12);
    dot(ctx, Vw.X(Math.cos(a1)), Vw.Y(Math.sin(a1)), 7, C.q, C.bg2, 2); dot(ctx, Vw.X(Math.cos(a2)), Vw.Y(Math.sin(a2)), 7, C.dec, C.bg2, 2);
    ctx.font = '20px Caveat, cursive'; ctx.fillStyle = C.q; ctx.fillText('query', Vw.X(Math.cos(a1) * 1.1), Vw.Y(Math.sin(a1) * 1.1)); ctx.fillStyle = C.dec; ctx.fillText('document', Vw.X(Math.cos(a2) * 1.1) - 20, Vw.Y(Math.sin(a2) * 1.1) - 6);
    let th = Math.abs(a1 - a2) % (2 * Math.PI); if (th > Math.PI) th = 2 * Math.PI - th;
    const est = diff / n * Math.PI, se = Math.sqrt(th / Math.PI * (1 - th / Math.PI) / n) * 180;
    q('#sh-kv').innerHTML = `<dt>true angle θ</dt><dd>${(th * 180 / Math.PI).toFixed(0)}°</dd><dt>θ/π (chance a plane separates)</dt><dd>${(th / Math.PI).toFixed(3)}</dd><dt>planes that separate</dt><dd style="color:var(--k-res)">${diff} of ${n} = ${(diff / n).toFixed(3)}</dd><dt>angle estimated from the bits</dt><dd>${(est * 180 / Math.PI).toFixed(0)}° ± ${se.toFixed(0)}°</dd>`;
    q('#sh-note').innerHTML = `<span class="mono" style="font-size:.72rem;word-break:break-all"><span style="color:var(--k-q)">${bitsA.join('')}${n > 24 ? '…' : ''}</span><br><span style="color:var(--k-dec)">${bitsB.join('')}${n > 24 ? '…' : ''}</span></span><br>Drag either arrow. A line through the origin puts the two arrows on different sides exactly when it passes through the yellow angle between them.`;
  }
  draggable(cv, p => { const x = (p[0] - Vw.X(0)), y = -(p[1] - Vw.Y(0)), a = Math.atan2(y, x); const d1 = Math.abs(Math.atan2(Math.sin(a - a1), Math.cos(a - a1))), d2 = Math.abs(Math.atan2(Math.sin(a - a2), Math.cos(a - a2))); return d1 < d2 ? 1 : 2; },
    (which, p) => { const a = Math.atan2(-(p[1] - Vw.Y(0)), p[0] - Vw.X(0)); if (which === 1) a1 = a; else a2 = a; draw(); });
  sn.addEventListener('input', draw); q('#sh-new').addEventListener('click', () => { seed++; draw(); }); redraws.push(draw); draw();
});

/* ---------- the S-curve of k bits AND-ed, L tables OR-ed ---------- */
CE.widget('lsh-scurve', el => {
  const has = typeof DATA !== 'undefined' && DATA.lsh, S = has ? DATA.lsh : { cosc_nn10: 0.34, cosc_rand: 0.07, index: [] };
  const q = mk(el, '<div class="chart-title">The S-curve: probability that a point becomes a candidate</div><div class="chart-sub">P = 1 − (1 − pᵏ)ᴸ with p = 1 − θ/π · dashed lines mark a true 10th neighbour and a random pair on the real data</div><div class="chartwrap"></div><div class="controls"><label>bits per table k <input type="range" id="sc-k" min="1" max="24" step="1" value="12"></label><output id="sc-kv"></output><label>tables L <input type="range" id="sc-l" min="0" max="8" step="1" value="4"></label><output id="sc-lv"></output></div><div class="readout"></div>');
  const host = q('.chartwrap'), sk = q('#sc-k'), slL = q('#sc-l');
  const pOf = c => 1 - Math.acos(Math.max(-1, Math.min(1, c))) / Math.PI;
  function draw() {
    const k = +sk.value, Lt = 1 << +slL.value; q('#sc-kv').textContent = 'k = ' + k; q('#sc-lv').textContent = 'L = ' + Lt;
    const f = c => 1 - Math.pow(1 - Math.pow(pOf(c), k), Lt);
    const P = plot(host, { w: 900, h: 340, pad: { l: 52, r: 20, t: 22, b: 46 }, xgrid: true, x: { min: -0.2, max: 1, ticks: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1], label: 'cosine similarity to the query (after centring)' }, y: { min: 0, max: 1, label: 'P(candidate)' } });
    const one = [], cur = []; for (let c = -0.2; c <= 1.0001; c += 0.01) { one.push([c, pOf(c)]); cur.push([c, f(c)]); }
    P.line(one, V('faint'), 1.5, '2 4'); P.line(cur, V('k-code'), 2.8);
    P.add(`<text x="${P.X(-0.18)}" y="${P.Y(pOf(-0.18)) - 8}">one bit</text>`);
    [[S.cosc_nn10, '10th neighbour', 'k-dec', 'start'], [S.cosc_rand, 'random pair', 'k-res', 'end']].forEach(([c, t, col, an]) => { P.add(`<line x1="${P.X(c)}" x2="${P.X(c)}" y1="${P.p.t}" y2="${P.Y(0)}" stroke="${V(col)}" stroke-dasharray="4 4"/><circle cx="${P.X(c)}" cy="${P.Y(f(c))}" r="6" fill="${V(col)}" stroke="var(--bg-2)" stroke-width="2"/><text x="${P.X(c) + (an === 'end' ? -8 : 8)}" y="${P.p.t + 12}" text-anchor="${an}" style="fill:${V(col)}">${t}</text>`); });
    P.done();
    const near = f(S.cosc_nn10), far = f(S.cosc_rand), m = S.index.find(r => r.kind === 'lsh' && r.k === k && r.L === Lt);
    q('.readout').innerHTML = `k = ${chip(k, C.code)}, L = ${chip(Lt, C.code)} · a true neighbour becomes a candidate with probability ${chip(near.toFixed(3), C.dec)} (≈ recall) · a random point with ${chip(far.toExponential(1), C.res)} (≈ share of the database scanned)${m ? `<br><span class="dim">measured with these settings:</span> recall ${chip(m.recall.toFixed(3), C.dec)}, scanned ${chip(pct(m.frac, 2), C.res)}` : ''} <span class="dim">· memory: ${Lt} tables</span>`;
  }
  sk.addEventListener('input', draw); slL.addEventListener('input', draw); draw();
});

})();
