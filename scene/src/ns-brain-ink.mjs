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

import { BRAIN_LIVE, liveBloomGlsl } from './ns-brain-live.mjs';
import { AREA_HALO, haloTissueGlsl } from './ns-area-halo.mjs';
import { RAW_LOOK, rawLightDir, rawShadeGlsl } from './ns-raw-look.mjs';

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
  cel: Object.freeze({ steps: Object.freeze([0.14, 0.38, 0.72]), levels: Object.freeze([0.3, 0.55, 0.8, 1.0]), soft: 0.035 }),
  area: Object.freeze({
    // 19 November 2026 (the owner: "the motor strip is just very, very hard to look at right now because it's so liney
    // ... There has to be a better solution, an overhaul"): the strip's inked relief lines are gone (the gyrus contour
    // 0.8 -> 0.15, the sulcus line 0.8 -> 0 and the finer bank line 0.55 -> 0) and its relief shading is gentler
    // (reliefDark 0.6 -> 0.3, floorDark 0.15 -> 0), with no gloss: each area is one clean block of its own colour.
    contourCss: 1.05, contourAlpha: 0.15,
    lipMm: 1.5, lipCss: 1.0, lipAlpha: 0, fundusMm: 7, fundusCss: 0.45, fundusAlpha: 0,
    reliefMm: 1.5, reliefDark: 0.3, lightGamma: 0.6, aoMin: 0.6, specRelief: 2, crossMm: 1.6, crossFrom: 0.7, crossFull: 0.95,
    floorDark: 0, floorFrom: 0.55, floorTo: 1.0, indirect: 0.6, solid: 0.96,
    hatchPerS: 150, hatchCss: 0.42, hatchAlpha: 0, hatchFrom: 0.2, hatchFull: 0.06, denseFrom: 0.1, denseFull: 0.02,
    reliefHatch: 0.85, hatchMinSpacingCss: 4, glowFade: Object.freeze([0.3, 0.7]),
    gloss: Object.freeze({ power: 20, sheen: 0, coreLo: 0.8, coreHi: 0.86, core: 0 })
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

/** The motor areas as KEYS of a control panel (owner, 17 November: "the brain turns into a bunch of buttons ... a
 * control panel"; "neural activation should be much more obvious on the motor strip"; 12 November: "only small regions
 * should be activating"). Drawn in the area patch below from what the per-fragment area patch already knows (the
 * distance in CSS pixels to the area's two borders along the strip) and one small per-area uniform, nsKey = (hovered
 * 0 / 1, the clock time of the last press, -, the glow strength 0..1). No new draw, no texture.
 *  - bevel: inside each border a band bevelCss wide (at most bevelShare of the key's width) is lightened where that edge faces the key light on the screen and
 *    darkened where it faces away (bevelLight / bevelDark, plus a small white edge bevelSpec), so every area reads as a
 *    separate raised key next to the dark gap the border patch draws (ns-scene-three REGION_BORDER seam); toward both
 *    borders the key's lit colour also falls off a little (pillowDark over pillowCss), like a rounded key top.
 *  - hover: the scene lights the hovered key (its own colour as emission) and frames it; here its bevel is stronger
 *    (hoverBevel).
 *  - press: for pressS after a press (a click, a number key, a held look: one more activation count) the key goes
 *    DOWN: the bevel turns over, the key darkens by pressDark and a solid dark frame pressCss wide (at most pressShare
 *    of the key's width) closes in from its borders (full until pressHoldS, then it springs back), so the flash of
 *    the activation is seen inside a key that is going down and coming up again. Not under prefers-reduced-motion.
 *  - on: while the area glows, ONLY that key shows a white-hot frame just inside its borders (frameCss wide, frameGain
 *    x the glow, whitened by frameWhite), a slow pulse of the whole key (pulse at pulseHz) and a ring that runs from
 *    the key's middle out to its edges again and again (ringHz, width ringW in key radii, ringGain x the glow, fading
 *    as it grows; the key's radius is 1 at its borders along the strip and at ringReliefMm of relief depth across the
 *    gyrus). Under prefers-reduced-motion the frame and the glow are steady and there is no pulse or ring. The glow
 *    itself is above display white (ns-colors AREA_LOOK.areaGain), so the scene's bloom gives the lit key a halo.
 *  - focus: while any area is switched on, every key that is neither lit nor hovered is dimmed by focusDim (the shared
 *    uniform nsKeyDim.x, eased by the scene over focusInS / focusOutS), so the lit key is the one bright thing on the
 *    strip. A glow that only shows a held posture (the scene's postureGlow) does not count as switched on.
 * Display choices; timings are UI choices, not physiology. */
export const BRAIN_KEYS = Object.freeze({
  // 19 November 2026 ("so liney"): a much softer bevel and pillow (0.7 / 0.55 / 0.28 and 0.38 before): a key is a flat
  // block of colour with barely a rounded edge.
  bevelCss: 5, bevelShare: 0.3, bevelLight: 0.18, bevelDark: 0.14, bevelSpec: 0, hoverBevel: 1.5, pillowCss: 8, pillowShare: 0.4, pillowDark: 0.1,
  pressS: 0.2, pressHoldS: 0.07, pressDark: 0.45, pressCss: 4, pressShare: 0.3,
  // 18 November (MAP): the lit key's frame in its own colour (frameWhite 0.3 -> 0.1): the white-hot frame turned the
  // whole lit key white under the bloom; the neon glow is saturated now.
  // 21 November 2026 (ns-area-halo AREA_LIT; the owner: "Right now, there's essentially no glow"): frameGain 2.0 -> 0.
  // The lit block's light along its borders is now the area's own colour at the screen's full brightness (AREA_LIT's
  // rim); the frame's extra 2 x of it went past white per channel, where the screen cuts each channel off, so an azure
  // key's frame showed cyan-white and an orange key's yellow, and with the bloom pass it was a second white halo.
  frameCss: 2.2, frameShare: 0.12, frameGain: 0, frameWhite: 0.1, pulse: 0.22, pulseHz: 1.1,
  ringHz: 0.9, ringW: 0.16, ringGain: 1.1, ringSpan: 1.5, ringReliefMm: 9,
  focusDim: 0.5, focusInS: 0.12, focusOutS: 0.45
});

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
 * Returns { vertexShader, fragmentShader, cel, keys, clock } or null when a hook is missing (keys / clock: whether the
 * key look and its timed parts were added, BRAIN_KEYS; they need the per-area uniform nsKey).
 */
// 20 November 2026 (the owner, Message 196: "New look for everything not just body"; the strip's areas "keep their colours
// (they are the game's information) but are drawn in the same matte light"): with `raw` (ns-raw-look RAW_LOOK, the
// default while its switch is on) the areas' lit colour is their own colour x the raw look's light (no cel bands of the
// key light, no gloss); areaInkUniformValues(..., raw) turns the ink lines, the hatching and the dark sulcal floors off.
// The glow, the hover light, the keys' press, frame, pulse and ring are signals and stay.
// (20 November 2026: a material that defines NS_PLAIN_AREA, the strip's inter-effector areas drawn as the brain, gets
// none of the keys' bevel, press, frame, pulse or ring)
export function patchAreaInkShaders(vertexShader, fragmentShader, lightsChunk = null, raw = RAW_LOOK.on ? RAW_LOOK : null) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  if (!vertexShader.includes(AREA_VERTEX_HOOK)) return null;
  if (!fragmentShader.includes(AREA_OPAQUE_HOOK) || !fragmentShader.includes('varying float vNsCav') || !fragmentShader.includes('varying float vNsS') ||
    !fragmentShader.includes('uniform vec4 nsLineW') || !fragmentShader.includes('vViewPosition')) return null;
  let fs = fragmentShader;
  // 17 November (BRAIN_KEYS): the keys need the border patch's run distances; the press, the pulse and the ring also
  // the power-up patch's clock (without it they are left out and the frame is steady).
  const keys = fragmentShader.includes('float nsDLo') && fragmentShader.includes('nsKHi') && fragmentShader.includes('float nsSv');
  const clock = keys && fragmentShader.includes('uniform vec4 nsClock');
  const K = BRAIN_KEYS, kf = glslFloat;
  let cel = false;
  if (!raw && typeof lightsChunk === 'string' && lightsChunk.includes(AREA_LIGHT_LINE) && fs.includes(AREA_LIGHTS_INCLUDE) && fs.includes(AREA_LIGHTS_BEGIN)) {
    const banded = lightsChunk.replace(AREA_LIGHT_LINE,
      'float dotNL = nsCelBand( pow( saturate( dot( geometryNormal, directLight.direction ) ), nsARel.z ) * nsRelK );\n' +
      '\t{ float nsLum = dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) ); nsDirect += dotNL * nsLum; nsDirectW += nsLum; }');
    const spec = banded.includes(AREA_SPEC_LINE) ? banded.replace(AREA_SPEC_LINE, AREA_SPEC_LINE.replace('irradiance * BRDF_GGX', 'irradiance * pow( nsRelK, nsARel3.x ) * BRDF_GGX')) : banded;
    fs = fs.replace(AREA_LIGHTS_INCLUDE, CEL_GLSL + spec);
    cel = true;
  }
  const relief = '\tnsRel01 = 1.0 - exp( - max( vNsRel, 0.0 ) / max( nsARel.x, 1e-3 ) );\n\tnsRelK = 1.0 - nsARel.y * nsRel01;\n';
  if (cel) fs = fs.replace(AREA_LIGHTS_BEGIN, `${relief}${AREA_LIGHTS_BEGIN}`);
  const head = INK_LINE_GLSL + 'varying float vNsRel;\nuniform vec4 nsInkC;\nuniform vec4 nsCelS;\nuniform vec4 nsCelL;\nuniform vec4 nsAInk;\nuniform vec4 nsAInk2;\nuniform vec4 nsAHatch;\nuniform vec4 nsAHatch2;\nuniform vec4 nsAFold;\nuniform vec4 nsARel;\nuniform vec4 nsARel2;\nuniform vec4 nsARel3;\nuniform vec4 nsAKey;\nuniform vec4 nsAGloss;\nuniform vec4 nsAGloss2;\nuniform vec4 nsKey;\nuniform vec4 nsKeyDim;\n' +
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
		${raw ? `${rawShadeGlsl('nsRawK', 'normal', 'vViewPosition', raw)}
		vec3 nsRefl = min( diffuseColor.rgb * nsRawK, vec3( 1.0 ) );` : 'vec3 nsRefl = min( outgoingLight - totalEmissiveRadiance + vec3( nsGloss ), vec3( 1.0 ) );'}
		vec3 nsEmit = totalEmissiveRadiance;
		float nsKfr = 0.0;
		#ifndef NS_PLAIN_AREA
		${keys ? `// the keys (BRAIN_KEYS): bevel, press, and the lit key's frame, pulse and ring
		float nsKlo = nsKLo >= 1.0 ? nsDLo : 1e6, nsKhi = nsKHi >= 1.0 ? nsDHi : 1e6;
		float nsKedge = min( nsKlo, nsKhi );
		float nsKpress = 0.0;
		${clock ? `{ float nsKage = nsClock.x - nsKey.y; nsKpress = nsClock.y > 0.5 || nsKage < 0.0 ? 0.0 : 1.0 - smoothstep( ${kf(K.pressHoldS)}, ${kf(K.pressS)}, nsKage ); }` : ''}
		vec2 nsKg = vec2( dFdx( vNsS ), dFdy( vNsS ) );
		nsKg /= max( length( nsKg ), 1e-9 );
		float nsKw = min( nsKlo + nsKhi, 1e4 ); // the key's width (CSS px); a narrow key gets narrower bands
		float nsKbw = min( ${kf(K.bevelCss)}, ${kf(K.bevelShare)} * nsKw );
		float nsKb = ( smoothstep( 0.0, nsKbw, nsKlo ) - smoothstep( 0.0, nsKbw, nsKhi ) ) * dot( nsKg, normalize( nsAKey.xy ) );
		nsKb *= ( 1.0 - 2.0 * nsKpress ) * mix( 1.0, ${kf(K.hoverBevel)}, nsKey.x );
		nsRefl = nsRefl * ( 1.0 + ${kf(K.bevelLight)} * max( nsKb, 0.0 ) - ${kf(K.bevelDark)} * max( - nsKb, 0.0 ) ) + vec3( ${kf(K.bevelSpec)} * max( nsKb, 0.0 ) );
		nsRefl = min( nsRefl, vec3( 1.0 ) ) * ( 1.0 - ${kf(K.pressDark)} * nsKpress ) * ( 1.0 - ${kf(K.pillowDark)} * ( 1.0 - smoothstep( 0.0, min( ${kf(K.pillowCss)}, ${kf(K.pillowShare)} * nsKw ), nsKedge ) ) );
		{ float nsKdim = 1.0 - ${kf(K.focusDim)} * nsKeyDim.x * ( 1.0 - nsKey.x ) * ( 1.0 - step( 1e-4, nsKey.w ) ); nsRefl *= nsKdim; nsEmit *= nsKdim; }
		if ( nsKey.w > 0.0 ) {
			float nsKmax = max( nsEmit.r, max( nsEmit.g, nsEmit.b ) );
			vec3 nsKc = mix( nsEmit / max( nsKmax, 1e-4 ), vec3( 1.0 ), ${kf(K.frameWhite)} );
			float nsKaa = max( 0.6, ${kf(INK_MIN_HALF_PX)} / nsPrI );
			float nsKfw = min( ${kf(K.frameCss)}, ${kf(K.frameShare)} * nsKw ); // a narrow key keeps most of its width for its own colour
			nsKfr = ( 1.0 - smoothstep( nsKfw - nsKaa, nsKfw + nsKaa, nsKedge - nsLineW.x ) ) * smoothstep( nsLineW.x - nsKaa, nsLineW.x + nsKaa, nsKedge );
			float nsKmove = 1.0, nsKring = 0.0;
			${clock ? `if ( nsClock.y < 0.5 ) {
				nsKmove = 1.0 + ${kf(K.pulse)} * sin( 6.2831853 * ${kf(K.pulseHz)} * ( nsClock.x - nsCharge.x ) );
				float nsKlo01 = clamp( nsLo, 0.0, 1.0 ), nsKhi01 = clamp( nsHiS, 0.0, 1.0 );
				float nsKu = abs( nsSv - 0.5 * ( nsKlo01 + nsKhi01 ) ) / max( 0.5 * ( nsKhi01 - nsKlo01 ), 1e-4 );
				float nsKrad = length( vec2( nsKu, max( vNsRel, 0.0 ) / ${kf(K.ringReliefMm)} ) );
				float nsKph = fract( ( nsClock.x - nsCharge.x ) * ${kf(K.ringHz)} );
				float nsKd = ( nsKrad - nsKph * ${kf(K.ringSpan)} ) / ${kf(K.ringW)};
				nsKring = exp( - nsKd * nsKd ) * ( 1.0 - nsKph );
			}` : ''}
			nsEmit = nsEmit * ( nsKmove + ${kf(K.ringGain)} * nsKring ) + nsKc * ( ${kf(K.frameGain)} * nsKey.w * nsKfr * nsKmove );
		}` : ''}
		#endif
		outgoingLight = nsEmit * mix( 1.0, nsFloor * nsAo, nsGlowK ) + nsRefl * nsFloor;
		float nsLine = max( nsCont * nsAInk.y, max( nsLip * nsAInk2.x, nsFun * nsARel2.w ) * nsGlowK ) * ( 1.0 - nsKfr );
		float nsInkA = max( nsLine, nsHat );
		outgoingLight = mix( outgoingLight, nsInkC.rgb, nsInkA );
		#ifndef NS_PLAIN_AREA
		${keys ? `{ // the press: a dark frame closes in from the key's borders
			float nsKin = min( ${kf(K.pressCss)}, ${kf(K.pressShare)} * nsKw ) * nsKpress;
			outgoingLight = mix( outgoingLight, nsInkC.rgb, min( 1.0, 3.0 * nsKpress ) * ( 1.0 - smoothstep( nsKin - 0.7, nsKin + 0.7, nsKedge ) ) );
		}` : ''}
		#endif
		// solid (BB2): more solid than the material alpha, so the bands are not washed out by the black behind the strip
		diffuseColor.a = 1.0 - ( 1.0 - diffuseColor.a ) * ( 1.0 - nsARel.w );
		diffuseColor.a = max( diffuseColor.a, nsLine * 0.9 );
	}
`;
  fs = head + fs.replace(AREA_OPAQUE_HOOK, body + AREA_OPAQUE_HOOK);
  if (fs.includes(AREA_LIGHTS_END)) fs = fs.replace(AREA_LIGHTS_END, `${AREA_LIGHTS_END}\n\treflectedLight.indirectDiffuse *= nsAFold.w * mix( 1.0, nsARel2.x, nsRel01 );`);
  const vs = 'attribute float nsRelief;\nvarying float vNsRel;\n' + vertexShader.replace(AREA_VERTEX_HOOK, `${AREA_VERTEX_HOOK}\nvNsRel = nsRelief;`);
  return { vertexShader: vs, fragmentShader: fs, cel, keys, clock };
}

/** Uniform values (plain arrays) of the motor-area ink patch for BRAIN_INK. keyDir: the key light's direction in view
 * space (any length; the scene passes its camera-attached key light). Pure. */
export function areaInkUniformValues(o = BRAIN_INK, keyDir = [0.6, 1.5, 1.8], raw = RAW_LOOK.on) {
  const a0 = o.area, g = a0.gloss;
  // 20 November 2026 (the raw look): no contour, sulcus, fundus or hatch ink and no darkened sulcal floor
  const a = raw ? { ...a0, contourAlpha: 0, lipAlpha: 0, hatchAlpha: 0, fundusAlpha: 0, floorDark: 0, reliefHatch: 0 } : a0;
  const kl = Math.hypot(keyDir[0], keyDir[1], keyDir[2]) || 1;
  return {
    nsAKey: [keyDir[0] / kl, keyDir[1] / kl, keyDir[2] / kl, 0],
    nsAGloss: [g.power, g.sheen, g.coreLo, g.coreHi],
    nsAGloss2: [g.core, 0, 0, 0],
    nsKeyDim: [0, 0, 0, 0],
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

/* ------------------------------------------------------------------ the fleshy cortex (17 November) */

/** The brain surface as LIVING CORTEX (owner, 17 November: "The brain area looks awful ... Maybe it should be far more
 * fleshy"; earlier: "visceral and fleshy but never disgusting", "clinical", "a bit of shine, a bit of glossiness",
 * "contrast and high dynamic range are still visually key").
 * Until now the brain was a glass shell: a face-on alpha of 0.01 with a pale rim, so at the start it read as a dark
 * glass ornament. The shell pass (still ONE draw of the nearest surface, after its depth pre-pass; no new pass, no
 * texture) now shades that surface as tissue:
 *  - colour: a warm pink-grey on the gyral crowns that deepens to a dark rose down the sulci (the same per-vertex fold
 *    depth the glass used: 0 crown .. 1 groove), with a faint mottling fixed to the tissue (two octaves of value noise
 *    of the atlas position, mottleMm / mottleFineMm across), so the surface is not one flat paint; the same mottling
 *    is a height of bumpMm for a derivative bump of the normal (the atlas mesh has about 1.7 mm facets; the bump breaks
 *    their flat highlights up), faded out when its grain would be finer than about bumpFadePx pixels;
 *  - light: the scene's key light (the camera headlight, upper right), wrapped by `wrap` because tissue scatters, over
 *    a small flat fill; a fold keeps aoMin of both at its floor, so every sulcus is a dark line and every gyrus a
 *    rounded, lit fold (light-to-dark range); what the key light does not reach is filled a little with a warm red
 *    (scatter), so the shaded side stays tissue-coloured, never grey;
 *  - wet: a soft sheen (sheen x (N.H)^sheenPower) and a small crisp glint (glint inside the step glintLo .. glintHi of
 *    (N.H)^glintPower) of the key light on the crowns, both off in the sulci, like a moist surface under an examination
 *    lamp; the reflected light is kept at or under white, so it never blooms or sparkles (only the activation glows may);
 *  - rim: a faint pale rim toward the silhouette (the shell's rim uniforms: stronger while the brain is held);
 *  - solid: alpha `alpha` face-on and rimAlpha at the silhouette (a little see-through at the very edge, so a hand or the
 *    mirror body crossing the outline is not cut hard). Next to and over the motor strip the surface still clears
 *    (the scene's GLASS_CLEAR attribute), so the motor areas are seen whole, as before.
 * Colours are sRGB 0..1 as drawn face-on in full light. Display choices only: no tissue optics are implied.
 * 18 November (owner: "make sure the brain and the body are noticeably different, or at least noticeably different
 * shades"): living cortex is a pale, cool pearl-grey rose, not the salmon of the muscles. crown [0.87, 0.7, 0.69] ->
 * [0.9, 0.85, 0.86], groove [0.4, 0.16, 0.2] -> [0.56, 0.4, 0.46] (a mauve rose, no longer a red-brown), mottleWarm
 * [1, 0.9, 0.88] -> [1, 0.95, 0.96], scatterTint [1, 0.34, 0.3] -> [0.95, 0.62, 0.7] (the shaded side stays rose,
 * not red), rim [1, 0.82, 0.8] -> [0.92, 0.9, 0.96] (a pearly film). Measured at the start view (fixed patches,
 * CIE L* of the mean colour): brain 46.7 / muscle 43.5 before, see the vessels notes for after. */
export const BRAIN_FLESH = Object.freeze({
  // 19 November 2026 (the owner: "surely the brain should be a little more pinkish, fleshy"): crown 0.9, 0.85, 0.86 ->
  // a soft flesh pink, the grooves a deeper rose (0.56, 0.4, 0.46 before).
  crown: Object.freeze([0.93, 0.74, 0.73]), groove: Object.freeze([0.6, 0.33, 0.36]), grooveCurve: 0.8,
  mottle: 0.18, mottleMm: 11, mottleFineMm: 3.2, mottleWarm: Object.freeze([1.0, 0.95, 0.96]), bumpMm: 0.5, bumpFadePx: 5,
  key: 1.0, wrap: 0.35, fill: 0.2, aoMin: 0.22,
  scatter: 0.22, scatterTint: Object.freeze([0.95, 0.62, 0.7]),
  // 19 November 2026 (the owner, later the same day: "let's make the rest of the brain look a little yummy, like food.
  // So it's actually okay for the brain to be a little glossy and slimy"): the wet sheen and the glint are back and a
  // little stronger and broader than on 18 November (sheen 0.2 at power 28, glint 0.42, wetGroove 0.9 then; all were 0
  // for the matte look of this morning). The body and the strip's keys stay matte.
  sheen: 0.34, sheenPower: 16, glint: 0.6, glintPower: 140, glintLo: 0.5, glintHi: 0.72, wetGroove: 0.75,
  rim: Object.freeze([0.92, 0.9, 0.96]), rimGain: 0.55,
  alpha: 0.97, rimAlpha: 0.8,
  // 18 November (package VESSELS): no procedural vessels any more. The arteries are the BodyParts3D cerebral arteries
  // and the veins and sinuses are laid along this brain's landmarks (ns-vessels), drawn as their own meshes; the noise
  // lines below drew vessels that followed no anatomy and would now stand beside the real ones.
  vessel: null
});
/** 20 November 2026 (the owner, Message 196: "New look for everything not just body"): the cortex in the RAW look
 * (ns-raw-look): the same fleshy pink of its own (Message 153; the crown and groove colours above are kept, so the folds
 * still read by their colour), lit by the raw look's one light (ambient + direct x |N.L|, nothing else), with no wet
 * sheen or glint (Message 163's gloss and slime give way to this later note), no fold darkening laid over the light
 * (raw.ao 0), no tissue scatter, no mottling and no bump (a clean surface like the reference pictures). The pale rim is
 * drawn only as the held-brain cue (the rim's opacity above its resting MATERIAL.glassRimOpacity, `raw.rimFrom`, times
 * raw.rimGain): a control's feedback, not a look. The beat's flush, the blooms round a lit key and the faint tint of the
 * picked area's colour stay (signals). */
export const BRAIN_FLESH_RAW = Object.freeze({
  ...BRAIN_FLESH,
  // the crown and the grooves a little lighter and pinker than BRAIN_FLESH's (0.93, 0.74, 0.73 and 0.6, 0.33, 0.36): the
  // raw light gives a surface facing the viewer 0.76 of its colour (the old key and fill about 1.0), and the brain read
  // as a dull mauve; this keeps it the fleshy pink of Message 153, still paler and pinker than the muscles' reds
  crown: Object.freeze([0.98, 0.79, 0.78]), groove: Object.freeze([0.7, 0.42, 0.45]),
  mottle: 0, bumpMm: 0, scatter: 0, sheen: 0, glint: 0, rimGain: 0,
  raw: Object.freeze({ ao: 0, rimFrom: 0.34, rimGain: 2.4 })
});
/** The cortex look in force: BRAIN_FLESH_RAW under the raw look's switch (RAW_LOOK.on), else BRAIN_FLESH. */
export const BRAIN_FLESH_LOOK = RAW_LOOK.on ? BRAIN_FLESH_RAW : BRAIN_FLESH;
/** 21 November 2026 (the owner, Message 177: "have the whole brain light up slightly, faintly, with whatever color
 * area is being picked"; a browser hunt, H25: on the matte brain the whole cortex turned lilac or grey-blue). The pick
 * tint was a light ADDED to the cortex: 6 % of the area's saturated glow colour. The cortex is a pale pink (OKLCH chroma
 * about 0.05) with little blue, and the matte light leaves much of it in shade, so the same added light turned its hue
 * by 15 degrees where it faced the light and by 25 to 30 in shade: a recolouring, not a faint light. Now it is a GAIN on
 * the cortex's own colour, the same share in light and shade (so the same faint change everywhere), worked out in OKLab
 * from the crown colour: lightness up by `lift` (it lights up), and the colour moved `chroma` toward the area's own hue
 * (a faint cast of that colour), its chroma never under `keepChroma` of the cortex's own (a cool colour on the pink does
 * not grey it). The change of the crown colour is about 0.02 in OKLab (lift and cast together): seen side by side,
 * never a different colour. Display choices. */
export const BRAIN_PICK_LOOK = Object.freeze({ lift: 0.014, chroma: 0.012, keepChroma: 0.85 });
const okOfLinear = (c, o) => {
  const l = Math.cbrt(Math.max(0, 0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]));
  o[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  o[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  o[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return o;
};
const linearOfOk = (L, a, b, o) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  o[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  o[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  o[2] = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return o;
};
const pickRef = [0, 0, 0], pickOk = [0, 0, 0], pickG = [0, 0, 0], pickT = [0, 0, 0];
/** The pick tint as a gain (BRAIN_PICK_LOOK): writes out[0..2] = the share x (the tinted crown / the crown - 1) per
 * linear channel, for the cortex shader's `nsCol *= 1.0 + nsPickTint`. glowLinear: the picked area's glow colour
 * (linear rgb); share 0..1 (0: none). A colour of little hue (an in-between area's near-white glow, OKLab chroma under
 * 0.1) casts in proportion; one of none only lifts. Pure. */
export function brainPickGainInto(out, glowLinear, share = 1, flesh = BRAIN_FLESH_LOOK, P = BRAIN_PICK_LOOK) {
  const k = Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 0;
  if (!(k > 0) || !glowLinear) { out[0] = out[1] = out[2] = 0; return out; }
  for (let i = 0; i < 3; i++) pickRef[i] = srgbToLinear(flesh.crown[i]);
  okOfLinear(pickRef, pickOk); okOfLinear(glowLinear, pickG);
  const gc = Math.hypot(pickG[1], pickG[2]), c0 = Math.hypot(pickOk[1], pickOk[2]);
  let a = pickOk[1], b = pickOk[2];
  if (gc > 1e-4) { const t = P.chroma * Math.min(1, gc / 0.1) / gc; a += t * pickG[1]; b += t * pickG[2]; } // (a near-grey glow: a fainter cast)
  const c1 = Math.hypot(a, b), keep = P.keepChroma * c0;
  if (c1 < keep && c1 > 1e-9) { a *= keep / c1; b *= keep / c1; }
  linearOfOk(pickOk[0] + P.lift, a, b, pickT);
  for (let i = 0; i < 3; i++) out[i] = k * (Math.max(0, pickT[i]) / Math.max(pickRef[i], 1e-6) - 1);
  return out;
}
/** The procedural vessel lines of 18 November (cortexVesselGlsl's parameters), kept for reference; BRAIN_FLESH.vessel is
 * null since the anatomical vessels (ns-vessels) replaced them. */
export const PROCEDURAL_VESSELS = Object.freeze({
  warpMm: 9, warpAcrossMm: 17,
  artery: Object.freeze([0.74, 0.1, 0.1]), arteryMm: 0.7, arteryAcrossMm: 15, arteryAlpha: 0.66,
  fine: Object.freeze([0.8, 0.2, 0.2]), fineMm: 0.34, fineAcrossMm: 6, fineAlpha: 0.5, twigMm: 10, twigTip: 0.3,
  vein: Object.freeze([0.36, 0.17, 0.45]), veinMm: 1.25, veinLevel: 0.33, veinWander: 0.16, veinAlpha: 0.46, veinAcrossMm: 24, veinShare: 0.55,
  pulse: 0.3, minPx: 0.3, fullPx: 0.7, endSlope: 0.12, runSlope: 0.38
});

/** The fine surface vessels (18 November; owner: "far more fleshy", "hyper-detailed hyper-real glossy fleshy but not
 * gory"): thin bright arteries that wander over the gyral crowns in two sizes, and darker veins that run ALONG the
 * grooves, all fixed to the tissue. No texture and no new draw: each family is the level line of something the shader
 * already has or can get from the tissue-fixed value noise:
 *  - arteries: the 0.5 level of one value-noise field of the (gently warped) atlas position, arteryAcrossMm across,
 *    drawn arteryMm wide: the trunks. They fade into the grooves, where they dive under, and their width follows the
 *    mottling, so a trunk thickens and thins along its way. Where the field is nearly flat (its slope under endSlope
 *    .. runSlope) a level line would close into a small ring: there the vessel fades out instead, so the eye sees
 *    runs that end, not rings;
 *  - their branches (18 November, after the check: single hairlines that "wander and stop" and never branch read as
 *    squiggles close up): the finer family (fineAcrossMm, fineMm) is drawn ONLY as twigs that leave a trunk: from the
 *    trunk out to twigMm from it, on one side of the trunk at a time (the side changes slowly along the trunk), and
 *    each twig thins from fineMm at the trunk to twigTip of that at its end. So the picture is trunks that give off
 *    side branches that taper out, not loose lines;
 *  - veins: a level of the fold depth itself (veinLevel, wandering by veinWander with the mottling), so a vein follows
 *    its sulcus round every bend, just inside the lip of the groove; only veinShare of the sulci carry one (a slow
 *    noise field veinAcrossMm across). They are a dull blue-violet against the red-brown of the grooves (18 November:
 *    in the first colour, a dark red-violet at mid bank, they could not be told from the groove's own shade), soft
 *    and half transparent so they read as a vessel under the wet film and not as a drawn outline of the gyrus;
 *  - the arteries swell and brighten a little with the beat (pulse x the beat uniform nsLive.y; the veins do not).
 * Widths are true millimetres on the tissue; a vessel that would be under minPx pixels wide is not drawn (fullPx: from
 * here on at full strength), so from far away the surface shows no sub-pixel scribble. The vessels are painted into
 * the tissue colour BEFORE the light, so they are shaded, wet and shadowed exactly like the tissue they lie on.
 * Display choices; no vascular anatomy of this atlas brain is implied. nsAlb, nsG, nsMot and vNsObj in scope. */
export function cortexVesselGlsl(v = PROCEDURAL_VESSELS) {
  const f = glslFloat, v3 = c => `vec3( ${c.map(f).join(', ')} )`, lin = c => v3(c.map(srgbToLinear));
  const line = (field, w) => `( 1.0 - smoothstep( ${w} - 0.5, ${w} + 0.6, abs( ${field} ) / max( fwidth( ${field} ), 1e-5 ) ) ) * smoothstep( ${f(0.5 * v.minPx)}, ${f(0.5 * v.fullPx)}, ${w} )`;
  // where the field is nearly flat its level line closes into a small ring: there the vessel thins out and ends
  // (slope = the field's change over its own length scale, about 1 on a steady run)
  const run = (field, acrossMm) => `smoothstep( ${f(v.endSlope)}, ${f(v.runSlope)}, fwidth( ${field} ) / nsVmm * ${f(acrossMm)} )`;
  return `{
		float nsVmm = max( length( fwidth( vNsObj ) ), 1e-4 ); // millimetres of tissue per pixel
		float nsVslow = nsFlN( vNsObj * ${f(1 / v.warpAcrossMm)} + 5.1 ) - 0.5;
		vec3 nsVp = vNsObj + ${f(v.warpMm)} * nsVslow * vec3( 1.0, -0.7, 0.6 );
		float nsVcrown = 1.0 - smoothstep( 0.35, 0.75, nsG );
		float nsVbeat = 1.0 + ${f(v.pulse)} * nsLive.y;
		float nsVa = nsFlN( nsVp * ${f(1 / v.arteryAcrossMm)} + 13.7 ) - 0.5;
		float nsVwa = ${f(0.5 * v.arteryMm)} * ( 0.45 + 1.1 * nsMot ) * nsVbeat / nsVmm;
		float nsVla = ${line('nsVa', 'nsVwa')} * ${run('nsVa', v.arteryAcrossMm)};
		float nsVb = nsFlN( nsVp * ${f(1 / v.fineAcrossMm)} + 41.3 ) - 0.5;
		// a twig: 1 at its trunk .. 0 at twigMm from it (the trunk's distance from its field's slope), on the side of
		// the trunk that bears twigs here
		float nsVtw = clamp( 1.0 - abs( nsVa ) * nsVmm / ( max( fwidth( nsVa ), 1e-5 ) * ${f(v.twigMm)} ), 0.0, 1.0 ) * smoothstep( 0.0, 0.004, nsVa * nsVslow );
		float nsVwb = ${f(0.5 * v.fineMm)} * mix( ${f(v.twigTip)}, 1.0, nsVtw ) * ( 0.7 + 0.6 * nsMot ) * nsVbeat / nsVmm;
		float nsVlb = ${line('nsVb', 'nsVwb')} * ${run('nsVb', v.fineAcrossMm)} * smoothstep( 0.0, 0.3, nsVtw ) * ${run('nsVa', v.arteryAcrossMm)};
		float nsVv = nsG - ( ${f(v.veinLevel)} + ${f(2 * v.veinWander)} * ( nsMot - 0.5 ) );
		float nsVwv = ${f(0.5 * v.veinMm)} * ( 0.6 + 0.8 * nsMot ) / nsVmm;
		float nsVlv = ${line('nsVv', 'nsVwv')} * smoothstep( ${f(1 - v.veinShare - 0.08)}, ${f(1 - v.veinShare + 0.08)}, nsFlN( vNsObj * ${f(1 / v.veinAcrossMm)} + 71.9 ) );
		nsAlb = mix( nsAlb, ${lin(v.fine)}, ${f(v.fineAlpha)} * nsVlb * nsVcrown );
		nsAlb = mix( nsAlb, ${lin(v.artery)}, min( 1.0, ${f(v.arteryAlpha)} * nsVbeat ) * nsVla * nsVcrown );
		nsAlb = mix( nsAlb, ${lin(v.vein)}, ${f(v.veinAlpha)} * nsVlv );
	}`;
}

/** Value noise for the mottling (GLSL head; names are the patch's own). */
export const CORTEX_FLESH_HEAD = 'float nsFlH( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.yzx + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }\n' +
  'float nsFlN( vec3 x ) { vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );\n' +
  '  return mix( mix( mix( nsFlH( i ), nsFlH( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( nsFlH( i + vec3( 0.0, 1.0, 0.0 ) ), nsFlH( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),\n' +
  '    mix( mix( nsFlH( i + vec3( 0.0, 0.0, 1.0 ) ), nsFlH( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( nsFlH( i + vec3( 0.0, 1.0, 1.0 ) ), nsFlH( i + 1.0 ), f.x ), f.y ), f.z ); }\n';

/** GLSL appended to the shell's read patch in place of the glass ink (ns-scene-three patchGlassReadShaders; nsN, nsV,
 * nsFacing, nsG, vNsNear, nsClear, the rim uniforms and the varying vNsObj (atlas position, source mm) in scope). It
 * sets outgoingLight and diffuseColor.a. `light` is the view-space key light. hooks.albedo: GLSL run once the tissue's
 * colour nsAlb is made and before it is lit (20 November 2026: ns-brain-gap's inner parts and cut faces). Pure. */
export function cortexFleshGlsl(light, o = BRAIN_FLESH_LOOK, live = BRAIN_LIVE, hooks = {}, halo = AREA_HALO) {
  const f = glslFloat, v3 = c => `vec3( ${c.map(f).join(', ')} )`, lin = c => v3(c.map(srgbToLinear));
  const B = live.bloom, P = live.beat;
  // 21 November 2026 (ns-area-halo AREA_HALO; the owner: "Right now, there's essentially no glow"): the light of a lit
  // or looked-at block on the tissue round it is the halo's now (the block's own shape and colour, gone when the
  // contraction ends). The bloom keeps its swell, its dimple, its rosy flush and its ring; its own spill of the key's
  // hue (a disc that faded over 0.8 s) and its light above white (seen only where the bloom pass runs) give way to it.
  const haloOn = Boolean(halo && halo.on !== false);
  const spill = haloOn ? 0 : B.spill, bloomGlow = haloOn ? 0 : B.glow;
  const R = o.raw || null, RL = R ? rawLightDir(RAW_LOOK) : null;
  // 20 November 2026 (BRAIN_FLESH_RAW): the raw look's light in place of the key light, wrap, fill, fold shade and scatter
  const lightGlsl = R ? `vec3 nsLk = vec3( ${RL.map(f).join(', ')} );
	float nsDif = abs( dot( nsN, nsLk ) );
	float nsAo = mix( 1.0, ${f(o.aoMin)}, nsG * ${f(R.ao)} );
	vec3 nsCol = nsAlb * pow( max( ${f(RAW_LOOK.ambient)} + ${f(RAW_LOOK.direct)} * nsDif, 0.0 ), ${f(RAW_LOOK.gamma)} ) * nsAo;`
    : `vec3 nsLk = normalize( vec3( ${light.map(f).join(', ')} ) );
	float nsDif = clamp( ( dot( nsN, nsLk ) + ${f(o.wrap)} ) / ${f(1 + o.wrap)}, 0.0, 1.0 );
	float nsAo = mix( 1.0, ${f(o.aoMin)}, nsG );
	vec3 nsCol = nsAlb * ( ${f(o.key)} * nsDif + ${f(o.fill)} ) * nsAo;
	nsCol += nsAlb * ${v3(o.scatterTint)} * ( ${f(o.scatter)} * ( 1.0 - nsDif ) * nsAo );`;
  const wetGlsl = R ? '' : `// the wet highlights slide over the folds with the beat and the breath (the light of the highlights leans a little)
	vec3 nsLs = normalize( nsLk + vec3( ${f(P.slide)} * nsLive.y + ${f(P.breathSlide)} * nsLive.z, ${f(-0.6 * P.slide)} * nsLive.y + ${f(0.5 * P.breathSlide)} * nsLive.z, 0.0 ) );
	float nsNH = max( dot( nsN, normalize( nsLs + nsV ) ), 0.0 );
	float nsGl = pow( nsNH, ${f(o.glintPower)} );
	float nsGe = max( ${f(0.5 * (o.glintHi - o.glintLo))}, fwidth( nsGl ) );
	float nsWet = ${f(o.sheen)} * pow( nsNH, ${f(o.sheenPower)} ) + ${f(o.glint)} * smoothstep( ${f(0.5 * (o.glintLo + o.glintHi))} - nsGe, ${f(0.5 * (o.glintLo + o.glintHi))} + nsGe, nsGl );
	nsCol += vec3( nsWet * ( 1.0 - ${f(o.wetGroove)} * nsG ) );`;
  const rimGlsl = R ? `nsCol += ${lin(o.rim)} * ( nsRimF * max( nsRimOpacity - ${f(R.rimFrom)}, 0.0 ) * ${f(R.rimGain)} );`
    : `nsCol += ${lin(o.rim)} * ( nsRimF * nsRimOpacity * ${f(o.rimGain)} );`;
  const bumpGlsl = o.bumpMm > 0 ? `{
		vec3 nsSx = dFdx( - vNsView ), nsSy = dFdy( - vNsView );
		vec3 nsR1 = cross( nsSy, nsN ), nsR2 = cross( nsN, nsSx );
		float nsDet = dot( nsSx, nsR1 );
		float nsBf = 1.0 - smoothstep( ${f(1 / o.bumpFadePx)}, ${f(2.5 / o.bumpFadePx)}, length( fwidth( vNsObj * ${f(1 / o.mottleFineMm)} ) ) );
		float nsBh = nsMot * ${f(o.bumpMm)} * nsBf * length( nsSx ) / max( length( dFdx( vNsObj ) ), 1e-6 );
		vec3 nsGrad = sign( nsDet ) * ( dFdx( nsBh ) * nsR1 + dFdy( nsBh ) * nsR2 );
		nsN = normalize( abs( nsDet ) * nsN - nsGrad );
	}` : '';
  return `
{
	float nsClr = 1.0 - nsClear * clamp( vNsNear, 0.0, 1.0 );
	float nsMot = 0.65 * nsFlN( vNsObj * ${f(1 / o.mottleMm)} ) + 0.35 * nsFlN( vNsObj * ${f(1 / o.mottleFineMm)} + 7.3 );
	vec3 nsAlb = mix( ${lin(o.crown)}, ${lin(o.groove)}, pow( nsG, ${f(o.grooveCurve)} ) );
	nsAlb *= mix( vec3( 1.0 ), ${v3(o.mottleWarm)}, nsMot ) * ( 1.0 + ${f(o.mottle)} * ( nsMot - 0.5 ) );
	${o.vessel ? cortexVesselGlsl(o.vessel) : ''}
	${(hooks && hooks.albedo) || ''}
	// the living brain (ns-brain-live): the tissue flushes a little with every beat, and rosy round an area that is on
	${liveBloomGlsl('vNsObj')}
	nsAlb *= vec3( 1.0 + ${f(P.flush)} * nsLive.y, 1.0 - ${f(0.6 * P.flush)} * nsLive.y, 1.0 - ${f(0.5 * P.flush)} * nsLive.y );
	nsAlb = mix( nsAlb, nsAlb * ${v3(B.flushTint)}, ${f(B.flush)} * nsLvF );
	// a slight unevenness of the surface from the same mottling (a derivative bump of the normal: the wet highlights
	// break up like on moist tissue); it fades out where the fine mottling would be under bumpFadePx pixels across
	// (none in the raw look: bumpMm 0)
	${bumpGlsl}
	${lightGlsl}
	${wetGlsl}
	float nsRimF = pow( max( 1.0 - nsFacing, 0.0 ), nsRimPower ) * ( 1.0 - nsRimGroove * nsG );
	${rimGlsl}
	// 19 November 2026 (the owner: "can we also please have the whole brain light up slightly, faintly, with whatever
	// color area is being picked"): the whole cortex lights up faintly in the picked area's colour (nsPickTint: a gain
	// per channel less 1, brainPickGainInto, set by the scene; 0 when nothing is picked; 21 November 2026: a gain, the
	// same faint change in light and in shade, where an added light recoloured the matte cortex lilac or grey-blue).
	nsCol *= 1.0 + nsPickTint;
	// The tissue round a switched-on key takes the key's HUE and keeps its own light and shade (its brightness x the
	// key's colour): the folds, the vessels and the wet highlights stay, so it reads as flushed tissue, not as a wash.
	// Where the surface is seen edge-on the colour is held back (it smeared into a long pale stain there).
	float nsLvA = mix( 1.0, 0.45, nsG ) * ( 0.35 + 0.65 * nsDif );
	float nsLvZ = smoothstep( ${f(B.grazeLo)}, ${f(B.grazeHi)}, nsFacing );
	float nsLvM = max( nsLvC.r, max( nsLvC.g, nsLvC.b ) );
	float nsLvY = dot( min( nsCol, vec3( 1.0 ) ), vec3( 0.2126, 0.7152, 0.0722 ) );
	nsCol = mix( nsCol, ( nsLvC / max( nsLvM, 1e-3 ) ) * ( ${f(B.spillGain)} * nsLvY ), ${f(spill)} * min( nsLvM, 1.0 ) * mix( ${f(B.grazeKeep)}, 1.0, nsLvZ ) );
	// the ring of a movement being switched on runs over the tissue in the key's colour
	float nsLvPm = max( nsLvP.r, max( nsLvP.g, nsLvP.b ) );
	nsCol = mix( nsCol, ( nsLvP / max( nsLvPm, 1e-3 ) ) * ( ${f(B.spillGain)} * nsLvY + 0.1 ), ${f(B.pulse)} * min( nsLvPm, 1.0 ) * mix( ${f(B.grazeKeep)}, 1.0, nsLvZ ) );
	// ... and right next to the key (and on the ring) a little of it is above white (the scene's bloom turns that into
	// a soft halo); none where the surface is seen edge-on
	// 21 November 2026 (AREA_HALO): the pool of light of a lit or looked-at block, in its own colour, under white
	${haloOn ? haloTissueGlsl('vNsObj', 'nsCol', 'nsFacing', halo) : ''}
	outgoingLight = min( nsCol, vec3( 1.0 ) ) + ( nsLvK * ( ${f(bloomGlow)} * nsLvA ) + nsLvP * ${f(B.pulseGlow)} ) * nsLvZ;
	diffuseColor.a = mix( ${f(o.alpha)}, ${f(o.rimAlpha)}, pow( max( 1.0 - nsFacing, 0.0 ), 4.0 ) ) * nsClr;
}
`;
}
