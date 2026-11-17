/** The diagonal downward gaze of 18 November 2026 (user: "you are gazing diagonally downwards. You should be able to
 * see your own shoulders and stomach/abs"): the eyes are lowered in the head while the head is level or bowed, and
 * come back up as the head tips back; and the corner of the look up and far round to the right is closed (the left
 * game arm cannot follow there). Pure arithmetic of ns-app's look functions; what the picture then shows was judged
 * in screenshots, not here. */
import test from 'node:test';
import assert from 'node:assert/strict';

const app = await import('../scene/src/ns-app.mjs');
const body = await import('../scene/src/ns-body.mjs');
const DEG = Math.PI / 180;
const rest = body.bodyPostureAngles(body.DEFAULT_BODY_POSTURE);
const L = app.headLookLimits(body, app.HEAD_LOOK, { neck_flex: rest.neck_flex, trunk_flex: rest.trunk_flex, neck_rot: 0 });
const look = (y, p) => ({ yaw: y * DEG, pitch: p * DEG });

test('without a posture the eyes are not lowered: the look is the head, as before', () => {
  assert.equal(app.HEAD_LOOK.eyeDownDeg, 0);
  for (const p of [-60, -20, 0, 30, 70]) {
    assert.equal(app.headPitchForLook(p, app.HEAD_LOOK), p);
    assert.equal(app.eyeDownForHead(p, app.HEAD_LOOK), 0);
    const h = app.headPoseForLook(look(0, p));
    assert.ok(Math.abs(h.look.pitch - h.headLook.pitch) < 1e-12);
  }
});

test('in the reclined posture the eyes are lowered while the head is level or bowed, and come up as it tips back', () => {
  const E = body.POSTURE_EYES;
  assert.ok(E.downDeg >= 15 && E.downDeg <= 30, 'a comfortable downward gaze');
  assert.equal(L.eyeDownDeg, E.downDeg);
  assert.equal(app.eyeDownForHead(-30, L), E.downDeg);
  assert.equal(app.eyeDownForHead(0, L), E.downDeg);
  assert.equal(app.eyeDownForHead(E.endAtHeadUpDeg, L), 0);
  assert.equal(app.eyeDownForHead(80, L), 0);
  // look = head - eyes, and headPitchForLook is its exact inverse; both rise all the way (no jump, no dead zone)
  let prevHead = -Infinity;
  for (let p = -80; p <= 85; p += 2.5) {
    const h = app.headPitchForLook(p, L);
    assert.ok(Math.abs(h - app.eyeDownForHead(h, L) - p) < 1e-9, `look ${p}`);
    assert.ok(h > prevHead, 'the head always moves the way the look moves');
    prevHead = h;
  }
});

test('the game starts with the pelvis and legs level and the gaze diagonally down, the head only part of the way', () => {
  assert.equal(rest.trunk_flex + rest.neck_flex, 90, 'trunk and neck together turn the head upright over a level pelvis');
  const h = app.headPoseForLook(look(0, -34), null, L);
  assert.ok(Math.abs(h.look.pitch / DEG + 34) < 1e-9, 'the camera looks where the controls look');
  assert.ok(Math.abs(h.headLook.pitch / DEG + 34 - L.eyeDownDeg) < 1e-9, 'the head is bowed less: the eyes do the rest');
  assert.ok(rest.neck_flex + h.joints.neck_flex < body.BODY_JOINT_LIMITS.neck_flex[1] - 10, 'the chin is not pressed on the chest');
  // the look still reaches well below the start and up to the camera's own stop
  const r = app.headLookRange(null, L, look(0, -36));
  assert.ok(r.pitchMinDeg <= -55 && r.pitchMinDeg > -88, `down to ${r.pitchMinDeg}`);
  assert.ok(r.pitchMaxDeg >= 84, `up to ${r.pitchMaxDeg}`);
});

test('up and far round to the right the look is closed off, and nowhere else', () => {
  const C = app.HEAD_FAR_RIGHT_UP, up = y => app.headLookRange(null, L, look(y, 0)).pitchMaxDeg;
  assert.ok(up(0) >= 84 && up(C.fromYawDeg) >= 84 && up(180) >= 84 && up(150) >= 84);
  assert.ok(Math.abs(up(C.endYawDeg) - C.maxUpDeg) < 1e-9);
  // (third pass: the limit comes down between fromYawDeg and endYawDeg and stays at maxUpDeg from there to straight behind)
  const mid = (C.fromYawDeg + C.endYawDeg) / 2;
  assert.ok(up(mid) < up(C.fromYawDeg) && up(mid) > up(C.endYawDeg), 'the limit comes down gradually');
  assert.ok(Math.abs(up(-180) - C.maxUpDeg) < 1e-9 && Math.abs(up(-170) - C.maxUpDeg) < 1e-9, 'closed all the way to straight behind');
  assert.equal(app.headLookRange(null, app.HEAD_LOOK, look(-110, 0)).pitchMaxDeg, app.headLookRange(null, app.HEAD_LOOK, look(110, 0)).pitchMaxDeg, 'not without a posture: left and right alike');
});

test('the held trunk turn, trunk side bend and neck side bend are handed on to whoever places the eye', () => {
  const none = app.headPoseForLook(look(10, -20), null, L);
  assert.deepEqual(none.carry, { trunk_rot: 0, trunk_side: 0, neck_side: 0 });
  const held = app.headPoseForLook(look(10, -20), { trunk_rot: -45, trunk_side: 12, neck_side: -7, neck_flex: 0, neck_rot: 0, trunk_flex: 0 }, L);
  assert.deepEqual(held.carry, { trunk_rot: -45, trunk_side: 12, neck_side: -7 });
  // the look itself (the camera's direction) and the neck's own angles do not change with them
  assert.equal(held.look.yaw, none.look.yaw);
  assert.equal(held.look.pitch, none.look.pitch);
  assert.deepEqual(held.joints, none.joints);
  assert.deepEqual([...app.HEAD_CARRY_JOINTS], ['trunk_rot', 'trunk_side', 'neck_side']);
});
