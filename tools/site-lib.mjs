// The multi-guide static site (GitHub Pages, repo KanaparthySaiSreekar/guides). Layout under the site base:
//   /guides/                     hub: lists every guide found in <repo>/*/guide.json
//   /guides/<guide>/             guide home: links to that guide's apps
//   /guides/<guide>/<app>/       one app, with its own service worker scope, manifest and icons, so apps never intercept each other
//   /guides/assets/              fonts, stylesheet and icon shared by the hub, guide homes and 404
// A guide is a folder holding guide.json, index.html and one folder per app. Adding a guide means writing that folder
// (writeGuide) and rebuilding the hub (writeHub); nothing else on the site changes.
import fs from 'node:fs';
import path from 'node:path';
import { P, hashStr, readJSON } from './lib.mjs';

export const SITE = readJSON('site/site.json');
export const loadGuide = slug => readJSON(`guides/${slug}/guide.json`);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const CHEVRON = '<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
// Site pages load only their own stylesheet, fonts, images and usage-log script, and talk only to the collector.
const csp = ep => `default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; ${ep ? `script-src 'self'; connect-src ${new URL(ep).origin}; ` : ''}base-uri 'none'; form-action 'none'`;
const TRACK = () => fs.readFileSync(P('site/track.js'), 'utf8');
// The usage log (site/track.js) for one page or app, or null when the site has no collector.
const trackFor = (site, app) => (site.analytics?.endpoint ? { endpoint: site.analytics.endpoint, app } : null);

function page({ title, description, assets, body, track }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp(track?.endpoint)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F3F6FB" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0B1628" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(description)}">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${assets}site.css">
<link rel="icon" type="image/svg+xml" href="${assets}icon.svg">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="page">
${body}
</div>
${track ? `<script src="${assets}track.js" data-endpoint="${esc(track.endpoint)}" data-app="${esc(track.app)}"></script>\n` : ''}</body>
</html>
`;
}

// Removes a directory this tool owns (it holds the marker file), or refuses, so a typo can never wipe something else.
function replaceDir(dir, marker) {
  if (fs.existsSync(dir)) {
    if (!fs.existsSync(path.join(dir, marker))) throw new Error(`refusing to replace ${dir}: no ${marker} inside`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// One app as an installable offline web app in <dir>: the page with its manifest, icons and service-worker registration,
// plus a cache-first worker. The cache name carries the app's path, so apps (and future guides) can never delete each
// other's caches; legacyCaches lists cache prefixes from the app's old address, cleared on activation. With a collector,
// the usage log goes in inline right after <body>, so it is listening before the app's own script runs.
export function packageApp(dir, html, { site = SITE, guide, app, head = [] }) {
  fs.mkdirSync(dir, { recursive: true });
  const track = trackFor(site, `${guide.slug}/${app.slug}`);
  const reg = `<script>if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });</script>`;
  const tags = [
    ...head,
    '<meta name="robots" content="noindex, nofollow">',
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="icon-180.png">',
    '<link rel="icon" type="image/png" href="icon-192.png">',
  ];
  for (const what of ['<title>', '<body>', '</body>']) {
    const n = html.split(what).length - 1;
    if (n !== 1) throw new Error(`${app.slug}: expected one ${what}, found ${n}`);
  }
  let out = html.replace('<title>', () => tags.join('\n') + '\n<title>').replace('</body>', () => reg + '\n</body>');
  if (track) out = out.replace('<body>', () => `<body>\n<script data-endpoint="${esc(track.endpoint)}" data-app="${esc(track.app)}">${TRACK().replace(/<\/script/gi, '<\\/script')}</script>`);
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  for (const n of [180, 192, 512]) fs.copyFileSync(P(`${app.icon}-${n}.png`), path.join(dir, `icon-${n}.png`));
  // app.files: a folder (e.g. self-hosted fonts) copied next to the page under its own name and cached for offline use.
  const extra = [];
  if (app.files) {
    const name = path.basename(app.files), to = path.join(dir, name);
    fs.cpSync(P(app.files), to, { recursive: true });
    for (const f of fs.readdirSync(to, { recursive: true })) if (fs.statSync(path.join(to, f)).isFile()) extra.push(`./${name}/${f.split(path.sep).join('/')}`);
  }
  fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify({
    name: app.title, short_name: app.shortName, description: app.description, start_url: './', scope: './', display: 'standalone',
    background_color: app.background || '#F3F6FB', theme_color: app.background || '#F3F6FB',
    icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
  }, null, 1));
  const scope = `${site.base.replace(/^\/|\/$/g, '')}/${guide.slug}/${app.slug}`;
  const legacy = (guide.legacy?.apps || []).filter(l => l.app === app.slug).map(l => l.cachePrefix);
  fs.writeFileSync(path.join(dir, 'sw.js'), `// ${app.title}: cache-first, so it opens offline. Each deploy has a new cache name and refreshes in the background.
