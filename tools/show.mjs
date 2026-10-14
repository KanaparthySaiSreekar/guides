// Prints items for reviewers.
//   node tools/show.mjs --obj 3.6 --blind          stems + asks + options, no keys/whys/traps
//   node tools/show.mjs --obj 3.6 --options-only   options only (giveaway probe)
//   node tools/show.mjs --obj 3.6 --full           everything
//   add --ids P3-3.6-001,P3-3.6-004 to restrict
import { readJSON, loadItems } from './lib.mjs';
const a = process.argv.slice(2);
const val = k => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
const obj = val('--obj'), ids = val('--ids') ? new Set(val('--ids').split(',')) : null;
const mode = a.includes('--blind') ? 'blind' : a.includes('--options-only') ? 'opts' : 'full';
const file = val('--file'), dom = val('--domain');
const items = (dom ? loadItems().filter(i => i.domain === +dom).map(({ _file, ...i }) => i) : readJSON(file || `content/items/${obj}.json`)).filter(i => !ids || ids.has(i.id));
const out = [];
for (const it of items) {
  out.push(`=== ${it.id}${mode === 'full' ? `  [${it.set} ${it.type} select=${it.select} diff=${it.diff} ${it.archetype} counterTrap=${it.counterTrap} constraint=${it.constraint} family=${it.family} rule=${it.rule}]` : `  (${it.type === 'multi' ? 'select ' + it.select : 'single answer'})`}`);
  if (mode !== 'opts') { out.push('STEM: ' + it.stem); out.push('ASK: ' + it.ask); }
  for (const o of it.options) {
    if (mode === 'full') out.push(`  ${o.id.toUpperCase()}. ${o.text}\n     ${o.correct ? 'KEY' : 'trap ' + o.trap}: ${o.why}`);
    else out.push(`  ${o.id.toUpperCase()}. ${o.text}`);
  }
  if (mode === 'full') { out.push('EXPLAIN: ' + it.explain); out.push('SIGNALS: ' + JSON.stringify(it.signals)); out.push('STATUS: ' + it.status + (it.verify?.length ? ' verify=' + JSON.stringify(it.verify) : '')); }
  out.push('');
}
console.log(out.join('\n'));
