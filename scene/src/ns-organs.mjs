/** Organs in the opened chest (20 November 2026).
 *
 * The owner, 19 November: "Yes, it's nice to have a view within the body and the rib cage. Perhaps put some organs in
 * there for fun, but make sure the occluding muscles, neck muscles are gone, and the transition between is smooth."
 *
 * WHAT THIS IS. Simple, smooth shapes that READ as a heart, two lungs, the great vessels and the windpipe when you look
 * down into your own opened chest (the eye view ends your body at the collar: ns-scene-three EYE_COLLAR) or between the
 * ribs. They are ILLUSTRATIONS PLACED BY PROPORTION inside the rib cage of the game's body, built here in code: NOT traced
 * anatomy (the packets hold no organ meshes), NOT part of the game's signal (no motor area, no activity, no link, no
 * collision, nothing can aim at them or hold them), and nothing about them is measured.
 *
 * WHERE THEY ARE. In BodyParts3D 4.0 whole-body millimetres (+x subject LEFT, +y POSTERIOR, +z SUPERIOR), the frame of
 * every body mesh's source. The numbers below were chosen from the inside of the rib cage of the body as the page
 * prepares it (tools/page-body.mjs: ribs, costal cartilages, breastbone and thoracic vertebrae), measured per 10 mm of
 * height: the inner lateral wall (about 108 mm from the midline at the level of the 6th to 9th ribs, 100 at the 4th,
 * 66 at the 2nd, 41 inside the first ribs), the inner face of the breastbone (y -203 at its lower end, -194 at the 5th
 * rib, -176 at the 3rd, -133 behind the manubrium), the inner back wall beside the spine (y -15 to -25 from the 4th
 * rib down, -40 at the 2nd, -60 inside the first ribs) and the front of the vertebral bodies (y -64 to -88). Each
 * organ keeps a few millimetres inside those walls. In the start posture the whole rib cage moves with its sixth
 * thoracic vertebra to within 1 to 3 mm (measured on the baked posture), so the organs ride on that segment (host:
 * 't6') and move with the trunk as one piece.
 *
 * WHAT IS SIMPLIFIED, ON PURPOSE.
 *  - The lungs are each one smooth lobe-shaped body (a loft of rounded sections, a dome on top under the first rib, a
 *    shallow dome pushed up from below by the diaphragm) with painted fissure lines; the left one is notched for the
 *    heart. Where a lung would run into the heart, a great vessel, the windpipe or the spine, its surface is pushed back
 *    onto that thing (the impressions real lungs carry), so nothing passes through anything.
 *  - The heart is a rounded cone (base up, back and to the right; apex down, forward and to the left) with the grooves
 *    between its chambers painted pale (the fat along the coronary vessels) and the atria a little darker. It swells
 *    very slightly with the living brain's beat (ns-brain-live: the same wave and clock) and not at all under reduced
 *    motion; the scene does that with one uniform (no per-frame work here).
 *  - Vessels: the aorta (red) rising from the heart, arching back to the left and running down beside the spine; the
 *    pulmonary trunk (blue, the usual colour for blood low in oxygen) and its two branches into the lungs; the superior
 *    vena cava (blue). The windpipe is pale and ringed and parts into the two main bronchi. Every free end is rounded
 *    (nothing ends in a cut); the branches into the neck and arms are left out.
 *  - No organs of the upper belly: from the eye view and from outside the belly wall covers them entirely, so they would
 *    cost triangles and never be seen.
 *
 * Cost: about 7 200 triangles in two meshes (the heart alone, for its beat; everything else in one), built once, shared by
 * your body and the mirror body. Pure: no Three.js, no DOM. The scene (ns-scene-three) makes the meshes and materials.
 */

import { BODY_SHAPE, trunkShapeField } from './ns-body-shape.mjs';

const freeze = Object.freeze;
const TAU = 2 * Math.PI;

