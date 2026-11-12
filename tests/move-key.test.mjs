/** The number keys of the R558 controls (user Messages 55 and 56: easier to play; a learning tool): keys 1 to 9 ask for
 * the movement with that number in the list the information card shows for a motor area.
 * Pure parts are checked here: the controls reducer (a number key queues one interface request and nothing else), the
 * list itself (ns-app infoMoves: the map's own order, numbered from 1, at most nine, with the "shown now" and "already
 * there" marks), which movement the card explains (infoRegionAction, infoChosenStep), and the activity's own list of
 * movements that would move nothing now (ns-actions latchView().still) and of movements a press would only bring back
 * now (latchView().back for the body, armOpposedLatch for the game arm; the card's "first press brings it back"). No
 * scene, model, browser or native fixture; every time below is a supplied number. These cases establish queued records
 * and list contents only, never pixels, key timing or biology.
 * Run: node tests/move-key.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-controls.mjs', import.meta.url);
const mod = await import(target.href);
const { createControls, MOVE_CODES, moveKeyNumber, UI_QUEUE_LIMIT } = mod;
const app = await import(new URL('../scene/src/ns-app.mjs', import.meta.url).href);
const { BODY_MOTOR_MAP } = await import(new URL('../scene/src/ns-bodymap.mjs', import.meta.url).href);
const { createActivity, armOpposedLatch } = await import(new URL('../scene/src/ns-actions.mjs', import.meta.url).href);
const NT = await import(new URL('../scene/src/ns-text.mjs', import.meta.url).href);
const { infoMoves, infoActionBack, infoRegionAction, infoChosenStep, INFO_MOVES_MAX, KEYBOARD_PICTURE_ROWS } = app;
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const T0 = 1000;
const region = id => BODY_MOTOR_MAP.regions.find(r => r.id === id);

// The activity's own answer to "would this movement move anything now?" (latchView().still), on the default activity
// (every joint starts at 0 degrees). A number key sends the same 'muscle' event as below.
const stillCase = { ran: false, why: '', checks: [] };
try {
  const A = createActivity();
  let s = A.step(A.state, [], 2.5); // past the start instructions
  const still = () => A.latchView(s).still;
  const backNow = () => A.latchView(s).back;
  const press = (regionId, actionId) => { s = A.step(s, [{ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 }], 0.05); s = A.step(s, [], 1.6); };
  const start = still();
  stillCase.checks.push(['the list is an array of area/movement keys', Array.isArray(start) && start.every(k => typeof k === 'string' && k.includes('/'))]);
  stillCase.checks.push(['at the start the knee is straight: "straighten" moves nothing', start.includes('rh_knee/rh_knee_extend')]);
  stillCase.checks.push(['at the start the bend would move the knee', !start.includes('rh_knee/rh_knee_flex')]);
  stillCase.checks.push(['at the start no movement would only bring a part back', Array.isArray(backNow()) && backNow().length === 0]);
  press('rh_knee', 'rh_knee_flex');
  const bent = still();
  stillCase.checks.push(['after the bend, the bend moves nothing', bent.includes('rh_knee/rh_knee_flex')]);
  stillCase.checks.push(['after the bend, "straighten" would move the knee', !bent.includes('rh_knee/rh_knee_extend')]);
  stillCase.checks.push(['the other knee is not touched', bent.includes('lh_knee/lh_knee_extend') && !bent.includes('lh_knee/lh_knee_flex')]);
  stillCase.checks.push(['a knee only bends one way from straight: "straighten" is the movement itself, not a bring-back', backNow().length === 0]);
  press('rh_knee', 'rh_knee_extend');
  const back = still();
  stillCase.checks.push(['after straightening, the list is the start list again', JSON.stringify(back) === JSON.stringify(start)]);
  // A joint a movement merely wants at its start angle goes there with the movement, in one activation.
  press('rh_lips', 'rh_upper_lip_lift');
  press('rh_lips', 'rh_lip_purse');
  const pursed = A.latchView(s);
  stillCase.checks.push(['"Purse the lips" with the upper lip lifted lowers it and purses at once',
    pursed.still.includes('rh_lips/rh_lip_purse') && !pursed.joints.some(j => j.jointId === 'upper_lip') && pursed.joints.some(j => j.jointId === 'lip_purse' && j.goalDeg > 0)]);
  // A truly opposing movement first brings the joint back to its start angle; activated again, it goes to its own end.
  press('rh_trunk', 'rh_trunk_flex');
  stillCase.checks.push(['the trunk bends forward and stays', A.latchView(s).joints.some(j => j.jointId === 'trunk_flex' && j.goalDeg > 0)]);
  // The same rule, asked before the press: the list of movements a press would only bring back now (latchView().back).
  const bentTrunk = backNow();
  stillCase.checks.push(['with the trunk bent forward, "lean back" is listed as bring-back, from both halves of the brain',
    bentTrunk.includes('rh_trunk/rh_trunk_extend') && bentTrunk.includes('lh_trunk/lh_trunk_extend')]);
  stillCase.checks.push(['the movement that is already there is not a bring-back', !bentTrunk.includes('rh_trunk/rh_trunk_flex') && still().includes('rh_trunk/rh_trunk_flex')]);
  stillCase.checks.push(['no movement is both "already there" and bring-back', bentTrunk.every(k => !still().includes(k))]);
  stillCase.checks.push(['a movement of another joint is not a bring-back', !bentTrunk.includes('rh_trunk/rh_trunk_side') && !bentTrunk.some(k => k.startsWith('rh_knee/'))]);
  stillCase.backMoves = infoMoves(region('rh_trunk'), { still: still(), back: bentTrunk }).map(m => [m.id, m.atEnd, m.back]);
  press('rh_trunk', 'rh_trunk_extend');
  stillCase.checks.push(['the opposing movement first brings the trunk back', !A.latchView(s).joints.some(j => j.jointId === 'trunk_flex')]);
  stillCase.checks.push(['brought back, nothing of the trunk is a bring-back any more', !backNow().some(k => k.includes('_trunk/'))]);
  press('rh_trunk', 'rh_trunk_extend');
  stillCase.checks.push(['activated again, it arches the trunk back', A.latchView(s).joints.some(j => j.jointId === 'trunk_flex' && j.goalDeg < 0) && A.latchView(s).still.includes('rh_trunk/rh_trunk_extend')]);
  stillCase.checks.push(['arched back, "bend forward" is the bring-back', backNow().includes('rh_trunk/rh_trunk_flex') && !backNow().includes('rh_trunk/rh_trunk_extend')]);
  // The hip: the thigh lifts, and the swing down and back first brings it to where it started.
  press('rh_hip', 'rh_hip_flex');
  stillCase.checks.push(['with the left thigh lifted, the swing down and back is the bring-back', backNow().includes('rh_hip/rh_hip_extend') && !backNow().includes('lh_hip/lh_hip_extend')]);
  press('rh_hip', 'rh_hip_extend');
  stillCase.checks.push(['one press brings the thigh back', !A.latchView(s).joints.some(j => j.jointId === 'hip_flex_L') && !backNow().some(k => k.startsWith('rh_hip/'))]);
  press('rh_hip', 'rh_hip_extend');
  stillCase.checks.push(['the next press swings it down and back', A.latchView(s).joints.some(j => j.jointId === 'hip_flex_L' && j.goalDeg < 0) && backNow().includes('rh_hip/rh_hip_flex')]);
  // The game arm: a held grasp makes "open the hand" a bring-back (armOpposedLatch with the arm's own latches).
  stillCase.armBefore = armOpposedLatch('open_hand', s.armLatch);
  press('rh_hand', 'grasp_close');
  stillCase.armHeld = { open: armOpposedLatch('open_hand', s.armLatch), grasp: armOpposedLatch('grasp_close', s.armLatch), relax: armOpposedLatch('relax_release', s.armLatch) };
  stillCase.handMoves = infoMoves(region('rh_hand'), { leftArm: true, armState: s, still: still(), back: backNow() }).map(m => [m.id, m.atEnd, m.back]);
  press('rh_hand', 'open_hand');
  stillCase.armAfter = { open: armOpposedLatch('open_hand', s.armLatch), held: Object.keys(s.armLatch).filter(k => s.armLatch[k] > 0) };
  stillCase.ran = true;
} catch (error) { stillCase.why = String(error); }

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

check('the list marks the movement the card explains, and a movement already at its end', () => {
  const knee = region('rh_knee');
  const bend = knee.actions.find(a => a.id === 'rh_knee_flex');
  assert.ok(bend, 'the map has no knee bend');
  // `still` is the activity's own list (latchView().still) of the movements that would move nothing now.
  const moves = infoMoves(knee, { currentId: 'rh_knee_extend', still: ['rh_knee/rh_knee_flex', 'lh_knee/rh_knee_extend'] });
  assert.deepEqual(moves.filter(m => m.current).map(m => m.id), ['rh_knee_extend']);
  assert.deepEqual(moves.filter(m => m.atEnd).map(m => m.id), ['rh_knee_flex'], 'only the bend is at its end when the knee is bent');
  assert.deepEqual(infoMoves(knee, { still: 'rh_knee/rh_knee_flex' }).filter(m => m.atEnd), [], 'a list that is not an array marks nothing');
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

check('the activity itself says which movements would move nothing: the start posture, a bend, and back', async () => {
  // Filled in below (createActivity is asynchronous to load); see stillCase.
  assert.ok(stillCase.ran, `the activity check did not run: ${stillCase.why}`);
  for (const [name, ok] of stillCase.checks) assert.ok(ok, name);
});

check('the list marks a movement whose first press would only bring the part back', () => {
  assert.ok(stillCase.ran, `the activity check did not run: ${stillCase.why}`);
  // From the activity's own lists, with the trunk bent forward.
  assert.deepEqual(stillCase.backMoves, [['rh_trunk_flex', true, false], ['rh_trunk_extend', false, true], ['rh_trunk_side', false, false], ['rh_trunk_turn', false, false]]);
  const trunk = region('rh_trunk');
  assert.deepEqual(infoMoves(trunk).filter(m => m.back), [], 'a movement is marked without any list given');
  assert.deepEqual(infoMoves(trunk, { back: 'rh_trunk/rh_trunk_extend' }).filter(m => m.back), [], 'a list that is not an array marks nothing');
  assert.deepEqual(infoMoves(trunk, { back: ['lh_trunk/rh_trunk_extend', 'rh_knee/rh_trunk_extend'] }).filter(m => m.back), [], 'a key of another area marks nothing');
  // "already there" comes first: the two marks never stand on one line.
  const both = infoMoves(trunk, { still: ['rh_trunk/rh_trunk_extend'], back: ['rh_trunk/rh_trunk_extend'] }).find(m => m.id === 'rh_trunk_extend');
  assert.deepEqual([both.atEnd, both.back], [true, false]);
  for (const m of infoMoves(trunk, { back: ['rh_trunk/rh_trunk_extend'] })) assert.equal(typeof m.back, 'boolean', m.id);
});

check('the game arm: an opposing latch makes the movement a bring-back; straightening the elbow and the forearm turns never are', () => {
  assert.ok(stillCase.ran, `the activity check did not run: ${stillCase.why}`);
  assert.equal(stillCase.armBefore, null, 'nothing is held at the start');
  assert.deepEqual(stillCase.armHeld, { open: 'grasp_close', grasp: null, relax: null });
  assert.deepEqual(stillCase.handMoves.filter(m => m[2]).map(m => m[0]), ['open_hand'], 'only "open the hand" is a bring-back while the grasp is held');
  assert.ok(stillCase.handMoves.every(m => !(m[1] && m[2])), 'a hand movement is both "already there" and bring-back');
  assert.deepEqual(stillCase.armAfter, { open: null, held: [] }, 'the first press only lets the grasp go');
  // armOpposedLatch: the pairs both ways, and nothing for ids without an opposite.
  assert.equal(armOpposedLatch('elbow_extension', { elbow_flexion: 1 }), 'elbow_flexion');
  assert.equal(armOpposedLatch('elbow_flexion', { elbow_extension: 1 }), 'elbow_extension');
  assert.equal(armOpposedLatch('wrist_flexion', { wrist_extension: 1 }), 'wrist_extension');
  assert.equal(armOpposedLatch('wrist_flexion', { wrist_extension: 0, wrist_flexion: 1 }), null);
  for (const id of ['relax_release', 'wrist_radial_deviation', 'wrist_ulnar_deviation', 'pronation', 'no_such_id', '', null, undefined, 7]) {
    assert.equal(armOpposedLatch(id, { grasp_close: 1, wrist_flexion: 1, wrist_extension: 1, elbow_flexion: 1 }), null, `armOpposedLatch(${String(id)})`);
  }
  assert.equal(armOpposedLatch('open_hand', null), null);
  assert.equal(armOpposedLatch('open_hand', undefined), null);
  // infoActionBack: the card's question for one movement.
  const held = { armLatch: { grasp_close: 1, elbow_flexion: 1, wrist_flexion: 1 } };
  const arm = (id, armState = held) => infoActionBack({ id, armActionId: id }, { leftArm: true, armState });
  assert.equal(arm('open_hand'), true);
  assert.equal(arm('wrist_extension'), true);
  assert.equal(arm('grasp_close'), false, 'the held movement itself');
  assert.equal(arm('elbow_extension'), false, 'letting go of a held bend is the straightening');
  assert.equal(arm('pronation'), false);
  assert.equal(arm('supination'), false);
  assert.equal(arm('open_hand', null), false, 'no arm state given');
  assert.equal(arm('open_hand', {}), false, 'an arm state without latches');
  assert.equal(infoActionBack({ id: 'open_hand' }, { leftArm: true, armState: held }), true, 'the id stands in for a missing arm id');
  // A body movement is asked through the activity's list, by area and movement.
  assert.equal(infoActionBack({ id: 'rh_trunk_extend' }, { regionId: 'rh_trunk', back: ['rh_trunk/rh_trunk_extend'] }), true);
  assert.equal(infoActionBack({ id: 'rh_trunk_extend' }, { regionId: 'lh_trunk', back: ['rh_trunk/rh_trunk_extend'] }), false);
  assert.equal(infoActionBack({ id: 'rh_trunk_extend' }, { regionId: 'rh_trunk' }), false);
  for (const bad of [null, undefined, 'open_hand', 3]) assert.equal(infoActionBack(bad, { leftArm: true, armState: held }), false, `infoActionBack(${String(bad)})`);
});

check('the card and the status line say in plain words what a bring-back press does', () => {
  const trunk = region('rh_trunk');
  const lean = trunk.actions.find(a => a.id === 'rh_trunk_extend');
  const movementRow = card => card.rows.find(r => r[0] === 'Movement')[1];
  const plain = movementRow(NT.plainInfoCard({ region: trunk, action: lean, leftArm: false }));
  const back = movementRow(NT.plainInfoCard({ region: trunk, action: lean, leftArm: false, back: true }));
  assert.equal(back, plain + NT.INFO.bringsBack);
  assert.ok(!plain.includes(NT.INFO.bringsBack));
  // "already there" wins over bring-back on the card as it does in the list.
  const atEnd = movementRow(NT.plainInfoCard({ region: trunk, action: lean, leftArm: false, atEnd: true, back: true }));
  assert.ok(!atEnd.includes(NT.INFO.bringsBack), atEnd);
  assert.equal(typeof NT.INFO.moves.back, 'string');
  assert.ok(NT.INFO.moves.back.length > 0 && NT.INFO.moves.back !== NT.INFO.moves.atEnd && NT.INFO.moves.back !== NT.INFO.moves.current);
  for (const n of [1, 9]) {
    const backLine = NT.HUD.moveBack(n), stillLine = NT.HUD.moveStill(n);
    assert.ok(backLine.includes(`Key ${n}`) && backLine.includes(`Press ${n} again`), backLine);
    assert.ok(stillLine.includes(`Key ${n}`) && /already there/.test(stillLine), stillLine);
    assert.notEqual(backLine, stillLine);
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
  scope: 'Pure checks of the number-key request queue (ns-controls), of the numbered movement list and the movement the card explains (ns-app infoMoves, infoRegionAction, infoChosenStep over the shipped body map), of the activity\'s list of movements that would move nothing (ns-actions latchView().still, default activity), and of the movements a press would only bring back (latchView().back, armOpposedLatch, ns-app infoActionBack, and the words for it in ns-text). Not checked here: the drawn card, real key events, how long the status line stays, or that a request reaches the activity model (browser run).'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
