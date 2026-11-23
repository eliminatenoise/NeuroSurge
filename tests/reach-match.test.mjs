import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {observedWrists, poseForSelection} from '../scene/src/camera/limb-pose.mjs';
import {createTakeTimeline} from '../scene/src/camera/limb-take.mjs';
import {rankReaches, studyShape, takeShape} from '../scene/src/camera/reach-study/match.mjs';

const cases = JSON.parse(
    readFileSync(new URL('../scene/src/camera/reach-study/recordings.json', import.meta.url)));
const fixture = (path, side = 'rightArm') => ({
  limb: side,
  frames: path.map(([x, y], i) => ({time: i * 50, wrists: {[side]: [.11 + .22 * x, .32 + .22 * y]}}))
});

test(
    'each of eight real held paths retrieves its exact case, independently of positive spatial scale, translation and duration',
    () => {
      for (const [i, r] of cases.entries()) {
        const shape = studyShape(r), take = fixture(shape), observed = takeShape(take, 'rightArm');
        assert.equal(observed.samples, 30);
        assert.equal(observed.span, 1450);
        const {ranked, tied} = rankReaches(observed.path, cases);
        assert.equal(ranked[0].index, i);
        assert.equal(tied.length, 1);
        assert.ok(ranked[0].distance < 1e-12);
        assert.deepEqual(studyShape({...r, path: r.path.map(([x, y, z]) => [x, y, z + 300])}), shape);
        const turns = fixture(shape.toReversed());
        assert.ok(rankReaches(takeShape(turns, 'rightArm').path, [r]).ranked[0].distance > .01);
      }
    });

test(
    'distances average 2D squared errors over normalized capture time; tied cases and unavailable planes stay explicit',
    () => {
      const a = {path: [[0, 0, 0], [1, 0, 0]]}, b = {path: [[0, 0, 83], [0, 2, -12]]},
            c = {path: [[0, 0, 0], [0, 0, 23]]};
      const path = studyShape(a), {ranked, tied} = rankReaches(path, [a, b, a, c]);
      assert.deepEqual(tied.map(r => r.index), [0, 2]);
      const expected = Math.sqrt(
          Array.from({length: 30}, (_, i) => 2 * (i / 29) ** 2).reduce((sum, v) => sum + v, 0) / 30);
      assert.ok(Math.abs(ranked[2].distance - expected) < 1e-12);
      assert.equal(studyShape(c), null);
      const uneven = {
        limb: 'leftArm',
        frames: [0, 35, 100, 249, 300].map(time => ({time, wrists: {leftArm: [0, time / 300]}}))
      };
      assert.ok(rankReaches(takeShape(uneven, 'leftArm').path, [b]).ranked[0].distance < 1e-12);
    });

test(
    'old, missing, hidden, disconnected, short, stationary and wrong sides never substitute another signal',
    () => {
      const take = fixture(studyShape(cases[0]));
      assert.match(takeShape(undefined, 'leftArm').issue, /Finish/);
      assert.match(takeShape(take, 'leftArm').issue, /other arm/);
      assert.match(takeShape({...take, limb: 'leftLeg'}, 'leftArm').issue, /knees/);
      assert.match(
          takeShape({limb: 'rightArm', frames: [{pose: {joints: {r_elbow_flex: 97}}}]}, 'rightArm')
              .issue,
          /no observed/);
      assert.match(takeShape({...take, frames: take.frames.slice(0, 3)}, 'rightArm').issue, /five/);
      for (const t of [take.frames[3].time, 710, NaN]) {
        const copy = structuredClone(take);
        copy.frames[4].time = t;
        assert.match(takeShape(copy, 'rightArm').issue, /apart or out of order/);
      }
      const both = structuredClone(take);
      both.limb = 'bothArms';
      delete both.frames[5].wrists.rightArm;
      both.frames[5].wrists.leftArm = [.7, .4];
      assert.match(takeShape(both, 'rightArm').issue, /disappeared/);
      assert.match(takeShape(fixture(Array(20).fill([0, 0])), 'rightArm').issue, /Too little/);
      assert.match(
          takeShape(fixture(Array.from({length: 20}, (_, i) => [i / 200, 0])), 'rightArm').issue,
          /Too little/);
    });

test(
    'raw video landmarks yield shoulder-relative square-pixel offsets, outward for each anatomical arm; depth is discarded',
    () => {
      const points = [];
      for (const [i, x, y] of [
               [11, .6, .4], [12, .4, .4], [13, .72, .55], [15, .78, .68], [14, .28, .55],
               [16, .22, .68]])
        points[i] = {x, y, visibility: .95, z: Infinity};
      const read = (mode, p = points) =>
          observedWrists(p, 640, 480, poseForSelection(p, 640, 480, mode, () => true));
      const l = read('leftArm'), r = read('rightArm');
      assert.ok(Math.abs(l.leftArm[0] - .24) < 1e-12);
      assert.ok(Math.abs(r.rightArm[0] - .24) < 1e-12);
      for (const p of [l.leftArm, r.rightArm]) assert.ok(Math.abs(p[1] + .28) < 1e-12);
      assert.deepEqual(read('bothArms'), {...l, ...r});
      assert.deepEqual(
          read('bothArms', points.map(p => ({...p, x: p.x + .02, y: p.y + .02, z: -5}))).leftArm,
          l.leftArm);
      assert.deepEqual(
          read('rightArm', points.map((p, i) => i === 16 ? {...p, visibility: .61} : p)), {});
      assert.deepEqual(read('bothKnees'), {});
      const timeline = createTakeTimeline('leftArm', 0);
      const pose = poseForSelection(points, 640, 480, 'bothArms', () => true);
      timeline.observe(pose, 5, false, {...l, ...r});
      l.leftArm[0] = 3;
      timeline.observe(pose, 105, false, {...l, ...r});
      const saved = timeline.finish(110);
      assert.ok(Math.abs(saved.frames[0].wrists.leftArm[0] - .24) < 1e-12);
      assert.equal(saved.frames[0].wrists.rightArm, undefined);
      assert.equal(saved.frames[0].pose.wrists, undefined);
    });
