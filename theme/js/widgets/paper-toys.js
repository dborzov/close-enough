/* Paper club playgrounds: small toy models for the ideas in the papers. Nothing here uses measured data. */
(function () {
'use strict';
const L = CE.lib, { C, chip, plot, setup, view, grid, arrow, dot, draggable, mulberry32, gaussFn, rgba, redraws } = L;
const V = k => `var(--${k})`;
const pct = (v, n) => (v * 100).toFixed(n == null ? 0 : n) + '%';
const mk = (el, h) => { el.innerHTML = h; return id => el.querySelector(id); };
const seg = (name, opts, on) => `<span class="seg">${opts.map(([v, t]) => `<button class="btn" data-${name}="${v}" aria-pressed="${v === on}">${t}</button>`).join('')}</span>`;
const wire = (el, name, fn) => el.querySelectorAll(`[data-${name}]`).forEach(b => b.addEventListener('click', () => {
  el.querySelectorAll(`[data-${name}]`).forEach(x => x.setAttribute('aria-pressed', x === b)); fn(b.dataset[name]);
}));

/* Forty tokens. Each has an attention score s and a one-dimensional value v in [0, 1].
   On a number line the attention output is the balance point of the weights. */
const SCEN = {
  needle: { name: 'one needle', note: 'One token holds almost all the weight. Reading the top few is enough: this is the case fast attention was designed for.' },
  crowd: { name: 'a loud few, a quiet crowd', note: 'Six loud tokens say one thing (left). Thirty-four quiet ones say something else (right). Each quiet one is small, but together they outweigh the loud ones, and TopK never hears them.' },
  sink: { name: 'a sink', note: 'One token takes half the weight and says almost nothing (its value sits near 0): an attention sink. Everyone else gets a small, nearly equal share. Attention looks sparse, but half the answer is in the flat part.' },
};
function scenario(name) {
  const r = mulberry32({ needle: 3, crowd: 11, sink: 7 }[name]), g = gaussFn(r), T = [];
  for (let i = 0; i < 40; i++) {
    if (name === 'needle') T.push({ s: i === 23 ? 6.5 : g() * 0.7, v: 0.08 + 0.84 * r() });
    if (name === 'crowd') T.push(i < 6 ? { s: 2.2 + g() * 0.15, v: 0.14 + 0.12 * r() } : { s: 0.8 + g() * 0.35, v: 0.62 + 0.3 * r() });
    if (name === 'sink') T.push(i === 0 ? { s: 4.4, v: 0.04 } : { s: 0.5 + g() * 0.5, v: 0.35 + 0.55 * r() });
  }
  const mx = Math.max(...T.map(t => t.s)), e = T.map(t => Math.exp(t.s - mx)), z = e.reduce((a, b) => a + b, 0);
  T.forEach((t, i) => { t.w = e[i] / z; });
  return T;
}
const avg = (T, wts) => { let a = 0, z = 0; T.forEach((t, i) => { a += wts[i] * t.v; z += wts[i]; }); return a / z; };
const cumsum = a => { const c = []; let s = 0; a.forEach(x => { s += x; c.push(s); }); return c; };
const draw1 = (cum, r) => { const x = r() * cum[cum.length - 1]; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; } return lo; };
const mean = a => a.reduce((s, d) => s + d, 0) / a.length;
const truthLine = (P, o, yTop, yBot) => P.add(`<line x1="${P.X(o)}" x2="${P.X(o)}" y1="${P.Y(yTop)}" y2="${P.Y(yBot)}" stroke="${V('ink')}" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${P.X(o) + 6}" y="${P.Y(yTop) + 4}" style="fill:${V('ink')};font-weight:600">true output</text>`);
const cloud = (P, arr, ya, yb, col) => arr.forEach((d, j) => P.add(`<circle cx="${P.X(Math.max(0, Math.min(1, d))).toFixed(1)}" cy="${P.Y(ya + (yb - ya) * (0.15 + 0.85 * ((j * 0.618034) % 1))).toFixed(1)}" r="2.8" fill="${V(col)}" opacity=".5"/>`));

/* ---------- 1: TopK versus sampling ---------- */
CE.widget('pig-topk', el => {
  const q = mk(el, `<div class="chart-title">Estimating an average from a few tokens</div><div class="chart-sub">each stick is a token: where it stands is its value, how tall it is is its attention weight · the true output is the balance point of all the sticks</div><div class="chartwrap"></div><div class="controls">${seg('sc', Object.entries(SCEN).map(([k, v]) => [k, v.name]), 'crowd')}<label>tokens read <input type="range" id="tk-m" min="1" max="40" value="6"></label><output id="tk-mv"></output><button class="btn" id="tk-1">draw one sample</button><button class="btn" id="tk-200">draw 200 samples</button></div><div class="readout"></div>`);
  const host = q('.chartwrap'), sm = q('#tk-m'), rnd = mulberry32(99);
  let sc = 'crowd', T = scenario(sc), draws = [], last = null;
  function sample() {
    const m = +sm.value, cum = cumsum(T.map(t => t.w)), cnt = new Map();
    for (let j = 0; j < m; j++) { const i = draw1(cum, rnd); cnt.set(i, (cnt.get(i) || 0) + 1); }
    let e = 0; cnt.forEach((c, i) => { e += c * T[i].v; });
    return { est: e / m, cnt };
  }
  function draw() {
    const m = +sm.value; q('#tk-mv').textContent = m;
    const order = T.map((t, i) => i).sort((a, b) => T[b].w - T[a].w), kept = new Set(order.slice(0, m));
    const o = avg(T, T.map(t => t.w)), a = avg(T, T.map((t, i) => (kept.has(i) ? t.w : 0)));
    const M = T.reduce((s, t, i) => s + (kept.has(i) ? t.w : 0), 0), b = M < 1 - 1e-9 ? avg(T, T.map((t, i) => (kept.has(i) ? 0 : t.w))) : a;
    const top = Math.min(1, Math.max(...T.map(t => t.w)) * 1.12);
    const P = plot(host, { w: 900, h: 400, pad: { l: 52, r: 24, t: 22, b: 46 }, x: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], label: 'the value each token contributes (one number, for the picture)' },
      y: { min: -top * 0.62, max: top, ticks: L.nice(0, top, 4), fmt: v => pct(v), label: 'attention weight' } });
    P.add(`<line class="axis" x1="${P.X(0)}" x2="${P.X(1)}" y1="${P.Y(0)}" y2="${P.Y(0)}"/>`);
    T.forEach((t, i) => {
      const k = kept.has(i), col = k ? V('k-res') : V('faint');
      P.add(`<line x1="${P.X(t.v)}" x2="${P.X(t.v)}" y1="${P.Y(0)}" y2="${P.Y(t.w)}" stroke="${col}" stroke-width="${k ? 2.6 : 1.6}"/><circle cx="${P.X(t.v)}" cy="${P.Y(t.w)}" r="${k ? 4.5 : 3.2}" fill="${col}"/>`);
      if (last && last.cnt.has(i)) { const c = last.cnt.get(i); P.add(`<circle cx="${P.X(t.v)}" cy="${P.Y(t.w)}" r="${6.5 + Math.min(6, c)}" fill="none" stroke="${V('k-q')}" stroke-width="2"/>${c > 1 ? `<text x="${P.X(t.v) + 9}" y="${P.Y(t.w) - 9}" style="fill:${V('k-q')}">×${c}</text>` : ''}`); }
    });
    const y0 = -top * 0.2, y1 = -top * 0.55;
    P.add(`<text x="${P.X(0) + 2}" y="${P.Y(y0) - 4}" style="fill:${V('k-q')};font-size:12px">each dot: one sampling estimate (${draws.length})</text>`);
    cloud(P, draws, y0, y1, 'k-q');
    if (draws.length) { const mu = mean(draws); P.add(`<line x1="${P.X(mu)}" x2="${P.X(mu)}" y1="${P.Y(y0)}" y2="${P.Y(y1)}" stroke="${V('k-q')}" stroke-width="3"/>`); }
    truthLine(P, o, top * 0.98, y1);
    P.add(`<path d="M${P.X(a)},${P.Y(0)} l-7,12 l14,0 Z" fill="${V('k-res')}"/><text x="${P.X(a)}" y="${P.Y(0) + 26}" text-anchor="middle" style="fill:${V('k-res')}">TopK</text>`);
    if (Math.abs(o - a) > 0.02) {
      const yb = top * 0.1, dir = o > a ? 1 : -1;
      P.add(`<line x1="${P.X(a)}" x2="${P.X(o) - dir * 8}" y1="${P.Y(yb)}" y2="${P.Y(yb)}" stroke="${V('k-res')}" stroke-width="2"/><path d="M${P.X(o)},${P.Y(yb)} l${-dir * 10},-5 l0,10 Z" fill="${V('k-res')}"/><text x="${(P.X(a) + P.X(o)) / 2}" y="${P.Y(yb) - 7}" text-anchor="middle" style="fill:${V('k-res')}">bias</text>`);
    }
    P.done();
    const rms = draws.length ? Math.sqrt(draws.reduce((s, d) => s + (d - o) ** 2, 0) / draws.length) : 0;
    q('.readout').innerHTML = `<div class="dim" style="margin-bottom:.35rem">${SCEN[sc].note}</div>` +
      `TopK reads the ${m} tallest sticks (${chip(pct(M), C.res)} of the weight) and answers ${chip(a.toFixed(3), C.res)} against a true ${chip(o.toFixed(3), C.ink)}. The miss is exactly (1 − ${M.toFixed(2)}) × (${b.toFixed(2)} − ${a.toFixed(2)}) = ${chip((b - a) * (1 - M) >= 0 ? '+' + ((b - a) * (1 - M)).toFixed(3) : ((b - a) * (1 - M)).toFixed(3), C.res)}: the weight it skipped, times how different the skipped tokens are.` +
      (draws.length ? ` Sampling ${m} at a time misses by ${chip('±' + rms.toFixed(3), C.q)} on average, and its misses are centred on the truth.` : ` <span class="dim">Now draw some samples.</span>`);
  }
  const reset = () => { draws = []; last = null; draw(); };
  wire(el, 'sc', v => { sc = v; T = scenario(v); reset(); });
  sm.addEventListener('input', reset);
  q('#tk-1').addEventListener('click', () => { last = sample(); draws.push(last.est); draw(); });
  q('#tk-200').addEventListener('click', () => { for (let j = 0; j < 200; j++) { last = sample(); draws.push(last.est); } draw(); });
  draw();
});

