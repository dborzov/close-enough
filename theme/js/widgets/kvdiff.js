/* kvdiff experiment 03. Imported measurements and deterministic toys use the book's chart kit. */
(function () {
'use strict';
const L = CE.lib, V = k => `var(--${k})`, pct = (v, n = 0) => (100 * v).toFixed(n) + '%';
const sum = a => a.reduce((s, v) => s + v, 0), mean = a => sum(a) / a.length;
const layers = [3, 7, 11, 15, 19, 23];
const select = (key, label, values, initial) => `<label>${label} <select data-control="${key}">${values.map(v => `<option value="${v}"${String(v) === String(initial) ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`;
const slider = (key, label, min, max, initial, step = 1) => `<label>${label} <input data-control="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${initial}"></label><output data-output="${key}"></output>`;
function frame(el, title, controls, sub = '') {
  el.classList.add('kv-figure');
  el.innerHTML = `<div class="chart-title">${title}</div><div class="chart-sub">${sub}</div><div class="controls">${controls}</div><div class="chartwrap"></div><div class="readout" aria-live="polite"></div>`;
  return { host: el.querySelector('.chartwrap'), read: el.querySelector('.readout'), control: k => el.querySelector(`[data-control="${k}"]`), output: (k, v) => { el.querySelector(`[data-output="${k}"]`).textContent = v; } };
}
function live(el, draw) {
  el.querySelectorAll('input,select').forEach(e => e.addEventListener('input', draw));
  const folded = el.closest('details');
  if (folded) folded.addEventListener('toggle', () => { if (folded.open) draw(); });
  L.redraws.push(draw); draw();
}
function chart(host, label, x, y, h = 290, extra = {}) {
  // Native-width SVG keeps labels readable on phones, rather than shrinking a desktop chart.
  return L.plot(host, { w: Math.max(280, host.clientWidth - 16), h, pad: { l: 48, r: 18, t: 30, b: 48 }, x, y, label, ...extra });
}
function point(P, x, y, color, title, r = 4) {
  P.add(`<circle cx="${P.X(x)}" cy="${P.Y(y)}" r="${r}" fill="${color}" stroke="var(--bg-2)" stroke-width="1.5"><title>${L.esc(title)}</title></circle>`);
}
const legend = items => L.legend(items.map(([t, c, line]) => [t, V(c), line]));
const data = (el, build) => L.withLab(el, 'kvdiff-v-spectrum', build);

CE.widget('kv-axes', el => data(el, D => {
  const F = frame(el, 'One block: tokens × coordinates', select('case', 'Thread', D.sequences.map(s => s.case_no), 286) + select('layer', 'Layer', layers, 11) + select('head', 'Head', [0, 1], 0) + slider('token', 'Token row', 0, 340, 0), 'Schematic only · cells do not encode tensor values');
  function draw() {
    const s = D.sequences.find(s => s.case_no === +F.control('case').value), token = F.control('token');
    token.max = s.n - 1; if (+token.value >= s.n) token.value = s.n - 1;
    const t = +token.value, row = Math.floor(t / s.n * 12), role = t < s.prompt_n ? 'prompt' : 'response';
    F.output('token', `${t} / ${s.n - 1} · ${role}`);
    F.host.innerHTML = `<div class="kv-matrix" aria-label="Schematic matrix with selected token row">${Array.from({length: 288}, (_, i) => `<i${Math.floor(i / 24) === row ? ' class="active"' : ''}></i>`).join('')}</div><div class="chart-sub">12 schematic rows represent ${s.n} tokens; 24 columns represent 256 coordinates →</div>`;
    F.read.textContent = `V[${t}] = [v₀, v₁, v₂, …, v₂₅₅] · thread ${s.case_no}, layer ${F.control('layer').value}, head ${F.control('head').value}. ${s.prompt_n} prompt + ${s.n - s.prompt_n} response positions.`;
  }
  live(el, draw);
}));

CE.widget('kv-projection', el => {
  const F = frame(el, 'Keep a line through the mean', slider('angle', 'Kept direction', 0, 180, 30) + slider('thickness', 'Thickness', 5, 100, 25) + slider('offset', 'Offset', 0, 3, 0, .1) + '<button class="btn" data-align>Align with the cloud</button>', 'Synthetic points · no model data');
  const seed = [];
  for (let i = 0; i < 32; i++) {
    const a = i * 2.3999632297, r = Math.sqrt((i + .5) / 32);
    const p = [r * Math.cos(a), r * Math.sin(a)]; seed.push(p, p.map(v => -v));
  }
  const aa = mean(seed.map(p => p[0] ** 2)), ab = mean(seed.map(p => p[0] * p[1]));
  const residual = seed.map(p => [p[0] / Math.sqrt(aa), p[1] - ab / aa * p[0]]), bb = mean(residual.map(p => p[1] ** 2));
  const whitened = residual.map(p => [p[0], p[1] / Math.sqrt(bb)]);
  function draw() {
    const phi = +F.control('angle').value * Math.PI / 180, t = +F.control('thickness').value / 100, mu = +F.control('offset').value, psi = Math.PI / 6;
    const u = [Math.cos(phi), Math.sin(phi)], points = whitened.map(([a, b]) => [Math.cos(psi) * a - Math.sin(psi) * b * t, Math.sin(psi) * a + Math.cos(psi) * b * t]);
    const energy = sum(points.map(p => p[0] ** 2 + p[1] ** 2)), capture = sum(points.map(p => (p[0] * u[0] + p[1] * u[1]) ** 2)) / energy;
    const w = Math.max(280, F.host.clientWidth - 16), h = 310, scale = Math.min((w - 48) / 8, (h - 60) / 5), X = x => w / 2 + (x - 1.5) * scale, Y = y => h / 2 - y * scale;
    let marks = `<line class="axis" x1="${X(-2.2)}" x2="${X(5.3)}" y1="${Y(0)}" y2="${Y(0)}"/><line class="axis" x1="${X(0)}" x2="${X(0)}" y1="${Y(-2.2)}" y2="${Y(2.2)}"/><text x="15" y="20">coordinate 2 ↑</text><text x="${w - 15}" y="${h - 8}" text-anchor="end">coordinate 1 →</text>`;
    marks += `<line x1="${X(mu - 2.4 * u[0])}" y1="${Y(-2.4 * u[1])}" x2="${X(mu + 2.4 * u[0])}" y2="${Y(2.4 * u[1])}" stroke="${V('k-dec')}" stroke-width="2"/>`;
    points.forEach(p => {
      const z = p[0] * u[0] + p[1] * u[1], q = [mu + z * u[0], z * u[1]];
      marks += `<line x1="${X(mu + p[0])}" y1="${Y(p[1])}" x2="${X(q[0])}" y2="${Y(q[1])}" stroke="${V('k-res')}" opacity=".4"/><rect x="${X(q[0]) - 2}" y="${Y(q[1]) - 2}" width="4" height="4" fill="${V('k-dec')}"/><circle cx="${X(mu + p[0])}" cy="${Y(p[1])}" r="3" fill="${V('k-vec')}"/>`;
    });
    marks += `<path d="M ${X(mu) - 7} ${Y(0)} h 14 M ${X(mu)} ${Y(0) - 7} v 14" stroke="${V('k-book')}" stroke-width="3"/>`;
    F.host.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Synthetic token cloud and its projection">${marks}</svg>`;
    F.output('angle', F.control('angle').value + '°'); F.output('thickness', pct(t)); F.output('offset', mu.toFixed(1));
    F.read.innerHTML = legend([['original', 'k-vec'], ['reconstruction', 'k-dec'], ['residual', 'k-res', true], ['mean', 'k-book']]) + `${pct(capture, 1)} centred variance retained · ${pct(1 - capture, 1)} centred squared error · ${pct(mu ** 2 / (mu ** 2 + energy / points.length), 1)} raw energy in the mean`;
  }
  el.querySelector('[data-align]').addEventListener('click', () => { F.control('angle').value = 30; draw(); }); live(el, draw);
});

