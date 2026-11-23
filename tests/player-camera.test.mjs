import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCameraState, createPlayerCamera, playerCameraPose, syncView, gazeDirection, DEG } from '../scene/src/ns-camera.mjs';
import { aimJointDegrees, CONTROL_EVENT_TYPES } from '../scene/src/ns-app.mjs';

const startLook = { yaw: 0, pitch: -25.5 * DEG };
const rig = createPlayerCamera([0, 0, 0], startLook);
const first = createCameraState();

test('the eye view responds to player look and keeps its position and lens when the body moves', () => {
  const relaxed = playerCameraPose(first, rig, startLook);
  const bent = playerCameraPose(first, rig, startLook, { yaw: 0.51, pitch: -0.8 });
  assert.deepEqual(bent.gazeRay, relaxed.gazeRay);
  assert.equal(bent.fovScale, 1);
  assert.equal(bent.nearM, relaxed.nearM);

  const look = { yaw: 150 * DEG, pitch: 48 * DEG };
  const turned = playerCameraPose(first, rig, look, startLook);
  assert.deepEqual(turned.gazeRay.dir, gazeDirection(look.yaw, look.pitch));
  assert.deepEqual(turned.position, relaxed.position);
});

test('an explicit outside view uses a fixed orbit radius with no follow or zoom', () => {
  const outside = syncView(first, 'third');
  const above = playerCameraPose(outside, rig, { yaw: 0, pitch: -1.03 });
  const side = playerCameraPose(outside, rig, { yaw: 3.4, pitch: 0.4 });
  for (const pose of [above, side]) {
    const radius = Math.hypot(...pose.position.map((value, i) => value - rig.centre[i]));
    assert.ok(Math.abs(radius - rig.distanceM) < 1e-12);
    assert.equal(pose.moving, false);
    assert.equal(pose.fovScale, 1);
  }
  assert.deepEqual(above.orbitCentre, side.orbitCentre);
  assert.notDeepEqual(above.position, side.position);
});

test('moderate pitch reaches each permitted side of the neutral joint', () => {
  assert.equal(aimJointDegrees(33, -60, 180, 0), 33);
  assert.equal(aimJointDegrees(33, -60, 180, -18 * DEG), -60);
  assert.equal(aimJointDegrees(33, -60, 180, 18 * DEG), 180);
  assert.equal(aimJointDegrees(0, -30, 110, 30 * DEG), 110);
  assert.equal(aimJointDegrees(0, -30, 110, -30 * DEG), -30);
  assert.equal(aimJointDegrees(0, -30, 110, 9 * DEG), 55);
  assert.ok(CONTROL_EVENT_TYPES.includes('limbPlace'));
});
