/** The Space gestures of the R558 controls (user Message 40 and 46): hold Space = take hold while held; tap Space = take
 * hold and keep it (the next press lets go); double tap = one inward / outward turn step of all limbs; double tap and
 * keep holding = the turn goes on, slowly, until the key is let go.
 * Controls and its math dependency only: no App, scene, model, browser or native fixture. Every time below is a supplied
 * number on one made-up timeline (the reducer reads only the times it is given); no clock is replaced. These cases
 * establish the queued GAME records only, never physical key timing, pixels or biology.
 * Run: node tests/space-gesture.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-controls.mjs', import.meta.url);
const mod = await import(target.href);
const { createControls, SPACE_GESTURE, CONTROL_CODES } = mod;
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const TAP = SPACE_GESTURE.tapMaxMs, DOUBLE = SPACE_GESTURE.doubleTapMs;
const T0 = 1000;
/** A queued game record in short: [type, down or phase, time]. */
const brief = e => [e.type, e.type === 'turn' ? e.phase : e.down, e.timeMs];
const idle = (api, state) => {
  const g = api.spaceGesture(state);
  assert.deepEqual([g.role, g.grasp, g.turn, g.tapMs], [null, 'none', 'none', null], 'the Space gesture is not idle');
};
/** Press and let go of Space: [down time, up time]. */
const press = (api, state, down, up) => api.keyUp(api.keyDown(state, 'Space', down), 'Space', up);

