// Checks the guides site on a phone viewport: the hub and every guide home render with working links, each app installs
// its own service worker, none intercepts another, all open offline, and CCAR-P's old address lands on the CCAR-P home.
//   node test/site-live.mjs <origin> [--legacy]         e.g. https://kanaparthysaisreekar.github.io --legacy
//   node test/site-live.mjs --serve <site> [--legacy <stubs>] [--migrate <old-site>]
//     serves <site> at /guides/ and <stubs> at /ccarp-flashcards/ on http://localhost:8765, like GitHub Pages (404.html).
//     --migrate first installs the pre-move site (<old-site>, a ccarp-flashcards checkout before the move) with its
//     service workers, then swaps in <stubs>: installed copies must end up on the new home with their old caches gone.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT } from '../tools/lib.mjs';
import { launch } from '../tools/cdp.mjs';
import { SITE, loadGuide } from '../tools/site-lib.mjs';

const a = process.argv.slice(2);
const arg = f => (a.includes(f) && a[a.indexOf(f) + 1] && !a[a.indexOf(f) + 1].startsWith('--') ? path.resolve(a[a.indexOf(f) + 1]) : null);
const guide = loadGuide('ccarp'); // the guide with an old address (legacy redirects, migration, usage flow)
const GUIDES = fs.readdirSync(path.join(ROOT, 'guides'), { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, 'guides', d.name, 'guide.json'))).map(d => loadGuide(d.name));
const BASE = SITE.base, OLD = guide.legacy.base;
let ORIGIN = a.find(x => /^https?:/.test(x))?.replace(/\/+$/, ''), server = null;
const roots = {};
if (a.includes('--serve')) {
  roots[BASE] = arg('--serve');
  if (arg('--legacy')) roots[OLD] = arg('--legacy');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain', '.md': 'text/plain' };
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const pre = Object.keys(roots).find(k => p.startsWith(k)), root = pre && roots[pre];
    if (!root) { res.writeHead(404); return res.end('404'); }
    let f = path.join(root, p.slice(pre.length) + (p.endsWith('/') ? 'index.html' : '')), status = 200;
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { f = path.join(root, '404.html'); status = 404; }
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(status, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    fs.createReadStream(f).pipe(res);
  }).listen(8765);
  ORIGIN = 'http://localhost:8765';
}
if (!ORIGIN) { console.error('usage: node test/site-live.mjs <origin> [--legacy] | --serve <site> [--legacy <stubs>] [--migrate <old-site>]'); process.exit(2); }
const checkLegacy = a.includes('--legacy');
const HOME = `${ORIGIN}${BASE}${guide.slug}/`;
const fails = [];
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails.push(m); };
const status = async u => { try { return (await fetch(u, { redirect: 'manual' })).status; } catch { return 0; } };
const shotDir = path.join(ROOT, '.cache', 'site');

async function browser(port) {
  const b = await launch({ port });
  await b.send('Network.enable');
  await b.viewport(390, 844, true);
  const q = e => b.eval(e);
  // Polls through navigations (the page's context is replaced while it loads).
  const until = async (expr, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await q(expr); if (v) return v; } catch { } await b.sleep(250); } return false; };
  const go = async (url, wait = 2500) => { await b.send('Page.navigate', { url }); await b.sleep(wait); };
  return { b, q, until, go };
}
const atHome = `location.pathname === ${JSON.stringify(BASE + guide.slug + '/')} && document.readyState === 'complete' && !!document.querySelector('h1')`;
const movedShown = `getComputedStyle(document.getElementById('moved')).display !== 'none'`;

