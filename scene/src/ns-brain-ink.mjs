/** NeuroSurge scene: the comic ink look of the brain (R558 BB, BB2; user Messages 24, 25, 26, 27, 28, 29, 35 and the
 * style guide).
 *
 * Message 24: "Let's introduce texture to all our tissues (especially gyri and sulci for the motor neural tissue)."
 * Message 29: "Perhaps the borderlands aesthetic should be applied throughout."
 * Message 35: "The borderlands effect should also apply to the motor strip, as should it apply to everything else as
 * well. The entire aesthetic."
 *
 * What is here (pure: strings, numbers and typed arrays; nothing imports 'three'):
 *  - THE ATLAS GEOMETRY. The motor areas are drawn on the atlas's own precentral gyrus (BodyParts3D FJ1801 / FJ1800,
 *    OBJ99, about 2.7 mm edges); the glass brain is the 59 atlas brain meshes (178,743 vertices, about 1.7 mm edges).
 *    Every brain mesh is a closed CORTICAL RIBBON: the outer (pial) surface, i.e. the crown and both banks that dive
 *    into the sulci, and the inner (white matter) surface about 3 mm under it (checked on slices across the strip,
 *    BB2 report). The banks of the precentral gyrus go 15 to 25 mm deep; the anterior bank slopes under the frontal
 *    gyri, so from above (the start view) much of the strip's footprint is that buried bank, seen through the glass.
 *  - TWO FOLD SIGNALS, both read only from atlas vertices (nothing is invented, no fold is added):
 *    1. foldDepth (glass): how far a vertex lies BELOW a ball of radius ballMm rolled over the whole atlas brain from
 *       outside, approximated locally: the largest h - lateral^2 / (2 ballMm) over every atlas brain vertex within
 *       radiusMm (h = its height above the vertex along the vertex's normal, lateral = its distance from that normal
 *       line). A gyral crown has nothing above it (0 mm); a bank or a sulcal floor has the opposite gyrus's crown above
 *       it. On the glass this marks every sulcus of the atlas (BB2 analysis picture glass-cmp). It is NOT used on the
 *       strip any more: in this atlas the precentral crown lies lower than its neighbours near the midline (at 20 mm
 *       from the midline its top is 8.7 mm under a 10 mm ball), so the whole medial crown read as "deep" and the visible
 *       face stepped from crown to deep in the last pixels (BB check).
 *    2. reliefDepth (strip): the strip's OWN relief. The direction "out of the brain" at each strip vertex is the
 *       envelope normal (envelopeNormals: a soft minimum over the brain's convex-hull support planes, so it turns
 *       smoothly), and the relief depth is how far the vertex lies below a large ball (ballMm 25) rolled over the strip
 *       mesh alone, along that direction. The crown top reads 0, the shoulders a millimetre or two, the lip of each
 *       sulcus about 1.5 mm, the banks 3 to 20 mm and the fundus deepest, wherever the neighbours are; real dimples of
 *       the atlas crown read as small depths. The level line reliefDepth = lipMm is the inked sulcus line on both sides
 *       of the gyrus (and around any real dimple deeper than that).
 *    foldDepth uses a dense cell grid with cell culling (a cell whose highest possible cap cannot beat the best so far is
 *    skipped) and an optional early exit at maxMm; the result is identical to the plain scan (BB2 check: max difference
 *    0 mm on FJ1801).
 *  - The motor-area SHADER PATCH (patchAreaInkShaders), on top of the per-fragment areas (ns-scene-three REGION_BORDER):
 *      relief-banded light: each direct light's N.L (softened by lightGamma) is multiplied by the relief factor
 *        1 - reliefDark x (1 - exp(-relief / reliefMm)) and quantised into BRAIN_INK.cel's four tones with narrow soft
 *        steps, so the bands run ALONG the gyrus: lit crown top, light crown, mid upper bank from the lip on, dark deep
 *        bank (the light-to-mid step falls on the sulcus line); the indirect fill and the area's faint resting
 *        self-light fall off down the banks too (aoMin); the specular is kept off the banks (x relief factor^specRelief);
 *      ink: the sulcus line on both sides (relief = lipMm, constant width in CSS pixels, a little heavier on the shadow
 *        side like a brush line), a finer fundus line deeper on the bank (relief = fundusMm), the gyrus contour where the
 *        strip turns away from the eye (N.V = 0);
 *      hatching: fine ink strokes ACROSS the gyrus (level lines of the along-gyrus coordinate s: fixed to the tissue, they
 *        run down the banks like hachures) inside the shadow bands and on the deep banks, a second offset set where
 *        darker, and deep in the sulci a cross-hatch along the relief's level lines (every crossMm of relief depth);
 *        all faded out when the strokes would be closer than hatchMinSpacingCss on screen and under a glow;
 *      solid: the resting area is drawn more solid (alpha 1 - (1 - a) x (1 - solid)), so its bands are not washed out
 *        by the black behind it. The area colours (albedo, glow), the per-fragment bands, the borders, the picking and
 *        the place of the strip are not touched; the power-up charge (emission) is never inked over.
 *  - The GLASS (glassInkGlsl): soft two-step cel shading of the gyral crowns from the glass key light (the same headlight
 *    direction as the scene's key light), the atlas sulci inked (the level line of the glass fold depth at the lip of
 *    every sulcus, once glassFold is ready), the glass's own contours (N.V = 0) inked with a thin light rim inside them,
 *    and one crisp highlight shape per crown. Everything clears next to the strip (GLASS_CLEAR) as before.
 *
 * Display only: every number below is a display choice; none is a measurement of tissue or of neural activity.
 */

