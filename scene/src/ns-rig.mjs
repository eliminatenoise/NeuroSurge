/** NeuroSurge scene: display rig derived from bone geometry, forward kinematics and skinning.
 *
 * Pure, dependency-free ES module (browser and Node). Source frame: BodyParts3D millimetres,
 * +x subject LEFT, +y POSTERIOR, +z SUPERIOR (inferred right-handed LPS frame). The arm hangs
 * along -z in the anatomical rest pose, so "distal" means low z.
 *
 * U3a (round 2): the ulna is its own rigid segment and the radius ('forearm') turns about the forearm rotation axis
 * (radial head -> ulnar head) for the forearm_pronation DOF; three twist frames carry forearm muscle tissue between them.
 * R5-pronation (round 5, R27): this rig's forearm_pronation stays the radius' OWN turn about the ulna. The game's palm
 * turn is shared with the shoulder by ns-arm (ROTATION_COUPLING): ns-arm turns the whole arm outward at the shoulder
 * through the shoulderMatrix it passes to forwardKinematics and gives this rig the rest of the turn as
 * forearm_pronation, so nothing in the rig itself changed.
 *
 * Everything here is a simulated, unitless display rig. Pivots are cap-centroid approximations and
 * axes are geometric constructions from the supplied anatomy; they are not measured or validated
 * biomechanics, and no muscle force, EMG or physiological shortening is modelled.
 * Muscles are deformed only by geometry-only two-influence linear blend skinning (skinWeights): no muscle volume,
 * contraction, force, tendon sheath or sliding model. The Space fist (FIST_POSE_DEG) is a display pose whose joint
 * values are literature-range choices tuned on static bone geometry, not recorded hand motion.
 */
import {
  add, sub, scale, dot, cross, length, normalize, reject, lerp, frame, identity, multiply, clamp,
  rotationAboutPivot, rotationAxisAngle, transformDirection, signedAngleAbout, fitSphere, fibonacciDirections, pruneExtremes,
  smoothstep, pointSegmentDistance, DEG
} from './ns-math.mjs';

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };

export const DIGITS = Object.freeze(['index', 'middle', 'ring', 'little']);

/**
 * The 22 rig segments, in the fixed index order used by skin weights. The first 18 are the pre-U3a segments in their
 * original order ('forearm' now carries the RADIUS: it turns with forearm_pronation and is the hand's parent). U3a
 * APPENDED 'ulna' (the ulna bone: elbow flexion only, never pronation) and three forearm twist frames that carry only
 * muscle tissue (1/4, 1/2, 3/4 of the pronation turn), so every pre-U3a segment index is unchanged.
 */
export const SEGMENTS = Object.freeze([
  'upperarm', 'forearm', 'hand',
  'thumb_mc', 'thumb_pp', 'thumb_dp',
  'index_pp', 'index_mp', 'index_dp',
  'middle_pp', 'middle_mp', 'middle_dp',
  'ring_pp', 'ring_mp', 'ring_dp',
  'little_pp', 'little_mp', 'little_dp',
  'ulna', 'forearm_tw1', 'forearm_tw2', 'forearm_tw3'
]);

/** Segments whose boxes must stay on screen: the hand and every digit segment (16; explicit, not a slice to the end). */
export const HAND_SEGMENTS = Object.freeze(SEGMENTS.slice(2, 18));
/** Forearm twist chain from the ulna (no pronation turn) to the radius ('forearm', the full turn), with each frame's
 * fraction of the pronation turn. Only 'ulna' and 'forearm' carry bones; the three middle frames carry muscle tissue. */
export const FOREARM_TWIST_CHAIN = Object.freeze(['ulna', 'forearm_tw1', 'forearm_tw2', 'forearm_tw3', 'forearm']);
export const FOREARM_TWIST_LEVELS = Object.freeze([0, 0.25, 0.5, 0.75, 1]);
/** Segments that may carry bones (every segment except the three tissue-only twist frames). */
export const BONE_SEGMENTS = Object.freeze(SEGMENTS.filter(s => !/^forearm_tw[123]$/.test(s)));
/** Default skinning candidates: the pre-U3a 18 segments ('ulna' and the twist frames are assigned afterwards by the
 * forearm twist pass, see skinWeights). */
export const SKIN_CANDIDATES = Object.freeze(SEGMENTS.slice(0, 18));

/** Pose joint names (degrees). Positive = anatomical flexion; abduction positive away from digit 3;
 * opposition positive toward the palm. middle_mcp_abd is the reference digit and is normally 0. */
export const POSE_JOINTS = Object.freeze([
  'wrist_flex', 'thumb_cmc_opp', 'thumb_mcp_flex', 'thumb_ip_flex',
  ...DIGITS.flatMap(d => [`${d}_mcp_flex`, `${d}_pip_flex`, `${d}_dip_flex`, `${d}_mcp_abd`]),
  'forearm_pronation'
]);

/**
 * Forearm pronation/supination (U3a). forearm_pronation is in degrees from NEUTRAL (mid-position, thumb up with the
 * elbow flexed and the palm facing the body), positive = pronation (palm turning down/away), negative = supination. 0
 * (also the value of an absent joint) is neutral. The rest mesh (anatomical position) is close to full supination;
 * rig.restAngles.forearm_pronation records its measured angle. The radius and the hand turn about the forearm rotation
 * axis from the radial-head centre to the ulnar-head centre (the commonly described axis; cited from memory, Root
 * reference qualification pending); the ulna and humerus do not. PRONATION_RANGE_DEG is the display range (+-80 deg
 * from neutral, inside commonly cited active ranges of about 75-85 deg pronation and 80-90 deg supination).
 */
export const PRONATION_RANGE_DEG = Object.freeze([-80, 80]);
/** The two double-tap targets (ns-actions rotationState -> degrees). */
export const PRONATION_STATES = Object.freeze({ pronated: 80, supinated: -80 });
/** Fraction of the radius' z extent (proximal end) pooled for the radial-head centre of the pronation axis. */
export const RADIAL_HEAD_FRACTION = 0.08;
/** Fraction of the ulna's extent (distal end, along the forearm axis) sphere-fitted for the ulnar-head centre. */
export const ULNAR_HEAD_FRACTION = 0.1;
/**
 * Forearm twist skinning (U3a). A muscle vertex that the distance rule binds to the radius ('forearm') gets a twist
 * fraction f in [0, 1] of the pronation turn, carried by the two neighbouring FOREARM_TWIST_CHAIN frames:
 *   t = position along the elbow -> forearm-end axis (0..1), u = clamp((t - t0) / (t1 - t0)), ramp = smoothstep(u),
 *   side = du^2 / (du^2 + dr^2) (1 on the radius, 0 on the ulna; distances to the radius and ulna axis lines),
 *   lambda = lambda0 sin^2(pi u), f = (1 - lambda) ramp + lambda side.
 * So tissue near the elbow (t <= t0) does not turn, tissue near the wrist (t >= t1) turns fully with the radius and the
 * hand, and mid-forearm tissue turns somewhat more on the radial than on the ulnar side. Linear blending between frames
 * a quarter turn apart (about 45 deg on this anatomy) avoids the 'candy-wrapper' collapse of blending across the whole
 * ~178 deg turn. t0 = 0.40 lies beyond every muscle vertex the distance rule blends with the upper arm on the
 * BodyParts3D arm (they reach t = 0.40), so those vertices sit exactly on the ulna frame (no quantisation crack), and
 * t1 = 0.82 keeps the step to the full-turn hand-blended tissue (from t = 0.75) small. Chosen with an edge-stretch scan
 * (U3a notes): at full pronation, elbow 90 deg, 2 edges stretch to more than 2 L + 3 mm (0 at neutral), versus 1028 for
 * the first trial t0 0.12 / t1 0.88. Display constants, not measured muscle kinematics; proximal radius-attached tissue
 * (supinator, biceps tendon, pronator teres insertion) therefore does not follow the radius fully.
 *
 * R558 (left forearm plates near the elbow, palm down): REPLACED by a CONTINUOUS per-vertex twist (twist 'continuous',
 * the default of skinWeights; the quarter-turn chain above stays available as twist 'chain'). Palm down is about 178 deg
 * of turn from the supinated rest mesh; packed into t 0.40..0.82 (smoothstep slope up to 3.6 per unit t, so up to about
 * 640 deg per forearm length) with two influences per vertex, the coarse BodyParts3D forearm triangles (edges up to 0.2
 * to 0.4 of the forearm length) were turned up to about 120 deg end to end and cut across the arm as flat plates, and
 * the elbow-blended tissue could not twist at all (one fixed frame per influence). Now each forearm vertex carries its
 * own twist fraction f (skin weights `tf`): its forearm influence is the ulna frame turned by f x the pronation turn
 * about the same radial-head -> ulnar-head axis, computed exactly per pose (twistTable), so f can be any number and the
 * elbow blend (upper arm + forearm) twists continuously too. f = smoothstep((t - t0) / (t1 - t0)) along the forearm,
 * t0 0.10 .. t1 0.82: the same 178 deg over 72 % of the forearm instead of 42 % (the rate is 0.58 x the old one), and
 * still exactly the full turn (the radius frame itself) from t 0.82, before the hand's fit domain begins (forearm-only
 * hand-domain vertices start at t 0.885 on this arm, so ns-app fitBoxes keeps its full-turn radius frame there). No
 * radial-side term (lambda0 0): it turned neighbouring vertices of one muscle up to about 50 deg apart across the
 * forearm. And refineForTwist splits the long triangles in the twist zone so no edge spans more than
 * TWIST_REFINE_MAX_STEP of f. Offline, at the in-game palm-down start pose (elbow 41, forearm 80): edges stretched to
 * more than 1.6 L + 2 mm 172 -> 0, triangles folded over by more than 100 deg 342 -> 122 (folded rest area 2927 ->
 * 342 mm2); at elbow 86 palm down 172 / 409 -> 0 / 198. Display constants, not measured muscle kinematics.
 */
export const TWIST_SKIN = Object.freeze({ t0: 0.10, t1: 0.82, lambda0: 0 });
/** The quarter-turn chain's constants (U3a; twist 'chain', used where fixed segment frames are needed, e.g. the
 * whole-arm display's conservative per-segment bounds). */
export const TWIST_SKIN_CHAIN = Object.freeze({ t0: 0.40, t1: 0.82, lambda0: 0.3 });
/** R558: refineForTwist splits an edge whose two ends differ by more than this in twist fraction f (about 14 deg of the
 * palm-down turn). 0.08 adds about 7400 vertices (10 %) to the 75 000 of the arm's muscles. */
export const TWIST_REFINE_MAX_STEP = 0.08;
/** R558: steps of the per-pose twist table (twistTable): a twisted influence blends two table entries 1/64 of the turn
 * apart (at most 2.8 deg; linear blending shrinks by at most 0.03 %). */
export const TWIST_TABLE_STEPS = 64;
/**
 * R558 (user Messages 36 and 48: the left shoulder muscle jutted out, and at a far-left look the joint looked torn
 * open). Every arm muscle vertex near the shoulder followed the humerus rigidly, so when the upper arm swung or turned
 * about its own axis against the chest (up to about 110 deg at a far-left look), the deltoid's origin and the upper ends
 * of the biceps, coracobrachialis and triceps left the shoulder girdle with it (the deltoid's origin by up to 9.5 cm).
 * With `shoulder: true` (continuous twist weights only) skinWeights gives each vertex with an upper-arm influence a
 * place `sf` along the humeral axis: s = the distance (mm) of the vertex below the joint centre along the rest axis
 * shoulder -> elbow, sf = (s - s0Mm) / (twistMm - s0Mm) clamped to 0..1. At sf 0 the vertex follows the chest frame of
 * the pose (matrices 'chest': the trunk's orientation, placed so the joint centre is where the arm has it), at sf 1 the
 * humerus. Between, the upper arm's rotation against the chest is split in two (shoulderFrames): the SWING of the axis,
 * about the joint centre, so each vertex keeps its distance from the centre, taken up from s0Mm to swingMm; and the
 * TURN about the axis, so each vertex keeps its distance from the shaft, taken up from s0Mm to twistMm. Both are eased
 * at their two ends (smoothstep). The two stretches are the same here: from 35 mm above the joint centre, where the
 * deltoid's origin lies on the girdle, to 130 mm below it, about the deltoid's insertion, so the whole deltoid spreads
 * the rotation along its length. Measured over 61 looks: the origin of the three parts of the deltoid moves at most
 * 0.6 cm against the chest, and no edge of them is stretched beyond 2.4 times its rest length or shortened below 0.3 of
 * it. Above fadeDeg[0] of swing the split fades back to the humerus frame, and from fadeDeg[1] the tissue is rigid with
 * the humerus again (the swing axis is undefined with the arm opposite its rest direction). The rule is by place only,
 * the same for every muscle, so neighbouring muscles stay together; bones are not changed. A pose without a 'chest'
 * matrix skins exactly as before. Display constants: no measured muscle path, origin, insertion or scapulohumeral
 * rhythm.
 */
export const SHOULDER_SKIN = Object.freeze({ s0Mm: -35, swingMm: 130, twistMm: 130, fadeDeg: Object.freeze([150, 170]) });

export const CAP_FRACTION = 0.15;
export const SHOULDER_CAP_MM = 35;
export const ELBOW_CAP_MM = 20;

/* A3 joint-head pivots (pivotMode 'head', the default). */
/** Fraction of a metacarpal's / phalanx's extent (along its preliminary joint-to-joint direction) whose vertices are
 * fitted with a least-squares sphere to find the centre of its DISTAL head (the convex side of MCP/PIP/DIP/thumb
 * MCP/IP; the concave base of the next bone glides around this centre). */
export const HEAD_FIT_FRACTION = 0.2;
/** Fraction of the capitate's extent, from its PROXIMAL end along the third-metacarpal axis, fitted for the capitate
 * head: the wrist flexion/extension pivot is placed at that head centre (the commonly cited location of the wrist
 * rotation centre; cited from memory, Root reference qualification pending). */
