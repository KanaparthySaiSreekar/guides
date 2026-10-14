// Flashcards QA in headless Chrome over file://: flows, touch swipes, regressions, screenshots, console errors.
//   node test/fc-qa.mjs [--w 390 --h 844] [--out build/fc-shots]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/lib.mjs';
import { launch } from '../tools/cdp.mjs';

const a = process.argv.slice(2);
const val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const W = +val('--w', 390), H = +val('--h', 844);
const OUT = path.resolve(ROOT, val('--out', '.cache/fc-shots'));
const FILE = path.join(ROOT, 'dist', 'ccarp', 'flashcards.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/').replace(/ /g, '%20');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const b = await launch({ port: +val('--port', 9344) });
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails.push(msg); };
const shot = async (name, full) => b.shot(path.join(OUT, `${name}-${W}.png`), full);
const q = expr => b.eval(expr);
const text = sel => q(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const has = sel => q(`!!document.querySelector(${JSON.stringify(sel)})`);
const nums = s => (s.match(/\d+/g) || []).map(Number);
const mobile = W < 700;
const reload = async () => { await b.send('Page.navigate', { url: 'about:blank' }); await b.sleep(150); await b.send('Page.navigate', { url: URL }); await b.sleep(900); };
async function realKey(key, code, vk) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  if (key === 'Enter' || key === ' ') await b.send('Input.dispatchKeyEvent', { type: 'char', text: key === 'Enter' ? '\r' : ' ', ...base });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await b.sleep(250);
}
async function swipe(dx, steps = 8, ms = 16) {
  const r = await q(`(()=>{const e=document.querySelector('#card').getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+Math.min(160,e.height/2)}})()`);
  const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(r.x, r.y) });
  for (let i = 1; i <= steps; i++) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(r.x + (dx * i) / steps, r.y + i) }); await b.sleep(ms); }
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await b.sleep(900);
}
async function tapAt(x, y) {
  const tp = [{ x, y, id: 2, radiusX: 4, radiusY: 4, force: 1 }];
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await b.sleep(350);
}

await b.viewport(W, H, mobile);
await b.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
await b.send('Page.navigate', { url: URL });
await b.sleep(900);
await q(`localStorage.clear()`);
await reload();

// ---------- home ----------
ok(await has('.home h1'), 'home renders');
ok(await q(`document.documentElement.scrollWidth <= innerWidth`), `no horizontal scroll on home (${await q('document.documentElement.scrollWidth')} <= ${W})`);
await shot('01-home-cards');
await shot('01b-home-cards-full', true);
const startLabel = await text('[data-act="start"]');
ok(/Start · 20 of \d+ cards/.test(startLabel), `start button shows a capped session: "${startLabel}"`);
const total0 = nums(startLabel)[1];
await b.click('[data-act="dom"][data-n="3"]');
const total1 = nums(await text('[data-act="start"]')).pop();
ok(total1 > 0 && total1 < total0, `domain filter narrows the pool (${total0} → ${total1})`);
const chip3 = nums(await text('[data-act="dom"][data-n="3"] .n'))[0];
ok(chip3 === total1, `D3 chip count matches the session pool (${chip3} = ${total1})`);
await b.click('[data-act="dom"][data-n="all"]');

// ---------- study: cards ----------
await b.click('[data-act="start"]');
ok(await q(`location.hash`) === '#study', 'start goes to #study');
ok(await has('#card .front'), 'card front renders');
ok(!(await has('#card .back')), 'answer hidden before reveal');
await shot('02-card-front');
await b.click('#card .front'); await b.sleep(400);
ok(await has('#card .back'), 'tap on card reveals the answer');
await shot('03-card-back');
const pos1 = await text('#pos');
await b.click('[data-act="got"]');
await b.sleep(900);
const pos2 = await text('#pos');
ok(/^2 of 20$/.test(pos2), `"Got it" advances (${pos1} → ${pos2})`);
ok(await q(`Object.keys(JSON.parse(localStorage.getItem('ccarp-flashcards-v1')||'{}').known||{}).length`) === 1, 'known state persisted');

