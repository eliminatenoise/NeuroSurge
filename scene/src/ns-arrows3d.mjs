/**
 * NeuroSurge round 5 (R5-arrows, lead decision D16; user requirement R20 of 2026-11-08T21:54Z): 3D COMPASS ORBIT ARROWS.
 *
 * The user: "I don't want them to be curved. I want them to be bent in the forward direction, away from the brain. So
 * we're talking about 3D curvature, not 2D curvature ... there are forward, back, left and right arrows, and they must
 * stay consistent, basically towards the top, bottom, left and right ... the arrows should be kind of in the position of
 * a compass ... they extend out, project out from the body or the brain, and then they sort of bend inwards to indicate
 * that they are shifting the orbit whenever you tap them or hold them." Earlier (R12): "a centimeter or a few
 * centimeters away from the brain", not connected to it.
 *
 * What this module does (one owner: R5-arrows; pure math is Node-testable without a DOM, THREE is passed in):
 *  (a) LAYOUT (pure): from the target's drawn outline on screen (any projected points; the convex hull is taken here) it
 *      puts four arrows at the compass positions of that outline: forward = TOP, back = BOTTOM, left, right, each on the
 *      line through the middle of the outline's bounding box, a small gap (gapPx) outside the outline. When the screen
 *      has no room there, it first uses a smaller gap, then a slightly smaller arrow, and only then SLIDES INWARD ALONG
 *      ITS OWN COMPASS LINE until it fits on screen and clear of the HUD obstacles (the brain fills the height of a 16:9
 *      view, so the top / bottom arrows slide over its front / back ends there): it never moves sideways and never
 *      leaves its side (flags `gapUsedPx`, `scale`, `slidPx`, `overOutline`). compassLayout().
 *  (b) 3D FRAMES (pure): each arrow is a small bent tube: it starts at its anchor, goes straight OUTWARD in the screen
 *      plane (the stalk, exactly on its compass line), then bends TOWARD THE VIEWER and back INWARD (an arc of
 *      bendDeg = 150), and ends in a broad head that points toward the viewer and inward, the way that side of the
 *      target turns when the arrow is used (top arrow: the front of the brain turns toward you = "orbit to the front").
 *      Seen exactly from the eye a bend toward the eye is edge-on and folds onto itself (a "pin"); so the bend plane is
 *      turned viewTiltDeg = 25 deg about the stalk, the same way for all four (as if seen a little from the upper left:
 *      top / bottom hooks show to the right, left / right hooks show downward). The 3D bend is then read from the
 *      overlap (the near head crosses in front of the far stalk, with a dark outline), the light and shade, a shaft
 *      that thickens toward the viewer and a brightness ramp from the far base to the near head. arrowFrames() returns
 *      a world matrix per arrow. The anchor plane is the target's centre plane (a sphere around the target, at its
 *      middle depth); an arrow that had to slide over the outline is put in FRONT of the target's nearest point
 *      instead (frontDepthM), so it never touches it in 3D.
 *  (c) GEOMETRY (pure typed arrays): buildArrowGeometry() (round tube with a smooth bend, rounded base cap, broad
 *      elliptical-cone head; 466 vertices / 770 triangles per arrow at the defaults), plus the THREE wrapper
 *      createArrowRig() with a lit shader (fixed view-space key light from the upper left, fill, specular and a fresnel
 *      rim), a dark outline pass, a hover state (warm white, 12 % larger, stronger rim), a "covered" state (grey: under
 *      the look but not usable, e.g. a mirror-body arrow behind the brain) and a see-through copy drawn only where
 *      something (the player's arm) is in front of the arrow (depthFunc GreaterDepth), so a hidden arrow stays findable.
 *  (d) PICKING (pure): pickArrows(ray) / pickArrowHits(ray) test a world ray (crosshair or free pointer, first or third
 *      person) against each arrow's chain of capsules (shaft + head) with a padding in screen px: the nearest { dir, t }
 *      or every hit nearest first; an occluder distance (the brain glass in front of the mirror body's arrows) blocks.
 *  (e) SIZES: ARROW_SIZES.brain (large) and ARROW_SIZES.mirror (smaller, closer) from the view size; the same design.
 *
 * Coordinates: world metres; a camera is { width, height (CSS px, x right, y DOWN), fovYDeg } plus either Three's 'YXZ'
 * yaw / pitch at `position` (default the origin, the first-person head) or its matrixWorld (any camera, e.g. third
 * person). Screen directions per arrow: COMPASS_SCREEN. Orbit names are ns-app ORBIT_DIRS ('forward' | 'back' | 'left'
 * | 'right'). Matrices are column-major Float64Array(16) (THREE.Matrix4.fromArray).
 *
 * Honesty: the arrows only turn the player's VIEW of the simulated brain (or of the mirror image of the body) around
 * its centre; they are controls, not anatomy, and say nothing about real brains.
 */

const DEG = Math.PI / 180;
const freeze = o => Object.freeze(o);

/** R5-polish (D19): how far a covered (not usable) arrow is greyed when it is NOT under the look (uBlocked; 1 = the
 * covered-hover look). Display choice. */
export const COVERED_DIM = 0.55;

/** The four arrows (same names and order as ns-scene-three ORBIT_ARROWS.dirs and ns-app orbit requests). */
export const COMPASS_DIRS = freeze(['forward', 'back', 'left', 'right']);
/** Screen direction of each arrow from the target's middle (CSS px, y down): forward = top, back = bottom. */
export const COMPASS_SCREEN = freeze({ forward: freeze([0, -1]), back: freeze([0, 1]), left: freeze([-1, 0]), right: freeze([1, 0]) });

/**
 * Arrow shape in DESIGN UNITS (1 unit = sizePx on screen at the anchor). Local axes: x = u (outward, the compass
 * direction), y = w (toward the viewer), z = across. Stalk: straight from u = 0 to u = stalk. Bend: circle of radius
 * bendRadius whose centre is at (stalk, bendRadius), swept bendDeg from the outward direction toward the viewer and
 * beyond (150 deg: the head then points 60 deg inward of "toward the viewer"). Shaft radius grows from shaftR0 (far
 * base) to shaftR1 (near end of the bend), the cue a near object gives. section: 'round' | 'flat' (a ribbon, flatRatio
 * thick). Head on the end tangent, starting headInset before the bend's end: 'flat' = a broad elliptical cone
 * (headRadius across, headRadius x headFlat in the bend plane), 'cone' = a round cone. Segments set the polygon count.
 * viewTiltDeg / viewTiltScreen: the bend plane's turn about the stalk (arrowFrames). Display choices, chosen by viewing
 * variants (round5/R5-arrows-NOTES.md, harness/run-R5-arrows-lab-1).
 */
export const ARROW_DESIGN = freeze({
  stalk: 0.5, bendRadius: 0.38, bendDeg: 150, shaftR0: 0.085, shaftR1: 0.14, headLength: 0.5, headRadius: 0.29, headInset: 0.03,
  section: 'round', flatRatio: 0.45, head: 'flat', headFlat: 0.5,
  radialSegments: 14, stalkSegments: 4, bendSegments: 20, capRings: 3,
  viewTiltDeg: 25, viewTiltScreen: freeze([1, 1])
});

/**
 * Size rules (display choices) per kind. sizePx = clamp(sizeFrac x min(width, height), minPx, maxPx) is the arrow's
 * on-screen length unit; gapPx = clamp(gapCm on screen (96 CSS px per inch), gapMinFrac x min, gapMaxFrac x min) is the
 * room left between the target's outline and the arrow ("a centimetre or a few centimetres"). The mirror body's arrows
 * use the same design, smaller and closer (D19).
 */
export const ARROW_SIZES = freeze({
  brain: freeze({ sizeFrac: 0.085, minPx: 34, maxPx: 72, gapCm: 0.9, gapMinFrac: 0.025, gapMaxFrac: 0.05 }),
  mirror: freeze({ sizeFrac: 0.05, minPx: 22, maxPx: 42, gapCm: 0.35, gapMinFrac: 0.01, gapMaxFrac: 0.02 })
});
export const PX_PER_CM = 96 / 2.54;

/** Layout rules: screen margin, slide step, the perspective allowance on the footprint (the near head is drawn up to
 * about 10 % larger than the anchor scale), the outline-clearance search step and the hover / pick padding. Before an
 * arrow slides over the outline it first tries a smaller gap (down to gapMinFrac x gapPx, at least gapMinPx), then a
 * slightly smaller arrow (shrink factors, with the small gap). R5-bigbrain (R25): an arrow at the screen edge prefers a
 * sideways shift along the edge to sliding inward (edgeSlideCost: 1 px inward costs as much as this many px sideways)
 * and keeps at least separationFrac x the smaller extent of the visible outline from the arrows placed before it (the
 * compass order forward, back, left, right), so the four stay far apart; it slides inward at most edgeMaxSlideFrac of the
 * visible extent (further in it would leave its side), else it counts as blocked and the next tier is tried. */
