/* Charts of the measured results (data/results.json -> window.DATA). */
(function () {
'use strict';
const L = CE.lib, { C, chip, plot, hover, legend, num } = L;
const $ = s => document.querySelector(s);
const V = k => `var(--${k})`;
const pct = (v, n) => (v * 100).toFixed(n == null ? 0 : n) + '%';
const mk = (el, h) => { el.innerHTML = h; return id => el.querySelector(id); };

/* ---------- eigenvalue spectrum ---------- */
CE.widget('spectrum', el => {
  const ev = DATA.props.spectrum, n = 120, d = DATA.props.d;
  const q = mk(el, '<div class="chart-title">Share of variance along each principal direction</div><div class="chart-sub">first 120 of ' + d + ' directions · all-MiniLM-L6-v2 on 18 Gutenberg books · hover for cumulative share</div><div class="chartwrap"></div><div class="readout"></div>');
  const host = q('.chartwrap'), out = q('.readout');
  let cum = 0; const cs = ev.map(v => (cum += v));
  const items = [];
  function draw(hi) {
    const P = plot(host, { w: 900, h: 300, pad: { l: 52, r: 16, t: 24, b: 44 }, x: { min: 0, max: n, ticks: [1, 8, 20, 40, 64, 80, 100, 120], label: 'principal direction, sorted by variance' }, y: { min: 0, max: 0.09, ticks: [0, 0.02, 0.04, 0.06, 0.08], fmt: v => pct(v), label: 'share of total variance' } });
    const bw = (P.X(1) - P.X(0));
    items.length = 0;
    for (let i = 0; i < n; i++) {
      const x = P.X(i) + 1, y = P.Y(ev[i]);
      P.add(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(P.Y(0) - y).toFixed(1)}" rx="2" fill="${V(i < 8 ? 'k-vec' : 'k-book')}" opacity="${hi != null && i > hi ? 0.35 : 1}"/>`);
      items.push({ x: x + bw / 2, i, html: `<b>direction ${i + 1}</b><br>${pct(ev[i], 2)} of the variance<br>first ${i + 1} together: <b>${pct(cs[i], 1)}</b>` });
    }
    [[8, 'first 8'], [64, 'first 64'], [120, 'first 120']].forEach(([k, t]) => P.add(`<line x1="${P.X(k)}" x2="${P.X(k)}" y1="${P.p.t}" y2="${P.Y(0)}" stroke="${V('faint')}" stroke-dasharray="3 4"/><text x="${P.X(k) + (k === 8 ? 6 : -6)}" y="${P.p.t + 30}" text-anchor="${k === 8 ? 'start' : 'end'}" class="t-ink">${t}: ${pct(cs[k - 1])}</text>`));
    P.done();
  }
  draw(); hover(host, 900, () => items, it => draw(it ? it.i : null));
  out.innerHTML = `Effective dimension (participation ratio) ${chip(DATA.props.participation_ratio.toFixed(0), C.vec)} of ${d} · ${chip(DATA.props.rank, C.book)} directions carry any variance at all (${d - DATA.props.rank} are exactly flat) · half the variance sits in the first ${chip(cs.findIndex(v => v >= 0.5) + 1, C.vec)} directions`;
});

/* ---------- reverse water-filling on the real spectrum ---------- */
CE.widget('waterfill', el => {
  const lam = DATA.sweep.lam.filter(v => v > 1e-9), d = lam.length;
  const q = mk(el, '<div class="chart-title">Reverse water-filling: where the bits go</div><div class="chart-sub">bars: variance of each principal direction (log scale) · the line is the water level θ · the coloured part of a bar is what gets coded</div><div class="chartwrap"></div>' +
    '<div class="controls"><label>bit budget per vector <input type="range" min="0" max="100" value="38" step="1" id="wf-r"></label><output id="wf-rv"></output><span class="seg"><button class="btn" data-b="64">8 bytes</button><button class="btn" data-b="128">16 B</button><button class="btn" data-b="384">48 B</button><button class="btn" data-b="1536">int4-sized</button><button class="btn" data-b="3072">int8-sized</button></span></div><div class="readout"></div>');
  const host = q('.chartwrap'), out = q('.readout'), sl = q('#wf-r');
  const R2s = R => Math.log2(1 + R / 16) / Math.log2(1 + 4096 / 16) * 100, s2R = s => 16 * (Math.pow(2, s / 100 * Math.log2(1 + 4096 / 16)) - 1);
  const rate = th => lam.reduce((a, v) => a + (v > th ? 0.5 * Math.log2(v / th) : 0), 0);
  function theta(R) { let lo = 1e-12, hi = lam[0]; for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (rate(mid) > R) lo = mid; else hi = mid; } return Math.sqrt(lo * hi); }
  const fam = { pca_sq: 'PCA + scalar', pq: 'PQ', opq: 'OPQ', rq: 'RQ' };
  function draw() {
    const R = Math.round(s2R(+sl.value)), th = R <= 0 ? lam[0] : theta(R);
    const P = plot(host, { w: 900, h: 320, pad: { l: 58, r: 16, t: 22, b: 44 }, x: { min: 0, max: d, ticks: [1, 50, 100, 150, 200, 250, 300, 350], label: 'principal direction' }, y: { min: 1e-5, max: 0.12, log: true, ticks: [1e-5, 1e-4, 1e-3, 1e-2, 1e-1], fmt: v => v >= 0.01 ? pct(v) : v >= 0.001 ? pct(v, 1) : pct(v, 3), label: 'variance share λᵢ (log)' } });
    const bw = P.X(1) - P.X(0); let used = 0, D = 0;
    for (let i = 0; i < d; i++) {
      const v = Math.max(lam[i], 1.05e-5), x = P.X(i), y = P.Y(v), y0 = P.Y(1e-5), above = lam[i] > th;
      if (above) { used++; D += th; const yt = P.Y(Math.max(th, 1.05e-5)); P.add(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 0.6).toFixed(1)}" height="${(yt - y).toFixed(1)}" fill="${V('k-bits')}"/><rect x="${x.toFixed(1)}" y="${yt.toFixed(1)}" width="${Math.max(1, bw - 0.6).toFixed(1)}" height="${(y0 - yt).toFixed(1)}" fill="${V('k-res')}" opacity=".45"/>`); }
      else { D += lam[i]; P.add(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 0.6).toFixed(1)}" height="${(y0 - y).toFixed(1)}" fill="${V('k-res')}" opacity=".45"/>`); }
    }
    const yw = P.Y(Math.max(th, 1.05e-5));
    P.add(`<line x1="${P.p.l}" x2="${900 - P.p.r}" y1="${yw}" y2="${yw}" stroke="${V('k-book')}" stroke-width="2"/><text x="${900 - P.p.r - 6}" y="${yw - 7}" text-anchor="end" class="t-hand" style="fill:${V('k-book')}">water level θ</text>`);
    P.done();
    q('#wf-rv').textContent = R + ' bits';
    const top = lam[0] > th ? 0.5 * Math.log2(lam[0] / th) : 0, tot = lam.reduce((a, b) => a + b, 0);
    let meas = '';
    const near = DATA.sweep.points.filter(p => fam[p.fam] && Math.abs(Math.log2(p.bits / Math.max(R, 1))) < 0.2);
    if (near.length) meas = '<br><span class="dim">measured at ' + near[0].bits + ' bits:</span> ' + near.map(p => `${fam[p.fam]} ${chip(p.relmse.toFixed(3), C.ink)}`).join(' · ');
    out.innerHTML = `${chip(R + ' bits', C.bits)} = ${(R / 8).toFixed(0)} bytes · ${chip(used + ' of ' + d, C.bits)} directions get bits · the top direction gets ${chip(top.toFixed(1), C.bits)} bits · error left (Gaussian bound) ${chip((D / tot).toFixed(3), C.res)} of the signal · ${(R / d).toFixed(2)} bits per dimension${meas}`;
  }
  sl.addEventListener('input', draw); el.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => { sl.value = R2s(+b.dataset.b); draw(); }));
  draw();
});

