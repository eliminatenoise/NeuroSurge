/** The look's range since 17 November 2026 (user: "make sure the neck has extreme range of motion, so any part of
 * the body is available from first person view", together with "does not result in impossible ranges of motions"):
 * past the end of the neck's and chest's turn the eyes turn the rest of the way, so the look reaches all the way round
 * while the drawn neck and chest stay inside their own ranges. Pure angle checks on ns-app's head functions; no
 * browser, no anatomy validation (the ranges are the game's own display choices). */
import test from 'node:test';
import assert from 'node:assert/strict';

test('past the head\'s end the eyes turn: the look reaches 180 degrees each way and the neck stays in its range', async () => {
  const { headPoseForLook, headLookRange, headLookLimits, HEAD_LOOK } = await import('../scene/src/ns-app.mjs');
  const body = await import('../scene/src/ns-body.mjs');
  const L = headLookLimits(body, HEAD_LOOK);
  const DEG = Math.PI / 180;
  const r = headLookRange(null, L, { yaw: 0, pitch: 0 });
  assert.equal(r.yawMaxDeg, L.neckRotDeg + L.twistDeg + L.eyeYawDeg);
  assert.equal(r.yawMinDeg, -r.yawMaxDeg);
  assert.ok(r.yawMaxDeg >= 175, 'the look reaches (about) straight behind');
  for (const yawDeg of [-180, -150, -121, -60, 0, 60, 121, 150, 180]) {
    const h = headPoseForLook({ yaw: yawDeg * DEG, pitch: 0 }, null, L);
    assert.ok(Math.abs(h.joints.neck_rot) <= L.neckRotDeg + 1e-9 && Math.abs(h.twistDeg) <= L.twistDeg + 1e-9, 'the neck and chest stay inside their ranges');
    // 19 November 2026: a look no longer turns the chest; the eyes take the chest's share of the turn as well
    assert.equal(h.twistDeg, 0, 'a look does not turn the chest');
    assert.ok(Math.abs(h.eyeYawDeg) <= L.eyeYawDeg + L.twistDeg + 1e-9);
    assert.ok(Math.abs(h.joints.neck_rot + h.twistDeg + h.eyeYawDeg - yawDeg) < 1e-6, 'neck + chest + eyes make the whole look');
    const d = ((h.look.yaw / DEG - yawDeg + 540) % 360) - 180;
    assert.ok(Math.abs(d) < 1e-6, `the camera looks where the look points (${yawDeg})`);
    if (Math.abs(yawDeg) <= L.neckRotDeg) assert.equal(h.eyeYawDeg, 0, 'the eyes stay straight while the head can still turn');
  }
  assert.ok(L.maxDownDeg >= 85 && L.maxDownDeg < 90 && L.maxUpDeg >= 80 && L.maxUpDeg < 90, 'nearly straight down and up, never exactly');
});