// R5-fix (review F2 / P2): edgeMaxShiftFrac caps the sideways shift of an edge arrow (0.15: it stays in the middle third
// of its side, the e2e S45 rule; the old cap, 0.45, is the `deep` tier's); the centred line (inward slide, then a
// smaller arrow) is always tried first.
export const ARROW_LAYOUT = freeze({ marginPx: 8, slideStepPx: 2, perspectiveAllowance: 1.1, clearStepPx: 1, maxClearPx: 400, pickPadPx: 6, frontMarginFrac: 0.03, gapMinFrac: 0.4, gapMinPx: 8, shrink: freeze([0.85, 0.75]), edgeSlideCost: 2, separationFrac: 0.4, edgeMaxSlideFrac: 0.15, edgeMaxShiftFrac: 0.15 });

/**
 * Look (display choices; sRGB hex). The base end is a dim cool grey, the head a bright near-white (far = dimmer, near =
 * brighter). Hover: warm white, 12 % larger, stronger rim (not colour alone). Neither is the activity ramp, the
 * left-arm light blue or the gold "switched on" mark. lightDir / fillDir are VIEW-space directions (x right, y up,
 * z toward the viewer). xrayOpacity: the see-through copy where the arm covers the arrow.
 */
export const ARROW_LOOK = freeze({
  base: 0x6f7c8c, tip: 0xd5dde8, hover: 0xfff1cf, rim: 0xcfe0ff,
  lightDir: freeze([-0.45, 0.75, 0.55]), fillDir: freeze([0.6, -0.25, 0.45]),
  ambient: 0.2, diffuse: 0.85, fill: 0.25, specular: 0.55, shininess: 40, rimStrength: 0.35,
  hoverScale: 1.12, xrayOpacity: 0.5, xrayColor: 0xe9eff7, renderOrder: 30, xrayRenderOrder: 31,
  outline: 0.035, outlineColor: 0x0a0e15
});

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const smooth = t => t * t * (3 - 2 * t);
const isNum = Number.isFinite;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const norm3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function fail(msg) { throw new Error(`ns:arrows3d: ${msg}`); }

/* ------------------------------------------------------------------------------------------------ sizes and shape */

/** { sizePx, gapPx } for a CSS viewport and a kind ('brain' | 'mirror' or a sizes object). Pure. */
export function arrowSizePx({ width, height } = {}, kind = 'brain') {
  if (!(width > 0 && height > 0)) fail('arrowSizePx needs width and height > 0');
  const s = typeof kind === 'string' ? ARROW_SIZES[kind] : kind;
  if (!s) fail(`unknown arrow kind ${kind}`);
  const m = Math.min(width, height);
  return { sizePx: clamp(s.sizeFrac * m, s.minPx, s.maxPx), gapPx: clamp(s.gapCm * PX_PER_CM, s.gapMinFrac * m, s.gapMaxFrac * m) };
}

/**
 * The arrow's centre line and radii in design units (pure): { samples: [{ u, w, tu, tw, r, rN, along, kind }], head:
 * { base: [u, w], tip: [u, w], axis: [tu, tw], radius, length, thickness, shape }, footprint: { uMin, uMax, half,
 * wMax } }. r is the across (screen-tangent) half width, rN the half thickness in the bend plane (r x flatRatio for
 * the 'flat' ribbon section, r for 'round'). footprint: the on-screen extent seen from the eye (u range and half width
 * across) and the largest toward-the-viewer offset. The centre line is planar (u, w), so seen exactly from the eye it
 * projects onto the u axis.
 */
export function arrowPath(design = ARROW_DESIGN) {
  const d = { ...ARROW_DESIGN, ...design };
  for (const k of ['stalk', 'bendRadius', 'bendDeg', 'shaftR0', 'shaftR1', 'headLength', 'headRadius']) if (!(isNum(d[k]) && d[k] > 0)) fail(`design.${k} must be > 0`);
  if (!(d.bendDeg <= 180)) fail('design.bendDeg must be <= 180');
  const flat = d.section === 'flat' ? clamp(isNum(d.flatRatio) ? d.flatRatio : 0.45, 0.1, 1) : 1;
  const nS = Math.max(1, d.stalkSegments | 0), nB = Math.max(2, d.bendSegments | 0);
  const beta = d.bendDeg * DEG, rb = d.bendRadius;
  const total = d.stalk + rb * beta;
  const samples = [];
  for (let i = 0; i <= nS; i++) {
    const u = (d.stalk * i) / nS;
    samples.push({ u, w: 0, tu: 1, tw: 0, s: u / total, kind: 'stalk' });
  }
  for (let i = 1; i <= nB; i++) {
    const phi = (beta * i) / nB;
    samples.push({ u: d.stalk + rb * Math.sin(phi), w: rb - rb * Math.cos(phi), tu: Math.cos(phi), tw: Math.sin(phi), s: (d.stalk + rb * phi) / total, kind: 'bend' });
  }
  for (const p of samples) { p.r = d.shaftR0 + (d.shaftR1 - d.shaftR0) * smooth(clamp(p.s, 0, 1)); p.rN = p.r * flat; p.along = 0.82 * p.s; }
  const end = samples[samples.length - 1];
  const axis = [end.tu, end.tw];
  const base = [end.u - d.headInset * axis[0], end.w - d.headInset * axis[1]];
  const tip = [base[0] + d.headLength * axis[0], base[1] + d.headLength * axis[1]];
  const shape = d.head === 'flat' ? 'flat' : 'cone';
  const thickness = shape === 'flat' ? d.headRadius * clamp(isNum(d.headFlat) ? d.headFlat : 0.35, 0.05, 1) : d.headRadius;
  // Footprint seen from the eye (projection onto u): rings (+- rN |tw| along u), the head's base (a disc: radius x
  // |axis.w|; a flat head: thickness x |axis.u| ... its in-plane extent) and its tip.
  let uMin = Infinity, uMax = -Infinity, wMax = 0, half = 0;
  for (const p of samples) {
    const ext = p.rN * Math.abs(p.tw); // the in-plane normal (-tw, tu) has u component -tw
    uMin = Math.min(uMin, p.u - ext);
    uMax = Math.max(uMax, p.u + ext);
    wMax = Math.max(wMax, p.w + p.rN);
    half = Math.max(half, p.r);
  }
  uMin = Math.min(uMin, -samples[0].r); // the rounded base cap
  const baseU = (shape === 'flat' ? thickness : d.headRadius) * Math.abs(axis[1]);
  uMin = Math.min(uMin, base[0] - baseU, tip[0] - (shape === 'flat' ? thickness * Math.abs(axis[1]) : 0));
  uMax = Math.max(uMax, base[0] + baseU, tip[0] + (shape === 'flat' ? thickness * Math.abs(axis[1]) : 0));
  wMax = Math.max(wMax, base[1] + (shape === 'flat' ? thickness : d.headRadius) * Math.abs(axis[0]), tip[1]);
  half = Math.max(half, d.headRadius);
  // A view tilt turns the bend plane about the stalk by viewTiltDeg: the toward-the-viewer part then shows sideways by
  // up to sin(tilt) x wMax on screen (conservative: added to both sides of the across extent).
  const side = isNum(d.viewTiltDeg) && d.viewTiltDeg > 0 ? Math.sin(d.viewTiltDeg * DEG) * wMax : 0;
  half += side;
  return {
    samples, design: d, flat, side,
    head: { base, tip, axis, radius: d.headRadius, length: d.headLength, thickness, shape },
    footprint: { uMin, uMax, half, wMax }
  };
}

/** The room an arrow needs outside the target's outline on its side, in CSS px: gap + its outward footprint (with the
 * perspective allowance) + the screen margin (pure). A framing that wants all four arrows fully outside the brain
 * reserves this on each side. */
export function arrowRoomPx({ sizePx, gapPx }, design = ARROW_DESIGN, layoutRules = ARROW_LAYOUT) {
  const f = arrowPath(design).footprint;
  return gapPx + (f.uMax - f.uMin) * sizePx * layoutRules.perspectiveAllowance + layoutRules.marginPx;
}

/**
 * Tube + cap + head geometry in design units (pure typed arrays, local axes x = outward, y = toward the viewer,
 * z = across): { positions: Float32Array, normals: Float32Array, along: Float32Array (0 at the base .. 1 at the head
 * tip, for the far-to-near brightness ramp), indices: Uint16Array, vertexCount, triangleCount }. Every triangle is
 * wound counter-clockwise seen from outside (its geometric normal agrees with its vertex normals).
 */
