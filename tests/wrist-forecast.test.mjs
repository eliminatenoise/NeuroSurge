import assert from 'node:assert/strict';
import test from 'node:test';
import {exampleTake, horizons, wristFrames, wristObservation, wristTrend} from '../scene/src/camera/wrist-forecast/forecast.mjs';
import {observedWrists} from '../scene/src/camera/limb-pose.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, actual + ' vs ' + expected);
const linear = t => [t * .0005 - .2, .3 - t * .00024];
const trajectory = times => wristFrames({frames: times.map(time => ({time, wrists: {leftArm: linear(time)}}))});

test('forecast and replay use a shared physical-time anchor for jittered frames', () => {
  const rows = trajectory([68, 117, 172, 219, 281, 369, 489, 547, 609, 701, 781, 854]);
  const i = 4, trend = wristTrend(rows, i, 'leftArm');
  assert.equal(trend.count, 5);
  for (const [k, dt] of horizons.entries()) {
    const ref = linear(281 + dt), later = wristObservation(rows, i, 'leftArm', dt);
    assert.equal(later.kind, k === 0 ? 'interpolated' : 'sampled');
    for (const axis of [0, 1]) {
      near(trend.predictions[k][axis], ref[axis]);
      near(later.point[axis], ref[axis]);
    }
  }
  const left = rows.map((r, j) => j > i ? {...r, leftArm: [7, 9]} : r);
  assert.deepEqual(wristTrend(left, i, 'leftArm'), trend);
  assert.deepEqual(wristTrend(rows.slice(0, i+1), i, 'leftArm'), trend);
  assert.equal(wristTrend(rows, i, 'rightArm').issue, 'No visible wrist at this time.');
});

test('still and isolated historical spikes retain a stable median speed', () => {
  const rows = trajectory([0, 70, 140, 210, 280, 350, 420]);
  for (const row of rows) row.rightArm = [.12, -.26];
  rows[2].leftArm = [12, -9];
  const fit = wristTrend(rows, 6, 'leftArm');
  for (const [i, dt] of horizons.entries())
    fit.predictions[i].forEach((v, axis) => near(v, linear(420 + dt)[axis]));
  assert.deepEqual(wristTrend(rows, 6, 'rightArm').predictions, [[.12, -.26],[.12, -.26]]);
});

test('each wrist resets at its own occlusion, rejects wide gaps and never fabricates a future', () => {
  const rows = trajectory([20, 110, 160, 220, 290, 355, 470, 800, 875, 970]);
  for (const row of rows) row.rightArm = [0, 0];
  rows[2].leftArm = null;
  assert.ok(wristTrend(rows, 4, 'leftArm').issue);
  assert.equal(wristTrend(rows, 4, 'rightArm').count, 5);
  for (const side of ['leftArm','rightArm']) {
    assert.ok(wristTrend(rows, 7, side).issue);
    assert.equal(wristTrend(rows, 9, side).count, 3);
    assert.equal(wristObservation(rows, 3, side, 500).kind, 'tracking gap');
    assert.equal(wristObservation(rows, 8, side, 500).kind, 'beyond the last frame');
  }
  assert.equal(wristObservation(rows, 0, 'leftArm', 120).kind, 'tracking gap');
  assert.equal(wristObservation(rows, 0, 'leftArm', 140).kind, 'tracking gap');
  assert.equal(wristObservation(rows, 0, 'rightArm', 140).kind, 'sampled');
});

test('detector image-height offsets reach the forecast with the original side signs', () => {
  const points = [];
  for (const [idx, x, y] of [[11,.6,.4],[15,.75,.25],[12,.4,.4],[16,.25,.25]])
    points[idx] = {x,y,visibility:1};
  const wrists = observedWrists(points, 640, 320, {leftArm:{},joints:{r_elbow_flex:0}});
  for (const row of wristFrames({frames:[{time:111,wrists}]}))
    for (const side of ['leftArm','rightArm']) {
      near(row[side][0], .3);
      near(row[side][1], .15);
    }
  points[16].x = .46;
  const inward = observedWrists(points, 640,320,{joints:{r_elbow_flex:0}});
  near(inward.rightArm[0], -.12);
});

test('missing legacy offsets, bad clocks, and synthetic example preserve source provenance', () => {
  assert.deepEqual(wristFrames(null), []);
  assert.deepEqual(wristFrames({frames:[{time:4},{time:3}]}), []);
  assert.deepEqual(wristFrames({frames:[{time:NaN}]}), []);
  assert.deepEqual(wristFrames({frames:[{time:4,wrists:{leftArm:[null,0],rightArm:[3,Infinity]}}]}), [{time:4,leftArm:null,rightArm:null}]);
  const rows = wristFrames(exampleTake());
  assert.equal(rows.length, 85);
  assert.ok(rows.every(row => row.rightArm));
  assert.equal(rows.filter(row => !row.leftArm).length, 7);
  assert.ok(wristTrend(rows, 58, 'leftArm').issue);
  assert.ok(wristTrend(rows, 58, 'rightArm').predictions);
});
