// NeuroSurge full-body rigid rig (U3b-body, round 2, 2026-11-08). Shared interface 3.
//
// A pure module, importable in Node without a DOM. It turns the BodyParts3D full-body meshes
// (inputs/FULLBODY-MESH-MANIFEST.json, packet bodyparts3d-fullbody-r1) into rigid segments with joint pivots that are
// estimated from the bone geometry, poses them from the agreed non-left-arm joint ids (ns-bodymap JOINT_SEMANTICS), and
// maps simulated body-action drives onto muscle mesh ids through the BODY_MOTOR_MAP muscle names.
//
//   buildBodyRig(entries, meshesById, options?) -> rig { kind, segments, pivots, meshSegment, muscles, warnings, ... }
//   poseBody(rig, jointTargetsDeg, options?)     -> Map(meshId -> Float32Array(16) column-major, rest mm -> posed mm)
//   poseBodyDetailed(...)                        -> { matrices, segments, applied, clamped, ignored, nonFinite, face, anchor }
//   bodyMuscleDrives(activeActions, options?)    -> { muscleMeshId: 0..1 }   (bodyMuscleDriveReport adds diagnostics)
//   BODY_JOINT_LIMITS                            -> { jointId: [minDeg, maxDeg] }
//   bodySkinWeights / skinBodyPositions          -> optional two-influence CPU skinning of one muscle mesh
//
// Round 3 (R3-body, D4): the fixed first-person body SITS (BODY_POSTURES.seated = DEFAULT_BODY_POSTURE).
//   bakeBodyPosture(rig, meshesById, { posture, keep = 'skull' }) -> { meshesById (seated geometry for the scene), ... }
//   bodyPostureTargets(activeBodyActions, { posture })            -> absolute joint targets on top of the rest posture
//   poseBody(rig, targets, { baked })                             -> matrices relative to the baked geometry
//   bodyPostureAngles(posture), BODY_POSTURE_TEXT (plain words)
//   GENITAL_DENY_TERMS, genitalTermsIn, genitalAnatomyTerms, excludeGenitalAnatomy -> R15: never rig, pose, bake
//   or draw genital anatomy (buildBodyRig refuses such entries; none exist in the packets).
//
// Round 4 (R4-body):
//   - load time: the rig build and the bake share one exact nearest-neighbour index per bone cloud (bucket k-d tree,
//     warm start, repeated vertices answered once); the rig, and the baked bytes of any given posture, are exactly what
//     the round-3 search gave (unit test R4-body-bake); in Node the rig build takes about a quarter and the bake about a
//     fifth of their round-3 time.
//   - the seated right forearm rests forward as if on an armrest, so a far-right look shows the right hand after a
//     small downward look; BODY_POSTURE_LIMITS / bodyPostureLimits(posture) cap a seated thigh lift at 110 deg (so the
//     thigh does not pass into the belly) and the seated elbow bend at 120 deg (so the hand does not fill the view).
//
// Frame: the unchanged BodyParts3D 4.0 whole-body frame in millimetres (+x subject LEFT, +y POSTERIOR, +z SUPERIOR),
// the same frame as the left arm and the brain. Every matrix maps REST (source) coordinates to POSED coordinates in that
// frame. At zero targets every matrix is the identity: the source pose is the standard anatomical position.
//
// Method: bones are assigned to rigid segments (manifest rig_hint, plus the radius as its own pronating segment). Joint
// pivots come from the bone geometry: sphere fits of the femoral and humeral heads and of the digit heads (seeded from
// contact patches), circle fits of the femoral condyles and the humeral trochlea/capitulum about the transepicondylar
// direction, the malleolus tips for the talocrural axis, the capitate head for the wrist, the mandibular condyles for the
// jaw, and vertebral centroids for the lumped spinal stages. Each muscle vertex is weighted to its two nearest candidate
// segments (the tree path between its rig_hint attachments; inverse-square distance to voxel-downsampled bone points).
// Per pose a muscle gets the least-squares rigid matrix (Horn's quaternion method) that best matches those two-influence
// skinned sample vertices. Without meshes (deferred loading) the embedded reference values for this packet are used.
//
// Honesty: the segments, pivots, shares and limits are a coarse educational approximation of one reference body from
// an educational dataset (BodyParts3D warns of errors and artist-made parts). Pivots are geometric estimates, not
// measured joint centres. Bones move rigidly; a muscle gets one rigid matrix (or optional two-influence skin weights), so
// it slides over joints rather than deforming like real muscle. Muscle drives are simulated, unitless display values:
// not EMG, not force and not nerve activity.

import { BODY_MOTOR_MAP, muscleNameMatches } from './ns-bodymap.mjs';

// ---------------------------------------------------------------------------------------------------------------------
// Constants of the agreed interface

/** Agreed non-left-arm joint ids (shared interface 2). */
export const BODY_JOINT_IDS = Object.freeze([
  'hip_flex_L', 'hip_flex_R', 'knee_ext_L', 'knee_ext_R', 'ankle_dorsi_L', 'ankle_dorsi_R', 'toe_flex_L', 'toe_flex_R',
  'trunk_flex', 'neck_flex', 'neck_rot', 'jaw_open', 'brow_raise', 'eye_close', 'lip_purse', 'smile',
  'r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex', 'r_wrist_flex', 'r_wrist_ext', 'r_grasp', 'r_open', 'r_pronation'
]);

const lim = (lo, hi) => Object.freeze([lo, hi]);

/**
 * Rig limits in degrees from the source (anatomical) pose, using the sign conventions of ns-bodymap JOINT_SEMANTICS.
 * They are rounded, game-safe values inside commonly quoted adult active ranges of motion (for example hip flexion
 * about 120, knee flexion about 135, ankle dorsiflexion about 20 and plantarflexion about 50, elbow flexion about 145,
 * forearm pronation plus supination about 160). They are not measured on this reference body or on the player.
 * The four facial ids are display amplitudes (0..20), not joint rotations: no facial-expression muscle or soft tissue
 * exists in BodyParts3D 4.0, so ns-body moves no mesh for them (see faceDisplayLevels).
 */
export const BODY_JOINT_LIMITS = Object.freeze({
  hip_flex_L: lim(-20, 120), hip_flex_R: lim(-20, 120),
  knee_ext_L: lim(-135, 0), knee_ext_R: lim(-135, 0),
  ankle_dorsi_L: lim(-50, 20), ankle_dorsi_R: lim(-50, 20),
  toe_flex_L: lim(-60, 40), toe_flex_R: lim(-60, 40),
  trunk_flex: lim(-25, 60), neck_flex: lim(-45, 45), neck_rot: lim(-70, 70), jaw_open: lim(0, 30),
  brow_raise: lim(0, 20), eye_close: lim(0, 20), lip_purse: lim(0, 20), smile: lim(0, 20),
  r_shoulder_flex: lim(-45, 160), r_shoulder_abd: lim(0, 160), r_elbow_flex: lim(0, 145),
  r_wrist_flex: lim(0, 80), r_wrist_ext: lim(0, 70), r_grasp: lim(0, 90), r_open: lim(0, 30), r_pronation: lim(0, 160)
});

/** Facial display ids (no joint, no mesh) and their full display amplitude. */
export const FACE_DISPLAY_IDS = Object.freeze(['brow_raise', 'eye_close', 'lip_purse', 'smile']);
const FACE_FULL_DEG = 20;

/** How one agreed joint id is shared between rig joints (documented approximations, not measured kinematics). */
export const BODY_JOINT_SHARES = Object.freeze({
  trunk_flex: Object.freeze({ lumbosacral: 0.5, thoracolumbar: 0.5 }),
  neck_flex: Object.freeze({ cervicothoracic: 0.6, atlanto_occipital: 0.4 }),
  neck_rot: Object.freeze({ cervicothoracic: 0.5, atlanto_occipital: 0.5 }),
  // Net digit angle n = r_grasp - r_open (degrees). Flexion (n > 0) shares, extension (n < 0) shares, joint clamps.
  finger: Object.freeze({ mcp: [1.0, 1.0, -30, 90], pip: [1.1, 0.3, -10, 100], dip: [0.75, 0.3, -10, 80] }),
  thumb: Object.freeze({ cmc: [0.35, 0.5, -15, 35], mcp: [0.6, 0.3, -10, 55], ip: [0.8, 0.5, -15, 80] }),
  patellaPerKneeFlex: 0.7,
  jawGlideMmPerDeg: 0.25
});

/** Approximate scapulohumeral rhythm: above thresholdDeg of humeral elevation, `ratio` of the extra elevation is taken
 * by the shoulder girdle (clavicle + scapula rotating about the sternoclavicular joint), the rest by the glenohumeral
 * joint, so the total arm angle is unchanged. Textbook rhythm is nearer 2:1 overall; this is a deliberately mild,
 * display-only version for a rigid girdle. */
export const SCAPULOHUMERAL = Object.freeze({ thresholdDeg: 30, ratio: 0.2 });

/** Rigid segments, parents before children. Virtual segments have no bones in this packet. */
export const BODY_SEGMENTS = Object.freeze([
  'pelvis', 'lumbar', 'thorax', 'cervical', 'skull', 'mandible', 'hyoid',
  'r_girdle', 'r_upperarm', 'r_forearm', 'r_radius', 'r_hand',
  'r_thumb_mc', 'r_thumb_pp', 'r_thumb_dp',
  'r_index_pp', 'r_index_mp', 'r_index_dp', 'r_middle_pp', 'r_middle_mp', 'r_middle_dp',
  'r_ring_pp', 'r_ring_mp', 'r_ring_dp', 'r_little_pp', 'r_little_mp', 'r_little_dp',
  'l_girdle', 'l_upperarm',
  'r_thigh', 'r_patella', 'r_shank', 'r_foot', 'r_toes',
  'l_thigh', 'l_patella', 'l_shank', 'l_foot', 'l_toes'
]);

const FINGERS = Object.freeze(['index', 'middle', 'ring', 'little']);
const FINGER_MC = Object.freeze({ index: 'second', middle: 'third', ring: 'fourth', little: 'fifth' });
const TOES = Object.freeze([['first', 'big toe'], ['second', 'second toe'], ['third', 'third toe'], ['fourth', 'fourth toe'], ['fifth', 'little toe']]);

/** Parent segment of each segment (pelvis is the root). */
export const BODY_SEGMENT_PARENT = Object.freeze({
  pelvis: null, lumbar: 'pelvis', thorax: 'lumbar', cervical: 'thorax', skull: 'cervical', mandible: 'skull', hyoid: 'cervical',
  r_girdle: 'thorax', r_upperarm: 'r_girdle', r_forearm: 'r_upperarm', r_radius: 'r_forearm', r_hand: 'r_radius',
  r_thumb_mc: 'r_hand', r_thumb_pp: 'r_thumb_mc', r_thumb_dp: 'r_thumb_pp',
  ...Object.fromEntries(FINGERS.flatMap(f => [[`r_${f}_pp`, 'r_hand'], [`r_${f}_mp`, `r_${f}_pp`], [`r_${f}_dp`, `r_${f}_mp`]])),
  l_girdle: 'thorax', l_upperarm: 'l_girdle',
  r_thigh: 'pelvis', r_patella: 'r_thigh', r_shank: 'r_thigh', r_foot: 'r_shank', r_toes: 'r_foot',
  l_thigh: 'pelvis', l_patella: 'l_thigh', l_shank: 'l_thigh', l_foot: 'l_shank', l_toes: 'l_foot'
});

/** Segments with no bone in bodyparts3d-fullbody-r1: the left shoulder girdle and humerus belong to the left-arm rig
 * (MESH-MANIFEST.json). Here they only carry the left pectoralis/trapezius/serratus attachments; by default they ride
 * the thorax, and poseBody options.external can substitute the left-arm rig's matrices. */
export const VIRTUAL_SEGMENTS = Object.freeze(['l_girdle', 'l_upperarm']);

/** The rig joint that moves each non-root segment. */
export const BODY_SEGMENT_JOINT = Object.freeze({
  lumbar: 'lumbosacral', thorax: 'thoracolumbar', cervical: 'cervicothoracic', skull: 'atlanto_occipital', mandible: 'tmj',
  hyoid: 'hyoid_fixed', r_girdle: 'r_sternoclavicular', r_upperarm: 'r_glenohumeral', r_forearm: 'r_elbow',
  r_radius: 'r_radioulnar', r_hand: 'r_wrist', r_thumb_mc: 'r_thumb_cmc', r_thumb_pp: 'r_thumb_mcp', r_thumb_dp: 'r_thumb_ip',
  ...Object.fromEntries(FINGERS.flatMap(f => [[`r_${f}_pp`, `r_${f}_mcp`], [`r_${f}_mp`, `r_${f}_pip`], [`r_${f}_dp`, `r_${f}_dip`]])),
  l_girdle: 'l_sternoclavicular_mirror', l_upperarm: 'l_glenohumeral_mirror',
  r_thigh: 'r_hip', r_patella: 'r_patellofemoral', r_shank: 'r_knee', r_foot: 'r_ankle', r_toes: 'r_mtp',
  l_thigh: 'l_hip', l_patella: 'l_patellofemoral', l_shank: 'l_knee', l_foot: 'l_ankle', l_toes: 'l_mtp'
});

const SEG_INDEX = new Map(BODY_SEGMENTS.map((s, i) => [s, i]));

// ---------------------------------------------------------------------------------------------------------------------
// Small vector / matrix helpers (self-contained so this module does not depend on files other owners are editing)

const DEG = Math.PI / 180;
const UP = [0, 0, 1], DOWN = [0, 0, -1], ANT = [0, -1, 0], POST = [0, 1, 0], LEFTX = [1, 0, 0], RIGHTX = [-1, 0, 0];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const mirrorX = p => [-p[0], p[1], p[2]];
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const round3 = v => v.map(x => Math.round(x * 1000) / 1000 + 0);
/** Round every finite number in a JSON-like value to 0.001 (keeps evidence records compact and -0 free). */
function roundDeep(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 + 0 : v;
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)]));
  return v;
}
function norm(a) {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
/** n with its component along unit d removed, normalised. */
const perp = (n, d) => norm(sub(n, scl(d, dot(n, d))));

function m4I() {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
function m4Mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
/** Rotation by `deg` (right-hand rule) about unit `axis` through `pivot`. */
function m4RotAbout(axis, deg, pivot) {
  const m = m4I();
  if (!deg) return m;
  const t = deg * DEG, c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  const [x, y, z] = axis;
  m[0] = c + x * x * k; m[1] = y * x * k + z * s; m[2] = z * x * k - y * s;
  m[4] = x * y * k - z * s; m[5] = c + y * y * k; m[6] = z * y * k + x * s;
  m[8] = x * z * k + y * s; m[9] = y * z * k - x * s; m[10] = c + z * z * k;
  const rp = [m[0] * pivot[0] + m[4] * pivot[1] + m[8] * pivot[2], m[1] * pivot[0] + m[5] * pivot[1] + m[9] * pivot[2], m[2] * pivot[0] + m[6] * pivot[1] + m[10] * pivot[2]];
  m[12] = pivot[0] - rp[0]; m[13] = pivot[1] - rp[1]; m[14] = pivot[2] - rp[2];
  return m;
}
function m4Trans(v) {
  const m = m4I();
  m[12] = v[0]; m[13] = v[1]; m[14] = v[2];
  return m;
}
/** Inverse of a rigid matrix (rotation + translation). */
function m4RigidInv(m) {
  const o = new Float64Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8];
  o[4] = m[1]; o[5] = m[5]; o[6] = m[9];
  o[8] = m[2]; o[9] = m[6]; o[10] = m[10];
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]);
  o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]);
  o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
  o[15] = 1;
  return o;
}
const m4Point = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
];
const m4Dir = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];

/** Unit quaternion [x, y, z, w] of the rotation part of m (Shepperd's method). */
function quatOf(m) {
  const a = m[0], b = m[5], c = m[10], tr = a + b + c;
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (m[6] - m[9]) / s; y = (m[8] - m[2]) / s; z = (m[1] - m[4]) / s;
  } else if (a > b && a > c) {
    const s = Math.sqrt(1 + a - b - c) * 2;
    w = (m[6] - m[9]) / s; x = 0.25 * s; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s;
  } else if (b > c) {
    const s = Math.sqrt(1 + b - a - c) * 2;
    w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = 0.25 * s; z = (m[9] + m[6]) / s;
  } else {
    const s = Math.sqrt(1 + c - a - b) * 2;
    w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}
function m4FromQuat(q, t) {
  const [x, y, z, w] = q;
  const m = m4I();
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w);
  m[4] = 2 * (x * y - z * w); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + x * w);
  m[8] = 2 * (x * z + y * w); m[9] = 2 * (y * z - x * w); m[10] = 1 - 2 * (x * x + y * y);
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}
/** Axis-angle (degrees) of a rotation matrix's rotation part. */
function axisAngleOf(m) {
  const q = quatOf(m);
  const w = clamp(q[3], -1, 1), s = Math.sqrt(Math.max(0, 1 - w * w));
  const angle = 2 * Math.acos(Math.abs(w)) / DEG;
  if (s < 1e-9) return { axis: [1, 0, 0], angle: 0 };
  const sign = w < 0 ? -1 : 1;
  return { axis: [sign * q[0] / s, sign * q[1] / s, sign * q[2] / s], angle };
}

// ---------------------------------------------------------------------------------------------------------------------
// Point-set helpers (flat xyz arrays, rest millimetres)

function positionsOf(mesh) {
  if (!mesh) return null;
  const p = mesh.positions !== undefined ? mesh.positions : mesh;
  if (!p || typeof p.length !== 'number' || p.length < 3 || p.length % 3 !== 0) return null;
  return p;
}
function bboxOf(p) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = p[i + k];
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
  }
  return { min: lo, max: hi };
}
function centroidOf(p) {
  let x = 0, y = 0, z = 0;
  const n = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { x += p[i]; y += p[i + 1]; z += p[i + 2]; }
  return n ? [x / n, y / n, z / n] : null;
}
function concatPositions(list) {
  const parts = list.filter(Boolean);
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float64Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function select(p, pred) {
  const out = [];
  for (let i = 0; i < p.length; i += 3) if (pred(p[i], p[i + 1], p[i + 2], i / 3)) out.push(p[i], p[i + 1], p[i + 2]);
  return Float64Array.from(out);
}
/** Points whose projection on unit `dir` lies within `depth` of the maximum projection. */
function slab(p, dir, depth) {
  let hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) hi = Math.max(hi, p[i] * dir[0] + p[i + 1] * dir[1] + p[i + 2] * dir[2]);
  return select(p, (x, y, z) => x * dir[0] + y * dir[1] + z * dir[2] >= hi - depth);
}
const expand = (bb, m) => ({ min: bb.min.map(v => v - m), max: bb.max.map(v => v + m) });
const inBox = (bb, x, y, z) => x >= bb.min[0] && x <= bb.max[0] && y >= bb.min[1] && y <= bb.max[1] && z >= bb.min[2] && z <= bb.max[2];
const pointInBox = (bb, q, m = 0) => inBox(expand(bb, m), q[0], q[1], q[2]);

/**
 * Contact patches of two bones: the vertices of A whose nearest vertex of B is within (closest gap + margin), and the
 * same for B. Vertices are first culled to the other bone's box expanded by `cull` mm.
 */