/** Display choices (see the BB and BB2 reports for what was tried).
 *  ink: near-black #0b0809 as drawn (sRGB), the style guide's ink, shared with ns-outline OUTLINE.colour.
 *  fold: foldDepth radiusMm / ballMm (whole-brain fold depth); foldShade loMm (crown up to here) .. hiMm (floor from here).
 *  relief: the strip's own relief (reliefDepth): envelope soft-minimum width envTauMm, ball ballMm, neighbour radius
 *    radiusMm (all source mm).
 *  glassFold: the glass's fold depth (radiusMm, ballMm, maxMm: the depth is not needed beyond the darkest tone), its
 *    shade loMm .. hiMm (0 crown .. 1 groove, written into the glass's groove attribute nsSulc), the cell size of the
 *    grid and the per-slice time budget of the background job (ms).
 *  cel: N.L steps (t1 < t2 < t3), the four tone levels (deep shadow, mid, light, highlight) and the soft half-width of a
 *    step in N.L units (widened to at least one pixel by the step's screen gradient).
 *  area: contourCss / contourAlpha: half-width (CSS px) and opacity of the gyrus contour; lipMm / lipCss / lipAlpha: the
 *    relief level of the sulcus line, its half-width and opacity; fundusMm / fundusCss / fundusAlpha: the same for the
 *    finer line deeper on the bank; reliefMm / reliefDark / lightGamma: the relief factor (1 - reliefDark x
 *    (1 - exp(-relief / reliefMm))) and the softening of N.L before the bands (N.L^lightGamma); aoMin: the share of the
 *    flat fill (ambient and sky light) and of the resting self-light kept at full relief; specRelief: the specular is
 *    multiplied by the relief factor to this power; crossMm / crossFrom / crossFull: the cross-hatch spacing in relief
 *    depth and the relief share over which it fades in; indirect: the share of the flat fill the areas keep at all,
 *    so the banded key light shapes the gyrus (deep shadow to lit crown, Message 25); floorDark / floorFrom / floorTo:
 *    the lit light (not the activation glow) is darkened by up to floorDark over that range of the relief share; solid:
 *    how much more solid the area is drawn than its material alpha; hatchPerS: strokes per unit of the along-gyrus
 *    coordinate s (about 1 mm apart at the strip's middle); hatchCss: stroke half-width; hatchAlpha: stroke opacity;
 *    hatchFrom / hatchFull: shade (0 dark .. 1 lit, the luminance-weighted banded light) at which the strokes start /
 *    are full; denseFrom / denseFull: the same for the second, offset set; reliefHatch: the strokes' strength on the
 *    deep banks (relief share 0.45 .. 0.9); hatchMinSpacingCss: strokes closer than this on screen fade out; glowFade:
 *    emission luminance over which the strokes and the sulcus lines fade (the power-up stays clean).
 *    gloss (user Message 54, "a bit of shine, a bit of glossiness"): a highlight of the key light along the gyrus
 *    crowns, drawn in the patch because the material's own highlight is only a few degrees wide and rarely lands on
 *    the strip. g = (N.H)^power for the key light's half vector; sheen x g is added as a soft falloff and core more
 *    inside the crisp step coreLo .. coreHi of g (its edge at least a pixel wide). Both are kept off the banks like
 *    the specular (x relief factor^specRelief) and stay under white with the rest of the reflected light.
 *  glass: contourCss / contourAlpha: the glass contour ink; rimCss / rimLight / rimAlpha: the light band just inside it;
 *    highlight: power of the key-light highlight, its crisp step (lo .. hi), added light and alpha (a highlight whose
 *    step is crossed within about a pixel, a speck on the coarse mesh, is left out); cel: the crowns' fill (alpha and
 *    light at the lit band, the two N.L steps, their soft half-width, the share kept by the shadow band); foldLevel /
 *    foldCss / foldAlpha: the groove level of the inked sulcus line on the glass, its half-width and opacity.
 *  R558 (user Messages 49 and 54: the comic ink was overdone, the picture matte): lighter ink (area contourAlpha
 *  0.92 -> 0.8, lipAlpha 0.95 -> 0.8, hatchAlpha 0.55 -> 0.35; glass foldAlpha 0.75 -> 0.6) and a larger, brighter
 *  highlight on the glass (power 400 -> 200, alpha 0.18 -> 0.3), so the brain reads as polished glass. */
export const BRAIN_INK = Object.freeze({
  ink: Object.freeze([0x0b / 255, 0x08 / 255, 0x09 / 255]),
  fold: Object.freeze({ radiusMm: 14, ballMm: 10, loMm: 1.0, hiMm: 10, cellMm: 4 }),
  relief: Object.freeze({ envTauMm: 3, ballMm: 25, radiusMm: 10, cellMm: 4 }),
  glassFold: Object.freeze({ radiusMm: 10, ballMm: 8, maxMm: 6, loMm: 0.5, hiMm: 5, cellMm: 4, sliceMs: 8 }),
  cover: Object.freeze({ depthMm: 30, latMm: 3, latFullMm: 1.5, cellMm: 3 }),
  cel: Object.freeze({ steps: Object.freeze([0.14, 0.38, 0.72]), levels: Object.freeze([0.12, 0.4, 0.75, 1.0]), soft: 0.035 }),
  area: Object.freeze({
    contourCss: 1.05, contourAlpha: 0.8,
    lipMm: 1.5, lipCss: 1.0, lipAlpha: 0.8, fundusMm: 7, fundusCss: 0.45, fundusAlpha: 0.55,
    reliefMm: 1.5, reliefDark: 0.95, lightGamma: 0.6, aoMin: 0.45, specRelief: 2, crossMm: 1.6, crossFrom: 0.7, crossFull: 0.95,
    floorDark: 0.25, floorFrom: 0.55, floorTo: 1.0, indirect: 0.6, solid: 0.7,
    hatchPerS: 150, hatchCss: 0.42, hatchAlpha: 0.35, hatchFrom: 0.2, hatchFull: 0.06, denseFrom: 0.1, denseFull: 0.02,
    reliefHatch: 0.85, hatchMinSpacingCss: 4, glowFade: Object.freeze([0.04, 0.32]),
    gloss: Object.freeze({ power: 20, sheen: 0.22, coreLo: 0.8, coreHi: 0.86, core: 0.28 })
  }),
  glass: Object.freeze({
    contourCss: 0.75, contourAlpha: 0.7, rimCss: 1.4, rimLight: 0.3, rimAlpha: 0.12,
    highlight: Object.freeze({ power: 200, lo: 0.86, hi: 0.9, light: 0.6, alpha: 0.3 }),
    cel: Object.freeze({ alpha: 0.05, light: 0.3, step1: 0.3, step2: 0.62, soft: 0.06, shadow: 0.35 }),
    foldLevel: 0.3, foldCss: 0.6, foldAlpha: 0.6
  })
});

