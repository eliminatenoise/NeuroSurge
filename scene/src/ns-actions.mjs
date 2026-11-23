/**
 * NeuroSurge POV arm scene: functional-map binding, pose composition and virtual activation dynamics.
 *
 * Scientific limits. Every quantity in this module is a virtual, simulated, unitless display value
 * ("simulated drive", 0..1). Gaze, click, Space and WASD are virtual game-control inputs. Nothing here
 * is a measurement, a recording, real stimulation or neural decoding. The muscle-role display is a
 * qualitative anatomical constraint taken from Root's movement map (representative; cortical regions
 * overlap and vary between people), not fitted physiology. Pulse, rise and decay timings are UI
 * smoothing choices, not physiological latencies or doses.
 *
 * Integration note (see the returned activity API). Two SEPARATE signals per action (A1-activation, round 1):
 *   - POSE DRIVE: `drives(state)` (alias `poseDrives(state)`) is the smoothed commanded drive (rise tau 0.12 s,
 *     decay tau 0.25 s). It is the only drive that may feed `composePose` (and so the signed elbow-angle target
 *     `elbowDeltaDeg`); the arm eases in and relaxes back smoothly, so the arm's return may outlast the pulse.
 *   - DISPLAY ACTIVITY: `displayActivity(state)` is the crisp simulated activity envelope for the cortex colour:
 *     a fast rise (tau 0.035 s, so onset is visible within 100 ms), a hold, and a fade inside the last 0.08 s
 *     of the command, so a 1 s gaze/click pulse shows exactly zero from 1.0 s after its trigger.
 *     `displayDrives(state)` is that envelope plus the display-only WASD/reach linkage (for the strip);
 *     `muscleDisplayDrives(state)` is the same without the A/D share (for `muscleDrives`).
 *   Feeding a display signal into `composePose` would create the reach feedback loop that the design forbids.
 *
 * Clocks (browser-findings repair R2): the activity clock `t`, the 1 s pulse, the Space-release opening
 * window and the drive smoothing all run on ACTUAL elapsed wall time. Each event may carry `at`, its offset
 * in seconds into the step, so a pulse that starts at an input event ends exactly `pulseSeconds` of real
 * time after that event regardless of the frame rate. Pose/motion integration (W/S/A/D) is a separate,
 * capped step owned by ns-app.
 *
 * U1-controls round 2 (see createActivity): activation of ANY BODY_MOTOR_MAP region (ns-bodymap.mjs) by gaze (1 s
 * pulse) and click (re-trigger), left-arm regions driving the arm actions and every other region driving
 * bodyJointTargets, persistent activatedRegions with Reset body, the turn of all four limbs (R558, user Message 40: a
 * double tap of Space = one step, a double tap held = the slow turn, see ns-dance.mjs and ns-controls SPACE_GESTURE;
 * holding or tapping Space grasps, through the 'grasp' event), the brain
 * grab state, the orbit view state, the instructions/pause overlay state and the WASD coordinated joint channels.
 * The left upper limb is represented predominantly in the contralateral (right) hemisphere; region extents are the
 * map owner's representative, overlapping schematic, not a unique cortical point per muscle.
 *
 * Pure (browser and Node; no DOM). Errors: Error('ns:<code>: message').
 */
import { DEG, clamp } from './ns-math.mjs';
import { FIST_POSE_DEG, REST_HAND_POSE_DEG, PRONATION_STATES } from './ns-rig.mjs';
import { DOUBLE_TAP_MS } from './ns-controls.mjs';
import { createDance, observeDance, stepDance, stopDance, startTurnStep, startTurnHold, isDanceState, DANCE_LIMBS, DANCE_LIMB_IDS, DANCE_JOINT_IDS, shoulderTurnRange, shoulderElevationDeg } from './ns-dance.mjs';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// R558 (Space dance): the game arm's palm turn in degrees (ns-rig: +80 palm down .. -80 palm up) for a rotation value
// (0 pronated .. 1 supinated), and back.
const PRONATION_END_DEG = PRONATION_STATES.pronated;
const PRONATION_DEG_AT_VALUE = v => PRONATION_STATES.pronated + (PRONATION_STATES.supinated - PRONATION_STATES.pronated) * v;
// (21 November 2026, SEEMOVE: the game arm's whole palm turn in degrees, and "the forearm is at that end" as a share of it)
const TURN_RANGE_DEG = Math.abs(PRONATION_STATES.supinated - PRONATION_STATES.pronated), TURN_AT_END = 0.02;
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v);

function fail(code, message) {
  throw new Error(`ns:${code}: ${message}`);
}

