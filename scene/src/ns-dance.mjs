/**
 * NeuroSurge: the limb turn of all four limbs (R558; the user's Message 2 as reshaped by Message 40). The module keeps
 * its old name ("dance") so saved notes and the activity state's field names stay valid.
 *
 * Message 2: "Holding the space bar now more slowly shifts pronation/supination / external/internal rotation and between
 * continuously like in a dance (think opening and closing up the body/limbs) simultaneously among all 4 limbs (though
 * not coordinatively as we'll get on later on). The current rotational direction of each limb's rotation depends on
 * previous actions."
 * Message 40 (newest; it gives Space back to the grasp): "Holding the spacebar should again be grasping. And so should
 * one tap spacebar. But double tapping causes rotation, and double tapping and holding continues that rotation, but
 * slowly." So the turn no longer runs on a held Space. It runs in two modes (ns-controls SPACE_GESTURE decides which):
 *   'step'  a DOUBLE TAP of Space: every limb makes ONE stroke to its next end (the forearms palm up <-> palm down, the
 *           upper arms and hips in <-> out), each limb its own next way (rule 2), then stops by itself.
 *   'hold'  a DOUBLE TAP AND HOLD: the step's strokes go on, slowly, stroke after stroke, while Space stays down; let go
 *           ('stop') and every limb stays exactly where it is. The old fast dance is gone.
 *
 * Pure module (browser and Node; no DOM, no imports). ns-actions keeps the state inside the activity state and calls
 * stepDance / observeDance; ns-app reads the joint angles back through the activity's own joint state.
 *
 * Limbs and joints (degrees, each in its own joint's convention; "open" = turned outward, "closed" = turned inward):
 *   leftArm   l_forearm       the game arm's radius turn about the ulna (ns-arm forearm_pronation): open -80 palm up,
 *                             closed +80 palm down (80 each way from thumb-up, the rig's own display range)
 *             l_shoulder_rot  the game arm's upper-arm turn about the shoulder -> hand line (ns-arm rotation.humeralDeg;
 *                             with the elbow straight, as at the start, that is the upper arm's own axial rotation):
 *                             open +90 (external), closed -70 (internal), ns-arm HUMERAL_ROTATION_RANGE_DEG
 *                             Once the dance has turned the game arm, both are set explicitly (the palm-turn coupling of
 *                             R5-pronation is off until Reset body), so the left arm uses the same two full ranges as
 *                             the right arm of the body rig.
 *   rightArm  r_pronation     ns-body right forearm: open 0 (palm up, the anatomical source pose), closed 160 (palm down)
 *             r_shoulder_rot  ns-body right upper arm about its own long axis: open +90 (external), closed -70 (internal)
 *   leftLeg   hip_rot_L       ns-body left hip about the thigh's long axis: open +45 (external), closed -40 (internal)
 *   rightLeg  hip_rot_R       likewise for the right hip
 * Every end is the joint's whole anatomically feasible range as the game models it (see ns-body BODY_JOINT_LIMITS and
 * ns-rig PRONATION_RANGE_DEG for the basis); a range passed in `ranges` (the feet clearance of the current leg posture,
 * ns-body hipRotationClearRange) can only narrow it.
 *
 * The rule (record of the design):
 *  1. Opening and closing. Each limb moves its joints together between its two ends: supination with external rotation
 *     ("opening up"), pronation with internal rotation ("closing"). One stroke takes every joint of the limb from where
 *     it is to the same end at the same moment, with a smooth start and stop (half a cosine), then the limb turns round.
 *  2. Direction from history. Each limb keeps the direction it last moved in, whatever moved it: an activation, a
 *     drag, a reset or the dance itself (observeDance watches the joint angles every step). When Space is pressed it
 *     carries on that way; a limb already at that end turns round at once. So a limb that an activation has just turned
 *     palm down goes back toward palm up first, and a dance that was stopped half way carries on the same way.
 *  3. Not coordinated. The four limbs are separate oscillators with their own tempo (DANCE.tempo; spaced so that no two
 *     stay in step) and their own direction and position, so they open and close at different moments.
 *  4. Speeds (Message 40). A double tap's step takes DANCE.stepStrokeS for a full end-to-end stroke at tempo 1, then the
 *     limb stops at that end (it is "done"). When the double tap is held, the strokes go on at DANCE.slowStrokeS: a
 *     stroke that is under way keeps its progress and only stretches its remaining time (startTurnHold / stepDance),
 *     so nothing jumps or restarts, it just slows down. Let go (stopDance) and every limb stays exactly where it is (the
 *     latch rule): only an opposing activation, a drag, another turn or Reset body moves it.
 *  5. Activity: each limb's level is its current turning speed (DANCE.glowFullSpeed of its range per second = level 1),
 *     for the brain areas of the turning limbs and their rotator muscles. Simulated, unitless display values.
 * Not measured motion, EMG, force or nerve signals; a game display rule.
 */