if (mobile) {
  // tap in the empty area below the card reveals it
  const below = await q(`(()=>{const r=document.querySelector('#card').getBoundingClientRect();return {x:r.left+r.width/2,y:Math.min(r.bottom+30, innerHeight-120)}})()`);
  if (below.y > (await q(`document.querySelector('#card').getBoundingClientRect().bottom`)) + 5) {
    await tapAt(below.x, below.y);
    ok(await has('#card .back'), 'tap below the card reveals the answer');
    await b.click('[data-act="got"]'); await b.sleep(900);
    ok(/^3 of/.test(await text('#pos')), 'rated after below-card reveal');
    await b.click('[data-act="prev"]'); await b.sleep(900);
  }
  await swipe(-220);
  const pos3 = await text('#pos');
  ok(/^3 of/.test(pos3), `swipe left goes to the next card (${pos2} → ${pos3})`);
  await swipe(220);
  const pos4 = await text('#pos');
  ok(/^2 of/.test(pos4), `swipe right goes back (${pos3} → ${pos4})`);
  await swipe(-40, 4, 40);
  ok(/^2 of/.test(await text('#pos')), 'a short slow drag springs back without moving');
  ok(await q(`getComputedStyle(document.querySelector('#card')).transform`) === 'none', 'card settles at rest after spring-back');
}
// keyboard
await b.key('ArrowRight'); await b.sleep(800);
ok(/^3 of/.test(await text('#pos')), 'ArrowRight moves next');
await b.key(' '); await b.sleep(400);
ok(await has('#card .back'), 'Space reveals');
const againId = await q(`JSON.parse(localStorage.getItem('ccarp-flashcards-v1')).sessions.cards.ids[2]`);
await b.key('1'); await b.sleep(900);
ok(/^4 of 21$/.test(await text('#pos')), `"1" rates again, advances and re-queues the card (${await text('#pos')})`);
ok(await q(`(()=>{const s=JSON.parse(localStorage.getItem('ccarp-flashcards-v1')).sessions.cards; return s.ids.indexOf(${JSON.stringify(againId)}, 3)})()`) === 8, 'the "again" card comes back 6 cards later');
// rapid double next
await b.click('[data-act="next"]'); await b.click('[data-act="next"]'); await b.sleep(1000);
ok(/^6 of/.test(await text('#pos')), `two quick taps on Next move two cards (${await text('#pos')})`);
// double "Got it" during the transition must not skip a card unseen
await b.click('#card .front'); await b.sleep(400);
await b.click('[data-act="got"]'); await b.sleep(120);
const posMid = await text('#pos');
await b.click('[data-act="got"]'); await b.sleep(1000);
ok(/^7 of/.test(posMid) || /^7 of/.test(await text('#pos')), `a second "Got it" mid-transition does not skip an unseen card (${posMid} → ${await text('#pos')})`);
await b.click('[data-act="star"]');
ok(await q(`document.querySelector('#starbtn').getAttribute('aria-pressed')`) === 'true', 'star toggles on');
// Enter on a focused "Again" button must mean Again
await b.click('#card .front'); await b.sleep(400);
await q(`document.querySelector('[data-act="again"]').focus()`);
const idNow = await q(`(()=>{const s=JSON.parse(localStorage.getItem('ccarp-flashcards-v1')).sessions.cards;return s.ids[s.pos]})()`);
await realKey('Enter', 'Enter', 13); await b.sleep(700);
ok(await q(`(JSON.parse(localStorage.getItem('ccarp-flashcards-v1')).known[${JSON.stringify(idNow)}]||'').startsWith('0:')`), 'Enter on a focused Again button records Again');
// skip link keeps the study view
await q(`document.querySelector('.skip').click()`); await b.sleep(300);
ok(await q(`location.hash`) === '#study' && await has('#card'), 'skip link does not leave the study view');

await b.click('[data-act="home"]'); await b.sleep(400);
ok(await q(`location.hash`) === '#home', 'X returns home');
ok(await has('.cta [data-act="resume"]'), 'resume button appears in the bottom bar');
await shot('04-home-resume');

