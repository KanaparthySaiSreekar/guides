// Runs analytics/worker.js locally for tests: D1 is stood in by node:sqlite (same SQLite, same ?1 parameters), and
// requests get the Cloudflare fields (cf-connecting-ip, request.cf) the edge would add.
//   import { loadWorker, serveLocal } from './local.mjs'
//   node analytics/local.mjs [port]          serves on http://localhost:8767 with admin key "local-key"
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) {
    if (p.some(v => v === undefined)) throw new Error('D1_TYPE_ERROR: undefined is not a supported bind value');
    return new Stmt(this.db, this.sql, p);
  }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params), success: true }; }
  async run() { this.db.prepare(this.sql).run(...this.params); return { results: [], success: true }; }
}
export class LocalD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8'));
  }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map(s => ({ results: this.db.prepare(s.sql).all(...s.params), success: true })); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}

// The Worker module with its dashboard import inlined (Node cannot import .html as text).
export async function loadWorker() {
  if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const src = fs.readFileSync(path.join(DIR, 'worker.js'), 'utf8')
    .replace("import DASHBOARD from './dashboard.html';", () => `const DASHBOARD = ${JSON.stringify(fs.readFileSync(path.join(DIR, 'dashboard.html'), 'utf8'))};`);
  const tmp = path.join(fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'guides-worker-')), 'worker.mjs');
  fs.writeFileSync(tmp, src);
  return (await import(pathToFileURL(tmp).href)).default;
}

export const CF = { country: 'IN', region: 'Karnataka', city: 'Bengaluru', asn: 24560, asOrganization: 'Bharti Airtel Ltd.' };
// A request as the edge would hand it to the Worker.
export function edgeRequest(url, init = {}, ip = '203.0.113.7', cf = CF) {
  const req = new Request(url, { ...init, headers: { 'cf-connecting-ip': ip, ...(init.headers || {}) } });
  Object.defineProperty(req, 'cf', { value: cf });
  return req;
}

export async function serveLocal({ port = 8767, origins = ['http://localhost:8765'], token = 'local-key' } = {}) {
  const worker = await loadWorker();
  const env = { DB: new LocalD1(), ORIGINS: origins.join(','), RETENTION_DAYS: '365', ADMIN_TOKEN: token };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
    const r = await worker.fetch(edgeRequest(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: chunks.length && req.method !== 'GET' ? Buffer.concat(chunks) : undefined }, req.socket.remoteAddress.replace(/^::ffff:/, '')), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise(ok => server.listen(port, ok));
  return { env, worker, url: `http://localhost:${port}`, close: () => server.close() };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await serveLocal({ port: +process.argv[2] || 8767 });
  console.log(`local collector ${s.url}/e · dashboard ${s.url}/admin#k=local-key`);
}
