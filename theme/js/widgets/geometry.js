/* Experiments for "What the geometry means" and "The shape of the cloud".
   Each figure loads its own data (data/lab/<name>.json, written by experiments/geometry.py),
   says in its title line exactly what is plotted, and exposes named views for the "read it again" steps. */
(function () {
'use strict';
const L = CE.lib, { C, setup, dot, rgba, esc, plot, nice, withLab } = L;
const fmt = (v, n) => Number(v).toFixed(n == null ? 2 : n);
const pct = (v, n) => (v * 100).toFixed(n || 0) + '%';
const num = v => Math.round(v).toLocaleString('en-US');
const V = n => `var(--${n})`;
const mono = (ctx, size, col, align) => { ctx.font = `${size || 11}px "JetBrains Mono", monospace`; ctx.fillStyle = col || C.muted; ctx.textAlign = align || 'left'; };
/* text with a halo in the surface colour, so labels stay legible over dots */
const halo = (ctx, t, x, y, col) => { ctx.lineWidth = 4; ctx.strokeStyle = C.bg2; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
const hand = (ctx, size) => { ctx.font = `${size || 19}px Caveat, cursive`; };
const short = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s);
const shell = (el, html) => { el.innerHTML = html; return s => el.querySelector(s); };
const opts = (list, cur) => list.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('');

/* =====================================================================================
   A. The meaning map: 1,320 passages from six books, placed by two directions
   ===================================================================================== */
CE.widget('meaning-map', el => withLab(el, 'map', D => {
  const P = D.points, B = D.books, dims = D.d;
  const AX = [...[0, 1, 2, 3, 4, 5].map(k => ['d' + k, `direction ${k + 1} (${pct(D.var[k], 1)} of the spread)`]), ['m', 'toward the average passage (not centred)'], ['a', 'direction 1, made perpendicular to that']];
  const axName = a => a[0] === 'd' ? `direction ${+a[1] + 1}` : a === 'm' ? 'toward the average passage' : 'across it (direction 1, perpendicular)';
  const val = (p, a) => a[0] === 'd' ? p.p[+a[1]] : a === 'm' ? p.m : p.a;
  const st = { x: 'd0', y: 'd1', hidden: new Set(), sel: null, hov: null, labels: true };
  const q = shell(el, `
    <div class="lx-bar"><label>across <select class="ax-x">${opts(AX, st.x)}</select></label><label>up <select class="ax-y">${opts(AX, st.y)}</select></label>
      <span class="sp"></span><label><input type="checkbox" class="lbl" checked> book names</label></div>
    <div class="lx-title"></div><div class="lx-sub"></div>
    <div class="lx-plot"><canvas style="height:min(88vw,560px)" aria-label="Scatter plot of 1,320 passages from six books."></canvas></div>
    <div class="lx-legend"></div>
    <div class="lx-read"></div>`);
  const cv = q('canvas'), out = q('.lx-read'), sx = q('.ax-x'), sy = q('.ax-y');
  const lab = L.lab(el, {
    books() { set({ x: 'd0', y: 'd1', hidden: [], sel: null }); },
    authors() { set({ x: 'd0', y: 'd1', hidden: [0, 5], sel: null }); },
    shadow() { set({ x: 'd0', y: 'd1', hidden: [], sel: shadowPick }); },
    deeper() { set({ x: 'd2', y: 'd3', hidden: [], sel: null }); },
    cone() { set({ x: 'm', y: 'a', hidden: [], sel: null }); },
    centred() { set({ x: 'd0', y: 'd1', hidden: [], sel: null }); },
  });
  function set(o) { Object.assign(st, o, { hidden: new Set(o.hidden || []) }); sx.value = st.x; sy.value = st.y; legend(); draw(); }
  /* a typical passage (close neighbours, nearly all from its own book) whose neighbours are most scattered on the default map */
  const shadowPick = (() => {
    let best = 0, bi = 0;
    P.forEach((p, i) => { if (p.nc[0] < 0.6 || p.nn.filter(j => P[j].b === p.b).length < 9) return; let s = 0; p.nn.forEach(j => { s += Math.hypot(P[j].p[0] - p.p[0], P[j].p[1] - p.p[1]); }); if (s > best) { best = s; bi = i; } });
    return bi;
  })();
  let G = null;
  function legend() {
    const counts = B.map((_, k) => P.filter(p => p.b === k).length);
    q('.lx-legend').innerHTML = B.map((b, k) => `<button aria-pressed="${!st.hidden.has(k)}" data-k="${k}"><i style="background:${L.BOOKS()[k]}"></i>${esc(b.title)} <small>${esc(b.author)} · ${counts[k]}</small></button>`).join('') +
      `<span class="it" style="border-style:dashed"><small>click a book to hide it</small></span>`;
    q('.lx-legend').querySelectorAll('button').forEach(b => b.onclick = () => { const k = +b.dataset.k; st.hidden.has(k) ? st.hidden.delete(k) : st.hidden.add(k); lab.clear(); legend(); draw(); });
  }
  function draw() {
    const { ctx, w, h } = setup(cv), col = L.BOOKS();
    const vis = P.map((p, i) => i).filter(i => !st.hidden.has(P[i].b));
    const xs = vis.map(i => val(P[i], st.x)), ys = vis.map(i => val(P[i], st.y));
    const uncentred = st.x === 'm' || st.y === 'm' || st.x === 'a' || st.y === 'a';
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (uncentred) { x0 = Math.min(x0, -0.08); y0 = Math.min(y0, -0.08); x1 = Math.max(x1, 0.08); y1 = Math.max(y1, 0.08); }
    const m = { l: 50, r: 16, t: 16, b: 44 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
    const pad = 0.04 * Math.max(x1 - x0, y1 - y0); x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const s = Math.min(pw / (x1 - x0), ph / (y1 - y0));     // one scale for both axes: distances on screen mean the same in both directions
    const ox = m.l + (pw - (x1 - x0) * s) / 2, oy = m.t + (ph - (y1 - y0) * s) / 2;
    const X = v => ox + (v - x0) * s, Y = v => oy + (y1 - v) * s;
    const vx0 = (m.l - ox) / s + x0, vx1 = (w - m.r - ox) / s + x0, vy1 = y1 + (oy - m.t) / s, vy0 = y1 - (h - m.b - oy) / s;
    // grid + ticks
    const tx = nice(vx0, vx1, 7), ty = nice(vy0, vy1, 6);
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.ink, 0.06); ctx.beginPath();
    tx.forEach(v => { ctx.moveTo(X(v), m.t); ctx.lineTo(X(v), h - m.b); }); ty.forEach(v => { ctx.moveTo(m.l, Y(v)); ctx.lineTo(w - m.r, Y(v)); }); ctx.stroke();
    ctx.strokeStyle = rgba(C.ink, 0.28); ctx.beginPath(); ctx.moveTo(X(0), m.t); ctx.lineTo(X(0), h - m.b); ctx.moveTo(m.l, Y(0)); ctx.lineTo(w - m.r, Y(0)); ctx.stroke();
    mono(ctx, 10, C.faint, 'center'); tx.forEach(v => ctx.fillText(+v.toFixed(2), X(v), h - m.b + 14));
    ctx.textAlign = 'right'; ty.forEach(v => ctx.fillText(+v.toFixed(2), m.l - 6, Y(v) + 3));
    mono(ctx, 11, C.ink2, 'center'); ctx.fillText(axName(st.x) + ' →', m.l + pw / 2, h - 8);
    ctx.save(); ctx.translate(13, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(axName(st.y) + ' →', 0, 0); ctx.restore();
    if (uncentred) {   // the true origin and the unit circle every vector lies on (seen from the side)
      ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(C.ink, 0.35); ctx.beginPath(); ctx.arc(X(0), Y(0), s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      dot(ctx, X(0), Y(0), 4.5, C.ink);
      hand(ctx, 19); ctx.textAlign = 'right'; halo(ctx, 'origin: the zero vector', X(0) - 10, Y(0) + 22, C.ink);
      mono(ctx, 10, C.muted, 'right'); halo(ctx, 'dashed circle: length 1,', X(1) - 8, Y(0) - 22, C.muted); halo(ctx, 'where every arrow ends', X(1) - 8, Y(0) - 9, C.muted); ctx.textAlign = 'left';
    } else {
      mono(ctx, 10, C.muted); ctx.textAlign = 'left'; halo(ctx, '0 = the average passage', X(0) + 5, Y(0) - 6, C.muted);
    }
    // dots
    const sel = st.sel != null && !st.hidden.has(P[st.sel].b) ? st.sel : null, nnSet = sel != null ? new Set(P[sel].nn) : null;
    vis.forEach(i => { const p = P[i]; const dim = sel != null && i !== sel && !nnSet.has(i); dot(ctx, X(val(p, st.x)), Y(val(p, st.y)), 3.1, rgba(col[p.b], dim ? 0.22 : 0.82), C.bg2, 0.8); });
    if (sel != null) {
      const p = P[sel], px = X(val(p, st.x)), py = Y(val(p, st.y));
      ctx.strokeStyle = rgba(C.ink, 0.65); ctx.lineWidth = 1.2;
      p.nn.forEach(j => { if (st.hidden.has(P[j].b)) return; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(X(val(P[j], st.x)), Y(val(P[j], st.y))); ctx.stroke(); });
      p.nn.forEach(j => { if (!st.hidden.has(P[j].b)) dot(ctx, X(val(P[j], st.x)), Y(val(P[j], st.y)), 5, col[P[j].b], C.ink, 1.5); });
      dot(ctx, px, py, 7, col[p.b], C.ink, 2.5);
    }
    if (st.labels) {   // direct labels at each book's median position
      mono(ctx, 11, C.ink, 'center'); ctx.font = '600 11.5px "JetBrains Mono", monospace';
      const placed = [];
      B.forEach((b, k) => {
        if (st.hidden.has(k)) return; const ps = P.filter(p => p.b === k); const md = a => { const v = ps.map(p => val(p, a)).sort((u, v) => u - v); return v[v.length >> 1]; };
        const tw = ctx.measureText(b.title).width; let lx = X(md(st.x)), ly = Y(md(st.y));
        for (let n = 0; n < 6 && placed.some(r => Math.abs(r[0] - lx) < (r[2] + tw) / 2 + 6 && Math.abs(r[1] - ly) < 17); n++) ly += 17;   // nudge down past labels already placed
        placed.push([lx, ly, tw]); ctx.lineWidth = 5; halo(ctx, b.title, lx, ly, col[k]);
      });
    }
    if (st.hov != null && st.hov !== sel) { const p = P[st.hov]; dot(ctx, X(val(p, st.x)), Y(val(p, st.y)), 6.5, null, C.ink, 2); }
    G = { X, Y };
    // what is plotted, in words
    const ax = a => a[0] === 'd' ? `direction ${+a[1] + 1} holds <b>${pct(D.var[+a[1]], 1)}</b> of the spread` : a === 'm' ? 'the direction of the <b>average passage</b> (nothing subtracted: 0 is the zero vector)' : '<b>direction 1</b> with its component along the average removed';
    q('.lx-title').textContent = `${num(vis.length)} passages from ${B.length - st.hidden.size} books, flattened onto two of ${dims} directions`;
    q('.lx-sub').innerHTML = `across: ${ax(st.x)} · up: ${ax(st.y)}${st.x[0] === 'd' && st.y[0] === 'd' ? ` · the other ${dims - 2} directions are flattened, together <b>${pct(1 - D.var[+st.x[1]] - D.var[+st.y[1]])}</b> of the spread` : ''}`;
    read();
  }
  function line(p, extra) { return `<div class="row"><span class="tag" style="color:${L.BOOKS()[p.b]}">${esc(B[p.b].title)} · passage ${p.w + 1} of ${num(B[p.b].windows)}</span>${extra || ''}${esc(p.t)}</div>`; }
  function read() {
    const sel = st.sel, hov = st.hov;
    if (hov != null && hov !== sel) {
      const extra = sel != null && P[sel].nn.includes(hov) ? `<span class="tag" style="color:var(--k-q)">neighbour ${P[sel].nn.indexOf(hov) + 1} · cosine ${fmt(P[sel].nc[P[sel].nn.indexOf(hov)])}</span>` : '';
      out.innerHTML = line(P[hov], extra) + `<div class="hint">click to pin it and see its 10 nearest passages</div>`; return;
    }
    if (sel != null) {
      const p = P[sel], same = p.nn.filter(j => P[j].b === p.b).length;
      out.innerHTML = line(p) + `<div class="hint" style="margin:.4rem 0 .25rem">its 10 nearest passages, measured with all ${dims} numbers (lines on the map): ${same} from the same book · hover a ringed dot to read it · click empty space to let go</div>` +
        p.nn.map((j, r) => `<div class="hint" style="color:var(--ink-2)"><b style="color:${L.BOOKS()[P[j].b]}">●</b> ${r + 1}. cosine ${fmt(p.nc[r])} · ${esc(B[P[j].b].title)}: ${esc(short(P[j].t, 90))}</div>`).join('');
      return;
    }
    out.innerHTML = '<span class="hint">Hover a dot to read its passage. Click one to pin it and draw lines to its 10 nearest passages.</span>';
  }
  const near = e => {
    if (!G) return null; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; let b = null, bd = 12;
    P.forEach((p, i) => { if (st.hidden.has(p.b)) return; const d = Math.hypot(G.X(val(p, st.x)) - mx, G.Y(val(p, st.y)) - my); if (d < bd) { bd = d; b = i; } });
    return b;
  };
  cv.addEventListener('pointermove', e => { const b = near(e); if (b !== st.hov) { st.hov = b; draw(); } });
  cv.addEventListener('pointerleave', () => { st.hov = null; draw(); });
  cv.addEventListener('click', e => { st.sel = near(e); st.hov = null; lab.clear(); draw(); });
  sx.onchange = () => { st.x = sx.value; lab.clear(); draw(); };
  sy.onchange = () => { st.y = sy.value; lab.clear(); draw(); };
  q('.lbl').onchange = e => { st.labels = e.target.checked; draw(); };
  legend(); L.redraws.push(draw); draw();
  if (lab.look === 'shape') { st.x = 'm'; st.y = 'a'; sx.value = 'm'; sy.value = 'a'; draw(); }
}));

/* =====================================================================================
   B. Nearest passages: one query against every passage of 17 books
   ===================================================================================== */
CE.widget('neighbours', el => withLab(el, 'nn', D => {
  const Qs = D.queries, nb = (D.hi - D.lo) / D.step;
  const st = { q: 0, hov: null, anno: null };
  const grp = c => Qs.map((x, i) => [i, x]).filter(([, x]) => x.curated === c).map(([i, x]) => `<option value="${i}">${esc(x.label)}</option>`).join('');
  const q = shell(el, `
    <div class="lx-bar"><label>query <select class="qs"><optgroup label="Chosen by hand">${grp(true)}</optgroup><optgroup label="Drawn at random">${grp(false)}</optgroup></select></label>
      <button class="btn prev" aria-label="previous query">←</button><button class="btn next" aria-label="next query">→</button></div>
    <div class="lx-read qtext" style="border-top:0;min-height:0"></div>
    <div class="lx-title">How close is every other passage to the query?</div>
    <div class="lx-sub"><b>bars</b>: how many passages have each cosine with the query (bins 0.02 wide; the height scale is logarithmic) · <b>numbered dots</b>: the 10 nearest, numbered as in the list below</div>
    <div class="lx-plot hist"></div>
    <div class="lx-legend"><span class="it"><i class="sq" style="background:${V('faint')}"></i>all ${num(D.n)} passages</span><span class="it"><i class="sq" style="background:${V('k-book')}"></i>of which: same book as the query</span><span class="it"><i style="background:${V('k-q')}"></i>the 10 nearest</span></div>
    <div class="lx-stat"></div>
    <div class="lx-title" style="border-top:1px solid var(--rule)">The 10 nearest passages</div><div class="lx-sub">highest cosine first · <u style="text-decoration-color:var(--k-vec)">underlined</u>: longer words the passage shares with the query · <span style="color:var(--k-enc)">orange</span> book name: from another book</div>
    <ol class="lx-list cols2"></ol>
`);
  const sel = q('.qs'), host = q('.hist'), list = q('.lx-list');
  const lab = L.lab(el, {
    angle() { go(5, 'angle'); }, tail() { go(0, 'tail'); }, crossbook() { go(5, 'cross'); }, words() { go(6, 'words'); }, form() { go(3, 'form'); },
    random() { go(Qs.findIndex(x => !x.curated), 'random'); },
  });
  function go(i, anno) { st.q = i; st.anno = anno || null; st.hov = null; sel.value = i; draw(); }
  const mark = (t, words) => { let s = esc(t); words.forEach(w => { s = s.replace(new RegExp(`\\b(${w})\\b`, 'gi'), '<u>$1</u>'); }); return s; };
  let items = [];
  function draw() {
    const Q = Qs[st.q], top = Q.top, tenth = top[top.length - 1].cos;
    const tot = Q.hist_same.map((v, i) => v + Q.hist_other[i]), ymax = Math.pow(10, Math.ceil(Math.log10(Math.max(...tot))));
    // stack the numbered dots of the 10 nearest where they would overlap; the stack height sets the top margin
    const pl = 56, pr = 16, xs = c => pl + (c - D.lo) / (D.hi - D.lo) * (900 - pl - pr), lv = [];
    top.forEach(t => { let k = 0; while (lv.some(([px, pk]) => Math.abs(px - xs(t.cos)) < 17 && pk === k)) k++; lv.push([xs(t.cos), k]); });
    const nlv = Math.max(...lv.map(v => v[1])) + 1;
    const P = plot(host, { w: 900, h: 290 + nlv * 15, pad: { l: pl, r: pr, t: 20 + nlv * 15, b: 50 }, x: { min: D.lo, max: D.hi, ticks: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => (+v.toFixed(1)).toString() },
      y: { min: 0.7, max: ymax, log: true, ticks: [1, 10, 100, 1000, 10000].filter(v => v <= ymax), fmt: v => num(v), label: 'passages (log scale)' }, label: 'Histogram of cosines between the query and every passage' });
    const bw = P.X(D.lo + D.step) - P.X(D.lo);
    // angle labels under the cosine ticks: the same scale read as degrees between the two arrows
    [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1].forEach(c => P.add(`<text x="${P.X(c)}" y="${P.H - P.p.b + 31}" text-anchor="middle" style="fill:${V('faint')};font-size:10px">${Math.round(L.deg(c))}°</text>`));
    P.add(`<text x="${(P.p.l + P.W - P.p.r) / 2}" y="${P.H - 4}" text-anchor="middle" class="t-ink" style="font-size:11px">cosine with the query (angle between the arrows below it) →</text>`);
    P.add(`<rect x="${P.X(tenth)}" y="${P.p.t}" width="${P.X(D.hi) - P.X(tenth)}" height="${P.Y(0.7) - P.p.t}" fill="${V('k-q')}" opacity=".07"/>`);
    items = [];
    for (let i = 0; i < nb; i++) {
      const x = P.X(D.lo + i * D.step) + 0.5, c0 = D.lo + i * D.step;
      if (tot[i] > 0) P.add(`<rect x="${x}" y="${P.Y(tot[i])}" width="${Math.max(1, bw - 1)}" height="${P.Y(0.7) - P.Y(tot[i])}" fill="${V('faint')}" opacity=".75"/>`);
      if (Q.hist_same[i] > 0) P.add(`<rect x="${x + bw * 0.2}" y="${P.Y(Q.hist_same[i])}" width="${Math.max(1, bw * 0.6 - 1)}" height="${P.Y(0.7) - P.Y(Q.hist_same[i])}" fill="${V('k-book')}"/>`);
      if (tot[i] > 0) items.push({ x: x + bw / 2, html: `cosine ${fmt(c0)} to ${fmt(c0 + D.step)} (${Math.round(L.deg(c0 + D.step))}°–${Math.round(L.deg(c0))}°)<br><b>${num(tot[i])}</b> passages, ${num(Q.hist_same[i])} from the query's book` });
    }
    // the ten nearest as numbered dots, stacked where they collide
    top.forEach((t, r) => {
      const x = P.X(t.cos), yy2 = P.p.t - 10 - lv[r][1] * 15;
      P.add(`<line x1="${x}" x2="${x}" y1="${yy2 + 7}" y2="${P.Y(0.7)}" stroke="${V('k-q')}" stroke-width="1" opacity="${st.hov === r ? 0.9 : 0.3}"/>` +
        `<circle cx="${x}" cy="${yy2}" r="${st.hov === r ? 9 : 7.5}" fill="${V('k-q')}" stroke="${V('bg-2')}" stroke-width="2"/><text x="${x}" y="${yy2 + 3.5}" text-anchor="middle" style="fill:${V('bg')};font-size:9.5px;font-weight:700">${r + 1}</text>`);
      items.push({ x, y: yy2, html: `<b>${r + 1}.</b> cosine ${fmt(t.cos)} (${Math.round(L.deg(t.cos))}°)<br>${esc(t.book)}`, r });
    });
    if (st.anno === 'angle') {
      const xm = P.X(Q.median);
      P.add(`<text x="${xm + 8}" y="${P.p.t + 16}" class="lx-hand" style="fill:${V('ink')}">typical passage: ${fmt(Q.median)}, about ${Math.round(L.deg(Q.median))}° away</text><line x1="${xm}" x2="${xm}" y1="${P.p.t}" y2="${P.Y(0.7)}" stroke="${V('ink')}" stroke-dasharray="3 3"/>`);
      P.add(`<text x="${P.X(tenth) - 14}" y="${P.p.t - 6}" text-anchor="end" class="lx-hand" style="fill:${V('k-q')}">the 10 nearest: ${Math.round(L.deg(top[0].cos))}° to ${Math.round(L.deg(tenth))}° away</text>`);
    }
    if (st.anno === 'tail') P.add(`<text x="${P.X(tenth) - 14}" y="${P.p.t - 6}" text-anchor="end" class="lx-hand" style="fill:${V('k-q')}">shaded: the top 10 of ${num(D.n)}</text>`);
    P.done();
    // list
    list.innerHTML = top.map((t, r) => `<li data-r="${r}" class="${st.hov === r ? 'on' : ''}"><span class="rk">${r + 1}</span><span class="cs">${fmt(t.cos)}<small>${Math.round(L.deg(t.cos))}°</small></span><span><span class="bk ${t.same ? '' : 'other'}">${esc(t.book)}${t.same ? '' : ' · another book'}</span>${mark(t.text, t.shared)}</span></li>`).join('');
    list.querySelectorAll('li').forEach(li => { li.onpointerenter = () => { st.hov = +li.dataset.r; draw(); }; li.onpointerleave = () => { st.hov = null; draw(); }; });
    q('.qtext').innerHTML = `<span class="tag" style="color:var(--k-q)">query · ${esc(Q.book)}${Q.curated ? '' : ' · drawn at random'}</span>${esc(Q.text)}`;
    const other = top.filter(t => !t.same).length, noshare = top.filter(t => t.shared.length === 0).length;
    q('.lx-stat').innerHTML = `typical passage (median): cosine <b>${fmt(Q.median)}</b>, ${Math.round(L.deg(Q.median))}° away · above 0.5: <b>${num(Q.n_above['0.5'])}</b> of ${num(D.n)} · the 10th nearest: <b>${fmt(tenth)}</b> · from another book: <b>${other}</b> of 10 · sharing no longer word with the query: <b>${noshare}</b> of 10`;
  }
  L.hover(host, 900, () => items, it => { const r = it && it.r != null ? it.r : null; if (r !== st.hov) { st.hov = r; list.querySelectorAll('li').forEach(li => li.classList.toggle('on', +li.dataset.r === r)); } });
  sel.onchange = () => { lab.clear(); go(+sel.value); };
  q('.prev').onclick = () => { lab.clear(); go((st.q + Qs.length - 1) % Qs.length); };
  q('.next').onclick = () => { lab.clear(); go((st.q + 1) % Qs.length); };
  L.redraws.push(draw); draw();
}));

/* =====================================================================================
   C. Two dials: sentiment and tense as directions, found by averaging
   ===================================================================================== */
CE.widget('dials', el => withLab(el, 'dials', D => {
  const n = D.sentences.length, d = D.d;
  const Vc = Array.from({ length: n }, (_, i) => Array.from({ length: d }, (_, k) => D.q[i * d + k] * D.scale - D.centre[k]));
  const dotv = (a, b) => { let s = 0; for (let k = 0; k < d; k++) s += a[k] * b[k]; return s; };
  const proj = { good: Vc.map(v => dotv(v, D.dirs.good)), past: Vc.map(v => dotv(v, D.dirs.past)), random: Vc.map(v => dotv(v, D.dirs.random)) };
  const axisVals = a => a[0] === 'c' ? Vc.map(v => v[+a.slice(1)]) : proj[a];
  const best = attr => D.coord_acc[attr].indexOf(Math.max(...D.coord_acc[attr]));
  const AXES = [['good', 'the sentiment direction'], ['past', 'the tense direction'], ['random', 'a random direction'], ['coord', 'a single coordinate…']];
  const st = { x: 'good', y: 'past', cx: best('good'), cy: best('past'), fit: false, join: false, arrows: false, hov: null };
  const axisOf = which => (st[which] === 'coord' ? 'c' + (which === 'x' ? st.cx : st.cy) : st[which]);
  const axisLabel = a => a === 'good' ? 'sentiment direction (bad ← → good)' : a === 'past' ? 'tense direction (present ← → past)' : a === 'random' ? 'a random direction' : `coordinate ${+a.slice(1) + 1} of ${d}`;
  // the same rule the experiment used: threshold halfway between the two groups' averages on the fitting half
  const accuracy = (vals, attr) => {
    const lab = D[attr], fit = D.fit; let a = 0, na = 0, b = 0, nb2 = 0;
    vals.forEach((v, i) => { if (!fit[i]) return; if (lab[i] > 0) { a += v; na++; } else { b += v; nb2++; } });
    a /= na; b /= nb2; const t = (a + b) / 2, sgn = Math.sign(a - b); let ok = 0, tot = 0;
    vals.forEach((v, i) => { if (fit[i]) return; tot++; if (((v - t) * sgn > 0 ? 1 : -1) === lab[i]) ok++; });
    return ok / tot;
  };
  const q = shell(el, `
    <div class="lx-bar"><label>across <select class="ax-x">${opts(AXES, 'good')}</select></label><label class="cxw" hidden>coordinate <input type="number" class="cx" min="1" max="${d}" style="width:4.2rem"></label>
      <label>up <select class="ax-y">${opts(AXES, 'past')}</select></label><label class="cyw" hidden>coordinate <input type="number" class="cy" min="1" max="${d}" style="width:4.2rem"></label>
      <span class="sp"></span><label><input type="checkbox" class="fit"> show the fitting half</label><label><input type="checkbox" class="join"> join each situation's four versions</label></div>
    <div class="lx-two">
      <div><div class="lx-title"></div><div class="lx-sub"></div><div class="lx-plot sc"></div>
        <div class="lx-legend"><span class="it"><i style="background:${V('s1')}"></i>good, past</span><span class="it"><i class="ring" style="border-color:${V('s1')}"></i>good, present</span><span class="it"><i style="background:${V('s2')}"></i>bad, past</span><span class="it"><i class="ring" style="border-color:${V('s2')}"></i>bad, present</span><span class="it"><small>faded: the half used to find the directions</small></span></div></div>
      <div><div class="lx-title">Can one coordinate do the same job?</div>
        <div class="lx-sub">each point: one of the ${d} coordinates, used alone as the axis, scored like the directions on the held-out half · sorted best first · <b>click a point</b> to put that coordinate across</div>
        <div class="lx-plot co"></div>
        <div class="lx-legend"><span class="it"><i class="ln" style="background:${V('s1')}"></i>sorting by sentiment</span><span class="it"><i class="ln" style="background:${V('k-q')}"></i>sorting by tense</span><span class="it"><i class="dash" style="border-color:${V('ink-2')}"></i>the two directions</span></div></div>
    </div>
    <div class="lx-stat"></div>
    <div class="lx-read"></div>`);
  const sx = q('.ax-x'), sy = q('.ax-y'), cx = q('.cx'), cy = q('.cy'), host = q('.sc'), chost = q('.co'), out = q('.lx-read');
  const lab = L.lab(el, {
    dials() { set({ x: 'good', y: 'past', fit: false, join: false, arrows: false }); },
    parallel() { set({ x: 'good', y: 'past', fit: false, join: false, arrows: true }); },
    random() { set({ x: 'random', y: 'past', fit: false, join: false, arrows: false }); },
    coord() { set({ x: 'coord', cx: best('good'), y: 'past', fit: false, join: false, arrows: false }); },
  });
  function set(o) { Object.assign(st, o); sync(); draw(); }
  function sync() {
    sx.value = st.x; sy.value = st.y; cx.value = st.cx + 1; cy.value = st.cy + 1; q('.fit').checked = st.fit; q('.join').checked = st.join;
    q('.cxw').hidden = st.x !== 'coord'; q('.cyw').hidden = st.y !== 'coord';
  }
  let items = [];
  function draw() {
    const ax = axisOf('x'), ay = axisOf('y'), xv = axisVals(ax), yv = axisVals(ay), show = i => st.fit || !D.fit[i];
    const idx = [...Array(n).keys()].filter(show);
    const ext = v => { const a = idx.map(i => v[i]); const lo = Math.min(...a), hi = Math.max(...a), p = (hi - lo) * 0.08 || 0.01; return [lo - p, hi + p]; };
    const [x0, x1] = ext(xv), [y0, y1] = ext(yv);
    const P = plot(host, { w: 560, h: 430, pad: { l: 56, r: 14, t: 18, b: 46 }, x: { min: x0, max: x1, ticks: nice(x0, x1, 5), fmt: v => +v.toFixed(2), label: axisLabel(ax) + ' →' },
      y: { min: y0, max: y1, ticks: nice(y0, y1, 5), fmt: v => +v.toFixed(2) }, xgrid: true, label: 'Scatter plot of 80 sentences' });
    P.add(`<text transform="translate(14 ${(P.p.t + P.H - P.p.b) / 2}) rotate(-90)" text-anchor="middle" class="t-ink" style="font-size:11px">${axisLabel(ay)} →</text>`);
    const col = i => (D.good[i] > 0 ? V('s1') : V('s2'));
    if (st.join || st.arrows) {
      for (let s = 0; s < n / 4; s++) {
        const k = [0, 1, 3, 2].map(o => s * 4 + o); if (!show(k[0])) continue;
        if (st.join) P.add(`<polygon points="${k.map(i => `${P.X(xv[i])},${P.Y(yv[i])}`).join(' ')}" fill="none" stroke="${V('muted')}" stroke-width="1" opacity="${st.hov != null && Math.floor(st.hov / 4) === s ? 0.95 : 0.4}"/>`);
        if (st.arrows) [[0, 2], [1, 3]].forEach(([a, b]) => {   // good → bad version of the same sentence; stop short of the dot so the head shows
          const i = s * 4 + a, j = s * 4 + b, x0 = P.X(xv[i]), y0 = P.Y(yv[i]), x1 = P.X(xv[j]), y1 = P.Y(yv[j]), ln = Math.hypot(x1 - x0, y1 - y0) || 1, k = Math.max(0, ln - 8) / ln;
          P.add(`<line x1="${x0}" y1="${y0}" x2="${x0 + (x1 - x0) * k}" y2="${y0 + (y1 - y0) * k}" stroke="${V('ink-2')}" stroke-width="1.3" marker-end="url(#dh-${el.dataset.look})" opacity=".8"/>`);
        });
      }
    }
    items = [];
    for (let i = 0; i < n; i++) {
      if (!show(i)) continue; const f = D.fit[i], past = D.past[i] > 0, r = f ? 4 : 5.5, hv = st.hov === i || (st.hov != null && Math.floor(st.hov / 4) === Math.floor(i / 4));
      P.add(`<circle cx="${P.X(xv[i])}" cy="${P.Y(yv[i])}" r="${hv ? r + 2 : r}" fill="${past ? col(i) : V('bg-2')}" stroke="${past ? V('bg-2') : col(i)}" stroke-width="${past ? 1.5 : 2.2}" opacity="${f ? 0.4 : 1}"/>`);
      items.push({ x: P.X(xv[i]), y: P.Y(yv[i]), html: esc(D.sentences[i]), i });
    }
    P.add(`<defs><marker id="dh-${el.dataset.look}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${V('ink-2')}"/></marker></defs>`);
    P.done();
    // single coordinates, sorted, against the two directions
    const sg = [...D.coord_acc.good].map((a, k) => [a, k]).sort((u, v) => v[0] - u[0]), sp = [...D.coord_acc.past].map((a, k) => [a, k]).sort((u, v) => v[0] - u[0]);
    const C2 = plot(chost, { w: 420, h: 320, pad: { l: 46, r: 12, t: 30, b: 42 }, x: { min: 1, max: d, ticks: [1, 100, 200, 300, d], label: 'coordinates, best first' }, y: { min: 0.2, max: 1.04, ticks: [0.2, 0.4, 0.6, 0.8, 1], fmt: v => pct(v), label: 'held-out sentences sorted correctly' }, label: 'Accuracy of each single coordinate' });
    C2.add(`<line x1="${C2.X(1)}" x2="${C2.X(d)}" y1="${C2.Y(0.5)}" y2="${C2.Y(0.5)}" stroke="${V('faint')}" stroke-dasharray="2 4"/><text x="${C2.X(d)}" y="${C2.Y(0.5) + 13}" text-anchor="end" style="font-size:10px">coin flip</text>`);
    [['good', V('s1'), 'sentiment direction'], ['past', V('k-q'), 'tense direction']].forEach(([a, c, t], j) => C2.add(`<line x1="${C2.X(1)}" x2="${C2.X(d)}" y1="${C2.Y(D.acc[a])}" y2="${C2.Y(D.acc[a])}" stroke="${c}" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${C2.X(d)}" y="${C2.Y(D.acc[a]) + (D.acc[a] > 0.97 ? -5 : 13)}" text-anchor="end" style="font-size:10px;fill:${c}">${t}: ${pct(D.acc[a])}</text>`));
    C2.line(sg.map((v, r) => [r + 1, v[0]]), V('s1'), 2).line(sp.map((v, r) => [r + 1, v[0]]), V('k-q'), 2);
    const cur = st.x === 'coord' ? st.cx : null;
    if (cur != null) { const r = sg.findIndex(v => v[1] === cur); C2.add(`<circle cx="${C2.X(r + 1)}" cy="${C2.Y(sg[r][0])}" r="5" fill="${V('s1')}" stroke="${V('ink')}" stroke-width="1.5"/>`); }
    C2.done();
    citems = sg.map((v, r) => ({ x: C2.X(r + 1), y: C2.Y(v[0]), html: `coordinate ${v[1] + 1}: sorts <b>${pct(v[0])}</b> by sentiment, ${pct(D.coord_acc.past[v[1]])} by tense`, k: v[1] }))
      .concat(sp.map((v, r) => ({ x: C2.X(r + 1), y: C2.Y(v[0]), html: `coordinate ${v[1] + 1}: sorts <b>${pct(v[0])}</b> by tense, ${pct(D.coord_acc.good[v[1]])} by sentiment`, k: v[1] })));
    // words
    const tx = ax === 'good' ? 'the sentiment direction: the average good sentence minus the average bad one, from the fitting half' : ax === 'past' ? 'the tense direction: average past minus average present, from the fitting half' : ax === 'random' ? 'a random direction, as a control' : `coordinate ${+ax.slice(1) + 1} alone`;
    const ty = ay === 'good' ? 'the sentiment direction' : ay === 'past' ? 'the tense direction' : ay === 'random' ? 'a random direction' : `coordinate ${+ay.slice(1) + 1} alone`;
    q('.lx-title').textContent = `${idx.length} sentences, placed by two directions`;
    q('.lx-sub').innerHTML = `across: ${tx} · up: ${ty} · zero is the average fitting sentence`;
    const A = v => `sentiment <b>${pct(accuracy(v, 'good'))}</b>, tense <b>${pct(accuracy(v, 'past'))}</b>`;
    q('.lx-stat').innerHTML = `split at its midpoint, the across axis sorts the 40 held-out sentences by ${A(xv)} · the up axis by ${A(yv)} · the angle between the two directions: <b>${Math.round(L.deg(D.cos_dirs))}°</b>`;
    read();
  }
  let citems = [];
  function read() {
    if (st.hov == null) { out.innerHTML = '<span class="hint">Hover a sentence to read it and its three siblings.</span>'; return; }
    const s0 = Math.floor(st.hov / 4) * 4, nm = ['good, past', 'good, present', 'bad, past', 'bad, present'];
    out.innerHTML = `<div class="tag">situation ${s0 / 4 + 1} of ${n / 4} · ${D.fit[s0] ? 'used to find the directions' : 'held out: not used to find the directions'}</div>` +
      [0, 1, 2, 3].map(o => `<div class="row" style="${s0 + o === st.hov ? 'color:var(--ink)' : ''}"><span class="tag" style="color:${o < 2 ? V('s1') : V('s2')}">${nm[o]}</span>${esc(D.sentences[s0 + o])}</div>`).join('');
  }
  L.hover(host, 560, () => items, it => { const i = it ? it.i : null; if (i !== st.hov) { st.hov = i; draw(); } });
  L.hover(chost, 420, () => citems);
  chost.addEventListener('click', e => {
    const svg = chost.querySelector('svg'); if (!svg) return; const r = svg.getBoundingClientRect(), k = 420 / r.width, px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
    let b = null, bd = 20; citems.forEach(it => { const dd = Math.hypot(it.x - px, it.y - py); if (dd < bd) { bd = dd; b = it; } });
    if (b) { lab.clear(); set({ x: 'coord', cx: b.k }); }
  });
  sx.onchange = () => { lab.clear(); st.x = sx.value; sync(); draw(); };
  sy.onchange = () => { lab.clear(); st.y = sy.value; sync(); draw(); };
  cx.onchange = () => { st.cx = Math.max(0, Math.min(d - 1, cx.value - 1)); lab.clear(); draw(); };
  cy.onchange = () => { st.cy = Math.max(0, Math.min(d - 1, cy.value - 1)); lab.clear(); draw(); };
  q('.fit').onchange = e => { st.fit = e.target.checked; draw(); };
  q('.join').onchange = e => { st.join = e.target.checked; draw(); };
  sync(); L.redraws.push(draw); draw();
}));

/* =====================================================================================
   D. Hot and cold: opposites, negations, paraphrases and strangers
   ===================================================================================== */
CE.widget('hot-cold', el => withLab(el, 'pairs', D => {
  const R = D.rows, K = D.kinds, col = k => [V('s1'), V('s2'), V('s3'), V('s4')][k];
  const NAME = { opposite: 'opposite (one word flipped)', negated: 'negated ("not" added)', paraphrase: 'paraphrase (other words)', unrelated: 'unrelated sentence' };
  const st = { a: 0, mode: 'rows', hov: null };
  const q = shell(el, `
    <div class="lx-bar"><label>anchor sentence <select class="an">${R.map((r, i) => `<option value="${i}">${esc(r.anchor)}</option>`).join('')}</select></label>
      <span class="sp"></span><span class="seg"><button class="btn" data-m="rows">by kind of partner</button><button class="btn" data-m="overlap">against shared words</button></span></div>
    <div class="lx-title"></div><div class="lx-sub"></div>
    <div class="lx-plot pl"></div>
    <div class="lx-legend">${K.map((k, j) => `<span class="it"><i style="background:${col(j)}"></i>${NAME[k]}</span>`).join('')}<span class="it"><i class="ring" style="border-color:${V('ink')}"></i>the chosen anchor's four partners</span></div>
    <div class="lx-read"></div>`);
  const host = q('.pl'), sel = q('.an'), out = q('.lx-read');
  const lab = L.lab(el, {
    rows() { set({ a: 0, mode: 'rows' }); }, water() { set({ a: 11, mode: 'rows' }); }, overlap() { set({ a: 0, mode: 'overlap' }); },
  });
  function set(o) { Object.assign(st, o); sel.value = st.a; draw(); }
  let items = [];
  function draw() {
    q('.seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === st.mode));
    items = [];
    if (st.mode === 'rows') {
      const H = 330, P = plot(host, { w: 900, h: H, pad: { l: 236, r: 20, t: 16, b: 52 }, x: { min: -0.2, max: 1, ticks: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => +v.toFixed(1) }, y: { min: 0, max: 4, ticks: [] }, xgrid: true, label: 'Cosine of each anchor with each kind of partner' });
      const rowY = j => P.Y(3.5 - j);
      [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1].forEach(c => P.add(`<text x="${P.X(c)}" y="${H - P.p.b + 31}" text-anchor="middle" style="fill:${V('faint')};font-size:10px">${Math.round(L.deg(c))}°</text>`));
      P.add(`<text x="${(P.p.l + 900 - P.p.r) / 2}" y="${H - 4}" text-anchor="middle" class="t-ink" style="font-size:11px">cosine with the anchor sentence (angle below) →</text>`);
      K.forEach((k, j) => {
        P.add(`<text x="${P.p.l - 14}" y="${rowY(j) + 4}" text-anchor="end" class="t-ink" style="font-size:12px">${NAME[k]}</text>`);
        const m = D.mean[k]; P.add(`<line x1="${P.X(m)}" x2="${P.X(m)}" y1="${rowY(j) - 22}" y2="${rowY(j) + 22}" stroke="${col(j)}" stroke-width="3" stroke-linecap="round"/><text x="${P.X(m)}" y="${rowY(j) - 27}" text-anchor="middle" style="font-size:10px;fill:${V('ink-2')}">average ${fmt(m)}</text>`);
        R.forEach((r, i) => { const pp = r.partners[j], jit = ((i * 7919) % 17 - 8) * 1.3; P.add(`<circle cx="${P.X(pp.cos)}" cy="${rowY(j) + jit}" r="5" fill="${col(j)}" stroke="${V('bg-2')}" stroke-width="1.5" opacity="${i === st.a ? 0 : 0.75}"/>`); items.push({ x: P.X(pp.cos), y: rowY(j) + jit, html: `<b>${fmt(pp.cos)}</b> · ${esc(r.anchor)} ↔ ${esc(pp.text)}`, i }); });
      });
      const a = R[st.a]; P.add(`<polyline points="${a.partners.map((pp, j) => `${P.X(pp.cos)},${rowY(j)}`).join(' ')}" fill="none" stroke="${V('ink')}" stroke-width="1.2" stroke-dasharray="3 3"/>`);
      a.partners.forEach((pp, j) => P.add(`<circle cx="${P.X(pp.cos)}" cy="${rowY(j)}" r="7.5" fill="${col(j)}" stroke="${V('ink')}" stroke-width="2.2"/>`));
      P.done();
      q('.lx-title').textContent = `${R.length} anchor sentences, each compared with four partners`;
      q('.lx-sub').innerHTML = `one dot: the cosine between an anchor and one partner (dots are spread up and down a little so they do not hide each other) · thick tick: the average of the row`;
    } else {
      const P = plot(host, { w: 900, h: 380, pad: { l: 56, r: 20, t: 18, b: 44 }, x: { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => pct(v), label: 'words in common: shared distinct words ÷ all distinct words of the two sentences →' }, y: { min: -0.2, max: 1, ticks: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => +v.toFixed(1), label: 'cosine' }, xgrid: true, label: 'Cosine against shared words' });
      R.forEach((r, i) => r.partners.forEach((pp, j) => { const on = i === st.a; P.add(`<circle cx="${P.X(pp.overlap)}" cy="${P.Y(pp.cos)}" r="${on ? 7.5 : 5}" fill="${col(j)}" stroke="${on ? V('ink') : V('bg-2')}" stroke-width="${on ? 2.2 : 1.5}" opacity="${on ? 1 : 0.8}"/>`); items.push({ x: P.X(pp.overlap), y: P.Y(pp.cos), html: `<b>${fmt(pp.cos)}</b>, ${pct(pp.overlap)} shared · ${esc(r.anchor)} ↔ ${esc(pp.text)}`, i }); }));
      P.done();
      q('.lx-title').textContent = `The same ${R.length * 4} pairs: cosine against how many words they share`;
      q('.lx-sub').innerHTML = `one dot: one anchor–partner pair · correlation between the two: <b>${fmt(D.corr)}</b>`;
    }
    const a = R[st.a];
    out.innerHTML = `<div class="row"><span class="tag" style="color:var(--ink)">anchor</span>${esc(a.anchor)}</div>` + a.partners.map((pp, j) =>
      `<div class="row"><span class="tag" style="color:${col(j)}">${pp.kind} · cosine ${fmt(pp.cos)}</span>${esc(pp.text)}</div>`).join('') +
      `<div class="hint">across all ${R.length} anchors the opposite beats the paraphrase ${D.opp_beats_para} times out of ${R.length}; the negation beats it ${D.neg_beats_para} times</div>`;
  }
  L.hover(host, 900, () => items, it => { if (it && it.i !== st.a) { st.a = it.i; sel.value = it.i; draw(); } });
  sel.onchange = () => { lab.clear(); set({ a: +sel.value }); };
  q('.seg').querySelectorAll('button').forEach(b => b.onclick = () => { lab.clear(); set({ mode: b.dataset.m }); });
  L.redraws.push(draw); draw();
}));

/* =====================================================================================
   E. The lopsided cloud: random pairs, reach toward the average, hubs
   ===================================================================================== */
CE.widget('cloud-shape', el => withLab(el, 'random', D => {
  const st = { tab: 'pairs', centred: false };
  const TABS = [['pairs', '1 · cosine of random pairs'], ['along', '2 · reach toward the average'], ['hubs', '3 · who is everyone\'s neighbour']];
  const q = shell(el, `
    <div class="lx-bar"><span class="seg">${TABS.map(([k, t]) => `<button class="btn" data-t="${k}">${t}</button>`).join('')}</span><span class="sp"></span>
      <label class="cw"><input type="checkbox" class="cen"> subtract the average passage first</label></div>
    <div class="lx-title"></div><div class="lx-sub"></div><div class="lx-plot pl"></div><div class="lx-legend lg"></div><div class="lx-stat"></div><div class="lx-read hubs" hidden></div>`);
  const host = q('.pl'), cen = q('.cen');
  const lab = L.lab(el, {
    offset() { set({ tab: 'pairs', centred: false }); }, centred() { set({ tab: 'pairs', centred: true }); },
    cone() { set({ tab: 'along', centred: false }); }, hubs() { set({ tab: 'hubs', centred: false }); }, hubsfix() { set({ tab: 'hubs', centred: true }); },
  });
  function set(o) { Object.assign(st, o); draw(); }
  const area = (P, counts, lo, step, col, op, stroke) => {
    let d = `M${P.X(lo)},${P.Y(0)}`; counts.forEach((c, i) => { d += `L${P.X(lo + i * step)},${P.Y(c)}L${P.X(lo + (i + 1) * step)},${P.Y(c)}`; }); d += `L${P.X(lo + counts.length * step)},${P.Y(0)}Z`;
    return `<path d="${d}" fill="${col}" fill-opacity="${op}" stroke="${stroke || col}" stroke-width="1.5"/>`;
  };
  const vline = (P, x, y0, y1, col, t, anchor) => `<line x1="${P.X(x)}" x2="${P.X(x)}" y1="${P.Y(y0)}" y2="${P.Y(y1)}" stroke="${col}" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${P.X(x) + (anchor === 'end' ? -6 : 6)}" y="${P.Y(y1) + 12}" text-anchor="${anchor || 'start'}" style="font-size:11px;fill:${col}">${t}</text>`;
  let items = [];
  function draw() {
    q('.seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === st.tab));
    cen.checked = st.centred; q('.cw').hidden = st.tab === 'along'; q('.hubs').hidden = st.tab !== 'hubs';
    items = [];
    if (st.tab === 'pairs') {
      const real = st.centred ? D.hist.centred : D.hist.raw, rs = st.centred ? D.stats.centred : D.stats.raw, ymax = Math.max(...real, ...D.hist.random) * 1.08;
      const P = plot(host, { w: 900, h: 340, pad: { l: 62, r: 20, t: 20, b: 46 }, x: { min: D.lo, max: D.hi, ticks: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => +v.toFixed(1), label: 'cosine between the two passages of a pair →' }, y: { min: 0, max: ymax, label: 'pairs, per bin of 0.02' }, label: 'Histograms of cosines of random pairs' });
      P.add(area(P, D.hist.random, D.lo, D.step, V('faint'), 0.35));
      P.add(area(P, real, D.lo, D.step, V('k-res'), 0.3));
      P.add(vline(P, 0, 0, ymax * 0.98, V('ink-2'), 'perpendicular', 'end'));
      P.add(vline(P, rs.mean, 0, ymax * 0.82, V('k-res'), `real pairs: average ${fmt(rs.mean)} (${Math.round(L.deg(rs.mean))}°)`));
      D.hist.random.forEach((c, i) => items.push({ x: P.X(D.lo + (i + 0.5) * D.step), html: `cosine ${fmt(D.lo + i * D.step)} to ${fmt(D.lo + (i + 1) * D.step)}<br>real pairs: <b>${num(real[i])}</b><br>random directions: ${num(c)}` }));
      P.done();
      q('.lx-title').textContent = `${num(D.n)} random pairs of passages from different books, against ${num(D.n)} pairs of random directions`;
      q('.lx-sub').innerHTML = st.centred ? 'red: cosine of each real pair <b>after subtracting the average passage from both</b> (and rescaling to length 1) · grey: cosine of two directions drawn uniformly at random in 384 dimensions' : 'red: cosine of each real pair, as embedded · grey: cosine of two directions drawn uniformly at random in 384 dimensions, the "no structure" baseline';
      q('.lg').innerHTML = `<span class="it"><i class="sq" style="background:${V('k-res')}"></i>real passages${st.centred ? ', average subtracted' : ''}</span><span class="it"><i class="sq" style="background:${V('faint')}"></i>random directions</span>`;
      q('.lx-stat').innerHTML = `real pairs: average <b>${fmt(rs.mean)}</b>, spread ±${fmt(rs.std)} · random directions: average <b>${fmt(D.stats.random.mean)}</b>, spread ±${fmt(D.stats.random.std)} (in 384 dimensions, random directions are nearly perpendicular)`;
    } else if (st.tab === 'along') {
      const lo = D.along.lo, step = 0.02, h = D.along.hist, N = h.reduce((a, b) => a + b, 0), sd = 1 / Math.sqrt(D.d);
      const rnd = h.map((_, i) => { const c = lo + (i + 0.5) * step; return N * step * Math.exp(-c * c / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI)); });
      const ymax = Math.max(...h) * 1.1;
      const P = plot(host, { w: 900, h: 340, pad: { l: 62, r: 20, t: 20, b: 46 }, x: { min: lo, max: 1, ticks: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => +v.toFixed(1), label: 'reach along the direction of the average passage (its cosine with that direction) →' }, y: { min: 0, max: ymax, label: 'passages, per bin of 0.02' }, label: 'Histogram of each passage\'s reach toward the average' });
      P.add(area(P, rnd.map(v => Math.min(v, ymax)), lo, step, V('faint'), 0.35));
      P.add(area(P, h, lo, step, V('k-vec'), 0.3));
      P.add(vline(P, 0, 0, ymax * 0.98, V('ink-2'), 'zero: perpendicular to the average', 'end'));
      P.add(vline(P, D.along.mean, 0, ymax * 0.8, V('k-vec'), `average reach ${fmt(D.along.mean)}`));
      h.forEach((c, i) => items.push({ x: P.X(lo + (i + 0.5) * step), html: `reach ${fmt(lo + i * step)} to ${fmt(lo + (i + 1) * step)}: <b>${num(c)}</b> passages` }));
      P.done();
      q('.lx-title').textContent = `All ${num(N)} passages: how far each reaches toward the average passage`;
      q('.lx-sub').innerHTML = 'yellow: for each passage, the cosine between its arrow and the direction of the average arrow · grey: what the same measurement gives for directions drawn uniformly at random (cut off at the top)';
      q('.lg').innerHTML = `<span class="it"><i class="sq" style="background:${V('k-vec')}"></i>real passages</span><span class="it"><i class="sq" style="background:${V('faint')}"></i>random directions</span>`;
      q('.lx-stat').innerHTML = `the average passage has length <b>${fmt(D.mean_norm)}</b> (an average of length-1 arrows that pointed every which way would have length about 0) · average reach toward it: <b>${fmt(D.along.mean)}</b>, the lowest: ${fmt(D.along.min)}`;
    } else {
      const key = st.centred ? 'centred' : 'raw', cap = D.hub_cap, ys = ['raw', 'centred', 'random'];
      const P = plot(host, { w: 900, h: 340, pad: { l: 62, r: 20, t: 20, b: 46 }, x: { min: 0, max: cap, ticks: [0, 10, 20, 30, 40, 50, 60], fmt: v => (v === cap ? cap + '+' : v), label: 'number of other passages that list this one among their 10 nearest →' }, y: { min: 0.8, max: 3000, log: true, ticks: [1, 10, 100, 1000], fmt: v => num(v), label: 'passages (log scale)' }, label: 'Distribution of how often each passage is a neighbour' });
      const cols = { raw: V('k-res'), centred: V('k-dec'), random: V('faint') };
      ys.forEach(k => { const pts = D.occ[k].map((c, i) => [i, c]).filter(v => v[1] > 0); P.line(pts, cols[k], k === key ? 2.6 : 1.4, k === 'random' ? '4 3' : null); });
      P.add(vline(P, 10, 0.8, 2500, V('ink-2'), 'the fair share: 10'));
      D.occ.raw.forEach((c, i) => items.push({ x: P.X(i), html: `listed by ${i}${i === cap ? ' or more' : ''} others:<br>as embedded <b>${num(c)}</b> · average subtracted ${num(D.occ.centred[i])} · random ${num(D.occ.random[i])}` }));
      P.done();
      q('.lx-title').textContent = `${num(D.hub_m)} passages, each finding its 10 nearest among the others: how often is each one picked?`;
      q('.lx-sub').innerHTML = 'every passage picks exactly 10, so the average passage is picked 10 times · lines: how many passages are picked 0, 1, 2… times · red: as embedded · green: average passage subtracted first · grey dashed: random directions';
      q('.lg').innerHTML = `<span class="it"><i class="ln" style="background:${cols.raw}"></i>as embedded</span><span class="it"><i class="ln" style="background:${cols.centred}"></i>average subtracted</span><span class="it"><i class="dash" style="border-color:${cols.random}"></i>random directions</span>`;
      q('.lx-stat').innerHTML = `most-picked passage: <b>${D.occ_max.raw}</b> times as embedded, <b>${D.occ_max.centred}</b> with the average subtracted, ${D.occ_max.random} for random directions · never picked: <b>${num(D.occ_zero.raw)}</b>, <b>${num(D.occ_zero.centred)}</b> and ${num(D.occ_zero.random)}`;
      q('.hubs').innerHTML = `<div class="tag" style="margin-bottom:.3rem">the five most-picked passages ${st.centred ? '(average subtracted)' : '(as embedded)'}</div>` + D.hubs[key].map(hh => `<div class="row"><span class="tag" style="color:${cols[key]}">picked ${hh.n} times · ${esc(hh.book)}</span>${esc(short(hh.text, 170))}</div>`).join('');
    }
  }
  L.hover(host, 900, () => items);
  q('.seg').querySelectorAll('button').forEach(b => b.onclick = () => { lab.clear(); set({ tab: b.dataset.t }); });
  cen.onchange = () => { lab.clear(); set({ centred: cen.checked }); };
  L.redraws.push(draw); draw();
}));

/* =====================================================================================
   F. The spectrum: how many directions does the cloud really use?
   ===================================================================================== */
CE.widget('spectrum-lab', el => withLab(el, 'spectrum', D => {
  const d = D.d, nbar = 96, cum = a => { let c = 0; return a.map(v => (c += v)); };
  const cR = cum(D.ev), cS = cum(D.ev_shuffled);
  const st = { ki: D.ks.indexOf(64), shuffled: false, random: false };
  const q = shell(el, `
    <div class="lx-bar"><label>keep the first <input type="range" class="k" min="0" max="${D.ks.length - 1}" step="1"> <output class="kv"></output> directions</label><span class="sp"></span>
      <label><input type="checkbox" class="sh"> compare: shuffled coordinates</label><label><input type="checkbox" class="rd"> compare: random data</label></div>
    <div class="lx-title">How the spread is shared among the directions</div>
    <div class="lx-sub">bars: the share of all the variation (variance) that lies along each principal direction, largest first · first ${nbar} of ${d} shown · highlighted: the directions kept</div>
    <div class="lx-plot ev"></div><div class="lx-legend lg1"></div>
    <div class="lx-title" style="border-top:1px solid var(--rule)">What survives if you keep only the first k directions?</div>
    <div class="lx-sub">for ${num(D.n_q)} passages, the 10 nearest among ${num(D.n_db)} others, found with all ${d} numbers, then again with only k · line: how many of the 10 are found again · dashed: share of the variance kept</div>
    <div class="lx-plot rc"></div><div class="lx-legend lg2"></div>
    <div class="lx-stat"></div>`);
  const h1 = q('.ev'), h2 = q('.rc'), sl = q('.k');
  const lab = L.lab(el, {
    head() { set({ ki: D.ks.indexOf(8), shuffled: false, random: false }); },
    shuffled() { set({ ki: D.ks.indexOf(8), shuffled: true, random: true }); },
    neighbours() { set({ ki: D.ks.indexOf(64), shuffled: false, random: false }); },
    coords() { set({ ki: D.ks.indexOf(128), shuffled: false, random: false }); },
  });
  function set(o) { Object.assign(st, o); draw(); }
  let it1 = [], it2 = [];
  function draw() {
    const k = D.ks[st.ki]; sl.value = st.ki; q('.kv').textContent = k; q('.sh').checked = st.shuffled; q('.rd').checked = st.random;
    const P = plot(h1, { w: 900, h: 270, pad: { l: 54, r: 16, t: 18, b: 40 }, x: { min: 0, max: nbar, ticks: [1, 8, 16, 32, 48, 64, 80, 96], label: 'principal direction, largest first →' }, y: { min: 0, max: 0.09, ticks: [0, 0.02, 0.04, 0.06, 0.08], fmt: v => pct(v), label: 'share of the variance' }, label: 'Bar chart of the eigenvalue spectrum' });
    const bw = P.X(1) - P.X(0); it1 = [];
    for (let i = 0; i < nbar; i++) {
      const x = P.X(i) + 0.8, y = P.Y(D.ev[i]);
      P.add(`<rect x="${x}" y="${y}" width="${Math.max(1, bw - 1.6)}" height="${P.Y(0) - y}" rx="1.5" fill="${i < k ? V('k-vec') : V('k-book')}" opacity="${i < k ? 1 : 0.45}"/>`);
      it1.push({ x: x + bw / 2, html: `<b>direction ${i + 1}</b>: ${pct(D.ev[i], 2)} of the variance<br>first ${i + 1} together: <b>${pct(cR[i], 1)}</b>${st.shuffled ? `<br>shuffled: ${pct(D.ev_shuffled[i], 2)}` : ''}` });
    }
    const step = (a, col, dash) => { let pth = ''; for (let i = 0; i < nbar; i++) pth += `${i ? 'L' : 'M'}${P.X(i)},${P.Y(a[i])}L${P.X(i + 1)},${P.Y(a[i])}`; P.add(`<path d="${pth}" fill="none" stroke="${col}" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`); };
    if (st.shuffled) step(D.ev_shuffled, V('k-res'));
    if (st.random) step(D.ev_random, V('ink-2'), '4 3');
    if (k <= nbar) P.add(`<line x1="${P.X(k)}" x2="${P.X(k)}" y1="${P.p.t}" y2="${P.Y(0)}" stroke="${V('ink')}" stroke-dasharray="3 3"/><text x="${P.X(k) + 6}" y="${P.p.t + 12}" style="font-size:11px" class="t-ink">first ${k}: ${pct(cR[k - 1])} of the variance</text>`);
    else P.add(`<text x="${P.X(nbar) - 4}" y="${P.p.t + 12}" text-anchor="end" style="font-size:11px" class="t-ink">all ${nbar} shown are kept, and ${k - nbar} more: ${pct(cR[k - 1])} of the variance</text>`);
    P.done();
    q('.lg1').innerHTML = `<span class="it"><i class="sq" style="background:${V('k-vec')}"></i>kept</span><span class="it"><i class="sq" style="background:${V('k-book')};opacity:.45"></i>dropped</span>` +
      (st.shuffled ? `<span class="it"><i class="ln" style="background:${V('k-res')}"></i>shuffled coordinates: each coordinate's values shuffled among passages separately</span>` : '') +
      (st.random ? `<span class="it"><i class="dash" style="border-color:${V('ink-2')}"></i>random data: same size, no structure</span>` : '');
    // neighbours that survive
    const R = plot(h2, { w: 900, h: 270, pad: { l: 54, r: 16, t: 18, b: 40 }, x: { min: 1, max: d, log: true, ticks: D.ks.filter(v => [1, 2, 4, 8, 16, 32, 64, 128, 256, 384].includes(v)), label: 'directions or coordinates kept, k (log scale) →' }, y: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: v => pct(v), label: 'kept' }, xgrid: true, label: 'Neighbour recall against the number of directions kept' });
    R.line(D.ks.map(v => [v, cR[v - 1]]), V('faint'), 1.6, '5 4');
    R.line(D.ks.map((v, i) => [v, D.recall.coords[i]]), V('k-book'), 2).dots(D.ks.map((v, i) => [v, D.recall.coords[i]]), V('k-book'), 3.5);
    R.line(D.ks.map((v, i) => [v, D.recall.pca[i]]), V('k-vec'), 2.4).dots(D.ks.map((v, i) => [v, D.recall.pca[i]]), V('k-vec'), 4);
    R.add(`<line x1="${R.X(k)}" x2="${R.X(k)}" y1="${R.p.t}" y2="${R.Y(0)}" stroke="${V('ink')}" stroke-dasharray="3 3"/>`);
    R.add(`<circle cx="${R.X(k)}" cy="${R.Y(D.recall.pca[st.ki])}" r="7" fill="none" stroke="${V('ink')}" stroke-width="2"/>`);
    it2 = D.ks.map((v, i) => ({ x: R.X(v), html: `keep <b>${v}</b>: top directions find <b>${pct(D.recall.pca[i])}</b> of the 10 nearest<br>${v} random coordinates find ${pct(D.recall.coords[i])} · variance kept ${pct(cR[v - 1])}` }));
    R.done();
    q('.lg2').innerHTML = `<span class="it"><i class="ln" style="background:${V('k-vec')}"></i>the first k principal directions</span><span class="it"><i class="ln" style="background:${V('k-book')}"></i>k of the original coordinates, chosen at random</span><span class="it"><i class="dash" style="border-color:${V('faint')}"></i>variance kept by the first k directions</span>`;
    q('.lx-stat').innerHTML = `keep <b>${k}</b> of ${d}: <b>${pct(cR[k - 1])}</b> of the variance, <b>${pct(D.recall.pca[st.ki])}</b> of the true 10 nearest (random coordinates: ${pct(D.recall.coords[st.ki])}) · effective number of directions: <b>${D.pr.real.toFixed(0)}</b> real, ${D.pr.shuffled.toFixed(0)} shuffled, ${D.pr.random.toFixed(0)} random`;
  }
  L.hover(h1, 900, () => it1); L.hover(h2, 900, () => it2);
  sl.oninput = () => { lab.clear(); st.ki = +sl.value; draw(); };
  q('.sh').onchange = e => { lab.clear(); st.shuffled = e.target.checked; draw(); };
  q('.rd').onchange = e => { lab.clear(); st.random = e.target.checked; draw(); };
  L.redraws.push(draw); draw();
}));

/* =====================================================================================
   G. A walk through Alice: similarity of every pair of passages, and the path they trace
   ===================================================================================== */
CE.widget('alice-walk', el => withLab(el, 'walk', D => {
  const N = D.sim.length, chs = D.chapters, T = D.traj;
  const chOf = i => { let c = 0; chs.forEach((b, k) => { if (i >= b[0]) c = k; }); return c; };
  const chCol = () => [C.s1, C.s2, C.s3];
  const LO = 0.2, HI = 0.9;
  const st = { hov: null, smooth: 13, anno: null };
  const q = shell(el, `
    <div class="lx-bar"><label>path smoothing <input type="range" class="sm" min="1" max="31" step="2"> <output class="smv"></output></label><span class="sp"></span><span>hover the grid or the path to read the passages</span></div>
    <div class="lx-two" style="border-top:0">
      <div><div class="lx-title">Every passage against every other</div><div class="lx-sub">cell in row i, column j: cosine between passage i and passage j · passages in reading order, top to bottom and left to right</div>
        <div class="lx-plot"><canvas class="cs" style="height:min(84vw,470px)" aria-label="Grid of cosines between every pair of passages of the first three chapters of Alice in Wonderland."></canvas></div></div>
      <div><div class="lx-title">The same passages as a path</div><div class="lx-sub">each dot: one passage, placed by the first two principal directions of these ${N} passages (together ${pct(D.var[0] + D.var[1])} of their spread) · joined in reading order</div>
        <div class="lx-plot"><canvas class="ct" style="height:min(84vw,470px)" aria-label="The passages as a path in the plane of their two main directions."></canvas></div></div>
    </div>
    <div class="lx-legend lg"></div>
    <div class="lx-title" style="border-top:1px solid var(--rule)">How fast does similarity fade with distance in the text?</div>
    <div class="lx-sub">average cosine between two passages that are L passages apart (L × 24 words) · whole of <i>Alice</i>, and all 18 books</div>
    <div class="lx-plot lag"></div><div class="lx-legend lg2"></div>
    <div class="lx-read"></div>`);
  const cv = q('.cs'), ct = q('.ct'), out = q('.lx-read'), sm = q('.sm');
  const lab = L.lab(el, {
    diagonal() { set({ hov: [40, 41], anno: 'diagonal' }); }, blocks() { set({ hov: null, anno: 'blocks' }); },
    path() { set({ hov: null, anno: 'path', smooth: 13 }); }, lag() { set({ hov: null, anno: 'lag' }); },
  });
  function set(o) { Object.assign(st, o); sm.value = st.smooth; draw(); }
  let img = null, imgKey = null, G1 = null, G2 = null;
  const ramp = t => { const a = L.hexrgb(C.bg3), b = L.hexrgb(C.q), c = L.hexrgb(C.ink); const m = (u, v, s) => u.map((x, i) => Math.round(x + (v[i] - x) * s)); return t < 0.55 ? m(a, b, t / 0.55) : m(b, c, (t - 0.55) / 0.45); };
  function buildImg() {
    const off = document.createElement('canvas'); off.width = N; off.height = N;
    const x = off.getContext('2d'), id = x.createImageData(N, N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const t = Math.max(0, Math.min(1, (D.sim[i][j] / 100 - LO) / (HI - LO))), c = ramp(t), p = (i * N + j) * 4; id.data[p] = c[0]; id.data[p + 1] = c[1]; id.data[p + 2] = c[2]; id.data[p + 3] = 255; }
    x.putImageData(id, 0, 0); img = off; imgKey = C.q + C.bg3;
  }
  function drawSim() {
    if (!img || imgKey !== C.q + C.bg3) buildImg();
    const { ctx, w, h } = setup(cv), S = Math.min(w - 64, h - 112), ox = 48 + (w - 48 - 16 - S) / 2, oy = 22;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(img, ox, oy, S, S);
    const cc = chCol(), P = i => i / N * S;
    chs.forEach((b, k) => {
      const a = P(b[0]), e = P(k + 1 < chs.length ? chs[k + 1][0] : N);
      ctx.fillStyle = cc[k]; ctx.fillRect(ox + a, oy - 8, e - a - 1, 4); ctx.fillRect(ox - 8, oy + a, 4, e - a - 1);
      mono(ctx, 10, cc[k], 'right'); ctx.fillText('ch ' + (k + 1), ox - 12, oy + a + 11);
      if (st.anno === 'blocks') { ctx.strokeStyle = cc[k]; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(ox + a, oy + a, e - a, e - a); ctx.setLineDash([]); }
    });
    mono(ctx, 10, C.muted, 'center'); ctx.fillText('passage j (reading order) →', ox + S / 2, oy + S + 14);
    ctx.save(); ctx.translate(16, oy + S / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('passage i (reading order) →', 0, 0); ctx.restore();
    // colour scale
    const by = oy + S + 30, bw = Math.min(260, S * 0.7), bx = ox + (S - bw) / 2;
    for (let k = 0; k < bw; k++) { const c = ramp(k / bw); ctx.fillStyle = `rgb(${c})`; ctx.fillRect(bx + k, by, 1.5, 10); }
    mono(ctx, 10, C.muted, 'center'); [0.2, 0.4, 0.6, 0.8].forEach(v => ctx.fillText(v.toFixed(1), bx + (v - LO) / (HI - LO) * bw, by + 22));
    ctx.textAlign = 'right'; ctx.fillText('cosine', bx - 8, by + 9); ctx.textAlign = 'left'; ctx.fillText('≥ 0.9', bx + bw + 6, by + 9);
    if (st.anno === 'blocks') { mono(ctx, 11, C.ink, 'center'); halo(ctx, `average cosine: same chapter ${fmt(D.within)} · different chapters ${fmt(D.across)}`, ox + S / 2, oy + S + 78, C.ink); }
    if (st.anno === 'diagonal') { hand(ctx, 19); halo(ctx, 'bright diagonal: each passage', ox + S * 0.42, oy + S * 0.3, C.ink); halo(ctx, 'resembles its neighbours', ox + S * 0.42, oy + S * 0.3 + 20, C.ink); }
    if (st.hov) {
      const [i, j] = st.hov; ctx.strokeStyle = C.vec; ctx.lineWidth = 1.5; ctx.strokeRect(ox + P(j) - 3, oy + P(i) - 3, S / N + 6, S / N + 6);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(C.vec, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ox, oy + P(i + 0.5)); ctx.lineTo(ox + S, oy + P(i + 0.5)); ctx.moveTo(ox + P(j + 0.5), oy); ctx.lineTo(ox + P(j + 0.5), oy + S); ctx.stroke(); ctx.setLineDash([]);
    }
    G1 = { ox, oy, S };
  }
  function drawPath() {
    const { ctx, w, h } = setup(ct), xs = T.map(p => p[0]), ys = T.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 24;
    const s = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0));
    const X = x => pad + (x - x0) * s + ((w - 2 * pad) - (x1 - x0) * s) / 2, Y = y => h - pad - (y - y0) * s - ((h - 2 * pad) - (y1 - y0) * s) / 2;
    const cc = chCol(), Wd = (st.smooth - 1) / 2;
    const Sm = T.map((_, i) => { let a = 0, b = 0, n = 0; for (let k = Math.max(0, i - Wd); k <= Math.min(N - 1, i + Wd); k++) { a += T[k][0]; b += T[k][1]; n++; } return [a / n, b / n]; });
    for (let i = 1; i < N; i++) { ctx.strokeStyle = rgba(cc[chOf(i)], 0.2); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(T[i - 1][0]), Y(T[i - 1][1])); ctx.lineTo(X(T[i][0]), Y(T[i][1])); ctx.stroke(); }
    T.forEach((p, i) => dot(ctx, X(p[0]), Y(p[1]), 2.4, rgba(cc[chOf(i)], 0.6)));
    if (st.smooth > 1) for (let i = 1; i < N; i++) { ctx.strokeStyle = cc[chOf(i)]; ctx.lineWidth = st.anno === 'path' ? 4 : 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(X(Sm[i - 1][0]), Y(Sm[i - 1][1])); ctx.lineTo(X(Sm[i][0]), Y(Sm[i][1])); ctx.stroke(); }
    const sx0 = X(Sm[0][0]), sy0 = Y(Sm[0][1]), ex = X(Sm[N - 1][0]), ey = Y(Sm[N - 1][1]);
    dot(ctx, sx0, sy0, 5.5, C.bg2, C.ink, 2); dot(ctx, ex, ey, 5.5, C.ink, C.ink, 2);
    hand(ctx, 19); ctx.textAlign = 'left'; halo(ctx, 'start', sx0 + 9, sy0 - 8, C.ink);
    ctx.textAlign = ex < sx0 ? 'right' : 'left'; halo(ctx, 'end of ch 3', ex + (ex < sx0 ? -9 : 9), ey + 20, C.ink); ctx.textAlign = 'left';
    if (st.hov) { const ids = st.hov[0] === st.hov[1] ? [st.hov[0]] : st.hov; ids.forEach(i => dot(ctx, X(T[i][0]), Y(T[i][1]), 7, null, C.vec, 2.5)); }
    G2 = { X, Y };
  }
  let lagItems = [];
  function drawLag() {
    const P = plot(q('.lag'), { w: 900, h: 250, pad: { l: 54, r: 16, t: 18, b: 40 }, x: { min: 1, max: 64, log: true, ticks: [1, 2, 4, 8, 16, 32, 64], label: 'distance in the text, L (passages apart, log scale) →' }, y: { min: 0.3, max: 0.8, ticks: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8], fmt: v => v.toFixed(1), label: 'average cosine' }, xgrid: true, label: 'Average cosine against distance in the text' });
    P.add(`<line x1="${P.X(1)}" x2="${P.X(64)}" y1="${P.Y(D.alice_rand)}" y2="${P.Y(D.alice_rand)}" stroke="${V('faint')}" stroke-dasharray="4 3"/><text x="${P.X(1) + 4}" y="${P.Y(D.alice_rand) + 14}" style="font-size:10px">two random passages of Alice: ${fmt(D.alice_rand)}</text>`);
    P.line(D.lags.map((L2, i) => [L2, D.corpus_lag[i]]), V('k-book'), 1.8).line(D.lags.map((L2, i) => [L2, D.alice_lag[i]]), V('k-vec'), 2.6);
    P.dots([[1, D.alice_lag[0]], [2, D.alice_lag[1]]], V('k-vec'), 4.5);
    P.add(`<text x="${P.X(1) + 8}" y="${P.Y(D.alice_lag[0]) - 8}" style="font-size:10.5px" class="t-ink">L = 1: half the words shared, ${fmt(D.alice_lag[0])}</text><text x="${P.X(2) + 8}" y="${P.Y(D.alice_lag[1]) - 8}" style="font-size:10.5px" class="t-ink">L = 2: none shared, ${fmt(D.alice_lag[1])}</text>`);
    if (st.anno === 'lag') P.add(`<text x="${P.X(12)}" y="${P.Y(0.47)}" class="lx-hand" style="fill:${V('ink')}">still above the random line after 64 passages</text>`);
    lagItems = D.lags.map((L2, i) => ({ x: P.X(L2), html: `${L2} passage${L2 > 1 ? 's' : ''} apart (${L2 * D.stride} words):<br>Alice <b>${fmt(D.alice_lag[i])}</b> · all books ${fmt(D.corpus_lag[i])}` }));
    P.done();
  }
  function read() {
    const cc = chCol(), line = (k, lab2) => `<div class="row"><span class="tag" style="color:${cc[chOf(k)]}">${lab2} ${k + 1} · chapter ${chOf(k) + 1}</span>${esc(D.texts[k])}</div>`;
    if (!st.hov) { out.innerHTML = '<span class="hint">Hover a cell of the grid to read the two passages it compares, or a dot of the path to read one passage.</span>'; return; }
    const [i, j] = st.hov;
    out.innerHTML = i === j ? line(i, 'passage') : line(i, 'row: passage') + `<div class="row"><span class="tag" style="color:var(--k-vec)">cosine ${(D.sim[i][j] / 100).toFixed(2)} · ${Math.abs(i - j)} passages apart</span></div>` + line(j, 'column: passage');
  }
  function draw() { drawSim(); drawPath(); drawLag(); read();
    q('.smv').textContent = st.smooth === 1 ? 'off' : st.smooth + ' passages';
    q('.lg').innerHTML = chs.map((c, k) => `<span class="it"><i style="background:${chCol()[k]}"></i>chapter ${k + 1} · ${esc(c[1])}</span>`).join('') + `<span class="it"><i class="ln" style="background:${V('ink-2')}"></i>thick line: average position over ${st.smooth} neighbouring passages</span>`;
    q('.lg2').innerHTML = `<span class="it"><i class="ln" style="background:${V('k-vec')}"></i>Alice in Wonderland</span><span class="it"><i class="ln" style="background:${V('k-book')}"></i>all 18 books</span><span class="it"><i class="dash" style="border-color:${V('faint')}"></i>random pairs within Alice</span>`;
  }
  cv.addEventListener('pointermove', e => {
    if (!G1) return; const r = cv.getBoundingClientRect(), px = e.clientX - r.left - G1.ox, py = e.clientY - r.top - G1.oy;
    if (px < 0 || py < 0 || px >= G1.S || py >= G1.S) return;
    const j = Math.floor(px / G1.S * N), i = Math.floor(py / G1.S * N);
    if (!st.hov || st.hov[0] !== i || st.hov[1] !== j) { st.hov = [i, j]; st.anno = st.anno === 'diagonal' ? null : st.anno; lab.clear(); drawSim(); drawPath(); read(); }
  });
  ct.addEventListener('pointermove', e => {
    if (!G2) return; const r = ct.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    let b = -1, bd = 20; T.forEach((p, i) => { const dd = Math.hypot(G2.X(p[0]) - px, G2.Y(p[1]) - py); if (dd < bd) { bd = dd; b = i; } });
    if (b >= 0 && (!st.hov || st.hov[0] !== b || st.hov[1] !== b)) { st.hov = [b, b]; drawSim(); drawPath(); read(); }
  });
  L.hover(q('.lag'), 900, () => lagItems);
  sm.oninput = () => { st.smooth = +sm.value; lab.clear(); draw(); };
  sm.value = st.smooth; L.redraws.push(() => { img = null; draw(); }); draw();
}));

})();
