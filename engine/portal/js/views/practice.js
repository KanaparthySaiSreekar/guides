/* practice: every mode, grouped, with size, timing and when feedback arrives; session history. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc;
  const V = CP.views.practice = {};
  V.title = () => 'Practice & mocks';
  V.wide = true;

  const ICON = t => /^Form C/.test(t) ? 'lock-simple' : /^Form/.test(t) ? 'seal-check' : /Adaptive/.test(t) ? 'sparkle' : /Half/.test(t) ? 'timer' : /Pacing/.test(t) ? 'clock' : /Objective/.test(t) ? 'target' : /Domain/.test(t) ? 'squares-four' : /Trap/.test(t) ? 'warning-diamond' : /Weak/.test(t) ? 'compass-tool' : /Multi/.test(t) ? 'list-checks' : /Community/.test(t) ? 'users-three' : /bridge/i.test(t) ? 'graduation-cap' : /Spaced/.test(t) ? 'stack' : /Missed/.test(t) ? 'arrows-clockwise' : /Official/.test(t) ? 'seal-check' : /Baseline/.test(t) ? 'ruler' : /flashcards/i.test(t) ? 'lightning' : 'target';
  const card = (title, meta, desc, action, extra) => `<div class="tile"><div class="spread" style="align-items:flex-start"><span class="tic">${UI.icon(ICON(title))}</span>${extra || ''}</div><h3>${esc(title)}</h3>
    <p class="meta">${esc(meta)}</p><p class="desc">${desc}</p><div class="btnrow">${action}</div></div>`;

  V.render = () => {
    const S = CP.store.S, B = CP.bank, X = CP.select;
    const nba = CP.nba.compute(S);
    const fs = F => B.formState(S, F);
    const formCard = F => {
      const st = fs(F), s = B.formSession(S, F);
      const chip = st === 'done' ? `<span class="chip ${s.result.pct >= CP.ready.TARGET ? 'good' : 'warn'}">${Math.round(s.result.pct * 100)}%</span>` : st === 'open' ? '<span class="chip acc">In progress</span>' : st === 'sealed' ? '<span class="chip">Sealed</span>' : '<span class="chip">Not taken</span>';
      const act = st === 'done' ? `<a class="btn" href="#/r/${s.id}">Report</a><button class="btn quiet" data-act="form" data-f="${F}">Retake (timing only)</button>`
        : st === 'open' ? `<a class="btn primary" href="#/s/${s.id}">Resume</a>`
          : `<button class="btn${nba.primary.id === 'form' + F ? ' primary' : ''}" data-act="form" data-f="${F}">${st === 'sealed' ? 'Unseal and start' : 'Start Form ' + F}</button>`;
      const desc = F === 'A' ? 'Your first honest measurement. Take it once about 70% of objectives are Practised.' : F === 'B' ? 'At least 3 days after Form A, with remediation in between.' : 'The dress rehearsal, 3 to 7 days before the exam. Kept sealed so it predicts once.';
      return card('Form ' + F, '63 items · 120 min · feedback after submit', desc, act, chip).replace('<div class="tile">', '<div class="tile form">');
    };
    const aDone = fs('A') === 'done';
    const objOpts = B.objs.map(o => `<option value="${esc(o.id)}">${esc(o.id)} ${esc(o.short)}</option>`).join('');
    const domOpts = B.domains.map(d => `<option value="${d.n}">D${d.n} ${esc(d.short)} (${d.weight}%)</option>`).join('');
    const trapOpts = [...B.traps.values()].map(t => `<option value="${esc(t.code)}">${esc(t.code)} · ${esc(t.name)}</option>`).join('');
    const due = CP.srs.due(S).length, redo = X.redo(S, 99).length;
    const bridgeN = B.items.filter(i => i.set === 'bridge').length;
    const comm = B.items.filter(i => i.set === 'community');
    const commSrc = [...new Set(comm.map(i => i.src.source))].map(k => ({ k, name: (comm.find(i => i.src.source === k).src.sourceName || k), n: comm.filter(i => i.src.source === k && (!i.verdict || i.verdict.status !== 'wrong-key')).length }));
    const hist = S.sessions.slice().reverse().slice(0, 30);

    return `<div class="pagehead"><h1>Practice &amp; mocks</h1><p>Sealed forms measure. Everything else trains. Pool items and forms you have already sat feed the drills; Form C stays hidden until you sit it.</p></div>
      <div class="section-title"><h2>${UI.icon('timer')}Simulation</h2><span class="aside">Pearson-style console: timer, flags, navigator, no feedback until submit</span></div>
      <div class="grid3">${formCard('A')}${formCard('B')}${formCard('C')}
        ${card('Adaptive mock', '63 items · 120 min · same quotas', `Drawn from the pool and forms you have sat, weighted toward your weak objectives. Less predictive than a sealed form; the report shows how fresh it was.${aDone ? '' : ' Unlocks after Form A.'}`, `<button class="btn" data-act="start" data-kind="adaptive" ${aDone ? '' : 'disabled'}>Start adaptive mock</button>`)}
        ${card('Half mock', '32 items · 60 min · 6/4/6/5/5/4/2', 'A weeknight-sized timed set from the same sampler.', `<button class="btn" data-act="start" data-kind="half">Start half mock</button>`)}
        ${card('Pacing drill', '10 seen items · 17.5 min', 'Trains speed on material you know at the first-pass pace: about 1:45 per item.', `<button class="btn" data-act="start" data-kind="pacing">Start pacing drill</button>`)}
      </div>
      <div class="section-title"><h2>${UI.icon('target')}Targeted drills</h2><span class="aside">Tutor mode: immediate feedback naming the trap you fell for</span></div>
      <div class="grid3">
        ${card('Objective drill', '4 to 8 items', 'Unseen first, then missed, then due. Makes an objective Practised.', `<select class="input" id="pr-obj" aria-label="Objective">${objOpts}</select><button class="btn" data-act="startsel" data-kind="objective" data-src="pr-obj">Start</button>`)}
        ${card('Domain drill', '10 items', 'Balanced across the domain, weighted toward your weakest objectives.', `<select class="input" id="pr-dom" aria-label="Domain">${domOpts}</select><button class="btn" data-act="startsel" data-kind="domain" data-src="pr-dom">Start</button>`)}
        ${card('Trap drill', '10 items · about 20% counter-traps', 'Items where the chosen trap is offered, plus items where the trap-looking answer is right.', `<select class="input" id="pr-trap" aria-label="Trap">${trapOpts}</select><button class="btn" data-act="startsel" data-kind="trap" data-src="pr-trap">Start</button>`)}
        ${card('Weak-spot mix', '15 items · interleaved', 'Weighted toward your lowest-mastery objectives, at least 3 domains per 10 items.', `<button class="btn${nba.primary.id === 'mix' ? ' primary' : ''}" data-act="start" data-kind="mix" data-n="15">Start mix</button>`)}
        ${card('Multi-response clinic', '10 select-N items', 'All-or-nothing scoring. Feedback marks each pick as needed, filler or trap.', `<button class="btn" data-act="start" data-kind="multi">Start clinic</button>`)}
        ${comm.length ? card('Community reference', `${comm.length} public questions · ${commSrc.length} sources`, 'Public practice questions from community guides, with attribution. Each was re-checked against the portal’s rules; disputed keys are labelled and wrong keys are held back. Not counted toward readiness.', `<select class="input" id="pr-comm" aria-label="Source"><option value="">All sources</option>${commSrc.map(s => `<option value="${esc(s.k)}">${esc(s.name)} (${s.n})</option>`).join('')}</select><button class="btn" data-act="startsel" data-kind="community" data-src="pr-comm">Start</button>`) : ''}
        ${bridgeN ? card('Foundations bridge', `${bridgeN} rewritten CCAR-F items`, 'Rewritten Foundations items that map to CCAR-P objectives. Drill only; never in mocks or readiness.', `<button class="btn" data-act="start" data-kind="bridge">Start bridge drill</button>`) : ''}
      </div>
      <div class="section-title"><h2>${UI.icon('stack')}Review &amp; warm-up</h2></div>
      <div class="grid3">
        ${card('Spaced review', `${due} due`, 'Leitner boxes at 1, 3, 7, 14 and 30 days, capped by your exam date. Wrong items come back later in the same session.', `<button class="btn${due ? ' primary' : ''}" data-act="start" data-kind="spaced" ${due ? '' : 'disabled'}>Review ${Math.min(due, 25)}</button>`)}
        ${card('Missed-item redo', `${redo} to redo`, 'Items whose latest attempt was wrong, oldest first.', `<button class="btn" data-act="start" data-kind="redo" ${redo ? '' : 'disabled'}>Redo</button>`)}
        ${card('Official samples', '3 items · untimed', 'The only official CCAR-P items (Exam Guide Section 8), with worked reasoning. Not counted toward readiness.', `<button class="btn" data-act="start" data-kind="official">Walk through</button>`)}
        ${card('Baseline diagnostic', '21 items · feedback at the end', 'Three per domain, stratified by difficulty. Shows where your self-ratings are off.', `<button class="btn" data-act="start" data-kind="baseline">Start baseline</button>`)}
        ${card('Cue flashcards', 'cheat-sheet rows', 'The signal is shown; recall the move and the trap. Spaced like the items.', `<a class="btn" href="#/cheat?tab=flash">Open flashcards</a>`)}
      </div>
      <div class="section-title"><h2>${UI.icon('clock')}Session history</h2><span class="aside">${S.sessions.length} session${S.sessions.length === 1 ? '' : 's'}</span></div>
      ${hist.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Session</th><th>Started</th><th class="r">Result</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
        ${hist.map(s => `<tr><td>${esc(s.label)}${s.retake ? ' <span class="chip">retake</span>' : ''}</td><td class="nowrap">${esc(U.fmtDateTime(s.startedAt))}</td>
          <td class="r num">${s.state === 'submitted' && s.result ? `${s.result.c}/${s.result.t} · ${Math.round(s.result.pct * 100)}%` : `<span class="faint">${Object.values(s.ans).filter(a => a.sel && a.sel.length).length}/${s.qids.length} open</span>`}</td>
          <td class="r nowrap">${s.state === 'submitted' ? `<a class="btn sm quiet" href="#/r/${s.id}">Report</a>` : `<a class="btn sm" href="#/s/${s.id}">Resume</a>`}<button class="btn sm quiet" data-act="delsess" data-id="${s.id}" aria-label="Delete session">Delete</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">No sessions yet.</p>'}`;
  };

  CP.act.startsel = el => {
    const v = document.getElementById(el.dataset.src).value;
    const k = el.dataset.kind;
    UI.startSession(k, k === 'objective' ? { obj: v } : k === 'domain' ? { d: v } : { code: v || undefined });
  };
  CP.act.delsess = async el => {
    const S = CP.store.S, s = S.sessions.find(x => x.id === el.dataset.id); if (!s) return;
    const ok = await UI.confirm('Delete this session?', 'Its answers stay in your item history; only the session record and its report are removed.' + (s.form && !s.retake ? ' This form becomes available again but will no longer count as fresh.' : ''), 'Delete', true);
    if (!ok) return;
    S.sessions = S.sessions.filter(x => x !== s);
    for (const F of ['A', 'B', 'C']) if (S.forms[F] === s.id) S.forms[F] = null;
    CP.store.save(); CP.router.refresh();
  };
})(typeof window !== 'undefined' ? window : globalThis);
