/** NeuroSurge scene: the LEFT arm, attached at the anatomical left shoulder, placed so the whole hand stays on screen.
 *
 * Pure ES module (browser and Node; imports only ./ns-math, ./ns-rig and ./ns-colors).
 *
 * Frames
 *  - Rig rest pose: BodyParts3D source millimetres, +x subject LEFT, +y POSTERIOR, +z SUPERIOR (ns-rig).
 *  - World: Three metres with the EYE at the origin, +y up; the standing body faces -z at body yaw 0
 *    (ns-math bodyToWorldMatrix). The player's body is fixed in place.
 *  - Camera: Three convention (+x right, +y up, looking along -z); world = lookRotation(yaw, pitch) * camera.
 * The arm is solved in CAMERA space, but the shoulder is no longer a camera-attached constant (U3a, round 2):
 * armAttachment() puts the rig's glenohumeral pivot where the anatomical left shoulder is (body frame, eye at the
 * camera) in camera coordinates for the current look. Looking around therefore moves the shoulder in camera space and
 * the shoulder joint carries the arm so that the hand keeps its screen position (user R8: shoulder flexion/extension
 * follows the camera view; R9: the hand is locked to the view vertically).
 *
 * Placement rules (user R3, R9, R10 and the R9 history notes "the hand cannot go beyond the borders of your field of view")
 *  - The hand centre (vertex centroid of metacarpals 2-5) lies exactly on the camera ray through NDC (xNdc, yNdc) with
 *    yNdc = HAND_Y_NDC = +0.5, three quarters up the screen. It never moves vertically on screen.
 *  - A/D change xNdc; W/S change the depth along that ray inside a per-anchor DEPTH WINDOW [near, far]: far = the arm's
 *    reach (elbow nearly straight), near = the depth at which the projected hand height is at most maxHandHeightNdc.
 *  - The A/D range depends on the viewport and the look (the shoulder moves in camera space), never on the pose. Tier
 *    'full': every pose of the per-joint envelope grid (wrist within ANCHOR_WRIST_RANGE_DEG, every digit joint over its
 *    whole range, the forearm pronation range) fits inside the margins at the anchor's reach; where no anchor admits
 *    that (the arm near full reach: high pitch, looking right), tier 'game' requires it of the game's held poses
 *    (GAME_POSES) in every rotation state. Ranges are cached per quantised look in a bounded LRU, warm-started.
 *  - The whole hand (every hand and digit box corner plus the forearm-support box) is re-checked each frame; a pose that
 *    does not fit is pushed deeper along the same ray, then the displayed wrist is eased toward a fitting angle (wrist
 *    clamp), never sideways. Fallbacks that move x are flagged and were never needed in the U3a test matrix.
 *  - Looking far to the side beyond ARM_YAW_FREE_DEG turns the trunk (bodyYawForLook) instead of tearing the arm off.
 *
 * IK: for a given pose the elbow-to-hand-centre chain (ulna, pronation turn, wrist and hand) is rigid, so the 2-bone
 * problem shoulder -> elbow -> hand centre is solved in closed form: the elbow angle from the shoulder-to-hand distance,
 * then one shoulder rotation that sends the rest shoulder-to-hand direction onto the target direction and the rest elbow
 * axis onto the normal of the (shoulder, hand target, pole) plane. The pole (elbow down and out, BODY_POLE_DIR, blended
 * toward BODY_POLE_DIR_OVERHEAD for overhead looks) is fixed in the BODY frame, and the glenohumeral centre rises with
 * the anticipated elevation (GIRDLE_ELEVATION). Elbow flexion is limited to 0..145 deg and the wrist reach to
 * WRIST_REACH_FRACTION of the arm; the shoulder is reported against SHOULDER_LIMITS (display approximations).
 *
 * R5-pronation (user note 2026-11-08T23:43Z, R27: "as we externally or internally rotate our left arm, the rest of the
 * body will follow correspondingly ... normal joint mechanics"): the double-tap palm turn is SHARED between the forearm
 * and the shoulder (ROTATION_COUPLING). joints.forearm_pronation stays the commanded TOTAL palm turn (+80 palm down ..
 * -80 palm up). Going from palm down toward palm up, the upper arm turns outward at the shoulder (external rotation:
 * the elbow swings in toward the body about the shoulder -> hand-centre line, so the hand centre does not move), the
 * radius turns about the ulna by the rest of the turn, the shoulder blade slides back a little (retraction) and the upper
 * trunk turns a little toward the arm's side; going back toward palm down the upper arm turns inward again (internal
 * rotation). The shoulder's share is larger when the elbow is straighter. Palm down is the reference pose (no coupling),
 * so the start pose is exactly the round-4 pose. See ROTATION_COUPLING, rotationCoupling() and fitHand().coupling.
 *
 * Everything here is a simulated, unitless display rig. A/D, W/S, Space and gaze are virtual game inputs, not measured
 * motion, EMG, force, stimulation or decoding.
 */
import {
  add, sub, scale, dot, cross, length, normalize, reject, clamp, frame, multiply, translation, uniformScale,
  rotationAxisAngle, rotationAboutPivot, basis, rotationTranspose, transformPoint, transformDirection,
  projectToNdc, pointOnNdcRay, fibonacciDirections, pruneExtremes, lookRotation, rotationY, bpToWorldAxes,
  bodyToWorldMatrix, rigidInverse, pointSegmentDistance, smoothstep, DEG
} from './ns-math.mjs';
import {
  forwardKinematics, handLocalMatrices, wristMatrix, forearmHandMatrix, normalizeJoints, jointMatrix, HAND_SEGMENTS,
  FIST_POSE_DEG, REST_HAND_POSE_DEG, DIGITS, PRONATION_RANGE_DEG, PRONATION_STATES
} from './ns-rig.mjs';
import { activityColor, activityShade, hexToLinear } from './ns-colors.mjs';

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };

/** Vertical NDC of the hand centre: three quarters up the screen (user note 2026-11-08T03:12Z, R10). */
export const HAND_Y_NDC = 0.5;

/**
 * Elbow pole direction in the BODY frame (world axes at body yaw 0: +x the person's right, +y up, +z backward): DOWN and
 * OUT (about 27 deg lateral of straight down, to the left of the left shoulder) and slightly back. The user moved the hand to three quarters
 * height "so that you can see more of the arm": with the elbow down the forearm rises from the bottom of the screen to
 * the hand (about 90% of the forearm in view at look 0/0, the elbow just below the bottom edge, and the elbow plus a
 * quarter to two thirds of the upper arm in view when looking 30-60 deg down). A lateral pole ([-0.9, -0.35, 0.25],
 * tried first) gave wider pose-independent A/D ranges but threw the elbow off the left edge and showed only ~43-57% of the
 * forearm; straight down ([-0.15, -1, 0.1]) gave the same view with a narrower W/S window (U3a notes, pole sweeps).
 * Every shoulder report of the sweeps stayed inside SHOULDER_LIMITS.
 */
export const BODY_POLE_DIR = Object.freeze(normalize([-0.45, -0.9, 0.15]));
/** Pole for an OVERHEAD reach (elbow out to the side): armAttachment blends BODY_POLE_DIR toward it by
 * smoothstep over POLE_OVERHEAD_ELEVATION_DEG of the anticipated humeral elevation (see GIRDLE_ELEVATION), so looking
 * far up keeps every pose showable while the neutral look (~120 deg anticipated) keeps the elbow down. */
export const BODY_POLE_DIR_OVERHEAD = Object.freeze(normalize([-0.9, -0.35, 0.25]));
export const POLE_OVERHEAD_ELEVATION_DEG = Object.freeze([140, 175]);

/**
 * Camera-attached FALLBACK shoulder (camera metres): the BodyParts3D left glenohumeral pivot relative to the
 * brain-derived eye estimate (ns-assets eyePosition: 164 mm lateral, 214 mm below, 90 mm behind the eye) at yaw = pitch
 * = 0. Only used when no armAttachment is passed (legacy callers and tests); the game passes the per-look attachment.
 */
const FALLBACK_SHOULDER_CAM = Object.freeze([-0.164, -0.214, 0.09]);

/**
 * Arm defaults (metres, NDC).
 *  shoulderCam / pole: the fallback attachment at look (0, 0) (the pole is a camera-space POINT, shoulder + BODY_POLE_DIR).
 *  yNdc: vertical NDC of the hand centre (HAND_Y_NDC).
 *  maxHandHeightNdc: projected hand height cap for the near end of the W/S window (2 = full height = no cap). U3a sets
 *    no cap: at the three-quarter ray the arm's reach (~0.35-0.5 m) already keeps the hand moderate, the whole-hand fit
 *    pushes a too-large pose deeper, and a cap collapsed the W/S window to zero at many looks.
 *  minReachSpanM: the A/D range keeps at least this much W/S depth window.
 *  minFitSpanM (R4-arm): at every anchor of the A/D range the REST hand palm down (REST_HAND_POSE_DEG, the start state)
 *    fits whole over at least this much of the far end of the W/S window, so W and S visibly move the hand everywhere in
 *    the range (round 3 M2: at the extreme left anchor the rest hand fitted only over 9 mm, so W/S looked dead there).
 *    0 = off (round-3 behaviour). Palm up is not required (see handEnvelope restLevels).
 *  reachGirdle (R4-arm): the shoulder-girdle reach shift (REACH_GIRDLE; false = off, round-3 behaviour).
 *  reachComfort (R4-arm): the A/D range keeps the palm-down rest hand's arm inside SHOULDER_LIMITS and at least
 *    ARM_EYE_CLEARANCE_M from the eye (false = off, round-3 behaviour).
 *  widerTier (R4-arm): the A/D range uses the 'game' tier at every look (TIER_NOTE; false = round 3: 'full' whenever any
 *    anchor admits it).
 *  viewLimitsNdc (R4-arm): null (the whole view) or { left, right, bottom, top } in NDC (each in (0, 1]): the part of
 *    the view the whole hand must stay in, e.g. right = the left edge of the far-right information column, so the hand
 *    never slides under the panel (ns-app passes it from infoPanelRect; portrait: bottom = the top of the bottom band).
 *    Each side is also limited by marginNdc. Asymmetric limits only shrink the A/D range and the fit; the hand centre
 *    stays on its ray.
 */
export const ARM_DEFAULTS = Object.freeze({
  shoulderCam: FALLBACK_SHOULDER_CAM,
  pole: Object.freeze(add(FALLBACK_SHOULDER_CAM, BODY_POLE_DIR)),
  yNdc: HAND_Y_NDC,
  fovYDeg: 70,
  near: 0.02,
  marginNdc: 0.04,
  nearMargin: 0.03,
  xNdcStart: -0.3,
  depthStart: 0.3,
  xSpeedNdcPerS: 0.9,
  depthSpeedMPerS: 0.3,
  minDepth: 0.22,
  maxHandHeightNdc: 2,
  minReachSpanM: 0.03,
  // R3-arm: reach input ramp time (s), see REACH_RAMP_S (literal here because ARM_DEFAULTS is built first).
  reachRampS: 0.06,
  // R4-arm: usable W/S travel of the rest hand at every A/D anchor (m), see the list above.
  minFitSpanM: 0.05,
  // R4-arm: shoulder-girdle protraction when the hand reaches across the body (REACH_GIRDLE, defined below).
  reachGirdle: true,
  // R4-arm: the A/D range keeps the rest hand's arm inside SHOULDER_LIMITS and ARM_EYE_CLEARANCE_M (see anchorRange).
  reachComfort: true,
  // R4-arm: the game tier at every look (TIER_NOTE) instead of 'full' whenever any anchor admits it.
  widerTier: true,
  // R4-arm: the part of the view the whole hand stays in (null = all of it), see the list above.
  viewLimitsNdc: null,
  // R5-input: the W/S wind-up guard (fitHand depthLimits.maxDepth) ends at the anchor window's far end, where the game
  // keeps a held W's intent, instead of the arm's full reach along the ray (fitHand, WS_GUARD_SNAP_M). false = round 4.
  wsGuardAtWindow: true,
  // R5-pronation (R27): the palm turn shared by the forearm, the shoulder, the shoulder blade and the upper trunk
  // (ROTATION_COUPLING; false = round 4: the forearm alone turns).
  rotationCoupling: true
});

/**
 * Wrist band (deg) of the envelope used for the A/D range and the W/S window. Strong wrist flexion or extension near
 * neutral rotation points the fingers up the screen; with the hand centre locked at three quarters height and the arm
 * near full reach no anchor can show such a hand whole, so those poses are handled per frame by the wrist-posture clamp
 * (fitHand clamped.wrist) instead of shrinking the range for every pose.
 */
export const ANCHOR_WRIST_RANGE_DEG = Object.freeze([-30, 30]);
/** Pronation levels (deg) of the A/D-range tiers (the per-frame fit always checks the exact angle). */
export const RANGE_PRONATION_LEVELS = Object.freeze([-80, -40, 0, 40, 80]);
/** Wrist-posture clamp search step (deg): the displayed wrist angle moves toward 0 in these steps until the hand fits. */
export const WRIST_CLAMP_STEP_DEG = 5;
/** Steps of the last-resort anchor search (per target) when a pose fits nowhere at the requested anchor. */
const X_SEARCH_STEPS = 20;

export const ELBOW_MAX_DEG = 145;
/** The shoulder-to-wrist distance never exceeds this fraction of upper arm + forearm length (no locked elbow). */
export const WRIST_REACH_FRACTION = 0.99;
/** stepReach keeps its un-fitted state within [-1, 1] x [minDepth, this] to avoid integrator wind-up. */
export const REACH_STATE_MAX_DEPTH = 1.0;

/**
 * Look yaw (deg) inside which the body (and so the shoulder) stays still: `right` for looks to the right (negative yaw),
 * `left` for looks to the left. Beyond it bodyYawForLook turns the trunk by the excess so that the left hand can still
 * reach its screen position without passing through the face: looking right, the LEFT arm must cross the body (at 90 deg
 * the humerus leaves the horizontal-adduction range and the arm passes within ~9 cm of the eye; at 45 deg it keeps
 * about 13 cm), looking left it
 * abducts freely. A person whose feet are fixed can turn the trunk; the neck and eyes alone give roughly 70-90 deg
 * (cited from memory). The integrator applies the same yaw to the body meshes (armAttachment().bodyToWorld) or clamps
 * the look yaw to this range instead.
 */
export const ARM_YAW_FREE_DEG = Object.freeze({ right: 45, left: 100 });

/**
 * Shoulder (glenohumeral + girdle) display limits for the humerus direction in the body frame, reported by fitHand:
 * elevation (angle from hanging straight down) <= elevationMaxDeg; plane of elevation (0 = abduction in the coronal
 * plane, 90 = forward flexion, > 90 across the body, < 0 behind the coronal plane) within [planeMinDeg, planeMaxDeg]
 * once the arm is elevated more than planeFreeBelowDeg. Approximate adult active ranges (flexion ~180, horizontal
 * adduction ~130-140, horizontal abduction ~30-45 deg; cited from memory, Root reference qualification pending).
 */
export const SHOULDER_LIMITS = Object.freeze({ elevationMaxDeg: 180, planeMinDeg: -45, planeMaxDeg: 140, planeFreeBelowDeg: 35 });

/**
 * Shoulder-girdle elevation with overhead reach (scapulohumeral rhythm, display approximation): as the humerus is raised
 * beyond elevationStartDeg the scapula rotates upward and the clavicle elevates, lifting the glenohumeral centre. The
 * shift (body frame metres: +y up, -z forward, +x toward the body's right = medial for the left shoulder) reaches
 * shiftAtFullM at elevationFullDeg, eased by smoothstep. It is ANTICIPATED from the look (the humeral elevation needed
 * to reach the hand ray at nominalDepthM), so the attachment stays a pure function of the look. Typical magnitudes of
 * a few centimetres (cited from memory; Root reference qualification pending). armAttachment reports girdleShiftM so
 * the body renderer can raise the left clavicle/scapula to match.
 */
export const GIRDLE_ELEVATION = Object.freeze({
  elevationStartDeg: 70, elevationFullDeg: 170, shiftAtFullM: Object.freeze([0.012, 0.04, -0.012]), nominalDepthM: 0.3, nominalXNdc: -0.3
});

/**
 * R4-arm: shoulder-girdle REACH shift (scapular protraction, display approximation). A seated person reaching with the
 * left hand across the body toward the right does not only adduct the arm at the shoulder joint: the shoulder blade
 * glides forward around the rib cage (protraction) and the shoulder comes a little toward the midline, so the hand
 * can cross the midline well past the right shoulder line. Round 3 kept the glenohumeral centre fixed for every A/D
 * anchor, so the reach ran out a little right of the screen centre (A/D range x -0.609 .. +0.219 at the start look,
 * round3/FIX-REPORT.md F6).
 *
 * How it works. The A/D anchor x drives it: w = smoothstep((x - startXNdc) / (fullXNdc - startXNdc)) moves the
 * glenohumeral centre (and the elbow pole with it) by w * shiftAtFullM (BODY frame metres: +x toward the body's right =
 * toward the midline for the left shoulder, +y up, -z forward). It is zero at and left of the start anchor (x -0.3), so
 * the start pose and every look with the hand there are exactly as in round 3, and it depends only on the anchor x:
 * never on the look (the look still moves the shoulder through the attachment, user R8: the shoulder follows the
 * camera), the W/S depth or the hand pose. So W/S stay pure depth moves, a look never moves the hand (S04), and D gives
 * the coordinated shoulder + elbow + wrist movement of R8 (the shoulder blade slides forward as the hand goes right).
 * The hand centre stays on its ray at y = +0.5; only the arm solution behind it changes. A body-angle drive (how far the
 * hand line crosses the body) was tried first: it also shifted the shoulder when only the look changed, which breaks
 * the round-3 contract that a look moves the shoulder only through the attachment (U3a placement test).
 *
 * Values (display choices, cited from memory, Root reference qualification pending): scapular protraction moves the
 * shoulder forward by a few centimetres (the shoulder blade glides roughly 10-15 cm around the chest wall between full
 * retraction and full protraction) and the clavicle rises a little with a forward-and-up reach; 3.5 cm forward, 2 cm
 * toward the midline and 0.5 cm up at full weight (4.1 cm in all) stay inside that. A 6.4 cm shift reached only a
 * little further (D edge at look 0/0, 1280x720: 0.468 vs 0.404 NDC on the whole view, 0.262 vs 0.253 with the
 * information column kept clear) and opened the arm's deltoid edge more visibly when looking down at the shoulder,
 * because the body's own shoulder blade and collarbone do not follow the shift (harness/run-R4-arm-probe-1/
 * girdle-size-1.txt, harness/run-R4-arm-shoulder-ov3g-1/crop-x0.21-base-4cm-6cm.png). The body renderer may move the
 * left clavicle and shoulder blade by fitHand(...).girdle.shiftBodyM (not wired in round 4).
 */