/** Tuning (display choices; see the rule above).
 *  stepStrokeS / slowStrokeS  seconds for a full end-to-end stroke at tempo 1: a double tap's one step (1.0 s, the old
 *                             fast dance's speed) / the slow turn of a double tap held (2.6 s, the old slow dance's)
 *  tempo                      per-limb speed factors; ratios chosen so no two limbs stay in step (not coordinated)
 *  endEps                     a limb within this fraction of its range of the end it is heading for turns round
 *  moveEpsDeg                 a joint change smaller than this (degrees) is not counted as a movement (history)
 *  glowFullSpeed              turning speed (fraction of the range per second) shown as activity level 1 */
export const DANCE = Object.freeze({
  stepStrokeS: 1.0,
  slowStrokeS: 2.6,
  tempo: Object.freeze({ leftArm: 1.0, rightArm: 1.27, leftLeg: 0.86, rightLeg: 1.13 }),
  endEps: 0.004,
  moveEpsDeg: 0.05,
  glowFullSpeed: 1.2
});

/** The four limbs and their joints: id, open end, closed end (degrees in each joint's own convention). */
export const DANCE_LIMBS = Object.freeze({
  leftArm: Object.freeze([Object.freeze({ id: 'l_forearm', open: -80, closed: 80 }), Object.freeze({ id: 'l_shoulder_rot', open: 90, closed: -70 })]),
  rightArm: Object.freeze([Object.freeze({ id: 'r_pronation', open: 0, closed: 160 }), Object.freeze({ id: 'r_shoulder_rot', open: 90, closed: -70 })]),
  leftLeg: Object.freeze([Object.freeze({ id: 'hip_rot_L', open: 45, closed: -40 })]),
  rightLeg: Object.freeze([Object.freeze({ id: 'hip_rot_R', open: 45, closed: -40 })])
});
export const DANCE_LIMB_IDS = Object.freeze(Object.keys(DANCE_LIMBS));
export const DANCE_JOINT_IDS = Object.freeze(DANCE_LIMB_IDS.flatMap(l => DANCE_LIMBS[l].map(j => j.id)));

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** A joint's two ends after an optional [lo, hi] range: { open, closed }. */
function endsOf(j, ranges) {
  const r = ranges && Array.isArray(ranges[j.id]) && ranges[j.id].length === 2 && isNum(ranges[j.id][0]) && isNum(ranges[j.id][1]) ? ranges[j.id] : null;
  if (!r) return { open: j.open, closed: j.closed };
  const lo = Math.min(r[0], r[1]), hi = Math.max(r[0], r[1]);
  return { open: clamp(j.open, lo, hi), closed: clamp(j.closed, lo, hi) };
}
/** Openness 0 (closed end) .. 1 (open end) of an angle against the joint's FULL range. */
const openness = (j, deg) => (deg - j.closed) / (j.open - j.closed);

function checkAngles(angles) {
  if (!angles || typeof angles !== 'object') fail('dance_input', 'angles must be an object of joint id -> degrees');
  for (const id of DANCE_JOINT_IDS) if (!isNum(angles[id])) fail('dance_input', `angle ${id} must be finite degrees`);
}

/**
 * A fresh dance state for the start angles (plain JSON). A limb with no history moves first toward the end that is
 * farther from where it starts (its bigger movement), measured on its first joint (the forearm for an arm).
 */
export function createDance(angles) {
  checkAngles(angles);
  const limbs = {};
  for (const l of DANCE_LIMB_IDS) {
    const j = DANCE_LIMBS[l][0];
    limbs[l] = { dir: openness(j, angles[j.id]) <= 0.5 ? 1 : -1, stroke: null, level: 0, done: true };
  }
  const seen = {}, levels = {};
  for (const id of DANCE_JOINT_IDS) { seen[id] = angles[id] + 0; levels[id] = 0; }
  // mode: null (nothing turns) | 'step' (a double tap's one stroke per limb) | 'hold' (the slow turn of a double tap held).
  // A limb's `done` is true once it has made its stroke of the current step (and whenever no step runs).
  return { limbs, seen, levels, mode: null, active: false };
}

/** The turn modes (Message 40): see the module comment. */
export const TURN_MODES = Object.freeze(['step', 'hold']);
const strokeSecondsFor = mode => (mode === 'step' ? DANCE.stepStrokeS : DANCE.slowStrokeS);

