// Shared helpers for the TESSELLATE flare catalogue pages (no dependencies).
const TF = (() => {
  const fmt = (v, d) => (v == null || !isFinite(v)) ? '&mdash;' : (+v).toFixed(d);
  const int = v => (v == null || !isFinite(v)) ? '&mdash;' : Math.round(v).toLocaleString();
  // 3 significant figures, plain for 0.01..99,999, otherwise a x 10^n form
  function sig3(v) {
    if (v == null || !isFinite(v)) return '&mdash;';
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 0.01 && a < 1e5) return (+v.toPrecision(3)).toLocaleString();
    const e = Math.floor(Math.log10(a)), m = v / 10 ** e;
    return `${m.toFixed(2)}&times;10<sup>${e}</sup>`;
  }
  const CLASS_LABEL = {simple: 'simple', marginal: 'marginal', complex: 'complex', possible: 'possible', shape: 'shape'};
  const tag = c => c ? `<span class="tag ${c}">${CLASS_LABEL[c] || c}</span>` : '&mdash;';
  // the data shard a star is in (build_site.shard_of must agree): digits 3-5 from the end (Gaia IDs end in a multiple of 4)
  const shard = (id, n) => parseInt(String(id).slice(-5, -2), 10) % n;
  const starURL = (id, prefix = '') => `${prefix}star.html?id=${id}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // site summary (KPIs, build id); always revalidated so a rebuild shows up immediately
  let _summary = null;
  async function summary(prefix = '') {
    if (!_summary) _summary = fetch(`${prefix}data/summary.json`, {cache: 'no-cache'}).then(r => r.json());
    return _summary;
  }
  async function index(prefix = '') {
    const s = await summary(prefix);
    return fetch(`${prefix}data/index.json?v=${s.v}`).then(r => r.json());
  }
  // per-star files are gzipped JSON. GitHub Pages (and python -m http.server) serve .gz as
  // application/gzip without Content-Encoding, so the bytes arrive compressed and are inflated
  // here; if a server ever decompresses them on the way, the magic-number check skips that.
  async function getGz(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return inflateJSON(new Uint8Array(await r.arrayBuffer()));
  }
  async function inflateJSON(buf) {
    let text;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      if (!('DecompressionStream' in window)) throw new Error('this browser cannot decompress the data');
      const ds = new DecompressionStream('gzip');
      text = await new Response(new Blob([buf]).stream().pipeThrough(ds)).text();
    } else text = new TextDecoder().decode(buf);
    return JSON.parse(text);
  }
  // one star: its [offset, length] from the shard index (beside the pages), then just those bytes of the shard file
  // (beside the pages, or on Hugging Face / Zenodo: summary.shards.base) with a Range request; a server that ignores
  // Range (python -m http.server) sends the whole shard and the record is cut out here.
  // Returns {S: star JSON, gz: its gzipped bytes} or null when the star isn't in the catalogue.
  async function getStar(id, prefix = '') {
    const s = await summary(prefix), n = s.shards.n, k = shard(id, n);
    const idx = await fetch(`${prefix}data/shards/${k}.json?v=${s.v}`).then(r => r.json());
    const rec = idx[id];
    if (!rec) return null;
    const [off, len] = rec;
    const url = s.shards.base ? `${s.shards.base}${k}.bin` : `${prefix}data/shards/${k}.bin?v=${s.v}`;
    const r = await fetch(url, {headers: {Range: `bytes=${off}-${off + len - 1}`}});
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    let buf = new Uint8Array(await r.arrayBuffer());
    if (r.status !== 206) buf = buf.slice(off, off + len);
    return {S: await inflateJSON(buf), gz: buf};
  }
  // "RA Dec [radius arcmin]" in decimal degrees -> cone; otherwise null
  function parseCone(q) {
    const m = q.trim().match(/^([+-]?\d+(?:\.\d+)?)[\s,]+([+-]?\d+(?:\.\d+)?)(?:[\s,]+(\d+(?:\.\d+)?))?$/);
    if (!m) return null;
    const ra = +m[1], dec = +m[2], r = m[3] ? +m[3] : 5;
    if (ra < 0 || ra > 360 || dec < -90 || dec > 90) return null;
    return {ra, dec, r};
  }
  function sepArcmin(ra1, dec1, ra2, dec2) {
    const d = Math.PI / 180;
    const s = Math.sin((dec2 - dec1) * d / 2) ** 2 +
              Math.cos(dec1 * d) * Math.cos(dec2 * d) * Math.sin((ra2 - ra1) * d / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(s))) / d * 60;
  }
  // MJD -> 'YYYY-MM-DD hh:mm' UTC
  function mjdToUTC(mjd) {
    const d = new Date((mjd - 40587) * 86400000);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
  // filter + sort shared by the home and browse pages
  function filterSort(DATA, q, sortKey, sortDir, extra) {
    let L = DATA, cone = parseCone(q || '');
    if (cone) {
      L = [];
      for (const o of DATA) {
        const s = sepArcmin(cone.ra, cone.dec, o.r, o.d);
        if (s <= cone.r) L.push(Object.assign({sep: s}, o));
      }
    } else if (q && q.trim()) {
      const s = q.trim().toLowerCase().replace(/^gaia\s*(dr3)?\s*/, '');
      L = DATA.filter(o => o.i.includes(s));
    }
    if (extra) L = L.filter(extra);
    const k = cone && !sortKey ? 'sep' : sortKey;
    if (k) {
      L = L.slice().sort((x, y) => {
        const a = x[k], b = y[k];
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        if (typeof a === 'string') return sortDir * a.localeCompare(b);
        return sortDir * (a - b);
      });
    }
    return {list: L, cone};
  }
  // sector list as runs: [27, 28, 29, 31, 33, 34] -> '27–29, 31, 33–34'
  function ranges(L) {
    const s = [...L].sort((a, b) => a - b), out = [];
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      out.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`);
      i = j;
    }
    return out.join(', ');
  }
  // catalogue table row (home + browse)
  function row(o, prefix = '') {
    return `<tr><td><a href="${starURL(o.i, prefix)}" class="mono">${o.i}</a></td>` +
      `<td>${fmt(o.g, 2)}</td><td>${fmt(o.c, 2)}</td><td>${o.n}</td><td>${o.x || 0}</td>` +
      `<td>${fmt(o.rt, 3)}</td><td>${o.e == null ? '&mdash;' : sig3(o.e)}</td>` +
      `<td>${fmt(o.p, 2)}</td><td>${ranges(o.s)}</td>` +
      (o.sep != null ? `<td>${fmt(o.sep, 2)}&prime;</td>` : '') + `</tr>`;
  }
  return {fmt, int, sig3, tag, shard, starURL, esc, summary, index, getGz, getStar, parseCone, sepArcmin,
          mjdToUTC, filterSort, row, ranges};
})();