/* ---------- 2: sampling from the wrong distribution, and fixing it ---------- */
CE.widget('pig-importance', el => {
  const q = mk(el, `<div class="chart-title">Sampling from a guess, then correcting for it</div><div class="chart-sub">grey sticks: the true attention weights w · purple bars: a guess u that is cheap to sample from · below: 300 estimates, each from a handful of draws</div><div class="chartwrap"></div><div class="controls"><label>how good the guess is <input type="range" id="im-a" min="0" max="1" step="0.05" value="0.35"></label><output id="im-av"></output><label>draws per estimate <input type="range" id="im-b" min="4" max="40" value="10"></label><output id="im-bv"></output></div><div class="readout"></div>`);
  const host = q('.chartwrap'), sa = q('#im-a'), sb = q('#im-b'), T = scenario('crowd');
  function draw() {
    const al = +sa.value, B = +sb.value; q('#im-av').textContent = al === 0 ? 'uniform' : al === 1 ? 'exact' : al.toFixed(2); q('#im-bv').textContent = B;
    const ue = T.map(t => Math.pow(t.w, al)), uz = ue.reduce((a, b) => a + b, 0), u = ue.map(x => x / uz), cum = cumsum(u);
    const o = avg(T, T.map(t => t.w)), rnd = mulberry32(5), naive = [], fixed = [];
    for (let j = 0; j < 300; j++) {
      let n = 0, num = 0, den = 0;
      for (let k = 0; k < B; k++) { const i = draw1(cum, rnd), r = T[i].w / u[i]; n += T[i].v; num += r * T[i].v; den += r; }
      naive.push(n / B); fixed.push(num / den);
    }
    const top = Math.max(...T.map(t => t.w), ...u) * 1.12;
    const P = plot(host, { w: 900, h: 420, pad: { l: 52, r: 24, t: 22, b: 46 }, x: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], label: 'the value each token contributes' },
      y: { min: -top * 0.75, max: top, ticks: L.nice(0, top, 4), fmt: v => pct(v), label: 'probability' } });
    P.add(`<line class="axis" x1="${P.X(0)}" x2="${P.X(1)}" y1="${P.Y(0)}" y2="${P.Y(0)}"/>`);
    T.forEach((t, i) => P.add(`<rect x="${P.X(t.v) - 3.5}" y="${P.Y(u[i])}" width="7" height="${P.Y(0) - P.Y(u[i])}" fill="${V('k-q')}" opacity=".38"/><line x1="${P.X(t.v)}" x2="${P.X(t.v)}" y1="${P.Y(0)}" y2="${P.Y(t.w)}" stroke="${V('ink-2')}" stroke-width="1.4"/><circle cx="${P.X(t.v)}" cy="${P.Y(t.w)}" r="3" fill="${V('ink-2')}"/>`));
    [[naive, -top * 0.1, -top * 0.36, 'k-res', 'plain average of the draws'], [fixed, -top * 0.44, -top * 0.7, 'k-dec', 're-weighted by w / u']].forEach(([arr, ya, yb, col, lab]) => {
      P.add(`<text x="${P.X(0) + 2}" y="${P.Y(ya) + 4}" style="fill:${V(col)};font-size:12px">${lab}</text>`);
      cloud(P, arr, ya, yb, col);
      P.add(`<line x1="${P.X(mean(arr))}" x2="${P.X(mean(arr))}" y1="${P.Y(ya)}" y2="${P.Y(yb)}" stroke="${V(col)}" stroke-width="3"/>`);
    });
    truthLine(P, o, top * 0.98, -top * 0.72);
    P.done();
    const sd = a => Math.sqrt(a.reduce((s, d) => s + (d - mean(a)) ** 2, 0) / a.length);
    const ess = 1 / T.reduce((s, t, i) => s + t.w * t.w / u[i], 0);
    q('.readout').innerHTML = `The plain average of the draws lands at ${chip(mean(naive).toFixed(3), C.res)} against a true ${chip(o.toFixed(3), C.ink)}: it answers the question for the guess, not for attention. ` +
      `Re-weighted, it lands at ${chip(mean(fixed).toFixed(3), C.dec)}, give or take ${chip(sd(fixed).toFixed(3), C.dec)}. <span class="dim">With this guess, each draw is worth ${pct(ess)} of a draw from the true weights. A bad guess costs samples, not correctness.</span>`;
  }
  sa.addEventListener('input', draw); sb.addEventListener('input', draw); draw();
});