export function buildArrowGeometry(design = ARROW_DESIGN) {
  const path = arrowPath(design), d = path.design, flat = path.flat;
  const R = Math.max(6, d.radialSegments | 0);
  const pos = [], nor = [], alo = [], idx = [];
  const vert = (p, n, a) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); alo.push(a); return pos.length / 3 - 1; };
  const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  /** push a triangle wound so that its geometric normal agrees with `want` */
  const tri = (a, b, c, want) => { const n = cross3(sub3(P(b), P(a)), sub3(P(c), P(a))); if (dot3(n, want) >= 0) idx.push(a, b, c); else idx.push(a, c, b); };
  // Rounded base cap (a half ellipsoid facing back along -x, toward the target; thin in y for the flat section).
  const r0 = path.samples[0].r, cr = Math.max(1, d.capRings | 0);
  const pole = vert([-r0, 0, 0], [-1, 0, 0], 0);
  const capRing = k => 1 + (k - 1) * (R + 1);
  for (let k = 1; k <= cr; k++) {
    const th = (Math.PI / 2) * (k / cr); // 0 at the pole .. 90 deg at the rim
    const x = -r0 * Math.cos(th), rr = r0 * Math.sin(th);
    for (let j = 0; j <= R; j++) {
      const a = (2 * Math.PI * j) / R, ny = Math.cos(a), nz = Math.sin(a);
      vert([x, rr * ny * flat, rr * nz], norm3([-Math.cos(th), (Math.sin(th) * ny) / flat, Math.sin(th) * nz]), 0);
    }
  }
  for (let j = 0; j < R; j++) tri(pole, capRing(1) + j + 1, capRing(1) + j, [-1, 0, 0]);
  for (let k = 1; k < cr; k++) {
    const r1 = capRing(k), r2 = capRing(k + 1);
    for (let j = 0; j < R; j++) { const out = norm3(sub3(P(r2 + j), [-r0 * 0.5, 0, 0])); tri(r1 + j, r1 + j + 1, r2 + j, out); tri(r1 + j + 1, r2 + j + 1, r2 + j, out); }
  }
  // Tube rings along the centre line: frame T = (tu, tw, 0), in-plane normal N = (-tw, tu, 0), across B = (0, 0, 1);
  // section: ellipse with semi-axes rN (along N) and r (along B).
  const tubeStart = pos.length / 3;
  for (const p of path.samples) {
    const N = [-p.tw, p.tu, 0];
    for (let j = 0; j <= R; j++) {
      const a = (2 * Math.PI * j) / R, ca = Math.cos(a), sa = Math.sin(a);
      const n = norm3([(N[0] * ca) / p.rN, (N[1] * ca) / p.rN, sa / p.r]);
      vert([p.u + p.rN * N[0] * ca, p.w + p.rN * N[1] * ca, p.r * sa], n, p.along);
    }
  }
  for (let i = 0; i + 1 < path.samples.length; i++) {
    const a0 = tubeStart + i * (R + 1), a1 = a0 + (R + 1);
    for (let j = 0; j < R; j++) {
      const want = [nor[3 * (a0 + j)] + nor[3 * (a1 + j + 1)], nor[3 * (a0 + j) + 1] + nor[3 * (a1 + j + 1) + 1], nor[3 * (a0 + j) + 2] + nor[3 * (a1 + j + 1) + 2]];
      tri(a0 + j, a0 + j + 1, a1 + j, want); tri(a0 + j + 1, a1 + j + 1, a1 + j, want);
    }
  }
  const H = path.head, T = [H.axis[0], H.axis[1], 0], N = [-H.axis[1], H.axis[0], 0], B = [0, 0, 1];
  const at = (t, n, b) => [H.base[0] + t * T[0] + n * N[0], H.base[1] + t * T[1] + n * N[1], b];
  if (H.shape === 'flat') {
    // Flat arrowhead: an ELLIPTICAL cone, wide across (radius) and thin in the bend plane (thickness), smooth-shaded,
    // so it reads as a broad arrowhead with a lit ridge rather than a flat cut-out.
    const rN = H.thickness, rB = H.radius, L = H.length;
    const surf = th => { const c = Math.cos(th), s = Math.sin(th); return [rN * c, rB * s]; };
    const nrm = th => {
      const c = Math.cos(th), s = Math.sin(th);
      const dTh = add3(mul3(N, -rN * s), mul3(B, rB * c)); // d/dtheta of the base ring
      const dT = sub3(mul3(T, L), add3(mul3(N, rN * c), mul3(B, rB * s))); // base ring -> apex
      let n = norm3(cross3(dTh, dT));
      if (dot3(n, add3(mul3(N, c), mul3(B, s))) < 0) n = mul3(n, -1);
      return n;
    };
    const discC = vert(at(0, 0, 0), mul3(T, -1), 0.84);
    const discStart = pos.length / 3;
    for (let j = 0; j <= R; j++) { const q = surf((2 * Math.PI * j) / R); vert(at(0, q[0], q[1]), mul3(T, -1), 0.84); }
    for (let j = 0; j < R; j++) tri(discC, discStart + j + 1, discStart + j, mul3(T, -1));
    const sideStart = pos.length / 3;
    for (let j = 0; j <= R; j++) { const th = (2 * Math.PI * j) / R, q = surf(th); vert(at(0, q[0], q[1]), nrm(th), 0.88); }
    const apexStart = pos.length / 3;
    for (let j = 0; j < R; j++) vert(H.tip.concat(0), nrm((2 * Math.PI * (j + 0.5)) / R), 1);
    for (let j = 0; j < R; j++) tri(sideStart + j, sideStart + j + 1, apexStart + j, nrm((2 * Math.PI * (j + 0.5)) / R));
  } else {
    // Cone: back disc (normal -axis) and side (one apex vertex per segment for smooth normals).
    const alpha = Math.atan2(H.radius, H.length), ca0 = Math.cos(alpha), sa0 = Math.sin(alpha);
    const ringPt = j => { const a = (2 * Math.PI * j) / R; const c = Math.cos(a), s = Math.sin(a); return { p: at(0, H.radius * c, H.radius * s), radial: [N[0] * c, N[1] * c, s] }; };
    const discC = vert(at(0, 0, 0), mul3(T, -1), 0.82);
    const discStart = pos.length / 3;
    for (let j = 0; j <= R; j++) vert(ringPt(j).p, mul3(T, -1), 0.82);
    for (let j = 0; j < R; j++) tri(discC, discStart + j + 1, discStart + j, mul3(T, -1));
    const sideStart = pos.length / 3;
    for (let j = 0; j <= R; j++) { const q = ringPt(j); vert(q.p, add3(mul3(q.radial, ca0), mul3(T, sa0)), 0.86); }
    const apexStart = pos.length / 3;
    for (let j = 0; j < R; j++) { const q = ringPt(j + 0.5); vert(H.tip.concat(0), add3(mul3(q.radial, ca0), mul3(T, sa0)), 1); }
    for (let j = 0; j < R; j++) tri(sideStart + j, sideStart + j + 1, apexStart + j, add3(mul3(ringPt(j + 0.5).radial, ca0), mul3(T, sa0)));
  }
  const n = pos.length / 3;
  if (n > 65535) fail('too many vertices for 16-bit indices');
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), along: Float32Array.from(alo), indices: Uint16Array.from(idx), vertexCount: n, triangleCount: idx.length / 3 };
}

/* ------------------------------------------------------------------------------------------------ 2D layout */

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

/** Signed distance (px) from (x, y) to a convex hull polygon ([[x, y], ...] in hull order): > 0 outside, <= 0 inside. */
export function hullSignedDistance(hull, x, y) {
  if (!hull || hull.length < 3) return Infinity;
  // The monotone chain gives counter-clockwise order in a y-up frame (clockwise on a y-down screen); either way the
  // sign of the edge cross products is the same for every edge when the point is inside.
  let sign = 0, inside = true, best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
    const c = ex * (y - a[1]) - ey * (x - a[0]);
    if (c !== 0) { const s = Math.sign(c); if (sign === 0) sign = s; else if (s !== sign) inside = false; }
    const t = L2 > 0 ? clamp(((x - a[0]) * ex + (y - a[1]) * ey) / L2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey));
  }
  return inside ? -best : best;
}

/** Where the ray from (cx, cy) along (dx, dy) leaves the convex hull: the farthest crossing, [x, y] or null. Pure. */
export function hullExit(hull, cx, cy, dx, dy) {
  let best = -Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], ex = b[0] - a[0], ey = b[1] - a[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const qx = a[0] - cx, qy = a[1] - cy;
    const t = (qx * ey - qy * ex) / den, s = (qx * dy - qy * dx) / den;
    if (s >= -1e-9 && s <= 1 + 1e-9 && t > best) best = t;
  }
  return best > -Infinity ? [cx + best * dx, cy + best * dy] : null;
}

const boxOverlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const boxInside = (a, u) => a.x0 >= u.x0 - 1e-9 && a.x1 <= u.x1 + 1e-9 && a.y0 >= u.y0 - 1e-9 && a.y1 <= u.y1 + 1e-9;