export const ORGANS = freeze({
  on: true,
  /** The rig segment the organs ride on (ns-body BODY_SEGMENTS): the sixth thoracic vertebra, the middle of the cage. */
  host: 't6',
  /** sRGB colours: a dark red heart with paler grooves, a red aorta, blue veins and pulmonary arteries, pink-grey lungs
   * (lighter at the top, a little darker and greyer toward the back and the base), a pale ringed windpipe. */
  colors: freeze({
    heart: 0x7c1a22, atrium: 0x5f1722, groove: 0xc9a466, grooveEdge: 0x6a1a1c,
    aorta: 0xb02a30, pulmonary: 0x4b5b92, vein: 0x46568c,
    lung: 0xbf8a8f, lungApex: 0xc99a9c, lungDeep: 0x8f6b78, fissure: 0x5e3c48,
    trachea: 0xe8dac6, tracheaRing: 0xc3ad94
  }),
  roughness: 0.55,
  /** The heart's swell at the top of a beat (a share of its size; ns-brain-live's beat wave 0..1 times this). */
  beatSwell: 0.03,
  lung: freeze({
    around: 24,
    /** How square each quarter of a section is (a superellipse's exponent: 2 an ellipse, higher squarer): the side
     * toward the midline is flatter than the side against the ribs. */
    exponent: freeze({ lateral: 2.2, medial: 3.0, front: 2.4, back: 2.6 }),
    /** Sections of the LEFT lung from its base rim up: [z, medial x, lateral x, front y, back y] (mm; x from the midline,
     * outward positive). The right lung is the mirror image of its own table. The lowest row is the base rim (the
     * deepest part, against the ribs at the back and side); the base rises from it as a dome (baseDomeMm). */
    left: freeze([
      freeze([1100, 46, 98, -168, -30]), freeze([1130, 50, 104, -178, -24]), freeze([1165, 58, 106, -174, -18]),
      freeze([1200, 62, 108, -160, -16]), freeze([1230, 52, 98, -158, -18]), freeze([1255, 38, 86, -150, -22]),
      freeze([1278, 26, 76, -146, -30]), freeze([1298, 16, 60, -126, -42]), freeze([1320, 13, 43, -110, -62])
    ]),
    right: freeze([
      freeze([1110, 40, 98, -178, -30]), freeze([1140, 42, 104, -184, -24]), freeze([1175, 42, 105, -180, -18]),
      freeze([1205, 40, 106, -172, -16]), freeze([1232, 36, 96, -160, -18]), freeze([1256, 32, 86, -150, -22]),
      freeze([1278, 26, 76, -146, -30]), freeze([1298, 16, 60, -126, -42]), freeze([1320, 13, 43, -110, -62])
    ]),
    /** The apex: where the dome over the top section ends ([lateral x, y, z]). Under the arc of the first rib. */
    apex: freeze({ left: freeze([28, -86, 1346]), right: freeze([28, -86, 1348]) }),
    apexRings: 5, baseDomeMm: 34, baseRings: 5, ringMm: 11,
    /** The fissures between the lobes, painted as a darker line where the surface crosses each plane (a point and a
     * normal, left lung; the right lung's are its mirror image) and dented by dentMm there. The right lung has two
     * (oblique and horizontal), the left one (oblique). */
    fissures: freeze({
      left: freeze([freeze({ at: freeze([70, -60, 1250]), n: freeze([0, 0.62, 0.79]) })]),
      right: freeze([freeze({ at: freeze([70, -60, 1240]), n: freeze([0, 0.6, 0.8]) }), freeze({ at: freeze([70, -150, 1262]), n: freeze([0, 0.12, 0.99]) })]),
      halfWidthMm: 1.4, dentMm: 1.2
    }),
    /** Kept this far off the things it is pushed back from. */
    clearMm: 2.5
  }),
  heart: freeze({
    /** The centre of its base and its apex (mm). */
    base: freeze([-8, -121, 1266]), apex: freeze([58, -176, 1172]),
    halfWidthMm: 51, halfThickMm: 31, widestAt: 0.36, basePower: 2.6, apexPower: 2.0, apexRound: 0.55,
    rings: 24, around: 26,
    /** The groove round the heart between atria and ventricles (at `at` of its length, `depth` of the radius, `width`
     * of the length) and the groove down its front between the ventricles (an angle from the front at the base and at
     * the apex, radians, positive toward the left border). The right atrium bulges by `atriumBulge` on the right. */
    coronary: freeze({ at: 0.21, depth: 0.05, width: 0.03 }),
    anterior: freeze({ atBase: 0.5, atApex: -0.08, depth: 0.045, width: 0.11, until: 0.94 }),
    atriumBulge: 0.12
  }),
  /** Centre lines (mm) and radii of the tubes. Every end is closed with a rounded cap. */
  vessels: freeze({
    aorta: freeze({ color: 'aorta', radius: freeze([13, 10]), points: freeze([
      freeze([2, -131, 1238]), freeze([3, -136, 1268]), freeze([6, -125, 1291]), freeze([14, -100, 1302]),
      freeze([24, -74, 1292]), freeze([28, -60, 1266]), freeze([28, -62, 1180]), freeze([22, -70, 1092])
    ]) }),
    pulmonary: freeze({ color: 'pulmonary', radius: freeze([12, 10]), points: freeze([
      freeze([18, -154, 1236]), freeze([22, -159, 1256]), freeze([24, -139, 1270]), freeze([22, -124, 1277])
    ]) }),
    leftPulmonary: freeze({ color: 'pulmonary', radius: freeze([8, 6.5]), points: freeze([
      freeze([22, -130, 1280]), freeze([42, -116, 1276]), freeze([60, -104, 1264])
    ]) }),
    rightPulmonary: freeze({ color: 'pulmonary', radius: freeze([8, 6.5]), points: freeze([
      freeze([22, -128, 1278]), freeze([6, -119, 1266]), freeze([-20, -112, 1254]), freeze([-50, -106, 1246])
    ]) }),
    cava: freeze({ color: 'vein', radius: freeze([10, 10]), points: freeze([
      freeze([-29, -122, 1334]), freeze([-29, -124, 1296]), freeze([-28, -128, 1256])
    ]) }),
    trachea: freeze({ color: 'trachea', rings: 5, radius: freeze([9, 9]), points: freeze([
      freeze([0, -92, 1350]), freeze([0, -92, 1310]), freeze([0, -93, 1272])
    ]) }),
    leftBronchus: freeze({ color: 'trachea', radius: freeze([7, 6]), points: freeze([
      freeze([0, -93, 1274]), freeze([20, -92, 1260]), freeze([42, -90, 1246])
    ]) }),
    rightBronchus: freeze({ color: 'trachea', radius: freeze([7.5, 6.5]), points: freeze([
      freeze([0, -93, 1274]), freeze([-18, -91, 1257]), freeze([-36, -89, 1240])
    ]) }),
    around: 10, ringMm: 10
  }),
  /** The tubes the lungs are pushed back from (the bronchi and the pulmonary arteries' far ends go INTO the lungs). */
  lungKeepsOff: freeze(['aorta', 'pulmonary', 'cava', 'trachea']),
  /** The column of the vertebral bodies the lungs keep out of: an elliptic cylinder (centre x, y; half-widths). */
  spine: freeze({ x: 0, y: -44, halfX: 23, halfY: 30 })
});

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** An sRGB hex colour as linear r, g, b (vertex colours of a lit material are linear). */
export function organLinear(hex) {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Catmull-Rom through the rows of `rows` (each a list of numbers) at u (0 = the first row, 1 = the second, ...). */
function rowSpline(rows, u) {
  const last = rows.length - 1, i = Math.min(last - 1, Math.max(0, Math.floor(u))), t = Math.min(1, Math.max(0, u - i));
  const R = k => rows[Math.max(0, Math.min(last, k))], p0 = R(i - 1), p1 = R(i), p2 = R(i + 1), p3 = R(i + 2), t2 = t * t, t3 = t2 * t;
  return p1.map((_, a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3));
}
/** Points along the Catmull-Rom curve through `pts`, about `stepMm` apart (at least two per span). */
function curve(pts, stepMm) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const n = Math.max(2, Math.ceil(Math.hypot(...sub(pts[i + 1], pts[i])) / stepMm));
    for (let k = 0; k < n; k++) out.push(rowSpline(pts, i + k / n));
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/** A growing mesh: positions, linear colours, triangle indices. */
const meshOf = () => ({ pos: [], col: [], idx: [] });
const vcount = M => M.pos.length / 3;
/** Rings of equal size stacked one on the next (ring k = vertices first + k * n ... + n - 1), joined by quads; an
 * optional single vertex before the first ring and after the last closes each end. flip turns every face round. */
function joinRings(M, first, rings, n, { startPole = -1, endPole = -1, flip = false } = {}) {
  const tri = (a, b, c) => (flip ? M.idx.push(a, c, b) : M.idx.push(a, b, c));
  if (startPole >= 0) for (let j = 0; j < n; j++) tri(startPole, first + (j + 1) % n, first + j);
  for (let r = 0; r + 1 < rings; r++) for (let j = 0; j < n; j++) {
    const k = (j + 1) % n, a = first + r * n + j, b = first + r * n + k, c = a + n, d = b + n;
    tri(a, b, c); tri(b, d, c);
  }
  if (endPole >= 0) { const last = first + (rings - 1) * n; for (let j = 0; j < n; j++) tri(last + j, last + (j + 1) % n, endPole); }
}
/** Area-weighted vertex normals of an indexed triangle list (outward for counter-clockwise faces). */
export function organNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = 3 * idx[i], b = 3 * idx[i + 1], c = 3 * idx[i + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] += fx; n[v + 1] += fy; n[v + 2] += fz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}