// ---------- 1. migration: a phone that installed the old apps opens the old address after the move ----------
const oldSite = arg('--migrate');
if (oldSite) {
  if (!server || !roots[OLD]) { console.error('--migrate needs --serve and --legacy <stubs>'); process.exit(2); }
  const stubs = roots[OLD];
  roots[OLD] = oldSite;
  const { b, q, until, go } = await browser(9381);
  const OLDAPPS = guide.legacy.apps.map(l => ({ ...l, url: `${ORIGIN}${OLD}${l.path}` }));
  for (const l of OLDAPPS) {
    await go(l.url, 3000);
    await until(`navigator.serviceWorker.ready.then(r => !!r.active)`, 8000);
    await b.send('Page.reload', {}); await b.sleep(2000);
    ok(await until(`!!navigator.serviceWorker.controller`), `migrate: old ${l.app} installed and controlled at ${OLD}${l.path}`);
  }
  await q(`localStorage.setItem('site-live-marker', 'kept')`);
  ok((await q(`caches.keys()`)).filter(k => OLDAPPS.some(l => k.startsWith(l.cachePrefix))).length === OLDAPPS.length, 'migrate: both old caches exist');
  roots[OLD] = stubs; // the deploy
  for (const l of OLDAPPS) {
    await go(l.url + (l.app === 'portal' ? '#/guide/d1' : ''), 500);
    ok(await until(atHome, 15000), `migrate: old ${l.app} lands on ${BASE}${guide.slug}/ (${await q('location.pathname + location.hash').catch(() => '?')})`);
  }
  ok(await q(movedShown), 'migrate: moved notice shows');
  ok(await q(`localStorage.getItem('site-live-marker') === 'kept'`), 'migrate: data saved at the old address is readable at the new one');
  await b.sleep(1000);
  const regs = await q(`navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => new URL(r.scope).pathname))`);
  ok(!regs.some(s => s.startsWith(OLD)), `migrate: old service workers unregistered (${regs.join(', ') || 'none'})`);
  const left = (await q(`caches.keys()`)).filter(k => OLDAPPS.some(l => k.startsWith(l.cachePrefix)));
  ok(!left.length, `migrate: old caches deleted${left.length ? ': ' + left.join(', ') : ''}`);
  await b.shot(path.join(shotDir, 'migrated.png'));
  const errs = b.errors().filter(e => !/Failed to load resource|net::ERR_/.test(e));
  ok(!errs.length, `migrate: no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  b.close();
}

// ---------- 2. a fresh visitor ----------
const { b, q, until, go } = await browser(9380);
const noOverflow = `document.documentElement.scrollWidth <= innerWidth`;

await go(`${ORIGIN}${BASE}`);
ok(await q(`document.title === ${JSON.stringify(SITE.title)} && document.querySelector('h1').textContent === ${JSON.stringify(SITE.title)}`), `hub ${BASE}: renders`);
for (const g of GUIDES) ok(await q(`!!document.querySelector('a.tile[href="${g.slug}/"]')`), `hub: lists ${g.code}`);
ok(await q(`document.fonts.check('600 16px "Plex Sans"') && [...document.fonts].some(f => f.status === 'loaded')`), 'hub: site font loads');
ok(await q(noOverflow), 'hub: no horizontal scroll at 390 px');
await b.shot(path.join(shotDir, 'hub.png'));

for (const g of GUIDES) {
  const home = `${ORIGIN}${BASE}${g.slug}/`;
  await go(home);
  ok(await q(`document.querySelector('h1').textContent === ${JSON.stringify(g.name)}`), `${g.code} home: renders`);
  const links = await q(`[...document.querySelectorAll('a[href]:not([href^="#"])')].map(a => a.href)`);
  for (const app of g.apps) ok(links.includes(`${home}${app.slug}/`), `${g.code} home: links to ${app.name}`);
  ok(links.includes(`${ORIGIN}${BASE}`), `${g.code} home: links back to the hub`);
  ok(await q(`[...document.images].every(i => i.complete && i.naturalWidth > 0)`), `${g.code} home: app icons load`);
  if (g.legacy) ok(!(await q(movedShown)), `${g.code} home: moved notice hidden on a normal visit`);
  else ok(!(await q(`!!document.getElementById('moved')`)), `${g.code} home: no moved notice (no old address)`);
  ok(await q(noOverflow), `${g.code} home: no horizontal scroll at 390 px`);
  await b.shot(path.join(shotDir, `home-${g.slug}.png`), true);
  for (const u of links) ok(await status(u) === 200, `link ${u.replace(ORIGIN, '')} is 200`);
}

const missing = `${ORIGIN}${BASE}no-such-page/`;
ok(await status(missing) === 404, `${BASE}no-such-page/ is a 404`);
await go(missing, 1500);
ok(await q(`document.querySelector('h1')?.textContent === 'That page is not here' && ${JSON.stringify(GUIDES.map(g => BASE + g.slug + '/'))}.every(h => !!document.querySelector('a[href="' + h + '"]'))`), '404 page renders with a link to each guide');
ok(await q(`[...document.styleSheets].some(s => s.href && s.href.endsWith('/assets/site.css'))`), '404 page is styled from any depth');

if (checkLegacy) {
  for (const p of [...guide.legacy.apps.map(l => OLD + l.path), `${OLD}portal/#/guide/d1`, `${OLD}icon-192.png`, `${OLD}portal/no-such-page`]) {
    await go(ORIGIN + p, 500);
    ok(await until(atHome, 10000) && await q(movedShown), `legacy ${p} -> ${guide.code} home with the moved notice`);
  }
  await b.shot(path.join(shotDir, 'moved.png'));
  ok(!(await q(`navigator.serviceWorker.getRegistrations().then(rs => rs.some(r => new URL(r.scope).pathname.startsWith(${JSON.stringify(OLD)})))`)), 'legacy: a fresh visit installs no old service worker');
}

