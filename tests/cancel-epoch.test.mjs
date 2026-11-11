/** Pure in-memory cancellation properties for the R558 controls (ported from the public main's cancel-epoch suite and
 * adapted: five control keys (W, A, S, D, Space; there is no F key), Space read as gestures (a hold or a tap takes
 * hold, a double tap turns the limbs, a double tap held keeps turning them slowly), the press-drag targets brain /
 * mirror body / own limb, and an epoch that ends with BOTH a grasp release and a turn stop). The last cases feed the
 * epoch's releases into the real R558 activity model (ns-actions: the limb turn and the brain grab). No App, scene,
 * DOM or browser is loaded.
 * Real Node performance.now supplies observation arguments; no clock is replaced or advanced. Cases about the length
 * of a press (tap or hold) supply explicit observation times: a real base time plus the stated offsets.
 * These checks establish software state only, not physical input or rendered timing.
 * Run: node tests/cancel-epoch.test.mjs
 */
import assert from 'node:assert/strict';
import { createControls, initialArrowInput, stepArrowInput } from '../scene/src/ns-controls.mjs';
import { cancelControlsEpoch, cancelCarryLatches, EPOCH_RELEASES } from '../scene/src/ns-input-epoch.mjs';
import { createActivity } from '../scene/src/ns-actions.mjs';

const results = [];
const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
const MASKS = 1 << codes.length;
let keyMaskSubcases = 0;
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
function canceled(api, state, reason = 'pause') {
  const at = performance.now();
  return { at, ...cancelControlsEpoch(api, state, { timeMs: at, reason }) };
}
const epochEvents = at => [{ type: 'grasp', down: false, safety: true, timeMs: at }, { type: 'turn', phase: 'stop', safety: true, timeMs: at }];
/** A queued game event in short: [type, down or phase, safety]. */
const brief = e => [e.type, e.type === 'turn' ? e.phase : e.down, e.safety === true];
function assertBoundary(api, value, at) {
  assert.deepEqual(value.keys, Object.fromEntries(codes.map(k => [k, false])));
  assert.deepEqual(value.events, epochEvents(at));
  assert.deepEqual(value.ui, []);
  assert.equal(value.button.down, false);
  assert.equal(value.drag.target, null);
  assert.equal(value.pointer, null);
  assert.equal(value.lookMs, null);
  assert.deepEqual(api.axes(value), { x: 0, z: 0 });
  const sp = api.spaceGesture(value);
  assert.deepEqual([sp.role, sp.grasp, sp.turn, sp.tapMs, sp.behind], [null, 'none', 'none', null, false], 'the Space gesture survived the boundary');
}

check('the epoch releases are exactly a grasp release and a turn stop', () => {
  assert.deepEqual(EPOCH_RELEASES.map(ev => ({ ...ev })), [{ type: 'grasp', down: false, safety: true }, { type: 'turn', phase: 'stop', safety: true }]);
  assert.ok(Object.isFrozen(EPOCH_RELEASES) && EPOCH_RELEASES.every(Object.isFrozen));
});

for (const target of [null, 'brain', 'mirror', 'limb', 'arrow']) {
  check(`all ${MASKS} key states cancel with ${target || 'no'} gesture`, () => {
    for (let mask = 0; mask < MASKS; mask++) {
      keyMaskSubcases++;
      const api = createControls();
      let state = api.initialState();
      for (const [i, code] of codes.entries()) if (mask & 1 << i) state = api.keyDown(state, code, performance.now());
      state = api.click(state, performance.now());
      state = api.toggleView(state, performance.now());
      state = api.toggleDetail(state, performance.now());
      state = api.pointerAt(state, 100, 120, performance.now());
      assert.ok(state.pointer, 'pointer setup must actually produce a retained pointer');
      state = api.pointerMove(state, 4, -3, performance.now());
      if (target) state = api.buttonDown(state, performance.now(), { via: 'pointer', x: 100, y: 120 });
      if (target && target !== 'arrow') {
        state = api.dragStart(state, target);
        state = api.dragMove(state, 12, 9);
        assert.equal(state.drag.target, target);
        assert.equal(state.drag.turning, true, 'drag setup must actually cross the drag threshold');
      }
      const before = structuredClone(state);
      const next = canceled(api, state);
      assertBoundary(api, next.state, next.at);
      assert.equal(next.state.button.seq, state.button.seq);
      assert.equal(next.state.yaw, state.yaw);
      assert.equal(next.state.pitch, state.pitch);
      assert.deepEqual(state, before, 'cancellation must not mutate old queues/state');
      assert.equal(next.canceled.gameEvents, state.events.length);
      assert.equal(next.canceled.uiEvents, state.ui.length);
      assert.equal(next.canceled.observedAtMs, next.at);
      assert.equal(next.canceled.reason, 'pause');
      assert.equal(next.canceled.dragTarget, target && target !== 'arrow' ? target : null);
      assert.notEqual(next.state.events, state.events);
      assert.notEqual(next.state.ui, state.ui);
    }
  });
}