/**
 * R5-bigbrain (R25): an occupancy grid of screen points (pure), for "is anything of X under this box" in O(1): the motor
 * areas' projected sample points, so an arrow never sits over a motor area. xy: flat [x, y, ...] CSS px (NaN skipped);
 * cellPx: grid cell; dilate: cells marked round each point (closes the gaps between samples); indices: optional
 * triangle indices into the points (every covered cell is marked). Returns { cellPx, gw, gh,
 * count (occupied cells), hits(box) (occupied cells under { x0, y0, x1, y1 }, CSS px; parts off the grid count 0) }.
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
  // with triangle indices every covered cell is marked too (a surface seen at a grazing angle projects to long, thin
  // triangles whose vertices alone leave gaps)
  // R5-fix (review code F1): allocation-free (no per-triangle or per-cell arrays): the finite checks and the five
  // point-in-triangle tests are inlined; same cells as before (bench: harness/run-R5-fix-tools/bench-occ.mjs).
  const inTri = (px, py, ax, ay, bx, by, cx, cy, den) => {
    const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
    return l1 >= 0 && l2 >= 0 && l1 + l2 <= 1;
  };
  if (indices && indices.length >= 3) for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ax = xy[2 * a] / cellPx, ay = xy[2 * a + 1] / cellPx, bx = xy[2 * b] / cellPx, by = xy[2 * b + 1] / cellPx, cx = xy[2 * c] / cellPx, cy = xy[2 * c + 1] / cellPx;
    if (!(Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(bx) && Number.isFinite(by) && Number.isFinite(cx) && Number.isFinite(cy))) continue;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(gw - 1, Math.floor(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), j1 = Math.min(gh - 1, Math.floor(Math.max(ay, by, cy)));
    if (i0 > i1 || j0 > j1 || (i1 - i0) * (j1 - j0) > 40000) continue;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const flat = Math.abs(den) < 1e-12;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (flat) { mark(i, j); continue; }
      // the cell counts when any of its centre or corners lies in the triangle (conservative for thin triangles)
      if (inTri(i + 0.5, j + 0.5, ax, ay, bx, by, cx, cy, den) || inTri(i, j, ax, ay, bx, by, cx, cy, den) || inTri(i + 1, j, ax, ay, bx, by, cx, cy, den)
        || inTri(i, j + 1, ax, ay, bx, by, cx, cy, den) || inTri(i + 1, j + 1, ax, ay, bx, by, cx, cy, den)) mark(i, j);
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

/**
 * The four compass anchors around a target's drawn outline (pure; CSS px, y down).
 *  outline: flat [x, y, ...] of projected outline points (or a hull as [[x, y], ...]); the convex hull is taken.
 *  width, height: the CSS viewport; sizePx, gapPx: arrowSizePx(); design: the arrow shape (footprint);
 *  usable: { x0, y0, x1, y1 } where arrows may be drawn (default: the view minus marginPx; pass e.g. y0 = 26 + margin
 *    for the always-on top line); obstacles: [{ x0, y0, x1, y1 }] boxes an arrow must not overlap (the information
 *    column or bottom band, the HUD card's homes, the toast line);
 *  avoid (R5-bigbrain): what an arrow must not cover when it has to sit over the target (the brain's MOTOR AREAS): an
 *    occupancyGrid() result, or flat [x, y, ...] CSS px points (a grid is built with avoidCellPx / avoidDilate);
 *  fit: 'slide' (default: see below) | 'outside' (report the ideal place even when off screen);
 *  prefer (R5-bigbrain): a rect tried first (the comfortable look range); a blocked arrow falls back to the usable rect,
 *  then (fallbackObstacles) to the usable rect with those obstacles instead (flags tier, outsidePreferred).
 * Rules (R20 compass positions; R25 screen-edge rule, round5/R5-bigbrain-NOTES.md):
 *  - The compass lines run through the middle of the outline's bounding box; when the outline leaves the usable rect on
 *    any side (a brain that fills the screen), through the middle of its VISIBLE part (the box clipped to the usable
 *    rect), so the four arrows stay centred on the four sides of what is seen, far apart.
 *  - An arrow whose side of the outline is inside the usable rect sits a gap (gapPx) outside the outline on its line;
 *    with no room there: a smaller gap, then a slightly smaller arrow, still outside.
 *  - Otherwise (the outline leaves the usable rect on that side, or no room outside it) it sits at the usable EDGE on its
 *    line ("edge"): the outermost place inside the usable rect, clear of the obstacles and of the avoid points (never
 *    over a motor area), sliding inward along its line only as far as that needs; when its line has no such place it
 *    moves along the edge, the smallest shift either way (edgeShiftPx), up to 0.45 of the visible extent, keeping
 *    ARROW_LAYOUT.separationFrac x the visible outline's smaller extent from the arrows placed before it.
 *  - Nothing clear: the nearest place inside the usable rect on its line, flagged blocked.
 * Returns null without a usable outline, else { centre: [x, y] (the compass lines' crossing), box (outline bounds),
 *   visibleBox, leaves { forward, back, left, right }, hull, sizePx, gapPx, arrows: { forward | back | left | right:
 *   { dir, screen: [dx, dy], x, y (the arrow's base point on screen), outline: [x, y] (where its compass line leaves
 *   the outline), box: { x0, y0, x1, y1 } (footprint incl. the perspective allowance), clearancePx (footprint to outline,
 *   < 0 = over it), slidPx (inward from its first place), overOutline, onScreen, blocked, scale (1, or a shrink factor),
 *   gapUsedPx, edge (at the usable edge), edgeShiftPx (sideways along the edge, 0 = centred), overAvoid (cells) } } }.
 */
export function compassLayout(outline, opts = {}) {
  // R5-bigbrain (R25 + D1(d)): `prefer` (a rect, e.g. the comfortable look range) is tried first; an arrow that finds no
  // clear place inside it takes its place in the full usable rect instead (flag outsidePreferred), because "never over
  // a motor area, the panel or HUD" is a hard rule and the look range a preference.
  // A third tier, `fallbackObstacles` (e.g. the HUD cards' ACTUAL boxes instead of their reserved homes), is used only for
  // an arrow still blocked after the first two; a fourth lifts the inward-slide cap (ARROW_LAYOUT.edgeMaxSlideFrac).
  const { prefer = null, fallbackObstacles = null, ...rest } = opts || {};
  const W0 = rest.width, H0 = rest.height, m = (rest.rules || ARROW_LAYOUT).marginPx;
  const U0 = rest.usable || { x0: m, y0: m, x1: W0 - m, y1: H0 - m };
  const tiers = [];
  if (prefer && [prefer.x0, prefer.y0, prefer.x1, prefer.y1].every(isNum)) {
    const UP = { x0: Math.max(U0.x0, prefer.x0), y0: Math.max(U0.y0, prefer.y0), x1: Math.min(U0.x1, prefer.x1), y1: Math.min(U0.y1, prefer.y1) };
    if (UP.x1 - UP.x0 > 40 && UP.y1 - UP.y0 > 40) {
      tiers.push({ usable: UP, tier: 'preferred' });
      // R5-fix (review F6, D2 comfortable reach): still inside the comfortable look range, with the HUD cards' ACTUAL
      // boxes instead of their reserved homes (at 1280x720 the status card's home left the left arrow no place within
      // 40 deg; its actual box does), before leaving the range.
      if (Array.isArray(fallbackObstacles)) tiers.push({ usable: UP, obstacles: fallbackObstacles, tier: 'preferred' });
    }
  }
  tiers.push({ usable: U0, tier: 'usable' });
  if (Array.isArray(fallbackObstacles)) tiers.push({ usable: U0, obstacles: fallbackObstacles, tier: 'fallback' });
  // last: no cap on the inward slide (deeper over the glass rather than over a motor area)
  tiers.push({ usable: U0, obstacles: Array.isArray(fallbackObstacles) ? fallbackObstacles : null, rules: { ...(rest.rules || ARROW_LAYOUT), edgeMaxSlideFrac: null, edgeMaxShiftFrac: 0.45 }, tier: 'deep' });
  let out = null;
  for (const t of tiers) {
    // R5-fix (review F2): every tier keeps the FIRST tier's compass lines (an arrow taken from a later tier stays centred on
    // the same lines as the others; its own tier's usable rect only bounds where it may sit).
    const L = compassLayoutCore(outline, { ...rest, usable: t.usable, obstacles: t.obstacles || rest.obstacles, rules: t.rules || rest.rules || ARROW_LAYOUT, centre: out ? out.centre : null });
    if (!L) continue;
    if (!out) { out = L; for (const d of COMPASS_DIRS) { L.arrows[d].tier = t.tier; L.arrows[d].outsidePreferred = t.tier !== 'preferred' && tiers[0].tier === 'preferred'; } }
    else for (const d of COMPASS_DIRS) if (out.arrows[d].blocked && !L.arrows[d].blocked) out.arrows[d] = { ...L.arrows[d], tier: t.tier, outsidePreferred: tiers[0].tier === 'preferred' };
    if (COMPASS_DIRS.every(d => !out.arrows[d].blocked)) break;
  }
  return out;
}

