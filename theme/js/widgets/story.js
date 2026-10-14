/* Interactive figures for the running example (real data). Ported from the original "Codebooks that add up" post. */
(function () {
'use strict';
const { C, setup, view, grid, dot, arrow, rgba, mix, mulberry32, gaussFn, draggable, redraws, chip, fmt, esc, reduceMotion } = CE.lib;
const $ = s => document.querySelector(s);

CE.widget('pipeline', el => {
  el.innerHTML = `<div class="diawrap">  <svg class="dia" viewBox="0 0 940 250" role="img" aria-label="A book is split into overlapping 48-word windows with stride 24; each window is embedded into a unit vector, giving a sequence of vectors.">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill:var(--faint)"/></marker></defs>
    <text x="20" y="28" class="t-big">a book</text>
    <rect x="20" y="40" width="380" height="26" rx="5" class="box"/>
    <g style="font-size:11px">
      <text x="30" y="58" class="t-ink">Call me Ishmael. Some years ago—never mind how long…</text>
    </g>
    <g>
      <rect x="20" y="80" width="150" height="16" rx="4" style="fill:var(--k-vec);opacity:.85"/>
      <rect x="95" y="102" width="150" height="16" rx="4" style="fill:var(--k-vec);opacity:.6"/>
      <rect x="170" y="124" width="150" height="16" rx="4" style="fill:var(--k-vec);opacity:.4"/>
      <rect x="245" y="146" width="150" height="16" rx="4" style="fill:var(--k-vec);opacity:.25"/>
      <text x="30" y="92" style="fill:var(--bg);font-size:10px">window 0 · words 0–47</text>
      <text x="105" y="114" style="fill:var(--bg);font-size:10px">window 1 · words 24–71</text>
      <text x="20" y="190">48-word windows, stride 24:</text>
      <text x="20" y="206">each overlaps its neighbours by half</text>
    </g>
    <path class="ln" d="M410 120 H 500" marker-end="url(#ah)"/>
    <text x="455" y="110" text-anchor="middle" class="t-hand" style="fill:var(--k-enc)">embed</text>
    <text x="455" y="140" text-anchor="middle">model</text>
    <g transform="translate(510,40)">
      <text x="0" y="-8" class="t-big">a sequence of unit vectors</text>
      <g id="seqbars"></g>
      <text x="0" y="190">x₀, x₁, x₂, … each ∈ ℝ³⁰⁰ (or 384, 768, 1536…), ‖x‖ = 1</text>
    </g>
  </svg></div>`;
  const g = $('#seqbars'); if (!g || !DATA) return;
  const S = DATA.props.seqbars; let s = '';
  const mx = Math.max(...S.flat().map(Math.abs));
  S.forEach((col, i) => col.forEach((v, j) => {
    const a = Math.min(1, Math.abs(v) / mx * 1.4);
    s += `<rect x="${i * 30}" y="${6 + j * 6.4}" width="26" height="5.4" rx="1.2" style="fill:var(${v >= 0 ? '--k-vec' : '--k-book'});opacity:${(0.12 + 0.88 * a).toFixed(2)}"/>`;
  }));
  S.forEach((_, i) => { s += `<text x="${i * 30 + 13}" y="${6 + 24 * 6.4 + 14}" text-anchor="middle" style="font-size:10px">x${['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'][i] || ''}${i > 9 ? i : ''}</text>`; });
  g.innerHTML = s;
});

CE.widget('locality', el => {
  el.innerHTML = `<div class="two">
      <canvas id="cv-sim" style="height:min(78vw,430px)" aria-label="Cosine similarity matrix of 240 consecutive windows of Moby-Dick."></canvas>
      <div class="side"><canvas id="cv-traj" style="height:min(78vw,430px)" aria-label="The same windows as a path in the plane of their top two principal directions."></canvas></div>
    </div>
    <div class="snip" id="sim-out">Hover a cell or a point.</div>`;
  const cv = $('#cv-sim'), ct = $('#cv-traj'), out = $('#sim-out'); if (!cv || !DATA) return;
  const M = DATA.props.moby, N = M.sim.length, chs = M.chapters;
  const chOf = i => { let c = 0; chs.forEach((b, k) => { if (i >= b[0]) c = k; }); return c; };
  const chCol = () => [C.vec, C.code, C.dec];
  let hover = null, img = null, imgTheme = null, Lsim = null, Ltr = null;
  function buildImg() {
    const off = document.createElement('canvas'); off.width = N; off.height = N;
    const x = off.getContext('2d'), id = x.createImageData(N, N);
    const stops = [C.bg2, C.q, C.code, C.vec];
    const vals = []; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) vals.push(M.sim[i][j]);
    vals.sort((a, b) => a - b); const lo = vals[Math.floor(vals.length * 0.30)], hi = vals[Math.floor(vals.length * 0.995)];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const v = Math.max(0, Math.min(1, (M.sim[i][j] - lo) / (hi - lo)));
      const t = Math.pow(v, 1.15) * 3, k = Math.min(2, Math.floor(t)), c = mix(stops[k], stops[k + 1], t - k);
      const p = (i * N + j) * 4; id.data[p] = c[0]; id.data[p + 1] = c[1]; id.data[p + 2] = c[2]; id.data[p + 3] = 255;
    }
    x.putImageData(id, 0, 0); img = off; imgTheme = C.bg2;
  }
  function drawSim() {
    if (!img || imgTheme !== C.bg2) buildImg();
    const { ctx, w, h } = setup(cv);
    const S = Math.min(w - 50, h - 40), ox = 34 + (w - 34 - S) / 2, oy = 14;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(img, ox, oy, S, S);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
    ctx.strokeStyle = rgba(C.ink, 0.85); ctx.lineWidth = 1.2;
    chs.forEach((b, k) => { const p = ox + Math.max(0, b[0]) / N * S; ctx.beginPath(); ctx.moveTo(p, oy - 6); ctx.lineTo(p, oy); ctx.moveTo(ox - 6, oy + Math.max(0, b[0]) / N * S); ctx.lineTo(ox, oy + Math.max(0, b[0]) / N * S); ctx.stroke(); ctx.save(); ctx.fillStyle = chCol()[k]; ctx.textAlign = 'right'; ctx.fillText('Ch ' + (k + 1), ox - 8, oy + Math.max(0, b[0]) / N * S + 14); ctx.restore(); });
    ctx.textAlign = 'center'; ctx.fillStyle = C.muted; ctx.fillText('window j →', ox + S / 2, oy + S + 16);
    if (hover) {
      const [i, j] = hover; ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
      ctx.strokeRect(ox + j / N * S - 2, oy + i / N * S - 2, S / N + 4, S / N + 4);
      ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(ox, oy + (i + .5) / N * S); ctx.lineTo(ox + S, oy + (i + .5) / N * S); ctx.moveTo(ox + (j + .5) / N * S, oy); ctx.lineTo(ox + (j + .5) / N * S, oy + S); ctx.stroke(); ctx.setLineDash([]);
    }
    Lsim = { ox, oy, S };
  }
  function drawTraj() {
    const { ctx, w, h } = setup(ct);
    const T = M.traj; let xs = T.map(p => p[0]), ys = T.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 22;
    const sc = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad - 60) / (y1 - y0));
    const X = x => pad + (x - x0) * sc + ((w - 2 * pad) - (x1 - x0) * sc) / 2, Y = y => h - pad - 50 - (y - y0) * sc;
    const cc = chCol(), Wd = 6;
    const Sm = T.map((_, i) => { let a = 0, b = 0, n = 0; for (let k = Math.max(0, i - Wd); k <= Math.min(T.length - 1, i + Wd); k++) { a += T[k][0]; b += T[k][1]; n++; } return [a / n, b / n]; });
    for (let i = 1; i < T.length; i++) { ctx.strokeStyle = rgba(cc[chOf(i)], 0.16); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(T[i - 1][0]), Y(T[i - 1][1])); ctx.lineTo(X(T[i][0]), Y(T[i][1])); ctx.stroke(); }
    T.forEach((p, i) => dot(ctx, X(p[0]), Y(p[1]), 2.2, rgba(cc[chOf(i)], 0.55)));
    for (let i = 1; i < Sm.length; i++) { ctx.strokeStyle = cc[chOf(i)]; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(X(Sm[i - 1][0]), Y(Sm[i - 1][1])); ctx.lineTo(X(Sm[i][0]), Y(Sm[i][1])); ctx.stroke(); }
    ctx.font = '12px "JetBrains Mono", monospace'; chs.forEach((c, k) => { const ly = h - 12 - (chs.length - 1 - k) * 17; dot(ctx, 16, ly - 4, 4.5, cc[k]); ctx.fillStyle = cc[k]; ctx.textAlign = 'left'; ctx.fillText('Ch ' + (k + 1) + ' · ' + c[1], 26, ly); });
    dot(ctx, X(T[0][0]), Y(T[0][1]), 5, null, C.ink, 2);
    ctx.font = '19px Caveat, cursive'; ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText('start', X(T[0][0]) + 8, Y(T[0][1]) - 6);
    if (hover) { const ids = hover[0] === hover[1] ? [hover[0]] : hover; ids.forEach((i, k) => dot(ctx, X(T[i][0]), Y(T[i][1]), 7, null, k ? C.q : C.ink, 2.5)); }
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.fillText('top-2 principal plane · thick = 13-window average', 10, 16);
    Ltr = { X, Y };
  }
  function show() {
    if (!hover) { out.innerHTML = 'Hover a cell or a point.'; return; }
    const [i, j] = hover, cc = chCol();
    const line = (k, lab) => `<div><span class="tag" style="color:${cc[chOf(k)]}">${lab} ${k} · Ch ${chOf(k) + 1}</span>${esc(M.snip[k])}</div>`;
    out.innerHTML = i === j ? line(i, 'window') : line(i, 'row') + `<div style="margin:.3rem 0"><span class="tag" style="color:var(--k-q)">cosine ${(M.sim[i][j] / 100).toFixed(2)}</span></div>` + line(j, 'col');
  }
  function draw() { drawSim(); drawTraj(); show(); }
  cv.addEventListener('pointermove', e => {
    if (!Lsim) return; const r = cv.getBoundingClientRect(), px = e.clientX - r.left - Lsim.ox, py = e.clientY - r.top - Lsim.oy;
    if (px < 0 || py < 0 || px >= Lsim.S || py >= Lsim.S) return;
    const j = Math.floor(px / Lsim.S * N), i = Math.floor(py / Lsim.S * N);
    if (!hover || hover[0] !== i || hover[1] !== j) { hover = [i, j]; draw(); }
  });
  ct.addEventListener('pointermove', e => {
    if (!Ltr) return; const r = ct.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    let b = -1, bd = 26; M.traj.forEach((p, i) => { const d = Math.hypot(Ltr.X(p[0]) - px, Ltr.Y(p[1]) - py); if (d < bd) { bd = d; b = i; } });
    if (b >= 0 && (!hover || hover[0] !== b || hover[1] !== b)) { hover = [b, b]; draw(); }
  });
  hover = [12, 12];
  redraws.push(() => { img = null; draw(); }); draw();
});

