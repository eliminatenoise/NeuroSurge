/** Frame time by part (ns-perf, 18 November 2026): the counter later packages read in inspect().perf to see what their
 * change costs. Made-up clocks only; nothing here measures the game. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createFrameTimer, FRAME_PARTS } = await import(path.join(repo, 'scene/src/ns-perf.mjs'));

test('each mark takes the time since the previous mark; the rest of the frame goes to other', () => {
  const t = createFrameTimer({ now: () => 0 });
  t.begin(100); t.mark('input', 101); t.mark('sim', 104); t.mark('draw', 110); t.end(112);
  const s = t.state();
  assert.equal(s.frames, 1);
  assert.equal(s.meanMs.input, 1);
  assert.equal(s.meanMs.sim, 3);
  assert.equal(s.meanMs.draw, 6);
  assert.equal(s.meanMs.other, 2);
  assert.equal(s.totalMeanMs, 12);
});

test('an unknown part counts as other, and add() moves time measured inside another part', () => {
  const t = createFrameTimer({ now: () => 0 });
  t.begin(0); t.mark('nonsense', 5); t.mark('draw', 15); t.add('outline', 4, 'draw'); t.end(15);
  const s = t.state();
  assert.equal(s.meanMs.other, 5);
  assert.equal(s.meanMs.draw, 6);
  assert.equal(s.meanMs.outline, 4);
  assert.equal(s.totalMeanMs, 15);
});

test('the window keeps the last frames; mean and 90th percentile per part', () => {
  const t = createFrameTimer({ now: () => 0, window: 10 });
  let clock = 0;
  for (let f = 0; f < 25; f++) { t.begin(clock); clock += f < 15 ? 100 : f - 14; t.mark('skin', clock); t.end(clock); }
  const s = t.state();
  assert.equal(s.frames, 25);
  assert.equal(s.window, 10);
  // the last ten frames took 1 .. 10 ms of skin
  assert.equal(s.meanMs.skin, 5.5);
  assert.equal(s.p90Ms.skin, 10);
  assert.equal(s.totalP90Ms, 10);
});

test('marks outside a frame are ignored and every part is reported', () => {
  const t = createFrameTimer({ now: () => 0 });
  t.mark('sim', 5); t.end(9);
  const s = t.state();
  assert.equal(s.frames, 0);
  assert.deepEqual(Object.keys(s.meanMs), [...FRAME_PARTS]);
});
