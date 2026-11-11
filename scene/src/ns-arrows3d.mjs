/**
 * NeuroSurge R558 (user Messages 7 and 19): COMPASS ORBIT ARROWS AS SOLID 3D V-SHAPED ARROW TIPS ON TWO FRAMES.
 *
 * The user: "Let's just make all the arrows basic v-shaped arrow tips." and "Don't have weird arrow placement (think
 * of the motor strip as a horizontal 16:9 frame and the mirror as a vertical 9:16 frame, the arrows will be at the
 * centered edges of each frame perimeter side)." Then (Message 19): "Let's make the arrows 3d and slightly chunky, with
 * their vertex heads turning (further) away and their tail ends towards (closer)." Standing notes that still hold: the
 * arrows stay in place after tapping on them, are easy to click and should not block the view; arrows look clean and
 * deliberate (Message 18).
 *
 * What this module does (one owner; the pure maths is Node-testable without a DOM, THREE is passed in):
 *  (a) SHAPE (pure): a SOLID chevron. The V outline (two straight strokes of equal width meeting at a mitred point,
 *      square open ends, mirror symmetric about its axis; no tail, ribbon or curl) is extruded to a modest thickness
 *      with softly bevelled edges and then tilted in depth about its across axis: the point of the V (its vertex head)
 *      lies FARTHER from the viewer, the two open tail ends NEARER, so each tip points outward and away into the scene.
 *      chevronSolid() builds it; arrowTipOutline() gives what the viewer sees of it (its silhouette, one convex hull per
 *      stroke, stroke centre lines, box, click point) in design units (1 unit = sizePx on screen), centred on that
 *      box; buildArrowGeometry() the mesh (positions, normals, triangles ordered far to near).
 *  (b) FRAME (pure, CSS px, y down): frameRect() is the smallest rectangle of a given aspect (16:9 for the motor strip,
 *      9:16 for the mirror body) that contains a target's on-screen box, centred on that box, then clamped (cut) to the
 *      usable view; frameArrowSpots() puts the four arrows at the midpoints of its four sides (forward = top centre,
 *      back = bottom centre, left middle, right middle), each pointing outward; the tips are placed in PAIRS (left +
 *      right at one height, forward + back on one vertical line; R558 Message 31, FRAME_PAIR), moved inward only as far
 *      as their drawn boxes (grown by the hover scale) need to stay inside the usable view (the side tips both by the
 *      same amount).
 *  (c) WORLD ANCHORS AND FRAMES (pure): frameArrowAnchors() lifts the screen spots into the world on the plane through
 *      the target's centre that is square to the reference camera's view axis: fixed world points, so the tips stay
 *      with their target like any object in the world when the player looks around. facingArrowFrames() places each
 *      tip for the camera in use: its outward and across axes lie in the picture plane, scaled to exactly sizePx on
 *      screen at the anchor, and its depth axis runs along the sight line through the anchor. So every tip is seen
 *      exactly as the same tilted solid seen straight on (its silhouette symmetric about its own pointing direction,
 *      at its planned place and size), also near the edge of the wide view and in third person, and it never becomes a
 *      thin sliver. planFrameArrows() does (a) to (c) in one call.
 *  (d) PICKING (pure): arrowHitShape() is a generous invisible hit shape fitted to the silhouette (each stroke's convex
 *      hull grown by hitStrokePad, and a capsule along the axis that fills the inside of the V); pickArrows() /
 *      pickArrowHits() meet a world ray (crosshair or free pointer, first or third person) with each tip's picture
 *      plane and test the hit shape there, with an extra screen padding (ARROW_LAYOUT.pickPadPx).
 *  (e) RIG (THREE): createArrowRig() draws the four tips of one target as translucent lit solids: a gentle key light
 *      from the upper left plus a soft rim, the faces that turn away from the viewer (bevels, walls) darkening toward
 *      the edge colour, so a light face with a darker edge stays readable over the dark background, the glass, the pale
 *      bones and the bright motor areas alike. The tips are drawn ON TOP of the scene (no depth test, last in the
 *      transparent list), so where a tip lies over a motor area the tip is what is seen there and what a tap there
 *      means; within a tip only the faces turned toward the viewer are drawn (back faces culled; seen along its sight
 *      line the solid covers each pixel once) and its triangles are ordered far to near. Hover: warm white, more solid,
 *      hoverScale larger (the existing hover response).
 *  (f) Helpers other code reads: the projection helpers (projectWorldPx, pixelRay, projectPointsPx), screenBoxOf,
 *      occupancyGrid (mirror placement and the mirror state readout) and convexHullPx.
 *
 * Coordinates: world metres; a camera is { width, height (CSS px, x right, y DOWN), fovYDeg } plus either Three's 'YXZ'
 * yaw / pitch at `position` (default the origin) or its matrixWorld (any camera, e.g. third person). Screen directions
 * per arrow: COMPASS_SCREEN. Orbit names are ns-app ORBIT_DIRS ('forward' | 'back' | 'left' | 'right'). Matrices are
 * column-major Float64Array(16) (THREE.Matrix4.fromArray). Local tip axes: x = u (outward, the compass direction),
 * y = depth (away from the viewer, along the sight line), z = across.
 *
 * Honesty: the arrows only turn the player's VIEW of the simulated brain (or of the mirror image of the body) around
 * its centre; they are controls, not anatomy, and say nothing about real brains.
 */

const DEG = Math.PI / 180;
const freeze = o => Object.freeze(o);

/** The four arrows (same names and order as ns-scene-three ARROW_DIRS and ns-app orbit requests). */
export const COMPASS_DIRS = freeze(['forward', 'back', 'left', 'right']);
/** Screen direction of each arrow from its frame's middle (CSS px, y down): forward = top, back = bottom. */
export const COMPASS_SCREEN = freeze({ forward: freeze([0, -1]), back: freeze([0, 1]), left: freeze([-1, 0]), right: freeze([1, 0]) });

/**
 * The solid V tip in DESIGN UNITS (1 unit = sizePx on screen). Before the tilt: stroke centre lines run from the two
 * open ends (u = 0, z = +-halfSpan) to the point (u = depth, z = 0); every stroke is 2 x halfStroke wide, mitred at
 * the point, square at the ends; the outline is extruded to `thickness` (centred on the outline's plane) and every
 * edge is bevelled at 45 degrees by `bevel`, its normals running smoothly from the face to the wall (a soft, rounded
 * edge). tiltDeg: the whole solid then turns about its across axis so that the point goes away from the viewer and
 * the open ends come toward the viewer (0 = flat in the picture plane). eyeUnits: the tip is seen in perspective as from
 * this many design units away (facingArrowFrames), so its far point is drawn a little smaller and its near open ends a
 * little larger, which makes the tilt read at a glance (a display choice: from the player's real distance the tip
 * would show almost no perspective of its own). Hit shape (arrowHitShape): the silhouette of
 * each stroke (its convex hull as seen) grown by hitStrokePad, plus a capsule along the axis with radius
 * hitFillShare x halfSpan that fills the inside of the V.
 * Display choices (an opening of about 95 degrees before the tilt, a stroke a little over a sixth of the width, a
 * thickness of about 0.6 of the stroke width, a bevel a third of the thickness, 40 degrees of tilt), chosen by
 * viewing in the browser; no anatomy is implied.
 */
export const ARROW_DESIGN = freeze({
  shape: 'chevron-solid', depth: 0.46, halfSpan: 0.5, halfStroke: 0.105, thickness: 0.13, bevel: 0.042, tiltDeg: 40, eyeUnits: 2.6,
  hitStrokePad: 0.07, hitFillShare: 0.55
});

/**
 * Size of the V tips per target (display choices): sizePx = clamp(sizeFrac x min(width, height), minPx, maxPx), the
 * tip's design unit on screen (its width is 2 x halfSpan = 1 unit plus the stroke). The brain's tips are larger than
 * the mirror body's (the two sets also differ in colour, ns-colors ARROW_COLORS).
 */
export const ARROW_TIP_SIZES = freeze({
  brain: freeze({ sizeFrac: 0.075, minPx: 40, maxPx: 72 }),
  mirror: freeze({ sizeFrac: 0.056, minPx: 30, maxPx: 52 })
});

/** marginPx: the screen margin (callers' usable views); pickPadPx: extra screen padding of the hit shape. */
export const ARROW_LAYOUT = freeze({ marginPx: 8, pickPadPx: 8 });

/**
 * Look (display choices; sRGB hex): `fill` the light colour of a tip, `edge` the dark colour its turned-away faces
 * (bevels, walls) lean toward, `rim` the soft rim light, `hover` the warm white mixed in under the crosshair / pointer.
 * opacity: how solid a tip's face is at rest ("translucent but clearly visible"), hoverOpacity under the pointer,
 * blockedOpacity for a tip that is under the look but cannot be used now, edgeOpacity the least opacity of its
 * turned-away faces. Light (in the view: x right, y up, z toward the viewer, so every tip is lit the same way wherever it
 * is on screen): keyLight the direction toward the key light (upper left, in front), ambient + diffuse x (wrapped
 * n.l), specular / shininess its highlight, rimLight the rim's strength; edgeDark how far a face seen edge-on goes toward
 * `edge`, edgeFacing the range of n.v (cosine of the angle to the sight line) over which faces go from edge-on to face-on;
 * farDim the brightness of the far point against the near open ends (a depth cue).
 * hoverScale: a hovered tip is drawn this much larger (about its middle). renderOrder: after everything else of the
 * scene (with no depth test the tips are then drawn on top). ns-colors arrowLook(kind) gives the per-target colours
 * (scene: makeArrowRig).
 */