/* ---------- rate sweep: every family at several budgets ---------- */
CE.widget('rate-sweep', el => {
  const fams = [['scalar', 'scalar, raw axes (b bits per coordinate)', 's4'], ['pca_sq', 'PCA + water-filled scalar', 's2'], ['pq', 'PQ', 's1'], ['opq', 'OPQ (rotation + PQ)', 's6'], ['rq', 'RQ, greedy', 's3']];
  const q = mk(el, '<div class="chart-title">Transform + scalar versus vector quantizers, from 4 bytes to 384 bytes</div><div class="chart-sub">database books, held-out · lower error and higher recall are better</div>' + legend(fams.map(f => [f[1], V(f[2]), true]).concat([['Gaussian bound (reverse water-filling)', V('muted'), true]])) + '<div class="chartwrap"></div><div class="controls"><span class="seg"><button class="btn" data-m="relmse" aria-pressed="true">relative squared error</button><button class="btn" data-m="recall" aria-pressed="false">10-recall@10, no re-ranking</button></span></div><div class="readout"></div>');
  const host = q('.chartwrap'), out = q('.readout'); let metric = 'relmse'; const items = [];
  const lam = DATA.sweep.lam.filter(v => v > 1e-9), tot = lam.reduce((a, b) => a + b, 0);
  const bound = []; for (let t = Math.log(lam[0]); t > Math.log(1e-7); t -= 0.08) { const th = Math.exp(t); const R = lam.reduce((a, v) => a + (v > th ? 0.5 * Math.log2(v / th) : 0), 0); if (R >= 32 && R <= 3072) bound.push([R, lam.reduce((a, v) => a + Math.min(v, th), 0) / tot]); }
  function draw() {
    const rel = metric === 'relmse';
    const P = plot(host, { w: 900, h: 400, pad: { l: 58, r: 24, t: 22, b: 46 }, xgrid: true, x: { min: 28, max: 3600, log: true, ticks: [32, 64, 128, 256, 512, 1024, 1536, 3072], fmt: v => v, label: 'bits per vector (log scale) · 384 dimensions, so 384 bits = 1 bit per dimension' }, y: rel ? { min: 0, max: 0.8, label: 'relative squared error' } : { min: 0, max: 1, label: '10-recall@10' } });
    if (rel) P.line(bound, V('muted'), 1.6, '5 4');
    items.length = 0;
    fams.forEach(([f, name, col]) => { const pts = DATA.sweep.points.filter(p => p.fam === f).sort((a, b) => a.bits - b.bits); P.line(pts.map(p => [p.bits, p[metric]]), V(col), 2.2); P.dots(pts.map(p => [p.bits, p[metric]]), V(col), 4);
      pts.forEach(p => items.push({ x: P.X(p.bits), y: P.Y(p[metric]), html: `<i style="background:${V(col)}"></i><b>${name}</b><br>${p.bits} bits = ${p.bits / 8} bytes (${(p.bits / 384).toFixed(2)} bits/dim)<br>error ${p.relmse.toFixed(3)} · recall ${p.recall.toFixed(3)}` })); });
    P.add(`<line x1="${P.X(384)}" x2="${P.X(384)}" y1="${P.p.t}" y2="${P.Y(rel ? 0 : 0)}" stroke="${V('faint')}" stroke-dasharray="2 4"/><text x="${P.X(384) + 5}" y="${P.p.t + 11}">1 bit / dim</text>`);
    P.done();
    const g = (f, b) => DATA.sweep.points.find(p => p.fam === f && p.bits === b);
    out.innerHTML = rel ? `At ${chip('64 bits', C.bits)}: PCA+scalar ${g('pca_sq', 64).relmse.toFixed(2)}, PQ ${g('pq', 64).relmse.toFixed(2)}, RQ ${chip(g('rq', 64).relmse.toFixed(2), C.dec)} · at ${chip('512 bits', C.bits)}: PCA+scalar ${chip(g('pca_sq', 512).relmse.toFixed(3), C.dec)}, RQ ${g('rq', 512).relmse.toFixed(3)}, OPQ ${g('opq', 512).relmse.toFixed(3)}, PQ ${g('pq', 512).relmse.toFixed(3)} <span class="dim">· the curves converge around one bit per dimension</span>`
      : `Recall without any re-ranking. At ${chip('64 bits', C.bits)} nothing passes 0.25; plain 8-bit scalar (3,072 bits) reaches ${chip(g('scalar', 3072).recall.toFixed(2), C.dec)}. <span class="dim">Real systems re-rank a shortlist instead of buying recall with bits.</span>`;
  }
  el.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { metric = b.dataset.m; el.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); }));
  draw(); hover(host, 900, () => items);
});