function deepFreeze(v) {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

/** Plain-data deep copy of parsed JSON (so a binding never aliases its caller's objects). */
const copyJson = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------------------------------------
// Action ids, joints, rest pose, limits and targets
// ---------------------------------------------------------------------------------------------

/** The 12 action ids of movement-map.json, in map order. */
export const MOVEMENT_MAP_ACTION_IDS = Object.freeze([
  'grasp_close', 'relax_release', 'open_hand', 'spread_fingers',
  'wrist_flexion', 'wrist_extension', 'elbow_flexion', 'elbow_extension',
  'index_flexion', 'index_extension', 'thumb_mcp_flexion', 'thumb_mcp_extension'
]);
/** R558 (Messages 14 and 15: as many activation points as possible; the left hand as detailed as the right): game-defined
 * left-hand actions that the pinned MOVEMENT-MAP (r2, sha-pinned in ns-app) does not have. bindMovementMap adds them to
 * the binding with the roles in EXTRA_ARM_ACTIONS (existing muscle_catalog keys only), so every per-action path
 * (targets, drives, display, latch, muscle colours, muscle taps) treats them like the map's own actions. */
export const EXTRA_ARM_ACTION_IDS = Object.freeze([
  // Little, ring, middle: the strip's own order (the right hand's areas run the same way). A tap on a muscle shared by
  // several of these goes to the first action that lists it as a mover, so this order makes a tap on the left
  // lumbricals bend the little finger, as a tap on the right lumbricals does (left-right symmetry, Message 15).
  'fingers_together', 'little_flexion', 'little_extension', 'ring_flexion', 'ring_extension',
  'middle_flexion', 'middle_extension', 'thumb_opposition', 'thumb_reposition',
  'wrist_radial_deviation', 'wrist_ulnar_deviation',
  // 20 November 2026 (BODYMAP; the owner, Message 204: "make sure there's clear movement for each brain activation
  // area"): the left shoulder area moved nothing (the look and W/A/S/D carry the left arm). Its four movements swing the
  // whole left arm at the shoulder on top of where the look and the keys hold it (SHOULDER_ACTION_DEG).
  'shoulder_flexion', 'shoulder_extension', 'shoulder_abduction', 'shoulder_adduction'
]);
/** Every game-arm action id: the movement map's 12, then EXTRA_ARM_ACTION_IDS. */
export const ACTION_IDS = Object.freeze([...MOVEMENT_MAP_ACTION_IDS, ...EXTRA_ARM_ACTION_IDS]);
const roles = (p, r = [], s = []) => ({ primary_drive_increase: p, relative_drive_reduction: r, limited_stabilization_or_posture_dependent: s });
/** Labels and muscle roles (MOVEMENT-MAP muscle_catalog keys) of the game-defined left-hand actions. Standard functions:
 * long finger flexors with the lumbricals bend one finger, the extensors straighten it; palmar interossei bring the
 * fingers together (the spread's antagonists); opponens pollicis and flexor pollicis brevis turn the thumb across the
 * palm, the long thumb extensors take it back out; the radial wrist flexor and extensors bend the wrist toward the
 * thumb, the two ulnar wrist muscles toward the little finger. Simulated display roles, not EMG. */
export const EXTRA_ARM_ACTIONS = deepFreeze({
  fingers_together: { label: 'Bring fingers together', roles: roles(['PI'], ['DI', 'ADM']) },
  middle_flexion: { label: 'Flex middle finger', roles: roles(['FDS', 'FDP', 'LUM'], ['ED'], ['DI']) },
  middle_extension: { label: 'Extend middle finger', roles: roles(['ED'], ['FDS', 'FDP'], ['LUM', 'DI']) },
  ring_flexion: { label: 'Flex ring finger', roles: roles(['FDS', 'FDP', 'LUM'], ['ED'], ['PI', 'DI']) },
  ring_extension: { label: 'Extend ring finger', roles: roles(['ED'], ['FDS', 'FDP'], ['LUM']) },
  little_flexion: { label: 'Flex little finger', roles: roles(['FDS', 'FDP', 'LUM'], ['ED', 'EDM']) },
  little_extension: { label: 'Extend little finger', roles: roles(['ED', 'EDM'], ['FDS', 'FDP']) },
  thumb_opposition: { label: 'Turn thumb across the palm (opposition)', roles: roles(['OP', 'FPB'], ['EPL']) },
  thumb_reposition: { label: 'Move thumb out from the palm', roles: roles(['EPB', 'EPL'], ['OP', 'FPB']) },
  wrist_radial_deviation: { label: 'Bend wrist toward the thumb (radial deviation)', roles: roles(['FCR', 'ECRL', 'ECRB'], ['FCU', 'ECU']) },
  wrist_ulnar_deviation: { label: 'Bend wrist toward the little finger (ulnar deviation)', roles: roles(['FCU', 'ECU'], ['FCR', 'ECRL', 'ECRB']) },
  // (BODYMAP: the shoulder's muscles have no movement-map key; they are lit by name, ns-bodymap's agonist lists, which
  // are the reach keys' own lists, REACH_MUSCLES)
  shoulder_flexion: { label: 'Raise arm forward (shoulder flexion)', roles: roles([]) },
  shoulder_extension: { label: 'Swing arm down and back (shoulder extension)', roles: roles([]) },
  shoulder_abduction: { label: 'Swing arm out to the side (shoulder abduction)', roles: roles([]) },
  shoulder_adduction: { label: 'Swing arm in across the body (shoulder adduction)', roles: roles([]) }
});

const DIGITS = Object.freeze(['index', 'middle', 'ring', 'little']);
const ROLE_KEYS = Object.freeze([
  'primary_drive_increase', 'relative_drive_reduction', 'limited_stabilization_or_posture_dependent'
]);
const REACH_IDS = Object.freeze(['elbow_flexion', 'elbow_extension']);

/** A frozen [lo, hi] range in degrees; `.min` / `.max` are non-enumerable aliases. */
function range(lo, hi) {
  const r = [lo, hi];
  Object.defineProperty(r, 'min', { value: lo, enumerable: false });
  Object.defineProperty(r, 'max', { value: hi, enumerable: false });
  return Object.freeze(r);
}

const limits = {
  wrist_flex: range(-60, 70),
  // 21 November 2026 (SEEMOVE): the thumb's turn goes 15 the other way too (out from the palm), as the right thumb's
  // does (ns-bodymap r_thumb_opp -15 .. 40), for "Move left thumb out from the palm" (thumb_reposition, below)
  thumb_cmc_opp: range(-15, 40),
  thumb_mcp_flex: range(-10, 55),
  // 21 November 2026 (SEEMOVE): the thumb's IP joint extends to 20 (the adult norm), for "Straighten left thumb" (below)
  thumb_ip_flex: range(-20, 70)
};
for (const d of DIGITS) {
  // Repair R2: MCP to 90 and PIP to 105 so the reference-grounded full fist (ns-rig FIST_POSE_DEG) is reachable.
  // (21 November 2026, SEEMOVE, tried and dropped: MCP extension to 30 for the fingers' own "Straighten": see
  // ACTION_TARGETS index_extension)
  limits[`${d}_mcp_flex`] = range(-10, 90);
  limits[`${d}_pip_flex`] = range(0, 105);
  limits[`${d}_dip_flex`] = range(0, 75);
  // Digit 3 (middle) is the abduction reference and is always 0.
  limits[`${d}_mcp_abd`] = d === 'middle' ? range(0, 0) : range(-5, 20);
}
// 21 November 2026 (browser hunt of update 62, H8): the wrist's sideways bend (ns-rig wrist_dev; + toward the thumb,
// radial deviation; - toward the little finger, ulnar deviation), to 20 / 30 degrees: the commonly cited adult active
// ranges (AAOS: radial deviation 0-20, ulnar deviation 0-30; cited from memory, not re-verified here). Display rig only.
limits.wrist_dev = range(-30, 20);

/**
 * Pose joint range limits (degrees). Semantic signs: positive = anatomical flexion, positive
 * abduction = away from digit 3, positive opposition = thumb toward the palm.
 * Each value is a frozen [lo, hi] array (also readable as `.min` / `.max`).
 */
export const JOINT_LIMITS = Object.freeze(limits);

/** The 21 pose joint names, in a fixed order (wrist_dev, the wrist's sideways bend, since 21 November 2026). */
export const JOINT_NAMES = Object.freeze(Object.keys(JOINT_LIMITS));

// R3-arm: the relaxed-hand "cascade" (ns-rig REST_HAND_POSE_DEG: each finger a little more bent than the one beside
// it, index to little; thumb slightly turned toward the index; wrist 0). Round 2 used 15/20/10 on every finger, almost
// the mesh's own straight rest on this rig.
const rest = { wrist_flex: 0, wrist_dev: 0 };
for (const j of ['thumb_cmc_opp', 'thumb_mcp_flex', 'thumb_ip_flex']) rest[j] = REST_HAND_POSE_DEG[j];
for (const d of DIGITS) {
  rest[`${d}_mcp_flex`] = REST_HAND_POSE_DEG[`${d}_mcp_flex`];
  rest[`${d}_pip_flex`] = REST_HAND_POSE_DEG[`${d}_pip_flex`];
  rest[`${d}_dip_flex`] = REST_HAND_POSE_DEG[`${d}_dip_flex`];
  rest[`${d}_mcp_abd`] = 0;
}
// Non-enumerable self alias so both `REST_POSE.wrist_flex` and `REST_POSE.joints.wrist_flex` work;
// Object.keys / JSON / spreading see only the 21 joint angles.
Object.defineProperty(rest, 'joints', { value: rest, enumerable: false });

/** Natural relaxed rest pose (ns-rig REST_HAND_POSE_DEG): a flat, frozen map of joint name -> degrees. */
export const REST_POSE = Object.freeze(rest);

function digitFlex(digits, mcp, pip, dip) {
  const out = {};
  for (const d of digits) {
    out[`${d}_mcp_flex`] = mcp;
    out[`${d}_pip_flex`] = pip;
    out[`${d}_dip_flex`] = dip;
  }
  return out;
}

function actionTarget(joints, { elbowFlexDeg = 0, shoulderLiftDeg = 0, shoulderOutDeg = 0, releaseOf = [], synergy = [] } = {}) {
  const t = { joints: { ...joints }, elbowFlexDeg, releaseOf: [...releaseOf], synergy: [...synergy] };
  if (shoulderLiftDeg) t.shoulderLiftDeg = shoulderLiftDeg;
  if (shoulderOutDeg) t.shoulderOutDeg = shoulderOutDeg;
  return deepFreeze(t);
}

/**
 * 20 November 2026 (BODYMAP; the owner, Message 204: "make sure there's clear movement for each brain activation area",
 * and Message 154: "as exaggerated and obvious as possible within reason"): how far a full drive of the left shoulder's
 * movements swings the whole left arm at the shoulder (degrees), on top of where the look and the keys hold the hand:
 * lift = forward and up (flexion; negative: down and back, extension), out = out to the left side (abduction;
 * negative: in across the body, adduction). ns-app turns the free hand's place about the shoulder by these (the hand's
 * own place, kept by the keys, is not changed: when the movement eases off the arm comes back to it); the shoulder's
 * range (ns-arm freeHandInRange) still bounds where the hand can go. A display rule of this game, nothing measured.
 */
export const SHOULDER_ACTION_DEG = Object.freeze({ lift: 60, drop: 45, out: 50, across: 35 });

/** Signed elbow-angle change (degrees, + = flexion) commanded by a full elbow_flexion / elbow_extension drive,
 * relative to the elbow angle of the current W/S/A/D reach solution. ns-app turns it into an explicit elbow target
 * (the hand stays on its screen ray, so the depth follows); clamps and reach limits are reported, never hidden.
 * 20 November 2026 (the left arm's movements now jerk and come half way back, JOINT_LATCH; the owner, Message 154: "as
 * exaggerated and obvious as possible within reason"): 30 -> 90. With 30 the elbow's jerk was 15 degrees, mostly along
 * the line of sight (the hand comes in toward the shoulder, which is beside the eye): the hand moved 2.4 % of the
 * picture, where the right elbow's jerk moves the right hand 31 %. With 90 the hand travels about 15 % of the picture
 * and waits 45 degrees more bent than its place gives (30 before this change). The elbow still stops at its own limits
 * (ns-arm ELBOW_MAX / fitHandAt), so a hand already brought in near the shoulder bends only as far as the elbow goes. */
export const ELBOW_ACTION_DEG = 90;

// relax_release targets the declared passive rest on the HAND joints only. The movement map says the
// wrist/elbow must "maintain supported pose without new forced motion", so the wrist is not driven
// by release. The middle-finger abduction reference is never driven by any action.
const RELAX_JOINTS = JOINT_NAMES.filter(j => j !== 'wrist_flex' && j !== 'wrist_dev' && j !== 'middle_mcp_abd');

/**
 * Full-drive targets per action: { joints: {joint: deg}, elbowFlexDeg: signed elbow-angle change (deg, + = flexion),
 * releaseOf: [ids], synergy: [joints] }. Joints absent from an action are not driven by it.
 * `synergy` lists joints the action drives only as a secondary postural term: an action that drives the same joint as
 * a PRIMARY term takes priority there (see composePose). Only the fist's mild wrist extension is a synergy term, so
 * an explicit wrist flexion/extension pulse composes with a held Space fist (MOVEMENT-MAP current_control_overlay
 * space_keydown_and_held: "Wrist/elbow commands may compose within anatomical limits"; grasp_close note: "do not force
 * wrist flexion with every grasp").
 */
export const ACTION_TARGETS = Object.freeze({
  // Repair R2: the full five-digit fist with the thumb folded across the index/middle middle phalanges
  // (ns-rig FIST_POSE_DEG; qualitative arrangement from Root-accepted pose references, literature-range angles not
  // re-verified here; display rig only, not calibrated contraction or force).
  grasp_close: actionTarget({ ...FIST_POSE_DEG }, { synergy: ['wrist_flex'] }),
  relax_release: actionTarget(
    Object.fromEntries(RELAX_JOINTS.map(j => [j, REST_POSE[j]])),
    { releaseOf: ['grasp_close'] }
  ),
  // R558 (Message 2: every movement to its maximum anatomically feasible range, never beyond): the open hand, a single
  // finger, the wrist and the spread now end at the game arm's own joint limits (JOINT_LIMITS, inside the adult norms:
  // finger MCP 90 / PIP 105 / DIP 75 of AAOS 90 / 100 / 90, MCP extension 10 of about 30, wrist flexion 70 / extension
  // 60 of AAOS 80 / 70, spread 20 at the index and little MCP). The rig and its hand-fit envelope (ns-arm
  // ENVELOPE_GRID) stop there; the right hand's body rig reaches the full norms (ns-body BODY_JOINT_SHARES).
  open_hand: actionTarget({ ...digitFlex(DIGITS, -10, 0, 0), thumb_mcp_flex: -10, thumb_ip_flex: -5 }),
  spread_fingers: actionTarget({ index_mcp_abd: 20, ring_mcp_abd: 15, little_mcp_abd: 20 }),
  wrist_flexion: actionTarget({ wrist_flex: 70 }),
  wrist_extension: actionTarget({ wrist_flex: -60 }),
  elbow_flexion: actionTarget({}, { elbowFlexDeg: ELBOW_ACTION_DEG }),
  elbow_extension: actionTarget({}, { elbowFlexDeg: -ELBOW_ACTION_DEG }),
  // 21 November 2026 (SEEMOVE, section 189; Message 204: "make sure there's clear movement for each brain activation
  // area"): a single finger's "Straighten" (-10 / 0 / 0: the finger as in the open hand) and "Straighten left thumb"
  // moved no joint at all from the lower half of their areas. The cause was not their end but the look's closing of the
  // hand (lookHandPose below has it); with that put right they uncurl the finger from its relaxed bend (22 to 40 degrees
  // at the knuckle) to straight. The thumb's "Straighten" also takes its tip joint to 20 past straight, as its long
  // extensor does. (Tried and dropped: the fingers to -30 / 0 / 0, 30 past straight at the knuckle like the right
  // hand's. It gave no clearer picture from your eyes: your left hand is seen palm up, along the forearm, so a
  // straightened finger lies flat pointing away from you and its upright end drops out of sight either way; on the
  // mirror body it travelled a quarter more. It also widened the hand-fit envelope. Kept as it was.)
  index_flexion: actionTarget(digitFlex(['index'], 90, 105, 75)),
  index_extension: actionTarget(digitFlex(['index'], -10, 0, 0)),
  thumb_mcp_flexion: actionTarget({ thumb_mcp_flex: 50 }),
  thumb_mcp_extension: actionTarget({ thumb_mcp_flex: -10, thumb_ip_flex: -20 }),
  // R558 (Messages 14 / 15): the game-defined left-hand actions (EXTRA_ARM_ACTIONS), at the same joint limits.
  // 20 November 2026 (BODYMAP): to the joints' own stop, -5 (the fingers pressed together); at 0, the relaxed hand's
  // own place, "Bring left fingers together" moved nothing from the start.
  fingers_together: actionTarget({ index_mcp_abd: -5, ring_mcp_abd: -5, little_mcp_abd: -5 }),
  middle_flexion: actionTarget(digitFlex(['middle'], 90, 105, 75)),
  middle_extension: actionTarget(digitFlex(['middle'], -10, 0, 0)),
  ring_flexion: actionTarget(digitFlex(['ring'], 90, 105, 75)),
  ring_extension: actionTarget(digitFlex(['ring'], -10, 0, 0)),
  little_flexion: actionTarget(digitFlex(['little'], 90, 105, 75)),
  little_extension: actionTarget(digitFlex(['little'], -10, 0, 0)),
  thumb_opposition: actionTarget({ thumb_cmc_opp: 40 }),
  // 21 November 2026 (SEEMOVE): 0 -> -15. Its end was the hand's neutral place of that joint, 12 units from where the
  // relaxed thumb rests (ns-rig REST_HAND_POSE_DEG): hardly a movement. Now the thumb swings out from the palm as far as
  // the right hand's own "Move right thumb out from the palm" does (r_thumb_opp -15), 27 units from its rest.
  thumb_reposition: actionTarget({ thumb_cmc_opp: -15 }),
  // 21 November 2026 (H8): the sideways bends turn the hand at the wrist, to the joint's ends (wrist_dev); they used to
  // colour their muscles only (the game arm had one wrist axis).
  wrist_radial_deviation: actionTarget({ wrist_dev: 20 }),
  wrist_ulnar_deviation: actionTarget({ wrist_dev: -30 }),
  // BODYMAP: the whole arm swung at the shoulder (SHOULDER_ACTION_DEG; no hand joint).
  shoulder_flexion: actionTarget({}, { shoulderLiftDeg: SHOULDER_ACTION_DEG.lift }),
  shoulder_extension: actionTarget({}, { shoulderLiftDeg: -SHOULDER_ACTION_DEG.drop }),
  shoulder_abduction: actionTarget({}, { shoulderOutDeg: SHOULDER_ACTION_DEG.out }),
  shoulder_adduction: actionTarget({}, { shoulderOutDeg: -SHOULDER_ACTION_DEG.across })
});

// ---------------------------------------------------------------------------------------------
// Movement-map binding
// ---------------------------------------------------------------------------------------------

function lockedMap(entries) {
  const m = new Map(entries);
  const refuse = () => fail('map_frozen', 'the movement-map binding is read-only');
  for (const k of ['set', 'delete', 'clear']) Object.defineProperty(m, k, { value: refuse, enumerable: false });
  return Object.freeze(m);
}

/**
 * Validate a parsed movement-map.json and bind it.
 * Returns a frozen { actions: Map(id -> {label, roles, cortical, joint_changes, notes}), muscles, qualifier }.
 */
export function bindMovementMap(map) {
  if (!isPlainObject(map)) fail('map_shape', 'movement map must be a parsed JSON object');
  if (map.schema_version !== 1) fail('map_schema', `unsupported schema_version ${JSON.stringify(map.schema_version)}; expected 1`);
  if (map.limb !== 'human_left') fail('map_limb', `limb must be "human_left", got ${JSON.stringify(map.limb)}`);

  const catalog = map.muscle_catalog;
  if (!isPlainObject(catalog) || Object.keys(catalog).length === 0) fail('map_catalog', 'muscle_catalog must be a non-empty object');
  for (const [key, entry] of Object.entries(catalog)) {
    if (!isPlainObject(entry)) fail('map_catalog', `muscle_catalog entry ${JSON.stringify(key)} must be an object`);
    if (entry.side !== undefined && entry.side !== 'left') fail('map_limb', `muscle ${JSON.stringify(key)} side must be "left"`);
  }

  if (!Array.isArray(map.actions)) fail('map_actions', 'actions must be an array');
  const byId = new Map();
  for (const a of map.actions) {
    if (!isPlainObject(a) || typeof a.id !== 'string') fail('map_action', 'every action needs a string id');
    if (!MOVEMENT_MAP_ACTION_IDS.includes(a.id)) fail('map_unknown_action', `unknown action id ${JSON.stringify(a.id)}`);
    if (byId.has(a.id)) fail('map_duplicate', `duplicate action id ${a.id}`);
    if (a.limb !== undefined && a.limb !== 'human_left') fail('map_limb', `action ${a.id} limb must be "human_left"`);
    if (typeof a.label !== 'string' || a.label.trim() === '') fail('map_action', `action ${a.id} needs a label`);
    if (!Array.isArray(a.joint_changes)) fail('map_action', `action ${a.id} joint_changes must be an array`);
    for (const jc of a.joint_changes) {
      if (!isPlainObject(jc) || typeof jc.joint !== 'string' || typeof jc.sign !== 'string') {
        fail('map_action', `action ${a.id} joint_changes entries need string joint and sign`);
      }
    }
    const roles = a.muscle_roles;
    if (!isPlainObject(roles)) fail('map_role', `action ${a.id} muscle_roles must be an object`);
    for (const k of Object.keys(roles)) {
      if (!ROLE_KEYS.includes(k)) fail('map_role', `action ${a.id} has unknown muscle role ${JSON.stringify(k)}`);
    }
    const seen = new Set();
    for (const k of ROLE_KEYS) {
      const list = roles[k];
      if (!Array.isArray(list)) fail('map_role', `action ${a.id} role ${k} must be an array`);
      for (const m of list) {
        if (typeof m !== 'string' || !hasOwn(catalog, m)) {
          fail('map_unknown_muscle', `action ${a.id} role ${k} names ${JSON.stringify(m)}, which is not a muscle_catalog key`);
        }
        if (seen.has(m)) fail('map_role', `action ${a.id} lists muscle ${m} more than once across its roles`);
        seen.add(m);
      }
    }
    byId.set(a.id, a);
  }
  const missing = MOVEMENT_MAP_ACTION_IDS.filter(id => !byId.has(id));
  if (missing.length) fail('map_missing_action', `missing action ids: ${missing.join(', ')}`);

  const contract = map.cortical_display_contract;
  const qualifier = isPlainObject(contract) ? contract.minimum_qualifier_visible : undefined;
  if (typeof qualifier !== 'string' || qualifier.trim() === '') {
    fail('map_qualifier', 'cortical_display_contract.minimum_qualifier_visible must be a non-empty string');
  }

  const entries = MOVEMENT_MAP_ACTION_IDS.map(id => {
    const a = byId.get(id);
    const roles = {};
    for (const k of ROLE_KEYS) roles[k] = [...a.muscle_roles[k]];
    return [id, deepFreeze({
      label: a.label,
      roles,
      cortical: copyJson(a.cortical),
      joint_changes: copyJson(a.joint_changes),
      notes: typeof a.mechanical_and_relaxation_note === 'string' ? a.mechanical_and_relaxation_note : null
    })];
  });
  // R558: the game-defined left-hand actions, bound with their own roles (every key must be in this map's catalog).
  for (const id of EXTRA_ARM_ACTION_IDS) {
    const x = EXTRA_ARM_ACTIONS[id];
    const roles = {};
    for (const k of ROLE_KEYS) {
      roles[k] = [...x.roles[k]];
      for (const m of roles[k]) if (!hasOwn(catalog, m)) fail('map_unknown_muscle', `game-defined action ${id} names ${JSON.stringify(m)}, which is not a muscle_catalog key`);
    }
    entries.push([id, deepFreeze({
      label: x.label, roles, cortical: null, joint_changes: [],
      notes: 'Game-defined left-hand action (R558), not part of the pinned movement map; roles from its muscle catalog.'
    })]);
  }

  return Object.freeze({
    actions: lockedMap(entries),
    muscles: deepFreeze(copyJson(catalog)),
    qualifier
  });
}

// ---------------------------------------------------------------------------------------------
// Pose composition and simulated muscle-drive display
// ---------------------------------------------------------------------------------------------

/** Validate a drives map against the allowed ids; missing ids are 0, values are clamped to 0..1. */
function readDrives(drives, ids, scope) {
  if (!isPlainObject(drives)) fail(`${scope}_drives`, 'drives must be an object mapping action id to 0..1');
  const out = {};
  for (const id of ids) out[id] = 0;
  for (const key of Object.keys(drives)) {
    if (!hasOwn(out, key)) fail(`${scope}_unknown_action`, `unknown action id ${JSON.stringify(key)}`);
    const v = drives[key];
    if (!isFiniteNumber(v)) fail(`${scope}_drive`, `drive for ${key} must be a finite number`);
    out[key] = clamp(v, 0, 1) + 0; // + 0 normalises -0
  }
  return out;
}

function checkTargets(targets) {
  if (!isPlainObject(targets)) fail('pose_target', 'targets must be an object of action id -> {joints}');
  const ids = Object.keys(targets);
  for (const id of ids) {
    const t = targets[id];
    if (!isPlainObject(t) || !isPlainObject(t.joints)) fail('pose_target', `target ${id} needs a joints object`);
    for (const j of Object.keys(t.joints)) {
      if (!hasOwn(JOINT_LIMITS, j)) fail('pose_joint', `target ${id} names unknown joint ${JSON.stringify(j)}`);
      if (!isFiniteNumber(t.joints[j])) fail('pose_target', `target ${id}.${j} must be a finite number`);
    }
    if (t.reachDepthDelta !== undefined) {
      fail('pose_target', `target ${id}.reachDepthDelta was replaced by elbowFlexDeg (an explicit signed elbow-angle change)`);
    }
    if (t.elbowFlexDeg !== undefined && !isFiniteNumber(t.elbowFlexDeg)) {
      fail('pose_target', `target ${id}.elbowFlexDeg must be a finite number of degrees`);
    }
    if (t.releaseOf !== undefined && !Array.isArray(t.releaseOf)) fail('pose_target', `target ${id}.releaseOf must be an array`);
    if (t.synergy !== undefined) {
      if (!Array.isArray(t.synergy)) fail('pose_target', `target ${id}.synergy must be an array of joint names`);
      for (const j of t.synergy) {
        if (!hasOwn(t.joints, j)) fail('pose_target', `target ${id}.synergy names ${JSON.stringify(j)}, which it does not drive`);
      }
    }
  }
  return ids;
}

const isSynergy = (target, joint) => Array.isArray(target.synergy) && target.synergy.includes(joint);

function checkRest(r) {
  if (!isPlainObject(r)) fail('pose_rest', 'rest must be an object of joint -> degrees');
  for (const j of JOINT_NAMES) if (!isFiniteNumber(r[j])) fail('pose_rest', `rest.${j} must be a finite number`);
}

/**
 * Compose one net pose from action drives ({ [actionId]: 0..1 }).
 * Per joint: rest + sum over the actions defining it of (e_a / max(1, sum of e)) * (target_a - rest), with the
 * effective drive e_a = drive_a for an action that drives the joint as a primary term, and
 * e_a = drive_a * (1 - min(1, sum of primary drives on that joint)) for a `synergy` term. Competing primary actions
 * (grasp vs open on the digits) therefore blend into a single net target and are never simultaneously at their
 * maxima, while an explicit wrist command takes priority over the fist's synergistic wrist term (a full
 * wrist_flexion pulse during the Space fist reaches its own 60 deg, not a 25 deg average). Results are
 * clamped to JOINT_LIMITS. elbowDeltaDeg = sum of drive * elbowFlexDeg (elbow flexion and extension net): a signed
 * elbow-angle change that ns-app applies as an explicit elbow target relative to the reach solution.
 *
 * The optional second argument ({ targets, rest }) exists for tests with constructed targets; the
 * scene always uses the defaults.
 * @returns {{ joints: Object<string, number>, elbowDeltaDeg: number }}
 */
export function composePose(drives = {}, { targets = ACTION_TARGETS, rest: restPose = REST_POSE } = {}) {
  const ids = targets === ACTION_TARGETS ? ACTION_IDS : checkTargets(targets);
  if (restPose !== REST_POSE) checkRest(restPose);
  const d = readDrives(drives, ids, 'pose');

  const joints = {};
  for (const j of JOINT_NAMES) {
    const r = restPose[j];
    let primary = 0;
    for (const id of ids) if (hasOwn(targets[id].joints, j) && !isSynergy(targets[id], j)) primary += d[id];
    const synergyScale = 1 - Math.min(1, primary);
    const eff = id => (isSynergy(targets[id], j) ? d[id] * synergyScale : d[id]);
    let total = 0;
    for (const id of ids) if (hasOwn(targets[id].joints, j)) total += eff(id);
    let v = r;
    if (total > 0) {
      const denom = Math.max(1, total);
      for (const id of ids) {
        const tj = targets[id].joints;
        if (hasOwn(tj, j)) v += (eff(id) / denom) * (tj[j] - r);
      }
    }
    const lim = JOINT_LIMITS[j];
    joints[j] = clamp(v, lim[0], lim[1]);
  }

  let elbowDeltaDeg = 0, shoulderLiftDeg = 0, shoulderOutDeg = 0;
  for (const id of ids) {
    const delta = targets[id].elbowFlexDeg;
    if (delta) elbowDeltaDeg += d[id] * delta;
    // (BODYMAP: the left shoulder's swing, SHOULDER_ACTION_DEG; present in the result only when not 0)
    if (targets[id].shoulderLiftDeg) shoulderLiftDeg += d[id] * targets[id].shoulderLiftDeg;
    if (targets[id].shoulderOutDeg) shoulderOutDeg += d[id] * targets[id].shoulderOutDeg;
  }
  const out = { joints, elbowDeltaDeg: elbowDeltaDeg + 0 };
  if (shoulderLiftDeg) out.shoulderLiftDeg = shoulderLiftDeg + 0;
  if (shoulderOutDeg) out.shoulderOutDeg = shoulderOutDeg + 0;
  return out;
}

/**
 * 21 November 2026 (SEEMOVE, section 189; the owner, Message 204: "make sure there's clear movement for each brain
 * activation area"): how the look's closing and opening of the left hand (19 November: "as we look down, the fingers
 * close ... as we look up, they expand"; ns-app inputs.handLook) joins the pose the hand's own movements ask for.
 *   rule 'under' (in force): the look's pose takes the place of the hand's REST, and a movement goes from there to its
 *     own end. Per joint: pose + (look pose - rest) x (1 - share), share = how much of that joint the movements under
 *     way command (the sum of their pose drives, at most 1; "Relax" commands none: its end is the rest itself). With
 *     nothing under way the hand is exactly where the look puts it, as before; a movement at full drive is exactly at
 *     its own end, whatever the look; in between it is a straight blend of the two, so it stays inside the joints'
 *     limits. The Space grip (full drive on every digit) wins, as before.
 *   rule 'max' (before; kept): the more closed of the two (looking down), the more open of the two (looking up). It
 *     let the look CANCEL a movement: every strip area of the left hand lies where the look is a little below the
 *     point at which the closing begins (8 degrees under level), and there the look's pose, the rest hand closed by
 *     under 2 %, was "more closed" than any straightening, so "Open left hand", each finger's "Straighten",
 *     "Straighten left thumb" and "Move left thumb out from the palm" moved NOTHING (measured in the browser: the pose
 *     drive rose to 0.97 and no joint changed), while the same movements worked from a look a finger's width higher.
 *     Looking up past 8 degrees it did the same to every bend.
 * joints: the composed pose (composePose(drives).joints); drives: this frame's pose drives; look: { close, open }
 * (0..1 each; closing wins when both are given). Returns `joints` itself when the look asks for nothing, else a new
 * object. The wrist is never the look's. Pure. A display rule of this game, nothing measured.
 */
export const LOOK_HAND = Object.freeze({ rule: 'under', openSpread: 0.8 });
// (the rule runs every frame while the look is off level, so nothing is worked out twice: which kind each pose joint
// is and which actions name it as a main term are tables built once, and the look's own pose is kept while the look's
// share stays the same. Timed in Node, millionths of a second a call: about 190 without these; with them about 4 while
// the look is still and 45 while it moves; the rule before took about 75.)
const LOOK_JOINT_KIND = new Map();
for (const j of JOINT_NAMES) LOOK_JOINT_KIND.set(j, j === 'wrist_flex' ? null : /_flex$/.test(j) ? 'flex' : /_opp$/.test(j) ? 'opp' : /_abd$/.test(j) ? 'abd' : null);
function lookJointActionsOf(targets) {
  const m = new Map();
  for (const j of JOINT_NAMES) m.set(j, Object.keys(targets).filter(id => id !== 'relax_release' && hasOwn(targets[id].joints, j) && !isSynergy(targets[id], j)));
  return m;
}
let lookJointActions = null;
const lookPoseMemo = { c: -1, op: -1, P: null };
export function lookHandPose(joints, drives, look, { rule = LOOK_HAND.rule, targets = ACTION_TARGETS, rest: restPose = REST_POSE } = {}) {
  const c = look && look.close > 0 ? Math.min(1, look.close) : 0, op = look && look.open > 0 ? Math.min(1, look.open) : 0;
  if (!(c > 0 || op > 0) || !isPlainObject(joints)) return joints;
  const own = targets === ACTION_TARGETS && restPose === REST_POSE;
  let P;
  if (own && lookPoseMemo.P !== null && lookPoseMemo.c === c && lookPoseMemo.op === (c > 0 ? 0 : op)) P = lookPoseMemo.P;
  else {
    P = composePose(c > 0 ? { grasp_close: c } : { open_hand: op, spread_fingers: op * LOOK_HAND.openSpread }, { targets, rest: restPose }).joints;
    if (own) { lookPoseMemo.c = c; lookPoseMemo.op = c > 0 ? 0 : op; lookPoseMemo.P = P; }
  }
  const J = { ...joints };
  const d = isPlainObject(drives) ? drives : {};
  if (rule === 'max') {
    if (c > 0) { for (const k of Object.keys(P)) if (/_flex$|_opp$/.test(k) && k !== 'wrist_flex' && isFiniteNumber(J[k]) && P[k] > J[k]) J[k] = P[k]; }
    else if (!(d.grasp_close > 0.05)) { for (const k of Object.keys(P)) if (k !== 'wrist_flex' && isFiniteNumber(J[k]) && (/_abd$/.test(k) ? P[k] > J[k] : /_flex$/.test(k) ? P[k] < J[k] : false)) J[k] = P[k]; }
    return J;
  }
  const acts = own ? lookJointActions || (lookJointActions = lookJointActionsOf(targets)) : lookJointActionsOf(targets);
  for (const k of JOINT_NAMES) {
    const kind = LOOK_JOINT_KIND.get(k);
    if (kind === null || !isFiniteNumber(J[k]) || !isFiniteNumber(restPose[k]) || !isFiniteNumber(P[k])) continue;
    const off = P[k] - restPose[k];
    // (closing: the bends and the thumb's turn, toward the fist; opening: the bends toward straight, the spread outward)
    if (!(c > 0 ? kind !== 'abd' && off > 0 : kind === 'abd' ? off > 0 : kind === 'flex' && off < 0)) continue;
    let share = 0;
    for (const id of acts.get(k)) { const v = d[id]; if (v > 0) share += v; }
    // (a fist does not spread: the grip, which names no sideways joint, takes the look's spread with it)
    if (!(c > 0) && kind === 'abd' && d.grasp_close > 0) share += d.grasp_close;
    const lim = JOINT_LIMITS[k];
    J[k] = clamp(J[k] + off * (1 - Math.min(1, share)), lim[0], lim[1]) + 0;
  }
  return J;
}

const MUSCLE_BASELINE = 0.08;
const STABILIZATION_CAP = 0.3;

/**
 * Simulated (unitless 0..1) display drive per catalog muscle:
 *   baseline 0.08; + drive for each action listing the muscle under primary_drive_increase;
 *   + min(0.3, drive * 0.3) per limited_stabilization_or_posture_dependent listing, with the total
 *   stabilisation contribution capped at 0.3; then * (1 - 0.9 * drive) for each
 *   relative_drive_reduction listing; finally clamped to 0..1.
 * For any single action, no relative_drive_reduction muscle exceeds the baseline.
 */
export function muscleDrives(binding, drives = {}) {
  if (!binding || !(binding.actions instanceof Map) || !isPlainObject(binding.muscles)) {
    fail('muscle_binding', 'binding must come from bindMovementMap');
  }
  const ids = [...binding.actions.keys()];
  const d = readDrives(drives, ids, 'muscle');
  const out = {};
  for (const m of Object.keys(binding.muscles)) {
    let v = MUSCLE_BASELINE;
    let stabilization = 0;
    let factor = 1;
    for (const id of ids) {
      const a = d[id];
      if (a === 0) continue;
      const roles = binding.actions.get(id).roles;
      if (roles.primary_drive_increase.includes(m)) v += a * 1.0;
      if (roles.limited_stabilization_or_posture_dependent.includes(m)) stabilization += Math.min(STABILIZATION_CAP, a * 0.3);
      if (roles.relative_drive_reduction.includes(m)) factor *= 1 - 0.9 * a;
    }
    v += Math.min(STABILIZATION_CAP, stabilization);
    v *= factor;
    out[m] = clamp(v, 0, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// R5 activation dynamics (virtual control; UI smoothing only), A1-activation round 1 revision
// ---------------------------------------------------------------------------------------------

/** Actions that compete with the Space grip for digit/thumb joints (they do not start while the grip holds: graspHold). */
export const SPACE_COMPETING = Object.freeze(['open_hand', 'spread_fingers', 'index_flexion', 'index_extension',
  'thumb_mcp_flexion', 'thumb_mcp_extension', 'relax_release',
  'fingers_together', 'middle_flexion', 'middle_extension', 'ring_flexion', 'ring_extension', 'little_flexion',
  'little_extension', 'thumb_opposition', 'thumb_reposition']);
/** Pulsed actions that flex digits: cancelled on Space release so a stale pulse cannot reclose the hand. */
export const DIGIT_FLEXING = Object.freeze(['grasp_close', 'index_flexion', 'thumb_mcp_flexion', 'middle_flexion', 'ring_flexion',
  'little_flexion', 'thumb_opposition']);
const REACH_FULL_RATE_DEG_S = 90;    // |elbowRate| at which the legacy display-only reach linkage saturates
const SNAP = 1e-9;                   // timers / drives within this of their goal snap to it

/**
 * Gaze restart deadband (degrees of view angle). On the SAME strip region a 'moved' restart fires only once the
 * gaze direction has turned more than this from the direction at the last (re)trigger, seed or region change. At the
 * default look sensitivity (0.0038 rad/px = 0.218 deg/px) one pointer pixel stays inside it and two pixels leave it,
 * so sub-pixel/1-px jitter, resizes and re-framing never re-trigger, while any deliberate look movement does
 * (the user: activation stops "unless we move again"). A UI choice, not a physiological threshold.
 */
export const GAZE_RESTART_DEADBAND_DEG = 0.31;
/** R3-fix (review M3 / M5, display choices, seconds of continuous gaze on one area):
 *  replaceClickS  a CLICK-started pulse is not replaced by areas the crosshair only passes over while the player turns
 *                 to watch the body; a new area must hold the gaze this long first (a new click always replaces).
 *  markS          the persistent "switched on" mark (R11c) is added at once for a click (the user: "when you press a
 *                 part ... it slightly changes shade"), but for a look only after the gaze has stayed on the area this
 *                 long, so ordinary looking around does not mark every area gold. The 1 s look activation itself is
 *                 unchanged (it still starts the moment the crosshair reaches a new area).
 *  latchS         R558: a LOOK moves body parts only once the gaze has stayed on the area this long; the area's glow
 *                 still starts at once. With the strip filling the view the crosshair crosses many areas while the
 *                 player looks around, and each would otherwise move its joints. A click moves at once.
 *                 (20 November 2026, Message 206: a look that leaves before this moved nothing, so its glow ends then.) */
// 19 November 2026 (the owner: "highlighting specific areas of the brain with our cursor just by running over, those
// body parts not activating ... They have to activate at least once"): latchS 0.3 -> 0.07: an area the look runs over
// does its movement almost at once; it no longer needs a third of a second of rest.
export const GAZE_DWELL = Object.freeze({ replaceClickS: 0.3, markS: 0.5, latchS: 0.07 });

/**
 * 18 November 2026 (the lead's decision on audit S4; the owner, Note 59: "if you highlight any part of the brand, you
 * see what it does ... the brain turns into a control panel essentially"): a LOOK only ARMS a motor area. The look's
 * pulse lights the area's key at full, shows the movement's muscles at `muscleLevel` only (a hint, not a contraction)
 * and moves nothing: no latch after latchS (the rest now only marks the area as taken for the card and the number keys,
 * lookTaken), no forearm turn and no relax for the pulse's second. A click, a number key or a tap on a muscle PRESSES
 * it, as before. Reading the tip no longer moves the body. This replaces Message 1's look-jerk of the head and neck
 * areas (the lead chose the control panel for every area). `on: false` (createActivity({ lookArms })) brings back the
 * old rule. A rule of this game, nothing measured.
 */
// 19 November 2026 (the owner: "Let's also go back to activation simply by cursor highlight. The number overview is
// very confusing and creates feedback delay"): on: false again: a look that rests on a motor area switches it on at
// once; a click while it is highlighted does it again (JOINT_LATCH: since Message 206 it contracts and returns).
export const LOOK_ARMS = Object.freeze({ on: false, muscleLevel: 0.22 });

/**
 * 18 November 2026 (SMALL, audit M3; the owner, Note 47: "And the limbs should be manipulatable to any position by brain
 * activation"): a number key held down drives its movement PROGRESSIVELY: the joints' goals run toward the movement's
 * end at rateDegS while the key is held, and the part stops where it is when the key comes up ('muscle' event with
 * progressive: true, then 'muscleRelease' { tap: false }). A short press (the app's tapMs) is still the whole movement
 * ({ tap: true } completes it). The stage rule is the same as a press's (a joint held on the other side is brought back
 * first). A click or a tap on a muscle is always the whole movement. A rule of this game, not a measured speed.
 * 20 November 2026 (Message 206: "no permanent movements"): withdrawn. A press from a number key ('muscle' with
 * progressive: true) is an ordinary press now: the part contracts and returns, whatever the key does after; the
 * 'muscleRelease' event is accepted and changes nothing. (The number keys choose limbs since 19 November, LIMB_KEYS in
 * ns-app, so no key sends these in play.) tapMs stays for the shell's own count of a short press.
 */
export const MOVE_HOLD = Object.freeze({ rateDegS: 90, tapMs: 220 });

/**
 * Display (cortex colour) envelope defaults, seconds. UI timing choices, not physiological latencies:
 *   riseTau     fast first-order rise (63% at 35 ms, 94% at 100 ms) toward full display while a command is active;
 *   fadeSeconds smoothstep fade inside the last 0.25 s of a timed command, reaching exactly 0 at its deadline (R558,
 *               Message 22: 0.08 s read as a snap after the power-up charge; 0.25 s is a clean power-down, and the HUD
 *               meter follows the same envelope, so it stays honest);
 *   decayTau    fast decay for a command that ends early (replaced pulse, Space release of the fist, cancellation).
 */
export const DISPLAY_ENVELOPE = Object.freeze({ riseTau: 0.035, fadeSeconds: 0.25, decayTau: 0.03 });

/** Visible label for the display-only reach channel (A/D and the proximal share of W/S). */
export const ARM_REACH_LABEL = 'simulated arm reach activity (display-only, unitless; shoulder territory not mapped)';

/**
 * WASD reach display defaults (display-only; never a commanded drive, never a cortical-territory claim):
 *   holdLevel            display level of a held key with no realised motion (e.g. pushing against the reach limit);
 *   fullDepthRate        |realised depth rate| (m/s) at which the W/S display saturates (ns-arm default speed 0.35);
 *   fullXRate            |realised horizontal rate| (NDC/s) at which the A/D display saturates (ns-arm default 0.9);
 *   proximalShare        share of the W/S level also shown on the proximal arm-reach channel (armReach);
 *   horizontalFieldShare share of the A/D level shown on EACH of the two most proximal existing representative fields
 *                        (elbow_flexion and elbow_extension, MARKERS u 0.2974 / 0.3212 since the knob-anchored
 *                        layout) of the STRIP only; never fed to muscles;
 *   riseTau / decayTau   smoothing (s); after release the display falls below 2% within 0.3 s.
 */
// R558 (Messages 48 and 50): horizontalFieldShare is 0. A and D are shoulder movements (the hand swings out or in at the
// shoulder), so they light the shoulder area and its muscles only; lighting the elbow fields for them made the whole
// arm zone glow and hid which part does the work.
export const REACH_DISPLAY = Object.freeze({
  holdLevel: 0.55, fullDepthRate: 0.35, fullXRate: 0.9, proximalShare: 0.6, horizontalFieldShare: 0,
  riseTau: 0.05, decayTau: 0.075
});

function zeroMap(ids) {
  const o = {};
  for (const id of ids) o[id] = 0;
  return o;
}

function pick(m, ids) {
  const o = {};
  for (const id of ids) o[id] = m[id];
  return o;
}

// R558 (performance, P2): the same test as isPlainObject(m) && ids.every(id => isFiniteNumber(m[id]) && m[id] >= 0 &&
// m[id] <= 1) (the id lists are dense arrays), as a loop: checkState runs it on every activity step.
const unitMap = (m, ids) => {
  if (!isPlainObject(m)) return false;
  for (let i = 0; i < ids.length; i++) { const v = m[ids[i]]; if (!(isFiniteNumber(v) && v >= 0 && v <= 1)) return false; }
  return true;
};
const unit = v => isFiniteNumber(v) && v >= 0 && v <= 1;
const nonNegative = v => isFiniteNumber(v) && v >= 0;
const actionOrNull = v => v === null || ACTION_IDS.includes(v);
const angleOrNull = v => v === null || isFiniteNumber(v);
/** Soft union of two 0..1 levels: 1 - (1 - a)(1 - b). */
const union = (a, b) => 1 - (1 - a) * (1 - b);

/**
 * The jerk of a movement switched on from the brain. (History: R558 latch, the user's note of 11 Nov 2026: a limb did
 * not come back by itself after a muscle or brain activation; it had to be activated back by the opposing action, or
 * everything reset. WITHDRAWN on 20 November 2026 by Message 206: every activation contracts, then returns; see the
 * dated note inside.)
 *   omega, zeta        the jerk of a body joint to its movement's end: an under-damped spring (natural frequency in
 *                      rad/s, damping ratio) solved exactly per step, so the joint snaps there with one small recoil.
 *   restitution        R558 (user, Message 1: "when we look to any motor area of the brain, we are looking for a
 *                      violent jerking movement, not a graceful shift"): almost every latched goal IS the end of the
 *                      joint's range, where the overshoot of the spring cannot be shown without passing the range. The
 *                      joint therefore hits its end stop at full speed and rebounds off it with this share of its
 *                      speed (then the spring brings it back: a few quick, shrinking recoils), never past the stop.
 *   reducedMotion      the same for prefers-reduced-motion: slower, without recoil or rebound.
 *   snapDeg, snapDegS  within these of the goal (degrees, degrees/s) the joint is exactly at its goal.
 *   restEpsDeg         an angle within this of the start angle counts as "at the start position".
 *   armPoseTau         seconds: the game arm's ease of what is not a press (the Space grip, the hand opening after it, a
 *                      relax pulse; reducedArmPoseTau likewise).
 * R558 tuning (the lead's brief L; this very step function at 60 frames a second): omega 26 / zeta 0.55 / no rebound
 * took 6 frames (0.10 s) for a 70 degree turn to its end stop (5, 19, 34, 49, 61, 70) and stopped dead: a quick but
 * smooth swing. omega 50 / zeta 0.35 / restitution 0.4 takes 3 frames (19, 55, 70) and recoils about 5 degrees off the
 * stop before it settles (about 10 degrees on a 135 degree knee straightening; 31 % overshoot, then back, for a goal
 * inside the range). Compared: omega 70 is at the stop in 2 frames (one moving frame, too little to read as motion);
 * zeta 0.25 adds a third recoil (a wobble); restitution 0.3 / 0.5 recoil 4 / 7 degrees. The game arm's ease
 * 0.045 -> 0.022 s (53 % of the way in one 60 Hz frame, 90 % in three).
 * A display rule of this game. Nothing here is a measured movement speed, force or nerve signal.
 */
export const JOINT_LATCH = Object.freeze({
  // 19 November 2026 (the owner: "as exaggerated and obvious as possible within reason ... imagine an extremely intense
  // electroshock that causes a fierce contraction with acceleration and inertia. As if moving something heavy"; and
  // "it activates heavily relaxes slightly and repeats that process with each further click"): a slower, heavier
  // spring with far less damping (omega 50 -> 21, zeta 0.35 -> 0.26) and a harder rebound off the end stop (0.4 -> 0.55):
  // the part gathers speed over several frames, slams into its end, is thrown back a good part of the way and swings
  // in again two or three times before it holds.
  // (History, withdrawn by Message 206 below: the owner's order of events was "activates heavily, relaxes slightly,
  // and repeats that process with each further click": so after the slam the part eased back a little and waited
  // there, and the next click drove it in again. The first version of this threw the part BACK on a further click, a
  // jump in the picture, the wrong way round. The numbers of that time:)
  //   driveS       seconds a press drives the joint at its full end angle before it eases off
  //   relax        how far it then eases back, as a share of the swing (and never more than relaxMaxShare of the
  //                joint's own travel from its start angle, so a small movement stays on its own side)
  //   relaxOmega   the ease back: a critically damped spring of this frequency (soft, no wobble)
  //   kick         a press that finds the joint already near its end (a further click, or a movement with little
  //                travel such as straightening a knee that is nearly straight) gives it this speed toward the end,
  //                as kick x swing x omega degrees a second: it slams into the end stop and is thrown back off it
  //   minSwingDeg  the swing a small movement is given for the kick and the ease (a knee 6 degrees from straight
  //                would otherwise show nothing at all), and never more than minSwingRangeShare of the joint's whole
  //                range; nearShare: "already near its end" is within this share of the swing from the goal
  // Under reduced motion none of this happens (the reducedMotion spring has no kick, relax or rebound).
  // (later the same day, the owner: "the neck moves and then returns, and then same for all the body parts. They move
  // and then return. But they don't have to return fully, just partially ... They jerk one way and then they partially
  // return back": the part is held at its end for 0.3 s (0.55 before) and comes back half of its swing (0.16 before).)
  // 20 November 2026 (the same words, for the LEFT arm: its strip movements eased into place and stayed there): the game
  // arm's latched movements use these very numbers on their pose drive (0 = the hand's neutral pose, 1 = the movement's
  // end): the drive is thrown to 1 by this spring and rebounds off it with `restitution`, is held there for driveS, then
  // eases back `relax` of the way (never more than relaxMaxShare) with relaxOmega and waits; a further press kicks it in
  // again (kick, nearShare). armPoseTau now only eases what is not a press: the way back to neutral after the opposite
  // movement, the Space grip, the hand opening after it. (createActivity armJerk, latchArmAction, integrate.)
  // 20 November 2026, evening (the owner, Message 206: "I think it's better actually if there are no permanent
  // movements ... when you tap any area of the brain, you activate any area, it will contract, then return to its
  // previous place. But in returning to its previous place, you won't see corresponding activity and muscle activation.
  // It will just return." It replaces Message 185's "they don't have to return fully, just partially" and the latch of
  // 11 November): NOTHING IS HELD by the brain any more. (The name JOINT_LATCH is kept so callers need not change.)
  //   driveS       the CONTRACTION: seconds from the press during which the part is driven to the movement's end by the
  //                jerk spring above (omega, zeta, restitution: as before, the electroshock of Message 154). The area,
  //                its muscles, the beam and the activity's display of the movement are lit for exactly this long.
  //   lightFadeS   the light of a contraction fades out over its last lightFadeS and is exactly 0 when the return begins
  //   relaxOmega   the RETURN: a critically damped spring of this frequency (soft, no wobble, no activity shown) back to
  //                where the part was just before the press (the start posture, or wherever the player put it with the
  //                keys, a drag, a Space carry or the limb turn), where it stays.
  //   kick, minSwingDeg, minSwingRangeShare, nearShare   unchanged: a press that finds the part already at (or near) the
  //                movement's end (a further click during the contraction, or a movement with little travel such as
  //                straightening a knee that is nearly straight) throws it into the end stop, so it still shows.
  //   The movement's end is a STOP for its contraction (the BODYMAP audit, same evening: the jerk spring overshot an end
  //                in the middle of a joint's range by about 40 %, "Swing thigh in" threw the thigh 23 degrees past its
  //                end into the other leg and "Turn right arm inward" reached -70 where the forearm meets the thigh;
  //                Message 204 asks for movements "as precise as possible"): the part slams into the end and rebounds
  //                off it with `restitution`, as at a joint's own limit, and never passes it. (The map's jerkStop flag on
  //                "Swing thigh in" asks for exactly this; every end now has it.)
  //   stopBounceShare, stopBounceMaxDeg   a movement that ends at a joint's own stop where the part already is (at the
  //                start: clench the jaw, lower the throat bone, right palm up, right fingers together, each on both
  //                halves) would show nothing under contract-and-return (Message 204: "make sure there's clear
  //                movement for each brain activation area"). Its contraction strikes the stop: the part is thrown into
  //                it and rebounds this share of the joint's range off it (never more than stopBounceMaxDeg), then is
  //                drawn back onto the stop: a visible twitch against the stop (measured at 60 frames a second: the
  //                jaw about 12 degrees, the right palm 30, the right fingers' spread 8, the throat bone 8). Only when
  //                the whole movement would show nothing. Not under reduced motion.
  // 0.4 s (the old hold was 0.3 s): the part slams into its end at about 0.1 s, is thrown back, slams in again at about
  // 0.25 s and has a moment at the end before it returns, so the lit muscles can be read. Under reduced motion
  // (reducedMotion) the part goes out and back on critically damped springs: no kick, no rebound, no bounce.
  omega: 21, zeta: 0.26, restitution: 0.55, driveS: 0.4, lightFadeS: 0.08, relaxOmega: 9, kick: 0.8, minSwingDeg: 70, minSwingRangeShare: 0.6, nearShare: 0.5,
  stopBounceShare: 0.5, stopBounceMaxDeg: 38,
  // 21 November 2026 (SEEMOVE, section 189; the owner, Message 204: "make sure there's clear movement for each brain
  // activation area. And you can clearly identify what type of movement it is for each area"):
  //   holdS        the HOLD: after the contraction (driveS, lit) the part STAYS at the movement's end for this long, then
  //                returns. 0 -> 0.3 s. Measured in the browser at 60 frames a second, every movement of the map: with
  //                0.4 s alone the part was within 80 % of its largest travel for 0.25 to 0.43 s, and still (after the
  //                slam, the throw back and the second slam) for only about 0.15 s before the return began: less than
  //                one glance at a part; on the small parts (fingers, toes, the mirror body's face) a reader missed what
  //                had moved. Now the part rests at its end for about half a second after the second slam. The LIGHT is
  //                unchanged: the area, its muscles and the display are lit for driveS exactly as before and dark when
  //                it ends (the light of an activation is not this rule's to lengthen), so during the hold the part
  //                stands at its end unlit, and the return is unlit as before, to where the part was. A press during
  //                the hold is a further press (it kicks the part into its end again). 0 = the behaviour before.
  //                (Tried and dropped: driveS itself 0.4 -> 0.7, which also lit everything for 0.7 s.)
  //   backStop     a movement with little room (the part already near the movement's end: straighten a knee that is 6
  //                degrees from straight, straighten the right elbow, bring the right arm in, swing the thigh in) is
  //                kicked into its end so it shows (kick above), and the kick threw it back off the end PAST where it
  //                started, the other way: "Straighten left knee" bent the knee 11.6 degrees (its largest movement on
  //                screen, 33 px, against 7 px of straightening), "Straighten right elbow" bent it 9.8, "Swing right arm
  //                in" swung it out 12.5. The movement then read as its neighbour on the strip. backStop: true makes the
  //                place the part started from a stop for the contraction's throw back (it stops dead there and is
  //                driven in again), so every movement's travel is in its own direction. Not for the stop bounce (the
  //                twitch off a stop the part is already at), which has no room on its own side.
  //   kickRoomOmega  with backStop on, a kick's speed is at most this many times the movement's room (degrees from
  //                where the part started to the movement's end) times omega. 22 November 2026 (an independent check of
  //                section 189): the kick (0.8 x swing x omega, the swing at least 70 degrees) crossed the end of a
  //                movement with little room inside the press frame; the end threw it back and backStop stopped it dead
  //                where it had started, so the part stood at its end for ONE frame and then jumped back: "Straighten
  //                left knee" went 6.0, 0.0, 0.3, 1.3 ... 6.0 degrees frame by frame, your right arm in "Swing right arm
  //                in" 0, 42.7, 0, 2.5 ... 42.7 px: a flash of the whole movement (the owner banned flicker). Before
  //                backStop the throw back past the start hid it. With the cap the part covers about two fifths of its
  //                room in the first frame at 60 frames a second (the knee 0.4 of its 6 degrees), arrives in the third
  //                or fourth and slams in, as every other movement does. Also for a further press on such a movement
  //                (it jumped from its end to its start in one frame). Twenty-four joint movements were capped, none
  //                with more than 30 degrees of room. Not under reduced motion (no kick there).
  holdS: 0.3, backStop: true, kickRoomOmega: 1,
  // (reduced motion: the same hold; its soft spring is only at its end by about 0.35 s, so without one the part turned
  // back almost as soon as it arrived)
  reducedMotion: Object.freeze({ omega: 12, zeta: 1, restitution: 0, driveS: 0.45, holdS: 0.3, lightFadeS: 0.08, relaxOmega: 9 }),
  snapDeg: 0.02, snapDegS: 0.5, restEpsDeg: 0.5,
  armPoseTau: 0.022, reducedArmPoseTau: 0.12
  // (Message 206: gone with the latch: relax / relaxMaxShare (the part way back), hintLevel (the faint opposing hint),
  // nearRestDeg / nearRestShare (the stage rule's "counts as at the start"))
});

/** R558 (issue hunt 2: "Raise right arm up" held together with "Swing right arm out to the side" left the arm out to the
 * side and down and back, matching neither label: ns-body turns abduction before flexion, so abduction 135 then flexion
 * 160 is not "up"). Rule: a held movement of the right shoulder in one plane (flexion / extension, or out to the side /
 * back in) brings the other plane's joint back to its start angle, so the LATER action wins the arm's direction and its
 * label stays true: raise up -> straight up beside the head; then out to the side -> straight out to the side at
 * shoulder height (flexion back to the start's 90, forward); then raise up again -> up (out to the side back to 0).
 * Bringing a joint back with its own opposite action does not touch the other plane. A rule of this game, chosen so
 * every held label stays true; not a measured coupling of the shoulder joints.
 * 20 November 2026 (Message 206: nothing is held): the same rule at the peak of a contraction: a contraction of one
 * plane takes the other plane's joint to its start angle for the same time (so "out to the side" is out to the side
 * even from a raised arm), and both then return to where they were. */
export const JOINT_CONFLICTS = Object.freeze({
  r_shoulder_flex: Object.freeze(['r_shoulder_abd']),
  r_shoulder_abd: Object.freeze(['r_shoulder_flex'])
});

/** The opposing (antagonist) game-arm action of each arm action. 20 November 2026 (Message 206: nothing is held): a
 * contraction of one sends a contraction of its opposite that is still under way straight into its return (the two
 * never pull at once); a relax press does that for every hand movement. */
export const ARM_OPPOSITES = Object.freeze({
  grasp_close: 'open_hand', open_hand: 'grasp_close',
  wrist_flexion: 'wrist_extension', wrist_extension: 'wrist_flexion',
  elbow_flexion: 'elbow_extension', elbow_extension: 'elbow_flexion',
  index_flexion: 'index_extension', index_extension: 'index_flexion',
  thumb_mcp_flexion: 'thumb_mcp_extension', thumb_mcp_extension: 'thumb_mcp_flexion',
  // R558: the spread's anatomical opposite is now its own action (palmar interossei); relax_release still lets go too.
  spread_fingers: 'fingers_together', fingers_together: 'spread_fingers',
  middle_flexion: 'middle_extension', middle_extension: 'middle_flexion',
  ring_flexion: 'ring_extension', ring_extension: 'ring_flexion',
  little_flexion: 'little_extension', little_extension: 'little_flexion',
  thumb_opposition: 'thumb_reposition', thumb_reposition: 'thumb_opposition',
  // BODYMAP: the left shoulder's swings
  shoulder_flexion: 'shoulder_extension', shoulder_extension: 'shoulder_flexion',
  shoulder_abduction: 'shoulder_adduction', shoulder_adduction: 'shoulder_abduction',
  // 21 November 2026 (H8): the wrist's sideways bends move the hand now (ns-rig wrist_dev)
  wrist_radial_deviation: 'wrist_ulnar_deviation', wrist_ulnar_deviation: 'wrist_radial_deviation'
});
/** R558: game-arm actions that move nothing: they light and move nothing. Empty since 21 November 2026 (H8): the two
 * sideways wrist bends were the only ones, and the game arm's wrist now bends sideways (ns-rig wrist_dev). */
const DISPLAY_ONLY_ARM_IDS = Object.freeze([]);
/** The hand's own movements (a relax press sends every one of them under way into its return). */
const HAND_ACTION_IDS = Object.freeze(['grasp_close', 'open_hand', 'spread_fingers', 'index_flexion', 'index_extension', 'thumb_mcp_flexion', 'thumb_mcp_extension',
  'fingers_together', 'middle_flexion', 'middle_extension', 'ring_flexion', 'ring_extension', 'little_flexion', 'little_extension',
  'thumb_opposition', 'thumb_reposition']);

/** 20 November 2026 (Message 206): the contraction notes of a state's body joints (jointId -> [the movement's end angle
 * (degrees), contraction seconds left (>= 0; 0 = on the way back), the side the end is a stop from (-1, 0 none, +1: the
 * joint may not pass the end going that way)]). A joint without a note is at, or springs to, its place (bodyGoal). */
const jerkMapOk = m => m !== null && typeof m === 'object' && !Array.isArray(m)
  && Object.values(m).every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && v[1] >= 0 && (v[2] === -1 || v[2] === 0 || v[2] === 1));
const copyJerkMap = (m, n) => { const o = {}; if (m && typeof m === 'object') for (const k of Object.keys(m)) if (Array.isArray(m[k]) && m[k].length === n && m[k].every(Number.isFinite)) o[k] = m[k].slice(); return o; };
/** 20 November 2026 (Message 206): the game arm's contraction notes (actionId -> [contraction seconds left (>= 0; 0 = on
 * the way back), the pose drive's speed (movements per second)]). */
const armJerkOk = m => m !== null && typeof m === 'object' && !Array.isArray(m)
  && Object.entries(m).every(([k, v]) => ACTION_IDS.includes(k) && Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[0] >= 0);

/**
 * One exact step of a damped spring toward `goal`: x = pos - goal obeys x'' + 2 zeta omega x' + omega^2 x = 0
 * (zeta < 1 under-damped, zeta >= 1 treated as critically damped). Returns [pos, vel] after h seconds; within
 * JOINT_LATCH.snapDeg / snapDegS of the goal it returns the goal itself with speed 0.
 */
export function stepJointSpring(pos, vel, goal, h, omega = JOINT_LATCH.omega, zeta = JOINT_LATCH.zeta) {
  if (!(h > 0)) return [pos, vel];
  const x = pos - goal;
  let nx, nv;
  if (zeta < 1 - 1e-6) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const B = (vel + zeta * omega * x) / wd;
    const e = Math.exp(-zeta * omega * h), c = Math.cos(wd * h), sn = Math.sin(wd * h);
    nx = e * (x * c + B * sn);
    nv = e * ((B * wd - zeta * omega * x) * c - (x * wd + zeta * omega * B) * sn);
  } else {
    const C = vel + omega * x;
    const e = Math.exp(-omega * h);
    nx = (x + C * h) * e;
    nv = (C - omega * (x + C * h)) * e;
  }
  if (Math.abs(nx) < JOINT_LATCH.snapDeg && Math.abs(nv) < JOINT_LATCH.snapDegS) return [goal, 0];
  return [goal + nx, nv];
}

/** First-order approach of d toward target over h seconds (exact exponential step). */
function approach(d, target, h, riseTau, decayTau) {
  if (!(h > 0) || d === target) return d;
  const tau = target > d ? riseTau : decayTau;
  const next = target + (d - target) * Math.exp(-h / tau);
  if (Math.abs(next - target) < SNAP) return target;
  return clamp(next, 0, 1);
}

function countdown(remaining, dt) {
  const r = remaining - dt;
  return r > SNAP ? r : 0;
}

/** Offset (s) of an event into a step of `dt` seconds: `ev.at` when given (finite, >= 0; values past dt count as dt),
 * else 0 (start of the step). */
export function eventOffset(ev, dt) {
  if (!isPlainObject(ev)) fail('activity_event', 'event must be an object');
  if (ev.at === undefined) return 0;
  if (!isFiniteNumber(ev.at) || ev.at < 0) fail('activity_event', 'event.at must be a finite number of seconds >= 0 into the step');
  return Math.min(ev.at, dt);
}

/**
 * Angle in degrees between two gaze directions { yaw, pitch } (radians; ns-brain camera convention
 * dir = (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch))). Chord-based, so it is accurate for tiny angles.
 */
export function gazeAngleDeg(a, b) {
  if (!a || !b || ![a.yaw, a.pitch, b.yaw, b.pitch].every(isFiniteNumber)) {
    fail('activity_gaze', 'gazeAngleDeg needs two { yaw, pitch } objects with finite radians');
  }
  const dir = g => [-Math.sin(g.yaw) * Math.cos(g.pitch), Math.sin(g.pitch), -Math.cos(g.yaw) * Math.cos(g.pitch)];
  const p = dir(a), q = dir(b);
  const chord = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  return (2 * Math.asin(Math.min(1, chord / 2)) * 180) / Math.PI;
}

function reachOptions(options) {
  if (options === undefined || options === null) return REACH_DISPLAY;
  if (!isPlainObject(options)) fail('reach_option', 'reach display options must be an object');
  const o = { ...REACH_DISPLAY };
  for (const k of Object.keys(options)) {
    if (!hasOwn(REACH_DISPLAY, k)) fail('reach_option', `unknown reach display option ${JSON.stringify(k)}`);
    const v = options[k];
    const share = k === 'holdLevel' || k === 'proximalShare' || k === 'horizontalFieldShare';
    if (!(isFiniteNumber(v) && (share ? v >= 0 && v <= 1 : v > 0))) {
      fail('reach_option', `${k} must be ${share ? 'a number in [0, 1]' : 'a positive finite number'}`);
    }
    o[k] = v;
  }
  return Object.freeze(o);
}

/**
 * Key intent of the reach input: { x: D - A, z: W - S } (each -1, 0 or 1; opposite keys cancel on their axis).
 * Accepts `{ axes: { x, z } }` (ns-controls axes()) or `{ keys: { KeyW, KeyA, KeyS, KeyD } }` (ns-controls state.keys);
 * axes wins when both are given. Returns null when the input carries no key intent at all.
 */
export function reachIntent(input) {
  if (!isPlainObject(input)) return null;
  const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
  if (isPlainObject(input.axes)) {
    const { x, z } = input.axes;
    if (!isFiniteNumber(x) || !isFiniteNumber(z)) fail('reach_input', 'axes.x and axes.z must be finite numbers');
    return { x: sgn(x), z: sgn(z) };
  }
  if (isPlainObject(input.keys)) {
    const k = input.keys;
    return { x: (k.KeyD === true ? 1 : 0) - (k.KeyA === true ? 1 : 0), z: (k.KeyW === true ? 1 : 0) - (k.KeyS === true ? 1 : 0) };
  }
  return null;
}

/**
 * PURE reach display target from KEY INTENT plus realised motion (display-only, simulated, unitless 0..1).
 * input: { axes: {x, z} | keys: {KeyW, KeyA, KeyS, KeyD}, depthRate?: m/s, xRate?: NDC/s } where the rates are the
 * REALISED W/S/A/D base motion (not an elbow-pulse or pose-fit movement); a missing rate counts as no motion.
 * Each held axis shows holdLevel + (1 - holdLevel) * min(1, |rate| / fullRate), so a held key shows activity even at
 * the reach limit (rate 0), and moving shows more. Directional mapping (representative, not one-muscle coding):
 *   W (forward reach) -> `ext` (elbow_extension field + proximal reach), S (pull back) -> `flex` (elbow_flexion field
 *   + proximal reach), A/D -> `x` (proximal arm-reach channel; on the strip only, a share on the two most proximal
 *   existing fields). Opposite keys cancel; diagonals combine both axes. No key -> all 0.
 * @returns {{ flex: number, ext: number, x: number }}
 */
export function reachDisplayTarget(input = {}, options) {
  const o = reachOptions(options);
  const intent = reachIntent(input) || { x: 0, z: 0 };
  const motion = (rate, full) => (isFiniteNumber(rate) ? Math.min(1, Math.abs(rate) / full) : 0);
  const level = (axis, m) => (axis === 0 ? 0 : o.holdLevel + (1 - o.holdLevel) * m);
  const depth = level(intent.z, motion(input.depthRate, o.fullDepthRate));
  return {
    flex: intent.z < 0 ? depth : 0,
    ext: intent.z > 0 ? depth : 0,
    x: level(intent.x, motion(input.xRate, o.fullXRate))
  };
}

/** One smoothing step of reach display levels { flex, ext, x } toward reachDisplayTarget(input) over dt seconds.
 * `prev` null/undefined starts from zero. Pure: returns a new object. */
export function stepReachDisplay(prev, input, dt, options) {
  const o = reachOptions(options);
  if (!(isFiniteNumber(dt) && dt >= 0)) fail('reach_dt', 'dt must be a finite number of seconds >= 0');
  const p = prev == null ? { flex: 0, ext: 0, x: 0 } : prev;
  if (!isPlainObject(p) || !unit(p.flex) || !unit(p.ext) || !unit(p.x)) fail('reach_state', 'prev must be { flex, ext, x } levels in 0..1');
  const t = reachDisplayTarget(input, o);
  return {
    flex: approach(p.flex, t.flex, dt, o.riseTau, o.decayTau),
    ext: approach(p.ext, t.ext, dt, o.riseTau, o.decayTau),
    x: approach(p.x, t.x, dt, o.riseTau, o.decayTau)
  };
}

/**
 * Display outputs of reach levels { flex, ext, x } (from stepReachDisplay / reachDisplayTarget):
 *   strip:    { elbow_flexion, elbow_extension } for the cortex field (W/S on their elbow field, A/D as a
 *             horizontalFieldShare on BOTH most proximal existing fields; soft union so diagonals combine);
 *   muscle:   { elbow_flexion, elbow_extension } for muscleDrives: W/S only (the map has no shoulder/arm-reach
 *             muscles, so A/D never tints elbow muscles);
 *   armReach: 0..1 proximal arm-reach channel (A/D, plus proximalShare of W/S) for a labelled HUD bar or an
 *             unmarked display-only proximal field; `label` is ARM_REACH_LABEL.
 */
export function reachDisplayOutputs(levels, options) {
  const o = reachOptions(options);
  if (!isPlainObject(levels) || !unit(levels.flex) || !unit(levels.ext) || !unit(levels.x)) {
    fail('reach_state', 'levels must be { flex, ext, x } in 0..1');
  }
  const h = levels.x * o.horizontalFieldShare;
  return {
    strip: { elbow_flexion: union(levels.flex, h), elbow_extension: union(levels.ext, h) },
    muscle: { elbow_flexion: levels.flex, elbow_extension: levels.ext },
    armReach: union(o.proximalShare * Math.max(levels.flex, levels.ext), levels.x),
    horizontal: levels.x,
    depth: Math.max(levels.flex, levels.ext),
    label: ARM_REACH_LABEL
  };
}

/** Per-action max of two drive maps (ids of `a`, plus any ACTION_IDS in `b`); values clamped to 0..1. For merging
 * reachDisplayOutputs(...).strip / .muscle into displayActivity in an integrator that keeps reach state outside. */
export function mergeDisplayDrives(a, b) {
  if (!isPlainObject(a)) fail('display_merge', 'a must be a drive map');
  const out = {};
  for (const k of Object.keys(a)) out[k] = clamp(isFiniteNumber(a[k]) ? a[k] : 0, 0, 1);
  if (b !== undefined && b !== null) {
    if (!isPlainObject(b)) fail('display_merge', 'b must be a drive map');
    for (const k of Object.keys(b)) {
      if (!ACTION_IDS.includes(k)) fail('display_merge', `unknown action id ${JSON.stringify(k)}`);
      const v = clamp(isFiniteNumber(b[k]) ? b[k] : 0, 0, 1);
      out[k] = Math.max(hasOwn(out, k) ? out[k] : 0, v);
    }
  }
  return out;
}

const isLastSuppressed = v => v === null
  || (isPlainObject(v) && ACTION_IDS.includes(v.actionId) && typeof v.source === 'string' && nonNegative(v.t));
const TRIGGER_SOURCES = Object.freeze(['gaze', 'moved', 'click', 'dwell']);

// ---------------------------------------------------------------------------------------------
// U1-controls round 2: whole-body motor map, forearm rotation, brain grab/orbit, instructions
// ---------------------------------------------------------------------------------------------

/** Forearm rotation channels of the left arm. They are NOT movement-map actions (the pinned MOVEMENT-MAP has no
 * pronation/supination action and no pronator/supinator catalog key), so they never enter composePose or
 * muscleDrives; see rotationOutputs(). */
export const ROTATION_ACTION_IDS = Object.freeze(['pronation', 'supination']);
/** Every left-arm action id a BODY_MOTOR_MAP left-arm region action may name as `armActionId`. */
export const ARM_ACTION_IDS = Object.freeze([...ACTION_IDS, ...ROTATION_ACTION_IDS]);
/** Persistent forearm postures toggled by a Space double-tap. */
export const ROTATION_STATES = Object.freeze(['pronated', 'supinated']);
/** Joint ids of the non-left-arm body (shared interface 2); bodyJointTargets always carries every one (0 = neutral). */
export const BODY_JOINT_IDS = Object.freeze([
  'hip_flex_L', 'hip_flex_R', 'hip_abd_L', 'hip_abd_R', 'knee_ext_L', 'knee_ext_R', 'ankle_dorsi_L', 'ankle_dorsi_R',
  'toe_flex_L', 'toe_flex_R',
  'trunk_flex', 'neck_flex', 'neck_rot', 'jaw_open', 'brow_raise', 'eye_close', 'lip_purse', 'smile',
  'r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex', 'r_wrist_flex', 'r_wrist_ext', 'r_grasp', 'r_open', 'r_pronation',
  // R558 (Messages 14 / 15 / 2): the new joints of ns-bodymap / ns-body BODY_JOINT_IDS (same order).
  'ankle_inv_L', 'ankle_inv_R', 'hallux_flex_L', 'hallux_flex_R', 'trunk_side', 'trunk_rot', 'neck_side', 'jaw_side',
  'hyoid_elev', 'nose_wrinkle', 'upper_lip', 'lower_lip',
  'r_wrist_dev', 'r_thumb_flex', 'r_thumb_opp', 'r_index_flex', 'r_middle_flex', 'r_ring_flex', 'r_little_flex', 'r_finger_spread',
  // R558 (Space dance): the right upper arm's and both hips' rotation about their own long axes (+ = external).
  'r_shoulder_rot', 'hip_rot_L', 'hip_rot_R',
  // 18 November 2026: the whole leg's turn about its own length, led by the foot (ns-body LEG_TURN; + = outward).
  'leg_turn_L', 'leg_turn_R'
]);
/** R558 (Space dance): the body joints the dance turns (ns-dance DANCE_LIMBS minus the game arm's own two). */
export const DANCE_BODY_JOINTS = Object.freeze(DANCE_JOINT_IDS.filter(j => j !== 'l_forearm' && j !== 'l_shoulder_rot'));
/**
 * R558 (Space dance): the motor areas that light while a limb turns, per dance joint (in proportion to its turning
 * speed; simulated display), and the muscles that turn it, by direction (opening = supination / external rotation,
 * closing = pronation / internal rotation), by their usual textbook roles. Names are matched like every map muscle
 * name; muscles the packets do not have simply match nothing. R558 (builder AN): the deep hip rotators, gluteus minimus
 * and tensor fasciae latae are drawn now (packets/missing-muscles-r1). With the hips bent 90 degrees (long sitting)
 * the obturators, the gemelli and quadratus femoris still turn the thigh outward with gluteus maximus and sartorius,
 * while piriformis turns it inward with tensor fasciae latae, gluteus minimus and the front fibres of gluteus medius
 * (piriformis reverses its action past about 60 degrees of hip flexion; standard anatomy). Left-arm muscles come from
 * ROTATION_MUSCLES (forearm turners and shoulder rotators).
 */
export const DANCE_AREAS = Object.freeze({
  l_forearm: Object.freeze(['rh_forearm']), l_shoulder_rot: Object.freeze(['rh_shoulder']),
  r_pronation: Object.freeze(['lh_forearm']), r_shoulder_rot: Object.freeze(['lh_shoulder']),
  hip_rot_L: Object.freeze(['rh_hip']), hip_rot_R: Object.freeze(['lh_hip']),
  // 18 November 2026: the legs' turn is one joint per leg, led by the foot (ns-body LEG_TURN): the ankle's area first
  // (it leads), then the knee's and the hip's (the shank and the thigh follow).
  leg_turn_L: Object.freeze(['rh_ankle', 'rh_knee', 'rh_hip']), leg_turn_R: Object.freeze(['lh_ankle', 'lh_knee', 'lh_hip'])
});
export const DANCE_MUSCLES = deepFreeze({
  r_pronation: { open: ['right supinator', 'right biceps brachii'], closed: ['right pronator teres', 'right pronator quadratus'] },
  r_shoulder_rot: {
    open: ['right infraspinatus', 'right teres minor', 'spinal part of right deltoid'],
    closed: ['right subscapularis', 'right pectoralis major', 'right latissimus dorsi', 'right teres major', 'clavicular part of right deltoid']
  },
  hip_rot_L: { open: ['left gluteus maximus', 'left sartorius', 'left obturator internus', 'left obturator externus', 'left gemellus superior', 'left gemellus inferior', 'left quadratus femoris'],
    closed: ['left gluteus medius', 'left gluteus minimus', 'left tensor fasciae latae', 'left piriformis'] },
  hip_rot_R: { open: ['right gluteus maximus', 'right sartorius', 'right obturator internus', 'right obturator externus', 'right gemellus superior', 'right gemellus inferior', 'right quadratus femoris'],
    closed: ['right gluteus medius', 'right gluteus minimus', 'right tensor fasciae latae', 'right piriformis'] },
  // 18 November 2026: the leg turn (ns-body LEG_TURN), by the usual textbook roles, from the foot up. Outward (open):
  // the foot's everters and abductors (the fibular muscles, extensor digitorum longus), the bent knee's outward turner
  // (biceps femoris) and the hip's outward turners. Inward (closed): tibialis posterior and anterior at the foot, the
  // bent knee's inward turners (popliteus, semitendinosus, semimembranosus, gracilis, sartorius) and the hip's inward
  // turners (the front of gluteus medius and minimus, tensor fasciae latae).
  ...Object.fromEntries([['L', 'left'], ['R', 'right']].map(([S, side]) => [`leg_turn_${S}`, {
    open: [`${side} fibularis longus`, `${side} fibularis brevis`, `${side} fibularis tertius`, `${side} extensor digitorum longus`, `${side} biceps femoris`,
      `${side} gluteus maximus`, `${side} obturator internus`, `${side} obturator externus`, `${side} gemellus superior`, `${side} gemellus inferior`, `${side} quadratus femoris`],
    closed: [`${side} tibialis posterior`, `${side} tibialis anterior`, `${side} popliteus`, `${side} semitendinosus`, `${side} semimembranosus`, `${side} gracilis`, `${side} sartorius`,
      `${side} gluteus medius`, `${side} gluteus minimus`, `${side} tensor fasciae latae`]
  }]))
});
/** Gaze kinds: ns-brain classifyGaze's 'region' | 'glass' (brain, not a motor region) | 'empty', plus the legacy
 * focus-strip 'strip' (an event with only an arm actionId). */
export const GAZE_KINDS = Object.freeze(['region', 'glass', 'empty', 'strip']);
/** Orbit arrow directions. */
export const ORBIT_DIRS = Object.freeze(['left', 'right', 'forward', 'back']);
/**
 * Orbit view limits (degrees) around the default (overhead, anterior to the top of the screen, tilted) brain view; the
 * brain centre stays locked and the player does not move. The same convention and default values as ns-brain
 * BRAIN_VIEW / ORBIT_DIRECTIONS / brainViewTransform (owner U2a): orbit.yaw > 0 = the viewpoint has moved toward screen
 * right ('right' arrow; 'left' shows the right hemisphere's medial wall), orbit.pitch > 0 = toward the front (anterior,
 * screen top; 'forward' arrow). One click = stepDeg. ns-brain frameBrain keeps the brain beyond reach for every orbit
 * WITHIN ITS limits, so keep these at or inside BRAIN_VIEW's (createActivity({ orbit }) can pass them explicitly).
 */
export const ORBIT = Object.freeze({ stepDeg: 15, yawLimitDeg: 60, pitchMinDeg: -30, pitchMaxDeg: 30 });
/** R5-input (R23, D19): orbit event targets the ACTIVITY applies: only 'brain' (the round-2 orbit above). The mirror
 * body's orbit belongs to ns-mirror (R5-mirror: createMirrorState / mirrorOrbitStep / resetMirror); an orbit event or
 * orbitStep for target 'mirror' is refused here so that one state never has two owners (ns-controls stepArrowInput
 * requests carry their target; ns-app routes 'mirror' ones to ns-mirror). */
export const ORBIT_TARGETS = Object.freeze(['brain']);
/** R5-input (R21, D17): glow links are listed for levels above minLevel (a fading envelope below it draws nothing). */
export const GLOW_LINKS = Object.freeze({ minLevel: 0.02 });
/** R5-input (D17): the plain honesty label of the glow links (the text owner may shorten it; keep its meaning). */
export const GLOW_LINK_LABEL = 'The glow shows which brain area drives which muscles in this game. It is a picture, not a nerve: ' +
  'real signals go from the brain down the spinal cord and along nerves to the muscles. All activity here is simulated.';
/** Brain drag limit: |pitch offset| of the dragged brain placement (degrees). Yaw wraps freely. */
/* 19 November 2026 (a check: a held brain stopped following the look about 72 degrees up while the view went on to 88,
 * so on letting go you were no longer looking at where you held it): 75 -> 88, the view's own limit (ns-app HEAD_LOOK
 * viewUpDeg / viewDownDeg). */
export const BRAIN_GRAB = Object.freeze({ pitchLimitDeg: 88 });
/** Double-tap window in seconds (press to press), from ns-controls DOUBLE_TAP_MS. */
export const DOUBLE_TAP_SECONDS = DOUBLE_TAP_MS / 1000;
/**
 * Forearm rotation defaults. defaultState 'supinated' since 18 November 2026 (the owner: "we start the game in an
 * underside view of the limbs": palm up, the front of the forearm showing; it was 'pronated' before; the BodyParts3D
 * rest pose is the anatomical, supinated position). A double-tap commands the other posture: the display
 * envelope of the commanded channel lasts commandSeconds (UI timing), the pose value eases with poseTau.
 * R3-arm: poseTau is the time constant (1/omega) of a CRITICALLY DAMPED ease (stepRotationEase) instead of a
 * first-order lag. The first-order lag (round 2, tau 0.1 s) started at full speed and covered 55 % of the flip in the
 * first 80 ms (a snap, then a slow settle); the critically damped ease starts from rest and accelerates smoothly, still
 * moves the forearm by about 16 deg within 33 ms (visible within two frames) and reaches 95 % at about 4.74 * poseTau
 * = 0.30 s, the same settle time as before. A double-tap mid-flip reverses without a jump (the speed carries over).
 * pronationRangeDeg is a SUGGESTED rig mapping: value 0 (pronated) = this many degrees of pronation away from the
 * anatomical (supinated) rest, value 1 (supinated) = 0. The rig owner (ns-arm/ns-rig) clamps and may choose its own.
 */
export const ROTATION = Object.freeze({ defaultState: 'supinated', commandSeconds: 0.5, poseTau: 1 / 16, pronationRangeDeg: 150,
  // R5-pronation (R27): the pose ease under prefers-reduced-motion (pass createActivity({ rotationTau:
  // ROTATION.reducedMotionPoseTau })): 95 % at about 0.15 s instead of 0.30 s; shorter, still eased (no snap). The whole
  // coupled motion (ns-arm ROTATION_COUPLING: upper arm, shoulder blade, trunk) follows the same eased value.
  reducedMotionPoseTau: 1 / 32 });

/**
 * One exact step of the critically damped forearm-rotation ease (R3-arm): value x (0 pronated .. 1 supinated) and its
 * speed v (per second) toward goal g over h seconds with time constant tau (omega = 1 / tau):
 *   e(t) = (e0 + (v0 + omega e0) t) exp(-omega t),  v(t) = (v0 - omega (v0 + omega e0) t) exp(-omega t),  e = x - g.
 * Exact for any step length, so the ease is frame-rate independent. The value is kept in [0, 1] (a clamp stops it).
 * Pure; returns { value, speed }.
 */
export function stepRotationEase(value, speed, goal, h, tau = ROTATION.poseTau) {
  const v0 = isFiniteNumber(speed) ? speed : 0;
  if (!(h > 0) || !(tau > 0)) return { value, speed: v0 };
  const w = 1 / tau;
  const e0 = value - goal;
  const k = Math.exp(-w * h);
  const c = v0 + w * e0;
  let e = (e0 + c * h) * k;
  let v = (v0 - w * c * h) * k;
  if (Math.abs(e) < SNAP && Math.abs(v) < 1e-6) { e = 0; v = 0; }
  let x = goal + e;
  if (x < 0 || x > 1) { x = clamp(x, 0, 1); v = 0; }
  return { value: x, speed: v };
}
/**
 * Representative forearm rotators by mesh-name fragment (standard anatomy; display roles only, not EMG or force).
 * R5-pronation (R27): `shoulder` lists the shoulder rotators that turn the upper arm with the forearm (ns-arm
 * ROTATION_COUPLING), by standard muscle roles: toward palm down (pronation) the upper arm turns INWARD (internal
 * rotation: subscapularis, teres major, pectoralis major, latissimus dorsi, the front (clavicular) part of the deltoid); toward palm up
 * (supination) OUTWARD (external rotation: infraspinatus, teres minor, the back (spinal) part of the deltoid). The
 * fragments match mesh names case-insensitively: the left-arm view-model draws the two deltoid parts; the left pectoralis
 * major and (R558, builder AN: packets/missing-muscles-r1) the left latissimus dorsi are full-body meshes (ns-body
 * rotationBodyDrives lights them, left side only); subscapularis, teres major,
 * infraspinatus and teres minor are in the left-arm packet but not drawn in first person (ns-assets
 * SHOULDER_GIRDLE_EXCLUDED), so they light only where an integrator draws them. Their display level is
 * ROTATION_SHOULDER_LEVEL of the forearm turn's (the forearm does most of the turn).
 */
export const ROTATION_MUSCLES = deepFreeze({
  pronation: { agonists: ['pronator teres', 'pronator quadratus'], antagonists: ['supinator', 'biceps brachii'],
    shoulder: ['subscapularis', 'teres major', 'pectoralis major', 'latissimus dorsi', 'clavicular part of left deltoid'] },
  supination: { agonists: ['supinator', 'biceps brachii'], antagonists: ['pronator teres', 'pronator quadratus'],
    shoulder: ['infraspinatus', 'teres minor', 'spinal part of left deltoid'] }
});
/** R5-pronation: display level of the shoulder rotators relative to the forearm turn's display (a display choice: they
 * help, the forearm muscles do most of the turn). Simulated, unitless. */
export const ROTATION_SHOULDER_LEVEL = 0.6;
/** R5-pronation (R27, R17): one plain sentence for the panel / Esc page (text owner's choice where), saying what the
 * coupled palm turn shows and that it is a picture of normal joint movement in this game, not a measurement. */
export const ROTATION_FOLLOW_TEXT = 'When your palm turns, your upper arm turns at the shoulder too, more when the elbow is straight. ' +
  'Your shoulder blade and upper body follow a little. This shows normal joint movement in this game; it is not a measurement.';
/** R5-pronation (R17 plain language): plain names, technical name in brackets, for every ROTATION_MUSCLES fragment. */
export const ROTATION_MUSCLE_PLAIN = deepFreeze({
  'pronator teres': 'forearm turner near the elbow (pronator teres)',
  'pronator quadratus': 'forearm turner near the wrist (pronator quadratus)',
  supinator: 'forearm turner on the outer side (supinator)',
  'biceps brachii': 'front upper-arm muscle (biceps brachii)',
  subscapularis: 'muscle under the shoulder blade (subscapularis)',
  'teres major': 'round muscle below the shoulder blade (teres major)',
  'pectoralis major': 'chest muscle (pectoralis major)',
  'latissimus dorsi': 'broad back muscle (latissimus dorsi)',
  'clavicular part of left deltoid': 'front of the shoulder muscle (front deltoid)',
  infraspinatus: 'muscle on the back of the shoulder blade (infraspinatus)',
  'teres minor': 'small round muscle on the shoulder blade (teres minor)',
  'spinal part of left deltoid': 'back of the shoulder muscle (back deltoid)'
});
/** Instructions overlay defaults: intro shown for introSeconds at start (not paused); an Esc arriving within
 * escLockDedupeSeconds of a lock-loss overlay is the same gesture; resumeOnLock: re-acquiring pointer lock resumes. */
export const INSTRUCTIONS = Object.freeze({ introSeconds: 2, escLockDedupeSeconds: 0.5, resumeOnLock: true });
export const INSTRUCTION_REASONS = Object.freeze(['intro', 'escape', 'lock-lost', 'pause']);
/** WASD coordinated (shoulder + elbow + wrist + hand) display channels. */
export const WASD_CHANNELS = Object.freeze(['shoulder', 'elbow', 'wrist', 'hand']);
/**
 * WASD joint-channel display shares (display-only game convention, not a measured synergy):
 *   shoulder  every reach key (the representative proximal reach field; direction is not a place on the cortex);
 *   elbow     W/S (elbow extension/flexion change the hand depth), plus elbowXShare of A/D (0 since R558);
 *   wrist     wristShare of any reach key (0 since R558);
 *   hand      handShare of any reach key (0 since R558).
 * R558 (Messages 48 and 50: "The entire left arm region activates, where only small regions should be activating"): a
 * reach key lights the shoulder area (every key) and the elbow area (W and S only): the two parts that move the hand.
 * The wrist, hand and finger areas stay dark until they are used themselves.
 * Each held channel shows holdLevel + (1 - holdLevel) * motion (REACH_DISPLAY), where motion is the realised base
 * rate, or the realised joint rate (deg/s, saturating at fullJointRateDegS) when the reach event carries jointRates.
 */
export const REACH_JOINT_DISPLAY = Object.freeze({ elbowXShare: 0, wristShare: 0, handShare: 0, fullJointRateDegS: 90 });
export const WASD_JOINT_LABEL =
  'simulated reach activity (display-only, unitless): the shoulder share of every reach key and the elbow share of W and S are a game convention, not a measured synergy';

/**
 * R558 (Message 50: "it's not even showing which muscles are activating when we're using the D key and ... the A key"):
 * the muscles each reach key shows, and the brain area that drives them. Display only: standard textbook roles of the
 * shoulder muscles, simulated and unitless, not a measured pattern (the elbow muscles of W and S are shown by the
 * elbow_extension / elbow_flexion actions as before).
 *   forward (W)  the hand goes forward: the shoulder flexes (front deltoid, coracobrachialis, upper pectoralis major);
 *   back (S)     the hand comes back: the shoulder extends (rear deltoid, teres major, latissimus dorsi);
 *   left (A)     the left hand swings out, away from the midline: horizontal abduction (rear and middle deltoid,
 *                infraspinatus, teres minor);
 *   right (D)    the left hand swings in, across the chest: horizontal adduction (pectoralis major, front deltoid,
 *                coracobrachialis).
 * arm: lower-case name parts of the left-arm rig's meshes; body: plain names of body rig muscles (ns-body
 * bodyMuscleDrives rows). areaId: the area whose colour they take and to which their line runs.
 * Not drawn: the left teres major, infraspinatus and teres minor lie on the shoulder blade, which the left-arm rig
 * leaves out (ns-assets SHOULDER_GIRDLE_EXCLUDED), so their name parts match no mesh and only the drawn muscles light;
 * the information card (ns-text REACH_INFO) still names them.
 */
export const REACH_MUSCLES = Object.freeze({
  areaId: 'rh_shoulder',
  forward: Object.freeze({ label: 'Reach forward', arm: Object.freeze(['clavicular part of left deltoid', 'left coracobrachialis']), body: Object.freeze(['clavicular part of left pectoralis major']) }),
  back: Object.freeze({ label: 'Pull back', arm: Object.freeze(['spinal part of left deltoid', 'left teres major']), body: Object.freeze(['left latissimus dorsi']) }),
  left: Object.freeze({ label: 'Swing out to the left', arm: Object.freeze(['spinal part of left deltoid', 'acromial part of left deltoid', 'left infraspinatus', 'left teres minor']), body: Object.freeze([]) }),
  right: Object.freeze({ label: 'Swing in to the right', arm: Object.freeze(['clavicular part of left deltoid', 'left coracobrachialis']), body: Object.freeze(['left pectoralis major']) })
});
export const REACH_DIRECTIONS = Object.freeze(['forward', 'back', 'left', 'right']);

/**
 * PURE: the reach directions shown now. levels: the reach display levels { flex, ext, x } (state.wasd); xSign: the
 * sign of the last held A/D intent (-1 = A, +1 = D; the x level itself is unsigned, and keeps fading in the direction
 * it was last held). Returns [{ dir, level, label, arm, body }] for every direction above minLevel (W = ext, S = flex).
 */
export function reachMuscleShow(levels, xSign, minLevel = 0.02) {
  const out = [];
  if (!isPlainObject(levels)) return out;
  const lv = { forward: levels.ext, back: levels.flex, left: xSign < 0 ? levels.x : 0, right: xSign > 0 ? levels.x : 0 };
  for (const dir of REACH_DIRECTIONS) {
    const level = lv[dir];
    if (!(isFiniteNumber(level) && level > minLevel)) continue;
    const m = REACH_MUSCLES[dir];
    out.push({ dir, level: clamp(level, 0, 1), label: m.label, arm: m.arm, body: m.body });
  }
  return out;
}

const KEY_DISPLAY_IDS = Object.freeze(['grasp_close', 'open_hand', 'relax_release']);
/**
 * 22 November 2026 (browser hunt of update 64, H5; the owner, Message 206: "in returning to its previous place, you
 * won't see corresponding activity and muscle activation. It will just return"; section 174: the four limbs close and
 * open together). What letting go of the Space grip does to the game arm's LEFT hand:
 *  openOnRelease  false: the hand goes back to its place (the pose drive's grip share eases to 0 at armPoseTau, about
 *                 0.1 s), unlit, the same way as the right hand and the toes (ns-app GRIP_BOTH), and no "open hand"
 *                 movement is switched on. true: the rule of 18 November (Message 48): the release switched on open_hand
 *                 for spaceOpenSeconds (0.6 s): the hand opened past neutral, its finger straighteners and the strip's
 *                 Left hand area lit for 0.6 s and, with that area in view, a light beam ran from it to both bodies for
 *                 about half a second after every carry (measured on update 64: the beam from about 0.08 s to 0.55 s
 *                 after the release, the right hand and the toes dark from about 0.14 s). Only the left hand had it,
 *                 because only the game arm has a timed open_hand action.
 * Kept behind the switch, not deleted. A display choice of this game, not a claim about real hands.
 */
export const GRIP_RELEASE = Object.freeze({ openOnRelease: false });
const HEMISPHERES = Object.freeze(['right', 'left', 'both']);
const BODY_SIDES = Object.freeze(['left', 'right', 'midline']);
const ARM_ACTION_CHANNEL = Object.freeze({
  elbow_flexion: 'elbow', elbow_extension: 'elbow', wrist_flexion: 'wrist', wrist_extension: 'wrist',
  wrist_radial_deviation: 'wrist', wrist_ulnar_deviation: 'wrist',
  pronation: 'forearm', supination: 'forearm',
  shoulder_flexion: 'shoulder', shoulder_extension: 'shoulder', shoulder_abduction: 'shoulder', shoulder_adduction: 'shoulder'
}); // every other arm action -> 'hand'
const EFFECTOR_CHANNELS = Object.freeze([
  [/shoulder|upper[\s_-]?arm|proximal|arm[\s_-]?reach/i, 'shoulder'], [/elbow/i, 'elbow'],
  [/forearm|pronat|supinat/i, 'forearm'], [/wrist/i, 'wrist'], [/hand|finger|digit|thumb|grasp|grip|palm/i, 'hand']
]);

/** An empty body motor map (no regions): the model then behaves like the round-1 arm-only model. */
export const EMPTY_BODY_MAP = deepFreeze({ version: 'none', caveats: [], citations: [], regions: [] });

/** Key of a body (non-left-arm) region action in bodyDrive / bodyDisplay / pulseBody. */
export const bodyActionKey = (regionId, actionId) => `${regionId}/${actionId}`;

const isBoundBodyMap = m => m !== null && typeof m === 'object' && m.regions instanceof Map;

/**
 * Validate a BODY_MOTOR_MAP (ns-bodymap.mjs, shared interface 2) and bind it. Structural rules only (ids, sides,
 * extents, arm action ids, joint degrees); the scientific content is the map owner's. Left-arm region actions name
 * an ARM_ACTION_IDS entry (or null, a display-only region action); every other region's armActionId must be null and
 * its `joints` drive bodyJointTargets. Left-arm `joints` are kept for information only (the arm pose comes from
 * ACTION_TARGETS and the ns-arm IK).
 * @returns frozen { version, caveats, regions: Map(id -> region), regionIds, leftArmRegionIds, bodyActions:
 *   Map(key -> { key, regionId, actionId, label, joints, agonists, antagonists }), bodyActionKeys, jointIds,
 *   armActionRegion: Map(armActionId -> regionId) } where each region also lists armActionIds and the WASD/key
 *   display `channels` ('shoulder' | 'elbow' | 'wrist' | 'hand' | 'forearm') it represents.
 */
export function bindBodyMap(map) {
  if (isBoundBodyMap(map)) return map;
  if (!isPlainObject(map) || !Array.isArray(map.regions)) fail('bodymap_shape', 'body motor map must be an object with a regions array');
  const str = (v, what) => {
    if (typeof v !== 'string' || v.trim() === '') fail('bodymap_region', `${what} must be a non-empty string`);
    return v;
  };
  const names = (v, what) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) fail('bodymap_action', `${what} must be an array of muscle names`);
    return [...v];
  };
  const regions = [];
  const seen = new Set();
  const jointIds = new Set(BODY_JOINT_IDS);
  map.regions.forEach((r, i) => {
    if (!isPlainObject(r)) fail('bodymap_region', `regions[${i}] must be an object`);
    const id = str(r.id, `regions[${i}].id`);
    if (seen.has(id)) fail('bodymap_duplicate', `duplicate region id ${JSON.stringify(id)}`);
    seen.add(id);
    if (!HEMISPHERES.includes(r.hemisphere)) fail('bodymap_region', `region ${id} hemisphere must be one of ${HEMISPHERES.join(', ')}`);
    if (r.bodySide !== undefined && r.bodySide !== null && !BODY_SIDES.includes(r.bodySide)) {
      fail('bodymap_region', `region ${id} bodySide must be one of ${BODY_SIDES.join(', ')}`);
    }
    if (typeof r.isLeftArm !== 'boolean') fail('bodymap_region', `region ${id} isLeftArm must be a boolean`);
    const ext = r.extent;
    if (!Array.isArray(ext) || ext.length !== 2 || !ext.every(isFiniteNumber) || ext[0] > ext[1]) {
      fail('bodymap_region', `region ${id} extent must be [u0, u1] finite with u0 <= u1`);
    }
    if (!Array.isArray(r.actions)) fail('bodymap_region', `region ${id} actions must be an array`);
    const actionIds = new Set();
    const actions = r.actions.map((a, k) => {
      if (!isPlainObject(a)) fail('bodymap_action', `region ${id} actions[${k}] must be an object`);
      const aid = str(a.id, `region ${id} actions[${k}].id`);
      if (actionIds.has(aid)) fail('bodymap_duplicate', `region ${id} has duplicate action id ${JSON.stringify(aid)}`);
      actionIds.add(aid);
      const arm = a.armActionId === undefined ? null : a.armActionId;
      if (r.isLeftArm) {
        if (arm !== null && !ARM_ACTION_IDS.includes(arm)) {
          fail('bodymap_arm_action', `region ${id} action ${aid} armActionId ${JSON.stringify(arm)} is not one of ${ARM_ACTION_IDS.join(', ')}`);
        }
      } else if (arm !== null) {
        fail('bodymap_arm_action', `region ${id} is not a left-arm region, so action ${aid} armActionId must be null`);
      }
      const joints = {};
      if (a.joints !== undefined && a.joints !== null) {
        if (!isPlainObject(a.joints)) fail('bodymap_action', `region ${id} action ${aid} joints must be an object of jointId -> degrees`);
        for (const [j, v] of Object.entries(a.joints)) {
          if (!isFiniteNumber(v)) fail('bodymap_action', `region ${id} action ${aid} joint ${j} must be a finite number of degrees`);
          joints[j] = v;
          if (!r.isLeftArm) jointIds.add(j);
        }
      }
      return {
        id: aid, label: typeof a.label === 'string' ? a.label : aid, armActionId: arm, joints,
        agonists: names(a.agonists, `region ${id} action ${aid} agonists`),
        antagonists: names(a.antagonists, `region ${id} action ${aid} antagonists`),
        // (BODYMAP, data for how an activation runs: this movement's end is a stop for the contraction, which must not
        // overshoot past it; "Swing thigh in" ends with the legs side by side)
        ...(a.jerkStop === true ? { jerkStop: true } : {})
      };
    });
    const armActionIds = [...new Set(actions.map(a => a.armActionId).filter(x => x !== null))];
    const channels = new Set();
    if (r.isLeftArm) {
      const text = `${typeof r.effector === 'string' ? r.effector : ''} ${typeof r.label === 'string' ? r.label : ''}`;
      for (const [re, c] of EFFECTOR_CHANNELS) if (re.test(text)) channels.add(c);
      for (const a of armActionIds) channels.add(hasOwn(ARM_ACTION_CHANNEL, a) ? ARM_ACTION_CHANNEL[a] : 'hand');
    }
    regions.push(deepFreeze({
      id, label: typeof r.label === 'string' ? r.label : id, hemisphere: r.hemisphere,
      bodySide: r.bodySide === undefined ? null : r.bodySide, effector: typeof r.effector === 'string' ? r.effector : null,
      order: isFiniteNumber(r.order) ? r.order : i, extent: [ext[0], ext[1]], core: Array.isArray(r.core) && r.core.length === 2 && isFiniteNumber(r.core[0]) && isFiniteNumber(r.core[1]) && r.core[0] < r.core[1] ? [r.core[0], r.core[1]] : null, medialSurface: r.medialSurface === true,
      isLeftArm: r.isLeftArm, actions, armActionIds, channels: [...channels],
      explanation: typeof r.explanation === 'string' ? r.explanation : null,
      citationKeys: Array.isArray(r.citationKeys) ? r.citationKeys.filter(k => typeof k === 'string') : []
    }));
  });
  const bodyActions = [];
  for (const r of regions) {
    if (r.isLeftArm) continue;
    for (const a of r.actions) {
      const key = bodyActionKey(r.id, a.id);
      bodyActions.push([key, deepFreeze({
        key, regionId: r.id, actionId: a.id, label: a.label, joints: { ...a.joints },
        agonists: [...a.agonists], antagonists: [...a.antagonists], ...(a.jerkStop === true ? { jerkStop: true } : {})
      })]);
    }
  }
  // Legacy arm-only gaze (an arm actionId without regionId) resolves to the most medial left-arm region listing it.
  const armRegion = new Map();
  const leftArm = regions.filter(r => r.isLeftArm).sort((a, b) => a.order - b.order);
  for (const r of leftArm) for (const a of r.armActionIds) if (!armRegion.has(a)) armRegion.set(a, r.id);
  return Object.freeze({
    version: map.version === undefined ? null : map.version,
    caveats: deepFreeze(Array.isArray(map.caveats) ? map.caveats.filter(c => typeof c === 'string') : []),
    regions: lockedMap(regions.map(r => [r.id, r])),
    regionIds: Object.freeze(regions.map(r => r.id)),
    leftArmRegionIds: Object.freeze(leftArm.map(r => r.id)),
    bodyActions: lockedMap(bodyActions),
    bodyActionKeys: Object.freeze(bodyActions.map(([k]) => k)),
    jointIds: Object.freeze([...jointIds]),
    armActionRegion: lockedMap([...armRegion])
  });
}