export const REACH_GIRDLE = Object.freeze({
  startXNdc: -0.3, fullXNdc: 0.45, shiftAtFullM: Object.freeze([0.02, 0.005, -0.035])
});

/** A `reachGirdle` option: true / undefined = REACH_GIRDLE, false / null = off, or an object with REACH_GIRDLE's keys. */
function girdleOption(v) {
  if (v === true || v === undefined) return REACH_GIRDLE;
  if (v === false || v === null) return null;
  if (typeof v !== 'object') fail('arm_input', 'reachGirdle must be true, false or a REACH_GIRDLE-like object');
  const g = { ...REACH_GIRDLE, ...v };
  for (const k of ['startXNdc', 'fullXNdc']) finite(g[k], `reachGirdle.${k}`);
  if (!(g.fullXNdc > g.startXNdc)) fail('arm_input', 'reachGirdle.fullXNdc must be larger than startXNdc');
  g.shiftAtFullM = Object.freeze(vec3(g.shiftAtFullM, 'reachGirdle.shiftAtFullM'));
  if (length(g.shiftAtFullM) > 0.1) fail('arm_input', 'reachGirdle.shiftAtFullM must stay within 10 cm');
  return Object.freeze(g);
}

/** A viewLimitsNdc option: null / undefined = the whole view, or { left?, right?, bottom?, top? } (missing sides = 1). */
function viewLimitsOption(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) fail('arm_input', 'viewLimitsNdc must be null or { left, right, bottom, top }');
  const out = {};
  for (const k of ['left', 'right', 'bottom', 'top']) {
    const x = v[k] === undefined ? 1 : v[k];
    if (!(typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 1)) fail('arm_input', `viewLimitsNdc.${k} must be in (0, 1]`);
    out[k] = x;
  }
  return Object.freeze(out);
}

/** The NDC box every hand corner must stay in: { l, r, b, t } = min(1 - marginNdc, viewLimitsNdc side) - slack (the
 * left and bottom as positive distances from the centre: x >= -l, y >= -b). */
function viewBox(o, slack = 0) {
  const m = 1 - o.marginNdc, v = o.viewLimitsNdc;
  const side = k => (v ? Math.min(m, v[k]) : m) - slack;
  return Object.freeze({ l: side('left'), r: side('right'), b: side('bottom'), t: side('top') });
}

const NO_GIRDLE = Object.freeze({ weight: 0, shiftBodyM: Object.freeze([0, 0, 0]), shiftCam: Object.freeze([0, 0, 0]) });
const GIRDLE_MEMO_MAX = 512;
const girdleMemo = new WeakMap();

/** The reach girdle of anchor x for merged options o (pure; the shift is added to o.shoulderCam). */
function girdleState(o, x) {
  const g = o.reachGirdle;
  if (!g) return NO_GIRDLE;
  const weight = smoothstep((x - g.startXNdc) / (g.fullXNdc - g.startXNdc));
  if (!(weight > 0)) return NO_GIRDLE;
  const shiftBodyM = scale(g.shiftAtFullM, weight);
  const shiftCam = o.bodyToCamera ? transformDirection(o.bodyToCamera, shiftBodyM) : shiftBodyM;
  return { weight, shiftBodyM, shiftCam };
}

/** Options of anchor x: o with the shoulder (and pole) moved by the reach girdle; o itself when there is no shift.
 * Memoised per merged options object (one per public call; numbers as Map keys, since this runs in the A/D-range
 * bisection loops). `ox.girdle` is the girdle state. tanHalf / aspect are accepted for call-site symmetry. */
function atAnchor(o, x, tanHalf, aspect) { // eslint-disable-line no-unused-vars
  if (o.girdleBase) o = o.girdleBase; // never shift an already shifted options object twice
  if (!o.reachGirdle) return o;
  let memo = girdleMemo.get(o);
  if (!memo) { memo = new Map(); girdleMemo.set(o, memo); }
  const hit = memo.get(x);
  if (hit) return hit;
  const gs = girdleState(o, x);
  const ox = gs.weight > 0
    ? { ...o, shoulderCam: add(o.shoulderCam, gs.shiftCam), pole: add(o.pole, gs.shiftCam), girdle: gs, girdleBase: o }
    : { ...o, girdle: gs, girdleBase: o };
  if (memo.size >= GIRDLE_MEMO_MAX) memo.clear();
  memo.set(x, ox);
  return ox;
}

/**
 * R4-arm (QA / HUD / body renderer): the reach girdle for an A/D anchor and look: { weight (0..1), shiftBodyM (body-frame
 * metres), shiftCam (camera metres), shoulderCam (the shifted glenohumeral centre) }.
 * viewport { aspect, fovYDeg? }; options as fitHand (attachment or shoulderCam/pole; reachGirdle false = off).
 */
export function reachGirdle(xNdc, { aspect, fovYDeg } = {}, options = {}) {
  const o = mergeOptions(options);
  finite(xNdc, 'xNdc');
  const tanHalf = tanHalfFov(aspect, fovYDeg === undefined ? o.fovYDeg : fovYDeg);
  const ox = atAnchor(o, xNdc, tanHalf, aspect);
  const gs = ox.girdle || NO_GIRDLE;
  return { weight: gs.weight, shiftBodyM: gs.shiftBodyM.slice(), shiftCam: gs.shiftCam.slice(), shoulderCam: ox.shoulderCam.slice() };
}

/** fitHand's `girdle` field: { weight, shiftBodyM, shiftCam } of the placed anchor (plain copies). */
function girdleReport(ox) {
  const gs = (ox && ox.girdle) || NO_GIRDLE;
  return { weight: gs.weight, shiftBodyM: gs.shiftBodyM.slice(), shiftCam: gs.shiftCam.slice() };
}

/**
 * R4-arm (integration helper): viewLimitsNdc for fitHand / anchorRange from a CSS-pixel panel rectangle, so the whole
 * hand stays out from under the far-right information column (landscape: the hand's right limit is the column's left
 * edge minus gapPx) or above the portrait bottom band (its top edge minus gapPx). rect: ns-scene-three infoPanelRect(size)
 * ({ x0, y0, x1, y1, layout: 'column' | 'portrait' }); size: { width, height } CSS px. Returns null (the whole view) when
 * there is no rect, the rect is not one of those layouts, or the limit would leave less than minNdc of the view on that
 * side of the centre. Pure.
 */
export function handViewLimitsNdc(size, rect, { gapPx = 6, minNdc = 0.15 } = {}) {
  if (!size || !(size.width > 0 && size.height > 0) || !rect) return null;
  if (rect.layout === 'column' && Number.isFinite(rect.x0)) {
    const right = (2 * (rect.x0 - gapPx)) / size.width - 1;
    return right >= minNdc ? Object.freeze({ left: 1, right: Math.min(1, right), bottom: 1, top: 1 }) : null;
  }
  if (rect.layout === 'portrait' && Number.isFinite(rect.y0)) {
    const bottom = (2 * (rect.y0 - gapPx)) / size.height - 1;
    return bottom >= minNdc ? Object.freeze({ left: 1, right: 1, bottom: Math.min(1, bottom), top: 1 }) : null;
  }
  return null;
}

/** The arm should not come closer than this to the eye (camera origin); reported as clearance.nearEye. */
export const ARM_EYE_CLEARANCE_M = 0.08;

/** Pronation/supination easing time for the full +-80 deg flip (scaled by the fraction of the flip still to go). */
export const PRONATION_EASE_S = 0.4;
/** R5-pronation: the same ease under prefers-reduced-motion (stepPronation options.easeS): shorter, still not a snap. */
export const PRONATION_EASE_S_REDUCED = 0.15;

/**
 * R5-pronation (R27): how the double-tap palm turn is shared by the forearm, the shoulder joint, the shoulder blade and
 * the upper trunk ("normal joint mechanics"; display choices, cited from memory, Root reference qualification pending).
 *
 * The commanded palm turn T (joints.forearm_pronation, +80 palm down .. -80 palm up, eased by ns-actions / stepPronation)
 * gives the supination fraction u = (referenceDeg - T) / spanDeg in [0, 1]: 0 palm down (the start pose, exactly the
 * round-4 arm), 1 palm up. With the elbow angle phi that the arm needs for the locked hand target (closed form, from the
 * shoulder-to-hand distance):
 *  - upper arm (glenohumeral) EXTERNAL rotation  psi = u * H(phi),
 *      H(phi) = humeralBentDeg + (humeralStraightDeg - humeralBentDeg) * cos^2(min(phi, 90 deg)),
 *    i.e. 25 deg over the whole palm-down -> palm-up turn with a straight elbow, about 18 deg at the start pose's elbow
 *    (37 deg), 6 deg with the elbow at 90 deg or more. It is applied as a turn of the whole arm about the shoulder ->
 *    hand-centre line (the elbow swings in toward the body), so the hand centre stays exactly on its screen ray at
 *    NDC y +0.5 and the elbow angle and the W/S depth do not change. Back toward palm down it turns inward again
 *    (internal rotation). Why the share depends on the elbow: with the elbow straight a turn of the upper arm turns the
 *    palm almost one to one, so people use the shoulder a lot; with the elbow bent to 90 deg it would swing the hand
 *    sideways instead, which is why clinicians measure forearm turning with the elbow bent at the side (standard
 *    goniometry teaching, e.g. Norkin & White, Measurement of Joint Motion; cited from memory).
 *  - the forearm (radius about the ulna) turns by the REST of the palm turn: forearmDeg = T + psi (so the palm ends in
 *    about the same place: exactly with a straight elbow, within a few degrees with a bent one, because the arm turn is
 *    about the shoulder -> hand line, not the forearm axis). Palm up therefore uses about -62 deg of forearm supination
 *    at the start pose, inside the commonly cited active ranges (pronation about 75-85, supination about 80-90 deg).
 *  - the shoulder blade slides back a little (retraction, girdleShiftM in the body frame at u = 1: 1 mm toward the
 *    midline, 5 mm back), as it does with outward turning of the upper arm (scapulohumeral coupling, qualitative
 *    textbook description), and the upper trunk turns trunkTwistDeg (1.5 deg) toward the arm's side about a vertical
 *    axis through the midline trunkAxisBehindShoulderM behind the shoulder joint centre (left shoulder back), with the
 *    head kept steady. Together they move the shoulder joint centre about 9 mm back at palm up.
 * Ranges kept (unit-tested, measured on the BodyParts3D arm): the humerus stays inside SHOULDER_LIMITS, its ISB
 * axial rotation (Wu et al. 2005, J Biomech 38:981, YXY sequence) stays inside commonly cited active ranges (external
 * about 90, internal about 70 deg, e.g. AAOS tables; cited from memory), the forearm inside PRONATION_RANGE_DEG.
 * The A/D range and the W/S window are computed for the reference (palm-down, uncoupled) arm, so W/A/S/D reach is the
 * round-4 reach; at palm up the hand's own reach can end a few millimetres nearer (the shoulder is further back).
 * Not measured motion or EMG; simulated, unitless display mechanics.
 */
export const ROTATION_COUPLING = Object.freeze({
  referenceDeg: PRONATION_STATES.pronated,
  spanDeg: PRONATION_STATES.pronated - PRONATION_STATES.supinated,
  humeralStraightDeg: 25,
  humeralBentDeg: 6,
  bentElbowDeg: 90,
  forearmCompensation: 1,
  girdleShiftM: Object.freeze([0.001, 0, 0.005]),
  trunkTwistDeg: 1.5,
  trunkAxisBehindShoulderM: 0.03
});

const ELBOW_MAX = ELBOW_MAX_DEG * DEG;

/**
 * Optional extra key of the fit-box Map: one oriented box, in FOREARM rest coordinates, around the rest positions of
 * the rendered tissue that has a positive hand/digit skin weight AND a forearm second influence (wrist-region muscle
 * vertices). Linear blend skinning puts such a vertex on the segment between its forearm-transformed and its
 * hand-transformed position, so bounding both endpoints (this box under the forearm matrix, and the hand-segment box
 * under its matrix) bounds the rendered vertex: the screen-safe region (depth >= near + margin, |x|, |y| <= limit in
 * NDC) is an intersection of half-spaces, hence convex (browser-findings repair R2, item 4). The forearm matrix
 * includes the pronation turn (ns-rig skinWeights keeps hand tissue on the full-turn 'forearm' frame).
 */
export const FOREARM_SUPPORT_KEY = 'forearm:hand-support';
/** Soft tissue (mm) added around the bone silhouette when measuring the hand's on-screen size (intrinsic muscles,
 * tendons and the thenar/hypothenar pads lie over the bones; A3 calibration against skinned muscle vertices). */
export const HAND_SOFT_TISSUE_MM = 6;
const MM = 0.001;
const BISECT_STEPS = 32;
const RANGE_BISECT_STEPS = 14;
const EPS_NDC = 1e-9;
const EPS_DEPTH = 1e-9;

/* ------------------------------------------------------------------ validation */

function finite(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail('arm_input', `${what} must be a finite number`);
  return v;
}

function vec3(v, what) {
  if (!v || v.length !== 3 || !Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) {
    fail('arm_input', `${what} must be a finite [x, y, z]`);
  }
  return [v[0], v[1], v[2]];
}

function tanHalfFov(aspect, fovYDeg) {
  finite(aspect, 'aspect');
  finite(fovYDeg, 'fovYDeg');
  if (!(aspect > 0)) fail('arm_input', 'aspect must be positive');
  if (!(fovYDeg > 0 && fovYDeg < 179)) fail('arm_input', 'fovYDeg must be in (0, 179)');
  return Math.tan((fovYDeg * DEG) / 2);
}

const NUMERIC_OPTIONS = Object.freeze(['yNdc', 'fovYDeg', 'near', 'marginNdc', 'nearMargin', 'xNdcStart', 'depthStart',
  'xSpeedNdcPerS', 'depthSpeedMPerS', 'minDepth', 'maxHandHeightNdc', 'minReachSpanM', 'reachRampS', 'minFitSpanM']);

function mergeOptions(options) {
  const opt = options || {};
  const o = { ...ARM_DEFAULTS, ...opt };
  if (opt.attachment) {
    const a = opt.attachment;
    if (!a || a.kind !== 'ns-arm-attachment') fail('arm_input', 'attachment must come from armAttachment');
    o.shoulderCam = a.shoulderCam;
    o.pole = a.pole;
    o.bodyToCamera = a.bodyToCamera;
  }
  o.shoulderCam = vec3(o.shoulderCam, 'shoulderCam');
  o.pole = vec3(o.pole, 'pole');
  // R378: optional rendering-camera origin in the SAME physical body coordinates. Absent path stays literal.
  o.cameraOriginBodyM = opt.cameraOriginBodyM === undefined ? null : vec3(opt.cameraOriginBodyM, 'cameraOriginBodyM');
  for (const k of NUMERIC_OPTIONS) finite(o[k], k);
  if (!(o.marginNdc >= 0 && o.marginNdc < 1)) fail('arm_input', 'marginNdc must be in [0, 1)');
  if (!(Math.abs(o.yNdc) < 1 - o.marginNdc)) fail('arm_input', 'yNdc must lie inside the screen margins');
  if (!(o.minDepth > 0)) fail('arm_input', 'minDepth must be positive');
  if (!(o.maxHandHeightNdc > 0)) fail('arm_input', 'maxHandHeightNdc must be positive (2 = the full view height, i.e. no cap)');
  if (!(o.minReachSpanM >= 0)) fail('arm_input', 'minReachSpanM must be >= 0');
  if (!(o.reachRampS >= 0 && o.reachRampS <= 1)) fail('arm_input', 'reachRampS must be in [0, 1] seconds (0 = no ramp)');
  if (!(o.minFitSpanM >= 0 && o.minFitSpanM <= 0.3)) fail('arm_input', 'minFitSpanM must be in [0, 0.3] m (0 = off)');
  o.reachGirdle = girdleOption(o.reachGirdle);
  if (typeof o.reachComfort !== 'boolean') fail('arm_input', 'reachComfort must be a boolean');
  if (typeof o.widerTier !== 'boolean') fail('arm_input', 'widerTier must be a boolean');
  if (typeof o.wsGuardAtWindow !== 'boolean') fail('arm_input', 'wsGuardAtWindow must be a boolean');
  o.rotationCoupling = couplingOption(o.rotationCoupling);
  o.viewLimitsNdc = viewLimitsOption(o.viewLimitsNdc);
  if (!o.bodyToCamera) o.bodyToCamera = null;
  return o;
}

/** A `rotationCoupling` option: true / undefined = ROTATION_COUPLING, false / null = off (round 4), or an object with
 * ROTATION_COUPLING's keys (diagnostics and tuning). */
function couplingOption(v) {
  if (v === true || v === undefined) return ROTATION_COUPLING;
  if (v === false || v === null) return null;
  if (typeof v !== 'object') fail('arm_input', 'rotationCoupling must be true, false or a ROTATION_COUPLING-like object');
  const c = { ...ROTATION_COUPLING, ...v };
  for (const k of ['referenceDeg', 'spanDeg', 'humeralStraightDeg', 'humeralBentDeg', 'bentElbowDeg', 'forearmCompensation', 'trunkTwistDeg', 'trunkAxisBehindShoulderM']) finite(c[k], `rotationCoupling.${k}`);
  if (!(c.forearmCompensation >= 0 && c.forearmCompensation <= 1.5)) fail('arm_input', 'rotationCoupling.forearmCompensation must be in [0, 1.5]');
  if (!(c.spanDeg > 0)) fail('arm_input', 'rotationCoupling.spanDeg must be positive');
  if (!(c.bentElbowDeg > 0 && c.bentElbowDeg <= 180)) fail('arm_input', 'rotationCoupling.bentElbowDeg must be in (0, 180]');
  if (Math.abs(c.humeralStraightDeg) > 60 || Math.abs(c.humeralBentDeg) > 60) fail('arm_input', 'rotationCoupling humeral shares must stay within 60 deg');
  if (Math.abs(c.trunkTwistDeg) > 10) fail('arm_input', 'rotationCoupling.trunkTwistDeg must stay within 10 deg');
  c.girdleShiftM = Object.freeze(vec3(c.girdleShiftM, 'rotationCoupling.girdleShiftM'));
  if (length(c.girdleShiftM) > 0.05) fail('arm_input', 'rotationCoupling.girdleShiftM must stay within 5 cm');
  return Object.freeze(c);
}