function compassLayoutCore(outline, {
  width, height, sizePx, gapPx, design = ARROW_DESIGN, usable = null, obstacles = [], fit = 'slide', rules = ARROW_LAYOUT,
  avoid = null, avoidCellPx = 4, avoidDilate = 1, centre = null
} = {}) {
  if (!(width > 0 && height > 0)) fail('compassLayout needs width and height > 0');
  if (!(sizePx > 0) || !(gapPx >= 0)) fail('compassLayout needs sizePx > 0 and gapPx >= 0');
  const hull = Array.isArray(outline) && Array.isArray(outline[0]) ? convexHullPx(outline.flat()) : convexHullPx(outline);
  if (hull.length < 3) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of hull) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const U = usable || { x0: rules.marginPx, y0: rules.marginPx, x1: width - rules.marginPx, y1: height - rules.marginPx };
  const leaves = { forward: y0 < U.y0, back: y1 > U.y1, left: x0 < U.x0, right: x1 > U.x1 };
  const vis = { x0: Math.max(x0, U.x0), y0: Math.max(y0, U.y0), x1: Math.min(x1, U.x1), y1: Math.min(y1, U.y1) };
  const anyLeaves = COMPASS_DIRS.some(d => leaves[d]) && vis.x1 > vis.x0 && vis.y1 > vis.y0;
  const cx = centre && isNum(centre[0]) ? centre[0] : anyLeaves ? (vis.x0 + vis.x1) / 2 : (x0 + x1) / 2;
  const cy = centre && isNum(centre[1]) ? centre[1] : anyLeaves ? (vis.y0 + vis.y1) / 2 : (y0 + y1) / 2;
  const grid = avoid && typeof avoid.hits === 'function' ? avoid
    : avoid && avoid.length >= 2 ? occupancyGrid(avoid, { width, height, cellPx: avoidCellPx, dilate: avoidDilate }) : null;
  const fp = arrowPath(design).footprint, pa = rules.perspectiveAllowance;
  const inner = fp.uMin * sizePx * pa, outer = fp.uMax * sizePx * pa, half = fp.half * sizePx * pa;
  const boxAt = (e, bx, by, k = 1) => {
    // the footprint (scaled by k) along e from inner to outer, +- half across (axis-aligned because e is)
    const a = [bx + e[0] * inner * k, by + e[1] * inner * k], b = [bx + e[0] * outer * k, by + e[1] * outer * k];
    return e[0] !== 0
      ? { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: by - half * k, y1: by + half * k }
      : { x0: bx - half * k, x1: bx + half * k, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
  };
  // clearance of a footprint box from the outline: the smallest signed distance of its inner-edge points
  const clearance = box => {
    const pts = [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1], [(box.x0 + box.x1) / 2, box.y0], [(box.x0 + box.x1) / 2, box.y1], [box.x0, (box.y0 + box.y1) / 2], [box.x1, (box.y0 + box.y1) / 2]];
    let m = Infinity;
    for (const [x, y] of pts) m = Math.min(m, hullSignedDistance(hull, x, y));
    // a box that straddles the outline without any corner inside (a narrow outline end): test the centre line too
    if (m > 0 && hullSignedDistance(hull, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2) <= 0) m = -1;
    return m;
  };
  const overAvoid = box => (grid ? grid.hits(box) : 0);
  const okAt = box => boxInside(box, U) && !obstacles.some(o => o && boxOverlap(box, o)) && overAvoid(box) === 0;
  const arrows = {};
  // R5-bigbrain (R25): an arrow moved along the screen edge keeps this far from the arrows placed before it
  const sepBox = anyLeaves ? vis : { x0: Math.max(x0, 0), y0: Math.max(y0, 0), x1: Math.min(x1, width), y1: Math.min(y1, height) };
  const sep = (rules.separationFrac || 0) * Math.max(0, Math.min(sepBox.x1 - sepBox.x0, sepBox.y1 - sepBox.y0));
  const apart = (px, py) => COMPASS_DIRS.every(d => !arrows[d] || Math.hypot(arrows[d].x - px, arrows[d].y - py) >= sep);
  for (const dir of COMPASS_DIRS) {
    const e = COMPASS_SCREEN[dir];
    const O = hullExit(hull, cx, cy, e[0], e[1]) || [cx + e[0] * (x1 - x0) / 2, cy + e[1] * (y1 - y0) / 2];
    // the smallest distance t (from the outline point, along e) where a footprint keeps `gap` off the outline
    const tFor = (gap, k) => {
      let t = gap - inner * k, steps = 0;
      while (clearance(boxAt(e, O[0] + e[0] * t, O[1] + e[1] * t, k)) < gap - 0.5 && steps++ < rules.maxClearPx / rules.clearStepPx) t += rules.clearStepPx;
      return t;
    };
    const tIdeal = tFor(gapPx, 1);
    let bx = O[0] + e[0] * tIdeal, by = O[1] + e[1] * tIdeal, slid = 0, blocked = false, scale = 1, gapUsed = gapPx, edge = false, shift = 0;
    const placed = () => okAt(boxAt(e, bx, by, scale));
    if (fit === 'slide' && (leaves[dir] || !placed())) {
      let done = false;
      if (!leaves[dir]) {
        // 1) a smaller gap, 2) a slightly smaller arrow with that gap: still fully outside the outline
        const gMin = Math.min(gapPx, Math.max(rules.gapMinPx, rules.gapMinFrac * gapPx));
        const tries = [];
        for (let g = gapPx - 2; g >= gMin; g -= 2) tries.push([g, 1]);
        tries.push([gMin, 1]);
        for (const k of rules.shrink || []) tries.push([gMin, k]);
        for (const [g, k] of tries) {
          const t = tFor(g, k);
          if (okAt(boxAt(e, O[0] + e[0] * t, O[1] + e[1] * t, k))) { bx = O[0] + e[0] * t; by = O[1] + e[1] * t; gapUsed = g; scale = k; done = true; break; }
        }
      }
      if (!done) {
        // 3) R25 edge rule: the outermost place inside the usable rect on its line (the line through the visible
        //    middle), clear of obstacles and motor areas, sliding inward no further than the visible middle; failing
        //    that, the same on a line shifted along the edge (smallest shift first, alternating sides).
        edge = true; scale = 1; gapUsed = 0;
        const along = e[0] !== 0 ? 0 : 1; // the coordinate the arrow slides in (x for left / right, y for forward / back)
        const span = along === 0 ? [vis.y0, vis.y1] : [vis.x0, vis.x1];
        const lineAt = along === 0 ? cy : cx;
        // base coordinate (along e) of the outermost box inside U: its outer end on the U edge
        const edgeBase = along === 0 ? (e[0] > 0 ? U.x1 - outer : U.x0 + outer) : (e[1] > 0 ? U.y1 - outer : U.y0 + outer);
        const centreAlong = along === 0 ? cx : cy, sgn = along === 0 ? e[0] : e[1];
        const reach = Math.max(0, sgn * (edgeBase - centreAlong));
        const at = (c, line) => (along === 0 ? [c, line] : [line, c]);
        const st0 = rules.slideStepPx;
        // candidates in order of cost = edgeSlideCost x slide + |shift| (staying at the edge beats staying centred):
        // the first clear one wins
        const maxShift = 0.45 * Math.max(0, span[1] - span[0]), st = rules.slideStepPx, wS = rules.edgeSlideCost || 2;
        // the inward slide is capped at edgeMaxSlideFrac of the visible extent beyond the first place on the centred line
        // that clears the HUD obstacles (a card at the edge may push it in that far; a motor area may not push it deeper)
        const ext = along === 0 ? vis.x1 - vis.x0 : vis.y1 - vis.y0;
        let s0 = 0;
        while (s0 <= reach) { const [qx, qy] = at(edgeBase - sgn * s0, lineAt), bq = boxAt(e, qx, qy, 1); if (boxInside(bq, U) && !obstacles.some(o => o && boxOverlap(bq, o))) break; s0 += st0; }
        const maxSlide = Math.min(reach, isNum(rules.edgeMaxSlideFrac) && ext > 0 ? s0 + rules.edgeMaxSlideFrac * ext : reach);
        let found = null;
        // R5-fix (review F2 / P2, R20 "consistent, basically towards the top, bottom, left and right ... far apart"): first
        // on the centred compass line itself (sliding inward, then a slightly smaller arrow), and only then sideways along
        // the edge, at most edgeMaxShiftFrac of the visible extent (was 0.45: arrows ended in corners on 4:3 and portrait).
        const search = (k1, maxSh) => {
          // the inward slide is measured from the edge of the SCALED footprint (a smaller arrow can sit nearer the edge)
          const base1 = along === 0 ? (e[0] > 0 ? U.x1 - outer * k1 : U.x0 + outer * k1) : (e[1] > 0 ? U.y1 - outer * k1 : U.y0 + outer * k1);
          for (let cost = 0; cost <= wS * maxSlide + maxSh; cost += st) {
            for (let sl = 0; wS * sl <= cost && sl <= maxSlide; sl += st) {
              const k = cost - wS * sl;
              if (k > maxSh || (k % st) > 1e-9) continue;
              for (const sg of k === 0 ? [1] : [1, -1]) {
                const [px, py] = at(base1 - sgn * sl, lineAt + sg * k);
                if (okAt(boxAt(e, px, py, k1)) && apart(px, py)) { shift = sg * k; return { px, py, s: sl, k: k1 }; }
              }
            }
          }
          return null;
        };
        const shiftCap = isNum(rules.edgeMaxShiftFrac) ? rules.edgeMaxShiftFrac * Math.max(0, span[1] - span[0]) : maxShift;
        for (const k1 of [1, ...(rules.shrink || [])]) { found = search(k1, 0); if (found) break; }
        if (!found) for (const k1 of [1, ...(rules.shrink || [])]) { found = search(k1, shiftCap); if (found) break; }
        if (found) { bx = found.px; by = found.py; slid = found.s; scale = found.k; }
        else {
          // nothing clear: the outermost place on the centred line (inside the usable rect by construction), blocked
          blocked = true; shift = 0; slid = 0;
          [bx, by] = at(edgeBase, lineAt);
        }
      }
    }
    const box = boxAt(e, bx, by, scale), cl = clearance(box);
    arrows[dir] = {
      dir, screen: [e[0], e[1]], x: bx, y: by, outline: O, box, clearancePx: cl, slidPx: slid, overOutline: cl < 0, scale, gapUsedPx: gapUsed,
      onScreen: boxInside(box, { x0: 0, y0: 0, x1: width, y1: height }), blocked, edge, edgeShiftPx: shift, overAvoid: overAvoid(box)
    };
  }
  return { centre: [cx, cy], box: { x0, y0, x1, y1 }, visibleBox: anyLeaves ? vis : null, leaves, hull, sizePx, gapPx, arrows };
}

