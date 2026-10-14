// Shared helpers for the portal build tools (Node 24, no dependencies).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const P = (...p) => path.join(ROOT, ...p);

// The guide a tool works on: --guide <slug> or $GUIDE, else ccarp. A guide's own files live in guides/<slug>/.
const argGuide = process.argv.includes('--guide') ? process.argv[process.argv.indexOf('--guide') + 1] : null;
export const GUIDE = argGuide || process.env.GUIDE || 'ccarp';
export const G = (...p) => P('guides', GUIDE, ...p);
// C: the guide's content folder (guides/<slug>/content/...). Pass 'content/x.json' as written in the tools.
export const C = (...p) => G(...p);
// Build products and scratch space, both ignored by git: dist/<guide>/<app>.html are the standalone offline files.
export const DIST = (...p) => P('dist', ...p);
export const CACHE = (...p) => P('.cache', ...p);

// The date a build's inputs last changed: the last commit that touched them, or now while they have uncommitted edits.
// Stamping builds with it (not the clock) means rebuilding unchanged sources gives identical files, so a deploy only
// changes what actually changed and installed copies refresh only when they need to.
export function stampFor(...paths) {
  try {
    const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!git(['status', '--porcelain', '--', ...paths])) { const d = git(['log', '-1', '--format=%cI', '--', ...paths]); if (d) return new Date(d); }
  } catch { /* not a git checkout: fall through */ }
  return new Date();
}

export const readJSON = (f, fallback) => {
  const file = path.isAbsolute(f) ? f : P(f);
  if (!fs.existsSync(file)) { if (fallback !== undefined) return fallback; throw new Error('missing ' + file); }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
export const writeJSON = (f, o) => {
  const file = path.isAbsolute(f) ? f : P(f);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(o, null, 1) + '\n');
};

// Deterministic PRNG so every tool run is reproducible.
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashStr(String(seed));
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export const shuffle = (arr, r) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const words = s => String(s || '').replace(/`[^`]*`/g, ' x ').toLowerCase().match(/[a-z0-9][a-z0-9'.%-]*/g) || [];
export const wordCount = s => (String(s || '').trim().match(/\S+/g) || []).length;
export function shingles(s, n = 5) {
  const w = words(s), out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
// Containment: share of A's shingles found in B (catches copying into a longer text).
export function containment(a, b) {
  if (!a.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}

export const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

export function loadBlueprint() {
  const bp = readJSON(C('content/blueprint.json'));
  const objs = new Map();
  for (const d of bp.domains) for (const o of d.objectives) objs.set(o.id, { ...o, domain: d.n });
  return { bp, objs };
}

export function loadItems() {
  const dir = C('content/items');
  const all = [];
  if (!fs.existsSync(dir)) return all;
  for (const f of fs.readdirSync(dir).filter(f => /^\d\.\d\.json$/.test(f)).sort()) {
    let arr;
    try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { console.log(`WARN  ${f}: could not parse (${e.message.slice(0, 60)}); skipped`); continue; }
    if (!Array.isArray(arr)) continue;
    for (const it of arr) all.push({ ...it, _file: f });
  }
  return all;
}
