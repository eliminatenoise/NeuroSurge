// Hunt of update 74, finding 8 (package HUD3, fault 4): a click that pressed nothing. While Space gripped with nothing
// held, a click on a motor area pressed nothing or the area under the mark in the middle; while Space carried something
// the click pressed the area under the mark, behind a carried mirror body too; with Shift held and nothing behind, a
// click pressed nothing while the tip named the area's movement. The pure rules: spaceKeepsAim, aimStep's pressOnly,
// clickBehindCarried, nothingBehind, and the words of the status line and the carried thing's pointer tip.
// (A review of the first fix: a limb turn kept the aim at the mark while its click pressed the pointer's area; with the
// carried brain's clear glass in front of the mirror body a click pressed nothing; Shift with nothing behind changed
// only the click, so a Shift drag pressed the area at its start.)
import assert from 'node:assert/strict';
import test from 'node:test';
import { aimStep, spaceKeepsAim, clickBehindCarried, nothingBehind, carryTipRest, CARRY_TIP, FREE_AIM, gripRefuses, SPACE_COMPETING } from '../scene/src/ns-app.mjs';
import { HUD, TIP, gazeLine, gazeMuscleLine, MIRROR_PART_NAMES } from '../scene/src/ns-text.mjs';
import { noSpaceGesture } from '../scene/src/ns-controls.mjs';
import { quietTipModel } from '../scene/src/ns-quiet.mjs';

const W = 1600, H = 900;
const at = (x, y, timeMs) => ({ x, y, timeMs });
/** Frames through aimStep, 16 ms apart; each frame gives only what changes (clicked lasts one frame). */
function run(frames) {
  let seen = null, cur = { pointer: null, lookMs: null, yaw: 0, pitch: -0.445, free: true, width: W, height: H, busy: false, down: false, gazeArea: null, clicked: false, pressSeq: 0 }, t = 0;
  const out = [];
  for (const f of frames) {
    const { rest = 0, ...change } = f;
    cur = { ...cur, clicked: false, ...change };
    for (let k = 0; k <= rest; k++) { t += 16; const r = aimStep(seen, { ...cur, nowMs: t }); seen = r.seen; if (k === rest) out.push(r); cur = { ...cur, clicked: false }; }
  }
  return out;
}

test('a grip that holds nothing and a limb turn leave the pointer the aim; only a hold or a carry keeps the mark', () => {
  const sp = (o = {}) => ({ ...noSpaceGesture(), ...o });
  assert.equal(spaceKeepsAim(sp()), false, 'Space up');
  assert.equal(spaceKeepsAim(sp({ role: 'grasp', grasp: 'held' })), false, 'Space down on nothing: the hands grip, the pointer does not turn the look');
  assert.equal(spaceKeepsAim(sp({ grasp: 'kept' })), false, 'a tap on nothing (forgotten at the end of its frame)');
  assert.equal(spaceKeepsAim(sp({ role: 'grasp', grasp: 'held', holding: true })), true, 'Space holds the brain or the mirror body');
  assert.equal(spaceKeepsAim(sp({ role: 'grasp', grasp: 'held' }), true), true, 'something carried, before the gesture has heard of it');
  assert.equal(spaceKeepsAim(sp({ grasp: 'kept', holding: true })), true, 'kept by a tap');
  assert.equal(spaceKeepsAim(sp({ role: 'release', grasp: 'kept', holding: true })), true, 'the press that lets go of a kept hold');
  assert.equal(spaceKeepsAim(sp({ role: 'turn', turn: 'step' })), false, 'a double tap: the limbs turn, the pointer does not turn the look');
  assert.equal(spaceKeepsAim(sp({ role: 'turn', turn: 'hold', turning: true })), false, 'the slow turn of a double tap held');
  assert.equal(spaceKeepsAim(sp({ turning: true })), false, 'a turn still runs');
  assert.equal(spaceKeepsAim(sp({ role: 'wait', turning: true })), false, 'a press that waits for a turn');
  assert.equal(spaceKeepsAim(null), false);
  assert.equal(spaceKeepsAim(undefined, true), true);
  // aimStep with the grip's busy: the resting pointer stays the aim, and its click is at the pointer
  const grip = spaceKeepsAim(sp({ role: 'grasp', grasp: 'held' }));
  const [, rested, clicked] = run([{}, { pointer: at(690, 56, 100), rest: 9, gazeArea: 'rh_ankle' }, { busy: grip, pressSeq: 1, down: true, clicked: true }]);
  assert.equal(rested.pointer, true);
  assert.equal(clicked.pointer, true, 'during the grip the click is the pointer\'s');
  assert.deepEqual([clicked.x, clicked.y], [690, 56]);
  assert.equal(clicked.pressOnly, false);
});

