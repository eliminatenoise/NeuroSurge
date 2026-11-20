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
const run = samples => { let st = null, roll = 0, rollingAt = -1, from = -1; const firstOf = new Map(); samples.forEach(([dx, dy], i) => { const r = circleRollStep(st, dx, dy); st = r.state; roll += r.rollDeg; if (!r.rolling && r.chunk >= 0 && !firstOf.has(r.chunk)) firstOf.set(r.chunk, i); if (r.started) { rollingAt = i; from = firstOf.get(r.state.from); } }); return { roll, rollingAt, st, fromSample: from }; };
// a circle as the browser reports it: whole-pixel moves, one sample per frame (`per` frames for a whole turn)
const pixelCircle = (loops, cw, r, per, x0 = 0, y0 = 0, a0 = 0) => {
  const out = []; let px = Math.round(x0 + r * Math.cos(a0)), py = Math.round(y0 + r * Math.sin(a0));
  for (let k = 1; k <= Math.round(loops * per); k++) {
    const a = a0 + (cw ? 1 : -1) * 2 * Math.PI * k / per, x = Math.round(x0 + r * Math.cos(a)), y = Math.round(y0 + r * Math.sin(a));
    out.push([x - px, y - py]); px = x; py = y;
  }
  return out;
};

test('a clockwise circle rolls clockwise (+), an anticlockwise one anticlockwise (-), by gain of the turn after the start', () => {
  const cw = run(circleSamples(2, true)), ccw = run(circleSamples(2, false));
  assert.ok(cw.rollingAt > 0 && ccw.rollingAt > 0, 'both count as circles');
  assert.ok(cw.roll > 0 && ccw.roll < 0);
  assert.ok(Math.abs(cw.roll + ccw.roll) < 1e-6, 'the same amount either way');
  // two whole loops (720 degrees of the pointer's direction): the turn up to the circle's start (at least startDeg) only
  // counts it, and the direction is taken over a chord, which trails the pointer a little
  assert.ok(cw.roll > (720 - CIRCLE_ROLL.startDeg - 90) * CIRCLE_ROLL.gain && cw.roll < (720 - CIRCLE_ROLL.startDeg) * CIRCLE_ROLL.gain, `${cw.roll}`);
  assert.ok(cw.rollingAt >= Math.floor(CIRCLE_ROLL.startDeg / 10) - 1, 'not before startDeg of turn');
  assert.ok(Math.abs(cw.st.turned) >= CIRCLE_ROLL.startDeg && cw.st.path >= CIRCLE_ROLL.minPathPx);
});

test('straight drags, a zigzag and a small wiggle never count as a circle', () => {
  assert.equal(run(Array.from({ length: 80 }, () => [6, 0])).rollingAt, -1, 'straight');
  assert.equal(run(Array.from({ length: 300 }, (_, i) => [i % 3 ? 1 : 0, i % 7 ? 0 : 1])).rollingAt, -1, 'straight, slowly, in whole pixels');
  assert.equal(run(Array.from({ length: 80 }, (_, i) => [5, i % 2 ? 8 : -8])).rollingAt, -1, 'zigzag (its turns cancel)');
  assert.equal(run(Array.from({ length: 12 }, (_, i) => Array.from({ length: 8 }, () => [i % 2 ? -6 : 6, 0])).flat()).rollingAt, -1, 'back and forth (each turn back starts the count again)');
  assert.equal(run(circleSamples(2, true, 8)).rollingAt, -1, 'a circle a few pixels across is too short a path');
  // an S curve: turns one way then the other, never startDeg the same way
  const s = [...circleSamples(0.5, true), ...circleSamples(0.5, false), ...circleSamples(0.5, true)];
  assert.equal(run(s).rollingAt, -1, 'an S');
});

// 20 November 2026, afternoon (hunt): a circle drawn slowly never counted, because frame samples of whole pixels point
// every which way. The direction is now taken over a chord of chordPx and the turning counted in pieces of chunkPx.
test('a slow circle counts like a fast one, whatever its size and the frame rate', () => {
  for (const r of [30, 60, 100, 250, 400]) for (const per of [20, 60, 105, 200, 400, 800]) {
    const cw = run(pixelCircle(1.5, true, r, per)), ccw = run(pixelCircle(1.5, false, r, per));
    assert.ok(cw.rollingAt > 0 && ccw.rollingAt > 0, `r ${r}, ${per} frames a turn: counted`);
    // half of the turn after the start (about 540 - 300 to 400 degrees)
    assert.ok(cw.roll > 60 && cw.roll < 125 && ccw.roll < -60 && ccw.roll > -125, `r ${r}, ${per} frames a turn: roll ${cw.roll.toFixed(1)} / ${ccw.roll.toFixed(1)}`);
  }
  // the hunt's case: a 100 px circle at 3.3 px a frame (it neither rolled nor counted before)
  assert.ok(run(pixelCircle(1.5, true, 100, 190)).roll > 90);
});

