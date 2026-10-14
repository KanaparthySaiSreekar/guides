/* scoring + answer recording. Multi-response is all-or-nothing (partial credit is unpublished). */
(function (G) {
  const CP = G.CP = G.CP || {};
  const SC = CP.score = {};

  SC.isCorrect = (it, sel) => {
    if (it.type === 'match') return (it.rows || []).length && (it.rows || []).every((r, i) => (sel || [])[i] === r.key) ? 1 : 0;
    const key = it.options.filter(o => o.correct).map(o => o.id).sort().join(',');
    return (sel || []).slice().sort().join(',') === key ? 1 : 0;
  };
  // mode codes: F = sealed form first attempt, M = adaptive/half mock, T = tutor/drill/guide/baseline,
  // R = repeat surfaces (review, redo, retake), O = official sample, X = bridge
  SC.WEIGHT = { F: 1, M: 0.8, T: 0.6, R: 0, O: 0, X: 0 };

  // Record one graded answer into S.items. Returns {ok, first}.
  SC.record = (S, it, sel, o) => {
    o = o || {};
    const ok = SC.isCorrect(it, sel);
    const now = o.at || Date.now();
    const r = S.items[it.id] || (S.items[it.id] = { rev: it.rev || 1, h: [] });
    if ((r.rev || 1) !== (it.rev || 1)) { r.archived = { rev: r.rev, first: r.first }; r.rev = it.rev || 1; delete r.first; r.h = []; }
    let mode = o.mode || 'T';
    if (it.set === 'official') mode = 'O';
    if (it.set === 'bridge' || it.set === 'community') mode = 'X';
    const first = !r.first;
    if (first) r.first = { ok, at: now, m: first && (mode === 'F' || mode === 'M' || mode === 'T') ? mode : 'R', conf: o.conf == null ? -1 : o.conf };
    const okv = ok ? (o.conf === 0 ? 0.5 : 1) : 0;
    r.h.push([now, okv, o.conf == null ? -1 : o.conf, o.ms || 0, first ? mode : 'R', (sel || []).join('')]);
    if (r.h.length > 10) r.h = r.h.slice(-10);
    if (CP.srs) CP.srs.update(S, r, ok, o.conf, now);
    return { ok, first };
  };
  SC.latest = r => r && r.h && r.h.length ? r.h[r.h.length - 1] : null;

  // Session result summary (used for forms, mocks and drills).
  SC.result = (sess, getItem) => {
    const out = { c: 0, t: 0, unanswered: 0, dom: {}, obj: {}, single: [0, 0], multi: [0, 0], flagged: [0, 0], traps: {}, changes: { rw: 0, wr: 0, other: 0 }, conf: { 0: [0, 0], 1: [0, 0], 2: [0, 0] }, times: [] };
    sess.qids.forEach((qid, idx) => {
      const it = getItem(qid); if (!it) return;
      const a = sess.ans[qid] || {};
      const sel = a.sel || [];
      const ok = sel.length ? SC.isCorrect(it, sel) : 0;
      out.t++; out.c += ok; if (!sel.length) out.unanswered++;
      const d = out.dom[it.domain] || (out.dom[it.domain] = [0, 0]); d[0] += ok; d[1]++;
      const ob = out.obj[it.obj] || (out.obj[it.obj] = [0, 0]); ob[0] += ok; ob[1]++;
      const k = it.type === 'multi' ? out.multi : out.single; k[0] += ok; k[1]++;
      if (a.flag) { out.flagged[0] += ok; out.flagged[1]++; }
      if (a.conf === 0 || a.conf === 1 || a.conf === 2) { out.conf[a.conf][0] += ok; out.conf[a.conf][1]++; }
      for (const opt of it.options) if (!opt.correct && opt.trap) {
        const t = out.traps[opt.trap] || (out.traps[opt.trap] = { exposed: 0, fell: 0 });
        t.exposed++; if (sel.includes(opt.id)) t.fell++;
      }
      if (a.chg && a.chg.length > 1) {
        const firstSel = a.chg[0], wasOk = SC.isCorrect(it, firstSel);
        if (wasOk && !ok) out.changes.rw++; else if (!wasOk && ok) out.changes.wr++; else out.changes.other++;
      }
      out.times.push({ qid, idx, ms: a.ms || 0 });
    });
    out.pct = out.t ? out.c / out.t : 0;
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
