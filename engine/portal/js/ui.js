/* ui: shared components, modal/toast, global action delegation. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const UI = CP.ui = {};
  const U = CP.U;
  const esc = U.esc, inl = U.inl;

  UI.$ = (sel, root) => (root || document).querySelector(sel);
  UI.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  UI.announce = msg => { const el = UI.$('#sr'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); } };

  UI.toast = (msg, ms) => {
    const el = UI.$('#toast'); if (!el) return;
    el.innerHTML = `<div class="t">${esc(msg)}</div>`;
    clearTimeout(UI._tt); UI._tt = setTimeout(() => { el.innerHTML = ''; }, ms || 2600);
  };

  // Modal with focus trap; resolves with the action id (or null on dismiss).
  UI.modal = ({ title, body, actions, wide }) => new Promise(resolve => {
    const root = UI.$('#modal-root');
    const prev = document.activeElement;
    const acts = actions || [{ id: 'ok', label: 'OK', primary: true }];
    root.innerHTML = `<div class="veil" data-veil><div class="dialog${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
      <h2 id="dlg-h" tabindex="-1">${esc(title)}</h2><div class="dlg-body">${body || ''}</div>
      <div class="btnrow">${acts.map(a => `<button class="btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}" data-mid="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div></div></div>`;
    const dlg = UI.$('.dialog', root);
    const close = v => { root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if (e.key === 'Tab') {
        const f = UI.$$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', dlg).filter(x => !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    root.querySelector('[data-veil]').addEventListener('click', e => {
      const b = e.target.closest('[data-mid]');
      if (b) { const v = b.getAttribute('data-mid'); const read = acts.find(a => a.id === v); close(read && read.read ? read.read(dlg) || v : v); }
      else if (e.target.hasAttribute('data-veil')) close(null);
    });
    const firstBtn = UI.$('[data-mid]', dlg) || UI.$('#dlg-h', dlg);
    setTimeout(() => (UI.$('input,textarea', dlg) || firstBtn).focus(), 20);
    UI._dlg = dlg;
  });
  UI.confirm = (title, body, yes, danger) => UI.modal({ title, body: `<p>${body}</p>`, actions: [{ id: 'no', label: 'Cancel' }, { id: 'yes', label: yes || 'Continue', primary: !danger, danger }] }).then(v => v === 'yes');

  UI.icon = (name, cls) => {
    const p = (CP.ICONS || {})[name]; if (!p) return '';
    return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 256 256" aria-hidden="true" focusable="false">${p.map(d => `<path d="${d}"/>`).join('')}</svg>`;
  };
  // Blueprint wheel: each domain's arc length is its exam weight; the filled part is your estimate.
  UI.wheel = (R, opts) => {
    opts = opts || {};
    const B = CP.bank, r = 84, C = 2 * Math.PI * r, gap = 5;
    let at = 0;
    const segs = B.domains.map(d => {
      const len = C * d.weight / 100, x = R.dom[d.n], p = x.n ? x.p : 0;
      const seg = { d, start: at, len: Math.max(0, len - gap), fill: Math.max(0, (len - gap) * p), p, n: x.n };
      at += len; return seg;
    });
    const anim = opts.animate;
    const arc = (s, cls, length) => `<circle class="${cls}" cx="100" cy="100" r="${r}" stroke="var(--d${s.d.n})" stroke-dasharray="${anim && cls === 'fil' ? '0 ' + C : length.toFixed(2) + ' ' + C.toFixed(2)}" ${cls === 'fil' ? `data-final="${length.toFixed(2)} ${C.toFixed(2)}"` : ''} stroke-dashoffset="${(-s.start).toFixed(2)}" transform="rotate(-90 100 100)"/>`;
    const ticks = []; for (let i = 0; i < 100; i++) { const a = i / 100 * 2 * Math.PI - Math.PI / 2, r1 = i % 10 === 0 ? 92 : 95; ticks.push(`<line class="tick${i % 10 === 0 ? ' major' : ''}" x1="${(100 + r1 * Math.cos(a)).toFixed(2)}" y1="${(100 + r1 * Math.sin(a)).toFixed(2)}" x2="${(100 + 98 * Math.cos(a)).toFixed(2)}" y2="${(100 + 98 * Math.sin(a)).toFixed(2)}"/>`); }
    const tgts = segs.map(s => { const a = (s.start + s.len * CP.ready.TARGET) / C * 2 * Math.PI - Math.PI / 2; return `<line class="tgt" x1="${(100 + (r - 8) * Math.cos(a)).toFixed(2)}" y1="${(100 + (r - 8) * Math.sin(a)).toFixed(2)}" x2="${(100 + (r + 8) * Math.cos(a)).toFixed(2)}" y2="${(100 + (r + 8) * Math.sin(a)).toFixed(2)}"/>`; }).join('');
    const center = R.freshN ? `<text class="ctr ctr-v" x="100" y="102" text-anchor="middle">${Math.round(R.P * 100)}%</text><text class="ctr ctr-l" x="100" y="124" text-anchor="middle">estimated</text>`
      : `<text class="ctr ctr-v" x="100" y="102" text-anchor="middle" style="font-size:26px">63</text><text class="ctr ctr-l" x="100" y="124" text-anchor="middle">items on exam day</text>`;
    const legend = segs.map(s => `<a href="#/guide/d${s.d.n}" data-d="${s.d.n}"><span class="dm"></span><span>${esc(UI.TINY[s.d.n] || s.d.short)}</span><span class="w">${s.d.weight}%</span><span class="p">${s.n ? Math.round(s.p * 100) + '%' : '<span class="faint">no data</span>'}</span></a>`).join('');
    return `<div class="wheel"><svg viewBox="0 0 200 200" role="img" aria-label="Exam blueprint: seven domains sized by weight, filled to your estimate">
      <circle class="ring" cx="100" cy="100" r="98"/>${ticks.join('')}${segs.map(s => arc(s, 'trk', s.len)).join('')}${segs.map(s => arc(s, 'fil', s.fill)).join('')}${tgts}${center}</svg>
      <div class="lg" aria-label="Domains, weight and your estimate">${legend}</div></div>`;
  };
  UI.TINY = { 1: 'Solution design', 2: 'Models & prompting', 3: 'Integration', 4: 'Evaluation', 5: 'Governance & risk', 6: 'Stakeholders', 7: 'Dev productivity' };
  UI.animateWheel = root => {
    const els = (root || document).querySelectorAll('.wheel .fil[data-final]');
    requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(e => e.setAttribute('stroke-dasharray', e.getAttribute('data-final')))));
  };

  // ---------- small components ----------
  UI.dname = d => { const x = CP.bank.domains.find(y => y.n === +d); return x ? x.name : ''; };
  UI.dshort = d => { const x = CP.bank.domains.find(y => y.n === +d); return x ? x.short : ''; };
  UI.dtag = d => `<span class="chip" data-d="${d}"><span class="dm"></span>D${d} ${esc(UI.dshort(d))}</span>`;
  UI.trapChip = (code, attr) => `<a class="chip trap" href="#/traps/${esc(code)}" ${attr || ''} title="${esc((CP.bank.traps.get(code) || {}).name || code)}">${esc(code)}</a>`;
  UI.badge = kind => {
    const L = { official: 'Official', 'official-ccarf': 'Official · CCAR-F guide', docs: 'Docs · as of 2026-09', community: 'Community · unverified', conflict: 'Sources disagree', bridge: 'Foundations bridge', heuristic: 'Heuristic', derived: 'Derived', unverifiable: 'Unverified' };
    const cls = { 'official-ccarf': 'official', heuristic: 'community', derived: 'docs', unverifiable: 'community' }[kind] || kind;
    return `<span class="badge ${esc(cls)}">${esc(L[kind] || kind)}</span>`;
  };
  UI.mchip = m => `<span class="ms m-${m.state}"><i aria-hidden="true">${CP.mastery.ICON[m.state]}</i>${CP.mastery.LABEL[m.state]}${m.n ? ` · ${Math.round(m.acc * 100)}% of ${m.n}` : ''}</span>`;
  UI.meter = ({ p, lo, hi, target, floors }) => {
    const pc = x => (U.clamp(x, 0, 1) * 100).toFixed(1) + '%';
    return `<div class="meter" role="img" aria-label="Estimate ${Math.round(p * 100)}%, 80% interval ${Math.round(lo * 100)} to ${Math.round(hi * 100)}%${target ? ', target ' + Math.round(target * 100) + '%' : ''}">
      ${lo != null ? `<span class="band" style="left:${pc(lo)};width:calc(${pc(hi)} - ${pc(lo)})"></span>` : ''}
      <span class="pt" style="left:${pc(p)}"></span>
      ${target ? `<span class="tgt" style="left:${pc(target)}" data-l="${Math.round(target * 100)}%" title="Target ${Math.round(target * 100)}%"></span>` : ''}
      ${(floors || []).map(f => `<span class="floor" style="left:${pc(f)}"></span>`).join('')}</div>`;
  };
  UI.bar = (p, d) => `<div class="bar"${d ? ` data-d="${d}"` : ''}><span style="width:${(U.clamp(p || 0, 0, 1) * 100).toFixed(1)}%"></span></div>`;

  // Highlight signal phrases (after answering).
  UI.mark = (text, signals) => {
    let html = inl(text);
    for (const s of (signals || []).slice().sort((a, b) => b.length - a.length)) {
      const e = esc(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!e) continue;
      html = html.replace(new RegExp('(' + e + ')(?![^<]*>)', 'i'), '<mark><span class="sr-only">signal: </span>$1</mark>');
    }
    return html;
  };

  // ---------- item rendering ----------
  // opts: {perm, sel, done, name, showWhy, strike:{}, compact}
  UI.options = (it, o) => {
    o = o || {};
    if (it.type === 'match') return UI.matchRows(it, o);
    const order = o.perm || it.options.map(x => x.id);
    const byId = new Map(it.options.map(x => [x.id, x]));
    const multi = it.type === 'multi';
    const name = o.name || ('q-' + it.id.replace(/[^a-z0-9]/gi, ''));
    const legend = `<legend class="sr-only">${esc(it.ask)}${multi ? ` Select ${it.select}.` : ''}</legend>`;
    const rows = order.map((id, i) => {
      const op = byId.get(id); if (!op) return '';
      const L = 'ABCDEF'[i];
      const checked = (o.sel || []).includes(id);
      let cls = 'opt', verdict = '';
      if (o.done) {
        cls += ' done';
        if (op.correct) { cls += ' ok'; verdict = `<span class="verdict">${UI.icon('check-circle')}Correct answer${checked ? ', your choice' : ''}</span>`; }
        else if (checked) { cls += ' no'; verdict = `<span class="verdict">${UI.icon('x-circle')}Your answer</span>`; }
      } else if (checked) cls += ' sel';
      if (o.strike && o.strike[id] && !o.done) cls += ' struck';
      const why = o.done && o.showWhy !== false && (op.why || op.trap) ? `<span class="why">${op.correct ? '' : (op.trap ? `<span class="code mono" style="color:var(--trap);font-weight:500">${esc(op.trap)}</span> ` : '')}${inl(op.why)}</span>` : '';
      return `<label class="${cls}" data-opt="${esc(id)}">
        <input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${esc(id)}" ${checked ? 'checked' : ''} ${o.done ? 'disabled' : ''} data-act="pick" data-opt="${esc(id)}">
        <span class="L" aria-hidden="true">${L}</span><span class="tx">${inl(op.text)}${verdict}${why}</span>
        ${!o.done && o.strikeOn ? `<button type="button" class="strike" data-act="strike" data-opt="${esc(id)}" aria-pressed="${o.strike && o.strike[id] ? 'true' : 'false'}" title="Strike out (may not exist on the real exam)">${o.strike && o.strike[id] ? 'Unstrike' : 'Strike'}</button>` : ''}
      </label>`;
    }).join('');
    return `<fieldset class="opts">${legend}${rows}</fieldset>`;
  };

  UI.matchRows = (it, o) => {
    const sel = o.sel || [];
    const opts = it.options.map((op, j) => `<option value="${esc(op.id)}">${'ABCDEFGH'[j]}. ${esc(op.text)}</option>`).join('');
    return `<div class="small muted" style="margin-top:10px">Match each scenario to one option. ${UI.badge('community')} This item type is reported by passers but not listed in the official guide.</div>
      <ol class="stack" style="margin-top:10px">${it.rows.map((r, i) => { const v = sel[i] || ''; const ok = v === r.key; const kt = (it.options.find(x => x.id === r.key) || {}).text;
        return `<li><div>${inl(r.text)}</div><select class="input" style="margin-top:6px" data-act="pickmatch" data-i="${i}" ${o.done ? 'disabled' : ''} aria-label="Option for scenario ${i + 1}"><option value="">Choose…</option>${opts.replace('value="' + esc(v) + '"', 'value="' + esc(v) + '" selected')}</select>${o.done ? `<div class="small" style="margin-top:4px;color:var(${ok ? '--good' : '--bad'})">${ok ? '✓ Correct' : '✕ Correct answer: ' + esc(kt || r.key)}</div>` : ''}</li>`; }).join('')}</ol>`;
  };
  UI.stem = (it, done) => `<div class="stem">${done ? UI.mark(it.stem, it.signals) : inl(it.stem)}</div>
    ${it.ask ? `<div class="ask">${done ? UI.mark(it.ask, it.signals) : inl(it.ask)}</div>` : ''}
    ${it.type === 'multi' ? `<div class="selectn" aria-hidden="true">Select ${it.select === 2 ? 'TWO' : 'THREE'}</div>` : ''}
    ${done && (it.signals || []).length ? `<p class="cap muted" style="margin-top:10px"><mark>Highlighted</mark> phrases are the signals that decide this item.</p>` : ''}`;

  // Feedback panel after grading.
  UI.feedback = (it, sel) => {
    const B = CP.bank;
    const ok = CP.score.isCorrect(it, sel);
    const picked = it.options.filter(o => sel.includes(o.id));
    const wrongPicks = picked.filter(o => !o.correct);
    const trap = wrongPicks[0] && wrongPicks[0].trap ? B.traps.get(wrongPicks[0].trap) : null;
    const rule = B.rules.get(it.rule);
    let head;
    if (ok) head = `<div class="vd ok">${UI.icon('check-circle')}Correct</div>`;
    else if (trap) head = `<div class="vd no">${UI.icon('x-circle')}Not quite: you chose a ${esc(trap.code)} option</div><div class="sub">${esc(trap.name)}. ${inl(trap.counter)}</div>`;
    else head = `<div class="vd no">${UI.icon('x-circle')}Not quite</div>`;
    let multiNote = '';
    if (it.type === 'multi') {
      const need = picked.filter(o => o.correct).length, filler = picked.filter(o => o.trap === 'T-FILLER').length, tr = picked.length - need - filler;
      multiNote = `<div class="blk"><h4>Multi-response</h4><p>You selected ${picked.length} of ${it.select}: ${need} needed${filler ? `, ${filler} filler` : ''}${tr ? `, ${tr} trap` : ''}. Scoring is all-or-nothing.</p></div>`;
    }
    const ctlabel = it.counterTrap ? `<div class="blk"><h4>Counter-trap</h4><p>Here the option that looks like a trap is the right one. Rules have conditions; check "when it's actually right" on the trap card.</p></div>` : '';
    return `<div class="fb" tabindex="-1" id="fb">
      ${head}
      <div class="blk"><h4>Why</h4><p>${inl(it.explain)}</p></div>
      ${rule ? `<div class="blk"><h4>Rule</h4><div class="callout rule"><div class="ct">${UI.icon('ruler')}${esc(rule.id)}, objective ${esc(it.obj)}</div>${inl(rule.rule)}${rule.unless ? `<p class="small muted" style="margin-top:6px"><b>Unless:</b> ${inl(rule.unless)}</p>` : ''}</div></div>` : ''}
      ${multiNote}${ctlabel}
      ${trap ? `<div class="blk"><h4>Trap card</h4><div class="callout trapc"><div class="ct">${UI.icon('warning-diamond')}<span class="mono">${esc(trap.code)}</span> ${esc(trap.name)}</div><p>${inl(trap.tempts)}</p><p class="small muted" style="margin-top:6px"><b>When it is actually right:</b> ${inl(trap.rightWhen)}</p></div></div>` : ''}
      <div class="blk btnrow">
        <a class="btn sm" href="#/guide/d${it.domain}/${esc(it.obj)}">Read ${esc(it.obj)} in the guide</a>
        ${trap ? `<button class="btn sm" data-act="start" data-kind="trap" data-code="${esc(trap.code)}">Drill this trap</button>` : ''}
        <a class="btn sm quiet" href="#/cheat?d=${it.domain}">Cheat-sheet D${it.domain}</a>
      </div>
      ${it.src && it.src.kind === 'official' ? `<p class="cap faint" style="margin-top:10px">${esc(it.src.ref)}</p>` : ''}
      ${it.set === 'community' ? `<div class="blk"><h4>Community reference</h4><p class="small">${UI.badge('community')} From <b>${esc(it.src.sourceName || it.src.source)}</b> (${esc(it.src.license || 'licence unknown')}${it.src.translated ? '; translated from Spanish for this portal' : ''}). ${it.verdict ? (it.verdict.status === 'agree' ? 'The portal’s independent check agrees with this key.' : `<b>Portal check: ${esc(it.verdict.status.replace('-', ' '))}.</b> ${inl(it.verdict.note || '')}`) : ''}</p>${it.src.url ? `<p class="cap faint mono" style="overflow-wrap:anywhere">${esc(it.src.url)}</p>` : ''}</div>` : ''}
      ${it.set === 'bridge' ? `<p class="cap faint" style="margin-top:10px">${UI.badge('bridge')} Rewritten from a Foundations practice question. Drill only; not counted toward readiness.</p>` : ''}
    </div>`;
  };

  // ---------- actions ----------
  CP.act = CP.act || {};
  CP.act.go = el => { location.hash = el.getAttribute('data-route'); };
  CP.act.start = async el => {
    const d = el.dataset;
    const args = { obj: d.obj, d: d.d, code: d.code, n: d.n ? +d.n : undefined };
    UI.startSession(d.kind, args);
  };
  UI.startSession = (kind, args) => {
    const s = CP.sess.create(kind, args || {});
    if (!s) { UI.toast('Nothing to practise here yet.'); return; }
    location.hash = '#/s/' + s.id;
  };
  CP.act.form = async el => UI.startForm(el.dataset.f || el.getAttribute('data-F'));
  UI.startForm = async F => {
    const st = CP.store.S, B = CP.bank;
    const state = B.formState(st, F);
    if (state === 'open') { location.hash = '#/s/' + st.forms[F]; return; }
    if (state === 'sealed') {
      const yes = await UI.confirm('Unseal Form C?', 'Form C is your dress rehearsal. It predicts best when it is the last fresh form you sit, ideally 3 to 7 days before the exam. Unseal it now?', 'Unseal Form C');
      if (!yes) return; st.forms.cUnsealed = true; CP.store.save();
    }
    if (state === 'done') {
      const yes = await UI.confirm('Retake Form ' + F + '?', 'You have already sat this form. A retake is useful for timing practice, but it no longer counts toward readiness.', 'Start retake');
      if (!yes) return;
    }
    const mult = st.settings.timeMult || 1;
    const go = await UI.modal({
      title: 'Form ' + F + ': before you start',
      body: `<div class="stack small">
        <p>63 items · ${Math.round(120 * mult)} minutes · feedback only after you submit.</p>
        <ul><li>Each item says how many options to select. Multi-response is scored all-or-nothing.</li>
        <li>Checkpoints: item 17 by 30:00, 34 by 60:00, 51 by 90:00, first pass by 110:00.</li>
        <li>Flag anything that takes more than 3 minutes and move on. Unanswered items count as wrong.</li>
        <li>The timer keeps running if you close the tab${st.settings.strict ? ' (strict mode: no pause)' : '; pausing is recorded in the report'}.</li></ul></div>`,
      actions: [{ id: 'no', label: 'Not now' }, { id: 'go', label: 'Start Form ' + F, primary: true }],
    });
    if (go !== 'go') return;
    UI.startSession('form', { F });
  };
  CP.act.dismiss = el => { const st = CP.store.S; st.settings.dismissed[el.dataset.key] = el.dataset.val || Date.now(); CP.store.save(); CP.router.render(); };
  CP.act.print = () => { document.body.classList.add('printing-cheat'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printing-cheat'), 400); }, 50); };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const name = el.getAttribute('data-act');
    if (el.tagName === 'INPUT') return; // handled by change
    const f = CP.act[name];
    if (f) { e.preventDefault(); f(el, e); }
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const f = CP.act[el.getAttribute('data-act')];
    if (f) f(el, e);
  });
})(typeof window !== 'undefined' ? window : globalThis);
