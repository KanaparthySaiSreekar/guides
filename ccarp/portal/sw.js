// CCAR-P Study Portal: cache-first, so it opens offline. Each deploy has a new cache name and refreshes in the background.
const PREFIX = "guides/ccarp/portal@", CACHE = PREFIX + "sclqxf";
const LEGACY = ["ccarp-portal-"];
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
// Handle only this app's own files, so the site's other pages and apps are never intercepted.
const OWN = new Set(ASSETS.map(a => new URL(a, self.location).href));
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  const stale = k => (k.startsWith(PREFIX) && k !== CACHE) || LEGACY.some(p => k.startsWith(p));
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(stale).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url); u.search = ''; u.hash = '';
  if (req.method !== 'GET' || !OWN.has(u.href)) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('./') : null);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('Offline and not cached yet', { status: 503 });
  }));
});
