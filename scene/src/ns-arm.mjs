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
  FIST_POSE_DEG, DIGITS, PRONATION_RANGE_DEG, PRONATION_STATES
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
  minReachSpanM: 0.03
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

/** The arm should not come closer than this to the eye (camera origin); reported as clearance.nearEye. */
export const ARM_EYE_CLEARANCE_M = 0.08;

/** Pronation/supination easing time for the full +-80 deg flip (scaled by the fraction of the flip still to go). */
export const PRONATION_EASE_S = 0.4;

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
  'xSpeedNdcPerS', 'depthSpeedMPerS', 'minDepth', 'maxHandHeightNdc', 'minReachSpanM']);

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
  for (const k of NUMERIC_OPTIONS) finite(o[k], k);
  if (!(o.marginNdc >= 0 && o.marginNdc < 1)) fail('arm_input', 'marginNdc must be in [0, 1)');
  if (!(Math.abs(o.yNdc) < 1 - o.marginNdc)) fail('arm_input', 'yNdc must lie inside the screen margins');
  if (!(o.minDepth > 0)) fail('arm_input', 'minDepth must be positive');
  if (!(o.maxHandHeightNdc > 0)) fail('arm_input', 'maxHandHeightNdc must be positive (2 = the full view height, i.e. no cap)');
  if (!(o.minReachSpanM >= 0)) fail('arm_input', 'minReachSpanM must be >= 0');
  return o;
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
  b = { S0, E0, W0, a, U, limitMm, wristLimitM: limitMm * MM, ctxCache: new Map() };
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
  return rayIntervalM(ctx.dMinM, ctx.dMaxM, xNdc, o.yNdc, tanHalf, aspect, o.shoulderCam, o.minDepth);
}

