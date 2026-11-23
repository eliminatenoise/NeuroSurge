import assert from 'node:assert/strict';
import test from 'node:test';
import {poseForFollow} from '../scene/src/camera/limb-take.mjs';

const leftArm = {bearing:[-.7,.5,0], upper:[-.6,.45,0], elbowDeg:54};
const rightArm = {r_shoulder_abd:45, r_shoulder_flex:0, r_elbow_flex:65};
const knees = {knee_ext_L:-25, knee_ext_R:-66};

test('each body follow choice keeps only the requested tracked channels', () => {
  const raw = {leftArm, joints:{...rightArm,...knees, spine_lateral:12}};
  for (const [selection, expected] of Object.entries({
    leftArm: {leftArm},
    rightArm: {joints:rightArm},
    bothArms: {leftArm, joints:rightArm},
    leftLeg: {joints:{knee_ext_L:-25}},
    rightLeg: {joints:{knee_ext_R:-66}},
    bothKnees: {joints:knees},
    armsAndKnees: {leftArm, joints:{...rightArm,...knees}},
    none: null,
  })) {
    assert.deepEqual(poseForFollow(raw,selection), expected, selection);
  }
});

test('switching choices preserves the still-active channels without driving a new limb from stale data', () => {
  const raw = {leftArm, joints:{...rightArm,...knees}};
  const right = poseForFollow(raw,'rightArm');
  assert.deepEqual(poseForFollow(right,'armsAndKnees'),right);
  assert.equal(poseForFollow(right,'leftArm'),null);
  assert.equal(poseForFollow(raw,'constructor'),null);
  assert.equal(poseForFollow(null,'armsAndKnees'),null);
  assert.deepEqual(poseForFollow(raw,'bothArms').joints,rightArm);
});

test('an incomplete arm does not release another visible limb', () => {
  const partial = {leftArm, joints:{r_elbow_flex:45,knee_ext_L:-20}};
  assert.deepEqual(poseForFollow(partial,'armsAndKnees'),{leftArm,joints:{knee_ext_L:-20}});
  assert.equal(poseForFollow(partial,'rightArm'),null);
  const stable = poseForFollow(partial,'leftArm');
  stable.leftArm.bearing[0] = 0;
  assert.equal(leftArm.bearing[0],-.7);
});
