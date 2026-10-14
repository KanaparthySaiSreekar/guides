// Loads the DOM-free engine modules into a sandbox with a synthetic bank.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'portal', 'js');
const MODS = ['util', 'store', 'bank', 'scoring', 'srs', 'mastery', 'readiness', 'select', 'plan', 'nba', 'timer', 'session'];

export function fixtureData() {
  const bp = JSON.parse(fs.readFileSync(path.join(SRC, '..', '..', '..', 'guides', 'ccarp', 'content', 'blueprint.json'), 'utf8'));
  const items = [];
  const L = 'abcdef';
  let k = 0;
  for (const d of bp.domains) for (const o of d.objectives) {
    for (let i = 0; i < o.total; i++) {
      const multi = i < o.multi;
      const set = i < o.forms ? ['formA', 'formB', 'formC'][i % 3] : 'pool';
      const nOpt = multi ? 5 : 4, sel = multi ? 2 : 1;
      const key = multi ? [L[k % 5], L[(k + 2) % 5]] : [L[k % 4]];
      items.push({
        id: `P${d.n}-${o.id}-${String(i + 1).padStart(3, '0')}`, rev: 1, domain: d.n, obj: o.id, set, type: multi ? 'multi' : 'single', select: sel, diff: 1 + (i % 3),
        stem: 'stem ' + k, ask: 'ask', signals: [], rule: 'CS-D1-01', counterTrap: false, family: 'f' + k, industry: 'x',
        options: Array.from({ length: nOpt }, (_, j) => ({ id: L[j], text: 'opt ' + j, correct: key.includes(L[j]), trap: key.includes(L[j]) ? null : (j % 2 ? 'T-STUFF' : 'T-LAYER'), why: 'w' })),
        explain: 'e',
      });
      k++;
    }
  }
  const forms = { A: items.filter(i => i.set === 'formA').map(i => i.id), B: items.filter(i => i.set === 'formB').map(i => i.id), C: items.filter(i => i.set === 'formC').map(i => i.id) };
  return { bp, items, forms, traps: [{ code: 'T-STUFF', name: 'Stuff' }, { code: 'T-LAYER', name: 'Layer' }], cheat: { rows: [{ id: 'CS-D1-01', obj: '1.1', primary: true, d: 1 }] }, tips: [], path: { stages: [] } };
}

export function load(data) {
  const store = new Map();
  const localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = { console, Date, Math, JSON, setTimeout, clearTimeout, localStorage };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const m of MODS) vm.runInContext(fs.readFileSync(path.join(SRC, m + '.js'), 'utf8'), ctx, { filename: m + '.js' });
  const CP = ctx.CP;
  CP.bank.init(data || fixtureData());
  CP.store.load();
  return { CP, ctx, store };
}
