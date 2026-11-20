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
