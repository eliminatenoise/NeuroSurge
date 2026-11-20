/** 20 November 2026 (hunt 5): the look the outside camera follows (ns-camera followReach). From outside the camera
 * stopped (pitch +5 degrees, yaw +-130) while the look ran on to the eye view's own +-88 / +-170 degrees: the mouse then
 * did nothing for a while on the way back, and E opened the eye view on the black room above the brain. The app now
 * keeps the look inside followReach().look while the view is outside. Pure checks of the arithmetic: inside the range
 * every look moves the camera, and the range's ends are where cameraPose's camera stops. */
import test from 'node:test';
import assert from 'node:assert/strict';

const NC = await import('../scene/src/ns-camera.mjs');
const DEG = Math.PI / 180;
const third = NC.createCameraState({ view: 'third' });
const pose = (yawDeg, pitchDeg) => NC.cameraPose(third, { look: { yaw: yawDeg * DEG, pitch: pitchDeg * DEG } });

test('the outside camera\'s reach follows THIRD_PERSON: look pitch -66..19, yaw -130..130 degrees', () => {
  const T = NC.THIRD_PERSON, R = NC.followReach();
  assert.ok(R && R.look && R.camera);
  assert.equal(R.camera.pitchMaxDeg, Math.min(T.followMaxPitchDeg, T.maxPitchDeg));
  assert.equal(R.camera.pitchMinDeg, T.followMinPitchDeg);
  assert.equal(R.look.pitchMaxDeg, R.camera.pitchMaxDeg - T.followPitchBiasDeg);
  assert.equal(R.look.pitchMinDeg, T.followMinPitchDeg - T.followPitchBiasDeg);
  assert.equal(R.look.yawMinDeg, T.followYawMinDeg - T.followYawDeg);
  assert.equal(R.look.yawMaxDeg, T.followYawMaxDeg - T.followYawDeg);
  assert.ok(R.look.pitchMaxDeg > 0 && R.look.pitchMaxDeg < 45, `up to ${R.look.pitchMaxDeg} degrees: the eye view comes back on the brain, not the black room above it`);
  assert.equal(NC.followReach({ followBody: false }), null, 'the older orbit camera keeps its own pitch range');
});

test('inside the reach every look moves the outside camera; past its ends the camera stands still', () => {
  const L = NC.followReach().look, eps = 0.5;
  for (const [axis, lo, hi] of [['pitch', L.pitchMinDeg, L.pitchMaxDeg], ['yaw', L.yawMinDeg, L.yawMaxDeg]]) {
    const at = v => (axis === 'pitch' ? pose(0, v) : pose(v, -20));
    let prev = at(lo);
    for (let v = lo + 2; v <= hi; v += 2) {
      const p = at(v);
      assert.ok(Math.abs(p[axis] - prev[axis]) > 1e-4, `${axis} ${v}: the camera turns with the look`);
      prev = p;
    }
    for (const [end, past] of [[hi, hi + 20], [lo, lo - 20]]) {
      const a = at(end), b = at(past);
      assert.ok(Math.abs(a[axis] - b[axis]) < 1e-9 && a.position.every((x, k) => Math.abs(x - b.position[k]) < 1e-9), `${axis} past ${end}: the camera has stopped`);
      const inside = at(end + (end === hi ? -eps : eps));
      assert.ok(Math.abs(inside[axis] - a[axis]) > 1e-4, `${axis} just inside ${end}: still moving`);
    }
  }
});
