// Copies a Google Fonts stylesheet and its font files into a local folder, so a hosted page needs no third-party request
// and its service worker can cache the fonts for offline use. Keeps Google's unicode-range rules, so the page renders the
// same as before.  node tools/vendor-fonts.mjs <css2 url> <out dir> [--subsets latin,latin-ext]
// Writes <out dir>/fonts.css (relative url()s) and one .woff2 per face. The fonts are under the SIL Open Font License.
import fs from 'node:fs';
import path from 'node:path';

const [url, outArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!url || !outArg) { console.error('usage: node tools/vendor-fonts.mjs <css2 url> <out dir> [--subsets latin,latin-ext]'); process.exit(2); }
const a = process.argv.slice(2), keep = (a.includes('--subsets') ? a[a.indexOf('--subsets') + 1] : 'latin,latin-ext').split(',');
const out = path.resolve(outArg);
// A current Chrome user agent makes Google serve woff2 with unicode-range subsets.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const css = await (await fetch(url, { headers: { 'user-agent': UA } })).text();
const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)].filter(m => keep.includes(m[1]));
if (!blocks.length) { console.error('no @font-face blocks for ' + keep.join(', ')); process.exit(1); }
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = new Map();
let local = `/* Self-hosted copy of ${url.replace(/&/g, '&amp;')}\n   subsets: ${keep.join(', ')}. Fonts: SIL Open Font License 1.1. Regenerate with tools/vendor-fonts.mjs. */\n`;
for (const [, subset, block] of blocks) {
  const src = /url\((https:[^)]+\.woff2)\)/.exec(block)[1];
  const fam = /font-family:\s*'([^']+)'/.exec(block)[1], style = /font-style:\s*(\w+)/.exec(block)[1], weight = /font-weight:\s*([\d ]+)/.exec(block)[1].trim();
  // One file per distinct source (several weights of a variable font share one).
  if (!files.has(src)) files.set(src, `${fam.toLowerCase().replace(/\s+/g, '-')}-${subset}-${style}-${weight.replace(/\s+/g, '-')}.woff2`);
  local += `/* ${subset} */\n` + block.replace(src, files.get(src)) + '\n';
}
let bytes = 0;
for (const [src, name] of files) {
  const buf = Buffer.from(await (await fetch(src, { headers: { 'user-agent': UA } })).arrayBuffer());
  if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`not a woff2: ${src}`);
  fs.writeFileSync(path.join(out, name), buf);
  bytes += buf.length;
}
fs.writeFileSync(path.join(out, 'fonts.css'), local);
console.log(`${blocks.length} faces, ${files.size} files, ${Math.round(bytes / 1024)} KB -> ${out}`);
