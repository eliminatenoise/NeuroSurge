/** The circling gesture (ns-app CIRCLE_ROLL, 20 November 2026; the owner: "a great big circling motion, clockwise or
 * anti-clockwise ... whilst clicking ... we can turn it clockwise or anti-clockwise"): a drag that goes round rolls the
 * brain or the mirror body about the line from the eye. Drag samples here are made-up inputs to the pure rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { circleRollStep, CIRCLE_ROLL } from '../scene/src/ns-app.mjs';
import { mirrorOrbitRoll, mirrorOrbitStep } from '../scene/src/ns-mirror.mjs';

const circleSamples = (loops, cw, r = 90, per = 36) => {
  const out = []; let px = r, py = 0;
  for (let k = 1; k <= loops * per; k++) { const a = (cw ? 1 : -1) * 2 * Math.PI * k / per, x = r * Math.cos(a), y = r * Math.sin(a); out.push([x - px, y - py]); px = x; py = y; }
  return out;
};
const run = samples => { let st = null, roll = 0, rollingAt = -1; samples.forEach(([dx, dy], i) => { const r = circleRollStep(st, dx, dy); st = r.state; roll += r.rollDeg; if (r.rolling && rollingAt < 0) rollingAt = i; }); return { roll, rollingAt, st }; };

test('a clockwise circle rolls clockwise (+), an anticlockwise one anticlockwise (-), by gain of the turn after the start', () => {
  const cw = run(circleSamples(2, true)), ccw = run(circleSamples(2, false));
  assert.ok(cw.rollingAt > 0 && ccw.rollingAt > 0, 'both count as circles');
  assert.ok(cw.roll > 0 && ccw.roll < 0);
  // two whole loops: 72 samples of 10 degrees each, the first only setting the direction (710 degrees of turn); the
  // turn up to the circle's start only counts it
  assert.ok(Math.abs(cw.roll - (710 - cw.st.turned) * CIRCLE_ROLL.gain) < 1e-6, `${cw.roll}`);
  assert.ok(cw.rollingAt >= Math.floor(CIRCLE_ROLL.startDeg / 10) - 1, 'not before startDeg of turn');
});

test('straight drags, a zigzag and a small wiggle never count as a circle', () => {
  assert.equal(run(Array.from({ length: 80 }, () => [6, 0])).rollingAt, -1, 'straight');
  assert.equal(run(Array.from({ length: 80 }, (_, i) => [5, i % 2 ? 8 : -8])).rollingAt, -1, 'zigzag (each turn past maxTurnDeg starts the count again)');
  assert.equal(run(circleSamples(2, true, 8)).rollingAt, -1, 'a circle a few pixels across is too short a path');
  // an S curve: turns one way then the other, never startDeg the same way
  const s = [...circleSamples(0.5, true), ...circleSamples(0.5, false), ...circleSamples(0.5, true)];
  assert.equal(run(s).rollingAt, -1, 'an S');
});

test('tiny samples are joined until they make a step', () => {
  let st = null;
  for (let i = 0; i < 5; i++) st = circleRollStep(st, 0.5, 0).state;
  assert.ok(Math.abs(st.carry[0] - 2.5) < 1e-12 && st.heading === null);
  st = circleRollStep(st, 0.5, 0).state;
  assert.deepEqual(st.carry, [0, 0]);
  assert.equal(st.heading, 0);
});

test('the mirror body keeps its roll through the arrows\' steps, in -180 .. 180', () => {
  let o = { yaw: 0, pitch: 0, push: 0 };
  o = mirrorOrbitRoll(o, 200);
  assert.ok(Math.abs(o.roll - -160) < 1e-9);
  o = mirrorOrbitStep(o, 'left');
  assert.ok(Math.abs(o.roll - -160) < 1e-9, 'an arrow step keeps the roll');
  assert.equal(mirrorOrbitStep({ yaw: 0, pitch: 0, push: 0 }, 'left').roll, undefined, 'no roll field until there is a roll');
});

test('the brain\'s roll turns it about its own centre and the line of sight; 0 changes nothing', async () => {
  const B = await import('../scene/src/ns-brain.mjs');
  const pivot = [0, -80, 1550];
  const f = { kind: 'ns-brain-frame', tiltDeg: -13, orbitYawLimitDeg: 60, orbitPitchLimitDeg: 60, grabPitchLimitDeg: 60, k: 0.004, pivot, pivotWorld: [0, 0.3, -1.5], spinDeg: 180 };
  const a = B.brainViewTransform({ frame: f }), b = B.brainViewTransform({ frame: f, orbitRoll: 0 }), c = B.brainViewTransform({ frame: f, orbitRoll: 90 });
  assert.deepEqual(Array.from(a.matrix), Array.from(b.matrix));
  // the centre stays where it was; a point beside it turns about the line of sight
  const at = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const c0 = at(a.matrix, pivot), c1 = at(c.matrix, pivot);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(c0[i] - c1[i]) < 1e-12);
  const q = [pivot[0] + 30, pivot[1], pivot[2]], q0 = at(a.matrix, q), q1 = at(c.matrix, q);
  const u = f.pivotWorld.map(v => v / Math.hypot(...f.pivotWorld));
  const d0 = q0.map((v, i) => v - c0[i]), d1 = q1.map((v, i) => v - c0[i]);
  const along = d => d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  assert.ok(Math.abs(along(d0) - along(d1)) < 1e-12, 'no move along the line of sight');
  assert.ok(Math.abs(Math.hypot(...d0) - Math.hypot(...d1)) < 1e-12, 'same distance from the centre');
  assert.equal(c.orbitRoll, 90);
  assert.ok(c.restMatrix !== c.matrix, 'the rest placement leaves the roll out');
  assert.deepEqual(Array.from(c.restMatrix), Array.from(a.matrix));
});
