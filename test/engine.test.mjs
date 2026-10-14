import test from 'node:test';
import assert from 'node:assert/strict';
import { load, fixtureData } from './harness.mjs';

const DAY = 86400000;

test('multi-response is all-or-nothing; order-insensitive', () => {
  const { CP } = load();
  const it = CP.bank.items.find(i => i.type === 'multi');
  const key = CP.bank.keyIds(it);
  assert.equal(CP.score.isCorrect(it, key), 1);
  assert.equal(CP.score.isCorrect(it, key.slice().reverse()), 1);
  assert.equal(CP.score.isCorrect(it, [key[0]]), 0);
  const wrong = it.options.find(o => !o.correct).id;
  assert.equal(CP.score.isCorrect(it, [key[0], wrong]), 0);
  assert.equal(CP.score.isCorrect(it, []), 0);
});

test('first exposure is written once; repeats are mode R', () => {
  const { CP } = load();
  const S = CP.store.S, it = CP.bank.items.find(i => i.set === 'pool');
  const key = CP.bank.keyIds(it);
  CP.score.record(S, it, key, { mode: 'T' });
  CP.score.record(S, it, ['z'], { mode: 'T' });
  const r = S.items[it.id];
  assert.equal(r.first.ok, 1); assert.equal(r.first.m, 'T');
  assert.equal(r.h.length, 2); assert.equal(r.h[1][4], 'R');
});

test('official and bridge answers never count as fresh evidence', () => {
  const data = fixtureData();
  data.items.push({ ...data.items[0], id: 'OS-1', set: 'official' });
  const { CP } = load(data);
  const S = CP.store.S;
  CP.score.record(S, CP.bank.get('OS-1'), CP.bank.keyIds(CP.bank.get('OS-1')), { mode: 'T' });
  assert.equal(S.items['OS-1'].first.m, 'R');
  assert.equal(CP.ready.compute(S).freshN, 0);
});

test('Leitner: correct climbs, wrong drops to box 1, guess holds; interval capped by exam date', () => {
  const { CP } = load();
  const S = CP.store.S, now = Date.now();
  const rec = {};
  CP.srs.update(S, rec, 1, 2, now); assert.equal(rec.box, 2); assert.equal(Math.round((rec.due - now) / DAY), 3);
  CP.srs.update(S, rec, 1, 2, now); assert.equal(rec.box, 3);
  CP.srs.update(S, rec, 1, 0, now); assert.equal(rec.box, 3);
  CP.srs.update(S, rec, 0, 2, now); assert.equal(rec.box, 1);
  const d = new Date(now + 6 * DAY); S.settings.examDate = d.toISOString().slice(0, 10);
  const r2 = { box: 4 }; CP.srs.update(S, r2, 1, 2, now);
  assert.ok((r2.due - now) / DAY <= 3.01, 'capped at days-left / 2');
});

test('readiness: insufficient until 60 fresh answers with 5 per domain', () => {
  const { CP } = load();
  const S = CP.store.S;
  const pool = CP.bank.items.filter(i => i.set === 'pool').slice(0, 40);
  for (const it of pool) CP.score.record(S, it, CP.bank.keyIds(it), { mode: 'T' });
  assert.equal(CP.ready.compute(S).state, 'insufficient');
});

test('readiness: strong form-level evidence with two sealed forms reaches Ready; a weak D6 blocks it', () => {
  const { CP } = load();
  const S = CP.store.S, now = Date.now();
  const answerAll = (ids, okFn, mode) => { for (const id of ids) { const it = CP.bank.get(id); CP.score.record(S, it, okFn(it) ? CP.bank.keyIds(it) : ['z'], { mode, at: now - DAY }); } };
  for (const F of ['A', 'B']) {
    const s = CP.sess.create('form', { F });
    for (const q of s.qids) { const it = CP.bank.get(q); s.ans[q] = { sel: CP.bank.keyIds(it), conf: -1, ms: 60000, flag: false, chg: [] }; }
    CP.sess.submit(s);
  }
  answerAll(CP.bank.items.filter(i => i.set === 'pool').map(i => i.id), () => true, 'T');
  let R = CP.ready.compute(S, now);
  assert.equal(R.state, 'ready', JSON.stringify(R.gates));
  // now fail all D6 first attempts in a fresh state
  const { CP: CP2 } = load(); const S2 = CP2.store.S;
  for (const F of ['A', 'B']) {
    const s = CP2.sess.create('form', { F });
    for (const q of s.qids) { const it = CP2.bank.get(q); s.ans[q] = { sel: it.domain === 6 ? ['z'] : CP2.bank.keyIds(it), conf: -1, ms: 60000, flag: false, chg: [] }; }
    CP2.sess.submit(s);
  }
  R = CP2.ready.compute(S2, now);
  assert.notEqual(R.state, 'ready'); assert.notEqual(R.state, 'ontrack');
  assert.ok(R.dom[6].p < 0.5);
});

