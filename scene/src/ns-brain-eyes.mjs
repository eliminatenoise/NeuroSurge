/** Two eyeballs and their optic nerves at the front of the brain (19 November 2026).
 *
 * The owner: "it would be much better from a control standpoint, ease of use standpoint, and learning standpoint if we
 * were to invert the brain altogether so that the motor strip changed direction. But to make clear the direction of
 * the body, let's also include eyeballs with nerves connected to the brain." and "we're inverting the brain altogether
 * so that the eyeballs will be at the bottom."
 *
 * WHAT THIS IS. An illustration that shows which way the brain faces. It is built here in code, in the brain's own
 * atlas frame (BodyParts3D 4.0 whole-body millimetres: +x subject left, +y posterior, +z superior), and drawn in the
 * brain's group, so it is moved, turned and carried with the brain. It is NOT a traced anatomy, NOT part of the game's
 * signal (no motor area, no activity, no link), and nothing about it is measured.
 *
 * WHAT IS TAKEN FROM THE ATLAS, AND WHAT IS NOT.
 *  - From the atlas: how far each eye is from the midline and how high it is. These are the centres of the atlas's own
 *    two scleras (packets/bodyparts3d-head-r1, FJ1317 and FJ1368, in the same frame as the brain meshes): 29.8 mm either
 *    side of the brain's midline, 1518.1 mm high, 151.1 mm in front of the frame's origin plane; and their size (the
 *    scleras are 24.6 to 26.3 mm across; drawn 24.4 mm).
 *  - NOT from the atlas: each eyeball is moved straight FORWARD by `forwardMm` (30 mm). In the atlas the eyes lie under
 *    the frontal lobes (the front of the brain is at y -169.7 mm, the eyes' own fronts at -163.5), so from above, which
 *    is how the game shows the brain, they would be hidden. Moved forward they hang in front of the frontal poles with
 *    about 9 mm of each nerve in sight between the eyeball and the brain's edge.
 *  - NOT from the atlas: the nerves, the chiasm and the short tracts. The packets hold no mesh of them. They are tubes
 *    through hand-placed points, drawn to READ as nerves at the size they are seen, not traced from anything:
 *      . each nerve leaves the back of its eyeball in a SHEATH, thick at the eyeball and tapering, which ends in a
 *        small step a few millimetres on; beyond it the nerve is striped along its length (fibre lines) and two fine
 *        red vessels come out from under the sheath and run along its upper side;
 *      . it passes under the frontal lobe (kept below the brain's own underside, measured from its meshes) and comes
 *        out into the gap between the two halves of the brain (ns-brain-part), where it can be seen from above;
 *      . at the CHIASM each nerve parts in two: a thicker strand that CROSSES the midline to the other side, one
 *        passing over the other (the one beneath is darkened where they cross), and a thinner strand that stays on
 *        its own side. That half of the fibres cross is textbook anatomy; which strand passes over, their
 *        thicknesses and the wide open X are choices made so that the crossing shows. The crossing is drawn 6 mm
 *        further forward than the earlier chiasm (which lay under the hypothalamus and could not be seen from above);
 *      . behind the chiasm each TRACT (the crossed strand of the other eye with the uncrossed one of its own side)
 *        runs back and outward and FANS into three thin bundles where it ends inside the brain.
 *    Because the eyeballs are moved forward the nerves are about 30 mm longer than a real optic nerve.
 *  - NOT anatomical: the eyes look forward AND `gazeUpDeg` (40 degrees) upward, toward whoever looks at the brain from
 *    above. Looking straight forward, each iris would be a thin edge at the lower rim of its eyeball in the view from
 *    above and the eyeballs would not read as eyes.
 *
 * Cost: about 4 600 triangles in three meshes (the nerves 2 800, each eyeball 900), built once; no per-frame work of
 * their own beyond the eyeballs' turn with the look (ns-scene-three updateBrainEyes).
 * Pure: no Three.js, no DOM. The scene (ns-scene-three) makes the meshes and the materials.
 */