/** sRGB 0..1 -> linear (the shaders mix in linear light). Pure. */
export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

/** Cell grid of a point cloud for foldDepth (pure): dense cells of cellMm over the cloud's bounds, the points sorted by
 * cell (compressed rows). Returns { kind: 'ns-fold-grid', o, dims, cell, start (Int32Array cells + 1), pts (xyz) }. */
export function foldGrid(cloud, cellMm = BRAIN_INK.fold.cellMm) {
  const n = cloud && cloud.length >= 3 ? Math.floor(cloud.length / 3) : 0, cell = cellMm > 0 ? cellMm : 4;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 3 * n; i += 3) for (let j = 0; j < 3; j++) { const v = cloud[i + j]; if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; }
  if (!n) return { kind: 'ns-fold-grid', o: [0, 0, 0], dims: [1, 1, 1], cell, start: new Int32Array(2), pts: new Float32Array(0) };
  const o = mn.map(v => v - cell), dims = mx.map((v, j) => Math.floor((v + cell - o[j]) / cell) + 1);
  const nc = dims[0] * dims[1] * dims[2], start = new Int32Array(nc + 1), cellOf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const c = (Math.floor((cloud[3 * i] - o[0]) / cell) * dims[1] + Math.floor((cloud[3 * i + 1] - o[1]) / cell)) * dims[2] + Math.floor((cloud[3 * i + 2] - o[2]) / cell);
    cellOf[i] = c; start[c + 1]++;
  }
  for (let c = 0; c < nc; c++) start[c + 1] += start[c];
  const fill = start.slice(0, nc), pts = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { const k = 3 * fill[cellOf[i]]++; pts[k] = cloud[3 * i]; pts[k + 1] = cloud[3 * i + 1]; pts[k + 2] = cloud[3 * i + 2]; }
  return { kind: 'ns-fold-grid', o, dims, cell, start, pts };
}

/** Cell offsets (relative cell indices) that can hold a point within radiusMm of a point inside the centre cell, nearest
 * first; kept on the grid for the next call with the same radius (the sliced background job calls foldDepth often). */
function cellOffsets(G, radiusMm) {
  if (G.offsets && G.offsets.radiusMm === radiusMm) return G.offsets;
  const cell = G.cell, r = Math.ceil(radiusMm / cell) + 1, R2 = radiusMm * radiusMm, offs = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
    const dx = Math.max(0, Math.abs(i) - 1) * cell, dy = Math.max(0, Math.abs(j) - 1) * cell, dz = Math.max(0, Math.abs(k) - 1) * cell;
    if (dx * dx + dy * dy + dz * dz <= R2) offs.push([i, j, k, i * i + j * j + k * k]);
  }
  offs.sort((a, b) => a[3] - b[3]);
  const m = offs.length, OI = new Int32Array(m), OJ = new Int32Array(m), OK = new Int32Array(m);
  for (let q = 0; q < m; q++) { OI[q] = offs[q][0]; OJ[q] = offs[q][1]; OK[q] = offs[q][2]; }
  G.offsets = { radiusMm, OI, OJ, OK };
  return G.offsets;
}

/** Fold depth (source mm) of each vertex of `positions` under the rolled ball over `cloud` (pure; see the header).
 * positions, normals: xyz per vertex (normals unit, outward; for the strip's relief, the envelope normals); cloud: xyz of
 * the atlas vertices to roll over (source mm), or a foldGrid of them. Options: radiusMm, ballMm, maxMm (stop once a
 * vertex is known to be at least that deep), start / end (vertex range) and out (Float32Array to fill, for the sliced
 * background job). Returns Float32Array(vertexCount) (out when given). */