/* ---------- 64-bit benchmark ---------- */
CE.widget('bench64', el => {
  const rows = DATA.lossy.rows, kinds = { scalar: ['transform + scalar', 's4'], pq: ['product (PQ, OPQ)', 's1'], add: ['additive (RQ, beam, LSQ)', 's3'], seq: ['additive + sequence prediction', 's5'] };
  const q = mk(el, '<div class="chart-title">Eight ways to spend 64 bits on a 384-dimensional vector</div><div class="chart-sub">relative squared error on held-out books versus encode time per vector (Faiss, one CPU core)</div>' + legend(Object.values(kinds).map(k => [k[0], V(k[1])])) + '<div class="chartwrap"></div><div class="tablewrap" style="margin:0;border:0;border-top:1px solid var(--rule);border-radius:0"><table><thead><tr><th>Method (64 bits)</th><th>Rel. squared error</th><th>Encode µs / vector</th><th>10-recall@10</th></tr></thead><tbody></tbody></table></div>');
  const host = q('.chartwrap'), items = [];
  const off = { 'PCA→8 dims + int8': [12, 4, 'start'], 'PQ 8×8': [12, 4, 'start'], 'OPQ 8×8': [12, 16, 'start'], 'RQ greedy': [-12, -10, 'end'], 'RQ beam 4': [0, -14, 'middle'], 'RQ beam 16': [0, 22, 'middle'], 'LSQ (ICM + restarts)': [-12, 16, 'end'], 'Predictive RQ + mode decision': [0, 24, 'middle'], 'Predictive RQ (always predict)': [12, -8, 'start'] };
  const P = plot(host, { w: 900, h: 400, pad: { l: 58, r: 28, t: 22, b: 46 }, xgrid: true, x: { min: 0.08, max: 800, log: true, ticks: [0.1, 1, 10, 100], fmt: v => v + ' µs', label: 'encode time per vector (log scale)' }, y: { min: 0.44, max: 0.8, label: 'relative squared error (lower is better)' } });
  rows.forEach(r => { const x = P.X(r.enc_us), y = P.Y(r.relmse), o = off[r.name] || [12, 4, 'start'], col = V(kinds[r.kind][1]);
    P.add(`<circle cx="${x}" cy="${y}" r="7" fill="${col}" stroke="var(--bg-2)" stroke-width="2"/><text x="${x + o[0]}" y="${y + o[1]}" text-anchor="${o[2]}" class="t-ink">${r.name.replace(' (always predict)', ', always').replace('Predictive RQ + mode decision', 'predictive + mode decision')}</text>`);
    items.push({ x, y, html: `<i style="background:${col}"></i><b>${r.name}</b><br>error ${r.relmse.toFixed(3)} · recall ${r.recall.toFixed(3)}<br>${r.enc_us < 10 ? r.enc_us.toFixed(1) : Math.round(r.enc_us)} µs to encode${r.note ? '<br>' + r.note : ''}` }); });
  P.done(); hover(host, 900, () => items);
  const best = Math.min(...rows.map(r => r.relmse)), bestR = Math.max(...rows.map(r => r.recall)), maxE = Math.max(...rows.map(r => r.relmse));
  q('tbody').innerHTML = rows.map(r => `<tr${r.kind === 'seq' ? ' class="hl"' : ''}><td><span style="color:${V(kinds[r.kind][1])}">●</span> ${r.name}${r.note ? `<br><span style="font-size:.76rem;color:var(--muted);font-weight:400">${r.note}${r.bits > 64 ? ', +1 flag bit' : ''}</span>` : ''}</td><td class="num">${r.relmse.toFixed(3)}<span class="bar" style="width:${(r.relmse / maxE * 4).toFixed(2)}rem;background:var(--k-res);opacity:.6"></span>${r.relmse === best ? ' <span class="g">best</span>' : ''}</td><td class="num">${r.enc_us < 10 ? r.enc_us.toFixed(1) : Math.round(r.enc_us)}</td><td class="num">${r.recall.toFixed(3)}${r.recall === bestR ? ' <span class="g">best</span>' : ''}</td></tr>`).join('');
});

/* ---------- entropy of the RQ indices ---------- */
CE.widget('code-entropy', el => {
  const E = DATA.code_entropy;
  const q = mk(el, '<div class="chart-title">How many bits does each stored index really need?</div><div class="chart-sub">ideal entropy coder, frequencies learned on the training books, measured on the database books</div>' + legend([['flat: 8 bits, as stored', V('faint')], ['using how often each codeword is used', V('s1')], ['also conditioning on the previous window', V('s2')]]) + '<div class="chartwrap"></div><div class="readout"></div>');
  const host = q('.chartwrap'), items = [];
  const P = plot(host, { w: 900, h: 300, pad: { l: 46, r: 16, t: 22, b: 40 }, x: { min: 0, max: E.length, ticks: [] }, y: { min: 0, max: 8.6, ticks: [0, 2, 4, 6, 8], label: 'bits per index' } });
  const gw = P.X(1) - P.X(0), bw = gw * 0.24;
  E.forEach((e, i) => { const x = P.X(i) + gw * 0.1, cond = Math.min(e.cond, e.marg);
    P.add(`<rect x="${x}" y="${P.Y(8)}" width="${bw}" height="${P.Y(0) - P.Y(8)}" rx="3" fill="none" stroke="${V('faint')}" stroke-dasharray="3 3"/>`);
    P.add(`<rect x="${x + bw + 2}" y="${P.Y(e.marg)}" width="${bw}" height="${P.Y(0) - P.Y(e.marg)}" rx="3" fill="${V('s1')}"/><text x="${x + bw * 1.5 + 2}" y="${P.Y(e.marg) - 5}" text-anchor="middle" class="t-ink">${e.marg.toFixed(1)}</text>`);
    P.add(`<rect x="${x + 2 * bw + 4}" y="${P.Y(cond)}" width="${bw}" height="${P.Y(0) - P.Y(cond)}" rx="3" fill="${V('s2')}"/><text x="${x + bw * 2.5 + 4}" y="${P.Y(cond) - 5}" text-anchor="middle" class="t-ink">${cond.toFixed(1)}</text>`);
    P.add(`<text x="${P.X(i) + gw / 2}" y="${P.Y(0) + 17}" text-anchor="middle">stage ${e.stage}</text>`);
    items.push({ x: P.X(i) + gw / 2, html: `<b>stage ${e.stage}</b><br>flat 8.0 bits<br>frequency model ${e.marg.toFixed(2)}<br>+ previous window ${cond.toFixed(2)}<br>same index as previous window: ${pct(e.repeat)}` }); });
  P.done(); hover(host, 900, () => items);
  const m = E.reduce((a, e) => a + e.marg, 0), c = E.reduce((a, e) => a + Math.min(e.marg, e.cond), 0);
  q('.readout').innerHTML = `8 stages: flat ${chip('64.0 bits', C.ink)} → frequency model ${chip(m.toFixed(1), C.bits)} → with the previous window ${chip(c.toFixed(1), C.bits)} bits <span class="dim">· stage 1 repeats its previous value ${pct(E[0].repeat)} of the time</span>`;
});

