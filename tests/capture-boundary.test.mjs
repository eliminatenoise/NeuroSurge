/** Pure Controls acceptance for pointer-capture boundaries with the R558 controls (ported from the public main's
 * capture-boundary suite and adapted: five control keys (W, A, S, D, Space; there is no F key), the press-drag targets
 * brain / mirror body / own limb, and the safety release that lets go of a Space grasp).
 * A repeated captured pointerlockchange notification is not a new input boundary: held keys, queued records and the
 * press / drag in progress survive it; a genuine acquisition or loss, Esc, blur, visibility and Ctrl / Meta chords
 * still safety-release everything.
 * Controls and its math dependency only; no App, scene, model, browser, native fixture, or clock override. Real Node
 * performance.now supplies every observation, with one declared exception: Space is a gesture (a press shorter than
 * 250 ms is a TAP, which keeps its hold and queues no release), so every supplied Space key-down here carries an
 * observation time HOLD_MS in the past. Its key-up is then a HOLD release. The file waits once, for real, at its start so
 * that such a time is a valid (positive) one; no clock is replaced or advanced. Supplied events prove software semantics
 * only.
 * Run: node tests/capture-boundary.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-controls.mjs', import.meta.url);
const api = await import(target.href);
const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
const MASKS = 1 << codes.length, ALL = MASKS - 1, SPACE = 16;
/** How long ago each supplied Space key-down says it happened: longer than a tap, so its key-up lets go. */
const HOLD_MS = 400;
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, HOLD_MS + 50); // a real wait; see the header
assert.ok(performance.now() > HOLD_MS, 'the process is too young for a held Space observation');
assert.ok(HOLD_MS >= api.SPACE_GESTURE.tapMaxMs, 'HOLD_MS is not longer than a tap');
const results = [];
let safetyMaskSubcases = 0;

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

function adapter({ locked = true, kind = 'brain', requestLock = false, beforeSafetyLock = null } = {}) {
  const controls = api.createControls();
  let state = controls.initialState();
  const view = new ListenerBucket(), doc = new ListenerBucket(), canvas = new ListenerBucket();
  view.performance = performance;
  doc.defaultView = view;
  canvas.ownerDocument = doc;
  doc.pointerLockElement = locked ? canvas : null;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  const calls = { beforeSafety: 0, lock: [], error: 0, view: [], request: 0 };
  if (requestLock) canvas.requestPointerLock = () => { calls.request += 1; };
  const unbind = api.bindDom(canvas, controls, () => state, next => { state = next; }, {
    dragTargetAt: () => ['brain', 'mirror', 'limb'].includes(kind) ? kind : null,
    onBeforeSafetyRelease: () => { calls.beforeSafety += 1; if (beforeSafetyLock !== null) beforeSafetyLock(doc, canvas); },
    onLockChange: value => { calls.lock.push(value); },
    onLockError: () => { calls.error += 1; },
    onView: value => { calls.view.push(value); }
  });
  const point = { target: canvas, clientX: 120, clientY: 160 };
  return {
    controls, view, doc, canvas, unbind, calls,
    get state() { return state; },
    key(code, fields = {}) {
      return view.emit('keydown', { target: canvas, code, repeat: false,
        ...(code === 'Space' ? { timeStamp: performance.now() - HOLD_MS } : {}), ...fields });
    },
    keyUp(code, fields = {}) { return view.emit('keyup', { target: canvas, code, ...fields }); },
    seedMask(mask) { for (const [i, code] of codes.entries()) if (mask & (1 << i)) this.key(code); },
    down(buttons = 1) { return canvas.emit('mousedown', { ...point, buttons }); },
    move(buttons = 1, movementX = 12, movementY = 3) {
      return doc.emit('mousemove', { ...point, buttons, movementX, movementY });
    },
    up(buttons = 0) { return view.emit('mouseup', { ...point, buttons }); },
    lock(value) { doc.pointerLockElement = value ? canvas : null; return doc.emit('pointerlockchange'); },
    duplicate() { return doc.emit('pointerlockchange'); }
  };
}

