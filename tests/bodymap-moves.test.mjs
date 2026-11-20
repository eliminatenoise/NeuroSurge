/** A clear movement for every brain area, both ways (20 November 2026, package BODYMAP; DESIGN-DECISIONS section 175).
 * The owner, Message 204: "make sure there's clear movement for each brain activation area. And you can clearly identify
 * what type of movement it is for each area. And make sure that the movement is as precise as possible with as many
 * activation spots and encoded movements as possible without game destabilisation." Message 205: "That goes both ways
 * for when you're moving the body and the brain area is activating."
 * Checked here on the pure parts, with the start posture's own angles and limits (ns-body 'open'): the new movements of
 * the map (the thigh's and the right upper arm's turn, the left shoulder's four swings of the game arm, each judged by
 * its contraction), that "Swing thigh in" carries its end as a stop for the contraction, and the reverse rule (every
 * joint and direction the player can move has its own area AND movement). How an activation runs (the latch, the way
 * back) is not checked here: the owner's Message 206 replaces it (package MOTION). Game rules, nothing measured. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_MOTOR_MAP, LEFT_ARM_ACTION_IDS, regionById, validateBodyMotorMap } from '../scene/src/ns-bodymap.mjs';
import { createActivity, ACTION_IDS, ACTION_TARGETS, SHOULDER_ACTION_DEG, composePose, bindBodyMap } from '../scene/src/ns-actions.mjs';
import { LEFT_ARM_ACTION_IDS as BRAIN_LEFT_ARM_IDS } from '../scene/src/ns-brain.mjs';
import { jointAreaIndex, LIMB_CHAIN } from '../scene/src/ns-grasp.mjs';
import { bodyPostureAngles, bodyPostureLimits, DEFAULT_BODY_POSTURE } from '../scene/src/ns-body.mjs';
import { shoulderSwing } from '../scene/src/ns-app.mjs';

const H = 1 / 60;
const REST = bodyPostureAngles(DEFAULT_BODY_POSTURE), LIMITS = bodyPostureLimits(DEFAULT_BODY_POSTURE);
const press = (regionId, actionId) => ({ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 });
function started() {
  const A = createActivity({ bodyRest: REST, bodyJointLimits: LIMITS, introSeconds: 0 });
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [{ type: 'gaze', kind: 'empty', at: 0 }], H);
  return { A, s };
}
test('the map is valid and every new movement has its own spot, joint and plain words', () => {
  assert.deepEqual(validateBodyMotorMap(), []);
  const want = {
    rh_hip: { rh_hip_turn_out: ['hip_rot_L', 45], rh_hip_turn_in: ['hip_rot_L', -40] },
    lh_hip: { lh_hip_turn_out: ['hip_rot_R', 45], lh_hip_turn_in: ['hip_rot_R', -40] },
    lh_shoulder: { lh_r_shoulder_out: ['r_shoulder_rot', 90], lh_r_shoulder_in: ['r_shoulder_rot', -40] }
  };
  for (const [rid, acts] of Object.entries(want)) {
    const r = regionById(rid);
    for (const [aid, [joint, deg]] of Object.entries(acts)) {
      const a = r.actions.find(x => x.id === aid);
      assert.ok(a, `${rid} has ${aid}`);
      assert.deepEqual(a.joints, { [joint]: deg }, `${aid} turns ${joint} to ${deg}`);
      assert.ok(a.agonists.length > 0 && a.plainLabel && a.plainMuscles.pull, `${aid} names its muscles in plain words`);
      assert.ok(a.uCentre >= r.core[0] && a.uCentre <= r.core[1], `${aid} has its own share of the area`);
    }
  }
  // the left shoulder area moves the game arm now (it used to light and mark only)
  const ls = regionById('rh_shoulder');
  assert.deepEqual(ls.actions.map(a => a.armActionId), ['shoulder_flexion', 'shoulder_extension', 'shoulder_abduction', 'shoulder_adduction']);
  assert.equal(ls.noActionReason, undefined, 'no "moves nothing" reason any more');
  assert.ok(ls.plainMoves.startsWith('Swings your whole left arm'), ls.plainMoves);
  for (const id of ['shoulder_flexion', 'shoulder_extension', 'shoulder_abduction', 'shoulder_adduction']) {
    assert.ok(ACTION_IDS.includes(id) && LEFT_ARM_ACTION_IDS.includes(id) && BRAIN_LEFT_ARM_IDS.includes(id), `${id} is a game-arm action everywhere`);
    assert.ok(ACTION_TARGETS[id], `${id} has a target`);
  }
  // every area of the strip with a body part moves something; only the in-between areas and the tongue (no mesh) do not
  const still = BODY_MOTOR_MAP.regions.filter(r => !r.actions.length).map(r => r.id.replace(/^(rh|lh)_/, '')).sort();
  assert.deepEqual([...new Set(still)], ['scan_inferior', 'scan_middle', 'scan_superior', 'tongue']);
});

test('the left shoulder swings the whole game arm', () => {
  const p = id => composePose({ [id]: 1 });
  assert.equal(p('shoulder_flexion').shoulderLiftDeg, SHOULDER_ACTION_DEG.lift);
  assert.equal(p('shoulder_extension').shoulderLiftDeg, -SHOULDER_ACTION_DEG.drop);
  assert.equal(p('shoulder_abduction').shoulderOutDeg, SHOULDER_ACTION_DEG.out);
  assert.equal(p('shoulder_adduction').shoulderOutDeg, -SHOULDER_ACTION_DEG.across);
  assert.ok(SHOULDER_ACTION_DEG.lift >= 45 && SHOULDER_ACTION_DEG.out >= 45, 'a swing large enough to see');
  // no swing: the pose is exactly what it was (nothing else in the game changes)
  assert.equal(composePose({}).shoulderLiftDeg, undefined);
  assert.equal(composePose({ elbow_flexion: 1 }).shoulderOutDeg, undefined);
  // the turn of the free hand's place about the shoulder: forward-up and out to the left; back() undoes it
  assert.equal(shoulderSwing(0, 0), null);
  const up = shoulderSwing(90, 0).turn([0, -1, 0]), out = shoulderSwing(0, 90).turn([0, -1, 0]);
  assert.ok(Math.abs(up[2] + 1) < 1e-9 && Math.abs(up[1]) < 1e-9, `a hanging arm lifted 90 points forward (${up})`);
  assert.ok(Math.abs(out[0] + 1) < 1e-9 && Math.abs(out[1]) < 1e-9, `a hanging arm swung out 90 points out to the left (${out})`);
  const sw = shoulderSwing(35, -20), v = [0.12, -0.31, -0.22], w = sw.back(sw.turn(v));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(w[i] - v[i]) < 1e-12);
  // a press contracts it: the arm's drive is driven all the way to the movement's end
  const { A, s } = started();
  let t = A.step(s, [press('rh_shoulder', 'shoulder_abduction')], H);
  let top = 0;
  for (let i = 0; i < 120; i++) { t = A.step(t, [], H); top = Math.max(top, t.drive.shoulder_abduction); }
  assert.equal(top, 1, 'driven all the way');
});

test('"Swing thigh in" carries its end as a stop for the contraction (it was thrown on into the other leg)', () => {
  const adduct = regionById('rh_hip').actions.find(a => a.id === 'rh_hip_adduct');
  assert.equal(adduct.jerkStop, true);
  assert.equal(bindBodyMap(BODY_MOTOR_MAP).bodyActions.get('rh_hip/rh_hip_adduct').jerkStop, true);
  assert.equal(bindBodyMap(BODY_MOTOR_MAP).bodyActions.get('rh_hip/rh_hip_abduct').jerkStop, undefined);
});

test('both ways: every joint and direction the player can move lights its own area and its own movement', () => {
  const idx = jointAreaIndex(BODY_MOTOR_MAP, REST, LIMITS);
  const sideOf = rid => regionById(rid).bodySide;
  // the limbs the keys, the look, a drag and the limb turn move (ns-grasp LIMB_CHAIN: the solved joints and both dials)
  for (const [limb, c] of Object.entries(LIMB_CHAIN)) {
    const ids = [...c.joints, c.dial.joint, ...(c.upperDial ? [c.upperDial.joint] : [])];
    for (const id of ids) for (const sign of ['1', '-1']) {
      const a = idx[id] && idx[id][sign];
      assert.ok(a && a.actionId, `${limb} ${id} ${sign}: an area AND a movement (${JSON.stringify(a)})`);
      assert.equal(sideOf(a.regionId), c.side, `${limb} ${id} ${sign}: the area of its own side (${a.regionId})`);
      const act = regionById(a.regionId).actions.find(x => x.id === a.actionId);
      assert.ok(Object.prototype.hasOwnProperty.call(act.joints, id), `${a.actionId} moves ${id}`);
      const end = act.joints[id], rest = REST[id] || 0;
      const way = Math.abs(end - rest) >= 0.5 ? Math.sign(end - rest) : end >= LIMITS[id][1] - 0.5 ? 1 : -1;
      assert.equal(String(way), sign, `${a.actionId} moves ${id} the ${sign} way`);
    }
  }
  // the movements that end at the joint's stop and start angle are found for their direction (they were missing)
  assert.equal(idx.r_pronation['-1'].actionId, 'lh_r_supinate');
  assert.equal(idx.r_finger_spread['-1'].actionId, 'lh_r_together');
  assert.equal(idx.jaw_open['-1'].actionId.endsWith('_jaw_clench'), true);
  // the dial joints have their own movements now (they lit only the area)
  assert.equal(idx.r_shoulder_rot['1'].actionId, 'lh_r_shoulder_out');
  assert.equal(idx.r_shoulder_rot['-1'].actionId, 'lh_r_shoulder_in');
  assert.equal(idx.hip_rot_L['1'].actionId, 'rh_hip_turn_out');
  assert.equal(idx.hip_rot_R['-1'].actionId, 'lh_hip_turn_in');
  // without limits the old reading holds (nothing found for an end at the start angle)
  assert.equal(jointAreaIndex(BODY_MOTOR_MAP, REST).r_pronation['-1'], undefined);
});
