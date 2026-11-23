import assert from 'node:assert/strict';
import test from 'node:test';
import {exampleTake, wristFrames, horizons, sides} from '../scene/src/camera/wrist-forecast/forecast.mjs';
import {roleForecast, laterRoleWrist} from '../scene/src/camera/wrist-forecast/role-model.mjs';
import {observedArmGeometry} from '../scene/src/camera/limb-pose.mjs';
import {createTakeTimeline} from '../scene/src/camera/limb-take.mjs';

const fresh = () => wristFrames(exampleTake());
test('a fictional shoulder model uses only the prior 15 regular sample times', () => {
  const rows = fresh(), i = 32, lead = 'rightArm', got = roleForecast(rows, i, lead);
  assert.deepEqual(got, roleForecast(rows.slice(0, i + 1), i, lead));
  assert.equal(got.originalSamples, 11);
  assert.equal(got.interpolated, 10);
  for (const side of sides) {
    assert.ok(got.arms[side].predictions.flat().every(Number.isFinite));
    assert.equal(laterRoleWrist(rows, i, horizons[0], side, got).kind, 'interpolated');
    assert.equal(laterRoleWrist(rows, i, horizons[1], side, got).kind, 'sampled');
    assert.equal(laterRoleWrist(rows.slice(0,i+1), i, 500, side, got).kind, 'beyond the last frame');
  }
  const left = roleForecast(rows, i, 'leftArm');
  assert.ok(left.frame.x[0] > 0 && got.frame.x[0] < 0);
  assert.notDeepEqual(got.arms.rightArm.predictions, left.arms.rightArm.predictions);
  assert.ok(roleForecast(rows, 5, lead).issue);
  assert.ok(roleForecast(rows, 32, 'something else').issue);
});
test('past support is checked at all acquired times, with per-arm and shared abstention', () => {
  let rows = fresh();
  const i = 32, lead = 'leftArm';
  delete rows[25].armGeometry.leftArm;
  let result = roleForecast(rows, i, lead);
  assert.ok(result.arms.leftArm.issue && result.arms.rightArm.predictions);
  delete rows[26].armGeometry.shoulders.rightArm;
  assert.match(roleForecast(rows, i, lead).issue, /shoulders/);
  rows = fresh();
  rows[29].armGeometry.aspect = 1.5;
  assert.match(roleForecast(rows, i, lead).issue, /shape/);
  rows = fresh();
  for (const row of rows) row.armGeometry.shoulders.leftArm = [...row.armGeometry.shoulders.rightArm];
  assert.match(roleForecast(rows, i, lead).issue, /too close/);
  rows = fresh();
  rows.splice(24,5);
  assert.match(roleForecast(rows, i - 5, lead).issue, /gaps/);
  rows = fresh();
  const sample = structuredClone(rows[27]); sample.time += .5; delete sample.armGeometry.rightArm;
  rows.splice(28, 0, sample);
  result = roleForecast(rows, i + 1, lead);
  assert.ok(result.arms.leftArm.predictions && result.arms.rightArm.issue);
  assert.match(roleForecast([{time:0}], 0, lead).issue, /no projected/);
});
test('a later tracking break affects only the corresponding measurement, and later shoulders never move the axes', () => {
  const rows = fresh(), i = 32, lead = 'leftArm', fit = roleForecast(rows, i, lead);
  const old = laterRoleWrist(rows, i, horizons[0], lead, fit);
  for (const row of rows.slice(i+1)) row.armGeometry.shoulders.leftArm = [15,12];
  assert.deepEqual(laterRoleWrist(rows, i, horizons[0], lead, fit), old);
  delete rows[i+6].armGeometry.leftArm;
  assert.equal(laterRoleWrist(rows, i, horizons[0], lead, fit).kind, 'tracking gap');
  assert.equal(laterRoleWrist(rows, i, horizons[0], 'rightArm', fit).kind, 'interpolated');
  assert.deepEqual(roleForecast(rows, i, lead), fit);
});
test('only accepted selected arm geometry enters a take; offsets, pose and image aspects remain distinct', () => {
  const source = [];
  for (const [i,x,y] of [[11,.65,.4],[12,.35,.43],[13,.72,.6],[14,.29,.62],[15,.8,.65],[16,.22,.64]])
    source[i] = {x,y,visibility:.99};
  const pose = {joints:{r_shoulder_abd:25,r_shoulder_flex:0,r_elbow_flex:35}};
  const geometry = observedArmGeometry(source,640,320,pose);
  assert.deepEqual(geometry,{aspect:2,shoulders:{leftArm:[1.3,.4],rightArm:[.7,.43]},rightArm:[[.44,.64],[.58,.62]]});
  const timeline = createTakeTimeline('rightArm', 100);
  for (const t of [120, 240]) timeline.observe(pose, t, false, {rightArm:[.26,-.21]}, geometry);
  geometry.shoulders.leftArm[0] = -5;
  const first = timeline.finish(270).frames[0];
  assert.equal(first.armGeometry.shoulders.leftArm[0],1.3);
  assert.equal(first.pose.armGeometry,undefined);
  source[11].visibility = .1;
  assert.equal(observedArmGeometry(source,640,320,pose), undefined);
});

