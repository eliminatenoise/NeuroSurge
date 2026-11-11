/** Public-controls pointer-release regressions for the R558 controls (ported from the public main's
 * pointer-release suite and adapted: five control keys (W, A, S, D, Space; there is no F key), the press-drag targets
 * brain, mirror body and own limb, and the safety release that lets go of a Space grasp).
 * Not a browser or a native input/timing fixture: only the public controls module and its math dependency are
 * imported. Listener buckets below are plain in-process data; no real DOM, browser, renderer, model, process control
 * or network is used. Timestamps come from the real Node monotonic clock; no clock is replaced or advanced. These tests
 * establish GAME state transitions only; they cannot establish physical mouse-up time, pixels or timing.
 * Run: node tests/pointer-release.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-controls.mjs', import.meta.url);
const api = await import(target.href);
const results = [];
const CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
const MASKS = 1 << CODES.length;
const ITEMS = ['brain', 'mirror', 'limb'];

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

function fixture({ kind = 'brain', locked = false, keyMask = 0 } = {}) {
  const controls = api.createControls();
  let state = controls.initialState();
  for (const [i, code] of CODES.entries()) {
    if (keyMask & (1 << i)) state = controls.keyDown(state, code, performance.now());
  }
  const view = new ListenerBucket();
  const doc = new ListenerBucket();
  const canvas = new ListenerBucket();
  view.performance = performance;
  doc.defaultView = view;
  canvas.ownerDocument = doc;
  doc.pointerLockElement = locked ? canvas : null;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  const unbind = api.bindDom(canvas, controls, () => state, next => { state = next; }, {
    arrowAt: () => kind === 'arrow',
    dragTargetAt: () => ITEMS.includes(kind) ? kind : null
  });
  const pointer = { target: canvas, clientX: 120, clientY: 160 };
  return {
    controls, view, doc, canvas, unbind,
    get state() { return state; },
    down(buttons = 1) { return canvas.emit('mousedown', { ...pointer, buttons }); },
    move(buttons, movementX = 10, movementY = 3) {
      return doc.emit('mousemove', { ...pointer, buttons, movementX, movementY });
    },
    up(buttons = 0) { return view.emit('mouseup', { ...pointer, buttons }); },
    cancel(kind) {
      if (kind === 'escape') return view.emit('keydown', { target: canvas, code: 'Escape', repeat: false });
      if (kind === 'blur') return view.emit('blur');
      if (kind === 'visibility') return doc.emit('visibilitychange');
      assert.equal(kind, 'unlock');
      doc.pointerLockElement = null;
      return doc.emit('pointerlockchange');
    }
  };
}

function withFixture(options, test) {
  const f = fixture(options);
  try { test(f); } finally { f.unbind(); }
}
function check(name, test) {
  try { test(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const clicks = state => state.events.filter(e => e.type === 'click');
const allPointerFlagsOff = f => {
  const status = f.unbind.status();
  assert.equal(status.dragging, false, 'stale drag-to-look flag');
  assert.equal(status.pressDrag, false, 'stale item-drag flag');
  assert.equal(status.arrowPress, false, 'stale arrow hold flag');
};

for (const kind of ITEMS) for (const locked of [false, true]) {
  const label = `${kind}/${locked ? 'captured' : 'free'}`;
  check(`${label}: missed up cancels drag, preserves sequence and permits next tap`, () => {
    withFixture({ kind, locked }, f => {
      f.down(); f.move(1, 12, 0);
      const prior = f.state;
      const priorCopy = structuredClone(prior);
      const observation = f.move(0, 2, 0);
      assert.equal(f.state.button.down, false, 'button remains held after reliable all-buttons-up');
      assert.equal(f.state.button.seq, 1);
      assert.equal(f.state.button.upMs, observation.timeStamp, 'use observation time, never a guessed release time');
      assert.equal(f.state.drag.target, null);
      allPointerFlagsOff(f);
      assert.equal(clicks(f.state).length, 0, 'cancellation must not fabricate activation');
      assert.deepEqual(prior, priorCopy, 'the previous reducer state must not be mutated');
      f.up();
      assert.equal(clicks(f.state).length, 0, 'late real up must not turn the cancelled gesture into a click');
      f.down();
      assert.equal(f.state.button.seq, 2, 'next genuine down must have a fresh identity');
      const up = f.up();
      assert.equal(clicks(f.state).length, 1, 'ordinary new tap still activates once');
      assert.equal(clicks(f.state)[0].timeMs, up.timeStamp);
    });
  });
  check(`${label}: unturned cancelled press is not a click`, () => {
    withFixture({ kind, locked }, f => {
      f.down(); f.move(0, 0, 0); f.up();
      assert.equal(f.state.button.down, false);
      assert.equal(clicks(f.state).length, 0);
      allPointerFlagsOff(f);
    });
  });
  check(`${label}: partial multi-button release keeps the same gesture`, () => {
    withFixture({ kind, locked }, f => {
      f.down(1); f.down(3); f.up(1); f.move(1, 6, 0);
      assert.equal(f.state.button.down, true);
      assert.equal(f.state.button.seq, 1, 'second held button is not a new gesture');
      assert.equal(f.state.drag.target, kind);
      assert.equal(f.unbind.status().pressDrag, true);
      f.up(0);
      assert.equal(f.state.button.down, false);
      assert.equal(clicks(f.state).length, 0, 'a completed drag is not activation');
    });
  });
  check(`${label}: unknown buttons do not invent a release`, () => {
    withFixture({ kind, locked }, f => {
      f.down();
      for (const buttons of [undefined, NaN, Infinity, -1]) {
        f.move(buttons, 1, 0);
        assert.equal(f.state.button.down, true);
        assert.equal(f.unbind.status().pressDrag, true);
      }
      assert.equal(clicks(f.state).length, 0);
    });
  });
}

check('free arrow: missed up releases hold and next press orbits once', () => {
  withFixture({ kind: 'arrow' }, f => {
    const hit = { target: 'brain', dir: 'right', blocked: null };
    const frame = () => ({ playing: true, nowMs: performance.now(), button: f.controls.buttonState(f.state), hit });
    let arrow = api.stepArrowInput(api.initialArrowInput(), frame()).state;
    f.down();
    const first = api.stepArrowInput(arrow, frame()); arrow = first.state;
    assert.equal(first.orbit.length, 1);
    assert.ok(arrow.press);
    const observation = f.move(0);
    assert.equal(f.state.button.down, false, 'free arrow early return must not swallow buttons-zero');
    assert.equal(f.state.button.upMs, observation.timeStamp);
    allPointerFlagsOff(f);
    const released = api.stepArrowInput(arrow, frame()); arrow = released.state;
    assert.equal(arrow.press, null);
    assert.equal(released.orbit.length, 0, 'released hover must not orbit');
    f.down();
    assert.equal(f.state.button.seq, 2);
    const second = api.stepArrowInput(arrow, frame());
    assert.equal(second.orbit.length, 1, 'new arrow press must not be lost or duplicated');
    assert.equal(clicks(f.state).length, 0, 'arrow input must not also activate a brain area');
  });
});

check('free look: missed up stops drag-to-look and frees next press', () => {
  withFixture({ kind: 'look' }, f => {
    f.down(); f.move(1);
    const before = { yaw: f.state.yaw, pitch: f.state.pitch, clicks: clicks(f.state).length };
    f.move(0, 100, 100);
    assert.equal(f.state.button.down, false);
    assert.equal(f.state.yaw, before.yaw);
    assert.equal(f.state.pitch, before.pitch);
    assert.equal(clicks(f.state).length, before.clicks);
    allPointerFlagsOff(f);
    f.down(); assert.equal(f.state.button.seq, 2);
  });
});

check('captured look: observed release does not suppress ordinary look movement', () => {
  withFixture({ kind: 'look', locked: true }, f => {
    f.down(); const before = f.state;
    f.move(0, 4, 2);
    assert.equal(f.state.button.down, false);
    assert.equal(f.state.yaw, before.yaw - 4 * api.DEFAULT_SENSITIVITY_RAD_PER_PX);
    assert.equal(f.state.pitch, before.pitch - 2 * api.DEFAULT_SENSITIVITY_RAD_PER_PX);
  });
});

for (const kind of ITEMS) {
  check(`${kind}: reliable buttons-zero is honored even with unusable captured movement`, () => {
    withFixture({ kind, locked: true }, f => {
      f.down(); f.move(0, NaN, Infinity);
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.drag.target, null);
      allPointerFlagsOff(f);
      assert.equal(clicks(f.state).length, 0);
    });
  });
}

// W + Space held (mask 1 + 16): every safety boundary lets go of the Space grasp exactly once. No limb turn is
// running (Space was pressed once, not double-tapped), so no turn stop is queued.
const HELD_W_SPACE = 17;
for (const kind of [...ITEMS, 'arrow', 'look']) for (const cancel of ['blur', 'visibility', 'escape', 'unlock']) {
  check(`${kind}: ${cancel} clears DOM pointer gesture and safety-releases keys (the Space grasp)`, () => {
    withFixture({ kind, keyMask: HELD_W_SPACE }, f => {
      f.down(); const beforeClicks = clicks(f.state).length;
      const event = f.cancel(cancel);
      assert.equal(f.state.button.down, false);
      assert.equal(f.state.button.seq, 1);
      assert.equal(f.state.drag.target, null);
      allPointerFlagsOff(f);
      assert.ok(Object.values(f.state.keys).every(value => value === false));
      assert.equal(clicks(f.state).length, beforeClicks);
      const grasps = f.state.events.filter(e => e.type === 'grasp');
      assert.deepEqual(grasps.map(e => [e.down, e.safety === true]), [[true, false], [false, true]], 'one grasp, one safety release');
      assert.equal(grasps[1].timeMs, event.timeStamp);
      assert.equal(f.state.events.filter(e => e.type === 'turn').length, 0, 'no limb turn was running, so none is stopped');
      assert.deepEqual(f.controls.spaceGesture(f.state).role, null, 'the Space gesture is not idle');
      if (cancel === 'escape') assert.equal(event.prevented, false, 'Esc remains available to the browser');
    });
  });
}

for (const kind of [...ITEMS, 'arrow', 'look']) {
  check(`${kind}: pointer-only cancellation preserves all ${MASKS} keyboard combinations`, () => {
    for (let keyMask = 0; keyMask < MASKS; keyMask += 1) {
      withFixture({ kind, keyMask }, f => {
        f.down();
        const keys = structuredClone(f.state.keys), events = structuredClone(f.state.events);
        const gesture = f.controls.spaceGesture(f.state);
        f.move(0);
        assert.equal(f.state.button.down, false);
        assert.deepEqual(f.state.keys, keys, 'mouse observation must not release Space/WASD');
        assert.deepEqual(f.state.events, events, 'mouse observation must not insert a grasp release, a turn or a click');
        assert.deepEqual(f.controls.spaceGesture(f.state), gesture, 'mouse observation must not change the Space gesture');
      });
    }
  });
}

const failed = results.filter(result => !result.passed);
process.stdout.write(JSON.stringify({ suite: 'pointer-release', module: target.href, cases: results.length, failed: failed.length,
  results, scope: 'Public controls software state only; simulated in-process records. No browser, pixel-timing or biological validation.' }, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