/* ---------- lossless: RQ depth sweep (ported) ---------- */
CE.widget('lossless-sweep', el => {
  el.innerHTML = `<svg id="ll-chart" class="dia" viewBox="0 0 900 400" role="img" aria-label="Lossless bits per vector versus number of RQ stages, split into code bits and residual bits."></svg>
    <div class="controls"><span class="seg" role="group" aria-label="Exact target"><button class="btn" id="ll-int8" aria-pressed="true">target: int8</button><button class="btn" id="ll-f16" aria-pressed="false">target: 16-bit fixed</button></span>
    <button class="btn" id="ll-temp" aria-pressed="false">+ previous-window correction</button></div><div class="readout" id="ll-out">&nbsp;</div>`;
  const svg = $('#ll-chart'), out = $('#ll-out');
  let tgt = 'int8', temporal = false, hoverM = null;
  const bI = $('#ll-int8'), bF = $('#ll-f16'), bT = $('#ll-temp');
  function draw() {
    const L = DATA.lossless[tgt], sw = L.sweep, d = DATA.props.d;
    const tot = r => temporal ? r.total_temporal : r.total, res = r => temporal ? r.resid_bits_temporal : r.resid_bits;
    const W = 900, H = 400, pl = 64, pr = 150, pt = 34, pb = 46;
    const raw = L.raw_bits * d;
    const ymax = Math.max(L['entropy only'], ...sw.map(tot)) + 30, ymin = Math.min(...sw.map(res)) - 40;
    const n = sw.length, X = m => pl + m / (n - 1) * (W - pl - pr), Y = v => pt + (ymax - v) / (ymax - ymin) * (H - pt - pb);
    let best = sw[0]; sw.forEach(r => { if (tot(r) < tot(best)) best = r; });
    let s = '';
    for (let v = Math.ceil(ymin / 50) * 50; v <= ymax; v += 50) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--rule)"/><text x="${pl - 8}" y="${Y(v) + 4}" text-anchor="end">${v.toLocaleString()}</text>`;
    [0, 4, 8, 12, 16, 20, 24].forEach(m => { s += `<text x="${X(m)}" y="${H - pb + 18}" text-anchor="middle">${m}</text>`; });
    // code cost band between residual and total
    s += `<polygon points="${sw.map(r => `${X(r.m)},${Y(tot(r))}`).join(' ')} ${sw.slice().reverse().map(r => `${X(r.m)},${Y(res(r))}`).join(' ')}" style="fill:var(--k-code);fill-opacity:.22;stroke:none"/>`;
    s += `<polyline points="${sw.map(r => `${X(r.m)},${Y(res(r))}`).join(' ')}" style="fill:none;stroke:var(--k-bits);stroke-width:2;stroke-dasharray:5 4"/>`;
    s += `<polyline points="${sw.map(r => `${X(r.m)},${Y(tot(r))}`).join(' ')}" style="fill:none;stroke:var(--k-bits);stroke-width:3.2"/>`;
    sw.forEach(r => { s += `<circle cx="${X(r.m)}" cy="${Y(tot(r))}" r="${r.m === hoverM ? 5.5 : 3}" style="fill:var(--k-bits)"/>`; });
    const base = [['entropy only', L['entropy only'], '--k-res'], ['previous window', L['previous window'], '--k-q']];
    base.forEach(([nm, v, c]) => { s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(${c});stroke-dasharray:7 5;stroke-width:1.8"/><text x="${W - pr + 8}" y="${Y(v) + 4}" style="fill:var(${c})">${nm}</text>`; });
    s += `<text x="${W - pr + 8}" y="${Y(tot(sw[n - 1])) + 4}" style="fill:var(--k-bits)">total</text><text x="${W - pr + 8}" y="${Y(res(sw[n - 1])) + 4}" style="fill:var(--k-bits)">residual only</text>`;
    const mid = sw[16]; s += `<text x="${X(16)}" y="${(Y(tot(mid)) + Y(res(mid))) / 2 + 5}" text-anchor="middle" class="t-hand" style="fill:var(--k-code)">code: 8m bits</text>`;
    s += `<circle cx="${X(best.m)}" cy="${Y(tot(best))}" r="7.5" style="fill:var(--k-vec);stroke:var(--bg-2);stroke-width:2"/><text x="${X(best.m)}" y="${Y(tot(best)) + 30}" text-anchor="middle" class="t-hand" style="fill:var(--k-vec)">best: m = ${best.m}</text>`;
    if (hoverM !== null) s += `<line x1="${X(hoverM)}" x2="${X(hoverM)}" y1="${pt}" y2="${H - pb}" style="stroke:var(--muted);stroke-dasharray:2 3"/>`;
    s += `<text x="${(pl + W - pr) / 2}" y="${H - 10}" text-anchor="middle">RQ stages m used as the predictor</text><text x="${pl}" y="18">bits per vector (axis zoomed; raw = ${raw.toLocaleString()})</text>`;
    svg.innerHTML = s;
    const r = hoverM === null ? best : sw[hoverM];
    out.innerHTML = `${hoverM === null ? 'best depth' : 'm = ' + r.m}: code ${chip(r.code_bits + ' b', C.code)} + residual ${chip(Math.round(res(r)).toLocaleString() + ' b', C.bits)} = ${chip(Math.round(tot(r)).toLocaleString() + ' bits/vector', C.vec)} &nbsp;·&nbsp; raw ${raw.toLocaleString()} (${chip('×' + (raw / tot(r)).toFixed(2) + ' smaller', C.dec)}) &nbsp;·&nbsp; entropy only ${Math.round(L['entropy only']).toLocaleString()} &nbsp;·&nbsp; previous window ${Math.round(L['previous window']).toLocaleString()}${temporal ? ` &nbsp;·&nbsp; β = ${r.beta.toFixed(2)}` : ''} &nbsp;·&nbsp; <span style="color:var(--muted)">hover the chart</span>`;
    svg._geom = { pl, W, pr, n };
  }
  svg.addEventListener('pointermove', e => { const g = svg._geom; if (!g) return; const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * 900; const m = Math.round((px - g.pl) / (g.W - g.pl - g.pr) * (g.n - 1)); const nm = m >= 0 && m < g.n ? m : null; if (nm !== hoverM) { hoverM = nm; draw(); } });
  svg.addEventListener('pointerleave', () => { hoverM = null; draw(); });
  bI.addEventListener('click', () => { tgt = 'int8'; bI.setAttribute('aria-pressed', 'true'); bF.setAttribute('aria-pressed', 'false'); draw(); });
  bF.addEventListener('click', () => { tgt = 'fixed16'; bF.setAttribute('aria-pressed', 'true'); bI.setAttribute('aria-pressed', 'false'); draw(); });
  bT.addEventListener('click', () => { temporal = !temporal; bT.setAttribute('aria-pressed', String(temporal)); draw(); });
  draw();
});

/* ---------- float bits (ported) ---------- */
CE.widget('float-bits', el => {
  el.innerHTML = `<div style="padding:.6rem .4rem .2rem"><svg id="bits-fig" class="dia" viewBox="0 0 900 290" role="img" aria-label="Per-bit entropy of float32 embedding values: sign 1 bit, exponent mostly predictable, mantissa all random."></svg></div>`;
  const svg = $('#bits-fig'); const B = DATA.floats;
  const W = 900, pl = 120, cw = (W - pl - 20) / 32; let s = '';
  const field = i => i === 0 ? '--k-q' : i <= 8 ? '--k-enc' : '--k-book';
  B.bits.forEach((bits, r) => {
    const y = 12 + r * 20; s += `<text x="${pl - 10}" y="${y + 13}" text-anchor="end" class="t-ink">${B.examples[r].toFixed(5)}</text>`;
    [...bits].forEach((b, i) => { s += `<rect x="${pl + i * cw + 1}" y="${y}" width="${cw - 2}" height="16" rx="2" style="fill:var(${field(i)});opacity:${b === '1' ? 0.95 : 0.18}"/>`; });
  });
  const y0 = 12 + B.bits.length * 20 + 26, hh = 90;
  s += `<text x="${pl - 10}" y="${y0 + 8}" text-anchor="end">entropy</text><text x="${pl - 10}" y="${y0 + 22}" text-anchor="end">per bit</text>`;
  s += `<line x1="${pl}" x2="${W - 20}" y1="${y0 + hh}" y2="${y0 + hh}" style="stroke:var(--rule)"/><line x1="${pl}" x2="${W - 20}" y1="${y0}" y2="${y0}" style="stroke:var(--rule);stroke-dasharray:3 3"/>`;
  B.bitH32.forEach((v, i) => { s += `<rect x="${pl + i * cw + 2}" y="${y0 + hh * (1 - v)}" width="${cw - 4}" height="${Math.max(1, hh * v)}" rx="2" style="fill:var(${field(i)})"/>`; });
  s += `<text x="${pl + 0.5 * cw}" y="${y0 + hh + 16}" text-anchor="middle" style="fill:var(--k-q)">s</text><text x="${pl + 4.5 * cw}" y="${y0 + hh + 16}" text-anchor="middle" style="fill:var(--k-enc)">exponent (8)</text><text x="${pl + 20.5 * cw}" y="${y0 + hh + 16}" text-anchor="middle" style="fill:var(--k-book)">mantissa (23): coin flips</text>`;
  s += `<text x="${W - 20}" y="${y0 - 6}" text-anchor="end" class="t-hand" style="fill:var(--k-bits)">sum ≈ ${B.bitH32.reduce((a, b) => a + b, 0).toFixed(1)} of 32 bits</text>`;
  svg.setAttribute('viewBox', `0 0 900 ${y0 + hh + 26}`);
  svg.innerHTML = s;

});

/* ---------- horizontal bars: the lossless ladder and the wire sizes ---------- */
function bars(el, title, sub, rows, raw, note) {
  // rows: [label, bits, kind('step'|'alt'|'best'|'base'), detail]
  const W = 900, rh = 34, pl = 330, pr = 150, H = rows.length * rh + 46, x0 = pl, x1 = W - pr, X = v => x0 + v / raw * (x1 - x0);
  let s = '';
  [0, 0.25, 0.5, 0.75, 1].forEach(t => { s += `<line class="grid" x1="${X(raw * t)}" x2="${X(raw * t)}" y1="8" y2="${H - 30}"/><text x="${X(raw * t)}" y="${H - 12}" text-anchor="middle">${num(raw * t / 8)} B</text>`; });
  rows.forEach(([lab, v, kind, det], i) => { const y = 12 + i * rh, col = kind === 'best' ? V('k-bits') : kind === 'alt' ? V('s6') : kind === 'base' ? V('faint') : V('s1');
    s += `<text x="${pl - 12}" y="${y + 15}" text-anchor="end" class="${kind === 'best' ? 't-ink' : ''}" style="${kind === 'best' ? 'font-weight:700' : ''}">${lab}</text><rect x="${x0}" y="${y}" width="${Math.max(2, X(v) - x0)}" height="${rh - 12}" rx="4" fill="${col}"/><text x="${X(v) + 8}" y="${y + 15}" class="t-ink">${num(v)} bits <tspan style="fill:var(--muted)">−${pct(1 - v / raw)}</tspan></text>`; });
  el.innerHTML = `<div class="chart-title">${title}</div><div class="chart-sub">${sub}</div><div class="chartwrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${s}</svg></div>${note ? `<div class="readout">${note}</div>` : ''}`;
}
CE.widget('ladder', el => {
  const d = DATA.ladder;
  bars(el, 'The lossless ladder: bits per vector for an exact int8 archive', 'each row adds one modelling idea · ideal entropy coder · held-out books · x axis in bytes', [
    ['raw int8, 8 bits per coordinate', d.flat, 'base'],
    ['+ a bell curve per coordinate', d.marginal, 'step'],
    ['+ predict from the previous window', d.temporal, 'step'],
    ['or: predict from earlier coordinates', d.chol, 'step'],
    ['both predictions together', d.temporal_chol, 'best'],
    ['RQ-8 code as side information', d.rq8, 'alt'],
    ['RQ-8 code + both predictions', d.rq8_temporal_chol, 'alt'],
  ], d.flat, `Best: ${chip(num(d.temporal_chol) + ' bits = ' + (d.temporal_chol / 8).toFixed(0) + ' bytes', C.bits)} per vector, ${chip((d.flat / d.temporal_chol).toFixed(2) + '× smaller', C.dec)} than raw int8. <span class="dim">Violet rows spend 64 bits on a quantizer code first; on these embeddings that does not pay for itself.</span>`);
});
CE.widget('wire-sizes', el => {
  const w = DATA.wire, d = DATA.ladder;
  bars(el, 'A search response on the wire: bits per vector', '50 result vectors per query, int8-exact, unrelated to each other in reading order · x axis in bytes', [
    ['raw int8', w.raw, 'base'],
    ['zstd -19 on the batch', w.zstd, 'step'],
    ['zstd with a trained dictionary', w.zstd_dict, 'step'],
    ['static bell curve per coordinate + ANS', w.static_model, 'step'],
    ['+ predict from earlier coordinates', d.wire_chol, 'best'],
    ['client already holds the RQ-8 code', d.wire_rq8_chol_given_code, 'alt'],
  ], w.raw, `General-purpose zstd saves ${chip(pct(1 - w.zstd / w.raw), C.ink)}; a model shipped with the client saves ${chip(pct(1 - d.wire_chol / w.raw), C.bits)}. <span class="dim">The model is two small tables (means and a triangular matrix) that both sides load once.</span>`);
});

/* ---------- the PDF view: histogram, model, code length ---------- */
CE.widget('pdf-models', el => {
  const H = DATA.ladder.hist;
  const sets = { centred: 'a coordinate, mean removed', temporal: 'after predicting from the previous window', chol: 'after predicting from earlier coordinates', temporal_chol: 'after both predictions' };
  const q = mk(el, '<div class="chart-title">What is left to code, and the model that prices it</div><div class="chart-sub">bars: measured histogram, pooled over all coordinates, in int8 steps · line: the model q · code length of value k is −log₂ q(k)</div><div class="chartwrap"></div>' +
    '<div class="controls"><label>data <select id="pm-d">' + Object.entries(sets).map(([k, v]) => `<option value="${k}">${v}</option>`).join('') + '</select></label><span class="seg" id="pm-m"><button class="btn" data-m="gauss" aria-pressed="true">Gaussian</button><button class="btn" data-m="laplace" aria-pressed="false">Laplace</button><button class="btn" data-m="flat" aria-pressed="false">flat 8 bits</button></span><label>model width × <input type="range" id="pm-w" min="0.4" max="2.5" step="0.05" value="1"></label><output id="pm-wv">1.00</output></div><div class="readout"></div>');
  const host = q('.chartwrap'), out = q('.readout'); let model = 'gauss';
  function draw() {
    const key = q('#pm-d').value, h = H[key].h, sd = H[key].sd, mean = H[key].mean, n = h.reduce((a, b) => a + b, 0), wm = +q('#pm-w').value;
    q('#pm-wv').textContent = wm.toFixed(2);
    const p = h.map(v => v / n), s = sd * wm, b = sd / Math.SQRT2 * wm;
    const qk = k => model === 'flat' ? 1 / 256 : model === 'gauss' ? L.Phi((k + 0.5 - mean) / s) - L.Phi((k - 0.5 - mean) / s) : L.lapCdf(k + 0.5 - mean, b) - L.lapCdf(k - 0.5 - mean, b);
    let Hemp = 0, CEn = 0; p.forEach((v, i) => { if (v > 0) { Hemp -= v * Math.log2(v); CEn -= v * Math.log2(Math.max(qk(i - 100), 1e-12)); } });
    const ymax = Math.max(...p) * 1.25;
    const P = plot(host, { w: 900, h: 320, pad: { l: 52, r: 16, t: 22, b: 44 }, x: { min: -80, max: 80, ticks: [-80, -60, -40, -20, 0, 20, 40, 60, 80], label: 'value to code, in int8 steps (1 step ≈ 0.0022)' }, y: { min: 0, max: ymax, fmt: v => pct(v, 1), label: 'probability' } });
    const bw = P.X(1) - P.X(0);
    for (let k = -80; k <= 80; k++) { const v = p[k + 100]; if (v > 0) P.add(`<rect x="${(P.X(k) - bw / 2 + 0.4).toFixed(1)}" y="${P.Y(v).toFixed(1)}" width="${(bw - 0.8).toFixed(1)}" height="${(P.Y(0) - P.Y(v)).toFixed(1)}" fill="${V('k-vec')}" opacity=".7"/>`); }
    const pts = []; for (let k = -80; k <= 80; k += 1) pts.push([k, Math.min(ymax, qk(k))]);
    P.line(pts, V('k-bits'), 2.5); P.done();
    const d = DATA.props.rank;
    out.innerHTML = `spread σ = ${chip(sd.toFixed(1) + ' steps', C.vec)} · entropy of the histogram ${chip(Hemp.toFixed(2) + ' bits', C.ink)} · this model charges ${chip(CEn.toFixed(2) + ' bits', C.bits)} per coordinate · wasted (KL) ${chip((CEn - Hemp).toFixed(3) + ' bits', CEn - Hemp > 0.05 ? C.res : C.dec)} · × ${d} coordinates ≈ ${chip(num(CEn * d) + ' bits per vector', C.bits)}`;
  }
  q('#pm-d').addEventListener('change', draw); q('#pm-w').addEventListener('input', draw);
  el.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { model = b.dataset.m; el.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); }));
  draw();
});

