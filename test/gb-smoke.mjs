// Guidebook portal flows for any guide that uses engine/guidebook, in headless Chrome over file://: every tab, the cheat-sheet
// filter, plan and syllabus ticks, case tabs, a timed mock scored by its own answers, a domain drill, phone layout, no errors.
//   node test/gb-smoke.mjs --guide gcp-pca [--out .cache/gb-smoke]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DIST, GUIDE } from '../tools/lib.mjs';
import { launch } from '../tools/cdp.mjs';

const a = process.argv.slice(2);
const val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, val('--out', '.cache/gb-smoke'));
const FILE = DIST(GUIDE, 'portal.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/').replace(/ /g, '%20');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const b = await launch({ port: +val('--port', 9347) });
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails.push(msg); };
const q = expr => b.eval(expr);
const sleep = ms => b.sleep(ms);
const goto = async () => { await b.send('Page.navigate', { url: 'about:blank' }); await sleep(150); await b.send('Page.navigate', { url: URL }); await sleep(900); };
// click the visible button whose text starts with `t`
const clickText = async t => q(`(()=>{const x=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.textContent.trim().startsWith(${JSON.stringify(t)})&&!e.disabled); if(!x) return false; x.click(); return true;})()`);
// answer the question on screen by what it says: right = the keyed options, wrong = the first non-keyed ones
const answer = async right => q(`(()=>{
  const GB = window.GB, text = (document.querySelector('.q-text')||{}).textContent;
  const qq = GB.questions.find(x => x.q === text); if (!qq) return 'unknown question: ' + text;
  const want = ${right ? 'qq.a.map(i => qq.o[i])' : 'qq.o.filter((_, i) => !qq.a.includes(i)).slice(0, qq.a.length)'};
  const btns = [...document.querySelectorAll('.opts .opt')];
  for (const w of want) { const bt = btns.find(x => x.textContent.slice(1) === w); if (!bt) return 'option not found: ' + w; bt.click(); }
  return qq.id;
})()`);

await b.viewport(1280, 900, false);
await b.send('Page.navigate', { url: URL });
await sleep(900);
await q(`localStorage.clear()`);
await goto();

const GB = await q(`window.GB`);
const PFX = GB.storage + ':';
console.log(`${GUIDE}: ${GB.sections.length} sections, ${GB.questions.length} questions, storage "${PFX}"\n`);

// ---------- data ----------
ok(GB.questions.every(x => x.a.length >= 1 && x.o.length >= 3 && x.x), 'every question has a key, options and an explanation');
ok(Math.abs(Object.values(GB.weights).reduce((s, v) => s + v, 0) - 100) < 0.01, 'domain weights add up to 100');

// ---------- every tab ----------
for (const s of GB.sections) {
  await q(`location.hash = ${JSON.stringify(s.id)}`); await sleep(250);
  const r = await q(`(()=>{const e=document.getElementById('v-${s.id}'); const t=document.querySelector('.tab[data-view="${s.id}"]'); return {hidden:e.hidden, len:e.innerText.length, cur:t&&t.getAttribute('aria-current')}})()`);
  ok(!r.hidden && r.len > 150 && r.cur === 'page', `tab "${s.id}" opens (${r.len} chars)`);
}
await q(`location.hash = 'overview'`); await sleep(250);
ok(await q(`document.querySelectorAll('#domainBars .bar-row').length`) === Object.keys(GB.weights).length, 'overview draws a bar per domain');
ok(+(await q(`document.getElementById('qcount').textContent`)) === GB.questions.length, 'overview shows the question count');
await b.shot(path.join(OUT, '01-overview.png'));

