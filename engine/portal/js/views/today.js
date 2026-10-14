/* today: countdown + next action + blueprint wheel, then readiness, traps, forms and the day's plan. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc, inl = U.inl;
  const V = CP.views.today = {};
  V.title = () => 'Today';
  V.wide = true;
  let drawn = false;

  V.render = () => {
    const S = CP.store.S, B = CP.bank, now = Date.now(), I = UI.icon;
    const nba = CP.nba.compute(S, now);
    const R = CP.ready.compute(S, now);
    const dl = CP.nba.daysLeft(S, now);
    const plan = CP.nba.plan(S, now);
    const traps = CP.nba.topTraps(S, 3);
    const btn = (a, primary, small) => a.act === 'go'
      ? `<a class="btn${primary ? ' primary' : ''}${small ? ' sm' : ''}" href="${esc(a.args.route)}">${esc(a.label)}</a>`
      : `<button class="btn${primary ? ' primary' : ''}${small ? ' sm' : ''}" data-act="${a.act === 'form' ? 'form' : 'start'}" ${a.act === 'form' ? `data-f="${esc(a.args.F)}"` : `data-kind="${esc(a.args.kind)}"`} ${a.args.obj ? `data-obj="${esc(a.args.obj)}"` : ''} ${a.args.code ? `data-code="${esc(a.args.code)}"` : ''} ${a.args.n ? `data-n="${a.args.n}"` : ''}>${esc(a.label)}</button>`;
    const banner = !CP.store.ok ? `<div class="banner" role="status"><span>Progress will not survive closing this tab (browser storage is blocked here). Export before you leave.</span><a class="btn sm" href="#/settings">Export</a></div>` : '';
    const n27 = S.settings.dismissed.n27 ? '' : `<div class="callout warnc" style="margin-top:18px"><div class="ct">${I('info')}Why you may have seen "Agentic Architecture 27%"</div>
      <p class="small">27% is Domain 1 of the Foundations exam (CCAR-F). CCAR-P has 7 domains weighted 17/13/19/16/14/14/7, and agentic design is two objectives inside Domain 1. This portal follows the official CCAR-P Exam Guide v1.0.</p>
      <div class="btnrow" style="margin-top:10px"><a class="btn sm" href="#/exam?anchor=why27">Read the explainer</a><button class="btn sm quiet" data-act="dismiss" data-key="n27" data-val="1">Got it</button></div></div>`;
    const alts = nba.alts.map(a => `<li><span class="li"><span class="grow">${esc(a.label)}<br><span class="cap faint">${esc(a.why)}</span></span>${btn(a, false, true)}</span></li>`).join('');
    const examTs = CP.plan.examDay(S);
    const count = dl == null ? `<div class="count">Your CCAR-P plan<small>Set your exam date and the plan counts down to it.</small></div>`
      : dl > 0 ? `<div class="count">${dl} day${dl === 1 ? '' : 's'} to go<small>Exam on ${esc(U.fmtDate(examTs))}${R.freshN ? `, readiness: ${esc(R.label.toLowerCase())}` : ''}</small></div>`
        : dl === 0 ? `<div class="count">Exam day<small>Read the pacing card and the 8 laws, then rest.</small></div>`
          : `<div class="count">Exam date passed<small>Update it in the learning path to plan again.</small></div>`;
    const formRow = F => {
      const st = B.formState(S, F), s = B.formSession(S, F);
      const status = st === 'done' ? `${Math.round(s.result.pct * 100)}%` : st === 'open' ? 'In progress' : st === 'sealed' ? 'Sealed' : 'Not taken';
      const cls = st === 'done' ? (s.result.pct >= CP.ready.TARGET ? 'good' : 'warn') : st === 'open' ? 'acc' : '';
      const ic = st === 'done' ? 'seal-check' : st === 'sealed' ? 'lock-simple' : st === 'open' ? 'timer' : 'lock-simple-open';
      return `<li><a href="${st === 'done' ? '#/r/' + s.id : st === 'open' ? '#/s/' + s.id : '#/practice'}">${I(ic)}<span class="grow">Form ${F}</span><span class="chip ${cls}">${esc(status)}</span></a></li>`;
    };
    const tipPool = (CP.D.tips || []).filter(t => !traps.length || (t.traps || []).includes(traps[0].code));
    const tips = tipPool.length ? tipPool : (CP.D.tips || []);
    const tip = tips.length ? tips[U.dayNum(now) % tips.length] : null;
    const stages = (CP.D.path && CP.D.path.stages) || [];
    const done = stages.filter(s => S.path[s.id]).length;
    const anim = !drawn && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    return `${banner}
      <section class="plate hero" aria-labelledby="today-h">
        <div>
          <h1 id="today-h" class="sr-only">Today</h1>
          ${count}
          <div class="nba">
            <div class="lbl">${I('lightning')}Next best action${nba.primary.id !== 'resume' ? `<button class="btn sm quiet" data-act="dismiss" data-key="nba:${esc(nba.primary.id)}" data-val="${U.isoDay(now)}">Not now</button>` : ''}</div>
            <h3>${esc(nba.primary.label)}</h3>
            <p><b>Why this:</b> ${esc(nba.primary.why)}</p>
            <div class="btnrow" style="margin-top:14px">${btn(nba.primary, true)}</div>
            ${alts ? `<details class="acc" style="margin-top:14px"><summary>Something else</summary><div class="body"><ul class="linklist">${alts}</ul></div></details>` : ''}
          </div>
        </div>
        <div>${UI.wheel(R, { animate: anim })}
          <p class="cap faint" style="margin-top:12px">Each arc is a domain sized by its exam weight; the solid part is your estimate from first attempts${R.freshN ? ` (${R.freshN} so far)` : ''}.</p></div>
      </section>
      ${n27}

      <div class="grid3" style="margin-top:18px">
        <section class="card" aria-labelledby="rd-h">
          <div class="spread"><h2 id="rd-h" style="font-size:var(--fs-h3)">Readiness</h2><span class="chip ${R.state === 'ready' || R.state === 'ontrack' ? 'good' : R.state === 'borderline' ? 'warn' : R.state === 'notyet' ? 'bad' : ''}">${esc(R.label)}</span></div>
          <p class="small muted" style="margin-top:6px">${esc(CP.ready.HELP[R.state])}</p>
          ${R.freshN ? `<div style="margin:20px 0 8px">${UI.meter({ p: R.P, lo: R.lo, hi: R.hi, target: CP.ready.TARGET })}</div>
            <div class="spread cap faint"><span>${Math.round(R.P * 100)}% (range ${Math.round(R.lo * 100)} to ${Math.round(R.hi * 100)}%)</span><span>target 76%</span></div>` : ''}
          ${R.warnings.map(w => `<div class="callout warnc" style="margin-top:10px"><p class="small">${esc(w)}</p></div>`).join('')}
          <details class="acc" style="margin-top:14px"><summary>Gates: ${R.gates.filter(g => g.ok).length} of ${R.gates.length} clear</summary><div class="body"><ul class="linklist">${R.gates.map(g => `<li><span class="li"><span style="color:var(${g.ok ? '--good' : '--text-3'})">${I(g.ok ? 'check-circle' : 'x-circle')}</span><span class="grow"><b>${esc(g.name)}</b><br><span class="cap faint">${esc(g.text)}</span></span><span class="sr-only">${g.ok ? 'clear' : 'open'}</span></span></li>`).join('')}</ul></div></details>
          <p class="cap faint" style="margin-top:10px">Blueprint-weighted accuracy on first attempts. Not Anthropic's scaled score.</p>
        </section>
        <section class="card">
          <h2 style="font-size:var(--fs-h3)">Your top traps</h2>
          ${traps.length ? `<ul class="linklist" style="margin-top:12px">${traps.map(t => { const c = B.traps.get(t.code) || {}; return `<li><span class="li"><span class="grow">${UI.trapChip(t.code)}<br>${esc(c.name || '')}<br><span class="cap faint">picked in ${t.fell} of ${t.exposed} offers</span></span><button class="btn sm" data-act="start" data-kind="trap" data-code="${esc(t.code)}">Drill</button></span></li>`; }).join('')}</ul>`
          : `<p class="small muted" style="margin-top:6px">This fills in once a trap has been offered to you 5 times. Every wrong option in the bank is tagged with the reasoning error it represents.</p><p style="margin-top:12px"><a class="btn sm" href="#/traps">${I('warning-diamond')}Browse the trap atlas</a></p>`}
        </section>
        <section class="card">
          <h2 style="font-size:var(--fs-h3)">Sealed forms</h2>
          <p class="small muted" style="margin-top:6px">Three separate 63-item forms, weighted like the real exam.</p>
          <ul class="linklist" style="margin-top:12px">${['A', 'B', 'C'].map(formRow).join('')}</ul>
          <p class="cap faint" style="margin-top:10px"><a href="#/path">See when to sit each one</a></p>
        </section>
      </div>

      <div class="grid2" style="margin-top:18px">
        <section class="card"><div class="spread"><h2 style="font-size:var(--fs-h3)">Today's plan</h2><span class="cap faint">${plan.used} of ${plan.mins} min, <a href="#/settings">change</a></span></div>
          <ul class="linklist" style="margin-top:12px">${plan.items.map(p => `<li><span class="li"><span class="grow">${esc(p.label)}</span><span class="cap faint nowrap">${p.mins} min</span>${btn({ label: 'Go', act: p.act, args: p.args }, false, true)}</span></li>`).join('')}</ul>
        </section>
        <div class="stack">
          ${tip ? `<section class="callout tip"><div class="ct">${I('lightbulb')}Tip of the day ${UI.badge((tip.source || 'Derived').toLowerCase() === 'official' ? 'official' : (tip.source || '').toLowerCase() === 'community' ? 'community' : 'derived')}</div><p><b>${inl(tip.text)}</b></p><p class="small muted" style="margin-top:4px">${inl(tip.why)}</p></section>` : ''}
          <section class="callout"><div class="ct">${I('path')}Learning path</div><p class="small">${done} of ${stages.length} stages done.</p><div class="btnrow" style="margin-top:10px"><a class="btn sm" href="#/path">Open the path</a><a class="btn sm quiet" href="#/cheat">Cheat sheet</a></div></section>
        </div>
      </div>`;
  };
  V.after = root => { if (!drawn) { drawn = true; UI.animateWheel(root); } };
})(typeof window !== 'undefined' ? window : globalThis);
