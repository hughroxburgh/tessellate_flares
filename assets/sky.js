// Interactive sky map for the home page: the flare stars on a globe seen from inside (RA increases to the left, as on
// the sky). Drag to rotate, scroll or pinch to zoom. Zoomed out it shows a density map (stars per cell, so 100k stars
// stay readable); zoomed in, each star is a dot sized by its number of flares and coloured by its flare rate -- hover
// for details, click to open its page. Needs d3 (v7; loaded by index.html from cdnjs) and common.js (TF).
const TFSky = (() => {
  const RAD = Math.PI / 180;
  const CELL = 2.0;                    // density cell size (deg)
  const K_POINTS_IN = 2.6, K_POINTS = 4.0;   // zoom where the dots start fading in / are fully shown
  const K_MAX = 80;
  const RAMP = ['#5b2a35', '#a33a4a', '#e8615f', '#ffa477', '#ffe2b8'];   // = the population figures' warm ramp
  const RATE_LO = -2.5, RATE_HI = 0;   // log10 flares per day mapped onto the ramp

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

  // equal-area-ish cells: dec bands of CELL, each split into ~360 cos(dec) / CELL RA cells
  function densityCells(stars) {
    const cells = new Map();
    for (const s of stars) {
      const band = Math.min(Math.floor((s.d + 90) / CELL), Math.floor(180 / CELL) - 1);
      const dc = -90 + (band + 0.5) * CELL, n = Math.max(1, Math.round(360 * Math.cos(dc * RAD) / CELL));
      const j = Math.min(n - 1, Math.floor(((s.r % 360) + 360) % 360 / 360 * n)), key = band * 100000 + j;
      let c = cells.get(key);
      if (!c) {
        const lo0 = -j * 360 / n, lo1 = -(j + 1) * 360 / n, la0 = -90 + band * CELL, la1 = la0 + CELL;
        cells.set(key, c = {lon: (lo0 + lo1) / 2, lat: dc, n: 0,
                            corners: [[lo0, la0], [(lo0 + lo1) / 2, la0], [lo1, la0], [lo1, la1], [(lo0 + lo1) / 2, la1], [lo0, la1]]});
      }
      c.n++;
    }
    return [...cells.values()];
  }

  function init(fig, rows) {
    if (typeof d3 === 'undefined' || !fig) return false;
    const stars = rows.filter(o => o.r != null && o.d != null);
    if (!stars.length) return false;
    const ramp = d3.interpolateRgbBasis(RAMP);
    const cells = densityCells(stars), maxN = Math.max(...cells.map(c => c.n));
    const css = getComputedStyle(document.documentElement), C = n => css.getPropertyValue(n).trim();

    // view centre: the stars' mean direction
    let X = 0, Y = 0, Z = 0;
    for (const s of stars) {
      const a = -s.r * RAD, b = s.d * RAD;
      X += Math.cos(b) * Math.cos(a); Y += Math.cos(b) * Math.sin(a); Z += Math.sin(b);
    }
    const home = [-Math.atan2(Y, X) / RAD, -Math.atan2(Z, Math.hypot(X, Y)) / RAD];

    // markup: the map replaces the static image (kept in the HTML as the no-JS fallback)
    const img = fig.querySelector('img'); if (img) img.remove();
    const wrap = document.createElement('div'); wrap.className = 'sky';
    wrap.innerHTML = `<canvas role="img" aria-label="Interactive map of the flare stars on the sky"></canvas>
      <div class="sky-tip" hidden></div>
      <div class="sky-bar"><span class="sky-key"></span><button type="button" class="sky-reset">Reset view</button></div>
      <p class="sky-hint">Drag to rotate (two fingers on a phone), scroll or pinch to zoom. Click to zoom in; when zoomed in, hover over a star for details and click it to open its page.</p>`;
    fig.insertBefore(wrap, fig.querySelector('figcaption'));
    const cap = fig.querySelector('figcaption');
    if (cap) cap.innerHTML = `The ${stars.length.toLocaleString()} flare stars on the sky, seen from inside the celestial sphere ` +
      `(RA increases to the left; grid every 30°, Galactic plane dashed). Zoomed out: how many stars fall in each ${CELL}° cell; ` +
      `zoomed in: each star, sized by its number of flares and coloured by its flare rate.`;
    const canvas = wrap.querySelector('canvas'), ctx = canvas.getContext('2d'), tip = wrap.querySelector('.sky-tip');
    const key = wrap.querySelector('.sky-key');

    const proj = d3.geoOrthographic().clipAngle(90).precision(0.3).rotate([home[0], home[1], 0]);
    const path = d3.geoPath(proj, ctx), grat = d3.geoGraticule().step([30, 30])(), gal = galacticPlane();
    let W = 0, H = 0, R0 = 1, K = 1, shown = [], hover = null;

    function size() {
      const dpr = devicePixelRatio || 1;
      W = wrap.clientWidth; H = Math.round(Math.min(W * 0.82, 560));
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R0 = Math.min(W, H) / 2 - 6;
      proj.translate([W / 2, H / 2]);
      draw();
    }

    function legend(mix) {
      const g = `linear-gradient(90deg, ${RAMP.join(',')})`;
      key.innerHTML = mix < 0.5
        ? `<span class="sky-ramp" style="background:${g}"></span> stars per ${CELL}° cell: 1 &ndash; ${maxN.toLocaleString()} (log scale)`
        : `<span class="sky-ramp" style="background:${g}"></span> flare rate 10<sup>${RATE_LO}</sup> &ndash; 10<sup>${RATE_HI}</sup> per day &middot; dot size: number of flares`;
    }

    function draw() {
      const scale = R0 * K;
      proj.scale(scale);
      const centre = proj.invert([W / 2, H / 2]);
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath(); path({type: 'Sphere'}); ctx.fillStyle = C('--plot-bg'); ctx.fill();
      ctx.strokeStyle = C('--panel-border'); ctx.lineWidth = 1; ctx.stroke();

      const mix = Math.max(0, Math.min(1, (K - K_POINTS_IN) / (K_POINTS - K_POINTS_IN)));   // 0 density .. 1 dots
      if (mix < 1) {                                       // density cells
        ctx.globalAlpha = 1 - mix;
        const lmax = Math.log10(maxN + 1);
        for (const c of cells) {                           // each cell as its own (projected) shape
          if (d3.geoDistance([c.lon, c.lat], centre) > Math.PI / 2 - 0.04) continue;
          ctx.beginPath();
          c.corners.forEach((ll, m) => { const p = proj(ll); m ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
          ctx.closePath();
          ctx.fillStyle = ramp(Math.log10(c.n + 1) / lmax); ctx.fill();
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();   // hide hairline seams between cells
        }
        ctx.globalAlpha = 1;
      }
      // grid and Galactic plane over the density, under the stars
      ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(244,234,235,0.13)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); path(gal); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(94,200,180,0.7)'; ctx.lineWidth = 1.3;
      ctx.stroke(); ctx.setLineDash([]);
      shown = [];
      if (mix > 0) {                                       // single stars
        ctx.globalAlpha = mix;
        ctx.strokeStyle = C('--plot-bg'); ctx.lineWidth = 1;
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i], ll = [-s.r, s.d];
          if (d3.geoDistance(ll, centre) > 1.55) continue;
          const p = proj(ll); if (!p || p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
          const rad = Math.min(7, 2 + 1.1 * Math.sqrt(s.n || 1));
          const lr = s.rt > 0 ? Math.log10(s.rt) : RATE_LO;
          ctx.fillStyle = ramp(Math.max(0, Math.min(1, (lr - RATE_LO) / (RATE_HI - RATE_LO))));
          ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
          shown.push([p[0], p[1], rad, i]);
        }
        ctx.globalAlpha = 1;
        if (hover != null) {
          const h = shown.find(q => q[3] === hover);
          if (h) { ctx.beginPath(); ctx.arc(h[0], h[1], h[2] + 2.5, 0, 2 * Math.PI); ctx.strokeStyle = C('--text'); ctx.lineWidth = 2; ctx.stroke(); }
        }
      }
      legend(mix);
    }

    // nearest drawn star within reach of the pointer
    function pick(x, y) {
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
      tip.innerHTML = `<b>Gaia DR3 ${TF.esc(s.i)}</b><br>G ${TF.fmt(s.g, 2)} &middot; BP&minus;RP ${TF.fmt(s.c, 2)}<br>` +
                      `${s.n} flare${s.n === 1 ? '' : 's'} &middot; ${TF.sig3(s.rt)} per day`;
      tip.hidden = false;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = `${Math.min(W - tw - 4, Math.max(4, q[0] + 12))}px`;
      tip.style.top = `${Math.max(4, q[1] - th - 10)}px`;
    }

    // rotate by dragging (one finger on a touch screen pans the page instead: two fingers rotate / pinch), zoom by wheel
    let last = null;
    const zoom = d3.zoom().scaleExtent([0.8, K_MAX])
      .filter(e => (e.type === 'wheel' || !e.button) && (!e.touches || e.touches.length > 1))
      .on('start', e => { last = [e.transform.x, e.transform.y]; tip.hidden = true; })
      .on('zoom', e => {
        const t = e.transform;
        if (e.sourceEvent && e.sourceEvent.type !== 'wheel' && last) {
          const r = proj.rotate(), f = 180 / Math.PI / (R0 * K);
          proj.rotate([r[0] + (t.x - last[0]) * f, Math.max(-90, Math.min(90, r[1] - (t.y - last[1]) * f)), 0]);
        }
        last = [t.x, t.y]; K = t.k; hover = null; draw();
      });
    d3.select(canvas).call(zoom).on('dblclick.zoom', null);
    canvas.style.touchAction = 'pan-y';                  // d3 sets none: keep one-finger page scrolling on phones

    canvas.addEventListener('mousemove', e => {
      const b = canvas.getBoundingClientRect(), q = pick(e.clientX - b.left, e.clientY - b.top);
      const h = q ? q[3] : null;
      canvas.style.cursor = q ? 'pointer' : 'grab';
      if (h !== hover) { hover = h; draw(); }
      showTip(q);
    });
    canvas.addEventListener('mouseleave', () => { tip.hidden = true; if (hover != null) { hover = null; draw(); } });
    canvas.addEventListener('click', e => {
      const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, q = pick(x, y);
      if (q) { location.href = TF.starURL(stars[q[3]].i); return; }
      if (K < K_POINTS) {                                  // density view: zoom in around the clicked spot
        const ll = proj.invert([x, y]); if (!ll) return;
        const r0 = proj.rotate(), r1 = [-ll[0], -ll[1], 0], k0 = K, k1 = Math.max(K_POINTS + 1, K * 2.5);
        const ir = d3.interpolate(r0, r1), ease = d3.easeCubicInOut;   // a timer, not a transition: zoom.transform
        const tm = d3.timer(el => {                                         // would interrupt a transition every step
          const u = ease(Math.min(1, el / 650));
          proj.rotate(ir(u)); d3.select(canvas).call(zoom.transform, d3.zoomIdentity.scale(k0 * Math.pow(k1 / k0, u)));
          if (u >= 1) tm.stop();
        });
      }
    });
    wrap.querySelector('.sky-reset').addEventListener('click', () => {
      proj.rotate([home[0], home[1], 0]);
      d3.select(canvas).call(zoom.transform, d3.zoomIdentity);
    });
    new ResizeObserver(size).observe(wrap);
    size();
    return true;
  }
  return {init};
})();
