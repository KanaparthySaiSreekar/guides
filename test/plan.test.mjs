import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.mjs';

const DAY = 86400000;
const iso = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const NOW = new Date(2026, 8, 25, 14, 30).getTime(); // 25 Sep 2026, afternoon

function check(CP, S, D, label) {
  const a = CP.plan.anchors(S, NOW);
  assert.equal(a.D, D, label + ' days left');
  const pend = a.forms.filter(f => !f.done);
  for (const f of pend) {
    assert.ok(f.off >= 0, `${label}: Form ${f.F} scheduled in the past (${f.off})`);
    assert.ok(f.off <= D - 2, `${label}: Form ${f.F} after T-2 (${f.off}, D=${D})`);
    assert.ok(f.off < a.taperStart || a.taperStart === 0 && D <= 1, `${label}: Form ${f.F} inside the taper`);
  }
  const order = pend.map(f => f.F).join('');
  assert.ok(['ABC', 'AB', 'A', 'BC', 'B', 'C', 'AC', ''].includes(order), `${label}: order ${order}`);
  for (let i = 1; i < pend.length; i++) assert.ok(pend[i].off > pend[i - 1].off, `${label}: forms not strictly increasing`);
  assert.equal(pend.length + a.dropped.length + a.forms.filter(f => f.done).length, 3, label + ' every form accounted for');
  assert.ok(a.taperStart <= D && a.taperStart >= 0, label + ' taper within range');
  return a;
}

test('the reported bug: exam on 29 Sep, today 25 Sep', () => {
  const { CP } = load(); const S = CP.store.S;
  S.settings.examDate = '2026-09-29'; S.created = new Date(2026, 8, 1).getTime();
  const a = check(CP, S, 4, 'D=4');
  assert.equal(JSON.stringify(a.forms.map(f => [f.F, iso(f.date)])), JSON.stringify([['A', '2026-09-25'], ['B', '2026-09-26'], ['C', '2026-09-27']]));
  assert.equal(iso(a.taper.date), '2026-09-28');
  const dp = CP.plan.dayPlan(S, NOW);
  assert.equal(dp.fits, false); assert.equal(dp.days.length, 5);
  assert.match(dp.days[4].what, /Exam day/);
});

test('invariants hold for every distance from 0 to 60 days', () => {
  for (let D = 0; D <= 60; D++) {
    const { CP } = load(); const S = CP.store.S;
    S.settings.examDate = iso(NOW + D * DAY);
    const a = check(CP, S, D, 'D=' + D);
    if (D >= 5) assert.equal(a.dropped.length, 0, `D=${D} should fit all three forms`);
    if (D >= 21) { const A = a.forms.find(f => f.F === 'A'); assert.ok(A.off >= Math.round(D * 0.4) && A.off <= Math.round(D * 0.65), `D=${D} Form A near 55% (${A.off})`); }
  }
});

test('forms already sat are reported as done and the rest follow them', () => {
  const { CP } = load(); const S = CP.store.S;
  S.settings.examDate = iso(NOW + 20 * DAY);
  const s = CP.sess.create('form', { F: 'A' }); CP.sess.submit(s); s.endedAt = NOW - 2 * DAY;
  const a = check(CP, S, 20, 'A done');
  const A = a.forms.find(f => f.F === 'A'); assert.equal(A.done, true);
  const B = a.forms.find(f => f.F === 'B'); assert.ok(B.off >= 1, 'B at least 3 days after A');
});

test('exam in the past or today', () => {
  const { CP } = load(); const S = CP.store.S;
  S.settings.examDate = iso(NOW - 2 * DAY);
  assert.equal(CP.plan.anchors(S, NOW).regime, 'past');
  S.settings.examDate = iso(NOW);
  const a = CP.plan.anchors(S, NOW); assert.equal(a.D, 0); assert.equal(a.forms.filter(f => !f.done).length, 0);
});

test('next-best action follows the plan: Form A today at 4 days out, taper at T-1, never Form C first', () => {
  const { CP } = load(); const S = CP.store.S;
  for (const o of CP.bank.objs) S.self[o.id] = { r: 'Y', at: NOW };
  S.settings.examDate = '2026-09-29';
  const n = CP.nba.compute(S, NOW);
  assert.equal(n.primary.id, 'formA', JSON.stringify(n.primary));
  S.settings.examDate = iso(NOW + 1 * DAY);
  assert.equal(CP.nba.compute(S, NOW).primary.id, 'taper');
});
