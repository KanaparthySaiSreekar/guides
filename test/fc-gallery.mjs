// One screenshot per card type, revealed, via a seeded session.  node test/fc-gallery.mjs [--w 390] [--dark] [ids...]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/lib.mjs';
import { launch } from '../tools/cdp.mjs';

const a = process.argv.slice(2);
const W = a.includes('--w') ? +a[a.indexOf('--w') + 1] : 390;
const dark = a.includes('--dark');
const ids = a.filter((x, i) => !x.startsWith('--') && a[i - 1] !== '--w');
const LIST = ids.length ? ids : ['CS-D3-01', 'T-REMOVE', 'LD-pattern', 'DC-3.1', 'EX-3.1', 'TW-irreversible', 'LAW-L2', 'FVP', 'CASE-X-2.5', 'TIP-RD-01', 'DB-1', 'PF-CC-01', 'EF-06', 'C3.1-01', 'GW-3.1', 'GF-3.1', 'P1-1.1-001', 'OS-1', 'FB-41'];
const FILE = path.join(ROOT, 'dist', 'ccarp', 'flashcards.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/').replace(/ /g, '%20');
const OUT = path.join(ROOT, '.cache', 'fc-gallery');
fs.mkdirSync(OUT, { recursive: true });
const b = await launch({ port: 9346, dark });
await b.viewport(W, 844, W < 700);
// Seed storage from a blank local page (file:// pages share storage), so the app's pagehide flush can't overwrite it.
const BLANK = path.join(OUT, 'blank.html'); fs.writeFileSync(BLANK, '<!doctype html><title>seed</title>');
const BLANK_URL = 'file:///' + BLANK.replace(/\\/g, '/').replace(/ /g, '%20');
for (const id of LIST) {
  const mcq = /^(P\d|OS-|FB-|GW-|GF-)/.test(id);
  const sess = { mode: mcq ? 'mcq' : 'cards', ids: [id], pos: 0, label: 'Gallery', rev: { [id]: 1 }, ans: mcq ? {} : {}, got: [], again: [], done: false };
  const mode = mcq ? 'mcq' : 'cards';
  await b.send('Page.navigate', { url: BLANK_URL }); await b.sleep(250);
  await b.eval(`localStorage.setItem('ccarp-flashcards-v1', JSON.stringify({sel:{mode:'${mode}'},sessions:{'${mode}':${JSON.stringify(sess)}}}))`);
  await b.send('Page.navigate', { url: URL + '#study' }); await b.sleep(700);
  if (mcq) { if (await b.eval(`!!document.querySelector('[data-act="toopts"]')`)) { await b.click('[data-act="toopts"]'); await b.sleep(700); } await b.click('[data-act="pick"][data-i="0"]'); const n = await b.eval(`document.querySelector('.selectn')?2:1`); if (n === 2) await b.click('[data-act="pick"][data-i="1"]'); await b.click('.dock [data-act="check"]'); }
  const found = await b.eval(`!!document.querySelector('#card')`);
  await b.shot(path.join(OUT, `${id}${dark ? '-dark' : ''}.png`), true);
  console.log(`${found ? 'ok  ' : 'MISS'} ${id}`);
}
const errs = b.errors();
console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no console errors');
b.close();