CE.widget('kv-tail', el => {
  const F = frame(el, 'A long tail can hide behind a small PR', select('shape', 'Spectrum', ['Exactly 32', 'Long tail', 'Equal in 256'], 'Long tail') + slider('rank', 'Keep directions', 1, 256, 32), 'Synthetic spectra · square-root bar height');
  function draw() {
    const shape = F.control('shape').value, k = +F.control('rank').value;
    const a = Array.from({length: 256}, (_, i) => shape === 'Exactly 32' ? +(i < 32) : shape === 'Equal in 256' ? 1 : (i + 1) ** -1.2), total = sum(a), share = sum(a.slice(0, k)) / total;
    const P = chart(F.host, 'Toy variance spectrum on a square-root scale', {min: .5, max: 256.5, ticks: [1, 64, 128, 192, 256], label: 'principal direction'}, {min: 0, max: Math.sqrt(a[0] / total), ticks: [], label: '√ variance share'}, 245);
    a.forEach((v, i) => { const height = P.Y(0) - P.Y(Math.sqrt(v / total)); P.add(`<rect x="${P.X(i + .6)}" y="${P.Y(Math.sqrt(v / total))}" width="${(P.X(1.4) - P.X(.6)).toFixed(2)}" height="${height}" fill="${V(i < k ? 's1' : 'k-res')}"><title>Direction ${i + 1}: ${pct(v / total, 2)}</title></rect>`); }); P.done();
    let c = 0, k90 = 0; while (c < .9 * total) c += a[k90++];
    F.output('rank', k + ' / 256'); F.read.textContent = `${(total ** 2 / sum(a.map(v => v ** 2))).toFixed(1)} effective dimensions (PR) · ${pct(share, 1)} retained · ${pct(1 - share, 1)} lost · ${k90} directions needed for 90%`;
  }
  live(el, draw);
});

