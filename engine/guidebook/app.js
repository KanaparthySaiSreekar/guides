/* guidebook: a study portal made of tabbed sections, a checklist plan, a syllabus tracker, a filterable cheat sheet,
   case studies and a timed question runner. Content and settings arrive as window.GB (see tools/build-guidebook.mjs). */
(function(){
"use strict";
var GB = window.GB;
var PREFIX = GB.storage + ":", MOCK = GB.mock, QB = GB.questions, DOMAIN_SHORT = GB.domainShort, DOMAIN_FULL = GB.domainFull, WEIGHTS = GB.weights, CASES = GB.cases, SYL = GB.syllabus, PLAN = GB.plan;

/* ===================== helpers ===================== */
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var store = {
  get: function(k, d){ try { var v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function(k, v){ try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} },
  del: function(k){ try { localStorage.removeItem(PREFIX + k); } catch (e) {} }
};
function el(tag, props, kids){
  var n = document.createElement(tag);
  if (props) Object.keys(props).forEach(function(k){
    var v = props[k];
    if (v == null || v === false) return;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  });
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function(c){
    if (c == null || c === false) return;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return n;
}
function shuffle(a){ for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function sample(arr, n){ return shuffle(arr.slice()).slice(0, n); }
function pct(a, b){ return b ? Math.round(a / b * 100) : 0; }
function fmtTime(sec){ sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s; }
var LETTERS = "ABCDE";
var DOMAIN_KEYS = Object.keys(WEIGHTS).map(Number).sort(function(a, b){ return a - b; });
// Study events for the hosted usage log. Nothing listens in the standalone file, so these cost nothing offline.
var emit = function(t, d){ try { var x = {}; for (var k in d) x[k] = d[k]; x.t = t; document.dispatchEvent(new CustomEvent("guides:track", {detail:x})); } catch (e) {} };
var QMAP = {}; QB.forEach(function(q){ QMAP[q.id] = q; });

/* ===================== views ===================== */
var VIEWS = GB.sections.map(function(x){ return x.id; });
function showView(v){
  if (VIEWS.indexOf(v) < 0) v = "overview";
  VIEWS.forEach(function(name){ var s = document.getElementById("v-" + name); if (s) s.hidden = name !== v; });
  $$(".tab").forEach(function(t){ if (t.getAttribute("data-view") === v) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
  var cur = $('.tab[aria-current="page"]'), rail = $(".tabs");
  if (cur && rail) { var l = cur.offsetLeft - 24; if (l < rail.scrollLeft || cur.offsetLeft + cur.offsetWidth > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = Math.max(0, l); }
  store.set("view", v);
}
function go(v){ if (location.hash !== "#" + v) location.hash = v; else showView(v); }
window.addEventListener("hashchange", function(){
  var h = (location.hash || "").slice(1);
  if (VIEWS.indexOf(h) >= 0) { showView(h); window.scrollTo(0, 0); }
});

/* ===================== overview ===================== */
function renderBars(){
  var host = $("#domainBars"); if (!host) return;
  [1,2,3,4,5,6].forEach(function(d){
    host.appendChild(el("div", {class:"bar-row"}, [
      el("span", {class:"bar-label"}, [el("b", {text:String(d)}), DOMAIN_FULL[d]]),
      el("span", {class:"bar-val", text:WEIGHTS[d] + "%"}),
      el("span", {class:"bar-track", "aria-hidden":"true"}, el("span", {class:"bar-fill", style:"width:" + (WEIGHTS[d] / 25 * 100) + "%"}))
    ]));
  });
  var qc = $("#qcount"); if (qc) qc.textContent = String(QB.length);
}
function initCountdown(){
  var inp = $("#examDate"), out = $("#daysLeft"); if (!inp) return;
  var saved = store.get("examDate", ""); if (saved) inp.value = saved;
  function upd(){
    var v = inp.value;
    if (!v) { out.textContent = "Set a date to see days remaining"; return; }
    var p = v.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]), today = new Date(); today.setHours(0, 0, 0, 0);
    var days = Math.round((d - today) / 86400000);
    if (days > 1) out.textContent = days + " days to go" + (days <= 42 ? " · study plan week " + (6 - Math.floor((days - 1) / 7)) + " of 6" : "");
    else if (days === 1) out.textContent = "Tomorrow. Sleep well.";
    else if (days === 0) out.textContent = "Today. Good luck.";
    else out.textContent = "That date has passed";
  }
  inp.addEventListener("change", function(){ store.set("examDate", inp.value); upd(); });
  upd();
}

/* ===================== checklists ===================== */
function checkItem(key, id, label, state, onChange){
  var cb = el("input", {type:"checkbox", id:"ck-" + key + "-" + id});
  cb.checked = !!state[id];
  cb.addEventListener("change", function(){ if (cb.checked) state[id] = true; else delete state[id]; store.set(key, state); onChange(); emit("checklist", {list:key, item:id, on:cb.checked ? 1 : 0}); });
  return el("li", null, el("label", {class:"ck", for:cb.id}, [cb, el("span", {text:label})]));
}
function renderPlan(){
  var host = $("#planWeeks"); if (!host) return;
  var state = store.get("plan", {}), total = 0;
  function prog(){
    var done = Object.keys(state).length;
    $("#planProgText").textContent = done + " of " + total + " tasks done";
    $("#planProgFill").style.width = pct(done, total) + "%";
  }
  PLAN.forEach(function(w, wi){
    var ul = el("ul", {class:"checks"});
    w.i.forEach(function(t, ti){ total++; ul.appendChild(checkItem("plan", "w" + (wi + 1) + "-" + ti, t, state, prog)); });
    host.appendChild(el("div", {class:"week"}, [el("div", {class:"week-h"}, [el("span", {class:"eyebrow", text:"Week " + (wi + 1)})]), el("h3", {text:w.t}), ul]));
  });
  prog();
}
function renderSyllabus(){
  var host = $("#sylList"); if (!host) return;
  var state = store.get("syl", {}), total = 0, perDom = {};
  function prog(){
    var done = Object.keys(state).length;
    $("#sylProgText").textContent = done + " of " + total + " objectives";
    $("#sylProgFill").style.width = pct(done, total) + "%";
    Object.keys(perDom).forEach(function(d){
      var ids = perDom[d].ids, n = ids.filter(function(id){ return state[id]; }).length;
      perDom[d].txt.textContent = n + "/" + ids.length;
      perDom[d].fill.style.width = pct(n, ids.length) + "%";
    });
  }
  SYL.forEach(function(D, di){
    var body = el("div", {class:"syl-body"}), ids = [];
    D.subs.forEach(function(sub){
      var ul = el("ul", {class:"checks"});
      sub.i.forEach(function(t, ti){ var id = sub.s + "-" + ti; ids.push(id); total++; ul.appendChild(checkItem("syl", id, t, state, prog)); });
      body.appendChild(el("div", {class:"syl-sub"}, [el("h4", null, [el("span", {text:sub.s}), sub.t]), ul]));
    });
    body.appendChild(el("div", {class:"btn-row"}, [el("button", {class:"btn", type:"button", onclick:function(){ startDomain(D.d, 20); }, text:"Drill domain " + D.d + " questions"})]));
    var txt = el("span", {text:"0/0"}), fill = el("span", {class:"prog-fill", style:"width:0%"});
    perDom[D.d] = {ids:ids, txt:txt, fill:fill};
    var det = el("details", {class:"syl-d"}, [
      el("summary", null, [
        el("h3", null, ["Domain " + D.d + " · " + DOMAIN_FULL[D.d], el("span", {class:"w", text:"~" + WEIGHTS[D.d] + "%"})]),
        el("span", {class:"prog"}, [txt, el("span", {class:"prog-track"}, fill)])
      ]), body]);
    if (di === 0) det.open = true;
    host.appendChild(det);
  });
  prog();
}

/* ===================== cheat sheet ===================== */
function initCheatSheet(){
  var inp = $("#csFilter"); if (!inp) return;
  var count = $("#csCount"), empty = $("#csEmpty"), blocks = $$("#v-cheatsheet .cs-block");
  function apply(){
    var q = inp.value.trim().toLowerCase(), total = 0;
    blocks.forEach(function(b){
      var units = $$("tbody tr, .panel li, .traps li", b);
      if (!q) { b.classList.remove("is-hidden"); $$(".is-hidden", b).forEach(function(x){ x.classList.remove("is-hidden"); }); return; }
      var headHit = $("h3", b).textContent.toLowerCase().indexOf(q) >= 0, hits = 0;
      units.forEach(function(u){ var hit = headHit || u.textContent.toLowerCase().indexOf(q) >= 0; u.classList.toggle("is-hidden", !hit); if (hit) hits++; });
      $$(".tbl", b).forEach(function(t){ t.classList.toggle("is-hidden", !$$("tbody tr", t).some(function(r){ return !r.classList.contains("is-hidden"); })); });
      $$(".panel", b).forEach(function(p){ var lis = $$("li", p); if (lis.length) p.classList.toggle("is-hidden", !lis.some(function(r){ return !r.classList.contains("is-hidden"); })); });
      b.classList.toggle("is-hidden", hits === 0);
      total += hits;
    });
    count.textContent = q ? total + (total === 1 ? " match" : " matches") : "";
    empty.classList.toggle("is-hidden", !q || total > 0);
  }
  inp.addEventListener("input", apply);
  $$("#csJump [data-jump]").forEach(function(b){
    b.addEventListener("click", function(){
      var t = document.getElementById(b.getAttribute("data-jump")); if (!t) return;
      if (t.classList.contains("is-hidden")) { inp.value = ""; apply(); }
      t.scrollIntoView({block:"start", behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
    });
  });
  var tog = $("#sigToggle"), tbl = $("#sigTable");
  if (tog && tbl) {
    tog.addEventListener("click", function(){
      var on = !tbl.classList.contains("hide-ans");
      tbl.classList.toggle("hide-ans", on);
      tog.setAttribute("aria-pressed", on ? "true" : "false");
      tog.textContent = on ? "Show all answers" : "Hide answers to test yourself";
      $$("tr.show", tbl).forEach(function(r){ r.classList.remove("show"); });
    });
    $$("tbody tr", tbl).forEach(function(r){ r.addEventListener("click", function(){ if (tbl.classList.contains("hide-ans")) r.classList.toggle("show"); }); });
  }
}

/* ===================== case studies ===================== */
function initCases(){
  var btns = $$("#v-cases .seg button");
  function pick(k){
    btns.forEach(function(b){ b.setAttribute("aria-pressed", b.getAttribute("data-case") === k ? "true" : "false"); });
    $$("#v-cases [data-case-panel]").forEach(function(p){ p.hidden = p.getAttribute("data-case-panel") !== k; });
    store.set("case", k);
  }
  btns.forEach(function(b){ b.addEventListener("click", function(){ pick(b.getAttribute("data-case")); }); });
  var saved = store.get("case", "alto"); if (CASES[saved]) pick(saved);
  $$("[data-drill-case]").forEach(function(b){ b.addEventListener("click", function(){ startCase(b.getAttribute("data-drill-case")); }); });
}

/* ===================== quiz engine ===================== */
var S = null, ticker = null, confirmOpen = false, onlyWrong = false;
function saveS(){ if (S) store.set("session", S); else store.del("session"); }
function isCorrect(it){
  var q = QMAP[it.id]; if (!q || it.sel.length !== q.a.length) return false;
  var a = q.a.slice().sort(), s = it.sel.slice().sort();
  return a.every(function(v, i){ return v === s[i]; });
}
function makeSession(o){
  S = {mode:o.mode, title:o.title, feedback:!!o.feedback, limit:o.limitMin ? o.limitMin * 60 : 0, started:Date.now(), finishedAt:0, i:0, done:false, showCase:true, cases:o.cases || [],
       items:o.ids.map(function(id){ var q = QMAP[id]; return {id:id, order:shuffle(q.o.map(function(_, k){ return k; })), sel:[], flag:false, checked:false}; })};
  confirmOpen = false; onlyWrong = false;
  emit("session_start", {mode:S.mode, label:S.title, n:S.items.length});
  saveS(); go("mock"); renderQuiz(); window.scrollTo(0, 0);
}
function buildMock(total){
  var caseKeys = sample(Object.keys(CASES), MOCK.cases), perCase = total >= MOCK.full ? MOCK.perCaseFull : MOCK.perCaseHalf, ids = [];
  caseKeys.forEach(function(k){ sample(QB.filter(function(q){ return q.cs === k; }), perCase).forEach(function(q){ ids.push(q.id); }); });
  var remaining = total - ids.length, pool = QB.filter(function(q){ return !q.cs; }), keys = DOMAIN_KEYS;
  var alloc = keys.map(function(d){ return Math.floor(remaining * WEIGHTS[d] / 100); });
  var left = remaining - alloc.reduce(function(a, b){ return a + b; }, 0);
  var fr = keys.map(function(d, i){ return {i:i, f:remaining * WEIGHTS[d] / 100 - alloc[i]}; }).sort(function(a, b){ return b.f - a.f; });
  for (var k = 0; k < left; k++) alloc[fr[k % keys.length].i]++;
  keys.forEach(function(d, i){ sample(pool.filter(function(q){ return q.d === d; }), alloc[i]).forEach(function(q){ ids.push(q.id); }); });
  if (ids.length < total) { var used = {}; ids.forEach(function(id){ used[id] = 1; }); sample(pool.filter(function(q){ return !used[q.id]; }), total - ids.length).forEach(function(q){ ids.push(q.id); }); }
  return {ids:shuffle(ids), cases:caseKeys};
}
function startMock(total){
  var m = buildMock(total);
  makeSession({mode:"mock", title:(total >= MOCK.full ? "Full mock" : "Half mock") + " · " + m.cases.map(function(k){ return CASES[k].name; }).join(" + "), ids:m.ids, feedback:false, limitMin:total >= MOCK.full ? MOCK.fullMin : MOCK.halfMin, cases:m.cases});
}
function startDomain(d, n){
  var pool = QB.filter(function(q){ return !q.cs && (d === 0 || q.d === d); });
  var ids = sample(pool, n === 0 ? pool.length : Math.min(n, pool.length)).map(function(q){ return q.id; });
  makeSession({mode:"drill", title:d === 0 ? "Mixed drill · all domains" : "Domain " + d + " drill · " + DOMAIN_SHORT[d], ids:ids, feedback:true});
}
function startCase(k){
  var ids = shuffle(QB.filter(function(q){ return q.cs === k; }).map(function(q){ return q.id; }));
  makeSession({mode:"case", title:"Case drill · " + CASES[k].name, ids:ids, feedback:true, cases:[k]});
}
function startReview(){
  var missed = store.get("missed", []).filter(function(id){ return QMAP[id]; });
  if (!missed.length) return;
  makeSession({mode:"review", title:"Mistakes review", ids:shuffle(missed.slice()), feedback:true});
}
function updateMissed(it){
  var missed = store.get("missed", []), i = missed.indexOf(it.id);
  if (isCorrect(it)) { if (i >= 0) missed.splice(i, 1); }
  else if (i < 0) missed.push(it.id);
  store.set("missed", missed);
}
function remaining(){ return S && S.limit ? S.limit - (Date.now() - S.started) / 1000 : null; }
function stopTicker(){ if (ticker) { clearInterval(ticker); ticker = null; } }
function startTicker(){
  stopTicker();
  if (!S || !S.limit || S.done) return;
  ticker = setInterval(function(){
    var r = remaining(), t = $("#qTimer");
    if (r <= 0) { finish(); return; }
    if (t) { t.textContent = fmtTime(r); t.classList.toggle("low", r < 600); }
  }, 1000);
}
function finish(){
  if (!S || S.done) return;
  stopTicker();
  S.done = true; S.finishedAt = Date.now(); confirmOpen = false;
  S.items.forEach(function(it){ if (it.sel.length || S.mode !== "review") updateMissed(it); });
  var correct = S.items.filter(isCorrect).length;
  var hist = store.get("history", []);
  hist.unshift({t:S.finishedAt, title:S.title, c:correct, n:S.items.length, sec:Math.round((S.finishedAt - S.started) / 1000)});
  store.set("history", hist.slice(0, 20));
  if (!S.feedback) S.items.forEach(function(it){ if (it.sel.length) emit("answer", {item:it.id, ok:isCorrect(it) ? 1 : 0, domain:QMAP[it.id].d, mode:S.mode, exam:1}); });
  emit("session_end", {mode:S.mode, label:S.title, c:correct, total:S.items.length, ms:S.finishedAt - S.started});
  saveS(); renderQuiz(); window.scrollTo(0, 0);
}
function exitSession(){ if (S && !S.done) emit("session_abandon", {mode:S.mode, label:S.title}); stopTicker(); S = null; saveS(); renderQuiz(); }

function renderQuiz(){
  var host = $("#quiz"); if (!host) return;
  host.textContent = "";
  if (!S) { host.appendChild(renderSetup()); return; }
  if (S.done) { host.appendChild(renderResults()); return; }
  if (S.limit && remaining() <= 0) { finish(); return; }
  host.appendChild(renderQuestion());
  startTicker();
}

function renderSetup(){
  var wrap = el("div", {class:"block"});
  var saved = store.get("session", null);
  if (saved && !saved.done && saved.items && saved.items.every(function(it){ return QMAP[it.id]; })) {
    var answered = saved.items.filter(function(it){ return it.sel.length; }).length;
    wrap.appendChild(el("div", {class:"note"}, [el("b", {text:"Unfinished attempt: "}), saved.title + " · " + answered + " of " + saved.items.length + " answered. ",
      el("span", {class:"btn-row", style:"margin-top:8px"}, [
        el("button", {class:"btn primary", type:"button", text:"Resume", onclick:function(){ S = saved; renderQuiz(); }}),
        el("button", {class:"btn ghost", type:"button", text:"Discard", onclick:function(){ store.del("session"); renderQuiz(); }})])]));
  }
  var counts = {}; QB.forEach(function(q){ var k = q.cs || "d" + q.d; counts[k] = (counts[k] || 0) + 1; });
  var mockLen = el("select", {id:"mockLen"}, [el("option", {value:String(MOCK.full), text:MOCK.full + " questions · " + MOCK.fullMin + " min"}), el("option", {value:String(MOCK.half), text:MOCK.half + " questions · " + MOCK.halfMin + " min"})]);
  var domSel = el("select", {id:"drillDom"}, [el("option", {value:"0", text:"All domains, mixed"})].concat(DOMAIN_KEYS.map(function(d){ return el("option", {value:String(d), text:"Domain " + d + " · " + DOMAIN_SHORT[d] + " (" + (counts["d" + d] || 0) + ")"}); })));
  var domN = el("select", {id:"drillN"}, [el("option", {value:"10", text:"10 questions"}), el("option", {value:"20", text:"20 questions", selected:true}), el("option", {value:"0", text:"Every question"})]);
  var caseSel = el("select", {id:"drillCase"}, Object.keys(CASES).map(function(k){ return el("option", {value:k, text:CASES[k].name + " (" + (counts[k] || 0) + ")"}); }));
  var missed = store.get("missed", []).filter(function(id){ return QMAP[id]; });
  wrap.appendChild(el("div", {class:"modes"}, [
    el("div", {class:"mode"}, [el("div", {class:"block"}, [el("h3", {text:"Full mock exam"}), el("p", {text:"Exam conditions: " + (["no", "one", "two", "three", "four"][MOCK.cases] || MOCK.cases) + " random case stud" + (MOCK.cases === 1 ? "y" : "ies") + ", domains weighted like the real exam, a countdown timer, and answers revealed only at the end. Flag questions and jump around freely."})]),
      el("div", {class:"ctl"}, [el("label", {for:"mockLen", text:"Length"}), mockLen, el("button", {class:"btn primary", type:"button", text:"Start mock", onclick:function(){ startMock(+mockLen.value); }})])]),
    el("div", {class:"mode"}, [el("div", {class:"block"}, [el("h3", {text:"Domain drill"}), el("p", {text:"Practice one domain at a time with instant feedback and the reasoning behind every option."})]),
      el("div", {class:"ctl"}, [el("label", {for:"drillDom", text:"Domain"}), domSel, el("label", {for:"drillN", text:"Questions"}), domN, el("button", {class:"btn primary", type:"button", text:"Start drill", onclick:function(){ startDomain(+domSel.value, +domN.value); }})])]),
    el("div", {class:"mode"}, [el("div", {class:"block"}, [el("h3", {text:"Case-study drill"}), el("p", {text:"Every question for one case, with the case summary open beside each question, like the exam’s split screen."})]),
      el("div", {class:"ctl"}, [el("label", {for:"drillCase", text:"Case study"}), caseSel, el("button", {class:"btn primary", type:"button", text:"Start case drill", onclick:function(){ startCase(caseSel.value); }})])]),
    el("div", {class:"mode"}, [el("div", {class:"block"}, [el("h3", {text:"Mistakes review"}), el("p", {text:missed.length ? missed.length + " question" + (missed.length === 1 ? "" : "s") + " you last answered wrong. A question leaves this list once you get it right." : "Questions you get wrong in any mode collect here. Nothing yet."})]),
      el("div", {class:"ctl"}, [el("button", {class:"btn primary", type:"button", text:"Review mistakes", disabled:!missed.length, onclick:startReview})])])
  ]));
  var hist = store.get("history", []);
  var bank = el("p", {class:"muted", style:"font-size:.9rem"}, ["Question bank: " + QB.length + " questions. " +
    [1,2,3,4,5,6].map(function(d){ return "D" + d + " " + (counts["d" + d] || 0); }).join(" · ") + " · case studies " +
    Object.keys(CASES).map(function(k){ return counts[k] || 0; }).reduce(function(a, b){ return a + b; }, 0) + ". Keys: ",
    el("span", {class:"kbd", text:"A–E"}), " select, ", el("span", {class:"kbd", text:"Enter"}), " check or next, ", el("span", {class:"kbd", text:"F"}), " flag."]);
  wrap.appendChild(bank);
  if (hist.length) {
    var tb = el("tbody");
    hist.slice(0, 8).forEach(function(h){
      var p = pct(h.c, h.n);
      tb.appendChild(el("tr", null, [el("td", {class:"plain", text:new Date(h.t).toLocaleDateString(undefined, {month:"short", day:"numeric"})}), el("td", {text:h.title}),
        el("td", {class:"plain mono", text:h.c + "/" + h.n}), el("td", null, el("span", {class:"verdict-pill " + (p >= 80 ? "ok" : p >= 70 ? "mid" : "bad"), text:p + "%"})), el("td", {class:"plain mono", text:fmtTime(h.sec)})]));
    });
    wrap.appendChild(el("div", {class:"block"}, [el("h3", {text:"Recent attempts"}),
      el("div", {class:"tbl narrow hist"}, el("table", null, [el("thead", null, el("tr", null, [el("th", {text:"Date"}), el("th", {text:"Attempt"}), el("th", {text:"Score"}), el("th", {text:"%"}), el("th", {text:"Time"})])), tb])),
      el("div", {class:"btn-row"}, el("button", {class:"btn ghost", type:"button", text:"Clear history and mistakes", onclick:function(){ store.del("history"); store.del("missed"); renderQuiz(); }}))]));
  }
  return wrap;
}

function casePane(k){
  var c = CASES[k];
  return el("aside", {class:"case-pane", "aria-label":c.name + " case study summary"}, [
    el("p", {class:"eyebrow", text:"Case study"}), el("h3", {text:c.name}), el("p", {text:c.sum}),
    el("h4", {text:"Existing environment"}), el("ul", null, c.env.map(function(x){ return el("li", {text:x}); })),
    el("h4", {text:"Key requirements"}), el("ul", null, c.req.map(function(x){ return el("li", {text:x}); })),
    el("p", {class:"muted", style:"font-size:.85rem"}, el("a", {href:"#cases", text:"Full case study and requirement map"}))
  ]);
}

function selectOpt(origIdx){
  var it = S.items[S.i], q = QMAP[it.id];
  if (S.feedback && it.checked) return;
  var need = q.a.length;
  if (need === 1) it.sel = [origIdx];
  else {
    var at = it.sel.indexOf(origIdx);
    if (at >= 0) it.sel.splice(at, 1);
    else { it.sel.push(origIdx); if (it.sel.length > need) it.sel.shift(); }
  }
  saveS(); renderQuiz();
}
function checkCurrent(){
  var it = S.items[S.i];
  if (!it.sel.length || it.checked) return;
  it.checked = true; updateMissed(it); saveS(); renderQuiz();
  emit("answer", {item:it.id, ok:isCorrect(it) ? 1 : 0, domain:QMAP[it.id].d, mode:S.mode});
}
function move(delta){
  var n = S.i + delta; if (n < 0 || n >= S.items.length) return;
  S.i = n; confirmOpen = false; saveS(); renderQuiz();
  var card = $(".q-card"); if (card && card.getBoundingClientRect().top < 60) window.scrollTo(0, Math.max(0, window.scrollY + card.getBoundingClientRect().top - 80));
}
function primaryAction(){
  if (!S || S.done) return;
  var it = S.items[S.i], last = S.i === S.items.length - 1;
  if (S.feedback && !it.checked) { if (it.sel.length) checkCurrent(); return; }
  if (last) { askFinish(); return; }
  move(1);
}
function askFinish(){
  var un = S.items.filter(function(it){ return !it.sel.length; }).length;
  if (un === 0 && !S.items.some(function(it){ return it.flag; })) { finish(); return; }
  confirmOpen = true; renderQuiz();
  var c = $(".confirm"); if (c) c.scrollIntoView({block:"nearest"});
}

function renderQuestion(){
  var it = S.items[S.i], q = QMAP[it.id], multi = q.a.length > 1, cs = q.cs, revealed = S.feedback && it.checked;
  var answered = S.items.filter(function(x){ return x.sel.length; }).length;
  var lhs = [el("b", {text:S.title}), el("span", {class:"muted", text:"Question " + (S.i + 1) + " of " + S.items.length + " · " + answered + " answered"})];
  if (S.limit) { var r = remaining(); lhs.push(el("span", {class:"timer" + (r < 600 ? " low" : ""), id:"qTimer", role:"timer", "aria-label":"Time remaining", text:fmtTime(r)})); }
  var rhs = [];
  if (cs) rhs.push(el("button", {class:"btn ghost", type:"button", text:S.showCase ? "Hide case study" : "Show case study", onclick:function(){ S.showCase = !S.showCase; saveS(); renderQuiz(); }}));
  rhs.push(el("button", {class:"btn", type:"button", text:S.feedback ? "End and see results" : "Finish exam", onclick:askFinish}));
  rhs.push(el("button", {class:"btn ghost", type:"button", text:"Quit", title:"Leave without saving a result", onclick:exitSession}));

  var meta = [];
  if (cs) meta.push(el("span", {class:"badge new", text:CASES[cs].name}));
  if (S.mode !== "mock" || S.done) meta.push(el("span", {class:"badge", text:"Domain " + q.d + " · " + DOMAIN_SHORT[q.d]}));
  if (it.flag) meta.push(el("span", {class:"badge", style:"color:var(--signal)", text:"Flagged"}));

  var opts = el("div", {class:"opts", role:"group", "aria-label":"Answer options"});
  it.order.forEach(function(orig, pos){
    var cls = "opt" + (multi ? " multi" : ""), sel = it.sel.indexOf(orig) >= 0, isAns = q.a.indexOf(orig) >= 0;
    if (revealed) { if (isAns) cls += " correct"; else if (sel) cls += " wrong"; }
    else if (sel) cls += " sel";
    opts.appendChild(el("button", {class:cls, type:"button", "aria-pressed":sel ? "true" : "false", disabled:revealed,
      onclick:function(){ selectOpt(orig); }}, [el("span", {class:"k", text:LETTERS[pos]}), el("span", {text:q.o[orig]})]));
  });

  var card = el("div", {class:"q-card"}, [
    meta.length ? el("div", {class:"q-meta"}, meta) : null,
    el("p", {class:"q-text", text:q.q}),
    multi ? el("p", {class:"q-hint", text:"Choose " + (q.a.length === 2 ? "two" : q.a.length) + "." + (it.sel.length ? " Selected " + it.sel.length + "." : "")}) : null,
    opts
  ]);
  if (revealed) {
    var ok = isCorrect(it);
    var ansLetters = it.order.map(function(orig, pos){ return q.a.indexOf(orig) >= 0 ? LETTERS[pos] : null; }).filter(Boolean).join(" and ");
    card.appendChild(el("div", {class:"explain", role:"status"}, [
      el("p", {class:"verdict " + (ok ? "ok" : "bad"), text:ok ? "Correct." : "Not quite. The answer is " + ansLetters + "."}),
      el("p", {text:q.x})]));
  }
  var last = S.i === S.items.length - 1, primLabel;
  if (S.feedback && !it.checked) primLabel = "Check answer";
  else primLabel = last ? (S.feedback ? "See results" : "Finish exam") : "Next question";
  card.appendChild(el("div", {class:"q-actions"}, [
    el("div", {class:"btn-row"}, [
      el("button", {class:"btn ghost", type:"button", text:"← Previous", disabled:S.i === 0, onclick:function(){ move(-1); }}),
      el("button", {class:"btn ghost", type:"button", "aria-pressed":it.flag ? "true" : "false", text:it.flag ? "Unflag" : "Flag for review", onclick:function(){ it.flag = !it.flag; saveS(); renderQuiz(); }})]),
    el("button", {class:"btn primary", type:"button", text:primLabel, disabled:S.feedback && !it.checked && !it.sel.length, onclick:primaryAction})
  ]));
  if (confirmOpen) {
    var un = S.items.filter(function(x){ return !x.sel.length; }).length, fl = S.items.filter(function(x){ return x.flag; }).length;
    card.appendChild(el("div", {class:"confirm", role:"alertdialog", "aria-label":"Confirm finish"}, [
      el("p", {text:(un ? un + " question" + (un === 1 ? " is" : "s are") + " unanswered" : "Every question is answered") + (fl ? ", and " + fl + " " + (fl === 1 ? "is" : "are") + " flagged" : "") + ". Finish now?"}),
      el("div", {class:"btn-row"}, [el("button", {class:"btn primary", type:"button", text:"Finish and score", onclick:finish}), el("button", {class:"btn ghost", type:"button", text:"Keep going", onclick:function(){ confirmOpen = false; renderQuiz(); }})])]));
  }

  var grid = el("div", {class:"q-grid" + (cs && S.showCase ? " with-case" : "")}, [card, cs && S.showCase ? casePane(cs) : null]);
  var nav = el("div", {class:"navgrid", role:"group", "aria-label":"Jump to question"});
  S.items.forEach(function(x, i){
    var c = [];
    if (x.sel.length) c.push("ans");
    if (S.feedback && x.checked) c.push(isCorrect(x) ? "okq" : "badq");
    if (x.flag) c.push("flag");
    if (i === S.i) c.push("cur");
    nav.appendChild(el("button", {type:"button", class:c.join(" "), "aria-label":"Question " + (i + 1) + (x.flag ? ", flagged" : "") + (x.sel.length ? ", answered" : ""), text:String(i + 1),
      onclick:function(){ S.i = i; confirmOpen = false; saveS(); renderQuiz(); }}));
  });
  return el("div", {class:"q-shell"}, [el("div", {class:"q-bar"}, [el("div", {class:"lhs"}, lhs), el("div", {class:"btn-row"}, rhs)]), grid, nav]);
}

function renderResults(){
  var correct = S.items.filter(isCorrect).length, n = S.items.length, p = pct(correct, n);
  var vcls = p >= 80 ? "ok" : p >= 70 ? "mid" : "bad";
  var vtxt = p >= 80 ? "In the exam-ready range" : p >= 70 ? "Borderline. Drill your weakest domains" : "Not yet. Study the explanations and drill again";
  var dom = {};
  S.items.forEach(function(it){ var d = QMAP[it.id].d; dom[d] = dom[d] || {c:0, n:0}; dom[d].n++; if (isCorrect(it)) dom[d].c++; });
  var bars = el("div", {class:"dom-res"});
  Object.keys(dom).sort().forEach(function(d){
    var v = dom[d], dp = pct(v.c, v.n);
    bars.appendChild(el("div", {class:"bar-row"}, [
      el("span", {class:"bar-label"}, [el("b", {text:d}), DOMAIN_FULL[d]]),
      el("span", {class:"bar-val", text:v.c + "/" + v.n}),
      el("span", {class:"bar-track", "aria-hidden":"true"}, el("span", {class:"bar-fill", style:"width:" + dp + "%;background:var(--" + (dp >= 80 ? "ok" : dp >= 70 ? "signal" : "bad") + ")"}))]));
  });
  var list = el("div", {class:"rev-list"});
  S.items.forEach(function(it, i){
    var q = QMAP[it.id], ok = isCorrect(it), skip = !it.sel.length;
    if (onlyWrong && ok) return;
    var lines = it.order.map(function(orig, pos){
      var isAns = q.a.indexOf(orig) >= 0, sel = it.sel.indexOf(orig) >= 0;
      return el("div", {class:"opt-line" + (isAns ? " c" : sel ? " w" : "")}, [el("span", {class:"mono", text:LETTERS[pos]}), el("span", {text:q.o[orig] + (sel ? "  (your answer)" : "")})]);
    });
    list.appendChild(el("details", {class:"rev"}, [
      el("summary", null, [el("span", {class:"dot " + (skip ? "skip" : ok ? "ok" : "bad"), "aria-label":skip ? "Skipped" : ok ? "Correct" : "Incorrect"}),
        el("span", null, [el("b", {text:(i + 1) + ". "}), (q.cs ? "[" + CASES[q.cs].name + "] " : "") + q.q])]),
      el("div", {class:"rev-body"}, lines.concat([el("p", {class:"muted", text:q.x})]))]));
  });
  var sec = Math.round(((S.finishedAt || Date.now()) - S.started) / 1000);
  return el("div", {class:"block"}, [
    el("div", {class:"score-hero"}, [
      el("div", {class:"score-num"}, [String(p), el("small", {text:"%"})]),
      el("div", {class:"block", style:"gap:8px"}, [
        el("h3", {text:S.title}),
        el("p", null, [el("span", {class:"verdict-pill " + vcls, text:vtxt})]),
        el("p", {class:"muted", text:correct + " of " + n + " correct · " + S.items.filter(function(x){ return !x.sel.length; }).length + " unanswered · time " + fmtTime(sec) + ". Google doesn’t publish a pass mark; aim for 80% or more on these mocks."}),
        el("div", {class:"btn-row"}, [
          el("button", {class:"btn primary", type:"button", text:"New attempt", onclick:exitSession}),
          el("button", {class:"btn", type:"button", "aria-pressed":onlyWrong ? "true" : "false", text:onlyWrong ? "Show all questions" : "Show only mistakes", onclick:function(){ onlyWrong = !onlyWrong; renderQuiz(); }})])])]),
    el("div", {class:"block"}, [el("h3", {text:"By domain"}), bars]),
    el("div", {class:"block"}, [el("h3", {text:"Review"}), el("p", {class:"muted", style:"font-size:.9rem", text:"Open a question to see every option, your answer and the reasoning."}), list])
  ]);
}

document.addEventListener("keydown", function(e){
  if (!S || S.done || $("#v-mock").hidden) return;
  var tg = e.target && e.target.tagName;
  if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
  var k = e.key.toLowerCase(), it = S.items[S.i];
  var idx = "abcde".indexOf(k); if (idx < 0) idx = "12345".indexOf(k);
  if (idx >= 0 && idx < it.order.length) { e.preventDefault(); selectOpt(it.order[idx]); return; }
  if (k === "enter" && tg !== "BUTTON" && tg !== "A") { e.preventDefault(); primaryAction(); return; }
  if (k === "f") { it.flag = !it.flag; saveS(); renderQuiz(); return; }
  if (k === "arrowright") { move(1); } else if (k === "arrowleft") { move(-1); }
});

/* ===================== boot ===================== */
renderBars(); initCountdown(); renderPlan(); renderSyllabus(); initCheatSheet(); initCases(); renderQuiz();
(function(){
  var h = (location.hash || "").slice(1);
  showView(VIEWS.indexOf(h) >= 0 ? h : "overview");
})();

})();
