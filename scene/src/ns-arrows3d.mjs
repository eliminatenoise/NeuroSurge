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
 *      plane (the stalk, exactly on its compass line), then bends AWAY FROM THE VIEWER, into the scene, and back
 *      INWARD (an arc of bendDeg = 150), and ends in a broad head that points away from the viewer and inward, so the
 *      arrow curls round behind its side of the target (arrow-depth note R20, NEUROSURGE-ARROW-DEPTH-GENUINE-SOURCE-R20:
 *      "They shouldn't bend around to the individual. They should bend around away from the individual."; it replaces
 *      the earlier bend toward the viewer). Read as the path your view takes over that side (top arrow: up over the
 *      top); each arrow still asks for the same orbit as before. Seen exactly from the eye a bend away from the eye is
 *      edge-on and folds onto itself (a "pin"); so the bend plane is turned viewTiltDeg = 25 deg about the stalk, the
 *      same way for all four (top / bottom hooks show to the right, left / right hooks show downward, the same screen
 *      sides as before R20). The 3D bend is then read from the overlap (the near stalk crosses in front of the far
 *      head, with a dark outline), the light and shade, a shaft that thins away from the viewer and a brightness ramp
 *      from the bright near base to the dimmer far head. arrowFrames() returns a world matrix per arrow (right-handed,
 *      d x w = b, so the mesh winding and normals carry over). The anchor plane is the target's centre plane (a sphere
 *      around the target, at its middle depth); an arrow that had to slide over the outline is moved toward the eye
 *      along its own sight lines (the same picture on screen) until its DEEPEST point, the far head, lies in FRONT of
 *      the target's nearest point (frontDepthM), so it never touches the target in 3D.
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

/** The four arrows (same names and order as ns-scene-three ORBIT_ARROWS.dirs and ns-app orbit requests). */
export const COMPASS_DIRS = freeze(['forward', 'back', 'left', 'right']);
/** Screen direction of each arrow from the target's middle (CSS px, y down): forward = top, back = bottom. */
export const COMPASS_SCREEN = freeze({ forward: freeze([0, -1]), back: freeze([0, 1]), left: freeze([-1, 0]), right: freeze([1, 0]) });

/**
 * Arrow shape in DESIGN UNITS (1 unit = sizePx on screen at the anchor). Local axes: x = u (outward, the compass
 * direction), y = w (AWAY from the viewer, into the scene, as arrowFrames places it since the arrow-depth note R20),
 * z = across. Stalk: straight from u = 0 to u = stalk. Bend: circle of radius bendRadius whose centre is at (stalk,
 * bendRadius), swept bendDeg from the outward direction away from the viewer and beyond (150 deg: the head then points
 * 60 deg inward of "away from the viewer"). Shaft radius goes from shaftR0 (near base) to shaftR1 (far end of the bend):
 * thinner far away, the cue perspective gives (R20 swapped the two values of the old toward-the-viewer bend, 0.085 ->
 * 0.14; the swap follows that design's own rule and has not yet been chosen by viewing). section: 'round' | 'flat' (a
 * ribbon, flatRatio
 * thick). Head on the end tangent, starting headInset before the bend's end: 'flat' = a broad elliptical cone
 * (headRadius across, headRadius x headFlat in the bend plane), 'cone' = a round cone. Segments set the polygon count.
 * viewTiltDeg / viewTiltScreen: the bend plane's turn about the stalk (arrowFrames). Display choices, chosen by viewing
 * variants (round5/R5-arrows-NOTES.md, harness/run-R5-arrows-lab-1).
 */
export const ARROW_DESIGN = freeze({
  // R558 (genuine notes R29 + R32; a game-design choice under the R34 authority): a PAPER / SILK RIBBON arrow instead
  // of the round hook. Wide and thin, broad at the tail ("thicker towards the back"), tapering to a narrow neck, then a
  // broad pointed arrowhead. It leaves the target outward and bends FORWARD, away from the player into the scene
  // (the R20 direction), by bendDeg = 68 on a wide arc: it curls away without doubling back toward the target, which
  // the 150 degree hook did, and the arrowhead still shows its broad face to the player (a head bent a full right
  // angle away is seen edge-on and no longer reads as an arrow; tried at 100 degrees in the browser and rejected).
  // Sizes are design units (1 unit = sizePx on screen at the anchor): shaftR0 / shaftR1 are now the ribbon's
  // HALF WIDTH at the tail / at the neck, headRadius the arrowhead's half width; thickness0 / thickness1 the ribbon's
  // full thickness at the tail / at the head (a little body, like raised lettering, not a round tube); tailNotch the
  // depth of the swallow-tail cut in the tail edge. Display choices, viewed in the browser; no anatomy is implied.
  stalk: 0.4, bendRadius: 0.62, bendDeg: 68, shaftR0: 0.36, shaftR1: 0.15, headLength: 0.7, headRadius: 0.47, headInset: 0,
  section: 'ribbon', flatRatio: 0.45, head: 'flat', headFlat: 0.5, thickness0: 0.085, thickness1: 0.04, tailNotch: 0.15,
  radialSegments: 14, stalkSegments: 4, bendSegments: 18, capRings: 3,
  viewTiltDeg: 25, viewTiltScreen: freeze([1, 1])
});
/** The round bent tube used before R558 (kept so the old shape can still be built and compared). */
export const ARROW_DESIGN_ROUND_R20 = freeze({
  stalk: 0.5, bendRadius: 0.38, bendDeg: 150, shaftR0: 0.14, shaftR1: 0.085, headLength: 0.5, headRadius: 0.29, headInset: 0.03,
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
  // R558 (R29 "thicker / easier to click", R32 "much thicker"): larger units; the ribbon is also about 0.9 units wide.
  brain: freeze({ sizeFrac: 0.09, minPx: 38, maxPx: 84, gapCm: 0.5, gapMinFrac: 0.012, gapMaxFrac: 0.03 }),
  mirror: freeze({ sizeFrac: 0.046, minPx: 22, maxPx: 44, gapCm: 0.2, gapMinFrac: 0.006, gapMaxFrac: 0.014 })
});
export const PX_PER_CM = 96 / 2.54;