CE.widget('kv-spectrum', el => data(el, D => {
  const F = frame(el, 'The real spectrum: all 256 directions', select('layer', 'Layer', layers, 11) + select('head', 'Head', [0, 1], 0) + slider('rank', 'Keep directions', 1, 256, 32), 'Measured V · pooled rows, each sequence centred separately · in-sample');
  function draw() {
    const a = D.spectra[`${F.control('layer').value}:${F.control('head').value}`], total = sum(a), s = a.map(v => v / total), k = +F.control('rank').value;
    F.host.innerHTML = '<div class="kv-bars"></div><div class="kv-cumulative"></div>';
    const x = {min: .5, max: 256.5, ticks: [1, 64, 128, 192, 256], label: 'principal direction'};
    const P = chart(F.host.firstChild, 'Measured variance shares', {...x, label: '', ticks: []}, {min: 0, max: s[0] * 1.08, fmt: v => pct(v, 1), label: 'variance share'}, 220);
    s.forEach((v, i) => P.add(`<rect x="${P.X(i + .6)}" y="${P.Y(v)}" width="${P.X(1.4) - P.X(.6)}" height="${P.Y(0) - P.Y(v)}" fill="${V(i < k ? 's1' : 'k-res')}"><title>Direction ${i + 1}: ${pct(v, 2)} variance</title></rect>`)); P.done();
    const Q = chart(F.host.lastChild, 'Cumulative measured variance', x, {min: 0, max: 1, ticks: [0, .5, 1], fmt: pct, label: 'cumulative share'}, 225);
    let cumulative = 0; const pts = s.map((v, i) => [i + 1, Math.min(1, cumulative += v)]), retained = pts[k - 1][1];
    Q.line(pts, V('s1'), 2.5); Q.add(`<line x1="${Q.X(k)}" x2="${Q.X(k)}" y1="${Q.p.t}" y2="${Q.Y(0)}" stroke="${V('k-res')}" stroke-dasharray="4 4"/>`); point(Q, k, retained, V('k-res'), `${k}: ${pct(retained, 1)} retained`); Q.done();
    F.output('rank', k + ' / 256'); F.read.innerHTML = legend([['retained', 's1'], ['discarded', 'k-res']]) + `k=${k}: ${pct(retained, 1)} variance retained · ${pct(1 - retained, 1)} discarded. Longer sequences weigh more in this pooled fit.`;
  }
  live(el, draw);
}));

