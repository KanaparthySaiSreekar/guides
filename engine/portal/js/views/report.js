/* report: mirrors the official score report (pass likelihood, % by domain), then turns misses into next steps. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc;
  const V = CP.views.report = {};
  V.title = p => { const s = CP.sess.get(p.parts[1]); return s ? s.label + ' report' : 'Report'; };
  V.wide = true;

  V.render = p => {
    const S = CP.store.S, B = CP.bank;
    const s = CP.sess.get(p.parts[1]);
    if (!s) return `<div class="pagehead"><h1>Report not found</h1><p><a href="#/practice">Back to practice</a></p></div>`;
    if (s.state !== 'submitted') return `<div class="pagehead"><h1>${esc(s.label)} is still open</h1><p><a class="btn primary" href="#/s/${s.id}">Resume</a></p></div>`;
    if (!s.viewed) { s.viewed = Date.now(); CP.store.save(); }
    const r = s.result || CP.score.result(s, B.get);
    const isMock = ['form', 'adaptive', 'half'].includes(s.kind);
    const qids = s.qids.filter(q => !q.endsWith('#re'));
    const used = (s.endedAt - s.startedAt - (s.pausedMs || 0));
    const pct = r.pct;
    const band = pct >= 0.80 ? ['good', 'Comfortably above the practice target'] : pct >= CP.ready.TARGET ? ['good', 'Above the 76% practice target'] : pct >= 0.68 ? ['warn', 'Borderline: near the likely pass region'] : ['bad', 'Below the practice target'];
    const scaled = S.settings.showScaled && isMock ? CP.ready.scaledBand(pct) : null;

    const domRows = B.domains.map(d => {
      const x = r.dom[d.n]; if (!x) return '';
      const p2 = x[0] / x[1];
      return `<tr data-d="${d.n}"><td><span class="row" style="gap:8px"><span class="dm"></span>D${d.n} ${esc(UI.TINY[d.n] || d.short)}</span></td><td class="r num">${x[0]}/${x[1]}</td><td class="r num">${Math.round(p2 * 100)}%</td>
        <td class="barcell" style="width:30%">${UI.bar(p2, d.n)}</td>${isMock ? `<td class="r num">~${(d.formQuota * (1 - p2)).toFixed(1)} of ${d.formQuota}</td>` : ''}</tr>`;
    }).join('');
    const trapRows = Object.entries(r.traps).filter(([, t]) => t.fell).sort((a, b) => b[1].fell - a[1].fell).slice(0, 8);
    const objRows = Object.entries(r.obj).filter(([, x]) => x[0] < x[1]).sort((a, b) => (a[1][0] / a[1][1]) - (b[1][0] / b[1][1])).slice(0, 10);
    const slow = r.times.slice().sort((a, b) => b.ms - a.ms).slice(0, 5);
    const over3 = r.times.filter(t => t.ms > 180000).length;
    const conf = [2, 1, 0].filter(k => r.conf[k][1]).map(k => `${['Guessing', 'Think so', 'Sure'][k]}: ${r.conf[k][0]}/${r.conf[k][1]} (${Math.round(r.conf[k][0] / r.conf[k][1] * 100)}%)`).join(' · ');
    const items = qids.map((q, i) => {
      const it = B.get(q), a = s.ans[q] || { sel: [] };
      const ok = a.sel.length && CP.score.isCorrect(it, a.sel);
      return `<li><a href="#/s/${s.id}?i=${s.qids.indexOf(q)}"><span aria-hidden="true" style="width:18px;color:var(${ok ? '--good' : '--bad'})">${ok ? '✓' : '✕'}</span><span class="sr-only">${ok ? 'correct' : 'incorrect'}</span>
        <span class="num faint" style="width:28px">${i + 1}</span><span class="grow">${esc(it.stem.slice(0, 110))}${it.stem.length > 110 ? '…' : ''}</span><span class="meta">D${it.domain} · ${esc(it.obj)}${a.flag ? ' · ⚑' : ''}${a.sel.length ? '' : ' · unanswered'}</span></a></li>`;
    }).join('');

    return `<div class="pagehead"><h1>${esc(s.label)}: results</h1><p>${esc(U.fmtDateTime(s.startedAt))} · ${esc(U.fmtMin(used))}${s.pausedMs ? ' · paused ' + U.fmtMin(s.pausedMs) : ''}${s.retake ? ' · retake (not counted toward readiness)' : ''}</p></div>
      <section class="plate report-hero">
        <div class="spread"><div class="stat"><span class="v">${Math.round(pct * 100)}%</span><span class="l">${r.c} of ${r.t} correct${r.unanswered ? ` · ${r.unanswered} unanswered (counted wrong)` : ''}</span></div>
          ${isMock ? `<span class="chip ${band[0]}">${esc(band[1])}</span>` : ''}</div>
        ${isMock ? `<div style="margin-top:14px">${UI.meter({ p: pct, target: CP.ready.TARGET })}</div>
          <p class="cap faint" style="margin-top:8px">Practice result on this portal's items, not Anthropic's 100–1,000 scale. The real cut is a scaled 720 set by standard-setting; it is not 72%. ${s.meta && s.meta.fresh != null ? `Freshness: ${Math.round(s.meta.fresh * 100)}% of items were new to you.` : ''}</p>
          ${scaled ? `<p class="small" style="margin-top:6px">Illustrative scaled band (not Anthropic's curve): ${scaled[0]}–${scaled[2]}, midpoint ${scaled[1]}.</p>` : ''}` : ''}
        <div class="btnrow" style="margin-top:14px">
          <a class="btn primary" href="#/s/${s.id}?i=0">Review every item</a>
          ${objRows.length || trapRows.length ? `<button class="btn" data-act="start" data-kind="redo">Drill my misses</button>` : ''}
          <a class="btn quiet" href="#/practice">Back to practice</a></div>
      </section>
      <div class="grid2" style="margin-top:14px;align-items:start">
        <section class="card"><h2 style="font-size:var(--fs-h3)">By domain</h2>
          <table class="tbl" style="margin-top:8px"><thead><tr><th style="width:42%">Domain</th><th class="r">Correct</th><th class="r">%</th><th class="barcell"><span class="sr-only">Bar</span></th>${isMock ? '<th class="r">Exp. misses</th>' : ''}</tr></thead><tbody>${domRows}</tbody></table>
          <p class="cap faint" style="margin-top:8px">The official report also shows percent correct by domain. Use it diagnostically: a good average can hide a failing domain.</p></section>
        <section class="card"><h2 style="font-size:var(--fs-h3)">Traps that cost you points</h2>
          ${trapRows.length ? `<ul class="linklist" style="margin-top:10px">${trapRows.map(([c, t]) => `<li><span class="li"><span class="grow">${UI.trapChip(c)}<br>${esc((B.traps.get(c) || {}).name || '')}<br><span class="cap faint">picked ${t.fell} of ${t.exposed} times offered</span></span><button class="btn sm" data-act="start" data-kind="trap" data-code="${esc(c)}">Drill</button></span></li>`).join('')}</ul>` : '<p class="small muted" style="margin-top:6px">None. Every miss here was a different kind of error.</p>'}
        </section>
      </div>
      <div class="grid2" style="margin-top:14px;align-items:start">
        <section class="card"><h2 style="font-size:var(--fs-h3)">Objectives to fix first</h2>
          ${objRows.length ? `<ul class="linklist" style="margin-top:10px">${objRows.map(([o, x]) => { const ob = B.objById.get(o); return `<li><span class="li"><span class="grow"><b>${esc(o)}</b> ${esc(ob.short)}<br><span class="cap faint">${x[0]}/${x[1]} correct</span></span><a class="btn sm quiet" href="#/guide/d${ob.domain}/${esc(o)}">Reread</a><button class="btn sm" data-act="start" data-kind="objective" data-obj="${esc(o)}">Drill</button></span></li>`; }).join('')}</ul>` : '<p class="small muted" style="margin-top:6px">No misses.</p>'}
        </section>
        <section class="card stack-sm"><h2 style="font-size:var(--fs-h3)">Answer behaviour</h2>
          <p class="small">Single-answer: ${r.single[1] ? `${r.single[0]}/${r.single[1]} (${Math.round(r.single[0] / r.single[1] * 100)}%)` : '–'} · Multi-response: ${r.multi[1] ? `${r.multi[0]}/${r.multi[1]} (${Math.round(r.multi[0] / r.multi[1] * 100)}%)` : '–'}</p>
          ${r.flagged[1] ? `<p class="small">Flagged items: ${r.flagged[0]}/${r.flagged[1]} correct.</p>` : ''}
          ${r.changes.rw + r.changes.wr ? `<p class="small">Answer changes: ${r.changes.wr} wrong→right, ${r.changes.rw} right→wrong.${r.changes.rw > r.changes.wr ? ' Your first instinct was better this time.' : ''}</p>` : ''}
          ${conf ? `<p class="small">Confidence: ${esc(conf)}</p>` : ''}
          ${s.limitMs ? `<p class="small">Time: ${esc(U.fmtMin(used))} of ${esc(U.fmtMin(s.limitMs))}. ${over3 ? `${over3} item${over3 === 1 ? '' : 's'} took over 3 minutes.` : 'No item took over 3 minutes.'}</p>` : ''}
          ${slow.length && slow[0].ms ? `<p class="cap faint">Slowest: ${slow.map(t => `#${qids.indexOf(t.qid) + 1} (${U.fmtClock(t.ms)})`).join(', ')}</p>` : ''}
        </section>
      </div>
      <div class="section-title"><h2>Items</h2><span class="aside">Open any item for the full explanation</span></div>
      <ul class="linklist">${items}</ul>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