CE.widget('adc', el => {
  el.innerHTML = `<div class="diawrap">  <svg class="dia" viewBox="0 0 900 260" role="img" aria-label="ADC: a query builds four lookup tables; a code picks one cell from each; the cells are summed and a stored norm is added.">
    <rect class="box" x="10" y="95" width="110" height="60" rx="10"/>
    <text x="65" y="122" text-anchor="middle" class="t-big" style="fill:var(--k-q)">query q</text>
    <text x="65" y="142" text-anchor="middle">exact floats</text>
    <path class="ln" d="M120 125 H 175" marker-end="url(#ah)"/>
    <text x="148" y="115" text-anchor="middle">⟨q,c⟩</text>
    <g id="luts"></g>
    <text x="330" y="250" text-anchor="middle">M tables × K entries, built once per query</text>
    <rect class="box" x="560" y="20" width="150" height="56" rx="10" style="stroke:var(--k-code);stroke-width:2"/>
    <text x="635" y="44" text-anchor="middle" class="t-ink">code of x</text>
    <text x="635" y="64" text-anchor="middle" style="fill:var(--k-code)">[5, 2, 7, 0] + n</text>
    <path class="ln" d="M500 125 H 590" marker-end="url(#ah)"/>
    <text x="545" y="115" text-anchor="middle">M lookups</text>
    <rect class="box" x="590" y="100" width="130" height="50" rx="10"/>
    <text x="655" y="130" text-anchor="middle" class="t-big">Σ T_m[i_m]</text>
    <path class="ln" d="M720 125 H 770" marker-end="url(#ah)"/>
    <rect class="box" x="770" y="90" width="120" height="70" rx="10"/>
    <text x="830" y="118" text-anchor="middle" class="t-ink" style="fill:var(--k-q)">score</text>
    <text x="830" y="138" text-anchor="middle">‖x̂‖² − 2⟨q,x̂⟩</text>
    <text x="700" y="200" text-anchor="middle" style="fill:var(--k-enc)">n: ‖x̂‖² stored in 1 extra byte</text>
    <text x="700" y="218" text-anchor="middle">(L2 search with additive codes only)</text>
  </svg></div>`;
  const g = $('#luts'); if (!g) return; const code = [5, 2, 7, 0], r = mulberry32(4); let s = '';
  for (let m = 0; m < 4; m++) { const y = 40 + m * 48; s += `<text x="186" y="${y + 20}">T${m + 1}</text>`; for (let k = 0; k < 8; k++) { const x = 212 + k * 34, on = k === code[m]; s += `<rect x="${x}" y="${y}" width="30" height="30" rx="5" style="fill:${on ? 'var(--k-code)' : 'var(--bg-3)'};stroke:var(--rule)"/><text x="${x + 15}" y="${y + 19}" text-anchor="middle" style="fill:${on ? 'var(--bg)' : 'var(--faint)'};font-size:10px">${(r() * 2 - 1).toFixed(1)}</text>`; } }
  g.innerHTML = s;
});

