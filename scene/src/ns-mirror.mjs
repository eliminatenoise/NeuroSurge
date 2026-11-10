/**
 * NeuroSurge mirror body (R5-mirror, lead decision D19; user requirement R23, 2026-11-08T21:54Z).
 *
 * "a mirror body that initially, when you start the game, is behind the brain. And given the brain's translucent ...
 * you can see it behind the brain. And it will also have its own arrows, but of course those arrows will be closer to
 * the body and within and behind the brain. So to move the body around, you have to move the brain that's in front of
 * it away, and then you have to manipulate the body from then. And whatever activity is happening on your own body
 * will also be happening on the mirror body. But the mirror body will be facing you, essentially, and looking at you
 * ... you'll be able to turn that body around to look at the posterior. You'll be able to shift the orbit of that body
 * in any which direction."
 *
 * PURE module (no DOM, no Three, importable in Node). It owns:
 *   1. placement: behind the glass brain at game start, facing the player, scale and distance from measured targets
 *      (mirrorPlacement);
 *   2. the mirror transform: a reflection through the vertical plane facing the player, then scale, then the move
 *      behind the brain (mirrorTransform; det < 0);
 *   3. its own orbit state: yaw (wraps, any amount, so the back can be seen) and pitch (+-90 deg) about its own centre,
 *      click = one step, hold = gentle continuous turn, never autonomous (mirrorOrbitStep, mirrorHoldSteps,
 *      applyMirrorOrbit, resetMirror);
 *   4. the frame of its four smaller compass arrows (mirrorArrowFrame) for the R5-arrows module;
 *   5. the occlusion rule: an input aimed at a mirror arrow or the mirror body is caught by the brain while the
 *      brain's drawn outline covers it (mirrorInputTarget);
 *   6. the state-sync contract from the primary body (MIRROR_SYNC) and the mapping of glow end points (mirrorPoint);
 *   7. plain texts for the panel and the Esc page (MIRROR_TEXT, mirrorPartName, mirrorInfoCard).
 *
 * Conventions (shared with ns-math / ns-brain / ns-scene-three): world metres, the first-person eye at the world
 * origin, +x screen right, +y up, the player faces -z at body yaw 0. 4x4 matrices are column-major Float64Array(16)
 * (THREE.Matrix4.elements layout). Angles in this module's public state are DEGREES (like the brain orbit).
 *
 * CHIRALITY (documented for the labels): the mirror is the reflection of your body through a vertical plane that faces
 * you (det = -1), like a real mirror. The image of your LEFT arm is on the LEFT of the screen and moves the same way on
 * the screen as your arm; the image itself is left-right reversed (on a real person facing you it would be their right
 * arm). Every label therefore names YOUR part followed by "(mirror image)" ("your left arm (mirror image)"); it never
 * calls it "its right arm". After you turn the mirror body round (yaw 180) you see the image from behind, so the image
 * of your left arm is then on the right of the screen.
 *
 * Everything shown stays simulated: the mirror body copies the simulated pose and the simulated, unitless activity of
 * your own body; it is a picture, not a second person, a sensor or a recording.
 */

import {
  DEG, add, sub, scale, dot, cross, length, normalize, clamp, identity, multiply, translation, uniformScale, transformPoint,
  transformDirection, det3
} from './ns-math.mjs';

export const MIRROR_VERSION = 'ns-mirror-r5 (R5-mirror, 2026-11-09)';

/**
 * Placement targets (display choices; the measurements behind each number are in round5/R5-mirror-NOTES.md).
 *  heightShare: the mirror body's on-screen height as a share of the brain outline's on-screen height at the default
 *    view (frame.silhouetteNdc). 0.56 leaves room for the top and bottom mirror arrows INSIDE the brain outline, as the
 *    user asked ("within and behind the brain"), on 1280x720, 720x1280 and 2560x1080.
 *  widthShare: the same cap for the width (portrait screens are width-bound).
 *  gapM: R22 initial depth-plane gap between the normal brain support and facing mirror source box, world metres.
 *    The historical all-orbit brain/body sphere rule is retained only as comparison metadata. Future pose/orbit/carry
 *    collision is not proved by this initial bound; the transparent brain still blocks mirror input explicitly.
 *  maxNearShare: the mirror's bounding sphere may use at most this share of its centre distance (keeps the solve finite).
 *  minScale / maxScale: a safety range for the enlargement only (measured: 4.6x at 720x1280, 9.2x at 1280x720, 9.4x at
 *    2560x1080; the brain itself is drawn about 50 times life size).
 *  facing: the image is turned about the vertical so it faces the eye exactly (it stays upright).
 *  arrowGapFrac / arrowSizeFrac: the mirror arrows' gap outside the body's drawn extent and their size, as fractions
 *    of the mirror body's drawn height (smaller than the brain's arrows, as D19 asks).
 */
export const MIRROR_VIEW = Object.freeze({
  heightShare: 0.56, widthShare: 0.62, gapM: 1.0, maxNearShare: 0.85, minScale: 0.1, maxScale: 1000, facing: true,
  arrowGapFrac: 0.06, arrowSizeFrac: 0.16
});

/**
 * R5-bigbrain (R25: the brain now fills the screen; R23 "you can see it behind the brain"): where the mirror body stands
 * at game start, on screen (display choices; measured in round5/R5-bigbrain-NOTES.md). The brain's motor areas fill the
 * middle of the view, and a translucent motor area in front of the mirror body darkens it (ns-colors region backing), so
 * the body is put in the largest place on the brain's midline where NO motor area and none of the brain's arrows lie in
 * front of it or of its own four arrows (mirrorFitBox): at the default view that is the frontal glass inside the motor
 * belt's curve, above the leg areas.
 *  fill: the body's height as a share of the tallest free box (a little air round it);
 *  maxHeightFrac: at most this share of the view height (it must not crowd the motor areas);
 *  minHeightFrac: below this the fit is not used (the outline-share rule of round 5 is the fallback);
 *  stepPx: search step; marginPx: kept off the usable edges.
 */
export const MIRROR_FIT = Object.freeze({ fill: 0.94, maxHeightFrac: 0.6, minHeightFrac: 0.08, stepPx: 4, marginPx: 6 });

/**
 * The tallest box for the mirror body on screen (pure; CSS px, y down), centred on `centreX` (the brain's midline at the
 * default view), whose core, its four arrows' rooms and the space between are clear.
 *  width, height: the view; usable { x0, y0, x1, y1 }: where the body may be drawn (the info column / band and the top
 *    line excluded);
 *  blocked(box) -> number: how much of { x0, y0, x1, y1 } is blocked (motor areas, the brain's arrows, HUD cards: e.g. an
 *    ns-arrows3d occupancyGrid's hits plus box overlaps); 0 = clear;
 *  aspect: the body's on-screen width / height at its default pose and turn (from a trial mirrorPlacement);
 *  room: { top, bottom, side } px: room for the body's own arrows (ns-arrows3d arrowRoomPx of the mirror arrows) above,
 *    below and beside it; sideBand: the height (px) of a side arrow's band at the body's middle height;
 *  hull: optional convex polygon [[x, y], ...] px (the brain's drawn outline): the core box must lie inside it, so the
 *    body is seen through the glass;
 *  fill / maxHeightFrac / minHeightFrac / stepPx / marginPx: MIRROR_FIT.
 * Search: every bottom edge (stepPx) and, for each, the tallest clear height (clear is monotone in the height for a fixed
 * bottom edge and centre). The tallest wins; on a tie the box nearer the view's middle. Returns null when nothing of at
 * least minHeightFrac x height is clear, else { box (the body's target box, after `fill`), free (the tallest clear core),
 * centreX, aspect, room, tried }.
 */