test('while something is carried a click aims at the pointer for its own frame only', () => {
  // the pointer turns the look during a carry (the look moved last): the mark is the aim
  const base = [{}, { pointer: at(480, 450, 100), rest: 9 }, { busy: true, lookMs: 300, yaw: -0.1, pointer: at(560, 400, 300) }, { lookMs: 320, yaw: -0.2, pointer: at(690, 56, 320), rest: 3 }];
  const r = run([...base,
    { pressSeq: 1, down: true }, // a press on the carried thing (it may become a drag of it): the click waits for the release
    { rest: 2 },
    { down: false, clicked: true }, // released without travel: the click
    {}]);
  const [, , , carrying, press, held, click, after] = r;
  assert.equal(carrying.pointer, false, 'carrying: the mark is the aim');
  assert.equal(press.pointer, false, 'the press itself does not move the aim (the tip stays at the mark)');
  assert.equal(held.pointer, false);
  assert.equal(click.pointer, true, 'the click\'s frame: the pointer is the aim');
  assert.equal(click.pressOnly, true, 'for that frame only');
  assert.deepEqual([click.x, click.y], [690, 56]);
  assert.equal(click.silent, false, 'the click presses what is under the pointer');
  assert.equal(after.pointer, false, 'the next frame: the mark again');
  assert.equal(after.pressOnly, false);
  assert.equal(after.silent, true, 'and silently: nothing at the mark switches on because of the click');
  // a click made at the press (no drag possible): the press frame, silently while the button is down
  const [, , , , atPress] = run([...base, { pressSeq: 1, down: true, clicked: true }]);
  assert.equal(atPress.pointer, true);
  assert.equal(atPress.pressOnly, true);
  assert.equal(atPress.silent, true, 'the button is down: the look is recorded silently, the click presses it');
  // a press that became a drag of the carried thing: no click at the release, no aim
  const [, , , , , , dragEnd] = run([...base, { pressSeq: 1, down: true }, { rest: 2, pointer: at(700, 60, 400) }, { down: false }]);
  assert.equal(dragEnd.pointer, false);
  // the look moved between the press and the click: the mark keeps the aim
  const [, , , , , , moved] = run([...base, { pressSeq: 1, down: true }, { lookMs: 500, yaw: -0.3 }, { down: false, clicked: true }]);
  assert.equal(moved.pointer, false);
  // a click with nothing carried and the rule off: unchanged
  const [, , plain] = run([{}, { pointer: at(690, 56, 100), rest: 9 }, { pressSeq: 1, down: true, clicked: true }]);
  assert.equal(plain.pointer, true);
  assert.equal(plain.pressOnly, false);
  const [, , , off] = run([{}, { pointer: at(690, 56, 100), rest: 9, on: false }, { busy: true }, { pressSeq: 1, down: true, clicked: true }]);
  assert.equal(off.pointer, false);
  const [, , , captured] = run([{}, { pointer: at(690, 56, 100), rest: 9 }, { busy: true, free: false }, { pressSeq: 1, down: true, clicked: true }]);
  assert.equal(captured.pointer, false, 'with the pointer captured the mark is where the click acts');
});