/** Supination fraction u in [0, 1] of a commanded palm turn T (degrees; 0 = palm down reference, 1 = palm up). */
function couplingU(c, T) {
  return c ? clamp((c.referenceDeg - T) / c.spanDeg, 0, 1) : 0;
}

/** The upper arm's share H(phi) (degrees of external rotation over the full palm turn) at elbow flexion phi (radians). */
function humeralShareDeg(c, phiRad) {
  const p = clamp(phiRad / DEG, 0, c.bentElbowDeg) * (90 / c.bentElbowDeg) * DEG;
  const k = Math.cos(p) ** 2;
  return c.humeralBentDeg + (c.humeralStraightDeg - c.humeralBentDeg) * k;
}

/**
 * R5-pronation: the coupled motion for a commanded palm turn and elbow angle (pure; also used by tests, QA and the body
 * renderer). pronationDeg = joints.forearm_pronation (the commanded total turn); elbowFlexRad = the elbow flexion of the
 * uncoupled arm for the hand target (fitHand reports it). Returns { u, humeralExternalDeg (swivel of the arm about the
 * shoulder -> hand line, + = outward turn of the upper arm), forearmDeg (the radius' turn about the ulna, ns-rig
 * forearm_pronation), girdleShiftBodyM, trunkTwistDeg (+ = upper trunk turned toward the left, left shoulder back) }.
 * coupling: ROTATION_COUPLING (default), an override object, or false (everything zero, forearmDeg = pronationDeg).
 */
export function rotationCoupling(pronationDeg, elbowFlexRad, coupling = true) {
  finite(pronationDeg, 'pronationDeg');
  finite(elbowFlexRad, 'elbowFlexRad');
  const c = couplingOption(coupling);
  const u = couplingU(c, pronationDeg);
  if (!c || !(u > 0)) return { u: 0, humeralExternalDeg: 0, forearmDeg: pronationDeg, girdleShiftBodyM: [0, 0, 0], trunkTwistDeg: 0 };
  const psi = u * humeralShareDeg(c, elbowFlexRad);
  return {
    u,
    humeralExternalDeg: psi,
    forearmDeg: clamp(pronationDeg + c.forearmCompensation * psi, PRONATION_RANGE_DEG[0], PRONATION_RANGE_DEG[1]),
    girdleShiftBodyM: scale(c.girdleShiftM, u),
    trunkTwistDeg: u * c.trunkTwistDeg
  };
}

/** Body-frame displacement (m) of the shoulder joint centre by the coupling at supination fraction u: the girdle shift
 * plus the upper-trunk turn about the vertical trunk axis. shoulderBody: the glenohumeral centre in the body frame
 * (eye at the origin); axisBody: a point of the vertical trunk axis (body frame; only x and z are used). */
function couplingShoulderShiftBody(c, u, shoulderBody, axisBody) {
  if (!c || !(u > 0)) return [0, 0, 0];
  const a = u * c.trunkTwistDeg * DEG;
  const rx = shoulderBody[0] - axisBody[0], rz = shoulderBody[2] - axisBody[2];
  // rotation about +y (body up) by a: x' = x cos a + z sin a, z' = -x sin a + z cos a (a > 0: the left shoulder goes back)
  const tx = rx * Math.cos(a) + rz * Math.sin(a) - rx, tz = -rx * Math.sin(a) + rz * Math.cos(a) - rz;
  const g = scale(c.girdleShiftM, u);
  return [g[0] + tx, g[1], g[2] + tz];
}

/** The vertical trunk axis point (body frame) for a shoulder: the midline (x 0, the eye), trunkAxisBehindShoulderM
 * behind the shoulder joint centre. */
const trunkAxisFor = (c, shoulderBody) => [0, shoulderBody[1], shoulderBody[2] + c.trunkAxisBehindShoulderM];

/**
 * R5-pronation: the ns-body poseBody option `armFollow` for a fit's coupling (fitHand(...).coupling or
 * solveArm(...).coupling) and the arm anatomy (armAnatomy: its eyeBp places the body frame): { trunkTwistDeg,
 * trunkAxisBp (mm, source frame), leftGirdleShiftMm (source frame) }, or null at palm down / with the coupling off (pass
 * nothing then: the body is exactly the round-4 body). Body frame (m, eye at the origin, +x right, +y up, +z back) ->
 * BodyParts3D source mm (+x left, +y back, +z up): s = eyeBp + 1000 (-x, z, y). Pure.
 */
export function bodyFollowFromCoupling(coupling, anatomy) {
  if (!coupling || coupling.enabled === false || !(coupling.u > 0)) return null;
  const eye = anatomy && anatomy.eyeBp ? vec3(anatomy.eyeBp, 'anatomy.eyeBp') : null;
  const toBp = v => [-1000 * v[0], 1000 * v[2], 1000 * v[1]];
  const g = vec3(coupling.girdleShiftBodyM, 'coupling.girdleShiftBodyM');
  const out = { trunkTwistDeg: finite(coupling.trunkTwistDeg, 'coupling.trunkTwistDeg'), leftGirdleShiftMm: toBp(g) };
  if (eye && coupling.trunkAxisBodyM) out.trunkAxisBp = add(eye, toBp(vec3(coupling.trunkAxisBodyM, 'coupling.trunkAxisBodyM')));
  return out;
}

/**
 * The forearm_pronation (degrees from neutral) for a request's `rotation`, unless joints already give it:
 *  - 'pronated' | 'supinated' (ns-actions / ns-app rotationState): the PRONATION_STATES target, no easing (pass the
 *    stepPronation angle instead for the 0.4 s ease);
 *  - { value } (ns-actions rotationOutputs: 0 = pronated, 1 = supinated, already eased): +80 -> -80 linearly;
 *  - a number: degrees from neutral.
 * Returns the joints object to use (unchanged when there is nothing to resolve).
 */
export function jointsWithRotation(joints = {}, rotation) {
  const J = joints || {};
  if (Number.isFinite(J.forearm_pronation) || rotation === undefined || rotation === null) return J;
  let deg;
  if (typeof rotation === 'string') deg = pronationTarget(rotation);
  else if (typeof rotation === 'number') deg = rotation;
  else if (typeof rotation === 'object' && Number.isFinite(rotation.value)) {
    const v = clamp(rotation.value, 0, 1);
    deg = PRONATION_STATES.pronated + (PRONATION_STATES.supinated - PRONATION_STATES.pronated) * v;
  } else fail('arm_input', 'rotation must be a rotation state, { value } or degrees');
  finite(deg, 'rotation');
  return { ...J, forearm_pronation: clamp(deg, PRONATION_RANGE_DEG[0], PRONATION_RANGE_DEG[1]) };
}

/** Options with a request-level yNdc applied (validated by mergeOptions). */
const withRequestY = (options, yNdc) => (yNdc === undefined || yNdc === null ? options : { ...(options || {}), yNdc });

/* ------------------------------------------------------------------ attachment (body-fixed shoulder, eye camera) */

/**
 * Body anatomy for the attachment: the eye (camera origin) and the rig's glenohumeral pivot, both in BodyParts3D mm.
 * @param rig from deriveRig (rig.pivots.shoulder is the humeral-head cap centroid).
 * @param eye { eyeBp: [x, y, z] mm, source?: string } (ns-assets eyePosition) or a bare [x, y, z].
 * @returns frozen { kind, eyeBp, shoulderBp, shoulderBodyM (body-frame metres from the eye at body yaw 0), eyeSource }
 */
export function armAnatomy(rig, eye) {
  if (!rig || rig.kind !== 'ns-rig') fail('arm_input', 'expected a rig from deriveRig');
  const e = Array.isArray(eye) || ArrayBuffer.isView(eye) ? { eyeBp: eye } : eye || {};
  const eyeBp = vec3(e.eyeBp, 'eye.eyeBp');
  const shoulderBp = vec3(rig.pivots.shoulder, 'rig.pivots.shoulder');
  const shoulderBodyM = transformPoint(bodyToWorldMatrix(eyeBp, 0), shoulderBp);
  if (!(shoulderBodyM[1] < -0.05)) fail('arm_input', `the shoulder must lie below the eye (got ${shoulderBodyM[1].toFixed(3)} m); check the eye estimate`);
  return Object.freeze({
    kind: 'ns-arm-anatomy',
    eyeBp: Object.freeze(eyeBp),
    shoulderBp: Object.freeze(shoulderBp),
    shoulderBodyM: Object.freeze(shoulderBodyM),
    eyeSource: typeof e.source === 'string' ? e.source : 'given'
  });
}

/**
 * Trunk yaw (radians) needed for a look yaw: 0 inside the free range (ARM_YAW_FREE_DEG, or a number for a symmetric
 * range), the excess beyond it (continuous, so the shoulder never jumps). With unlimited look yaw this keeps the left
 * hand reachable when the player turns around; a look wound several turns behaves like the equivalent look.
 */
export function bodyYawForLook(yaw, freeDeg = ARM_YAW_FREE_DEG) {
  finite(yaw, 'yaw');
  const fr = typeof freeDeg === 'number' ? { right: freeDeg, left: freeDeg } : freeDeg || {};
  finite(fr.right, 'freeDeg.right');
  finite(fr.left, 'freeDeg.left');
  const w = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const fl = Math.max(0, fr.left) * DEG, frt = Math.max(0, fr.right) * DEG;
  // The trunk takes the shorter way round when the look is behind (|w| near pi): continuous except exactly behind.
  const excess = w > fl ? w - fl : w < -frt ? w + frt : 0;
  return yaw - w + excess;
}

/**
 * Per-frame attachment of the arm for a look.
 * @param anatomy from armAnatomy
 * @param look { yaw, pitch } radians (ns-controls convention), bodyYaw radians (default bodyYawForLook(yaw); pass 0 if
 *   the integrator clamps the look yaw to ARM_YAW_FREE_DEG instead of turning the body), poleDir (body-frame elbow
 *   direction override for diagnostics; default BODY_POLE_DIR blended toward BODY_POLE_DIR_OVERHEAD for overhead looks)
 * @returns frozen { kind, shoulderCam (camera m), pole (camera-space point), bodyYaw, girdleShiftM (body-frame metres the
 *   glenohumeral centre is raised by GIRDLE_ELEVATION), anticipatedElevationDeg, cameraToWorld, worldToCamera,
 *   bodyToWorld (BodyParts3D mm -> world m: use it for every body mesh), bodyToCamera (rotation part: body axes ->
 *   camera), relativeYaw (look yaw minus body yaw) }. Pass it as fitHand options.attachment (or its shoulderCam/pole).
 */
export function armAttachment(anatomy, { yaw = 0, pitch = 0, bodyYaw, poleDir = null } = {}) {
  if (!anatomy || anatomy.kind !== 'ns-arm-anatomy') fail('arm_input', 'anatomy must come from armAnatomy');
  finite(yaw, 'yaw');
  finite(pitch, 'pitch');
  const by = bodyYaw === undefined ? bodyYawForLook(yaw) : finite(bodyYaw, 'bodyYaw');
  const camToWorld = lookRotation(yaw, pitch);
  const worldToCam = rotationTranspose(camToWorld);
  const bodyRot = rotationY(by);
  const bodyToCamera = multiply(worldToCam, bodyRot);
  // Anticipated humeral elevation for the hand ray at a nominal depth (body frame), then the girdle shift.
  const G = GIRDLE_ELEVATION;
  const tanHalf = Math.tan((ARM_DEFAULTS.fovYDeg * DEG) / 2);
  const nominalCam = pointOnNdcRay(G.nominalXNdc, HAND_Y_NDC, G.nominalDepthM, tanHalf, 16 / 9);
  const nominalBody = transformDirection(rotationTranspose(bodyToCamera), nominalCam);
  const toHand = sub(nominalBody, anatomy.shoulderBodyM);
  const elevationDeg = Math.acos(clamp(-toHand[1] / Math.max(1e-9, length(toHand)), -1, 1)) / DEG;
  const gw = smoothstep((elevationDeg - G.elevationStartDeg) / (G.elevationFullDeg - G.elevationStartDeg));
  const girdleShiftM = scale(G.shiftAtFullM, gw);
  const shoulderBody = add(anatomy.shoulderBodyM, girdleShiftM);
  const shoulderWorld = transformDirection(bodyRot, shoulderBody);
  const shoulderCam = transformDirection(worldToCam, shoulderWorld);
  const pw = smoothstep((elevationDeg - POLE_OVERHEAD_ELEVATION_DEG[0]) / (POLE_OVERHEAD_ELEVATION_DEG[1] - POLE_OVERHEAD_ELEVATION_DEG[0]));
  const poleBody = poleDir ? normalize(vec3(poleDir, 'poleDir')) : normalize(add(scale(BODY_POLE_DIR, 1 - pw), scale(BODY_POLE_DIR_OVERHEAD, pw)));
  const poleCam = add(shoulderCam, transformDirection(bodyToCamera, poleBody));
  return Object.freeze({
    kind: 'ns-arm-attachment',
    yaw, pitch, bodyYaw: by, relativeYaw: yaw - by,
    shoulderCam: Object.freeze(shoulderCam),
    pole: Object.freeze(poleCam),
    girdleShiftM: Object.freeze(girdleShiftM),
    poleBody: Object.freeze(poleBody),
    anticipatedElevationDeg: elevationDeg,
    cameraToWorld: camToWorld,
    worldToCamera: worldToCam,
    bodyToCamera,
    bodyToWorld: bodyToWorldMatrix(anatomy.eyeBp, by)
  });
}

/** Camera-space arm matrices (fitHand/solveArm solution.matrices) -> world matrices for the attachment's look. */
export function cameraToWorldMatrices(attachment, matrices) {
  if (!attachment || attachment.kind !== 'ns-arm-attachment') fail('arm_input', 'attachment must come from armAttachment');
  if (!(matrices instanceof Map)) fail('arm_input', 'matrices must be a Map(segment -> matrix)');
  const out = new Map();
  for (const [k, m] of matrices) out.set(k, multiply(attachment.cameraToWorld, m));
  return out;
}

/* ------------------------------------------------------------------ chain algebra */

/** |U + R(a, phi) V|^2 = uu + vv + 2 (A cos phi + B sin phi + K), for unit axis a (Rodrigues, right-hand rule). */
function chainCoeffs(U, V, a) {
  const ua = dot(U, a), va = dot(V, a);
  const A = dot(U, V) - ua * va;
  const B = dot(U, cross(a, V));
  return { A, B, K: ua * va, C: Math.hypot(A, B), phi0: Math.atan2(B, A), uu: dot(U, U), vv: dot(V, V) };
}

const chainDist = (c, phi) => Math.sqrt(Math.max(0, c.uu + c.vv + 2 * (c.A * Math.cos(phi) + c.B * Math.sin(phi) + c.K)));

const baseCache = new WeakMap();

/** Per-rig constants (rest source mm). */
function rigBase(rig) {
  if (!rig || rig.kind !== 'ns-rig') fail('arm_input', 'expected a rig from deriveRig');
  let b = baseCache.get(rig);
  if (b) return b;
  const S0 = rig.pivots.shoulder, E0 = rig.pivots.elbow, W0 = rig.pivots.wrist, a = rig.axes.elbow;
  const U = sub(E0, S0);
  const limitMm = WRIST_REACH_FRACTION * (rig.upperLength + rig.foreLength);
  b = { rig, S0, E0, W0, a, U, limitMm, wristLimitM: limitMm * MM, ctxCache: new Map() };
  baseCache.set(rig, b);
  return b;
}

/** Elbow angles keeping |wrist - shoulder| <= limitMm: phi >= returned value on the decreasing branch. */
function wristReachPhi(base, F) {
  const cF = chainCoeffs(base.U, F, base.a);
  if (cF.C < 1e-9) return chainDist(cF, 0) <= base.limitMm ? -Infinity : Infinity;
  const t = ((base.limitMm * base.limitMm - cF.uu - cF.vv) / 2 - cF.K) / cF.C;
  return t >= 1 ? -Infinity : cF.phi0 + Math.acos(Math.max(-1, t));
}

/** Per-pose constants: the hand relative to the ulna (pronation turn + wrist) and the rigid elbow -> hand-centre link
 * G (rest mm). Only the wrist and pronation angles matter (the hand centre is on the rigid hand), so digit joints never
 * change the arm solution. */
function poseContext(rig, joints) {
  const base = rigBase(rig);
  const J = normalizeJoints(joints);
  const key = `${J.wrist_flex}|${J.forearm_pronation}`;
  let core = base.ctxCache.get(key);
  if (!core) {
    const Rw = forearmHandMatrix(rig, J);
    const G = sub(transformPoint(Rw, rig.handCentre), base.E0);
    const F = sub(transformPoint(Rw, base.W0), base.E0);
    const phiLimF = wristReachPhi(base, F);
    const cG = chainCoeffs(base.U, G, base.a);
    const phiLo = Math.max(0, phiLimF, cG.phi0);
    const phiHi = Math.min(ELBOW_MAX, cG.phi0 + Math.PI);
    const empty = !(phiLo <= phiHi);
    core = { Rw, G, cG, phiLimF, empty, dMaxM: empty ? 0 : chainDist(cG, phiLo) * MM, dMinM: empty ? 0 : chainDist(cG, phiHi) * MM };
    if (base.ctxCache.size > 4096) base.ctxCache.clear();
    base.ctxCache.set(key, core);
  }
  return { base, J, ...core };
}

/** The camera ray direction (not unit) through NDC (xNdc, yNdc): r = (x tan aspect, y tan, -1). */
const rayDir = (xNdc, yNdc, tanHalf, aspect) => [xNdc * tanHalf * aspect, yNdc * tanHalf, -1];

/** Depth interval along the ray through (xNdc, yNdc) for hand-centre distances from the shoulder in [dMinM, dMaxM]. */
function rayIntervalM(dMinM, dMaxM, xNdc, yNdc, tanHalf, aspect, shoulderCam, minDepth) {
  const r = rayDir(xNdc, yNdc, tanHalf, aspect);
  const rr = dot(r, r), rs = dot(r, shoulderCam), ss = dot(shoulderCam, shoulderCam);
  const plusRoot = D => {
    const disc = rs * rs - rr * (ss - D * D);
    return disc < 0 ? null : (rs + Math.sqrt(disc)) / rr;
  };
  const hiRoot = plusRoot(dMaxM);
  if (hiRoot === null) return { lo: minDepth, hi: minDepth, empty: true };
  const loRoot = plusRoot(dMinM);
  const lo = loRoot === null || loRoot + 1e-9 <= minDepth ? minDepth : loRoot + 1e-9;
  const hi = hiRoot - 1e-9;
  return { lo, hi, empty: !(hi >= lo) };
}