/* ------------------------------------------------------------------------------------------------ the heart */

/** The heart's frame: base point, axis (base -> apex), length, the front (square to the axis, toward -y) and the side
 * (axis x front: toward the subject's right and down). */
export function heartFrame(o = ORGANS) {
  const H = o.heart, d = sub(H.apex, H.base), length = Math.hypot(d[0], d[1], d[2]), axis = scale(d, 1 / length);
  const toFront = [0, -1, 0], front = norm(sub(toFront, scale(axis, dot(toFront, axis)))), side = norm(cross(axis, front));
  return { base: H.base.slice(), apex: H.apex.slice(), axis, length, front, side };
}
/** The heart's radius share (0..1 of its half sizes) at s (0 = base, 1 = apex): a flat rounded base, widest at
 * widestAt, a rounded apex. */
function heartProfile(s, H) {
  const w = H.widestAt;
  if (s <= w) return Math.sqrt(Math.max(0, 1 - ((w - s) / w) ** H.basePower));
  return Math.max(0, 1 - ((s - w) / (1 - w)) ** H.apexPower) ** H.apexRound;
}
/** The point of the heart's surface at s (0..1 base -> apex) and angle phi (0 = toward its side vector, pi/2 = the
 * front), and how much of each painted feature is there: { p, groove, atrium }. */