export const ARROW_LOOK = freeze({
  fill: 0xe9eef4, edge: 0x05070b, rim: 0xcfe0ff, hover: 0xfff1cf,
  opacity: 0.62, hoverOpacity: 0.92, blockedOpacity: 0.22, edgeOpacity: 0.82,
  keyLight: freeze([-0.38, 0.56, 0.74]), ambient: 0.42, diffuse: 0.62, specular: 0.4, shininess: 40, rimLight: 0.3,
  edgeDark: 0.75, edgeFacing: freeze([0.12, 0.6]), farDim: 0.66,
  hoverScale: 1.1, renderOrder: 100,
  // R558 BB (style guide, "the 3D arrows: cel bands and a black ink contour"): the key light in three tones (cel steps of
  // the wrapped N.L and their levels, soft half-width), a crisp highlight (the specular term's step lo .. hi), and a
  // near-black ink line (#0b0809) inkCss CSS px wide inside the V's own outline (the solid's silhouette seen face-on,
  // measured in the V's design plane), opacity inkAlpha; the walls (seen edge-on) are inked by wallInk.
  celSteps: freeze([0.3, 0.68]), celLevels: freeze([0.3, 0.68, 1.0]), celSoft: 0.04, specCrisp: freeze([0.42, 0.52]),
  ink: 0x0b0809, inkCss: 1.1, inkAlpha: 0.95, wallInk: 0.65
});

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const isNum = Number.isFinite;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const norm3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function fail(msg) { throw new Error(`ns:arrows3d: ${msg}`); }

/* ------------------------------------------------------------------------------------------------ sizes */

/** The V tip's design unit in CSS px for a viewport and a target ('brain' | 'mirror' or a sizes object). Pure. */
export function arrowTipSizePx({ width, height } = {}, kind = 'brain') {
  if (!(width > 0 && height > 0)) fail('arrowTipSizePx needs width and height > 0');
  const s = typeof kind === 'string' ? ARROW_TIP_SIZES[kind] : kind;
  if (!s) fail(`unknown arrow kind ${kind}`);
  return clamp(s.sizeFrac * Math.min(width, height), s.minPx, s.maxPx);
}

/* ------------------------------------------------------------------------------------------------ the solid V tip */

/** Inset of a simple polygon [[u, z], ...] by b (pure): every edge moved inward by b, every corner where its two moved
 * edges meet (a mitre; right for the concave corner of the V too). { inset, inward (unit inward normal per edge i,
 * from corner i to i + 1) }. */
function insetPolygon(P, b) {
  const n = P.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = P[i], c = P[(i + 1) % n]; area += a[0] * c[1] - c[0] * a[1]; }
  const sg = area > 0 ? 1 : -1; // +1: counter-clockwise with u right and z up
  const inward = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], c = P[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    inward.push([(-sg * (c[1] - a[1])) / l, (sg * (c[0] - a[0])) / l]);
  }
  const inset = P.map((p, i) => {
    const n1 = inward[(i + n - 1) % n], n2 = inward[i], k = b / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + k * (n1[0] + n2[0]), p[1] + k * (n1[1] + n2[1])];
  });
  return { inset, inward };
}

const solidCache = new WeakMap();

/**
 * The solid, tilted V tip in design units (pure; cached per design object). Local axes: x outward (the pointing
 * direction), y depth (away from the viewer), z across. The outline (inner end +, outer end +, outer point, outer end -,
 * inner end -, inner point) is extruded over h = -thickness / 2 .. +thickness / 2 (h away from the viewer), bevelled at
 * 45 degrees by `bevel` on both faces, then turned by tiltDeg about the z axis so that the point (u > 0) goes away
 * (x = u cos - h sin, y = u sin + h cos), and finally moved so that its silhouette box (x, z) and its depth range are
 * centred on the origin. Normals: the faces' own, the walls' own, and on a bevel they run from the face's to the
 * wall's across it (a soft, rounded edge).
 * Returns { design, tiltDeg, positions, normals (Float32Array, local), indices (Uint16Array, triangles ordered FAR to
 * NEAR, each wound counter-clockwise about its outward normal), vertexCount, triangleCount, corners3 (every corner of
 * every layer, local [x, y, z]), point3 / mouth3 / ends3 (the stroke centre lines' point, the middle of the open ends
 * and the two open ends, at mid thickness), box: { uMin, uMax, zMin, zMax } (the silhouette as seen along y),
 * depthRange, shift, outline (arrowTipOutline), hit (arrowHitShape) }.
 */
export function chevronSolid(design = ARROW_DESIGN) {
  const cacheable = design && typeof design === 'object';
  if (cacheable && solidCache.has(design)) return solidCache.get(design);
  const d = { ...ARROW_DESIGN, ...design };
  for (const k of ['depth', 'halfSpan', 'halfStroke', 'thickness']) if (!(isNum(d[k]) && d[k] > 0)) fail(`design.${k} must be > 0`);
  if (!(d.halfStroke < Math.min(d.depth, d.halfSpan))) fail('design.halfStroke must be smaller than depth and halfSpan');
  const bev = isNum(d.bevel) ? d.bevel : 0, tilt = (isNum(d.tiltDeg) ? d.tiltDeg : 0) * DEG;
  if (!(bev >= 0 && bev < Math.min(0.8 * d.halfStroke, d.thickness / 2))) fail('design.bevel must be >= 0 and below 0.8 x halfStroke and half the thickness');
  if (!(tilt >= 0 && tilt <= 60 * DEG)) fail('design.tiltDeg must be within 0 .. 60');
  const E = d.eyeUnits;
  if (!(isNum(E) && E >= 1.5)) fail('design.eyeUnits must be a number >= 1.5');
  const L = d.depth, H = d.halfSpan, t = d.halfStroke, l = Math.hypot(L, H), T = d.thickness;
  const nU = H / l, nZ = L / l, mitre = (t * l) / H;
  const P = [[-t * nU, H - t * nZ], [t * nU, H + t * nZ], [L + mitre, 0], [t * nU, -H - t * nZ], [-t * nU, -H + t * nZ], [L - mitre, 0]];
  const { inset: Q, inward } = insetPolygon(P, bev);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const h0 = -T / 2, h1 = -T / 2 + bev, h2 = T / 2 - bev, h3 = T / 2;
  const layers = [[Q, h0], [P, h1], [P, h2], [Q, h3]];
  const rot = (u, h, z) => [u * ct - h * st, u * st + h * ct, z];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zMax = 0;
  for (const [poly, h] of layers) for (const q of poly) {
    const r = rot(q[0], h, q[1]);
    x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0]); y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[1]); zMax = Math.max(zMax, Math.abs(r[2]));
  }
  // centred: its depth range on y = 0 (the anchor's depth, where one unit is exactly sizePx), and its silhouette AS SEEN
  // (x, z) / (1 + y / eyeUnits) on x = 0 (a few rounds: the outermost corners stay the same ones)
  const yc = (y0 + y1) / 2, R = [];
  for (const [poly, h] of layers) for (const q of poly) { const r = rot(q[0], h, q[1]); R.push([r[0], r[1] - yc]); }
  let xc = (x0 + x1) / 2;
  for (let it = 0; it < 4; it++) {
    let lo = null, hi = null;
    for (const r of R) { const v = (r[0] - xc) / (1 + r[1] / E); if (!lo || v < lo.v) lo = { v, r }; if (!hi || v > hi.v) hi = { v, r }; }
    const a = 1 + hi.r[1] / E, b = 1 + lo.r[1] / E;
    xc = (hi.r[0] / a + lo.r[0] / b) / (1 / a + 1 / b);
  }
  const at = (u, h, z) => { const r = rot(u, h, z); return [r[0] - xc, r[1] - yc, r[2]]; };
  const seen = p => [p[0] / (1 + p[1] / E), p[2] / (1 + p[1] / E)]; // local [x, y, z] -> as seen [u, z]
  const pos = [], nor = [], idx = [];
  // n = [n_u, n_h, n_z] before the tilt
  const vert = (q, h, n) => { const p = at(q[0], h, q[1]); pos.push(p[0], p[1], p[2]); nor.push(n[0] * ct - n[1] * st, n[0] * st + n[1] * ct, n[2]); return pos.length / 3 - 1; };
  const P3 = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], N3 = i => [nor[3 * i], nor[3 * i + 1], nor[3 * i + 2]];
  const tri = (a, b, c) => { const n = cross3(sub3(P3(b), P3(a)), sub3(P3(c), P3(a))); if (dot3(n, add3(add3(N3(a), N3(b)), N3(c))) >= 0) idx.push(a, b, c); else idx.push(a, c, b); };
  const FAN = [[0, 1, 2], [0, 2, 5], [5, 2, 3], [5, 3, 4]]; // the hexagon as its two strokes
  const face = (poly, h, nh) => { const v = poly.map(q => vert(q, h, [0, nh, 0])); for (const [a, b, c] of FAN) tri(v[a], v[b], v[c]); };
  const wallN = inward.map(n => [-n[0], 0, -n[1]]);
  const strip = (pa, ha, na, pb, hb, nb) => {
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6, A = na(i), B = nb(i);
      const a = vert(pa[i], ha, A), b = vert(pa[j], ha, A), c = vert(pb[j], hb, B), e = vert(pb[i], hb, B);
      tri(a, b, c); tri(a, c, e);
    }
  };
  face(Q, h0, -1);
  if (bev > 0) strip(Q, h0, () => [0, -1, 0], P, h1, i => wallN[i]);
  strip(P, h1, i => wallN[i], P, h2, i => wallN[i]);
  if (bev > 0) strip(P, h2, i => wallN[i], Q, h3, () => [0, 1, 0]);
  face(Q, h3, 1);
  // far to near (largest depth first): every tip is seen along its own depth axis (facingArrowFrames)
  const tris = [];
  for (let k = 0; k < idx.length; k += 3) tris.push([idx[k], idx[k + 1], idx[k + 2]]);
  const depthOf = tr => pos[3 * tr[0] + 1] + pos[3 * tr[1] + 1] + pos[3 * tr[2] + 1];
  tris.sort((a, b) => depthOf(b) - depthOf(a));
  const corners3 = [], hulls = [[0, 1, 2, 5], [5, 2, 3, 4]].map(ids => {
    const xz = [];
    for (const [poly, h] of layers) for (const i of ids) { const p = seen(at(poly[i][0], h, poly[i][1])); xz.push(p[0], p[1]); }
    return convexHullPx(xz);
  });
  for (const [poly, h] of layers) for (const q of poly) corners3.push(at(q[0], h, q[1]));
  const point3 = at(L, 0, 0), mouth3 = at(0, 0, 0), ends3 = [at(0, 0, H), at(0, 0, -H)];
  let bu0 = Infinity, bu1 = -Infinity, bz = 0;
  for (const c of corners3) { const q = seen(c); bu0 = Math.min(bu0, q[0]); bu1 = Math.max(bu1, q[0]); bz = Math.max(bz, Math.abs(q[1])); }
  const box = { uMin: bu0, uMax: bu1, zMin: -bz, zMax: bz };
  const im = seen, point = im(point3), mouth = im(mouth3);
  const outline = freeze({
    design: d, tiltDeg: tilt / DEG, outline: hulls[0].concat(hulls[1]), hulls, outline3: corners3, point, mouth, point3, mouth3,
    strokes: [{ a: im(ends3[0]), b: point }, { a: im(ends3[1]), b: point }], box, halfAlong: Math.max(box.uMax, -box.uMin), halfAcross: bz, shift: xc, eyeUnits: E
  });
  const rs = isNum(d.hitStrokePad) ? d.hitStrokePad : 0, rf = (isNum(d.hitFillShare) ? d.hitFillShare : 0.5) * H;
  const hit = freeze(hulls.map(poly => ({ poly, r: rs })).concat([{ a: [Math.min(mouth[0] + rf, point[0]), 0], b: point, r: rf }]));
  const res = freeze({
    design: d, tiltDeg: tilt / DEG, positions: Float32Array.from(pos), normals: Float32Array.from(nor), indices: Uint16Array.from(tris.flat()),
    vertexCount: pos.length / 3, triangleCount: tris.length, corners3, point3, mouth3, ends3, box, depthRange: [y0 - yc, y1 - yc], shift: [xc, yc], eyeUnits: E, outline, hit
  });
  if (cacheable) solidCache.set(design, res);
  return res;
}

