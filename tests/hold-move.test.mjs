/** Holding a thing (19 November 2026; the owner: "for XY movement in the XY plane with grasp cursor control, movement
 * should continue with head movement as well as item movement, just like it usually does. The head should not be
 * locked. The POV, perspective of view, should not be locked." and "XZ plane with grasp WASD should be consistent
 * between the mirror body and the brain should move much faster.").
 * This file used to test the hold-and-move mode of 17 November, in which the pointer moved the held thing across the
 * view and the look stood still (the controls' setCarry / takeCarry and ns-reference-graph carryPointer). That mode is
 * withdrawn and its code removed. What is tested now: the pointer turns the look in every state; a held mirror body
 * turns with the look about the eye at its own distance and stays where it is let go; W / A / S / D move a held brain
 * and a held mirror body by one rule, at the same pace across the picture, eased in and out.
 * Pure software state only. No browser, no pixels, nothing biological.
 * Run: node --test tests/hold-move.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createControls } from '../scene/src/ns-controls.mjs';
import * as RG from '../scene/src/ns-reference-graph.mjs';
const { stepObjectCarry, initialObjectCarry, CARRY_KEYS } = RG;

const DEG = Math.PI / 180;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('the pointer turns the look in every state: nothing in the controls can take it away', () => {
  const c = createControls();
  let s = c.initialState();
  assert.equal(c.setCarry, undefined); assert.equal(c.takeCarry, undefined); assert.equal(c.carryState, undefined);
  assert.equal(RG.carryPointer, undefined); assert.equal(RG.CARRY_VIEW, undefined);
  s = c.pointerMove(s, 40, -20, 1);
  const a = { yaw: s.yaw, pitch: s.pitch };
  assert.ok(a.yaw !== 0 && a.pitch !== 0);
  // while Space holds a grasp (the game says so through noteSpace) the same movement turns the look by the same amount
  s = c.noteSpace(s, { holding: true, turning: false });
  s = c.pointerMove(s, 40, -20, 2);
  assert.ok(near(s.yaw, 2 * a.yaw) && near(s.pitch, 2 * a.pitch), 'held or not, the look turns alike');
  s = c.noteSpace(s, { holding: false, turning: false });
  s = c.pointerMove(s, 40, -20, 3);
  assert.ok(near(s.yaw, 3 * a.yaw), 'and after the release');
});

// A minimal frame for the carry reducer: the brain 6 m ahead, the mirror body 1.6 m ahead, camera at the origin.
const carryInputs = (over = {}) => ({
  pick: { target: 'mirror', centreWorldM: [0, -0.35, -1.6], radiusM: 0.7, mirrorEnvelope: { radiusM: 0.7 } },
  events: [], gazeAt: 0, axes: { x: 0, z: 0 }, wallDt: 0.016, poseDt: 0.016,
  origin: [0, 0, 0], look: { yaw: 0, pitch: 0 }, brainView: { offset: { yaw: 0, pitch: 0 } }, brainTransform: null,
  brainCentre: [0, 0, -6], brainTranslation: [0, 0, 0], brainFrame: { clearanceM: 1, minBrainDistanceM: 5, reachM: 1 }, referenceOrigin: [0, 0, 0],
  viewport: { aspect: 16 / 9, fovYDeg: 54, nearM: 0.05 },
  constrainBrainMovement: m => ({ movement: m.slice(), diagnostic: { acceptedFraction: 1 } }), ...over
});
const grab = target => {
  const pick = target === 'brain' ? { target: 'brain' } : carryInputs().pick;
  let r = stepObjectCarry(initialObjectCarry(), carryInputs({ pick }));
  r = stepObjectCarry(r.state, carryInputs({ pick, events: [{ type: 'grasp', down: true, target, at: 0 }] }));
  assert.equal(r.state.held, true); assert.equal(r.state.target, target);
  return { r, pick };
};

test('a held mirror body turns with the look, up and down as well as round, at its own distance, and stays where it is let go', () => {
  let { r } = grab('mirror');
  const d0 = Math.hypot(...r.mirrorWorldCentre);
  r = stepObjectCarry(r.state, carryInputs({ look: { yaw: 0, pitch: 60 * DEG } }));
  assert.ok(r.mirrorWorldCentre[1] > 1, 'a look up lifts it');
  assert.ok(near(Math.hypot(...r.mirrorWorldCentre), d0, 1e-9), 'at the same distance from the eye');
  r = stepObjectCarry(r.state, carryInputs({ look: { yaw: 90 * DEG, pitch: 60 * DEG } }));
  assert.ok(r.mirrorWorldCentre[0] < -0.5 && near(Math.hypot(...r.mirrorWorldCentre), d0, 1e-9), 'a turn to the left carries it to the left');
  const put = r.mirrorWorldCentre.slice();
  r = stepObjectCarry(r.state, carryInputs({ look: { yaw: 90 * DEG, pitch: 60 * DEG }, events: [{ type: 'grasp', down: false, at: 0 }] }));
  assert.equal(r.state.held, false);
  r = stepObjectCarry(r.state, carryInputs({ look: { yaw: 0, pitch: -30 * DEG } }));
  assert.deepEqual(r.mirrorWorldCentre, put, 'let go, it stays there whatever the look does next');
});

test('W / A / S / D move a held brain and a held mirror body by one rule: the same pace across the picture', () => {
  // half a second of a key, in 16 ms frames; the bearing each has swung and the share its distance has changed by
  const run = (target, axes) => {
    let { r, pick } = grab(target);
    const at = () => (target === 'mirror' ? r.mirrorWorldCentre.slice() : [0, 0, -6].map((v, i) => v + moved[i]));
    const moved = [0, 0, 0];
    for (let i = 0; i < 31; i++) {
      r = stepObjectCarry(r.state, carryInputs({ pick, axes, brainCentre: [0, 0, -6].map((v, k) => v + moved[k]), brainTranslation: moved.slice() }));
      r.brainMovementWorld.forEach((v, k) => { moved[k] += v; });
    }
    const c = at();
    return { bearingDeg: Math.atan2(c[0], -c[2]) / DEG, depth: -c[2], height: c[1], vel: r.state.keyVel };
  };
  const bD = run('brain', { x: 1, z: 0 }), mD = run('mirror', { x: 1, z: 0 });
  assert.ok(bD.bearingDeg > 12 && mD.bearingDeg > 12, `D swings both to the right (${bD.bearingDeg.toFixed(1)} / ${mD.bearingDeg.toFixed(1)} degrees in half a second)`);
  assert.ok(Math.abs(bD.bearingDeg - mD.bearingDeg) < 1.5, 'by the same angle, though one is 6 m away and the other 1.6');
  const bA = run('brain', { x: -1, z: 0 }), mA = run('mirror', { x: -1, z: 0 });
  assert.ok(near(bA.bearingDeg, -bD.bearingDeg, 1e-6) && near(mA.bearingDeg, -mD.bearingDeg, 1e-6), 'A is its mirror image');
  const bW = run('brain', { x: 0, z: 1 }), mW = run('mirror', { x: 0, z: 1 }), bS = run('brain', { x: 0, z: -1 }), mS = run('mirror', { x: 0, z: -1 });
  assert.ok(bW.depth > 6 && mW.depth > 1.6 && bS.depth < 6 && mS.depth < 1.6, 'W farther, S nearer, for both');
  assert.ok(Math.abs(bW.depth / 6 - mW.depth / 1.6) < 0.03, `W: the same share of their distance (${(bW.depth / 6).toFixed(3)} / ${(mW.depth / 1.6).toFixed(3)})`);
  assert.ok(near(mW.height, -0.35) && near(bW.height, 0), 'level: the height stays');
  // much faster than the 1 m a second of before: the brain covers over 1.5 m in that half second
  assert.ok(bW.depth - 6 > 1.5, `the brain went ${(bW.depth - 6).toFixed(2)} m`);
});

test('the key speed eases in and out, and a release of the grasp stops it at once', () => {
  let { r, pick } = grab('brain');
  const speeds = [];
  for (let i = 0; i < 20; i++) { r = stepObjectCarry(r.state, carryInputs({ pick, axes: { x: 0, z: 1 } })); speeds.push(Math.hypot(...r.brainMovementWorld)); }
  assert.ok(speeds[0] > 0 && speeds[0] < 0.2 * speeds[19], 'the first frame is a small part of the full step');
  for (let i = 1; i < 20; i++) assert.ok(speeds[i] >= speeds[i - 1] - 1e-12, 'rising, never jumping back');
  assert.ok(near(r.state.keyVel[1], 1, 0.05), 'full speed within a third of a second');
  // keys up: it runs on a little and comes to rest
  const out = [];
  for (let i = 0; i < 40; i++) { r = stepObjectCarry(r.state, carryInputs({ pick })); out.push(Math.hypot(...r.brainMovementWorld)); }
  assert.ok(out[0] > 0 && out[0] < speeds[19] && out[39] === 0, 'eases out to a stop');
  assert.deepEqual(r.state.keyVel, [0, 0]);
  // a long frame moves as far as the short frames it replaces (the eased speed is integrated, not sampled)
  const dist = n => { let q = grab('brain'), m = 0; for (let i = 0; i < n; i++) { q.r = stepObjectCarry(q.r.state, carryInputs({ pick: q.pick, axes: { x: 0, z: 1 }, wallDt: 0.32 / n, poseDt: 0.32 / n })); m += q.r.brainMovementWorld[2]; } return -m; };
  assert.ok(Math.abs(dist(4) - dist(20)) < 0.02 * dist(20), `${dist(4).toFixed(3)} m in 4 frames, ${dist(20).toFixed(3)} m in 20`);
  // letting go while a key is down: nothing moves after it
  let q = grab('brain');
  for (let i = 0; i < 10; i++) q.r = stepObjectCarry(q.r.state, carryInputs({ pick: q.pick, axes: { x: 1, z: 0 } }));
  q.r = stepObjectCarry(q.r.state, carryInputs({ pick: q.pick, axes: { x: 1, z: 0 }, events: [{ type: 'grasp', down: false, at: 0 }] }));
  assert.deepEqual(q.r.state.keyVel, [0, 0]);
  q.r = stepObjectCarry(q.r.state, carryInputs({ pick: q.pick, axes: { x: 1, z: 0 } }));
  assert.deepEqual(q.r.brainMovementWorld, [0, 0, 0]);
});

test('S can bring a held brain nearer than half its start distance (the key budget is counted from its own place)', () => {
  let { r, pick } = grab('brain');
  const moved = [0, 0, 0];
  for (let i = 0; i < 200; i++) {
    r = stepObjectCarry(r.state, carryInputs({ pick, axes: { x: 0, z: -1 }, brainCentre: [0, 0, -6].map((v, k) => v + moved[k]), brainTranslation: moved.slice() }));
    r.brainMovementWorld.forEach((v, k) => { moved[k] += v; });
  }
  assert.ok(6 - moved[2] < 2, `the brain came to ${(6 - moved[2]).toFixed(2)} m (before, it stopped at 3 m: half way)`);
  assert.ok(CARRY_KEYS.ratePerS > 0.3 && CARRY_KEYS.easeS > 0 && CARRY_KEYS.easeS <= 0.2);
});

// ---- the glow of the player's own movements (ns-move-glow) -------------------------------------------------------------
import { MOVE_GLOW, moveTargetLevel, createMoveChannels } from '../scene/src/ns-move-glow.mjs';

test('movement glow: the level follows the speed, is plain while moving and fades when still', () => {
  assert.equal(moveTargetLevel(0), 0);
  assert.ok(moveTargetLevel(20) > 0.25 && moveTargetLevel(20) < moveTargetLevel(60) && moveTargetLevel(60) < moveTargetLevel(200), 'faster = brighter');
  assert.ok(moveTargetLevel(-60) === moveTargetLevel(60), 'either direction');
  assert.ok(moveTargetLevel(1e6) <= MOVE_GLOW.max);

  const ch = createMoveChannels();
  const row = { actionId: 'rh_neck_turn_left', regionId: 'rh_neck' };
  const seen = () => { const out = {}; ch.each((key, lv, r) => { out[key] = { lv, r }; }); return out; };
  for (let i = 0; i < 12; i++) { ch.feed('neck:left', 80, row); ch.step(1 / 60); }
  const moving = seen()['neck:left'];
  assert.ok(moving && moving.lv > 0.6 && moving.r === row, 'after 0.2 s of turning the channel is bright and carries its row');
  // Still: nothing is fed any more.
  for (let i = 0; i < 12; i++) ch.step(1 / 60);
  const fading = ch.levelOf('neck:left');
  assert.ok(fading > 0 && fading < moving.lv, 'it fades');
  for (let i = 0; i < 60; i++) ch.step(1 / 60);
  assert.equal(ch.size, 0, 'and is gone within a second');
  assert.deepEqual(seen(), {});
});

test('movement glow: only the direction that moves is fed, and the strongest feed of a frame counts', () => {
  const ch = createMoveChannels();
  ch.feed('a', 10, { regionId: 'x' }); ch.feed('a', 90, { regionId: 'y' }); ch.feed('a', 30, { regionId: 'z' });
  ch.step(1);
  assert.ok(Math.abs(ch.levelOf('a') - moveTargetLevel(90)) < 1e-12);
  assert.deepEqual(ch.row('a'), { regionId: 'x' }, 'the row of a channel is set once');
  assert.equal(ch.levelOf('b'), 0, 'a channel that was never fed shows nothing');
  ch.step(0); // a frozen frame changes nothing
  assert.ok(Math.abs(ch.levelOf('a') - moveTargetLevel(90)) < 1e-12);
});

// ---- the page binding: a held item follows the pointer with the mouse captured and with a free pointer ----------------
import { bindDom } from '../scene/src/ns-controls.mjs';

class Bucket {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, fields = {}) { const e = { timeStamp: performance.now(), preventDefault() {}, ...fields }; for (const fn of [...(this.listeners.get(type) || [])]) fn(e); return e; }
}
function page({ locked }) {
  const controls = createControls();
  let state = controls.initialState();
  const view = new Bucket(), doc = new Bucket(), canvas = new Bucket();
  view.performance = performance; doc.defaultView = view; canvas.ownerDocument = doc;
  doc.pointerLockElement = locked ? canvas : null;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  const unbind = bindDom(canvas, controls, () => state, s => { state = s; }, {});
  return { controls, unbind, get state() { return state; }, set state(s) { state = s; },
    move: (movementX, movementY, buttons = 0) => doc.emit('mousemove', { target: canvas, clientX: 100, clientY: 100, buttons, movementX, movementY }) };
}

test('page binding: with the mouse captured, the pointer turns the look while something is held, exactly as when nothing is', () => {
  const p = page({ locked: true });
  try {
    p.move(20, 0);
    const yaw = p.state.yaw;
    assert.ok(yaw !== 0);
    p.state = p.controls.noteSpace(p.state, { holding: true, turning: false });
    p.move(15, -5); p.move(5, -5);
    assert.ok(near(p.state.yaw, 2 * yaw) && p.state.pitch > 0, 'the look turned on by the same rate');
  } finally { p.unbind(); }
});

test('page binding: with a free pointer (no capture, no button) the look follows the pointer only while something is held', () => {
  const p = page({ locked: false });
  try {
    p.move(30, 10);
    assert.equal(p.state.yaw, 0, 'a free pointer with nothing held and no button turns nothing');
    p.state = p.controls.noteSpace(p.state, { holding: true, turning: false });
    p.move(30, 10);
    assert.ok(p.state.yaw < 0 && p.state.pitch < 0, 'held: the pointer turns the look, and the look carries the held thing');
    p.state = p.controls.noteSpace(p.state, { holding: false, turning: false });
    const yaw = p.state.yaw;
    p.move(30, 10);
    assert.equal(p.state.yaw, yaw, 'let go: a free pointer turns nothing again');
  } finally { p.unbind(); }
});