/** Layout rules: screen margin, slide step, the perspective allowance on the footprint (written for the old bend toward
 * the viewer, whose near head was drawn up to about 10 % larger than the anchor scale; since the arrow-depth note R20
 * the far head is drawn a little smaller, so it is now spare room), the outline-clearance search step and the hover /
 * pick padding. Before an
 * arrow slides over the outline it first tries a smaller gap (down to gapMinFrac x gapPx, at least gapMinPx), then a
 * slightly smaller arrow (shrink factors, with the small gap). R5-bigbrain (R25): an arrow at the screen edge prefers a
 * sideways shift along the edge to sliding inward (edgeSlideCost: 1 px inward costs as much as this many px sideways)
 * and keeps at least separationFrac x the smaller extent of the visible outline from the arrows placed before it (the
 * compass order forward, back, left, right), so the four stay far apart; it slides inward at most edgeMaxSlideFrac of the
 * visible extent (further in it would leave its side), else it counts as blocked and the next tier is tried. */
export const ARROW_LAYOUT = freeze({ marginPx: 8, slideStepPx: 2, perspectiveAllowance: 1.1, clearStepPx: 1, maxClearPx: 400, pickPadPx: 12, frontMarginFrac: 0.03, gapMinFrac: 0.4, gapMinPx: 8, shrink: freeze([0.85, 0.75]), edgeSlideCost: 2, separationFrac: 0.4, edgeMaxSlideFrac: 0.15 });

/**
 * Look (display choices; sRGB hex). `base` is the dim cool grey of the FAR end, `tip` the bright near-white of the NEAR
 * end (far = dimmer, near = brighter). Since the arrow-depth note R20 the head is the far end, so FRAG draws `tip` at
 * the base and `base` at the head (the names stay for ns-colors arrowLook overrides). Hover: warm white, 12 % larger,
 * stronger rim (not colour alone). Neither is the activity ramp, the
 * left-arm light blue or the gold "switched on" mark. lightDir / fillDir are VIEW-space directions (x right, y up,
 * z toward the viewer). xrayOpacity: the see-through copy where the arm covers the arrow.
 */
