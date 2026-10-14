/* bank: indexes over the embedded data plus sealing/visibility rules. DOM-free. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const B = CP.bank = {};

  B.init = D => {
    B.D = D;
    B.items = D.items || [];
    B.byId = new Map(B.items.map(i => [i.id, i]));
    B.forms = D.forms || { A: [], B: [], C: [] };
    B.formOf = new Map();
    for (const F of ['A', 'B', 'C']) for (const id of (B.forms[F] || [])) B.formOf.set(id, F);
    B.objs = [];
    B.objById = new Map();
    for (const d of D.bp.domains) for (const o of d.objectives) { const x = { ...o, domain: d.n }; B.objs.push(x); B.objById.set(o.id, x); }
    B.domains = D.bp.domains;
    B.W = {}; B.Q = {}; for (const d of D.bp.domains) { B.W[d.n] = d.weight / 100; B.Q[d.n] = d.formQuota; }
    B.traps = new Map((D.traps || []).map(t => [t.code, t]));
    B.rules = new Map(((D.cheat && D.cheat.rows) || []).map(r => [r.id, r]));
    B.primaryRule = new Map(((D.cheat && D.cheat.rows) || []).filter(r => r.primary).map(r => [r.obj, r]));
    B.bank = B.items.filter(i => i.set === 'formA' || i.set === 'formB' || i.set === 'formC' || i.set === 'pool');
    return B;
  };
  B.get = id => B.byId.get(id);
  B.keyIds = it => it.options.filter(o => o.correct).map(o => o.id);
  B.isBank = it => it.set === 'pool' || it.set === 'formA' || it.set === 'formB' || it.set === 'formC';
  B.formLetter = set => ({ formA: 'A', formB: 'B', formC: 'C' })[set] || null;

  B.formSession = (S, F) => {
    const id = S.forms[F]; if (!id) return null;
    return S.sessions.find(s => s.id === id) || null;
  };
  B.formSubmitted = (S, F) => { const s = B.formSession(S, F); return !!(s && s.state === 'submitted'); };
  B.formState = (S, F) => {
    const s = B.formSession(S, F);
    if (s && s.state === 'submitted') return 'done';
    if (s && s.state === 'open') return 'open';
    if (F === 'C' && !S.forms.cUnsealed) return 'sealed';
    return 'ready';
  };

  // May this item appear outside its own form? (drills, reviews, guide, adaptive)
  B.visible = (S, it) => {
    if (it.set === 'pool') return true;
    const F = B.formLetter(it.set);
    if (F) return B.formSubmitted(S, F);
    return false; // official, bridge: only in their own modes
  };
  B.drillable = (S, it, withBridge) => B.visible(S, it) || (withBridge && it.set === 'bridge');
})(typeof window !== 'undefined' ? window : globalThis);