function contactPatch(A, B, margin, cull = 25) {
  const ba = expand(bboxOf(A), cull), bb = expand(bboxOf(B), cull);
  const a = select(A, (x, y, z) => inBox(bb, x, y, z)), b = select(B, (x, y, z) => inBox(ba, x, y, z));
  if (!a.length || !b.length) return null;
  // Nearest distance of each point of P to the points of Q: the exact index (round 4; the same doubles as scanning Q).
  const nearest = (P, Q) => {
    const d = new Float64Array(P.length / 3), t = nnIndex(Q);
    for (let i = 0, k = 0; i < P.length; i += 3, k++) d[k] = Math.sqrt(nnNearestD2(t, P[i], P[i + 1], P[i + 2]));
    return d;
  };
  const da = nearest(a, b), db = nearest(b, a);
  let gap = Infinity;
  for (const v of da) gap = Math.min(gap, v);
  const pa = select(a, (x, y, z, k) => da[k] <= gap + margin), pb = select(b, (x, y, z, k) => db[k] <= gap + margin);
  return { a: pa, b: pb, gap };
}

/** Solve a small dense linear system (Gaussian elimination with partial pivoting); null if singular. */
function solve(M, v) {
  const n = v.length, A = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((r, i) => r[n] / r[i]);
}

/** Algebraic least-squares sphere fit (data centred for conditioning): { center, radius, rms, n } or null. */
function fitSphere(p) {
  const n = p.length / 3;
  if (n < 10) return null;
  const c0 = centroidOf(p);
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], v = [0, 0, 0, 0];
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i] - c0[0], y = p[i + 1] - c0[1], z = p[i + 2] - c0[2];
    const row = [2 * x, 2 * y, 2 * z, 1], rhs = x * x + y * y + z * z;
    for (let r = 0; r < 4; r++) {
      v[r] += row[r] * rhs;
      for (let c = 0; c < 4; c++) M[r][c] += row[r] * row[c];
    }
  }
  const s = solve(M, v);
  if (!s) return null;
  const r2 = s[3] + s[0] * s[0] + s[1] * s[1] + s[2] * s[2];
  if (!(r2 > 0)) return null;
  const center = [s[0] + c0[0], s[1] + c0[1], s[2] + c0[2]], radius = Math.sqrt(r2);
  let e = 0;
  for (let i = 0; i < p.length; i += 3) {
    const d = Math.hypot(p[i] - center[0], p[i + 1] - center[1], p[i + 2] - center[2]) - radius;
    e += d * d;
  }
  return { center, radius, rms: Math.sqrt(e / n), n };
}

/** Least-squares circle of the points projected on the plane normal to unit `axis` (a cylinder fit with a known axis).
 * The centre's axial position is the points' mean. { center, radius, rms, n } or null. */
function fitCircleAboutAxis(p, axis) {
  const n = p.length / 3;
  if (n < 10) return null;
  const o = centroidOf(p);
  const e1 = perp(Math.abs(axis[2]) < 0.9 ? UP : LEFTX, axis), e2 = cross(axis, e1);
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
  const uv = new Float64Array(2 * n);
  for (let i = 0, k = 0; i < p.length; i += 3, k++) {
    const d = [p[i] - o[0], p[i + 1] - o[1], p[i + 2] - o[2]];
    const u = dot(d, e1), w = dot(d, e2);
    uv[2 * k] = u; uv[2 * k + 1] = w;
    const row = [2 * u, 2 * w, 1], rhs = u * u + w * w;
    for (let r = 0; r < 3; r++) {
      v[r] += row[r] * rhs;
      for (let c = 0; c < 3; c++) M[r][c] += row[r] * row[c];
    }
  }
  const s = solve(M, v);
  if (!s) return null;
  const r2 = s[2] + s[0] * s[0] + s[1] * s[1];
  if (!(r2 > 0)) return null;
  const radius = Math.sqrt(r2);
  let e = 0;
  for (let k = 0; k < n; k++) {
    const d = Math.hypot(uv[2 * k] - s[0], uv[2 * k + 1] - s[1]) - radius;
    e += d * d;
  }
  return { center: add(o, add(scl(e1, s[0]), scl(e2, s[1]))), radius, rms: Math.sqrt(e / n), n };
}

/** Area-weighted vertex normals from triangle indices (null when indices are absent). */
function vertexNormals(p, idx) {
  if (!idx || !idx.length) return null;
  const nv = new Float64Array(p.length);
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    if (c + 2 >= p.length || a + 2 >= p.length || b + 2 >= p.length) continue;
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], w = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const f = cross(u, w);
    for (const q of [a, b, c]) { nv[q] += f[0]; nv[q + 1] += f[1]; nv[q + 2] += f[2]; }
  }
  for (let i = 0; i < nv.length; i += 3) {
    const l = Math.hypot(nv[i], nv[i + 1], nv[i + 2]) || 1;
    nv[i] /= l; nv[i + 1] /= l; nv[i + 2] /= l;
  }
  return nv;
}

/** Voxel-grid downsample: the centroid of the points in each `cell`-mm voxel (voxels in first-seen order). Round 4:
 * the voxel key is one integer (exact for voxel indices within +-65535, i.e. +-131 m at the smallest 2 mm cell; a
 * string key is used beyond that), so the output is the same as with the round-3 string key, only faster. */
const VOX_OFF = 65536, VOX_BASE = 131072;
function downsample(p, cell) {
  const acc = new Map();
  for (let i = 0; i < p.length; i += 3) {
    const ix = Math.floor(p[i] / cell), iy = Math.floor(p[i + 1] / cell), iz = Math.floor(p[i + 2] / cell);
    const key = ix > -VOX_OFF && ix < VOX_OFF && iy > -VOX_OFF && iy < VOX_OFF && iz > -VOX_OFF && iz < VOX_OFF
      ? ((ix + VOX_OFF) * VOX_BASE + (iy + VOX_OFF)) * VOX_BASE + (iz + VOX_OFF) : `${ix},${iy},${iz}`;
    let a = acc.get(key);
    if (!a) acc.set(key, (a = [0, 0, 0, 0]));
    a[0] += p[i]; a[1] += p[i + 1]; a[2] += p[i + 2]; a[3]++;
  }
  const out = new Float64Array(acc.size * 3);
  let o = 0;
  for (const a of acc.values()) { out[o++] = a[0] / a[3]; out[o++] = a[1] / a[3]; out[o++] = a[2] / a[3]; }
  return out;
}
function nearestDistance(cloud, x, y, z) {
  let best = Infinity;
  for (let j = 0; j < cloud.length; j += 3) {
    const dx = cloud[j] - x, dy = cloud[j + 1] - y, dz = cloud[j + 2] - z, e = dx * dx + dy * dy + dz * dz;
    if (e < best) best = e;
  }
  return Math.sqrt(best);
}

/** The positive-rotation axis that turns unit direction d toward n (right-hand rule). If an anatomical axis is given,
 * it is kept and only its sign is chosen to agree with that sense. */
function orientAxis(axis, d, n) {
  const ref = norm(cross(d, perp(n, norm(d))));
  if (!axis) return ref;
  const a = norm(axis);
  return dot(a, ref) >= 0 ? a : scl(a, -1);
}

// ---------------------------------------------------------------------------------------------------------------------
// Entries and names

const lowerName = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const id = e.element_id || e.id;
  if (typeof id !== 'string' || !id) return null;
  const names = [];
  if (e.embedded_source_name) names.push(lowerName(e.embedded_source_name));
  for (const c of e.concepts || []) if (c && c.en) names.push(lowerName(c.en));
  for (const n of e.matched_concept_names || []) names.push(lowerName(n));
  if (e.name) names.push(lowerName(e.name));
  const vec = v => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.slice() : null);
  return {
    id,
    // FULLBODY entries carry kind/tissue; MESH-MANIFEST entries only groups such as 'left_upper_limb_bone'.
    kind: e.kind || (e.tissue === 'muscle' || e.tissue === 'bone' ? e.tissue : null) ||
      ((e.groups || []).some(g => /_bone$/.test(g)) ? 'bone' : (e.groups || []).some(g => /_muscle$/.test(g)) ? 'muscle' : 'other'),
    hint: e.rig_hint,
    name: names[0] || id.toLowerCase(),
    names: [...new Set(names)],
    laterality: e.laterality || null,
    centroid: vec(e.centroid),
    bmin: vec(e.bounds_min),
    bmax: vec(e.bounds_max),
    vertices: Number.isFinite(e.vertices) ? e.vertices : 0,
    sourcePacket: e.source_packet || null,
    sha256: e.sha256 || null,
    // R15 deny-list terms over every name field of the raw entry (empty for every packet entry).
    denyTerms: genitalAnatomyTerms(e)
  };
}

function entryList(entries) {
  const raw = Array.isArray(entries) ? entries : entries && Array.isArray(entries.assets) ? entries.assets : null;
  if (!raw) throw new Error('ns:body_input: entries must be an array of manifest assets or a manifest with .assets');
  return raw.map(normalizeEntry).filter(Boolean);
}

function meshGetter(meshesById) {
  if (!meshesById) return () => null;
  if (meshesById instanceof Map) return id => meshesById.get(id) || null;
  if (typeof meshesById === 'object') return id => meshesById[id] || null;
  return () => null;
}

/** Derived, geometry-based aliases for source pieces that share one name. BodyParts3D names every digastric piece
 * "<side> digastric"; the piece under the chin (centroid y < -130 mm) is the anterior belly and the piece toward the
 * mastoid (centroid y > -100 mm) the posterior belly. A middle piece keeps the source name. Not a source label. */
export function muscleAliases(name, centroid) {
  const m = /^(left|right) digastric$/.exec(name);
  if (!m || !centroid) return [];
  if (centroid[1] < -130) return [`anterior belly of ${m[1]} digastric`];
  if (centroid[1] > -100) return [`posterior belly of ${m[1]} digastric`];
  return [];
}

// Muscles that insert on the radius ride the radius (pronation) distally; the manifest hints say only r_forearm.
const RADIUS_DISTAL = ['biceps brachii', 'brachioradialis', 'pronator teres', 'supinator', 'pronator quadratus'];
const FINGER_FAN = Object.freeze(FINGERS.flatMap(f => [`r_${f}_pp`, `r_${f}_mp`, `r_${f}_dp`]));

function resolveHintSegment(h) {
  if (h === 'r_digits') return 'r_digits';
  return SEG_INDEX.has(h) ? h : null;
}

/** Segments on the tree path between two segments (inclusive). */
function treePath(a, b) {
  const up = s => { const c = []; for (let x = s; x; x = BODY_SEGMENT_PARENT[x]) c.push(x); return c; };
  const ca = up(a), cb = up(b);
  const lca = ca.find(x => cb.includes(x));
  return [...ca.slice(0, ca.indexOf(lca) + 1), ...cb.slice(0, cb.indexOf(lca)).reverse()];
}

function boneSegmentFor(entry) {
  const n = entry.name;
  if (n === 'right radius') return 'r_radius';
  if (n === 'left clavicle' || n === 'left scapula') return 'l_girdle';
  const h = typeof entry.hint === 'string' ? entry.hint : null;
  if (h && SEG_INDEX.has(h)) return h;
  return null;
}

