// The loading bar's model (19 November 2026): one number for the whole wait that never falls, never jumps, keeps moving
// inside a step without passing its end, and a watchdog that tells a stall from a busy page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadModel, createLoadWatch, parseStepTimes, LOAD_STEPS, LOAD_CREEP, LOAD_MAX_BEFORE_READY } from '../scene/src/ns-load-progress.mjs';

const total = LOAD_STEPS.reduce((a, s) => a + s[1], 0);
const ms = Object.fromEntries(LOAD_STEPS.map(s => [s[0], s[1]]));

test('the bar is time gone over time gone plus time expected to come; it never falls and ends at 1', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t });
  assert.equal(m.value(), 0);
  // a download that has brought half its bytes at once: no time has gone, so the bar has not moved yet
  m.set('files', 0.5);
  assert.equal(m.value(), 0);
  let last = m.value();
  for (const [id] of LOAD_STEPS) { t += 100; m.begin(id); t += 400; assert.ok(m.value() >= last); last = m.value(); m.done(id); assert.ok(m.value() >= last); last = m.value(); }
  assert.equal(m.value(), 1);
  assert.equal(m.finished(), true);
  assert.deepEqual(Object.keys(m.times()), LOAD_STEPS.map(s => s[0]));
  // a page step whose time was given at the start (the scripts were already in) is not stored as a measurement
  const given = createLoadModel({ now: () => t, pageMs: 800 });
  given.done('files');
  assert.deepEqual(Object.keys(given.times()), ['files']);
});

test('a load that goes exactly as expected moves the bar evenly with the clock', () => {
  let t = 0;
  const times = Object.fromEntries(LOAD_STEPS.map(s => [s[0], 500])); // every step known to take 500 ms here
  const m = createLoadModel({ now: () => t, times });
  const n = LOAD_STEPS.length, seen = [];
  for (const [id] of LOAD_STEPS) { m.begin(id); t += 250; seen.push(m.value()); t += 250; m.done(id); seen.push(m.value()); }
  for (let i = 0; i < seen.length - 1; i++) {
    const want = (i + 1) * 250 / (n * 500);
    assert.ok(Math.abs(seen[i] - want) < 0.03, `at ${(i + 1) * 250} ms the bar reads ${seen[i].toFixed(3)}, the clock says ${want.toFixed(3)}`);
  }
});

test('a step in hand keeps the bar moving however long it takes, never to the step\'s end, and the plan gives the way', () => {
  let t = 0;
  const times = Object.fromEntries(LOAD_STEPS.map(s => [s[0], 500]));
  const m = createLoadModel({ now: () => t, times });
  for (const id of ['page', 'files', 'brain', 'check', 'rig', 'pose']) { m.begin(id); t += 500; m.done(id); }
  const before = m.value();
  m.begin('layers');
  const plan = m.plan();
  assert.equal(plan.from, before);
  assert.ok(plan.frames.length >= 10 && plan.frames[0][0] === 100 && plan.ms === plan.frames[plan.frames.length - 1][0] && plan.to === plan.frames[plan.frames.length - 1][1]);
  for (let i = 1; i < plan.frames.length; i++) assert.ok(plan.frames[i][0] > plan.frames[i - 1][0] && plan.frames[i][1] >= plan.frames[i - 1][1]);
  // the step takes forty times as long as expected: the bar is still moving after 4 s, 8 s and 16 s ...
  const at = ms => { t = 3000 + ms; return m.value(); };
  const v4 = at(4000), v8 = at(8000), v16 = at(16000);
  assert.ok(v4 > before && v8 > v4 + 0.002 && v16 > v8 + 0.002);
  // ... and never goes further than half way into what the steps still to come will need
  const own = 500 / (5 * 500);
  t = 3000 + 600000;
  assert.ok(m.value() <= before + (1 - before) * (own + LOAD_CREEP.beyond * (1 - own)) + 1e-9);
  assert.ok(m.value() < LOAD_MAX_BEFORE_READY);
});

test('a download that has stopped stops the bar; a step that ends far sooner than expected does not throw it forward', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t, times: { page: 6000, files: 6000 } }); // a slow line last time
  m.begin('page'); t = 50; m.done('page');           // today the scripts come from the browser's cache
  assert.ok(m.value() < 0.02, 'the bar does not jump when a step ends early');
  m.set('files', 0.3);
  t = 400; const a = m.value();
  t = 60000; const b = m.value();                     // no byte for a minute
  assert.ok(b >= a && b <= 0.3 * 6000 / (6000 + 3900 * LOAD_CREEP.unsure) + 0.02, 'no more than the bytes that have come');
  t = 60001; assert.equal(m.value(), b, 'and it stands still while nothing comes');
});