test('a click while something is carried never reaches through it', () => {
  const e = (item, kind, distance) => ({ item, kind, distance });
  // measured with the pointer captured at 1600x900: the mirror body carried, the look on the neck's area behind it
  const mirrorOverArea = { front: e('brain', 'area', 3.1), behind: e('mirror', 'muscle', 1.9), arrow: null };
  assert.equal(clickBehindCarried(mirrorOverArea, 'mirror'), true, 'the area behind the carried mirror body is not pressed');
  assert.equal(clickBehindCarried(mirrorOverArea, null), false, 'nothing carried: the area is pressed (the lead decision: the look reaches through the bodies)');
  assert.equal(clickBehindCarried(mirrorOverArea, 'brain'), false, 'the brain carried: its own area, with the mirror body in front of it, is pressed');
  // measured at 1600x900 (a review): the brain carried and pulled in with S, its clear glass in front of the mirror
  // body's trunk seen through it at (800, 200). The glass is see-through: the mirror body's muscle is tapped, as in
  // update 80 (the first fix pressed nothing there).
  const glassOverMirror = { front: e('mirror', 'muscle', 2.4), behind: e('brain', 'glass', 1.2), arrow: null };
  assert.equal(clickBehindCarried(glassOverMirror, 'brain'), false, 'what is seen through the carried brain\'s clear glass is what a click takes');
  assert.equal(clickBehindCarried({ front: e('own', 'muscle', 2.4), behind: e('brain', 'glass', 1.2) }, 'brain'), false, 'your limb seen through it too');
  assert.equal(clickBehindCarried(glassOverMirror, 'mirror'), false);
  // the brain carried, an area of it under the pointer, the mirror body further away
  assert.equal(clickBehindCarried({ front: e('brain', 'area', 1.2), behind: e('mirror', 'muscle', 2.4) }, 'brain'), false);
  // your limb carried in front of an area
  assert.equal(clickBehindCarried({ front: e('brain', 'area', 2.0), behind: e('own', 'muscle', 0.6) }, 'own'), true);
  // the carried thing behind what the click takes, an arrow tip in front, nothing behind, bad distances
  assert.equal(clickBehindCarried({ front: e('brain', 'area', 1.0), behind: e('mirror', 'muscle', 2.0) }, 'mirror'), false);
  assert.equal(clickBehindCarried({ ...mirrorOverArea, arrow: { target: 'brain', dir: 'left' } }, 'mirror'), false);
  assert.equal(clickBehindCarried({ front: e('brain', 'area', 1.0), behind: null }, 'mirror'), false);
  assert.equal(clickBehindCarried({ front: e('brain', 'area', NaN), behind: e('mirror', 'muscle', 1) }, 'mirror'), false);
  assert.equal(clickBehindCarried(null, 'mirror'), false);
});

test('Shift held with nothing behind reaches nothing: click, Space and drag act as without it; the line says so', () => {
  const area = { item: 'brain', kind: 'area', distance: 1.4 };
  assert.equal(nothingBehind({ front: area, behind: null, arrow: null }), true, 'measured at 1600x900: the left ankle, toes and hip areas at the top of the strip, nothing behind');
  assert.equal(nothingBehind({ front: area, behind: { item: 'mirror', kind: 'muscle', distance: 0.9 }, arrow: null }), false, 'a body part in front of the area: Shift takes it, as before');
  assert.equal(nothingBehind({ front: { item: 'mirror', kind: 'bone', distance: 1 }, behind: { item: 'brain', kind: 'glass', distance: 2 } }), false, 'the brain behind the mirror body: Shift takes it, as before');
  assert.equal(nothingBehind({ front: { item: 'own', kind: 'muscle', distance: 0.5 }, behind: null }), true, 'your limb with nothing behind: as without Shift');
  assert.equal(nothingBehind({ front: area, behind: null, arrow: { target: 'brain', dir: 'left' } }), false, 'an arrow tip: Shift passes it to what is behind, here nothing');
  assert.equal(nothingBehind({ front: null, behind: null }), false, 'nothing seen: nothing to take');
  assert.equal(nothingBehind(null), false);
  assert.equal(HUD.controlTargets({ front: 'area', behind: null, reach: true }), 'Shift held: nothing behind, so click, Space and drag work as usual');
  assert.equal(HUD.controlTargets({ front: 'mirror', behind: null, reach: true }), 'Shift held: nothing behind, so click, Space and drag work as usual');
  assert.equal(HUD.controlTargets({ front: null, behind: null, reach: true }), 'Shift held: nothing behind to reach here');
  assert.equal(HUD.controlTargets({ front: 'arrow', behind: null, reach: true }), 'Shift held: nothing behind to reach here');
  assert.equal(HUD.controlTargets({ front: 'area', behind: 'mirror', inFront: true, reach: true }), 'Shift held: click, Space or drag takes the mirror body in front of it', 'Shift\'s own use is unchanged');
});

