/* store: one localStorage key, in-memory fallback, export/import/merge, migrations. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const KEY = 'ccarp_portal_v1';
  const SCHEMA = 1;

  function blank() {
    const now = Date.now();
    return {
      schema: SCHEMA, bank: null, created: now, updated: now,
      settings: {
        theme: 'system', serif: true, textScale: 100, examDate: null, minutesPerDay: 45, plan: '3w',
        strict: true, showTimer: true, timeMult: 1, confidence: true, shuffle: true, strike: true, showScaled: false,
        dismissed: {}, lastExport: null,
      },
      self: {},      // obj -> {r:'R'|'Y'|'G', at, hist:[[r,ts]]}
      guide: {},     // obj -> {read:ts}
      path: {},      // stage id -> ts (manual ticks)
      items: {},     // qid -> {rev, first:{ok,at,m,w}, h:[[ts,ok,conf,ms,mode,sel]], box, due, star}
      rules: {},     // rule id -> {box, due, h:[[ts,grade]]}
      forms: { A: null, B: null, C: null, cUnsealed: false },
      sessions: [],
      notes: {},
      tipsSeen: {},
    };
  }

  const MIGRATE = [
    // index n migrates schema n -> n+1 (none yet)
  ];
  function migrate(s) {
    const b = blank();
    s = Object.assign(b, s || {});
    s.settings = Object.assign(blank().settings, s.settings || {});
    s.forms = Object.assign(blank().forms, s.forms || {});
    while ((s.schema || 1) < SCHEMA) { const f = MIGRATE[s.schema - 1]; if (f) s = f(s); s.schema = (s.schema || 1) + 1; }
    return s;
  }

  const store = CP.store = { KEY, SCHEMA, blank, migrate, ok: false, S: blank(), listeners: [] };

  function ls() { try { return G.localStorage; } catch (e) { return null; } }
  store.probe = () => {
    const l = ls(); if (!l) return false;
    try { const k = KEY + '__probe'; l.setItem(k, '1'); const v = l.getItem(k); l.removeItem(k); return v === '1'; } catch (e) { return false; }
  };
  store.load = () => {
    store.ok = store.probe();
    let raw = null;
    if (store.ok) { try { raw = ls().getItem(KEY); } catch (e) { raw = null; } }
    try { store.S = migrate(raw ? JSON.parse(raw) : null); } catch (e) { store.S = blank(); }
    return store.S;
  };
  let timer = null;
  store.save = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    store.S.updated = Date.now();
    compact(store.S);
    if (!store.ok) return false;
    try { ls().setItem(KEY, JSON.stringify(store.S)); return true; }
    catch (e) { store.ok = false; store.listeners.forEach(f => { try { f('fail'); } catch (x) { } }); return false; }
  };
  store.saveSoon = () => { if (timer) clearTimeout(timer); timer = setTimeout(store.save, 300); };
  store.size = () => { try { return JSON.stringify(store.S).length; } catch (e) { return 0; } };

  function compact(s) {
    for (const k in s.items) { const r = s.items[k]; if (r.h && r.h.length > 10) r.h = r.h.slice(-10); }
    if (s.sessions.length > 80) {
      const keep = new Set(Object.values(s.forms).filter(x => typeof x === 'string'));
      const cut = s.sessions.length - 80;
      let removed = 0;
      s.sessions = s.sessions.filter(x => { if (removed < cut && x.state !== 'open' && !keep.has(x.id)) { removed++; return false; } return true; });
    }
  }

  // ---------- export / import ----------
  store.exportObj = () => ({ app: 'ccarp-portal', schema: SCHEMA, bank: store.S.bank, exportedAt: new Date().toISOString(), state: store.S });
  store.parseImport = text => {
    let o; try { o = JSON.parse(text); } catch (e) { throw new Error('That is not valid JSON.'); }
    if (!o || o.app !== 'ccarp-portal' || !o.state) throw new Error('This file is not a CCAR-P portal export.');
    if ((o.schema || 1) > SCHEMA) throw new Error('This export comes from a newer version of the portal.');
    const st = migrate(o.state);
    const n = Object.keys(st.items).length, sess = st.sessions.length;
    return { state: st, summary: `${n} answered items, ${sess} sessions, exported ${o.exportedAt ? o.exportedAt.slice(0, 10) : 'unknown date'}` };
  };
  store.merge = (a, b) => {
    const out = JSON.parse(JSON.stringify(a));
    for (const [q, rb] of Object.entries(b.items || {})) {
      const ra = out.items[q];
      if (!ra) { out.items[q] = rb; continue; }
      const seen = new Set(), h = [];
      for (const e of [...(ra.h || []), ...(rb.h || [])].sort((x, y) => x[0] - y[0])) { const k = e[0] + '|' + e[4]; if (!seen.has(k)) { seen.add(k); h.push(e); } }
      ra.h = h.slice(-10);
      if (rb.first && (!ra.first || rb.first.at < ra.first.at)) ra.first = rb.first;
      if ((rb.box || 0) > (ra.box || 0)) { ra.box = rb.box; ra.due = rb.due; }
      ra.star = ra.star || rb.star;
    }
    for (const [k, v] of Object.entries(b.rules || {})) { const x = out.rules[k]; if (!x || (v.box || 0) > (x.box || 0)) out.rules[k] = v; }
    for (const [k, v] of Object.entries(b.self || {})) { const x = out.self[k]; if (!x || (v.at || 0) > (x.at || 0)) out.self[k] = v; }
    for (const [k, v] of Object.entries(b.guide || {})) { if (!out.guide[k]) out.guide[k] = v; }
    for (const [k, v] of Object.entries(b.path || {})) { if (!out.path[k]) out.path[k] = v; }
    for (const [k, v] of Object.entries(b.notes || {})) { if (!out.notes[k]) out.notes[k] = v; }
    const ids = new Set(out.sessions.map(s => s.id));
    for (const s of b.sessions || []) if (!ids.has(s.id)) out.sessions.push(s);
    out.sessions.sort((x, y) => (x.startedAt || 0) - (y.startedAt || 0));
    for (const F of ['A', 'B', 'C']) if (!out.forms[F] && b.forms && b.forms[F]) out.forms[F] = b.forms[F];
    out.forms.cUnsealed = out.forms.cUnsealed || !!(b.forms && b.forms.cUnsealed);
    return out;
  };
  store.replace = st => { store.S = migrate(st); store.save(); };
  store.reset = kind => {
    const S = store.S;
    if (kind === 'all') store.S = blank();
    else if (kind === 'attempts') { S.items = {}; S.sessions = []; S.forms = blank().forms; S.guide = {}; S.rules = {}; }
    else if (kind === 'srs') { for (const r of Object.values(S.items)) { delete r.box; delete r.due; } S.rules = {}; }
    store.save();
  };
})(typeof window !== 'undefined' ? window : globalThis);
