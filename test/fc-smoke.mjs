// Flashcards smoke test for any guide, in headless Chrome over file://: every deck opens and reveals, every question set can be
// answered right and wrong, the data is sound, and nothing logs an error.
//   node test/fc-smoke.mjs --guide gcp-pca [--w 390 --h 844] [--out .cache/fc-smoke]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DIST, GUIDE } from '../tools/lib.mjs';
import { launch } from '../tools/cdp.mjs';

const a = process.argv.slice(2);
const val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const W = +val('--w', 390), H = +val('--h', 844);
const OUT = path.resolve(ROOT, val('--out', '.cache/fc-smoke'));
const FILE = DIST(GUIDE, 'flashcards.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/').replace(/ /g, '%20');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const b = await launch({ port: +val('--port', 9346) });
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails.push(msg); };
const q = expr => b.eval(expr);
const text = sel => q(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const has = sel => q(`!!document.querySelector(${JSON.stringify(sel)})`);
const clearSel = () => q(`(()=>{for(let i=0;i<40;i++){const x=document.querySelector('[data-act="deck"][aria-pressed="true"]'); if(!x) break; x.click();}})()`);

await b.viewport(W, H, true);
await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.send('Page.navigate', { url: URL });
await b.sleep(900);
await q(`localStorage.clear()`);
await b.send('Page.navigate', { url: 'about:blank' }); await b.sleep(150);
await b.send('Page.navigate', { url: URL }); await b.sleep(900);

const DATA = await q(`JSON.parse(document.getElementById('fc-data').textContent)`);
const UI = DATA.ui, KEY = UI.key;
console.log(`${GUIDE}: ${DATA.cards.length} cards, ${DATA.mcqs.length} questions\n`);

// ---------- data ----------
ok(DATA.cards.every(c => c.h && c.id && c.f && (c.b || (c.x && c.x.length))), 'every card has an id, hash, front and an answer');
ok(DATA.mcqs.every(m => m.h && m.op.filter(o => o.c).length === m.n && m.op.length >= 3 && m.st && m.ex), 'every question has a hash, a stem, an explanation and a key count equal to its select count');
ok(new Set([...DATA.cards, ...DATA.mcqs].map(x => x.id)).size === DATA.cards.length + DATA.mcqs.length, 'ids are unique');
ok(DATA.cards.every(c => UI.decks[c.k]) && DATA.mcqs.every(m => UI.sets[m.s]), 'every card is in a listed deck and every question in a listed set');
{ // right answers are spread over the positions: the app shows options in stored order
  const single = DATA.mcqs.filter(m => m.n === 1 && m.op.length === 4), cnt = [0, 0, 0, 0];
  for (const m of single) cnt[m.op.findIndex(o => o.c)]++;
  const share = Math.max(...cnt) / Math.max(1, single.length);
  ok(single.length < 20 || share <= 0.4, `right answers are spread over A–D (${cnt.join(' / ')} of ${single.length}; largest share ${(share * 100).toFixed(0)}%)`);
}
{ const doms = new Set(DATA.domains.map(d => d.n)); ok(DATA.cards.every(c => !c.d || doms.has(c.d)) && DATA.mcqs.every(m => doms.has(m.d)), 'every item points at a known domain'); }

// ---------- home ----------
ok(await has('.home h1'), 'home renders');
ok((await text('.home h1')).trim() === UI.title, `the title is "${UI.title}"`);
ok(await q(`document.documentElement.scrollWidth <= innerWidth`), 'no horizontal scroll on home');
ok(await q(`document.title`) === UI.title, 'the page title matches');
for (const k of Object.keys(UI.decks)) ok(await has(`[data-act="deck"][data-k="${k}"]`), `deck "${UI.decks[k]}" is on the home screen`);
await b.shot(path.join(OUT, '01-home.png'));

// ---------- every deck opens, reveals and rates ----------
for (const k of Object.keys(UI.decks)) {
  const n = DATA.cards.filter(c => c.k === k).length;
  if (!n) { ok(false, `deck ${k} has no cards`); continue; }
  await b.click('[data-act="home"]').catch(() => {}); await b.sleep(150);
  await q(`location.hash = '#home'`); await b.sleep(250);
  await clearSel();
  await b.click(`[data-act="deck"][data-k="${k}"]`);
  const label = await text('[data-act="start"]');
  ok(new RegExp(`of ${n} cards|· ${n} cards`).test(label) || (n <= 20 && label.includes(String(n))), `deck "${UI.decks[k]}": start button shows its ${n} cards ("${label.trim()}")`);
  await b.click('[data-act="start"]'); await b.sleep(400);
  const front = (await text('#card .front')).trim();
  ok(front.length > 3 && !/undefined|\[object/.test(front), `deck "${UI.decks[k]}": a card opens ("${front.slice(0, 60)}")`);
  await b.click('#card .front'); await b.sleep(350);
  const back = (await text('#card .back')).trim();
  ok(back.length > 3 && !/undefined|\[object/.test(back), `deck "${UI.decks[k]}": the answer reveals`);
  if (k === Object.keys(UI.decks)[0]) await b.shot(path.join(OUT, '02-card.png'));
  await b.click('[data-act="got"]'); await b.sleep(700);
}
ok(await q(`Object.keys((JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||'{}').known)||{}).length`) >= Object.keys(UI.decks).length, 'ratings are saved under the app’s own key');

// ---------- every question set: answer right, then wrong ----------
await q(`location.hash = '#home'`); await b.sleep(250);
await b.click('[data-act="mode"][data-m="mcq"]');
for (const k of Object.keys(UI.sets)) {
  const qs = DATA.mcqs.filter(m => m.s === k);
  if (!qs.length) { ok(false, `set ${k} has no questions`); continue; }
  await q(`location.hash = '#home'`); await b.sleep(250);
  await clearSel();
  await b.click(`[data-act="deck"][data-k="${k}"]`);
  await b.click('.cta [data-act="start"]'); await b.sleep(400);
  const id = await q(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).sessions.mcq.ids[0]`);
  const m = DATA.mcqs.find(x => x.id === id);
  ok(!!m && m.s === k, `set "${UI.sets[k]}": opens on one of its questions (${id})`);
  if (await has('.dock [data-act="toopts"]')) { await b.click('.dock [data-act="toopts"]'); await b.sleep(700); }
  m.op.forEach(() => {});
  for (let i = 0; i < m.op.length; i++) if (m.op[i].c) await b.click(`[data-act="pick"][data-i="${i}"]`);
  await b.click('.dock [data-act="check"]'); await b.sleep(300);
  ok(await has('.dock .vbtn.good'), `set "${UI.sets[k]}": the right answer is marked correct`);
  ok((await text('.fb')).includes(m.ex.slice(0, 40).replace(/\*\*|`/g, '')) || (await text('.fb')).length > 40, `set "${UI.sets[k]}": the explanation is shown`);
  if (k === Object.keys(UI.sets)[0]) await b.shot(path.join(OUT, '03-question-right.png'), true);
  // a wrong answer on the next question, if there is one
  await b.sleep(300); await b.click('.dock [data-act="next"]'); await b.sleep(700);
  const id2 = await q(`(()=>{const s=JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).sessions.mcq;return s.ids[s.pos]})()`);
  const m2 = DATA.mcqs.find(x => x.id === id2);
  if (m2 && m2.id !== m.id) {
    if (await has('.dock [data-act="toopts"]')) { await b.click('.dock [data-act="toopts"]'); await b.sleep(700); }
    const wrong = m2.op.map((o, i) => (o.c ? -1 : i)).filter(i => i >= 0).slice(0, m2.n);
    for (const i of wrong) await b.click(`[data-act="pick"][data-i="${i}"]`);
    await b.click('.dock [data-act="check"]'); await b.sleep(300);
    ok(await has('.dock .vbtn.bad'), `set "${UI.sets[k]}": a wrong answer is marked not quite`);
  }
}
ok(await q(`document.documentElement.scrollWidth <= innerWidth`), 'no horizontal scroll in the question view');

// ---------- search ----------
await q(`location.hash = '#home'`); await b.sleep(250);
const term = DATA.cards.find(c => /[A-Za-z]{6,}/.test(c.f)).f.match(/[A-Za-z]{6,}/)[0];
if (await has('input[type="search"]')) {
  await q(`(()=>{const i=document.querySelector('input[type="search"]'); i.value=${JSON.stringify(term)}; i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await b.sleep(500);
  ok(await has('[data-act="open"]') || (await text('main')).toLowerCase().includes(term.toLowerCase()), `search finds "${term}"`);
}

const errs = b.errors();
ok(errs.length === 0, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
b.close();
console.log(`\n${fails.length ? 'FAILED ' + fails.length : 'ALL PASSED'} · screenshots in ${path.relative(ROOT, OUT)}`);
process.exit(fails.length ? 1 : 0);