export function foldDepth(positions, normals, cloud, { radiusMm = BRAIN_INK.fold.radiusMm, ballMm = BRAIN_INK.fold.ballMm, maxMm = Infinity, start: v0 = 0, end: v1 = Infinity, out = null } = {}) {
  const n = positions.length / 3, res = out && out.length >= n ? out : new Float32Array(n);
  if (!cloud || !normals || normals.length !== positions.length || !(radiusMm > 0) || !(ballMm > 0)) return res;
  const G = cloud.kind === 'ns-fold-grid' ? cloud : (cloud.length >= 3 ? foldGrid(cloud, BRAIN_INK.fold.cellMm) : null);
  if (!G || !G.pts.length) return res;
  const { o, dims, cell, start, pts } = G;
  const R2 = radiusMm * radiusMm, k2 = 1 / (2 * ballMm), half = cell * Math.sqrt(3) / 2;
  const { OI, OJ, OK } = cellOffsets(G, radiusMm), m = OI.length;
  const D0 = dims[0], D1 = dims[1], D2 = dims[2], end = Math.min(n, v1);
  for (let v = Math.max(0, v0); v < end; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    const nx = normals[3 * v], ny = normals[3 * v + 1], nz = normals[3 * v + 2];
    const ci = Math.floor((x - o[0]) / cell), cj = Math.floor((y - o[1]) / cell), ck = Math.floor((z - o[2]) / cell);
    let best = 0;
    for (let q = 0; q < m; q++) {
      const i = ci + OI[q], j = cj + OJ[q], k = ck + OK[q];
      if (i < 0 || j < 0 || k < 0 || i >= D0 || j >= D1 || k >= D2) continue;
      // the highest a point of this cell can lie above the vertex: skip the cell when even that cannot beat `best`
      const hc = (o[0] + (i + 0.5) * cell - x) * nx + (o[1] + (j + 0.5) * cell - y) * ny + (o[2] + (k + 0.5) * cell - z) * nz;
      if (hc + half <= best) continue;
      const c = (i * D1 + j) * D2 + k, e = 3 * start[c + 1];
      for (let p = 3 * start[c]; p < e; p += 3) {
        const dx = pts[p] - x, dy = pts[p + 1] - y, dz = pts[p + 2] - z;
        const h = dx * nx + dy * ny + dz * nz;
        if (h <= best) continue;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) continue;
        const cap = h - (d2 - h * h) * k2;
        if (cap > best) best = cap;
      }
      if (best >= maxMm) break;
    }
    res[v] = best;
  }
  return res;
}

/** Fold depth (mm) -> 0 crown .. 1 floor (smoothstep loMm .. hiMm). Pure. */
export function foldShade(depthMm, { loMm = BRAIN_INK.fold.loMm, hiMm = BRAIN_INK.fold.hiMm } = {}) {
  const out = new Float32Array(depthMm.length);
  for (let i = 0; i < depthMm.length; i++) {
    const t = Math.min(1, Math.max(0, (depthMm[i] - loMm) / (hiMm - loMm)));
    out[i] = t * t * (3 - 2 * t);
  }
  return out;
}

/** Envelope normals (pure): the direction out of the brain at each vertex, from the brain's convex-hull support planes
 * (support: { support: per-direction support values, dirs: unit directions xyz }, ns-scene-three supportPoints): the
 * planes' directions weighted by exp(-(distance to the plane - nearest distance) / tauMm), so the direction is the
 * nearest plane's and turns smoothly between planes. Returns Float32Array (xyz per vertex, unit); a vertex without
 * support data keeps `fallback` (its own normal) when given, else +z. */
export function envelopeNormals(positions, support, { tauMm = BRAIN_INK.relief.envTauMm, fallback = null } = {}) {
  const n = positions.length / 3, out = new Float32Array(3 * n);
  const s = support && support.support, d = support && support.dirs, k = s ? s.length : 0;
  const dist = new Float64Array(k), it = tauMm > 0 ? 1 / tauMm : 1;
  for (let v = 0; v < n; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    let mn = Infinity;
    for (let j = 0; j < k; j++) { const q = s[j] - (x * d[3 * j] + y * d[3 * j + 1] + z * d[3 * j + 2]); dist[j] = q; if (q < mn) mn = q; }
    let ex = 0, ey = 0, ez = 0;
    for (let j = 0; j < k; j++) { const t = (dist[j] - mn) * it; if (t > 12) continue; const w = Math.exp(-t); ex += w * d[3 * j]; ey += w * d[3 * j + 1]; ez += w * d[3 * j + 2]; }
    let L = Math.hypot(ex, ey, ez);
    if (!(L > 1e-9)) {
      if (fallback && fallback.length === positions.length) { ex = fallback[3 * v]; ey = fallback[3 * v + 1]; ez = fallback[3 * v + 2]; } else { ex = 0; ey = 0; ez = 1; }
      L = Math.hypot(ex, ey, ez) || 1;
    }
    out[3 * v] = ex / L; out[3 * v + 1] = ey / L; out[3 * v + 2] = ez / L;
  }
  return out;
}

/** The strip's own relief depth (pure; see the header): positions of every strip vertex (source mm), their envelope
 * normals, and the strip cloud (xyz of the strip meshes alone, or its foldGrid). Returns Float32Array (mm). */
export function reliefDepth(positions, envNormals, stripCloud, { ballMm = BRAIN_INK.relief.ballMm, radiusMm = BRAIN_INK.relief.radiusMm } = {}) {
  return foldDepth(positions, envNormals, stripCloud, { radiusMm, ballMm });
}

/** Glass that COVERS the strip (pure; BB2): for each glass vertex, 1 when it lies over the strip, i.e. within latFullMm
 * (fading to 0 at latMm) of the line from some strip vertex along that vertex's envelope normal, at most depthMm out;
 * else 0. Glass beside the strip (the neighbouring gyri's crowns and the walls of the sulci) is not over it and keeps
 * 0. glassLists: [xyz arrays]; stripPositions / stripEnv: xyz of every strip vertex and its envelope normal. Returns
 * [Float32Array per list]. Cost: about strip vertices x (depthMm / cellMm) x 27 cells of glass vertices. */
