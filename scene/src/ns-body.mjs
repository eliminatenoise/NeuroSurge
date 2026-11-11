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
// Round 3 (R3-body, D4): the fixed first-person body sat (BODY_POSTURES.seated). R558: it now starts sitting on an
// invisible flat ground with every limb straight forward (BODY_POSTURES.open = DEFAULT_BODY_POSTURE); 'seated' stays
// available.
//   bakeBodyPosture(rig, meshesById, { posture, keep = 'skull' }) -> { meshesById (start-posture geometry for the scene), ... }
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
// Round 5 (R5-body):
//   - D15 Body Worlds layers: bodyWorldsLayers(rig, baked, { meshesById }). Since R558 this is the anchored stack: a
//     per-vertex radial lift of the regionally qualified outer and intermediate muscles with their attachment ends
//     left on the bone (BODY_STACK_RULE, bodyStackLevel, bodyStackLiftedPositions, armStackLift for the CPU-skinned
//     left arm). It replaced the round-5 rigid display matrix. Exact-ID anatomy/scope/caveats come from
//     ns-regional-layers; the generated TABLE/UNITS and BODY_LAYER_RULE below are kept as the record of the earlier
//     geometric diagnostics and are no longer what the display uses.
//   - D19 mirror body: mirrorBodyMatrix (a reflecting group matrix: it faces you, your left stays on your left),
//     createBodyInstance / createMirrorBodyInstance / poseBodyInstance / syncBodyInstance (shared rig, geometry,
//     layers and pose), reflectWinding, bodyBoundsBp.
//   - D20 extra packets (the face and chewing muscles): validateExtraBodyManifest, loadExtraBodyPacket,
//     mergeBodyPackets, FACE_MUSCLE_PACKET; their muscles ride the skull and the jaw muscles follow the mandible.
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
import { BODY_ARM_SOURCE_DOMAIN, BODY_KEEP_FRAME_KIND } from './ns-body-arm-bridge.mjs';

// ---------------------------------------------------------------------------------------------------------------------
// Constants of the agreed interface

import { REGIONAL_LAYER_PROVENANCE, regionalLayerQualification } from './ns-regional-layers.mjs';
import { SEGMENTS as RIG_SEGMENTS, FOREARM_TWIST_CHAIN, FOREARM_TWIST_LEVELS, TWIST_SKIN, TWIST_TABLE_STEPS } from './ns-rig.mjs';

/** Agreed non-left-arm joint ids (shared interface 2). R558 (Messages 14, 15 and 2: as many activation points as
 * possible, left-right symmetry, full ranges of motion) adds the right hand's own digit joints (each finger and the
 * thumb on its own, finger spread, thumb opposition), right wrist side-to-side bend, ankle inversion / eversion, the big
 * toe on its own, trunk side bend and turn, neck side bend, jaw side shift, the swallow (hyoid lift) and three more
 * face display ids. r_grasp / r_open stay as whole-hand ids (the 'seated' posture uses them; no map action does). */
export const BODY_JOINT_IDS = Object.freeze([
  'hip_flex_L', 'hip_flex_R', 'hip_abd_L', 'hip_abd_R', 'knee_ext_L', 'knee_ext_R', 'ankle_dorsi_L', 'ankle_dorsi_R',
  'toe_flex_L', 'toe_flex_R',
  'trunk_flex', 'neck_flex', 'neck_rot', 'jaw_open', 'brow_raise', 'eye_close', 'lip_purse', 'smile',
  'r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex', 'r_wrist_flex', 'r_wrist_ext', 'r_grasp', 'r_open', 'r_pronation',
  'ankle_inv_L', 'ankle_inv_R', 'hallux_flex_L', 'hallux_flex_R', 'trunk_side', 'trunk_rot', 'neck_side', 'jaw_side',
  'hyoid_elev', 'nose_wrinkle', 'upper_lip', 'lower_lip',
  'r_wrist_dev', 'r_thumb_flex', 'r_thumb_opp', 'r_index_flex', 'r_middle_flex', 'r_ring_flex', 'r_little_flex', 'r_finger_spread',
  // R558 (Space dance, Message 2): the right upper arm's own internal / external rotation and each hip's rotation about
  // the thigh's long axis (positive = external, outward, on both sides).
  'r_shoulder_rot', 'hip_rot_L', 'hip_rot_R'
]);

const lim = (lo, hi) => Object.freeze([lo, hi]);

/**
 * Rig limits in degrees from the source (anatomical) pose, using the sign conventions of ns-bodymap JOINT_SEMANTICS.
 * R558 (Message 2: "all movements and motions should be to their maximum anatomically feasible range of motion but
 * never beyond"): each limit is the full commonly quoted adult ACTIVE range (AAOS 1965 "Joint Motion: Method of
 * Measuring and Recording" table, with the AMA Guides where AAOS gives none or the task brief asked for the wider
 * value), not a game-safe fraction. Basis per joint:
 *   hip flexion 120 (AAOS; with a bent knee: HIP_KNEE_COUPLING caps it at 100 with a straight knee, the hamstrings'
 *     limit), extension 30 (AAOS; the map's extension action stops at the ground, 90); abduction 45, adduction
 *     30 (AAOS; the map's adduction action stops at 0 so the legs never pass into each other); knee flexion 135
 *     (AAOS); ankle dorsiflexion 20, plantarflexion 50 (AAOS); foot inversion 35, eversion 15 (AAOS); lesser-toe MTP
 *     flexion 40, extension 40 (AAOS); big-toe MTP flexion 45, extension 70 (AAOS);
 *   trunk (thoracolumbar) flexion 80, extension 25, side bend 35 each way, rotation 45 each way (AAOS); neck flexion
 *     50, extension 60, rotation 80 each way (AMA), side bend 45 each way (AAOS / AMA); jaw opening 30 deg of
 *     mandibular rotation (with the 0.25 mm/deg forward glide about 40 mm between the incisors, a usual adult
 *     maximum), jaw side shift 10 mm each way (a usual adult lateral excursion);
 *   right shoulder flexion 180, extension 60, abduction 180 (AAOS); elbow flexion 145 (between AAOS 150 and AMA 140;
 *     the forearm mesh meets the biceps mesh there); pronation 80 + supination 80 = 160 (AAOS); wrist flexion 80,
 *     extension 70, radial deviation 20, ulnar deviation 30 (AAOS); digits: see BODY_JOINT_SHARES (finger MCP 90 /
 *     PIP 105 / DIP 85, MCP hyperextension 30; thumb CMC opposition 40, MCP 50, IP 80, IP hyperextension 20; finger
 *     spread 20 at the index MCP).
 * They are not measured on this reference body or on the player. The facial ids are display amplitudes (-20..20, or
 * 0..20 where the opposite movement returns to rest), not joint rotations: the face-muscle packet colours the muscles,
 * and no face mesh changes shape (see faceDisplayLevels). hyoid_elev is a display amplitude 0..20 that lifts the hyoid
 * bone up to 15 mm (HYOID_LIFT), the usual adult hyoid excursion in a swallow.
 */
export const BODY_JOINT_LIMITS = Object.freeze({
  hip_flex_L: lim(-30, 120), hip_flex_R: lim(-30, 120),
  hip_abd_L: lim(-30, 45), hip_abd_R: lim(-30, 45),
  knee_ext_L: lim(-135, 0), knee_ext_R: lim(-135, 0),
  ankle_dorsi_L: lim(-50, 20), ankle_dorsi_R: lim(-50, 20),
  toe_flex_L: lim(-40, 40), toe_flex_R: lim(-40, 40),
  trunk_flex: lim(-25, 80), neck_flex: lim(-60, 50), neck_rot: lim(-80, 80), jaw_open: lim(0, 30),
  brow_raise: lim(-20, 20), eye_close: lim(-20, 20), lip_purse: lim(-20, 20), smile: lim(-20, 20),
  r_shoulder_flex: lim(-60, 180), r_shoulder_abd: lim(0, 180), r_elbow_flex: lim(0, 145),
  r_wrist_flex: lim(0, 80), r_wrist_ext: lim(0, 70), r_grasp: lim(0, 90), r_open: lim(0, 30), r_pronation: lim(0, 160),
  ankle_inv_L: lim(-15, 35), ankle_inv_R: lim(-15, 35), hallux_flex_L: lim(-70, 45), hallux_flex_R: lim(-70, 45),
  trunk_side: lim(-35, 35), trunk_rot: lim(-45, 45), neck_side: lim(-45, 45), jaw_side: lim(-10, 10),
  hyoid_elev: lim(0, 20), nose_wrinkle: lim(-20, 20), upper_lip: lim(0, 20), lower_lip: lim(-20, 20),
  r_wrist_dev: lim(-30, 20), r_thumb_flex: lim(-20, 90), r_thumb_opp: lim(-15, 40),
  r_index_flex: lim(-30, 90), r_middle_flex: lim(-30, 90), r_ring_flex: lim(-30, 90), r_little_flex: lim(-30, 90),
  r_finger_spread: lim(0, 20),
  // R558 (Space dance): rotation about the humerus' and the femur's own long axes, positive = external (outward).
  // Shoulder: internal about 70, external about 90 (commonly quoted active ranges, e.g. AAOS tables, measured with the
  // upper arm raised; the start posture holds it straight forward, flexed 90). Hip, measured with the hip flexed 90 as
  // in the long-sitting start posture: internal about 35-45, external about 45 (same sources); internal 40 is used.
  // Cited from memory, not measured on this body. The Space dance may use less where the feet would touch
  // (hipRotationClearRange).
  r_shoulder_rot: lim(-70, 90), hip_rot_L: lim(-40, 45), hip_rot_R: lim(-40, 45)
});

/** Facial display ids (no joint, no mesh) and their full display amplitude. */
export const FACE_DISPLAY_IDS = Object.freeze(['brow_raise', 'eye_close', 'lip_purse', 'smile', 'nose_wrinkle', 'upper_lip', 'lower_lip']);
const FACE_FULL_DEG = 20;

/** R558: the swallow display joint lifts the hyoid bone (and what rides it) by up to `mm` (at hyoid_elev 20), along
 * `dir` (superior and a little anterior, BodyParts3D frame). Adult hyoid excursion in a swallow is commonly reported as
 * about 1 to 2 cm, up and forward; 15 mm is a display choice inside that, not a measurement. */
export const HYOID_LIFT = Object.freeze({ mm: 15, dir: Object.freeze([0, -0.45, 0.89]) });

/** R558 (Message 2, "never beyond"): with the knee straight the hamstrings stop hip flexion at about 90-100 degrees (the
 * straight-leg limit; the brief's norm "about 90 with a straight knee", and the lead's straight-leg lift end of 100,
 * 10 degrees off the ground in long sitting); with the knee bent the hip flexes to 120. The hip flexion actually drawn is capped at
 * straightKneeMaxDeg + (bentKneeMaxDeg - straightKneeMaxDeg) * min(1, knee flexion / fullAtKneeFlexDeg). A two-joint
 * muscle rule of thumb for display, not a measured hamstring length. */
export const HIP_KNEE_COUPLING = Object.freeze({ straightKneeMaxDeg: 100, bentKneeMaxDeg: 120, fullAtKneeFlexDeg: 90 });

