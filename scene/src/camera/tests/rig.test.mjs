import assert from 'node:assert/strict';
import test from 'node:test';
import {rightArmJoints} from '../right-arm.mjs';

function points(shoulder, elbow, wrist) {
  const points = [];
  for (const [index, [x,y]] of [[11, [0.65, 0.45]], [12, shoulder], [14, elbow], [16, wrist]]) {
    points[index] = {x,y,visibility:0.9};
  }
  return points;
}
test('camera-facing right arm motions use shoulder abduction and elbow flexion in rig degrees', () => {
  const shoulder = [0.45,0.45];
  const measure = (elbow,wrist) => rightArmJoints(points(shoulder,elbow,wrist),640,480);
  assert.deepEqual(measure([0.45,0.55],[0.45,0.68]), {r_shoulder_abd:0,r_shoulder_flex:0,r_elbow_flex:0});
  assert.deepEqual(measure([0.30,0.45],[0.30,0.25]), {r_shoulder_abd:90,r_shoulder_flex:0,r_elbow_flex:90});
  assert.deepEqual(measure([0.45,0.35],[0.45,0.20]), {r_shoulder_abd:180,r_shoulder_flex:0,r_elbow_flex:0});
});
test('missing, back-facing, off-frame, collapsed and low-visibility views release control', () => {
  const make = () => points([0.45,0.45],[0.30,0.45],[0.25,0.3]);
  for (const corrupt of [p=>delete p[12],p=>p[11].x=0.15,p=>p[16].y=-0.2,p=>p[14]=p[12],
    p=>p[14].x=0.62,p=>p[14].visibility=0.2,p=>p[14].visibility=NaN]) {
    const p = make(); corrupt(p);
    assert.equal(rightArmJoints(p,640,480), null);
  }
});

import {poseForLimb} from '../limb-pose.mjs';

test('each side uses its own projected joints with square pixels and signed game knee flexion', () => {
  const pose = [];
  for (const [index, x, y] of [
    [11, 0.6, 0.20], [12, 0.4, 0.20], [13, 0.75, 0.20], [15, 0.75, 0.0],
    [23, 0.58, 0.45], [24, 0.42, 0.45], [25, 0.7, 0.61], [27, 0.58, 0.77],
    [26, 0.40, 0.62], [28, 0.38, 0.79]
  ]) pose[index] = {x, y, visibility: 0.95};
  const project = limb => poseForLimb(pose, 640, 480, limb);
  assert.ok(Math.abs(project('leftLeg').joints.knee_ext_L + 90) < 1e-8);
  assert.ok(Math.abs(project('rightLeg').joints.knee_ext_R) < 1e-5);
  const {leftArm} = project('leftArm');
  assert.deepEqual(leftArm.upper.map(n => n || 0), [-1, 0, 0]);
  assert.ok(Math.abs(leftArm.elbowDeg - 90) < 1e-8);
  assert.ok(Math.abs(leftArm.bearing[0] + Math.SQRT1_2) < 1e-8);
  assert.ok(Math.abs(leftArm.bearing[1] - Math.SQRT1_2) < 1e-8);
  assert.equal(leftArm.bearing[2], 0);
  assert.equal(project('rightArm'), null);
  pose[27].visibility = 0.64;
  assert.equal(project('leftLeg'), null);
  assert.ok(project('rightLeg'));
  pose[24].x = pose[23].x;
  assert.equal(project('rightLeg'), null);
  assert.equal(project('toString'), null);
});

test('mirrored or reversed landmark ordering, invalid input and foreshortened segments release a knee', () => {
  const p = [];
  for (const [i, x, y] of [[11,.65,.10],[12,.35,.10],[23,.6,.4],[24,.4,.4],[26,.35,.55],[28,.4,.7]]) p[i] = {x,y,visibility:.98};
  const measure = q => poseForLimb(q, 480, 480, 'rightLeg');
  for (const mutate of [
    q => q.forEach(v => v.x = 1 - v.x),
    q => q[28].y = Infinity, q => q[28].x = '0.6', q => q[26].visibility = NaN,
    q => q[28] = {...q[26]}, q => delete q[24]
  ]) {
    const q = structuredClone(p); mutate(q);
    assert.equal(measure(q), null);
  }
  assert.equal(poseForLimb(p, -1, 480, 'rightLeg'), null);
  assert.ok(measure(p));
});