test('the direction is taken only once the pointer is a chord away from an earlier place; the state is never changed', () => {
  let r = { state: null };
  for (let i = 0; i < CIRCLE_ROLL.chordPx - 1; i++) r = circleRollStep(r.state, 1, 0);
  assert.equal(r.state.heading, null);
  assert.equal(r.chunk, 0, 'the drag before it has a direction belongs to the first piece');
  r = circleRollStep(r.state, 1, 0);
  assert.equal(r.state.heading, 0);
  const before = JSON.stringify(r.state);
  circleRollStep(r.state, 3, 4); circleRollStep(r.state, -9, 0);
  assert.equal(JSON.stringify(r.state), before, 'pure');
  assert.equal(circleRollStep(r.state, 0, 0).state.heading, 0, 'no movement: nothing changes');
});

// 20 November 2026, afternoon (hunt): a straight turn made earlier in the same press was taken back when a circle
// counted, unless a sharp corner came between. Only the circle's own stretch is taken back: its first piece starts
// where the circle starts (within one piece), after a pause or a smooth start as after a corner.
test('the circle found is the stretch that turned, not the straight drag before it', () => {
  const straight = Array.from({ length: 15 }, () => [10, 0]); // 150 px right (the press turns the item left / right)
  // after a pause (no samples), a clockwise circle that starts going straight down (its centre to the left)
  const paused = run([...straight, ...pixelCircle(1.4, true, 80, 120, 150 - 80, 0, 0)]);
  // curving smoothly on from the straight drag (a circle whose top is where the drag ends; it starts going right)
  const smooth = run([...straight, ...pixelCircle(1.4, true, 80, 120, 150, 80, -Math.PI / 2)]);
  // a sharp corner first (as section 160 handled)
  const corner = run([...straight, [-4, 7], ...pixelCircle(1.4, true, 80, 120, 146 - 80, 7, 0)]);
  for (const [name, c] of [['paused', paused], ['smooth', smooth], ['corner', corner]]) {
    assert.ok(c.rollingAt > 15, `${name}: counted`);
    assert.ok(c.fromSample >= 15 - Math.ceil(CIRCLE_ROLL.chunkPx / 10), `${name}: the circle starts at sample ${c.fromSample}, the straight drag ends at 15`);
    assert.ok(c.fromSample <= 15 + 4, `${name}: and not long after the circle began (${c.fromSample})`);
  }
  // a circle on its own: it starts with the drag (its first piece is the drag's first)
  assert.equal(run(pixelCircle(1.4, true, 80, 120)).fromSample, 0);
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

// 20 November 2026 (review of the circling gesture): once rolled, a drag or an arrow still turns the item the way the
// pointer or the arrow shows on screen. Checked here on the brain's own transform (ns-brain brainViewTransform): the
// surface point nearest the eye moves the way the drag went, at any roll.
test('after a roll a drag still moves the near surface the way the pointer goes', async () => {
  const B = await import('../scene/src/ns-brain.mjs');
  const { rollOrbitRequests, DRAG_TURN_DIRS } = await import('../scene/src/ns-app.mjs');
  assert.deepEqual(rollOrbitRequests('left', 3, 0), [{ dir: 'left', stepDeg: 3 }], 'no roll: the request as it was');
  const f = { kind: 'ns-brain-frame', tiltDeg: -13, orbitYawLimitDeg: 60, orbitPitchLimitDeg: 60, grabPitchLimitDeg: 60, k: 0.004, pivot: [0, -80, 1550], pivotWorld: [0, 0.3, -1.5], spinDeg: 180 };
  const at = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const scr = w => [w[0] / -w[2], -w[1] / -w[2]]; // screen x right, y down (camera at the origin looking down -z)
  const m0 = B.brainViewTransform({ frame: f }).matrix;
  // a source point on the near side: the pivot moved 60 mm toward the eye in source space (found from the rest matrix)
  const toEye = [-f.pivotWorld[0], -f.pivotWorld[1], -f.pivotWorld[2]], n = Math.hypot(...toEye);
  const src = [0, 1, 2].map(i => f.pivot[i] + [m0[i * 4], m0[i * 4 + 1], m0[i * 4 + 2]].reduce((s, v, j) => s + v * toEye[j] / n, 0) * 0.06 / (f.k * f.k));
  for (const roll of [0, 45, 90, 160, -90]) for (const [drag, axis, sign] of [['right', 0, 1], ['left', 0, -1], ['down', 1, 1], ['up', 1, -1]]) {
    let orbit = { yaw: 0, pitch: 0 };
    for (const q of rollOrbitRequests(DRAG_TURN_DIRS.brain[drag], 3, roll)) orbit = B.orbitStepView(orbit, q.dir, { orbitStepDeg: q.stepDeg });
    const p0 = scr(at(B.brainViewTransform({ frame: f, orbitRoll: roll }).matrix, src));
    const p1 = scr(at(B.brainViewTransform({ frame: f, orbitRoll: roll, orbitYaw: orbit.yaw, orbitPitch: orbit.pitch }).matrix, src));
    const d = [p1[0] - p0[0], p1[1] - p0[1]];
    assert.ok(Math.sign(d[axis]) === sign && Math.abs(d[axis]) > 3 * Math.abs(d[1 - axis]), `roll ${roll}, drag ${drag}: ${d}`);
  }
});
