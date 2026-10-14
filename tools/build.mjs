// Builds the whole site: every guide's apps (standalone files in dist/<guide>/), packaged as installable offline apps
// into docs/ (what GitHub Pages serves), then the hub, 404 and shared assets.
//   node tools/build.mjs [<out dir, default docs>] [--only ccarp,gcp-pca] [--endpoint <url> | --no-analytics]
//   node tools/build.mjs --legacy <dir>    writes redirect stubs for CCAR-P's old address (a ccarp-flashcards checkout)
// Layout and conventions: tools/site-lib.mjs. Guide definitions: guides/<guide>/guide.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { P, ROOT } from './lib.mjs';
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

// Guide builds that run before packaging.
const BEFORE = {
  ccarp: () => { for (const t of ['build-portal', 'build-flashcards']) execFileSync(process.execPath, [P('tools', t + '.mjs'), '--guide', 'ccarp'], { stdio: 'inherit' }); },
};

// Per-app changes to the source file before packaging (keyed <guide>/<app>).
const PREP = {
  // The portal's CSP blocks everything that is not inline. The hosted copy also allows its own service worker, manifest
  // and icons from the same site, and the usage-log collector; every other network request stays blocked.
  'ccarp/portal': html => {
    html = once(html, /img-src data: blob:;/g, () => "img-src data: blob: 'self';", 'portal CSP img-src');
    html = once(html, /form-action 'none'">/g, () => "form-action 'none'; worker-src 'self'; manifest-src 'self'\">", 'portal CSP end');
    if (site.analytics) {
      html = once(html, /connect-src 'none';/g, () => `connect-src ${new URL(site.analytics.endpoint).origin};`, 'portal CSP connect-src');
      html = once(html, /Everything is stored in this browser only\./g, () => 'Your progress is stored in this browser only. This hosted copy also keeps a usage log (visits and answers, with your IP address and device) for the site owner.', 'portal settings storage line');
    }
    return html;
  },
  'ccarp/flashcards': html => html,
  // The field guide loads Google Fonts; the hosted copy uses the self-hosted copy in fonts/ (cached for offline use), and
  // announces study events for the usage log the way the CCAR-P apps do ('guides:track' DOM events; nothing listens offline).
  'gcp-pca/field-guide': html => {
    const pca = (re, fn, what) => { html = once(html, re, fn, `field guide ${what}`); };
    html = html.replace(/\r\n/g, '\n'); // the source is saved with Windows line endings
    html = html.replace(/<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>\n?/g, '');
    pca(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*">/g, () => '<link rel="stylesheet" href="fonts/fonts.css">', 'Google Fonts link');
    if (/fonts\.(googleapis|gstatic)\.com/.test(html)) throw new Error('field guide: a Google Fonts reference is left');
    pca(/var LETTERS = "ABCDE";/g, () => 'var emit = function(t, d){ try { var x = {}; for (var k in d) x[k] = d[k]; x.t = t; document.dispatchEvent(new CustomEvent("guides:track", {detail:x})); } catch (e) {} };\nvar LETTERS = "ABCDE";', 'helpers');
    pca(/  saveS\(\); go\("mock"\); renderQuiz\(\); window\.scrollTo\(0, 0\);\n\}/g, m => '  emit("session_start", {mode:S.mode, label:S.title, n:S.items.length});\n' + m, 'makeSession');
    pca(/  it\.checked = true; updateMissed\(it\); saveS\(\); renderQuiz\(\);/g, m => m + '\n  emit("answer", {item:it.id, ok:isCorrect(it) ? 1 : 0, domain:QMAP[it.id].d, mode:S.mode});', 'checkCurrent');
    pca(/  store\.set\("history", hist\.slice\(0, 20\)\);/g, m => m + '\n  if (!S.feedback) S.items.forEach(function(it){ if (it.sel.length) emit("answer", {item:it.id, ok:isCorrect(it) ? 1 : 0, domain:QMAP[it.id].d, mode:S.mode, exam:1}); });\n  emit("session_end", {mode:S.mode, label:S.title, c:correct, total:S.items.length, ms:S.finishedAt - S.started});', 'finish');
    pca(/function exitSession\(\)\{ stopTicker\(\);/g, () => 'function exitSession(){ if (S && !S.done) emit("session_abandon", {mode:S.mode, label:S.title}); stopTicker();', 'exitSession');
    pca(/store\.set\(key, state\); onChange\(\); \}\);/g, () => 'store.set(key, state); onChange(); emit("checklist", {list:key, item:id, on:cb.checked ? 1 : 0}); });', 'checkItem');
    return html;
  },
};
// Home-screen tags each source does not already carry.
const HEAD = {
  'ccarp/portal': [
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="CCAR-P Portal">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    '<meta name="theme-color" content="#F3F6FB" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0B1628" media="(prefers-color-scheme: dark)">',
  ],
  'ccarp/flashcards': ['<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'],
  'gcp-pca/field-guide': [
    '<meta name="color-scheme" content="light dark">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="PCA Guide">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    '<meta name="theme-color" content="#EEF1F5" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0C111A" media="(prefers-color-scheme: dark)">',
  ],
};

const only = opt('--only') ? opt('--only').split(',') : GUIDES;
for (const g of only) if (!GUIDES.includes(g)) { console.error(`unknown guide ${g} (${GUIDES.join(', ')})`); process.exit(2); }
const repo = path.resolve(dirArg);
fs.mkdirSync(repo, { recursive: true });
for (const slug of only) {
  const guide = loadGuide(slug);
  if (BEFORE[slug]) BEFORE[slug]();
  writeGuide(repo, guide, dir => {
    for (const app of guide.apps) {
      const key = `${guide.slug}/${app.slug}`, src = path.join(ROOT, app.build);
      if (!fs.existsSync(src)) throw new Error(`missing ${src}: build it first`);
      if (!PREP[key]) throw new Error(`no PREP entry for ${key}`);
      const kb = Math.round(packageApp(path.join(dir, app.slug), PREP[key](fs.readFileSync(src, 'utf8')), { site, guide, app, head: HEAD[key] || [] }) / 1024);
      console.log(`  ${site.base}${key}/ (index.html ${kb} KB, sw.js, manifest, icons${app.files ? ', ' + path.basename(app.files) + '/' : ''})`);
    }
  }, site);
  console.log(`  ${site.base}${guide.slug}/ (guide home)`);
}
const guides = writeHub(repo, site);
console.log(`  ${site.base} (hub: ${guides.map(g => g.code).join(', ')}), 404.html, assets/`);
console.log(`  usage log: ${site.analytics ? site.analytics.endpoint : 'off'}\nsite ${repo}`);