/* ---------- conditional spread per coordinate ---------- */
CE.widget('cond-std', el => {
  const a = DATA.ladder.marg_std, b = DATA.ladder.cond_std, n = a.length;
  const q = mk(el, '<div class="chart-title">How much of each coordinate do the earlier ones already explain?</div><div class="chart-sub">spread (in int8 steps) of coordinate j on its own, and after predicting it from coordinates 1…j−1</div>' + legend([['on its own', V('s1'), true], ['given the coordinates before it', V('s2'), true]]) + '<div class="chartwrap"></div><div class="readout"></div>');
  const host = q('.chartwrap'), items = [];
  const P = plot(host, { w: 900, h: 300, pad: { l: 46, r: 16, t: 22, b: 44 }, x: { min: 0, max: n, ticks: [1, 64, 128, 192, 256, 320, 382], label: 'coordinate j, in the model\'s own order' }, y: { min: 0, max: 30, label: 'spread σ (int8 steps)' } });
  P.line(a.map((v, i) => [i + 0.5, v]), V('s1'), 1.4); P.line(b.map((v, i) => [i + 0.5, v]), V('s2'), 1.8);
  for (let i = 0; i < n; i += 4) items.push({ x: P.X(i + 0.5), html: `<b>coordinate ${i + 1}</b><br>on its own σ = ${a[i].toFixed(1)}<br>given the first ${i} coordinates σ = ${b[i].toFixed(1)}<br>saves ${Math.log2(a[i] / b[i]).toFixed(2)} bits` });
  P.done(); hover(host, 900, () => items);
  const bits = a.reduce((s, v, i) => { const t = Math.log2(v / b[i]); return s + (isFinite(t) ? t : 0); }, 0);
  q('.readout').innerHTML = `The first coordinate has nothing to lean on. By the last, the spread has fallen from about ${chip(a[n - 1].toFixed(0), C.ink)} to ${chip(b[n - 1].toFixed(0), C.bits)} steps. Summed over all coordinates the saving is ${chip(num(bits) + ' bits per vector', C.bits)}: the area between the two curves on a log scale.`;
});