export function mirrorFitBox({ width, height, usable = null, blocked = () => 0, aspect, room = { top: 0, bottom: 0, side: 0 }, sideBand = 0, hull = null, centreX = null, fill = MIRROR_FIT.fill, maxHeightFrac = MIRROR_FIT.maxHeightFrac, minHeightFrac = MIRROR_FIT.minHeightFrac, stepPx = MIRROR_FIT.stepPx, marginPx = MIRROR_FIT.marginPx } = {}) {
  if (!(width > 0 && height > 0)) fail('input', 'mirrorFitBox needs width and height > 0');
  if (!(Number.isFinite(aspect) && aspect > 0)) fail('input', 'mirrorFitBox needs the body aspect (width / height) > 0');
  if (typeof blocked !== 'function') fail('input', 'mirrorFitBox needs blocked(box) -> number');
  const U = usable || { x0: 0, y0: 0, x1: width, y1: height };
  const ux0 = U.x0 + marginPx, ux1 = U.x1 - marginPx, uy0 = U.y0 + marginPx, uy1 = U.y1 - marginPx;
  const cx = Number.isFinite(centreX) ? centreX : (ux0 + ux1) / 2;
  const rt = Math.max(0, room.top || 0), rb = Math.max(0, room.bottom || 0), rs = Math.max(0, room.side || 0), band = Math.max(0, sideBand || 0);
  const inHull = b => !hull || [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].every(([x, y]) => pointInConvexPolygon(hull, x, y));
  let tried = 0;
  const clear = (bottom, h) => {
    tried++;
    const w = aspect * h, b = { x0: cx - w / 2, x1: cx + w / 2, y0: bottom - h, y1: bottom };
    const g = { x0: b.x0 - rs, x1: b.x1 + rs, y0: b.y0 - rt, y1: b.y1 + rb };
    if (g.x0 < ux0 || g.x1 > ux1 || g.y0 < uy0 || g.y1 > uy1) return false;
    if (!inHull(b)) return false;
    const mid = (b.y0 + b.y1) / 2;
    return blocked(b) === 0 && blocked({ x0: b.x0, x1: b.x1, y0: g.y0, y1: b.y0 }) === 0 && blocked({ x0: b.x0, x1: b.x1, y0: b.y1, y1: g.y1 }) === 0
      && blocked({ x0: g.x0, x1: b.x0, y0: mid - band / 2, y1: mid + band / 2 }) === 0 && blocked({ x0: b.x1, x1: g.x1, y0: mid - band / 2, y1: mid + band / 2 }) === 0;
  };
  const hMax = Math.min(maxHeightFrac * height / Math.max(1e-9, fill), uy1 - uy0), hMin = minHeightFrac * height;
  let best = null;
  for (let bottom = uy1 - rb; bottom - hMin - rt >= uy0; bottom -= stepPx) {
    if (!clear(bottom, hMin)) continue;
    let lo = hMin, hi = Math.min(hMax, bottom - rt - uy0);
    if (clear(bottom, hi)) lo = hi;
    else for (let i = 0; i < 14 && hi - lo > 1; i++) { const m = (lo + hi) / 2; if (clear(bottom, m)) lo = m; else hi = m; }
    const midY = bottom - lo / 2, better = !best || lo > best.h + 0.5 || (Math.abs(lo - best.h) <= 0.5 && Math.abs(midY - height / 2) < Math.abs(best.midY - height / 2));
    if (better) best = { bottom, h: lo, midY };
  }
  if (!best) return null;
  const H = best.h * fill, W = aspect * H, my = best.bottom - best.h / 2;
  const box = { x0: cx - W / 2, x1: cx + W / 2, y0: my - H / 2, y1: my + H / 2 };
  const free = { x0: cx - (aspect * best.h) / 2, x1: cx + (aspect * best.h) / 2, y0: best.bottom - best.h, y1: best.bottom };
  return { box, free, centreX: cx, aspect, room: { top: rt, bottom: rb, side: rs }, tried };
}

/** The rest-pose fallback body box (world m, seated BodyParts3D body at the default eye) used only when the integrator
 * passes no measured bounds: centre, half extents along body right / up / forward. Replaced by bodyBoundsFromPoints. */
export const MIRROR_FALLBACK_BODY = Object.freeze({
  centre: Object.freeze([0, -0.62, -0.18]), half: Object.freeze([0.32, 0.72, 0.45])
});

/**
 * Orbit of the mirror body (Google-Earth style, about its OWN centre; the brain's step and hold speed).
 *  stepDeg: one click on a mirror arrow (= ns-brain BRAIN_VIEW.orbitStepDeg, 15).
 *  hold: holding an arrow keeps turning gently (= ns-scene-three ORBIT_HOLD: after 300 ms, 1.2 deg every 100 ms =
 *    12 deg/s, at most 5 steps banked per frame).
 *  pitchLimitDeg: 90 (from straight above to straight below). Yaw has no limit (it wraps to (-180, 180]), so the
 *    body can be turned all the way round to show its back.
 */
export const MIRROR_ORBIT = Object.freeze({
  stepDeg: 15, pitchLimitDeg: 90,
  hold: Object.freeze({ delayMs: 300, everyMs: 100, stepDeg: 1.2, maxStepsPerFrame: 5 })
});

/** The four mirror orbit directions, named like the brain's (ns-app ORBIT_DIRS) so one arrow module serves both. */
export const MIRROR_DIRS = Object.freeze(['forward', 'back', 'left', 'right']);
/** Fixed compass position of each arrow on screen (R20: "a top arrow, a bottom arrow, a left arrow, and a right
 * arrow"). For the mirror body 'forward' (top) moves your viewpoint up over its head, 'back' (bottom) down under its
 * feet, 'left' / 'right' round its side (the body turns the other way). */
export const MIRROR_COMPASS = Object.freeze({ forward: 'top', back: 'bottom', left: 'left', right: 'right' });
/** Orbit sign per direction ({ yaw, pitch } in steps): yaw > 0 = viewpoint toward screen right, pitch > 0 = viewpoint
 * up. Same convention as ns-brain ORBIT_DIRECTIONS. */
export const MIRROR_ORBIT_DIRECTIONS = Object.freeze({
  left: Object.freeze({ yaw: -1, pitch: 0 }), right: Object.freeze({ yaw: 1, pitch: 0 }),
  forward: Object.freeze({ yaw: 0, pitch: 1 }), back: Object.freeze({ yaw: 0, pitch: -1 })
});
const DIR_ALIASES = Object.freeze({ top: 'forward', up: 'forward', bottom: 'back', down: 'back', left: 'left', right: 'right', forward: 'forward', back: 'back' });

/** Plain texts (R17: simple words). The integrator may move them into ns-text; the honesty meaning must stay. */
export const MIRROR_TEXT = Object.freeze({
  name: 'Mirror body',
  tag: 'A mirror image of your body',
  label: 'Mirror body (a mirror image of you)',
  lead: 'This is a mirror image of your own body. It copies every move you make, like a real mirror. Your left arm shows on the same side of the screen.',
  explanation: 'It shows the same pose and the same made-up signal colours as your body, at the same time. It is only a picture. It is not a second person.',
  blocked: 'The glass brain is in front of the mirror body. Hold Space while you look at the brain and drag it away first.',
  arrows: 'Click an arrow next to the mirror body to turn it one step. Hold the arrow to keep turning. Turn it all the way round to see its back.',
  turned: 'You are looking at the mirror body from another side. Reset brain view turns it back.',
  reset: 'Reset mirror body',
  resetHelp: 'Turns the mirror body back to face you.',
  simulated: 'Everything here is simulated.',
  escRow: 'Mirror body: move the brain aside, then hold Space on the visible mirror and look or use W/A/S/D to carry it. Its arrows turn it.',
  partSuffix: ' (mirror image)'
});