/* ------------------------------------------------------------------------------------------------ camera helpers */

/** Camera rotation (3x3 rows) for Three 'YXZ' yaw / pitch: R = Ry(yaw) Rx(pitch). */
export function cameraRotation(yaw = 0, pitch = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Ry = [[cy,0,sy],[0,1,0],[-sy,0,cy]], Rx = [[1,0,0],[0,cp,-sp],[0,sp,cp]]
  return [[cy, sy * sp, sy * cp], [0, cp, -sp], [-sy, cy * sp, cy * cp]];
}
const apply = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
const applyT = (R, v) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];

/** A camera for the pure helpers: { width, height (CSS px), fovYDeg } plus EITHER yaw / pitch (Three 'YXZ', camera at
 * `position`, default the origin: the first-person head) OR matrixWorld (the camera's column-major world matrix, e.g.
 * camera.matrixWorld.elements; any position and rotation, e.g. the third-person camera; no scale). */
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

/** Distance (m) along the line of sight from the eye (camera at the origin) through `centre` to the target's nearest
 * point: min over points of (p . n), n = centre / |centre|. points: flat source points + optional world matrix. */
export function nearestDepthAlong(points, matrix, centre) {
  const n = norm3(centre), m = matrix;
  let best = Infinity;
  for (let i = 0; i + 2 < points.length; i += 3) {
    let x = points[i], y = points[i + 1], z = points[i + 2];
    if (m) { const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Z = m[2] * x + m[6] * y + m[10] * z + m[14]; x = X; y = Y; z = Z; }
    const d = x * n[0] + y * n[1] + z * n[2];
    if (d < best) best = d;
  }
  return best;
}

/* ------------------------------------------------------------------------------------------------ 3D frames */

/**
 * World frames of the four arrows (pure). The layout is made in the REFERENCE view: the camera at the origin turned to
 * `ref` ({ yaw, pitch }: the default look carried with any brain grab, so the brain looks there exactly as at the
 * default look). Each anchor's base pixel is cast onto the plane through the target's centre perpendicular to the
 * line of sight (or, for an arrow over the outline, onto the plane frontMarginFrac x distance in front of the target's
 * nearest point, frontDepthM), then:
 *   d = the screen compass direction on that plane (outward), w = toward the eye, b = d x w (right-handed);
 *   scale = sizePx x the metres one CSS px covers there (across the line of sight).
 * design.viewTiltDeg > 0 turns the bend plane (w, b) about the stalk axis d by that angle, the same way for all four
 * (the toward-the-viewer part then shows toward screen direction design.viewTiltScreen, as if the eye saw the arrows a
 * little from the opposite side): the stalk stays exactly on its compass line, the bend stays a bend toward the viewer,
 * and the eye sees it a little from the side instead of exactly edge-on.
 * The result is anchored in the world: looking around moves it with the target; a grab or an orbit needs a new call.
 * Returns { forward | back | left | right: { dir, origin, d, w, b, scale, mpp, matrix (Float64Array(16), local design
 * units -> world), depthMode: 'centre' | 'front', distance } }.
 */
export function arrowFrames(layout, { cam, ref = { yaw: 0, pitch: 0 }, centre, frontDepthM = null, rules = ARROW_LAYOUT, design = ARROW_DESIGN } = {}) {
  if (!layout || !layout.arrows) fail('arrowFrames needs a compassLayout result');
  if (!Array.isArray(centre) && !(centre && centre.length === 3)) fail('arrowFrames needs the target centre (world)');
  const c = camOf({ ...cam, yaw: ref.yaw || 0, pitch: ref.pitch || 0, position: [0, 0, 0] });
  const Cw = [centre[0], centre[1], centre[2]];
  const Cc = applyT(c.R, Cw), dist = len3(Cc);
  if (!(dist > 0) || Cc[2] >= 0) fail('the target centre must be in front of the reference camera');
  const n = mul3(Cc, 1 / dist); // line of sight to the centre (camera space)
  const front = isNum(frontDepthM) && frontDepthM > 0 ? Math.max(1e-3, frontDepthM - rules.frontMarginFrac * dist) : null;
  const rayAt = (x, y) => norm3([((2 * x) / c.W - 1) * c.tanH * c.aspect, (1 - (2 * y) / c.H) * c.tanH, -1]);
  const onPlane = (x, y, D) => { const r = rayAt(x, y), k = D / dot3(n, r); return mul3(r, k); };
  const dz = { ...ARROW_DESIGN, ...design };
  const tilt = isNum(dz.viewTiltDeg) && dz.viewTiltDeg > 0 ? Math.min(60, dz.viewTiltDeg) * DEG : 0;
  const ts = dz.viewTiltScreen || [1, 1];
  const tiltS = norm3([ts[0], -ts[1], 0]); // screen (x right, y down) -> camera space (y up)
  const out = {};
  for (const dir of COMPASS_DIRS) {
    const a = layout.arrows[dir];
    if (!a) { out[dir] = null; continue; }
    const depthMode = a.overOutline && front !== null ? 'front' : 'centre';
    const D = depthMode === 'front' ? Math.min(front, dist) : dist;
    const X = onPlane(a.x, a.y, D);
    const step = 8;
    const X2 = onPlane(a.x + a.screen[0] * step, a.y + a.screen[1] * step, D);
    const w0 = norm3(mul3(X, -1));
    let d0 = sub3(X2, X);
    d0 = sub3(d0, mul3(w0, dot3(d0, w0)));
    const mpp = len3(d0) / step;
    const d = norm3(d0);
    let w = w0, b = cross3(d, w0);
    if (tilt > 0) {
      // turn (w, b) about d so the toward-the-viewer part shows toward the screen direction tiltS (camera space)
      const sg = dot3(b, tiltS) >= 0 ? 1 : -1, ct = Math.cos(tilt), st = Math.sin(tilt);
      w = add3(mul3(w0, ct), mul3(b, sg * st));
      b = cross3(d, w);
    }
    const s = layout.sizePx * (isNum(a.scale) && a.scale > 0 ? a.scale : 1) * mpp;
    const dW = apply(c.R, d), wW = apply(c.R, w), bW = apply(c.R, b), oW = apply(c.R, X);
    const matrix = new Float64Array(16);
    matrix.set([dW[0] * s, dW[1] * s, dW[2] * s, 0, wW[0] * s, wW[1] * s, wW[2] * s, 0, bW[0] * s, bW[1] * s, bW[2] * s, 0, oW[0], oW[1], oW[2], 1]);
    out[dir] = { dir, origin: oW, d: dW, w: wW, b: bW, scale: s, mpp, matrix, depthMode, distance: len3(X) };
  }
  return out;
}

/** A local design point (u, w, z) -> world under a frame (pure). */
/**
 * R5-fix (review code F1): the frames moved by a ROTATION about the eye R (rows, 3x3; the brain's carry while Space drags
 * it): every point, direction and the placement matrix turned by R (the plan in the carried reference view is unchanged,
 * so this equals a re-plan without its cost). Pure.
 */
export function rotateFrames(frames, R) {
  if (!frames) return frames;
  const ap = v => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
  const out = {};
  for (const [dir, f] of Object.entries(frames)) {
    if (!f) { out[dir] = f; continue; }
    const origin = ap(f.origin), d = ap(f.d), w = ap(f.w), b = ap(f.b), s = f.scale;
    const matrix = new Float64Array(16);
    matrix.set([d[0] * s, d[1] * s, d[2] * s, 0, w[0] * s, w[1] * s, w[2] * s, 0, b[0] * s, b[1] * s, b[2] * s, 0, origin[0], origin[1], origin[2], 1]);
    out[dir] = { ...f, origin, d, w, b, matrix };
  }
  return out;
}