/** Depth interval along the camera ray through (xNdc, yNdc) whose hand-centre targets are reachable for this pose
 * within the elbow range and the wrist reach limit. */
function rayInterval(ctx, xNdc, o, tanHalf, aspect) {
  if (ctx.empty) return { lo: o.minDepth, hi: o.minDepth, empty: true };
  const ox = atAnchor(o, xNdc, tanHalf, aspect);
  const c = o.rotationCoupling, u = couplingU(c, ctx.J.forearm_pronation);
  if (!(u > 0)) return rayIntervalM(ctx.dMinM, ctx.dMaxM, xNdc, o.yNdc, tanHalf, aspect, ox.shoulderCam, o.minDepth);
  // R5-pronation: the coupled arm (shoulder moved back a little, forearm turned by T + psi): its reach at the straightest
  // and the most bent elbow, from the shown poses there, kept COUPLED_REACH_MARGIN_M inside so the solve stays reachable.
  const sh = coupledShoulder(o, ox, u);
  const far = coupledPose(ctx, c, u, ctx.dMaxM), near = coupledPose(ctx, c, u, ctx.dMinM);
  if (far.ctx.empty || near.ctx.empty) return { lo: o.minDepth, hi: o.minDepth, empty: true };
  const dMax = far.ctx.dMaxM - COUPLED_REACH_MARGIN_M, dMin = Math.min(dMax, near.ctx.dMinM + COUPLED_REACH_MARGIN_M);
  return rayIntervalM(dMin, dMax, xNdc, o.yNdc, tanHalf, aspect, sh.shoulderCam, o.minDepth);
}

/* ------------------------------------------------------------------ R5-pronation: the coupled palm turn (R27) */

/** Reach kept inside the coupled arm's own reach ends (m), so the solve there stays reachable although the shoulder's
 * share psi (a function of the elbow angle) differs a little between the end pose and the solved pose. */
const COUPLED_REACH_MARGIN_M = 0.0005;
/** Forearm angles of coupled poses are rounded to this step (deg) for the per-rig pose cache (the solve is exact for
 * the rounded angle, so the hand centre stays exactly on its ray). */
const COUPLED_FOREARM_STEP_DEG = 0.01;

/** The coupled shoulder (and pole) at supination fraction u: ox's shoulder moved by couplingShoulderShiftBody (body
 * frame, converted with o.bodyToCamera; identity = the camera at look 0/0). */
function coupledShoulder(o, ox, u) {
  const c = o.rotationCoupling;
  const B = o.bodyToCamera;
  const frameShoulder = B ? transformDirection(rotationTranspose(B), ox.shoulderCam) : ox.shoulderCam;
  const sBody = o.cameraOriginBodyM ? add(frameShoulder, o.cameraOriginBodyM) : frameShoulder;
  const shiftBody = couplingShoulderShiftBody(c, u, sBody, trunkAxisFor(c, sBody));
  const shiftCam = B ? transformDirection(B, shiftBody) : shiftBody;
  return { shoulderCam: add(ox.shoulderCam, shiftCam), pole: add(ox.pole, shiftCam), shiftBody, shoulderBody: sBody };
}

/** Elbow flexion (rad) the pose of ctx needs for a shoulder-to-hand-centre distance Dm (m), clamped to its range. */
function elbowPhiFor(ctx, Dm) {
  const { cG } = ctx;
  if (cG.C < 1e-9) return 0;
  const Dmm = Dm / MM;
  const t = ((Dmm * Dmm - cG.uu - cG.vv) / 2 - cG.K) / cG.C;
  return clamp(cG.phi0 + Math.acos(clamp(t, -1, 1)), Math.max(0, ctx.phiLimF), ELBOW_MAX);
}

/** The pose the coupled arm SHOWS for a commanded pose ctx at shoulder-to-hand distance Dm: the upper arm's external
 * turn psi = u * H(phi) (phi = the commanded pose's elbow angle there) and the forearm at T + psi. */
function coupledPose(ctx, c, u, Dm) {
  const phiRef = elbowPhiFor(ctx, Dm);
  const psiDeg = u * humeralShareDeg(c, phiRef);
  const T = ctx.J.forearm_pronation;
  const fore = clamp(Math.round((T + c.forearmCompensation * psiDeg) / COUPLED_FOREARM_STEP_DEG) * COUPLED_FOREARM_STEP_DEG, PRONATION_RANGE_DEG[0], PRONATION_RANGE_DEG[1]);
  const shown = fore === T ? ctx : poseContext(ctx.base.rig, { ...ctx.J, forearm_pronation: fore });
  return { ctx: shown, psiDeg, phiRef, forearmDeg: fore };
}

/**
 * The arm solve every placement uses: solveCore for the commanded pose, or (rotation coupling on and the palm turned
 * away from palm down) the coupled arm: the shoulder moved by the girdle and trunk follow, the forearm at T + psi and
 * the whole arm turned outward by psi about the shoulder -> hand-centre line. Returns solveCore's { phi, reachable, SM }
 * plus ctx (the pose shown: use it for handMatrixOf), shoulderCam and coupling (null when uncoupled).
 */
function solveArmCore(ctx, target, ox, o) {
  const c = o.rotationCoupling, u = couplingU(c, ctx.J.forearm_pronation);
  if (!(u > 0)) {
    const core = solveCore(ctx, target, ox.shoulderCam, ox.pole);
    return { ...core, ctx, shoulderCam: ox.shoulderCam, coupling: null };
  }
  const sh = coupledShoulder(o, ox, u);
  const cp = coupledPose(ctx, c, u, length(sub(target, sh.shoulderCam)));
  const core = solveCore(cp.ctx, target, sh.shoulderCam, sh.pole, cp.psiDeg * DEG);
  return {
    ...core, ctx: cp.ctx, shoulderCam: sh.shoulderCam,
    coupling: { u, pronationDeg: ctx.J.forearm_pronation, humeralExternalDeg: cp.psiDeg, forearmDeg: cp.forearmDeg, elbowRefRad: cp.phiRef, shoulderShiftBodyM: sh.shiftBody, shoulderBodyM: sh.shoulderBody }
  };
}

/** Closed-form arm solution for a camera-space hand-centre target. `reachable` also honours the wrist reach limit. */
function solveCore(ctx, target, shoulderCam, pole, externalRad = 0) {
  const { base, cG } = ctx;
  const toT = sub(target, shoulderCam);
  const Dm = length(toT);
  if (!(Dm > 1e-9)) fail('arm_target', 'hand target coincides with the shoulder');
  const Dmm = Dm / MM;
  let phi, reachable;
  if (cG.C < 1e-9) {
    phi = 0;
    reachable = Math.abs(chainDist(cG, 0) - Dmm) < 1e-6;
  } else {
    const t = ((Dmm * Dmm - cG.uu - cG.vv) / 2 - cG.K) / cG.C;
    const raw = cG.phi0 + Math.acos(clamp(t, -1, 1));
    const lo = Math.max(0, ctx.phiLimF);
    reachable = t <= 1 + 1e-9 && t >= -1 - 1e-9 && raw >= lo - 1e-9 && raw <= ELBOW_MAX + 1e-9;
    phi = clamp(raw, 0, ELBOW_MAX);
  }
  const hRest = add(base.U, transformDirection(rotationAxisAngle(base.a, phi), ctx.G));
  const hHat = normalize(hRest);
  const H = scale(toT, 1 / Dm);
  let q = reject(sub(pole, shoulderCam), H);
  if (!(length(q) > 1e-9)) q = reject([0, -1, 0], H);
  if (!(length(q) > 1e-9)) q = reject([-1, 0, 0], H);
  q = normalize(q);
  // R5-pronation: the upper arm's outward (external) turn swings the elbow about the shoulder -> hand line H. A turn of
  // the whole arm about H by -externalRad: about H the twist of the humerus has the sign of the turn (H and the humerus
  // point the same way), and a positive turn about the distal humerus axis is an INWARD turn for the left arm.
  if (externalRad !== 0) {
    const t = cross(H, q);
    q = normalize(sub(scale(q, Math.cos(externalRad)), scale(t, Math.sin(externalRad))));
  }
  // Camera frame (H, n, q): q points from the shoulder-hand line toward the pole (elbow side).
  // Rest frame (hHat, elbow axis _|_ hHat, hHat x axis): its third axis is the rest elbow-out direction.
  const n = normalize(cross(q, H));
  const cam = frame(H, n);
  const rest = frame(hHat, base.a);
  const R = multiply(basis(cam.d, cam.a, cam.p), rotationTranspose(basis(rest.d, rest.a, rest.p)));
  const SM = multiply(translation(shoulderCam), multiply(R, multiply(uniformScale(MM), translation(scale(base.S0, -1)))));
  return { phi, reachable, SM };
}

/** Hand matrix (rest mm -> camera m): shoulder * elbow * (pronation turn * wrist). */
function handMatrixOf(ctx, core) {
  const shown = core.ctx || ctx; // R5-pronation: the coupled pose's forearm turn
  return multiply(multiply(core.SM, rotationAboutPivot(shown.base.a, core.phi, shown.base.E0)), shown.Rw);
}

function checkBox(box, what) {
  if (!box || box.length < 8 || box.length % 8 !== 0) fail('arm_boxes', `missing 8-corner box for ${what}`);
  return box;
}

/** The checked boxes and the segment whose camera matrix carries each: every hand/digit segment, plus the optional
 * forearm-support box (carried by the forearm). */
function checkedBoxes(boxes) {
  if (!(boxes instanceof Map)) fail('arm_boxes', 'boxes must be the Map returned by segmentBoxes');
  const list = HAND_SEGMENTS.map(seg => ({ seg, carrier: seg, box: checkBox(boxes.get(seg), seg) }));
  if (boxes.has(FOREARM_SUPPORT_KEY)) list.push({ seg: FOREARM_SUPPORT_KEY, carrier: 'forearm', box: checkBox(boxes.get(FOREARM_SUPPORT_KEY), FOREARM_SUPPORT_KEY) });
  return list;
}

/** Box corners of the hand and digit segments (and, unless handOnly, the forearm-support box) in hand-rest
 * coordinates (camera corner = handMatrix * corner). The forearm frame is the hand frame times the inverse wrist
 * rotation (the pronation turn is common to both). */
function handCorners(rig, boxes, J, { handOnly = false } = {}) {
  const list = checkedBoxes(boxes).filter(b => !handOnly || b.carrier !== 'forearm');
  const local = handLocalMatrices(rig, J);
  let n = 0;
  for (const b of list) n += b.box.length;
  const out = new Float64Array(n * 3);
  let k = 0;
  for (const { carrier, box } of list) {
    const L = carrier === 'forearm' ? rigidInverse(wristMatrix(rig, J)) : local.get(carrier);
    for (const c of box) {
      const p = transformPoint(L, c);
      out[k++] = p[0]; out[k++] = p[1]; out[k++] = p[2];
    }
  }
  return out;
}

/** Bone silhouette points (rig.silhouette) of the hand and digit segments in hand-rest coordinates for a pose. */
function handSilhouette(rig, J) {
  if (!rig.silhouette) fail('arm_input', 'rig has no silhouette (derive it with the current deriveRig)');
  const local = handLocalMatrices(rig, J);
  let n = 0;
  for (const seg of HAND_SEGMENTS) n += rig.silhouette[seg].length;
  const out = new Float64Array(n);
  let k = 0;
  for (const seg of HAND_SEGMENTS) {
    const L = local.get(seg), p = rig.silhouette[seg];
    for (let i = 0; i < p.length; i += 3) {
      const q = transformPoint(L, [p[i], p[i + 1], p[i + 2]]);
      out[k++] = q[0]; out[k++] = q[1]; out[k++] = q[2];
    }
  }
  return out;
}

/** R4-arm: `box` is a viewBox ({ l, r, b, t }); `excess` is how far the farthest corner lies outside it (NDC, negative
 * when every corner is inside). With a symmetric box (round 3: every side = lim) this is max(|x|, |y|) - lim, the
 * round-3 test. */
function scoreCorners(m, corners, tanHalf, aspect, box, nearMin) {
  const sx = 1 / (tanHalf * aspect), sy = 1 / tanHalf;
  let excess = -Infinity, minDepth = Infinity;
  for (let k = 0; k < corners.length; k += 3) {
    const x = corners[k], y = corners[k + 1], z = corners[k + 2];
    const px = m[0] * x + m[4] * y + m[8] * z + m[12];
    const py = m[1] * x + m[5] * y + m[9] * z + m[13];
    const depth = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (depth < minDepth) minDepth = depth;
    if (depth > 1e-9) {
      const nx = (px * sx) / depth, ny = (py * sy) / depth;
      const e = Math.max(-nx - box.l, nx - box.r, -ny - box.b, ny - box.t);
      if (e > excess) excess = e;
    } else excess = Infinity;
  }
  const ok = minDepth >= nearMin + EPS_DEPTH && excess <= -EPS_NDC;
  return { ok, score: excess + 1000 * Math.max(0, nearMin - minDepth) };
}

/** NDC extents {xLo, xHi, yLo, yHi} of hand-rest corners under hand matrix m (corners behind the eye give Infinity). */
function ndcExtents(m, corners, tanHalf, aspect) {
  const sx = 1 / (tanHalf * aspect), sy = 1 / tanHalf;
  let xLo = Infinity, xHi = -Infinity, yLo = Infinity, yHi = -Infinity;
  for (let k = 0; k < corners.length; k += 3) {
    const x = corners[k], y = corners[k + 1], z = corners[k + 2];
    const depth = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (!(depth > 1e-9)) return { xLo: -Infinity, xHi: Infinity, yLo: -Infinity, yHi: Infinity };
    const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) * sx / depth;
    const py = (m[1] * x + m[5] * y + m[9] * z + m[13]) * sy / depth;
    if (px < xLo) xLo = px;
    if (px > xHi) xHi = px;
    if (py < yLo) yLo = py;
    if (py > yHi) yHi = py;
  }
  return { xLo, xHi, yLo, yHi };
}

/* ------------------------------------------------------------------ public API: solve */

/**
 * Place the arm so the hand centre lies exactly on the camera ray through NDC (xNdc, yNdc) at `depth` metres.
 * params: { xNdc, depth, joints, aspect, fovYDeg, yNdc = HAND_Y_NDC, attachment | shoulderCam + pole (+ bodyToCamera),
 *   rotationCoupling (R5-pronation, default true) }.
 * @returns {{shoulderMatrix, elbowFlexRad, matrices, handCentreCam, wristCam, elbowCam, shoulderCam, reachable,
 *   iterations, targetCam, coupling}} iterations is 1: the solve is closed form. Unreachable targets return reachable:
 *   false with a best effort (elbow angle clamped to 0..145 deg, hand on the shoulder-to-target line). R5-pronation:
 *   joints.forearm_pronation is the commanded palm turn; with the rotation coupling the matrices show the coupled arm
 *   (couplingReport) and shoulderCam is the shoulder joint centre actually used.
 */
export function solveArm(rig, params = {}) {
  const p = params || {};
  const o = mergeOptions({ ...(p.attachment ? { attachment: p.attachment } : {}), ...(p.shoulderCam ? { shoulderCam: p.shoulderCam } : {}),
    ...(p.pole ? { pole: p.pole } : {}), ...(p.yNdc !== undefined ? { yNdc: p.yNdc } : {}),
    ...(p.reachGirdle !== undefined ? { reachGirdle: p.reachGirdle } : {}),
    ...(p.bodyToCamera ? { bodyToCamera: p.bodyToCamera } : {}),
    ...(p.rotationCoupling !== undefined ? { rotationCoupling: p.rotationCoupling } : {}),
    ...(p.cameraOriginBodyM !== undefined ? { cameraOriginBodyM: p.cameraOriginBodyM } : {}) });
  const { xNdc, depth, joints = {}, aspect, fovYDeg = ARM_DEFAULTS.fovYDeg } = p;
  finite(xNdc, 'xNdc');
  finite(depth, 'depth');
  if (!(depth > 0)) fail('arm_input', 'depth must be positive metres in front of the camera');
  const tanHalf = tanHalfFov(aspect, fovYDeg);
  const ctx = poseContext(rig, joints);
  const targetCam = pointOnNdcRay(xNdc, o.yNdc, depth, tanHalf, aspect);
  const ox = atAnchor(o, xNdc, tanHalf, aspect);
  const core = solveArmCore(ctx, targetCam, ox, o);
  const matrices = forwardKinematics(rig, { shoulderMatrix: core.SM, elbowFlexRad: core.phi, joints: core.ctx.J });
  const elbowCam = transformPoint(matrices.get('upperarm'), rig.pivots.elbow);
  return {
    shoulderMatrix: core.SM,
    elbowFlexRad: core.phi,
    matrices,
    handCentreCam: transformPoint(matrices.get('hand'), rig.handCentre),
    wristCam: transformPoint(matrices.get('forearm'), rig.pivots.wrist),
    elbowCam,
    shoulderCam: core.shoulderCam.slice(),
    reachable: core.reachable,
    iterations: 1,
    targetCam,
    coupling: couplingReport(o, core, targetCam, elbowCam)
  };
}

/**
 * R5-pronation: the coupled motion of a solved arm, for the body renderer, the mirror, QA and tests (plain numbers).
 * { u (0 palm down .. 1 palm up), pronationDeg (the commanded palm turn), forearmDeg (the radius' turn about the ulna
 * shown), humeralExternalDeg (outward turn of the whole arm about the shoulder -> hand line), humeralTwistDeg (its part
 * about the upper arm's own long axis: the upper arm's external rotation; + = outward), elbowRefDeg (the elbow angle the
 * share was taken at), girdleShiftBodyM (shoulder blade slide, body frame), trunkTwistDeg (+ = the upper trunk turned
 * toward the left, left shoulder back), trunkAxisBodyM (a point of the vertical trunk axis, body frame),
 * shoulderShiftBodyM (the shoulder joint centre's total move: girdle + trunk), enabled }. All zero at palm down.
 */