/** How one agreed joint id is shared between rig joints (documented approximations, not measured kinematics). */
export const BODY_JOINT_SHARES = Object.freeze({
  trunk_flex: Object.freeze({ lumbosacral: 0.5, thoracolumbar: 0.5 }),
  // R558: side bend shared evenly; trunk rotation mostly above the lumbar spine (lumbar rotation is only a few degrees
  // per level), taken at the thoracolumbar stage because the rib cage is one rigid segment here.
  trunk_side: Object.freeze({ lumbosacral: 0.5, thoracolumbar: 0.5 }),
  trunk_rot: Object.freeze({ lumbosacral: 0.2, thoracolumbar: 0.8 }),
  neck_flex: Object.freeze({ cervicothoracic: 0.6, atlanto_occipital: 0.4 }),
  neck_rot: Object.freeze({ cervicothoracic: 0.5, atlanto_occipital: 0.5 }),
  neck_side: Object.freeze({ cervicothoracic: 0.8, atlanto_occipital: 0.2 }),
  // Net digit angle n = (r_grasp - r_open) + the digit's own id (r_index_flex, ...; the thumb's r_thumb_flex) in degrees.
  // Flexion (n > 0) share, extension (n < 0) share, joint clamps [lo, hi]. R558 (Message 2): a full flexion n = 90
  // reaches MCP 90, PIP 104 (clamp 105) and DIP 85 (AAOS: MCP 90, PIP 100, DIP 90; the task brief: PIP 100-110, DIP
  // 80-90); n = -30 opens the MCP 30 into hyperextension with PIP straight and DIP 9 (active MCP hyperextension is
  // about 20-45 degrees; PIP has none). Thumb: MCP 50 (AAOS 50), IP 81 -> 80 (AAOS 80); n = -20 extends the IP 20
  // (AAOS IP hyperextension 20). The thumb CMC follows r_thumb_opp (+ 0.35 of a positive whole-hand closure).
  finger: Object.freeze({ mcp: [1.0, 1.0, -30, 90], pip: [1.16, 0, 0, 105], dip: [0.95, 0.3, -10, 85] }),
  thumb: Object.freeze({ cmc: [0.35, 0.5, -15, 40], mcp: [0.56, 0.3, -10, 50], ip: [0.9, 1.0, -20, 80] }),
  // R558: finger spread (r_finger_spread, 0..20 deg) abducts each finger's MCP away from the middle finger by this
  // share (index 20, ring 15, little 25 at full spread; middle is the reference). Commonly quoted MCP abduction is
  // about 20-30 degrees; the shares follow the usual wider spread of the border digits.
  spread: Object.freeze({ index: 1.0, middle: 0, ring: 0.75, little: 1.25 }),
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
  'r_thigh', 'r_patella', 'r_shank', 'r_foot', 'r_toes', 'r_hallux',
  'l_thigh', 'l_patella', 'l_shank', 'l_foot', 'l_toes', 'l_hallux'
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
  r_thigh: 'pelvis', r_patella: 'r_thigh', r_shank: 'r_thigh', r_foot: 'r_shank', r_toes: 'r_foot', r_hallux: 'r_foot',
  l_thigh: 'pelvis', l_patella: 'l_thigh', l_shank: 'l_thigh', l_foot: 'l_shank', l_toes: 'l_foot', l_hallux: 'l_foot'
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
  r_thigh: 'r_hip', r_patella: 'r_patellofemoral', r_shank: 'r_knee', r_foot: 'r_ankle', r_toes: 'r_mtp', r_hallux: 'r_hallux_mtp',
  l_thigh: 'l_hip', l_patella: 'l_patellofemoral', l_shank: 'l_knee', l_foot: 'l_ankle', l_toes: 'l_mtp', l_hallux: 'l_hallux_mtp'
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
  // Round 5 (D20): an extra packet (any source_packet other than the BodyParts3D full-body packet, for example the
  // Z-Anatomy face packet) leads with its plain anatomical `name` ("left zygomaticus major"); its embedded source name
  // ("Zygomaticus major muscle.l") follows. Base-packet entries keep the round-4 order exactly.
  const extra = typeof e.source_packet === 'string' && e.source_packet !== REFERENCE_PACKET;
  if (extra && e.name) names.push(lowerName(e.name));
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
    extraPacket: extra,
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

// R558 (Message 14): the big toe is its own segment (r_hallux / l_hallux), so it curls and lifts on its own. Its two
// phalanges carry rig_hint r_toes / l_toes in the manifest; they are moved here by name. The big toe's long muscles
// (flexor / extensor hallucis longus) end on it, so their distal attachment follows it (muscleCandidates).
const HALLUX_BONE = /^(proximal|distal) phalanx of (right|left) big toe$/;
function boneSegmentFor(entry) {
  const n = entry.name;
  if (n === 'right radius') return 'r_radius';
  const hx = HALLUX_BONE.exec(n);
  if (hx && (entry.hint === 'r_toes' || entry.hint === 'l_toes')) return `${hx[2] === 'right' ? 'r' : 'l'}_hallux`;
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
  if (/hallucis/.test(entry.name) && (d === 'r_toes' || d === 'l_toes')) d = `${d[0]}_hallux`;
  let segs;
  if (d === 'r_digits') segs = [...treePath(p, 'r_hand'), ...FINGER_FAN];
  else if (p === 'r_digits') segs = [...treePath('r_hand', d), ...FINGER_FAN];
  else segs = treePath(p, d);
  return { proximal: p, distal: d, segments: [...new Set(segs)] };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reference joints (precomputed by this module's geometric estimators from packet bodyparts3d-fullbody-r1, manifest
// sha256 5b0cbbf880ddd053e761a0a967cbbc924aca135263961b3ad4b036b1d27c6406). They are used ONLY for a joint whose
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
    // R558: the lesser toes (second to fifth) turn about the mean of their own four metatarsal-head centres; the big
    // toe turns about its own (first) head. Both use the metatarsal break line (first to fifth head) as the axis.
    const lesser = mtp.filter(m => m.ord !== 'first');
    if (mtp.length >= 2 && lesser.length >= 1) {
      const pts = lesser.map(m => m.point);
      const first = mtp.find(m => m.ord === 'first') || mtp[0], last = mtp.find(m => m.ord === 'fifth') || mtp[mtp.length - 1];
      put(`${s}_mtp`, {
        point: scl(pts.reduce(add, [0, 0, 0]), 1 / pts.length), axis: norm(sub(last.point, first.point)),
        rays: Object.fromEntries(mtp.map(m => [m.ord, { point: m.point, method: m.method }])),
        method: 'mean of the second to fifth metatarsal-head joint centres (the lesser toes); axis from the first to the fifth (metatarsal break)',
        bones: TOES.map(([o]) => `${side} ${o} metatarsal bone`)
      });
      const hx = mtp.find(m => m.ord === 'first');
      if (hx) put(`${s}_hallux_mtp`, {
        point: hx.point, axis: norm(sub(last.point, first.point)),
        method: 'first metatarsal-head joint centre (big toe); axis along the metatarsal break (first to fifth head)',
        bones: [`${side} first metatarsal bone`, `proximal phalanx of ${side} big toe`]
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
  // R558: `side` is the front-to-back axis; a positive angle bends the part above toward the subject's LEFT (trunk_side,
  // neck_side), as a positive `rot` turns the front toward the subject's left (trunk_rot, neck_rot).
  for (const jid of ['lumbosacral', 'thoracolumbar', 'cervicothoracic', 'atlanto_occipital']) {
    setAxes(jid, { flex: orientAxis(LEFTX, UP, ANT), rot: orientAxis(UP, ANT, LEFTX), side: orientAxis(POST, UP, LEFTX) });
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
  // R558: `dev` turns the hand toward the thumb side (radial deviation, positive) about the palm's normal through the
  // capitate head; in the source pose (palm forward) the right thumb side is the subject's right (RIGHTX).
  setAxes('r_wrist', { flex: orientAxis(null, dirTo('r_wrist', handTarget, DOWN), ANT), dev: orientAxis(null, dirTo('r_wrist', handTarget, DOWN), RIGHTX) });
  const boneC = name => { const p = bone(name); if (p) return centroidOf(p); const e = byName.get(name); return e ? e.centroid : null; };
  const THUMB_PALM = norm(add(LEFTX, ANT)); // toward the palm and the ulnar side of the right hand
  setAxes('r_thumb_cmc', { flex: orientAxis(null, dirTo('r_thumb_cmc', boneC('right first metacarpal bone'), DOWN), THUMB_PALM) });
  setAxes('r_thumb_mcp', { flex: orientAxis(null, dirTo('r_thumb_mcp', boneC('proximal phalanx of right thumb'), DOWN), THUMB_PALM) });
  setAxes('r_thumb_ip', { flex: orientAxis(null, dirTo('r_thumb_ip', boneC('distal phalanx of right thumb'), DOWN), THUMB_PALM) });
  for (const f of FINGERS) {
    const kids = { mcp: `proximal phalanx of right ${f} finger`, pip: `middle phalanx of right ${f} finger`, dip: `distal phalanx of right ${f} finger` };
    for (const [k, n] of Object.entries(kids)) setAxes(`r_${f}_${k}`, { flex: orientAxis(null, dirTo(`r_${f}_${k}`, boneC(n), DOWN), ANT) });
    // R558: MCP abduction (finger spread) about the palm's normal, positive away from the middle finger: the index toward
    // the thumb side (RIGHTX in the source pose), the ring and little fingers toward the ulnar side (LEFTX).
    if (J[`r_${f}_mcp`]) J[`r_${f}_mcp`].axes.abd = norm(orientAxis(null, dirTo(`r_${f}_mcp`, boneC(kids.mcp), DOWN), f === 'index' ? RIGHTX : LEFTX));
  }
  const hipAxis = P('l_hip') && P('r_hip') ? sub(P('l_hip'), P('r_hip')) : LEFTX;
  for (const s of ['r', 'l']) {
    const kneeP = P(`${s}_knee`) || segC(`${s}_shank`);
    // R558 (genuine note R27): `rot` is the thigh's own long axis, from the hip centre to the knee centre (pointing
    // down the limb). Turning about it is hip internal / external rotation, a different joint and axis from the
    // forearm's radius-on-ulna turn; the shank and foot follow because they hang from the thigh.
    // R558 (start posture with the limbs straight forward): `abd` is the front-to-back axis through the hip centre, at
    // right angles to the thigh; a positive angle swings that leg out to its own side (hip abduction). The hip turns
    // first about it and then about `flex`, so with the legs flexed straight forward the abduction spreads them apart
    // sideways (horizontal abduction), not a twist about the thigh.
    setAxes(`${s}_hip`, {
      flex: orientAxis(hipAxis, dirTo(`${s}_hip`, kneeP, DOWN), ANT), rot: dirTo(`${s}_hip`, kneeP, DOWN),
      abd: orientAxis(null, dirTo(`${s}_hip`, kneeP, DOWN), s === 'r' ? RIGHTX : LEFTX)
    });
    const ankleP = P(`${s}_ankle`) || segC(`${s}_foot`);
    setAxes(`${s}_knee`, { flex: orientAxis(J[`${s}_knee`] && J[`${s}_knee`].axis, dirTo(`${s}_knee`, ankleP, DOWN), POST) });
    if (J[`${s}_patellofemoral`]) J[`${s}_patellofemoral`].axes = J[`${s}_knee`] && J[`${s}_knee`].axes ? { flex: J[`${s}_knee`].axes.flex } : { flex: [1, 0, 0] };
    const mtpP = P(`${s}_mtp`) || segC(`${s}_toes`);
    // R558: `inv` is the foot's long axis (ankle centre to the lesser metatarsal heads); a positive angle turns the sole
    // toward the midline (inversion), a negative one away from it (eversion). One axis through the ankle centre stands
    // in for the combined subtalar and midtarsal joints (their real axis runs obliquely up and forward through the
    // talus): a display approximation, not a measured axis.
    const footLong = dirTo(`${s}_ankle`, mtpP, ANT);
    setAxes(`${s}_ankle`, { dorsi: orientAxis(J[`${s}_ankle`] && J[`${s}_ankle`].axis, footLong, UP), inv: orientAxis(footLong, DOWN, s === 'r' ? LEFTX : RIGHTX) });
    setAxes(`${s}_mtp`, { flex: orientAxis(J[`${s}_mtp`] && J[`${s}_mtp`].axis, dirTo(`${s}_mtp`, segC(`${s}_toes`), ANT), DOWN) });
    setAxes(`${s}_hallux_mtp`, { flex: orientAxis(J[`${s}_hallux_mtp`] && J[`${s}_hallux_mtp`].axis, dirTo(`${s}_hallux_mtp`, segC(`${s}_hallux`), ANT), DOWN) });
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
    // Round 5 (D20): an extra packet's muscle answers to every name of its entry (name, concepts[].en, embedded name),
    // so the BODY_MOTOR_MAP action lists ("left masseter", "orbicularis oris", ...) light every piece.
    const aliases = e.extraPacket ? [...new Set([...e.names, ...muscleAliases(e.name, e.centroid)])] : muscleAliases(e.name, e.centroid);
    muscles.push({ id: e.id, name: e.name, aliases, side: e.laterality });
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
      'Muscle drives are simulated, unitless display values: not EMG, not force and not nerve activity.',
      // Round 5 (D20): only when an extra packet (for example the face muscles) is rigged, so the base rig is unchanged.
      ...(list.some(e => e.extraPacket && e.kind === 'muscle' && e.sourcePacket !== 'missing-muscles-r1')
        ? [`Some muscles come from an extra packet (${[...new Set(list.filter(e => e.extraPacket && e.sourcePacket !== 'missing-muscles-r1').map(e => e.sourcePacket))].join(', ')}), placed on this body by one fitted transform: they ride the skull, and jaw muscles partly follow the jawbone; face expressions are shown as activity colours, not as moving skin.`]
        : []),
      // R558 (builder AN): the missing-muscles packet (BodyParts3D 4.0 files in this body's own frame, plus Z-Anatomy
      // shapes placed by the face packet's fitted transform) is rigged like the base muscles, by the nearest bones.
      ...(list.some(e => e.extraPacket && e.kind === 'muscle' && e.sourcePacket === 'missing-muscles-r1')
        ? ['The back, belly, hip, thigh and shin muscles of the missing-muscles packet follow their nearest bones like the other body muscles; its Z-Anatomy shapes (latissimus dorsi, rectus abdominis, the internal oblique, transversus abdominis, quadratus lumborum, longus colli and three short foot muscles) were placed on this body by one fitted transform and lie a few millimetres from where this atlas would put them.']
        : [])
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
  // R558 (Message 2): the hip flexes less with a straight knee (HIP_KNEE_COUPLING); reported like any other clamp.
  const HK = HIP_KNEE_COUPLING;
  for (const S of ['L', 'R']) {
    const kneeFlex = Math.max(0, -applied[`knee_ext_${S}`]);
    const cap = HK.straightKneeMaxDeg + (HK.bentKneeMaxDeg - HK.straightKneeMaxDeg) * Math.min(1, kneeFlex / HK.fullAtKneeFlexDeg);
    const id = `hip_flex_${S}`;
    if (applied[id] > cap) {
      const prev = clamped.find(c => c.id === id);
      if (prev) prev.applied = cap; else clamped.push({ id, requested: applied[id], applied: cap });
      applied[id] = cap;
    }
  }
  for (const k of Object.keys(src)) if (!BODY_JOINT_LIMITS[k]) ignored.push(k);
  return { applied, clamped, ignored, nonFinite };
}

/** Facial display levels -1..1 (target / 20, clamped; R558: negative = the opposite face movement, e.g. a frown for
 * brow_raise). They move no mesh: the face-muscle packet only colours its muscles, so the scene should show them only
 * as labelled, simulated display values. */
export function faceDisplayLevels(targets = {}) {
  const { applied } = clampBodyJointTargets(targets);
  return Object.fromEntries(FACE_DISPLAY_IDS.map(id => [id, applied[id] / FACE_FULL_DEG]));
}

function checkRig(rig) {
  if (!rig || rig.kind !== 'ns-body-rig') throw new Error('ns:body_rig: expected a rig from buildBodyRig');
}

/** Per-joint local rotations (rest frame, about each pivot) for the clamped targets. */
/** R558 (genuine note R27): the optional coordinated limb turn that rides on the palm turn: { hipRotDegR, hipRotDegL }
 * in degrees about each thigh's long axis (positive = the toes turn toward the subject's right: external rotation of
 * the right hip, internal rotation of the left). Kept inside LIMB_TURN_LIMIT_DEG, which lies within commonly quoted
 * active hip rotation (about 30 to 45 degrees each way); not measured on this body. null = no turn. */
export const LIMB_TURN_LIMIT_DEG = 40;
function checkLimbTurn(t) {
  if (t === undefined || t === null) return null;
  if (typeof t !== 'object') throw new Error('ns:body_pose: options.limbTurn must be { hipRotDegR, hipRotDegL } or null');
  const one = v => (v === undefined || v === null ? 0 : (() => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('ns:body_pose: limbTurn angles must be finite degrees'); return clamp(v, -LIMB_TURN_LIMIT_DEG, LIMB_TURN_LIMIT_DEG); })());
  const R = one(t.hipRotDegR), L = one(t.hipRotDegL);
  return R === 0 && L === 0 ? null : { R, L };
}
function localMatrices(rig, A, limbTurn = null) {
  const J = rig.pivots, out = {};
  const rot = (jid, axis, deg) => (J[jid] && J[jid].axes[axis] && deg ? m4RotAbout(J[jid].axes[axis], deg, J[jid].point) : m4I());
  const sh = BODY_JOINT_SHARES;
  // R558: each spinal stage turns flexion, then side bend, then rotation (each about its own axis through the stage's
  // pivot, in the rest frame); with only flexion set every matrix is exactly the round-2 one.
  const spine = (jid, f, sd, r) => m4Mul(m4Mul(rot(jid, 'flex', f), rot(jid, 'side', sd)), rot(jid, 'rot', r));
  out.lumbar = spine('lumbosacral', sh.trunk_flex.lumbosacral * A.trunk_flex, sh.trunk_side.lumbosacral * A.trunk_side, sh.trunk_rot.lumbosacral * A.trunk_rot);
  out.thorax = spine('thoracolumbar', sh.trunk_flex.thoracolumbar * A.trunk_flex, sh.trunk_side.thoracolumbar * A.trunk_side, sh.trunk_rot.thoracolumbar * A.trunk_rot);
  // R558 (user, Message 1: "The cursor now will control head/neck movement"; the eye camera rides on the head). The head
  // as a whole turns about the trunk's vertical (neck_rot) and then nods about its own turned side-to-side axis
  // (neck_flex), exactly the order of the camera's yaw and pitch, so the head points where the camera looks. Each joint
  // keeps its share of both angles: the lower neck (cervicothoracic) turns first and then bends; the skull joint takes
  // the rest of the turn about that same trunk vertical (expressed in the bent lower neck) and then its share of the
  // nod. With only one of the two angles non-zero every matrix is exactly what it was before (the earlier order,
  // bend then turn at each joint, aimed the face up to 25 degrees away from the look when both were large). Display
  // kinematics of a rigid educational rig, not measured cervical coupling.
  // R558 (activation points): the neck's side bend (neck_side) is applied first, about the rest frame's front-to-back
  // axis at each joint, so with only the side bend set each joint tilts exactly as it did without the head look.
  out.cervical = m4Mul(m4Mul(rot('cervicothoracic', 'rot', sh.neck_rot.cervicothoracic * A.neck_rot), rot('cervicothoracic', 'flex', sh.neck_flex.cervicothoracic * A.neck_flex)), rot('cervicothoracic', 'side', sh.neck_side.cervicothoracic * A.neck_side));
  {
    const ao = J.atlanto_occipital, ct = J.cervicothoracic, turn = sh.neck_rot.atlanto_occipital * A.neck_rot;
    let skullTurn = rot('atlanto_occipital', 'rot', turn);
    if (turn && ao && ao.axes.rot && ct && ct.axes.flex && A.neck_flex) {
      const back = m4RotAbout(ct.axes.flex, -sh.neck_flex.cervicothoracic * A.neck_flex, [0, 0, 0]);
      skullTurn = m4RotAbout(norm(m4Dir(back, ao.axes.rot)), turn, ao.point);
    }
    out.skull = m4Mul(m4Mul(skullTurn, rot('atlanto_occipital', 'flex', sh.neck_flex.atlanto_occipital * A.neck_flex)), rot('atlanto_occipital', 'side', sh.neck_side.atlanto_occipital * A.neck_side));
  }
  const jawOpen = J.tmj && J.tmj.glideDir ? m4Mul(m4Trans(scl(J.tmj.glideDir, sh.jawGlideMmPerDeg * A.jaw_open)), rot('tmj', 'open', A.jaw_open)) : rot('tmj', 'open', A.jaw_open);
  // R558: jaw side shift (jaw_side, mm; positive = chin toward the subject's LEFT) as a sideways glide of the mandible.
  out.mandible = A.jaw_side ? m4Mul(m4Trans(scl(LEFTX, A.jaw_side)), jawOpen) : jawOpen;
  // R558: the swallow lifts the hyoid bone (display amplitude hyoid_elev 0..20 -> 0..HYOID_LIFT.mm up and forward).
  out.hyoid = A.hyoid_elev ? m4Trans(scl(norm(HYOID_LIFT.dir), (HYOID_LIFT.mm * A.hyoid_elev) / FACE_FULL_DEG)) : m4I();

  // Right shoulder with the mild scapulohumeral rhythm.
  const gh = J.r_glenohumeral;
  if (gh && gh.axes.flex && gh.axes.abd) {
    // R558 (start posture with the arms straight forward): the arm is first lifted sideways (abd) and then swung about
    // the side-to-side axis (flex). With the arm straight forward (flexion 90) abduction therefore swings it out to the
    // side in the horizontal plane (horizontal abduction), not a twist about its own length.
    const total = m4Mul(m4RotAbout(gh.axes.flex, A.r_shoulder_flex, [0, 0, 0]), m4RotAbout(gh.axes.abd, A.r_shoulder_abd, [0, 0, 0]));
    const { axis, angle } = axisAngleOf(total);
    const d0 = norm(gh.restHumerusDir || DOWN);
    const elev = Math.acos(clamp(dot(norm(m4Dir(total, d0)), d0), -1, 1)) / DEG;
    const g = elev > SCAPULOHUMERAL.thresholdDeg && angle > 1e-9 ? SCAPULOHUMERAL.ratio * (elev - SCAPULOHUMERAL.thresholdDeg) * (angle / elev) : 0;
    out.r_girdle = J.r_sternoclavicular && g ? m4RotAbout(axis, g, J.r_sternoclavicular.point) : m4I();
    out.r_upperarm = angle > 1e-9 ? m4RotAbout(axis, angle - (J.r_sternoclavicular ? g : 0), gh.point) : m4I();
    // R558 (Space dance, Message 2): internal / external rotation about the humerus' own long axis (the shoulder centre to
    // the elbow centre in the rest frame), turned first, so the swing above carries it and the arm keeps its direction.
    // About that downward axis a positive angle turns the front of the arm toward the subject's right: outward
    // (external rotation) for this right arm. Its elevation, and so the shoulder-blade share above, do not change.
    if (A.r_shoulder_rot) out.r_upperarm = m4Mul(out.r_upperarm, m4RotAbout(norm(gh.restHumerusDir || DOWN), A.r_shoulder_rot, gh.point));
  } else {
    out.r_girdle = m4I();
    out.r_upperarm = m4I();
  }
  out.r_forearm = rot('r_elbow', 'flex', A.r_elbow_flex);
  out.r_radius = rot('r_radioulnar', 'pron', A.r_pronation);
  // R558: radial / ulnar deviation first (rest frame), then flexion / extension, both about the capitate head.
  out.r_hand = m4Mul(rot('r_wrist', 'flex', A.r_wrist_flex - A.r_wrist_ext), rot('r_wrist', 'dev', A.r_wrist_dev));
  // R558 (Messages 14 / 15): every digit has its own net angle: the whole-hand ids (r_grasp - r_open) plus the digit's
  // own id, so the right hand bends each finger and the thumb on its own, like the left game hand.
  const whole = A.r_grasp - A.r_open;
  const share = (net, [f, e, lo, hi]) => clamp(net >= 0 ? f * net : e * net, lo, hi);
  const T = sh.thumb, F = sh.finger;
  const thumbNet = whole + A.r_thumb_flex;
  out.r_thumb_mc = rot('r_thumb_cmc', 'flex', clamp(share(whole, T.cmc) + A.r_thumb_opp, T.cmc[2], T.cmc[3]));
  out.r_thumb_pp = rot('r_thumb_mcp', 'flex', share(thumbNet, T.mcp));
  out.r_thumb_dp = rot('r_thumb_ip', 'flex', share(thumbNet, T.ip));
  for (const f of FINGERS) {
    const net = whole + A[`r_${f}_flex`];
    const spread = sh.spread[f] * A.r_finger_spread;
    out[`r_${f}_pp`] = spread ? m4Mul(rot(`r_${f}_mcp`, 'flex', share(net, F.mcp)), rot(`r_${f}_mcp`, 'abd', spread)) : rot(`r_${f}_mcp`, 'flex', share(net, F.mcp));
    out[`r_${f}_mp`] = rot(`r_${f}_pip`, 'flex', share(net, F.pip));
    out[`r_${f}_dp`] = rot(`r_${f}_dip`, 'flex', share(net, F.dip));
  }
  out.l_girdle = m4I();
  out.l_upperarm = m4I();
  for (const [s, S] of [['r', 'R'], ['l', 'L']]) {
    const kneeFlex = -A[`knee_ext_${S}`];
    // R558: hip rotation about the thigh's long axis first (in the rest frame), then hip abduction, then hip flexion.
    const hipSwing = A[`hip_abd_${S}`] ? m4Mul(rot(`${s}_hip`, 'flex', A[`hip_flex_${S}`]), rot(`${s}_hip`, 'abd', A[`hip_abd_${S}`])) : rot(`${s}_hip`, 'flex', A[`hip_flex_${S}`]);
    // R558 (Space dance): hip_rot_L / hip_rot_R are anatomical (positive = external, the toes turn outward). About the
    // thigh's downward long axis a positive angle turns the toes toward the subject's right, so the left side is negated.
    // The older limbTurn option (same axis, signed toward the subject's right) adds to it.
    const hipTurn = (S === 'R' ? 1 : -1) * A[`hip_rot_${S}`] + (limbTurn && limbTurn[S] ? limbTurn[S] : 0);
    out[`${s}_thigh`] = hipTurn ? m4Mul(hipSwing, rot(`${s}_hip`, 'rot', hipTurn)) : hipSwing;
    out[`${s}_patella`] = rot(`${s}_patellofemoral`, 'flex', sh.patellaPerKneeFlex * kneeFlex);
    out[`${s}_shank`] = rot(`${s}_knee`, 'flex', kneeFlex);
    // R558: inversion / eversion first (rest frame), then dorsi / plantarflexion about the talocrural axis.
    out[`${s}_foot`] = m4Mul(rot(`${s}_ankle`, 'dorsi', A[`ankle_dorsi_${S}`]), rot(`${s}_ankle`, 'inv', A[`ankle_inv_${S}`]));
    out[`${s}_toes`] = rot(`${s}_mtp`, 'flex', A[`toe_flex_${S}`]);
    out[`${s}_hallux`] = rot(`${s}_hallux_mtp`, 'flex', A[`hallux_flex_${S}`]);
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

/**
 * R5-pronation (user note 2026-11-08T23:43Z, R27: "the rest of the body will follow correspondingly"): the slight
 * follow of the upper trunk and the left shoulder girdle when the left forearm turns (ns-arm ROTATION_COUPLING; ns-arm
 * bodyFollowFromCoupling turns fitHand(...).coupling into this option). Display mechanics, not measured motion.
 *  - trunkTwistDeg: the thorax turns by this many degrees about the vertical (source +z) axis through trunkAxisBp (mm;
 *    default the thoracolumbar joint); + = toward the subject's left (left shoulder back). The neck turns back by the
 *    same angle about the vertical axis through the cervicothoracic joint, so the head keeps its direction (it shifts by
 *    (R - I)(C - A), under 2 mm for the coupling's 1.5 deg), and the resting right arm turns back about the vertical
 *    through its shoulder joint, so it keeps its direction and only moves with the right shoulder (about 4 mm forward).
 *    Lumbar spine, pelvis and legs do not move.
 *  - leftGirdleShiftMm: the left shoulder girdle (virtual segment l_girdle, and l_upperarm with it) slides by this
 *    vector (source frame mm) relative to the thorax: the shoulder-blade retraction that goes with the outward turn of
 *    the upper arm. The left pectoralis major, trapezius and serratus anterior follow it through their l_girdle weights.
 * Limits (refused beyond): |trunkTwistDeg| <= 10, |leftGirdleShiftMm| <= 50.
 */
export const ARM_FOLLOW_LIMITS = Object.freeze({ trunkTwistDeg: 10, leftGirdleShiftMm: 50 });

function checkArmFollow(af) {
  if (af === undefined || af === null || af === false) return null;
  if (typeof af !== 'object') throw new Error('ns:body_pose: options.armFollow must be an object or null');
  const twist = af.trunkTwistDeg === undefined || af.trunkTwistDeg === null ? 0 : af.trunkTwistDeg;
  if (!Number.isFinite(twist) || Math.abs(twist) > ARM_FOLLOW_LIMITS.trunkTwistDeg) throw new Error(`ns:body_pose: options.armFollow.trunkTwistDeg must be finite and within ${ARM_FOLLOW_LIMITS.trunkTwistDeg} deg`);
  const vec = (v, what) => {
    if (v === undefined || v === null) return null;
    if (!v || v.length !== 3 || ![0, 1, 2].every(k => Number.isFinite(v[k]))) throw new Error(`ns:body_pose: options.armFollow.${what} must be a finite [x, y, z]`);
    return [v[0], v[1], v[2]];
  };
  const axis = vec(af.trunkAxisBp, 'trunkAxisBp');
  const shift = vec(af.leftGirdleShiftMm, 'leftGirdleShiftMm');
  if (shift && Math.hypot(...shift) > ARM_FOLLOW_LIMITS.leftGirdleShiftMm) throw new Error(`ns:body_pose: options.armFollow.leftGirdleShiftMm must stay within ${ARM_FOLLOW_LIMITS.leftGirdleShiftMm} mm`);
  return { trunkTwistDeg: twist, trunkAxisBp: axis, leftGirdleShiftMm: shift };
}

const SOURCE_UP = Object.freeze([0, 0, 1]);

/** Apply checkArmFollow's result to the local matrices (in place). */
function applyArmFollow(rig, local, af) {
  const J = rig.pivots;
  if (af.trunkTwistDeg) {
    const A = af.trunkAxisBp || (J.thoracolumbar && J.thoracolumbar.point);
    const C = J.cervicothoracic && J.cervicothoracic.point;
    if (A) {
      local.thorax = m4Mul(local.thorax, m4RotAbout(SOURCE_UP, af.trunkTwistDeg, A));
      if (C) local.cervical = m4Mul(m4RotAbout(SOURCE_UP, -af.trunkTwistDeg, C), local.cervical);
      // the resting right arm keeps its direction (it rests as if on an armrest): it turns back about the vertical through
      // its shoulder joint, so it only moves with that shoulder (a few mm) instead of swinging its hand ~1 cm
      const G = J.r_glenohumeral && J.r_glenohumeral.point;
      if (G) local.r_girdle = m4Mul(m4RotAbout(SOURCE_UP, -af.trunkTwistDeg, G), local.r_girdle);
    }
  }
  if (af.leftGirdleShiftMm) local.l_girdle = m4Mul(m4Trans(af.leftGirdleShiftMm), local.l_girdle);
}

/**
 * R558 (user, Messages 1 and 2: the cursor turns the head and neck; "using anatomically feasible movements, with
 * anatomically feasible range of motion, you should still be able to see all body parts whilst looking around"). When
 * a look goes past the neck's turning range the chest turns too: options.lookTwistDeg turns the thorax (and everything
 * it carries: neck, head, both shoulder girdles and the right arm) about the trunk's own long axis through the
 * thoracolumbar joint; + = toward the subject's left. The lumbar spine, pelvis and legs stay put, so the body keeps
 * sitting square on the ground. LOOK_TWIST_LIMIT_DEG (40) is a rounded, game-safe value inside commonly quoted active
 * thoracolumbar rotation (about 30 to 45 degrees each way); not measured on this body. Display kinematics: the whole
 * twist is taken at one joint of this rigid rig.
 */
export const LOOK_TWIST_LIMIT_DEG = 40;
/**
 * R558 (same notes): the trunk bend that goes with the head (options.lookBendDeg, + = the head goes down) is a bend
 * TOWARD where the head is turned (about the side-to-side axis turned by options.lookBendDirDeg about the vertical):
 * straight ahead a forward bend, to the side a sideways bend, between them both, shared like trunk_flex between the
 * lumbosacral and thoracolumbar joints. Bending toward the look keeps the head upright under the level eye camera;
 * a purely forward bend under a turned head leaned the head over sideways by up to 140 degrees in the worst corner.
 * Range: the bend's forward / back part stays within trunk_flex (60 forward, 25 back) and its sideways part within
 * LOOK_BEND_SIDE_LIMIT_DEG (30, a rounded value inside commonly quoted active trunk side bending, about 25 to 35
 * degrees), as an ellipse between them (refused beyond). Display kinematics, not measured.
 */
export const LOOK_BEND_SIDE_LIMIT_DEG = 30;
/** The largest bend (degrees, >= 0) toward / away from a direction under the ellipse above: sign +1 = the head goes
 * down toward dirDeg, -1 = the trunk leans away from it (pure). */
export function lookBendLimit(dirDeg, sign = 1, limits = BODY_JOINT_LIMITS.trunk_flex, sideDeg = LOOK_BEND_SIDE_LIMIT_DEG) {
  const c = Math.cos(dirDeg * DEG) * (sign < 0 ? -1 : 1), s = Math.sin(dirDeg * DEG);
  const A = c >= 0 ? limits[1] : -limits[0];
  return 1 / Math.sqrt((c / A) ** 2 + (s / sideDeg) ** 2);
}
function checkLookBend(deg, dir) {
  const d = deg === undefined || deg === null ? 0 : deg, a = dir === undefined || dir === null ? 0 : dir;
  if (typeof a !== 'number' || !Number.isFinite(a)) throw new Error('ns:body_pose: options.lookBendDirDeg must be finite degrees');
  if (typeof d !== 'number' || !Number.isFinite(d) || Math.abs(d) > lookBendLimit(a, Math.sign(d) || 1) + 1e-9) throw new Error('ns:body_pose: options.lookBendDeg must be finite and inside the trunk bend range for its direction');
  return { deg: d, dirDeg: a };
}
function checkLookTwist(v) {
  if (v === undefined || v === null || v === 0) return 0;
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > LOOK_TWIST_LIMIT_DEG + 1e-9) throw new Error(`ns:body_pose: options.lookTwistDeg must be finite and within ${LOOK_TWIST_LIMIT_DEG} deg`);
  return v;
}
function applyLook(rig, local, twistDeg, bend) {
  const J = rig.pivots, sh = BODY_JOINT_SHARES.trunk_flex;
  if (bend.deg) {
    for (const [seg, jid] of [['lumbar', 'lumbosacral'], ['thorax', 'thoracolumbar']]) {
      const j = J[jid];
      if (!j || !j.axes || !j.axes.flex) continue;
      const axis = norm(m4Dir(m4RotAbout(SOURCE_UP, bend.dirDeg, [0, 0, 0]), j.axes.flex));
      local[seg] = m4Mul(local[seg], m4RotAbout(axis, sh[jid] * bend.deg, j.point));
    }
  }
  const A = J.thoracolumbar && J.thoracolumbar.point;
  if (twistDeg && A) local.thorax = m4Mul(local.thorax, m4RotAbout(SOURCE_UP, twistDeg, A));
}

/** World (rest -> posed, Float64) matrix of every segment for clamped targets, anchor and external matrices. */
function worldSegments(rig, applied, options) {
  const local = localMatrices(rig, applied, checkLimbTurn(options.limbTurn));
  // R558 (latch): options.holdChest keeps the chest where it is while the trunk bends, so the head (the eye camera)
  // and both arm roots stay put and the bend is taken up below the chest: the pelvis and the legs swing instead.
  const hold = options.holdChest === true && (applied.trunk_flex || applied.trunk_side || applied.trunk_rot) ? m4RigidInv(m4Mul(local.lumbar, local.thorax)) : null;
  applyLook(rig, local, checkLookTwist(options.lookTwistDeg), checkLookBend(options.lookBendDeg, options.lookBendDirDeg));
  const af = checkArmFollow(options.armFollow);
  if (af) applyArmFollow(rig, local, af);
  const anchor = options.anchor === undefined ? 'pelvis' : options.anchor;
  if (!SEG_INDEX.has(anchor)) throw new Error(`ns:body_pose: unknown anchor segment ${JSON.stringify(anchor)}`);
  const ext = options.external || {};
  const world = {};
  const fixed = hold ? new Set() : null; // externally placed segments (and what hangs from them) are already in place
  for (const s of BODY_SEGMENTS) {
    if (VIRTUAL_SEGMENTS.includes(s) && ext[s]) { world[s] = checkExternal(ext[s], s); if (fixed) fixed.add(s); continue; }
    const p = BODY_SEGMENT_PARENT[s];
    world[s] = p ? m4Mul(world[p], local[s]) : local[s];
    if (fixed && p && fixed.has(p)) fixed.add(s);
  }
  if (hold) for (const s of BODY_SEGMENTS) if (!fixed.has(s)) world[s] = m4Mul(hold, world[s]);
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
 * @param options.holdChest true: the chest stays where it is while the trunk bends (trunk_flex), so the head, an eye
 *   camera on it and both arm roots keep their place and the pelvis and legs swing instead. With trunk_flex 0 every
 *   matrix is exactly as without the option. Default false (the body bends from its pelvis).
 * @param options.lookTwistDeg R558: the thorax's turn about the trunk's long axis that a wide look adds once the neck
 *   is at the end of its turn (LOOK_TWIST_LIMIT_DEG; + = toward the subject's left). 0 / absent = no turn.
 * @param options.lookBendDeg / options.lookBendDirDeg R558: the trunk bend a steep look adds once the neck is at the
 *   end of its bend, toward the direction the head is turned (see checkLookBend). 0 / absent = no bend.
 * @param options.armFollow R5-pronation: { trunkTwistDeg, trunkAxisBp?, leftGirdleShiftMm? } (ARM_FOLLOW_LIMITS): the
 *   slight trunk turn and left shoulder-blade slide that follow the left forearm turn (see checkArmFollow's note).
 *   Absent / null = no follow (every matrix exactly as without the option).
 * @param options.muscleMode 'fit' (default: least-squares rigid fit to the skinned sample vertices) or 'blend'
 *   (weighted quaternion average of the attaching segments; cheaper, drifts more on multi-joint muscles).
 * @param options.baked a bakeBodyPosture() result (round 3). The returned mesh matrices then map the BAKED geometry
 *   (baked.meshesById, the body already in its rest posture) to the posed geometry, so they are the identity whenever
 *   the targets equal the baked posture's angles. Pass absolute targets (bodyPostureTargets), not offsets.
 *   `segments` maps the source-pose geometry to the drawn pose (including the baked posture's keep correction).
 * @param options.layers a bodyWorldsLayers(rig, baked) result. Since R558 the Body Worlds stack is a per-vertex lift
 *   of the drawn GEOMETRY (bodyStackLiftedPositions), not a matrix: every mesh matrix is the same with and without
 *   layers, and the lifted geometry rides on it. options.layerAmount 0..1 (default layers.amount) is validated and
 *   reported only. The detailed result then also has layers: { amount, applied: 'geometry', lifted (count) }.
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
  // Body Worlds layers (R558): the lift is in the drawn geometry, so no matrix changes here. The options are still
  // checked (wrong rig, wrong baked posture or an amount outside 0..1 fail closed) and reported.
  const layers = options.layers === undefined || options.layers === null || options.layers === false ? null : checkLayers(rig, baked, options.layers);
  const layerAmount = layers ? (options.layerAmount === undefined || options.layerAmount === null ? layers.amount : options.layerAmount) : 0;
  if (layers && !(Number.isFinite(layerAmount) && layerAmount >= 0 && layerAmount <= 1)) throw new Error('ns:body_pose: options.layerAmount must be in 0..1');
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
  const result = { matrices, segments, applied: t.applied, clamped: t.clamped, ignored: t.ignored, nonFinite: t.nonFinite, face: faceDisplayLevels(t.applied), anchor, relativeTo: baked ? 'baked' : 'source' };
  if (layers) result.layers = { amount: layerAmount, applied: 'geometry', lifted: layers.displaySelected.length };
  return result;
}

/**
 * R558 (user Messages 2 and 12): the drawn matrix (source rest mm -> drawn mm, column-major Float64Array) of every
 * segment for these joint targets, WITHOUT the per-mesh work of poseBodyDetailed: the same clamping, anchor, baked keep
 * correction, limbTurn, holdChest, armFollow and external options, so a point carried by a segment lands exactly where
 * poseBodyDetailed's `segments` would put it. For the held-limb joint solve and the stop-at-contact test (cheap enough
 * to call several times a frame). Returns { segmentId: Float64Array(16) }.
 */
export function poseBodySegments(rig, jointTargetsDeg = {}, options = {}) {
  checkRig(rig);
  const t = clampBodyJointTargets(jointTargetsDeg);
  const { world } = worldSegments(rig, t.applied, options);
  const baked = options.baked === undefined || options.baked === null ? null : checkBaked(rig, options.baked);
  if (baked) for (const s of BODY_SEGMENTS) world[s] = m4Mul(baked._internal.keepM, world[s]);
  return world;
}

/** Shared interface 3: Map(meshId -> 4x4 column-major Float32Array) in the shared BodyParts3D frame (mm). */
export function poseBody(rig, jointTargetsDeg = {}, options = {}) {
  return poseBodyDetailed(rig, jointTargetsDeg, options).matrices;
}

/**
 * R558 (the eye camera rides on the head): the drawn (posed) frames of the trunk and head chain only, cheap enough for
 * every look: { pelvis, lumbar, thorax, cervical, skull } (Float64Array(16), source mm -> drawn mm, the baked keep
 * frame applied exactly as poseBodyDetailed does). The same targets and options give the same matrices as
 * poseBodyDetailed's `segments` for these segments, up to their Float32 storage (measured: under 1e-4 mm), when the
 * pose has no palm-turn armFollow (options used: anchor 'pelvis', holdChest, lookTwistDeg, lookBendDeg,
 * lookBendDirDeg, baked; the
 * palm turn's armFollow is left out on purpose: it moves the head by under 2 mm and is only known after the arm fit).
 * The app takes the eye from `skull` and the left shoulder root and trunk axes from `thorax`.
 */
export function bodyHeadFrame(rig, jointTargetsDeg = {}, options = {}) {
  checkRig(rig);
  const t = clampBodyJointTargets(jointTargetsDeg);
  const { world } = worldSegments(rig, t.applied, { holdChest: options.holdChest === true, lookTwistDeg: options.lookTwistDeg, lookBendDeg: options.lookBendDeg, lookBendDirDeg: options.lookBendDirDeg });
  const baked = options.baked === undefined || options.baked === null ? null : checkBaked(rig, options.baked);
  const out = { applied: t.applied };
  for (const s of ['pelvis', 'lumbar', 'thorax', 'cervical', 'skull']) out[s] = Float64Array.from(baked ? m4Mul(baked._internal.keepM, world[s]) : world[s]);
  return out;
}

/**
 * R558 (Space dance; Messages 2 and 11): how far the two hips may turn before the feet touch, in the current leg
 * posture. The legs lie straight forward side by side (parallel, not spread), so turning both sets of toes inward
 * (internal rotation) brings the feet together; with bent knees turning them outward does. The game does not spread
 * the legs to make room: it limits the hip turn instead. For each direction it finds the largest EQUAL turn of both hips
 * (both inward, or both outward) at which the bone points of the two lower legs (shank, foot and toes: the rig's
 * voxel-downsampled bone clouds) stay at least boneGapMm apart; that gap leaves room for the muscles, tendons and other
 * drawn tissue over the bones (FEET_CLEARANCE; checked against the full posed meshes, see the build notes). A smaller
 * turn of one hip, or a turn the other way, only takes its foot further from the other one.
 *   boneGapMm      bone-to-bone gap kept between the two lower legs (mm)
 *   scanSteps      coarse steps over each direction's anatomical range, then bisectSteps halvings of the first failing step
 * targets: the current joint angles (every joint as posed now; the two hip_rot values are ignored).
 * Returns { hip_rot_L: [lo, hi], hip_rot_R: [lo, hi] (degrees, lo = most internal), internalDeg, externalDeg (the
 * touch-free equal turns), gapMm (bone gap with both hips at 0 when it is below boneGapMm, else null), limitedBy: { internal, external } ('feet' | 'range') }.
 * A posture whose feet are already closer than boneGapMm keeps them at least as far apart as they are.
 */
export const FEET_CLEARANCE = Object.freeze({ boneGapMm: 20, scanSteps: 12, bisectSteps: 6 });
const legCloudCache = new WeakMap();
function legClouds(rig) {
  let c = legCloudCache.get(rig);
  if (c) return c;
  const clouds = rig._clouds || {};
  c = {};
  for (const side of ['l', 'r']) {
    c[side] = ['shank', 'foot', 'toes'].map(seg => ({ seg: `${side}_${seg}`, pts: clouds[`${side}_${seg}`] || null })).filter(x => x.pts && x.pts.length >= 3);
  }
  legCloudCache.set(rig, c);
  return c;
}
function posedLegPoints(parts, world) {
  let n = 0;
  for (const p of parts) n += p.pts.length;
  const out = new Float64Array(n);
  let k = 0;
  for (const { seg, pts } of parts) {
    const m = world[seg];
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i], y = pts[i + 1], z = pts[i + 2];
      out[k++] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[k++] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[k++] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
  }
  return out;
}
function boxOf(a) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.length; i += 3) for (let c = 0; c < 3; c++) { const v = a[i + c]; if (v < b[c]) b[c] = v; if (v > b[c + 3]) b[c + 3] = v; }
  return b;
}
/** True when every point of a is at least d from every point of b: a box test first, then a uniform grid of cell d on
 * b (integer-hashed cells; a hash collision only costs an extra exact distance test). */
function pointSetsApart(a, b, d) {
  const A = boxOf(a), B = boxOf(b);
  let gap2 = 0;
  for (let c = 0; c < 3; c++) { const g = Math.max(0, A[c] - B[c + 3], B[c] - A[c + 3]); gap2 += g * g; }
  const d2 = d * d;
  if (gap2 >= d2) return true;
  const cell = d, hash = (i, j, k) => (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791)) | 0, grid = new Map();
  for (let i = 0; i < b.length; i += 3) {
    // only b points that can be near a's box matter
    if (b[i] < A[0] - d || b[i] > A[3] + d || b[i + 1] < A[1] - d || b[i + 1] > A[4] + d || b[i + 2] < A[2] - d || b[i + 2] > A[5] + d) continue;
    const kk = hash(Math.floor(b[i] / cell), Math.floor(b[i + 1] / cell), Math.floor(b[i + 2] / cell));
    const list = grid.get(kk);
    if (list) list.push(i); else grid.set(kk, [i]);
  }
  if (grid.size === 0) return true;
  for (let i = 0; i < a.length; i += 3) {
    if (a[i] < B[0] - d || a[i] > B[3] + d || a[i + 1] < B[1] - d || a[i + 1] > B[4] + d || a[i + 2] < B[2] - d || a[i + 2] > B[5] + d) continue;
    const cx = Math.floor(a[i] / cell), cy = Math.floor(a[i + 1] / cell), cz = Math.floor(a[i + 2] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(hash(cx + dx, cy + dy, cz + dz));
      if (!list) continue;
      for (const j of list) {
        const ex = a[i] - b[j], ey = a[i + 1] - b[j + 1], ez = a[i + 2] - b[j + 2];
        if (ex * ex + ey * ey + ez * ez < d2) return false;
      }
    }
  }
  return true;
}
function minPointDistance(a, b) {
  let best = Infinity;
  for (let i = 0; i < a.length; i += 3) for (let j = 0; j < b.length; j += 3) {
    const ex = a[i] - b[j], ey = a[i + 1] - b[j + 1], ez = a[i + 2] - b[j + 2], q = ex * ex + ey * ey + ez * ez;
    if (q < best) best = q;
  }
  return Math.sqrt(best);
}
export function hipRotationClearRange(rig, targets = {}, options = {}) {
  checkRig(rig);
  const o = { ...FEET_CLEARANCE, ...(options || {}) };
  if (!(Number.isFinite(o.boneGapMm) && o.boneGapMm > 0)) throw new Error('ns:body_pose: boneGapMm must be a positive number of millimetres');
  const LL = BODY_JOINT_LIMITS.hip_rot_L, LR = BODY_JOINT_LIMITS.hip_rot_R;
  const lo0 = Math.max(LL[0], LR[0]), hi0 = Math.min(LL[1], LR[1]);
  const clouds = legClouds(rig);
  const full = { hip_rot_L: [LL[0], LL[1]], hip_rot_R: [LR[0], LR[1]], internalDeg: -lo0, externalDeg: hi0, gapMm: null, limitedBy: { internal: 'range', external: 'range' } };
  if (!clouds.l.length || !clouds.r.length) return full;
  const base = { ...(targets instanceof Map ? Object.fromEntries(targets) : targets || {}) };
  const pointsAt = deg => {
    const { world } = worldSegments(rig, clampBodyJointTargets({ ...base, hip_rot_L: deg, hip_rot_R: deg }).applied, {});
    return [posedLegPoints(clouds.l, world), posedLegPoints(clouds.r, world)];
  };
  const [l0, r0] = pointsAt(0);
  // The exact rest gap only matters when the feet are already closer than boneGapMm (then they may not come closer).
  const gap0 = pointSetsApart(l0, r0, o.boneGapMm) ? null : minPointDistance(l0, r0);
  const need = gap0 === null ? o.boneGapMm : Math.min(o.boneGapMm, gap0);
  const clearAt = deg => { const [l, r] = pointsAt(deg); return pointSetsApart(l, r, need); };
  const furthest = (sign, maxDeg) => {
    let ok = 0;
    for (let k = 1; k <= o.scanSteps; k++) {
      const t = (maxDeg * k) / o.scanSteps;
      if (clearAt(sign * t)) { ok = t; continue; }
      let bad = t;
      for (let i = 0; i < o.bisectSteps; i++) { const mid = 0.5 * (ok + bad); if (clearAt(sign * mid)) ok = mid; else bad = mid; }
      return { deg: Math.floor(ok * 10) / 10, limited: true };
    }
    return { deg: maxDeg, limited: false };
  };
  const inn = furthest(-1, -lo0), ext = furthest(1, hi0);
  return {
    hip_rot_L: [-inn.deg, ext.deg], hip_rot_R: [-inn.deg, ext.deg], internalDeg: inn.deg, externalDeg: ext.deg,
    gapMm: gap0 === null ? null : Math.round(gap0 * 10) / 10, limitedBy: { internal: inn.limited ? 'feet' : 'range', external: ext.limited ? 'feet' : 'range' }
  };
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
  // R558: the right forearm's continuous twist, exactly as the bake (rForearmTwistPass).
  const tf = (options && options.twist === false) || !avail.includes('r_radius') ? null : rForearmTwistPass(rig, p, i0, i1);
  return tf ? { segments: BODY_SEGMENTS, i0, i1, w0, w1, tf, twist: rForearmTwistFrame(rig) } : { segments: BODY_SEGMENTS, i0, i1, w0, w1 };
}

/**
 * R558 (the right forearm in plates with the palm down and torn apart in the Space dance): the body bakes the start
 * posture with the right forearm turned 160 deg (palm down) from the supinated source mesh, and a vertex between the
 * ulna (r_forearm) and the radius (r_radius) was blended LINEARLY between two frames 160 deg apart, which pulls it most
 * of the way to the turning axis (a 50 / 50 blend keeps cos 80 deg = 17 % of its distance): flat plates near the
 * elbow. Away from the start posture each forearm muscle then moved as ONE rigid piece, so in the dance the muscles
 * that span both bones slid through each other. Now the right forearm is skinned like the left game arm (ns-rig
 * TWIST_SKIN): in a muscle that reaches the radius (a r_radius candidate; muscles on the ulna and the upper arm only,
 * such as brachialis and anconeus, do not turn), any ulna or radius influence of a vertex becomes the ulna frame turned
 * by the vertex's own fraction
 * tf of the radius' turn about the radioulnar axis, tf = smoothstep along the elbow -> wrist line (t0 .. t1 of
 * R_FOREARM_TWIST, the left arm's constants; 1 = the radius frame itself); next to a hand or digit influence it stays
 * the full-turn radius (as on the left arm). The bake uses it, and the right forearm muscles are skinned per vertex
 * with it whenever the forearm, the elbow, the wrist or a digit is away from the start posture (handSkinRecords,
 * HAND_SKIN_JOINTS). Display mechanics on licensed anatomy, not measured soft-tissue motion.
 */
export const R_FOREARM_TWIST = Object.freeze({ t0: TWIST_SKIN.t0, t1: TWIST_SKIN.t1, steps: TWIST_TABLE_STEPS });
/** The twist frame of the right forearm (rest mm): { elbow, dir (elbow -> wrist, unit), lengthMm, axis (radioulnar
 * pronation axis, unit), point (its pivot) }, or null when the rig lacks a joint. */
export function rForearmTwistFrame(rig) {
  const J = rig && rig.pivots, e = J && J.r_elbow && J.r_elbow.point, w = J && J.r_wrist && J.r_wrist.point, ru = J && J.r_radioulnar;
  const axis = ru && ru.axes && ru.axes.pron, point = ru && ru.point;
  if (!e || !w || !axis || !point) return null;
  const d = sub(w, e), L = len(d);
  if (!(L > 1)) return null;
  return Object.freeze({ elbow: e, dir: scl(d, 1 / L), lengthMm: L, axis, point });
}
function rTwistAt(tw, x, y, z) {
  const t = ((x - tw.elbow[0]) * tw.dir[0] + (y - tw.elbow[1]) * tw.dir[1] + (z - tw.elbow[2]) * tw.dir[2]) / tw.lengthMm;
  const u = clamp((t - R_FOREARM_TWIST.t0) / (R_FOREARM_TWIST.t1 - R_FOREARM_TWIST.t0), 0, 1);
  return u * u * (3 - 2 * u);
}
/** The twist pass on two-influence index arrays (BODY_SEGMENTS indexes; changed in place): returns tf (Float32Array,
 * the fraction for a twisted r_forearm influence) or null when no vertex is twisted. Both influences of a vertex on the
 * two forearm bones become the one twisted frame (the weights then do not matter: both maps are the same). */
function rForearmTwistPass(rig, p, ia, ib) {
  const tw = rForearmTwistFrame(rig);
  if (!tw) return null;
  const RF = SEG_INDEX.get('r_forearm'), RR = SEG_INDEX.get('r_radius');
  let tf = null;
  for (let v = 0, k = 0; k < p.length; v++, k += 3) {
    const a = ia[v], b = ib[v], fa = a === RF || a === RR, fb = b === RF || b === RR;
    if (!fa && !fb) continue;
    const other = fa && fb ? -1 : fa ? b : a;
    if (other >= 0 && HAND_SKIN_RE.test(BODY_SEGMENTS[other])) { if (fa) ia[v] = RR; else ib[v] = RR; continue; }
    const f = rTwistAt(tw, p[k], p[k + 1], p[k + 2]);
    const seg = f >= 1 - 1e-6 ? RR : RF;
    if (fa) ia[v] = seg;
    if (fb) ib[v] = seg;
    if (seg === RF && f > 1e-6) { if (!tf) tf = new Float32Array(p.length / 3); tf[v] = f; }
  }
  return tf;
}
/**
 * The per-pose table of twisted right-forearm frames: entry k (0..steps) = mF x R(k / steps x turn) about the radioulnar
 * axis, 16 numbers each (column-major 4x4), where turn is the radius' signed turn about the ulna read from the two
 * segment matrices (mR = mF x R(turn); |turn| < 180 deg, r_pronation is 0..160). A twisted influence blends the two
 * entries around its fraction (rForearmTwistMap).
 */
export function rForearmTwistTable(mF, mR, frame) {
  const rel = m4Mul(m4RigidInv(mF), mR), a = frame.axis;
  const cosA = (rel[0] + rel[5] + rel[10] - 1) / 2;
  const sinA = ((rel[6] - rel[9]) * a[0] + (rel[8] - rel[2]) * a[1] + (rel[1] - rel[4]) * a[2]) / 2;
  const turnDeg = Math.atan2(sinA, cosA) / DEG, K = R_FOREARM_TWIST.steps, T = new Float64Array(16 * (K + 1));
  for (let k = 0; k <= K; k++) T.set(m4Mul(mF, m4RotAbout(a, (k / K) * turnDeg, frame.point)), 16 * k);
  return T;
}
/** The twisted frame (16 numbers) for fraction f from a rForearmTwistTable, into out. */
export function rForearmTwistMap(T, f, out) {
  const K = R_FOREARM_TWIST.steps, x = clamp(f, 0, 1) * K, k = x >= K ? K - 1 : Math.floor(x), fr = x - k, o = 16 * k;
  for (let j = 0; j < 16; j++) out[j] = T[o + j] + fr * (T[o + 16 + j] - T[o + j]);
  return out;
}

/** R558 (Messages 14 / 15): the right-hand muscles a single rigid matrix cannot carry once the digits move on their own:
 * every muscle whose candidate segments include the right hand or a right digit (the long finger and thumb muscles, the
 * wrist muscles and the hand's own muscles and muscle sets). */
const HAND_SKIN_RE = /^r_(hand|thumb_(mc|pp|dp)|(index|middle|ring|little)_(pp|mp|dp))$/;
/** The joints whose change from the start posture makes the right hand's muscles need per-vertex skinning. */
export const HAND_SKIN_JOINTS = Object.freeze(['r_wrist_flex', 'r_wrist_ext', 'r_wrist_dev', 'r_grasp', 'r_open', 'r_thumb_flex', 'r_thumb_opp',
  'r_index_flex', 'r_middle_flex', 'r_ring_flex', 'r_little_flex', 'r_finger_spread',
  // R558 (R_FOREARM_TWIST): the right forearm's turn and the elbow bend its muscles per vertex too.
  'r_pronation', 'r_elbow_flex']);
/**
 * Skin records for the scene's setBodySkin: Map(element id -> { src (source positions, Float32Array), i0, i1, w0, w1 })
 * for every right-hand muscle (HAND_SKIN_RE) with source geometry, from bodySkinWeights: the same two nearest candidate
 * bones and inverse-square weights that baked the start posture, so the skinned start pose is the baked one exactly.
 * meshesById: the SOURCE meshes (the ones buildBodyRig / bakeBodyPosture were given).
 */
export function handSkinRecords(rig, meshesById, options = {}) {
  checkRig(rig);
  const get = meshGetter(meshesById), out = new Map();
  for (const m of rig.muscles) {
    const info = rig.meshSegment[m.id];
    // R558: and every right forearm muscle that reaches the radius, for the continuous twist (R_FOREARM_TWIST).
    if (!info || !(info.candidates || []).some(s => HAND_SKIN_RE.test(s) || s === 'r_radius')) continue;
    const p = positionsOf(get(m.id));
    if (!p) continue;
    const w = bodySkinWeights(rig, m.id, p, options);
    if (!w) continue;
    out.set(m.id, { src: p instanceof Float32Array ? p : Float32Array.from(p), i0: w.i0, i1: w.i1, w0: w.w0, w1: w.w1, ...(w.tf ? { tf: w.tf, twist: w.twist } : {}) });
  }
  return out;
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

/**
 * R5-pronation (R27): the LEFT body muscles lit by the left forearm turn. byName is ns-actions rotationOutputs(state)
 * .muscles ({ 'pectoralis major': 0.6, ... }: name fragment -> 0..1 simulated display level; the left-arm view-model
 * meshes are lit from the same object by the scene's updateMuscles). Returns { meshId: level } for every left-side body
 * muscle whose name contains a fragment (case-insensitive), e.g. the three parts of the left pectoralis major for the
 * internal-rotator fragment. Right-side muscles never light (the turn is the left arm's). Max-merge the result into the
 * bodyMuscleDrives drives before updateBody. options.rig: match that rig's muscles (default: the full-body catalog).
 * Simulated, unitless display levels of standard muscle roles; not EMG or force.
 */
export function rotationBodyDrives(byName, options = {}) {
  const out = {};
  if (!byName || typeof byName !== 'object') return out;
  const frags = Object.entries(byName).filter(([k, v]) => typeof k === 'string' && k.trim() && Number.isFinite(v) && v > 0)
    .map(([k, v]) => [k.trim().toLowerCase(), clamp(v, 0, 1)]);
  if (!frags.length) return out;
  for (const m of catalogOf(options)) {
    if (m.side !== 'left') continue;
    const nm = String(m.name || '').toLowerCase();
    for (const [k, v] of frags) if (nm.includes(k) && !(out[m.id] >= v)) out[m.id] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rest postures. R558 (genuine note of 11 November 2026, "start with the limbs fully straight out"): the game now starts
// in the 'open' posture, standing with every limb straight and spread. The older 'seated' posture stays available.
//
// Round 3 (R3-body) history, why the body used to sit: from the first-person eye of the upright BodyParts3D body the chest (anterior surface about y = -214 mm)
// lies in front of the line of sight to the thighs and feet, so a standing body shows only the chest when you look down
// (round 2 needed an eye shift and a dithered see-through window). Seated, the thighs run forward from the hips, so
// looking down shows the chest and belly near you, then the lap, the knees and, past the knees, the feet: nothing has
// to be see-through. A seated player is also the ordinary way to play a desktop game. The upper body is NOT moved
// (no trunk, neck or jaw angle), so the head, the first-person eye, the face layer and the left-arm shoulder stay
// exactly where they were. No chair or floor is drawn; the posture is a display choice, not a measured pose.

/**
 * Rest postures in degrees from the BodyParts3D source pose (same ids and signs as BODY_JOINT_LIMITS / ns-bodymap
 * JOINT_SEMANTICS; missing ids are 0). Display choices inside ordinary adult ranges of motion, not measured on anyone.
 *  - 'open' (DEFAULT_BODY_POSTURE, R558 as corrected by the user: "out straight forward front facing", "an invisible
 *    ground ... flat", and "all the limbs straight out like a stick (perpendicular from the torso), instead of the
 *    suggestive spread eagle pose"): every limb straight FORWARD, at right angles to the trunk. The body sits upright
 *    on an invisible flat ground with both legs straight out in front, side by side ("long sitting": hips flexed 90
 *    deg, knees, ankles and toes straight). Each leg is swung only 6 deg out to its own side (hip abduction): in the
 *    source pose the thighs slope inward to the knees, and 6 deg makes them run parallel, so the knees stay about a
 *    hip width apart instead of nearly touching ("The knees/thighs of the legs should not be so close together")
 *    without any spread. The right arm points straight forward at shoulder height
 *    (shoulder flexed 90 deg, elbow, wrist and fingers straight), the forearm turned fully palm down (160 of 160 deg,
 *    80 deg past thumb-up, the same full pronation as the left game arm's start, for left-right symmetry). The left arm is
 *    the game arm: it reaches forward to its full length toward the look point (ns-arm), straight forward at look 0/0.
 *    Hip flexion 90 with a straight knee is at the end of the usual straight-leg range (hamstrings), inside the joint
 *    limits. The skull stays at its source place (bakeBodyPosture keeps it); no floor is drawn. A display choice
 *    inside ordinary adult ranges of motion, not a measured pose.
 *  - 'seated' (the default until R558): sitting upright on an ordinary seat, thighs level to slightly rising toward the
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
  open: { hip_flex_L: 90, hip_flex_R: 90, hip_abd_L: 6, hip_abd_R: 6, r_shoulder_flex: 90, r_pronation: 160 },
  seated: {
    hip_flex_L: 95, hip_flex_R: 95, knee_ext_L: -45, knee_ext_R: -45, ankle_dorsi_L: -15, ankle_dorsi_R: -15,
    r_shoulder_flex: 15, r_shoulder_abd: 15, r_elbow_flex: 85, r_pronation: 115, r_wrist_flex: 10, r_grasp: 20
  }
});
/**
 * R558 (user: "an invisible ground ... flat"; the start posture sits on it with the legs straight forward): keep each
 * leg on or above the ground. With the thigh lying level (hip flexion 90 at rest) a knee bend would swing the shank
 * and foot down through the ground; a sitting person instead slides the heel along the ground toward the buttock, so
 * the thigh rises. In the leg's own plane the heel's height above its start is T sin(t) + S sin(t - k) (T, S: hip-knee
 * and knee-ankle lengths of this rig, t: thigh rise above level, k: knee bend); the smallest t >= 0 that keeps it at
 * or above 0 is added to the hip flexion. When even the hip's display cap cannot keep the heel up, the knee bends only
 * as far as the cap allows. A hip below level (the thigh into the ground) is raised to level. Postures whose hips do
 * not rest at 90 are returned unchanged. Pure; returns a new object. Not a contact model: no squash, no friction.
 * @param angles { BODY_JOINT_ID: deg } absolute joint angles
 * @param options { posture = DEFAULT_BODY_POSTURE, limits = bodyPostureLimits(posture) }
 */
export function groundLegAngles(rig, angles, { posture = DEFAULT_BODY_POSTURE, limits = bodyPostureLimits(posture) } = {}) {
  const out = { ...angles };
  const rest = bodyPostureAngles(posture);
  const pv = rig && rig.pivots ? rig.pivots : {};
  const pt = k => (pv[k] && Array.isArray(pv[k].point) ? pv[k].point : null);
  for (const [s, S] of [['r', 'R'], ['l', 'L']]) {
    if (Math.abs(rest[`hip_flex_${S}`] - 90) > 1e-9) continue;
    const hip = pt(`${s}_hip`), knee = pt(`${s}_knee`), ankle = pt(`${s}_ankle`);
    if (!hip || !knee || !ankle || !Number.isFinite(out[`hip_flex_${S}`]) || !Number.isFinite(out[`knee_ext_${S}`])) continue;
    const T = Math.hypot(knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]);
    const L = Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1], ankle[2] - knee[2]);
    if (!(T > 0 && L > 0)) continue;
    const cap = limits && limits[`hip_flex_${S}`] ? limits[`hip_flex_${S}`][1] : BODY_JOINT_LIMITS[`hip_flex_${S}`][1];
    const tMax = Math.max(0, cap - 90) * DEG;
    let k = Math.max(0, -out[`knee_ext_${S}`]) * DEG;
    const h = out[`hip_flex_${S}`];
    const heel = t => T * Math.sin(t) + L * Math.sin(t - k);
    let t = Math.max(0, (h - 90) * DEG);
    if (heel(t) < 0) {
      if (heel(tMax) < 0) { t = tMax; k = Math.min(k, tMax + Math.asin(Math.min(1, (T * Math.sin(tMax)) / L))); }
      else { let lo = t, hi = tMax; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (heel(m) >= 0) hi = m; else lo = m; } t = hi; }
    }
    out[`hip_flex_${S}`] = Math.max(h, 90 + t / DEG);
    out[`knee_ext_${S}`] = -k / DEG;
  }
  return out;
}

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
 * 'open' keeps the same 110 deg hip-flexion cap (the thigh and belly meshes are the same ones).
 * R558 audit (Message 2): these are the only caps below BODY_JOINT_LIMITS, and each keeps its documented mesh reason
 * (the 110 deg thigh lift; the seated 120 deg elbow). Hip extension follows the rig limit (-30, AAOS). With a straight
 * knee HIP_KNEE_COUPLING (applied in clampBodyJointTargets) holds the hip at 100, below the 110 cap.
 */
export const BODY_POSTURE_LIMITS = deepFreezeRig({
  anatomical: {},
  open: { hip_flex_L: [-30, 110], hip_flex_R: [-30, 110] },
  seated: { hip_flex_L: [-30, 110], hip_flex_R: [-30, 110], r_elbow_flex: [0, 120] }
});
/** The posture the game uses (R558 decisions 21 and 22: limbs straight forward, sitting on an invisible flat ground;
 * it replaces decision D4, seated, and the first R558 standing star). */
export const DEFAULT_BODY_POSTURE = 'open';
/** Plain-language posture lines for the HUD / Esc page (R17). */
export const BODY_POSTURE_TEXT = Object.freeze({
  open: 'Your body sits on an invisible flat ground with every limb straight forward, at right angles to your trunk: legs out in front side by side, both arms reaching forward. Look down to see your chest, legs and feet.',
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
 * R558: the game no longer poses from this (ns-actions now holds ABSOLUTE joint angles, laid over the posture's own
 * angles by the app); it is kept for the 'seated' posture tools and existing checks.
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
  const tf = avail.includes('r_radius') ? rForearmTwistPass(rig, p, ia, ib) : null; // R558: the right forearm's continuous twist (R_FOREARM_TWIST)
  const out = { p, avail: avail.join(','), ia, ib, wa, tf };
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
          // R558: a twisted right-forearm influence uses its own turned ulna frame (R_FOREARM_TWIST).
          const tw = w.tf ? rForearmTwistFrame(rig) : null;
          const T = tw ? rForearmTwistTable(mats[SEG_INDEX.get('r_forearm')], mats[SEG_INDEX.get('r_radius')], tw) : null;
          const RF = SEG_INDEX.get('r_forearm'), mA = new Float64Array(16), mB = new Float64Array(16);
          for (let i = 0, v = 0; i < p.length; i += 3, v++) {
            const x = p[i], y = p[i + 1], z = p[i + 2], f = T ? w.tf[v] : 0;
            const a = f > 0 && w.ia[v] === RF ? rForearmTwistMap(T, f, mA) : mats[w.ia[v]];
            const b = f > 0 && w.ib[v] === RF ? rForearmTwistMap(T, f, mB) : mats[w.ib[v]];
            const wa = w.wa[v], wb = 1 - wa;
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

/**
 * R173: public read-only frame used by the fitted-arm/body bridge.
 * Public baked.segments are Float32 copies; poseBodyDetailed applies the original Float64 keepM.
 * Validate ownership here, inside the body producer, and copy that exact K without exposing any setter/private object.
 * Current pelvis-anchor raw external E is corrected by K once in poseBodyDetailed. Other anchor contracts are not admitted.
 */
export function bodyPostureKeepFrame(rig, baked) {
  checkRig(rig);
  const b = checkBaked(rig, baked);
  const K = b._internal.keepM;
  if (!K || K.length !== 16) throw new Error('ns:body_pose: baked keep frame must have16 elements');
  const matrix = new Array(16);
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(K[i])) throw new Error('ns:body_pose: baked keep frame must be finite');
    matrix[i] = K[i];
  }
  return Object.freeze({
    kind: BODY_KEEP_FRAME_KIND, sourceDomain: BODY_ARM_SOURCE_DOMAIN, anchor: 'pelvis',
    from: 'pre-keep-posed-body-mm', to: 'corrected-posed-body-mm',
    rigGeneration: rig, bakeGeneration: b, matrix: Object.freeze(matrix)
  });
}

/** Rig-derived pelvis anchor in the actual baked source frame; read-only, geometry provenance required. */
export function bodyRootAnchor(rig, baked = null) {
  checkRig(rig);
  const joint = rig.pivots && rig.pivots.lumbosacral;
  if (!joint || joint.source !== 'geometry' || !joint.point || joint.point.length !== 3 || !joint.point.every(Number.isFinite)) throw new Error('ns:body_pose: actual lumbosacral anchor unavailable');
  const b = baked ? checkBaked(rig, baked) : null;
  const point = b ? m4Point(bodyPostureKeepFrame(rig, b).matrix, joint.point) : joint.point.slice();
  return Object.freeze({ kind: 'ns-body-root-anchor-r266', anchor: 'pelvis', pointBp: Object.freeze(point),
    rigGeneration: rig, bakeGeneration: b, meaning: 'Rig-derived lumbosacral/pelvis reference after exact baked keep frame; not measured or normal-biomechanics qualification' });
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
// Round 5 (R5-body, D15): Body Worlds layers
//
// The user (2026-11-08T21:54Z): "make the superficial muscles slightly detached. Gunther von Hagens style body worlds, so
// that we can see into the deep muscles."
//
// R183: anatomical qualification comes from exact-ID bounded regional source records
// (ns-regional-layers.mjs; R175/R130/R135 pins), with scope/head/part caveats intact.
// Historical generated topExposure and textbook letters below describe the producer's
// display selection only. They do not qualify anatomical depth or promote unknown/I/D
// records to an outer relation. 72 qualified outer records are display candidates;
// 59 scoped intermediate/deeper and 95 current unknown records are in the catalogue.
//
// R558: the display no longer uses the numeric directions/distances/peel recorded in
// this section (BODY_LAYER_RULE.offset, the generated TABLE/UNITS and bodyLayerRecord).
// They stay as the record of the round-5 producer run. What is drawn is the anchored
// stack further down (BODY_STACK_RULE): still an illustrative display choice, not a
// physiological detachment measurement. Physical rest, rig, weights, pose and
// force/controller state are unchanged by it.

/** Historical producer textbook letters, retained for generation provenance; not anatomical qualification. */
export const BODY_LAYER_TEXTBOOK = Object.freeze({
  // shoulder and arm
  'deltoid': 'S', 'biceps brachii': 'S', 'triceps brachii': 'S', 'brachialis': 'D', 'coracobrachialis': 'D',
  'supraspinatus': 'D', 'infraspinatus': 'D', 'teres minor': 'D', 'subscapularis': 'D', 'teres major': 'I',
  // forearm, front
  'flexor carpi radialis': 'S', 'flexor carpi ulnaris': 'S', 'palmaris longus': 'S', 'pronator teres': 'S',
  'flexor digitorum superficialis': 'I', 'flexor digitorum profundus': 'D', 'flexor pollicis longus': 'D', 'pronator quadratus': 'D',
  // forearm, back
  'brachioradialis': 'S', 'extensor carpi radialis longus': 'S', 'extensor carpi radialis brevis': 'S', 'extensor digitorum': 'S',
  'extensor digiti minimi': 'S', 'extensor carpi ulnaris': 'S', 'anconeus': 'S', 'supinator': 'D', 'abductor pollicis longus': 'D',
  'extensor pollicis brevis': 'D', 'extensor pollicis longus': 'D', 'extensor indicis': 'D',
  // hand
  'abductor pollicis brevis': 'S', 'flexor pollicis brevis': 'S', 'opponens pollicis': 'D', 'adductor pollicis': 'D',
  'abductor digiti minimi of hand': 'S', 'flexor digiti minimi brevis of hand': 'S', 'opponens digiti minimi of hand': 'D',
  'lumbricals of hand': 'I', 'dorsal interossei of hand': 'D', 'palmar interossei of hand': 'D',
  // trunk and neck
  'pectoralis major': 'S', 'trapezius': 'S', 'external oblique': 'S', 'serratus anterior': 'I', 'levator scapulae': 'D',
  'sternocleidomastoid': 'S', 'digastric': 'S', 'mylohyoid': 'I', 'geniohyoid': 'D',
  // hip and leg
  'gluteus maximus': 'S', 'gluteus medius': 'I', 'rectus femoris': 'S', 'vastus lateralis': 'S', 'vastus medialis': 'S',
  'vastus intermedius': 'D', 'sartorius': 'S', 'biceps femoris': 'S', 'semitendinosus': 'S', 'semimembranosus': 'I',
  'adductor magnus': 'D', 'gastrocnemius': 'S', 'soleus': 'I', 'tibialis anterior': 'S', 'extensor digitorum longus': 'S',
  'extensor hallucis longus': 'D', 'flexor digitorum longus': 'D', 'flexor hallucis longus': 'D', 'iliacus': 'D', 'psoas major': 'D',
  // face and jaw (D20 packet; no visibility score yet, so the rule leaves them in place until they are scored)
  'occipitofrontalis': 'S', 'orbicularis oculi': 'S', 'orbicularis oris': 'S', 'zygomaticus major': 'S', 'zygomaticus minor': 'S',
  'levator labii superioris': 'S', 'levator labii superioris alaeque nasi': 'S', 'risorius': 'S', 'depressor anguli oris': 'S',
  'depressor labii inferioris': 'I', 'mentalis': 'I', 'levator anguli oris': 'I', 'buccinator': 'D', 'corrugator supercilii': 'D',
  'procerus': 'S', 'nasalis': 'S', 'platysma': 'S', 'temporoparietalis': 'S', 'depressor septi nasi': 'I', 'masseter': 'S',
  'temporalis': 'S', 'medial pterygoid': 'D', 'lateral pterygoid': 'D'
});
/** Pieces whose textbook layer differs from the rest of their muscle (they form their own unit). */
export const BODY_LAYER_PIECE_TEXTBOOK = Object.freeze({
  'medial head of triceps brachii': 'D', 'ulnar head of pronator teres': 'D', 'short head of biceps femoris': 'D'
});
/** Historical producer exposure thresholds and unchanged display sizes; not anatomical qualification. */
export const BODY_LAYER_RULE = Object.freeze({
  metric: 'topExposure: mean share of the muscle\'s own silhouette that is front-most, over its best quarter of 128 directions (source pose, 1 mm pixels)',
  superficialAtLeast: Object.freeze({ S: 0.3, I: 0.6, D: 0.9 }),
  // 0.15 (3 to about 12 mm in this body), not 0.2: viewed and measured (round5/R5-body-NOTES.md), 0.2 pushed the external
  // obliques far enough over the lap that the first-person look-down lost belly contrast (e2e S35); 0.15 keeps it.
  offset: Object.freeze({ perCubeRootMm: 0.15, minMm: 3, maxMm: 15 }),
  peel: 'about the end nearest the first attachment; at peel 1 the far end lifts by one more offset',
  // Viewed (round5/R5-body-NOTES.md): peel 1 fans the knee and ankle tendons out; 0.5 keeps the lift readable and tidy.
  peelDefault: 0.5
});

/** Split a source muscle name into { side, piece, base, unit, textbook } (side words removed from base). */
export function muscleLayerKey(name) {
  let n = lowerName(name).replace(/ muscle$/, '');
  const side = /\bright\b/.test(n) ? 'right' : /\bleft\b/.test(n) ? 'left' : null;
  n = n.replace(/\b(right|left) /g, '').replace(/ of (right|left) hand$/, ' of hand').replace(/^set of /, '');
  let piece = null, base = n;
  let m = /^(acromial|clavicular|spinal|sternocostal|abdominal|descending|transverse|ascending|superficial|deep|orbital|palpebral) part of (.+)$/.exec(n);
  if (!m) m = /^(long|short|lateral|medial|humeral|ulnar|oblique|transverse|superficial|deep|frontal|occipital|superior|inferior) (?:head|belly) of (.+)$/.exec(n);
  if (!m) m = /^(half) of (.+)$/.exec(n);
  if (m) { piece = n; base = m[2]; }
  const pieceLayer = piece ? BODY_LAYER_PIECE_TEXTBOOK[piece] : undefined;
  const textbook = pieceLayer || BODY_LAYER_TEXTBOOK[base] || null;
  const unit = `${side ? side + ' ' : ''}${base}${pieceLayer ? ` (${piece.replace(` of ${base}`, '')})` : ''}`;
  return { side, piece, base, unit, textbook };
}

/** Exact-ID regional classification. Legacy calls with only S/I/D + a score now return unclassified.
 * Exposure is diagnostic display data, never a substitute for selected-part anatomical evidence. */
export function bodyLayerClass(id) {
  return regionalLayerQualification(id).layer;
}

/** Detachment distance (mm) for a unit volume in cm^3 (see BODY_LAYER_RULE.offset). */
export function bodyLayerOffsetMm(volumeCm3) {
  const o = BODY_LAYER_RULE.offset;
  if (!Number.isFinite(volumeCm3) || volumeCm3 <= 0) return o.minMm;
  return Math.round(clamp(o.perCubeRootMm * Math.cbrt(volumeCm3 * 1000), o.minMm, o.maxMm) * 10) / 10;
}

/** Regional anatomy and display parameters are separate. Missing IDs return an explicit
 * unclassified zero-offset record. Numeric parameters remain the unchanged producer values
 * only for qualified outer candidates with a generated selected display record. */
export function bodyLayerRecord(id) {
  const q = regionalLayerQualification(id);
  const row = typeof id === 'string' && Object.prototype.hasOwnProperty.call(BODY_LAYER_TABLE, id) ? BODY_LAYER_TABLE[id] : null;
  const unit = row ? row[0] : null, score = row ? row[1] : null;
  const u = unit && Object.prototype.hasOwnProperty.call(BODY_LAYER_UNITS, unit) ? BODY_LAYER_UNITS[unit] : null;
  const [producerLayer, textbook, unitScore, volumeCm3, offsetMm, dir, hinge, axis, peelDeg] = u || [];
  const displayEligible = q.candidate && producerLayer === 's';
  return Object.freeze({ id: typeof id === 'string' ? id : null, unit, layer: q.layer,
    regionalClass: q.regionalClass, qualification: q.qualification, ruleId: q.ruleId, referenceScope: q.referenceScope,
    relativeDepth: q.relativeDepth, sourceIds: q.sourceIds, anatomicalCaveat: q.caveat,
    catalogueSha256: q.catalogueSha256, displayEligible,
    // Historical producer values are exposure diagnostics, not the anatomy class above.
    producerLayer: producerLayer || null, textbook: textbook || null, score, unitScore: unitScore ?? null,
    volumeCm3: volumeCm3 ?? null, offsetMm: displayEligible ? offsetMm : 0,
    dir: displayEligible && dir ? norm(dir) : null, hinge: displayEligible ? hinge : null,
    axis: displayEligible && axis ? norm(axis) : null, peelDeg: displayEligible ? peelDeg : 0 });
}

// ---------------------------------------------------------------------------------------------------------------------
// R558: the Body Worlds stack with anchored ends
//
// The user (2026-11-11): "a Gunther Von Hagens Body Worlds radially (direction, not bone) elevated muscles stack so
// that deep muscles are clearly visible through and under slightly floating superficial ones. That does not mean
// transparency effects to muscles and bones." And: "make sure tendon insertions and origins are still accurate and
// there, even if that means they are much much longer than they otherwise would be."
//
// The round-5 display moved every qualified outer muscle with ONE rigid matrix (3 to 15 mm and a small peel). That
// was too small to read as a stack, and a rigid move takes both ends of the muscle off the bone. It is replaced here
// by a lift per vertex, worked out once per rig:
//
//   lifted(p) = p + share(level) x gap(p) x weight(p) x direction(p)
//
//   level      comes first from the exact-ID regional catalogue (ns-regional-layers.mjs). Qualified outer records are
//              the outer level (share 1). The intermediate level (share 0.5) is the part of the scoped
//              INTERMEDIATE_DEEP records whose own rule text places them between two qualified layers
//              (BODY_STACK_RULE.intermediateRuleIds). Every other qualified deeper record stays in place. A muscle
//              the catalogue leaves unknown gets a level ONLY from an exact-ID row of BODY_STACK_SUPPLEMENT below
//              (round 2: a display classification from textbook layers, kept apart from the catalogue and reported
//              as such); with no row it stays in place. The catalogue itself is never changed or overridden.
//   direction  radial: away from the long axis of the limb segment the muscle lies along, or away from the axis of
//              the trunk. The axes are straight lines between the rig's own joint pivots and segment centroids. A
//              compact muscle (all pieces of one named muscle together) moves along the ONE radial direction of its
//              belly, so its licensed shape is kept and neighbours part; a muscle that wraps far round its axis (the
//              external oblique, the deltoid) moves along each vertex's own radial direction, blended in by how far
//              it wraps.
//   gap        millimetres per body region (BODY_STACK_RULE.gapMm; the neck is its own region), blended across each
//              joint, and dipping at the knee, ankle, elbow and wrist so a tendon crossing the joint stays near it.
//   weight     0 on the attachment ends, 1 over the belly, a smooth ramp between, so the tissue between the lifted
//              belly and the bone is stretched (it becomes much longer than it is) and the ends stay on the bone.
//
// How the ends are found (BODY_STACK_RULE.anchor): a muscle vertex within a few millimetres of a bone surface is "on
// bone". The on-bone vertices in the first and last 30% of a muscle's length (its principal axis, which follows the
// fibres of these meshes) are its two ends, and an end reaches further in while nearly all of the muscle is still on
// bone there (a thin tendon lying on the hand bones), as one unbroken run from that end. Bone the belly merely rests
// on between the ends (ribs under the pectoral belly, the ulna under its extensor) is NOT an attachment and does not
// hold the belly down. A trunk
// muscle is also attached wherever it reaches the midline plane, in any part of its length: that is the long origin
// line of the trapezius on the spinous processes and the nuchal ligament, and the linea alba of the external oblique
// (neither ligament is a mesh in the packet). An end with no bone under it (a tendon ending in an aponeurosis, or on
// a bone this build does not have) falls back to pinning the last 6% of the muscle's length where it is.
//
// Round 3 adds the display FILL (the user: "The muscles should be full, filled-out and plumpy."): at full amount
// EVERY muscle, lifted or not, is also drawn a little fuller, its surface moved outward along its smoothed normal by
// at most a few millimetres per region and at most a share of the local radius (stackFillOffsets), never on the
// anchored ends. The drawn gap between two storeys is the lift difference less the two fills, so it stays under 20 mm
// (round 4; 30 mm in round 3).
//
// This is a DISPLAY CHOICE on licensed anatomy. The floating bellies, the stretched tissue and the fuller shapes are
// not measured anatomy, and the anchor rule is a geometric estimate of where a mesh meets bone, not a dissection record of origins
// and insertions. Physical rest, rig, weights, forces and controller state are not changed by it.

/** The stack display rule (see the block comment above). Millimetres in the source frame. */
export const BODY_STACK_RULE = Object.freeze({
  share: Object.freeze({ outer: 1, intermediate: 0.5 }),
  // FDS: "second of three flexor display layers"; SOLEUS: "deep to gastrocnemius, above deep posterior group";
  // ADDUCTOR_HAND: "palmar adductor layer before interossei" (the catalogue's own relative_depth words).
  intermediateRuleIds: Object.freeze(['FDS', 'SOLEUS', 'ADDUCTOR_HAND']),
  // Every gap is at or below 20 mm ("slightly floating"). The middle level floats at half of it. Round 3: the neck is a
  // region of its own (a slim neck under a 30 mm trunk lift looked like a collar standing off it); the forearm gap is
  // smaller, because its outer muscles are slim and a large radial lift parts them into strands with bone between.
  // Round 4 (Message 18: "anatomical realism and accuracy ... doesn't necessarily have to have a bodybuilder look"):
  // the gaps are smaller (were trunk 30, neck 14, upper arm 20, forearm 11, hand 7, thigh 30, shank 22, foot 8). A
  // 30 mm trunk lift drew the pectorals as mounds that hid the thighs from the eye and the deltoid as a balloon; at
  // these values the outline stays close to an adult body and the storeys read through partings, not through bulk.
  gapMm: Object.freeze({ trunk: 16, neck: 6, upperarm: 12, forearm: 8, hand: 5, thigh: 20, shank: 14, foot: 6 }),
  // Each region keeps its own value over its segment; across a joint the value changes over blendMm on each side.
  regionBlendMm: 50,
  // Round 3: at the knee, ankle, elbow and wrist the gap dips by `share` (smoothly, over halfWidthMm on each side),
  // so a long muscle or tendon that crosses the joint (sartorius and the hamstring tendons at the knee, the shin
  // tendons at the ankle) stays near it instead of standing off the joint as a hoop; bellies keep the full gap.
  jointDip: Object.freeze({ share: 0.65, halfWidthMm: 45 }),
  // Round 3, after the start posture put the legs side by side: on a leg, the part of a lift that points toward the
  // other leg (across the midline side of the limb axis) is removed and the rest is shortened by the same lean
  // (nothing is left at a lean of marginShare, about 40 deg), so the inner-thigh muscles lift backward or forward
  // instead, and less, and a turned leg does not swing them into the other leg.
  legInward: Object.freeze({ marginShare: 0.64 }),
  // Round 4: on the left game arm, the LIFT fades out where the forearm twist skinning turns neighbouring vertices by
  // different angles and where the elbow / wrist blends shear them (see armTwistFade); the fill stays (armStackLift).
  armTwistFade: Object.freeze({ slope: 8, joint: 1 }),
  // R558 (user Message 30: "The bone tips probably shouldn't be so spikey"): on a finger or a toe a tendon lies on its
  // bones. Past the knuckles the hand and foot gaps (5 and 6 mm) floated the long finger and toe tendons that far off
  // phalanges only 8 to 10 mm thick, and each tendon then dived back down to its anchored insertion on the distal
  // phalanx: drawn tendon-white, that dive was a hooked sliver standing off every fingertip and toe tip (the claws and
  // needles of the pictures). Now the LIFT of a vertex (the fill stays) is multiplied by sstep((d - nearMm) / rampMm),
  // where d is its distance to the nearest phalanx (finger and thumb phalanges, toe phalanges; bone vertices plus
  // triangle samples every sampleMm, source mm): a tendon on a digit keeps its atlas place on the bone, and the lift
  // comes back over the metacarpals and metatarsals within about rampMm of the knuckles. A display choice.
  digits: Object.freeze({ nearMm: 4, rampMm: 14, sampleMm: 2 }),
  anchor: Object.freeze({ boneMm: 4, boneSampleMm: 3, midlineMm: 10, endWindow: 0.3, extendStep: 0.05, extendShare: 0.8,
    extendLimit: 0.5, cleanShare: 0.005, cleanMin: 3, capShare: 0.06 }),
  // Round 2: a short ramp (one gap long at least, 36 mm at most). The stretch is taken up close to the attachment,
  // so the free border of a broad sheet stands a full gap off the layer below instead of swelling gently.
  // Round 4: the ramp is also at least distShare of the muscle's largest distance from its anchored ends (its 95th
  // percentile), up to maxMm: the lift then grows over the whole muscle toward the middle of the belly or toward a free
  // border, like a dissected muscle reflected off its bed, instead of a flat-topped plateau with cliffs at the ends
  // (the cliff was the "flat cut edge" of the round-3 deltoid). The distances are searched only as far as the longest
  // ramp a muscle can get (searchMm at least, maxMm for a muscle with its own distShare; see anchoredStackLift).
  ramp: Object.freeze({ lengthShare: 0.1, minGaps: 1, maxMm: 70, bellyMm: 25, distShare: 0.5, searchMm: 36 }),
  direction: Object.freeze({ constantBelowDeg: 60, radialAboveDeg: 120, minRadialMm: 2 }),
  // Round 3, the display FILL (user: "The muscles should be full, filled-out and plumpy."): every muscle, lifted or
  // not, is drawn slightly fuller by moving its surface outward along the smoothed surface normal (stackFillOffsets):
  // at most mm[region], and at most radiusShare x the local radius of the surface, so a thin tendon swells by a
  // fraction of its own thickness while a belly gets the full amount. 0 on the attachment ends, full after endRampMm.
  // head = muscles posed with the skull or the jaw. A display choice, never measured anatomy.
  // Round 4 (Message 18 refines Message 9: full and natural, not inflated): the caps are about a third of round 3's
  // (trunk 3, neck 2.5, head 1.2, upper arm 3.5, forearm 3, hand 1.5, thigh 4, shank 3.5, foot 1.5). Because the
  // amount is min(cap, radiusShare x local radius), a strand or tendon thinner than cap / radiusShare (about 2 to 3 mm)
  // still gets exactly the round-3 amount, so the forearm and shin do not turn stringy again; only the broad bellies,
  // which the atlas already draws full, lost the extra bulk.
  fill: Object.freeze({
    mm: Object.freeze({ trunk: 1, neck: 0.8, head: 0.5, upperarm: 1.3, forearm: 1.6, hand: 0.9, thigh: 1.3, shank: 1.6, foot: 0.9 }),
    radiusShare: 0.6, endRampMm: 8, smoothPasses: 3, weldMm: 0.05,
    // Round 4: a muscle's fill never pushes it out through a muscle of a higher stack level lying on it (the dark
    // flecks of round 3, where a deeper muscle's fill came through the outer sheet near the outer muscle's anchored
    // ends): within coverMm of a higher-level muscle, the fill is at most that muscle's lift there minus
    // coverMarginMm; where that is below 0 the surface is tucked in by as much (at most by the fill it would have
    // had), so the storeys keep a thin parting even where they touch in the atlas.
    coverMm: 4, coverMarginMm: 1
  }),
  // Exact-ID display exceptions. Each is used only when the catalogue knows that id under exactly that name.
  // heldEnds: a tendon that runs UNDER muscles the stack leaves in place is held down from that crossing to its
  // insertion (the given share of the muscle's length from its far end), so it is not drawn floating over them.
  heldEnds: Object.freeze([
    ['FJ1489', 'Right extensor carpi radialis brevis', 0.3], ['FJ1489M', 'Left extensor carpi radialis brevis', 0.3],
    ['FJ1490', 'Right extensor carpi radialis longus', 0.25], ['FJ1490M', 'Left extensor carpi radialis longus', 0.25]
  ].map(([id, name, lengthShare]) => Object.freeze({ id, name, end: 'distal', lengthShare,
    basis: 'tendon passes under abductor pollicis longus and extensor pollicis brevis and the wrist retinaculum' }))),
  // axisOf: a hip muscle rigged with the pelvis lifts away from the thigh's axis (backwards, off the muscles under
  // it), not away from the trunk's axis (which would send the buttock sideways).
  axisOf: Object.freeze([
    ['FJ1418', 'Right gluteus maximus', 'r_leg'], ['FJ1418M', 'Left gluteus maximus', 'l_leg']
  ].map(([id, name, axis]) => Object.freeze({ id, name, axis, basis: 'hip muscle behind the hip joint: lifted radially from the thigh axis' }))),
  // Round 4 (Message 18): exact-ID rows that tune one muscle's lift, display choices with the reason in basis.
  //   gapScale   multiplies its gap
  //   distShare  replaces ramp.distShare for it (1 = the lift grows across the whole muscle: a sheet reflected off
  //              its bed from its origin, highest at its free border)
  //   region     holds that region's gap and fill along its whole length (no blend into the next region)
  //   smooth     { innerMm, outerMm, cellMm, reachMm, blurMm }: the relief of the drawn front surface is shaved down
  //              to a smooth surface through its valleys (stackShaveRelief: only inward), fully within innerMm of the
  //              midline plane and fading out at outerMm; never on anchored ends
  unitRules: Object.freeze([
    ...['FJ1467:Acromial part of right deltoid', 'FJ1468:Clavicular part of right deltoid', 'FJ1513:Spinal part of right deltoid',
      'FJ1467M:Acromial part of left deltoid', 'FJ1468M:Clavicular part of left deltoid', 'FJ1513M:Spinal part of left deltoid'
    ].map(s => s.split(':')).map(([id, name]) => Object.freeze({ id, name, gapScale: 0.55, distShare: 0.8,
      basis: 'lies directly on the humeral head and the rotator cuff: a smaller, gradual lift keeps it a cap of three parts instead of a balloon' })),
    ...['FJ1447:Clavicular part of right pectoralis major', 'FJ1464:Sternocostal part of right pectoralis major', 'FJ1446:Abdominal part of right pectoralis major',
      'FJ1447M:Clavicular part of left pectoralis major', 'FJ1464M:Sternocostal part of left pectoralis major', 'FJ1446M:Abdominal part of left pectoralis major'
    ].map(s => s.split(':')).map(([id, name]) => Object.freeze({ id, name, gapScale: 0.8, distShare: 1,
      basis: 'reflected from its origin on the sternum and clavicle like a dissected sheet: low near the midline, highest at the free lower outer border over serratus anterior' })),
    ...[['FJ1452', 'Right external oblique'], ['FJ1452M', 'Left external oblique']].map(([id, name]) => Object.freeze({ id, name,
      smooth: Object.freeze({ innerMm: 50, outerMm: 85, cellMm: 4, reachMm: 24, blurMm: 10 }),
      basis: 'the atlas sculpts the segments of rectus abdominis into the front of this sheet (the anterior rectus sheath); that relief is drawn shaved down to a smooth surface within about 50 to 85 mm of the midline, so the sheath does not read as a rectus abdominis ("six-pack"); when the real rectus abdominis is loaded (missing-muscles-r1) the part of the sheet in front of it is not drawn at all (openRectusSheath: the sheath opened, as in a dissection)' })),
    ...[['FJ1595', 'Right sternocleidomastoid'], ['FJ1573', 'Left sternocleidomastoid']].map(([id, name]) => Object.freeze({ id, name, region: 'neck',
      basis: 'neck muscle from the mastoid to the sternum and clavicle: the neck gap along its whole length, so its lower end does not stand off as a hood' }))
  ])
});
// A packet row (missing-muscles-r1; `packet` set) is used only for an id the producer catalogue does not know at all, so
// it can never stand in for a catalogue row; every other row needs the catalogue's exact source name.
const stackRuleRow = (rows, id) => {
  const r = typeof id === 'string' ? rows.find(x => x.id === id) : null;
  if (!r) return null;
  const q = regionalLayerQualification(id);
  return (r.packet ? q.id === null : q.sourceName === r.name) ? r : null;
};

/**
 * SUPPLEMENTARY stack levels (R558 round 2): exact-ID rows for muscles the producer catalogue
 * (ns-regional-layers.mjs) leaves UNQUALIFIED, so the thigh, the shin and the side of the chest also show more than
 * one storey. This table is NOT part of the producer catalogue and never overrides it: a row is used only when the
 * catalogue knows that exact id under exactly that source name AND gives it no class of its own. The catalogue record
 * of such a muscle still reads "unclassified"; the level is reported with source 'supplement' and the row's basis.
 *
 * The basis of every row is the usual textbook description of the layers of that compartment (which muscle lies on
 * which). It is a DISPLAY CLASSIFICATION from general anatomy, not a measurement of this body's meshes and not a
 * reviewed source relation like the catalogue's. A 'deep' row lifts nothing; it records which muscle is the storey
 * left in place under the lifted ones.
 *
 * R558 (builder AN): the muscles that used to be missing here (latissimus dorsi, rectus abdominis, tensor fasciae
 * latae, gracilis, adductor longus, fibularis longus, the erector spinae, the rhomboids, pectoralis minor, ...) now come
 * from the missing-muscles packet; their ids are unknown to the producer catalogue, so their levels are in
 * BODY_STACK_PACKET below, not in this table.
 */
const supplementRows = (level, basis, pairs) => pairs.map(([id, name]) => Object.freeze({ id, name, level, basis }));
export const BODY_STACK_SUPPLEMENT = Object.freeze({
  kind: 'ns-body-stack-supplement',
  scope: 'Display classification from standard gross-anatomy layer descriptions. Not a measurement of this body, and not part of the producer catalogue.',
  rows: Object.freeze([
    ...supplementRows('intermediate', 'front of thigh: beside and under rectus femoris; covers vastus intermedius',
      [['FJ1442', 'Right vastus lateralis'], ['FJ1442M', 'Left vastus lateralis'], ['FJ1443', 'Right vastus medialis'], ['FJ1443M', 'Left vastus medialis']]),
    ...supplementRows('outer', 'back of thigh, superficial hamstring: covers the short head of biceps femoris',
      [['FJ1395', 'Long head of right biceps femoris'], ['FJ1395M', 'Long head of left biceps femoris']]),
    ...supplementRows('outer', 'back of thigh, superficial hamstring: lies on semimembranosus',
      [['FJ1436', 'Right semitendinosus'], ['FJ1436M', 'Left semitendinosus']]),
    ...supplementRows('intermediate', 'back of thigh: under semitendinosus, on adductor magnus',
      [['FJ1435', 'Right semimembranosus'], ['FJ1435M', 'Left semimembranosus']]),
    ...supplementRows('deep', 'back of thigh: on the femur, under the long head of biceps femoris',
      [['FJ1444', 'Short head of right biceps femoris'], ['FJ1444M', 'Short head of left biceps femoris']]),
    ...supplementRows('outer', 'front of leg, superficial: covers extensor hallucis longus',
      [['FJ1439', 'Right tibialis anterior'], ['FJ1439M', 'Left tibialis anterior']]),
    ...supplementRows('outer', 'front of leg, superficial, beside tibialis anterior: covers extensor hallucis longus',
      [['FJ1406', 'Right extensor digitorum longus'], ['FJ1406M', 'Left extensor digitorum longus']]),
    ...supplementRows('deep', 'front of leg: between and under tibialis anterior and extensor digitorum longus',
      [['FJ1408', 'Right extensor hallucis longus'], ['FJ1408M', 'Left extensor hallucis longus']]),
    ...supplementRows('intermediate', 'side of chest: on the ribs, under pectoralis major and the shoulder blade',
      [['FJ1459', 'Right serratus anterior'], ['FJ1459M', 'Left serratus anterior']]),
    ...supplementRows('outer', 'side of neck, superficial: covers the deep neck muscles',
      [['FJ1595', 'Right sternocleidomastoid'], ['FJ1573', 'Left sternocleidomastoid']])
  ])
});
const STACK_SUPPLEMENT_BY_ID = new Map(BODY_STACK_SUPPLEMENT.rows.map(r => [r.id, Object.freeze({ level: r.level, source: 'supplement', basis: r.basis, name: r.name })]));

/**
 * R558 (builder AN): stack levels of the missing-muscles packet (packets/missing-muscles-r1: BodyParts3D 4.0 members and
 * Z-Anatomy derivatives the producer catalogue has never seen). Exact ids; a row is used only when the catalogue does
 * not know the id at all (it never overrides or fills in for a catalogue row). Each basis is the usual textbook layer
 * description of that compartment (which muscle lies on which): a DISPLAY CLASSIFICATION from general anatomy, not a
 * measurement of these meshes. 'outer' and 'intermediate' rows are lifted by the radial stack like any other muscle of
 * that level; 'deep' rows stay in place. Both sides of a pair share one row (right id first, then the left id).
 */
const packetRows = (level, basis, pairs) => pairs.flatMap(([r, l, name]) => [[r, `right ${name}`], [l, `left ${name}`]])
  .map(([id, name]) => Object.freeze({ id, name, level, basis, packet: 'missing-muscles-r1' }));
const bp3dPair = (id, name) => [id, `${id}M`, name];
export const BODY_STACK_PACKET = Object.freeze({
  kind: 'ns-body-stack-packet',
  scope: 'Display classification from standard gross-anatomy layer descriptions for the missing-muscles packet. Not a measurement of these meshes, not part of the producer catalogue.',
  rows: Object.freeze([
    ...packetRows('outer', 'back, superficial layer: under the skin from the lower spine and pelvis to the arm; only its upper inner corner lies under the trapezius',
      [['zm-latissimus-dorsi-r', 'zm-latissimus-dorsi-l', 'latissimus dorsi']]),
    ...packetRows('outer', 'front of the belly, superficial: beside the midline in the rectus sheath (drawn as if the sheath were opened)',
      [['zm-rectus-abdominis-r', 'zm-rectus-abdominis-l', 'rectus abdominis']]),
    ...packetRows('intermediate', 'side of the belly: under the external oblique, over transversus abdominis',
      [['zm-internal-oblique-r', 'zm-internal-oblique-l', 'internal oblique']]),
    ...packetRows('deep', 'back wall of the belly: under the erector spinae and beside psoas, from the iliac crest to the twelfth rib',
      [['zm-quadratus-lumborum-r', 'zm-quadratus-lumborum-l', 'quadratus lumborum']]),
    ...packetRows('deep', 'front of the neck, on the spine: under the throat and the deep neck muscles',
      [['zm-longus-colli-r', 'zm-longus-colli-l', 'longus colli']]),
    ...packetRows('deep', 'back, the erector spinae columns: along the spine under the latissimus dorsi, the trapezius, the serratus posterior and the thoracolumbar fascia',
      [bp3dPair('FJ1527', 'iliocostalis lumborum'), bp3dPair('FJ1528', 'iliocostalis thoracis'), bp3dPair('FJ1526', 'iliocostalis cervicis'),
        bp3dPair('FJ1535', 'longissimus thoracis'), bp3dPair('FJ1534', 'longissimus cervicis'), bp3dPair('FJ1533', 'longissimus capitis'),
        bp3dPair('FJ1544', 'spinalis thoracis')]),
    ...packetRows('intermediate', 'back of the neck: under the trapezius and sternocleidomastoid, over semispinalis capitis', [bp3dPair('FJ1545', 'splenius capitis')]),
    ...packetRows('deep', 'back of the neck, deep: under splenius capitis and the trapezius', [bp3dPair('FJ1538', 'semispinalis capitis')]),
    ...packetRows('deep', 'side of the neck, deep: under sternocleidomastoid, from the neck vertebrae to the first and second ribs',
      [['FJ1592', 'FJ1570', 'scalenus anterior'], ['FJ1593', 'FJ1571', 'scalenus medius'], ['FJ1594', 'FJ1572', 'scalenus posterior']]),
    ...packetRows('outer', 'front of the throat, superficial strap muscles: under the platysma, partly under sternocleidomastoid',
      [['FJ1596', 'FJ1574', 'sternohyoid'], ['FJ1586', 'FJ1565', 'omohyoid']]),
    ...packetRows('deep', 'front of the throat, deep strap muscles and the stylohyoid: under sternohyoid, omohyoid and the digastric',
      [['FJ1597', 'FJ1575', 'sternothyroid'], ['FJ1599', 'FJ1577', 'thyrohyoid'], ['FJ1598', 'FJ1576', 'stylohyoid']]),
    ...packetRows('deep', 'inside the eye socket, above the eyeball: under orbicularis oculi', [['FJ1357', 'FJ1306', 'levator palpebrae superioris']]),
    ...packetRows('outer', 'inner thigh, superficial: the most medial thigh muscle, under the skin', [bp3dPair('FJ1421', 'gracilis')]),
    ...packetRows('outer', 'inner thigh, front layer: beside each other, on adductor brevis', [bp3dPair('FJ1402', 'adductor longus'), bp3dPair('FJ1427', 'pectineus')]),
    ...packetRows('intermediate', 'inner thigh, middle layer: under pectineus and adductor longus, on adductor magnus', [bp3dPair('FJ1401', 'adductor brevis')]),
    ...packetRows('outer', 'outer hip, superficial: in front of gluteus medius, under the skin', [bp3dPair('FJ1438', 'tensor fasciae latae')]),
    ...packetRows('deep', 'hip, deepest gluteal layer: under gluteus medius', [bp3dPair('FJ1420', 'gluteus minimus')]),
    ...packetRows('outer', 'outer side of the leg, superficial: covers fibularis brevis', [bp3dPair('FJ1410', 'fibularis longus')]),
    ...packetRows('intermediate', 'outer side of the leg: under fibularis longus, on the fibula', [bp3dPair('FJ1409', 'fibularis brevis')]),
    ...packetRows('outer', 'front of the leg, superficial: the lower outer strip beside extensor digitorum longus', [bp3dPair('FJ1411', 'fibularis tertius')]),
    ...packetRows('deep', 'back of the leg, deepest layer: under soleus and the long toe flexors', [bp3dPair('FJ1440', 'tibialis posterior')]),
    ...packetRows('intermediate', 'top of the foot: under the tendons of extensor digitorum longus', [bp3dPair('FJ1407', 'extensor hallucis brevis')]),
    ...packetRows('deep', 'sole of the foot: under the plantar aponeurosis; left in place, since the heel and sole rest on the ground', [bp3dPair('FJ1413', 'flexor digitorum brevis')]),
    ...packetRows('intermediate', 'top of the foot: under the tendons of extensor digitorum longus, beside extensor hallucis brevis',
      [['zm-extensor-digitorum-brevis-r', 'zm-extensor-digitorum-brevis-l', 'extensor digitorum brevis']]),
    ...[['zm-flexor-hallucis-brevis-medial-r', 'medial head of right flexor hallucis brevis'], ['zm-flexor-hallucis-brevis-medial-l', 'medial head of left flexor hallucis brevis'],
      ['zm-flexor-hallucis-brevis-lateral-r', 'lateral head of right flexor hallucis brevis'], ['zm-flexor-hallucis-brevis-lateral-l', 'lateral head of left flexor hallucis brevis']]
      .map(([id, name]) => Object.freeze({ id, name, level: 'deep', packet: 'missing-muscles-r1',
        basis: 'sole of the foot, deep: under abductor hallucis and the long flexor tendons, along the first metatarsal' })),
    ...packetRows('deep', 'inner edge of the sole: left in place, since the sole rests on the ground', [bp3dPair('FJ1400', 'abductor hallucis')]),
    ...packetRows('deep', 'belly wall, deepest layer: under the internal oblique',
      [['zm-transversus-abdominis-r', 'zm-transversus-abdominis-l', 'transversus abdominis']]),
    ...packetRows('intermediate', 'upper back, middle layer: under the trapezius, on serratus posterior superior and the erector spinae',
      [bp3dPair('FJ1536', 'rhomboid major'), bp3dPair('FJ1537', 'rhomboid minor')]),
    ...packetRows('deep', 'upper back, deep: under the rhomboids, on the erector spinae', [bp3dPair('FJ1542', 'serratus posterior superior')]),
    ...packetRows('intermediate', 'low back, middle layer: under the latissimus dorsi, on the erector spinae', [bp3dPair('FJ1541', 'serratus posterior inferior')]),
    ...packetRows('deep', 'back, transversospinal layer: under the erector spinae columns', [bp3dPair('FJ1540', 'semispinalis thoracis'), bp3dPair('FJ1539', 'semispinalis cervicis')]),
    ...packetRows('deep', 'side and back of the neck: under the trapezius and sternocleidomastoid (as the left one, which the catalogue classes deep)',
      [['FJ1532', 'FJ1532M', 'levator scapulae']]).filter(r => r.id === 'FJ1532'),
    ...packetRows('intermediate', 'front of the chest, middle layer: under pectoralis major, on the ribs', [bp3dPair('FJ1456', 'pectoralis minor')]),
    ...packetRows('deep', 'hip, deep rotators: under gluteus maximus, behind the hip joint',
      [bp3dPair('FJ1428', 'piriformis'), bp3dPair('FJ1426', 'obturator internus'), bp3dPair('FJ1417', 'gemellus superior'),
        bp3dPair('FJ1416', 'gemellus inferior'), bp3dPair('FJ1432', 'quadratus femoris')]),
    ...packetRows('deep', 'hip, deepest at the front: under pectineus and the adductors, on the obturator membrane', [bp3dPair('FJ1425', 'obturator externus')]),
    ...packetRows('deep', 'back of the knee, deepest: under the heads of gastrocnemius and plantaris', [bp3dPair('FJ1430', 'popliteus')]),
    ...packetRows('intermediate', 'back of the leg, middle layer: between gastrocnemius and soleus', [bp3dPair('FJ1429', 'plantaris')])
  ])
});
const STACK_PACKET_BY_ID = new Map(BODY_STACK_PACKET.rows.map(r => [r.id, Object.freeze({ level: r.level, source: 'packet', basis: r.basis, name: r.name })]));
/**
 * R558 (builder AN): the anterior rectus sheath, opened for display. The BodyParts3D external oblique (FJ1452 /
 * FJ1452M) includes its flat tendon sheet over the front of the belly (the front layer of the rectus sheath); it lies
 * 11 to 13 mm in front of the rectus abdominis of the missing-muscles packet and takes the same stack lift, so it hid
 * the whole muscle (a pick on the front of the belly found only the external oblique; with that sheet opened, the
 * front lamina of the internal oblique's aponeurosis was found next). Like the classic atlas plate
 * with the sheath opened, the triangles of that sheet that lie IN FRONT OF rectus abdominis (over its outline, cell by
 * cell, within frontToleranceMm of its front surface or further forward) are not drawn; the fleshy external oblique
 * lateral to it, and the sheet above and below it, stay. AN check: the strip of the external oblique sheet BETWEEN the two
 * recti (the linea alba, 6 to 17 mm wide, 0 to 6 mm in front of the recti) also stays (keepMidline), as on the atlas
 * plate; cutting it left a slot down the belly through which the lumbar spine showed (and a click there picked a
 * vertebra). Display only: the licensed files are unchanged, nothing
 * moves, no vertex is added; used only when both meshes of a side are loaded. Returns { meshesById (a new Map; the
 * two sheets get a filtered index list, every other mesh is the same object), report }.
 */
export const RECTUS_SHEATH_OPENING = Object.freeze({
  rows: Object.freeze([
    // insetMm (12): the sheet is kept over the outer insetMm of the muscle's width, so its cut edge lies ON the muscle (a
    // clean flap edge, as on an atlas plate) and covers the strip along the border where the deeper laminae and the
    // muscle nearly touch (a first try cut exactly at the border and left brown flecks and slivers there); throughBack
    // as below (low on the belly the sheet curves in through the muscle and showed as flecks on it)
    // keepMidlineMm (AN check): the sheet medial to the muscle's inner border (the linea alba between the two recti) is
    // kept, reaching that far over the inner border so no hairline slit opens along it
    Object.freeze({ sheath: 'FJ1452', sheathName: 'Right external oblique', rectus: 'zm-rectus-abdominis-r', insetMm: 12, throughBack: true, keepMidlineMm: 2 }),
    Object.freeze({ sheath: 'FJ1452M', sheathName: 'Left external oblique', rectus: 'zm-rectus-abdominis-l', insetMm: 12, throughBack: true, keepMidlineMm: 2 }),
    // the same sheath's deeper laminae in the Z-Anatomy meshes: the internal oblique's aponeurosis splits around the
    // muscle (its front lamina lies 3 to 4 mm in front of it) and, low down, the transversus abdominis aponeurosis
    // passes in front of it. throughBack: every part of these sheets over the muscle that lies in front of its BACK
    // surface is left out (the front lamina and the pieces that wrap its border and cut through it under the different
    // stack lifts: brown flecks along its outer border in the first pictures); the lamina behind it stays. reachCells:
    // the cut reaches that many 5 mm cells past the muscle's outline (2: about 10 mm), under the external oblique's flap
    Object.freeze({ sheath: 'zm-internal-oblique-r', sheathName: 'Right internal oblique', rectus: 'zm-rectus-abdominis-r', throughBack: true, reachCells: 2 }),
    Object.freeze({ sheath: 'zm-internal-oblique-l', sheathName: 'Left internal oblique', rectus: 'zm-rectus-abdominis-l', throughBack: true, reachCells: 2 }),
    Object.freeze({ sheath: 'zm-transversus-abdominis-r', sheathName: 'Right transversus abdominis', rectus: 'zm-rectus-abdominis-r', throughBack: true, reachCells: 2 }),
    Object.freeze({ sheath: 'zm-transversus-abdominis-l', sheathName: 'Left transversus abdominis', rectus: 'zm-rectus-abdominis-l', throughBack: true, reachCells: 2 })
  ]),
  cellMm: 5, frontToleranceMm: 2,
  basis: 'display choice: the front layer of the rectus sheath (the obliques\' tendon sheets) is drawn opened, as in a dissection, so rectus abdominis shows (the linea alba between the two recti stays); not measured anatomy'
});
export function openRectusSheath(meshesById, rule = RECTUS_SHEATH_OPENING) {
  if (!(meshesById instanceof Map)) return { meshesById, report: null };
  const out = new Map(meshesById), report = [];
  const C = rule.cellMm, tol = rule.frontToleranceMm;
  for (const r of rule.rows) {
    const sh = meshesById.get(r.sheath), ra = meshesById.get(r.rectus);
    if (!sh || !ra || !sh.positions || !sh.indices || !ra.positions) continue;
    // the rectus front surface: per (x, z) cell the most anterior y (smallest y; +y is posterior) of its vertices
    // (integer cell keys: x and z cells offset by 4096, so any body coordinate within +-20 m packs into one number)
    const front = new Map(), back = new Map(), rp = ra.positions, key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
    for (let i = 0; i + 2 < rp.length; i += 3) {
      const k = key(Math.floor(rp[i] / C), Math.floor(rp[i + 2] / C)), y = rp[i + 1];
      if (!(front.get(k) <= y)) front.set(k, y);
      if (!(back.get(k) >= y)) back.set(k, y);
    }
    // the back surface at a point: its own cell's, else (past the outline) the shallowest around it, so a sheet behind
    // the muscle is never taken for one in front
    const backAt = (x, z) => {
      const cx = Math.floor(x / C), cz = Math.floor(z / C), own = back.get(key(cx, cz));
      if (own !== undefined) return own;
      let y = Infinity;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const v = back.get(key(cx + a, cz + b)); if (v < y) y = v; }
      return y;
    };
    const R = Number.isInteger(r.reachCells) && r.reachCells > 0 ? r.reachCells : 1;
    const frontAt = (x, z) => {
      const cx = Math.floor(x / C), cz = Math.floor(z / C), own = front.get(key(cx, cz));
      if (own !== undefined) return own;
      let y = Infinity;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const v = front.get(key(cx + a, cz + b)); if (v < y) y = v; }
      return y;
    };
    // the muscle's outer border per height band (s = its side: -1 right, +1 left): the largest s * x of its vertices
    let sx = 0;
    for (let i = 0; i + 2 < rp.length; i += 3) sx += rp[i];
    const side = sx < 0 ? -1 : 1, border = new Map(), inner = new Map();
    for (let i = 0; i + 2 < rp.length; i += 3) {
      const k = Math.floor(rp[i + 2] / C), v = side * rp[i];
      if (!(border.get(k) >= v)) border.set(k, v);
      if (!(inner.get(k) <= v)) inner.set(k, v);
    }
    const borderAt = z => { const k = Math.floor(z / C); let v = -Infinity; for (let b = -1; b <= 1; b++) { const w = border.get(k + b); if (w > v) v = w; } return v; };
    // the muscle's inner (midline) border per height band: the smallest s * x of its vertices, the most medial of the
    // neighbouring bands (so the kept midline strip never reaches over the muscle by more than keepMidlineMm)
    const innerAt = z => { const k = Math.floor(z / C); let v = Infinity; for (let b = -1; b <= 1; b++) { const w = inner.get(k + b); if (w < v) v = w; } return v; };
    const keepMid = Number.isFinite(r.keepMidlineMm) ? r.keepMidlineMm : null;
    const inset = Number.isFinite(r.insetMm) ? r.insetMm : null;
    const p = sh.positions, ix = sh.indices, keep = new Uint32Array(ix.length);
    let dropped = 0, n = 0, midline = 0;
    for (let f = 0; f + 2 < ix.length; f += 3) {
      const a = 3 * ix[f], b = 3 * ix[f + 1], c = 3 * ix[f + 2];
      const x = (p[a] + p[b] + p[c]) / 3, y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3, z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
      const fy = frontAt(x, z);
      const limit = r.throughBack ? backAt(x, z) - tol : fy + tol;
      if (Number.isFinite(fy) && y < limit && (inset === null || side * x < borderAt(z) - inset)) {
        if (keepMid === null || !(side * x < innerAt(z) + keepMid)) { dropped++; continue; }
        midline++;
      }
      keep[n++] = ix[f]; keep[n++] = ix[f + 1]; keep[n++] = ix[f + 2];
    }
    if (!dropped) continue;
    out.set(r.sheath, { ...sh, indices: keep.slice(0, n), faceCount: n / 3, displayCut: rule.basis });
    report.push({ id: r.sheath, name: r.sheathName, over: r.rectus, triangles: ix.length / 3, notDrawn: dropped, ...(keepMid === null ? {} : { midlineKept: midline }) });
  }
  return { meshesById: out, report };
}

/** R558 (builder AN): the plain sided name of a missing-muscles packet id ('right gracilis', 'left latissimus dorsi'),
 * only when the producer catalogue does not know the id (as bodyStackClass), else null. The renderer gives it to
 * ns-colors muscleToneKey as the source name, so both sides of a packet muscle share one tone (Message 15), including
 * the right levator scapulae, whose left twin (FJ1532M) is a catalogue muscle of the left shoulder girdle. */
export function bodyPacketMuscleName(id) {
  if (typeof id !== 'string' || regionalLayerQualification(id).id !== null) return null;
  const r = STACK_PACKET_BY_ID.get(id);
  return r ? r.name : null;
}
const STACK_CATALOGUE_CLASS = Object.freeze({
  outer: Object.freeze({ level: 'outer', source: 'catalogue', basis: null }),
  intermediate: Object.freeze({ level: 'intermediate', source: 'catalogue', basis: null }),
  deep: Object.freeze({ level: 'deep', source: 'catalogue', basis: null }),
  none: Object.freeze({ level: 'unclassified', source: null, basis: null })
});

/** Stack record of one mesh id: { level: 'outer' | 'intermediate' | 'deep' | 'unclassified', source: 'catalogue' |
 * 'supplement' | null, basis }. Exact ids only. The producer catalogue always wins; a supplement row is used only for
 * an id the catalogue knows under exactly the row's name and leaves unqualified. */
export function bodyStackClass(id) {
  const q = regionalLayerQualification(id), C = STACK_CATALOGUE_CLASS;
  if (q.regionalClass === 'SUPERFICIAL') return C.outer;
  if (q.regionalClass === 'INTERMEDIATE_DEEP') return BODY_STACK_RULE.intermediateRuleIds.includes(q.ruleId) ? C.intermediate : C.deep;
  const s = typeof id === 'string' ? STACK_SUPPLEMENT_BY_ID.get(id) : null;
  if (s && q.id === id && q.regionalClass === 'UNQUALIFIED' && q.sourceName === s.name) return s;
  // R558 (builder AN): a missing-muscles packet id, only when the catalogue does not know the id at all.
  const k = typeof id === 'string' && q.id === null ? STACK_PACKET_BY_ID.get(id) : null;
  return k || C.none;
}
/** Stack level of one mesh id: 'outer' | 'intermediate' | 'deep' | 'unclassified' (see bodyStackClass). */
export function bodyStackLevel(id) {
  return bodyStackClass(id).level;
}

/**
 * Round 4: outer / intermediate / deep of EVERY muscle mesh of the body, the left game arm and the face packet (226
 * ids), for display code that shades or labels muscles by layer (builder M's per-muscle look). Merged from two display
 * classifications, both from the usual textbook description of which muscle lies on which:
 *   - BODY_STACK_SUPPLEMENT above (this file; the rows the radial stack also lifts by), and
 *   - builder F's see-through classification (its BODY_MUSCLE_LAYER_SUPPLEMENT, ported here: the rows below). F used
 *     two levels (outer / deeper) and drew every intermediate muscle as deeper; where F's rows and the stack rows name
 *     the same id they agree once F's 'deeper' is read as 'intermediate or deep' (vasti, semimembranosus and serratus
 *     anterior are intermediate here, deeper in F; every other shared row is identical), so the stack rows are kept
 *     and F's rows are added only for ids the stack table does not have. F's 'deeper' becomes 'deep' here, except
 *     the lumbricals, which lie BETWEEN the long flexor tendons and the interossei ('intermediate', the same reading
 *     as the catalogue's ADDUCTOR_HAND rule).
 * Order of evidence, exact ids only: the producer catalogue (ns-regional-layers.mjs: SUPERFICIAL -> outer;
 * INTERMEDIATE_DEEP -> intermediate for BODY_STACK_RULE.intermediateRuleIds, else deep), never changed or overridden;
 * then a BODY_STACK_SUPPLEMENT row; then a row below; else 'unclassified'. A row is used only when the catalogue knows
 * the id under exactly the row's source name and leaves it UNQUALIFIED.
 * HONESTY: the rows are a display classification from general anatomy, not a measurement of this body's meshes and
 * not a reviewed source relation like the catalogue's. The rows below lift nothing (the stack lifts only by its own
 * rows). R558 (builder AN): latissimus dorsi, rectus abdominis, the internal oblique, transversus abdominis,
 * quadratus lumborum, tensor fasciae latae, gracilis, the adductors, the fibularis muscles, the erector spinae, the
 * rhomboids and pectoralis minor now come from the missing-muscles packet and take their levels from BODY_STACK_PACKET
 * (through bodyStackClass, source 'packet').
 */
const layerRows = (level, basis, pairs) => pairs.map(([id, name]) => Object.freeze({ id, name, level, basis, from: 'F' }));
const faceBoth = (slug, name) => [[`zf-${slug}-r`, `${name}.r`], [`zf-${slug}-l`, `${name}.l`]];
export const BODY_MUSCLE_LAYER_SUPPLEMENT = Object.freeze({
  kind: 'ns-body-muscle-layer-supplement',
  scope: 'Display classification from standard gross-anatomy layer descriptions (which muscle lies on which). ' +
    'Not a measurement of this body, and not part of the producer catalogue. Used after BODY_STACK_SUPPLEMENT.',
  rows: Object.freeze([
    // shoulder girdle and upper arm (the body's right arm and the separately drawn left game arm)
    ...layerRows('deep', 'rotator cuff, back of the shoulder blade: under the spinal part of the deltoid and the trapezius',
      [['FJ1500', 'Right infraspinatus muscle'], ['FJ1500M', 'Left infraspinatus muscle'], ['FJ1508', 'Right teres minor'], ['FJ1508M', 'Left teres minor']]),
    ...layerRows('deep', 'rotator cuff, front of the shoulder blade: against the ribs, under the shoulder blade',
      [['FJ1504', 'Right subscapularis'], ['FJ1504M', 'Left subscapularis']]),
    ...layerRows('deep', 'upper arm, inner side: under the short head of biceps brachii and the pectoralis major',
      [['FJ1488', 'Right coracobrachialis'], ['FJ1488M', 'Left coracobrachialis']]),
    // hand
    ...layerRows('intermediate', 'palm: under the long flexor tendons, on the interossei',
      [['FJ1510', 'Set of lumbricals of right hand'], ['FJ1510M', 'Set of lumbricals of left hand']]),
    // hip (inner pelvis)
    ...layerRows('deep', 'deep hip flexor: on the inner pelvis and the lumbar spine, behind the abdominal wall',
      [['FJ1422', 'Right iliacus'], ['FJ1422M', 'Left iliacus'], ['FJ1431', 'Right psoas major'], ['FJ1431M', 'Left psoas major']]),
    // neck
    ...layerRows('outer', 'above the hyoid, superficial: lies on the mylohyoid (the catalogue puts mylohyoid and geniohyoid deeper); its back belly runs under sternocleidomastoid',
      [['FJ1556', 'Right digastric'], ['FJ1579', 'Right digastric'], ['FJ1555', 'Left digastric'], ['FJ1560', 'Left digastric'], ['FJ1578', 'Left digastric']]),
    // face and chewing muscles (face packet)
    ...layerRows('outer', 'scalp: under the skin, on the skull',
      [...faceBoth('frontalis', 'Frontalis muscle'), ...faceBoth('occipitalis', 'Occipitalis muscle')]),
    ...layerRows('outer', 'side of the scalp: over the temporal fascia and temporalis', faceBoth('temporoparietalis', 'Temporoparietalis muscle')),
    ...layerRows('outer', 'ring of the eye, superficial: covers corrugator supercilii',
      [...faceBoth('orbicularis-oculi-orbital', 'Orbital part of orbicularis oculi'), ...faceBoth('orbicularis-oculi-palpebral', 'Palpebral part of orbicularis oculi')]),
    ...layerRows('outer', 'nose, superficial: under the skin, over the nasal bones and cartilage',
      [...faceBoth('procerus', 'Procerus muscle'), ...faceBoth('nasalis', 'Nasalis muscle')]),
    ...layerRows('outer', 'upper lip elevators, superficial: cover levator anguli oris',
      [...faceBoth('levator-labii-superioris-alaeque-nasi', 'Levator nasolabialis'), ...faceBoth('levator-labii-superioris', 'Levator labii superioris'),
        ...faceBoth('zygomaticus-minor', 'Zygomaticus minor muscle')]),
    ...layerRows('outer', 'cheek and mouth, superficial: under the skin, over buccinator and the deep part of masseter',
      [...faceBoth('zygomaticus-major', 'Zygomaticus major muscle'), ...faceBoth('risorius', 'Risorius muscle'), ...faceBoth('orbicularis-oris', 'Orbicularis oris muscle')]),
    ...layerRows('outer', 'lower lip, superficial: covers part of depressor labii inferioris', faceBoth('depressor-anguli-oris', 'Depressor anguli oris')),
    ...layerRows('outer', 'thin sheet of the neck and lower face, just under the skin', faceBoth('platysma', 'Platysma')),
    ...layerRows('outer', 'jaw, superficial: covers the deep part of masseter', faceBoth('masseter-superficial', 'Superficial part of masseter')),
    ...layerRows('deep', 'brow: under frontalis and orbicularis oculi', faceBoth('corrugator-supercilii', 'Corrugator supercilii')),
    ...layerRows('deep', 'base of the nose: under orbicularis oris', faceBoth('depressor-septi-nasi', 'Depressor septi nasi')),
    ...layerRows('deep', 'upper lip: under levator labii superioris and zygomaticus minor', faceBoth('levator-anguli-oris', 'Levator anguli oris')),
    ...layerRows('deep', 'cheek, deep: under masseter and the superficial face muscles', faceBoth('buccinator', 'Bucinator')),
    ...layerRows('deep', 'lower lip and chin: partly under depressor anguli oris',
      [...faceBoth('depressor-labii-inferioris', 'Depressor labii inferioris'), ...faceBoth('mentalis', 'Mentalis muscle')]),
    ...layerRows('deep', 'jaw: under the superficial part of masseter', faceBoth('masseter-deep', 'Deep part of masseter')),
    ...layerRows('deep', 'side of the head: under the temporal fascia and temporoparietalis; its tendon passes under the zygomatic arch',
      faceBoth('temporalis', 'Temporalis muscle')),
    ...layerRows('deep', 'inside the lower jaw (infratemporal fossa): under the ramus of the mandible and temporalis',
      [...faceBoth('medial-pterygoid', 'Medial pterygoid muscle'), ...faceBoth('lateral-pterygoid-superior', 'Superior head of lateral pterygoid muscle'),
        ...faceBoth('lateral-pterygoid-inferior', 'Inferior head of lateral pterygoid muscle')])
  ])
});
const MUSCLE_LAYER_ROW = new Map(BODY_MUSCLE_LAYER_SUPPLEMENT.rows.map(r => [r.id, Object.freeze({ level: r.level, source: 'layer-supplement', basis: r.basis, name: r.name })]));

/** Display layer record of one muscle mesh id: { level: 'outer' | 'intermediate' | 'deep' | 'unclassified', source:
 * 'catalogue' | 'supplement' (BODY_STACK_SUPPLEMENT) | 'layer-supplement' (BODY_MUSCLE_LAYER_SUPPLEMENT) | null,
 * basis }. Exact ids only; the catalogue always wins. */
export function bodyMuscleLayerRecord(id) {
  const c = bodyStackClass(id);
  if (c.level !== 'unclassified') return c;
  const q = regionalLayerQualification(id), r = typeof id === 'string' ? MUSCLE_LAYER_ROW.get(id) : null;
  return r && q.id === id && q.regionalClass === 'UNQUALIFIED' && q.sourceName === r.name ? r : c;
}
/** Display layer of one muscle mesh id: 'outer' | 'intermediate' | 'deep' | 'unclassified' (see bodyMuscleLayerRecord). */
export function bodyMuscleLayer(id) {
  return bodyMuscleLayerRecord(id).level;
}

const sstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** "Is this point within tauMm of a bone surface?" over bone vertices plus samples of every long triangle (so the
 * test is against the surface, not the vertex cloud). Hash grid of tauMm cells; built once per lift. */
function stackBoneIndex(boneMeshes, tauMm, sampleMm) {
  const inv = 1 / tauMm, t2 = tauMm * tauMm, s2 = sampleMm * sampleMm, cells = new Map(), coarse = new Set();
  const key = (i, j, k) => ((i & 1023) << 20) | ((j & 1023) << 10) | (k & 1023);
  let points = 0;
  const put = (x, y, z) => {
    const i = Math.floor(x * inv), j = Math.floor(y * inv), k = Math.floor(z * inv), h = key(i, j, k);
    let c = cells.get(h);
    if (!c) {
      cells.set(h, (c = []));
      // One coarse lookup rejects a query with no occupied neighbour cell.
      for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) for (let d = -1; d <= 1; d += 2) coarse.add(key((i + a) >> 2, (j + b) >> 2, (k + d) >> 2));
    }
    c.push(x, y, z); points++;
  };
  for (const mesh of boneMeshes) {
    const p = positionsOf(mesh);
    if (!p) continue;
    for (let i = 0; i < p.length; i += 3) put(p[i], p[i + 1], p[i + 2]);
    const ix = mesh.indices;
    if (!ix) continue;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = 3 * ix[t], b = 3 * ix[t + 1], c = 3 * ix[t + 2];
      const ax = p[a], ay = p[a + 1], az = p[a + 2], bx = p[b], by = p[b + 1], bz = p[b + 2], cx = p[c], cy = p[c + 1], cz = p[c + 2];
      const m2 = Math.max((bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2, (ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2);
      if (!(m2 > s2)) continue;
      const n = Math.min(48, Math.ceil(Math.sqrt(m2) / sampleMm));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        if ((i === 0 || i === n) && (j === 0 || j === n) || (i === 0 && j === n)) continue;   // the corners are vertices
        const u = i / n, v = j / n, w = 1 - u - v;
        put(w * ax + u * bx + v * cx, w * ay + u * by + v * cy, w * az + u * bz + v * cz);
      }
    }
  }
  const near = (x, y, z) => {
    const i = Math.floor(x * inv), j = Math.floor(y * inv), k = Math.floor(z * inv);
    if (!coarse.has(key(i >> 2, j >> 2, k >> 2))) return false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      const c = cells.get(key(i + a, j + b, k + d));
      if (!c) continue;
      for (let q = 0; q < c.length; q += 3) { const dx = c[q] - x, dy = c[q + 1] - y, dz = c[q + 2] - z; if (dx * dx + dy * dy + dz * dz <= t2) return true; }
    }
    return false;
  };
  return { near, points };
}

/** Distance to the nearest of a fixed point set (flat xyz): a balanced k-d tree, built once per mesh. */
function stackNearestDistance(pts) {
  const n = pts.length / 3, idx = new Int32Array(n), axis = new Uint8Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const build = (lo, hi) => {
    if (hi - lo < 1) return;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let q = lo; q < hi; q++) for (let k = 0; k < 3; k++) { const v = pts[3 * idx[q] + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    const ex = mx[0] - mn[0], ey = mx[1] - mn[1], ez = mx[2] - mn[2], ax = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    if (hi - lo > 1) idx.subarray(lo, hi).sort((a, b) => pts[3 * a + ax] - pts[3 * b + ax]);
    const mid = (lo + hi) >> 1;
    axis[mid] = ax;
    build(lo, mid); build(mid + 1, hi);
  };
  build(0, n);
  let best = 0, X = 0, Y = 0, Z = 0;
  const visit = (lo, hi) => {
    if (hi <= lo) return;
    const mid = (lo + hi) >> 1, q = 3 * idx[mid], ax = axis[mid];
    const dx = X - pts[q], dy = Y - pts[q + 1], dz = Z - pts[q + 2], d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
    const delta = ax === 0 ? dx : ax === 1 ? dy : dz;
    if (delta < 0) { visit(lo, mid); if (delta * delta < best) visit(mid + 1, hi); }
    else { visit(mid + 1, hi); if (delta * delta < best) visit(lo, mid); }
  };
  return (x, y, z, capMm) => { best = capMm * capMm; X = x; Y = y; Z = z; visit(0, n); return Math.sqrt(best); };
}

/** Centroid and principal (long) axis of a vertex cloud. */
function stackPrincipalAxis(p) {
  const n = p.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
  cx /= n; cy /= n; cz /= n;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i] - cx, y = p[i + 1] - cy, z = p[i + 2] - cz;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  let v = xx >= yy && xx >= zz ? [xx, xy, xz] : yy >= zz ? [xy, yy, yz] : [xz, yz, zz];
  for (let it = 0; it < 64; it++) {
    const w = [xx * v[0] + xy * v[1] + xz * v[2], xy * v[0] + yy * v[1] + yz * v[2], xz * v[0] + yz * v[1] + zz * v[2]];
    const l = Math.hypot(w[0], w[1], w[2]);
    if (!(l > 0)) break;
    v = [w[0] / l, w[1] / l, w[2] / l];
  }
  const l = Math.hypot(v[0], v[1], v[2]);
  return { c: [cx, cy, cz], e: l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 1] };
}

/**
 * The attachment ends of one muscle mesh and each vertex's distance to them. Everything is a pure function of the
 * vertex position, so the repeated vertices of a seam get the same answer and the surface cannot tear.
 * @param midline null | { point, normal }: the midline plane of a trunk muscle (an attachment wherever it is reached)
 */
function stackMeshAnchors(p, bone, midline, capMm, hold = null) {
  const A = BODY_STACK_RULE.anchor, n = p.length / 3;
  const { c, e } = stackPrincipalAxis(p);
  const s = new Float32Array(n);
  let smin = Infinity, smax = -Infinity;
  for (let i = 0, v = 0; i < p.length; i += 3, v++) {
    const t = (p[i] - c[0]) * e[0] + (p[i + 1] - c[1]) * e[1] + (p[i + 2] - c[2]) * e[2];
    s[v] = t; if (t < smin) smin = t; if (t > smax) smax = t;
  }
  const L = Math.max(1e-6, smax - smin);
  if (typeof capMm === 'function') capMm = capMm(L);   // round 4: the distance search reaches only as far as needed
  // A held end: which end of the principal axis is nearer the far end of the limb.
  let heldLo = -1, heldHi = 2;
  if (hold) {
    const far = t => Math.hypot(c[0] + e[0] * t - hold.toward[0], c[1] + e[1] * t - hold.toward[1], c[2] + e[2] * t - hold.toward[2]);
    if (far(smin) <= far(smax)) heldLo = hold.lengthShare; else heldHi = 1 - hold.lengthShare;
  }
  const BINS = Math.round(1 / A.extendStep), bin = new Uint8Array(n), tot = new Int32Array(BINS), on = new Int32Array(BINS), near = new Uint8Array(n);
  for (let i = 0, v = 0; i < p.length; i += 3, v++) {
    const t = (s[v] - smin) / L, b = Math.min(BINS - 1, Math.floor(t * BINS));
    s[v] = t; bin[v] = b; tot[b]++;
    const x = p[i], y = p[i + 1], z = p[i + 2];
    let f = midline && Math.abs((x - midline.point[0]) * midline.normal[0] + (y - midline.point[1]) * midline.normal[1] + (z - midline.point[2]) * midline.normal[2]) <= A.midlineMm ? 2 : 0;
    if (!f && bone.near(x, y, z)) f = 1;
    if (f) { near[v] = f; on[b]++; }
  }
  const w0 = Math.round(A.endWindow * BINS), lim = Math.round(A.extendLimit * BINS), need = Math.max(A.cleanMin, A.cleanShare * n);
  let n0 = 0, n1 = 0;
  for (let b = 0; b < w0; b++) n0 += on[b];
  for (let b = BINS - w0; b < BINS; b++) n1 += on[b];
  const clean = [n0 >= need, n1 >= need];
  let lo = w0, hi = BINS - w0;
  // An end reaches further in only as an UNBROKEN run of bone contact: the innermost slice of its own window must be
  // on bone too. A belly that lies on a bone again further in, past a free stretch, is resting there, not attached.
  const solid = b => tot[b] > 0 && on[b] >= A.extendShare * tot[b];
  if (clean[0] && solid(lo - 1)) while (lo < lim && solid(lo)) lo++;
  if (clean[1] && solid(hi)) while (hi > BINS - lim && solid(hi - 1)) hi--;
  const anchor = new Uint8Array(n);
  let count = 0;
  for (let v = 0; v < n; v++) {
    let a = near[v] === 2 || (near[v] === 1 && (bin[v] < lo || bin[v] >= hi)) || s[v] <= heldLo || s[v] >= heldHi;
    if (!a && ((!clean[0] && s[v] <= A.capShare) || (!clean[1] && s[v] >= 1 - A.capShare))) a = true;
    if (a) { anchor[v] = 1; count++; }
  }
  const pts = new Float32Array(3 * count);
  for (let v = 0, k = 0; v < n; v++) if (anchor[v]) { pts[k++] = p[3 * v]; pts[k++] = p[3 * v + 1]; pts[k++] = p[3 * v + 2]; }
  const dist = stackNearestDistance(pts), d = new Float32Array(n);
  for (let i = 0, v = 0; i < p.length; i += 3, v++) d[v] = anchor[v] ? 0 : dist(p[i], p[i + 1], p[i + 2], capMm);
  return { n, lengthMm: L, anchor, d, anchored: count, clean, reach: [lo / BINS, 1 - hi / BINS], heldShare: hold ? hold.lengthShare : 0, capMm };
}

/** R558 (Message 30): rig segments that carry finger, thumb and toe PHALANGES (body rig and left-arm rig names; the
 * metacarpals and metatarsals ride the hand / thumb_mc / foot segments and are not digits). */
export const STACK_DIGIT_SEGMENT = /^(?:[lr]_)?(?:thumb_pp|thumb_dp|index_|middle_|ring_|little_|toes$|hallux$)/;
/** The lift factor on the digits (BODY_STACK_RULE.digits) as a function (x, y, z) -> 0..1, or null without digit
 * bones: sstep((d - nearMm) / rampMm), d = the distance to the nearest sample of the given phalanx meshes (their
 * vertices and points on their triangles every sampleMm). */
function stackDigitFade(digitBones, o = BODY_STACK_RULE.digits) {
  if (!o || !digitBones) return null;
  const pts = [];
  const s2 = o.sampleMm * o.sampleMm;
  for (const mesh of digitBones) {
    const p = positionsOf(mesh);
    if (!p) continue;
    for (let i = 0; i < p.length; i++) pts.push(p[i]);
    const ix = mesh.indices;
    if (!ix) continue;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = 3 * ix[t], b = 3 * ix[t + 1], c = 3 * ix[t + 2];
      const m2 = Math.max((p[b] - p[a]) ** 2 + (p[b + 1] - p[a + 1]) ** 2 + (p[b + 2] - p[a + 2]) ** 2, (p[c] - p[b]) ** 2 + (p[c + 1] - p[b + 1]) ** 2 + (p[c + 2] - p[b + 2]) ** 2,
        (p[a] - p[c]) ** 2 + (p[a + 1] - p[c + 1]) ** 2 + (p[a + 2] - p[c + 2]) ** 2);
      if (!(m2 > s2)) continue;
      const n = Math.min(24, Math.ceil(Math.sqrt(m2) / o.sampleMm));
      for (let i = 1; i < n; i++) for (let j = 1; j < n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        pts.push(w * p[a] + u * p[b] + v * p[c], w * p[a + 1] + u * p[b + 1] + v * p[c + 1], w * p[a + 2] + u * p[b + 2] + v * p[c + 2]);
      }
    }
  }
  if (pts.length < 3) return null;
  const dist = stackNearestDistance(Float32Array.from(pts)), cap = o.nearMm + o.rampMm;
  return (x, y, z) => sstep((dist(x, y, z, cap) - o.nearMm) / o.rampMm);
}

/** An axis chain: straight segments between rig points, one body region (gap) each. null when a point is missing. */
function stackChain(key, pts, regions, extra = null) {
  if (!Array.isArray(pts) || pts.length < 2 || pts.some(q => !q || !q.every(Number.isFinite))) return null;
  const segs = [];
  let t0 = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], ab = sub(pts[k + 1], a), l = len(ab), gap = BODY_STACK_RULE.gapMm[regions[k]];
    if (!(l > 1e-6) || !Number.isFinite(gap)) return null;
    segs.push({ a: [a[0], a[1], a[2]], u: scl(ab, 1 / l), l, t0, region: regions[k], gap });
    t0 += l;
  }
  return { key, segs, ...(extra || {}) };
}
/** Nearest chain segment to a point and the arclength of the nearest point on it: [segment index, arclength]. */
function stackChainNearest(chain, x, y, z) {
  let bk = 0, bt = 0, bd = Infinity;
  for (let k = 0; k < chain.segs.length; k++) {
    const g = chain.segs[k], dx = x - g.a[0], dy = y - g.a[1], dz = z - g.a[2];
    const t = Math.max(0, Math.min(g.l, dx * g.u[0] + dy * g.u[1] + dz * g.u[2]));
    const ex = dx - g.u[0] * t, ey = dy - g.u[1] * t, ez = dz - g.u[2] * t, dd = ex * ex + ey * ey + ez * ez;
    if (dd < bd) { bd = dd; bk = k; bt = g.t0 + t; }
  }
  return [bk, bt];
}
/** A per-region value (table: region -> mm) at an arclength: each segment keeps its own value, and across a joint
 * the value changes linearly over BODY_STACK_RULE.regionBlendMm on each side (at most half of either segment). */
