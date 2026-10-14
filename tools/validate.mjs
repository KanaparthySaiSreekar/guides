// Content validator. Exits 1 on any error.
//   node tools/validate.mjs                full bank + forms + content core
//   node tools/validate.mjs --obj 3.6      one objective file (authoring gate)
//   node tools/validate.mjs --quiet        errors only
import fs from 'node:fs';
import {
  P, ROOT, readJSON, loadBlueprint, loadItems, shingles, jaccard, containment, wordCount, words, LETTERS, C } from './lib.mjs';

const args = process.argv.slice(2);
const only = args.includes('--obj') ? args[args.indexOf('--obj') + 1] : null;
const quiet = args.includes('--quiet');
const errors = [], warns = [];
const E = (where, msg) => errors.push(`${where}: ${msg}`);
const W = (where, msg) => warns.push(`${where}: ${msg}`);

const { bp, objs } = loadBlueprint();
const slotsArr = readJSON(C('content/slots.json'));
const slots = new Map(slotsArr.map(s => [s.id, s]));
const constraints = new Set(readJSON(C('content/constraints.json')).map(c => c.id));
const traps = readJSON(C('content/traps.json'), null);
const cheat = readJSON(C('content/cheatsheet.json'), null);
const TRAP_CODES = new Set(traps ? traps.map(t => t.code) : [
  'T-REMOVE', 'T-ENFORCE', 'T-DETECT', 'T-AUTHZ', 'T-BOUNDARY', 'T-REACH', 'T-COMPLY', 'T-AGENTIC', 'T-ORGCHART',
  'T-PROTOCOL', 'T-MEGATOOL', 'T-BIGMODEL', 'T-STUFF', 'T-BLUNTCUT', 'T-LEVER', 'T-LAYER', 'T-LIVESTATE', 'T-OBSERVE',
  'T-VIBES', 'T-AGGREGATE', 'T-PEEK', 'T-SELFCONF', 'T-RUBBERSTAMP', 'T-SKIPDISC', 'T-OVERPROMISE', 'T-AVGSLA',
  'T-OWNER', 'T-AUDIENCE', 'T-LATER', 'T-FILLER', 'T-ASSUME']);
const RULES = cheat ? new Map(cheat.rows.map(r => [r.id, r])) : null;
const ARCH = new Set(['best', 'first', 'most-likely-cause', 'next-step', 'least', 'which-n']);
const ABS = /\b(always|never|only|guarantee[sd]?|all|must|entirely|every|none|completely)\b/gi;
const BANNED = [/all of the above/i, /none of the above/i, /both [a-f] and [a-f]\b/i, /\ball the above\b/i];
const LETTER_REF = /\b(option|answer|choice)s?\s+\(?[a-f]\)?(\s|,|\.|$)/i;

// ---------- do-not-copy corpus ----------
// An authoring gate: new items must not copy the official samples or the Foundations trainer. Those reference files are
// kept locally in reference/ (not in git); without them the gate is skipped and the frozen bank is checked as usual.
function corpus() {
  const docs = [];
  const samples = readJSON(P('reference/research-samples.json'), []);
  for (const q of samples) docs.push({ ref: 'sample:' + (q.from || '?'), text: [q.stem, ...(q.options || [])].join(' ') });
  const trainer = P('reference/foundations-trainer.html');
  const html = fs.existsSync(trainer) ? fs.readFileSync(trainer, 'utf8') : '';
  const line = html.split('\n').find(l => l.startsWith('const QB = '));
  if (line) {
    const qb = JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1));
    for (const q of qb) docs.push({ ref: 'foundationsQB:' + q.n, text: [q.q, ...q.o].join(' ') });
  }
  return docs.map(d => ({ ...d, sh: shingles(d.text, 5) }));
}
const CORPUS = corpus();

