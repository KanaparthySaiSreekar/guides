// Deploys the usage log to Cloudflare: the D1 database and schema, the Worker (collector, API, dashboard), its admin key,
// the workers.dev address and the nightly retention job. Safe to re-run after editing worker.js, dashboard.html or schema.sql.
//   CF_API_EMAIL=… CF_API_KEY=… CF_ACCOUNT_ID=… node analytics/deploy.mjs [--subdomain kana-hive]
// The credentials are the account-level ones in hive/secrets/cloudflare.env. The admin key is generated once and kept in
// analytics/.admin-token (never committed); delete that file and re-run to rotate it.
// workers.dev, not *.kana.dpdns.org: AdGuard rewrites that zone to the home box on the LAN, which would swallow events.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const P = f => path.join(path.dirname(fileURLToPath(import.meta.url)), f);
// Only pages on the site may write events (browsers send Origin; the collector rejects every other one).
const SITE_ORIGINS = [JSON.parse(fs.readFileSync(P('../site/site.json'), 'utf8')).origin];

const NAME = 'guides-audit', DB_NAME = 'guides-audit', CRON = '30 21 * * *'; // 03:00 IST
const { CF_API_EMAIL: EMAIL, CF_API_KEY: KEY, CF_ACCOUNT_ID: ACC } = process.env;
if (!EMAIL || !KEY || !ACC) { console.error('set CF_API_EMAIL, CF_API_KEY and CF_ACCOUNT_ID'); process.exit(2); }
const args = process.argv.slice(2);
const wantSub = args.includes('--subdomain') ? args[args.indexOf('--subdomain') + 1] : 'kana-hive';

async function cf(method, p, body, { form, okCodes = [] } = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}${p}`, {
    method, body: form || (body === undefined ? undefined : JSON.stringify(body)),
    headers: { 'X-Auth-Email': EMAIL, 'X-Auth-Key': KEY, ...(body !== undefined && !form ? { 'content-type': 'application/json' } : {}) },
  });
  const j = await r.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${r.status}` }] }));
  if (!j.success && !(j.errors || []).some(e => okCodes.includes(e.code))) throw new Error(`${method} ${p}: ${JSON.stringify(j.errors)}`);
  return j;
}

// 1. The account's workers.dev subdomain (created on first deploy).
let sub = (await cf('GET', '/workers/subdomain', undefined, { okCodes: [10007] })).result?.subdomain;
if (!sub) sub = (await cf('PUT', '/workers/subdomain', { subdomain: wantSub })).result.subdomain;
console.log(`workers.dev subdomain: ${sub}`);

// 2. D1 database and schema.
let db = (await cf('GET', `/d1/database?name=${DB_NAME}`)).result.find(d => d.name === DB_NAME);
if (!db) db = (await cf('POST', '/d1/database', { name: DB_NAME })).result;
const schema = fs.readFileSync(P('schema.sql'), 'utf8').replace(/--.*$/gm, '');
for (const stmt of schema.split(';').map(s => s.trim()).filter(Boolean)) await cf('POST', `/d1/database/${db.uuid}/query`, { sql: stmt });
console.log(`D1 ${DB_NAME}: ${db.uuid} (schema applied)`);

// 3. The Worker: two modules, the code and the dashboard page (imported as text).
const form = new FormData();
form.append('metadata', JSON.stringify({
  main_module: 'worker.js', compatibility_date: '2026-09-01',
  bindings: [
    { type: 'd1', name: 'DB', id: db.uuid },
    { type: 'plain_text', name: 'ORIGINS', text: SITE_ORIGINS.join(',') },
    { type: 'plain_text', name: 'RETENTION_DAYS', text: '365' },
  ],
  keep_bindings: ['secret_text'],
}));
form.append('worker.js', new Blob([fs.readFileSync(P('worker.js'), 'utf8')], { type: 'application/javascript+module' }), 'worker.js');
form.append('dashboard.html', new Blob([fs.readFileSync(P('dashboard.html'), 'utf8')], { type: 'text/plain' }), 'dashboard.html');
await cf('PUT', `/workers/scripts/${NAME}`, undefined, { form });
console.log(`worker ${NAME}: uploaded`);

// 4. Admin key (a secret binding; kept across deploys by keep_bindings).
const tokenFile = P('.admin-token');
const fresh = !fs.existsSync(tokenFile);
if (fresh) fs.writeFileSync(tokenFile, crypto.randomBytes(32).toString('base64url') + '\n', { mode: 0o600 });
const token = fs.readFileSync(tokenFile, 'utf8').trim();
await cf('PUT', `/workers/scripts/${NAME}/secrets`, { name: 'ADMIN_TOKEN', text: token, type: 'secret_text' });
console.log(`admin key: ${fresh ? 'generated' : 'reused'} (${tokenFile})`);

// 5. Public address and the retention job.
await cf('POST', `/workers/scripts/${NAME}/subdomain`, { enabled: true, previews_enabled: false });
await cf('PUT', `/workers/scripts/${NAME}/schedules`, [{ cron: CRON }]);
const base = `https://${NAME}.${sub}.workers.dev`;
console.log(`\ncollector  ${base}/e\ndashboard  ${base}/admin#k=${token}`);
fs.writeFileSync(P('.dashboard-url'), `${base}/admin#k=${token}\n`, { mode: 0o600 });
