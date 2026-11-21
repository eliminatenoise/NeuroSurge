/** The number keys of the R558 controls (user Messages 55 and 56: easier to play; a learning tool): keys 1 to 9 ask for
 * the movement with that number in the list the information card shows for a motor area.
 * Pure parts are checked here: the controls reducer (a number key queues one interface request and nothing else), the
 * list itself (ns-app infoMoves: the map's own order, numbered from 1, at most nine, with the "shown now" and "already
 * there" marks), which movement the card explains (infoRegionAction, infoChosenStep), and the activity's own answer to
 * "does this press move anything?".
 * 20 November 2026 (the owner, Message 206: "I think it's better actually if there are no permanent movements ... when
 * you tap any area of the brain, you activate any area, it will contract, then return to its previous place. But in
 * returning to its previous place, you won't see corresponding activity and muscle activation. It will just return."):
 * the cases that pinned the latch are restated. Nothing is held, so a body movement is never "already there" (it was:
 * ns-actions latchView().still) and no press only brings a part back (it was: latchView().back, armOpposedLatch,
 * ns-app infoActionBack and the card's "first press brings it back"); those are gone, and the cases below say so.
 * No scene, model, browser or native fixture; every time below is a supplied number. These cases establish queued
 * records and list contents only, never pixels, key timing or biology.
 * Run: node tests/move-key.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-controls.mjs', import.meta.url);
const mod = await import(target.href);
const { createControls, MOVE_CODES, moveKeyNumber, UI_QUEUE_LIMIT } = mod;
const app = await import(new URL('../scene/src/ns-app.mjs', import.meta.url).href);
const { BODY_MOTOR_MAP } = await import(new URL('../scene/src/ns-bodymap.mjs', import.meta.url).href);
const Act = await import(new URL('../scene/src/ns-actions.mjs', import.meta.url).href);
const { createActivity, JOINT_LATCH } = Act;
const NT = await import(new URL('../scene/src/ns-text.mjs', import.meta.url).href);
const { infoMoves, infoRegionAction, infoChosenStep, INFO_MOVES_MAX, KEYBOARD_PICTURE_ROWS } = app;
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const T0 = 1000;
const region = id => BODY_MOTOR_MAP.regions.find(r => r.id === id);

// The activity's own answer, on the default activity (every joint starts at 0 degrees) and under reduced motion. A
// number key sends the same 'muscle' event as below.
const moveCase = { ran: false, why: '', checks: [] };
try {
  for (const [name, opts] of [['the jerk', {}], ['reduced motion', { jointSpring: JOINT_LATCH.reducedMotion, armPoseTau: JOINT_LATCH.reducedArmPoseTau }]]) {
    const A = createActivity(opts);
    let s = A.step(A.state, [], 2.5); // past the start instructions
    const H = 1 / 60;
    /** press, then follow `joint` for 2.5 s: its furthest swing from where it was, and where it ends */
    const press = (regionId, actionId, joint) => {
      const from = s.bodyPos[joint]; let far = 0;
      s = A.step(s, [{ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 }], H);
      for (let i = 0; i < 150; i++) { s = A.step(s, [], H); far = Math.max(far, Math.abs(s.bodyPos[joint] - from)); }
      return { far, back: Math.abs(s.bodyPos[joint] - from) < 1e-6 };
    };
    const kneeBend = press('rh_knee', 'rh_knee_flex', 'knee_ext_L');
    moveCase.checks.push([`${name}: the bend moves the knee and it comes back`, kneeBend.far > 100 && kneeBend.back]);
    const kneeBend2 = press('rh_knee', 'rh_knee_flex', 'knee_ext_L');
    moveCase.checks.push([`${name}: pressed again, it moves again (never "already there")`, kneeBend2.far > 100 && kneeBend2.back]);
    const trunk = press('rh_trunk', 'rh_trunk_flex', 'trunk_flex');
    const lean = press('rh_trunk', 'rh_trunk_extend', 'trunk_flex');
    moveCase.checks.push([`${name}: bending forward, then "lean back" leans back on its first press (no bring-back press)`, trunk.far > 20 && lean.far > 10 && lean.back]);
    const view = A.motionView(s);
    moveCase.checks.push([`${name}: afterwards nothing is contracting or on its way back`, view.contracting.length === 0 && view.returning.length === 0 && view.lit === null]);
    moveCase.checks.push([`${name}: the activity has no latch view any more`, typeof A.latchView === 'undefined']);
  }
  // the game arm: the opposite movement sends a hand contraction under way into its return (relax_release is not on the
  // strip: it is the grip's own release)
  {
    const A = createActivity();
    let s = A.step(A.state, [], 2.5);
    s = A.step(s, [{ type: 'muscle', regionId: 'rh_hand', actionId: 'grasp_close', regionOnly: false, at: 0 }], 0.05);
    moveCase.armGrasp = s.armJerk.grasp_close ? s.armJerk.grasp_close[0] > 0 : false;
    const opened = A.step(s, [{ type: 'muscle', regionId: 'rh_hand', actionId: 'open_hand', regionOnly: false, at: 0 }], 0.01);
    moveCase.armOpened = { grasp: opened.armJerk.grasp_close ? opened.armJerk.grasp_close[0] : null, open: opened.armJerk.open_hand ? opened.armJerk.open_hand[0] > 0 : false };
    moveCase.handMoves = infoMoves(region('rh_hand'), { leftArm: true, armState: { armJerk: s.armJerk, elbowRad: 0.5 } }).map(m => [m.id, m.atEnd, m.back]);
  }
  moveCase.ran = true;
} catch (error) { moveCase.why = String(error); }