/**
 * What the viewer sees of the solid V tip, in design units (pure; seen along its depth axis from eyeUnits away, exactly
 * as facingArrowFrames shows it): { design, tiltDeg, outline: [[u, z]] (the corners of both strokes'
 * silhouettes), hulls: [[[u, z]] x 2] (each stroke's convex silhouette), outline3 (every corner, local [x, y, z]),
 * point / point3 (the stroke centre lines' point at mid thickness: the click point), mouth / mouth3 (the middle between
 * the open ends), strokes: [{ a, b }] (the centre lines as seen, end to point), box: { uMin, uMax, zMin, zMax },
 * halfAlong, halfAcross, shift }. Centred on its own box.
 */
export function arrowTipOutline(design = ARROW_DESIGN) {
  return chevronSolid(design).outline;
}

/** The solid V tip's mesh in design units (pure typed arrays, chevronSolid): { positions, normals, indices (far to
 * near), vertexCount, triangleCount, depthRange, outline }. Local x outward, y away from the viewer, z across. */
export function buildArrowGeometry(design = ARROW_DESIGN) {
  const s = chevronSolid(design);
  return { positions: s.positions, normals: s.normals, indices: s.indices, vertexCount: s.vertexCount, triangleCount: s.triangleCount, depthRange: s.depthRange, outline: s.outline };
}

/* ------------------------------------------------------------------------------------------------ 2D helpers */

/** Convex hull (Andrew's monotone chain) of flat [x0, y0, x1, y1, ...] (any orientation): Array of [x, y] in hull
 * order. Pure. */
export function convexHullPx(xy) {
  const n = (xy && xy.length) >> 1;
  const pts = [];
  for (let i = 0; i < n; i++) { const x = xy[2 * i], y = xy[2 * i + 1]; if (isNum(x) && isNum(y)) pts.push([x, y]); }
  if (pts.length < 3) return pts;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/**
 * An occupancy grid of screen points (pure), for "is anything of X under this box" in O(1) (the motor areas'
 * projected sample points). xy: flat [x, y, ...] CSS px (NaN skipped); cellPx: grid cell; dilate: cells marked round
 * each point; indices: optional triangle indices into the points (every covered cell is marked). Returns { cellPx, gw,
 * gh, count (occupied cells), hits(box) (occupied cells under { x0, y0, x1, y1 }, CSS px; parts off the grid count 0) }.
 */
export function occupancyGrid(xy, { width, height, cellPx = 4, dilate = 1, indices = null } = {}) {
  if (!(width > 0 && height > 0) || !(cellPx > 0)) fail('occupancyGrid needs width, height and cellPx > 0');
  const gw = Math.ceil(width / cellPx), gh = Math.ceil(height / cellPx), occ = new Uint8Array(gw * gh);
  const n = (xy && xy.length) >> 1, d = Math.max(0, Math.round(dilate));
  let count = 0;
  const mark = (cx, cy) => {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const X = cx + dx, Y = cy + dy;
      if (X < 0 || Y < 0 || X >= gw || Y >= gh || occ[Y * gw + X]) continue;
      occ[Y * gw + X] = 1; count++;
    }
  };
  for (let i = 0; i < n; i++) {
    const x = xy[2 * i], y = xy[2 * i + 1];
    if (!isNum(x) || !isNum(y)) continue;
    mark(Math.floor(x / cellPx), Math.floor(y / cellPx));
  }
  if (indices && indices.length >= 3) for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ax = xy[2 * a] / cellPx, ay = xy[2 * a + 1] / cellPx, bx = xy[2 * b] / cellPx, by = xy[2 * b + 1] / cellPx, cx = xy[2 * c] / cellPx, cy = xy[2 * c + 1] / cellPx;
    if (![ax, ay, bx, by, cx, cy].every(isNum)) continue;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(gw - 1, Math.floor(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), j1 = Math.min(gh - 1, Math.floor(Math.max(ay, by, cy)));
    if (i0 > i1 || j0 > j1 || (i1 - i0) * (j1 - j0) > 40000) continue;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (Math.abs(den) < 1e-12) { mark(i, j); continue; }
      let hit = false;
      for (const [px, py] of [[i + 0.5, j + 0.5], [i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) {
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
        if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) { hit = true; break; }
      }
      if (hit) mark(i, j);
    }
  }
  const W1 = gw + 1, S = new Uint32Array(W1 * (gh + 1));
  for (let y = 0; y < gh; y++) { let row = 0; for (let x = 0; x < gw; x++) { row += occ[y * gw + x]; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + row; } }
  const hits = b => {
    if (!b) return 0;
    const x0 = clamp(Math.floor(b.x0 / cellPx), 0, gw), x1 = clamp(Math.ceil(b.x1 / cellPx), 0, gw);
    const y0 = clamp(Math.floor(b.y0 / cellPx), 0, gh), y1 = clamp(Math.ceil(b.y1 / cellPx), 0, gh);
    if (x1 <= x0 || y1 <= y0) return 0;
    return S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0];
  };
  return { cellPx, gw, gh, count, hits };
}

/** Screen box { x0, y0, x1, y1 } of flat [x, y, ...] CSS px (NaN skipped), or null with fewer than two finite points
 * or no area. Pure. */
