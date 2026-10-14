/* cheat: the one surface to reread daily; printable on 2 pages; ladders, trigger words, flashcards. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc, inl = U.inl;
  const V = CP.views.cheat = {};
  V.title = () => 'Cheat sheet';
  V.wide = true;
  const st = { q: '', misses: false, extended: false, cover: false };

  function missMap() {
    const S = CP.store.S, out = {};
    for (const it of CP.bank.items) {
      const r = S.items[it.id]; if (!r || !r.h || !r.h.length) continue;
      const m = out[it.rule] || (out[it.rule] = { miss: 0, n: 0 });
      m.n++; if (r.h[r.h.length - 1][1] < 1) m.miss++;
    }
    return out;
  }

  const lead = a => { const m = String(a).match(/^([A-Z][A-Z ,'-]+[A-Z])\.\s*(.*)$/); return m ? `<b>${esc(m[1][0] + m[1].slice(1).toLowerCase())}.</b> <span class="alg-rest">${inl(m[2])}</span>` : inl(a); };
  function sheet(p) {
    const D = CP.bank.D, S = CP.store.S;
    const night = p.q.night === '1';
    const dSel = p.q.d ? +p.q.d : null;
    const mm = missMap();
    const q = st.q.trim().toLowerCase();
    const rowMatch = r => (!q || [r.signal, r.choose, r.not, r.trap, r.rule, r.id].join(' ').toLowerCase().includes(q)) && (!st.misses || (mm[r.id] && mm[r.id].miss));
    const row = r => {
      const m = mm[r.id];
      const cls = ['csrow', m && m.miss ? 'hit' : '', r.print ? '' : 'xprint'].join(' ');
      return `<div class="${cls}" data-row="${esc(r.id)}"${st.cover ? ' tabindex="0" role="button" aria-label="Reveal answer"' : ''}><div class="s">${inl(r.signal)}</div><div class="a">${inl(r.choose)}</div><div class="n">${inl(r.not)} <span class="code">${esc(r.trap)}</span></div>
        ${r.unless && st.extended ? `<div class="u">Unless: ${inl(r.unless)}</div>` : ''}${m && m.miss ? `<div class="miss">✕ missed ×${m.miss} of ${m.n} item${m.n === 1 ? '' : 's'} on this rule</div>` : ''}</div>`;
    };
    const exam = D.exam || {};
    const facts = [['63 items', 'MC + multiple-response; each item says how many to select'], ['120 min', 'about 1:54 per item'], ['Scaled 720', 'on 100–1,000, criterion-referenced, not 72%'], ['11/8/12/10/9/9/4', 'items per domain, approx.'], ['No scenario bank', 'standalone scenario stems'], ['27% = CCAR-F D1', 'not a CCAR-P weight']];
    const domBlocks = CP.bank.domains.filter(d => !dSel || d.n === dSel).map(d => {
      const rows = D.cheat.rows.filter(r => r.d === d.n && (st.extended || r.print || q || st.misses) && rowMatch(r));
      if (!rows.length) return '';
      return `<section class="cs-block dl" data-d="${d.n}"><h3><span class="dm"></span>D${d.n} ${esc(d.short)}<span class="w">${d.weight}% · ~${d.formQuota} items</span></h3>${rows.map(row).join('')}</section>`;
    }).join('');
    const ladders = (D.ladders || []).map(l => `<div style="padding:4px 0"><b>${esc(l.name)}:</b> <span class="oneline">${inl(l.oneLine)}</span></div>`).join('');
    const antid = (D.traps || []).map(t => `<div><span class="code">${esc(t.code)}</span><span>${inl(t.antidote)}</span></div>`).join('');
    const pacing = exam.pacing || {};
    const plat = (D.platform || []).filter(f => f.label === 'docs');
    const blocks = [];
    blocks.push(`<section class="cs-block"><h3>${UI.icon('compass-tool')}Answer algorithm</h3><ol class="alg">${D.cheat.algorithm.map(a => `<li><span>${lead(a)}</span></li>`).join('')}</ol></section>`);
    if (!night) blocks.push(`<section class="cs-block"><h3>${UI.icon('calendar-check')}Exam facts ${UI.badge('official')}</h3><div class="stack-sm">${facts.map(([k, v]) => `<div class="small"><b>${esc(k)}</b> <span class="muted">${esc(v)}</span></div>`).join('')}</div></section>`);
    blocks.push(`<section class="cs-block"><h3>${UI.icon('scales')}The 8 laws</h3><div class="laws">${D.cheat.laws.map(l => `<div class="law"><b>${inl(l.text)}</b>${st.extended ? `<span>${inl(l.why)}</span>` : ''}</div>`).join('')}</div></section>`);
    blocks.push(domBlocks);
    if (!night) blocks.push(`<section class="cs-block ladder-strip"><h3>${UI.icon('stack')}Decision ladders</h3>${ladders}<p class="cap faint noprint" style="margin-top:6px"><a href="#/cheat?tab=ladders">Full ladders</a></p></section>`);
    if (!night) blocks.push(`<section class="cs-block"><h3>${UI.icon('warning-diamond')}Trap antidotes (${(D.traps || []).length})</h3><div class="antidotes">${antid}</div></section>`);
    if (!night) blocks.push(`<section class="cs-block"><h3>${UI.icon('list-checks')}Multi-response rules</h3><ul>${D.cheat.multi_rules.map((r, i) => `<li class="small${i > 2 ? ' xprint' : ''}">${inl(r)}</li>`).join('')}</ul></section>`);
    blocks.push(`<section class="cs-block"><h3>${UI.icon('timer')}Pacing</h3><p class="small"><b>${esc(pacing.perItem || 'About 1:54 per item')}</b></p><ul>${(pacing.checkpoints || []).map(c => `<li class="small">${inl(c)}</li>`).join('')}${(pacing.rules || []).map((c, i) => `<li class="small xprint">${inl(c)}</li>`).join('')}</ul></section>`);
    if (!night) blocks.push(`<section class="cs-block xprint"><h3>${UI.icon('info')}Logistics</h3><ul>
      <li class="small">Reschedule at least <b>48 hours</b> ahead. ${UI.badge('conflict')} the guide says 24h; the FAQ and Pearson say 48h.</li>
      <li class="small">The name on your ID must match your registration. Run the OnVUE system test the day before.</li>
      <li class="small">Closed book: no second monitor, no phone in view, no other tabs.</li>
      <li class="small">Valid 12 months. Set a renewal reminder at month 10.</li></ul></section>`);
    if (st.extended && !night && plat.length) blocks.push(`<section class="cs-block xprint"><h3>${UI.icon('seal-check')}Platform facts ${UI.badge('docs')}</h3><p class="cap faint">Version-sensitive. Useful context; never the basis of a sealed-form key.</p><ul>${plat.slice(0, 14).map(f => `<li class="small">${inl(f.principle || f.text)}</li>`).join('')}</ul><p class="cap faint"><a href="#/exam?anchor=platform">All ${plat.length} checked facts</a></p></section>`);

    return `<div class="cs-bar noprint" role="toolbar" aria-label="Cheat sheet filters">
        <div class="seg">${[null, 1, 2, 3, 4, 5, 6, 7].map(n => `<button type="button" data-act="csd" data-d="${n || ''}" aria-pressed="${(dSel || null) === n}">${n ? 'D' + n : 'All'}</button>`).join('')}</div>
        <input class="input" type="search" id="csq" placeholder="Search rules" aria-label="Search rules" value="${esc(st.q)}">
        <label class="toggle"><input type="checkbox" data-act="cst" data-k="extended" ${st.extended ? 'checked' : ''}>Extended</label>
        <label class="toggle"><input type="checkbox" data-act="cst" data-k="misses" ${st.misses ? 'checked' : ''}>Only my misses</label>
        <label class="toggle"><input type="checkbox" data-act="cst" data-k="cover" ${st.cover ? 'checked' : ''}>Cover answers</label>
        <span class="grow"></span><a class="btn sm${night ? ' primary' : ''}" href="#/cheat${night ? '' : '?night=1'}">${UI.icon('moon')}${night ? 'Exit night-before' : 'Night-before'}</a>
        <button class="btn sm" data-act="print">${UI.icon('printer')}Print (2 pages)</button></div>
      <div class="cs-grid${st.cover ? ' cover' : ''}">${blocks.join('')}<p class="printfoot">CCAR-P Study Portal, built on the CCAR-P Exam Guide v1.0 (July 2026). Bank ${esc((CP.D.meta || {}).bank || '')}. Trap codes mark the tempting wrong move.</p></div>`;
  }

  function laddersTab() {
    const D = CP.bank.D;
    return `<div class="stack">${(D.ladders || []).map(l => `<section class="cs-block"><h3>${esc(l.name)}<span class="w">${(l.domains || []).map(d => 'D' + d).join(' ')}</span></h3>
      <p class="small muted">${inl(l.question)}</p><p class="oneline" style="margin-top:6px">${inl(l.oneLine)}</p>
      <ol class="ladder" style="margin-top:8px">${l.rungs.map(r => `<li><b>${inl(r.step)}</b> ${inl(r.use_when)}<span class="cl">Climb only if: ${inl(r.climb_if)}</span></li>`).join('')}</ol>
      ${(l.traps || []).length ? `<div class="row" style="margin-top:8px">${l.traps.map(t => UI.trapChip(t)).join('')}</div>` : ''}</section>`).join('')}</div>`;
  }
  function triggersTab() {
    const D = CP.bank.D;
    return `<p class="muted small" style="margin-bottom:12px">Words in a stem that mark a hard constraint or hidden complexity. After you answer an item, its own signal phrases are highlighted.</p>
      <div class="trig">${(D.triggers || []).map(t => `<div><b>${esc(t.word)}</b><br>${inl(t.signals)} <span class="cap faint">→ ${esc(t.points_to)}</span><br><span class="cap faint">e.g. ${inl(t.example)}</span></div>`).join('')}</div>`;
  }
  function flashTab() {
    const S = CP.store.S, D = CP.bank.D;
    const ids = D.cheat.rows.map(r => r.id);
    const due = CP.srs.rulesDue(S, ids);
    const mm = missMap();
    const order = due.slice().sort((a, b) => ((mm[b] && mm[b].miss) || 0) - ((mm[a] && mm[a].miss) || 0));
    const id = order[0];
    if (!id) return `<div class="flash"><div class="fc"><p class="q">No cards due.</p><p class="small muted">Come back tomorrow, or review the sheet.</p></div></div>`;
    const r = CP.bank.rules.get(id);
    return `<div class="flash"><p class="cap faint" style="margin-bottom:8px">${due.length} card${due.length === 1 ? '' : 's'} due · D${r.d} · ${esc(r.obj)}</p>
      <div class="fc"><p class="q">“${inl(r.signal)}”</p>
      ${V._flip ? `<p class="ans"><b>Choose:</b> ${inl(r.choose)}</p><p class="ans muted"><b>Not:</b> ${inl(r.not)} ${UI.trapChip(r.trap)}</p>${r.unless ? `<p class="cap faint">Unless: ${inl(r.unless)}</p>` : ''}` : '<p class="small muted">What do you choose, and what is the tempting wrong move?</p>'}</div>
      <div class="btnrow" style="justify-content:center;margin-top:14px">${V._flip ? [[0, 'Missed'], [1, 'Shaky'], [2, 'Knew it']].map(([g, l]) => `<button class="btn${g === 2 ? ' primary' : ''}" data-act="fcgrade" data-id="${esc(id)}" data-g="${g}">${l}</button>`).join('') : `<button class="btn primary" data-act="fcflip">Show answer</button>`}</div></div>`;
  }

  V.render = p => {
    const tab = p.q.tab || 'sheet';
    const tabs = [['sheet', 'Sheet'], ['ladders', 'Ladders'], ['triggers', 'Trigger words'], ['flash', 'Flashcards']];
    return `<div class="pagehead"><h1>Cheat sheet</h1><p>The decision rules, traps and ladders that the exam rewards, on one page. Extended view shows every row and the counter-conditions; print gives two dense pages.</p>
      <div class="seg noprint" role="tablist" style="margin-top:12px">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-act="go" data-route="#/cheat${k === 'sheet' ? '' : '?tab=' + k}">${l}</button>`).join('')}</div></div>
      ${tab === 'ladders' ? laddersTab() : tab === 'triggers' ? triggersTab() : tab === 'flash' ? flashTab() : sheet(p)}`;
  };
  V.after = root => {
    const q = root.querySelector('#csq');
    if (q) q.addEventListener('input', () => { st.q = q.value; clearTimeout(V._t); V._t = setTimeout(() => { CP.router.render(true); const n = document.getElementById('csq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 220); });
    root.querySelectorAll('.cover .csrow').forEach(r => { r.addEventListener('click', () => r.classList.toggle('show')); r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.classList.toggle('show'); } }); });
  };
  CP.act.csd = el => { const d = el.dataset.d; location.hash = '#/cheat' + (d ? '?d=' + d : ''); };
  CP.act.cst = el => { st[el.dataset.k] = el.checked; CP.router.render(true); };
  CP.act.fcflip = () => { V._flip = true; CP.router.render(true); };
  CP.act.fcgrade = el => { CP.srs.gradeRule(CP.store.S, el.dataset.id, +el.dataset.g); CP.store.save(); V._flip = false; CP.router.render(true); };
})(typeof window !== 'undefined' ? window : globalThis);