import { HEMI_GAP } from './ns-brain-part.mjs';

const freeze = Object.freeze;
const DEG = Math.PI / 180;

export const BRAIN_EYES = freeze({
  on: true,
  /** The brain's midline in the atlas frame (between the two precentral gyri: -1.6 and +0.6 mm). */
  midlineXmm: -0.5,
  /** The atlas's own eye centre (mean of the two scleras' bounds, mirrored about the midline): lateral, y, z (mm). */
  atlasLateralMm: 29.8, atlasYmm: -151.1, atlasZmm: 1518.1,
  /** The two halves of the brain are drawn this far apart, each (ns-brain-part HEMI_GAP): each eyeball goes with its
   * half, and so do the points of its nerve and tract by their `follow` share; the chiasm stays on the midline. */
  partMm: HEMI_GAP.eachMm,
  /** Moved straight forward (toward -y) so they can be seen from above: an illustration choice, not anatomy. */
  forwardMm: 30,
  radiusMm: 12.2,
  /** The look: forward, raised this much toward the top of the brain (toward the viewer of the top view). */
  gazeUpDeg: 40,
  irisRadiusMm: 6.2, pupilRadiusMm: 2.7, limbusMm: 0.7, corneaBulgeMm: 1.5, corneaRadiusMm: 6.9,
  around: 28,
  /** sRGB colours. Moist and warm, in the brain's own look: an ivory white that turns pink toward the back of the
   * eyeball, an amber-brown iris (no motor area has this colour family at this darkness), a near-black pupil. */
  colors: freeze({
    sclera: 0xfbf4ea, scleraBack: 0xeeb9ad, limbus: 0x3a2413, irisOuter: 0x7c4a1c, irisInner: 0xc98a36, pupil: 0x060406,
    nerve: 0xf0d6bf, nerveEye: 0xf4c9b6, chiasm: 0xecc8b2,
    sheath: 0xd6d3da, sheathEdge: 0x8a7b84, strand: 0xf6e2cf, strandSide: 0xe0b9a0, tract: 0xe6c4ad, vessel: 0x9c2f33
  }),
  eyeRoughness: 0.14, nerveRoughness: 0.4,
  /** The nerve of the LEFT side from its eyeball to where it comes out into the gap between the halves (x measured
   * from the midline before the halves are drawn apart, positive = subject left; y, z atlas mm; the fourth number is
   * the share of partMm the point moves outward with its half of the brain). The right side is the mirror image. The
   * first two points are set from the eyeball (see nerveParts).
   *  sheath   the sleeve round the nerve where it leaves the eyeball: extraMm thicker at the eyeball, tapering over
   *           flareMm, ending lengthMm from the eyeball's surface in a step of stepMm;
   *  stripe   how much darker every second line along the nerve is (fibre lines);
   *  endRadiusMm, taperMm  the nerve narrows a little over its last taperMm, where it parts into two strands;
   *  ringMm   how far apart the tube's rings are: [in the sheath and just beyond it, the part seen from outside;
   *           under the brain]. Two more rings stand either side of the sheath's end, so the step there is sharp. */
  nerve: freeze({
    insideEyeFrac: 0.8, medialAtEyeMm: 2.6, stubMm: 9, stubRiseMm: 3,
    underMm: freeze([freeze([20.8, -150, 1531, 1]), freeze([12.8, -128, 1537, 0.8])]),
    radiusMm: 2.1, endRadiusMm: 1.6, taperMm: 7, around: 10, stripe: 0.13,
    sheath: freeze({ lengthMm: 4.6, extraMm: 1.5, flareMm: 6.5, stepMm: 0.45, beyondMm: 4 }),
    ringMm: freeze([1.3, 4.5])
  }),
  /** The chiasm, in the gap between the two halves (x from the midline, y, z; left side, the right is the mirror image).
   *  inMm      where a nerve comes into it (the end of the nerve's own tube);
   *  outMm     where a tract leaves it;
   *  crossMm   the point on the midline through which both crossing strands pass, the left eye's overMm above it and
   *            the right eye's overMm below it (so one is seen passing over the other);
   *  sideBowMm how far from the midline the uncrossed strand passes beside the crossing;
   *  splitMm   where the two strands start inside the nerve's end: the crossing one this far toward the midline, the
   *            uncrossed one this far away from it (side by side, so the nerve is seen to part in two);
   *  shade     how dark the lower crossing strand is drawn right under the upper one (1 = no darker). */
  chiasm: freeze({ inMm: freeze([5.2, -120.5, 1534]), outMm: freeze([5.6, -110.5, 1532.4]), crossMm: freeze([0, -115.5, 1533.3]),
    overMm: 0.95, sideBowMm: 6.3, crossRadiusMm: 1.4, sideRadiusMm: 1.0, splitMm: freeze([0.55, 0.85]), shade: 0.62, shadeWithinMm: 3.2, stripe: 0.1, around: 8, perSpan: 5 }),
  /** The tract of the left side from the chiasm into the brain: via a point under the brain to an end inside it, where
   * its `bundles` strands stand fanMm apart (the fourth number: the share of partMm, as for the nerve). */
  tract: freeze({ viaMm: freeze([10, -100, 1529, 0.8]), endMm: freeze([14, -96, 1526, 1]), bundles: 3, fanMm: 2.3, radiusMm: 1.05, endRadiusMm: 0.75, around: 6, perSpan: 4 }),
  /** Two fine vessels along the upper side of each nerve, from the end of its sheath to the chiasm: each a thin tube
   * that lies on the nerve and wanders round it from the first angle to the second (degrees from the nerve's upper
   * side). Decoration: no vessel of the atlas is traced. */
  vessels: freeze({ radiusMm: 0.34, sinkMm: 0.1, anglesDeg: freeze([freeze([-30, 18]), freeze([26, -30])]), around: 4, waveDeg: 10 }),
  /** Names for the tip beside the crosshair (ns-text BRAIN_PARTS holds the words). */
  parts: freeze(['eyeball', 'nerve'])
});

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** An sRGB hex colour as linear r, g, b (the vertex colours of a lit material are linear). */
export function hexLinear(hex) {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The two eye centres in atlas mm: { left: [x, y, z], right: [x, y, z] } (left = subject left, +x). */
export function eyeCentres(o = BRAIN_EYES) {
  const y = o.atlasYmm - o.forwardMm, z = o.atlasZmm, lateral = o.atlasLateralMm + (o.partMm || 0);
  return { left: [o.midlineXmm + lateral, y, z], right: [o.midlineXmm - lateral, y, z] };
}

/** Where each eye looks (unit vector, atlas frame): forward (-y), raised by gazeUpDeg toward +z. */
export function eyeGaze(o = BRAIN_EYES) {
  const e = o.gazeUpDeg * DEG;
  return [0, -Math.cos(e), Math.sin(e)];
}

/** Points that bound the two eyeballs (flat xyz, atlas mm): each centre moved one radius (and the cornea's bulge)
 * along the six axis directions. For the start framing (ns-brain frameBrain motorKeepPoints): the eyeballs must be in
 * the start picture together with the motor strip. */
export function eyeKeepPoints(o = BRAIN_EYES) {
  const c = eyeCentres(o), r = o.radiusMm + o.corneaBulgeMm, out = [];
  for (const p of [c.left, c.right]) for (let a = 0; a < 3; a++) for (const s of [-1, 1]) { const q = p.slice(); q[a] += s * r; out.push(q[0], q[1], q[2]); }
  return Float64Array.from(out);
}

/** The polar rings of an eyeball: angle from the look's own axis (degrees) and the colour there. Two rings at one angle
 * make a sharp edge between two colours (the faces between them are left out). */
function eyeRings(o) {
  const C = o.colors, lin = k => hexLinear(C[k]), R = o.radiusMm;
  const aP = Math.asin(o.pupilRadiusMm / R) / DEG, aI = Math.asin(o.irisRadiusMm / R) / DEG, aL = Math.asin((o.irisRadiusMm + o.limbusMm) / R) / DEG;
  const pupil = lin('pupil'), inner = lin('irisInner'), outer = lin('irisOuter'), limbus = lin('limbus'), white = lin('sclera'), back = lin('scleraBack');
  const rings = [[0, pupil], [aP * 0.55, pupil], [aP, pupil], [aP, inner], [aP + (aI - aP) * 0.45, mix3(inner, outer, 0.45)], [aI - 1.2, outer], [aI, limbus], [aL, limbus], [aL, white]];
  for (const a of [aL + 7, 52, 66, 80, 94, 108, 122, 136, 150, 164, 180]) rings.push([a, mix3(white, back, smooth(84, 160, a))]);
  return rings;
}

/** The surface's distance from the eye centre at angle `a` (degrees) from the look's axis: the sphere, with the cornea's
 * shallow dome over the iris. */
function eyeProfile(a, o) {
  const aC = Math.asin(o.corneaRadiusMm / o.radiusMm) / DEG;
  if (a >= aC) return o.radiusMm;
  const t = Math.cos((a / aC) * (Math.PI / 2));
  return o.radiusMm + o.corneaBulgeMm * t * t;
}

/**
 * The two eyeballs as one indexed mesh: { positions (Float32Array xyz, atlas mm), normals, colors (linear rgb),
 * indices (Uint16Array), triangles, centres: { left, right }, gaze }.
 */
export function buildEyeballs(o = BRAIN_EYES) {
  const g = eyeGaze(o), cs = eyeCentres(o), rings = eyeRings(o), N = o.around;
  // an orthonormal frame about the look's axis: u = subject left (+x), v = g x u
  const u = [1, 0, 0], v = [g[1] * u[2] - g[2] * u[1], g[2] * u[0] - g[0] * u[2], g[0] * u[1] - g[1] * u[0]];
  const pos = [], nor = [], col = [], idx = [];
  for (const c of [cs.left, cs.right]) {
    const base = pos.length / 3;
    rings.forEach(([a, colour]) => {
      const t = a * DEG, r = eyeProfile(a, o), dr = (eyeProfile(a + 0.25, o) - eyeProfile(Math.max(0, a - 0.25), o)) / ((a + 0.25 - Math.max(0, a - 0.25)) * DEG);
      for (let j = 0; j < N; j++) {
        const ph = (j / N) * 2 * Math.PI, cp = Math.cos(ph), sp = Math.sin(ph), st = Math.sin(t), ct = Math.cos(t);
        const er = [st * (cp * u[0] + sp * v[0]) + ct * g[0], st * (cp * u[1] + sp * v[1]) + ct * g[1], st * (cp * u[2] + sp * v[2]) + ct * g[2]];
        const et = [ct * (cp * u[0] + sp * v[0]) - st * g[0], ct * (cp * u[1] + sp * v[1]) - st * g[1], ct * (cp * u[2] + sp * v[2]) - st * g[2]];
        pos.push(c[0] + r * er[0], c[1] + r * er[1], c[2] + r * er[2]);
        const n = [r * er[0] - dr * et[0], r * er[1] - dr * et[1], r * er[2] - dr * et[2]], l = Math.hypot(n[0], n[1], n[2]) || 1;
        nor.push(n[0] / l, n[1] / l, n[2] / l);
        col.push(colour[0], colour[1], colour[2]);
      }
    });
    for (let i = 0; i + 1 < rings.length; i++) {
      if (rings[i][0] === rings[i + 1][0]) continue; // a colour edge: two rings in one place
      const a0 = base + i * N, a1 = base + (i + 1) * N, pole0 = rings[i][0] === 0, pole1 = rings[i + 1][0] === 180;
      for (let j = 0; j < N; j++) {
        const k = (j + 1) % N;
        // outward-facing triangles (counter-clockwise seen from outside: the look's axis toward the viewer)
        if (!pole0) idx.push(a0 + j, a1 + j, a0 + k);
        if (!pole1) idx.push(a0 + k, a1 + j, a1 + k);
      }
    }
  }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), colors: Float32Array.from(col), indices: Uint16Array.from(idx), triangles: idx.length / 3, centres: cs, gaze: g };
}

