// Usage log for the guides site (Cloudflare Worker + D1). Deployed by analytics/deploy.mjs.
//   POST /e          events from site/track.js; IP, location and network come from Cloudflare's edge, never the client
//   GET  /admin      the dashboard (dashboard.html); its API calls carry the admin key
//   GET  /api/...    summary, people, device detail, event log, CSV export; POST rename, DELETE erase (admin key)
// A cron trigger deletes events older than RETENTION_DAYS.
import DASHBOARD from './dashboard.html';

const MAX_BODY = 64 * 1024, MAX_EVENTS = 100, DAY = 86400000;
const ID = /^[A-Za-z0-9-]{8,64}$/, TYPE = /^[a-z][a-z_]{0,23}$/;
const str = (v, n) => (v == null ? null : String(v).slice(0, n));
const json = (body, status = 200, h = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });

function cors(req, env) {
  const o = req.headers.get('origin');
  const ok = o && env.ORIGINS.split(',').map(s => s.trim()).includes(o);
  return ok ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' } : null;
}

async function ingest(req, env) {
  const h = cors(req, env);
  if (!h) return new Response('origin not allowed', { status: 403 });
  const text = await req.text();
  if (text.length > MAX_BODY) return new Response('too large', { status: 413, headers: h });
  let b;
  try { b = JSON.parse(text); } catch { return new Response('bad json', { status: 400, headers: h }); }
  if (!b || !ID.test(b.dev || '') || !Array.isArray(b.events) || b.events.length > MAX_EVENTS) return new Response('bad batch', { status: 400, headers: h });
  const cf = req.cf || {}, now = Date.now();
  const net = {
    ip: str(req.headers.get('cf-connecting-ip'), 64), country: str(cf.country, 2), region: str(cf.region, 80), city: str(cf.city, 80),
    asn: Number.isInteger(cf.asn) ? cf.asn : null, org: str(cf.asOrganization, 120), ua: str(req.headers.get('user-agent'), 400),
  };
  const usr = str(b.usr, 60) || null, ctx = b.ctx && typeof b.ctx === 'object' ? str(JSON.stringify(b.ctx), 2000) : null;
  const ins = env.DB.prepare(`INSERT OR IGNORE INTO events (eid, at, recv, dev, sid, usr, app, t, path, data, ip, country, region, city, asn, org, ua)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`);
  const stmts = [];
  for (const e of b.events) {
    if (!e || !ID.test(e.eid || '') || !TYPE.test(e.t || '')) continue;
    const { eid, t, at, sid, app, path, ...rest } = e;
    // Client clocks drift and offline events arrive late, so keep the client time but never trust it beyond a sane window.
    const when = Number.isFinite(at) && at > now - 400 * DAY && at < now + DAY ? Math.round(at) : now;
    const data = Object.keys(rest).length ? str(JSON.stringify(rest), 2000) : null;
    stmts.push(ins.bind(eid, when, now, b.dev, str(sid, 64), usr, str(app, 40), t, str(path, 200), data, net.ip, net.country, net.region, net.city, net.asn, net.org, net.ua));
  }
  stmts.push(env.DB.prepare(`INSERT INTO devices (dev, first_seen, last_seen, usr, ip, country, region, city, org, ua, ctx) VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ON CONFLICT(dev) DO UPDATE SET last_seen = excluded.last_seen, usr = COALESCE(excluded.usr, devices.usr), ip = excluded.ip, country = excluded.country,
    region = excluded.region, city = excluded.city, org = excluded.org, ua = excluded.ua, ctx = COALESCE(excluded.ctx, devices.ctx)`)
    .bind(b.dev, now, usr, net.ip, net.country, net.region, net.city, net.org, net.ua, ctx));
  await env.DB.batch(stmts);
  return json({ ok: true, n: stmts.length - 1 }, 200, h);
}

async function authed(req, env) {
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || !got) return false;
  const a = new TextEncoder().encode(got), b = new TextEncoder().encode(env.ADMIN_TOKEN);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

// Filters shared by the event log and the CSV export.
function where(u) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', `?${p.length}`)); };
  if (u.get('dev')) add('dev = ?', u.get('dev'));
  if (u.get('who')) add(`COALESCE((SELECT label FROM devices d WHERE d.dev = events.dev), usr) = ?`, u.get('who'));
  if (u.get('t')) add('t = ?', u.get('t'));
  if (u.get('app')) add('app = ?', u.get('app'));
  if (u.get('ip')) add('ip = ?', u.get('ip'));
  if (+u.get('from')) add('at >= ?', +u.get('from'));
  if (+u.get('to')) add('at < ?', +u.get('to'));
  if (+u.get('before')) add('id < ?', +u.get('before'));
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', p };
}
const LOG_COLS = `id, at, recv, dev, sid, usr, (SELECT label FROM devices d WHERE d.dev = events.dev) AS label, app, t, path, data, ip, country, region, city, asn, org, ua`;

