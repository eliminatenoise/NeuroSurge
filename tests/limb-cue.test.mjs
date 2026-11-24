// 25 November 2026 (DESIGN-DECISIONS section 213, LIMB_CUE): the places tried for the tutorial's ring on the chosen
// limb. Pure parts only: the list of places and the point of a limb for each. Where a press takes the limb is asked of
// the scene's own pick in the app (tests/browser-limb-ring.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { LIMB_CUE, limbCueRecipes, limbCuePoint } from '../scene/src/ns-app.mjs';

const path = { root: [0, 1, 0], bend: [0, 0.5, 0.2], frame: [0, 0, 0], end: [0, -0.1, 0] };

test('the hand or foot itself is tried first, then the limb from the wrist or ankle up, each place also 12 px to each side', () => {
  const R = limbCueRecipes();
  assert.equal(LIMB_CUE.on, true);
  assert.deepEqual(R[0], { end: true, s: 1, dx: 0, dy: 0 });
  assert.equal(R.length, 1 + LIMB_CUE.along.length * LIMB_CUE.offPx.length);
  assert.deepEqual(R[1], { end: false, s: 1, dx: 0, dy: 0 });
  const along = R.slice(1).map(r => r.s);
  for (let i = 1; i < along.length; i++) assert.ok(along[i] <= along[i - 1], 'from the far end toward the body');
  assert.ok(Math.min(...along) > 0.2, 'not the shoulder or hip itself: the trunk is drawn over it');
  assert.ok(R.every(r => Math.abs(r.dx) <= 12 && Math.abs(r.dy) <= 12));
  assert.ok(LIMB_CUE.ringPx >= 5 && LIMB_CUE.ringPx <= 8, 'about the ring\'s own half width');
});

test('a place along the limb lies on its two parts: lower from the bend to the wrist or ankle, upper from the root to the bend', () => {
  assert.deepEqual(limbCuePoint(path, { end: true }), [0, -0.1, 0]);
  assert.deepEqual(limbCuePoint(path, { end: false, s: 1 }), [0, 0, 0]);
  assert.deepEqual(limbCuePoint(path, { end: false, s: 0.5 }), [0, 0.5, 0.2]);
  assert.deepEqual(limbCuePoint(path, { end: false, s: 0 }), [0, 1, 0]);
  const q = limbCuePoint(path, { end: false, s: 0.75 });
  assert.ok(Math.abs(q[1] - 0.25) < 1e-12 && Math.abs(q[2] - 0.1) < 1e-12, 'half way down the lower part');
  const u = limbCuePoint(path, { end: false, s: 0.25 });
  assert.ok(Math.abs(u[1] - 0.75) < 1e-12 && Math.abs(u[2] - 0.1) < 1e-12, 'half way down the upper part');
});

test('without a bend point the limb is a straight line; without its points there is no place', () => {
  assert.deepEqual(limbCuePoint({ ...path, bend: null }, { end: false, s: 0.5 }), [0, 0.5, 0]);
  assert.deepEqual(limbCuePoint({ ...path, end: null }, { end: true }), [0, 0, 0], 'the wrist or ankle stands in for a missing end');
  assert.equal(limbCuePoint({ ...path, root: null }, { end: false, s: 0.5 }), null);
  assert.equal(limbCuePoint(null, { end: true }), null);
  assert.equal(limbCuePoint(path, null), null);
  assert.deepEqual(limbCuePoint(path, { end: false, s: 7 }), [0, 0, 0], 'a share past the end is the end');
});

// 25 November 2026 (section 213, GESTURES): the hand's part of a tutorial step, as a picture on the card
const { GESTURES } = await import('../scene/src/ns-guide-cues.mjs');
const { TUTORIAL_GOAL_IDS } = await import('../scene/src/ns-guide.mjs');
const fs = await import('node:fs');

test('every tutorial step done with the pointer has a hand picture, a step done with keys has none, and each picture is drawn', () => {
  assert.deepEqual(GESTURES, { lookStrip: 'point', pressArea: 'click', dragLimb: 'drag', dragBrain: 'carry', orbit: 'drag' });
  for (const id of Object.keys(GESTURES)) assert.ok(TUTORIAL_GOAL_IDS.includes(id), `${id} is a step of the tutorial`);
  for (const id of ['chooseLimb', 'moveHand', 'thirdPerson', 'readInfo']) assert.equal(GESTURES[id], undefined, `${id}: its key cards say it`);
  const css = fs.readFileSync(new URL('../scene/example/guide-cues.css', import.meta.url), 'utf8');
  for (const name of new Set(Object.values(GESTURES))) assert.ok(css.includes(`.ns-prompt[data-ns-gesture="${name}"] .ns-prompt-count::after{background-image:url("data:image/svg+xml,`), `guide-cues.css draws "${name}"`);
  assert.doesNotMatch(css.slice(css.indexOf('data-ns-gesture')), /[<>#]/, 'the pictures are written so that a style sheet can carry them');
});

// 25 November 2026 (section 214): the aim mark says what it is for while the tutorial's limb-key steps show
const { GUIDE } = await import('../scene/src/ns-text.mjs');
test('the shoulder and hip mark has teaching words for the tutorial, short enough for one line, and its help says what the look does', () => {
  assert.equal(GUIDE.cue.shoulderTeach, 'Look up or down: the arm follows');
  assert.equal(GUIDE.cue.hipTeach, 'Look up or down: the leg follows');
  for (const w of [GUIDE.cue.shoulderTeach, GUIDE.cue.hipTeach]) assert.ok(w.length <= 34, `${w.length} characters: one line of the mark's words (208 px at most)`);
  assert.match(GUIDE.cue.jointHelp, /when you look up or down, the chosen arm or leg rises or falls/);
  assert.equal(GUIDE.cue.shoulder, 'Shoulder aim');
  assert.equal(GUIDE.cue.hip, 'Hip aim');
});