/** Plain part names (ns-scene-three bodyPartOf parts). */
export const MIRROR_PART_NAMES = Object.freeze({
  leftArm: 'your left arm', rightArm: 'your right arm', torso: 'your chest, belly and back', legs: 'your legs',
  neck: 'your neck', face: 'your face and head', other: 'your body'
});

/** "Your left arm (mirror image)" for a part id; unknown parts read "Your body (mirror image)". */
export function mirrorPartName(part) {
  const n = MIRROR_PART_NAMES[part] || MIRROR_PART_NAMES.other;
  return `${n[0].toUpperCase()}${n.slice(1)}${MIRROR_TEXT.partSuffix}`;
}

const fail = (code, msg) => { throw new Error(`ns:mirror_${code}: ${msg}`); };
const isVec3 = v => Array.isArray(v) || ArrayBuffer.isView(v) ? v.length === 3 && [0, 1, 2].every(i => Number.isFinite(v[i])) : false;
const vec3 = (v, what) => { if (!isVec3(v)) fail('input', `${what} must be a finite [x, y, z]`); return [v[0], v[1], v[2]]; };
const freeze = o => Object.freeze(o);
const UP = Object.freeze([0, 1, 0]);

/** Wrap degrees to (-180, 180]. */
export function wrapDeg(a) {
  if (!Number.isFinite(a)) return 0;
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x + 0; // no -0
}

/* ------------------------------------------------------------------ bounds of the primary body */

/**
 * Bounds of the primary body from world points (flat xyz, metres) sampled at the REST pose (the seated body, the left
 * arm at its start pose and the head), in the body's own axes: right = up x back, up = world up, forward = the body's
 * facing direction (default -z, i.e. body yaw 0).
 * Returns { centre (world, the box centre = the mirror's orbit pivot), half: [right, up, forward] half extents,
 *   radius (bounding sphere about the centre), height, width, depth, forward, right, count, sample (Float64Array flat xyz,
 *   at most sampleMax of the points, for the projected-size solve) }.
 */
export function bodyBoundsFromPoints(points, { forward = [0, 0, -1], stride = 1, sampleMax = 1500 } = {}) {
  if (!points || typeof points.length !== 'number' || points.length < 3 || points.length % 3 !== 0) fail('input', 'points must be flat xyz with at least one point');
  const f0 = vec3(forward, 'forward');
  const f = normalize([f0[0], 0, f0[2]]);
  const R = normalize(cross(f, UP)).map(x => x + 0); // right = forward x up (f = -z gives +x); no -0
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const st = Math.max(1, Math.floor(stride)) * 3;
  let count = 0;
  for (let i = 0; i < points.length; i += st) {
    const p = [points[i], points[i + 1], points[i + 2]];
    if (!p.every(Number.isFinite)) continue;
    const a = [dot(p, R), p[1], dot(p, f)];
    for (let k = 0; k < 3; k++) { if (a[k] < lo[k]) lo[k] = a[k]; if (a[k] > hi[k]) hi[k] = a[k]; }
    count++;
  }
  if (count === 0) fail('input', 'no finite points');
  const mid = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2), half = [0, 1, 2].map(k => (hi[k] - lo[k]) / 2);
  const centre = add(add(scale(R, mid[0]), scale(UP, mid[1])), scale(f, mid[2]));
  let radius = 0;
  for (let i = 0; i < points.length; i += st) {
    const d = Math.hypot(points[i] - centre[0], points[i + 1] - centre[1], points[i + 2] - centre[2]);
    if (Number.isFinite(d) && d > radius) radius = d;
  }
  // A small sample of the points (at most sampleMax) for the projected-size solve in mirrorPlacement.
  const every = Math.max(1, Math.ceil(count / sampleMax));
  const sample = [];
  for (let i = 0, j = 0; i < points.length; i += st) {
    if (!(Number.isFinite(points[i]) && Number.isFinite(points[i + 1]) && Number.isFinite(points[i + 2]))) continue;
    if (j++ % every === 0) sample.push(points[i], points[i + 1], points[i + 2]);
  }
  return freeze({ centre: freeze(centre), half: freeze(half), radius, height: 2 * half[1], width: 2 * half[0], depth: 2 * half[2], forward: freeze(f), right: freeze(R), count, sample: Float64Array.from(sample) });
}

/** Bounds from the fallback box (MIRROR_FALLBACK_BODY) when nothing was measured. */
export function fallbackBodyBounds() {
  const { centre, half } = MIRROR_FALLBACK_BODY;
  return freeze({ centre, half, radius: Math.hypot(half[0], half[1], half[2]), height: 2 * half[1], width: 2 * half[0], depth: 2 * half[2], forward: freeze([0, 0, -1]), right: freeze([1, 0, 0]), count: 0 });
}

/* ------------------------------------------------------------------ the brain's reach in depth */

/**
 * The largest distance from the eye of any DRAWN brain point, for any brain orbit and any Space-drag carry (both keep
 * the brain centre's distance; the carry is a rotation about the eye), with the R4-view squash (perspectiveK = K):
 * a drawn point is C + a + b u (u = unit line of sight to the centre C, a perpendicular to u) with
 * |a|^2 + (K b)^2 <= (k R)^2, so |p|^2 <= (D + b)^2 + (kR)^2 - K^2 b^2, largest at b* = min(kR / K, D / (K^2 - 1)).
 * frame: a frameBrain result ({ k, perspectiveK, pivotWorld } or distanceM); brainRadiusMm: the largest source distance
 * of any brain vertex from frame.pivot (the brain's bounding radius, mm). Returns metres.
 * R558: frame.squashAxis (unit u; ns-brain pictureAxis 'view') means the squash is along u, not along the line of sight.
 * A drawn point is still C + a + b u with |a| <= kR and |b| <= kR / K, so with C = c_par u + c_perp it lies within
 * sqrt((|c_par| + kR / K)^2 + (|c_perp| + kR)^2) of the eye (a bounding cylinder about the centre: a little loose, never
 * short). The carry is a rotation about the eye and takes u with it, so the bound holds for every carry.
 */
export function brainFarDistance({ frame, brainRadiusMm, distanceM = null } = {}) {
  if (!frame || !Number.isFinite(frame.k) || !(frame.k > 0)) fail('input', 'frame (a frameBrain result with k) is required');
  if (!(Number.isFinite(brainRadiusMm) && brainRadiusMm > 0)) fail('input', 'brainRadiusMm must be > 0');
  const D = Number.isFinite(distanceM) ? distanceM : frame.pivotWorld ? length(vec3(frame.pivotWorld, 'frame.pivotWorld')) : frame.distanceM;
  if (!(Number.isFinite(D) && D > 0)) fail('input', 'the brain centre distance is unknown');
  const K = Number.isFinite(frame.perspectiveK) && frame.perspectiveK >= 1 ? frame.perspectiveK : 1;
  const kR = frame.k * brainRadiusMm;
  const u = frame.squashAxis;
  if (K > 1 && u && u.length === 3 && frame.pivotWorld) {
    const n = Math.hypot(u[0], u[1], u[2]);
    if (!(Number.isFinite(n) && n > 0)) fail('input', 'frame.squashAxis must be a finite non-zero vector');
    const C = vec3(frame.pivotWorld, 'frame.pivotWorld'), par = (C[0] * u[0] + C[1] * u[1] + C[2] * u[2]) / n;
    const perp = Math.sqrt(Math.max(0, dot(C, C) - par * par));
    return Math.hypot(Math.abs(par) + kR / K, perp + kR);
  }
  const b = K > 1 ? Math.min(kR / K, D / (K * K - 1)) : kR;
  return Math.sqrt(Math.max(0, (D + b) * (D + b) + kR * kR - K * K * b * b));
}

