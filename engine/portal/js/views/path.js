/* path: the 10-stage guided route with auto-checked exits, date-anchored schedule, courses, reading, build project. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc, inl = U.inl;
  const V = CP.views.path = {};
  V.title = () => 'Learning path';
  V.wide = true;
  const DAY = 86400000;

  // Auto-detected completion for stages whose exit is measurable.
  function auto(S, id) {
    const B = CP.bank, M = CP.mastery.all(S);
    const practised = Object.values(M).filter(m => m.state === 'practised' || m.state === 'mastered').length;
    const sub = k => S.sessions.some(s => s.kind === k && s.state === 'submitted');
    switch (id) {
      case 's0': return !!S.settings.examDate || !!S.path.s0;
      case 's1': return Object.keys(S.self).length >= 38 && sub('baseline');
      case 's3': return practised >= B.objs.length;
      case 's6': return B.formState(S, 'A') === 'done';
      case 's7': return B.formState(S, 'B') === 'done';
      case 's8': return B.formState(S, 'C') === 'done';
      default: return !!S.path[id];
    }
  }


  V.render = () => {
    const S = CP.store.S, D = CP.bank.D, P = D.path || { stages: [], schedules: [] };
    const cs = D.caseStudy || {};
    const now = Date.now();
    const an = S.settings.examDate ? CP.plan.anchors(S, now) : null;
    const dp = S.settings.examDate ? CP.plan.dayPlan(S, now) : null;
    const when = off => off === 0 ? 'today' : off === 1 ? 'tomorrow' : `in ${off} days`;
    const sched = P.schedules.find(s => s.id.endsWith(S.settings.plan)) || P.schedules[1] || P.schedules[0];
    const next = P.stages.findIndex(s => !auto(S, s.id));
    const stages = P.stages.map((s, i) => {
      const done = auto(S, s.id);
      const measurable = ['s0', 's1', 's3', 's6', 's7', 's8'].includes(s.id);
      return `<li class="card stage${done ? ' done' : ''}${i === next ? ' next' : ''}" style="margin-bottom:12px"><span class="node" aria-hidden="true">${done ? '\u2713' : i}</span><div class="spread"><h3 style="font-size:var(--fs-ui)">${inl(s.title)}</h3>
        <span class="row"><span class="cap faint">${esc(/min|h/.test(s.minutes) ? s.minutes : s.minutes + ' min')}</span>${done ? '<span class="chip good">✓ Done</span>' : ''}</span></div>
        <p class="small muted" style="margin-top:6px">${inl(s.why)}</p>
        <ul style="margin-top:6px">${s.do.map(x => `<li class="small">${inl(x)}</li>`).join('')}</ul>
        <p class="small" style="margin-top:6px"><b>Exit:</b> ${inl(s.exit)}</p>
        ${measurable && s.id !== 's0' ? '<p class="cap faint" style="margin-top:4px">Checked automatically from your progress.</p>' : `<div class="btnrow" style="margin-top:8px"><button class="btn sm${!done && i === next ? ' primary' : ''}" data-act="stage" data-id="${esc(s.id)}">${done ? 'Mark not done' : 'Mark done'}</button></div>`}</li>`;
    }).join('');
    const bp = (cs.build_project || []).map((b, i) => `<li><label class="toggle" style="align-items:flex-start"><input type="checkbox" data-act="bpt" data-i="${i}" ${S.path['bp' + i] ? 'checked' : ''}><span><b>${inl(b.artefact)}</b> <span class="cap faint">${esc(b.domains)}</span><br><span class="small muted">Done when: ${inl(b.done_when)}</span></span></label></li>`).join('');
    return `<div class="pagehead"><h1>Learning path</h1><p>Ten stages from orientation to exam day. Gates are recommendations, never locks, except that Form C stays sealed until you choose to sit it.</p></div>
      <section class="card"><h2 style="font-size:var(--fs-h3)">Your schedule</h2>
        <div class="grid3" style="margin-top:10px">
          <div class="field"><label for="ex-date">Exam date</label><input class="input" type="date" id="ex-date" value="${esc(S.settings.examDate || '')}" data-act="setdate"><span class="help">Spacing intervals are capped so no review lands after the exam.</span></div>
          <div class="field"><label for="ex-min">Minutes per day</label><input class="input" type="number" min="10" max="240" step="5" id="ex-min" value="${S.settings.minutesPerDay}" data-act="setmin"></div>
          <div class="field"><span class="lbl-strong">Plan</span><div class="seg">${P.schedules.map(s => `<button type="button" data-act="setplan" data-id="${esc(s.id.split('-').pop())}" aria-pressed="${sched && s.id === sched.id}" title="${esc(s.name)}">${esc(s.id.split('-').pop().replace('w', ' weeks'))}</button>`).join('')}</div></div>
        </div>
        ${an && an.regime === 'past' ? `<p class="small" style="margin-top:12px">${esc(an.notes[0])}</p>` : an ? `<div class="tblwrap" style="margin-top:14px"><table class="tbl"><tbody>
          ${an.forms.map(f => `<tr><td>Form ${f.F}${f.F === 'C' ? ', dress rehearsal' : ''}</td><td class="r">${f.done ? `<span class="chip good">✓ sat ${esc(U.fmtDate(f.date))}</span>` : `${esc(U.fmtDate(f.date))} <span class="faint">(${when(f.off)})</span>`}</td></tr>`).join('')}
          ${an.dropped.map(F => `<tr><td>Form ${F}</td><td class="r"><span class="faint">no room before T-2</span></td></tr>`).join('')}
          <tr><td>Taper begins (no new material, no sealed form)</td><td class="r">${esc(U.fmtDate(an.taper.date))} <span class="faint">(${when(an.taper.off)})</span></td></tr>
          <tr><td><b>Exam</b></td><td class="r"><b>${esc(U.fmtDate(an.exam.date))}</b> <span class="faint">(${when(an.D)})</span></td></tr></tbody></table></div>
          ${an.notes.length ? `<p class="cap faint" style="margin-top:6px">${an.notes.map(esc).join(' ')}</p>` : ''}
          <p class="cap faint" style="margin-top:6px">Counted from today. Forms run A, B, C in order; none is scheduled after T-2 or after the exam.</p>` : '<p class="small muted" style="margin-top:10px">Set an exam date to get dated anchors counted from today.</p>'}
        ${dp && !dp.fits ? `<div class="callout warnc" style="margin-top:14px"><div class="ct">Your exam is ${dp.D === 0 ? 'today' : 'in ' + dp.D + ' day' + (dp.D === 1 ? '' : 's')}</div><p class="small">The ${esc(sched ? sched.name : 'chosen plan')} needs about ${dp.want} days, so here is a compressed plan for the days you have. It follows the same rules: forms in order, sealed forms done by T-2, then a taper.</p>
          <ol style="margin-top:8px">${dp.days.map(d => `<li class="small"><b>${esc(U.fmtDate(d.date))}</b> (${when(d.off)}): ${inl(d.what)}</li>`).join('')}</ol></div>
          ${sched ? `<details class="acc" style="margin-top:10px"><summary>Full ${esc(sched.name)} for reference</summary><div class="body"><ol>${sched.plan.map(x => `<li class="small">${inl(x)}</li>`).join('')}</ol></div></details>` : ''}`
        : sched ? `<details class="acc" style="margin-top:14px" open><summary>${esc(sched.name)} · ${esc(sched.perDay)} · ${esc(sched.who)}</summary><div class="body"><ol>${sched.plan.map(x => `<li class="small">${inl(x)}</li>`).join('')}</ol></div></details>` : ''}
      </section>
      <div class="section-title"><h2>The ten stages</h2><span class="aside">${P.stages.filter(s => auto(S, s.id)).length}/${P.stages.length} done</span></div>
      <ol class="stages">${stages}</ol>
      <div class="grid2">
        <section class="card"><h2 style="font-size:var(--fs-h3)">Official prep courses</h2>
          ${(P.prep || []).length ? `<ol style="margin-top:8px">${P.prep.map(c => `<li class="small"><b>${esc(c.title)}</b>${c.minutes ? ` · ${c.minutes} min` : ''} <span class="faint">${esc(c.domains)}</span></li>`).join('')}</ol>` : ''}
          ${(P.prereq || []).length ? `<p class="small" style="margin-top:10px"><b>Prerequisite refreshers:</b> ${P.prereq.map(esc).join(' · ')}</p>` : ''}
          <p class="cap faint" style="margin-top:8px">Anthropic Partner Academy (Skilljar). Course content is behind partner login.</p></section>
        <section class="card"><h2 style="font-size:var(--fs-h3)">Primary reading</h2>
          <ul style="margin-top:8px">${(P.reading || []).map(r => `<li class="small"><b>${esc(r.title)}</b>${r.domains ? ` <span class="faint">${r.domains.map(d => 'D' + d).join(' ')}</span>` : ''}<br><span class="muted">${inl(r.why)}</span><br><span class="mono cap" style="overflow-wrap:anywhere">${esc(r.url)}</span></li>`).join('')}</ul>
          <p class="cap faint">Addresses are shown as text so this file stays fully offline. Copy them into your browser.</p></section>
      </div>
      ${bp ? `<div class="section-title"><h2>Build project (optional)</h2><span class="aside">The official guide's advice: build and operate one end-to-end solution</span></div><div class="card"><ul style="list-style:none;padding:0" class="stack">${bp}</ul></div>` : ''}`;
  };
  CP.act.stage = el => { const S = CP.store.S, id = el.dataset.id; if (S.path[id]) delete S.path[id]; else S.path[id] = Date.now(); if (id === 's0' && !S.path.startAt) S.path.startAt = Date.now(); CP.store.save(); CP.router.refresh(); };
  CP.act.bpt = el => { const S = CP.store.S, k = 'bp' + el.dataset.i; if (el.checked) S.path[k] = Date.now(); else delete S.path[k]; CP.store.save(); };
  CP.act.setdate = el => { const S = CP.store.S; S.settings.examDate = el.value || null; if (!S.path.startAt) S.path.startAt = Date.now(); CP.store.save(); CP.router.refresh(); };
  CP.act.setmin = el => { const S = CP.store.S; S.settings.minutesPerDay = U.clamp(+el.value || 45, 10, 240); CP.store.save(); };
  CP.act.setplan = el => { const S = CP.store.S; S.settings.plan = el.dataset.id; CP.store.save(); CP.router.refresh(); };
})(typeof window !== 'undefined' ? window : globalThis);
