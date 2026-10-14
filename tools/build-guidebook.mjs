// Builds a guide's study portal from the guidebook engine: dist/<guide>/portal.html (+ the guide's fonts folder, shipped by
// the site build). The guide supplies everything it shows: guides/<guide>/content/
//   meta.json        title, description, brand, storage prefix, mock sizes
//   sections.json    the tabs in order: { id, heading, tab }
//   sections/<id>.html   the content of each section (hand-written HTML, plus the hooks the engine looks for)
//   questions.json   the practice bank { id, d (domain), cs (case key), q, o[], a[], x }
//   data.json        domainShort, domainFull, weights, cases, syllabus, plan
//   footer.html      the page footer
//   node tools/build-guidebook.mjs [--guide gcp-pca]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { P, GUIDE, DIST, G, readJSON } from './lib.mjs';

const OUT = DIST(GUIDE, 'portal.html');
const C = f => G('content', f);
const meta = readJSON(C('meta.json'));
const sections = readJSON(C('sections.json'));
const data = readJSON(C('data.json'));
const questions = readJSON(C('questions.json'));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const problems = [];

// ---------- checks: every reference resolves, so a typo cannot ship ----------
const domains = Object.keys(data.weights);
const sum = domains.reduce((a, d) => a + data.weights[d], 0);
if (Math.abs(sum - 100) > 0.01) problems.push(`domain weights add up to ${sum}, not 100`);
const caseKeys = Object.keys(data.cases);
const ids = new Set();
for (const q of questions) {
  const w = `question ${q.id}`;
  if (ids.has(q.id)) problems.push(`${w}: duplicate id`); ids.add(q.id);
  if (!data.weights[q.d]) problems.push(`${w}: unknown domain ${q.d}`);
  if (q.cs && !data.cases[q.cs]) problems.push(`${w}: unknown case ${q.cs}`);
  if (!Array.isArray(q.o) || q.o.length < 3) problems.push(`${w}: needs at least 3 options`);
  if (!Array.isArray(q.a) || !q.a.length || q.a.some(i => !Number.isInteger(i) || i < 0 || i >= q.o.length)) problems.push(`${w}: answer index out of range`);
  if (new Set(q.o).size !== q.o.length) problems.push(`${w}: duplicate options`);
  if (!q.x || q.x.length < 40) problems.push(`${w}: explanation missing or too short`);
}
for (const d of domains) if (!questions.some(q => String(q.d) === d && !q.cs)) problems.push(`domain ${d} has no questions`);
for (const k of caseKeys) if (!questions.some(q => q.cs === k)) problems.push(`case ${k} has no questions`);
const MOCK = meta.mock;
if (questions.filter(q => !q.cs).length < MOCK.full - MOCK.cases * MOCK.perCaseFull) problems.push('not enough domain questions to build a full mock');

// ---------- sections ----------
const sectionHtml = sections.map((s, i) => {
  const file = C(`sections/${s.id}.html`);
  if (!fs.existsSync(file)) { problems.push(`missing ${path.relative(P(), file)}`); return ''; }
  return `<section class="view" id="v-${s.id}" aria-labelledby="${s.heading}"${i ? ' hidden' : ''}>\n${fs.readFileSync(file, 'utf8').replace(/\n$/, '')}\n</section>\n`;
}).join('\n');
for (const s of sections) {
  const html = fs.readFileSync(C(`sections/${s.id}.html`), 'utf8');
  if (!html.includes(`id="${s.heading}"`)) problems.push(`section ${s.id}: no element with id="${s.heading}"`);
}
const tabs = sections.map(s => `      <a class="tab" href="#${s.id}" data-view="${s.id}">${esc(s.tab)}</a>`).join('\n');

// ---------- app code ----------
const js = fs.readFileSync(P('engine/guidebook/app.js'), 'utf8');
try { new vm.Script(js, { filename: 'guidebook/app.js' }); } catch (e) { console.error('JS SYNTAX ERROR in guidebook/app.js: ' + e.message); process.exit(1); }
const GB = {
  storage: meta.storage, mock: MOCK, sections: sections.map(s => ({ id: s.id })),
  questions, domainShort: data.domainShort, domainFull: data.domainFull, weights: data.weights, cases: data.cases, syllabus: data.syllabus, plan: data.plan,
};
const LS = new RegExp(String.fromCharCode(0x2028), 'g'), PS = new RegExp(String.fromCharCode(0x2029), 'g'), BS = String.fromCharCode(92);
const json = JSON.stringify(GB).replace(/</g, BS + 'u003c').replace(LS, BS + 'u2028').replace(PS, BS + 'u2029');

if (problems.length) { console.error('BUILD PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }

let html = fs.readFileSync(P('engine/guidebook/shell.html'), 'utf8');
const fill = { title: esc(meta.title), description: esc(meta.description), first: sections[0].id, brandLabel: esc(meta.brandLabel), mark: esc(meta.mark), brand: esc(meta.brand), year: esc(meta.year) };
for (const [k, v] of Object.entries(fill)) html = html.split(`/*@${k}*/`).join(v);
html = html.replace('/*@css*/', () => fs.readFileSync(P('engine/guidebook/app.css'), 'utf8').replace(/\n$/, ''))
  .replace('/*@tabs*/', () => tabs)
  .replace('/*@sections*/', () => sectionHtml)
  .replace('/*@footer*/', () => fs.readFileSync(C('footer.html'), 'utf8').replace(/\n$/, ''))
  .replace('/*@data*/', () => `window.GB = ${json};`)
  .replace('/*@js*/', () => js.replace(/<\/script/gi, '<\\/script'));
const left = html.match(/\/\*@[a-zA-Z]+\*\//g);
if (left) { console.error('unfilled placeholders: ' + [...new Set(left)].join(', ')); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
const byDom = {}; for (const q of questions) { const k = q.cs || 'd' + q.d; byDom[k] = (byDom[k] || 0) + 1; }
console.log(`built ${OUT}\n  ${Math.round(Buffer.byteLength(html) / 1024)} KB · ${questions.length} questions ${JSON.stringify(byDom)} · ${sections.length} sections`);
