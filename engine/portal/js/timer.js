/* timer: stored-deadline countdown and pacing checkpoints (survive reloads and sleep). DOM-free. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const T = CP.timer = {};
  const MIN = 60000;

  T.remaining = (s, now) => {
    if (!s.deadline) return null;
    const t = s.pausedAt || now || Date.now();
    return Math.max(0, s.deadline - t);
  };
  T.elapsed = (s, now) => s.limitMs ? s.limitMs - T.remaining(s, now) : ((now || Date.now()) - s.startedAt - (s.pausedMs || 0));
  // Checkpoints for a full 63-item form at a 1:45 first-pass pace: 17 by 30:00, 34 by 60:00, 51 by 90:00, first pass by 110:00.
  T.checkpoints = s => {
    const mult = s.limitMs ? s.limitMs / (s.qids.length === 63 ? 120 * MIN : s.qids.length * 1.9 * MIN) : 1;
    if (s.qids.length === 63) return [[17, 30], [34, 60], [51, 90], [63, 110]].map(([n, m]) => ({ n, at: m * MIN * mult }));
    const per = (s.limitMs || s.qids.length * 1.9 * MIN) / s.qids.length;
    const pts = [];
    for (let k = 1; k <= 3; k++) { const n = Math.round(s.qids.length * k / 4); pts.push({ n, at: n * per }); }
    pts.push({ n: s.qids.length, at: s.limitMs * 0.92 });
    return pts;
  };
  T.pace = (s, now) => {
    if (!s.limitMs) return null;
    const el = T.elapsed(s, now);
    const done = Object.values(s.ans).filter(a => a.sel && a.sel.length).length;
    const target = s.limitMs * 0.92 / s.qids.length; // leave ~8% for flags
    const expected = el / target;
    const diff = done - expected;
    const missed = T.checkpoints(s).filter(c => el > c.at && done < c.n);
    return { done, expected, status: diff >= 1 ? 'ahead' : diff <= -2 ? 'behind' : 'on', missed, perItem: target };
  };
  T.pause = (s, now) => { if (!s.pausedAt && s.deadline) s.pausedAt = now || Date.now(); };
  T.resume = (s, now) => {
    if (s.pausedAt) { const d = (now || Date.now()) - s.pausedAt; s.deadline += d; s.pausedMs = (s.pausedMs || 0) + d; s.pausedAt = null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