check('the number keys are the nine digit keys, in order', () => {
  assert.deepEqual([...MOVE_CODES], ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']);
  assert.equal(INFO_MOVES_MAX, MOVE_CODES.length, 'a card can list more movements than there are number keys');
});

check('moveKeyNumber: the digit row and the number pad give 1 to 9; everything else gives 0', () => {
  for (let n = 1; n <= 9; n++) {
    assert.equal(moveKeyNumber(`Digit${n}`), n);
    assert.equal(moveKeyNumber(`Numpad${n}`), n);
  }
  for (const other of ['Digit0', 'Numpad0', 'Digit10', 'KeyW', 'Space', 'F1', 'digit1', '', '1', 1, null, undefined, {}]) {
    assert.equal(moveKeyNumber(other), 0, `moveKeyNumber(${JSON.stringify(other)})`);
  }
});

check('a number key queues exactly one interface request and touches nothing else', () => {
  const api = createControls();
  const before = api.initialState();
  const after = api.moveKey(before, 3, T0);
  assert.notEqual(after, before);
  assert.deepEqual(after.ui, [{ type: 'move', n: 3, timeMs: T0 }]);
  assert.deepEqual(after.events, [], 'a number key queued a game record');
  assert.deepEqual(after.keys, before.keys, 'a number key changed the held keys');
  assert.deepEqual(before.ui, [], 'the earlier state was changed');
});

check('requests are read once, in the order pressed', () => {
  const api = createControls();
  let s = api.initialState();
  s = api.moveKey(s, 2, T0);
  s = api.moveKey(s, 9, T0 + 10);
  s = api.moveKey(s, 1, T0 + 20);
  assert.deepEqual(api.drainUiEvents(s).map(e => [e.type, e.n, e.timeMs]), [['move', 2, T0], ['move', 9, T0 + 10], ['move', 1, T0 + 20]]);
  assert.deepEqual(api.drainUiEvents(s), [], 'a request was read twice');
});

check('a number outside 1 to 9 is refused: the same state comes back', () => {
  const api = createControls();
  const s = api.initialState();
  for (const bad of [0, 10, -1, 1.5, NaN, Infinity, '2', null, undefined]) {
    assert.equal(api.moveKey(s, bad, T0), s, `moveKey(${String(bad)})`);
  }
  assert.deepEqual(s.ui, []);
});

check('the request queue stays bounded however many keys are pressed', () => {
  const api = createControls();
  let s = api.initialState();
  for (let i = 0; i < UI_QUEUE_LIMIT * 3; i++) s = api.moveKey(s, (i % 9) + 1, T0 + i);
  assert.ok(s.ui.length <= UI_QUEUE_LIMIT, `the queue grew to ${s.ui.length}`);
  assert.deepEqual(s.events, []);
});

check('the list of an area: the map\'s own order, numbered from 1, plain labels', () => {
  const knee = region('rh_knee');
  assert.ok(knee, 'the map has no left knee area');
  const moves = infoMoves(knee);
  assert.deepEqual(moves.map(m => [m.n, m.id]), knee.actions.map((a, i) => [i + 1, a.id]));
  for (const m of moves) {
    assert.ok(typeof m.label === 'string' && m.label.length > 0 && m.label !== m.id, `movement ${m.id} has no plain label`);
    assert.equal(m.current, false);
    assert.equal(m.atEnd, false, 'a movement is "already there" without any joint state given');
  }
});

check('the list marks the movement the card explains; a body movement is never "already there" (Message 206)', () => {
  const knee = region('rh_knee');
  const bend = knee.actions.find(a => a.id === 'rh_knee_flex');
  assert.ok(bend, 'the map has no knee bend');
  const moves = infoMoves(knee, { currentId: 'rh_knee_extend' });
  assert.deepEqual(moves.filter(m => m.current).map(m => m.id), ['rh_knee_extend']);
  assert.deepEqual(moves.filter(m => m.atEnd), [], 'every body movement moves on a press');
  // (the old `still` list of the latch is no longer read: passing one marks nothing)
  assert.deepEqual(infoMoves(knee, { still: ['rh_knee/rh_knee_flex'] }).filter(m => m.atEnd), []);
  // a left-arm movement is "already there" only where the game arm cannot move: the elbow straight (21 November 2026,
  // hunt H8: the sideways wrist bends move the game arm's hand now, ns-rig wrist_dev, so they are never "already there")
  const elbow = region('rh_elbow'), wrist = region('rh_wrist');
  assert.deepEqual(infoMoves(elbow, { leftArm: true, armState: { armJerk: {}, elbowRad: 0.01 } }).filter(m => m.atEnd).map(m => m.id), ['elbow_extension']);
  assert.deepEqual(infoMoves(elbow, { leftArm: true, armState: { armJerk: {}, elbowRad: 0.6 } }).filter(m => m.atEnd), []);
  assert.deepEqual(infoMoves(wrist, { leftArm: true, armState: { armJerk: {} } }).filter(m => m.atEnd).map(m => m.id).sort(), []);
});

check('the card explains: a running movement of the area, else the one chosen by number, else the one looked at', () => {
  const lips = region('rh_lips');
  assert.ok(lips && lips.actions.length >= 3, 'the map has no lips area with three movements');
  const [a0, a1, a2] = lips.actions;
  const pick = o => infoRegionAction(lips, o).id;
  assert.equal(pick({}), a0.id, 'nothing given: the first movement');
  assert.equal(pick({ actionId: a1.id }), a1.id, 'the movement looked at');
  assert.equal(pick({ actionId: a1.id, chosenId: a2.id }), a2.id, 'the movement chosen by number comes before the one looked at');
  assert.equal(pick({ actionId: a1.id, chosenId: a2.id, pulse: { regionId: lips.id, actionId: a0.id } }), a0.id, 'a running movement comes first');
  assert.equal(pick({ actionId: a1.id, chosenId: 'no_such_movement' }), a1.id, 'an unknown chosen movement is ignored');
  assert.equal(pick({ chosenId: a2.id, pulse: { regionId: 'rh_knee', actionId: 'rh_knee_flex' } }), a2.id, 'a movement running in another area changes nothing');
});

check('a movement chosen by number stays on the card until the look moves or another movement of the area runs', () => {
  const chosen = { regionId: 'rh_knee', actionId: 'rh_knee_extend', gazePick: undefined };
  const onBend = { target: 'region', regionId: 'rh_knee', actionId: null, regionActionId: 'rh_knee_flex' };
  const first = infoChosenStep(chosen, { gaze: onBend });
  assert.deepEqual(first, { regionId: 'rh_knee', actionId: 'rh_knee_extend', gazePick: 'rh_knee/rh_knee_flex' }, 'the first frame records where the look was');
  assert.equal(infoChosenStep(first, { gaze: onBend }), first, 'an unchanged look keeps the same record');
  assert.equal(infoChosenStep(first, { gaze: { ...onBend, regionActionId: 'rh_knee_extend' } }), null, 'the look moved to another movement');
  assert.equal(infoChosenStep(first, { gaze: { ...onBend, regionId: 'rh_hip' } }), null, 'the look moved to another area');
  assert.equal(infoChosenStep(first, { gaze: { target: 'mirror' } }), null, 'the look left the strip');
  assert.equal(infoChosenStep(first, { gaze: onBend, pulse: { regionId: 'rh_knee', actionId: 'rh_knee_flex' } }), null, 'another movement of the area was switched on');
  assert.equal(infoChosenStep(first, { gaze: onBend, pulse: { regionId: 'rh_knee', actionId: 'rh_knee_extend' } }), first, 'its own pulse keeps it');
  assert.equal(infoChosenStep(first, { gaze: onBend, pulse: { regionId: 'rh_hip', actionId: 'rh_hip_flex' } }), first, 'a movement of another area keeps it');
  // Chosen while looking away from the strip (the list of the area looked at last): kept while the look stays off it.
  const away = infoChosenStep(chosen, { gaze: { target: 'mirror' } });
  assert.deepEqual(away, { regionId: 'rh_knee', actionId: 'rh_knee_extend', gazePick: null });
  assert.equal(infoChosenStep(away, { gaze: { target: 'empty' } }), away);
  assert.equal(infoChosenStep(away, { gaze: onBend }), null, 'the look came back to the strip');
  for (const bad of [null, undefined, {}, { regionId: 'rh_knee' }, { actionId: 'x' }, 'rh_knee']) {
    assert.equal(infoChosenStep(bad, { gaze: onBend }), null, `infoChosenStep(${JSON.stringify(bad)})`);
  }
});

check('the activity itself: every press moves, contracts and returns, also under reduced motion', () => {
  assert.ok(moveCase.ran, `the activity check did not run: ${moveCase.why}`);
  for (const [name, ok] of moveCase.checks) assert.ok(ok, name);
});

check('no movement is marked as a press that only brings the part back (the stage rule is gone with the latch)', () => {
  assert.ok(moveCase.ran, `the activity check did not run: ${moveCase.why}`);
  for (const r of BODY_MOTOR_MAP.regions) for (const m of infoMoves(r, { leftArm: r.isLeftArm === true, back: ['rh_trunk/rh_trunk_extend'] })) assert.equal(m.back, undefined, `${r.id}/${m.id}`);
  assert.equal(app.infoActionBack, undefined, 'ns-app has no bring-back question any more');
  assert.equal(Act.armOpposedLatch, undefined, 'ns-actions has no arm latch any more');
});

check('the game arm: the opposite movement sends a contraction under way into its return', () => {
  assert.ok(moveCase.ran, `the activity check did not run: ${moveCase.why}`);
  assert.equal(moveCase.armGrasp, true, 'the grasp contracts');
  assert.deepEqual(moveCase.armOpened, { grasp: 0, open: true }, 'opening the hand sends the grasp back and opens it');
  assert.deepEqual(moveCase.handMoves.filter(m => m[1] || m[2]), [], 'no hand movement is "already there" or a bring-back');
});

check('the card and the status line have no bring-back words any more; "already there" stays for what cannot move', () => {
  const trunk = region('rh_trunk');
  const lean = trunk.actions.find(a => a.id === 'rh_trunk_extend');
  const movementRow = card => card.rows.find(r => r[0] === 'Movement')[1];
  const plain = movementRow(NT.plainInfoCard({ region: trunk, action: lean, leftArm: false }));
  assert.equal(movementRow(NT.plainInfoCard({ region: trunk, action: lean, leftArm: false, back: true })), plain, 'a `back` flag changes nothing');
  assert.equal(movementRow(NT.plainInfoCard({ region: trunk, action: lean, leftArm: false, atEnd: true })), plain + NT.INFO.alreadyThere);
  assert.equal(NT.INFO.bringsBack, undefined);
  assert.equal(NT.INFO.moves.back, undefined);
  assert.equal(NT.HUD.moveBack, undefined);
  assert.equal(NT.HUD.headMovedKey, undefined);
  for (const n of [1, 9]) {
    const stillLine = NT.HUD.moveStill(n);
    assert.ok(stillLine.includes(`Key ${n}`) && /already there/.test(stillLine), stillLine);
  }
});

check('every area of the map fits the nine number keys, and an area that moves nothing has no list', () => {
  let listed = 0;
  for (const r of BODY_MOTOR_MAP.regions) {
    const moves = infoMoves(r, { leftArm: r.isLeftArm === true });
    assert.equal(moves.length, r.actions.length, `area ${r.id} has more movements than number keys`);
    assert.deepEqual(moves.map(m => m.n), moves.map((_, i) => i + 1));
    assert.equal(new Set(moves.map(m => m.id)).size, moves.length, `area ${r.id} lists a movement twice`);
    listed += moves.length;
  }
  assert.ok(listed > 0);
  assert.deepEqual(infoMoves(null), []);
  assert.deepEqual(infoMoves({ id: 'x', actions: [] }), []);
});

check('the keyboard picture shows the number row with the same nine keys', () => {
  const num = KEYBOARD_PICTURE_ROWS.find(r => r.row === 'num');
  assert.ok(num, 'the keyboard picture has no number row');
  assert.deepEqual([...num.keys], [...MOVE_CODES]);
  const noted = KEYBOARD_PICTURE_ROWS.filter(r => typeof r.note === 'string');
  assert.deepEqual(noted.map(r => [r.row, r.note]), [['esc', 'numWords']], 'the words of the number keys are written once, beside Esc');
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'move-key',
  module: target.href,
  cases: results.length,
  failed: failed.length,
  results,
  scope: 'Pure checks of the number-key request queue (ns-controls), of the numbered movement list and the movement the card explains (ns-app infoMoves, infoRegionAction, infoChosenStep over the shipped body map), and of the activity\'s own answer since Message 206 (every press contracts and returns; no "already there" for a body movement, no bring-back press, no bring-back words). Not checked here: the drawn card, real key events, how long the status line stays, or that a request reaches the activity model (browser run).'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