function using(options, fn) { const f = adapter(options); try { fn(f); } finally { f.unbind(); } }
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const clicks = state => state.events.filter(e => e.type === 'click');
/** Safety records (a grasp let go, a limb turn stopped), in queue order. */
const safety = state => state.events.filter(e => e.safety === true && ((e.type === 'grasp' && !e.down) || (e.type === 'turn' && e.phase === 'stop')));
/** The safety records a boundary must append for a key mask: the Space grasp is let go. No limb turn runs in this file
 * (Space is never double-tapped), so no turn stop is due. */
const expectedSafety = (mask, timeMs) => (mask & SPACE ? [{ type: 'grasp', down: false, safety: true, timeMs }] : []);
/** Every grasp release in the queue (genuine and safety). */
const graspUps = state => state.events.filter(e => e.type === 'grasp' && !e.down);
const noKeys = () => Object.fromEntries(codes.map(code => [code, false]));
const flagsOff = f => {
  const status = f.unbind.status();
  assert.equal(status.dragging, false);
  assert.equal(status.pressDrag, false);
  assert.equal(status.arrowPress, false);
};
function recordsExact(actual, expected) {
  assert.equal(actual.length, expected.length, 'record count changed');
  expected.forEach((record, i) => assert.equal(actual[i], record, `record identity/order changed at ${i}`));
}
function unchangedByDuplicate(f, count = 3) {
  const before = f.state, copy = structuredClone(before), status = f.unbind.status();
  const events = before.events.slice(), ui = before.ui.slice(), calls = structuredClone(f.calls);
  for (let i = 0; i < count; i += 1) {
    const event = f.duplicate();
    assert.ok(Number.isFinite(event.timeStamp) && event.timeStamp > 0);
    assert.equal(event.prevented, false);
    assert.equal(f.state, before, 'repeated captured notification changed reducer state');
    assert.deepEqual(f.state, copy, 'prior state or timestamps were mutated');
    recordsExact(f.state.events, events);
    recordsExact(f.state.ui, ui);
    assert.deepEqual(f.unbind.status(), status, 'pointer gesture changed');
    assert.deepEqual(f.calls, calls, 'duplicate invoked an owner, view, lock, error, or request callback');
  }
}

for (let mask = 0; mask < MASKS; mask += 1) {
  check(`captured duplicate preserves exact key mask ${mask}, queued records and held brain gesture`, () => {
    using({}, f => {
      f.key('KeyE'); f.key('Space'); f.keyUp('Space');
      f.down(); f.up(); // An ordinary deferred click, before the held gesture.
      f.key('KeyE');
      f.seedMask(mask); f.down(); f.move();
      assert.deepEqual(f.state.keys, Object.fromEntries(codes.map((code, i) => [code, Boolean(mask & (1 << i))])));
      assert.equal(clicks(f.state).length, 1);
      assert.equal(f.state.ui.length, 2);
      assert.equal(f.state.viewSeq, 2);
      assert.equal(f.state.button.seq, 2);
      assert.equal(f.state.button.down, true);
      assert.equal(f.state.drag.target, 'brain');
      assert.equal(f.state.drag.turning, true);
      assert.equal(f.unbind.status().pressDrag, true);
      assert.equal(safety(f.state).length, 0);
      unchangedByDuplicate(f);
    });
  });
}