function couplingReport(o, core, targetCam, elbowCam) {
  const c = o.rotationCoupling;
  const cp = core.coupling;
  const T = core.ctx.J.forearm_pronation;
  if (!c || !cp) {
    return { enabled: Boolean(c), u: 0, pronationDeg: T, forearmDeg: T, humeralExternalDeg: 0, humeralTwistDeg: 0, elbowRefDeg: core.phi / DEG,
      girdleShiftBodyM: [0, 0, 0], trunkTwistDeg: 0, trunkAxisBodyM: null, shoulderShiftBodyM: [0, 0, 0] };
  }
  const H = normalize(sub(targetCam, core.shoulderCam));
  const h = normalize(sub(elbowCam, core.shoulderCam));
  const half = (cp.humeralExternalDeg * DEG) / 2;
  const twist = (2 * Math.atan2(Math.sin(half) * dot(H, h), Math.cos(half))) / DEG;
  return {
    enabled: true, u: cp.u, pronationDeg: cp.pronationDeg,
    forearmDeg: cp.forearmDeg, humeralExternalDeg: cp.humeralExternalDeg, humeralTwistDeg: twist, elbowRefDeg: cp.elbowRefRad / DEG,
    girdleShiftBodyM: scale(c.girdleShiftM, cp.u), trunkTwistDeg: cp.u * c.trunkTwistDeg,
    trunkAxisBodyM: trunkAxisFor(c, cp.shoulderBodyM), shoulderShiftBodyM: cp.shoulderShiftBodyM.slice(), shoulderBodyRefM: cp.shoulderBodyM.slice()
  };
}

/** Reachable depth interval [minDepth, maxDepth] along the ray through (xNdc, yNdc) for a pose and viewport. */
export function reachInterval(rig, { xNdc, joints = {}, aspect, fovYDeg } = {}, options = {}) {
  const o = mergeOptions(options);
  finite(xNdc, 'xNdc');
  const tanHalf = tanHalfFov(aspect, fovYDeg === undefined ? o.fovYDeg : fovYDeg);
  const iv = rayInterval(poseContext(rig, joints), xNdc, o, tanHalf, aspect);
  return { minDepth: iv.lo, maxDepth: iv.hi, empty: iv.empty };
}

/* ------------------------------------------------------------------ pose envelope */

/** Joint ranges (deg) covered by the pose envelope; equal to ns-actions JOINT_LIMITS (middle_mcp_abd is locked at 0)
 * plus the forearm pronation display range (ns-rig PRONATION_RANGE_DEG). */
export const POSE_RANGES = Object.freeze({
  wrist_flex: Object.freeze([-60, 70]),
  mcp_flex: Object.freeze([-10, 90]), pip_flex: Object.freeze([0, 105]), dip_flex: Object.freeze([0, 75]),
  mcp_abd: Object.freeze([-5, 20]),
  thumb_cmc_opp: Object.freeze([0, 40]), thumb_mcp_flex: Object.freeze([-10, 55]), thumb_ip_flex: Object.freeze([-5, 70]),
  forearm_pronation: PRONATION_RANGE_DEG
});
export const WRIST_RANGE_DEG = POSE_RANGES.wrist_flex;

/**
 * Independent per-joint sample levels (deg) of the pose envelope. Each digit's box corners depend only on that
 * digit's own joints and the arm solution only on the wrist and the pronation angle, so the envelope is the union, per
 * (wrist, pronation) level, of every digit's corners over the full product of its own joint levels: it covers mixed
 * poses (e.g. MCP 90 with PIP 0), the Space fist (ns-rig FIST_POSE_DEG), every action target (ns-actions ACTION_TARGETS:
 * wrist 60 / -50, open -5/0/0, spread 15/10/20, index 70/90/60, thumb MCP 50 / -10), both double-tap rotation states
 * (+-80) and every blend between them, since every value lies on or between these levels. Levels are no more than 20 deg
 * apart so a corner between two levels stays within ~1.5 mm of the sampled set (covered by RANGE_SLACK_NDC); the
 * per-frame fit always checks the exact current pose.
 */
export const ENVELOPE_GRID = Object.freeze({
  wrist_flex: Object.freeze([-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 45, 60, 70]),
  mcp_flex: Object.freeze([-10, 5, 15, 30, 45, 60, 70, 85, 90]),
  pip_flex: Object.freeze([0, 20, 35, 50, 70, 90, 105]),
  dip_flex: Object.freeze([0, 10, 25, 45, 60, 65, 75]),
  mcp_abd: Object.freeze([-5, 0, 10, 15, 20]),
  thumb_cmc_opp: Object.freeze([0, 5, 20, 30, 40]),
  thumb_mcp_flex: Object.freeze([-10, 5, 10, 25, 30, 40, 50, 55]),
  thumb_ip_flex: Object.freeze([-5, 0, 10, 25, 45, 65, 70]),
  forearm_pronation: Object.freeze([-80, -60, -40, -20, 0, 20, 40, 60, 80])
});
const DIGIT_NAMES = DIGITS;
const FLEX_LEVELS = Object.freeze([0, 1 / 3, 2 / 3, 1]);
const WRIST_SAMPLES = Object.freeze([-60, -30, 0, 35, 70]);
const lerpRange = (r, t) => r[0] + (r[1] - r[0]) * t;

/**
 * Named reference poses (kept for compatibility and tests): the original coupled extreme set (every flexion level of
 * the four digits, spread off/max, thumb extended/mid/flexed+opposed, five wrist angles) plus the Space fist at every
 * wrist sample, each in both double-tap rotation states. The envelope itself is the per-joint grid (ENVELOPE_GRID),
 * which contains all of these.
 */
export const EXTREME_POSES = Object.freeze((() => {
  const out = [];
  for (const pro of [PRONATION_STATES.pronated, PRONATION_STATES.supinated]) {
    for (const lv of FLEX_LEVELS) for (const spread of [0, 1]) for (const th of [0, 0.5, 1]) for (const w of WRIST_SAMPLES) {
      const J = { wrist_flex: w, forearm_pronation: pro };
      for (const d of DIGIT_NAMES) {
        J[`${d}_mcp_flex`] = lerpRange(POSE_RANGES.mcp_flex, lv);
        J[`${d}_pip_flex`] = lerpRange(POSE_RANGES.pip_flex, lv);
        J[`${d}_dip_flex`] = lerpRange(POSE_RANGES.dip_flex, lv);
        J[`${d}_mcp_abd`] = d === 'middle' ? 0 : spread ? POSE_RANGES.mcp_abd[1] : 0;
      }
      J.thumb_cmc_opp = lerpRange(POSE_RANGES.thumb_cmc_opp, th);
      J.thumb_mcp_flex = lerpRange(POSE_RANGES.thumb_mcp_flex, th);
      J.thumb_ip_flex = lerpRange(POSE_RANGES.thumb_ip_flex, th);
      out.push(Object.freeze(J));
    }
    for (const w of ENVELOPE_GRID.wrist_flex) out.push(Object.freeze({ ...FIST_POSE_DEG, wrist_flex: w, forearm_pronation: pro }));
  }
  return out;
})());

/**
 * Poses whose projected hand height sets the NEAR end of the W/S depth window: straight digits, fully extended and
 * spread digits (the tallest silhouette), and the Space fist, each at its own wrist angle (0, 0, -10), in each of the
 * pronated, neutral and supinated forearm states.
 */
export const SIZE_REFERENCE_POSES = Object.freeze((() => {
  const shapes = [
    {},
    {
      ...Object.fromEntries(DIGIT_NAMES.flatMap(d => [[`${d}_mcp_flex`, -10], [`${d}_pip_flex`, 0], [`${d}_dip_flex`, 0],
        [`${d}_mcp_abd`, d === 'middle' ? 0 : POSE_RANGES.mcp_abd[1]]])),
      thumb_cmc_opp: 0, thumb_mcp_flex: -10, thumb_ip_flex: -5
    },
    FIST_POSE_DEG
  ];
  const out = [];
  for (const pro of [PRONATION_STATES.pronated, 0, PRONATION_STATES.supinated]) for (const s of shapes) out.push(Object.freeze({ ...s, forearm_pronation: pro }));
  return out;
})());

/**
 * Second-tier envelope (U3a): the game's held poses (rest, open, spread, Space fist, index flexion, thumb MCP flexion and
 * extension; ns-actions ACTION_TARGETS) at every pronation level. Where the full per-joint grid admits no anchor (looks
 * at which the arm is near full reach: high pitch, looking right), the A/D range is computed for these instead, so the
 * common poses still never move the hand sideways; anything else is fitted per frame (depth push, wrist clamp).
 */
export const GAME_POSES = Object.freeze([
  Object.freeze({}),
  REST_HAND_POSE_DEG, // R3-arm: the relaxed rest hand (ns-actions REST_POSE) is the pose shown most of the time
  Object.freeze({ ...Object.fromEntries(DIGIT_NAMES.flatMap(d => [[`${d}_mcp_flex`, -5], [`${d}_pip_flex`, 0], [`${d}_dip_flex`, 0]])), thumb_mcp_flex: -5, thumb_ip_flex: 0 }),
  Object.freeze({ index_mcp_abd: 15, ring_mcp_abd: 10, little_mcp_abd: 20 }),
  FIST_POSE_DEG,
  Object.freeze({ index_mcp_flex: 70, index_pip_flex: 90, index_dip_flex: 60 }),
  Object.freeze({ thumb_mcp_flex: 50 }),
  Object.freeze({ thumb_mcp_flex: -10 })
]);

/** The A/D range is computed against a margin this much tighter (NDC) than the per-pose fit check, so poses between
 * the sampled levels still fit at the range edge; the per-pose check plus depth fit absorbs the rest. */
export const RANGE_SLACK_NDC = 0.015;
/** Number of unit directions used to keep only the extreme points of the per-joint corner grid (support-function
 * pruning: the in-view region is convex, so only the hull of the corner set matters). */
export const ENVELOPE_DIRECTIONS = 384;
/** Bounded LRU of look-dependent A/D ranges per (rig, boxes). */
export const RANGE_CACHE_MAX = 256;
const envCache = new WeakMap();

/** Hand-rest corners of the hand box and of every digit over the full per-joint grid (wrist independent). */
function gridCorners(rig, boxes) {
  const pts = [];
  const pushBox = (M, box) => { for (const c of box) { const p = transformPoint(M, c); pts.push(p[0], p[1], p[2]); } };
  const I = Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  pushBox(I, checkBox(boxes.get('hand'), 'hand'));
  const G = ENVELOPE_GRID;
  for (const d of DIGIT_NAMES) {
    const bpp = checkBox(boxes.get(`${d}_pp`), `${d}_pp`), bmp = checkBox(boxes.get(`${d}_mp`), `${d}_mp`), bdp = checkBox(boxes.get(`${d}_dp`), `${d}_dp`);
    const abds = d === 'middle' ? [0] : G.mcp_abd;
    for (const abd of abds) {
      const Ra = jointMatrix(rig, `${d}_mcp_abd`, abd);
      for (const mcp of G.mcp_flex) {
        const Mpp = multiply(Ra, jointMatrix(rig, `${d}_mcp_flex`, mcp));
        pushBox(Mpp, bpp);
        for (const pip of G.pip_flex) {
          const Mmp = multiply(Mpp, jointMatrix(rig, `${d}_pip_flex`, pip));
          pushBox(Mmp, bmp);
          for (const dip of G.dip_flex) pushBox(multiply(Mmp, jointMatrix(rig, `${d}_dip_flex`, dip)), bdp);
        }
      }
    }
  }
  const bmc = checkBox(boxes.get('thumb_mc'), 'thumb_mc'), btp = checkBox(boxes.get('thumb_pp'), 'thumb_pp'), btd = checkBox(boxes.get('thumb_dp'), 'thumb_dp');
  for (const opp of G.thumb_cmc_opp) {
    const Mmc = jointMatrix(rig, 'thumb_cmc_opp', opp);
    pushBox(Mmc, bmc);
    for (const mcp of G.thumb_mcp_flex) {
      const Mpp = multiply(Mmc, jointMatrix(rig, 'thumb_mcp_flex', mcp));
      pushBox(Mpp, btp);
      for (const ip of G.thumb_ip_flex) pushBox(multiply(Mpp, jointMatrix(rig, 'thumb_ip_flex', ip)), btd);
    }
  }
  return Float64Array.from(pts);
}

/**
 * Pose-independent quantities, cached per rig and boxes:
 *  wrists: per ENVELOPE_GRID (wrist, pronation) level, its arm context and the hand-rest envelope points (pruned
 *    per-joint grid corners plus the forearm-support box under the inverse wrist rotation);
 *  sizePoses: context and hand-only silhouette of SIZE_REFERENCE_POSES;
 *  dMinM/dMaxM: shoulder-to-hand-centre distances reachable at every (wrist, pronation) level (2 mm shrink; reported).
 */
export function handEnvelope(rig, boxes) {
  if (!(boxes instanceof Map)) fail('arm_boxes', 'boxes must be the Map returned by segmentBoxes');
  rigBase(rig);
  let byRig = envCache.get(rig);
  if (!byRig) { byRig = new WeakMap(); envCache.set(rig, byRig); }
  const hit = byRig.get(boxes);
  if (hit) return hit;
  const digitPts = pruneExtremes(gridCorners(rig, boxes), fibonacciDirections(ENVELOPE_DIRECTIONS));
  const support = boxes.has(FOREARM_SUPPORT_KEY) ? checkBox(boxes.get(FOREARM_SUPPORT_KEY), FOREARM_SUPPORT_KEY) : null;
  let dMaxM = Infinity, dMinM = 0;
  const wrists = [];
  for (const w of ENVELOPE_GRID.wrist_flex) {
    let pts = digitPts;
    if (support) {
      const L = rigidInverse(wristMatrix(rig, { wrist_flex: w }));
      pts = new Float64Array(digitPts.length + support.length * 3);
      pts.set(digitPts);
      let k = digitPts.length;
      for (const c of support) { const p = transformPoint(L, c); pts[k++] = p[0]; pts[k++] = p[1]; pts[k++] = p[2]; }
    }
    for (const pro of ENVELOPE_GRID.forearm_pronation) {
      const ctx = poseContext(rig, { wrist_flex: w, forearm_pronation: pro });
      if (ctx.empty) dMaxM = 0;
      else { dMaxM = Math.min(dMaxM, ctx.dMaxM); dMinM = Math.max(dMinM, ctx.dMinM); }
      wrists.push({ w, pro, ctx, corners: pts, anchor: w >= ANCHOR_WRIST_RANGE_DEG[0] && w <= ANCHOR_WRIST_RANGE_DEG[1] && RANGE_PRONATION_LEVELS.includes(pro) });
    }
  }
  const anchorLevels = wrists.filter(l => l.anchor);
  const gameLevels = [];
  for (const shape of GAME_POSES) for (const pro of RANGE_PRONATION_LEVELS) {
    const ctx = poseContext(rig, { ...shape, forearm_pronation: pro });
    gameLevels.push({ w: ctx.J.wrist_flex, pro, ctx, corners: handCorners(rig, boxes, ctx.J) });
  }
  // R4-arm: the rest hand palm down (the start state) for the usable W/S travel check (ARM_DEFAULTS.minFitSpanM). Palm
  // up is not required: its taller silhouette has only about 2-5 cm of travel even mid-screen (round3 geometry), and
  // requiring it would cut the A/D range far more than it gains (harness/run-R4-arm-probe-1).
  const restLevels = [PRONATION_STATES.pronated].map(pro => {
    const ctx = poseContext(rig, { ...REST_HAND_POSE_DEG, forearm_pronation: pro });
    return { w: ctx.J.wrist_flex, pro, ctx, corners: handCorners(rig, boxes, ctx.J) };
  });
  const sizePoses = SIZE_REFERENCE_POSES.map(J => {
    const ctx = poseContext(rig, J);
    return { ctx, corners: handSilhouette(rig, ctx.J) };
  });
  const env = { wrists, anchorLevels, gameLevels, restLevels, sizePoses, digitPointCount: digitPts.length / 3, dMinM: dMinM + 0.002, dMaxM: dMaxM - 0.002, ranges: new Map(), poses: wrists };
  byRig.set(boxes, env);
  return env;
}

function fitsAt(ctx, corners, x, d, tanHalf, aspect, o, box, nearMin) {
  const ox = atAnchor(o, x, tanHalf, aspect);
  const core = solveArmCore(ctx, pointOnNdcRay(x, o.yNdc, d, tanHalf, aspect), ox, o);
  if (!core.reachable) return false;
  return scoreCorners(handMatrixOf(ctx, core), corners, tanHalf, aspect, box, nearMin).ok;
}

/** Deepest depth at anchor x reachable at EVERY level of the set (default the anchor envelope; the far end of the W/S
 * window), or null. */
function farDepth(env, x, tanHalf, aspect, o, levels = env.anchorLevels) {
  let far = Infinity;
  for (const { ctx } of levels) {
    const iv = rayInterval(ctx, x, o, tanHalf, aspect);
    if (iv.empty) return null;
    if (iv.hi < far) far = iv.hi;
  }
  return Number.isFinite(far) && far >= o.minDepth ? far : null;
}

/** NDC padding of the soft-tissue margin at depth d (vertical). */
const tissuePadNdc = (d, tanHalf) => (HAND_SOFT_TISSUE_MM * MM) / (Math.max(d, 1e-6) * tanHalf);

/** Projected hand height (NDC: bone silhouette + soft tissue) of a size pose at anchor x and depth d; Infinity if
 * unreachable. */
function sizeAt(sp, x, d, tanHalf, aspect, o) {
  // A size pose whose own reach ends before d is measured where it stops (its hand cannot go deeper).
  const iv = rayInterval(sp.ctx, x, o, tanHalf, aspect);
  if (iv.empty) return Infinity;
  const dd = clamp(d, iv.lo, iv.hi);
  const ox = atAnchor(o, x, tanHalf, aspect);
  const core = solveArmCore(sp.ctx, pointOnNdcRay(x, o.yNdc, dd, tanHalf, aspect), ox, o);
  if (!core.reachable) return Infinity;
  const e = ndcExtents(handMatrixOf(sp.ctx, core), sp.corners, tanHalf, aspect);
  return e.yHi - e.yLo + 2 * tissuePadNdc(dd, tanHalf);
}

const maxSizeAt = (env, x, d, tanHalf, aspect, o) => {
  let h = 0;
  for (const sp of env.sizePoses) { const v = sizeAt(sp, x, d, tanHalf, aspect, o); if (v > h) h = v; }
  return h;
};