CE.widget('method-map', el => {
  el.innerHTML = `<div class="diawrap"><svg class="dia" viewBox="0 0 900 480" role="img" aria-label="Map of compression methods by encoder work and decoder work."><g id="map-g"></g></svg></div>`;
  const g = $('#map-g'); if (!g) return;
  const W = 900, H = 480, pl = 70, pr = 30, pt = 30, pb = 60, X = v => pl + v * (W - pl - pr), Y = v => pt + (1 - v) * (H - pt - pb);
  let s = `<line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" style="stroke:var(--faint)"/><line x1="${pl}" y1="${pt}" x2="${pl}" y2="${H - pb}" style="stroke:var(--faint)"/>`;
  s += `<text x="${(pl + W - pr) / 2}" y="${H - 20}" text-anchor="middle" style="fill:var(--k-enc)">encoder work per vector →</text><text transform="translate(24 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle" style="fill:var(--k-q)">decode / search work →</text>`;
  s += `<rect x="${X(0.55)}" y="${Y(0.3)}" width="${X(0.97) - X(0.55)}" height="${Y(0.0) - Y(0.3) - 4}" rx="12" style="fill:var(--k-dec);fill-opacity:.07;stroke:var(--k-dec);stroke-dasharray:4 4"/><text x="${X(0.96)}" y="${Y(0.3) + 18}" text-anchor="end" style="fill:var(--k-dec)">encoder-heavy: pay once, query cheap</text>`;
  s += `<rect x="${X(0.5)}" y="${Y(0.98)}" width="${X(0.97) - X(0.5)}" height="${Y(0.7) - Y(0.98)}" rx="12" style="fill:var(--k-q);fill-opacity:.07;stroke:var(--k-q);stroke-dasharray:4 4"/><text x="${X(0.96)}" y="${Y(0.98) + 18}" text-anchor="end" style="fill:var(--k-q)">decoder-heavy: used to re-rank</text>`;
  const items = [['Scalar int8 / int4', 0.05, 0.08, 18, '--muted'], ['Binary codes', 0.1, 0.02, 22, '--muted'], ['PCA truncation', 0.15, 0.16, 19, '--muted'], ['VQ, small K', 0.25, 0.05, 24, '--k-book'],
    ['PQ', 0.3, 0.16, 13, '--k-book'], ['OPQ', 0.37, 0.21, 12, '--k-book'], ['RQ greedy', 0.46, 0.18, 9, '--k-dec'], ['RQ + beam', 0.68, 0.18, 8, '--k-dec'], ['Tree quantization', 0.6, 0.07, 9, '--k-dec'], ['AQ / LSQ', 0.86, 0.15, 7.5, '--k-dec'],
    ['Predictive RQ', 0.52, 0.4, 8.5, '--k-code', 1], ['Lossless: VQ + residual', 0.68, 0.5, 4, '--k-bits', 1], ['Neural autoencoder', 0.55, 0.82, 9, '--k-q'], ['QINCo-style', 0.86, 0.86, 6, '--k-q']];
  items.forEach(([n, x, y, r, c, ring]) => { s += `<circle cx="${X(x)}" cy="${Y(y)}" r="${r}" style="fill:var(${c});fill-opacity:.45;stroke:var(${c});stroke-width:2"/>`; if (ring) s += `<circle cx="${X(x)}" cy="${Y(y)}" r="${r + 6}" style="fill:none;stroke:var(${c});stroke-dasharray:3 3"/>`; s += `<text x="${X(x)}" y="${Y(y) - r - (ring ? 12 : 7)}" text-anchor="middle" class="t-ink">${n}</text>`; });
  s += `<text x="${X(0.97)}" y="${Y(0.36)}" text-anchor="end" style="fill:var(--k-res)">VQ with 2⁶⁴ entries: off the chart →</text><text x="${X(0.02)}" y="${Y(0.98) + 14}">dot size = error · ring = needs order</text>`;
  g.innerHTML = s;
});

})();
