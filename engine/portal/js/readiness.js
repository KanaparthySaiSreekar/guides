/* readiness: blueprint-weighted accuracy on FIRST exposures only, per-domain Beta posteriors,
   an 80% interval, floors and gates. Never a fake scaled score. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const R = CP.ready = {};
  const DAY = 86400000, Z = 1.2816;
  R.TARGET = 0.76;

  R.compute = (S, now) => {
    now = now || Date.now();
    const B = CP.bank, W = CP.score.WEIGHT;
    const dom = {};
    for (const d of B.domains) dom[d.n] = { a: 2, b: 2, n: 0, w: 0 };
    let freshN = 0, mN = 0, mOk = 0, practiceW = 0, practiceOk = 0;
    for (const it of B.bank) {
      const r = S.items[it.id]; if (!r || !r.first) continue;
      const f = r.first;
      let w = W[f.m] || 0; if (!w) continue;
      w *= Math.pow(0.5, Math.max(0, now - f.at) / (30 * DAY));
      const ok = f.ok ? (f.conf === 0 ? 0.5 : 1) : 0;
      const d = dom[it.domain]; d.a += w * ok; d.b += w * (1 - ok); d.n++; d.w += w;
      freshN++;
      if (it.type === 'multi') { mN++; mOk += f.ok ? 1 : 0; }
      if (f.m !== 'F') { practiceW += w; practiceOk += w * ok; }
    }
    let P = 0, V = 0;
    for (const d of B.domains) {
      const x = dom[d.n], s = x.a + x.b, p = x.a / s, v = (x.a * x.b) / (s * s * (s + 1));
      x.p = p; x.lo = Math.max(0, p - Z * Math.sqrt(v)); x.hi = Math.min(1, p + Z * Math.sqrt(v));
      x.miss = d.formQuota * (1 - p); x.quota = d.formQuota;
      P += B.W[d.n] * p; V += B.W[d.n] * B.W[d.n] * v;
    }
    const lo = Math.max(0, P - Z * Math.sqrt(V)), hi = Math.min(1, P + Z * Math.sqrt(V));
    const multiAcc = mN >= 5 ? mOk / mN : null;

    // sealed forms, first attempts
    const forms = [];
    for (const F of ['A', 'B', 'C']) {
      const s = B.formSession(S, F);
      if (s && s.state === 'submitted' && s.result) {
        const used = (s.endedAt || now) - s.startedAt - (s.pausedMs || 0);
        forms.push({ F, pct: s.result.pct, at: s.endedAt || s.startedAt, inTime: used <= (s.limitMs || 7200000) + 5000 });
      }
    }
    const gates = [];
    const g = (name, ok, text) => gates.push({ name, ok, text });
    const low = B.domains.filter(d => d.n !== 7 && dom[d.n].p < 0.65);
    g('Domain floors', !low.length && dom[7].p >= 0.60, low.length ? 'Below 65%: ' + low.map(d => 'D' + d.n + ' ' + Math.round(dom[d.n].p * 100) + '%').join(', ') : 'D1–D6 at 65%+, D7 at 60%+');
    g('Governance & Stakeholder', dom[5].p >= 0.70 && dom[6].p >= 0.70, `D5 ${Math.round(dom[5].p * 100)}%, D6 ${Math.round(dom[6].p * 100)}% (need 70%)`);
    g('Multi-response', multiAcc != null && multiAcc >= 0.60, multiAcc == null ? 'Not enough multi-response answers yet' : `${Math.round(multiAcc * 100)}% all-or-nothing (need 60%)`);
    g('Overall with margin', P >= 0.74 && lo >= 0.68, `${Math.round(P * 100)}% (lower bound ${Math.round(lo * 100)}%)`);
    g('Sealed form taken', forms.length >= 1, forms.length ? forms.map(f => 'Form ' + f.F + ' ' + Math.round(f.pct * 100) + '%').join(', ') : 'No sealed form yet');

    const thin = B.domains.filter(d => dom[d.n].n < 5);
    let state;
    if (freshN < 60 || thin.length) state = 'insufficient';
    else if (P < 0.66 || B.domains.some(d => d.n !== 7 && dom[d.n].p < 0.55)) state = 'notyet';
    else if (gates.every(x => x.ok)) {
      const good = forms.filter(f => f.pct >= 0.76 && f.inTime);
      const recent = forms.length && now - Math.max(...forms.map(f => f.at)) <= 14 * DAY;
      state = good.length >= 2 && recent ? 'ready' : 'ontrack';
    } else state = 'borderline';

    const warnings = [];
    if (forms.length && practiceW > 5) {
      const pp = practiceOk / practiceW, last = forms[forms.length - 1].pct;
      if (pp - last > 0.08) warnings.push(`Practice accuracy (${Math.round(pp * 100)}%) runs ${Math.round((pp - last) * 100)} points above your last form. Repetition may be inflating it.`);
    }
    return { state, label: R.LABEL[state], P, lo, hi, dom, gates, multiAcc, freshN, thin: thin.map(d => d.n), forms, warnings };
  };
  R.LABEL = { insufficient: 'Insufficient evidence', notyet: 'Not yet', borderline: 'Borderline', ontrack: 'On track', ready: 'Ready' };
  R.HELP = {
    insufficient: 'Answer at least 60 fresh items, with 5 or more in every domain, before this estimate means anything.',
    notyet: 'Overall or a domain is well below the bar. Keep studying in weight × gap order.',
    borderline: 'Close. Clear the gates that are still open.',
    ontrack: 'Every gate is clear. Confirm with a second sealed form.',
    ready: 'Two sealed forms at 76%+ within time, the latest in the last 14 days, and every gate clear.',
  };
  // Illustrative only: piecewise-linear band, never Anthropic's curve.
  R.scaledBand = p => {
    const m = c => p <= c ? 100 + (620 * p / c) : 720 + 280 * (p - c) / (1 - c);
    return [Math.round(m(0.78)), Math.round(m(0.72)), Math.round(m(0.65))];
  };
})(typeof window !== 'undefined' ? window : globalThis);
