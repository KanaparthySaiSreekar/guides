// Builds a guide's Study Portal as one offline HTML file: dist/<guide>/portal.html.
//   node tools/build-portal.mjs [--guide ccarp] [--skip-validate] [--allow-draft]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { P, GUIDE, DIST, readJSON, loadItems, hashStr, C, stampFor } from './lib.mjs';

const args = process.argv.slice(2);
const OUT = DIST(GUIDE, 'portal.html');
const CSS = ['tokens', 'base', 'layout', 'components', 'runner', 'guide', 'cheat', 'print'];
const JS = ['util', 'store', 'bank', 'scoring', 'srs', 'mastery', 'readiness', 'select', 'plan', 'nba', 'timer', 'session', 'ui',
  'views/runner', 'views/guide', 'views/today', 'views/practice', 'views/report', 'views/cheat', 'views/traps',
  'views/blueprint', 'views/path', 'views/progress', 'views/exam', 'views/settings', 'app'];

if (!args.includes('--skip-validate')) {
  for (const t of ['validate.mjs', 'validate-guide.mjs']) {
    try { execFileSync(process.execPath, [P('tools', t), '--quiet', '--guide', GUIDE], { stdio: 'inherit' }); }
    catch (e) { console.error(`\n${t} failed; fix errors or pass --skip-validate`); process.exit(1); }
  }
}

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s+/g, '\n');
// Embedded fonts (IBM Plex, SIL OFL 1.1) and icons (Phosphor, MIT) keep the file fully offline.
const FONT = (file, family, weight, style) => `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${fs.readFileSync(P('engine/shared/fonts', file)).toString('base64')}) format("woff2");font-weight:${weight};font-style:${style};font-display:swap}`;
const fontCss = [
  FONT('ibm-plex-sans-latin-wght-normal.woff2', 'Plex Sans', '100 700', 'normal'),
  FONT('ibm-plex-sans-latin-wght-italic.woff2', 'Plex Sans', '100 700', 'italic'),
  FONT('ibm-plex-serif-latin-400-normal.woff2', 'Plex Serif', '400', 'normal'),
  FONT('ibm-plex-serif-latin-400-italic.woff2', 'Plex Serif', '400', 'italic'),
  FONT('ibm-plex-serif-latin-600-normal.woff2', 'Plex Serif', '600', 'normal'),
  FONT('ibm-plex-mono-latin-500-normal.woff2', 'Plex Mono', '500', 'normal'),
].join('\n');
const icons = {};
for (const f of fs.readdirSync(P('engine/portal/icons')).filter(f => f.endsWith('.svg'))) {
  const svg = fs.readFileSync(P('engine/portal/icons', f), 'utf8');
  icons[f.replace('.svg', '')] = [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
}
const css = fontCss + '\n' + CSS.map(f => strip(fs.readFileSync(f === 'tokens' ? P('engine/shared/css/tokens.css') : P('engine/portal/css', f + '.css'), 'utf8'))).join('\n');
const js = `window.CP = window.CP || {}; CP.ICONS = ${JSON.stringify(icons)};\n` + JS.map(f => `/* ${f} */\n` + fs.readFileSync(P('engine/portal/js', f + '.js'), 'utf8')).join('\n;\n');
for (const f of JS) {
  try { new vm.Script(fs.readFileSync(P('engine/portal/js', f + '.js'), 'utf8'), { filename: f + '.js' }); }
  catch (e) { console.error('JS SYNTAX ERROR in ' + f + '.js: ' + e.message); process.exit(1); }
}

// ---------- data ----------
const items = loadItems().map(({ _file, ...it }) => it);
const allowDraft = args.includes('--allow-draft');
const bank = items.filter(it => allowDraft || it.status !== 'draft');
const official = readJSON(C('content/official.json'), []);
const bridge = readJSON(C('content/bridge.json'), []);
const community = readJSON(C('content/community.json'), []);
const forms = readJSON(C('content/forms.json'), { A: [], B: [], C: [] });
const inBank = new Set(bank.map(i => i.id));
for (const F of Object.keys(forms)) forms[F] = forms[F].filter(id => inBank.has(id));
const guide = {};
for (let n = 1; n <= 7; n++) { const f = C(`content/guide/d${n}.json`); if (fs.existsSync(f)) guide[n] = JSON.parse(fs.readFileSync(f, 'utf8')); }
const strip2 = it => { const { verify, src, rev, status, tips, obj2, ...rest } = it; return { ...rest, rev: rev || 1, src: src && src.kind !== 'original' ? src : undefined }; };
const data = {
  meta: {},
  bp: readJSON(C('content/blueprint.json')),
  items: [...bank, ...official, ...bridge].map(strip2).concat(community),
  forms,
  traps: readJSON(C('content/traps.json')),
  cheat: readJSON(C('content/cheatsheet.json')),
  ladders: readJSON(C('content/ladders.json')),
  triggers: readJSON(C('content/triggers.json')),
  tips: readJSON(C('content/tips.json')),
  path: readJSON(C('content/path.json')),
  exam: readJSON(C('content/exam.json')),
  platform: readJSON(C('content/platform.json')),
  caseStudy: readJSON(C('content/case.json')),
  guide,
};
const bodyHash = hashStr(JSON.stringify(data.items.map(i => i.id + ':' + i.rev)) + JSON.stringify(forms)).toString(36);
data.meta = { bank: '2026.09.' + bodyHash, built: stampFor('engine', `guides/${GUIDE}/content`).getTime(), counts: { bank: bank.length, official: official.length, bridge: bridge.length, community: community.length } };
const LS = new RegExp(String.fromCharCode(0x2028), "g"), PS = new RegExp(String.fromCharCode(0x2029), "g");
const BS = String.fromCharCode(92);
const json = JSON.stringify(data).replace(/</g, BS + 'u003c').replace(LS, BS + 'u2028').replace(PS, BS + 'u2029');

let html = fs.readFileSync(P('engine/portal/shell.html'), 'utf8');
html = html.replace('/*@css*/', () => css).replace('/*@data*/', () => json).replace('/*@js*/', () => js.replace(/<\/script/gi, '<\\/script'));

// ---------- offline guard ----------
const problems = [];
const codeOnly = html.replace(/<script type="application\/json" id="cp-data">[\s\S]*?<\/script>/, '');
if (/<link[^>]+rel=["']?stylesheet/i.test(codeOnly)) problems.push('external stylesheet link');
if (/@import/i.test(css)) problems.push('@import in CSS');
if (/url\(\s*["']?https?:/i.test(css)) problems.push('remote url() in CSS');
if (/\bsrc=["']https?:/i.test(codeOnly) || /\bhref=["']https?:/i.test(codeOnly)) problems.push('remote src/href');
if (/\bfetch\(|XMLHttpRequest|new WebSocket|EventSource\(/.test(js)) problems.push('network API in JS');
if (problems.length) { console.error('OFFLINE CHECK FAILED: ' + problems.join(', ')); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`built ${OUT}\n  ${kb} KB · ${bank.length} bank items (${Object.entries(forms).map(([k, v]) => k + ':' + v.length).join(' ')}) · ${official.length} official · ${bridge.length} bridge · guide D${Object.keys(guide).join(',')}`);
if (kb > 3072) { console.error("SIZE BUDGET EXCEEDED (3 MB)"); process.exit(1); }