check('the declared limits: a tap is shorter than a hold, and a double tap allows a second tap', () => {
  assert.ok(Number.isFinite(TAP) && TAP > 0);
  assert.ok(Number.isFinite(DOUBLE) && DOUBLE > TAP);
  assert.deepEqual([...CONTROL_CODES], ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'], 'the control keys changed (there is no F key)');
});

check('HOLD: takes hold at the press and lets go at the key-up', () => {
  const api = createControls();
  let s = api.keyDown(api.initialState(), 'Space', T0);
  assert.deepEqual(s.events.map(brief), [['grasp', true, T0]]);
  assert.deepEqual([api.spaceGesture(s).role, api.spaceGesture(s).grasp], ['grasp', 'held']);
  s = api.keyUp(s, 'Space', T0 + TAP);                       // exactly the limit is a hold
  assert.deepEqual(s.events.map(brief), [['grasp', true, T0], ['grasp', false, T0 + TAP]]);
  idle(api, s);
});

check('TAP: takes hold and keeps it; the next single press lets go at its key-up', () => {
  const api = createControls();
  let s = press(api, api.initialState(), T0, T0 + TAP - 1);
  assert.deepEqual(s.events.map(brief), [['grasp', true, T0]], 'a tap let go');
  assert.equal(api.spaceGesture(s).grasp, 'kept');
  s = api.noteSpace(s, { holding: true, turning: false });   // the game: something is held
  const later = T0 + DOUBLE + 500;                           // too late to be a double tap
  s = api.keyDown(s, 'Space', later);
  assert.equal(s.events.length, 1, 'the letting-go press queued something at its key-down');
  assert.equal(api.spaceGesture(s).role, 'release');
  s = api.keyUp(s, 'Space', later + 600);
  assert.deepEqual(s.events.map(brief), [['grasp', true, T0], ['grasp', false, later + 600]]);
  idle(api, s);
});

check('a tap that took hold of nothing is forgotten: the next tap takes hold again', () => {
  const api = createControls();
  let s = press(api, api.initialState(), T0, T0 + 50);
  s = api.noteSpace(s, { holding: false, turning: false });  // the game: nothing was in reach
  assert.equal(api.spaceGesture(s).grasp, 'none');
  const later = T0 + DOUBLE + 500;
  s = press(api, s, later, later + 50);
  assert.deepEqual(s.events.map(brief), [['grasp', true, T0], ['grasp', true, later]]);
  assert.equal(api.spaceGesture(s).grasp, 'kept');
});

check('DOUBLE TAP: lets go of what the first tap took, then one turn step; a quick key-up queues nothing more', () => {
  const api = createControls();
  let s = press(api, api.initialState(), T0, T0 + 60);
  s = api.keyDown(s, 'Space', T0 + DOUBLE);                  // exactly the limit still counts
  assert.deepEqual(s.events.map(brief), [['grasp', true, T0], ['grasp', false, T0 + DOUBLE], ['turn', 'step', T0 + DOUBLE]]);
  assert.deepEqual([api.spaceGesture(s).role, api.spaceGesture(s).turn], ['turn', 'step']);
  assert.equal(api.tickSpace(s, T0 + DOUBLE + TAP - 1), s, 'the slow turn began before the tap limit');
  const up = api.keyUp(s, 'Space', T0 + DOUBLE + 80);
  assert.equal(up.events.length, 3, 'the step is ended by the game, not by a queued record');
  idle(api, up);
});

check('one past the double-tap limit is two single presses (take hold and keep, then let go)', () => {
  const api = createControls();
  let s = press(api, api.initialState(), T0, T0 + 60);
  s = api.noteSpace(s, { holding: true, turning: false });
  s = press(api, s, T0 + DOUBLE + 1, T0 + DOUBLE + 61);
  assert.deepEqual(s.events.map(brief), [['grasp', true, T0], ['grasp', false, T0 + DOUBLE + 61]]);
  assert.equal(s.events.filter(e => e.type === 'turn').length, 0);
});

check('DOUBLE TAP AND HOLD: the frame clock starts the slow turn at the tap limit; the key-up stops it', () => {
  const api = createControls();
  let s = press(api, api.initialState(), T0, T0 + 60);
  const second = T0 + 200;
  s = api.keyDown(s, 'Space', second);
  s = api.tickSpace(s, second + TAP + 37);                   // a frame somewhat after the limit
  assert.deepEqual(s.events.slice(2).map(brief), [['turn', 'step', second], ['turn', 'hold', second + TAP]], 'the hold is stamped at the limit');
  assert.equal(api.tickSpace(s, second + TAP + 500), s, 'the slow turn was asked for twice');
  s = api.keyUp(s, 'Space', second + 2000);
  assert.deepEqual(s.events.at(-1), { type: 'turn', phase: 'stop', timeMs: second + 2000 });
  assert.equal(s.events.length, 5);
  idle(api, s);
});

check('a press while a turn still runs waits: it takes hold only once the game reports the turn over', () => {
  const api = createControls();
  let s = press(api, api.initialState(), T0, T0 + 60);
  s = press(api, s, T0 + 200, T0 + 260);                     // double tap: a step is asked for
  const n = s.events.length;
  s = api.keyDown(s, 'Space', T0 + 2000);                    // the game has not answered yet
  assert.equal(s.events.length, n); assert.equal(api.spaceGesture(s).role, 'wait');
  assert.equal(api.tickSpace(s, T0 + 2016), s, 'took hold before the game answered');
  s = api.noteSpace(s, { holding: false, turning: true });
  assert.equal(api.tickSpace(s, T0 + 2032), s, 'took hold during the turn');
  s = api.noteSpace(s, { holding: false, turning: false });
  s = api.tickSpace(s, T0 + 2950);
  assert.deepEqual(s.events.at(-1), { type: 'grasp', down: true, timeMs: T0 + 2950 });
  assert.deepEqual([api.spaceGesture(s).role, api.spaceGesture(s).grasp], ['grasp', 'held']);
  s = api.keyUp(s, 'Space', T0 + 4000);
  assert.deepEqual(s.events.at(-1), { type: 'grasp', down: false, timeMs: T0 + 4000 });
});

check('a waiting press let go before the turn ends takes nothing', () => {
  const api = createControls();
  let s = press(api, api.initialState(), T0, T0 + 60);
  s = press(api, s, T0 + 200, T0 + 260);
  s = api.noteSpace(s, { holding: false, turning: true });
  const n = s.events.length;
  s = press(api, s, T0 + 3000, T0 + 3600);
  assert.equal(s.events.length, n);
  assert.equal(api.spaceGesture(s).role, null);
});

check('the reach-behind mark travels with the press that takes hold, and with no other record', () => {
  const api = createControls();
  let s = api.keyDown(api.initialState(), 'Space', T0, { behind: true });
  assert.deepEqual(s.events, [{ type: 'grasp', down: true, behind: true, timeMs: T0 }]);
  s = api.keyUp(s, 'Space', T0 + 900);
  assert.deepEqual(s.events.at(-1), { type: 'grasp', down: false, timeMs: T0 + 900 });
  const plain = api.keyDown(api.initialState(), 'Space', T0);
  assert.deepEqual(plain.events, [{ type: 'grasp', down: true, timeMs: T0 }]);
});

check('keyboard auto-repeat and stray key-ups change nothing', () => {
  const api = createControls();
  const s = api.keyDown(api.initialState(), 'Space', T0);
  assert.equal(api.keyDown(s, 'Space', T0 + 30), s);
  assert.equal(api.keyDown(s, 'Space', T0 + 700), s);
  const fresh = api.initialState();
  assert.equal(api.keyUp(fresh, 'Space', T0), fresh);
  assert.equal(api.tickSpace(fresh, T0), fresh);
  assert.equal(api.keyDown(fresh, 'KeyF', T0), fresh, 'F is not a control key');
});

check('W / A / S / D queue nothing and never disturb the Space gesture', () => {
  const api = createControls();
  let s = api.keyDown(api.initialState(), 'Space', T0);
  const g = api.spaceGesture(s);
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { s = api.keyDown(s, code, T0 + 10); s = api.keyUp(s, code, T0 + 20); }
  assert.equal(s.events.length, 1);
  assert.deepEqual(api.spaceGesture(s), g);
});

check('a press of unknown length is a hold: it lets go and starts no double tap', () => {
  const api = createControls();
  let s = api.keyDown(api.initialState(), 'Space', T0);
  s = api.keyUp(s, 'Space', NaN);
  assert.deepEqual(s.events.map(e => [e.type, e.down]), [['grasp', true], ['grasp', false]]);
  idle(api, s);
});

check('safety release: a hold, a kept hold and a slow turn each end once; a tap chain ends; nothing is repeated', () => {
  const api = createControls();
  // A hold.
  let s = api.blur(api.keyDown(api.initialState(), 'Space', T0), T0 + 100);
  assert.deepEqual(s.events.at(-1), { type: 'grasp', down: false, safety: true, timeMs: T0 + 100 });
  idle(api, s); assert.equal(api.blur(s, T0 + 200), s);
  assert.equal(api.keyUp(s, 'Space', T0 + 300), s, 'a late key-up let go a second time');
  // A hold kept from a tap (the key is up).
  s = api.blur(press(api, api.initialState(), T0, T0 + 50), T0 + 100);
  assert.deepEqual(s.events.map(e => [e.type, e.down, e.safety === true]), [['grasp', true, false], ['grasp', false, true]]);
  const next = api.keyDown(s, 'Space', T0 + 150);            // within the double-tap time of the tap before the boundary
  assert.deepEqual(next.events.at(-1), { type: 'grasp', down: true, timeMs: T0 + 150 }, 'a tap before the boundary made a double tap after it');
  // A slow turn.
  s = press(api, api.initialState(), T0, T0 + 50);
  s = api.tickSpace(api.keyDown(s, 'Space', T0 + 150), T0 + 150 + TAP + 5);
  s = api.blur(s, T0 + 900);
  assert.deepEqual(s.events.at(-1), { type: 'turn', phase: 'stop', safety: true, timeMs: T0 + 900 });
  assert.equal(s.events.filter(e => e.safety === true).length, 1);
  idle(api, s); assert.equal(api.blur(s, T0 + 950), s);
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({ suite: 'space-gesture', module: target.href, cases: results.length, failed: failed.length, results,
  scope: 'Pure controls software state on supplied times only. No browser, key hardware, timing, pixel or biological validation.' }, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
