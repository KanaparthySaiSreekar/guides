/* session: create / answer / navigate / submit for every practice mode. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const SS = CP.sess = {};
  const MIN = 60000;
  const U = () => CP.U, B = () => CP.bank, S = () => CP.store.S;
  // Usage events for the hosted copy's log (site/track.js); in the standalone file nothing listens.
  const emit = (t, d) => { try { document.dispatchEvent(new CustomEvent('guides:track', { detail: { ...d, t } })); } catch { } };

  const KIND = {
    form: { mode: 'exam', rec: 'F', label: F => 'Form ' + F },
    adaptive: { mode: 'exam', rec: 'M', label: () => 'Adaptive mock' },
    half: { mode: 'exam', rec: 'M', label: () => 'Half mock' },
    baseline: { mode: 'exam', rec: 'T', label: () => 'Baseline diagnostic' },
    pacing: { mode: 'exam', rec: 'R', label: () => 'Pacing drill' },
    official: { mode: 'tutor', rec: 'O', label: () => 'Official samples' },
    objective: { mode: 'tutor', rec: 'T', label: o => 'Objective ' + o },
    domain: { mode: 'tutor', rec: 'T', label: d => 'Domain ' + d + ' drill' },
    mix: { mode: 'tutor', rec: 'T', label: () => 'Weak-spot mix' },
    trap: { mode: 'tutor', rec: 'T', label: c => 'Trap drill ' + c },
    multi: { mode: 'tutor', rec: 'T', label: () => 'Multi-response clinic' },
    spaced: { mode: 'tutor', rec: 'R', label: () => 'Spaced review' },
    redo: { mode: 'tutor', rec: 'R', label: () => 'Missed-item redo' },
    bridge: { mode: 'tutor', rec: 'T', label: () => 'Foundations bridge drill' },
    community: { mode: 'tutor', rec: 'T', label: s => 'Community reference' + (s ? ' · ' + s : '') },
  };
  SS.KIND = KIND;

  SS.build = (kind, a) => {
    a = a || {};
    const X = CP.select, st = S();
    let items = [], extra = {};
    switch (kind) {
      case 'form': items = (B().forms[a.F] || []).map(B().get).filter(Boolean); break;
      case 'adaptive': case 'half': { const r = X.mock(st, kind); items = r.items; extra.fresh = r.fresh; break; }
      case 'baseline': items = X.baseline(); break;
      case 'pacing': items = X.pacing(st); break;
      case 'official': items = B().items.filter(it => it.set === 'official'); break;
      case 'objective': items = X.objective(st, a.obj, a.n || 6); break;
      case 'domain': items = X.domain(st, +a.d, a.n || 10); break;
      case 'mix': items = X.mix(st, a.n || 15); break;
      case 'trap': items = X.trap(st, a.code, 10); break;
      case 'multi': items = X.multi(st, 10); break;
      case 'spaced': items = X.spaced(st, 25); break;
      case 'redo': items = X.redo(st, 20); break;
      case 'community': items = CP.select.order(st, B().items.filter(it => it.set === 'community' && (!a.code || it.src.source === a.code) && (!a.d || it.domain === +a.d) && (a.all || !it.verdict || it.verdict.status !== 'wrong-key'))).slice(0, a.n || 15); items = U().shuffle(items); break;
      case 'bridge': items = U().shuffle(B().items.filter(it => it.set === 'bridge' && (!a.obj || it.obj === a.obj))).slice(0, a.n || 10); break;
    }
    return { items, extra };
  };

  SS.create = (kind, a) => {
    a = a || {};
    const st = S(), k = KIND[kind];
    const { items, extra } = SS.build(kind, a);
    if (!items.length) return null;
    const seed = U().randSeed();
    const retake = kind === 'form' && B().formSubmitted(st, a.F);
    const mult = st.settings.timeMult || 1;
    let limit = null;
    if (kind === 'form' || kind === 'adaptive') limit = 120 * MIN * mult;
    if (kind === 'half') limit = 60 * MIN * mult;
    if (kind === 'pacing') limit = 17.5 * MIN * mult;
    const now = Date.now();
    const s = {
      id: 's' + U().uid(), kind, label: k.label(a.F || a.obj || a.d || a.code || ''), mode: k.mode,
      rec: retake ? 'R' : k.rec, form: kind === 'form' ? a.F : null, retake: !!retake,
      qids: items.map(i => i.id), seed, perm: {}, cur: 0, startedAt: now, touched: now,
      limitMs: limit, deadline: limit ? now + limit : null, pausedAt: null, pausedMs: 0,
      strict: kind === 'form' ? !!st.settings.strict : false, state: 'open', ans: {}, meta: { ...a, ...extra },
      requeued: {},
    };
    if (st.settings.shuffle && kind !== 'official') for (const it of items) s.perm[it.id] = U().shuffle(it.options.map(o => o.id), seed + ':' + it.id);
    st.sessions.push(s);
    if (kind === 'form' && !retake) st.forms[a.F] = s.id;
    CP.store.save();
    emit('session_start', { kind, label: s.label, mode: s.mode, n: s.qids.length, form: s.form || undefined, retake: s.retake || undefined });
    return s;
  };
  SS.get = id => S().sessions.find(s => s.id === id) || null;
  SS.item = (s, i) => B().get(SS.realId(s.qids[i == null ? s.cur : i]));
  SS.perm = (s, it) => s.perm[it.id] || it.options.map(o => o.id);
  SS.ans = (s, qid) => s.ans[qid] || (s.ans[qid] = { sel: [], conf: -1, ms: 0, flag: false, chg: [] });

  let shownAt = 0, shownQ = null;
  SS.enter = s => { shownAt = Date.now(); shownQ = s.qids[s.cur]; };
  SS.leave = s => {
    if (!shownQ || !s || s.state !== 'open') return;
    const a = SS.ans(s, shownQ); a.ms += Math.min(Date.now() - shownAt, 20 * MIN); shownAt = Date.now();
    s.touched = Date.now();
  };

  SS.select = (s, qid, optId, it) => {
    const a = SS.ans(s, qid);
    if (a.graded) return { ok: false };
    let sel = a.sel.slice();
    if (it.type === 'match') { const [i, L] = String(optId).split(':'); while (sel.length < it.rows.length) sel.push(''); sel[+i] = L; a.sel = sel; CP.store.saveSoon(); return { ok: true }; }
    if (it.type === 'multi') {
      if (sel.includes(optId)) sel = sel.filter(x => x !== optId);
      else if (sel.length >= it.select) return { ok: false, blocked: true };
      else sel.push(optId);
    } else sel = [optId];
    a.sel = sel;
    if (s.mode === 'exam' && sel.length === it.select) { const last = a.chg[a.chg.length - 1]; if (!last || last.join() !== sel.slice().sort().join()) a.chg.push(sel.slice().sort()); }
    s.touched = Date.now();
    CP.store.saveSoon();
    return { ok: true };
  };

  // Tutor: grade immediately.
  SS.check = (s, qid) => {
    const it = B().get(SS.realId(qid)), a = SS.ans(s, qid);
    const filled = it.type === 'match' ? a.sel.filter(Boolean).length : a.sel.length;
    if (a.graded || filled !== it.select) return null;
    SS.leave(s);
    const r = CP.score.record(S(), it, a.sel, { mode: s.rec, conf: a.conf, ms: a.ms });
    a.graded = true; a.ok = r.ok;
    emit('answer', { item: it.id, ok: r.ok ? 1 : 0, ms: Math.round(a.ms), domain: it.domain, obj: it.obj, kind: s.kind });
    if (s.kind === 'spaced' && !r.ok && !s.requeued[qid] && !qid.endsWith('#re')) {
      s.requeued[qid] = 1;
      const pos = Math.min(s.qids.length, s.cur + 3 + Math.floor(Math.random() * 3));
      s.qids.splice(pos, 0, qid + '#re');
    }
    CP.store.save();
    return r;
  };

  SS.submit = s => {
    if (s.state !== 'open') return s;
    SS.leave(s);
    const now = Date.now();
    if (s.mode === 'exam') {
      for (const qid of s.qids) {
        const it = B().get(qid); if (!it) continue;
        const a = SS.ans(s, qid);
        CP.score.record(S(), it, a.sel, { mode: s.rec, conf: a.conf, ms: a.ms, at: now });
        a.graded = true; a.ok = CP.score.isCorrect(it, a.sel);
        if (a.sel.length) emit('answer', { item: it.id, ok: a.ok ? 1 : 0, ms: Math.round(a.ms), domain: it.domain, obj: it.obj, kind: s.kind, exam: 1 });
      }
    }
    s.state = 'submitted'; s.endedAt = now; s.pausedAt = null;
    const uniq = s.qids.filter(q => !q.endsWith('#re'));
    s.result = CP.score.result({ ...s, qids: uniq }, B().get);
    CP.store.save();
    emit('session_end', { kind: s.kind, label: s.label, mode: s.mode, c: s.result.c, total: s.result.t, unanswered: s.result.unanswered, ms: s.endedAt - s.startedAt - (s.pausedMs || 0), form: s.form || undefined });
    return s;
  };
  SS.abandon = s => { emit('session_abandon', { kind: s.kind, label: s.label }); S().sessions = S().sessions.filter(x => x !== s); if (s.form && S().forms[s.form] === s.id) S().forms[s.form] = null; CP.store.save(); };
  SS.realId = q => q.replace(/#re$/, '');
})(typeof window !== 'undefined' ? window : globalThis);