export const ARROW_LOOK = freeze({
  base: 0x6f7c8c, tip: 0xd5dde8, hover: 0xfff1cf, rim: 0xcfe0ff,
  lightDir: freeze([-0.45, 0.75, 0.55]), fillDir: freeze([0.6, -0.25, 0.45]),
  // R558: a soft paper / silk look (matte, a faint sheen) and, above all, TRANSLUCENT: opacity is how solid the ribbon
  // is at rest ("much more translucent", R29; "less obvious", R32), hoverOpacity under the crosshair / pointer, so the
  // arrow is easy to find the moment you aim at it and stays out of the way otherwise. No dark outline shell any more
  // (an opaque outline behind a see-through ribbon reads as a dark blob); the ribbon's own edge is drawn a little
  // brighter instead (edgeGlow). renderOrder is set per target by the scene (see its transparent draw order).
  ambient: 0.46, diffuse: 0.5, fill: 0.22, specular: 0.16, shininess: 18, rimStrength: 0.35,
  opacity: 0.3, hoverOpacity: 0.72, blockedOpacity: 0.16, edgeGlow: 0.5,
  hoverScale: 1.06, xrayOpacity: 0.16, xrayColor: 0xe9eff7, renderOrder: 30, xrayRenderOrder: 31,
  outline: 0, outlineColor: 0x0a0e15
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
 * across) and the largest offset along w (away from the viewer since the arrow-depth note R20). The centre line is
 * planar (u, w), so seen exactly from the eye it projects onto the u axis.
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
  const ribbon = d.section === 'ribbon';
  const th0 = ribbon && isNum(d.thickness0) && d.thickness0 > 0 ? d.thickness0 : 0.08, th1 = ribbon && isNum(d.thickness1) && d.thickness1 > 0 ? d.thickness1 : 0.04;
  // Ribbon: r is the half WIDTH (across), rN the half THICKNESS (in the bend plane), thinning from the tail to the head.
  for (const p of samples) { const k = smooth(clamp(p.s, 0, 1)); p.r = d.shaftR0 + (d.shaftR1 - d.shaftR0) * k; p.rN = ribbon ? 0.5 * (th0 + (th1 - th0) * k) : p.r * flat; p.along = 0.82 * p.s; }
  const end = samples[samples.length - 1];
  const axis = [end.tu, end.tw];
  const base = [end.u - d.headInset * axis[0], end.w - d.headInset * axis[1]];
  const tip = [base[0] + d.headLength * axis[0], base[1] + d.headLength * axis[1]];
  const shape = d.head === 'flat' ? 'flat' : 'cone';
  const thickness = ribbon ? 0.5 * th1 : shape === 'flat' ? d.headRadius * clamp(isNum(d.headFlat) ? d.headFlat : 0.35, 0.05, 1) : d.headRadius;
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
  // A view tilt turns the bend plane about the stalk by viewTiltDeg: the part bent along w then shows sideways by
  // up to sin(tilt) x wMax on screen (conservative: added to both sides of the across extent).
  const side = isNum(d.viewTiltDeg) && d.viewTiltDeg > 0 ? Math.sin(d.viewTiltDeg * DEG) * wMax : 0;
  half += side;
  return {
    samples, design: d, flat, side, ribbon,
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
 * Tube + cap + head geometry in design units (pure typed arrays, local axes x = outward, y = away from the viewer once
 * placed by arrowFrames (arrow-depth note R20), z = across): { positions: Float32Array, normals: Float32Array, along:
 * Float32Array (0 at the base .. 1 at the head tip, for the near-to-far brightness ramp), indices: Uint16Array,
 * vertexCount, triangleCount }. Every triangle is
 * wound counter-clockwise seen from outside (its geometric normal agrees with its vertex normals).
 */
export function buildArrowGeometry(design = ARROW_DESIGN) {
  const path = arrowPath(design), d = path.design, flat = path.flat;
  if (path.ribbon) return buildRibbonGeometry(path);
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

/**
 * R558 paper-ribbon arrow (pure typed arrays; same local axes and return shape as buildArrowGeometry, plus `across`:
 * -1 at one edge of the ribbon, 0 on its middle line, +1 at the other edge, for the brighter paper edge). A thin closed
 * solid: a near face (toward the viewer on the straight part), a far face, two side walls, a swallow-tail end and an
 * arrowhead with square shoulders that is straight along the end tangent. Cross-sections follow arrowPath's samples
 * (half width r, half thickness rN), so layout boxes and click capsules made from the same path match what is drawn.
 */
function buildRibbonGeometry(path) {
  const d = path.design, S = path.samples, H = path.head;
  const pos = [], nor = [], alo = [], acr = [], idx = [];
  const vert = (p, n, a, c) => { const m = norm3(n); pos.push(p[0], p[1], p[2]); nor.push(m[0], m[1], m[2]); alo.push(a); acr.push(c); return pos.length / 3 - 1; };
  const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  const tri = (a, b, c, want) => { const n = cross3(sub3(P(b), P(a)), sub3(P(c), P(a))); if (dot3(n, want) >= 0) idx.push(a, b, c); else idx.push(a, c, b); };
  const quad = (a, b, c, e, want) => { tri(a, b, c, want); tri(a, c, e, want); };
  // Cross-sections: centre c = (u, w), tangent t, half width r, half thickness h, colour ramp position `along`.
  const xs = S.map(p => ({ c: [p.u, p.w], t: [p.tu, p.tw], r: p.r, h: p.rN, along: p.along }));
  const neck = xs[xs.length - 1];
  xs.push({ c: [H.base[0], H.base[1]], t: [H.axis[0], H.axis[1]], r: H.radius, h: neck.h, along: 0.86 }); // the head's shoulders
  xs.push({ c: [H.tip[0], H.tip[1]], t: [H.axis[0], H.axis[1]], r: 0, h: neck.h * 0.6, along: 1 });       // its point
  // Swallow-tail: the middle of the tail edge is cut `notch` into the ribbon (never past the straight part).
  const notch = clamp(isNum(d.tailNotch) ? d.tailNotch : 0, 0, d.stalk * 0.9);
  const rings = xs.map(x => {
    const T = [x.t[0], x.t[1], 0], N = [-x.t[1], x.t[0], 0];
    const mid = x.c[1] === 0 && x.t[1] === 0 && x.c[0] < notch ? [notch, 0] : x.c; // straight part only: u is the arc length
    const at = (c, n, z) => [c[0] + n * N[0], c[1] + n * N[1], z];
    const nearN = [-N[0], -N[1], 0], farN = [N[0], N[1], 0];
    return { x, T, N,
      nL: vert(at(x.c, -x.h, -x.r), nearN, x.along, -1), nM: vert(at(mid, -x.h, 0), nearN, x.along, 0), nR: vert(at(x.c, -x.h, x.r), nearN, x.along, 1),
      fL: vert(at(x.c, x.h, -x.r), farN, x.along, -1), fM: vert(at(mid, x.h, 0), farN, x.along, 0), fR: vert(at(x.c, x.h, x.r), farN, x.along, 1) };
  });
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i], B = rings[i + 1];
    const nearW = mul3(add3(A.N, B.N), -1), farW = add3(A.N, B.N);
    quad(A.nL, A.nM, B.nM, B.nL, nearW); quad(A.nM, A.nR, B.nR, B.nM, nearW);
    quad(A.fL, A.fM, B.fM, B.fL, farW); quad(A.fM, A.fR, B.fR, B.fM, farW);
    // Side walls with their own vertices (a crisp paper edge). Outward normal in the (T, across) plane: sideways for a
    // parallel stretch, backward where the ribbon widens (the head's shoulders), forward where it narrows.
    const dC = len3([B.x.c[0] - A.x.c[0], B.x.c[1] - A.x.c[1], 0]), dr = B.x.r - A.x.r;
    const T = norm3(add3(A.T, B.T));
    for (const side of [-1, 1]) {
      const n = add3(mul3(T, -dr), [0, 0, side * dC]);
      if (len3(n) < 1e-9) continue;
      const a0 = vert(P(side < 0 ? A.nL : A.nR), n, A.x.along, side), a1 = vert(P(side < 0 ? A.fL : A.fR), n, A.x.along, side);
      const b0 = vert(P(side < 0 ? B.nL : B.nR), n, B.x.along, side), b1 = vert(P(side < 0 ? B.fL : B.fR), n, B.x.along, side);
      quad(a0, a1, b1, b0, n);
    }
  }
  // Tail end: two small walls into the notch (one flat wall when there is no notch).
  const A = rings[0], r0 = A.x.r;
  for (const side of [-1, 1]) {
    const n = [-r0, 0, -side * notch];
    const e0 = vert(P(side < 0 ? A.nL : A.nR), n, 0, side), e1 = vert(P(side < 0 ? A.fL : A.fR), n, 0, side);
    const m0 = vert(P(A.nM), n, 0, 0), m1 = vert(P(A.fM), n, 0, 0);
    quad(e0, e1, m1, m0, n);
  }
  const n = pos.length / 3;
  if (n > 65535) fail('too many vertices for 16-bit indices');
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), along: Float32Array.from(alo), across: Float32Array.from(acr), indices: Uint16Array.from(idx), vertexCount: n, triangleCount: idx.length / 3 };
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
      // the cell counts when any of its centre or corners lies in the triangle (conservative for thin triangles)
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
  return compassLayoutImpl(outline, opts);
}

// Optional caller-owned report; public compassLayout return/default/error behavior is unchanged.
function compassLayoutImpl(outline, opts = {}, report = null) {
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
    if (UP.x1 - UP.x0 > 40 && UP.y1 - UP.y0 > 40) tiers.push({ usable: UP, tier: 'preferred' });
  }
  tiers.push({ usable: U0, tier: 'usable' });
  if (Array.isArray(fallbackObstacles)) tiers.push({ usable: U0, obstacles: fallbackObstacles, tier: 'fallback' });
  // last: no cap on the inward slide (deeper over the glass rather than over a motor area)
  tiers.push({ usable: U0, obstacles: Array.isArray(fallbackObstacles) ? fallbackObstacles : null, rules: { ...(rest.rules || ARROW_LAYOUT), edgeMaxSlideFrac: null }, tier: 'deep' });
  let out = null;
  for (const t of tiers) {
    const L = compassLayoutCore(outline, { ...rest, usable: t.usable, obstacles: t.obstacles || rest.obstacles, rules: t.rules || rest.rules || ARROW_LAYOUT }, report);
    if (!L) continue;
    if (!out) { out = L; for (const d of COMPASS_DIRS) { L.arrows[d].tier = t.tier; L.arrows[d].outsidePreferred = t.tier !== 'preferred' && tiers[0].tier === 'preferred'; } }
    else for (const d of COMPASS_DIRS) if (out.arrows[d].blocked && !L.arrows[d].blocked) out.arrows[d] = { ...L.arrows[d], tier: t.tier, outsidePreferred: tiers[0].tier === 'preferred' };
    if (COMPASS_DIRS.every(d => !out.arrows[d].blocked)) break;
  }
  return out;
}

