// Validates authored concept flashcards.  node tools/validate-cards.mjs [--d 3] [--quiet]
// File shape: content/flashcards/d<n>.json = { "domain": n, "cards": [ { id, d, obj, kind, front, back, src[] } ] }
import fs from 'node:fs';
import { P, readJSON, C } from './lib.mjs';

const args = process.argv.slice(2);
const only = args.includes('--d') ? Number(args[args.indexOf('--d') + 1]) : null;
const quiet = args.includes('--quiet');
const KINDS = ['define', 'distinguish', 'apply', 'why', 'recall'];
const cheat = readJSON(C('content/cheatsheet.json'));
const cheatIds = new Set(cheat.rows.map(r => r.id));
const trapIds = new Set(readJSON(C('content/traps.json')).map(t => t.code));
const errors = [], warnings = [];
let total = 0;

for (let n = 1; n <= 7; n++) {
  if (only && n !== only) continue;
  const file = C(`content/flashcards/d${n}.json`);
  if (!fs.existsSync(file)) { (only ? errors : warnings).push(`d${n}: file missing`); continue; }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { errors.push(`d${n}: invalid JSON: ${e.message}`); continue; }
  const guide = readJSON(C(`content/guide/d${n}.json`));
  const objs = new Map(guide.sections.map(s => [s.obj, s]));
  if (doc.domain !== n) errors.push(`d${n}: "domain" must be ${n}`);
  if (!Array.isArray(doc.cards) || !doc.cards.length) { errors.push(`d${n}: "cards" must be a non-empty array`); continue; }
  const ids = new Set(), fronts = new Map(), covered = new Set();
  for (const [i, c] of doc.cards.entries()) {
    const at = `d${n} card[${i}] ${c.id || '?'}`;
    for (const k of ['id', 'obj', 'kind', 'front', 'back']) if (typeof c[k] !== 'string' || !c[k].trim()) errors.push(`${at}: missing string "${k}"`);
    if (c.d !== n) errors.push(`${at}: "d" must be ${n}`);
    if (ids.has(c.id)) errors.push(`${at}: duplicate id`); ids.add(c.id);
    if (c.id && !new RegExp(`^C${n}\\.\\d+-\\d{2}$`).test(c.id)) errors.push(`${at}: id must look like C${n}.<obj>-NN (e.g. C${n}.1-01)`);
    if (c.obj && !objs.has(c.obj)) errors.push(`${at}: obj ${c.obj} not in guide d${n}`);
    if (c.id && c.obj && !c.id.startsWith(`C${c.obj}-`)) errors.push(`${at}: id prefix must match obj (C${c.obj}-NN)`);
    if (c.kind && !KINDS.includes(c.kind)) errors.push(`${at}: kind must be one of ${KINDS.join('/')}`);
    const f = c.front || '', b = c.back || '';
    if (f.length > 220) errors.push(`${at}: front is ${f.length} chars (max 220)`);
    if (b.length > 560) errors.push(`${at}: back is ${b.length} chars (max 560)`);
    if (b.length && b.length < 25) warnings.push(`${at}: back is very short (${b.length} chars)`);
    if (/<[a-z/][^>]*>/i.test(f + b)) errors.push(`${at}: no HTML allowed (use **bold** and \`code\` only)`);
    if (((f + b).match(/\*\*/g) || []).length % 2) errors.push(`${at}: unbalanced ** markers`);
    if (((f + b).match(/`/g) || []).length % 2) errors.push(`${at}: unbalanced backticks`);
    if (/—/.test(f + b)) warnings.push(`${at}: contains an em dash; the portal style avoids them`);
    const key = f.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (fronts.has(key)) errors.push(`${at}: same front as ${fronts.get(key)}`); fronts.set(key, c.id);
    if (!Array.isArray(c.src) || !c.src.length) { errors.push(`${at}: "src" must be a non-empty array`); continue; }
    for (const s of c.src) {
      const m = /^(core|contrast|explain|bridge|worked|faded|cheat|trap):?(.*)$/.exec(s);
      if (!m) { errors.push(`${at}: bad src "${s}"`); continue; }
      const sec = objs.get(c.obj);
      if (m[1] === 'core') {
        const idx = Number(m[2]);
        if (!sec || !Number.isInteger(idx) || idx < 0 || idx >= sec.core.length) errors.push(`${at}: src ${s} out of range for ${c.obj} (${sec ? sec.core.length : 0} core bullets)`);
        else covered.add(`${c.obj}:${idx}`);
      }
      if (m[1] === 'cheat' && !cheatIds.has(m[2])) errors.push(`${at}: unknown cheat row ${m[2]}`);
      if (m[1] === 'trap' && !trapIds.has(m[2])) errors.push(`${at}: unknown trap ${m[2]}`);
    }
  }
  for (const s of guide.sections) s.core.forEach((_, idx) => { if (!covered.has(`${s.obj}:${idx}`)) errors.push(`d${n}: core bullet ${s.obj}:${idx} is not covered by any card`); });
  total += doc.cards.length;
  if (!quiet) console.log(`d${n}: ${doc.cards.length} cards, ${covered.size} core bullets covered`);
}
// ID lock: saved progress is keyed by id, so an id must keep naming the same card. New cards take a new
// number (max + 1 for their objective); ids are never renumbered or reused. `--lock` records the current fronts.
const LOCK = C('content/flashcards/ids.lock.json');
const words = s => new Set(String(s).toLowerCase().replace(/\*\*|`/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2));
const similar = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };
const all = [];
for (let n = 1; n <= 7; n++) { const f = C(`content/flashcards/d${n}.json`); if (fs.existsSync(f)) try { all.push(...JSON.parse(fs.readFileSync(f, 'utf8')).cards); } catch (e) { /* reported above */ } }
if (args.includes('--lock')) {
  const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : {};
  for (const c of all) lock[c.id] = c.front;
  fs.writeFileSync(LOCK, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))), null, 1) + '\n');
  console.log(`locked ${Object.keys(lock).length} ids in content/flashcards/ids.lock.json`);
} else if (fs.existsSync(LOCK)) {
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  const present = new Map(all.map(c => [c.id, c]));
  for (const [id, front] of Object.entries(lock)) {
    const c = present.get(id);
    if (!c) { if (!only || id.startsWith(`C${only}.`)) warnings.push(`${id}: locked id no longer present (never reuse it)`); continue; }
    if (only && c.d !== only) continue;
    if (similar(c.front, front) < 0.34) errors.push(`${id}: front now asks something different from the locked card ("${front.slice(0, 60)}…"). Give the new card a new id (max + 1 for ${c.obj}) and keep this id for the old question, or run --lock if this is a deliberate rewrite of the same card.`);
  }
  const fresh = all.filter(c => !lock[c.id] && (!only || c.d === only));
  if (fresh.length && !quiet) console.log(`note  ${fresh.length} new card id(s) not in the lock yet; run node tools/validate-cards.mjs --lock after review`);
}

for (const w of warnings) if (!quiet) console.warn('warn  ' + w);
for (const e of errors) console.error('ERROR ' + e);
console.log(`${errors.length ? 'FAIL' : 'OK'}: ${total} cards, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