function stackChainValue(chain, t, table) {
  const S = chain.segs, at = k => table[S[k].region];
  let k = 0;
  while (k + 1 < S.length && t >= S[k + 1].t0) k++;
  const v = at(k);
  const zone = k => Math.min(BODY_STACK_RULE.regionBlendMm, S[k - 1].l / 2, S[k].l / 2);
  if (k > 0) { const j = S[k].t0, z = zone(k); if (t < j + z) { const a = at(k - 1); return a + (v - a) * (t - (j - z)) / (2 * z); } }
  if (k + 1 < S.length) { const j = S[k + 1].t0, z = zone(k + 1); if (t > j - z) { const b = at(k + 1); return v + (b - v) * (t - (j - z)) / (2 * z); } }
  return v;
}
/** The gap at an arclength (BODY_STACK_RULE.gapMm by region, see stackChainValue), with the dip at each joint inside
 * a limb chain (BODY_STACK_RULE.jointDip; the trunk and neck have none). */
function stackChainGap(chain, t) {
  const g = stackChainValue(chain, t, BODY_STACK_RULE.gapMm), D = BODY_STACK_RULE.jointDip;
  if (!chain.limb) return g;
  let f = 1;
  for (let k = 1; k < chain.segs.length; k++) f = Math.min(f, 1 - D.share * (1 - sstep(Math.abs(t - chain.segs[k].t0) / D.halfWidthMm)));
  return g * f;
}

