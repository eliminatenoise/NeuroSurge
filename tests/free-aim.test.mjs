// 24 November 2026 (FREE_AIM, DESIGN-DECISIONS section 206): with the pointer free the pointer is the aim; the last
// thing the player moved wins (ns-app aimStep), and the tip keeps an area's or a muscle's own words under the pointer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FREE_AIM, aimStep } from '../scene/src/ns-app.mjs';
import { quietTipModel } from '../scene/src/ns-quiet.mjs';

const W = 1600, H = 900;
const at = (x, y, timeMs) => ({ x, y, timeMs });
/** Runs frames through aimStep, 16 ms apart; each frame gives only what changes (rest: n = n more frames of nothing). */
function run(frames) {
  let seen = null, cur = { pointer: null, lookMs: null, yaw: 0, pitch: -0.445, free: true, width: W, height: H, busy: false, down: false, gazeArea: null, clicked: false }, t = 0;
  const out = [];
  for (const f of frames) {
    const { rest = 0, ...change } = f;
    cur = { ...cur, clicked: false, ...change };
    for (let k = 0; k <= rest; k++) { t += 16; const r = aimStep(seen, { ...cur, nowMs: t }); seen = r.seen; if (k === rest) out.push(r); cur = { ...cur, clicked: false }; }
  }
  return out;
}

test('the rule is on, and off it leaves the crosshair as the only aim', () => {
  assert.equal(FREE_AIM.on, true);
  assert.ok(FREE_AIM.restMs >= 60 && FREE_AIM.restMs <= 200, 'the rest is short: it is the time a hand takes to stop');
  const [a] = run([{ pointer: at(550, 120, 10), on: false }]);
  assert.equal(a.pointer, false);
  assert.deepEqual([a.x, a.y], [W / 2, H / 2]);
});

test('before the pointer is known the crosshair at the middle of the picture is the aim', () => {
  const [a] = run([{}]);
  assert.equal(a.pointer, false);
  assert.deepEqual([a.x, a.y], [800, 450]);
  assert.equal(a.silent, false);
  assert.equal(a.arrivedFrom, undefined);
  assert.equal(a.ms, null);
});

test('a free pointer that moves over the picture takes the aim at its own place; what it rests on is met as an arrival', () => {
  const [, a, b, c] = run([{}, { pointer: at(550, 120, 100) }, { rest: 4, gazeArea: 'rh_middle' }, { rest: 3 }]);
  assert.equal(a.pointer, true);
  assert.deepEqual([a.x, a.y], [550, 120]);
  assert.equal(a.silent, true, 'on its way the pointer names what it crosses and switches nothing on');
  assert.equal(a.ms, 100, 'the pointer\'s move as the aim is a look of the player\'s own');
  assert.equal(b.pointer, true, 'a resting pointer keeps the aim');
  assert.equal(b.silent, true, 'not yet rested for restMs (80 ms)');
  assert.equal(c.silent, false, 'rested');
  // the frame it has rested: an arrival from the area the activity had before the move (none)
  const frames = run([{}, { pointer: at(550, 120, 100) }, { gazeArea: 'rh_middle' }, {}, {}, {}, {}, {}, {}, {}]);
  const arrivals = frames.filter(f => f.arrivedFrom !== undefined);
  assert.equal(arrivals.length, 1, 'one frame tells the activity');
  assert.equal(arrivals[0].arrivedFrom, null, 'it came from no area: the area it rests on switches on');
  assert.equal(arrivals[0].silent, false);
  assert.equal(frames.at(-1).arrivedFrom, undefined, 'a pointer that stays rested tells nothing more');
});