/**
 * Near end of the W/S window at anchor x: the smallest depth in [minDepth, far] at which every SIZE_REFERENCE_POSES
 * hand height is <= maxHandHeightNdc. The projected height falls roughly as 1/depth, so a fixed-point iteration
 * d <- d * h(d) / cap converges in a few steps; the result is then verified (nudged deeper until it holds). Returns far
 * when even the far end exceeds the cap (the cap is a display target; whole-hand visibility is the hard rule).
 */
function nearDepth(env, x, far, tanHalf, aspect, o) {
  const cap = o.maxHandHeightNdc;
  if (!(far > o.minDepth)) return far;
  if (cap >= 2) return o.minDepth;
  if (maxSizeAt(env, x, o.minDepth, tanHalf, aspect, o) <= cap) return o.minDepth;
  const hFar = maxSizeAt(env, x, far, tanHalf, aspect, o);
  if (!(hFar <= cap)) return far;
  let d = clamp(far * hFar / cap, o.minDepth, far);
  for (let i = 0; i < 4; i++) {
    const h = maxSizeAt(env, x, d, tanHalf, aspect, o);
    if (!Number.isFinite(h)) { d = far; break; }
    const next = clamp(d * h / cap, o.minDepth, far);
    if (Math.abs(next - d) < 1e-4) { d = next; break; }
    d = next;
  }
  for (let i = 0; i < 12 && d < far && !(maxSizeAt(env, x, d, tanHalf, aspect, o) <= cap); i++) d = Math.min(far, d * 1.01 + 1e-4);
  return d;
}

/** W/S depth window at anchor x: { near, far, empty } (far over the given level set). */
function depthWindow(env, x, tanHalf, aspect, o, levels = env.anchorLevels) {
  const far = farDepth(env, x, tanHalf, aspect, o, levels);
  if (far === null) return { near: o.minDepth, far: o.minDepth, empty: true };
  return { near: nearDepth(env, x, far, tanHalf, aspect, o), far, empty: false };
}

/** R4-arm: the rest hand's arm at anchor x and depth d is anatomically comfortable: the shoulder inside SHOULDER_LIMITS
 * (horizontal adduction across the body ends at planeMaxDeg) and the arm no closer than ARM_EYE_CLEARANCE_M to the eye. */
function restArmComfortable(lvl, x, d, tanHalf, aspect, o) {
  const ox = atAnchor(o, x, tanHalf, aspect);
  const core = solveArmCore(lvl.ctx, pointOnNdcRay(x, o.yNdc, d, tanHalf, aspect), ox, o);
  const base = lvl.ctx.base;
  const elbowCam = transformPoint(core.SM, base.E0);
  const wristCam = transformPoint(multiply(core.SM, rotationAboutPivot(base.a, core.phi, base.E0)), base.W0);
  const sol = { shoulderCam: core.shoulderCam, elbowCam, wristCam };
  return shoulderReport(sol, o.bodyToCamera || null).within && !eyeClearance(sol).nearEye;
}

/** Every anchor-envelope level (ANCHOR_WRIST_RANGE_DEG x every pronation level x the full digit grid) fits at anchor
 * x at its own deepest reachable depth (deeper only shrinks the projection), and the W/S window keeps at least
 * minReachSpanM. R4-arm `relax` levels: 0 (strict) the palm-down rest hand also fits over the last minFitSpanM of the
 * window, and its arm stays comfortable (restArmComfortable) at the far end, at that span's near end and at the
 * window's near end; 1 only the comfort check; 2 the round-3 rules. */
function anchorFeasible(env, x, tanHalf, aspect, o, box, nearMin, levels = env.anchorLevels, relax = 0) {
  // R4-arm: the window and the rest-hand checks first (one fit and three closed-form solves), then the per-level fits
  // (up to 40 fits): an anchor that only the new checks reject now exits early (same result, every check is ANDed).
  const span = relax === 0 && o.minFitSpanM > 0, comfort = relax <= 1 && o.reachComfort;
  if (o.minReachSpanM > 0 || span || comfort) {
    const win = depthWindow(env, x, tanHalf, aspect, o, levels);
    if (win.empty || win.far - win.near < o.minReachSpanM) return false;
    // The rest hand fits whole over the last minFitSpanM of the window (W and S visibly move it here), and its arm stays
    // comfortable wherever W/S can put it.
    for (const lvl of (span || comfort) ? env.restLevels : []) {
      const iv = rayInterval(lvl.ctx, x, o, tanHalf, aspect);
      if (iv.empty) return false;
      const dFar = Math.min(win.far, iv.hi), d = dFar - o.minFitSpanM, dNear = Math.min(dFar, Math.max(win.near, iv.lo));
      if (span && (d < win.near - 1e-9 || d < iv.lo - 1e-9 || !fitsAt(lvl.ctx, lvl.corners, x, d, tanHalf, aspect, o, box, nearMin))) return false;
      if (comfort) {
        for (const dd of [dFar, Math.max(d, dNear), dNear]) if (!restArmComfortable(lvl, x, dd, tanHalf, aspect, o)) return false;
      }
    }
  }
  // Move-to-front: the level that failed last is tried first (most infeasible probes then exit after one level).
  const n = levels.length;
  const first = Number.isInteger(levels.failHint) ? levels.failHint : 0;
  for (let k = 0; k < n; k++) {
    const i = (first + k) % n;
    const { ctx, corners } = levels[i];
    const iv = rayInterval(ctx, x, o, tanHalf, aspect);
    if (iv.empty || !fitsAt(ctx, corners, x, iv.hi, tanHalf, aspect, o, box, nearMin)) { levels.failHint = i; return false; }
  }
  return true;
}

const q = (v, step) => Math.round(v / step);

/** Cache key of the viewport and margins (look independent). */
function viewKey(aspect, fov, o) {
  const g = o.reachGirdle;
  const gk = g ? [g.startXNdc, g.fullXNdc, ...g.shiftAtFullM].join(':') : 'off';
  return [q(aspect, 1e-4), q(fov, 1e-3), o.marginNdc, o.near, o.nearMargin, o.minDepth, o.yNdc, o.maxHandHeightNdc, o.minReachSpanM, o.minFitSpanM, gk, o.reachComfort, o.widerTier,
    o.viewLimitsNdc ? ['left', 'right', 'bottom', 'top'].map(k => q(o.viewLimitsNdc[k], 1e-4)).join(':') : 'view'].join(',');
}

/** Range-cache quantisation of the attachment (m, unit pole direction): looks whose shoulder differs by less than this
 * share a range (about a quarter of a degree of look). The per-frame fit re-checks the exact pose and attachment, and
 * RANGE_SLACK_NDC absorbs the difference. */
export const RANGE_KEY_SHOULDER_M = 0.0015;
const RANGE_KEY_POLE = 0.004;

/** Cache key of a look-dependent range: viewport, margins and the quantised attachment. */
function rangeKey(aspect, fov, o) {
  const pd = normalize(sub(o.pole, o.shoulderCam));
  return [viewKey(aspect, fov, o), ...o.shoulderCam.map(v => q(v, RANGE_KEY_SHOULDER_M)), ...pd.map(v => q(v, RANGE_KEY_POLE))].join(',');
}

/** R4-arm tier note (ARM_DEFAULTS.widerTier): the 'full' tier (every pose of the per-joint grid fits at the range
 * edges) is a stronger guarantee but can be far narrower than the 'game' tier. Round 3 used 'full' whenever ANY anchor
 * admitted it, which made the A/D range jump between neighbouring looks (1280x720 look 0/-0.6: full -0.443..-0.130 next
 * to game ranges about 0.95 wide; harness/run-R4-arm-probe-1/grid-base-9.txt). With widerTier the A/D range uses the
 * game tier at every look (as round 3 already did at the start look); poses outside GAME_POSES are fitted per frame
 * (depth push, wrist clamp), exactly as before. */
export const TIER_NOTE = 'game tier at every look (widerTier)';
/** R4-arm: a strict range (rest-hand W/S travel and arm comfort, see anchorFeasible) narrower than this (NDC) falls back
 * to the relaxed round-3 rules when those give a wider range (extreme overhead looks). */
export const MIN_STRICT_WIDTH_NDC = 0.2;
const rangeWidth = r => (r ? r.xMax - r.xMin : -Infinity);

/** Warm-start step (NDC) and bisection steps of the incremental range-edge search. */
const WARM_STEP_NDC = 0.04;
const WARM_BISECT_STEPS = 7;

/** One tier's A/D range search (see anchorRange): seeds, then each edge by bisection or the warm start. */
function solveRangeTier(env, levels, tier, tanHalf, aspect, o, box, nearMin, last, relax = 0) {
  const ok = x => anchorFeasible(env, x, tanHalf, aspect, o, box, nearMin, levels, relax);
  const xLo = -box.l, xHi = box.r; // the anchor itself lies inside the hand's box
  const warm = last && last.tier === tier && (last.relax || 0) === relax ? last : null;
  let seed = null;
  const seeds = warm ? [0.5 * (warm.xMin + warm.xMax), warm.xMin, warm.xMax] : [];
  for (const x of [...seeds, -0.2, -0.1, -0.3, 0, -0.4, 0.1, -0.5, 0.2, -0.6, 0.3, -0.7, 0.4, 0.5]) if (x >= xLo && x <= xHi && ok(x)) { seed = x; break; }
  if (seed === null) return null;
  const bisect = (inner, outer, steps) => {
    for (let i = 0; i < steps; i++) { const mid = 0.5 * (inner + outer); if (ok(mid)) inner = mid; else outer = mid; }
    return inner;
  };
  const side = sign => {
    const edge = sign < 0 ? xLo : xHi;
    if (warm) {
      // Incremental search from the previous edge of this viewport: probe outward or inward in WARM_STEP_NDC steps.
      const prev = clamp(sign < 0 ? warm.xMin : warm.xMax, xLo, xHi);
      if (sign * (prev - seed) >= 0) {
        if (ok(prev)) {
          let inner = prev;
          for (let k = 0; k < 6; k++) {
            const nxt = sign * Math.min(sign * edge, sign * inner + WARM_STEP_NDC);
            if (nxt === inner) return inner;
            if (!ok(nxt)) return bisect(inner, nxt, WARM_BISECT_STEPS);
            inner = nxt;
          }
        } else {
          let outer = prev;
          for (let k = 0; k < 8; k++) {
            const nxt = sign * Math.max(sign * seed, sign * outer - WARM_STEP_NDC);
            if (ok(nxt)) return bisect(nxt, outer, WARM_BISECT_STEPS);
            if (nxt === seed) return seed;
            outer = nxt;
          }
        }
      }
    }
    if (ok(edge)) return edge;
    return bisect(seed, edge, RANGE_BISECT_STEPS);
  };
  return Object.freeze(relax > 0 ? { xMin: side(-1), xMax: side(1), tier, relax } : { xMin: side(-1), xMax: side(1), tier });
}

/**
 * The A/D range for a viewport and look, independent of the current pose: [xMin, xMax] such that every envelope level
 * fits at the deepest reachable depth of that anchor and the W/S window keeps minReachSpanM. Tier 'full' uses the
 * anchor envelope (ANCHOR_WRIST_RANGE_DEG x pronation x the full digit grid); when no anchor satisfies it, tier 'game'
 * uses GAME_POSES x pronation. Asymmetric because the shoulder is on the left. Cached in a bounded LRU keyed by the
 * viewport and the quantised attachment. Returns {xMin, xMax, tier} or null when no anchor fits either tier.
 */
export function anchorRange(rig, boxes, { aspect, fovYDeg } = {}, options = {}) {
  // R5-pronation: the A/D range is a property of the reference (palm-down, uncoupled) arm, so W/A/S/D reach does not
  // change with the rotation coupling; the per-frame fit checks the coupled arm exactly.
  const o = mergeOptions({ ...(options || {}), rotationCoupling: false });
  const fov = fovYDeg === undefined ? o.fovYDeg : fovYDeg;
  const tanHalf = tanHalfFov(aspect, fov);
  const env = handEnvelope(rig, boxes);
  const key = rangeKey(aspect, fov, o);
  if (env.ranges.has(key)) {
    const v = env.ranges.get(key);
    env.ranges.delete(key);
    env.ranges.set(key, v);
    return v;
  }
  const box = viewBox(o, RANGE_SLACK_NDC), nearMin = o.near + o.nearMargin;
  const vk = viewKey(aspect, fov, o);
  if (!env.lastByView) env.lastByView = new Map();
  const last = env.lastByView.get(vk) || null;
  const solve = (levels, tier, relax) => solveRangeTier(env, levels, tier, tanHalf, aspect, o, box, nearMin, last, relax);
  // R4-arm (widerTier): the 'game' tier only. The 'full' tier's constraints contain the game tier's (the full digit grid
  // and wrist band contain every game pose, and its far depth is the smaller one), so its range lies inside the game
  // range and was the narrower choice (see TIER_NOTE).
  const pick = relax => (o.widerTier ? solve(env.gameLevels, 'game', relax) : solve(env.anchorLevels, 'full', relax) || solve(env.gameLevels, 'game', relax));
  // R4-arm relax levels (anchorFeasible): strict, then without the W/S travel check, then the round-3 rules, each only
  // while the range so far is narrower than MIN_STRICT_WIDTH_NDC (extreme looks) and only when it widens the range.
  let result = pick(0);
  for (const relax of [1, 2]) {
    if (relax === 1 && !(o.minFitSpanM > 0)) continue;
    if (relax === 2 && !(o.minFitSpanM > 0 || o.reachComfort)) continue;
    if (rangeWidth(result) >= MIN_STRICT_WIDTH_NDC) break;
    const loose = pick(relax);
    if (loose && rangeWidth(loose) > rangeWidth(result)) result = loose;
  }
  if (result) env.lastByView.set(vk, result);
  env.ranges.set(key, result);
  if (env.ranges.size > RANGE_CACHE_MAX) env.ranges.delete(env.ranges.keys().next().value);
  return result;
}

/**
 * R4-arm diagnostics (QA/tests): both tiers' A/D ranges for a viewport and look, uncached and without the warm start:
 * { full: {xMin, xMax} | null, game: {xMin, xMax} | null, chosen: anchorRange's result }.
 */
export function anchorRangeTiers(rig, boxes, { aspect, fovYDeg } = {}, options = {}) {
  const o = mergeOptions({ ...(options || {}), rotationCoupling: false }); // R5-pronation: the reference arm, as anchorRange
  const fov = fovYDeg === undefined ? o.fovYDeg : fovYDeg;
  const tanHalf = tanHalfFov(aspect, fov);
  const env = handEnvelope(rig, boxes);
  const box = viewBox(o, RANGE_SLACK_NDC), nearMin = o.near + o.nearMargin;
  return {
    full: solveRangeTier(env, env.anchorLevels, 'full', tanHalf, aspect, o, box, nearMin, null),
    game: solveRangeTier(env, env.gameLevels, 'game', tanHalf, aspect, o, box, nearMin, null),
    gameNoSpan: solveRangeTier(env, env.gameLevels, 'game', tanHalf, aspect, o, box, nearMin, null, 1),
    gameRound3Rules: solveRangeTier(env, env.gameLevels, 'game', tanHalf, aspect, o, box, nearMin, null, 2),
    chosen: anchorRange(rig, boxes, { aspect, fovYDeg }, options)
  };
}

/**
 * Diagnostics (QA/tests): for anchor x, every anchor-envelope level with its own far depth, whether it fits there and
 * its NDC extents. { levels: [{ wristDeg, pronationDeg, farDepth, fits, xLo, xHi, yLo, yHi }], window }.
 */
export function envelopeDiagnostics(rig, boxes, { xNdc, aspect, fovYDeg } = {}, options = {}) {
  const o = mergeOptions({ ...(options || {}), rotationCoupling: false }); // R5-pronation: the reference arm, as anchorRange
  finite(xNdc, 'xNdc');
  const tanHalf = tanHalfFov(aspect, fovYDeg === undefined ? o.fovYDeg : fovYDeg);
  const env = handEnvelope(rig, boxes);
  const box = viewBox(o, RANGE_SLACK_NDC), nearMin = o.near + o.nearMargin;
  const levels = env.anchorLevels.map(({ w, pro, ctx, corners }) => {
    const iv = rayInterval(ctx, xNdc, o, tanHalf, aspect);
    if (iv.empty) return { wristDeg: w, pronationDeg: pro, farDepth: null, fits: false };
    const ox = atAnchor(o, xNdc, tanHalf, aspect);
    const core = solveArmCore(ctx, pointOnNdcRay(xNdc, o.yNdc, iv.hi, tanHalf, aspect), ox, o);
    const M = handMatrixOf(ctx, core);
    const e = ndcExtents(M, corners, tanHalf, aspect);
    return { wristDeg: w, pronationDeg: pro, farDepth: iv.hi, reachable: core.reachable, fits: core.reachable && scoreCorners(M, corners, tanHalf, aspect, box, nearMin).ok, ...e };
  });
  return { levels, window: depthWindow(env, xNdc, tanHalf, aspect, o), limit: box.r, box };
}

/**
 * The W/S depth window for an anchor (exported for the HUD/QA and tests): { near, far, empty } in metres, where near is
 * the hand-size limited end and far the reach limit (see ARM_DEFAULTS.maxHandHeightNdc).
 */
export function reachWindow(rig, boxes, { xNdc, aspect, fovYDeg } = {}, options = {}) {
  const o = mergeOptions({ ...(options || {}), rotationCoupling: false }); // R5-pronation: the reference arm, as fitHand's window
  finite(xNdc, 'xNdc');
  const tanHalf = tanHalfFov(aspect, fovYDeg === undefined ? o.fovYDeg : fovYDeg);
  const env = handEnvelope(rig, boxes);
  // R4-arm: the window of the tier the A/D range uses (as fitHand does); round 3 always used the full tier here.
  const range = anchorRange(rig, boxes, { aspect, fovYDeg }, options);
  const w = depthWindow(env, xNdc, tanHalf, aspect, o, range && range.tier === 'game' ? env.gameLevels : env.anchorLevels);
  return { near: w.near, far: w.far, empty: w.empty };
}

/**
 * Projected hand size (NDC) of a placed hand: { xLo, xHi, yLo, yHi, height, width, centreX, centreY } of the hand and
 * digit BONE silhouette (rig.silhouette) padded by HAND_SOFT_TISSUE_MM, i.e. the visible hand, not the conservative fit
 * boxes. height / 2 is the fraction of the view height. Pass fitHand's solution (or solveArm's result) and the pose.
 */
