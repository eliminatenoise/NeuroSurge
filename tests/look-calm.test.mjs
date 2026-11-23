// Section 198 (22 November 2026, package LOOK2): no flash, no flicker, no clutter on the strip and the picture.
// The pure parts: the held arrow's quiet walk, the canvas's focus ring, the area's strike floor, the muscles' colour at
// the full level, the tried mark, the beams' screen width, the strip's bend per point, multisampling at Low.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { walkQuietStep, walkUiEvent, AREA_WALK_QUIET, focusRingInput, bindFocusRing, FOCUS_RING } from '../scene/src/ns-look-calm.mjs';
import { createQuietUi } from '../scene/src/ns-quiet.mjs';
import { fakeDoc, all, hasClass } from './fake-doc.mjs';
import { POWER_UP, powerUpEnvelope, powerUpGlsl } from '../scene/src/ns-colors.mjs';
import { patchPowerUpShaders, HDR_BLOOM, REGION_BORDER, patchRegionBorderShaders, antialiasFor, MSAA_AT_LOW } from '../scene/src/ns-scene-three.mjs';
import { LIGHT_BEAM, beamHalfCapM } from '../scene/src/ns-links.mjs';
import { crestStripS, crestStripV, crestBendFull, crestStripGlsl, CREST_PER_POINT, MEDIAL_TURN, CREST_COMPRESS } from '../scene/src/ns-brain.mjs';
import { OUTLINE_AA, outlineSsFactor } from '../scene/src/ns-outline.mjs';
import { createControls, bindDom, AREA_KEY_REPEAT_MS } from '../scene/src/ns-controls.mjs';
import * as TEXT from '../scene/src/ns-text.mjs';

test('H18: a held arrow walks quietly; the block it stops on is met as an arrival once, when the key comes up', () => {
  const o = AREA_WALK_QUIET;
  assert.equal(o.on, true);
  // a single press (no repeat): nothing to do, the block switches on as before
  assert.deepEqual(walkQuietStep(null, { nowMs: 0, gazeArea: 'a' }), { keep: null, silent: false, arrivedFrom: undefined });
  assert.deepEqual(walkQuietStep(null, { released: true, nowMs: 0, gazeArea: 'a' }), { keep: null, silent: false, arrivedFrom: undefined });
  // the first repeat: silent from now, remembering where the walk began
  let w = walkQuietStep(null, { heldStep: true, nowMs: 1000, gazeArea: 'rh_elbow/x' });
  assert.equal(w.silent, true); assert.equal(w.arrivedFrom, undefined); assert.deepEqual(w.keep, { from: 'rh_elbow/x', lastMs: 1000 });
  // frames between held steps stay silent; a later held step keeps the walk's start
  w = walkQuietStep(w.keep, { nowMs: 1100, gazeArea: 'rh_wrist/y' }); assert.equal(w.silent, true);
  w = walkQuietStep(w.keep, { heldStep: true, nowMs: 1200, gazeArea: 'rh_wrist/y' }); assert.deepEqual(w.keep, { from: 'rh_elbow/x', lastMs: 1200 });
  // the release: not silent, and the activity is told where the look came from
  const end = walkQuietStep(w.keep, { released: true, nowMs: 1250, gazeArea: 'rh_hand/z' });
  assert.deepEqual(end, { keep: null, silent: false, arrivedFrom: 'rh_elbow/x' });
  // a lost key-up: the walk ends keepMs after the last held step
  assert.equal(walkQuietStep(w.keep, { nowMs: 1200 + o.keepMs, gazeArea: 'q' }).silent, true);
  assert.equal(walkQuietStep(w.keep, { nowMs: 1201 + o.keepMs, gazeArea: 'q' }).arrivedFrom, 'rh_elbow/x');
  // a step still waiting, or a frame silent for another reason: the walk waits (the arrival would be lost)
  assert.equal(walkQuietStep(w.keep, { released: true, pending: true, nowMs: 1250 }).silent, true);
  assert.equal(walkQuietStep(w.keep, { released: true, blocked: true, nowMs: 1250 }).silent, true);
  // a walk that began on empty space tells null (any block is then new)
  const fromNone = walkQuietStep(null, { heldStep: true, nowMs: 0, gazeArea: null });
  assert.equal(walkQuietStep(fromNone.keep, { released: true, nowMs: 10 }).arrivedFrom, null);
  // off: as before
  assert.deepEqual(walkQuietStep(null, { heldStep: true, nowMs: 0 }, { on: false }), { keep: null, silent: false, arrivedFrom: undefined });
  assert.ok(o.keepMs > AREA_KEY_REPEAT_MS + 33 && o.keepMs > 400, 'longer than the repeat gate and a slow key repeat');
});

