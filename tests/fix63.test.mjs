/** The faults a review and a browser hunt found in Body update 63 (21 November 2026, evening; DESIGN-DECISIONS section
 * 194). Pure rules of the game's controls and words checked here; the finding about the keys' turn of the right upper arm
 * (C1) is checked on the game's own body in tests/limb-hold.test.mjs. Nothing here is measured on anyone. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const appSource = readFileSync(path.join(repo, 'scene/src/ns-app.mjs'), 'utf8');
const NT = await import(path.join(repo, 'scene/src/ns-text.mjs'));
const NA = await import(path.join(repo, 'scene/src/ns-actions.mjs'));
const H = 1 / 60;

// C2. The view's follow of a keyed limb (followLimbView) and the turn to a newly chosen limb (stepLimbView) turn the look
// by themselves. Each such turn has to be counted (gameLookSeq), or the next frame takes it for the player's own look:
// it then switches on what the crosshair slid onto (hunt H2) and lights the neck areas and the left shoulder's (H3). A
// merge left the count only in a branch of the follow that no longer runs. This is a check of the wiring, read from the
// source, because the turns live inside the running app; the browser scenario of section 194 shows the lights.
test('C2: every turn of the look the game makes by itself is counted as the game\'s (the follow of a keyed limb, the turn to a chosen limb)', () => {
  // (comments are taken out first: a count that is only written about in a comment is not a count)
  const code = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const body = (from, to) => { const a = appSource.indexOf(from), b = appSource.indexOf(to, a + 1); assert.ok(a > 0 && b > a, `${from} ... ${to} found`); return code(appSource.slice(a, b)); };
  assert.equal(code('x = 1; // gameLookSeq++\ny /* gameLookSeq++ */ = 2;').includes('gameLookSeq'), false);
  for (const [name, src] of [['followLimbView', body('function followLimbView(', 'function stepLimbHold(')], ['stepLimbView', body('function stepLimbView(', 'const HOLD = LIMB_KEYS.view;')]]) {
    const turns = [...src.matchAll(/\bcs = controlsApi\.setLook\(cs,/g)].map(m => m.index);
    assert.ok(turns.length >= 1, `${name} turns the look`);
    turns.forEach((at, i) => {
      const next = i + 1 < turns.length ? turns[i + 1] : src.length, counted = src.indexOf('gameLookSeq++', at);
      assert.ok(counted > at && counted < next, `${name}: turn ${i + 1} of ${turns.length} is counted before the next one`);
    });
  }
});