export function stripCover(glassLists, stripPositions, stripEnv, { depthMm = BRAIN_INK.cover.depthMm, latMm = BRAIN_INK.cover.latMm, latFullMm = BRAIN_INK.cover.latFullMm, cellMm = BRAIN_INK.cover.cellMm } = {}) {
  const lists = (glassLists || []).map(P => (P && P.length >= 3 ? P : new Float32Array(0)));
  const out = lists.map(P => new Float32Array(P.length / 3));
  const ns = stripPositions && stripEnv && stripEnv.length === stripPositions.length ? stripPositions.length / 3 : 0;
  if (!ns || !lists.length) return out;
  const offs = new Int32Array(lists.length + 1);
  lists.forEach((P, i) => { offs[i + 1] = offs[i] + P.length / 3; });
  const total = offs[lists.length], all = new Float32Array(3 * total);
  lists.forEach((P, i) => all.set(P, 3 * offs[i]));
  const G = foldGrid(all, cellMm), idx = new Int32Array(total);
  { // the grid keeps coordinates only; recover each point's index in the same order (counting sort by cell)
    const { o, dims, cell, start } = G, fill = start.slice(0, dims[0] * dims[1] * dims[2]);
    for (let g = 0; g < total; g++) {
      const c = (Math.floor((all[3 * g] - o[0]) / cell) * dims[1] + Math.floor((all[3 * g + 1] - o[1]) / cell)) * dims[2] + Math.floor((all[3 * g + 2] - o[2]) / cell);
      idx[fill[c]++] = g;
    }
  }
  const cover = new Float32Array(total), { o, dims, cell, start, pts } = G, L2 = latMm * latMm, F2 = latFullMm * latFullMm;
  for (let v = 0; v < ns; v++) {
    const sx = stripPositions[3 * v], sy = stripPositions[3 * v + 1], sz = stripPositions[3 * v + 2];
    const nx = stripEnv[3 * v], ny = stripEnv[3 * v + 1], nz = stripEnv[3 * v + 2];
    let last = -1;
    for (let t = 0; t <= depthMm + cell; t += cell) {
      const ci = Math.floor((sx + t * nx - o[0]) / cell), cj = Math.floor((sy + t * ny - o[1]) / cell), ck = Math.floor((sz + t * nz - o[2]) / cell);
      const key = (ci * dims[1] + cj) * dims[2] + ck;
      if (key === last) continue;
      last = key;
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
        if (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) continue;
        const c = (i * dims[1] + j) * dims[2] + k;
        for (let q = start[c]; q < start[c + 1]; q++) {
          const dx = pts[3 * q] - sx, dy = pts[3 * q + 1] - sy, dz = pts[3 * q + 2] - sz;
          const h = dx * nx + dy * ny + dz * nz;
          if (h <= 0 || h > depthMm) continue;
          const l2 = dx * dx + dy * dy + dz * dz - h * h;
          if (l2 >= L2) continue;
          const w = l2 <= F2 ? 1 : 1 - (l2 - F2) / (L2 - F2);
          const g = idx[q];
          if (w > cover[g]) cover[g] = w;
        }
      }
    }
  }
  lists.forEach((P, i) => out[i].set(cover.subarray(offs[i], offs[i + 1])));
  return out;
}

/** Relief depth (mm) -> relief share 0 (crown top) .. 1 (deep), 1 - exp(-depth / reliefMm), the same curve as the shader. */
export function reliefShare(depthMm, { reliefMm = BRAIN_INK.area.reliefMm } = {}) {
  const out = new Float32Array(depthMm.length);
  for (let i = 0; i < depthMm.length; i++) out[i] = 1 - Math.exp(-Math.max(0, depthMm[i]) / reliefMm);
  return out;
}

const glslFloat = x => (Number.isInteger(x) ? `${x}.0` : `${x}`);
/** GLSL of one anti-aliased ink line (R558 BB check): coverage at a distance d (drawing-buffer px) from the line's middle
 * for a half-width w (px). A line thinner than INK_MIN_HALF_PX keeps that half-width and fades by w / INK_MIN_HALF_PX
 * instead, so a hair line (the sulcus line, the strokes and the contours at Low quality, where w is a third of a pixel)
 * stays one even, faint line instead of breaking into dots where pixel centres miss it. */
export const INK_MIN_HALF_PX = 0.75;
const INK_LINE_GLSL = `float nsInkLine( float d, float w ) {
	float ww = max( w, ${glslFloat(INK_MIN_HALF_PX)} );
	return ( 1.0 - smoothstep( ww - 0.6, ww + 0.6, d ) ) * clamp( w / ${glslFloat(INK_MIN_HALF_PX)}, 0.0, 1.0 );
}
`;
const AREA_LIGHT_LINE = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const AREA_LIGHTS_INCLUDE = '#include <lights_physical_pars_fragment>';
const AREA_LIGHTS_BEGIN = '#include <lights_fragment_begin>';
const AREA_OPAQUE_HOOK = '#include <opaque_fragment>';
const AREA_LIGHTS_END = '#include <lights_fragment_end>';
const AREA_VERTEX_HOOK = '#include <begin_vertex>';
const AREA_SPEC_LINE = 'reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );';

/** GLSL of the four-tone band (uniforms nsCelS = steps + soft, nsCelL = levels) and the relief factor of the light
 * (nsRelK, set before the lights from the relief share nsRel01). */
const CEL_GLSL = `
float nsDirect = 0.0;
float nsDirectW = 0.0;
float nsRelK = 1.0;
float nsRel01 = 0.0;
float nsCelBand( float x ) {
	float s = max( nsCelS.w, 0.75 * fwidth( x ) );
	float b = mix( nsCelL.x, nsCelL.y, smoothstep( nsCelS.x - s, nsCelS.x + s, x ) );
	b = mix( b, nsCelL.z, smoothstep( nsCelS.y - s, nsCelS.y + s, x ) );
	return mix( b, nsCelL.w, smoothstep( nsCelS.z - s, nsCelS.z + s, x ) );
}
`;

