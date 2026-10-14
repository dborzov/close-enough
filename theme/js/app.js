/* Navigation, reading progress and glossary pop-overs. No dependencies.
   State lives in localStorage under one key so it survives reloads and is easy to reset. */
(function () {
  'use strict';
  const BOOK = window.BOOK, KEY = 'ce:v1';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const slug = document.documentElement.dataset.slug;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ---------- state ---------- */
  let S = { pages: {}, terms: {}, theme: null, last: null };
  try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const pg = s => (S.pages[s] = S.pages[s] || {});
  const isRead = s => !!(S.pages[s] && S.pages[s].done), isSeen = s => !!S.pages[s];
  const ORDER = BOOK.order.filter(s => s !== 'index');  // the cover does not count as a page to read
  const nRead = () => ORDER.filter(isRead).length;
  const inBook = !!BOOK.pages[slug];
  if (inBook) { pg(slug).seen = pg(slug).seen || Date.now(); if (slug !== 'index') S.last = slug; save(); }

  /* ---------- theme ---------- */
  const themeBtn = $('#theme-btn');
  const sysDark = () => !window.matchMedia('(prefers-color-scheme: light)').matches;
  const curTheme = () => S.theme || (sysDark() ? 'dark' : 'light');
  function applyTheme() { if (S.theme) document.documentElement.dataset.theme = S.theme; else delete document.documentElement.dataset.theme; $('#theme-ico').textContent = curTheme() === 'dark' ? '☾' : '☀'; }
  themeBtn.addEventListener('click', () => { S.theme = curTheme() === 'dark' ? 'light' : 'dark'; save(); applyTheme(); });
  applyTheme();

  /* ---------- toast ---------- */
  const toast = $('#toast');
  function say(msg) { toast.textContent = msg; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('on'), 1800); }

  /* ---------- progress marks everywhere ---------- */
  function paintProgress() {
    const total = ORDER.length, done = nRead(), pct = Math.round(done / total * 100);
    $('#ring .fg').setAttribute('stroke-dasharray', `${pct} 100`);
    $('#ring-t').textContent = `${done}/${total}`;
    $('#ring').title = `${done} of ${total} pages read`;
    $$('[data-page]').forEach(a => { const s = a.dataset.page; a.classList.toggle('read', isRead(s)); a.classList.toggle('seen', isSeen(s) && !isRead(s)); });
    const btn = $('#done-btn');
    if (btn && inBook) { const d = isRead(slug); btn.setAttribute('aria-pressed', d); $('.dl', btn).textContent = d ? 'Read' : 'Mark as read'; const ms = $('#meta-state'); ms.textContent = d ? '✓ read' : ''; ms.className = d ? 'ok' : ''; }
    const tp = $('#toc-prog'); if (tp) tp.textContent = `${done} / ${total} read`;
    document.dispatchEvent(new CustomEvent('ce:progress'));
  }
  function setRead(s, v, quiet) { const p = pg(s); if (!!p.done === v) return; p.done = v; save(); paintProgress(); if (!quiet) say(v ? 'Marked as read' : 'Marked as unread'); }
  const doneBtn = $('#done-btn');
  if (doneBtn) doneBtn.addEventListener('click', () => setRead(slug, !isRead(slug)));
  const mf = $('#meta-fig'); if (mf && +mf.dataset.n) mf.textContent = `${mf.dataset.n} figure${+mf.dataset.n > 1 ? 's' : ''}`;

  /* ---------- left rail: pages of this part + sections of this page ---------- */
  const here = BOOK.pages[slug];
  const sections = $$('.prose > h2[id]').map(h => ({ id: h.id, el: h, title: h.textContent.replace(/^\d+/, '').trim() }));
  const railOl = $('#rail-pages');
  if (railOl && here) {
    const part = BOOK.parts[here.part];
    railOl.innerHTML = part.pages.map(s => {
      const p = BOOK.pages[s], cur = s === slug;
      const sub = cur && sections.length ? `<ol>${sections.map(x => `<li><a href="#${x.id}" data-sec="${x.id}">${esc(x.title)}</a></li>`).join('')}</ol>` : '';
      return `<li class="${cur ? 'here' : ''}"><a href="${s}.html" data-page="${s}"><i class="tickbox"></i><span class="n">${p.num}</span><span>${esc(p.title)}</span></a>${sub}</li>`;
    }).join('');
    const more = document.createElement('div'); more.className = 'rail-more';
    const nl = BOOK.items.filter(i => i[0] === 'experiment' && i[1] === slug).length;
    more.innerHTML = '<button id="rail-toc">☰ All contents <kbd>t</kbd></button><a href="browse.html">◫ Browse by kind <kbd>b</kbd></a><a href="glossary.html">Aa Glossary <kbd>g</kbd></a>' +
      (nl ? `<a href="browse.html#experiments">⚗ ${nl} experiment${nl > 1 ? 's' : ''} here · all ${BOOK.items.filter(i => i[0] === 'experiment').length}</a>` : '');
    railOl.after(more); $('#rail-toc').addEventListener('click', () => openToc());
  } else if (railOl) { $('#rail .rail-part').innerHTML = '<span class="pn">Reference</span>' + esc(document.title.split(' · ')[0]); const more = document.createElement('div'); more.className = 'rail-more'; more.innerHTML = '<button id="rail-toc">☰ All contents <kbd>t</kbd></button><a href="browse.html">◫ Browse by kind <kbd>b</kbd></a><a href="glossary.html">Aa Glossary <kbd>g</kbd></a><a href="index.html">← Cover</a>'; railOl.after(more); $('#rail-toc').addEventListener('click', () => openToc()); }

  /* ---------- scroll: reading bar, current section, auto "read" at the end, remember position ---------- */
  const readbar = $('#readbar i'), crumbSec = $('#crumb-sec');
  let ticking = false, curSec = null, saveT = null;
  function onScroll() {
    ticking = false;
    const doc = document.documentElement, max = doc.scrollHeight - innerHeight, p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
    readbar.style.width = (p * 100).toFixed(1) + '%';
    let cs = null; for (const s of sections) if (s.el.getBoundingClientRect().top <= 110) cs = s;
    if (cs !== curSec) { curSec = cs; crumbSec.textContent = cs ? cs.title : ''; $$('[data-sec]').forEach(a => a.classList.toggle('cur', !!cs && a.dataset.sec === cs.id)); }
    if (inBook && slug !== 'index') {
      const st = pg(slug); st.max = Math.max(st.max || 0, p);
      // "read" = you reached the pager at the bottom
      const foot = $('.page-foot'); if (foot && !st.done && foot.getBoundingClientRect().top < innerHeight - 40 && scrollY > 200) setRead(slug, true, true);
      clearTimeout(saveT); saveT = setTimeout(() => { st.y = Math.round(scrollY); save(); }, 250);
    }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  // come back to where you stopped (unless the link pointed at a section)
  if (inBook && !location.hash && pg(slug).y > 300 && !pg(slug).done && performance.getEntriesByType('navigation')[0]?.type !== 'reload') {
    const y = pg(slug).y; requestAnimationFrame(() => { scrollTo(0, y); say('Picked up where you left off'); });
  }

  /* ---------- contents overlay ---------- */
  const toc = $('#toc'), tocBody = $('#toc-body'), tocQ = $('#toc-q'), tocBtn = $('#toc-btn');
  function partHtml(part, i, filter) {
    const pages = part.pages.filter(s => !filter || filter(s));
    if (!pages.length) return '';
    const done = part.pages.filter(isRead).length;
    return `<section class="toc-part" style="--c:var(--${part.color})"><h3><span class="pn">${part.n != null ? 'Part ' + part.n : ''}</span><span>${esc(part.title)}</span><span class="pp">${done}/${part.pages.length}</span></h3><ol>` +
      pages.map(s => { const p = BOOK.pages[s], cur = s === slug;
        const sub = cur && p.sections.length ? `<ol>${p.sections.map(x => `<li><a href="${s}.html#${x.id}" data-sec="${x.id}" class="${curSec && curSec.id === x.id ? 'cur' : ''}">${esc(x.title)}</a></li>`).join('')}</ol>` : '';
        return `<li class="${cur ? 'here' : ''}"><a href="${s}.html" data-page="${s}" class="${isRead(s) ? 'read' : isSeen(s) ? 'seen' : ''}"><i class="tickbox"></i><span class="n">${p.num}</span><span>${esc(p.title)}</span><span class="m">${p.minutes}′</span></a>${sub}</li>`; }).join('') + '</ol></section>';
  }
  function renderToc(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) { tocBody.innerHTML = BOOK.parts.map((p, i) => partHtml(p, i)).join(''); return; }
    const hit = t => t.toLowerCase().includes(q);
    const pages = BOOK.order.filter(s => hit(BOOK.pages[s].title) || hit(BOOK.pages[s].goal));
    const secs = []; BOOK.order.forEach(s => BOOK.pages[s].sections.forEach(x => { if (hit(x.title)) secs.push([s, x]); }));
    const terms = Object.entries(BOOK.terms).filter(([id, t]) => hit(t.term) || t.aka.some(hit) || id.includes(q)).slice(0, 14);
    let h = '<div class="toc-hits">';
    if (pages.length) h += '<h4>Pages</h4>' + pages.map(s => `<a href="${s}.html"><span class="w">${BOOK.pages[s].num || 'page'}</span><span>${esc(BOOK.pages[s].title)}<small>${esc(BOOK.pages[s].goal.slice(0, 90))}</small></span></a>`).join('');
    if (secs.length) h += '<h4>Sections</h4>' + secs.slice(0, 14).map(([s, x]) => `<a href="${s}.html#${x.id}"><span class="w">${BOOK.pages[s].num}</span><span>${esc(x.title)}<small>in ${esc(BOOK.pages[s].title)}</small></span></a>`).join('');
    const its = BOOK.items.filter(i => hit(i[3]) || hit(i[4])).concat(BOOK.items.filter(i => !hit(i[3]) && !hit(i[4]) && hit(i[5]))).slice(0, 16);   // title matches first, then text
    if (its.length) h += '<h4>Experiments, figures and boxes</h4>' + its.map(i => `<a href="${i[1]}.html#${i[2]}"><span class="w">${esc(i[0] === 'experiment' ? i[4] : BOOK.kinds[i[0]])}</span><span>${esc(i[3])}<small>in ${BOOK.pages[i[1]].num} ${esc(BOOK.pages[i[1]].title)}</small></span></a>`).join('');
    if (terms.length) h += '<h4>Glossary</h4>' + terms.map(([id, t]) => `<a href="glossary.html#${id}"><span class="w">term</span><span>${esc(t.term)}<small>${t.short.replace(/<[^>]+>/g, '').slice(0, 90)}</small></span></a>`).join('');
    if (!pages.length && !secs.length && !terms.length && !its.length) h += '<h4>Nothing matches. Try a shorter word.</h4>';
    tocBody.innerHTML = h + '</div>';
  }
  let lastFocus = null;
  function openToc(focusSearch) { lastFocus = document.activeElement; renderToc(''); tocQ.value = ''; toc.hidden = false; tocBtn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; paintProgress();
    const cur = $('.toc-part li.here', tocBody); if (cur) cur.scrollIntoView({ block: 'center' }); (focusSearch ? tocQ : $('#toc-close')).focus(); if (focusSearch !== false) tocQ.focus(); }
  function closeToc() { if (toc.hidden) return; toc.hidden = true; tocBtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  tocBtn.addEventListener('click', () => (toc.hidden ? openToc() : closeToc()));
  $('#toc-close').addEventListener('click', closeToc);
  toc.addEventListener('click', e => { if (e.target === toc) closeToc(); else if (e.target.closest('a')) { toc.hidden = true; document.body.style.overflow = ''; } });
  tocQ.addEventListener('input', () => renderToc(tocQ.value));
  tocQ.addEventListener('keydown', e => {
    const links = $$('a', tocBody); if (!links.length) return;
    let i = links.findIndex(a => a.classList.contains('kb'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (i >= 0) links[i].classList.remove('kb'); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length; links[i].classList.add('kb'); links[i].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { const a = i >= 0 ? links[i] : (tocQ.value ? links[0] : null); if (a) location.href = a.href; }
  });
  $('#reset-prog').addEventListener('click', () => { if (confirm('Forget which pages you have read?')) { S.pages = {}; S.terms = {}; S.last = null; save(); renderToc(tocQ.value); paintProgress(); say('Reading progress cleared'); } });

  /* ---------- keyboard ---------- */
  const pager = { prev: $('.pager a.prev'), next: $('.pager a.next') };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!toc.hidden) closeToc(); hidePop(true); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target; if (t.matches && t.matches('input, textarea, select, [contenteditable]')) return;
    if (e.key === 't' || e.key === 'c') { e.preventDefault(); toc.hidden ? openToc() : closeToc(); }
    else if (e.key === '/') { e.preventDefault(); openToc(true); }
    else if (e.key === 'g') location.href = 'glossary.html';
    else if (e.key === 'b') location.href = 'browse.html';
    else if (!toc.hidden) return;
    else if (e.key === 'ArrowRight' && pager.next) location.href = pager.next.href;
    else if (e.key === 'ArrowLeft' && pager.prev) location.href = pager.prev.href;
  });
  if (pager.next) pager.next.addEventListener('click', () => { if (inBook && slug !== 'index') setRead(slug, true, true); });

  /* ---------- pop-overs: glossary terms and page links ---------- */
  const pop = $('#pop'); let popFor = null, popPinned = false, hideT = null, showT = null;
  function termHtml(id) {
    const t = BOOK.terms[id]; if (!t) return null;
    const p = t.page && BOOK.pages[t.page];
    const aka = t.aka.filter(a => a.toLowerCase() !== t.term.toLowerCase()).slice(0, 2).join(', ');
    return { c: `var(--k-${t.color})`, h: `<span class="pk">Glossary</span><div class="pt"><span>${esc(t.term)}</span>${aka ? `<small>${esc(aka)}</small>` : ''}</div><p>${t.short}</p><div class="pf">${p && t.page !== slug ? `<a href="${t.page}.html">Explained in ${p.num} ${esc(p.title)} →</a>` : p ? '<span class="ok">explained on this page</span>' : ''}<a href="glossary.html#${id}">Glossary entry</a></div>` };
  }
  function pageHtml(s) {
    const p = BOOK.pages[s]; if (!p) return null; const part = BOOK.parts[p.part];
    return { c: `var(--${part.color})`, h: `<span class="pk">${part.n != null ? 'Part ' + part.n + ' · ' : ''}${esc(part.title)}</span><div class="pt"><span>${p.num} ${esc(p.title)}</span></div><p>${esc(p.goal)}</p><div class="pf"><span>~${p.minutes} min</span>${isRead(s) ? '<span class="ok">✓ you read this</span>' : isSeen(s) ? '<span>opened, not finished</span>' : '<span>not read yet</span>'}</div>` };
  }
  function showPop(a, pinned) {
    const d = a.dataset.term ? termHtml(a.dataset.term) : pageHtml(a.dataset.page); if (!d) return;
    clearTimeout(hideT); popFor = a; popPinned = !!pinned; pop.innerHTML = d.h; pop.style.setProperty('--c', d.c); pop.hidden = false;
    $$('a.term.open').forEach(x => x.classList.remove('open')); if (a.dataset.term) { a.classList.add('open'); S.terms[a.dataset.term] = (S.terms[a.dataset.term] || 0) + 1; save(); }
    const r = a.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.left + scrollX + r.width / 2 - pw / 2; x = Math.max(scrollX + 12, Math.min(scrollX + innerWidth - pw - 12, x));
    let y = r.bottom + scrollY + 8; if (r.bottom + ph + 16 > innerHeight && r.top - ph - 8 > 60) y = r.top + scrollY - ph - 8;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function hidePop(now) { clearTimeout(showT); const go = () => { pop.hidden = true; popFor = null; popPinned = false; $$('a.term.open').forEach(x => x.classList.remove('open')); }; if (now) go(); else { clearTimeout(hideT); hideT = setTimeout(go, 180); } }
  const popSel = 'a.term, .prose a[data-page], .gl-item a[data-page]';
  const canHover = window.matchMedia('(hover: hover)').matches;
  if (canHover) {
    document.addEventListener('mouseover', e => { const a = e.target.closest && e.target.closest(popSel); if (!a || a === popFor) return; clearTimeout(showT); showT = setTimeout(() => showPop(a, false), 140); });
    document.addEventListener('mouseout', e => { const a = e.target.closest && e.target.closest(popSel); if (a && !popPinned) hidePop(); else clearTimeout(showT); });
    pop.addEventListener('mouseenter', () => clearTimeout(hideT)); pop.addEventListener('mouseleave', () => { if (!popPinned) hidePop(); });
  }
  document.addEventListener('focusin', e => { const a = e.target.closest && e.target.closest('a.term'); if (a && a !== popFor) showPop(a, false); });
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.term');
    if (a && !a.closest('#pop')) { // first click shows the reminder; the pop-over holds the links
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); if (popFor === a && popPinned) hidePop(true); else showPop(a, true); return;
    }
    if (!e.target.closest('#pop')) hidePop(true);
  });

  /* ---------- widgets: mount when they scroll near the viewport ---------- */
  const CE = (window.CE = window.CE || {}); CE.registry = CE.registry || {}; CE.state = S; CE.say = say;
  CE.widget = (name, fn) => { CE.registry[name] = fn; mountAll(); };
  let io = null;
  function mount(el) { const fn = CE.registry[el.dataset.widget]; if (!fn || el.dataset.mounted) return; el.dataset.mounted = '1'; el.innerHTML = ''; try { fn(el); } catch (err) { console.error('widget ' + el.dataset.widget, err); el.innerHTML = '<div class="readout">This figure failed to load: ' + esc(err.message) + '</div>'; } }
  function mountAll() { if (!document.body) return; $$('.widget[data-widget]:not([data-mounted])').forEach(el => { if (!CE.registry[el.dataset.widget]) return; if (io) io.observe(el); else mount(el); }); }
  if ('IntersectionObserver' in window && !/mountall/.test(location.search)) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); mount(e.target); } }), { rootMargin: '600px 0px' });
  document.addEventListener('DOMContentLoaded', mountAll);

  /* ---------- glossary page ---------- */
  const glf = $('#gl-filter');
  if (glf) {
    const items = $$('.gl-item'), count = $('#gl-count');
    items.forEach(it => { const n = S.terms[it.dataset.termId]; if (n) { const b = document.createElement('span'); b.className = 'seen'; b.textContent = `looked up ${n}×`; $('dt', it).appendChild(b); } });
    const run = () => { const q = glf.value.trim().toLowerCase(); let n = 0; items.forEach(it => { const ok = !q || it.textContent.toLowerCase().includes(q); it.hidden = !ok; if (ok) n++; }); $$('.prose > h2').forEach(h => { const dl = h.nextElementSibling; h.hidden = dl && !$$('.gl-item:not([hidden])', dl).length; }); count.textContent = `${n} of ${items.length} terms`; };
    glf.addEventListener('input', run); run();
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView({ block: 'center' }), 50); }
  }

  /* ---------- browse page: filter by words, kind and part ---------- */
  const brf = $('#br-filter');
  if (brf) {
    const items = $$('.br-item'), chips = $$('.br-chip'), part = $('#br-part'), count = $('#br-count');
    const on = new Set(chips.map(c => c.dataset.kind));
    const run = () => {
      const q = brf.value.trim().toLowerCase(); let n = 0;
      items.forEach(it => { const k = it.closest('.br-kind').dataset.kind; const ok = on.has(k) && (!part.value || it.dataset.part === part.value) && (!q || it.textContent.toLowerCase().includes(q)); it.hidden = !ok; if (ok) n++; });
      $$('.br-kind').forEach(sec => { sec.hidden = !$$('.br-item:not([hidden])', sec).length; });
      count.textContent = `${n} of ${items.length}`;
    };
    chips.forEach(c => c.addEventListener('click', e => {
      const k = c.dataset.kind;
      if (e.altKey || e.metaKey || on.size === chips.length) { on.clear(); on.add(k); }   // first click (or alt-click) shows only this kind
      else if (on.has(k) && on.size > 1) on.delete(k); else on.add(k);
      if (!on.size) chips.forEach(x => on.add(x.dataset.kind));
      chips.forEach(x => x.setAttribute('aria-pressed', on.has(x.dataset.kind)));
      run();
    }));
    brf.addEventListener('input', run); part.addEventListener('change', run);
    const fromHash = () => {   // browse.html#experiments shows only that kind
      const h = location.hash.slice(1), only = chips.find(c => c.dataset.kind + 's' === h); if (!only) return;
      on.clear(); on.add(only.dataset.kind); chips.forEach(x => x.setAttribute('aria-pressed', on.has(x.dataset.kind))); run();
      const sec = document.getElementById(h); if (sec) sec.scrollIntoView();
    };
    addEventListener('hashchange', fromHash);
    run(); fromHash();
  }

  /* ---------- cover page: part cards with progress, "continue" button ---------- */
  const grid = $('#partgrid');
  function paintCover() {
    if (!grid) return;
    grid.innerHTML = BOOK.parts.filter(p => p.n != null).map(part => { const done = part.pages.filter(isRead).length, mins = part.pages.reduce((a, s) => a + BOOK.pages[s].minutes, 0);
      return `<section class="partcard" id="part-${part.n}" style="--c:var(--${part.color})"><h3><span class="pn">Part ${part.n}</span><span>${esc(part.title)}</span><span class="pp">${done}/${part.pages.length} read · ~${mins} min</span></h3><p class="blurb">${esc(part.blurb)}</p><ol>` +
        part.pages.map(s => `<li><a href="${s}.html" class="${isRead(s) ? 'read' : isSeen(s) ? 'seen' : ''}"><i class="tickbox"></i><span class="n">${BOOK.pages[s].num}</span><span>${esc(BOOK.pages[s].title)}</span></a></li>`).join('') + '</ol></section>'; }).join('');
    const c = $('#continue'); if (!c) return;
    const next = S.last && !isRead(S.last) ? S.last : BOOK.order.find(s => s !== 'index' && !isRead(s));
    const started = nRead() > 0 || S.last;
    const first = BOOK.order.find(s => s !== 'index');
    c.innerHTML = `<div class="cta"><a class="primary" href="${(started && next ? next : first)}.html">${started && next ? 'Continue: ' + BOOK.pages[next].num + ' ' + esc(BOOK.pages[next].title) + ' →' : 'Start reading →'}</a><a href="#parts">Browse the parts</a><a href="browse.html#experiments">Start with the experiments</a><a href="glossary.html">Glossary</a></div>`;
  }
  document.addEventListener('ce:progress', paintCover);

  paintProgress(); onScroll();
})();
