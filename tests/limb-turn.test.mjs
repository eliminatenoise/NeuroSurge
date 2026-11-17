/** The limb turn of a Space double tap (ns-dance) after the owner's note of 17 November 2026: the wrist end of each
 * arm (the forearm) and the ankle of each leg lead and make the whole turn; the shoulder and the hip only follow a few
 * degrees, from wherever they are. Pure software state on supplied times; no browser, no anatomy validation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDance, startTurnStep, startTurnHold, stepDance, stopDance, observeDance, DANCE_LIMBS, DANCE_JOINT_IDS, DANCE_FOLLOW } from '../scene/src/ns-dance.mjs';
import { DANCE_AREAS, DANCE_MUSCLES, DANCE_BODY_JOINTS } from '../scene/src/ns-actions.mjs';

const start = { l_forearm: 80, l_shoulder_rot: 0, r_pronation: 160, r_shoulder_rot: 0, ankle_inv_L: 0, hip_rot_L: 0, ankle_inv_R: 0, hip_rot_R: 0 };
function run(d, angles, seconds, step = 1 / 60) {
  let a = { ...angles };
  for (let t = 0; t < seconds; t += step) { d = observeDance(d, a); const r = stepDance(d, a, step); d = r.dance; a = r.angles; }
  return { dance: d, angles: a };
}

test('each limb is led by its forearm or ankle; the shoulder and hip are followers', () => {
  for (const [limb, lead, follow] of [['leftArm', 'l_forearm', 'l_shoulder_rot'], ['rightArm', 'r_pronation', 'r_shoulder_rot'], ['leftLeg', 'ankle_inv_L', 'hip_rot_L'], ['rightLeg', 'ankle_inv_R', 'hip_rot_R']]) {
    assert.equal(DANCE_LIMBS[limb][0].id, lead);
    assert.equal(DANCE_LIMBS[limb][0].follow, undefined);
    assert.equal(DANCE_LIMBS[limb][1].id, follow);
    assert.ok(DANCE_LIMBS[limb][1].follow > 0 && DANCE_LIMBS[limb][1].follow <= 15, 'a follower turns at most 15 degrees for a whole stroke');
  }
  for (const j of DANCE_BODY_JOINTS) { assert.ok(Array.isArray(DANCE_AREAS[j]) && DANCE_AREAS[j].length, `${j} has an area`); assert.ok(DANCE_MUSCLES[j].open.length && DANCE_MUSCLES[j].closed.length, `${j} has muscles`); }
});

test('one double tap: the forearms and ankles go end to end, the shoulders and hips only a few degrees', () => {
  const r = run(startTurnStep(createDance(start)), start, 3);
  assert.equal(r.dance.mode, null, 'the step ends by itself');
  assert.ok(Math.abs(r.angles.l_forearm - -80) < 1e-6 && Math.abs(r.angles.r_pronation - 0) < 1e-6, 'both palms turned up');
  // a foot at rest (0) is nearer its outward end, so its first stroke is the bigger one, to the inward end
  assert.ok(Math.abs(r.angles.ankle_inv_L - 35) < 1e-6 && Math.abs(r.angles.ankle_inv_R - 35) < 1e-6, 'both soles turned inward');
  assert.ok(Math.abs(r.angles.l_shoulder_rot - DANCE_FOLLOW.shoulderDeg) < 1e-6 && Math.abs(r.angles.r_shoulder_rot - DANCE_FOLLOW.shoulderDeg) < 1e-6, 'a whole forearm stroke turns the upper arm by the follow amount');
  for (const j of ['hip_rot_L', 'hip_rot_R']) assert.ok(Math.abs(r.angles[j]) > 1 && Math.abs(r.angles[j]) <= DANCE_FOLLOW.hipDeg + 1e-9, `${j} only follows`);
  // the next double tap turns every leader to its other end; a third brings each joint back to where the first left it
  const second = run(startTurnStep(r.dance), r.angles, 3);
  assert.ok(Math.abs(second.angles.l_forearm - 80) < 1e-6 && Math.abs(second.angles.ankle_inv_L - -15) < 1e-6);
  assert.ok(Math.abs(second.angles.l_shoulder_rot) < 1e-6 && Math.abs(second.angles.r_shoulder_rot) < 1e-6, 'a whole stroke back undoes the upper arm\'s turn');
  const third = run(startTurnStep(second.dance), second.angles, 3);
  for (const j of DANCE_JOINT_IDS) assert.ok(Math.abs(third.angles[j] - r.angles[j]) < 1e-6, `${j} is back where the first stroke left it`);
});

test('a follower turns from wherever it is and never leaves its own range', () => {
  const far = { ...start, r_shoulder_rot: 85, hip_rot_L: -38 };
  const r = run(startTurnStep(createDance(far)), far, 3);
  assert.ok(r.angles.r_shoulder_rot <= 90 && r.angles.r_shoulder_rot >= 85, 'the upper arm keeps its place, inside its range');
  assert.ok(r.angles.hip_rot_L >= -40 && Math.abs(r.angles.hip_rot_L - -38) <= DANCE_FOLLOW.hipDeg + 1e-9);
  // a narrowed range (the feet clearance) holds the hip
  let d = startTurnStep(createDance(start)), a = { ...start };
  for (let t = 0; t < 3; t += 1 / 60) { const s = stepDance(observeDance(d, a), a, 1 / 60, { ranges: { hip_rot_L: [-2, 2], hip_rot_R: [-2, 2] } }); d = s.dance; a = s.angles; }
  assert.ok(Math.abs(a.hip_rot_L) <= 2 + 1e-9 && Math.abs(a.hip_rot_R) <= 2 + 1e-9);
});

test('the slow turn of a double tap held keeps going and stops where it is', () => {
  let r = run(startTurnHold(createDance(start)), start, 9);
  assert.equal(r.dance.mode, 'hold');
  const stopped = stopDance(r.dance);
  assert.equal(stopped.mode, null);
  const after = stepDance(stopped, r.angles, 0.5);
  assert.deepEqual(after.angles, r.angles, 'nothing moves after the key is let go');
  for (const j of ['l_shoulder_rot', 'r_shoulder_rot']) assert.ok(Math.abs(r.angles[j]) <= DANCE_FOLLOW.shoulderDeg + 1e-6, 'the shoulders never wind up over many strokes');
});