/* ------------------------------------------------------------------ placement */

/**
 * Where the mirror body stands at game start (and after a resize; the orbit is kept).
 *   body: bodyBoundsFromPoints(...) (or fallbackBodyBounds()).
 *   brain: { centre (world, frame.pivotWorld at no carry), farM (brainFarDistance), outlineNdc ({ x0, x1, y0, y1 }, the
 *     brain silhouette box at the default look: frame.silhouetteNdc) }.
 *   camera: { aspect, fovYDeg (70), eye ([0, 0, 0]) } at the default look (yaw = pitch = 0, looking along -z).
 * Solve (a few fixed-point steps on the REAL projection of the body sample, so perspective is included):
 *   - size: the mirror body's on-screen height is heightShare x the brain outline height, capped by widthShare x the
 *     outline width;
 *   - centre: the body's on-screen centre is the centre of the brain outline box (o.centre 'outline'), or the brain
 *     centre's line of sight (o.centre 'pivot');
 *   - R5-bigbrain (R25): options.targetBoxNdc { x0, x1, y0, y1 } (a mirrorFitBox result in NDC) replaces the two rules
 *     above: the body's projected box is fitted into it (its height or width, whichever binds) and centred on it;
 *   - R22 depth: the initial facing source body box stays beyond the brain's far plane+gap; height is not depth.
 *     The separate all-orbit source-sphere near-share guard stays. Carried/orbited/current-pose clearance still needs
 *     qualification; transparent brain input occlusion remains explicit. Enlargement follows the angular fit (s=rho*z).
 * Returns a frozen { kind: 'ns-mirror-placement', centre, distanceM, scale, toward, right, up, facingYawDeg, reflectAxis,
 *   bodyCentre, body, nearM, brainFarM, gapM, targetHeightNdc, targetWidthNdc, limiting ('height' | 'width' | 'near' |
 *   'scale'), expectedHeightNdc, expectedWidthNdc, expectedCentreNdc, iterations, camera }.
 */
export function mirrorPlacement({ body = null, brain = null, camera = {}, options = {} } = {}) {
  const o = { centre: 'outline', ...MIRROR_VIEW, ...options };
  const b = body || fallbackBodyBounds();
  if (!b || !isVec3(b.centre) || !Array.isArray(b.half) && !ArrayBuffer.isView(b.half)) fail('input', 'body must be a bodyBoundsFromPoints result');
  const aspect = camera.aspect, fovYDeg = Number.isFinite(camera.fovYDeg) ? camera.fovYDeg : 70;
  if (!(Number.isFinite(aspect) && aspect > 0)) fail('input', 'camera.aspect must be > 0');
  const eye = camera.eye ? vec3(camera.eye, 'camera.eye') : [0, 0, 0];
  const t = Math.tan((fovYDeg * DEG) / 2), ta = t * aspect;
  const bc = brain && brain.centre ? vec3(brain.centre, 'brain.centre') : [0, 0, -6.5];
  const legacySphereFarM = brain && Number.isFinite(brain.farM) ? brain.farM : length(sub(bc, eye)) + 2;
  const farM = brain && Number.isFinite(brain.depthFarM) ? brain.depthFarM : legacySphereFarM;
  const box = brain && brain.outlineNdc ? brain.outlineNdc : { x0: -0.5, x1: 0.5, y0: -0.8, y1: 0.8 };
  const hB = box.y1 - box.y0, wB = box.x1 - box.x0;
  if (!(hB > 0 && wB > 0)) fail('input', 'brain.outlineNdc must have a positive size');
  // R5-bigbrain (R25): an explicit target box (mirrorFitBox, NDC) replaces the share-of-the-outline rule: the brain now
  // fills the screen, so its outline box says nothing about where the mirror body can be seen.
  const tb = o.targetBoxNdc && [o.targetBoxNdc.x0, o.targetBoxNdc.x1, o.targetBoxNdc.y0, o.targetBoxNdc.y1].every(Number.isFinite) && o.targetBoxNdc.x1 > o.targetBoxNdc.x0 && o.targetBoxNdc.y1 > o.targetBoxNdc.y0 ? o.targetBoxNdc : null;
  const targetH = tb ? tb.y1 - tb.y0 : o.heightShare * hB, targetW = tb ? tb.x1 - tb.x0 : o.widthShare * wB;
  const goal = tb ? [(tb.x0 + tb.x1) / 2, (tb.y0 + tb.y1) / 2] : o.centre === 'pivot' ? null : [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  const fwd = b.forward ? vec3(b.forward, 'body.forward') : [0, 0, -1];
  const reflectAxis = normalize([fwd[0], 0, fwd[2]]);
  const imageFacing = scale(reflectAxis, -1);
  const r = b.radius, c0 = vec3(b.centre, 'body.centre');
  // The body sample: measured points, else the 8 corners of its box.
  let sample = b.sample && b.sample.length >= 3 ? b.sample : null;
  if (!sample) {
    const R = b.right ? vec3(b.right, 'body.right') : [1, 0, 0], h = b.half, pts = [];
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) pts.push(...add(add(add(c0, scale(R, i * h[0])), scale(UP, j * h[1])), scale(reflectAxis, k * h[2])));
    sample = pts;
  }
  const H = 2 * b.half[1], W = 2 * b.half[0];
  const toNdcDir = (x, y) => normalize([x * ta, y * t, -1]);
  const ndcOf = p => { const d = sub(p, eye); return [d[0] / (-d[2] * ta), d[1] / (-d[2] * t)]; };
  let dir = normalize(sub(bc, eye));
  const build = (rho, dirv) => {
    const cz = -dirv[2];
    if (!(Number.isFinite(cz) && cz > 0)) fail('input', 'initial mirror must have positive camera depth');
    const rhoNear = o.maxNearShare / (cz * r);
    let lim = null, rr = rho;
    if (rr > rhoNear) { rr = rhoNear; lim = 'near'; }
    const toward = scale(dirv, -1);
    const towardH = Math.hypot(toward[0], toward[2]) > 1e-9 ? normalize([toward[0], 0, toward[2]]) : imageFacing;
    const facingYawDeg = o.facing ? Math.atan2(dot(cross(imageFacing, towardH), UP), dot(imageFacing, towardH)) / DEG : 0;
    const unit = multiply(rotY(facingYawDeg * DEG), reflectionMatrix(reflectAxis));
    const axes = [b.right ? vec3(b.right, 'body.right') : [1, 0, 0], UP, reflectAxis];
    const depthHalf = axes.reduce((n, axis, i) => n + Math.abs(transformDirection(unit, axis)[2]) * b.half[i], 0);
    const oldD = (legacySphereFarM + o.gapM) / (1 - rr * cz * r);
    // R22: only INITIAL facing placement must stand behind the brain. Body height is not its front/back depth.
    // Original maxNearShare still bounds the all-orbit sphere away from the camera; no joint/mesh/scale threshold changes.
    const denominator = cz * (1 - rr * depthHalf);
    if (!(Number.isFinite(denominator) && denominator > 0)) fail('input', 'initial mirror depth-support solve is not finite');
    let D = (farM + o.gapM) / denominator;
    let s = rr * cz * D;
    if (s < o.minScale || s > o.maxScale) { s = clamp(s, o.minScale, o.maxScale); D = Math.max((farM + o.gapM + s * depthHalf) / cz, D); lim = 'scale'; }
    const centre = add(eye, scale(dirv, D));
    // Orbit 0: M = T(centre) Ry(facing) S(s) Reflect T(-c0).
    const lin = multiply(rotY(facingYawDeg * DEG), multiply(uniformScale(s), reflectionMatrix(reflectAxis)));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i + 2 < sample.length; i += 3) {
      const q = add(centre, transformDirection(lin, [sample[i] - c0[0], sample[i + 1] - c0[1], sample[i + 2] - c0[2]]));
      const n = ndcOf(q);
      if (n[0] < x0) x0 = n[0]; if (n[0] > x1) x1 = n[0]; if (n[1] < y0) y0 = n[1]; if (n[1] > y1) y1 = n[1];
    }
    return { rho: rr, D, s, centre, toward, facingYawDeg, lim, oldD, depthHalf, initialDepthNearM: cz * D - s * depthHalf, h: y1 - y0, w: x1 - x0, cx: (x0 + x1) / 2, cy: (y1 + y0) / 2, cNdc: ndcOf(centre) };
  };
  // Start from the upright-box estimate, then correct on the real projection.
  let rho = Math.min((targetH * t) / H, (targetW * ta) / W);
  let P = build(rho, dir), limiting = 'height', iterations = 0;
  for (let it = 0; it < 24; it++) {
    iterations = it + 1;
    const fH = targetH / P.h, fW = targetW / P.w, f = Math.min(fH, fW);
    limiting = fH <= fW ? 'height' : 'width';
    let moved = false;
    if (goal) {
      const dx = goal[0] - P.cx, dy = goal[1] - P.cy;
      if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) { dir = toNdcDir(P.cNdc[0] + dx, P.cNdc[1] + dy); moved = true; }
    }
    if (Math.abs(f - 1) < 1e-6 && !moved) break;
    rho = P.rho * f;
    P = build(rho, dir);
    if (P.lim) { limiting = P.lim; if (!goal) break; }
  }
  if (P.lim) limiting = P.lim;
  const up = normalize(sub(UP, scale(P.toward, dot(UP, P.toward))));
  const right = normalize(cross(up, P.toward));
  return freeze({
    kind: 'ns-mirror-placement', rule: tb ? 'fit-box' : 'outline-share', targetBoxNdc: tb ? freeze({ x0: tb.x0, x1: tb.x1, y0: tb.y0, y1: tb.y1 }) : null,
    centre: freeze(P.centre), distanceM: P.D, scale: P.s, toward: freeze(P.toward), right: freeze(right), up: freeze(up),
    facingYawDeg: P.facingYawDeg, reflectAxis: freeze(reflectAxis), bodyCentre: freeze([...c0]), body: b,
    nearM: P.D - P.s * r, initialDepthNearM: P.initialDepthNearM, depthSupportHalfM: P.s * P.depthHalf, priorSphereDistanceM: P.oldD, legacySameFitSphereDistanceRatio: P.D / P.oldD, distanceRule: 'initial-facing-depth-support-r22', brainDepthFarM: farM, legacyBrainSphereFarM: legacySphereFarM, brainDepthBasis: brain && brain.depthBasis ? brain.depthBasis : 'legacy-sphere-fallback', brainFarM: farM, gapM: o.gapM, targetHeightNdc: targetH, targetWidthNdc: targetW, limiting,
    expectedHeightNdc: P.h, expectedWidthNdc: P.w, expectedCentreNdc: freeze([P.cx, P.cy]), iterations,
    camera: freeze({ aspect, fovYDeg, eye: freeze(eye) })
  });
}

