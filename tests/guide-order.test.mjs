/** The "Try this" guide's teaching order (user Messages 55 and 56: easier to use; a learning tool for motor
 * neuroanatomy): what the game teaches comes first (a left-arm area, its numbered movements, another body part,
 * watching a movement on the body), the hand, Space and arrow gestures after.
 * Pure parts are checked here (ns-guide over the shipped ns-text wording): the goal order with and without the build
 * features, the number-key event (ns-guide 'moveKey'), the two replacement lines, and that progress saved by an older
 * build still loads. No scene, model, browser or native fixture; every time below is a supplied number. These cases
 * establish the guide's own bookkeeping only, never pixels, key timing, learning outcomes or biology.
 * Run: node tests/guide-order.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-guide.mjs', import.meta.url);
const NG = await import(target.href);
const { GUIDE } = await import(new URL('../scene/src/ns-text.mjs', import.meta.url).href);
const app = await import(new URL('../scene/src/ns-app.mjs', import.meta.url).href);
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const ALL = NG.GUIDE_ALL_FEATURES;
const fresh = (features = ALL, done = []) => NG.createGuide({ now: 0, features, done });
const key = (n, moved, onBrain, t = 1) => ({ type: 'moveKey', n, moved, onBrain, t });
const armMoved = { type: 'armMoved', t: 1 };
const otherPart = { type: 'activate', isLeftArm: false, kind: 'region', regionId: 'rh_knee', moves: true, t: 1 };

check('teaching order: the areas and their numbered movements come before the hand gestures', () => {
  assert.deepEqual([...NG.GUIDE_ALL_GOAL_IDS], ['leftArmArea', 'numberKey', 'otherPart', 'watchBody', 'glow', 'moveHand',
    'flipPalm', 'fist', 'dragBrain', 'orbit', 'thirdPerson', 'mirror']);
  assert.deepEqual([...NG.GUIDE_GOAL_IDS], ['leftArmArea', 'otherPart', 'moveHand', 'flipPalm', 'fist', 'dragBrain', 'orbit']);
  assert.deepEqual(fresh().goals, [...NG.GUIDE_ALL_GOAL_IDS]);
  assert.deepEqual(fresh(null).goals, [...NG.GUIDE_GOAL_IDS]);
});

check('every goal and every replacement line has plain wording', () => {
  for (const id of NG.GUIDE_ALL_GOAL_IDS) assert.ok(typeof GUIDE.goals[id] === 'string' && GUIDE.goals[id].length > 10, id);
  for (const id of Object.keys(GUIDE.goals)) assert.ok(NG.GUIDE_ALL_GOAL_IDS.includes(id), `wording without a goal: ${id}`);
  for (const k of ['numberKeyStill', 'watchBodyLookDown']) assert.ok(typeof GUIDE.partial[k] === 'string' && GUIDE.partial[k].length > 10, k);
});

check('the number-key goals need the moveKeys feature (the card must draw its numbered list)', () => {
  const without = fresh({ glow: true, thirdPerson: true, mirror: true }).goals;
  assert.ok(!without.includes('numberKey') && !without.includes('watchBody'));
  assert.equal(without.length, NG.GUIDE_ALL_GOAL_IDS.length - 2);
  const only = fresh({ moveKeys: true }).goals;
  assert.deepEqual(only, ['leftArmArea', 'numberKey', 'otherPart', 'watchBody', 'moveHand', 'flipPalm', 'fist', 'dragBrain', 'orbit']);
  assert.equal(app.GUIDE_FEATURES.moveKeys, true);
});

check('a number key that moves something completes numberKey; the look on the brain leaves watchBody open', () => {
  let g = NG.guideStep(fresh(), [armMoved], 1);
  assert.equal(NG.currentGoal(g), 'numberKey');
  g = NG.guideStep(g, [key(2, true, true)], 2);
  assert.equal(g.done.numberKey, true);
  assert.equal(g.done.watchBody, false);
  assert.equal(NG.currentGoal(g), 'otherPart');
  const v = NG.guideView(g, 2.1);
  assert.equal(v.step, 3);
  assert.equal(v.total, 12);
  assert.equal(v.nice, true);
});

check('a number whose movement is already at its end completes nothing and asks for another number', () => {
  let g = NG.guideStep(fresh(), [armMoved], 1);
  const same = NG.guideStep(g, [key(1, false, true)], 2);
  assert.equal(same.done.numberKey, false);
  assert.equal(same.numberStill, true);
  assert.equal(NG.guideView(same, 5).text, GUIDE.partial.numberKeyStill);
  assert.equal(NG.guideStep(same, [key(1, false, true)], 3), same, 'a repeat changes nothing (same state object)');
  g = NG.guideStep(same, [key(2, true, true)], 4);
  assert.equal(g.done.numberKey, true);
  assert.equal(g.numberStill, false);
});

check('watchBody: a moving number with the look off the brain completes it; on the brain it asks for a look down', () => {
  let g = NG.guideStep(fresh(), [armMoved, key(1, true, true), otherPart], 1);
  assert.equal(NG.currentGoal(g), 'watchBody');
  assert.equal(NG.guideView(g, 9).text, GUIDE.goals.watchBody);
  g = NG.guideStep(g, [key(2, true, true)], 10);
  assert.equal(g.done.watchBody, false);
  assert.equal(g.watchOnBrain, true);
  assert.equal(NG.guideView(g, 20).text, GUIDE.partial.watchBodyLookDown);
  const still = NG.guideStep(g, [key(2, false, false)], 21);
  assert.equal(still.done.watchBody, false, 'a number that moves nothing never completes the goal');
  assert.equal(NG.guideView(still, 30).text, GUIDE.partial.numberKeyStill);
  g = NG.guideStep(still, [key(1, true, false)], 31);
  assert.equal(g.done.watchBody, true);
  assert.equal(g.numberStill, false);
  assert.equal(NG.currentGoal(g), 'glow');
});

check('goals complete in any order: a first number pressed while looking at the body completes both number goals', () => {
  const g = NG.guideStep(fresh(), [key(3, true, false)], 1);
  assert.equal(g.done.numberKey, true);
  assert.equal(g.done.watchBody, true);
  assert.equal(NG.currentGoal(g), 'leftArmArea');
  assert.equal(NG.guideView(g, 9).step, 1);
});

check('a number key means nothing to a guide without the number goals, and an unknown field is not a completion', () => {
  const g0 = fresh(null);
  const g = NG.guideStep(g0, [key(1, true, false)], 1);
  assert.deepEqual(g.goals, [...NG.GUIDE_GOAL_IDS]);
  assert.equal(NG.currentGoal(g), 'leftArmArea');
  assert.equal(NG.goalsDone(g), 0);
  const h = NG.guideStep(fresh(), [{ type: 'moveKey', n: 1, t: 1 }], 1);
  assert.equal(h.done.numberKey, true, 'moved is only false when the app says so');
  assert.equal(h.done.watchBody, false, 'onBrain must be false, not missing, to count as a look at the body');
});

check('progress saved by an older build loads: its goals stay done, only the new goals are asked', () => {
  const old = JSON.stringify({ v: 1, hidden: false, done: ['leftArmArea', 'moveHand', 'flipPalm', 'fist', 'otherPart', 'glow', 'dragBrain', 'orbit', 'thirdPerson', 'mirror'] });
  const g = NG.guideFromStorage(old, 100, { features: ALL });
  assert.equal(NG.currentGoal(g), 'numberKey');
  assert.equal(NG.goalsDone(g), 10);
  const v = NG.guideView(g, 100);
  assert.equal(v.visible, true);
  assert.equal(v.step, 2);
  const done = NG.guideStep(g, [key(1, true, false)], 101);
  assert.equal(NG.currentGoal(done), null);
  const back = NG.guideFromStorage(NG.guideToStorage(done), 200, { features: ALL });
  assert.equal(NG.currentGoal(back), null);
  assert.equal(back.done.numberKey && back.done.watchBody, true);
});

check('restart clears the number-key notes', () => {
  let g = NG.guideStep(fresh(), [armMoved, key(1, false, true)], 1);
  assert.equal(g.numberStill, true);
  g = NG.restartGuide(g, 5);
  assert.equal(g.numberStill, false);
  assert.equal(g.watchOnBrain, false);
  assert.equal(NG.currentGoal(g), 'leftArmArea');
  assert.deepEqual(g.goals, [...NG.GUIDE_ALL_GOAL_IDS]);
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'guide-order',
  module: target.href,
  cases: results.length,
  failed: failed.length,
  results,
  scope: 'Pure checks of the "Try this" guide bookkeeping (ns-guide) over the shipped wording (ns-text): goal order, the feature gate of the number-key goals, the number-key event, the two replacement lines and loading of older saved progress. Not checked here: what is drawn, real key timing, whether the lines teach well, or any biology.'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