export function screenBoxOf(xy) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (let i = 0; i + 1 < xy.length; i += 2) {
    const x = xy[i], y = xy[i + 1];
    if (!isNum(x) || !isNum(y)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; n++;
  }
  return n >= 2 && x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/* ------------------------------------------------------------------------------------------------ the two frames */

/** Aspect (width / height) of the motor strip's frame (16:9, horizontal) and of the mirror body's (9:16, vertical). */
export const FRAME_ASPECT = freeze({ brain: 16 / 9, mirror: 9 / 16 });

/**
 * The frame round an on-screen box (pure, CSS px): the smallest rectangle of `aspect` (width / height) that contains
 * `box`, centred on the box's middle, then clamped to `bounds` (each side that lies outside is brought to the bounds:
 * the frame is cut, never moved). Returns { x0, y0, x1, y1, aspect, fitted: the unclamped rectangle, clamped: { left,
 * right, top, bottom } (which sides were cut) } or null for an empty box.
 * keep (R558, issue hunt 2): { x, y } booleans: an axis marked true is never grown for the aspect (the box was already
 * cut to the free view on that axis, e.g. the mirror body's lower half under the portrait panels; growing it would
 * put a tip far from the part that shows). The other axis grows as usual.
 */
export function frameRect(box, aspect, bounds = null, keep = null) {
  if (!box || ![box.x0, box.y0, box.x1, box.y1].every(isNum) || !(box.x1 > box.x0 && box.y1 > box.y0)) return null;
  if (!(isNum(aspect) && aspect > 0)) fail('frameRect needs an aspect > 0');
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0, kx = Boolean(keep && keep.x), ky = Boolean(keep && keep.y);
  const w = kx ? bw : Math.max(bw, bh * aspect), h = ky ? bh : kx ? Math.max(bh, bw / aspect) : w / aspect;
  const fitted = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
  const b = bounds && [bounds.x0, bounds.y0, bounds.x1, bounds.y1].every(isNum) ? bounds : null;
  const r = b ? { x0: Math.max(fitted.x0, b.x0), y0: Math.max(fitted.y0, b.y0), x1: Math.min(fitted.x1, b.x1), y1: Math.min(fitted.y1, b.y1) } : { ...fitted };
  if (!(r.x1 > r.x0 && r.y1 > r.y0)) return null;
  return { ...r, aspect, fitted, clamped: { left: r.x0 !== fitted.x0, right: r.x1 !== fitted.x1, top: r.y0 !== fitted.y0, bottom: r.y1 !== fitted.y1 } };
}

/**
 * R558 (user Message 31, "left/right arrows of mirror body do not match in height level. Fix this across the board"):
 * how a frame's tips move off obstacles. The four tips are two PAIRS (left + right, forward + back), each placed as one
 * unit. Costs, in CSS px of movement (display choices):
 *  - moveCost per px a tip moves along its own pointing axis (in or out: the pair stays on the frame's centre line);
 *  - inwardCost per px a tip moves inward past its base place (over the brain's motor areas or the mirror body itself,
 *    the "key areas" the tips must not cover); and a tip never moves inward more than inwardMaxFrac of the way from its
 *    side to the frame's middle (further in it would read as belonging to something else, e.g. the brain's bottom tip
 *    pointing at the mirror body's top tip in a portrait window);
 *  - asymCost per px the two tips of a pair end up at DIFFERENT insets (still on their centre line, so still level);
 *  - perpCost per px of the COMMON shift of both tips across their pointing axis (the side pair up or down together,
 *    the top / bottom pair sideways together): they stay level and mirror images of each other, off the centre line.
 * The pairs are weighted differently because a viewer compares left with right far more than top with bottom:
 *  - the side pair is ALWAYS a mirror image about the frame's vertical centre line (asymCost is a last resort: it is
 *    paid only when no equal inset and no common shift is clear); it moves in or out together, or up or down together
 *    (measured at 1600x900, start: your left hand covers the mirror body's left tip, so both side tips go down 116 px);
 *  - the top / bottom pair always stays on ONE vertical line and pays a lot for leaving the frame's vertical centre
 *    line (a sideways shift moves the set off the body's axis); unequal distances from the top and bottom edges are
 *    cheap, since the bodies and the brain are not symmetric top to bottom anyway (measured: the mirror body's top tip
 *    goes 30 px up to clear the crosshair box, where its bottom tip cannot follow because the brain's bottom tip is
 *    there: one tip 30 px out costs 60, a common sideways shift of 74 px would cost 444).
 * stepPx / perpStepPx: candidate spacing.
 * tieShift: which way a common shift goes when both ways cost the same (-1: up for the side pair, left for the top /
 * bottom pair; +1: down / right). R558 check: the side pair goes UP on a tie (was down by loop order). Your left hand
 * covers the mirror body's left side middle about equally far above and below it (measured: blocked from -112 to +112 px
 * at 1600x900 and from -136 to +136 px at 1920x1080, so up and down cost exactly the same), and down put both side tips
 * among the leg labels (1920x1080: the "Belly and back" and "Right leg" labels drawn over the left tip, the labels win
 * there); up puts them beside the mirror body's chest, nearer the eye line, clear of the leg labels and the bottom HUD.
 */
export const FRAME_PAIR = freeze({ stepPx: 2, perpStepPx: 4, moveCost: 1, inwardCost: 3, inwardMaxFrac: 0.5,
  side: freeze({ asymCost: 1e4, perpCost: 1, equalBase: true, tieShift: -1 }), ends: freeze({ asymCost: 1, perpCost: 3, equalBase: false, tieShift: 1 }) });

/**
 * The four arrow places on a frame (pure, CSS px): the midpoints of its sides (forward = top centre, back = bottom
 * centre, left = left middle, right = right middle), each arrow pointing outward. halfAlongPx / halfAcrossPx: the
 * arrow's drawn half extent along / across its pointing direction. R558 (Message 31): the tips are placed in PAIRS
 * (FRAME_PAIR), so the left and right tips are always at exactly the same height and the top and bottom tips always on
 * one vertical line:
 *  - base: each tip is moved inward only as far as needed for its drawn box to lie inside `bounds`; the side tips both
 *    by the larger of their two amounts (the frame pulled in symmetrically at a screen edge), the top and bottom tips
 *    each by its own (FRAME_PAIR equalBase); across their pointing axis both tips of a pair share the frame's centre
 *    line, clamped into `bounds` once for both;
 *  - a pair whose base place is not clear moves to the cheapest clear place (FRAME_PAIR costs): both along their
 *    centre line by the same amount, or both shifted across their pointing axis by the same amount; only the top and
 *    bottom tips may also move along their vertical line by different amounts (the side tips only as a last resort);
 *    inward never more than inwardMaxFrac of the way to the frame's middle.
 * Clear means: the drawn box inside `bounds`; the HIT box (hitHalfAlongPx / hitHalfAcrossPx, default the drawn halves)
 * clear of every `avoid` box by gapPx (other arrows' hit boxes, the box kept free round the crosshair); for a moved tip
 * the drawn box clear of `keepOut` (HUD boxes: cards, the hint line); and `blocked(dir, x, y)` false when given (e.g.
 * covered by your own body in the reference view, or on the mirror body's box). With no clear place the pair is placed
 * again ignoring `blocked`; with none still it keeps its base place and an overlapping tip is flagged `overlap`.
 * Returns { forward | back | left | right: { dir, screen, x, y (the arrow's middle), mid: [x, y] (the side's midpoint),
 * insetPx (how far it was moved from the midpoint), box: { x0, y0, x1, y1 }, overlap, pair: { family: 'base' |
 * 'centre-line' (both by the same inset) | 'centre-line-each' (different insets) | 'common-shift', insetPx (this tip's
 * inset along its axis), shiftPx (the common shift across it), blockedIgnored } } }.
 */
export function frameArrowSpots(rect, { halfAlongPx, halfAcrossPx, bounds = null, avoid = null, keepOut = null, gapPx = 4, hitHalfAlongPx = null, hitHalfAcrossPx = null, blocked = null, rules = FRAME_PAIR } = {}) {
  if (!rect || ![rect.x0, rect.y0, rect.x1, rect.y1].every(isNum)) fail('frameArrowSpots needs a frame rectangle');
  if (!(halfAlongPx > 0 && halfAcrossPx > 0)) fail('frameArrowSpots needs the arrow half extents > 0');
  const R0 = { ...FRAME_PAIR, ...(rules || {}) };
  const mx = (rect.x0 + rect.x1) / 2, my = (rect.y0 + rect.y1) / 2, out = {};
  const b = bounds && [bounds.x0, bounds.y0, bounds.x1, bounds.y1].every(isNum) ? bounds : null;
  const ha = isNum(hitHalfAlongPx) ? hitHalfAlongPx : halfAlongPx, hc = isNum(hitHalfAcrossPx) ? hitHalfAcrossPx : halfAcrossPx;
  const av = Array.isArray(avoid) ? avoid.filter(Boolean) : [], ko = Array.isArray(keepOut) ? keepOut.filter(Boolean) : [];
  const hitsList = (x0, y0, x1, y1, list) => list.find(a => x0 < a.x1 + gapPx && x1 > a.x0 - gapPx && y0 < a.y1 + gapPx && y1 > a.y0 - gapPx) || null;
  for (const [dA, dB] of [['left', 'right'], ['forward', 'back']]) {
    const sideP = dA === 'left'; // the side pair points along x; the top / bottom pair along y
    const R = { ...R0, ...((sideP ? R0.side : R0.ends) || {}) };
    const hx = sideP ? halfAlongPx : halfAcrossPx, hy = sideP ? halfAcrossPx : halfAlongPx; // drawn half extents (screen x / y)
    const kx = sideP ? ha : hc, ky = sideP ? hc : ha; // hit half extents (screen x / y)
    const lo = sideP ? rect.x0 : rect.y0, hi = sideP ? rect.x1 : rect.y1, half = (hi - lo) / 2;
    const hA = sideP ? hx : hy, hP = sideP ? hy : hx; // drawn half extent along / across the pointing axis
    const bLo = b ? (sideP ? b.x0 : b.y0) : -Infinity, bHi = b ? (sideP ? b.x1 : b.y1) : Infinity;
    const pLo = b ? (sideP ? b.y0 : b.x0) : -Infinity, pHi = b ? (sideP ? b.y1 : b.x1) : Infinity;
    // each tip's base inset (positive = inward): the smallest that keeps its drawn box inside the bounds; the side pair
    // takes the larger of its two for both (the frame pulled in symmetrically at a screen edge), the top / bottom pair
    // keeps each its own (equalBase false: e.g. the brain's top tip moved below the limits line, its bottom tip not)
    const needA = bLo + hA - lo, needB = hi + hA - bHi;
    const own = n => clamp(Math.max(0, isNum(n) ? n : 0), 0, Math.max(0, half));
    const eqB = R.equalBase !== false, bothB = own(Math.max(needA, needB));
    const base = { [dA]: eqB ? bothB : own(needA), [dB]: eqB ? bothB : own(needB) };
    // moves m from the base (positive = inward): outward as far as the tip's side of the bounds allows, inward at most
    // inwardMaxFrac of the way from its base to the frame's middle
    const fr = isNum(R.inwardMaxFrac) ? clamp(R.inwardMaxFrac, 0, 1) : 1;
    const mMin = { [dA]: Math.min(0, Math.max(isNum(needA) ? needA : -half, -half) - base[dA]), [dB]: Math.min(0, Math.max(isNum(needB) ? needB : -half, -half) - base[dB]) };
    const mMax = { [dA]: fr * Math.max(0, half - base[dA]), [dB]: fr * Math.max(0, half - base[dB]) };
    // the shared place across the pointing axis: the frame's centre line, clamped into the bounds once for both
    const pMid = sideP ? my : mx;
    const p0 = b ? (pHi - pLo >= 2 * hP ? clamp(pMid, pLo + hP, pHi - hP) : (pLo + pHi) / 2) : pMid;
    const tLo = (b ? pLo + hP : -Infinity) - p0, tHi = (b ? pHi - hP : Infinity) - p0, perpHalf = (sideP ? rect.y1 - rect.y0 : rect.x1 - rect.x0) / 2;
    const at = (dir, m, t) => {
      const s = base[dir] + m, a = dir === dA ? lo + s : hi - s, p = p0 + t;
      return sideP ? [a, p] : [p, a];
    };
    // is one tip clear after move m and common shift t? (useBlocked: also ask `blocked`)
    const ok = (dir, m, t, useBlocked) => {
      if (m < mMin[dir] - 1e-9 || m > mMax[dir] + 1e-9) return false;
      const [x, y] = at(dir, m, t);
      if (b && (x - hx < b.x0 - 1e-6 || x + hx > b.x1 + 1e-6 || y - hy < b.y0 - 1e-6 || y + hy > b.y1 + 1e-6)) return false;
      if (hitsList(x - kx, y - ky, x + kx, y + ky, av)) return false;
      const moved = Math.abs(m) > 1e-9 || Math.abs(t) > 1e-9;
      if (moved && hitsList(x - hx, y - hy, x + hx, y + hy, ko)) return false;
      return !(useBlocked && typeof blocked === 'function' && blocked(dir, x, y));
    };
    const cost = (ma, mb, t) => R.moveCost * (Math.abs(ma) + Math.abs(mb)) + R.asymCost * Math.abs(ma - mb) + R.inwardCost * (Math.max(0, ma) + Math.max(0, mb)) + R.perpCost * 2 * Math.abs(t);
    // the moves along the axis, nearest first (a tie goes outward)
    const lowM = Math.min(mMin[dA], mMin[dB]), highM = Math.max(mMax[dA], mMax[dB]);
    const mSteps = [0];
    for (let k = 1; ; k++) {
      const mo = -k * R.stepPx, mi = k * R.stepPx, o = mo >= lowM - 1e-9, i = mi <= highM + 1e-9;
      if (!o && !i) break;
      if (o) mSteps.push(mo);
      if (i) mSteps.push(mi);
    }
    const tSteps = [];
    const sgs = R.tieShift === -1 ? [-1, 1] : [1, -1]; // the first clear shift each way, tieShift's way first (a tie keeps the first)
    for (let k = 1; k * R.perpStepPx <= perpHalf + 1e-9; k++) for (const sg of sgs) { const t = sg * k * R.perpStepPx; if (t >= tLo - 1e-9 && t <= tHi + 1e-9) tSteps.push(t); }
    let pick = null;
    for (const useBlocked of typeof blocked === 'function' ? [true, false] : [false]) {
      // the base place, when clear for both, costs nothing: nothing else is tried
      if (ok(dA, 0, 0, useBlocked) && ok(dB, 0, 0, useBlocked)) { pick = { ma: 0, mb: 0, t: 0, cost: 0, outward: false, useBlocked }; break; }
      const cands = [];
      // the nearest clear move outward and inward (or none) of one tip, or of both by the same amount
      const nearest = test => {
        const r = []; let o = false, i = false;
        for (const m of mSteps) {
          const side = m < -1e-9 ? 'o' : m > 1e-9 ? 'i' : 'b';
          if ((side === 'o' && o) || (side === 'i' && i)) continue;
          if (test(m)) { r.push(m); if (side === 'b') break; if (side === 'o') o = true; else i = true; if (o && i) break; }
        }
        return r;
      };
      const nA = nearest(m => ok(dA, m, 0, useBlocked)), nB = nearest(m => ok(dB, m, 0, useBlocked));
      for (const ma of nA) for (const mb of nB) cands.push({ ma, mb, t: 0 });
      for (const m of nearest(q => ok(dA, q, 0, useBlocked) && ok(dB, q, 0, useBlocked))) cands.push({ ma: m, mb: m, t: 0 });
      // both shifted across their axis by the same amount (at their base insets): the nearest clear shift each way
      let tp = false, tn = false;
      for (const t of tSteps) {
        if ((t > 0 && tp) || (t < 0 && tn)) continue;
        if (ok(dA, 0, t, useBlocked) && ok(dB, 0, t, useBlocked)) { cands.push({ ma: 0, mb: 0, t }); if (t > 0) tp = true; else tn = true; if (tp && tn) break; }
      }
      for (const c of cands) {
        c.cost = cost(c.ma, c.mb, c.t);
        const outward = Math.min(c.ma, c.mb) < -1e-9;
        if (!pick || c.cost < pick.cost - 1e-9 || (Math.abs(c.cost - pick.cost) <= 1e-9 && outward && !pick.outward)) pick = { ...c, outward, useBlocked };
      }
      if (pick) break;
    }
    const family = !pick ? 'base' : Math.abs(pick.t) > 1e-9 ? 'common-shift' : Math.abs(pick.ma - pick.mb) > 1e-9 ? 'centre-line-each'
      : Math.abs(pick.ma) > 1e-9 ? 'centre-line' : 'base';
    const P = pick || { ma: 0, mb: 0, t: 0, useBlocked: typeof blocked === 'function' };
    for (const dir of [dA, dB]) {
      const e = COMPASS_SCREEN[dir], m = dir === dA ? P.ma : P.mb;
      const [x, y] = at(dir, m, P.t);
      const mid = sideP ? [dir === dA ? rect.x0 : rect.x1, my] : [mx, dir === dA ? rect.y0 : rect.y1];
      const overlap = Boolean(hitsList(x - kx, y - ky, x + kx, y + ky, av));
      out[dir] = { dir, screen: e, x, y, mid, insetPx: Math.hypot(x - mid[0], y - mid[1]), box: { x0: x - hx, y0: y - hy, x1: x + hx, y1: y + hy }, overlap,
        pair: { family, insetPx: base[dir] + m, movePx: m, shiftPx: P.t, blockedIgnored: typeof blocked === 'function' && !P.useBlocked } };
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------ cameras */

/** Camera rotation (3x3 rows) for Three 'YXZ' yaw / pitch: R = Ry(yaw) Rx(pitch). */
function cameraRotation(yaw = 0, pitch = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [[cy, sy * sp, sy * cp], [0, cp, -sp], [-sy, cy * sp, cy * cp]];
}
const apply = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
const applyT = (R, v) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];

/** A camera for the pure helpers: { width, height (CSS px), fovYDeg } plus EITHER yaw / pitch (Three 'YXZ', camera at
 * `position`, default the origin) OR matrixWorld (column-major; any position and rotation; no scale). */
function camOf(cam) {
  if (!cam || !(cam.width > 0 && cam.height > 0) || !(cam.fovYDeg > 0 && cam.fovYDeg < 180)) fail('cam needs width, height and fovYDeg');
  const tanH = Math.tan((cam.fovYDeg * DEG) / 2);
  const m = cam.matrixWorld;
  if (m && m.length === 16) {
    const R = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
    return { R, tanH, aspect: cam.width / cam.height, W: cam.width, H: cam.height, pos: [m[12], m[13], m[14]] };
  }
  return { R: cameraRotation(cam.yaw || 0, cam.pitch || 0), tanH, aspect: cam.width / cam.height, W: cam.width, H: cam.height, pos: cam.position || [0, 0, 0] };
}

/** World point -> { x, y (CSS px, y down), depth (m along the view axis) } for a camera (pure). depth <= 0: behind. */
export function projectWorldPx(p, cam) {
  const c = camOf(cam);
  const q = applyT(c.R, sub3(p, c.pos)), depth = -q[2];
  return { x: (q[0] / (depth * c.tanH * c.aspect) + 1) * 0.5 * c.W, y: (1 - q[1] / (depth * c.tanH)) * 0.5 * c.H, depth };
}

/** World ray through CSS px (x, y): { origin, dir (unit) } (pure). The crosshair is (width / 2, height / 2). */
export function pixelRay(x, y, cam) {
  const c = camOf(cam);
  const v = norm3([((2 * x) / c.W - 1) * c.tanH * c.aspect, (1 - (2 * y) / c.H) * c.tanH, -1]);
  return { origin: [...c.pos], dir: apply(c.R, v) };
}

/** R558 (performance, P3): pixelRay(x, y, cam).dir for many rays from one camera, with the camera worked out once
 * (camOf): the same arithmetic in the same order, so the same numbers (pure). Returns (x, y) -> [dx, dy, dz]. */
export function pixelRayDirFn(cam) {
  const c = camOf(cam);
  return (x, y) => apply(c.R, norm3([((2 * x) / c.W - 1) * c.tanH * c.aspect, (1 - (2 * y) / c.H) * c.tanH, -1]));
}

/** R558 (performance, P3): the camera as the pure helpers use it (camOf): { R (rows), tanH, aspect, W, H, pos } (pure;
 * a copy). */
export function cameraFrame(cam) {
  const c = camOf(cam);
  return { R: c.R.map(r => r.slice()), tanH: c.tanH, aspect: c.aspect, W: c.W, H: c.H, pos: [c.pos[0], c.pos[1], c.pos[2]] };
}

/** Project flat source points through a column-major world matrix (or none) to CSS px: { xy: Float64Array (NaN for
 * points behind the near distance), behind } (pure). */
export function projectPointsPx(points, matrix, cam, near = 0.02) {
  const c = camOf(cam), n = (points.length / 3) | 0, xy = new Float64Array(2 * n), m = matrix;
  let behind = 0;
  for (let i = 0; i < n; i++) {
    let x = points[3 * i], y = points[3 * i + 1], z = points[3 * i + 2];
    if (m) { const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Z = m[2] * x + m[6] * y + m[10] * z + m[14]; x = X; y = Y; z = Z; }
    const q = applyT(c.R, [x - c.pos[0], y - c.pos[1], z - c.pos[2]]), depth = -q[2];
    if (!(depth > near)) { xy[2 * i] = NaN; xy[2 * i + 1] = NaN; behind++; continue; }
    xy[2 * i] = (q[0] / (depth * c.tanH * c.aspect) + 1) * 0.5 * c.W;
    xy[2 * i + 1] = (1 - q[1] / (depth * c.tanH)) * 0.5 * c.H;
  }
  return { xy, behind };
}

/* ------------------------------------------------------------------------------------------------ world frames */

/**
 * World ANCHORS of V tips placed at screen spots (pure): spots: frameArrowSpots() (or any { dir: { x, y } }); cam: the
 * REFERENCE camera (a fixed eye and look, not the moving render camera); centre: the target's centre (world m). Each
 * anchor is where the sight line through its spot meets the plane through `centre` square to the camera's view axis.
 * Returns { forward | back | left | right: [x, y, z] | null } or null when the centre is not in front of the camera.
 */
export function frameArrowAnchors(spots, { cam, centre } = {}) {
  if (!spots) fail('frameArrowAnchors needs spots');
  if (!centre || centre.length !== 3 || !Array.from(centre).every(isNum)) fail('frameArrowAnchors needs a finite target centre');
  const c = camOf(cam), fwd = apply(c.R, [0, 0, -1]);
  const D = dot3(sub3([centre[0], centre[1], centre[2]], c.pos), fwd);
  if (!(D > 1e-6)) return null;
  const out = {};
  for (const dir of COMPASS_DIRS) {
    const p = spots[dir];
    if (!p || !isNum(p.x) || !isNum(p.y)) { out[dir] = null; continue; }
    const xc = ((2 * p.x) / c.W - 1) * c.tanH * c.aspect * D, yc = (1 - (2 * p.y) / c.H) * c.tanH * D;
    out[dir] = add3(c.pos, apply(c.R, [xc, yc, -D]));
  }
  return out;
}

/** R558 (performance, P3): frameArrowAnchors for one spot at a time from one camera and centre, worked out once: the
 * same checks (a bad centre or camera throws as frameArrowAnchors does) and the same arithmetic in the same order (pure).
 * Returns (x, y) -> [x, y, z] | null (a spot that is not finite), or null when the centre is not in front of the camera. */
export function frameAnchorFn(cam, centre) {
  if (!centre || centre.length !== 3 || !Array.from(centre).every(isNum)) fail('frameArrowAnchors needs a finite target centre');
  const c = camOf(cam), fwd = apply(c.R, [0, 0, -1]);
  const D = dot3(sub3([centre[0], centre[1], centre[2]], c.pos), fwd);
  if (!(D > 1e-6)) return null;
  return (x, y) => {
    if (!isNum(x) || !isNum(y)) return null;
    const xc = ((2 * x) / c.W - 1) * c.tanH * c.aspect * D, yc = (1 - (2 * y) / c.H) * c.tanH * D;
    return add3(c.pos, apply(c.R, [xc, yc, -D]));
  };
}

/**
 * World frames of V tips that FACE a camera (pure): each tip's middle stays at its world anchor; its outward and across
 * axes lie in the plane through the anchor square to that camera's view axis, scaled so that one design unit is exactly
 * sizePx on screen there, and its depth axis (local y) runs along the sight line through the anchor, one design unit
 * of it adding D / eyeUnits of depth (D the anchor's depth). A point at local (x, y, z) is then seen at the anchor's
 * screen place plus sizePx x (x, z) / (1 + y / eyeUnits): the solid tip looks exactly as it does seen straight on from
 * eyeUnits away (arrowTipOutline), wherever it is in the wide view and from any camera (third person too): symmetric
 * about its own pointing direction, its planned size, its far point a little smaller; it never turns into a thin sliver. d = its outward
 * screen direction, w = the view axis (away from the viewer; the picture plane's normal, used for picks), b = d x w
 * (right-handed), k = the sight line per metre of depth. A tip whose anchor is not at least `nearM` in front of the
 * camera is null (not drawn, not pickable).
 * Returns { forward | back | left | right: { dir, origin, d, w, b, k, scale, mpp, matrix (Float64Array(16), local design
 * units -> world; columns d x scale, k x D / eyeUnits, b x scale), depthMode: 'facing-sight-line', distance } | null }.
 */
export function facingArrowFrames(anchors, { cam, sizePx, nearM = 1e-3, design = ARROW_DESIGN } = {}) {
  if (!anchors) fail('facingArrowFrames needs anchors');
  if (!(isNum(sizePx) && sizePx > 0)) fail('facingArrowFrames needs sizePx > 0');
  const c = camOf(cam), fwd = apply(c.R, [0, 0, -1]), out = {}, eye = chevronSolid(design).eyeUnits;
  for (const dir of COMPASS_DIRS) {
    const A = anchors[dir];
    if (!A || A.length !== 3 || !Array.from(A).every(isNum)) { out[dir] = null; continue; }
    const origin = [A[0], A[1], A[2]], D = dot3(sub3(origin, c.pos), fwd);
    if (!(D > nearM)) { out[dir] = null; continue; }
    const mpp = (2 * c.tanH * D) / c.H, s = sizePx * mpp, e = COMPASS_SCREEN[dir];
    const d = apply(c.R, [e[0], -e[1], 0]), w = fwd, b = cross3(d, w), k = mul3(sub3(origin, c.pos), 1 / D), sy = D / eye;
    const matrix = new Float64Array(16);
    matrix.set([d[0] * s, d[1] * s, d[2] * s, 0, k[0] * sy, k[1] * sy, k[2] * sy, 0, b[0] * s, b[1] * s, b[2] * s, 0, origin[0], origin[1], origin[2], 1]);
    out[dir] = { dir, origin, d, w, b, k, scale: s, mpp, matrix, depthMode: 'facing-sight-line', distance: len3(sub3(origin, c.pos)) };
  }
  return out;
}

/** World frames of V tips at screen spots, facing the reference camera (pure): frameArrowAnchors + facingArrowFrames.
 * Seen from that camera each tip is an exact copy of the design at sizePx at its spot. null when the centre is not in
 * front of the camera. */
export function frameArrowFrames(spots, { cam, centre, sizePx } = {}) {
  const anchors = frameArrowAnchors(spots, { cam, centre });
  return anchors ? facingArrowFrames(anchors, { cam, sizePx }) : null;
}

/**
 * One call for a target's four tips (pure): box: the target's on-screen box in the reference view (CSS px); aspect:
 * FRAME_ASPECT.brain | .mirror; bounds: the usable view (CSS px); cam: the reference camera; centre: the target's
 * centre (world m); sizePx: arrowTipSizePx(); hoverScale: the drawn growth under the pointer (the hovered tip stays on
 * screen too); avoid: boxes the tips' hit boxes keep clear of (other arrows' hit boxes, the crosshair box) and keepOut:
 * HUD boxes a moved tip keeps clear of; blocked(dir, x, y): extra places a tip may not take (frameArrowSpots; R558
 * Message 31: the tips move in pairs). Returns { rect, spots, anchors (world m), frames (facing the reference camera),
 * sizes: { sizePx }, layout: { arrows, sizePx, frame: rect, stable: true } } or null (empty box, or the centre not in
 * front of the camera).
 */
export function planFrameArrows({ box, aspect, bounds = null, cam, centre, sizePx, design = ARROW_DESIGN, hoverScale = ARROW_LOOK.hoverScale, avoid = null, keepOut = null, keep = null, blocked = null } = {}) {
  const rect = frameRect(box, aspect, bounds, keep);
  if (!rect) return null;
  const o = arrowTipOutline(design), grow = isNum(hoverScale) && hoverScale > 1 ? hoverScale : 1;
  const hit = arrowHitHalfPx(sizePx, { design });
  const spots = frameArrowSpots(rect, { halfAlongPx: o.halfAlong * sizePx * grow, halfAcrossPx: o.halfAcross * sizePx * grow, bounds, avoid, keepOut, blocked,
    hitHalfAlongPx: Math.max(hit.halfAlongPx, o.halfAlong * sizePx * grow), hitHalfAcrossPx: Math.max(hit.halfAcrossPx, o.halfAcross * sizePx * grow) });
  const anchors = frameArrowAnchors(spots, { cam, centre });
  if (!anchors) return null;
  const frames = facingArrowFrames(anchors, { cam, sizePx, design });
  const arrows = {};
  for (const dir of COMPASS_DIRS) {
    const p = spots[dir];
    arrows[dir] = { dir, x: p.x, y: p.y, mid: p.mid, box: p.box, screen: p.screen, insetPx: p.insetPx, onScreen: true, blocked: false, overlap: p.overlap,
      overOutline: false, slidPx: p.insetPx, scale: 1, edge: p.insetPx > 0, edgeShiftPx: 0, overAvoid: 0, outsidePreferred: false, tier: 'frame-r558', clearancePx: null, pair: p.pair };
  }
  return { rect, spots, anchors, frames, sizes: { sizePx }, layout: { arrows, sizePx, frame: rect, stable: true }, frontDepthM: null, stable: true };
}

/** Screen HIT boxes (CSS px) of tips at world anchors seen from `cam` (pure): [{ x0, y0, x1, y1 }], each the larger of
 * its hit area (arrowHitHalfPx) and its hovered drawn size, skipping tips behind the camera. Used to keep one set of
 * tips clear of another, so that neither is drawn over the other nor takes its clicks. */
export function anchorBoxesPx(anchors, { cam, sizePx, design = ARROW_DESIGN, hoverScale = ARROW_LOOK.hoverScale } = {}) {
  const out = [];
  if (!anchors || !(sizePx > 0)) return out;
  const o = arrowTipOutline(design), grow = isNum(hoverScale) && hoverScale > 1 ? hoverScale : 1, hit = arrowHitHalfPx(sizePx, { design });
  const along = Math.max(hit.halfAlongPx, o.halfAlong * sizePx * grow), across = Math.max(hit.halfAcrossPx, o.halfAcross * sizePx * grow);
  for (const dir of COMPASS_DIRS) {
    const A = anchors[dir];
    if (!A) continue;
    const q = projectWorldPx(A, cam);
    if (!(q.depth > 0)) continue;
    const e = COMPASS_SCREEN[dir], hx = e[0] !== 0 ? along : across, hy = e[0] !== 0 ? across : along;
    out.push({ x0: q.x - hx, y0: q.y - hy, x1: q.x + hx, y1: q.y + hy });
  }
  return out;
}

/** A local design point (u, w, z) -> world under a frame (pure). */
export function frameToWorld(frame, p) {
  const m = frame.matrix;
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

/* ------------------------------------------------------------------------------------------------ picking and boxes */

/** The tip's invisible hit shape in design units, fitted to what the viewer sees of the solid tip (pure): [{ poly:
 * [[u, z]], r }] both strokes' convex silhouettes (arrowTipOutline hulls) grown by hitStrokePad, and { a, b, r } the
 * inside of the V (a capsule along the axis, radius hitFillShare x halfSpan, from one radius inside the mouth to the
 * point, so it ends at the mouth line rather than reaching past it). */
export function arrowHitShape(design = ARROW_DESIGN) {
  return chevronSolid(design).hit;
}

/** Half extents (CSS px) of a tip's hit area on screen at sizePx, with the pick padding, taken symmetric about the tip's
 * middle: { halfAlongPx, halfAcrossPx } (pure). Two tips whose hit areas do not overlap can never take each other's
 * clicks. */
export function arrowHitHalfPx(sizePx, { design = ARROW_DESIGN, padPx = ARROW_LAYOUT.pickPadPx } = {}) {
  let u = 0, z = 0;
  for (const c of arrowHitShape(design)) for (const q of (c.poly || [c.a, c.b])) { u = Math.max(u, Math.abs(q[0]) + c.r); z = Math.max(z, Math.abs(q[1]) + c.r); }
  return { halfAlongPx: u * sizePx + padPx, halfAcrossPx: z * sizePx + padPx };
}

/** Distance from point p to segment a-b (2D). Pure. */
function segDist2(p, a, b) {
  const ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy;
  const t = L2 > 0 ? clamp(((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L2, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - t * ux, p[1] - a[1] - t * uy);
}

/** Signed distance from point p to a convex polygon (2D, either winding): negative inside. Pure. */
function polyDist2(p, poly) {
  let sgn = 0, inside = true, best = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (c !== 0) { const s = c > 0 ? 1 : -1; if (!sgn) sgn = s; else if (s !== sgn) inside = false; }
    best = Math.min(best, segDist2(p, a, b));
  }
  return inside ? -best : best;
}
/** Distance from p to one hit-shape part (arrowHitShape), minus its radius: <= 0 on the part. Pure. */
const hitDist = (p, c) => (c.poly ? polyDist2(p, c.poly) : segDist2(p, c.a, c.b)) - c.r;

/** Where a world ray meets a tip's picture plane (through its anchor, square to the view axis w), in the tip's design
 * units as seen (pure): { u, z, t (m along the ray) } or null when the ray runs parallel to the plane or meets it
 * behind its origin. */
export function rayOnTip(ray, frame) {
  const o = ray.origin, d = norm3(ray.dir), w = norm3(frame.w), den = dot3(d, w);
  if (!(Math.abs(den) > 1e-9)) return null;
  const t = dot3(sub3(frame.origin, o), w) / den;
  if (!(t > 0)) return null;
  const q = sub3(add3(o, mul3(d, t)), frame.origin);
  return { u: dot3(q, norm3(frame.d)) / frame.scale, z: dot3(q, norm3(frame.b)) / frame.scale, t };
}

/**
 * The tip hit by a world ray (pure): { dir, t (m along the ray), dist (design units from the hit shape's centre line) }
 * of the nearest hit, or null. The ray is met with each tip's own plane and the hit shape (arrowHitShape) is tested
 * there, so the hit area on screen has the tip's own proportions everywhere in the wide view (a 3D distance to the ray
 * would stretch it toward the middle of the view near the edges). ray: { origin, dir }; frames: frameArrowFrames();
 * padPx: extra screen padding (CSS px at the frame plane); occluderT: a distance (m) beyond which hits are not
 * returned; only: optional subset of dirs.
 */
export function pickArrows(ray, frames, { design = ARROW_DESIGN, padPx = ARROW_LAYOUT.pickPadPx, occluderT = Infinity, only = null } = {}) {
  if (!ray || !frames) return null;
  const shape = arrowHitShape(design);
  let best = null;
  for (const dir of COMPASS_DIRS) {
    const f = frames[dir];
    if (!f || (only && !only.includes(dir))) continue;
    const h = rayOnTip(ray, f);
    if (!h || !(h.t < occluderT)) continue;
    const pad = (padPx * f.mpp) / f.scale, p = [h.u, h.z];
    let dist = Infinity;
    for (const c of shape) dist = Math.min(dist, hitDist(p, c));
    if (dist <= pad && (!best || h.t < best.t)) best = { dir, t: h.t, dist };
  }
  return best;
}

/** Every tip a world ray hits, nearest first (pure): [{ dir, t, dist }] (same options as pickArrows except occluderT).
 * One entry per tip. */
export function pickArrowHits(ray, frames, { design = ARROW_DESIGN, padPx = ARROW_LAYOUT.pickPadPx, only = null } = {}) {
  const out = [];
  if (!ray || !frames) return out;
  for (const dir of COMPASS_DIRS) {
    if (!frames[dir] || (only && !only.includes(dir))) continue;
    const h = pickArrows(ray, frames, { design, padPx, only: [dir] });
    if (h) out.push(h);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** On-screen box (CSS px) of a tip drawn under `cam` (pure): every corner of the solid, projected. null when any part
 * is behind the camera. */
export function arrowScreenBox(frame, cam, design = ARROW_DESIGN) {
  if (!frame) return null;
  const o = arrowTipOutline(design);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of o.outline3) {
    const p = projectWorldPx(frameToWorld(frame, q), cam);
    if (!(p.depth > 0)) return null;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** Where to aim a click at a tip (pure): the projected point of the V's stroke centre lines at mid thickness (on the
 * drawn stroke), { x, y } CSS px, or null when it is behind the camera. */
export function arrowClickPx(frame, cam, design = ARROW_DESIGN) {
  if (!frame) return null;
  const p = projectWorldPx(frameToWorld(frame, arrowTipOutline(design).point3), cam);
  return p.depth > 0 ? { x: p.x, y: p.y } : null;
}

/* ------------------------------------------------------------------------------------------------ THREE rig */

const VERT = `
uniform mat3 uViewRot;
uniform vec4 uPlane; // cos tilt, sin tilt, centring shift x, y (chevronSolid): local position -> design plane (u, z)
varying vec3 vN;
varying float vDepth;
varying vec2 vUZ;
void main() {
  vDepth = position.y;
  vUZ = vec2( ( position.x + uPlane.z ) * uPlane.x + ( position.y + uPlane.w ) * uPlane.y, position.z );
  // the tip's local axes as seen (x its outward screen direction, y away from the viewer, z across): every tip is lit as
  // the same solid seen straight on, wherever it is on screen (its frame's depth axis follows its own sight line)
  vN = uViewRot * normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
uniform vec3 uFill;
uniform vec3 uEdge;
uniform vec3 uRim;
uniform vec3 uHoverCol;
uniform float uHover;
uniform float uAttn;
uniform float uBlocked;
uniform vec4 uO;     // opacity of a face at rest, under the pointer, when blocked; least opacity of turned-away faces
uniform vec3 uKey;   // toward the key light (view: x right, y up, z toward the viewer)
uniform vec4 uLight; // ambient, diffuse, specular, shininess
uniform vec4 uEdgeL; // rim light, edge darkening, n.v range (edge-on .. face-on)
uniform vec3 uDepth; // nearest and farthest local depth, brightness at the far end
uniform vec2 uHex[ 6 ]; // the V's outline in its design plane (u, z)
uniform vec4 uCel;   // two steps of the wrapped N.L, soft half-width, crisp highlight step start
uniform vec4 uCelL;  // three tone levels, crisp highlight step end
uniform vec4 uInk;   // ink line width (CSS px), opacity, pixel ratio, wall ink
uniform vec3 uInkC;
varying vec3 vN;
varying float vDepth;
varying vec2 vUZ;
float hexDist( vec2 p ) {
  float d = 1e9;
  for ( int i = 0; i < 6; i ++ ) {
    vec2 a = uHex[ i ], b = uHex[ i == 5 ? 0 : i + 1 ];
    vec2 e = b - a, w = p - a;
    vec2 q = w - e * clamp( dot( w, e ) / dot( e, e ), 0.0, 1.0 );
    d = min( d, length( q ) );
  }
  return d;
}
float celBand( float x ) {
  float s = max( uCel.z, 0.75 * fwidth( x ) );
  return mix( mix( uCelL.x, uCelL.y, smoothstep( uCel.x - s, uCel.x + s, x ) ), uCelL.z, smoothstep( uCel.y - s, uCel.y + s, x ) );
}
void main() {
  vec3 n = normalize(vN);
  float nv = clamp(n.z, 0.0, 1.0);
  float edgeOn = 1.0 - smoothstep(uEdgeL.z, uEdgeL.w, nv);
  vec3 c = mix(uFill, uHoverCol, 0.6 * uHover);
  c = mix(c, vec3(dot(c, vec3(0.3333))) * 0.6, uBlocked); // blocked: grey and dim
  float nl = dot(n, uKey);
  float wrap = clamp((nl + 0.35) / 1.35, 0.0, 1.0);
  // depth cue: the near open ends full bright, the far point a little dimmer
  float far = clamp((vDepth - uDepth.x) / max(uDepth.y - uDepth.x, 1e-4), 0.0, 1.0);
  vec3 lit = c * (uLight.x + uLight.y * celBand(wrap)) * mix(1.0, uDepth.z, far);
  vec3 h = normalize(uKey + vec3(0.0, 0.0, 1.0));
  lit += uLight.z * smoothstep(uCel.w, uCelL.w, pow(max(dot(n, h), 0.0), uLight.w)) * mix(vec3(1.0), c, 0.3);
  lit = mix(lit, uEdge, uEdgeL.y * edgeOn);
  lit += uRim * uEdgeL.x * pow(1.0 - nv, 2.0) * wrap;
  lit = min(lit * (1.0 + 0.2 * uAttn), vec3(1.0));
  float a = mix(uO.x, uO.y, max(uHover, 0.6 * uAttn));
  a = mix(a, uO.z, uBlocked);
  a = mix(a, max(a, uO.w), edgeOn * (1.0 - uBlocked));
  // the ink: a line of constant screen width inside the V's outline (walls lie on the outline), the walls inked too
  float upx = max( max( length( dFdx( vUZ ) ), length( dFdy( vUZ ) ) ), 1e-6 );
  // under 0.75 px the line keeps that half-width and fades instead (no beading at Low quality)
  float iw0 = uInk.x * uInk.z, iw = max( iw0, 0.75 );
  float ink = ( 1.0 - smoothstep( iw - 0.6, iw + 0.6, hexDist( vUZ ) / upx ) ) * clamp( iw0 / 0.75, 0.0, 1.0 );
  ink = max( ink, uInk.w * edgeOn ) * mix( 1.0, 0.45, uBlocked );
  lit = mix( lit, uInkC, ink );
  a = max( a, ink * uInk.y * mix( 1.0, 0.5, uBlocked ) );
  gl_FragColor = vec4(lit, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The local -> view rotation of a tip's normals (columns: its outward screen direction, away from the viewer, across =
 * outward x away), as THREE.Matrix3.set arguments (row-major). Pure. */
export function tipViewRotation(dir) {
  const e = COMPASS_SCREEN[dir];
  if (!e) fail(`unknown arrow direction ${dir}`);
  const d = [e[0], -e[1], 0], w = [0, 0, -1], b = cross3(d, w);
  return [d[0], w[0], b[0], d[1], w[1], b[1], d[2], w[2], b[2]];
}

/**
 * THREE rig of four solid V tips sharing one geometry (browser; THREE passed in, r150+: BufferGeometry, ShaderMaterial,
 * Mesh, Group, Object3D, Color, Matrix3, Vector3, Vector4, FrontSide).
 *  kind: 'brain' | 'mirror' (a name); look: ARROW_LOOK fields (fill, edge, rim, hover, opacities, light, hoverScale,
 *  renderOrder).
 * The tips are blended, never write depth and are NOT depth-tested: they are drawn on top of everything drawn before
 * them (renderOrder puts them last), so a tip is never hidden under a motor area or the body, and what is seen at a
 * tip is the tip. Within a tip, back faces are culled: seen along its sight line (facingArrowFrames) the solid covers
 * every pixel with exactly one front face, so its own faces never blend over each other (its triangles are also
 * ordered far to near).
 * Returns { group, arrows: { dir: { root, mesh, material } }, setFrames(frames), setHover(dir | null, { blocked }),
 *   setAttention(0..1), setVisible(bool), hovered, hoverBlocked, geometry, dispose() }. The rig never moves by itself.
 */
export function createArrowRig(THREE, { kind = 'brain', design = ARROW_DESIGN, look = ARROW_LOOK, name = null } = {}) {
  if (!THREE || typeof THREE.BufferGeometry !== 'function' || typeof THREE.ShaderMaterial !== 'function') fail('createArrowRig needs THREE with BufferGeometry and ShaderMaterial');
  const L = { ...ARROW_LOOK, ...look };
  const g = buildArrowGeometry(design);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
  geometry.computeBoundingSphere();
  const col = hex => new THREE.Color(hex);
  const opq = v => (isNum(v) ? clamp(v, 0, 1) : 1);
  const num = (v, dflt) => (isNum(v) ? v : dflt);
  const key = norm3(Array.isArray(L.keyLight) && L.keyLight.length === 3 ? L.keyLight : ARROW_LOOK.keyLight);
  const facing = Array.isArray(L.edgeFacing) && L.edgeFacing.length === 2 ? L.edgeFacing : ARROW_LOOK.edgeFacing;
  // R558 BB: the V's outline in its design plane and the local -> design plane map (the ink line), the cel tones.
  const solid = chevronSolid(design), dd = solid.design, tr = solid.tiltDeg * DEG;
  const sL = dd.depth, sH = dd.halfSpan, st = dd.halfStroke, sl = Math.hypot(sL, sH), nU = sH / sl, nZ = sL / sl, mitre = (st * sl) / sH;
  const hex = [[-st * nU, sH - st * nZ], [st * nU, sH + st * nZ], [sL + mitre, 0], [st * nU, -sH - st * nZ], [-st * nU, -sH + st * nZ], [sL - mitre, 0]];
  const cs = Array.isArray(L.celSteps) && L.celSteps.length === 2 ? L.celSteps : ARROW_LOOK.celSteps;
  const cl = Array.isArray(L.celLevels) && L.celLevels.length === 3 ? L.celLevels : ARROW_LOOK.celLevels;
  const sc = Array.isArray(L.specCrisp) && L.specCrisp.length === 2 ? L.specCrisp : ARROW_LOOK.specCrisp;
  const inkPr = { value: new THREE.Vector4(num(L.inkCss, 1.3), opq(L.inkAlpha), 1, clamp(num(L.wallInk, 0.9), 0, 1)) };
  const group = new THREE.Group();
  group.name = name || `ns-arrows3d (${kind}: solid V-tip orbit arrows)`;
  const arrows = {}, materials = [];
  for (const dir of COMPASS_DIRS) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false,
      side: THREE.FrontSide !== undefined ? THREE.FrontSide : 0,
      uniforms: {
        uViewRot: { value: new THREE.Matrix3().set(...tipViewRotation(dir)) },
        uFill: { value: col(L.fill) }, uEdge: { value: col(L.edge) }, uRim: { value: col(L.rim) }, uHoverCol: { value: col(L.hover) },
        uO: { value: new THREE.Vector4(opq(L.opacity), opq(L.hoverOpacity), opq(L.blockedOpacity), opq(L.edgeOpacity)) },
        uKey: { value: new THREE.Vector3(key[0], key[1], key[2]) },
        uLight: { value: new THREE.Vector4(num(L.ambient, 0.42), num(L.diffuse, 0.62), num(L.specular, 0.4), Math.max(1, num(L.shininess, 40))) },
        uEdgeL: { value: new THREE.Vector4(num(L.rimLight, 0.3), clamp(num(L.edgeDark, 0.7), 0, 1), num(facing[0], 0.12), Math.max(num(facing[0], 0.12) + 0.01, num(facing[1], 0.6))) },
        uDepth: { value: new THREE.Vector3(g.depthRange[0], g.depthRange[1], clamp(num(L.farDim, 0.75), 0, 1)) },
        uHover: { value: 0 }, uAttn: { value: 0 }, uBlocked: { value: 0 },
        uPlane: { value: new THREE.Vector4(Math.cos(tr), Math.sin(tr), solid.shift[0], solid.shift[1]) },
        uHex: { value: hex.map(q => new THREE.Vector2(q[0], q[1])) },
        uCel: { value: new THREE.Vector4(cs[0], cs[1], Math.max(0, num(L.celSoft, 0.04)), sc[0]) },
        uCelL: { value: new THREE.Vector4(cl[0], cl[1], cl[2], Math.max(sc[0] + 1e-3, sc[1])) },
        uInk: inkPr, uInkC: { value: col(L.ink !== undefined ? L.ink : ARROW_LOOK.ink) }
      }
    });
    materials.push(material);
    const root = new THREE.Object3D();
    root.name = `ns-arrow3d-${dir}`;
    root.matrixAutoUpdate = false;
    root.visible = false;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ns-arrow3d-${dir}-tip`;
    mesh.renderOrder = L.renderOrder;
    mesh.frustumCulled = false;
    mesh.userData.nsOrbit = dir;
    root.add(mesh);
    group.add(root);
    arrows[dir] = { root, mesh, material };
  }
  let hovered = null, hoverBlocked = false, visible = true;
  return {
    group, arrows, geometry, kind,
    get hovered() { return hovered; },
    get hoverBlocked() { return hoverBlocked; },
    /** Place the tips (frameArrowFrames result; a missing / null entry hides that tip). */
    setFrames(frames) {
      for (const dir of COMPASS_DIRS) {
        const a = arrows[dir], f = frames && frames[dir];
        if (!f) { a.root.visible = false; continue; }
        a.root.matrix.fromArray(f.matrix);
        a.root.matrixWorldNeedsUpdate = true;
        a.root.visible = visible;
      }
    },
    /** Highlight one tip (crosshair or pointer over it) or none. { blocked: true } = under the look but not usable now:
     * shown greyed, not enlarged. */
    setHover(dir, { blocked = false } = {}) {
      hovered = COMPASS_DIRS.includes(dir) ? dir : null;
      hoverBlocked = Boolean(hovered && blocked);
      for (const d of COMPASS_DIRS) {
        const on = d === hovered, u = arrows[d].material.uniforms;
        u.uHover.value = on && !hoverBlocked ? 1 : 0;
        u.uBlocked.value = on && hoverBlocked ? 1 : 0;
        arrows[d].mesh.scale.setScalar(on && !hoverBlocked ? L.hoverScale : 1);
      }
      return hovered;
    },
    /** A soft extra glow on all four (0..1), e.g. while the "Try this" goal asks for an orbit. */
    setAttention(x) { const v = clamp(Number(x) || 0, 0, 1); for (const d of COMPASS_DIRS) arrows[d].material.uniforms.uAttn.value = v; return v; },
    setVisible(on) { visible = on !== false; for (const d of COMPASS_DIRS) if (!visible) arrows[d].root.visible = false; return visible; },
    /** The drawing buffer's pixel ratio (the ink line is CSS pixels wide). */
    setPixelRatio(pr) { inkPr.value.z = Number.isFinite(pr) && pr > 0 ? pr : 1; return inkPr.value.z; },
    dispose() { geometry.dispose(); for (const m of materials) m.dispose(); if (group.parent) group.parent.remove(group); }
  };
}