/* ------------------------------------------------------------------ state, orbit, reset */

/** A fresh mirror state: { kind, placement (or null until the brain is framed), orbit { yaw, pitch } (deg), hold }. */
export function createMirrorState(placement = null) {
  if (placement !== null && (!placement || placement.kind !== 'ns-mirror-placement')) fail('input', 'placement must be a mirrorPlacement result or null');
  return freeze({ kind: 'ns-mirror-state', placement, orbit: freeze({ yaw: 0, pitch: 0 }), hold: null });
}

/** The same state with a new placement (resize / reframe); the orbit and hold are kept. */
export function placeMirror(state, placement) {
  if (!state || state.kind !== 'ns-mirror-state') fail('input', 'state must be a createMirrorState result');
  if (!placement || placement.kind !== 'ns-mirror-placement') fail('input', 'placement must be a mirrorPlacement result');
  return freeze({ ...state, placement });
}

/** Normalise a direction ('forward' | 'back' | 'left' | 'right', or the compass names 'top' | 'bottom' / 'up' |
 * 'down'); null when unknown. */
export function mirrorDir(dir) { return typeof dir === 'string' && DIR_ALIASES[dir] ? DIR_ALIASES[dir] : null; }

/** One orbit step (degrees) from `orbit` in direction `dir`: yaw wraps, pitch clamps to +-pitchLimitDeg. Pure. */
export function mirrorOrbitStep(orbit, dir, { stepDeg = MIRROR_ORBIT.stepDeg, pitchLimitDeg = MIRROR_ORBIT.pitchLimitDeg } = {}) {
  const d = mirrorDir(dir);
  if (!d) fail('input', `direction must be one of ${MIRROR_DIRS.join(', ')} (or top, bottom, up, down); got ${dir}`);
  if (!(Number.isFinite(stepDeg) && stepDeg > 0)) fail('input', 'stepDeg must be > 0');
  const s = MIRROR_ORBIT_DIRECTIONS[d];
  const yaw = orbit && Number.isFinite(orbit.yaw) ? orbit.yaw : 0, pitch = orbit && Number.isFinite(orbit.pitch) ? orbit.pitch : 0;
  return freeze({ yaw: wrapDeg(yaw + s.yaw * stepDeg), pitch: clamp(pitch + s.pitch * stepDeg, -pitchLimitDeg, pitchLimitDeg) + 0 });
}

/**
 * Steps owed by a held mirror arrow at `now` (ms): { steps, hold }, hold = { dir, since, last }. Same rule as ns-app
 * orbitHoldSteps for the brain arrows (after delayMs, one small step every everyMs; never more than maxStepsPerFrame
 * banked, so a slow frame does not jump).
 */
export function mirrorHoldSteps(hold, now, o = MIRROR_ORBIT.hold) {
  if (!hold || !Number.isFinite(now) || !Number.isFinite(hold.since) || now - hold.since < o.delayMs) return { steps: 0, hold };
  const from = Number.isFinite(hold.last) ? hold.last : hold.since + o.delayMs - o.everyMs;
  const n = Math.min(o.maxStepsPerFrame, Math.max(0, Math.floor((now - from) / o.everyMs)));
  if (n === 0) return { steps: 0, hold };
  const last = n === o.maxStepsPerFrame ? now : from + n * o.everyMs;
  return { steps: n, hold: { ...hold, last } };
}

