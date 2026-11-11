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
 * bodyJointTargets, persistent activatedRegions with Reset body, the Space dance of all four limbs (R558: hold = slow,
 * double-tap and hold = fast, see ns-dance.mjs; Space no longer makes a fist, flips the forearm or grabs), the brain
 * grab state, the orbit view state, the instructions/pause overlay state and the WASD coordinated joint channels.
 * The left upper limb is represented predominantly in the contralateral (right) hemisphere; region extents are the
 * map owner's representative, overlapping schematic, not a unique cortical point per muscle.
 *
 * Pure (browser and Node; no DOM). Errors: Error('ns:<code>: message').
 */
import { DEG, clamp } from './ns-math.mjs';
import { FIST_POSE_DEG, REST_HAND_POSE_DEG, PRONATION_STATES } from './ns-rig.mjs';
import { DOUBLE_TAP_MS } from './ns-controls.mjs';
import { createDance, observeDance, stepDance, stopDance, isDanceState, DANCE_LIMBS, DANCE_LIMB_IDS, DANCE_JOINT_IDS } from './ns-dance.mjs';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// R558 (Space dance): the game arm's palm turn in degrees (ns-rig: +80 palm down .. -80 palm up) for a rotation value
// (0 pronated .. 1 supinated), and back.
const PRONATION_END_DEG = PRONATION_STATES.pronated;
const PRONATION_DEG_AT_VALUE = v => PRONATION_STATES.pronated + (PRONATION_STATES.supinated - PRONATION_STATES.pronated) * v;
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
  'wrist_radial_deviation', 'wrist_ulnar_deviation'
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
  wrist_radial_deviation: { label: 'Bend wrist toward the thumb (radial deviation; display only on the game arm)', roles: roles(['FCR', 'ECRL', 'ECRB'], ['FCU', 'ECU']) },
  wrist_ulnar_deviation: { label: 'Bend wrist toward the little finger (ulnar deviation; display only on the game arm)', roles: roles(['FCU', 'ECU'], ['FCR', 'ECRL', 'ECRB']) }
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
  thumb_cmc_opp: range(0, 40),
  thumb_mcp_flex: range(-10, 55),
  thumb_ip_flex: range(-5, 70)
};
for (const d of DIGITS) {
  // Repair R2: MCP to 90 and PIP to 105 so the reference-grounded full fist (ns-rig FIST_POSE_DEG) is reachable.
  limits[`${d}_mcp_flex`] = range(-10, 90);
  limits[`${d}_pip_flex`] = range(0, 105);
  limits[`${d}_dip_flex`] = range(0, 75);
  // Digit 3 (middle) is the abduction reference and is always 0.
  limits[`${d}_mcp_abd`] = d === 'middle' ? range(0, 0) : range(-5, 20);
}

/**
 * Pose joint range limits (degrees). Semantic signs: positive = anatomical flexion, positive
 * abduction = away from digit 3, positive opposition = thumb toward the palm.
 * Each value is a frozen [lo, hi] array (also readable as `.min` / `.max`).
 */
export const JOINT_LIMITS = Object.freeze(limits);

/** The 20 pose joint names, in a fixed order. */
export const JOINT_NAMES = Object.freeze(Object.keys(JOINT_LIMITS));

// R3-arm: the relaxed-hand "cascade" (ns-rig REST_HAND_POSE_DEG: each finger a little more bent than the one beside
// it, index to little; thumb slightly turned toward the index; wrist 0). Round 2 used 15/20/10 on every finger, almost
// the mesh's own straight rest on this rig.
const rest = { wrist_flex: 0 };
for (const j of ['thumb_cmc_opp', 'thumb_mcp_flex', 'thumb_ip_flex']) rest[j] = REST_HAND_POSE_DEG[j];
for (const d of DIGITS) {
  rest[`${d}_mcp_flex`] = REST_HAND_POSE_DEG[`${d}_mcp_flex`];
  rest[`${d}_pip_flex`] = REST_HAND_POSE_DEG[`${d}_pip_flex`];
  rest[`${d}_dip_flex`] = REST_HAND_POSE_DEG[`${d}_dip_flex`];
  rest[`${d}_mcp_abd`] = 0;
}
// Non-enumerable self alias so both `REST_POSE.wrist_flex` and `REST_POSE.joints.wrist_flex` work;
// Object.keys / JSON / spreading see only the 20 joint angles.
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

function actionTarget(joints, { elbowFlexDeg = 0, releaseOf = [], synergy = [] } = {}) {
  return deepFreeze({ joints: { ...joints }, elbowFlexDeg, releaseOf: [...releaseOf], synergy: [...synergy] });
}

/** Signed elbow-angle change (degrees, + = flexion) commanded by a full elbow_flexion / elbow_extension drive,
 * relative to the elbow angle of the current W/S/A/D reach solution. ns-app turns it into an explicit elbow target
 * (the hand stays on its screen ray, so the depth follows); clamps and reach limits are reported, never hidden. */
export const ELBOW_ACTION_DEG = 30;

// relax_release targets the declared passive rest on the HAND joints only. The movement map says the
// wrist/elbow must "maintain supported pose without new forced motion", so the wrist is not driven
// by release. The middle-finger abduction reference is never driven by any action.
const RELAX_JOINTS = JOINT_NAMES.filter(j => j !== 'wrist_flex' && j !== 'middle_mcp_abd');

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
  index_flexion: actionTarget(digitFlex(['index'], 90, 105, 75)),
  index_extension: actionTarget(digitFlex(['index'], -10, 0, 0)),
  thumb_mcp_flexion: actionTarget({ thumb_mcp_flex: 50 }),
  thumb_mcp_extension: actionTarget({ thumb_mcp_flex: -10 }),
  // R558 (Messages 14 / 15): the game-defined left-hand actions (EXTRA_ARM_ACTIONS), at the same joint limits.
  fingers_together: actionTarget({ index_mcp_abd: 0, ring_mcp_abd: 0, little_mcp_abd: 0 }),
  middle_flexion: actionTarget(digitFlex(['middle'], 90, 105, 75)),
  middle_extension: actionTarget(digitFlex(['middle'], -10, 0, 0)),
  ring_flexion: actionTarget(digitFlex(['ring'], 90, 105, 75)),
  ring_extension: actionTarget(digitFlex(['ring'], -10, 0, 0)),
  little_flexion: actionTarget(digitFlex(['little'], 90, 105, 75)),
  little_extension: actionTarget(digitFlex(['little'], -10, 0, 0)),
  thumb_opposition: actionTarget({ thumb_cmc_opp: 40 }),
  thumb_reposition: actionTarget({ thumb_cmc_opp: 0 }),
  // The game arm's hand fit has one wrist axis (flexion / extension): the sideways bends colour their muscles only.
  wrist_radial_deviation: actionTarget({}),
  wrist_ulnar_deviation: actionTarget({})
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

  let elbowDeltaDeg = 0;
  for (const id of ids) {
    const delta = targets[id].elbowFlexDeg;
    if (delta) elbowDeltaDeg += d[id] * delta;
  }
  return { joints, elbowDeltaDeg: elbowDeltaDeg + 0 };
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

