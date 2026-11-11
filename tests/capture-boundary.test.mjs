/** Independent pure Controls acceptance for a repeated captured pointer-lock notification.
 * Selected Controls and its math dependency only; no App, scene, model, browser, native fixture, or clock override.
 * ListenerBucket is copied exactly from the accepted public pointer-release.test.mjs. Its records are plain data.
 * Real Node performance.now supplies every observation. Supplied events prove software semantics only.
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const selection = 'current';
const target = new URL('../scene/src/ns-controls.mjs', import.meta.url);
const api = await import(target.href);
const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
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
    dragTargetAt: () => ['brain', 'mirror'].includes(kind) ? kind : null,
    onBeforeSafetyRelease: () => { calls.beforeSafety += 1; if (beforeSafetyLock !== null) beforeSafetyLock(doc, canvas); },
    onLockChange: value => { calls.lock.push(value); },
    onLockError: () => { calls.error += 1; },
    onView: value => { calls.view.push(value); }
  });
  const point = { target: canvas, clientX: 120, clientY: 160 };
  return {
    controls, view, doc, canvas, unbind, calls,
    get state() { return state; },
    key(code, fields = {}) { return view.emit('keydown', { target: canvas, code, repeat: false, ...fields }); },
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
const safety = state => state.events.filter(e => e.type === 'space' && !e.down && e.safety === true);
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

for (let mask = 0; mask < 32; mask += 1) {
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

for (const kind of ['brain', 'mirror']) {
  check(`${kind}: duplicate retains unturned press until genuine final release, then exactly one click`, () => {
    using({ kind }, f => {
      f.seedMask(25); f.down();
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
      const ups = f.state.events.filter(e => e.type === 'space' && !e.down);
      assert.equal(ups.length, 1);
      assert.equal(ups[0].timeMs, released.timeStamp);
      assert.equal(ups[0].safety, undefined, 'final genuine keyup was replaced with safety release');
      f.up(); f.keyUp('Space');
      assert.equal(clicks(f.state).length, 1, 'repeated final release duplicated the click');
      assert.equal(f.state.events.filter(e => e.type === 'space' && !e.down).length, 1);
      flagsOff(f);
    });
  });
  check(`${kind}: turned press survives duplicates and partial release without a phantom click`, () => {
    using({ kind }, f => {
      f.seedMask(31); f.down(); f.move();
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
      f.seedMask(31); f.down();
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

for (const now of [false, true]) {
  check(`genuine ${now ? 'acquisition' : 'loss'} clears all 32 key masks and preserves queued records`, () => {
    for (let mask = 0; mask < 32; mask += 1) using({ locked: !now }, f => {
      f.key('KeyE'); f.seedMask(mask); f.down(); f.move();
      const before = f.state, copy = structuredClone(before), events = before.events.slice(), ui = before.ui.slice();
      assert.equal(before.drag.target, 'brain');
      const transition = f.lock(now);
      safetyMaskSubcases += 1;
      assert.deepEqual(f.state.keys, Object.fromEntries(codes.map(code => [code, false])));
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, before.button.seq);
      assert.equal(f.state.button.upMs, transition.timeStamp);
      assert.equal(f.state.drag.target, null);
      flagsOff(f);
      const expectedSafety = Boolean(mask & 16) ? 1 : 0;
      assert.equal(safety(f.state).length, expectedSafety);
      assert.equal(f.state.events.length, events.length + expectedSafety);
      recordsExact(f.state.events.slice(0, events.length), events);
      if (expectedSafety) assert.deepEqual(f.state.events.at(-1), { type: 'space', down: false, safety: true, timeMs: transition.timeStamp });
      recordsExact(f.state.ui.slice(0, ui.length), ui);
      assert.deepEqual(f.state.ui.at(-1), { type: 'lock', locked: now, timeMs: transition.timeStamp });
      assert.equal(f.state.ui.length, ui.length + 1);
      assert.equal(f.calls.beforeSafety, 1);
      assert.deepEqual(f.calls.lock, [now]);
      assert.equal(clicks(f.state).length, 0);
      assert.deepEqual(before, copy, 'a safety transition mutated its prior state');
      if (now) assert.equal(f.state.pointer, null);
      f.up(); f.keyUp('Space');
      assert.equal(f.state.events.length, events.length + expectedSafety, 'late release duplicated a canceled action');
    });
  });
}

check('real acquisition then fresh captured keys/drag survives a later duplicate', () => {
  using({ locked: false }, f => {
    f.seedMask(31); f.down(); f.move();
    const acquired = f.lock(true);
    assert.equal(safety(f.state).length, 1);
    assert.equal(safety(f.state)[0].timeMs, acquired.timeStamp);
    f.seedMask(25); f.down(); f.move();
    assert.equal(f.state.button.seq, 2);
    assert.equal(f.state.keys.Space, true);
    unchangedByDuplicate(f);
    assert.equal(f.calls.beforeSafety, 1);
    assert.deepEqual(f.calls.lock, [true]);
  });
});

check('duplicate unlocked remains conservative on every fresh press and does not invent a lock callback', () => {
  using({ locked: false }, f => {
    for (let i = 1; i <= 2; i += 1) {
      f.seedMask(31); f.down(); f.move();
      const event = f.duplicate();
      assert.deepEqual(f.state.keys, Object.fromEntries(codes.map(code => [code, false])));
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, i);
      assert.equal(f.state.button.upMs, event.timeStamp);
      assert.equal(f.state.drag.target, null);
      assert.equal(safety(f.state).length, i);
      assert.equal(safety(f.state).at(-1).timeMs, event.timeStamp);
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
  check(`${name} still safety-releases held keys and gesture after a captured duplicate`, () => {
    using({}, f => {
      f.seedMask(31); f.down(); f.move();
      unchangedByDuplicate(f, 1);
      const before = f.state;
      const event = invoke(f);
      assert.deepEqual(f.state.keys, Object.fromEntries(codes.map(code => [code, false])));
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, before.button.seq);
      assert.equal(f.state.button.upMs, event.timeStamp);
      assert.equal(f.state.drag.target, null);
      assert.deepEqual(safety(f.state), [{ type: 'space', down: false, safety: true, timeMs: event.timeStamp }]);
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
    // This is not a manufactured native event or a reproduction of the observed browser failure.
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


// Two new declared software states: a synchronous owner hook restores the document lock
// to its cached value. These are not native fixtures or a proposed cause of Space+W+D loss.
for (const cached of [false, true]) {
  check(`synchronous owner hook: cached ${cached}, preobserved ${!cached}, post-hook ${cached}; safety and future cache follow post-hook state`, () => {
    let mutateLock = true;
    using({ locked: cached, beforeSafetyLock: (doc, canvas) => {
      if (mutateLock) doc.pointerLockElement = cached ? canvas : null;
    } }, f => {
      f.key('KeyE'); f.key('Space'); f.keyUp('Space');
      f.down(); f.up();
      f.key('KeyE'); f.seedMask(25); f.down(); f.move();
      const before = f.state, copy = structuredClone(before);
      const events = before.events.slice(), ui = before.ui.slice();
      const priorClicks = clicks(before).length;
      const observed = f.lock(!cached);
      assert.equal(f.doc.pointerLockElement, cached ? f.canvas : null, 'hook did not set the supplied document');
      assert.equal(f.calls.beforeSafety, 1);
      assert.deepEqual(f.state.keys, Object.fromEntries(codes.map(code => [code, false])));
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, before.button.seq);
      assert.equal(f.state.button.upMs, observed.timeStamp);
      assert.equal(f.state.drag.target, null);
      flagsOff(f);
      recordsExact(f.state.events.slice(0, events.length), events);
      assert.equal(f.state.events.length, events.length + 1);
      assert.deepEqual(f.state.events.at(-1), { type: 'space', down: false, safety: true, timeMs: observed.timeStamp });
      assert.equal(safety(f.state).length, 1);
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
      f.seedMask(25); f.down(); f.move();
      if (cached) {
        unchangedByDuplicate(f);
        assert.equal(f.calls.beforeSafety, 1, 'correct captured cache should bypass safety on duplicates');
      } else {
        const prior = f.state, duplicate = f.duplicate();
        assert.equal(f.calls.beforeSafety, 2, 'unlocked duplicate must still safety-release');
        assert.deepEqual(f.state.keys, Object.fromEntries(codes.map(code => [code, false])));
        assert.equal(f.state.button.upMs, duplicate.timeStamp);
        assert.equal(f.state.button.seq, prior.button.seq);
        recordsExact(f.state.events.slice(0, prior.events.length), prior.events);
        assert.deepEqual(f.state.events.at(-1), { type: 'space', down: false, safety: true, timeMs: duplicate.timeStamp });
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
      assert.equal(f.state.events.length, beforeNextEvents.length + (cached ? 1 : 0));
      if (cached) assert.deepEqual(f.state.events.at(-1), { type: 'space', down: false, safety: true, timeMs: next.timeStamp });
      assert.deepEqual(f.state.keys, Object.fromEntries(codes.map(code => [code, false])));
      assert.equal(f.calls.beforeSafety, cached ? 2 : 3);
      assert.equal(f.calls.error, 0);
      assert.equal(f.calls.request, 0);
      assert.equal(clicks(f.state).length, priorClicks);
      flagsOff(f);
    });
  });
}

const failed = results.filter(result => !result.passed);
process.stdout.write(JSON.stringify({ selection, module: target.href, cases: results.length, failed: failed.length,
  repeatedCapturedKeyMasks: 32, safetyMaskSubcases, results,
  scope: 'Pure software state under supplied in-memory observations only. Native Space+W+D cause UNKNOWN; no native event, timing, GPU, anatomy or full-game proof.' }, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
