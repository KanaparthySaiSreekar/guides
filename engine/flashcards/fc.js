/* Flashcards: one offline file, two modes (concept cards and exam MCQs), progress kept in this browser.
   The guide supplies the cards, questions and DATA.ui (names, deck and set lists, storage key); see tools/build-flashcards.mjs. */
(() => {
'use strict';
const DATA = JSON.parse(document.getElementById('fc-data').textContent);
const UI = DATA.ui;
const KEY = UI.key;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// **bold** and `code` only; bold never reaches inside a code span (e.g. `Read(**/.env)`), and paths may break after an inner /
const md = s => esc(s).split('`').map((seg, i) => (i % 2 ? `<code>${seg.replace(/(\w)([/\\])(?=\S)/g, '$1$2<wbr>').replace(/([A-Za-z0-9])_(?=[A-Za-z0-9])/g, '$1_<wbr>')}</code>` : seg.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'))).join('').replace(/\n/g, '<br>');
const plain = s => String(s == null ? '' : s).replace(/\*\*|`/g, '');
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LET = i => String.fromCharCode(65 + i);
// Usage events for the hosted copy's log (site/track.js); in the standalone file nothing listens.
const emit = (t, d) => { try { document.dispatchEvent(new CustomEvent('guides:track', { detail: { ...d, t } })); } catch { } };
const NUMW = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const join = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || '');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  star: '<path d="M12 3.6l2.55 5.2 5.75.84-4.16 4.05.98 5.72L12 16.72l-5.12 2.69.98-5.72L3.7 9.64l5.75-.84z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  quiz: '<path d="M9.2 9a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1.9-1.1 1.6v.7M12 17.4v.1"/><circle cx="12" cy="12" r="9.5"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.1"/>',
  redo: '<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4.5V9h-4.5"/>',
  shuffle: '<path d="M3 7h3c2.2 0 3.3 1.2 4.4 3.1l2.2 3.8C13.7 15.8 14.8 17 17 17h4M18 14l3 3-3 3M3 17h3c1.3 0 2.2-.4 3-1.2M14 8.2c.8-.8 1.7-1.2 3-1.2h4M18 4l3 3-3 3"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

const { decks: DECKS, deckGroups: DECK_GROUPS, sets: SETS, setGroups: SET_GROUPS } = UI;
const SIZES = { cards: [[10, '10'], [20, '20'], [50, '50'], [0, 'All']], mcq: [[10, '10'], [20, '20'], [0, 'All']] };
const DEFAULT_SEL = UI.defaultSel;

const cards = DATA.cards, mcqs = DATA.mcqs;
const byId = new Map();
for (const c of cards) byId.set(c.id, { kind: 'card', it: c });
for (const q of mcqs) byId.set(q.id, { kind: 'mcq', it: q });
const DOM = Object.fromEntries(DATA.domains.map(d => [d.n, d]));
const trapName = code => (DATA.traps[code] || {}).n || '';

// ---------- persistence (browser-only; the page works without it) ----------
// Marks carry the item's content hash (h): if a card's text changes, its old mark no longer applies.
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const saved = load();
const S = {
  known: {}, star: {}, res: {},
  cfg: Object.assign({ theme: 'auto', scale: 1, readMode: false, keys: true }, saved.cfg),
  sel: Object.assign({}, DEFAULT_SEL, saved.sel),
  sessions: { cards: null, mcq: null },
};
// Marks saved without a content hash cannot be matched to what they were made on, so they are dropped.
for (const [id, v] of Object.entries(saved.known || {})) if (byId.has(id) && typeof v === 'string') S.known[id] = v;
for (const [id, v] of Object.entries(saved.star || {})) if (byId.has(id) && typeof v === 'string') S.star[id] = v;
for (const [id, r] of Object.entries(saved.res || {})) if (byId.has(id) && r && r.h) S.res[id] = r;
Object.assign(S.sessions, saved.sessions || {});
if (saved.sess && !saved.sessions && saved.sess.mode) S.sessions[saved.sess.mode] = saved.sess;
S.sel.decks = (S.sel.decks || []).filter(k => DECKS[k]);
S.sel.sets = (S.sel.sets || []).filter(k => SETS[k]);
S.sel.doms = (S.sel.doms || []).filter(n => n === 0 || DOM[n]);
S.sel.size = Object.assign({}, DEFAULT_SEL.size, typeof S.sel.size === 'object' ? S.sel.size : {});
if (!['cards', 'mcq'].includes(S.sel.mode)) S.sel.mode = 'cards';
for (const m of ['cards', 'mcq']) {
  const s = S.sessions[m];
  if (!s || !Array.isArray(s.ids)) { S.sessions[m] = null; continue; }
  const keep = id => byId.has(id) && byId.get(id).kind === (m === 'cards' ? 'card' : 'mcq');
  const pos = Math.min(Math.max(0, s.pos | 0), s.ids.length);
  s.pos = s.ids.slice(0, pos).filter(keep).length;       // stay on the same card when earlier ones are gone
  s.ids = s.ids.filter(keep);
  if (!s.ids.length) { S.sessions[m] = null; continue; }
  s.mode = m; s.pos = Math.min(s.pos, s.ids.length);
  s.rev = s.rev || {}; s.ans = s.ans || {}; s.got = s.got || []; s.again = s.again || []; s.missed = s.missed || [];
  if (!s.seen) s.seen = Object.fromEntries([...s.ids.slice(0, s.pos + 1), ...s.got, ...s.again, ...Object.keys(s.ans)].filter(id => byId.has(id)).map(id => [id, 1]));
  if (s.hs) for (const box of [s.ans, s.rev]) for (const k of Object.keys(box)) { const id = k.split('#')[0]; if (s.hs[id] && byId.has(id) && s.hs[id] !== byId.get(id).it.h) delete box[k]; }
}
const kOf = it => { const v = S.known[it.id]; if (!v) return undefined; const i = v.indexOf(':'); return v.slice(i + 1) === it.h ? Number(v.slice(0, i)) : undefined; };
const isKnown = it => kOf(it) === 1;
const isStar = it => S.star[it.id] === it.h;
const resOf = it => { const r = S.res[it.id]; return r && r.h === it.h ? r : null; };
let saveT = 0;
const write = () => { clearTimeout(saveT); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } };
const save = () => { clearTimeout(saveT); saveT = setTimeout(write, 150); };
addEventListener('pagehide', write);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') write(); });

// ---------- theme and text size ----------
// A host page (e.g. an Artifact viewer) may stamp its own data-theme before we run; "Auto" follows it.
const hostTheme = document.documentElement.dataset.theme || null;
function applyCfg() {
  const r = document.documentElement;
  const want = S.cfg.theme === 'auto' ? hostTheme : S.cfg.theme;
  if (want) r.dataset.theme = want; else delete r.dataset.theme;
  r.style.setProperty('--scale', S.cfg.scale);
  const dark = want === 'dark' || (!want && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = dark ? '#0B1628' : '#F3F6FB'; });
}
applyCfg();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyCfg);

// ---------- announcements and focus ----------
let srT = 0;
function announce(msg) { const r = $('#sr'); if (!r) return; clearTimeout(srT); r.textContent = ''; srT = setTimeout(() => { r.textContent = msg; }, 60); }
const focusVisibleNow = () => { const a = document.activeElement; try { return !!a && a !== document.body && a.matches(':focus-visible'); } catch (e) { return false; } };
// Re-renders replace nodes; put focus back on the same control, or on a sensible fallback when it is gone.
function keepFocus(fn, fallback) {
  const a = document.activeElement;
  const had = !!a && a !== document.body && document.contains(a);
  const ds = had && a.dataset && a.dataset.act ? a.tagName.toLowerCase() + ['act', 'k', 'n', 'm', 'i'].filter(k => a.dataset[k] != null).map(k => `[data-${k}="${CSS.escape(a.dataset[k])}"]`).join('') : '';
  const aId = had ? a.id : '';
  fn();
  if (!had || document.contains(a)) return;
  const usable = t => !!t && t.isConnected && !t.disabled && !t.closest('[hidden]');
  let t = [ds && document.querySelector(ds), aId && document.getElementById(aId)].find(usable);
  if (!t && fallback) t = [...document.querySelectorAll(fallback)].find(usable);
  if (!t) return;
  if (!/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !t.hasAttribute('tabindex')) t.tabIndex = -1;
  t.focus({ preventScroll: true });
}

// ---------- selection ----------
const effDoms = sel => (sel.mode === 'mcq' ? sel.doms.filter(Boolean) : sel.doms);
// One predicate for counting and filtering: a domain includes its own items and the cross-domain items tagged with it.
const inDom = (it, n) => (n === 0 ? !it.d : it.d === n || (!it.d && !!it.ds && it.ds.includes(n)));
const domOk = (it, doms) => !doms.length || doms.some(n => inDom(it, n));
const showOk = (it, mode, show) => {
  if (show === 'star') return isStar(it);
  if (mode === 'cards') return show === 'learn' ? !isKnown(it) : true;
  const r = resOf(it);
  if (show === 'new') return !r;
  if (show === 'missed') return !!r && !r.ok;
  return true;
};
const inSets = (it, sel) => (sel.mode === 'cards' ? sel.decks.includes(it.k) : sel.sets.includes(it.s));
function pool(sel = S.sel) {
  const doms = effDoms(sel);
  if (sel.mode === 'cards') {
    const order = DECK_GROUPS.flatMap(g => g[1]).filter(k => sel.decks.includes(k));
    return cards.filter(c => inSets(c, sel) && domOk(c, doms) && showOk(c, 'cards', sel.show)).sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  }
  return mcqs.filter(q => inSets(q, sel) && domOk(q, doms) && showOk(q, 'mcq', sel.show));
}
const shuffle = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
// A capped session takes what you have not learned yet first: unknown cards; unanswered, then missed, questions.
function buildList(sel = S.sel) {
  let list = pool(sel);
  if (sel.order === 'shuf') list = shuffle(list);
  const size = sel.size[sel.mode] || 0;
  if (size && list.length > size) {
    const rank = sel.mode === 'cards' ? it => (isKnown(it) ? 1 : 0) : it => { const r = resOf(it); return !r ? 0 : r.ok ? 2 : 1; };
    list = list.map((it, i) => [it, rank(it), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]).slice(0, size);
  }
  return list;
}
function sessionLabel(sel) {
  // Name the sets in the order their items appear (official samples first, then the forms).
  const SET_ORDER = UI.setOrder, DECK_ORDER = DECK_GROUPS.flatMap(g => g[1]);
  const names = sel.mode === 'cards' ? DECK_ORDER.filter(k => sel.decks.includes(k)).map(k => DECKS[k]) : SET_ORDER.filter(k => sel.sets.includes(k)).map(k => SETS[k]);
  let l = names.length > 2 ? `${names[0]} + ${names.length - 1} more` : names.join(' + ');
  const doms = effDoms(sel);
  if (doms.length) l += ' · ' + doms.map(n => (n ? 'D' + n : 'General')).join(', ');
  const SHOWL = { learn: 'to learn', star: 'starred', missed: 'missed', new: 'unanswered' };
  if (SHOWL[sel.show]) l += ' · ' + SHOWL[sel.show];
  return l;
}
const SS = () => S.sessions[S.sel.mode];
// Reveal state belongs to a position's occurrence of a card, so a re-queued copy comes back face down.
const occKey = (s, pos) => { const id = s.ids[pos]; let n = 0; for (let j = 0; j <= pos; j++) if (s.ids[j] === id) n++; return n > 1 ? `${id}#${n}` : id; };
function startSession(ids, label, mode, pos = 0) {
  S.sel.mode = mode;
  S.sessions[mode] = { mode, ids, pos, label, rev: {}, ans: {}, got: [], again: [], missed: [], seen: {}, hs: Object.fromEntries(ids.map(id => [id, byId.get(id).it.h])), done: false };
  save();
  emit('session_start', { mode, label, n: ids.length });
  go('study');
}

// ---------- routing (hash, so the phone's back button behaves) ----------
let view = 'home', skipPop = false;
function go(v) {
  view = v;
  try {
    if (v === 'study') { if (history.state && history.state.v === 'study') history.replaceState({ v: 'study' }, '', '#study'); else history.pushState({ v: 'study' }, '', '#study'); }
    else history.replaceState(null, '', '#home');
  } catch (e) { /* file:// quirks */ }
  render();
}
function goHome() {
  if (history.state && history.state.v === 'study') { try { history.back(); return; } catch (e) { /* fall through */ } }
  view = 'home';
  try { history.replaceState(null, '', '#home'); } catch (e) { /* ignore */ }
  render(); scrollTo(0, 0);
}
addEventListener('popstate', () => {
  if (skipPop) { skipPop = false; return; }
  if (sheetOpen) { closeSheet({ fromPop: true }); return; }
  if (!/^#(study|home)?$/.test(location.hash)) { try { history.replaceState(history.state, '', view === 'study' ? '#study' : '#home'); } catch (e) { /* ignore */ } return; }
  const s = SS();
  view = location.hash === '#study' && s && !s.done ? 'study' : 'home';
  if (location.hash === '#study' && view === 'home') { skipPop = true; try { history.back(); } catch (e) { skipPop = false; } }
  render();
  scrollTo(0, 0);
});
function render() {
  haltNav();
  if (sheetOpen) closeSheet({ instant: true });
  const a = document.activeElement, had = a && a !== document.body && a.isConnected;
  if (view === 'study' && SS()) renderStudy(); else { view = 'home'; renderHome(); }
  // The control that had focus was replaced: continue from the new view's heading.
  if (had && !a.isConnected) { const t = $('#focus') || $('#main'); if (t) t.focus({ preventScroll: true }); }
}

// ---------- home ----------
let query = '', srchT = 0, pendingOpen = null;
function renderHome() {
  const mode = S.sel.mode;
  $('#app').innerHTML = `<main id="main" class="home wrap" tabindex="-1">
    <header class="top"><div class="grow"><h1>${esc(UI.title)}</h1><p class="sub">${cards.length} cards · ${mcqs.length} questions · offline</p></div>
      <button class="iconbtn" data-act="settings" aria-label="Settings" aria-haspopup="dialog">${icon('sliders')}</button></header>
    <div class="mode seg big" role="group" aria-label="Mode">
      <button aria-pressed="${mode === 'cards'}" data-act="mode" data-m="cards">Flashcards<span class="n">${cards.length}</span></button>
      <button aria-pressed="${mode === 'mcq'}" data-act="mode" data-m="mcq">MCQs<span class="n">${mcqs.length}</span></button>
    </div>
    <div class="seg style" role="group" aria-label="Style">
      <button aria-pressed="${!S.cfg.readMode}" data-act="style" data-k="quiz">${icon('quiz')}Quiz me</button>
      <button aria-pressed="${S.cfg.readMode}" data-act="style" data-k="read">${icon('eye')}Just read</button>
    </div>
    <div class="search" role="search">${icon('search')}<label class="sr-only" for="q">Search ${mode === 'cards' ? 'cards' : 'questions'}</label><input id="q" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${esc(mode === 'cards' ? UI.text.searchCards : UI.text.searchMcq)}" value="${esc(query)}"><button class="clear" data-act="clearq" aria-label="Clear search"${query ? '' : ' hidden'}>${icon('x')}</button></div>
    <div id="hb"></div>
  </main><div id="ctaw"></div>`;
  const q = $('#q');
  q.addEventListener('input', () => {
    query = q.value;
    pendingOpen = null;
    $('.search .clear').hidden = !query;
    paintHomeBody();
    clearTimeout(srchT);
    srchT = setTimeout(() => { if (query.trim()) announce(`${lastResults.length} result${lastResults.length === 1 ? '' : 's'}`); }, 500);
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') q.blur(); });
  paintHomeBody();
}

function paintHomeBody() {
  const sel = S.sel, mode = sel.mode, doms = effDoms(sel);
  const scope = mode === 'cards' ? cards : mcqs;
  const keyOf = it => (mode === 'cards' ? it.k : it.s);
  const counts = {};
  for (const it of scope) if (domOk(it, doms) && showOk(it, mode, sel.show)) counts[keyOf(it)] = (counts[keyOf(it)] || 0) + 1;
  const inSel = it => inSets(it, sel) && showOk(it, mode, sel.show);
  const domCount = n => scope.filter(it => inSel(it) && inDom(it, n)).length;

  const known = cards.filter(isKnown).length;
  const answered = mcqs.filter(resOf);
  const correct = answered.filter(q => resOf(q).ok).length;
  const stars = scope.filter(isStar).length;
  const stats = mode === 'cards'
    ? [[known, 'known'], [cards.length - known, 'to learn'], [stars, 'starred']]
    : [[answered.length, 'answered'], [answered.length ? Math.round(100 * correct / answered.length) + '%' : '–', 'correct'], [answered.length - correct, 'missed']];

  if (query.trim()) {
    $('#hb').innerHTML = searchResults(query);
    const s = SS(), live = s && !s.done && s.pos < s.ids.length;
    // Opening a result would replace a live session: ask in the page (hosted viewers block confirm()).
    $('#ctaw').innerHTML = live && pendingOpen
      ? `<div class="cta"><div class="in col" role="group" aria-labelledby="cf-t"><p class="cfq" id="cf-t">Replace your session (${s.pos + 1} of ${s.ids.length} · ${esc(s.label)}) with these results?</p><div class="row2"><button class="btn" data-act="keep">Keep my session</button><button class="btn pri" data-act="replace" id="replace-yes">Replace it</button></div></div></div>`
      : live ? `<div class="cta"><div class="in"><button class="btn pri resume" data-act="resume">${icon('play')}<span class="two"><b>Resume</b><span>${s.pos + 1} of ${s.ids.length} · ${esc(s.label)}</span></span></button></div></div>` : '';
    return;
  }

  const groups = mode === 'cards' ? DECK_GROUPS : SET_GROUPS;
  const names = mode === 'cards' ? DECKS : SETS;
  const chosen = mode === 'cards' ? sel.decks : sel.sets;
  const allKeys = groups.flatMap(g => g[1]);
  const deckChips = groups.map(([g, keys, cap]) => `<h3 class="grp">${esc(g)}</h3><p class="cap">${esc(cap)}</p><div class="chips">${keys.map(k =>
    `<button class="chip" aria-pressed="${chosen.includes(k)}" data-act="deck" data-k="${k}">${icon('check', 'ck')}${esc(names[k])} <span class="n">${counts[k] || 0}</span></button>`).join('')}</div>`).join('');
  const domChips = `<div class="chips"><button class="chip" aria-pressed="${!doms.length}" data-act="dom" data-n="all">${icon('check', 'ck')}All domains</button>${DATA.domains.map(d =>
    `<button class="chip" style="--dc:var(--d${d.n})" aria-pressed="${doms.includes(d.n)}" data-act="dom" data-n="${d.n}" aria-label="Domain ${d.n}, ${esc(d.name)}: ${domCount(d.n)}">${icon('check', 'ck')}<span class="dot"></span>D${d.n} ${esc(d.nick)} <span class="n">${domCount(d.n)}</span></button>`).join('')}${mode === 'cards'
    ? `<button class="chip" aria-pressed="${doms.includes(0)}" data-act="dom" data-n="0" aria-label="General cards (traps, ladders, method, facts): ${domCount(0)}">${icon('check', 'ck')}General <span class="n">${domCount(0)}</span></button>` : ''}</div>
    <p class="cap">${mode === 'cards' ? 'A domain also brings in the traps, ladders, tips and facts tagged with it.' : 'Domains follow the official blueprint weights.'}</p>`;
  const shows = mode === 'cards' ? [['all', 'All'], ['learn', 'To learn'], ['star', 'Starred']] : [['all', 'All'], ['new', 'Unanswered'], ['missed', 'Missed'], ['star', 'Starred']];
  const seg = (act, cur, opts, label) => `<div class="seg" role="group" aria-label="${label}">${opts.map(([k, l]) => `<button aria-pressed="${String(cur) === String(k)}" data-act="${act}" data-k="${k}">${l}</button>`).join('')}</div>`;
  const bars = DATA.domains.map(d => {
    const inD = scope.filter(it => inDom(it, d.n));
    const v = mode === 'cards' ? inD.filter(isKnown).length : inD.filter(q => { const r = resOf(q); return r && r.ok; }).length;
    const pct = inD.length ? Math.round(100 * v / inD.length) : 0;
    return `<div class="barrow" style="--dc:var(--d${d.n})"><span class="lbl"><span class="dot"></span>D${d.n} <span class="nk">${esc(d.nick)}</span></span><span class="trk" role="img" aria-label="Domain ${d.n}, ${esc(d.nick)}: ${v} of ${inD.length}"><span style="width:${pct}%"></span></span><span class="v">${v}/${inD.length}</span></div>`;
  }).join('');

  $('#hb').innerHTML = `
    <div class="stats">${stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <section class="sec" aria-labelledby="h-decks"><div class="sech"><h2 id="h-decks">${mode === 'cards' ? 'Decks' : 'Question sets'}</h2><button class="act" data-act="allsets">${chosen.length === allKeys.length ? 'Clear' : 'Select all'}</button></div>${deckChips}</section>
    <section class="sec" aria-labelledby="h-doms"><div class="sech"><h2 id="h-doms">Domains</h2></div>${domChips}</section>
    <section class="sec" aria-labelledby="h-show"><div class="sech"><h2 id="h-show">Show</h2></div>${seg('show', sel.show, shows, 'Show').replace('class="seg"', `class="seg${shows.length > 3 ? ' four' : ''}"`)}</section>
    <section class="sec two">
      <div><div class="sech"><h2>Order</h2></div>${seg('order', sel.order, [['seq', 'In order'], ['shuf', 'Shuffled']], 'Order')}</div>
      <div><div class="sech"><h2>Session size</h2></div>${seg('size', sel.size[mode], SIZES[mode], 'Session size')}</div>
    </section>
    <section class="sec" aria-labelledby="h-bars"><div class="sech"><h2 id="h-bars">${mode === 'cards' ? 'Known by domain' : 'Correct by domain'}</h2><span class="faint small">all ${mode === 'cards' ? 'cards' : 'questions'}</span></div><div class="bars">${bars}</div></section>
    <p class="foot-note">${mode === 'cards'
      ? esc(UI.text.noteCards)
      : esc(UI.text.noteMcq)}
      Tap a card to reveal it, swipe to move. Progress stays in this browser.</p>`;
  paintCta();
}

function paintCta() {
  const sel = S.sel, mode = sel.mode, s = SS();
  const total = pool().length, size = sel.size[mode] || 0, n = size ? Math.min(size, total) : total;
  const noun = mode === 'cards' ? (n === 1 ? 'card' : 'cards') : (n === 1 ? 'question' : 'questions');
  const live = s && !s.done && s.pos < s.ids.length;
  const startLbl = n ? `${live ? 'New' : 'Start'} · ${n}${n < total ? ` of ${total}` : ''} ${noun}` : 'Nothing matches these filters';
  $('#ctaw').innerHTML = `<div class="cta"><div class="in">${live
    ? `<button class="btn pri resume" data-act="resume">${icon('play')}<span class="two"><b>Resume</b><span>${s.pos + 1} of ${s.ids.length} · ${esc(s.label)}</span></span></button><button class="btn new" data-act="start" ${n ? '' : 'disabled'}>${esc(startLbl)}</button>`
    : `<button class="btn pri" data-act="start" ${n ? '' : 'disabled'}>${esc(startLbl)}</button>`}</div></div>`;
}

function itemText(entry) {
  const it = entry.it;
  if (!it._s) {
    const tn = t => t + ' ' + trapName(t);
    it._s = plain(entry.kind === 'card'
      ? [it.id, it.f, it.q, it.b, ...(it.x || []).flat(), ...(it.t || []).map(tn)].join(' ')
      : [it.id, it.st, it.ak, it.ex, ...it.op.map(o => `${o.t} ${o.w || ''} ${o.tr ? tn(o.tr) : ''}`), ...(it.sp || []).flat()].join(' ')).toLowerCase();
  }
  return it._s;
}
// One pass over the plain text: every piece is escaped, so tokens can never match inside markup.
function hl(s, toks) {
  const t = plain(s);
  if (!toks.length) return esc(t);
  const re = new RegExp(toks.slice().sort((a, b) => b.length - a.length).map(reEsc).join('|'), 'ig');
  let out = '', last = 0, m;
  while ((m = re.exec(t))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(t.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
    last = m.index + m[0].length;
  }
  return out + esc(t.slice(last));
}
let lastResults = [];
function searchResults(qs) {
  const toks = qs.toLowerCase().split(/\s+/).filter(Boolean);
  const mode = S.sel.mode;
  const scope = mode === 'cards' ? cards : mcqs;
  const rank = it => {
    const id = it.id.toLowerCase(), head = plain(mode === 'cards' ? it.f : it.st).toLowerCase();
    return toks.reduce((n, k) => n + (id === k ? 100 : id.includes(k) ? 20 : 0) + (head.includes(k) ? 10 : 0), 0);
  };
  lastResults = scope.filter(it => { const t = itemText(byId.get(it.id)); return toks.every(k => t.includes(k)); })
    .map((it, i) => [it, rank(it), i]).sort((x, y) => y[1] - x[1] || x[2] - y[2]).map(x => x[0]);
  const rows = lastResults.slice(0, 80).map((it, i) => {
    const lab = mode === 'cards' ? DECKS[it.k] : setLabel(it);
    const txt = mode === 'cards' ? it.f + (it.b ? ' · ' + it.b : '') : it.st;
    return `<button class="res" data-act="open" data-i="${i}" style="--dc:var(--d${it.d || 7})"><span class="k">${it.d ? '<span class="dot"></span>D' + it.d + ' · ' : ''}${esc(lab)}</span><span class="t">${hl(txt.slice(0, 260), toks)}</span></button>`;
  }).join('');
  return `<section class="sec" aria-labelledby="h-res"><div class="sech"><h2 id="h-res">${lastResults.length} result${lastResults.length === 1 ? '' : 's'}</h2>${lastResults.length ? '<button class="act" data-act="openall">Study all</button>' : ''}</div>
    <div class="results">${rows || `<p class="muted">${esc(UI.text.noMatch)}</p>`}</div>${lastResults.length > 80 ? `<p class="foot-note">Showing 80 of ${lastResults.length}. Tap “Study all” to go through every match.</p>` : ''}</section>`;
}

// ---------- study ----------
const setLabel = q => (q.s === 'A' || q.s === 'B' || q.s === 'C') ? `Form ${q.s} · Q${q.p}` : q.s === 'guide' ? `Guide · ${q.g}` : (UI.setShort || {})[q.s] || SETS[q.s].replace(/s$/, '');
const domTag = (d, o) => (d ? `<span class="tag" style="--dc:var(--d${d})"><span class="dot"></span>D${d}${o ? ' · ' + esc(o) : ''}</span>` : '');
const trapTag = code => `<span class="tag trap">${esc(code)} · ${esc(trapName(code))}</span>`;
const WARN_G = /not official|conflict|may change|derived/i;
const keyLetters = q => q.op.map((o, i) => (o.c ? LET(i) : null)).filter(Boolean);
// Highlight the signal phrases that decide an item, once each, longest first, never inside a tag.
function markSignals(html, sigs) {
  for (const s of [...(sigs || [])].sort((a, b) => b.length - a.length)) {
    const e = reEsc(esc(s));
    if (e) html = html.replace(new RegExp('(' + e + ')(?![^<]*>)', 'i'), '<mark class="sig"><span class="sr-only">signal: </span>$1</mark>');
  }
  return html;
}

function cardHTML(c, revealed) {
  const meta = [`<span class="tag acc">${esc(DECKS[c.k])}</span>`, domTag(c.d, c.o)];
  if (c.g && c.k !== 'concept') meta.push(`<span class="tag ${WARN_G.test(c.g) ? 'warn' : ''}">${esc(/^[A-Z-]+$/.test(c.g) ? c.g.charAt(0) + c.g.slice(1).toLowerCase() : c.g)}</span>`);
  if (isKnown(c)) meta.push('<span class="tag good">Known</span>');
  let h = `<div class="meta">${meta.join('')}</div><h2 class="front" tabindex="-1" id="focus">${md(c.f)}</h2>`;
  if (c.q) h += `<p class="prompt">${md(c.q)}</p>`;
  if (!revealed) return h + `<p class="hint" aria-hidden="true">${icon('eye')}Tap to reveal · swipe for the next card</p>`;
  h += `<div class="back" id="back" tabindex="-1">`;
  if (c.b) h += `<p class="answer">${md(c.b)}</p>`;
  if (c.x) h += `<div class="xs">${c.x.map(([l, t]) => `<div class="x ${l === 'Not' ? 'not' : l === 'Unless' ? 'unless' : ''}"><h3>${md(l)}</h3><p>${md(t)}</p></div>`).join('')}</div>`;
  if (c.t && c.t.length && c.k !== 'trap') h += `<div class="trapline">${c.t.map(trapTag).join('')}</div>`;
  return h + '</div>';
}

function mcqHTML(q, st) {
  const done = st.checked, picks = st.picks;
  const meta = [`<span class="tag acc">${esc(setLabel(q))}</span>`, domTag(q.d, q.o)];
  if (q.df) meta.push(`<span class="tag">${['', 'Easier', 'Medium', 'Harder'][q.df]}</span>`);
  const prev = resOf(q);
  if (prev && !done) meta.push(prev.ok ? '<span class="tag good">Correct last time</span>' : '<span class="tag warn">Missed last time</span>');
  const sig = done && q.sg;
  let h = `<h2 class="sr-only">Question</h2><div class="meta">${meta.join('')}</div><p class="stem" tabindex="-1" id="focus">${sig ? markSignals(md(q.st), q.sg) : md(q.st)}</p>`;
  if (q.ak) h += `<p class="ask" id="q-ask">${sig ? markSignals(md(q.ak), q.sg) : md(q.ak)}</p>`;
  if (q.n > 1) h += `<span class="selectn" id="q-n">Select ${NUMW[q.n] || q.n}</span>`;
  if (sig) h += `<p class="sigcap"><mark class="sig">Highlighted</mark> phrases are the signals that decide this item.</p>`;
  if (done) h += `<button class="jump" data-act="tofb">Explanation${icon('down')}</button>`;
  const lab = [q.ak ? 'q-ask' : '', q.n > 1 ? 'q-n' : ''].filter(Boolean).join(' ');
  h += `<div class="opts" role="group" ${lab ? `aria-labelledby="${lab}"` : 'aria-label="Options"'}>`;
  q.op.forEach((o, i) => {
    const picked = picks.includes(i);
    let cls = 'opt', verdict = '';
    if (done) {
      cls += ' done';
      if (o.c && picked) { cls += ' ok'; verdict = `${icon('check')}Your answer · correct`; }
      else if (o.c) { cls += picks.length ? ' miss' : ' ok'; verdict = picks.length ? `${icon('check')}Correct answer · you missed it` : `${icon('check')}Correct answer`; }
      else if (picked) { cls += ' no'; verdict = `${icon('x')}Your answer · wrong`; }
      else cls += ' dim';
      if (!o.c && o.tr) verdict += trapTag(o.tr);
    } else if (picked) cls += ' sel';
    const desc = done ? [verdict ? `o${i}v` : '', o.w ? `o${i}w` : ''].filter(Boolean).join(' ') : '';
    h += `<button class="${cls}" data-act="pick" data-i="${i}" aria-pressed="${picked}" aria-labelledby="o${i}l o${i}t"${desc ? ` aria-describedby="${desc}"` : ''}${done ? ' aria-disabled="true"' : ''}><span class="L" id="o${i}l">${LET(i)}</span><span class="tx"><span id="o${i}t">${md(o.t)}</span>${done && verdict ? `<span class="verdict" id="o${i}v">${verdict}</span>` : ''}${done && o.w ? `<span class="why" id="o${i}w">${md(o.w)}</span>` : ''}</span></button>`;
  });
  h += '</div>';
  if (!done) return h + `<button class="skipbtn" data-act="skip">${icon('eye')}Skip · show the answer</button>`;
  const key = keyLetters(q), mine = picks.map(LET).sort();
  const wrong = picks.map(i => q.op[i]).filter(o => !o.c);
  const trapCode = (wrong.find(o => o.tr) || {}).tr;
  const trap = trapCode ? DATA.traps[trapCode] : null;
  let vd;
  if (!picks.length) vd = `<p class="vd info">${icon('info')}Answer: ${join(key)}</p>`;
  else if (st.ok) vd = `<p class="vd ok">${icon('check')}Correct</p><p class="sub">Answer: ${join(key)}</p>`;
  else vd = `<p class="vd no">${icon('x')}Not quite</p><p class="sub">Correct: ${join(key)} · you picked ${join(mine)}${trap ? `. You chose a ${esc(trapCode)} option: ${esc(trap.n)}.` : ''}</p>`;
  h += `<div class="fb" id="fb" tabindex="-1">${vd}`;
  if (q.ex) h += `<div class="blk"><h3>Explanation</h3><p>${md(q.ex)}</p></div>`;
  if (q.sp) for (const [l, t] of q.sp) h += `<div class="blk"><h3>${esc(l)}</h3><p>${md(t)}</p></div>`;
  const row = q.ru && DATA.rows[q.ru];
  if (row) h += `<div class="blk"><h3>Cheat-sheet rule · ${esc(q.ru)}</h3><p class="sans">${md(row.r)}</p>${row.u ? `<p class="sans unl"><b>Unless:</b> ${md(row.u)}</p>` : ''}</div>`;
  if (q.ct) h += `<div class="blk"><h3>Counter-trap</h3><p class="sans">Here the option that looks like a trap is the right one. Rules have conditions: check when the trap is actually right.</p></div>`;
  if (trap) h += `<div class="blk trapcard"><h3>Trap card · ${esc(trapCode)} ${esc(trap.n)}</h3><p class="sans"><b>Counter:</b> ${md(trap.k)}</p>${trap.w ? `<p class="sans"><b>When it is actually right:</b> ${md(trap.w)}</p>` : ''}</div>`;
  return h + '</div>';
}

function curState() {
  const s = SS();
  if (!s || s.pos >= s.ids.length) return null;
  const id = s.ids[s.pos], e = byId.get(id);
  if (e.kind === 'card') return { e, revealed: S.cfg.readMode || !!s.rev[occKey(s, s.pos)] };
  const a = s.ans[id];
  const st = a ? { picks: a.p, checked: !!a.c, ok: !!a.ok } : { picks: [], checked: false, ok: false };
  if (S.cfg.readMode && !st.checked) { st.checked = true; st.picks = []; }
  return { e, st };
}

let lastPos = '';
function renderStudy() {
  const s = SS();
  if (s.pos >= s.ids.length) return renderDone();
  $('#app').innerHTML = `<div class="study">
    <header class="bar"><div class="in">
      <button class="iconbtn" data-act="home" aria-label="Back to decks">${icon('close')}</button>
      <div class="ttl"><b>${esc(s.label)}</b><span id="pos" aria-live="polite"></span></div>
      <button class="iconbtn" data-act="readtoggle" id="readbtn" aria-label="Reading mode: show answers straight away" aria-pressed="${S.cfg.readMode}">${icon('eye')}</button>
      <button class="iconbtn star" data-act="star" id="starbtn" aria-label="Star this" aria-pressed="false">${icon('star')}</button>
    </div><div class="prog" aria-hidden="true"><span id="progbar"></span></div></header>
    <main id="main" class="stage" tabindex="-1"><article class="card" id="card"></article></main>
    <nav class="dock" aria-label="Card actions"><div class="in" id="dock"></div></nav>
  </div>`;
  lastPos = '';
  scrollTo(0, 0);
  paintCard();
  bindSwipe($('#card'));
}

let optsObs = null, optsVisible = true;
function paintCard() {
  const s = SS(), cur = curState();
  if (!cur) return;
  const id = s.ids[s.pos], it = cur.e.it;
  (s.seen || (s.seen = {}))[id] = 1;
  const el = $('#card');
  el.innerHTML = cur.e.kind === 'card' ? cardHTML(it, cur.revealed) : mcqHTML(it, cur.st);
  el.classList.toggle('is-mcq', cur.e.kind === 'mcq');
  const pos = `${s.pos + 1} of ${s.ids.length}`;
  if (pos !== lastPos) { $('#pos').textContent = pos; lastPos = pos; }
  $('#progbar').style.width = `${(100 * (s.pos + 1)) / s.ids.length}%`;
  const sb = $('#starbtn');
  sb.setAttribute('aria-pressed', String(isStar(it)));
  sb.innerHTML = icon('star', isStar(it) ? 'fill' : '');
  $('#readbtn').setAttribute('aria-pressed', String(!!S.cfg.readMode));
  if (optsObs) { optsObs.disconnect(); optsObs = null; }
  const opts = cur.e.kind === 'mcq' && !cur.st.checked ? $('.opts') : null;
  optsVisible = true;
  if (opts) {
    optsVisible = opts.getBoundingClientRect().top < innerHeight - 96;
    if ('IntersectionObserver' in window) {
      optsObs = new IntersectionObserver(es => {
        if (anim) return;
        const v = es.some(x => x.isIntersecting) || opts.getBoundingClientRect().top < innerHeight - 96;
        if (v === optsVisible) return;
        optsVisible = v;
        const c2 = curState();
        if (c2 && c2.e.kind === 'mcq' && !c2.st.checked && !c2.st.picks.length) keepFocus(() => paintDock(c2), '#dock [data-act="check"], #dock [data-act="toopts"]');
      }, { rootMargin: '0px 0px -96px 0px' });
      optsObs.observe(opts);
    }
  }
  paintDock(cur);
  void id;
}

let guardUntil = 0;
const guarded = () => performance.now() < guardUntil;
const arm = () => { guardUntil = performance.now() + 350; };
function recheckOpts() {
  const o = $('.opts'), c = curState();
  if (!o || !c || c.e.kind !== 'mcq' || c.st.checked || c.st.picks.length) return;
  const v = o.getBoundingClientRect().top < innerHeight - 96;
  if (v !== optsVisible) { optsVisible = v; keepFocus(() => paintDock(c), '#dock [data-act="toopts"], #dock .btn'); }
}
function paintDock(cur) {
  const s = SS(), first = s.pos === 0, last = s.pos === s.ids.length - 1;
  const kb = (k, label) => (S.cfg.keys ? `<kbd aria-hidden="true">${label}</kbd>` : '');
  const ks = k => (S.cfg.keys ? ` aria-keyshortcuts="${k}"` : '');
  const prev = `<button class="btn icon" data-act="prev" aria-label="Previous"${ks('ArrowLeft')} ${first ? 'disabled' : ''}>${icon('left')}</button>`;
  const next = `<button class="btn icon" data-act="next" aria-label="${last ? 'Finish' : 'Next'}"${ks('ArrowRight')}>${icon('right')}</button>`;
  let mid;
  if (cur.e.kind === 'card') {
    mid = cur.revealed
      ? `<button class="btn again" data-act="again"${ks('1')}>Again${kb('1', '1')}</button><button class="btn good" data-act="got"${ks('2')}>Got it${kb('2', '2')}</button>`
      : `<button class="btn pri" data-act="reveal"${ks('Space')}>Show answer${kb('Space', 'Space')}</button>`;
  } else {
    const q = cur.e.it, st = cur.st;
    if (st.checked) {
      const key = join(keyLetters(q));
      const [cls, ic, lbl] = !st.picks.length ? ['pri', 'info', `Answer ${key}`] : st.ok ? ['good', 'check', 'Correct'] : ['bad', 'x', `Not quite · ${key}`];
      mid = `<button class="btn vbtn ${cls}" data-act="next" aria-label="${esc(lbl)}. ${last ? 'Finish' : 'Next question'}"${ks('Enter')}>${icon(ic)}<span class="vl">${lbl}</span><span class="nx" aria-hidden="true">${last ? 'Finish' : 'Next'} ›</span></button>`;
    } else if (!st.picks.length) {
      // Skipping to the answer lives under the options, never in the thumb slot.
      mid = optsVisible
        ? `<button class="btn pri" disabled>Pick ${q.n > 1 ? NUMW[q.n].toLowerCase() + ' answers' : 'an answer'}</button>`
        : `<button class="btn pri" data-act="toopts">Answer options${icon('down')}</button>`;
    } else if (st.picks.length < q.n) mid = `<button class="btn pri" disabled>Select ${q.n - st.picks.length} more</button>`;
    else mid = `<button class="btn pri" data-act="check"${ks('Enter')}>Check answer${kb('Enter', 'Enter')}</button>`;
  }
  $('#dock').innerHTML = prev + `<div class="mid">${mid}</div>` + next;
}

function renderDone() {
  const s = SS(), fresh = !s.done;
  s.done = true;
  const isCards = s.mode === 'cards';
  const shown = [...new Set(s.ids)].filter(id => s.seen[id]);
  const scored = isCards ? [] : shown.filter(id => s.ans[id] && s.ans[id].c && s.ans[id].p.length);
  const ok = scored.filter(id => s.ans[id].ok).length;
  s.missed = isCards ? [...new Set(s.again)] : scored.filter(id => !s.ans[id].ok);
  save();
  if (fresh) emit('session_end', { mode: s.mode, label: s.label, seen: shown.length, got: isCards ? [...new Set(s.got)].length : undefined, again: isCards ? [...new Set(s.again)].length : undefined, scored: isCards ? undefined : scored.length, ok: isCards ? undefined : ok });
  const uniq = shown.length;
  const big = isCards ? `${uniq}` : scored.length ? `${Math.round(100 * ok / scored.length)}%` : '–';
  const sub = isCards
    ? `${uniq === 1 ? 'card' : 'cards'} · ${new Set(s.got).size} got it · ${s.missed.length} to go again`
    : scored.length ? `${ok} of ${scored.length} answered correctly${uniq > scored.length ? ` · ${uniq - scored.length} not answered` : ''}` : 'No answers checked this time';
  $('#app').innerHTML = `<main id="main" class="fin" tabindex="-1"><h1 class="sr-only">Session complete</h1>
    <div class="ring">${icon('check')}</div><p class="big num">${big}</p><p class="sum">${sub}</p><p class="faint small">${esc(s.label)}</p></main>
    <div class="cta"><div class="in col">
      ${s.missed.length ? `<button class="btn pri" data-act="redo">${icon('redo')}${isCards ? `Go again on ${s.missed.length}` : `Retry the ${s.missed.length} missed`}</button>` : ''}
      <div class="row2"><button class="btn" data-act="restart">${icon('shuffle')}Shuffle and restart</button><button class="btn" data-act="home">Back to decks</button></div>
    </div></div>`;
  announce(`Session complete. ${big} ${sub}`);
  const m = $('#main'); if (m) m.focus({ preventScroll: true });
}

// ---------- navigation with a velocity-aware spring ----------
function spring({ from, to, v = 0, damping = 1, response = 0.34, onUpdate, onDone }) {
  const w = (2 * Math.PI) / response, k = w * w, c = 2 * damping * w;
  let x = from, vel = v, last = performance.now(), raf = 0, live = true;
  const step = now => {
    if (!live) return;
    const dt = Math.min(0.034, (now - last) / 1000); last = now;
    for (let i = 0; i < 4; i++) { const h = dt / 4; vel += (-k * (x - to) - c * vel) * h; x += vel * h; }
    if (Math.abs(vel) < 8 && Math.abs(x - to) < 0.6) { x = to; live = false; onUpdate(x); if (onDone) onDone(); return; }
    onUpdate(x);
    if (live) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { stop() { live = false; cancelAnimationFrame(raf); }, get live() { return live; } };
}
let anim = null, offset = 0, pendingCommit = null, kbdNav = false;
function setX(el, x) {
  offset = x;
  if (!el) return;
  const W = el.offsetWidth || 360;
  el.style.transform = x ? `translate3d(${x}px,0,0) rotate(${(x / W) * 3}deg)` : '';
  el.style.opacity = x ? String(1 - Math.min(0.45, Math.abs(x) / W * 0.6)) : '';
}
function haltNav() { if (anim) anim.stop(); anim = null; pendingCommit = null; offset = 0; }
// Finish an in-flight card change now, so the next action applies to the card the user is about to see.
function settle() {
  if (!pendingCommit) return false;
  const pc = pendingCommit;
  pendingCommit = null;
  if (anim) anim.stop();
  anim = null;
  pc();
  const el = $('#card'); if (el) setX(el, 0);
  return true;
}
// dir: +1 next, -1 previous.
function navigate(dir, v = 0) {
  settle();
  const s = SS(), el = $('#card');
  if (view !== 'study' || !s || !el) return;
  const ae = document.activeElement;
  const moveFocus = kbdNav || focusVisibleNow() || !!(ae && ae.closest && ae.closest('.dock'));
  kbdNav = false;
  const target = s.pos + dir;
  if (target < 0) { bounce(el, 1); return; }
  if (anim) { anim.stop(); anim = null; }
  const commit = () => {
    pendingCommit = null;
    if (view !== 'study' || SS() !== s || !$('#card')) return false;
    s.pos = target; save();
    if (s.pos >= s.ids.length) { haltNav(); renderDone(); return false; }
    scrollTo(0, 0);
    setX($('#card'), 0);
    paintCard();
    if (moveFocus) { const f = $('#focus'); if (f) f.focus({ preventScroll: true }); }
    return true;
  };
  if (reduced()) {
    setX(el, 0);
    if (commit() && el.animate) el.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 90 });
    return;
  }
  const W = el.offsetWidth || 360;
  pendingCommit = commit;
  const finishOut = () => {
    if (pendingCommit !== commit) return;
    if (anim) anim.stop();
    anim = null;
    if (!commit()) return;
    const e2 = $('#card');
    setX(e2, dir * W * 0.5);
    anim = spring({ from: offset, to: 0, v: v ? v * 0.4 : -dir * 500, response: 0.34, onUpdate: x => setX(e2, x), onDone: () => { anim = null; setX(e2, 0); recheckOpts(); } });
  };
  // Commit as soon as the card is off-screen, not when the spring settles, so the next card is never late.
  anim = spring({ from: offset, to: -dir * W * 1.1, v: v || -dir * 1500, response: 0.26, onUpdate: x => { setX(el, x); if (Math.abs(x) >= W) finishOut(); }, onDone: finishOut });
}
function bounce(el, dir) {
  if (reduced()) return;
  if (anim) anim.stop();
  anim = spring({ from: offset, to: 0, v: dir * 700, damping: 0.55, response: 0.4, onUpdate: x => setX(el, x), onDone: () => { anim = null; } });
}

const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
const zoomed = () => !!(window.visualViewport && visualViewport.scale > 1.05);
if (window.visualViewport) visualViewport.addEventListener('resize', () => { const c = $('#card'); if (c) c.classList.toggle('zoomed', zoomed()); });
let suppressClick = false;
function bindSwipe(el) {
  let id = null, sx = 0, sy = 0, base = 0, phase = 'idle', hist = [];
  el.classList.toggle('zoomed', zoomed());
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (zoomed()) { phase = 'none'; return; }           // pinch-zoomed: let the browser pan
    id = e.pointerId; sx = e.clientX; sy = e.clientY; hist = [{ x: e.clientX, t: e.timeStamp }];
    phase = 'pending';                                   // a running animation keeps going until the finger really moves
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== id || phase === 'idle' || phase === 'none') return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (phase === 'pending') {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (anim) { anim.stop(); anim = null; }
        if (pendingCommit) { pendingCommit = null; keepFocus(paintCard); }   // grabbed mid-flight: the card stays under the finger
        base = offset; phase = 'drag'; sx = e.clientX;
        try { el.setPointerCapture(id); } catch (err) { /* ignore */ }
        el.classList.add('dragging');
      } else if (Math.abs(dy) > 10) { phase = 'none'; return; }
      else return;
    }
    const s = SS(), W = el.offsetWidth;
    let x = base + (e.clientX - sx);
    if (s && s.pos === 0 && x > 0) x = rubber(x, W);
    setX(el, x);
    hist.push({ x: e.clientX, t: e.timeStamp });
    while (hist.length > 2 && e.timeStamp - hist[0].t > 100) hist.shift();
  });
  const end = e => {
    if (e.pointerId !== id) return;
    const wasDrag = phase === 'drag';
    phase = 'idle'; id = null;
    el.classList.remove('dragging');
    if (!wasDrag) return;                                // a tap: the click handler settles and reveals
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
    const a = hist[0], b = hist[hist.length - 1];
    const v = b && a && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
    const W = el.offsetWidth;
    const projected = offset + (v / 1000) * 0.99 / (1 - 0.99);
    const s = SS();
    if (e.type !== 'pointercancel' && projected < -W * 0.3 && v <= 150) { navigate(1, Math.min(v, -900)); return; }
    if (e.type !== 'pointercancel' && projected > W * 0.3 && v >= -150 && s && s.pos > 0) { navigate(-1, Math.max(v, 900)); return; }
    if (anim) anim.stop();
    if (reduced()) { anim = null; setX(el, 0); return; }
    anim = spring({ from: offset, to: 0, v, damping: 0.8, response: 0.34, onUpdate: x => setX(el, x), onDone: () => { anim = null; } });
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ---------- actions ----------
function reveal() {
  const s = SS(), cur = curState();
  if (!cur || cur.e.kind !== 'card' || cur.revealed) return;
  s.rev[occKey(s, s.pos)] = 1; save();
  const a = document.activeElement;
  keepFocus(paintCard, '#back');
  // Revealed from the card itself (tap, Space on the front): move reading focus to the answer.
  if (!a || a === document.body || !a.isConnected || a.closest('#card')) { const bk = $('#back'); if (bk) bk.focus({ preventScroll: true }); }
}
function rate(got) {
  const s = SS(), cur = curState();
  if (!cur || cur.e.kind !== 'card' || !cur.revealed) return;
  const id = s.ids[s.pos];
  S.known[id] = `${got ? 1 : 0}:${cur.e.it.h}`;
  emit('card_rate', { item: id, got: got ? 1 : 0, deck: cur.e.it.k, domain: cur.e.it.d || undefined });
  if (got) { s.got.push(id); s.again = s.again.filter(x => x !== id); s.ids = s.ids.filter((x, j) => j <= s.pos || x !== id); }
  else {
    s.again.push(id); s.got = s.got.filter(x => x !== id);
    // Bring it back a few cards later in this session, face down.
    if (!s.ids.slice(s.pos + 1).includes(id)) s.ids.splice(Math.min(s.pos + 6, s.ids.length), 0, id);
  }
  save();
  navigate(1);
}
function pick(i) {
  const s = SS(), cur = curState();
  if (!cur || cur.e.kind !== 'mcq' || cur.st.checked) return;
  const q = cur.e.it, id = s.ids[s.pos];
  let p = [...cur.st.picks];
  if (q.n === 1) p = p[0] === i ? [] : [i];
  else if (p.includes(i)) p = p.filter(x => x !== i);
  else if (p.length >= q.n) { toast(`Select exactly ${NUMW[q.n] || q.n}. Tap a chosen option to clear it.`); return; }
  else p.push(i);
  s.ans[id] = { p, c: 0 };
  save();
  keepFocus(paintCard, `.opt[data-i="${i}"]`);
}
function check() {
  const s = SS(), cur = curState();
  if (!cur || cur.e.kind !== 'mcq') return;
  if (cur.st.checked) { navigate(1); return; }
  const q = cur.e.it, id = s.ids[s.pos], p = cur.st.picks;
  if (p.length && p.length !== q.n) return;
  const key = q.op.map((o, i) => (o.c ? i : -1)).filter(i => i >= 0);
  const ok = p.length === key.length && [...p].sort().every((v, i) => v === key[i]);
  // Keep the option the user just touched where it was, so the result appears under the thumb.
  const sel = p.length ? `.opt[data-i="${p[0]}"]` : '.opt';
  const a1 = $(sel), before = a1 ? a1.getBoundingClientRect().top : null;
  s.ans[id] = { p, c: 1, ok };
  if (p.length) S.res[id] = { ok: ok ? 1 : 0, p, t: Date.now(), h: q.h };
  if (p.length) emit('answer', { item: id, ok: ok ? 1 : 0, domain: q.d, obj: q.o, set: q.s });
  save();
  keepFocus(paintCard, '#fb');
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.opt')) { const f = $('#fb'); if (f) f.focus({ preventScroll: true }); }
  const a2 = $(sel);
  if (before != null && a2) { const d = a2.getBoundingClientRect().top - before; if (Math.abs(d) > 1) scrollBy(0, d); }
  const kl = join(keyLetters(q));
  announce(!p.length ? `Answer: ${kl}.` : ok ? `Correct. Answer ${kl}.` : `Not quite. Correct: ${kl}. You picked ${join(p.map(LET).sort())}.`);
}
function toOptions(byKeyboard) {
  const t = $('.ask') || $('.opts');
  if (!t) return;
  t.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  if (byKeyboard) { const o = $('.opt'); if (o) o.focus({ preventScroll: true }); }
}
function toggleStar() {
  const s = SS(), cur = curState();
  if (!cur) return;
  const it = cur.e.it;
  if (isStar(it)) delete S.star[it.id]; else S.star[it.id] = it.h;
  save();
  keepFocus(paintCard);
  toast(isStar(it) ? 'Starred' : 'Star removed');
  void s;
}
let toastT = 0;
function toast(msg) { const t = $('#toast'); const host = (sheetOpen && $('#dlg')) || document.body; if (t.parentElement !== host) host.appendChild(t); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

document.addEventListener('click', e => {
  // The skip link must not change the hash (the router would treat it as a route).
  if (e.target.closest('.skip')) {
    e.preventDefault();
    const t = $('#focus') || $('#main');
    if (t) { if (!t.hasAttribute('tabindex')) t.tabIndex = -1; t.focus(); }
    return;
  }
  const inStudy = view === 'study' && e.target.closest('.study') && !e.target.closest('.bar, .dock');
  if (suppressClick && inStudy) { e.preventDefault(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) {
    // Tap anywhere on the study surface (not only the card) reveals an unrevealed card.
    if (inStudy && !e.target.closest('a, button, summary')) {
      if (String(getSelection ? getSelection() : '').length) return;
      if (settle() || guarded()) return;
      const cur = curState();
      if (cur && cur.e.kind === 'card' && !cur.revealed) { arm(); reveal(); }
    }
    return;
  }
  if (b.disabled) return;
  const act = b.dataset.act, sel = S.sel;
  const perCard = ['reveal', 'again', 'got', 'check', 'skip', 'toopts'].includes(act) || (act === 'next' && b.closest('.dock .mid'));
  if (perCard) { if (guarded()) return; arm(); }
  if (act === 'settings' && performance.now() - sheetClosedAt < 400) return;
  switch (act) {
    case 'mode': {
      if (b.dataset.m === sel.mode) break;
      sel.mode = b.dataset.m;
      const valid = sel.mode === 'cards' ? ['all', 'learn', 'star'] : ['all', 'new', 'missed', 'star'];
      if (!valid.includes(sel.show)) sel.show = 'all';
      query = ''; pendingOpen = null; save(); keepFocus(renderHome); scrollTo(0, 0); break;
    }
    case 'style': S.cfg.readMode = b.dataset.k === 'read'; save(); keepFocus(renderHome); break;
    case 'deck': {
      const arr = sel.mode === 'cards' ? sel.decks : sel.sets, k = b.dataset.k;
      const i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); else arr.push(k);
      save(); keepFocus(paintHomeBody); break;
    }
    case 'allsets': {
      const all = (sel.mode === 'cards' ? DECK_GROUPS : SET_GROUPS).flatMap(g => g[1]);
      const arr = sel.mode === 'cards' ? 'decks' : 'sets';
      sel[arr] = sel[arr].length === all.length ? [] : [...all];
      save(); keepFocus(paintHomeBody); break;
    }
    case 'dom': {
      const n = b.dataset.n;
      if (n === 'all') sel.doms = sel.mode === 'mcq' ? sel.doms.filter(x => x === 0) : [];
      else { const v = Number(n), i = sel.doms.indexOf(v); if (i >= 0) sel.doms.splice(i, 1); else sel.doms.push(v); }
      save(); keepFocus(paintHomeBody); break;
    }
    case 'show': sel.show = b.dataset.k; save(); keepFocus(paintHomeBody); break;
    case 'order': sel.order = b.dataset.k; save(); keepFocus(paintHomeBody); break;
    case 'size': sel.size[sel.mode] = Number(b.dataset.k); save(); keepFocus(paintHomeBody); break;
    case 'start': {
      const list = buildList(sel);
      if (list.length) startSession(list.map(x => x.id), sessionLabel(sel), sel.mode);
      break;
    }
    case 'resume': go('study'); break;
    case 'clearq': { query = ''; pendingOpen = null; const q = $('#q'); if (q) { q.value = ''; q.focus(); } b.hidden = true; paintHomeBody(); break; }
    case 'open': case 'openall': {
      const i = act === 'open' ? Number(b.dataset.i) : 0;
      const live = SS();
      if (live && !live.done && live.pos < live.ids.length) {
        pendingOpen = { i };
        paintHomeBody();
        const y = $('#replace-yes'); if (y) y.focus({ preventScroll: true });
        announce('Replace your current session with these results? Choose Keep my session or Replace it.');
        break;
      }
      startSession(lastResults.map(x => x.id), `Search: “${query.trim()}”`, S.sel.mode, i);
      break;
    }
    case 'replace': { const po = pendingOpen; pendingOpen = null; if (po) startSession(lastResults.map(x => x.id), `Search: “${query.trim()}”`, S.sel.mode, po.i); break; }
    case 'keep': { pendingOpen = null; paintHomeBody(); const q = $('#q'); if (q) q.focus({ preventScroll: true }); break; }
    case 'home': goHome(); break;
    case 'settings': openSettings(); break;
    case 'prev': kbdNav = focusVisibleNow(); navigate(-1); break;
    case 'next': if (b.closest('.dock .mid') && settle()) break; kbdNav = focusVisibleNow(); navigate(1); break;
    case 'reveal': if (settle()) break; reveal(); break;
    case 'again': if (settle()) break; kbdNav = focusVisibleNow(); rate(false); break;
    case 'got': if (settle()) break; kbdNav = focusVisibleNow(); rate(true); break;
    case 'pick': if (!suppressClick) { settle(); pick(Number(b.dataset.i)); } break;
    case 'check': settle(); check(); break;
    case 'skip': { settle(); const s = SS(), c = curState(); if (s && c && c.e.kind === 'mcq' && !c.st.checked) { s.ans[s.ids[s.pos]] = { p: [], c: 0 }; check(); } break; }
    case 'toopts': toOptions(e.detail === 0); break;
    case 'tofb': { const f = $('#fb'); if (f) { f.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); if (e.detail === 0) f.focus({ preventScroll: true }); } break; }
    case 'star': settle(); toggleStar(); break;
    case 'readtoggle': settle(); S.cfg.readMode = !S.cfg.readMode; save(); keepFocus(paintCard); toast(S.cfg.readMode ? 'Reading mode: answers shown' : 'Quiz mode'); break;
    case 'redo': {
      const s = SS();
      if (s && s.missed.length) startSession(shuffle(s.missed), 'Again: ' + s.label.replace(/^Again: /, ''), s.mode);
      break;
    }
    case 'restart': { const s = SS(); if (s) startSession(shuffle([...new Set(s.ids)]), s.label, s.mode); break; }
    case 'theme': S.cfg.theme = b.dataset.k; applyCfg(); save(); openSettings(true); break;
    case 'scale': S.cfg.scale = Number(b.dataset.k); applyCfg(); save(); openSettings(true); break;
    case 'readmode': S.cfg.readMode = !S.cfg.readMode; save(); openSettings(true); break;
    case 'keys': S.cfg.keys = !S.cfg.keys; save(); openSettings(true); break;
    case 'reset': {
      // Tap twice to confirm (hosted viewers block confirm()); the arm expires after 4 seconds.
      const what = b.dataset.k;
      const label = { cards: 'card progress', mcq: 'MCQ results', star: 'stars' }[what];
      clearTimeout(resetT);
      if (resetArmed !== what) {
        resetArmed = what;
        resetT = setTimeout(() => { resetArmed = null; if (sheetOpen) openSettings(true); }, 4000);
        openSettings(true);
        announce(`Tap again to reset ${label}. This cannot be undone.`);
        break;
      }
      resetArmed = null;
      if (what === 'cards') S.known = {}; else if (what === 'mcq') S.res = {}; else S.star = {};
      save(); toast(`Reset ${label}`); openSettings(true); break;
    }
    case 'closesheet': closeSheet(); break;
    default: break;
  }
});

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.matches && t.matches('input, textarea, select')) { if (e.key === 'Escape') t.blur(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (sheetOpen || view !== 'study') return;             // the dialog handles its own Escape
  const s = SS();
  if (e.key === 'Escape') { goHome(); return; }
  if (!s || s.pos >= s.ids.length) return;               // done screen: native keys only
  const k = e.key;
  // Enter on an option that is already picked, with the selection complete, checks (as the dock hint says).
  if (k === 'Enter' && t.closest && t.closest('.opt') && t.getAttribute('aria-pressed') === 'true') {
    const c = curState();
    if (c && c.e.kind === 'mcq' && !c.st.checked && c.st.picks.length === c.e.it.n) { e.preventDefault(); if (!guarded()) { arm(); check(); } return; }
  }
  // Enter and Space on a focused control do what that control says.
  if ((k === 'Enter' || k === ' ') && t.closest && t.closest('button, a, summary, [role="switch"]')) return;
  if (k === 'ArrowRight') { e.preventDefault(); kbdNav = true; navigate(1); return; }
  if (k === 'ArrowLeft') { e.preventDefault(); kbdNav = true; navigate(-1); return; }
  if (k === 'Enter' || k === ' ') {
    const settled = settle();
    const cur = curState();
    if (!cur) return;
    if (cur.e.kind === 'card') { e.preventDefault(); if (settled || guarded()) return; arm(); if (!cur.revealed) reveal(); else { kbdNav = true; navigate(1); } }
    else if (k === 'Enter') {                              // Space keeps scrolling long questions
      if (settled || guarded()) { e.preventDefault(); return; }
      if (cur.st.checked) { e.preventDefault(); arm(); kbdNav = true; navigate(1); }
      else if (cur.st.picks.length === cur.e.it.n) { e.preventDefault(); arm(); check(); }
    }
    return;
  }
  if (!S.cfg.keys) return;                               // single-character shortcuts can be switched off
  const settled = settle();
  const cur = curState();
  if (!cur) return;
  if (k === 's' || k === 'S') { toggleStar(); return; }
  if (cur.e.kind === 'card') {
    if (settled || guarded()) return;                     // never rate a card the user has not seen
    if (cur.revealed && k === '1') { arm(); kbdNav = true; rate(false); }
    else if (cur.revealed && k === '2') { arm(); kbdNav = true; rate(true); }
  } else {
    const q = cur.e.it;
    const idx = /^[1-6]$/.test(k) ? Number(k) - 1 : /^[a-f]$/i.test(k) ? k.toLowerCase().charCodeAt(0) - 97 : -1;
    if (idx >= 0 && idx < q.op.length) { e.preventDefault(); pick(idx); }
  }
});

// ---------- settings sheet: a modal <dialog>, drag down to dismiss, back button closes it ----------
let sheetOpen = false, sheetAnim = null, sheetOpener = null, sheetClosedAt = 0, resetArmed = null, resetT = 0;
function sheetBody() {
  const seg = (act, cur, opts, label) => `<div class="seg" role="group" aria-label="${label}">${opts.map(([k, l]) => `<button aria-pressed="${String(cur) === String(k)}" data-act="${act}" data-k="${k}">${l}</button>`).join('')}</div>`;
  const nC = cards.filter(c => kOf(c) != null).length, nM = mcqs.filter(resOf).length, nS = [...cards, ...mcqs].filter(isStar).length;
  return `<div class="sheethead"><h2 id="sheet-t">Settings</h2><button class="iconbtn" data-act="closesheet" aria-label="Close settings">${icon('close')}</button></div>
    <div class="row"><div class="l"><b>Theme</b></div>${seg('theme', S.cfg.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], 'Theme')}</div>
    <div class="row"><div class="l"><b>Text size</b></div>${seg('scale', S.cfg.scale, [['0.92', 'A−'], ['1', 'A'], ['1.1', 'A+'], ['1.22', 'A++']], 'Text size')}</div>
    <div class="row tap" data-act="readmode"><div class="l"><b id="rm-l">Reading mode</b><span>Show answers straight away. Good for skimming on the go.</span></div><button class="switch" role="switch" aria-checked="${S.cfg.readMode}" data-act="readmode" aria-labelledby="rm-l"></button></div>
    <div class="row tap" data-act="keys"><div class="l"><b id="ks-l">Keyboard shortcuts</b><span>Single keys: 1 again, 2 got it, A–F pick, S star.</span></div><button class="switch" role="switch" aria-checked="${S.cfg.keys}" data-act="keys" aria-labelledby="ks-l"></button></div>
    <div class="row"><div class="l"><b>Card progress</b><span>${nC} ${nC === 1 ? 'card' : 'cards'} rated</span></div><button class="btn danger${resetArmed === 'cards' ? ' armed' : ''}" data-act="reset" data-k="cards" ${nC ? '' : 'disabled'}>${resetArmed === 'cards' ? 'Tap again to reset' : 'Reset'}</button></div>
    <div class="row"><div class="l"><b>MCQ results</b><span>${nM} ${nM === 1 ? 'question' : 'questions'} answered</span></div><button class="btn danger${resetArmed === 'mcq' ? ' armed' : ''}" data-act="reset" data-k="mcq" ${nM ? '' : 'disabled'}>${resetArmed === 'mcq' ? 'Tap again to reset' : 'Reset'}</button></div>
    <div class="row"><div class="l"><b>Stars</b><span>${nS} starred</span></div><button class="btn danger${resetArmed === 'star' ? ' armed' : ''}" data-act="reset" data-k="star" ${nS ? '' : 'disabled'}>${resetArmed === 'star' ? 'Tap again to clear' : 'Clear'}</button></div>
    <p class="foot-note">Keys: ← → move · Space or Enter reveals, then moves on · Enter checks an answer · Esc goes back${S.cfg.keys ? ' · 1 again · 2 got it · A–F pick · S star' : ''}.<br>
    Built ${esc(DATA.meta.built)} from ${esc(UI.source)} (${esc(DATA.meta.exam)}). Everything runs offline; progress stays in this browser.</p>`;
}
function openSettings(refresh) {
  if (refresh && sheetOpen) { keepFocus(() => { $('#dlg .sb').innerHTML = sheetBody(); }, '#dlg [data-act="closesheet"].iconbtn'); return; }
  if (sheetOpen) return;
  if (sheetAnim) { sheetAnim.stop(); sheetAnim = null; }
  const a = document.activeElement;
  sheetOpener = a && a.dataset && a.dataset.act ? a.dataset.act : 'settings';
  const root = $('#sheet-root');
  root.innerHTML = `<dialog class="dlg" id="dlg" aria-labelledby="sheet-t"><div class="scrim" data-act="closesheet"></div><div class="sheet"><div class="grabzone" id="grab" aria-hidden="true"><div class="grab"></div></div><div class="sb">${sheetBody()}</div></div></dialog>`;
  const dlg = $('#dlg'), sh = $('.sheet'), sc = $('.scrim');
  dlg.addEventListener('cancel', ev => { ev.preventDefault(); closeSheet(); });
  try { dlg.showModal(); } catch (err) { dlg.setAttribute('open', ''); }
  sheetOpen = true;
  try { history.pushState(Object.assign({}, history.state, { sheet: 1 }), '', location.hash); } catch (err) { /* ignore */ }
  requestAnimationFrame(() => sc.classList.add('on'));
  if (reduced()) sh.style.transform = 'none';
  else sheetAnim = spring({ from: sh.offsetHeight, to: 0, response: 0.32, damping: 1, onUpdate: y => { sh.style.transform = `translateY(${y}px)`; }, onDone: () => { sheetAnim = null; } });
  bindGrab(sh);
  const f = $('#dlg [data-act="closesheet"].iconbtn'); if (f) f.focus({ preventScroll: true });
}
function bindGrab(sh) {
  const g = $('#grab');
  if (!g) return;
  let id = null, sy = 0, y0 = 0, hist = [];
  g.addEventListener('pointerdown', e => { id = e.pointerId; sy = e.clientY; if (sheetAnim) { sheetAnim.stop(); sheetAnim = null; } y0 = currentY(sh); hist = [{ y: e.clientY, t: e.timeStamp }]; g.setPointerCapture(id); });
  g.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    let y = y0 + (e.clientY - sy); if (y < 0) y = -rubber(-y, sh.offsetHeight, 0.3);
    sh.style.transform = `translateY(${y}px)`;
    hist.push({ y: e.clientY, t: e.timeStamp }); while (hist.length > 2 && e.timeStamp - hist[0].t > 100) hist.shift();
  });
  const up = e => {
    if (e.pointerId !== id) return; id = null;
    const a = hist[0], b = hist[hist.length - 1], v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
    const y = currentY(sh), proj = y + (v / 1000) * 0.99 / 0.01;
    if (proj > sh.offsetHeight * 0.4) closeSheet({ v });
    else if (reduced()) sh.style.transform = 'none';
    else sheetAnim = spring({ from: y, to: 0, v, damping: 0.8, response: 0.3, onUpdate: yy => { sh.style.transform = `translateY(${yy}px)`; }, onDone: () => { sheetAnim = null; } });
  };
  g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
}
const currentY = el => { const m = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform); return m ? Number(m[1]) : 0; };
function closeSheet(o = {}) {
  if (!sheetOpen) return;
  sheetOpen = false;
  sheetClosedAt = performance.now();
  if (!o.fromPop && history.state && history.state.sheet) { skipPop = true; try { history.back(); } catch (e) { skipPop = false; } }
  const root = $('#sheet-root'), dlg = $('#dlg'), sh = dlg && $('.sheet', dlg), sc = dlg && $('.scrim', dlg);
  if (sheetAnim) { sheetAnim.stop(); sheetAnim = null; }
  // Drop modality now so the page is live again (and focus can return) while the sheet slides away.
  if (dlg) { try { dlg.close(); if (!o.instant && !reduced()) dlg.show(); } catch (e) { /* ignore */ } dlg.classList.add('closing'); }
  if (view === 'home') renderHomeKeepScroll();
  const opener = document.querySelector(`[data-act="${sheetOpener}"]`);
  if (opener && !o.instant) opener.focus({ preventScroll: true });
  const t = $('#toast'); if (t && dlg && dlg.contains(t)) document.body.appendChild(t);
  const remove = () => { if (!sheetOpen && dlg && root.contains(dlg)) root.innerHTML = ''; };
  if (o.instant || reduced() || !sh) { remove(); return; }
  if (sc) sc.classList.remove('on');
  sheetAnim = spring({ from: currentY(sh), to: sh.offsetHeight + 20, v: o.v || 800, response: 0.28, onUpdate: y => { sh.style.transform = `translateY(${y}px)`; }, onDone: () => { sheetAnim = null; remove(); } });
}
function renderHomeKeepScroll() { if (view !== 'home') return; const y = scrollY; renderHome(); scrollTo(0, y); }

// ---------- boot ----------
{
  const s = SS();
  view = location.hash === '#study' && s && !s.done && s.pos < s.ids.length ? 'study' : 'home';
  try {
    // Reloaded mid-session: keep a home entry underneath, so X and Back behave as before the reload.
    if (view === 'study') { if (!(history.state && history.state.v === 'study')) { history.replaceState(null, '', '#home'); history.pushState({ v: 'study' }, '', '#study'); } }
    else history.replaceState(null, '', '#home');
  } catch (e) { /* ignore */ }
  render();
}
})();