function heartPoint(F, H, s, phi) {
  const prof = heartProfile(s, H);
  const cor = H.coronary, ant = H.anterior;
  const gC = Math.exp(-(((s - cor.at) / cor.width) ** 2));
  const phiA = Math.PI / 2 + ant.atBase + (ant.atApex - ant.atBase) * s;
  let dA = phi - phiA; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
  const gA = Math.exp(-((dA / ant.width) ** 2)) * smooth(cor.at - 0.02, cor.at + 0.06, s) * (1 - smooth(ant.until - 0.08, ant.until, s));
  // the right atrium: a bulge toward the side vector (the subject's right) above the coronary groove
  const bulge = H.atriumBulge * Math.max(0, Math.cos(phi)) ** 2 * (1 - smooth(cor.at - 0.04, cor.at + 0.02, s)) * smooth(0.0, 0.08, s);
  const k = prof * (1 + bulge) * (1 - cor.depth * gC) * (1 - ant.depth * gA);
  const c = add(F.base, scale(F.axis, s * F.length));
  const p = add(c, add(scale(F.side, Math.cos(phi) * H.halfWidthMm * k), scale(F.front, Math.sin(phi) * H.halfThickMm * k)));
  return { p, groove: Math.max(gC, gA), atrium: 1 - smooth(cor.at - 0.01, cor.at + 0.02, s) };
}
/** The heart as one indexed mesh: { positions, normals, colors, indices, triangles, centre (the point it swells about),
 * frame }. */