function compassLayoutCore(outline, {
  width, height, sizePx, gapPx, design = ARROW_DESIGN, usable = null, obstacles = [], fit = 'slide', rules = ARROW_LAYOUT,
  avoid = null, avoidCellPx = 4, avoidDilate = 1
} = {}, report = null) {
  if (!(width > 0 && height > 0)) fail('compassLayout needs width and height > 0');
  if (!(sizePx > 0) || !(gapPx >= 0)) fail('compassLayout needs sizePx > 0 and gapPx >= 0');
  const hull = Array.isArray(outline) && Array.isArray(outline[0]) ? convexHullPx(outline.flat()) : convexHullPx(outline);
  if (report) { report.hull.status = 'REACHED'; report.hull.count = hull.length; report.hull.calls++; }
  if (hull.length < 3) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of hull) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const U = usable || { x0: rules.marginPx, y0: rules.marginPx, x1: width - rules.marginPx, y1: height - rules.marginPx };
  const leaves = { forward: y0 < U.y0, back: y1 > U.y1, left: x0 < U.x0, right: x1 > U.x1 };
  const vis = { x0: Math.max(x0, U.x0), y0: Math.max(y0, U.y0), x1: Math.min(x1, U.x1), y1: Math.min(y1, U.y1) };
  const anyLeaves = COMPASS_DIRS.some(d => leaves[d]) && vis.x1 > vis.x0 && vis.y1 > vis.y0;
  const cx = anyLeaves ? (vis.x0 + vis.x1) / 2 : (x0 + x1) / 2, cy = anyLeaves ? (vis.y0 + vis.y1) / 2 : (y0 + y1) / 2;
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
        for (let cost = 0; cost <= wS * maxSlide + maxShift && !found; cost += st) {
          for (let sl = 0; wS * sl <= cost && sl <= maxSlide && !found; sl += st) {
            const k = cost - wS * sl;
            if (k > maxShift || (k % st) > 1e-9) continue;
            for (const sg of k === 0 ? [1] : [1, -1]) {
              const [px, py] = at(edgeBase - sgn * sl, lineAt + sg * k);
              if (okAt(boxAt(e, px, py, 1)) && apart(px, py)) { found = { px, py, s: sl }; shift = sg * k; break; }
            }
          }
        }
        if (found) { bx = found.px; by = found.py; slid = found.s; }
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
  return projectPointsPxImpl(points, matrix, cam, near);
}

// R345: collect finite counts/ranges inside the existing projection loop, never by projecting a second time.
function extendDiagnosticRange(range, value) {
  if (!range) return [value, value];
  if (value < range[0]) range[0] = value;
  if (value > range[1]) range[1] = value;
  return range;
}
function projectPointsPxImpl(points, matrix, cam, near = 0.02, report = null) {
  const c = camOf(cam), n = (points.length / 3) | 0, xy = new Float64Array(2 * n), m = matrix;
  const D = report ? (report.projection = { status: 'RUNNING', nearM: near, inputScalars: points.length, inputRows: n,
    ignoredTrailingScalars: points.length - 3 * n, visitedRows: 0, finiteSourceRows: 0, nonfiniteSourceRows: 0,
    finiteDepthRows: 0, nonfiniteDepthRows: 0, finiteFrontRows: 0, nonfiniteFrontDepthRows: 0,
    behind: 0, finiteXYRows: 0, nonfiniteXYRows: 0, depthRangeM: null, finiteFrontDepthRangeM: null,
    finiteXYRangePx: { x: null, y: null } }) : null;
  let behind = 0;
  for (let i = 0; i < n; i++) {
    let x = points[3 * i], y = points[3 * i + 1], z = points[3 * i + 2];
    if (D) { D.visitedRows++; if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) D.finiteSourceRows++; else D.nonfiniteSourceRows++; }
    if (m) { const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Z = m[2] * x + m[6] * y + m[10] * z + m[14]; x = X; y = Y; z = Z; }
    const q = applyT(c.R, [x - c.pos[0], y - c.pos[1], z - c.pos[2]]), depth = -q[2];
    if (D) {
      if (Number.isFinite(depth)) { D.finiteDepthRows++; D.depthRangeM = extendDiagnosticRange(D.depthRangeM, depth);
        if (depth > near) { D.finiteFrontRows++; D.finiteFrontDepthRangeM = extendDiagnosticRange(D.finiteFrontDepthRangeM, depth); }
      } else { D.nonfiniteDepthRows++; if (depth > near) D.nonfiniteFrontDepthRows++; }
    }
    if (!(depth > near)) { xy[2 * i] = NaN; xy[2 * i + 1] = NaN; behind++; if (D) { D.behind++; D.nonfiniteXYRows++; } continue; }
    xy[2 * i] = (q[0] / (depth * c.tanH * c.aspect) + 1) * 0.5 * c.W;
    xy[2 * i + 1] = (1 - q[1] / (depth * c.tanH)) * 0.5 * c.H;
    if (D) {
      if (Number.isFinite(xy[2 * i]) && Number.isFinite(xy[2 * i + 1])) {
        D.finiteXYRows++; D.finiteXYRangePx.x = extendDiagnosticRange(D.finiteXYRangePx.x, xy[2 * i]);
        D.finiteXYRangePx.y = extendDiagnosticRange(D.finiteXYRangePx.y, xy[2 * i + 1]);
      } else D.nonfiniteXYRows++;
    }
  }
  if (D) D.status = D.nonfiniteSourceRows || D.nonfiniteDepthRows || D.nonfiniteXYRows > D.behind ? 'COMPLETE_WITH_NONFINITE' : 'COMPLETE';
  return { xy, behind };
}

/** Distance (m) along the line of sight from the eye (camera at the origin) through `centre` to the target's nearest
 * point: min over points of (p . n), n = centre / |centre|. points: flat source points + optional world matrix. */
export function nearestDepthAlong(points, matrix, centre, origin = null) {
  const shifted = origin && origin.some(v => v !== 0);
  const n = norm3(shifted ? sub3(centre, origin) : centre), m = matrix;
  let best = Infinity;
  for (let i = 0; i + 2 < points.length; i += 3) {
    let x = points[i], y = points[i + 1], z = points[i + 2];
    if (m) { const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Z = m[2] * x + m[6] * y + m[10] * z + m[14]; x = X; y = Y; z = Z; }
    const d = shifted ? (x - origin[0]) * n[0] + (y - origin[1]) * n[1] + (z - origin[2]) * n[2] : x * n[0] + y * n[1] + z * n[2];
    if (d < best) best = d;
  }
  return best;
}

