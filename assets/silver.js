// Silver sources: flare positions with at least one p_Flare >= 0.9 flare but no single confident Gaia host
// (unresolved pairs, small groups, or a lone flare too far from its only candidate). Loaded from data/silver.json;
// used by silver.html (the list; each source has a star page, star.html?id=J...) and by the home / browse searches.
const TFSilver = (() => {
  let _p = null;
  const load = (prefix = '') => _p || (_p = fetch(`${prefix}data/silver.json`).then(r => r.json()));
  const url = (id, prefix = '') => TF.starURL(id, prefix);
  const WHY = {pair: 'unresolved pair', group: 'unresolved group', lone: 'one candidate, not confident'};

  // q: a source name (J...), any candidate's Gaia DR3 ID, or 'RA Dec [radius']' -> matching sources (+ sep for cones)
  function match(S, q) {
    q = (q || '').trim(); if (!q) return {list: [], cone: null};
    const cone = TF.parseCone(q);
    if (cone) {
      const L = [];
      for (const o of S) { const s = TF.sepArcmin(cone.ra, cone.dec, o.r, o.d); if (s <= cone.r) L.push(Object.assign({sep: s}, o)); }
      return {list: L.sort((x, y) => x.sep - y.sep), cone};
    }
    const s = q.toLowerCase().replace(/^gaia\s*(dr3)?\s*/, '');
    return {list: S.filter(o => o.id.toLowerCase().includes(s) || (s.length >= 6 && o.k.some(k => k.i.includes(s)))), cone: null};
  }
  function row(o, prefix = '') {
    return `<tr><td><a href="${url(o.id, prefix)}" class="mono">${o.id}</a></td>` +
      `<td>${o.k.length}</td><td>${TF.fmt(o.g, 2)}</td><td>${o.n}</td><td>${TF.fmt(o.pm, 2)}</td>` +
      `<td>${WHY[o.why] || TF.esc(o.why || '')}</td><td>${TF.ranges(o.s)}</td>` + (o.sep != null ? `<td>${TF.fmt(o.sep, 2)}&prime;</td>` : '') + `</tr>`;
  }
  const head = cone => `<tr><th>Silver source</th><th title="Gaia DR3 stars that could be the host">Candidates</th>` +
    `<th title="Brightest candidate">G</th><th>Flares</th><th title="Highest flare probability">max p<sub>Flare</sub></th>` +
    `<th>Why silver</th><th>Sectors</th>${cone ? '<th>Sep</th>' : ''}</tr>`;
  // a small block listing silver matches under a gold search (home / browse)
  function block(el, S, q, max = 10) {
    const {list, cone} = match(S, q);
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<p class="sec" style="margin:18px 0 6px">Silver sources ${cone ? 'in this cone' : 'matching'} &middot; ${list.length.toLocaleString()}</p>` +
      `<div class="tablewrap"><table class="cat silver"><thead>${head(cone)}</thead><tbody>${list.slice(0, max).map(o => row(o)).join('')}</tbody></table></div>` +
      `<p class="hint">Silver sources: flares with no single confident Gaia host. <a href="silver.html${q ? '?q=' + encodeURIComponent(q) : ''}">All silver results &rarr;</a></p>`;
  }
  return {load, url, match, row, head, block, WHY};
})();