export const CAPITATE_HEAD_FRACTION = 0.3;
/** A head fit is used only when its rms residual <= this times its radius, its radius lies in HEAD_RADIUS_RANGE_MM and
 * its centre lies inside the head (between the articular end and 2.5 radii in from it); otherwise the legacy
 * cap-centroid pivot is kept and a warning is recorded. */
export const HEAD_FIT_MAX_RMS_RATIO = 0.3;
export const HEAD_RADIUS_RANGE_MM = Object.freeze([1.5, 15]);
/** Pivot construction modes: 'head' (A3 default: sphere-fitted joint heads, capitate-head wrist) or 'cap' (the
 * pre-A3 cap-centroid midpoints, kept for diagnostics and comparison). */
export const PIVOT_MODES = Object.freeze(['head', 'cap']);
/** Directions used to keep each segment's extreme bone vertices in rig.silhouette (support-function sample). */
export const SILHOUETTE_DIRECTIONS = 96;
/** LEGACY (pre fist-r2) skinning constants: 8 mm Gaussian over the two nearest capsules plus a 4 mm rigid-gap jump.
 * Retained as exported values for compatibility only; skinWeights no longer uses them (the hard 4 mm jump made
 * neighbouring vertices take weights 0.6 vs 1.0 and tore muscle meshes into spanning sheets in the fist). */
export const SKIN_SIGMA_MM = 8;
export const SKIN_RIGID_GAP_MM = 4;

/* fist-r2 skinning parameters (geometry-only linear blend skinning; see skinWeights). */
/** Inverse-distance exponent: raw affinity of a segment = (softened capsule distance)^-SKIN_POWER. */
export const SKIN_POWER = 4;
/** Softening (mm) added in quadrature to every capsule distance so a vertex on an axis line stays finite. */
export const SKIN_SOFTEN_MM = 1;
/** A minor influence below this weight ramps continuously to exactly 0 (vertex becomes rigid). */
export const SKIN_MINOR_CUTOFF = 0.02;
/** Meeting-segment boost: for two NON-adjacent segments A, B the segment between them (MEET: their common parent, or
 * the middle of their chain) takes at least SKIN_MEET_BOOST * min(a_A, a_B), so on the equidistant ridge it dominates
 * and both sides converge on it continuously ... */
export const SKIN_MEET_BOOST = 3;
/** ... but never more than SKIN_MEET_CAP times its own affinity, so a far meeting segment (e.g. the hand for two
 * fingertips) is never pulled in (with SKIN_POWER 4 the full boost needs the meet within about (20 / 3)^(1/4) = 1.6x the pair's distance). */
export const SKIN_MEET_CAP = 20;

/**
 * Thumb carpometacarpal "opposition" as ONE display rotation whose axis mixes three geometric constructions about the
 * thumb-metacarpal pivot: flexion across the palm (metacarpal toward ulnar), palmar abduction (metacarpal toward
 * palmar) and conjunct axial rotation that turns the thumb pad toward the palm/fingers. The qualitative composition
 * (palmar abduction + flexion + conjunct pronation of the first metacarpal) follows standard descriptions of
 * opposition, e.g. Cooney et al. 1981 (J Bone Joint Surg Am 63:1371) and Hollister et al. 1992 (J Orthop Res 10:454);
 * the MIX WEIGHTS are display choices tuned on the static BodyParts3D bone geometry so the thumb folds over the index /
 * middle middle phalanges in the fist. LITERATURE CONTEXT, NOT ACQUIRED OR RE-VERIFIED HERE; not measured kinematics,
 * not the real non-orthogonal two-axis trapeziometacarpal joint. Root reference qualification pending.
 */
export const THUMB_OPPOSITION_MIX = Object.freeze({ flexion: 0.3, palmarAbduction: 1, axialRotation: 0.9 });
/** Thumb MCP/IP flexion direction tf = normalize(-radial*ulnar + palmar*palmar) (rest frame; display approximation). */
export const THUMB_PAD_WEIGHTS = Object.freeze({ ulnar: 0.8, palmar: 0.6 });

export const THUMB_FLEX_APPROXIMATION =
  `APPROXIMATION: thumb MCP/IP flexion direction tf = normalize(-radial*${THUMB_PAD_WEIGHTS.ulnar} + palmar*${THUMB_PAD_WEIGHTS.palmar}); ` +
  `thumb CMC opposition is one rotation about normalize(${THUMB_OPPOSITION_MIX.flexion}*flexion + ` +
  `${THUMB_OPPOSITION_MIX.palmarAbduction}*palmarAbduction + ${THUMB_OPPOSITION_MIX.axialRotation}*axialRotation) constructed from the ` +
  'first-metacarpal direction, the radial and palm-normal directions (THUMB_OPPOSITION_MIX). Display constructions tuned on ' +
  'static bone geometry, not measured thumb kinematics';
const REST_COMPENSATION_NOTE =
  'REST COMPENSATION: flexion joints rotate by (pose angle - geometric rest angle) so 0 means a straight joint; ' +
  'rest angles are computed geometrically from cap-centroid segment directions of the mesh (approximation, not a measured joint angle). Abduction and opposition use the mesh rest as 0';
const LITERAL_NOTE = 'NO REST COMPENSATION: pose angles are applied relative to the mesh rest pose (0 = mesh rest)';
const PIVOT_NOTE =
  'PIVOTS: joint centres are cap-centroid midpoints and directions joint-to-joint; geometric approximation for a ' +
  'simulated display, not validated joint centres or axes';
const HEAD_PIVOT_NOTE =
  'PIVOTS: wrist flexion pivot = least-squares sphere centre of the capitate head (proximal 30% of the capitate); ' +
  'MCP/PIP/DIP and thumb MCP/IP pivots = sphere centres of the proximal bone\'s distal head (distal 20%); shoulder, ' +
  'elbow and thumb CMC = cap centroids; the forearm direction runs from the elbow to the radius/ulna distal caps. ' +
  'Geometric approximations for a simulated display, not validated joint centres or axes';

/** Pivot used by each pose joint. */
const JOINT_PIVOT = Object.freeze(Object.fromEntries([
  ['forearm_pronation', 'radialHead'],
  ['wrist_flex', 'wrist'], ['thumb_cmc_opp', 'thumb_cmc'], ['thumb_mcp_flex', 'thumb_mcp'], ['thumb_ip_flex', 'thumb_ip'],
  ...DIGITS.flatMap(d => [
    [`${d}_mcp_flex`, `${d}_mcp`], [`${d}_mcp_abd`, `${d}_mcp`], [`${d}_pip_flex`, `${d}_pip`], [`${d}_dip_flex`, `${d}_dip`]
  ])
]));

/** The axis whose frame orients each segment's box (and the joint that moves the segment). */
const SEGMENT_AXIS = Object.freeze(Object.fromEntries([
  ['upperarm', 'elbow'], ['forearm', 'elbow'], ['hand', 'wrist_flex'],
  ['ulna', 'elbow'], ['forearm_tw1', 'elbow'], ['forearm_tw2', 'elbow'], ['forearm_tw3', 'elbow'],
  ['thumb_mc', 'thumb_cmc_opp'], ['thumb_pp', 'thumb_mcp_flex'], ['thumb_dp', 'thumb_ip_flex'],
  ...DIGITS.flatMap(d => [[`${d}_pp`, `${d}_mcp_flex`], [`${d}_mp`, `${d}_pip_flex`], [`${d}_dp`, `${d}_dip_flex`]])
]));

/* ------------------------------------------------------------------ input helpers */

function asList(value, what) {
  if (value && typeof value === 'object' && typeof value.length === 'number' && !Array.isArray(value)) return [value];
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'number') return [value];
    return value;
  }
  return fail('rig_input', `${what} must be a positions array or an array of positions arrays`);
}

function checkList(list, what) {
  if (!list.length) fail('rig_input', `${what}: no bone positions`);
  for (const arr of list) {
    if (!arr || typeof arr.length !== 'number' || arr.length < 3 || arr.length % 3 !== 0) {
      fail('rig_input', `${what}: positions length must be a positive multiple of 3`);
    }
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) fail('rig_input', `${what}: non-finite coordinate`);
  }
  return list;
}

function vec3(v, what) {
  if (!v || v.length !== 3 || !Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) {
    fail('rig_input', `${what} must be a finite [x, y, z]`);
  }
  return [v[0], v[1], v[2]];
}

function unit(v, what) {
  if (!(length(v) > 1e-12)) fail('rig_direction', `${what} has zero length`);
  return normalize(v);
}

/** normalize(v with its component along unit n removed); refuses a (near) parallel v. */
function unitPerp(v, n, what) {
  const r = reject(v, n);
  if (!(length(r) > 1e-9 * Math.max(1, length(v)))) fail('rig_direction', `${what} is parallel to its reference direction`);
  return normalize(r);
}

/** Axis such that a small positive right-hand rotation of `dir` increases dot(dir, toward). */
const axisToward = (dir, toward, what) => unit(cross(dir, toward), what);

function zRangeOf(arr) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < arr.length; i += 3) {
    const z = arr[i];
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  return [lo, hi];
}

function bandAccumulate(acc, arr, zLo, zHi) {
  for (let i = 0; i < arr.length; i += 3) {
    const z = arr[i + 2];
    if (z >= zLo && z <= zHi) { acc[0] += arr[i]; acc[1] += arr[i + 1]; acc[2] += z; acc[3]++; }
  }
}

function finish(acc, what) {
  if (!acc[3]) fail('rig_input', `${what}: empty vertex set`);
  return [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]];
}

/** Union centroid of each bone's own cap: vertices within CAP_FRACTION of that bone's z extent
 * at the distal (low z) or proximal (high z) end. */
function capCentroid(list, end, what) {
  const acc = [0, 0, 0, 0];
  for (const arr of list) {
    const [lo, hi] = zRangeOf(arr);
    const band = CAP_FRACTION * (hi - lo);
    if (end === 'distal') bandAccumulate(acc, arr, -Infinity, lo + band);
    else bandAccumulate(acc, arr, hi - band, Infinity);
  }
  return finish(acc, what);
}

/** capCentroid with an explicit fraction of each bone's z extent. */
function capCentroidFrac(list, end, frac, what) {
  const acc = [0, 0, 0, 0];
  for (const arr of list) {
    const [lo, hi] = zRangeOf(arr);
    const band = frac * (hi - lo);
    if (end === 'distal') bandAccumulate(acc, arr, -Infinity, lo + band);
    else bandAccumulate(acc, arr, hi - band, Infinity);
  }
  return finish(acc, what);
}

function centroidAll(list, what) {
  const acc = [0, 0, 0, 0];
  for (const arr of list) bandAccumulate(acc, arr, -Infinity, Infinity);
  return finish(acc, what);
}

/** Vertices of `list` within `frac` of its extent along unit `dir` at the given end ('distal' = high projection). */
function endBand(list, dir, end, frac) {
  let lo = Infinity, hi = -Infinity;
  for (const arr of list) {
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i] * dir[0] + arr[i + 1] * dir[1] + arr[i + 2] * dir[2];
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  }
  const band = frac * (hi - lo);
  const pts = [];
  for (const arr of list) {
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i] * dir[0] + arr[i + 1] * dir[1] + arr[i + 2] * dir[2];
      if (end === 'distal' ? t >= hi - band : t <= lo + band) pts.push(arr[i], arr[i + 1], arr[i + 2]);
    }
  }
  return { pts, lo, hi };
}

/**
 * Least-squares sphere fit of a bone end (its articular head). `dir` points distally along the bone; `end` is the end
 * that carries the head. Returns { ok, centre, radius, rms, count, reason } where ok means the fit passed the
 * HEAD_FIT_* plausibility checks (radius range, rms ratio, centre inside the head near the bone axis).
 */
function headFit(list, dir, end, frac) {
  const { pts, lo, hi } = endBand(list, dir, end, frac);
  const fit = fitSphere(pts);
  if (!fit) return { ok: false, reason: 'degenerate vertex band', count: pts.length / 3 };
  const along = dot(fit.centre, dir);
  const inward = end === 'distal' ? hi - along : along - lo;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < pts.length; i += 3) { cx += pts[i]; cy += pts[i + 1]; cz += pts[i + 2]; }
  const n = pts.length / 3;
  const off = sub(fit.centre, [cx / n, cy / n, cz / n]);
  const perp = length(reject(off, dir));
  const [rLo, rHi] = HEAD_RADIUS_RANGE_MM;
  let reason = null;
  if (!(fit.radius >= rLo && fit.radius <= rHi)) reason = `radius ${fit.radius.toFixed(1)} mm outside ${rLo}-${rHi}`;
  else if (!(fit.rms <= HEAD_FIT_MAX_RMS_RATIO * fit.radius)) reason = `rms ${fit.rms.toFixed(2)} mm too large for radius ${fit.radius.toFixed(1)}`;
  else if (!(inward > 0 && inward <= 2.5 * fit.radius)) reason = `centre ${inward.toFixed(1)} mm from the articular end is not inside the head`;
  else if (!(perp <= fit.radius)) reason = `centre ${perp.toFixed(1)} mm off the bone axis`;
  return { ok: reason === null, reason, centre: fit.centre, radius: fit.radius, rms: fit.rms, count: fit.count };
}

/** The capitate among the 'hand' segment bones when it is not given explicitly: the carpal (a hand array that is not one
 * of metacarpals 2-5) whose vertex centroid is nearest the base of the third metacarpal, which articulates with it. */
function identifyCapitate(handList, mc, middleBase) {
  const mcSet = new Set(DIGITS.flatMap(d => mc[d]));
  let best = null, bestD = Infinity;
  for (const arr of handList) {
    if (mcSet.has(arr)) continue;
    const c = centroidAll([arr], 'carpal');
    const d = length(sub(c, middleBase));
    if (d < bestD) { bestD = d; best = arr; }
  }
  return best;
}