for (const kind of ['brain', 'mirror', 'limb']) {
  check(`${kind}: duplicate retains unturned press until genuine final release, then exactly one click`, () => {
    using({ kind }, f => {
      f.seedMask(1 + 8 + SPACE); f.down();
      const before = f.state;
      unchangedByDuplicate(f);
      const up = f.up();
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, before.button.seq);
      assert.equal(f.state.button.upMs, up.timeStamp);
      assert.equal(f.state.drag.target, null);
      assert.equal(clicks(f.state).length, 1);
      assert.equal(clicks(f.state)[0].timeMs, up.timeStamp);
      assert.deepEqual(f.state.keys, before.keys);
      const released = f.keyUp('Space');
      assert.equal(graspUps(f.state).length, 1);
      assert.equal(graspUps(f.state)[0].timeMs, released.timeStamp);
      assert.equal(graspUps(f.state)[0].safety, undefined, 'final genuine Space keyup was replaced with a safety release');
      f.up(); f.keyUp('Space');
      assert.equal(clicks(f.state).length, 1, 'repeated final release duplicated the click');
      assert.equal(graspUps(f.state).length, 1, 'repeated final release let go twice');
      assert.equal(f.state.events.filter(e => e.type === 'turn').length, 0, 'a held Space started a limb turn');
      flagsOff(f);
    });
  });
  check(`${kind}: turned press survives duplicates and partial release without a phantom click`, () => {
    using({ kind }, f => {
      f.seedMask(ALL); f.down(); f.move();
      const before = f.state;
      unchangedByDuplicate(f);
      f.up(1);
      assert.equal(f.state, before, 'partial button release ended the gesture');
      f.move(1, 4, 2);
      assert.equal(f.state.button.seq, 1);
      assert.equal(f.state.drag.target, kind);
      assert.equal(f.state.drag.dx, before.drag.dx + 4);
      const up = f.up();
      assert.equal(f.state.button.upMs, up.timeStamp);
      assert.equal(clicks(f.state).length, 0);
      assert.equal(f.state.drag.target, null);
      flagsOff(f);
    });
  });
  check(`${kind}: reliable buttons-zero after duplicate still cancels at observation time`, () => {
    using({ kind }, f => {
      f.seedMask(ALL); f.down();
      unchangedByDuplicate(f);
      const before = f.state;
      const observed = f.move(0, NaN, Infinity);
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, before.button.seq);
      assert.equal(f.state.button.upMs, observed.timeStamp);
      assert.equal(f.state.drag.target, null);
      assert.deepEqual(f.state.keys, before.keys);
      recordsExact(f.state.events, before.events);
      assert.equal(clicks(f.state).length, 0);
      f.up();
      assert.equal(clicks(f.state).length, 0);
      flagsOff(f);
    });
  });
}

check('captured look retains queued E/click chronology and button sequence through duplicates', () => {
  using({ kind: 'look' }, f => {
    const firstE = f.key('KeyE');
    const firstDown = f.down(); f.up();
    const secondE = f.key('KeyE');
    const secondDown = f.down(); f.move();
    assert.deepEqual(f.state.ui.map(e => [e.type, e.seq, e.timeMs]),
      [['view', 1, firstE.timeStamp], ['view', 2, secondE.timeStamp]]);
    assert.deepEqual(f.state.events.map(e => [e.type, e.timeMs]),
      [['click', firstDown.timeStamp], ['click', secondDown.timeStamp]]);
    assert.ok(firstE.timeStamp <= firstDown.timeStamp && firstDown.timeStamp <= secondE.timeStamp && secondE.timeStamp <= secondDown.timeStamp);
    assert.equal(f.state.button.seq, 2);
    unchangedByDuplicate(f);
    f.up();
    assert.equal(clicks(f.state).length, 2, 'final captured look release added an activation');
    assert.equal(f.state.button.seq, 2);
  });
});

check(`genuine loss clears all ${MASKS} key masks and preserves queued records`, () => {
  for (let mask = 0; mask < MASKS; mask += 1) using({ locked: true }, f => {
    f.key('KeyE'); f.seedMask(mask); f.down(); f.move();
    const before = f.state, copy = structuredClone(before), events = before.events.slice(), ui = before.ui.slice();
    assert.equal(before.drag.target, 'brain');
    const transition = f.lock(false);
    safetyMaskSubcases += 1;
    assert.deepEqual(f.state.keys, noKeys());
    assert.equal(f.state.button.down, false);
    assert.equal(f.state.button.seq, before.button.seq);
    assert.equal(f.state.button.upMs, transition.timeStamp);
    assert.equal(f.state.drag.target, null);
    flagsOff(f);
    const expected = expectedSafety(mask, transition.timeStamp);
    assert.deepEqual(safety(f.state), expected);
    assert.equal(f.state.events.length, events.length + expected.length);
    recordsExact(f.state.events.slice(0, events.length), events);
    recordsExact(f.state.ui.slice(0, ui.length), ui);
    assert.deepEqual(f.state.ui.at(-1), { type: 'lock', locked: false, timeMs: transition.timeStamp });
    assert.equal(f.state.ui.length, ui.length + 1);
    assert.equal(f.calls.beforeSafety, 1);
    assert.deepEqual(f.calls.lock, [false]);
    assert.equal(clicks(f.state).length, 0);
    assert.deepEqual(before, copy, 'a safety transition mutated its prior state');
    f.up(); f.keyUp('Space');
    assert.equal(f.state.events.length, events.length + expected.length, 'late release duplicated a canceled action');
  });
});

