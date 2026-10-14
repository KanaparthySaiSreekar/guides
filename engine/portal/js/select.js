/* select: every sampler (baseline, drills, interleaved mix, adaptive/half mocks, reviews). DOM-free. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const X = CP.select = {};
  const U = () => CP.U, B = () => CP.bank;

  // unseen → latest wrong → due → least recently seen
  X.order = (S, items, seed) => {
    const now = Date.now();
    const rank = it => {
      const r = S.items[it.id];
      if (!r || !r.h || !r.h.length) return [0, 0];
      const e = r.h[r.h.length - 1];
      if (e[1] < 1) return [1, e[0]];
      if (r.due != null && r.due <= now) return [2, r.due];
      return [3, e[0]];
    };
    const sh = U().shuffle(items, seed == null ? U().randSeed() : seed);
    return sh.map(it => ({ it, k: rank(it) })).sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1]).map(x => x.it);
  };

  // No more than 2 consecutive items from one domain (and never the same objective back to back when avoidable).
  X.interleave = (items, seed) => {
    const r = U().rng(seed == null ? U().randSeed() : seed);
    let pool = U().shuffle(items, r); const out = [];
    while (pool.length) {
      const a = out[out.length - 1], b = out[out.length - 2];
      let idx = pool.findIndex(it => !(a && b && a.domain === it.domain && b.domain === it.domain) && !(a && a.obj === it.obj));
      if (idx < 0) idx = pool.findIndex(it => !(a && b && a.domain === it.domain && b.domain === it.domain));
      if (idx < 0) idx = 0;
      out.push(pool[idx]); pool.splice(idx, 1);
    }
    return out;
  };

  X.drillPool = (S, f, withBridge) => B().items.filter(it => B().drillable(S, it, withBridge) && (!f || f(it)));

  X.objective = (S, obj, n) => X.order(S, X.drillPool(S, it => it.obj === obj, true)).slice(0, n || 6);
  X.domain = (S, d, n) => {
    const objs = B().objs.filter(o => o.domain === d);
    const M = CP.mastery;
    const pool = X.drillPool(S, it => it.domain === d, true);
    const byObj = U().groupBy(X.order(S, pool), it => it.obj);
    const out = [];
    const weights = objs.map(o => ({ o: o.id, w: 1 - (M ? M.obj(S, o.id).p : 0.5) + 0.15 }));
    let guard = 0;
    while (out.length < n && guard++ < 500) {
      const tot = weights.reduce((s, x) => s + (byObj[x.o] && byObj[x.o].length ? x.w : 0), 0);
      if (!tot) break;
      let t = Math.random() * tot, pick = null;
      for (const x of weights) { if (!(byObj[x.o] && byObj[x.o].length)) continue; t -= x.w; if (t <= 0) { pick = x.o; break; } }
      if (!pick) pick = weights.find(x => byObj[x.o] && byObj[x.o].length).o;
      out.push(byObj[pick].shift());
    }
    return X.interleave(out);
  };

  // Baseline: fixed stratified set from the pool; 3 per domain, 4 multi. Deterministic for a bank.
  X.baseline = () => {
    const pool = B().items.filter(it => it.set === 'pool');
    const r = U().rng('baseline:' + pool.length);
    const out = [];
    const MULTI_DOMAINS = new Set([1, 3, 4, 5]); // 4 multi-response items in total
    for (const d of B().domains) {
      const di = U().shuffle(pool.filter(it => it.domain === d.n), r);
      const pick = [];
      const fits = (it, diff, type) => !pick.includes(it) && !pick.some(p => p.obj === it.obj) && it.diff === diff && (!type || it.type === type);
      for (const diff of [1, 2, 3]) {
        const type = diff === 3 && MULTI_DOMAINS.has(d.n) ? 'multi' : 'single';
        const c = di.find(it => fits(it, diff, type)) || di.find(it => fits(it, diff))
          || di.find(it => !pick.includes(it) && !pick.some(p => p.obj === it.obj)) || di.find(it => !pick.includes(it));
        if (c) pick.push(c);
      }
      out.push(...pick);
    }
    return X.interleave(out, 'baseline-order');
  };

  X.priority = (S, now) => {
    const M = CP.mastery, bank = B();
    now = now || Date.now();
    return bank.objs.map(o => {
      const m = M.obj(S, o.id, now);
      const perObj = bank.W[o.domain] / bank.objs.filter(x => x.domain === o.domain).length;
      const stale = m.last ? Math.min(14, (now - m.last) / 86400000) / 14 * 0.5 : 0.5;
      const boost = m.calib === 'overconfident' ? 1.3 : 1;
      return { obj: o.id, domain: o.domain, m, score: perObj * (1 - m.p) * boost * (1 + stale) };
    }).sort((a, b) => b.score - a.score);
  };

  X.mix = (S, n) => {
    const pri = X.priority(S);
    const temp = 0.02;
    const pool = X.drillPool(S, null, false);
    const byObj = U().groupBy(X.order(S, pool), it => it.obj);
    const out = [], count = {};
    let guard = 0;
    while (out.length < n && guard++ < 800) {
      const cand = pri.filter(p => byObj[p.obj] && byObj[p.obj].length && (count[p.obj] || 0) < 4);
      if (!cand.length) break;
      const ws = cand.map(p => Math.exp(p.score / temp - cand[0].score / temp));
      let t = Math.random() * U().sum(ws), i = 0;
      for (; i < ws.length; i++) { t -= ws[i]; if (t <= 0) break; }
      const p = cand[Math.min(i, cand.length - 1)];
      out.push(byObj[p.obj].shift()); count[p.obj] = (count[p.obj] || 0) + 1;
      if (out.length >= 3 && out.length % 10 === 0 && new Set(out.slice(-10).map(x => x.domain)).size < 3) {
        // force breadth
        const other = pri.find(q => !out.slice(-10).some(x => x.domain === q.domain) && byObj[q.obj] && byObj[q.obj].length);
        if (other) out[out.length - 1] = byObj[other.obj].shift();
      }
    }
    return X.interleave(out);
  };

  X.trap = (S, code, n) => {
    n = n || 10;
    const has = X.drillPool(S, it => it.options.some(o => !o.correct && o.trap === code), true);
    const counter = X.drillPool(S, it => it.counterTrap, false);
    const nc = Math.max(1, Math.round(n * 0.2));
    const main = X.order(S, has).slice(0, n - nc);
    const extra = X.order(S, counter.filter(it => !main.includes(it))).slice(0, n - main.length);
    return X.interleave([...main, ...extra]);
  };
  X.multi = (S, n) => X.interleave(X.order(S, X.drillPool(S, it => it.type === 'multi', false)).slice(0, n || 10));
  X.spaced = (S, n) => {
    const due = CP.srs.due(S).sort((a, b) => b.over - a.over);
    const out = [];
    for (const d of due) { const it = B().get(d.qid); if (it && (B().visible(S, it) || it.set === 'bridge' || it.set === 'official')) out.push(it); if (out.length >= (n || 25)) break; }
    return U().shuffle(out);
  };
  X.redo = (S, n) => {
    const out = [];
    for (const it of B().items) {
      const r = S.items[it.id]; if (!r || !r.h || !r.h.length) continue;
      if (!(B().visible(S, it) || it.set === 'bridge' || it.set === 'official')) continue;
      const e = r.h[r.h.length - 1];
      if (e[1] < 1) out.push({ it, t: e[0] });
    }
    return out.sort((a, b) => a.t - b.t).slice(0, n || 20).map(x => x.it);
  };
  X.pacing = S => {
    const seen = B().items.filter(it => B().visible(S, it) && S.items[it.id]);
    return U().shuffle(seen).slice(0, 10);
  };

  // Mock sampler (adaptive: 63; half: 32). Never sealed C (unless taken), never bridge or official.
  X.MOCK = { adaptive: { n: 63, q: [11, 8, 12, 10, 9, 9, 4], multi: 14 }, half: { n: 32, q: [6, 4, 6, 5, 5, 4, 2], multi: 7 } };
  X.mock = (S, kind) => {
    const spec = X.MOCK[kind];
    const pool = B().items.filter(it => B().visible(S, it));
    const out = [];
    const pri = X.priority(S); const pr = new Map(pri.map(p => [p.obj, p.score]));
    let multiLeft = spec.multi;
    B().domains.forEach((d, i) => {
      const need = spec.q[i];
      const di = X.order(S, pool.filter(it => it.domain === d.n)).sort((a, b) => {
        const fa = S.items[a.id] ? 1 : 0, fb = S.items[b.id] ? 1 : 0;
        return fa - fb || (pr.get(b.obj) || 0) - (pr.get(a.obj) || 0) || (b.diff - a.diff);
      });
      const objsUsed = new Set(), pick = [];
      const wantMulti = Math.round(spec.multi * need / spec.n);
      for (const it of di) {
        if (pick.length >= need) break;
        if (it.type === 'multi' && (pick.filter(x => x.type === 'multi').length >= wantMulti || multiLeft <= 0)) continue;
        if (objsUsed.has(it.obj) && di.some(o => !objsUsed.has(o.obj) && !pick.includes(o) && o.obj !== it.obj)) continue;
        pick.push(it); objsUsed.add(it.obj); if (it.type === 'multi') multiLeft--;
      }
      for (const it of di) { if (pick.length >= need) break; if (!pick.includes(it)) pick.push(it); }
      out.push(...pick);
    });
    const fresh = out.filter(it => !S.items[it.id]).length;
    return { items: X.interleave(out), fresh: out.length ? fresh / out.length : 0 };
  };
})(typeof window !== 'undefined' ? window : globalThis);