function freezeDeep(o) {
  if (o && typeof o === 'object' && !ArrayBuffer.isView(o) && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) freezeDeep(o[k]);
  }
  return o;
}

function checkRig(rig) {
  if (!rig || rig.kind !== 'ns-rig') fail('rig_input', 'expected a rig from deriveRig');
  return rig;
}

/* ------------------------------------------------------------------ rig derivation */

/**
 * Derive the display rig from bone geometry (source mm, rest pose).
 * @param {Map<string, Array<Float32Array>>} boneMeshes segment -> bone positions arrays (bones only): every BONE_SEGMENTS
 *   entry is required except 'ulna', which is optional. With 'ulna' the radius ('forearm') turns about the forearm
 *   rotation axis and the ulna does not; without it (legacy callers, the placeholder) both forearm bones stay in
 *   'forearm', the axis falls back to the elbow -> forearm-end line and a warning is recorded.
 * @param {{palmar:number[], anteriorUpper:number[], metacarpals:{index,middle,ring,little}, restCompensation?:boolean}} options
 *   palmar/anteriorUpper come from muscle compartments (ns-assets compartmentDirections); their components along the
 *   forearm/humerus directions are removed here as well (idempotent). restCompensation (default true) makes pose angle 0
 *   a straight joint by subtracting the geometric mesh rest flexion; false applies angles relative to the mesh rest.
 *   Optional display-construction overrides (diagnostics/tuning only; the scene uses the defaults):
 *   thumbOpposition {flexion, palmarAbduction, axialRotation} (default THUMB_OPPOSITION_MIX) and
 *   thumbPad {ulnar, palmar} weights of the thumb MCP/IP flexion direction (default THUMB_PAD_WEIGHTS).
 */