export function frameToWorld(frame, p) {
  const m = frame.matrix;
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

/** World capsule chain of an arrow (shaft segments and the head as tapering pieces): [{ a, b, r }] in metres (pure). */
export function arrowCapsules(frame, design = ARROW_DESIGN) {
  const path = arrowPath(design), s = frame.scale, out = [];
  const S = path.samples;
  for (let i = 0; i + 1 < S.length; i++) out.push({ a: frameToWorld(frame, [S[i].u, S[i].w, 0]), b: frameToWorld(frame, [S[i + 1].u, S[i + 1].w, 0]), r: Math.max(S[i].r, S[i + 1].r) * s });
  const H = path.head, k = 4;
  for (let i = 0; i < k; i++) {
    const f0 = i / k, f1 = (i + 1) / k;
    const p0 = [H.base[0] + H.axis[0] * H.length * f0, H.base[1] + H.axis[1] * H.length * f0, 0];
    const p1 = [H.base[0] + H.axis[0] * H.length * f1, H.base[1] + H.axis[1] * H.length * f1, 0];
    out.push({ a: frameToWorld(frame, p0), b: frameToWorld(frame, p1), r: H.radius * (1 - f0) * s });
  }
  return out;
}

/** Closest approach between the ray o + t d (t >= 0, d unit) and the segment a-b: { dist, t }. Pure. */
export function raySegment(o, d, a, b) {
  const u = sub3(b, a), w0 = sub3(o, a);
  const A = 1, B = dot3(d, u), C = dot3(u, u), D = dot3(d, w0), E = dot3(u, w0);
  const den = A * C - B * B;
  let t, s;
  if (den > 1e-12 * C) { t = (B * E - C * D) / den; s = (A * E - B * D) / den; } else { t = 0; s = C > 0 ? E / C : 0; }
  // clamp s to the segment, then recompute t; clamp t >= 0, then recompute s
  s = clamp(s, 0, 1);
  t = Math.max(0, dot3(sub3(add3(a, mul3(u, s)), o), d));
  if (C > 0) s = clamp(dot3(sub3(add3(o, mul3(d, t)), a), u) / C, 0, 1);
  const p = add3(o, mul3(d, t)), q = add3(a, mul3(u, s));
  return { dist: len3(sub3(p, q)), t };
}

/**
 * The arrow hit by a world ray (pure): { dir, t (m along the ray), dist } of the nearest hit, or null.
 *  ray: { origin, dir } (pixelRay, or the crosshair); frames: arrowFrames(); padPx: extra screen padding (converted at
 *  each arrow's own scale, so a small target is still easy to hit); occluderT: a distance (m) along the same ray at
 *  which something opaque to picking is hit (e.g. the brain glass in front of the mirror body's arrows): arrows
 *  farther than it are not returned; only: optional subset of dirs (e.g. the arrows drawn now).
 */
export function pickArrows(ray, frames, { design = ARROW_DESIGN, padPx = ARROW_LAYOUT.pickPadPx, occluderT = Infinity, only = null, capsules = null } = {}) {
  if (!ray || !frames) return null;
  const o = ray.origin, d = norm3(ray.dir);
  let best = null;
  for (const dir of COMPASS_DIRS) {
    const f = frames[dir];
    if (!f || (only && !only.includes(dir))) continue;
    const caps = (capsules && capsules[dir]) || arrowCapsules(f, design);
    const pad = padPx * f.mpp;
    for (const c of caps) {
      const h = raySegment(o, d, c.a, c.b);
      // padding grows with distance from the anchor's own depth only slightly; keep it simple (anchor scale)
      if (h.dist <= c.r + pad && h.t < occluderT && (!best || h.t < best.t)) best = { dir, t: h.t, dist: h.dist };
    }
  }
  return best;
}

/** Every arrow a world ray hits, nearest first (pure): [{ dir, t, dist }] (same options as pickArrows except
 * occluderT, which the caller applies, e.g. ns-controls resolveArrowHit with the brain's distance). One entry per arrow. */
export function pickArrowHits(ray, frames, { design = ARROW_DESIGN, padPx = ARROW_LAYOUT.pickPadPx, only = null, capsules = null } = {}) {
  const out = [];
  if (!ray || !frames) return out;
  for (const dir of COMPASS_DIRS) {
    if (!frames[dir] || (only && !only.includes(dir))) continue;
    const h = pickArrows(ray, frames, { design, padPx, only: [dir], capsules });
    if (h) out.push(h);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** On-screen box (CSS px) of an arrow drawn under `cam` (pure): projected centre line, rings and head with their
 * projected radii. null when any part is behind the camera. */
export function arrowScreenBox(frame, cam, design = ARROW_DESIGN) {
  if (!frame) return null;
  const path = arrowPath(design), c = camOf(cam);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pxPerM = d => c.H / (2 * d * c.tanH);
  const addPt = (p, rM) => {
    const q = projectWorldPx(p, cam);
    if (!(q.depth > 0)) return false;
    const r = rM * pxPerM(q.depth);
    x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r); y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r);
    return true;
  };
  for (const p of path.samples) if (!addPt(frameToWorld(frame, [p.u, p.w, 0]), p.r * frame.scale)) return null;
  const H = path.head;
  if (!addPt(frameToWorld(frame, [H.base[0], H.base[1], 0]), H.radius * frame.scale)) return null;
  if (!addPt(frameToWorld(frame, [H.tip[0], H.tip[1], 0]), 0)) return null;
  return { x0, y0, x1, y1 };
}

/**
 * One call for the whole plan (pure): project the target's outline points in the reference view, lay out the compass
 * anchors and build the world frames.
 *  points: flat outline / support points (source units) with `matrix` (column-major world-from-source; null = world);
 *  centre: the target centre in world metres (the carried pivot); ref: the reference look { yaw, pitch };
 *  cam: { width, height, fovYDeg }; kind: 'brain' | 'mirror' (sizes) or { sizePx, gapPx }; usable, obstacles, fit: as
 *  compassLayout; front: true (default) = compute frontDepthM from the points for arrows that slid over the outline;
 *  avoidPoints (R5-bigbrain, R25): flat source points under the same matrix (the brain's motor areas) that an arrow at
 *  the screen edge must not cover (compassLayout avoid; grid cell avoidCellPx, dilation avoidDilate cells; with
 *  avoidIndices their triangles are filled), or `avoid`:
 *  a ready occupancyGrid in this view (e.g. the brain's motor areas in front of the mirror body's arrows).
 * Returns { layout, frames, sizes, behind } or null (no outline in front of the reference camera).
 */
export function planCompassArrows({ points, matrix = null, centre, ref = { yaw: 0, pitch: 0 }, cam, kind = 'brain', design = ARROW_DESIGN, usable = null, obstacles = [], fit = 'slide', front = true, avoidPoints = null, avoidIndices = null, avoidCellPx = 4, avoidDilate = 1, avoid: avoidGrid = null, prefer = null, fallbackObstacles = null } = {}) {
  const refCam = { ...cam, yaw: ref.yaw || 0, pitch: ref.pitch || 0, position: [0, 0, 0] };
  const { xy, behind } = projectPointsPx(points, matrix, refCam);
  if (behind > 0) return null;
  const sizes = kind && typeof kind === 'object' && isNum(kind.sizePx) ? { sizePx: kind.sizePx, gapPx: kind.gapPx } : arrowSizePx(cam, kind);
  // R5-bigbrain (R25): the motor areas' sample points (same matrix and reference view) an edge arrow must not cover.
  const avoid = avoidGrid && typeof avoidGrid.hits === 'function' ? avoidGrid : avoidPoints && avoidPoints.length >= 3 ? occupancyGrid(projectPointsPx(avoidPoints, matrix, refCam).xy, { width: cam.width, height: cam.height, cellPx: avoidCellPx, dilate: avoidDilate, indices: avoidIndices }) : null;
  const layout = compassLayout(xy, { width: cam.width, height: cam.height, ...sizes, design, usable, obstacles, fit, avoid, prefer, fallbackObstacles });
  if (!layout) return null;
  const needFront = front && COMPASS_DIRS.some(d => layout.arrows[d].overOutline);
  const frontDepthM = needFront ? nearestDepthAlong(points, matrix, centre) : null;
  const frames = arrowFrames(layout, { cam, ref, centre, frontDepthM, design });
  return { layout, frames, sizes, behind, frontDepthM };
}

/* ------------------------------------------------------------------------------------------------ THREE rig */

const VERT = `
attribute float nsAlong;
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  vAlong = nsAlong;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform vec3 uBase;
uniform vec3 uTip;
uniform vec3 uHoverCol;
uniform vec3 uRim;
uniform vec3 uLight;
uniform vec3 uFill;
uniform vec4 uK; // ambient, diffuse, fill, specular
uniform vec2 uS; // shininess, rim strength
uniform float uHover;
uniform float uAttn;
uniform float uBlocked;
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  vec3 L = normalize(uLight);
  float diff = max(dot(N, L), 0.0);
  float fill = max(dot(N, normalize(uFill)), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), uS.x);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  vec3 albedo = mix(uBase, uTip, smoothstep(0.0, 1.0, vAlong));
  albedo = mix(albedo, uHoverCol, 0.55 * uHover);
  albedo = mix(albedo, vec3(dot(albedo, vec3(0.3333))) * 0.55, uBlocked); // covered: grey and dim
  float lit = uK.x + uK.y * diff + uK.z * fill + 0.25 * uAttn;
  vec3 col = albedo * lit + vec3(spec) * uK.w * (1.0 + 0.5 * uHover) + uRim * rim * uS.y * (1.0 + 1.2 * uHover + uAttn);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const OUTLINE_VERT = `
uniform float uW;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uW, 1.0);
}`;
const OUTLINE_FRAG = `
uniform vec3 uCol;
void main() {
  gl_FragColor = vec4(uCol, 1.0);
  #include <colorspace_fragment>
}`;
const XRAY_FRAG = `
uniform vec3 uCol;
uniform vec3 uEdge;
uniform float uOpacity;
uniform float uHover;
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
void main() {
  // light inside, dark edge: findable over the red muscles and over the pale bones alike
  float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 1.5);
  vec3 c = mix(uCol, uEdge, smoothstep(0.45, 0.95, rim));
  gl_FragColor = vec4(c, min(1.0, uOpacity * (1.0 + 0.6 * uHover)) * (0.75 + 0.25 * rim));
  #include <colorspace_fragment>
}`;

/**
 * THREE rig of four arrows sharing one geometry (browser; THREE passed in, r150+: BufferGeometry, ShaderMaterial,
 * Mesh, Group, Object3D, Color, GreaterDepth).
 *  kind: 'brain' | 'mirror' (only a name and the default x-ray choice); xray: the faint see-through copy where an
 *  opaque thing (the arm) is in front (default true for 'brain', false for 'mirror': the mirror body's arrows sit
 *  behind the brain glass and are seen through it anyway).
 * Returns { group, arrows: { dir: { root, mesh, xray, material } }, setFrames(frames), setHover(dir | null),
 *   setAttention(0..1), setVisible(bool), hovered, geometry, dispose() }. The rig never moves by itself: setFrames
 *   with the plan whenever the target's transform, the view size or the reference look changes.
 */
export function createArrowRig(THREE, { kind = 'brain', design = ARROW_DESIGN, look = ARROW_LOOK, xray = kind === 'brain', name = null } = {}) {
  if (!THREE || typeof THREE.BufferGeometry !== 'function' || typeof THREE.ShaderMaterial !== 'function') fail('createArrowRig needs THREE with BufferGeometry and ShaderMaterial');
  const g = buildArrowGeometry(design);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geometry.setAttribute('nsAlong', new THREE.BufferAttribute(g.along, 1));
  geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
  geometry.computeBoundingSphere();
  const col = hex => new THREE.Color(hex);
  const group = new THREE.Group();
  group.name = name || `ns-arrows3d (${kind}: 3D compass orbit arrows)`;
  const arrows = {};
  const materials = [];
  for (const dir of COMPASS_DIRS) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uBase: { value: col(look.base) }, uTip: { value: col(look.tip) }, uHoverCol: { value: col(look.hover) }, uRim: { value: col(look.rim) },
        uLight: { value: new THREE.Vector3(...look.lightDir) }, uFill: { value: new THREE.Vector3(...look.fillDir) },
        uK: { value: new THREE.Vector4(look.ambient, look.diffuse, look.fill, look.specular) }, uS: { value: new THREE.Vector2(look.shininess, look.rimStrength) },
        uHover: { value: 0 }, uAttn: { value: 0 }, uBlocked: { value: 0 }
      }
    });
    materials.push(material);
    const root = new THREE.Object3D();
    root.name = `ns-arrow3d-${dir}`;
    root.matrixAutoUpdate = false;
    root.visible = false;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ns-arrow3d-${dir}-solid`;
    mesh.renderOrder = look.renderOrder;
    mesh.frustumCulled = false;
    mesh.userData.nsOrbit = dir;
    root.add(mesh);
    // A thin dark outline (inflated back faces): where the near head crosses the far stalk, its edge shows which is in
    // front (the occlusion cue for the bend toward the viewer).
    if (look.outline > 0 && THREE.BackSide !== undefined) {
      const omat = new THREE.ShaderMaterial({ vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, side: THREE.BackSide, uniforms: { uW: { value: look.outline }, uCol: { value: col(look.outlineColor) } } });
      materials.push(omat);
      const om = new THREE.Mesh(geometry, omat);
      om.name = `ns-arrow3d-${dir}-outline`;
      om.renderOrder = look.renderOrder;
      om.frustumCulled = false;
      mesh.add(om);
    }
    let xm = null;
    if (xray && THREE.GreaterDepth !== undefined) {
      const xmat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: XRAY_FRAG, transparent: true, depthWrite: false,
        uniforms: { uCol: { value: col(look.xrayColor) }, uEdge: { value: col(look.outlineColor) }, uOpacity: { value: look.xrayOpacity }, uHover: { value: 0 } }
      });
      xmat.depthFunc = THREE.GreaterDepth; // drawn only where something nearer (the arm) hides the arrow
      materials.push(xmat);
      xm = new THREE.Mesh(geometry, xmat);
      xm.name = `ns-arrow3d-${dir}-seethrough`;
      xm.renderOrder = look.xrayRenderOrder;
      xm.frustumCulled = false;
      mesh.add(xm); // inherits the hover scale
    }
    group.add(root);
    arrows[dir] = { root, mesh, xray: xm, material };
  }
  let hovered = null, hoverBlocked = false, visible = true;
  const dimmed = { forward: false, back: false, left: false, right: false }; // R5-polish: setDimmed
  const rig = {
    group, arrows, geometry, kind,
    get hovered() { return hovered; },
    /** Place the arrows (arrowFrames result; a missing / null entry hides that arrow). */
    setFrames(frames) {
      for (const dir of COMPASS_DIRS) {
        const a = arrows[dir], f = frames && frames[dir];
        if (!f) { a.root.visible = false; continue; }
        a.root.matrix.fromArray(f.matrix);
        a.root.matrixWorldNeedsUpdate = true;
        a.root.visible = visible;
      }
    },
    /** Highlight one arrow (crosshair or pointer over it) or none. */
    /** Highlight one arrow (crosshair or pointer over it) or none. { blocked: true } = it is under the look but cannot
     * be used now (a mirror-body arrow with the brain in front): shown greyed, not enlarged. */
    setHover(dir, { blocked = false } = {}) {
      hovered = COMPASS_DIRS.includes(dir) ? dir : null;
      hoverBlocked = Boolean(hovered && blocked);
      for (const d of COMPASS_DIRS) {
        const on = d === hovered, u = arrows[d].material.uniforms;
        u.uHover.value = on && !hoverBlocked ? 1 : 0;
        u.uBlocked.value = on && hoverBlocked ? 1 : dimmed[d] ? COVERED_DIM : 0;
        if (arrows[d].xray) arrows[d].xray.material.uniforms.uHover.value = on && !hoverBlocked ? 1 : 0;
        arrows[d].mesh.scale.setScalar(on && !hoverBlocked ? look.hoverScale : 1);
      }
      return hovered;
    },
    get hoverBlocked() { return hoverBlocked; },
    /** R5-polish (D19): arrows that cannot be used now (a mirror-body arrow the glass brain covers) are drawn half greyed
     * (COVERED_DIM of the covered-hover look) even when not under the look, so they read as "not yet" and turn their full
     * colour once the brain is dragged away. map: { dir: true } (others false). Returns the dimmed dirs. */
    setDimmed(map = {}) {
      let changed = false;
      for (const d of COMPASS_DIRS) { const v = Boolean(map && map[d]); if (dimmed[d] !== v) { dimmed[d] = v; changed = true; } }
      if (changed) for (const d of COMPASS_DIRS) {
        const on = d === hovered, u = arrows[d].material.uniforms;
        u.uBlocked.value = on && hoverBlocked ? 1 : dimmed[d] ? COVERED_DIM : 0;
      }
      return COMPASS_DIRS.filter(d => dimmed[d]);
    },
    get dimmed() { return COMPASS_DIRS.filter(d => dimmed[d]); },
    /** A soft extra glow on all four (0..1), e.g. while the "Try this" goal asks for an orbit. */
    setAttention(x) { const v = clamp(Number(x) || 0, 0, 1); for (const d of COMPASS_DIRS) arrows[d].material.uniforms.uAttn.value = v; return v; },
    setVisible(on) { visible = on !== false; for (const d of COMPASS_DIRS) if (!visible) arrows[d].root.visible = false; return visible; },
    dispose() { geometry.dispose(); for (const m of materials) m.dispose(); if (group.parent) group.parent.remove(group); }
  };
  return rig;
}