CE.widget('kv-transfer', el => data(el, D => {
  const F = frame(el, 'Where can a basis come from?', select('case', 'Target thread', ['all', ...D.sequences.map(s => s.case_no)], 'all') + select('layer', 'Target layer', ['all', ...layers], 'all') + select('head', 'Target head', ['all', 0, 1], 'all'), 'Measured V · selected target blocks averaged equally');
  const colors = ['s1', 's6', 's3', 's2'], names = ['own thread (chunk CV)', 'other threads', 'other head', 'next cached layer'];
  function draw() {
    const filtered = D.transfer.filter(r => ['case', 'layer', 'head'].every((key, i) => F.control(key).value === 'all' || +F.control(key).value === r[i])), grouped = new Map();
    filtered.forEach(r => { const key = `${r[4]}:${r[3]}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(r[5]); });
    const P = chart(F.host, 'Captured variance by basis source', {min: 1, max: 256, log: true, ticks: [1, 4, 16, 64, 256], label: 'directions retained (log scale)'}, {min: 0, max: 1, ticks: [0, .25, .5, .75, 1], fmt: pct, label: 'centred variance captured'}, 330);
    colors.forEach((c, source) => {
      const pts = [...grouped].filter(([key]) => key.startsWith(source + ':')).map(([key, values]) => [+key.split(':')[1], mean(values)]).sort((a, b) => a[0] - b[0]);
      P.line(pts, V(c), 2.4); pts.forEach(([k, v]) => point(P, k, v, V(c), `${names[source]}, k=${k}: ${pct(v, 1)}; ${grouped.get(`${source}:${k}`).length} target blocks`, 3));
    });
    const ks = [...new Set(filtered.map(r => r[3]))].sort((a, b) => a - b); P.line(ks.map(k => [k, k / 256]), V('muted'), 1.7, '5 4'); P.done();
    const n = filtered.length / (18 * 4); F.read.innerHTML = legend([...names.map((t, i) => [t, colors[i], true]), ['random k/256', 'muted', true]]) + `${n} target block${n === 1 ? '' : 's'} averaged · at k=32: ${names.map((name, i) => `${name} ${pct(mean(grouped.get(`${i}:32`)), 1)}`).join(' · ')}. Fit sizes differ; use the temporal test below for equal fitting budgets.`;
  }
  live(el, draw);
}));

CE.widget('kv-temporal', el => data(el, D => {
  const F = frame(el, 'Equal fitting budgets: own past or other threads?', '', '160 fitting tokens · 32 directions · target second half');
  function draw() {
    const cases = D.sequences.map(s => s.case_no), P = chart(F.host, 'Temporal transfer at equal fit sizes', {min: -.5, max: 4.5, ticks: [0, 1, 2, 3, 4], fmt: i => String(cases[i]), label: 'target thread'}, {min: 0, max: .7, ticks: [0, .2, .4, .6], fmt: pct, label: 'centred variance captured'});
    D.temporal.forEach(r => {
      const i = cases.indexOf(r.case_no), own = r.basis === 'own (first half)', x = i + (own ? -.22 : .02), color = V(own ? 's1' : 's6');
      P.add(`<rect x="${P.X(x)}" y="${P.Y(r.captured)}" width="${P.X(.2) - P.X(0)}" height="${P.Y(0) - P.Y(r.captured)}" fill="${color}"><title>Thread ${r.case_no}, ${r.basis}: ${pct(r.captured, 1)}</title></rect>`);
    }); P.done(); F.read.innerHTML = legend([['own first half', 's1'], ['other threads', 's6']]) + 'Mean over 12 layer × head blocks × 3 draws. Equal sample sizes; temporal separation does not guarantee independence.';
  }
  live(el, draw);
}));

CE.widget('kv-pooling', el => data(el, D => {
  const F = frame(el, 'Pooling across different axes', '', 'Each source block centred separately · mean over 60 seed blocks');
  const scopes = ['one block', '+ other threads', '+ other head', '+ all layers', 'everything'];
  function draw() {
    const rows = scopes.map(s => D.pooling.find(r => r.scope === s));
    const P = chart(F.host, 'Corrected effective dimension by pooling scope', {min: 0, max: 200, ticks: [0, 50, 100, 150, 200], label: 'effective dimension (corrected)'}, {min: -.5, max: 4.5, ticks: []}, 310, {pad: {l: 116, r: 20, t: 25, b: 48}});
    rows.forEach((r, i) => { const y = P.Y(4 - i); P.add(`<text x="${P.p.l - 8}" y="${y + 4}" text-anchor="end">${L.esc(r.scope)}</text><rect x="${P.X(0)}" y="${y - 10}" width="${P.X(r.pr_split) - P.X(0)}" height="20" fill="${V('s1')}"><title>${r.scope}: corrected ${r.pr_split.toFixed(1)}; naive at matched N ${r.pr_matched.toFixed(1)}</title></rect>`); }); P.done();
    F.read.textContent = rows.map(r => `${r.scope}: ${r.pr_split.toFixed(1)}`).join(' · ');
  }
  live(el, draw);
}));

CE.widget('kv-layers', el => data(el, D => {
  const fields = {'Effective dimension': ['pr_split', 60, v => v.toFixed(0)], 'Energy in the mean': ['mean_share', 1, pct], 'RMS vector norm': ['rms_norm', 70, v => v.toFixed(0)]};
  const F = frame(el, 'Three different questions about depth', select('metric', 'Quantity', Object.keys(fields), 'Energy in the mean'), 'Measured V · average over five threads × two heads');
  function draw() {
    const label = F.control('metric').value, [field, max, fmt] = fields[label], rows = D.layer_profile;
    const P = chart(F.host, label + ' across depth', {min: 3, max: 23, ticks: layers, label: 'cached layer (zero-based)'}, {min: 0, max, fmt, label});
    P.line(rows.map(r => [r.layer, r[field]]), V('s1'), 2.5); rows.forEach(r => point(P, r.layer, r[field], V('s1'), `Layer ${r.layer}: ${field === 'mean_share' ? pct(r[field], 1) : r[field].toFixed(1)}`)); P.done();
    F.read.textContent = rows.map(r => `L${r.layer}: ${field === 'mean_share' ? pct(r[field], 1) : r[field].toFixed(1)}`).join(' · ');
  }
  live(el, draw);
}));

CE.widget('kv-calibration', el => data(el, D => {
  const panels = [...new Set(D.calibration.map(r => r.panel))];
  const F = frame(el, 'How sample size bends the estimate', select('panel', 'Data', panels, panels[0]), 'Two estimators · dotted line is the reference');
  function draw() {
    const rows = D.calibration.filter(r => r.panel === F.control('panel').value), synthetic = rows[0].panel.startsWith('synthetic'), ref = synthetic ? rows[0].true_pr : rows[0].long_reference;
    const P = chart(F.host, 'Effective dimension estimates against sample size', {min: 64, max: 4096, log: true, ticks: [64, 256, 1024, 4096], label: 'number of token vectors (log scale)'}, {min: 0, max: 60, label: 'effective dimension'}, 310);
    ['naive (in-sample)', 'split-half corrected'].forEach((est, i) => { const r = rows.filter(r => r.estimator === est).sort((a, b) => a.N - b.N), c = V(i ? 's6' : 's1'); P.line(r.map(r => [r.N, r.pr]), c, 2.4); r.forEach(r => point(P, r.N, r.pr, c, `${est}, N=${r.N}: ${r.pr.toFixed(1)}`)); });
    P.line([[64, ref], [4096, ref]], V('muted'), 1.5, '3 4'); P.done();
    F.read.innerHTML = legend([['naive', 's1', true], ['split-half corrected', 's6', true], [synthetic ? 'true value' : 'whole thread, corrected', 'muted', true]]) + `Reference PR: ${ref.toFixed(1)}. ${synthetic ? 'Gaussian simulation with measured covariance and ρ=0.55.' : 'Contiguous windows of thread 104, layer 11, head 0.'}`;
  }
  live(el, draw);
}));

CE.widget('kv-threads', el => data(el, D => {
  const F = frame(el, 'Short sequences gain more from correction', '', 'Mean effective dimension per thread · layers and heads averaged');
  function draw() {
    const P = chart(F.host, 'Naive and corrected effective dimension by thread length', {min: 250, max: 3200, log: true, ticks: [341, 740, 2548], label: 'thread length (tokens, log scale)'}, {min: 25, max: 55, label: 'effective dimension'}, 310);
    D.sequences.forEach(s => {
      const rows = D.threads.filter(r => r.case_no === s.case_no), a = rows.find(r => r.estimate === 'naive'), b = rows.find(r => r.estimate === 'corrected');
      P.line([[s.n, a.pr], [s.n, b.pr]], V('muted'), 1.5);
      [a, b].forEach(r => point(P, s.n, r.pr, V(r.estimate === 'naive' ? 's1' : 's6'), `Thread ${s.case_no}: ${r.estimate} PR ${r.pr.toFixed(1)}, ${s.n} tokens`, 5));
      P.add(`<text x="${P.X(s.n)}" y="${P.Y(b.pr) - 12}" text-anchor="middle">${s.case_no}</text>`);
    }); P.done(); F.read.innerHTML = legend([['naive', 's1'], ['corrected', 's6']]) + 'Correction reduces finite-sample bias; it does not remove temporal dependence.';
  }
  live(el, draw);
}));

CE.widget('kv-rate', el => data(el, D => {
  const F = frame(el, 'The spectrum buys room in an ideal Gaussian model', '', 'Median rate over 12 separately centred layer × head spectra');
  function draw() {
    const P = chart(F.host, 'Ideal Gaussian rate versus allowed relative squared error', {min: .3, max: .005, log: true, ticks: [.3, .1, .03, .01, .005], fmt: v => pct(v, v < .01 ? 1 : 0), label: 'allowed centred error → stricter'}, {min: 0, max: 1050, ticks: [0, 250, 500, 750, 1000], label: 'ideal bits / vector'}, 320);
    ['V', 'isotropic (same total variance)'].forEach((variant, i) => {
      const rows = D.rd.filter(r => r.variant === variant).sort((a, b) => b.D - a.D), col = V(i ? 'muted' : 's1'); P.line(rows.map(r => [r.D, r.bits]), col, 2.5, i ? '5 4' : ''); rows.forEach(r => point(P, r.D, r.bits, col, `${variant}, error ${pct(r.D, 1)}: ${r.bits.toFixed(0)} ideal bits`, 3));
    }); P.done(); F.read.innerHTML = legend([['measured V spectrum, Gaussian model', 's1', true], ['equal variance reference', 'muted', true]]) + 'Raw bf16: 4,096 bits/vector. These curves omit mean/basis storage, coding overhead and model-output effects.';
  }
  live(el, draw);
}));
})();