/** True when a value is a dance state (shape check for the activity's state validator). */
export function isDanceState(d) {
  if (!d || typeof d !== 'object' || !(d.mode === null || TURN_MODES.includes(d.mode)) || typeof d.active !== 'boolean' || !d.limbs || !d.seen || !d.levels) return false;
  for (const id of DANCE_JOINT_IDS) if (!isNum(d.seen[id]) || !isNum(d.levels[id]) || d.levels[id] < 0 || d.levels[id] > 1) return false;
  for (const l of DANCE_LIMB_IDS) {
    const s = d.limbs[l];
    if (!s || (s.dir !== 1 && s.dir !== -1) || !isNum(s.level) || s.level < 0 || s.level > 1 || typeof s.done !== 'boolean') return false;
    if (s.stroke !== null) {
      const k = s.stroke;
      if (!k || !isNum(k.t) || !isNum(k.T) || !(k.T > 0) || k.t < 0 || !k.from || !k.to || !TURN_MODES.includes(k.mode)) return false;
      for (const j of DANCE_LIMBS[l]) if (!isNum(k.from[j.id]) || !isNum(k.to[j.id])) return false;
    }
  }
  return true;
}

/**
 * History (rule 2): compare the current angles with the last ones seen and record, per limb, the direction any outside
 * movement took (an activation, a drag, a reset). A running stroke is dropped when its limb was moved from outside, so
 * the next stroke starts from where the limb now is. Returns a new state (the input is not changed).
 */
export function observeDance(dance, angles) {
  checkAngles(angles);
  const d = { ...dance, limbs: { ...dance.limbs }, seen: { ...dance.seen } };
  for (const l of DANCE_LIMB_IDS) {
    let sum = 0, moved = false;
    for (const j of DANCE_LIMBS[l]) {
      const delta = angles[j.id] - d.seen[j.id];
      if (Math.abs(delta) > DANCE.moveEpsDeg) { moved = true; sum += delta / (j.open - j.closed); }
    }
    if (moved) {
      d.limbs[l] = { ...d.limbs[l], dir: sum > 0 ? 1 : sum < 0 ? -1 : d.limbs[l].dir, stroke: null };
      // The reference moves on only once a movement is counted, so a slow movement (less than moveEpsDeg per step, for
      // example the tail of an ease) still adds up and counts, and the direction is that of the whole movement.
      for (const j of DANCE_LIMBS[l]) d.seen[j.id] = angles[j.id] + 0;
    }
  }
  return d;
}

const ease = q => 0.5 - 0.5 * Math.cos(Math.PI * q);
const easeRate = q => 0.5 * Math.PI * Math.sin(Math.PI * q); // d ease / d q

/** A new stroke for limb l from the current angles in direction dir (null when every joint is already at that end). */
function newStroke(l, angles, dir, ranges, strokeS) {
  const from = {}, to = {};
  let frac = 0;
  for (const j of DANCE_LIMBS[l]) {
    const e = endsOf(j, ranges);
    from[j.id] = angles[j.id];
    to[j.id] = dir > 0 ? e.open : e.closed;
    frac = Math.max(frac, Math.abs(to[j.id] - from[j.id]) / Math.abs(j.open - j.closed));
  }
  if (!(frac > DANCE.endEps)) return null;
  return { from, to, t: 0, T: (frac * strokeS) / DANCE.tempo[l], frac };
}

/**
 * Message 40: a DOUBLE TAP starts one step: every limb makes one stroke to its next end (rule 2 picks the way), then
 * stops by itself. A limb whose stroke of an earlier step is still under way keeps it (it is not restarted, so nothing
 * stutters); a limb that has finished turns once more. Returns a new state.
 */
export function startTurnStep(dance) {
  const limbs = {};
  for (const l of DANCE_LIMB_IDS) limbs[l] = { ...dance.limbs[l], done: false };
  return { ...dance, limbs, mode: 'step', active: true };
}

/**
 * Message 40: a DOUBLE TAP AND HOLD: the turn goes on slowly while Space stays down. A stroke under way slows down where
 * it is (stepDance stretches its remaining time, keeping its progress); limbs that have finished their step start their
 * next stroke at the slow speed. Returns a new state.
 */
export function startTurnHold(dance) {
  const limbs = {};
  for (const l of DANCE_LIMB_IDS) limbs[l] = { ...dance.limbs[l], done: false };
  return { ...dance, limbs, mode: 'hold', active: true };
}

