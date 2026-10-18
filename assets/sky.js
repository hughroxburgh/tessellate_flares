// Interactive sky map for the home page: the flare stars on a Mollweide map (default) or a globe, both seen from
// inside the sky (RA increases to the left). Mollweide: drag to pan, scroll / pinch to zoom. Globe: drag to rotate.
// Zoomed out it shows a density map (stars per cell, so 100k stars stay readable); zoomed in, each star is a dot sized
// by its number of flares and coloured by its flare rate -- hover for details, click to open its page. The grid is
// labelled in degrees and the cursor's RA / Dec is shown above the map; "Expand" opens it nearly full screen.
// Needs d3 v7 (index.html loads it from cdnjs) and common.js (TF).
const TFSky = (() => {
  const RAD = Math.PI / 180;
  const CELL = 2.0;                    // density cell size (deg)
  const K_POINTS_IN = 2.6, K_POINTS = 4.0;   // zoom where the dots start fading in / are fully shown
  const K_MAX = 120;
  const RAMP = ['#5b2a35', '#a33a4a', '#e8615f', '#ffa477', '#ffe2b8'];   // = the population figures' warm ramp
  const RATE_LO = -2.5, RATE_HI = 0;   // log10 flares per day mapped onto the ramp
  const STEPS = [0.5, 1, 2, 5, 10, 15, 30];  // grid spacings (deg); the finest one at least GRID_PX apart is used
  const GRID_PX = 70;

  // Mollweide (not in d3's core): x = 2 sqrt2 / pi lambda cos t, y = sqrt2 sin t, with 2t + sin 2t = pi sin phi
  function mollweideRaw(l, p) {
    let t = p;
    if (Math.abs(p) < Math.PI / 2 - 1e-9) {
      const k = Math.PI * Math.sin(p);
      for (let i = 0; i < 40; i++) {
        const d = (2 * t + Math.sin(2 * t) - k) / (2 + 2 * Math.cos(2 * t));
        t -= d;
        if (Math.abs(d) < 1e-10) break;
      }
    }
    return [2 * Math.SQRT2 / Math.PI * l * Math.cos(t), Math.SQRT2 * Math.sin(t)];
  }
  mollweideRaw.invert = (x, y) => {
    const t = Math.asin(Math.max(-1, Math.min(1, y / Math.SQRT2)));
    return [Math.PI * x / (2 * Math.SQRT2 * Math.cos(t)), Math.asin(Math.max(-1, Math.min(1, (2 * t + Math.sin(2 * t)) / Math.PI)))];
  };

  // the Galactic plane (b = 0) in equatorial coordinates (J2000)
  function galacticPlane() {
    const aG = 192.85948 * RAD, dG = 27.12825 * RAD, lN = 122.93192 * RAD, pts = [];
    for (let l = 0; l <= 360; l += 2) {
      const x = lN - l * RAD;
      const dec = Math.asin(Math.cos(dG) * Math.cos(x));
      const ra = aG + Math.atan2(Math.sin(x), -Math.sin(dG) * Math.cos(x));
      pts.push([-(((ra / RAD) % 360) + 360) % 360, dec / RAD]);
    }
    return {type: 'LineString', coordinates: pts};
  }

  // equal-area-ish cells: dec bands of CELL, each split into ~360 cos(dec) / CELL RA cells; each cell is a sky polygon
  // (d3 clips it at the map edge / horizon)
  function densityCells(stars) {
    const cells = new Map();
    stars.forEach((s, i) => {
      const band = Math.min(Math.floor((s.d + 90) / CELL), Math.floor(180 / CELL) - 1);
      const dc = -90 + (band + 0.5) * CELL, n = Math.max(1, Math.round(360 * Math.cos(dc * RAD) / CELL));
      const j = Math.min(n - 1, Math.floor(((s.r % 360) + 360) % 360 / 360 * n)), key = band * 100000 + j;
      let c = cells.get(key);
      if (!c) {
        const lo0 = -j * 360 / n, lo1 = -(j + 1) * 360 / n, la0 = -90 + band * CELL, la1 = la0 + CELL, lm = (lo0 + lo1) / 2;
        const ring = [[lo0, la0], [lm, la0], [lo1, la0], [lo1, la1], [lm, la1], [lo0, la1], [lo0, la0]];
        let poly = {type: 'Polygon', coordinates: [ring]};
        if (d3.geoArea(poly) > 2 * Math.PI) poly = {type: 'Polygon', coordinates: [ring.slice().reverse()]};
        cells.set(key, c = {lon: lm, lat: dc, n: 0, poly, idx: []});
      }
      c.n++; c.idx.push(i);
    });
    return [...cells.values()].sort((a, b) => a.n - b.n);
  }

  const fmtRA = v => `${+(((v % 360) + 360) % 360).toFixed(2)}°`;
  const fmtDec = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${+Math.abs(v).toFixed(2)}°`;

  function init(fig, rows) {
    if (typeof d3 === 'undefined' || !fig) return false;
    const stars = rows.filter(o => o.r != null && o.d != null);
    if (!stars.length) return false;
    const ramp = d3.interpolateRgbBasis(RAMP);
    const cells = densityCells(stars), maxN = Math.max(...cells.map(c => c.n)), lmax = Math.log10(maxN + 1);
    for (const c of cells) c.col = ramp(Math.log10(c.n + 1) / lmax);
    for (const s of stars) {                 // dot colour (flare rate) and size (flares), once
      const lr = s.rt > 0 ? Math.log10(s.rt) : RATE_LO;
      s._col = ramp(Math.max(0, Math.min(1, (lr - RATE_LO) / (RATE_HI - RATE_LO))));
      s._r = Math.min(7, 2 + 1.1 * Math.sqrt(s.n || 1));
    }
    const css = getComputedStyle(document.documentElement), C = n => css.getPropertyValue(n).trim();

    // globe's starting view: the stars' mean direction
    let X = 0, Y = 0, Z = 0;
    for (const s of stars) {
      const a = -s.r * RAD, b = s.d * RAD;
      X += Math.cos(b) * Math.cos(a); Y += Math.cos(b) * Math.sin(a); Z += Math.sin(b);
    }
    const home = [-Math.atan2(Y, X) / RAD, -Math.atan2(Z, Math.hypot(X, Y)) / RAD, 0];

    // markup: the map replaces the static image (kept in the HTML as the no-JS fallback)
    const img = fig.querySelector('img'); if (img) img.remove();
    const wrap = document.createElement('div'); wrap.className = 'sky';
    wrap.innerHTML = `<div class="sky-tools">
        <div class="seg" role="group" aria-label="Projection"><button type="button" data-p="moll" aria-pressed="true">Mollweide</button><button type="button" data-p="globe" aria-pressed="false">Globe</button></div>
        <span class="sky-coord" aria-live="off"></span>
        <span class="sky-btns"><button type="button" class="sky-reset">Reset</button><button type="button" class="sky-exp" aria-pressed="false">Expand</button></span>
      </div>
      <div class="sky-stage"><canvas role="img" aria-label="Interactive map of the flare stars on the sky"></canvas><div class="sky-tip" hidden></div>
        <div class="sky-size" aria-hidden="true">dot size = total number of detected flares</div></div>
      <div class="sky-key"><span class="sky-leg"></span><span class="sky-hint">drag &amp; zoom!</span></div>`;
    fig.insertBefore(wrap, fig.querySelector('figcaption'));
    const cap = fig.querySelector('figcaption');
    if (cap) cap.innerHTML = `The ${stars.length.toLocaleString()} flare stars on the sky, seen from inside the celestial sphere ` +
      `(RA increases to the left; Galactic plane dashed). Zoomed out: how many stars fall in each ${CELL}° cell; ` +
      `zoomed in: each star, sized by its number of flares and coloured by its flare rate.`;
    const $ = s => wrap.querySelector(s);
    const canvas = $('canvas'), ctx = canvas.getContext('2d'), tip = $('.sky-tip'), stage = $('.sky-stage');
    const gal = galacticPlane();

    let mode = 'moll', proj = null, path = null, W = 0, H = 0, S0 = 1, K = 1, T = d3.zoomIdentity, shown = [], hover = null;
    const rot = home.slice();             // globe orientation
    const rotM = [0, 0];                  // Mollweide rotation [lambda, phi]: drag sideways turns the sky in RA, up/down
                                          // tilts it in Dec (an oblique Mollweide); Reset gives the standard map back

    function makeProj() {
      proj = mode === 'moll' ? d3.geoProjection(mollweideRaw).rotate([rotM[0], rotM[1], 0]).precision(0.3)
                             : d3.geoOrthographic().clipAngle(90).precision(0.3).rotate(rot);
      path = d3.geoPath(proj, ctx);
    }

    function size() {
      const dpr = devicePixelRatio || 1, big = fig.classList.contains('sky-expanded');
      const keep = mode === 'moll' && W && T.k > 1 ? onMap(W / 2, H / 2) : null;   // the sky at the centre, to keep
      tip.hidden = true;
      W = stage.clientWidth;
      H = Math.round(mode === 'moll' ? W * 0.53 : big ? Math.min(W * 0.62, 640) : Math.min(W * 0.9, 560));
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S0 = mode === 'moll' ? Math.min(W / (4 * Math.SQRT2), H / (2 * Math.SQRT2)) * 0.97 : Math.min(W, H) / 2 - 6;
      zoom.translateExtent(mode === 'moll' ? [[0, 0], [W, H]] : [[-Infinity, -Infinity], [Infinity, Infinity]]).extent([[0, 0], [W, H]]);
      if (keep) {                          // same zoom, same sky position at the centre, in the new canvas's pixels
        const p1 = d3.geoProjection(mollweideRaw).rotate([rotM[0], rotM[1], 0]).scale(S0).translate([W / 2, H / 2])(keep);
        T = d3.zoomIdentity.translate(W / 2 - T.k * p1[0], H / 2 - T.k * p1[1]).scale(T.k);
        d3.select(canvas).property('__zoom', T);
      }
      draw();
    }

    // the current view: Mollweide pans and zooms the flat map; the globe zooms about its centre and rotates (rot)
    function place() {
      if (mode === 'moll') proj.scale(S0 * T.k).translate([T.x + T.k * W / 2, T.y + T.k * H / 2]).rotate([rotM[0], rotM[1], 0]);
      else proj.scale(S0 * T.k).translate([W / 2, H / 2]).rotate(rot);
      K = T.k;
    }
    function onMap(x, y) {                 // the sky position under a screen point, or null off the map
      const ll = proj.invert([x, y]);
      if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return null;
      if (mode === 'moll') {
        const t = proj.translate(), s = proj.scale(), u = (x - t[0]) / s / (2 * Math.SQRT2), v = (y - t[1]) / s / Math.SQRT2;
        if (u * u + v * v > 1) return null;
      } else if (d3.geoDistance(ll, proj.invert([W / 2, H / 2])) > Math.PI / 2) return null;
      return ll;
    }

    function legend(mix) {
      const g = `linear-gradient(90deg, ${RAMP.join(',')})`;
      $('.sky-leg').innerHTML = mix < 0.5
        ? `<span class="sky-ramp" style="background:${g}"></span>stars per ${CELL}° cell, 1&ndash;${maxN.toLocaleString()} (log)`
        : `<span class="sky-ramp" style="background:${g}"></span>flare rate, 10<sup>${RATE_LO}</sup>&ndash;1 per day (log)`;
      $('.sky-size').style.opacity = mix;                  // fades in with the dots
    }

    const gridStep = () => STEPS.find(s => s * proj.scale() * RAD >= GRID_PX) || 30;
    // what is in view: the sky at the centre and an angular radius that covers the canvas (generous for Mollweide's
    // stretching); only cells, stars, grid lines and labels in there are handled -- at full zoom the rest of the sky
    // (a 0.5 deg grid over all of it, 39k projections) was what made it lag
    let VIEW = null;
    function viewRegion() {
      const c = mode === 'moll' ? onMap(W / 2, H / 2) : proj.invert([W / 2, H / 2]);
      const r = Math.min(Math.PI, Math.hypot(W, H) / 2 / proj.scale() * (mode === 'moll' ? 1.8 : 1.05));
      const full = !c || r > 0.7;
      let box = [[-180, -90], [180, 90.001]];
      if (!full) {
        const rd = r / RAD * 1.1, la0 = Math.max(-90, c[1] - rd), la1 = Math.min(90, c[1] + rd);
        if (la0 > -85 && la1 < 85) {
          const dl = Math.min(180, rd / Math.cos(Math.max(Math.abs(la0), Math.abs(la1)) * RAD));
          box = [[c[0] - dl, la0], [c[0] + dl, la1]];
        } else box = [[-180, la0], [180, la1 + 0.001]];
      }
      VIEW = {c: c || [0, 0], r: full ? Math.PI : r, box};
    }
    function grid() {
      const step = gridStep(), b = VIEW.box;
      ctx.beginPath(); path(d3.geoGraticule().step([step, step]).extentMajor(b).extentMinor(b)());
      ctx.strokeStyle = 'rgba(244,234,235,0.14)'; ctx.lineWidth = 1; ctx.stroke();
    }
    function labels() {                    // drawn last, with a dark outline, so they read over the stars
      const pxPerDeg = proj.scale() * RAD, step = gridStep();
      // a row of RA labels and a column of Dec labels, on the grid lines nearest the view centre
      const c = onMap(W / 2, H / 2) || [0, 0];
      const latRow = Math.max(-90 + step, Math.min(90 - step, Math.round(c[1] / step) * step));
      const lonCol = Math.round(c[0] / step) * step;
      ctx.font = `10px "IBM Plex Mono", ui-monospace, monospace`; ctx.fillStyle = C('--text-dim');
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(16,5,8,0.9)'; ctx.lineWidth = 3;
      const put = (txt, p) => { ctx.strokeText(txt, p[0] + 3, p[1] - 2); ctx.fillText(txt, p[0] + 3, p[1] - 2); };
      const every = Math.max(1, Math.ceil(45 / (step * pxPerDeg * (mode === 'moll' ? 0.9 : 1))));   // label every Nth line
      const mid = proj.invert([W / 2, H / 2]);
      const vis = ll => {                  // on screen, on the map, and (globe) on the near side, not behind it
        if (mode === 'globe' && d3.geoDistance(ll, mid) > Math.PI / 2 - 0.02) return null;
        const p = proj(ll); return p && p[0] > 2 && p[0] < W - 40 && p[1] > 12 && p[1] < H - 2 && onMap(p[0], p[1]) ? p : null;
      };
      const b = VIEW.box, mod = (x, m) => ((x % m) + m) % m;
      for (let lon = Math.ceil(b[0][0] / step) * step; lon <= b[1][0]; lon += step) {
        if (mod(Math.round(lon / step), every)) continue;
        const p = vis([lon, latRow]); if (p) put(fmtRA(-lon), p);
      }
      for (let lat = Math.max(-90 + step, Math.ceil(b[0][1] / step) * step); lat <= Math.min(90 - step, b[1][1]); lat += step) {
        if (lat === latRow || mod(Math.round(lat / step), every)) continue;
        const p = vis([lonCol, lat]); if (p) put(fmtDec(lat), p);
      }
    }

    function draw() {
      place();
      viewRegion();
      const centre = proj.invert([W / 2, H / 2]);
      const near = c => VIEW.r >= Math.PI || d3.geoDistance([c.lon, c.lat], VIEW.c) < VIEW.r + 0.04;
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath(); path({type: 'Sphere'}); ctx.fillStyle = C('--plot-bg'); ctx.fill();

      const mix = Math.max(0, Math.min(1, (K - K_POINTS_IN) / (K_POINTS - K_POINTS_IN)));   // 0 density .. 1 dots
      if (mix < 1) {                                       // density cells (true sky polygons, clipped by d3)
        ctx.globalAlpha = 1 - mix;
        for (const c of cells) {
          if (!near(c) || (mode === 'globe' && d3.geoDistance([c.lon, c.lat], centre) > Math.PI / 2 + 0.05)) continue;
          const p = proj([c.lon, c.lat]);
          if (mode === 'moll' && p && (p[0] < -60 || p[0] > W + 60 || p[1] < -60 || p[1] > H + 60)) continue;
          ctx.beginPath(); path(c.poly);
          ctx.fillStyle = c.col; ctx.fill(); ctx.strokeStyle = c.col; ctx.lineWidth = 0.6; ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      grid();
      ctx.beginPath(); path(gal); ctx.setLineDash([5, 4]); ctx.strokeStyle = C('--c-base'); ctx.lineWidth = 1.3;   // the baseline's blue
      ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); path({type: 'Sphere'}); ctx.strokeStyle = C('--panel-border'); ctx.lineWidth = 1; ctx.stroke();

      shown = [];
      if (mix > 0) {                                       // single stars
        ctx.globalAlpha = mix;
        ctx.strokeStyle = C('--plot-bg'); ctx.lineWidth = 1;
        for (const c of cells) {
          if (!near(c)) continue;
          for (const i of c.idx) {
            const s = stars[i], ll = [-s.r, s.d];
            if (mode === 'globe' && d3.geoDistance(ll, centre) > Math.PI / 2) continue;
            const p = proj(ll); if (!p || p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
            ctx.fillStyle = s._col;
            ctx.beginPath(); ctx.arc(p[0], p[1], s._r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
            shown.push([p[0], p[1], s._r, i]);
          }
        }
        ctx.globalAlpha = 1;
        const h = hover != null && shown.find(q => q[3] === hover);
        if (h) { ctx.beginPath(); ctx.arc(h[0], h[1], h[2] + 2.5, 0, 2 * Math.PI); ctx.strokeStyle = C('--text'); ctx.lineWidth = 2; ctx.stroke(); }
      }
      labels();
      legend(mix);
    }

    function pick(x, y) {                                  // nearest drawn star within reach of the pointer
      let best = null, bd = Infinity;
      for (const q of shown) {
        const d = Math.hypot(q[0] - x, q[1] - y);
        if (d < Math.max(8, q[2] + 3) && d < bd) { bd = d; best = q; }
      }
      return best;
    }
    function showTip(q) {
      if (!q) { tip.hidden = true; return; }
      const s = stars[q[3]];
      tip.innerHTML = `<b>Gaia DR3 ${TF.esc(s.i)}</b><br>RA ${TF.fmt(s.r, 4)}°, Dec ${TF.fmt(s.d, 4)}°<br>` +
                      `G ${TF.fmt(s.g, 2)} &middot; BP&minus;RP ${TF.fmt(s.c, 2)}<br>${s.n} flare${s.n === 1 ? '' : 's'} &middot; ${TF.sig3(s.rt)} per day`;
      tip.hidden = false;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = `${Math.min(W - tw - 4, Math.max(4, q[0] + 12))}px`;
      tip.style.top = `${Math.max(4, q[1] - th - 10)}px`;
    }

    // one d3.zoom for both: Mollweide uses its full transform (pan + zoom); the globe uses its scale, and drags rotate
    let last = null, lastP = null;
    const ptr = ev => !ev ? null : ev.touches && ev.touches.length
      ? [0, 1].map(j => [...ev.touches].reduce((a, q) => a + (j ? q.clientY : q.clientX), 0) / ev.touches.length)
      : [ev.clientX, ev.clientY];
    const zoom = d3.zoom().scaleExtent([1, K_MAX])
      .filter(e => (e.type === 'wheel' || !e.button) && (!e.touches || e.touches.length > 1))
      .on('start', e => { last = [e.transform.x, e.transform.y]; lastP = ptr(e.sourceEvent); tip.hidden = true; })
      .on('zoom', e => {
        let t = e.transform;
        const drag = e.sourceEvent && e.sourceEvent.type !== 'wheel' && last;
        if (drag && mode === 'globe') {
          const f = 180 / Math.PI / (S0 * K);
          rot[0] += (t.x - last[0]) * f; rot[1] = Math.max(-90, Math.min(90, rot[1] - (t.y - last[1]) * f));
        } else if (drag && mode === 'moll') {     // turn the sky under the map (wraps round); the map itself stays put
          const p = ptr(e.sourceEvent), d = p && lastP ? [p[0] - lastP[0], p[1] - lastP[1]] : [0, 0]; lastP = p;
          const f = 180 / Math.PI / (S0 * K) * Math.PI / (2 * Math.SQRT2);   // degrees per pixel near the map centre
          rotM[0] += d[0] * f; rotM[1] = Math.max(-90, Math.min(90, rotM[1] - d[1] * f));
          t = d3.zoomIdentity.translate(T.x, T.y).scale(t.k);
          d3.select(canvas).property('__zoom', t);
        }
        last = [t.x, t.y]; T = t; hover = null; draw();
      });
    d3.select(canvas).call(zoom).on('dblclick.zoom', null);
    canvas.style.touchAction = 'pan-y';                    // d3 sets none: keep one-finger page scrolling on phones

    canvas.addEventListener('mousemove', e => {
      const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, q = pick(x, y);
      const ll = onMap(x, y);
      $('.sky-coord').textContent = ll ? `RA ${fmtRA(-ll[0])}   Dec ${fmtDec(ll[1])}` : '';
      const h = q ? q[3] : null;
      canvas.style.cursor = q ? 'pointer' : 'grab';
      if (h !== hover) { hover = h; draw(); }
      showTip(q);
    });
    canvas.addEventListener('mouseleave', () => {
      tip.hidden = true; $('.sky-coord').textContent = '';
      if (hover != null) { hover = null; draw(); }
    });
    canvas.addEventListener('click', e => {
      const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, q = pick(x, y);
      if (q) { location.href = TF.starURL(stars[q[3]].i); return; }
      const ll = onMap(x, y);
      if (K >= K_POINTS || !ll) return;                    // density view: fly in around the clicked spot
      const k0 = K, k1 = Math.max(K_POINTS + 1, K * 2.5), ease = d3.easeCubicInOut;
      const ir = d3.interpolate(rot.slice(), [-ll[0], -ll[1], 0]);
      const tm = d3.timer(el => {                          // a timer, not a transition: zoom.transform would interrupt it
        const u = ease(Math.min(1, el / 650)), k = k0 * Math.pow(k1 / k0, u);
        if (mode === 'globe') { const r = ir(u); rot[0] = r[0]; rot[1] = r[1]; d3.select(canvas).call(zoom.transform, d3.zoomIdentity.scale(k)); }
        else d3.select(canvas).call(zoom.scaleTo, k, [x, y]);
        if (u >= 1) tm.stop();
      });
    });

    $('.sky-reset').addEventListener('click', () => { rot.splice(0, 3, ...home); rotM[0] = rotM[1] = 0; d3.select(canvas).call(zoom.transform, d3.zoomIdentity); });
    wrap.querySelectorAll('.seg button').forEach(bt => bt.addEventListener('click', () => {
      if (bt.dataset.p === mode) return;
      mode = bt.dataset.p;
      wrap.querySelectorAll('.seg button').forEach(o => o.setAttribute('aria-pressed', String(o === bt)));
      makeProj(); rot.splice(0, 3, ...home); T = d3.zoomIdentity; d3.select(canvas).property('__zoom', d3.zoomIdentity); size();
    }));
    // Expand: the map spans the width of the figure grid (bigger, still in the page); it and the figures it pushes down
    // glide to their new places (FLIP: measure, change the layout, then animate each from where it was)
    let busy = false;
    const expand = on => {
      if (busy || on === fig.classList.contains('sky-expanded')) return;
      busy = true; tip.hidden = true;
      $('.sky-exp').textContent = on ? 'Smaller' : 'Expand'; $('.sky-exp').setAttribute('aria-pressed', String(on));
      const els = [...fig.parentNode.children], r0 = els.map(el => el.getBoundingClientRect());
      fig.classList.toggle('sky-expanded', on);
      size();
      els.forEach((el, i) => {
        const a = r0[i], b = el.getBoundingClientRect();
        el.style.transformOrigin = '0 0';
        el.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)` + (el === fig ? ` scale(${a.width / b.width}, ${a.height / b.height})` : '');
      });
      fig.getBoundingClientRect();
      els.forEach(el => { el.style.transition = 'transform .38s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; });
      setTimeout(() => {
        els.forEach(el => { el.style.transition = ''; el.style.transformOrigin = ''; });
        const r = fig.getBoundingClientRect();
        if (on && (r.bottom > innerHeight || r.top < 0)) fig.scrollIntoView({behavior: 'smooth', block: 'nearest'});
        busy = false;
      }, 400);
    };
    $('.sky-exp').addEventListener('click', () => expand(!fig.classList.contains('sky-expanded')));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && fig.classList.contains('sky-expanded')) expand(false); });

    makeProj();
    new ResizeObserver(() => size()).observe(stage);
    size();
    return true;
  }
  return {init};
})();
