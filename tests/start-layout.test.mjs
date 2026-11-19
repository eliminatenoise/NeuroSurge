/** The start layout of 19 November 2026: the mirror body toe to toe with you at your own size (the owner's later note
 * of that day; it stood in the hollow of the motor strip for a few hours), the left hand resting low for looks above
 * the start look, and your own body ending cleanly at the collar in the eye view. Pure numbers and rules only. No browser, no pixels (the pictures are in the package notes), nothing
 * biological.
 * Run: node --test tests/start-layout.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handRestNdc, HAND_REST, HAND_Y_NDC, GAME_ARM_OPTIONS } from '../scene/src/ns-app.mjs';
import { EYE_COLLAR, EYE_NECK } from '../scene/src/ns-scene-three.mjs';
import * as NC from '../scene/src/ns-camera.mjs';
import * as NM from '../scene/src/ns-mirror.mjs';

const DEG = Math.PI / 180;
const launcher = readFileSync(new URL('../scene/example/eye-view-r558.mjs', import.meta.url), 'utf8');
const num = name => Number(new RegExp(`${name} = (-?[\\d.]+)`).exec(launcher)[1]);
const fov = num('EYE_FOV_Y_DEG'), start = num('START_LOOK_PITCH_DEG') * DEG, tanHalf = Math.tan(fov * DEG / 2);

test('at and below the start look the left hand keeps its place in the picture', () => {
  for (const d of [0, -5, -20, -60]) assert.deepEqual(handRestNdc(start + d * DEG, start, tanHalf), { yNdc: HAND_Y_NDC, xAddNdc: 0 });
});

test('for looks above the start look the hand stays where it was in the room, then follows along the lower edge, out to the left', () => {
  const a0 = Math.atan(HAND_Y_NDC * tanHalf);
  let prevY = HAND_Y_NDC, prevX = 0;
  for (let up = 0.5; up <= 110; up += 0.5) {
    const r = handRestNdc(start + up * DEG, start, tanHalf);
    assert.ok(r.yNdc <= prevY + 1e-12 && r.yNdc >= HAND_REST.lowNdc - 1e-12, `never rises with the look, never under the edge (${up})`);
    assert.ok(r.xAddNdc <= prevX + 1e-12 && r.xAddNdc <= 0, 'slides only to the left');
    // while it is above the lower edge its direction in the room is the start one: the angle under the line of sight grows by the look's own rise
    if (r.yNdc > HAND_REST.lowNdc + 1e-9) assert.ok(Math.abs(Math.atan(r.yNdc * tanHalf) - (a0 - up * DEG)) < 1e-9);
    assert.ok(Math.abs(r.yNdc - prevY) < 0.04 && Math.abs(r.xAddNdc - prevX) < 0.04, 'no jump');
    prevY = r.yNdc; prevX = r.xAddNdc;
  }
  const far = handRestNdc(start + 40 * DEG, start, tanHalf);
  assert.equal(far.yNdc, HAND_REST.lowNdc);
  assert.ok(Math.abs(GAME_ARM_OPTIONS.xNdcStart + far.xAddNdc - HAND_REST.xUpNdc) < 1e-12, 'at the left corner while the look is on the strip');
  assert.ok(Math.abs(HAND_REST.lowNdc) < 0.96 && Math.abs(HAND_REST.xUpNdc) < 0.96, 'inside the arm fit\'s own screen margins');
});

// 19 November 2026, later (the owner: "let's have the mirror body so close that the toes are almost touching and they're
// level, of course."). This test used to pin the mirror body in the hollow of the strip: 0.3 m above the reflection's
// own height, at 0.46 of its size, tilted 22 degrees toward you. The owner has withdrawn that: the mirror body is the
// literal reflection again, at your own size, on your own level, its toes a hand's breadth from yours.
test('the mirror body is the literal reflection: your own size, level with you, toe to toe', () => {
  const V = NM.MIRROR_NEAR;
  assert.equal(V.magnifyBy, 1, 'your own size');
  assert.equal(V.dropM, 0, 'level with you');
  assert.equal(V.nearerM, 0);
  assert.equal(V.tiltDeg, 0, 'not tilted');
  assert.ok(NM.MIRROR_REFLECTION.clearanceM > 0 && NM.MIRROR_REFLECTION.clearanceM <= 0.08, 'the mirror plane stands a few centimetres beyond your toes');
  const body = Object.freeze({ centre: Object.freeze([0, -0.5, -0.4]), half: Object.freeze([0.3, 0.4, 0.75]), forward: Object.freeze([0, 0, -1]), right: Object.freeze([1, 0, 0]), radius: 0.9, height: 0.8 });
  const p = NM.mirrorReflectionPlacement({ body, eye: [0, 0, 0], foremostM: 1.2, view: V });
  // the placement IS the plane reflection, entry for entry
  assert.ok(NM.matrixMaxDiff(p.matrix, p.pureMatrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
  assert.equal(p.scale, 1);
  const rest = NM.mirrorTransform(NM.createMirrorState(p));
  assert.equal(rest.orbit.pitch, 0, 'no arrow has been pressed at the start');
  assert.ok(NM.matrixMaxDiff(rest.matrix, p.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
  assert.equal(rest.standBackM, 0);
  assert.ok(rest.det < 0, 'a mirror image');
  // toe to toe: your foremost point (1.2 m ahead) and its image are twice the plane's clearance apart, at the same height
  const toe = [0.1, -0.9, -1.2], image = NM.mirrorPoint(toe, rest);
  assert.ok(Math.abs(image[0] - toe[0]) < 1e-9 && Math.abs(image[1] - toe[1]) < 1e-9, 'the same height and side: level');
  assert.ok(Math.abs((toe[2] - image[2]) - 2 * NM.MIRROR_REFLECTION.clearanceM) < 1e-9, 'the toes almost touch');
  // Reset puts it back there
  const turned = NM.mirrorTransform(NM.resetMirror({ ...NM.createMirrorState(p), orbit: { yaw: 40, pitch: -30, push: 0 } }));
  assert.ok(NM.matrixMaxDiff(turned.matrix, p.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
});

test('your own body ends at the collar in the eye view: no neck is drawn, the near plane cuts nothing, and the cap closes the box\'s floor', () => {
  assert.equal(EYE_NECK.minCameraM, null);
  assert.equal(NC.EYE_DOLLY.nearBehindEyeM, null);
  const B = EYE_COLLAR.box, C = EYE_COLLAR.cap;
  assert.ok(B.xMm[0] < 0 && B.xMm[1] > 0 && B.yMm[0] < B.yMm[1]);
  // the cap's top stands above the floor of the box (it shows through the cut) and its middle lies under it (its rim is buried)
  assert.ok(C.centreMm[2] + C.radiiMm[2] > B.zFromMm && C.centreMm[2] < B.zFromMm);
  // where the cap crosses the floor it is still wide enough to cover the neck's own outline (about 60 mm either side)
  const k = Math.sqrt(1 - ((B.zFromMm - C.centreMm[2]) / C.radiiMm[2]) ** 2);
  assert.ok(C.radiiMm[0] * k > 45 && C.radiiMm[1] * k > 35);
  // and it lies inside the box sideways and front to back, so nothing of it is where the body is drawn whole
  assert.ok(C.centreMm[0] - C.radiiMm[0] > B.xMm[0] && C.centreMm[0] + C.radiiMm[0] < B.xMm[1] && C.centreMm[1] - C.radiiMm[1] > B.yMm[0] && C.centreMm[1] + C.radiiMm[1] < B.yMm[1]);
});

test('the outside view stands straight behind, near enough for a large body and wide enough for the strip, the mirror body and your body together', () => {
  // (19 November 2026, after a second check: at 3.0 m your body and the mirror body were half the size they had on the
  // lead branch; this test wanted 2.5 m or more and is changed with the camera.)
  const T = NC.THIRD_PERSON;
  assert.equal(T.followYawDeg, 0, 'head on the midline');
  assert.ok(T.distanceM >= 1.4 && T.distanceM <= 2.0, 'near: your body about 380 px tall at 1600x900');
  assert.ok(T.followOffsetM[2] <= -0.8, 'the camera aims at a point over your legs, not at your head');
  assert.ok(T.followFovYDeg >= 66 && T.followFovYDeg <= 80);
});

// 19 November 2026, later: this test used to want the mirror body 1.8 times larger and 0.6 m lower from outside (it
// stood small in the strip's hollow in the eye view). With the mirror body at your own size and level in the eye view
// that would make it 1.8 times your size and under the ground, so from outside it is now the same body: same size,
// same height. (It still slides away with the camera, ns-mirror MIRROR_OUTSIDE awayM, as the owner asked on 12 November.)
test('from outside the mirror body keeps its size and its height, and a carried one keeps its place', async () => {
  const M = await import('../scene/src/ns-mirror.mjs');
  assert.equal(M.MIRROR_OUTSIDE.magnifyBy, 1, 'your own size from outside too');
  assert.equal(M.MIRROR_OUTSIDE.dropM, 0, 'level from outside too');
  assert.ok(M.MIRROR_OUTSIDE.awayM > 0 && M.MIRROR_OUTSIDE.maxM >= M.MIRROR_OUTSIDE.awayM);
  const body = { centre: [0, -0.6, -0.5], half: [0.3, 0.5, 0.7] };
  const placement = M.mirrorReflectionPlacement({ body, eye: [0, 0, 0], foremostM: 1.24, view: M.MIRROR_NEAR });
  const s0 = M.placeMirror(M.createMirrorState(), placement);
  const eye = M.mirrorTransform(s0), half = M.mirrorTransform({ ...s0, viewOutside: 0.5 }), out = M.mirrorTransform({ ...s0, viewOutside: 1 });
  assert.equal(eye.scale, placement.scale);
  for (const t of [half, out]) {
    assert.equal(t.scale, placement.scale);
    assert.deepEqual(Array.from(t.matrix), Array.from(eye.matrix), 'the view alone changes nothing');
  }
  assert.ok(out.det < 0, 'still a mirror image');
  // carried: it stays where it was put, in both views
  const carried = { ...s0, placement: Object.freeze({ ...placement, worldCentre: [0.4, -0.2, -1.8] }) };
  const cOut = M.mirrorTransform({ ...carried, viewOutside: 1 });
  assert.deepEqual(Array.from(cOut.centre), [0.4, -0.2, -1.8]);
  assert.equal(cOut.scale, placement.scale);
});
