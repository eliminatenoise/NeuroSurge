/** The limb turn of a Space double tap (ns-dance) after the owner's note of 17 November 2026: the wrist end of each
 * arm (the forearm) and the far end of each leg lead and make the whole turn; the shoulder only follows a few degrees,
 * from wherever it is. 18 November 2026 (the owner: "the ankles and the feet should be traveling the full 90 degrees
 * either way"): each leg's leader is the leg's own turn (ns-body leg_turn, LEG_TURN), which the rig shares between
 * the foot, the shank and the thigh; the dance's own hip follower turns nothing now (these cases were changed for
 * that: they used to expect the ankle's sole tip as the leader and a hip that followed 10 degrees).
 * Pure software state on supplied times; no browser, no anatomy validation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDance, startTurnStep, startTurnHold, stepDance, stopDance, observeDance, DANCE, DANCE_LIMBS, DANCE_JOINT_IDS, DANCE_FOLLOW, DANCE_UNDERSIDE } from '../scene/src/ns-dance.mjs';
import { DANCE_AREAS, DANCE_MUSCLES, DANCE_BODY_JOINTS } from '../scene/src/ns-actions.mjs';

const start = { l_forearm: 80, l_shoulder_rot: 0, r_pronation: 160, r_shoulder_rot: 0, leg_turn_L: 0, hip_rot_L: 0, leg_turn_R: 0, hip_rot_R: 0 };
function run(d, angles, seconds, step = 1 / 60) {
  let a = { ...angles };
  for (let t = 0; t < seconds; t += step) { d = observeDance(d, a); const r = stepDance(d, a, step); d = r.dance; a = r.angles; }
  return { dance: d, angles: a };
}

test('each limb is led by its forearm or its leg turn; the shoulder follows a little, the hip is turned inside the leg turn', () => {
  for (const [limb, lead, follow] of [['leftArm', 'l_forearm', 'l_shoulder_rot'], ['rightArm', 'r_pronation', 'r_shoulder_rot'], ['leftLeg', 'leg_turn_L', 'hip_rot_L'], ['rightLeg', 'leg_turn_R', 'hip_rot_R']]) {
    assert.equal(DANCE_LIMBS[limb][0].id, lead);
    assert.equal(DANCE_LIMBS[limb][0].follow, undefined);
    assert.equal(DANCE_LIMBS[limb][1].id, follow);
    if (/Arm$/.test(limb)) assert.ok(DANCE_LIMBS[limb][1].follow > 0 && DANCE_LIMBS[limb][1].follow <= 15, 'a follower turns at most 15 degrees for a whole stroke');
    else {
      assert.equal(DANCE_LIMBS[limb][1].follow, 0, 'the hip turns inside the leg turn (ns-body LEG_TURN), not as a follower');
      assert.deepEqual([DANCE_LIMBS[limb][0].open, DANCE_LIMBS[limb][0].closed], [25, -65], 'the foot line ends 45 degrees out (a V) and 45 degrees in (an A); it rests 20 out');
      assert.ok(Number.isFinite(1 / (DANCE_LIMBS[limb][1].open - DANCE_LIMBS[limb][1].closed)), 'a follower that turns nothing still has two different nominal ends');
    }
  }
  for (const j of DANCE_BODY_JOINTS) { assert.ok(Array.isArray(DANCE_AREAS[j]) && DANCE_AREAS[j].length, `${j} has an area`); assert.ok(DANCE_MUSCLES[j].open.length && DANCE_MUSCLES[j].closed.length, `${j} has muscles`); }
});

test('one double tap: the forearms and the leg turns go end to end, the shoulders only a few degrees, the hips not at all', () => {
  const r = run(startTurnStep(createDance(start)), start, 3);
  assert.equal(r.dance.mode, null, 'the step ends by itself');
  assert.ok(Math.abs(r.angles.l_forearm - -80) < 1e-6 && Math.abs(r.angles.r_pronation - 0) < 1e-6, 'both palms turned up');
  // all four limbs go to the same side (18 November 2026): with both palms down the limbs are mostly on the overside,
  // so the switch goes to the underside: palms up and the feet 45 degrees outward
  assert.ok(Math.abs(r.angles.leg_turn_L - 25) < 1e-6 && Math.abs(r.angles.leg_turn_R - 25) < 1e-6, 'both feet turned 45 degrees outward');
  assert.ok(Math.abs(r.angles.l_shoulder_rot - DANCE_FOLLOW.shoulderDeg) < 1e-6 && Math.abs(r.angles.r_shoulder_rot - DANCE_FOLLOW.shoulderDeg) < 1e-6, 'a whole forearm stroke turns the upper arm by the follow amount');
  for (const j of ['hip_rot_L', 'hip_rot_R']) assert.equal(r.angles[j], 0, `${j} is not turned by the dance (the rig turns the thigh inside the leg turn)`);
  for (const j of ['hip_rot_L', 'hip_rot_R']) assert.equal(r.dance.levels[j], 0);
  // the next double tap turns every leader to its other end; a third brings each joint back to where the first left it
  const second = run(startTurnStep(r.dance), r.angles, 3);
  assert.ok(Math.abs(second.angles.l_forearm - 80) < 1e-6 && Math.abs(second.angles.leg_turn_L - -65) < 1e-6 && Math.abs(second.angles.leg_turn_R - -65) < 1e-6, 'and 45 degrees inward');
  assert.ok(Math.abs(second.angles.l_shoulder_rot) < 1e-6 && Math.abs(second.angles.r_shoulder_rot) < 1e-6, 'a whole stroke back undoes the upper arm\'s turn');
  const third = run(startTurnStep(second.dance), second.angles, 3);
  for (const j of DANCE_JOINT_IDS) assert.ok(Math.abs(third.angles[j] - r.angles[j]) < 1e-6, `${j} is back where the first stroke left it`);
});

test('a follower turns from wherever it is and never leaves its own range', () => {
  const far = { ...start, r_shoulder_rot: 85, hip_rot_L: -38 };
  const r = run(startTurnStep(createDance(far)), far, 3);
  assert.ok(r.angles.r_shoulder_rot <= 90 && r.angles.r_shoulder_rot >= 85, 'the upper arm keeps its place, inside its range');
  assert.equal(r.angles.hip_rot_L, -38, 'a hip the player has turned stays where it is');
  for (const j of DANCE_JOINT_IDS) assert.ok(Number.isFinite(r.angles[j]) && Number.isFinite(r.dance.levels[j] ?? 0), `${j} stays finite`);
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

test('the game starts on the underside; a double tap is a quick switch of all four limbs to the overside and back', () => {
  const under = { ...start, ...DANCE_UNDERSIDE };
  assert.deepEqual(DANCE_UNDERSIDE, { l_forearm: -80, r_pronation: 0, leg_turn_L: 25, leg_turn_R: 25 }, 'palms up, feet 45 degrees outward (a V)');
  let d = startTurnStep(createDance(under)), a = { ...under }, t = 0;
  assert.equal(d.target, -1, 'from the underside the switch goes to the overside');
  while (d.mode === 'step' && t < 3) { d = observeDance(d, a); const r = stepDance(d, a, 1 / 120); d = r.dance; a = r.angles; t += 1 / 120; }
  assert.ok(t <= DANCE.stepStrokeS + 0.02 && DANCE.stepStrokeS <= 0.5, `a quick switch: every limb there after ${t.toFixed(3)} s`);
  assert.ok(Math.abs(a.l_forearm - 80) < 1e-6 && Math.abs(a.r_pronation - 160) < 1e-6 && Math.abs(a.leg_turn_L - -65) < 1e-6 && Math.abs(a.leg_turn_R - -65) < 1e-6, 'all four on the overside');
  const back = run(startTurnStep(d), a, 1);
  for (const j of Object.keys(DANCE_UNDERSIDE)) assert.ok(Math.abs(back.angles[j] - DANCE_UNDERSIDE[j]) < 1e-6, `${j} is back on the underside`);
});

test('limbs on different sides are brought to one side; a second double tap during a switch turns it round', () => {
  // an activation has turned the right palm down; the other three limbs are on the underside
  const mixed = { ...start, ...DANCE_UNDERSIDE, r_pronation: 160 };
  const r = run(startTurnStep(createDance(mixed)), mixed, 1);
  assert.ok(Math.abs(r.angles.r_pronation - 160) < 1e-6, 'the limb already on the overside stays');
  assert.ok(Math.abs(r.angles.l_forearm - 80) < 1e-6 && Math.abs(r.angles.leg_turn_L - -65) < 1e-6, 'the others join it');
  // a second double tap half way turns the switch round
  const under = { ...start, ...DANCE_UNDERSIDE };
  let d = startTurnStep(createDance(under)), a = { ...under };
  for (let t = 0; t < DANCE.stepStrokeS / 2; t += 1 / 120) { d = observeDance(d, a); const s2 = stepDance(d, a, 1 / 120); d = s2.dance; a = s2.angles; }
  assert.ok(a.l_forearm > -70 && a.l_forearm < 70, 'half way');
  d = startTurnStep(d);
  assert.equal(d.target, 1, 'turned round');
  const end = run(d, a, 1);
  for (const j of Object.keys(DANCE_UNDERSIDE)) assert.ok(Math.abs(end.angles[j] - DANCE_UNDERSIDE[j]) < 1e-6, `${j} went back to the underside`);
});

test('a double tap held goes on slowly between the two sides', () => {
  const under = { ...start, ...DANCE_UNDERSIDE };
  let d = startTurnStep(createDance(under)), a = { ...under };
  for (let t = 0; t < 0.1; t += 1 / 120) { d = observeDance(d, a); const s2 = stepDance(d, a, 1 / 120); d = s2.dance; a = s2.angles; }
  d = startTurnHold(d);
  let lo = Infinity, hi = -Infinity, turns = 0, last = a.r_pronation, lastDir = 0;
  for (let t = 0; t < 12; t += 1 / 60) { d = observeDance(d, a); const s2 = stepDance(d, a, 1 / 60); d = s2.dance; a = s2.angles; lo = Math.min(lo, a.r_pronation); hi = Math.max(hi, a.r_pronation); const dir = Math.sign(a.r_pronation - last); if (dir && lastDir && dir !== lastDir) turns++; if (dir) lastDir = dir; last = a.r_pronation; }
  assert.equal(d.mode, 'hold');
  assert.ok(lo < 1 && hi > 159, 'the right forearm reaches both sides');
  assert.ok(turns >= 2 && turns <= 8, `it turns round slowly (${turns} turns in 12 s)`);
});
