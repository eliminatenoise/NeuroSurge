/** Stepping the look along the motor strip with the arrow keys (user Messages 55 and 56: easier to use; a learning
 * tool for motor neuroanatomy). The motor areas are small and lie side by side, so the mouse alone needs a steady
 * hand; the left / right arrow keys put the look on the next area along the strip.
 * Pure parts are checked here: the order of the walk (ns-app areaChain: one hemisphere from its outer end up to the
 * crown, over the midline, down the other), which areas a step tries (areaStepCandidates), the key codes and the
 * request the controls queue (ns-controls AREA_CODES, areaKeyDir, areaKey), the search limits (AREA_STEP), and the
 * area the walk goes on from when the view was carried off it (areaWalkStep).
 * No scene, model, browser or native fixture; every time below is a supplied number. These cases establish the
 * walk's own bookkeeping only, never where the look lands on a drawn brain, key timing, learning outcomes or biology.
 * Run: node tests/area-step.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-app.mjs', import.meta.url);
const app = await import(target.href);
const NCtl = await import(new URL('../scene/src/ns-controls.mjs', import.meta.url).href);
const { BODY_MOTOR_MAP } = await import(new URL('../scene/src/ns-bodymap.mjs', import.meta.url).href);
const { areaChain, areaStepCandidates, AREA_STEP, areaWalkStep } = app;
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const REGIONS = BODY_MOTOR_MAP.regions;
const chain = areaChain(REGIONS);
const byId = new Map(REGIONS.map(r => [r.id, r]));

check('the walk holds every motor area once', () => {
  assert.equal(chain.length, REGIONS.length);
  assert.equal(new Set(chain).size, chain.length);
  for (const r of REGIONS) assert.ok(chain.includes(r.id), r.id);
  assert.ok(Object.isFrozen(chain));
});

check('the walk runs from one outer end up to the crown, over the midline, and down the other side', () => {
  const half = chain.length / 2;
  const first = chain.slice(0, half).map(id => byId.get(id)), second = chain.slice(half).map(id => byId.get(id));
  assert.ok(first.every(r => r.hemisphere === 'left'), 'the first half is one hemisphere');
  assert.ok(second.every(r => r.hemisphere === 'right'), 'the second half is the other');
  for (let i = 1; i < first.length; i++) assert.ok(first[i].order < first[i - 1].order, 'toward the crown: falling order');
  for (let i = 1; i < second.length; i++) assert.ok(second[i].order > second[i - 1].order, 'away from the crown: rising order');
  // The two toe areas (the innermost of each side) are neighbours across the midline.
  assert.equal(chain[half - 1], 'lh_toes');
  assert.equal(chain[half], 'rh_toes');
  assert.equal(byId.get(chain[0]).order, Math.max(...REGIONS.map(r => r.order)));
  assert.equal(byId.get(chain[chain.length - 1]).order, byId.get(chain[0]).order);
});

check('neighbours on the walk are neighbours on the strip: knee, ankle, toes, then the other side\'s toes', () => {
  const i = chain.indexOf('rh_knee');
  assert.deepEqual(chain.slice(i - 3, i + 1), ['lh_toes', 'rh_toes', 'rh_ankle', 'rh_knee']);
  const j = chain.indexOf('lh_knee');
  assert.deepEqual(chain.slice(j, j + 3), ['lh_knee', 'lh_ankle', 'lh_toes']);
});

check('a step tries the next area first, then the ones beyond it, to the end of the walk', () => {
  const i = chain.indexOf('rh_knee');
  const up = areaStepCandidates(chain, 'rh_knee', 1), down = areaStepCandidates(chain, 'rh_knee', -1);
  assert.deepEqual(up, chain.slice(i + 1));
  assert.deepEqual(down, chain.slice(0, i).reverse());
  assert.equal(up[0], 'rh_hip');
  assert.equal(down[0], 'rh_ankle');
  assert.equal(up.length + down.length, chain.length - 1);
});

check('at an end of the walk there is nothing further that way', () => {
  assert.deepEqual(areaStepCandidates(chain, chain[0], -1), []);
  assert.deepEqual(areaStepCandidates(chain, chain[chain.length - 1], 1), []);
  assert.equal(areaStepCandidates(chain, chain[0], 1).length, chain.length - 1);
});

check('an unknown area or a step that is not one area gives nothing', () => {
  assert.deepEqual(areaStepCandidates(chain, 'no_such_area', 1), []);
  assert.deepEqual(areaStepCandidates(chain, null, 1), []);
  for (const bad of [0, 2, -2, 0.5, NaN, '1', null, undefined]) assert.deepEqual(areaStepCandidates(chain, 'rh_knee', bad), [], String(bad));
  assert.deepEqual(areaStepCandidates(null, 'rh_knee', 1), []);
});

check('areas without a place on the strip are left out; the input is not changed', () => {
  const some = [{ id: 'b', hemisphere: 'right', order: 1 }, { id: 'a', hemisphere: 'left', order: 0 }, { id: 'c', hemisphere: 'left', order: 2 },
    { id: 'x', hemisphere: 'middle', order: 1 }, { id: 'y', hemisphere: 'left', order: NaN }, { hemisphere: 'left', order: 3 }, null];
  const copy = JSON.stringify(some);
  assert.deepEqual([...areaChain(some)], ['c', 'a', 'b']);
  assert.equal(JSON.stringify(some), copy);
  assert.deepEqual([...areaChain(null)], []);
  assert.deepEqual([...areaChain([])], []);
});

check('the area keys are the left and right arrows, and only those', () => {
  assert.deepEqual([...NCtl.AREA_CODES], ['ArrowLeft', 'ArrowRight']);
  assert.equal(NCtl.areaKeyDir('ArrowLeft'), -1);
  assert.equal(NCtl.areaKeyDir('ArrowRight'), 1);
  for (const other of ['ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'Space', 'Digit1', '', null, undefined]) assert.equal(NCtl.areaKeyDir(other), 0, String(other));
  for (const code of NCtl.AREA_CODES) {
    assert.ok(!NCtl.CONTROL_CODES.includes(code), 'an area key holds nothing down');
    assert.ok(!NCtl.MOVE_CODES.includes(code));
  }
  assert.ok(NCtl.AREA_KEY_REPEAT_MS >= 100 && NCtl.AREA_KEY_REPEAT_MS <= 400, 'a held key walks at a pace each area can be seen at');
});

check('an area key queues a request for the frame loop and changes nothing else', () => {
  const C = NCtl.createControls();
  const s0 = C.initialState ? C.initialState() : C.create ? C.create() : null;
  assert.ok(s0, 'the controls give a first state');
  assert.equal(typeof C.areaKey, 'function');
  const s1 = C.areaKey(s0, 1, 100);
  assert.notEqual(s1, s0);
  assert.equal(s1.yaw, s0.yaw);
  assert.equal(s1.pitch, s0.pitch);
  assert.deepEqual(s1.keys, s0.keys);
  const s2 = C.areaKey(s1, -1, 120);
  const queued = C.drainUiEvents(s2).filter(e => e && e.type === 'area');
  assert.deepEqual(queued.map(e => e.dir), [1, -1]);
  for (const bad of [0, 2, -2, 0.5, NaN, '1', null, undefined]) assert.equal(C.areaKey(s0, bad, 100), s0, String(bad));
});

check('the search limits are sane: a step is bounded work', () => {
  assert.ok(Object.isFrozen(AREA_STEP));
  assert.ok(AREA_STEP.doneRad > 0 && AREA_STEP.doneRad < 0.002, 'the look ends well inside an area');
  assert.ok(Number.isInteger(AREA_STEP.maxIter) && AREA_STEP.maxIter >= 4 && AREA_STEP.maxIter <= 32);
  assert.ok(Number.isInteger(AREA_STEP.looksPerArea) && AREA_STEP.looksPerArea >= 1);
  assert.ok(Number.isInteger(AREA_STEP.maxTests) && AREA_STEP.maxTests >= 100 && AREA_STEP.maxTests <= 5000);
  assert.ok(Number.isInteger(AREA_STEP.maxRays) && AREA_STEP.maxRays >= AREA_STEP.maxIter && AREA_STEP.maxRays <= 500);
  assert.ok(AREA_STEP.gainMin > 0 && AREA_STEP.gainMin < 1 && AREA_STEP.gainMax > 1);
});

check('the walk goes on from the area it was on while the player has not moved the look or clicked', () => {
  // Seen in the browser: a look resting on the trunk area takes its movement, the head carries the view onto brain
  // glass, and the next key press jumped to the throat area. The kept area is what the app hands the step as its start.
  const marks = { lookMs: 1000, buttonSeq: 4 };
  const landed = areaWalkStep(null, { steppedId: 'rh_trunk', ...marks });
  assert.deepEqual(landed, { id: 'rh_trunk', lookMs: 1000, buttonSeq: 4 });
  // The view is carried: the crosshair is on glass (no area), then on another area. The walk's area stays.
  assert.equal(areaWalkStep(landed, { gazeId: null, ...marks }), landed);
  assert.equal(areaWalkStep(landed, { gazeId: 'rh_throat', ...marks }), landed);
  assert.deepEqual(areaStepCandidates(chain, areaWalkStep(landed, { gazeId: 'rh_throat', ...marks }).id, 1)[0], 'rh_shoulder');
  // The player moves the look: the area under the look is the start again, or nothing (the step's own rule decides).
  assert.deepEqual(areaWalkStep(landed, { gazeId: 'rh_jaw', lookMs: 1016, buttonSeq: 4 }), { id: 'rh_jaw', lookMs: 1016, buttonSeq: 4 });
  assert.equal(areaWalkStep(landed, { gazeId: null, lookMs: 1016, buttonSeq: 4 }), null);
  // A click is the player's own choice too.
  assert.equal(areaWalkStep(landed, { gazeId: null, lookMs: 1000, buttonSeq: 5 }), null);
  // A look resting on an area with the mouse (no key) is kept the same way; the next key landing replaces it.
  const rested = areaWalkStep(null, { gazeId: 'rh_trunk', ...marks });
  assert.deepEqual(rested, landed);
  assert.deepEqual(areaWalkStep(rested, { steppedId: 'rh_shoulder', ...marks }), { id: 'rh_shoulder', lookMs: 1000, buttonSeq: 4 });
  // Nothing to keep, bad input.
  assert.equal(areaWalkStep(null, {}), null);
  assert.equal(areaWalkStep(undefined), null);
  assert.equal(areaWalkStep({ id: 7, lookMs: null, buttonSeq: null }, {}), null);
  assert.equal(areaWalkStep(null, { gazeId: '', steppedId: 3 }), null);
  // Before any look movement the controls' time is null on both sides: still "not moved".
  const first = areaWalkStep(null, { gazeId: 'rh_hip' });
  assert.equal(areaWalkStep(first, { gazeId: null }), first);
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'area-step',
  module: target.href,
  cases: results.length,
  failed: failed.length,
  results,
  scope: 'Pure checks of the arrow-key walk along the motor strip: the order of the areas (ns-app areaChain), which areas a step tries (areaStepCandidates), the key codes and the queued request (ns-controls AREA_CODES, areaKeyDir, areaKey), the search limits (AREA_STEP) and the area the walk goes on from (areaWalkStep). Not checked here: where the look lands on a drawn brain, which areas a view hides, key timing, whether this is easier to use, or any biology.'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
