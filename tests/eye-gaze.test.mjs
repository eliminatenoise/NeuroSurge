/** The diagonal downward gaze of 18 November 2026 (user: "you are gazing diagonally downwards. You should be able to
 * see your own shoulders and stomach/abs"): the eyes are lowered in the head while the head is level or bowed, and
 * come back up as the head tips back. 19 November 2026 (the owner: "The camera view should be free to move wherever it
 * wants"): the view goes on past the head's own range, the eyes doing the rest, and no corner of it is closed. Pure arithmetic of ns-app's look functions; what the picture then shows was judged
 * in screenshots, not here. */
import test from 'node:test';
import assert from 'node:assert/strict';

const app = await import('../scene/src/ns-app.mjs');
const body = await import('../scene/src/ns-body.mjs');
const DEG = Math.PI / 180;
const rest = body.bodyPostureAngles(body.DEFAULT_BODY_POSTURE);
const L = app.headLookLimits(body, app.HEAD_LOOK, { neck_flex: rest.neck_flex, trunk_flex: rest.trunk_flex, neck_rot: 0, trunkFlexMaxDeg: body.bodyPostureLimits().trunk_flex[1] });
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
  // (18 November 2026, later: the pelvis roll, pelvic_tilt, is the third part of the sum)
  assert.equal((rest.pelvic_tilt || 0) + rest.trunk_flex + rest.neck_flex, 90, 'pelvis roll, trunk and neck together turn the head upright over a level pelvis');
  const h = app.headPoseForLook(look(0, -34), null, L);
  assert.ok(Math.abs(h.look.pitch / DEG + 34) < 1e-9, 'the camera looks where the controls look');
  assert.ok(Math.abs(h.headLook.pitch / DEG + 34 - L.eyeDownDeg) < 1e-9, 'the head is bowed less: the eyes do the rest');
  // (18 November 2026, later: the start posture bends the neck 40 of its 50 degrees, as the owner asked; the look adds a few)
  assert.ok(rest.neck_flex + h.joints.neck_flex <= body.BODY_JOINT_LIMITS.neck_flex[1], 'the neck stays inside its range');
  // the look still reaches well below the start and up to the camera's own stop
  // (19 November 2026: the HEAD stops where it stopped; the view itself goes on to its own limits, see the next test)
  const r = app.headLookRange(null, L, look(0, -36));
  assert.ok(r.headMinDeg <= -55 && r.headMinDeg > -88, `the head down to ${r.headMinDeg}`);
  assert.ok(r.headMaxDeg >= 84, `the head up to ${r.headMaxDeg}`);
});

test('the view is free: all the way down, up and round, the eyes going on where the head stops', () => {
  // 19 November 2026 (the owner: "The camera view should be free to move wherever it wants."; "The head should not be
  // locked."). This replaces the test of the corner that was closed up and far round to the right (HEAD_FAR_RIGHT_UP).
  assert.equal(app.HEAD_FAR_RIGHT_UP, undefined);
  for (const y of [0, 60, -60, 140, -140, -155, 180, -180]) {
    const r = app.headLookRange(null, L, look(y, 0));
    assert.equal(r.pitchMinDeg, -L.viewDownDeg, `turned ${y}: down to the view's own limit`);
    assert.equal(r.pitchMaxDeg, L.viewUpDeg, `turned ${y}: up to the view's own limit`);
    assert.ok(r.yawMinDeg <= -170 && r.yawMaxDeg >= 170, 'round to behind on both sides');
  }
  // inside the head's range the eyes add nothing and the camera looks where the controls look
  const mid = app.headPoseForLook(look(20, -40), null, L);
  assert.equal(mid.eyePitchDeg, 0);
  assert.ok(Math.abs(mid.look.pitch / DEG + 40) < 1e-9);
  // past it the head, neck and trunk stay at their ends and the camera still looks where the controls look
  const r0 = app.headLookRange(null, L, look(0, 0));
  const end = app.headPoseForLook(look(0, r0.headMinDeg), null, L), down = app.headPoseForLook(look(0, -88), null, L);
  assert.ok(Math.abs(down.look.pitch / DEG + 88) < 1e-9, 'the view reaches 88 degrees down');
  assert.ok(down.eyePitchDeg < -5, `the eyes do the rest (${down.eyePitchDeg.toFixed(1)})`);
  assert.ok(Math.abs(down.joints.neck_flex - end.joints.neck_flex) < 1e-9 && Math.abs(down.bendDeg - end.bendDeg) < 1e-9, 'the neck and trunk bend no further than before');
  assert.ok(Math.abs(down.headLook.pitch - end.headLook.pitch) < 1e-9, 'the head itself stops where it stopped');
  const up = app.headPoseForLook(look(-170, 88), null, L);
  assert.ok(Math.abs(up.look.pitch / DEG - 88) < 1e-9 && Math.abs(up.look.yaw / DEG + 170) < 1e-9, 'up and far round to the right is open');
  // no jump anywhere along the way
  let prev = null;
  for (let p = -88; p <= 88; p += 0.5) { const h = app.headPoseForLook(look(0, p), null, L).look.pitch / DEG; if (prev !== null) assert.ok(Math.abs(h - prev - 0.5) < 1e-6, `at ${p}`); prev = h; }
  // a held neck movement still moves the view (the eyes do not undo it)
  const heldNeck = app.headPoseForLook(look(0, -20), { neck_flex: 8, neck_rot: 0, trunk_flex: 0 }, L);
  assert.ok(heldNeck.look.pitch / DEG < -27 && heldNeck.eyePitchDeg === 0, 'the head jerks the view with it');
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