/** The centre lines of everything the nerve mesh is built from, as control points in atlas mm:
 * { nerve: { left, right } (eyeball -> where it comes into the chiasm),
 *   crossing: { left, right } (the strand of the LEFT / RIGHT eye that crosses to the other side),
 *   uncrossed: { left, right } (the strand that stays on its side),
 *   tract: { left: [bundle, ...], right: [...] } (from the chiasm into the brain, fanning at the end) }. */
export function nerveParts(o = BRAIN_EYES) {
  const n = o.nerve, ch = o.chiasm, tr = o.tract, R = o.radiusMm, m = o.midlineXmm, g = o.partMm || 0, cs = eyeCentres(o);
  const at = (s, p) => [m + s * (p[0] + g * (p[3] || 0)), p[1], p[2]];
  const out = { nerve: {}, crossing: {}, uncrossed: {}, tract: {} };
  for (const [key, s] of [['left', 1], ['right', -1]]) {
    const c = cs[key];
    out.nerve[key] = [
      [c[0] - s * n.medialAtEyeMm, c[1] + n.insideEyeFrac * R, c[2]],
      [c[0] - s * (n.medialAtEyeMm + 1.2), c[1] + R + n.stubMm, c[2] + n.stubRiseMm],
      ...n.underMm.map(p => at(s, p)),
      at(s, ch.inMm)
    ];
    // the crossing strand of this eye: in on its own side, through the midline (the left eye's above, the right eye's
    // below), out on the OTHER side
    const inAt = at(s, ch.inMm), split = ch.splitMm || [0, 0];
    out.crossing[key] = [[inAt[0] - s * split[0], inAt[1], inAt[2]], [m + ch.crossMm[0], ch.crossMm[1], ch.crossMm[2] + s * ch.overMm], at(-s, ch.outMm)];
    out.uncrossed[key] = [[inAt[0] + s * split[1], inAt[1], inAt[2]], [m + s * ch.sideBowMm, ch.crossMm[1], ch.crossMm[2]], at(s, ch.outMm)];
    // the tract: its strands leave the chiasm together and stand apart where they end, across their own direction
    const a = at(s, ch.outMm), via = at(s, tr.viaMm), end = at(s, tr.endMm);
    const d = [end[0] - via[0], end[1] - via[1]], dl = Math.hypot(d[0], d[1]) || 1, px = -d[1] / dl, py = d[0] / dl;
    out.tract[key] = [];
    for (let k = 0; k < tr.bundles; k++) {
      const f = tr.bundles > 1 ? (k / (tr.bundles - 1)) * 2 - 1 : 0;
      out.tract[key].push([a, [via[0] + 0.3 * f * tr.fanMm * px, via[1] + 0.3 * f * tr.fanMm * py, via[2]], [end[0] + f * tr.fanMm * px, end[1] + f * tr.fanMm * py, end[2] - Math.abs(f) * 0.6]]);
    }
  }
  return out;
}

