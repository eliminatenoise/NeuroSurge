/** The small details of 19 November 2026 (the owner's Messages 172 to 174): the limb turn's side lights the flexors or
 * the extensors, the fingers and toes close as the look goes down and open as it goes up, and the limb you are moving
 * pushes the other limbs out of its way, gently. Pure checks of the rules' arithmetic and of the muscle lists taken
 * from the shipped body map. They do not establish how any of it looks (tried in the browser) or anything about real
 * muscles: the lights show which muscles lie on a side of a limb, by the game's own map. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TURN_SIDES, turnSideMuscles, turnSideLevel, digitsForLook, LIMB_PUSH, rodsNearest } from '../scene/src/ns-app.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';
import { ARM_TURN } from '../scene/src/ns-dance.mjs';

test('the underside lights the flexors of all four limbs and the overside the extensors, from the body map\'s own movers', () => {
  const under = turnSideMuscles(BODY_MOTOR_MAP, 'under'), over = turnSideMuscles(BODY_MOTOR_MAP, 'over');
  // the left game arm lights through its own movements
  assert.deepEqual(under.arm.slice().sort(), ['elbow_flexion', 'grasp_close', 'wrist_flexion']);
  assert.deepEqual(over.arm.slice().sort(), ['elbow_extension', 'open_hand', 'wrist_extension']);
  const has = (list, re) => list.some(m => re.test(m));
  // the right arm and both legs through the body's own muscles, both sides of the body alike
  for (const side of ['left', 'right']) {
    assert.ok(has(under.body, new RegExp(`^${side} biceps femoris$`)) && has(under.body, new RegExp(`^${side} gastrocnemius$`)) && has(under.body, new RegExp(`^${side} flexor digitorum longus$`)), `${side} leg: back of the thigh, calf, toe flexors`);
    assert.ok(has(over.body, new RegExp(`^${side} rectus femoris$`)) && has(over.body, new RegExp(`^${side} tibialis anterior$`)) && has(over.body, new RegExp(`^${side} extensor digitorum longus$`)), `${side} leg: front of the thigh, shin, toe extensors`);
  }
  assert.ok(has(under.body, /^right brachialis$/) && has(under.body, /^right flexor carpi radialis$/) && has(under.body, /^right flexor digitorum superficialis$/));
  assert.ok(has(over.body, /^right triceps brachii$/) && has(over.body, /^right extensor carpi ulnaris$/) && has(over.body, /^right extensor digitorum$/));
  // no muscle is on both lists
  for (const m of under.body) assert.ok(!over.body.includes(m), `${m} is on one side only`);
  assert.equal(turnSideMuscles(null, 'under').body.length, 0);
});

test('the side light holds, then fades; under reduced motion it holds and goes', () => {
  const T = TURN_SIDES;
  assert.equal(turnSideLevel(0), T.level);
  assert.equal(turnSideLevel(T.holdS), T.level);
  assert.ok(Math.abs(turnSideLevel(T.holdS + T.fadeS / 2) - T.level / 2) < 1e-9);
  assert.equal(turnSideLevel(T.holdS + T.fadeS + 0.01), 0);
  assert.equal(turnSideLevel(T.holdS + T.fadeS / 2, true), T.level, 'no fade under reduced motion');
  assert.equal(turnSideLevel(T.holdS + T.fadeS + 0.01, true), 0);
  assert.ok(T.level > 0.3 && T.level < 0.9);
});

test('the fingers and toes close as the look goes down and open as it goes up, smoothly, never both', () => {
  const K = { on: true, downFromDeg: -8, downToDeg: -75, upFromDeg: 8, upToDeg: 60 };
  assert.deepEqual(digitsForLook(0, K), { close: 0, open: 0 });
  assert.deepEqual(digitsForLook(-75, K), { close: 1, open: 0 });
  assert.deepEqual(digitsForLook(-88, K), { close: 1, open: 0 });
  assert.deepEqual(digitsForLook(60, K), { close: 0, open: 1 });
  let last = 0;
  for (let p = -8; p >= -75; p -= 1) { const c = digitsForLook(p, K).close; assert.ok(c >= last && c - last < 0.03, `more and more, no step at ${p}`); last = c; }
  for (let p = -90; p <= 90; p += 3) { const d = digitsForLook(p, K); assert.ok(!(d.close > 0 && d.open > 0)); }
  assert.deepEqual(digitsForLook(-40, { ...K, on: false }), { close: 0, open: 0 });
});

test('the upper arm turns less far inward on the overside', () => {
  assert.equal(ARM_TURN.shoulder.open, 35);
  assert.ok(ARM_TURN.shoulder.closed <= -10 && ARM_TURN.shoulder.closed >= -20, 'between 10 and 20 degrees inward (it was 65, then 25)');
});

test('two rods: their nearest points and distance', () => {
  // crossing at right angles, 0.1 apart
  let q = rodsNearest([0, 0, 0], [1, 0, 0], [0.5, 0.1, -1], [0.5, 0.1, 1]);
  assert.ok(Math.abs(q.d - 0.1) < 1e-12 && Math.abs(q.t - 0.5) < 1e-12);
  assert.deepEqual(q.c1.map(v => Math.round(v * 1e9) / 1e9), [0.5, 0, 0]);
  // parallel
  q = rodsNearest([0, 0, 0], [1, 0, 0], [0, 0.2, 0], [1, 0.2, 0]);
  assert.ok(Math.abs(q.d - 0.2) < 1e-12);
  // end to end
  q = rodsNearest([0, 0, 0], [1, 0, 0], [1.3, 0.4, 0], [2, 0.4, 0]);
  assert.ok(Math.abs(q.d - 0.5) < 1e-12 && q.t === 0);
  // a point and a rod
  q = rodsNearest([0, 1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0]);
  assert.ok(Math.abs(q.d - 1) < 1e-12 && Math.abs(q.t - 0.5) < 1e-12);
});

test('the push is gentle: a walking pace at most, rods a little inside the limbs', () => {
  assert.equal(LIMB_PUSH.on, true);
  assert.ok(LIMB_PUSH.maxStepM * 60 <= 1.0, 'under a metre a second at 60 frames a second: a pushed limb cannot jump');
  assert.ok(LIMB_PUSH.radiusM.arm[0] > LIMB_PUSH.radiusM.arm[1] && LIMB_PUSH.radiusM.leg[0] > LIMB_PUSH.radiusM.leg[1]);
  assert.ok(LIMB_PUSH.radiusM.leg[0] <= 0.1 && LIMB_PUSH.radiusM.arm[1] >= 0.03);
});