/**
 * Advance the turn by h seconds (rules 1-4) in the state's own mode (dance.mode: 'step' | 'hold'; with no mode nothing
 * moves). angles: the current joint angles (every DANCE_JOINT_IDS id). opts: { ranges: { jointId: [lo, hi] } (narrowing
 * only) }. Returns { dance, angles } (new objects; the angles object holds every dance joint). With h = 0 nothing moves.
 * A step ends by itself once every limb is done (the returned state then has mode null and active false).
 */
export function stepDance(dance, angles, h, { ranges = null } = {}) {
  checkAngles(angles);
  if (!(isNum(h) && h >= 0)) fail('dance_input', 'h must be finite seconds >= 0');
  const out = {};
  for (const id of DANCE_JOINT_IDS) out[id] = angles[id];
  const mode = dance.mode;
  if (!TURN_MODES.includes(mode)) return { dance: stopDance(dance), angles: out };
  const strokeS = strokeSecondsFor(mode);
  const d = { ...dance, limbs: { ...dance.limbs }, levels: { ...dance.levels }, active: true };
  for (const l of DANCE_LIMB_IDS) {
    const jspeed = {};
    for (const j of DANCE_LIMBS[l]) jspeed[j.id] = 0;
    let s = { ...d.limbs[l] };
    // The running stroke is copied before its clock advances (the input state is never changed).
    if (s.stroke) s.stroke = { ...s.stroke };
    // A stroke started in the other mode (the double tap's step, now held) keeps its progress q and only takes longer:
    // T and t are stretched by the ratio of the stroke times, so the limb slows down where it is (no restart, no jump).
    if (s.stroke && s.stroke.mode !== mode) {
      const r = strokeS / strokeSecondsFor(s.stroke.mode);
      s.stroke = { ...s.stroke, T: s.stroke.T * r, t: s.stroke.t * r, mode };
    }
    let left = h, speed = 0, guard = 0;
    while (guard++ < 8) {
      if (!s.stroke) {
        if (mode === 'step' && s.done) break; // this step's stroke is made: the limb waits where it is
        const cur = {};
        for (const j of DANCE_LIMBS[l]) cur[j.id] = out[j.id];
        let k = newStroke(l, cur, s.dir, ranges, strokeS);
        if (!k) { s.dir = -s.dir; k = newStroke(l, cur, s.dir, ranges, strokeS); }
        if (!k) { s.done = true; break; } // a limb with no room at all (both ends at its angle) stays where it is
        s.stroke = { ...k, mode };
      }
      const k = s.stroke;
      const dtq = Math.min(left, k.T - k.t);
      k.t = Math.min(k.T, k.t + dtq);
      left -= dtq;
      const q = k.t / k.T;
      for (const j of DANCE_LIMBS[l]) out[j.id] = k.from[j.id] + (k.to[j.id] - k.from[j.id]) * ease(q);
      // speed as a fraction of the range per second (the limb: the joint with the farthest to go; and each joint)
      speed = (k.frac * easeRate(q)) / k.T;
      for (const j of DANCE_LIMBS[l]) jspeed[j.id] = (Math.abs(k.to[j.id] - k.from[j.id]) / Math.abs(j.open - j.closed)) * easeRate(q) / k.T;
      if (k.t >= k.T - 1e-12) {
        s.stroke = null; s.dir = -s.dir;
        // A step makes one stroke per limb; the slow hold goes on with the next one.
        if (mode === 'step' || left <= 1e-12) { if (mode === 'step') s.done = true; speed = 0; for (const j of DANCE_LIMBS[l]) jspeed[j.id] = 0; break; }
        continue;
      }
      if (left <= 1e-12) break;
    }
    s.level = h > 0 ? clamp(speed / DANCE.glowFullSpeed, 0, 1) : s.level;
    if (h > 0) for (const j of DANCE_LIMBS[l]) d.levels[j.id] = clamp(jspeed[j.id] / DANCE.glowFullSpeed, 0, 1);
    d.limbs[l] = s;
  }
  d.seen = { ...dance.seen };
  for (const id of DANCE_JOINT_IDS) d.seen[id] = out[id] + 0;
  // The step is over once every limb has made its stroke.
  if (mode === 'step' && DANCE_LIMB_IDS.every(l => d.limbs[l].done)) return { dance: stopDance(d), angles: out };
  return { dance: d, angles: out };
}

/** The turn ends (Space let go after a double tap and hold, a step finished, a pause, Reset body): the limbs stay where
 * they are; the running strokes end, the directions are kept. */
export function stopDance(dance) {
  const limbs = {}, levels = {};
  for (const l of DANCE_LIMB_IDS) limbs[l] = { ...dance.limbs[l], stroke: null, level: 0, done: true };
  for (const id of DANCE_JOINT_IDS) levels[id] = 0;
  return { ...dance, limbs, levels, mode: null, active: false };
}