export function handScreenBounds(rig, solution, joints, { aspect, fovYDeg = ARM_DEFAULTS.fovYDeg } = {}) {
  const tanHalf = tanHalfFov(aspect, fovYDeg);
  if (!solution || !(solution.matrices instanceof Map)) fail('arm_input', 'solution with matrices is required');
  const M = solution.matrices.get('hand');
  const e = ndcExtents(M, handSilhouette(rig, normalizeJoints(joints)), tanHalf, aspect);
  const centreCam = solution.handCentreCam || transformPoint(M, rig.handCentre);
  const centre = projectToNdc(centreCam, tanHalf, aspect);
  const py = tissuePadNdc(centre.depth, tanHalf), px = py / aspect;
  const b = { xLo: e.xLo - px, xHi: e.xHi + px, yLo: e.yLo - py, yHi: e.yHi + py };
  return { ...b, height: b.yHi - b.yLo, width: b.xHi - b.xLo, centreY: centre.y, centreX: centre.x };
}

/* ------------------------------------------------------------------ shoulder / clearance reports */

/**
 * Humerus direction of a solution in the BODY frame and its check against SHOULDER_LIMITS.
 * @param solution fitHand/solveArm solution (camera space)
 * @param bodyToCamera rotation (4x4) from armAttachment().bodyToCamera; identity (look 0, 0) when omitted
 * @returns {{ elevationDeg, planeDeg, humerusBody: [x, y, z], within: boolean, reason: string|null }}
 */
export function shoulderReport(solution, bodyToCamera = null) {
  if (!solution || !solution.elbowCam || !solution.shoulderCam) fail('arm_input', 'solution from solveArm/fitHand is required');
  const uCam = normalize(sub(solution.elbowCam, solution.shoulderCam));
  const u = bodyToCamera ? transformDirection(rotationTranspose(bodyToCamera), uCam) : uCam;
  const elevationDeg = Math.acos(clamp(-u[1], -1, 1)) / DEG;
  // body axes: forward = -z, lateral (left side of the left shoulder) = -x
  const planeDeg = Math.atan2(-u[2], -u[0]) / DEG;
  const L = SHOULDER_LIMITS;
  let reason = null;
  if (elevationDeg > L.elevationMaxDeg + 1e-6) reason = `elevation ${elevationDeg.toFixed(0)} deg`;
  else if (elevationDeg > L.planeFreeBelowDeg && (planeDeg < L.planeMinDeg || planeDeg > L.planeMaxDeg)) reason = `plane of elevation ${planeDeg.toFixed(0)} deg at elevation ${elevationDeg.toFixed(0)} deg`;
  return { elevationDeg, planeDeg, humerusBody: u, within: reason === null, reason };
}

/** Closest approach (m) of the upper arm and forearm axes to the eye (camera origin) for a solution. */
export function eyeClearance(solution) {
  const O = [0, 0, 0];
  const upper = pointSegmentDistance(O, solution.shoulderCam, solution.elbowCam);
  const fore = pointSegmentDistance(O, solution.elbowCam, solution.wristCam);
  const minEyeDistanceM = Math.min(upper, fore);
  return { upperArmM: upper, forearmM: fore, minEyeDistanceM, nearEye: minEyeDistanceM < ARM_EYE_CLEARANCE_M };
}

/* ------------------------------------------------------------------ fit */

/**
 * Fit a reach request (A3/U3a placement rules, see the module header).
 *  - The hand centre stays exactly on the ray through NDC (xNdc, yNdc = +0.5).
 *  - Only A/D (request.xNdc) sets the horizontal anchor; it is clamped to anchorRange (viewport + look, never the pose):
 *    anchor 'held' or 'ad_range_clamp', except that a request outside the range is kept when the current pose still
 *    fits whole there at some reachable depth ('held_outside_range', round-2 fix F1: a look alone never moves x).
 *  - Depth = W/S request (or the depth of an explicit elbow target), clamped to the anchor's window [near, far] and to
 *    the current pose's reach; if the posed hand (every box corner) does not fit there, depth is pushed outward to the
 *    smallest fitting depth. Pose therefore changes depth or the silhouette, never the horizontal anchor.
 *  - Graceful wrist clamp: when the commanded pose cannot be shown whole at that anchor at ANY reachable depth (strong
 *    wrist flexion/extension with the fingers pointing up the screen at full reach), the DISPLAYED wrist angle moves
 *    toward 0 in WRIST_CLAMP_STEP_DEG steps until it fits (clamped.wrist, joints = the pose actually shown).
 *  - Degraded cases are flagged: 'look_unsatisfiable' (no anchor fits the anchor envelope for this look: the request is
 *    kept if the pose fits there, else x moves to the nearest anchor where it fits) and 'pose_exceeds_envelope'
 *    (should not occur; last resort that moves x toward the range centre).
 * Every result is re-checked corner by corner with the full forward kinematics (fallback 'unsatisfiable' if not).
 * request: { xNdc, depth, joints, yNdc? (default HAND_Y_NDC), rotation? (see jointsWithRotation; joints.forearm_pronation
 *   wins) }. options: ARM_DEFAULTS overrides plus attachment (armAttachment) or shoulderCam/pole.
 * reachState: the player's A/D and W/S INTENT to feed back into stepReach (the request, kept within the screen), so a
 *   look or pose that narrows the range or pushes the hand deeper does not erase it; pass xLimits / depthLimits to
 *   stepReach as xRange / depthRange so that holding a key beyond a limit does not wind the intent up.
 * @returns {{xNdc, yNdc, depth, joints, solution, cornersNdc, clamped:{x, depth, wrist}, wristCommandDeg, anchor,
 *   fallback, range, xLimits, depthLimits, reach, envelopeReach, window:{near, far}, handNdc, shoulder, clearance,
 *   reachState}}
 */
/** R5-input (round-4 FIX-REPORT "Extra issues": the 0.7 mm per-frame W jitter at the reach limit): a shown hand at most
 * this far (m) beyond the anchor window's far end still gets the window's far end as its W/S guard (fitHand
 * depthLimits.maxDepth). Larger than one ramp step from rest (0.3 m/s x (1/60 s)^2 / (2 x 0.06 s) = 0.7 mm at 60 fps) and
 * smaller than one frame of full-speed travel (0.3 m/s / 60 = 5 mm), so a held W comes to rest exactly at the window's
 * far end; a hand pushed deeper than that by its pose keeps its own depth as the limit (S then starts from where the
 * hand is). A game control choice, not a measured quantity. */
export const WS_GUARD_SNAP_M = 0.002;

export function fitHand(rig, boxes, request, viewport, options = {}) {
  const { xNdc, depth, joints = {}, yNdc, rotation } = request || {};
  const opts = withRequestY(options, yNdc);
  const o = mergeOptions(opts);
  finite(xNdc, 'request.xNdc');
  finite(depth, 'request.depth');
  const { aspect, fovYDeg = o.fovYDeg } = viewport || {};
  const tanHalf = tanHalfFov(aspect, fovYDeg);
  const J0 = normalizeJoints(jointsWithRotation(joints, rotation));
  const env = handEnvelope(rig, boxes);
  const vbox = viewBox(o), nearMin = o.near + o.nearMargin;
  const range = anchorRange(rig, boxes, { aspect, fovYDeg }, opts);
  const poseFor = J => { const ctx = poseContext(rig, J); return { ctx, corners: handCorners(rig, boxes, ctx.J) }; };
  let P = poseFor(J0);
  const fits = (Q, x, d) => fitsAt(Q.ctx, Q.corners, x, d, tanHalf, aspect, o, vbox, nearMin);
  const smallestFitting = (Q, x, lo, hi) => {
    if (fits(Q, x, lo)) return lo;
    if (!fits(Q, x, hi)) return null;
    for (let i = 0; i < BISECT_STEPS; i++) { const mid = 0.5 * (lo + hi); if (fits(Q, x, mid)) hi = mid; else lo = mid; }
    return hi;
  };
  /** Fit pose Q at x: window-clamped request depth, pushed deeper as needed; d null when it fits nowhere. */
  const tierLevels = range && range.tier === 'game' ? env.gameLevels : env.anchorLevels;
  // R5-pronation: the W/S window belongs to the reference arm (as the A/D range); the pose's own reach (ivp) and every
  // fit use the coupled arm, so at palm up the hand stops where the coupled arm's reach ends if that is nearer.
  const oRef = o.rotationCoupling ? mergeOptions({ ...opts, rotationCoupling: false }) : o;
  const fitAtX = (Q, x) => {
    const win = depthWindow(env, x, tanHalf, aspect, oRef, tierLevels);
    const ivp = rayInterval(Q.ctx, x, o, tanHalf, aspect);
    if (ivp.empty) return { win, d: null };
    const hi = ivp.hi, lo = Math.min(Math.max(win.empty ? ivp.lo : win.near, ivp.lo), hi);
    return { win, d: smallestFitting(Q, x, clamp(depth, lo, hi), hi) };
  };
  /** fitAtX, then the graceful wrist clamp: the nearest displayed wrist angle (WRIST_CLAMP_STEP_DEG grid, toward 0 first,
   * then the other way, within WRIST_RANGE_DEG) at which the whole hand fits (updates P when one is used). */
  let wristClamped = false;
  const fitWithWrist = x => {
    const r = fitAtX(P, x);
    if (r.d !== null) return r;
    const w0 = J0.wrist_flex;
    const cands = [];
    for (let w = WRIST_RANGE_DEG[0]; w <= WRIST_RANGE_DEG[1] + 1e-9; w += WRIST_CLAMP_STEP_DEG) if (Math.abs(w - w0) > 1e-9) cands.push(w);
    cands.push(0);
    cands.sort((a, b) => {
      const ta = Math.abs(a) <= Math.abs(w0) && Math.sign(a) !== -Math.sign(w0) ? 0 : 1, tb = Math.abs(b) <= Math.abs(w0) && Math.sign(b) !== -Math.sign(w0) ? 0 : 1;
      return ta - tb || Math.abs(a - w0) - Math.abs(b - w0);
    });
    for (const w of cands) {
      const Q = poseFor({ ...J0, wrist_flex: w });
      const rq = fitAtX(Q, x);
      if (rq.d !== null) { P = Q; wristClamped = true; return rq; }
    }
    return r;
  };

  /** Last-resort anchor search: from x0 toward each target in X_SEARCH_STEPS steps, the first anchor where the pose
   * (with the wrist clamp) fits. */
  const searchX = (x0, targets) => {
    for (const target of targets) {
      for (let k = 1; k <= X_SEARCH_STEPS; k++) {
        const xm = x0 + ((target - x0) * k) / X_SEARCH_STEPS;
        const rm = fitWithWrist(xm);
        if (rm.d !== null) return { x: xm, r: rm };
      }
    }
    return null;
  };

  let x, d, anchor, fallback = null, win;
  if (range) {
    x = clamp(xNdc, range.xMin, range.xMax);
    anchor = x === xNdc ? 'held' : 'ad_range_clamp';
    let r = null;
    if (x !== xNdc) {
      // Round-2 fix F1 (L2/L3: a look alone never moves the hand sideways): the per-look anchor range is a
      // conservative envelope for every pose. When the CURRENT pose still fits whole at the requested x at some
      // reachable depth (with the graceful wrist clamp), keep the player's x ('held_outside_range'); clamp to the
      // range only when it fits nowhere there.
      const xr = clamp(xNdc, -vbox.l, vbox.r);
      const re = fitWithWrist(xr);
      if (re.d !== null) { x = xr; anchor = 'held_outside_range'; r = re; }
    }
    if (r === null) r = fitWithWrist(x);
    if (r.d === null) {
      // Not expected: the pose fits at no depth and no wrist angle here. Last resort, flagged: move toward the range
      // centre, then the screen centre.
      anchor = 'pose_exceeds_envelope';
      const found = searchX(x, [0.5 * (range.xMin + range.xMax), 0]);
      if (found) { x = found.x; r = found.r; }
    }
    win = r.win;
    d = r.d ?? rayInterval(P.ctx, x, o, tanHalf, aspect).hi;
    if (r.d === null) fallback = 'unsatisfiable';
  } else {
    // No anchor fits the anchor envelope for this viewport and look: keep the request if the pose fits there (with the
    // wrist clamp), else move to the nearest anchor (toward the screen centre first, then the other side) where it does.
    anchor = 'look_unsatisfiable';
    x = clamp(xNdc, -vbox.l, vbox.r);
    let r = fitWithWrist(x);
    if (r.d === null) {
      const found = searchX(x, [0, x <= 0 ? vbox.r : -vbox.l]);
      if (found) { x = found.x; r = found.r; }
    }
    win = r.win;
    const iv = rayInterval(P.ctx, x, o, tanHalf, aspect);
    d = r.d ?? (iv.empty ? Math.max(o.minDepth, depth) : iv.hi);
    fallback = r.d !== null ? 'exact_fit_only' : 'unsatisfiable';
  }

  const J = P.ctx.J;
  const ox = atAnchor(o, x, tanHalf, aspect);
  const solution = solveArm(rig, { xNdc: x, depth: d, joints: J, aspect, fovYDeg, shoulderCam: ox.shoulderCam, pole: ox.pole, yNdc: o.yNdc, reachGirdle: false,
    bodyToCamera: o.bodyToCamera || undefined, rotationCoupling: o.rotationCoupling || false,
    ...(o.cameraOriginBodyM ? { cameraOriginBodyM: o.cameraOriginBodyM } : {}) });
  const cornersNdc = [];
  let within = solution.reachable;
  for (const { seg, carrier, box } of checkedBoxes(boxes)) {
    const M = solution.matrices.get(carrier);
    for (const c of box) {
      const n = projectToNdc(transformPoint(M, c), tanHalf, aspect);
      cornersNdc.push({ segment: seg, x: n.x, y: n.y, depth: n.depth });
      if (!(n.depth >= nearMin && n.x >= -vbox.l && n.x <= vbox.r && n.y >= -vbox.b && n.y <= vbox.t)) within = false;
    }
  }
  const handNdc = handScreenBounds(rig, solution, J, { aspect, fovYDeg });
  const iv = rayInterval(P.ctx, x, o, tanHalf, aspect);
  const xReq = clamp(xNdc, -1, 1);
  // A hand held outside the anchor range widens the A/D limits to include it, so the next A/D press moves on from the
  // held x instead of jumping to the range edge (stepReach's wind-up guard restarts from the limit).
  const xLimits = range
    ? (anchor === 'held_outside_range' ? { xMin: Math.min(range.xMin, x), xMax: Math.max(range.xMax, x) } : range)
    : { xMin: xReq < x ? x : -vbox.l, xMax: xReq > x ? x : vbox.r };
  // R5-input (round-4 FIX-REPORT "Extra issues"): the W/S guard ends at the anchor window's far end (win.far =
  // envelopeReach.maxDepth), not at the arm's full reach along the ray (iv.hi, 0.6-1.4 mm deeper). The game keeps a held
  // W's intent at win.far (ns-app nextReach), so with the guard at iv.hi every frame stepped the request past win.far,
  // stepReach reset its ramp level at the guard, and the shown hand alternated between two depths 0.6-0.7 mm apart at the
  // W limit on every screen (harness/run-R5-input-r2-tools/jitter-probe.mjs; round5/R5-input-NOTES.md). Now a held W
  // rests at win.far, the depth where the hand also rests after W is let go (it used to step back 1.4 mm on release).
  // Unchanged: the S end, the A/D range, the rest depths and the intent range [win.near, win.far]. A hand already more
  // than WS_GUARD_SNAP_M beyond win.far (pushed by its pose) keeps its own depth as the limit, so S starts from it.
  const farGuard = o.wsGuardAtWindow && !win.empty && Number.isFinite(win.far) ? Math.min(iv.hi, win.far) : iv.hi;
  const maxGuard = o.wsGuardAtWindow ? (d > farGuard + WS_GUARD_SNAP_M ? d : farGuard) : Math.max(iv.hi, d);
  const depthLimits = { minDepth: Math.min(win.empty ? iv.lo : Math.max(win.near, iv.lo), d), maxDepth: maxGuard };
  return {
    xNdc: x,
    yNdc: o.yNdc,
    depth: d,
    joints: J,
    solution,
    cornersNdc,
    clamped: { x: x !== xNdc, depth: d !== depth, wrist: wristClamped },
    wristCommandDeg: J0.wrist_flex,
    anchor,
    fallback: within ? fallback : 'unsatisfiable',
    range,
    xLimits,
    depthLimits,
    reach: { minDepth: iv.lo, maxDepth: iv.hi, empty: iv.empty },
    envelopeReach: { minDepth: win.near, maxDepth: win.far, empty: win.empty },
    window: { near: win.near, far: win.far },
    handNdc,
    girdle: girdleReport(ox),
    // R5-pronation: the coupled palm turn (see couplingReport; all zero at palm down): what the body, the mirror and QA read.
    coupling: solution.coupling,
    shoulder: shoulderReport(solution, o.bodyToCamera || null),
    clearance: eyeClearance(solution),
    reachState: { xNdc: xReq, depth: clamp(depth, o.minDepth, REACH_STATE_MAX_DEPTH) }
  };
}

/**
 * Explicit signed elbow target (browser-findings repair R2, item 5): the depth along the camera ray through
 * (xNdc, yNdc) at which the closed-form arm solution has elbow flexion `elbowFlexRad`. Closed form: elbow angle ->
 * shoulder-to-hand-centre distance (monotonic on the solved branch) -> ray depth. The angle is first clamped to the
 * angles the chain can take for this pose (0..145 deg, wrist reach limit); `clamped` reports that. The caller still
 * fits the whole hand (fitHand), which may limit the movement further; it must report the achieved angle, not the
 * target. options as fitHand (attachment or shoulderCam).
 * @returns {{ depth: number, elbowFlexRad: number, clamped: boolean, reachable: boolean }}
 */