/**
 * The anchored lift of a set of muscle meshes that share one frame (millimetres): the body in its source pose, or the
 * separately rigged left arm at rest. Only ids at the outer or intermediate stack level are lifted.
 * @param muscles iterable of { id, positions } (not modified)
 * @param bones iterable of { positions, indices }: every bone surface there is in that frame (or a stackBoneIndex)
 * @param chainFor (ids of one named muscle, its vertex counts) => stackChain() result | null
 * @returns { lifted: Map(id -> Float32Array, full-lift positions), byId, units, unavailable, ends, boneSamples,
 *   anchorDist: Map(id -> Float32Array, each vertex's distance to the anchored ends, 0 on them) }
 */
function anchoredStackLift(muscles, bones, chainFor, digitBones = null) {
  const R = BODY_STACK_RULE, capMm = Math.max(R.ramp.maxMm, R.ramp.minGaps * Math.max(...Object.values(R.gapMm)));
  const digitAt = stackDigitFade(digitBones); // R558 (Message 30): BODY_STACK_RULE.digits
  const bone = bones && typeof bones.near === 'function' ? bones : stackBoneIndex(bones, R.anchor.boneMm, R.anchor.boneSampleMm);
  const groups = new Map(), byId = Object.create(null), units = Object.create(null), unavailable = [], lifted = new Map(), anchorDist = new Map();
  for (const m of muscles) {
    const level = bodyStackLevel(m.id), p = positionsOf(m);
    if (level !== 'outer' && level !== 'intermediate') continue;
    if (!p) { unavailable.push(m.id); byId[m.id] = Object.freeze({ level, status: 'unavailable-geometry' }); continue; }
    const unit = `${muscleLayerKey(regionalLayerQualification(m.id).sourceName).unit} [${level}]`;
    let g = groups.get(unit);
    if (!g) groups.set(unit, (g = { level, members: [] }));
    g.members.push({ id: m.id, p });
  }
  const ends = { two: [], one: [], none: [] };
  for (const [unit, g] of groups) {
    const share = R.share[g.level], ids = g.members.map(m => m.id);
    // Round 4: an exact-ID unit rule (BODY_STACK_RULE.unitRules) of any member applies to the whole named muscle.
    const rule = g.members.map(m => stackRuleRow(R.unitRules, m.id)).find(Boolean) || null;
    // Round 4: how far the anchor distances are searched (the search is the slow part of the build): as far as the
    // longest ramp this muscle can get, at least ramp.searchMm. A muscle with its own distShare may reach maxMm.
    const capFor = L => Math.min(capMm, Math.max(R.ramp.searchMm, R.ramp.minGaps * Math.max(...Object.values(R.gapMm)), R.ramp.lengthShare * L,
      rule && Number.isFinite(rule.distShare) ? rule.distShare * R.ramp.maxMm : 0));
    const gapScale = rule && Number.isFinite(rule.gapScale) ? rule.gapScale : 1;
    const gapAt = t => share * gapScale * (rule && rule.region ? R.gapMm[rule.region] : stackChainGap(chain, t));
    const chain = chainFor(ids, g.members.map(m => m.p.length / 3));
    if (!chain) { for (const m of g.members) { unavailable.push(m.id); byId[m.id] = Object.freeze({ level: g.level, status: 'unavailable-axis' }); } continue; }
    const last = chain.segs[chain.segs.length - 1], toward = [last.a[0] + last.u[0] * last.l, last.a[1] + last.u[1] * last.l, last.a[2] + last.u[2] * last.l];
    for (const m of g.members) {
      const h = stackRuleRow(R.heldEnds, m.id);
      m.a = stackMeshAnchors(m.p, bone, chain.midline || null, capFor, h ? { lengthShare: h.lengthShare, toward } : null);
    }
    // The belly: the part away from the ends. Its centroid picks the axis segment and the one radial direction.
    let sw = 0, bx = 0, by = 0, bz = 0, nAll = 0, px = 0, py = 0, pz = 0;
    for (const m of g.members) for (let i = 0, v = 0; i < m.p.length; i += 3, v++) {
      const w = sstep(m.a.d[v] / R.ramp.bellyMm);
      sw += w; bx += w * m.p[i]; by += w * m.p[i + 1]; bz += w * m.p[i + 2];
      nAll++; px += m.p[i]; py += m.p[i + 1]; pz += m.p[i + 2];
    }
    const belly = sw > 1e-3 * nAll ? [bx / sw, by / sw, bz / sw] : [px / nAll, py / nAll, pz / nAll];
    const [k, tc] = stackChainNearest(chain, belly[0], belly[1], belly[2]), seg = chain.segs[k], A = seg.a, u = seg.u;
    const radial = (x, y, z) => { const dx = x - A[0], dy = y - A[1], dz = z - A[2], t = dx * u[0] + dy * u[1] + dz * u[2]; return [dx - u[0] * t, dy - u[1] * t, dz - u[2] * t]; };
    const rc = radial(belly[0], belly[1], belly[2]), rl = len(rc);
    if (!(rl >= R.direction.minRadialMm)) { for (const m of g.members) { unavailable.push(m.id); byId[m.id] = Object.freeze({ level: g.level, status: 'unavailable-on-axis' }); } continue; }
    const dirC = scl(rc, 1 / rl);
    // How far the muscle wraps round its axis: 2 sqrt(3) x the belly-weighted RMS angle (the full span of an even arc).
    let sa = 0, swa = 0;
    for (const m of g.members) for (let i = 0, v = 0; i < m.p.length; i += 3, v++) {
      const w = sstep(m.a.d[v] / R.ramp.bellyMm);
      if (!(w > 0)) continue;
      const r = radial(m.p[i], m.p[i + 1], m.p[i + 2]), l = len(r);
      if (!(l > 1e-3)) continue;
      const ang = Math.acos(clamp(dot(r, dirC) / l, -1, 1));
      sa += w * ang * ang; swa += w;
    }
    const wrapDeg = swa > 0 ? 2 * Math.sqrt(3) * Math.sqrt(sa / swa) * 180 / Math.PI : 0;
    const blend = sstep((wrapDeg - R.direction.constantBelowDeg) / (R.direction.radialAboveDeg - R.direction.constantBelowDeg));
    const gapC = gapAt(tc);
    units[unit] = { level: g.level, ids, axis: chain.key, region: seg.region, gapMm: Math.round(gapC * 10) / 10,
      radialMm: Math.round(rl * 10) / 10, dir: round3(dirC), wrapDeg: Math.round(wrapDeg), radialBlend: Math.round(blend * 100) / 100 };
    // A leg never lifts toward the other leg: the inward direction at right angles to this segment's axis.
    let inward = null;
    if (chain.medial) { const mi = sub(chain.medial, scl(u, dot(chain.medial, u))), ml = len(mi); if (ml > 1e-6) inward = scl(mi, 1 / ml); }
    // The lift direction with its inward part removed and the rest shortened by the same lean: c = 0 keeps it all,
    // c >= marginShare (about 40 deg toward the other leg) keeps nothing.
    const legKeep = (dx, dy, dz) => {
      const c = dx * inward[0] + dy * inward[1] + dz * inward[2];
      if (!(c > 0)) return [dx, dy, dz];
      const k = Math.max(0, 1 - c / R.legInward.marginShare);
      return [(dx - c * inward[0]) * k, (dy - c * inward[1]) * k, (dz - c * inward[2]) * k];
    };
    for (const m of g.members) {
      const p = m.p, a = m.a, n = a.n, gap = new Float32Array(n);
      let gmax = 0;
      for (let i = 0, v = 0; i < p.length; i += 3, v++) { const g1 = gapAt(stackChainNearest(chain, p[i], p[i + 1], p[i + 2])[1]); gap[v] = g1; if (g1 > gmax) gmax = g1; }
      // Round 4: the ramp also scales with how far the muscle reaches from its anchored ends (95th percentile).
      // (95th percentile from a 0.5 mm histogram of the distances, which stop at the search cap)
      const hb = new Int32Array(Math.ceil(2 * a.capMm) + 2);
      let hn = 0;
      for (let v = 0; v < n; v++) if (!a.anchor[v]) { hb[Math.min(hb.length - 1, Math.floor(2 * a.d[v]))]++; hn++; }
      let d95 = 0;
      for (let b = 0, c = 0; b < hb.length && hn; b++) { c += hb[b]; if (c >= 0.95 * hn) { d95 = (b + 1) / 2; break; } }
      d95 = Math.min(d95, a.capMm);
      const distShare = rule && Number.isFinite(rule.distShare) ? rule.distShare : R.ramp.distShare;
      const ramp = Math.max(R.ramp.minGaps * gmax, Math.min(R.ramp.maxMm, Math.max(R.ramp.lengthShare * a.lengthMm, distShare * d95)));
      const out = new Float32Array(p.length);
      let maxLift = 0, full = 0;
      for (let i = 0, v = 0; i < p.length; i += 3, v++) {
        const x = p[i], y = p[i + 1], z = p[i + 2], w = a.anchor[v] ? 0 : sstep(a.d[v] / ramp);
        if (!(w > 0)) { out[i] = x; out[i + 1] = y; out[i + 2] = z; continue; }
        let dx = dirC[0], dy = dirC[1], dz = dirC[2];
        if (blend > 0) {
          const r = radial(x, y, z), l = len(r);
          if (l > 1e-3) {
            const mx = dx + (r[0] / l - dx) * blend, my = dy + (r[1] / l - dy) * blend, mz = dz + (r[2] / l - dz) * blend, ml = Math.hypot(mx, my, mz);
            if (ml > 1e-3) { dx = mx / ml; dy = my / ml; dz = mz / ml; } else { dx = r[0] / l; dy = r[1] / l; dz = r[2] / l; }
          }
        }
        if (inward) { const q = legKeep(dx, dy, dz); dx = q[0]; dy = q[1]; dz = q[2]; }
        const lift = gap[v] * w * (digitAt ? digitAt(x, y, z) : 1); // R558 (Message 30): none on a finger or toe
        out[i] = x + lift * dx; out[i + 1] = y + lift * dy; out[i + 2] = z + lift * dz;
        const moved = inward ? lift * Math.hypot(dx, dy, dz) : lift;   // a leg's inward part may have shortened it
        if (moved > maxLift) maxLift = moved;
        if (w >= 0.99) full++;
      }
      lifted.set(m.id, out);
      anchorDist.set(m.id, a.d);
      const cleanEnds = (a.clean[0] ? 1 : 0) + (a.clean[1] ? 1 : 0);
      ends[cleanEnds === 2 ? 'two' : cleanEnds === 1 ? 'one' : 'none'].push(m.id);
      byId[m.id] = Object.freeze({ level: g.level, status: 'anchored-lift', unit, vertices: n, anchored: a.anchored, cleanEnds,
        capFallback: Object.freeze([!a.clean[0], !a.clean[1]]), endReach: Object.freeze(a.reach.map(v => Math.round(v * 100) / 100)),
        unitRule: rule ? Object.freeze({ gapScale, distShare, region: rule.region || null }) : null,
        lengthMm: Math.round(a.lengthMm), rampMm: Math.round(ramp * 10) / 10, maxLiftMm: Math.round(maxLift * 10) / 10,
        fullLiftShare: Math.round(100 * full / n) / 100, heldEndShare: a.heldShare });
    }
  }
  return { lifted, byId, units, unavailable, ends, boneSamples: bone.points, anchorDist };
}

