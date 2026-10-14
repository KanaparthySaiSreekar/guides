// Ad-hoc probe: node test/fc-debug.mjs "<js expression run after setup>" [setup: mcq-checked|card]
import path from 'node:path';
import { ROOT } from '../tools/lib.mjs';
import { launch } from '../tools/cdp.mjs';
const FILE = path.join(ROOT, 'dist', 'ccarp', 'flashcards.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/').replace(/ /g, '%20');
const [expr, setup = 'mcq-checked'] = process.argv.slice(2);
const b = await launch({ port: 9345 });
await b.viewport(390, 844, true);
await b.send('Page.navigate', { url: URL }); await b.sleep(800);
await b.eval(`localStorage.clear()`);
await b.send('Page.navigate', { url: URL }); await b.sleep(800);
if (setup.startsWith('mcq')) {
  await b.click('[data-act="mode"][data-m="mcq"]');
  await b.click('[data-act="start"]');
  if (setup === 'mcq-checked') { await b.click('[data-act="pick"][data-i="0"]'); await b.click('.dock [data-act="check"]'); }
} else { await b.click('[data-act="start"]'); }
console.log(JSON.stringify(await b.eval(expr), null, 1));
if (process.argv[4]) await b.shot(process.argv[4], true);
b.close();
