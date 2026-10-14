// Validates content/guide/d{n}.json study pages.  node tools/validate-guide.mjs [--d 3]
import fs from 'node:fs';
import { P, readJSON, loadBlueprint, loadItems, shingles, jaccard, wordCount, C } from './lib.mjs';

const a = process.argv.slice(2);
const only = a.includes('--d') ? +a[a.indexOf('--d') + 1] : null;
const { bp } = loadBlueprint();
const traps = new Set(readJSON(C('content/traps.json')).map(t => t.code));
const FADED = new Set(['1.3', '1.4', '1.5', '2.4', '2.5', '3.1', '3.2', '3.5', '3.6', '3.7', '4.2', '4.4', '4.5', '5.1', '5.3', '5.4', '6.1', '6.3', '7.1']);
const items = loadItems();
const errors = [], warns = [];
const E = (w, m) => errors.push(`${w}: ${m}`), W = (w, m) => warns.push(`${w}: ${m}`);

function vign(w, v, faded) {
  if (!v || typeof v !== 'object') { E(w, 'missing'); return; }
  const n = wordCount(v.scenario);
  if (n < 45 || n > 130) W(w, `scenario ${n} words (60-90)`);
  if (!/Meridian/.test(v.scenario || '')) W(w, 'vignettes should use the Meridian Mutual running case');
  if (!v.ask) E(w, 'ask missing');
  if (!Array.isArray(v.options) || v.options.length !== 4) E(w, 'needs 4 options');
  else {
    if (v.options.filter(o => o.correct).length !== 1) E(w, 'exactly 1 correct option');
    for (const o of v.options) { if (!o.text) E(w, 'option text'); if (!o.correct && !traps.has(o.trap)) E(w, 'distractor trap code invalid: ' + o.trap); }
  }
  if (!faded) { for (const k of ['constraint', 'classify', 'eliminate', 'choose']) if (!v.steps || !v.steps[k]) E(w, 'steps.' + k + ' missing'); }
  else { for (const k of ['constraint', 'classify', 'reasoning']) if (!v[k]) E(w, k + ' missing'); }
  const sh = shingles(v.scenario + ' ' + (v.options || []).map(o => o.text).join(' '), 5);
  for (const it of items) { const s = jaccard(sh, shingles(it.stem + ' ' + it.options.map(o => o.text).join(' '), 5)); if (s >= 0.3) E(w, `too similar to bank item ${it.id} (${s.toFixed(2)})`); }
}

for (const d of bp.domains) {
  if (only && d.n !== only) continue;
  const f = C(`content/guide/d${d.n}.json`);
  if (!fs.existsSync(f)) { W('D' + d.n, 'guide file missing'); continue; }
  let g; try { g = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { E('D' + d.n, 'invalid JSON ' + e.message); continue; }
  const w = 'D' + d.n;
  if (g.domain !== d.n) E(w, 'domain field');
  if (wordCount(g.intro) < 60) E(w, 'intro too short (~120 words)');
  if (!g.delta) E(w, 'delta missing');
  if (!g.case || wordCount(g.case) < 60) E(w, 'case paragraph missing/short');
  const secs = new Map((g.sections || []).map(s => [s.obj, s]));
  for (const o of d.objectives) {
    const s = secs.get(o.id), sw = `${w} ${o.id}`;
    if (!s) { E(sw, 'section missing'); continue; }
    if (!Array.isArray(s.core) || s.core.length < 4 || s.core.length > 8) E(sw, 'core needs 4-7 bullets');
    vign(sw + ' worked', s.worked, false);
    if (FADED.has(o.id)) vign(sw + ' faded', s.faded, true); else if (s.faded) W(sw, 'faded example present on a non-listed objective (ok)');
    if (!Array.isArray(s.traps) || s.traps.length < 2 || s.traps.length > 4) E(sw, 'traps needs 2-4 codes');
    else for (const t of s.traps) if (!traps.has(t)) E(sw, 'unknown trap ' + t);
    if (!s.contrast || !s.contrast.a || !s.contrast.b || !s.contrast.decider) E(sw, 'contrast {a,b,decider} missing');
    if (!s.explain || !s.explain.prompt || !s.explain.model) E(sw, 'explain {prompt, model} missing');
    const txt = JSON.stringify(s);
    if (/[—–]/.test(txt)) W(sw, 'em/en dash present');
  }
  for (const k of secs.keys()) if (!d.objectives.some(o => o.id === k)) E(w, 'unknown section ' + k);
  const vs = (g.sections || []).flatMap(s => [s.worked, s.faded].filter(Boolean));
  const lk = vs.filter(v => { const L = (v.options || []).map(o => String(o.text || '').length), m = Math.max(...L); return (v.options || []).some(o => o.correct && String(o.text).length === m); }).length;
  if (vs.length >= 4 && lk / vs.length > 0.35) E(w, `correct option is the longest in ${lk}/${vs.length} vignettes (<=35%)`);
}
for (const x of warns) console.log('WARN  ' + x);
for (const x of errors) console.log('ERROR ' + x);
console.log(`\nguide: ${errors.length} errors, ${warns.length} warnings`);
process.exit(errors.length ? 1 : 0);