// C3. The look hold (CARRIED_LOOK, section 184) for a movement switched on while an earlier one still carries the view.
test('C3: a movement switched on while an earlier one still carries the view gets its own look hold', () => {
  const { carriedLookStep, CARRIED_LOOK } = app;
  assert.equal(CARRIED_LOOK.chain, true);
  const trunk = { target: 'region', kind: 'region', regionId: 'lh_trunk', regionActionId: 'lh_trunk_extend', u: 0.4, hemisphere: 'left', point: [1, 2, 3] };
  const neck = { target: 'region', kind: 'region', regionId: 'lh_neck', regionActionId: 'lh_neck_flex', u: 0.6, hemisphere: 'left', point: [4, 5, 6] };
  const A = { regionId: 'lh_trunk' }, B = { regionId: 'lh_neck' };
  // "Lean back" switched on by a look that goes on moving: no hold for it
  const a1 = carriedLookStep(null, { carrying: true, gaze: trunk, lastMove: A, lookMs: 10, lookMsBefore: 5, moveSeq: 3 });
  assert.equal(a1.off, true);
  // the look travels on (the trunk still returns), then rests on the neck spot; nothing new yet: still no hold
  let s = carriedLookStep(a1, { carrying: true, gaze: neck, lastMove: A, lookMs: 20, lookMsBefore: 15, moveSeq: 3 });
  s = carriedLookStep(s, { carrying: true, gaze: neck, lastMove: A, lookMs: 20, lookMsBefore: 20, moveSeq: 3 });
  assert.equal(s.off, true, 'resting on another area starts no hold by itself');
  // "Bend head forward" switches on from that spot with the look still: its own hold, on its own spot
  const b1 = carriedLookStep(s, { carrying: true, gaze: neck, lastMove: B, lookMs: 20, lookMsBefore: 20, moveSeq: 4 });
  assert.equal(b1.off, false, 'the second movement is held (it was { off: true } on every frame before this change)');
  assert.equal(b1.gaze.regionId, 'lh_neck'); assert.equal(b1.gaze.regionActionId, 'lh_neck_flex'); assert.deepEqual(b1.gaze.point, [4, 5, 6]);
  // while it runs the swinging view slides the crosshair elsewhere: the held gaze stays; a click repeats the movement
  // (the count goes up) and the hold stays the same hold
  const b2 = carriedLookStep(b1, { carrying: true, gaze: { ...neck, regionActionId: 'lh_neck_side' }, lastMove: B, lookMs: 20, lookMsBefore: 20, moveSeq: 4 });
  assert.equal(b2, b1);
  const b3 = carriedLookStep(b2, { carrying: true, gaze: neck, lastMove: B, lookMs: 20, lookMsBefore: 20, moveSeq: 5 });
  assert.equal(b3.off, false); assert.equal(b3.gaze, b1.gaze); assert.equal(b3.moveSeq, 5);
  // the player's own look ends it, and it does not come back for the rest of that movement, repeated or not
  const b4 = carriedLookStep(b3, { carrying: true, gaze: neck, lastMove: B, lookMs: 31, lookMsBefore: 20, moveSeq: 5 });
  assert.equal(b4.off, true);
  assert.equal(carriedLookStep(b4, { carrying: true, gaze: neck, lastMove: B, lookMs: 31, lookMsBefore: 31, moveSeq: 5 }), b4, 'no new movement: no new decision');
  // a movement started from somewhere the look is not on (a tap on a muscle), or while the look moves: no hold
  assert.equal(carriedLookStep(a1, { carrying: true, gaze: neck, lastMove: { regionId: 'rh_knee' }, lookMs: 20, lookMsBefore: 20, moveSeq: 4 }).off, true);
  assert.equal(carriedLookStep(a1, { carrying: true, gaze: neck, lastMove: B, lookMs: 21, lookMsBefore: 20, moveSeq: 4 }).off, true);
  // an arrow key's step ends a hold for the rest of its movement (the app keeps the count in the state it writes then)
  const stepped = { off: true, gaze: null, lookMs: b3.lookMs, moveSeq: b3.moveSeq };
  assert.equal(carriedLookStep(stepped, { carrying: true, gaze: neck, lastMove: B, lookMs: 20, lookMsBefore: 20, moveSeq: 5 }), stepped);
  // the old rule behind its switch, and for a caller that does not tell the count
  assert.equal(carriedLookStep(s, { carrying: true, gaze: neck, lastMove: B, lookMs: 20, lookMsBefore: 20, moveSeq: 4 }, { ...CARRIED_LOOK, chain: false }).off, true);
  assert.equal(carriedLookStep(a1, { carrying: true, gaze: neck, lastMove: B, lookMs: 20, lookMsBefore: 20 }).off, true);
  // nothing carries the view any more: ready for the next, as before
  assert.equal(carriedLookStep(b3, { carrying: false, gaze: neck, lastMove: B, lookMs: 20, lookMsBefore: 20, moveSeq: 5 }), null);
});

// Part C of the package (the browser hunt of update 63): one quick look move from an arrow tip onto an area.
test('the pick catching up after a look movement is not silenced; an override that changes under a resting look still is', () => {
  const { PICK_LAG, overrideChangeSilent } = app;
  assert.equal(PICK_LAG.on, true);
  assert.ok(PICK_LAG.frames >= 3, 'the pick is of the frame before and serves two more frames (pickQuiet)');
  // the look moved, then stood: the stale pick blanked the gaze; the fresh pick comes on the 1st, 2nd or 3rd still frame
  for (const still of [1, 2, 3]) assert.equal(overrideChangeSilent(true, still), false, `still frame ${still}: the area the look arrived on is met as on any arrival`);
  // a body or an arrow tip that moves on or off the crosshair under a look that has rested: recorded silently (hunt 3)
  for (const still of [PICK_LAG.frames + 1, 10, 600]) assert.equal(overrideChangeSilent(true, still), true, `still frame ${still}: silent`);
  assert.equal(overrideChangeSilent(false, 1), false); assert.equal(overrideChangeSilent(false, 100), false, 'no change: nothing to silence');
  // the rule off: every such change is silent, as it was (the fault: the area was seeded and never switched on)
  assert.equal(overrideChangeSilent(true, 1, { ...PICK_LAG, on: false }), true);
  assert.equal(overrideChangeSilent(true, undefined), true, 'a frame count that is not known: silent');
  // the window's length is the pick's own longest lag: one frame (it is of the picture drawn before) plus the frames it serves
  assert.equal(PICK_LAG.frames, PICK_LAG.reuse + 1);
});