// R558 input port (browser finding): keys pressed in the moment between the Resume / start click and the capture being
// granted were dropped by the acquisition and stayed dropped while held. A genuine acquisition now ends only the
// pointer gesture (the free-pointer press that asked for the capture); keys, their queued records and their later
// genuine releases are kept.
check(`genuine acquisition keeps all ${MASKS} key masks and their records, and ends only the pointer gesture`, () => {
  for (let mask = 0; mask < MASKS; mask += 1) using({ locked: false }, f => {
    f.key('KeyE'); f.seedMask(mask); f.down(); f.move();
    const before = f.state, copy = structuredClone(before), events = before.events.slice(), ui = before.ui.slice();
    assert.equal(before.drag.target, 'brain');
    const transition = f.lock(true);
    safetyMaskSubcases += 1;
    assert.deepEqual(f.state.keys, before.keys, 'acquisition released a held key');
    assert.equal(f.state.button.down, false);
    assert.equal(f.state.button.seq, before.button.seq);
    assert.equal(f.state.button.upMs, transition.timeStamp);
    assert.equal(f.state.drag.target, null);
    flagsOff(f);
    assert.equal(safety(f.state).length, 0, 'acquisition queued a safety release');
    recordsExact(f.state.events, events);
    recordsExact(f.state.ui.slice(0, ui.length), ui);
    assert.deepEqual(f.state.ui.at(-1), { type: 'lock', locked: true, timeMs: transition.timeStamp });
    assert.equal(f.state.ui.length, ui.length + 1);
    assert.equal(f.calls.beforeSafety, 1);
    assert.deepEqual(f.calls.lock, [true]);
    assert.equal(clicks(f.state).length, 0);
    assert.deepEqual(before, copy, 'the acquisition mutated its prior state');
    assert.equal(f.state.pointer, null);
    f.up();
    assert.equal(clicks(f.state).length, 0, 'the capture-requesting press became a click');
    const released = mask & SPACE ? f.keyUp('Space') : null;
    if (released) {
      const ups = graspUps(f.state);
      assert.equal(ups.length, 1); assert.equal(ups[0].timeMs, released.timeStamp); assert.equal(ups[0].safety, undefined);
    }
  });
});

check('keys pressed after the play click and before capture is granted stay held through the acquisition', () => {
  using({ locked: false }, f => {
    f.seedMask(1 + 8 + SPACE); // W, D, Space pressed while the capture request is still outstanding
    const downs = f.state.events.slice();
    assert.deepEqual(downs.map(e => [e.type, e.down]), [['grasp', true]]);
    f.lock(true);
    assert.deepEqual(f.state.keys, { KeyW: true, KeyA: false, KeyS: false, KeyD: true, Space: true });
    recordsExact(f.state.events, downs);
    assert.deepEqual(f.controls.axes(f.state), { x: 1, z: 1 });
    unchangedByDuplicate(f);
    const up = f.keyUp('Space');
    assert.deepEqual(f.state.events.at(-1), { type: 'grasp', down: false, timeMs: up.timeStamp });
  });
});

check('real acquisition then fresh captured keys/drag survives a later duplicate', () => {
  using({ locked: false }, f => {
    f.seedMask(ALL); f.down(); f.move();
    f.lock(true);
    assert.equal(safety(f.state).length, 0);
    assert.equal(f.state.keys.Space, true); assert.equal(f.state.keys.KeyW, true);
    f.down(); f.move();
    assert.equal(f.state.button.seq, 2);
    assert.equal(f.state.drag.target, 'brain');
    unchangedByDuplicate(f);
    assert.equal(f.calls.beforeSafety, 1);
    assert.deepEqual(f.calls.lock, [true]);
  });
});

check('duplicate unlocked remains conservative on every fresh press and does not invent a lock callback', () => {
  using({ locked: false }, f => {
    for (let i = 1; i <= 2; i += 1) {
      f.seedMask(ALL); f.down(); f.move();
      const event = f.duplicate();
      assert.deepEqual(f.state.keys, noKeys());
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, i);
      assert.equal(f.state.button.upMs, event.timeStamp);
      assert.equal(f.state.drag.target, null);
      assert.equal(safety(f.state).length, i);
      assert.deepEqual(safety(f.state).slice(-1), expectedSafety(ALL, event.timeStamp));
      assert.equal(f.calls.beforeSafety, i);
      assert.deepEqual(f.calls.lock, []);
      assert.equal(f.state.ui.length, 0);
      assert.equal(clicks(f.state).length, 0);
      flagsOff(f);
    }
  });
});