/**
 * Motor-area ink patch (pure). Needs the per-fragment area patch first (its varyings vNsS, vNsCav and its uniform
 * nsLineW, whose w is the pixel ratio). lightsChunk: THREE.ShaderChunk.lights_physical_pars_fragment (for the bands;
 * without it, or when its N.L line is not found, the areas are drawn without bands and `cel` is false).
 * Vertex attribute nsRelief (the strip's relief depth, mm; a geometry without it reads 0: a crown everywhere).
 * Uniforms: nsInkC (ink rgb linear), nsCelS, nsCelL, nsAInk (contour half-width CSS, contour alpha, lip mm, lip half-width
 * CSS), nsAInk2 (lip alpha, strokes per s, stroke half-width CSS, stroke alpha), nsAHatch (hatchFrom, hatchFull,
 * denseFrom, denseFull), nsAHatch2 (reliefHatch, min spacing CSS, glow fade lo, hi), nsAFold (floorDark, floorFrom,
 * floorTo, indirect), nsARel (reliefMm, reliefDark, lightGamma, solid), nsARel2 (aoMin, fundus mm, fundus half-width
 * CSS, fundus alpha), nsAKey (the key light's direction in view space, unit), nsAGloss (power, sheen, coreLo, coreHi),
 * nsAGloss2 (core, -, -, -).
 * Returns { vertexShader, fragmentShader, cel } or null when a hook is missing.
 */
export function patchAreaInkShaders(vertexShader, fragmentShader, lightsChunk = null) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  if (!vertexShader.includes(AREA_VERTEX_HOOK)) return null;
  if (!fragmentShader.includes(AREA_OPAQUE_HOOK) || !fragmentShader.includes('varying float vNsCav') || !fragmentShader.includes('varying float vNsS') ||
    !fragmentShader.includes('uniform vec4 nsLineW') || !fragmentShader.includes('vViewPosition')) return null;
  let fs = fragmentShader;
  let cel = false;
  if (typeof lightsChunk === 'string' && lightsChunk.includes(AREA_LIGHT_LINE) && fs.includes(AREA_LIGHTS_INCLUDE) && fs.includes(AREA_LIGHTS_BEGIN)) {
    const banded = lightsChunk.replace(AREA_LIGHT_LINE,
      'float dotNL = nsCelBand( pow( saturate( dot( geometryNormal, directLight.direction ) ), nsARel.z ) * nsRelK );\n' +
      '\t{ float nsLum = dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) ); nsDirect += dotNL * nsLum; nsDirectW += nsLum; }');
    const spec = banded.includes(AREA_SPEC_LINE) ? banded.replace(AREA_SPEC_LINE, AREA_SPEC_LINE.replace('irradiance * BRDF_GGX', 'irradiance * pow( nsRelK, nsARel3.x ) * BRDF_GGX')) : banded;
    fs = fs.replace(AREA_LIGHTS_INCLUDE, CEL_GLSL + spec);
    cel = true;
  }
  const relief = '\tnsRel01 = 1.0 - exp( - max( vNsRel, 0.0 ) / max( nsARel.x, 1e-3 ) );\n\tnsRelK = 1.0 - nsARel.y * nsRel01;\n';
  if (cel) fs = fs.replace(AREA_LIGHTS_BEGIN, `${relief}${AREA_LIGHTS_BEGIN}`);
  const head = INK_LINE_GLSL + 'varying float vNsRel;\nuniform vec4 nsInkC;\nuniform vec4 nsCelS;\nuniform vec4 nsCelL;\nuniform vec4 nsAInk;\nuniform vec4 nsAInk2;\nuniform vec4 nsAHatch;\nuniform vec4 nsAHatch2;\nuniform vec4 nsAFold;\nuniform vec4 nsARel;\nuniform vec4 nsARel2;\nuniform vec4 nsARel3;\nuniform vec4 nsAKey;\nuniform vec4 nsAGloss;\nuniform vec4 nsAGloss2;\n' +
    (cel ? '' : 'float nsDirect = 1.0;\nfloat nsDirectW = 1.0;\nfloat nsRelK = 1.0;\nfloat nsRel01 = 0.0;\n');
  const body = `
	{
		${cel ? '' : relief}
		float nsPrI = max( nsLineW.w, 0.25 );
		// the gyrus contour: N.V = 0 of the smooth strip normals, a constant width on the screen
		float nsFace = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
		float nsFaceG = max( length( vec2( dFdx( nsFace ), dFdy( nsFace ) ) ), 1e-5 );
		float nsCont = nsInkLine( nsFace / nsFaceG, nsAInk.x * nsPrI );
		// the sulcus lines: the level lines of the strip's own relief at the lip (both sides of the gyrus, and round any
		// real dimple of the crown) and, finer, deeper on the bank
		float nsShade = nsDirectW > 0.0 ? nsDirect / nsDirectW : 1.0;
		float nsRg = max( length( vec2( dFdx( vNsRel ), dFdy( vNsRel ) ) ), 1e-6 );
		// a brush-like weight: the sulcus line is heavier where the light is low (the shadow side of the gyrus)
		float nsLipW = nsAInk.w * nsPrI * mix( 1.3, 0.8, smoothstep( 0.2, 0.9, nsShade ) );
		float nsLip = nsInkLine( abs( vNsRel - nsAInk.z ) / nsRg, nsLipW );
		float nsFun = nsInkLine( abs( vNsRel - nsARel2.y ) / nsRg, nsARel2.z * nsPrI );
		// hatching across the gyrus (level lines of the along-gyrus coordinate s) in the shadow and on the deep banks
		float nsHf = vNsS * nsAInk2.y;
		float nsHg = max( length( vec2( dFdx( nsHf ), dFdy( nsHf ) ) ), 1e-6 );
		float nsMin = nsAHatch2.y * nsPrI;
		float nsVis = smoothstep( nsMin, 1.6 * nsMin, 1.0 / nsHg );
		float nsHw = nsAInk2.z * nsPrI;
		float nsH1 = nsInkLine( abs( fract( nsHf + 0.5 ) - 0.5 ) / nsHg, nsHw );
		float nsH2 = nsInkLine( abs( fract( nsHf ) - 0.5 ) / nsHg, nsHw );
		float nsDark = max( 1.0 - smoothstep( nsAHatch.y, nsAHatch.x, nsShade ), nsAHatch2.x * smoothstep( 0.4, 0.85, nsRel01 ) );
		float nsDense = 1.0 - smoothstep( nsAHatch.w, nsAHatch.z, nsShade );
		float nsGlowK = 1.0 - smoothstep( nsAHatch2.z, nsAHatch2.w, dot( totalEmissiveRadiance, vec3( 0.2126, 0.7152, 0.0722 ) ) );
		// cross-hatching deep in the sulci: a second family along the relief's level lines (parallel to the sulcus), so the
		// deepest banks read as shade, not as more stripes beside the area borders
		float nsXf = vNsRel / max( nsARel3.y, 1e-3 );
		float nsXg = max( length( vec2( dFdx( nsXf ), dFdy( nsXf ) ) ), 1e-6 );
		float nsX = nsInkLine( abs( fract( nsXf ) - 0.5 ) / nsXg, nsHw ) * smoothstep( nsMin, 1.6 * nsMin, 1.0 / nsXg ) * smoothstep( nsARel3.z, nsARel3.w, nsRel01 );
		float nsHat = max( max( nsH1 * nsDark, nsH2 * nsDense ) * nsVis, nsX ) * nsAInk2.w * nsGlowK;
		// dark sulcal floors: the lit light falls off down the bank; the glow is kept (only a faint resting self-light,
		// under nsGlowK, falls off with it)
		float nsFloor = 1.0 - nsAFold.x * smoothstep( nsAFold.y, nsAFold.z, nsRel01 );
		// the faint resting self-light of the area's tint falls off down the banks like the flat fill (aoMin), so the
		// banks go dark; the activation glow (nsGlowK -> 0) is kept whole
		float nsAo = mix( 1.0, nsARel2.x, nsRel01 );
		// the reflected light kept at most white (R558 BB check): at the strip's grazing silhouette the specular term
		// spikes on single pixels, which the HDR target (bloom) turned into white sparkles along the strip's edge; only
		// the glow (emission) may go above white and bloom (style guide: selective bloom)
		// gloss (Message 54): a soft sheen and a crisp core of the key light along the gyrus crowns
		float nsGp = pow( max( dot( normalize( normal ), normalize( nsAKey.xyz + normalize( vViewPosition ) ) ), 0.0 ), nsAGloss.x );
		float nsGe = max( 0.5 * ( nsAGloss.w - nsAGloss.z ), fwidth( nsGp ) );
		float nsGm = 0.5 * ( nsAGloss.z + nsAGloss.w );
		float nsGloss = ( nsAGloss.y * nsGp + nsAGloss2.x * smoothstep( nsGm - nsGe, nsGm + nsGe, nsGp ) ) * pow( nsRelK, nsARel3.x );
		vec3 nsRefl = min( outgoingLight - totalEmissiveRadiance + vec3( nsGloss ), vec3( 1.0 ) );
		outgoingLight = totalEmissiveRadiance * mix( 1.0, nsFloor * nsAo, nsGlowK ) + nsRefl * nsFloor;
		float nsLine = max( nsCont * nsAInk.y, max( nsLip * nsAInk2.x, nsFun * nsARel2.w ) * nsGlowK );
		float nsInkA = max( nsLine, nsHat );
		outgoingLight = mix( outgoingLight, nsInkC.rgb, nsInkA );
		// solid (BB2): more solid than the material alpha, so the bands are not washed out by the black behind the strip
		diffuseColor.a = 1.0 - ( 1.0 - diffuseColor.a ) * ( 1.0 - nsARel.w );
		diffuseColor.a = max( diffuseColor.a, nsLine * 0.9 );
	}
`;
  fs = head + fs.replace(AREA_OPAQUE_HOOK, body + AREA_OPAQUE_HOOK);
  if (fs.includes(AREA_LIGHTS_END)) fs = fs.replace(AREA_LIGHTS_END, `${AREA_LIGHTS_END}\n\treflectedLight.indirectDiffuse *= nsAFold.w * mix( 1.0, nsARel2.x, nsRel01 );`);
  const vs = 'attribute float nsRelief;\nvarying float vNsRel;\n' + vertexShader.replace(AREA_VERTEX_HOOK, `${AREA_VERTEX_HOOK}\nvNsRel = nsRelief;`);
  return { vertexShader: vs, fragmentShader: fs, cel };
}