/** Actions that compete with the Space fist for digit/thumb joints (suppressed while Space is held). */
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
 * default look sensitivity (0.0025 rad/px = 0.143 deg/px) one pointer pixel stays inside it and two pixels leave it,
 * so sub-pixel/1-px jitter, resizes and re-framing never re-trigger, while any deliberate look movement does
 * (the user: activation stops "unless we move again"). A UI choice, not a physiological threshold.
 */
export const GAZE_RESTART_DEADBAND_DEG = 0.2;
/** R3-fix (review M3 / M5, display choices, seconds of continuous gaze on one area):
 *  replaceClickS  a CLICK-started pulse is not replaced by areas the crosshair only passes over while the player turns
 *                 to watch the body; a new area must hold the gaze this long first (a new click always replaces).
 *  markS          the persistent "switched on" mark (R11c) is added at once for a click (the user: "when you press a
 *                 part ... it slightly changes shade"), but for a look only after the gaze has stayed on the area this
 *                 long, so ordinary looking around does not mark every area gold. The 1 s look activation itself is
 *                 unchanged (it still starts the moment the crosshair reaches a new area).
 *  latchS         R558 (latch): a LOOK moves body parts (and holds them there) only once the gaze has stayed on the
 *                 area this long; the area's glow still starts at once. With the strip filling the view the crosshair
 *                 crosses many areas while the player looks around, and each would otherwise move and hold its joints.
 *                 A click moves at once. */
export const GAZE_DWELL = Object.freeze({ replaceClickS: 0.3, markS: 0.5, latchS: 0.3 });

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
export const REACH_DISPLAY = Object.freeze({
  holdLevel: 0.55, fullDepthRate: 0.35, fullXRate: 0.9, proximalShare: 0.6, horizontalFieldShare: 0.35,
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
 * R558 latch (the user's note of 11 Nov 2026: a limb does not come back by itself after a muscle or brain activation;
 * it has to be activated back by the opposing action, or everything reset; the opposing brain area and muscle are
 * faintly lit as the way back).
 *   omega, zeta        the jerk of a body joint to its latched angle: an under-damped spring (natural frequency in
 *                      rad/s, damping ratio) solved exactly per step, so the joint snaps there with one small recoil.
 *   restitution        R558 (user, Message 1: "when we look to any motor area of the brain, we are looking for a
 *                      violent jerking movement, not a graceful shift"): almost every latched goal IS the end of the
 *                      joint's range, where the overshoot of the spring cannot be shown without passing the range. The
 *                      joint therefore hits its end stop at full speed and rebounds off it with this share of its
 *                      speed (then the spring brings it back: a few quick, shrinking recoils), never past the stop.
 *   reducedMotion      the same for prefers-reduced-motion: slower, without recoil or rebound.
 *   snapDeg, snapDegS  within these of the goal (degrees, degrees/s) the joint is exactly at its goal.
 *   restEpsDeg         an angle within this of the start angle counts as "at the start position".
 *   armPoseTau         seconds: the game arm's jerk into and out of a latched action (reducedArmPoseTau likewise).
 *   hintLevel          the faint display level (0..1) of an opposing "this brings it back" area and muscle.
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
  omega: 50, zeta: 0.35, restitution: 0.4, reducedMotion: Object.freeze({ omega: 12, zeta: 1, restitution: 0 }),
  snapDeg: 0.02, snapDegS: 0.5, restEpsDeg: 0.5,
  armPoseTau: 0.022, reducedArmPoseTau: 0.12, hintLevel: 0.22
});

/** R558 (issue hunt 2: "Raise right arm up" held together with "Swing right arm out to the side" left the arm out to the
 * side and down and back, matching neither label: ns-body turns abduction before flexion, so abduction 135 then flexion
 * 160 is not "up"). Rule: a held movement of the right shoulder in one plane (flexion / extension, or out to the side /
 * back in) brings the other plane's joint back to its start angle, so the LATER action wins the arm's direction and its
 * label stays true: raise up -> straight up beside the head; then out to the side -> straight out to the side at
 * shoulder height (flexion back to the start's 90, forward); then raise up again -> up (out to the side back to 0).
 * Bringing a joint back with its own opposite action does not touch the other plane. A rule of this game, chosen so
 * every held label stays true; not a measured coupling of the shoulder joints. */
export const JOINT_CONFLICTS = Object.freeze({
  r_shoulder_flex: Object.freeze(['r_shoulder_abd']),
  r_shoulder_abd: Object.freeze(['r_shoulder_flex'])
});

/** The opposing (antagonist) game-arm action of each latching arm action: activating it while the other is latched
 * brings the joint back. relax_release lets go of every latched hand action and never latches itself. */
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
  thumb_opposition: 'thumb_reposition', thumb_reposition: 'thumb_opposition'
  // wrist_radial_deviation / wrist_ulnar_deviation move nothing on the game arm, so there is nothing to hold: they pulse.
});
/** R558: game-arm actions that move nothing (the game arm has no sideways wrist joint): they pulse and never latch. */
const DISPLAY_ONLY_ARM_IDS = Object.freeze(['wrist_radial_deviation', 'wrist_ulnar_deviation']);
const HAND_LATCH_IDS = Object.freeze(['grasp_close', 'open_hand', 'spread_fingers', 'index_flexion', 'index_extension', 'thumb_mcp_flexion', 'thumb_mcp_extension',
  'fingers_together', 'middle_flexion', 'middle_extension', 'ring_flexion', 'ring_extension', 'little_flexion', 'little_extension',
  'thumb_opposition', 'thumb_reposition']);

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
  'r_shoulder_rot', 'hip_rot_L', 'hip_rot_R'
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
  hip_rot_L: Object.freeze(['rh_hip']), hip_rot_R: Object.freeze(['lh_hip'])
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
    closed: ['right gluteus medius', 'right gluteus minimus', 'right tensor fasciae latae', 'right piriformis'] }
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
export const BRAIN_GRAB = Object.freeze({ pitchLimitDeg: 75 });
/** Double-tap window in seconds (press to press), from ns-controls DOUBLE_TAP_MS. */
export const DOUBLE_TAP_SECONDS = DOUBLE_TAP_MS / 1000;
/**
 * Forearm rotation defaults. defaultState 'pronated' (palm and hand dorsum oriented for the first-person view; the
 * BodyParts3D rest pose is the anatomical, supinated position). A double-tap commands the other posture: the display
 * envelope of the commanded channel lasts commandSeconds (UI timing), the pose value eases with poseTau.
 * R3-arm: poseTau is the time constant (1/omega) of a CRITICALLY DAMPED ease (stepRotationEase) instead of a
 * first-order lag. The first-order lag (round 2, tau 0.1 s) started at full speed and covered 55 % of the flip in the
 * first 80 ms (a snap, then a slow settle); the critically damped ease starts from rest and accelerates smoothly, still
 * moves the forearm by about 16 deg within 33 ms (visible within two frames) and reaches 95 % at about 4.74 * poseTau
 * = 0.30 s, the same settle time as before. A double-tap mid-flip reverses without a jump (the speed carries over).
 * pronationRangeDeg is a SUGGESTED rig mapping: value 0 (pronated) = this many degrees of pronation away from the
 * anatomical (supinated) rest, value 1 (supinated) = 0. The rig owner (ns-arm/ns-rig) clamps and may choose its own.
 */