export function deriveRig(boneMeshes, {
  palmar, anteriorUpper, metacarpals, restCompensation = true, palmarSource = 'given',
  thumbOpposition = THUMB_OPPOSITION_MIX, thumbPad = THUMB_PAD_WEIGHTS, carpals = null, pivotMode = 'head'
} = {}) {
  if (!PIVOT_MODES.includes(pivotMode)) fail('rig_input', `pivotMode must be one of ${PIVOT_MODES.join(', ')}`);
  for (const [what, o, keys] of [['thumbOpposition', thumbOpposition, ['flexion', 'palmarAbduction', 'axialRotation']], ['thumbPad', thumbPad, ['ulnar', 'palmar']]]) {
    if (!o || typeof o !== 'object' || !keys.every(k => Number.isFinite(o[k]))) fail('rig_input', `${what} must give finite ${keys.join(', ')}`);
  }
  if (!['given', 'palm_plane'].includes(palmarSource)) fail('rig_input', "palmarSource must be 'given' or 'palm_plane'");
  if (!(boneMeshes instanceof Map)) fail('rig_input', 'boneMeshes must be a Map(segment -> positions[])');
  for (const k of boneMeshes.keys()) {
    if (!SEGMENTS.includes(k)) fail('rig_input', `unknown segment ${String(k)}`);
    if (!BONE_SEGMENTS.includes(k)) fail('rig_input', `segment ${k} is a tissue-only twist frame and carries no bones`);
  }
  const bones = {};
  for (const s of BONE_SEGMENTS) {
    if (s === 'ulna' && !boneMeshes.has('ulna')) continue;
    if (!boneMeshes.has(s)) fail('rig_input', `missing bones for segment ${s}`);
    bones[s] = checkList(asList(boneMeshes.get(s), s), s);
  }
  const ulnaSeparate = Boolean(bones.ulna);
  const forearmBones = ulnaSeparate ? [...bones.forearm, ...bones.ulna] : bones.forearm;
  if (!metacarpals || typeof metacarpals !== 'object') fail('rig_input', 'metacarpals {index, middle, ring, little} are required');
  const mc = {};
  for (const d of DIGITS) {
    if (!metacarpals[d]) fail('rig_input', `missing metacarpal positions for ${d}`);
    mc[d] = checkList(asList(metacarpals[d], `metacarpal ${d}`), `metacarpal ${d}`);
  }
  const palmarIn = vec3(palmar, 'palmar');
  const anteriorIn = vec3(anteriorUpper, 'anteriorUpper');

  /* pivots (mm) */
  let hLo = Infinity, hHi = -Infinity;
  for (const arr of bones.upperarm) {
    const [lo, hi] = zRangeOf(arr);
    if (lo < hLo) hLo = lo;
    if (hi > hHi) hHi = hi;
  }
  const accS = [0, 0, 0, 0], accE = [0, 0, 0, 0];
  for (const arr of bones.upperarm) {
    bandAccumulate(accS, arr, hHi - SHOULDER_CAP_MM, Infinity);
    bandAccumulate(accE, arr, -Infinity, hLo + ELBOW_CAP_MM);
  }
  const shoulder = finish(accS, 'shoulder cap');
  const elbow = finish(accE, 'elbow cap');
  // The forearm END (pooled radius + ulna distal caps) defines the forearm direction in both modes (and matches
  // ns-assets boneAxes); in the legacy 'cap' mode it is also the wrist pivot.
  const forearmEnd = capCentroid(forearmBones, 'distal', 'wrist (radius + ulna distal caps)');
  const pivots = { shoulder, elbow, wrist: forearmEnd, forearmEnd };
  const tips = {};
  const mcBase = {};
  for (const d of DIGITS) {
    const pp = bones[`${d}_pp`], mp = bones[`${d}_mp`], dp = bones[`${d}_dp`];
    pivots[`${d}_mcp`] = lerp(capCentroid(mc[d], 'distal', `${d} metacarpal`), capCentroid(pp, 'proximal', `${d}_pp`), 0.5);
    pivots[`${d}_pip`] = lerp(capCentroid(pp, 'distal', `${d}_pp`), capCentroid(mp, 'proximal', `${d}_mp`), 0.5);
    pivots[`${d}_dip`] = lerp(capCentroid(mp, 'distal', `${d}_mp`), capCentroid(dp, 'proximal', `${d}_dp`), 0.5);
    tips[d] = capCentroid(dp, 'distal', `${d}_dp`);
    mcBase[d] = capCentroid(mc[d], 'proximal', `${d} metacarpal`);
  }
  pivots.thumb_cmc = capCentroid(bones.thumb_mc, 'proximal', 'thumb_mc');
  pivots.thumb_mcp = lerp(capCentroid(bones.thumb_mc, 'distal', 'thumb_mc'), capCentroid(bones.thumb_pp, 'proximal', 'thumb_pp'), 0.5);
  pivots.thumb_ip = lerp(capCentroid(bones.thumb_pp, 'distal', 'thumb_pp'), capCentroid(bones.thumb_dp, 'proximal', 'thumb_dp'), 0.5);
  tips.thumb = capCentroid(bones.thumb_dp, 'distal', 'thumb_dp');

  /* A3 joint-head pivots: refit every convex joint head with a sphere along the preliminary (cap-midpoint)
   * directions, and move the wrist flexion pivot into the capitate head. Rejected fits keep the legacy pivot. */
  const pivotFits = {};
  const pivotWarnings = [];
  if (pivotMode === 'head') {
    const legacy = { ...pivots };
    const useHead = (joint, list, dir, end, frac, what) => {
      const fit = headFit(list, dir, end, frac);
      if (fit.ok) {
        pivots[joint] = fit.centre;
        pivotFits[joint] = Object.freeze({ source: what, radiusMm: fit.radius, rmsMm: fit.rms, vertices: fit.count, shiftMm: length(sub(fit.centre, legacy[joint])) });
      } else {
        pivotFits[joint] = Object.freeze({ source: 'legacy cap-centroid midpoint', rejected: `${what}: ${fit.reason}` });
        pivotWarnings.push(`${joint}: ${what} fit rejected (${fit.reason}); legacy cap-centroid pivot kept`);
      }
    };
    for (const d of DIGITS) {
      const mcDir = unit(sub(legacy[`${d}_mcp`], mcBase[d]), `${d} metacarpal direction`);
      const ppDir = unit(sub(legacy[`${d}_pip`], legacy[`${d}_mcp`]), `${d}_pp direction`);
      const mpDir = unit(sub(legacy[`${d}_dip`], legacy[`${d}_pip`]), `${d}_mp direction`);
      useHead(`${d}_mcp`, mc[d], mcDir, 'distal', HEAD_FIT_FRACTION, `${d} metacarpal head sphere`);
      useHead(`${d}_pip`, bones[`${d}_pp`], ppDir, 'distal', HEAD_FIT_FRACTION, `${d} proximal phalanx head sphere`);
      useHead(`${d}_dip`, bones[`${d}_mp`], mpDir, 'distal', HEAD_FIT_FRACTION, `${d} middle phalanx head sphere`);
    }
    useHead('thumb_mcp', bones.thumb_mc, unit(sub(legacy.thumb_mcp, legacy.thumb_cmc), 'thumb_mc direction'), 'distal', HEAD_FIT_FRACTION, 'thumb metacarpal head sphere');
    useHead('thumb_ip', bones.thumb_pp, unit(sub(legacy.thumb_ip, legacy.thumb_mcp), 'thumb_pp direction'), 'distal', HEAD_FIT_FRACTION, 'thumb proximal phalanx head sphere');
    // Wrist: capitate head (explicit carpals.capitate, else identified as the carpal nearest the third metacarpal base).
    let capitate = null, capitateSource = null;
    if (carpals && carpals.capitate) {
      capitate = checkList(asList(carpals.capitate, 'carpals.capitate'), 'carpals.capitate');
      capitateSource = 'given';
    } else {
      const found = identifyCapitate(bones.hand, mc, mcBase.middle);
      if (found) { capitate = [found]; capitateSource = 'identified (carpal nearest the third metacarpal base)'; }
    }
    if (capitate) {
      const capDir = unit(sub(legacy.middle_mcp, mcBase.middle), 'third metacarpal direction');
      const fit = headFit(capitate, capDir, 'proximal', CAPITATE_HEAD_FRACTION);
      if (fit.ok) {
        pivots.wrist = fit.centre;
        pivotFits.wrist = Object.freeze({ source: `capitate head sphere (capitate ${capitateSource})`, radiusMm: fit.radius, rmsMm: fit.rms, vertices: fit.count, shiftMm: length(sub(fit.centre, forearmEnd)) });
      } else {
        pivots.wrist = capCentroid(capitate, 'proximal', 'capitate');
        pivotFits.wrist = Object.freeze({ source: `capitate proximal cap centroid (capitate ${capitateSource}; sphere fit rejected: ${fit.reason})`, shiftMm: length(sub(pivots.wrist, forearmEnd)) });
        pivotWarnings.push(`wrist: capitate head sphere fit rejected (${fit.reason}); capitate proximal cap centroid used`);
      }
    } else {
      pivotFits.wrist = Object.freeze({ source: 'legacy radius + ulna distal caps (no capitate found)' });
      pivotWarnings.push('wrist: no capitate available; legacy radius + ulna distal-cap pivot kept');
    }
  }
  const wrist = pivots.wrist;

  /* directions (joint to next joint, or to the distal cap centroid for distal phalanges) */
  const dirs = {
    upperarm: unit(sub(elbow, shoulder), 'upper arm direction'),
    forearm: unit(sub(forearmEnd, elbow), 'forearm direction'),
    hand: unit(sub(pivots.middle_mcp, wrist), 'hand direction'),
    thumb_mc: unit(sub(pivots.thumb_mcp, pivots.thumb_cmc), 'thumb_mc direction'),
    thumb_pp: unit(sub(pivots.thumb_ip, pivots.thumb_mcp), 'thumb_pp direction'),
    thumb_dp: unit(sub(tips.thumb, pivots.thumb_ip), 'thumb_dp direction')
  };
  const metacarpalDirs = {};
  for (const d of DIGITS) {
    dirs[`${d}_pp`] = unit(sub(pivots[`${d}_pip`], pivots[`${d}_mcp`]), `${d}_pp direction`);
    dirs[`${d}_mp`] = unit(sub(pivots[`${d}_dip`], pivots[`${d}_pip`]), `${d}_mp direction`);
    dirs[`${d}_dp`] = unit(sub(tips[d], pivots[`${d}_dip`]), `${d}_dp direction`);
    metacarpalDirs[d] = unit(sub(pivots[`${d}_mcp`], mcBase[d]), `${d} metacarpal direction`);
  }
  for (const t of ['ulna', 'forearm_tw1', 'forearm_tw2', 'forearm_tw3']) dirs[t] = dirs.forearm;

  /* U3a forearm rotation axis (pronation/supination): radial-head centre -> ulnar-head centre. */
  const pronationWarnings = [];
  let radialHead, ulnarHead, ulnaProx, radiusDistal, pronationSource;
  if (ulnaSeparate) {
    radialHead = capCentroidFrac(bones.forearm, 'proximal', RADIAL_HEAD_FRACTION, 'radial head');
    radiusDistal = capCentroid(bones.forearm, 'distal', 'radius distal cap');
    ulnaProx = capCentroid(bones.ulna, 'proximal', 'ulna proximal cap');
    const uFit = headFit(bones.ulna, dirs.forearm, 'distal', ULNAR_HEAD_FRACTION);
    if (uFit.ok) {
      ulnarHead = uFit.centre;
      pronationSource = `radial head = proximal ${RADIAL_HEAD_FRACTION * 100}% cap centroid of the radius; ulnar head = sphere fit of the distal ${ULNAR_HEAD_FRACTION * 100}% of the ulna (r ${uFit.radius.toFixed(1)} mm, rms ${uFit.rms.toFixed(2)} mm)`;
    } else {
      ulnarHead = capCentroidFrac(bones.ulna, 'distal', ULNAR_HEAD_FRACTION, 'ulnar head');
      pronationSource = `radial head = proximal cap centroid; ulnar head = distal cap centroid (sphere fit rejected: ${uFit.reason})`;
      pronationWarnings.push(`forearm_pronation: ulnar head sphere fit rejected (${uFit.reason}); distal cap centroid used`);
    }
  } else {
    radialHead = elbow;
    ulnarHead = forearmEnd;
    radiusDistal = forearmEnd;
    ulnaProx = elbow;
    pronationSource = 'no separate ulna: elbow -> forearm-end line (both forearm bones turn; degraded)';
    pronationWarnings.push('forearm_pronation: no separate ulna bones; both forearm bones turn about the elbow -> forearm-end line (degraded)');
  }
  pivots.radialHead = radialHead;
  pivots.ulnarHead = ulnarHead;
  const pronationAxis = unit(sub(ulnarHead, radialHead), 'forearm rotation axis');
  if (!(dot(pronationAxis, dirs.forearm) > 0.8)) pronationWarnings.push(`forearm rotation axis is ${(Math.acos(clamp(dot(pronationAxis, dirs.forearm), -1, 1)) / DEG).toFixed(0)} deg from the forearm direction`);

  /* reference directions */
  // 'palm_plane': the hand's palmar direction is the normal of the palm plane through the index and little MCP pivots
  // and the wrist-to-middle-MCP line, signed toward the given (flexor-compartment) direction. The forearm compartment
  // centroids alone can point far from the palm normal (about 52 deg medial on the BodyParts3D left arm).
  let palmarRef = palmarIn;
  if (palmarSource === 'palm_plane') {
    let n = unit(cross(sub(pivots.index_mcp, pivots.little_mcp), sub(pivots.middle_mcp, wrist)), 'palm-plane normal');
    if (dot(n, palmarIn) < 0) n = scale(n, -1);
    palmarRef = n;
  }
  const palmarDir = unitPerp(palmarRef, dirs.forearm, 'palmar');
  const anteriorDir = unitPerp(anteriorIn, dirs.upperarm, 'anteriorUpper');
  const palmarHand = unitPerp(palmarDir, dirs.hand, 'palmar (hand)');
  const thumbToLittle = sub(centroidAll(bones.thumb_mc, 'thumb_mc'), centroidAll(mc.little, 'little metacarpal'));
  const radial = unitPerp(reject(thumbToLittle, dirs.hand), palmarHand, 'radial');
  const thumbFlexDir = unit(add(scale(radial, -thumbPad.ulnar), scale(palmarDir, thumbPad.palmar)), 'thumb flexion direction');
  // Thumb opposition (see THUMB_OPPOSITION_MIX): flexion moves the first metacarpal ulnarward (-radial), palmar
  // abduction moves it palmarward (palm normal), and the axial part rotates it about its own long axis so that the
  // thumb pad (thumbFlexDir) turns toward the palm (its palm-normal component decreases).
  const mix = thumbOpposition;
  const oppFlexion = axisToward(dirs.thumb_mc, scale(radial, -1), 'thumb CMC flexion construction');
  const oppAbduction = axisToward(dirs.thumb_mc, palmarHand, 'thumb CMC palmar-abduction construction');
  const padAfter = transformDirection(rotationAxisAngle(dirs.thumb_mc, 0.05), thumbFlexDir);
  const oppAxial = dot(padAfter, palmarHand) < dot(thumbFlexDir, palmarHand) ? dirs.thumb_mc : scale(dirs.thumb_mc, -1);
  const thumbOppAxis = unit(add(add(scale(oppFlexion, mix.flexion), scale(oppAbduction, mix.palmarAbduction)), scale(oppAxial, mix.axialRotation)),
    'thumb opposition axis');
  // Direction in which positive opposition moves the metacarpal (the axial part does not move its direction).
  const thumbOppDir = unit(sub(scale(palmarHand, mix.palmarAbduction), scale(radial, mix.flexion)), 'thumb opposition direction');

  /* axes (unit, source frame) and the direction each axis moves its segment toward */
  const axes = {
    elbow: axisToward(dirs.forearm, anteriorDir, 'elbow axis'),
    wrist_flex: axisToward(dirs.hand, palmarDir, 'wrist axis'),
    thumb_cmc_opp: thumbOppAxis,
    thumb_mcp_flex: axisToward(dirs.thumb_pp, thumbFlexDir, 'thumb MCP axis'),
    thumb_ip_flex: axisToward(dirs.thumb_dp, thumbFlexDir, 'thumb IP axis'),
    // LEFT forearm: a positive turn about the distal-pointing axis takes the palm from anterior (supinated) through
    // medial (neutral) to posterior (pronated), i.e. the radial styloid crosses anterior to the ulna.
    forearm_pronation: pronationAxis
  };
  const semantics = [
    { joint: 'elbow', segment: 'forearm', toward: anteriorDir, meaning: 'flexion moves the forearm anteriorly' },
    { joint: 'wrist_flex', segment: 'hand', toward: palmarDir, meaning: 'flexion moves the hand palmarward' },
    {
      joint: 'thumb_cmc_opp', segment: 'thumb_mc', toward: thumbOppDir,
      meaning: 'opposition moves the thumb metacarpal palmar and ulnar and turns the thumb pad toward the palm (display construction)'
    },
    { joint: 'thumb_mcp_flex', segment: 'thumb_pp', toward: thumbFlexDir, meaning: 'thumb MCP flexion (approximate direction)' },
    { joint: 'thumb_ip_flex', segment: 'thumb_dp', toward: thumbFlexDir, meaning: 'thumb IP flexion (approximate direction)' },
    { joint: 'forearm_pronation', segment: 'forearm', toward: axes.elbow, meaning: 'pronation turns the radius and hand about the radial-head -> ulnar-head axis; the palm goes from anterior (supinated) through medial (neutral, 0) to posterior (pronated)' }
  ];
  for (const d of DIGITS) {
    axes[`${d}_mcp_flex`] = axisToward(dirs[`${d}_pp`], palmarDir, `${d} MCP axis`);
    axes[`${d}_pip_flex`] = axisToward(dirs[`${d}_mp`], palmarDir, `${d} PIP axis`);
    axes[`${d}_dip_flex`] = axisToward(dirs[`${d}_dp`], palmarDir, `${d} DIP axis`);
    // positive abduction = away from digit 3: index radially, ring/little ulnarly; middle (reference) radially.
    const away = d === 'ring' || d === 'little' ? scale(radial, -1) : radial;
    axes[`${d}_mcp_abd`] = axisToward(dirs[`${d}_pp`], away, `${d} abduction axis`);
    semantics.push(
      { joint: `${d}_mcp_flex`, segment: `${d}_pp`, toward: palmarDir, meaning: 'MCP flexion moves the phalanx palmarward' },
      { joint: `${d}_pip_flex`, segment: `${d}_mp`, toward: palmarDir, meaning: 'PIP flexion moves the phalanx palmarward' },
      { joint: `${d}_dip_flex`, segment: `${d}_dp`, toward: palmarDir, meaning: 'DIP flexion moves the phalanx palmarward' },
      {
        joint: `${d}_mcp_abd`, segment: `${d}_pp`, toward: away,
        meaning: d === 'middle' ? 'reference digit (normally 0); positive moves radially' : 'abduction moves the digit away from digit 3'
      }
    );
  }
  for (const s of semantics) { s.axis = axes[s.joint]; s.dir = dirs[s.segment]; }

  /* geometric mesh rest flexion (degrees), used so that pose angle 0 is a straight joint */
  const restAngles = Object.fromEntries(POSE_JOINTS.map(j => [j, 0]));
  if (restCompensation) {
    const ang = (u, v, j) => signedAngleAbout(u, v, axes[j]) / DEG;
    restAngles.wrist_flex = ang(dirs.forearm, dirs.hand, 'wrist_flex');
    restAngles.thumb_mcp_flex = ang(dirs.thumb_mc, dirs.thumb_pp, 'thumb_mcp_flex');
    restAngles.thumb_ip_flex = ang(dirs.thumb_pp, dirs.thumb_dp, 'thumb_ip_flex');
    for (const d of DIGITS) {
      restAngles[`${d}_mcp_flex`] = ang(metacarpalDirs[d], dirs[`${d}_pp`], `${d}_mcp_flex`);
      restAngles[`${d}_pip_flex`] = ang(dirs[`${d}_pp`], dirs[`${d}_mp`], `${d}_pip_flex`);
      restAngles[`${d}_dip_flex`] = ang(dirs[`${d}_mp`], dirs[`${d}_dp`], `${d}_dip_flex`);
    }
    // Pronation 0 = neutral: the palm normal along the elbow axis (medial for the left arm). The mesh rest is measured.
    restAngles.forearm_pronation = signedAngleAbout(axes.elbow, palmarDir, axes.forearm_pronation) / DEG;
  }

  /* segment axis lines for skinning (proximal joint -> distal joint or tip) */
  const lines = {
    upperarm: [shoulder, elbow], forearm: [elbow, wrist], hand: [wrist, pivots.middle_mcp],
    thumb_mc: [pivots.thumb_cmc, pivots.thumb_mcp], thumb_pp: [pivots.thumb_mcp, pivots.thumb_ip], thumb_dp: [pivots.thumb_ip, tips.thumb]
  };
  lines.ulna = [ulnaProx, ulnarHead];
  for (const t of ['forearm_tw1', 'forearm_tw2', 'forearm_tw3']) lines[t] = lines.forearm;
  for (const d of DIGITS) {
    lines[`${d}_pp`] = [pivots[`${d}_mcp`], pivots[`${d}_pip`]];
    lines[`${d}_mp`] = [pivots[`${d}_pip`], pivots[`${d}_dip`]];
    lines[`${d}_dp`] = [pivots[`${d}_dip`], tips[d]];
  }
  // Skinning capsules: the same single lines, except that the rigid 'hand' segment (carpus + metacarpals 2-5) is a fan
  // of nine lines (wrist -> each metacarpal base -> its MCP pivot, and wrist -> thumb CMC pivot). With the single
  // wrist -> middle-MCP line, palm, thenar-web and interosseous tissue beside metacarpals 2, 4 and 5 lay closer to
  // the proximal phalanges or the thumb than to the hand and was carried away by digit flexion (spanning sheets).
  const skinLines = Object.fromEntries(Object.entries(lines).map(([k, l]) => [k, [l]]));
  skinLines.hand = [[wrist, pivots.thumb_cmc], ...DIGITS.flatMap(d => [[wrist, mcBase[d]], [mcBase[d], pivots[`${d}_mcp`]]])];

  const warnings = [...pivotWarnings, ...pronationWarnings];
  for (const d of DIGITS) {
    for (const j of ['mcp', 'pip', 'dip']) {
      if (dot(axes[`${d}_${j}_flex`], axes.wrist_flex) <= 0) {
        warnings.push(`${d}_${j}_flex axis opposes the wrist flexion axis; the rest segment may be curled past the palmar direction`);
      }
    }
  }
  if (restCompensation) {
    for (const [j, v] of Object.entries(restAngles)) {
      if (j === 'forearm_pronation') {
        // The anatomical-position mesh should be near full supination (about -80 to -100 deg from neutral).
        if (!(v >= -125 && v <= -55)) warnings.push(`forearm_pronation rest angle ${v.toFixed(1)} deg is not near anatomical supination`);
      } else if (Math.abs(v) > 90) warnings.push(`${j} rest angle ${v.toFixed(1)} deg is implausible`);
    }
  }

  const handCentre = centroidAll(DIGITS.flatMap(d => mc[d]), 'metacarpals 2-5');
  // Bone silhouette sample per segment (rest mm): the extreme vertices along SILHOUETTE_DIRECTIONS directions. ns-arm uses
  // it for the on-screen hand SIZE (the conservative fit boxes also hold wrist-crossing tissue and overstate the size).
  const silDirs = fibonacciDirections(SILHOUETTE_DIRECTIONS);
  const silhouette = {};
  for (const sname of Object.keys(bones)) {
    const flat = [];
    for (const arr of bones[sname]) for (let i = 0; i < arr.length; i++) flat.push(arr[i]);
    silhouette[sname] = pruneExtremes(flat, silDirs);
  }
  return freezeDeep({
    kind: 'ns-rig',
    units: 'source millimetres, rest pose',
    pivots, tips, dirs, metacarpalDirs, lines, skinLines, axes,
    segmentAxis: { ...SEGMENT_AXIS },
    restAngles,
    restCompensation: Boolean(restCompensation),
    palmar: palmarDir,
    palmarSource,
    anteriorUpper: anteriorDir,
    radial,
    thumbFlexDir,
    thumbOppDir,
    handCentre,
    silhouette,
    ulnaSeparate,
    pronationSource,
    twist: {
      separated: ulnaSeparate, elbow, forearmEnd, axisDir: dirs.forearm, lengthMm: length(sub(forearmEnd, elbow)),
      radiusLine: [radialHead, radiusDistal], ulnaLine: [ulnaProx, ulnarHead], ...TWIST_SKIN, chain: { ...TWIST_SKIN_CHAIN }
    },
    upperLength: length(sub(elbow, shoulder)),
    foreLength: length(sub(wrist, elbow)),
    semantics,
    pivotMode,
    pivotFits,
    flags: [THUMB_FLEX_APPROXIMATION, restCompensation ? REST_COMPENSATION_NOTE : LITERAL_NOTE, pivotMode === 'head' ? HEAD_PIVOT_NOTE : PIVOT_NOTE],
    warnings
  });
}

/* ------------------------------------------------------------------ Space fist pose */

