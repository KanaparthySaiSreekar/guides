/* nba: the single next-best action, with a reason built from the learner's numbers. DOM-free.
   An action is {id, label, why, act, args} where act names a CP.act handler (or a route). */
(function (G) {
  const CP = G.CP = G.CP || {};
  const N = CP.nba = {};
  const DAY = 86400000;

  N.daysLeft = (S, now) => (CP.plan ? CP.plan.daysLeft(S, now) : null);
  N.trapStats = S => {
    const B = CP.bank, out = {};
    for (const it of B.items) {
      const r = S.items[it.id]; if (!r || !r.first || it.set === 'official') continue;
      const e = r.h && r.h.find(x => x[4] !== 'R') || (r.h && r.h[0]); if (!e) continue;
      const sel = String(e[5] || '').split('');
      for (const o of it.options) if (!o.correct && o.trap) {
        const t = out[o.trap] || (out[o.trap] = { code: o.trap, exposed: 0, fell: 0 });
        t.exposed++; if (sel.includes(o.id)) t.fell++;
      }
    }
    for (const t of Object.values(out)) t.rate = (t.fell + 1) / (t.exposed + 6);
    return out;
  };
  N.topTraps = (S, k) => Object.values(N.trapStats(S)).filter(t => t.exposed >= 5).sort((a, b) => b.rate - a.rate).slice(0, k || 3);

  N.compute = (S, now) => {
    now = now || Date.now();
    const B = CP.bank, M = CP.mastery, X = CP.select;
    const acts = [];
    const push = (id, label, why, act, args) => acts.push({ id, label, why, act, args: args || {} });
    const dl = N.daysLeft(S, now);
    const open = S.sessions.filter(s => s.state === 'open').sort((a, b) => (b.touched || b.startedAt) - (a.touched || a.startedAt))[0];
    if (open) {
      const left = open.deadline ? CP.U.fmtClock(Math.max(0, open.deadline - (open.pausedAt || now))) + ' left' : `${Object.keys(open.ans).length} of ${open.qids.length} answered`;
      push('resume', 'Resume ' + open.label, 'You have an unfinished session (' + left + ').', 'go', { route: '#/s/' + open.id });
    }
    const plan = CP.plan && S.settings.examDate ? CP.plan.anchors(S, now) : null;
    const inTaper = plan && plan.regime !== 'past' && plan.D >= 0 && 0 >= plan.taperStart;
    const dueForm = plan && !inTaper ? plan.forms.find(f => !f.done && f.off <= 0) : null;
    if (!S.path.s0 && !S.settings.examDate) push('orient', 'Start here: exam facts and your date', 'Two minutes on what CCAR-P actually tests (7 domains, not the 27% Foundations split) and when you sit it. The plan adapts to your date.', 'go', { route: '#/path' });
    if (inTaper) push('taper', plan.D === 0 ? 'Exam day: pacing card, then stop' : 'Taper: cheat sheet in night-before mode', plan.D === 0 ? 'Read the pacing card and the 8 laws, check your ID and OnVUE setup, then rest.' : `${plan.D} day${plan.D === 1 ? '' : 's'} to go. Nothing new now: review the rules, clear due cards and run one pacing drill. No sealed form after T-2.`, 'go', { route: '#/cheat?night=1' });
    if (dueForm) push('form' + dueForm.F, `Form ${dueForm.F} is on your plan for today`, `${plan.D} day${plan.D === 1 ? '' : 's'} to your exam. Sitting Form ${dueForm.F} now leaves time to fix what it shows${dueForm.F === 'C' ? ' before the T-2 cut-off' : ''}. 63 items, 120 minutes.`, 'form', { F: dueForm.F });
    const rated = Object.keys(S.self).length;
    const baseline = S.sessions.find(s => s.kind === 'baseline' && s.state === 'submitted');
    const official = S.sessions.find(s => s.kind === 'official' && s.state === 'submitted');
    if (!(!S.path.s0 && !S.settings.examDate) && rated < 30) push('rate', 'Rate yourself on the 38 objectives', `${rated} of 38 rated. Ratings seed your study order until real answers take over.`, 'go', { route: '#/blueprint' });
    else if (!official) push('official', 'Walk through the 3 official sample questions', 'These are the only official CCAR-P items. They show the item style and the three core moves: remove, restructure, diagnose the layer.', 'start', { kind: 'official' });
    else if (!baseline && (!plan || plan.D >= 7)) push('baseline', 'Take the 21-item baseline', 'Three items per domain measure where you start, and point out where your self-ratings are off.', 'start', { kind: 'baseline' });

    const unviewed = S.sessions.find(s => s.kind === 'form' && s.state === 'submitted' && !s.viewed);
    if (unviewed) push('review', 'Read your Form ' + unviewed.form + ' report', 'The report turns misses into a remediation list. Read it before the next session.', 'go', { route: '#/r/' + unviewed.id });
    const due = CP.srs.due(S, now);
    if (due.length >= 20 || due.some(d => d.over >= 3)) push('spaced', `Spaced review (${Math.min(25, due.length)} due)`, 'Reviews that slip lose most of their value. These are the items you are about to forget.', 'start', { kind: 'spaced' });
    const trap = N.topTraps(S, 1)[0];
    const lastTrap = S.sessions.filter(s => s.kind === 'trap').map(s => s.startedAt).sort().pop() || 0;
    if (trap && trap.rate >= 0.40 && now - lastTrap > 4 * DAY) {
      const t = B.traps.get(trap.code);
      push('trap', 'Trap drill: ' + (t ? t.name : trap.code), `You chose ${trap.code} in ${trap.fell} of ${trap.exposed} items where it was offered. Ten items train you to spot it.`, 'start', { kind: 'trap', code: trap.code });
    }
    const all = M.all(S, now);
    const practised = Object.values(all).filter(m => m.state === 'practised' || m.state === 'mastered').length;
    const aState = B.formState(S, 'A'), bState = B.formState(S, 'B');
    if (!inTaper && aState === 'ready' && practised >= 0.7 * B.objs.length && (dl == null || dl >= 10)) push('formA', 'Take Form A (sealed, 63 items, 120 min)', `${practised} of 38 objectives are Practised. The first sealed form is your first honest measurement.`, 'form', { F: 'A' });
    else if (aState === 'done' && bState === 'ready') {
      const a = B.formSession(S, 'A');
      if (!inTaper && !plan && a && now - (a.endedAt || a.startedAt) >= 3 * DAY) push('formB', 'Take Form B', 'At least three days after Form A, with remediation in between, Form B shows whether the fixes held.', 'form', { F: 'B' });
    }
    const pri = X.priority(S, now);
    const top = pri[0];
    if (top) {
      const o = B.objById.get(top.obj), m = top.m;
      const why = `D${o.domain} is ${Math.round(B.W[o.domain] * 100)}% of the exam; ${o.id} is at ${m.acc == null ? 'no evidence yet' : Math.round(m.acc * 100) + '% over ' + m.n + ' items'}${m.calib === 'overconfident' ? ', and you rated it Green' : ''}.`;
      const read = S.guide[o.id] && S.guide[o.id].read;
      if (!read) push('study', `Study ${o.id}: ${o.short}`, why, 'go', { route: '#/guide/d' + o.domain + '/' + o.id });
      else if (m.n < 4) push('prove', `Prove it: ${o.id} ${o.short}`, why + ' Four graded items make it Practised.', 'start', { kind: 'objective', obj: o.id });
      else if (m.p < 0.6) push('remediate', `Remediate ${o.id}: reread the cue rows, then 5 items`, why, 'go', { route: '#/guide/d' + o.domain + '/' + o.id });
      else push('prove2', `Drill ${o.id}: ${o.short}`, why, 'start', { kind: 'objective', obj: o.id });
    }
    push('mix', 'Weak-spot mix (15 items)', 'An interleaved set weighted toward your weakest objectives.', 'start', { kind: 'mix', n: 15 });
    const seen = new Set(); const uniq = acts.filter(a => !seen.has(a.id) && seen.add(a.id));
    const dismissed = S.settings.dismissed || {};
    const today = CP.U.isoDay(now);
    const live = uniq.filter(a => dismissed['nba:' + a.id] !== today);
    return { primary: live[0] || uniq[0], alts: live.slice(1, 4), all: uniq };
  };

  // Today's plan sized to the minutes budget.
  N.plan = (S, now) => {
    const mins = S.settings.minutesPerDay || 45, out = [];
    const due = CP.srs.due(S, now).length;
    let used = 0;
    if (due) { const m = Math.min(Math.round(mins * 0.4), Math.ceil(Math.min(due, 25) * 1.6)); out.push({ label: `Spaced review: ${Math.min(due, 25)} due`, mins: m, act: 'start', args: { kind: 'spaced' } }); used += m; }
    const pri = CP.select.priority(S, now);
    for (const p of pri) {
      if (used >= mins) break;
      const o = CP.bank.objById.get(p.obj);
      const read = S.guide[o.id] && S.guide[o.id].read;
      const m = read ? 10 : 18;
      out.push(read ? { label: `Prove it: ${o.id} ${o.short}`, mins: m, act: 'start', args: { kind: 'objective', obj: o.id } }
        : { label: `Study ${o.id}: ${o.short}`, mins: m, act: 'go', args: { route: '#/guide/d' + o.domain + '/' + o.id } });
      used += m;
    }
    return { mins, used, items: out };
  };
})(typeof window !== 'undefined' ? window : globalThis);
