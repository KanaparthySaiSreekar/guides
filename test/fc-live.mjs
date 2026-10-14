// Checks a deployed copy: renders on a phone viewport, installs its service worker, and still opens with no network.
//   node test/fc-live.mjs https://<host>/<path>/
import path from 'node:path';
import { ROOT } from '../tools/lib.mjs';
import { launch } from '../tools/cdp.mjs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node test/fc-live.mjs <url>'); process.exit(2); }
const b = await launch({ port: 9370 });
const fails = [];
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails.push(m); };
const q = e => b.eval(e);
await b.send('Network.enable');
await b.viewport(390, 844, true);
await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.send('Page.navigate', { url: URL }); await b.sleep(3000);
ok(await q(`!!document.querySelector('.home h1')`), 'live page renders');
ok(await q(`document.querySelector('link[rel=manifest]') !== null && document.querySelector('meta[name=robots]').content.includes('noindex')`), 'manifest linked and noindex set');
const sw = await q(`navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false)`);
ok(sw, 'service worker is active');
await b.send('Page.reload', {}); await b.sleep(2500);
ok(await q(`!!navigator.serviceWorker.controller`), 'service worker controls the page after a reload');
ok(await q(`caches.keys().then(async ks => { const c = await caches.open(ks[0]); return (await c.keys()).length; })`) >= 6, 'all files are cached');
await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await b.send('Page.reload', {}); await b.sleep(2500);
ok(await q(`!!document.querySelector('.home h1')`), 'opens with no network (offline)');
await q(`document.querySelector('[data-act="start"]').click()`); await b.sleep(600);
ok(await q(`!!document.querySelector('#card .front')`), 'a study session starts offline');
await b.shot(path.join(ROOT, '.cache', 'fc-live-offline.png'));
const errs = b.errors().filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
ok(!errs.length, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
b.close();
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