/**
 * Closed five-digit fist for the Space action (degrees, POSE_JOINTS semantics; rest-compensated, so 0 = straight joint).
 * Abduction joints are deliberately absent (not driven; the middle finger stays the abduction reference).
 *
 * PROVENANCE (display pose, not measured motion):
 *  - Target ARRANGEMENT (qualitative only): Root-accepted bounded reference Clenched_human_fist.png (Ralpharama,
 *    CC BY-SA 3.0, sha256 125b281734fb19715bde6bacac21f958d4f48821ac9aba2e76c094a0a6d9e680): four fingers curled with
 *    the distal pads tucked toward the palm and the thumb folded ACROSS the index/middle middle phalanges; and Morgan &
 *    Carrier 2013 (J Exp Biol, doi 10.1242/jeb.075713) as read by Root: finger pads against the palm, thumb opposed,
 *    adducted and flexed over index/middle. No angle is read from any photo or from that paper.
 *  - FINGER ANGLES: chosen inside commonly cited normal active ranges, e.g. AAOS 1965 "Joint Motion: Method of
 *    Measuring and Recording" (MCP 0-90, PIP 0-100, DIP 0-90), Hume et al. 1990 (J Hand Surg Am 15:240; active flexion
 *    about MCP 100, PIP 105, DIP 85) and the ASSH total-active-motion convention (about 260 deg per finger). Ring and
 *    little take 5 deg more MCP flexion (qualitative ulnar "cascade" of the closed fist). Totals: 255 deg (index,
 *    middle), 260 deg (ring, little).
 *  - THUMB: MCP 30 and IP 65 lie inside the same sources' thumb ranges (AAOS MCP 0-50, IP 0-80; Hume about 56 / 73).
 *    thumb_cmc_opp 40 is in units of the display opposition construction (THUMB_OPPOSITION_MIX), NOT an anatomical
 *    trapeziometacarpal angle. The thumb values and the mix were tuned on the static BodyParts3D bones (diag/fist-thumb)
 *    so that the thumb distal phalanx lies 5-9 mm bone-to-bone over the index/middle middle phalanges, runs across the
 *    fist face (ulnarward) and penetrates no other bone.
 *  - WRIST -10 (mild extension) is unchanged from the pre-repair target so the accepted screen fit is preserved.
 * LITERATURE VALUES ARE CITED FROM MEMORY: NOT ACQUIRED OR RE-VERIFIED HERE; Root reference qualification pending.
 * Needs JOINT_LIMITS / POSE_RANGES of at least MCP 90 and PIP 105 (pre-repair limits were 85 / 100).
 */
export const FIST_POSE_DEG = Object.freeze({
  wrist_flex: -10,
  thumb_cmc_opp: 40, thumb_mcp_flex: 30, thumb_ip_flex: 65,
  index_mcp_flex: 85, index_pip_flex: 105, index_dip_flex: 65,
  middle_mcp_flex: 85, middle_pip_flex: 105, middle_dip_flex: 65,
  ring_mcp_flex: 90, ring_pip_flex: 105, ring_dip_flex: 65,
  little_mcp_flex: 90, little_pip_flex: 105, little_dip_flex: 65
});

/**
 * R3-arm: the relaxed hand at rest (degrees, POSE_JOINTS semantics; rest-compensated, so 0 = straight joint). A relaxed
 * hand is not straight: each finger is a little more bent than the one beside it, from the index to the little finger
 * (the normal resting "cascade" of the fingers, a standard clinical observation), and the thumb rests slightly turned
 * toward the index finger. The wrist is not part of this pose (0), so the accepted arm fit, the elbow solution and the
 * WASD wrist convention are unchanged; abduction joints are absent (0).
 * PROVENANCE: display choices inside commonly described relaxed-hand ranges (MCP about 20-45 deg and PIP about 25-50 deg,
 * increasing from index to little; CITED FROM MEMORY, NOT ACQUIRED OR RE-VERIFIED HERE; Root reference qualification
 * pending; not measured kinematics). Round 2 used 15/20/10 on every finger, which on this rig is almost the
 * BodyParts3D mesh rest (rig.restAngles index 12.5/19.4/8.1): the fingers looked straight and splayed and palm up read
 * as a stiff "stop" sign (harness/run-R3-arm-shots-base-2/04-rest-supinated-hand.png). ns-actions REST_POSE uses it.
 */
export const REST_HAND_POSE_DEG = Object.freeze({
  thumb_cmc_opp: 12, thumb_mcp_flex: 15, thumb_ip_flex: 15,
  index_mcp_flex: 22, index_pip_flex: 28, index_dip_flex: 12,
  middle_mcp_flex: 28, middle_pip_flex: 35, middle_dip_flex: 14,
  ring_mcp_flex: 34, ring_pip_flex: 40, ring_dip_flex: 16,
  little_mcp_flex: 40, little_pip_flex: 44, little_dip_flex: 18
});

/* ------------------------------------------------------------------ boxes */

/** The {d, a, p} frame of a segment's box: frame(segment direction, its joint axis). */
export function boxFrame(rig, segment) {
  checkRig(rig);
  if (!SEGMENTS.includes(segment)) fail('rig_segment', `unknown segment ${segment}`);
  return frame(rig.dirs[segment], rig.axes[rig.segmentAxis[segment]]);
}

/**
 * Oriented boxes (8 corners each, rest source mm) containing every bone vertex of each segment present in
 * segmentPositions (Map(segment -> positions[])). Corner k uses max along d if (k & 1), along a if (k & 2), along p if (k & 4).
 */
export function segmentBoxes(rig, segmentPositions) {
  checkRig(rig);
  if (!(segmentPositions instanceof Map)) fail('rig_input', 'segmentPositions must be a Map(segment -> positions[])');
  for (const k of segmentPositions.keys()) if (!SEGMENTS.includes(k)) fail('rig_input', `unknown segment ${String(k)}`);
  const out = new Map();
  for (const s of SEGMENTS) {
    if (!segmentPositions.has(s)) continue;
    const list = checkList(asList(segmentPositions.get(s), s), s);
    const { d, a, p } = boxFrame(rig, s);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const arr of list) {
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i], y = arr[i + 1], z = arr[i + 2];
        const c = [d[0] * x + d[1] * y + d[2] * z, a[0] * x + a[1] * y + a[2] * z, p[0] * x + p[1] * y + p[2] * z];
        for (let k = 0; k < 3; k++) {
          if (c[k] < lo[k]) lo[k] = c[k];
          if (c[k] > hi[k]) hi[k] = c[k];
        }
      }
    }
    const corners = [];
    for (let k = 0; k < 8; k++) {
      const sd = k & 1 ? hi[0] : lo[0], sa = k & 2 ? hi[1] : lo[1], sp = k & 4 ? hi[2] : lo[2];
      corners.push(Object.freeze(add(add(scale(d, sd), scale(a, sa)), scale(p, sp))));
    }
    out.set(s, Object.freeze(corners));
  }
  return out;
}

/* ------------------------------------------------------------------ kinematics */

/** Validate a pose and fill absent joints with 0 (degrees). Unknown joint names are refused. */
export function normalizeJoints(joints = {}) {
  if (joints === null || typeof joints !== 'object') fail('rig_pose', 'joints must be an object of degrees');
  for (const k of Object.keys(joints)) if (!POSE_JOINTS.includes(k)) fail('rig_pose', `unknown joint ${k}`);
  const out = {};
  for (const k of POSE_JOINTS) {
    const v = joints[k] === undefined ? 0 : joints[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) fail('rig_pose', `joint ${k} must be finite degrees`);
    out[k] = v;
  }
  return out;
}

const jointRotation = (rig, J, j) =>
  rotationAboutPivot(rig.axes[j], (J[j] - rig.restAngles[j]) * DEG, rig.pivots[JOINT_PIVOT[j]]);

/** The rotation (rest mm -> rest mm) of ONE pose joint at `degrees` (POSE_JOINTS semantics, rest-compensated like
 * forwardKinematics). Lets envelope builders compose digit chains without re-normalising a whole pose. */
export function jointMatrix(rig, joint, degrees) {
  checkRig(rig);
  if (!POSE_JOINTS.includes(joint)) fail('rig_pose', `unknown joint ${joint}`);
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) fail('rig_pose', `joint ${joint} must be finite degrees`);
  return rotationAboutPivot(rig.axes[joint], (degrees - rig.restAngles[joint]) * DEG, rig.pivots[JOINT_PIVOT[joint]]);
}

/** Wrist rotation about its pivot (rest mm -> rest mm) for a pose. */
export function wristMatrix(rig, joints) {
  checkRig(rig);
  return jointRotation(rig, normalizeJoints(joints), 'wrist_flex');
}

/** Forearm pronation turn (rest mm -> rest mm) of the radius about the forearm rotation axis for a pose
 * (forearm_pronation - rig.restAngles.forearm_pronation degrees). */
export function pronationMatrix(rig, joints) {
  checkRig(rig);
  return jointRotation(rig, normalizeJoints(joints), 'forearm_pronation');
}

/** The hand relative to the ulna (the elbow-flexed forearm frame): pronation turn, then the wrist (rest mm -> rest mm).
 * hand = ulna * forearmHandMatrix. */
export function forearmHandMatrix(rig, joints) {
  checkRig(rig);
  const J = normalizeJoints(joints);
  return multiply(jointRotation(rig, J, 'forearm_pronation'), jointRotation(rig, J, 'wrist_flex'));
}

/** Matrices (rest mm -> rest mm) of the hand and every digit segment relative to the hand segment.
 * The full digit matrix is hand * local. 'hand' maps to the identity. */
export function handLocalMatrices(rig, joints) {
  checkRig(rig);
  const J = normalizeJoints(joints);
  const out = new Map();
  out.set('hand', identity());
  const tmc = jointRotation(rig, J, 'thumb_cmc_opp');
  const tpp = multiply(tmc, jointRotation(rig, J, 'thumb_mcp_flex'));
  const tdp = multiply(tpp, jointRotation(rig, J, 'thumb_ip_flex'));
  out.set('thumb_mc', tmc);
  out.set('thumb_pp', tpp);
  out.set('thumb_dp', tdp);
  for (const d of DIGITS) {
    const pp = multiply(jointRotation(rig, J, `${d}_mcp_abd`), jointRotation(rig, J, `${d}_mcp_flex`));
    const mp = multiply(pp, jointRotation(rig, J, `${d}_pip_flex`));
    const dp = multiply(mp, jointRotation(rig, J, `${d}_dip_flex`));
    out.set(`${d}_pp`, pp);
    out.set(`${d}_mp`, mp);
    out.set(`${d}_dp`, dp);
  }
  return out;
}

function checkMatrix(m, what) {
  if (!m || m.length !== 16) fail('rig_pose', `${what} must be a 4x4 column-major matrix`);
  for (let i = 0; i < 16; i++) if (!Number.isFinite(m[i])) fail('rig_pose', `${what} has a non-finite element`);
  return Float64Array.from(m);
}

/**
 * Forward kinematics: Map(segment -> Float64Array(16)) mapping REST source mm to camera metres.
 * shoulderMatrix maps rest source mm to camera metres for the upper arm (includes the 0.001 scale).
 * ulna = upperarm * R(elbow); forearm (radius) = ulna * R(pronation about the radial-head -> ulnar-head axis);
 * forearm_twK = ulna * R(level_K * pronation) (tissue-only twist frames, FOREARM_TWIST_LEVELS);
 * hand = forearm * R(wrist); D_pp = hand * R(abd) * R(mcp); D_mp = D_pp * R(pip);
 * D_dp = D_mp * R(dip); thumb_mc = hand * R(opp); thumb_pp = thumb_mc * R(mcp); thumb_dp = thumb_pp * R(ip).
 * R rotates about the rig pivot by (angle - rig.restAngles[joint]) degrees (rest angles are 0 without compensation).
 */
export function forwardKinematics(rig, { shoulderMatrix, elbowFlexRad = 0, joints = {} } = {}) {
  checkRig(rig);
  const upper = checkMatrix(shoulderMatrix, 'shoulderMatrix');
  if (typeof elbowFlexRad !== 'number' || !Number.isFinite(elbowFlexRad)) fail('rig_pose', 'elbowFlexRad must be finite radians');
  const J = normalizeJoints(joints);
  const ulna = multiply(upper, rotationAboutPivot(rig.axes.elbow, elbowFlexRad, rig.pivots.elbow));
  const turn = (J.forearm_pronation - rig.restAngles.forearm_pronation) * DEG;
  const proAt = f => rotationAboutPivot(rig.axes.forearm_pronation, f * turn, rig.pivots.radialHead);
  const fore = multiply(ulna, proAt(1));
  const hand = multiply(fore, jointRotation(rig, J, 'wrist_flex'));
  const local = handLocalMatrices(rig, J);
  const out = new Map();
  for (const s of SEGMENTS) {
    if (s === 'upperarm') out.set(s, upper);
    else if (s === 'forearm') out.set(s, fore);
    else if (s === 'hand') out.set(s, hand);
    else if (s === 'ulna') out.set(s, ulna);
    else if (s.startsWith('forearm_tw')) out.set(s, multiply(ulna, proAt(FOREARM_TWIST_LEVELS[FOREARM_TWIST_CHAIN.indexOf(s)])));
    else out.set(s, multiply(hand, local.get(s)));
  }
  return out;
}

/* ------------------------------------------------------------------ skinning */

export function segmentIndex(segment) {
  const i = SEGMENTS.indexOf(segment);
  if (i < 0) fail('rig_segment', `unknown segment ${String(segment)}`);
  return i;
}

function checkPositions(positions, what) {
  if (!positions || typeof positions.length !== 'number' || positions.length % 3 !== 0) {
    fail('rig_input', `${what} must be a positions array with length a multiple of 3`);
  }
  return positions.length / 3;
}

/** Skinning tree of every segment: forearm <- upperarm, hand <- forearm, thumb_mc <- hand, ... The pre-U3a 18 entries
 * are unchanged so the distance rule (ADJACENT / MEET) behaves exactly as before; the U3a segments hang off the side
 * (ulna <- upperarm, forearm_tw1 <- ulna, tw2 <- tw1, tw3 <- tw2) and are never distance candidates (the twist pass
 * assigns them). Kinematically forearm = ulna * R(pronation), see forwardKinematics. */
