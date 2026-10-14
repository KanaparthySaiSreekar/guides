// Builds the whole site: every guide's apps (standalone files in dist/<guide>/), packaged as installable offline apps
// into docs/ (what GitHub Pages serves), then the hub, 404 and shared assets.
//   node tools/build.mjs [<out dir, default docs>] [--only ccarp,gcp-pca] [--endpoint <url> | --no-analytics]
//   node tools/build.mjs --legacy <dir>    writes redirect stubs for CCAR-P's old address (a ccarp-flashcards checkout)
// A guide is a folder guides/<slug>/ with a guide.json. Each app in it names its engine (portal, guidebook or flashcards);
// the engine's build tool makes dist/<slug>/<app>.html, which is packaged here. Layout and conventions: tools/site-lib.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { P } from './lib.mjs';
import { SITE, loadGuide, packageApp, writeGuide, writeHub, writeLegacy } from './site-lib.mjs';

// Every folder under guides/ with a guide.json; the hub orders them by each guide's "order".
const GUIDES = fs.readdirSync(P('guides'), { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(P('guides', d.name, 'guide.json'))).map(d => d.name).sort();
const args = process.argv.slice(2);
const opt = f => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
// --endpoint <url> points the usage log at another collector (tests use analytics/local.mjs); --no-analytics leaves it out.
const endpoint = opt('--endpoint');
const site = args.includes('--no-analytics') ? { ...SITE, analytics: null } : endpoint ? { ...SITE, analytics: { ...SITE.analytics, endpoint } } : SITE;
const dirArg = args.find((a, i) => !a.startsWith('--') && !['--endpoint', '--only', '--guide'].includes(args[i - 1])) || (args.includes('--legacy') ? null : P('docs'));
if (!dirArg) { console.error('usage: node tools/build.mjs [<out dir>] [--only <guides>] [--endpoint <url> | --no-analytics] | --legacy <dir>'); process.exit(2); }

if (args.includes('--legacy')) {
  const guide = loadGuide('ccarp'), dir = path.resolve(dirArg);
  const target = writeLegacy(dir, guide);
  console.log(`legacy ${dir}: ${guide.legacy.apps.map(a => guide.legacy.base + a.path).join(', ')} -> ${target}`);
  process.exit(0);
}

// Replaces exactly one match, or stops the build: a changed source must be looked at, not silently half-patched.
const once = (html, re, fn, what) => {
  const n = (html.match(re) || []).length;
  if (n !== 1) throw new Error(`${what}: expected one match, found ${n}`);
  return html.replace(re, fn);
};

// What each engine's hosted copy changes in its standalone file, and the tool that builds that file.
const ENGINES = {
  // The portal's CSP blocks everything that is not inline. The hosted copy also allows its own service worker, manifest
  // and icons from the same site, and the usage-log collector; every other network request stays blocked.
  portal: {
    tool: 'build-portal',
    prep: html => {
      html = once(html, /img-src data: blob:;/g, () => "img-src data: blob: 'self';", 'portal CSP img-src');
      html = once(html, /form-action 'none'">/g, () => "form-action 'none'; worker-src 'self'; manifest-src 'self'\">", 'portal CSP end');
      if (site.analytics) {
        html = once(html, /connect-src 'none';/g, () => `connect-src ${new URL(site.analytics.endpoint).origin};`, 'portal CSP connect-src');
        html = once(html, /Everything is stored in this browser only\./g, () => 'Your progress is stored in this browser only. This hosted copy also keeps a usage log (visits and answers, with your IP address and device) for the site owner.', 'portal settings storage line');
      }
      return html;
    },
  },
  flashcards: { tool: 'build-flashcards', prep: html => html },
  // The guidebook links its fonts as fonts/fonts.css (the guide's own folder, cached for offline use) and already announces
  // study events ('guides:track' DOM events, which nothing listens to offline), so the hosted copy needs no patching.
  guidebook: { tool: 'build-guidebook', prep: html => html },
};

const only = opt('--only') ? opt('--only').split(',') : GUIDES;
for (const g of only) if (!GUIDES.includes(g)) { console.error(`unknown guide ${g} (${GUIDES.join(', ')})`); process.exit(2); }
const repo = path.resolve(dirArg);
fs.mkdirSync(repo, { recursive: true });
for (const slug of only) {
  const guide = loadGuide(slug);
  for (const app of guide.apps) {
    if (!ENGINES[app.engine]) throw new Error(`${slug}/${app.slug}: unknown engine "${app.engine}" (${Object.keys(ENGINES).join(', ')})`);
    app.build = app.build || `dist/${slug}/${app.slug}.html`;
    app.icon = app.icon || `guides/${slug}/icons/${app.slug}`;
  }
  // One build per engine tool, then package each app from the file it made.
  for (const tool of new Set(guide.apps.map(a => ENGINES[a.engine].tool))) execFileSync(process.execPath, [P('tools', tool + '.mjs'), '--guide', slug], { stdio: 'inherit' });
  writeGuide(repo, guide, dir => {
    for (const app of guide.apps) {
      const key = `${guide.slug}/${app.slug}`, src = P(app.build);
      if (!fs.existsSync(src)) throw new Error(`missing ${src}: its build did not write it`);
      const kb = Math.round(packageApp(path.join(dir, app.slug), ENGINES[app.engine].prep(fs.readFileSync(src, 'utf8')), { site, guide, app, head: app.head || [] }) / 1024);
      console.log(`  ${site.base}${key}/ (index.html ${kb} KB, sw.js, manifest, icons${app.files ? ', ' + path.basename(app.files) + '/' : ''})`);
    }
  }, site);
  console.log(`  ${site.base}${guide.slug}/ (guide home${(guide.moved || []).length ? `, ${guide.moved.length} moved app address${guide.moved.length > 1 ? 'es' : ''}` : ''})`);
}
const guides = writeHub(repo, site);
console.log(`  ${site.base} (hub: ${guides.map(g => g.code).join(', ')}), 404.html, assets/`);
console.log(`  usage log: ${site.analytics ? site.analytics.endpoint : 'off'}\nsite ${repo}`);
