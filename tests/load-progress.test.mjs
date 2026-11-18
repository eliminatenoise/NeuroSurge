// The loading bar's model (19 November 2026): one number for the whole wait that never falls, keeps moving inside a
// step without passing its end, and a watchdog that tells a stall from a busy page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadModel, createLoadWatch, parseStepTimes, LOAD_STEPS, LOAD_CREEP } from '../scene/src/ns-load-progress.mjs';

const total = LOAD_STEPS.reduce((a, s) => a + s[1], 0);

test('the bar is the share of the expected time that is done; it never falls and ends at 1', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t });
  assert.equal(m.value(), 0);
  m.set('files', 0.5);
  assert.ok(Math.abs(m.value() - 0.5 * 3500 / total) < 1e-9);
  m.set('files', 0.2); // a smaller report never takes the bar back
  assert.ok(Math.abs(m.value() - 0.5 * 3500 / total) < 1e-9);
  let last = m.value();
  for (const [id] of LOAD_STEPS) { t += 100; m.begin(id); t += 400; assert.ok(m.value() >= last); last = m.value(); m.done(id); assert.ok(m.value() >= last); last = m.value(); }
  assert.equal(m.value(), 1);
  assert.equal(m.finished(), true);
  assert.deepEqual(Object.keys(m.times()), LOAD_STEPS.map(s => s[0]).filter(id => id !== 'page'), 'the page step is measured afresh every load');
});

test('inside a step the bar moves by the clock, stops short of the step\'s end, and the plan says where and how long', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t });
  m.set('files', 1); m.done('files');
  const before = m.value();
  m.begin('layers');
  const plan = m.plan();
  assert.equal(plan.from, before);
  assert.ok(Math.abs(plan.ms - LOAD_CREEP.stretch * 3000) < 1e-6);
  assert.ok(Math.abs(plan.to - (before + LOAD_CREEP.upTo * 3000 / total)) < 1e-9);
  t = 1500; const mid = m.value();
  assert.ok(mid > before && mid < plan.to);
  t = 60000; // the step takes far longer than expected: the bar waits at 90 % of the step
  assert.ok(Math.abs(m.value() - plan.to) < 1e-9);
  assert.equal(m.plan().ms, 0);
  m.done('layers');
  assert.ok(Math.abs(m.value() - (before + 3000 / total)) < 1e-9);
});

test('a computer slower than the defaults is noticed from the first steps, and later steps creep at its pace', () => {
  let t = 0;
  const m = createLoadModel({ now: () => t });
  m.begin('brain'); t = 3300; m.done('brain'); // three times the default
  assert.equal(m.state().speed, 3);
  m.begin('rig');
  assert.ok(Math.abs(m.plan().ms - LOAD_CREEP.stretch * 800 * 3) < 1e-6);
});

test('the last load\'s times on this computer set the shares; nonsense in storage is ignored', () => {
  assert.deepEqual(parseStepTimes('{"files":1200,"layers":9000,"bogus":5,"rig":-1,"pose":"x"}'), { files: 1200, layers: 9000 });
  assert.deepEqual(parseStepTimes('not json'), {});
  let t = 0;
  const m = createLoadModel({ now: () => t, times: { files: 1000, layers: 9000 } });
  const sum = total - 3500 - 3000 + 1000 + 9000;
  m.set('files', 1);
  assert.ok(Math.abs(m.value() - 1000 / sum) < 1e-9);
});

test('a bar already on the page is taken over where it stands, and the scripts\' real time is the first share', () => {
  let t = 2400;
  const m = createLoadModel({ now: () => t, pageMs: 2400, floor: 0.04 });
  const sum = total - 1000 + 2400;
  assert.ok(Math.abs(m.value() - 2400 / sum) < 1e-9, 'the page step is done, with its real time as its share');
  const slow = createLoadModel({ now: () => t, pageMs: 100, floor: 0.04 });
  assert.equal(slow.value(), 0.04, 'never less than what the page already showed');
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