test('a sweep across the strip switches nothing on; the area it stops on does', () => {
  const sweep = [{}];
  for (let i = 0; i <= 17; i++) sweep.push({ pointer: at(420 + i * 20, 150, 100 + i * 16), gazeArea: `area_${i}` });
  const moving = run(sweep).slice(1);
  assert.ok(moving.every(f => f.pointer && f.silent && f.arrivedFrom === undefined), 'every frame of the sweep is silent');
  const stopped = run([...sweep, { rest: 7 }]).at(-1);
  // (the last frames: rested; the arrival was told on the first rested frame)
  assert.equal(stopped.silent, false);
  const all = []; { let seen = null, t = 0, cur = { pointer: null, lookMs: null, yaw: 0, pitch: 0, free: true, width: W, height: H };
    { t += 16; const r = aimStep(seen, { ...cur, nowMs: t }); seen = r.seen; }
    for (let i = 0; i <= 17; i++) { t += 16; const r = aimStep(seen, { ...cur, pointer: at(420 + i * 20, 150, t), gazeArea: i ? `area_${i - 1}` : null, nowMs: t }); seen = r.seen; all.push(r); }
    const last = at(760, 150, t);
    for (let k = 0; k < 10; k++) { t += 16; const r = aimStep(seen, { ...cur, pointer: last, gazeArea: 'area_17', nowMs: t }); seen = r.seen; all.push(r); } }
  const told = all.filter(f => f.arrivedFrom !== undefined);
  assert.equal(told.length, 1);
  assert.equal(told[0].arrivedFrom, null, 'it crossed other areas on the way: where it stops is a new arrival');
});

test('small moves within the area the pointer rests on start nothing; leaving it and coming back starts it again', () => {
  // rested on A; a 10 px move within A, rested again: arrivedFrom A (the activity starts nothing for the same area)
  const within = run([{}, { pointer: at(550, 120, 100) }, { gazeArea: 'A', rest: 9 }, { pointer: at(560, 122, 400) }, { rest: 9 }]);
  const frames = (() => { let seen = null, t = 0; const cur = { lookMs: null, yaw: 0, pitch: 0, free: true, width: W, height: H }; const out = [];
    const step = (pointer, gazeArea) => { t += 16; const r = aimStep(seen, { ...cur, pointer, gazeArea, nowMs: t }); seen = r.seen; out.push(r); };
    const p1 = at(550, 120, 100), p2 = at(560, 122, 400);
    step(null, null); step(p1, null); for (let k = 0; k < 9; k++) step(p1, 'A'); step(p2, 'A'); for (let k = 0; k < 9; k++) step(p2, 'A');
    return out; })();
  const told = frames.filter(f => f.arrivedFrom !== undefined);
  assert.deepEqual(told.map(f => f.arrivedFrom), [null, 'A'], 'the second rest came from A and never left it');
  assert.equal(within.at(-1).silent, false);
  // off A onto nothing and back onto A: a new arrival
  const back = (() => { let seen = null, t = 0; const cur = { lookMs: null, yaw: 0, pitch: 0, free: true, width: W, height: H }; const out = [];
    const step = (pointer, gazeArea) => { t += 16; const r = aimStep(seen, { ...cur, pointer, gazeArea, nowMs: t }); seen = r.seen; out.push(r); };
    const p1 = at(550, 120, 100), away = at(900, 700, 300), p3 = at(552, 121, 500);
    step(null, null); step(p1, null); for (let k = 0; k < 9; k++) step(p1, 'A'); step(away, 'A'); step(away, null); step(p3, null); for (let k = 0; k < 9; k++) step(p3, 'A');
    return out; })();
  assert.deepEqual(back.filter(f => f.arrivedFrom !== undefined).map(f => f.arrivedFrom), [null, null]);
});

test('a click needs no rest, and no arrival follows it', () => {
  const frames = (() => { let seen = null, t = 0; const cur = { lookMs: null, yaw: 0, pitch: 0, free: true, width: W, height: H }; const out = [];
    const step = (pointer, gazeArea, more = {}) => { t += 16; const r = aimStep(seen, { ...cur, pointer, gazeArea, nowMs: t, ...more }); seen = r.seen; out.push(r); };
    const p = at(550, 120, 100);
    step(null, null); step(p, null); step(p, 'A', { down: true }); step(p, 'A', { clicked: true }); for (let k = 0; k < 9; k++) step(p, 'A');
    return out; })();
  assert.equal(frames[3].silent, false, 'the frame of the click is not silent: the click presses what is under the pointer');
  assert.ok(frames.every(f => f.arrivedFrom === undefined), 'the click took the area: the rest that follows tells nothing');
});