function checkBodyLimits(limitsMap) {
  if (!isPlainObject(limitsMap)) fail('activity_option', 'bodyJointLimits must be an object of jointId -> [lo, hi] degrees');
  const out = {};
  for (const [j, r] of Object.entries(limitsMap)) {
    const lo = Array.isArray(r) ? r[0] : r && r.min;
    const hi = Array.isArray(r) ? r[1] : r && r.max;
    if (!(isFiniteNumber(lo) && isFiniteNumber(hi) && lo <= hi)) fail('activity_option', `bodyJointLimits.${j} must be [lo, hi] with lo <= hi`);
    out[j] = [lo, hi];
  }
  return Object.freeze(out);
}

/**
 * PURE body joint composition from body-action pose drives ({ [bodyActionKey]: 0..1 }): per joint,
 * sum over the actions defining it of (d_a / max(1, sum of d)) * joints_a (neutral 0), so competing actions blend
 * and never exceed their own full targets; then clamped to `limits` ({ jointId: [lo, hi] }) when given. Every
 * binding joint id is present (0 when undriven).
 */
export function composeBodyJoints(binding, drives = {}, limits = null) {
  const b = bindBodyMap(binding);
  const out = zeroMap(b.jointIds);
  const total = {};
  const acts = [];
  for (const key of Object.keys(drives)) {
    const act = b.bodyActions.get(key);
    if (!act) fail('body_unknown_action', `unknown body action ${JSON.stringify(key)}`);
    const d = drives[key];
    if (!isFiniteNumber(d)) fail('body_drive', `drive for ${key} must be a finite number`);
    const v = clamp(d, 0, 1);
    if (v > 0) {
      acts.push([act, v]);
      for (const j of Object.keys(act.joints)) total[j] = (total[j] || 0) + v;
    }
  }
  for (const [act, v] of acts) {
    for (const [j, deg] of Object.entries(act.joints)) out[j] += (v / Math.max(1, total[j])) * deg;
  }
  for (const j of Object.keys(out)) {
    let v = out[j];
    if (limits && hasOwn(limits, j)) v = clamp(v, limits[j][0], limits[j][1]);
    out[j] = v + 0;
  }
  return out;
}

