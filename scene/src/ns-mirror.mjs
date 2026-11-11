/**
 * NeuroSurge mirror body (R5-mirror, lead decision D19; user requirement R23, 2026-11-08T21:54Z).
 *
 * Historical (R23, the placement half of it overturned by R558 below): "a mirror body that initially, when you start the game, is behind the brain. And given the brain's translucent ...
 * you can see it behind the brain. And it will also have its own arrows, but of course those arrows will be closer to
 * the body and within and behind the brain. So to move the body around, you have to move the brain that's in front of
 * it away, and then you have to manipulate the body from then. And whatever activity is happening on your own body
 * will also be happening on the mirror body. But the mirror body will be facing you, essentially, and looking at you
 * ... you'll be able to turn that body around to look at the posterior. You'll be able to shift the orbit of that body
 * in any which direction."
 *
 * R558 (user, newest: "The mirror body should literally be a 1:1 perpendicular perfect reflection and it needs to be
 * coming from the exact same reflection angle at the beginning until manipulated"; "If we imagine an invisible ground,
 * the mirror body should be touching the same ground. The ground is flat and has no incline or decline whatsoever."):
 * the earlier placement (a scaled, turned copy fitted into a free box inside the brain) is overturned. At the start and
 * after a reset the mirror body is EXACTLY your body reflected in one vertical plane: scale 1, no tilt, no turn, no
 * offset; the image is as far behind the plane as you are in front of it, at the same height, on the same ground.
 *
 * PURE module (no DOM, no Three, importable in Node). It owns:
 *   1. placement: the literal plane reflection (mirrorReflectionPlacement): a vertical plane square to the body's
 *      forward axis, a distance d in front of the eye, d = the posed body's forward extent from the eye plus a few
 *      centimetres (MIRROR_REFLECTION). The plane is fixed in the world once set (like a mirror on a stand); the scene
 *      sets it from the posed body at the start and at a reset. It does not depend on the brain at all;
 *   2. the mirror transform (mirrorTransform; det -1): the reflection, composed with the player's turn about the
 *      vertical axis through the image's centre, the player's push along the ground and the grasp carry. Nothing can
 *      tilt it, so it always stands on the same flat ground as your body;
 *   3. its own orbit state: yaw (wraps, any amount, so the back can be seen) and push (m, along the ground, away from
 *      the plane); pitch stays 0 (the ground is level). Click = one step, hold = gentle continuous change, never
 *      autonomous (mirrorOrbitStep, mirrorHoldSteps, applyMirrorOrbit, resetMirror);
 *   4. the frame of its four arrows (mirrorArrowFrame) for the arrow module;
 *   5. the state-sync contract from the primary body (MIRROR_SYNC) and the mapping of glow end points (mirrorPoint);
 *   6. plain texts for the panel and the Esc page (MIRROR_TEXT, mirrorPartName, mirrorInfoCard).
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

export const MIRROR_VERSION = 'ns-mirror-r558 (literal plane reflection on a level ground, 2026-11-11)';

/**
 * The mirror's arrow frame (mirrorArrowFrame): the arrows' gap outside the body's drawn extent and their size, as
 * fractions of the mirror body's drawn height. Display choices.
 */
export const MIRROR_VIEW = Object.freeze({ arrowGapFrac: 0.06, arrowSizeFrac: 0.16 });

/**
 * R558: the literal reflection (display choices; the numbers measured at run time are reported by the scene).
 *  clearanceM: the plane stands this far in front of the foremost point of the posed body, measured along the body's
 *    forward axis from the eye (with the limbs straight forward: the toes of the forward legs or the fingertips). As
 *    small as sensible, so the image is as tall on screen as a literal reflection can be, and the start-posture body
 *    never touches the plane. A limb that later reaches through the plane simply meets its reflection there.
 *  matrixTolerance: the start / reset matrix must equal the pure reflection to this, entry by entry (boot self-check).
 */
export const MIRROR_REFLECTION = Object.freeze({ clearanceM: 0.05, matrixTolerance: 1e-9 });