test('H18, second pass: held repeats a full queue drops while the steps wait keep the walk silent until the key comes up', () => {
  // the app's frame: drain the UI queue (walkUiEvent), then one walkQuietStep; a neck movement's swing holds the steps
  // (pending) and silences the gaze for 1.5 s while the key repeat keeps coming through the 270 ms gate
  const LIMIT = 2, queue = [];
  let keep = null, silentFrames = 0, arrivals = [];
  const frame = (t, events, { carry = false, run = false } = {}) => {
    let held = false, released = false;
    for (const ev of events) { const w = walkUiEvent(ev, queue.length, LIMIT); if (w.held) held = true; if (w.released) released = true; if (w.push) queue.push(ev); }
    if (run && !carry) queue.length = 0; // the waiting steps are done once the view is still
    const r = walkQuietStep(keep, { heldStep: held, released, pending: queue.length > 0, blocked: carry, nowMs: t, gazeArea: 'g' + t });
    keep = r.keep; if (r.silent) silentFrames++; if (r.arrivedFrom !== undefined) arrivals.push([t, r.arrivedFrom]);
    return r;
  };
  frame(0, [{ type: 'area', dir: 1 }]); // the first press (it lights the neck block; its movement swings the view)
  let t = 0;
  for (let k = 1; k <= 6; k++) { // six held repeats, 297 ms apart, during a 1.5 s carry: the queue is full after two
    for (; t < k * 297; t += 16) frame(t, [], { carry: t < 1500 });
    frame(t, [{ type: 'area', dir: 1, held: true }], { carry: t < 1500, run: t >= 1500 });
    t += 16;
  }
  assert.ok(queue.length <= LIMIT);
  for (; t < 2100; t += 16) assert.equal(frame(t, [], { run: true }).silent, true, `still held at ${t} ms: silent`);
  assert.deepEqual(arrivals, [], 'nothing switched on while the key is down');
  const end = frame(t, [{ type: 'areaUp' }], { run: true });
  assert.equal(end.silent, false);
  assert.equal(arrivals.length, 1, 'the block the walk stopped on is met once, at the key-up');
  // the rule itself: a held repeat counts whether or not the queue takes it
  assert.deepEqual(walkUiEvent({ type: 'area', dir: -1, held: true }, 2, 2), { push: false, held: true, released: false });
  assert.deepEqual(walkUiEvent({ type: 'area', dir: -1 }, 1, 2), { push: true, held: false, released: false });
  assert.deepEqual(walkUiEvent({ type: 'areaUp' }, 0, 2), { push: false, held: false, released: true });
  assert.deepEqual(walkUiEvent({ type: 'move', n: 1 }, 0, 2), { push: false, held: false, released: false });
});

test('H18, second pass: a held walk takes fewer than 4 steps a second at any key repeat rate', () => {
  assert.equal(AREA_KEY_REPEAT_MS, 270);
  for (const r of [16, 25, 33, 40, 50, 100]) assert.ok(1000 / (Math.ceil(AREA_KEY_REPEAT_MS / r) * r) < 4, `repeat every ${r} ms`);
});

test('the quiet tip measures its size once per content and window, not every frame (a forced layout)', () => {
  const doc = fakeDoc(), root = doc.createElement('div');
  const ui = createQuietUi({ doc, root });
  const tip = all(root, e => hasClass(e, 'ns-tip'))[0];
  let reads = 0;
  Object.defineProperty(tip, 'offsetWidth', { get() { reads++; return 180; } });
  Object.defineProperty(tip, 'offsetHeight', { get() { reads++; return 60; } });
  const model = key => ({ key, kind: 'area', title: 'Left hand', rows: [] });
  const avoid = { x0: 700, y0: 400, x1: 900, y1: 600 };
  for (let i = 0; i < 20; i++) ui.update({ tip: model('a'), x: 790 + i, y: 440, width: 1600, height: 900, avoid });
  assert.equal(reads, 2, 'one width and one height for twenty frames');
  ui.update({ tip: model('b'), x: 790, y: 440, width: 1600, height: 900, avoid });
  assert.equal(reads, 4, 'measured again for new content');
  ui.update({ tip: model('b'), x: 790, y: 440, width: 1280, height: 720, avoid });
  assert.equal(reads, 6, 'and for a new window size');
  ui.update({ tip: model('b'), x: 790, y: 440, width: 1280, height: 720 });
  assert.equal(reads, 6, 'not at all with nothing to avoid');
});

