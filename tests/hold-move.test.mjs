/** Hold-and-move (owner, 17 November: "trackpad drag to move items essentially within the XY dimension, whilst WASD
 * moves things in the XZ dimension ... when you grasp cursor, you're not actually moving things. When it comes to the
 * mirror body, up and down, you need to be able to move up and down").
 * Pure software state only: the controls reducer (a held item takes the pointer movement, the look stays), the split
 * of that movement into an item move and a look turn at the edge of the comfortable view, and the carry reducer (the
 * held mirror body and brain move right / left and UP / DOWN by the pointer, level with W/A/S/D). No browser, no
 * pixels, no timing, nothing biological.
 * Run: node --test tests/hold-move.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createControls } from '../scene/src/ns-controls.mjs';
import { carryPointer, stepObjectCarry, initialObjectCarry, CARRY_VIEW } from '../scene/src/ns-reference-graph.mjs';

const DEG = Math.PI / 180;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('a held item takes the pointer movement and the look stays; letting go gives the look back', () => {
  const c = createControls();
  let s = c.initialState();
  s = c.pointerMove(s, 40, -20, 1);
  const look = { yaw: s.yaw, pitch: s.pitch };
  assert.ok(look.yaw !== 0 && look.pitch !== 0, 'with nothing held the pointer turns the look');
  assert.equal(c.takeCarry(s).move, null);

  s = c.setCarry(s, true);
  assert.equal(c.carryState(s).on, true);
  s = c.pointerMove(s, 30, 10, 2);
  s = c.pointerMove(s, -5, 15, 3);
  assert.deepEqual({ yaw: s.yaw, pitch: s.pitch }, look, 'the look does not move while an item is held');
  let r = c.takeCarry(s);
  assert.deepEqual(r.move, { dx: 25, dy: 25 });
  s = r.state;
  assert.equal(c.takeCarry(s).move, null, 'movement is handed over once');
  assert.equal(c.setCarry(s, true), s, 'saying it again changes nothing');

  s = c.pointerMove(s, 7, 7, 4);
  s = c.setCarry(s, false);
  assert.equal(c.takeCarry(s).move, null, 'movement not taken before the release is dropped');
  s = c.pointerMove(s, 10, 0, 5);
  assert.ok(s.yaw !== look.yaw, 'after the release the pointer turns the look again');
});

test('a safety release (blur) ends the hold-and-move mode', () => {
  const c = createControls();
  let s = c.setCarry(c.initialState(), true);
  s = c.pointerMove(s, 12, 3, 1);
  s = c.blur(s, 2);
  assert.equal(c.carryState(s).on, false);
  assert.equal(c.takeCarry(s).move, null);
});

test('carryPointer: inside the comfortable view the item moves a pixel per pixel and the look stays', () => {
  const q = carryPointer({ centre: [0, 0, -2], eye: [0, 0, 0], look: { yaw: 0, pitch: 0 }, dxPx: 100, dyPx: -50, viewHeightPx: 900, fovYDeg: 110, lookRadPerPx: 0.0025 });
  const mPerPx = 2 * 2 * Math.tan(55 * DEG) / 900;
  assert.ok(near(q.shiftM[0], 100 * mPerPx) && near(q.shiftM[1], 50 * mPerPx), 'right and UP by the pointer, at the item distance');
  assert.deepEqual(q.lookDelta, { yaw: 0, pitch: 0 });
});

test('carryPointer: past the edge of the comfortable view the rest of the movement turns the look', () => {
  const edge = 2 * Math.tan(CARRY_VIEW.sideDeg * DEG);
  const start = edge - 0.1;
  const q = carryPointer({ centre: [start, 0, -2], eye: [0, 0, 0], look: { yaw: 0, pitch: 0 }, dxPx: 200, dyPx: 0, viewHeightPx: 900, fovYDeg: 110, lookRadPerPx: 0.0025 });
  assert.ok(near(q.shiftM[0], 0.1, 1e-9), 'only the room left is taken as a move');
  assert.ok(q.lookDelta.yaw < 0, 'the rest turns the look to the right (yaw falls)');
  const leftPx = 200 - 0.1 / q.mPerPx;
  assert.ok(near(q.lookDelta.yaw, -leftPx * 0.0025, 1e-9));
  // Coming back in is free, also from outside.
  const back = carryPointer({ centre: [edge + 0.5, 0, -2], eye: [0, 0, 0], look: { yaw: 0, pitch: 0 }, dxPx: -30, dyPx: 0, viewHeightPx: 900, fovYDeg: 110, lookRadPerPx: 0.0025 });
  assert.ok(back.shiftM[0] < 0 && back.lookDelta.yaw === 0);
  // Up: the look's own height plus upDeg, never past maxElevationDeg.
  const up = carryPointer({ centre: [0, 2 * Math.tan(CARRY_VIEW.upDeg * DEG), -2], eye: [0, 0, 0], look: { yaw: 0, pitch: 0 }, dxPx: 0, dyPx: -40, viewHeightPx: 900, fovYDeg: 110, lookRadPerPx: 0.0025 });
  assert.ok(near(up.shiftM[1], 0, 1e-9) && up.lookDelta.pitch > 0, 'at the top edge an upward push looks up');
});

// A minimal frame for the carry reducer: the brain 6 m ahead, the mirror body 1.6 m ahead, camera at the origin.
const carryInputs = (over = {}) => ({
  pick: { target: 'mirror', centreWorldM: [0, -0.35, -1.6], radiusM: 0.7, mirrorEnvelope: { radiusM: 0.7 } },
  events: [], gazeAt: 0, axes: { x: 0, z: 0 }, wallDt: 0.016, poseDt: 0.016,
  origin: [0, 0, 0], look: { yaw: 0, pitch: 0 }, brainView: { offset: { yaw: 0, pitch: 0 } }, brainTransform: null,
  brainCentre: [0, 4, -6], brainTranslation: [0, 0, 0], brainFrame: { clearanceM: 1, minBrainDistanceM: 5, reachM: 1 }, referenceOrigin: [0, 0, 0],
  viewport: { aspect: 16 / 9, fovYDeg: 110, nearM: 0.05 },
  constrainBrainMovement: m => ({ movement: m.slice(), diagnostic: { acceptedFraction: 1 } }), ...over
});

test('a held mirror body is lifted and lowered by the pointer shift and stays level under W/A/S/D', () => {
  let r = stepObjectCarry(initialObjectCarry(), carryInputs());
  r = stepObjectCarry(r.state, carryInputs({ events: [{ type: 'grasp', down: true, target: 'mirror', at: 0 }] }));
  assert.equal(r.state.held, true);
  assert.equal(r.state.target, 'mirror');
  const c0 = r.mirrorWorldCentre.slice();
  r = stepObjectCarry(r.state, carryInputs({ shiftM: [0.2, 0.5] }));
  assert.ok(near(r.mirrorWorldCentre[0], c0[0] + 0.2) && near(r.mirrorWorldCentre[1], c0[1] + 0.5) && near(r.mirrorWorldCentre[2], c0[2]), 'right and UP, same depth');
  r = stepObjectCarry(r.state, carryInputs({ shiftM: [0, -1.2] }));
  assert.ok(r.mirrorWorldCentre[1] < c0[1], 'and down below where it started');
  const lifted = r.mirrorWorldCentre.slice();
  r = stepObjectCarry(r.state, carryInputs({ axes: { x: 0, z: 1 } }));
  assert.ok(near(r.mirrorWorldCentre[1], lifted[1]) && r.mirrorWorldCentre[2] < lifted[2], 'W: farther, same height');
  r = stepObjectCarry(r.state, carryInputs({ axes: { x: 1, z: 0 } }));
  assert.ok(r.mirrorWorldCentre[0] > lifted[0] && near(r.mirrorWorldCentre[1], lifted[1]), 'D: to the right, same height');
  // Let go: it stays where it was put (no ground pulls it back).
  const put = r.mirrorWorldCentre.slice();
  r = stepObjectCarry(r.state, carryInputs({ events: [{ type: 'grasp', down: false, at: 0 }] }));
  assert.equal(r.state.held, false);
  assert.deepEqual(r.mirrorWorldCentre, put);
  r = stepObjectCarry(r.state, carryInputs({ shiftM: [1, 1] }));
  assert.deepEqual(r.mirrorWorldCentre, put, 'a shift with nothing held moves nothing');
});

test('a held mirror body follows the look up and down as well as round (the look carries it past the edge)', () => {
  let r = stepObjectCarry(initialObjectCarry(), carryInputs());
  r = stepObjectCarry(r.state, carryInputs({ events: [{ type: 'grasp', down: true, target: 'mirror', at: 0 }] }));
  const d0 = Math.hypot(...r.mirrorWorldCentre);
  r = stepObjectCarry(r.state, carryInputs({ look: { yaw: 0, pitch: 20 * DEG } }));
  assert.ok(r.mirrorWorldCentre[1] > -0.35 + 0.3, 'a look up lifts it');
  assert.ok(near(Math.hypot(...r.mirrorWorldCentre), d0, 1e-9), 'at the same distance from the eye');
});

test('a held brain moves right / left and up / down by the pointer shift', () => {
  let r = stepObjectCarry(initialObjectCarry(), carryInputs({ pick: { target: 'brain' } }));
  r = stepObjectCarry(r.state, carryInputs({ pick: { target: 'brain' }, events: [{ type: 'grasp', down: true, target: 'brain', at: 0 }] }));
  assert.equal(r.state.target, 'brain');
  r = stepObjectCarry(r.state, carryInputs({ pick: { target: 'brain' }, shiftM: [0.4, -0.3] }));
  assert.ok(near(r.brainMovementWorld[0], 0.4) && near(r.brainMovementWorld[1], -0.3) && near(r.brainMovementWorld[2], 0), 'x and y only: never depth');
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

test('page binding: with the mouse captured, movement goes to the held item and not to the look', () => {
  const p = page({ locked: true });
  try {
    p.move(20, 0);
    const yaw = p.state.yaw;
    assert.ok(yaw !== 0);
    p.state = p.controls.setCarry(p.state, true);
    p.move(15, -5); p.move(5, -5);
    assert.equal(p.state.yaw, yaw);
    assert.deepEqual(p.controls.takeCarry(p.state).move, { dx: 20, dy: -10 });
  } finally { p.unbind(); }
});

test('page binding: with a free pointer (no capture, no button) a held item still follows the pointer', () => {
  const p = page({ locked: false });
  try {
    p.move(30, 10);
    assert.equal(p.state.yaw, 0, 'a free pointer with nothing held and no button turns nothing');
    assert.equal(p.controls.takeCarry(p.state).move, null);
    p.state = p.controls.setCarry(p.state, true);
    p.move(30, 10);
    assert.equal(p.state.yaw, 0);
    assert.deepEqual(p.controls.takeCarry(p.state).move, { dx: 30, dy: 10 });
  } finally { p.unbind(); }
});

test('carryPointer: a height limit holds the item and does not turn the look instead', () => {
  const base = { eye: [0, 0, 0], look: { yaw: 0, pitch: 0 }, dxPx: 0, viewHeightPx: 900, fovYDeg: 110, lookRadPerPx: 0.0025, heightM: [-1.6, 2.2] };
  const down = carryPointer({ ...base, centre: [0, -1.5, -3], dyPx: 200 });
  assert.ok(Math.abs(down.shiftM[1] + 0.1) < 1e-9, 'only the 0.1 m left above the lowest height is taken');
  assert.equal(down.lookDelta.pitch, 0, 'and the look does not carry it lower');
  const free = carryPointer({ ...base, centre: [0, -1.5, -3], dyPx: -50 });
  assert.ok(free.shiftM[1] > 0, 'back up is free');
  const noLimit = carryPointer({ ...base, heightM: null, centre: [0, -1.5, -3], dyPx: 200 });
  assert.ok(noLimit.shiftM[1] < -0.1, 'with no limit the same push goes on down');
});