test('while something is carried, the tip by the resting pointer says what a click there starts', () => {
  assert.equal(TIP.carryClick('Turn left sole inward'), 'Click: turn left sole inward');
  assert.equal(TIP.carryClick('  Bend left knee '), 'Click: bend left knee');
  assert.equal(TIP.carryClick(''), 'Click switches it on', 'an area whose movement has no name');
  assert.equal(TIP.carryClick(null), 'Click switches it on');
});

// A second review: for the hold's first 1.2 s the tip said "Holding the brain" while a click at the resting pointer
// pressed the area there (687 and 911 ms into a hold, the left ankle), and at the full reading level the "Looking at"
// line said "brain glass ... (nothing switches on)" while the click switched the area on.
test('the carry tip names the click\'s target at each rest once the pointer has moved; the card\'s line at every rest', () => {
  assert.equal(CARRY_TIP.afterMs, 1200);
  const rest = FREE_AIM.restMs;
  // Space pressed where the pointer rested long before: at rest at once (the card's line), the hold's own tip for afterMs
  let r = carryTipRest(null, { pointer: at(678, 52, 1000), nowMs: 5000 });
  assert.deepEqual([r.rested, r.ready, r.moved], [true, false, false], 'no flash of the hold\'s words before the card names it');
  assert.equal(r.seen.since, 5000);
  r = carryTipRest(r.seen, { pointer: at(678, 52, 1000), nowMs: 5000 + CARRY_TIP.afterMs - 1 });
  assert.deepEqual([r.rested, r.ready], [true, false]);
  r = carryTipRest(r.seen, { pointer: at(679, 53, 1000), nowMs: 5000 + CARRY_TIP.afterMs });
  assert.deepEqual([r.rested, r.ready, r.moved], [true, true, false], 'past afterMs (a move within restPx is no move)');
  // Space pressed on the glass, then the pointer moved onto an area: the tip names it at the first rest, well within afterMs
  r = carryTipRest(null, { pointer: at(480, 450, 1000), nowMs: 5000 });
  assert.deepEqual([r.rested, r.ready], [true, false]);
  r = carryTipRest(r.seen, { pointer: at(678, 52, 5300), nowMs: 5300 });
  assert.deepEqual([r.rested, r.ready, r.moved], [false, false, true], 'moving: it carries the held thing');
  r = carryTipRest(r.seen, { pointer: at(678, 52, 5300), nowMs: 5300 + rest });
  assert.deepEqual([r.rested, r.ready], [true, true], `${300 + rest} ms into the hold`);
  // a button down: not at rest
  assert.equal(carryTipRest(r.seen, { pointer: at(678, 52, 5300), nowMs: 6000, down: true }).rested, false);
  // off the picture: nothing; back on it, at rest from its own last move, and that was a move
  r = carryTipRest(r.seen, { pointer: null, nowMs: 7100 });
  assert.deepEqual([r.rested, r.ready], [false, false]); assert.ok(Number.isNaN(r.seen.x));
  r = carryTipRest(r.seen, { pointer: at(500, 300, 7150), nowMs: 7160 });
  assert.deepEqual([r.rested, r.moved], [false, true]);
  r = carryTipRest(r.seen, { pointer: at(500, 300, 7150), nowMs: 7150 + rest });
  assert.deepEqual([r.rested, r.ready], [true, true]);
  // a hold begun with the pointer off the picture: its coming back is a move
  r = carryTipRest(null, { pointer: null, nowMs: 9000 });
  r = carryTipRest(r.seen, { pointer: at(500, 300, 9050), nowMs: 9050 + rest });
  assert.deepEqual([r.rested, r.ready], [true, true]);
  // a pointer time ahead of the frame's clock is not trusted: the rest starts now
  assert.equal(carryTipRest(null, { pointer: at(10, 10, 9000), nowMs: 8000 }).seen.movedAt, 8000);
  // no wait asked for: ready at the first rest
  assert.equal(carryTipRest(null, { pointer: at(678, 52, 1000), nowMs: 5000, afterMs: 0 }).ready, true);
});
test('while something is carried, the full cards\' "Looking at" line says what a click at the resting pointer presses', () => {
  const hint = TIP.carryClick('Bend left knee');
  assert.equal(gazeLine('other', hint, 'Left knee'), 'Looking at (motor area): Left knee · Click: bend left knee');
  assert.doesNotMatch(gazeLine('other', hint, 'Left knee'), /nothing switches on/);
  assert.equal(gazeMuscleLine({ where: 'mirror', name: 'right rectus abdominis', kind: 'muscle', part: MIRROR_PART_NAMES.torso || MIRROR_PART_NAMES.other }).startsWith(HUD.gazeMirrorPrefix), true);
  assert.match(gazeMuscleLine({ where: 'mirror', name: 'right rectus abdominis', kind: 'muscle', part: MIRROR_PART_NAMES.other }), /right rectus abdominis/);
});
test('at a hold\'s start the hold\'s own tip carries a line naming what a click at the resting pointer presses', () => {
  const held = TIP.holding('brain', false);
  const plain = quietTipModel({ held }), withClick = quietTipModel({ held, teach: TIP.carryClick('Turn left sole inward') });
  assert.deepEqual([withClick.kind, withClick.title, withClick.hint, withClick.teach], ['hold', 'Holding the brain', 'Let go of Space.', 'Click: turn left sole inward']);
  assert.equal(plain.teach, undefined);
  assert.notEqual(withClick.key, plain.key, 'a new tip when the line comes or goes');
  // (a third review: for a muscle the line had no verb, "Click: left temporoparietalis")
  assert.equal(TIP.carryMuscleClick('Left temporoparietalis'), 'Click: switch on the brain area for left temporoparietalis', 'a muscle of the carried mirror body');
  assert.equal(TIP.carryMuscleClick(''), 'Click: switch on its brain area', 'the muscle\'s own tip, whose title names it');
  assert.match(quietTipModel({ held: TIP.holding('mirror', false), teach: TIP.carryMuscleClick('right rectus abdominis') }).teach, /^Click: switch on /);
});

