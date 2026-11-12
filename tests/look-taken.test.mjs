/** The information card follows a look whose rest has just moved the body (user Messages 55 and 56: easier to use; a
 * learning tool). The activity counts a look's rest from the time before the first frame on the area; the card counts
 * from the time after it, so the card would take the area one frame after the movement is taken. A neck movement
 * moves the view, so by that frame the look can have left the small neck area: the head jerked while the card still
 * showed the area before, and the number keys still acted there. The rule checked here: the activity records the area
 * whose movement a look's rest took (ns-actions state.lookTaken = { regionId, n }), and the card treats that area as
 * meant, like a click (ns-app infoTookId, given to infoSettleStep as clickedId), in the very frame of the movement.
 * Pure parts only: no scene, model, browser or native fixture; every time below is a supplied number. These cases
 * establish which state the activity keeps and which card model is built, never pixels, real look timing, learning
 * outcomes or biology.
 * Run: node tests/look-taken.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-app.mjs', import.meta.url);
const app = await import(target.href);
const { BODY_MOTOR_MAP } = await import(new URL('../scene/src/ns-bodymap.mjs', import.meta.url).href);
const { createActivity, GAZE_DWELL } = await import(new URL('../scene/src/ns-actions.mjs', import.meta.url).href);
const { infoSettleStep, infoOverlayModel, infoTookId } = app;
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const H = 1 / 60;                       // one frame
const NECK = 'rh_neck', KEPT = 'rh_hand';
const lookNeck = () => ({ type: 'gaze', kind: 'region', regionId: NECK, actionId: 'rh_neck_extend', at: 0 });
const away = () => ({ type: 'gaze', kind: 'empty', at: 0 });
const gazeOn = id => ({ target: 'region', regionId: id, actionId: null, regionActionId: null, hemisphere: 'right', isLeftArm: false, u: null });

/** A fresh activity past its start instructions, with one look at empty space behind it (the first look is a seed). */
function started() {
  const A = createActivity();
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [away()], H);
  return { A, s };
}

/** Rest the look on the neck area for `frames` frames; returns the state after each frame. */
function rest(A, s0, frames, event = lookNeck) {
  const states = [];
  let s = s0;
  for (let i = 0; i < frames; i++) { s = A.step(s, [event()], H); states.push(s); }
  return states;
}

check('nothing is recorded before a look has rested', () => {
  const { s } = started();
  assert.equal(s.lookTaken, null);
  assert.equal(infoTookId(0, s), null);
  assert.equal(infoTookId(0, null), null);
  assert.equal(infoTookId(0, {}), null);
});

check('the area is recorded in the very frame the look\'s rest takes its movement, and only once', () => {
  const { A, s } = started();
  const states = rest(A, s, 40);
  const first = states.findIndex(x => x.lookTaken !== null);
  assert.ok(first > 0, 'the movement is not taken in the first frame of the look');
  // The frame of the record is the frame the waiting movement was taken (latchPending is gone from that frame on).
  assert.ok(states[first - 1].latchPending && states[first - 1].latchPending.area === `${NECK}/rh_neck_extend`);
  assert.equal(states[first].latchPending, null);
  assert.deepEqual(states[first].lookTaken, { regionId: NECK, n: 1 });
  // About the rest time, never before it.
  assert.ok((first + 1) * H >= GAZE_DWELL.latchS - 1e-6, `taken after ${(first + 1) * H}s`);
  assert.ok((first + 1) * H <= GAZE_DWELL.latchS + 2 * H);
  // Staying on the area takes nothing more.
  assert.deepEqual(states[39].lookTaken, { regionId: NECK, n: 1 });
});

check('a look that leaves before the rest time records nothing', () => {
  const { A, s } = started();
  const states = rest(A, s, 8);
  assert.equal(states[7].lookTaken, null);
  let t = A.step(states[7], [away()], H);
  for (let i = 0; i < 40; i++) t = A.step(t, [away()], H);
  assert.equal(t.lookTaken, null);
});

check('a click is not a look: it records nothing here (the card already follows a click by its own rule)', () => {
  const { A, s } = started();
  let t = A.step(s, [{ type: 'muscle', regionId: NECK, actionId: 'rh_neck_extend', regionOnly: false, at: 0 }], H);
  for (let i = 0; i < 40; i++) t = A.step(t, [], H);
  assert.equal(t.lookTaken, null);
  assert.equal(t.pulseClick === true || t.pulseRemaining === 0, true);
});

