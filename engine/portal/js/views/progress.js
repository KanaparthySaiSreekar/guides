/* progress: objective heatmap, trap tendency, mock trend, calibration, activity, sessions. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc;
  const V = CP.views.progress = {};
  V.title = () => 'Progress';
  V.wide = true;

  V.render = () => {
    const S = CP.store.S, B = CP.bank, now = Date.now();
    const M = CP.mastery.all(S, now), R = CP.ready.compute(S, now);
    const heat = B.domains.map(d => `<div class="card flat dl" data-d="${d.n}" style="padding:10px 12px"><div class="cap faint" style="margin-bottom:6px">D${d.n} ${esc(d.short)}</div>
      <div class="row" style="gap:6px">${B.objs.filter(o => o.domain === d.n).map(o => { const m = M[o.id]; return `<a class="chip ${m.state === 'mastered' ? 'good' : m.state === 'practised' ? 'acc' : m.state === 'learning' ? '' : m.state === 'rusty' ? 'flag' : ''}" href="#/guide/d${d.n}/${esc(o.id)}" title="${esc(o.short)}: ${CP.mastery.LABEL[m.state]}"><span aria-hidden="true">${CP.mastery.ICON[m.state]}</span>${esc(o.id)}<span class="sr-only"> ${CP.mastery.LABEL[m.state]}</span></a>`; }).join('')}</div></div>`).join('');
    const counts = {}; Object.values(M).forEach(m => { counts[m.state] = (counts[m.state] || 0) + 1; });
    // trap tendency by family
    const ts = CP.nba.trapStats(S), fam = {};
    for (const t of B.D.traps || []) { const s = ts[t.code]; if (!s) continue; const f = fam[t.family] || (fam[t.family] = { e: 0, f: 0 }); f.e += s.exposed; f.f += s.fell; }
    const famRows = Object.entries(fam).filter(([, v]) => v.e).sort((a, b) => b[1].f / b[1].e - a[1].f / a[1].e);
    // mocks trend
    const mocks = S.sessions.filter(s => ['form', 'adaptive', 'half'].includes(s.kind) && s.state === 'submitted');
    // calibration from first attempts
    const cal = { 2: [0, 0], 1: [0, 0], 0: [0, 0] };
    for (const r of Object.values(S.items)) if (r.first && cal[r.first.conf]) { cal[r.first.conf][0] += r.first.ok; cal[r.first.conf][1]++; }
    // activity last 28 days
    const days = {}; for (const r of Object.values(S.items)) for (const h of r.h || []) { const k = U.isoDay(h[0]); days[k] = (days[k] || 0) + 1; }
    const act = []; for (let i = 27; i >= 0; i--) { const k = U.isoDay(now - i * 86400000); act.push([k, days[k] || 0]); }
    const maxA = Math.max(1, ...act.map(a => a[1]));
    return `<div class="pagehead"><h1>Progress</h1><p>${Object.keys(S.items).length} items answered · ${counts.mastered || 0} objectives mastered, ${counts.practised || 0} practised, ${counts.learning || 0} learning, ${counts.unseen || 0} unseen${counts.rusty ? `, ${counts.rusty} rusty` : ''}.</p></div>
      <div class="section-title"><h2>Objective map</h2><span class="aside">○ unseen ◔ learning ◑ practised ● mastered ◐ rusty</span></div>
      <div class="grid2">${heat}</div>
      <div class="grid2" style="margin-top:14px">
        <section class="card"><h2 style="font-size:var(--fs-h3)">Readiness evidence</h2>
          <p class="small" style="margin-top:6px"><b>${esc(R.label)}</b>: estimated ${Math.round(R.P * 100)}% (80% interval ${Math.round(R.lo * 100)}–${Math.round(R.hi * 100)}%) from ${R.freshN} first attempts.</p>
          <div style="margin:12px 0">${UI.meter({ p: R.P, lo: R.lo, hi: R.hi, target: CP.ready.TARGET })}</div>
          <details class="acc"><summary>How readiness is computed</summary><div class="body"><ul class="small">
            <li>Only the first attempt at each item counts: sealed forms weigh 1.0, adaptive/half mocks 0.8, drills and guide checks 0.6. Repeats, reviews, retakes, official samples and bridge items weigh 0.</li>
            <li>Older evidence fades with a 30-day half-life. A correct answer marked "Guessing" counts half.</li>
            <li>Each domain gets a Beta(2,2) prior; the overall estimate weights domains 17/13/19/16/14/14/7 and carries an 80% interval.</li>
            <li>States: Insufficient (fewer than 60 fresh answers or 5 in any domain), Not yet, Borderline, On track (all gates clear and a sealed form taken), Ready (two sealed forms at 76%+ within time, latest in the last 14 days).</li>
            <li>Anthropic does not publish the raw-to-scaled curve. 720 is a scaled, criterion-referenced cut, not 72%. The 76% target leaves a margin.</li></ul></div></details>
        </section>
        <section class="card"><h2 style="font-size:var(--fs-h3)">Trap tendency</h2>
          ${famRows.length ? `<table class="tbl" style="margin-top:8px"><tbody>${famRows.map(([f, v]) => `<tr><td>${esc(f[0] + f.slice(1).toLowerCase())}</td><td class="r num">${v.f}/${v.e}</td><td style="width:40%">${UI.bar(v.f / v.e)}</td></tr>`).join('')}</tbody></table><p class="cap faint" style="margin-top:6px">How often you picked a trap option when one of that family was offered.</p>` : '<p class="small muted" style="margin-top:6px">No data yet.</p>'}
          <p style="margin-top:10px"><a href="#/traps">Trap atlas</a></p></section>
      </div>
      <div class="grid2" style="margin-top:14px">
        <section class="card"><h2 style="font-size:var(--fs-h3)">Mocks</h2>
          ${mocks.length ? `<table class="tbl" style="margin-top:8px"><tbody>${mocks.map(s => `<tr><td><a href="#/r/${s.id}">${esc(s.label)}</a>${s.retake ? ' <span class="chip">retake</span>' : ''}</td><td class="nowrap faint">${esc(U.fmtDate(s.startedAt))}</td><td class="r num">${Math.round(s.result.pct * 100)}%</td><td style="width:30%">${UI.bar(s.result.pct)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted" style="margin-top:6px">No mocks yet.</p>'}</section>
        <section class="card"><h2 style="font-size:var(--fs-h3)">Confidence calibration</h2>
          ${cal[2][1] + cal[1][1] + cal[0][1] ? `<table class="tbl" style="margin-top:8px"><tbody>${[[2, 'Sure'], [1, 'Think so'], [0, 'Guessing']].map(([k, l]) => `<tr><td>${l}</td><td class="r num">${cal[k][1] ? Math.round(cal[k][0] / cal[k][1] * 100) + '%' : '–'}</td><td class="r faint">${cal[k][1]} answers</td></tr>`).join('')}</tbody></table><p class="cap faint" style="margin-top:6px">Well calibrated: "Sure" well above "Guessing". A high error rate on "Sure" marks hidden gaps.</p>` : '<p class="small muted" style="margin-top:6px">Rate your confidence before checking answers in tutor mode to see this.</p>'}</section>
      </div>
      <section class="card" style="margin-top:14px"><h2 style="font-size:var(--fs-h3)">Last 28 days</h2>
        <div role="img" aria-label="Items answered per day over the last 28 days" style="display:grid;grid-template-columns:repeat(28,1fr);gap:3px;margin-top:10px;align-items:end;height:64px">${act.map(([k, n]) => `<span title="${k}: ${n}" style="display:block;height:${Math.max(3, n / maxA * 64)}px;border-radius:2px;background:${n ? 'var(--accent)' : 'var(--surface-3)'}"></span>`).join('')}</div>
        <p class="cap faint" style="margin-top:6px">${act.reduce((s, a) => s + a[1], 0)} answers in 28 days.</p></section>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
