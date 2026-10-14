// CCAR-P flashcards: the data the flashcards engine shows, built from this guide's content core (the same files the Study
// Portal uses) plus the authored concept cards in content/flashcards/d<n>.json.
// IDs are derived from content, never from array positions, and every item carries a content hash (h)
// so saved progress can never attach to a different card after an edit.
//   export default ({ args }) => ({ data })     data = { meta, domains, objs, traps, rows, cards, mcqs, ui }
import fs from 'node:fs';
import { P, GUIDE, readJSON, loadItems, hashStr, C, stampFor } from '../../tools/lib.mjs';

export default function build({ args = [] } = {}) {
  // ---------- content ----------
  const bp = readJSON(C('content/blueprint.json'));
  const cheat = readJSON(C('content/cheatsheet.json'));
  const traps = readJSON(C('content/traps.json'));
  const ladders = readJSON(C('content/ladders.json'));
  const triggers = readJSON(C('content/triggers.json'));
  const tips = readJSON(C('content/tips.json'));
  const exam = readJSON(C('content/exam.json'));
  const platform = readJSON(C('content/platform.json'));
  const cs = readJSON(C('content/case.json'));
  const forms = readJSON(C('content/forms.json'));
  const guide = {};
  for (let n = 1; n <= 7; n++) guide[n] = readJSON(C(`content/guide/d${n}.json`));

  const objShort = {};
  for (const d of bp.domains) for (const o of d.objectives) objShort[o.id] = o.short || o.text;
  const trapName = Object.fromEntries(traps.map(t => [t.code, t.name]));
  const ladderById = Object.fromEntries(ladders.map(l => [l.id, l]));
  const lawText = Object.fromEntries(cheat.laws.map(l => [l.id, l.text]));
  const rowById = Object.fromEntries(cheat.rows.map(r => [r.id, r]));
  const problems = [];
  const clean = s => (s == null ? '' : String(s)).trim();
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const h5 = s => hashStr(String(s)).toString(36).slice(0, 5);
  const plainText = s => String(s || '').replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  // Compact domain names for chips and bars.
  const NICK = { 1: 'Solution design', 2: 'Models & prompting', 3: 'Integration', 4: 'Evaluation', 5: 'Governance & risk', 6: 'Stakeholders & lifecycle', 7: 'Developer productivity' };

  // ---------- cards ----------
  // Card: { id, h, k: deck, d: domain (0 = cross-domain), o: objective, f: front, q: prompt line, b: answer, x: [[label, text]], t: [trap codes], g: tag, ds: related domains }
  // h hashes what the card asks and answers, so a corrected answer drops an old "known" mark. Cards whose front is only a
  // position ("rule 2 of 6") hash their answer alone, so inserting a sibling does not reset every mark.
  const cards = [];
  const card = (c, answerOnly) => {
    for (const [k, v] of Object.entries(c)) if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete c[k];
    if (!c.f || !(c.b || c.x)) problems.push(`card ${c.id}: empty front or back`);
    c.h = h5(plainText([answerOnly ? '' : c.f, answerOnly ? '' : c.q, c.b, ...(c.x || []).flat()].join(' | ')));
    cards.push(c);
  };

  // Concepts: authored from the guide core bullets, fact-checked (content/flashcards/d<n>.json).
  for (let n = 1; n <= 7; n++) {
    const f = C(`content/flashcards/d${n}.json`);
    if (!fs.existsSync(f)) { if (!args.includes('--allow-missing')) problems.push(`missing content/flashcards/d${n}.json`); continue; }
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const c of doc.cards) {
      const t = (c.src || []).filter(s => s.startsWith('trap:')).map(s => s.slice(5)).filter(code => trapName[code]);
      card({ id: c.id, k: 'concept', d: n, o: c.obj, f: c.front, b: c.back, t, g: c.kind });
    }
  }

  // Signal → move: every cheat-sheet row.
  for (const r of cheat.rows) {
    card({
      id: r.id, k: 'signal', d: r.d, o: r.obj, f: r.signal, q: 'What is the move?', b: r.choose,
      x: [['Not', r.not + (r.trap ? ` (${r.trap}, ${trapName[r.trap] || ''})` : '')], ['Unless', r.unless], ['Rule', r.rule]].filter(p => clean(p[1])),
      t: r.trap ? [r.trap] : [],
    });
  }

  // Deciders, explain-why prompts and Foundations notes: every guide section.
  for (let n = 1; n <= 7; n++) {
    for (const s of guide[n].sections) {
      const c = s.contrast;
      if (c) card({
        id: `DC-${s.obj}`, k: 'decider', d: n, o: s.obj, f: `**${c.a.title}** or **${c.b.title}**?`, q: 'What decides between them?',
        b: c.decider, x: [[c.a.title, c.a.text], [c.b.title, c.b.text]],
      });
      if (s.explain) card({ id: `EX-${s.obj}`, k: 'explain', d: n, o: s.obj, f: s.explain.prompt, q: 'Explain it in your own words, then check.', b: s.explain.model });
      if (s.bridge) card({ id: `BR-${s.obj}`, k: 'bridge', d: n, o: s.obj, f: `${s.obj} · ${objShort[s.obj] || ''}`, q: 'Coming from Foundations (CCAR-F): what carries over, and what changes?', b: s.bridge });
    }
    if (guide[n].delta) card({ id: `BR-D${n}`, k: 'bridge', d: n, f: `Domain ${n} · ${bp.domains[n - 1].name}`, q: 'Coming from Foundations (CCAR-F): what changes in this domain?', b: guide[n].delta });
  }

  // Traps.
  for (const t of traps) {
    card({
      id: t.code, k: 'trap', d: 0, f: `**${t.code}** · ${t.name}`, q: 'How do you spot it, and what beats it?', b: t.antidote,
      x: [['Sounds like', (t.tell || []).join('  ·  ')], ['Why it tempts', t.tempts], ['Counter', t.counter], ['Right when', t.rightWhen], ['Example', t.example]].filter(p => clean(p[1])),
      t: [t.code], g: t.family, ds: t.domains,
    });
  }

  // Ladders.
  for (const l of ladders) {
    card({
      id: `LD-${l.id}`, k: 'ladder', d: 0, f: l.name, q: l.question, b: l.oneLine,
      x: l.rungs.map((r, i) => [`${i + 1}. ${r.step}`, `**Use when:** ${r.use_when}${r.climb_if ? `\n**Climb if:** ${r.climb_if}` : ''}`]),
      t: l.traps || [], ds: l.domains,
    });
  }

  // Trigger words: related domains come from the ladder they point to.
  for (const t of triggers) {
    const to = t.points_to, lad = ladderById[to];
    const target = lad ? lad.name : lawText[to] ? `${to}: ${lawText[to]}` : to;
    card({ id: `TW-${slug(t.word)}`, k: 'trigger', d: 0, f: `“${t.word}”`, q: 'What does this word in a stem signal?', b: t.signals, x: [['Points to', target], ['Seen as', t.example]].filter(p => clean(p[1])), ds: lad ? lad.domains : undefined });
  }

  // Method & laws: the item algorithm, the eight laws, multi-response rules, pacing.
  cheat.algorithm.forEach((a, i) => {
    const m = /^([A-Z0-9 ,'’\-()]+\.)\s*(.*)$/s.exec(a);
    card({ id: `AL-${m ? slug(m[1]) : h5(a)}`, k: 'method', d: 0, f: `Item method, step ${i + 1} of ${cheat.algorithm.length}`, q: 'Name the step and what you do in it.', b: m ? `**${m[1]}** ${m[2]}` : a }, true);
  });
  for (const l of cheat.laws) card({ id: `LAW-${l.id}`, k: 'method', d: 0, f: `**${l.id}.** ${l.text}`, q: 'Why does this law hold on the exam?', b: l.why });
  cheat.multi_rules.forEach((r, i) => card({ id: `MR-${h5(r)}`, k: 'method', d: 0, f: `Multi-response items, rule ${i + 1} of ${cheat.multi_rules.length}`, q: 'What is the rule?', b: r }, true));
  if (exam.pacing) {
    card({ id: 'PACE-1', k: 'method', d: 0, f: 'Pacing: how long per item, and where are the checkpoints?', b: exam.pacing.perItem, x: (exam.pacing.checkpoints || []).map((c, i) => [`Checkpoint ${i + 1}`, c]) });
    (exam.pacing.rules || []).forEach((r, i) => card({ id: `PACE-R-${h5(r)}`, k: 'method', d: 0, f: `Pacing rule ${i + 1} of ${exam.pacing.rules.length}`, q: 'What is the rule?', b: r }, true));
  }

  // The 27% myth: the whole explainer, the Foundations-vs-Professional table and the spot checklist.
  const ex27 = exam.explainer27;
  if (ex27) {
    const P27 = ['Where 27% comes from', 'Why it spread', 'What CCAR-P actually weights', 'Why some copies show D1 as 13%', 'Numbered objectives'];
    card({ id: 'MYTH-27', k: 'fact', d: 0, f: 'Is there a 27% domain on CCAR-P?', b: `**${ex27.headline}**`, x: (ex27.paragraphs || []).map((p, i) => [P27[i] || `Note ${i + 1}`, p]) });
    if (ex27.compare) card({ id: 'FVP', k: 'fact', d: 0, f: 'Foundations (CCAR-F) vs Professional (CCAR-P): how do the two exams differ?', q: 'Recall the headline differences, then check.', x: [...ex27.compare.map(r => [r.aspect, `**CCAR-F:** ${r.ccarf}\n**CCAR-P:** ${r.ccarp}`]), ...(ex27.compare.some(r => /numbering/i.test(r.aspect)) ? [] : [['Objective numbering', bp.numberingNote]])] });
    if (ex27.spot_checklist) card({ id: 'SPOT-F', k: 'fact', d: 0, f: 'How do you spot study material written for Foundations, not Professional?', x: ex27.spot_checklist.map((s, i) => [`Sign ${i + 1}`, s]) });
  }

  // Exam tips, with provenance.
  const TIPG = { reading: 'Reading', eliminating: 'Eliminating', 'multi-response': 'Multi-response', timing: 'Timing', domain: 'Domain', logistics: 'Logistics' };
  for (const t of tips) {
    const prov = t.source === 'Community' ? 'Community, not official' : t.source;
    card({ id: t.id, k: 'tip', d: 0, f: t.text, q: 'Why does this work?', b: t.why, t: (t.traps || []).filter(c => trapName[c]), g: [TIPG[t.group] || t.group, prov].filter(Boolean).join(' · '), ds: t.domains && t.domains.length < 7 ? t.domains : undefined });
  }

  // Domain briefs.
  for (const d of bp.domains) {
    const cd = cheat.domains[String(d.n)] || {};
    card({ id: `DB-${d.n}`, k: 'domain', d: d.n, f: `Domain ${d.n} · ${d.name} (${d.weight}%)`, q: 'What does it reward, and what are the three things to remember?', b: cd.what_it_rewards, x: (cd.remember3 || []).map((r, i) => [`Remember ${i + 1}`, r]) });
    if (guide[d.n].intro) card({ id: `DI-${d.n}`, k: 'domain', d: d.n, f: `Domain ${d.n} in one paragraph: how are its items built?`, b: guide[d.n].intro });
    card({ id: `DO-${d.n}`, k: 'domain', d: d.n, f: `Domain ${d.n}: name its ${d.objectives.length} objectives`, q: `${d.weight}% of the exam, about ${d.formQuota} of 63 items.`, x: d.objectives.map(o => [o.id, o.text]) });
  }

  // Exam facts.
  const FLABEL = { official: 'Official', community: 'Community, not official', 'official-ccarf': 'Official (Foundations)', derived: 'Derived', conflict: 'Sources conflict' };
  for (const f of exam.facts) card({ id: f.id, k: 'fact', d: 0, f: f.key, b: f.value, x: [['Note', f.note], ['Source', f.source]].filter(p => clean(p[1])), g: FLABEL[f.label] || f.label });

  // Platform facts (dated, with their docs source). Related domain from the id family.
  const PDOM = { CC: [7], MCP: [3], GOV: [5], API: [2] };
  for (const p of platform) {
    card({
      id: p.id, k: 'platform', d: 0, f: p.topic, b: p.text, x: [['Principle', p.principle], ['Source', p.source]].filter(q => clean(q[1])),
      g: `${p.label === 'conflict' ? 'Sources conflict' : 'Docs'} · as of ${p.asOf}${p.volatile ? ' · may change' : ''}`, ds: PDOM[p.id.split('-')[1]],
    });
  }

  // Meridian case (the portal's running scenario, used by the guide walkthroughs).
  card({ id: 'CASE-0', k: 'case', d: 0, f: `${cs.name}: what is the scenario?`, b: cs.oneLine, x: [['Company', cs.company]] });
  cs.systems.forEach(s => card({ id: `CASE-S-${slug(s.name)}`, k: 'case', d: 0, f: s.name, q: 'What is this system, and what does it constrain?', b: s.role, g: 'System' }));
  cs.people.forEach(p => card({ id: `CASE-P-${slug(p.name)}`, k: 'case', d: 0, f: p.name, q: 'What is their role, and what do they care about?', b: `**${p.role}.** ${p.cares_about || ''}`, g: 'Person' }));
  card({ id: 'CASE-C', k: 'case', d: 0, f: `${cs.name}: the ${cs.constraints.length} binding constraints`, x: cs.constraints.map((c, i) => [`${i + 1}`, c]), g: 'Constraints' });
  for (const b of cs.by_domain) {
    card({ id: `CASE-D${b.domain}`, k: 'case', d: b.domain, f: b.title, q: 'How does the case play out in this domain?', b: guide[b.domain].case || b.story });
    // One card per objective (or objective pair), so no two cards share a question.
    const groups = new Map();
    for (const dec of b.decisions || []) {
      const m = /^(\d\.\d)(?:\s+and\s+(\d\.\d))?:\s*(.*)$/s.exec(dec);
      if (!m) { problems.push(`case decision without objective: ${dec.slice(0, 40)}`); continue; }
      const key = m[2] ? `${m[1]}-${m[2]}` : m[1];
      if (!groups.has(key)) groups.set(key, { objs: [m[1], m[2]].filter(Boolean), list: [] });
      groups.get(key).list.push(m[3]);
    }
    for (const [key, g] of groups) {
      const about = g.objs.map(o => `${o} ${objShort[o] || ''}`.trim()).join(' and ');
      const many = g.list.length > 1;
      card({
        id: `CASE-X-${key}`, k: 'case', d: b.domain, o: g.objs[0], f: `Meridian, ${about}: what ${many ? `are the ${g.list.length} design decisions` : 'does the design decide'}?`,
        b: many ? undefined : g.list[0], x: many ? g.list.map((t, i) => [`Decision ${i + 1}`, t]) : undefined, g: 'Design decision',
      });
    }
  }

  // ---------- MCQs ----------
  // MCQ: { id, h, d, o, s: source, p: form position, n: select count, df, st: stem, ak: ask, op: [{t, c, tr, w}], ex, ru, ct, sg: signals, sp: [[label, text]] }
  const formPos = {};
  for (const [F, ids] of Object.entries(forms)) ids.forEach((id, i) => { formPos[id] = { F, i: i + 1 }; });
  const SETKEY = { formA: 'A', formB: 'B', formC: 'C', pool: 'pool', official: 'official', bridge: 'bridge' };
  const mcqs = [];
  const mcqCheck = q => {
    const nc = q.op.filter(o => o.c).length;
    if (nc !== q.n) problems.push(`mcq ${q.id}: ${nc} keyed options but select ${q.n}`);
    if (q.op.length < 3) problems.push(`mcq ${q.id}: only ${q.op.length} options`);
    if (!q.st) problems.push(`mcq ${q.id}: empty stem`);
    // The hash covers the question and its key (not the explanations), so a changed key drops an old result.
    q.h = h5(plainText([q.st, q.ak, ...q.op.map(o => (o.c ? '*' : '') + o.t)].join(' | ')));
  };
  const bank = loadItems().map(({ _file, ...it }) => it).filter(it => it.status !== 'draft');
  const official = readJSON(C('content/official.json'), []);
  const bridge = readJSON(C('content/bridge.json'), []);
  for (const it of [...official, ...bank, ...bridge]) {
    const s = SETKEY[it.set];
    if (!s) { problems.push(`mcq ${it.id}: unknown set ${it.set}`); continue; }
    if ((s === 'A' || s === 'B' || s === 'C') && formPos[it.id]?.F !== s) problems.push(`mcq ${it.id}: set ${it.set} but not in forms.json ${s}`);
    const q = {
      id: it.id, d: it.domain, o: it.obj, s, p: formPos[it.id]?.i, n: it.select || 1, df: it.diff, st: it.stem, ak: it.ask,
      op: it.options.map(o => ({ t: o.text, c: o.correct ? 1 : 0, tr: o.trap || undefined, w: o.why || undefined })),
      ex: it.explain, ru: it.rule && rowById[it.rule] ? it.rule : undefined, ct: it.counterTrap ? 1 : undefined,
      sg: (it.signals || []).filter(x => clean(x)).length ? it.signals.filter(x => clean(x)) : undefined,
    };
    mcqCheck(q);
    mcqs.push(q);
  }
  for (const [F, ids] of Object.entries(forms)) for (const id of ids) if (!mcqs.some(q => q.id === id && q.s === F)) problems.push(`forms.json ${F}: ${id} did not ship`);
  for (let n = 1; n <= 7; n++) {
    for (const sec of guide[n].sections) {
      const w = sec.worked;
      if (w) {
        const q = {
          id: `GW-${sec.obj}`, d: n, o: sec.obj, s: 'guide', n: w.options.filter(o => o.correct).length, st: w.scenario, ak: w.ask,
          op: w.options.map(o => ({ t: o.text, c: o.correct ? 1 : 0, tr: o.trap || undefined, w: o.why || undefined })),
          sp: [['Binding constraint', w.steps?.constraint], ['Classify', w.steps?.classify], ['Eliminate', w.steps?.eliminate], ['Choose', w.steps?.choose]].filter(p => clean(p[1])),
          g: 'Worked example',
        };
        mcqCheck(q); mcqs.push(q);
      }
      const f = sec.faded;
      if (f) {
        const q = {
          id: `GF-${sec.obj}`, d: n, o: sec.obj, s: 'guide', n: f.options.filter(o => o.correct).length, st: f.scenario, ak: f.ask,
          op: f.options.map(o => ({ t: o.text, c: o.correct ? 1 : 0, tr: o.trap || undefined, w: o.why || undefined })),
          sp: [['Binding constraint', f.constraint], ['Classify', f.classify], ['Reasoning', f.reasoning]].filter(p => clean(p[1])),
          g: 'Guided practice',
        };
        mcqCheck(q); mcqs.push(q);
      }
    }
  }
  // Official samples first (in the exam guide's order), then the forms in delivery order, pool, bridge, guide.
  const ORDER = { official: 0, A: 1, B: 2, C: 3, pool: 4, bridge: 5, guide: 6 };
  const num = { numeric: true };
  mcqs.sort((a, b) => ORDER[a.s] - ORDER[b.s] || (a.p || 0) - (b.p || 0) || (a.s === 'official' ? 0 : a.o.localeCompare(b.o, 'en', num)) || a.id.localeCompare(b.id, 'en', num));

  // ---------- integrity ----------
  const ids = new Set();
  for (const c of cards) { if (ids.has(c.id)) problems.push(`duplicate card id ${c.id}`); ids.add(c.id); }
  for (const q of mcqs) { if (ids.has(q.id)) problems.push(`duplicate id ${q.id}`); ids.add(q.id); }
  for (const q of mcqs) for (const o of q.op) if (o.tr && !trapName[o.tr]) problems.push(`mcq ${q.id}: unknown trap ${o.tr}`);
  if (problems.length) { console.error('BUILD PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }

  const data = {
    meta: { built: stampFor('engine', `guides/${GUIDE}/content`).toISOString().slice(0, 10), version: hashStr(JSON.stringify([cards.map(c => c.id + c.h), mcqs.map(q => q.id + q.h)])).toString(36), exam: bp.version },
    domains: bp.domains.map(d => ({ n: d.n, name: d.name, short: d.short, nick: NICK[d.n], w: d.weight })),
    objs: objShort,
    traps: Object.fromEntries(traps.map(t => [t.code, { n: t.name, k: t.counter, w: t.rightWhen }])),
    rows: Object.fromEntries(cheat.rows.map(r => [r.id, { s: r.signal, c: r.choose, r: r.rule, u: r.unless || undefined }])),
    cards,
    mcqs,
  };

  // What the engine shows around the data: names, deck and set lists, storage key.
  data.ui = {
    title: 'CCAR-P Flashcards', short: 'CCAR-P Cards', key: 'ccarp-flashcards-v1', source: 'the CCAR-P Study Portal content',
    decks: {
      concept: 'Concepts', signal: 'Signal → move', decider: 'Deciders', explain: 'Explain why',
      trap: 'Traps', ladder: 'Ladders', trigger: 'Trigger words', method: 'Method & laws', tip: 'Exam tips',
      domain: 'Domain briefs', bridge: 'From Foundations', fact: 'Exam facts', platform: 'Platform facts', case: 'Meridian case',
    },
    deckGroups: [
      ['Core', ['concept', 'signal', 'decider', 'explain'], 'Concepts are Q&A written from the domain guides. Signal → move is every cheat-sheet row. Deciders pit two good options against each other. Explain why asks you to explain, then check.'],
      ['Exam craft', ['trap', 'ladder', 'trigger', 'method', 'tip'], 'The trap patterns, the ladders that resolve them, the stem words that point to them, the six-step item method and the eight laws.'],
      ['Reference', ['domain', 'bridge', 'fact', 'platform', 'case'], 'Domain summaries, what changed from Foundations, exam and platform facts (dated), and the Meridian case the guides use.'],
    ],
    sets: { A: 'Form A', B: 'Form B', C: 'Form C', pool: 'Practice pool', official: 'Official samples', bridge: 'Foundations bridge', guide: 'Guide walkthroughs' },
    setGroups: [
      ['Exam forms', ['A', 'B', 'C'], 'Three sealed 63-item mock exams, each built to the official blueprint and kept in delivery order.'],
      ['More practice', ['official', 'pool', 'bridge', 'guide'], 'The 3 official samples from the exam guide, the rest of the verified bank, Foundations items rewritten for CCAR-P, and the guide’s worked examples.'],
    ],

    setOrder: ['official', 'A', 'B', 'C', 'pool', 'bridge', 'guide'],
    text: {
      searchCards: 'Search: a term or trap code', searchMcq: 'Search: a word, tool or trap',
      noMatch: 'No matches. Try a trap code like T-REMOVE, or a single word.',
      noteCards: 'Concept cards are written from the seven domain guides, fact-checked against them and checked against the exam items. The other decks are the cheat sheet, traps, ladders and exam facts, word for word. A capped session starts with cards you have not marked as known.',
      noteMcq: 'Forms A, B and C are the three sealed 63-item mock exams built to the official blueprint; the pool holds the remaining verified items. Every option carries its explanation. A capped session starts with unanswered, then missed, questions.',
    },
    defaultSel: { mode: 'cards', decks: ['concept', 'signal', 'decider', 'explain', 'trap', 'ladder'], sets: ['A', 'B', 'C', 'pool', 'official'], doms: [], show: 'all', order: 'seq', size: { cards: 20, mcq: 0 } },
  };
  return { data };
}
