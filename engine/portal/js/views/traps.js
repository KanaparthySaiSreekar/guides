/* traps: the atlas of named reasoning errors with your personal fall rates, plus the tips tab. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc, inl = U.inl;
  const V = CP.views.traps = {};
  V.title = p => p.parts[1] ? p.parts[1] : 'Traps & tips';
  V.wide = true;
  const FAM = { CONTROL: 'Control', COMPLEXITY: 'Complexity', BLUNT: 'Blunt instruments', DIAGNOSIS: 'Diagnosis', EVIDENCE: 'Evidence', PEOPLE: 'People & lifecycle', MECHANICS: 'Exam mechanics' };

  function detail(code) {
    const B = CP.bank, S = CP.store.S, t = B.traps.get(code);
    if (!t) return `<div class="pagehead"><h1>Unknown trap</h1><p><a href="#/traps">Back to the atlas</a></p></div>`;
    const stats = CP.nba.trapStats(S)[code];
    const rows = B.D.cheat.rows.filter(r => r.trap === code);
    const seen = B.items.filter(it => B.visible(S, it) && S.items[it.id] && it.options.some(o => !o.correct && o.trap === code)).slice(0, 2);
    return `<p class="small"><a href="#/traps">Trap atlas</a> / ${esc(FAM[t.family] || t.family)}</p>
      <div class="pagehead"><h1><span class="mono" style="color:var(--trap)">${esc(t.code)}</span> ${esc(t.name)}</h1><p>${inl(t.antidote)}</p></div>
      <div class="grid2">
        <section class="card stack-sm"><h2 style="font-size:var(--fs-h3)">How to spot it</h2><ul>${(t.tell || []).map(x => `<li>${inl(x)}</li>`).join('')}</ul>
          <p class="small"><b>Why it tempts:</b> ${inl(t.tempts)}</p><div class="callout rule"><div class="ct">Counter-rule</div><p>${inl(t.counter)}</p></div>
          <div class="callout goodc"><div class="ct">When the trap-looking answer is actually right</div><p>${inl(t.rightWhen)}</p></div>
          <p class="small muted"><b>Example:</b> ${inl(t.example)}</p></section>
        <section class="card stack-sm"><h2 style="font-size:var(--fs-h3)">You and this trap</h2>
          ${stats && stats.exposed ? `<div class="stats"><div class="stat"><span class="v">${stats.fell}/${stats.exposed}</span><span class="l">times picked / offered</span></div>${stats.exposed >= 5 ? `<div class="stat"><span class="v">${Math.round(stats.rate * 100)}%</span><span class="l">fall rate (with prior)</span></div>` : ''}</div>` : '<p class="small muted">Not offered to you yet.</p>'}
          <div class="btnrow"><button class="btn primary" data-act="start" data-kind="trap" data-code="${esc(code)}">Drill this trap</button></div>
          <p class="small">Domains: ${(t.domains || []).map(d => UI.dtag(d)).join(' ')}</p>
          ${rows.length ? `<h3 style="font-size:var(--fs-ui);margin-top:12px">Cheat-sheet rows with this trap</h3><ul>${rows.map(r => `<li class="small"><b>${esc(r.id)}</b> “${inl(r.signal)}” → ${inl(r.choose)}</li>`).join('')}</ul>` : ''}
        </section>
      </div>
      ${seen.length ? `<div class="section-title"><h2>Seen in your answered items</h2></div>${seen.map(it => `<div class="card" style="margin-bottom:10px"><div class="meta row">${UI.dtag(it.domain)}<span class="chip">${esc(it.obj)}</span></div>${UI.stem(it, true)}${UI.options(it, { done: true, sel: String((S.items[it.id].h.slice(-1)[0] || [])[5] || '').split('') })}</div>`).join('')}` : ''}`;
  }

  function tipsTab() {
    const tips = CP.bank.D.tips || [];
    const groups = U.groupBy(tips, t => t.group);
    const order = ['reading', 'eliminating', 'multi-response', 'timing', 'domain', 'logistics'];
    return `${order.filter(g => groups[g]).map(g => `<div class="section-title"><h2>${esc(g[0].toUpperCase() + g.slice(1))}</h2><span class="aside">${groups[g].length}</span></div>
      <div class="grid2">${groups[g].map(t => `<div class="callout tip"><div class="ct">${UI.badge(t.source === 'Official' ? 'official' : t.source === 'Community' ? 'community' : 'derived')} ${esc(t.phase || '')}</div><p><b>${inl(t.text)}</b></p><p class="small muted" style="margin-top:4px">${inl(t.why)}</p>${(t.traps || []).length ? `<div class="row" style="margin-top:6px">${t.traps.map(c => UI.trapChip(c)).join('')}</div>` : ''}</div>`).join('')}</div>`).join('')}`;
  }

  V.render = p => {
    if (p.parts[1]) return detail(p.parts[1]);
    const S = CP.store.S, B = CP.bank;
    const tab = p.q.tab || 'atlas';
    const stats = CP.nba.trapStats(S);
    const fams = U.groupBy(B.D.traps || [], t => t.family);
    const byFam = Object.keys(FAM).map(f => {
      const ts = fams[f] || []; if (!ts.length) return '';
      const ex = ts.reduce((s, t) => s + ((stats[t.code] || {}).exposed || 0), 0), fe = ts.reduce((s, t) => s + ((stats[t.code] || {}).fell || 0), 0);
      return `<div class="section-title"><h2>${esc(FAM[f])}</h2><span class="aside">${ex ? `you picked these ${fe} of ${ex} times offered` : ''}</span></div>
        <div class="grid3">${ts.map(t => { const s = stats[t.code]; return `<a class="card" href="#/traps/${esc(t.code)}" style="text-decoration:none;color:inherit;display:block">
          <div class="spread"><span class="mono" style="color:var(--trap);font-weight:500">${esc(t.code)}</span>${s && s.exposed >= 5 ? `<span class="chip ${s.rate >= 0.4 ? 'bad' : s.rate >= 0.25 ? 'warn' : 'good'}" title="You picked this trap ${Math.round(s.rate * 100)}% of the times it was offered">${Math.round(s.rate * 100)}% picked</span>` : ''}</div>
          <h3 style="font-size:var(--fs-ui);margin-top:4px">${esc(t.name)}</h3><p class="small muted" style="margin-top:4px">${inl(t.antidote)}</p></a>`; }).join('')}</div>`;
    }).join('');
    return `<div class="pagehead"><h1>Traps &amp; tips</h1><p>Every wrong option in the bank carries one of these ${(B.D.traps || []).length} codes. When you miss an item, the feedback names the trap you chose, so you learn the error rather than the question.</p>
      <div class="seg" style="margin-top:12px">${[['atlas', 'Trap atlas'], ['tips', 'Tips (' + (B.D.tips || []).length + ')']].map(([k, l]) => `<button type="button" data-act="go" data-route="#/traps${k === 'atlas' ? '' : '?tab=tips'}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div></div>
      ${tab === 'tips' ? tipsTab() : byFam}`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
