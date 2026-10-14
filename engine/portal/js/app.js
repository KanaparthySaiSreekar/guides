/* app: shell, router, theme, keyboard, boot. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const U = CP.U, UI = CP.ui, esc = U.esc;
  CP.views = CP.views || {};

  const NAV = [
    [null, [['', 'Today', 'house-line']]],
    ['Learn', [['path', 'Learning path', 'path'], ['blueprint', 'Blueprint', 'squares-four'], ['guide', 'Study guide', 'book-open-text'], ['cheat', 'Cheat sheet', 'clipboard-text'], ['traps', 'Traps & tips', 'warning-diamond']]],
    ['Practise', [['practice', 'Practice & mocks', 'target'], ['progress', 'Progress', 'chart-line-up']]],
    ['Reference', [['exam', 'Exam facts', 'calendar-check'], ['settings', 'Settings', 'gear-six'], ['about', 'About', 'info']]],
  ];
  const TABS = [['', 'Today', 'house-line'], ['guide', 'Guide', 'book-open-text'], ['cheat', 'Cheat', 'clipboard-text'], ['practice', 'Practice', 'target'], ['more', 'More', 'dots-three-outline']];

  function shell() {
    const app = UI.$('#app');
    const I = UI.icon;
    app.innerHTML = `<div class="shell">
      <header class="topbar"><a class="brand" href="#/"><span class="mark" aria-hidden="true">${I('compass-tool')}</span><span><b>CCAR-P</b><small>Study portal</small></span></a><span class="grow"></span>
        <button class="iconbtn" data-act="theme" aria-label="Switch between light and dark">${I('moon')}</button></header>
      <nav class="rail" aria-label="Main">
        <a class="brand" href="#/"><span class="mark" aria-hidden="true">${I('compass-tool')}</span><span><b>CCAR-P Study Portal</b><small>Claude Certified Architect, Professional</small></span></a>
        ${NAV.map(([g, items]) => `${g ? `<div class="grp">${esc(g)}</div>` : ''}${items.map(([r, l, ic]) => `<a class="nav" data-nav="${r}" href="#/${r}">${I(ic)}<span>${esc(l)}</span></a>`).join('')}`).join('')}
        <div class="foot">Built on the CCAR-P Exam Guide v1.0<br>Developed by <b>IYKYK</b></div>
      </nav>
      <main id="main" class="content" tabindex="-1"></main>
      <nav class="tabs" aria-label="Sections">${TABS.map(([r, l, ic]) => `<a data-nav="${r}" href="#/${r}">${I(ic)}<span class="lbl">${esc(l)}</span></a>`).join('')}</nav>
    </div>`;
  }

  function parse() {
    const h = decodeURIComponent((location.hash || '#/').replace(/^#\/?/, ''));
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const q = {};
    (qs || '').split('&').filter(Boolean).forEach(kv => { const [k, v] = kv.split('='); q[k] = v == null ? '1' : v; });
    return { parts, q, raw: h };
  }
  const ROUTES = { '': 'today', path: 'path', blueprint: 'blueprint', guide: 'guide', cheat: 'cheat', traps: 'traps', practice: 'practice', s: 'runner', r: 'report', progress: 'progress', exam: 'exam', settings: 'settings', about: 'about', more: 'more' };

  let current = null;
  const router = CP.router = {};
  router.render = (keepScroll) => {
    const p = parse();
    const name = ROUTES[p.parts[0] || ''] || 'today';
    const v = CP.views[name] || CP.views.today;
    if (current && current.v.leave && current.name !== name) try { current.v.leave(); } catch (e) { console.error(e); }
    const main = UI.$('#main');
    const y = window.scrollY;
    let html;
    try { html = v.render(p); } catch (e) { console.error(e); html = `<div class="callout badc"><div class="ct">Something went wrong</div><p>${esc(e.message)}</p><p><a href="#/">Back to Today</a></p></div>`; }
    main.className = 'content' + (v.wide ? (typeof v.wide === 'function' ? (v.wide(p) ? ' wide' : '') : ' wide') : '') + (name === 'guide' ? ' guide' : '');
    document.body.classList.toggle('exam', !!(v.exam && v.exam(p)));
    document.body.classList.toggle('runner-active', name === 'runner');
    main.innerHTML = html;
    const t = v.title ? v.title(p) : 'CCAR-P Study Portal';
    document.title = t + (t.includes('CCAR-P') ? '' : ' · CCAR-P Study Portal');
    UI.$$('[data-nav]').forEach(a => { const on = (a.getAttribute('data-nav') || '') === (p.parts[0] || '') || (a.getAttribute('data-nav') === 'more' && ['path', 'blueprint', 'traps', 'progress', 'exam', 'settings', 'about', 'more'].includes(p.parts[0])); a.toggleAttribute('aria-current', false); if (on) a.setAttribute('aria-current', 'page'); });
    current = { name, v, p };
    if (v.after) try { v.after(main, p); } catch (e) { console.error(e); }
    if (keepScroll) window.scrollTo(0, y);
    else if (!(v.keepFocus && v.keepFocus(p))) {
      const h1 = UI.$('h1', main);
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
      if (!p.q.anchor && !(name === 'guide' && p.parts[2])) window.scrollTo(0, 0);
    }
  };
  router.current = () => current;
  router.refresh = () => router.render(true);

  // ---------- theme & preferences ----------
  CP.act = CP.act || {};
  CP.act.theme = () => { const s = CP.store.S.settings; const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); s.theme = dark ? 'light' : 'dark'; CP.store.save(); CP.applyPrefs(); };
  CP.applyPrefs = () => {
    const s = CP.store.S.settings, root = document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme); else root.removeAttribute('data-theme');
    root.style.setProperty('--scale', String((s.textScale || 100) / 100));
    document.body.classList.toggle('sans', !s.serif);
  };

  // ---------- keyboard ----------
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.target.type !== 'radio' && e.target.type !== 'checkbox') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (UI.$('#modal-root').innerHTML) return;
    if (current && current.v.onKey) current.v.onKey(e, current.p);
  });

  // ---------- boot ----------
  CP.boot = () => {
    let D;
    try { D = JSON.parse(document.getElementById('cp-data').textContent); }
    catch (e) { document.body.innerHTML = '<p style="padding:24px">The portal data could not be read. Re-download the file.</p>'; return; }
    CP.D = D;
    CP.bank.init(D);
    CP.store.load();
    CP.store.S.bank = D.meta && D.meta.bank;
    shell();
    CP.applyPrefs();
    CP.store.listeners.push(() => { UI.toast('Saving failed: storage is full or blocked. Export your progress.', 5000); });
    window.addEventListener('hashchange', () => router.render());
    const flush = () => { const c = router.current(); if (c && c.name === 'runner') { const s = CP.sess.get(c.p.parts[1]); if (s) CP.sess.leave(s); } CP.store.save(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeprint', () => { if (router.current() && router.current().name === 'cheat') document.body.classList.add('printing-cheat'); });
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-cheat'));
    router.render();
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', CP.boot); else CP.boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