export const SEGMENT_PARENT = Object.freeze(Object.fromEntries([
  ['upperarm', null], ['forearm', 'upperarm'], ['hand', 'forearm'],
  ['thumb_mc', 'hand'], ['thumb_pp', 'thumb_mc'], ['thumb_dp', 'thumb_pp'],
  ...DIGITS.flatMap(d => [[`${d}_pp`, 'hand'], [`${d}_mp`, `${d}_pp`], [`${d}_dp`, `${d}_mp`]]),
  ['ulna', 'upperarm'], ['forearm_tw1', 'ulna'], ['forearm_tw2', 'forearm_tw1'], ['forearm_tw3', 'forearm_tw2']
]));

/* Pairwise tree tables over SEGMENTS indices: ADJACENT (parent/child) and MEET (for non-adjacent pairs, the segment a
 * vertex on their equidistant ridge follows: the lowest common ancestor when it is neither segment, otherwise the middle
 * node of the ancestor-descendant chain, ties toward the ancestor). Both are symmetric in the pair. */
const SEG_N = SEGMENTS.length;
const { ADJACENT, MEET } = (() => {
  const par = SEGMENTS.map(s => (SEGMENT_PARENT[s] === null ? -1 : SEGMENTS.indexOf(SEGMENT_PARENT[s])));
  const chain = i => { const c = [i]; while (par[c[c.length - 1]] >= 0) c.push(par[c[c.length - 1]]); return c; };
  const adjacent = new Uint8Array(SEG_N * SEG_N), meet = new Int8Array(SEG_N * SEG_N).fill(-1);
  for (let i = 0; i < SEG_N; i++) for (let j = 0; j < SEG_N; j++) {
    if (i === j) continue;
    const ci = chain(i), cj = chain(j);
    const L = ci.find(x => cj.includes(x));
    const len = ci.indexOf(L) + cj.indexOf(L);
    if (len === 1) { adjacent[i * SEG_N + j] = 1; continue; }
    if (L !== i && L !== j) meet[i * SEG_N + j] = L;
    else { const desc = chain(L === i ? j : i); meet[i * SEG_N + j] = desc[len - Math.floor(len / 2)]; }
  }
  return { ADJACENT: adjacent, MEET: meet };
})();

const TWIST_IDX = FOREARM_TWIST_CHAIN.map(s => SEGMENTS.indexOf(s));
const HAND_MASK = (() => { const m = new Uint8Array(SEGMENTS.length); for (const s of HAND_SEGMENTS) m[SEGMENTS.indexOf(s)] = 1; return m; })();

/** Twist fraction (0..1 of the pronation turn) of a rest-mm point under TWIST_SKIN (see there); `params` { t0, t1,
 * lambda0 } defaults to the rig's continuous constants (rig.twist; rig.twist.chain holds the chain's). */
export function forearmTwistFraction(rig, p, params = null) {
  checkRig(rig);
  const tw = rig.twist;
  if (!tw) fail('rig_input', 'rig has no forearm twist data (derive it with the current deriveRig)');
  const k = params || tw;
  const t = dot(sub(p, tw.elbow), tw.axisDir) / tw.lengthMm;
  const u = clamp((t - k.t0) / (k.t1 - k.t0), 0, 1);
  const ramp = smoothstep(u);
  if (!tw.separated || !(k.lambda0 > 0)) return ramp;
  const dr = pointSegmentDistance(p, tw.radiusLine[0], tw.radiusLine[1]);
  const du = pointSegmentDistance(p, tw.ulnaLine[0], tw.ulnaLine[1]);
  const side = du * du + dr * dr > 1e-12 ? (du * du) / (du * du + dr * dr) : 0.5;
  const sn = Math.sin(Math.PI * u);
  const lam = k.lambda0 * sn * sn;
  return (1 - lam) * ramp + lam * side;
}

/**
 * R558: split the long triangles of a muscle mesh where the continuous forearm twist changes along them (display-only
 * refinement of licensed anatomy: every new vertex is the midpoint of an existing edge, so the rest surface is exactly
 * the original one; only the posed surface can now follow the twist). Rounds of conforming bisection: an edge whose two
 * ends differ by more than maxStep in forearmTwistFraction (rig's continuous constants) is split at its midpoint, and
 * each triangle is re-cut by how many of its edges were split (1 -> 2, 2 -> 3, 3 -> 4 triangles, orientation kept), so
 * two triangles that share an edge always agree (no T-junction cracks). Pure.
 * @returns { positions (Float32Array), indices (Uint32Array), added (new vertices), rounds }; the input arrays are
 *   returned unchanged (added 0) when nothing needs splitting.
 */
export function refineForTwist(rig, positions, indices, { maxStep = TWIST_REFINE_MAX_STEP, maxRounds = 6 } = {}) {
  checkRig(rig);
  checkPositions(positions, 'positions');
  if (!indices || indices.length % 3 !== 0) fail('rig_input', 'indices must be triangles');
  if (!(Number.isFinite(maxStep) && maxStep > 0)) fail('rig_input', 'maxStep must be positive');
  if (!rig.twist) return { positions, indices, added: 0, rounds: 0 };
  let pos = null, ix = indices, n = positions.length / 3, added = 0, rounds = 0;
  const f = [];
  const P = i => (pos ? pos : positions);
  const fAt = v => {
    if (f[v] === undefined) { const q = P(v); f[v] = forearmTwistFraction(rig, [q[3 * v], q[3 * v + 1], q[3 * v + 2]]); }
    return f[v];
  };
  for (; rounds < maxRounds; rounds++) {
    const mid = new Map(), out = [];
    let any = false;
    const need = (a, b) => Math.abs(fAt(a) - fAt(b)) > maxStep;
    const midOf = (a, b) => {
      const k = a < b ? a * 16777216 + b : b * 16777216 + a;
      let m = mid.get(k);
      if (m === undefined) {
        if (!pos) pos = Array.from(positions);
        m = n++;
        pos.push((pos[3 * a] + pos[3 * b]) / 2, (pos[3 * a + 1] + pos[3 * b + 1]) / 2, (pos[3 * a + 2] + pos[3 * b + 2]) / 2);
        mid.set(k, m); added++;
      }
      return m;
    };
    for (let t = 0; t < ix.length; t += 3) {
      const v0 = ix[t], v1 = ix[t + 1], v2 = ix[t + 2];
      const s0 = need(v0, v1), s1 = need(v1, v2), s2 = need(v2, v0), c = s0 + s1 + s2;
      if (!c) { out.push(v0, v1, v2); continue; }
      any = true;
      if (c === 3) {
        const a = midOf(v0, v1), b = midOf(v1, v2), d = midOf(v2, v0);
        out.push(v0, a, d, a, v1, b, d, b, v2, a, b, d);
      } else if (c === 1) {
        const [A, B, C] = s0 ? [v0, v1, v2] : s1 ? [v1, v2, v0] : [v2, v0, v1];
        const m = midOf(A, B);
        out.push(A, m, C, m, B, C);
      } else { // two split edges sharing vertex B; the unsplit edge is C -> A
        const [A, B, C] = !s0 ? [v1, v2, v0] : !s1 ? [v2, v0, v1] : [v0, v1, v2];
        const m1 = midOf(A, B), m2 = midOf(B, C);
        out.push(m1, B, m2, A, m1, m2, A, m2, C);
      }
    }
    if (!any) break;
    ix = out;
  }
  if (!added) return { positions, indices, added: 0, rounds };
  if (n > 16777216) fail('rig_input', 'refined mesh too large');
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(ix), added, rounds };
}

/**
 * Two-influence linear-blend skin weights for a muscle mesh over SEGMENTS indices (fist-r2 rule).
 *
 * 1. Capsule distance d_s = distance from the vertex to the nearest of the segment's skin lines (rig.skinLines: the
 *    joint-to-joint axis line clamped to the segment; the rigid 'hand' is a fan of nine lines over carpus and metacarpals
 *    2-5), softened D_s = sqrt(d_s^2 + SKIN_SOFTEN_MM^2); raw affinity a_s = D_s^-SKIN_POWER (candidates only).
 * 2. Meeting boost: for every NON-adjacent pair A, B among the six strongest segments, b_m = max(b_m,
 *    min(SKIN_MEET_BOOST * min(a_A, a_B), SKIN_MEET_CAP * a_m)) for their meeting segment m = MEET(A, B) (common parent,
 *    or middle of an ancestor chain). Siblings (index_pp / middle_pp, thumb_mc / index_pp) and chains (hand / thumb_pp)
 *    therefore converge on the hand or the thumb metacarpal instead of tearing apart or blending unrelated digits.
 * 3. Order-statistic projection onto two influences: with b1 >= b2 >= b3 the two strongest segments get weights
 *    proportional to (b1 - b3) and (b2 - b3). This is continuous wherever segments reorder (a hard top-two cut or a rigid
 *    gap jump is not), and the second influence vanishes exactly where the second and third strongest tie.
 * 4. The minor weight ramps continuously to exactly 0 below SKIN_MINOR_CUTOFF (then i1 = i0, w1 = 0).
 * 5. Forearm twist pass (whenever 'forearm' is a candidate). twist 'continuous' (also true, the default; R558): a
 *    'forearm' (radius) influence becomes the 'ulna' influence turned by its own fraction f = forearmTwistFraction (the
 *    rig's continuous constants) of the pronation turn: `tf[v]` = f, applied by skinApply through twistTable (f 0 is the
 *    plain ulna frame; f >= 1 keeps the radius frame 'forearm' itself). A forearm + hand/digit vertex keeps the full-turn
 *    'forearm' (so hand tissue is still bounded by the hand frame and the forearm support box). The weights then also
 *    carry `twistAxis` and `twistPivot` (the rig's pronation axis and radial-head pivot, rest mm). twist 'chain' (U3a,
 *    TWIST_SKIN_CHAIN): the radius influence moves onto the quarter-turn chain instead: a forearm-only vertex blends the
 *    two neighbouring FOREARM_TWIST_CHAIN frames (weights by f); a forearm + other vertex (elbow region, where f is 0 by
 *    construction) takes the nearest twist frame; no `tf`. twist false: no pass. Counts are returned in `twist`.
 * Returns exactly two convex influences per vertex: { i0, i1 (Uint8Array), w0, w1 (Float32Array) }, w0 + w1 = 1,
 * w0 >= w1 >= 0; i0 is the dominant influence. Candidates restrict the segments considered (default SKIN_CANDIDATES, the
 * pre-U3a 18). `power`,
 * `meetBoost` and `meetCap` default to SKIN_POWER, SKIN_MEET_BOOST and SKIN_MEET_CAP (optional diagnostic knobs; the
 * scene uses the defaults).
 *
 * LIMITS: geometry-only linear blend skinning from distances to bone axis lines. There is no muscle volume, contraction
 * or shortening model, no force, no tendon sheath/pulley/wrapping or sliding, no attachment constraint beyond proximity
 * to bones, and linear blending still thins tissue on the inside of strongly flexed joints. Not calibrated to any
 * recorded contraction or motion.
 */