/**
 * The display FILL of one muscle mesh (BODY_STACK_RULE.fill; the user: "The muscles should be full, filled-out and
 * plumpy."): an outward offset per vertex along the smoothed surface normal,
 *   offset(v) = weight(v) x min(mm(v), radiusShare x r(v)) x normal(v),
 * where r(v) = 1 / (2 |H(v)|) is the local radius of the surface from its mean curvature H (a tube of radius r has
 * H = 1/(2r), a flat sheet H = 0). So a thin tendon or the rounded rim of a sheet swells by a fraction of its own
 * thickness while a belly or a broad sheet gets the full mm(v), and a concave place is limited the same way, so the
 * surface does not fold over itself. Repeated seam vertices are welded by position (one offset each, so the surface
 * cannot tear), normals and radius are smoothed over the surface, and a mesh wound inside out is detected by its
 * signed volume. A vertex with weight 0 (an attachment end) does not move at all.
 * @param p positions in the frame the mesh is drawn in; ix its triangle indices
 * @param mm Float32Array per vertex: the region's largest fill in mm
 * @param weight Float32Array per vertex, 0..1
 * @param inward null | [x, y, z] unit: on a leg, the direction toward the other leg in the drawn frame; a surface
 *   facing it is filled less (none once it leans legInward.marginShare toward it), so the legs do not crowd
 * @returns { off: Float32Array (same layout as p), maxMm }
 */
function stackFillOffsets(p, ix, mm, weight, inward = null, cap = null) {
  const F = BODY_STACK_RULE.fill, n = p.length / 3, wid = new Int32Array(n), first = new Int32Array(n);
  // Weld by quantised position: an open-addressing hash over integer cells (exact cell match, so no false merges).
  const inv = 1 / F.weldMm, Q = new Int32Array(3 * n);
  let size = 1;
  while (size < 2 * n) size <<= 1;
  const slot = new Int32Array(size).fill(-1), mask = size - 1;
  let m = 0;
  for (let v = 0; v < n; v++) {
    const xi = Math.round(p[3 * v] * inv), yi = Math.round(p[3 * v + 1] * inv), zi = Math.round(p[3 * v + 2] * inv);
    let h = (Math.imul(xi, 73856093) ^ Math.imul(yi, 19349663) ^ Math.imul(zi, 83492791)) & mask, w = -1;
    while (slot[h] >= 0) {
      const u = slot[h];
      if (Q[3 * u] === xi && Q[3 * u + 1] === yi && Q[3 * u + 2] === zi) { w = u; break; }
      h = (h + 1) & mask;
    }
    if (w < 0) { w = m++; slot[h] = w; Q[3 * w] = xi; Q[3 * w + 1] = yi; Q[3 * w + 2] = zi; first[w] = v; }
    wid[v] = w;
  }
  const P = new Float64Array(3 * m), N = new Float64Array(3 * m), Acc = new Float64Array(3 * m);
  let cx = 0, cy = 0, cz = 0;
  for (let w = 0; w < m; w++) {
    const v = 3 * first[w];
    P[3 * w] = p[v]; P[3 * w + 1] = p[v + 1]; P[3 * w + 2] = p[v + 2];
    cx += p[v]; cy += p[v + 1]; cz += p[v + 2];
  }
  cx /= Math.max(1, m); cy /= Math.max(1, m); cz /= Math.max(1, m);
  const T = new Int32Array(ix.length);
  let nt = 0, vol = 0;
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const a = wid[ix[t]], b = wid[ix[t + 1]], c = wid[ix[t + 2]];
    if (a === b || b === c || a === c) continue;
    T[nt++] = a; T[nt++] = b; T[nt++] = c;
    const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2];
    const ux = P[3 * b] - ax, uy = P[3 * b + 1] - ay, uz = P[3 * b + 2] - az, vx = P[3 * c] - ax, vy = P[3 * c + 1] - ay, vz = P[3 * c + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    N[3 * a] += nx; N[3 * a + 1] += ny; N[3 * a + 2] += nz;
    N[3 * b] += nx; N[3 * b + 1] += ny; N[3 * b + 2] += nz;
    N[3 * c] += nx; N[3 * c + 1] += ny; N[3 * c + 2] += nz;
    vol += (ax - cx) * nx + (ay - cy) * ny + (az - cz) * nz;
  }
  const sign = vol < 0 ? -1 : 1;
  const unit = X => { for (let w = 0; w < m; w++) { const l = Math.hypot(X[3 * w], X[3 * w + 1], X[3 * w + 2]); if (l > 1e-12) { X[3 * w] /= l; X[3 * w + 1] /= l; X[3 * w + 2] /= l; } } };
  unit(N);
  for (let pass = 0; pass < F.smoothPasses; pass++) {
    Acc.fill(0);
    for (let t = 0; t < nt; t += 3) {
      const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
      for (let k = 0; k < 3; k++) { Acc[a + k] += N[b + k] + N[c + k]; Acc[b + k] += N[a + k] + N[c + k]; Acc[c + k] += N[a + k] + N[b + k]; }
    }
    for (let i = 0; i < 3 * m; i++) N[i] = N[i] + 0.5 * Acc[i];
    unit(N);
  }
  // Mean curvature from the smoothed normals along each edge: (n_j - n_i).(x_j - x_i) / |x_j - x_i|^2.
  const K = new Float64Array(m), C = new Float64Array(m);
  for (let t = 0; t < nt; t += 3) {
    for (let e = 0; e < 3; e++) {
      const i = 3 * T[t + e], j = 3 * T[t + (e + 1) % 3];
      const ex = P[j] - P[i], ey = P[j + 1] - P[i + 1], ez = P[j + 2] - P[i + 2], l2 = ex * ex + ey * ey + ez * ez;
      if (!(l2 > 1e-12)) continue;
      const c = ((N[j] - N[i]) * ex + (N[j + 1] - N[i + 1]) * ey + (N[j + 2] - N[i + 2]) * ez) / l2;
      K[i / 3] += c; K[j / 3] += c; C[i / 3]++; C[j / 3]++;
    }
  }
  const base = new Float64Array(m), tmp = new Float64Array(m), cnt = new Float64Array(m);
  for (let w = 0; w < m; w++) {
    const kap = C[w] > 0 ? Math.abs(K[w] / C[w]) : 0;
    base[w] = Math.min(mm[first[w]], F.radiusShare / (2 * kap + 1e-9));
  }
  for (let pass = 0; pass < 2; pass++) {   // smooth the amount over the surface (a noisy curvature gives no bumps)
    tmp.fill(0); cnt.fill(0);
    for (let t = 0; t < nt; t += 3) {
      const a = T[t], b = T[t + 1], c = T[t + 2];
      tmp[a] += base[b] + base[c]; tmp[b] += base[a] + base[c]; tmp[c] += base[a] + base[b];
      cnt[a] += 2; cnt[b] += 2; cnt[c] += 2;
    }
    for (let w = 0; w < m; w++) base[w] = (base[w] + tmp[w]) / (1 + cnt[w]);
  }
  const off = new Float32Array(p.length);
  let maxMm = 0;
  for (let v = 0; v < n; v++) {
    const w = wid[v];
    // Round 4: a cover cap below the fill lowers it, and a negative cap tucks the surface in (at most by the fill it
    // would have had, so a thin strand is never pushed through itself); both scale with the weight like the fill.
    let s = weight[first[w]] * (cap ? Math.max(-base[w], Math.min(base[w], cap[first[w]])) : base[w]);
    if (inward && s > 0) {
      const c = sign * (N[3 * w] * inward[0] + N[3 * w + 1] * inward[1] + N[3 * w + 2] * inward[2]);
      if (c > 0) s *= Math.max(0, 1 - c / BODY_STACK_RULE.legInward.marginShare);
    }
    if (!s) continue;
    off[3 * v] = sign * s * N[3 * w]; off[3 * v + 1] = sign * s * N[3 * w + 1]; off[3 * v + 2] = sign * s * N[3 * w + 2];
    if (s > maxMm) maxMm = s;
  }
  return { off, maxMm };
}

/** The fill of one muscle: region amounts from its axis chain (in the source frame src, where the chain is), weights
 * from its anchored ends (anchorD: the lift's distances, 0 on the ends) or, for a muscle the stack does not lift,
 * from its bone contact (0 within anchor.boneMm of a bone surface), and the offsets on the drawn positions. */
function stackFillMesh(src, drawn, ix, chain, head, anchorD, bone, inward = null, { region = null, cap = null } = {}) {
  const F = BODY_STACK_RULE.fill, n = src.length / 3, mm = new Float32Array(n), weight = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = src[3 * v], y = src[3 * v + 1], z = src[3 * v + 2];
    mm[v] = head ? F.mm.head : region ? F.mm[region] : chain ? stackChainValue(chain, stackChainNearest(chain, x, y, z)[1], F.mm) : F.mm.trunk;
  }
  if (anchorD && anchorD.length === n) for (let v = 0; v < n; v++) weight[v] = sstep(anchorD[v] / F.endRampMm);
  else {
    const on = new Uint8Array(n);
    let c = 0;
    for (let v = 0; v < n; v++) if (bone.near(src[3 * v], src[3 * v + 1], src[3 * v + 2])) { on[v] = 1; c++; }
    if (!c) weight.fill(1);
    else {
      const pts = new Float32Array(3 * c);
      for (let v = 0, k = 0; v < n; v++) if (on[v]) { pts[k++] = src[3 * v]; pts[k++] = src[3 * v + 1]; pts[k++] = src[3 * v + 2]; }
      const dist = stackNearestDistance(pts);
      for (let v = 0; v < n; v++) weight[v] = on[v] ? 0 : sstep(dist(src[3 * v], src[3 * v + 1], src[3 * v + 2], F.endRampMm) / F.endRampMm);
    }
  }
  return stackFillOffsets(drawn, ix, mm, weight, inward, cap);
}