export function buildHeart(o = ORGANS) {
  const H = o.heart, C = o.colors, F = heartFrame(o), M = meshOf(), N = H.around, R = H.rings;
  const cHeart = organLinear(C.heart), cAtrium = organLinear(C.atrium), cGroove = organLinear(C.groove), cEdge = organLinear(C.grooveEdge);
  const colourAt = (groove, atrium) => {
    const base = mix3(cHeart, cAtrium, atrium);
    // a thin darker edge either side of the pale groove, so it reads as a line on the dark muscle
    return groove > 0.55 ? mix3(cEdge, cGroove, smooth(0.55, 0.9, groove)) : mix3(base, cEdge, smooth(0.2, 0.55, groove) * 0.7);
  };
  const putVertex = q => { M.pos.push(q.p[0], q.p[1], q.p[2]); const c = colourAt(q.groove, q.atrium); M.col.push(c[0], c[1], c[2]); };
  // base pole, rings (closer together near the base and the apex, where the profile turns fast), apex pole
  const baseIdx = vcount(M); putVertex({ p: F.base, groove: 0, atrium: 1 });
  const first = vcount(M);
  for (let r = 1; r <= R; r++) {
    const u = r / (R + 1), s = 0.5 - 0.5 * Math.cos(Math.PI * u);
    for (let j = 0; j < N; j++) putVertex(heartPoint(F, H, s, (j / N) * TAU));
  }
  const apexIdx = vcount(M); putVertex({ p: F.apex, groove: 0, atrium: 0 });
  // (phi grows from the side vector toward the front: clockwise about the axis the rings are stacked along, so the
  // faces are turned round to face out)
  joinRings(M, first, R, N, { startPole: baseIdx, endPole: apexIdx, flip: true });
  const positions = Float32Array.from(M.pos), indices = Uint16Array.from(M.idx);
  const centre = add(F.base, scale(F.axis, H.widestAt * F.length));
  return { positions, normals: organNormals(positions, indices), colors: Float32Array.from(M.col), indices, triangles: indices.length / 3, centre, frame: F };
}

/* ------------------------------------------------------------------------------------------------- the tubes */

/** One tube along the curve through `pts` into M: rings `around` round (a frame that does not twist), radius from r0 to
 * r1, colour `colourAt(distance along)`, both ends closed with a rounded cap. Returns its centre line [{ p, r }]. */
function addTube(M, pts, around, r0, r1, stepMm, colourAt) {
  const line = curve(pts, stepMm), L = [0];
  for (let i = 1; i < line.length; i++) L.push(L[i - 1] + Math.hypot(...sub(line[i], line[i - 1])));
  const total = L[L.length - 1] || 1, rings = [];
  let u = null;
  for (let i = 0; i < line.length; i++) {
    const t = norm(sub(line[Math.min(line.length - 1, i + 1)], line[Math.max(0, i - 1)]));
    if (!u) u = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    u = norm(sub(u, scale(t, dot(u, t))));
    const w = cross(t, u);
    rings.push({ c: line[i], t, u, w, r: r0 + (r1 - r0) * (L[i] / total), d: L[i] });
  }
  // the caps: three rings closing toward a pole beyond each end, on a quarter circle
  const capAt = (ring, dir, k) => { const a = (k / 3) * (Math.PI / 2); return { c: add(ring.c, scale(ring.t, dir * ring.r * Math.sin(a))), t: ring.t, u: ring.u, w: ring.w, r: ring.r * Math.cos(a), d: ring.d }; };
  const all = [capAt(rings[0], -1, 2), capAt(rings[0], -1, 1), ...rings, capAt(rings[rings.length - 1], 1, 1), capAt(rings[rings.length - 1], 1, 2)];
  const start = vcount(M);
  const pole0 = start;
  { const r = rings[0], c = colourAt(r.d); M.pos.push(...add(r.c, scale(r.t, -r.r))); M.col.push(c[0], c[1], c[2]); }
  const first = vcount(M);
  for (const g of all) {
    const c = colourAt(g.d);
    for (let j = 0; j < around; j++) {
      const ph = (j / around) * TAU, e = add(scale(g.u, Math.cos(ph)), scale(g.w, Math.sin(ph)));
      M.pos.push(g.c[0] + g.r * e[0], g.c[1] + g.r * e[1], g.c[2] + g.r * e[2]); M.col.push(c[0], c[1], c[2]);
    }
  }
  const pole1 = vcount(M);
  { const r = rings[rings.length - 1], c = colourAt(r.d); M.pos.push(...add(r.c, scale(r.t, r.r))); M.col.push(c[0], c[1], c[2]); }
  // (rings turn from u toward w = t x u: counter-clockwise about the direction they are stacked in, so the faces face out)
  joinRings(M, first, all.length, around, { startPole: pole0, endPole: pole1 });
  return rings.map(g => ({ p: g.c, r: g.r }));
}

