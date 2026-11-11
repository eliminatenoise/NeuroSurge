/** Deferred-input (refused-frame carry) and overflow-cancellation tests for the R558 controls (ported from the public
 * main's deferred-input suite and adapted: five control keys (W, A, S, D, Space; there is no F key), grasp and turn
 * record tails (the Space gestures), the own-limb press-drag target, and an epoch that ends with both a grasp release
 * and a turn stop).
 * No App, scene, physiological model, browser or filesystem fixture is loaded. The ListenerBucket is the same plain
 * in-memory listener-container double as the pointer suite (not browser DOM / native timing evidence). Proxy queues
 * expose declared lengths and throw on record reads; they allocate no huge event history. performance.now is not
 * replaced. Run: node tests/deferred-input.test.mjs
 */
import assert from 'node:assert/strict';
import { createControls, bindDom } from '../scene/src/ns-controls.mjs';
import { inspectPendingInput, retainDeferredInput, cancelControlsEpoch } from '../scene/src/ns-input-epoch.mjs';
const results = [];
const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
const MASKS = 1 << codes.length;
let capacitySubcases = 0, keyMaskTailSubcases = 0;
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
/** A queued record: a click (down null) or a grasp edge (down true / false). */
const record = (id, down = null, timeMs = performance.now()) => Object.freeze({
  type: down === null ? 'click' : 'grasp', ...(down === null ? {} : { down }), timeMs, id
});
/** A queued limb-turn record (phase 'step' | 'hold' | 'stop'). */
const turnRecord = (id, phase, timeMs = performance.now()) => Object.freeze({ type: 'turn', phase, timeMs, id });
/** A queued game event in short: [type, down or phase, safety]. */
const brief = e => [e.type, e.type === 'turn' ? e.phase : e.down, e.safety === true];
const records = n => Array.from({ length: n }, (_, i) => record(i));
const epochEvents = at => [{ type: 'grasp', down: false, safety: true, timeMs: at }, { type: 'turn', phase: 'stop', safety: true, timeMs: at }];
class ListenerBucket {
  listeners = new Map();
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, fields = {}) {
    const event = { timeStamp: performance.now(), prevented: false,
      preventDefault() { this.prevented = true; }, ...fields };
    for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
    return event;
  }
}

function guardedHistory(length) {
  const reads = { records: 0, iterator: 0 };
  const value = new Proxy([], { get(target, key, receiver) {
    if (key === 'length') return length;
    if (key === Symbol.iterator) { reads.iterator++; throw Error('Canceled history must not be iterated'); }
    if (typeof key === 'string' && /^\d+$/.test(key)) { reads.records++; throw Error('Canceled record must not be read'); }
    return Reflect.get(target, key, receiver);
  } });
  return { value, reads };
}
function adapter(withHook = true, dragItem = 'brain') {
  const api = createControls();
  let state = api.initialState(), hook = () => {};
  const view = new ListenerBucket(), doc = new ListenerBucket(), canvas = new ListenerBucket();
  view.performance = performance; doc.defaultView = view; doc.pointerLockElement = null;
  canvas.ownerDocument = doc;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  const unbind = bindDom(canvas, api, () => state, next => { state = next; }, {
    dragTargetAt: () => dragItem, ...(withHook ? { onBeforeSafetyRelease: () => hook() } : {})
  });
  return { api, view, doc, canvas, unbind, setHook(fn) { hook = fn; },
    get state() { return state; }, set state(next) { state = next; } };
}

check('pending count boundary covers 0, 1, 63, 64 and 65 without consuming input', () => {
  for (const carriedN of [0, 1, 63, 64, 65]) for (const freshN of [0, 1, 63, 64, 65]) {
    capacitySubcases++;
    const carried = Object.freeze(records(carriedN)), fresh = Object.freeze(records(freshN));
    const r = inspectPendingInput(carried, fresh, 64);
    assert.deepEqual(r, { carriedRecords: carriedN, freshRecords: freshN,
      totalRecords: carriedN + freshN, limit: 64, overflow: carriedN + freshN > 64 });
    assert.equal(carried.length, carriedN); assert.equal(fresh.length, freshN);
  }
});

check('complete bounded lists retain object identity, fields, timestamps and stable equal-time order', () => {
  const at = performance.now();
  for (const length of [0, 1, 63, 64]) {
    const raw = Object.freeze(Array.from({ length }, (_, i) => (i % 3 === 0 ? turnRecord(i, ['step', 'hold', 'stop'][i % 9 / 3], at) : record(i, i % 2 === 0, at))));
    const before = structuredClone(raw);
    const r = retainDeferredInput(raw, 64);
    assert.equal(r.overflow, false); assert.equal(r.events.length, length);
    assert.deepEqual(raw, before);
    for (let i = 0; i < length; i++) assert.equal(r.events[i], raw[i]);
  }
});