function imagePosition([x, y], {origin, x:axis, up, width}) {
  return origin.map((o, j) => o + width * (axis[j] * x + up[j] * y));
}
function closePair(actual, expected) {
  for (const j of [0,1]) assert.ok(Math.abs(actual[j] - expected[j]) < 1e-10, JSON.stringify({actual,expected}));
}

test('the automatic forecast averages both manual positions in the original image', () => {
  const rows = fresh();
  for (const i of [10,32,54,58,68,84]) {
    const auto = roleForecast(rows, i);
    const branches = sides.map(side => roleForecast(rows, i, side));
    assert.deepEqual(auto, roleForecast(rows.slice(0,i+1), i));
    assert.deepEqual(auto.frame, branches[1].frame);
    for (const side of sides) {
      if (auto.arms[side].issue) {
        assert.ok(branches.every(b => b.arms[side].issue));
        continue;
      }
      for (const [k, prediction] of auto.arms[side].predictions.entries()) {
        const images = branches.map(b => imagePosition(b.arms[side].predictions[k], b.frame));
        closePair(imagePosition(prediction, auto.frame), images[0].map((v,j) => (v + images[1][j]) / 2));
      }
    }
  }
  assert.match(roleForecast(rows,9).issue, /0.467/);
  assert.ok(roleForecast(rows,58).arms.leftArm.issue);
  delete rows[26].armGeometry.shoulders.rightArm;
  assert.match(roleForecast(rows,32).issue, /shoulders/);
});

test('reflecting an image and swapping anatomical labels reflects the automatic predictions', () => {
  const rows = fresh(), swapped = {leftArm:'rightArm', rightArm:'leftArm'};
  const mirror = ([x,y]) => [1-x,y];
  const mirrored = rows.map(({time,armGeometry:g}) => {
    const armGeometry = {aspect:g.aspect, shoulders:{}};
    for (const side of sides) {
      armGeometry.shoulders[swapped[side]] = mirror(g.shoulders[side]);
      if (g[side]) armGeometry[swapped[side]] = g[side].map(mirror);
    }
    return {time,armGeometry};
  });
  for (const i of [32,58]) {
    const original = roleForecast(rows,i), reflected = roleForecast(mirrored,i);
    for (const side of sides) {
      const a = original.arms[side], b = reflected.arms[swapped[side]];
      if (a.issue) { assert.equal(b.issue,a.issue); continue; }
      a.predictions.forEach((p,k) => closePair(mirror(imagePosition(p,original.frame)),
        imagePosition(b.predictions[k], reflected.frame)));
    }
  }
});
