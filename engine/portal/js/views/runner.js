/* runner: exam console (timed, deferred feedback) and tutor mode (immediate feedback), plus post-submit review. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {}; const U = CP.U, UI = CP.ui, esc = U.esc, inl = U.inl, SS = CP.sess, T = CP.timer;
  const V = CP.views.runner = {};
  let tick = null, announced = {}, strikes = {}, focusOpt = null, lastNudge = null;

  const sessOf = p => SS.get(p.parts[1]);
  V.exam = p => { const s = sessOf(p); return !!(s && s.state === 'open' && s.mode === 'exam'); };
  V.title = p => { const s = sessOf(p); if (!s) return 'Session'; return `${s.label} · Item ${s.cur + 1} of ${s.qids.length}`; };
  V.keepFocus = () => true;

  V.render = p => {
    const s = sessOf(p);
    if (!s) return `<div class="pagehead"><h1>Session not found</h1><p>It may have been deleted or reset. <a href="#/practice">Go to Practice</a>.</p></div>`;
    if (s.state === 'submitted') return review(s, p);
    if (p.q.screen === 'review' && s.mode === 'exam') return reviewScreen(s);
    if (s.cur >= s.qids.length) s.cur = s.qids.length - 1;
    return s.mode === 'exam' ? examView(s) : tutorView(s);
  };

  function header(s, extra) {
    const rem = T.remaining(s);
    const showT = s.limitMs && CP.store.S.settings.showTimer;
    return `<div class="rhead">
      <span class="pos" aria-live="off"><span class="hide-sm">${esc(s.label)} · Item </span>${s.cur + 1}<span class="hide-sm"> of </span><span class="show-sm">/</span>${s.qids.length}</span>
      <span class="grow"></span>
      ${s.limitMs ? `<span class="timer${rem < 15 * 60000 ? ' low' : ''}" role="timer" aria-live="off" id="rtimer" ${showT ? '' : 'hidden'}>${U.fmtClock(rem)}</span>
        <button class="btn sm quiet hide-sm" data-act="rtimer">${showT ? 'Hide timer' : 'Show timer'}</button>` : ''}
      <span class="pace hide-sm" id="rpace"></span>
      ${extra || ''}
      <div class="rprog" aria-hidden="true"><span style="width:${((s.cur + 1) / s.qids.length * 100).toFixed(1)}%"></span></div>
    </div>`;
  }

  function examView(s) {
    const it = SS.item(s), a = SS.ans(s, s.qids[s.cur]);
    const st = CP.store.S;
    SS.enter(s);
    const nSel = a.sel.length;
    const last = s.cur === s.qids.length - 1;
    const paused = !!s.pausedAt;
    return `${header(s, `<button class="btn sm quiet" data-act="rnav" aria-label="Navigator">${UI.icon('squares-four')}<span class="hide-sm">Navigator</span></button>
        ${!s.strict && s.limitMs ? `<button class="btn sm" data-act="rpause">${paused ? 'Resume' : 'Pause'}</button>` : ''}
        <button class="btn sm" data-act="rreview"><span class="hide-sm">Review &amp; submit</span><span class="show-sm">Review</span></button>`)}
      ${paused ? `<div class="callout warnc"><div class="ct">Paused</div><p>The clock is stopped and the pause is recorded in your report.</p><div class="btnrow" style="margin-top:10px"><button class="btn primary" data-act="rpause">Resume</button></div></div>` : `
      <article class="item" aria-labelledby="item-h">
        <h1 id="item-h" class="sr-only">Item ${s.cur + 1} of ${s.qids.length}</h1>
        ${UI.stem(it, false)}
        ${it.type === 'multi' ? `<div class="small muted" style="margin-top:6px" aria-live="polite">Selected ${nSel} of ${it.select}</div>` : ''}
        ${UI.options(it, { perm: SS.perm(s, it), sel: a.sel, strike: strikes[s.id + it.id], strikeOn: st.settings.strike })}
      </article>`}
      <div class="rfoot"><div class="in">
        <button class="btn" data-act="rprev" ${s.cur ? '' : 'disabled'}>Previous</button>
        <button class="btn flagbtn" data-act="rflag" aria-pressed="${a.flag ? 'true' : 'false'}">${a.flag ? '⚑ Flagged' : 'Flag'}</button>
        <span class="grow"></span>
        ${last ? `<button class="btn primary" data-act="rreview">Review &amp; submit</button>` : `<button class="btn primary" data-act="rnext">Next</button>`}
      </div></div>`;
  }

  function tutorView(s) {
    const qid = s.qids[s.cur], it = SS.item(s), a = SS.ans(s, qid);
    const st = CP.store.S;
    if (!a.graded) SS.enter(s);
    const done = !!a.graded;
    const last = s.cur === s.qids.length - 1;
    const confOn = st.settings.confidence && !done;
    const ready = (it.type === 'match' ? a.sel.filter(Boolean).length : a.sel.length) === it.select;
    const tags = `<div class="meta">${UI.dtag(it.domain)}<span class="chip">${esc(it.obj)} ${esc((CP.bank.objById.get(it.obj) || {}).short || '')}</span>
      ${it.set === 'bridge' ? UI.badge('bridge') : ''}${it.set === 'official' ? UI.badge('official') : ''}${qid.endsWith('#re') ? '<span class="chip warn">Second look</span>' : ''}</div>`;
    return `${header(s, `<button class="btn sm" data-act="rend">End session</button>`)}
      <article class="item" aria-labelledby="item-h">
        <h1 id="item-h" class="sr-only">Item ${s.cur + 1} of ${s.qids.length}</h1>
        ${tags}
        ${UI.stem(it, done)}
        ${it.type === 'multi' && !done ? `<div class="small muted" style="margin-top:6px" aria-live="polite">Selected ${a.sel.length} of ${it.select}</div>` : ''}
        ${UI.options(it, { perm: SS.perm(s, it), sel: a.sel, done, strike: strikes[s.id + qid], strikeOn: st.settings.strike && !done })}
        ${confOn ? `<div class="conf" role="group" aria-label="Confidence"><span class="muted">How sure are you?</span>
          <div class="seg">${[[2, 'Sure'], [1, 'Think so'], [0, 'Guessing']].map(([v, l]) => `<button type="button" data-act="rconf" data-v="${v}" aria-pressed="${a.conf === v ? 'true' : 'false'}">${l}</button>`).join('')}</div></div>` : ''}
        <div aria-live="polite">${done ? UI.feedback(it, a.sel) : ''}</div>
      </article>
      <div class="rfoot"><div class="in">
        <span class="small muted">${Object.values(s.ans).filter(x => x.graded).length} checked · ${Object.values(s.ans).filter(x => x.graded && x.ok).length} correct</span>
        <span class="grow"></span>
        ${done ? (last ? `<button class="btn primary" data-act="rfinish">Finish</button>` : `<button class="btn primary" data-act="rnext">Next</button>`)
          : `<button class="btn" data-act="rskip">${last ? 'Skip & finish' : 'Skip'}</button><button class="btn primary" data-act="rcheck" ${ready ? '' : 'disabled'}>Check</button>`}
      </div></div>`;
  }

  function counts(s) {
    let ans = 0, inc = 0, flag = 0;
    s.qids.forEach(q => { const it = CP.bank.get(SS.realId(q)); const a = s.ans[q]; if (!a) return; if (a.flag) flag++; if (a.sel.length === it.select) ans++; else if (a.sel.length) inc++; });
    return { ans, inc, flag, un: s.qids.length - ans - inc };
  }

  function navGrid(s) {
    return `<div class="legend"><span><span class="sw ans"></span>answered</span><span><span class="sw inc"></span>incomplete</span><span><span class="sw"></span>unanswered</span><span style="color:var(--flag)">⚑ flagged</span></div>
      <div class="navgrid">${s.qids.map((q, i) => {
        const it = CP.bank.get(SS.realId(q)), a = s.ans[q] || { sel: [] };
        const st = a.sel.length === it.select ? 'ans' : a.sel.length ? 'inc' : '';
        const lbl = `Item ${i + 1}, ${st === 'ans' ? 'answered' : st === 'inc' ? 'incomplete' : 'unanswered'}${a.flag ? ', flagged' : ''}`;
        return `<button class="${st}${i === s.cur ? ' cur' : ''}" data-act="rjump" data-i="${i}" aria-label="${lbl}">${i + 1}${a.flag ? '<span class="fl" aria-hidden="true">⚑</span>' : ''}</button>`;
      }).join('')}</div>`;
  }

  function reviewScreen(s) {
    const c = counts(s);
    return `${header(s, '')}
      <div class="pagehead"><h1>Review before you submit</h1>
      <p>${c.ans} answered · ${c.inc} incomplete · ${c.un} unanswered · ${c.flag} flagged. Unanswered and incomplete items count as wrong.</p></div>
      ${navGrid(s)}
      <div class="btnrow" style="margin-top:18px">
        <button class="btn" data-act="rback">Back to item ${s.cur + 1}</button>
        ${c.flag ? `<button class="btn" data-act="rjumpflag">Go to first flagged</button>` : ''}
        <span class="grow"></span>
        <button class="btn primary" data-act="rsubmit">Submit ${esc(s.label)}</button>
      </div>`;
  }

  function review(s, p) {
    const i = U.clamp(+(p.q.i || 0), 0, s.qids.length - 1);
    const qid = s.qids[i], it = CP.bank.get(SS.realId(qid)), a = s.ans[qid] || { sel: [] };
    return `<div class="rhead"><span class="pos">${esc(s.label)} · review ${i + 1} of ${s.qids.length}</span><span class="grow"></span>
        <a class="btn sm" href="#/r/${s.id}">Back to report</a></div>
      <article class="item">
        <h1 class="sr-only">Review item ${i + 1}</h1>
        <div class="meta">${UI.dtag(it.domain)}<span class="chip">${esc(it.obj)}</span>${a.flag ? '<span class="chip warn">⚑ flagged</span>' : ''}${a.sel.length ? '' : '<span class="chip bad">Unanswered</span>'}</div>
        ${UI.stem(it, true)}
        ${UI.options(it, { perm: s.perm[it.id], sel: a.sel, done: true })}
        ${UI.feedback(it, a.sel)}
      </article>
      <div class="rfoot"><div class="in">
        <a class="btn" href="#/s/${s.id}?i=${Math.max(0, i - 1)}" ${i ? '' : 'aria-disabled="true"'}>Previous</a>
        <span class="grow"></span>
        ${i < s.qids.length - 1 ? `<a class="btn primary" href="#/s/${s.id}?i=${i + 1}">Next</a>` : `<a class="btn primary" href="#/r/${s.id}">Report</a>`}
      </div></div>`;
  }

  // ---------- behaviour ----------
  const cur = () => { const c = CP.router.current(); return c && c.name === 'runner' ? SS.get(c.p.parts[1]) : null; };
  const rerender = () => CP.router.render(true);

  V.after = (root, p) => {
    clearInterval(tick); announced = {};
    const s = sessOf(p); if (!s) return;
    if (s.state === 'open' && s.limitMs) {
      tick = setInterval(() => onTick(s), 1000); onTick(s);
    }
    if (focusOpt) { const el = root.querySelector(`input[value="${focusOpt}"]`); if (el) el.focus(); focusOpt = null; }
    else if (s.state === 'open') { const h = root.querySelector('.item .stem'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
    if (V._focusFb) { V._focusFb = false; const fb = root.querySelector('#fb'); if (fb) fb.focus(); }
  };
  V.leave = () => { clearInterval(tick); const s = cur(); if (s) { SS.leave(s); CP.store.save(); } };

  function onTick(s) {
    if (s.state !== 'open') { clearInterval(tick); return; }
    const rem = T.remaining(s);
    const el = document.getElementById('rtimer');
    if (el) { el.textContent = U.fmtClock(rem); el.classList.toggle('low', rem < 15 * 60000); }
    const pace = T.pace(s), pe = document.getElementById('rpace');
    if (pe && pace) pe.innerHTML = pace.status === 'behind' ? `<span class="chip warn">Behind pace</span>` : pace.status === 'ahead' ? `<span class="chip good">Ahead</span>` : `<span class="chip">On pace</span>`;
    for (const m of [30, 15, 5, 1]) if (rem <= m * 60000 && rem > (m - 1) * 60000 && !announced[m]) { announced[m] = 1; UI.announce(`${m} minute${m > 1 ? 's' : ''} remaining`); }
    if (pace && pace.missed.length && !announced['cp' + pace.missed.length]) { announced['cp' + pace.missed.length] = 1; const c = pace.missed[pace.missed.length - 1]; UI.toast(`Checkpoint missed: item ${c.n} by ${U.fmtClock(c.at)}. Flag and move on.`, 4000); }
    const a = s.ans[s.qids[s.cur]];
    if (a && s.mode === 'exam') {
      const onItem = (a.ms || 0) + (Date.now() - (SS._shownAt || Date.now()));
      if (onItem > 3 * 60000 && lastNudge !== s.qids[s.cur]) { lastNudge = s.qids[s.cur]; }
    }
    if (rem <= 0 && !s.pausedAt) { clearInterval(tick); SS.submit(s); UI.toast('Time is up. Your answers were submitted.', 4000); location.hash = '#/r/' + s.id; }
  }

  const A = CP.act;
  A.pick = (el, e) => {
    const s = cur(); if (!s || s.state !== 'open') return;
    const qid = s.qids[s.cur], it = SS.item(s);
    const r = SS.select(s, qid, el.getAttribute('data-opt') || el.value, it);
    if (r.blocked) { UI.announce(`You can select ${it.select}; deselect one first.`); UI.toast(`Select ${it.select}: deselect one first.`); }
    focusOpt = el.getAttribute('data-opt') || el.value;
    rerender();
  };
  A.pickmatch = el => { const s = cur(); if (!s || s.state !== 'open') return; const it = SS.item(s); SS.select(s, s.qids[s.cur], el.dataset.i + ':' + el.value, it); rerender(); };
  A.strike = el => { const s = cur(); if (!s) return; const it = SS.item(s); const k = s.id + it.id; strikes[k] = strikes[k] || {}; const o = el.getAttribute('data-opt'); strikes[k][o] = !strikes[k][o]; rerender(); };
  A.rconf = el => { const s = cur(); if (!s) return; const a = SS.ans(s, s.qids[s.cur]); const v = +el.dataset.v; a.conf = a.conf === v ? -1 : v; CP.store.saveSoon(); rerender(); };
  A.rcheck = () => {
    const s = cur(); if (!s) return; const qid = s.qids[s.cur];
    const r = SS.check(s, qid); if (!r) return;
    UI.announce(r.ok ? 'Correct' : 'Not quite'); V._focusFb = true; rerender();
  };
  A.rskip = () => { const s = cur(); if (!s) return; if (s.cur < s.qids.length - 1) { SS.leave(s); s.cur++; CP.store.save(); rerender(); } else A.rfinish(); };
  A.rnext = () => { const s = cur(); if (!s) return; SS.leave(s); if (s.cur < s.qids.length - 1) s.cur++; CP.store.save(); rerender(); window.scrollTo(0, 0); };
  A.rprev = () => { const s = cur(); if (!s) return; SS.leave(s); if (s.cur > 0) s.cur--; CP.store.save(); rerender(); window.scrollTo(0, 0); };
  A.rflag = () => { const s = cur(); if (!s) return; const a = SS.ans(s, s.qids[s.cur]); a.flag = !a.flag; CP.store.saveSoon(); rerender(); };
  A.rtimer = () => { const st = CP.store.S; st.settings.showTimer = !st.settings.showTimer; CP.store.save(); rerender(); };
  A.rpause = () => { const s = cur(); if (!s || s.strict) return; if (s.pausedAt) T.resume(s); else { SS.leave(s); T.pause(s); } CP.store.save(); rerender(); };
  A.rnav = async () => {
    const s = cur(); if (!s) return;
    const v = await UI.modal({ title: 'Navigator', wide: true, body: navGrid(s), actions: [{ id: 'review', label: 'Review & submit' }, { id: 'close', label: 'Close', primary: true }] });
    if (v === 'review') A.rreview();
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('.dialog [data-act="rjump"]'); if (!b) return;
    const s = cur(); if (!s) return; SS.leave(s); s.cur = +b.dataset.i; CP.store.save();
    document.getElementById('modal-root').innerHTML = ''; location.hash = '#/s/' + s.id; rerender();
  }, true);
  A.rjump = el => { const s = cur(); if (!s) return; SS.leave(s); s.cur = +el.dataset.i; CP.store.save(); location.hash = '#/s/' + s.id; };
  A.rjumpflag = () => { const s = cur(); if (!s) return; const i = s.qids.findIndex(q => s.ans[q] && s.ans[q].flag); if (i >= 0) { s.cur = i; CP.store.save(); location.hash = '#/s/' + s.id; } };
  A.rreview = () => { const s = cur(); if (!s) return; SS.leave(s); CP.store.save(); location.hash = '#/s/' + s.id + '?screen=review'; };
  A.rback = () => { const s = cur(); if (!s) return; location.hash = '#/s/' + s.id; };
  A.rsubmit = async () => {
    const s = cur(); if (!s) return;
    const c = counts(s);
    const ok = await UI.confirm('Submit ' + s.label + '?', `${c.ans} answered, ${c.inc + c.un} not answered${c.flag ? `, ${c.flag} flagged` : ''}. You cannot change answers after submitting.`, 'Submit');
    if (!ok) return;
    SS.submit(s); clearInterval(tick); location.hash = '#/r/' + s.id;
  };
  A.rfinish = () => { const s = cur(); if (!s) return; SS.submit(s); location.hash = '#/r/' + s.id; };
  A.rend = async () => {
    const s = cur(); if (!s) return;
    const graded = Object.values(s.ans).filter(a => a.graded).length;
    const v = await UI.modal({ title: 'End this session?', body: `<p>${graded ? `Your ${graded} checked answer${graded === 1 ? ' is' : 's are'} already saved.` : 'Nothing has been answered yet.'}</p>`, actions: [{ id: 'no', label: 'Keep going' }, { id: 'discard', label: 'Discard session', danger: true }, { id: 'end', label: 'End and see results', primary: true }] });
    if (v === 'end') { SS.submit(s); location.hash = '#/r/' + s.id; }
    if (v === 'discard') { SS.abandon(s); location.hash = '#/practice'; }
  };

  V.onKey = (e, p) => {
    const s = sessOf(p); if (!s) return;
    const k = e.key;
    if (s.state === 'submitted') {
      const i = +(p.q.i || 0);
      if (k === 'ArrowRight' || k === 'n' || k === 'N') { location.hash = '#/s/' + s.id + '?i=' + Math.min(s.qids.length - 1, i + 1); e.preventDefault(); }
      if (k === 'ArrowLeft' || k === 'p' || k === 'P') { location.hash = '#/s/' + s.id + '?i=' + Math.max(0, i - 1); e.preventDefault(); }
      return;
    }
    if (p.q.screen === 'review') return;
    const it = SS.item(s), a = SS.ans(s, s.qids[s.cur]);
    const order = SS.perm(s, it);
    let idx = -1;
    if (/^[1-6]$/.test(k)) idx = +k - 1;
    else if (/^[a-fA-F]$/.test(k) && !(s.mode === 'exam' && /^[fF]$/.test(k))) idx = k.toLowerCase().charCodeAt(0) - 97;
    if (idx >= 0 && idx < order.length && !a.graded && it.type !== 'match') { e.preventDefault(); A.pick({ getAttribute: () => order[idx], value: order[idx] }); return; }
    if (k === 'Enter') {
      if (e.target && e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      if (s.mode === 'tutor') { if (a.graded) (s.cur === s.qids.length - 1 ? A.rfinish : A.rnext)(); else if (a.sel.length === it.select) A.rcheck(); }
      else (s.cur === s.qids.length - 1 ? A.rreview : A.rnext)();
      return;
    }
    if ((k === 'f' || k === 'F') && s.mode === 'exam') { e.preventDefault(); A.rflag(); return; }
    if (k === 'ArrowRight' || ((k === 'n' || k === 'N') && s.mode === 'exam')) { e.preventDefault(); if (s.mode === 'exam' || a.graded) A.rnext(); return; }
    if (k === 'ArrowLeft' || ((k === 'p' || k === 'P') && s.mode === 'exam')) { e.preventDefault(); if (s.mode === 'exam') A.rprev(); return; }
    if ((k === 'g' || k === 'G') && s.mode === 'exam') { e.preventDefault(); A.rnav(); return; }
    if ((k === 'r' || k === 'R') && s.mode === 'exam') { e.preventDefault(); A.rreview(); return; }
    if (k === '?') { e.preventDefault(); UI.modal({ title: 'Keyboard shortcuts', body: `<table class="tbl"><tr><td><kbd>1</kbd>–<kbd>6</kbd> or <kbd>A</kbd>–<kbd>E</kbd></td><td>Select an option</td></tr><tr><td><kbd>Enter</kbd></td><td>${s.mode === 'tutor' ? 'Check, then next' : 'Next'}</td></tr><tr><td><kbd>→</kbd> / <kbd>←</kbd></td><td>Next / previous</td></tr>${s.mode === 'exam' ? '<tr><td><kbd>F</kbd></td><td>Flag</td></tr><tr><td><kbd>G</kbd></td><td>Navigator</td></tr><tr><td><kbd>R</kbd></td><td>Review &amp; submit</td></tr>' : ''}</table>` }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
