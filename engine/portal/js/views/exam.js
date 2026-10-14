/* exam: format and logistics with source badges, the 27% explainer, pacing plan, countdown checklist, platform facts. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc, inl = U.inl;
  const V = CP.views.exam = {};
  V.title = () => 'Exam facts';
  V.wide = true;

  V.render = () => {
    const D = CP.bank.D, E = D.exam || {}, X = E.explainer27 || {};
    const plat = D.platform || [];
    const facts = (E.facts || []).map(f => `<tr><td class="nowrap"><b>${esc(f.key)}</b></td><td>${inl(f.value)}${f.note ? `<div class="cap faint" style="margin-top:3px">${inl(f.note)}</div>` : ''}</td><td><div>${UI.badge(f.label)}</div><div class="cap faint src">${esc(f.source)}</div></td></tr>`).join('');
    return `<div class="pagehead"><h1>Exam facts &amp; exam day</h1><p>Every fact carries its source: <span class="badge official">Official</span> exam guide, FAQ or Skilljar data; <span class="badge docs">Docs</span> verified in product docs and dated; <span class="badge community">Community</span> passer or vendor reports; <span class="badge conflict">Sources disagree</span> with the safe action.</p></div>
      <div class="tblwrap"><table class="tbl facts"><thead><tr><th>Fact</th><th>Value</th><th>Source</th></tr></thead><tbody>${facts}</tbody></table></div>

      <section id="why27" style="scroll-margin-top:24px">
        <div class="section-title"><h2>${esc(X.headline || 'Why you may have seen 27%')}</h2></div>
        <div class="grid2"><div class="prose" style="font-size:var(--fs-ui)">${(X.paragraphs || []).map(p => `<p>${inl(p)}</p>`).join('')}</div>
          <div><div class="tblwrap"><table class="tbl"><thead><tr><th>Aspect</th><th>CCAR-F (Foundations)</th><th>CCAR-P (Professional)</th></tr></thead><tbody>${(X.compare || []).map(c => `<tr><td><b>${esc(c.aspect)}</b></td><td>${inl(c.ccarf)}</td><td>${inl(c.ccarp)}</td></tr>`).join('')}</tbody></table></div>
          <div class="callout warnc" style="margin-top:12px"><div class="ct">How to spot a Foundations trainer</div><ol>${(X.spot_checklist || []).map(s => `<li class="small">${inl(s)}</li>`).join('')}</ol></div></div></div>
      </section>

      <div class="grid2" style="margin-top:8px">
        <section><div class="section-title"><h2>Pacing plan</h2></div><div class="card"><p><b>${esc((E.pacing || {}).perItem || '')}</b></p>
          <ul>${((E.pacing || {}).checkpoints || []).map(c => `<li class="small">${inl(c)}</li>`).join('')}</ul><ul>${((E.pacing || {}).rules || []).map(c => `<li class="small">${inl(c)}</li>`).join('')}</ul></div></section>
        <section><div class="section-title"><h2>Countdown checklist</h2></div><div class="stack-sm">${(E.examDay || []).map(x => `<details class="acc"><summary>${esc(x.when)}</summary><div class="body"><ul>${x.items.map(i => `<li class="small">${inl(i)}</li>`).join('')}</ul></div></details>`).join('')}</div></section>
      </div>

      <section id="platform" style="scroll-margin-top:24px">
        <div class="section-title"><h2>Platform facts (checked Sep 2026)</h2><span class="aside">${plat.length} facts</span></div>
        <p class="small muted" style="margin-bottom:10px">Checked against primary docs on 2026-09-24. Product details change; the exam rewards the principle, which is shown first. No sealed-form key depends on a version-sensitive detail.</p>
        <div class="stack-sm">${plat.map(f => `<details class="acc"><summary><span class="mono cap faint">${esc(f.id)}</span> ${esc(f.topic)} ${UI.badge(f.label === 'docs' ? 'docs' : f.label)}${f.volatile ? ' <span class="badge">volatile</span>' : ''}</summary>
          <div class="body"><p class="small"><b>Principle:</b> ${inl(f.principle || '')}</p><p class="small" style="margin-top:6px">${inl(f.text)}</p><p class="cap faint mono" style="margin-top:6px;overflow-wrap:anywhere">${esc(f.source)}</p></div></details>`).join('')}</div>
      </section>`;
  };
  V.after = (root, p) => { if (p.q.anchor) { const el = document.getElementById(p.q.anchor); if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 30); } };
})(typeof window !== 'undefined' ? window : globalThis);