test('H18: the controls mark an auto-repeat step as held and queue a release when a held area key comes up', () => {
  const c = createControls();
  let s = c.initialState();
  s = c.areaKey(s, -1, 10); s = c.areaKey(s, -1, 300, { held: true }); s = c.areaKeyUp(s, 400);
  assert.deepEqual(c.drainUiEvents(s).map(e => ({ type: e.type, dir: e.dir, held: e.held })),
    [{ type: 'area', dir: -1, held: undefined }, { type: 'area', dir: -1, held: true }, { type: 'areaUp', dir: undefined, held: undefined }]);
  // through the DOM binding: a press, a repeat (past the 180 ms gate), the release
  const bucket = () => { const L = new Map(); return { addEventListener: (t, f) => { if (!L.has(t)) L.set(t, new Set()); L.get(t).add(f); }, removeEventListener: (t, f) => L.get(t)?.delete(f), emit: (t, x = {}) => { for (const f of [...(L.get(t) || [])]) f({ preventDefault() {}, ...x }); } }; };
  const view = bucket(), doc = bucket(), canvas = bucket();
  view.performance = { now: () => 5000 }; doc.defaultView = view; canvas.ownerDocument = doc; doc.pointerLockElement = canvas;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  let st = c.initialState();
  const unbind = bindDom(canvas, c, () => st, n => { st = n; }, {});
  try {
    view.emit('keydown', { target: canvas, code: 'ArrowLeft', repeat: false, timeStamp: 1000 });
    view.emit('keydown', { target: canvas, code: 'ArrowLeft', repeat: true, timeStamp: 1100 }); // inside the gate: dropped
    view.emit('keydown', { target: canvas, code: 'ArrowLeft', repeat: true, timeStamp: 1300 }); // past the 270 ms gate
    view.emit('keyup', { target: canvas, code: 'ArrowLeft', timeStamp: 1350 });
    view.emit('keyup', { target: canvas, code: 'ArrowLeft', timeStamp: 1360 }); // a stray second release: nothing
    assert.deepEqual(c.drainUiEvents(st).map(e => e.type + (e.held ? ':held' : '')), ['area', 'area:held', 'areaUp']);
  } finally { unbind(); }
});

test('H19: the canvas focus ring follows the last input: a pointer press hides it, a Tab brings it back, game keys do not', () => {
  assert.equal(focusRingInput(null, 'keydown', 'ArrowLeft'), null);
  assert.equal(focusRingInput(null, 'pointerdown'), 'pointer');
  assert.equal(focusRingInput('pointer', 'keydown', 'w'), 'pointer');
  assert.equal(focusRingInput('pointer', 'keydown', ' '), 'pointer');
  assert.equal(focusRingInput('pointer', 'keydown', 'Tab'), 'keys');
  assert.equal(focusRingInput('keys', 'mousedown'), 'pointer');
  // the binder sets and clears the root's attribute
  const L = new Map(), attrs = {};
  const win = { addEventListener: (t, f) => L.set(t, f), removeEventListener: t => L.delete(t),
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; } } } };
  const off = bindFocusRing(win);
  L.get('keydown')({ type: 'keydown', key: 'ArrowLeft' }); assert.equal(attrs[FOCUS_RING.attr], undefined);
  L.get('pointerdown')({ type: 'pointerdown' }); assert.equal(attrs[FOCUS_RING.attr], 'pointer');
  L.get('keydown')({ type: 'keydown', key: 'Tab' }); assert.equal(attrs[FOCUS_RING.attr], 'keys');
  off(); assert.equal(L.size, 0);
  assert.equal(typeof bindFocusRing(null), 'function');
});