/* ---------- side information: how many bits to spend on it ---------- */
CE.widget('side-info', el => {
  const Ls = DATA.lossless, pca = Ls.pca_side.slice().sort((a, b) => a.side_bits - b.side_bits), rq = Ls.int8.sweep, base = Ls.int8['entropy only'], chol = DATA.ladder.chol;
  const q = mk(el, '<div class="chart-title">Spending bits on side information: where is the minimum?</div><div class="chart-sub">total = side-information bits + residual bits, int8-exact, held-out books · residual coded with one bell curve per coordinate</div>' + legend([['PCA coefficients, quantized with step s', V('s2'), true], ['RQ code, 8 bits per stage', V('s3'), true]]) + '<div class="chartwrap"></div><div class="readout"></div>');
  const host = q('.chartwrap'), out = q('.readout'), items = [];
  const P = plot(host, { w: 900, h: 380, pad: { l: 62, r: 150, t: 22, b: 46 }, x: { min: 0, max: 2300, label: 'bits spent on side information (per vector)' }, y: { min: 2220, max: 2500, label: 'total bits per vector (axis zoomed; raw = 3,072)' } });
  [[base, 'no side information', 'muted'], [chol, 'triangular prediction instead', 'k-bits']].forEach(([v, t, c]) => P.add(`<line x1="${P.p.l}" x2="${900 - P.p.r}" y1="${P.Y(v)}" y2="${P.Y(v)}" stroke="${V(c)}" stroke-dasharray="6 5" stroke-width="1.6"/><text x="${900 - P.p.r + 8}" y="${P.Y(v) + 4}" style="fill:${V(c)}">${t}</text>`));
  P.line(pca.map(r => [r.side_bits, r.total]), V('s2'), 2.4).dots(pca.map(r => [r.side_bits, r.total]), V('s2'), 4);
  P.line(rq.map(r => [r.code_bits, r.total]), V('s3'), 2.4).dots(rq.filter(r => r.m % 4 === 0).map(r => [r.code_bits, r.total]), V('s3'), 4);
  const bp = pca.reduce((a, r) => (r.total < a.total ? r : a)), br = rq.reduce((a, r) => (r.total < a.total ? r : a));
  P.add(`<circle cx="${P.X(bp.side_bits)}" cy="${P.Y(bp.total)}" r="8" fill="none" stroke="${V('k-vec')}" stroke-width="2.5"/><text x="${P.X(bp.side_bits)}" y="${P.Y(bp.total) + 26}" text-anchor="middle" class="t-hand" style="fill:${V('k-vec')}">minimum: step ${bp.s}</text>`);
  P.add(`<circle cx="${P.X(br.code_bits)}" cy="${P.Y(br.total)}" r="8" fill="none" stroke="${V('k-vec')}" stroke-width="2.5"/><text x="${P.X(br.code_bits) + 12}" y="${P.Y(br.total) - 12}" class="t-hand" style="fill:${V('k-vec')}">minimum: ${br.m} stages</text>`);
  pca.forEach(r => items.push({ x: P.X(r.side_bits), y: P.Y(r.total), html: `<i style="background:${V('s2')}"></i><b>PCA side info, step ${r.s}</b><br>side ${num(r.side_bits)} + residual ${num(r.resid_bits)}<br>= <b>${num(r.total)} bits</b>` }));
  rq.forEach(r => items.push({ x: P.X(r.code_bits), y: P.Y(r.total), html: `<i style="background:${V('s3')}"></i><b>RQ, ${r.m} stages</b><br>code ${r.code_bits} + residual ${num(r.resid_bits)}<br>= <b>${num(r.total)} bits</b><br>quantizer error ${r.relmse.toFixed(3)}` }));
  P.done(); hover(host, 900, () => items);
  out.innerHTML = `PCA side information: best at step ${chip(bp.s, C.ink)}, ${chip(num(bp.side_bits) + ' + ' + num(bp.resid_bits) + ' = ' + num(bp.total), C.bits)} bits · RQ: best at ${chip(br.m + ' stages', C.ink)}, ${chip(num(br.total), C.bits)} bits · no side information ${num(base)} <span class="dim">· both curves are shallow bowls: too little side information leaves correlation unused, too much describes noise twice</span>`;
});