// ---------- MCQ ----------
await b.click('[data-act="mode"][data-m="mcq"]');
ok(!(await has('.cta [data-act="resume"]')), 'the cards session does not show as resumable in MCQ mode');
await shot('05-home-mcq');
const mStart = await text('[data-act="start"]');
ok(/Start · 268 questions/.test(mStart), `default MCQ selection is official + forms + pool: "${mStart}"`);
await b.click('[data-act="start"]');
ok(await has('#card .stem'), 'MCQ stem renders');
ok(/Official sample/.test(await text('#card .meta')), 'the official samples come first');
await shot('06-mcq-question');
if (await has('.dock [data-act="toopts"]')) {
  ok(true, 'options below the fold: dock offers "Answer options" instead of spoiling the answer');
  await b.click('.dock [data-act="toopts"]'); await b.sleep(900);
}
const multi = await has('.selectn');
const n = multi ? 2 : 1;
for (let i = 0; i < n; i++) await b.click(`[data-act="pick"][data-i="${i}"]`);
ok(await q(`document.querySelectorAll('.opt.sel').length`) === n, `picked ${n} option(s)`);
const pickTop = await q(`document.querySelector('.opt[data-i="0"]').getBoundingClientRect().top`);
await b.click('.dock [data-act="check"]');
ok(await has('.fb'), 'check shows the feedback block');
ok(await has('.dock .vbtn'), `the verdict shows in the dock: "${(await text('.dock .vbtn')).trim()}"`);
ok(Math.abs((await q(`document.querySelector('.opt[data-i="0"]').getBoundingClientRect().top`)) - pickTop) < 3, 'the picked option stays under the thumb after checking');
ok(await q(`document.querySelectorAll('.opt .why').length`) >= 4, 'every option shows its explanation after checking');
await shot('07-mcq-feedback-full', true);
await b.sleep(400); await b.click('.dock [data-act="next"]'); await b.sleep(900);
ok(/^2 of/.test(await text('#pos')), 'Next question advances');
if (await has('.dock [data-act="toopts"]')) { await b.click('.dock [data-act="toopts"]'); await b.sleep(900); }
ok(await q(`!!document.querySelector('.dock .mid .btn[disabled]')`), 'with the options in view and nothing picked, the dock offers no spoiler');
await b.click('.skipbtn');
ok(/Answer:/.test(await text('.fb')), '"Skip · show the answer" (under the options) reveals the key, unscored');
// signals + rule "Unless" + trap card on a bank item
await b.click('[data-act="home"]'); await b.sleep(300);
await q(`(()=>{for(let i=0;i<20;i++){const x=document.querySelector('[data-act="deck"][aria-pressed="true"]'); if(!x) break; x.click();}})()`);
await b.click('[data-act="deck"][data-k="official"]');
ok(/· 3 questions/.test(await text('[data-act="start"]')), 'set filter: official only = 3');
await b.click('[data-act="deck"][data-k="official"]');
await b.click('[data-act="deck"][data-k="A"]');
await b.click('.cta [data-act="start"]');
ok(/Form A · Q1/.test(await text('#card .meta')), 'Form A starts at Q1');
if (await has('.dock [data-act="toopts"]')) { await b.click('.dock [data-act="toopts"]'); await b.sleep(900); }
const keyIdx = await q(`(()=>{const D=JSON.parse(document.getElementById('fc-data').textContent);const q=D.mcqs.find(x=>x.s==='A'&&x.p===1);return q.op.findIndex(o=>!o.c)})()`);
const selN = (await has('.selectn')) ? 2 : 1;
const wrongPicks = await q(`(()=>{const D=JSON.parse(document.getElementById('fc-data').textContent);const q=D.mcqs.find(x=>x.s==='A'&&x.p===1);return q.op.map((o,i)=>o.c?-1:i).filter(i=>i>=0).slice(0,${selN})})()`);
for (const i of wrongPicks) await b.click(`[data-act="pick"][data-i="${i}"]`);
await b.click('.dock [data-act="check"]');
ok(await has('mark.sig'), 'signal phrases are highlighted after checking');
ok(await has('.fb .trapcard') || !(await q(`!!JSON.parse(document.getElementById('fc-data').textContent).mcqs.find(x=>x.s==='A'&&x.p===1).op[${keyIdx}].tr`)), 'a wrong pick shows its trap card');
await shot('08-mcq-wrong-full', true);

// ---------- one session per mode ----------
await b.click('[data-act="home"]'); await b.sleep(300);
await b.click('[data-act="mode"][data-m="cards"]');
{ const rt = await text('.cta [data-act="resume"]'); ok(/Resume/.test(rt) && /of 2[12]/.test(rt), `the cards session survives starting an MCQ session (${rt.trim()})`); }

// ---------- General filter does not leak into MCQ ----------
await b.click('[data-act="dom"][data-n="0"]');
await b.click('[data-act="mode"][data-m="mcq"]');
ok(!(await q(`document.querySelector('.cta [data-act="start"]').disabled`)), 'the cards-only General filter does not empty the MCQ pool');
await b.click('[data-act="mode"][data-m="cards"]');
await b.click('[data-act="dom"][data-n="all"]');