/* ------------------------------------------------------------------------------------------------ 3D frames */

/**
 * World frames of the four arrows (pure). The layout and frames use ONE selected reference camera: Euler `ref`
 * ({ yaw, pitch, position }, default zero origin) or cam.matrixWorld, whose rotation AND translation are authoritative.
 * Inputs must be finite and the camera proper rigid (scale/shear unsupported, not normalized here). Each anchor is cast
 * onto the plane through the target's centre perpendicular to the
 * line of sight (or, for an arrow over the outline, onto the plane frontMarginFrac x distance in front of the target's
 * nearest point, frontDepthM; see below), then:
 *   d = the screen compass direction on that plane (outward), w = AWAY from the eye along the sight line through the
 *   anchor (arrow-depth note R20; it was toward the eye), b = d x w (right-handed: det > 0, so the mesh's
 *   counter-clockwise winding and its normals carry over unchanged);
 *   scale = sizePx x the metres one CSS px covers there (across the line of sight).
 * design.viewTiltDeg > 0 turns the bend plane (w, b) about the stalk axis d by that angle, the same way for all four
 * (the bend then shows toward screen direction design.viewTiltScreen, the same screen side as before R20): the stalk
 * stays exactly on its compass line, the bend stays a bend away from the viewer (w . sight line = cos(tilt) > 0), and
 * the eye sees it a little from the side instead of exactly edge-on.
 * A 'front' arrow is then moved along the sight lines from the eye (origin, scale and mpp shrink together, so its
 * picture on screen does not change) until its DEEPEST point (the far head, grown by hoverScale and the dark outline)
 * lies on that front plane: no part of it reaches into the target or behind the target's near surface.
 * The result is a world frame for that selected view. Callers using an active viewer must replan on camera pose/origin
 * changes as well as target changes; this never turns the target itself.
 * Returns { forward | back | left | right: { dir, origin, d, w, b, scale, mpp, matrix (Float64Array(16), local design
 * units -> world), depthMode: 'centre' | 'front', distance } }.
 */
export function arrowFrames(layout, { cam, ref = { yaw: 0, pitch: 0 }, centre, frontDepthM = null, rules = ARROW_LAYOUT, design = ARROW_DESIGN, hoverScale = ARROW_LOOK.hoverScale, outline = ARROW_LOOK.outline } = {}) {
  if (!layout || !layout.arrows) fail('arrowFrames needs a compassLayout result');
  if (!Array.isArray(centre) && !(centre && centre.length === 3)) fail('arrowFrames needs the target centre (world)');
  const c = camOf({ ...cam, yaw: ref.yaw || 0, pitch: ref.pitch || 0, position: ref.position || [0, 0, 0] });
  const Cw = [centre[0], centre[1], centre[2]];
  const shifted = c.pos.some(v => v !== 0); // matrixWorld origin wins even when ref.position is absent or different
  const Cc = applyT(c.R, shifted ? sub3(Cw, c.pos) : Cw), dist = len3(Cc);
  if (!(dist > 0) || Cc[2] >= 0) fail('the target centre must be in front of the reference camera');
  const n = mul3(Cc, 1 / dist); // line of sight to the centre (camera space)
  const front = isNum(frontDepthM) && frontDepthM > 0 ? Math.max(1e-3, frontDepthM - rules.frontMarginFrac * dist) : null;
  const rayAt = (x, y) => norm3([((2 * x) / c.W - 1) * c.tanH * c.aspect, (1 - (2 * y) / c.H) * c.tanH, -1]);
  const onPlane = (x, y, D) => { const r = rayAt(x, y), k = D / dot3(n, r); return mul3(r, k); };
  const dz = { ...ARROW_DESIGN, ...design };
  const tilt = isNum(dz.viewTiltDeg) && dz.viewTiltDeg > 0 ? Math.min(60, dz.viewTiltDeg) * DEG : 0;
  const ts = dz.viewTiltScreen || [1, 1];
  const tiltS = norm3([ts[0], -ts[1], 0]); // screen (x right, y down) -> camera space (y up)
  // R20, for 'front' arrows: spheres [u, w, radius] (design units) that hold every vertex of the drawn arrow: the tube
  // rings and base cap, the head's base ring and its tip, each grown by the dark outline (the hover scale is applied
  // about the anchor below). Their deepest point along the line of sight sets how far a front arrow comes forward.
  const path = arrowPath(dz), Hd = path.head, pad = isNum(outline) && outline > 0 ? outline : 0;
  const grow = isNum(hoverScale) && hoverScale > 1 ? hoverScale : 1;
  const keys = path.samples.map(p => [p.u, p.w, p.r + pad]).concat([[Hd.base[0], Hd.base[1], Math.max(Hd.radius, Hd.thickness) + pad], [Hd.tip[0], Hd.tip[1], pad]]);
  const out = {};
  for (const dir of COMPASS_DIRS) {
    const a = layout.arrows[dir];
    if (!a) { out[dir] = null; continue; }
    const depthMode = a.overOutline && front !== null ? 'front' : 'centre';
    const D = depthMode === 'front' ? Math.min(front, dist) : dist;
    let X = onPlane(a.x, a.y, D);
    const step = 8;
    const X2 = onPlane(a.x + a.screen[0] * step, a.y + a.screen[1] * step, D);
    const w0 = norm3(X); // arrow-depth note R20: AWAY from the eye along the sight line through the anchor (was -X)
    let d0 = sub3(X2, X);
    d0 = sub3(d0, mul3(w0, dot3(d0, w0)));
    let mpp = len3(d0) / step;
    const d = norm3(d0);
    let w = w0, b = cross3(d, w0);
    if (tilt > 0) {
      // turn (w, b) about d so the bent part shows toward the screen direction tiltS (camera space). b = d x w0 flipped
      // with w0, so sg flips too: the bend shows on the same screen side as before R20; only its depth is reversed.
      const sg = dot3(b, tiltS) >= 0 ? 1 : -1, ct = Math.cos(tilt), st = Math.sin(tilt);
      w = add3(mul3(w0, ct), mul3(b, sg * st));
      b = cross3(d, w);
    }
    let s = layout.sizePx * (isNum(a.scale) && a.scale > 0 ? a.scale : 1) * mpp;
    if (depthMode === 'front') {
      // R20: the far head lies BEYOND the anchor plane. X, mpp and s are all in proportion to D, so scaling them by one
      // factor slides the arrow along the sight lines from the eye without changing its picture. Choose the factor that
      // puts its deepest point (along n; grown by the hover scale about the anchor and by the outline) at `front`.
      const dn = dot3(n, d), wn = dot3(n, w);
      let reach = 0;
      for (const [u, v, r] of keys) reach = Math.max(reach, u * dn + v * wn + r);
      const deepest = D + grow * reach * s;
      if (deepest > front) { const k = front / deepest; X = mul3(X, k); mpp *= k; s *= k; }
    }
    const dW = apply(c.R, d), wW = apply(c.R, w), bW = apply(c.R, b), oW = shifted ? add3(c.pos, apply(c.R, X)) : apply(c.R, X);
    const matrix = new Float64Array(16);
    matrix.set([dW[0] * s, dW[1] * s, dW[2] * s, 0, wW[0] * s, wW[1] * s, wW[2] * s, 0, bW[0] * s, bW[1] * s, bW[2] * s, 0, oW[0], oW[1], oW[2], 1]);
    out[dir] = { dir, origin: oW, d: dW, w: wW, b: bW, scale: s, mpp, matrix, depthMode, distance: len3(X) };
  }
  return out;
}