/* ---------- LSH: collision probability, measured ---------- */
CE.widget('lsh-collision', el => {
  const S = DATA.lsh;
  const q = mk(el, '<div class="chart-title">One random hyperplane: how often do two vectors land on the same side?</div><div class="chart-sub">dots: measured over 2,048 hyperplanes on real query–passage pairs · line: 1 − θ/π</div><div class="chartwrap"></div><div class="readout"></div>');
  const host = q('.chartwrap'), items = [];
  const P = plot(host, { w: 900, h: 320, pad: { l: 52, r: 20, t: 22, b: 46 }, xgrid: true, x: { min: 0, max: 180, ticks: [0, 30, 60, 90, 120, 150, 180], fmt: v => v + '°', label: 'angle θ between the two vectors' }, y: { min: 0, max: 1, label: 'P(same bit)' } });
  P.line([[0, 1], [180, 0]], V('k-code'), 2.2);
  const deg = r => r * 180 / Math.PI;
  S.collision.forEach(c => { P.add(`<circle cx="${P.X(deg(c[0]))}" cy="${P.Y(c[1])}" r="4.5" fill="${V('k-vec')}" stroke="var(--bg-2)" stroke-width="1.5"/>`); items.push({ x: P.X(deg(c[0])), y: P.Y(c[1]), html: `<b>θ ≈ ${deg(c[0]).toFixed(0)}°</b> (cosine ${Math.cos(c[0]).toFixed(2)})<br>measured ${c[1].toFixed(3)}<br>theory ${(1 - c[0] / Math.PI).toFixed(3)}<br>${c[2]} pairs` }); });
  [[S.cosc_nn10, '10th neighbour', 'k-dec'], [S.cosc_rand, 'random pair', 'k-res']].forEach(([c, t, col]) => { const a = deg(Math.acos(c)); P.add(`<line x1="${P.X(a)}" x2="${P.X(a)}" y1="${P.p.t}" y2="${P.Y(0)}" stroke="${V(col)}" stroke-dasharray="4 4"/><text x="${P.X(a) + (col === 'k-dec' ? -6 : 6)}" y="${P.p.t + 12}" text-anchor="${col === 'k-dec' ? 'end' : 'start'}" style="fill:${V(col)}">${t}: ${a.toFixed(0)}°</text>`); });
  P.done(); hover(host, 900, () => items);
  const p1 = 1 - Math.acos(S.cosc_nn10) / Math.PI, p2 = 1 - Math.acos(S.cosc_rand) / Math.PI;
  q('.readout').innerHTML = `On this data a true 10th neighbour agrees on a bit with probability ${chip(p1.toFixed(3), C.dec)}, a random pair with ${chip(p2.toFixed(3), C.res)}. <span class="dim">One bit barely tells them apart. Everything on the next page is about widening that gap.</span>`;
});

/* ---------- LSH: recall versus work, against IVF ---------- */
CE.widget('lsh-frontier', el => {
  const ix = DATA.lsh.index;
  const q = mk(el, '<div class="chart-title">Hashing versus clustering as an index, on the same vectors</div><div class="chart-sub">' + num(DATA.lsh.N) + ' database windows, 500 queries · up and to the left is better</div>' + legend([['LSH, k bits × L tables', V('s1'), true], ['multi-probe LSH', V('s5'), true], ['IVF (k-means), nprobe lists', V('s3'), true]]) + '<div class="chartwrap"></div><div class="readout"></div>');
  const host = q('.chartwrap'), items = [];
  const P = plot(host, { w: 900, h: 400, pad: { l: 52, r: 60, t: 22, b: 46 }, xgrid: true, x: { min: 0.0005, max: 0.7, log: true, ticks: [0.001, 0.01, 0.1, 0.5], fmt: v => pct(v, v < 0.01 ? 1 : 0), label: 'share of the database compared with the query (log scale)' }, y: { min: 0, max: 1, label: '10-recall@10' } });
  const series = (flt, col, lab) => { const pts = ix.filter(flt).filter(r => r.frac >= 0.0005).sort((a, b) => a.frac - b.frac); if (!pts.length) return; P.line(pts.map(r => [r.frac, r.recall]), V(col), 2); P.dots(pts.map(r => [r.frac, r.recall]), V(col), 3.5);
    const e = pts[pts.length - 1]; P.add(`<text x="${P.X(e.frac) + 7}" y="${P.Y(e.recall) + 4}" style="fill:${V(col)}">${lab}</text>`);
    pts.forEach(r => items.push({ x: P.X(r.frac), y: P.Y(r.recall), html: `<i style="background:${V(col)}"></i><b>${r.kind.startsWith('ivf') ? 'IVF, ' + r.kind.slice(3) + ' lists, nprobe ' + r.nprobe : (r.kind === 'multiprobe' ? 'multi-probe ' : '') + 'LSH k=' + r.k + ', L=' + r.L}</b><br>compares ${pct(r.frac, 1)} of the database<br>recall ${r.recall.toFixed(3)}` })); };
  [8, 10, 12, 14].forEach(k => series(r => r.kind === 'lsh' && r.k === k, 's1', 'k=' + k));
  [12, 16].forEach(k => series(r => r.kind === 'multiprobe' && r.k === k, 's5', 'mp ' + k));
  series(r => r.kind === 'ivf64', 's3', 'IVF64'); series(r => r.kind === 'ivf256', 's3', 'IVF256');
  P.done(); hover(host, 900, () => items);
  const g = (kind, kw) => ix.find(r => r.kind === kind && Object.keys(kw).every(k => r[k] === kw[k]));
  const a = g('lsh', { k: 8, L: 16 }), b = g('ivf256', { nprobe: 16 });
  q('.readout').innerHTML = `At about ${pct(b.frac)} of the database: LSH (k = 8, 16 tables) finds ${chip(pct(a.recall), C.res)} of the true neighbours, IVF with 256 lists finds ${chip(pct(b.recall), C.dec)}. <span class="dim">Each LSH curve runs from 1 table (left) to 64 (right).</span>`;
});

