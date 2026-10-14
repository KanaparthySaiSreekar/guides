// End-to-end UI flows in headless Chrome over file://.  node test/flows.mjs
import { launch } from '../tools/cdp.mjs';
import assert from 'node:assert/strict';

const b = await launch();
const log = (...a) => console.log(...a);
const fail = [];
const step = async (name, fn) => { try { await fn(); log('ok  ', name); } catch (e) { fail.push(name); log('FAIL', name, '\n     ', e.message); } };

await b.viewport(1280, 900, false);
await b.goto('#/');

await step('today renders next-best action', async () => {
  const t = await b.eval(`document.querySelector('.nba h3') && document.querySelector('.nba h3').textContent`);
  assert.ok(t && t.length > 5);
});

await step('tutor drill: pick, check, feedback names the trap or confirms', async () => {
  await b.eval(`CP.ui.startSession('objective',{obj:'3.6'})`); await b.sleep(400);
  assert.match(await b.eval('location.hash'), /#\/s\//);
  const s = await b.eval(`(()=>{const c=CP.router.current(); return CP.sess.get(c.p.parts[1]).qids.length})()`);
  assert.ok(s >= 1);
  // choose a wrong option deliberately (first non-key in display order)
  await b.eval(`(()=>{const c=CP.router.current(), s=CP.sess.get(c.p.parts[1]), it=CP.sess.item(s); const need=it.select; const order=CP.sess.perm(s,it); const wrong=order.filter(id=>!it.options.find(o=>o.id===id).correct); const right=order.filter(id=>it.options.find(o=>o.id===id).correct); const picks=it.type==='multi'?[wrong[0], ...right.slice(0, need-1)]:[wrong[0]]; picks.forEach(id=>{const el=document.querySelector('input[value="'+id+'"]'); el.click();});})()`);
  await b.sleep(200);
  const dis = await b.eval(`document.querySelector('[data-act="rcheck"]').disabled`);
  assert.equal(dis, false);
  await b.click('[data-act="rcheck"]'); await b.sleep(300);
  const fb = await b.eval(`document.querySelector('#fb') && document.querySelector('#fb .vd').textContent`);
  assert.match(fb, /Not quite/);
  const hasWhy = await b.eval(`document.querySelectorAll('.opt .why').length`);
  assert.ok(hasWhy >= 3);
  const rec = await b.eval(`Object.keys(CP.store.S.items).length`);
  assert.equal(rec, 1);
});

await step('multi-response blocks over-selection', async () => {
  await b.eval(`CP.ui.startSession('multi')`); await b.sleep(400);
  const r = await b.eval(`(()=>{const c=CP.router.current(), s=CP.sess.get(c.p.parts[1]), it=CP.sess.item(s); const order=CP.sess.perm(s,it); for(const id of order){document.querySelector('input[value="'+id+'"]').click();} return {n: CP.sess.ans(s,s.qids[s.cur]).sel.length, sel: it.select};})()`);
  assert.equal(r.n, r.sel);
});

await step('form A: timed exam console, navigator, flag, submit, report', async () => {
  const n = await b.eval(`CP.bank.forms.A.length`);
  if (!n) { log('     (skipped: forms not assembled)'); return; }
  await b.eval(`CP.ui.startSession('form',{F:'A'})`); await b.sleep(400);
  assert.equal(await b.eval(`document.body.classList.contains('exam')`), true);
  assert.equal(await b.eval(`!!document.querySelector('#rtimer')`), true);
  assert.equal(await b.eval(`getComputedStyle(document.querySelector('.rail')).display`), 'none');
  // no feedback in exam mode
  await b.eval(`document.querySelector('.opt input').click()`); await b.sleep(150);
  assert.equal(await b.eval(`!!document.querySelector('#fb')`), false);
  await b.key('f');
  assert.equal(await b.eval(`(()=>{const c=CP.router.current(), s=CP.sess.get(c.p.parts[1]); return s.ans[s.qids[0]].flag})()`), true);
  await b.key('ArrowRight');
  assert.equal(await b.eval(`(()=>{const c=CP.router.current(); return CP.sess.get(c.p.parts[1]).cur})()`), 1);
  await b.click('[data-act="rreview"]'); await b.sleep(300);
  assert.match(await b.eval('location.hash'), /screen=review/);
  const cells = await b.eval(`document.querySelectorAll('.navgrid button').length`);
  assert.equal(cells, n);
  // submit via action without confirm dialog
  await b.eval(`(()=>{const id=location.hash.split('/')[2].split('?')[0]; const s=CP.sess.get(id); CP.sess.submit(s); location.hash='#/r/'+s.id;})()`); await b.sleep(400);
  const h1 = await b.eval(`document.querySelector('h1').textContent`);
  assert.match(h1, /Form A/);
  assert.equal(await b.eval(`CP.bank.formState(CP.store.S,'A')`), 'done');
  const rows = await b.eval(`document.querySelectorAll('.tbl tbody tr').length`);
  assert.ok(rows >= 7);
});

await step('persistence: reload keeps answers', async () => {
  const before = await b.eval(`Object.keys(CP.store.S.items).length`);
  await b.goto('#/progress');
  const after = await b.eval(`Object.keys(CP.store.S.items).length`);
  assert.equal(after, before);
});

await step('guide: pretest check records and holds feedback', async () => {
  await b.goto('#/guide/d3');
  const q = await b.eval(`(()=>{const g=document.querySelector('.gq'); return g && g.id.slice(3)})()`);
  if (!q) { log('     (skipped: no pool item)'); return; }
  const Q = `[id="gq-${q}"]`;
  const need = await b.eval(`CP.bank.get('${q}').select`);
  for (let i = 0; i < need; i++) { await b.eval(`document.querySelectorAll('${Q} .opt input')[${i}].click()`); await b.sleep(200); }
  await b.click(`${Q} [data-act="gqcheck"]`); await b.sleep(250);
  const txt = await b.eval(`document.querySelector('${Q}').textContent`);
  assert.match(txt, /Answer recorded/);
});

await step('cheat sheet: filters, night mode, flashcards', async () => {
  await b.goto('#/cheat');
  const rows = await b.eval(`document.querySelectorAll('.csrow').length`);
  assert.ok(rows >= 30, 'print rows ' + rows);
  await b.eval(`document.querySelector('[data-k="extended"]').click()`); await b.sleep(300);
  const rows2 = await b.eval(`document.querySelectorAll('.csrow').length`);
  assert.ok(rows2 > rows);
  await b.goto('#/cheat?tab=flash');
  await b.click('[data-act="fcflip"]'); await b.sleep(200);
  await b.click('[data-act="fcgrade"][data-g="2"]'); await b.sleep(200);
  assert.ok(await b.eval(`Object.keys(CP.store.S.rules).length`) >= 1);
});

await step('settings: theme switch and export object', async () => {
  await b.goto('#/settings');
  await b.click('[data-act="setopt"][data-k="theme"][data-v="dark"]');
  assert.equal(await b.eval(`document.documentElement.getAttribute('data-theme')`), 'dark');
  const e = await b.eval(`CP.store.exportObj().app`);
  assert.equal(e, 'ccarp-portal');
});

await step('no console errors', async () => { const e = b.errors(); assert.equal(e.length, 0, e.join('\n')); });
b.close();
console.log(fail.length ? `\n${fail.length} flow(s) failed` : '\nall flows passed');
process.exit(fail.length ? 1 : 0);