check('repeated refusal retention never duplicates, drops, retimes or mutates bounded records (grasp and turn tails)', () => {
  const raw = Object.freeze([...records(60), record('grasp-up', false), turnRecord('turn-stop', 'stop'),
    record('grasp-down', true), turnRecord('turn-step', 'step')]);
  const before = structuredClone(raw);
  let waiting = raw;
  for (let retry = 0; retry < 5; retry++) {
    const r = retainDeferredInput(waiting, 64); assert.equal(r.overflow, false);
    waiting = r.events; assert.equal(waiting.length, 64);
    for (let i = 0; i < 64; i++) assert.equal(waiting[i], raw[i]);
  }
  assert.deepEqual(raw, before);
});

for (const tail of [[record('up', false)], [record('up', false), record('fresh-down', true)],
  [turnRecord('stop', 'stop')], [turnRecord('stop', 'stop'), turnRecord('fresh-step', 'step')]]) {
  check(`full64 plus ${tail.length} new ${tail[0].type} records is explicit cancellation, never a truncated pass`, () => {
    const carried = Object.freeze(records(64)), fresh = Object.freeze(tail);
    const r = inspectPendingInput(carried, fresh, 64);
    assert.equal(r.overflow, true); assert.equal(r.totalRecords, 64 + tail.length);
    const rejected = retainDeferredInput([...carried, ...fresh], 64);
    assert.equal(rejected.overflow, true); assert.deepEqual(rejected.events, []);
    assert.equal(rejected.totalRecords, r.totalRecords);
    assert.deepEqual(fresh.map(brief), tail.length === 2
      ? (tail[0].type === 'turn' ? [['turn', 'stop', false], ['turn', 'step', false]] : [['grasp', false, false], ['grasp', true, false]])
      : (tail[0].type === 'turn' ? [['turn', 'stop', false]] : [['grasp', false, false]]), 'the fresh tail was changed');
  });
}

check(`overflow cancellation releases all ${MASKS} key states for both tail orders and permits one fresh press`, () => {
  for (let mask = 0; mask < MASKS; mask++) for (const finalDown of [false, true]) {
    keyMaskTailSubcases++;
    const api = createControls(); let state = api.initialState();
    for (const [i, key] of codes.entries()) if (mask & 1 << i) state = api.keyDown(state, key, performance.now());
    state = api.toggleView(state, performance.now());
    state = api.buttonDown(state, performance.now()); state = api.dragStart(state, mask & 1 ? 'limb' : 'brain');
    const events = [...records(64), record('up', false), ...(finalDown ? [record('new-down', true)] : [])];
    state = { ...state, events }; const before = structuredClone(state); const at = performance.now();
    const r = cancelControlsEpoch(api, state, { timeMs: at, reason: 'deferred-input-overflow' });
    assert.deepEqual(state, before);
    assert.deepEqual(r.state.keys, Object.fromEntries(codes.map(k => [k, false])));
    assert.deepEqual(r.state.events, epochEvents(at));
    assert.deepEqual(r.state.ui, []); assert.equal(r.state.drag.target, null);
    assert.equal(r.state.button.down, false); assert.equal(r.state.button.seq, state.button.seq);
    assert.equal(r.canceled.gameEvents, events.length);
    const fresh = api.keyDown(r.state, 'Space', performance.now());
    assert.equal(fresh.keys.Space, true);
    assert.deepEqual(fresh.events.map(brief), [['grasp', false, true], ['turn', 'stop', true], ['grasp', true, false]]);
    assert.equal(api.keyDown(fresh, 'Space', performance.now()), fresh);
  }
});

check('declared large counts are inspected and canceled without copying or visiting source history', () => {
  const large = guardedHistory(1_000_000_000), api = createControls();
  const capacity = inspectPendingInput(large.value, [], 64);
  assert.equal(capacity.totalRecords, 1_000_000_000); assert.equal(capacity.overflow, true);
  assert.deepEqual(retainDeferredInput(large.value, 64).events, []);
  const base = api.keyDown(api.keyDown(api.initialState(), 'Space', performance.now()), 'KeyW', performance.now());
  const input = { ...base, events: large.value };
  const r = cancelControlsEpoch(api, input, { timeMs: performance.now(), reason: 'deferred-input-overflow' });
  assert.equal(r.canceled.gameEvents, 1_000_000_000); assert.equal(r.state.events.length, 2);
  assert.deepEqual(large.reads, { records: 0, iterator: 0 });
  assert.equal(input.events, large.value); assert.equal(input.keys.Space, true); assert.equal(input.keys.KeyW, true);
});