function muscleCandidates(entry) {
  const hint = Array.isArray(entry.hint) ? entry.hint : typeof entry.hint === 'string' ? [entry.hint, entry.hint] : [];
  let [p, d] = hint.map(resolveHintSegment);
  if (!p || !d) return null;
  const radiusInsert = RADIUS_DISTAL.some(k => entry.name.includes(k));
  if (radiusInsert && d === 'r_forearm') d = 'r_radius';
  let segs;
  if (d === 'r_digits') segs = [...treePath(p, 'r_hand'), ...FINGER_FAN];
  else if (p === 'r_digits') segs = [...treePath('r_hand', d), ...FINGER_FAN];
  else segs = treePath(p, d);
  return { proximal: p, distal: d, segments: [...new Set(segs)] };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reference joints (precomputed by this module's geometric estimators from packet bodyparts3d-fullbody-r1, manifest
// sha256 e66ba962e32bd7843c6b75c588e6545a6ca9ecdeb17d6ff71e9758aa05b1ea82). They are used ONLY for a joint whose
// bones are listed in the entries with that source packet but whose meshes are not loaded yet (deferred per-region
// loading). Tests re-derive every value from the meshes on disk and require agreement within 0.01 mm / 0.01 degrees.

// REFERENCE_JOINTS, REFERENCE_MUSCLE_BLENDS and FULLBODY_MUSCLE_CATALOG live in the generated block at the end of
// this file and are only read inside functions (after module evaluation).
const REFERENCE_PACKET = 'bodyparts3d-fullbody-r1';

// ---------------------------------------------------------------------------------------------------------------------
// Joint estimation

/** Joint centre inside a convex articular head of bone A that meets bone B: sphere fit seeded from the contact patch.
 * Returns { point, radius, rms, method } or a contact-midpoint fallback. */
function headJoint(A, B, { margin = 2.5, r0 = null, rRange = [2, 15], cull = 12 } = {}) {
  const patch = contactPatch(A, B, margin, cull);
  if (!patch || !patch.a.length || !patch.b.length) return null;
  const ca = centroidOf(patch.a), cb = centroidOf(patch.b);
  const fallback = { point: mid(ca, cb), method: 'contact-midpoint', gapMm: patch.gap };
  const bb = bboxOf(A);
  const ext = sub(bb.max, bb.min);
  const r = r0 || clamp(0.45 * Math.min(ext[0], ext[1], ext[2]), rRange[0], rRange[1]);
  const into = norm(sub(ca, cb));
  let center = add(ca, scl(into, r)), radius = r, fit = null;
  for (const tol of [4, 2.5, 1.5]) {
    const pts = select(A, (x, y, z) => Math.abs(Math.hypot(x - center[0], y - center[1], z - center[2]) - radius) < tol &&
      dot(sub([x, y, z], center), into) < 0.35 * radius);
    const f = fitSphere(pts);
    if (!f || !(f.radius >= rRange[0] && f.radius <= rRange[1])) break;
    fit = f; center = f.center; radius = f.radius;
  }
  if (!fit || !pointInBox(bb, fit.center, 1) || len(sub(fit.center, fallback.point)) > 2.5 * rRange[1]) return fallback;
  return { point: fit.center, radius: fit.radius, rms: fit.rms, inliers: fit.n, method: 'sphere-fit', gapMm: patch.gap };
}

/** Knee or elbow hinge: transepicondylar direction from the distal slab's medial/lateral extremes, then a circle fit
 * of the articular points about that direction (cylinder fit with a known axis). */
function hingeJoint(points, epiSlab, medialDir, rRange) {
  const med = centroidOf(slab(epiSlab, medialDir, 3)), lat = centroidOf(slab(epiSlab, scl(medialDir, -1), 3));
  const axis = norm(sub(med, lat));
  const c = fitCircleAboutAxis(points, axis);
  if (!c || !(c.radius >= rRange[0] && c.radius <= rRange[1])) return { point: centroidOf(points), axis, method: 'articular-centroid', epicondyles: { medial: med, lateral: lat } };
  return { point: c.center, axis, radius: c.radius, rms: c.rms, inliers: c.n, method: 'circle-fit-about-transepicondylar-axis', epicondyles: { medial: med, lateral: lat } };
}

function estimateJoints(bone, boneMesh, warn) {
  const J = {};
  const put = (id, rec) => { if (rec && rec.point && rec.point.every(Number.isFinite)) J[id] = rec; };

  // Spine and head.
  const L5 = bone('fifth lumbar vertebra'), S = bone('sacrum');
  if (L5 && S) put('lumbosacral', { point: mid(centroidOf(L5), centroidOf(slab(S, UP, 15))), method: 'midpoint L5 centroid / sacral-top centroid', bones: ['fifth lumbar vertebra', 'sacrum'] });
  const T12 = bone('twelfth thoracic vertebra'), L1 = bone('first lumbar vertebra');
  if (T12 && L1) put('thoracolumbar', { point: mid(centroidOf(T12), centroidOf(L1)), method: 'midpoint T12 / L1 centroids', bones: ['twelfth thoracic vertebra', 'first lumbar vertebra'] });
  const C7 = bone('seventh cervical vertebra'), T1 = bone('first thoracic vertebra');
  if (C7 && T1) put('cervicothoracic', { point: mid(centroidOf(C7), centroidOf(T1)), method: 'midpoint C7 / T1 centroids', bones: ['seventh cervical vertebra', 'first thoracic vertebra'] });
  const atlas = bone('atlas');
  if (atlas) put('atlanto_occipital', { point: centroidOf(slab(atlas, UP, 6)), method: 'centroid of the atlas superior 6 mm (lateral-mass facets; the occipital bone is not in the packet)', bones: ['atlas'] });
  const mand = bone('mandible');
  if (mand) {
    const bb = bboxOf(mand);
    const post = select(mand, (x, y) => y > bb.max[1] - 20);
    const cond = s => { const side = select(post, x => x * s > 5); return side.length ? centroidOf(slab(side, UP, 6)) : null; };
    const cl = cond(1), cr = cond(-1);
    if (cl && cr) {
      put('tmj', {
        point: mid(cl, cr), condyles: { left: cl, right: cr }, chin: centroidOf(slab(mand, ANT, 10)),
        method: 'midpoint of the mandibular condyle tops (posterior 20 mm, top 6 mm per side)', bones: ['mandible']
      });
    }
  }
  const hy = bone('hyoid bone');
  if (hy) put('hyoid_fixed', { point: centroidOf(hy), method: 'hyoid centroid (no joint motion: the hyoid rides the cervical segment)', bones: ['hyoid bone'] });

  // Right upper limb.
  const clav = bone('right clavicle');
  if (clav) put('r_sternoclavicular', { point: centroidOf(slab(clav, LEFTX, 10)), acromialEnd: centroidOf(slab(clav, RIGHTX, 10)), method: 'centroid of the medial 10 mm of the right clavicle', bones: ['right clavicle'] });
  const hum = bone('right humerus'), scap = bone('right scapula');
  if (hum && scap) {
    const h = headJoint(hum, scap, { margin: 6, r0: 23, rRange: [15, 35], cull: 25 });
    if (h) put('r_glenohumeral', { ...h, bones: ['right humerus', 'right scapula'], method: `${h.method} of the humeral head (seeded from the glenoid contact patch)` });
  }
  const ulna = bone('right ulna'), rad = bone('right radius');
  if (hum && ulna && rad) {
    const pu = contactPatch(hum, ulna, 4, 20), pr = contactPatch(hum, rad, 4, 20);
    const pts = concatPositions([pu && pu.a, pr && pr.a]);
    if (pts.length >= 30) {
      const h = hingeJoint(pts, slab(hum, DOWN, 40), LEFTX, [5, 25]);
      put('r_elbow', { ...h, bones: ['right humerus', 'right ulna', 'right radius'] });
    }
  }
  if (rad && ulna) {
    const head = centroidOf(slab(rad, UP, 10)), uhead = centroidOf(slab(ulna, DOWN, 12));
    put('r_radioulnar', { point: head, ulnarHead: uhead, axis: norm(sub(head, uhead)), method: 'radial-head centroid (top 10 mm); axis to the ulnar-head centroid (bottom 12 mm)', bones: ['right radius', 'right ulna'] });
  }
  const cap = bone('right capitate');
  if (cap) put('r_wrist', { point: centroidOf(slab(cap, UP, 8)), method: 'centroid of the capitate head (proximal 8 mm)', bones: ['right capitate'] });
  const mc1 = bone('right first metacarpal bone'), trap = bone('right trapezium');
  if (mc1 && trap) {
    const p = contactPatch(trap, mc1, 2.5, 12);
    if (p) put('r_thumb_cmc', { point: mid(centroidOf(p.a), centroidOf(p.b)), method: 'contact midpoint trapezium / first metacarpal (saddle joint)', gapMm: p.gap, bones: ['right trapezium', 'right first metacarpal bone'] });
  }
  const tpp = bone('proximal phalanx of right thumb'), tdp = bone('distal phalanx of right thumb');
  if (mc1 && tpp) put('r_thumb_mcp', { ...headJoint(mc1, tpp), bones: ['right first metacarpal bone', 'proximal phalanx of right thumb'] });
  if (tpp && tdp) put('r_thumb_ip', { ...headJoint(tpp, tdp), bones: ['proximal phalanx of right thumb', 'distal phalanx of right thumb'] });
  for (const f of FINGERS) {
    const names = [`right ${FINGER_MC[f]} metacarpal bone`, `proximal phalanx of right ${f} finger`, `middle phalanx of right ${f} finger`, `distal phalanx of right ${f} finger`];
    const bs = names.map(bone);
    const ids = ['mcp', 'pip', 'dip'];
    for (let k = 0; k < 3; k++) {
      if (bs[k] && bs[k + 1]) {
        const h = headJoint(bs[k], bs[k + 1]);
        if (h) put(`r_${f}_${ids[k]}`, { ...h, bones: [names[k], names[k + 1]] });
      }
    }
  }

  // Lower limbs.
  for (const [side, s] of [['right', 'r'], ['left', 'l']]) {
    const medial = side === 'right' ? LEFTX : RIGHTX;
    const fem = bone(`${side} femur`), hip = bone(`${side} hip bone`), tib = bone(`${side} tibia`), fib = bone(`${side} fibula`);
    if (fem && hip) {
      const h = headJoint(fem, hip, { margin: 6, r0: 24, rRange: [16, 34], cull: 25 });
      if (h) put(`${s}_hip`, { ...h, bones: [`${side} femur`, `${side} hip bone`], method: `${h.method} of the femoral head (seeded from the acetabular contact patch)` });
    }
    if (fem) {
      const fm = boneMesh(`${side} femur`);
      const nrm = fm && vertexNormals(fm.positions, fm.indices);
      const bbz = bboxOf(fem).min[2];
      let pts;
      if (nrm) {
        const medialAxis = medial;
        pts = select(fem, (x, y, z, k) => {
          if (z > bbz + 35) return false;
          const n = [nrm[3 * k], nrm[3 * k + 1], nrm[3 * k + 2]];
          return (dot(n, DOWN) > 0.25 || dot(n, POST) > 0.25) && Math.abs(dot(n, medialAxis)) < 0.7;
        });
      } else {
        const sl = slab(fem, DOWN, 35), cy = centroidOf(sl)[1];
        pts = select(sl, (x, y) => y > cy);
      }
      if (pts.length >= 30) {
        const h = hingeJoint(pts, slab(fem, DOWN, 50), medial, [12, 40]);
        put(`${s}_knee`, { ...h, bones: [`${side} femur`], method: `${h.method} (femoral condyles, distal 35 mm${nrm ? ', inferior/posterior-facing normals' : ', posterior half'})` });
      }
    }
    if (tib && fib) {
      const mm = centroidOf(slab(tib, DOWN, 3)), lm = centroidOf(slab(fib, DOWN, 3));
      const medialOk = dot(sub(mm, lm), medial) > 15;
      const talus = bone(`${side} talus`);
      if (medialOk) put(`${s}_ankle`, { point: mid(mm, lm), axis: norm(sub(lm, mm)), malleoli: { medial: mm, lateral: lm }, method: 'midpoint of the malleolus tips (tibia and fibula lowest 3 mm); talocrural axis through them', bones: [`${side} tibia`, `${side} fibula`] });
      else if (talus) put(`${s}_ankle`, { point: centroidOf(slab(talus, UP, 8)), method: 'talar dome centroid (malleolus check failed)', bones: [`${side} talus`] });
    }
    const mtp = [];
    for (const [ord, toe] of TOES) {
      const mt = bone(`${side} ${ord} metatarsal bone`), pp = bone(`proximal phalanx of ${side} ${toe}`);
      if (mt && pp) { const h = headJoint(mt, pp, { rRange: [3, 15] }); if (h) mtp.push({ ord, ...h }); }
    }
    if (mtp.length >= 2) {
      const pts = mtp.map(m => m.point);
      const first = mtp.find(m => m.ord === 'first') || mtp[0], last = mtp.find(m => m.ord === 'fifth') || mtp[mtp.length - 1];
      put(`${s}_mtp`, {
        point: scl(pts.reduce(add, [0, 0, 0]), 1 / pts.length), axis: norm(sub(last.point, first.point)),
        rays: Object.fromEntries(mtp.map(m => [m.ord, { point: m.point, method: m.method }])),
        method: 'mean of the metatarsal-head joint centres; axis from the first to the fifth (metatarsal break)',
        bones: TOES.map(([o]) => `${side} ${o} metatarsal bone`)
      });
    }
  }
  return J;
}

/** Coarse joint estimate between two boxes: per axis, the centre of their overlap or of the gap between them. */
function boxJoint(childBox, parentBox) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const lo = Math.max(childBox.min[k], parentBox.min[k]), hi = Math.min(childBox.max[k], parentBox.max[k]);
    out.push((lo + hi) / 2);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rig construction

/**
 * Build the full-body rig.
 * @param entries FULLBODY-MESH-MANIFEST.json `assets` (or the manifest itself). Extra entries such as the left clavicle
 *   or scapula from MESH-MANIFEST.json are accepted and ride l_girdle.
 * @param meshesById Map or object meshId -> parsed mesh ({ positions, indices } from ns-obj parseObj). Meshes may be
 *   missing (deferred loading): joints then fall back to REFERENCE_JOINTS (same packet only) or to a coarse box
 *   estimate from the entry bounds; muscles without geometry are weighted from their entry centroid and box corners.
 *   Call buildBodyRig again when more meshes are loaded.
 * @param options { muscleSamples (vertices per muscle for the weights, default 400), fitSamples (vertices per muscle kept
 *   for the per-pose rigid fit, default 96) }
 * @returns frozen rig { kind: 'ns-body-rig', version, segments, pivots, meshSegment, muscles, warnings, limits }
 */
export function buildBodyRig(entries, meshesById = null, options = {}) {
  const getMesh = meshGetter(meshesById);
  const maxSamples = Number.isInteger(options.muscleSamples) && options.muscleSamples > 0 ? options.muscleSamples : 400;
  const warnings = [];
  const warn = m => warnings.push(m);
  // R15: genital anatomy is never rigged, posed or baked (none is in the packets; this is defence in depth).
  const list = [], excludedGenital = [];
  for (const e of entryList(entries)) {
    const terms = e.denyTerms;
    if (terms.length) { excludedGenital.push(e.id); warn(`entry ${e.id} (${e.name}) is genital anatomy (${terms.join(', ')}); it is excluded (R15)`); }
    else list.push(e);
  }

  const byName = new Map();
  for (const e of list) for (const n of e.names) if (!byName.has(n)) byName.set(n, e);
  const boneMesh = name => {
    const e = byName.get(name);
    if (!e || e.kind !== 'bone') return null;
    const m = getMesh(e.id), p = positionsOf(m);
    return p ? { positions: p, indices: m && m.indices ? m.indices : null } : null;
  };
  const bone = name => { const m = boneMesh(name); return m ? m.positions : null; };

  // Segment membership.
  const segBones = Object.fromEntries(BODY_SEGMENTS.map(s => [s, []]));
  const meshSegment = {};
  const muscleList = [];
  for (const e of list) {
    if (e.kind === 'bone') {
      const s = boneSegmentFor(e);
      if (!s) { warn(`bone ${e.id} (${e.name}) has no known segment; it is not posed`); continue; }
      segBones[s].push(e);
    } else if (e.kind === 'muscle') {
      const c = muscleCandidates(e);
      if (!c) { warn(`muscle ${e.id} (${e.name}) has no usable rig_hint; it is not posed`); continue; }
      muscleList.push({ entry: e, cand: c });
    } else {
      warn(`entry ${e.id} kind ${e.kind} is not part of the body rig`);
    }
  }

  // Rest segment boxes and centroids from entry metadata (available without meshes).
  const segBox = {}, segCentroid = {};
  for (const s of BODY_SEGMENTS) {
    const es = segBones[s].filter(e => e.bmin && e.bmax);
    if (!es.length) continue;
    segBox[s] = { min: [0, 1, 2].map(k => Math.min(...es.map(e => e.bmin[k]))), max: [0, 1, 2].map(k => Math.max(...es.map(e => e.bmax[k]))) };
    let w = 0, c = [0, 0, 0];
    for (const e of es) { const v = Math.max(1, e.vertices); c = add(c, scl(e.centroid || mid(e.bmin, e.bmax), v)); w += v; }
    segCentroid[s] = scl(c, 1 / w);
  }
  for (const [v, r] of [['l_girdle', 'r_girdle'], ['l_upperarm', 'r_upperarm']]) {
    if (!segBox[v] && segBox[r]) {
      const b = segBox[r];
      segBox[v] = { min: [-b.max[0], b.min[1], b.min[2]], max: [-b.min[0], b.max[1], b.max[2]] };
      segCentroid[v] = mirrorX(segCentroid[r]);
    }
  }

  // Joints: geometry first, then same-packet reference, then a coarse box estimate.
  const geo = estimateJoints(bone, boneMesh, warn);
  const entryByName = byName;
  const refUsable = rec => rec && rec.bones && rec.bones.every(n => { const e = entryByName.get(n); return e && e.sourcePacket === REFERENCE_PACKET; });
  const J = {};
  for (const [seg, jid] of Object.entries(BODY_SEGMENT_JOINT)) {
    if (jid === 'r_patellofemoral' || jid === 'l_patellofemoral' || VIRTUAL_SEGMENTS.includes(seg)) continue;
    if (geo[jid]) { J[jid] = { ...geo[jid], source: 'geometry' }; continue; }
    const ref = REFERENCE_JOINTS[jid];
    if (refUsable(ref)) { J[jid] = { ...ref, source: 'reference' }; continue; }
    const parent = BODY_SEGMENT_PARENT[seg];
    if (segBox[seg] && segBox[parent]) {
      J[jid] = { point: boxJoint(segBox[seg], segBox[parent]), method: 'box estimate from entry bounds (coarse; meshes not loaded)', source: 'bounds' };
      warn(`joint ${jid}: coarse box estimate (bones not loaded and no matching reference)`);
    } else if (segBox[seg]) {
      J[jid] = { point: segCentroid[seg], method: 'segment centroid (coarse; parent has no bones)', source: 'bounds' };
      warn(`joint ${jid}: segment centroid used`);
    }
  }
  if (J.r_sternoclavicular) J.l_sternoclavicular_mirror = { point: mirrorX(J.r_sternoclavicular.point), method: 'mirror (x -> -x) of the right sternoclavicular joint; the left girdle is in the left-arm rig', source: 'mirror' };
  if (J.r_glenohumeral) J.l_glenohumeral_mirror = { point: mirrorX(J.r_glenohumeral.point), method: 'mirror (x -> -x) of the right glenohumeral centre; the left humerus is in the left-arm rig', source: 'mirror' };
  for (const s of ['r', 'l']) if (J[`${s}_knee`]) J[`${s}_patellofemoral`] = { point: J[`${s}_knee`].point, method: `knee pivot; the patella turns ${BODY_JOINT_SHARES.patellaPerKneeFlex} of the knee flexion about it`, source: 'derived' };

  // Round the evidence records first so geometry-derived and reference-derived rigs compute identical axes.
  for (const jid of Object.keys(J)) for (const k of Object.keys(J[jid])) J[jid][k] = roundDeep(J[jid][k]);

  // Axes, oriented so a positive angle means the direction the agreed joint id names (JOINT_SEMANTICS).
  const P = jid => J[jid] && J[jid].point;
  const segC = s => segCentroid[s] || null;
  const dirTo = (jid, target, fallback) => (P(jid) && target ? norm(sub(target, P(jid))) : fallback);
  const setAxes = (jid, axes) => { if (J[jid]) J[jid].axes = Object.fromEntries(Object.entries(axes).map(([k, v]) => [k, norm(v)])); };
  for (const jid of ['lumbosacral', 'thoracolumbar', 'cervicothoracic', 'atlanto_occipital']) {
    setAxes(jid, { flex: orientAxis(LEFTX, UP, ANT), rot: orientAxis(UP, ANT, LEFTX) });
  }
  if (J.tmj) {
    const cond = J.tmj.condyles, chin = J.tmj.chin || segC('mandible');
    setAxes('tmj', { open: orientAxis(cond ? sub(cond.left, cond.right) : LEFTX, chin ? sub(chin, P('tmj')) : ANT, DOWN) });
    J.tmj.glideDir = round3(norm(add(ANT, scl(DOWN, 0.4))));
  }
  // Right shoulder: flexion about the transverse axis, abduction about the antero-posterior axis.
  const elbowP = P('r_elbow') || segC('r_forearm');
  const humDir = dirTo('r_glenohumeral', elbowP, DOWN);
  setAxes('r_glenohumeral', { flex: orientAxis(LEFTX, humDir, ANT), abd: orientAxis(POST, humDir, RIGHTX) });
  if (J.r_glenohumeral) J.r_glenohumeral.restHumerusDir = humDir;
  const wristP = P('r_wrist') || segC('r_hand');
  setAxes('r_elbow', { flex: orientAxis(J.r_elbow && J.r_elbow.axis, dirTo('r_elbow', wristP, DOWN), ANT) });
  setAxes('r_radioulnar', { pron: orientAxis(J.r_radioulnar && J.r_radioulnar.axis ? J.r_radioulnar.axis : UP, ANT, LEFTX) });
  const mc3 = byName.get('right third metacarpal bone');
  const handTarget = (mc3 && bone('right third metacarpal bone') && centroidOf(bone('right third metacarpal bone'))) || (mc3 && mc3.centroid) || segC('r_hand');
  setAxes('r_wrist', { flex: orientAxis(null, dirTo('r_wrist', handTarget, DOWN), ANT) });
  const boneC = name => { const p = bone(name); if (p) return centroidOf(p); const e = byName.get(name); return e ? e.centroid : null; };
  const THUMB_PALM = norm(add(LEFTX, ANT)); // toward the palm and the ulnar side of the right hand
  setAxes('r_thumb_cmc', { flex: orientAxis(null, dirTo('r_thumb_cmc', boneC('right first metacarpal bone'), DOWN), THUMB_PALM) });
  setAxes('r_thumb_mcp', { flex: orientAxis(null, dirTo('r_thumb_mcp', boneC('proximal phalanx of right thumb'), DOWN), THUMB_PALM) });
  setAxes('r_thumb_ip', { flex: orientAxis(null, dirTo('r_thumb_ip', boneC('distal phalanx of right thumb'), DOWN), THUMB_PALM) });
  for (const f of FINGERS) {
    const kids = { mcp: `proximal phalanx of right ${f} finger`, pip: `middle phalanx of right ${f} finger`, dip: `distal phalanx of right ${f} finger` };
    for (const [k, n] of Object.entries(kids)) setAxes(`r_${f}_${k}`, { flex: orientAxis(null, dirTo(`r_${f}_${k}`, boneC(n), DOWN), ANT) });
  }
  const hipAxis = P('l_hip') && P('r_hip') ? sub(P('l_hip'), P('r_hip')) : LEFTX;
  for (const s of ['r', 'l']) {
    const kneeP = P(`${s}_knee`) || segC(`${s}_shank`);
    setAxes(`${s}_hip`, { flex: orientAxis(hipAxis, dirTo(`${s}_hip`, kneeP, DOWN), ANT) });
    const ankleP = P(`${s}_ankle`) || segC(`${s}_foot`);
    setAxes(`${s}_knee`, { flex: orientAxis(J[`${s}_knee`] && J[`${s}_knee`].axis, dirTo(`${s}_knee`, ankleP, DOWN), POST) });
    if (J[`${s}_patellofemoral`]) J[`${s}_patellofemoral`].axes = J[`${s}_knee`] && J[`${s}_knee`].axes ? { flex: J[`${s}_knee`].axes.flex } : { flex: [1, 0, 0] };
    const mtpP = P(`${s}_mtp`) || segC(`${s}_toes`);
    setAxes(`${s}_ankle`, { dorsi: orientAxis(J[`${s}_ankle`] && J[`${s}_ankle`].axis, dirTo(`${s}_ankle`, mtpP, ANT), UP) });
    setAxes(`${s}_mtp`, { flex: orientAxis(J[`${s}_mtp`] && J[`${s}_mtp`].axis, dirTo(`${s}_mtp`, segC(`${s}_toes`), ANT), DOWN) });
  }
  // r_sternoclavicular has no axis of its own: the girdle turns about the humerus's effective elevation axis.
  for (const r of Object.values(J)) if (!r.axes) r.axes = {};

  // Segment records.
  const segments = {};
  for (const s of BODY_SEGMENTS) {
    segments[s] = {
      id: s, parent: BODY_SEGMENT_PARENT[s], joint: BODY_SEGMENT_JOINT[s] || null,
      virtual: VIRTUAL_SEGMENTS.includes(s), boneIds: segBones[s].map(e => e.id), muscleIds: [],
      restCentroid: segCentroid[s] ? round3(segCentroid[s]) : null
    };
    for (const e of segBones[s]) meshSegment[e.id] = { kind: 'bone', segment: s, blend: [[s, 1]], method: 'rigid' };
  }

  // Bone clouds for muscle weighting (voxel-downsampled; virtual left segments use the mirrored right clouds).
  const clouds = {};
  for (const s of BODY_SEGMENTS) {
    const parts = segBones[s].map(e => positionsOf(getMesh(e.id))).filter(Boolean);
    if (!parts.length) continue;
    const all = concatPositions(parts), bb = bboxOf(all);
    const diag = len(sub(bb.max, bb.min));
    clouds[s] = downsample(all, clamp(diag / 40, 2, 10));
  }
  for (const [v, r] of [['l_girdle', 'r_girdle'], ['l_upperarm', 'r_upperarm']]) {
    if (!clouds[v] && clouds[r]) {
      const c = Float64Array.from(clouds[r]);
      for (let i = 0; i < c.length; i += 3) c[i] = -c[i];
      clouds[v] = c;
    }
  }

  // Muscles: two nearest candidate segments per vertex (distance rule), averaged into one blend.
  const muscles = [];
  const fit = {};
  const fitCount = Number.isInteger(options.fitSamples) && options.fitSamples >= 4 ? options.fitSamples : 96;
  // Round 4 (R4-body): the exact nearest-neighbour index (same results as scanning every cloud point, much faster);
  // options.nearest = 'scan' uses the scan (reference for the exactness unit test).
  const near = nearestSearch(clouds, options.nearest);
  for (const { entry: e, cand } of muscleList) {
    const avail = cand.segments.filter(s => clouds[s]);
    const p = positionsOf(getMesh(e.id));
    const complete = p && avail.length === cand.segments.length;
    const ref = REFERENCE_MUSCLE_BLENDS[e.id];
    let blend, method, fromReference = false;
    if (!complete && ref && e.sourcePacket === REFERENCE_PACKET) {
      blend = ref.map(([s, w]) => [s, w]);
      fromReference = true;
      method = 'reference blend (same packet; mesh or candidate bones not loaded)';
    } else {
      let samples = null;
      if (p) {
        const n = p.length / 3, stride = Math.max(1, Math.floor(n / maxSamples));
        const out = [];
        for (let v = 0; v < n; v += stride) out.push(p[3 * v], p[3 * v + 1], p[3 * v + 2]);
        samples = Float64Array.from(out);
        method = 'distance rule over the mesh vertices (two nearest candidate segments, inverse-square weights)';
      } else if (e.centroid && e.bmin && e.bmax) {
        const out = [...e.centroid];
        for (let k = 0; k < 8; k++) out.push(k & 1 ? e.bmax[0] : e.bmin[0], k & 2 ? e.bmax[1] : e.bmin[1], k & 4 ? e.bmax[2] : e.bmin[2]);
        samples = Float64Array.from(out);
        method = 'distance rule over the entry centroid and box corners (mesh not loaded)';
      }
      if (avail.length >= 2 && samples) {
        const acc = Object.fromEntries(avail.map(s => [s, 0]));
        const ns = samples.length / 3;
        const keep = p ? Math.max(1, Math.floor(ns / fitCount)) : 0;
        const fp = [], fi0 = [], fi1 = [], fw0 = [];
        for (let i = 0, k = 0; i < samples.length; i += 3, k++) {
          const w = near(avail, samples[i], samples[i + 1], samples[i + 2]);
          acc[w.a] += w.wa / ns;
          if (w.b) acc[w.b] += w.wb / ns;
          if (keep && k % keep === 0) {
            fp.push(samples[i], samples[i + 1], samples[i + 2]);
            fi0.push(SEG_INDEX.get(w.a)); fi1.push(SEG_INDEX.get(w.b || w.a)); fw0.push(w.wa);
          }
        }
        if (fp.length) fit[e.id] = { p: Float64Array.from(fp), i0: Uint8Array.from(fi0), i1: Uint8Array.from(fi1), w0: Float64Array.from(fw0) };
        blend = Object.entries(acc).filter(([, w]) => w >= 0.02).sort((x, y) => y[1] - x[1]).slice(0, 3);
      } else if (avail.length === 1) {
        blend = [[avail[0], 1]];
        method = 'single available candidate segment';
      } else {
        const segs = [cand.proximal === 'r_digits' ? 'r_hand' : cand.proximal, cand.distal === 'r_digits' ? 'r_hand' : cand.distal];
        blend = segs[0] === segs[1] ? [[segs[0], 1]] : [[segs[0], 0.5], [segs[1], 0.5]];
        method = 'hint fallback (no bone geometry for the candidate segments)';
      }
      if (!complete) warn(`muscle ${e.id}: ${method}`);
    }
    if (!fromReference) {
      const tot = blend.reduce((t, [, w]) => t + w, 0) || 1;
      blend = blend.map(([s, w]) => [s, Math.round((w / tot) * 1e4) / 1e4]);
    }
    const centroid = e.centroid || (p ? centroidOf(p) : null);
    meshSegment[e.id] = {
      kind: 'muscle', segment: blend[0][0], blend, candidates: cand.segments, hint: Array.isArray(e.hint) ? [...e.hint] : e.hint,
      restCentroid: centroid ? round3(centroid) : null, method,
      pose: fit[e.id] ? `least-squares rigid fit (Horn) to ${fit[e.id].i0.length} two-influence skinned sample vertices` : 'blended rigid matrix (weighted quaternion average)'
    };
    segments[blend[0][0]].muscleIds.push(e.id);
    muscles.push({ id: e.id, name: e.name, aliases: muscleAliases(e.name, e.centroid), side: e.laterality });
  }

  const rig = {
    kind: 'ns-body-rig',
    version: 'ns-body-r1 (U3b-body, 2026-11-08)',
    frame: 'BodyParts3D 4.0 whole-body frame, millimetres (+x subject LEFT, +y POSTERIOR, +z SUPERIOR); matrices map rest -> posed',
    segmentOrder: BODY_SEGMENTS,
    segments,
    pivots: J,
    meshSegment,
    muscles,
    limits: BODY_JOINT_LIMITS,
    excludedGenital,
    warnings,
    caveats: [
      'One reference body from an educational dataset (BodyParts3D warns of errors and artist-made parts); not the player or a population average.',
      'Joint pivots are geometric estimates (sphere/circle fits, contact patches, malleolus tips), not measured joint centres; spinal motion is lumped into two lumbar/thoracic and two cervical/cranial stages.',
      'Bones move rigidly. Muscles get one blended rigid matrix (or optional two-influence skin weights) and slide rather than deform.',
      'The left girdle and humerus are not in this packet: the left pectoralis major, trapezius and serratus anterior use mirrored right-side pivots and ride the thorax unless the left-arm rig matrices are supplied.',
      'No facial-expression or masticatory muscle exists in BodyParts3D 4.0; brow_raise, eye_close, lip_purse and smile move nothing and are reported as display levels only.',
      'Muscle drives are simulated, unitless display values: not EMG, not force and not nerve activity.'
    ]
  };
  Object.defineProperty(rig, '_clouds', { value: clouds, enumerable: false });
  Object.defineProperty(rig, '_fit', { value: fit, enumerable: false });
  return deepFreezeRig(rig);
}

function twoNearest(segs, clouds, x, y, z) {
  let a = null, da = Infinity, b = null, db = Infinity;
  for (const s of segs) {
    const d = nearestDistance(clouds[s], x, y, z);
    if (d < da) { b = a; db = da; a = s; da = d; } else if (d < db) { b = s; db = d; }
  }
  return twoNearestResult(a, da, b, db);
}
/** Inverse-square two-influence weights from the two nearest distances (shared by every search path). */
function twoNearestResult(a, da, b, db) {
  if (!b) return { a, wa: 1, b: null, wb: 0 };
  const qa = da * da, qb = db * db, t = qa + qb;
  const wa = t > 1e-12 ? qb / t : 0.5;
  return { a, wa, b, wb: 1 - wa };
}

function deepFreezeRig(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v) && !ArrayBuffer.isView(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreezeRig(v[k]);
  }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------
// Targets and posing

/**
 * Clamp agreed joint targets (degrees) to BODY_JOINT_LIMITS. Accepts an object or Map. Missing ids are 0.
 * @returns { applied: { every BODY_JOINT_ID: deg }, clamped: [{ id, requested, applied }], ignored: [unknown ids],
 *   nonFinite: [ids whose value was not a finite number (treated as 0)] }
 */
export function clampBodyJointTargets(targets = {}) {
  const src = targets instanceof Map ? Object.fromEntries(targets) : targets && typeof targets === 'object' ? targets : {};
  const applied = {}, clamped = [], ignored = [], nonFinite = [];
  for (const id of BODY_JOINT_IDS) {
    let v = Object.prototype.hasOwnProperty.call(src, id) ? src[id] : 0;
    if (typeof v !== 'number' || !Number.isFinite(v)) { if (v !== undefined && v !== null) nonFinite.push(id); v = 0; }
    const [lo, hi] = BODY_JOINT_LIMITS[id];
    const c = clamp(v, lo, hi) + 0;
    if (c !== v) clamped.push({ id, requested: v, applied: c });
    applied[id] = c;
  }
  for (const k of Object.keys(src)) if (!BODY_JOINT_LIMITS[k]) ignored.push(k);
  return { applied, clamped, ignored, nonFinite };
}

/** Facial display levels 0..1 (target / 20, clamped). They move no mesh: BodyParts3D 4.0 has no facial-expression
 * muscle, so the scene should show them only as labelled, simulated display values. */
export function faceDisplayLevels(targets = {}) {
  const { applied } = clampBodyJointTargets(targets);
  return Object.fromEntries(FACE_DISPLAY_IDS.map(id => [id, applied[id] / FACE_FULL_DEG]));
}

function checkRig(rig) {
  if (!rig || rig.kind !== 'ns-body-rig') throw new Error('ns:body_rig: expected a rig from buildBodyRig');
}

/** Per-joint local rotations (rest frame, about each pivot) for the clamped targets. */
function localMatrices(rig, A) {
  const J = rig.pivots, out = {};
  const rot = (jid, axis, deg) => (J[jid] && J[jid].axes[axis] && deg ? m4RotAbout(J[jid].axes[axis], deg, J[jid].point) : m4I());
  const sh = BODY_JOINT_SHARES;
  out.lumbar = rot('lumbosacral', 'flex', sh.trunk_flex.lumbosacral * A.trunk_flex);
  out.thorax = rot('thoracolumbar', 'flex', sh.trunk_flex.thoracolumbar * A.trunk_flex);
  out.cervical = m4Mul(rot('cervicothoracic', 'flex', sh.neck_flex.cervicothoracic * A.neck_flex), rot('cervicothoracic', 'rot', sh.neck_rot.cervicothoracic * A.neck_rot));
  out.skull = m4Mul(rot('atlanto_occipital', 'flex', sh.neck_flex.atlanto_occipital * A.neck_flex), rot('atlanto_occipital', 'rot', sh.neck_rot.atlanto_occipital * A.neck_rot));
  out.mandible = J.tmj && J.tmj.glideDir ? m4Mul(m4Trans(scl(J.tmj.glideDir, sh.jawGlideMmPerDeg * A.jaw_open)), rot('tmj', 'open', A.jaw_open)) : rot('tmj', 'open', A.jaw_open);
  out.hyoid = m4I();

  // Right shoulder with the mild scapulohumeral rhythm.
  const gh = J.r_glenohumeral;
  if (gh && gh.axes.flex && gh.axes.abd) {
    const total = m4Mul(m4RotAbout(gh.axes.flex, A.r_shoulder_flex, [0, 0, 0]), m4RotAbout(gh.axes.abd, A.r_shoulder_abd, [0, 0, 0]));
    const { axis, angle } = axisAngleOf(total);
    const d0 = norm(gh.restHumerusDir || DOWN);
    const elev = Math.acos(clamp(dot(norm(m4Dir(total, d0)), d0), -1, 1)) / DEG;
    const g = elev > SCAPULOHUMERAL.thresholdDeg && angle > 1e-9 ? SCAPULOHUMERAL.ratio * (elev - SCAPULOHUMERAL.thresholdDeg) * (angle / elev) : 0;
    out.r_girdle = J.r_sternoclavicular && g ? m4RotAbout(axis, g, J.r_sternoclavicular.point) : m4I();
    out.r_upperarm = angle > 1e-9 ? m4RotAbout(axis, angle - (J.r_sternoclavicular ? g : 0), gh.point) : m4I();
  } else {
    out.r_girdle = m4I();
    out.r_upperarm = m4I();
  }
  out.r_forearm = rot('r_elbow', 'flex', A.r_elbow_flex);
  out.r_radius = rot('r_radioulnar', 'pron', A.r_pronation);
  out.r_hand = rot('r_wrist', 'flex', A.r_wrist_flex - A.r_wrist_ext);
  const net = A.r_grasp - A.r_open;
  const share = ([f, e, lo, hi]) => clamp(net >= 0 ? f * net : e * net, lo, hi);
  const T = sh.thumb, F = sh.finger;
  out.r_thumb_mc = rot('r_thumb_cmc', 'flex', share(T.cmc));
  out.r_thumb_pp = rot('r_thumb_mcp', 'flex', share(T.mcp));
  out.r_thumb_dp = rot('r_thumb_ip', 'flex', share(T.ip));
  for (const f of FINGERS) {
    out[`r_${f}_pp`] = rot(`r_${f}_mcp`, 'flex', share(F.mcp));
    out[`r_${f}_mp`] = rot(`r_${f}_pip`, 'flex', share(F.pip));
    out[`r_${f}_dp`] = rot(`r_${f}_dip`, 'flex', share(F.dip));
  }
  out.l_girdle = m4I();
  out.l_upperarm = m4I();
  for (const [s, S] of [['r', 'R'], ['l', 'L']]) {
    const kneeFlex = -A[`knee_ext_${S}`];
    out[`${s}_thigh`] = rot(`${s}_hip`, 'flex', A[`hip_flex_${S}`]);
    out[`${s}_patella`] = rot(`${s}_patellofemoral`, 'flex', sh.patellaPerKneeFlex * kneeFlex);
    out[`${s}_shank`] = rot(`${s}_knee`, 'flex', kneeFlex);
    out[`${s}_foot`] = rot(`${s}_ankle`, 'dorsi', A[`ankle_dorsi_${S}`]);
    out[`${s}_toes`] = rot(`${s}_mtp`, 'flex', A[`toe_flex_${S}`]);
  }
  out.pelvis = m4I();
  return out;
}

function checkExternal(m, what) {
  if (!m || m.length !== 16) throw new Error(`ns:body_pose: options.external.${what} must be a 4x4 column-major matrix`);
  for (let i = 0; i < 16; i++) if (!Number.isFinite(m[i])) throw new Error(`ns:body_pose: options.external.${what} has a non-finite element`);
  return Float64Array.from(m);
}

/** Rigid blend of segment matrices for one muscle: weighted, sign-aligned quaternion average for the rotation, and the
 * translation that maps the muscle's rest centroid to the weighted average of where each segment would carry it. */
function blendMatrix(blend, segMats, c) {
  if (blend.length === 1) return segMats[blend[0][0]];
  const q0 = quatOf(segMats[blend[0][0]]);
  const q = [0, 0, 0, 0];
  let target = [0, 0, 0];
  const total = blend.reduce((t, [, w]) => t + w, 0) || 1;
  for (const [s, w0] of blend) {
    const w = w0 / total, m = segMats[s], qs = quatOf(m);
    const sg = qs[0] * q0[0] + qs[1] * q0[1] + qs[2] * q0[2] + qs[3] * q0[3] < 0 ? -1 : 1;
    for (let k = 0; k < 4; k++) q[k] += sg * w * qs[k];
    target = add(target, scl(m4Point(m, c), w));
  }
  const l = Math.hypot(...q) || 1;
  const qn = q.map(x => x / l);
  const R = m4FromQuat(qn, [0, 0, 0]);
  return m4FromQuat(qn, sub(target, m4Point(R, c)));
}

/** Eigenvector of the largest eigenvalue of a symmetric 4x4 matrix (cyclic Jacobi). */
function topEigenvector4(N) {
  const a = N.map(r => r.slice()), v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += a[i][j] * a[i][j];
    if (off < 1e-24) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/** Least-squares rigid transform (Horn 1987, unit quaternions) mapping rest points P onto target points Q (flat). */
function rigidFit(P, Q) {
  const n = P.length / 3;
  const cp = centroidOf(P), cq = centroidOf(Q);
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  for (let i = 0; i < 3 * n; i += 3) {
    const ax = P[i] - cp[0], ay = P[i + 1] - cp[1], az = P[i + 2] - cp[2];
    const bx = Q[i] - cq[0], by = Q[i + 1] - cq[1], bz = Q[i + 2] - cq[2];
    Sxx += ax * bx; Sxy += ax * by; Sxz += ax * bz;
    Syx += ay * bx; Syy += ay * by; Syz += ay * bz;
    Szx += az * bx; Szy += az * by; Szz += az * bz;
  }
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]
  ];
  const [w, x, y, z] = topEigenvector4(N);
  const l = Math.hypot(w, x, y, z) || 1;
  const q = [x / l, y / l, z / l, w / l];
  const R = m4FromQuat(q, [0, 0, 0]);
  return m4FromQuat(q, sub(cq, m4Point(R, cp)));
}

/** Segment indices a muscle's fit samples actually use (cached per fit record). */
const fitUsedCache = new WeakMap();
function fitUsed(f) {
  let list = fitUsedCache.get(f);
  if (!list) {
    const used = new Set();
    for (let k = 0; k < f.i0.length; k++) { used.add(f.i0[k]); if (f.w0[k] < 1) used.add(f.i1[k]); }
    fitUsedCache.set(f, (list = [...used]));
  }
  return list;
}
const sameMatrix = (a, b) => { for (let k = 0; k < 16; k++) if (Math.abs(a[k] - b[k]) > 1e-12) return false; return true; };

/** Two-influence linear-blend skinning of a muscle's fit samples with segment matrices `mats` (BODY_SEGMENTS order). */
function skinFitSamples(f, mats) {
  const Q = new Float64Array(f.p.length);
  for (let k = 0, i = 0; k < f.i0.length; k++, i += 3) {
    const a = mats[f.i0[k]], b = mats[f.i1[k]], wa = f.w0[k], wb = 1 - wa;
    const x = f.p[i], y = f.p[i + 1], z = f.p[i + 2];
    for (let r = 0; r < 3; r++) Q[i + r] = wa * (a[r] * x + a[4 + r] * y + a[8 + r] * z + a[12 + r]) + wb * (b[r] * x + b[4 + r] * y + b[8 + r] * z + b[12 + r]);
  }
  return Q;
}

/** One rigid matrix for a muscle: skin its fit samples with the two-influence weights, then fit. Exact when every
 * influencing segment has the same matrix (for example the zero pose). */
function fittedMatrix(f, mats) {
  const list = fitUsed(f), m0 = mats[list[0]];
  if (list.every(i => sameMatrix(mats[i], m0))) return m0;
  return rigidFit(f.p, skinFitSamples(f, mats));
}

/** World (rest -> posed, Float64) matrix of every segment for clamped targets, anchor and external matrices. */
function worldSegments(rig, applied, options) {
  const local = localMatrices(rig, applied);
  const anchor = options.anchor === undefined ? 'pelvis' : options.anchor;
  if (!SEG_INDEX.has(anchor)) throw new Error(`ns:body_pose: unknown anchor segment ${JSON.stringify(anchor)}`);
  const ext = options.external || {};
  const world = {};
  for (const s of BODY_SEGMENTS) {
    if (VIRTUAL_SEGMENTS.includes(s) && ext[s]) { world[s] = checkExternal(ext[s], s); continue; }
    const p = BODY_SEGMENT_PARENT[s];
    world[s] = p ? m4Mul(world[p], local[s]) : local[s];
  }
  if (anchor !== 'pelvis') {
    const inv = m4RigidInv(world[anchor]);
    for (const s of BODY_SEGMENTS) world[s] = m4Mul(inv, world[s]);
  }
  return { world, anchor };
}

/**
 * Pose the rig. Targets use the agreed ids and degrees (ns-bodymap JOINT_SEMANTICS); they are clamped to
 * BODY_JOINT_LIMITS first.
 * @param options.anchor 'pelvis' (default: the body stands on its pelvis) or any segment id (for example 'skull', so
 *   the head, and an eye camera attached to it, stays still while the rest of the body moves relative to it).
 * @param options.external { l_girdle?, l_upperarm? }: shared-frame rest->posed matrices from the left-arm rig, used as
 *   those virtual segments' world matrices (so the left pectoralis/trapezius/serratus follow the left arm).
 * @param options.muscleMode 'fit' (default: least-squares rigid fit to the skinned sample vertices) or 'blend'
 *   (weighted quaternion average of the attaching segments; cheaper, drifts more on multi-joint muscles).
 * @param options.baked a bakeBodyPosture() result (round 3). The returned mesh matrices then map the BAKED geometry
 *   (baked.meshesById, the body already in its rest posture) to the posed geometry, so they are the identity whenever
 *   the targets equal the baked posture's angles. Pass absolute targets (bodyPostureTargets), not offsets.
 *   `segments` maps the source-pose geometry to the drawn pose (including the baked posture's keep correction).
 * @returns { matrices: Map(meshId -> Float32Array(16)), segments: Map(segmentId -> Float32Array(16)), applied,
 *   clamped, ignored, nonFinite, face, anchor, relativeTo: 'source' | 'baked' }
 */
export function poseBodyDetailed(rig, jointTargetsDeg = {}, options = {}) {
  checkRig(rig);
  const t = clampBodyJointTargets(jointTargetsDeg);
  const { world, anchor } = worldSegments(rig, t.applied, options);
  const baked = options.baked === undefined || options.baked === null ? null : checkBaked(rig, options.baked);
  // A baked posture's constant keep correction applies to every pose, so the deltas are relative to the drawn geometry.
  if (baked) for (const s of BODY_SEGMENTS) world[s] = m4Mul(baked._internal.keepM, world[s]);
  const matrices = new Map();
  const fits = rig._fit || {};
  const mode = options.muscleMode === 'blend' ? 'blend' : 'fit';
  const mats = BODY_SEGMENTS.map(s => world[s]);
  for (const [id, info] of Object.entries(rig.meshSegment)) {
    let m;
    if (baked) m = bakedDelta(rig, baked, id, info, world, mats, mode);
    else if (info.kind === 'bone' || info.blend.length === 1) m = world[info.segment];
    else if (mode === 'fit' && fits[id]) m = fittedMatrix(fits[id], mats);
    else m = blendMatrix(info.blend, world, info.restCentroid || [0, 0, 0]);
    matrices.set(id, Float32Array.from(m));
  }
  const segments = new Map(BODY_SEGMENTS.map(s => [s, Float32Array.from(world[s])]));
  return { matrices, segments, applied: t.applied, clamped: t.clamped, ignored: t.ignored, nonFinite: t.nonFinite, face: faceDisplayLevels(t.applied), anchor, relativeTo: baked ? 'baked' : 'source' };
}

/** Shared interface 3: Map(meshId -> 4x4 column-major Float32Array) in the shared BodyParts3D frame (mm). */
export function poseBody(rig, jointTargetsDeg = {}, options = {}) {
  return poseBodyDetailed(rig, jointTargetsDeg, options).matrices;
}

// ---------------------------------------------------------------------------------------------------------------------
// Optional two-influence skin weights (same layout as ns-rig skinApply, over BODY_SEGMENTS indices)

/**
 * Per-vertex two-influence weights for a muscle mesh: the two nearest candidate segments by the same distance rule
 * that produced its rigid blend. Returns { segments: BODY_SEGMENTS, i0, i1 (Uint8Array), w0, w1 (Float32Array) } or
 * null when the muscle is unknown or has fewer than two candidate segments with geometry.
 * options.nearest: 'index' (default, round 4) or 'scan' (every cloud point; same result, for the exactness test).
 */
export function bodySkinWeights(rig, meshId, restPositions, options = {}) {
  checkRig(rig);
  const info = rig.meshSegment[meshId];
  const p = positionsOf(restPositions);
  if (!info || info.kind !== 'muscle' || !p) return null;
  const clouds = rig._clouds || {};
  const avail = (info.candidates || []).filter(s => clouds[s]);
  if (avail.length < 2) return null;
  const n = p.length / 3;
  const i0 = new Uint8Array(n), i1 = new Uint8Array(n), w0 = new Float32Array(n), w1 = new Float32Array(n);
  const near = nearestSearch(clouds, options && options.nearest);
  for (let v = 0; v < n; v++) {
    const w = near(avail, p[3 * v], p[3 * v + 1], p[3 * v + 2]);
    i0[v] = SEG_INDEX.get(w.a); w0[v] = w.wa;
    i1[v] = SEG_INDEX.get(w.b || w.a); w1[v] = w.wb;
  }
  return { segments: BODY_SEGMENTS, i0, i1, w0, w1 };
}

/** Linear-blend skinning of rest positions with bodySkinWeights and poseBodyDetailed().segments. */
export function skinBodyPositions(segmentMatrices, weights, restPositions, out) {
  if (!(segmentMatrices instanceof Map)) throw new Error('ns:body_skin: segmentMatrices must be a Map(segment -> matrix)');
  const p = positionsOf(restPositions);
  if (!p || !weights || !weights.i0) throw new Error('ns:body_skin: need rest positions and bodySkinWeights output');
  const n = p.length / 3;
  const o = out || new Float32Array(p.length);
  if (o.length !== p.length) throw new Error('ns:body_skin: out must match restPositions length');
  const mats = BODY_SEGMENTS.map(s => segmentMatrices.get(s) || null);
  for (let v = 0; v < n; v++) {
    const k = 3 * v, x = p[k], y = p[k + 1], z = p[k + 2];
    const a = mats[weights.i0[v]], b = mats[weights.i1[v]], wa = weights.w0[v], wb = weights.w1[v];
    if (!a || !b) throw new Error(`ns:body_skin: missing segment matrix at vertex ${v}`);
    for (let r = 0; r < 3; r++) {
      o[k + r] = wa * (a[r] * x + a[4 + r] * y + a[8 + r] * z + a[12 + r]) + wb * (b[r] * x + b[4 + r] * y + b[8 + r] * z + b[12 + r]);
    }
  }
  return o;
}

// ---------------------------------------------------------------------------------------------------------------------
// Muscle drives

// Default catalog: every muscle mesh of FULLBODY-MESH-MANIFEST.json (id: source name). Tests check it equals the
// manifest. bodyMuscleDrives uses rig.muscles instead when a rig is passed.

const ACTION_INDEX = new Map();
for (const r of BODY_MOTOR_MAP.regions || []) for (const a of r.actions || []) ACTION_INDEX.set(a.id, a);

let defaultCatalog = null;
/** The default catalog as rig-style muscle records [{ id, name, side, aliases }]. */
export function defaultMuscleCatalog() {
  if (!defaultCatalog) {
    defaultCatalog = Object.freeze(FULLBODY_MUSCLE_CATALOG.map(([id, name, side, cy]) =>
      Object.freeze({ id, name, side, aliases: Object.freeze(muscleAliases(name, [0, cy, 0])) })));
  }
  return defaultCatalog;
}
function catalogOf(options) {
  if (options.rig) { checkRig(options.rig); return options.rig.muscles; }
  if (Array.isArray(options.catalog)) return options.catalog;
  return defaultMuscleCatalog();
}

const matchCache = new WeakMap();
function idsForName(catalog, muscleName) {
  let cache = matchCache.get(catalog);
  if (!cache) matchCache.set(catalog, (cache = new Map()));
  const key = lowerName(muscleName);
  if (cache.has(key)) return cache.get(key);
  const ids = [];
  for (const m of catalog) {
    const names = m.aliases && m.aliases.length ? m.aliases : [m.name];
    if (names.some(n => muscleNameMatches(n, key))) ids.push(m.id);
  }
  cache.set(key, ids);
  return ids;
}

/** Normalise active actions: ns-actions activeBodyActions() rows, [{ actionId, level }], action-id strings, or an
 * object/Map { actionId: level }. Rows may carry their own agonists/antagonists; otherwise BODY_MOTOR_MAP supplies them. */
function actionRows(activeActions) {
  if (!activeActions) return [];
  let rows;
  if (activeActions instanceof Map) rows = [...activeActions].map(([actionId, level]) => ({ actionId, level }));
  else if (Array.isArray(activeActions)) rows = activeActions.map(r => (typeof r === 'string' ? { actionId: r, level: 1 } : r));
  else if (typeof activeActions === 'object') rows = Object.entries(activeActions).map(([actionId, level]) => ({ actionId, level }));
  else return [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const actionId = r.actionId || r.id || null;
    const a = actionId ? ACTION_INDEX.get(actionId) : null;
    const rawLevel = r.level !== undefined ? r.level : r.drive !== undefined ? r.drive : 1;
    const level = clamp(Number.isFinite(rawLevel) ? rawLevel : 0, 0, 1);
    const agonists = Array.isArray(r.agonists) ? r.agonists : a ? a.agonists : [];
    const antagonists = Array.isArray(r.antagonists) ? r.antagonists : a ? a.antagonists : [];
    const stabilizers = Array.isArray(r.stabilizers) ? r.stabilizers : a && a.stabilizers ? a.stabilizers : [];
    if (level > 0) out.push({ actionId, level, agonists, antagonists, stabilizers });
  }
  return out;
}

/**
 * Simulated muscle display drives with diagnostics.
 * @returns { drives: { meshId: 0..1 }, byName: { muscleName: 0..1 }, unmatched: [names with no mesh in the catalog],
 *   unmatchedByAction: { actionId: [names] } }. Left-arm muscles live in MESH-MANIFEST.json (ns-arm drives them), so
 *   left-arm actions list their forearm/hand names as unmatched here; missing BodyParts3D 4.0 muscles (rectus
 *   abdominis, latissimus dorsi, masseter, temporalis, facial-expression muscles, ...) appear the same way, which the
 *   info overlay can show as "not available as a mesh".
 * Agonists take the action level, stabilisers level x stabilizerGain, antagonists level x antagonistGain (a low display
 * floor, not inhibition data); per mesh the maximum wins. Unitless display values, not EMG, force or nerve activity.
 */
export function bodyMuscleDriveReport(activeActions, options = {}) {
  const { antagonistGain = 0.08, stabilizerGain = 0.3 } = options;
  const catalog = catalogOf(options);
  const byName = {}, unmatchedByAction = {};
  const put = (n, v) => { if (v > 0 && !(byName[n] >= v)) byName[n] = v; };
  for (const r of actionRows(activeActions)) {
    for (const n of r.agonists) put(n, r.level);
    for (const n of r.stabilizers) put(n, r.level * stabilizerGain);
    for (const n of r.antagonists) put(n, r.level * antagonistGain);
    const miss = [...new Set([...r.agonists, ...r.stabilizers, ...r.antagonists])].filter(n => !idsForName(catalog, n).length);
    if (miss.length && r.actionId) unmatchedByAction[r.actionId] = miss;
  }
  const drives = {}, unmatched = [];
  for (const [n, v] of Object.entries(byName)) {
    const ids = idsForName(catalog, n);
    if (!ids.length) unmatched.push(n);
    for (const id of ids) if (!(drives[id] >= v)) drives[id] = clamp(v, 0, 1);
  }
  return { drives, byName, unmatched, unmatchedByAction };
}

/** Shared interface 3: { muscleMeshId: 0..1 } for the active body actions (see bodyMuscleDriveReport). Pass
 * { rig } to match against that rig's muscles instead of the default full-body catalog. */
export function bodyMuscleDrives(activeActions, options = {}) {
  return bodyMuscleDriveReport(activeActions, options).drives;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rest posture (round 3, R3-body): the fixed first-person body SITS
//
// Why seated: from the first-person eye of the upright BodyParts3D body the chest (anterior surface about y = -214 mm)
// lies in front of the line of sight to the thighs and feet, so a standing body shows only the chest when you look down
// (round 2 needed an eye shift and a dithered see-through window). Seated, the thighs run forward from the hips, so
// looking down shows the chest and belly near you, then the lap, the knees and, past the knees, the feet: nothing has
// to be see-through. A seated player is also the ordinary way to play a desktop game. The upper body is NOT moved
// (no trunk, neck or jaw angle), so the head, the first-person eye, the face layer and the left-arm shoulder stay
// exactly where they were. No chair or floor is drawn; the posture is a display choice, not a measured pose.

/**
 * Rest postures in degrees from the BodyParts3D source pose (same ids and signs as BODY_JOINT_LIMITS / ns-bodymap
 * JOINT_SEMANTICS; missing ids are 0). Display choices inside ordinary adult ranges of motion, not measured on anyone.
 *  - 'seated' (DEFAULT_BODY_POSTURE): sitting upright on an ordinary seat, thighs level to slightly rising toward the
 *    knees (hips flexed 95 deg), lower legs reaching a little forward (knees flexed 45 deg) with relaxed ankles (15 deg
 *    toes-down). Chosen from rendered candidates and a body-only ID-buffer scan (round3/R3-body-NOTES.md): with the
 *    knees bent 55-70 deg the knees hide most of the feet from the eye; hips at 95 instead of 85 deg show the kneecaps
 *    on 0.105 % instead of 0.066 % of the far-down view.
 *    Right arm (round 4, R4-body): the forearm rests forward at the side of the body, as if on an armrest (none is
 *    drawn): upper arm 15 deg forward and 15 deg out, elbow bent 85 deg (forearm about 10 deg above level), forearm
 *    turned past thumb-up so the palm faces mostly down and in (115 of 160 deg), wrist bent 10 deg, fingers loosely
 *    curled 20 deg. Why: the round-3 arm (shoulder 5 / 12, elbow 40, turn 85) let the hand hang beside the right knee,
 *    about 59 deg below eye level, so at a far-right look the hand only came into view at a 25 deg downward look
 *    (half the hand; 27.5 deg for 90 %). Resting forward at elbow height it is about 44 deg below eye level and comes
 *    into view at 10 deg (half) / 12.5 deg (90 %), measured in the game with its own camera, trunk turn and HUD
 *    (round4/R4-body-NOTES.md). A forearm resting ON the thigh was measured too: this rig has no shoulder rotation or
 *    adduction below 0, so the forearm stays in the shoulder's plane, beside the thigh about 90 mm above it, and the hand
 *    stays about 52 deg below eye level (in view only at an 18 deg downward look); it would look like floating.
 *  - 'anatomical': the source pose itself (standing, arms at the sides, palms forward): every angle 0.
 */
export const BODY_POSTURES = deepFreezeRig({
  anatomical: {},
  seated: {
    hip_flex_L: 95, hip_flex_R: 95, knee_ext_L: -45, knee_ext_R: -45, ankle_dorsi_L: -15, ankle_dorsi_R: -15,
    r_shoulder_flex: 15, r_shoulder_abd: 15, r_elbow_flex: 85, r_pronation: 115, r_wrist_flex: 10, r_grasp: 20
  }
});
/**
 * Display caps for posture-relative targets (bodyPostureTargets), tighter than BODY_JOINT_LIMITS where the rigid 3D
 * meshes would pass into each other (round 4, R4-body). 'seated': lifting a thigh stops at 110 deg hip flexion (15 deg
 * above the seated 95; the body map asks +35, which BODY_JOINT_LIMITS would clamp at 120). Beyond that the thigh
 * muscles pass into the belly wall. Torso vertices inside a leg mesh (every 3rd vertex; a vertical ray up and down must
 * both cross the mesh an odd number of times), both thighs lifted as posed in the game: 114 at rest (the psoas tendons
 * at their femur attachments), 379 at 110 deg, 3504 at 120 deg, most of them the external oblique inside the adductor
 * magnus (one leg baked at each angle: 58 at 95 deg, 91 at 100, 233 at 110, 840 at 115, 1892 at 120). Real soft tissue
 * would squash; these meshes cannot. The legs never pass into each other in any leg action (unit test R4-body-pose).
 * The seated right elbow bends at most to 120 deg (the body map's +80 would reach the 145 deg limit from the 85 deg
 * armrest rest): "bend right elbow" then ends where it ended in round 3 (40 + 80), with the hand about 265 mm from the
 * eye, instead of about 164 mm at 145 deg, where the hand fills the lower corner of the view.
 */
export const BODY_POSTURE_LIMITS = deepFreezeRig({
  anatomical: {},
  seated: { hip_flex_L: [-20, 110], hip_flex_R: [-20, 110], r_elbow_flex: [0, 120] }
});
/** The posture the game uses (decision D4, round 3). */
export const DEFAULT_BODY_POSTURE = 'seated';
/** Plain-language posture lines for the HUD / Esc page (R17). */
export const BODY_POSTURE_TEXT = Object.freeze({
  seated: 'Your body sits still (no chair is drawn). Your right forearm rests forward, as if on an armrest. Look down to see your chest, lap, knees and feet. Look right and a little down to see your right arm.',
  anatomical: 'Your simulated body stands still with its arms at its sides.'
});

/**
 * Full rest angles of a posture: a BODY_POSTURES name, an object of { jointId: deg }, or a bakeBodyPosture() result.
 * Throws for an unknown name or id, a non-finite value or an angle outside BODY_JOINT_LIMITS (postures are constants).
 * @returns { every BODY_JOINT_ID: deg }
 */
export function bodyPostureAngles(posture = DEFAULT_BODY_POSTURE) {
  let src;
  if (typeof posture === 'string') {
    src = Object.prototype.hasOwnProperty.call(BODY_POSTURES, posture) ? BODY_POSTURES[posture] : null;
    if (!src) throw new Error(`ns:body_posture: unknown posture ${JSON.stringify(posture)} (known: ${Object.keys(BODY_POSTURES).join(', ')})`);
  } else if (posture && posture.kind === 'ns-body-baked-posture') src = posture.angles;
  else if (posture instanceof Map) src = Object.fromEntries(posture);
  else if (posture && typeof posture === 'object') src = posture;
  else throw new Error('ns:body_posture: posture must be a BODY_POSTURES name, an object of joint angles or a baked posture');
  const t = clampBodyJointTargets(src);
  if (t.ignored.length || t.nonFinite.length || t.clamped.length) {
    throw new Error(`ns:body_posture: invalid posture (unknown ${JSON.stringify(t.ignored)}, non-finite ${JSON.stringify(t.nonFinite)}, outside limits ${JSON.stringify(t.clamped.map(c => c.id))})`);
  }
  return t.applied;
}

/**
 * Joint limits for posing on top of a posture: BODY_JOINT_LIMITS with the posture's BODY_POSTURE_LIMITS display caps
 * (a BODY_POSTURES name or a bakeBodyPosture() result of a named posture; an angles object gets no caps).
 * @returns { every BODY_JOINT_ID: [minDeg, maxDeg] }
 */
export function bodyPostureLimits(posture = DEFAULT_BODY_POSTURE) {
  const name = typeof posture === 'string' ? posture : posture && posture.kind === 'ns-body-baked-posture' ? posture.posture : null;
  const caps = name && Object.prototype.hasOwnProperty.call(BODY_POSTURE_LIMITS, name) ? BODY_POSTURE_LIMITS[name] : {};
  const out = {};
  for (const id of BODY_JOINT_IDS) {
    const L = BODY_JOINT_LIMITS[id], c = caps[id];
    out[id] = c ? Object.freeze([Math.max(L[0], c[0]), Math.min(L[1], c[1])]) : L;
  }
  return Object.freeze(out);
}

/** Normalise active actions for posing: like actionRows, but the POSE drive (`drive`) comes first, then `level`. */
function poseRows(activeActions) {
  if (!activeActions) return [];
  let rows;
  if (activeActions instanceof Map) rows = [...activeActions].map(([actionId, drive]) => ({ actionId, drive }));
  else if (Array.isArray(activeActions)) rows = activeActions.map(r => (typeof r === 'string' ? { actionId: r, drive: 1 } : r));
  else if (typeof activeActions === 'object') rows = Object.entries(activeActions).map(([actionId, drive]) => ({ actionId, drive }));
  else return [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const actionId = r.actionId || r.id || null;
    const a = actionId ? ACTION_INDEX.get(actionId) : null;
    const raw = r.drive !== undefined ? r.drive : r.level !== undefined ? r.level : 1;
    const drive = clamp(Number.isFinite(raw) ? raw : 0, 0, 1);
    const joints = r.joints && typeof r.joints === 'object' ? r.joints : a && a.joints ? a.joints : {};
    if (drive > 0 && Object.keys(joints).length) out.push({ actionId, drive, joints });
  }
  return out;
}

/**
 * Absolute joint targets (degrees from the source pose, for poseBody) for the active body actions on top of a rest
 * posture. This replaces ns-actions bodyJointTargets for posing when the body has a rest posture:
 *  - An action whose map target for a joint is NOT 0 moves that joint by its target FROM THE REST POSTURE (hip flexion
 *    +35 lifts the seated thigh 35 deg further, knee flexion -45 bends the seated knee 45 deg further).
 *  - An action whose map target is exactly 0 is a "back to the source pose" action (knee or elbow straightening,
 *    forearm supination, jaw clench): it moves the joint from the rest angle toward 0 (a seated knee straightens).
 * Competing actions blend as in ns-actions composeBodyJoints (each joint: drive / max(1, sum of drives)); the result is
 * clamped to `limits` (default: BODY_JOINT_LIMITS with the posture's BODY_POSTURE_LIMITS display caps, so a seated thigh
 * lifts at most to 110 deg and the seated right elbow bends at most to 120 deg). With the 'anatomical' posture the
 * result equals composeBodyJoints exactly.
 * @param activeActions ns-actions activeBodyActions() rows ({ actionId, drive, level, ... }; the pose `drive` is
 *   used, else `level`), [{ actionId, drive }], action-id strings (drive 1), or { actionId: drive } / a Map.
 *   Rows may carry their own `joints`; otherwise BODY_MOTOR_MAP supplies them. Rows without joints are ignored.
 * @param options { posture = DEFAULT_BODY_POSTURE (name, angles or baked posture), limits = bodyPostureLimits(posture) }
 * @returns { every BODY_JOINT_ID: deg }
 */
export function bodyPostureTargets(activeActions, { posture = DEFAULT_BODY_POSTURE, limits = bodyPostureLimits(posture) } = {}) {
  const rest = bodyPostureAngles(posture);
  const rows = poseRows(activeActions);
  const total = {};
  for (const r of rows) for (const j of Object.keys(r.joints)) total[j] = (total[j] || 0) + r.drive;
  const out = { ...rest };
  for (const r of rows) {
    for (const [j, deg] of Object.entries(r.joints)) {
      if (!Object.prototype.hasOwnProperty.call(out, j) || typeof deg !== 'number' || !Number.isFinite(deg)) continue;
      out[j] += (r.drive / Math.max(1, total[j])) * (deg === 0 ? -rest[j] : deg);
    }
  }
  for (const j of BODY_JOINT_IDS) {
    const L = limits && limits[j] ? limits[j] : BODY_JOINT_LIMITS[j];
    out[j] = clamp(out[j], L[0], L[1]) + 0;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Exact nearest-neighbour index (round 4, R4-body, load time)
//
// The rig's muscle blends (buildBodyRig), bodySkinWeights and the posture bake all ask the same question per muscle
// vertex: how far is it from each candidate bone's voxel-downsampled point cloud, and which two bones are nearest? In
// round 3 the rig answered it by scanning every cloud point (about 250 ms at load in Node) and the bake with a plain
// k-d tree (about 270 ms, code F3). This index answers it exactly and much faster:
//  - a bucket k-d tree (at most NN_LEAF points per leaf, split at the median of the widest axis) with a bounding box
//    per node and an iterative search that visits the nearer child first;
//  - a warm start: the search begins with the previous query's nearest point of the same cloud (consecutive mesh
//    vertices are close), so most subtrees are skipped at once.
// Why it is exact (the same double as nearestDistance, so the same rig, weights and baked bytes; unit test
// R4-body-bake): every point's squared distance is computed with the same expression (dx * dx + dy * dy + dz * dz with
// dx = point - query), and a subtree is skipped only when the squared distance to its box (computed per axis in the
// same order, and never larger than any of its points' squared distances, because rounding is monotonic) is not
// smaller than the best value found so far, so it cannot hold a strictly smaller value. The warm-start point is one of
// the cloud's points. The minimum of the same set of doubles does not depend on the visiting order.

const NN_LEAF = 8;
/** Partially order `order[lo, hi)` by coordinate `axis` so that order[k] has no larger key before it and no smaller key
 * after it (Hoare quickselect). The index's correctness never depends on the split: every node's box is computed from
 * the points it actually holds. */
function nnSelect(order, cloud, axis, lo, hi, k) {
  let l = lo, r = hi - 1;
  while (r > l) {
    const pivot = cloud[3 * order[(l + r) >> 1] + axis];
    let i = l, j = r;
    while (i <= j) {
      while (cloud[3 * order[i] + axis] < pivot) i++;
      while (cloud[3 * order[j] + axis] > pivot) j--;
      if (i <= j) { const t = order[i]; order[i] = order[j]; order[j] = t; i++; j--; }
    }
    if (k <= j) r = j; else if (k >= i) l = i; else break;
  }
}
/** Build the index of one cloud (Float64Array or Float32Array of xyz). */
function nnIndex(cloud) {
  const n = cloud.length / 3;
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const cap = Math.max(1, 2 * Math.ceil(n / NN_LEAF) + 1) * 2;
  const lo = new Int32Array(cap), hi = new Int32Array(cap), left = new Int32Array(cap), right = new Int32Array(cap), parent = new Int32Array(cap);
  const box = new Float64Array(cap * 6);
  let count = 0;
  const make = (a, b) => {
    const k = count++;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = a; i < b; i++) {
      const j = 3 * order[i], x = cloud[j], y = cloud[j + 1], z = cloud[j + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    box[6 * k] = x0; box[6 * k + 1] = y0; box[6 * k + 2] = z0; box[6 * k + 3] = x1; box[6 * k + 4] = y1; box[6 * k + 5] = z1;
    lo[k] = a; hi[k] = b; left[k] = -1; right[k] = -1;
    if (b - a > NN_LEAF) {
      const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0;
      const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
      const m = (a + b) >> 1;
      nnSelect(order, cloud, axis, a, b, m);
      left[k] = make(a, m);
      right[k] = make(m, b);
      parent[left[k]] = k; parent[right[k]] = k;
    }
    return k;
  };
  if (n > 0) { make(0, n); parent[0] = -1; }
  const pts = new Float64Array(3 * n), leafOf = new Int32Array(n);
  for (let i = 0; i < n; i++) { const j = 3 * order[i]; pts[3 * i] = cloud[j]; pts[3 * i + 1] = cloud[j + 1]; pts[3 * i + 2] = cloud[j + 2]; }
  for (let k = 0; k < count; k++) if (left[k] < 0) for (let i = lo[k]; i < hi[k]; i++) leafOf[i] = k;
  return { n, pts, lo, hi, left, right, parent, leafOf, box, nodes: count, last: 0, stack: new Int32Array(128), stackD: new Float64Array(128) };
}
/** Squared distance from (x, y, z) to node k's box: per axis in the order x, y, z (see the exactness note above).
 * nnNearestD2 inlines the same expression in its hot loops. */
function nnBoxD2(B, k, x, y, z) {
  const o = 6 * k;
  const gx = x < B[o] ? B[o] - x : x > B[o + 3] ? x - B[o + 3] : 0;
  const gy = y < B[o + 1] ? B[o + 1] - y : y > B[o + 4] ? y - B[o + 4] : 0;
  const gz = z < B[o + 2] ? B[o + 2] - z : z > B[o + 5] ? z - B[o + 5] : 0;
  return gx * gx + gy * gy + gz * gz;
}
/** Exact smallest squared distance from (x, y, z) to the indexed cloud (Infinity for an empty cloud). The search
 * starts in the leaf of the previous query's nearest point (the warm start), then walks up to the root and searches
 * each sibling subtree on the way whose box is nearer than the best point so far. The start leaf and those siblings
 * together are the whole tree, so every point is either measured or provably not nearer. */
function nnNearestD2(t, x, y, z) {
  if (!t.n) return Infinity;
  const P = t.pts, B = t.box, L = t.left, R = t.right, LO = t.lo, HI = t.hi, PA = t.parent;
  let bi = t.last, best = Infinity;
  const k0 = t.leafOf[bi];
  for (let i = LO[k0], e2 = HI[k0]; i < e2; i++) {
    const j = 3 * i, dx = P[j] - x, dy = P[j + 1] - y, dz = P[j + 2] - z, e = dx * dx + dy * dy + dz * dz;
    if (e < best) { best = e; bi = i; }
  }
  for (let node = k0, up = PA[k0]; up >= 0; node = up, up = PA[up]) {
    const sib = L[up] === node ? R[up] : L[up];
    let d;
    { const o = 6 * sib;
      const gx = x < B[o] ? B[o] - x : x > B[o + 3] ? x - B[o + 3] : 0;
      const gy = y < B[o + 1] ? B[o + 1] - y : y > B[o + 4] ? y - B[o + 4] : 0;
      const gz = z < B[o + 2] ? B[o + 2] - z : z > B[o + 5] ? z - B[o + 5] : 0;
      d = gx * gx + gy * gy + gz * gz; }
    if (d >= best) continue;
    // Search the sibling subtree (nearer child first; skip boxes not nearer than the best so far).
    const S = t.stack, SD = t.stackD;
    let sp = 0;
    S[sp] = sib; SD[sp] = d; sp++;
    while (sp > 0) {
      sp--;
      if (SD[sp] >= best) continue;
      let k = S[sp];
      while (L[k] >= 0) {
        const a = L[k], b = R[k];
        let da, db;
        { const o = 6 * a;
          const gx = x < B[o] ? B[o] - x : x > B[o + 3] ? x - B[o + 3] : 0;
          const gy = y < B[o + 1] ? B[o + 1] - y : y > B[o + 4] ? y - B[o + 4] : 0;
          const gz = z < B[o + 2] ? B[o + 2] - z : z > B[o + 5] ? z - B[o + 5] : 0;
          da = gx * gx + gy * gy + gz * gz; }
        { const o = 6 * b;
          const gx = x < B[o] ? B[o] - x : x > B[o + 3] ? x - B[o + 3] : 0;
          const gy = y < B[o + 1] ? B[o + 1] - y : y > B[o + 4] ? y - B[o + 4] : 0;
          const gz = z < B[o + 2] ? B[o + 2] - z : z > B[o + 5] ? z - B[o + 5] : 0;
          db = gx * gx + gy * gy + gz * gz; }
        let near, far, dfar, dnear;
        if (da <= db) { near = a; dnear = da; far = b; dfar = db; } else { near = b; dnear = db; far = a; dfar = da; }
        if (dfar < best) { S[sp] = far; SD[sp] = dfar; sp++; }
        if (dnear >= best) { k = -1; break; }
        k = near;
      }
      if (k < 0) continue;
      for (let i = LO[k], e2 = HI[k]; i < e2; i++) {
        const j = 3 * i, dx = P[j] - x, dy = P[j + 1] - y, dz = P[j + 2] - z, e = dx * dx + dy * dy + dz * dz;
        if (e < best) { best = e; bi = i; }
      }
    }
  }
  t.last = bi;
  return best;
}
/** Lower bound of the distance from a point to any point of an index (its root box). */
function nnRootDistance(t, x, y, z) {
  return t.n ? Math.sqrt(nnBoxD2(t.box, 0, x, y, z)) : Infinity;
}
/** One index per cloud, built once per clouds object and reused by every mesh (rig build, skin weights, bake). */
const nnCache = new WeakMap();
function cloudIndexes(clouds) {
  let idx = nnCache.get(clouds);
  if (!idx) {
    idx = {};
    for (const [s, c] of Object.entries(clouds || {})) idx[s] = nnIndex(c);
    nnCache.set(clouds, idx);
  }
  return idx;
}
const NN_LB = new Float64Array(64), NN_D = new Float64Array(64);
// The index path returns this one object (overwritten by the next call; every caller reads it at once), so the
// several hundred thousand queries at load allocate nothing.
const NN_OUT = { a: null, wa: 1, b: null, wb: 0 };
function twoNearestInto(o, a, da, b, db) {
  o.a = a; o.b = b;
  if (!b) { o.wa = 1; o.wb = 0; return o; }
  const qa = da * da, qb = db * db, t = qa + qb;
  const wa = t > 1e-12 ? qb / t : 0.5;
  o.wa = wa; o.wb = 1 - wa;
  return o;
}
/** twoNearest with the exact index and root-box pruning: the same result as twoNearest (same order, same strict
 * comparisons, same distances). A candidate is skipped only when its box is farther than the larger of two known
 * distances (so farther than the final second-nearest), so it could not have been chosen. */
function twoNearestIdx(segs, idx, x, y, z) {
  const n = segs.length;
  if (n > 64) {
    let a = null, da = Infinity, b = null, db = Infinity;
    for (const s of segs) {
      const d = Math.sqrt(nnNearestD2(idx[s], x, y, z));
      if (d < da) { b = a; db = da; a = s; da = d; } else if (d < db) { b = s; db = d; }
    }
    return twoNearestInto(NN_OUT, a, da, b, db);
  }
  let i1 = -1, i2 = -1;
  for (let i = 0; i < n; i++) {
    NN_LB[i] = nnRootDistance(idx[segs[i]], x, y, z);
    NN_D[i] = -1;
    if (i1 < 0 || NN_LB[i] < NN_LB[i1]) { i2 = i1; i1 = i; } else if (i2 < 0 || NN_LB[i] < NN_LB[i2]) i2 = i;
  }
  let bound = Infinity;
  if (i2 >= 0) {
    NN_D[i1] = Math.sqrt(nnNearestD2(idx[segs[i1]], x, y, z));
    NN_D[i2] = Math.sqrt(nnNearestD2(idx[segs[i2]], x, y, z));
    bound = Math.max(NN_D[i1], NN_D[i2]);
  }
  let a = null, da = Infinity, b = null, db = Infinity;
  for (let i = 0; i < n; i++) {
    if (NN_D[i] < 0 && NN_LB[i] > bound) continue;
    const d = NN_D[i] >= 0 ? NN_D[i] : Math.sqrt(nnNearestD2(idx[segs[i]], x, y, z));
    const s = segs[i];
    if (d < da) { b = a; db = da; a = s; da = d; } else if (d < db) { b = s; db = d; }
  }
  return twoNearestInto(NN_OUT, a, da, b, db);
}
/** The search used for muscle weighting: 'index' (default, exact and fast) or 'scan' (every cloud point; the
 * round-2/3 reference, kept for the exactness unit test). */
function nearestSearch(clouds, mode) {
  if (mode === 'scan') return (segs, x, y, z) => twoNearest(segs, clouds, x, y, z);
  if (mode !== undefined && mode !== null && mode !== 'index') throw new Error(`ns:body_nearest: unknown nearest search ${JSON.stringify(mode)} (index | scan)`);
  const idx = cloudIndexes(clouds);
  return (segs, x, y, z) => twoNearestIdx(segs, idx, x, y, z);
}

function transformPositions(m, p) {
  const o = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    o[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return o;
}
function boundsOf(p) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { min, max };
}

/**
 * Per-vertex skin weights of one muscle mesh for the bake: the two nearest candidate segments (indexes into
 * BODY_SEGMENTS; the second equals the first when only one is found) and the first weight (the second is 1 - it, as in
 * twoNearestResult). They do not depend on the posture, so with the index search they are cached per rig and source
 * positions array and reused by a later bake of the same rig (another posture, Reset or a test). The 'scan' reference
 * never reads or fills the cache.
 */
const bakeWeightCache = new WeakMap();
function bakeSkinWeights(rig, id, p, avail, near, useCache) {
  let byId = useCache ? bakeWeightCache.get(rig) : null;
  if (useCache && !byId) bakeWeightCache.set(rig, (byId = new Map()));
  const hit = byId ? byId.get(id) : null;
  if (hit && hit.p === p && hit.avail === avail.join(',')) return hit;
  const n = p.length / 3, ia = new Uint8Array(n), ib = new Uint8Array(n), wa = new Float64Array(n);
  // About a third of the muscle vertices repeat an earlier vertex of the same mesh exactly (seams). The weights are a
  // pure function of the position, so a repeated position copies the first one's result (open-addressing hash on the
  // exact coordinates) instead of searching again.
  let size = 16; while (size < 2 * n) size <<= 1;
  const slot = new Int32Array(size).fill(-1), mask = size - 1;
  const f32 = new Float32Array(3), u32 = new Uint32Array(f32.buffer);
  for (let i = 0, v = 0; i < p.length; i += 3, v++) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (Math.imul(u32[0], 73856093) ^ Math.imul(u32[1], 19349663) ^ Math.imul(u32[2], 83492791)) & mask, src = -1;
    for (;;) {
      const q = slot[h];
      if (q < 0) { slot[h] = v; break; }
      if (p[3 * q] === x && p[3 * q + 1] === y && p[3 * q + 2] === z) { src = q; break; }
      h = (h + 1) & mask;
    }
    if (src >= 0) { ia[v] = ia[src]; ib[v] = ib[src]; wa[v] = wa[src]; continue; }
    const w = near(avail, x, y, z);
    ia[v] = SEG_INDEX.get(w.a); ib[v] = SEG_INDEX.get(w.b || w.a); wa[v] = w.wa;
  }
  const out = { p, avail: avail.join(','), ia, ib, wa };
  if (byId) byId.set(id, out);
  return out;
}

/**
 * Bake a rest posture into the body geometry, once after loading (round 3). Bones are moved rigidly. A muscle whose
 * candidate segments move differently in the posture (for example the thigh muscles across the flexed hip and knee) is
 * deformed per vertex with the same two-influence weights as bodySkinWeights (two nearest candidate bones, inverse
 * square distance), so it bends with the joint instead of sliding off as one rigid piece would. Other muscles move
 * rigidly. Hand `meshesById` of the result to the scene (setBody) instead of the source meshes, and pose with
 * poseBody(rig, targets, { baked }) so the matrices are relative to this geometry.
 * Genital anatomy is never baked (R15): only meshes the rig knows are returned, and buildBodyRig excludes genital
 * entries.
 * @param meshesById Map | object id -> { positions, indices, ... } (the source meshes; they are not modified)
 * @param options { posture = DEFAULT_BODY_POSTURE, keep = 'skull', nearest = 'index' }: `keep` is the segment that
 *   stays at its source place (a constant rigid correction of the whole posture), so a posture with a trunk angle does
 *   not move the head, the first-person eye or the face layer; null keeps the pelvis (the plain poseBody frame).
 *   `nearest`: 'index' (default; the exact nearest-neighbour index, round 4) or 'scan' (every cloud point; the
 *   reference the exactness unit test compares against, byte for byte).
 * @returns frozen { kind: 'ns-body-baked-posture', posture, angles, meshesById: Map(id -> { positions (posed,
 *   Float32Array), indices (shared), vertexCount, faceCount, bounds, comments }), segments: Map(segment -> posture
 *   matrix), skinned: [muscle ids deformed per vertex], rigid: [ids moved rigidly], missing: [rig ids with no mesh],
 *   ms }
 */
export function bakeBodyPosture(rig, meshesById, { posture = DEFAULT_BODY_POSTURE, keep = 'skull', nearest } = {}) {
  checkRig(rig);
  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const angles = bodyPostureAngles(posture);
  const getMesh = meshGetter(meshesById);
  const { world } = worldSegments(rig, angles, {});
  // Keep one segment (default the skull, so the first-person eye, the face layer and the camera-attached left arm stay
  // where they were) at its source place: a constant rigid correction applied to the whole posture and to every pose.
  if (keep !== null && keep !== undefined && !SEG_INDEX.has(keep)) throw new Error(`ns:body_posture: unknown keep segment ${JSON.stringify(keep)}`);
  const keepM = keep ? m4RigidInv(world[keep]) : m4I();
  for (const s of BODY_SEGMENTS) world[s] = m4Mul(keepM, world[s]);
  const mats = BODY_SEGMENTS.map(s => world[s]);
  const inv = Object.fromEntries(BODY_SEGMENTS.map(s => [s, m4RigidInv(world[s])]));
  const fits = rig._fit || {}, clouds = rig._clouds || {};
  const out = new Map(), fitBaked = {}, rigidRest = {};
  const skinned = [], rigid = [], missing = [];
  let near = null;
  const mode = nearest === undefined || nearest === null ? 'index' : nearest;
  if (mode !== 'index' && mode !== 'scan') throw new Error(`ns:body_nearest: unknown nearest search ${JSON.stringify(nearest)} (index | scan)`);
  for (const [id, info] of Object.entries(rig.meshSegment)) {
    const mesh = getMesh(id), p = positionsOf(mesh);
    let rest = null, positions = null;
    if (info.kind === 'bone' || info.blend.length === 1) rest = world[info.segment];
    else {
      const f = fits[id];
      rest = f ? fittedMatrix(f, mats) : blendMatrix(info.blend, world, info.restCentroid || [0, 0, 0]);
      rigidRest[id] = rest;
      const avail = (info.candidates || []).filter(s => clouds[s]);
      const moving = avail.length >= 2 && !avail.every(s => sameMatrix(world[s], world[avail[0]]));
      if (f && moving) {
        fitBaked[id] = skinFitSamples(f, mats);
        if (p) {
          if (!near) near = nearestSearch(clouds, mode);
          const w = bakeSkinWeights(rig, id, p, avail, near, mode === 'index');
          positions = new Float32Array(p.length);
          for (let i = 0, v = 0; i < p.length; i += 3, v++) {
            const x = p[i], y = p[i + 1], z = p[i + 2];
            const a = mats[w.ia[v]], b = mats[w.ib[v]], wa = w.wa[v], wb = 1 - wa;
            for (let r = 0; r < 3; r++) positions[i + r] = wa * (a[r] * x + a[4 + r] * y + a[8 + r] * z + a[12 + r]) + wb * (b[r] * x + b[4 + r] * y + b[8 + r] * z + b[12 + r]);
          }
          skinned.push(id);
        }
      }
    }
    if (!p) { missing.push(id); continue; }
    if (!positions) { positions = transformPositions(rest, p); rigid.push(id); }
    const baked = { positions, indices: mesh.indices || null };
    for (const k of ['vertexCount', 'faceCount', 'polygonCount', 'comments']) if (mesh[k] !== undefined) baked[k] = mesh[k];
    baked.bounds = boundsOf(positions);
    out.set(id, Object.freeze(baked));
  }
  const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const result = {
    kind: 'ns-body-baked-posture',
    posture: typeof posture === 'string' ? posture : posture && posture.kind === 'ns-body-baked-posture' ? posture.posture : 'custom',
    angles: Object.freeze({ ...angles }),
    keep: keep || null,
    meshesById: out,
    segments: new Map(BODY_SEGMENTS.map(s => [s, Float32Array.from(world[s])])),
    skinned: Object.freeze(skinned), rigid: Object.freeze(rigid), missing: Object.freeze(missing),
    ms: Math.round((t1 - t0) * 10) / 10
  };
  Object.defineProperty(result, '_internal', { value: Object.freeze({ rig, world, mats, inv, fitBaked, rigidRest, keepM }), enumerable: false });
  return Object.freeze(result);
}

function checkBaked(rig, baked) {
  if (!baked || baked.kind !== 'ns-body-baked-posture' || !baked._internal) throw new Error('ns:body_pose: options.baked must come from bakeBodyPosture');
  if (baked._internal.rig !== rig) throw new Error('ns:body_pose: options.baked was baked from a different rig');
  return baked;
}

/** Matrix mapping a mesh's BAKED geometry to its posed geometry (see poseBodyDetailed options.baked). */
function bakedDelta(rig, baked, id, info, world, mats, mode) {
  const B = baked._internal;
  if (info.kind === 'bone' || info.blend.length === 1) return m4Mul(world[info.segment], B.inv[info.segment]);
  const f = (rig._fit || {})[id], fb = B.fitBaked[id];
  if (mode === 'fit' && f && fb) {
    if (fitUsed(f).every(i => sameMatrix(mats[i], B.mats[i]))) return m4I();
    return rigidFit(fb, skinFitSamples(f, mats));
  }
  const cur = mode === 'fit' && f ? fittedMatrix(f, mats) : blendMatrix(info.blend, world, info.restCentroid || [0, 0, 0]);
  const rest = mode === 'fit' || !f ? B.rigidRest[id] : blendMatrix(info.blend, B.world, info.restCentroid || [0, 0, 0]);
  return rest ? m4Mul(cur, m4RigidInv(rest)) : cur;
}

// ---------------------------------------------------------------------------------------------------------------------
// No genital anatomy (R15: "no genitalia. Obviously.")
//
// The packets hold no genital meshes (checked by tests/unit/R3-body-genital.test.mjs over both manifests and every OBJ
// header). This deny-list is defence in depth: buildBodyRig refuses such entries (so bakeBodyPosture never returns
// them) and excludeGenitalAnatomy lets a loader drop them before anything is parsed or drawn. Terms are matched as whole
// words, case-insensitively, against every name field of an entry; ordinary pelvic names (hip bone, pubis, pubic
// symphysis, sacrum, cervical vertebrae, levator labii superioris, ...) do not match.

/** Whole-word, case-insensitive genital-anatomy terms (English, FMA-style names). */
export const GENITAL_DENY_TERMS = Object.freeze([
  'genital', 'genitals', 'genitalia', 'urogenital', 'pudendum', 'pudendal',
  'penis', 'penile', 'glans', 'prepuce', 'foreskin', 'corpus cavernosum', 'corpora cavernosa', 'corpus spongiosum', 'spongy urethra',
  'scrotum', 'scrotal', 'testis', 'testes', 'testicle', 'testicular', 'epididymis', 'spermatic cord', 'ductus deferens',
  'vas deferens', 'seminal vesicle', 'ejaculatory duct', 'prostate', 'prostatic', 'bulbourethral', 'dartos', 'cremaster',
  'tunica vaginalis',
  'vulva', 'vulvar', 'vagina', 'vaginal', 'clitoris', 'clitoral', 'labium majus', 'labium minus', 'labia majora',
  'labia minora', 'mons pubis', 'hymen', 'vestibular bulb', 'bulb of vestibule', 'greater vestibular gland', 'bartholin',
  'uterus', 'uterine', 'ovary', 'ovarian', 'fallopian', 'oviduct', 'cervix uteri', 'cervix of uterus',
  'bulbospongiosus', 'ischiocavernosus', 'perineum', 'perineal'
]);
const GENITAL_RE = new RegExp(`\\b(?:${GENITAL_DENY_TERMS.map(t => t.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi');

/** Phrases that contain a deny-list word but are not genital anatomy (removed before matching): the "vaginal process"
 * is a part of the sphenoid and temporal bones. */
export const GENITAL_ALLOW_PHRASES = Object.freeze(['vaginal process']);
const GENITAL_ALLOW_RE = new RegExp(`\\b(?:${GENITAL_ALLOW_PHRASES.map(t => t.replace(/ /g, '\\s+')).join('|')})\\b`, 'g');

/** The deny-list terms found in one name (lower case, unique). Underscores, hyphens, dots and slashes count as spaces
 * (so group names such as "genital_muscle" match). */
export function genitalTermsIn(name) {
  if (typeof name !== 'string' || !name) return [];
  const text = name.toLowerCase().replace(/[_\-./]+/g, ' ').replace(GENITAL_ALLOW_RE, ' ');
  const found = text.match(GENITAL_RE) || [];
  return [...new Set(found.map(s => s.replace(/\s+/g, ' ')))];
}

/** Every name-like string of a manifest entry (or a plain name). */
function entryNames(e) {
  if (typeof e === 'string') return [e];
  if (!e || typeof e !== 'object') return [];
  const out = [];
  for (const k of ['embedded_source_name', 'requested_structure', 'label', 'name', 'concept_name', 'element_id', 'id', 'path']) if (typeof e[k] === 'string') out.push(e[k]);
  for (const c of Array.isArray(e.concepts) ? e.concepts : []) if (c && typeof c.en === 'string') out.push(c.en);
  for (const k of ['matched_concept_names', 'names', 'groups']) for (const n of Array.isArray(e[k]) ? e[k] : []) if (typeof n === 'string') out.push(n);
  return out;
}

/** Deny-list terms found in any name field of an entry (or in a name string). */
export function genitalAnatomyTerms(entryOrName) {
  return [...new Set(entryNames(entryOrName).flatMap(genitalTermsIn))];
}

/** Split manifest entries into the ones to keep and the genital ones to drop (R15). Accepts an array or a manifest. */
export function excludeGenitalAnatomy(entries) {
  const raw = Array.isArray(entries) ? entries : entries && Array.isArray(entries.assets) ? entries.assets : [];
  const kept = [], excluded = [];
  for (const e of raw) {
    const terms = genitalAnatomyTerms(e);
    if (terms.length) excluded.push({ id: e && (e.element_id || e.id) || null, name: entryNames(e)[0] || null, terms });
    else kept.push(e);
  }
  return { kept, excluded };
}

// ---------------------------------------------------------------------------------------------------------------------
// BEGIN GENERATED DATA (U3b-body generator over packet bodyparts3d-fullbody-r1; regenerate, do not hand-edit)
// Source: inputs/FULLBODY-MESH-MANIFEST.json sha256 e66ba962e32bd7843c6b75c588e6545a6ca9ecdeb17d6ff71e9758aa05b1ea82 and its 294 meshes,
// parsed with ns-obj parseObj and passed through buildBodyRig (geometry path). REFERENCE_JOINTS holds the geometric
// estimates (axes are re-derived at build time); REFERENCE_MUSCLE_BLENDS the aggregate distance-rule blends;
// FULLBODY_MUSCLE_CATALOG [id, lower-case source name, laterality, centroid y mm] for every muscle mesh.
export const REFERENCE_MANIFEST_SHA256 = 'e66ba962e32bd7843c6b75c588e6545a6ca9ecdeb17d6ff71e9758aa05b1ea82';
export const REFERENCE_JOINTS = deepFreezeRig({
  lumbosacral: {"point":[-0.386,-50.605,926.766],"method":"midpoint L5 centroid / sacral-top centroid","bones":["fifth lumbar vertebra","sacrum"]},
  thoracolumbar: {"point":[-1.053,-59.051,1062.428],"method":"midpoint T12 / L1 centroids","bones":["twelfth thoracic vertebra","first lumbar vertebra"]},
  cervicothoracic: {"point":[-0.762,-63.359,1370.476],"method":"midpoint C7 / T1 centroids","bones":["seventh cervical vertebra","first thoracic vertebra"]},
  atlanto_occipital: {"point":[0.055,-73.482,1478.299],"method":"centroid of the atlas superior 6 mm (lateral-mass facets; the occipital bone is not in the packet)","bones":["atlas"]},
  tmj: {"point":[-0.691,-94.508,1503.48],"condyles":{"left":[41.492,-94.479,1503.514],"right":[-42.873,-94.537,1503.445]},"chin":[-0.562,-169.681,1440.286],"method":"midpoint of the mandibular condyle tops (posterior 20 mm, top 6 mm per side)","bones":["mandible"]},
  hyoid_fixed: {"point":[-0.717,-114.05,1432.755],"method":"hyoid centroid (no joint motion: the hyoid rides the cervical segment)","bones":["hyoid bone"]},
  r_sternoclavicular: {"point":[-14.74,-132.756,1321.503],"acromialEnd":[-141.028,-69.265,1349.146],"method":"centroid of the medial 10 mm of the right clavicle","bones":["right clavicle"]},
  r_glenohumeral: {"point":[-167.013,-73.112,1308.397],"radius":21.611,"rms":0.753,"inliers":196,"method":"sphere-fit of the humeral head (seeded from the glenoid contact patch)","gapMm":0.641,"bones":["right humerus","right scapula"]},
  r_elbow: {"point":[-213.802,-64.591,1042.915],"axis":[0.998,-0.032,-0.049],"radius":9.391,"rms":2.934,"inliers":181,"method":"circle-fit-about-transepicondylar-axis","epicondyles":{"medial":[-179.127,-67.772,1047.95],"lateral":[-239.264,-65.839,1050.884]},"bones":["right humerus","right ulna","right radius"]},
  r_radioulnar: {"point":[-230.37,-72.786,1030.509],"ulnarHead":[-237.916,-113.763,810.566],"axis":[0.034,0.183,0.983],"method":"radial-head centroid (top 10 mm); axis to the ulnar-head centroid (bottom 12 mm)","bones":["right radius","right ulna"]},
  r_wrist: {"point":[-255.85,-121.076,800.31],"method":"centroid of the capitate head (proximal 8 mm)","bones":["right capitate"]},
  r_thumb_cmc: {"point":[-277.639,-128.523,792.515],"method":"contact midpoint trapezium / first metacarpal (saddle joint)","gapMm":0.305,"bones":["right trapezium","right first metacarpal bone"]},
  r_thumb_mcp: {"point":[-302.774,-145.826,767.134],"radius":7.228,"rms":0.632,"inliers":129,"method":"sphere-fit","gapMm":0.479,"bones":["right first metacarpal bone","proximal phalanx of right thumb"]},
  r_thumb_ip: {"point":[-312.973,-158.865,742.037],"radius":5.787,"rms":0.73,"inliers":74,"method":"sphere-fit","gapMm":0.303,"bones":["proximal phalanx of right thumb","distal phalanx of right thumb"]},
  r_index_mcp: {"point":[-285.091,-136.568,726.696],"radius":7.37,"rms":0.777,"inliers":127,"method":"sphere-fit","gapMm":0.264,"bones":["right second metacarpal bone","proximal phalanx of right index finger"]},
  r_index_pip: {"point":[-297.574,-153.607,690.73],"radius":5.176,"rms":0.655,"inliers":76,"method":"sphere-fit","gapMm":0.535,"bones":["proximal phalanx of right index finger","middle phalanx of right index finger"]},
  r_index_dip: {"point":[-304.813,-170.089,674.494],"radius":3.896,"rms":0.619,"inliers":58,"method":"sphere-fit","gapMm":0.465,"bones":["middle phalanx of right index finger","distal phalanx of right index finger"]},
  r_middle_mcp: {"point":[-265.142,-136.616,728.59],"radius":7.593,"rms":0.597,"inliers":104,"method":"sphere-fit","gapMm":0.893,"bones":["right third metacarpal bone","proximal phalanx of right middle finger"]},
  r_middle_pip: {"point":[-271.706,-160.017,689.362],"radius":5.659,"rms":0.58,"inliers":70,"method":"sphere-fit","gapMm":0.522,"bones":["proximal phalanx of right middle finger","middle phalanx of right middle finger"]},
  r_middle_dip: {"point":[-275.52,-178.596,665.954],"radius":4.466,"rms":0.534,"inliers":62,"method":"sphere-fit","gapMm":0.646,"bones":["middle phalanx of right middle finger","distal phalanx of right middle finger"]},
  r_ring_mcp: {"point":[-247.174,-136.143,731.449],"radius":6.653,"rms":0.655,"inliers":83,"method":"sphere-fit","gapMm":1.066,"bones":["right fourth metacarpal bone","proximal phalanx of right ring finger"]},
  r_ring_pip: {"point":[-248.478,-158.317,694.71],"radius":5.102,"rms":0.584,"inliers":72,"method":"sphere-fit","gapMm":0.723,"bones":["proximal phalanx of right ring finger","middle phalanx of right ring finger"]},
  r_ring_dip: {"point":[-249.426,-178.145,672.826],"radius":4.175,"rms":0.508,"inliers":74,"method":"sphere-fit","gapMm":0.27,"bones":["middle phalanx of right ring finger","distal phalanx of right ring finger"]},
  r_little_mcp: {"point":[-230.803,-138.606,738.622],"radius":6.48,"rms":0.572,"inliers":98,"method":"sphere-fit","gapMm":0.566,"bones":["right fifth metacarpal bone","proximal phalanx of right little finger"]},
  r_little_pip: {"point":[-226.465,-156.546,707.375],"radius":4.226,"rms":0.467,"inliers":61,"method":"sphere-fit","gapMm":0.467,"bones":["proximal phalanx of right little finger","middle phalanx of right little finger"]},
  r_little_dip: {"point":[-222.927,-169.91,690.405],"radius":3.824,"rms":0.394,"inliers":39,"method":"sphere-fit","gapMm":0.431,"bones":["middle phalanx of right little finger","distal phalanx of right little finger"]},
  r_hip: {"point":[-86.024,-76.415,811.94],"radius":21.999,"rms":0.661,"inliers":82,"method":"sphere-fit of the femoral head (seeded from the acetabular contact patch)","gapMm":0.978,"bones":["right femur","right hip bone"]},
  r_knee: {"point":[-73.297,-79.025,391.856],"axis":[1,0.024,0.016],"radius":22.629,"rms":5.947,"inliers":246,"method":"circle-fit-about-transepicondylar-axis (femoral condyles, distal 35 mm, inferior/posterior-facing normals)","epicondyles":{"medial":[-33.183,-74.386,397.458],"lateral":[-111.106,-76.29,396.198]},"bones":["right femur"]},
  r_ankle: {"point":[-75.931,-71.047,-14.366],"axis":[-0.765,0.553,-0.331],"malleoli":{"medial":[-54.313,-86.661,-5.017],"lateral":[-97.549,-55.434,-23.714]},"method":"midpoint of the malleolus tips (tibia and fibula lowest 3 mm); talocrural axis through them","bones":["right tibia","right fibula"]},
  r_mtp: {"point":[-123.206,-168.104,-58.604],"axis":[-0.817,0.568,-0.103],"rays":{"first":{"point":[-93.647,-181.901,-55.696],"method":"sphere-fit"},"second":{"point":[-115.83,-178.378,-56.998],"method":"sphere-fit"},"third":{"point":[-126.906,-172.479,-58.592],"method":"sphere-fit"},"fourth":{"point":[-135.426,-161.027,-59.665],"method":"sphere-fit"},"fifth":{"point":[-144.222,-146.737,-62.066],"method":"sphere-fit"}},"method":"mean of the metatarsal-head joint centres; axis from the first to the fifth (metatarsal break)","bones":["right first metatarsal bone","right second metatarsal bone","right third metatarsal bone","right fourth metatarsal bone","right fifth metatarsal bone"]},
  l_hip: {"point":[88.41,-79.133,813.75],"radius":22.348,"rms":0.565,"inliers":79,"method":"sphere-fit of the femoral head (seeded from the acetabular contact patch)","gapMm":0.433,"bones":["left femur","left hip bone"]},
  l_knee: {"point":[74.443,-78.594,392.079],"axis":[-0.996,0.074,0.043],"radius":22.301,"rms":6.099,"inliers":278,"method":"circle-fit-about-transepicondylar-axis (femoral condyles, distal 35 mm, inferior/posterior-facing normals)","epicondyles":{"medial":[33.567,-73.067,399.367],"lateral":[111.257,-78.823,396.018]},"bones":["left femur"]},
  l_ankle: {"point":[75.853,-71.348,-14.173],"axis":[0.767,0.548,-0.335],"malleoli":{"medial":[54.332,-86.722,-4.768],"lateral":[97.375,-55.974,-23.578]},"method":"midpoint of the malleolus tips (tibia and fibula lowest 3 mm); talocrural axis through them","bones":["left tibia","left fibula"]},
  l_mtp: {"point":[122.391,-168.327,-57.79],"axis":[0.815,0.57,-0.107],"rays":{"first":{"point":[93.712,-182.173,-55.506],"method":"sphere-fit"},"second":{"point":[114.499,-180.165,-58.926],"method":"sphere-fit"},"third":{"point":[126.212,-172.27,-57.602],"method":"sphere-fit"},"fourth":{"point":[133.236,-160.254,-54.754],"method":"sphere-fit"},"fifth":{"point":[144.297,-146.774,-62.163],"method":"sphere-fit"}},"method":"mean of the metatarsal-head joint centres; axis from the first to the fifth (metatarsal break)","bones":["left first metatarsal bone","left second metatarsal bone","left third metatarsal bone","left fourth metatarsal bone","left fifth metatarsal bone"]}
});
export const REFERENCE_MUSCLE_BLENDS = deepFreezeRig({
  FJ1467: [["r_upperarm",0.618],["r_girdle",0.382]],
  FJ1468: [["r_girdle",0.7656],["r_upperarm",0.2344]],
  FJ1513: [["r_girdle",0.6403],["r_upperarm",0.3597]],
  FJ1478: [["r_upperarm",0.7503],["r_radius",0.1309],["r_forearm",0.1188]],
  FJ1512: [["r_upperarm",0.7993],["r_girdle",0.1304],["r_forearm",0.0703]],
  FJ1486: [["r_upperarm",0.7686],["r_forearm",0.2314]],
  FJ1479: [["r_upperarm",0.4714],["r_girdle",0.2812],["r_forearm",0.2474]],
  FJ1477: [["r_upperarm",0.8448],["r_forearm",0.1552]],
  FJ1480: [["r_upperarm",0.772],["r_forearm",0.228]],
  FJ1496: [["r_forearm",0.4075],["r_radius",0.3147],["r_upperarm",0.2778]],
  FJ1473: [["r_forearm",0.4561],["r_hand",0.2862],["r_upperarm",0.2577]],
  FJ1518: [["r_forearm",0.8284],["r_radius",0.1716]],
  FJ1502: [["r_hand",0.7552],["r_forearm",0.1388],["r_upperarm",0.106]],
  FJ1475: [["r_forearm",0.4009],["r_hand",0.3606],["r_upperarm",0.2385]],
  FJ1499: [["r_radius",0.6573],["r_forearm",0.3172],["r_hand",0.0255]],
  FJ1497: [["r_forearm",0.3856],["r_hand",0.3698],["r_radius",0.2445]],
  FJ1498: [["r_radius",0.7415],["r_thumb_dp",0.18],["r_thumb_pp",0.0786]],
  FJ1474: [["r_radius",0.686],["r_upperarm",0.1762],["r_forearm",0.1377]],
  FJ1516: [["r_radius",0.7211],["r_forearm",0.2789]],
  FJ1503: [["r_forearm",0.7197],["r_radius",0.2803]],
  FJ1487: [["r_radius",0.6126],["r_upperarm",0.2932],["r_forearm",0.0942]],
  FJ1490: [["r_radius",0.5177],["r_upperarm",0.339],["r_hand",0.1434]],
  FJ1489: [["r_radius",0.5953],["r_upperarm",0.2306],["r_hand",0.1741]],
  FJ1472: [["r_forearm",0.6785],["r_hand",0.2111],["r_radius",0.1105]],
  FJ1517: [["r_forearm",0.7361],["r_hand",0.1573],["r_radius",0.1066]],
  FJ1492: [["r_hand",0.5382],["r_radius",0.3027],["r_forearm",0.1591]],
  FJ1491: [["r_forearm",0.4818],["r_radius",0.2961],["r_hand",0.2221]],
  FJ1493: [["r_forearm",0.5421],["r_hand",0.2315],["r_index_pp",0.2264]],
  FJ1484: [["r_radius",0.4772],["r_forearm",0.3387],["r_thumb_mc",0.1841]],
  FJ1494: [["r_radius",0.5147],["r_forearm",0.244],["r_thumb_mc",0.2413]],
  FJ1495: [["r_forearm",0.4618],["r_thumb_dp",0.307],["r_radius",0.2312]],
  FJ1505: [["r_radius",0.6848],["r_forearm",0.2363],["r_upperarm",0.0788]],
  FJ1485: [["r_forearm",0.7828],["r_upperarm",0.2172]],
  FJ1488: [["r_upperarm",0.588],["r_girdle",0.412]],
  FJ1506: [["r_girdle",0.5172],["r_upperarm",0.4828]],
  FJ1500: [["r_girdle",0.5853],["r_upperarm",0.4147]],
  FJ1508: [["r_girdle",0.6455],["r_upperarm",0.3545]],
  FJ1504: [["r_girdle",0.8693],["r_upperarm",0.1307]],
  FJ1507: [["r_girdle",0.5569],["r_upperarm",0.4431]],
  FJ1483: [["r_hand",0.5745],["r_thumb_mc",0.3972],["r_thumb_pp",0.0284]],
  FJ1514: [["r_hand",0.5514],["r_thumb_mc",0.4486]],
  FJ1501: [["r_thumb_mc",0.5908],["r_hand",0.3864],["r_thumb_pp",0.0228]],
  FJ1481: [["r_hand",0.6323],["r_thumb_mc",0.323],["r_thumb_pp",0.0447]],
  FJ1515: [["r_hand",0.7902],["r_thumb_mc",0.1248],["r_thumb_pp",0.085]],
  FJ1466: [["r_hand",0.5352],["r_little_pp",0.4648]],
  FJ1470: [["r_hand",0.6509],["r_little_pp",0.3491]],
  FJ1482: [["r_hand",0.9658],["r_little_pp",0.0342]],
  FJ1510: [["r_hand",0.6855],["r_index_pp",0.2037],["r_little_pp",0.1108]],
  FJ1509: [["r_hand",0.9228],["r_middle_pp",0.0421],["r_index_pp",0.0352]],
  FJ1511: [["r_hand",0.8909],["r_little_pp",0.0589],["r_ring_pp",0.0502]],
  FJ1447: [["r_girdle",0.5099],["r_upperarm",0.3582],["thorax",0.1319]],
  FJ1464: [["thorax",0.8269],["r_upperarm",0.1285],["r_girdle",0.0446]],
  FJ1446: [["thorax",0.7869],["r_upperarm",0.2131]],
  FJ1521: [["cervical",0.6382],["r_girdle",0.2328],["thorax",0.129]],
  FJ1554: [["thorax",0.6352],["r_girdle",0.3648]],
  FJ1520: [["thorax",0.6472],["r_girdle",0.3528]],
  FJ1452: [["thorax",0.5062],["pelvis",0.2774],["lumbar",0.2164]],
  FJ1459: [["thorax",0.7573],["r_girdle",0.2427]],
  FJ1447M: [["l_girdle",0.5139],["l_upperarm",0.3588],["thorax",0.1273]],
  FJ1464M: [["thorax",0.8218],["l_upperarm",0.131],["l_girdle",0.0472]],
  FJ1446M: [["thorax",0.7841],["l_upperarm",0.2159]],
  FJ1521M: [["cervical",0.6366],["l_girdle",0.233],["thorax",0.1304]],
  FJ1554M: [["thorax",0.6325],["l_girdle",0.3675]],
  FJ1520M: [["thorax",0.6505],["l_girdle",0.3495]],
  FJ1452M: [["thorax",0.5076],["pelvis",0.2731],["lumbar",0.2193]],
  FJ1459M: [["thorax",0.7394],["l_girdle",0.2606]],
  FJ1418: [["pelvis",0.5139],["r_thigh",0.4861]],
  FJ1419: [["pelvis",0.7161],["r_thigh",0.2839]],
  FJ1433: [["r_thigh",0.6897],["pelvis",0.169],["r_shank",0.1413]],
  FJ1442: [["r_thigh",0.8967],["r_shank",0.1033]],
  FJ1443: [["r_thigh",0.8978],["r_shank",0.1022]],
  FJ1441: [["r_thigh",0.8498],["r_shank",0.1502]],
  FJ1434: [["r_thigh",0.4377],["pelvis",0.3223],["r_shank",0.2399]],
  FJ1395: [["r_thigh",0.7125],["r_shank",0.165],["pelvis",0.1224]],
  FJ1436: [["r_shank",0.3851],["r_thigh",0.3693],["pelvis",0.2456]],
  FJ1435: [["r_thigh",0.6569],["pelvis",0.2207],["r_shank",0.1224]],
  FJ1444: [["r_thigh",0.8173],["r_shank",0.1827]],
  FJ1403: [["r_thigh",0.8329],["pelvis",0.1671]],
  FJ1397: [["r_shank",0.6237],["r_thigh",0.3763]],
  FJ1394: [["r_shank",0.6232],["r_thigh",0.3768]],
  FJ1437: [["r_shank",0.9778],["r_foot",0.0222]],
  FJ1439: [["r_shank",0.5335],["r_foot",0.4665]],
  FJ1422: [["pelvis",0.7339],["r_thigh",0.2661]],
  FJ1431: [["lumbar",0.7383],["pelvis",0.1449],["r_thigh",0.1168]],
  FJ1406: [["r_shank",0.4794],["r_toes",0.3409],["r_foot",0.1797]],
  FJ1408: [["r_shank",0.7116],["r_foot",0.1579],["r_toes",0.1305]],
  FJ1414: [["r_shank",0.375],["r_foot",0.3324],["r_toes",0.2926]],
  FJ1415: [["r_shank",0.6433],["r_foot",0.2124],["r_toes",0.1443]],
  FJ1418M: [["pelvis",0.5132],["l_thigh",0.4868]],
  FJ1419M: [["pelvis",0.7064],["l_thigh",0.2936]],
  FJ1433M: [["l_thigh",0.6919],["pelvis",0.1679],["l_shank",0.1402]],
  FJ1442M: [["l_thigh",0.8991],["l_shank",0.1009]],
  FJ1443M: [["l_thigh",0.8988],["l_shank",0.1012]],
  FJ1441M: [["l_thigh",0.848],["l_shank",0.152]],
  FJ1434M: [["l_thigh",0.4311],["pelvis",0.3229],["l_shank",0.246]],
  FJ1395M: [["l_thigh",0.712],["l_shank",0.1631],["pelvis",0.1249]],
  FJ1436M: [["l_shank",0.3853],["l_thigh",0.3685],["pelvis",0.2462]],
  FJ1435M: [["l_thigh",0.6573],["pelvis",0.2206],["l_shank",0.1221]],
  FJ1444M: [["l_thigh",0.8192],["l_shank",0.1808]],
  FJ1403M: [["l_thigh",0.8333],["pelvis",0.1667]],
  FJ1397M: [["l_shank",0.6245],["l_thigh",0.3755]],
  FJ1394M: [["l_shank",0.6227],["l_thigh",0.3773]],
  FJ1437M: [["l_shank",0.9768],["l_foot",0.0232]],
  FJ1439M: [["l_shank",0.5322],["l_foot",0.4678]],
  FJ1422M: [["pelvis",0.7321],["l_thigh",0.2679]],
  FJ1431M: [["lumbar",0.7339],["pelvis",0.1515],["l_thigh",0.1146]],
  FJ1406M: [["l_shank",0.479],["l_toes",0.3363],["l_foot",0.1847]],
  FJ1408M: [["l_shank",0.7108],["l_foot",0.1577],["l_toes",0.1315]],
  FJ1414M: [["l_shank",0.3718],["l_foot",0.3349],["l_toes",0.2933]],
  FJ1415M: [["l_shank",0.6421],["l_foot",0.2142],["l_toes",0.1438]],
  FJ1595: [["thorax",0.4374],["skull",0.3359],["cervical",0.2266]],
  FJ1573: [["thorax",0.4421],["skull",0.317],["cervical",0.2409]],
  FJ1556: [["mandible",0.6372],["hyoid",0.3628]],
  FJ1579: [["skull",0.5936],["mandible",0.2339],["hyoid",0.1724]],
  FJ1583: [["mandible",0.6122],["hyoid",0.3878]],
  FJ1580: [["hyoid",0.703],["mandible",0.297]],
  FJ1555: [["mandible",0.7049],["hyoid",0.2951]],
  FJ1560: [["hyoid",1]],
  FJ1578: [["skull",0.6087],["mandible",0.2065],["hyoid",0.1849]],
  FJ1562: [["mandible",0.6013],["hyoid",0.3987]],
  FJ1559: [["hyoid",0.6697],["mandible",0.3303]]
});
export const FULLBODY_MUSCLE_CATALOG = deepFreezeRig([
  ["FJ1467","acromial part of right deltoid","right",-69.8],
  ["FJ1468","clavicular part of right deltoid","right",-88.7],
  ["FJ1513","spinal part of right deltoid","right",-33.2],
  ["FJ1478","long head of right biceps brachii","right",-87.3],
  ["FJ1512","short head of right biceps brachii","right",-90.5],
  ["FJ1486","right brachialis","right",-75.2],
  ["FJ1479","long head of right triceps brachii","right",-45.3],
  ["FJ1477","lateral head of right triceps brachii","right",-44],
  ["FJ1480","medial head of right triceps brachii","right",-56.2],
  ["FJ1496","right flexor carpi radialis","right",-108.8],
  ["FJ1473","humeral head of right flexor carpi ulnaris","right",-97],
  ["FJ1518","ulnar head of right flexor carpi ulnaris","right",-81.9],
  ["FJ1502","right palmaris longus","right",-132],
  ["FJ1475","right flexor digitorum superficialis","right",-121.1],
  ["FJ1499","right flexor digitorum superficialis","right",-104],
  ["FJ1497","right flexor digitorum profundus","right",-126],
  ["FJ1498","right flexor pollicis longus","right",-115.3],
  ["FJ1474","humeral head of right pronator teres","right",-89.2],
  ["FJ1516","ulnar head of right pronator teres","right",-88.1],
  ["FJ1503","right pronator quadratus","right",-109.6],
  ["FJ1487","right brachioradialis","right",-90.7],
  ["FJ1490","right extensor carpi radialis longus","right",-80.7],
  ["FJ1489","right extensor carpi radialis brevis","right",-80.2],
  ["FJ1472","right extensor carpi ulnaris","right",-85.2],
  ["FJ1517","right extensor carpi ulnaris","right",-89.8],
  ["FJ1492","right extensor digitorum","right",-116],
  ["FJ1491","right extensor digiti minimi","right",-88.1],
  ["FJ1493","right extensor indicis","right",-117.6],
  ["FJ1484","right abductor pollicis longus","right",-95.4],
  ["FJ1494","right extensor pollicis brevis","right",-114.6],
  ["FJ1495","right extensor pollicis longus","right",-120],
  ["FJ1505","right supinator","right",-76.1],
  ["FJ1485","right anconeus","right",-52.7],
  ["FJ1488","right coracobrachialis","right",-86.8],
  ["FJ1506","right supraspinatus","right",-56.7],
  ["FJ1500","right infraspinatus muscle","right",-38.6],
  ["FJ1508","right teres minor","right",-40.8],
  ["FJ1504","right subscapularis","right",-28.1],
  ["FJ1507","right teres major","right",-40.1],
  ["FJ1483","right abductor pollicis brevis","right",-139.1],
  ["FJ1514","superficial head of right flexor pollicis brevis","right",-141.8],
  ["FJ1501","right opponens pollicis","right",-139.5],
  ["FJ1481","oblique head of right adductor pollicis","right",-133.6],
  ["FJ1515","transverse head of right adductor pollicis","right",-131.7],
  ["FJ1466","abductor digiti minimi of right hand","right",-140.6],
  ["FJ1470","flexor digiti minimi brevis of right hand","right",-141.8],
  ["FJ1482","opponens digiti minimi of right hand","right",-136],
  ["FJ1510","set of lumbricals of right hand","right",-140.3],
  ["FJ1509","set of dorsal interossei of right hand","right",-126.3],
  ["FJ1511","set of palmar interossei of right hand","right",-134.9],
  ["FJ1447","clavicular part of right pectoralis major","right",-115.2],
  ["FJ1464","sternocostal part of right pectoralis major","right",-165.9],
  ["FJ1446","abdominal part of right pectoralis major","right",-164.1],
  ["FJ1521","descending part of right trapezius","right",-41],
  ["FJ1554","transverse part of right trapezius","right",-16.6],
  ["FJ1520","ascending part of right trapezius","right",-2.4],
  ["FJ1452","right external oblique","right",-171.4],
  ["FJ1459","right serratus anterior","right",-68.8],
  ["FJ1447M","clavicular part of left pectoralis major","left",-115.2],
  ["FJ1464M","sternocostal part of left pectoralis major","left",-165.9],
  ["FJ1446M","abdominal part of left pectoralis major","left",-164.1],
  ["FJ1521M","descending part of left trapezius","left",-41.1],
  ["FJ1554M","transverse part of left trapezius","left",-16.6],
  ["FJ1520M","ascending part of left trapezius","left",-2.3],
  ["FJ1452M","left external oblique","left",-171.4],
  ["FJ1459M","left serratus anterior","left",-68.8],
  ["FJ1418","right gluteus maximus","right",-31],
  ["FJ1419","right gluteus medius","right",-54.6],
  ["FJ1433","right rectus femoris","right",-117],
  ["FJ1442","right vastus lateralis","right",-100.3],
  ["FJ1443","right vastus medialis","right",-116.6],
  ["FJ1441","right vastus intermedius","right",-107.5],
  ["FJ1434","right sartorius","right",-119.5],
  ["FJ1395","long head of right biceps femoris","right",-48.2],
  ["FJ1436","right semitendinosus","right",-60],
  ["FJ1435","right semimembranosus","right",-62.8],
  ["FJ1444","short head of right biceps femoris","right",-71.8],
  ["FJ1403","right adductor magnus","right",-81.7],
  ["FJ1397","medial head of right gastrocnemius","right",-52.7],
  ["FJ1394","lateral head of right gastrocnemius","right",-40],
  ["FJ1437","right soleus","right",-56.7],
  ["FJ1439","right tibialis anterior","right",-112.7],
  ["FJ1422","right iliacus","right",-81.1],
  ["FJ1431","right psoas major","right",-82.8],
  ["FJ1406","right extensor digitorum longus","right",-127.1],
  ["FJ1408","right extensor hallucis longus","right",-100.6],
  ["FJ1414","right flexor digitorum longus","right",-121.5],
  ["FJ1415","right flexor hallucis longus","right",-90.4],
  ["FJ1418M","left gluteus maximus","left",-31],
  ["FJ1419M","left gluteus medius","left",-54.5],
  ["FJ1433M","left rectus femoris","left",-117],
  ["FJ1442M","left vastus lateralis","left",-100.3],
  ["FJ1443M","left vastus medialis","left",-116.6],
  ["FJ1441M","left vastus intermedius","left",-107.5],
  ["FJ1434M","left sartorius","left",-119.6],
  ["FJ1395M","long head of left biceps femoris","left",-48.2],
  ["FJ1436M","left semitendinosus","left",-59.9],
  ["FJ1435M","left semimembranosus","left",-62.8],
  ["FJ1444M","short head of left biceps femoris","left",-71.8],
  ["FJ1403M","left adductor magnus","left",-81.7],
  ["FJ1397M","medial head of left gastrocnemius","left",-52.7],
  ["FJ1394M","lateral head of left gastrocnemius","left",-39.9],
  ["FJ1437M","left soleus","left",-56.7],
  ["FJ1439M","left tibialis anterior","left",-112.7],
  ["FJ1422M","left iliacus","left",-81.2],
  ["FJ1431M","left psoas major","left",-82.8],
  ["FJ1406M","left extensor digitorum longus","left",-127.1],
  ["FJ1408M","left extensor hallucis longus","left",-100.7],
  ["FJ1414M","left flexor digitorum longus","left",-121.5],
  ["FJ1415M","left flexor hallucis longus","left",-90.4],
  ["FJ1595","right sternocleidomastoid","right",-101.7],
  ["FJ1573","left sternocleidomastoid","left",-104.2],
  ["FJ1556","right digastric","right",-143.6],
  ["FJ1579","right digastric","right",-87.1],
  ["FJ1583","right mylohyoid","right",-139.2],
  ["FJ1580","right geniohyoid","right",-134.9],
  ["FJ1555","left digastric","left",-145.8],
  ["FJ1560","left digastric","left",-122.6],
  ["FJ1578","left digastric","left",-87.1],
  ["FJ1562","left mylohyoid","left",-139.4],
  ["FJ1559","left geniohyoid","left",-136.6]
]);
// END GENERATED DATA