/** A point of the Catmull-Rom spline through `pts` at `u` (0 = the first point, 1 = the second, ...). */
function splineAt(pts, u) {
  const last = pts.length - 1, i = Math.min(last - 1, Math.max(0, Math.floor(u))), t = Math.min(1, Math.max(0, u - i));
  const P = k => pts[Math.max(0, Math.min(last, k))], p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t2 = t * t, t3 = t2 * t, q = [0, 0, 0];
  for (let a = 0; a < 3; a++) q[a] = 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
  return q;
}
const evenSamples = (spans, per) => { const out = []; for (let i = 0; i <= spans * per; i++) out.push(i / per); return out; };
/** The spline through `pts` measured along its length: { length, at(d) -> point } (a table of 40 steps a span). */
function splineByLength(pts) {
  const steps = 40 * (pts.length - 1), P = [], D = [0];
  for (let i = 0; i <= steps; i++) { P.push(splineAt(pts, i / 40)); if (i) D.push(D[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2])); }
  const length = D[steps];
  return { length, at(d) {
    const x = Math.min(length, Math.max(0, d)); let i = 1; while (i < steps && D[i] < x) i++;
    const f = D[i] > D[i - 1] ? (x - D[i - 1]) / (D[i] - D[i - 1]) : 0;
    return [0, 1, 2].map(a => P[i - 1][a] + (P[i][a] - P[i - 1][a]) * f);
  } };
}