/* ---------- bits as a sketch: recall after re-ranking ---------- */
CE.widget('sketch-recall', el => {
  const S = DATA.lsh.sketch, kinds = [['simhash', 'random hyperplanes, Hamming', 's1'], ['asym', 'same bits, float query (asymmetric)', 's2'], ['pca_sign', 'signs of PCA coefficients', 's4']];
  const q = mk(el, '<div class="chart-title">Sign bits as a compressed sketch</div><div class="chart-sub">rank the database by the sketch, keep a shortlist, re-rank it exactly · 10-recall@10 versus sketch size</div>' + legend(kinds.map(k => [k[1], V(k[2]), true]).concat([['384-bit special cases (labelled)', V('s3')]])) + '<div class="chartwrap"></div><div class="controls"><label>shortlist re-ranked exactly</label><span class="seg">' + [10, 30, 100, 300, 1000].map(r => `<button class="btn" data-r="${r}" aria-pressed="${r === 100}">${r}</button>`).join('') + '</span></div><div class="readout"></div>');
  const host = q('.chartwrap'), items = []; let R = '100';
  function draw() {
    const P = plot(host, { w: 900, h: 380, pad: { l: 52, r: 24, t: 22, b: 46 }, xgrid: true, x: { min: 52, max: 1900, log: true, ticks: [64, 128, 256, 384, 768, 1536], fmt: v => v, label: 'sketch size in bits (log scale) · 384 bits = 1 bit per dimension = 48 bytes' }, y: { min: 0, max: 1, label: '10-recall@10 after re-ranking' } });
    items.length = 0;
    kinds.forEach(([k, name, col]) => { const pts = S.filter(s => s.kind === k).sort((a, b) => a.bits - b.bits); P.line(pts.map(s => [s.bits, s[R]]), V(col), 2.2).dots(pts.map(s => [s.bits, s[R]]), V(col), 4); pts.forEach(s => items.push({ x: P.X(s.bits), y: P.Y(s[R]), html: `<i style="background:${V(col)}"></i><b>${name}</b><br>${s.bits} bits · shortlist ${R}<br>recall ${s[R].toFixed(3)}` })); });
    [['coord_sign', 'signs of the raw coordinates', 14, 'start'], ['rot_asym', 'random rotation + float query', -10, 'start']].forEach(([k, name, dy, an]) => { const s = S.find(x => x.kind === k); if (!s) return; P.add(`<circle cx="${P.X(s.bits)}" cy="${P.Y(s[R])}" r="6" fill="${V('s3')}" stroke="var(--bg-2)" stroke-width="2"/><text x="${P.X(s.bits) + 10}" y="${P.Y(s[R]) + dy}" text-anchor="${an}" class="t-ink">${name}</text>`); items.push({ x: P.X(s.bits), y: P.Y(s[R]), html: `<i style="background:${V('s3')}"></i><b>${name}</b><br>384 bits · shortlist ${R}<br>recall ${s[R].toFixed(3)}` }); });
    P.done();
    const g = (k, b) => S.find(s => s.kind === k && s.bits === b);
    q('.readout').innerHTML = `Shortlist ${chip(R, C.q)}: 384 random-hyperplane bits give recall ${chip(g('simhash', 384)[R].toFixed(2), C.ink)}; scoring the same kind of bits against the un-quantized query gives ${chip(g('rot_asym', 384)[R].toFixed(2), C.dec)}; 1,536 bits give ${chip(g('asym', 1536)[R].toFixed(2), C.dec)}.`;
  }
  el.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { R = b.dataset.r; el.querySelectorAll('[data-r]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); }));
  draw(); hover(host, 900, () => items);
});

/* ---------- angle estimated from b bits ---------- */
CE.widget('sketch-estimate', el => {
  const E = DATA.lsh.estimate;
  const q = mk(el, '<div class="chart-title">Estimating a cosine from sign bits</div><div class="chart-sub">400 real pairs · x: true cosine · y: cosine recovered from the fraction of agreeing bits</div><div class="chartwrap"></div><div class="controls"><label>bits</label><span class="seg">' + Object.keys(E).map(b => `<button class="btn" data-b="${b}" aria-pressed="${b === '256'}">${b}</button>`).join('') + '</span></div><div class="readout"></div>');
  const host = q('.chartwrap'); let b = '256';
  function draw() {
    const P = plot(host, { w: 900, h: 340, pad: { l: 52, r: 20, t: 22, b: 46 }, xgrid: true, x: { min: -0.4, max: 0.9, label: 'true cosine' }, y: { min: -0.6, max: 1, label: 'estimated cosine' } });
    P.line([[-0.4, -0.4], [0.9, 0.9]], V('faint'), 1.5, '5 4');
    E[b].pts.forEach(p => P.add(`<circle cx="${P.X(p[0]).toFixed(1)}" cy="${P.Y(Math.max(-0.6, Math.min(1, p[1]))).toFixed(1)}" r="2.6" fill="${V('k-code')}" opacity=".7"/>`));
    P.done();
    q('.readout').innerHTML = `${chip(b + ' bits', C.code)}: typical error of the estimated angle ${chip((E[b].rmse * 180 / Math.PI).toFixed(1) + '°', C.res)} (theory ${(E[b].theory * 180 / Math.PI).toFixed(1)}°) <span class="dim">· four times the bits halves the error</span>`;
  }
  el.querySelectorAll('[data-b]').forEach(x => x.addEventListener('click', () => { b = x.dataset.b; el.querySelectorAll('[data-b]').forEach(y => y.setAttribute('aria-pressed', y === x)); draw(); }));
  draw();
});

})();