// Ready when each app's first screen has rendered (keyed <guide>/<app>). A new app adds its line here.
const APPS = {
  'ccarp/flashcards': `!!document.querySelector('.home h1') && document.title === 'CCAR-P Flashcards'`,
  'ccarp/portal': `document.title.includes('CCAR-P Study Portal') && document.querySelector('#app').children.length > 0 && !!document.querySelector('#app h1, #app h2')`,
  'gcp-pca/portal': `document.title === 'PCA Study Portal 2026' && !document.getElementById('v-overview').hidden && !!document.querySelector('#domainBars .bar-row')`,
};
// Apps that bring their own font files must render with them, not a fallback, online and offline.
const FONTS = { 'gcp-pca/portal': ['Bricolage Grotesque', 'IBM Plex Sans'] };
const fontsOk = fams => `document.fonts.ready.then(() => ${JSON.stringify(fams)}.every(f => [...document.fonts].some(x => x.family.replace(/["']/g, '') === f && x.status === 'loaded')))`;
const ALL = GUIDES.flatMap(g => g.apps.map(app => ({ key: `${g.slug}/${app.slug}`, url: `${ORIGIN}${BASE}${g.slug}/${app.slug}/` })));
for (const { key, url } of ALL) {
  if (!APPS[key]) { ok(false, `${key}: no readiness check in test/site-live.mjs`); continue; }
  await go(url, 3000);
  ok(await until(APPS[key]), `${key}: renders`);
  if (FONTS[key]) ok(await q(fontsOk(FONTS[key])), `${key}: its own fonts load (${FONTS[key].join(', ')})`);
  ok(await q(`Promise.race([navigator.serviceWorker.ready.then(r => !!r.active), new Promise(r => setTimeout(() => r(false), 6000))]).catch(() => false)`), `${key}: service worker active`);
  await b.send('Page.reload', {}); await b.sleep(2500);
  ok(await until(APPS[key]), `${key}: renders after reload`);
  const ctl = await q(`navigator.serviceWorker.controller ? new URL(navigator.serviceWorker.controller.scriptURL).pathname : null`);
  ok(ctl === `${BASE}${key}/sw.js`, `${key}: controlled by its own worker (${ctl})`);
}
const keys = await q(`caches.keys()`);
ok(ALL.every(({ key }) => keys.some(k => k.startsWith(`${BASE.slice(1)}${key}@`))), `each app has its own cache (${keys.join(', ')})`);
const pages = [BASE, ...GUIDES.map(g => BASE + g.slug + '/')];
ok(await q(`navigator.serviceWorker.getRegistrations().then(rs => rs.every(r => !${JSON.stringify(pages)}.includes(new URL(r.scope).pathname)))`), 'no worker controls the hub or a guide home');