check('already released controls still request model-side safety releases', () => {
  const api = createControls(), t0 = performance.now();
  let state = api.keyDown(api.initialState(), 'Space', t0);
  state = api.keyUp(state, 'Space', t0 + 400);   // a hold: took hold, let go
  state = api.keyDown(state, 'Space', t0 + 1000);
  state = api.keyUp(state, 'Space', t0 + 1040);  // a tap: took hold and keeps it, with no key down
  assert.equal(state.keys.Space, false);
  assert.equal(api.spaceGesture(state).grasp, 'kept', 'test setup: the tap did not keep its hold');
  assert.deepEqual(state.events.map(brief), [['grasp', true, false], ['grasp', false, false], ['grasp', true, false]]);
  const next = canceled(api, state);
  assertBoundary(api, next.state, next.at);
  assert.equal(next.canceled.gameEvents, 3);
});

check('empty controls still end any separately held model turn, tap chain or grasp', () => {
  const api = createControls();
  const next = canceled(api, api.initialState(), 'blur');
  assertBoundary(api, next.state, next.at);
  assert.equal(next.canceled.gameEvents, 0);
});

check('repeated boundaries retain only one identified pair of safety releases', () => {
  const api = createControls();
  let state = api.keyDown(api.keyDown(api.initialState(), 'Space', performance.now()), 'KeyW', performance.now());
  for (const reason of ['leave-playing', 'blur', 'visibility', 'enter-playing', 'reset-body', 'reset-brain', 'display-rescue']) {
    const next = canceled(api, state, reason);
    assertBoundary(api, next.state, next.at);
    state = next.state;
  }
});

check('new Space input follows cancellation once and in order', () => {
  const api = createControls();
  const cancel = canceled(api, api.keyDown(api.initialState(), 'Space', performance.now()));
  const at = performance.now();
  const state = api.keyDown(cancel.state, 'Space', at);
  const again = api.keyDown(state, 'Space', at);
  assert.equal(again, state, 'repeat must not duplicate a fresh press');
  assert.deepEqual(state.events.map(brief), [['grasp', false, true], ['turn', 'stop', true], ['grasp', true, false]]);
  assert.equal(state.events[2].timeMs, at);
  assert.equal(api.drainEvents(state).length, 3);
  assert.equal(api.drainEvents(state).length, 0, 'ordinary delivery remains once-only');
});

check('a tap before the boundary cannot make the first press after it a double tap', () => {
  const api = createControls(), t0 = performance.now();
  let state = api.keyDown(api.initialState(), 'Space', t0);
  state = api.keyUp(state, 'Space', t0 + 40);
  const cancel = cancelControlsEpoch(api, state, { timeMs: t0 + 60, reason: 'pause' });
  state = api.keyDown(cancel.state, 'Space', t0 + 120); // inside the double-tap window of the tap at t0
  assert.deepEqual(state.events.map(brief), [['grasp', false, true], ['turn', 'stop', true], ['grasp', true, false]]);
  assert.equal(api.spaceGesture(state).role, 'grasp');
});

check('a slow turn held across the boundary is forgotten: its late key-up queues nothing', () => {
  const api = createControls(), t0 = performance.now();
  let state = api.keyDown(api.initialState(), 'Space', t0);
  state = api.keyUp(state, 'Space', t0 + 40);
  state = api.keyDown(state, 'Space', t0 + 120);
  state = api.tickSpace(state, t0 + 120 + 300);
  assert.deepEqual(state.events.map(brief), [['grasp', true, false], ['grasp', false, false], ['turn', 'step', false], ['turn', 'hold', false]]);
  const cancel = cancelControlsEpoch(api, state, { timeMs: t0 + 500, reason: 'blur' });
  assertBoundary(api, cancel.state, t0 + 500);
  const late = api.keyUp(cancel.state, 'Space', t0 + 600);
  assert.equal(late, cancel.state, 'a key-up after the boundary acted');
  assert.equal(api.tickSpace(cancel.state, t0 + 900), cancel.state, 'the clock acted after the boundary');
});