/** Uniform values (plain arrays) of the motor-area ink patch for BRAIN_INK. keyDir: the key light's direction in view
 * space (any length; the scene passes its camera-attached key light). Pure. */
export function areaInkUniformValues(o = BRAIN_INK, keyDir = [0.6, 1.5, 1.8]) {
  const a = o.area, g = a.gloss;
  const kl = Math.hypot(keyDir[0], keyDir[1], keyDir[2]) || 1;
  return {
    nsAKey: [keyDir[0] / kl, keyDir[1] / kl, keyDir[2] / kl, 0],
    nsAGloss: [g.power, g.sheen, g.coreLo, g.coreHi],
    nsAGloss2: [g.core, 0, 0, 0],
    nsInkC: [srgbToLinear(o.ink[0]), srgbToLinear(o.ink[1]), srgbToLinear(o.ink[2]), 1],
    nsCelS: [o.cel.steps[0], o.cel.steps[1], o.cel.steps[2], o.cel.soft],
    nsCelL: [o.cel.levels[0], o.cel.levels[1], o.cel.levels[2], o.cel.levels[3]],
    nsAInk: [a.contourCss, a.contourAlpha, a.lipMm, a.lipCss],
    nsAInk2: [a.lipAlpha, a.hatchPerS, a.hatchCss, a.hatchAlpha],
    nsAHatch: [a.hatchFrom, a.hatchFull, a.denseFrom, a.denseFull],
    nsAHatch2: [a.reliefHatch, a.hatchMinSpacingCss, a.glowFade[0], a.glowFade[1]],
    nsAFold: [a.floorDark, a.floorFrom, a.floorTo, a.indirect],
    nsARel: [a.reliefMm, a.reliefDark, a.lightGamma, a.solid],
    nsARel2: [a.aoMin, a.fundusMm, a.fundusCss, a.fundusAlpha],
    nsARel3: [a.specRelief, a.crossMm, a.crossFrom, a.crossFull]
  };
}