export function depthForElbow(rig, { xNdc, elbowFlexRad, joints = {}, aspect, fovYDeg, yNdc, rotation } = {}, options = {}) {
  const o = mergeOptions(withRequestY(options, yNdc));
  finite(xNdc, 'xNdc');
  finite(elbowFlexRad, 'elbowFlexRad');
  const tanHalf = tanHalfFov(aspect, fovYDeg === undefined ? o.fovYDeg : fovYDeg);
  const ctx = poseContext(rig, jointsWithRotation(joints, rotation));
  if (ctx.empty) return { depth: o.minDepth, elbowFlexRad, clamped: true, reachable: false };
  const phiLo = Math.max(0, ctx.phiLimF, ctx.cG.phi0), phiHi = Math.min(ELBOW_MAX, ctx.cG.phi0 + Math.PI);
  const phi = clamp(elbowFlexRad, phiLo, phiHi);
  const Dm = chainDist(ctx.cG, phi) * MM;
  const r = rayDir(xNdc, o.yNdc, tanHalf, aspect);
  // R5-pronation: the coupled shoulder (girdle and trunk follow) when the palm is turned away from palm down.
  const ox = atAnchor(o, xNdc, tanHalf, aspect);
  const u = couplingU(o.rotationCoupling, ctx.J.forearm_pronation);
  const S = u > 0 ? coupledShoulder(o, ox, u).shoulderCam : ox.shoulderCam;
  const rr = dot(r, r), rs = dot(r, S), ss = dot(S, S);
  const disc = rs * rs - rr * (ss - Dm * Dm);
  if (disc < 0) return { depth: Math.max(o.minDepth, rs / rr), elbowFlexRad: phi, clamped: phi !== elbowFlexRad, reachable: false };
  return { depth: (rs + Math.sqrt(disc)) / rr, elbowFlexRad: phi, clamped: phi !== elbowFlexRad, reachable: true };
}

const axisValue = v => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, -1, 1) : 0);

/** One axis of stepReach with the wind-up guard: beyond [lo, hi] a key pushing further out holds the intent, and a key
 * pushing back starts from the limit (immediate response). */
function guardedStep(v, rate, lo, hi) {
  if (Number.isFinite(lo) && v < lo) return rate > 0 ? lo + rate : rate < 0 ? v : v;
  if (Number.isFinite(hi) && v > hi) return rate < 0 ? hi + rate : rate > 0 ? v : v;
  const n = v + rate;
  if (Number.isFinite(lo) && v >= lo && n < lo && rate < 0) return Math.min(v, lo);
  if (Number.isFinite(hi) && v <= hi && n > hi && rate > 0) return Math.max(v, hi);
  return n;
}

/**
 * R3-arm reach input ramp (seconds): the A/D and W/S axis LEVELS move toward the keys' value at a limited rate (a
 * full 0 -> 1 change takes REACH_RAMP_S), and the hand moves by the exact integral of the level. Why: with real key
 * input two keys pressed "together" often arrive one frame apart. Without a ramp that one frame moved the hand a full
 * frame of travel (0.9 NDC/s x 16.7 ms = 0.015 NDC, e2e S07 "A+D cancel" FAIL at -0.01494 in
 * harness/run-R3-arm-base-cdp-2). With the ramp a one-frame skew moves it 0.9 * (1/60)^2 / (2 * 0.06) = 0.002 NDC.
 * Only the START is eased: releasing a key (or pressing the opposite one) stops the hand at once, so there is no
 * glide after release (a glide made the hand drift for 60 ms after the keys were up: e2e S04/S07 QA FAIL in
 * harness/run-R3-arm-e2e-wired-1-qa). Response: the hand moves in the first frame that sees the key (about 1.4 px at
 * 1280 px wide) and by about 5 px after two frames (33 ms), so it is visible well inside 100 ms (measured in the
 * browser: harness/run-R3-arm-latency-*). A display/control choice (not a measured movement time course). Only used
 * when the reach state carries the levels (see stepReach).
 */
export const REACH_RAMP_S = ARM_DEFAULTS.reachRampS;

/**
 * One axis level l0 moved toward the key value k for h seconds (rampS <= 0: no ramp). The level rises toward k at rate
 * 1 / rampS; it never lags a release or a reversal: a level pointing against k, or larger than k, drops to k's side of
 * zero at once (a stop is instant, a start is eased). Exact; returns the new level and the time integral of the level
 * over the step (multiply by the axis speed for the travel). Pure.
 */
export function rampAxis(l0, k, h, rampS = REACH_RAMP_S) {
  if (!(h > 0)) return { level: l0, integral: 0 };
  if (!(rampS > 0)) return { level: k, integral: k * h };
  let l = l0;
  if (l !== 0 && (k === 0 || Math.sign(l) !== Math.sign(k))) l = 0;
  else if (Math.abs(l) > Math.abs(k)) l = k;
  const r = 1 / rampS, gap = k - l, tr = Math.abs(gap) / r;
  if (tr <= h) return { level: k, integral: 0.5 * (l + k) * tr + k * (h - tr) };
  const l1 = l + Math.sign(gap) * r * h;
  return { level: l1, integral: 0.5 * (l + l1) * h };
}

/**
 * R3-arm WASD wrist convention (moved here from ns-app WASD_WRIST so the arm owner keeps the coordination in one
 * place; a DISPLAY GAME CONVENTION, not a measured synergy, not EMG, not a decoder). The keys move the hand; the IK moves
 * the shoulder and elbow; this adds a small wrist angle tied to the same reach state so the wrist moves with them:
 *  - depth: reaching deeper (W) extends the wrist, pulling back (S) flexes it (degPerM, unchanged from round 2);
 *  - sideways: moving the hand right (D) or left (A) tilts the hand on screen. Its sign is chosen so the wrist works
 *    WITH the elbow instead of against it: with the palm down, wrist flexion lies almost in the elbow's bending plane
 *    (about 0.15 deg of elbow per deg of wrist on this rig), and round 2's sign (+12 deg/NDC, D flexes) cancelled part of
 *    the elbow change of a sideways sweep. Measured on the real rig and app (harness/run-R3-arm-probe-1/probe.mjs, 30
 *    timing variants of the e2e S21 protocol at the e2e look yaw 1.2 / pitch 0.1), minimum NET elbow change A / D:
 *    round 2 0.92 / 3.74 deg; R3 rest pose with the +12 sign 2.33 / 4.77; this convention with the input ramp
 *    3.84 / 7.13 (round3/R3-arm-NOTES.md). The sideways term follows the forearm turn (times sin(forearm_pronation),
 *    +1 palm down, -1 palm up, 0 at mid-turn), so the hand tilts the same way on screen and the wrist keeps working with
 *    the elbow in both forearm states.
 * Capped at maxDeg; the whole-hand fit may still limit it (fitHand clamped.wrist).
 */
export const WASD_WRIST_SYNERGY = Object.freeze({ depthRefM: 0.35, degPerM: -60, xRefNdc: -0.3, degPerNdcPalmDown: -12, maxDeg: 15 });

/**
 * Wrist degrees (+ flexion) of the WASD wrist convention for a reach state { xNdc, depth } and the forearm rotation
 * (`rotation` as in fitHand requests: degrees from neutral, { value } 0 pronated .. 1 supinated, or a rotation state;
 * default palm down). Pure; 0 for an incomplete reach state.
 */
export function wasdWristDeg(reach, rotation = PRONATION_STATES.pronated, o = WASD_WRIST_SYNERGY) {
  if (!o || !reach || !Number.isFinite(reach.depth) || !Number.isFinite(reach.xNdc)) return 0;
  const pron = jointsWithRotation({}, rotation).forearm_pronation;
  const s = Number.isFinite(pron) ? Math.sin(clamp(pron, -90, 90) * DEG) : 1;
  const v = o.degPerM * (reach.depth - o.depthRefM) + o.degPerNdcPalmDown * s * (reach.xNdc - o.xRefNdc);
  return clamp(v, -o.maxDeg, o.maxDeg) + 0; // + 0: never -0
}

/** True when a guarded step moved less than requested in the request's direction (a limit stopped it). */
const stoppedByLimit = (from, to, rate) => (rate > 0 ? to - from < rate - 1e-12 : rate < 0 ? to - from > rate + 1e-12 : false);

/**
 * Apply A/D (axes.x: -1 left, +1 right) to xNdc and W/S (axes.z: +1 = W = forward = larger depth) to depth.
 * Returns the un-fitted request {xNdc, depth}; fitHand applies the rig, viewport and look limits. Feed fitHand's
 * reachState back as the next state, with options.xRange = fit.xLimits and options.depthRange = fit.depthLimits (the
 * wind-up guard: holding a key beyond a limit does not move the intent further, and the opposite key responds at once).
 * Non-finite or negative dt counts as 0.
 * R3-arm input ramp: when the state carries the axis levels `ax` / `az` (reachStart does; carry them to the next frame
 * with carryReachRamp), the levels ramp toward the keys over options.reachRampS (default REACH_RAMP_S) and the result
 * also returns { ax, az }. A level whose movement a limit stopped is reset to 0, so the opposite key still responds at
 * once. A state without the levels (legacy callers) moves exactly as before (no ramp, no extra fields).
 */
export function stepReach(state, axes, dt, options = {}) {
  const o = mergeOptions(options);
  if (!state || typeof state !== 'object') fail('arm_input', 'state must be {xNdc, depth}');
  finite(state.xNdc, 'state.xNdc');
  finite(state.depth, 'state.depth');
  const ax = axisValue(axes && axes.x), az = axisValue(axes && axes.z);
  const h = typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? dt : 0;
  const xr = options && options.xRange, dr = options && options.depthRange;
  const ramped = Number.isFinite(state.ax) || Number.isFinite(state.az);
  const rampS = ramped ? o.reachRampS : 0;
  const lx = rampAxis(Number.isFinite(state.ax) ? clamp(state.ax, -1, 1) : 0, ax, h, rampS);
  const lz = rampAxis(Number.isFinite(state.az) ? clamp(state.az, -1, 1) : 0, az, h, rampS);
  const rx = lx.integral * o.xSpeedNdcPerS, rz = lz.integral * o.depthSpeedMPerS;
  const x = clamp(guardedStep(state.xNdc, rx, xr ? xr.xMin : NaN, xr ? xr.xMax : NaN), -1, 1);
  const d = clamp(guardedStep(state.depth, rz, dr ? dr.minDepth : NaN, dr ? dr.maxDepth : NaN), o.minDepth, REACH_STATE_MAX_DEPTH);
  if (!ramped) return { xNdc: x, depth: d };
  return {
    xNdc: x, depth: d,
    ax: stoppedByLimit(state.xNdc, x, rx) ? 0 : lx.level,
    az: stoppedByLimit(state.depth, d, rz) ? 0 : lz.level
  };
}

/** The starting reach state from the defaults (with the R3-arm ramp levels at rest). */
export function reachStart(options = {}) {
  const o = mergeOptions(options);
  return { xNdc: o.xNdcStart, depth: o.depthStart, ax: 0, az: 0 };
}

/**
 * R3-arm wiring helper: the next frame's reach state `next` ({ xNdc, depth }, e.g. ns-app nextReach) with the ramp
 * levels of this frame's stepReach result `stepped` carried over (unchanged `next` when `stepped` has none). Pure.
 */
export function carryReachRamp(next, stepped) {
  if (!next || !stepped || !(Number.isFinite(stepped.ax) || Number.isFinite(stepped.az))) return next;
  return { ...next, ax: Number.isFinite(stepped.ax) ? stepped.ax : 0, az: Number.isFinite(stepped.az) ? stepped.az : 0 };
}

/**
 * R3-arm diagnostic: the screen x (NDC) at which a sideways A/D sweep at constant depth passes straight in front of the
 * shoulder (the point of the hand's ray line closest to the shoulder). Elbow flexion depends only on the
 * shoulder-to-hand distance (and a little on the wrist, about 0.15 deg of elbow per deg of wrist on this rig), so the
 * elbow is most bent here and straightens on BOTH sides: a sideways hold that ends about as far beyond this x as it
 * started before it shows almost no NET elbow change although the elbow bent and straightened during the hold.
 * options as fitHand (attachment or shoulderCam). Pure. R4-arm: with the reach girdle the shoulder moves with x, so the
 * closest approach is searched numerically (it can lie outside the A/D range, even outside [-1, 1]).
 */
export function lateralElbowPeakXNdc({ depth, aspect, fovYDeg, yNdc } = {}, options = {}) {
  const o = mergeOptions(withRequestY(options, yNdc));
  finite(depth, 'depth');
  if (!(depth > 0)) fail('arm_input', 'depth must be positive');
  const tanHalf = tanHalfFov(aspect, fovYDeg === undefined ? o.fovYDeg : fovYDeg);
  const x0 = o.shoulderCam[0] / (depth * tanHalf * aspect);
  if (!o.reachGirdle) return x0;
  // R4-arm: the reach girdle moves the shoulder with x (REACH_GIRDLE), so the closest approach is found numerically: the
  // x in [-2, 2] that minimises the shoulder-to-hand distance (coarse scan, then golden-section refinement).
  const dist = x => length(sub(pointOnNdcRay(x, o.yNdc, depth, tanHalf, aspect), atAnchor(o, x, tanHalf, aspect).shoulderCam));
  let best = x0, bestD = dist(x0);
  for (let x = -2; x <= 2 + 1e-9; x += 0.05) { const d = dist(x); if (d < bestD) { bestD = d; best = x; } }
  let a = best - 0.05, b = best + 0.05;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const c = b - g * (b - a), d = a + g * (b - a);
    if (dist(c) < dist(d)) b = d; else a = c;
  }
  return 0.5 * (a + b);
}

/* ------------------------------------------------------------------ pronation / supination (double-tap Space) */

/** Degrees (ns-rig forearm_pronation) for an ns-actions rotationState ('pronated' | 'supinated'). */
export function pronationTarget(rotationState) {
  if (!Object.prototype.hasOwnProperty.call(PRONATION_STATES, rotationState)) fail('arm_input', `rotationState must be one of ${Object.keys(PRONATION_STATES).join(', ')}`);
  return PRONATION_STATES[rotationState];
}

/** A settled pronation easing state at a rotation state (default 'pronated'). */
export function pronationStart(rotationState = 'pronated') {
  const deg = pronationTarget(rotationState);
  return Object.freeze({ deg, fromDeg: deg, toDeg: deg, elapsedS: 0, durationS: 0 });
}

/**
 * Ease the forearm toward targetDeg (degrees, e.g. pronationTarget(state.rotationState)): a smoothstep transition that
 * takes PRONATION_EASE_S for the full -80 <-> +80 flip (proportionally less for a shorter remaining turn). A new
 * target restarts the transition from the current angle, so a double-tap during a flip reverses it smoothly.
 * R5-pronation: options.easeS replaces PRONATION_EASE_S (PRONATION_EASE_S_REDUCED under prefers-reduced-motion). The
 * whole coupled motion (upper arm, shoulder blade, trunk) follows this one eased angle, so it eases with it.
 * Pure: returns a new frozen state { deg, fromDeg, toDeg, elapsedS, durationS, moving }.
 */
export function stepPronation(state, targetDeg, dtS, { easeS = PRONATION_EASE_S } = {}) {
  if (!state || typeof state !== 'object') fail('arm_input', 'state must come from pronationStart/stepPronation');
  finite(state.deg, 'state.deg');
  finite(targetDeg, 'targetDeg');
  const target = clamp(targetDeg, PRONATION_RANGE_DEG[0], PRONATION_RANGE_DEG[1]);
  const h = typeof dtS === 'number' && Number.isFinite(dtS) && dtS > 0 ? dtS : 0;
  let { fromDeg, toDeg, elapsedS, durationS } = state;
  if (toDeg !== target) {
    fromDeg = state.deg;
    toDeg = target;
    elapsedS = 0;
    const full = PRONATION_RANGE_DEG[1] - PRONATION_RANGE_DEG[0];
    durationS = (Number.isFinite(easeS) && easeS >= 0 ? easeS : PRONATION_EASE_S) * Math.abs(toDeg - fromDeg) / full;
  }
  elapsedS += h;
  const u = durationS > 0 ? Math.min(1, elapsedS / durationS) : 1;
  const deg = u >= 1 ? toDeg : fromDeg + (toDeg - fromDeg) * smoothstep(u);
  return Object.freeze({ deg, fromDeg, toDeg, elapsedS, durationS, moving: u < 1 });
}

/* ------------------------------------------------------------------ muscle colours (shared activity ramp) */

/** Default rest drive of a muscle (ns-actions muscleDrives baseline). */
export const MUSCLE_BASELINE_DRIVE = 0.08;
/** Lit base (albedo) of resting skeletal-muscle tissue, linear RGB (a red-brown; display choice). */
export const MUSCLE_BASE_LINEAR = Object.freeze(hexToLinear(0x9b4a3c));

/** Simulated, unitless 0..1 activation of a muscle from its display drive (drive above the rest baseline). */
export function muscleActivation(drive, baseline = MUSCLE_BASELINE_DRIVE) {
  if (!(typeof drive === 'number' && Number.isFinite(drive))) return 0;
  const b = clamp(baseline, 0, 0.99);
  return clamp((drive - b) / (1 - b), 0, 1);
}

/**
 * Per-mesh colours of the arm muscles from their simulated drives, through the SAME ns-colors ramp and shading rule as
 * the brain activity, so that a brain region and the muscles it drives read the same (user R2): `rgb` is the ramp
 * colour activityColor(activation); `albedo` / `emission` are ns-colors activityShade(MUSCLE_BASE_LINEAR, activation),
 * i.e. the lit muscle tissue with the ramp added as an emissive glow (the ns-colors recommended use; at rest the tissue
 * keeps its base colour instead of the ramp's near-black zero).
 * @param muscles [{ id, muscleKey | null }]
 * @param drives { muscleKey: drive } (ns-actions muscleDrives)
 * @returns Map(id -> { activation, rgb, albedo, emission }) (linear RGB 0..1)
 */
export function armMuscleColors(muscles, drives, { baseline = MUSCLE_BASELINE_DRIVE, color = activityColor, shade = activityShade, base = MUSCLE_BASE_LINEAR } = {}) {
  if (!Array.isArray(muscles)) fail('arm_input', 'muscles must be an array of { id, muscleKey }');
  if (typeof color !== 'function' || typeof shade !== 'function') fail('arm_input', 'color and shade must be functions');
  const d = drives || {};
  const out = new Map();
  for (const m of muscles) {
    const raw = m.muscleKey === null || m.muscleKey === undefined ? baseline : d[m.muscleKey];
    const activation = muscleActivation(raw, baseline);
    const sh = shade(base, activation);
    out.set(m.id, Object.freeze({ activation, rgb: color(activation), albedo: sh.albedo, emission: sh.emission }));
  }
  return out;
}

/* ------------------------------------------------------------------ re-exports for the integrator */

export { bodyToWorldMatrix, lookRotation, bpToWorldAxes };
