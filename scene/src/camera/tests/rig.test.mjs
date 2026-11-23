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

import {observedLimbPaths, poseForSelection, trackedLimbs} from '../limb-pose.mjs';

test('one packet drives both independent arms and never fills a missing side', () => {
  const p = [];
  for (const [i, x, y] of [
    [11,.6,.4],[12,.4,.4],[13,.72,.55],[15,.78,.68],[14,.30,.24],[16,.28,.09]
  ]) p[i] = {x, y, visibility: .97, z: 0};
  const select = (pts, mode, evidence = () => true) => poseForSelection(pts, 640, 480, mode, evidence);
  const right = select(p, 'rightArm'), left = select(p, 'leftArm');
  assert.ok(right.joints.r_shoulder_abd > 90);
  assert.ok(left.leftArm.bearing[1] < 0);
  assert.deepEqual(select(p, 'bothArms'), {...left, ...right});
  for (const [i, other] of [[13, right], [15, right], [14, left], [16, left]]) {
    for (const mutation of [q => delete q[i], q => { q[i].visibility = .1; }, q => { q[i].x = NaN; }, q => { q[i].y = -1; }]) {
      const packet = structuredClone(p);
      mutation(packet);
      assert.deepEqual(select(packet, 'bothArms'), other);
    }
  }
  for (const side of ['leftArm','rightArm']) {
    assert.deepEqual(select(p,'bothArms', limb => limb === side), select(p, side));
  }
  assert.equal(select(p, 'bothArms', () => false), null);
  // The shared shoulder line has to be visible for either projected arm.
  const hiddenShoulder = structuredClone(p);
  hiddenShoulder[11].visibility = 0;
  assert.equal(select(hiddenShoulder, 'bothArms'), null);
  const reversed = p.map(v => ({...v, x: 1-v.x}));
  assert.equal(select(reversed, 'bothArms'), null);
  assert.deepEqual(select(p.map(v => ({...v, z: 200})), 'bothArms'), {...left, ...right});
});

test('paired knee projections preserve each visible side and share no leg angles', () => {
  const points = [];
  for (const [i, x, y] of [
    [11,.60,.2],[12,.40,.2],[23,.58,.45],[24,.42,.45],
    [25,.70,.61],[27,.58,.77],[26,.40,.62],[28,.38,.79]
  ]) points[i] = {x, y, visibility: .95};
  const read = (points, detail = () => true) => poseForSelection(points, 640, 480, 'bothKnees', detail);
  const left = poseForLimb(points, 640, 480, 'leftLeg');
  const right = poseForLimb(points, 640, 480, 'rightLeg');
  assert.deepEqual(read(points), {joints: {...left.joints, ...right.joints}});
  for (const [index, other] of [[25,right], [27,right], [26,left], [28,left]]) {
    const missing = structuredClone(points);
    missing[index].visibility = 0.5;
    assert.deepEqual(read(missing), other);
  }
  assert.deepEqual(read(points, limb => limb === 'leftLeg'), left);
  assert.deepEqual(read(points, limb => limb === 'rightLeg'), right);
  assert.equal(read(points, () => false), null);
  const overlap = structuredClone(points);
  overlap[26] = {...overlap[25], x: overlap[25].x - 0.01};
  overlap[28] = {...overlap[27], x: overlap[27].x - 0.01};
  assert.equal(read(overlap), null);
  assert.ok(poseForLimb(overlap, 640, 480, 'leftLeg'));
  points[11].visibility = 0;
  assert.equal(read(points), null);
});

test('all four limbs share one frame, including every subset of visible limbs', () => {
  const points = [];
  for (const [i, x, y] of [
    [11,.60,.20], [12,.40,.20], [13,.75,.20], [15,.75,.04], [14,.30,.29], [16,.28,.42],
    [23,.58,.45], [24,.42,.45], [25,.70,.61], [27,.58,.77], [26,.40,.62], [28,.38,.79]
  ]) points[i] = {x,y,visibility:.95};
  const sides = ['leftArm','rightArm','leftLeg','rightLeg'];
  for (let mask = 0; mask < 16; mask++) {
    const seen = sides.filter((side,i) => mask & (1 << i));
    const expected = {}, joints = {};
    for (const side of seen) {
      const limb = poseForLimb(points,640,480,side);
      if (limb.leftArm) expected.leftArm = limb.leftArm;
      Object.assign(joints,limb.joints);
    }
    if (Object.keys(joints).length) expected.joints = joints;
    const pose = poseForSelection(points,640,480,'armsAndKnees',side => seen.includes(side));
    assert.deepEqual(pose, seen.length ? expected : null);
    assert.deepEqual(trackedLimbs(pose), seen);
    const actual = observedLimbPaths(points, pose);
    assert.deepEqual(Object.keys(actual), seen);
    for (const side of seen) {
      const ids = {leftArm:[11,13,15], rightArm:[12,14,16], leftLeg:[23,25,27], rightLeg:[24,26,28]}[side];
      assert.deepEqual(actual[side], ids.map(id => [points[id].x, points[id].y]));
    }
  }
  points[26] = points[25];
  points[28] = points[27];
  assert.deepEqual(poseForSelection(points,640,480,'armsAndKnees',() => true),
    poseForSelection(points,640,480,'bothArms',() => true));
});
