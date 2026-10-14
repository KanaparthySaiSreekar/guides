/* guide: domain study pages. Each objective runs pretest → rule → core → cues → worked → faded → traps → contrast → explain → check. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc, inl = U.inl;
  const V = CP.views.guide = {};
  V.title = p => p.parts[1] ? `D${p.parts[1].slice(1)} ${UI.dname(p.parts[1].slice(1))}` : 'Study guide';
  V.wide = true;
  V.keepFocus = p => !!p.parts[2];

  const cueTable = rows => rows.length ? `<div class="cue" role="table" aria-label="Signal, choose, not">
    <div class="ch" role="row"><div role="columnheader">Signal in the stem</div><div role="columnheader">Choose</div><div role="columnheader">Not</div></div>
    ${rows.map(r => `<div class="cr" role="row"><div class="s" role="cell">${inl(r.signal)}</div><div class="a" role="cell">${inl(r.choose)}</div><div class="n" role="cell">${inl(r.not)} ${UI.trapChip(r.trap)}</div>${r.unless ? `<div class="u" role="cell">Unless: ${inl(r.unless)}</div>` : ''}</div>`).join('')}</div>` : '';

  const trapCard = code => {
    const t = CP.bank.traps.get(code); if (!t) return '';
    return `<div class="callout trapc"><div class="ct">${UI.icon('warning-diamond')}<span class="mono">${esc(t.code)}</span> ${esc(t.name)}</div><p class="small"><b>Tell:</b> ${(t.tell || []).map(inl).join(' · ')}</p>
      <p class="small" style="margin-top:4px"><b>Counter-rule:</b> ${inl(t.counter)}</p><p class="small muted" style="margin-top:4px"><b>When it is actually right:</b> ${inl(t.rightWhen)}</p></div>`;
  };

  const vignette = (v, kind, key) => {
    const L = 'ABCD';
    if (kind === 'worked') return `<div class="vignette"><div class="vt">${UI.icon('ruler')}Worked example</div><p>${inl(v.scenario)}</p><p style="margin-top:8px"><b>${inl(v.ask)}</b></p>
      <ol type="A" style="margin-top:6px">${v.options.map(o => `<li>${inl(o.text)}</li>`).join('')}</ol>
      <ol style="margin-top:10px">
        <li><b>Constraint.</b> ${inl(v.steps.constraint)}</li><li><b>Classify.</b> ${inl(v.steps.classify)}</li>
        <li><b>Eliminate.</b> ${inl(v.steps.eliminate)}</li><li><b>Choose.</b> ${inl(v.steps.choose)} <span class="chip good" style="margin-left:4px">Answer ${L[v.options.findIndex(o => o.correct)]}</span></li></ol></div>`;
    const st = CP.store.S.notes['faded:' + key];
    return `<div class="vignette faded" data-faded="${esc(key)}"><div class="vt">${UI.icon('highlighter')}Your turn</div><p>${inl(v.scenario)}</p><p style="margin-top:8px"><b>${inl(v.ask)}</b></p>
      <ol style="margin-top:8px"><li><b>Constraint (given).</b> ${inl(v.constraint)}</li><li><b>Classify (given).</b> ${inl(v.classify)}</li><li><b>Eliminate and choose:</b> your move.</li></ol>
      <fieldset class="opts" style="margin-top:10px"><legend class="sr-only">Pick the answer</legend>
      ${v.options.map((o, i) => { const picked = st && st.pick === i; const done = !!st; let cls = 'opt'; if (done && o.correct) cls += ' ok'; else if (done && picked) cls += ' no'; else if (picked) cls += ' sel';
        return `<label class="${cls}"><input type="radio" name="fd-${esc(key)}" ${picked ? 'checked' : ''} ${done ? 'disabled' : ''} data-act="fadedpick" data-key="${esc(key)}" data-i="${i}"><span class="L">${L[i]}</span><span class="tx">${inl(o.text)}${done ? `<span class="why">${o.correct ? '' : `<span class="mono" style="color:var(--trap);font-weight:650">${esc(o.trap || '')}</span> `}${inl(o.why || '')}</span>` : ''}</span></label>`; }).join('')}
      </fieldset>
      ${st ? `<div class="callout ${v.options[st.pick] && v.options[st.pick].correct ? 'goodc' : 'badc'}" style="margin-top:10px"><div class="ct">Model reasoning</div><p>${inl(v.reasoning)}</p></div>` : ''}</div>`;
  };

  // Embedded pool item (pretest / check)
  function gq(it, role, obj) {
    if (!it) return '';
    const S = CP.store.S, r = S.items[it.id];
    const pend = V._sel[it.id] || [];
    const answered = !!(r && r.h && r.h.length);
    const lastSel = answered ? String(r.h[r.h.length - 1][5] || '').split('').filter(Boolean) : pend;
    const held = role === 'pretest' && answered && !(S.guide[obj] && S.guide[obj].preRevealed);
    const title = role === 'pretest' ? 'Pretest: answer before you read' : 'Check: retrieval practice';
    return `<div class="gq" id="gq-${esc(it.id)}"><div class="gqh">${UI.icon(role === 'pretest' ? 'magnifying-glass' : 'check-circle')}${esc(title)}${it.type === 'multi' ? `<span class="chip acc">Select ${it.select}</span>` : ''}</div>
      ${UI.stem(it, answered && !held)}
      ${UI.options(it, { sel: lastSel, done: answered && !held, name: 'gq' + it.id.replace(/\W/g, '') })}
      ${answered ? (held ? `<p class="small muted" style="margin-top:10px">Answer recorded. The explanation appears after the contrast below, once you have read the section.</p>` : UI.feedback(it, lastSel))
        : `<div class="btnrow" style="margin-top:10px"><button class="btn primary sm" data-act="gqcheck" data-q="${esc(it.id)}" data-obj="${esc(obj)}" ${pend.length === it.select ? '' : 'disabled'}>Check</button><span class="cap faint">Counts as a first attempt.</span></div>`}
    </div>`;
  }
  V._sel = {};

  function section(o, g, sec) {
    const S = CP.store.S, B = CP.bank;
    const m = CP.mastery.obj(S, o.id);
    const rows = B.D.cheat.rows.filter(r => r.obj === o.id);
    const prim = B.primaryRule.get(o.id);
    const pool = B.items.filter(it => it.obj === o.id && it.set === 'pool').sort((a, b) => a.id < b.id ? -1 : 1);
    const pre = pool[0], chk = pool[1];
    const rate = S.self[o.id] && S.self[o.id].r;
    const misses = prim ? B.items.filter(it => it.rule === prim.id && S.items[it.id] && S.items[it.id].h.length && S.items[it.id].h[S.items[it.id].h.length - 1][1] < 1).length : 0;
    const read = S.guide[o.id] && S.guide[o.id].read;
    const preAnswered = pre && S.items[pre.id] && S.items[pre.id].h.length;
    const sx = S.notes['explain:' + o.id];
    return `<section class="objsec" data-d="${o.domain}" id="o-${esc(o.id)}" aria-labelledby="h-${esc(o.id)}">
      <div class="oh"><div><div class="oid">${esc(o.id)} <span class="faint">· study numbering</span></div><h2 id="h-${esc(o.id)}" style="margin-top:4px">${esc(o.short)}</h2></div>
        <div class="row">${UI.mchip(m)}${read ? '<span class="chip good">✓ Studied</span>' : ''}</div></div>
      <blockquote class="official">Official objective: “${esc(o.text)}”</blockquote>
      ${sec ? '' : '<p class="muted">This section is still being written.</p>'}
      ${pre ? gq(pre, 'pretest', o.id) : ''}
      ${prim ? `<div class="callout rule"><div class="ct">${UI.icon('ruler')}Rule <span class="faint" style="font-weight:500">${esc(prim.id)}</span>${misses ? ` <span class="chip bad" style="height:22px">missed ×${misses}</span>` : ''}</div><p><b>${inl(prim.rule)}</b></p></div>` : ''}
      ${sec ? `<h3>Core idea</h3><ul>${sec.core.map(c => `<li>${inl(c)}</li>`).join('')}</ul>` : ''}
      ${rows.length ? `<h3>Cue rows</h3>${cueTable(rows)}` : ''}
      ${sec && sec.worked ? vignette(sec.worked, 'worked') : ''}
      ${sec && sec.faded ? vignette(sec.faded, 'faded', o.id) : ''}
      ${sec && sec.traps ? `<h3>Traps here</h3><div class="stack-sm">${sec.traps.map(trapCard).join('')}</div>` : ''}
      ${sec && sec.contrast ? `<h3>Contrast</h3><div class="contrast"><div><h4>${inl(sec.contrast.a.title)}</h4><p class="small">${inl(sec.contrast.a.text)}</p></div><div><h4>${inl(sec.contrast.b.title)}</h4><p class="small">${inl(sec.contrast.b.text)}</p></div></div><p class="small" style="margin-top:8px"><b>Decider:</b> ${inl(sec.contrast.decider)}</p>` : ''}
      ${preAnswered && !(S.guide[o.id] && S.guide[o.id].preRevealed) ? `<div class="btnrow" style="margin-top:14px"><button class="btn sm" data-act="prereveal" data-obj="${esc(o.id)}">Reveal the pretest explanation</button></div>` : ''}
      ${sec && sec.explain ? `<h3>Explain it</h3><div class="field"><label for="sx-${esc(o.id)}">${inl(sec.explain.prompt)}</label>
        <textarea class="input" id="sx-${esc(o.id)}" data-sx="${esc(o.id)}" placeholder="Write two or three sentences in your own words.">${esc((sx && sx.text) || '')}</textarea></div>
        ${sx && sx.shown ? `<div class="callout tip" style="margin-top:10px"><div class="ct">${UI.icon('lightbulb')}Model answer</div><p>${inl(sec.explain.model)}</p>
          <div class="btnrow" style="margin-top:8px"><span class="small muted">How close were you?</span><div class="seg">${['match', 'part', 'miss'].map(k => `<button type="button" data-act="sxgrade" data-obj="${esc(o.id)}" data-g="${k}" aria-pressed="${sx.grade === k}">${{ match: 'Matched', part: 'Partly', miss: 'Missed' }[k]}</button>`).join('')}</div></div></div>`
          : `<div class="btnrow" style="margin-top:8px"><button class="btn sm" data-act="sxshow" data-obj="${esc(o.id)}">Show the model answer</button></div>`}` : ''}
      ${chk ? gq(chk, 'check', o.id) : ''}
      ${sec && sec.bridge ? `<div class="callout tip"><div class="ct">${UI.icon('graduation-cap')}Foundations bridge</div><p class="small">${inl(sec.bridge)}</p></div>` : ''}
      <div class="btnrow" style="margin-top:16px">
        <button class="btn${read ? '' : ' primary'}" data-act="studied" data-obj="${esc(o.id)}">${read ? 'Studied ✓' : 'Mark studied'}</button>
        <button class="btn" data-act="start" data-kind="objective" data-obj="${esc(o.id)}">Prove it (drill)</button>
        <span class="small muted">Re-rate:</span><div class="seg" role="group" aria-label="Self-rating">${['R', 'Y', 'G'].map(k => `<button type="button" data-act="rate" data-obj="${esc(o.id)}" data-r="${k}" aria-pressed="${rate === k}">${{ R: 'Red', Y: 'Yellow', G: 'Green' }[k]}</button>`).join('')}</div>
      </div>
    </section>`;
  }

  function domainPage(n) {
    const S = CP.store.S, B = CP.bank, D = B.D;
    const d = B.domains.find(x => x.n === n); if (!d) return '<p>Unknown domain.</p>';
    const g = (D.guide || {})[n] || null;
    const secs = new Map(((g && g.sections) || []).map(s => [s.obj, s]));
    const objs = B.objs.filter(o => o.domain === n);
    const R = CP.ready.compute(S), x = R.dom[n];
    const dmeta = (D.cheat.domains || {})[n] || {};
    const lads = (D.ladders || []).filter(l => (l.domains || []).includes(n));
    const next = B.domains.find(y => y.n === (n % 7) + 1);
    return `<div class="guide-layout"><div>
      <div class="pagehead" data-d="${n}"><div class="row"><span class="dm"></span><span class="cap faint">Domain ${n} · ${d.weight}% · about ${d.formQuota} of 63 items · ${objs.length} objectives</span></div>
        <h1 style="margin-top:6px">${esc(d.name)}</h1>
        <p>${x.n ? `Your estimate: ${Math.round(x.p * 100)}% · about ${x.miss.toFixed(1)} expected misses of ${d.formQuota}.` : 'No evidence yet for this domain.'} ${dmeta.what_it_rewards ? inl(dmeta.what_it_rewards) : ''}</p></div>
      <div class="prose">
        ${g ? `<p>${inl(g.intro)}</p><div class="callout"><div class="ct">Foundations → Professional</div><p>${inl(g.delta)}</p></div>` : '<p class="muted">The narrative for this domain is not in this build. The rules, cue rows and trap cards below are complete.</p>'}
        <details class="acc" style="margin-top:14px"><summary>All ${D.cheat.rows.filter(r => r.d === n).length} cue rows for D${n}</summary><div class="body">${cueTable(D.cheat.rows.filter(r => r.d === n))}</div></details>
        ${lads.length ? `<details class="acc"><summary>Decision ladders used here (${lads.length})</summary><div class="body">${lads.map(l => `<h4 style="margin-top:12px">${esc(l.name)}</h4><p class="oneline">${inl(l.oneLine)}</p><ol class="ladder" style="margin-top:6px">${l.rungs.map(r => `<li><b>${inl(r.step)}</b> ${inl(r.use_when)}<span class="cl">Climb only if: ${inl(r.climb_if)}</span></li>`).join('')}</ol>`).join('')}</div></details>` : ''}
        ${objs.map(o => section(o, g, secs.get(o.id))).join('')}
        <section class="objsec"><h2>Close</h2>
          ${g && g.case ? `<div class="callout"><div class="ct">Meridian Mutual running case</div><p>${inl(g.case)}</p></div>` : ''}
          ${dmeta.remember3 ? `<h3>If you only remember three things</h3><ol>${dmeta.remember3.map(t => `<li>${inl(t)}</li>`).join('')}</ol>` : ''}
          <h3>Objective → rule</h3><div class="tblwrap"><table class="tbl"><tbody>${objs.map(o => { const r = B.primaryRule.get(o.id); return `<tr><td class="nowrap"><a href="#/guide/d${n}/${esc(o.id)}">${esc(o.id)}</a></td><td>${r ? inl(r.rule) : ''}</td></tr>`; }).join('')}</tbody></table></div>
          <div class="btnrow" style="margin-top:14px"><button class="btn primary" data-act="start" data-kind="domain" data-d="${n}">Domain ${n} drill</button><a class="btn" href="#/cheat?d=${n}">Cheat-sheet block</a>${next ? `<a class="btn quiet" href="#/guide/d${next.n}">Next: D${next.n} ${esc(next.short)}</a>` : ''}</div>
        </section>
      </div></div>
      <nav class="toc" data-d="${n}" aria-label="On this page"><div class="t"><span class="dm"></span>D${n} ${esc(d.short)}</div>${objs.map(o => `<a href="#/guide/d${n}/${esc(o.id)}" data-o="${esc(o.id)}">${esc(o.id)}<span class="toc-s"> ${esc(o.short)}</span></a>`).join('')}</nav></div>`;
  }

  function index() {
    const S = CP.store.S, B = CP.bank, D = B.D, R = CP.ready.compute(S);
    const cs = D.caseStudy || {};
    return `<div class="pagehead"><h1>Study guide</h1><p>Seven domain pages, one section per official objective. Each section follows the same loop: pretest, rule, core idea, cue rows, a worked example, a faded example for high-yield objectives, trap cards, a contrast pair, a self-explanation and a check question.</p></div>
      <div class="grid2">${B.domains.map(d => {
        const objs = B.objs.filter(o => o.domain === d.n);
        const read = objs.filter(o => S.guide[o.id] && S.guide[o.id].read).length;
        const x = R.dom[d.n];
        return `<a class="tile" data-d="${d.n}" href="#/guide/d${d.n}">
          <div class="spread"><span class="tic" style="font-weight:700;font-size:15px">D${d.n}</span><span class="chip">${d.weight}% of the exam</span></div>
          <h2 style="font-size:var(--fs-h3);margin-top:6px">${esc(d.name)}</h2><p class="meta">About ${d.formQuota} of 63 items, ${objs.length} objectives, ${read} studied</p>
          <p class="small muted" style="margin-top:4px">${inl(((D.cheat.domains || {})[d.n] || {}).what_it_rewards || '')}</p>
          <div style="margin-top:10px">${UI.bar(x.n ? x.p : 0, d.n)}</div><p class="cap faint" style="margin-top:4px">${x.n ? 'Estimate ' + Math.round(x.p * 100) + '%' : 'No evidence yet'}</p></a>`;
      }).join('')}</div>
      ${cs.name ? `<div class="section-title"><h2>${UI.icon('compass-tool')}The running case</h2></div><div class="card"><h3>${esc(cs.name)}</h3><p class="muted" style="margin-top:4px">${inl(cs.oneLine || '')}</p><p class="small" style="margin-top:8px">${inl(cs.company || '')}</p>
        <details class="acc" style="margin-top:12px"><summary>People and systems</summary><div class="body"><div class="grid2">
          <ul>${(cs.people || []).map(p => `<li><b>${esc(p.name)}</b>, ${esc(p.role)}: ${inl(p.cares_about)}</li>`).join('')}</ul>
          <ul>${(cs.systems || []).map(s => `<li><b>${esc(s.name)}</b>: ${inl(s.role)}</li>`).join('')}</ul></div></div></details></div>` : ''}
      <div class="section-title"><h2>${UI.icon('graduation-cap')}What changes from Foundations</h2></div>
      <div class="card"><ul>${((D.exam && D.exam.explainer27 && D.exam.explainer27.compare) || []).map(c => `<li><b>${esc(c.aspect)}:</b> CCAR-F ${esc(c.ccarf)} → CCAR-P ${esc(c.ccarp)}</li>`).join('')}</ul></div>`;
  }

  V.render = p => {
    const dn = p.parts[1] ? +p.parts[1].replace(/\D/g, '') : null;
    return dn ? domainPage(dn) : index();
  };
  V.after = (root, p) => {
    const obj = p.parts[2];
    if (obj) { const el = document.getElementById('o-' + obj); if (el && !V._noScroll) { el.scrollIntoView({ block: 'start' }); const h = el.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } } }
    V._noScroll = false;
    if (V._io) V._io.disconnect();
    const tocA = root.querySelectorAll('.toc a[data-o]');
    if (tocA.length && 'IntersectionObserver' in window) {
      V._io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { const id = e.target.id.slice(2); tocA.forEach(a => a.setAttribute('aria-current', a.dataset.o === id ? 'true' : 'false')); } }, { rootMargin: '-20% 0px -70% 0px' });
      root.querySelectorAll('.objsec[id]').forEach(s => V._io.observe(s));
    }
    root.querySelectorAll('textarea[data-sx]').forEach(t => t.addEventListener('input', () => {
      const S = CP.store.S, k = 'explain:' + t.dataset.sx; S.notes[k] = Object.assign(S.notes[k] || {}, { text: t.value }); CP.store.saveSoon();
    }));
    if (V._scrollTo) { const el = document.getElementById(V._scrollTo); if (el) el.scrollIntoView({ block: 'center' }); V._scrollTo = null; }
  };
  const refresh = anchor => { V._noScroll = true; V._scrollTo = anchor || null; CP.router.render(true); };

  const A = CP.act;
  const prevPick = A.pick;
  A.pick = (el, e) => {
    const gqEl = el.closest && el.closest('.gq');
    if (!gqEl) return prevPick(el, e);
    const qid = gqEl.id.slice(3), it = CP.bank.get(qid), id = el.getAttribute('data-opt');
    let sel = (V._sel[qid] || []).slice();
    if (it.type === 'multi') { if (sel.includes(id)) sel = sel.filter(x => x !== id); else if (sel.length < it.select) sel.push(id); else { UI.toast(`Select ${it.select}: deselect one first.`); } }
    else sel = [id];
    V._sel[qid] = sel; refresh('gq-' + qid);
  };
  A.gqcheck = el => {
    const qid = el.dataset.q, it = CP.bank.get(qid), sel = V._sel[qid] || [];
    if (sel.length !== it.select) return;
    CP.score.record(CP.store.S, it, sel, { mode: 'T' });
    CP.store.save(); delete V._sel[qid]; refresh('gq-' + qid);
  };
  A.prereveal = el => { const S = CP.store.S; S.guide[el.dataset.obj] = Object.assign(S.guide[el.dataset.obj] || {}, { preRevealed: Date.now() }); CP.store.save(); refresh(); };
  A.fadedpick = el => { const S = CP.store.S; S.notes['faded:' + el.dataset.key] = { pick: +el.dataset.i, at: Date.now() }; CP.store.save(); refresh(); };
  A.sxshow = el => { const S = CP.store.S, k = 'explain:' + el.dataset.obj; S.notes[k] = Object.assign(S.notes[k] || {}, { shown: Date.now() }); CP.store.save(); refresh(); };
  A.sxgrade = el => { const S = CP.store.S, k = 'explain:' + el.dataset.obj; S.notes[k] = Object.assign(S.notes[k] || {}, { grade: el.dataset.g }); CP.store.save(); refresh(); };
  A.studied = el => { const S = CP.store.S, o = el.dataset.obj; S.guide[o] = Object.assign(S.guide[o] || {}, { read: (S.guide[o] && S.guide[o].read) ? null : Date.now() }); if (!S.guide[o].read) delete S.guide[o].read; CP.store.save(); refresh(); UI.announce('Saved'); };
  A.rate = el => { const S = CP.store.S, o = el.dataset.obj, r = el.dataset.r; const cur = S.self[o] || { hist: [] }; cur.r = r; cur.at = Date.now(); cur.hist = (cur.hist || []).concat([[r, Date.now()]]).slice(-10); S.self[o] = cur; CP.store.save(); CP.router.render(true); };
})(typeof window !== 'undefined' ? window : globalThis);