/* ------------------------------------------------------------------------------------------------- the lungs */

/** One section's point at angle phi in lateral coordinates (u outward from the midline, y): a superellipse with its own
 * half size and squareness in each quarter. */
function sectionPoint(sec, phi, E) {
  const c = Math.cos(phi), s = Math.sin(phi);
  const cu = (sec.uM + sec.uL) / 2, cy = (sec.yF + sec.yB) / 2;
  const du = c >= 0 ? (sec.uL - cu) * Math.abs(c) ** (2 / E.lateral) : -(cu - sec.uM) * Math.abs(c) ** (2 / E.medial);
  const dy = s >= 0 ? (sec.yB - cy) * Math.abs(s) ** (2 / E.back) : -(cy - sec.yF) * Math.abs(s) ** (2 / E.front);
  return [cu + du, cy + dy];
}
/** Distance from point p to the polyline `line` ([{ p, r }]) and the nearest point and radius there. */
function nearOnLine(line, p) {
  let best = Infinity, at = null, r = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i].p, b = line[i + 1].p, ab = sub(b, a), l2 = dot(ab, ab) || 1, t = clamp01(dot(sub(p, a), ab) / l2), q = add(a, scale(ab, t)), d = Math.hypot(...sub(p, q));
    if (d < best) { best = d; at = q; r = line[i].r + (line[i + 1].r - line[i].r) * t; }
  }
  return { d: best, at, r };
}
/** Push point p (mm) out of everything a lung keeps off: the heart (as an ellipsoid round its rings), the tubes, the
 * spine's column. Returns a new point. */
