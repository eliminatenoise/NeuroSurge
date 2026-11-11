/**
 * The automatic picture-quality controller (ns-scene-three stepQuality, QUALITY_AUTO): a cheaper picture is kept only
 * when it makes the frames faster.
 *
 * Frame times here are made-up inputs to the pure controller; nothing is drawn and no machine is measured.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepQuality, qualityStart, QUALITY_AUTO, QUALITY_LEVELS } from '../scene/src/ns-scene-three.mjs';

/** Feed `frames` equal frame times; returns the last state and every level change seen, in order. */
function run(state, frames, ms, busyMs = NaN, seen = []) {
  let s = state;
  for (let i = 0; i < frames; i++) {
    const before = s.changes;
    s = stepQuality(s, ms, QUALITY_AUTO, QUALITY_LEVELS, busyMs);
    if (s.changes !== before) seen.push({ ...s.lastChange });
  }
  return { s, seen };
}
/** Feed frames until the level changes (at most `max` frames). */
function untilChange(state, ms, busyMs = NaN, max = 2000) {
  let s = state;
  for (let i = 0; i < max; i++) {
    const before = s.changes;
    s = stepQuality(s, ms, QUALITY_AUTO, QUALITY_LEVELS, busyMs);
    if (s.changes !== before) return s;
  }
  return s;
}
const name = s => QUALITY_LEVELS[s.level].name;

test('a step that makes the frames faster is kept', () => {
  let s = untilChange(qualityStart('auto'), 33.3, 5);
  assert.equal(name(s), 'scale-0.75');
  assert.equal(s.lastChange.why, 'slow');
  assert.ok(s.probe, 'the step is being measured');
  ({ s } = run(s, 60, 16.7, 5));
  assert.equal(name(s), 'scale-0.75');
  assert.equal(s.probe, null);
  assert.equal(s.changes, 1);
});

test('steps that do not help are undone, and the level is then held', () => {
  const seen = [];
  let s = qualityStart('auto');
  ({ s } = run(s, 400, 33.3, NaN, seen)); // 13 s of slow frames whatever the picture
  assert.deepEqual(seen.map(c => [QUALITY_LEVELS[c.from].name, QUALITY_LEVELS[c.to].name, c.why]), [
    ['full', 'scale-0.75', 'slow'], ['scale-0.75', 'lite-0.5', 'slow'], ['lite-0.5', 'lod-0.5', 'slow'], ['lod-0.5', 'full', 'no-gain']
  ]);
  assert.equal(name(s), 'full');
  assert.deepEqual(s.blockedUntil, {}, 'no level stays blocked by steps that were undone');
  assert.deepEqual(s.slowLeft, {});
  assert.equal(s.lastHold.why, 'no-gain');
  const backAt = seen[3].atMs;
  assert.ok(s.noGain[0] > backAt + QUALITY_AUTO.noGainHoldMs - 1 && s.noGain[0] < backAt + QUALITY_AUTO.noGainHoldMs + 1);
  // the hold ends after 20 s; the same answer again doubles it
  const again = [];
  ({ s } = run(s, 900, 33.3, NaN, again));
  assert.equal(again.length, 4, 'one more try after the hold');
  assert.equal(again[0].why, 'slow');
  assert.ok(again[0].atMs >= backAt + QUALITY_AUTO.noGainHoldMs);
  assert.equal(again[3].why, 'no-gain');
  assert.equal(name(s), 'full');
  assert.ok(Math.abs(s.noGain[0] - (again[3].atMs + 2 * QUALITY_AUTO.noGainHoldMs)) < 1);
});

test('slow frames that are the game\'s own work leave the picture alone', () => {
  const seen = [];
  let s = qualityStart('auto');
  ({ s } = run(s, 600, 33.3, 24, seen));
  assert.equal(seen.length, 0);
  assert.equal(name(s), 'full');
  assert.equal(s.lastHold.why, 'main-thread');
  assert.equal(s.lastHold.busyShare, 0.72);
});

test('a renderer limited by triangles still reaches the simpler meshes', () => {
  const seen = [];
  let s = untilChange(qualityStart('auto'), 300, 20);
  assert.equal(name(s), 'lite-0.5', 'very slow frames jump three levels');
  s = untilChange(s, 300, 20); // render scale and the x-ray pass did not help
  assert.equal(name(s), 'lod-0.5');
  ({ s } = run(s, 12, 120, 20, seen)); // simpler meshes did
  assert.equal(name(s), 'lod-0.5');
  s = untilChange(s, 120, 20); // still slow: the last level
  assert.equal(name(s), 'lod-0.4');
  ({ s } = run(s, 40, 100, 20, seen));
  assert.equal(name(s), 'lod-0.4');
  assert.equal(s.probe, null);
});

test('meshes are not swapped for frames that are only just slow', () => {
  const seen = [];
  let s = qualityStart('auto');
  ({ s } = run(s, 400, 26, NaN, seen));
  assert.deepEqual(seen.map(c => [QUALITY_LEVELS[c.to].name, c.why]), [['scale-0.75', 'slow'], ['lite-0.5', 'slow'], ['full', 'no-gain']]);
});

test('a kept level steps back up as before', () => {
  let s = untilChange(qualityStart('auto'), 33.3, 5);
  const seen = [];
  ({ s } = run(s, 2400, 16.7, 5, seen)); // 40 s of fast frames: the 30 s block on 'full' ends, then 6 s fast
  assert.deepEqual(seen.map(c => [QUALITY_LEVELS[c.to].name, c.why]), [['full', 'fast']]);
});

test('high and low never change, and a gap is not a frame time', () => {
  let { s } = run(qualityStart('high'), 300, 100);
  assert.equal(s.level, 0);
  ({ s } = run(qualityStart('low'), 300, 5));
  assert.equal(s.level, QUALITY_LEVELS.length - 1);
  ({ s } = run(qualityStart('auto'), 50, 1500));
  assert.equal(s.level, 0);
  assert.equal(s.clockMs, 0);
});