/** The rest-pose fallback body box (world m, seated BodyParts3D body at the default eye) used only when the integrator
 * passes no measured bounds: centre, half extents along body right / up / forward. Replaced by bodyBoundsFromPoints. */
export const MIRROR_FALLBACK_BODY = Object.freeze({
  centre: Object.freeze([0, -0.62, -0.18]), half: Object.freeze([0.32, 0.72, 0.45])
});

/**
 * Orbit of the mirror body (about its OWN vertical axis; the brain's step and hold speed).
 *  stepDeg: one click on a mirror arrow (= ns-brain BRAIN_VIEW.orbitStepDeg, 15).
 *  hold: holding an arrow keeps turning gently (= ns-scene-three ORBIT_HOLD: after 300 ms, 1.2 deg every 100 ms =
 *    12 deg/s, at most 5 steps banked per frame).
 *  pitchLimitDeg: 0. R558 (user: "the mirror body should be touching the same ground. The ground is flat and has no
 *    incline or decline whatsoever"): the mirror body is never tipped; a turn is only about the vertical axis through
 *    its centre, which keeps every point at its height, so it stays on the ground. Yaw has no limit (it wraps to
 *    (-180, 180]), so the body can be turned all the way round to show its back.
 *  push: the top and bottom arrows (and an up / down drag), which used to tip it, now slide it along the ground: away
 *    from you (top, drag up) or back toward you (bottom, drag down), in steps of perDegM metres per degree of the
 *    arrow step (a click 15 deg = 0.3 m, a held arrow 0.24 m/s, a drag 6 mm per px). 0 = where it stands (the literal
 *    reflection, or where you carried it); it never comes nearer than that (the plane is just in front of your toes
 *    and fingertips), and at most maxM farther.
 */
export const MIRROR_ORBIT = Object.freeze({
  stepDeg: 15, pitchLimitDeg: 0,
  hold: Object.freeze({ delayMs: 300, everyMs: 100, stepDeg: 1.2, maxStepsPerFrame: 5 }),
  push: Object.freeze({ perDegM: 0.02, maxM: 6 })
});

/** The four mirror orbit directions, named like the brain's (ns-app ORBIT_DIRS) so one arrow module serves both. */
export const MIRROR_DIRS = Object.freeze(['forward', 'back', 'left', 'right']);
/** Fixed compass position of each arrow on screen (R20: "a top arrow, a bottom arrow, a left arrow, and a right
 * arrow"). For the mirror body 'forward' (top) slides it away from you along the ground, 'back' (bottom) back toward
 * you, 'left' / 'right' turn it about its vertical axis (your viewpoint goes round its side, the body turns the other
 * way). */
export const MIRROR_COMPASS = Object.freeze({ forward: 'top', back: 'bottom', left: 'left', right: 'right' });
/** Step sign per direction ({ yaw, pitch, push } in steps): yaw > 0 = viewpoint toward screen right (same convention
 * as ns-brain ORBIT_DIRECTIONS); push > 0 = farther away along the ground; pitch is always 0 (never tipped). */
export const MIRROR_ORBIT_DIRECTIONS = Object.freeze({
  left: Object.freeze({ yaw: -1, pitch: 0, push: 0 }), right: Object.freeze({ yaw: 1, pitch: 0, push: 0 }),
  forward: Object.freeze({ yaw: 0, pitch: 0, push: 1 }), back: Object.freeze({ yaw: 0, pitch: 0, push: -1 })
});
const DIR_ALIASES = Object.freeze({ top: 'forward', up: 'forward', bottom: 'back', down: 'back', left: 'left', right: 'right', forward: 'forward', back: 'back' });

