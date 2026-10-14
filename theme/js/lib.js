/* Shared drawing helpers for the interactive figures. Loaded only on pages that have figures. */
(function () {
  'use strict';
  const CE = window.CE;
  const L = (CE.lib = {});
  const C = (L.C = {});

  L.readColors = function () {
    const cs = getComputedStyle(document.documentElement);
    const map = { bg: '--bg', bg2: '--bg-2', bg3: '--bg-3', ink: '--ink', ink2: '--ink-2', muted: '--muted', faint: '--faint', rule: '--rule',
      vec: '--k-vec', book: '--k-book', code: '--k-code', res: '--k-res', enc: '--k-enc', dec: '--k-dec', q: '--k-q', bits: '--k-bits', cb2: '--cb2',
      s1: '--s1', s2: '--s2', s3: '--s3', s4: '--s4', s5: '--s5', s6: '--s6' };
    for (const k in map) C[k] = cs.getPropertyValue(map[k]).trim();
    C.dark = (cs.getPropertyValue('color-scheme').trim() || 'dark').indexOf('light') < 0;
  };
  L.readColors();

  const hexrgb = (L.hexrgb = hex => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  L.rgba = (hex, a) => { const [r, g, b] = hexrgb(hex); return `rgba(${r},${g},${b},${a})`; };
  L.mix = (h1, h2, t) => { const a = hexrgb(h1), b = hexrgb(h2); return a.map((v, i) => Math.round(v + (b[i] - v) * t)); };
  L.mulberry32 = a => function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  L.gaussFn = r => () => { let u = 0; while (u === 0) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  L.hslToRgb = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))]; };
  L.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* canvas */
  L.setup = cv => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  };
  L.view = (w, h, cx, cy, span) => { const s = Math.min(w, h) / (2 * span); return { s, X: x => w / 2 + (x - cx) * s, Y: y => h / 2 - (y - cy) * s, inv: (px, py) => [(px - w / 2) / s + cx, -(py - h / 2) / s + cy] }; };
  L.arrow = (ctx, x0, y0, x1, y1, col, lw, head) => {
    lw = lw || 2; head = head || 8;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 1) return;
    const ux = dx / len, uy = dy / len, hh = Math.min(head, len * 0.45);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hh * 0.8, y1 - uy * hh * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * hh - uy * hh * 0.5, y1 - uy * hh + ux * hh * 0.5); ctx.lineTo(x1 - ux * hh + uy * hh * 0.5, y1 - uy * hh - ux * hh * 0.5); ctx.closePath(); ctx.fill();
  };
  L.dot = (ctx, x, y, r, fill, stroke, lw) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); } };
  L.star = (ctx, x, y, r, fill, stroke) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = 1.2; ctx.strokeStyle = stroke; ctx.stroke(); } };
  L.grid = (ctx, V, w, h, step) => {
    ctx.strokeStyle = L.rgba(C.ink, 0.05); ctx.lineWidth = 1;
    const [x0, y1] = V.inv(0, 0), [x1, y0] = V.inv(w, h);
    ctx.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(V.X(x), 0); ctx.lineTo(V.X(x), h); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { ctx.moveTo(0, V.Y(y)); ctx.lineTo(w, V.Y(y)); }
    ctx.stroke();
    ctx.strokeStyle = L.rgba(C.ink, 0.13); ctx.beginPath(); ctx.moveTo(V.X(0), 0); ctx.lineTo(V.X(0), h); ctx.moveTo(0, V.Y(0)); ctx.lineTo(w, V.Y(0)); ctx.stroke();
  };
  L.draggable = (cv, hit, move, end) => {
    let active = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => { const p = pos(e); const a = hit(p); if (a !== null && a !== undefined) { active = a; try { cv.setPointerCapture(e.pointerId); } catch (_) {} move(active, p); e.preventDefault(); } });
    cv.addEventListener('pointermove', e => { if (active === null) return; move(active, pos(e)); });
    const up = () => { if (active !== null) { active = null; if (end) end(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  };

  /* redraw on resize and on theme change */
  const redraws = (L.redraws = []);
  let rt = null;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => redraws.forEach(f => { try { f(); } catch (e) { console.error(e); } }), 80); });
  const themeChanged = () => { L.readColors(); redraws.forEach(f => { try { f(true); } catch (e) { console.error(e); } }); };
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => redraws.forEach(f => { try { f(); } catch (e) {} }));

  L.chip = (txt, col) => `<b style="color:${col}">${txt}</b>`;
  L.fmt = (v, n) => Number(v).toFixed(n);
  L.esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  L.num = v => Math.round(v).toLocaleString('en-US');
  L.$ = (s, r) => (r || document).querySelector(s);
  L.$$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /* ---------- small SVG chart kit ----------
     plot(el, {w, h, pad, x:{min,max,log,ticks,label,fmt}, y:{...}}) -> {X, Y, add(svgString), done(), tip(...)}
     Charts are redrawn from scratch on every state change; they are small. */
  L.nice = (min, max, n) => { const span = max - min, step0 = Math.pow(10, Math.floor(Math.log10(span / n))); const err = span / n / step0; const step = step0 * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1); const out = []; for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(10)); return out; };
  L.plot = function (host, o) {
    const W = o.w || 900, H = o.h || 360, p = Object.assign({ l: 62, r: 24, t: 20, b: 46 }, o.pad || {});
    const sx = o.x, sy = o.y;
    const f = (s, v) => (s.log ? Math.log10(v) : v);
    const X = v => p.l + (f(sx, v) - f(sx, sx.min)) / (f(sx, sx.max) - f(sx, sx.min)) * (W - p.l - p.r);
    const Y = v => H - p.b - (f(sy, v) - f(sy, sy.min)) / (f(sy, sy.max) - f(sy, sy.min)) * (H - p.t - p.b);
    const Xi = px => { const t = (px - p.l) / (W - p.l - p.r); const v = f(sx, sx.min) + t * (f(sx, sx.max) - f(sx, sx.min)); return sx.log ? Math.pow(10, v) : v; };
    let s = '';
    const yt = sy.ticks || L.nice(sy.min, sy.max, 5), xt = sx.ticks || L.nice(sx.min, sx.max, 6);
    const yf = sy.fmt || (v => v.toLocaleString('en-US')), xf = sx.fmt || (v => v.toLocaleString('en-US'));
    yt.forEach(v => { s += `<line class="grid" x1="${p.l}" x2="${W - p.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${p.l - 8}" y="${Y(v) + 4}" text-anchor="end">${yf(v)}</text>`; });
    xt.forEach(v => { if (o.xgrid) s += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${p.t}" y2="${H - p.b}"/>`; s += `<text x="${X(v)}" y="${H - p.b + 17}" text-anchor="middle">${xf(v)}</text>`; });
    s += `<line class="axis" x1="${p.l}" x2="${W - p.r}" y1="${H - p.b}" y2="${H - p.b}"/>`;
    if (sx.label) s += `<text x="${(p.l + W - p.r) / 2}" y="${H - 8}" text-anchor="middle">${sx.label}</text>`;
    if (sy.label) s += `<text x="${p.l}" y="${p.t - 7}" class="t-ink">${sy.label}</text>`;
    const api = { X, Y, Xi, W, H, p,
      add(x) { s += x; return api; },
      line(pts, col, w, dash) { s += `<polyline points="${pts.map(q => `${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${w || 2}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`; return api; },
      dots(pts, col, r) { pts.forEach(q => { s += `<circle cx="${X(q[0]).toFixed(1)}" cy="${Y(q[1]).toFixed(1)}" r="${r || 4}" fill="${col}" stroke="var(--bg-2)" stroke-width="2"/>`; }); return api; },
      text(x, y, t, cls, anchor, style) { s += `<text x="${X(x)}" y="${Y(y)}" ${cls ? `class="${cls}"` : ''} text-anchor="${anchor || 'start'}" ${style ? `style="${style}"` : ''}>${t}</text>`; return api; },
      done() { host.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.label || 'chart'}">${s}</svg>`; return host.firstChild; } };
    return api;
  };
  /* hover tooltip for a chart host; items: [{x, y (svg coords), html}] -> shows nearest */
  L.hover = function (host, svgW, getItems, onHover) {
    let tip = host.querySelector('.tip'); if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip); }
    host.style.position = 'relative';
    const move = e => {
      const svg = host.querySelector('svg'); if (!svg) return; const r = svg.getBoundingClientRect(), k = svgW / r.width;
      const px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k; let best = null, bd = 1e9;
      for (const it of getItems()) { const d = it.y == null ? Math.abs(it.x - px) : Math.hypot(it.x - px, it.y - py); if (d < bd) { bd = d; best = it; } }
      if (!best || bd > (best.y == null ? 1e9 : 46)) { tip.classList.remove('on'); if (onHover) onHover(null); return; }
      tip.innerHTML = best.html; tip.classList.add('on');
      const hr = host.getBoundingClientRect(); let tx = r.left - hr.left + best.x / k + 14, ty = r.top - hr.top + (best.y == null ? py : best.y) / k - 12;
      if (tx + tip.offsetWidth > hr.width - 6) tx = r.left - hr.left + best.x / k - tip.offsetWidth - 14; if (ty + tip.offsetHeight > hr.height) ty = hr.height - tip.offsetHeight - 4; if (ty < 2) ty = 2;
      tip.style.left = Math.max(2, tx) + 'px'; tip.style.top = ty + 'px'; if (onHover) onHover(best);
    };
    host.addEventListener('pointermove', move); host.addEventListener('pointerleave', () => { tip.classList.remove('on'); if (onHover) onHover(null); });
  };
  L.legend = items => `<div class="clegend">${items.map(([name, col, line]) => `<span><i class="${line ? 'line' : ''}" style="background:${col}"></i>${name}</span>`).join('')}</div>`;
  L.html = (el, h) => { el.innerHTML = h; return el; };
  /* standard normal / Laplace helpers used by several figures */
  L.erf = x => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; };
  L.Phi = x => 0.5 * (1 + L.erf(x / Math.SQRT2));
  L.lapCdf = (x, b) => (x < 0 ? 0.5 * Math.exp(x / b) : 1 - 0.5 * Math.exp(-x / b));
})();
