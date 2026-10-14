/* blueprint: the official exam guide as a working table with self-rating, measured mastery and calibration. */
(function (G) {
  const CP = G.CP; CP.views = CP.views || {};
  const U = CP.U, UI = CP.ui, esc = U.esc;
  const V = CP.views.blueprint = {};
  V.title = () => 'Blueprint & self-assessment';
  V.wide = true;

  V.render = p => {
    const S = CP.store.S, B = CP.bank;
    const M = CP.mastery.all(S);
    const sort = p.q.sort || 'blueprint';
    const pri = new Map(CP.select.priority(S).map((x, i) => [x.obj, i]));
    const rated = Object.keys(S.self).length;
    const seenIn = d => B.bank.filter(it => it.domain === d && S.items[it.id]).length;
    const calib = m => m.calib === 'overconfident' ? '<span class="chip bad" title="Rated Green but measured below 60%">Overconfident</span>' : m.calib === 'underrated' ? '<span class="chip good">Underrated</span>' : m.calib === 'unmeasured' ? '<span class="chip">Unmeasured</span>' : '';
    const objRow = o => {
      const m = M[o.id], r = S.self[o.id] && S.self[o.id].r;
      return `<tr><td class="nowrap mono">${esc(o.id)}</td><td>${esc(o.text)}<div class="row" style="margin-top:6px">${UI.mchip(m)} ${calib(m)}</div></td>
        <td class="nowrap"><div class="seg" role="radiogroup" aria-label="Self-rating for ${esc(o.id)}">${['R', 'Y', 'G'].map(k => `<button type="button" role="radio" aria-checked="${r === k}" aria-pressed="${r === k}" data-act="rate" data-obj="${esc(o.id)}" data-r="${k}" title="${{ R: "Red: I can't state the decision rule", Y: 'Yellow: I know it but am unsure under trade-offs', G: 'Green: I can decide a scenario and name the trap' }[k]}">${{ R: 'Red', Y: 'Yellow', G: 'Green' }[k]}</button>`).join('')}</div></td>
        <td class="nowrap r"><a class="btn sm quiet" href="#/guide/d${o.domain}/${esc(o.id)}">Read</a><button class="btn sm" data-act="start" data-kind="objective" data-obj="${esc(o.id)}">Drill</button></td></tr>`;
    };
    let body;
    if (sort === 'blueprint') {
      body = B.domains.map(d => {
        const objs = B.objs.filter(o => o.domain === d.n);
        const total = B.bank.filter(it => it.domain === d.n).length;
        return `<details class="acc" open data-d="${d.n}"><summary><span class="dm"></span>D${d.n} ${esc(d.name)} <span class="chip">${d.weight}%</span><span class="cap faint" style="font-weight:500">~${d.formQuota} of 63 · ${objs.length} objectives · ${seenIn(d.n)}/${total} bank items seen</span></summary>
          <div class="body"><div class="tblwrap"><table class="tbl bp"><thead><tr><th>ID</th><th>Official objective</th><th>Self-rating</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${objs.map(objRow).join('')}</tbody></table></div></div></details>`;
      }).join('');
    } else {
      const objs = B.objs.slice().sort((a, b) => sort === 'priority' ? pri.get(a.id) - pri.get(b.id) : (M[a.id].acc == null ? 2 : M[a.id].acc) - (M[b.id].acc == null ? 2 : M[b.id].acc));
      body = `<div class="tblwrap"><table class="tbl bp"><thead><tr><th>ID</th><th>Official objective</th><th>Self-rating</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${objs.map(objRow).join('')}</tbody></table></div>`;
    }
    return `<div class="pagehead"><h1>Blueprint &amp; self-assessment</h1>
      <p>Official CCAR-P Exam Guide v1.0 (July 2026): 7 domains, 38 objectives, weights 17/13/19/16/14/14/7. The guide lists objectives as unnumbered bullets; the 1.1–7.3 numbers here are a study convention.</p>
      <div class="row small" style="margin-top:10px"><span class="chip bad">Red</span> can't state the rule <span class="chip warn">Yellow</span> unsure under trade-offs <span class="chip good">Green</span> can decide and name the trap <span class="faint">${rated} of 38 rated</span></div>
      <div class="seg" style="margin-top:12px">${[['blueprint', 'Blueprint order'], ['priority', 'Study priority'], ['weakest', 'Weakest first']].map(([k, l]) => `<button type="button" data-act="go" data-route="#/blueprint${k === 'blueprint' ? '' : '?sort=' + k}" aria-pressed="${sort === k}">${l}</button>`).join('')}</div></div>
      ${body}`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
