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
import { stepQuality, qualityStart, frameStat, QUALITY_AUTO, QUALITY_LEVELS } from '../scene/src/ns-scene-three.mjs';

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

// 19 November 2026, later: the levels' order changed (the owner: the bodies "high resolution, yet not destabilize
// performance"): the first cheaper level drops the two decorative passes at FULL resolution ('lite-1'); the
// resolution goes only after that. The cases below are restated for that order.
test('the resolution is the last thing given up', () => {
  assert.deepEqual(QUALITY_LEVELS.map(l => l.name), ['full', 'lite-1', 'lite-0.9', 'lite-0.8', 'lite-0.7', 'lite-0.6']);
  assert.ok(QUALITY_LEVELS[0].scale === 1 && QUALITY_LEVELS[1].scale === 1 && QUALITY_LEVELS[1].lite === true, 'the first step down keeps every pixel');
  for (let i = 2; i < QUALITY_LEVELS.length; i++) assert.ok(QUALITY_LEVELS[i].scale < QUALITY_LEVELS[i - 1].scale && QUALITY_LEVELS[i].lite === true);
});

test('frames that are every second one late count as slow; one hitch among steady frames does not', () => {
  // the measure: a mean with each sample held to twice the median
  assert.ok(Math.abs(frameStat([16.7, 16.7, 16.7, 200, 16.7, 16.7, 16.7]) - (6 * 16.7 + 33.4) / 7) < 1e-9);
  assert.ok(frameStat([16.7, 33.3, 16.7, 33.3, 16.7, 33.3, 16.7]) > QUALITY_AUTO.slowMs, 'about 40 frames a second: slow, though its median is one refresh');
  assert.ok(frameStat([16.7, 16.7, 16.7, 200, 16.7, 16.7, 16.7]) < QUALITY_AUTO.slowMs);
  assert.ok(Number.isNaN(frameStat([])));
  // a renderer that misses every second refresh leaves the full level (it stayed on it before: the median was 16.7 ms)
  let s = qualityStart('auto');
  for (let i = 0; i < 200 && s.changes === 0; i++) s = stepQuality(s, i % 2 ? 33.3 : 16.7, QUALITY_AUTO, QUALITY_LEVELS, 5);
  assert.equal(name(s), 'lite-1');
  // steady frames with a hitch every second leave it alone
  s = qualityStart('auto');
  for (let i = 0; i < 600; i++) s = stepQuality(s, i % 60 === 30 ? 180 : 16.7, QUALITY_AUTO, QUALITY_LEVELS, 5);
  assert.equal(s.changes, 0);
});

test('a step that makes the frames faster is kept', () => {
  let s = untilChange(qualityStart('auto'), 33.3, 5);
  assert.equal(name(s), 'lite-1');
  assert.equal(s.lastChange.why, 'slow');
  assert.ok(s.probe, 'the step is being measured');
  ({ s } = run(s, 60, 16.7, 5));
  assert.equal(name(s), 'lite-1');
  assert.equal(s.probe, null);
  assert.equal(s.changes, 1);
});

test('steps that do not help are undone, and the level is then held', () => {
  const seen = [];
  let s = qualityStart('auto');
  ({ s } = run(s, 400, 33.3, NaN, seen)); // 13 s of slow frames whatever the picture
  assert.deepEqual(seen.map(c => [QUALITY_LEVELS[c.from].name, QUALITY_LEVELS[c.to].name, c.why]), [
    // (19 November 2026: the levels are gentler and none swaps the meshes: the lite step, then a resolution step, then back)
    ['full', 'lite-1', 'slow'], ['lite-1', 'lite-0.9', 'slow'], ['lite-0.9', 'full', 'no-gain']
  ]);
  assert.equal(name(s), 'full');
  assert.deepEqual(s.blockedUntil, {}, 'no level stays blocked by steps that were undone');
  assert.deepEqual(s.slowLeft, {});
  assert.equal(s.lastHold.why, 'no-gain');
  const backAt = seen[seen.length - 1].atMs; // (the step back to full is the last of the three changes now)
  assert.ok(s.noGain[0] > backAt + QUALITY_AUTO.noGainHoldMs - 1 && s.noGain[0] < backAt + QUALITY_AUTO.noGainHoldMs + 1);
  // the hold ends after 20 s; the same answer again doubles it
  const again = [];
  ({ s } = run(s, 900, 33.3, NaN, again));
  assert.equal(again.length, 3, 'one more try after the hold (the lite step, a resolution step, and back)');
  assert.equal(again[0].why, 'slow');
  assert.ok(again[0].atMs >= backAt + QUALITY_AUTO.noGainHoldMs);
  assert.equal(again[again.length - 1].why, 'no-gain');
  assert.equal(name(s), 'full');
  assert.ok(Math.abs(s.noGain[0] - (again[again.length - 1].atMs + 2 * QUALITY_AUTO.noGainHoldMs)) < 1);
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

test('very slow frames go down several levels at once, and on to the last while they stay slow', () => {
  const seen = [];
  let s = untilChange(qualityStart('auto'), 300, 20);
  assert.equal(name(s), 'lite-0.8', 'very slow frames jump three levels');
  ({ s } = run(s, 12, 120, 20, seen)); // that helped (300 ms -> 120 ms): kept
  assert.equal(name(s), 'lite-0.8');
  assert.equal(s.probe, null);
  s = untilChange(s, 120, 20); // still slow: two more levels, the last
  assert.equal(name(s), 'lite-0.6');
  ({ s } = run(s, 40, 100, 20, seen));
  assert.equal(name(s), 'lite-0.6');
  assert.equal(s.probe, null);
});

test('meshes are not swapped for frames that are only just slow', () => {
  const seen = [];
  let s = qualityStart('auto');
  ({ s } = run(s, 400, 26, NaN, seen));
  assert.deepEqual(seen.map(c => [QUALITY_LEVELS[c.to].name, c.why]), [['lite-1', 'slow'], ['lite-0.9', 'slow'], ['full', 'no-gain']]);
  // and no level swaps the meshes at all any more (the owner: the bodies were "rough or patchy")
  assert.ok(QUALITY_LEVELS.every(l => l.lod === null) && Math.min(...QUALITY_LEVELS.map(l => l.scale)) >= 0.6);
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