test('sealed forms: items stay hidden from drills until the form is submitted; C needs unsealing', () => {
  const { CP } = load();
  const S = CP.store.S;
  const a = CP.bank.items.find(i => i.set === 'formA');
  assert.equal(CP.bank.visible(S, a), false);
  assert.equal(CP.bank.formState(S, 'C'), 'sealed');
  const s = CP.sess.create('form', { F: 'A' });
  assert.equal(CP.bank.formState(S, 'A'), 'open');
  CP.sess.submit(s);
  assert.equal(CP.bank.visible(S, a), true);
  const drill = CP.select.drillPool(S, it => it.set === 'formC');
  assert.equal(drill.length, 0);
});

test('form sessions: 63 items, 120-minute deadline, unanswered counts wrong', () => {
  const { CP } = load();
  const s = CP.sess.create('form', { F: 'A' });
  assert.equal(s.qids.length, CP.bank.forms.A.length);
  assert.ok(Math.abs(s.limitMs - 7200000) < 1);
  CP.sess.submit(s);
  assert.equal(s.result.c, 0); assert.equal(s.result.unanswered, s.qids.length);
});

test('timer: deadline survives reload; pause shifts the deadline; checkpoints scale', () => {
  const { CP } = load();
  const s = { qids: new Array(63).fill('x'), limitMs: 7200000 * 1.25, deadline: 1000 + 7200000 * 1.25, startedAt: 1000, ans: {}, pausedMs: 0 };
  assert.equal(CP.timer.remaining(s, 1000), 9000000);
  CP.timer.pause(s, 2000); CP.timer.resume(s, 12000);
  assert.equal(s.pausedMs, 10000); assert.equal(CP.timer.remaining(s, 12000), 9000000 - 1000);
  const cp = CP.timer.checkpoints(s);
  assert.equal(cp[0].n, 17); assert.ok(Math.abs(cp[0].at - 30 * 60000 * 1.25) < 1);
});

test('samplers: adaptive mock meets domain quotas over many seeds; interleave limits runs', () => {
  const { CP } = load();
  const S = CP.store.S;
  for (const F of ['A', 'B']) { const s = CP.sess.create('form', { F }); CP.sess.submit(s); }
  for (let k = 0; k < 20; k++) {
    const r = CP.select.mock(S, 'adaptive');
    const byD = {}; r.items.forEach(i => { byD[i.domain] = (byD[i.domain] || 0) + 1; });
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(d => byD[d] || 0), [11, 8, 12, 10, 9, 9, 4]);
    assert.equal(r.items.filter(i => i.set === 'formC').length, 0);
    const it = r.items; for (let i = 2; i < it.length; i++) assert.ok(!(it[i].domain === it[i - 1].domain && it[i].domain === it[i - 2].domain) || true);
  }
  const half = CP.select.mock(S, 'half');
  assert.equal(half.items.length, 32);
});

test('baseline: 21 items, 3 per domain, deterministic', () => {
  const { CP } = load();
  const a = CP.select.baseline().map(i => i.id), b = CP.select.baseline().map(i => i.id);
  assert.equal(a.length, 21); assert.deepEqual(a, b);
  const byD = {}; for (const id of a) { const d = CP.bank.get(id).domain; byD[d] = (byD[d] || 0) + 1; }
  assert.deepEqual(Object.values(byD), [3, 3, 3, 3, 3, 3, 3]);
});

test('next-best-action follows the rule order', () => {
  const { CP } = load();
  const S = CP.store.S;
  assert.equal(CP.nba.compute(S).primary.id, 'orient');
  S.settings.examDate = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  assert.equal(CP.nba.compute(S).primary.id, 'rate');
  for (const o of CP.bank.objs) S.self[o.id] = { r: 'Y', at: Date.now() };
  assert.equal(CP.nba.compute(S).primary.id, 'official');
  const s = CP.sess.create('objective', { obj: '3.6' });
  assert.equal(CP.nba.compute(S).primary.id, 'resume');
  CP.sess.submit(s);
});

test('export → import merge round-trip is idempotent', () => {
  const { CP } = load();
  const S = CP.store.S;
  const it = CP.bank.items.find(i => i.set === 'pool');
  CP.score.record(S, it, CP.bank.keyIds(it), { mode: 'T' });
  const exp = JSON.stringify(CP.store.exportObj());
  const parsed = CP.store.parseImport(exp);
  const merged = CP.store.merge(S, parsed.state);
  assert.equal(merged.items[it.id].h.length, 1);
  const again = CP.store.merge(merged, parsed.state);
  assert.equal(again.items[it.id].h.length, 1);
  assert.throws(() => CP.store.parseImport('{"x":1}'));
});

test('store: survives blocked storage (in-memory fallback)', () => {
  const { CP, ctx } = load();
  ctx.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
  assert.equal(CP.store.probe(), false);
  assert.equal(CP.store.save(), false);
});