test('H19: the stylesheet draws the canvas ring only while the pointer was not used last', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../scene/example/preview.css', import.meta.url), 'utf8');
  assert.match(css, /html:not\(\[data-ns-input="pointer"\]\) \.ns-canvas:focus-visible \{ outline: 2px solid #7cc4ff;/);
  assert.doesNotMatch(css.replace(/html:not\(\[data-ns-input="pointer"\]\) \.ns-canvas:focus-visible/, ''), /\.ns-canvas:focus-visible/);
});

test('H17: an area\'s strike starts from the light the block already shows; a muscle takes its colour at once', () => {
  const F = POWER_UP.areaStrikeFloor;
  assert.ok(F >= 0.5 && F < 1);
  // the first lit frame is 1 to 3 ms old: an area is at the floor or above, never near 0
  for (const a of [0, 0.001, 0.003, 0.016]) assert.ok(powerUpEnvelope(a, 0.5, { floor: F }).gain >= F - 1e-9, `area at ${a}`);
  // it only rises during the strike (no dip), and is the same as before once the strike is over
  let prev = 0;
  for (let a = 0; a <= POWER_UP.strikeS; a += 0.002) { const g = powerUpEnvelope(a, 0.5, { floor: F }).gain; assert.ok(g >= prev - 1e-9); prev = g; }
  for (const a of [0.06, 0.2, 0.5]) assert.equal(powerUpEnvelope(a, 0.5, { floor: F }).gain, powerUpEnvelope(a).gain);
  // reduced motion: from the floor up, slowly
  assert.equal(powerUpEnvelope(0, 0.5, { reduced: true, floor: F }).gain, F);
  assert.equal(powerUpEnvelope(1, 0.5, { reduced: true, floor: F }).gain, 1);
  // a muscle (no floor) still comes from nothing, but in its area's colour (albedo 1) from the first frame
  assert.ok(powerUpEnvelope(0.001).gain < 0.05);
  assert.equal(POWER_UP.strikeAlbedo, 1);
  assert.equal(powerUpEnvelope(0.001).albedo, 1);
  // the shaders: the area's patch carries the floor, the muscle's does not
  assert.match(powerUpGlsl('nsPowerUp', POWER_UP, { floor: F }), new RegExp(`float on = a < ${POWER_UP.strikeS.toFixed(6)} \\? ${F.toFixed(6)} \\+`));
  const vs = THREE.ShaderLib.physical.vertexShader, fs = THREE.ShaderLib.physical.fragmentShader;
  const area = patchPowerUpShaders(vs, fs, 'area'), muscle = patchPowerUpShaders(vs, fs, 'muscle');
  assert.ok(area && muscle);
  // (second pass) an area's floor is a uniform the scene sets at each new start: the floor under the look, else 0
  assert.ok(area.fragmentShader.includes('uniform float nsPuFloor;'));
  assert.ok(area.fragmentShader.includes('? nsPuFloor + ( 1.0 - nsPuFloor ) * a /'));
  assert.ok(area.fragmentShader.includes('return vec4( nsPuFloor + ( 1.0 - nsPuFloor ) * r,'));
  assert.ok(!muscle.fragmentShader.includes('nsPuFloor'));
  assert.ok(muscle.fragmentShader.includes(`? 0.0 + 1.0 * a /`) || muscle.fragmentShader.includes(`? 0.000000 + 1.000000 * a /`));
});

test('H25: no HDR boost of a muscle\'s flash: it peaks in its area\'s colour at the full level too', () => {
  assert.equal(HDR_BLOOM.muscleBoost, 0);
});

test('H21: a tried block has no gold frame; the words say "a shade darker" and nothing gold', () => {
  assert.equal(REGION_BORDER.activatedPx, 0);
  assert.ok(REGION_BORDER.hoverPx > 0, 'the look\'s own frame stays');
  const all = JSON.stringify(Object.fromEntries(Object.entries(TEXT).filter(([, v]) => v && typeof v === 'object')));
  assert.doesNotMatch(all, /gold (marks|edge)/i);
  assert.match(all, /A shade darker: used before/);
});

test('H23: the beams are held to a few screen pixels; one cone to your own body per movement', () => {
  assert.ok(LIGHT_BEAM.maxHalfPx > 0 && LIGHT_BEAM.maxHalfPx <= 4);
  assert.equal(LIGHT_BEAM.ownPerLink, 1);
  const fovY = 54, cssH = 900, k = 2 * Math.tan(fovY * Math.PI / 360) / cssH;
  // the old cone across the face blocks: 0.02 m at 2 m (about 17 px across) -> 4 px a side
  const hw = beamHalfCapM(0.02, 2, k);
  assert.ok(Math.abs(hw / (2 * k) - LIGHT_BEAM.maxHalfPx) < 1e-9);
  // a thin far beam is not widened
  assert.equal(beamHalfCapM(0.002, 6.7, k), 0.002);
  // no depth or no scale: unchanged
  assert.equal(beamHalfCapM(0.05, 0, k), 0.05);
  assert.equal(beamHalfCapM(0.05, 2, NaN), 0.05);
});

test('H20: the strip\'s bend has an exact inverse, so it can be applied per point without moving a block', () => {
  assert.equal(CREST_PER_POINT.on, true);
  let worst = 0;
  for (let i = 0; i <= 4000; i++) { const v = i / 4000 * 0.2; worst = Math.max(worst, Math.abs(crestStripV(crestStripS(v)) - v)); }
  assert.ok(worst < 1e-12, `round trip ${worst}`);
  for (let i = 0; i <= 400; i++) { const s = -0.01 + i / 2000; assert.ok(Math.abs(crestBendFull(crestStripV(s)) - s) < 1e-12); }
  // monotone
  let p = -1; for (let i = 0; i <= 4000; i++) { const s = i / 4000 * 0.2; const v = crestStripV(s); assert.ok(v >= p); p = v; }
  // above crestTop both are the identity; the medial wall's s 0 stays 0
  assert.equal(crestStripV(0.5), 0.5); assert.equal(crestStripS(0.5), 0.5); assert.equal(crestBendFull(crestStripV(0)), MEDIAL_TURN.sTop);
  // the old layout (no turn) as well
  const off = { ...MEDIAL_TURN, on: false };
  for (let i = 0; i <= 400; i++) { const v = i / 400 * 0.2; assert.ok(Math.abs(crestStripV(crestStripS(v, off), off) - v) < 1e-12); }
  // its GLSL: the same constants, pow only of a value held at or above 0
  const g = crestStripGlsl('nsCrest');
  assert.match(g, /float nsCrestV\( float s \)/); assert.match(g, /float nsCrestS\( float v \)/);
  assert.ok(g.includes(String(CREST_COMPRESS.crestTop)) && g.includes(String(MEDIAL_TURN.gamma)));
  for (const m of g.matchAll(/pow\( ([^,]+),/g)) assert.match(m[1], /^max\(/);
});

test('H20: the area shader interpolates v and bends it per fragment; borders and gaps read the bent value', () => {
  const p = patchRegionBorderShaders(THREE.ShaderLib.physical.vertexShader, THREE.ShaderLib.physical.fragmentShader);
  assert.ok(p);
  assert.ok(p.vertexShader.includes('vNsV = nsCrestV( nsS );') && p.vertexShader.includes('float nsCrestV( float s )'));
  assert.ok(p.fragmentShader.includes('float nsSq = nsCrestS( vNsV );') && p.fragmentShader.includes('float nsCrestS( float v )'));
  assert.ok(p.fragmentShader.includes('dFdx( nsSq )') && p.fragmentShader.includes('float nsSv = clamp( nsSq, 0.0, 1.0 );'));
  assert.ok(p.fragmentShader.includes('varying float vNsS;'), 'the varying the ink patch looks for is still declared');
});

test('H24: Low keeps multisampling and 2 x 2 outline ink; a software renderer still has none', () => {
  assert.equal(MSAA_AT_LOW.on, true);
  assert.equal(antialiasFor({ quality: 'low' }), true);
  assert.equal(antialiasFor({ quality: 'low' }, { on: false }), false);
  assert.equal(antialiasFor({ quality: 'auto', rendererName: 'Google SwiftShader' }), false);
  assert.equal(antialiasFor({ antialias: false, quality: 'high' }), false);
  assert.deepEqual([...OUTLINE_AA.ssByLevel], [2, 2, 2, 2, 2, 2]);
  assert.equal(outlineSsFactor(5, 960, 540), 2);
  assert.equal(outlineSsFactor(4, 1120, 630), 2);
});