/** Plain texts (R17: simple words). The integrator may move them into ns-text; the honesty meaning must stay. */
export const MIRROR_TEXT = Object.freeze({
  name: 'Mirror body',
  tag: 'A mirror image of your body',
  label: 'Mirror body (a mirror image of you)',
  lead: 'This is a mirror image of your own body, as in a real mirror in front of you. It copies every move you make. Your left arm shows on the same side of the screen.',
  explanation: 'It shows the same pose and the same made-up signal colours as your body, at the same time. It is only a picture. It is not a second person.',
  arrows: 'Click the side arrows of the mirror body to turn it one step, or the top and bottom arrows to slide it away or back. Hold an arrow to keep going. Turn it all the way round to see its back.',
  turned: 'You are looking at the mirror body from another side. Reset brain view puts it back.',
  reset: 'Reset mirror body',
  resetHelp: 'Puts the mirror body back where a real mirror would show you.',
  simulated: 'Everything here is simulated.',
  escRow: 'Mirror body: hold F on it and look or use W/A/S/D to carry it along the ground. Its side arrows turn it; its top and bottom arrows slide it away or back.',
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
 * Bounds of the primary body from world points (flat xyz, metres) of the POSED body (the full body, the left arm as
 * drawn and the head), in the body's own axes: right = up x back, up = world up, forward = the body's facing direction
 * (default -z, i.e. body yaw 0).
 * Returns { centre (world, the box centre = the mirror's orbit pivot), half: [right, up, forward] half extents,
 *   radius (bounding sphere about the centre), height, width, depth, forward, right, count, sample (Float64Array flat xyz,
 *   at most sampleMax of the points, for on-screen boxes) }.
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
  // A small sample of the points (at most sampleMax) for on-screen boxes (the scene's mirrorSamplesWorld).
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

/* ------------------------------------------------------------------ the literal plane reflection */

/**
 * The pure reflection in the plane { x : n . x = offset } (n a unit normal): x -> x - 2 (n . x - offset) n, i.e.
 * linear part I - 2 n n^T and translation 2 offset n (4x4 column-major, det -1). Written out entry by entry, without
 * any composition, so a check can compare a composed matrix with it.
 */
export function pureReflectionMatrix(normal, offset) {
  const n = vec3(normal, 'normal');
  if (Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) > 1e-12) fail('input', 'the plane normal must be a unit vector');
  if (!Number.isFinite(offset)) fail('input', 'the plane offset must be finite');
  const [x, y, z] = n, m = identity();
  m[0] = 1 - 2 * x * x; m[4] = -2 * x * y; m[8] = -2 * x * z;
  m[1] = -2 * x * y; m[5] = 1 - 2 * y * y; m[9] = -2 * y * z;
  m[2] = -2 * x * z; m[6] = -2 * y * z; m[10] = 1 - 2 * z * z;
  m[12] = 2 * offset * x; m[13] = 2 * offset * y; m[14] = 2 * offset * z;
  return m;
}

/** Largest |a[i] - b[i]| over the 16 entries (Infinity when either is not a finite 4x4). */
export function matrixMaxDiff(a, b) {
  if (!a || !b || a.length !== 16 || b.length !== 16) return Infinity;
  let d = 0;
  for (let i = 0; i < 16; i++) { const v = Math.abs(a[i] - b[i]); if (!Number.isFinite(v)) return Infinity; if (v > d) d = v; }
  return d;
}

/**
 * Where the mirror body stands at the start and after a reset: your posed body reflected in a VERTICAL plane square to
 * the body's forward axis, a distance d in front of the eye. Composed with nothing else (scale 1, no tilt, no turn, no
 * offset), so the image is as far behind the plane as the body is in front of it and at the same height: its lowest
 * point is on the same flat ground as yours, and its head is at your eye level.
 *   body: bodyBoundsFromPoints(...) of the POSED body (world m; forward = the body's facing direction, horizontal).
 *   eye: the eye (world m) when the plane is set.
 *   foremostM: optional, the body's largest extent along forward measured from the eye on the real vertices (the scene
 *     measures it); without it the extent of the measured box is used (never short: the box holds every point).
 *   clearanceM: MIRROR_REFLECTION.clearanceM.
 * Returns a frozen { kind: 'ns-mirror-placement', rule: 'literal-reflection', plane { normal, offsetM, pointM, eyeM,
 *   distanceM (d), foremostM, clearanceM }, matrix (the pure reflection), centre (the image of the body's box centre:
 *   the pivot of the turn), distanceM (eye to that centre), scale 1, toward / right / up (the frame of the turn:
 *   toward = from the image toward you, horizontal; up = world up), facingYawDeg 0, reflectAxis, bodyCentre, body }.
 */
export function mirrorReflectionPlacement({ body, eye, foremostM = null, clearanceM = MIRROR_REFLECTION.clearanceM } = {}) {
  if (!body || !isVec3(body.centre) || !(Array.isArray(body.half) || ArrayBuffer.isView(body.half))) fail('input', 'body must be a bodyBoundsFromPoints result of the posed body');
  const e = vec3(eye, 'eye');
  const f0 = body.forward ? vec3(body.forward, 'body.forward') : [0, 0, -1];
  if (!(Math.hypot(f0[0], f0[2]) > 1e-9)) fail('input', 'body.forward must have a horizontal part');
  // The plane is VERTICAL: its normal is the body's forward axis with the vertical part removed (exactly 0).
  const n = normalize([f0[0], 0, f0[2]]);
  n[1] = 0;
  if (!(Number.isFinite(clearanceM) && clearanceM >= 0)) fail('input', 'clearanceM must be >= 0');
  const c0 = vec3(body.centre, 'body.centre');
  const boxFore = dot(c0, n) + body.half[2] - dot(e, n);
  const fore = Number.isFinite(foremostM) ? foremostM : boxFore;
  if (!(fore > 0)) fail('input', 'the posed body must reach in front of the eye');
  const d = fore + clearanceM;
  const offset = dot(e, n) + d;
  const matrix = pureReflectionMatrix(n, offset);
  const centre = transformPoint(matrix, c0);
  const toward = scale(n, -1).map(v => v + 0);
  const right = normalize(cross(UP, toward)).map(v => v + 0);
  return freeze({
    kind: 'ns-mirror-placement', rule: 'literal-reflection',
    plane: freeze({ normal: freeze(n), offsetM: offset, pointM: freeze(add(e, scale(n, d))), eyeM: freeze(e), distanceM: d, foremostM: fore, boxForemostM: boxFore, clearanceM }),
    matrix: freeze(Array.from(matrix)), centre: freeze(centre), distanceM: length(sub(centre, e)), scale: 1,
    toward: freeze(toward), right: freeze(right), up: UP, facingYawDeg: 0, reflectAxis: freeze(n), bodyCentre: freeze(c0), body
  });
}

/* ------------------------------------------------------------------ state, orbit, reset */

/** A fresh mirror state: { kind, placement (or null until the body is measured), orbit { yaw, pitch, push } (deg, deg,
 * m), hold, worldCentre (null = not carried) }. */
export function createMirrorState(placement = null) {
  if (placement !== null && (!placement || placement.kind !== 'ns-mirror-placement')) fail('input', 'placement must be a mirrorReflectionPlacement result or null');
  return freeze({ kind: 'ns-mirror-state', placement, orbit: freeze({ yaw: 0, pitch: 0, push: 0 }), hold: null, worldCentre: null });
}

/** The same state with a new placement (the plane set again); the orbit and hold are kept. */
export function placeMirror(state, placement) {
  if (!state || state.kind !== 'ns-mirror-state') fail('input', 'state must be a createMirrorState result');
  if (!placement || placement.kind !== 'ns-mirror-placement') fail('input', 'placement must be a mirrorReflectionPlacement result');
  return freeze({ ...state, placement });
}

/** Normalise a direction ('forward' | 'back' | 'left' | 'right', or the compass names 'top' | 'bottom' / 'up' |
 * 'down'); null when unknown. */
export function mirrorDir(dir) { return typeof dir === 'string' && DIR_ALIASES[dir] ? DIR_ALIASES[dir] : null; }

/** One step from `orbit` in direction `dir` (pure): left / right turn the yaw by stepDeg (wraps); forward / back slide
 * the push by stepDeg x MIRROR_ORBIT.push.perDegM metres (0 .. maxM). Pitch stays within +-pitchLimitDeg (0: the
 * mirror body is never tipped). */
export function mirrorOrbitStep(orbit, dir, { stepDeg = MIRROR_ORBIT.stepDeg, pitchLimitDeg = MIRROR_ORBIT.pitchLimitDeg, push = MIRROR_ORBIT.push } = {}) {
  const d = mirrorDir(dir);
  if (!d) fail('input', `direction must be one of ${MIRROR_DIRS.join(', ')} (or top, bottom, up, down); got ${dir}`);
  if (!(Number.isFinite(stepDeg) && stepDeg > 0)) fail('input', 'stepDeg must be > 0');
  const s = MIRROR_ORBIT_DIRECTIONS[d];
  const yaw = orbit && Number.isFinite(orbit.yaw) ? orbit.yaw : 0, pitch = orbit && Number.isFinite(orbit.pitch) ? orbit.pitch : 0;
  const p0 = orbit && Number.isFinite(orbit.push) ? orbit.push : 0;
  return freeze({ yaw: wrapDeg(yaw + s.yaw * stepDeg), pitch: clamp(pitch + s.pitch * stepDeg, -pitchLimitDeg, pitchLimitDeg) + 0,
    push: clamp(p0 + s.push * stepDeg * push.perDegM, 0, push.maxM) + 0 });
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

/** Reset: the mirror body is the literal reflection again (no turn, no push, no carried place, no hold). Call it from
 * Reset brain view (and from a separate "Reset mirror body" if the Esc page offers one); the scene then sets the plane
 * again from the posed body. */
export function resetMirror(state) {
  if (!state || state.kind !== 'ns-mirror-state') fail('input', 'state must be a createMirrorState result');
  return freeze({ ...state, orbit: freeze({ yaw: 0, pitch: 0, push: 0 }), hold: null, worldCentre: null });
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
 *   M = T(push) . T(centre) . B . O(yaw) . B^T . Ry(facingYaw) . S(scale) . Reflect(bodyForward) . T(-bodyCentre)
 * B = [right up toward] (up = world up, toward horizontal), so O(yaw) turns the image about the vertical axis through its
 * centre; pitch is 0 (MIRROR_ORBIT.pitchLimitDeg), facingYaw 0 and scale 1 for the literal reflection, so at orbit 0,
 * push 0 and no carry M is exactly placement.matrix (the pure reflection). A carried place (placement.worldCentre, the
 * grasp carry) replaces the centre; push then slides it along the ground away from the plane's eye (horizontal).
 * det(M) = -scale^3 < 0 (a mirror image; Three flips the front face for it automatically). Returns a frozen
 * { kind: 'ns-mirror-transform', matrix, inverse, linear (3x3 as 4x4, no translation), det, centre (drawn), carryCentre
 *   (the centre without the push: what a grasp carries), push, scale, frame { right, up, toward }, orbit, placement }.
 */
export function mirrorTransform(state) {
  if (!state || state.kind !== 'ns-mirror-state') fail('input', 'state must be a createMirrorState result');
  const p = state.placement;
  if (!p) fail('state', 'the mirror has no placement yet (placeMirror after the body is measured)');
  const B = basis4(p.right, p.up, p.toward);
  const pitch = clamp(Number.isFinite(state.orbit.pitch) ? state.orbit.pitch : 0, -MIRROR_ORBIT.pitchLimitDeg, MIRROR_ORBIT.pitchLimitDeg);
  const O = mirrorOrbitLocal(state.orbit.yaw, pitch);
  const F = rotY(p.facingYawDeg * DEG);
  const lin = multiply(B, multiply(O, multiply(transpose3(B), multiply(F, multiply(uniformScale(p.scale), reflectionMatrix(p.reflectAxis))))));
  const matrix = multiply(translation(p.centre), multiply(lin, translation(scale(p.bodyCentre, -1))));
  const carryCentre = p.worldCentre ? vec3(p.worldCentre, 'persistent mirror world centre') : [p.centre[0], p.centre[1], p.centre[2]];
  for (let i = 0; i < 3; i++) matrix[12 + i] += carryCentre[i] - p.centre[i];
  // Push: along the ground (horizontal), away from the eye the plane was set from; never vertical.
  const push = clamp(Number.isFinite(state.orbit.push) ? state.orbit.push : 0, 0, MIRROR_ORBIT.push.maxM);
  let away = p.plane ? [carryCentre[0] - p.plane.eyeM[0], 0, carryCentre[2] - p.plane.eyeM[2]] : [0, 0, 0];
  away = Math.hypot(away[0], away[2]) > 1e-6 ? normalize(away) : scale(p.toward, -1);
  away[1] = 0;
  const pushV = scale(away, push);
  for (let i = 0; i < 3; i++) matrix[12 + i] += pushV[i];
  const centre = add(carryCentre, pushV);
  const inverse = invertAffine(matrix);
  return freeze({
    kind: 'ns-mirror-transform', matrix, inverse, linear: lin, det: det3(matrix), centre, carryCentre, push, scale: p.scale,
    frame: freeze({ right: p.right, up: p.up, toward: p.toward }), orbit: state.orbit, placement: p
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
 * around the body). The arrows keep FIXED compass positions on screen (top / bottom / left / right in the view frame),
 * at the drawn body's current extent (its oriented box's support in that direction, so they hug the body whichever way
 * it is turned) plus a gap. Every position lies in the plane through the mirror centre facing the eye (R558: in front
 * of the brain at the start, since the literal reflection stands just beyond your toes and fingertips).
 * Returns a frozen { kind: 'ns-mirror-arrow-frame', centre, right, up, toward (unit, world), extent { forward, back,
 *   left, right } (m from the centre, along up / -up / -right / right), radius (the body's bounding sphere, m), gapM,
 *   sizeM (suggested arrow length), anchors { forward, back, left, right: { position, outward (unit), compass, orbit } },
 *   scale, orbit }.
 * 'forward' sits at the TOP and slides the body away along the ground (R558; it no longer tips it); 'back' at the
 * bottom slides it back; 'left' / 'right' at the sides turn it (the same names and yaw signs as the brain's arrows).
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
 *    opaque so they are drawn before the glass brain: glass in front of them only tints them, glass behind them is
 *    hidden by them (the literal reflection stands in front of the brain at the start). Copy the activity colour whenever the
 *    primary is reshaded: color, emissive, emissiveIntensity (shared ramp, same meaning). Bones share one bone twin
 *    material.
 *  marks: the persistent "switched on" shade lives on the brain areas, so nothing extra is needed for the body; if a
 *    later round marks muscles, copy that shade the same way.
 *  visibility: twin.visible = primary.visible (LOD / quality steps); the whole group hides only through an Esc
 *    option, never by itself.
 *  glow: each glow link has a second end on the mirror: mirrorPoint(primaryEnd, transform) (and mirrorNormal for an
 *    offset along the surface); intensity and colour are the same as the primary link.
 *  picking: raycast the twins (Three handles the negative determinant) or map the ray with primaryRay and pick the
 *    primary body; the nearer of the brain and the mirror body takes the input.
 */
export const MIRROR_SYNC = Object.freeze({
  group: 'mirrorGroup.matrix = mirrorTransform(state).matrix',
  geometry: 'shared BufferGeometry per twin',
  bodyTwinMatrix: 'bodyFrame x primaryMesh.matrix (face meshes in place)',
  armTwinMatrix: 'primaryMesh.matrixWorld (camera x armGroup x mesh)',
  material: 'own opaque material; copy color, emissive, emissiveIntensity from the primary',
  glow: 'mirrorPoint(primaryEnd, transform)',
  picking: 'raycast twins or primaryRay; the nearer of brain and mirror takes the input',
  neverAutonomous: 'the mirror orbit changes only through applyMirrorOrbit input; resetMirror on Reset brain view',
  start: 'orbit 0, push 0, not carried: matrix = placement.matrix (the pure plane reflection) to MIRROR_REFLECTION.matrixTolerance'
});