const PREFIX = ${JSON.stringify(scope + '@')}, CACHE = PREFIX + ${JSON.stringify(hashStr(out).toString(36))};
const LEGACY = ${JSON.stringify(legacy)};
const ASSETS = ${JSON.stringify(['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', ...extra])};
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
`);
  return Buffer.byteLength(out);
}

// An app that moved to another address inside its guide (guide.moved: [{ from, to, name, cachePrefix }]): the old address
// redirects to the new app, keeping the #section, and the old service worker is replaced by one that deletes the old cache,
// unregisters itself and sends any open window to the new address, so installed copies stop serving the old app.
// Progress is kept: it lives in localStorage, and every page on the site shares one origin.
function writeMoved(dir, guide, site) {
  for (const m of guide.moved || []) {
    if (!SLUG.test(m.from) || !SLUG.test(m.to)) throw new Error(`${guide.slug}: bad moved app ${m.from} -> ${m.to}`);
    const target = guide.apps.find(a => a.slug === m.to);
    if (!target) throw new Error(`${guide.slug}: ${m.from} moved to unknown app ${m.to}`);
    if (guide.apps.some(a => a.slug === m.from)) throw new Error(`${guide.slug}: ${m.from} is both an app and a moved address`);
    const to = `${site.base}${guide.slug}/${m.to}/`, d = path.join(dir, m.from);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=${to}">
<link rel="canonical" href="${site.origin}${to}">
<title>Moved · ${esc(m.name)}</title>
<script>location.replace(${JSON.stringify(to)} + location.hash);</script>
</head>
<body style="font:16px/1.5 system-ui,sans-serif;margin:40px 20px;color:#15233A;background:#F3F6FB">
<p>${esc(m.name)} is now the <a href="${to}">${esc(target.name)}</a>. Your progress carries over.</p>
</body>
</html>
`);
    fs.writeFileSync(path.join(d, 'sw.js'), `// ${m.name} moved to ${to}
// Replaces the old offline worker: deletes its cache, unregisters, and sends any open window to the new address.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const ks = await caches.keys();
  await Promise.all(ks.filter(k => k.startsWith(${JSON.stringify(m.cachePrefix)})).map(k => caches.delete(k)));
  await self.clients.claim();
  const wins = await self.clients.matchAll({ type: 'window' });
  await self.registration.unregister();
  await Promise.all(wins.map(w => w.navigate(${JSON.stringify(to)} + (w.url.includes('#') ? '#' + w.url.split('#')[1] : '')).catch(() => null)));
})()));
`);
  }
}

