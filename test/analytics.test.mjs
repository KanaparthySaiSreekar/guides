// Collector (analytics/worker.js) against a real SQLite stand-in for D1.  node --test test/analytics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker, LocalD1, edgeRequest } from '../analytics/local.mjs';

const ORIGIN = 'https://kanaparthysaisreekar.github.io', KEY = 'test-key';
const worker = await loadWorker();
const fresh = () => ({ DB: new LocalD1(), ORIGINS: ORIGIN, RETENTION_DAYS: '365', ADMIN_TOKEN: KEY });
const DEV = '0b6c3a52-6f7e-4d1a-9a8e-1c2d3e4f5a6b';
const ev = (t, extra = {}) => ({ eid: crypto.randomUUID(), t, at: Date.now(), sid: 'sess-0001', app: 'ccarp/portal', path: '/guides/ccarp/portal/', ...extra });
const send = (env, body, { origin = ORIGIN, ip } = {}) => worker.fetch(edgeRequest('https://x/e', { method: 'POST', headers: { origin, 'content-type': 'text/plain', 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129.0 Mobile Safari/537.36' }, body: JSON.stringify(body) }, ip), env);
const admin = (env, path, init = {}, key = KEY) => worker.fetch(edgeRequest('https://x' + path, { ...init, headers: { authorization: 'Bearer ' + key, ...(init.headers || {}) } }), env);

test('stores a batch with the edge IP, location and network', async () => {
  const env = fresh();
  const r = await send(env, { dev: DEV, usr: 'asha', ctx: { screen: '412x915', model: 'Pixel 8' }, events: [ev('open', { first: true }), ev('answer', { item: 'P-3.6-01', ok: 1, ms: 41000, domain: 3 })] }, { ip: '198.51.100.20' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  const rows = env.DB.db.prepare('SELECT * FROM events ORDER BY id').all();
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].ip, rows[0].city, rows[0].country, rows[0].asn, rows[0].usr], ['198.51.100.20', 'Bengaluru', 'IN', 24560, 'asha']);
  assert.equal(JSON.parse(rows[1].data).item, 'P-3.6-01');
  const d = env.DB.db.prepare('SELECT * FROM devices').get();
  assert.equal(d.usr, 'asha');
  assert.equal(JSON.parse(d.ctx).model, 'Pixel 8');
});

test('rejects other origins and malformed batches', async () => {
  const env = fresh();
  assert.equal((await send(env, { dev: DEV, events: [ev('open')] }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await send(env, { dev: 'x', events: [ev('open')] })).status, 400);
  assert.equal((await send(env, { dev: DEV, events: Array.from({ length: 101 }, () => ev('open')) })).status, 400);
  const bad = await worker.fetch(edgeRequest('https://x/e', { method: 'POST', headers: { origin: ORIGIN }, body: '{' }), env);
  assert.equal(bad.status, 400);
  assert.equal(env.DB.db.prepare('SELECT count(*) n FROM events').get().n, 0);
});

test('a resent event is stored once; bad event types are skipped', async () => {
  const env = fresh(), e = ev('open');
  await send(env, { dev: DEV, events: [e] });
  await send(env, { dev: DEV, events: [e, ev('DROP TABLE'), ev('view')] });
  assert.equal(env.DB.db.prepare('SELECT count(*) n FROM events').get().n, 2);
});

test('a named link sticks to the device; an admin label wins', async () => {
  const env = fresh();
  await send(env, { dev: DEV, usr: 'asha', events: [ev('open')] });
  await send(env, { dev: DEV, events: [ev('open')] });
  assert.equal(env.DB.db.prepare('SELECT usr FROM devices').get().usr, 'asha');
  assert.equal((await admin(env, `/api/devices/${DEV}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Asha (laptop)' }) })).status, 200);
  const { devices } = await (await admin(env, '/api/devices')).json();
  assert.equal(devices[0].who, 'Asha (laptop)');
});

test('admin API needs the key, and answers summary, people, detail, log and CSV', async () => {
  const env = fresh();
  await send(env, { dev: DEV, usr: 'asha', events: [ev('open'), ev('answer', { ok: 1 }), ev('answer', { ok: 0 }), ev('card_rate', { got: 1, app: 'ccarp/flashcards' }), ev('active', { ms: 90000 })] });
  await send(env, { dev: DEV, events: [ev('open')] }, { ip: '198.51.100.99' });
  assert.equal((await admin(env, '/api/summary', {}, 'wrong')).status, 401);
  assert.equal((await worker.fetch(edgeRequest('https://x/api/devices'), env)).status, 401);
  const sum = await (await admin(env, '/api/summary?tzo=330')).json();
  assert.equal(sum.totals.devices, 1);
  assert.equal(sum.totals.people, 1);
  assert.equal(sum.totals.answers7, 2);
  assert.equal(sum.days.length, 1);
  const { devices } = await (await admin(env, '/api/devices')).json();
  assert.deepEqual([devices[0].opens, devices[0].answers, devices[0].correct, devices[0].cards, devices[0].active_ms, devices[0].ips], [2, 2, 1, 1, 90000, 2]);
  const det = await (await admin(env, `/api/devices/${DEV}`)).json();
  assert.equal(det.ips.length, 2);
  const log = await (await admin(env, '/api/events?who=asha&t=answer')).json();
  assert.equal(log.events.length, 2);
  const page2 = await (await admin(env, `/api/events?limit=2&before=${log.events[0].id}`)).json();
  assert.ok(page2.events.every(e => e.id < log.events[0].id));
  const csv = await (await admin(env, '/api/export.csv')).text();
  assert.equal(csv.split('\r\n').length, 1 + 6);
  assert.match(csv.split('\r\n')[0], /^id,at,recv,label,usr,dev/);
});

test('erasing a device removes its events and record', async () => {
  const env = fresh();
  await send(env, { dev: DEV, events: [ev('open'), ev('view')] });
  assert.equal((await admin(env, `/api/devices/${DEV}`, { method: 'DELETE' })).status, 200);
  assert.equal(env.DB.db.prepare('SELECT count(*) n FROM events').get().n, 0);
  assert.equal(env.DB.db.prepare('SELECT count(*) n FROM devices').get().n, 0);
});

test('retention deletes old events only', async () => {
  const env = fresh();
  await send(env, { dev: DEV, events: [ev('open'), ev('view')] });
  env.DB.db.prepare('UPDATE events SET recv = ? WHERE t = ?').run(Date.now() - 400 * 86400000, 'open');
  await worker.scheduled({}, env);
  assert.deepEqual(env.DB.db.prepare('SELECT t FROM events').all().map(r => r.t), ['view']);
});

test('dashboard is served with a strict CSP; unknown paths 404', async () => {
  const env = fresh();
  const r = await worker.fetch(edgeRequest('https://x/admin'), env);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(await r.text(), /<title>Guides usage<\/title>/);
  assert.equal((await worker.fetch(edgeRequest('https://x/nope'), env)).status, 404);
});
