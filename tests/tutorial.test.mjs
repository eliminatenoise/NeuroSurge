/** The playable tutorial (19 November 2026; the owner: "there should be a playable tutorial to learn how to use the
 * game ... and to master the controls quickly"): ns-guide's nine strict steps (eight until the owner's limb keys of the
 * same day, which added the step that chooses a limb and moved W A S D up beside it), each one action, the skip, the count,
 * what is saved, and the prompt that shows it. Pure software checks on supplied events and times; no browser, and
 * nothing here says anything about learning outcomes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as NG from '../scene/src/ns-guide.mjs';
import { GUIDE } from '../scene/src/ns-text.mjs';
import { quietPromptText, quietPromptCount, createQuietUi } from '../scene/src/ns-quiet.mjs';
import { fakeDoc, all, hasClass } from './fake-doc.mjs';

// (25 November 2026, section 216: with the player camera the tutorial has a tenth step, the look that raises and lowers
// the chosen limb, `aimJoint`: a build without that camera has nine)
const F = { thirdPerson: true, jointAim: true };
const fresh = () => NG.createGuide({ now: 0, features: F, tutorial: true });
const EVENTS = {
  // 20 November 2026: the look's own switch-on of an area that moves something (no longer the bare look at an area)
  lookStrip: [{ type: 'activate', regionId: 'lh_knee', isLeftArm: false, kind: 'effector', moves: true, source: 'gaze' }],
  pressArea: [{ type: 'activate', regionId: 'lh_knee', isLeftArm: false, kind: 'effector', moves: true, source: 'click' }],
  chooseLimb: [{ type: 'limbChoice', n: 3 }],
  aimJoint: [{ type: 'jointAim', m: 0.05 }],
  dragLimb: [{ type: 'limbDrag', deg: 30 }],
  dragBrain: [{ type: 'grab', on: true }, { type: 'grab', on: false, dragRad: 0.3 }],
  orbit: [{ type: 'orbit' }],
  moveHand: [{ type: 'move', axis: 'x' }, { type: 'move', axis: 'z' }],
  thirdPerson: [{ type: 'view', mode: 'third', t: 10 }, { type: 'view', mode: 'first', t: 12 }],
  readInfo: [{ type: 'read' }]
};

test('the tutorial is ten steps in the order a newcomer needs them, each with one short line', () => {
  assert.deepEqual([...NG.TUTORIAL_GOAL_IDS], ['lookStrip', 'pressArea', 'chooseLimb', 'aimJoint', 'moveHand', 'dragLimb', 'dragBrain', 'orbit', 'thirdPerson', 'readInfo']);
  const g = fresh();
  assert.deepEqual(g.goals, [...NG.TUTORIAL_GOAL_IDS]);
  assert.equal(g.tutorial, true);
  assert.equal(g.strict, true);
  assert.equal(g.hidden, false, 'it starts by itself on a first visit');
  for (const id of NG.TUTORIAL_GOAL_IDS) {
    assert.ok(typeof GUIDE.short[id] === 'string' && GUIDE.short[id].length > 0 && GUIDE.short[id].length <= 48, `one short line for ${id}`);
    const full = (GUIDE.tutorialGoals && GUIDE.tutorialGoals[id]) || GUIDE.goals[id];
    assert.ok(typeof full === 'string' && full.length > 10, `full line for ${id}`);
  }
  // later on 19 November the owner took the numbered lists of an area's movements away and a look switches an area on
  // again: no line of the tutorial asks for "a number" of such a list. (Later still the keys 1 to 4 got their new
  // meaning, the choice of the limb: the one step that teaches it names those keys themselves.)
  for (const id of NG.TUTORIAL_GOAL_IDS) assert.doesNotMatch(GUIDE.short[id] + ' ' + ((GUIDE.tutorialGoals && GUIDE.tutorialGoals[id]) || GUIDE.goals[id]), /\b1 or 2\b|number/i, `${id} names no numbered movement`);
  assert.match(GUIDE.short.chooseLimb, /2, 3 or 4/);
  assert.match(GUIDE.goals.chooseLimb, /double click/i);
  assert.deepEqual([...NG.tutorialGoalIds({ jointAim: true })], NG.TUTORIAL_GOAL_IDS.filter(id => id !== 'thirdPerson'), 'a build without the outside view has no step for it');
  assert.deepEqual([...NG.tutorialGoalIds({ thirdPerson: true })], NG.TUTORIAL_GOAL_IDS.filter(id => id !== 'aimJoint'), 'a build without the player camera has no look step');
  assert.ok(NG.GUIDE_OPTIONS.jointAimMinM > 0.01 && NG.GUIDE_OPTIONS.jointAimMinM <= 0.05, 'the look step asks for a move one can see, a few centimetres');
});

test('each step is done by its own action, in order, and the count goes 1/10 ... 10/10', () => {
  let g = fresh(), t = 1;
  NG.TUTORIAL_GOAL_IDS.forEach((id, i) => {
    assert.equal(NG.currentGoal(g), id);
    const v = NG.guideView(g, t + 5);
    assert.equal(quietPromptCount(v), `${i + 1}/10`);
    assert.equal(v.goalId, id);
    assert.ok(quietPromptText({ ...v, nice: false }, GUIDE.short).length > 0);
    g = NG.guideStep(g, EVENTS[id], t += 3);
    assert.equal(g.done[id], true, `${id} is done by its action`);
  });
  assert.equal(NG.currentGoal(g), null);
  const end = NG.guideView(g, t + 1);
  assert.equal(end.finished, true);
  assert.equal(quietPromptCount(end), '', 'no count on the last line');
  assert.equal(quietPromptText(end, GUIDE.short), GUIDE.short.finished);
  assert.equal(NG.guideView(g, t + 60).visible, false, 'it stays quiet after the last step');
});

test('strict: an action of a later step does not jump the tutorial ahead; a nudge is not a drag; a look alone presses nothing', () => {
  let g = fresh();
  g = NG.guideStep(g, [...EVENTS.orbit, ...EVENTS.readInfo, ...EVENTS.moveHand, ...EVENTS.dragLimb], 1);
  assert.equal(NG.goalsDone(g), 0);
  assert.equal(NG.currentGoal(g), 'lookStrip');
  g = NG.guideStep(g, EVENTS.lookStrip, 2);
  assert.equal(NG.currentGoal(g), 'pressArea');
  g = NG.guideStep(g, EVENTS.lookStrip, 3);
  assert.equal(NG.currentGoal(g), 'pressArea', 'looking again does not press');
  g = NG.guideStep(g, [{ type: 'activate', regionId: 'lh_knee', isLeftArm: false, kind: 'effector', moves: true, source: 'gaze' }], 3.5);
  assert.equal(NG.currentGoal(g), 'pressArea', 'the pulse of a look is not a press');
  g = NG.guideStep(g, [{ type: 'activate', regionId: 'lh_scan_superior', isLeftArm: false, kind: 'integration', moves: false, source: 'click' }], 4);
  assert.equal(NG.currentGoal(g), 'pressArea', 'an area that moves nothing does not finish "watch it move"');
  g = NG.guideStep(g, [{ type: 'armMoved', ids: ['elbow_flexion'] }], 5);
  assert.equal(NG.currentGoal(g), 'pressArea', 'the left arm moving under a look is not a click');
  g = NG.guideStep(g, [{ type: 'activate', regionId: 'rh_elbow', isLeftArm: true, kind: 'effector', moves: true, awaitMove: true, source: 'click' }], 5.5);
  assert.equal(NG.currentGoal(g), 'chooseLimb', 'a click on a left-arm area finishes it');
  g = NG.guideStep(g, [{ type: 'limbChoice', n: 1 }], 5.6);
  assert.equal(NG.currentGoal(g), 'chooseLimb', 'choosing the left arm again, the limb the game starts on, is not choosing another limb');
  g = NG.guideStep(g, [{ type: 'limbChoice', n: 2 }], 5.7);
  assert.equal(NG.currentGoal(g), 'aimJoint');
  // (section 216: the look step: a move of the wrist or ankle under jointAimMinM is no move; seen from outside it is not counted)
  g = NG.guideStep(g, [...EVENTS.moveHand, { type: 'jointAim', m: NG.GUIDE_OPTIONS.jointAimMinM / 2 }], 5.72);
  assert.equal(NG.currentGoal(g), 'aimJoint', 'the keys do not do the look\'s step, nor does a move too small to see');
  g = NG.guideStep(g, EVENTS.aimJoint, 5.75);
  assert.equal(NG.currentGoal(g), 'moveHand');
  g = NG.guideStep(g, EVENTS.moveHand, 5.8);
  assert.equal(NG.currentGoal(g), 'dragLimb');
  g = NG.guideStep(g, [{ type: 'limbDrag', deg: 3 }], 6);
  assert.equal(NG.currentGoal(g), 'dragLimb', 'a nudge is not a drag');
  g = NG.guideStep(g, [{ type: 'limbDrag', deg: NG.GUIDE_OPTIONS.limbDragMinDeg }], 7);
  assert.equal(NG.currentGoal(g), 'dragBrain');
});

test('20 November 2026 (browser hunt): the first step waits for a look that really switches an area on and moves a part', () => {
  let g = fresh();
  // the crosshair crossing areas while Space holds the brain (looks are silent then: no switch-on, nothing moves)
  g = NG.guideStep(g, [{ type: 'look', regionId: 'rh_shoulder' }, { type: 'look', regionId: 'rh_tongue' }], 1);
  assert.equal(NG.currentGoal(g), 'lookStrip', 'the crosshair on an area is not a switch-on');
  g = NG.guideStep(g, [{ type: 'activate', regionId: 'lh_scan_superior', isLeftArm: false, kind: 'integration', moves: false, source: 'gaze' }], 2);
  assert.equal(NG.currentGoal(g), 'lookStrip', 'an area that moves nothing does not show "a part moves"');
  g = NG.guideStep(g, [{ type: 'activate', regionId: 'rh_elbow', isLeftArm: true, kind: 'effector', moves: false, awaitMove: true, source: 'gaze' }], 3);
  assert.equal(NG.currentGoal(g), 'lookStrip', 'a left-arm movement already held moves nothing');
  g = NG.guideStep(g, [{ type: 'activate', regionId: 'lh_knee', isLeftArm: false, kind: 'effector', moves: true, source: 'click' }], 4);
  assert.equal(NG.currentGoal(g), 'lookStrip', 'a click is not the look');
  g = NG.guideStep(g, [{ type: 'activate', regionId: 'rh_elbow', isLeftArm: true, kind: 'effector', moves: true, awaitMove: true, source: 'dwell' }], 5);
  assert.equal(NG.currentGoal(g), 'pressArea', 'the look that rested on a left-arm area switched it on');
  assert.equal(NG.goalsDone(g), 1, 'and the same switch-on presses nothing');
});

test('Enter skips the step that shows; the Esc page hides it, shows it and starts it again', () => {
  let g = fresh();
  g = NG.guideStep(g, [{ type: 'skip' }], 1);
  assert.equal(NG.currentGoal(g), 'pressArea');
  assert.equal(NG.guideView(g, 1.1).nice, false, 'a skipped step is not praised');
  assert.equal(NG.guideView(NG.guideStep(fresh(), EVENTS.lookStrip, 1), 1.1).nice, true, 'a step really done is');
  g = NG.guideStep(g, [{ type: 'skip' }, { type: 'skip' }], 2);
  assert.equal(NG.currentGoal(g), 'aimJoint');
  assert.equal(NG.guideView(g, 2.1).step, 4);
  const hidden = NG.hideGuide(g);
  assert.equal(NG.guideView(hidden, 3).visible, false);
  assert.equal(NG.guideView(NG.showGuide(hidden, 3), 3).visible, true);
  const again = NG.restartGuide(hidden, 4);
  assert.equal(again.tutorial, true);
  assert.equal(again.strict, true);
  assert.deepEqual(again.goals, [...NG.TUTORIAL_GOAL_IDS]);
  assert.equal(NG.goalsDone(again), 0);
  assert.equal(NG.guideView(again, 4).visible, true);
  let all8 = fresh();
  for (let i = 0; i < NG.TUTORIAL_GOAL_IDS.length; i++) all8 = NG.guideStep(all8, [{ type: 'skip' }], 10 + i);
  assert.equal(NG.currentGoal(all8), null);
  assert.equal(NG.guideStep(all8, [{ type: 'skip' }], 30), all8, 'nothing left to skip: nothing changes');
});

test('what the tutorial saves comes back; what the older guide saved starts the tutorial from its first step', () => {
  let g = fresh();
  g = NG.guideStep(g, [...EVENTS.lookStrip, ...EVENTS.pressArea], 1);
  const saved = JSON.stringify(NG.guideToStorage(g));
  assert.deepEqual(JSON.parse(saved), { v: 2, tutorial: true, hidden: false, done: ['lookStrip', 'pressArea'] });
  const back = NG.guideFromStorage(saved, 5, { features: F, tutorial: true });
  assert.equal(NG.currentGoal(back), 'chooseLimb');
  const old = JSON.stringify({ v: 1, hidden: true, done: ['leftArmArea', 'numberKey', 'otherPart', 'watchBody', 'glow', 'moveHand', 'flipPalm', 'fist', 'dragBrain', 'orbit', 'thirdPerson', 'mirror'] });
  const fromOld = NG.guideFromStorage(old, 5, { features: F, tutorial: true });
  assert.equal(NG.currentGoal(fromOld), 'lookStrip');
  assert.equal(fromOld.hidden, false);
  assert.equal(NG.goalsDone(fromOld), 0);
  assert.equal(NG.currentGoal(NG.guideFromStorage('not json', 5, { features: F, tutorial: true })), 'lookStrip');
  const done = NG.guideFromStorage(JSON.stringify({ v: 2, tutorial: true, hidden: false, done: [...NG.TUTORIAL_GOAL_IDS] }), 9, { features: F, tutorial: true });
  assert.equal(NG.guideView(done, 9).visible, false, 'a finished tutorial does not come back on the next visit');
  // the older guide still loads what it saved (other callers)
  assert.equal(NG.currentGoal(NG.guideFromStorage(old, 5, { features: NG.GUIDE_ALL_FEATURES })), null);
});

test('the prompt is three chunks: the count, the one line, how to skip', () => {
  const doc = fakeDoc(), root = doc.createElement('div');
  const ui = createQuietUi({ doc, root });
  ui.update({ prompt: 'Look at a coloured area on the brain', count: '1/8', skip: GUIDE.short.skip, width: 1600, height: 900 });
  const prompt = all(root, e => hasClass(e, 'ns-prompt'))[0];
  assert.equal(prompt.hidden, false);
  assert.deepEqual(prompt.children.map(c => c.className), ['ns-prompt-count', 'ns-prompt-words', 'ns-prompt-skip']);
  assert.deepEqual(prompt.children.map(c => c.textContent), ['1/8', 'Look at a coloured area on the brain', 'Enter: skip']);
  ui.update({ prompt: GUIDE.short.finished, count: '', skip: '', width: 1600, height: 900 });
  assert.deepEqual(prompt.children.map(c => c.hidden), [true, false, true]);
  ui.update({ prompt: '', count: '3/8', skip: 'Enter: skip', width: 1600, height: 900 });
  assert.equal(prompt.hidden, true, 'no line: no pill, whatever else is passed');
});

// 21 November 2026 (browser hunt of update 62, H8): restated. Audit S14 had the left wrist's two side bends, which moved
// nothing on the game arm, count as moving nothing; the game arm's wrist bends sideways now (ns-rig wrist_dev).
test('audit S14, restated (H8): the left wrist\'s two side bends move the game arm and count as moving it', () => {
  assert.equal(NG.armActionMoves('wrist_radial_deviation', { armLatch: {} }), true);
  assert.equal(NG.armActionMoves('wrist_ulnar_deviation'), true);
  assert.equal(NG.armActionMoves('wrist_flexion', { armLatch: {} }), true);
  assert.deepEqual(NG.ARM_ACTIONS_MOVE_NOTHING, []);
});