test('the pick-lag window opens after the player\'s own look movement only, not after a change the game made on a silent frame', () => {
  const { PICK_LAG, stillFramesNext, overrideChangeSilent } = app;
  const run = (first, n) => { const out = [first]; for (let i = 0; i < n; i++) out.push(stillFramesNext(out[out.length - 1], true, false)); return out; };
  // the player's look moves (the frame is not silent), then stands: the count runs 0, 1, 2, 3, then stays past the window
  const own = run(stillFramesNext(4, false, false), PICK_LAG.frames + 2);
  assert.deepEqual(own.slice(0, PICK_LAG.frames + 1), [0, 1, 2, 3].slice(0, PICK_LAG.frames + 1));
  assert.equal(own[own.length - 1], PICK_LAG.frames + 1); assert.equal(own[own.length - 2], PICK_LAG.frames + 1, 'a view at rest writes the same number every frame');
  for (let k = 1; k <= PICK_LAG.frames; k++) assert.equal(overrideChangeSilent(true, own[k]), false, `own look, still frame ${k}: the pick catching up is not silenced`);
  // the game turns the look, the view changes with E, the head carries the view, the brain is turned a step: the frame
  // that changed the view was silent, and a late pick in the frames after it is silenced, as before the rule
  const game = run(stillFramesNext(4, false, true), PICK_LAG.frames + 1);
  for (const k of game) assert.equal(overrideChangeSilent(true, k), true);
  assert.equal(stillFramesNext(undefined, true, false), 1); assert.equal(stillFramesNext(0, false, false), 0);
});

// A look that arrives on an area while a neck or trunk movement carries the view (the check of this package, its one
// major finding). Two halves: what the activity does with what the frame tells it, and when the frame tells it.
test('a look the player moved onto an area during a carry switches the area on when the carry ends; a view that only slid does not', () => {
  const A = NA.createActivity();
  const gaze = (regionId, actionId, extra = {}) => ({ type: 'gaze', kind: 'region', regionId, actionId, yaw: 0.1, pitch: 0.2, at: 0, ...extra });
  const run = (st, ev, n = 1) => { let q = st; for (let i = 0; i < n; i++) q = A.stepGated(q, [ev], H).state; return q; };
  let s = A.step(A.state, [], 2.5);
  s = run(s, { type: 'gaze', kind: 'empty', yaw: 0, pitch: 0, at: 0 });
  // the look rests on "Lean back": it switches on after the usual rest
  s = run(s, gaze('lh_trunk', 'lh_trunk_extend'), 8);
  assert.equal(s.moveSeq, 1); assert.equal(s.lastMove.regionId, 'lh_trunk');
  const from = s.gazeArea;
  assert.equal(typeof from, 'string');
  // the trunk carries the view: the frames are silent. The crosshair is now on the left toes' area (the frame records it)
  s = run(s, gaze('rh_toes', 'rh_big_toe_curl', { seed: true }), 60);
  assert.equal(s.moveSeq, 1, 'nothing switches on during the silence');
  const toes = s.gazeArea;
  assert.notEqual(toes, from);
  // the carry is over and the frames are no longer silent
  // (a) the view only slid there (nothing told): the area was recorded, it stays quiet however long the look rests.
  //     This is section 184's rule, and it was also what a look of the PLAYER's got: the fault.
  assert.equal(run(s, gaze('rh_toes', 'rh_big_toe_curl'), 120).moveSeq, 1);
  // (b) the player's own look brought it there from the trunk spot: the first frame says so, and the area switches on
  let b = run(s, gaze('rh_toes', 'rh_big_toe_curl', { arrivedFrom: from }));
  assert.equal(b.moveSeq, 1, 'not in the frame of arrival: after the usual rest');
  b = run(b, gaze('rh_toes', 'rh_big_toe_curl'), 8);
  assert.equal(b.moveSeq, 2); assert.equal(b.lastMove.regionId, 'rh_toes');
  assert.equal(run(b, gaze('rh_toes', 'rh_big_toe_curl'), 120).moveSeq, 2, 'once: resting on does not repeat it');
  // (c) the look came from no area at all (bare brain): the same
  assert.equal(run(run(s, gaze('rh_toes', 'rh_big_toe_curl', { arrivedFrom: null })), gaze('rh_toes', 'rh_big_toe_curl'), 8).moveSeq, 2);
  // (d) the look ended on the area it started from (a nudge of the mouse during the head's own movement): nothing
  assert.equal(run(run(s, gaze('rh_toes', 'rh_big_toe_curl', { arrivedFrom: toes })), gaze('rh_toes', 'rh_big_toe_curl'), 60).moveSeq, 1);
  // (e) a silent frame is silent whatever it is told, and the field must be an area or null
  assert.equal(run(run(s, gaze('rh_toes', 'rh_big_toe_curl', { seed: true, arrivedFrom: from })), gaze('rh_toes', 'rh_big_toe_curl'), 60).moveSeq, 1);
  assert.throws(() => run(s, gaze('rh_toes', 'rh_big_toe_curl', { arrivedFrom: 7 })));
});