/** Closed-form arm solution for a camera-space hand-centre target. `reachable` also honours the wrist reach limit. */
function solveCore(ctx, target, shoulderCam, pole) {
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
  return multiply(multiply(core.SM, rotationAboutPivot(ctx.base.a, core.phi, ctx.base.E0)), ctx.Rw);
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

function scoreCorners(m, corners, tanHalf, aspect, lim, nearMin) {
  const sx = 1 / (tanHalf * aspect), sy = 1 / tanHalf;
  let ext = 0, minDepth = Infinity;
  for (let k = 0; k < corners.length; k += 3) {
    const x = corners[k], y = corners[k + 1], z = corners[k + 2];
    const px = m[0] * x + m[4] * y + m[8] * z + m[12];
    const py = m[1] * x + m[5] * y + m[9] * z + m[13];
    const depth = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (depth < minDepth) minDepth = depth;
    if (depth > 1e-9) {
      const ax = Math.abs((px * sx) / depth), ay = Math.abs((py * sy) / depth);
      if (ax > ext) ext = ax;
      if (ay > ext) ext = ay;
    } else ext = Infinity;
  }
  const ok = minDepth >= nearMin + EPS_DEPTH && ext <= lim - EPS_NDC;
  return { ok, score: ext + 1000 * Math.max(0, nearMin - minDepth) };
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
 * params: { xNdc, depth, joints, aspect, fovYDeg, yNdc = HAND_Y_NDC, attachment | shoulderCam + pole }.
 * @returns {{shoulderMatrix, elbowFlexRad, matrices, handCentreCam, wristCam, elbowCam, shoulderCam, reachable,
 *   iterations, targetCam}} iterations is 1: the solve is closed form. Unreachable targets return reachable: false with
 *   a best effort (elbow angle clamped to 0..145 deg, hand on the shoulder-to-target line).
 */
export function solveArm(rig, params = {}) {
  const p = params || {};
  const o = mergeOptions({ ...(p.attachment ? { attachment: p.attachment } : {}), ...(p.shoulderCam ? { shoulderCam: p.shoulderCam } : {}),
    ...(p.pole ? { pole: p.pole } : {}), ...(p.yNdc !== undefined ? { yNdc: p.yNdc } : {}) });
  const { xNdc, depth, joints = {}, aspect, fovYDeg = ARM_DEFAULTS.fovYDeg } = p;
  finite(xNdc, 'xNdc');
  finite(depth, 'depth');
  if (!(depth > 0)) fail('arm_input', 'depth must be positive metres in front of the camera');
  const tanHalf = tanHalfFov(aspect, fovYDeg);
  const ctx = poseContext(rig, joints);
  const targetCam = pointOnNdcRay(xNdc, o.yNdc, depth, tanHalf, aspect);
  const core = solveCore(ctx, targetCam, o.shoulderCam, o.pole);
  const matrices = forwardKinematics(rig, { shoulderMatrix: core.SM, elbowFlexRad: core.phi, joints: ctx.J });
  return {
    shoulderMatrix: core.SM,
    elbowFlexRad: core.phi,
    matrices,
    handCentreCam: transformPoint(matrices.get('hand'), rig.handCentre),
    wristCam: transformPoint(matrices.get('forearm'), rig.pivots.wrist),
    elbowCam: transformPoint(matrices.get('upperarm'), rig.pivots.elbow),
    shoulderCam: o.shoulderCam.slice(),
    reachable: core.reachable,
    iterations: 1,
    targetCam
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
  const sizePoses = SIZE_REFERENCE_POSES.map(J => {
    const ctx = poseContext(rig, J);
    return { ctx, corners: handSilhouette(rig, ctx.J) };
  });
  const env = { wrists, anchorLevels, gameLevels, sizePoses, digitPointCount: digitPts.length / 3, dMinM: dMinM + 0.002, dMaxM: dMaxM - 0.002, ranges: new Map(), poses: wrists };
  byRig.set(boxes, env);
  return env;
}

function fitsAt(ctx, corners, x, d, tanHalf, aspect, o, lim, nearMin) {
  const core = solveCore(ctx, pointOnNdcRay(x, o.yNdc, d, tanHalf, aspect), o.shoulderCam, o.pole);
  if (!core.reachable) return false;
  return scoreCorners(handMatrixOf(ctx, core), corners, tanHalf, aspect, lim, nearMin).ok;
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
  const core = solveCore(sp.ctx, pointOnNdcRay(x, o.yNdc, dd, tanHalf, aspect), o.shoulderCam, o.pole);
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

/** Every anchor-envelope level (ANCHOR_WRIST_RANGE_DEG x every pronation level x the full digit grid) fits at anchor
 * x at its own deepest reachable depth (deeper only shrinks the projection), and the W/S window keeps at least
 * minReachSpanM. */
function anchorFeasible(env, x, tanHalf, aspect, o, lim, nearMin, levels = env.anchorLevels) {
  // Move-to-front: the level that failed last is tried first (most infeasible probes then exit after one level).
  const n = levels.length;
  const first = Number.isInteger(levels.failHint) ? levels.failHint : 0;
  for (let k = 0; k < n; k++) {
    const i = (first + k) % n;
    const { ctx, corners } = levels[i];
    const iv = rayInterval(ctx, x, o, tanHalf, aspect);
    if (iv.empty || !fitsAt(ctx, corners, x, iv.hi, tanHalf, aspect, o, lim, nearMin)) { levels.failHint = i; return false; }
  }
  if (o.minReachSpanM > 0) {
    const win = depthWindow(env, x, tanHalf, aspect, o, levels);
    if (win.empty || win.far - win.near < o.minReachSpanM) return false;
  }
  return true;
}

const q = (v, step) => Math.round(v / step);

/** Cache key of the viewport and margins (look independent). */
function viewKey(aspect, fov, o) {
  return [q(aspect, 1e-4), q(fov, 1e-3), o.marginNdc, o.near, o.nearMargin, o.minDepth, o.yNdc, o.maxHandHeightNdc, o.minReachSpanM].join(',');
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

/** Warm-start step (NDC) and bisection steps of the incremental range-edge search. */
const WARM_STEP_NDC = 0.04;
const WARM_BISECT_STEPS = 7;

/**
 * The A/D range for a viewport and look, independent of the current pose: [xMin, xMax] such that every envelope level
 * fits at the deepest reachable depth of that anchor and the W/S window keeps minReachSpanM. Tier 'full' uses the
 * anchor envelope (ANCHOR_WRIST_RANGE_DEG x pronation x the full digit grid); when no anchor satisfies it, tier 'game'
 * uses GAME_POSES x pronation. Asymmetric because the shoulder is on the left. Cached in a bounded LRU keyed by the
 * viewport and the quantised attachment. Returns {xMin, xMax, tier} or null when no anchor fits either tier.
 */
export function anchorRange(rig, boxes, { aspect, fovYDeg } = {}, options = {}) {
  const o = mergeOptions(options);
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
  const lim = 1 - o.marginNdc - RANGE_SLACK_NDC, nearMin = o.near + o.nearMargin;
  const vk = viewKey(aspect, fov, o);
  if (!env.lastByView) env.lastByView = new Map();
  const last = env.lastByView.get(vk) || null;
  const solve = (levels, tier) => {
    const ok = x => anchorFeasible(env, x, tanHalf, aspect, o, lim, nearMin, levels);
    const warm = last && last.tier === tier ? last : null;
    let seed = null;
    const seeds = warm ? [0.5 * (warm.xMin + warm.xMax), warm.xMin, warm.xMax] : [];
    for (const x of [...seeds, -0.2, -0.1, -0.3, 0, -0.4, 0.1, -0.5, 0.2, -0.6, 0.3, -0.7, 0.4, 0.5]) if (Math.abs(x) <= lim && ok(x)) { seed = x; break; }
    if (seed === null) return null;
    const bisect = (inner, outer, steps) => {
      for (let i = 0; i < steps; i++) { const mid = 0.5 * (inner + outer); if (ok(mid)) inner = mid; else outer = mid; }
      return inner;
    };
    const side = sign => {
      const edge = sign * lim;
      if (warm) {
        // Incremental search from the previous edge of this viewport: probe outward or inward in WARM_STEP_NDC steps.
        const prev = clamp(sign < 0 ? warm.xMin : warm.xMax, -lim, lim);
        if (sign * (prev - seed) >= 0) {
          if (ok(prev)) {
            let inner = prev;
            for (let k = 0; k < 6; k++) {
              const nxt = sign * Math.min(lim, sign * inner + WARM_STEP_NDC);
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
    return Object.freeze({ xMin: side(-1), xMax: side(1), tier });
  };
  const result = solve(env.anchorLevels, 'full') || solve(env.gameLevels, 'game');
  if (result) env.lastByView.set(vk, result);
  env.ranges.set(key, result);
  if (env.ranges.size > RANGE_CACHE_MAX) env.ranges.delete(env.ranges.keys().next().value);
  return result;
}

/**
 * Diagnostics (QA/tests): for anchor x, every anchor-envelope level with its own far depth, whether it fits there and
 * its NDC extents. { levels: [{ wristDeg, pronationDeg, farDepth, fits, xLo, xHi, yLo, yHi }], window }.
 */
export function envelopeDiagnostics(rig, boxes, { xNdc, aspect, fovYDeg } = {}, options = {}) {
  const o = mergeOptions(options);
  finite(xNdc, 'xNdc');
  const tanHalf = tanHalfFov(aspect, fovYDeg === undefined ? o.fovYDeg : fovYDeg);
  const env = handEnvelope(rig, boxes);
  const lim = 1 - o.marginNdc - RANGE_SLACK_NDC, nearMin = o.near + o.nearMargin;
  const levels = env.anchorLevels.map(({ w, pro, ctx, corners }) => {
    const iv = rayInterval(ctx, xNdc, o, tanHalf, aspect);
    if (iv.empty) return { wristDeg: w, pronationDeg: pro, farDepth: null, fits: false };
    const core = solveCore(ctx, pointOnNdcRay(xNdc, o.yNdc, iv.hi, tanHalf, aspect), o.shoulderCam, o.pole);
    const M = handMatrixOf(ctx, core);
    const e = ndcExtents(M, corners, tanHalf, aspect);
    return { wristDeg: w, pronationDeg: pro, farDepth: iv.hi, reachable: core.reachable, fits: core.reachable && scoreCorners(M, corners, tanHalf, aspect, lim, nearMin).ok, ...e };
  });
  return { levels, window: depthWindow(env, xNdc, tanHalf, aspect, o), limit: lim };
}

/**
 * The W/S depth window for an anchor (exported for the HUD/QA and tests): { near, far, empty } in metres, where near is
 * the hand-size limited end and far the reach limit (see ARM_DEFAULTS.maxHandHeightNdc).
 */
export function reachWindow(rig, boxes, { xNdc, aspect, fovYDeg } = {}, options = {}) {
  const o = mergeOptions(options);
  finite(xNdc, 'xNdc');
  const tanHalf = tanHalfFov(aspect, fovYDeg === undefined ? o.fovYDeg : fovYDeg);
  const w = depthWindow(handEnvelope(rig, boxes), xNdc, tanHalf, aspect, o);
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
  const lim = 1 - o.marginNdc, nearMin = o.near + o.nearMargin;
  const range = anchorRange(rig, boxes, { aspect, fovYDeg }, opts);
  const poseFor = J => { const ctx = poseContext(rig, J); return { ctx, corners: handCorners(rig, boxes, ctx.J) }; };
  let P = poseFor(J0);
  const fits = (Q, x, d) => fitsAt(Q.ctx, Q.corners, x, d, tanHalf, aspect, o, lim, nearMin);
  const smallestFitting = (Q, x, lo, hi) => {
    if (fits(Q, x, lo)) return lo;
    if (!fits(Q, x, hi)) return null;
    for (let i = 0; i < BISECT_STEPS; i++) { const mid = 0.5 * (lo + hi); if (fits(Q, x, mid)) hi = mid; else lo = mid; }
    return hi;
  };
  /** Fit pose Q at x: window-clamped request depth, pushed deeper as needed; d null when it fits nowhere. */
  const tierLevels = range && range.tier === 'game' ? env.gameLevels : env.anchorLevels;
  const fitAtX = (Q, x) => {
    const win = depthWindow(env, x, tanHalf, aspect, o, tierLevels);
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
      const xr = clamp(xNdc, -lim, lim);
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
    x = clamp(xNdc, -lim, lim);
    let r = fitWithWrist(x);
    if (r.d === null) {
      const found = searchX(x, [0, x <= 0 ? lim : -lim]);
      if (found) { x = found.x; r = found.r; }
    }
    win = r.win;
    const iv = rayInterval(P.ctx, x, o, tanHalf, aspect);
    d = r.d ?? (iv.empty ? Math.max(o.minDepth, depth) : iv.hi);
    fallback = r.d !== null ? 'exact_fit_only' : 'unsatisfiable';
  }

  const J = P.ctx.J;
  const solution = solveArm(rig, { xNdc: x, depth: d, joints: J, aspect, fovYDeg, shoulderCam: o.shoulderCam, pole: o.pole, yNdc: o.yNdc });
  const cornersNdc = [];
  let within = solution.reachable;
  for (const { seg, carrier, box } of checkedBoxes(boxes)) {
    const M = solution.matrices.get(carrier);
    for (const c of box) {
      const n = projectToNdc(transformPoint(M, c), tanHalf, aspect);
      cornersNdc.push({ segment: seg, x: n.x, y: n.y, depth: n.depth });
      if (!(n.depth >= nearMin && Math.abs(n.x) <= lim && Math.abs(n.y) <= lim)) within = false;
    }
  }
  const handNdc = handScreenBounds(rig, solution, J, { aspect, fovYDeg });
  const iv = rayInterval(P.ctx, x, o, tanHalf, aspect);
  const xReq = clamp(xNdc, -1, 1);
  // A hand held outside the anchor range widens the A/D limits to include it, so the next A/D press moves on from the
  // held x instead of jumping to the range edge (stepReach's wind-up guard restarts from the limit).
  const xLimits = range
    ? (anchor === 'held_outside_range' ? { xMin: Math.min(range.xMin, x), xMax: Math.max(range.xMax, x) } : range)
    : { xMin: xReq < x ? x : -lim, xMax: xReq > x ? x : lim };
  const depthLimits = { minDepth: Math.min(win.empty ? iv.lo : Math.max(win.near, iv.lo), d), maxDepth: Math.max(iv.hi, d) };
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
  const S = o.shoulderCam;
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
 * Apply A/D (axes.x: -1 left, +1 right) to xNdc and W/S (axes.z: +1 = W = forward = larger depth) to depth.
 * Returns the un-fitted request {xNdc, depth}; fitHand applies the rig, viewport and look limits. Feed fitHand's
 * reachState back as the next state, with options.xRange = fit.xLimits and options.depthRange = fit.depthLimits (the
 * wind-up guard: holding a key beyond a limit does not move the intent further, and the opposite key responds at once).
 * Non-finite or negative dt counts as 0.
 */
export function stepReach(state, axes, dt, options = {}) {
  const o = mergeOptions(options);
  if (!state || typeof state !== 'object') fail('arm_input', 'state must be {xNdc, depth}');
  finite(state.xNdc, 'state.xNdc');
  finite(state.depth, 'state.depth');
  const ax = axisValue(axes && axes.x), az = axisValue(axes && axes.z);
  const h = typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? dt : 0;
  const xr = options && options.xRange, dr = options && options.depthRange;
  const x = guardedStep(state.xNdc, ax * o.xSpeedNdcPerS * h, xr ? xr.xMin : NaN, xr ? xr.xMax : NaN);
  const d = guardedStep(state.depth, az * o.depthSpeedMPerS * h, dr ? dr.minDepth : NaN, dr ? dr.maxDepth : NaN);
  return { xNdc: clamp(x, -1, 1), depth: clamp(d, o.minDepth, REACH_STATE_MAX_DEPTH) };
}

/** The starting reach state from the defaults. */
export function reachStart(options = {}) {
  const o = mergeOptions(options);
  return { xNdc: o.xNdcStart, depth: o.depthStart };
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
 * Pure: returns a new frozen state { deg, fromDeg, toDeg, elapsedS, durationS, moving }.
 */
export function stepPronation(state, targetDeg, dtS) {
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
    durationS = PRONATION_EASE_S * Math.abs(toDeg - fromDeg) / full;
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