export function skinWeights(rig, positions, { candidates = SKIN_CANDIDATES, power = SKIN_POWER, meetBoost = SKIN_MEET_BOOST, meetCap = SKIN_MEET_CAP, twist = true, shoulder = false } = {}) {
  checkRig(rig);
  const n = checkPositions(positions, 'positions');
  if (!candidates || typeof candidates.length !== 'number' || candidates.length === 0) fail('rig_segment', 'candidates must list at least one segment');
  if (!(Number.isFinite(power) && power > 0) || !(Number.isFinite(meetBoost) && meetBoost >= 1) || !(Number.isFinite(meetCap) && meetCap >= 1)) {
    fail('rig_input', 'power must be positive; meetBoost and meetCap must be >= 1');
  }
  const lineSet = rig.skinLines || Object.fromEntries(Object.entries(rig.lines).map(([k, l]) => [k, [l]]));
  const segs = [];
  const allowed = new Uint8Array(SEG_N);
  for (const name of candidates) {
    const i = segmentIndex(name);
    if (allowed[i]) continue;
    allowed[i] = 1;
    segs.push({ i, lines: lineSet[name].map(([a, b]) => { const ab = sub(b, a); return { a, ab, abab: dot(ab, ab) }; }) });
  }
  const i0 = new Uint8Array(n), i1 = new Uint8Array(n), w0 = new Float32Array(n), w1 = new Float32Array(n);
  const soft2 = SKIN_SOFTEN_MM * SKIN_SOFTEN_MM, half = power / 2;
  const sq = new Float64Array(SEG_N), a = new Float64Array(SEG_N), b = new Float64Array(SEG_N);
  const order = [];
  const TOP = 6;
  const F = SEGMENTS.indexOf('forearm');
  const mode = twist === true || twist === 'continuous' ? 'continuous' : twist === 'chain' ? 'chain' : twist === false || twist === null ? null : fail('rig_input', "twist must be 'continuous', 'chain', true or false");
  const tw = mode && allowed[F] && rig.twist ? rig.twist : null;
  const chainK = tw && mode === 'chain' ? (tw.chain || TWIST_SKIN_CHAIN) : null;
  const tf = tw && mode === 'continuous' ? new Float32Array(n) : null;
  const U = TWIST_IDX[0];
  const twistStats = { mode: tw ? mode : null, chain: 0, handKept: 0, nearest: 0, maxNearestError: 0, continuous: 0, fullTurn: 0 };
  // R558 shoulder skin (SHOULDER_SKIN): the place of each upper-arm vertex along the humeral axis; 1 = the humerus frame.
  const UP = SEGMENTS.indexOf('upperarm');
  const sf = shoulder && tf && allowed[UP] ? new Float32Array(n).fill(1) : null;
  const shS = rig.pivots.shoulder, shU = sf ? normalize(sub(rig.pivots.elbow, shS)) : null;
  const shLen = SHOULDER_SKIN.twistMm - SHOULDER_SKIN.s0Mm;
  let shoulderCount = 0;
  for (let v = 0; v < n; v++) {
    const px = positions[3 * v], py = positions[3 * v + 1], pz = positions[3 * v + 2];
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) fail('rig_input', 'non-finite muscle vertex');
    let bMin = Infinity;
    for (const s of segs) {
      let best = Infinity;
      for (const l of s.lines) {
        const dx = px - l.a[0], dy = py - l.a[1], dz = pz - l.a[2];
        let t = l.abab > 1e-12 ? (dx * l.ab[0] + dy * l.ab[1] + dz * l.ab[2]) / l.abab : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = dx - t * l.ab[0], ey = dy - t * l.ab[1], ez = dz - t * l.ab[2];
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < best) best = d2;
      }
      sq[s.i] = best + soft2;
      if (sq[s.i] < bMin) bMin = sq[s.i];
    }
    // affinities relative to the strongest (= 1): (D_min / D_s)^power
    order.length = 0;
    for (const s of segs) { a[s.i] = Math.pow(bMin / sq[s.i], half); b[s.i] = a[s.i]; order.push(s.i); }
    order.sort((x, y) => a[y] - a[x]);
    const top = Math.min(TOP, order.length);
    for (let p = 0; p < top; p++) for (let q = p + 1; q < top; q++) {
      const A = order[p], B = order[q];
      if (ADJACENT[A * SEG_N + B]) continue;
      const m = MEET[A * SEG_N + B];
      if (m < 0 || !allowed[m]) continue;
      const boost = Math.min(meetBoost * a[B], meetCap * a[m]);
      if (boost > b[m]) b[m] = boost;
    }
    let t1 = -1, t2 = -1, b1 = -1, b2 = -1, b3 = 0;
    for (const s of segs) {
      const x = b[s.i];
      if (x > b1) { b3 = b2 < 0 ? 0 : b2; b2 = b1; t2 = t1; b1 = x; t1 = s.i; }
      else if (x > b2) { b3 = b2 < 0 ? 0 : b2; b2 = x; t2 = s.i; }
      else if (x > b3) b3 = x;
    }
    const q1 = b1 - b3, q2 = t2 < 0 ? 0 : b2 - b3;
    const m = q1 + q2 > 1e-12 ? q2 / (q1 + q2) : 0;
    // continuous ramp of the minor weight: 0 below the cutoff, unchanged symmetric point at 0.5
    const wm = m <= SKIN_MINOR_CUTOFF ? 0 : Math.min(0.5, (0.5 * (m - SKIN_MINOR_CUTOFF)) / (0.5 - SKIN_MINOR_CUTOFF));
    let a0 = t1, a1 = t1, ww0 = 1, ww1 = 0;
    if (wm > 0) { a1 = t2; ww1 = wm; ww0 = 1 - wm; }
    if (tf && (a0 === F || (ww1 > 0 && a1 === F))) {
      // R558 continuous twist: the radius influence -> the ulna frame turned by this vertex's own fraction.
      const other = a0 === F ? (ww1 > 0 ? a1 : -1) : a0;
      if (other >= 0 && HAND_MASK[other]) twistStats.handKept++;
      else {
        const f = forearmTwistFraction(rig, [px, py, pz]);
        if (f >= 1 - 1e-6) twistStats.fullTurn++;
        else {
          if (a0 === F) a0 = U; else a1 = U;
          if (other < 0) a1 = a0;
          tf[v] = f <= 1e-6 ? 0 : f;
          twistStats.continuous++;
        }
      }
    } else if (tw && (a0 === F || (ww1 > 0 && a1 === F))) {
      const f = forearmTwistFraction(rig, [px, py, pz], chainK);
      const other = a0 === F ? (ww1 > 0 ? a1 : -1) : a0;
      if (other < 0) {
        const x = 4 * f, k = Math.min(3, Math.floor(x)), fr = x - k;
        const lo = TWIST_IDX[k], hi = TWIST_IDX[k + 1];
        if (fr <= 1e-6) { a0 = a1 = lo; ww0 = 1; ww1 = 0; }
        else if (fr >= 1 - 1e-6) { a0 = a1 = hi; ww0 = 1; ww1 = 0; }
        else if (fr <= 0.5) { a0 = lo; a1 = hi; ww0 = 1 - fr; ww1 = fr; }
        else { a0 = hi; a1 = lo; ww0 = fr; ww1 = 1 - fr; }
        twistStats.chain++;
      } else {
        let lvl;
        if (HAND_MASK[other]) { lvl = F; twistStats.handKept++; }
        else {
          const k = Math.round(4 * f);
          lvl = TWIST_IDX[k];
          twistStats.nearest++;
          twistStats.maxNearestError = Math.max(twistStats.maxNearestError, Math.abs(f - k / 4));
        }
        if (a0 === F) a0 = lvl; else a1 = lvl;
      }
    }
    if (sf && (a0 === UP || (ww1 > 0 && a1 === UP)) && !(tf[v] > 0)) { // a turned ulna influence keeps its two table entries
      const s = (px - shS[0]) * shU[0] + (py - shS[1]) * shU[1] + (pz - shS[2]) * shU[2];
      if (s < SHOULDER_SKIN.twistMm) { sf[v] = s <= SHOULDER_SKIN.s0Mm ? 0 : (s - SHOULDER_SKIN.s0Mm) / shLen; shoulderCount++; }
    }
    i0[v] = a0; i1[v] = a1; w0[v] = ww0; w1[v] = ww1;
  }
  if (tf) {
    const out = { i0, i1, w0, w1, tf, twistAxis: rig.axes.forearm_pronation, twistPivot: rig.pivots.radialHead, twist: twistStats };
    if (shoulderCount > 0) { out.sf = sf; out.shoulderPivot = shS; out.shoulderAxis = shU; out.shoulder = { vertices: shoulderCount }; }
    return out;
  }
  return { i0, i1, w0, w1, twist: twistStats };
}

/* R558: the per-pose table of twisted ulna frames for continuous twist weights. The pronation turn is read from the
 * pose itself: forearm_tw2 = ulna x R(turn / 2) about the rest axis (forwardKinematics), so the signed half turn is the
 * angle of ulna^-1 x forearm_tw2 about the axis (well conditioned for any turn within +-360 deg). Entry k (0..STEPS) is
 * ulna x R(k / STEPS x turn) about the axis through the pivot, as 12 numbers (3x3 column-major, then translation); a
 * twisted influence blends the two entries around its fraction. Cached per matrices Map (one build per pose). */
const TWIST_TABLES = new WeakMap();
export function twistTable(matrices, axis, pivot) {
  if (!(matrices instanceof Map)) fail('rig_skin', 'matrices must be a Map(segment -> matrix)');
  const hit = TWIST_TABLES.get(matrices);
  if (hit && hit.axis === axis && hit.pivot === pivot) return hit.table;
  const Um = matrices.get('ulna'), H = matrices.get('forearm_tw2');
  if (!Um || !H) fail('rig_skin', 'continuous twist weights need the ulna and forearm_tw2 matrices');
  if (!axis || axis.length !== 3 || !pivot || pivot.length !== 3) fail('rig_skin', 'continuous twist weights need twistAxis and twistPivot');
  // 3x3 parts: Rh = U^-1 H (U is a similarity: rotation x uniform scale, possibly mirrored)
  const a = Um[0], b = Um[4], c = Um[8], d = Um[1], e = Um[5], f = Um[9], g = Um[2], h = Um[6], i = Um[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-30)) fail('rig_skin', 'singular ulna matrix');
  const inv = [A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det]; // column-major
  const R = new Float64Array(9); // row-major Rh[row][col]
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) R[3 * r + q] = inv[r] * H[4 * q] + inv[3 + r] * H[4 * q + 1] + inv[6 + r] * H[4 * q + 2];
  const cosA = (R[0] + R[4] + R[8] - 1) / 2;
  const sinA = ((R[7] - R[5]) * axis[0] + (R[2] - R[6]) * axis[1] + (R[3] - R[1]) * axis[2]) / 2;
  const turn = 2 * Math.atan2(sinA, cosA);
  const K = TWIST_TABLE_STEPS, table = new Float64Array(12 * (K + 1));
  const [x, y, z] = axis;
  for (let k = 0; k <= K; k++) {
    const th = (k / K) * turn, co = Math.cos(th), si = Math.sin(th), t1 = 1 - co;
    // rotation about the axis (column-major 3x3) and its translation pivot - R pivot
    const r0 = t1 * x * x + co, r1 = t1 * x * y + si * z, r2 = t1 * x * z - si * y;
    const r3 = t1 * x * y - si * z, r4 = t1 * y * y + co, r5 = t1 * y * z + si * x;
    const r6 = t1 * x * z + si * y, r7 = t1 * y * z - si * x, r8 = t1 * z * z + co;
    const tx = pivot[0] - (r0 * pivot[0] + r3 * pivot[1] + r6 * pivot[2]);
    const ty = pivot[1] - (r1 * pivot[0] + r4 * pivot[1] + r7 * pivot[2]);
    const tz = pivot[2] - (r2 * pivot[0] + r5 * pivot[1] + r8 * pivot[2]);
    const o = 12 * k;
    for (let col = 0; col < 3; col++) {
      const cx = col === 0 ? r0 : col === 1 ? r3 : r6, cy = col === 0 ? r1 : col === 1 ? r4 : r7, cz = col === 0 ? r2 : col === 1 ? r5 : r8;
      table[o + 3 * col] = Um[0] * cx + Um[4] * cy + Um[8] * cz;
      table[o + 3 * col + 1] = Um[1] * cx + Um[5] * cy + Um[9] * cz;
      table[o + 3 * col + 2] = Um[2] * cx + Um[6] * cy + Um[10] * cz;
    }
    table[o + 9] = Um[0] * tx + Um[4] * ty + Um[8] * tz + Um[12];
    table[o + 10] = Um[1] * tx + Um[5] * ty + Um[9] * tz + Um[13];
    table[o + 11] = Um[2] * tx + Um[6] * ty + Um[10] * tz + Um[14];
  }
  TWIST_TABLES.set(matrices, { axis, pivot, table, turn });
  return table;
}

/* R558 (per-frame cost): continuous twist weights skinned as a flat blend of at most three 12-number maps: the
 * SEGMENTS frames (slots 0..21) and the twist table entries (slots 22..22+STEPS). A twisted ulna influence of weight w
 * and fraction f becomes the two table entries around f with weights w (1 - fr) and w fr; the plan depends only on the
 * weights (made once per weights object), the maps once per pose (cached with the table). */
const TWIST_SLOT0 = SEGMENTS.length;
/** R558 shoulder skin: the slots after the twist table hold the pose's shoulder frames (shoulderFrames), entry k for the
 * place k / STEPS along the zone; an upper-arm influence with sf < 1 blends the two entries around its place. */
const SHOULDER_SLOT0 = TWIST_SLOT0 + TWIST_TABLE_STEPS + 1;
const UPPERARM_IDX = SEGMENTS.indexOf('upperarm');
const SKIN_PLANS = new WeakMap(), POSE_MAPS = new WeakMap();
export function twistSkinPlan(weights, n) {
  let p = SKIN_PLANS.get(weights);
  if (p && p.n === n) return p;
  const { i0, i1, w0, w1, tf } = weights, slots = new Uint8Array(3 * n), wts = new Float32Array(3 * n), K = TWIST_TABLE_STEPS;
  const sf = weights.sf && weights.sf.length >= n ? weights.sf : null;
  let shoulder = false;
  for (let v = 0; v < n; v++) {
    let m = 3 * v;
    const sum = w1[v] > 0 ? w0[v] + w1[v] : w0[v];
    const put = (seg, w) => {
      if (!(w > 0)) return;
      if (seg === ULNA_IDX && tf[v] > 0) {
        const x = tf[v] * K, k = x >= K ? K - 1 : Math.floor(x), fr = x - k;
        slots[m] = TWIST_SLOT0 + k; wts[m++] = w * (1 - fr);
        slots[m] = TWIST_SLOT0 + k + 1; wts[m++] = w * fr;
      } else if (seg === UPPERARM_IDX && sf && sf[v] < 1) {
        const x = Math.max(0, sf[v]) * K, k = x >= K ? K - 1 : Math.floor(x), fr = x - k;
        slots[m] = SHOULDER_SLOT0 + k; wts[m++] = w * (1 - fr);
        slots[m] = SHOULDER_SLOT0 + k + 1; wts[m++] = w * fr;
        shoulder = true;
      } else { slots[m] = seg; wts[m++] = w; }
    };
    if (w1[v] > 0 && i1[v] === i0[v]) put(i0[v], 1);
    else { put(i0[v], w0[v] / sum); if (w1[v] > 0) put(i1[v], w1[v] / sum); }
    if (m - 3 * v > 3) fail('rig_skin', 'a vertex has two twisted influences');
  }
  const used = new Uint8Array(TWIST_SLOT0);
  for (let q = 0; q < slots.length; q++) if (wts[q] > 0 && slots[q] < TWIST_SLOT0) used[slots[q]] = 1;
  if (shoulder) used[UPPERARM_IDX] = 1; // the shoulder frames are built from the upper-arm matrix
  p = { n, slots, weights: wts, used, shoulder };
  SKIN_PLANS.set(weights, p);
  return p;
}

/**
 * R558: the pose's shoulder frames (SHOULDER_SKIN), written into `maps` as STEPS + 1 twelve-number maps from `offset`.
 * Rrel = chest^-1 x upperarm (3x3, scales divided out) is split into swing x turn: the swing is the shortest rotation
 * that takes the rest humeral axis `axis` to its posed direction, the turn is the rest, a rotation about `axis`. Entry k
 * (place x = k / STEPS, s = s0Mm + x (twistMm - s0Mm)) is chest x swing(a) x turn(b), a = smoothstep((s - s0Mm) /
 * (swingMm - s0Mm)) of the swing angle and b = smoothstep(x) of the turn angle (both 1 - fade x (1 - smoothstep) once
 * the swing is past fadeDeg[0]), and it keeps the joint centre `pivot` where the pose has it (blended by a from the
 * chest's to the upper arm's, which are the same point in the game). The last entry is the upper-arm matrix itself.
 * Without a 'chest' matrix, with a mirrored or degenerate frame, or past fadeDeg[1] of swing, every entry is the
 * upper-arm matrix (the rigid skin from before).
 * @returns { swingDeg, turnDeg, fade } (null values when the rigid fallback was used).
 */
