// Interactive population charts for the home page: a histogram and a scatter plot. Click an axis label (or the
// scatter's colour key) to pick what it shows; clicking the histogram's y label switches between linear and log counts.
// Stars: the rows of data/index.json (the page's DATA). Flares: data/flares_lite.json (FlareStars/code/
// site_flares_lite.py), fetched when the histogram comes into view (or a few seconds after load); until then the
// histogram offers star quantities only. Each axis range is sigma-clipped -- median +- K_SIG robust sigma
// (1.4826 x MAD) -- so a few bad values can't squash the plot; how many fall outside is written under the chart.
// The static PNG in each figure is the no-JS fallback. Needs d3 v7 (scales, ticks) and common.js (TF).
const TFCharts = (() => {
  const K_SIG = 5;
  const RAMP = ['#5b2a35', '#a33a4a', '#e8615f', '#ffa477', '#ffe2b8'];   // = sky.js / the population figures
  const lg = v => v > 0 ? Math.log10(v) : null;
  // star quantities: l label, f(row) -> plotted value (log10 for log axes), log, inv (magnitudes: bright at the top/right)
  const STAR = {
    G: {l: 'Gaia G (mag)', f: o => o.g, inv: true},
    C: {l: 'BP − RP (mag)', f: o => o.c},
    M: {l: 'absolute G magnitude', f: o => o.g != null && o.D > 0 ? o.g - 5 * Math.log10(o.D / 10) : null, inv: true},
    D: {l: 'distance (pc)', f: o => lg(o.D), log: true},
    RT: {l: 'flare rate (per day)', f: o => lg(o.rt), log: true},
    N: {l: 'flares on the star', f: o => lg(o.n), log: true},
    EN: {l: 'largest flare energy (erg)', f: o => lg(o.en), log: true},
    EM: {l: 'largest flare equivalent duration (s)', f: o => lg(o.e), log: true},
    P: {l: 'rotation period (d)', f: o => lg(o.p), log: true},
  };
  // flare quantities (flares_lite.json columns, already log10 where log)
  const FLARE = {
    E: {l: 'flare energy, TESS band (erg)', log: true},
    ED: {l: 'equivalent duration (s)', log: true},
    A: {l: 'amplitude (peak / quiescent flux)', log: true},
    S: {l: 'peak signal-to-noise', log: true},
    T: {l: 'decay half-time (min)', log: true},
  };                                       // (rise time R and components C are in the file but not offered: Hugh)
  const css = () => getComputedStyle(document.documentElement);
  const BOX = (W, H) => ({x: 62, y: 10, w: W - 74, h: H - 62});    // plot area inside the canvas

  // robust range of the finite values: [lo, hi, number outside]
  function clip(vals, isInt) {
    const v = vals.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return [0, 1, 0];
    if (isInt) return [v[0], v[v.length - 1], 0];
    const med = v[Math.floor(0.5 * (v.length - 1))];
    const dev = v.map(x => Math.abs(x - med)).sort((a, b) => a - b);
    const s = 1.4826 * dev[Math.floor(0.5 * (dev.length - 1))];
    let lo = v[0], hi = v[v.length - 1];
    if (s > 0) { lo = Math.max(lo, med - K_SIG * s); hi = Math.min(hi, med + K_SIG * s); }
    if (hi <= lo) hi = lo + 1;
    return [lo, hi, v.filter(x => x < lo || x > hi).length];
  }

  // tick labels: log axes as powers of ten when they span a few decades ({e}: drawn as 10^e), else plain values
  function ticks(scale, log, n) {
    const [a, b] = scale.domain().slice().sort((x, y) => x - y);
    if (log && b - a >= 2) {
      const step = Math.max(1, Math.ceil((b - a) / n)), out = [];
      for (let k = Math.ceil(a); k <= b; k += step) out.push([k, {e: String(k).replace('-', '−')}]);
      return out;
    }
    return scale.ticks(n).map(t => [t, log ? TF.sig3(Math.pow(10, t)) : String(+t.toFixed(6))]);
  }
  function label(ctx, s, x, y, align) {     // a tick label: plain text, or 10 with a raised, smaller exponent
    if (typeof s === 'string') { ctx.textAlign = align; ctx.fillText(s, x, y); return; }
    const f = ctx.font, small = f.replace(/[\d.]+px/, m => `${parseFloat(m) * 0.78}px`);
    const w1 = ctx.measureText('10').width; ctx.font = small; const w2 = ctx.measureText(s.e).width; ctx.font = f;
    const x0 = align === 'center' ? x - (w1 + w2) / 2 : align === 'right' ? x - w1 - w2 : x;
    ctx.textAlign = 'left'; ctx.fillText('10', x0, y);
    ctx.font = small; ctx.fillText(s.e, x0 + w1 + 0.5, y - (ctx.textBaseline === 'top' ? 4 : 5)); ctx.font = f;
  }
  function axes(ctx, box, xs, ys, xlog, ylog) {   // grid, ticks and frame (the axis titles are the HTML buttons)
    const C = css(), ink = C.getPropertyValue('--ink-rgb').trim();
    ctx.font = '10.5px "Azeret Mono", ui-monospace, monospace'; ctx.fillStyle = C.getPropertyValue('--text-dim').trim();
    ctx.strokeStyle = `rgba(${ink},0.10)`; ctx.lineWidth = 1;
    ctx.textBaseline = 'top';
    for (const [t, s] of ticks(xs, xlog, Math.max(3, Math.floor(box.w / 80)))) {
      const x = Math.round(xs(t)) + 0.5; if (x < box.x - 1 || x > box.x + box.w + 1) continue;
      ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); ctx.stroke();
      label(ctx, s, x, box.y + box.h + 5, 'center');
    }
    ctx.textBaseline = 'middle';
    for (const [t, s] of ticks(ys, ylog, Math.max(3, Math.floor(box.h / 50)))) {
      const y = Math.round(ys(t)) + 0.5; if (y < box.y - 1 || y > box.y + box.h + 1) continue;
      ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
      label(ctx, s, box.x - 6, y, 'right');
    }
    ctx.strokeStyle = `rgba(${ink},0.35)`; ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
  }

  // the chart's markup: canvas, the two axis-title buttons, an optional key button, and the shared pick-list menu.
  // Returns {fresh() -> {ctx, W, H} (resized, cleared), place(box), setX/setY/setKey(html), menu(button, groups, cur, pick)}
  function frame(fig, aspect, withKey) {
    const wrap = document.createElement('div'); wrap.className = 'chart';
    wrap.innerHTML = `<div class="chart-stage"><canvas></canvas>
        <button type="button" class="axis-btn ax-x" aria-haspopup="listbox"></button>
        <button type="button" class="axis-btn ax-y" aria-haspopup="listbox"></button>
        <div class="axis-menu" role="listbox" hidden></div></div>` +
      (withKey ? '<div class="chart-key"><button type="button" class="axis-btn ax-k" aria-haspopup="listbox"></button></div>' : '');
    const img = fig.querySelector('img'); if (img) img.remove();
    fig.insertBefore(wrap, fig.querySelector('figcaption'));
    const $ = s => wrap.querySelector(s), stage = $('.chart-stage'), cv = $('canvas'), ctx = cv.getContext('2d'), menuEl = $('.axis-menu');
    let open = null;
    const close = () => { menuEl.hidden = true; if (open) open.setAttribute('aria-expanded', 'false'); open = null; };
    document.addEventListener('click', e => { if (open && !wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    return {
      wrap, stage,
      fresh() {
        const dpr = devicePixelRatio || 1, W = stage.clientWidth, H = Math.round(W * aspect);
        cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        return {ctx, W, H};
      },
      place(box) {                         // x title centred under the plot, y title centred beside it (rotated)
        const bx = $('.ax-x'), by = $('.ax-y');
        bx.style.left = `${box.x + box.w / 2}px`; bx.style.top = `${box.y + box.h + 34}px`;
        by.style.left = '12px'; by.style.top = `${box.y + box.h / 2}px`;
      },
      setX: h => { $('.ax-x').innerHTML = h; }, setY: h => { $('.ax-y').innerHTML = h; }, setKey: h => { $('.ax-k').innerHTML = h; },
      btn: s => $(s),
      // a pick list under button b: groups [[group title or null, [[value, label], ...]], ...]; pick(value) on a click
      menu(b, groups, cur, pick) {
        if (open === b) { close(); return; }
        menuEl.innerHTML = groups.map(([g, list]) => (g ? `<div class="am-g">${g}</div>` : '') + list.map(([v, l]) =>
          `<button type="button" role="option" data-v="${v}" aria-selected="${v === cur}">${l}</button>`).join('')).join('');
        menuEl.hidden = false; open = b; b.setAttribute('aria-expanded', 'true');
        const sr = stage.getBoundingClientRect(), br = b.getBoundingClientRect(), mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
        let x = br.left - sr.left + br.width / 2 - mw / 2, y = br.bottom - sr.top + 4;
        if (y + mh > sr.height + 40) y = br.top - sr.top - mh - 4;   // no room below: above the button
        menuEl.style.left = `${Math.max(0, Math.min(sr.width - mw, x))}px`; menuEl.style.top = `${Math.max(0, y)}px`;
        menuEl.onclick = e => { const o = e.target.closest('[data-v]'); if (!o) return; close(); pick(o.dataset.v); };
        const sel = menuEl.querySelector('[aria-selected="true"]'); (sel || menuEl.querySelector('button')).focus();
      },
    };
  }
  const caret = t => `${t} <span class="caret" aria-hidden="true">▾</span>`;
  const HIST_SKIP = new Set(['N']);        // star quantities the histogram doesn't offer (flares on the star: Hugh)
  const starList = () => Object.entries(STAR).filter(([k]) => !HIST_SKIP.has(k)).map(([k, q]) => ['s:' + k, q.l]);

  // ---------------- histogram ----------------
  function hist(fig, rows) {
    if (typeof d3 === 'undefined' || !fig) return;
    let FL = null, key = 's:RT', logY = false, touched = false;   // flare quantities appear once flares_lite.json is in
    let split = true;                                    // all, plus simple (blue) and complex (red) as their own lines
    const F = frame(fig, 0.8, true), cap = fig.querySelector('figcaption');   // same shape as the scatter, so a row matches
    const groups = () => (FL ? [['Flares', Object.entries(FLARE).map(([k, q]) => ['f:' + k, q.l])]] : []).concat([['Stars', starList()]]);
    function draw() {
      const {ctx, W, H} = F.fresh();
      const [kind, k] = key.split(':'), q = kind === 'f' ? FLARE[k] : STAR[k];
      let vals, sub, simp;                               // all values; the complex and simple subsets
      if (kind === 'f') { vals = FL.cols[k]; sub = FL.cols.X.map((x, i) => x === 2 ? vals[i] : null);
                          simp = FL.cols.X.map((x, i) => x === 0 ? vals[i] : null); }
      else { vals = rows.map(q.f); sub = rows.map((o, i) => o.x > 0 ? vals[i] : null); simp = rows.map((o, i) => o.x > 0 ? null : vals[i]); }
      const [lo, hi, out] = clip(vals, q.int);
      const nb = q.int ? Math.min(60, hi - lo + 1) : Math.max(20, Math.min(60, Math.round(W / 12)));
      const edges = q.int ? d3.range(nb + 1).map(i => lo - 0.5 + i) : d3.range(nb + 1).map(i => lo + (hi - lo) * i / nb);
      const count = arr => { const c = new Array(nb).fill(0);
        for (const v of arr) { if (v == null || v < edges[0] || v > edges[nb]) continue; c[Math.min(nb - 1, Math.floor((v - edges[0]) / (edges[1] - edges[0])))]++; }
        return c; };
      const ca = count(vals), cs = count(sub), cp = count(simp);
      const box = BOX(W, H);
      const xs = d3.scaleLinear([edges[0], edges[nb]], q.inv ? [box.x + box.w, box.x] : [box.x, box.x + box.w]);
      const top = Math.max(1, ...ca);
      // log counts: a linear scale in log10(count), labelled as powers of ten like the log quantities
      const ys = logY ? d3.scaleLinear([Math.log10(0.8), Math.log10(top * 1.3)], [box.y + box.h, box.y])
                      : d3.scaleLinear([0, top * 1.05], [box.y + box.h, box.y]);
      const yv = c => logY ? (c > 0 ? ys(Math.log10(c)) : box.y + box.h) : ys(c);
      axes(ctx, box, xs, ys, q.log, logY);
      const step = (c, col, lw, fillCol) => {
        ctx.beginPath(); ctx.moveTo(xs(edges[0]), box.y + box.h);
        for (let i = 0; i < nb; i++) { ctx.lineTo(xs(edges[i]), yv(c[i])); ctx.lineTo(xs(edges[i + 1]), yv(c[i])); }
        ctx.lineTo(xs(edges[nb]), box.y + box.h);
        if (fillCol) { ctx.fillStyle = fillCol; ctx.fill(); }
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
      };
      const C = css();
      step(ca, C.getPropertyValue('--c-data').trim(), 1.5, `rgba(${C.getPropertyValue('--data-rgb').trim()},0.16)`);
      const cSim = C.getPropertyValue('--c-simple').trim(), cCx = C.getPropertyValue('--c-complex').trim();
      if (split) { step(cp, cSim, 1.6); step(cs, cCx, 1.8); }
      const what = kind === 'f' ? 'flares' : 'stars';
      F.setX(caret(q.l)); F.setY(caret(logY ? `${what} (log)` : what)); F.place(box);
      const nAll = vals.filter(v => v != null).length, nSub = sub.filter(v => v != null).length, nSim = simp.filter(v => v != null).length;
      const subL = kind === 'f' ? 'complex flares' : 'stars with a complex flare', simL = kind === 'f' ? 'simple flares' : 'stars without one';
      F.wrap.querySelector('.chart-key').innerHTML = (`<button type="button" class="sky-chip hist-split" aria-pressed="${split}">split simple / complex</button>` +
        (split ? `<span class="hist-leg"><i style="background:${cSim}"></i>${simL}<i style="background:${cCx}"></i>${subL}</span>` : ''));   // replaces the unused key button
      TF.cap(cap, `${q.l[0].toUpperCase() + q.l.slice(1)} of ${nAll.toLocaleString()} ${what}` +
        (split ? `; <span style="color:${cSim}">${simL}</span> and <span style="color:${cCx}">${subL}</span> drawn separately.` : '.'),
        (split ? `${simL[0].toUpperCase() + simL.slice(1)}: ${nSim.toLocaleString()}; ${subL}: ${nSub.toLocaleString()}` +
                 (kind === 'f' ? ' (marginal flares count only in the total).' : '.') : '') +
        (out ? ` ${out.toLocaleString()} ${what} lie outside the range shown (more than ${K_SIG}&sigma; from the median).` : '') +
        ' Click the axis labels to change what is plotted; the button under the chart turns the simple / complex split on or off.');
    }
    F.btn('.ax-x').addEventListener('click', e => F.menu(e.currentTarget, groups(), key, v => { key = v; touched = true; draw(); }));
    F.btn('.ax-y').addEventListener('click', e => F.menu(e.currentTarget, [[null, [['lin', 'linear counts'], ['log', 'log counts']]]],
      logY ? 'log' : 'lin', v => { logY = v === 'log'; draw(); }));
    F.wrap.querySelector('.chart-key').addEventListener('click', e => { if (e.target.closest('.hist-split')) { split = !split; draw(); } });
    draw();
    new ResizeObserver(() => draw()).observe(F.stage);
    let asked = false;
    const load = () => {                                 // the flares (~2 MB gzipped), once
      if (asked) return; asked = true;
      fetch('data/flares_lite.json').then(r => r.ok ? r.json() : null).then(j => {
        if (!j) return;
        FL = j; if (!touched) key = 'f:E';               // flare energy by default, unless the reader already chose
        draw();
      }).catch(() => {});
    };
    new IntersectionObserver((es, ob) => {               // when the chart is about to be seen ...
      if (es.some(e => e.isIntersecting)) { ob.disconnect(); load(); }
    }, {rootMargin: '300px'}).observe(fig);
    setTimeout(load, 3000);                              // ... or a few seconds after the page is up, whichever is first
  }

  // ---------------- scatter ----------------
  function scatter(fig, rows) {
    if (typeof d3 === 'undefined' || !fig) return;
    let kx = 'C', ky = 'M', kc = 'RT';
    const ramp = d3.interpolateRgbBasis(RAMP);
    const F = frame(fig, 0.8, true), cap = fig.querySelector('figcaption');
    const list = none => [[null, (none ? [['', 'no colour']] : []).concat(Object.entries(STAR).map(([k, q]) => [k, q.l]))]];
    function draw() {
      const {ctx, W, H} = F.fresh();
      const qx = STAR[kx], qy = STAR[ky], qc = kc ? STAR[kc] : null;
      const X = rows.map(qx.f), Y = rows.map(qy.f), Cv = qc ? rows.map(qc.f) : null;
      const [x0, x1] = clip(X), [y0, y1] = clip(Y);
      const box = BOX(W, H);
      const xs = d3.scaleLinear([x0, x1], qx.inv ? [box.x + box.w, box.x] : [box.x, box.x + box.w]);
      const ys = d3.scaleLinear([y0, y1], qy.inv ? [box.y, box.y + box.h] : [box.y + box.h, box.y]);
      axes(ctx, box, xs, ys, qx.log, qy.log);
      let c0 = 0, c1 = 1;
      if (Cv) {                                          // colour range: 2nd-98th percentile
        const v = Cv.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
        if (v.length) { c0 = v[Math.floor(0.02 * (v.length - 1))]; c1 = v[Math.floor(0.98 * (v.length - 1))]; if (c1 <= c0) c1 = c0 + 1; }
      }
      const order = d3.range(rows.length).filter(i => X[i] != null && Y[i] != null && X[i] >= x0 && X[i] <= x1 && Y[i] >= y0 && Y[i] <= y1);
      if (Cv) order.sort((a, b) => (Cv[a] ?? -Infinity) - (Cv[b] ?? -Infinity));   // the highest values on top
      const r = rows.length > 20000 ? 1.3 : 2;
      ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
      ctx.globalAlpha = rows.length > 20000 ? 0.55 : 0.8;
      const grey = css().getPropertyValue('--c-pts').trim();
      for (const i of order) {
        ctx.fillStyle = Cv ? (Cv[i] == null ? grey : ramp(Math.max(0, Math.min(1, (Cv[i] - c0) / (c1 - c0))))) : grey;
        ctx.fillRect(xs(X[i]) - r / 2, ys(Y[i]) - r / 2, r, r);
      }
      ctx.restore();
      F.setX(caret(qx.l)); F.setY(caret(qy.l)); F.place(box);
      const fv = v => qc.log ? TF.sig3(Math.pow(10, v)) : TF.sig3(v);
      F.setKey(qc ? `<span class="sky-ramp" style="background:linear-gradient(90deg, ${RAMP.join(',')})"></span>` +
        caret(`colour: ${qc.l}, ${fv(c0)}&ndash;${fv(c1)}${qc.log ? ' (log)' : ''}`) : caret('colour: none'));
      const out = rows.length - order.length;
      TF.cap(cap, `${order.length.toLocaleString()} flare stars` + (qc ? `, coloured by ${qc.l}.` : '.'),
        (out ? `${out.toLocaleString()} stars lack one of the values or lie outside the ranges shown (more than ${K_SIG}&sigma; from the median). ` : '') +
        'Click the axis labels or the colour key to change what is plotted.');
    }
    F.btn('.ax-x').addEventListener('click', e => F.menu(e.currentTarget, list(), kx, v => { kx = v; draw(); }));
    F.btn('.ax-y').addEventListener('click', e => F.menu(e.currentTarget, list(), ky, v => { ky = v; draw(); }));
    F.btn('.ax-k').addEventListener('click', e => F.menu(e.currentTarget, list(true), kc, v => { kc = v; draw(); }));
    draw();
    new ResizeObserver(() => draw()).observe(F.stage);
  }

  return {hist, scatter};
})();