test('a captured pointer, a pointer outside the picture and a paused game leave the aim at the crosshair', () => {
  assert.equal(run([{}, { pointer: at(550, 120, 100), free: false }])[1].pointer, false);
  assert.equal(run([{}, { pointer: at(-4, 120, 100) }])[1].pointer, false);
  assert.equal(run([{}, { pointer: at(550, 901, 100) }])[1].pointer, false);
  assert.equal(run([{}, { pointer: at(NaN, 120, 100) }])[1].pointer, false);
});

test('a look the player turns (a drag on empty space) puts the aim at the crosshair until the pointer next moves', () => {
  const r = run([{}, { pointer: at(1300, 300, 100), rest: 9 },
    // the drag: the pointer and the look change in the same frames
    { pointer: at(1280, 308, 116), lookMs: 116, yaw: 0.08, pitch: -0.48, down: true },
    { pointer: at(1260, 316, 132), lookMs: 132, yaw: 0.16, pitch: -0.51, down: true },
    { down: false },                 // released; nothing moves
    { pointer: at(1262, 316, 400) }, // the pointer moves again
  ]);
  assert.equal(r[1].pointer, true);
  assert.equal(r[2].pointer, false, 'the look moved last');
  assert.equal(r[2].silent, false, 'a look the player turned is a look: the crosshair may switch things on');
  assert.equal(r[3].pointer, false);
  assert.equal(r[4].pointer, false, 'the released pointer has not moved since the look did');
  assert.deepEqual([r[4].x, r[4].y], [800, 450]);
  assert.equal(r[5].pointer, true);
  assert.equal(r[5].ms, 400);
  assert.ok(r[4].ms === 132, 'while the crosshair aims the time is the look\'s own');
});

test('an arrow key\'s step (the game sets the look) puts the aim at the crosshair from the next frame', () => {
  const r = run([{}, { pointer: at(550, 120, 100), rest: 9 }, { yaw: 0.35, pitch: -0.37 }, {}, { pointer: at(551, 120, 900) }]);
  assert.equal(r[2].pointer, false);
  assert.equal(r[2].silent, false, 'the key\'s look is the player\'s: the area it lands on is met, not recorded silently');
  assert.equal(r[3].pointer, false);
  assert.equal(r[2].ms, 100, 'the player\'s aim time does not move back when the crosshair takes over');
  assert.equal(r[3].ms, 100);
  assert.equal(r[4].pointer, true);
  assert.equal(r[4].ms, 900);
});

test('while a button is down the aiming pointer records silently; the release is not silent', () => {
  const r = run([{}, { pointer: at(550, 120, 100), rest: 9 }, { down: true }, { pointer: at(552, 121, 150) }, { down: false }]);
  assert.equal(r[2].pointer, true);
  assert.equal(r[2].silent, true);
  assert.equal(r[3].pointer, true, 'a drag that turns the brain moves the pointer, not the look: the pointer stays the aim');
  assert.equal(r[3].silent, true);
  assert.equal(r[4].pointer, true);
  assert.equal(r[4].silent, false, 'the click at the release presses what is under the pointer');
});

test('Space, a hold or a carry gives the aim to the crosshair at once, silently; so does the pointer leaving', () => {
  const sp = run([{}, { pointer: at(550, 120, 100), rest: 9 }, { busy: true }, {}, { busy: false }]);
  assert.equal(sp[2].pointer, false);
  assert.equal(sp[2].silent, true, 'nothing at the crosshair switches on because Space was pressed');
  assert.equal(sp[3].silent, false, 'only the frame of the change is silent');
  assert.equal(sp[4].pointer, true, 'after the hold the resting pointer is the aim again');
  const out = run([{}, { pointer: at(550, 120, 100), rest: 9 }, { pointer: null }, {}]);
  assert.equal(out[2].pointer, false);
  assert.equal(out[2].silent, true);
  assert.equal(out[3].silent, false);
});

test('the tip: a named part can carry the Space line as its second line', () => {
  const muscle = quietTipModel({ pick: { name: 'biceps brachii', kind: 'muscle' }, color: '#19a0c8' });
  assert.equal(muscle.title, 'Biceps brachii');
  assert.equal(muscle.hint, undefined);
  const area = quietTipModel({ area: { id: 'rh_elbow', plainLabel: 'Left elbow', actions: [] }, moves: [], hint: 'Bend left elbow' });
  assert.equal(area.kind, 'area');
  assert.equal(area.hint, 'Bend left elbow');
});