const itemText = it => [it.stem, it.ask, ...(it.options || []).map(o => o.text)].join(' ');
const len = s => String(s || '').replace(/`/g, '').length;

function checkItem(it) {
  const w = it.id || '(no id)';
  let slot = slots.get(it.id);
  if (it.set === 'bridge') {
    if (!/^FB-\d+$/.test(it.id)) E(w, 'bridge ids are FB-<original question number>');
    if (!objs.has(it.obj) || +String(it.obj)[0] !== it.domain) E(w, 'bridge obj/domain invalid');
    if (it.src?.kind !== 'bridge' || !it.src?.origId) E(w, 'bridge src {kind:"bridge", ref, origId} required');
    slot = { domain: it.domain, obj: it.obj, set: 'bridge', type: 'single', select: 1, diff: it.diff, counterTrap: !!it.counterTrap, archetype: it.archetype, options: 4, key: it.options?.filter(o => o.correct).map(o => o.id) || [] };
    if (it.type !== 'single' || it.select !== 1) E(w, 'bridge items are single-answer');
  }
  if (!slot) { E(w, 'id not in slots.json'); return; }
  for (const k of ['domain', 'obj', 'set', 'type', 'select']) if (it[k] !== slot[k]) E(w, `${k}=${it[k]} but slot says ${slot[k]}`);
  if (it.diff !== slot.diff) E(w, `diff=${it.diff} but slot says ${slot.diff}`);
  if (!!it.counterTrap !== slot.counterTrap) E(w, `counterTrap must be ${slot.counterTrap}`);
  if (it.archetype !== slot.archetype) W(w, `archetype ${it.archetype} differs from slot ${slot.archetype}`);
  if (!ARCH.has(it.archetype)) E(w, 'bad archetype ' + it.archetype);
  if (it.type === 'multi' && it.archetype !== 'which-n') E(w, 'multi items use archetype which-n');
  if (!['draft', 'reviewed', 'verified'].includes(it.status)) E(w, 'bad status');
  if (!constraints.has(it.constraint)) E(w, 'unknown constraint ' + it.constraint);
  if (!it.family || typeof it.family !== 'string') E(w, 'family required');
  if (!it.industry) E(w, 'industry required');
  if (/meridian/i.test(itemText(it))) E(w, '"Meridian" is reserved for guide vignettes');

  const sw = wordCount(it.stem);
  if (sw < 35 || sw > 140) E(w, `stem ${sw} words (45-120)`); else if (sw < 45 || sw > 120) W(w, `stem ${sw} words (45-120)`);
  if (!it.ask || wordCount(it.ask) < 4) E(w, 'ask missing or too short');
  if (it.type === 'multi') {
    const tag = it.select === 2 ? '(Select TWO.)' : '(Select THREE.)';
    if (!String(it.ask).trim().endsWith(tag)) E(w, `multi ask must end with "${tag}"`);
  } else if (/\(Select/i.test(it.ask)) E(w, 'single item ask must not say Select N');
  if (it.archetype === 'least' && !/\b(NOT|LEAST)\b/.test(it.ask)) E(w, 'least-archetype ask must capitalise NOT/LEAST');
  if (!it.explain || wordCount(it.explain) < 8) E(w, 'explain missing/short');

  const opts = it.options || [];
  if (opts.length !== slot.options) E(w, `needs ${slot.options} options, has ${opts.length}`);
  const keyed = opts.filter(o => o.correct);
  if (keyed.length !== it.select) E(w, `select=${it.select} but ${keyed.length} correct`);
  opts.forEach((o, i) => {
    const ow = `${w}/${o.id}`;
    if (o.id !== LETTERS[i]) E(ow, 'option ids must be a.. in order (run normalize)');
    if (!o.text || wordCount(o.text) < 3) E(ow, 'option text too short');
    if (o.correct && o.trap) E(ow, 'correct option must have trap null');
    if (!o.correct) {
      if (!TRAP_CODES.has(o.trap)) E(ow, 'distractor needs a valid trap code, got ' + o.trap);
      if (o.trap === 'T-FILLER' && it.type !== 'multi') E(ow, 'T-FILLER only in multi items');
    }
    const ww = wordCount(o.why);
    if (ww < 8 || ww > 80) E(ow, `why ${ww} words (12-60)`); else if (ww < 12 || ww > 60) W(ow, `why ${ww} words (12-60)`);
    if (LETTER_REF.test(o.why || '')) E(ow, 'why must not cite option letters');
  });
  const keyPos = opts.filter(o => o.correct).map(o => o.id).join(',');
  if (keyPos !== slot.key.join(',')) E(w, `key at ${keyPos} but slot wants ${slot.key.join(',')} (run normalize)`);
  if (it.type === 'multi' && opts.filter(o => o.trap === 'T-FILLER').length !== 1) W(w, 'multi items should have exactly one T-FILLER distractor');
  const dTraps = opts.filter(o => !o.correct).map(o => o.trap);
  if (new Set(dTraps).size < dTraps.length - 1) W(w, 'distractors reuse the same trap code');

  for (const b of BANNED) if (b.test(itemText(it))) E(w, 'banned phrase ' + b);
  if (/[—–]/.test(itemText(it))) W(w, 'em/en dash in item text (use commas, colons or hyphens)');

  // signals must be verbatim substrings
  const hay = (it.stem + ' ' + it.ask).toLowerCase();
  if (!Array.isArray(it.signals) || !it.signals.length) E(w, 'signals[] required');
  else for (const s of it.signals) if (!hay.includes(String(s).toLowerCase())) E(w, `signal not found in stem/ask: "${s}"`);

  if (RULES && !RULES.has(it.rule)) E(w, 'rule id does not resolve: ' + it.rule);
  if (!it.rule) E(w, 'rule id required');

  // length parity
  const kl = keyed.map(o => len(o.text)), dl = opts.filter(o => !o.correct).map(o => len(o.text));
  if (kl.length && dl.length) {
    const ratio = (kl.reduce((a, b) => a + b, 0) / kl.length) / (dl.reduce((a, b) => a + b, 0) / dl.length);
    if (ratio < 0.7 || ratio > 1.35) E(w, `key/distractor length ratio ${ratio.toFixed(2)} (0.85-1.15)`);
    else if (ratio < 0.85 || ratio > 1.15) W(w, `key/distractor length ratio ${ratio.toFixed(2)} (0.85-1.15)`);
  }
  // absolute words
  const absK = keyed.reduce((n, o) => n + ((o.text.match(ABS) || []).length), 0);
  const absD = opts.filter(o => !o.correct).reduce((n, o) => n + ((o.text.match(ABS) || []).length), 0);
  if (absK > 0 && absD === 0) W(w, 'absolute word only in the key');

  // facts
  const lvl = it.facts?.level;
  if (!['principle', 'volatile'].includes(lvl)) E(w, 'facts.level must be principle|volatile');
  if (lvl === 'volatile') {
    if (!/^\d{4}-\d{2}$/.test(it.facts.asOf || '')) E(w, 'volatile facts need asOf YYYY-MM');
    if (it.set !== 'pool') E(w, 'volatile items may only be in the pool');
  }
  if (!Array.isArray(it.verify)) E(w, 'verify[] required');

  // originality vs do-not-copy corpus
  const sh = shingles(itemText(it), 5);
  for (const d of CORPUS) {
    if (it.set === 'bridge' && d.ref === 'foundationsQB:' + (it.src && it.src.origId)) continue;
    const j = Math.max(jaccard(sh, d.sh), containment(d.sh, sh) * 0.9, containment(sh, d.sh) * 0.9);
    if (j >= 0.35) E(w, `too similar to ${d.ref} (${j.toFixed(2)})`);
    else if (j >= 0.25) W(w, `similar to ${d.ref} (${j.toFixed(2)})`);
  }
}

function checkObjective(obj, items) {
  const w = 'obj ' + obj;
  const want = slotsArr.filter(s => s.obj === obj);
  const have = new Set(items.map(i => i.id));
  const missing = want.filter(s => !have.has(s.id)).map(s => s.id);
  if (missing.length) E(w, 'missing slots ' + missing.join(' '));
  const ids = items.map(i => i.id);
  if (new Set(ids).size !== ids.length) E(w, 'duplicate ids');
  const tr = new Set(items.flatMap(i => (i.options || []).filter(o => !o.correct).map(o => o.trap)).filter(t => t !== 'T-FILLER'));
  if (items.length >= 4 && tr.size < 3) E(w, `only ${tr.size} distinct trap codes (need >=3)`);
  const fam = {};
  for (const it of items) { const k = it.set + '|' + it.family; if (fam[k]) E(w, `family "${it.family}" repeated in ${it.set}`); fam[k] = 1; }
  // near-duplicate stems within objective
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = shingles(items[i].stem, 4), b = shingles(items[j].stem, 4);
    const s = jaccard(a, b);
    if (s >= 0.3) E(w, `stems of ${items[i].id} and ${items[j].id} too similar (${s.toFixed(2)})`);
  }
}

function checkBank(items) {
  const byId = new Map(items.map(i => [i.id, i]));
  // counts
  for (const d of bp.domains) for (const o of d.objectives) {
    const n = items.filter(i => i.obj === o.id).length;
    if (n !== o.total) E('bank', `objective ${o.id} has ${n}/${o.total} items`);
  }
  const multi = items.filter(i => i.type === 'multi').length;
  const share = multi / Math.max(1, items.length);
  if (items.length >= 200 && (share < 0.2 || share > 0.25)) W('bank', `multi share ${(share * 100).toFixed(1)}% (20-25%)`);
  const ct = items.filter(i => i.counterTrap).length / Math.max(1, items.length);
  if (items.length >= 200 && ct < 0.12) E('bank', `counter-trap share ${(ct * 100).toFixed(1)}% (>=12%)`);
  // trap usage
  const tu = {};
  for (const it of items) for (const o of it.options || []) if (!o.correct) tu[o.trap] = (tu[o.trap] || 0) + 1;
  if (items.length >= 200) for (const c of TRAP_CODES) if ((tu[c] || 0) < 5) W('bank', `trap ${c} used ${tu[c] || 0}x as a distractor (>=5)`);
  // longest-is-key
  const longest = it => {
    const L = it.options.map(o => len(o.text)); const m = Math.max(...L);
    return it.options.some(o => o.correct && len(o.text) === m) && it.type === 'single';
  };
  for (const d of bp.domains) {
    const di = items.filter(i => i.domain === d.n && i.type === 'single');
    if (di.length >= 10) { const r = di.filter(longest).length / di.length; if (r > 0.40) E('bank', `D${d.n} key is longest in ${(r * 100).toFixed(0)}% of single items (<=40%; per-form rank balance is the main control)`); }
  }
  // absolute words ratio
  let aK = 0, nK = 0, aD = 0, nD = 0;
  for (const it of items) for (const o of it.options || []) {
    const c = (o.text.match(ABS) || []).length; if (o.correct) { aK += c; nK++; } else { aD += c; nD++; }
  }
  if (nK && nD && items.length >= 60) { const r = (aK / nK) / Math.max(1e-9, aD / nD); if (r < 0.7 || r > 1.3) W('bank', `absolute-word ratio key/distractor ${r.toFixed(2)} (0.7-1.3)`); }

  // key length-rank must carry no signal (single: each rank 15-35%; multi: longest option is a key 20-65%)
  const rankOf = it => { const L = it.options.map(o => len(o.text)); const k = it.options.findIndex(o => o.correct); return [...L].sort((a, b) => b - a).indexOf(L[k]) + 1; };
  const lrk = it => { const L = it.options.map(o => len(o.text)); const m = Math.max(...L); return it.options.some(o => o.correct && len(o.text) === m); };
  for (const set of ['formA', 'formB', 'formC', 'pool', 'ALL']) {
    const S1 = items.filter(i => (set === 'ALL' || i.set === set) && i.type === 'single');
    if (S1.length >= 40) { const r = [0, 0, 0, 0]; S1.forEach(i => r[rankOf(i) - 1]++); r.forEach((c, j) => { const p = c / S1.length; if (p < 0.15 || p > 0.35) E('bank', `${set}: key is length-rank ${j + 1} in ${(p * 100).toFixed(0)}% of single items (15-35%)`); }); }
    const M = items.filter(i => (set === 'ALL' || i.set === set) && i.type === 'multi');
    if (M.length >= 12) { const p = M.filter(lrk).length / M.length; if (p < 0.2 || p > 0.65) E('bank', `${set}: longest option is a key in ${(p * 100).toFixed(0)}% of multi items (20-65%)`); }
  }
  // forms
  const forms = readJSON(C('content/forms.json'), null);
  if (forms) {
    const seen = new Set();
    for (const [F, ids] of Object.entries(forms)) {
      const w = 'form ' + F;
      const fi = ids.map(id => byId.get(id)).filter(Boolean);
      if (fi.length !== ids.length) E(w, 'unknown ids in form');
      if (ids.length !== bp.items) E(w, `${ids.length} items (63)`);
      for (const id of ids) { if (seen.has(id)) E(w, 'item in two forms ' + id); seen.add(id); }
      for (const d of bp.domains) { const n = fi.filter(i => i.domain === d.n).length; if (n !== d.formQuota) E(w, `D${d.n} has ${n}/${d.formQuota}`); }
      const objsIn = new Set(fi.map(i => i.obj)); if (objsIn.size !== objs.size) E(w, `covers ${objsIn.size}/38 objectives`);
      const m = fi.filter(i => i.type === 'multi').length; if (m !== 14) E(w, `${m} multi items (14)`);
      const fam = {}; for (const it of fi) { if (fam[it.family]) W(w, `concept family "${it.family}" appears twice`); fam[it.family] = 1; }
      const ind = {}; for (const it of fi) ind[it.industry] = (ind[it.industry] || 0) + 1;
      if (Object.keys(ind).length < 8) E(w, 'fewer than 8 industries');
      for (const [k, v] of Object.entries(ind)) if (v > 12) E(w, `industry ${k} ${v}/63 (>20%)`);
      for (const it of fi) {
        if (it.status !== 'verified') E(w, `${it.id} not verified`);
        if (it.verify?.length) E(w, `${it.id} has open verify[]`);
        if (it.facts?.level !== 'principle') E(w, `${it.id} is volatile`);
      }
      const r = fi.filter(i => i.type === 'single').filter(longest).length / Math.max(1, fi.filter(i => i.type === 'single').length);
      if (r > 0.30) E(w, `key is longest in ${(r * 100).toFixed(0)}% of single items (<=30%)`);
      // delivery order: no >2 consecutive same domain
      for (let i = 2; i < fi.length; i++) if (fi[i].domain === fi[i - 1].domain && fi[i].domain === fi[i - 2].domain) { E(w, `3 consecutive D${fi[i].domain} at ${i}`); break; }
    }
  }
}

function checkCore() {
  if (!traps) { W('core', 'content/traps.json not present yet'); return; }
  if (!cheat) { W('core', 'content/cheatsheet.json not present yet'); return; }
  for (const r of cheat.rows) {
    if (!/^CS-D[1-7]-\d{2}$/.test(r.id)) E(r.id, 'bad rule id');
    if (!objs.has(r.obj)) E(r.id, 'unknown objective ' + r.obj);
    if (!TRAP_CODES.has(r.trap)) E(r.id, 'unknown trap ' + r.trap);
  }
  for (const o of objs.keys()) {
    const prim = cheat.rows.filter(r => r.obj === o && r.primary);
    if (prim.length !== 1) E('core', `objective ${o} has ${prim.length} primary rows`);
  }
}

// ---------- run ----------
checkCore();
const bridgeFile = args.includes('--bridge') ? args[args.indexOf('--bridge') + 1] : null;
const all = loadItems();
let scope = only ? all.filter(i => i.obj === only) : all;
if (bridgeFile) {
  const br = readJSON(bridgeFile);
  for (const it of br) {
    checkItem(it);
    // bridge items are rewrites: allow overlap with their own Foundations source, but not with other items
  }
  const lk = br.filter(it => { const L = it.options.map(o => len(o.text)); const m = Math.max(...L); return it.options.some(o => o.correct && len(o.text) === m); }).length;
  if (br.length >= 10 && lk / br.length > 0.30) E('bridge', `key is longest in ${Math.round(lk / br.length * 100)}% of bridge items (<=30%)`);
  for (const x of warns) if (!quiet) console.log('WARN  ' + x);
  for (const x of errors) console.log('ERROR ' + x);
  console.log(`
${br.length} bridge items checked: ${errors.length} errors, ${warns.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
if (only && !scope.length) E('obj ' + only, 'no items found in content/items/' + only + '.json');
for (const it of scope) checkItem(it);
const byObj = {};
for (const it of scope) (byObj[it.obj] ||= []).push(it);
for (const [o, its] of Object.entries(byObj)) checkObjective(o, its);
if (!only) {
  // cross-objective near duplicates
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (all[i].obj === all[j].obj) continue;
    const s = jaccard(shingles(all[i].stem, 5), shingles(all[j].stem, 5));
    if (s >= 0.3) W('bank', `${all[i].id} ~ ${all[j].id} stems similar (${s.toFixed(2)})`);
  }
  if (all.length) checkBank(all);
} else {
  // originality against the rest of the bank
  const others = all.filter(i => i.obj !== only);
  for (const it of scope) { const a = shingles(it.stem, 5); for (const o of others) { const s = jaccard(a, shingles(o.stem, 5)); if (s >= 0.3) E(it.id, `stem too similar to ${o.id} (${s.toFixed(2)})`); } }
}

if (!quiet) for (const x of warns) console.log('WARN  ' + x);
for (const x of errors) console.log('ERROR ' + x);
console.log(`\n${scope.length} items checked: ${errors.length} errors, ${warns.length} warnings`);
process.exit(errors.length ? 1 : 0);
