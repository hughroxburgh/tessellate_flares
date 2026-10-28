// Star page: one template for every star, filled from the star's record in a data shard (TF.getStar).
// Needs common.js (TF), uPlot and Aladin Lite (both from CDNs; the page still works without Aladin).
(async function () {
  const $ = id => document.getElementById(id);
  const CSS = getComputedStyle(document.documentElement);
  const C = name => CSS.getPropertyValue(name).trim();
  const P = new URLSearchParams(location.search);
  const raw = (P.get('id') || '').trim().replace(/ /g, '+');      // a '+' in a J-name arrives as a space unless encoded
  const id = /^J/i.test(raw) ? raw.toUpperCase().replace(/[^J0-9.+\-_]/g, '') : raw.replace(/\D/g, '');   // silver: J-name
  const fmt = TF.fmt, sig3 = TF.sig3;

  function fail(msg) {
    $('main').innerHTML = `<a class="home" href="index.html">&larr; Catalogue</a>
      <p class="eyebrow">TESSELLATE flare star</p><h1>Not Found</h1>
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
  const SILVER = S.kind === 'silver';                 // a silver source: no single confident Gaia host
  const MAIN = new Set(['gold', 'ambiguous', 'silver']);   // shown without 'secondary flares' ticked
  const PERIODIC = S.sectors.some(s => s.p);       // baseline has a periodic (rotation) part to subtract separately
  // flux units: mJy (TESS band, each sector's own zero point) when every sector is calibrated, else e-/s -- never mixed
  const MJY = S.sectors.length > 0 && S.sectors.every(s => s.mjy != null);
  const UNIT = MJY ? 'mJy' : 'e⁻/s', UNIT_H = MJY ? 'mJy' : 'e&#8315;/s';
  const KU = new Map(S.sectors.map(s => [s.s, MJY ? s.mjy : 1]));      // display units per e-/s, by sector
  const fU = v => MJY ? (Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3)) : v.toFixed(1);
  const sci = v => { if (v == null) return '&mdash;'; const e = Math.floor(Math.log10(v)); return `${(v / 10 ** e).toFixed(2)}&times;10<sup>${e}</sup>`; };
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
  document.title = `${SILVER ? 'Silver source ' : 'Gaia DR3 '}${S.id} — TESSELLATE Flare Catalogue`;
  $('name').innerHTML = SILVER ? `<span class="mono">${S.id}</span> <span class="tag silver" style="vertical-align:4px">silver source</span>`
                              : `Gaia DR3 <span class="mono">${S.id}</span>`;
  const sgn = v => (v >= 0 ? '+' : '&minus;') + Math.abs(v).toFixed(5);
  $('subtitle').innerHTML = `RA ${S.ra.toFixed(5)}&deg;, Dec ${sgn(S.dec)}&deg; &middot; ` +
    `${EV.length} flare${EV.length === 1 ? '' : 's'} in TESS sector${MULTI ? 's' : ''} ` +
    TF.ranges(S.sectors.map(s => s.s));

  // ---------------- state ----------------
  let SEL = null, VIEW = null, OV = null, FC = null;
  const showSecondary = () => $('show2').checked;
  const visible = () => EV.filter(e => showSecondary() || MAIN.has(e.tier));   // ambiguous / silver count as main

  // ---------------- info panel ----------------
  const FC_H = 320;            // flare chart height: with the detection rows under it, level with the stats beside it
  const stat = (l, v) => `<div class="stat-row"><span class="stat-label">${l}</span><span class="stat-value">${v}</span></div>`;
  const nComplex = EV.filter(e => e.cls === 'complex').length;
  const nExtra = EV.reduce((a, e) => a + (e.n_comp || 0), 0);
  const eds = EV.map(e => e.ed).filter(v => v != null);
  const ens = EV.map(e => e.en).filter(v => v != null);
  let rot = '&mdash;';
  if (S.prot != null) rot = `${S.prot.toFixed(3)} d <span class="sub">(LS power ${fmt(S.prot_power, 2)})</span>`;
  else if (S.prot_cand != null) rot = `none significant <span class="sub">(best ${S.prot_cand.toFixed(2)} d, power ${fmt(S.prot_power, 2)})</span>`;
  // no rotation period from the periodogram, but the baseline fit chose a periodic term of its own
  const PFIT = S.prot == null && S.baseline && S.baseline.periodic && S.baseline.P_fit != null ? S.baseline.P_fit : null;
  if (PFIT != null) rot = (S.prot_cand != null ? rot : 'none significant') +
    ` <span class="sub">(baseline fit uses ${PFIT.toFixed(3)} d)</span>`;
  // a silver source: its candidate Gaia hosts in place of the star's Gaia properties
  const WHY = {pair: 'two Gaia stars fit the flare positions, neither confidently', group: 'three or more Gaia stars fit the flare positions',
               lone: 'one Gaia star nearby, but the flares are not confidently on it'};
  const silverHosts = () => `<p class="sec">Candidate hosts (Gaia DR3)</p>` +
    `<table class="sect"><thead><tr><th>Gaia DR3</th><th><em>G</em></th><th>BP&minus;RP</th><th>Parallax (mas)</th><th>Probability</th></tr></thead><tbody>` +
    (S.cands || []).map(k => `<tr><td><span class="mono">${TF.esc(k.i)}</span>` +
      (k.gold ? `<br><a class="sub" href="${TF.starURL(k.i)}">a gold flare star</a>` : '') +
      (k.dem ? '<br><span class="sub">not gold: ambiguous area</span>' : '') + (k.i === S.target ? '<br><span class="sub">light curve measured here</span>' : '') +
      `</td><td>${fmt(k.G, 2)}</td><td>${fmt(k.c, 2)}</td><td>${fmt(k.plx, 2)}</td>` +
      `<td><span class="wbar" style="width:${Math.round(50 * (k.w || 0))}px"></span>${fmt(k.w, 2)}</td></tr>`).join('') + '</tbody></table>' +
    `<p class="hint">Probability: the chance this Gaia star is the host, averaged over the source's flares (a gold flare star needs &ge; 0.9).</p>` +
    stat('Why silver', WHY[S.why] || TF.esc(S.why || '&mdash;'));
  $('info').innerHTML = (SILVER ? silverHosts() :
    `<p class="sec">Star (Gaia DR3)</p>` +
    stat('<em>G</em>', fmt(S.G, 2)) +
    stat('BP &minus; RP', fmt(S.bprp, 2)) +
    stat('Neighbour contamination', S.contam == null ? '&mdash;' :
         `${fmt(S.contam, 2)} <span class="sub">(neighbours / star, 3&times;3 px)</span>`) +
    stat('Variable-star catalogue', S.var_type && S.var_type !== '-' ? TF.esc(S.var_type) : 'none') +
    stat('Distance', S.dist == null ? '&mdash;' :
         `${fmt(S.dist, 1)} pc <span class="sub">(parallax ${fmt(S.plx, 3)} &plusmn; ${fmt(S.plx_e, 3)} mas)</span>`) +
    stat('Absolute <em>G</em>', fmt(S.absG, 2)) +
    stat('T<sub>eff</sub> <span class="sub">(GSP-Phot)</span>', S.teff == null ? '&mdash;' : `${fmt(S.teff, 0)} K`) +
    stat('Tangential velocity', S.vtan == null ? '&mdash;' : `${fmt(S.vtan, 1)} km/s`) +
    stat('RUWE', fmt(S.ruwe, 2) + (S.ruwe != null && S.ruwe > 1.4 ? ' <span class="sub">(&gt; 1.4: possible binary)</span>' : ''))) +
    `<p class="sec">TESSELLATE</p>` +
    // one row per sector: where the star sits, its TESSELLATE objects there, its flares, its quiescent flux density
    `<table class="sect"><thead><tr><th>Sector</th><th>Camera</th><th>CCD</th><th>Cut</th><th>Object</th><th>Flares</th>` +
    `<th title="quiescent flux density, TESS band">F<sub>q</sub> (${UNIT_H})</th></tr></thead><tbody>` +
    S.sectors.map(s => {
      const n = EV.filter(e => e.s === s.s).length, dash = '<td class="none">&ndash;</td>';
      return `<tr${n ? '' : ' class="quiet"'}><td>${s.s}</td>` +
        (s.cam == null ? dash + dash + dash : `<td>${s.cam}</td><td>${s.ccd}</td><td>${s.cut}</td>`) +
        (s.obj && s.obj.length ? `<td>${s.obj.join(', ')}</td>` : dash) + `<td>${n}</td>` +
        (s.fq == null ? dash : `<td>${sig3(s.fq * KU.get(s.s))}</td>`) + '</tr>';
    }).join('') + '</tbody></table>' +
    stat('Observing time', `${fmt(S.obs_days, 1)} d`) +
    stat('Flares', `${EV.length} <span class="sub">(${SILVER ? EV.filter(e => e.tier === 'silver').length + ' confident'
      : EV.filter(e => e.tier === 'gold').length + ' gold'}${EV.some(e => e.tier === 'ambiguous') ? `, ${EV.filter(e => e.tier === 'ambiguous').length} ambiguous` : ''})</span>`) +
    stat('Flare rate', `${fmt(S.rate, 3)} per day`) +
    stat('Complex flares', `${nComplex}` + (nExtra ? ` <span class="sub">(${nExtra} significant extra component${nExtra > 1 ? 's' : ''})</span>` : '')) +
    stat('Largest flare', ens.length ? `${sci(Math.max(...ens))} erg <span class="sub">(ED ${sig3(Math.max(...eds))} s)</span>`
                                      : eds.length ? `ED ${sig3(Math.max(...eds))} s` : '&mdash;') +
    stat('Rotation period', rot) +
    stat('Quiescent magnitude <span class="sub">(TESS band, AB)</span>', fmt(S.mag_t, 2)) +
    stat('Quiescent luminosity <span class="sub">(TESS band)</span>', S.Lq == null ? '&mdash;' : `${sci(S.Lq)} erg/s`) +
    `<div class="links"><a href="https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${S.ra}+${S.dec}&amp;Radius=10&amp;Radius.unit=arcsec" target="_blank" rel="noopener">SIMBAD</a>` +
    `<a href="https://vizier.cds.unistra.fr/viz-bin/VizieR-4?-source=I/355/gaiadr3&amp;${SILVER ? `-c=${S.ra}%20${S.dec}&amp;-c.rs=30` : `Source=${S.id}`}" target="_blank" rel="noopener">Gaia DR3 (VizieR)</a></div>`;

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
    host.addSources(SILVER ? (S.cands || []).filter(k => k.r != null).map(k => A.source(k.r, k.d, {name: `Gaia DR3 ${k.i}`}))
                           : [A.source(S.ra, S.dec, {name: `Gaia DR3 ${S.id}`})]);
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
  const FONT = '11px "Azeret Mono", ui-monospace, monospace', LFONT = '12px "Instrument Sans", system-ui, sans-serif';
  const axis = (label, size) => ({label, labelSize: 20, labelFont: LFONT, font: FONT, size, stroke: C('--text-dim'),
    grid: {stroke: C('--hairline'), width: 1}, ticks: {stroke: C('--panel-border'), width: 1}});
  // right-hand axis in TESS count rate (e-/s) for a plot drawn in mJy: k = mJy per e-/s; ticks at round e-/s values.
  // approx: the plot spans sectors whose zero points differ, so k is their median
  function countsAxis(k, approx) {
    const nice = x => { const p = 10 ** Math.floor(Math.log10(x)), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
    let step = 1;
    return Object.assign(axis(`${approx ? '≈ ' : ''}TESS count rate (e⁻/s)`, 64), {
      side: 1, scale: 'y', grid: {show: false},
      splits: (u, ai, lo, hi) => {
        if (!(hi > lo)) return [];
        step = nice((hi - lo) / k / 5);
        const out = [];
        for (let e = Math.ceil(lo / k / step) * step; e <= hi / k + 1e-9; e += step) out.push(e * k);
        return out;
      },
      values: (u, splits) => splits.map(v => { const e = v / k, d = Math.max(0, -Math.floor(Math.log10(step)));
                                             return (Math.abs(e) < step / 1e6 ? 0 : e).toFixed(d); }),
    });
  }
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
  // a lone frame far off the baseline whose neighbours are normal: a bad difference image (e.g. the last frames of
  // S30 camera 4 throw every star there), not light from the star. Hidden from the plots; catalogued flares never are.
  const SPIKE_Z = 25, SPIKE_NB_Z = 5;
  function spikes(s, fl) {
    const n = s.f.length, r = new Array(n).fill(null), out = new Array(n).fill(false), v = [];
    for (let i = 0; i < n; i++) if (s.f[i] != null && s.b[i] != null) { r[i] = s.f[i] - s.b[i]; v.push(r[i]); }
    if (v.length < 20) return out;
    v.sort((a, b) => a - b);
    const med = v[v.length >> 1], dev = v.map(x => Math.abs(x - med)).sort((a, b) => a - b);
    const sig = 1.4826 * dev[dev.length >> 1];
    if (!(sig > 0)) return out;
    const z = i => r[i] == null ? null : Math.abs(r[i] - med) / sig;
    for (let i = 0; i < n; i++) {
      if (fl[i] || !(z(i) > SPIKE_Z)) continue;
      const nb = [z(i - 1), z(i + 1)].filter(x => x != null);
      out[i] = nb.length > 0 && nb.every(x => x < SPIKE_NB_Z);
    }
    return out;
  }
  let HIDDEN = 0;
  function viewData(V, sub, evs) {
    const X = [], Bs = [], F = [], R = [];
    HIDDEN = 0;
    V.segs.forEach((g, j) => {
      if (j > 0) { X.push((V.segs[j - 1].p1 + g.p0) / 2); Bs.push(null); F.push(null); R.push(null); }
      const s = g.sec, n = s.f.length, fl = new Array(n).fill(false);
      for (const e of evs) {
        if (e.s !== s.s) continue;
        const i0 = Math.max(0, Math.floor((e.start - s.t) / s.dt + 0.5) - 1);
        const i1 = Math.min(n - 1, Math.floor((e.end - s.t) / s.dt + 0.5) + 1);
        for (let i = i0; i <= i1; i++) fl[i] = true;
      }
      const sp = spikes(s, fl);
      for (let i = 0; i < n; i++) {
        const f = sp[i] ? null : s.f[i], b = s.b[i], p = s.p ? s.p[i] : 0;
        if (sp[i]) HIDDEN++;
        let fv = null, bv = null;
        if (b != null && p != null) {
          const off = (sub.spline ? b - p : 0) + (sub.periodic ? p : 0);       // what is subtracted
          bv = (b - off) / 10 * KU.get(s.s);
          if (f != null) fv = (f - off) / 10 * KU.get(s.s);
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
    for (const e of evs) {                    // edges half a frame outside the first / last frame: between data points
      const half = e.w ? e.w.dt / 2 : 0;
      const a = u.valToPos(toPlot(V, Math.min(e.start, e.tpk) - half, e.s), 'x', true);
      const b = u.valToPos(toPlot(V, Math.max(e.end, e.tpk) + half, e.s), 'x', true);
      ctx.fillStyle = e.k === SEL ? `rgba(${C('--band-rgb')},0.32)` : `rgba(${C('--band-rgb')},0.15)`;
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
      ctx.fillStyle = `rgba(${C('--ink-rgb')},0.035)`;
      ctx.fillRect(Math.max(a, L), top, Math.min(b, Rr) - Math.max(a, L), bot - top);
      const m = (a + b) / 2, h = 7 * dpr;
      ctx.strokeStyle = C('--text-dim'); ctx.lineWidth = 1.4 * dpr;
      for (const d of [-3.5, 3.5]) {
        ctx.beginPath(); ctx.moveTo(m + (d - 3) * dpr, bot + h); ctx.lineTo(m + (d + 3) * dpr, bot - h); ctx.stroke();
      }
    }
    if (V.segs.length > 1) {
      ctx.fillStyle = C('--text-faint'); ctx.font = `${Math.round(10 * dpr)}px "Azeret Mono", ui-monospace, monospace`;
      ctx.textBaseline = 'top';
      for (const g of V.segs) {
        const x = u.valToPos(g.p0, 'x', true);
        if (x >= L - 1 && x < Rr - 30 * dpr) ctx.fillText(`S${g.s}`, Math.max(x, L) + 4 * dpr, top + 4 * dpr);
      }
    }
    ctx.restore();
  }
  // flares of a silver source that lists this gold star as a candidate host (another star is the likelier host)
  function shadeSilver(u, V) {
    const M = S.silver || []; if (!M.length) return;
    const ctx = u.ctx, top = u.bbox.top, h = u.bbox.height, dpr = devicePixelRatio || 1;
    ctx.save(); clip(u); ctx.font = `${10 * dpr}px "Azeret Mono", monospace`; ctx.lineWidth = 1.2 * dpr;
    for (const m of M) {
      if (!V.segs.some(g => g.s === m.s)) continue;
      const x = u.valToPos(toPlot(V, m.t, m.s), 'x', true);
      ctx.fillStyle = 'rgba(212,205,207,0.10)'; ctx.fillRect(x - 3 * dpr, top, 6 * dpr, h);
      ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.strokeStyle = 'rgba(212,205,207,0.8)';
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + h); ctx.stroke();
      ctx.fillStyle = 'rgba(212,205,207,0.9)'; ctx.fillText('silver', x + 4 * dpr, top + 12 * dpr);
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
      axes: [timeAxis(V), axis(`${ylab} (${UNIT})`, 64)].concat(MJY ? (() => {
        const ks = [...new Set(V.segs.map(g => KU.get(g.sec.s)))].sort((a, b) => a - b);
        const k = ks[Math.floor(ks.length / 2)];
        return [countsAxis(k, ks.length > 1 && ks[ks.length - 1] / ks[0] > 1.001)];
      })() : []),
      series: [{},
               {stroke: C('--c-base'), width: 1.8, points: {show: false}, show: $('showbase').checked},   // baseline (zero when subtracted)
               {stroke: `rgba(${C('--data-rgb')},0.55)`, width: 1, points: {size: 3, fill: C('--c-data'), stroke: C('--c-data')}},
               {stroke: C('--c-flare'), width: 1.8, points: {size: 4, fill: C('--c-flare'), stroke: C('--c-flare')}}],   // flares
      cursor: CURSOR(2), legend: {show: false},
      hooks: {drawClear: [u => shadeFlares(u, V, evs), u => shadeSilver(u, V)], draw: [u => drawGaps(u, V)],
              setCursor: [readout(el, 2, (x, f) => { const re = toReal(V, x);        // counts: this point's own sector
                const c = MJY ? ` (${(f / KU.get(re.seg.s)).toFixed(1)} e⁻/s)` : '';
                return `t = ${re.t.toFixed(4)}, f = ${fU(f)} ${UNIT}${c}`; })]},
    }, viewData(V, sub, evs), el);
    $('spikenote').textContent = HIDDEN ? ` ${HIDDEN === 1 ? 'One isolated frame' : HIDDEN + ' isolated frames'} far off the ` +
      `baseline with normal neighbours (bad images, not the star) ${HIDDEN === 1 ? 'is' : 'are'} not shown.` : '';
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

  // ---- Gaussian-convolved shapes (Mendoza et al. 2022 form) ----
  // gResp(u, C, tau) = Gaussian exp(-u^2/C^2) convolved with exp(-u/tau) (u >= 0), no constant factor; erfc from the
  // Numerical Recipes Chebyshev fit (rel. error < 1.2e-7) folded into the exponent so nothing overflows.
  const erfcPoly = t => -1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 +
    t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  function gResp(u, C, tau) {
    const z = -u / C + C / (2 * tau), e = -u / tau + (C / (2 * tau)) ** 2;
    const t = 1 / (1 + 0.5 * Math.abs(z)), ec = t * Math.exp(e - z * z + erfcPoly(t));     // exp(e) erfc(|z|)
    return z >= 0 ? ec : 2 * Math.exp(e) - ec;
  }
  const peakOf = (f, C, tmax) => { let m = 1e-300; for (let i = 0; i < 400; i++) m = Math.max(m, f(-2 * C + (tmax + 2 * C) * i / 399)); return m; };
  function g2eMain(p) {          // p = [t0, A, C, tau1, dtau, F2]
    const C = p[2], t1 = p[3], t2 = p[3] + p[4], F = p[5];
    const f = u => (1 - F) * gResp(u, C, t1) + F * gResp(u, C, t2), pk = peakOf(f, C, 3 * t1 + 3 * C);
    return u => f(u) / pk;
  }
  function g1eComp(q) {          // q = [tc, Ac, C, td]
    const f = u => gResp(u, q[2], q[3]), pk = peakOf(f, q[2], 3 * q[3] + 3 * q[2]);
    return u => f(u) / pk;
  }
  function compModel(xh, cm, cadh, inst) {           // inst: instantaneous curves (no exposure averaging)
    const N_SUB = 15, p = cm.p, G = cm.kind === 'G2E';
    const g2 = G ? g2eMain(p) : null;
    const mainShape = G ? g2 : (u => u < 0 ? riseShape(u, p[2]) :
      cm.kind === 'PL' ? Math.pow(1 + u / p[3], -p[4]) : (1 - p[5]) * Math.exp(-u / p[3]) + p[5] * Math.exp(-u / p[4]));
    const avg = f => xh.map(x => { if (inst) return f(x); let a = 0; for (let k = 0; k < N_SUB; k++) a += f(x + ((k + 0.5) / N_SUB - 0.5) * cadh); return a / N_SUB; });
    const main = avg(t => p[1] * mainShape(t - p[0]));
    const kept = cm.comps.filter(c => c.kept);
    const comps = kept.map(c => { const s = G ? g1eComp(c.p) : (u => u < 0 ? riseShape(u, c.p[2]) : Math.exp(-u / c.p[3]));
                                  return avg(t => c.p[1] * s(t - c.p[0])); });
    const tot = main.map((v, i) => v + comps.reduce((a, c) => a + c[i], 0));
    const pad = inst ? 0 : cadh / 2, on = q => q[0] - (G ? 3 : 1) * q[2];
    const from = (arr, t0) => arr.map((v, i) => xh[i] < t0 - pad ? null : v);       // null before the onset
    const first = Math.min(on(p), ...kept.map(c => on(c.p)));                     // the total starts with its earliest part
    return {main: from(main, on(p)), comps: comps.map((c, j) => from(c, on(kept[j].p))), tot: from(tot, first),
            sig: kept.map(c => c.sig)};
  }
  // flare features in the inset: one colour for all of them, named inside their shaded regions
  const FEAT = `rgba(${C('--band-rgb')},0.16)`, FEAT_TEXT = C('--feat-text');
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
      {stroke: `rgba(${C('--data-rgb')},0.30)`, width: 1, spanGaps: true,
       points: {show: true, size: 3.5, space: 0, fill: C('--c-pts'), stroke: C('--c-pts')}},
      {stroke: showFit ? 'rgba(0,0,0,0)' : C('--c-flare'), width: 2.2, spanGaps: true,     // with the fit on, the fit is the line
       points: {show: true, size: 5, space: 0, fill: C('--c-flare'), stroke: C('--c-flare')}}];
    if (showFit) {                                      // main flare (cobalt) and each significant component (gold)
      const N = 2000, x0 = ev.cm.x0, x1 = ev.cm.x1;
      const xm = Array.from({length: N}, (_, i) => x0 + (x1 - x0) * i / (N - 1));
      const inst = $('hires') && $('hires').checked;
      const cmod = compModel(xm, ev.cm, w.dt * 24, inst);
      data = uPlot.join([[xs, ys, yf], [xm, cmod.tot, cmod.main, ...cmod.comps]]);
      series.push({stroke: `rgba(${C('--ink-rgb')},0.85)`, width: 1.4, spanGaps: false, points: {show: false}},   // total model
                  {stroke: C('--c-base'), width: 2.2, dash: [7, 4], spanGaps: false, points: {show: false}},
                  ...cmod.sig.map(sig => sig ? {stroke: `rgb(${C('--gold-rgb')})`, width: 2.2, dash: [7, 4], spanGaps: false, points: {show: false}}    // significant
                                             : {stroke: `rgba(${C('--gold-rgb')},0.6)`, width: 1.4, dash: [2, 4], spanGaps: false, points: {show: false}}));  // marginal
    } else data = [xs, ys, yf];
    const KD = subFit ? 1 : KU.get(ev.s);               // display units (sigma units are left alone)
    if (KD !== 1) data = data.map((a, i) => i === 0 ? a : a.map(v => v == null ? v : v * KD));
    const showFeat = false;                             // (the old rule-based feature shading is retired)
    const cadh = w.dt * 24;
    FC = new uPlot({
      width: el.clientWidth, height: FC_H,
      scales: {x: {time: false}},
      axes: [axis('hours from the peak frame', 40), axis(subFit ? 'residual from the model (σ)' : `flux − baseline (${UNIT})`, 64)]
        .concat(MJY && !subFit ? [countsAxis(KU.get(ev.s), false)] : []),
      series, cursor: CURSOR(1), legend: {show: false},
      hooks: {
        setCursor: [readout(el, 1, (x, f) => `t = ${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)} h, f = ` +
                                          (subFit ? `${f.toFixed(1)}σ` : `${fU(f)} ${UNIT}` +
                                           (MJY ? ` (${(f / KD).toFixed(1)} e⁻/s)` : '')))],
        drawClear: [u => {
          const ctx = u.ctx, top = u.bbox.top, h = u.bbox.height;
          ctx.save(); clip(u);
          const dpr = devicePixelRatio || 1;
          ctx.font = `${Math.round(11 * dpr)}px "Instrument Sans", system-ui, sans-serif`;
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
          ctx.save(); clip(u); ctx.strokeStyle = `rgba(${C('--ink-rgb')},0.6)`; ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath(); ctx.moveTo(u.bbox.left, y0); ctx.lineTo(u.bbox.left + u.bbox.width, y0); ctx.stroke();
          ctx.restore();
        }],
        draw: [u => {                                                     // error bars
          const ctx = u.ctx;
          if (subFit) return;                                             // in sigma units every bar is +-1
          ctx.save(); clip(u); ctx.strokeStyle = `rgba(${C('--data-rgb')},0.40)`; ctx.lineWidth = devicePixelRatio || 1;
          const X = u.data[0], Y = u.data[1], x0 = u.scales.x.min, x1 = u.scales.x.max;
          for (let i = 0; i < X.length; i++) {
            if (Y[i] == null || !err.has(X[i]) || X[i] < x0 || X[i] > x1) continue;
            const x = u.valToPos(X[i], 'x', true), e = err.get(X[i]) * KD;
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

  // ---------------- fitted model parameters: one table row per part (main flare + each kept component) ----------------
  // Instantaneous unit-peak shape of a part, u in hours from its t0 / tc (as in compModel).
  function partShape(cm, q, isMain) {
    if (cm.kind === 'G2E') return isMain ? g2eMain(q) : g1eComp(q);
    if (!isMain) return u => u < 0 ? riseShape(u, q[2]) : Math.exp(-u / q[3]);
    return u => u < 0 ? riseShape(u, q[2]) :
      cm.kind === 'PL' ? Math.pow(1 + u / q[3], -q[4]) : (1 - q[5]) * Math.exp(-u / q[3]) + q[5] * Math.exp(-u / q[4]);
  }
  // [peak position (h from t0 / tc), FWHM (h)] of a unit-peak shape, on a grid from a to b hours
  function peakWidth(f, a, b) {
    const N = 6000, u = i => a + (b - a) * i / (N - 1), v = Array.from({length: N}, (_, i) => f(u(i)));
    let k = 0; for (let i = 1; i < N; i++) if (v[i] > v[k]) k = i;
    let i0 = k, i1 = k; while (i0 > 0 && v[i0 - 1] >= v[k] / 2) i0--; while (i1 < N - 1 && v[i1 + 1] >= v[k] / 2) i1++;
    return [u(k), u(i1) - u(i0)];
  }
  function compTable(ev) {
    const el = $('fcomp');
    if (!ev.cm || !ev.cm.p) { el.innerHTML = ''; return; }
    const cm = ev.cm, p = cm.p, G = cm.kind === 'G2E', PL = cm.kind === 'PL', K = KU.get(ev.s), m = v => v * 60;
    const kept = cm.comps.filter(c => c.kept);
    // shape columns by model kind: [header, main value (min or plain), component value]
    const cols = G ? [['C', m(p[2]), q => m(q[2])], ['&tau;<sub>fast</sub>', m(p[3]), q => m(q[3])],
                      ['&tau;<sub>slow</sub>', m(p[3] + p[4]), null], ['Slow', `${fmt(100 * p[5], 0)}%`, null]]
               : PL ? [['w', m(p[2]), q => m(q[2])], ['t<sub>s</sub>', m(p[3]), q => m(q[3])], ['&alpha;', fmt(p[4], 2), null]]
               : [['w', m(p[2]), q => m(q[2])], ['&tau;<sub>1</sub>', m(p[3]), q => m(q[3])],
                  ['&tau;<sub>2</sub>', m(p[4]), null], ['Slow', `${fmt(100 * p[5], 0)}%`, null]];
    const span = (q, isMain) => {                       // grid wide enough for the slowest decay of this part
      const lead = G ? 3 * q[2] : q[2], tail = isMain ? (G ? q[3] + q[4] : PL ? 20 * q[3] : Math.max(q[3], q[4])) : q[3];
      return [-lead, Math.min(48, 6 * tail + 3 * q[2])];
    };
    const row = (q, isMain, c) => {
      const [up, wd] = peakWidth(partShape(cm, q, isMain), ...span(q, isMain));
      return {t: q[0] + up, q, isMain, c, fwhm: isMain ? wd : (c.fwhm ?? wd),
              share: isMain ? 1 - kept.reduce((a, k) => a + (k.f || 0), 0) : c.f};
    };
    const rows = [row(p, true, null)].concat(kept.map(c => row(c.p, false, c)).sort((a, b) => a.t - b.t));
    const val = v => typeof v === 'number' ? fmt(v, v >= 100 ? 0 : 1) : v;
    let n = 1;
    const body = rows.map(r => {
      const name = r.isMain ? 'Main flare' : `Component ${++n}` + (r.c.sig ? '' : ' <span class="sub">(marginal)</span>');
      const sw = `<i class="sw" style="border-color:${r.isMain ? C('--c-base') : r.c.sig ? `rgb(${C('--gold-rgb')})` : `rgba(${C('--gold-rgb')},0.6)`}${!r.isMain && !r.c.sig ? ';border-top-style:dotted' : ''}"></i>`;
      const shape = cols.map(([, mv, cf]) => r.isMain ? val(mv) : cf ? val(cf(r.q)) : '&mdash;');
      return `<tr${!r.isMain && !r.c.sig ? ' class="quiet"' : ''}><td>${sw}${name}</td><td>${r.t >= 0 ? '+' : '&minus;'}${fmt(Math.abs(r.t), 2)}</td>` +
        `<td>${fU(r.q[1] * K)}</td><td>${r.share == null ? '&mdash;' : fmt(100 * r.share, 0) + '%'}</td><td>${fmt(m(r.fwhm), 1)}</td>` +
        shape.map(v => `<td>${v}</td>`).join('') + `<td>${r.isMain ? '&mdash;' : fmt(r.c.dchi2, 0)}</td></tr>`;
    }).join('');
    const head = ['Part', 't<sub>peak</sub> (h)', `Peak (${UNIT_H})`, 'Flux', 'FWHM'].concat(cols.map(([h]) => h), ['&Delta;&chi;&sup2;']);
    const what = G ? 'Each part is a Gaussian heating profile (width C) convolved with exponential cooling: two exponentials for the main flare (&tau;<sub>fast</sub>, &tau;<sub>slow</sub>; slow: the slow exponential&rsquo;s share), one for each extra component.'
                   : PL ? 'Main flare: a rise of width w into a power-law decay (scale t<sub>s</sub>, index &alpha;); extra components: the same rise into one exponential.'
                   : 'Main flare: a rise of width w into two exponentials (&tau;<sub>1</sub>, &tau;<sub>2</sub>; slow: the second&rsquo;s share); extra components: the same rise into one exponential.';
    el.innerHTML = `<p class="sec">Fitted model</p><div class="tablewrap"><table class="sect comp"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>` +
      `<tbody>${body}</tbody></table></div><p class="hint">${what} Times in minutes except t<sub>peak</sub>, each part&rsquo;s own maximum in hours from the brightest frame; ` +
      `flux: share of the flare&rsquo;s integrated flux. Peak and FWHM are the model at full time resolution, so a sharp peak comes out above the brightest 10-minute frame. Components with &Delta;&chi;&sup2; &gt; 20 are significant, 10&ndash;20 marginal.</p>`;
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
    const stack = (l, v) => `<div class="stat-row stack"><span class="stat-label">${l}</span><span class="stat-value">${v}</span></div>`;
    // two groups (Hugh): where TESSELLATE found it, then what the flare is like
    $('fstats').innerHTML =
      stack('Detection', ev.loc.length ? ev.loc.map(L => L.cut == null ? '&mdash;' :
        `<span>S${ev.s} &middot; cam&nbsp;${L.cam} &middot; ccd&nbsp;${L.ccd} &middot; cut&nbsp;${L.cut} &middot; obj&nbsp;${L.obj} &middot; event&nbsp;${L.eid}</span>`).join('<br>') : '&mdash;') +
      stat('Localisation, 3&sigma; radius', ev.loc.length ? ev.loc.map(L => `${fmt(R3(L) * 3600, 1)}&Prime;`).join(', ') : '&mdash;') +
      stat('Catalogue entr' + (ev.loc.length > 1 ? 'ies' : 'y'), ev.loc.map(L => `<span class="sub">${TF.esc(L.name)}</span>`).join('<br>') || '&mdash;') +
      stat('Peak frame', `MJD ${ev.tpk.toFixed(4)}<br><span class="sub">${TF.mjdToUTC(ev.tpk)} UTC</span>`) +
      stat('p<sub>Flare</sub> <span class="sub">(ML classifier)</span>', ev.loc.length ? ev.loc.map(L => fmt(L.p, 3)).join(', ') : '&mdash;') +
      stat('Tier', ev.amb ? `ambiguous position<br><span class="sub">host probability ${fmt(ev.amb.p, 2)} this star` +
        (ev.amb.nb ? `, ${fmt(ev.amb.q, 2)} Gaia DR3 ${TF.esc(ev.amb.nb)}` : '') + '</span>' : ev.tier.replace('_', ' ')) +
      `<hr class="split">` +
      stat('Class', `${TF.tag(ev.cls)}`) +
      `<p class="hint" style="margin:2px 0 6px">${reason(ev)}</p>` +
      stat('Peak S/N', fmt(ev.snr, 1)) +
      stat('Peak excess', ev.pkm != null && MJY ? `${sig3(ev.pkm)} mJy` : ev.pk != null ? `${sig3(ev.pk)} e&#8315;/s` : '&mdash;') +
      stat('Amplitude &Delta;F/F', ev.amp == null ? '&mdash;' : sig3(ev.amp)) +
      stat('Equivalent duration', ev.ed == null ? '&mdash;' : `${sig3(ev.ed)} s`) +
      stat('Energy <span class="sub">(TESS band)</span>', ev.en == null ? '&mdash;' : `${sci(ev.en)} erg`) +
      stat('Decay half-time t<sub>&frac12;</sub>', ev.cm && ev.cm.th != null ? `${fmt(ev.cm.th, 1)} min` : '&mdash;') +
      stat('Decay model', !ev.cm ? '&mdash;' : ev.cm.kind === 'G2E' ? 'Gaussian heating &otimes; two exponentials' :
        ev.cm.kind === 'PL' ? 'power law' + (ev.cm.p[4] > 14.9 ? ' <span class="sub">(~exponential)</span>' : '') : 'double exponential') +
      stat('Rise (peak &minus; t<sub>0</sub>)', `${fmt(ev.rise, 0)} min`) +
      // components count the main flare too (Hugh): a simple flare has 1; parameters in the table under the chart
      stat('Components', ev.cm && (ev.n_comp || ev.n_marg) ? `${1 + (ev.n_comp || 0)}` +
        (ev.n_marg ? ` <span class="sub">(+${ev.n_marg} marginal)</span>` : '') : `1 <span class="sub">(main flare only)</span>`);
    compTable(ev);
  }

  // ---------------- flare table ----------------
  const COLS = [['#', e => e.k + 1], ['Peak (MJD)', e => e.tpk.toFixed(3)], ['Sector', e => e.s], ['Class', e => TF.tag(e.cls)],
    ['Comp.', e => `${1 + (e.n_comp || 0)}` + (e.n_marg ? ` <span class="sub">(+${e.n_marg})</span>` : '')], ['S/N', e => fmt(e.snr, 0)], ['&Delta;F/F', e => e.amp == null ? '&mdash;' : sig3(e.amp)],
    ['ED (s)', e => e.ed == null ? '&mdash;' : sig3(e.ed)], ['Energy (erg)', e => sci(e.en)],
    ['t<sub>&frac12;</sub> (min)', e => fmt(e.thalf, 1)],
    ['Rise (min)', e => fmt(e.rise, 0)], ['p<sub>Flare</sub>', e => fmt(pFlare(e), 2)], ['Tier', e => e.tier]];
  function renderTable() {
    $('ftable').innerHTML = `<thead><tr>${COLS.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>` +
      visible().map(e => `<tr class="click${e.k === SEL ? ' sel' : ''}" data-k="${e.k}" tabindex="0">` +
                         `${COLS.map(c => `<td>${c[1](e)}</td>`).join('')}</tr>`).join('') + '</tbody>';
    const n2 = EV.length - visible().length;
    $('fhidden').textContent = n2 ? `${n2} secondary/recovered flare${n2 > 1 ? 's' : ''} hidden.` : '';
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
  if ($('hires')) $('hires').addEventListener('change', () => { if (SEL != null) drawFlare(EV[SEL], true); });
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
    if (FC && Math.abs(FC.width - $('flarechart').clientWidth) > 1) FC.setSize({width: $('flarechart').clientWidth, height: FC_H});
  };
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(fit); ro.observe($('overview')); ro.observe($('flarechart')); }
  window.addEventListener('resize', fit);
  // canvas text uses the web fonts: redraw once they have loaded
  if (document.fonts) document.fonts.ready.then(() => { if (OV) OV.redraw(); if (FC) FC.redraw(); });

  const csv = ['flare,sector,peak_mjd,start_mjd,t0_mjd,end_mjd,class,tier,p_flare,n_components,n_marginal,snr,peak_excess_mjy,amplitude,ed_s,energy_erg,t_half_min,alpha,rise_min,catalogue_names,camera,ccd,cut,objid,eventid']
    .concat(EV.map(e => [e.k + 1, e.s, e.tpk, e.start, e.t0, e.end, e.cls, e.tier, pFlare(e) ?? '', 1 + (e.n_comp || 0), e.n_marg || 0, e.snr, e.pkm ?? '', e.amp ?? '', e.ed ?? '', e.en ?? '',
      e.thalf ?? '', e.fit ? e.fit.alpha : '', e.rise, '"' + e.loc.map(L => L.name).join('; ') + '"',
      ...['cam', 'ccd', 'cut', 'obj', 'eid'].map(c => '"' + e.loc.map(L => L[c] ?? '').join('; ') + '"')].join(','))).join('\n');
  const blob = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  $('dl').innerHTML = `<a href="${blob}" download="gaia_dr3_${S.id}_flares.csv">This star's flares (CSV)</a>` +
    `<a href="${dataURL}" download="gaia_dr3_${S.id}.json.gz">Light-curve data behind this page (gzipped JSON: every 10-minute frame with its baseline and noise)</a>`;

  if ((S.silver || []).length) $('silvernote').innerHTML = ` Grey dashed lines: ${S.silver.length === 1 ? 'a flare' : S.silver.length + ' flares'} ` +
    `in this light curve that ${S.silver.length === 1 ? 'is' : 'are'} catalogued with a silver source, because another Gaia star is the more likely host: ` +
    S.silver.map(m => `<a href="${TF.starURL(m.id)}">${m.id}</a> (MJD ${m.t.toFixed(2)}; host probability ` +
      `${fmt(m.q, 2)} this star, ${fmt(m.bq, 2)} Gaia DR3 ${TF.esc(m.best)})`).join('; ') + '.';
  if (!EV.some(e => !MAIN.has(e.tier))) $('show2wrap').hidden = true;
  if (PERIODIC) {
    $('residlabel').textContent = ' subtract spline baseline';
    const Pb = S.prot != null ? S.prot : PFIT;
    if (Pb != null) $('subperwrap').lastChild.textContent = ` subtract periodic baseline (P = ${Pb.toFixed(3)} d)`;
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