check('a second rest, on another area, counts on: the card sees each one once', () => {
  const { A, s } = started();
  const one = rest(A, s, 30);
  let t = one[29];
  for (let i = 0; i < 90; i++) t = A.step(t, [away()], H); // the first pulse has ended
  const knee = () => ({ type: 'gaze', kind: 'region', regionId: 'rh_knee', actionId: null, at: 0 });
  const two = rest(A, t, 30, knee);
  assert.deepEqual(two[29].lookTaken, { regionId: 'rh_knee', n: 2 });
  assert.equal(infoTookId(1, two[29]), 'rh_knee');
  assert.equal(infoTookId(2, two[29]), null);
});

check('the state with the record is accepted and copied by the activity (a step from it works)', () => {
  const { A, s } = started();
  const states = rest(A, s, 30);
  const copy = JSON.parse(JSON.stringify(states[29]));
  assert.deepEqual(copy.lookTaken, { regionId: NECK, n: 1 });
  const next = A.step(states[29], [away()], H);
  assert.deepEqual(next.lookTaken, { regionId: NECK, n: 1 });
  assert.notEqual(next.lookTaken, states[29].lookTaken, 'the record is copied, not shared');
});

/** The shell's order each frame: the activity steps with the look, then the card settles with the stepped state. */
function frames(useTook) {
  const { A, s } = started();
  let state = s, lookState = null, seen = 0;
  const out = [];
  for (let i = 0; i < 30; i++) {
    state = A.step(state, [lookNeck()], H);
    const tookId = useTook ? infoTookId(seen, state) : null;
    seen = state.lookTaken ? state.lookTaken.n : 0;
    lookState = infoSettleStep(lookState, { regionId: NECK, t: state.t, keptId: KEPT, clickedId: tookId, levels: {}, pulseId: NECK });
    out.push({ taken: state.lookTaken !== null, settled: lookState.settled, crossed: Object.keys(lookState.crossed), tookId });
  }
  return out;
}

check('the card takes the area in the frame the movement is taken (without the record it was one frame late)', () => {
  const withTook = frames(true), without = frames(false);
  const f = withTook.findIndex(x => x.taken);
  assert.ok(f > 0);
  assert.equal(without.findIndex(x => x.taken), f);
  // Before the movement: the card waits, and the area counts as only crossed.
  assert.equal(withTook[f - 1].settled, false);
  assert.deepEqual(withTook[f - 1].crossed, [NECK]);
  // In the frame of the movement: taken, and no longer among the areas only crossed.
  assert.equal(withTook[f].tookId, NECK);
  assert.equal(withTook[f].settled, true);
  assert.deepEqual(withTook[f].crossed, []);
  // The frame after: the record is not news any more, and the card stays.
  assert.equal(withTook[f + 1].tookId, null);
  assert.equal(withTook[f + 1].settled, true);
  // The fault this guards against: by the card's own count the area was still only crossed in that frame.
  assert.equal(without[f].settled, false);
  assert.deepEqual(without[f].crossed, [NECK]);
});

check('so the card of that frame is the neck card, and it is the one kept when the head has moved the look away', () => {
  const taken = infoOverlayModel({ gaze: gazeOn(NECK), bodyMap: BODY_MOTOR_MAP, regionActivity: { [NECK]: 1 }, settled: true, ignore: {},
    pulse: { regionId: NECK, actionId: 'rh_neck_extend' } });
  assert.equal(taken.mode, 'region');
  assert.equal(taken.viewed, 'now');
  assert.equal(taken.regionId, NECK);
  const kept = infoOverlayModel({ gaze: { target: 'none', regionId: null, actionId: null }, bodyMap: BODY_MOTOR_MAP, regionActivity: { [NECK]: 1 },
    settled: true, ignore: {}, last: taken, pulse: { regionId: NECK, actionId: 'rh_neck_extend' } });
  assert.equal(kept.regionId, NECK);
  assert.ok(Array.isArray(kept.moves) && kept.moves.length === 4);
  // Unsettled, as it was one frame too early, the card stayed on the area before and the neck stayed out of it.
  const before = infoOverlayModel({ gaze: gazeOn(KEPT), bodyMap: BODY_MOTOR_MAP, regionActivity: {}, settled: true, ignore: {} });
  const missed = infoOverlayModel({ gaze: gazeOn(NECK), bodyMap: BODY_MOTOR_MAP, regionActivity: { [NECK]: 1 }, settled: false,
    ignore: { [NECK]: 99 }, last: before, pulse: { regionId: NECK, actionId: 'rh_neck_extend' } });
  assert.equal(missed.regionId, KEPT);
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'look-taken',
  module: target.href,
  cases: results.length,
  failed: failed.length,
  results,
  scope: 'Pure checks that the activity records the area whose movement a look\'s rest took (ns-actions lookTaken), once and in the frame of the movement, and that the information card takes that area in the same frame (ns-app infoTookId with infoSettleStep). Supplied times only; no scene, browser, real look timing or biology.'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