const safetyBoundaries = [
  ['Escape', f => f.key('Escape')],
  ['blur', f => f.view.emit('blur')],
  ['visibilitychange', f => f.doc.emit('visibilitychange')],
  ['Ctrl chord flag', f => f.key('KeyZ', { ctrlKey: true })],
  ['Meta chord flag', f => f.key('KeyZ', { metaKey: true })],
  ...api.CHORD_MODIFIER_CODES.flatMap(code => [[`${code} down`, f => f.key(code)], [`${code} up`, f => f.keyUp(code)]])
];
for (const [name, invoke] of safetyBoundaries) {
  check(`${name} still safety-releases held keys (the Space grasp) and gesture after a captured duplicate`, () => {
    using({}, f => {
      f.seedMask(ALL); f.down(); f.move();
      unchangedByDuplicate(f, 1);
      const before = f.state;
      const event = invoke(f);
      assert.deepEqual(f.state.keys, noKeys());
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, before.button.seq);
      assert.equal(f.state.button.upMs, event.timeStamp);
      assert.equal(f.state.drag.target, null);
      assert.deepEqual(safety(f.state), expectedSafety(ALL, event.timeStamp));
      assert.equal(f.calls.beforeSafety, 1);
      assert.deepEqual(f.calls.lock, []);
      assert.equal(clicks(f.state).length, 0);
      assert.equal(event.prevented, false, 'browser safety input was prevented');
      if (name === 'Escape') assert.deepEqual(f.state.ui, [{ type: 'escape', timeMs: event.timeStamp }]);
      else assert.deepEqual(f.state.ui, []);
      flagsOff(f);
    });
  });
}

check('pending request is cleared by a captured duplicate without a late error callback', () => {
  using({ kind: 'look', requestLock: true }, f => {
    // Explicit plain-data mismatch: the current document becomes free before a notification is supplied.
    // This is not a manufactured native event or a reproduction of any observed browser failure.
    f.doc.pointerLockElement = null;
    f.down();
    assert.equal(f.calls.request, 1);
    f.doc.pointerLockElement = f.canvas;
    const before = f.state, copy = structuredClone(before);
    f.duplicate();
    assert.equal(f.state, before);
    assert.deepEqual(f.state, copy);
    f.doc.emit('pointerlockerror');
    assert.equal(f.calls.error, 0, 'cleared pending request accepted a stale refusal');
    assert.equal(f.unbind.status().lockFallback, false);
    assert.equal(f.calls.beforeSafety, 0);
    assert.deepEqual(f.calls.lock, []);
  });
});

check('refusal fallback is cleared by a captured duplicate without changing game state', () => {
  using({ kind: 'look', requestLock: true }, f => {
    f.doc.pointerLockElement = null;
    f.down(); f.doc.emit('pointerlockerror');
    assert.equal(f.calls.error, 1);
    assert.equal(f.unbind.status().lockFallback, true);
    f.doc.pointerLockElement = f.canvas;
    const before = f.state, copy = structuredClone(before);
    f.duplicate();
    assert.equal(f.state, before);
    assert.deepEqual(f.state, copy);
    assert.equal(f.unbind.status().lockFallback, false);
    assert.equal(f.calls.error, 1);
    assert.equal(f.calls.beforeSafety, 0);
    assert.deepEqual(f.calls.lock, []);
  });
});