test('the frame tells the activity of an arrival only for a look the player moved during the carry, and only once the carry is over', () => {
  const { CARRY_ARRIVAL, carryArrivalStep } = app;
  assert.equal(CARRY_ARRIVAL.on, true);
  const T = 'lh_trunk/lh_trunk_extend';
  const frame = (prev, o) => carryArrivalStep(prev, { carrySilent: true, gazeArea: T, ...o });
  // the trunk carries the view and the player leaves the look alone: nothing is kept, nothing told when it ends
  let r = frame(null, {});
  assert.deepEqual(r, { keep: null, arrivedFrom: undefined });
  assert.equal(carryArrivalStep(r.keep, { carrySilent: false }).arrivedFrom, undefined, 'section 184: the view only slid and came back');
  // the player moves the look during the carry: where it came from is kept through the carry
  r = frame(null, { lookMoved: true });
  assert.deepEqual(r.keep, { from: T }); assert.equal(r.arrivedFrom, undefined, 'nothing is told while the frames are silent');
  const kept = r.keep;
  r = frame(kept, { gazeArea: 'rh_toes/rh_big_toe_curl' });
  assert.equal(r.keep, kept, 'the area it came from is the one before the FIRST movement');
  r = frame(r.keep, { lookMoved: true, gazeArea: 'rh_knee/rh_knee_flex' });
  assert.equal(r.keep, kept);
  // the carry ends: the first frame that is not silent is told, once
  r = carryArrivalStep(kept, { carrySilent: false, gazeArea: 'rh_toes/rh_big_toe_curl' });
  assert.equal(r.arrivedFrom, T); assert.equal(r.keep, null);
  assert.equal(carryArrivalStep(r.keep, { carrySilent: false }).arrivedFrom, undefined);
  // a look that was on no area before the player moved it
  assert.equal(carryArrivalStep(frame(null, { lookMoved: true, gazeArea: null }).keep, { carrySilent: false }).arrivedFrom, null);
  // what makes the arrival void: the look held on the movement's own spot, a click on the area, and any other reason
  // for the silence (the game turned the look, a carried limb, a change of view, a seed)
  for (const o of [{ held: true }, { clicked: true }, { otherSilent: true }]) assert.deepEqual(frame(kept, o), { keep: null, arrivedFrom: undefined }, JSON.stringify(o));
  assert.equal(carryArrivalStep(kept, { carrySilent: false, otherSilent: true }).arrivedFrom, undefined, 'the frame after the carry is silent for another reason: nothing told');
  assert.equal(frame(null, { lookMoved: true, otherSilent: true }).keep, null);
  // the rule off: as it was
  assert.deepEqual(carryArrivalStep(kept, { carrySilent: false }, { on: false }), { keep: null, arrivedFrom: undefined });
});