/**
 * Round 4: the cover caps of the display fill (BODY_STACK_RULE.fill.coverMm / coverMarginMm). A muscle vertex within
 * coverMm (source frame) of a vertex of a muscle at a HIGHER stack level (outer over intermediate over the rest) may
 * be filled by at most (that muscle's lift there - this vertex's own lift - coverMarginMm); a negative cap tucks it in
 * (stackFillOffsets). So near the anchored ends of an outer muscle, where its lift is small, the muscle under it is not
 * filled out through it.
 * @param list [{ id, rank (2 outer, 1 intermediate, 0 any other muscle), src (source positions), lift (Float32Array of
 *   each vertex's lift in mm, or null for 0) }]
 * @returns Map(id -> Float32Array cap per vertex, Infinity where nothing covers it): only muscles with a capped vertex
 */
function stackCoverCaps(list) {
  const F = BODY_STACK_RULE.fill, R = F.coverMm, inv = 1 / R, r2 = R * R, margin = F.coverMarginMm;
  const key = (i, j, k) => ((i & 1023) << 20) | ((j & 1023) << 10) | (k & 1023);
  // The cover can only bind where the higher muscle lifts less than the lower one's own lift plus its largest fill,
  // so each query level gets a grid of only those points: under-the-intermediate (rank 0 queries: points of rank 1
  // and 2 lifted less than fillMax) and under-the-outer (rank 1 queries: rank 2 points lifted less than lowMax + fillMax).
  const fillMax = Math.max(...Object.values(F.mm)) + margin;
  let lowMax = 0;
  for (const e of list) if (e.rank === 1 && e.lift) for (let v = 0; v < e.lift.length; v++) if (e.lift[v] > lowMax) lowMax = e.lift[v];
  const grid = (minRank, maxLift) => {
    const counts = new Map(), coarse = new Set();
    let total = 0;
    for (const e of list) {
      if (e.rank < minRank) continue;
      for (let v = 0, p = e.src; v < p.length / 3; v++) {
        if ((e.lift ? e.lift[v] : 0) > maxLift) continue;
        const i = Math.floor(p[3 * v] * inv), j = Math.floor(p[3 * v + 1] * inv), k = Math.floor(p[3 * v + 2] * inv), h = key(i, j, k);
        const c = counts.get(h);
        total++;
        if (c) { counts.set(h, c + 1); continue; }
        counts.set(h, 1);
        // One coarse lookup (cells 4x larger) rejects a query with no occupied neighbour cell, as in stackBoneIndex.
        for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) for (let d = -1; d <= 1; d += 2) coarse.add(key((i + a) >> 2, (j + b) >> 2, (k + d) >> 2));
      }
    }
    const start = new Map(), at = new Map(), pts = new Float32Array(4 * total);
    let o = 0;
    for (const [h, c] of counts) { start.set(h, o); at.set(h, o); o += c; }
    for (const e of list) {
      if (e.rank < minRank) continue;
      for (let v = 0, p = e.src; v < p.length / 3; v++) {
        const L = e.lift ? e.lift[v] : 0;
        if (L > maxLift) continue;
        const h = key(Math.floor(p[3 * v] * inv), Math.floor(p[3 * v + 1] * inv), Math.floor(p[3 * v + 2] * inv)), q = at.get(h);
        pts[4 * q] = p[3 * v]; pts[4 * q + 1] = p[3 * v + 1]; pts[4 * q + 2] = p[3 * v + 2]; pts[4 * q + 3] = L;
        at.set(h, q + 1);
      }
    }
    return { counts, start, pts, coarse, total };
  };
  const grids = [grid(1, fillMax), grid(2, lowMax + fillMax)];
  const caps = new Map();
  for (const e of list) {
    if (e.rank >= 2) continue;
    const G = grids[e.rank];
    if (!G.total) continue;
    const p = e.src, n = p.length / 3;
    let cap = null;
    for (let v = 0; v < n; v++) {
      const x = p[3 * v], y = p[3 * v + 1], z = p[3 * v + 2], i = Math.floor(x * inv), j = Math.floor(y * inv), k = Math.floor(z * inv);
      if (!G.coarse.has(key(i >> 2, j >> 2, k >> 2))) continue;
      const own = e.lift ? e.lift[v] : 0;
      let best = Infinity;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
        const h = key(i + a, j + b, k + d), o = G.start.get(h);
        if (o === undefined) continue;
        for (let q = o, end = o + G.counts.get(h); q < end; q++) {
          const dx = G.pts[4 * q] - x, dy = G.pts[4 * q + 1] - y, dz = G.pts[4 * q + 2] - z;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          const c = G.pts[4 * q + 3] - own - margin;
          if (c < best) best = c;
        }
      }
      if (best < Infinity) { if (!cap) cap = new Float32Array(n).fill(Infinity); cap[v] = best; }
    }
    if (cap) caps.set(e.id, cap);
  }
  return caps;
}

/** Round 4 (unitRules.smooth): shave the relief of a sheet facing the front of the trunk down to a smooth surface through
 * its valleys, in place. Height h = how far forward (-y, drawn frame: the trunk is upright in the start posture) the
 * front-most surface is, on a grid of cellMm over x and z; the target is the height's minimum over reachMm up and down (not side to side), blurred;
 * every vertex of a cell (front and back face alike, so the sheet keeps its thickness) moves back by
 * weight x max(0, h - target), bilinearly between cells. Only inward: no vertex is drawn further out than before.
 * weight 0 (anchored ends) does not move. */
function stackShaveRelief(p, weight, { cellMm = 4, reachMm = 24, blurMm = 10 } = {}) {
  const n = p.length / 3;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let v = 0; v < n; v++) if (weight[v] > 0) { const x = p[3 * v], z = p[3 * v + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (!(x1 > x0) || !(z1 > z0)) return 0;
  const NX = Math.ceil((x1 - x0) / cellMm) + 1, NZ = Math.ceil((z1 - z0) / cellMm) + 1, H = new Float64Array(NX * NZ).fill(-Infinity);
  for (let v = 0; v < n; v++) {
    if (!(weight[v] > 0)) continue;
    const i = Math.round((p[3 * v] - x0) / cellMm), k = Math.round((p[3 * v + 2] - z0) / cellMm), h = -p[3 * v + 1];
    if (h > H[k * NX + i]) H[k * NX + i] = h;
  }
  const r = Math.round(reachMm / cellMm), M = new Float64Array(NX * NZ).fill(NaN), T = new Float64Array(NX * NZ).fill(NaN);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    if (H[k * NX + i] === -Infinity) continue;
    let m = Infinity;
    // Up and down only: the relief to remove runs across the trunk (the segments of rectus abdominis), while the
    // sheet's own curve round the flank runs side to side and must not be cut.
    for (let b = Math.max(0, k - r); b <= Math.min(NZ - 1, k + r); b++) {
      const h = H[b * NX + i];
      if (h !== -Infinity && h < m) m = h;
    }
    M[k * NX + i] = m;
  }
  const rb = Math.max(1, Math.round(blurMm / cellMm));
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    if (!(M[k * NX + i] === M[k * NX + i])) continue;
    let sw = 0, sv = 0;
    for (let b = Math.max(0, k - rb); b <= Math.min(NZ - 1, k + rb); b++) for (let a = Math.max(0, i - rb); a <= Math.min(NX - 1, i + rb); a++) {
      const m = M[b * NX + a];
      if (!(m === m)) continue;
      const w = Math.exp(-(((a - i) ** 2 + (b - k) ** 2) * cellMm * cellMm) / (2 * blurMm * blurMm)) ;
      sw += w; sv += w * m;
    }
    T[k * NX + i] = sv / sw;
  }
  // The height itself is blurred a little too (over one blur radius' third), so the shave follows the relief, not the
  // cell-to-cell noise of the fibre texture (which then stays as it is, moved back with its cell).
  const D = new Float64Array(NX * NZ), rh = Math.max(1, Math.round(blurMm / 3 / cellMm));
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const c = k * NX + i;
    if (H[c] === -Infinity || !(T[c] === T[c])) continue;
    let sw = 0, sv = 0;
    for (let b = Math.max(0, k - rh); b <= Math.min(NZ - 1, k + rh); b++) for (let a = Math.max(0, i - rh); a <= Math.min(NX - 1, i + rh); a++) {
      const h = H[b * NX + a];
      if (h === -Infinity) continue;
      sw++; sv += h;
    }
    D[c] = Math.max(0, sv / sw - T[c]);
  }
  let maxMm = 0;
  for (let v = 0; v < n; v++) {
    if (!(weight[v] > 0)) continue;
    const fx = (p[3 * v] - x0) / cellMm, fz = (p[3 * v + 2] - z0) / cellMm, i = Math.min(NX - 2, Math.max(0, Math.floor(fx))), k = Math.min(NZ - 2, Math.max(0, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), t = Math.min(1, Math.max(0, fz - k));
    const d = (1 - u) * (1 - t) * D[k * NX + i] + u * (1 - t) * D[k * NX + i + 1] + (1 - u) * t * D[(k + 1) * NX + i] + u * t * D[(k + 1) * NX + i + 1];
    const s = weight[v] * d;
    p[3 * v + 1] += s;   // back (+y)
    if (s > maxMm) maxMm = s;
  }
  return maxMm;
}

/** Segment -> axis chain of the body rig ('girdle' rides with whatever else the muscle is on). */
function stackSegmentChain(segment) {
  if (/_girdle$/.test(segment)) return 'girdle';
  const m = /^([rl])_(upperarm|forearm|radius|hand|thumb|index|middle|ring|little|thigh|patella|shank|foot|toes)/.exec(segment);
  if (!m) return 'trunk';
  return `${m[1]}_${/^(thigh|patella|shank|foot|toes)$/.test(m[2]) ? 'leg' : 'arm'}`;
}
function bodyStackChains(rig) {
  const P = k => (rig.pivots[k] && rig.pivots[k].point) || null, C = s => (rig.segments[s] && rig.segments[s].restCentroid) || null;
  // The trunk axis is one straight line through the middle of the body (pelvis to neck), not the bent spine: a bent
  // axis would give two radial directions on the inside of each bend. Its midline plane carries the attachment lines
  // that have no bone mesh (linea alba, nuchal ligament).
  // Round 3: a short second segment from the neck to the skull carries the neck region (its own gap and fill).
  const lo = C('pelvis'), hi = C('cervical'), top = C('skull');
  let trunk = null;
  if (lo && hi && len(sub(hi, lo)) > 1e-6) {
    const u = norm(sub(hi, lo)), side = sub([1, 0, 0], scl(u, u[0]));
    const neck = top && len(sub(top, hi)) > 1e-6;
    trunk = stackChain('trunk', neck ? [lo, hi, top] : [lo, hi], neck ? ['trunk', 'neck'] : ['trunk'],
      { midline: len(side) > 1e-6 ? { point: lo, normal: norm(side) } : null });
  }
  const limb = (key, pts, regions, extra = {}) => stackChain(key, pts.map(P), regions, { limb: true, ...extra });
  // Round 3: a leg never lifts toward the other leg (BODY_STACK_RULE.legInward): medial = toward the midline, +x for
  // the right leg (the source frame's +x is the subject's left) and -x for the left leg.
  return {
    trunk,
    r_arm: limb('r_arm', ['r_glenohumeral', 'r_elbow', 'r_wrist', 'r_middle_mcp'], ['upperarm', 'forearm', 'hand']),
    l_arm: null,   // the left arm is the separately rigged view-model: armStackLift
    r_leg: limb('r_leg', ['r_hip', 'r_knee', 'r_ankle', 'r_mtp'], ['thigh', 'shank', 'foot'], { medial: [1, 0, 0] }),
    l_leg: limb('l_leg', ['l_hip', 'l_knee', 'l_ankle', 'l_mtp'], ['thigh', 'shank', 'foot'], { medial: [-1, 0, 0] })
  };
}

/** Rest matrix (source -> drawn) of a mesh in a baked posture: the segment matrix or the muscle's rigid fit. */
function bakedRestMatrix(rig, baked, id) {
  const info = rig.meshSegment[id];
  if (!info) return null;
  const B = baked._internal;
  if (info.kind === 'bone' || info.blend.length === 1) return B.world[info.segment];
  return B.rigidRest[id] || null;
}

/** Lifted source positions q of mesh id through exactly the transform bakeBodyPosture gave its source positions p
 * (the same skin weights, taken from p), so an unmoved vertex lands bit for bit on its unlifted baked place.
 * A vertex blended between two segments that are turned against each other (the seated forearm) would get a shortened
 * lift, because the two turned copies of the lift partly cancel: the blended direction is kept and the lift is given
 * its length back (at most 2.5 times, so a direction that nearly cancels is not blown up). */
function bakeLiftedPositions(rig, baked, id, p, q, skinned) {
  const info = rig.meshSegment[id], B = baked._internal;
  if (skinned.has(id)) {
    const clouds = rig._clouds || {}, avail = (info.candidates || []).filter(s => clouds[s]);
    let near = null;
    const w = bakeSkinWeights(rig, id, p, avail, (segs, x, y, z) => (near || (near = nearestSearch(clouds, 'index')))(segs, x, y, z), true);
    const out = new Float32Array(q.length), mats = B.mats, bakedMesh = baked.meshesById.get(id), base = bakedMesh ? bakedMesh.positions : null;
    // R558 (R_FOREARM_TWIST): a twisted right-forearm influence takes its own turned ulna frame, exactly as in
    // bakeBodyPosture. Without it the lifted copy of a right forearm muscle was carried by the UNturned ulna (up to
    // 160 deg off the drawn radius side), up to 70 mm from its baked place, so the scene refused the whole body lift.
    const tw = w.tf ? rForearmTwistFrame(rig) : null;
    const T = tw ? rForearmTwistTable(mats[SEG_INDEX.get('r_forearm')], mats[SEG_INDEX.get('r_radius')], tw) : null;
    const RF = SEG_INDEX.get('r_forearm'), mA = new Float64Array(16), mB = new Float64Array(16);
    for (let i = 0, v = 0; i < q.length; i += 3, v++) {
      const x = q[i], y = q[i + 1], z = q[i + 2], f = T ? w.tf[v] : 0;
      const a = f > 0 && w.ia[v] === RF ? rForearmTwistMap(T, f, mA) : mats[w.ia[v]];
      const b = f > 0 && w.ib[v] === RF ? rForearmTwistMap(T, f, mB) : mats[w.ib[v]];
      const wa = w.wa[v], wb = 1 - wa;
      for (let r = 0; r < 3; r++) out[i + r] = wa * (a[r] * x + a[4 + r] * y + a[8 + r] * z + a[12 + r]) + wb * (b[r] * x + b[4 + r] * y + b[8 + r] * z + b[12 + r]);
      const lx = x - p[i], ly = y - p[i + 1], lz = z - p[i + 2], want2 = lx * lx + ly * ly + lz * lz;
      if (want2 > 0 && base && base.length === q.length) {
        const dx = out[i] - base[i], dy = out[i + 1] - base[i + 1], dz = out[i + 2] - base[i + 2], got2 = dx * dx + dy * dy + dz * dz;
        if (got2 > 1e-12 && got2 < want2) {
          const k = Math.min(2.5, Math.sqrt(want2 / got2));
          out[i] = base[i] + k * dx; out[i + 1] = base[i + 1] + k * dy; out[i + 2] = base[i + 2] + k * dz;
        }
      }
    }
    return out;
  }
  const rest = bakedRestMatrix(rig, baked, id);
  return rest ? transformPositions(rest, q) : null;
}

/**
 * The Body Worlds stack of a body rig: classification lists and, when the SOURCE meshes are given, the full-lift
 * positions of every lifted muscle (see the block comment above). With a baked posture the positions are in the drawn
 * (baked) frame and line up vertex for vertex with baked.meshesById; the unlifted body is the baked geometry itself.
 * The legacy `deep` list means scoped INTERMEDIATE_DEEP source relations, never a global whole-mesh layer.
 * @param options.meshesById the source meshes the rig (and the bake) were made from; without them nothing is lifted
 * @param options.extraBones more bone meshes in the same source frame (the left arm bones of the arm packet, so the
 *   left pectoralis major finds the humerus it ends on)
 * @returns frozen { kind: 'ns-body-layers', relativeTo, amount: 1, rule, regionalCatalogueSha256, superficial, deep,
 *   unclassified (the three catalogue lists), outer, intermediate (the lifted levels, catalogue and supplement
 *   together), supplement (ids levelled by BODY_STACK_SUPPLEMENT), filled (every muscle the display fill draws
 *   fuller), displaySelected (the lifted ones), unavailable, byId, units, ends, boneSamples, ms, fillMs }; the
 *   full-amount positions (lift plus fill, every filled muscle) come from bodyStackLiftedPositions(layers)
 */
export function bodyWorldsLayers(rig, baked = null, { meshesById = null, extraBones = null } = {}) {
  checkRig(rig);
  if (baked) checkBaked(rig, baked);
  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const getMesh = meshGetter(meshesById);
  const superficial = [], deep = [], unclassified = [], outer = [], intermediate = [], displaySelected = [], unavailable = [], supplement = [];
  const byId = Object.create(null), muscles = [], bones = [], digitBones = [], chainTally = new Map(), fillList = [], filled = [];
  for (const [id, info] of Object.entries(rig.meshSegment)) {
    if (info.kind === 'bone') { const b = getMesh(id); if (positionsOf(b)) { bones.push(b); if (STACK_DIGIT_SEGMENT.test(info.segment)) digitBones.push(b); } continue; }
    if (info.kind !== 'muscle') continue;
    const q = regionalLayerQualification(id), sc = bodyStackClass(id), level = sc.level;
    if (q.layer === 'superficial') superficial.push(id);
    else if (q.layer === 'intermediate_deep') deep.push(id);
    else unclassified.push(id);
    byId[id] = { layer: q.layer, regionalClass: q.regionalClass, ruleId: q.ruleId, level, levelSource: sc.source, displaySelected: false, displayStatus: 'not-selected' };
    if (sc.source === 'supplement') { byId[id].levelBasis = sc.basis; supplement.push(id); }
    else if (sc.source === 'packet') byId[id].levelBasis = sc.basis; // R558 (builder AN): BODY_STACK_PACKET
    const ax = stackRuleRow(BODY_STACK_RULE.axisOf, id), chainKey = ax ? ax.axis : stackSegmentChain(info.segment);
    const ur = stackRuleRow(BODY_STACK_RULE.unitRules, id);
    fillList.push({ id, chainKey, head: /^(skull|mandible)$/.test(info.segment), region: ur && ur.region ? ur.region : null, smooth: ur && ur.smooth ? ur.smooth : null });
    if (level !== 'outer' && level !== 'intermediate') continue;
    (level === 'outer' ? outer : intermediate).push(id);
    const p = positionsOf(getMesh(id));
    if (!p) { unavailable.push(id); byId[id].displayStatus = 'unavailable-geometry'; continue; }
    muscles.push({ id, positions: p });
    chainTally.set(id, chainKey);
  }
  if (extraBones) for (const b of extraBones) if (positionsOf(b)) bones.push(b);
  const chains = bodyStackChains(rig), bone = stackBoneIndex(bones, BODY_STACK_RULE.anchor.boneMm, BODY_STACK_RULE.anchor.boneSampleMm);
  // A named muscle belongs to the axis chain most of its vertices ride (the shoulder girdle does not vote: the deltoid
  // goes with the arm, the pectoralis and the trapezius with the trunk; girdle only = trunk).
  const chainFor = (ids, counts) => {
    const tally = Object.create(null);
    ids.forEach((id, i) => { const k = chainTally.get(id); if (k && k !== 'girdle') tally[k] = (tally[k] || 0) + counts[i]; });
    const best = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || 'trunk';
    return chains[best] || null;
  };
  const lift = muscles.length ? anchoredStackLift(muscles, bone, chainFor, digitBones) : { lifted: new Map(), byId: {}, units: {}, unavailable: [], ends: { two: [], one: [], none: [] }, boneSamples: bone.points, anchorDist: new Map() };
  const skinned = new Set(baked ? baked.skinned : []), positions = new Map();
  for (const { id, positions: p } of muscles) {
    const rec = lift.byId[id], meta = byId[id], q = lift.lifted.get(id);
    if (!q) { unavailable.push(id); meta.displayStatus = (rec && rec.status) || 'unavailable-geometry'; continue; }
    const drawn = baked ? bakeLiftedPositions(rig, baked, id, p, q, skinned) : q;
    const flat = baked ? baked.meshesById.get(id) : null;
    if (!drawn || (baked && (!flat || flat.positions.length !== drawn.length))) { unavailable.push(id); meta.displayStatus = 'unavailable-geometry'; continue; }
    positions.set(id, drawn);
    displaySelected.push(id);
    Object.assign(meta, { displaySelected: true, displayStatus: 'anchored-lift', unit: rec.unit, maxLiftMm: rec.maxLiftMm, rampMm: rec.rampMm,
      lengthMm: rec.lengthMm, anchored: rec.anchored, vertices: rec.vertices, cleanEnds: rec.cleanEnds, capFallback: rec.capFallback,
      endReach: rec.endReach, fullLiftShare: rec.fullLiftShare, heldEndShare: rec.heldEndShare });
  }
  // Round 3: the fill, on every muscle (lifted or not), added to what is drawn at full amount.
  const t1lift = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  if (meshesById) {
    const caps = stackCoverCaps(fillList.map(f => {
      const src = positionsOf(getMesh(f.id)), q = lift.lifted.get(f.id), lvl = byId[f.id].level;
      let mag = null;
      if (q && src && q.length === src.length) { mag = new Float32Array(src.length / 3); for (let v = 0; v < mag.length; v++) mag[v] = Math.hypot(q[3 * v] - src[3 * v], q[3 * v + 1] - src[3 * v + 1], q[3 * v + 2] - src[3 * v + 2]); }
      return { id: f.id, rank: q ? (lvl === 'outer' ? 2 : lvl === 'intermediate' ? 1 : 0) : 0, src: src || new Float32Array(0), lift: mag };
    }));
    for (const f of fillList) {
      const src = getMesh(f.id), p = positionsOf(src), drawnMesh = baked ? baked.meshesById.get(f.id) : src;
      const ix = drawnMesh && drawnMesh.indices ? drawnMesh.indices : src && src.indices;
      if (!p || !drawnMesh || !ix || !drawnMesh.positions || drawnMesh.positions.length !== p.length) continue;
      const chain = chains[f.chainKey === 'girdle' ? 'trunk' : f.chainKey] || chains.trunk;
      // On a leg the drawn frame keeps the source's side-to-side axis (the hips bend about it), so the inward
      // direction toward the other leg is the chain's own medial direction.
      const { off, maxMm } = stackFillMesh(p, drawnMesh.positions, ix, chain, f.head, lift.anchorDist.get(f.id), bone, chain && chain.medial ? chain.medial : null, { region: f.region, cap: caps.get(f.id) || null });
      const base = positions.get(f.id) || drawnMesh.positions, out = new Float32Array(base.length);
      for (let i = 0; i < out.length; i++) out[i] = base[i] + off[i];
      if (f.smooth && chains.trunk && chains.trunk.midline) {
        // Round 4 (unitRules.smooth): weight 0 on the anchored ends (as the fill), times the midline band.
        const S = f.smooth, M = chains.trunk.midline, aD = lift.anchorDist.get(f.id), w = new Float32Array(p.length / 3);
        for (let v = 0; v < w.length; v++) {
          const dm = Math.abs((p[3 * v] - M.point[0]) * M.normal[0] + (p[3 * v + 1] - M.point[1]) * M.normal[1] + (p[3 * v + 2] - M.point[2]) * M.normal[2]);
          w[v] = (aD && aD.length === w.length ? sstep(aD[v] / BODY_STACK_RULE.fill.endRampMm) : 1) * (1 - sstep((dm - S.innerMm) / (S.outerMm - S.innerMm)));
        }
        byId[f.id].reliefShavedMm = Math.round(stackShaveRelief(out, w, S) * 10) / 10;
      }
      positions.set(f.id, out);
      filled.push(f.id);
      byId[f.id].fillMm = Math.round(maxMm * 10) / 10;
    }
  }
  for (const id of Object.keys(byId)) Object.freeze(byId[id]);
  const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const out = {
    kind: 'ns-body-layers', relativeTo: baked ? 'baked' : 'source', amount: 1, rule: BODY_STACK_RULE,
    regionalCatalogueSha256: REGIONAL_LAYER_PROVENANCE.classificationDataSha256,
    superficial: Object.freeze(superficial), deep: Object.freeze(deep), unclassified: Object.freeze(unclassified),
    outer: Object.freeze(outer), intermediate: Object.freeze(intermediate),
    // ids whose level comes from BODY_STACK_SUPPLEMENT (textbook layers), not from the producer catalogue
    supplement: Object.freeze(supplement),
    // every muscle drawn fuller by the display fill (lifted or not); their full-amount positions are in the same map
    filled: Object.freeze(filled),
    displaySelected: Object.freeze(displaySelected), unavailable: Object.freeze(unavailable),
    byId: Object.freeze(byId), units: deepFreezeRig(lift.units),
    ends: Object.freeze({ two: Object.freeze(lift.ends.two), one: Object.freeze(lift.ends.one), none: Object.freeze(lift.ends.none) }),
    boneSamples: lift.boneSamples, ms: Math.round((t1 - t0) * 10) / 10, fillMs: Math.round((t1 - t1lift) * 10) / 10
  };
  Object.defineProperty(out, '_internal', { value: Object.freeze({ rig, baked, positions }), enumerable: false });
  return Object.freeze(out);
}

/** Map(meshId -> Float32Array): the full-lift positions of a bodyWorldsLayers() result (drawn frame when it was made
 * with a baked posture). The scene blends from the unlifted geometry to these by the eased amount; the arrays are
 * shared, do not write to them. */
export function bodyStackLiftedPositions(layers) {
  if (!layers || layers.kind !== 'ns-body-layers' || !layers._internal) throw new Error('ns:body_layers: expected a bodyWorldsLayers() result');
  return layers._internal.positions;
}

/**
 * Round 4 (judges' must-fix: the left forearm splintered into flat plates near the elbow with the palm down): the
 * left game arm is skinned with the arm rig's forearm TWIST chain (ns-rig FOREARM_TWIST_CHAIN: ulna, three tissue-only
 * frames, radius), and the palm-down hand is about 178 deg of pronation from the supinated rest mesh. Where the twist
 * fraction changes along the forearm (the rig's twist ramp, roughly 40 to 80% of the way to the wrist), neighbouring
 * vertices of these coarse meshes are turned by angles up to about 40 deg apart, so a long triangle becomes a flat
 * plate cutting across the twisted surface, and every millimetre of lift or fill there widens the plate (it moves the
 * vertex further from the turning axis). Measured offline at full pronation, elbow 93 deg: edges stretched to more than
 * 1.6 L + 2 mm, 172 with no stack, 1438 with the round-3 stack. So the LIFT of a vertex (the fill stays: without it
 * cracks open between the forearm muscles near the elbow) is multiplied by 1 - t x min(1, armTwistFade.slope x f (1 - f)),
 * where t is the vertex's skin weight on the twist chain and f its weighted twist fraction: it is kept where the tissue
 * turns as one piece (f near 0 at the elbow, near 1 at the wrist) and fades out where the twist changes fastest; a
 * vertex blended between two segments that bend against each other (elbow, wrist) also keeps only 1 - 4 w0 w1 x
 * armTwistFade.joint of it. Same check with this fade and the full fill: 222 stretched edges (172 with no stack);
 * triangles folded over by more than 100 deg at elbow 86 deg, palm down: 271 (399 with no stack). Most of what is left
 * comes from the rig's twist and elbow skinning itself, not from the stack. A display choice; the arm rig's skinning
 * is not changed.
 * @param weights { i0, i1, w0, w1 } (ns-rig skinWeights) or undefined
 * @returns Float32Array (0..1 per vertex) or null when the mesh has no weights or no twist-chain influence
 */
const TWIST_LEVEL_OF_SEGMENT = (() => {
  const m = new Float32Array(RIG_SEGMENTS.length).fill(NaN);
  FOREARM_TWIST_CHAIN.forEach((s, k) => { m[RIG_SEGMENTS.indexOf(s)] = FOREARM_TWIST_LEVELS[k]; });
  return m;
})();
function armTwistFade(weights, n) {
  if (!weights || !weights.i0 || !weights.i1 || !weights.w0 || !weights.w1 || weights.i0.length < n) return null;
  const { i0, i1, w0, w1 } = weights, c = BODY_STACK_RULE.armTwistFade.slope, out = new Float32Array(n);
  // R558: continuous twist weights (ns-rig skinWeights twist 'continuous') carry each vertex's own twist fraction tf
  // on its ulna influence; the chain's fixed frame levels apply otherwise.
  const tf = weights.tf && weights.tf.length >= n ? weights.tf : null, U = RIG_SEGMENTS.indexOf('ulna');
  const level = (seg, v) => (tf && seg === U ? tf[v] : TWIST_LEVEL_OF_SEGMENT[seg]);
  let any = false;
  for (let v = 0; v < n; v++) {
    const la = level(i0[v], v), lb = w1[v] > 0 ? level(i1[v], v) : NaN;
    let t = 0, f = 0;
    if (la === la) { t += w0[v]; f += w0[v] * la; }
    if (lb === lb) { t += w1[v]; f += w1[v] * lb; }
    // A vertex blended between two segments that bend against each other (upper arm and forearm at the elbow,
    // forearm and hand at the wrist; two twist-chain frames are handled by the twist term) keeps 1 - 4 w0 w1 x joint
    // of its displacement: none at an even blend, where linear blending shears the tissue most.
    const joint = w1[v] > 0 && i0[v] !== i1[v] && !(la === la && lb === lb) ? 4 * w0[v] * w1[v] * BODY_STACK_RULE.armTwistFade.joint : 0;
    if (!(t > 0) && !(joint > 0)) { out[v] = 1; continue; }
    if (t > 0) f /= t;
    out[v] = Math.min(1 - Math.min(1, t) * Math.min(1, c * f * (1 - f)), 1 - Math.min(1, joint));
    if (out[v] < 1) any = true;
  }
  return any ? out : null;
}

/**
 * The same anchored lift for the separately rigged left arm (the first-person view-model, CPU-skinned every frame):
 * full-lift REST positions per muscle id. Skin them with the weights computed from the ORIGINAL rest positions, so the
 * lift rides on the bone-driven pose and an anchored vertex skins exactly as before.
 * @param muscles [{ id, positions }] at rest (source millimetres, not modified)
 * @param bones iterable of { positions, indices }: the arm's bone meshes in the same frame
 * @param pivots the arm rig's pivots: { shoulder, elbow, wrist, middle_mcp } as [x, y, z]
 * @returns { liftedById: null-prototype object id -> Float32Array (every arm muscle: its lift, if any, plus the
 *   display fill), lifted (the ids the stack lifts), fillMm, byId, units, unavailable, ends, boneSamples, ms }
 */
export function armStackLift(muscles, bones, pivots) {
  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const P = k => (pivots && Array.isArray(pivots[k]) ? pivots[k] : null);
  const chain = stackChain('l_arm', [P('shoulder'), P('elbow'), P('wrist'), P('middle_mcp')], ['upperarm', 'forearm', 'hand'], { limb: true });
  const A = BODY_STACK_RULE.anchor, bone = stackBoneIndex([...(bones || [])].filter(b => positionsOf(b)), A.boneMm, A.boneSampleMm);
  // R558 (Message 30): no lift on the fingers and the thumb (BODY_STACK_RULE.digits), from the arm rig's digit bones.
  const digitBones = [...(bones || [])].filter(b => positionsOf(b) && typeof b.segment === 'string' && STACK_DIGIT_SEGMENT.test(b.segment));
  const lift = anchoredStackLift(muscles || [], bone, () => chain, digitBones.length ? digitBones : null);
  // Round 3: every arm muscle also gets the display fill (stackFillOffsets), on top of its lift when it has one.
  const liftedById = Object.create(null), fillMm = Object.create(null), list = [...(muscles || [])];
  // Round 4: the cover caps (stackCoverCaps), as on the body.
  const caps = stackCoverCaps(list.filter(m => positionsOf(m) && typeof m.id === 'string').map(m => {
    const src = positionsOf(m), q = lift.lifted.get(m.id), lvl = bodyStackLevel(m.id);
    let mag = null;
    if (q && q.length === src.length) { mag = new Float32Array(src.length / 3); for (let v = 0; v < mag.length; v++) mag[v] = Math.hypot(q[3 * v] - src[3 * v], q[3 * v + 1] - src[3 * v + 1], q[3 * v + 2] - src[3 * v + 2]); }
    return { id: m.id, rank: q ? (lvl === 'outer' ? 2 : lvl === 'intermediate' ? 1 : 0) : 0, src, lift: mag };
  }));
  let faded = 0;
  for (const m of list) {
    const p = positionsOf(m);
    if (!p || !m.indices || typeof m.id !== 'string') continue;
    const base = lift.lifted.get(m.id) || p, { off, maxMm } = stackFillMesh(p, p, m.indices, chain, false, lift.anchorDist.get(m.id), bone, null, { cap: caps.get(m.id) || null });
    // The fade takes the LIFT out where the skinning shears; the fill (at most a millimetre or two) stays, because it
    // is what closes the small cracks between neighbouring forearm muscles near the elbow (without it they open and
    // show the background through the forearm).
    const out = new Float32Array(base.length), fade = armTwistFade(m.weights, p.length / 3);
    for (let v = 0; v < p.length / 3; v++) {
      const k = fade ? fade[v] : 1;
      if (k < 1) faded++;
      for (let r = 0; r < 3; r++) { const i = 3 * v + r; out[i] = p[i] + k * (base[i] - p[i]) + off[i]; }
    }
    liftedById[m.id] = out;
    fillMm[m.id] = Math.round(maxMm * 10) / 10;
  }
  const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  return { liftedById, lifted: [...lift.lifted.keys()], fillMm, twistFadedVertices: faded, byId: lift.byId, units: lift.units, unavailable: lift.unavailable, ends: lift.ends, boneSamples: lift.boneSamples, ms: Math.round((t1 - t0) * 10) / 10 };
}

function checkLayers(rig, baked, layers) {
  if (!layers || layers.kind !== 'ns-body-layers' || !layers._internal) throw new Error('ns:body_pose: options.layers must come from bodyWorldsLayers');
  if (layers._internal.rig !== rig) throw new Error('ns:body_pose: options.layers was made for a different rig');
  if ((layers._internal.baked || null) !== (baked || null)) throw new Error('ns:body_pose: options.layers was made for a different baked posture (pass the same baked to both)');
  return layers;
}

