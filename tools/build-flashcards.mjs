// Builds a guide's flashcards as one offline HTML file: dist/<guide>/flashcards.html.
//   node tools/build-flashcards.mjs [--guide ccarp] [--allow-missing] [--artifact <file>]
// The data comes from the guide's own builder, guides/<guide>/cards.mjs (default export: ({ args }) => ({ data })), so the same
// engine (engine/flashcards) serves every guide. This script only assembles: fonts, styles, engine, data, offline guard.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { P, G, GUIDE, DIST } from './lib.mjs';

const args = process.argv.slice(2);
const OUT = DIST(GUIDE, 'flashcards.html');
const SRC = f => P('engine/flashcards', f);

const { data } = (await import(pathToFileURL(G('cards.mjs')).href)).default({ args });
const cards = data.cards, mcqs = data.mcqs;
const UI = data.ui;
for (const k of ['title', 'short', 'key', 'source', 'decks', 'deckGroups', 'sets', 'setGroups', 'setOrder', 'defaultSel', 'text']) if (UI?.[k] == null) { console.error(`${GUIDE}/cards.mjs: data.ui.${k} is missing`); process.exit(1); }
for (const c of cards) if (!UI.decks[c.k]) { console.error(`card ${c.id}: deck "${c.k}" is not in data.ui.decks`); process.exit(1); }
for (const q of mcqs) if (!UI.sets[q.s]) { console.error(`question ${q.id}: set "${q.s}" is not in data.ui.sets`); process.exit(1); }

// ---------- assemble ----------
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s+/g, '\n');
const FONT = (file, family, weight, style) => `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${fs.readFileSync(P('engine/shared/fonts', file)).toString('base64')}) format("woff2");font-weight:${weight};font-style:${style};font-display:swap}`;
const fontCss = [
  FONT('ibm-plex-sans-latin-wght-normal.woff2', 'Plex Sans', '100 700', 'normal'),
  FONT('ibm-plex-serif-latin-400-normal.woff2', 'Plex Serif', '400', 'normal'),
  FONT('ibm-plex-serif-latin-600-normal.woff2', 'Plex Serif', '600', 'normal'),
  FONT('ibm-plex-mono-latin-500-normal.woff2', 'Plex Mono', '500', 'normal'),
].join('\n');
const css = fontCss + '\n' + strip(fs.readFileSync(P('engine/shared/css/tokens.css'), 'utf8')) + '\n' + strip(fs.readFileSync(SRC('fc.css'), 'utf8'));
const jsSrc = fs.readFileSync(SRC('fc.js'), 'utf8');
try { new vm.Script(jsSrc, { filename: 'fc.js' }); } catch (e) { console.error('JS SYNTAX ERROR in fc.js: ' + e.message); process.exit(1); }
const LS = new RegExp(String.fromCharCode(0x2028), 'g'), PS = new RegExp(String.fromCharCode(0x2029), 'g'), BS = String.fromCharCode(92);
const json = JSON.stringify(data).replace(/</g, BS + 'u003c').replace(LS, BS + 'u2028').replace(PS, BS + 'u2029');
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let html = fs.readFileSync(SRC('shell.html'), 'utf8').split('/*@title*/').join(esc(UI.title)).split('/*@short*/').join(esc(UI.short));
html = html.replace('/*@css*/', () => css).replace('/*@data*/', () => json).replace('/*@js*/', () => jsSrc.replace(/<\/script/gi, '<\\/script'));

// Offline guard: nothing may reach the network.
const code = html.replace(/<script type="application\/json" id="fc-data">[\s\S]*?<\/script>/, '');
const bad = [];
if (/<link[^>]+rel=["']?stylesheet/i.test(code)) bad.push('external stylesheet');
if (/url\(\s*["']?https?:/i.test(css)) bad.push('remote url() in CSS');
if (/\bsrc=["']https?:/i.test(code) || /\bhref=["']https?:/i.test(code)) bad.push('remote src/href');
if (/\bfetch\(|XMLHttpRequest|new WebSocket|EventSource\(/.test(jsSrc)) bad.push('network API in JS');
if (bad.length) { console.error('OFFLINE CHECK FAILED: ' + bad.join(', ')); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

// The hosted, installable copy (service worker, manifest, icons) is packaged by tools/build.mjs.

// Artifact variant (--artifact <path>): the Artifact host wraps the page in its own document and pads :root by the
// safe-area insets, so ship the title, styles and body content only, and let sticky/fixed chrome sit inside that padding.
if (args.includes('--artifact')) {
  const artOut = path.resolve(args[args.indexOf('--artifact') + 1]);
  const ART_CSS = '.home{padding-top:18px}.bar{top:env(safe-area-inset-top,0px);padding-top:0}.fin{padding-top:24px}';
  const title = /<title>[\s\S]*?<\/title>/.exec(html)[0];
  const body = /<body>([\s\S]*)<\/body>/.exec(html)[1];
  const frag = `${title}\n<style>${css}\n${ART_CSS}</style>\n${body.trim()}\n`;
  fs.mkdirSync(path.dirname(artOut), { recursive: true });
  fs.writeFileSync(artOut, frag);
  console.log(`  artifact variant ${artOut} (${Math.round(Buffer.byteLength(frag) / 1024)} KB)`);
}
const byDeck = {}; for (const c of cards) byDeck[c.k] = (byDeck[c.k] || 0) + 1;
const bySet = {}; for (const q of mcqs) bySet[q.s] = (bySet[q.s] || 0) + 1;
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`built ${OUT}\n  ${kb} KB · ${cards.length} cards ${JSON.stringify(byDeck)}\n  ${mcqs.length} MCQs ${JSON.stringify(bySet)}`);
if (kb > 4096) { console.error('SIZE BUDGET EXCEEDED (4 MB)'); process.exit(1); }
