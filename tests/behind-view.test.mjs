/** The view from behind (key E) for the lying body (18 November 2026: the body now lies stretched out ahead of the
 * eyes, and the view that was framed for an upright body showed it as a small shape under the back of the brain). The
 * camera stands behind and to the right of the body and always looks through a point fixed over the body's middle; the
 * look carries it round the body. Pure checks of ns-camera's arithmetic: where the camera stands and faces for a look, that
 * it turns with the head, and that the eye view is untouched. No browser, no picture: whether the posture reads well
 * from there was judged in screenshots, not here. */
import test from 'node:test';
import assert from 'node:assert/strict';

const NC = await import('../scene/src/ns-camera.mjs');
const DEG = Math.PI / 180;
const third = NC.createCameraState({ view: 'third' }), first = NC.createCameraState({ view: 'first' });
const pose = (state, yawDeg, pitchDeg) => NC.cameraPose(state, { look: { yaw: yawDeg * DEG, pitch: pitchDeg * DEG } });

test('from outside, the camera stands straight behind the head on the body\'s midline and looks down along the body', () => {
  // 19 November 2026 (the owner: "For third-person view, the head should not be shifted to the right ... It should just
  // start off in the middle."): this test asked for a camera 15 to 90 degrees round to one side; that is withdrawn.
  const T = NC.THIRD_PERSON;
  assert.equal(T.followHead, true);
  assert.equal(T.followBody, true);
  assert.equal(T.followYawDeg, 0, 'square on from behind: the head is in the middle at a neutral look');
  assert.ok(T.followOffsetM[2] < 0, 'the centre lies ahead of the eyes: over the body');
  const p = pose(third, 0, -24);
  assert.ok(p.thirdPerson && !p.firstPerson);
  // looking along -z: +x is the player's right, +z is behind the eyes
  assert.ok(Math.abs(p.position[0]) < 1e-9, `on the midline (${p.position[0].toFixed(3)} m)`);
  assert.ok(p.position[2] > 0.3, `behind the head (${p.position[2].toFixed(2)} m)`);
  assert.ok(p.position[1] > 0.5, `above it (${p.position[1].toFixed(2)} m)`);
  assert.ok(Math.abs(p.yaw) < 1e-12, 'facing the way the body faces');
  assert.ok(Math.abs(p.pitch - (-24 + T.followPitchBiasDeg) * DEG) < 1e-12 && p.pitch < -35 * DEG, 'looking down along the lying body, not across it');
  // the camera looks straight through the orbit centre
  const c = p.orbitCentre, d = p.direction, v = [c[0] - p.position[0], c[1] - p.position[1], c[2] - p.position[2]], l = Math.hypot(...v);
  assert.ok(Math.abs(v[0] / l - d[0]) < 1e-9 && Math.abs(v[1] / l - d[1]) < 1e-9 && Math.abs(v[2] / l - d[2]) < 1e-9);
  assert.ok(Math.abs(l - T.distanceM) < 1e-9, 'at the boom length while nothing is in the way');
  assert.equal(p.viewFovYDeg, T.followFovYDeg);
});

test('from outside, the body stays in the middle of the picture wherever the look goes', () => {
  const T = NC.THIRD_PERSON, c0 = pose(third, 0, -34).orbitCentre;
  for (const [yaw, pitch] of [[-180, -34], [-75, 20], [50, -60], [120, 0], [180, 80]]) {
    const p = pose(third, yaw, pitch), c = p.orbitCentre;
    // the centre does not move with the look (the body does not turn) ...
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(c[k] - c0[k]) < 1e-12, `look ${yaw}/${pitch}: the centre stays over the body`);
    // ... and the camera always faces it
    const d = p.direction, v = [c[0] - p.position[0], c[1] - p.position[1], c[2] - p.position[2]], l = Math.hypot(...v);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(v[k] / l - d[k]) < 1e-9, `look ${yaw}/${pitch}: the camera faces the centre`);
    assert.ok(p.pitch <= T.followMaxPitchDeg * DEG + 1e-12, 'never far under the body');
    assert.ok(p.yaw >= T.followYawMinDeg * DEG - 1e-12 && p.yaw <= T.followYawMaxDeg * DEG + 1e-12, 'never round to the brain beyond the feet');
  }
  // at a neutral turn the camera is straight behind the head, looking along the body
  const b = pose(third, 0, -10);
  assert.ok(Math.abs(b.yaw) < 1e-12 && b.position[2] > c0[2] + 1 && Math.abs(b.position[0] - c0[0]) < 1e-9);
});

test('the eye view is untouched: the camera sits at the eye and faces the look', () => {
  const p = pose(first, 30, -20);
  assert.ok(p.firstPerson && p.blend === 0 && !p.viewFovYDeg);
  assert.deepEqual(p.position, [0, 0, 0]);
  assert.equal(p.yaw, 30 * DEG);
  assert.equal(p.pitch, -20 * DEG);
});
