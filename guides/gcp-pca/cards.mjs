// GCP-PCA flashcards: the data the flashcards engine shows, built from this guide's content pack (content/).
//   Services & features, Signals, Numbers, Well-Architected: generated from the cheat sheet's tables and bullets
//   Case studies, Product names, Exam facts, Syllabus: generated from the case studies, overview and syllabus
//   Concepts, Traps and a few exam facts: written by hand in content/flashcards.json (each names the cheat-sheet bullets it covers)
//   Questions: the 149 practice questions, with the options reordered so the right answers are spread over A–E
// IDs come from the content, never from positions, and every item carries a hash (h) of what it asks and answers, so saved
// progress cannot attach to a different card after an edit.
//   export default ({ args }) => ({ data })     data = { meta, domains, objs, traps, rows, cards, mcqs, ui }
import fs from 'node:fs';
import { G, GUIDE, readJSON, hashStr, rng, shuffle, stampFor } from '../../tools/lib.mjs';
import { inline, text, tables, items, panels, slug } from '../../tools/html-lite.mjs';

export default function build() {
  const C = f => G('content', f);
  const read = f => fs.readFileSync(C(`sections/${f}.html`), 'utf8');
  const guide = readJSON(C('data.json'));
  const questions = readJSON(C('questions.json'));
  const authored = readJSON(C('flashcards.json')).cards;
  const cheat = read('cheatsheet'), cases = read('cases'), overview = read('overview');
  const problems = [];
  const h5 = s => hashStr(String(s)).toString(36).slice(0, 5);
  const cap = s => s.replace(/^([`*]*)([a-z])/, (m, pre, c) => pre + c.toUpperCase());
  const plainText = s => String(s || '').replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  // objective titles, for labels
  const objs = {};
  for (const d of guide.syllabus) for (const s of d.subs) objs[s.s] = s.t;

  // ---------- cards ----------
  // Card: { id, h, k: deck, d: domain (0 = general), o: objective, f: front, q: prompt line, b: answer, x: [[label, text]], g: tag }
  const cards = [], seen = new Set();
  const add = c => {
    for (const [k, v] of Object.entries(c)) if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete c[k];
    if (!c.f || !(c.b || c.x)) { problems.push(`card ${c.id}: empty front or back`); return; }
    let id = c.id, n = 2; while (seen.has(id)) id = `${c.id}-${n++}`;
    c.id = id; seen.add(id);
    c.h = h5(plainText([c.f, c.q, c.b, ...(c.x || []).flat()].join(' | ')));
    cards.push(c);
  };

  // The cheat sheet, as blocks: id, title, the objectives it points at and its html.
  const blocks = cheat.split('<div class="cs-block block"').slice(1).map(b => {
    const id = /id="([^"]+)"/.exec(b)[1], h3 = /<h3>([\s\S]*?)<\/h3>/.exec(b)[1];
    const refs = (/<span class="eyebrow">guide ([^<]+)<\/span>/.exec(h3)?.[1] || '').split(',').map(s => s.trim()).filter(Boolean);
    return { id, title: text(h3.replace(/<span class="eyebrow">[\s\S]*?<\/span>/, '')), o: refs.find(r => /^\d\.\d$/.test(r)), d: refs.length ? +refs[0].split('.')[0] : 0, html: b };
  });
  const block = Object.fromEntries(blocks.map(b => [b.id, b]));
  const where = b => ({ d: b.d, o: b.o, g: b.title });

  // Decision tables, one spec per table: how each row becomes a card. r = the row's cells as marked-up text.
  const TABLES = {
    'cs-compute#0': { k: 'service', row: r => ({ f: r[0], q: 'When do you pick it, and what should you watch for?', b: r[1], x: [['Watch out for', r[2]]] }) },
    'cs-storage#0': { k: 'service', row: r => ({ f: `Cloud Storage class: ${r[0]}`, q: 'What is its minimum storage duration, typical access and use?', b: `Minimum storage duration: **${r[1]}**.`, x: [['Typical access', r[2]], ['Use for', r[3]]] }) },
    'cs-db#0': { k: 'service', row: r => ({ f: r[0], q: 'What is it, when do you pick it, and what are its limits?', b: `**${r[1]}.** ${r[2]}`, x: [['SLA and limits', r[3]], ['Watch out for', r[4]]] }) },
    'cs-data#0': { k: 'service', row: r => ({ f: r[0], q: 'When do you pick it?', b: r[1], x: [['Note', r[2]]] }) },
    'cs-net#0': { k: 'service', row: r => ({ f: r[0], q: 'What are its bandwidth and SLA design, and when do you pick it?', b: r[3], x: [['Bandwidth', r[1]], ['SLA design', r[2]]] }) },
    'cs-lb#0': { k: 'service', row: r => ({ f: r[0], q: 'Which load balancer fits?', b: r[1] }) },
    'cs-iam#0': { k: 'service', row: r => ({ f: r[0], q: 'What does this organization policy constraint do?', b: r[1] }) },
    'cs-sec#0': { k: 'service', row: r => ({ f: r[0], q: 'Who holds the key, and when do you pick it?', b: `**${r[1]}.** ${r[2]}` }) },
    'cs-comp#0': { k: 'service', row: r => ({ f: r[0], q: 'What should the architecture do?', b: r[1] }) },
    'cs-ai#0': { k: 'service', row: r => ({ f: r[0], q: 'Which answer fits?', b: r[1] }) },
    'cs-mig#0': { k: 'service', row: r => ({ f: `Workload disposition: ${r[0]}`, q: 'What does it mean, and which tools fit?', b: r[1], x: [['Typical tools', r[2]]] }) },
    'cs-mig#1': { k: 'service', row: r => ({ f: r[0], q: 'What is it used for?', b: r[1] }) },
    'cs-rel#0': { k: 'service', row: r => ({ f: `Disaster recovery pattern: ${r[0]}`, q: 'What are its RTO, RPO and cost, and what does it look like?', b: `RTO **${r[1]}**, RPO **${r[2]}**, cost **${r[3]}**.`, x: [['Shape', r[4]]] }) },
    'cs-ops#0': { k: 'service', row: r => ({ f: r[0], q: 'What question does it answer?', b: r[1] }) },
    'cs-cost#0': { k: 'service', row: r => ({ f: r[0], q: 'What is the discount, the commitment, and what does it fit?', b: `**${r[1]}.** ${r[3]}`, x: [['Commitment', r[2]]] }) },
    'cs-waf#0': { k: 'waf', row: r => ({ f: `${r[0]} pillar`, q: 'Which principles should you recognize in answers?', b: r[1] }) },
    'cs-num#0': { k: 'number', row: r => ({ f: r[0], q: 'What is the value?', b: r[1] }) },
    'cs-sig#0': { k: 'signal', row: r => ({ f: r[0], q: 'What should you think?', b: r[1] }) },
  };
  for (const b of blocks) {
    tables(b.html).forEach((t, i) => {
      const spec = TABLES[`${b.id}#${i}`];
      if (!spec) { problems.push(`cheat sheet table ${b.id}#${i} [${t.head.join(' | ')}] has no card spec`); return; }
      for (const cells of t.rows) {
        const r = cells.map(inline), c = spec.row(r);
        add({ id: `${spec.k.toUpperCase().slice(0, 3)}-${b.id.replace('cs-', '')}-${slug(text(c.f))}`, k: spec.k, ...where(b), ...c, g: spec.k === 'service' ? b.title : spec.k === 'signal' ? undefined : b.title });
      }
    });
  }
  for (const key of Object.keys(TABLES)) {
    const [id, i] = key.split('#');
    if (!block[id] || !tables(block[id].html)[+i]) problems.push(`card spec ${key} matches no table`);
  }

  // Bullets. A bullet with a bold lead is a term and its explanation; "a → b" in Quick picks and Common gotchas is a signal.
  // Everything else must be covered by a hand-written card (flashcards.json), tracked by block|panel|number.
  const ARROW_PANELS = new Set(['cs-db|Quick picks', 'cs-lb|Common gotchas']);
  const needAuthored = new Map();   // key -> bullet text
  for (const b of blocks) {
    for (const p of panels(b.html)) {
      p.items.forEach((li, i) => {
        const key = `${b.id}|${p.title}|${i + 1}`, plain = text(li);
        const arrow = li.includes('→') && ARROW_PANELS.has(`${b.id}|${p.title}`) ? li.split('→') : null;
        const lead = /^<b>([\s\S]*?)<\/b>\s*:?\s*([\s\S]*)$/.exec(li);
        if (arrow && arrow.length === 2) add({ id: `SIG-${b.id.replace('cs-', '')}-${slug(text(arrow[0]))}`, k: 'signal', ...where(b), q: 'What should you use or think?', f: cap(inline(arrow[0])), b: cap(inline(arrow[1])).replace(/\.$/, ''), g: `${b.title} · ${p.title}` });
        else if (lead && text(lead[2]).length > 3 && !arrow) add({ id: `SVF-${b.id.replace('cs-', '')}-${slug(text(lead[1]))}`, k: 'service', ...where(b), f: `${p.title}: ${inline(lead[1])}`, q: 'What do you need to know about it?', b: cap(inline(lead[2]).replace(/^[:.\s]+/, '')), g: b.title });
        else needAuthored.set(key, plain);
      });
    }
    const ol = /<ol class="traps">([\s\S]*?)<\/ol>/.exec(b.html);
    if (ol) items(ol[1]).forEach((li, i) => needAuthored.set(`${b.id}|trap|${i + 1}`, text(li)));
  }
  // The NOTE and paragraph blocks inside the cheat sheet are context, not cards, so they need no cover.

  // Hand-written cards.
  const PSEUDO = new Set(['examday|retake', 'examday|results', 'examday|renewal', 'examday|pacing', 'examday|tiebreakers']);
  const covered = new Set();
  for (const a of authored) {
    const first = a.src[0], b = block[first.split('|')[0]];
    for (const s of a.src) {
      if (needAuthored.has(s)) covered.add(s);
      else if (!PSEUDO.has(s)) problems.push(`flashcards.json: "${s}" is not a cheat-sheet bullet that needs a hand-written card`);
    }
    add({ id: `${a.k === 'trap' ? 'TRAP' : a.k === 'fact' ? 'FACT' : a.k === 'number' ? 'NUM' : 'CON'}-${slug(a.front)}`, k: a.k, d: a.d ?? b?.d ?? 0, o: a.o ?? b?.o, f: a.front, b: a.back, x: a.x, g: a.k === 'concept' && b ? b.title : undefined });
  }
  for (const [key, t] of needAuthored) if (!covered.has(key)) problems.push(`no hand-written card covers ${key}: ${t.slice(0, 70)}`);

  // Case studies: summary, environment, every requirement → answer, and the likely question angles.
  for (const m of cases.matchAll(/<article class="case" data-case-panel="([a-z]+)"[^>]*>([\s\S]*?)<\/article>/g)) {
    const key = m[1], a = m[2], name = text(/<h3>([\s\S]*?)<\/h3>/.exec(a)[1]);
    const prose = inline(/<p class="prose">([\s\S]*?)<\/p>/.exec(a)[1]), quote = inline(/<p class="quote">([\s\S]*?)<\/p>/.exec(a)[1]);
    const ps = panels(a), env = ps.find(p => p.title === 'Existing environment'), angles = ps.find(p => p.title === 'Likely question angles');
    if (!guide.cases[key] || guide.cases[key].name !== name) problems.push(`case ${key}: "${name}" does not match data.json`);
    add({ id: `CASE-${key}`, k: 'case', d: 0, f: `${name}: what is the situation?`, q: 'Recall the company, its goals and what matters most.', b: prose, x: [['Priority', quote]], g: name });
    if (env) add({ id: `CASE-${key}-env`, k: 'case', d: 0, f: `${name}: existing environment`, q: 'Which systems and constraints are already in place?', x: env.items.map((li, i) => [`${i + 1}`, inline(li)]), g: name });
    for (const r of tables(a)[0].rows) { const c = r.map(inline); add({ id: `CASE-${key}-${slug(text(c[0]))}`, k: 'case', d: 0, f: `${name}: ${c[0]}`, q: 'What is the likely Google Cloud answer?', b: c[1], g: name }); }
    if (angles) add({ id: `CASE-${key}-angles`, k: 'case', d: 0, f: `${name}: likely question angles`, q: 'Which themes should you expect?', b: angles.items.map(inline).join(' · '), g: name });
  }

  // Product names, retired services, the dated changes and the exam facts: all from the Overview.
  const names = tables(overview)[0];
  if (!names || names.head.length !== 3) problems.push('overview: names table not found');
  else for (const r of names.rows.map(c => c.map(inline))) add({ id: `NAME-${slug(text(r[0]))}`, k: 'name', d: 0, f: `What does the exam and console call “${r[0]}” now?`, b: r[1], x: [['Since', r[2]]] });
  const retiredDiv = /<div class="retired">([\s\S]*?)<\/div>/.exec(overview)?.[1] || '';
  for (const m of retiredDiv.matchAll(/<span><s>([\s\S]*?)<\/s>\s*→\s*([\s\S]*?)<\/span>/g)) add({ id: `NAME-retired-${slug(text(m[1]))}`, k: 'name', d: 0, f: `${inline(m[1])} is retired or closed to new customers. What replaces it?`, b: inline(m[2]), g: 'Retired' });
  for (const m of overview.matchAll(/<li><span class="tl-date">([^<]+)<\/span><div class="tl-body"><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span><\/div><\/li>/g)) add({ id: `FACT-${slug(m[1])}`, k: 'fact', d: 0, f: `What changed ${/^\d/.test(m[1]) ? 'on' : 'in'} ${m[1]}?`, b: `**${inline(m[2])}.** ${inline(m[3])}`, g: 'Dated change' });
  for (const m of overview.matchAll(/<div><dt>([^<]+)<\/dt><dd>([^<]+)<\/dd><\/div>/g)) add({ id: `FACT-exam-${slug(m[1])}`, k: 'fact', d: 0, f: `Professional Cloud Architect exam: ${m[1].toLowerCase()}`, b: inline(m[2]), g: 'Exam format' });

  // Syllabus: each domain and each objective.
  for (const dom of guide.syllabus) {
    add({ id: `OBJ-d${dom.d}`, k: 'objective', d: dom.d, f: `Domain ${dom.d} · ${guide.domainFull[dom.d]} (~${guide.weights[dom.d]}%)`, q: 'Which objectives does it contain?', x: dom.subs.map(s => [s.s, s.t]) });
    for (const s of dom.subs) add({ id: `OBJ-${s.s}`, k: 'objective', d: dom.d, o: s.s, f: `${s.s} ${s.t}`, q: 'What does the exam guide say it covers?', x: s.i.map((t, i) => [`${i + 1}`, t]) });
  }

  // ---------- questions ----------
  // The stored order puts the right answer first or second far more often than chance, and the flashcards show options in
  // stored order, so reorder them deterministically: right answers are spread evenly over the positions, the rest shuffled.
  const used = {}, mcqs = [];
  const sorted = [...questions].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  for (const q of sorted) {
    const r = rng(`pca:${q.id}`), n = q.o.length, k = q.a.length, cnt = (used[n] ||= Array(n).fill(0));
    const tb = Array.from({ length: n }, () => r());
    const slots = [...Array(n).keys()].sort((x, y) => cnt[x] - cnt[y] || tb[x] - tb[y]).slice(0, k).sort((x, y) => x - y);
    for (const s of slots) cnt[s]++;
    const right = q.a.map(i => q.o[i]), wrong = shuffle(q.o.filter((_, i) => !q.a.includes(i)), r);
    const order = Array(n); let ri = 0, wi = 0;
    for (let i = 0; i < n; i++) order[i] = slots.includes(i) ? { t: right[ri++], c: 1 } : { t: wrong[wi++], c: 0 };
    const set = q.cs || `d${q.d}`;
    const m = { id: q.id, d: q.d, s: set, n: k, st: q.q, op: order, ex: q.x };
    m.h = h5(plainText([m.st, ...m.op.map(o => (o.c ? '*' : '') + o.t)].join(' | ')));
    if (new Set(m.op.map(o => o.t)).size !== n) problems.push(`question ${q.id}: duplicate option text`);
    mcqs.push(m);
  }
  const sOrder = key => (/^d\d$/.test(key) ? +key.slice(1) : 10 + Object.keys(guide.cases).indexOf(key));
  mcqs.sort((a, b) => sOrder(a.s) - sOrder(b.s) || a.id.localeCompare(b.id, 'en', { numeric: true }));

  // ---------- integrity ----------
  const ids = new Set();
  for (const c of cards) { if (ids.has(c.id)) problems.push(`duplicate card id ${c.id}`); ids.add(c.id); }
  for (const q of mcqs) { if (ids.has(q.id)) problems.push(`duplicate id ${q.id}`); ids.add(q.id); }
  const front = new Map();
  for (const c of cards) { const key = `${c.k}|${plainText(c.f)}|${plainText(c.q)}`; if (front.has(key)) problems.push(`two cards ask the same thing: ${c.id} and ${front.get(key)}`); front.set(key, c.id); }
  const stray = s => /&[a-z]+;|<\/?[a-z][^>]*>/i.test(s);
  for (const c of cards) if ([c.f, c.q, c.b, ...(c.x || []).flat()].some(t => t && stray(t))) problems.push(`card ${c.id}: leftover HTML or entity`);
  for (const q of mcqs) if ([q.st, q.ex, ...q.op.map(o => o.t)].some(stray)) problems.push(`question ${q.id}: leftover HTML or entity`);
  if (problems.length) { console.error('BUILD PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }

  // ---------- engine data ----------
  const dn = Object.keys(guide.weights).map(Number).sort((a, b) => a - b);
  const caseKeys = Object.keys(guide.cases);
  const sets = {}, setShort = {};
  for (const d of dn) { sets[`d${d}`] = `Domain ${d} · ${guide.domainShort[d]}`; setShort[`d${d}`] = `Domain ${d}`; }
  for (const k of caseKeys) { sets[k] = guide.cases[k].name; setShort[k] = guide.cases[k].name; }
  const data = {
    meta: { built: stampFor('engine', `guides/${GUIDE}/content`, `guides/${GUIDE}/cards.mjs`).toISOString().slice(0, 10), version: hashStr(JSON.stringify([cards.map(c => c.id + c.h), mcqs.map(q => q.id + q.h)])).toString(36), exam: 'Google’s current Professional Cloud Architect exam guide' },
    domains: dn.map(n => ({ n, name: guide.domainFull[n], short: guide.domainShort[n], nick: guide.domainShort[n], w: guide.weights[n] })),
    objs: Object.fromEntries(Object.entries(objs).map(([k, v]) => [k, v])),
    traps: {}, rows: {},
    cards, mcqs,
    ui: {
      title: 'PCA Flashcards', short: 'PCA Cards', key: 'pca-flashcards-v1', source: 'the PCA Study Portal content',
      decks: { concept: 'Concepts', service: 'Services & features', signal: 'Signals', trap: 'Traps', number: 'Numbers', waf: 'Well-Architected', case: 'Case studies', name: 'Product names', fact: 'Exam facts', objective: 'Syllabus' },
      deckGroups: [
        ['Core', ['concept', 'service', 'signal'], 'Concepts are Q&A on the cheat sheet. Services & features turns every decision table and feature list into cards. Signals are the phrases a question uses and what they point to.'],
        ['Exam craft', ['trap', 'number', 'waf'], 'The traps the exam sets, the numbers worth memorizing, and the Well-Architected principles to recognize in answers.'],
        ['Reference', ['case', 'name', 'fact', 'objective'], 'The four case studies (requirement to answer), the product names the exam now uses, exam facts and dated changes, and the syllabus objectives.'],
      ],
      sets,
      setGroups: [
        ['By domain', dn.map(d => `d${d}`), 'Practice questions for each of the six exam domains, with the reasoning behind every answer.'],
        ['Case studies', caseKeys, 'Questions on each of the four case studies. Two of them appear on every exam.'],
      ],
      setOrder: [...dn.map(d => `d${d}`), ...caseKeys],
      text: {
        searchCards: 'Search: a term or product', searchMcq: 'Search: a word, product or case study',
        noMatch: 'No matches. Try a product name like Spanner, or a single word.',
        noteCards: 'The cards come from the cheat sheet, the case studies, the product names and the syllabus, checked against Google’s documentation. A capped session starts with cards you have not marked as known.',
        noteMcq: 'Practice questions for each exam domain and each case study, with the reasoning behind every answer. A capped session starts with unanswered, then missed, questions.',
      },
      setShort,
      defaultSel: { mode: 'cards', decks: ['concept', 'service', 'signal', 'trap'], sets: [...dn.map(d => `d${d}`), ...caseKeys], doms: [], show: 'all', order: 'seq', size: { cards: 20, mcq: 0 } },
    },
  };
  const pos = {}; for (const q of mcqs) q.op.forEach((o, i) => { if (o.c) pos['ABCDE'[i]] = (pos['ABCDE'[i]] || 0) + 1; });
  console.log(`  right answers by position: ${JSON.stringify(pos)}`);
  return { data };
}