/** A local design point (u, w, z) -> world under a frame (pure). */
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
export function planCompassArrows(args = {}) {
  return planCompassArrowsImpl(args);
}

/** R345 separate reporting API. Same plan/short-circuits/math as the legacy public API. The caller may retain `report`
 * even when the SAME original error is rethrown. No points, geometry, hull vertices or live layout references escape.
 * This API records a null reason; it does not repair the outline or certify any rendered/current-view behavior. */
export function planCompassArrowsWithReport(args = {}, report = {}) {
  Object.assign(report, { kind: 'ns-compass-plan-report-r345', outcome: 'NOT_REACHED', stage: 'camera',
    projection: { status: 'NOT_REACHED', nearM: 0.02 }, hull: { status: 'NOT_REACHED', count: null, calls: 0 }, layout: null, error: null });
  try {
    const plan = planCompassArrowsImpl(args, report);
    return { plan, report };
  } catch (err) {
    report.outcome = 'error';
    const name = String((err && err.name) || 'Error'), message = String((err && err.message) || err);
    report.error = { name: name.slice(0, 128), message: message.slice(0, 512), truncated: name.length > 128 || message.length > 512 };
    throw err;
  }
}

function compassLayoutReport(layout) {
  const rect = r => r ? { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 } : null;
  return { centre: layout.centre.slice(), box: rect(layout.box), visibleBox: rect(layout.visibleBox), leaves: { ...layout.leaves },
    arrows: Object.fromEntries(COMPASS_DIRS.map(dir => {
      const a = layout.arrows[dir];
      return [dir, { dir: a.dir, x: a.x, y: a.y, box: rect(a.box), outline: a.outline.slice(),
        blocked: a.blocked, onScreen: a.onScreen, overOutline: a.overOutline, overAvoid: a.overAvoid,
        slidPx: a.slidPx, scale: a.scale, gapUsedPx: a.gapUsedPx, clearancePx: a.clearancePx,
        edge: a.edge, edgeShiftPx: a.edgeShiftPx, tier: a.tier, outsidePreferred: a.outsidePreferred }];
    })) };
}

function planCompassArrowsImpl({ points, matrix = null, centre, ref = { yaw: 0, pitch: 0 }, cam, kind = 'brain', design = ARROW_DESIGN, usable = null, obstacles = [], fit = 'slide', front = true, avoidPoints = null, avoidIndices = null, avoidCellPx = 4, avoidDilate = 1, avoid: avoidGrid = null, prefer = null, fallbackObstacles = null } = {}, report = null) {
  const refCam = { ...cam, yaw: ref.yaw || 0, pitch: ref.pitch || 0, position: ref.position || [0, 0, 0] };
  const cameraOrigin = camOf(refCam).pos; // identical origin authority to projection and arrowFrames
  if (report) report.stage = 'projection';
  const { xy, behind } = projectPointsPxImpl(points, matrix, refCam, 0.02, report);
  if (behind > 0) { if (report) { report.outcome = 'depth_veto'; report.stage = 'returned'; } return null; }
  if (report) report.stage = 'sizes_and_avoid';
  const sizes = kind && typeof kind === 'object' && isNum(kind.sizePx) ? { sizePx: kind.sizePx, gapPx: kind.gapPx } : arrowSizePx(cam, kind);
  // R5-bigbrain (R25): the motor areas' sample points (same matrix and reference view) an edge arrow must not cover.
  const avoid = avoidGrid && typeof avoidGrid.hits === 'function' ? avoidGrid : avoidPoints && avoidPoints.length >= 3 ? occupancyGrid(projectPointsPx(avoidPoints, matrix, refCam).xy, { width: cam.width, height: cam.height, cellPx: avoidCellPx, dilate: avoidDilate, indices: avoidIndices }) : null;
  if (report) report.stage = 'layout';
  const layout = compassLayoutImpl(xy, { width: cam.width, height: cam.height, ...sizes, design, usable, obstacles, fit, avoid, prefer, fallbackObstacles }, report);
  if (!layout) { if (report) { report.outcome = 'projected_hull_under3'; report.stage = 'returned'; } return null; }
  if (report) { report.layout = compassLayoutReport(layout); report.stage = 'front_depth_and_frames'; }
  const needFront = front && COMPASS_DIRS.some(d => layout.arrows[d].overOutline);
  const frontDepthM = needFront ? nearestDepthAlong(points, matrix, centre, cameraOrigin) : null;
  const frames = arrowFrames(layout, { cam, ref, centre, frontDepthM, design });
  if (report) { report.outcome = 'planned'; report.stage = 'returned'; }
  return { layout, frames, sizes, behind, frontDepthM };
}

