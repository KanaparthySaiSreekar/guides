// Focused regressions for input timing and MCQ skip/keyboard flows.  node test/fc-regress.mjs [--port 9352]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/lib.mjs';
import { launch } from '../tools/cdp.mjs';

const a = process.argv.slice(2);
const port = a.includes('--port') ? +a[a.indexOf('--port') + 1] : 9352;
const FILE = path.join(ROOT, 'dist', 'ccarp', 'flashcards.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/').replace(/ /g, '%20');
const OUT = path.join(ROOT, '.cache', 'fc-regress'); fs.mkdirSync(OUT, { recursive: true });
const BLANK = path.join(OUT, 'blank.html'); fs.writeFileSync(BLANK, '<!doctype html><title>seed</title>');
const BLANK_URL = 'file:///' + BLANK.replace(/\\/g, '/').replace(/ /g, '%20');
const b = await launch({ port });
const fails = [];
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails.push(m); };
const q = e => b.eval(e);
const store = () => q(`JSON.parse(localStorage.getItem('ccarp-flashcards-v1')||'{}')`);
async function seed(state) {
  await b.send('Page.navigate', { url: BLANK_URL }); await b.sleep(200);
  await q(`localStorage.setItem('ccarp-flashcards-v1', ${JSON.stringify(JSON.stringify(state))})`);
  await b.send('Page.navigate', { url: URL + '#study' }); await b.sleep(800);
}
const sess = (mode, ids) => ({ mode, ids, pos: 0, label: 'R', rev: {}, ans: {}, got: [], again: [], missed: [], seen: {}, done: false });
async function key(k, code, vk) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  if (k === 'Enter' || k.length === 1) await b.send('Input.dispatchKeyEvent', { type: 'char', text: k === 'Enter' ? '\r' : k, ...base });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
await b.viewport(390, 844, true);
await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const ids = await (async () => { await b.send('Page.navigate', { url: URL }); await b.sleep(700); return q(`JSON.parse(document.getElementById('fc-data').textContent).cards.filter(c=>c.k==='concept').slice(0,8).map(c=>c.id)`); })();

// 1. reading mode: "2" pressed twice quickly rates only the card on screen
await seed({ cfg: { readMode: true }, sel: { mode: 'cards' }, sessions: { cards: sess('cards', ids) } });
await key('2', 'Digit2', 50); await b.sleep(60); await key('2', 'Digit2', 50); await b.sleep(900);
let st = await store();
ok(Object.keys(st.known || {}).length === 1, `reading mode: a fast double "2" rates one card (${Object.keys(st.known || {}).join(',')})`);

// 2. reading mode: a steady 400 ms rhythm on Got it rates every card
await seed({ cfg: { readMode: true }, sel: { mode: 'cards' }, sessions: { cards: sess('cards', ids) } });
for (let i = 0; i < 6; i++) { await q(`document.querySelector('.dock [data-act="got"]').click()`); await b.sleep(400); }
await b.sleep(600);
st = await store();
ok(Object.keys(st.known || {}).length === 6, `reading mode: six taps 400 ms apart rate six cards (${Object.keys(st.known || {}).length})`);

// 3. MCQ: skip after a tentative pick reveals the key and records nothing
await seed({ sel: { mode: 'mcq' }, sessions: { mcq: sess('mcq', ['OS-1', 'OS-2', 'OS-3']) } });
await q(`document.querySelector('[data-act="pick"][data-i="0"]').click()`); await b.sleep(450);
await q(`document.querySelector('.skipbtn').click()`); await b.sleep(400);
st = await store();
ok(/Answer:/.test(await q(`(document.querySelector('.fb')||{}).textContent||''`)) && !Object.keys(st.res || {}).length, 'skip after a tentative pick shows the answer, unscored');

// 4. MCQ keyboard: pick with a letter, Enter checks, Enter moves on
await seed({ sel: { mode: 'mcq' }, sessions: { mcq: sess('mcq', ['OS-1', 'OS-2', 'OS-3']) } });
await q(`document.querySelector('[data-act="pick"][data-i="1"]').focus()`);
await key('Enter', 'Enter', 13); await b.sleep(450);
await key('Enter', 'Enter', 13); await b.sleep(450);
ok(!!(await q(`!!document.querySelector('.fb')`)), 'Enter on a picked option checks the answer');
await key('Enter', 'Enter', 13); await b.sleep(900);
ok(/^2 of 3$/.test(await q(`document.querySelector('#pos').textContent`)), 'the next Enter moves to the next question');

// 5. a search never silently replaces a live session, even on its first card
await seed({ sel: { mode: 'cards' }, sessions: { cards: sess('cards', ids) } });
await q(`document.querySelector('[data-act="home"]').click()`); await b.sleep(500);
await q(`(()=>{const i=document.querySelector('#q'); i.value='least privilege'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await b.sleep(200);
await q(`document.querySelector('.res').click()`); await b.sleep(300);
const askedInPage = await q(`!!document.querySelector('.cta #replace-yes')`);
await q(`document.querySelector('.cta [data-act="keep"]').click()`); await b.sleep(300);
st = await store();
ok(askedInPage && st.sessions.cards.label === 'R' && await q(`!document.querySelector('.cta #replace-yes')`), 'opening a search result asks in the page before replacing a session at card 1, and Keep keeps it');

// 6. reset needs a second tap (no confirm() in hosted viewers)
await seed({ known: { [ids[0]]: '1:x' }, sel: { mode: 'cards' }, sessions: {} });
await q(`document.querySelector('[data-act="settings"]').click()`); await b.sleep(600);
await q(`localStorage.setItem('x','1')`);
const h0 = await q(`JSON.parse(document.getElementById('fc-data').textContent).cards.find(c=>c.id===${JSON.stringify(ids[0])}).h`);
await q(`document.querySelector('.sheet [data-act="closesheet"]').click()`); await b.sleep(600);
await seed({ known: { [ids[0]]: '1:' + h0 }, sel: { mode: 'cards' }, sessions: {} });
await q(`document.querySelector('[data-act="settings"]').click()`); await b.sleep(600);
await q(`document.querySelector('.sheet [data-act="reset"][data-k="cards"]').click()`); await b.sleep(300);
const armed = /Tap again/.test(await q(`document.querySelector('.sheet [data-act="reset"][data-k="cards"]').textContent`));
st = await store();
const keptAfterOne = Object.keys(st.known || {}).length === 1;
await q(`document.querySelector('.sheet [data-act="reset"][data-k="cards"]').click()`); await b.sleep(300);
st = await store();
ok(armed && keptAfterOne && !Object.keys(st.known || {}).length, 'reset arms on the first tap and clears on the second');

const errs = b.errors();
ok(!errs.length, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
b.close();
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
