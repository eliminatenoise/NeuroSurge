/** A click on one of your own limbs takes control of it until the camera view is changed (19 November 2026; the owner:
 * "If we click on a limb, we now control that limb until we change the camera view"). The reading is ns-grasp
 * LIMB_CLICK and the rule for WHICH limb is controlled is limbLatchAfter: the keys move the controlled limb, the look
 * stays free, and control ends with E, with a look away, and with a click on the limb again or on nothing (ns-app
 * setLimbLatch / stepLimbLatch). Pure software state only. No browser, no pixels, nothing biological.
 * Run: node --test tests/limb-click.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { limbLatchAfter, lookAwayDeg, LIMB_CLICK } from '../scene/src/ns-grasp.mjs';
import { TIP, HUD } from '../scene/src/ns-text.mjs';

const RAD = Math.PI / 180;

test('a click on a limb takes it; it stays through Space, a pause and clicks on areas, arrows or the mirror body', () => {
  let l = limbLatchAfter(null, { type: 'click', limb: 'rightLeg' });
  assert.equal(l, 'rightLeg');
  for (const ev of [{ type: 'grasp', down: true }, { type: 'grasp', down: false }, { type: 'pause' }, { type: 'click', limb: null }, { type: 'click' }, null]) {
    l = limbLatchAfter(l, ev);
    assert.equal(l, 'rightLeg');
  }
});
test('another limb clicked is taken instead; the left arm (which the keys move anyway) lets go', () => {
  assert.equal(limbLatchAfter('rightLeg', { type: 'click', limb: 'leftLeg' }), 'leftLeg');
  assert.equal(limbLatchAfter('rightLeg', { type: 'click', limb: 'rightArm' }), 'rightArm');
  assert.equal(limbLatchAfter('rightLeg', { type: 'click', limb: 'leftArm' }), null);
  assert.equal(limbLatchAfter(null, { type: 'click', limb: 'leftArm' }), null);
  assert.equal(limbLatchAfter(null, { type: 'click', limb: 'tail' }), null);
});
test('letting go inside the eye view: a click on the controlled limb again, or a click on nothing', () => {
  assert.equal(limbLatchAfter('rightLeg', { type: 'click', limb: 'rightLeg' }), null);
  assert.equal(limbLatchAfter('rightArm', { type: 'click', nothing: true }), null);
  assert.equal(limbLatchAfter(null, { type: 'click', nothing: true }), null);
});
test('changing the view (E) and Reset body end it', () => {
  assert.equal(limbLatchAfter('rightLeg', { type: 'view' }), null);
  assert.equal(limbLatchAfter('leftLeg', { type: 'reset' }), null);
});
test('"until we change the camera view": the look turned away from where the limb was clicked or last moved ends it', () => {
  assert.equal(LIMB_CLICK.followsLook, false, 'the look is free: it does not carry a clicked limb');
  assert.ok(LIMB_CLICK.lookAwayDeg >= 15 && LIMB_CLICK.lookAwayDeg <= 27, 'more than a tremble of the pointer, less than half the picture (a 54-degree lens)');
  assert.equal(limbLatchAfter('leftLeg', { type: 'look', awayDeg: LIMB_CLICK.lookAwayDeg - 1 }), 'leftLeg');
  assert.equal(limbLatchAfter('leftLeg', { type: 'look', awayDeg: LIMB_CLICK.lookAwayDeg + 1 }), null);
  assert.equal(limbLatchAfter('leftLeg', { type: 'look', awayDeg: NaN }), 'leftLeg');
  // the two other readings, each one switch away
  assert.equal(limbLatchAfter('leftLeg', { type: 'look', awayDeg: 170 }, { followsLook: false, lookAwayDeg: null }), 'leftLeg', 'only E and clicks end it');
  assert.equal(limbLatchAfter('leftLeg', { type: 'look', awayDeg: 170 }, { followsLook: true, lookAwayDeg: 24 }), 'leftLeg', 'a limb the look carries is not let go by a look');
});
test('the angle between two looks', () => {
  assert.ok(Math.abs(lookAwayDeg({ yaw: 0, pitch: 0 }, { yaw: 30 * RAD, pitch: 0 }) - 30) < 1e-9);
  assert.ok(Math.abs(lookAwayDeg({ yaw: 0.3, pitch: -40 * RAD }, { yaw: 0.3, pitch: -15 * RAD }) - 25) < 1e-9);
  assert.ok(lookAwayDeg({ yaw: 0, pitch: -80 * RAD }, { yaw: 90 * RAD, pitch: -80 * RAD }) < 15, 'a turn while looking steeply down is a small change of view');
  assert.equal(lookAwayDeg({ yaw: 1, pitch: 0.2 }, { yaw: 1, pitch: 0.2 }), 0);
  assert.equal(lookAwayDeg(null, { yaw: 0, pitch: 0 }), 0);
});
test('the player is told which limb and what moves it, in a few words', () => {
  for (const limb of ['rightArm', 'rightLeg', 'leftLeg']) {
    const t = TIP.limbTaken(limb);
    assert.match(t.title, /^(Right|Left) (arm|leg)$/);
    assert.equal(t.hint, 'W A S D move it');
    assert.match(HUD.controllingLimb(limb), /W\/A\/S\/D move your (right|left) (hand|foot)\. Look away/);
  }
});
test('a held or controlled right arm is solved inside the shoulder range that draws whole', async () => {
  const { holdLimits, LIMB_HOLD_LIMITS } = await import('../scene/src/ns-grasp.mjs');
  const body = { r_shoulder_abd: [0, 180], r_shoulder_flex: [-60, 180], r_elbow_flex: [0, 145], hip_flex_L: [-30, 120] };
  const L = holdLimits(body, 'rightArm', { r_shoulder_abd: 8, r_shoulder_flex: 37 });
  assert.deepEqual(L.r_shoulder_abd, [0, LIMB_HOLD_LIMITS.r_shoulder_abd[1]]);
  assert.deepEqual(L.r_shoulder_flex, LIMB_HOLD_LIMITS.r_shoulder_flex.slice());
  assert.ok(L.r_shoulder_abd[1] <= 90 && L.r_shoulder_flex[1] <= 120, 'never to the arm straight up beside the head');
  assert.deepEqual(L.r_elbow_flex, [0, 145], 'the elbow keeps its whole range');
  assert.deepEqual(body.r_shoulder_abd, [0, 180], 'the body limits themselves are untouched');
  // an arm a brain movement lifted past the cap is not snapped back: it can only come in
  const far = holdLimits(body, 'rightArm', { r_shoulder_abd: 135, r_shoulder_flex: 37 });
  assert.deepEqual(far.r_shoulder_abd, [0, 135]);
  // legs have no cap
  assert.equal(holdLimits(body, 'leftLeg', {}), body);
});
