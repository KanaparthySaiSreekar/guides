// Normalises authored items in place: fills defaults, reorders options so the
// keyed options land on the slot's canonical key positions, and relabels
// option ids a..f by position. Usage: node tools/normalize.mjs [--obj 3.6]
import fs from 'node:fs';
import { P, readJSON, writeJSON, LETTERS, C } from './lib.mjs';

const args = process.argv.slice(2);
const only = args.includes('--obj') ? args[args.indexOf('--obj') + 1] : null;
const slots = new Map(readJSON(C('content/slots.json')).map(s => [s.id, s]));
const dir = C('content/items');
const files = fs.readdirSync(dir).filter(f => /^\d\.\d\.json$/.test(f) && (!only || f === only + '.json'));

const clean = s => typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s;

for (const f of files) {
  const items = readJSON(C(`content/items/${f}`));
  for (const it of items) {
    const slot = slots.get(it.id);
    it.rev ??= 1;
    it.status ??= 'draft';
    it.verify ??= [];
    it.facts ??= { level: 'principle', asOf: null };
    it.src ??= { kind: 'original', ref: null, origId: null };
    it.obj2 ??= null;
    it.tips ??= [];
    for (const k of ['stem', 'ask', 'explain']) it[k] = clean(it[k]);
    if (!Array.isArray(it.options)) continue;
    it.options.forEach(o => { o.text = clean(o.text); o.why = clean(o.why); if (o.correct) o.trap = null; });
    if (slot) {
      Object.assign(it, { domain: slot.domain, obj: slot.obj, set: slot.set, type: slot.type, select: slot.select });
      const keyed = it.options.filter(o => o.correct), rest = it.options.filter(o => !o.correct);
      if (keyed.length === slot.key.length && it.options.length === slot.options) {
        const out = new Array(it.options.length);
        slot.key.forEach((L, i) => { out[LETTERS.indexOf(L)] = keyed[i]; });
        let j = 0;
        for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = rest[j++];
        it.options = out;
      }
    }
    it.options.forEach((o, i) => { o.id = LETTERS[i]; });
    // key order: id first for readability
    for (let i = 0; i < it.options.length; i++) {
      const { id, text, correct, trap, why, ...more } = it.options[i];
      it.options[i] = { id, text, correct: !!correct, trap: trap ?? null, why, ...more };
    }
  }
  writeJSON(C(`content/items/${f}`), items);
  console.log('normalized', f, items.length);
}