function orbitLimits(o) {
  if (o === undefined || o === null) return ORBIT;
  if (!isPlainObject(o)) fail('orbit_option', 'orbit limits must be an object');
  const out = { ...ORBIT };
  for (const k of Object.keys(o)) {
    if (!hasOwn(ORBIT, k)) fail('orbit_option', `unknown orbit option ${JSON.stringify(k)}`);
    if (!isFiniteNumber(o[k])) fail('orbit_option', `${k} must be a finite number of degrees`);
    out[k] = o[k];
  }
  if (!(out.stepDeg > 0 && out.yawLimitDeg >= 0 && out.pitchMinDeg <= 0 && out.pitchMaxDeg >= 0)) {
    fail('orbit_option', 'orbit needs stepDeg > 0, yawLimitDeg >= 0 and pitchMinDeg <= 0 <= pitchMaxDeg');
  }
  return Object.freeze(out);
}

/** PURE orbit step: { yaw, pitch } (degrees) one stepDeg in `dir` ('right' yaw +, 'left' yaw -, 'forward' pitch +,
 * 'back' pitch -), clamped to the limits (yaw +/- yawLimitDeg, pitch pitchMinDeg..pitchMaxDeg). Returns a new object. */
export function stepOrbit(orbit, dir, limits = ORBIT) {
  const o = orbitLimits(limits);
  if (!isPlainObject(orbit) || !isFiniteNumber(orbit.yaw) || !isFiniteNumber(orbit.pitch)) fail('orbit_state', 'orbit must be { yaw, pitch } in degrees');
  if (!ORBIT_DIRS.includes(dir)) fail('orbit_dir', `orbit direction must be one of ${ORBIT_DIRS.join(', ')}, got ${JSON.stringify(dir)}`);
  const dy = dir === 'right' ? o.stepDeg : dir === 'left' ? -o.stepDeg : 0;
  const dp = dir === 'forward' ? o.stepDeg : dir === 'back' ? -o.stepDeg : 0;
  return {
    yaw: clamp(orbit.yaw + dy, -o.yawLimitDeg, o.yawLimitDeg) + 0,
    pitch: clamp(orbit.pitch + dp, o.pitchMinDeg, o.pitchMaxDeg) + 0
  };
}

/** True when one more step in `dir` would change the orbit (for disabling an arrow at its limit). */
export function orbitCanStep(orbit, dir, limits = ORBIT) {
  const next = stepOrbit(orbit, dir, limits);
  return next.yaw !== orbit.yaw || next.pitch !== orbit.pitch;
}

/** orbitStep(state, dir): an activity state (shared interface 4) with its orbit stepped (default limits); the same
 * state when the orbit is already at that limit. Prefer activity.orbitStep(state, dir), which also validates the state
 * and uses the model's own limits. */
export function orbitStep(state, dir, limits = ORBIT) {
  if (!isPlainObject(state) || !isPlainObject(state.orbit)) fail('orbit_state', 'orbitStep needs an activity state with an orbit');
  const orbit = stepOrbit(state.orbit, dir, limits);
  if (orbit.yaw === state.orbit.yaw && orbit.pitch === state.orbit.pitch) return state;
  return { ...state, orbit, orbitSeq: (Number.isSafeInteger(state.orbitSeq) ? state.orbitSeq : 0) + 1, seedNextGaze: true };
}

const wrapPi = a => {
  const t = 2 * Math.PI;
  const r = ((((a + Math.PI) % t) + t) % t) - Math.PI;
  return (r <= -Math.PI ? r + t : r) + 0;
};

/**
 * PURE brain drag placement: while Space is held after a press with the gaze on the brain, the brain keeps its
 * angular offset to the camera: placement = origin + (camera - camera at grab start), yaw wrapped to (-pi, pi],
 * pitch clamped to +/- pitchLimitRad. Radians; the placement is an offset from the default brain placement
 * (ns-brain brainViewTransform grabYaw/grabPitch). Distance and "never within reach" stay ns-brain's job.
 */
export function grabPlacement(grab, yaw, pitch, pitchLimitRad = BRAIN_GRAB.pitchLimitDeg * DEG) {
  if (!isPlainObject(grab) || ![grab.startYaw, grab.startPitch, grab.originYaw, grab.originPitch].every(isFiniteNumber)) {
    fail('grab_state', 'grab needs finite startYaw, startPitch, originYaw and originPitch');
  }
  if (!isFiniteNumber(yaw) || !isFiniteNumber(pitch)) fail('grab_state', 'camera yaw and pitch must be finite radians');
  return {
    yaw: wrapPi(grab.originYaw + (yaw - grab.startYaw)),
    pitch: clamp(grab.originPitch + (pitch - grab.startPitch), -pitchLimitRad, pitchLimitRad) + 0
  };
}

/** R4-arm: event types activityEdges emits (the "Try this" guide's vocabulary, ns-guide.mjs). */
export const ACTIVITY_EDGE_TYPES = Object.freeze(['activate', 'fist', 'flip', 'grab', 'orbit', 'pause', 'resume', 'resetBody']);

const seqOf = (st, k) => (st && Number.isSafeInteger(st[k]) && st[k] >= 0 ? st[k] : null);

/**
 * R4-arm: the plain game events between two consecutive activity states (createActivity state before and after one
 * step), for the optional "Try this" guide (D7) and any HUD that wants edges instead of levels. Pure; reads only
 * documented state fields, all present since round 2 (counters only grow, except that a new state starts again at 0):
 *   spaceHeld         -> { type: 'fist', on }               the slow turn of a double tap held starts / stops (R558,
 *                                                            Message 40; the event keeps its old name)
 *   rotationSeq       -> { type: 'flip', to }                once per double tap of Space (R558: one turn step of all four
 *                                                            limbs); to = rotationState
 *   grabSeq           -> { type: 'grab', on: true }          once per brain grab (a Space hold or tap on the brain)
 *   brainGrab.active  -> { type: 'grab', on: false, dragRad } the grab ended; dragRad = the angle the brain was moved
 *                                                            (brainPlacement vs the grab's origin, radians)
 *   orbitSeq          -> { type: 'orbit', steps, dir }       orbit steps (an arrow click or hold); dir from the orbit change
 *                                                            ('left' | 'right' | 'forward' | 'back' | null when mixed)
 *   paused            -> { type: 'pause' } / { type: 'resume' }
 *   resetSeq          -> { type: 'resetBody' }
 *   pulseSeq + lastTriggerSource 'gaze' | 'click' -> { type: 'activate', regionId, source, isLeftArm }
 *                        a NEW area switched on by a look or a click (look-movement restarts on the same area are not
 *                        new activations). Only the latest start of the step is visible here; ns-app's per-step `marks`
 *                        (stepGated) list every start with its time. isLeftArm needs `binding` (activity.binding,
 *                        bindBodyMap), else null.
 * Keys (W/A/S/D) are not activity edges: the reach intent lives in ns-app (inputs.axes, state.reach).
 * Every event is a virtual game control edge (no signal is read from, or sent to, a body or a brain).
 */
export function activityEdges(prev, next, binding = null) {
  const out = [];
  if (!isPlainObject(prev) || !isPlainObject(next)) return out;
  if (typeof prev.spaceHeld === 'boolean' && typeof next.spaceHeld === 'boolean' && prev.spaceHeld !== next.spaceHeld) {
    out.push({ type: 'fist', on: next.spaceHeld });
  }
  const grow = k => { const a = seqOf(prev, k), b = seqOf(next, k); return a !== null && b !== null && b > a ? b - a : 0; };
  for (let i = grow('rotationSeq'); i > 0; i--) out.push({ type: 'flip', to: typeof next.rotationState === 'string' ? next.rotationState : null });
  for (let i = grow('grabSeq'); i > 0; i--) out.push({ type: 'grab', on: true });
  const g0 = prev.brainGrab, g1 = next.brainGrab;
  if (isPlainObject(g0) && g0.active === true && isPlainObject(g1) && g1.active !== true) {
    const p = next.brainPlacement;
    const ok = isPlainObject(p) && isFiniteNumber(p.yaw) && isFiniteNumber(p.pitch) && isFiniteNumber(g0.originYaw) && isFiniteNumber(g0.originPitch);
    out.push({ type: 'grab', on: false, dragRad: ok ? Math.hypot(p.yaw - g0.originYaw, p.pitch - g0.originPitch) : 0 });
  }
  const steps = grow('orbitSeq');
  if (steps > 0) {
    const o0 = isPlainObject(prev.orbit) ? prev.orbit : null, o1 = isPlainObject(next.orbit) ? next.orbit : null;
    let dir = null;
    if (o0 && o1 && isFiniteNumber(o0.yaw) && isFiniteNumber(o1.yaw) && isFiniteNumber(o0.pitch) && isFiniteNumber(o1.pitch)) {
      const dy = o1.yaw - o0.yaw, dp = o1.pitch - o0.pitch;
      if (dy !== 0 && dp === 0) dir = dy > 0 ? 'right' : 'left';
      else if (dp !== 0 && dy === 0) dir = dp > 0 ? 'forward' : 'back';
    }
    out.push({ type: 'orbit', steps, dir });
  }
  if (typeof prev.paused === 'boolean' && typeof next.paused === 'boolean' && prev.paused !== next.paused) out.push({ type: next.paused ? 'pause' : 'resume' });
  for (let i = grow('resetSeq'); i > 0; i--) out.push({ type: 'resetBody' });
  if (grow('pulseSeq') > 0 && (next.lastTriggerSource === 'gaze' || next.lastTriggerSource === 'click')) {
    const id = typeof next.pulseRegion === 'string' ? next.pulseRegion : null;
    const r = id !== null && binding && binding.regions instanceof Map ? binding.regions.get(id) : null;
    out.push({ type: 'activate', regionId: id, source: next.lastTriggerSource, isLeftArm: r ? r.isLeftArm === true : null });
  }
  return out;
}

/** PURE double-tap test: a press at `nowS` is a double-tap when the previous press was at most `windowS` earlier. */
export function isDoubleTap(prevDownS, nowS, windowS = DOUBLE_TAP_SECONDS) {
  return isFiniteNumber(prevDownS) && isFiniteNumber(nowS) && nowS >= prevDownS && nowS - prevDownS <= windowS + SNAP;
}

/** Suggested rig angle: degrees of pronation away from the anatomical (supinated) rest for a rotation value
 * (0 = pronated, 1 = supinated). See ROTATION.pronationRangeDeg. */
export function forearmPronationDeg(value, rangeDeg = ROTATION.pronationRangeDeg) {
  if (!unit(value)) fail('rotation_value', 'rotation value must be in 0..1');
  if (!(isFiniteNumber(rangeDeg) && rangeDeg >= 0)) fail('rotation_value', 'rangeDeg must be a finite number >= 0');
  return (1 - value) * rangeDeg + 0;
}

function reachJointOptions(options) {
  if (options === undefined || options === null) return REACH_JOINT_DISPLAY;
  if (!isPlainObject(options)) fail('reach_option', 'reach joint options must be an object');
  const o = { ...REACH_JOINT_DISPLAY };
  for (const k of Object.keys(options)) {
    if (!hasOwn(REACH_JOINT_DISPLAY, k)) fail('reach_option', `unknown reach joint option ${JSON.stringify(k)}`);
    const v = options[k];
    const share = k !== 'fullJointRateDegS';
    if (!(isFiniteNumber(v) && (share ? v >= 0 && v <= 1 : v > 0))) {
      fail('reach_option', `${k} must be ${share ? 'a number in [0, 1]' : 'a positive finite number'}`);
    }
    o[k] = v;
  }
  return Object.freeze(o);
}

/**
 * PURE WASD coordinated joint-channel target { shoulder, elbow, wrist, hand } (display-only, unitless 0..1) from KEY
 * INTENT plus realised motion. input: as reachDisplayTarget, plus optional jointRates { shoulder?, elbow?, wrist? }
 * (realised joint angular rates, deg/s, e.g. from the ns-arm IK solution). No key -> all 0; realised motion without
 * a key shows nothing. See REACH_JOINT_DISPLAY for the shares.
 */
export function reachJointTarget(input = {}, reachOpts, jointOpts) {
  const o = reachOptions(reachOpts);
  const j = reachJointOptions(jointOpts);
  const intent = reachIntent(input) || { x: 0, z: 0 };
  const depthAxis = intent.z !== 0, xAxis = intent.x !== 0;
  if (!depthAxis && !xAxis) return { shoulder: 0, elbow: 0, wrist: 0, hand: 0 };
  const m = (rate, full) => (isFiniteNumber(rate) ? Math.min(1, Math.abs(rate) / full) : 0);
  const jr = isPlainObject(input) && isPlainObject(input.jointRates) ? input.jointRates : {};
  const mDepth = depthAxis ? m(input.depthRate, o.fullDepthRate) : 0;
  const mX = xAxis ? m(input.xRate, o.fullXRate) : 0;
  const mJoint = k => m(jr[k], j.fullJointRateDegS);
  const lvl = motion => o.holdLevel + (1 - o.holdLevel) * Math.min(1, motion);
  const base = Math.max(mDepth, mX);
  const elbowDepth = depthAxis ? lvl(isFiniteNumber(jr.elbow) ? mJoint('elbow') : mDepth) : 0;
  return {
    shoulder: lvl(Math.max(base, mJoint('shoulder'))),
    elbow: union(elbowDepth, xAxis ? j.elbowXShare * lvl(mX) : 0),
    wrist: j.wristShare * lvl(Math.max(base, mJoint('wrist'))),
    hand: j.handShare * lvl(base)
  };
}

/** One smoothing step of the WASD joint channels toward reachJointTarget(input) (REACH_DISPLAY rise/decay taus). */
export function stepReachJoints(prev, input, dt, reachOpts, jointOpts) {
  const o = reachOptions(reachOpts);
  if (!(isFiniteNumber(dt) && dt >= 0)) fail('reach_dt', 'dt must be a finite number of seconds >= 0');
  const p = prev == null ? { shoulder: 0, elbow: 0, wrist: 0, hand: 0 } : prev;
  if (!isPlainObject(p) || !WASD_CHANNELS.every(c => unit(p[c]))) fail('reach_state', 'prev must be { shoulder, elbow, wrist, hand } in 0..1');
  const t = reachJointTarget(input, o, jointOpts);
  const out = {};
  for (const c of WASD_CHANNELS) out[c] = approach(p[c], t[c], dt, o.riseTau, o.decayTau);
  return out;
}

// --- BODY_MOTOR_MAP import --------------------------------------------------------------------
// BODY_MOTOR_MAP comes from ns-bodymap.mjs (shared interface 2, owner S1). It is imported with a guarded dynamic
// import (top-level await) so the arm game keeps working while that module is absent or fails to load; BODY_MAP_STATUS
// says which, and the integrator should surface `error`. A map that loads but fails bindBodyMap still throws loudly
// from createActivity().
let loadedBodyMap = null;
let bodyMapError = null;
try {
  const mod = await import('./ns-bodymap.mjs');
  if (mod && mod.BODY_MOTOR_MAP) loadedBodyMap = mod.BODY_MOTOR_MAP;
  else bodyMapError = 'ns-bodymap.mjs does not export BODY_MOTOR_MAP';
} catch (e) {
  bodyMapError = `ns-bodymap.mjs could not be loaded: ${e && e.message ? e.message : String(e)}`;
}
/** { loaded, error }: whether ns-bodymap.mjs BODY_MOTOR_MAP was loaded as DEFAULT_BODY_MAP. */
export const BODY_MAP_STATUS = Object.freeze({ loaded: loadedBodyMap !== null, error: bodyMapError });
/** The default body motor map: ns-bodymap.mjs BODY_MOTOR_MAP, or EMPTY_BODY_MAP when it could not be loaded. */
export const DEFAULT_BODY_MAP = loadedBodyMap !== null ? loadedBodyMap : EMPTY_BODY_MAP;