// ---------- cheat sheet filter ----------
await q(`location.hash = 'cheatsheet'`); await sleep(250);
const blocks0 = await q(`[...document.querySelectorAll('#v-cheatsheet .cs-block')].filter(e=>!e.hidden && e.offsetParent).length`);
await q(`(()=>{const i=document.getElementById('csFilter'); i.value='Spanner'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(400);
const blocks1 = await q(`[...document.querySelectorAll('#v-cheatsheet .cs-block')].filter(e=>!e.hidden && e.offsetParent).length`);
ok(blocks1 > 0 && blocks1 < blocks0, `the filter narrows the cheat sheet (${blocks0} → ${blocks1} blocks)`);
await q(`(()=>{const i=document.getElementById('csFilter'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(300);
ok(await q(`[...document.querySelectorAll('#v-cheatsheet .cs-block')].filter(e=>!e.hidden && e.offsetParent).length`) === blocks0, 'clearing the filter brings every block back');

// ---------- plan and syllabus ticks ----------
const keysBefore = await q(`Object.keys(localStorage).filter(k=>k.startsWith(${JSON.stringify(PFX)})).length`);
await q(`location.hash = 'plan'`); await sleep(250);
const prog0 = await q(`document.querySelector('#v-plan .prog').textContent.trim()`);
await q(`document.querySelector('#v-plan input[type="checkbox"]').click()`); await sleep(250);
const prog1 = await q(`document.querySelector('#v-plan .prog').textContent.trim()`);
ok(prog0 !== prog1 && /^1 of/.test(prog1), `ticking a plan item updates the progress ("${prog0}" → "${prog1}")`);
await q(`location.hash = 'syllabus'`); await sleep(250);
await q(`document.querySelector('#v-syllabus input[type="checkbox"]').click()`); await sleep(250);
ok(/^1 of/.test(await q(`document.querySelector('#v-syllabus .prog').textContent.trim()`)), 'ticking a syllabus objective updates its progress');
ok(await q(`Object.keys(localStorage).filter(k=>k.startsWith(${JSON.stringify(PFX)})).length`) > keysBefore, 'progress is saved under the guide’s own keys');

// ---------- case studies ----------
await q(`location.hash = 'cases'`); await sleep(250);
for (const k of Object.keys(GB.cases)) {
  await q(`(()=>{const x=[...document.querySelectorAll('#v-cases .seg button')].find(e=>e.textContent.trim()===${JSON.stringify(GB.cases[k].name)}); x && x.click();})()`); await sleep(200);
  ok(await q(`(()=>{const p=document.querySelector('article.case[data-case-panel="${k}"]'); return !!p && !p.hidden && p.innerText.length > 400;})()`), `case tab "${GB.cases[k].name}" shows its panel`);
}

// ---------- a half mock, scored by its own answers ----------
await q(`location.hash = 'mock'`); await sleep(300);
await q(`(()=>{const s=document.getElementById('mockLen'); s.value=${JSON.stringify(String(GB.mock.half))}; s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
ok(await clickText('Start mock'), 'start mock');
await sleep(400);
ok(await has('#qTimer'), 'the mock has a countdown timer');
async function has(sel) { return q(`!!document.querySelector(${JSON.stringify(sel)})`); }
const N = GB.mock.half, RIGHT = Math.round(N * 0.8);
ok(new RegExp(`Question 1 of ${N}\\b`).test(await q(`document.querySelector('#quiz').innerText`)), `the mock has ${N} questions`);
let bad = null;
for (let i = 0; i < N; i++) {
  const r = await answer(i < RIGHT);
  if (/unknown|not found/.test(String(r))) { bad = r; break; }
  if (i < N - 1) await clickText('Next question'); await sleep(40);
}
ok(!bad, `answered every question by its own key${bad ? ' (' + bad + ')' : ''}`);
await b.shot(path.join(OUT, '02-mock-question.png'));
ok(await clickText('Finish exam'), 'finish exam');
await sleep(300);
// with every question answered the engine finishes at once; with gaps it asks first
if (await has('.confirm')) await clickText('Finish and score');
await sleep(500);
const res = await q(`document.querySelector('#quiz').innerText`);
ok(new RegExp(`${RIGHT}\\s*of\\s*${N}\\s*correct`, 'i').test(res.replace(/\s+/g, ' ')) || res.includes(`${RIGHT} of ${N}`), `the results page scores ${RIGHT} of ${N} (${(res.match(/\d+ of \d+ correct/) || ['not found'])[0]})`);
ok(/By domain/.test(res), 'the results break the score down by domain');
await b.shot(path.join(OUT, '03-mock-results.png'), true);
const hist = await q(`JSON.parse(localStorage.getItem(${JSON.stringify(PFX + 'history')})||'[]').length`);
ok(hist === 1, 'the finished mock is kept in the history');

// ---------- a domain drill: right, wrong, then results ----------
await q(`location.hash = 'mock'`); await sleep(250);
await clickText('Exit').then(() => {}).catch(() => {});
await goto();
await q(`location.hash = 'mock'`); await sleep(300);
await q(`(()=>{const d=document.getElementById('drillDom'); d.value='1'; d.dispatchEvent(new Event('change',{bubbles:true})); const n=document.getElementById('drillN'); n.value='10'; n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
ok(await clickText('Start drill'), 'start a domain drill');
await sleep(400);
const id1 = await answer(true); ok(!/unknown|not found/.test(id1), `drill: picked the right answer to ${id1}`);
ok(await clickText('Check answer'), 'drill: check answer'); await sleep(250);
ok(/Correct\./.test(await q(`document.querySelector('.explain').innerText`)), 'drill: a right answer says Correct and explains');
await clickText('Next question'); await sleep(250);
const id2 = await answer(false); ok(!/unknown|not found/.test(id2), `drill: picked a wrong answer to ${id2}`);
await clickText('Check answer'); await sleep(250);
ok(/Not quite/.test(await q(`document.querySelector('.explain').innerText`)), 'drill: a wrong answer says Not quite and gives the answer');
ok(await clickText('End and see results'), 'drill: end and see results'); await sleep(300);
await clickText('Finish and score'); await sleep(500);
ok(/By domain/.test(await q(`document.querySelector('#quiz').innerText`)), 'drill: results show');
await clickText('New attempt'); await sleep(300);
ok(await q(`[...document.querySelectorAll('#quiz button')].some(e => /Review mistakes/i.test(e.textContent) && !e.disabled)`), 'a missed question unlocks the mistakes review');

// ---------- phone layout ----------
await b.viewport(390, 844, true);
await sleep(300);
for (const s of GB.sections) {
  await q(`location.hash = ${JSON.stringify(s.id)}`); await sleep(200);
  ok(await q(`document.documentElement.scrollWidth <= innerWidth + 1`), `phone: no horizontal scroll on "${s.id}"`);
}
await b.shot(path.join(OUT, '04-phone-cheatsheet.png'));

const errs = b.errors().filter(e => !/fonts\.css|ERR_FILE_NOT_FOUND/.test(e));
ok(errs.length === 0, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
b.close();
console.log(`\n${fails.length ? 'FAILED ' + fails.length : 'ALL PASSED'} · screenshots in ${path.relative(ROOT, OUT)}`);
process.exit(fails.length ? 1 : 0);