// ---------------------------------------------------------------------------------------------------------------------
// Round 5 (R5-body, D19): a second, independent body instance (the mirror body)
//
// The mirror body is the same rig, the same baked geometry (shared positions/indices arrays: the scene can reuse its
// BufferGeometry objects) and the same pose matrices, under its own group transform that REFLECTS the body front to back
// (BodyParts3D y -> -y), so it faces you and your left arm moves on your left, as in a real mirror. Winding and normals
// under a reflection: three.js (vendor r170) draws a mesh whose matrixWorld has a negative determinant with
// frontFace CW (WebGLRenderer: frontFaceCW = object.matrixWorld.determinant() < 0), and its normalMatrix (inverse
// transpose) reflects the normals correctly, so the scene shares geometry AND materials unchanged; only a renderer that
// ignores the determinant needs reflectWinding(indices). Pose and activity sync: give the mirror meshes the SAME
// per-mesh matrices (poseBody result, Body Worlds layers included) and the same drives every frame (syncBodyInstance).

/** Reflection of the BodyParts3D frame front to back (y -> -y), the mirror's facing flip. */
const MIRROR_FLIP = Object.freeze([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const det3 = m => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
const finite16 = m => m && m.length === 16 && Array.prototype.every.call(m, Number.isFinite);
const finite3 = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) || ArrayBuffer.isView(v) && v.length === 3 && Array.prototype.every.call(v, Number.isFinite);

/** Bounds, centre and height (mm, source frame) of a set of meshes (baked.meshesById or source meshes). */
export function bodyBoundsBp(meshesById, { ids = null } = {}) {
  const get = meshGetter(meshesById);
  const list = ids || (meshesById instanceof Map ? [...meshesById.keys()] : Object.keys(meshesById || {}));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const id of list) {
    const m = get(id), b = m && m.bounds && m.bounds.min ? m.bounds : (positionsOf(m) ? boundsOf(positionsOf(m)) : null);
    if (!b) continue;
    for (let k = 0; k < 3; k++) { if (b.min[k] < min[k]) min[k] = b.min[k]; if (b.max[k] > max[k]) max[k] = b.max[k]; }
  }
  if (!min.every(Number.isFinite)) return null;
  return { min, max, centre: mid(min, max).map(x => Math.round(x * 10) / 10), heightMm: Math.round((max[2] - min[2]) * 10) / 10 };
}

/**
 * The mirror body's group matrix (BodyParts3D mm -> world, column-major Float64Array(16), determinant < 0):
 *   world = T(targetWorld) . Orbit . L . scale . F . T(-centreBp)
 * where L is the linear part of bodyToWorld (body axes and mm -> m), F flips front and back (y -> -y), and Orbit turns
 * it about its own centre (orbit: { yawDeg about upWorld, pitchDeg about rightWorld } or a 4x4 rotation matrix). At
 * orbit 0 it faces the player (its front toward the player's front) and its left side is on the player's left.
 * @param o { bodyToWorld (4x4, required), centreBp ([x,y,z] mm, the point it orbits about and that lands on
 *   targetWorld; default the centre of the seated body bounds is the caller's choice), targetWorld ([x,y,z] world),
 *   scale (default 1), orbit, upWorld (default [0,1,0]), rightWorld (default L applied to +x, normalised) }
 * @returns { matrix, det, reflected: true, frontFaceCW: true, scale }
 */
export function mirrorBodyMatrix({ bodyToWorld, centreBp, targetWorld, scale = 1, orbit = null, upWorld = [0, 1, 0], rightWorld = null } = {}) {
  if (!finite16(bodyToWorld)) throw new Error('ns:body_mirror: bodyToWorld must be a finite 4x4 matrix');
  if (!finite3(centreBp) || !finite3(targetWorld)) throw new Error('ns:body_mirror: centreBp and targetWorld must be finite [x, y, z]');
  if (!(Number.isFinite(scale) && scale > 0)) throw new Error('ns:body_mirror: scale must be a positive number');
  const L = Float64Array.from(bodyToWorld);
  L[12] = L[13] = L[14] = 0;
  let O = m4I();
  if (orbit && orbit.length === 16) {
    if (!finite16(orbit)) throw new Error('ns:body_mirror: orbit matrix must be finite');
    O = Float64Array.from(orbit); O[12] = O[13] = O[14] = 0;
  } else if (orbit) {
    const yaw = Number.isFinite(orbit.yawDeg) ? orbit.yawDeg : 0, pitch = Number.isFinite(orbit.pitchDeg) ? orbit.pitchDeg : 0;
    const right = rightWorld && finite3(rightWorld) ? norm([...rightWorld]) : norm(m4Dir(L, [1, 0, 0]));
    O = m4Mul(m4RotAbout(right, pitch, [0, 0, 0]), m4RotAbout(norm([...upWorld]), yaw, [0, 0, 0]));
  }
  const S = m4I(); S[0] = S[5] = S[10] = scale;
  const M = m4Mul(m4Trans([...targetWorld]), m4Mul(O, m4Mul(L, m4Mul(S, m4Mul(Float64Array.from(MIRROR_FLIP), m4Trans(scl([...centreBp], -1)))))));
  const det = det3(M);
  return { matrix: M, det, reflected: det < 0, frontFaceCW: det < 0, scale };
}

/** Triangle indices with every triangle's winding reversed (a, b, c) -> (a, c, b), for a renderer that does not flip the
 * front face under a reflecting matrix (three.js does; see the section comment). Returns a new Uint32Array. */
export function reflectWinding(indices) {
  const o = new Uint32Array(indices.length);
  for (let i = 0; i + 2 < indices.length; i += 3) { o[i] = indices[i]; o[i + 1] = indices[i + 2]; o[i + 2] = indices[i + 1]; }
  return o;
}

/**
 * A body instance: what one drawn copy of the body needs. The primary body and the mirror body share rig, baked,
 * layers and meshesById (the same arrays, so geometry is shared); each has its own toWorld (group matrix).
 * @returns sealed { kind: 'ns-body-instance', role, rig, baked, layers, meshesById, toWorld, reflected, pose, drives,
 *   layerAmount, frame }
 */
export function createBodyInstance({ rig, baked = null, layers = null, role = 'primary', toWorld = null } = {}) {
  checkRig(rig);
  if (baked) checkBaked(rig, baked);
  if (layers) checkLayers(rig, baked, layers);
  if (toWorld !== null && !finite16(toWorld)) throw new Error('ns:body_instance: toWorld must be a finite 4x4 matrix or null');
  const tw = toWorld ? Float64Array.from(toWorld) : null;
  return Object.seal({
    kind: 'ns-body-instance', role: String(role), rig, baked, layers, meshesById: baked ? baked.meshesById : null,
    toWorld: tw, reflected: tw ? det3(tw) < 0 : false, pose: null, drives: null, layerAmount: layers ? layers.amount : 0, frame: 0
  });
}

/** A mirror instance of a primary instance (shared rig/baked/layers/meshes; toWorld from mirrorBodyMatrix(mirror)). */
export function createMirrorBodyInstance(primary, mirror) {
  if (!primary || primary.kind !== 'ns-body-instance') throw new Error('ns:body_instance: expected a primary body instance');
  const inst = createBodyInstance({ rig: primary.rig, baked: primary.baked, layers: primary.layers, role: 'mirror', toWorld: mirrorBodyMatrix(mirror).matrix });
  syncBodyInstance(inst, primary);
  return inst;
}

/** Re-place a mirror instance (new orbit, target or scale): toWorld = mirrorBodyMatrix(mirror).matrix. */
export function setMirrorBodyTransform(inst, mirror) {
  if (!inst || inst.kind !== 'ns-body-instance') throw new Error('ns:body_instance: expected a body instance');
  inst.toWorld = mirrorBodyMatrix(mirror).matrix;
  inst.reflected = true;
  return inst.toWorld;
}

/** Pose an instance: poseBodyDetailed with the instance's baked posture and layers; stores pose (matrices), drives and
 * layerAmount on the instance. options: { anchor, external, layerAmount, drives } (drives: bodyMuscleDrives result). */
export function poseBodyInstance(inst, jointTargetsDeg = {}, options = {}) {
  if (!inst || inst.kind !== 'ns-body-instance') throw new Error('ns:body_instance: expected a body instance');
  const { drives = null, ...rest } = options;
  const opts = { ...rest };
  if (inst.baked) opts.baked = inst.baked;
  if (inst.layers) opts.layers = inst.layers;
  const r = poseBodyDetailed(inst.rig, jointTargetsDeg, opts);
  inst.pose = r.matrices;
  inst.drives = drives;
  inst.layerAmount = r.layers ? r.layers.amount : 0;
  inst.frame++;
  return r;
}

/** Copy the pose, drives and layer amount of `source` onto `target` (the SAME Map / object references: no per-mesh
 * copy, so the mirror always shows exactly the primary's pose, activity colours and Body Worlds layers). Returns true
 * when anything changed. */
export function syncBodyInstance(target, source) {
  if (!target || target.kind !== 'ns-body-instance' || !source || source.kind !== 'ns-body-instance') throw new Error('ns:body_instance: expected two body instances');
  if (target.rig !== source.rig) throw new Error('ns:body_instance: instances of different rigs cannot be synced');
  const changed = target.pose !== source.pose || target.drives !== source.drives || target.layerAmount !== source.layerAmount || target.frame !== source.frame;
  target.pose = source.pose; target.drives = source.drives; target.layerAmount = source.layerAmount; target.frame = source.frame;
  return changed;
}

// ---------------------------------------------------------------------------------------------------------------------
// Round 5 (R5-body, D20): optional extra body packets (the face and chewing muscles)
//
// BodyParts3D 4.0 has no facial-expression or chewing muscles. The user chose (2026-11-09) to download only those meshes
// from an openly licensed atlas (R5-face: packet face-muscles-r1, share-alike meshes; the game code stays CC0). This
// module loads such a packet generically (manifest URL, packet base, expected manifest sha256, a sha256 per file) and
// adds its muscles to the rig. They are posed with the skull (rig_hint 'skull'), and the jaw muscles (rig_hint
// ['skull', 'mandible']) follow the mandible during jaw actions through the same two-nearest-bone weights and rigid fit
// as every other muscle. Nothing of the base packet changes: bones (and so every joint) come from the base packet.
// The exact manifest entry format is in round5/R5-body-NOTES.md ("Face packet format").

/** The face packet the game looks for (relative URLs; expectedManifestSha256 is pinned once R5-face delivers it). */
export const FACE_MUSCLE_PACKET = Object.freeze({
  id: 'face-muscles-r1',
  manifestUrl: 'packets/face-muscles-r1/FACE-MESH-MANIFEST.json',
  packetBase: 'packets/face-muscles-r1/',
  expectedManifestSha256: '19bf7bc6f52859584c35bd1b3ee5c144240020d8a9217e5bd2a34847d9ee6a05' // Curated face metadata; mesh bytes unchanged; production gates remain separate.
});
/** rig_hint values an extra face/jaw packet entry may use (segments of this rig's head). */
export const EXTRA_PACKET_HINTS = Object.freeze(['skull', 'mandible', 'hyoid', 'cervical', 'thorax', 'r_girdle', 'l_girdle']);
const EXTRA_ID_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const EXTRA_MAX_ENTRIES = 400;
const EXTRA_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Validate an extra packet manifest. Refuses (throws ns:body_packet) a manifest that is not an object with assets, a
 * packet id mismatch, an id clash with baseIds, a path outside meshes/<id>.obj, a missing sha256/bytes, a kind other
 * than muscle or bone, a rig_hint outside EXTRA_PACKET_HINTS, a laterality that disagrees with the centroid side, and
 * any genital anatomy (R15). Returns { packet, entries: frozen snapshots in manifest order (source_packet set) }.
 */
export function validateExtraBodyManifest(manifest, { packet = null, baseIds = [] } = {}) {
  const bad = msg => { throw new Error(`ns:body_packet: ${msg}`); };
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.assets)) bad('the manifest must be an object with an assets array');
  const pid = manifest.packet;
  if (typeof pid !== 'string' || !EXTRA_ID_RE.test(pid)) bad('manifest.packet must be a packet id');
  if (packet && pid !== packet) bad(`manifest.packet is ${JSON.stringify(pid)}, expected ${JSON.stringify(packet)}`);
  if (manifest.asset_count !== undefined && manifest.asset_count !== manifest.assets.length) bad(`asset_count ${manifest.asset_count} does not match ${manifest.assets.length} assets`);
  if (manifest.assets.length > EXTRA_MAX_ENTRIES) bad(`more than ${EXTRA_MAX_ENTRIES} assets`);
  const taken = new Set(baseIds instanceof Set ? baseIds : baseIds || []);
  const out = [];
  manifest.assets.forEach((a, i) => {
    if (!a || typeof a !== 'object') bad(`asset ${i} is not an object`);
    const id = a.element_id;
    if (typeof id !== 'string' || !EXTRA_ID_RE.test(id)) bad(`asset ${i}: element_id must match ${EXTRA_ID_RE}`);
    if (taken.has(id)) bad(`${id} is already loaded (ids must be unique across packets)`);
    taken.add(id);
    if (a.path !== `meshes/${id}.obj`) bad(`${id}: path must be meshes/${id}.obj`);
    if (!Number.isSafeInteger(a.bytes) || a.bytes <= 0 || a.bytes > EXTRA_MAX_BYTES) bad(`${id}: bytes must be a positive integer up to ${EXTRA_MAX_BYTES}`);
    if (typeof a.sha256 !== 'string' || !HEX64.test(a.sha256.toLowerCase())) bad(`${id}: sha256 must be 64 hex characters`);
    if (a.kind !== 'muscle' && a.kind !== 'bone') bad(`${id}: kind must be muscle or bone`);
    const hint = a.rig_hint, hints = Array.isArray(hint) ? hint : [hint];
    if (!(hints.length === 1 || hints.length === 2) || !hints.every(h => EXTRA_PACKET_HINTS.includes(h))) bad(`${id}: rig_hint must use ${EXTRA_PACKET_HINTS.join(', ')}`);
    if (!['left', 'right', 'midline'].includes(a.laterality)) bad(`${id}: laterality must be left, right or midline`);
    const vec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
    if (!vec(a.bounds_min) || !vec(a.bounds_max)) bad(`${id}: bounds_min and bounds_max must be 3 finite numbers`);
    const cx = vec(a.centroid) ? a.centroid[0] : (a.bounds_min[0] + a.bounds_max[0]) / 2;
    if (a.laterality === 'left' && !(cx > 0)) bad(`${id}: a left-sided entry needs centroid x > 0 (subject left is +x)`);
    if (a.laterality === 'right' && !(cx < 0)) bad(`${id}: a right-sided entry needs centroid x < 0 (subject right is -x)`);
    if (genitalAnatomyTerms(a).length) bad(`${id}: genital anatomy is never loaded (R15)`);
    const name = typeof a.name === 'string' && a.name ? a.name : typeof a.embedded_source_name === 'string' ? a.embedded_source_name : '';
    if (!name) bad(`${id}: name (plain anatomical name with its side, e.g. "left zygomaticus major") is required`);
    out.push(Object.freeze({ ...a, sha256: a.sha256.toLowerCase(), source_packet: pid, rig_hint: Array.isArray(hint) ? Object.freeze([...hint]) : hint, name }));
  });
  return { packet: pid, entries: Object.freeze(out) };
}

/**
 * Load an extra packet with injected I/O (no DOM, no fetch of its own):
 *   fetchText(url) -> Promise<string>, sha256Hex(text) -> Promise<hex> | hex, parse(text) -> { positions, indices, ... }
 * The manifest text must hash to expectedManifestSha256 when given; every mesh text must hash to its entry's sha256.
 * A packet that is not there (fetchText rejects for the manifest) is 'absent' (the game runs without it); a bad
 * manifest is 'invalid'; files that fail are listed in errors and left out ('partial').
 * @returns Promise<{ status: 'absent' | 'invalid' | 'complete' | 'partial', packet, manifest, entries, meshesById (Map),
 *   errors: [{ id, error }], attribution }>
 */
export async function loadExtraBodyPacket({ manifestUrl, packetBase, expectedManifestSha256 = null, fetchText, sha256Hex, parse, baseIds = [], packet = null, concurrency = 4, onProgress = null } = {}) {
  if (typeof fetchText !== 'function' || typeof sha256Hex !== 'function' || typeof parse !== 'function') throw new Error('ns:body_packet: fetchText, sha256Hex and parse must be functions');
  if (typeof manifestUrl !== 'string' || typeof packetBase !== 'string') throw new Error('ns:body_packet: manifestUrl and packetBase must be strings');
  const base = packetBase.endsWith('/') ? packetBase : `${packetBase}/`;
  let text;
  try { text = await fetchText(manifestUrl); } catch (err) { return { status: 'absent', packet, manifest: null, entries: [], meshesById: new Map(), errors: [{ id: null, error: String(err && err.message || err) }], attribution: null }; }
  const fail = error => ({ status: 'invalid', packet, manifest: null, entries: [], meshesById: new Map(), errors: [{ id: null, error }], attribution: null });
  if (expectedManifestSha256) {
    const h = String(await sha256Hex(text)).toLowerCase();
    if (h !== String(expectedManifestSha256).toLowerCase()) return fail(`manifest sha256 ${h} does not match the expected ${expectedManifestSha256}`);
  }
  let manifest, v;
  try { manifest = JSON.parse(text); v = validateExtraBodyManifest(manifest, { packet, baseIds }); } catch (err) { return fail(String(err && err.message || err)); }
  const meshesById = new Map(), errors = [];
  let next = 0, done = 0;
  const worker = async () => {
    while (next < v.entries.length) {
      const e = v.entries[next++];
      try {
        const t = await fetchText(base + e.path);
        const h = String(await sha256Hex(t)).toLowerCase();
        if (h !== e.sha256) throw new Error(`sha256 ${h} does not match the manifest`);
        const m = parse(t);
        if (!positionsOf(m) || !m.indices || m.indices.length < 3) throw new Error('no triangles');
        meshesById.set(e.element_id, m);
      } catch (err) { errors.push({ id: e.element_id, error: String(err && err.message || err) }); }
      done++;
      if (typeof onProgress === 'function') { try { onProgress(done, v.entries.length); } catch { /* advisory */ } }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(16, concurrency | 0 || 1)) }, worker));
  const entries = v.entries.filter(e => meshesById.has(e.element_id));
  return {
    status: errors.length ? 'partial' : 'complete', packet: v.packet, manifest, entries, meshesById, errors,
    attribution: typeof manifest.attribution === 'string' ? manifest.attribution : typeof manifest.rights === 'string' ? manifest.rights : null
  };
}

/** Merge a base body ({ entries, meshesById }) with extra packets into one { entries, meshesById: Map } for
 * buildBodyRig / bakeBodyPosture / setBody. Duplicate ids and genital entries are refused (throws ns:body_packet). The
 * base entries keep their order and come first, so every base mesh rigs exactly as without the extras. */
export function mergeBodyPackets(base, ...extras) {
  const entries = [], meshesById = new Map(), seen = new Set();
  const add = (pk, label) => {
    if (!pk) return;
    const list = Array.isArray(pk.entries) ? pk.entries : pk.entries && Array.isArray(pk.entries.assets) ? pk.entries.assets : null;
    if (!list) throw new Error(`ns:body_packet: ${label} needs entries`);
    const get = meshGetter(pk.meshesById);
    for (const e of list) {
      const id = e && (e.element_id || e.id);
      if (!id) throw new Error(`ns:body_packet: ${label} has an entry without element_id`);
      if (seen.has(id)) throw new Error(`ns:body_packet: ${id} appears twice`);
      if (genitalAnatomyTerms(e).length) throw new Error(`ns:body_packet: ${id} is genital anatomy (R15)`);
      seen.add(id);
      entries.push(e);
      const m = get(id);
      if (m) meshesById.set(id, m);
    }
  };
  add(base, 'the base body');
  extras.forEach((x, i) => add(x, `extra packet ${i + 1}`));
  return { entries, meshesById };
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
// R558 (user Message 20, builder FA): scalp muscles drawn ON the completed skull

/**
 * Display choices for conformMusclesToBones. The Z-Anatomy face packet was fitted to the BodyParts3D frontal, temporal and
 * facial bones; the BodyParts3D parietal and occipital bones (packet bodyparts3d-head-r1) are a little larger than the
 * skull the scalp muscles were modelled on, so parts of the occipital belly (up to 6 mm deep), the temporoparietalis (8 mm)
 * and the upper temporalis (5 mm) lie inside them (measured on the source meshes). Those muscles are drawn lifted onto
 * the bone surface:
 *  marginMm: how far above the outer bone surface a lifted vertex ends up;
 *  reachMm: only vertices whose nearest outer bone point is closer than this are tested (the rest stay exactly);
 *  cellMm: spatial grid of the bone points;
 *  spreadMm: every vertex takes the largest push found within this distance on the same muscle, so both surfaces of a
 *    thin sheet move together (its thickness and shape are kept);
 *  rampPasses: neighbour passes that let the push fade out over a few rings around the lifted part (no crease at its edge);
 *  maxPushMm: the push is capped here (and reported) so a wrong input can never throw a muscle off the head.
 * A display choice, never measured anatomy: in a real head these muscles lie on the skull, which is what is drawn.
 */
export const SCALP_CONFORM = Object.freeze({ marginMm: 0.6, reachMm: 12, cellMm: 4, spreadMm: 3, rampPasses: 6, maxPushMm: 12 });

/**
 * Lift muscles that lie inside the given bones out onto the bones' outer surface (pure; source millimetres).
 * meshesById: Map id -> { positions, indices }; boneIds: the bones to conform to; muscleIds: the muscles that may move.
 * The outer surface is the bone vertices whose welded normal points away from the centre of the bones' joint bounding box
 * (the outer table of a cranial bone; the inner table faces the centre). A muscle vertex is pushed along the nearest outer
 * point's normal by max(0, marginMm - its signed distance to that point's tangent plane); the push is spread over
 * spreadMm on the same muscle, ramped out over rampPasses rings, capped at maxPushMm; the direction is the neighbour mean
 * of the bone normals. Muscles that need no push are not returned. Returns { positions: Map id -> Float32Array (new
 * array; the input is never written), report: { muscles, vertices, maxPushMm, capped, ms, byId } }.
 */
export function conformMusclesToBones(meshesById, { boneIds = [], muscleIds = [], options = SCALP_CONFORM } = {}) {
  const o = { ...SCALP_CONFORM, ...(options || {}) };
  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const getMesh = meshGetter(meshesById);
  const out = new Map(), byId = Object.create(null);
  let movedTotal = 0, maxPush = 0, capped = 0;
  // Outer bone points and their welded vertex normals.
  const bones = boneIds.map(id => getMesh(id)).filter(m => positionsOf(m) && m.indices && m.indices.length >= 3);
  if (!bones.length) return { positions: out, report: { muscles: 0, vertices: 0, maxPushMm: 0, capped: 0, ms: 0, byId } };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of bones) { const bb = bboxOf(b.positions); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], bb.min[k]); hi[k] = Math.max(hi[k], bb.max[k]); } }
  const centre = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2);
  const px = [], nx = [];
  for (const b of bones) {
    const p = b.positions, ix = b.indices, n = p.length / 3, acc = new Float64Array(3 * n);
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = 3 * ix[t], c = 3 * ix[t + 1], d = 3 * ix[t + 2];
      const ux = p[c] - p[a], uy = p[c + 1] - p[a + 1], uz = p[c + 2] - p[a + 2], vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      for (const k of [a, c, d]) { acc[k] += fx; acc[k + 1] += fy; acc[k + 2] += fz; }
    }
    // weld by exact position (the OBJ parser splits a vertex where its normals differ): open addressing on the bits
    const rep = new Int32Array(n);
    let size = 16; while (size < 2 * n) size <<= 1;
    const table = new Int32Array(size).fill(-1), f64 = new Float64Array(3), u32 = new Uint32Array(f64.buffer);
    for (let i = 0; i < n; i++) {
      f64[0] = p[3 * i]; f64[1] = p[3 * i + 1]; f64[2] = p[3 * i + 2];
      let h = (Math.imul(u32[0] ^ u32[1], 73856093) ^ Math.imul(u32[2] ^ u32[3], 19349663) ^ Math.imul(u32[4] ^ u32[5], 83492791)) & (size - 1);
      for (;;) {
        const j = table[h];
        if (j < 0) { table[h] = i; rep[i] = i; break; }
        if (p[3 * j] === p[3 * i] && p[3 * j + 1] === p[3 * i + 1] && p[3 * j + 2] === p[3 * i + 2]) { rep[i] = j; acc[3 * j] += acc[3 * i]; acc[3 * j + 1] += acc[3 * i + 1]; acc[3 * j + 2] += acc[3 * i + 2]; break; }
        h = (h + 1) & (size - 1);
      }
    }
    for (let i = 0; i < n; i++) {
      if (rep[i] !== i) continue;
      const l = Math.hypot(acc[3 * i], acc[3 * i + 1], acc[3 * i + 2]);
      if (!(l > 0)) continue;
      const ux = acc[3 * i] / l, uy = acc[3 * i + 1] / l, uz = acc[3 * i + 2] / l;
      if (ux * (p[3 * i] - centre[0]) + uy * (p[3 * i + 1] - centre[1]) + uz * (p[3 * i + 2] - centre[2]) <= 0) continue; // inner table
      px.push(p[3 * i], p[3 * i + 1], p[3 * i + 2]); nx.push(ux, uy, uz);
    }
  }
  // Dense grid (CSR) over the bones' box widened by reach.
  const cs = o.cellMm, g0 = lo.map(v => v - o.reachMm), dims = [0, 1, 2].map(k => Math.max(1, Math.ceil((hi[k] - lo[k] + 2 * o.reachMm) / cs)));
  const cellOf = (x, y, z) => {
    const i = Math.floor((x - g0[0]) / cs), j = Math.floor((y - g0[1]) / cs), k = Math.floor((z - g0[2]) / cs);
    return i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2] ? -1 : (k * dims[1] + j) * dims[0] + i;
  };
  const nCells = dims[0] * dims[1] * dims[2], start = new Int32Array(nCells + 1), np = px.length / 3;
  for (let i = 0; i < np; i++) { const c = cellOf(px[3 * i], px[3 * i + 1], px[3 * i + 2]); if (c >= 0) start[c + 1]++; }
  for (let c = 0; c < nCells; c++) start[c + 1] += start[c];
  const fillAt = start.slice(0, nCells), items = new Int32Array(start[nCells]);
  for (let i = 0; i < np; i++) { const c = cellOf(px[3 * i], px[3 * i + 1], px[3 * i + 2]); if (c >= 0) items[fillAt[c]++] = i; }
  const R = Math.ceil(o.reachMm / cs), reach2 = o.reachMm * o.reachMm;
  // Cells with an outer bone point within reach (a dilation of the occupied cells): every other vertex is skipped at once.
  const near = new Uint8Array(nCells);
  for (let c = 0; c < nCells; c++) {
    if (start[c + 1] === start[c]) continue;
    const i0 = c % dims[0], j0 = Math.floor(c / dims[0]) % dims[1], k0 = Math.floor(c / (dims[0] * dims[1]));
    for (let k = Math.max(0, k0 - R); k <= Math.min(dims[2] - 1, k0 + R); k++) for (let j = Math.max(0, j0 - R); j <= Math.min(dims[1] - 1, j0 + R); j++) {
      const row = (k * dims[1] + j) * dims[0];
      for (let i = Math.max(0, i0 - R); i <= Math.min(dims[0] - 1, i0 + R); i++) near[row + i] = 1;
    }
  }
  for (const id of muscleIds) {
    const m = getMesh(id), p = positionsOf(m);
    if (!p || !m.indices || m.indices.length < 3) continue;
    const bb = bboxOf(p);
    if ([0, 1, 2].some(k => bb.max[k] < g0[k] || bb.min[k] > g0[k] + dims[k] * cs)) continue;
    const n = p.length / 3, need = new Float32Array(n), dir = new Float32Array(3 * n), hasDir = new Uint8Array(n);
    let any = false;
    for (let v = 0; v < n; v++) {
      const x = p[3 * v], y = p[3 * v + 1], z = p[3 * v + 2];
      const ci = Math.floor((x - g0[0]) / cs), cj = Math.floor((y - g0[1]) / cs), ck = Math.floor((z - g0[2]) / cs);
      if (ci < 0 || cj < 0 || ck < 0 || ci >= dims[0] || cj >= dims[1] || ck >= dims[2] || !near[(ck * dims[1] + cj) * dims[0] + ci]) continue;
      // Nearest outer point, ring by ring (Chebyshev rings of cells); stop once no farther ring can hold a nearer point.
      let best = -1, bd = reach2;
      for (let r = 0; r <= R; r++) {
        for (let k = ck - r; k <= ck + r; k++) {
          if (k < 0 || k >= dims[2]) continue;
          for (let j = cj - r; j <= cj + r; j++) {
            if (j < 0 || j >= dims[1]) continue;
            const edge = k === ck - r || k === ck + r || j === cj - r || j === cj + r, row = (k * dims[1] + j) * dims[0];
            for (let i = ci - r; i <= ci + r; i += edge ? 1 : 2 * r || 1) {
              if (i < 0 || i >= dims[0]) continue;
              const c = row + i;
              for (let q = start[c]; q < start[c + 1]; q++) { const s = items[q]; const d2 = (px[3 * s] - x) ** 2 + (px[3 * s + 1] - y) ** 2 + (px[3 * s + 2] - z) ** 2; if (d2 < bd) { bd = d2; best = s; } }
            }
          }
        }
        if (best >= 0 && bd <= (r * cs) * (r * cs)) break;
      }
      if (best < 0) continue;
      const sd = (x - px[3 * best]) * nx[3 * best] + (y - px[3 * best + 1]) * nx[3 * best + 1] + (z - px[3 * best + 2]) * nx[3 * best + 2];
      dir[3 * v] = nx[3 * best]; dir[3 * v + 1] = nx[3 * best + 1]; dir[3 * v + 2] = nx[3 * best + 2]; hasDir[v] = 1;
      if (sd < o.marginMm) { need[v] = o.marginMm - sd; any = true; }
    }
    if (!any) continue;
    // Spread over the sheet thickness: each vertex takes the largest push found within spreadMm on this muscle (a dense
    // grid of spreadMm cells over the muscle's box; every pushed vertex raises the vertices near it).
    const sc = o.spreadMm, sc2 = sc * sc, sd3 = [0, 1, 2].map(k => Math.max(1, Math.ceil((bb.max[k] - bb.min[k]) / sc) + 1));
    const scell = v => ((Math.floor((p[3 * v + 2] - bb.min[2]) / sc) * sd3[1]) + Math.floor((p[3 * v + 1] - bb.min[1]) / sc)) * sd3[0] + Math.floor((p[3 * v] - bb.min[0]) / sc);
    const sN = sd3[0] * sd3[1] * sd3[2], sStart = new Int32Array(sN + 1);
    for (let v = 0; v < n; v++) sStart[scell(v) + 1]++;
    for (let c = 0; c < sN; c++) sStart[c + 1] += sStart[c];
    const sFill = sStart.slice(0, sN), sItems = new Int32Array(n);
    for (let v = 0; v < n; v++) sItems[sFill[scell(v)]++] = v;
    const push = Float32Array.from(need);
    for (let u = 0; u < n; u++) {
      if (!(need[u] > 0)) continue;
      const x = p[3 * u], y = p[3 * u + 1], z = p[3 * u + 2];
      const ci = Math.floor((x - bb.min[0]) / sc), cj = Math.floor((y - bb.min[1]) / sc), ck = Math.floor((z - bb.min[2]) / sc);
      for (let k = Math.max(0, ck - 1); k <= Math.min(sd3[2] - 1, ck + 1); k++) for (let j = Math.max(0, cj - 1); j <= Math.min(sd3[1] - 1, cj + 1); j++) {
        const row = (k * sd3[1] + j) * sd3[0];
        for (let i = Math.max(0, ci - 1); i <= Math.min(sd3[0] - 1, ci + 1); i++) {
          const c = row + i;
          for (let q = sStart[c]; q < sStart[c + 1]; q++) {
            const v = sItems[q];
            if (push[v] < need[u] && (p[3 * v] - x) ** 2 + (p[3 * v + 1] - y) ** 2 + (p[3 * v + 2] - z) ** 2 <= sc2) push[v] = need[u];
          }
        }
      }
    }
    // Ramp out over a few rings and smooth the direction (never below the push a vertex needs).
    const ix = m.indices, sum = new Float32Array(n), cnt = new Float32Array(n), ds = new Float32Array(3 * n);
    for (let pass = 0; pass < o.rampPasses; pass++) {
      sum.fill(0); cnt.fill(0); ds.fill(0);
      for (let t = 0; t + 2 < ix.length; t += 3) {
        const a = ix[t], b = ix[t + 1], c = ix[t + 2];
        sum[a] += push[b] + push[c]; sum[b] += push[a] + push[c]; sum[c] += push[a] + push[b]; cnt[a] += 2; cnt[b] += 2; cnt[c] += 2;
        const ax = dir[3 * a], ay = dir[3 * a + 1], az = dir[3 * a + 2], bx = dir[3 * b], by = dir[3 * b + 1], bz = dir[3 * b + 2], cx = dir[3 * c], cy = dir[3 * c + 1], cz = dir[3 * c + 2];
        ds[3 * a] += bx + cx; ds[3 * a + 1] += by + cy; ds[3 * a + 2] += bz + cz;
        ds[3 * b] += ax + cx; ds[3 * b + 1] += ay + cy; ds[3 * b + 2] += az + cz;
        ds[3 * c] += ax + bx; ds[3 * c + 1] += ay + by; ds[3 * c + 2] += az + bz;
      }
      for (let v = 0; v < n; v++) {
        if (cnt[v] > 0) push[v] = Math.max(push[v], 0.5 * push[v] + 0.5 * sum[v] / cnt[v]);
        const dx = dir[3 * v] + ds[3 * v], dy = dir[3 * v + 1] + ds[3 * v + 1], dz = dir[3 * v + 2] + ds[3 * v + 2], l = Math.hypot(dx, dy, dz);
        if (l > 0) { dir[3 * v] = dx / l; dir[3 * v + 1] = dy / l; dir[3 * v + 2] = dz / l; hasDir[v] = 1; }
      }
    }
    const q = new Float32Array(p);
    let moved = 0, mx = 0;
    for (let v = 0; v < n; v++) {
      let d = push[v];
      if (!(d > 1e-4) || !hasDir[v]) continue;
      if (d > o.maxPushMm) { d = o.maxPushMm; capped++; }
      q[3 * v] += d * dir[3 * v]; q[3 * v + 1] += d * dir[3 * v + 1]; q[3 * v + 2] += d * dir[3 * v + 2];
      moved++; if (d > mx) mx = d;
    }
    if (!moved) continue;
    out.set(id, q);
    byId[id] = { vertices: moved, of: n, maxPushMm: Math.round(mx * 100) / 100 };
    movedTotal += moved; if (mx > maxPush) maxPush = mx;
  }
  const ms = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
  return { positions: out, report: { muscles: out.size, vertices: movedTotal, maxPushMm: Math.round(maxPush * 100) / 100, capped, ms: Math.round(ms), byId } };
}

