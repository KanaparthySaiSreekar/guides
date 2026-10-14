/* plan: date anchors for the sealed forms and the taper, always counted from TODAY to the exam.
   Guarantees: A before B before C; no sealed form after T-2; nothing scheduled in the past or after the exam;
   forms already sat are reported as done; a compressed day-by-day plan when the chosen schedule no longer fits. DOM-free. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const P = CP.plan = {};
  const DAY = 86400000;
  P.PLAN_DAYS = { '2w': 14, '3w': 21, '6w': 42 };

  const day0 = ts => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  P.examDay = S => {
    const ex = S.settings && S.settings.examDate; if (!ex) return null;
    const [y, m, d] = String(ex).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).getTime();
  };
  P.daysLeft = (S, now) => { const e = P.examDay(S); if (e == null) return null; return Math.round((e - day0(now || Date.now())) / DAY); };
  P.dateAt = (now, off) => { const t = new Date(day0(now)); t.setDate(t.getDate() + off); return t.getTime(); };

  // Ideal positions (day offsets from today) for the pending forms, then enforce ordering and bounds.
  P.anchors = (S, now) => {
    now = now || Date.now();
    const D = P.daysLeft(S, now);
    if (D == null) return null;
    const B = CP.bank;
    const state = F => (B && B.formState ? B.formState(S, F) : 'ready');
    const doneAt = F => { const s = B && B.formSession ? B.formSession(S, F) : null; return s && s.state === 'submitted' ? (s.endedAt || s.startedAt) : null; };
    const forms = ['A', 'B', 'C'].map(F => ({ F, done: state(F) === 'done', at: doneAt(F) }));
    const pending = forms.filter(f => !f.done).map(f => f.F);
    const lastDoneOff = Math.max(-Infinity, ...forms.filter(f => f.done && f.at).map(f => Math.round((day0(f.at) - day0(now)) / DAY)));

    let regime, taperStart, lastForm, gap;
    if (D < 0) regime = 'past';
    else if (D >= 14) { regime = 'long'; taperStart = D - 2; lastForm = D - 3; gap = 3; }
    else if (D >= 7) { regime = 'mid'; taperStart = D - 1; lastForm = D - 2; gap = 2; }
    else { regime = 'short'; taperStart = Math.max(0, D - 1); lastForm = D - 2; gap = 1; }

    const out = { D, regime, taperStart, lastForm, forms: [], dropped: [], notes: [] };
    for (const f of forms.filter(x => x.done)) out.forms.push({ F: f.F, done: true, date: f.at, off: Math.round((day0(f.at) - day0(now)) / DAY) });
    if (regime === 'past') { out.notes.push('Your exam date has passed. Update it to plan again.'); return out; }

    let start = Math.max(0, isFinite(lastDoneOff) ? lastDoneOff + gap : 0);
    let pos;
    if (regime === 'long') {
      const ideal = { A: Math.round(0.55 * D), B: Math.round(0.75 * D), C: D - 5 };
      pos = pending.map(F => ideal[F]);
    } else if (regime === 'mid') {
      const a = Math.round(0.4 * D);
      pos = pending.map((F, i) => a + i * gap);
    } else {
      pos = pending.map((F, i) => i * gap);
    }
    // enforce: >= start, increasing by >= gap, <= lastForm; relax the gap, then drop trailing forms if needed.
    const fit = (p, g) => {
      p = p.slice();
      for (let i = 0; i < p.length; i++) p[i] = Math.max(p[i], start, i ? p[i - 1] + g : start);
      if (p.length && p[p.length - 1] > lastForm) {
        p[p.length - 1] = lastForm;
        for (let i = p.length - 2; i >= 0; i--) p[i] = Math.min(p[i], p[i + 1] - g);
      }
      return p.length && p[0] < start ? null : p;
    };
    let names = pending.slice(), placed = null;
    while (names.length && !placed) {
      const base = pos.slice(0, names.length);
      for (let g = gap; g >= 1 && !placed; g--) { placed = fit(base, g); if (placed && g < gap) out.notes.push(`Tight timeline: forms are ${g} day${g > 1 ? 's' : ''} apart instead of ${gap}.`); }
      if (!placed) { out.dropped.unshift(names.pop()); pos = pos.slice(0, names.length); }
    }
    (placed || []).forEach((off, i) => out.forms.push({ F: names[i], done: false, off, date: P.dateAt(now, off) }));
    out.forms.sort((a, b) => a.off - b.off);
    if (out.dropped.length) out.notes.push(`Not enough days for Form${out.dropped.length > 1 ? 's' : ''} ${out.dropped.join(' and ')} before the T-2 cut-off. Use the half mock or cheat-sheet review instead.`);
    out.taper = { off: taperStart, date: P.dateAt(now, taperStart) };
    out.exam = { off: D, date: P.dateAt(now, D) };
    return out;
  };

  // Does the chosen schedule fit in the days left? If not, build a day-by-day compressed plan.
  P.dayPlan = (S, now) => {
    now = now || Date.now();
    const a = P.anchors(S, now); if (!a || a.regime === 'past') return null;
    const want = P.PLAN_DAYS[S.settings.plan] || 21;
    const fits = a.D >= want;
    const byOff = {}; for (const f of a.forms) if (!f.done && f.off >= 0) byOff[f.off] = f.F;
    const days = [];
    for (let off = 0; off <= a.D; off++) {
      let what;
      if (off === a.D) what = 'Exam day. Read the pacing card, check ID and your OnVUE setup, then stop studying.';
      else if (byOff[off]) what = `Form ${byOff[off]} under exam conditions (120 min), then read its report and drill the top 3 weak objectives it shows.`;
      else if (off >= a.taperStart) what = 'Taper: cheat sheet in night-before mode, due flashcards and spaced reviews, one pacing drill. No new material and no sealed form.';
      else if (off === 0) what = 'Study the top-priority guide sections shown on Today (weight × gap order: D3, D1, D4 first), then a weak-spot mix.';
      else what = 'Remediate the weakest objectives from your latest form or mix, then clear due reviews and one trap drill.';
      days.push({ off, date: P.dateAt(now, off), what });
    }
    return { fits, want, D: a.D, days, anchors: a };
  };
})(typeof window !== 'undefined' ? window : globalThis);