// A guide's folder: replaced whole, then filled by build(dir) with one subfolder per app, then the home page and guide.json.
export function writeGuide(repo, guide, build, site = SITE) {
  if (!SLUG.test(guide.slug)) throw new Error(`bad guide slug ${guide.slug}`);
  for (const a of guide.apps) if (!SLUG.test(a.slug)) throw new Error(`bad app slug ${a.slug}`);
  const dir = path.join(repo, guide.slug);
  replaceDir(dir, 'guide.json');
  build(dir);
  for (const a of guide.apps) if (!fs.existsSync(path.join(dir, a.slug, 'index.html'))) throw new Error(`${guide.slug}/${a.slug} was not built`);
  writeMoved(dir, guide, site);
  const tiles = guide.apps.map(a => `<li><a class="tile" href="${a.slug}/">
<img src="${a.slug}/icon-192.png" alt="" width="60" height="60">
<span class="tile-body"><h2>${esc(a.name)}</h2><p>${esc(a.description)}</p><p class="meta">${esc(a.fit)} · Works offline</p></span>
${CHEVRON}</a></li>`).join('\n');
  // Only a guide with an old address (guide.legacy) gets the notice its redirects land on (#moved).
  const moved = guide.legacy ? `<div class="moved" id="moved" role="note">
<p><strong>The ${esc(guide.code)} apps have moved to this address.</strong> Progress saved in this browser carries over.</p>
<p>If you added an app to your home screen, add it again from its page below. The old icon now opens this page.</p>
</div>
` : '';
  const one = guide.apps.length === 1;
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">${BACK}${esc(site.title)}</a></nav>
${moved}<header class="head">
<p class="eyebrow">${esc(guide.code)}</p>
<h1>${esc(guide.name)}</h1>
<p class="lede">${esc(guide.summary)}</p>
</header>
<main id="main">
<ul class="list">
${tiles}
</ul>
<section class="note" aria-labelledby="offline">
<h2 id="offline">Offline and on your phone</h2>
<p>${one ? 'The app keeps a copy of itself' : 'Each app keeps a copy of itself'} after your first visit, so it opens without a connection. To keep ${one ? 'it' : 'one'} on your phone, open it and add it to your home screen (on iPhone: Share, then Add to Home Screen).</p>
<p>Your progress stays in this browser on this device.${guide.progressNote ? ' ' + esc(guide.progressNote) : ''}</p>
${site.analytics ? `<p>This site keeps a usage log: your IP address, device and browser, the pages you open and the answers you give, so its owner can see how the guides are used.</p>\n` : ''}</section>
</main>`;
  fs.writeFileSync(path.join(dir, 'index.html'), page({ title: `${guide.code} · ${site.title}`, description: guide.summary, assets: '../assets/', body, track: trackFor(site, guide.slug) }));
  const { legacy, moved: _moved, ...meta } = guide;
  fs.writeFileSync(path.join(dir, 'guide.json'), JSON.stringify({ ...meta, apps: guide.apps.map(({ build: _b, icon: _i, files: _f, engine: _e, head: _h, ...a }) => a) }, null, 1) + '\n');
  return dir;
}

// The site root: hub (from every <repo>/*/guide.json), 404, shared assets, robots.txt and .nojekyll.
export function writeHub(repo, site = SITE) {
  const guides = fs.readdirSync(repo, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(repo, d.name, 'guide.json')))
    .map(d => JSON.parse(fs.readFileSync(path.join(repo, d.name, 'guide.json'), 'utf8')))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.code.localeCompare(b.code));
  if (!guides.length) throw new Error(`no guides found in ${repo}`);
  const tiles = guides.map(g => `<li><a class="tile" href="${g.slug}/">
<span class="code" aria-hidden="true">${esc(g.code)}</span>
<span class="tile-body"><h2>${esc(g.name)}</h2><p>${esc(g.summary)}</p><p class="meta">${g.apps.map(a => esc(a.name)).join(' · ')}</p></span>
${CHEVRON}</a></li>`).join('\n');
  fs.writeFileSync(path.join(repo, 'index.html'), page({ title: site.title, description: site.summary, assets: 'assets/', track: trackFor(site, 'hub'), body: `<header class="head">
<h1>${esc(site.title)}</h1>
<p class="lede">${esc(site.summary)}</p>
</header>
<main id="main">
<ul class="list">
${tiles}
</ul>
</main>` }));
  // GitHub Pages serves 404.html at any missing path, so it links with absolute paths under the site base.
  fs.writeFileSync(path.join(repo, '404.html'), page({ title: `Page not found · ${site.title}`, description: 'Page not found.', assets: `${site.base}assets/`, body: `<header class="head">
<p class="eyebrow">404</p>
<h1>That page is not here</h1>
<p class="lede">It may have moved. Every guide is listed on the <a href="${site.base}">${esc(site.title)}</a> page.</p>
</header>
<main id="main">
<ul class="list">
${guides.map(g => `<li><a class="tile" href="${site.base}${g.slug}/">
<span class="code" aria-hidden="true">${esc(g.code)}</span>
<span class="tile-body"><h2>${esc(g.name)}</h2></span>
${CHEVRON}</a></li>`).join('\n')}
</ul>
</main>` }));
  const assets = path.join(repo, 'assets');
  replaceDir(assets, 'site.css');
  fs.mkdirSync(path.join(assets, 'fonts'));
  const FONTS = [['ibm-plex-sans-latin-wght-normal.woff2', 'Plex Sans', '100 700'], ['ibm-plex-mono-latin-500-normal.woff2', 'Plex Mono', '500']];
  for (const [f] of FONTS) fs.copyFileSync(P('engine/shared/fonts', f), path.join(assets, 'fonts', f));
  fs.copyFileSync(P('engine/shared/fonts/OFL-plex.txt'), path.join(assets, 'fonts', 'OFL.txt'));
  const fontCss = FONTS.map(([f, fam, w]) => `@font-face{font-family:"${fam}";src:url(fonts/${f}) format("woff2");font-weight:${w};font-style:normal;font-display:swap}`).join('\n');
  fs.writeFileSync(path.join(assets, 'site.css'), [fontCss, fs.readFileSync(P('engine/shared/css/tokens.css'), 'utf8'), fs.readFileSync(P('site/site.css'), 'utf8')].join('\n'));
  fs.copyFileSync(P('site/icon.svg'), path.join(assets, 'icon.svg'));
  if (trackFor(site, 'hub')) fs.writeFileSync(path.join(assets, 'track.js'), TRACK());
  fs.writeFileSync(path.join(repo, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(repo, '.nojekyll'), '');
  return guides;
}

// The old address of a guide (its legacy block), as redirect stubs: every page and any missing path go to the guide's
// home on the new site, and each old service worker is replaced by one that deletes the old cache, unregisters itself
// and moves any open window to the new home, so installed copies stop serving the old app.
export function writeLegacy(dir, guide, site = SITE) {
  const L = guide.legacy;
  if (!L) throw new Error(`${guide.slug} has no legacy address`);
  const target = `${site.base}${guide.slug}/#moved`;
  const abs = site.origin + target;
  const stub = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${abs}">
<title>Moved · ${esc(guide.code)}</title>
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body style="font:16px/1.5 system-ui,sans-serif;margin:40px 20px;color:#15233A;background:#F3F6FB">
<p>The ${esc(guide.code)} apps have moved to <a href="${target}">${esc(abs)}</a>.</p>
</body>
</html>
`;
  for (const a of L.apps) {
    const d = path.join(dir, a.path);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), stub);
    fs.writeFileSync(path.join(d, 'sw.js'), `// This app moved to ${abs}
// Replaces the old offline worker: deletes its cache, unregisters, and sends any open window to the new address.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const ks = await caches.keys();
  await Promise.all(ks.filter(k => k.startsWith(${JSON.stringify(a.cachePrefix)})).map(k => caches.delete(k)));
  await self.clients.claim();
  const wins = await self.clients.matchAll({ type: 'window' });
  await self.registration.unregister();
  await Promise.all(wins.map(w => w.navigate(${JSON.stringify(target)}).catch(() => null)));
})()));
`);
  }
  fs.writeFileSync(path.join(dir, '404.html'), stub);
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(dir, '.nojekyll'), '');
  fs.writeFileSync(path.join(dir, 'README.md'), `# Moved\n\nThe ${guide.code} apps now live at ${abs.replace(/#moved$/, '')} (repository: [${site.repo}](https://github.com/${site.repo})).\nThis repository only redirects old links there and retires the old offline copies.\n`);
  return target;
}