async function api(req, env, url) {
  if (!(await authed(req, env))) return json({ error: 'unauthorized' }, 401);
  const u = url.searchParams, DB = env.DB, path = url.pathname;
  if (path === '/api/summary' && req.method === 'GET') {
    const tzo = Math.max(-840, Math.min(840, +u.get('tzo') || 0)) * 60; // minutes east of UTC, from the browser
    const since = Date.now() - 30 * DAY;
    const [tot, days, apps] = await DB.batch([
      DB.prepare(`SELECT (SELECT count(*) FROM devices) devices, (SELECT count(*) FROM devices WHERE last_seen > ?1) active7,
        (SELECT count(DISTINCT COALESCE(label, usr)) FROM devices WHERE COALESCE(label, usr) IS NOT NULL) people,
        (SELECT count(*) FROM events WHERE t = 'open' AND at > ?1) opens7, (SELECT count(*) FROM events WHERE t = 'answer' AND at > ?1) answers7,
        (SELECT count(*) FROM events WHERE t = 'card_rate' AND at > ?1) cards7, (SELECT count(*) FROM events) events`).bind(Date.now() - 7 * DAY),
      DB.prepare(`SELECT date(at / 1000 + ?2, 'unixepoch') day, count(DISTINCT dev) devices, sum(t = 'open') opens, sum(t IN ('answer', 'card_rate')) study
        FROM events WHERE at > ?1 GROUP BY day ORDER BY day`).bind(since, tzo),
      DB.prepare(`SELECT app, count(DISTINCT dev) devices, sum(t = 'open') opens FROM events WHERE at > ?1 AND app IS NOT NULL GROUP BY app ORDER BY opens DESC`).bind(since),
    ]);
    return json({ totals: tot.results[0], days: days.results, apps: apps.results });
  }
  if (path === '/api/devices' && req.method === 'GET') {
    const r = await DB.prepare(`SELECT d.*, COALESCE(d.label, d.usr) who, s.opens, s.answers, s.correct, s.cards, s.sessions, s.active_ms, s.ips
      FROM devices d LEFT JOIN (SELECT dev, sum(t = 'open') opens, sum(t = 'answer') answers, sum(t = 'answer' AND json_extract(data, '$.ok') = 1) correct,
        sum(t = 'card_rate') cards, sum(t = 'session_end') sessions, sum(CASE WHEN t = 'active' THEN json_extract(data, '$.ms') ELSE 0 END) active_ms,
        count(DISTINCT ip) ips FROM events GROUP BY dev) s USING (dev) ORDER BY d.last_seen DESC LIMIT 1000`).all();
    return json({ devices: r.results });
  }
  const m = /^\/api\/devices\/([A-Za-z0-9-]{8,64})$/.exec(path);
  if (m && req.method === 'GET') {
    const [d, ips, apps] = await DB.batch([
      DB.prepare(`SELECT * FROM devices WHERE dev = ?1`).bind(m[1]),
      DB.prepare(`SELECT ip, country, region, city, org, count(*) n, min(at) first, max(at) last FROM events WHERE dev = ?1 GROUP BY ip ORDER BY last DESC`).bind(m[1]),
      DB.prepare(`SELECT app, sum(t = 'open') opens, sum(t = 'answer') answers, sum(t = 'answer' AND json_extract(data, '$.ok') = 1) correct, sum(t = 'card_rate') cards,
        sum(t = 'session_end') sessions, max(at) last FROM events WHERE dev = ?1 GROUP BY app ORDER BY last DESC`).bind(m[1]),
    ]);
    if (!d.results.length) return json({ error: 'not found' }, 404);
    return json({ device: d.results[0], ips: ips.results, apps: apps.results });
  }
  if (m && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    await DB.prepare(`UPDATE devices SET label = ?2 WHERE dev = ?1`).bind(m[1], str(b.label, 60) || null).run();
    return json({ ok: true });
  }
  if (m && req.method === 'DELETE') {
    await DB.batch([DB.prepare(`DELETE FROM events WHERE dev = ?1`).bind(m[1]), DB.prepare(`DELETE FROM devices WHERE dev = ?1`).bind(m[1])]);
    return json({ ok: true });
  }
  if (path === '/api/events' && req.method === 'GET') {
    const { sql, p } = where(u), limit = Math.max(1, Math.min(500, +u.get('limit') || 100));
    const r = await DB.prepare(`SELECT ${LOG_COLS} FROM events ${sql} ORDER BY id DESC LIMIT ${limit}`).bind(...p).all();
    return json({ events: r.results });
  }
  if (path === '/api/export.csv' && req.method === 'GET') {
    const { sql, p } = where(u);
    const r = await DB.prepare(`SELECT ${LOG_COLS} FROM events ${sql} ORDER BY id DESC LIMIT 100000`).bind(...p).all();
    const cols = ['id', 'at', 'recv', 'label', 'usr', 'dev', 'sid', 'app', 't', 'path', 'data', 'ip', 'country', 'region', 'city', 'asn', 'org', 'ua'];
    const cell = v => (v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const iso = v => new Date(v).toISOString();
    const lines = [cols.join(','), ...r.results.map(e => cols.map(c => cell(c === 'at' || c === 'recv' ? iso(e[c]) : e[c])).join(','))];
    return new Response(lines.join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="guides-usage-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/e') {
        if (req.method === 'OPTIONS') { const h = cors(req, env); return new Response(null, { status: h ? 204 : 403, headers: h || {} }); }
        if (req.method === 'POST') return await ingest(req, env);
      }
      if (url.pathname.startsWith('/api/')) return await api(req, env, url);
      if (url.pathname === '/admin' && req.method === 'GET') {
        return new Response(DASHBOARD, { headers: {
          'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
          'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        } });
      }
      if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n');
      return new Response('Not found', { status: 404 });
    } catch (err) {
      return json({ error: 'server error', detail: String(err && err.message || err).slice(0, 200) }, 500);
    }
  },
  async scheduled(_ev, env) {
    const days = +env.RETENTION_DAYS || 365;
    await env.DB.prepare(`DELETE FROM events WHERE recv < ?1`).bind(Date.now() - days * DAY).run();
    await env.DB.prepare(`DELETE FROM devices WHERE last_seen < ?1 AND dev NOT IN (SELECT DISTINCT dev FROM events)`).bind(Date.now() - days * DAY).run();
  },
};