/** One tube into the mesh arrays `M` ({ pos, nor, col, idx }): rings of `around` points round the centre line `line`
 * ([{ p, r, c }]: centre, radius, linear colour), with a frame that does not twist. stripe darkens every second line
 * along the tube; cap closes the far end with a cone capLong radii long. Returns the rings' frames [{ p, r, u, w, t, d }] (centre,
 * radius, the two side vectors, the direction, the distance along the line): the vessels are laid on them. */
function addTube(M, line, around, { stripe = 0, cap = false, capLong = 0.8, up = null } = {}) {
  const base = M.pos.length / 3, N = line.length, frames = [];
  let prevU = up, dist = 0;
  for (let i = 0; i < N; i++) {
    const a = line[Math.max(0, i - 1)].p, b = line[Math.min(N - 1, i + 1)].p, here = line[i];
    if (i > 0) dist += Math.hypot(here.p[0] - line[i - 1].p[0], here.p[1] - line[i - 1].p[1], here.p[2] - line[i - 1].p[2]);
    let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(t[0], t[1], t[2]) || 1; t = [t[0] / tl, t[1] / tl, t[2] / tl];
    // carry the last side vector along, made square to the new direction
    let u = prevU || (Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
    const d = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
    u = [u[0] - d * t[0], u[1] - d * t[1], u[2] - d * t[2]]; const ul = Math.hypot(u[0], u[1], u[2]) || 1; u = [u[0] / ul, u[1] / ul, u[2] / ul];
    prevU = u;
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    // the radius' slope along the tube tilts the normal (a taper, the sheath's step)
    const ra = line[Math.max(0, i - 1)], rb = line[Math.min(N - 1, i + 1)], span = Math.hypot(rb.p[0] - ra.p[0], rb.p[1] - ra.p[1], rb.p[2] - ra.p[2]) || 1, slope = (rb.r - ra.r) / span;
    for (let j = 0; j < around; j++) {
      const ph = (j / around) * 2 * Math.PI, e = [Math.cos(ph) * u[0] + Math.sin(ph) * w[0], Math.cos(ph) * u[1] + Math.sin(ph) * w[1], Math.cos(ph) * u[2] + Math.sin(ph) * w[2]];
      M.pos.push(here.p[0] + here.r * e[0], here.p[1] + here.r * e[1], here.p[2] + here.r * e[2]);
      const nn = [e[0] - slope * t[0], e[1] - slope * t[1], e[2] - slope * t[2]], nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      M.nor.push(nn[0] / nl, nn[1] / nl, nn[2] / nl);
      const k = stripe && j % 2 ? 1 - stripe : 1;
      M.col.push(here.c[0] * k, here.c[1] * k, here.c[2] * k);
    }
    frames.push({ p: here.p, r: here.r, u, w, t, d: dist });
  }
  for (let i = 0; i + 1 < N; i++) for (let j = 0; j < around; j++) {
    const k = (j + 1) % around, a0 = base + i * around, a1 = a0 + around;
    M.idx.push(a0 + j, a0 + k, a1 + j, a0 + k, a1 + k, a1 + j);
  }
  if (cap) {
    const e = line[N - 1], t = frames[N - 1].t, tip = M.pos.length / 3, ring = base + (N - 1) * around;
    M.pos.push(e.p[0] + capLong * e.r * t[0], e.p[1] + capLong * e.r * t[1], e.p[2] + capLong * e.r * t[2]); M.nor.push(t[0], t[1], t[2]); M.col.push(e.c[0], e.c[1], e.c[2]);
    for (let j = 0; j < around; j++) M.idx.push(ring + j, ring + (j + 1) % around, tip);
  }
  return frames;
}

/**
 * The two nerves in their sheaths with their vessels, the chiasm's four strands and the two fanning tracts, as one
 * indexed mesh: { positions, normals, colors, indices, triangles, parts (nerveParts: the control points),
 * counts: { nerve, vessels, chiasm, tract } (triangles) }. An illustration: see the head of this file.
 */
export function buildNerves(o = BRAIN_EYES) {
  const n = o.nerve, ch = o.chiasm, tr = o.tract, vs = o.vessels, C = o.colors, lin = k => hexLinear(C[k]);
  const cNerve = lin('nerve'), cEye = lin('nerveEye'), cCh = lin('chiasm'), cSheath = lin('sheath'), cEdge = lin('sheathEdge');
  const cStrand = lin('strand'), cSide = lin('strandSide'), cTract = lin('tract'), cVessel = lin('vessel');
  const M = { pos: [], nor: [], col: [], idx: [] }, parts = nerveParts(o), counts = { nerve: 0, vessels: 0, chiasm: 0, tract: 0 };
  const tris = () => M.idx.length / 3;
  const exit = (1 - n.insideEyeFrac) * o.radiusMm; // how far along its line the nerve leaves the eyeball's surface
  for (const key of ['left', 'right']) {
    // ---- the nerve in its sheath ----
    const L = splineByLength(parts.nerve[key]), length = L.length, line = [], sleeveEnd = exit + n.sheath.lengthMm;
    // rings: close together from the eyeball to a little beyond the sleeve, two either side of its end, then farther apart
    const near = sleeveEnd + n.sheath.beyondMm, D = [];
    for (let k = 0, c = Math.ceil(near / n.ringMm[0]); k < c; k++) D.push((k / c) * near);
    for (let k = 0, c = Math.ceil((length - near) / n.ringMm[1]); k <= c; k++) D.push(near + (k / c) * (length - near));
    D.push(sleeveEnd - 0.2, sleeveEnd + 0.2);
    D.sort((x, y) => x - y);
    for (const d of D.filter((x, i) => i === 0 || x - D[i - 1] > 0.12)) {
      const p = L.at(d), inSleeve = d < sleeveEnd;
      const r = n.radiusMm + n.sheath.extraMm * (1 - smooth(exit, exit + n.sheath.flareMm, d)) + (inSleeve ? n.sheath.stepMm : 0)
        - (n.radiusMm - n.endRadiusMm) * smooth(length - n.taperMm, length, d);
      // the sleeve: pink at the eyeball, pale and cool along it, a darker line at its end; then the nerve, warmer toward the chiasm
      const c = inSleeve ? mix3(mix3(cEye, cSheath, smooth(exit, exit + 2, d)), cEdge, smooth(sleeveEnd - 1.1, sleeveEnd - 0.15, d))
        : mix3(cNerve, cCh, smooth(length - 16, length, d));
      line.push({ p, r, c });
    }
    let t0 = tris();
    const frames = addTube(M, line, n.around, { stripe: n.stripe, cap: true, capLong: 1.6, up: [0, 0, 1] });
    counts.nerve += tris() - t0;
    // ---- two fine vessels on its upper side, from where they come out of the sleeve to the chiasm ----
    t0 = tris();
    const from = frames.findIndex(f => f.d > sleeveEnd), total = frames[frames.length - 1].d;
    vs.anglesDeg.forEach(([a0, a1], vi) => {
      const vl = [];
      let lastD = -Infinity;
      for (let i = from; i < frames.length; i++) {
        const f = frames[i], s = (f.d - frames[from].d) / Math.max(1e-6, total - frames[from].d);
        // (a tube this thin kinks on rings that stand closer than a few of its own radii: those are left out)
        if (f.d - lastD < 3 * vs.radiusMm && i < frames.length - 1) continue;
        lastD = f.d;
        const ang = (a0 + (a1 - a0) * s + vs.waveDeg * Math.sin((3 + vi) * Math.PI * s)) * DEG;
        // (the frame's first side vector points up; the right side's frame is the mirror image, so its angle is mirrored)
        const ca = Math.cos(ang), sa = (key === 'right' ? -1 : 1) * Math.sin(ang), off = f.r + vs.radiusMm - vs.sinkMm;
        vl.push({ p: [f.p[0] + off * (ca * f.u[0] + sa * f.w[0]), f.p[1] + off * (ca * f.u[1] + sa * f.w[1]), f.p[2] + off * (ca * f.u[2] + sa * f.w[2])], r: vs.radiusMm * (1 - 0.35 * s), c: cVessel });
      }
      addTube(M, vl, vs.around, { cap: true });
    });
    counts.vessels += tris() - t0;
  }
  // ---- the chiasm: each nerve parts in two; the thicker strands cross, the left eye's over the right eye's ----
  let t0 = tris();
  const cross = [o.midlineXmm + ch.crossMm[0], ch.crossMm[1]];
  for (const key of ['left', 'right']) {
    const S = evenSamples(2, ch.perSpan);
    const under = key === 'right'; // (the right eye's strand passes beneath)
    addTube(M, S.map(u => {
      const p = splineAt(parts.crossing[key], u), near = 1 - smooth(0.3 * ch.shadeWithinMm, ch.shadeWithinMm, Math.hypot(p[0] - cross[0], p[1] - cross[1]));
      const k = under ? 1 - (1 - ch.shade) * near : 1;
      // (it narrows to the tract's own thickness where it runs into it, so no end of it shows)
      return { p, r: ch.crossRadiusMm - (ch.crossRadiusMm - tr.radiusMm) * smooth(1.35, 2, u), c: [cStrand[0] * k, cStrand[1] * k, cStrand[2] * k] };
    }), ch.around, { stripe: ch.stripe, cap: true, up: [0, 0, 1] });
    addTube(M, S.map(u => ({ p: splineAt(parts.uncrossed[key], u), r: ch.sideRadiusMm, c: cSide })), ch.around, { stripe: ch.stripe, cap: true, up: [0, 0, 1] });
  }
  counts.chiasm = tris() - t0;
  // ---- the tracts: their strands leave the chiasm together and fan where they end inside the brain ----
  t0 = tris();
  for (const key of ['left', 'right']) for (const b of parts.tract[key]) {
    const S = evenSamples(2, tr.perSpan);
    addTube(M, S.map(u => ({ p: splineAt(b, u), r: tr.radiusMm + (tr.endRadiusMm - tr.radiusMm) * smooth(0.6, 2, u), c: mix3(cSide, cTract, smooth(0, 1, u)) })), tr.around, { cap: true, up: [0, 0, 1] });
  }
  counts.tract = tris() - t0;
  return { positions: Float32Array.from(M.pos), normals: Float32Array.from(M.nor), colors: Float32Array.from(M.col), indices: Uint16Array.from(M.idx), triangles: M.idx.length / 3, parts, counts };
}
