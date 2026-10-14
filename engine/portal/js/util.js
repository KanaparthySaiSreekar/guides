/* util: escaping, inline markdown, seeded randomness, formatting. DOM-free. */
(function (G) {
  const CP = G.CP = G.CP || {};
  const U = CP.U = {};
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  // inline: `code`, **bold**, *italic*; everything else escaped
  U.inl = s => U.esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  U.attr = s => U.esc(s);

  U.hash = s => { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  U.rng = seed => {
    let a = (typeof seed === 'number' ? seed : U.hash(seed)) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  U.shuffle = (arr, seed) => {
    const r = typeof seed === 'function' ? seed : U.rng(seed == null ? Math.floor(Math.random() * 2 ** 31) : seed);
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  U.uid = () => {
    try { const b = new Uint32Array(2); G.crypto.getRandomValues(b); return b[0].toString(36) + b[1].toString(36).slice(0, 4); }
    catch (e) { return Math.floor(Math.random() * 2 ** 40).toString(36); }
  };
  U.randSeed = () => Math.floor(Math.random() * 2 ** 31);

  U.DAY = 86400000;
  U.dayNum = ts => { const d = new Date(ts); return Math.floor((ts - d.getTimezoneOffset() * 60000) / U.DAY); };
  U.daysBetween = (a, b) => U.dayNum(b) - U.dayNum(a);
  U.fmtClock = ms => {
    ms = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(ms / 3600), m = Math.floor(ms % 3600 / 60), s = ms % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  };
  U.fmtMin = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : ''); };
  U.fmtDate = ts => { try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return new Date(ts).toISOString().slice(0, 10); } };
  U.fmtDateTime = ts => { try { return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(ts).toISOString(); } };
  U.isoDay = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  U.pct = (x, d = 0) => x == null || isNaN(x) ? '–' : (x * 100).toFixed(d) + '%';
  U.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  U.sum = a => a.reduce((s, x) => s + x, 0);
  U.plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));
  U.groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
  U.words = s => (String(s || '').trim().match(/\S+/g) || []).length;
})(typeof window !== 'undefined' ? window : globalThis);