// ---------------------------------------------------------------------------------------------------------------------
// BEGIN GENERATED DATA (U3b-body generator over packet bodyparts3d-fullbody-r1; regenerate, do not hand-edit)
// Source: inputs/FULLBODY-MESH-MANIFEST.json sha256 5b0cbbf880ddd053e761a0a967cbbc924aca135263961b3ad4b036b1d27c6406 and its 294 meshes,
// parsed with ns-obj parseObj and passed through buildBodyRig (geometry path). REFERENCE_JOINTS holds the geometric
// estimates (axes are re-derived at build time); REFERENCE_MUSCLE_BLENDS the aggregate distance-rule blends;
// FULLBODY_MUSCLE_CATALOG [id, lower-case source name, laterality, centroid y mm] for every muscle mesh.
export const REFERENCE_MANIFEST_SHA256 = '5b0cbbf880ddd053e761a0a967cbbc924aca135263961b3ad4b036b1d27c6406';
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
  r_mtp: {"point":[-130.596,-164.655,-59.33],"axis":[-0.817,0.568,-0.103],"rays":{"first":{"point":[-93.647,-181.901,-55.696],"method":"sphere-fit"},"second":{"point":[-115.83,-178.378,-56.998],"method":"sphere-fit"},"third":{"point":[-126.906,-172.479,-58.592],"method":"sphere-fit"},"fourth":{"point":[-135.426,-161.027,-59.665],"method":"sphere-fit"},"fifth":{"point":[-144.222,-146.737,-62.066],"method":"sphere-fit"}},"method":"mean of the second to fifth metatarsal-head joint centres (the lesser toes); axis from the first to the fifth (metatarsal break)","bones":["right first metatarsal bone","right second metatarsal bone","right third metatarsal bone","right fourth metatarsal bone","right fifth metatarsal bone"]},
  r_hallux_mtp: {"point":[-93.647,-181.901,-55.696],"axis":[-0.817,0.568,-0.103],"method":"first metatarsal-head joint centre (big toe); axis along the metatarsal break (first to fifth head)","bones":["right first metatarsal bone","proximal phalanx of right big toe"]},
  l_hip: {"point":[88.41,-79.133,813.75],"radius":22.348,"rms":0.565,"inliers":79,"method":"sphere-fit of the femoral head (seeded from the acetabular contact patch)","gapMm":0.433,"bones":["left femur","left hip bone"]},
  l_knee: {"point":[74.443,-78.594,392.079],"axis":[-0.996,0.074,0.043],"radius":22.301,"rms":6.099,"inliers":278,"method":"circle-fit-about-transepicondylar-axis (femoral condyles, distal 35 mm, inferior/posterior-facing normals)","epicondyles":{"medial":[33.567,-73.067,399.367],"lateral":[111.257,-78.823,396.018]},"bones":["left femur"]},
  l_ankle: {"point":[75.853,-71.348,-14.173],"axis":[0.767,0.548,-0.335],"malleoli":{"medial":[54.332,-86.722,-4.768],"lateral":[97.375,-55.974,-23.578]},"method":"midpoint of the malleolus tips (tibia and fibula lowest 3 mm); talocrural axis through them","bones":["left tibia","left fibula"]},
  l_mtp: {"point":[129.561,-164.866,-58.361],"axis":[0.815,0.57,-0.107],"rays":{"first":{"point":[93.712,-182.173,-55.506],"method":"sphere-fit"},"second":{"point":[114.499,-180.165,-58.926],"method":"sphere-fit"},"third":{"point":[126.212,-172.27,-57.602],"method":"sphere-fit"},"fourth":{"point":[133.236,-160.254,-54.754],"method":"sphere-fit"},"fifth":{"point":[144.297,-146.774,-62.163],"method":"sphere-fit"}},"method":"mean of the second to fifth metatarsal-head joint centres (the lesser toes); axis from the first to the fifth (metatarsal break)","bones":["left first metatarsal bone","left second metatarsal bone","left third metatarsal bone","left fourth metatarsal bone","left fifth metatarsal bone"]},
  l_hallux_mtp: {"point":[93.712,-182.173,-55.506],"axis":[0.815,0.57,-0.107],"method":"first metatarsal-head joint centre (big toe); axis along the metatarsal break (first to fifth head)","bones":["left first metatarsal bone","proximal phalanx of left big toe"]}
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

// ---------------------------------------------------------------------------------------------------------------------
// BEGIN GENERATED LAYER DATA (R5-body layers-gen.mjs; regenerate, do not hand-edit)
// Source: classify.mjs over inputs/FULLBODY-MESH-MANIFEST.json sha256 5b0cbbf880ddd053e761a0a967cbbc924aca135263961b3ad4b036b1d27c6406 and inputs/MESH-MANIFEST.json
// sha256 b01fc738dbc3e3c7fb31faf46550a6e3c3bb3263da46f40bdbddb3239f89b529; 128 directions, 1 mm pixels, source pose. Rule and sizes: BODY_LAYER_RULE.
// Historical producer display data, NOT anatomical qualification. BODY_LAYER_TABLE: id -> [unit, piece topExposure].
// BODY_LAYER_UNITS: unit -> [producer display code s|d, textbook, unit score, volume cm3,
//   offset mm, outer normal (source frame), peel hinge (mm), peel axis, peel deg at peel 1] (geometry null for deep units).
export const BODY_LAYER_TABLE = deepFreezeRig({
  FJ1466M: ["left abductor digiti minimi of hand",0.9976],
  FJ1483M: ["left abductor pollicis brevis",0.9763],
  FJ1484M: ["left abductor pollicis longus",0.3387],
  FJ1403M: ["left adductor magnus",0.4297],
  FJ1481M: ["left adductor pollicis",0.4135],
  FJ1515M: ["left adductor pollicis",0.3284],
  FJ1485M: ["left anconeus",0.9848],
  FJ1478M: ["left biceps brachii",0.7409],
  FJ1512M: ["left biceps brachii",0.6787],
  FJ1395M: ["left biceps femoris",0.9366],
  FJ1444M: ["left biceps femoris (short head)",0.224],
  FJ1486M: ["left brachialis",0.385],
  FJ1487M: ["left brachioradialis",0.9694],
  FJ1488M: ["left coracobrachialis",0.1132],
  FJ1467M: ["left deltoid",0.988],
  FJ1468M: ["left deltoid",0.9775],
  FJ1513M: ["left deltoid",0.8985],
  FJ1555: ["left digastric",0.6046],
  FJ1560: ["left digastric",0.5827],
  FJ1578: ["left digastric",0.5096],
  FJ1509M: ["left dorsal interossei of hand",0.8347],
  FJ1489M: ["left extensor carpi radialis brevis",0.4168],
  FJ1490M: ["left extensor carpi radialis longus",0.931],
  FJ1472M: ["left extensor carpi ulnaris",0.7673],
  FJ1517M: ["left extensor carpi ulnaris",0.0843],
  FJ1491M: ["left extensor digiti minimi",0.472],
  FJ1492M: ["left extensor digitorum",0.9948],
  FJ1406M: ["left extensor digitorum longus",0.9053],
  FJ1408M: ["left extensor hallucis longus",0.4867],
  FJ1493M: ["left extensor indicis",0.3618],
  FJ1494M: ["left extensor pollicis brevis",0.5209],
  FJ1495M: ["left extensor pollicis longus",0.3572],
  FJ1452M: ["left external oblique",0.9617],
  FJ1496M: ["left flexor carpi radialis",0.8921],
  FJ1473M: ["left flexor carpi ulnaris",0.8279],
  FJ1518M: ["left flexor carpi ulnaris",0.8985],
  FJ1470M: ["left flexor digiti minimi brevis of hand",0.6252],
  FJ1414M: ["left flexor digitorum longus",0.6281],
  FJ1497M: ["left flexor digitorum profundus",0.126],
  FJ1475M: ["left flexor digitorum superficialis",0.2665],
  FJ1499M: ["left flexor digitorum superficialis",0.5174],
  FJ1415M: ["left flexor hallucis longus",0.4497],
  FJ1514M: ["left flexor pollicis brevis",0.8522],
  FJ1498M: ["left flexor pollicis longus",0.3598],
  FJ1397M: ["left gastrocnemius",0.923],
  FJ1394M: ["left gastrocnemius",0.9433],
  FJ1559: ["left geniohyoid",0.3356],
  FJ1418M: ["left gluteus maximus",0.975],
  FJ1419M: ["left gluteus medius",0.6611],
  FJ1422M: ["left iliacus",0.2626],
  FJ1500M: ["left infraspinatus",0.3785],
  FJ1532M: ["left levator scapulae",0.1815],
  FJ1510M: ["left lumbricals of hand",0.3478],
  FJ1562: ["left mylohyoid",0.3949],
  FJ1482M: ["left opponens digiti minimi of hand",0.446],
  FJ1501M: ["left opponens pollicis",0.5398],
  FJ1511M: ["left palmar interossei of hand",0.1477],
  FJ1502M: ["left palmaris longus",0.9709],
  FJ1447M: ["left pectoralis major",0.7524],
  FJ1464M: ["left pectoralis major",0.8835],
  FJ1446M: ["left pectoralis major",0.2737],
  FJ1503M: ["left pronator quadratus",0.3368],
  FJ1474M: ["left pronator teres",0.5187],
  FJ1516M: ["left pronator teres (ulnar head)",0.0187],
  FJ1431M: ["left psoas major",0.2773],
  FJ1433M: ["left rectus femoris",0.8439],
  FJ1434M: ["left sartorius",0.9639],
  FJ1435M: ["left semimembranosus",0.4858],
  FJ1436M: ["left semitendinosus",0.8971],
  FJ1459M: ["left serratus anterior",0.4425],
  FJ1437M: ["left soleus",0.3842],
  FJ1573: ["left sternocleidomastoid",0.9196],
  FJ1504M: ["left subscapularis",0.0239],
  FJ1505M: ["left supinator",0.0024],
  FJ1506M: ["left supraspinatus",0.0105],
  FJ1507M: ["left teres major",0.6646],
  FJ1508M: ["left teres minor",0.246],
  FJ1439M: ["left tibialis anterior",0.9454],
  FJ1521M: ["left trapezius",0.8731],
  FJ1554M: ["left trapezius",0.8074],
  FJ1520M: ["left trapezius",0.9533],
  FJ1477M: ["left triceps brachii",0.7754],
  FJ1479M: ["left triceps brachii",0.831],
  FJ1480M: ["left triceps brachii (medial head)",0.2038],
  FJ1441M: ["left vastus intermedius",0.0142],
  FJ1442M: ["left vastus lateralis",0.9318],
  FJ1443M: ["left vastus medialis",0.6789],
  FJ1466: ["right abductor digiti minimi of hand",0.996],
  FJ1483: ["right abductor pollicis brevis",0.9768],
  FJ1484: ["right abductor pollicis longus",0.3379],
  FJ1403: ["right adductor magnus",0.427],
  FJ1481: ["right adductor pollicis",0.4093],
  FJ1515: ["right adductor pollicis",0.3343],
  FJ1485: ["right anconeus",0.9854],
  FJ1478: ["right biceps brachii",0.7401],
  FJ1512: ["right biceps brachii",0.6833],
  FJ1395: ["right biceps femoris",0.9354],
  FJ1444: ["right biceps femoris (short head)",0.2242],
  FJ1486: ["right brachialis",0.386],
  FJ1487: ["right brachioradialis",0.9688],
  FJ1488: ["right coracobrachialis",0.1243],
  FJ1467: ["right deltoid",0.9889],
  FJ1468: ["right deltoid",0.9789],
  FJ1513: ["right deltoid",0.8983],
  FJ1556: ["right digastric",0.5763],
  FJ1579: ["right digastric",0.5337],
  FJ1509: ["right dorsal interossei of hand",0.8389],
  FJ1489: ["right extensor carpi radialis brevis",0.4131],
  FJ1490: ["right extensor carpi radialis longus",0.9319],
  FJ1472: ["right extensor carpi ulnaris",0.769],
  FJ1517: ["right extensor carpi ulnaris",0.0811],
  FJ1491: ["right extensor digiti minimi",0.4712],
  FJ1492: ["right extensor digitorum",0.9949],
  FJ1406: ["right extensor digitorum longus",0.9035],
  FJ1408: ["right extensor hallucis longus",0.4814],
  FJ1493: ["right extensor indicis",0.3659],
  FJ1494: ["right extensor pollicis brevis",0.5213],
  FJ1495: ["right extensor pollicis longus",0.3547],
  FJ1452: ["right external oblique",0.9634],
  FJ1496: ["right flexor carpi radialis",0.8922],
  FJ1473: ["right flexor carpi ulnaris",0.8263],
  FJ1518: ["right flexor carpi ulnaris",0.8938],
  FJ1470: ["right flexor digiti minimi brevis of hand",0.6272],
  FJ1414: ["right flexor digitorum longus",0.6272],
  FJ1497: ["right flexor digitorum profundus",0.1264],
  FJ1475: ["right flexor digitorum superficialis",0.2639],
  FJ1499: ["right flexor digitorum superficialis",0.5173],
  FJ1415: ["right flexor hallucis longus",0.454],
  FJ1514: ["right flexor pollicis brevis",0.8489],
  FJ1498: ["right flexor pollicis longus",0.3578],
  FJ1397: ["right gastrocnemius",0.9202],
  FJ1394: ["right gastrocnemius",0.9444],
  FJ1580: ["right geniohyoid",0.3618],
  FJ1418: ["right gluteus maximus",0.9745],
  FJ1419: ["right gluteus medius",0.6608],
  FJ1422: ["right iliacus",0.2629],
  FJ1500: ["right infraspinatus",0.3779],
  FJ1510: ["right lumbricals of hand",0.3459],
  FJ1583: ["right mylohyoid",0.3917],
  FJ1482: ["right opponens digiti minimi of hand",0.4298],
  FJ1501: ["right opponens pollicis",0.5468],
  FJ1511: ["right palmar interossei of hand",0.146],
  FJ1502: ["right palmaris longus",0.9715],
  FJ1447: ["right pectoralis major",0.7485],
  FJ1464: ["right pectoralis major",0.8832],
  FJ1446: ["right pectoralis major",0.2759],
  FJ1503: ["right pronator quadratus",0.3352],
  FJ1474: ["right pronator teres",0.5182],
  FJ1516: ["right pronator teres (ulnar head)",0.0191],
  FJ1431: ["right psoas major",0.2715],
  FJ1433: ["right rectus femoris",0.844],
  FJ1434: ["right sartorius",0.9654],
  FJ1435: ["right semimembranosus",0.4822],
  FJ1436: ["right semitendinosus",0.8929],
  FJ1459: ["right serratus anterior",0.45],
  FJ1437: ["right soleus",0.3842],
  FJ1595: ["right sternocleidomastoid",0.9179],
  FJ1504: ["right subscapularis",0.0296],
  FJ1505: ["right supinator",0.0029],
  FJ1506: ["right supraspinatus",0.0098],
  FJ1507: ["right teres major",0.672],
  FJ1508: ["right teres minor",0.2463],
  FJ1439: ["right tibialis anterior",0.9453],
  FJ1521: ["right trapezius",0.8737],
  FJ1554: ["right trapezius",0.8086],
  FJ1520: ["right trapezius",0.9536],
  FJ1479: ["right triceps brachii",0.8289],
  FJ1477: ["right triceps brachii",0.7717],
  FJ1480: ["right triceps brachii (medial head)",0.216],
  FJ1441: ["right vastus intermedius",0.0144],
  FJ1442: ["right vastus lateralis",0.9333],
  FJ1443: ["right vastus medialis",0.6794]
});
export const BODY_LAYER_UNITS = deepFreezeRig({
  "left abductor digiti minimi of hand": ["s","S",0.9976,1.78,3,[-0.646,-0.7377,0.1959],[233.8,-133.8,794.4],[-0.753,0.658,-0.0053],2.59],
  "left abductor pollicis brevis": ["s","S",0.9763,1.82,3,[0.1035,-0.7662,0.6342],[262.5,-129,809.2],[-0.7615,-0.4712,-0.445],2.84],
  "left abductor pollicis longus": ["d","D",0.3387,15.94,0,null,null,null,0],
  "left adductor magnus": ["d","D",0.4297,481.26,0,null,null,null,0],
  "left adductor pollicis": ["d","D",0.3549,4.23,0,null,null,null,0],
  "left anconeus": ["s","S",0.9848,7.46,3,[-0.0985,0.9771,-0.1884],[222,-43.7,1059.8],[0.9925,0.0827,-0.0902],1.67],
  "left biceps brachii": ["s","S",0.7117,169.47,8.3,[-0.0898,-0.9949,-0.0451],[150.9,-93.3,1337.9],[-0.9719,0.0974,-0.2145],1.35],
  "left biceps femoris": ["s","S",0.9366,473.75,11.7,[0.451,0.8924,-0.0124],[71.1,-36.4,766.2],[0.8868,-0.4465,0.1195],1.52],
  "left biceps femoris (short head)": ["d","D",0.224,67.82,0,null,null,null,0],
  "left brachialis": ["d","D",0.385,76.72,0,null,null,null,0],
  "left brachioradialis": ["s","S",0.9694,79.09,6.4,[0.7491,-0.6073,0.2646],[221.9,-60.6,1150.4],[-0.6351,-0.772,0.026],1.05],
  "left coracobrachialis": ["d","D",0.1132,21.05,0,null,null,null,0],
  "left deltoid": ["s","S",0.9461,318.42,10.2,[0.8979,0.0355,0.4388],[108.9,-65.6,1355.4],[0.0131,-0.9985,0.0541],3.08],
  "left digastric": ["s","S",0.5357,3.09,3,[0.3703,0.0781,-0.9256],[0.4,-146.7,1419.3],[-0.7053,0.6721,-0.2255],1.4],
  "left dorsal interossei of hand": ["d","D",0.8347,4.07,0,null,null,null,0],
  "left extensor carpi radialis brevis": ["s","S",0.4168,19.77,4.1,[0.6241,0.7768,-0.0843],[234,-48.4,1077.5],[0.7714,-0.5954,0.2245],0.76],
  "left extensor carpi radialis longus": ["s","S",0.931,25.28,4.4,[0.8973,0.4348,0.0765],[234.8,-51.4,1102.7],[0.4076,-0.8824,0.2349],0.76],
  "left extensor carpi ulnaris": ["s","S",0.5253,16.61,3.8,[-0.4991,0.8179,-0.2862],[218.9,-42.3,1055.9],[0.8638,0.4957,-0.09],0.73],
  "left extensor digiti minimi": ["s","S",0.472,6.71,3,[-0.0509,0.9498,-0.3086],[233.8,-45.5,1047.1],[0.9986,0.0532,-0.001],0.51],
  "left extensor digitorum": ["s","S",0.9948,29.12,4.6,[0.1406,0.9459,-0.2923],[231.1,-32.8,1053.5],[0.986,-0.107,0.1281],0.66],
  "left extensor digitorum longus": ["s","S",0.9053,38.84,5.1,[0.9449,-0.0252,0.3264],[99.1,-54.9,349.5],[-0.114,-0.96,0.2558],0.66],
  "left extensor hallucis longus": ["d","D",0.4867,7.25,0,null,null,null,0],
  "left extensor indicis": ["d","D",0.3618,3.02,0,null,null,null,0],
  "left extensor pollicis brevis": ["d","D",0.5209,3.67,0,null,null,null,0],
  "left extensor pollicis longus": ["d","D",0.3572,4.99,0,null,null,null,0],
  "left external oblique": ["s","S",0.9617,263.63,9.6,[0.4223,-0.8723,-0.2464],[86.1,-179.1,1213.8],[-0.8871,-0.4536,0.0854],1.29],
  "left flexor carpi radialis": ["s","S",0.8921,21.96,4.2,[0.2162,-0.9421,0.2565],[186.7,-82.2,1059.8],[-0.9367,-0.2742,-0.2177],0.82],
  "left flexor carpi ulnaris": ["s","S",0.8604,46.38,5.4,[-0.9063,0.3203,-0.2758],[179.7,-56.9,1046.3],[0.3728,0.9132,-0.1645],1.11],
  "left flexor digiti minimi brevis of hand": ["s","S",0.6252,0.65,3,[-0.4231,-0.8183,0.3891],[242.1,-132.7,792.5],[-0.8645,0.4931,0.0971],2.68],
  "left flexor digitorum longus": ["d","D",0.6281,43.53,0,null,null,null,0],
  "left flexor digitorum profundus": ["d","D",0.126,53.97,0,null,null,null,0],
  "left flexor digitorum superficialis": ["d","I",0.3356,64.44,0,null,null,null,0],
  "left flexor hallucis longus": ["d","D",0.4497,53.85,0,null,null,null,0],
  "left flexor pollicis brevis": ["s","S",0.8522,0.96,3,[-0.3085,-0.9509,0.0232],[258.8,-138.3,792.9],[-0.4716,0.1317,-0.8719],3.27],
  "left flexor pollicis longus": ["d","D",0.3598,5.45,0,null,null,null,0],
  "left gastrocnemius": ["s","S",0.9323,521.1,12.1,[-0.4445,0.8765,0.1849],[76.5,-62,433.4],[0.8922,0.4516,0.0042],2.22],
  "left geniohyoid": ["d","D",0.3356,0.58,0,null,null,null,0],
  "left gluteus maximus": ["s","S",0.975,355.15,10.6,[0.4408,0.8976,-0.0083],[30.2,-2.7,907.3],[0.7581,-0.3673,0.5389],2.35],
  "left gluteus medius": ["s","I",0.6611,210.18,8.9,[0.9362,-0.3509,0.0183],[94.4,-56.7,950.7],[-0.3465,-0.9306,-0.1176],3.01],
  "left iliacus": ["d","D",0.2626,121.25,0,null,null,null,0],
  "left infraspinatus": ["d","D",0.3785,106.32,0,null,null,null,0],
  "left levator scapulae": ["d","D",0.1815,12.97,0,null,null,null,0],
  "left lumbricals of hand": ["d","I",0.3478,2.31,0,null,null,null,0],
  "left mylohyoid": ["d","I",0.3949,1.85,0,null,null,null,0],
  "left opponens digiti minimi of hand": ["d","D",0.446,0.98,0,null,null,null,0],
  "left opponens pollicis": ["d","D",0.5398,2.02,0,null,null,null,0],
  "left palmar interossei of hand": ["d","D",0.1477,0.85,0,null,null,null,0],
  "left palmaris longus": ["s","S",0.9709,15.74,3.8,[-0.2669,-0.9539,0.1375],[181.9,-81.9,1055.7],[-0.9344,0.2212,-0.2794],0.64],
  "left pectoralis major": ["s","S",0.7713,467.1,11.6,[0.4331,-0.8171,0.3805],[13.6,-227.7,1180.3],[0.6503,-0.009,-0.7596],2.8],
  "left pronator quadratus": ["d","D",0.3368,6.55,0,null,null,null,0],
  "left pronator teres": ["s","S",0.5187,12.14,3.4,[0.0039,-0.9886,0.1506],[191,-82.1,1066.7],[-0.894,-0.0709,-0.4425],1.19],
  "left pronator teres (ulnar head)": ["d","D",0.0187,4.94,0,null,null,null,0],
  "left psoas major": ["d","D",0.2773,172.93,0,null,null,null,0],
  "left rectus femoris": ["s","S",0.8439,345.6,10.5,[0.3178,-0.9477,0.0285],[127.1,-110.8,870.3],[-0.9456,-0.3146,0.0833],1.08],
  "left sartorius": ["s","S",0.9639,69.01,6.2,[-0.1914,-0.9806,-0.0418],[113.8,-131.9,903.3],[-0.9739,0.1844,0.1324],0.56],
  "left semimembranosus": ["d","I",0.4858,320.13,0,null,null,null,0],
  "left semitendinosus": ["s","S",0.8971,131.48,7.6,[-0.4776,0.8778,-0.0362],[45.4,-32,762.8],[0.8785,0.4765,-0.0345],0.9],
  "left serratus anterior": ["d","I",0.4425,141.97,0,null,null,null,0],
  "left soleus": ["d","I",0.3842,317.83,0,null,null,null,0],
  "left sternocleidomastoid": ["s","S",0.9196,47.06,5.4,[0.9241,-0.3679,0.1032],[18.3,-153.6,1300.3],[0.371,0.7993,-0.4728],1.32],
  "left subscapularis": ["d","D",0.0239,46.49,0,null,null,null,0],
  "left supinator": ["d","D",0.0024,11.29,0,null,null,null,0],
  "left supraspinatus": ["d","D",0.0105,33.64,0,null,null,null,0],
  "left teres major": ["s","I",0.6646,37.44,5,[0.6316,0.6503,-0.4221],[169.1,-77.4,1274],[0.1473,-0.6352,-0.7582],2.08],
  "left teres minor": ["d","D",0.246,32.78,0,null,null,null,0],
  "left tibialis anterior": ["s","S",0.9454,110.91,7.2,[0.7447,-0.6652,-0.0536],[107.9,-78.2,353.2],[-0.6517,-0.7422,0.1567],1.04],
  "left trapezius": ["s","S",0.8994,259.76,9.6,[0.3602,0.744,0.5627],[59.5,-37.4,1500.6],[0.9275,-0.3501,-0.1309],1.22],
  "left triceps brachii": ["s","S",0.8035,263.14,9.6,[0.0156,0.9993,-0.0352],[162.4,-49.7,1303.4],[0.9767,-0.0077,0.2144],2.03],
  "left triceps brachii (medial head)": ["d","D",0.2038,64.15,0,null,null,null,0],
  "left vastus intermedius": ["d","D",0.0142,251.33,0,null,null,null,0],
  "left vastus lateralis": ["s","S",0.9318,500.32,11.9,[0.975,0.1864,-0.121],[143,-85.3,784.8],[0.1928,-0.9803,0.0435],1.45],
  "left vastus medialis": ["s","S",0.6789,277.27,9.8,[-0.8409,-0.5397,0.0388],[94,-110.3,739.7],[-0.5393,0.8418,0.0212],1.41],
  "right abductor digiti minimi of hand": ["s","S",0.996,1.78,3,[0.5859,-0.7867,0.1947],[-233.8,-133.8,794.4],[-0.8005,-0.5992,-0.0124],2.59],
  "right abductor pollicis brevis": ["s","S",0.9768,1.82,3,[-0.0779,-0.7701,0.6332],[-262.5,-129,809.1],[-0.7632,0.4547,0.4592],2.84],
  "right abductor pollicis longus": ["d","D",0.3379,15.94,0,null,null,null,0],
  "right adductor magnus": ["d","D",0.427,484.53,0,null,null,null,0],
  "right adductor pollicis": ["d","D",0.3577,4.22,0,null,null,null,0],
  "right anconeus": ["s","S",0.9854,7.46,3,[0.0939,0.9779,-0.1866],[-222,-43.7,1059.8],[0.9929,-0.0783,0.0895],1.67],
  "right biceps brachii": ["s","S",0.7135,169.46,8.3,[0.1407,-0.9892,-0.0414],[-150.9,-93.4,1337.9],[-0.9663,-0.1463,0.2117],1.35],
  "right biceps femoris": ["s","S",0.9354,475.54,11.7,[-0.452,0.892,-0.0078],[-71.1,-36.4,766.2],[0.886,0.4479,-0.1195],1.52],
  "right biceps femoris (short head)": ["d","D",0.2242,68.6,0,null,null,null,0],
  "right brachialis": ["d","D",0.386,76.71,0,null,null,null,0],
  "right brachioradialis": ["s","S",0.9688,79.1,6.4,[-0.7495,-0.6069,0.2645],[-221.9,-60.6,1150.4],[-0.6346,0.7724,-0.0262],1.05],
  "right coracobrachialis": ["d","D",0.1243,21.05,0,null,null,null,0],
  "right deltoid": ["s","S",0.9466,318.43,10.2,[-0.8851,0.0567,0.462],[-108.8,-65.5,1355.4],[0.0281,0.9972,-0.0687],3.08],
  "right digastric": ["s","S",0.5441,3.06,3,[-0.5378,-0.1151,-0.8352],[-2.8,-150,1421.4],[-0.5388,-0.715,0.4454],1.39],
  "right dorsal interossei of hand": ["d","D",0.8389,4.07,0,null,null,null,0],
  "right extensor carpi radialis brevis": ["s","S",0.4131,19.77,4.1,[-0.6436,0.7612,-0.0802],[-234,-48.4,1077.5],[0.7554,0.6148,-0.2267],0.76],
  "right extensor carpi radialis longus": ["s","S",0.9319,25.28,4.4,[-0.905,0.4168,0.0853],[-234.9,-51.4,1102.7],[0.3884,0.8913,-0.2339],0.76],
  "right extensor carpi ulnaris": ["s","S",0.5253,16.61,3.8,[0.4819,0.8257,-0.2932],[-218.9,-42.3,1055.9],[0.8734,-0.4796,0.0851],0.73],
  "right extensor digiti minimi": ["s","S",0.4712,6.71,3,[0.0445,0.9501,-0.3087],[-233.8,-45.4,1047.1],[0.9989,-0.0469,-0.0005],0.51],
  "right extensor digitorum": ["s","S",0.9949,29.12,4.6,[-0.1448,0.9446,-0.2947],[-231.1,-32.8,1053.5],[0.9854,0.1107,-0.1292],0.66],
  "right extensor digitorum longus": ["s","S",0.9035,39.31,5.1,[-0.9382,-0.0395,0.3439],[-99.1,-54.9,349.6],[-0.1333,0.9581,-0.2536],0.66],
  "right extensor hallucis longus": ["d","D",0.4814,7.34,0,null,null,null,0],
  "right extensor indicis": ["d","D",0.3659,3.02,0,null,null,null,0],
  "right extensor pollicis brevis": ["d","D",0.5213,3.67,0,null,null,null,0],
  "right extensor pollicis longus": ["d","D",0.3547,4.99,0,null,null,null,0],
  "right external oblique": ["s","S",0.9634,263.57,9.6,[-0.4323,-0.8674,-0.2465],[-86.1,-179.1,1213.8],[-0.882,0.4636,-0.0845],1.29],
  "right flexor carpi radialis": ["s","S",0.8922,21.96,4.2,[-0.1686,-0.9535,0.2499],[-186.7,-82.2,1059.8],[-0.9461,0.2276,0.2302],0.82],
  "right flexor carpi ulnaris": ["s","S",0.8574,46.37,5.4,[0.9095,0.3126,-0.2742],[-179.6,-56.8,1046.3],[0.3651,-0.9159,0.1669],1.11],
  "right flexor digiti minimi brevis of hand": ["s","S",0.6272,0.65,3,[0.401,-0.844,0.3561],[-242.1,-132.7,792.5],[-0.8795,-0.4635,-0.1081],2.68],
  "right flexor digitorum longus": ["d","D",0.6272,44.11,0,null,null,null,0],
  "right flexor digitorum profundus": ["d","D",0.1264,53.97,0,null,null,null,0],
  "right flexor digitorum superficialis": ["d","I",0.3337,64.43,0,null,null,null,0],
  "right flexor hallucis longus": ["d","D",0.454,54.7,0,null,null,null,0],
  "right flexor pollicis brevis": ["s","S",0.8489,0.96,3,[0.259,-0.9604,0.1025],[-258.8,-138.3,792.9],[-0.4995,-0.0423,0.8653],3.27],
  "right flexor pollicis longus": ["d","D",0.3578,5.45,0,null,null,null,0],
  "right gastrocnemius": ["s","S",0.9313,524.54,12.1,[0.4647,0.8674,0.1781],[-76.6,-62,433.4],[0.882,-0.4711,-0.0068],2.22],
  "right geniohyoid": ["d","D",0.3618,0.58,0,null,null,null,0],
  "right gluteus maximus": ["s","S",0.9745,363.88,10.7,[-0.4546,0.8906,0.0125],[-30.2,-2.7,907.3],[0.7472,0.389,-0.5389],2.37],
  "right gluteus medius": ["s","I",0.6608,211.23,8.9,[-0.9332,-0.3592,-0.0088],[-94.4,-56.8,950.7],[-0.3576,0.9261,0.1205],3.01],
  "right iliacus": ["d","D",0.2629,122.59,0,null,null,null,0],
  "right infraspinatus": ["d","D",0.3779,106.28,0,null,null,null,0],
  "right lumbricals of hand": ["d","I",0.3459,2.31,0,null,null,null,0],
  "right mylohyoid": ["d","I",0.3917,1.86,0,null,null,null,0],
  "right opponens digiti minimi of hand": ["d","D",0.4298,0.98,0,null,null,null,0],
  "right opponens pollicis": ["d","D",0.5468,2.02,0,null,null,null,0],
  "right palmar interossei of hand": ["d","D",0.146,0.85,0,null,null,null,0],
  "right palmaris longus": ["s","S",0.9715,15.74,3.8,[0.2658,-0.9546,0.1347],[-182,-81.8,1055.7],[-0.9345,-0.2208,0.2793],0.64],
  "right pectoralis major": ["s","S",0.7708,469.44,11.7,[-0.4322,-0.8418,0.3232],[-13.5,-227.6,1180.6],[0.6298,-0.0253,0.7763],2.82],
  "right pronator quadratus": ["d","D",0.3352,6.55,0,null,null,null,0],
  "right pronator teres": ["s","S",0.5182,12.14,3.4,[0.0383,-0.9923,0.1181],[-191,-82.1,1066.7],[-0.8944,0.0187,0.4469],1.19],
  "right pronator teres (ulnar head)": ["d","D",0.0191,4.94,0,null,null,null,0],
  "right psoas major": ["d","D",0.2715,173.68,0,null,null,null,0],
  "right rectus femoris": ["s","S",0.844,347.63,10.5,[-0.3234,-0.9456,0.035],[-127.1,-110.8,870.3],[-0.9438,0.3197,-0.0833],1.08],
  "right sartorius": ["s","S",0.9654,70.23,6.2,[0.2164,-0.9754,-0.0426],[-113.7,-131.9,903.3],[-0.9688,-0.2091,-0.1328],0.56],
  "right semimembranosus": ["d","I",0.4822,321.34,0,null,null,null,0],
  "right semitendinosus": ["s","S",0.8929,132.76,7.7,[0.478,0.8773,-0.0435],[-45.4,-31.9,762.8],[0.8783,-0.4768,0.0344],0.91],
  "right serratus anterior": ["d","I",0.45,142.23,0,null,null,null,0],
  "right soleus": ["d","I",0.3842,320.47,0,null,null,null,0],
  "right sternocleidomastoid": ["s","S",0.9179,47.06,5.4,[-0.9189,-0.3938,0.0229],[-20.5,-154.2,1300.3],[0.3566,-0.8043,0.4753],1.32],
  "right subscapularis": ["d","D",0.0296,46.49,0,null,null,null,0],
  "right supinator": ["d","D",0.0029,11.3,0,null,null,null,0],
  "right supraspinatus": ["d","D",0.0098,33.65,0,null,null,null,0],
  "right teres major": ["s","I",0.672,37.44,5,[-0.6096,0.6295,-0.4819],[-169.1,-77.4,1274.1],[0.1003,0.6642,0.7408],2.08],
  "right teres minor": ["d","D",0.2463,32.78,0,null,null,null,0],
  "right tibialis anterior": ["s","S",0.9453,112.3,7.2,[-0.7427,-0.6672,-0.0572],[-107.9,-78.2,353.2],[-0.6533,0.7407,-0.1566],1.04],
  "right trapezius": ["s","S",0.9,261.75,9.6,[-0.313,0.7275,0.6106],[-59.5,-37.3,1500.7],[0.9454,0.3004,0.1266],1.22],
  "right triceps brachii": ["s","S",0.8006,263.14,9.6,[0.0119,0.999,-0.0436],[-162.4,-49.7,1303.4],[0.9762,-0.021,-0.2157],2.03],
  "right triceps brachii (medial head)": ["d","D",0.216,64.15,0,null,null,null,0],
  "right vastus intermedius": ["d","D",0.0144,252.22,0,null,null,null,0],
  "right vastus lateralis": ["s","S",0.9333,502.85,11.9,[-0.9755,0.1833,-0.122],[-143,-85.3,784.8],[0.1898,0.9809,-0.0437],1.45],
  "right vastus medialis": ["s","S",0.6794,279.08,9.8,[0.8335,-0.5506,0.0456],[-94.1,-110.3,739.7],[-0.5502,-0.8347,-0.0224],1.41]
});
// END GENERATED LAYER DATA
