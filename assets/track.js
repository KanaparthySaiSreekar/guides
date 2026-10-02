/* Usage log for the hosted guides site (the standalone offline files never include it). Records opens, page views,
   active time and the apps' study events (the 'guides:track' DOM events) under a random device id kept in this browser,
   plus a name from a named link (?u=asha). Sends them to the collector (analytics/worker.js), which adds the IP address,
   location and network. Events wait in localStorage while offline and go out when a connection returns; the collector
   ignores duplicates, so a batch can be sent twice safely. Configured by its script tag: data-endpoint, data-app. */
(() => {
  const me = document.currentScript, EP = me && me.dataset.endpoint, APP = me && me.dataset.app;
  if (!EP || !window.fetch || !window.JSON) return;
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };
  const ID = /^[A-Za-z0-9-]{8,64}$/;
  const rid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

  let dev = ls.get('guides.device'), first = false;
  if (!dev || !ID.test(dev)) { dev = rid(); first = ls.set('guides.device', dev); }
  // A named link (?u=asha) labels this browser from now on; the parameter is removed from the address bar.
  try {
    const url = new URL(location.href), named = url.searchParams.get('u');
    if (named != null) {
      if (named.trim()) ls.set('guides.user', named.trim().slice(0, 60));
      url.searchParams.delete('u');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
  } catch { }

  // ---------- queue ----------
  const QK = 'guides.queue', MAXQ = 1000;
  let mem = null; // used only when localStorage is unavailable (private mode, blocked storage)
  const readQ = () => { if (mem) return mem.slice(); try { return JSON.parse(ls.get(QK) || '[]'); } catch { return []; } };
  const writeQ = q => { q = q.slice(-MAXQ); if (!ls.set(QK, JSON.stringify(q))) mem = q; };
  const sid = rid();
  let hints = {};
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion']).then(v => { hints = { model: v.model || undefined, platformVersion: v.platformVersion || undefined }; }).catch(() => { });
  }
  const ctx = () => {
    const n = navigator, ud = n.userAgentData;
    return {
      screen: `${screen.width}x${screen.height}`, view: `${innerWidth}x${innerHeight}`, dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
      tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(), lang: n.language,
      touch: n.maxTouchPoints || 0, platform: ud ? ud.platform : undefined, mobile: ud ? ud.mobile : undefined,
      standalone: (matchMedia('(display-mode: standalone)').matches || n.standalone === true) || undefined,
      mem: n.deviceMemory, cores: n.hardwareConcurrency, net: n.connection ? n.connection.effectiveType : undefined, ...hints,
    };
  };
  const body = batch => JSON.stringify({ dev, usr: ls.get('guides.user') || undefined, ctx: ctx(), events: batch });
  function push(t, data) {
    const q = readQ();
    q.push({ ...data, eid: rid(), t, at: Date.now(), sid, app: APP, path: (location.pathname + location.hash).slice(0, 200) });
    writeQ(q);
    schedule(1500);
  }

  // ---------- sending ----------
  let busy = false, timer = 0;
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(flush, ms); }
  async function flush() {
    if (busy || navigator.onLine === false) return;
    const batch = readQ().slice(0, 100);
    if (!batch.length) return;
    busy = true;
    let sent = false;
    try {
      const r = await fetch(EP, { method: 'POST', body: body(batch), keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } });
      // 400 and 413 mean the collector will never take this batch: drop it instead of retrying forever.
      sent = r.ok || r.status === 400 || r.status === 413;
    } catch { }
    if (sent) { const done = new Set(batch.map(e => e.eid)); writeQ(readQ().filter(e => !done.has(e.eid))); }
    busy = false;
    if (readQ().length) schedule(sent ? 500 : 30000);
  }
  // Leaving the page: hand the queue to the browser to deliver. It stays queued until a confirmed send.
  const beacon = () => { const q = readQ(); if (q.length && navigator.sendBeacon) { try { navigator.sendBeacon(EP, new Blob([body(q.slice(0, 100))], { type: 'text/plain' })); } catch { } } };
  addEventListener('online', () => schedule(500));

  // ---------- what is recorded ----------
  // Active time: visible time, cut off five minutes after the last touch, key or scroll so an idle open tab does not count.
  let shownAt = document.visibilityState === 'visible' ? Date.now() : 0, lastInput = Date.now();
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel']) addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  const settle = () => {
    if (!shownAt) return;
    const ms = Math.min(Date.now(), Math.max(lastInput, shownAt) + 300000) - shownAt;
    shownAt = 0;
    if (ms >= 1000) push('active', { ms: Math.min(ms, 4 * 3600000) });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { settle(); beacon(); } else { shownAt = lastInput = Date.now(); schedule(500); }
  });
  addEventListener('pagehide', () => { settle(); beacon(); });
  let lastHash = location.hash;
  addEventListener('hashchange', () => { if (location.hash !== lastHash) { lastHash = location.hash; push('view', {}); } });
  document.addEventListener('guides:track', e => {
    const d = e.detail;
    if (!d || typeof d.t !== 'string') return;
    const { t, ...rest } = d;
    push(t, rest);
  });
  push('open', { first: first || undefined, ref: document.referrer ? document.referrer.slice(0, 200) : undefined });

  // ---------- notice, once per browser ----------
  if (ls.get('guides.notice') !== '1') {
    const show = () => {
      const box = document.createElement('div'), p = document.createElement('p'), ok = document.createElement('button');
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', 'Usage notice');
      p.textContent = 'This site keeps a usage log: your IP address, device and browser, the pages you open and the answers you give, so its owner can see how the guides are used.';
      ok.type = 'button';
      ok.textContent = 'OK';
      // Colours come from the page so the notice matches it in light and dark: the site's token names first, then other
      // common names (--ink, --line-strong, --accent-ink), then the page's own computed text colour.
      const bs = getComputedStyle(document.body), ink = bs.color || '#15233A';
      Object.assign(box.style, {
        position: 'fixed', left: '12px', right: '12px', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', zIndex: '2147483000', maxWidth: '560px', margin: '0 auto',
        display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 14px 14px 18px', borderRadius: '14px', font: 'inherit', fontSize: '14px', lineHeight: '1.45',
        background: 'var(--surface, var(--bg, #fff))', color: `var(--text, var(--ink, ${ink}))`, border: '1px solid var(--border-strong, var(--line-strong, rgba(127,127,127,.4)))',
        boxShadow: 'var(--shadow-lg, 0 18px 40px -16px rgba(0,0,0,.45))',
      });
      Object.assign(p.style, { margin: '0', flex: '1' });
      Object.assign(ok.style, {
        flex: 'none', minHeight: '44px', minWidth: '64px', padding: '0 18px', border: '0', borderRadius: '10px', cursor: 'pointer', font: 'inherit', fontWeight: '600',
        background: 'var(--accent, #2F5FD0)', color: 'var(--on-accent, var(--accent-ink, #fff))',
      });
      ok.addEventListener('click', () => { ls.set('guides.notice', '1'); push('notice_ok', {}); box.remove(); });
      box.append(p, ok);
      document.body.append(box);
    };
    if (document.body) show(); else addEventListener('DOMContentLoaded', show);
  }
  schedule(1000);
})();
