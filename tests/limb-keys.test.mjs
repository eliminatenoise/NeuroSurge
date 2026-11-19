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

// 19 November 2026, later still: restated. The end had a set height in the picture (three quarters up); the owner:
// "Disregard that rule". The view now only keeps the end inside the picture (LIMB_KEYS.view.bandUp).
test('the view turns only as far as keeps the chosen limb\'s end in the picture', async () => {
  const { lookFramingPoint, keepInFrameTurn, viewFrameOf } = await import('../scene/src/ns-app.mjs');
  const DEG = Math.PI / 180, eye = [0, 1, 0];
  // straight ahead (the camera looks along -z), level: yaw 0; at frameUp 0.5 the look is on the point itself
  const mid = lookFramingPoint(eye, [0, 1, -2], 54, 0.5);
  assert.ok(Math.abs(mid.yaw) < 1e-12 && Math.abs(mid.pitch) < 1e-12);
  // a point to the left (-x) needs a turn to the left (positive yaw in the camera's convention)
  const left = lookFramingPoint(eye, [-2, 1, -2], 54, 0.5);
  assert.ok(Math.abs(left.yaw - 45 * DEG) < 1e-9);
  // a set height (0.6): the point stands above the middle, so the look is below it, by the angle of a tenth of the picture
  const up = lookFramingPoint(eye, [0, 1, -2], 54, 0.6);
  const want = -Math.atan((2 * 0.6 - 1) * Math.tan(27 * DEG));
  assert.ok(Math.abs(up.pitch - want) < 1e-12 && up.pitch < 0);
  assert.equal(lookFramingPoint(eye, eye, 54, 0.5), null, 'no look toward the eye itself');
  // no set height any more: only a band the end is kept inside
  const V = LIMB_KEYS.view;
  assert.equal(V.frameUp, null, 'the owner: "Disregard that rule" (the wrist or ankle three quarters up the picture)');
  assert.ok(V.bandUp >= 0.4 && V.bandUp <= 0.85 && V.band > 0.3 && V.band < 0.9);
  // an end inside the picture's band moves the view not at all
  assert.deepEqual(keepInFrameTurn({ x: 0.2, y: -0.5 }, 54, 16 / 9, V.band, V.bandUp), { dYaw: 0, dPitch: 0 });
  // an end under the band: the look goes DOWN exactly as far as brings it to the band's lower edge, and not sideways
  const pose = { position: [0, 1, 0], yaw: 0.2, pitch: -0.3 }, P = [-0.1, -0.2, -0.9];
  const f = viewFrameOf(pose, P, 54, 16 / 9), k = keepInFrameTurn(f, 54, 16 / 9, V.band, V.bandUp);
  assert.ok(f.y < -V.bandUp && Math.abs(f.x) < V.band && k.dPitch < 0 && k.dYaw === 0);
  const g = viewFrameOf({ ...pose, pitch: pose.pitch + k.dPitch }, P, 54, 16 / 9);
  assert.ok(Math.abs(g.y + V.bandUp) < 0.02, `the end comes to the band's edge (${g.y})`);
  // an end over the band: the look goes up; one far to the right: the look turns right (negative yaw) to the band's edge
  assert.ok(keepInFrameTurn({ x: 0, y: 0.9 }, 54, 16 / 9, V.band, V.bandUp).dPitch > 0);
  const side = keepInFrameTurn({ x: 0.9, y: 0 }, 54, 16 / 9, V.band, V.bandUp);
  assert.ok(side.dYaw < 0 && side.dPitch === 0);
  // a place that is not in the picture at all (behind the view) asks for no turn here (the caller turns to it)
  assert.deepEqual(keepInFrameTurn({ x: NaN, y: NaN }, 54, 16 / 9, V.band, V.bandUp), { dYaw: 0, dPitch: 0 });
});
