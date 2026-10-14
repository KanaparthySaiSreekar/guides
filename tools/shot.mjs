// Headless Chrome smoke test: screenshots + console errors per route.
//   node tools/shot.mjs [--w 1280 --h 900] [--dark] [--routes "#/,#/cheat"] [--out build/shots]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const a = process.argv.slice(2);
const val = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const W = +val('--w', 1280), H = +val('--h', 900);
const dark = a.includes('--dark');
const out = path.resolve(ROOT, val('--out', '.cache/shots'));
const routes = val('--routes', '#/,#/path,#/blueprint,#/guide,#/guide/d3,#/cheat,#/traps,#/practice,#/progress,#/exam,#/settings,#/about').split(',');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const file = path.join(ROOT, 'dist', 'ccarp', 'portal.html');
const url = 'file:///' + file.replace(/\\/g, '/').replace(/ /g, '%20');
fs.mkdirSync(out, { recursive: true });
const prof = path.join(out, 'profile');
let bad = 0;
for (const r of routes) {
  const name = (r.replace(/[#/?=&]+/g, '_').replace(/^_+|_+$/g, '') || 'today') + `-${W}${dark ? '-dark' : ''}`;
  const png = path.join(out, name + '.png');
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
    '--hide-scrollbars', '--virtual-time-budget=4000', '--enable-logging=stderr', '--v=0', `--screenshot=${png}`];
  if (dark) args.push('--force-dark-mode', '--blink-settings=preferredColorScheme=0');
  args.push(url + r);
  const res = spawnSync(chrome, args, { encoding: 'utf8', timeout: 60000 });
  const log = (res.stderr || '') + (res.stdout || '');
  const errs = log.split('\n').filter(l => /CONSOLE|Uncaught|SyntaxError|TypeError|ReferenceError/i.test(l) && !/DevTools|Refused to apply inline|favicon/i.test(l));
  if (errs.length) bad++;
  console.log(`${fs.existsSync(png) ? 'ok  ' : 'FAIL'} ${r} -> ${path.relative(ROOT, png)}${errs.length ? '\n   ' + errs.slice(0, 6).join('\n   ') : ''}`);
}
process.exit(bad ? 1 : 0);
