/* Paper club figures. Each paper's measurements live in data/lab/<paper>.json (written by experiments/<paper>.py). */
(function () {
'use strict';
const L = CE.lib, { C, chip, plot, legend } = L;
const V = k => `var(--${k})`;
const pct = (v, n) => (v * 100).toFixed(n == null ? 0 : n) + '%';
const mk = (el, h) => { el.innerHTML = h; return id => el.querySelector(id); };

/* the experiment data loader (the same convention as the book's experiments: assets/lab/<name>.js calls CE.labData.put) */
if (!CE.labData) {
  const store = {}, waiting = {};
  CE.labData = {
    put(name, d) { store[name] = d; (waiting[name] || []).forEach(f => f(d)); delete waiting[name]; },
    get(name) {
      if (store[name]) return Promise.resolve(store[name]);
      return new Promise((res, rej) => {
        const first = !waiting[name]; (waiting[name] = waiting[name] || []).push(res);
        if (!first) return;
        const s = document.createElement('script'); s.src = 'assets/lab/' + name + '.js'; s.async = true;
        s.onerror = () => rej(new Error('could not load the data for this figure')); document.head.appendChild(s);
      });
    },
  };
}
const withData = (el, name, build) => {
  el.innerHTML = '<div class="readout">loading the measurements…</div>';
  CE.labData.get(name).then(d => { el.innerHTML = ''; build(d); }).catch(err => { console.error(err); el.innerHTML = '<div class="readout">This figure failed to load its data.</div>'; });
};
const seg = (name, opts, on) => `<span class="seg">${opts.map(([v, t]) => `<button class="btn" data-${name}="${v}" aria-pressed="${v === on}">${t}</button>`).join('')}</span>`;
const wire = (el, name, fn) => el.querySelectorAll(`[data-${name}]`).forEach(b => b.addEventListener('click', () => {
  el.querySelectorAll(`[data-${name}]`).forEach(x => x.setAttribute('aria-pressed', x === b)); fn(b.dataset[name]);
}));
/* a histogram as a filled step area over [-1, 1] */
const area = (P, h, col, op, scale) => {
  const nb = h.length, pts = [];
  h.forEach((v, i) => { const x0 = -1 + 2 * i / nb, x1 = -1 + 2 * (i + 1) / nb; pts.push([x0, v * scale], [x1, v * scale]); });
  const d = `M${P.X(-1)},${P.Y(0)} ` + pts.map(q => `L${P.X(q[0]).toFixed(1)},${P.Y(Math.min(q[1], 1)).toFixed(1)}`).join(' ') + ` L${P.X(1)},${P.Y(0)} Z`;
  P.add(`<path d="${d}" fill="${col}" fill-opacity="${op}" stroke="${col}" stroke-width="1.2"/>`);
};
const vline = (P, x, col, t, anchor, y) => P.add(`<line x1="${P.X(x)}" x2="${P.X(x)}" y1="${P.p.t}" y2="${P.Y(0)}" stroke="${col}" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${P.X(x) + (anchor === 'end' ? -6 : 6)}" y="${P.p.t + (y || 12)}" text-anchor="${anchor || 'start'}" style="fill:${col}">${t}</text>`);

/* ---------- MagicPIG 1: the two cones and the sink ---------- */
CE.widget('pig-cone', el => withData(el, 'magicpig', D => {
  const S = D.show;
  const q = mk(el, `<div class="chart-title">Where the keys and the queries point</div><div class="chart-sub"></div><div class="chartwrap"></div><div class="controls">${seg('v', [['cone', 'one head: the two cones'], ['query', 'one query: raw and centred'], ['layers', 'all layers']], 'cone')}</div><div class="readout"></div>`);
  const host = q('.chartwrap');
  function draw(v) {
    if (v === 'layers') {
      q('.chart-sub').textContent = `${D.model} · every layer, averaged over heads · cosine with the mean key direction`;
      const G = D.geometry, n = G.length;
      const P = plot(host, { w: 900, h: 330, pad: { l: 52, r: 20, t: 26, b: 46 }, x: { min: 0, max: n - 1, label: 'layer' }, y: { min: -1, max: 1, ticks: [-1, -0.5, 0, 0.5, 1], label: 'cosine with the mean key' } });
      P.add(`<line class="axis" x1="${P.X(0)}" x2="${P.X(n - 1)}" y1="${P.Y(0)}" y2="${P.Y(0)}" stroke-dasharray="3 3"/>`);
      [['k_mu', 'k-book', 'a key'], ['q_mu', 'k-q', 'a query'], ['sink_mu', 'k-res', 'the first token’s key (the sink)']].forEach(([f, c]) => { P.line(G.map((g, i) => [i, g[f]]), V(c), 2.6); P.dots(G.map((g, i) => [i, g[f]]), V(c), 3.2); });
      P.done();
      const avg = f => G.reduce((s, g) => s + g[f], 0) / n;
      q('.readout').innerHTML = legend([['a key, on average', V('k-book'), 1], ['a query, on average', V('k-q'), 1], ['the first token’s key', V('k-res'), 1]]) +
        `Averaged over layers: keys lean toward their mean at ${chip(avg('k_mu').toFixed(2), C.book)}, queries at ${chip(avg('q_mu').toFixed(2), C.q)}, the sink at ${chip(avg('sink_mu').toFixed(2), C.res)}. ` +
        `<span class="dim">The sink’s key for 32 different first tokens agrees at cosine ${avg('sink_stab').toFixed(2)}; the mean key of 50 passages from 18 books at ${avg('mean_stab').toFixed(2)}.</span>`;
      return;
    }
    if (v === 'cone') {
      q('.chart-sub').textContent = `layer ${S.layer}, head ${S.head} · histograms of the cosine with the mean key, over ${D.n.toLocaleString('en-US')} keys and the queries of the same text`;
      const m = Math.max(...S.k_mu, ...S.q_mu) * 1.1;
      const P = plot(host, { w: 900, h: 330, pad: { l: 52, r: 20, t: 26, b: 46 }, xgrid: true, x: { min: -1, max: 1, label: 'cosine with the direction of the mean key' }, y: { min: 0, max: 1, ticks: [], label: 'share of vectors' } });
      area(P, S.k_mu, V('k-book'), 0.3, 1 / m); area(P, S.q_mu, V('k-q'), 0.3, 1 / m);
      vline(P, S.sink_mu, V('k-res'), 'sink key', S.sink_mu < 0 ? 'start' : 'end');
      vline(P, 0, V('faint'), '', 'start');
      P.done();
      q('.readout').innerHTML = legend([['keys', V('k-book')], ['queries', V('k-q')], ['the first token’s key', V('k-res'), 1]]) +
        `Random directions in ${D.head_dim} dimensions would pile up at 0. The keys sit in a narrow cone around their mean, the queries in another, and the sink points away from the keys (${chip(S.sink_mu.toFixed(2), C.res)}). This query’s cosine with the sink key is ${chip(S.q_sink.toFixed(2), C.q)}, and it gives the sink ${chip(pct(S.sink_mass), C.res)} of its attention.`;
      return;
    }
    q('.chart-sub').textContent = `layer ${S.layer}, head ${S.head}, the last query · its cosine with every key, before and after subtracting the mean key`;
    const m = Math.max(...S.raw.count, ...S.centered.count) * 1.1;
    const P = plot(host, { w: 900, h: 330, pad: { l: 52, r: 20, t: 26, b: 46 }, xgrid: true, x: { min: -1, max: 1, label: 'cosine between the query and a key' }, y: { min: 0, max: 1, ticks: [], label: 'share of keys' } });
    area(P, S.raw.count, V('faint'), 0.25, 1 / m); area(P, S.centered.count, V('k-code'), 0.3, 1 / m);
    vline(P, 0, V('faint'), '', 'start');
    P.done();
    const mean = h => h.reduce((s, v, i) => s + v * (-1 + 2 * (i + 0.5) / h.length), 0);
    q('.readout').innerHTML = legend([['raw keys', V('faint')], ['centred keys', V('k-code')]]) +
      `Raw keys sit at an average cosine of ${chip(mean(S.raw.count).toFixed(2), C.res)} from the query: all on one side, all looking alike to a random hyperplane. Subtracting the mean key moves them to ${chip(mean(S.centered.count).toFixed(2), C.code)} and spreads them out. <span class="dim">The attention weights do not change: every score moves by the same amount, q·mean.</span>`;
  }
  wire(el, 'v', draw); draw('cone');
}));

/* ---------- MagicPIG 2: the "at least two tables" S-curve over real keys ---------- */
CE.widget('pig-scurve', el => withData(el, 'magicpig', D => {
  const S = D.show.centered;
  const q = mk(el, `<div class="chart-title">Probability that a key is sampled</div><div class="chart-sub">u = 1 − (1 − pᴷ)ᴸ − L·pᴷ(1 − pᴷ)ᴸ⁻¹ with p = 1 − θ/π · shaded: one real query’s centred keys (grey: how many, green: where its attention goes)</div><div class="chartwrap"></div><div class="controls"><label>bits per table K <input type="range" id="ps-k" min="4" max="14" step="1" value="10"></label><output id="ps-kv"></output><label>tables L <input type="range" id="ps-l" min="10" max="400" step="5" value="150"></label><output id="ps-lv"></output>${seg('r', [['2', 'at least 2 tables'], ['1', 'at least 1 table']], '2')}</div><div class="readout"></div>`);
  const host = q('.chartwrap'), sk = q('#ps-k'), sl = q('#ps-l'); let need = 2;
  const pOf = c => 1 - Math.acos(Math.max(-1, Math.min(1, c))) / Math.PI;
  const u = (c, K, Lt, r) => { const pk = Math.pow(pOf(c), K); const none = Math.pow(1 - pk, Lt); return r === 1 ? 1 - none : 1 - none - Lt * pk * Math.pow(1 - pk, Lt - 1); };
  function draw() {
    const K = +sk.value, Lt = +sl.value; q('#ps-kv').textContent = 'K = ' + K; q('#ps-lv').textContent = 'L = ' + Lt;
    const P = plot(host, { w: 900, h: 340, pad: { l: 52, r: 20, t: 22, b: 46 }, xgrid: true, x: { min: -1, max: 1, label: 'cosine between the query and a centred key' }, y: { min: 0, max: 1, label: 'P(sampled)' } });
    const m = Math.max(...S.count, ...S.mass) * 1.05;
    area(P, S.count, V('faint'), 0.22, 1 / m); area(P, S.mass, V('k-bits'), 0.25, 1 / m);
    const one = [], two = [], pts = [];
    for (let c = -1; c <= 1.0001; c += 0.01) { one.push([c, u(c, K, Lt, 1)]); two.push([c, u(c, K, Lt, 2)]); }
    P.line(one, V(need === 1 ? 'k-code' : 'faint'), need === 1 ? 2.8 : 1.5, need === 1 ? '' : '4 4');
    P.line(two, V(need === 2 ? 'k-code' : 'faint'), need === 2 ? 2.8 : 1.5, need === 2 ? '' : '4 4');
    P.done();
    const nb = S.count.length; let frac = 0, mass = 0;
    S.count.forEach((v, i) => { const c = -1 + 2 * (i + 0.5) / nb; frac += v * u(c, K, Lt, need); mass += S.mass[i] * u(c, K, Lt, need); });
    q('.readout').innerHTML = `Expected share of this query’s keys that get sampled: ${chip(pct(frac, 1), C.res)} (the cost) · expected share of its attention weight that sits on sampled keys: ${chip(pct(mass, 0), C.dec)}. <span class="dim">Compare the paper’s operating points (8, 75), (9, 120), (10, 150). Keys that are not sampled still count, through the 1/u re-weighting of those that are.</span>`;
  }
  sk.addEventListener('input', draw); sl.addEventListener('input', draw); wire(el, 'r', v => { need = +v; draw(); }); draw();
}));

/* ---------- MagicPIG 3: estimating the attention output at a budget ---------- */
CE.widget('pig-estimators', el => withData(el, 'magicpig', D => {
  const q = mk(el, `<div class="chart-title">How well each method estimates the attention output</div><div class="chart-sub">${D.model} reading ${D.n.toLocaleString('en-US')} tokens of <i>Emma</i> · ${D.t} decoding queries × ${D.heads} heads × ${D.layers} layers · relative error ‖ô − o‖ / ‖o‖ against the share of keys touched</div><div class="chartwrap"></div><div class="controls"><label><input type="checkbox" id="pe-c" checked> centre the keys</label><label><input type="checkbox" id="pe-s" checked> keep sink + local tokens exact</label></div><div class="readout"></div>`);
  const host = q('.chartwrap');
  function draw() {
    const cen = q('#pe-c').checked, st = q('#pe-s').checked;
    const P = plot(host, { w: 900, h: 360, pad: { l: 56, r: 24, t: 22, b: 46 }, xgrid: true,
      x: { min: 0.001, max: 0.5, log: true, ticks: [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5], fmt: v => pct(v, v < 0.01 ? 1 : 0), label: 'share of the keys and values read (log scale)' },
      y: { min: 0, max: 0.6, ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], fmt: v => pct(v), label: 'relative error of the attention output' } });
    const cv = (k, col, dash) => { const pts = D.curves[k].filter(c => c.budget >= 0.001 && c.budget <= 0.5).map(c => [c.budget, Math.min(c.err, 0.6)]); P.line(pts, col, 2.6, dash); P.dots(pts, col, 3.2); };
    cv('topk', V('k-res')); cv('oracle', V('k-q')); cv('hybrid', V('k-dec'));
    const pig = D.magicpig.filter(m => m.centered === cen && m.static === st);
    pig.forEach((m, i) => {
      const x = Math.max(0.001, Math.min(0.5, m.budget)), y = Math.min(m.err, 0.6), dy = [-10, 24, -10][i % 3];
      P.add(`<rect x="${P.X(x) - 7}" y="${P.Y(y) - 7}" width="14" height="14" transform="rotate(45 ${P.X(x)} ${P.Y(y)})" fill="${V('k-code')}" stroke="var(--bg-2)" stroke-width="2"/><text x="${P.X(x) + (i === 1 ? -12 : 12)}" y="${P.Y(y) + dy}" text-anchor="${i === 1 ? 'end' : 'start'}" style="fill:${V('k-code')}">(${m.K}, ${m.L}) ${pct(m.err)}${m.err > 0.6 ? ' ↑' : ''}</text>`);
    });
    const s0 = D.static; P.add(`<rect x="${P.X(s0.budget) - 6}" y="${P.Y(Math.min(s0.err, 0.6)) - 6}" width="12" height="12" fill="none" stroke="${V('ink-2')}" stroke-width="2"/><text x="${P.X(s0.budget) + 10}" y="${P.Y(Math.min(s0.err, 0.6)) + 16}" class="dim">sink + local only</text>`);
    P.done();
    const best = pig.reduce((a, b) => (b.err < a.err ? b : a), pig[0]);
    const near = k => D.curves[k].reduce((a, b) => (Math.abs(Math.log(b.budget / best.budget)) < Math.abs(Math.log(a.budget / best.budget)) ? b : a));
    q('.readout').innerHTML = legend([['TopK (exact top keys)', V('k-res'), 1], ['oracle sampling ∝ attention', V('k-q'), 1], ['top half exact + sampled tail', V('k-dec'), 1], ['MagicPIG (K, L), our re-implementation', V('k-code')]]) +
      `MagicPIG (${best.K}, ${best.L}) reads ${chip(pct(best.budget, 1), C.code)} of the keys with error ${chip(pct(best.err, 1), C.code)}. Near the same budget TopK gets ${chip(pct(near('topk').err, 1), C.res)}, sampling ${chip(pct(near('oracle').err, 1), C.q)}, the hybrid ${chip(pct(near('hybrid').err, 1), C.dec)}. <span class="dim">The three curves need every score first (they are oracles); MagicPIG does not.</span>`;
  }
  q('#pe-c').addEventListener('change', draw); q('#pe-s').addEventListener('change', draw); draw();
}));

})();