/* ---------- 3: why hashing needs centring ---------- */
CE.widget('pig-hash', el => {
  const q = mk(el, `<div class="two"><canvas id="ph-cv" class="drag" style="height:min(86vw,440px)" aria-label="Key vectors in a narrow cone, a sink key and a draggable query; random lines through the origin cut the plane into hash buckets"></canvas><div class="side sidepanel">${seg('c', [['0', 'raw keys'], ['1', 'centred keys']], '0')}<div class="ctl"><label>bits per bucket K <output id="ph-kv"></output></label><input type="range" id="ph-k" min="1" max="5" value="3"></div><button class="btn" id="ph-new">new random lines</button><dl class="kv" id="ph-out"></dl><div class="note" id="ph-note"></div></div></div>`);
  const cv = q('#ph-cv'), sk = q('#ph-k'), r0 = mulberry32(4), g0 = gaussFn(r0);
  const KEYS = []; for (let i = 0; i < 34; i++) { const a = (22 + g0() * 13) * Math.PI / 180, len = 0.62 + 0.3 * r0(); KEYS.push([len * Math.cos(a), len * Math.sin(a)]); }
  const SINK = [0.52 * Math.cos(208 * Math.PI / 180), 0.52 * Math.sin(208 * Math.PI / 180)];
  const ALL = KEYS.concat([SINK]), NS = ALL.length - 1, MU = [0, 1].map(d => KEYS.reduce((s, k) => s + k[d], 0) / KEYS.length);
  let qv = [0.9 * Math.cos(150 * Math.PI / 180), 0.9 * Math.sin(150 * Math.PI / 180)], target = 0, t = 0, seed = 2, Vw = null, anim = null;
  const beta = 4;
  function frame() {
    const { ctx, w, h } = setup(cv); Vw = view(w, h, 0, 0, 1.45); grid(ctx, Vw, w, h, 0.5);
    const K = +sk.value; q('#ph-kv').textContent = K + ' (' + (2 * K) + ' buckets in 2-D)';
    const rl = mulberry32(seed), phis = []; for (let j = 0; j < K; j++) phis.push(rl() * Math.PI);
    const shown = ALL.map(k => [k[0] - t * MU[0], k[1] - t * MU[1]]);
    const code = x => phis.map(f => (Math.cos(f) * x[0] + Math.sin(f) * x[1] > 0 ? 1 : 0)).join('');
    const qc = code(qv), inb = shown.map(x => code(x) === qc);
    // the query's bucket is the wedge between the nearest boundary directions on either side of it
    const qa = Math.atan2(qv[1], qv[0]), rel = [];
    phis.forEach(f => [f + Math.PI / 2, f - Math.PI / 2].forEach(b => rel.push(((b - qa) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)));
    const lo = qa + Math.max(...rel.filter(x => x <= 0)), hi = qa + Math.min(...rel.filter(x => x > 0));
    ctx.fillStyle = rgba(C.q, 0.11); ctx.beginPath(); ctx.moveTo(Vw.X(0), Vw.Y(0)); ctx.arc(Vw.X(0), Vw.Y(0), Vw.s * 3, -hi, -lo); ctx.closePath(); ctx.fill();
    phis.forEach(f => { const dx = -Math.sin(f), dy = Math.cos(f); ctx.strokeStyle = rgba(C.ink, 0.35); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(Vw.X(dx * 3), Vw.Y(dy * 3)); ctx.lineTo(Vw.X(-dx * 3), Vw.Y(-dy * 3)); ctx.stroke(); });
    ctx.strokeStyle = rgba(C.ink, 0.2); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(Vw.X(0), Vw.Y(0), Vw.s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // weights come from the raw scores. Centring moves every score by the same q·mean, so they never change.
    const sc = ALL.map(k => beta * (qv[0] * k[0] + qv[1] * k[1])), mx = Math.max(...sc), e = sc.map(s => Math.exp(s - mx)), z = e.reduce((a, b) => a + b, 0), wts = e.map(x => x / z);
    if (t < 0.5) { const al = 1 - 2 * t; ctx.setLineDash([5, 4]); arrow(ctx, Vw.X(0), Vw.Y(0), Vw.X(MU[0]), Vw.Y(MU[1]), rgba(C.book, 0.9 * al), 2, 9); ctx.setLineDash([]); ctx.font = '18px Caveat, cursive'; ctx.fillStyle = rgba(C.book, al); ctx.fillText('mean key', Vw.X(MU[0]) + 4, Vw.Y(MU[1]) + 20); }
    shown.forEach((x, i) => {
      const col = i === NS ? C.res : C.book;
      ctx.strokeStyle = rgba(col, inb[i] ? 0.7 : 0.2); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Vw.X(0), Vw.Y(0)); ctx.lineTo(Vw.X(x[0]), Vw.Y(x[1])); ctx.stroke();
      dot(ctx, Vw.X(x[0]), Vw.Y(x[1]), 2.5 + 16 * Math.sqrt(wts[i]), rgba(col, inb[i] ? 0.95 : 0.45), inb[i] ? C.q : null, 2.4);
    });
    ctx.font = '19px Caveat, cursive'; ctx.fillStyle = C.res; ctx.fillText('sink', Vw.X(shown[NS][0]) - 36, Vw.Y(shown[NS][1]) + 6);
    const kc = shown.slice(0, NS).reduce((a, x) => [a[0] + x[0] / NS, a[1] + x[1] / NS], [0, 0]);
    ctx.fillStyle = C.book; ctx.fillText('keys', Vw.X(kc[0]) + 26, Vw.Y(kc[1]) - 26);
    arrow(ctx, Vw.X(0), Vw.Y(0), Vw.X(qv[0]), Vw.Y(qv[1]), C.q, 3.2, 12); dot(ctx, Vw.X(qv[0]), Vw.Y(qv[1]), 7, C.q, C.bg2, 2);
    ctx.fillStyle = C.q; ctx.fillText('query (drag me)', Vw.X(qv[0] * 1.1) - 40, Vw.Y(qv[1] * 1.1) - 8);
    const wk = wts.slice(0, NS), mk_ = wk.reduce((a, b) => a + b, 0), nIn = inb.slice(0, NS).filter(Boolean).length, mIn = wk.reduce((s, x, i) => s + (inb[i] ? x : 0), 0), best = wk.indexOf(Math.max(...wk));
    q('#ph-out').innerHTML = `<dt>keys in the query’s bucket</dt><dd style="color:var(--k-q)">${nIn} of ${NS}</dd><dt>their share of the keys’ weight</dt><dd>${pct(mIn / mk_)}</dd><dt>the heaviest key</dt><dd>${inb[best] ? 'caught' : 'missed'}</dd><dt>attention weights</dt><dd>${t > 0.5 ? 'unchanged by centring' : 'as computed'}</dd>`;
    q('#ph-note').innerHTML = t < 0.5
      ? 'The keys all point one way and the query points another. A random line either misses the cone or slices it once, so the keys share one or two buckets, and almost never the query’s (shaded). Dot size is attention weight; ringed keys share the query’s bucket.'
      : 'Subtracting the mean key moves the cone onto the origin. Now the lines cut through the keys, and the ones that land in the query’s wedge are the ones pointing its way: the heavy ones. Every score shifted by the same q·mean, so the softmax did not change at all.';
  }
  function go(to) {
    target = to; if (anim) cancelAnimationFrame(anim);
    if (L.reduceMotion) { t = to; frame(); return; }
    const step = () => { t += (target - t) * 0.15; if (Math.abs(target - t) < 0.004) t = target; frame(); if (t !== target) anim = requestAnimationFrame(step); };
    step();
  }
  wire(el, 'c', v => go(+v));
  sk.addEventListener('input', frame); q('#ph-new').addEventListener('click', () => { seed++; frame(); });
  draggable(cv, p => (Vw && Math.hypot(p[0] - Vw.X(qv[0]), p[1] - Vw.Y(qv[1])) < 44 ? 1 : null), (_, p) => { const v = Vw.inv(p[0], p[1]), n = Math.hypot(v[0], v[1]) || 1; qv = n > 1.25 ? [v[0] * 1.25 / n, v[1] * 1.25 / n] : v; frame(); });
  redraws.push(frame); frame();
});

/* ---------- 4: the memory bill, per key ---------- */
CE.widget('pig-memory', el => {
  const q = mk(el, `<div class="chart-title">What one key costs, per layer and per head</div><div class="chart-sub">Llama-3.1-8B: head dimension 128, bfloat16 · totals for 96k tokens × 32 layers × 8 KV heads</div><div class="membars" style="padding:1.1rem 1.2rem;display:grid;gap:.75rem"></div><div class="controls"><label>bits per table K <input type="range" id="pm-k" min="6" max="12" value="10"></label><output id="pm-kv"></output><label>tables L <input type="range" id="pm-l" min="25" max="400" step="5" value="150"></label><output id="pm-lv"></output></div><div class="readout"></div>`);
  const sk = q('#pm-k'), sl = q('#pm-l'), host = q('.membars');
  function draw() {
    const K = +sk.value, Lt = +sl.value; q('#pm-kv').textContent = 'K = ' + K; q('#pm-lv').textContent = 'L = ' + Lt;
    const rows = [['the key and value themselves', 512, 'k-dec'], [`${Lt} table entries × 4 bytes`, 4 * Lt, 'k-code'], [`the ${(K * Lt).toLocaleString('en-US')} hash bits`, K * Lt / 8, 'k-bits']];
    const mx = Math.max(...rows.map(r => r[1]));
    host.innerHTML = rows.map(([t, b, c]) => `<div style="display:grid;grid-template-columns:minmax(8rem,15rem) 1fr;gap:.8rem;align-items:center;font-size:.86rem"><span>${t}</span><span style="display:flex;align-items:center;gap:.5rem"><span style="height:1.3rem;border-radius:4px;background:var(--${c});width:${(b / mx * 85).toFixed(1)}%;min-width:2px;transition:width .25s"></span><b style="font-family:var(--f-mono);font-size:.8rem">${Math.round(b)} B</b></span></div>`).join('');
    const gib = x => (x * 98304 * 32 * 8 / 2 ** 30).toFixed(1) + ' GiB', pk = Math.pow(0.5, K);
    const frac = 1 - Math.pow(1 - pk, Lt) - Lt * pk * Math.pow(1 - pk, Lt - 1);
    q('.readout').innerHTML = `KV cache ${chip(gib(512), C.dec)} · hash tables ${chip(gib(4 * Lt), C.code)}: the index costs ${chip((4 * Lt / 512).toFixed(2) + '×', C.code)} the data it indexes. <span class="dim">For keys spread evenly over the buckets, ${pct(frac, frac < 0.01 ? 2 : 1)} of them would be read per query (the paper’s Eq. 21). K sets the cost; L buys the recall back. The paper runs (8, 75), (9, 120) and (10, 150).</span>`;
  }
  sk.addEventListener('input', draw); sl.addEventListener('input', draw); draw();
});

})();