/**
 * R558 STABLE compass plan (pure). Genuine note R29: the arrows "should also stay in place after tapping on them" and
 * must "never overlap key areas and block the view". The older plan followed the target's drawn outline, so every
 * orbit step and every look movement moved all four arrows. This plan depends only on things that do NOT change when
 * the target is orbited or the player looks around:
 *   eye     a FIXED world reference point (the player's home eye position), not the moving render camera;
 *   centre  the target's world centre (it moves only when the player carries the target);
 *   keepRadiusM  the radius of a sphere about `centre` that holds everything the arrows must stay clear of, under EVERY
 *           orbit (a sphere about the orbit pivot is unchanged by the orbit): for the brain, its motor areas;
 *   frontM  (optional) a distance from `eye` along the line eye -> centre. No part of an arrow may lie deeper than
 *           it; give the nearest the whole target can come under any orbit, so the arrows float just in front of it.
 * Each arrow sits on its compass line (top / bottom / left / right of the line eye -> centre, with world `up`), just
 * outside the silhouette of the keep-clear sphere as seen from `eye`, plus gapPx. Its stalk points outward, it bends
 * away from `eye` into the scene (R20), turned viewTiltDeg about the stalk as before so the bend can be seen.
 * radiiM (optional, e.g. the mirror body: { forward, back, left, right } in metres) places the anchors at those
 * distances from the centre in the centre plane instead (a body is taller than wide).
 * anchorsTan (optional, the brain: { forward, back, left, right: [tx, ty] }) gives each anchor directly as tangents of
 * its direction from `eye`, measured from the line eye -> centre along world right (tx) and up (ty); the anchor lies
 * in the centre plane. The scene derives them from the box of the motor areas as first framed, so the four arrows
 * surround the motor areas rather than the whole brain's orbit centre.
 * Returns { layout, frames, sizes, frontDepthM, stable: true } in the same shape as planCompassArrows, or null when the
 * centre is not in front of the eye. layout.arrows[dir].x / .y / .box are filled only when `cam` can project them.
 */
export function planStableCompassArrows({ centre, eye = [0, 0, 0], up = [0, 1, 0], keepRadiusM = 0, verticalShare = 1, radiiM = null, anchorsTan = null, frontM = null, gapPx = null, kind = 'brain', cam, design = ARROW_DESIGN, hoverScale = ARROW_LOOK.hoverScale, rules = ARROW_LAYOUT } = {}) {
  if (!centre || centre.length !== 3 || !eye || eye.length !== 3 || ![...centre, ...eye].every(isNum)) fail('planStableCompassArrows needs finite centre and eye');
  if (!cam || !(cam.width > 0 && cam.height > 0) || !(cam.fovYDeg > 0 && cam.fovYDeg < 180)) fail('cam needs width, height and fovYDeg');
  const sizes = kind && typeof kind === 'object' && isNum(kind.sizePx) ? { sizePx: kind.sizePx, gapPx: kind.gapPx } : arrowSizePx(cam, kind);
  const gap = isNum(gapPx) && gapPx >= 0 ? gapPx : sizes.gapPx;
  const toC = sub3(centre, eye), dist = len3(toC);
  if (!(dist > 1e-6)) return null;
  const n = mul3(toC, 1 / dist);
  let right = cross3(n, norm3(up));
  if (len3(right) < 1e-6) right = cross3(n, [1, 0, 0]);
  right = norm3(right);
  const upV = cross3(right, n);
  const tanH = Math.tan((cam.fovYDeg * DEG) / 2), pxAngle = (2 * tanH) / cam.height; // tangent of one CSS px at the view centre
  const dz = { ...ARROW_DESIGN, ...design };
  const tilt = isNum(dz.viewTiltDeg) && dz.viewTiltDeg > 0 ? Math.min(60, dz.viewTiltDeg) * DEG : 0;
  const ts = dz.viewTiltScreen || [1, 1], tiltW = norm3(add3(mul3(right, ts[0]), mul3(upV, -ts[1])));
  const path = arrowPath(dz), Hd = path.head, grow = isNum(hoverScale) && hoverScale > 1 ? hoverScale : 1;
  const keys = path.samples.map(q => [q.u, q.w, Math.max(q.r, q.rN)]).concat([[Hd.base[0], Hd.base[1], Math.max(Hd.radius, Hd.thickness)], [Hd.tip[0], Hd.tip[1], 0]]);
  const front = isNum(frontM) && frontM > 0 ? Math.max(1e-3, frontM * (1 - rules.frontMarginFrac)) : null;
  // Angular radius (as a tangent, seen from `eye`) just outside the keep-clear sphere's silhouette.
  const keep = isNum(keepRadiusM) && keepRadiusM > 0 ? Math.min(keepRadiusM, dist * 0.985) : 0;
  const tanKeep = keep > 0 ? keep / Math.sqrt(dist * dist - keep * keep) : 0;
  const frames = {}, arrows = {};
  let frontUsed = null;
  for (const dir of COMPASS_DIRS) {
    const e = COMPASS_SCREEN[dir], out0 = norm3(add3(mul3(right, e[0]), mul3(upV, -e[1])));
    const rM = radiiM && isNum(radiiM[dir]) && radiiM[dir] > 0 ? radiiM[dir] : null;
    // The anchor at centre depth; a front arrow is then slid toward the eye along its sight line (same picture).
    // verticalShare < 1 (the brain): the top and bottom anchors sit on an ellipse, nearer the centre than the side
    // anchors. The motor areas are a wide, low band, so the sphere bound is only needed sideways; the scene still
    // checks every drawn arrow against the motor areas as drawn and does not draw one that would cover them.
    const share = e[0] === 0 && isNum(verticalShare) && verticalShare > 0 && verticalShare <= 1 ? verticalShare : 1;
    const lateral = rM !== null ? rM + gap * pxAngle * dist : dist * (tanKeep * share + gap * pxAngle);
    const tan = anchorsTan && anchorsTan[dir] && isNum(anchorsTan[dir][0]) && isNum(anchorsTan[dir][1]) ? anchorsTan[dir] : null;
    let A = tan ? add3(centre, add3(mul3(right, dist * tan[0]), mul3(upV, dist * tan[1]))) : add3(centre, mul3(out0, lateral));
    const frame = at => {
      const w0 = norm3(sub3(at, eye));
      const dd = norm3(sub3(out0, mul3(w0, dot3(out0, w0))));
      let w = w0, b = cross3(dd, w0);
      if (tilt > 0) { const sg = dot3(b, tiltW) >= 0 ? 1 : -1, ct = Math.cos(tilt), st = Math.sin(tilt); w = add3(mul3(w0, ct), mul3(b, sg * st)); b = cross3(dd, w); }
      const depth = len3(sub3(at, eye));
      // A wide view stretches things near its edge (by 1 / cos^2 of the off-axis angle along the radius, 1 / cos
      // across it). The arrow is made that much smaller in metres, so it has about the same size on screen as an
      // arrow at the middle of the view when the player faces the target.
      const off = clamp(dot3(w0, n), 0.2, 1);
      return { d: dd, w, b, mpp: depth * pxAngle, s: sizes.sizePx * depth * pxAngle * Math.pow(off, 1.5) };
    };
    let f = frame(A), depthMode = 'centre';
    if (front !== null) {
      // Everything of the arrow (anchor, bend, head, grown by the hover scale) must stay nearer than `front` along n.
      const dn = dot3(n, f.d), wn = dot3(n, f.w);
      let reach = 0;
      for (const [u, v, r] of keys) reach = Math.max(reach, u * dn + v * wn + r);
      const anchorDepth = dot3(n, sub3(A, eye)), deepest = anchorDepth + grow * reach * f.s;
      if (deepest > front) { const k = front / deepest; A = add3(eye, mul3(sub3(A, eye), k)); f = frame(A); depthMode = 'front'; frontUsed = front; }
    }
    const matrix = new Float64Array(16);
    matrix.set([f.d[0] * f.s, f.d[1] * f.s, f.d[2] * f.s, 0, f.w[0] * f.s, f.w[1] * f.s, f.w[2] * f.s, 0, f.b[0] * f.s, f.b[1] * f.s, f.b[2] * f.s, 0, A[0], A[1], A[2], 1]);
    frames[dir] = { dir, origin: A, d: f.d, w: f.w, b: f.b, scale: f.s, mpp: f.mpp, matrix, depthMode, distance: len3(sub3(A, eye)) };
    let x = null, y = null, box = null, onScreen = false;
    try {
      const q = projectWorldPx(A, cam);
      if (q.depth > 0) { x = q.x; y = q.y; box = arrowScreenBox(frames[dir], cam, dz); onScreen = Boolean(box) && box.x1 > 0 && box.x0 < cam.width && box.y1 > 0 && box.y0 < cam.height; }
    } catch { /* a camera that cannot project leaves the screen fields empty */ }
    arrows[dir] = { dir, x, y, box, screen: e, outline: [x, y], blocked: false, onScreen, overOutline: depthMode === 'front', overAvoid: 0,
      slidPx: 0, scale: 1, gapUsedPx: gap, clearancePx: gap, edge: false, edgeShiftPx: 0, tier: 'stable-r558', outsidePreferred: false };
  }
  return { layout: { arrows, sizePx: sizes.sizePx, gapPx: gap, centre: null, stable: true }, frames, sizes: { ...sizes, gapPx: gap }, behind: 0, frontDepthM: frontUsed, stable: true };
}

