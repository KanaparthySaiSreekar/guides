// Freezes the three sealed forms from the items' set field, in a seeded delivery order
// (no 3 consecutive items from one domain, no two from one objective back to back,
// no run of 4 identical canonical keys). Writes content/forms.json.
import { loadItems, writeJSON, rng, shuffle, C } from './lib.mjs';

const items = loadItems();
const forms = {};
for (const F of ['A', 'B', 'C']) {
  const pool = items.filter(i => i.set === 'form' + F);
  let best = null;
  for (let attempt = 0; attempt < 500 && !best; attempt++) {
    const r = rng('form' + F + ':' + attempt);
    let rest = shuffle(pool, r); const out = [];
    let ok = true;
    while (rest.length) {
      const a = out[out.length - 1], b = out[out.length - 2], c = out[out.length - 3];
      const key = it => it.options.filter(o => o.correct).map(o => o.id).join('');
      const fits = it => !(a && b && a.domain === it.domain && b.domain === it.domain) && !(a && a.obj === it.obj)
        && !(a && b && c && key(a) === key(it) && key(b) === key(it) && key(c) === key(it));
      const idx = rest.findIndex(fits);
      if (idx < 0) { ok = false; break; }
      out.push(rest[idx]); rest.splice(idx, 1);
    }
    if (ok) best = out;
  }
  if (!best) { console.error('could not order form ' + F); process.exit(1); }
  forms[F] = best.map(i => i.id);
  const fam = {}; for (const it of best) (fam[it.family] ||= []).push(it.id);
  const dup = Object.entries(fam).filter(([, v]) => v.length > 1);
  const byD = {}; best.forEach(i => { byD[i.domain] = (byD[i.domain] || 0) + 1; });
  console.log(`Form ${F}: ${best.length} items`, JSON.stringify(byD), 'multi', best.filter(i => i.type === 'multi').length, dup.length ? 'FAMILY DUPES ' + JSON.stringify(dup) : '');
}
writeJSON(C('content/forms.json'), forms);