// A third review: with the pointer the aim during a grip on nothing, and at the pointer while the brain was carried, the
// tip named the movement of a left-hand finger or thumb area ("Click: straighten left little finger"), and so did the full
// card, while the grip refused it: a rest and a click there pressed nothing (ns-actions SPACE_COMPETING, startPulse).
test('the Space grip refuses the left hand\'s finger and thumb movements, and the words say so', () => {
  const gripping = { graspHold: true }, open = { graspHold: false };
  for (const id of ['little_extension', 'middle_flexion', 'thumb_opposition', 'thumb_mcp_extension', 'index_flexion', 'open_hand', 'spread_fingers']) {
    assert.ok(SPACE_COMPETING.includes(id));
    assert.equal(gripRefuses(id, gripping), true, `${id} while the grip holds`);
    assert.equal(gripRefuses(id, open), false, `${id} with the hand open`);
  }
  for (const id of ['wrist_flexion', 'elbow_extension', 'lh_r_grasp', 'lh_r_middle_flex', 'rh_ankle_invert', 'rh_big_toe_curl', 'grasp_close'])
    assert.equal(gripRefuses(id, gripping), false, `${id} is not refused (the wrist, the right hand, the feet, the grip itself)`);
  assert.equal(gripRefuses('little_extension', null), false);
  assert.equal(gripRefuses(null, gripping), false);
  assert.equal(gripRefuses('little_extension', { graspHold: 'yes' }), false);
  const held = TIP.gripHolds(false), kept = TIP.gripHolds(true);
  assert.equal(held, 'Hand gripping: let go of Space, then click.');
  assert.equal(kept, 'Hand gripping: tap Space, then click.', 'a grip kept by a tap lets go with a tap');
  for (const w of [held, kept]) { assert.doesNotMatch(w, /straighten|bend|turn/i); assert.ok(w.length <= 44, `one line in the tip (${w.length})`); }
  // the full cards' line on such an area names it and says the hand grips
  assert.equal(gazeLine('strip', held, 'Left little finger'), 'Looking at (motor area): Left little finger · Hand gripping: let go of Space, then click.');
  // and on a muscle whose tap the grip refuses
  const m = gazeMuscleLine({ where: 'own', name: 'left flexor digitorum superficialis', kind: 'muscle', gripped: true });
  assert.equal(m, `Looking at (your body): left flexor digitorum superficialis, ${HUD.gripCaption}`);
  assert.doesNotMatch(m, /switches on/);
  assert.match(gazeMuscleLine({ where: 'own', name: 'left flexor digitorum superficialis', kind: 'muscle' }), /switches on/, 'not gripped: as before');
});