check('canceled unseen arrow press cannot orbit; next genuine press orbits once', () => {
  const api = createControls();
  const hit = { target: 'brain', dir: 'right', blocked: null };
  let state = api.buttonDown(api.initialState(), performance.now(), { via: 'pointer', x: 100, y: 120 });
  const cancel = canceled(api, state);
  state = cancel.state;
  const seed = { ...initialArrowInput(), seq: state.button.seq };
  const frame = () => ({ playing: true, nowMs: performance.now(), button: api.buttonState(state), hit });
  const idle = stepArrowInput(seed, frame());
  assert.equal(idle.orbit.length, 0);
  assert.equal(idle.state.press, null);
  state = api.buttonDown(state, performance.now(), { via: 'pointer', x: 100, y: 120 });
  const fresh = stepArrowInput(idle.state, frame());
  assert.equal(state.button.seq, 2);
  assert.equal(fresh.events.filter(e => e.type === 'arrowPress').length, 1);
  assert.equal(fresh.orbit.filter(e => e.hold === false).length, 1);
  const repeated = stepArrowInput(fresh.state, frame());
  assert.equal(repeated.events.filter(e => e.type === 'arrowPress').length, 0, 'same press is not replayed');
  assert.equal(repeated.orbit.filter(e => e.hold === false).length, 0);
  // Real scheduling gaps may owe legitimate held steps; never force or falsify their clock.
  state = api.buttonUp(state, performance.now());
  const released = stepArrowInput(repeated.state, frame());
  assert.equal(released.orbit.length, 0);
  assert.equal(released.state.press, null);
});

check('cancellation preserves look settings, limits and view command identity', () => {
  const api = createControls({ sensitivity: 2, invertY: true });
  let state = api.setPitchLimits(api.initialState(), { minDeg: -40, maxDeg: 30 });
  state = api.toggleView(state, performance.now());
  const next = canceled(api, state);
  assert.deepEqual(next.state.look, state.look);
  assert.deepEqual(next.state.pitchLimits, state.pitchLimits);
  assert.equal(next.state.viewSeq, state.viewSeq);
  assert.equal(next.state.ui.length, 0, 'view sequence is provenance, not a deferred command');
});

check('invalid observation arguments fail without altering input', () => {
  const api = createControls();
  const state = api.keyDown(api.initialState(), 'Space', performance.now());
  const copy = structuredClone(state);
  for (const timeMs of [NaN, Infinity, undefined]) {
    assert.throws(() => cancelControlsEpoch(api, state, { timeMs, reason: 'pause' }), TypeError);
  }
  for (const reason of ['', undefined, 'x'.repeat(65)]) {
    assert.throws(() => cancelControlsEpoch(api, state, { timeMs: performance.now(), reason }), TypeError);
  }
  assert.deepEqual(state, copy);
});

check('transient carry latches cancel without changing saved placement or unrelated state', () => {
  const placement = { yaw: 0.2, pitch: -0.1 };
  const source = {
    t: 4.2, pose: { opaque: 'retained' },
    activity: { spaceHeld: true, spaceTapAt: 3, brainGrab: { active: true, startYaw: 0.1 },
      brainPlacement: placement, seedNextGaze: false },
    view: { grab: { active: true, baseYaw: 0.1 }, offset: placement, orbit: { yaw: 10, pitch: 5 }, source: { grab: 'activity' } },
    referenceBrain: { anchor: { opaque: 'transient' }, translation: [1, 2, 3], pivotWorld: [4, 5, 6], initialPivotWorld: [7, 8, 9] },
    objectBrainReference: { anchor: { opaque: 'transient' }, translation: [2, 3, 4], pivotWorld: [5, 6, 7], initialPivotWorld: [8, 9, 10] }
  };
  const before = structuredClone(source);
  const next = cancelCarryLatches(source);
  assert.deepEqual(source, before);
  assert.equal(next.activity.brainGrab.active, false);
  assert.equal(next.activity.seedNextGaze, true);
  assert.equal(next.view.grab.active, false);
  assert.equal(next.referenceBrain.anchor, null);
  assert.equal(next.objectBrainReference.anchor, null);
  const expected = structuredClone(before);
  expected.activity.brainGrab.active = false; expected.activity.seedNextGaze = true;
  expected.view.grab.active = false; expected.referenceBrain.anchor = null; expected.objectBrainReference.anchor = null;
  assert.deepEqual(next, expected, 'only declared transient latch fields may change');
  assert.equal(cancelCarryLatches(next), next, 'repeated latch cancellation is idempotent');
});