/** GLSL appended to the glass read patch (ns-scene-three glassReadGlsl; nsN, nsV, nsFacing, nsLam, nsG (the groove
 * 0 crown .. 1 groove), vNsNear and nsClear in scope, diffuseColor.a and outgoingLight set). Uniforms nsGInk (contour
 * half-width CSS, contour alpha, rim CSS, pixel ratio), nsGInk2 (rim light, rim alpha, fold ready 0..1, -), nsGHi
 * (power, lo, hi, light), nsGHi2 (alpha, fold level, fold half-width CSS, fold alpha), nsGCel (alpha, light, step1,
 * step2), nsGCel2 (soft, shadow share, -, -), nsInkG (ink rgb linear). `light` is the view-space key light. Pure. */
export function glassInkGlsl(light) {
  const L = light.map(glslFloat).join(', ');
  return `
{
	float nsPrG = max( nsGInk.w, 0.25 );
	float nsClr = 1.0 - nsClear * clamp( vNsNear, 0.0, 1.0 );
	// soft two-step cel shading of the crowns (BB2): the lit crowns get a pale fill, the shadow side less, the grooves none
	float nsCs = max( nsGCel2.x, 0.75 * fwidth( nsLam ) );
	float nsGb = mix( nsGCel2.y, 0.6, smoothstep( nsGCel.z - nsCs, nsGCel.z + nsCs, nsLam ) );
	nsGb = mix( nsGb, 1.0, smoothstep( nsGCel.w - nsCs, nsGCel.w + nsCs, nsLam ) );
	float nsCrown = 1.0 - smoothstep( 0.0, max( nsGHi2.y, 1e-3 ), nsG );
	outgoingLight *= 1.0 + nsGCel.y * nsGb * nsCrown;
	diffuseColor.a += nsGCel.x * nsGb * nsCrown * nsClr;
	// the atlas sulci inked: the level line of the glass fold depth at the lip of every sulcus
	float nsFgr = max( length( vec2( dFdx( nsG ), dFdy( nsG ) ) ), 1e-6 );
	float nsFold = nsInkLine( abs( nsG - nsGHi2.y ) / nsFgr, nsGHi2.z * nsPrG ) * nsGInk2.z;
	float nsFg = max( length( vec2( dFdx( nsFacing ), dFdy( nsFacing ) ) ), 1e-5 );
	float nsDc = abs( nsFacing ) / nsFg;
	float nsWc0 = nsGInk.x * nsPrG;
	float nsWc = max( nsWc0, ${glslFloat(INK_MIN_HALF_PX)} );
	float nsCt = ( 1.0 - smoothstep( nsWc - 0.6, nsWc + 0.6, nsDc ) ) * clamp( nsWc0 / ${glslFloat(INK_MIN_HALF_PX)}, 0.0, 1.0 );
	float nsWr = nsWc + nsGInk.z * nsPrG;
	float nsRimB = ( 1.0 - smoothstep( nsWr - 0.8, nsWr + 0.8, nsDc ) ) * ( 1.0 - nsCt );
	vec3 nsHv = normalize( normalize( vec3( ${L} ) ) + nsV );
	float nsSp = pow( max( dot( nsN, nsHv ), 0.0 ), nsGHi.x );
	float nsHiA = smoothstep( nsGHi.y, nsGHi.z, nsSp );
	// only a highlight with a real shape: where the coarse glass mesh turns the step into a speck under ~2 px across (its
	// soft edge narrower than a pixel), it is left out, so the glass shows no dust and no sparkle while the view turns
	nsHiA *= smoothstep( 1.0, 2.5, ( nsGHi.z - nsGHi.y ) / max( fwidth( nsSp ), 1e-6 ) );
	float nsInkGl = max( nsCt * nsGInk.y, nsFold * nsGHi2.w );
	outgoingLight = mix( outgoingLight, nsInkG, max( nsCt, nsFold ) );
	outgoingLight += vec3( nsGInk2.x * nsRimB + nsGHi.w * nsHiA );
	diffuseColor.a = max( diffuseColor.a, nsClr * max( nsInkGl, max( nsRimB * nsGInk2.y, nsHiA * nsGHi2.x ) ) );
}
`;
}

/** The ink-line GLSL helper for the glass patch (the area patch carries its own). */
export const GLASS_INK_HEAD = INK_LINE_GLSL;

/** Uniform values of the glass ink for BRAIN_INK (w of nsGInk is the pixel ratio, set per frame; z of nsGInk2 is the
 * fold-ready share, 0 until the glass fold depth is computed). Pure. */
export function glassInkUniformValues(o = BRAIN_INK) {
  const g = o.glass;
  return {
    nsGInk: [g.contourCss, g.contourAlpha, g.rimCss, 1],
    nsGInk2: [g.rimLight, g.rimAlpha, 0, 0],
    nsGHi: [g.highlight.power, g.highlight.lo, g.highlight.hi, g.highlight.light],
    nsGHi2: [g.highlight.alpha, g.foldLevel, g.foldCss, g.foldAlpha],
    nsGCel: [g.cel.alpha, g.cel.light, g.cel.step1, g.cel.step2],
    nsGCel2: [g.cel.soft, g.cel.shadow, 0, 0],
    nsInkG: [srgbToLinear(o.ink[0]), srgbToLinear(o.ink[1]), srgbToLinear(o.ink[2])]
  };
}