function keepOff(p, keep, clear) {
  let q = p.slice();
  for (let pass = 0; pass < 2; pass++) {
    // the heart: in its own frame, scaled to a unit sphere at its widest
    const F = keep.heart, H = keep.heartSize;
    const v = sub(q, F.base), s = dot(v, F.axis) / F.length;
    if (s > -0.08 && s < 1.08) {
      const prof = Math.max(0.05, heartProfile(clamp01(s), H)), a = dot(v, F.side), b = dot(v, F.front);
      const ra = H.halfWidthMm * prof * 1.08 + clear, rb = H.halfThickMm * prof * 1.05 + clear, e = Math.hypot(a / ra, b / rb);
      if (e < 1 && s >= 0 && s <= 1) { const k = 1 / Math.max(e, 1e-3); q = add(add(F.base, scale(F.axis, s * F.length)), add(scale(F.side, a * k), scale(F.front, b * k))); }
    }
    for (const line of keep.tubes) {
      const n = nearOnLine(line, q);
      if (n.d < n.r + clear && n.d > 1e-6) q = add(n.at, scale(sub(q, n.at), (n.r + clear) / n.d));
    }
    const S = keep.spine, ex = (q[0] - S.x) / (S.halfX + clear), ey = (q[1] - S.y) / (S.halfY + clear), e = Math.hypot(ex, ey);
    if (e < 1) { const k = 1 / Math.max(e, 1e-3); q = [S.x + (q[0] - S.x) * k, S.y + (q[1] - S.y) * k, q[2]]; }
  }
  return q;
}
/** One lung (side +1 left, -1 right) into M, with its fissures and colours; keep: what it is pushed back from. */
function addLung(M, o, side, keep) {
  const L = o.lung, E = L.exponent, C = o.colors, N = L.around;
  const rows = (side > 0 ? L.left : L.right).map(r => r.slice());
  const apex = side > 0 ? L.apex.left : L.apex.right;
  const z0 = rows[0][0], z1 = rows[rows.length - 1][0];
  // the wall: sections every ~ringMm of height, from the spline through the table's rows (by row index, spaced by z)
  const sections = [];
  const n = Math.max(rows.length, Math.round((z1 - z0) / L.ringMm));
  for (let k = 0; k <= n; k++) {
    // the row index whose spline z is the k-th even height
    const zt = z0 + ((z1 - z0) * k) / n;
    let lo = 0, hi = rows.length - 1;
    for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (rowSpline(rows, mid)[0] < zt) lo = mid; else hi = mid; }
    const r = rowSpline(rows, (lo + hi) / 2);
    sections.push({ z: zt, uM: r[1], uL: r[2], yF: r[3], yB: r[4] });
  }
  const ringsUY = sections.map(sec => { const pts = []; for (let j = 0; j < N; j++) pts.push(sectionPoint(sec, (j / N) * TAU, E)); return pts; });
  const rings = [];
  // the base: rings shrinking toward the base's middle, rising by the dome
  const base = ringsUY[0], bc = [(sections[0].uM + sections[0].uL) / 2, (sections[0].yF + sections[0].yB) / 2];
  for (let b = L.baseRings; b >= 1; b--) {
    const k = b / (L.baseRings + 1), lift = L.baseDomeMm * (1 - k * k);
    rings.push(base.map(([u, y]) => [bc[0] + (u - bc[0]) * k, bc[1] + (y - bc[1]) * k, z0 + lift]));
  }
  sections.forEach((sec, i) => rings.push(ringsUY[i].map(([u, y]) => [u, y, sec.z])));
  // the apex: a dome from the top section to the apex point
  const top = ringsUY[ringsUY.length - 1], tc = [(sections[sections.length - 1].uM + sections[sections.length - 1].uL) / 2, (sections[sections.length - 1].yF + sections[sections.length - 1].yB) / 2];
  for (let a = 1; a <= L.apexRings; a++) {
    const th = (a / (L.apexRings + 1)) * (Math.PI / 2), k = Math.cos(th), cu = tc[0] + (apex[0] - tc[0]) * Math.sin(th), cy = tc[1] + (apex[1] - tc[1]) * Math.sin(th);
    rings.push(top.map(([u, y]) => [cu + (u - tc[0]) * k, cy + (y - tc[1]) * k, z1 + (apex[2] - z1) * Math.sin(th)]));
  }
  const fiss = (side > 0 ? L.fissures.left : L.fissures.right).map(f => ({ at: [side * f.at[0], f.at[1], f.at[2]], n: norm([side * f.n[0], f.n[1], f.n[2]]) }));
  const cLung = organLinear(C.lung), cApex = organLinear(C.lungApex), cDeep = organLinear(C.lungDeep), cFiss = organLinear(C.fissure);
  const zTop = apex[2], hw = L.fissures.halfWidthMm;
  const put = q0 => {
    // lateral coordinates -> x; keep off the heart, the vessels, the spine; the fissures' dent and line
    let q = keepOff([side * q0[0], q0[1], q0[2]], keep, L.clearMm);
    let f = 0;
    for (const F of fiss) {
      const d = dot(sub(q, F.at), F.n);
      // (a fissure runs only over the lung's outer surface away from the hilum: not on its middle, medial face)
      const lateral = smooth(0.25, 0.55, (side * q[0] - 10) / 100);
      const g = Math.exp(-((d / hw) ** 2)) * lateral;
      if (g > f) f = g;
    }
    if (f > 0.02) { const c = [side * 0.5 * (L.left[0][1] + L.left[0][2]), -80, q[2]], dir = norm([q[0] - c[0], q[1] - c[1], 0]); q = sub(q, scale(dir, L.fissures.dentMm * f)); }
    const hgt = clamp01((q[2] - z0) / (zTop - z0)), back = clamp01((q[1] + 160) / 140);
    let c = mix3(cLung, cApex, smooth(0.62, 1, hgt));
    c = mix3(c, cDeep, 0.55 * (1 - smooth(0.0, 0.35, hgt)) + 0.35 * smooth(0.5, 1, back) * (1 - smooth(0.6, 1, hgt)));
    c = mix3(c, cFiss, 0.85 * smooth(0.15, 0.7, f));
    M.pos.push(q[0], q[1], q[2]); M.col.push(c[0], c[1], c[2]);
  };
  const pole0 = vcount(M);
  put([bc[0], bc[1], z0 + L.baseDomeMm]);
  const first = vcount(M);
  for (const ring of rings) for (const q of ring) put(q);
  const pole1 = vcount(M);
  put(apex);
  // (rings run counter-clockwise seen from above in lateral coordinates, so the left lung's faces face out; the right
  // lung is the mirror image, so its faces are turned round)
  joinRings(M, first, rings.length, N, { startPole: pole0, endPole: pole1, flip: side < 0 });
}

