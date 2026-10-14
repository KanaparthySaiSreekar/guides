// Previews the built site locally, laid out like GitHub Pages (the site lives under /guides/).
//   node tools/serve.mjs [dir=docs] [--port 8080]      then open http://localhost:8080/guides/
// Service workers need a secure context; localhost counts, so the apps install and work offline here too.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { P } from './lib.mjs';
import { SITE } from './site-lib.mjs';

const args = process.argv.slice(2);
const port = +(args.includes('--port') ? args[args.indexOf('--port') + 1] : 8080);
const root = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') || P('docs'));
const base = SITE.base;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };

if (!fs.existsSync(path.join(root, 'index.html'))) { console.error(`${root} has no index.html: run node tools/build.mjs first`); process.exit(1); }

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(base)) { res.writeHead(302, { Location: base }); return res.end(); }
  p = p.slice(base.length);
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!req.url.split('?')[0].endsWith('/')) { res.writeHead(301, { Location: req.url.split('?')[0] + '/' }); return res.end(); }
    file = path.join(file, 'index.html');
  }
  const found = fs.existsSync(file);
  if (!found) file = path.join(root, '404.html');
  res.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}${base}`));