/**
 * The next mirror state for this frame's mirror-arrow input (pure; nothing changes without input, so the mirror body
 * never turns by itself):
 *   clicks: directions clicked this frame (each one full step);
 *   press: { dir, at } when a mirror arrow was pressed this frame (starts a hold; the press itself is the click step);
 *   release: true when the held button was released (or the pointer lock / focus was lost, or the game paused);
 *   now: the frame time (ms) for the hold.
 */
export function applyMirrorOrbit(state, { clicks = [], press = null, release = false, now = null } = {}) {
  if (!state || state.kind !== 'ns-mirror-state') fail('input', 'state must be a createMirrorState result');
  let orbit = state.orbit, hold = state.hold;
  for (const c of clicks) { const d = mirrorDir(c); if (d) orbit = mirrorOrbitStep(orbit, d); }
  if (release) hold = null;
  if (press && mirrorDir(press.dir) && Number.isFinite(press.at)) hold = { dir: mirrorDir(press.dir), since: press.at, last: null };
  if (hold && Number.isFinite(now)) {
    const r = mirrorHoldSteps(hold, now);
    for (let i = 0; i < r.steps; i++) orbit = mirrorOrbitStep(orbit, hold.dir, { stepDeg: MIRROR_ORBIT.hold.stepDeg });
    hold = r.hold;
  }
  if (orbit === state.orbit && hold === state.hold) return state;
  return freeze({ ...state, orbit, hold: hold ? freeze({ ...hold }) : null });
}

/** Reset: the mirror body faces you again (orbit 0, no hold); the placement is kept. Call it from Reset brain view
 * (and from a separate "Reset mirror body" if the Esc page offers one). */
export function resetMirror(state) {
  if (!state || state.kind !== 'ns-mirror-state') fail('input', 'state must be a createMirrorState result');
  return freeze({ ...state, orbit: freeze({ yaw: 0, pitch: 0 }), hold: null });
}

/* ------------------------------------------------------------------ the mirror transform */