/* ------------------------------------------------------------------------------------------------ THREE rig */

const VERT = `
attribute float nsAlong;
attribute float nsAcross;
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
varying float vAcross;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  vAlong = nsAlong;
  vAcross = nsAcross;
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
uniform vec4 uO; // R558: opacity at rest, under the pointer, when blocked; edge brightness
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
varying float vAcross;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  vec3 L = normalize(uLight);
  // paper is lit from both sides: a sheet turned away from the light still shows, only dimmer
  float nl = dot(N, L);
  float diff = max(nl, 0.0) + 0.35 * max(-nl, 0.0);
  float fill = max(dot(N, normalize(uFill)), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), uS.x);
  float edge = smoothstep(0.68, 1.0, abs(vAcross)); // the cut edge of the sheet catches a little light
  vec3 albedo = mix(uTip, uBase, smoothstep(0.0, 1.0, vAlong)); // R20: bright near base -> dimmer far head
  albedo = mix(albedo, uHoverCol, 0.55 * uHover);
  albedo = mix(albedo, vec3(dot(albedo, vec3(0.3333))) * 0.55, uBlocked); // covered: grey and dim
  float lit = uK.x + uK.y * diff + uK.z * fill + 0.25 * uAttn;
  vec3 col = albedo * lit + vec3(spec) * uK.w * (1.0 + 0.5 * uHover) + uRim * edge * uO.w * (1.0 + 0.6 * uHover + uAttn);
  float alpha = mix(uO.x, uO.y, max(uHover, 0.6 * uAttn));
  alpha = mix(alpha, uO.z, uBlocked) * (0.8 + 0.2 * edge);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
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
varying float vAcross;
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
  geometry.setAttribute('nsAcross', new THREE.BufferAttribute(g.across || new Float32Array(g.vertexCount), 1));
  geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
  geometry.computeBoundingSphere();
  const col = hex => new THREE.Color(hex);
  const group = new THREE.Group();
  group.name = name || `ns-arrows3d (${kind}: 3D compass orbit arrows)`;
  const arrows = {};
  const materials = [];
  for (const dir of COMPASS_DIRS) {
    // R558: the ribbon is see-through: blended, never writes depth (it must not hide the brain areas, the body or the
    // other arrows behind it) and still depth-tested, so the arm, the body and the brain areas in front of it cover it.
    const opq = v => (isNum(v) ? clamp(v, 0, 1) : 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uO: { value: new THREE.Vector4(opq(look.opacity), opq(look.hoverOpacity), opq(look.blockedOpacity), isNum(look.edgeGlow) ? look.edgeGlow : 0) },
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
    // A thin dark outline (inflated back faces): where the near stalk crosses the far head, its edge shows which is in
    // front (the occlusion cue for the bend away from the viewer, arrow-depth note R20).
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
        u.uBlocked.value = on && hoverBlocked ? 1 : 0;
        if (arrows[d].xray) arrows[d].xray.material.uniforms.uHover.value = on && !hoverBlocked ? 1 : 0;
        arrows[d].mesh.scale.setScalar(on && !hoverBlocked ? look.hoverScale : 1);
      }
      return hovered;
    },
    get hoverBlocked() { return hoverBlocked; },
    /** A soft extra glow on all four (0..1), e.g. while the "Try this" goal asks for an orbit. */
    setAttention(x) { const v = clamp(Number(x) || 0, 0, 1); for (const d of COMPASS_DIRS) arrows[d].material.uniforms.uAttn.value = v; return v; },
    setVisible(on) { visible = on !== false; for (const d of COMPASS_DIRS) if (!visible) arrows[d].root.visible = false; return visible; },
    dispose() { geometry.dispose(); for (const m of materials) m.dispose(); if (group.parent) group.parent.remove(group); }
  };
  return rig;
}