// U1. The look hold ends when the view is changed (E) or the game turns the look (to a newly chosen limb, or after a limb
// the keys move): the crosshair is then on something else by the player's own doing.
test('U1: a change of view or a turn of the look by the game ends the look hold, as the player\'s own look does', () => {
  const { carriedLookStep, CARRIED_LOOK } = app;
  assert.equal(CARRIED_LOOK.viewEnds, true);
  const neck = { target: 'region', kind: 'region', regionId: 'lh_neck', regionActionId: 'lh_neck_flex', u: 0.6, hemisphere: 'left', point: [4, 5, 6] };
  const B = { regionId: 'lh_neck' }, base = { carrying: true, gaze: neck, lastMove: B, lookMs: 20, lookMsBefore: 20, moveSeq: 4 };
  const h = carriedLookStep(null, { ...base, viewSeq: 2, gameSeq: 7 });
  assert.equal(h.off, false);
  assert.equal(carriedLookStep(h, { ...base, viewSeq: 2, gameSeq: 7 }), h, 'nothing changed: the hold stays');
  // E: the view is another one (it held on before this change, and a click repeated "Bend head forward" from outside)
  const e = carriedLookStep(h, { ...base, viewSeq: 3, gameSeq: 7 });
  assert.equal(e.off, true); assert.equal(e.gaze, null);
  // key 1 to 4 or a double click: the game turns the look to the chosen limb
  assert.equal(carriedLookStep(h, { ...base, viewSeq: 2, gameSeq: 8 }).off, true);
  // and it does not come back for the rest of that movement
  assert.equal(carriedLookStep(e, { ...base, viewSeq: 3, gameSeq: 7 }), e);
  // the rule off, and a caller that does not tell the counts: as it was
  assert.equal(carriedLookStep(h, { ...base, viewSeq: 3, gameSeq: 8 }, { ...CARRIED_LOOK, viewEnds: false }), h);
  const plain = carriedLookStep(null, base);
  assert.equal(carriedLookStep(plain, base), plain);
});

// U5 / U12. The grip card's "Your <limb> is chosen" names the limb chosen now, not the one the press of Space chose.
test('U5, U12: the grip card names the limb that is chosen now while the press of Space that chose a limb is kept', () => {
  const { gripChosenLimb } = app;
  assert.equal(gripChosenLimb('rightLeg', 'rightLeg'), 'rightLeg', 'Space on the right leg: the right leg is chosen');
  assert.equal(gripChosenLimb('rightLeg', 'leftLeg'), 'leftLeg', 'then key 2 with Space kept: the card names the left leg (it went on naming the right leg)');
  assert.equal(gripChosenLimb('rightLeg', 'leftArm'), 'leftArm');
  assert.equal(gripChosenLimb(null, 'leftLeg'), null, 'a press of Space that chose no limb: the card says what is held, or that nothing is');
  assert.equal(gripChosenLimb('rightLeg', null), 'rightLeg');
  assert.equal(NT.graspInfoCard({ phase: 'close', holding: null, chosen: gripChosenLimb('rightLeg', 'leftLeg'), kept: true }).lead.startsWith('Your left leg is chosen'), true);
});

// U3. The push's distances per frame (LIMB_PUSH approachM and the two tests beside it) on a display faster than 60 Hz.
test('U3: a limb that comes on at a quarter of the keys\' speed counts as an approach at 60, 144 and 240 frames a second alike', () => {
  const { LIMB_PUSH, LIMB_KEYS, pushFrameShare } = app;
  assert.ok(Math.abs(LIMB_PUSH.frameRefS - 1 / 60) < 1e-12);
  assert.equal(pushFrameShare(1 / 60), 1); assert.equal(pushFrameShare(1 / 30), 1, 'a longer frame keeps the distances as they were tried');
  assert.ok(Math.abs(pushFrameShare(1 / 240) - 0.25) < 1e-9); assert.ok(Math.abs(pushFrameShare(1 / 144) - 60 / 144) < 1e-9);
  assert.equal(pushFrameShare(0), 1); assert.equal(pushFrameShare(NaN), 1); assert.equal(pushFrameShare(1 / 240, { ...LIMB_PUSH, frameRefS: null }), 1, 'the rule off: per frame, as it was');
  // a point of contact that comes on at a quarter of the keys' speed (a contact near the mover's root, or at a slant)
  const speed = LIMB_KEYS.view.speedMps / 4;
  for (const hz of [60, 144, 240]) {
    const dt = 1 / hz, approach = speed * dt;
    assert.ok(approach > LIMB_PUSH.approachM * pushFrameShare(dt), `${hz} frames a second: ${(approach * 1000).toFixed(2)} mm a frame is an approach`);
  }
  // (the fault: per frame, the same approach was under the 1 mm at 240 frames a second, and the limb was passed through)
  assert.ok(speed / 240 < LIMB_PUSH.approachM && speed / 60 > LIMB_PUSH.approachM);
  // a key held at a range end still pushes nothing at 60 frames a second: its millimetre of jitter is not over the test
  assert.ok(!(0.001 > LIMB_PUSH.approachM * pushFrameShare(1 / 60)));
});