/** Reflection through the plane through the origin with unit normal n: I - 2 n n^T (4x4, det -1). */
export function reflectionMatrix(n) {
  const [x, y, z] = normalize(vec3(n, 'n'));
  const m = identity();
  m[0] = 1 - 2 * x * x; m[4] = -2 * x * y; m[8] = -2 * x * z;
  m[1] = -2 * x * y; m[5] = 1 - 2 * y * y; m[9] = -2 * y * z;
  m[2] = -2 * x * z; m[6] = -2 * y * z; m[10] = 1 - 2 * z * z;
  return m;
}
const rotX = a => { const c = Math.cos(a), s = Math.sin(a), m = identity(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a), m = identity(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
const basis4 = (x, y, z) => { const m = identity(); m[0] = x[0]; m[1] = x[1]; m[2] = x[2]; m[4] = y[0]; m[5] = y[1]; m[6] = y[2]; m[8] = z[0]; m[9] = z[1]; m[10] = z[2]; return m; };
const transpose3 = m => { const r = identity(); r[0] = m[0]; r[4] = m[1]; r[8] = m[2]; r[1] = m[4]; r[5] = m[5]; r[9] = m[6]; r[2] = m[8]; r[6] = m[9]; r[10] = m[10]; return r; };

/** The orbit rotation in the view frame (local axes x = right, y = up, z = toward the eye): Rx(pitch) Ry(-yaw), i.e.
 * the turntable / Google-Earth orbit of a viewpoint at azimuth `yaw` (right-positive) and elevation `pitch`
 * (up-positive) around the body: the yaw turns the body about its own vertical axis, the pitch tips it about the
 * screen's horizontal axis. (The brain uses Ry(-yaw) Rx(pitch); with the brain's small limits the two agree to the
 * first order; the mirror needs the turntable order so a half turn shows the back upright.) */
export function mirrorOrbitLocal(yawDeg, pitchDeg) {
  return multiply(rotX(pitchDeg * DEG), rotY(-yawDeg * DEG));
}

/**
 * The mirror transform for a state: matrix maps PRIMARY world points (your posed body as drawn) to MIRROR world points:
 *   M = T(centre) . B . O(yaw, pitch) . B^T . Ry(facingYaw) . S(scale) . Reflect(bodyForward) . T(-bodyCentre)
 * B = [right up toward] (the view frame at the mirror centre). det(M) = -scale^3 < 0 (a mirror image; Three flips the
 * front face for it automatically). Returns a frozen { kind: 'ns-mirror-transform', matrix, inverse, linear (3x3 as 4x4,
 *   no translation), det, centre, scale, frame { right, up, toward }, orbit, placement }.
 */
export function mirrorTransform(state) {
  if (!state || state.kind !== 'ns-mirror-state') fail('input', 'state must be a createMirrorState result');
  const p = state.placement;
  if (!p) fail('state', 'the mirror has no placement yet (placeMirror after the brain is framed)');
  const B = basis4(p.right, p.up, p.toward);
  const O = mirrorOrbitLocal(state.orbit.yaw, state.orbit.pitch);
  const F = rotY(p.facingYawDeg * DEG);
  const lin = multiply(B, multiply(O, multiply(transpose3(B), multiply(F, multiply(uniformScale(p.scale), reflectionMatrix(p.reflectAxis))))));
  const localMatrix = multiply(translation(p.centre), multiply(lin, translation(scale(p.bodyCentre, -1))));
  const parent = p.referenceFrame || null;
  if (parent && (parent.length !== 16 || !Array.from(parent).every(Number.isFinite) || parent[3] !== 0 || parent[7] !== 0 || parent[11] !== 0 || parent[15] !== 1 || !(Number.isFinite(det3(parent)) && det3(parent) > 0))) fail('input', 'constructor reference frame must be finite right-handed affine');
  const matrix = parent ? multiply(parent, localMatrix) : localMatrix;
  const originalWorldCentre = parent ? transformPoint(parent, p.centre) : p.centre;
  const placedWorldCentre = p.worldCentre ? vec3(p.worldCentre, 'persistent mirror world centre') : originalWorldCentre;
  for (let i = 0; i < 3; i++) matrix[12 + i] += placedWorldCentre[i] - originalWorldCentre[i];
  const inverse = invertAffine(matrix);
  const direction = v => parent ? transformDirection(parent, v) : v;
  const worldCentre = placedWorldCentre;
  const worldLinear = parent ? multiply(parent, lin) : lin;
  if (parent) { worldLinear[12] = 0; worldLinear[13] = 0; worldLinear[14] = 0; }
  return freeze({
    kind: 'ns-mirror-transform', matrix, inverse, linear: worldLinear, det: det3(matrix), centre: worldCentre, scale: p.scale,
    frame: freeze({ right: direction(p.right), up: direction(p.up), toward: direction(p.toward) }), orbit: state.orbit, placement: p
  });
}

/** Inverse of an affine 4x4 (column-major). */
export function invertAffine(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const A = e * i - f * h, Bc = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * Bc + c * C;
  if (!(Math.abs(det) > 1e-300)) fail('input', 'singular matrix');
  const inv = identity();
  inv[0] = A / det; inv[4] = -(b * i - c * h) / det; inv[8] = (b * f - c * e) / det;
  inv[1] = Bc / det; inv[5] = (a * i - c * g) / det; inv[9] = -(a * f - c * d) / det;
  inv[2] = C / det; inv[6] = -(a * h - b * g) / det; inv[10] = (a * e - b * d) / det;
  const t = [m[12], m[13], m[14]];
  inv[12] = -(inv[0] * t[0] + inv[4] * t[1] + inv[8] * t[2]);
  inv[13] = -(inv[1] * t[0] + inv[5] * t[1] + inv[9] * t[2]);
  inv[14] = -(inv[2] * t[0] + inv[6] * t[1] + inv[10] * t[2]);
  return inv;
}

/** A primary world point on the mirror body (e.g. a glow-link end point on a driven muscle). */
export function mirrorPoint(p, transform) { return transformPoint(transform.matrix, vec3(p, 'p')); }
/** A mirror world point back on the primary body (e.g. a ray hit on the mirror -> which part of your body). */
export function primaryPoint(q, transform) { return transformPoint(transform.inverse, vec3(q, 'q')); }
/** A primary world direction on the mirror (not normalised; scaled by `scale`). */
export function mirrorDirection(v, transform) { return transformDirection(transform.matrix, vec3(v, 'v')); }
/** A surface normal on the mirror: the inverse transpose of the linear part (unit). For a reflection times a uniform
 * scale this is the reflected normal, so lighting of the mirror image is right. */
export function mirrorNormal(n, transform) {
  const v = transformDirection(transform.matrix, vec3(n, 'n'));
  return normalize(v);
}
/** A world ray on the mirror mapped back to the primary body ({ origin, dir (unit) }), so the primary body's own
 * picking can name the part of the mirror image under the crosshair or pointer. */
export function primaryRay(ray, transform) {
  const o = primaryPoint(ray.origin, transform);
  const d = transformDirection(transform.inverse, vec3(ray.dir, 'ray.dir'));
  return { origin: o, dir: normalize(d) };
}
/** The twin's world matrix: M x (the primary mesh's in-place world matrix). */
export function mirrorTwinMatrix(transform, inPlaceWorld) {
  if (!inPlaceWorld || inPlaceWorld.length !== 16) fail('input', 'inPlaceWorld must be a 4x4');
  return multiply(transform.matrix, Float64Array.from(inPlaceWorld));
}

/* ------------------------------------------------------------------ the frame for the mirror's compass arrows */

/**
 * Frame of the mirror body's four compass arrows for the R5-arrows module (same design as the brain's, smaller, close
 * around the body, behind the brain). The arrows keep FIXED compass positions on screen (top / bottom / left / right
 * in the view frame), at the drawn body's current extent (its oriented box's support in that direction, so they hug
 * the body whichever way it is turned) plus a gap. Every position lies in the plane through the mirror centre facing
 * the eye, i.e. behind the brain by construction.
 * Returns a frozen { kind: 'ns-mirror-arrow-frame', centre, right, up, toward (unit, world), extent { forward, back,
 *   left, right } (m from the centre, along up / -up / -right / right), radius (the body's bounding sphere, m), gapM,
 *   sizeM (suggested arrow length), anchors { forward, back, left, right: { position, outward (unit), compass, orbit } },
 *   scale, orbit }.
 * 'forward' sits at the TOP and moves the viewpoint up over the head; 'back' at the bottom; 'left' / 'right' at the
 * sides (the same names and signs as the brain's arrows).
 */
export function mirrorArrowFrame(state, { gapFrac = MIRROR_VIEW.arrowGapFrac, sizeFrac = MIRROR_VIEW.arrowSizeFrac } = {}) {
  const T = mirrorTransform(state);
  const p = T.placement, half = p.body.half;
  // The body's own axes in the primary world: right, up, forward (the box of bodyBoundsFromPoints).
  const bR = p.body.right ? vec3(p.body.right, 'body.right') : [1, 0, 0], bF = p.body.forward ? vec3(p.body.forward, 'body.forward') : [0, 0, -1];
  const axes = [bR, [0, 1, 0], bF].map(a => transformDirection(T.linear, a)); // scaled, mirrored, turned
  const support = d => axes.reduce((s, a, k) => s + Math.abs(dot(a, d)) * half[k], 0);
  const { right, up, toward } = T.frame;
  const ext = { forward: support(up), back: support(up), left: support(right), right: support(right) };
  const H = 2 * ext.forward;
  const drawnHeight = 2 * half[1] * p.scale;
  const gapM = gapFrac * drawnHeight, sizeM = sizeFrac * drawnHeight;
  const outward = { forward: up, back: scale(up, -1), left: scale(right, -1), right };
  const anchors = {};
  for (const d of MIRROR_DIRS) {
    anchors[d] = freeze({ position: freeze(add(T.centre, scale(outward[d], ext[d] + gapM))), outward: freeze(outward[d]), compass: MIRROR_COMPASS[d], orbit: MIRROR_ORBIT_DIRECTIONS[d] });
  }
  return freeze({
    kind: 'ns-mirror-arrow-frame', centre: T.centre, right, up, toward, extent: freeze(ext), radius: p.body.radius * p.scale, gapM, sizeM,
    anchors: freeze(anchors), scale: p.scale, orbit: T.orbit, drawnBoxHeight: H
  });
}

/**
 * PROTOTYPE ONLY (not the arrow design; R5-arrows owns that): a sampled centre line for a compass arrow at `anchor`,
 * starting at the anchor, going out along `outward` and bending toward the eye and back inward along an arc on a
 * sphere around the mirror centre. Used by the harness prototype to check that the mirror arrows fit inside the brain
 * outline. Returns [[x, y, z], ...] (n + 1 points).
 */
export function compassArcPath(frame, dir, { n = 16, bendDeg = 150, straightFrac = 0.45 } = {}) {
  const a = frame.anchors[mirrorDir(dir)];
  if (!a) fail('input', `unknown direction ${dir}`);
  const out = a.outward, tw = frame.toward, L = frame.sizeM;
  // A straight part going outward, then a bend of radius rho in the (outward, toward-the-eye) plane that turns the
  // arrow toward you and back inward (bendDeg 180 would point it straight back at the body).
  const s0 = a.position, len = straightFrac * L, rho = ((1 - straightFrac) * L) / (Math.PI * (bendDeg / 180));
  const pts = [];
  const nS = Math.max(2, Math.round(n * straightFrac)), nB = Math.max(4, n - nS);
  for (let i = 0; i <= nS; i++) pts.push(add(s0, scale(out, (len * i) / nS)));
  const k = add(add(s0, scale(out, len)), scale(tw, rho)); // bend centre
  for (let i = 1; i <= nB; i++) {
    const ph = (bendDeg * DEG * i) / nB;
    pts.push(add(k, add(scale(tw, -rho * Math.cos(ph)), scale(out, rho * Math.sin(ph)))));
  }
  return pts;
}

/* ------------------------------------------------------------------ projection helpers (measurement and the rule) */

/** World point -> NDC for a camera at `position` with yaw / pitch (radians, the camera convention: yaw left-positive,
 * pitch up-positive, Three 'YXZ'): { x, y, depth }. depth <= 0 means behind the camera. */
export function projectNdc(w, { position = [0, 0, 0], yaw = 0, pitch = 0, fovYDeg = 70, aspect }) {
  const d = sub(vec3(w, 'w'), position);
  // camera-from-world rotation = Rx(-pitch) Ry(-yaw)
  const cy = Math.cos(-yaw), sy = Math.sin(-yaw), cp = Math.cos(-pitch), sp = Math.sin(-pitch);
  const x1 = cy * d[0] + sy * d[2], z1 = -sy * d[0] + cy * d[2], y1 = d[1];
  const y2 = cp * y1 - sp * z1, z2 = sp * y1 + cp * z1;
  const t = Math.tan((fovYDeg * DEG) / 2);
  const depth = -z2;
  return { x: x1 / (depth * t * aspect), y: y2 / (depth * t), depth };
}

/** Whether (x, y) is inside (or on) a convex polygon [[x, y], ...] of either winding. */
export function pointInConvexPolygon(poly, x, y) {
  if (!Array.isArray(poly) || poly.length < 3 || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(c) < 1e-15) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/** Share of NDC points ([[x, y], ...] or flat xy) inside a convex hull (measurement helper). */
export function shareInside(points, hull) {
  const list = Array.isArray(points) && Array.isArray(points[0]) ? points : null;
  let n = 0, inside = 0;
  if (list) { for (const [x, y] of list) { n++; if (pointInConvexPolygon(hull, x, y)) inside++; } }
  else for (let i = 0; i + 1 < points.length; i += 2) { n++; if (pointInConvexPolygon(hull, points[i], points[i + 1])) inside++; }
  return n ? inside / n : 0;
}

/* ------------------------------------------------------------------ the occlusion rule */

/**
 * Who gets a look or a click (D19: "while the brain is in front of those arrows, the brain catches the look and the
 * click"). Call it AFTER the brain's own arrows (they sit outside the brain outline) and with what the mirror picking
 * found under the same point:
 *   pointNdc: [x, y] of the crosshair (captured play: [0, 0]) or the pointer (free-mouse play);
 *   brainSilhouette: ns-brain brainSilhouette(seg, view, camera) for the same camera ({ inFront, hull }), or
 *     { hull } of the scene's drawn outline; null when no brain is drawn;
 *   mirrorArrow: the mirror arrow direction under the point ('forward' | 'back' | 'left' | 'right') or null;
 *   mirrorBody: the mirror body part under the point (e.g. 'leftArm') or null.
 * Returns { target: 'mirror-arrow' | 'mirror-body' | 'brain' | null, dir, part, blocked, reason }:
 *   - nothing of the mirror under the point: target null (the normal brain / body logic runs unchanged);
 *   - the brain's drawn outline covers the point: target 'brain', blocked true (the look and the click go to the brain
 *     as today, and Space grabs it; the panel may add MIRROR_TEXT.blocked);
 *   - else the mirror arrow (first) or the mirror body.
 * The brain is always nearer than the mirror body (mirrorPlacement keeps the body beyond the brain's far ball), so
 * "covered by the outline" is the same as "behind the brain".
 */
export function mirrorInputTarget({ pointNdc, brainSilhouette = null, mirrorArrow = null, mirrorBody = null } = {}) {
  if (!Array.isArray(pointNdc) || pointNdc.length !== 2 || !pointNdc.every(Number.isFinite)) fail('input', 'pointNdc must be [x, y]');
  const dir = mirrorDir(mirrorArrow);
  const part = typeof mirrorBody === 'string' && mirrorBody ? mirrorBody : null;
  if (!dir && !part) return { target: null, dir: null, part: null, blocked: false, reason: 'no-mirror-target' };
  const hull = brainSilhouette && Array.isArray(brainSilhouette.hull) ? brainSilhouette.hull : null;
  const brainDrawn = hull && brainSilhouette.inFront !== false;
  if (brainDrawn && pointInConvexPolygon(hull, pointNdc[0], pointNdc[1])) {
    return { target: 'brain', dir, part, blocked: true, reason: 'brain-in-front' };
  }
  if (dir) return { target: 'mirror-arrow', dir, part, blocked: false, reason: 'clear' };
  return { target: 'mirror-body', dir: null, part, blocked: false, reason: 'clear' };
}

/* ------------------------------------------------------------------ panel card */

/** A plain panel model for a look at the mirror body (mode 'mirror'): { key, mode, title, tag, plain, explanation,
 * simulated, caveats, part, activity }. activity: the simulated 0..1 value of the mirrored part's busiest muscle, or
 * null. */
export function mirrorInfoCard({ part = 'other', activity = null, turned = false } = {}) {
  const title = mirrorPartName(part);
  const caveats = [MIRROR_TEXT.explanation];
  if (turned) caveats.push(MIRROR_TEXT.turned);
  caveats.push(MIRROR_TEXT.arrows);
  return {
    key: `mirror|${part}|${turned ? 'turned' : 'front'}`, mode: 'mirror', viewed: 'now', title, tag: MIRROR_TEXT.tag,
    plain: MIRROR_TEXT.lead, explanation: MIRROR_TEXT.explanation, simulated: MIRROR_TEXT.simulated, caveats, part,
    activity: Number.isFinite(activity) ? Math.min(1, Math.max(0, activity)) : null
  };
}

/* ------------------------------------------------------------------ state-sync contract */

/**
 * What the mirror copies from your body every frame (the contract the scene integrator implements; the harness
 * prototype run-R5-mirror-* does exactly this):
 *  group: one THREE.Group `mirrorGroup` (matrixAutoUpdate false) with matrix = mirrorTransform(state).matrix, added to
 *    the main scene; its children are the twins.
 *  geometry: each twin SHARES its primary mesh's BufferGeometry (no copy): the CPU-skinned left-arm muscles update
 *    their position / normal attributes in place, so the mirror follows for free; Body Worlds offsets must live in the
 *    geometry or in the per-mesh matrices (not only in a material shader) so the twin gets them too.
 *  transform: twin.matrix = the primary mesh's IN-PLACE world matrix every frame (matrixAutoUpdate false):
 *    full-body meshes (body records, the face meshes INCLUDED): bodyFrame x mesh.matrix (NOT the face-layer ghost or
 *    inset matrix: the mirror shows the head and face in place); left-arm bones and muscles: mesh.matrixWorld (camera
 *    x armGroup x mesh); then mirrorGroup.updateMatrixWorld(true).
 *  materials: twins use their OWN opaque materials (transparent false, depthWrite true, no torso see-through, no
 *    over-the-brain ghost, no arm ghost window: those are first-person effects for your own body). They must stay
 *    opaque so they are drawn before the glass brain and show through it. Copy the activity colour whenever the
 *    primary is reshaded: color, emissive, emissiveIntensity (shared ramp, same meaning). Bones share one bone twin
 *    material.
 *  marks: the persistent "switched on" shade lives on the brain areas, so nothing extra is needed for the body; if a
 *    later round marks muscles, copy that shade the same way.
 *  visibility: twin.visible = primary.visible (LOD / quality steps); the whole group hides only through an Esc
 *    option, never by itself.
 *  glow: each glow link has a second end on the mirror: mirrorPoint(primaryEnd, transform) (and mirrorNormal for an
 *    offset along the surface); intensity and colour are the same as the primary link.
 *  picking: raycast the twins (Three handles the negative determinant) or map the ray with primaryRay and pick the
 *    primary body; then mirrorInputTarget decides whether the brain catches it.
 */
export const MIRROR_SYNC = Object.freeze({
  group: 'mirrorGroup.matrix = mirrorTransform(state).matrix',
  geometry: 'shared BufferGeometry per twin',
  bodyTwinMatrix: 'bodyFrame x primaryMesh.matrix (face meshes in place)',
  armTwinMatrix: 'primaryMesh.matrixWorld (camera x armGroup x mesh)',
  material: 'own opaque material; copy color, emissive, emissiveIntensity from the primary',
  glow: 'mirrorPoint(primaryEnd, transform)',
  picking: 'raycast twins or primaryRay; then mirrorInputTarget',
  neverAutonomous: 'the mirror orbit changes only through applyMirrorOrbit input; resetMirror on Reset brain view'
});
