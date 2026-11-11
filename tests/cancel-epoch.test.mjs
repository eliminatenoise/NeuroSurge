/** Pure in-memory cancellation properties. No App, scene, model, DOM or browser is loaded.
 * Real Node performance.now supplies observation arguments; no clock is replaced or advanced.
 * These checks establish software state only, not physical input or rendered timing.
 */
import assert from 'node:assert/strict';
import { createControls, initialArrowInput, stepArrowInput } from '../scene/src/ns-controls.mjs';
import { cancelControlsEpoch, cancelCarryLatches } from '../scene/src/ns-input-epoch.mjs';

const results = [];
const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
function canceled(api, state, reason = 'pause') {
  const at = performance.now();
  return { at, ...cancelControlsEpoch(api, state, { timeMs: at, reason }) };
}
function assertBoundary(api, value, at) {
  assert.deepEqual(value.keys, Object.fromEntries(codes.map(k => [k, false])));
  assert.deepEqual(value.events, [{ type: 'space', down: false, safety: true, timeMs: at }]);
  assert.deepEqual(value.ui, []);
  assert.equal(value.button.down, false);
  assert.equal(value.drag.target, null);
  assert.equal(value.pointer, null);
  assert.equal(value.lookMs, null);
  assert.deepEqual(api.axes(value), { x: 0, z: 0 });
}

for (const target of [null, 'brain', 'mirror', 'arrow']) {
  check(`all 32 key states cancel with ${target || 'no'} gesture`, () => {
    for (let mask = 0; mask < 32; mask++) {
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
      if (target === 'brain' || target === 'mirror') {
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
      assert.notEqual(next.state.events, state.events);
      assert.notEqual(next.state.ui, state.ui);
    }
  });
}

check('already released controls still request a model-side safety release', () => {
  const api = createControls();
  let state = api.keyDown(api.initialState(), 'Space', performance.now());
  state = api.keyUp(state, 'Space', performance.now());
  const next = canceled(api, state);
  assert.equal(state.keys.Space, false);
  assertBoundary(api, next.state, next.at);
  assert.equal(next.canceled.gameEvents, 2);
});

check('empty controls still end any separately held model tap chain', () => {
  const api = createControls();
  const next = canceled(api, api.initialState(), 'blur');
  assertBoundary(api, next.state, next.at);
  assert.equal(next.canceled.gameEvents, 0);
});

check('repeated boundaries retain only one identified safety release', () => {
  const api = createControls();
  let state = api.keyDown(api.initialState(), 'Space', performance.now());
  for (const reason of ['leave-playing', 'blur', 'visibility', 'enter-playing', 'reset-body']) {
    const next = canceled(api, state, reason);
    assertBoundary(api, next.state, next.at);
    state = next.state;
  }
});

check('new Space input follows cancellation once and in order', () => {
  const api = createControls();
  const cancel = canceled(api, api.keyDown(api.initialState(), 'Space', performance.now()));
  const at = performance.now();
  let state = api.keyDown(cancel.state, 'Space', at);
  const again = api.keyDown(state, 'Space', at);
  assert.equal(again, state, 'repeat must not duplicate a fresh press');
  assert.deepEqual(state.events.map(e => [e.down, e.safety === true]), [[false, true], [true, false]]);
  assert.equal(state.events[1].timeMs, at);
  assert.equal(api.drainEvents(state).length, 2);
  assert.equal(api.drainEvents(state).length, 0, 'ordinary delivery remains once-only');
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

const failures = results.filter(r => !r.passed).length;
process.stdout.write(JSON.stringify({ scope: 'pure helper and Controls state only; App/DOM/model/browser not executed',
  namedCases: results.length, keyMaskSubcases: 128, failures, results }) + '\n');
process.exitCode = failures ? 1 : 0;