check('unavailable or inactive carry records retain identity', () => {
  assert.equal(cancelCarryLatches(null), null);
  const empty = {};
  assert.equal(cancelCarryLatches(empty), empty);
  const source = { activity: { brainGrab: { active: false } }, view: { grab: { active: false } }, referenceBrain: { anchor: null } };
  assert.equal(cancelCarryLatches(source), source);
});

// ---- R558 activity model: what the epoch's releases do to the limb turn and the brain grab ---------------------------
const epochForModel = () => EPOCH_RELEASES.map(ev => ({ ...ev, at: 0 }));
function playingActivity() {
  const A = createActivity();
  return { A, s: A.step(A.state, [], 2.5) }; // past the start instructions
}

check('activity: the epoch stops a running slow turn where it is; a later double tap still steps', () => {
  const { A, s: start } = playingActivity();
  let s = start;
  s = A.step(s, [{ type: 'turn', phase: 'step', at: 0 }], 0.05);
  assert.equal(s.rotationSeq, 1); assert.equal(s.dance.mode, 'step'); assert.equal(s.dance.active, true);
  s = A.step(s, [{ type: 'turn', phase: 'hold', at: 0 }], 0.05);
  assert.equal(s.spaceHeld, true); assert.equal(s.dance.mode, 'hold'); assert.equal(s.dance.active, true);
  s = A.step(s, epochForModel(), 0.05);
  assert.equal(s.spaceHeld, false, 'the slow turn stayed held across the boundary');
  assert.equal(s.dance.active, false, 'the turn kept running after the boundary');
  assert.equal(s.dance.mode, null);
  assert.equal(s.spaceTapAt, null, 'the tap chain survived the boundary');
  assert.equal(s.rotationSeq, 1, 'the boundary itself counted as a turn');
  const rest = A.step(s, [], 0.2);
  assert.equal(rest.dance.active, false, 'the turn restarted by itself');
  s = A.step(s, [{ type: 'turn', phase: 'step', at: 0 }], 0.05);
  assert.equal(s.rotationSeq, 2); assert.equal(s.dance.mode, 'step'); assert.equal(s.dance.active, true);
});

check('activity: a double tap\'s step ends by itself; a held one goes on until the stop', () => {
  const { A, s: start } = playingActivity();
  let s = A.step(start, [{ type: 'turn', phase: 'step', at: 0 }], 0.05), steps = 0;
  while (s.dance.active && steps < 200) { s = A.step(s, [], 0.05); steps++; }
  assert.equal(s.dance.active, false, 'a step never ended'); assert.equal(s.dance.mode, null);
  assert.ok(steps * 0.05 < 3, 'one step took longer than three seconds');
  s = A.step(s, [{ type: 'turn', phase: 'step', at: 0 }, { type: 'turn', phase: 'hold', at: 0 }], 0.05);
  for (let i = 0; i < 200; i++) s = A.step(s, [], 0.05);
  assert.equal(s.dance.active, true, 'the slow turn stopped while its key was held'); assert.equal(s.dance.mode, 'hold');
  s = A.step(s, [{ type: 'turn', phase: 'stop', at: 0 }], 0.05);
  assert.equal(s.dance.active, false); assert.equal(s.spaceHeld, false);
});

check('activity: the epoch lets go of a brain grab started with Space; with nothing held it changes nothing', () => {
  const { A, s: start } = playingActivity();
  let s = start;
  s = A.step(s, [{ type: 'gaze', kind: 'glass', yaw: 0.1, pitch: 0.05, at: 0 }], 0.05);
  s = A.step(s, [{ type: 'grasp', down: true, target: 'brain', at: 0 }], 0.05);
  assert.equal(s.brainGrab.active, true, 'test setup: Space did not grab the brain');
  s = A.step(s, epochForModel(), 0.05);
  assert.equal(s.brainGrab.active, false, 'the brain stayed held across the boundary');
  const idle = A.step(s, [], 0.05), again = A.step(s, epochForModel(), 0.05);
  for (const k of ['spaceHeld', 'spaceTapAt', 'rotationSeq', 'grabSeq']) assert.deepEqual(again[k], idle[k], `${k} changed by a no-op epoch`);
  assert.deepEqual(again.brainGrab, idle.brainGrab);
  assert.deepEqual(again.dance, idle.dance);
});

const failures = results.filter(r => !r.passed).length;
process.stdout.write(JSON.stringify({ suite: 'cancel-epoch', scope: 'pure helper, Controls and activity-model state only; App/DOM/browser not executed',
  namedCases: results.length, keyMaskSubcases, failures, results }, null, 2) + '\n');
process.exitCode = failures ? 1 : 0;
