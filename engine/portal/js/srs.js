/* srs: Leitner boxes for items and cheat-sheet rules; intervals capped by the exam date. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const R = CP.srs = {};
  R.INTERVALS = [0, 1, 3, 7, 14, 30]; // days per box
  const DAY = 86400000;

  R.cap = (S, days, now) => {
    const ex = S.settings && S.settings.examDate;
    if (!ex) return days;
    const left = (new Date(ex + 'T09:00:00').getTime() - now) / DAY;
    if (left <= 0) return Math.min(days, 1);
    return Math.max(days ? 1 : 0, Math.min(days, Math.floor(left / 2)));
  };
  R.update = (S, rec, ok, conf, now) => {
    now = now || Date.now();
    let box = rec.box == null ? 0 : rec.box;
    if (!ok) box = 1;
    else if (conf === 0) box = Math.max(1, box); // a guess keeps its box
    else box = Math.min(5, box + (box === 0 ? 2 : 1));
    rec.box = box;
    rec.due = now + R.cap(S, R.INTERVALS[box], now) * DAY;
  };
  R.due = (S, now) => {
    now = now || Date.now();
    const out = [];
    for (const [q, r] of Object.entries(S.items)) if (r.due != null && r.due <= now) out.push({ qid: q, over: (now - r.due) / DAY, box: r.box });
    return out;
  };
  // cheat-sheet flashcards: grade 2 knew / 1 shaky / 0 missed
  R.gradeRule = (S, id, grade, now) => {
    now = now || Date.now();
    const r = S.rules[id] || (S.rules[id] = { box: 0, h: [] });
    r.box = grade === 2 ? Math.min(5, (r.box || 0) + 1) : grade === 1 ? Math.max(1, r.box || 1) : 1;
    r.due = now + R.cap(S, grade === 0 ? 0 : R.INTERVALS[r.box], now) * DAY + (grade === 0 ? 10 * 60000 : 0);
    r.h = (r.h || []).concat([[now, grade]]).slice(-8);
  };
  R.rulesDue = (S, ids, now) => {
    now = now || Date.now();
    return ids.filter(id => { const r = S.rules[id]; return !r || r.due == null || r.due <= now; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