/**
 * Create the virtual activation model.
 * Events (processed in time order each step; every event may carry `at`, seconds into the step):
 *   { type: 'gaze', kind?, regionId?, actionId?, u?, arrow?, yaw?, pitch?, moved?, seed?, arrivedFrom? }  sent every frame
 *       kind: GAZE_KINDS ('region' needs regionId; legacy events with only an arm actionId are 'strip');
 *       regionId: a BODY_MOTOR_MAP region; actionId: that region's action id (or its armActionId), else `u` picks the
 *       action by its share of the region extent, else the first action; arrow: the orbit arrow under the crosshair
 *       ('left' | 'right' | 'forward' | 'back'), which then counts as empty space and turns the next click into an orbit.
 *       arrivedFrom (21 November 2026, late): the area (a state's gazeArea, or null for none) the look was on before the
 *       PLAYER moved it while the gaze was being recorded silently (ns-app CARRY_ARRIVAL: a neck or trunk movement
 *       carried the view). On an event that is not silent, an area other than that one is met as a new area although the
 *       silent frames had already recorded it: its pulse starts and it switches on after the usual rest. Without the
 *       field (the game's own slide of the view, a seed) a recorded area starts nothing, as before.
 *   { type: 'click' }   re-trigger the area under the crosshair, or orbit when an arrow is under it
 *   { type: 'turn', phase: 'step' | 'hold' | 'stop', safety? }   R558 (Message 40): the limb turn (ns-controls
 *       SPACE_GESTURE turns the Space key into these): 'step' = a double tap (one stroke per limb), 'hold' = that double
 *       tap is held (the slow turn), 'stop' = let go (every limb stays where it is).
 *   { type: 'space', down: boolean, safety? }   legacy: accepted and checked, but it moves nothing any more (R558,
 *       Message 40: Space reaches the activity as 'grasp' and 'turn' events)
 *   { type: 'reach', axes?: {x, z} | keys?: {KeyW, KeyA, KeyS, KeyD}, depthRate?, xRate?, elbowRate?, jointRates? }
 *   { type: 'orbit', dir, stepDeg? }  { type: 'reset' }  { type: 'escape' }  { type: 'lock', locked }  { type: 'resume' }
 *   { type: 'pause' }       (the ns-controls UI queue events)
 *
 * Areas. The area under the crosshair is a (region, action) pair (legacy: the arm action). Gaze on a NEW area starts
 * one pulse (pulseSeconds, single slot; a later start replaces it); a look movement beyond the deadband on the same
 * area restarts it; a click re-triggers it; empty space, glass and arrows start nothing and do not erase a running
 * pulse. A pulse lights its region (regionActivity; crisp envelope, exactly 0 from pulseSeconds after the trigger);
 * a new-area or click start (not a look-movement restart) counts it in activatedRegions (persistent until Reset body). A LEFT-ARM region action drives its arm action
 * (armActionId: the arm pose drive and display, as in round 1) or a transient forearm rotation (pronation/supination);
 * any OTHER region action lights its muscles through bodyDrive / bodyDisplay for the pulse and moves its `joints` by
 * the LATCH below. Keys never drive non-arm regions. Space/rotation/WASD light left-arm regions
 * through their channels (regionActivity) but never count as an activation.
 *
 * The limb turn (R558: Message 2's dance as reshaped by Message 40; ns-dance.mjs). All four limbs turn, each between its
 * inward end (pronation + internal rotation) and its outward end (supination + external rotation), each in the
 * direction it last moved, with its own tempo (not coordinated). { type: 'turn', phase: 'step' } (a double tap of Space)
 * = one stroke per limb, then it stops by itself (rotationSeq counts these); 'hold' (the double tap held) = the turn
 * goes on slowly (spaceHeld is true while it does); 'stop' (let go) = every limb stays where it is (the latch rule). A
 * pause or Reset body ends any turn where the limbs are. The turn owns the four limbs' rotation joints while it runs.
 * The touch-free hip range of the current leg posture arrives as a { type: 'danceRange', joints } event (ns-app, from
 * ns-body hipRotationClearRange).
 * R558 (user Message 40: "Holding the spacebar should again be grasping. And so should one tap spacebar"): holding or
 * tapping Space grasps (ns-controls SPACE_GESTURE; the F key is gone). { type: 'grasp', down, target? }: a press with
 * target 'brain' (or no target key at all while the gaze kind is 'region' or 'glass', new-style gaze with yaw/pitch; an
 * explicit target null holds nothing) starts a brain
 * grab: while held the brain keeps its angular offset to the camera (brainPlacement), gaze pulses are suppressed (the
 * gaze is recorded silently) and release leaves the brain where it is. { type: 'grip', on }: the left hand closes while
 * Space holds or keeps a grasp (graspHold; the hand area and the finger benders light) and opens when it lets go
 * (R558, Message 48). { type: 'limbPose', joints, regionId?, actionId? }
 * sets held own-limb joints at once (they stay, like a latch) and lights that area. { type: 'limbPlace', joints } (22
 * November 2026, SEEMOVE) moves the PLACE of those joints only: each springs there on its soft relaxOmega spring, unlit,
 * and a contraction of it still under way goes on and returns to the new place. { type: 'contractStop', joints }
 * stops a contraction still under way at those angles for the rest of its time (then it returns as usual; a joint not
 * contracting is left alone; 20 November 2026, night: the trunk's contact stop in ns-app).
 *
 * Contract, then return (20 November 2026, the owner's Message 206; JOINT_LATCH). A deliberate activation (a look that
 * rests on a new area for latchS, a click, a muscle tap; not the restart of the same area by a small look movement)
 * makes its part CONTRACT: for JOINT_LATCH.driveS its joints are driven to the movement's end angles (absolute degrees
 * in the rig's convention, inside bodyJointLimits) by the jerk spring, and its area, its muscles and its display level
 * are lit for exactly that time. Then the part RETURNS, unlit, on the soft relaxOmega spring to where it was just before
 * (bodyGoal: the start posture, or where the player put it with the keys, a drag, a Space carry or the limb turn; a
 * 'limbPose' event or the turn sets it), and stays. Nothing is held by the brain: there is no stage rule, no opposing
 * hint and no "already there". A movement whose end lies short of where the part already is (a bend asked of a joint
 * the player bent further) does not pull it back: it kicks it toward its end instead. A further press during the
 * contraction or the return drives the part again. Game-arm actions do the same on the arm's pose drive (0 neutral, 1
 * the movement's end; ARM_OPPOSITES: the opposite of a running contraction goes straight into its return; a relax press
 * sends every hand movement into its return); a forearm-turn area turns the forearm for the contraction and it turns
 * back to where it was (rotationState / the turn's held angle). motionView(state) lists what is contracting and what is
 * on its way back.
 *
 * Instructions/pause. The intro overlay is visible for introSeconds from the start (not paused). Esc toggles the
 * overlay (show + pause / hide + resume); a pointer-lock loss shows it and pauses; an Esc within escLockDedupeSeconds of
 * a lock-loss overlay is the same gesture; re-acquiring the lock resumes when resumeOnLock. While paused, gaze is
 * recorded silently and clicks, grasps, turn steps and reach intent are ignored (releases and turn stops still apply);
 * timers run on.
 *
 * Reset body ({ type: 'reset' } or resetBody(state)) clears activatedRegions, cancels the running pulse, snaps the body
 * drives/displays to 0 and every body joint to its start angle (contractions dropped), snaps arm drives/displays to 0 and
 * drops the arm's contractions, clears the open/relax windows, sets rotationState to defaultRotation (value snapped), the game arm's dance swivel to 0, ends any limb turn and ends any grab. It keeps the brain
 * placement and orbit (round-2 fix R1: the brain stays where it was released; ns-app resetBrainView resets the view),
 * the clock, the pulse/suppression counters, WASD levels and the instructions/pause state.
 *
 * Returns { options, binding, state, step, stepGated, seed, seedGaze, drives, poseDrives, displayActivity,
 * displayDrives, muscleDisplayDrives, reachOutputs, resetBody, orbitStep, regionActivity, activatedRegions,
 * bodyJointTargets, activeBodyActions, bodyMuscleDisplay, rotationOutputs, brainView, wasdChannels, instructionsView,
 * snapshot, motionView }. `state` is plain JSON data; no function mutates its input. `dt` is actual elapsed wall time.
 */