await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
for (const { key, url } of ALL) {
  await go(url, 2500);
  ok(await until(APPS[key], 5000), `${key}: opens offline`);
  if (FONTS[key]) ok(await q(fontsOk(FONTS[key])), `${key}: its fonts load offline`);
  await b.shot(path.join(shotDir, `${key.replace('/', '-')}-offline.png`));
}
const errs = b.errors().filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
ok(!errs.length, `no console errors or CSP violations${errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''}`);
const visitorDev = await q(`localStorage.getItem('guides.device')`); // this run's anonymous visitor, erased from a live log below
b.close();

// ---------- 3. usage log: a named visitor's opens and study activity reach the collector, offline events included ----------
// The collector is whatever the built pages point at: a localhost endpoint (build --endpoint http://localhost:8767/e)
// starts analytics/local.mjs; the live one is queried with analytics/.admin-token, and the test device is erased afterwards.
const endpoint = (/data-endpoint="([^"]+)"/.exec(await (await fetch(`${ORIGIN}${BASE}`)).text()) || [])[1];
if (!endpoint) console.log('-    usage log: off in this build (skipped)');
else {
  const local = new URL(endpoint).hostname === 'localhost';
  const col = local ? await (await import('../analytics/local.mjs')).serveLocal({ port: +new URL(endpoint).port, origins: [ORIGIN] }) : null;
  const KEY = local ? 'local-key' : fs.readFileSync(path.join(ROOT, 'analytics', '.admin-token'), 'utf8').trim();
  const adminApi = async (p, init = {}) => (await fetch(new URL(endpoint).origin + p, { ...init, headers: { authorization: 'Bearer ' + KEY } })).json();
  const who = `site-live-${Date.now().toString(36)}`;
  const { b, q, until, go } = await browser(9382);
  const queued = `JSON.parse(localStorage.getItem('guides.queue') || '[]')`;
  const notice = `!!document.querySelector('[aria-label="Usage notice"]')`;

  await go(`${HOME}?u=${who}`);
  ok(await q(`location.search === '' && localStorage.getItem('guides.user') === ${JSON.stringify(who)}`), 'usage: named link recorded and removed from the address bar');
  ok(await q(notice), 'usage: notice shows on the first visit');
  await q(`document.querySelector('[aria-label="Usage notice"] button').click()`);
  ok(!(await q(notice)), 'usage: OK dismisses the notice');
  await go(`${ORIGIN}${BASE}`);
  ok(!(await q(notice)), 'usage: notice stays dismissed on the next page');

  await go(`${HOME}portal/`, 3000);
  await until(APPS.portal);
  const answered = await q(`(() => { const s = CP.sess.create('official'); let n = 0;
    s.qids.forEach((qid, i) => { const it = CP.sess.item(s, i); if (it.type === 'match') return;
      for (const o of it.options.slice(0, it.select)) CP.sess.select(s, qid, o.id, it); if (CP.sess.check(s, qid)) n++; });
    CP.sess.submit(s); location.hash = '#/practice'; return n; })()`);
  await b.sleep(800);

  await go(`${HOME}flashcards/`, 3000);
  await until(APPS.flashcards);
  await b.click('[data-act="start"]'); await b.sleep(500);
  await b.click('#card .front'); await b.sleep(300);
  await b.click('[data-act="got"]'); await b.sleep(900);
  ok(await until(`${queued}.length === 0`, 15000), 'usage: queue drains while online');

  await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await q(`dispatchEvent(new Event('offline'))`);
  await b.click('#card .front'); await b.sleep(300);
  await b.click('[data-act="again"]'); await b.sleep(1800);
  ok(await q(`${queued}.some(e => e.t === 'card_rate' && e.got === 0)`), 'usage: offline events wait in the queue');
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await q(`dispatchEvent(new Event('online'))`);
  ok(await until(`${queued}.length === 0`, 15000), 'usage: queued events are sent when back online');
  // GCP-PCA: a domain drill through the real UI (start, answer, check, finish) and a ticked syllabus objective.
  const button = t => `[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(t)})`;
  await go(`${ORIGIN}${BASE}gcp-pca/`, 1500);
  await go(`${ORIGIN}${BASE}gcp-pca/portal/#mock`, 3000);
  await until(`!!${button('Start drill')}`);
  await q(`${button('Start drill')}.click()`); await b.sleep(500);
  await q(`document.querySelector('.opts .opt').click()`); await b.sleep(300);
  await q(`${button('Check answer')}.click()`); await b.sleep(300);
  await q(`${button('End and see results')}.click()`); await b.sleep(300);
  await q(`${button('Finish and score')}?.click()`);
  ok(await until(`!!document.querySelector('.score-hero')`), 'usage: field guide drill finished through the UI');
  await q(`location.hash = '#syllabus'`); await b.sleep(400);
  await q(`document.querySelector('#sylList input[type=checkbox]').click()`); await b.sleep(400);
  ok(await until(`${queued}.length === 0`, 15000), 'usage: field guide events sent');
  await go(HOME, 1500); // leaving the app records its active time

  const { devices } = await adminApi('/api/devices');
  const d = devices.find(x => x.usr === who);
  ok(!!d, `usage: collector has the device under its name (${who})`);
  if (d) {
    ok(d.opens >= 7, `usage: opens recorded for the hub, both guide homes and all three apps (${d.opens})`);
    ok(answered > 0 && d.answers >= answered, `usage: portal answers recorded (${d.answers} of ${answered})`);
    ok(d.cards >= 2, `usage: flashcard ratings recorded, online and offline (${d.cards})`);
    ok(!!d.ip && !!d.ua && !!d.country, `usage: IP, location and browser recorded (${d.ip}, ${d.city || '?'} ${d.country}, ${d.org || ''})`);
    const { events } = await adminApi(`/api/events?dev=${d.dev}&limit=500`);
    const types = new Set(events.map(e => e.t));
    for (const t of ['open', 'notice_ok', 'session_start', 'answer', 'session_end', 'card_rate', 'checklist', 'active']) ok(types.has(t), `usage: '${t}' events logged`);
    const pca = new Set(events.filter(e => e.app === 'gcp-pca/portal').map(e => e.t));
    ok(['open', 'session_start', 'answer', 'session_end', 'checklist'].every(t => pca.has(t)), `usage: field guide study events logged (${[...pca].join(', ')})`);
    ok(new Set(events.map(e => e.app)).size >= 6, `usage: events tagged by app (${[...new Set(events.map(e => e.app))].join(', ')})`);
    if (!local) ok((await adminApi(`/api/devices/${d.dev}`, { method: 'DELETE' })).ok, 'usage: test device erased from the live log');
  }
  if (!local && visitorDev) ok((await adminApi(`/api/devices/${visitorDev}`, { method: 'DELETE' })).ok, 'usage: anonymous test visitor erased from the live log');
  const uerrs = b.errors().filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  ok(!uerrs.length, `usage: no console errors or CSP violations${uerrs.length ? ': ' + uerrs.slice(0, 4).join(' | ') : ''}`);
  b.close();
  if (col) col.close();
}
if (server) server.close();
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