// ---------- search ----------
await q(`(()=>{const i=document.querySelector('#q'); i.value='task a'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await b.sleep(200);
ok(await q(`![...document.querySelectorAll('.res .t')].some(e=>/ark>|&lt;|&gt;/.test(e.textContent))`), 'multi-word search highlighting never corrupts markup');
await q(`(()=>{const i=document.querySelector('#q'); i.value='T-REMOVE'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await b.sleep(200);
const nres = await q(`document.querySelectorAll('.res').length`);
ok(nres > 3, `search finds T-REMOVE cards (${nres})`);
ok(/Traps/.test(await text('.res .k')), 'the T-REMOVE trap card ranks first');
await shot('09-search');
await b.click('.res');
ok(await has('.cta #replace-yes'), 'replacing a live session from search asks first, in the page');
await b.click('.cta [data-act="replace"]');
ok(await has('#card .front'), 'opening a search result starts a session');
for (let i = 0; i < nres + 2 && await has('#card'); i++) { await b.click('[data-act="next"]'); await b.sleep(700); }
ok(await has('.fin'), 'finishing a deck shows the done screen');
await shot('10-done');
await b.click('.cta [data-act="home"]'); await b.sleep(400);
ok(await has('.search .clear:not([hidden])'), 'a clear button is offered while a search is active');
await b.click('.search .clear');
ok(await has('[data-act="start"]'), 'clearing the search brings the decks back');

// ---------- settings + back button + dark ----------
await b.click('[data-act="settings"]'); await b.sleep(600);
ok(await has('dialog.dlg[open] .sheet'), 'settings sheet opens as a modal dialog');
await shot('11-settings');
await q(`history.back()`); await b.sleep(700);
ok(!(await has('dialog.dlg[open]')) && await q(`location.hash`) === '#home' && await has('.home'), 'phone back closes the sheet and stays home');
await b.click('[data-act="settings"]'); await b.sleep(600);
await b.click('[data-act="theme"][data-k="dark"]'); await b.sleep(300);
ok(await q(`document.documentElement.dataset.theme`) === 'dark', 'dark theme applies');
await b.click('.sheet [data-act="closesheet"]'); await b.sleep(700);
ok(!(await has('dialog.dlg')), 'sheet closes');
ok(await q(`document.activeElement && document.activeElement.dataset.act`) === 'settings', 'focus returns to the Settings button');
await shot('12-home-dark');
await b.click('[data-act="mode"][data-m="mcq"]');
await b.click('.cta [data-act="start"]');
if (await has('.dock [data-act="toopts"]')) { await b.click('.dock [data-act="toopts"]'); await b.sleep(900); }
await b.click('[data-act="pick"][data-i="1"]');
if (await has('.selectn')) await b.click('[data-act="pick"][data-i="2"]');
await b.click('.dock [data-act="check"]');
await shot('13-mcq-dark-full', true);
// reading mode from the home Style switch
await b.click('[data-act="home"]'); await b.sleep(300);
await b.click('[data-act="mode"][data-m="cards"]');
await b.click('[data-act="style"][data-k="read"]');
await b.click('.cta [data-act="start"]');
ok(await has('#card .back'), 'reading mode shows answers straight away');
await shot('14-readmode-dark');
ok(await q(`document.documentElement.scrollWidth <= innerWidth`), 'no horizontal scroll in study view');

// ---------- data sanity inside the page ----------
const sanity = await q(`(()=>{const D=JSON.parse(document.getElementById('fc-data').textContent);const bad=[];for(const m of D.mcqs){const k=m.op.filter(o=>o.c).length;if(k!==m.n)bad.push(m.id);}return {mcqs:D.mcqs.length,bad,noH:[...D.cards,...D.mcqs].filter(x=>!x.h).length}})()`);
ok(sanity.bad.length === 0, `all ${sanity.mcqs} MCQs have key count == select count`);
ok(sanity.noH === 0, 'every item carries a content hash');

const errs = b.errors();
ok(errs.length === 0, `no console errors${errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''}`);
b.close();
console.log(`\n${fails.length ? 'FAILED ' + fails.length : 'ALL PASSED'} · screenshots in ${path.relative(ROOT, OUT)}`);
process.exit(fails.length ? 1 : 0);