// Two declared software states: a synchronous owner hook restores the document lock to its cached value. These are
// not native fixtures or a proposed cause of the public main's unexplained Space+W+D loss.
const HELD = 1 + 8 + SPACE; // W, D, Space
for (const cached of [false, true]) {
  check(`synchronous owner hook: cached ${cached}, preobserved ${!cached}, post-hook ${cached}; safety and future cache follow post-hook state`, () => {
    let mutateLock = true;
    using({ locked: cached, beforeSafetyLock: (doc, canvas) => {
      if (mutateLock) doc.pointerLockElement = cached ? canvas : null;
    } }, f => {
      f.key('KeyE'); f.key('Space'); f.keyUp('Space');
      f.down(); f.up();
      f.key('KeyE'); f.seedMask(HELD); f.down(); f.move();
      const before = f.state, copy = structuredClone(before);
      const events = before.events.slice(), ui = before.ui.slice();
      const priorClicks = clicks(before).length;
      const observed = f.lock(!cached);
      assert.equal(f.doc.pointerLockElement, cached ? f.canvas : null, 'hook did not set the supplied document');
      assert.equal(f.calls.beforeSafety, 1);
      assert.deepEqual(f.state.keys, noKeys());
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, before.button.seq);
      assert.equal(f.state.button.upMs, observed.timeStamp);
      assert.equal(f.state.drag.target, null);
      flagsOff(f);
      recordsExact(f.state.events.slice(0, events.length), events);
      assert.deepEqual(f.state.events.slice(events.length), expectedSafety(HELD, observed.timeStamp));
      assert.equal(clicks(f.state).length, priorClicks, 'safety release introduced an activation');
      recordsExact(f.state.ui, ui);
      assert.deepEqual(f.calls.lock, [], 'a pre-hook observation produced a false lock callback');
      assert.equal(f.unbind.status().locked, cached, 'cached lock must equal the post-hook document');
      assert.deepEqual(before, copy, 'hook boundary mutated its prior state');
      if (cached) assert.equal(f.state.pointer, null, 'captured post-hook state retained a free pointer');
      f.up(); f.keyUp('Space');
      assert.equal(f.state.events.length, events.length + 1, 'late release repeated the canceled action');
      assert.equal(clicks(f.state).length, priorClicks);

      mutateLock = false;
      f.seedMask(HELD); f.down(); f.move();
      if (cached) {
        unchangedByDuplicate(f);
        assert.equal(f.calls.beforeSafety, 1, 'correct captured cache should bypass safety on duplicates');
      } else {
        const prior = f.state, duplicate = f.duplicate();
        assert.equal(f.calls.beforeSafety, 2, 'unlocked duplicate must still safety-release');
        assert.deepEqual(f.state.keys, noKeys());
        assert.equal(f.state.button.upMs, duplicate.timeStamp);
        assert.equal(f.state.button.seq, prior.button.seq);
        recordsExact(f.state.events.slice(0, prior.events.length), prior.events);
        assert.deepEqual(f.state.events.slice(prior.events.length), expectedSafety(HELD, duplicate.timeStamp));
        recordsExact(f.state.ui, ui);
        assert.deepEqual(f.calls.lock, []);
        assert.equal(f.unbind.status().locked, false);
        flagsOff(f);
      }
      const beforeNext = f.state, beforeNextEvents = beforeNext.events.slice();
      const next = f.lock(!cached);
      assert.equal(f.unbind.status().locked, !cached, 'future genuine boundary used a stale cache');
      assert.deepEqual(f.calls.lock, [!cached]);
      recordsExact(f.state.ui.slice(0, ui.length), ui);
      assert.equal(f.state.ui.length, ui.length + 1);
      assert.deepEqual(f.state.ui.at(-1), { type: 'lock', locked: !cached, timeMs: next.timeStamp });
      recordsExact(f.state.events.slice(0, beforeNextEvents.length), beforeNextEvents);
      assert.deepEqual(f.state.events.slice(beforeNextEvents.length), cached ? expectedSafety(HELD, next.timeStamp) : []);
      assert.deepEqual(f.state.keys, noKeys());
      assert.equal(f.calls.beforeSafety, cached ? 2 : 3);
      assert.equal(f.calls.error, 0);
      assert.equal(f.calls.request, 0);
      assert.equal(clicks(f.state).length, priorClicks);
      flagsOff(f);
    });
  });
}

const failed = results.filter(result => !result.passed);
process.stdout.write(JSON.stringify({ suite: 'capture-boundary', module: target.href, cases: results.length, failed: failed.length,
  repeatedCapturedKeyMasks: MASKS, safetyMaskSubcases, results,
  scope: 'Pure software state under supplied in-memory observations only. The public main\'s native Space+W+D loss cause is UNKNOWN; no native event, timing, GPU, anatomy or full-game proof.' }, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
