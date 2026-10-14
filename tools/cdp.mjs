// Minimal Chrome DevTools Protocol driver (Node 24, no deps) for QA scripts.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

export const PORTAL = path.join(ROOT, 'dist', 'ccarp', 'portal.html');
export const URL0 = 'file:///' + PORTAL.replace(/\\/g, '/').replace(/ /g, '%20');
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ port = 9333, dark = false } = {}) {
  const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
  const prof = path.join(ROOT, '.cache', 'cdp-profile-' + port);
  fs.rmSync(prof, { recursive: true, force: true });
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 60; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); } }
  if (!ver) throw new Error('chrome did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } else if (d.method) events.push(d); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  else await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const api = {
    send, events,
    errors: () => events.filter(e => (e.method === 'Runtime.exceptionThrown') || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')).map(e => e.params.exceptionDetails ? (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text) : e.params.entry ? e.params.entry.text : JSON.stringify(e.params.args?.map(a => a.value))),
    viewport: async (w, h, mobile) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile }),
    goto: async (hash) => { await send('Page.navigate', { url: URL0 + (hash || '') }); await sleep(600); },
    hash: async (hash) => { await api.eval(`location.hash=${JSON.stringify(hash)}`); await sleep(250); },
    eval: async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
    click: async (sel) => { const ok = await api.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true;})()`); await sleep(150); return ok; },
    key: async (key) => { await api.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}))`); await sleep(120); },
    shot: async (file, full) => {
      let clip;
      if (full) { const m = await send('Page.getLayoutMetrics'); clip = { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 12000), scale: 1 }; }
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!full, ...(clip ? { clip } : {}) });
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    pdf: async (file) => { const r = await send('Page.printToPDF', { printBackground: false, preferCSSPageSize: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return Buffer.from(r.data, 'base64'); },
    close: () => { try { ws.close(); } catch { } proc.kill(); },
    sleep,
  };
  return api;
}