export function shoulderFrames(matrices, axis, pivot, maps, offset = 0) {
  if (!(matrices instanceof Map)) fail('rig_skin', 'matrices must be a Map(segment -> matrix)');
  if (!axis || axis.length !== 3 || !pivot || pivot.length !== 3) fail('rig_skin', 'shoulder skin weights need shoulderAxis and shoulderPivot');
  const K = TWIST_TABLE_STEPS, Um = matrices.get('upperarm'), C = matrices.get('chest');
  if (!Um) fail('rig_skin', 'shoulder skin weights need the upperarm matrix');
  const up = [Um[0], Um[1], Um[2], Um[4], Um[5], Um[6], Um[8], Um[9], Um[10], Um[12], Um[13], Um[14]];
  const rigid = () => { for (let k = 0; k <= K; k++) for (let j = 0; j < 12; j++) maps[offset + 12 * k + j] = up[j]; return { swingDeg: null, turnDeg: null, fade: 0 }; };
  if (!C || C.length !== 16) return rigid();
  const su = Math.hypot(Um[0], Um[1], Um[2]), sc = Math.hypot(C[0], C[1], C[2]);
  if (!(su > 1e-12) || !(sc > 1e-12)) return rigid();
  // Rrel (row-major): column i of the chest's rotation . column j of the upper arm's
  const R = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[3 * i + j] = (C[4 * i] * Um[4 * j] + C[4 * i + 1] * Um[4 * j + 1] + C[4 * i + 2] * Um[4 * j + 2]) / (sc * su);
  const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
  if (!(Math.abs(det - 1) < 1e-3)) return rigid();
  const [ax, ay, az] = axis;
  const dx = R[0] * ax + R[1] * ay + R[2] * az, dy = R[3] * ax + R[4] * ay + R[5] * az, dz = R[6] * ax + R[7] * ay + R[8] * az;
  let nx = ay * dz - az * dy, ny = az * dx - ax * dz, nz = ax * dy - ay * dx;
  const sn = Math.hypot(nx, ny, nz), theta = Math.atan2(sn, ax * dx + ay * dy + az * dz);
  const fade = 1 - smoothstep((theta / DEG - SHOULDER_SKIN.fadeDeg[0]) / (SHOULDER_SKIN.fadeDeg[1] - SHOULDER_SKIN.fadeDeg[0]));
  if (!(fade > 0)) return rigid();
  if (sn > 1e-9) { nx /= sn; ny /= sn; nz /= sn; } else { nx = ny = nz = 0; } // no swing: the axis is not used
  // rotation about a unit axis (row-major 3x3)
  const rot = (x, y, z, th) => {
    const co = Math.cos(th), si = Math.sin(th), t = 1 - co;
    return [t * x * x + co, t * x * y - si * z, t * x * z + si * y, t * x * y + si * z, t * y * y + co, t * y * z - si * x, t * x * z - si * y, t * y * z + si * x, t * z * z + co];
  };
  const mul3 = (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]; return o; };
  // the turn about the axis: swing^-1 x Rrel
  const S = sn > 1e-9 ? rot(nx, ny, nz, theta) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const St = [S[0], S[3], S[6], S[1], S[4], S[7], S[2], S[5], S[8]], T = mul3(St, R);
  const tau = Math.atan2(((T[7] - T[5]) * ax + (T[2] - T[6]) * ay + (T[3] - T[1]) * az) / 2, (T[0] + T[4] + T[8] - 1) / 2);
  // the joint centre in the pose, by the chest and by the upper arm
  const pc = [C[0] * pivot[0] + C[4] * pivot[1] + C[8] * pivot[2] + C[12], C[1] * pivot[0] + C[5] * pivot[1] + C[9] * pivot[2] + C[13], C[2] * pivot[0] + C[6] * pivot[1] + C[10] * pivot[2] + C[14]];
  const pu = [Um[0] * pivot[0] + Um[4] * pivot[1] + Um[8] * pivot[2] + Um[12], Um[1] * pivot[0] + Um[5] * pivot[1] + Um[9] * pivot[2] + Um[13], Um[2] * pivot[0] + Um[6] * pivot[1] + Um[10] * pivot[2] + Um[14]];
  const swingZone = (SHOULDER_SKIN.swingMm - SHOULDER_SKIN.s0Mm) / (SHOULDER_SKIN.twistMm - SHOULDER_SKIN.s0Mm);
  const g = su / sc;
  for (let k = 0; k < K; k++) {
    const x = k / K;
    const a = 1 - fade * (1 - smoothstep(x / swingZone)), b = 1 - fade * (1 - smoothstep(x));
    const M = mul3(sn > 1e-9 ? rot(nx, ny, nz, a * theta) : S, rot(ax, ay, az, b * tau)); // row-major, rest -> chest frame
    const o = offset + 12 * k;
    for (let j = 0; j < 3; j++) { // column j of chest3 x M, at the upper arm's scale
      const m0 = M[j], m1 = M[3 + j], m2 = M[6 + j];
      maps[o + 3 * j] = g * (C[0] * m0 + C[4] * m1 + C[8] * m2);
      maps[o + 3 * j + 1] = g * (C[1] * m0 + C[5] * m1 + C[9] * m2);
      maps[o + 3 * j + 2] = g * (C[2] * m0 + C[6] * m1 + C[10] * m2);
    }
    for (let r = 0; r < 3; r++) {
      maps[o + 9 + r] = pc[r] + a * (pu[r] - pc[r]) - (maps[o + r] * pivot[0] + maps[o + 3 + r] * pivot[1] + maps[o + 6 + r] * pivot[2]);
    }
  }
  for (let j = 0; j < 12; j++) maps[offset + 12 * K + j] = up[j];
  return { swingDeg: theta / DEG, turnDeg: tau / DEG, fade };
}

export function twistPoseMaps(matrices, weights) {
  const table = twistTable(matrices, weights.twistAxis, weights.twistPivot);
  let hit = POSE_MAPS.get(matrices);
  if (!hit || hit.table !== table) {
    const maps = new Float64Array(12 * (SHOULDER_SLOT0 + TWIST_TABLE_STEPS + 1));
    maps.missing = new Uint8Array(TWIST_SLOT0);
    for (let s = 0; s < TWIST_SLOT0; s++) {
      const m = matrices.get(SEGMENTS[s]);
      if (!m) { maps.missing[s] = 1; continue; } // refused in twistMapsFor if a vertex uses it
      const o = 12 * s;
      maps[o] = m[0]; maps[o + 1] = m[1]; maps[o + 2] = m[2]; maps[o + 3] = m[4]; maps[o + 4] = m[5]; maps[o + 5] = m[6];
      maps[o + 6] = m[8]; maps[o + 7] = m[9]; maps[o + 8] = m[10]; maps[o + 9] = m[12]; maps[o + 10] = m[13]; maps[o + 11] = m[14];
    }
    maps.set(table, 12 * TWIST_SLOT0);
    hit = { table, maps, shoulderPivot: null, shoulder: null };
    POSE_MAPS.set(matrices, hit);
  }
  // The shoulder frames are filled when the first weights that use them are skinned in this pose (the maps are shared
  // by every muscle of the pose, and most muscles have no shoulder vertex).
  if (weights.sf && hit.shoulderPivot !== weights.shoulderPivot && !hit.maps.missing[UPPERARM_IDX]) {
    hit.shoulder = shoulderFrames(matrices, weights.shoulderAxis, weights.shoulderPivot, hit.maps, 12 * SHOULDER_SLOT0);
    hit.shoulderPivot = weights.shoulderPivot;
  }
  return hit.maps;
}
/** The plan and the pose maps of continuous twist weights for n vertices; refuses a pose that lacks a matrix the
 * weights use (as the plain path does). */
export function twistMapsFor(matrices, weights, n) {
  const plan = twistSkinPlan(weights, n), maps = twistPoseMaps(matrices, weights);
  for (let s = 0; s < TWIST_SLOT0; s++) if (plan.used[s] && maps.missing[s]) fail('rig_skin', `missing matrix for segment index ${s}`);
  return { plan, maps };
}

/** The 12-number affine map (3x3 column-major, translation) of influence segment index `seg` for a vertex with twist
 * fraction f into `dst`: the twisted ulna frame (table blend) when seg is the ulna and f > 0, else the segment matrix. */
const ULNA_IDX = SEGMENTS.indexOf('ulna');
export function influenceMap(mats, table, seg, f, dst) {
  if (table && seg === ULNA_IDX && f > 0) {
    const x = f * TWIST_TABLE_STEPS, k = x >= TWIST_TABLE_STEPS ? TWIST_TABLE_STEPS - 1 : Math.floor(x), fr = x - k, o = 12 * k;
    for (let j = 0; j < 12; j++) dst[j] = table[o + j] + fr * (table[o + 12 + j] - table[o + j]);
    return dst;
  }
  const m = mats[seg];
  if (!m) fail('rig_skin', `missing matrix for segment index ${seg}`);
  dst[0] = m[0]; dst[1] = m[1]; dst[2] = m[2]; dst[3] = m[4]; dst[4] = m[5]; dst[5] = m[6];
  dst[6] = m[8]; dst[7] = m[9]; dst[8] = m[10]; dst[9] = m[12]; dst[10] = m[13]; dst[11] = m[14];
  return dst;
}

/** Rigid single weights for a bone mesh: every vertex follows `segment` with weight 1. */
export function boneWeights(segment, vertexCount) {
  const k = segmentIndex(segment);
  if (!Number.isInteger(vertexCount) || vertexCount < 0) fail('rig_input', 'vertexCount must be a non-negative integer');
  return {
    i0: new Uint8Array(vertexCount).fill(k),
    i1: new Uint8Array(vertexCount).fill(k),
    w0: new Float32Array(vertexCount).fill(1),
    w1: new Float32Array(vertexCount)
  };
}

/** Linear blend skinning of rest positions (mm) into `out` (Float32Array, camera metres). Returns out. Weights with a
 * continuous twist (`tf`, skinWeights twist 'continuous') turn their ulna influence by tf[v] of the pose's pronation turn
 * (twistTable); weights without `tf` are skinned exactly as before. */
export function skinApply(matrices, weights, restPositions, out) {
  if (!(matrices instanceof Map)) fail('rig_skin', 'matrices must be a Map(segment -> matrix)');
  const n = checkPositions(restPositions, 'restPositions');
  const { i0, i1, w0, w1 } = weights || {};
  if (!i0 || !i1 || !w0 || !w1 || i0.length < n || i1.length < n || w0.length < n || w1.length < n) {
    fail('rig_skin', 'weights must provide i0, i1, w0, w1 for every vertex');
  }
  if (out === undefined) out = new Float32Array(restPositions.length);
  else if (!out || out.length !== restPositions.length) fail('rig_skin', 'out must match restPositions length');
  const mats = SEGMENTS.map(s => matrices.get(s) || null);
  if (weights.tf) {
    if (weights.tf.length < n) fail('rig_skin', 'weights.tf must cover every vertex');
    const { plan, maps } = twistMapsFor(matrices, weights, n), I = plan.slots, W = plan.weights;
    for (let v = 0, k = 0, q = 0; v < n; v++, k += 3, q += 3) {
      const x = restPositions[k], y = restPositions[k + 1], z = restPositions[k + 2];
      const a = 12 * I[q], b = 12 * I[q + 1], c = 12 * I[q + 2], wa = W[q], wb = W[q + 1], wc = W[q + 2];
      out[k] = wa * (maps[a] * x + maps[a + 3] * y + maps[a + 6] * z + maps[a + 9]) + wb * (maps[b] * x + maps[b + 3] * y + maps[b + 6] * z + maps[b + 9]) + wc * (maps[c] * x + maps[c + 3] * y + maps[c + 6] * z + maps[c + 9]);
      out[k + 1] = wa * (maps[a + 1] * x + maps[a + 4] * y + maps[a + 7] * z + maps[a + 10]) + wb * (maps[b + 1] * x + maps[b + 4] * y + maps[b + 7] * z + maps[b + 10]) + wc * (maps[c + 1] * x + maps[c + 4] * y + maps[c + 7] * z + maps[c + 10]);
      out[k + 2] = wa * (maps[a + 2] * x + maps[a + 5] * y + maps[a + 8] * z + maps[a + 11]) + wb * (maps[b + 2] * x + maps[b + 5] * y + maps[b + 8] * z + maps[b + 11]) + wc * (maps[c + 2] * x + maps[c + 5] * y + maps[c + 8] * z + maps[c + 11]);
    }
    return out;
  }
  for (let v = 0; v < n; v++) {
    const k = 3 * v;
    const x = restPositions[k], y = restPositions[k + 1], z = restPositions[k + 2];
    const ma = mats[i0[v]];
    if (!ma) fail('rig_skin', `missing matrix for segment index ${i0[v]}`);
    let ox = ma[0] * x + ma[4] * y + ma[8] * z + ma[12];
    let oy = ma[1] * x + ma[5] * y + ma[9] * z + ma[13];
    let oz = ma[2] * x + ma[6] * y + ma[10] * z + ma[14];
    const b = w1[v];
    if (b > 0) {
      const mb = mats[i1[v]];
      if (!mb) fail('rig_skin', `missing matrix for segment index ${i1[v]}`);
      const a = w0[v], sum = a + b;
      ox = (a * ox + b * (mb[0] * x + mb[4] * y + mb[8] * z + mb[12])) / sum;
      oy = (a * oy + b * (mb[1] * x + mb[5] * y + mb[9] * z + mb[13])) / sum;
      oz = (a * oz + b * (mb[2] * x + mb[6] * y + mb[10] * z + mb[14])) / sum;
    }
    out[k] = ox; out[k + 1] = oy; out[k + 2] = oz;
  }
  return out;
}