for (const dragItem of ['brain', 'limb']) {
  check(`pre-safety hook may cancel through the handle without recursion or stale state overwrite (${dragItem} press)`, () => {
    const f = adapter(true, dragItem);
    try {
      f.canvas.emit('mousedown', { target: f.canvas, clientX: 100, clientY: 120, buttons: 1 });
      f.state = f.api.keyDown(f.api.keyDown(f.state, 'Space', performance.now()), 'KeyW', performance.now());
      const guarded = guardedHistory(1_000_000_000);
      f.state = { ...f.state, events: guarded.value };
      let calls = 0;
      f.setHook(() => {
        calls++; const before = f.state;
        assert.equal(inspectPendingInput([], before.events, 64).overflow, true);
        const at = performance.now();
        f.unbind.cancelInput(at, { discardQueued: true });
        f.state = cancelControlsEpoch(f.api, before, { timeMs: at, reason: 'deferred-input-overflow' }).state;
      });
      f.view.emit('blur');
      assert.equal(calls, 1); assert.equal(f.state.events.length, 2);
      assert.deepEqual(f.state.events.map(brief), [['grasp', false, true], ['turn', 'stop', true]]);
      assert.equal(f.state.keys.Space, false); assert.equal(f.state.keys.KeyW, false); assert.equal(f.state.button.down, false);
      assert.equal(f.state.drag.target, null);
      const status = f.unbind.status();
      assert.equal(status.pressDrag, false); assert.equal(status.arrowPress, false); assert.equal(status.dragging, false);
      assert.deepEqual(guarded.reads, { records: 0, iterator: 0 });
    } finally { f.unbind(); }
  });
}

check('standalone default release preserves ordinary queued timestamps and UI requests', () => {
  const f = adapter(false);
  try {
    f.state = f.api.keyDown(f.state, 'Space', performance.now());
    f.state = f.api.click(f.state, performance.now());
    f.state = f.api.toggleView(f.state, performance.now());
    const old = f.state.events.slice(), ui = f.state.ui[0];
    assert.deepEqual(old.map(brief), [['grasp', true, false], ['click', undefined, false]]);
    const e = f.view.emit('blur');
    assert.equal(f.state.events[0], old[0]); assert.equal(f.state.events[1], old[1]); assert.equal(f.state.events.length, 3);
    assert.deepEqual(f.state.events[2], { type: 'grasp', down: false, safety: true, timeMs: e.timeStamp });
    assert.equal(f.state.ui[0], ui);
  } finally { f.unbind(); }
});

check('standalone default release stops a slow turn (a double tap held) once, after its queued records', () => {
  const f = adapter(false);
  try {
    const t0 = performance.now();
    f.state = f.api.keyDown(f.state, 'Space', t0);
    f.state = f.api.keyUp(f.state, 'Space', t0 + 40);
    f.state = f.api.keyDown(f.state, 'Space', t0 + 120);      // the second tap of a double tap ...
    f.state = f.api.tickSpace(f.state, t0 + 120 + 300);       // ... still held past the tap limit: the slow turn
    const old = f.state.events.slice();
    assert.deepEqual(old.map(brief), [['grasp', true, false], ['grasp', false, false], ['turn', 'step', false], ['turn', 'hold', false]]);
    assert.equal(old[3].timeMs, t0 + 120 + 250);
    const e = f.view.emit('blur');
    assert.equal(f.state.events.length, 5);
    old.forEach((ev, i) => assert.equal(f.state.events[i], ev));
    assert.deepEqual(f.state.events[4], { type: 'turn', phase: 'stop', safety: true, timeMs: e.timeStamp });
    assert.equal(f.state.keys.Space, false);
    assert.equal(f.view.emit('blur') && f.state.events.length, 5, 'a second blur repeated the stop');
  } finally { f.unbind(); }
});

check('final safety cleanup still runs when owner hook throws', () => {
  const f = adapter();
  try {
    f.state = f.api.keyDown(f.api.keyDown(f.state, 'Space', performance.now()), 'KeyW', performance.now());
    f.setHook(() => { throw Error('supplied policy failure'); });
    assert.throws(() => f.view.emit('blur'), /supplied policy failure/);
    assert.equal(f.state.keys.Space, false); assert.equal(f.state.keys.KeyW, false);
    assert.equal(f.state.events.at(-1).safety, true); assert.equal(f.state.events.at(-1).type, 'grasp');
  } finally { f.unbind(); }
});

check('invalid capacity arguments fail without consuming or changing records', () => {
  const raw = Object.freeze(records(1));
  for (const limit of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => inspectPendingInput(raw, [], limit), TypeError);
    assert.throws(() => retainDeferredInput(raw, limit), TypeError);
  }
  assert.throws(() => inspectPendingInput(null, [], 64), TypeError);
  assert.equal(raw.length, 1);
});

const failures = results.filter(r => !r.passed).length;
process.stdout.write(JSON.stringify({ suite: 'deferred-input', scope: 'pure pending records, Controls and in-memory adapter doubles only; no native/model/timing proof',
  namedCases: results.length, capacitySubcases, keyMaskTailSubcases, failures, results }, null, 2) + '\n');
process.exitCode = failures ? 1 : 0;
