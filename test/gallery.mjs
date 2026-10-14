// Screenshot gallery of every screen (desktop + mobile, light + dark) for visual review.
//   node test/gallery.mjs [outDir]
import { launch } from '../tools/cdp.mjs';
import path from 'node:path';
const out = process.argv[2] || '.cache/gallery';
const SEED = `(()=>{const S=CP.store.S; S.settings.examDate=(()=>{const d=new Date(Date.now()+21*864e5);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
  for (const o of CP.bank.objs.slice(0,30)) S.self[o.id]={r:['R','Y','G'][o.id.charCodeAt(2)%3],at:Date.now()};
  const pool=CP.bank.items.filter(i=>i.set==='pool'); pool.slice(0,72).forEach((it,i)=>CP.score.record(S,it,i%3?CP.bank.keyIds(it):['z'],{mode:'T',conf:i%4===0?0:2}));
  S.guide['3.1']={read:Date.now()}; CP.store.save(); return 1;})()`;
const SCREENS = [
  ['today', '#/'], ['path', '#/path'], ['blueprint', '#/blueprint'], ['guide', '#/guide'], ['guide-d3', '#/guide/d3/3.1'],
  ['cheat', '#/cheat'], ['traps', '#/traps'], ['practice', '#/practice'], ['progress', '#/progress'], ['exam', '#/exam'], ['settings', '#/settings'],
];
for (const dark of [false, true]) {
  const b = await launch({ port: dark ? 9361 : 9360, dark });
  for (const [w, h, m] of [[1360, 900, false], [390, 844, true]]) {
    await b.viewport(w, h, m);
    await b.goto('#/'); await b.eval(SEED); await b.eval('CP.router.render()');
    const tag = `${w}${dark ? '-dark' : ''}`;
    for (const [name, route] of SCREENS) { await b.hash(route); await b.eval('CP.router.render()'); await b.sleep(name === 'today' ? 1400 : 400); await b.shot(path.join(out, `${name}-${tag}.png`)); }
    // exam console
    await b.eval(`CP.ui.startSession('form',{F:'B'})`); await b.sleep(500);
    await b.eval(`document.querySelectorAll('.opt input')[1].click()`); await b.sleep(250);
    await b.shot(path.join(out, `runner-exam-${tag}.png`));
    await b.eval(`(()=>{const id=location.hash.split('/')[2].split('?')[0]; CP.sess.abandon(CP.sess.get(id));})()`);
    // tutor feedback (wrong answer)
    await b.eval(`CP.ui.startSession('domain',{d:'4'})`); await b.sleep(500);
    await b.eval(`(()=>{const c=CP.router.current(), s=CP.sess.get(c.p.parts[1]), it=CP.sess.item(s); const order=CP.sess.perm(s,it); const wrong=order.filter(id=>!it.options.find(o=>o.id===id).correct); const right=order.filter(id=>it.options.find(o=>o.id===id).correct); const picks=it.type==='multi'?[wrong[0],...right.slice(0,it.select-1)]:[wrong[0]]; picks.forEach(id=>document.querySelector('input[value="'+id+'"]').click());})()`); await b.sleep(250);
    await b.click('[data-act="rcheck"]'); await b.sleep(400); await b.eval('window.scrollTo(0,0)');
    await b.shot(path.join(out, `runner-tutor-${tag}.png`));
    await b.eval(`(()=>{const id=location.hash.split('/')[2].split('?')[0]; const s=CP.sess.get(id); CP.sess.submit(s); location.hash='#/r/'+s.id;})()`); await b.sleep(500);
    await b.shot(path.join(out, `report-${tag}.png`));
  }
  const e = b.errors(); if (e.length) console.log('errors', e);
  b.close();
}
console.log('gallery written to', out);