/**
 * Every organ: { heart: { positions, normals, colors, indices, triangles, centre }, tissue: { ..., ranges } (the lungs,
 * the vessels and the windpipe in one mesh; ranges: each part's [first, end) triangles), triangles, parts: { lungs,
 * vessels, heart } (triangles), host }.
 * Positions in source mm (see the head of this file). An illustration: nothing here is measured.
 * 20 November 2026 (the owner: "a smaller and much flatter chest"): the organs pass through the same trunk rule as the
 * body's meshes (ns-body-shape trunkShapeField, `shape`; null leaves it out), so the flatter rib cage still holds them:
 * the rule moves every point at the same height and side by the same share of its depth in front of the spine, and
 * never changes which of two points is further forward. The numbers in ORGANS are those of the source body.
 */
export function buildOrgans(o = ORGANS, shape = BODY_SHAPE.trunk) {
  const heart = buildHeart(o);
  const M = meshOf(), V = o.vessels, C = o.colors;
  const tubeLines = {}, ranges = {};
  const mark = (name, from) => { ranges[name] = [from, M.idx.length / 3]; };
  // the tubes first (the lungs keep off some of them)
  for (const [name, t] of Object.entries(V)) {
    if (!t || !Array.isArray(t.points)) continue;
    const from = M.idx.length / 3;
    const c = organLinear(C[t.color]), ring = t.rings ? organLinear(C.tracheaRing) : null;
    const colourAt = ring ? d => mix3(c, ring, smooth(0.25, 0.75, 0.5 + 0.5 * Math.cos((TAU * d) / t.rings))) : () => c;
    tubeLines[name] = addTube(M, t.points.map(p => p.slice()), V.around, t.radius[0], t.radius[1], t.rings ? Math.min(V.ringMm, t.rings / 2) : V.ringMm, colourAt);
    mark(name, from);
  }
  const vesselTris = M.idx.length / 3;
  const keep = { heart: heart.frame, heartSize: o.heart, tubes: o.lungKeepsOff.map(k => tubeLines[k]).filter(Boolean), spine: o.spine };
  let from = M.idx.length / 3;
  addLung(M, o, 1, keep); mark('leftLung', from); from = M.idx.length / 3;
  addLung(M, o, -1, keep); mark('rightLung', from);
  const positions = Float32Array.from(M.pos), indices = positions.length / 3 > 65535 ? Uint32Array.from(M.idx) : Uint16Array.from(M.idx);
  if (shape && shape.on) {
    const f = trunkShapeField(shape);
    f.apply(positions, positions);
    f.apply(heart.positions, heart.positions);
    heart.normals = organNormals(heart.positions, heart.indices);
    heart.centre = [heart.centre[0], heart.centre[1] + f.at(heart.centre[0], heart.centre[1], heart.centre[2]), heart.centre[2]];
  }
  const tissue = { positions, normals: organNormals(positions, indices), colors: Float32Array.from(M.col), indices, triangles: indices.length / 3, ranges };
  return {
    heart, tissue, host: o.host, triangles: heart.triangles + tissue.triangles,
    parts: { heart: heart.triangles, vessels: vesselTris, lungs: tissue.triangles - vesselTris }
  };
}