export function createActivity({
  pulseSeconds = 1, riseTau = 0.12, decayTau = 0.25, spaceOpenSeconds = 0.6,
  displayRiseTau = DISPLAY_ENVELOPE.riseTau, displayFadeSeconds = DISPLAY_ENVELOPE.fadeSeconds,
  displayDecayTau = DISPLAY_ENVELOPE.decayTau, gazeDeadbandDeg = GAZE_RESTART_DEADBAND_DEG, reach: reachOverrides,
  bodyMap = DEFAULT_BODY_MAP, bodyJointLimits = null, reachJoint: reachJointOverrides,
  doubleTapSeconds = DOUBLE_TAP_SECONDS, rotationSeconds = ROTATION.commandSeconds, rotationTau = ROTATION.poseTau,
  defaultRotation = ROTATION.defaultState, orbit: orbitOverrides, grabPitchLimitDeg = BRAIN_GRAB.pitchLimitDeg, initialBrainPlacement = null,
  introSeconds = INSTRUCTIONS.introSeconds, escLockDedupeSeconds = INSTRUCTIONS.escLockDedupeSeconds,
  resumeOnLock = INSTRUCTIONS.resumeOnLock, gazeDwell = GAZE_DWELL,
  bodyRest = null, jointSpring = JOINT_LATCH, armPoseTau = JOINT_LATCH.armPoseTau, lookArms = LOOK_ARMS,
  gripRelease = GRIP_RELEASE
} = {}) {
  // 22 November 2026 (H5, GRIP_RELEASE): the release opens the hand (a timed open_hand) only with openOnRelease on
  const openOnRelease = Boolean(gripRelease && gripRelease.openOnRelease === true);
  // 18 November 2026 (S4): a look arms, a click / number key presses (LOOK_ARMS).
  const armOnly = !(lookArms && lookArms.on === false);
  const armLevel = lookArms && isFiniteNumber(lookArms.muscleLevel) ? clamp(lookArms.muscleLevel, 0, 1) : LOOK_ARMS.muscleLevel;
  const replaceClickS = gazeDwell && isFiniteNumber(gazeDwell.replaceClickS) && gazeDwell.replaceClickS >= 0 ? gazeDwell.replaceClickS : GAZE_DWELL.replaceClickS;
  const markS = gazeDwell && isFiniteNumber(gazeDwell.markS) && gazeDwell.markS >= 0 ? gazeDwell.markS : GAZE_DWELL.markS;
  const latchS = gazeDwell && isFiniteNumber(gazeDwell.latchS) && gazeDwell.latchS >= 0 ? gazeDwell.latchS : GAZE_DWELL.latchS;
  const timing = {
    pulseSeconds, riseTau, decayTau, spaceOpenSeconds, displayRiseTau, displayFadeSeconds, displayDecayTau,
    doubleTapSeconds, rotationSeconds, rotationTau
  };
  for (const [k, v] of Object.entries(timing)) {
    if (!(isFiniteNumber(v) && v > 0)) fail('activity_option', `${k} must be a positive finite number of seconds`);
  }
  if (!(displayFadeSeconds < pulseSeconds && displayFadeSeconds < spaceOpenSeconds && displayFadeSeconds < rotationSeconds)) {
    fail('activity_option', 'displayFadeSeconds must be shorter than pulseSeconds, spaceOpenSeconds and rotationSeconds');
  }
  if (!(isFiniteNumber(gazeDeadbandDeg) && gazeDeadbandDeg >= 0 && gazeDeadbandDeg < 90)) {
    fail('activity_option', 'gazeDeadbandDeg must be a finite number of degrees in [0, 90)');
  }
  if (!(isFiniteNumber(introSeconds) && introSeconds >= 0)) fail('activity_option', 'introSeconds must be a finite number >= 0 (0 = no intro)');
  if (!(isFiniteNumber(escLockDedupeSeconds) && escLockDedupeSeconds >= 0)) fail('activity_option', 'escLockDedupeSeconds must be >= 0');
  if (typeof resumeOnLock !== 'boolean') fail('activity_option', 'resumeOnLock must be a boolean');
  if (!ROTATION_STATES.includes(defaultRotation)) fail('activity_option', `defaultRotation must be one of ${ROTATION_STATES.join(', ')}`);
  if (!(isFiniteNumber(grabPitchLimitDeg) && grabPitchLimitDeg >= 0 && grabPitchLimitDeg <= 90)) {
    fail('activity_option', 'grabPitchLimitDeg must be in [0, 90]');
  }
  if (bodyMap === null || bodyMap === undefined) fail('activity_option', 'bodyMap is missing (ns-bodymap.mjs BODY_MOTOR_MAP or EMPTY_BODY_MAP)');
  const binding = bindBodyMap(bodyMap);
  const limitsBody = bodyJointLimits === null ? null : checkBodyLimits(bodyJointLimits);
  const reachOpts = reachOptions(reachOverrides);
  const jointOpts = reachJointOptions(reachJointOverrides);
  const orbitOpts = orbitLimits(orbitOverrides);
  const grabLimitRad = grabPitchLimitDeg * DEG;
  const initialPlacement = initialBrainPlacement === null ? { yaw: 0, pitch: 0 } : initialBrainPlacement;
  if (!initialPlacement || typeof initialPlacement !== 'object' || Object.keys(initialPlacement).some(k => k !== 'yaw' && k !== 'pitch') || !Number.isFinite(initialPlacement.yaw) || !Number.isFinite(initialPlacement.pitch) || Math.abs(initialPlacement.pitch) > grabLimitRad) fail('activity_option', 'initialBrainPlacement needs finite radians within the existing grab pitch limit');
  const ownedInitialPlacement = Object.freeze({ yaw: initialPlacement.yaw, pitch: initialPlacement.pitch });
  const options = Object.freeze({
    ...timing, gazeDeadbandDeg, reach: reachOpts, reachJoint: jointOpts, defaultRotation, orbit: orbitOpts,
    grabPitchLimitDeg, introSeconds, escLockDedupeSeconds, resumeOnLock, bodyJointLimits: limitsBody,
    bodyMapVersion: binding.version
  });
  const REGION_IDS = binding.regionIds;
  const BODY_KEYS = binding.bodyActionKeys;
  const JOINT_IDS = binding.jointIds;
  const rotValue = st => (st === 'supinated' ? 1 : 0);
  const channelFor = st => (st === 'supinated' ? 'supination' : 'pronation');

  // ---- contraction tables (see JOINT_LATCH and the "Contract, then return" paragraph above) ------
  if (bodyRest !== null && !isPlainObject(bodyRest)) fail('activity_option', 'bodyRest must be an object of jointId -> degrees (the start posture), or null');
  if (!(isPlainObject(jointSpring) && isFiniteNumber(jointSpring.omega) && jointSpring.omega > 0 && isFiniteNumber(jointSpring.zeta) && jointSpring.zeta > 0
    && (jointSpring.restitution === undefined || (isFiniteNumber(jointSpring.restitution) && jointSpring.restitution >= 0 && jointSpring.restitution < 1))
    && (jointSpring.driveS === undefined || (isFiniteNumber(jointSpring.driveS) && jointSpring.driveS > 0)))) {
    fail('activity_option', 'jointSpring must be { omega > 0 (rad/s), zeta > 0, restitution? in [0, 1), driveS? > 0 (s) }');
  }
  if (!(isFiniteNumber(armPoseTau) && armPoseTau > 0)) fail('activity_option', 'armPoseTau must be a positive number of seconds');
  const springOmega = jointSpring.omega, springZeta = jointSpring.zeta, springBounce = jointSpring.restitution === undefined ? 0 : jointSpring.restitution;
  // Message 206: the return (soft, critically damped), the contraction's length and the fade of its light.
  const relaxOmega = Number.isFinite(jointSpring.relaxOmega) && jointSpring.relaxOmega > 0 ? jointSpring.relaxOmega : JOINT_LATCH.relaxOmega;
  const contractS = isFiniteNumber(jointSpring.driveS) ? jointSpring.driveS : JOINT_LATCH.driveS;
  const lightFadeS = isFiniteNumber(jointSpring.lightFadeS) && jointSpring.lightFadeS >= 0 && jointSpring.lightFadeS < contractS ? jointSpring.lightFadeS : Math.min(JOINT_LATCH.lightFadeS, contractS / 2);
  const kickShare = isFiniteNumber(jointSpring.kick) && jointSpring.kick > 0 ? jointSpring.kick : 0;
  // (21 November 2026, SEEMOVE: the hold at the movement's end after the lit contraction; JOINT_LATCH holdS. moveS: how
  // long a movement drives its part in all: the contraction and the hold)
  const holdS = isFiniteNumber(jointSpring.holdS) && jointSpring.holdS > 0 ? jointSpring.holdS : 0;
  const moveS = contractS + holdS;
  // (21 November 2026, SEEMOVE: the place a part started from is a stop for its contraction's throw back; JOINT_LATCH backStop)
  const backStop = jointSpring.backStop === true;
  // (22 November 2026: with backStop, the kick at most kickRoomOmega x the movement's room x omega; JOINT_LATCH)
  const kickRoomOmega = backStop && isFiniteNumber(jointSpring.kickRoomOmega) && jointSpring.kickRoomOmega > 0 ? jointSpring.kickRoomOmega : Infinity;
  // (the stop bounce: the speed into a stop that throws the part back A degrees off it is A * omega / (restitution *
  // reach), reach being how far a unit speed away from the goal carries this spring: exp(-zeta / sqrt(1 - zeta^2) *
  // atan(sqrt(1 - zeta^2) / zeta)) / omega; 0.70 / omega at zeta 0.26)
  const stopShare = isFiniteNumber(jointSpring.stopBounceShare) && jointSpring.stopBounceShare > 0 ? jointSpring.stopBounceShare : 0;
  const stopMaxDeg = isFiniteNumber(jointSpring.stopBounceMaxDeg) && jointSpring.stopBounceMaxDeg > 0 ? jointSpring.stopBounceMaxDeg : 0;
  const springReach = springZeta < 1 ? Math.exp(-springZeta / Math.sqrt(1 - springZeta * springZeta) * Math.atan2(Math.sqrt(1 - springZeta * springZeta), springZeta)) : Math.exp(-1);
  const limitJoint = (j, v) => (limitsBody && hasOwn(limitsBody, j) ? clamp(v, limitsBody[j][0], limitsBody[j][1]) : v);
  // Start angle of every joint (the start posture; 0 where none is given), inside the limits.
  const REST = {};
  for (const j of JOINT_IDS) {
    const r = bodyRest !== null && hasOwn(bodyRest, j) ? bodyRest[j] : 0;
    if (!isFiniteNumber(r)) fail('activity_option', `bodyRest.${j} must be a finite number of degrees`);
    REST[j] = limitJoint(j, r) + 0;
  }
  Object.freeze(REST);
  const restMap = () => ({ ...REST });
  // End angle (absolute degrees, inside the limits) of every joint each body action names.
  const ENDS = new Map();
  for (const k of BODY_KEYS) {
    const e = {};
    for (const [j, deg] of Object.entries(binding.bodyActions.get(k).joints)) e[j] = limitJoint(j, deg) + 0;
    ENDS.set(k, Object.freeze(e));
  }
  // (20 November 2026, Message 206: the latch's tables are gone: LATCHING (which joints held), NEAR_REST (the stage
  // rule's margin). Every joint returns to its place after a contraction; the turn's joints too, to where the turn left
  // them.)
  for (const j of DANCE_BODY_JOINTS) if (!JOINT_IDS.includes(j)) fail('activity_option', `the body map binding lacks the dance joint ${j}`);
  // 18 November 2026, late (the whole arm turns over in the limb switch, ns-dance ARM_TURN): the game arm starts with its
  // upper arm at the end of the side its palm starts on (outward with the palm up: the underside), in the explicit
  // mode (armHumeral a number), the pair of the right arm's start posture; Reset body returns there.
  const armHumeralStart = () => DANCE_LIMBS.leftArm[1][rotValue(defaultRotation) >= 0.5 ? 'open' : 'closed'];
  const danceStart = () => createDance({ l_forearm: PRONATION_DEG_AT_VALUE(rotValue(defaultRotation)), l_shoulder_rot: armHumeralStart(), ...Object.fromEntries(DANCE_BODY_JOINTS.map(j => [j, REST[j]])) });

  // ---- state shape ----------------------------------------------------------------------------
  const noGrab = () => ({ active: false, startYaw: null, startPitch: null, originYaw: null, originPitch: null });
  const hiddenInstructions = () => ({ visible: false, reason: null, shownAt: null, autoHideAt: null });

  function initialState() {
    return {
      t: 0,                    // ACTUAL elapsed wall seconds since creation (event and expiry clock)
      gazeAction: null,        // arm action under the crosshair (null = none: empty, glass, body region, arrow)
      pulseAction: null,       // arm action of the active pulse (single slot; null for body/rotation/display-only pulses)
      pulseRemaining: 0,       // wall seconds left in that pulse (logical target expiry)
      spaceHeld: false,
      graspHold: false,        // R558 (Message 48): the left hand grips while Space holds (or keeps) a grasp ('grip' events)
      openRemaining: 0,        // wall seconds left of the open_hand window after the grip lets go
      relaxRemaining: 0,       // seconds left of the relax_release command after Space release
      reachRate: 0,            // last elbowRate (deg/s) received this step; legacy display linkage only
      targets: zeroMap(ACTION_IDS),     // commanded targets going forward (0 or 1)
      drive: zeroMap(ACTION_IDS),       // POSE DRIVE: smoothed commanded drive (feeds composePose)
      display: zeroMap(ACTION_IDS),     // DISPLAY ACTIVITY: crisp envelope for the cortex colour (never feeds composePose)
      reachDisplay: zeroMap(REACH_IDS), // legacy elbow-rate display linkage (used only when a reach event has no key intent)
      wasd: { flex: 0, ext: 0, x: 0 },  // key-intent reach display levels (display-only; see reachDisplayOutputs)
      gazeYaw: null,           // last gaze (camera) direction received (radians) or null when gaze events carry none
      gazePitch: null,
      anchorYaw: null,         // gaze direction at the last (re)trigger, seed or area change (deadband anchor)
      anchorPitch: null,
      pulseSeq: 0,             // count of distinct pulses started (each click is its own pulse)
      lastTriggerAt: null,     // wall time (s, activity clock) of the latest pulse start; deadline = this + pulseSeconds
      lastTriggerSource: null, // 'gaze' (new area) | 'moved' (look movement on the area) | 'click'
      suppressedSeq: 0,        // count of pulse starts suppressed by the held Space grip (graspHold)
      lastSuppressed: null,    // { actionId, source, t } of the latest suppressed start
      // U1-controls round 2
      gazeKind: null,          // GAZE_KINDS entry of the latest gaze, or null before any
      gazeArea: null,          // area key under the crosshair ('<regionId>/<actionId>' or the legacy arm action) or null
      gazeHit: null,           // { regionId, actionId, armAction, bodyKey, rotation } of that area, or null
      gazeArrow: null,         // orbit arrow under the crosshair, or null
      seedNextGaze: false,     // the next gaze event is recorded silently (after orbit, grab release, resume, reset)
      pulseRegion: null,       // region of the active pulse
      pulseBody: null,         // body action key of the active pulse (non-left-arm region)
      pulseRotation: null,     // 'pronation' | 'supination' of the active pulse (left-arm rotation region action)
      keyDisplay: zeroMap(KEY_DISPLAY_IDS),   // Space-only display envelope (lights every left-arm region listing it)
      regionDisplay: zeroMap(REGION_IDS),     // own pulse envelope per region
      regionActivity: zeroMap(REGION_IDS),    // DISPLAY per region: own pulse + left-arm key channels (derived)
      activatedRegions: {},                   // regionId -> count of clicks + looks held >= markS (until reset)
      pulseClick: false,                      // R3-fix M3: the running pulse was started (or last re-started) by a click
      pulseLook: false,                       // 18 Nov (S4): the running pulse is a LOOK's (it arms: LOOK_ARMS)
      pendingGaze: null,                     // R3-fix M3: { area, since } a new area waiting to replace a click pulse
      markPending: null,                      // R3-fix M5: { area, regionId, since } a look that marks after markS
      latchPending: null,                     // R558: { area, hit, since } a look that moves its joints after latchS
      lookTaken: null,                        // R558: { regionId, n } the area whose movement a look's rest took last; n counts them
      pulseMove: false,                       // Message 206: the running pulse is a contraction's light (JOINT_LATCH driveS long)
      moveSeq: 0,                             // Message 206: count of contractions started (clicks, looks that rested, taps)
      lastMove: null,                         // Message 206: { regionId, actionId, armAction, bodyKey, rotation } of the latest one
      bodyDrive: zeroMap(BODY_KEYS),          // body POSE drive (smoothed, eases)
      bodyDisplay: zeroMap(BODY_KEYS),        // body DISPLAY envelope (crisp; for muscle colour)
      bodyJointTargets: restMap(),            // jointId -> absolute degrees (derived: the joint positions, bodyPos)
      bodyGoal: restMap(),                    // jointId -> degrees: the joint's PLACE, where it returns after a contraction (the start
                                              // posture, or where a 'limbPose' event or the limb turn put it)
      bodyPos: restMap(),                     // jointId -> degrees: where the joint is now
      bodyVel: zeroMap(JOINT_IDS),            // jointId -> degrees/s
      bodyJerk: {},                           // jointId -> [end angle, contraction seconds left (0 = on the way back), stop side] (Message 206)
      armJerk: {},                            // game-arm actionId -> [contraction seconds left (0 = on the way back), drive speed /s]
      rotationState: defaultRotation,         // persistent forearm posture (double-tap toggles)
      rotation: { value: rotValue(defaultRotation), speed: 0, remaining: 0, channel: null, hold: null, move: null }, // pose value 0 pronated..1 supinated; speed: R3-arm ease; hold: R558 dance-held value (null = follow rotationState); move: a strip turn under way, [its end 0 / 1, seconds left] (21 November 2026)
      armHumeral: armHumeralStart(), // R558 (Space dance): null = the coupled palm turn (R5-pronation); a number = the game arm's upper-arm turn set explicitly (degrees, + outward; ns-arm rotation.humeralDeg), rotation.value then being the radius' own turn. 18 November 2026, late: explicit from the start (the underside end)
      armTurnSeen: null,       // R558: { forearmDeg, humeralDeg } the game arm actually showed last frame ('armTurn' event from ns-app)
      dance: danceStart(),     // R558 (Space dance): ns-dance state (per-limb direction, stroke, levels; history)
      danceRange: {},          // R558: jointId -> [lo, hi] degrees, the touch-free hip range of the current leg posture
      rotationDisplay: zeroMap(ROTATION_ACTION_IDS),    // rotation channel display (double-tap command or pulse)
      rotationKeyDisplay: zeroMap(ROTATION_ACTION_IDS), // double-tap command part only
      rotationSeq: 0,          // count of double-tap toggles
      spaceTapAt: null,        // activity time of the previous Space press in an open double-tap chain
      wasdJoint: { shoulder: 0, elbow: 0, wrist: 0, hand: 0 }, // WASD coordinated joint display channels
      brainPlacement: { ...ownedInitialPlacement }, // constructor-owned radians; zero when absent
      brainGrab: noGrab(),     // { active, startYaw, startPitch (camera at grab), originYaw, originPitch (placement) }
      grabSeq: 0,
      orbit: { yaw: 0, pitch: 0 },            // degrees around the default view (see ORBIT)
      orbitSeq: 0,
      instructions: introSeconds > 0
        ? { visible: true, reason: 'intro', shownAt: 0, autoHideAt: introSeconds }
        : hiddenInstructions(),
      paused: false,
      resetSeq: 0
    };
  }

  const safeCount = v => Number.isSafeInteger(v) && v >= 0;
  const regionOrNull = v => v === null || binding.regions.has(v);
  const bodyKeyOrNull = v => v === null || binding.bodyActions.has(v);
  const rotOrNull = v => v === null || ROTATION_ACTION_IDS.includes(v);
  const angles = v => isPlainObject(v) && isFiniteNumber(v.yaw) && isFiniteNumber(v.pitch);
  const finiteMap = (m, ids) => { // R558 (P2): isPlainObject(m) && ids.every(id => isFiniteNumber(m[id])), as a loop
    if (!isPlainObject(m)) return false;
    for (let i = 0; i < ids.length; i++) if (!isFiniteNumber(m[ids[i]])) return false;
    return true;
  };
  const isHit = v => v === null || (isPlainObject(v) && regionOrNull(v.regionId)
    && (v.actionId === null || typeof v.actionId === 'string') && actionOrNull(v.armAction)
    && bodyKeyOrNull(v.bodyKey) && rotOrNull(v.rotation));
  const isCounts = v => isPlainObject(v) && Object.keys(v).every(k => binding.regions.has(k) && Number.isSafeInteger(v[k]) && v[k] > 0);
  const isGrab = v => isPlainObject(v) && typeof v.active === 'boolean'
    && [v.startYaw, v.startPitch, v.originYaw, v.originPitch].every(x => v.active ? isFiniteNumber(x) : (x === null || isFiniteNumber(x)));
  const isInstructions = v => isPlainObject(v) && typeof v.visible === 'boolean'
    && (v.reason === null || INSTRUCTION_REASONS.includes(v.reason))
    && (v.shownAt === null || nonNegative(v.shownAt)) && (v.autoHideAt === null || nonNegative(v.autoHideAt));

  function checkState(s) {
    const ok = isPlainObject(s)
      && nonNegative(s.t)
      && actionOrNull(s.gazeAction)
      && actionOrNull(s.pulseAction)
      && nonNegative(s.pulseRemaining)
      && typeof s.spaceHeld === 'boolean'
      && typeof s.graspHold === 'boolean'
      && nonNegative(s.openRemaining)
      && nonNegative(s.relaxRemaining)
      && isFiniteNumber(s.reachRate)
      && unitMap(s.targets, ACTION_IDS)
      && unitMap(s.drive, ACTION_IDS)
      && unitMap(s.display, ACTION_IDS)
      && unitMap(s.reachDisplay, REACH_IDS)
      && isPlainObject(s.wasd) && unit(s.wasd.flex) && unit(s.wasd.ext) && unit(s.wasd.x)
      && angleOrNull(s.gazeYaw) && angleOrNull(s.gazePitch) && angleOrNull(s.anchorYaw) && angleOrNull(s.anchorPitch)
      && safeCount(s.pulseSeq)
      && (s.lastTriggerAt === null || nonNegative(s.lastTriggerAt))
      && (s.lastTriggerSource === null || TRIGGER_SOURCES.includes(s.lastTriggerSource))
      && safeCount(s.suppressedSeq)
      && isLastSuppressed(s.lastSuppressed)
      && (s.gazeKind === null || GAZE_KINDS.includes(s.gazeKind))
      && (s.gazeArea === null || typeof s.gazeArea === 'string')
      && isHit(s.gazeHit)
      && (s.gazeArrow === null || ORBIT_DIRS.includes(s.gazeArrow))
      && typeof s.seedNextGaze === 'boolean'
      && regionOrNull(s.pulseRegion) && bodyKeyOrNull(s.pulseBody) && rotOrNull(s.pulseRotation)
      && unitMap(s.keyDisplay, KEY_DISPLAY_IDS)
      && unitMap(s.regionDisplay, REGION_IDS) && unitMap(s.regionActivity, REGION_IDS)
      && isCounts(s.activatedRegions)
      && (s.pulseClick === undefined || typeof s.pulseClick === 'boolean')
      && (s.pulseLook === undefined || typeof s.pulseLook === 'boolean')
      && (s.pendingGaze === undefined || s.pendingGaze === null || (isPlainObject(s.pendingGaze) && typeof s.pendingGaze.area === 'string' && nonNegative(s.pendingGaze.since)))
      && (s.markPending === undefined || s.markPending === null || (isPlainObject(s.markPending) && typeof s.markPending.area === 'string' && regionOrNull(s.markPending.regionId) && nonNegative(s.markPending.since)))
      && (s.latchPending === undefined || s.latchPending === null || (isPlainObject(s.latchPending) && typeof s.latchPending.area === 'string' && isPlainObject(s.latchPending.hit) && nonNegative(s.latchPending.since)))
      && (s.lookTaken === undefined || s.lookTaken === null || (isPlainObject(s.lookTaken) && regionOrNull(s.lookTaken.regionId) && nonNegative(s.lookTaken.n)))
      && (s.pulseMove === undefined || typeof s.pulseMove === 'boolean')
      && (s.moveSeq === undefined || safeCount(s.moveSeq))
      && (s.lastMove === undefined || s.lastMove === null || isHit(s.lastMove))
      && unitMap(s.bodyDrive, BODY_KEYS) && unitMap(s.bodyDisplay, BODY_KEYS)
      && finiteMap(s.bodyJointTargets, JOINT_IDS)
      && (s.bodyGoal === undefined || finiteMap(s.bodyGoal, JOINT_IDS))
      && (s.bodyPos === undefined || finiteMap(s.bodyPos, JOINT_IDS))
      && (s.bodyVel === undefined || finiteMap(s.bodyVel, JOINT_IDS))
      && (s.bodyJerk === undefined || jerkMapOk(s.bodyJerk))
      && (s.armJerk === undefined || armJerkOk(s.armJerk))
      && (s.isolatedRightForearm === undefined || typeof s.isolatedRightForearm === 'boolean')
      && ROTATION_STATES.includes(s.rotationState)
      && isPlainObject(s.rotation) && unit(s.rotation.value) && nonNegative(s.rotation.remaining) && rotOrNull(s.rotation.channel)
      && (s.rotation.speed === undefined || isFiniteNumber(s.rotation.speed))
      && (s.rotation.axialAnchor === undefined || unit(s.rotation.axialAnchor))
      && (s.rotation.hold === undefined || s.rotation.hold === null || unit(s.rotation.hold))
      && (s.rotation.move === undefined || s.rotation.move === null || (Array.isArray(s.rotation.move) && s.rotation.move.length === 2 && unit(s.rotation.move[0]) && nonNegative(s.rotation.move[1])))
      && (s.armHumeral === undefined || s.armHumeral === null || isFiniteNumber(s.armHumeral))
      && (s.armTurnSeen === undefined || s.armTurnSeen === null || (isPlainObject(s.armTurnSeen) && isFiniteNumber(s.armTurnSeen.forearmDeg) && isFiniteNumber(s.armTurnSeen.humeralDeg)))
      && (s.dance === undefined || isDanceState(s.dance))
      && (s.danceRange === undefined || (isPlainObject(s.danceRange) && Object.entries(s.danceRange).every(([k, r]) => DANCE_BODY_JOINTS.includes(k) && Array.isArray(r) && r.length === 2 && r.every(isFiniteNumber))))
      && unitMap(s.rotationDisplay, ROTATION_ACTION_IDS) && unitMap(s.rotationKeyDisplay, ROTATION_ACTION_IDS)
      && safeCount(s.rotationSeq)
      && (s.spaceTapAt === null || nonNegative(s.spaceTapAt))
      && isPlainObject(s.wasdJoint) && WASD_CHANNELS.every(c => unit(s.wasdJoint[c]))
      && angles(s.brainPlacement) && isGrab(s.brainGrab) && safeCount(s.grabSeq)
      && angles(s.orbit) && safeCount(s.orbitSeq)
      && isInstructions(s.instructions) && typeof s.paused === 'boolean'
      && safeCount(s.resetSeq);
    if (!ok) fail('activity_state', 'state is not an activity state produced by createActivity/step');
  }

  function cloneState(s) {
    return {
      t: s.t,
      gazeAction: s.gazeAction,
      pulseAction: s.pulseAction,
      pulseRemaining: s.pulseRemaining,
      spaceHeld: s.spaceHeld,
      graspHold: s.graspHold,
      openRemaining: s.openRemaining,
      relaxRemaining: s.relaxRemaining,
      reachRate: s.reachRate,
      targets: pick(s.targets, ACTION_IDS),
      drive: pick(s.drive, ACTION_IDS),
      display: pick(s.display, ACTION_IDS),
      reachDisplay: pick(s.reachDisplay, REACH_IDS),
      wasd: { flex: s.wasd.flex, ext: s.wasd.ext, x: s.wasd.x },
      gazeYaw: s.gazeYaw,
      gazePitch: s.gazePitch,
      anchorYaw: s.anchorYaw,
      anchorPitch: s.anchorPitch,
      pulseSeq: s.pulseSeq,
      lastTriggerAt: s.lastTriggerAt,
      lastTriggerSource: s.lastTriggerSource,
      suppressedSeq: s.suppressedSeq,
      lastSuppressed: s.lastSuppressed === null ? null : { ...s.lastSuppressed },
      gazeKind: s.gazeKind,
      gazeArea: s.gazeArea,
      gazeHit: s.gazeHit === null ? null : { ...s.gazeHit },
      gazeArrow: s.gazeArrow,
      seedNextGaze: s.seedNextGaze,
      pulseRegion: s.pulseRegion,
      pulseBody: s.pulseBody,
      pulseRotation: s.pulseRotation,
      keyDisplay: pick(s.keyDisplay, KEY_DISPLAY_IDS),
      regionDisplay: pick(s.regionDisplay, REGION_IDS),
      regionActivity: pick(s.regionActivity, REGION_IDS),
      activatedRegions: { ...s.activatedRegions },
      pulseClick: s.pulseClick === true,
      pulseLook: s.pulseLook === true,
      pendingGaze: s.pendingGaze ? { ...s.pendingGaze } : null,
      markPending: s.markPending ? { ...s.markPending } : null,
      latchPending: s.latchPending ? { ...s.latchPending, hit: { ...s.latchPending.hit } } : null,
      lookTaken: s.lookTaken ? { regionId: s.lookTaken.regionId, n: s.lookTaken.n } : null,
      pulseMove: s.pulseMove === true,
      moveSeq: safeCount(s.moveSeq) ? s.moveSeq : 0,
      lastMove: s.lastMove ? { ...s.lastMove } : null,
      bodyDrive: pick(s.bodyDrive, BODY_KEYS),
      bodyDisplay: pick(s.bodyDisplay, BODY_KEYS),
      bodyJointTargets: pick(s.bodyJointTargets, JOINT_IDS),
      // A state from before the joint springs has none of these; it starts at the start posture.
      bodyGoal: s.bodyGoal === undefined ? restMap() : pick(s.bodyGoal, JOINT_IDS),
      bodyPos: s.bodyPos === undefined ? restMap() : pick(s.bodyPos, JOINT_IDS),
      bodyVel: s.bodyVel === undefined ? zeroMap(JOINT_IDS) : pick(s.bodyVel, JOINT_IDS),
      bodyJerk: copyJerkMap(s.bodyJerk, 3),
      ...(s.isolatedRightForearm && s.bodyJerk?.r_pronation ? { isolatedRightForearm: true } : {}),
      armJerk: copyJerkMap(s.armJerk, 2), // (a state without notes: nothing is contracting)
      rotationState: s.rotationState,
      rotation: {
        value: s.rotation.value,
        speed: isFiniteNumber(s.rotation.speed) ? s.rotation.speed : 0,
        remaining: s.rotation.remaining,
        channel: s.rotation.channel,
        hold: isFiniteNumber(s.rotation.hold) ? s.rotation.hold : null,
        move: Array.isArray(s.rotation.move) ? s.rotation.move.slice() : null,
        ...(isFiniteNumber(s.rotation.axialAnchor) ? { axialAnchor: s.rotation.axialAnchor } : {})
      },
      // R558 (Space dance): a state from before the dance starts with none (start angles, no history).
      armHumeral: isFiniteNumber(s.armHumeral) ? s.armHumeral : null,
      armTurnSeen: s.armTurnSeen ? { forearmDeg: s.armTurnSeen.forearmDeg, humeralDeg: s.armTurnSeen.humeralDeg } : null,
      dance: s.dance === undefined ? danceStart() : copyJson(s.dance),
      danceRange: s.danceRange === undefined ? {} : copyJson(s.danceRange),
      rotationDisplay: pick(s.rotationDisplay, ROTATION_ACTION_IDS),
      rotationKeyDisplay: pick(s.rotationKeyDisplay, ROTATION_ACTION_IDS),
      rotationSeq: s.rotationSeq,
      spaceTapAt: s.spaceTapAt,
      wasdJoint: pick(s.wasdJoint, WASD_CHANNELS),
      brainPlacement: { yaw: s.brainPlacement.yaw, pitch: s.brainPlacement.pitch },
      brainGrab: { ...s.brainGrab },
      grabSeq: s.grabSeq,
      orbit: { yaw: s.orbit.yaw, pitch: s.orbit.pitch },
      orbitSeq: s.orbitSeq,
      instructions: { ...s.instructions },
      paused: s.paused,
      resetSeq: s.resetSeq
    };
  }

  // ---- commanded targets and envelopes ----------------------------------------------------------

  /** Commanded arm targets at time offset `at` (seconds) into this step. */
  function commandTargets(s, at) {
    const T = zeroMap(ACTION_IDS);
    if (s.pulseAction !== null && at < s.pulseRemaining) T[s.pulseAction] = armOnly && s.pulseLook ? armLevel : 1; // S4: a look's hint
    if (s.graspHold) T.grasp_close = 1; // R558 (Message 48): the Space grip shows its hand area and finger benders
    if (at < s.openRemaining) T.open_hand = 1;
    if (at < s.relaxRemaining) T.relax_release = 1;
    return T;
  }

  /** What the game arm's POSE drive returns to when no contraction drives it (its PLACE, Message 206): the Space grip
   * (graspHold: the hand is closed while Space holds or keeps a grasp, and the grip wins the fingers over any finger
   * contraction), the opening window after the grip lets go and a running relax pulse; 0 (the hand's neutral pose)
   * otherwise. A contraction (armJerk) drives its own action to 1 for its time and then returns to this. */
  function poseTargets(s, at) {
    const T = zeroMap(ACTION_IDS);
    if (at < s.openRemaining) T.open_hand = 1;
    if (at < s.relaxRemaining || (s.pulseAction === 'relax_release' && at < s.pulseRemaining && !(armOnly && s.pulseLook))) T.relax_release = 1;
    if (s.graspHold) { for (const id of SPACE_COMPETING) T[id] = 0; T.grasp_close = 1; }
    return T;
  }

  /** 20 November 2026 (the owner, Message 206: "when you tap any area of the brain, you activate any area, it will
   * contract, then return to its previous place"): the CONTRACTION of body action `key`. Each joint it names gets a
   * note [end angle, moveS]: integrate drives the joint to that angle with the jerk spring for moveS (the lit
   * contraction, contractS, and the unlit hold at the end, JOINT_LATCH holdS, since 21 November 2026), then
   * springs it softly back to its place (bodyGoal) and drops the note there. The place itself is not touched, so the
   * part returns to where it was just before (the start posture, or where the keys, a drag, a Space carry or the turn
   * left it), never to the start posture when it was elsewhere.
   *  - A joint whose place already lies beyond the movement's end, on the movement's own side of the start angle (a
   *    bend asked of a knee the player bent further), is driven to its place, not pulled back: the movement never works
   *    against itself.
   *  - kick (JOINT_LATCH): a joint already at, or near, that angle (a further press during the contraction, or a
   *    movement with little travel) is thrown toward it, so it slams into its end stop and still shows (not under
   *    reduced motion, whose spring has no kick).
   *  - the end is a stop for the contraction (the note's third number: the side it may not be passed from), so the
   *    jerk never throws the part past the movement's end (into another part); it rebounds off it.
   *  - stop bounce (JOINT_LATCH stopBounceShare / stopBounceMaxDeg): a movement that ends at the joint's own stop where
   *    the part already is (the jaw's clench with the jaw closed) strikes that stop: thrown into it, the part rebounds
   *    a visible way off it and is drawn back.
   *  - JOINT_CONFLICTS: the other plane of the right shoulder goes to its start angle for the same time, so the label
   *    stays true at the peak; it returns to its place with the rest.
   * A joint the action wants at its start angle ("Purse the lips" wants the upper lip down) goes there and back with
   * the rest. Returns true when the action names a joint. */
  function contractBody(s, key, isolateForearm = false) {
    const ends = ENDS.get(key);
    if (!ends) return false;
    if (hasOwn(ends, 'r_pronation')) s.isolatedRightForearm = isolateForearm;
    if (!s.bodyJerk) s.bodyJerk = {};
    const J = jointSpring, minSwing = Number.isFinite(J.minSwingDeg) ? J.minSwingDeg : 0;
    const nearShare = Number.isFinite(J.nearShare) ? J.nearShare : 0, rangeShare = Number.isFinite(J.minSwingRangeShare) ? J.minSwingRangeShare : 1;
    let any = false;
    const eps = JOINT_LATCH.restEpsDeg;
    // (the stop bounce only for a movement that would otherwise show nothing at all: every joint it names wants its start
    // angle and is there. "Purse the lips" also wants the upper lip at its start angle: that lip does not twitch.)
    const still = Object.keys(ends).every(j => Math.abs(ends[j] - REST[j]) <= eps && Math.abs(ends[j] - (Number.isFinite(s.bodyPos[j]) ? s.bodyPos[j] : REST[j])) <= eps);
    for (const j of Object.keys(ends)) {
      any = true;
      const end = ends[j], place = Number.isFinite(s.bodyGoal[j]) ? s.bodyGoal[j] : REST[j], pos = Number.isFinite(s.bodyPos[j]) ? s.bodyPos[j] : place;
      // the movement's own direction: away from the start angle; for an action that wants the start angle, toward it
      const way = end - REST[j];
      const dirRest = Math.abs(way) > JOINT_LATCH.restEpsDeg ? Math.sign(way) : 0;
      const target = dirRest !== 0 && (place - end) * dirRest > 0 ? place : end;
      const left = target - pos;
      // the joint's own stop the movement ends at, when the part is already there: -1 (the lower) / +1 (the upper) / 0
      const lim = limitsBody && hasOwn(limitsBody, j) ? limitsBody[j] : null;
      const atStop = still && lim ? (Math.abs(end - lim[0]) <= eps ? -1 : Math.abs(end - lim[1]) <= eps ? 1 : 0) : 0;
      const dir = dirRest !== 0 ? dirRest : Math.abs(left) > eps ? Math.sign(left) : atStop;
      s.bodyJerk[j] = [target + 0, moveS + 0, dir];
      const isolatedAtRest = j === 'r_pronation' && isolateForearm && Math.abs(left) <= eps;
      if (kickShare > 0 && dir !== 0 && Number.isFinite(s.bodyVel[j]) && !isolatedAtRest) {
        // (a small joint is not given a swing larger than most of its own range: a lip would rattle between its ends)
        const range = lim ? Math.abs(lim[1] - lim[0]) : Infinity;
        if (atStop !== 0) {
          const A = Math.min(stopMaxDeg, stopShare * range);
          if (A > 0 && springBounce > 0) s.bodyVel[j] = dir * A * springOmega / (springBounce * springReach) + 0;
        } else {
          const swing = Math.max(Math.abs(target - place), Math.min(minSwing, rangeShare * range));
          // (22 November 2026, JOINT_LATCH kickRoomOmega: with backStop no faster than the part can be followed into its
          // end: a kick that crossed the end inside one frame left that frame standing alone between two at the start)
          const room = Math.abs(target - place);
          const cap = backStop && room > eps ? kickRoomOmega * room * springOmega : Infinity;
          if (Math.abs(left) < nearShare * swing) s.bodyVel[j] = dir * Math.min(kickShare * swing * springOmega, cap) + 0;
        }
      }
      // R558 (JOINT_CONFLICTS): the later of two movements of one shoulder wins its direction
      if (dirRest !== 0 && hasOwn(JOINT_CONFLICTS, j)) {
        for (const k of JOINT_CONFLICTS[j]) {
          if (!hasOwn(s.bodyGoal, k) || hasOwn(ends, k)) continue;
          const d = REST[k] - (Number.isFinite(s.bodyPos[k]) ? s.bodyPos[k] : REST[k]);
          s.bodyJerk[k] = [REST[k] + 0, moveS + 0, Math.abs(d) > eps ? Math.sign(d) : 0];
        }
      }
    }
    return any;
  }

  /** 20 November 2026 (Message 206): the CONTRACTION of game-arm action `id`: its pose drive is driven to 1 (the
   * movement's end) with the jerk spring for moveS (the contraction and the hold), then springs softly back to its place (poseTargets: 0, or the
   * grip's) and the note is dropped there. A press that finds the drive near 1 kicks it into the end (the body's kick,
   * its whole travel being one unit). A contraction of the opposite action that is still under way goes straight into
   * its return (ARM_OPPOSITES). relax_release sends every hand movement under way into its return and is itself the
   * relax pulse it always was (poseTargets). Returns true
   * when something on the arm is driven. */
  function contractArm(s, id) {
    if (!s.armJerk) s.armJerk = {};
    if (id === 'relax_release') { for (const h of HAND_ACTION_IDS) if (s.armJerk[h]) s.armJerk[h][0] = 0; return true; }
    if (DISPLAY_ONLY_ARM_IDS.includes(id) || !s.drive || !Number.isFinite(s.drive[id])) return false;
    const opp = hasOwn(ARM_OPPOSITES, id) ? ARM_OPPOSITES[id] : null;
    if (opp && s.armJerk[opp]) s.armJerk[opp][0] = 0;
    const nearShare = Number.isFinite(jointSpring.nearShare) ? jointSpring.nearShare : 0, prev = s.armJerk[id];
    const speed = kickShare > 0 && 1 - s.drive[id] < nearShare ? kickShare * springOmega : prev ? prev[1] : 0;
    s.armJerk[id] = [moveS + 0, speed + 0];
    return true;
  }

  /** Smoothstep fade of a timed command with `remaining` seconds left: 1 before the fade window (fadeS seconds),
   * exactly 0 at 0. */
  function fadeCeiling(remaining, fadeS = displayFadeSeconds) {
    if (remaining >= fadeS) return 1;
    if (remaining <= SNAP) return 0; // the deadline (float residue of summed frame times counts as reached)
    const x = remaining / fadeS;
    return x * x * (3 - 2 * x);
  }
  /** The fade window of the running pulse: a contraction's light (pulseMove) fades over JOINT_LATCH.lightFadeS, so it is
   * full for most of the contraction and exactly 0 when the return begins (Message 206); any other pulse as before. */
  const pulseFade = s => (s.pulseMove === true ? lightFadeS : displayFadeSeconds);

  /** Display ceiling of action `id` at offset b1 for the commands active from offset b0 (1 when none is timed). */
  function displayCeiling(s, id, b0, b1) {
    if (id === 'grasp_close' && s.graspHold) return 1; // a grip still held has no deadline
    let c = -1;
    if (s.pulseAction === id && b0 < s.pulseRemaining) c = Math.max(c, fadeCeiling(s.pulseRemaining - b1, pulseFade(s)));
    if (id === 'open_hand' && b0 < s.openRemaining) c = Math.max(c, fadeCeiling(s.openRemaining - b1));
    if (id === 'relax_release' && b0 < s.relaxRemaining) c = Math.max(c, fadeCeiling(s.relaxRemaining - b1));
    return c < 0 ? 1 : c;
  }

  /** Space-only commanded targets (no pulse) and their ceilings, for the key lighting of left-arm regions. */
  function keyTarget(s, id, at) {
    if (id === 'grasp_close') return s.graspHold ? 1 : 0; // R558 (Message 48): the grip of a Space grasp
    if (id === 'open_hand') return at < s.openRemaining ? 1 : 0;
    return at < s.relaxRemaining ? 1 : 0;
  }
  function keyCeiling(s, id, b0, b1) {
    if (id === 'grasp_close') return 1;
    const rem = id === 'open_hand' ? s.openRemaining : s.relaxRemaining;
    return b0 < rem ? fadeCeiling(rem - b1) : 1;
  }

  /** Crisp display envelope step: fast rise/decay toward `target`, never above `ceiling`. */
  const envelope = (level, target, seg, ceiling) => Math.min(approach(level, target, seg, displayRiseTau, displayDecayTau), ceiling);

  function setAnchor(s) {
    s.anchorYaw = s.gazeYaw;
    s.anchorPitch = s.gazePitch;
  }

  function cancelPulse(s) {
    s.pulseClick = false;
    s.pulseLook = false;
    s.pulseAction = null;
    s.pulseRegion = null;
    s.pulseBody = null;
    s.pulseRotation = null;
    s.pulseRemaining = 0;
    s.pulseMove = false;
  }

  /** True when `hit` (an area under the crosshair, a tapped muscle's area) has a movement: a body action, a game-arm
   * action or a forearm turn. Areas without one (the in-between areas, an area named only for its muscle) light only. */
  const hitMoves = hit => Boolean(hit) && ((hit.bodyKey !== null && hit.bodyKey !== undefined) || (hit.armAction !== null && hit.armAction !== undefined)
    || (hit.rotation !== null && hit.rotation !== undefined));

  /** 21 November 2026 (SEEMOVE, section 189; Message 204: "make sure there's clear movement for each brain activation
   * area"): the left forearm's turn asked for where the forearm already is ("Turn left palm up" at the start: the palm
   * is up; measured in the browser: nothing moved at all). As for a body joint that is at the stop its movement ends at
   * (JOINT_LATCH stopBounceShare / stopBounceMaxDeg: the right palm does this), the turn STRIKES its stop: the forearm is
   * thrown off it by the same share of its whole turn (never more than stopBounceMaxDeg: 38 of its 160 degrees) and is
   * drawn straight back onto it by the turn's own ease, a visible twitch against the stop. With the ease's time
   * constant tau (critically damped) a start speed v away from the goal carries the turn v x tau / e at the most, after
   * tau seconds. Only when the forearm is at that end (within TURN_AT_END of its whole turn); a turn with room turns.
   * Not under reduced motion (no kick there, as for the body). */
  function strikeTurn(s, channel) {
    if (!(kickShare > 0) || !(stopShare > 0) || !(rotationTau > 0) || !isPlainObject(s.rotation) || !isFiniteNumber(s.rotation.value)) return;
    const end = channel === 'supination' ? 1 : 0;
    if (Math.abs(s.rotation.value - end) > TURN_AT_END) return;
    const share = Math.min(stopMaxDeg, stopShare * TURN_RANGE_DEG) / TURN_RANGE_DEG;
    if (share > 0) s.rotation.speed = (end === 1 ? -1 : 1) * share * Math.E / rotationTau + 0;
  }

  /** 20 November 2026 (Message 206): commit a deliberate activation's movement: its CONTRACTION (contractBody,
   * contractArm; a forearm-turn area turns the forearm for the contraction and it turns back, integrate). The area's
   * pulse, when it is this activation's, becomes the contraction's light: exactly contractS long, with the short fade,
   * so the area, its muscles, the beam and the display are dark when the return begins. moveSeq / lastMove count it. */
  function commitMove(s, hit) {
    if (!hitMoves(hit)) return;
    if (hit.rotation) {
      // A word command turns the radius around the stationary ulna. The reach
      // solver uses the return posture for the contraction and the return.
      if (hit.isolateForearm) s.rotation.axialAnchor = s.rotation.hold ?? rotValue(s.rotationState);
      else delete s.rotation.axialAnchor;
    }
    if (hit.bodyKey !== null && hit.bodyKey !== undefined) contractBody(s, hit.bodyKey, hit.isolateForearm);
    if (hit.armAction !== null && hit.armAction !== undefined) contractArm(s, hit.armAction);
    if (hit.rotation && !hit.isolateForearm) strikeTurn(s, hit.rotation);
    if (s.pulseRemaining > 0 && s.pulseRegion === hit.regionId && s.pulseBody === hit.bodyKey && s.pulseAction === hit.armAction && s.pulseRotation === hit.rotation) {
      s.pulseRemaining = contractS;
      s.pulseMove = true;
      // (21 November 2026, SEEMOVE: the left forearm's turn stays turned through the hold too: its own note, [the end
      // (0 palm down / 1 palm up), seconds left]; its light is the pulse's, contractS long, as for every movement)
      if (hit.rotation !== null && hit.rotation !== undefined && isPlainObject(s.rotation)) s.rotation.move = [hit.rotation === 'supination' ? 1 : 0, moveS + 0];
    }
    s.moveSeq = (safeCount(s.moveSeq) ? s.moveSeq : 0) + 1;
    s.lastMove = { regionId: hit.regionId, actionId: hit.actionId, armAction: hit.armAction, bodyKey: hit.bodyKey, rotation: hit.rotation };
  }

  /** Message 206: a look that left its area (or was silenced) before latchS moved nothing, so the glow its pulse
   * started ends too (an area with a movement is lit only while it contracts). An area without a movement keeps its
   * glow, as before. */
  function dropPendingLook(s) {
    const p = s.latchPending;
    s.latchPending = null;
    if (!p || !p.hit || !hitMoves(p.hit) || s.pulseMove === true || s.pulseLook !== true || !(s.pulseRemaining > 0)) return;
    if (s.pulseRegion === p.hit.regionId && s.pulseBody === p.hit.bodyKey && s.pulseAction === p.hit.armAction && s.pulseRotation === p.hit.rotation) cancelPulse(s);
  }

  /** R558 (Messages 55 and 56): note that the REST of a look took this area's movement. The shell reads it so the
   * information card takes the area in the same frame; the movement itself can carry the look off the area at once
   * (a neck movement moves the view). */
  function tookByLook(s, hit) {
    s.lookTaken = { regionId: typeof hit.regionId === 'string' ? hit.regionId : null, n: (s.lookTaken && Number.isFinite(s.lookTaken.n) ? s.lookTaken.n : 0) + 1 };
  }

  function startPulse(s, hit, source, at, collect, area = null, fromLook = false) {
    // R558 (Message 48): while the Space grip holds the hand closed, an action that needs the same fingers does not
    // start (its area would light while nothing moved). Returns false; the count is kept for the shell.
    if (s.graspHold && hit.armAction !== null && SPACE_COMPETING.includes(hit.armAction)) {
      s.suppressedSeq += 1;
      s.lastSuppressed = { actionId: hit.armAction, source, t: s.t };
      return false;
    }
    s.pulseAction = hit.armAction;
    s.pulseRegion = hit.regionId;
    s.pulseBody = hit.bodyKey;
    s.pulseRotation = hit.rotation;
    s.pulseRemaining = pulseSeconds;
    s.pulseMove = false;      // (Message 206: commitMove makes it the contraction's light)
    s.pulseSeq += 1;          // each start is a distinct pulse
    s.lastTriggerAt = s.t;
    s.lastTriggerSource = source;
    // A look-movement restart of a clicked area stays a click pulse (it is the same deliberate choice).
    s.pulseClick = source === 'click' || (source === 'moved' && s.pulseClick === true);
    // 18 Nov (S4): a look's pulse (a look-movement restart keeps what the pulse was; a held limb's restart is no look).
    const look = source === 'gaze' || source === 'dwell';
    s.pulseLook = look || (source === 'moved' && fromLook === true && s.pulseLook === true);
    // A deliberate activation (not the restart of the same area by a small look movement, not a held limb's restart)
    // makes its part contract (commitMove; Message 206: and then return). A click (or a look that already dwelt to
    // replace a click) commits at once; a look onto a new area commits once the gaze has stayed there latchS.
    // A look-movement restart ('moved', the same area) keeps a pending look: its dwell is still running.
    // 18 Nov (S4, LOOK_ARMS): a look commits nothing; its rest only arms the area (lookTaken, in step).
    // (Message 206: a number key's progressive press is an ordinary press now: MOVE_HOLD.)
    if (source !== 'moved') {
      s.latchPending = null;
      if (source === 'gaze' && latchS > 0 && typeof area === 'string') s.latchPending = { area, hit: { ...hit }, since: s.t };
      else if (!(look && armOnly)) commitMove(s, hit);
      else if (source === 'gaze') tookByLook(s, hit); // no rest time asked: armed at once
    }
    // Persistent marks count deliberate activations: a click at once, a look only once the gaze has stayed on the area
    // for markS (R3-fix M5; applyGaze adds it), never the look-movement restarts within an area.
    if (hit.regionId !== null && source === 'click') { s.activatedRegions[hit.regionId] = (s.activatedRegions[hit.regionId] || 0) + 1; s.markPending = null; }
    if (collect) {
      collect({
        actionId: hit.armAction !== null ? hit.armAction : hit.actionId, regionId: hit.regionId,
        bodyActionId: hit.bodyKey !== null ? hit.actionId : null, rotation: hit.rotation, source, at,
        // 18 Nov (S4): a look's pulse only arms the area (it moves nothing); the guide can tell it from a press
        ...(armOnly && s.pulseLook ? { armed: true } : {})
      });
    }
    return true;
  }

  // ---- gaze resolution ----------------------------------------------------------------------------

  function pickRegionAction(r, actionId, u) {
    if (r.actions.length === 0) return null;
    if (actionId !== undefined && actionId !== null) {
      const a = r.actions.find(x => x.id === actionId) || r.actions.find(x => x.armActionId === actionId);
      if (!a) fail('activity_action', `region ${r.id} has no action ${JSON.stringify(actionId)}`);
      return a;
    }
    // R558: the same split as ns-brain regionActionAt: the region's core (its own control cell), else its extent.
    const span = Array.isArray(r.core) && r.core[1] > r.core[0] ? r.core : r.extent;
    if (isFiniteNumber(u) && span[1] > span[0]) {
      const f = (u - span[0]) / (span[1] - span[0]);
      return r.actions[clamp(Math.floor(f * r.actions.length), 0, r.actions.length - 1)];
    }
    return r.actions[0];
  }

  /** { kind, area, hit, arrow } of a gaze event (validated). */
  function resolveGaze(ev) {
    const kind = ev.kind === undefined || ev.kind === null ? null : ev.kind;
    if (kind !== null && !GAZE_KINDS.includes(kind)) fail('activity_gaze', `gaze kind must be one of ${GAZE_KINDS.join(', ')}`);
    const arrow = ev.arrow === undefined || ev.arrow === null ? null : ev.arrow;
    if (arrow !== null && !ORBIT_DIRS.includes(arrow)) fail('activity_gaze', `gaze arrow must be one of ${ORBIT_DIRS.join(', ')} or null`);
    const regionId = ev.regionId === undefined || ev.regionId === null ? null : ev.regionId;
    if (arrow !== null) return { kind: kind === null ? 'empty' : kind, area: null, hit: null, arrow };
    if (kind === 'glass' || kind === 'empty') return { kind, area: null, hit: null, arrow: null };
    if (regionId !== null) {
      const r = binding.regions.get(regionId);
      if (!r) fail('activity_region', `gaze regionId ${JSON.stringify(regionId)} is not a BODY_MOTOR_MAP region`);
      const a = pickRegionAction(r, ev.actionId, ev.u);
      const arm = r.isLeftArm && a && ACTION_IDS.includes(a.armActionId) ? a.armActionId : null;
      const rot = r.isLeftArm && a && ROTATION_ACTION_IDS.includes(a.armActionId) ? a.armActionId : null;
      const hit = {
        regionId: r.id, actionId: a ? a.id : null, armAction: arm,
        bodyKey: !r.isLeftArm && a ? bodyActionKey(r.id, a.id) : null, rotation: rot
      };
      return { kind: 'region', area: `${r.id}/${a ? a.id : ''}`, hit, arrow: null };
    }
    if (kind === 'region') fail('activity_gaze', "a gaze of kind 'region' needs a regionId");
    const id = ev.actionId === undefined ? null : ev.actionId;
    if (id === null) return { kind: kind === null ? 'empty' : kind, area: null, hit: null, arrow: null };
    if (!ACTION_IDS.includes(id)) {
      fail('activity_action', `gaze actionId ${JSON.stringify(id)} is not a strip action (use null for empty space or non-strip brain)`);
    }
    // Legacy focus-strip gaze: the arm action itself is the area; its region (if the map lists one) is credited.
    const rid = binding.armActionRegion.has(id) ? binding.armActionRegion.get(id) : null;
    return { kind: 'strip', area: id, hit: { regionId: rid, actionId: id, armAction: id, bodyKey: null, rotation: null }, arrow: null };
  }

  function applyGaze(s, ev, at, collect) {
    const hasDir = ev.yaw !== undefined || ev.pitch !== undefined;
    if (hasDir && !(isFiniteNumber(ev.yaw) && isFiniteNumber(ev.pitch))) {
      fail('activity_event', 'gaze yaw and pitch must both be finite radians when given');
    }
    const g = resolveGaze(ev);
    if (s.latchPending && g.area !== s.latchPending.area) dropPendingLook(s); // R558: the look left before latchS (Message 206: its glow ends)
    if (hasDir) { s.gazeYaw = ev.yaw; s.gazePitch = ev.pitch; }
    if (s.brainGrab.active && hasDir) s.brainPlacement = grabPlacement(s.brainGrab, ev.yaw, ev.pitch, grabLimitRad);
    // Silent: explicit seed (first frame, re-frame), the frame after an orbit/grab release/resume/reset, while paused,
    // and while dragging the brain (the gaze moves with the brain, so nothing new was looked at).
    const silent = ev.seed === true || s.seedNextGaze || s.paused || s.brainGrab.active;
    s.seedNextGaze = false;
    // 21 November 2026, late (FIX63; a check of update 63: "a look that arrives on an area while a neck or trunk movement
    // carries the view stays dead after the carry ends: nothing switches on until the player looks off and back"). The
    // silent frames of the carry record the area under the crosshair as looked at (the lines at the end of this
    // function), so when the silence ended the area was "the same area" and started nothing. arrivedFrom: the caller
    // says the player's own look movement brought the look here from that area (or from none: null) during the silence.
    // An area other than that one is then a new area. Not given: nothing changes (a view the game slid by itself).
    if (ev.arrivedFrom !== undefined && ev.arrivedFrom !== null && typeof ev.arrivedFrom !== 'string') fail('activity_event', 'gaze arrivedFrom must be an area (a string) or null');
    const arrived = !silent && g.area !== null && ev.arrivedFrom !== undefined && g.area !== ev.arrivedFrom;
    const clickRunning = s.pulseClick === true && s.pulseRemaining > 0;
    // A look onto a new area starts its 1 s pulse at once, except that it does not replace a running CLICK pulse until
    // the gaze has stayed on it for replaceClickS (R3-fix M3); the look's persistent mark waits for markS (M5).
    const startLook = source => {
      const started = startPulse(s, g.hit, source, at, collect, g.area);
      // 18 Nov (S4): an armed look switched nothing on, so it leaves no "switched on" mark (a press does)
      if (started && g.hit.regionId !== null && !armOnly) s.markPending = { area: g.area, regionId: g.hit.regionId, since: s.t };
      if (started && source === 'dwell') tookByLook(s, g.hit); // the look had rested there already: taken at once
      s.pendingGaze = null;
    };
    if (silent || g.area === null) {
      // Empty space / glass / arrow: nothing new starts and an unexpired pulse is NOT erased.
      s.pendingGaze = null;
      if (g.area !== s.gazeArea) s.markPending = null;
      setAnchor(s);
    } else if (g.area !== s.gazeArea || arrived) {
      s.markPending = null;
      if (clickRunning && replaceClickS > 0) s.pendingGaze = { area: g.area, since: s.t };
      else startLook('gaze');   // a new area (re)starts one pulse
      setAnchor(s);
    } else if (s.pendingGaze && s.pendingGaze.area === g.area) {
      // Waiting to replace a click pulse: start once the dwell is reached or the click pulse has ended.
      if (!clickRunning || s.t - s.pendingGaze.since >= replaceClickS - SNAP) { startLook('dwell'); setAnchor(s); }
    } else {
      let moved;
      if (hasDir && s.anchorYaw !== null && s.anchorPitch !== null) {
        moved = gazeAngleDeg({ yaw: s.anchorYaw, pitch: s.anchorPitch }, { yaw: s.gazeYaw, pitch: s.gazePitch }) > gazeDeadbandDeg;
      } else if (hasDir) {
        moved = false;      // first direction seen on this area: it becomes the anchor
        setAnchor(s);
      } else {
        moved = ev.moved === true; // legacy per-frame boolean from the caller
      }
      if (moved) {
        // 20 November 2026 (Message 206): a small look movement within an area with a movement starts nothing: its light
        // is its contraction, and a further contraction is a click. (It used to light the area for another second while
        // the part was held.) An area without a movement, and the look that only arms (LOOK_ARMS on), restart as before.
        if (armOnly || !hitMoves(g.hit)) startPulse(s, g.hit, 'moved', at, collect, null, true);
        setAnchor(s);
      }
    }
    s.gazeKind = g.kind;
    s.gazeArea = g.area;
    s.gazeHit = g.hit;
    s.gazeArrow = g.arrow;
    s.gazeAction = g.hit ? g.hit.armAction : null;
  }

  // ---- Space (the dance), grab ----------------------------------------------------------------

  // The brain grab is no longer started by Space (R558: the grasp moves to its own key). startGrab / endGrab stay for
  // that key's owner; Space neither starts nor ends a grab.
  function startGrab(s) {
    s.brainGrab = {
      active: true, startYaw: s.gazeYaw, startPitch: s.gazePitch,
      originYaw: s.brainPlacement.yaw, originPitch: s.brainPlacement.pitch
    };
    s.grabSeq += 1;
  }

  function endGrab(s) {
    s.brainGrab = { ...s.brainGrab, active: false };
    s.seedNextGaze = true; // the brain stopped moving under the crosshair: the next gaze is recorded, not a new look
  }

  /**
   * Legacy Space key event. R558 (user Message 40): Space now grasps (hold or tap) and turns the limbs (double tap, held
   * double tap); ns-controls SPACE_GESTURE turns the key into 'grasp' and 'turn' events, so a raw { type: 'space' }
   * event is only checked and moves nothing (an older caller still sending it neither fails nor starts a turn).
   */
  function applySpace(s, ev) {
    if (typeof ev.down !== 'boolean') fail('activity_event', 'space event needs a boolean down');
    if (ev.safety === true) s.spaceTapAt = null;
  }

  /**
   * R558 (user Message 40: "double tapping causes rotation, and double tapping and holding continues that rotation, but
   * slowly"). { type: 'turn', phase }:
   *   'step'  a double tap: every limb makes one stroke to its next end (ns-dance startTurnStep), then stops by itself.
   *           rotationSeq counts these (the guide's flipPalm goal).
   *   'hold'  the double tap is still held (ns-controls SPACE_GESTURE.tapMaxMs after its press): the turn goes on,
   *           slowly (ns-dance startTurnHold), while spaceHeld is true.
   *   'stop'  let go after a hold, or a safety release: every limb stays where it is (stopDance: the player's own turn,
   *           which Message 206 keeps).
   * While paused a step or a hold starts nothing; a stop always applies.
   */
  function applyTurn(s, ev) {
    if (ev.phase === 'step') {
      if (s.paused) return;
      s.rotationSeq += 1;
      s.spaceTapAt = null;
      s.dance = startTurnStep(s.dance);
    } else if (ev.phase === 'hold') {
      if (s.paused) return;
      s.spaceHeld = true;
      s.dance = startTurnHold(s.dance);
    } else if (ev.phase === 'stop') {
      s.spaceHeld = false;
      if (s.dance.mode !== null || s.dance.active) s.dance = stopDance(s.dance);
    } else {
      fail('activity_event', 'turn event needs phase "step", "hold" or "stop"');
    }
  }

  /** R558 (user Message 40): holding or tapping Space grasps (ns-controls SPACE_GESTURE; the F key of Messages 2 and 12
   * is gone). A press with the
   * crosshair on the brain (target 'brain', or no target while the gaze is on a brain area or its glass) starts the
   * brain grab: while held the brain keeps its angular offset to the camera, gaze pulses are
   * recorded silently, and the release leaves it where it is. A press on another item (target 'mirror' or 'limb': the
   * mirror body or one of your own limbs, which the app carries) never grabs the brain. A safety release is the same as
   * a release. */
  function applyGrasp(s, ev) {
    if (typeof ev.down !== 'boolean') fail('activity_event', 'grasp event needs a boolean down');
    if (ev.down === true) {
      if (s.paused || s.brainGrab.active || s.gazeYaw === null || s.gazePitch === null) return;
      const onBrain = s.gazeKind === 'region' || s.gazeKind === 'glass';
      // R558 (hunt 2 code #4): a press labelled with its target holds exactly that (null = nothing, e.g. a press on your
      // own trunk); only a press with no target key falls back to the gaze.
      if (ev.target === 'brain' || (ev.target === undefined && onBrain)) startGrab(s);
    } else if (s.brainGrab.active) endGrab(s);     // the brain stays where it was released
  }

  /**
   * R558 (user Message 48: "the grasping action, you can't see the grasping action at all"). { type: 'grip', on }: the
   * left hand of the game arm closes while Space holds or keeps a grasp and opens when the grasp lets go. The shell
   * sends it whenever the Space gesture's grasp (ns-controls SPACE_GESTURE: held or kept) starts or ends, whatever the
   * crosshair is on, so the grasp is always seen on your own hand and on the hand part of the strip.
   *   on true   graspHold: the pose closes the hand (grasp_close wins the fingers: a finger contraction under way
   *             ends), the hand area and the finger benders light for as long as the grip lasts. A running pulse of
   *             an action that competes for the fingers ends. Ignored while paused.
   *   on false  the grip lets go: the hand goes back to its place, unlit (22 November 2026, H5, GRIP_RELEASE); with
   *             openOnRelease on, the old rule: it opens for spaceOpenSeconds (open_hand: a game rule, a real hand can
   *             also let go by relaxing). Always applies. (Message 206: no movement of the brain's holds the hand closed.)
   */
  function applyGrip(s, ev) {
    if (typeof ev.on !== 'boolean') fail('activity_event', 'grip event needs a boolean on');
    if (ev.on === true) {
      if (s.paused || s.graspHold) return;
      s.graspHold = true;
      s.openRemaining = 0;
      s.relaxRemaining = 0;
      if (s.pulseAction !== null && SPACE_COMPETING.includes(s.pulseAction)) cancelPulse(s);
    } else if (s.graspHold) {
      s.graspHold = false;
      s.relaxRemaining = 0;
      s.openRemaining = openOnRelease ? spaceOpenSeconds : 0;
      if (s.pulseAction !== null && DIGIT_FLEXING.includes(s.pulseAction)) cancelPulse(s);
    }
  }

  /** The current angles of the dance joints (ns-dance DANCE_LIMBS conventions). The game arm: in the explicit mode its
   * radius turn and upper-arm turn; in the coupled palm turn (before the first dance, after Reset body) the angles it
   * actually showed last frame (armTurnSeen: the coupling shares the palm turn between them), so the dance starts
   * from exactly what is on screen. */
  function danceAngles(s) {
    const T = PRONATION_DEG_AT_VALUE(s.rotation.value);
    const seen = s.armHumeral === null && s.armTurnSeen ? s.armTurnSeen : null;
    const a = isFiniteNumber(s.armHumeral) ? { l_forearm: T, l_shoulder_rot: s.armHumeral }
      : { l_forearm: seen ? seen.forearmDeg : T, l_shoulder_rot: seen ? seen.humeralDeg : 0 };
    for (const j of DANCE_BODY_JOINTS) a[j] = s.bodyPos[j];
    return a;
  }

  /** Write dance angles back: the body joints are held there (goal = position, no speed), the game arm's palm turn and
   * upper-arm swivel likewise (rotation.hold keeps the eased forearm value where the dance left it). */
  function applyDanceAngles(s, a) {
    const v = clamp((PRONATION_END_DEG - a.l_forearm) / (2 * PRONATION_END_DEG), 0, 1);
    s.rotation = { ...s.rotation, value: v, speed: 0, hold: v, move: null }; // (the dance owns the forearm: a strip turn under way ends)
    delete s.rotation.axialAnchor;
    s.rotationState = v >= 0.5 ? 'supinated' : 'pronated';
    s.armHumeral = a.l_shoulder_rot + 0; // the explicit mode (until Reset body)
    for (const j of DANCE_BODY_JOINTS) {
      const q = limitJoint(j, a[j]) + 0;
      s.bodyPos[j] = q; s.bodyGoal[j] = q; s.bodyVel[j] = 0;
      if (s.bodyJerk) delete s.bodyJerk[j]; // (the turn owns these joints while it runs: Message 206 keeps the turn)
    }
  }

  /** Keep each hip inside the touch-free range of the current leg posture (danceRange, from ns-body
   * hipRotationClearRange via a 'danceRange' event), whatever moved it. */
  function clampDanceRange(s) {
    for (const j of DANCE_BODY_JOINTS) {
      const r = s.danceRange[j];
      if (!r) continue;
      const lo = Math.min(r[0], r[1]), hi = Math.max(r[0], r[1]);
      const p = clamp(s.bodyPos[j], lo, hi) + 0, g = clamp(s.bodyGoal[j], lo, hi) + 0;
      if (p !== s.bodyPos[j]) { s.bodyPos[j] = p; s.bodyVel[j] = 0; }
      s.bodyGoal[j] = g;
    }
  }

  /** One turn piece of h seconds (after the springs and eases of the same piece): record outside movement (history),
   * then, while a turn runs (a double tap's step, or the slow turn of a double tap held) and the game runs, turn every
   * limb (ns-dance stepDance). A pause ends the turn where the limbs are (nothing moves by itself after a resume). */
  function danceStep(s, h) {
    clampDanceRange(s);
    let d = observeDance(s.dance, danceAngles(s));
    if (d.mode !== null && !s.paused && h > 0) {
      // 18 November 2026, late: the right upper arm turns only as far as its elevation leaves room (ns-dance
      // shoulderTurnRange, the combined-range rule of ns-body), so a raised arm is never turned past what is drawn.
      const ranges = { ...s.danceRange, r_shoulder_rot: shoulderTurnRange(shoulderElevationDeg(s.bodyPos.r_shoulder_flex, s.bodyPos.r_shoulder_abd)) };
      const r = stepDance(d, danceAngles(s), h, { ranges });
      d = r.dance;
      applyDanceAngles(s, r.angles);
    } else if (s.paused && (d.mode !== null || d.active)) { d = stopDance(d); s.spaceHeld = false; }
    s.dance = d;
  }

  // ---- instructions, orbit, reset -----------------------------------------------------------------

  function showInstructions(s, reason) {
    s.instructions = { visible: true, reason, shownAt: s.t, autoHideAt: null };
    s.paused = true;
    // Round-2 fix R2: the shell freezes the activity clock while paused, so a tap before the pause and one after it
    // could fall inside the double-tap window. A pause or resume always ends the tap chain.
    s.spaceTapAt = null;
    if (s.brainGrab.active) endGrab(s);
    // R558 (Message 40): a pause ends a limb turn (a step or the slow turn) where the limbs are.
    if (s.dance.mode !== null || s.dance.active) s.dance = stopDance(s.dance);
    s.spaceHeld = false;
    s.graspHold = false; // the grip ends with the pause (no opening window: nothing moves while paused)
  }

  function hideInstructions(s) {
    const wasPaused = s.paused;
    s.instructions = { visible: false, reason: null, shownAt: s.instructions.shownAt, autoHideAt: null };
    s.paused = false;
    s.spaceTapAt = null;
    if (wasPaused) s.seedNextGaze = true;
  }

  /** One orbit step; stepDeg (optional, > 0) is a smaller step for a held arrow (round-2 fix F4); limits unchanged. */
  function doOrbit(s, dir, stepDeg = null) {
    const lim = isFiniteNumber(stepDeg) && stepDeg > 0 && stepDeg !== orbitOpts.stepDeg ? { ...orbitOpts, stepDeg } : orbitOpts;
    const next = stepOrbit(s.orbit, dir, lim);
    if (next.yaw === s.orbit.yaw && next.pitch === s.orbit.pitch) return;
    s.orbit = next;
    s.orbitSeq += 1;
    s.seedNextGaze = true; // the brain turned under a still crosshair: not a new look
  }

  function resetBodyInPlace(s) {
    s.activatedRegions = {};
    s.pendingGaze = null;
    s.markPending = null;
    s.latchPending = null;
    cancelPulse(s);
    for (const k of BODY_KEYS) { s.bodyDrive[k] = 0; s.bodyDisplay[k] = 0; }
    // Every joint at its start angle at once (the places the player gave the limbs too), no contraction under way.
    s.bodyGoal = restMap();
    s.bodyPos = restMap();
    s.bodyVel = zeroMap(JOINT_IDS);
    s.bodyJerk = {};
    s.armJerk = {};
    for (const r of REGION_IDS) s.regionDisplay[r] = 0;
    for (const id of ACTION_IDS) {
      s.drive[id] = 0;
      s.display[id] = 0;
    }
    for (const id of KEY_DISPLAY_IDS) s.keyDisplay[id] = 0;
    s.openRemaining = 0;
    s.relaxRemaining = 0;
    s.rotationState = defaultRotation;
    s.rotation = { value: rotValue(defaultRotation), speed: 0, remaining: 0, channel: null, hold: null, move: null };
    s.armHumeral = armHumeralStart(); // 18 November 2026, late: back to the start side's upper-arm turn (was null: the coupled palm turn)
    // R558 (Message 40): Reset body also ends a limb turn under way; every limb is back at its start angle.
    if (s.dance.mode !== null || s.dance.active) s.dance = stopDance(s.dance);
    s.spaceHeld = false;
    s.rotationDisplay = zeroMap(ROTATION_ACTION_IDS);
    s.rotationKeyDisplay = zeroMap(ROTATION_ACTION_IDS);
    s.spaceTapAt = null;
    // Round-2 fix R1: a released brain stays where the player left it (R4) and the orbit is kept; Reset body clears
    // the body only. The separate Reset brain view (ns-app resetBrainView) returns placement and orbit to { 0, 0 }.
    if (s.brainGrab.active) endGrab(s);
    s.seedNextGaze = true;
    s.resetSeq += 1;
  }

  function applyEvent(s, ev, at, collect) {
    switch (ev.type) {
      case 'gaze':
        applyGaze(s, ev, at, collect);
        return;
      case 'click':
        if (s.paused) return;
        if (s.gazeArrow !== null) { doOrbit(s, s.gazeArrow); return; } // hover an arrow, then click: orbit
        // Re-trigger one pulse for the valid area under the crosshair only.
        if (s.gazeHit !== null) {
          startPulse(s, s.gazeHit, 'click', at, collect);
          setAnchor(s);
        }
        return;
      case 'muscle': {
        // R558 (genuine note R31): a tap on a body muscle. The caller (ns-app) names the motor-map region, and the
        // region action that lists the tapped muscle as a mover when the map has one. This starts that area's ordinary
        // one-second pulse, exactly as a click on the area does (same colours, joint movement, gold mark and glow), so
        // nothing new is claimed about the brain: it is the same whole-area link, reached from the muscle's end.
        // regionOnly: the map has no movement for this muscle; only its body part's area is switched on.
        // The crosshair's own gaze record is left alone, so the next look or click behaves as before.
        if (s.paused) return;
        const r = binding.regions.get(ev.regionId);
        if (!r) fail('activity_region', `muscle regionId ${JSON.stringify(ev.regionId)} is not a BODY_MOTOR_MAP region`);
        const hit = ev.regionOnly === true || r.actions.length === 0
          ? { regionId: r.id, actionId: null, armAction: null, bodyKey: null, rotation: null }
          : resolveGaze({ kind: 'region', regionId: r.id, actionId: ev.actionId === undefined ? null : ev.actionId }).hit;
        // (Message 206: a progressive press, a number key held, is an ordinary press: MOVE_HOLD)
        if (hit !== null) startPulse(s, ev.isolateForearm === true ? { ...hit, isolateForearm: true } : hit, 'click', at, collect);
        return;
      }
      case 'muscleRelease':
        // 18 Nov (M3, MOVE_HOLD): the number key of a progressive press came up. 20 November 2026 (Message 206): the part
        // contracts and returns whatever the key does, so this changes nothing (accepted for older callers).
        return;
      case 'space':
        applySpace(s, ev);
        return;
      case 'turn':
        applyTurn(s, ev);
        return;
      case 'grasp':
        applyGrasp(s, ev);
        return;
      case 'grip':
        applyGrip(s, ev);
        return;
      case 'limbPlace': {
        // 22 November 2026 (SEEMOVE, ns-app HOLD_BODY: the right arm let go during a trunk movement goes back to its places):
        // the joints' places only (bodyGoal). A joint springs to its place like any return; a contraction of it still under
        // way is not ended (a limbPose would end it), it returns to the new place. Nothing is lit, nothing else changes.
        if (s.paused) return;
        if (!isPlainObject(ev.joints)) fail('activity_event', 'limbPlace needs joints { jointId: degrees }');
        for (const [j, deg] of Object.entries(ev.joints)) {
          if (!JOINT_IDS.includes(j)) fail('activity_event', `limbPlace joint ${JSON.stringify(j)} is not a body joint`);
          if (!isFiniteNumber(deg)) fail('activity_event', `limbPlace joint ${j} needs finite degrees`);
          s.bodyGoal[j] = limitJoint(j, deg) + 0;
        }
        return;
      }
      case 'limbPose': {
        // R558 (user Messages 2, 12 and 40): one of your own limbs, held with Space and moved, or turned by a drag. The app
        // solves its joints inside their anatomical ranges and hands them here: { joints: { jointId: degrees },
        // regionId?, actionId? }. They are set at once (place and position: the limb follows the hand that holds it, no
        // jerk) and STAY there: this is the player placing the limb, not the brain (Message 206 keeps it), so a later
        // contraction returns to this place. A contraction of these joints still under way ends here (the hand that
        // holds the limb wins it). regionId / actionId (a motor-map area and, optionally, its action) light that area
        // and its muscles with the ordinary one-second pulse, restarted while the limb keeps moving; such a restart
        // contracts nothing ('moved').
        if (s.paused) return;
        if (!isPlainObject(ev.joints)) fail('activity_event', 'limbPose needs joints { jointId: degrees }');
        // The tracked shoulder and elbow take the arm's position, just as a
        // placed body joint below takes its position from that joint's spring.
        // A contraction triggered under the camera must not replay on release.
        if (ev.trackedLeftUpperArm === true) {
          for (const id of ['shoulder_flexion', 'shoulder_extension', 'shoulder_abduction', 'shoulder_adduction', 'elbow_flexion', 'elbow_extension']) {
            if (s.armJerk) delete s.armJerk[id];
            s.drive[id] = 0;
          }
        }
        for (const [j, deg] of Object.entries(ev.joints)) {
          if (!JOINT_IDS.includes(j)) fail('activity_event', `limbPose joint ${JSON.stringify(j)} is not a body joint`);
          if (!isFiniteNumber(deg)) fail('activity_event', `limbPose joint ${j} needs finite degrees`);
          const v = limitJoint(j, deg) + 0;
          s.bodyGoal[j] = v; s.bodyPos[j] = v; s.bodyVel[j] = 0;
          if (s.bodyJerk) delete s.bodyJerk[j];
        }
        if (ev.regionId !== undefined && ev.regionId !== null) {
          const r = binding.regions.get(ev.regionId);
          if (!r) fail('activity_region', `limbPose regionId ${JSON.stringify(ev.regionId)} is not a BODY_MOTOR_MAP region`);
          const hit = r.actions.length === 0 || ev.actionId === undefined || ev.actionId === null
            ? { regionId: r.id, actionId: null, armAction: null, bodyKey: null, rotation: null }
            : resolveGaze({ kind: 'region', regionId: r.id, actionId: ev.actionId }).hit;
          if (hit !== null && (s.pulseRegion !== hit.regionId || s.pulseBody !== hit.bodyKey || s.pulseRemaining < pulseSeconds / 2)) startPulse(s, hit, 'moved', at, collect);
        }
        return;
      }
      case 'contractStop': {
        // 20 November 2026, night (review of updates 60 and 61, R2; the owner's Message 206: "no permanent movements"):
        // { joints: { jointId: degrees } } (absolute degrees). A contraction of these joints still under way STOPS at this
        // angle, because the part would otherwise run into something (ns-app: a trunk bend that would bring your head
        // into the brain or the mirror body). The joint is set there and held there for the rest of the contraction's
        // time (still lit, as the contraction is), then returns to its place like any contraction. Its place (bodyGoal)
        // is not touched: the stop was a limbPose before, which is the player placing the limb, so a stopped trunk bend
        // stayed bent for good. A joint with no contraction under way is left alone: a return is never stopped, so the
        // part always gets back to where it was.
        if (s.paused) return;
        if (!isPlainObject(ev.joints)) fail('activity_event', 'contractStop needs joints { jointId: degrees }');
        for (const [j, deg] of Object.entries(ev.joints)) {
          if (!JOINT_IDS.includes(j)) fail('activity_event', `contractStop joint ${JSON.stringify(j)} is not a body joint`);
          if (!isFiniteNumber(deg)) fail('activity_event', `contractStop joint ${j} needs finite degrees`);
          const jk = s.bodyJerk ? s.bodyJerk[j] : undefined;
          if (jk === undefined || !(jk[1] > 0)) continue;
          const v = limitJoint(j, deg) + 0;
          jk[0] = v; s.bodyPos[j] = v; s.bodyVel[j] = 0;
        }
        return;
      }
      case 'orbit': {
        // R5-input: { type: 'orbit', dir, stepDeg?, target? }: target 'brain' (or none). The mirror body's orbit is
        // ns-mirror's (ORBIT_TARGETS), so a 'mirror' request here is a wiring error and is refused loudly.
        if (ev.target !== undefined && ev.target !== null && !ORBIT_TARGETS.includes(ev.target)) {
          fail('activity_event', `orbit target ${JSON.stringify(ev.target)} is not the activity's (only ${ORBIT_TARGETS.join(', ')}; the mirror body's orbit is ns-mirror's)`);
        }
        doOrbit(s, ev.dir, ev.stepDeg === undefined ? null : ev.stepDeg);
        return;
      }
      case 'reset':
        resetBodyInPlace(s);
        return;
      case 'escape': {
        const I = s.instructions;
        if (!I.visible) showInstructions(s, 'escape');
        else if (I.reason === 'lock-lost' && s.t - I.shownAt <= escLockDedupeSeconds + SNAP) { /* the Esc that released the lock */ }
        else hideInstructions(s);
        return;
      }
      case 'lock': {
        if (typeof ev.locked !== 'boolean') fail('activity_event', 'lock event needs a boolean locked');
        const I = s.instructions;
        if (!ev.locked) {
          if (!I.visible || I.reason === 'intro') showInstructions(s, 'lock-lost');
        } else if (resumeOnLock && I.visible && I.reason !== 'intro') {
          hideInstructions(s);
        }
        return;
      }
      case 'resume':
        if (s.instructions.visible) hideInstructions(s);
        return;
      case 'pause':
        if (!s.instructions.visible || s.instructions.reason === 'intro') showInstructions(s, 'pause');
        return;
      case 'reach':
        return; // step-level input, collected before integration
      case 'armTurn': {
        // R558 (Space dance): what the game arm actually showed last frame (ns-arm fit coupling: the radius' turn and
        // the upper arm's turn), so a dance that starts from the coupled palm turn starts exactly there.
        if (!isFiniteNumber(ev.forearmDeg) || !isFiniteNumber(ev.humeralDeg)) fail('activity_event', 'armTurn needs finite forearmDeg and humeralDeg');
        s.armTurnSeen = { forearmDeg: ev.forearmDeg + 0, humeralDeg: ev.humeralDeg + 0 };
        return;
      }
      case 'danceRange': {
        // R558 (Space dance): the touch-free hip range of the current leg posture (ns-app, from ns-body
        // hipRotationClearRange): { joints: { hip_rot_L: [lo, hi], hip_rot_R: [lo, hi] } }. Kept until the next one.
        const j = ev.joints;
        if (!isPlainObject(j)) fail('activity_event', 'danceRange needs joints: { jointId: [lo, hi] }');
        const next = {};
        for (const [k, r] of Object.entries(j)) {
          if (!DANCE_BODY_JOINTS.includes(k)) fail('activity_event', `danceRange: ${k} is not a dance joint`);
          if (!Array.isArray(r) || r.length !== 2 || !r.every(isFiniteNumber)) fail('activity_event', `danceRange.${k} must be [lo, hi] degrees`);
          // R558 (hunt 2 code #6): an inverted pair is refused, never swapped (swapping turned an empty overlap of two
          // touch-free ranges into the band between them, where neither posture is touch-free).
          if (r[0] > r[1]) fail('activity_event', `danceRange.${k} is inverted ([lo, hi] needs lo <= hi)`);
          next[k] = [r[0], r[1]];
        }
        s.danceRange = next;
        clampDanceRange(s);
        return;
      }
      default:
        fail('activity_event', `unknown event type ${JSON.stringify(ev.type)}`);
    }
  }

  // ---- integration --------------------------------------------------------------------------------

  /** Integrate over h wall seconds: exact piecewise pose-drive smoothing and display envelopes (commanded targets
   * change only where a pulse, a Space-release interval or a rotation command ends inside h), then count the timers
   * down and advance the clock. */
  function integrate(s, h) {
    if (!(h > 0)) return;
    const cuts = [s.pulseRemaining, s.openRemaining, s.relaxRemaining, s.rotation.remaining];
    // (Message 206: where a contraction ends inside h, its return starts exactly there)
    for (const k in s.bodyJerk) cuts.push(s.bodyJerk[k][1]);
    for (const k in s.armJerk) cuts.push(s.armJerk[k][0]);
    if (Array.isArray(s.rotation.move)) cuts.push(s.rotation.move[1]);
    const cutsIn = cuts.filter(b => b > 0 && b < h).sort((a, b) => a - b);
    const bounds = [0];
    for (const c of cutsIn) if (c > bounds[bounds.length - 1]) bounds.push(c);
    bounds.push(h);
    for (let i = 0; i + 1 < bounds.length; i++) {
      const b0 = bounds[i], b1 = bounds[i + 1];
      const seg = b1 - b0;
      if (!(seg > 0)) continue;
      const T = commandTargets(s, b0);
      const P = poseTargets(s, b0);
      for (const id of ACTION_IDS) {
        // The POSE drive eases to its place (poseTargets: the grip, the opening, a relax pulse; armPoseTau both ways);
        // the DISPLAY below follows the timed commands.
        // 20 November 2026 (Message 206, contractArm): a contraction drives its action's drive to the end (1) with the
        // body's jerk spring for contractS (thrown back off the end with `restitution` of its speed), then springs it
        // softly back to its place (relaxOmega, critically damped) and the note is dropped there. While the Space grip
        // holds those fingers the grip wins them and the contraction ends.
        let jn = s.armJerk[id];
        if (jn !== undefined && s.graspHold && (id === 'grasp_close' || SPACE_COMPETING.includes(id))) { delete s.armJerk[id]; jn = undefined; }
        if (jn !== undefined) {
          const driving = jn[0] > 0, goal = driving ? 1 : P[id];
          if (!(s.drive[id] === goal && jn[1] === 0)) {
            // (stepped in hundredths of the movement, so the spring's snap, JOINT_LATCH.snapDeg, is 0.02 of a hundredth)
            const [p, v] = stepJointSpring(s.drive[id] * 100, jn[1] * 100, goal * 100, seg, driving ? springOmega : relaxOmega, driving ? springZeta : 1);
            const q = clamp(p, 0, 100);
            s.drive[id] = q / 100 + 0;
            jn[1] = (q === p ? v : springBounce > 0 && Math.sign(v) === Math.sign(p - q) ? -springBounce * v : 0) / 100 + 0;
          }
          if (driving) jn[0] = countdown(jn[0], seg) + 0;
          else if (s.drive[id] === goal && jn[1] === 0) delete s.armJerk[id];
        } else s.drive[id] = approach(s.drive[id], P[id], seg, armPoseTau, armPoseTau);
        const lvl = approach(s.display[id], T[id], seg, displayRiseTau, displayDecayTau);
        s.display[id] = Math.min(lvl, displayCeiling(s, id, b0, b1));
      }
      for (const id of KEY_DISPLAY_IDS) s.keyDisplay[id] = envelope(s.keyDisplay[id], keyTarget(s, id, b0), seg, keyCeiling(s, id, b0, b1));
      const pulseOn = b0 < s.pulseRemaining;
      const pc = pulseOn ? fadeCeiling(s.pulseRemaining - b1, pulseFade(s)) : 1;
      // 18 Nov (S4, LOOK_ARMS): a look's pulse lights its key at full, its muscles at the hint level, and moves nothing.
      const armed = armOnly && s.pulseLook === true;
      for (const r of REGION_IDS) {
        const on = pulseOn && s.pulseRegion === r;
        s.regionDisplay[r] = envelope(s.regionDisplay[r], on ? 1 : 0, seg, on ? pc : 1);
      }
      for (const k of BODY_KEYS) {
        const on = pulseOn && s.pulseBody === k;
        s.bodyDrive[k] = approach(s.bodyDrive[k], on && !armed ? 1 : 0, seg, riseTau, decayTau);
        s.bodyDisplay[k] = envelope(s.bodyDisplay[k], on ? (armed ? armLevel : 1) : 0, seg, on ? pc : 1);
      }
      // 20 November 2026 (Message 206): every body joint is at, or springs back to, its PLACE (bodyGoal) on the soft
      // critically damped relaxOmega spring; a joint with a contraction note is driven to the note's end angle by the
      // jerk spring (JOINT_LATCH omega / zeta, exact per segment) while the note's time runs, then returns to its place
      // the same soft way, and the note is dropped when it is there. A joint stopped by its anatomical limit rebounds
      // off it with `restitution` of its speed (0: it stops dead there), so nothing ever passes a limit.
      for (const j of JOINT_IDS) {
        const place = s.bodyGoal[j], jk = s.bodyJerk[j], driving = jk !== undefined && jk[1] > 0;
        const goal = driving ? jk[0] : place;
        if (!(s.bodyPos[j] === goal && s.bodyVel[j] === 0)) {
          const was = s.bodyPos[j];
          const [p, v] = stepJointSpring(was, s.bodyVel[j], goal, seg, driving ? springOmega : relaxOmega, driving ? springZeta : 1);
          let q = p, w = v;
          // the movement's end is a stop for its contraction: crossing it the part rebounds off it, as off a limit
          if (driving && jk[2] !== 0 && (was - goal) * jk[2] <= 0 && (p - goal) * jk[2] > 0) { q = goal; w = springBounce > 0 && Math.sign(v) === jk[2] ? -springBounce * v : 0; }
          // 21 November 2026 (SEEMOVE, JOINT_LATCH backStop): thrown back off the end, the part stops dead at the place it
          // started from and is driven in again, so a movement with little room never shows as its opposite (not for a
          // stop bounce, whose end is its place)
          else if (backStop && driving && jk[2] !== 0 && Math.abs(goal - place) > JOINT_LATCH.restEpsDeg && (was - place) * jk[2] >= 0 && (q - place) * jk[2] < 0) { q = place; w = 0; }
          const ql = limitJoint(j, q);
          if (ql !== q) { w = springBounce > 0 && Math.sign(w) === Math.sign(q - ql) ? -springBounce * w : 0; q = ql; }
          s.bodyPos[j] = q + 0;
          s.bodyVel[j] = w + 0;
        }
        if (driving) jk[1] = countdown(jk[1], seg) + 0;
        else if (jk !== undefined && s.bodyPos[j] === place && s.bodyVel[j] === 0) delete s.bodyJerk[j];
      }
      const rotOn = s.rotation.channel !== null && b0 < s.rotation.remaining;
      const rc = rotOn ? fadeCeiling(s.rotation.remaining - b1) : 1;
      for (const c of ROTATION_ACTION_IDS) {
        const key = rotOn && s.rotation.channel === c;
        const pul = pulseOn && s.pulseRotation === c;
        s.rotationKeyDisplay[c] = envelope(s.rotationKeyDisplay[c], key ? 1 : 0, seg, key ? rc : 1);
        const ceil = key || pul ? Math.max(key ? rc : 0, pul ? pc : 0) : 1;
        s.rotationDisplay[c] = envelope(s.rotationDisplay[c], key ? 1 : pul ? (armed ? armLevel : 1) : 0, seg, ceil);
      }
      // (Message 206: a forearm-turn area turns the forearm for its contraction, pulseMove, and it turns back to where it
      // was: the turn's held angle or rotationState, which a press no longer changes)
      // (21 November 2026, SEEMOVE: and for the hold after it, rotation.move)
      const turn = Array.isArray(s.rotation.move) && b0 < s.rotation.move[1] ? s.rotation.move : null;
      const goal = turn && !armed ? turn[0]
        : pulseOn && !armed && s.pulseMove === true && s.pulseRotation !== null ? (s.pulseRotation === 'supination' ? 1 : 0)
        : isFiniteNumber(s.rotation.hold) ? s.rotation.hold : rotValue(s.rotationState);
      // R3-arm: critically damped ease (smooth start, ~0.30 s settle with the default poseTau); see stepRotationEase.
      const eased = stepRotationEase(s.rotation.value, s.rotation.speed, goal, seg, rotationTau);
      s.rotation.value = eased.value;
      s.rotation.speed = eased.speed;
      if (!turn && !(pulseOn && s.pulseRotation) && isFiniteNumber(s.rotation.axialAnchor) &&
          Math.abs(eased.value - s.rotation.axialAnchor) < 0.0001 && Math.abs(eased.speed) < 0.001) {
        s.rotation.value = s.rotation.axialAnchor;
        s.rotation.speed = 0;
        delete s.rotation.axialAnchor;
      }
      // R558 (Space dance): history of every limb's turn, then the dance itself while Space is held.
      danceStep(s, seg);
    }
    s.pulseRemaining = countdown(s.pulseRemaining, h);
    if (s.pulseRemaining === 0) cancelPulse(s);
    // R3-fix (M5): a look's persistent mark once the gaze has stayed on that area for markS (time-based, so it holds
    // between gaze events; the gaze area lives in the state until the next gaze event changes it).
    if (s.markPending && s.gazeArea === s.markPending.area && s.t + h - s.markPending.since >= markS - SNAP) {
      const rid = s.markPending.regionId;
      s.activatedRegions[rid] = (s.activatedRegions[rid] || 0) + 1;
      s.markPending = null;
    }
    // R558: a look's movement once the gaze has stayed on that area for latchS (GAZE_DWELL). Nothing moves behind the
    // pause page or while the brain is held: a pending look is dropped then (Message 206: and its glow ends).
    if (s.latchPending && (s.paused || s.brainGrab.active)) dropPendingLook(s);
    if (s.latchPending && s.gazeArea === s.latchPending.area && s.t + h - s.latchPending.since >= latchS - SNAP) {
      const hit = s.latchPending.hit;
      s.latchPending = null;
      if (!armOnly) commitMove(s, hit); // 18 Nov (S4, LOOK_ARMS): the rest arms the area; a press moves it
      tookByLook(s, hit);
    }
    s.openRemaining = countdown(s.openRemaining, h);
    s.relaxRemaining = countdown(s.relaxRemaining, h);
    s.rotation.remaining = countdown(s.rotation.remaining, h);
    if (s.rotation.remaining === 0) s.rotation.channel = null;
    if (Array.isArray(s.rotation.move)) { const left = countdown(s.rotation.move[1], h); s.rotation.move = left > 0 ? [s.rotation.move[0], left + 0] : null; }
    s.t += h;
  }

  function computeRegionActivity(s) {
    const keyArm = {
      grasp_close: s.keyDisplay.grasp_close, open_hand: s.keyDisplay.open_hand, relax_release: s.keyDisplay.relax_release,
      pronation: s.rotationKeyDisplay.pronation, supination: s.rotationKeyDisplay.supination
    };
    const out = {};
    for (const id of REGION_IDS) {
      const r = binding.regions.get(id);
      let v = s.regionDisplay[id];
      if (r.isLeftArm) {
        for (const a of r.armActionIds) if (hasOwn(keyArm, a)) v = Math.max(v, keyArm[a]);
        for (const c of r.channels) if (hasOwn(s.wasdJoint, c)) v = Math.max(v, s.wasdJoint[c]);
      }
      out[id] = clamp(v, 0, 1);
    }
    // R558 (Space dance): the areas of the turning limbs light in proportion to each joint's turning speed.
    const dl = s.dance && s.dance.levels ? s.dance.levels : null;
    if (dl) {
      for (const [j, rids] of Object.entries(DANCE_AREAS)) {
        const v = dl[j];
        if (!(v > 0)) continue;
        for (const rid of rids) if (hasOwn(out, rid)) out[rid] = Math.max(out[rid], clamp(v, 0, 1));
      }
    }
    return out;
  }

  /** Derived fields and timers that depend only on the state: run after every change. */
  function finalize(s) {
    if (!(s.pulseRemaining > 0)) cancelPulse(s);
    const I = s.instructions;
    if (I.visible && I.autoHideAt !== null && s.t + SNAP >= I.autoHideAt) hideInstructions(s);
    s.targets = poseTargets(s, 0);          // the arm pose's place now (held fist, opening; a contraction drives past it)
    s.bodyJointTargets = pick(s.bodyPos, JOINT_IDS); // absolute joint angles: where every joint is now
    s.regionActivity = computeRegionActivity(s);
    return s;
  }

  function run(state, events, dt, collect) {
    checkState(state);
    if (!(isFiniteNumber(dt) && dt >= 0)) fail('activity_dt', 'dt must be a finite number of seconds >= 0');
    const list = events == null ? [] : events;
    if (!Array.isArray(list)) fail('activity_event', 'events must be an array');
    const timed = list.map((ev, i) => ({ ev, i, at: eventOffset(ev, dt) })).sort((a, b) => a.at - b.at || a.i - b.i);

    const s = cloneState(state);
    s.reachRate = 0; // the reach linkage is per step: no latch without a reach event this step
    let reachInput = null;
    for (const { ev } of timed) {
      if (ev.type === 'reach') {
        reachInput = ev;
        s.reachRate = isFiniteNumber(ev.elbowRate) ? ev.elbowRate : 0;
      }
    }
    let cursor = 0;
    for (const { ev, at } of timed) {
      if (at > cursor) { integrate(s, at - cursor); cursor = at; }
      applyEvent(s, ev, at, collect);
    }
    integrate(s, dt - cursor);

    // Display-only reach linkage: never added to the commanded drive or the elbow target. Ignored while paused.
    const live = reachInput && !s.paused ? reachInput : null;
    const intent = live ? reachIntent(live) : null;
    const rate = intent || s.paused ? 0 : s.reachRate; // key intent present: the legacy elbow-rate linkage is retired
    const legacyTarget = {
      elbow_flexion: rate > 0 ? Math.min(1, rate / REACH_FULL_RATE_DEG_S) : 0,
      elbow_extension: rate < 0 ? Math.min(1, -rate / REACH_FULL_RATE_DEG_S) : 0
    };
    for (const id of REACH_IDS) s.reachDisplay[id] = approach(s.reachDisplay[id], legacyTarget[id], dt, riseTau, decayTau);
    s.wasd = stepReachDisplay(s.wasd, intent ? live : {}, dt, reachOpts);
    s.wasdJoint = stepReachJoints(s.wasdJoint, intent ? live : {}, dt, reachOpts, jointOpts);
    return finalize(s);
  }

  /** Advance the model by dt wall seconds with the given events. Returns the new state. */
  function step(state, events, dt) {
    return run(state, events, dt, null);
  }

  /**
   * Drop-in replacement for ns-app stepActivityGated(activity, actState, events, dt): the Space/pulse gate rules are
   * inside the model, so this only steps and reports. Non-finite or negative dt counts as 0 (as in ns-app).
   * @returns {{ state, marks: Array<{ actionId, regionId, bodyActionId, rotation, source: 'gaze' | 'click', at }>,
   *   restarts: number }}
   *   marks: every new-area or click pulse start that survived the gate, with its offset `at` into the step (actionId
   *   is the arm action, else the region action id); restarts: the number of look-movement ('moved') restarts.
   */
  function stepGated(state, events, dt) {
    const wall = isFiniteNumber(dt) && dt > 0 ? dt : 0;
    const marks = [];
    let restarts = 0;
    const s = run(state, events, wall, m => { if (m.source === 'moved') restarts += 1; else marks.push(m); });
    return { state: s, marks, restarts };
  }

  /** Silently record the gaze under the crosshair (a gaze event's fields: { actionId?, regionId?, kind?, u?, arrow?,
   * yaw?, pitch? }) without starting a pulse. Use on the first frame and on every re-frame/resize (or send a gaze event
   * with seed: true). Running pulses are untouched. Returns the SAME state when nothing changes. */
  function seed(state, gaze = {}) {
    checkState(state);
    if (!isPlainObject(gaze)) fail('activity_event', 'seed needs a { actionId, yaw?, pitch? } object');
    const s = cloneState(state);
    applyEvent(s, { ...gaze, type: 'gaze', seed: true }, 0, null);
    finalize(s);
    return JSON.stringify(s) === JSON.stringify(cloneState(state)) ? state : s;
  }

  /** Positional form used by ns-app seedActivityGaze(activity, state, actionId): seedGaze(state, actionId, { yaw, pitch }?).
   * A value that is not an activity state at all (no gazeAction field) is returned unchanged, as ns-app's own
   * fallback does; an activity state is validated as usual. */
  function seedGaze(state, actionId, dir = {}) {
    if (!isPlainObject(state) || !hasOwn(state, 'gazeAction')) return state;
    if (!isPlainObject(dir)) fail('activity_event', 'seedGaze direction must be a { yaw, pitch } object');
    const g = { actionId: actionId === undefined ? null : actionId };
    if (dir.yaw !== undefined || dir.pitch !== undefined) { g.yaw = dir.yaw; g.pitch = dir.pitch; }
    return seed(state, g);
  }

  /** Apply one state-only change (validated, copied, finalized). */
  function change(state, fn) {
    checkState(state);
    const s = cloneState(state);
    fn(s);
    return finalize(s);
  }

  /** Reset body (see createActivity). Returns a new state. */
  function resetBody(state) {
    return change(state, resetBodyInPlace);
  }

  /** One orbit arrow step with this model's limits; the same state when already at that limit. opts.stepDeg (> 0): a
   * smaller step for a held arrow (round-2 fix F4: click = one stepDeg step, click-and-hold = gentle repeated steps).
   * R5-input: opts.target, when given, must be 'brain' (ns-controls stepArrowInput requests carry a target; 'mirror'
   * ones go to ns-mirror, see ORBIT_TARGETS). */
  function orbitStepModel(state, dir, opts = null) {
    if (!ORBIT_DIRS.includes(dir)) fail('orbit_dir', `orbit direction must be one of ${ORBIT_DIRS.join(', ')}, got ${JSON.stringify(dir)}`);
    const stepDeg = opts && opts.stepDeg !== undefined && opts.stepDeg !== null ? opts.stepDeg : null;
    if (stepDeg !== null && !(isFiniteNumber(stepDeg) && stepDeg > 0)) fail('orbit_option', 'stepDeg must be a finite number of degrees > 0');
    const target = opts && opts.target !== undefined && opts.target !== null ? opts.target : 'brain';
    if (!ORBIT_TARGETS.includes(target)) fail('orbit_option', `target ${JSON.stringify(target)} is not the activity's (only ${ORBIT_TARGETS.join(', ')}; the mirror body's orbit is ns-mirror's)`);
    checkState(state);
    const next = stepOrbit(state.orbit, dir, stepDeg !== null ? { ...orbitOpts, stepDeg } : orbitOpts);
    if (next.yaw === state.orbit.yaw && next.pitch === state.orbit.pitch) return state;
    return change(state, s => doOrbit(s, dir, stepDeg));
  }

  // ---- outputs ------------------------------------------------------------------------------------

  /** POSE DRIVE: smoothed commanded simulated drive per arm action (0..1). The only drive that may feed composePose. */
  function drives(state) {
    checkState(state);
    return pick(state.drive, ACTION_IDS);
  }

  /** DISPLAY ACTIVITY: crisp simulated envelope per arm action (0..1) for the cortex colour; 0 from a timed command's
   * deadline on (a 1 s pulse shows nothing from 1.0 s after its trigger). Excludes the reach linkage. */
  function displayActivity(state) {
    checkState(state);
    return pick(state.display, ACTION_IDS);
  }

  function withReach(state, wasdPart) {
    const out = pick(state.display, ACTION_IDS);
    for (const id of REACH_IDS) out[id] = Math.max(out[id], state.reachDisplay[id], wasdPart[id]);
    return out;
  }

  /** Display activity plus the display-only reach linkage (W/S on the elbow fields, A/D share on the most proximal
   * fields) for the BRAIN STRIP. Never feed it to composePose. */
  function displayDrives(state) {
    checkState(state);
    return withReach(state, reachDisplayOutputs(state.wasd, reachOpts).strip);
  }

  /** Display activity plus the W/S reach linkage only (no A/D share) for muscleDrives. */
  function muscleDisplayDrives(state) {
    checkState(state);
    return withReach(state, reachDisplayOutputs(state.wasd, reachOpts).muscle);
  }

  /** reachDisplayOutputs of the state's key-intent reach levels (strip, muscle, armReach, label, ...). */
  function reachOutputs(state) {
    checkState(state);
    return reachDisplayOutputs(state.wasd, reachOpts);
  }

  /** regionId -> 0..1 display (the same ramp as the muscles: feed it to ns-colors activityColor). */
  function regionActivity(state) {
    checkState(state);
    return pick(state.regionActivity, REGION_IDS);
  }

  /** regionId -> activation count (only activated regions; persistent until Reset body). */
  function activatedRegions(state) {
    checkState(state);
    return { ...state.activatedRegions };
  }

  /** jointId -> ABSOLUTE degrees for ns-body poseBody (every binding joint id): where each joint is now. With the
   * R558 latch these are the joint positions themselves (start posture angles until something is activated), not a
   * change from the start posture. */
  function bodyJointTargets(state) {
    checkState(state);
    return pick(state.bodyJointTargets, JOINT_IDS);
  }

  /**
   * 20 November 2026 (the owner, Message 206: "no permanent movements"): what is moving because of the brain right now,
   * plain data for the display and for checks. (It replaces latchView: nothing is held, so there is nothing to bring
   * back, no "already there" and no opposing hint.)
   *   contracting  [jointId]    body joints being driven to a movement's end (their contraction's time runs, or,
   *                             since 21 November 2026, the hold at the end after it: JOINT_LATCH holdS, unlit)
   *   returning    [jointId]    body joints on their way back to their place (no activity is shown for these)
   *   arm          { contracting: [actionId], returning: [actionId] }   the same for the game arm's movements
   *   lit          the area whose contraction is lit now (regionId), or null
   *   label        the honest scope line
   */
  function motionView(state) {
    checkState(state);
    const contracting = [], returning = [], arm = { contracting: [], returning: [] };
    const bj = state.bodyJerk || {}, aj = state.armJerk || {};
    for (const j of JOINT_IDS) if (bj[j]) (bj[j][1] > 0 ? contracting : returning).push(j);
    for (const id of ACTION_IDS) if (aj[id]) (aj[id][0] > 0 ? arm.contracting : arm.returning).push(id);
    return {
      contracting, returning, arm,
      lit: state.pulseMove === true && state.pulseRemaining > 0 ? state.pulseRegion : null,
      label: 'a movement switched on from the brain contracts, then returns to where it was (a rule of this simulation; not a recording)'
    };
  }

  /** Active body actions (display or pose drive above 0), in map order:
   * [{ key, regionId, actionId, label, level (display 0..1), drive (pose 0..1), agonists, antagonists }]. */
  function activeBodyActions(state) {
    checkState(state);
    const out = [];
    for (const k of BODY_KEYS) {
      const level = state.bodyDisplay[k], drive = state.bodyDrive[k];
      if (!(level > 0 || drive > 0)) continue;
      const a = binding.bodyActions.get(k);
      out.push({ key: k, regionId: a.regionId, actionId: a.actionId, label: a.label, level, drive, agonists: [...a.agonists], antagonists: [...a.antagonists] });
    }
    return out;
  }

  /** muscle name -> 0..1 display for body-action AGONISTS (max over active actions; antagonists are not elevated). */
  function bodyMuscleDisplay(state) {
    const out = {};
    for (const a of activeBodyActions(state)) for (const m of a.agonists) out[m] = Math.max(out[m] || 0, a.level);
    return out;
  }

  /**
   * R5-input (R21, D17): the glow-link data. For every brain area lit right now (regionActivity > minLevel), which
   * muscle groups it drives right now and how strongly, read from the SAME values that colour the muscles (no new
   * science; the body map and the movement map as they are):
   *   - a body (not left-arm) area: each of its actions with a display level (bodyDisplay, the value bodyMuscleDisplay
   *     gives its agonists) -> that action's agonists;
   *   - a left-arm area: each of its arm actions with a muscle level: a movement-map action's muscleDisplayDrives value
   *     (look / click pulse, the Space fist / open / relax, and the W/S reach share; A/D never tints muscles) -> the
   *     body-map agonists of that action, plus the movement-map catalog keys that muscleDrives raises
   *     (primary_drive_increase; with opts.movement = bindMovementMap(...)); a forearm turn -> its rotationOutputs
   *     muscles (ROTATION_MUSCLES agonists, matched by mesh name).
   * One link = one muscle group = one area action. Returns { label, links, areas }:
   *   links [{ key: '<regionId>><actionId>', regionId, hemisphere, isLeftArm, bodySide, actionId, actionLabel,
   *            source: 'look' | 'click' | 'keys' | 'space' | 'turn', areaLevel (regionActivity), groupLevel (the
   *            muscles' activity), level = min(areaLevel, groupLevel) (the glow strength), muscles (plain mesh names
   *            from the body map), catalog (movement-map keys or []), meshNames (forearm-turn name fragments or []) }]
   *          in map order; every level 0..1 on the shared activity ramp (ns-colors activityColor), fading exactly as
   *          the 1 s activation does (the display envelopes).
   *   areas  [{ regionId, level, links (count), why: null | 'no-muscles' (the map lists no muscles for it: the
   *            shoulder area, the in-between areas) | 'not-now' (its muscles are not driven now, e.g. the wrist area lit
   *            by the W/A/S/D reach display) }] for every lit area.
   * The mirror body shows the same activity, so the same links apply to it (the same muscle names on the mirrored
   * copy). A picture of which area drives which muscles in this simulation, NOT a nerve path (label).
   * opts: { movement (bindMovementMap result) = null, minLevel = GLOW_LINKS.minLevel }.
   */
  function glowLinks(state, { movement = null, minLevel = GLOW_LINKS.minLevel } = {}) {
    checkState(state);
    if (!(isFiniteNumber(minLevel) && minLevel >= 0 && minLevel < 1)) fail('glow_option', 'minLevel must be a number in [0, 1)');
    if (movement !== null && !(movement && movement.actions instanceof Map)) fail('glow_option', 'movement must come from bindMovementMap');
    const muscleLevels = withReach(state, reachDisplayOutputs(state.wasd, reachOpts).muscle);
    const wasdMuscle = reachDisplayOutputs(state.wasd, reachOpts).muscle;
    const pulseSource = rid => (state.pulseRegion === rid && state.lastTriggerSource === 'click' ? 'click' : 'look');
    const links = [], areas = [];
    for (const rid of REGION_IDS) {
      const areaLevel = state.regionActivity[rid];
      if (!(areaLevel > minLevel)) continue;
      const r = binding.regions.get(rid);
      let count = 0, mapped = false;
      for (const a of r.actions) {
        let groupLevel = 0, source = 'look', catalog = [], meshNames = [];
        if (!r.isLeftArm) {
          const key = bodyActionKey(rid, a.id);
          groupLevel = state.bodyDisplay[key];
          source = pulseSource(rid);
        } else if (a.armActionId !== null && ROTATION_ACTION_IDS.includes(a.armActionId)) {
          const c = a.armActionId;
          groupLevel = state.rotationDisplay[c];
          source = state.rotationKeyDisplay[c] > 0 && state.rotationKeyDisplay[c] >= state.regionDisplay[rid] ? 'turn' : pulseSource(rid);
          meshNames = [...ROTATION_MUSCLES[c].agonists];
        } else if (a.armActionId !== null) {
          const x = a.armActionId;
          groupLevel = muscleLevels[x];
          const keyPart = REACH_IDS.includes(x) ? Math.max(wasdMuscle[x], state.reachDisplay[x]) : 0;
          source = keyPart > 0 && keyPart >= state.display[x] ? 'keys'
            : KEY_DISPLAY_IDS.includes(x) && state.keyDisplay[x] > 0 && state.keyDisplay[x] >= state.regionDisplay[rid] ? 'space' : pulseSource(rid);
          if (movement && movement.actions.has(x)) catalog = [...movement.actions.get(x).roles.primary_drive_increase];
        }
        const muscles = [...a.agonists];
        if (muscles.length || catalog.length || meshNames.length) mapped = true;
        if (!(groupLevel > minLevel) || !(muscles.length || catalog.length || meshNames.length)) continue;
        count += 1;
        links.push({
          key: `${rid}>${a.id}`, regionId: rid, hemisphere: r.hemisphere, isLeftArm: r.isLeftArm, bodySide: r.bodySide,
          actionId: a.id, actionLabel: a.label, source, areaLevel, groupLevel, level: Math.min(areaLevel, groupLevel),
          muscles, catalog, meshNames
        });
        // R5-pronation (R27): a forearm turn also turns the upper arm at the shoulder, so the same area links to the
        // shoulder rotators of that direction (ROTATION_MUSCLES.shoulder, at ROTATION_SHOULDER_LEVEL), as a second link.
        if (r.isLeftArm && a.armActionId !== null && ROTATION_ACTION_IDS.includes(a.armActionId)) {
          const sl = groupLevel * ROTATION_SHOULDER_LEVEL;
          if (sl > minLevel) {
            links.push({
              key: `${rid}>${a.id}>shoulder`, regionId: rid, hemisphere: r.hemisphere, isLeftArm: r.isLeftArm, bodySide: r.bodySide,
              actionId: a.id, actionLabel: a.label, source, areaLevel, groupLevel: sl, level: Math.min(areaLevel, sl),
              muscles: [], catalog: [], meshNames: [...ROTATION_MUSCLES[a.armActionId].shoulder]
            });
          }
        }
      }
      areas.push({ regionId: rid, level: areaLevel, links: count, why: count > 0 ? null : mapped ? 'not-now' : 'no-muscles' });
    }
    return { label: GLOW_LINK_LABEL, links, areas };
  }

  /** Forearm rotation: { state, value (pose 0 pronated..1 supinated), target, pronationDeg (suggested rig angle),
   * moving, channel (running double-tap command), display/keyDisplay { pronation, supination }, muscles (name
   * fragment -> 0..1 agonist display; R5-pronation: plus the shoulder rotators at ROTATION_SHOULDER_LEVEL, see
   * ROTATION_MUSCLES.shoulder; pass it to the scene's updateMuscles AND to ns-body rotationBodyDrives), catalog { BIC }
   * (supination share of biceps, to max-merge into muscleDrives), seq, label }. */
  function rotationOutputs(state) {
    checkState(state);
    const d = pick(state.rotationDisplay, ROTATION_ACTION_IDS);
    const target = state.pulseRotation !== null && state.pulseRemaining > 0 && state.pulseMove === true
      ? (state.pulseRotation === 'supination' ? 1 : 0) : rotValue(state.rotationState);
    const muscles = {};
    for (const c of ROTATION_ACTION_IDS) for (const m of ROTATION_MUSCLES[c].agonists) muscles[m] = Math.max(muscles[m] || 0, d[c]);
    // R5-pronation (R27): the shoulder rotators that turn the upper arm with the forearm, at ROTATION_SHOULDER_LEVEL.
    const shoulder = {};
    for (const c of ROTATION_ACTION_IDS) for (const m of ROTATION_MUSCLES[c].shoulder) shoulder[m] = Math.max(shoulder[m] || 0, d[c] * ROTATION_SHOULDER_LEVEL);
    for (const [m, v] of Object.entries(shoulder)) muscles[m] = Math.max(muscles[m] || 0, v);
    // R558 (Space dance): while the game arm turns in the dance, its forearm turners and shoulder rotators of the
    // current direction light in proportion to each joint's turning speed (opening = supination with the outward
    // rotators, closing = pronation with the inward ones).
    const dance = state.dance && state.dance.levels ? state.dance : null;
    let catalogBic = d.supination;
    if (dance) {
      const c = dance.limbs.leftArm.dir > 0 ? 'supination' : 'pronation';
      const fl = dance.levels.l_forearm, sl = dance.levels.l_shoulder_rot;
      if (fl > 0) for (const m of ROTATION_MUSCLES[c].agonists) muscles[m] = Math.max(muscles[m] || 0, fl);
      if (sl > 0) for (const m of ROTATION_MUSCLES[c].shoulder) muscles[m] = Math.max(muscles[m] || 0, sl);
      if (c === 'supination') catalogBic = Math.max(catalogBic, fl);
    }
    return {
      state: state.rotationState,
      value: state.rotation.value,
      target,
      pronationDeg: forearmPronationDeg(state.rotation.value),
      moving: Math.abs(state.rotation.value - target) > 1e-3,
      channel: state.rotation.channel,
      display: d,
      keyDisplay: pick(state.rotationKeyDisplay, ROTATION_ACTION_IDS),
      muscles,
      catalog: { BIC: catalogBic },
      seq: state.rotationSeq,
      label: 'simulated forearm rotation command (display-only, unitless; Space is a virtual input)'
    };
  }

  /** Brain view parameters in ns-brain brainViewTransform's units, so `brainViewTransform({ frame,
   * ...activity.brainView(state) })` works: orbitYaw/orbitPitch in DEGREES, grabYaw/grabPitch in RADIANS (camera
   * convention), plus grabbing and canOrbit (per arrow: false at its limit, e.g. to dim it). */
  function brainView(state) {
    checkState(state);
    return {
      orbitYaw: state.orbit.yaw, orbitPitch: state.orbit.pitch,
      grabYaw: state.brainPlacement.yaw, grabPitch: state.brainPlacement.pitch,
      grabbing: state.brainGrab.active,
      canOrbit: Object.fromEntries(ORBIT_DIRS.map(d => [d, orbitCanStep(state.orbit, d, orbitOpts)]))
    };
  }

  /** WASD coordinated joint channels { shoulder, elbow, wrist, hand, label } (display-only). */
  function wasdChannels(state) {
    checkState(state);
    return { ...pick(state.wasdJoint, WASD_CHANNELS), label: WASD_JOINT_LABEL };
  }

  /** { visible, reason, paused, remainingS (seconds left of the intro, else null) } for the overlay. */
  function instructionsView(state) {
    checkState(state);
    const I = state.instructions;
    return {
      visible: I.visible, reason: I.reason, paused: state.paused,
      remainingS: I.visible && I.autoHideAt !== null ? Math.max(0, I.autoHideAt - state.t) : null
    };
  }

  /**
   * R558 (Space dance; Message 40): what the limb turn is doing, plain data. { active, mode (null | 'step' | 'hold'),
   * fast (true while a double tap's quick step runs; kept for older readers), angles: { jointId: degrees } (ns-dance
   * DANCE_LIMBS conventions), levels: { jointId: 0..1 } (turning speed, the display level of its areas and muscles),
   * limbs: { limb: { dir: 1 opening | -1 closing, level } }, ranges (the touch-free hip ranges in use),
   * bodyMuscleRows: rows for ns-body bodyMuscleDrives (the right arm's and the hips' turning muscles of the current
   * direction at their joint's level; the game arm's are in rotationOutputs().muscles), armHumeralDeg (null = the
   * coupled palm turn) }.
   */
  function danceView(state) {
    checkState(state);
    const d = state.dance && isDanceState(state.dance) ? state.dance : danceStart();
    const limbs = {};
    for (const l of DANCE_LIMB_IDS) limbs[l] = { dir: d.limbs[l].dir, level: d.limbs[l].level };
    const limbOf = j => DANCE_LIMB_IDS.find(l => DANCE_LIMBS[l].some(x => x.id === j));
    const bodyMuscleRows = [];
    for (const j of DANCE_BODY_JOINTS) {
      const lv = d.levels[j];
      if (!(lv > 0) || !hasOwn(DANCE_MUSCLES, j)) continue;
      const dir = d.limbs[limbOf(j)].dir > 0 ? 'open' : 'closed';
      bodyMuscleRows.push({ actionId: null, level: lv, agonists: [...DANCE_MUSCLES[j][dir]], antagonists: [], stabilizers: [], dance: j });
    }
    const angles = {};
    const T = PRONATION_DEG_AT_VALUE(state.rotation.value), explicit = isFiniteNumber(state.armHumeral);
    const seen = !explicit && state.armTurnSeen ? state.armTurnSeen : null;
    angles.l_forearm = explicit ? T : seen ? seen.forearmDeg : T;
    angles.l_shoulder_rot = explicit ? state.armHumeral : seen ? seen.humeralDeg : 0;
    for (const j of DANCE_BODY_JOINTS) angles[j] = state.bodyPos ? state.bodyPos[j] : REST[j];
    // Colour links (ns-app -> the scene's glow links, without a line): each turning joint's area and its turning muscles
    // of the current direction, at the joint's level, so the area, your muscles and the mirror body's share one colour.
    const links = [];
    for (const j of DANCE_JOINT_IDS) {
      const lv = d.levels[j], rid = DANCE_AREAS[j] ? DANCE_AREAS[j].find(r => binding.regions.has(r)) : null;
      if (!(lv > 0) || !rid) continue;
      const open = d.limbs[limbOf(j)].dir > 0;
      let muscles;
      if (j === 'l_forearm') muscles = [...ROTATION_MUSCLES[open ? 'supination' : 'pronation'].agonists];
      else if (j === 'l_shoulder_rot') muscles = [...ROTATION_MUSCLES[open ? 'supination' : 'pronation'].shoulder];
      else muscles = hasOwn(DANCE_MUSCLES, j) ? [...DANCE_MUSCLES[j][open ? 'open' : 'closed']] : [];
      links.push({ key: `dance:${j}`, regionId: rid, isLeftArm: j.startsWith('l_'), actionId: null, level: lv, muscles,
        catalog: j === 'l_forearm' && open ? ['BIC'] : [], meshNames: [] });
    }
    return {
      active: d.mode !== null && !state.paused, mode: d.mode, fast: d.mode === 'step', angles, levels: { ...d.levels }, limbs,
      ranges: state.danceRange ? copyJson(state.danceRange) : {}, bodyMuscleRows, links, armHumeralDeg: explicit ? state.armHumeral : null,
      label: 'simulated limb turning (display-only, unitless; Space is a virtual input, not a recording)'
    };
  }

  /** Deep, JSON-safe copy of the state plus the derived outputs, for the QA snapshot(). */
  function snapshot(state) {
    checkState(state);
    return copyJson({
      ...state,
      rotationOutputs: rotationOutputs(state),
      brainView: brainView(state),
      wasdChannels: wasdChannels(state),
      instructionsView: instructionsView(state),
      activeBodyActions: activeBodyActions(state),
      glowLinks: glowLinks(state),
      motionView: motionView(state),
      danceView: danceView(state)
    });
  }

  return Object.freeze({
    options, binding, state: initialState(), step, stepGated, seed, seedGaze,
    drives, poseDrives: drives, displayActivity, displayDrives, muscleDisplayDrives, reachOutputs,
    resetBody, orbitStep: orbitStepModel, regionActivity, activatedRegions, bodyJointTargets, activeBodyActions,
    bodyMuscleDisplay, rotationOutputs, brainView, wasdChannels, instructionsView, snapshot,
    // R5-input
    glowLinks,
    // Message 206: contract, then return
    motionView,
    // R558 Space dance
    danceView
  });
}
