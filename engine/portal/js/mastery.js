/* mastery: per-objective evidence (all graded answers, latest per item) with the self-rating as a weak prior. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const M = CP.mastery = {};
  const PRIOR = { R: [1, 3], Y: [2, 2], G: [3, 1] };
  const DAY = 86400000;

  M.obj = (S, objId, now) => {
    now = now || Date.now();
    const B = CP.bank;
    const rate = S.self[objId] && S.self[objId].r;
    const [a0, b0] = PRIOR[rate] || [2, 2];
    let sw = 0, sok = 0, n = 0, last = 0, sureWrong = 0;
    const days = new Set();
    for (const it of B.items) {
      if (it.obj !== objId || it.set === 'official') continue;
      const r = S.items[it.id]; if (!r || !r.h || !r.h.length) continue;
      const e = r.h[r.h.length - 1];
      const w = it.set === 'bridge' ? 0.5 : it.set === 'community' ? 0.3 : 1;
      sw += w; sok += w * e[1]; if (w >= 0.5) n++;
      last = Math.max(last, e[0]);
      for (const x of r.h) if (x[1] >= 1) days.add(CP.U.dayNum(x[0]));
      if (e[1] === 0 && e[2] === 2) sureWrong++;
    }
    const p = (a0 + sok) / (a0 + b0 + sw);
    const acc = sw ? sok / sw : null;
    let state = 'unseen';
    if (n > 0) {
      state = 'learning';
      if (n >= 4 && p >= 0.6) state = 'practised';
      if (n >= 4 && p >= 0.8 && days.size >= 2) state = 'mastered';
      if ((state === 'practised' || state === 'mastered') && now - last > 21 * DAY) state = 'rusty';
    }
    let calib = null;
    if (n < 2) calib = rate ? 'unmeasured' : null;
    else if (rate === 'G' && ((acc < 0.6 && n >= 3) || sureWrong)) calib = 'overconfident';
    else if (rate === 'R' && acc >= 0.8 && n >= 3) calib = 'underrated';
    return { id: objId, n, p, acc, state, last, rate: rate || null, calib, days: days.size };
  };
  M.all = (S, now) => { const out = {}; for (const o of CP.bank.objs) out[o.id] = M.obj(S, o.id, now); return out; };
  M.LABEL = { unseen: 'Unseen', learning: 'Learning', practised: 'Practised', mastered: 'Mastered', rusty: 'Rusty' };
  M.ICON = { unseen: '○', learning: '◔', practised: '◑', mastered: '●', rusty: '↻' };
})(typeof window !== 'undefined' ? window : globalThis);
