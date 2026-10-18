// Star page: one template for every star, filled from the star's record in a data shard (TF.getStar).
// Needs common.js (TF), uPlot and Aladin Lite (both from CDNs; the page still works without Aladin).
(async function () {
  const $ = id => document.getElementById(id);
  const CSS = getComputedStyle(document.documentElement);
  const C = name => CSS.getPropertyValue(name).trim();
  const P = new URLSearchParams(location.search);
  const id = (P.get('id') || '').replace(/\D/g, '');
  const fmt = TF.fmt, sig3 = TF.sig3;

  function fail(msg) {
    $('main').innerHTML = `<a class="home" href="index.html">&larr; Catalogue</a>
      <p class="eyebrow">TESSELLATE flare star</p><h1>Not found</h1>
      <div class="empty">${msg}<br><br><a href="search.html">Browse the flare stars &rarr;</a></div>`;
  }
  if (!id) return fail('No star was given (the address should end in <span class="mono">star.html?id=&lt;Gaia DR3 ID&gt;</span>).');

  let S, dataURL;
  try {
    const got = await TF.getStar(id);
    if (!got) return fail(`Gaia DR3 <span class="mono">${TF.esc(id)}</span> has no page in this catalogue.`);
    S = got.S;
    dataURL = URL.createObjectURL(new Blob([got.gz], {type: 'application/gzip'}));   // the download link below
  } catch (e) {
    return fail(`The data for Gaia DR3 <span class="mono">${TF.esc(id)}</span> could not be loaded (${TF.esc(e.message)}).`);
  }
  const EV = S.events;
  const PERIODIC = S.sectors.some(s => s.p);       // baseline has a periodic (rotation) part to subtract separately
  // each flare's window (peak - 6 h .. max(end, peak) + 12 h), cut from its sector's full-cadence light curve:
  // r = flux - baseline and e = noise sigma, in 0.1 e-/s, null where a frame is missing
  for (const ev of EV) {
    const sc = S.sectors.find(x => x.s === ev.s), n = sc.f.length;
    const lo = Math.max(0, Math.ceil((ev.tpk - 0.25 - sc.t) / sc.dt - 1e-6));
    const hi = Math.min(n - 1, Math.floor((Math.max(ev.end, ev.tpk) + 0.5 - sc.t) / sc.dt + 1e-6));
    const r = [], e = [];
    for (let i = lo; i <= hi; i++) {
      r.push(sc.f[i] == null || sc.b[i] == null ? null : sc.f[i] - sc.b[i]);
      e.push(sc.e ? sc.e[i] : null);
    }
    ev.w = {t: sc.t + lo * sc.dt, dt: sc.dt, r, e};
  }
  const MULTI = S.sectors.length > 1;
  document.title = `Gaia DR3 ${S.id} — TESSELLATE flare catalogue`;
  $('name').innerHTML = `Gaia DR3 <span class="mono">${S.id}</span>`;
  const sgn = v => (v >= 0 ? '+' : '&minus;') + Math.abs(v).toFixed(5);
  $('subtitle').innerHTML = `RA ${S.ra.toFixed(5)}&deg;, Dec ${sgn(S.dec)}&deg; &middot; ` +
    `${EV.length} flare${EV.length === 1 ? '' : 's'} in TESS sector${MULTI ? 's' : ''} ` +
    S.sectors.map(s => s.s).join(', ');

  // ---------------- state ----------------
  let SEL = null, VIEW = null, OV = null, FC = null;
  const showSecondary = () => $('show2').checked;
  const visible = () => EV.filter(e => showSecondary() || e.tier === 'gold');

  // ---------------- info panel ----------------
  const stat = (l, v) => `<div class="stat-row"><span class="stat-label">${l}</span><span class="stat-value">${v}</span></div>`;
  const nComplex = EV.filter(e => e.cls === 'complex').length;
  const nExtra = EV.reduce((a, e) => a + (e.n_comp || 0), 0);
  const eds = EV.map(e => e.ed).filter(v => v != null);
  let rot = '&mdash;';
  if (S.prot != null) rot = `${S.prot.toFixed(3)} d <span class="sub">(LS power ${fmt(S.prot_power, 2)})</span>`;
  else if (S.prot_cand != null) rot = `none significant <span class="sub">(best ${S.prot_cand.toFixed(2)} d, power ${fmt(S.prot_power, 2)})</span>`;
  $('info').innerHTML =
    `<p class="sec">Star (Gaia DR3)</p>` +
    stat('<em>G</em>', fmt(S.G, 2)) +
    stat('BP &minus; RP', fmt(S.bprp, 2)) +
    stat('Neighbour contamination', S.contam == null ? '&mdash;' :
         `${fmt(S.contam, 2)} <span class="sub">(neighbours / star, 3&times;3 px)</span>`) +
    stat('Variable-star catalogue', S.var_type && S.var_type !== '-' ? TF.esc(S.var_type) : 'none') +
    `<p class="sec">TESSELLATE</p>` +
    stat('Sectors <span class="sub">(camera/CCD, cut, objid)</span>', S.sectors.map(s => s.cam == null ? `${s.s}` :
      `${s.s} <span class="sub">(${s.cam}/${s.ccd}, cut ${s.cut}${s.obj && s.obj.length ? `, obj ${s.obj.join('/')}` : ''})</span>`).join('<br>')) +
    stat('Observing time', `${fmt(S.obs_days, 1)} d`) +
    stat('Flares', `${EV.length} <span class="sub">(${EV.filter(e => e.tier === 'gold').length} gold)</span>`) +
    stat('Flare rate', `${fmt(S.rate, 3)} per day`) +
    stat('Complex flares', `${nComplex}` + (nExtra ? ` <span class="sub">(${nExtra} significant component${nExtra > 1 ? 's' : ''})</span>` : '')) +
    stat('Largest flare (ED)', eds.length ? `${sig3(Math.max(...eds))} s` : '&mdash;') +
    stat('Rotation period', rot) +
    stat('Quiescent flux', S.sectors.map(s => s.fq == null ? `${s.s}: &mdash;` : `${s.s}: ${sig3(s.fq)}`).join(', ') + ' <span class="sub">e&#8315;/s</span>') +
    `<div class="links"><a href="https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${S.ra}+${S.dec}&amp;Radius=10&amp;Radius.unit=arcsec" target="_blank" rel="noopener">SIMBAD</a>` +
    `<a href="https://vizier.cds.unistra.fr/viz-bin/VizieR-4?-source=I/355/gaiadr3&amp;Source=${S.id}" target="_blank" rel="noopener">Gaia DR3 (VizieR)</a></div>`;

  // ---------------- sky (Aladin Lite) ----------------
  const SKY = {al: null, all: null, sel: null, shapes: new Map(), picked: 0};
  const PINK = '#ffd1d1';
  // Aladin highlights a circle itself when its outline is clicked (default green): give our circles the same pink
  // as the selected-flare overlay, and map each drawn circle to its flare so that click selects it too
  const circleOpts = () => ({color: C('--c-flare'), selectionColor: PINK, selectionLineWidth: 3, hoverColor: '#ffb3b3'});
  // 3 sigma localisation radius (deg): the region the gold host match uses (3 x the 1 sigma per-axis error)
  const R3 = L => 3 * (L.sig1 != null ? L.sig1 : L.r68 / 1.67) / 3600;
  const pFlare = e => e.loc.length ? Math.max(...e.loc.map(L => L.p ?? -1)) : null;
  // Aladin Lite is loaded here, not by a <script> tag: it can take seconds to arrive from CDS, and a tag before
  // star.js held back the whole page (light curve included) until it had
  const loadScript = src => new Promise((ok, bad) => {
    const el = document.createElement('script');
    el.src = src; el.charset = 'utf-8'; el.onload = ok; el.onerror = bad;
    document.head.appendChild(el);
  });
  loadScript('https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js').then(() => A.init).then(() => {
    const survey = S.dec > -29 ? 'P/PanSTARRS/DR1/color-z-zg-g' : 'P/DSS2/color';
    const al = A.aladin('#aladin', {survey, fov: 3 / 60, target: `${S.ra} ${S.dec}`, cooFrame: 'ICRSd',
      showReticle: false, showCooGridControl: false, showSettingsControl: false, showShareControl: false,
      showProjectionControl: false, showFrame: false, showLayersControl: true, showFullscreenControl: true,
      showGotoControl: false});
    try {
      al.addCatalog(A.catalogFromVizieR('I/355/gaiadr3', `${S.ra} ${S.dec}`, 3 / 60,
        {name: 'Gaia DR3', color: '#8791a3', sourceSize: 9, onClick: 'showTable'}));
    } catch (e) {}
    SKY.all = A.graphicOverlay({name: 'flare localisations', color: C('--c-flare'), lineWidth: 1.2});
    al.addOverlay(SKY.all);
    SKY.sel = A.graphicOverlay({name: 'selected flare', color: '#ffd1d1', lineWidth: 3});
    al.addOverlay(SKY.sel);
    const host = A.catalog({name: 'host star', color: C('--c-host'), sourceSize: 16, shape: 'circle'});
    al.addCatalog(host);
    host.addSources([A.source(S.ra, S.dec, {name: `Gaia DR3 ${S.id}`})]);
    SKY.al = al;
    // a click on a circle's outline: Aladin picks the shape itself -> select its flare
    const pick = o => {
      SKY.picked = Date.now();                       // Aladin handled this click (a circle, or e.g. a Gaia source)
      const k = SKY.shapes.get(o) ?? (o && o.shapes ? o.shapes.map(x => SKY.shapes.get(x)).find(v => v != null) : undefined);
      if (k != null) select(k, true);
    };
    al.on('objectClicked', pick);
    // a click inside a circle (or a few pixels outside its outline): nearest centre relative to radius wins
    al.on('click', c => {
      if (!c || c.isDragging || c.ra == null || Date.now() - SKY.picked < 400) return;
      let fov = 3 / 60;
      try { fov = al.getFov()[0]; } catch (e) {}
      const margin = 8 * fov / Math.max(1, $('aladin').clientWidth);       // 8 screen pixels, in degrees
      let best = null, bd = Infinity;
      for (const e of visible()) for (const L of e.loc) {
        const d = TF.sepArcmin(c.ra, c.dec, L.ra, L.dec) / 60 / (R3(L) + margin);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && bd <= 1) select(best.k, true);
    });
    skyAll();
    if (SEL != null) skySelect(EV[SEL]);
  }).catch(() => {
    $('aladin').innerHTML = '<div class="empty">Sky view unavailable (Aladin Lite did not load).</div>';
  });
  function skyAll() {
    if (!SKY.al || !SKY.all) return;
    try { SKY.all.removeAll(); } catch (e) {}
    SKY.shapes.clear();
    for (const e of visible()) for (const L of e.loc) {
      const c = A.circle(L.ra, L.dec, R3(L), circleOpts());
      SKY.shapes.set(c, e.k); SKY.all.add(c);
    }
  }
  function skySelect(ev) {
    if (!SKY.al || !SKY.sel) return;
    try { SKY.sel.removeAll(); } catch (e) {}
    if (Date.now() - SKY.picked > 400) { try { SKY.al.selectObjects(); } catch (e) {} }   // clear Aladin's own pick
    for (const L of ev.loc) SKY.sel.add(A.circle(L.ra, L.dec, R3(L), {color: PINK, lineWidth: 3}));
  }

  // ---------------- chart helpers ----------------
  // whole-pixel font sizes only: uPlot rescales the integer before 'px' for high-DPI canvases
  const FONT = '11px "IBM Plex Mono", ui-monospace, monospace', LFONT = '12px "IBM Plex Sans", system-ui, sans-serif';
  const axis = (label, size) => ({label, labelSize: 20, labelFont: LFONT, font: FONT, size, stroke: C('--text-dim'),
    grid: {stroke: C('--hairline'), width: 1}, ticks: {stroke: C('--panel-border'), width: 1}});
  const clip = u => { const b = u.bbox; u.ctx.beginPath(); u.ctx.rect(b.left, b.top, b.width, b.height); u.ctx.clip(); };
  // time-only zoom: no horizontal cursor line, drag selects a time range and the flux axis rescales itself
  // only the data series si gets a cursor dot: the readout reports that point
  const CURSOR = si => ({y: false, drag: {x: true, y: false}, points: {size: (u, i) => i === si ? 6 : 0}});   // fresh object per chart
  // (t, f) of the data point nearest the cursor (the highlighted one on series si), in the chart's bottom-right
  // corner instead of uPlot's legend
  function readout(el, si, text) {
    let r = el.querySelector('.readout');
    if (!r) { r = document.createElement('div'); r.className = 'readout'; el.appendChild(r); }
    return u => {
      const i = u.cursor.idxs ? u.cursor.idxs[si] : u.cursor.idx, y = i == null ? null : u.data[si][i];
      r.textContent = u.cursor.left == null || u.cursor.left < 0 || y == null ? '' : text(u.data[0][i], y);
    };
  }

  // ---------------- views: one sector, or all sectors end to end ----------------
  // A view maps real time (MJD) to a plot coordinate. One sector: identity. All sectors: each sector keeps its own
  // time scale; consecutive sectors (S27 -> S28) keep their real gap (~1 d, like an orbit gap), other gaps are
  // collapsed to GAP and marked with a break (//) on the time axis.
  function makeView(secs) {
    const segs = [];
    const span = secs.reduce((a, s) => a + s.f.length * s.dt, 0);
    const gap = secs.length > 1 ? Math.max(0.8, 0.035 * span) : 0;
    let prev = null;
    for (const s of secs) {
      const t0 = s.t - s.dt / 2, t1 = s.t + (s.f.length - 0.5) * s.dt;
      const contig = prev !== null && s.s === prev.s + 1;
      const p0 = prev === null ? t0 : prev.p1 + (contig ? Math.max(0, t0 - prev.t1) : gap);
      prev = {s: s.s, sec: s, t0, t1, p0, p1: p0 + (t1 - t0), contig};
      segs.push(prev);
    }
    return {key: secs.length > 1 ? 'all' : secs[0].s, segs};
  }
  const viewAll = () => makeView(S.sectors);
  const viewOf = s => makeView([S.sectors.find(x => x.s === s)]);
  const toPlot = (V, t, s) => { const g = V.segs.find(g => g.s === s); return g ? g.p0 + (t - g.t0) : null; };
  function toReal(V, x) {
    let best = V.segs[0], bd = Infinity;
    for (const g of V.segs) {
      const d = x < g.p0 ? g.p0 - x : (x > g.p1 ? x - g.p1 : 0);
      if (d < bd) { bd = d; best = g; }
    }
    return {seg: best, t: best.t0 + (x - best.p0)};
  }
  const inView = (V, e) => V.segs.some(g => g.s === e.s);

  // [x, baseline, flux, flux inside flares]; a null point between sectors breaks the lines across the gap.
  // Flare bins (plus one either side, so even a one-bin flare draws as a red spike) form their own series.
  // The baseline is a slow spline plus, for some rotators, a periodic part (sector field p; spline = b - p). Each can
  // be subtracted on its own (sub = {spline, periodic}); the baseline line shows whatever part is left.
  function viewData(V, sub, evs) {
    const X = [], Bs = [], F = [], R = [];
    V.segs.forEach((g, j) => {
      if (j > 0) { X.push((V.segs[j - 1].p1 + g.p0) / 2); Bs.push(null); F.push(null); R.push(null); }
      const s = g.sec, n = s.f.length, fl = new Array(n).fill(false);
      for (const e of evs) {
        if (e.s !== s.s) continue;
        const i0 = Math.max(0, Math.floor((e.start - s.t) / s.dt + 0.5) - 1);
        const i1 = Math.min(n - 1, Math.floor((e.end - s.t) / s.dt + 0.5) + 1);
        for (let i = i0; i <= i1; i++) fl[i] = true;
      }
      for (let i = 0; i < n; i++) {
        const f = s.f[i], b = s.b[i], p = s.p ? s.p[i] : 0;
        let fv = null, bv = null;
        if (b != null && p != null) {
          const off = (sub.spline ? b - p : 0) + (sub.periodic ? p : 0);       // what is subtracted
          bv = (b - off) / 10;
          if (f != null) fv = (f - off) / 10;
        }
        X.push(g.p0 + (s.t + i * s.dt - g.t0)); Bs.push(bv); F.push(fv); R.push(fl[i] ? fv : null);
      }
    });
    return [X, Bs, F, R];
  }
  // time axis: ticks at round MJDs inside each sector, labelled with the real MJD
  function timeAxis(V) {
    return Object.assign(axis(V.segs.some(g => g.p0 > V.segs[0].p0 && !g.contig) ? 'MJD (gaps between sectors removed)' : 'MJD', 40), {
      space: 90,
      splits: (u, ai, min, max, incr) => {
        const out = [];
        for (const g of V.segs) {
          const a = Math.max(min, g.p0), b = Math.min(max, g.p1);
          if (a > b) continue;
          const ta = g.t0 + (a - g.p0), tb = g.t0 + (b - g.p0);
          for (let k = Math.ceil(ta / incr - 1e-9); k * incr <= tb + 1e-9; k++) out.push(g.p0 + (k * incr - g.t0));
        }
        return out;
      },
      values: (u, splits) => splits.map(x => String(+toReal(V, x).t.toFixed(3))),
    });
  }
  // gold bands behind flares (stronger for the selected one)
  function shadeFlares(u, V, evs) {
    const ctx = u.ctx, top = u.bbox.top, h = u.bbox.height, dpr = devicePixelRatio || 1;
    ctx.save(); clip(u);
    for (const e of evs) {
      const a = u.valToPos(toPlot(V, Math.min(e.start, e.tpk - 0.004), e.s), 'x', true);
      const b = u.valToPos(toPlot(V, Math.max(e.end, e.tpk + 0.004), e.s), 'x', true);
      ctx.fillStyle = e.k === SEL ? 'rgba(255,214,110,0.32)' : 'rgba(255,214,110,0.15)';
      ctx.fillRect(a, top, Math.max(b - a, 3 * dpr), h);
    }
    ctx.restore();
  }
  // collapsed sector gaps: a faint band and a // break on the time axis (not between consecutive sectors, whose real
  // gap is shown); each sector's name at its start
  function drawGaps(u, V) {
    const ctx = u.ctx, dpr = devicePixelRatio || 1, L = u.bbox.left, Rr = L + u.bbox.width;
    const top = u.bbox.top, bot = top + u.bbox.height;
    ctx.save();
    for (let j = 1; j < V.segs.length; j++) {
      if (V.segs[j].contig) continue;
      const a = u.valToPos(V.segs[j - 1].p1, 'x', true), b = u.valToPos(V.segs[j].p0, 'x', true);
      if (b < L || a > Rr) continue;
      ctx.fillStyle = 'rgba(244,234,235,0.035)';
      ctx.fillRect(Math.max(a, L), top, Math.min(b, Rr) - Math.max(a, L), bot - top);
      const m = (a + b) / 2, h = 7 * dpr;
      ctx.strokeStyle = C('--text-dim'); ctx.lineWidth = 1.4 * dpr;
      for (const d of [-3.5, 3.5]) {
        ctx.beginPath(); ctx.moveTo(m + (d - 3) * dpr, bot + h); ctx.lineTo(m + (d + 3) * dpr, bot - h); ctx.stroke();
      }
    }
    if (V.segs.length > 1) {
      ctx.fillStyle = C('--text-faint'); ctx.font = `${Math.round(10 * dpr)}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textBaseline = 'top';
      for (const g of V.segs) {
        const x = u.valToPos(g.p0, 'x', true);
        if (x >= L - 1 && x < Rr - 30 * dpr) ctx.fillText(`S${g.s}`, Math.max(x, L) + 4 * dpr, top + 4 * dpr);
      }
    }
    ctx.restore();
  }
  function drawOverview(V, keepRange) {
    const old = keepRange && OV && VIEW && VIEW.key === V.key ? [OV.scales.x.min, OV.scales.x.max] : null;
    VIEW = V;
    for (const b of $('tabs').children) b.setAttribute('aria-pressed', String(b.dataset.s === String(V.key)));
    const sub = {spline: $('resid').checked, periodic: PERIODIC && $('subper').checked}, el = $('overview');
    const ylab = !sub.spline && !sub.periodic ? 'flux' : !PERIODIC || (sub.spline && sub.periodic) ? 'flux − baseline' :
                 sub.spline ? 'flux − spline baseline' : 'flux − periodic baseline';
    if (OV) { OV.destroy(); OV = null; }
    const evs = visible().filter(e => inView(V, e));
    OV = new uPlot({
      width: el.clientWidth, height: 300,
      scales: {x: {time: false}},
      axes: [timeAxis(V), axis(`${ylab} (e⁻/s)`, 64)],
      series: [{},
               {stroke: C('--c-base'), width: 1.8, points: {show: false}, show: $('showbase').checked},   // baseline (zero when subtracted)
               {stroke: 'rgba(234,223,224,0.55)', width: 1, points: {size: 3, fill: C('--c-data'), stroke: C('--c-data')}},
               {stroke: C('--c-flare'), width: 1.8, points: {size: 4, fill: C('--c-flare'), stroke: C('--c-flare')}}],   // flares
      cursor: CURSOR(2), legend: {show: false},
      hooks: {drawClear: [u => shadeFlares(u, V, evs)], draw: [u => drawGaps(u, V)],
              setCursor: [readout(el, 2, (x, f) => `t = ${toReal(V, x).t.toFixed(4)}, f = ${f.toFixed(1)} e⁻/s`)]},
    }, viewData(V, sub, evs), el);
    if (old) OV.setScale('x', {min: old[0], max: old[1]});
    let down = null;
    OV.over.addEventListener('mousedown', e => { down = [e.clientX, e.clientY]; });
    OV.over.addEventListener('click', e => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;   // that was a zoom drag
      const {seg, t} = toReal(V, OV.posToVal(e.offsetX, 'x'));
      let best = null, bd = Infinity;
      for (const ev of evs) {
        if (ev.s !== seg.s) continue;
        const d = t < ev.start ? ev.start - t : (t > ev.end ? t - ev.end : 0);
        if (d < bd) { bd = d; best = ev; }
      }
      if (best && bd < 0.015 * (OV.scales.x.max - OV.scales.x.min) + 0.01) select(best.k, false);
    });
  }
  function zoomTo(ev) {
    const g = VIEW.segs.find(g => g.s === ev.s);
    OV.setScale('x', {min: toPlot(VIEW, Math.max(g.t0, ev.tpk - 1.0), ev.s), max: toPlot(VIEW, Math.min(g.t1, ev.tpk + 1.5), ev.s)});
  }

  // ---------------- flare view ----------------
  // Fitted flare model (fit_components.py): main flare = a rise with a definite onset (zero before t_peak - w, then
  // (1 - (u/w)^2)^2 up to the peak) into a power-law or double-exponential decay; each component = the same rise into an
  // exponential decay; all averaged over the exposure (N_SUB sub-samples). Times in hours from the peak frame.
  // Only the significant (kept) components are returned. Each curve is null before its onset (drawn from where it starts).
  const riseShape = (u, w) => { const z = Math.max(u / w, -1); return (1 - z * z) ** 2; };
  function compModel(xh, cm, cadh) {
    const N_SUB = 15, p = cm.p;
    const mainShape = u => u < 0 ? riseShape(u, p[2]) :
      cm.kind === 'PL' ? Math.pow(1 + u / p[3], -p[4]) : (1 - p[5]) * Math.exp(-u / p[3]) + p[5] * Math.exp(-u / p[4]);
    const compShape = (u, q) => u < 0 ? riseShape(u, q[2]) : Math.exp(-u / q[3]);
    const avg = f => xh.map(x => { let a = 0; for (let k = 0; k < N_SUB; k++) a += f(x + ((k + 0.5) / N_SUB - 0.5) * cadh); return a / N_SUB; });
    const main = avg(t => p[1] * mainShape(t - p[0]));
    const kept = cm.comps.filter(c => c.kept);
    const comps = kept.map(c => avg(t => c.p[1] * compShape(t - c.p[0], c.p)));
    const tot = main.map((v, i) => v + comps.reduce((a, c) => a + c[i], 0));
    const from = (arr, t0) => arr.map((v, i) => xh[i] < t0 - cadh / 2 ? null : v);       // null before the onset
    return {main: from(main, p[0] - p[2]), comps: comps.map((c, j) => from(c, kept[j].p[0] - kept[j].p[2])), tot,
            sig: kept.map(c => c.sig)};
  }
  // flare features in the inset: one colour for all of them, named inside their shaded regions
  const FEAT = 'rgba(255,214,110,0.16)', FEAT_TEXT = '#f3d58a';
  const FEAT_LABEL = {main: 'main peak', peak: 'extra peak', shoulder: 'shoulder', precursor: 'precursor', possible: '2–3σ'};
  // Frames drawn in red, as indices into the window (indices, not times: comparing rounded times once dropped a
  // single-frame rise's peak). From the peak frame walk back while the flux is above 1 sigma, stepping over at most
  // one frame below it (a precursor separated by two or more quiet frames stays out); the red then starts at the
  // frame just before that first rise frame and runs to the event's end (Hugh, 2026-10-15).
  function flareFrames(ev) {
    const w = ev.w, n = w.r.length, idx = t => Math.round((t - w.t) / w.dt);
    const ipk = Math.min(n - 1, Math.max(0, idx(ev.tpk)));
    const iStart = Math.max(0, idx(ev.start)), iEnd = Math.min(n - 1, Math.max(ipk, idx(ev.end)));
    let first = ipk, quiet = 0;
    for (let i = ipk - 1; i >= iStart; i--) {
      const r = w.r[i], e = w.e[i];
      if (r == null) break;
      if (e != null && r > e) { first = i; quiet = 0; } else if (++quiet >= 2) break;
    }
    if (first > 0 && w.r[first - 1] != null) first -= 1;      // include the point just before the rise
    return [first, iEnd];
  }
  function drawFlare(ev, keepRange) {
    const el = $('flarechart');
    // (a chart redrawn twice in one tick has no committed scale yet: then start from the default range)
    const old = keepRange && FC && Number.isFinite(FC.scales.x.min) && Number.isFinite(FC.scales.x.max) ? [FC.scales.x.min, FC.scales.x.max] : null;
    if (FC) { FC.destroy(); FC = null; }
    let xs = [], ys = [], yf = [];
    const w = ev.w, err = new Map();
    const [i0, i1] = flareFrames(ev);
    // the main peak as a feature: the frames rising into the peak frame that are above the noise (1 sigma) and still
    // climbing, never reaching into a precursor; it ends at the peak frame, or at the flare's end when the flare
    // has no other feature
    const ipk = Math.round((ev.tpk - w.t) / w.dt), xOf = i => (w.t + i * w.dt - ev.tpk) * 24;
    let iRise = ipk;
    while (iRise > 0 && w.r[iRise - 1] != null && w.e[iRise - 1] != null && w.r[iRise - 1] > w.e[iRise - 1] &&
           w.r[iRise - 1] < w.r[iRise]) iRise--;
    let x0Main = xOf(iRise);
    for (const sp of ev.spans) if (sp.kind === 'precursor' || (sp.kind === 'possible' && sp.x1 < 0))
      x0Main = Math.max(x0Main, Math.min(0, sp.x1 + w.dt * 24));
    const mainSpan = {kind: 'main', x0: x0Main, x1: ev.spans.length ? 0 : xOf(i1)};
    for (let i = 0; i < w.r.length; i++) {
      if (w.r[i] == null) continue;
      const x = (w.t + i * w.dt - ev.tpk) * 24, y = w.r[i] / 10;
      xs.push(x); ys.push(y); yf.push(i >= i0 && i <= i1 ? y : null);
      if (w.e[i] != null) err.set(x, w.e[i] / 10);
    }
    // 'subtract model': what is left after the fitted model (main flare + significant components), over the fitted
    // range, in units of each frame's noise sigma
    const subFit = $('subfit').checked && ev.cm;
    if (subFit) {
      const m = compModel(xs, ev.cm, w.dt * 24).tot;
      const keep = xs.map(x => x >= ev.cm.x0 - 1e-6 && x <= ev.cm.x1 + 1e-6 && err.has(x));
      ys = ys.map((y, i) => keep[i] ? (y - m[i]) / err.get(xs[i]) : null);
      yf = yf.map((y, i) => y == null || !keep[i] ? null : (y - m[i]) / err.get(xs[i]));
      [xs, ys, yf] = [xs, ys, yf].map(a => a.filter((_, i) => keep[i]));
    }
    const showFit = $('showfeat').checked && ev.cm && !subFit;     // 'show components': the model as dashed curves
    let data, series = [{},
      {stroke: 'rgba(234,223,224,0.30)', width: 1, spanGaps: true,
       points: {show: true, size: 3.5, space: 0, fill: '#cdb8bc', stroke: '#cdb8bc'}},
      {stroke: showFit ? 'rgba(0,0,0,0)' : C('--c-flare'), width: 2.2, spanGaps: true,     // with the fit on, the fit is the line
       points: {show: true, size: 5, space: 0, fill: C('--c-flare'), stroke: C('--c-flare')}}];
    if (showFit) {                                      // main flare (cobalt) and each significant component (gold)
      const N = 500, x0 = ev.cm.x0, x1 = ev.cm.x1;
      const xm = Array.from({length: N}, (_, i) => x0 + (x1 - x0) * i / (N - 1));
      const cmod = compModel(xm, ev.cm, w.dt * 24);
      data = uPlot.join([[xs, ys, yf], [xm, cmod.main, ...cmod.comps]]);
      series.push({stroke: C('--c-base'), width: 2.2, dash: [7, 4], spanGaps: false, points: {show: false}},
                  ...cmod.sig.map(sig => sig ? {stroke: '#f3c35a', width: 2.2, dash: [7, 4], spanGaps: false, points: {show: false}}    // significant
                                             : {stroke: 'rgba(243,195,90,0.6)', width: 1.4, dash: [2, 4], spanGaps: false, points: {show: false}}));  // marginal
    } else data = [xs, ys, yf];
    const showFeat = false;                             // (the old rule-based feature shading is retired)
    const cadh = w.dt * 24;
    FC = new uPlot({
      width: el.clientWidth, height: 300,
      scales: {x: {time: false}},
      axes: [axis('hours from the peak frame', 40), axis(subFit ? 'residual from the model (σ)' : 'flux − baseline (e⁻/s)', 64)],
      series, cursor: CURSOR(1), legend: {show: false},
      hooks: {
        setCursor: [readout(el, 1, (x, f) => `t = ${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)} h, f = ` +
                                          (subFit ? `${f.toFixed(1)}σ` : `${f.toFixed(1)} e⁻/s`))],
        drawClear: [u => {
          const ctx = u.ctx, top = u.bbox.top, h = u.bbox.height;
          ctx.save(); clip(u);
          const dpr = devicePixelRatio || 1;
          ctx.font = `${Math.round(11 * dpr)}px "IBM Plex Sans", system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          let labelEnd = -Infinity, row = 0;                              // a label that would touch the previous one drops a line
          for (const sp of showFeat ? [mainSpan].concat(ev.spans).sort((p, q) => p.x0 - q.x0) : []) {
            const a = u.valToPos(sp.x0 - cadh / 2, 'x', true), b = u.valToPos(sp.x1 + cadh / 2, 'x', true);
            ctx.fillStyle = FEAT;
            ctx.fillRect(a, top, Math.max(b - a, 2), h);
            const txt = FEAT_LABEL[sp.kind] || sp.kind, tw = ctx.measureText(txt).width, xc = (a + b) / 2;
            row = xc - tw / 2 < labelEnd + 6 * dpr ? row + 1 : 0;
            labelEnd = xc + tw / 2;
            ctx.fillStyle = FEAT_TEXT;
            ctx.fillText(txt, xc, top + (6 + 14 * row) * dpr);
          }
          ctx.restore();
        }],
        drawAxes: [u => {                                                 // zero (the baseline, or the decay fit): over the grid, under the data
          const ctx = u.ctx, dpr = devicePixelRatio || 1, y0 = u.valToPos(0, 'y', true);
          ctx.save(); clip(u); ctx.strokeStyle = 'rgba(244,234,235,0.6)'; ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath(); ctx.moveTo(u.bbox.left, y0); ctx.lineTo(u.bbox.left + u.bbox.width, y0); ctx.stroke();
          ctx.restore();
        }],
        draw: [u => {                                                     // error bars
          const ctx = u.ctx;
          if (subFit) return;                                             // in sigma units every bar is +-1
          ctx.save(); clip(u); ctx.strokeStyle = 'rgba(234,223,224,0.40)'; ctx.lineWidth = devicePixelRatio || 1;
          const X = u.data[0], Y = u.data[1], x0 = u.scales.x.min, x1 = u.scales.x.max;
          for (let i = 0; i < X.length; i++) {
            if (Y[i] == null || !err.has(X[i]) || X[i] < x0 || X[i] > x1) continue;
            const x = u.valToPos(X[i], 'x', true), e = err.get(X[i]);
            ctx.beginPath(); ctx.moveTo(x, u.valToPos(Y[i] - e, 'y', true)); ctx.lineTo(x, u.valToPos(Y[i] + e, 'y', true)); ctx.stroke();
          }
          ctx.restore();
        }],
      },
    }, data, el);
    if (old) FC.setScale('x', {min: old[0], max: old[1]});
    else {
      const xEnd = Math.max(6, (ev.end - ev.tpk) * 24 + 1, ...ev.spans.map(sp => sp.x1 + 0.5));
      const xStart = subFit ? ev.cm.x0 - 0.1 : Math.min(-2, (ev.start - ev.tpk) * 24 - 0.5, ...ev.spans.map(sp => sp.x0 - 0.5));
      FC.setScale('x', {min: Math.max(xStart, data[0][0]), max: Math.min(xEnd, data[0][data[0].length - 1])});
    }
    $('showfeat').disabled = !ev.cm || !!subFit;
    $('subfit').disabled = !ev.cm;
  }

  // ---------------- selected-flare details ----------------
  function reason(ev) {
    if (ev.cm) {
      const ns = ev.n_comp || 0, nm = ev.n_marg || 0, n2 = ev.cm.comps.filter(c => !c.kept).length;
      const parts = [];
      if (ns) parts.push(`${ns} significant extra component${ns > 1 ? 's' : ''}`);
      if (nm) parts.push(`${nm} marginal`);
      const rej = n2 ? ` <span class="sub">(${n2} more candidate${n2 > 1 ? 's' : ''} rejected)</span>` : '';
      return (parts.length ? parts.join(' + ') + ' in the fit' : 'no extra component in the fit') + rej +
        '<br><span class="sub">significant: &Delta;&chi;&sup2; &gt; 20; marginal: 10&ndash;20</span>';
    }
    return 'no extra component found';
  }
  function showStats(ev) {
    $('ftitle').innerHTML = `Flare ${ev.k + 1} of ${EV.length} &middot; sector ${ev.s}`;
    $('fstats').innerHTML =
      stat('Class', `${TF.tag(ev.cls)}`) +
      `<p class="hint" style="margin:2px 0 6px">${reason(ev)}</p>` +
      stat('Peak frame', `MJD ${ev.tpk.toFixed(4)}<br><span class="sub">${TF.mjdToUTC(ev.tpk)} UTC</span>`) +
      stat('Tier', ev.tier) +
      stat('p<sub>Flare</sub> <span class="sub">(ML classifier)</span>', ev.loc.length ? ev.loc.map(L => fmt(L.p, 3)).join(', ') : '&mdash;') +
      stat('Peak S/N', fmt(ev.snr, 1)) +
      stat('Amplitude &Delta;F/F', ev.amp == null ? '&mdash;' : sig3(ev.amp)) +
      stat('Equivalent duration', ev.ed == null ? '&mdash;' : `${sig3(ev.ed)} s`) +
      stat('Decay half-time t<sub>&frac12;</sub>', ev.cm && ev.cm.th != null ? `${fmt(ev.cm.th, 1)} min` : '&mdash;') +
      stat('Decay model', !ev.cm ? '&mdash;' : ev.cm.kind === 'PL' ? `power law, &alpha; = ${fmt(ev.cm.p[4], 2)}` +
        (ev.cm.p[4] > 14.9 ? ' <span class="sub">(~exponential)</span>' : '') :
        `double exponential <span class="sub">(${fmt(ev.cm.p[3] * 60, 0)} and ${fmt(ev.cm.p[4] * 60, 0)} min, slow part ${fmt(100 * ev.cm.p[5], 0)}%)</span>`) +
      stat('Rise (peak &minus; t<sub>0</sub>)', `${fmt(ev.rise, 0)} min`) +
      stat('Components', ev.cm && (ev.n_comp || ev.n_marg) ? ev.cm.comps.filter(c => c.kept).map(c =>
        `<span class="nowrap">${c.d >= 0 ? '+' : '&minus;'}${fmt(Math.abs(c.d), 2)} h${c.sig ? '' : ' (marginal)'}</span> <span class="sub">(${fmt(100 * c.a, 0)}% of peak, ` +
        `${fmt(100 * c.f, 0)}% of flux, FWHM ${fmt(c.fwhm * 60, 0)} min, &Delta;&chi;&sup2; ${fmt(c.dchi2, 0)})</span>`).join('<br>') : 'none') +
      stat('Detection', ev.loc.length ? ev.loc.map(L => L.cut == null ? '&mdash;' :
        `<span class="nowrap">S${ev.s} ${L.cam}/${L.ccd} &middot; cut ${L.cut} &middot; obj ${L.obj} &middot; event ${L.eid}</span>`).join('<br>') : '&mdash;') +
      stat('Localisation, 3&sigma; radius', ev.loc.length ? ev.loc.map(L => `${fmt(R3(L) * 3600, 1)}&Prime;`).join(', ') : '&mdash;') +
      stat('Catalogue entr' + (ev.loc.length > 1 ? 'ies' : 'y'), ev.loc.map(L => `<span class="sub">${TF.esc(L.name)}</span>`).join('<br>') || '&mdash;');
  }

  // ---------------- flare table ----------------
  const COLS = [['#', e => e.k + 1], ['Peak (MJD)', e => e.tpk.toFixed(3)], ['Sector', e => e.s], ['Class', e => TF.tag(e.cls)],
    ['Comp.', e => `${e.n_comp || 0}` + (e.n_marg ? ` <span class="sub">(+${e.n_marg})</span>` : '')], ['S/N', e => fmt(e.snr, 0)], ['&Delta;F/F', e => e.amp == null ? '&mdash;' : sig3(e.amp)],
    ['ED (s)', e => e.ed == null ? '&mdash;' : sig3(e.ed)], ['t<sub>&frac12;</sub> (min)', e => fmt(e.thalf, 1)],
    ['Rise (min)', e => fmt(e.rise, 0)], ['p<sub>Flare</sub>', e => fmt(pFlare(e), 2)], ['Tier', e => e.tier]];
  function renderTable() {
    $('ftable').innerHTML = `<thead><tr>${COLS.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>` +
      visible().map(e => `<tr class="click${e.k === SEL ? ' sel' : ''}" data-k="${e.k}" tabindex="0">` +
                         `${COLS.map(c => `<td>${c[1](e)}</td>`).join('')}</tr>`).join('') + '</tbody>';
    const n2 = EV.length - visible().length;
    $('fhidden').textContent = n2 ? `${n2} secondary flare${n2 > 1 ? 's' : ''} hidden.` : '';
  }
  $('ftable').addEventListener('click', e => { const tr = e.target.closest('tr[data-k]'); if (tr) select(+tr.dataset.k, true); });
  $('ftable').addEventListener('keydown', e => {
    const tr = e.target.closest('tr[data-k]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(+tr.dataset.k, true); }
  });

  function select(k, zoom, fromUser = true) {
    SEL = k;
    const ev = EV[k];
    if (!VIEW || !inView(VIEW, ev)) drawOverview(viewOf(ev.s), false);      // on another sector's tab: go to this one
    if (zoom) zoomTo(ev); else OV.redraw(false);
    drawFlare(ev);
    showStats(ev);
    for (const tr of $('ftable').querySelectorAll('tr[data-k]')) tr.classList.toggle('sel', +tr.dataset.k === k);
    skySelect(ev);
    if (fromUser) { const u = new URL(location.href); u.searchParams.set('f', k + 1); history.replaceState(null, '', u); }
  }
  const brightest = list => list.reduce((b, e) => (b == null || (e.snr ?? -1) > (b.snr ?? -1)) ? e : b, null);

  // ---------------- tabs, toggles, downloads, start ----------------
  function renderTabs() {
    const vis = visible(), count = n => `${n} flare${n === 1 ? '' : 's'}`;
    const key = VIEW ? String(VIEW.key) : '';
    $('tabs').innerHTML = (MULTI ? [`<button type="button" data-s="all" aria-pressed="${key === 'all'}">All sectors &middot; ${count(vis.length)}</button>`] : [])
      .concat(S.sectors.map(s => `<button type="button" data-s="${s.s}" aria-pressed="${key === String(s.s)}">` +
                                 `S${s.s} &middot; ${count(vis.filter(e => e.s === s.s).length)}</button>`)).join('');
  }
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-s]'); if (!b) return;
    drawOverview(b.dataset.s === 'all' ? viewAll() : viewOf(+b.dataset.s), false);
  });
  $('resid').addEventListener('change', () => drawOverview(VIEW, true));
  $('subper').addEventListener('change', () => drawOverview(VIEW, true));
  $('showbase').addEventListener('change', () => OV.setSeries(1, {show: $('showbase').checked}));
  $('subfit').addEventListener('change', () => { if (SEL != null) drawFlare(EV[SEL], false); });
  $('showfeat').addEventListener('change', () => { if (SEL != null) drawFlare(EV[SEL], true); });
  $('show2').addEventListener('change', () => {
    renderTabs(); renderTable(); skyAll();
    if (SEL != null && !visible().some(e => e.k === SEL)) {       // the selected flare was just hidden
      drawOverview(VIEW, true);
      select(brightest(visible()).k, false, false);
    } else drawOverview(VIEW, true);
  });
  // charts follow their containers (window resizes, the browser pane, the mobile layout switch)
  const fit = () => {
    if (OV && Math.abs(OV.width - $('overview').clientWidth) > 1) OV.setSize({width: $('overview').clientWidth, height: 300});
    if (FC && Math.abs(FC.width - $('flarechart').clientWidth) > 1) FC.setSize({width: $('flarechart').clientWidth, height: 300});
  };
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(fit); ro.observe($('overview')); ro.observe($('flarechart')); }
  window.addEventListener('resize', fit);

  const csv = ['flare,sector,peak_mjd,start_mjd,t0_mjd,end_mjd,class,tier,p_flare,n_components,n_marginal,snr,amplitude,ed_s,t_half_min,alpha,rise_min,catalogue_names,camera,ccd,cut,objid,eventid']
    .concat(EV.map(e => [e.k + 1, e.s, e.tpk, e.start, e.t0, e.end, e.cls, e.tier, pFlare(e) ?? '', e.n_comp || 0, e.n_marg || 0, e.snr, e.amp ?? '', e.ed ?? '',
      e.thalf ?? '', e.fit ? e.fit.alpha : '', e.rise, '"' + e.loc.map(L => L.name).join('; ') + '"',
      ...['cam', 'ccd', 'cut', 'obj', 'eid'].map(c => '"' + e.loc.map(L => L[c] ?? '').join('; ') + '"')].join(','))).join('\n');
  const blob = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  $('dl').innerHTML = `<a href="${blob}" download="gaia_dr3_${S.id}_flares.csv">This star's flares (CSV)</a>` +
    `<a href="${dataURL}" download="gaia_dr3_${S.id}.json.gz">Light-curve data behind this page (gzipped JSON: every 10-minute frame with its baseline and noise)</a>`;

  if (!EV.some(e => e.tier !== 'gold')) $('show2wrap').hidden = true;
  if (PERIODIC) {
    $('residlabel').textContent = ' subtract spline baseline';
    if (S.sectors.some(s => s.p_disp)) {        // rotation followed by the fit's spline: split afterwards, for display
      $('subperwrap').lastChild.textContent = ' subtract periodic baseline (approx.)';
      $('subperwrap').title = 'This star rotates slowly enough that the baseline fit follows it with its spline. ' +
        'For display, that baseline is split into a smooth trend and two harmonics at the rotation period.';
    }
  } else $('subperwrap').hidden = true;     // nothing to hide on this star
  const f0 = parseInt(P.get('f') || '', 10);
  if (f0 >= 1 && f0 <= EV.length && EV[f0 - 1].tier !== 'gold') $('show2').checked = true;   // linked to a secondary flare
  const startEv = (f0 >= 1 && f0 <= EV.length) ? EV[f0 - 1] : brightest(visible());
  VIEW = MULTI ? viewAll() : viewOf(startEv.s);
  renderTabs();
  renderTable();
  drawOverview(VIEW, false);
  select(startEv.k, f0 >= 1, false);
})();