// ---- Words (U4, U6 to U9): each says what the controls do now -------------------------------------------------------
const read = name => readFileSync(path.join(repo, name), 'utf8');

test('U4: with a free pointer over one of your limbs the tip says Space chooses it; over the brain or the mirror body, that Space holds it', () => {
  assert.equal(NT.TIP.spaceAim('rightArm', false, true), 'Space chooses your right arm');
  assert.equal(NT.TIP.spaceAim('leftLeg', true, true), 'Shift + Space chooses your left leg');
  for (const limb of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) assert.doesNotMatch(NT.TIP.spaceAim(limb, false, true), /holds/, `${limb}: nothing holds a limb`);
  assert.equal(NT.TIP.spaceAim('brain', false, true), 'Space holds the brain');
  assert.equal(NT.TIP.spaceAim('mirror', true, true), 'Shift + Space holds the mirror body');
  assert.equal(NT.TIP.spaceAim(null, false, true), '');
  // the rule off (a limb held by Space, as before 19 November): the line as it was
  assert.equal(NT.TIP.spaceAim('rightArm', false), 'Space holds your right hand');
});

test('U6: the tutorial\'s line for a drag on a limb says what a drag on the right hand does (it bends the wrist)', () => {
  assert.match(NT.GUIDE.goals.dragLimb, /right hand[^.]*wrist/i);
});

// The player guide and the preview notes are prose that their authors reword: only the sentences that were untrue are
// pinned here, as absent. What the pages say instead is read by people, not by this suite.
test('U7 to U9: the sentences of the player guide and the preview notes that were no longer true are gone', () => {
  const guide = read('PLAYER-GUIDE.md'), notes = read('PREVIEW-NOTES.html');
  // U7: S across the chest does turn the right upper arm
  assert.ok(!guide.includes('The limb does not turn inward or outward while you do this; the double tap of Space does that.'));
  // U8: number keys choose a limb; Space on a limb chooses it and both hands close; a look does the movement; E lets go
  for (const stale of ['Press a number, 1 to 9, to do the movement with that number in the tip',
    'Hold Space on the brain, the mirror body or one of your limbs to take hold. Your left hand closes.',
    'Click it to do the highlighted movement.', 'It does nothing while Space holds something',
    // U9: the left wrist bends sideways since section 184
    'its sideways wrist bends only light their area']) assert.ok(!notes.includes(stale), stale);
});

// The arrow keys' walk: an area with no point that has the area all round it (a narrow finger area) is tried at up to
// three of the points seen, not at the first one only (the left key passed over the right middle finger's area).
test('an arrow key tries up to three seen points of an area, the one with the area all round it first', () => {
  const { areaStepTries, AREA_STEP } = app;
  const a = [1, 0, 0], b = [2, 0, 0], c = [3, 0, 0], d = [4, 0, 0];
  assert.equal(AREA_STEP.looksPerArea, 3);
  assert.deepEqual(areaStepTries([a, b, c, d], null), [a, b, c], 'no inner point: the first three seen (it was the first one only)');
  assert.deepEqual(areaStepTries([a, b, c, d], c), [c, a, b], 'the inner point first, then the others in the order seen');
  assert.deepEqual(areaStepTries([a], a), [a]);
  assert.deepEqual(areaStepTries([], null), [], 'nothing of the area can be seen from here: it is passed over');
  assert.deepEqual(areaStepTries([a, b], null, 1), [a]);
});