test('a computer slower than the defaults is noticed from the first building step; a download says nothing of it', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t });
  assert.equal(m.state().sure, false);
  m.begin('page'); t = 5000; m.done('page');      // five times the default: the connection, not the computer
  assert.equal(m.state().speed, 1);
  m.begin('brain'); t += 3 * ms.brain; m.done('brain'); // three times the default
  assert.equal(m.state().speed, 3);
  assert.equal(m.state().sure, true);
});

test('the word only moves forward (Loading, Building, Starting)', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t });
  m.set('files', 0.2); assert.equal(m.plan().word, 'Loading');
  m.begin('brain'); assert.equal(m.plan().word, 'Building');
  m.set('files', 0.6); assert.equal(m.plan().word, 'Building', 'a later byte of the download does not take the word back');
  m.begin('first'); assert.equal(m.plan().word, 'Starting');
  m.set('check', 0.5); assert.equal(m.plan().word, 'Starting');
});

test('the times kept for the next load are each step\'s own and add up to the wait', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t });
  m.begin('page');                     // scripts 0 .. 2000
  t = 100; m.set('files', 0.1);        // packs 100 .. 1500, alongside the scripts
  t = 1500; m.set('files', 1); m.done('files');
  t = 2000; m.done('page');
  m.begin('brain'); t = 2600; m.done('brain');
  const got = m.times();
  assert.deepEqual(got, { page: 500, files: 1400, brain: 600 });
  assert.equal(got.page + got.files + got.brain, 2600 - 100);
});

test('the last load\'s times on this computer set the shares; nonsense in storage is ignored', () => {
  assert.deepEqual(parseStepTimes('{"files":1200,"layers":9000,"bogus":5,"rig":-1,"pose":"x"}'), { files: 1200, layers: 9000 });
  assert.deepEqual(parseStepTimes('not json'), {});
});

test('a bar already on the page is taken over where it stands, and the scripts\' real time is the first share', () => {
  let t = 2400;
  const m = createLoadModel({ now: () => t, pageMs: 2400, floor: 0.04 });
  const rest = (total - ms.page - ms.files - ms.check) * LOAD_CREEP.unsure + ms.files + ms.check;
  assert.ok(Math.abs(m.value() - 2400 / (2400 + rest)) < 1e-9, 'the page step is done: its real time over that plus what is expected to come');
  const slow = createLoadModel({ now: () => t, pageMs: 100, floor: 0.04 });
  assert.equal(slow.value(), 0.04, 'never less than what the page already showed');
});

test('the bar does not read 100 % before the game is there', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t, times: { page: 200000, files: 200000 } });
  m.begin('page'); t = 200000; m.done('page'); m.begin('files'); t = 400000; m.done('files');
  m.begin('brain'); t += 100000;
  assert.ok(m.value() <= LOAD_MAX_BEFORE_READY);
  assert.ok(Math.round(100 * m.value()) < 100);
});

test('the watchdog: quiet for the limit is a stall, a busy page is not, and news lifts it again', () => {
  let t = 0, advanced = 0, tick = null; const calls = [];
  const win = { setInterval: f => { tick = f; return 1; }, clearInterval: () => { tick = null; } };
  const w = createLoadWatch({ lastAdvance: () => advanced, onStall: ms => calls.push(['stall', ms]), onResume: () => calls.push(['resume']), stallMs: 20000, win, now: () => t });
  for (t = 1000; t <= 20000; t += 1000) tick();
  assert.deepEqual(calls, []);
  t = 21000; tick();
  assert.deepEqual(calls, [['stall', 21000]]);
  advanced = 21500; t = 22000; tick();
  assert.deepEqual(calls, [['stall', 21000], ['resume']]);
  // the page's own thread was busy for 30 s (the timer comes late): not a stall by itself
  t = 52000; tick();
  assert.equal(calls.length, 2);
  // ... but still quiet a second later, with the page awake: now it is
  t = 53000; tick();
  assert.equal(calls.length, 3);
  w.stop();
  assert.equal(tick, null);
});