export const ROTATION = Object.freeze({ defaultState: 'pronated', commandSeconds: 0.5, poseTau: 1 / 16, pronationRangeDeg: 150,
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
 *   elbow     W/S (elbow extension/flexion change the hand depth), plus elbowXShare of A/D;
 *   wrist     wristShare of any reach key (the wrist re-orients to keep the hand on its screen ray);
 *   hand      handShare of any reach key (hand posture maintained during transport).
 * Each held channel shows holdLevel + (1 - holdLevel) * motion (REACH_DISPLAY), where motion is the realised base
 * rate, or the realised joint rate (deg/s, saturating at fullJointRateDegS) when the reach event carries jointRates.
 */
export const REACH_JOINT_DISPLAY = Object.freeze({ elbowXShare: 0.35, wristShare: 0.45, handShare: 0.3, fullJointRateDegS: 90 });
export const WASD_JOINT_LABEL =
  'simulated coordinated reach activity (display-only, unitless): shoulder + elbow + wrist + hand shares are a game convention, not a measured synergy';

const KEY_DISPLAY_IDS = Object.freeze(['grasp_close', 'open_hand', 'relax_release']);
const HEMISPHERES = Object.freeze(['right', 'left', 'both']);
const BODY_SIDES = Object.freeze(['left', 'right', 'midline']);
const ARM_ACTION_CHANNEL = Object.freeze({
  elbow_flexion: 'elbow', elbow_extension: 'elbow', wrist_flexion: 'wrist', wrist_extension: 'wrist',
  wrist_radial_deviation: 'wrist', wrist_ulnar_deviation: 'wrist',
  pronation: 'forearm', supination: 'forearm'
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
        antagonists: names(a.antagonists, `region ${id} action ${aid} antagonists`)
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
        agonists: [...a.agonists], antagonists: [...a.antagonists]
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
 *   spaceHeld         -> { type: 'fist', on }               Space pressed / let go (R558: the limb dance starts / stops;
 *                                                            the event keeps its old name)
 *   rotationSeq       -> { type: 'flip', to }                once per double-tap (R558: the fast dance starts); to = rotationState
 *   grabSeq           -> { type: 'grab', on: true }          once per brain grab (by the grasp key's owner; Space no longer grabs)
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
 *   { type: 'gaze', kind?, regionId?, actionId?, u?, arrow?, yaw?, pitch?, moved?, seed? }  sent every frame
 *       kind: GAZE_KINDS ('region' needs regionId; legacy events with only an arm actionId are 'strip');
 *       regionId: a BODY_MOTOR_MAP region; actionId: that region's action id (or its armActionId), else `u` picks the
 *       action by its share of the region extent, else the first action; arrow: the orbit arrow under the crosshair
 *       ('left' | 'right' | 'forward' | 'back'), which then counts as empty space and turns the next click into an orbit.
 *   { type: 'click' }   re-trigger the area under the crosshair, or orbit when an arrow is under it
 *   { type: 'space', down: boolean, safety? }   safety: true = a safety release (never part of a double-tap)
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
 * Space (R558, Message 2: the dance; ns-dance.mjs). Held = the slow dance: all four limbs turn, each between its
 * inward end (pronation + internal rotation) and its outward end (supination + external rotation), each in the
 * direction it last moved, with its own tempo (not coordinated). A press within doubleTapSeconds of the previous press
 * (press to press) and held = the fast dance (rotationSeq counts these). Let go = every limb stays where it is (the
 * latch rule). Space no longer makes a fist, flips the forearm on its own or grabs the brain; the dance owns the four
 * limbs' rotation joints while Space is held. The touch-free hip range of the current leg posture arrives as a
 * { type: 'danceRange', joints } event (ns-app, from ns-body hipRotationClearRange).
 * R558 (lead decision for user Messages 2 and 12): the F key grasps. { type: 'grasp', down, target? }: a press with
 * target 'brain' (or no target key at all while the gaze kind is 'region' or 'glass', new-style gaze with yaw/pitch; an
 * explicit target null holds nothing) starts a brain
 * grab: while held the brain keeps its angular offset to the camera (brainPlacement), gaze pulses are suppressed (the
 * gaze is recorded silently) and release leaves the brain where it is. { type: 'limbPose', joints, regionId?, actionId? }
 * sets held own-limb joints at once (they stay, like a latch) and lights that area.
 *
 * Latch (R558, JOINT_LATCH). A deliberate activation (a look onto a new area, a click, a muscle tap; not the restart
 * of the same area by a small look movement) moves its joints and they STAY there: nothing returns by itself.
 * Stage rule: if the action opposes where one of its joints is latched (its end angle is at the start angle or on the
 * other side of it), it brings that joint back to its start angle and does nothing else this time; otherwise its
 * joints go to their end angles (absolute degrees in the rig's convention, inside bodyJointLimits). A body joint jerks
 * to its goal with the JOINT_LATCH spring. A joint that no action can bring back is momentary: it follows its pulse
 * (none in the shipped map since R558, which gave every face display joint an opposing action). Game-arm actions latch the same way through ARM_OPPOSITES (the arm pose drive
 * follows the latch with armPoseTau; the display stays the one-second pulse); relax_release lets go of every latched
 * hand action; a look or click on a forearm-turn area sets rotationState (and lets go of a dance-held palm turn). latchView(state) lists what is latched and which opposing
 * actions bring it back (the faint hints).
 *
 * Instructions/pause. The intro overlay is visible for introSeconds from the start (not paused). Esc toggles the
 * overlay (show + pause / hide + resume); a pointer-lock loss shows it and pauses; an Esc within escLockDedupeSeconds of
 * a lock-loss overlay is the same gesture; re-acquiring the lock resumes when resumeOnLock. While paused, gaze is
 * recorded silently and clicks, Space presses and reach intent are ignored (Space releases still apply); timers run on.
 *
 * Reset body ({ type: 'reset' } or resetBody(state)) clears activatedRegions, cancels the running pulse, snaps the body
 * drives/displays to 0 and every body joint to its start angle (latches cleared), snaps arm drives/displays to 0 and
 * clears the arm latches, clears the open/relax windows, sets rotationState to defaultRotation (value snapped), the game arm's dance swivel to 0 and ends any grab. It keeps the brain
 * placement and orbit (round-2 fix R1: the brain stays where it was released; ns-app resetBrainView resets the view),
 * the clock, the pulse/suppression counters, Space held, WASD levels and the instructions/pause state.
 *
 * Returns { options, binding, state, step, stepGated, seed, seedGaze, drives, poseDrives, displayActivity,
 * displayDrives, muscleDisplayDrives, reachOutputs, resetBody, orbitStep, regionActivity, activatedRegions,
 * bodyJointTargets, activeBodyActions, bodyMuscleDisplay, rotationOutputs, brainView, wasdChannels, instructionsView,
 * snapshot, latchView }. `state` is plain JSON data; no function mutates its input. `dt` is actual elapsed wall time.
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
  bodyRest = null, jointSpring = JOINT_LATCH, armPoseTau = JOINT_LATCH.armPoseTau
} = {}) {
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

  // ---- R558 latch tables (see JOINT_LATCH and the Latch paragraph above) --------------------------
  if (bodyRest !== null && !isPlainObject(bodyRest)) fail('activity_option', 'bodyRest must be an object of jointId -> degrees (the start posture), or null');
  if (!(isPlainObject(jointSpring) && isFiniteNumber(jointSpring.omega) && jointSpring.omega > 0 && isFiniteNumber(jointSpring.zeta) && jointSpring.zeta > 0
    && (jointSpring.restitution === undefined || (isFiniteNumber(jointSpring.restitution) && jointSpring.restitution >= 0 && jointSpring.restitution < 1)))) {
    fail('activity_option', 'jointSpring must be { omega > 0 (rad/s), zeta > 0, restitution? in [0, 1) }');
  }
  if (!(isFiniteNumber(armPoseTau) && armPoseTau > 0)) fail('activity_option', 'armPoseTau must be a positive number of seconds');
  const springOmega = jointSpring.omega, springZeta = jointSpring.zeta, springBounce = jointSpring.restitution === undefined ? 0 : jointSpring.restitution;
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
  /** Side of its start angle an angle of joint j lies on: -1, 0 (at the start angle) or +1. */
  const sideOf = (j, deg) => (Math.abs(deg - REST[j]) <= JOINT_LATCH.restEpsDeg ? 0 : deg > REST[j] ? 1 : -1);
  // A joint LATCHES when every action that takes it away from the start angle has an opposing action (one ending at
  // the start angle or on its other side), so the player can always bring it back. A joint without one stays
  // MOMENTARY: it follows its pulse and comes back by itself (since R558 every map joint has an opposing action, the
  // face display joints included, so none is momentary in the shipped map).
  const LATCHING = {};
  for (const j of JOINT_IDS) {
    const sides = [];
    for (const k of BODY_KEYS) if (hasOwn(ENDS.get(k), j)) sides.push(sideOf(j, ENDS.get(k)[j]));
    const away = sides.filter(x => x !== 0);
    LATCHING[j] = away.length > 0 && away.every(x => sides.some(y => y !== x));
    // R558 (Space dance): a joint the dance turns stays where the dance leaves it (the latch rule) until an opposing
    // action, another dance or Reset body moves it.
    if (DANCE_BODY_JOINTS.includes(j)) LATCHING[j] = true;
  }
  Object.freeze(LATCHING);
  for (const j of DANCE_BODY_JOINTS) if (!JOINT_IDS.includes(j)) fail('activity_option', `the body map binding lacks the dance joint ${j}`);
  const danceStart = () => createDance({ l_forearm: PRONATION_DEG_AT_VALUE(rotValue(defaultRotation)), l_shoulder_rot: 0, ...Object.fromEntries(DANCE_BODY_JOINTS.map(j => [j, REST[j]])) });

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
      openRemaining: 0,        // wall seconds left of the open_hand window after Space release
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
      suppressedSeq: 0,        // count of pulse starts suppressed by the held Space fist (for HUD feedback)
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
      pendingGaze: null,                      // R3-fix M3: { area, since } a new area waiting to replace a click pulse
      markPending: null,                      // R3-fix M5: { area, regionId, since } a look that marks after markS
      latchPending: null,                     // R558: { area, hit, since } a look that moves its joints after latchS
      bodyDrive: zeroMap(BODY_KEYS),          // body POSE drive (smoothed, eases)
      bodyDisplay: zeroMap(BODY_KEYS),        // body DISPLAY envelope (crisp; for muscle colour)
      bodyJointTargets: restMap(),            // jointId -> absolute degrees (derived: the joint positions, bodyPos)
      bodyGoal: restMap(),                    // jointId -> degrees: where the joint is latched (start angle = not latched)
      bodyPos: restMap(),                     // jointId -> degrees: where the joint is now (jerks to its goal)
      bodyVel: zeroMap(JOINT_IDS),            // jointId -> degrees/s
      armLatch: zeroMap(ACTION_IDS),          // game-arm actionId -> 0 | 1: latched on (see ARM_OPPOSITES)
      rotationState: defaultRotation,         // persistent forearm posture (double-tap toggles)
      rotation: { value: rotValue(defaultRotation), speed: 0, remaining: 0, channel: null, hold: null }, // pose value 0 pronated..1 supinated; speed: R3-arm ease; hold: R558 dance-held value (null = follow rotationState)
      armHumeral: null,        // R558 (Space dance): null = the coupled palm turn (R5-pronation); a number = the game arm's upper-arm turn set explicitly (degrees, + outward; ns-arm rotation.humeralDeg), rotation.value then being the radius' own turn
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
      && (s.pendingGaze === undefined || s.pendingGaze === null || (isPlainObject(s.pendingGaze) && typeof s.pendingGaze.area === 'string' && nonNegative(s.pendingGaze.since)))
      && (s.markPending === undefined || s.markPending === null || (isPlainObject(s.markPending) && typeof s.markPending.area === 'string' && regionOrNull(s.markPending.regionId) && nonNegative(s.markPending.since)))
      && (s.latchPending === undefined || s.latchPending === null || (isPlainObject(s.latchPending) && typeof s.latchPending.area === 'string' && isPlainObject(s.latchPending.hit) && nonNegative(s.latchPending.since)))
      && unitMap(s.bodyDrive, BODY_KEYS) && unitMap(s.bodyDisplay, BODY_KEYS)
      && finiteMap(s.bodyJointTargets, JOINT_IDS)
      && (s.bodyGoal === undefined || finiteMap(s.bodyGoal, JOINT_IDS))
      && (s.bodyPos === undefined || finiteMap(s.bodyPos, JOINT_IDS))
      && (s.bodyVel === undefined || finiteMap(s.bodyVel, JOINT_IDS))
      && (s.armLatch === undefined || unitMap(s.armLatch, ACTION_IDS))
      && ROTATION_STATES.includes(s.rotationState)
      && isPlainObject(s.rotation) && unit(s.rotation.value) && nonNegative(s.rotation.remaining) && rotOrNull(s.rotation.channel)
      && (s.rotation.speed === undefined || isFiniteNumber(s.rotation.speed))
      && (s.rotation.hold === undefined || s.rotation.hold === null || unit(s.rotation.hold))
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
      pendingGaze: s.pendingGaze ? { ...s.pendingGaze } : null,
      markPending: s.markPending ? { ...s.markPending } : null,
      latchPending: s.latchPending ? { ...s.latchPending, hit: { ...s.latchPending.hit } } : null,
      bodyDrive: pick(s.bodyDrive, BODY_KEYS),
      bodyDisplay: pick(s.bodyDisplay, BODY_KEYS),
      bodyJointTargets: pick(s.bodyJointTargets, JOINT_IDS),
      // R558 latch: a state from before the latch has none of these; it starts at the start posture, nothing latched.
      bodyGoal: s.bodyGoal === undefined ? restMap() : pick(s.bodyGoal, JOINT_IDS),
      bodyPos: s.bodyPos === undefined ? restMap() : pick(s.bodyPos, JOINT_IDS),
      bodyVel: s.bodyVel === undefined ? zeroMap(JOINT_IDS) : pick(s.bodyVel, JOINT_IDS),
      armLatch: s.armLatch === undefined ? zeroMap(ACTION_IDS) : pick(s.armLatch, ACTION_IDS),
      rotationState: s.rotationState,
      rotation: { value: s.rotation.value, speed: isFiniteNumber(s.rotation.speed) ? s.rotation.speed : 0, remaining: s.rotation.remaining, channel: s.rotation.channel, hold: isFiniteNumber(s.rotation.hold) ? s.rotation.hold : null },
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
    if (s.pulseAction !== null && at < s.pulseRemaining) T[s.pulseAction] = 1;
    if (at < s.openRemaining) T.open_hand = 1;
    if (at < s.relaxRemaining) T.relax_release = 1;
    return T;
  }

  /** R558 latch: what the game arm's POSE follows at `at` seconds into the step: the latched actions, the held Space
   * fist, the post-release opening window and a running relax pulse. A one-second look/click pulse alone lights its
   * area (commandTargets) but does not hold a pose; the latch does. */
  function poseTargets(s, at) {
    const T = zeroMap(ACTION_IDS);
    for (const id of ACTION_IDS) if (s.armLatch[id] > 0) T[id] = 1;
    if (at < s.openRemaining) T.open_hand = 1;
    if (at < s.relaxRemaining || (s.pulseAction === 'relax_release' && at < s.pulseRemaining)) T.relax_release = 1;
    return T;
  }

  /** Stage rule of a deliberate BODY activation: an action that opposes where one of its joints is latched brings
   * that joint back to its start angle (and does nothing else this time); otherwise its joints go to their end
   * angles and stay. Momentary joints are not touched (they follow the pulse in integrate). */
  function latchBodyAction(s, key) {
    const ends = ENDS.get(key);
    if (!ends) return;
    const back = [];
    for (const j of Object.keys(ends)) {
      if (!LATCHING[j]) continue;
      const at = sideOf(j, s.bodyGoal[j]);
      if (at !== 0 && sideOf(j, ends[j]) !== at) back.push(j);
    }
    if (back.length > 0) { for (const j of back) s.bodyGoal[j] = REST[j]; return; }
    for (const j of Object.keys(ends)) {
      if (!LATCHING[j]) continue;
      // A weaker action on the side a joint is already latched on never eases it off (a part closure does not open a
      // fist): the joint keeps the further of the two end angles.
      const side = sideOf(j, ends[j]);
      if (side !== 0 && sideOf(j, s.bodyGoal[j]) === side && Math.abs(s.bodyGoal[j] - REST[j]) >= Math.abs(ends[j] - REST[j])) continue;
      s.bodyGoal[j] = ends[j];
      // R558 (JOINT_CONFLICTS): the later of two held movements of one shoulder wins its direction
      if (side !== 0 && hasOwn(JOINT_CONFLICTS, j)) for (const k of JOINT_CONFLICTS[j]) if (hasOwn(s.bodyGoal, k) && !hasOwn(ends, k)) s.bodyGoal[k] = REST[k];
    }
  }

  /** Stage rule of a deliberate GAME-ARM activation (ARM_OPPOSITES): the opposing action of a latched one lets it go
   * (back to the neutral pose); otherwise the action latches on. relax_release lets go of every hand action. */
  function latchArmAction(s, id) {
    if (id === 'relax_release') { for (const h of HAND_LATCH_IDS) s.armLatch[h] = 0; return; }
    if (DISPLAY_ONLY_ARM_IDS.includes(id)) return; // R558: moves nothing on the game arm, so nothing is held
    const opp = hasOwn(ARM_OPPOSITES, id) ? ARM_OPPOSITES[id] : null;
    if (opp !== null && opp !== 'relax_release' && s.armLatch[opp] > 0) s.armLatch[opp] = 0;
    else s.armLatch[id] = 1;
  }

  /** Smoothstep fade of a timed command with `remaining` seconds left: 1 before the fade window, exactly 0 at 0. */
  function fadeCeiling(remaining) {
    if (remaining >= displayFadeSeconds) return 1;
    if (remaining <= SNAP) return 0; // the deadline (float residue of summed frame times counts as reached)
    const x = remaining / displayFadeSeconds;
    return x * x * (3 - 2 * x);
  }

  /** Display ceiling of action `id` at offset b1 for the commands active from offset b0 (1 when none is timed). */
  function displayCeiling(s, id, b0, b1) {
    let c = -1;
    if (s.pulseAction === id && b0 < s.pulseRemaining) c = Math.max(c, fadeCeiling(s.pulseRemaining - b1));
    if (id === 'open_hand' && b0 < s.openRemaining) c = Math.max(c, fadeCeiling(s.openRemaining - b1));
    if (id === 'relax_release' && b0 < s.relaxRemaining) c = Math.max(c, fadeCeiling(s.relaxRemaining - b1));
    return c < 0 ? 1 : c;
  }

  /** Space-only commanded targets (no pulse) and their ceilings, for the key lighting of left-arm regions. */
  function keyTarget(s, id, at) {
    if (id === 'grasp_close') return 0; // R558: Space no longer makes a fist
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
    s.pulseAction = null;
    s.pulseRegion = null;
    s.pulseBody = null;
    s.pulseRotation = null;
    s.pulseRemaining = 0;
  }

  /** Start (or replace) the single pulse slot for `hit`, unless the held fist suppresses it. Returns true if started. */
  /** R558 latch: commit a deliberate activation's movement (stage rules above). A forearm-turn area sets the turn. */
  function commitLatch(s, hit) {
    if (hit.bodyKey !== null && hit.bodyKey !== undefined) latchBodyAction(s, hit.bodyKey);
    if (hit.armAction !== null && hit.armAction !== undefined) latchArmAction(s, hit.armAction);
    if (hit.rotation !== null && hit.rotation !== undefined) {
      s.rotationState = hit.rotation === 'supination' ? 'supinated' : 'pronated';
      s.rotation = { ...s.rotation, hold: null }; // R558: the forearm goes to that end (a dance's held angle is let go)
    }
  }

  function startPulse(s, hit, source, at, collect, area = null) {
    s.pulseAction = hit.armAction;
    s.pulseRegion = hit.regionId;
    s.pulseBody = hit.bodyKey;
    s.pulseRotation = hit.rotation;
    s.pulseRemaining = pulseSeconds;
    s.pulseSeq += 1;          // each start is a distinct pulse (no latch)
    s.lastTriggerAt = s.t;
    s.lastTriggerSource = source;
    // A look-movement restart of a clicked area stays a click pulse (it is the same deliberate choice).
    s.pulseClick = source === 'click' || (source === 'moved' && s.pulseClick === true);
    // R558 latch: a deliberate activation (not the restart of the same area by a small look movement) moves its
    // joints to stay, or brings a latched joint back (stage rules above). A click (or a look that already dwelt to
    // replace a click) commits at once; a look onto a new area commits once the gaze has stayed there latchS.
    // A look-movement restart ('moved', the same area) keeps a pending look: its dwell is still running.
    if (source !== 'moved') {
      s.latchPending = null;
      if (source === 'gaze' && latchS > 0 && typeof area === 'string') s.latchPending = { area, hit: { ...hit }, since: s.t };
      else commitLatch(s, hit);
    }
    // Persistent marks count deliberate activations: a click at once, a look only once the gaze has stayed on the area
    // for markS (R3-fix M5; applyGaze adds it), never the look-movement restarts within an area.
    if (hit.regionId !== null && source === 'click') { s.activatedRegions[hit.regionId] = (s.activatedRegions[hit.regionId] || 0) + 1; s.markPending = null; }
    if (collect) {
      collect({
        actionId: hit.armAction !== null ? hit.armAction : hit.actionId, regionId: hit.regionId,
        bodyActionId: hit.bodyKey !== null ? hit.actionId : null, rotation: hit.rotation, source, at
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
    if (s.latchPending && g.area !== s.latchPending.area) s.latchPending = null; // R558: the look left before latchS
    if (hasDir) { s.gazeYaw = ev.yaw; s.gazePitch = ev.pitch; }
    if (s.brainGrab.active && hasDir) s.brainPlacement = grabPlacement(s.brainGrab, ev.yaw, ev.pitch, grabLimitRad);
    // Silent: explicit seed (first frame, re-frame), the frame after an orbit/grab release/resume/reset, while paused,
    // and while dragging the brain (the gaze moves with the brain, so nothing new was looked at).
    const silent = ev.seed === true || s.seedNextGaze || s.paused || s.brainGrab.active;
    s.seedNextGaze = false;
    const clickRunning = s.pulseClick === true && s.pulseRemaining > 0;
    // A look onto a new area starts its 1 s pulse at once, except that it does not replace a running CLICK pulse until
    // the gaze has stayed on it for replaceClickS (R3-fix M3); the look's persistent mark waits for markS (M5).
    const startLook = source => {
      if (startPulse(s, g.hit, source, at, collect, g.area) && g.hit.regionId !== null) s.markPending = { area: g.area, regionId: g.hit.regionId, since: s.t };
      s.pendingGaze = null;
    };
    if (silent || g.area === null) {
      // Empty space / glass / arrow: nothing new starts and an unexpired pulse is NOT erased.
      s.pendingGaze = null;
      if (g.area !== s.gazeArea) s.markPending = null;
      setAnchor(s);
    } else if (g.area !== s.gazeArea) {
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
        startPulse(s, g.hit, 'moved', at, collect);
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
   * R558 (Message 2): Space is the dance key. Hold = the slow dance of all four limbs; a press within doubleTapSeconds
   * of the previous press (press to press) and held = the fast dance (rotationSeq counts these double-taps). Let go =
   * every limb stays where it is (ns-dance stopDance). No fist, no forearm flip, no grab, no opening window.
   */
  function applySpace(s, ev) {
    if (ev.down === true) {
      if (s.paused || s.spaceHeld) return;   // the overlay is up, or a key repeat
      s.spaceHeld = true;
      const fast = isDoubleTap(s.spaceTapAt, s.t, doubleTapSeconds);
      if (fast) { s.rotationSeq += 1; s.spaceTapAt = null; } else s.spaceTapAt = s.t;
      s.dance = { ...s.dance, fast };
    } else if (ev.down === false) {
      if (s.spaceHeld) {
        s.spaceHeld = false;
        s.dance = stopDance(s.dance);
      }
      if (ev.safety === true) s.spaceTapAt = null; // a safety release is not a tap
    } else {
      fail('activity_event', 'space event needs a boolean down');
    }
  }

  /** R558 (lead decision for user Messages 2 and 12): the F key grasps (ns-controls GRASP_CODE). A press with the
   * crosshair on the brain (target 'brain', or no target while the gaze is on a brain area or its glass) starts the
   * brain grab exactly as Space used to: while held the brain keeps its angular offset to the camera, gaze pulses are
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
    s.rotation = { ...s.rotation, value: v, speed: 0, hold: v };
    s.rotationState = v >= 0.5 ? 'supinated' : 'pronated';
    s.armHumeral = a.l_shoulder_rot + 0; // the explicit mode (until Reset body)
    for (const j of DANCE_BODY_JOINTS) {
      const q = limitJoint(j, a[j]) + 0;
      s.bodyPos[j] = q; s.bodyGoal[j] = q; s.bodyVel[j] = 0;
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

  /** One dance piece of h seconds (after the springs and eases of the same piece): record outside movement (history),
   * then, while Space is held and the game runs, turn every limb (ns-dance stepDance). */
  function danceStep(s, h) {
    clampDanceRange(s);
    let d = observeDance(s.dance, danceAngles(s));
    if (s.spaceHeld && !s.paused && h > 0) {
      const r = stepDance(d, danceAngles(s), h, { fast: d.fast, ranges: s.danceRange });
      d = r.dance;
      applyDanceAngles(s, r.angles);
    } else if (d.active) d = stopDance(d);
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
    // R558 latch: Reset is the other way back: every joint at its start angle at once, nothing latched.
    s.bodyGoal = restMap();
    s.bodyPos = restMap();
    s.bodyVel = zeroMap(JOINT_IDS);
    s.armLatch = zeroMap(ACTION_IDS);
    for (const r of REGION_IDS) s.regionDisplay[r] = 0;
    for (const id of ACTION_IDS) {
      s.drive[id] = 0;
      s.display[id] = 0;
    }
    for (const id of KEY_DISPLAY_IDS) s.keyDisplay[id] = 0;
    s.openRemaining = 0;
    s.relaxRemaining = 0;
    s.rotationState = defaultRotation;
    s.rotation = { value: rotValue(defaultRotation), speed: 0, remaining: 0, channel: null, hold: null };
    s.armHumeral = null; // R558 (Space dance): back to the coupled palm turn (the dance history records the move)
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
        if (hit !== null) startPulse(s, hit, 'click', at, collect);
        return;
      }
      case 'space':
        applySpace(s, ev);
        return;
      case 'grasp':
        applyGrasp(s, ev);
        return;
      case 'limbPose': {
        // R558 (user Messages 2 and 12): one of your own limbs, held with F and moved, or turned by a drag. The app
        // solves its joints inside their anatomical ranges and hands them here: { joints: { jointId: degrees },
        // regionId?, actionId? }. They are set at once (goal and position: the limb follows the hand that holds it, no
        // jerk) and STAY there, like a latched activation, until the opposing action or Reset body. regionId / actionId
        // (a motor-map area and, optionally, its action) light that area and its muscles with the ordinary one-second
        // pulse, restarted while the limb keeps moving; such a restart commits no latch of its own ('moved').
        if (s.paused) return;
        if (!isPlainObject(ev.joints)) fail('activity_event', 'limbPose needs joints { jointId: degrees }');
        for (const [j, deg] of Object.entries(ev.joints)) {
          if (!JOINT_IDS.includes(j)) fail('activity_event', `limbPose joint ${JSON.stringify(j)} is not a body joint`);
          if (!isFiniteNumber(deg)) fail('activity_event', `limbPose joint ${j} needs finite degrees`);
          const v = limitJoint(j, deg) + 0;
          s.bodyGoal[j] = v; s.bodyPos[j] = v; s.bodyVel[j] = 0;
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
    const cuts = [s.pulseRemaining, s.openRemaining, s.relaxRemaining, s.rotation.remaining]
      .filter(b => b > 0 && b < h)
      .sort((a, b) => a - b);
    const bounds = [0];
    for (const c of cuts) if (c > bounds[bounds.length - 1]) bounds.push(c);
    bounds.push(h);
    for (let i = 0; i + 1 < bounds.length; i++) {
      const b0 = bounds[i], b1 = bounds[i + 1];
      const seg = b1 - b0;
      if (!(seg > 0)) continue;
      const T = commandTargets(s, b0);
      const P = poseTargets(s, b0);
      for (const id of ACTION_IDS) {
        // R558 latch: the POSE drive jerks to the latched pose targets (armPoseTau both ways) and stays; the DISPLAY
        // below keeps following the timed commands (a pulse lights its area for a second).
        s.drive[id] = approach(s.drive[id], P[id], seg, armPoseTau, armPoseTau);
        const lvl = approach(s.display[id], T[id], seg, displayRiseTau, displayDecayTau);
        s.display[id] = Math.min(lvl, displayCeiling(s, id, b0, b1));
      }
      for (const id of KEY_DISPLAY_IDS) s.keyDisplay[id] = envelope(s.keyDisplay[id], keyTarget(s, id, b0), seg, keyCeiling(s, id, b0, b1));
      const pulseOn = b0 < s.pulseRemaining;
      const pc = pulseOn ? fadeCeiling(s.pulseRemaining - b1) : 1;
      for (const r of REGION_IDS) {
        const on = pulseOn && s.pulseRegion === r;
        s.regionDisplay[r] = envelope(s.regionDisplay[r], on ? 1 : 0, seg, on ? pc : 1);
      }
      for (const k of BODY_KEYS) {
        const on = pulseOn && s.pulseBody === k;
        s.bodyDrive[k] = approach(s.bodyDrive[k], on ? 1 : 0, seg, riseTau, decayTau);
        s.bodyDisplay[k] = envelope(s.bodyDisplay[k], on ? 1 : 0, seg, on ? pc : 1);
      }
      // R558 latch: every body joint jerks to its goal (the JOINT_LATCH spring, exact per segment) and stays there.
      // A momentary joint's goal is its action's end angle only while that action's pulse runs. A joint stopped by
      // its anatomical limit rebounds off it with `restitution` of its speed (0: it stops dead there), so nothing
      // ever passes a limit.
      const momentary = pulseOn && s.pulseBody !== null ? (ENDS.get(s.pulseBody) || null) : null;
      for (const j of JOINT_IDS) {
        const goal = LATCHING[j] ? s.bodyGoal[j] : momentary !== null && hasOwn(momentary, j) ? momentary[j] : REST[j];
        if (s.bodyPos[j] === goal && s.bodyVel[j] === 0) continue;
        const [p, v] = stepJointSpring(s.bodyPos[j], s.bodyVel[j], goal, seg, springOmega, springZeta);
        const q = limitJoint(j, p);
        s.bodyPos[j] = q + 0;
        s.bodyVel[j] = q === p ? v : (springBounce > 0 && Math.sign(v) === Math.sign(p - q) ? -springBounce * v : 0) + 0;
      }
      const rotOn = s.rotation.channel !== null && b0 < s.rotation.remaining;
      const rc = rotOn ? fadeCeiling(s.rotation.remaining - b1) : 1;
      for (const c of ROTATION_ACTION_IDS) {
        const key = rotOn && s.rotation.channel === c;
        const pul = pulseOn && s.pulseRotation === c;
        s.rotationKeyDisplay[c] = envelope(s.rotationKeyDisplay[c], key ? 1 : 0, seg, key ? rc : 1);
        const ceil = key || pul ? Math.max(key ? rc : 0, pul ? pc : 0) : 1;
        s.rotationDisplay[c] = envelope(s.rotationDisplay[c], key || pul ? 1 : 0, seg, ceil);
      }
      const goal = pulseOn && s.pulseRotation !== null ? (s.pulseRotation === 'supination' ? 1 : 0)
        : isFiniteNumber(s.rotation.hold) ? s.rotation.hold : rotValue(s.rotationState);
      // R3-arm: critically damped ease (smooth start, ~0.30 s settle with the default poseTau); see stepRotationEase.
      const eased = stepRotationEase(s.rotation.value, s.rotation.speed, goal, seg, rotationTau);
      s.rotation.value = eased.value;
      s.rotation.speed = eased.speed;
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
    // R558 (latch): a look's movement once the gaze has stayed on that area for latchS (GAZE_DWELL). Nothing moves
    // behind the pause page or while the brain is held: a pending look is dropped then.
    if (s.latchPending && (s.paused || s.brainGrab.active)) s.latchPending = null;
    if (s.latchPending && s.gazeArea === s.latchPending.area && s.t + h - s.latchPending.since >= latchS - SNAP) {
      const hit = s.latchPending.hit;
      s.latchPending = null;
      commitLatch(s, hit);
    }
    s.openRemaining = countdown(s.openRemaining, h);
    s.relaxRemaining = countdown(s.relaxRemaining, h);
    s.rotation.remaining = countdown(s.rotation.remaining, h);
    if (s.rotation.remaining === 0) s.rotation.channel = null;
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
    s.targets = poseTargets(s, 0);          // what the arm pose is following now (latches, held fist, opening)
    s.bodyJointTargets = pick(s.bodyPos, JOINT_IDS); // absolute joint angles: the latched positions (R558)
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
   * R558 latch, for the display: what is held away from the start pose and what brings it back.
   *   joints  [{ jointId, goalDeg, restDeg, posDeg }]   body joints latched away from their start angle
   *   arm     [actionId]                                 latched game-arm actions
   *   rotated true when the forearm turn is not the default one
   *   hints   [{ key, regionId, actionId, armActionId, label, level, muscles, bodySide, isLeftArm, forJoint, forAction }]
   *           the OPPOSING actions: activating one brings that joint (or arm action) back. `muscles` are the opposing
   *           action's movers (the map's agonist names), `level` is JOINT_LATCH.hintLevel. One entry per action.
   *   label   the honest scope line
   * A reminder of the game's own rule (agonist and antagonist actions), not a recording or a nerve path.
   */
  function latchView(state) {
    checkState(state);
    const goalOf = state.bodyGoal === undefined ? REST : state.bodyGoal;
    const posOf = state.bodyPos === undefined ? REST : state.bodyPos;
    const latchOf = state.armLatch === undefined ? {} : state.armLatch;
    const joints = [], hints = [], seen = new Set();
    const add = h => { if (!seen.has(h.key)) { seen.add(h.key); hints.push(h); } };
    for (const j of JOINT_IDS) {
      if (!LATCHING[j]) continue;
      const at = sideOf(j, goalOf[j]);
      if (at === 0) continue;
      joints.push({ jointId: j, goalDeg: goalOf[j], restDeg: REST[j], posDeg: posOf[j] });
      for (const k of BODY_KEYS) {
        const ends = ENDS.get(k);
        if (!hasOwn(ends, j) || sideOf(j, ends[j]) === at) continue;
        const a = binding.bodyActions.get(k);
        const r = binding.regions.get(a.regionId);
        add({
          key: k, regionId: a.regionId, actionId: a.actionId, armActionId: null, label: a.label, level: JOINT_LATCH.hintLevel,
          muscles: [...a.agonists], bodySide: r.bodySide, isLeftArm: false, forJoint: j, forAction: null
        });
      }
    }
    const armHint = (armActionId, forAction) => {
      for (const rid of binding.leftArmRegionIds) {
        const r = binding.regions.get(rid);
        const a = r.actions.find(x => x.armActionId === armActionId);
        if (!a) continue;
        add({
          key: `${rid}/${a.id}`, regionId: rid, actionId: a.id, armActionId, label: a.label, level: JOINT_LATCH.hintLevel,
          muscles: [...a.agonists], bodySide: r.bodySide, isLeftArm: true, forJoint: null, forAction
        });
      }
    };
    const arm = [];
    for (const id of ACTION_IDS) {
      if (!(latchOf[id] > 0)) continue;
      arm.push(id);
      if (hasOwn(ARM_OPPOSITES, id)) armHint(ARM_OPPOSITES[id], id);
    }
    // R558 (Space dance): a palm turn the dance left part way also counts as held (toward the other end).
    const heldTurn = state.rotation && isFiniteNumber(state.rotation.hold) && Math.abs(state.rotation.hold - rotValue(defaultRotation)) > 1e-3;
    const rotated = state.rotationState !== defaultRotation || heldTurn;
    if (rotated) armHint(defaultRotation === 'supinated' ? 'supination' : 'pronation', defaultRotation === 'supinated' ? 'pronation' : 'supination');
    return {
      joints, arm, rotated, hints,
      label: 'held by the game until the opposing action or Reset (a rule of this simulation; not a recording)'
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
    const target = state.pulseRotation !== null && state.pulseRemaining > 0
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
   * R558 (Space dance): what the dance is doing, plain data. { active, fast, angles: { jointId: degrees } (ns-dance
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
      active: state.spaceHeld === true && !state.paused, fast: d.fast, angles, levels: { ...d.levels }, limbs,
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
      latchView: latchView(state),
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
    // R558 latch
    latchView,
    // R558 Space dance
    danceView
  });
}
