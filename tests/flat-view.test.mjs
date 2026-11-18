/** The flat view (18 November 2026, late; the owner: "a very wide field of view, but a very narrow depth of field. So
 * things that are far away look extremely close to us"): the eye view is a longer lens from further back. Pure checks
 * of the arithmetic only: where the camera stands, the near plane just behind the eye's own plane, the lens rule, and
 * that the view from outside eases out of both without a jump. Whether the picture reads as flat, and the limb
 * widths, were judged and measured in screenshots, not here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NC = await import('../scene/src/ns-camera.mjs');
const DEG = Math.PI / 180;
const launcher = readFileSync(new URL('../scene/example/eye-view-r558.mjs', import.meta.url), 'utf8');
const num = name => Number(new RegExp(`const ${name} = (-?[\\d.]+)`).exec(launcher)[1]);

test('the launcher\'s lens is longer and its look steeper, and the camera table starts at that look', () => {
  const fov = num('EYE_FOV_Y_DEG'), pitch = num('START_LOOK_PITCH_DEG');
  assert.ok(fov >= 40 && fov <= 70, `a longer lens than the 100 degrees before (${fov})`);
  assert.ok(pitch <= -48 && pitch >= -60, `the look starts steeper than 41 down (${pitch})`);
  const rows = NC.EYE_DOLLY.byPitch;
  assert.equal(rows[rows.length - 1][0], pitch, 'the camera table\'s last row is the start look');
});

test('at the start look the camera stands behind the eye\'s own plane and the near plane is just behind the eye', () => {
  const pitch = num('START_LOOK_PITCH_DEG'), E = NC.EYE_DOLLY;
  const d = NC.eyeDolly({ yaw: 0, pitch: pitch * DEG });
  assert.ok(d.depthBackM > 0.25 && d.depthBackM < 0.6, `the camera stands ${d.depthBackM.toFixed(3)} m behind the eye`);
  assert.ok(Math.abs(d.nearM - (d.depthBackM - E.nearBehindEyeM)) < 1e-12, 'the near plane stands nearBehindEyeM behind the eye\'s plane');
  // depthBackM is the camera's distance behind the eye along the line of sight
  const g = NC.gazeDirection(0, pitch * DEG), along = -(d.offset[0] * g[0] + d.offset[1] * g[1] + d.offset[2] * g[2]);
  assert.ok(Math.abs(along - d.depthBackM) < 1e-12);
  assert.equal(d.fovScale, 1, 'the launcher\'s own angle at the start look');
  // with the look up the camera is the eye again and the near plane is the scene's own
  const up = NC.eyeDolly({ yaw: 0, pitch: 40 * DEG });
  assert.equal(up.depthBackM, 0); assert.equal(up.nearM, NC.FIRST_PERSON.nearM);
});

test('with zRefM the lens widens as the camera comes back to the eye, so things zRefM ahead keep their size', () => {
  const E = { ...NC.EYE_DOLLY, zRefM: 0.5 }, start = E.byPitch[E.byPitch.length - 1][0];
  const s = NC.eyeDolly({ yaw: 0, pitch: start * DEG }, E), u = NC.eyeDolly({ yaw: 0, pitch: 40 * DEG }, E);
  assert.ok(Math.abs(s.fovScale - 1) < 1e-12, 'the launcher\'s angle at the start look');
  assert.ok(Math.abs(u.fovScale - (0.5 + s.depthBackM) / 0.5) < 1e-12, 'a dolly zoom about zRefM');
  // continuous: a quarter degree of look changes the lens by less than half a percent
  for (let p = -85; p < 85; p += 0.25) {
    const a = NC.eyeDolly({ yaw: 0, pitch: p * DEG }, E).fovScale, b = NC.eyeDolly({ yaw: 0, pitch: (p + 0.25) * DEG }, E).fovScale;
    assert.ok(Math.abs(a - b) < 0.005 * a, `lens step at ${p}`);
  }
});

test('the first-person pose carries the lens and the near plane, and the view from outside eases out of both', () => {
  const eye = [0.01, -0.03, -0.02];
  const frame = () => ({ position: eye, bodyToWorld: [0.001, 0, 0, 0, 0, 0, -0.001, 0, 0, 0.001, 0, 0, 0, 0, 0, 1], eyeBp: [0, -158, 1513] });
  const look = { yaw: 0, pitch: num('START_LOOK_PITCH_DEG') * DEG }, d = NC.eyeDolly(look);
  const first = NC.cameraPose(NC.createCameraState({ view: 'first' }), { look, firstPersonFrame: frame });
  assert.equal(first.nearM, d.nearM); assert.equal(first.fovScale, d.fovScale);
  const moving = { ...NC.createCameraState({ view: 'third' }), progress: 1e-6 };
  const m = NC.cameraPose(moving, { look, firstPersonFrame: frame });
  assert.ok(Math.abs(m.nearM - d.nearM) < 1e-4, 'no jump of the near plane when E is pressed');
  const out = NC.cameraPose(NC.createCameraState({ view: 'third' }), { look, firstPersonFrame: frame });
  assert.equal(out.nearM, NC.FIRST_PERSON.nearM, 'from outside the near plane is the scene\'s own');
  assert.equal(out.fovScale, 1);
});

test('the mirror body\'s near view: the same mirror image, magnified about its own centre, lower, and exactly what the transform draws at rest', async () => {
  const NM = await import('../scene/src/ns-mirror.mjs');
  const body = Object.freeze({ centre: Object.freeze([0, -0.5, -0.4]), half: Object.freeze([0.3, 0.4, 0.75]), forward: Object.freeze([0, 0, -1]), right: Object.freeze([1, 0, 0]), radius: 0.9, height: 0.8 });
  const lit = NM.mirrorReflectionPlacement({ body, eye: [0, 0, 0], foremostM: 1.2 });
  const near = NM.mirrorReflectionPlacement({ body, eye: [0, 0, 0], foremostM: 1.2, view: NM.MIRROR_NEAR });
  const V = NM.MIRROR_NEAR;
  assert.equal(lit.scale, 1); assert.equal(near.scale, V.magnifyBy);
  assert.ok(Math.abs(near.centre[1] - (lit.centre[1] - V.dropM)) < 1e-12, 'lower by dropM');
  assert.equal(near.plane.distanceM, lit.plane.distanceM, 'the reflection plane itself is unchanged');
  const T = NM.mirrorTransform(NM.createMirrorState(near));
  assert.ok(NM.matrixMaxDiff(T.matrix, near.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance, 'the transform at rest is the placement');
  assert.ok(T.det < 0 && Math.abs(T.det + V.magnifyBy ** 3) < 1e-9, 'still a mirror image, magnified');
  // the shape is the reflection's, magnified about the image centre: any two points keep their mirrored offset times k
  const a = [0.1, -0.3, -0.2], b = [-0.2, -0.6, -0.9];
  const la = NM.mirrorPoint(a, NM.mirrorTransform(NM.createMirrorState(lit))), lb = NM.mirrorPoint(b, NM.mirrorTransform(NM.createMirrorState(lit)));
  const na = NM.mirrorPoint(a, T), nb = NM.mirrorPoint(b, T);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs((na[i] - nb[i]) - V.magnifyBy * (la[i] - lb[i])) < 1e-12);
});
