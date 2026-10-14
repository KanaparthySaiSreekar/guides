/* settings: preferences, accommodations, export/import (merge or replace), reset. Plus About and More. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc, inl = U.inl;
  const V = CP.views.settings = {};
  V.title = () => 'Settings';

  const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-act="setopt" data-k="${key}" data-v="${esc(String(v))}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  const tog = (key, label, help) => { const s = CP.store.S.settings; return `<div class="field"><label class="toggle"><input type="checkbox" data-act="settog" data-k="${key}" ${s[key] ? 'checked' : ''}>${esc(label)}</label>${help ? `<span class="help">${esc(help)}</span>` : ''}</div>`; };

  V.render = () => {
    const S = CP.store.S, s = S.settings;
    const kb = Math.round(CP.store.size() / 1024);
    return `<div class="pagehead"><h1>Settings</h1><p>Everything is stored in this browser only. Export regularly: browsers can clear site data, and a file opened from a different folder may not see the same storage.</p></div>
      <section class="card stack"><h2 style="font-size:var(--fs-h3)">Reading</h2>
        <div class="field"><span class="lbl-strong">Theme</span>${seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme)}</div>
        <div class="field"><span class="lbl-strong">Guide text</span>${seg('serif', [[true, 'Serif'], [false, 'Sans']], s.serif)}</div>
        <div class="field"><label for="ts">Text size: ${s.textScale}%</label><input id="ts" type="range" min="90" max="130" step="5" value="${s.textScale}" data-act="setscale"></div>
      </section>
      <section class="card stack" style="margin-top:14px"><h2 style="font-size:var(--fs-h3)">Practice</h2>
        ${tog('strict', 'Strict mode for sealed forms (no pause)', 'Matches the real exam. Standard mode allows pausing and records it.')}
        ${tog('showTimer', 'Show the timer', 'Hiding it does not stop it.')}
        <div class="field"><span class="lbl-strong">Time allowance</span>${seg('timeMult', [[1, 'Standard'], [1.25, '1.25×'], [1.5, '1.5×']], s.timeMult)}<span class="help">For approved accommodations. Applies to new timed sessions.</span></div>
        ${tog('confidence', 'Ask for confidence before checking (tutor mode)', 'Feeds the calibration view; a correct guess counts half.')}
        ${tog('shuffle', 'Shuffle answer options', 'Prevents learning positions instead of reasons.')}
        ${tog('strike', 'Strike-out aid on options', 'May not exist on the real exam.')}
        ${tog('showScaled', 'Show an illustrative scaled band on mock reports', 'A piecewise-linear band, not Anthropic’s curve. Off by default.')}
      </section>
      <section class="card stack" style="margin-top:14px"><h2 style="font-size:var(--fs-h3)">Your data</h2>
        <p class="small">Storage: ${CP.store.ok ? `available · ${kb} KB used` : '<b>unavailable here</b>: progress lives in memory until you close the tab'} · ${Object.keys(S.items).length} answered items · ${S.sessions.length} sessions${s.lastExport ? ` · last export ${esc(U.fmtDate(s.lastExport))}` : ''}</p>
        <div class="btnrow"><button class="btn primary" data-act="export">Export progress</button><button class="btn" data-act="copyexport">Copy as text</button>
          <label class="btn" for="imp">Import file</label><input id="imp" type="file" accept="application/json,.json" class="sr-only" data-act="importfile"><button class="btn" data-act="importpaste">Paste to import</button></div>
      </section>
      <section class="card stack" style="margin-top:14px"><h2 style="font-size:var(--fs-h3)">Reset</h2>
        <p class="small muted">Resets cannot be undone. Export first.</p>
        <div class="btnrow"><button class="btn danger" data-act="reset" data-kind="srs">Reset spaced-review schedule</button><button class="btn danger" data-act="reset" data-kind="attempts">Reset all answers and sessions</button><button class="btn danger" data-act="reset" data-kind="all">Reset everything</button></div>
      </section>`;
  };

  const A = CP.act;
  A.setopt = el => { const s = CP.store.S.settings, k = el.dataset.k; let v = el.dataset.v; if (v === 'true' || v === 'false') v = v === 'true'; else if (!isNaN(+v) && k !== 'theme') v = +v; s[k] = v; CP.store.save(); CP.applyPrefs(); CP.router.refresh(); };
  A.settog = el => { const s = CP.store.S.settings; s[el.dataset.k] = el.checked; CP.store.save(); };
  A.setscale = el => { const s = CP.store.S.settings; s.textScale = +el.value; CP.store.save(); CP.applyPrefs(); const l = document.querySelector('label[for="ts"]'); if (l) l.textContent = `Text size: ${s.textScale}%`; };
  const exportText = () => JSON.stringify(CP.store.exportObj());
  A.export = () => {
    const txt = exportText();
    try {
      const blob = new Blob([txt], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ccarp-progress-${U.isoDay(Date.now())}.json`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      CP.store.S.settings.lastExport = Date.now(); CP.store.save(); UI.toast('Export downloaded.');
    } catch (e) { A.copyexport(); }
  };
  A.copyexport = async () => {
    const txt = exportText();
    try { await navigator.clipboard.writeText(txt); UI.toast('Copied. Paste it into a file to keep it.'); CP.store.S.settings.lastExport = Date.now(); CP.store.save(); }
    catch (e) { UI.modal({ title: 'Copy your export', body: `<textarea class="input" style="width:100%;min-height:200px" readonly>${esc(txt)}</textarea>` }); }
  };
  async function doImport(text) {
    let parsed;
    try { parsed = CP.store.parseImport(text); } catch (e) { UI.modal({ title: 'Import failed', body: `<p>${esc(e.message)}</p>` }); return; }
    const v = await UI.modal({ title: 'Import progress', body: `<p>${esc(parsed.summary)}.</p><p class="small muted" style="margin-top:8px">Merge keeps everything here and adds the export's history. Replace discards this browser's progress.</p>`, actions: [{ id: 'no', label: 'Cancel' }, { id: 'replace', label: 'Replace', danger: true }, { id: 'merge', label: 'Merge', primary: true }] });
    if (v === 'merge') { CP.store.replace(CP.store.merge(CP.store.S, parsed.state)); UI.toast('Merged.'); }
    if (v === 'replace') { const ok = await UI.confirm('Replace all progress?', 'Everything in this browser is overwritten by the export.', 'Replace', true); if (ok) { CP.store.replace(parsed.state); UI.toast('Replaced.'); } }
    CP.applyPrefs(); CP.router.refresh();
  }
  A.importfile = el => { const f = el.files && el.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => doImport(String(r.result)); r.readAsText(f); el.value = ''; };
  A.importpaste = async () => {
    const v = await UI.modal({ title: 'Paste an export', body: `<textarea class="input" id="imptxt" style="width:100%;min-height:180px" aria-label="Export text"></textarea>`, actions: [{ id: 'no', label: 'Cancel' }, { id: 'go', label: 'Import', primary: true, read: dlg => 'go:' + dlg.querySelector('#imptxt').value }] });
    if (v && v.startsWith('go:')) doImport(v.slice(3));
  };
  A.reset = async el => {
    const kind = el.dataset.kind;
    const label = { srs: 'the spaced-review schedule', attempts: 'all answers, sessions and form results', all: 'everything, including settings and ratings' }[kind];
    const v = await UI.modal({ title: 'Reset ' + label + '?', body: `<p>This cannot be undone. Type <b>RESET</b> to confirm.</p><input class="input" id="rsttxt" style="margin-top:10px;width:100%" autocomplete="off" aria-label="Type RESET">`, actions: [{ id: 'no', label: 'Cancel' }, { id: 'export', label: 'Export first' }, { id: 'go', label: 'Reset', danger: true, read: dlg => dlg.querySelector('#rsttxt').value.trim() === 'RESET' ? 'go' : 'bad' }] });
    if (v === 'export') { A.export(); return; }
    if (v === 'bad') { UI.toast('Type RESET to confirm.'); return; }
    if (v !== 'go') return;
    CP.store.reset(kind); CP.applyPrefs(); UI.toast('Reset done.'); CP.router.refresh();
  };

  // ---------- About ----------
  const AB = CP.views.about = {};
  AB.title = () => 'About & sources';
  AB.render = () => {
    const D = CP.bank.D, m = D.meta || {}, B = CP.bank;
    const n = s => B.items.filter(i => i.set === s).length;
    const vol = (D.platform || []).filter(f => f.volatile);
    return `<div class="pagehead"><h1>About &amp; sources</h1><p>A study portal for Anthropic's Claude Certified Architect – Professional (CCAR-P) exam. Unofficial: not affiliated with or endorsed by Anthropic.</p></div>
      <section class="card stack-sm"><h2 style="font-size:var(--fs-h3)">Blueprint</h2>
        <p class="small">Domains, weights and objective wording follow Anthropic's <b>Claude Certified Architect – Professional Exam Guide v1.0 (effective July 2026)</b>, cross-checked against the Anthropic Partner Academy certification data. The guide "is subject to change without notice"; check the current version before you book.</p>
        <p class="small">Objective numbers 1.1–7.3 are a study convention; the guide lists objectives as unnumbered bullets.</p></section>
      <section class="card stack-sm" style="margin-top:14px"><h2 style="font-size:var(--fs-h3)">Question bank</h2>
        <p class="small">Bank ${esc(m.bank || '')} built ${esc(m.built ? U.fmtDate(m.built) : '')}: ${n('formA') + n('formB') + n('formC')} items in three sealed, disjoint forms, ${n('pool')} practice-pool items, ${n('official')} official samples and ${n('bridge')} Foundations bridge items.</p>
        <p class="small">Every original item was written against one official objective and one cheat-sheet rule, then checked by a mechanical validator (schema, length parity so the key is rarely the longest option, answer-letter balance, originality against public banks) and by independent reviewers: a blind solver, an options-only giveaway probe, a red-team key attacker and a fidelity reviewer. Flagged items were rewritten and re-verified.</p>
        <p class="small">The three official samples are reproduced verbatim from the Exam Guide, Section 8, with attribution, for study. Foundations bridge items were rewritten from a CCAR-F practice set that had wrong or disputed keys (removed) and a strong longest-answer bias (fixed); they are drill-only.</p></section>
      <section class="card stack-sm" style="margin-top:14px"><h2 style="font-size:var(--fs-h3)">What is not known</h2>
        <ul class="small"><li>Whether multi-response items give partial credit, and what share of items they are. The portal scores all-or-nothing.</li>
          <li>Whether a scenario-matching or dropdown item type exists (one passer report). Not simulated.</li>
          <li>The raw-to-scaled conversion. Readiness is an honest accuracy estimate with an interval, not a scaled score.</li>
          <li>${vol.length} platform facts are version-sensitive and dated 2026-09 (Exam facts page).</li></ul></section>
      <section class="card stack-sm" style="margin-top:14px"><h2 style="font-size:var(--fs-h3)">Community reference questions and licences</h2>
        <p class="small">The Community reference drill reproduces public practice questions whose licences allow redistribution, with attribution. Each was independently re-solved against this portal’s rules; the item shows the verdict. Changes made here: options relabelled A–F, portal trap codes and verdict notes added, formatting normalised.</p>
        <ul class="small">
          <li><b>Amey Thakur, CLAUDE-CERTIFICATIONS</b> (architect-professional), MIT. github.com/Amey-Thakur/CLAUDE-CERTIFICATIONS</li>
          <li><b>preporato.com, claude-certification-guide</b> (ccar-p/guide.md), MIT. github.com/preporato/claude-certification-guide</li>
          <li><b>Girish R, ClaudeCertifiedArchitect-Professional-Prep</b>, CC BY 4.0 (creativecommons.org/licenses/by/4.0). github.com/girishr/ClaudeCertifiedArchitect-Professional-Prep</li>
          <li><b>Juan Martín Cordero, claude-certified-architect-es</b>, CC BY 4.0. Translated from Spanish for this portal. github.com/juanmartincoma-collab/claude-certified-architect-es</li>
        </ul>
        <p class="small muted">Used for cross-checking only and not reproduced (no redistribution licence): the CCAR-P-SET1 simulator, claudearchitectguide.com, Matthew Purcell’s free practice exam, and Anurag Karuparti’s sample questions.</p>
        <details class="acc"><summary>MIT License · Amey Thakur</summary><div class="body"><p class="small mono" style="white-space:pre-wrap">MIT License

Copyright (c) 2026 Amey Thakur

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p></div></details><details class="acc"><summary>MIT License · preporato.com</summary><div class="body"><p class="small mono" style="white-space:pre-wrap">MIT License

Copyright (c) 2026 preporato.com

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p></div></details>
      </section>
      <section class="card stack-sm" style="margin-top:14px"><h2 style="font-size:var(--fs-h3)">Credits</h2><p class="small">Developed by <b>IYKYK</b>. Research drew on the official guide and FAQ plus community guides (vkorost, preporato, Amey-Thakur, dnacenta, sarveshtalele, paullarionov for Foundations) and passer reports. The original bank copies no community or commercial questions; the Community reference drill reproduces only openly licensed ones, credited above.</p>
        <p class="small">Typefaces: IBM Plex Sans, Plex Serif and Plex Mono, © IBM Corp., SIL Open Font License 1.1, embedded so the file works offline. Icons: Phosphor Icons, © Phosphor Icons, MIT License.</p></section>`;
  };

  // ---------- More (mobile) ----------
  const MO = CP.views.more = {};
  MO.title = () => 'More';
  MO.render = () => `<div class="pagehead"><h1>More</h1></div><ul class="linklist">${[['path', 'Learning path', 'Stages, schedule, courses, reading'], ['blueprint', 'Blueprint', 'The 38 objectives and self-ratings'], ['traps', 'Traps & tips', 'The trap atlas and 37 tips'], ['progress', 'Progress', 'Objective map, trends, calibration'], ['exam', 'Exam facts', 'Format, logistics, the 27% explainer'], ['settings', 'Settings', 'Theme, accommodations, export/import'], ['about', 'About', 'Sources and methodology']].map(([r, l, d]) => `<li><a href="#/${r}"><span class="grow"><b>${esc(l)}</b><br><span class="cap faint">${esc(d)}</span></span><span aria-hidden="true">›</span></a></li>`).join('')}</ul>`;
})(typeof window !== 'undefined' ? window : globalThis);
