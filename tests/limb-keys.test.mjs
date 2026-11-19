/** The limb keys of 19 November 2026 (the owner: "your left arm using 1, your left leg using 2, your right leg using 3,
 * your right arm using 4 ... double clicking will shift you from left to right, and when you get all the way to right,
 * then right to left ... you start off on 1"). Pure checks of the constants and of the double click's order; what the
 * keys do in the game was tried in the browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMB_KEYS, nextLimbChoice } from '../scene/src/ns-app.mjs';
import { LIMB_CHAIN } from '../scene/src/ns-grasp.mjs';

test('1 to 4 are the left arm, the left leg, the right leg and the right arm, left to right across the body', () => {
  assert.equal(LIMB_KEYS.on, true);
  assert.deepEqual([...LIMB_KEYS.order], ['leftArm', 'leftLeg', 'rightLeg', 'rightArm']);
  assert.deepEqual([...LIMB_KEYS.names], ['Left arm', 'Left leg', 'Right leg', 'Right arm']);
  // every limb but the left arm (the game arm, its own rig) is a chain the solver can move
  for (const limb of LIMB_KEYS.order) if (limb !== 'leftArm') assert.ok(LIMB_CHAIN[limb], `${limb} has a chain`);
});

test('a double click steps 1, 2, 3, 4 and back 3, 2, 1, and so on', () => {
  let n = 1, d = 1;
  const seen = [n];
  for (let i = 0; i < 12; i++) { [n, d] = nextLimbChoice(n, d, 4); seen.push(n); }
  assert.deepEqual(seen, [1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1]);
  assert.deepEqual(nextLimbChoice(4, 1, 4), [3, -1], 'it turns round at the right end');
  assert.deepEqual(nextLimbChoice(1, -1, 4), [2, 1], 'and at the left end');
  assert.deepEqual(nextLimbChoice(NaN, 1, 4), [2, 1], 'a bad value counts as the start');
});

test('a held double click steps slowly: slower than a double click can be repeated', () => {
  assert.ok(LIMB_KEYS.holdStepS >= 0.5 && LIMB_KEYS.holdStepS <= 1.2);
  assert.ok(LIMB_KEYS.holdStartS * 1000 > LIMB_KEYS.doubleClickMs, 'the hold begins after the double click itself is over');
  assert.ok(LIMB_KEYS.flashS >= LIMB_KEYS.holdStepS, 'each limb is still lit when the next step comes');
});
