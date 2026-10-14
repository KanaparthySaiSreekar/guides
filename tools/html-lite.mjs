// Small helpers for reading the hand-written HTML sections of a guidebook guide (tables, bullet lists, panels).
// The sections are regular and written by this project, so regular expressions are enough; there is no general HTML parser here.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', harr: '↔', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', middot: '·', times: '×', approx: '≈' };
export const decode = s => String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

// Inline HTML to the light markup the flashcards understand: <b> becomes **bold**, <code> becomes `code`, the rest is text.
export const inline = html => decode(String(html)
  .replace(/<\s*(b|strong)\s*>/gi, '**').replace(/<\/\s*(b|strong)\s*>/gi, '**')
  .replace(/<\s*code\s*>/gi, '`').replace(/<\/\s*code\s*>/gi, '`')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]*>/g, ' '))
  .replace(/\*\*\s*\*\*/g, '').replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(').trim();

// Plain text: no markup at all.
export const text = html => inline(html).replace(/\*\*|`/g, '');

// <table> elements in document order: { head: [text], rows: [[cell html]] }.
export function tables(html) {
  const out = [];
  for (const m of html.matchAll(/<table>([\s\S]*?)<\/table>/g)) {
    const head = [...m[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(x => text(x[1]));
    const rows = [...m[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1])).filter(r => r.length);
    out.push({ head, rows });
  }
  return out;
}

// <li> items of a fragment, as html.
export const items = html => [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]);

// Panels: <div class="panel"><h4>title</h4> ... </div>, each with its bullet items (html).
export function panels(html) {
  return [...html.matchAll(/<div class="panel"><h4>([\s\S]*?)<\/h4>([\s\S]*?)<\/div>/g)].map(m => ({ title: text(m[1]), items: items(m[2]) }));
}

export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
