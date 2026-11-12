/** The view under a held trunk or neck movement (user Messages 1, 55 and 56: the head jerks with the neck areas; the
 * game has to be easier to use; a learning tool). A held trunk bend (the trunk area: bend forward / lean back) moves the
 * trunk under the head and the neck takes up the difference, so the view keeps its direction and stays on the area. A
 * held neck movement still moves the head and the view with it, and the status card then says so.
 * Pure parts are checked here: ns-app headPoseForLook (the head's direction, the neck and the trunk for a look and held
 * offsets), headLookRange (the look range that goes with them), headGoalTaken and headBackKey (when the card's line is
 * due and which number key it names, with the activity's own list of bring-back movements: ns-actions latchView().back),
 * and that the three lines exist (ns-text). No scene, model, browser or native fixture. These cases establish angles and
 * list contents only, never pixels, timing or biology; the angle limits are the game's own simplified ranges.
 * Run: node tests/head-hold.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-app.mjs', import.meta.url);
const app = await import(target.href);
const { BODY_MOTOR_MAP } = await import(new URL('../scene/src/ns-bodymap.mjs', import.meta.url).href);
const { createActivity } = await import(new URL('../scene/src/ns-actions.mjs', import.meta.url).href);
const NT = await import(new URL('../scene/src/ns-text.mjs', import.meta.url).href);
const { HEAD_LOOK, headPoseForLook, headLookRange, headBendLimit, headGoalTaken, headBackKey, infoMoves, infoOverlayModel } = app;
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const DEG = Math.PI / 180;
const L = HEAD_LOOK;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const look = (yawDeg, pitchDeg) => ({ yaw: yawDeg * DEG, pitch: pitchDeg * DEG });
const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} against ${b}`);
const region = id => BODY_MOTOR_MAP.regions.find(r => r.id === id);
// Looks across the whole range the game allows without a held offset (headLookRange), and held trunk bends across the
// trunk area's two movements and beyond the range.
const YAWS = [-110, -75, -40, -9.5, 0, 12, 40, 75, 110];
const HELD = [-40, -25, -10, 0, 20, 60, 80];
const pitchesFor = yawDeg => {
  const r = headLookRange(null, L, look(yawDeg, 0));
  return [0, 0.25, 0.5, 0.75, 1].map(k => r.pitchMinDeg + (r.pitchMaxDeg - r.pitchMinDeg) * k);
};

check('a held trunk bend leaves the head, and with it the view, where the look puts it', () => {
  let n = 0;
  for (const y of YAWS) for (const p of pitchesFor(y)) {
    const base = headPoseForLook(look(y, p), null, L);
    for (const h of HELD) {
      const got = headPoseForLook(look(y, p), { trunk_flex: h }, L);
      near(got.look.yaw, base.look.yaw, 1e-9, `yaw at look ${y}/${p}, held ${h}`);
      near(got.look.pitch, base.look.pitch, 1e-9, `pitch at look ${y}/${p}, held ${h}`);
      near(got.joints.neck_rot, base.joints.neck_rot, 1e-9, 'neck turn');
      near(got.twistDeg, base.twistDeg, 1e-9, 'chest turn');
      near(got.joints.neck_flex + got.bendDeg, base.joints.neck_flex + base.bendDeg, 1e-9, 'neck bend plus trunk bend');
      assert.ok(got.rollDeg < 1e-4, `the head stays upright (${got.rollDeg})`);
      n += 1;
    }
  }
  assert.equal(n, YAWS.length * 5 * HELD.length);
});

check('the trunk is drawn at its held bend while the neck can take up the difference', () => {
  // Looking up at the trunk area (about 20 degrees) and leaning back 25: the neck bends 5 forward.
  const back = headPoseForLook(look(0, 20), { trunk_flex: -25 }, L);
  near(back.bendDeg, -25, 1e-9, 'lean back');
  near(back.joints.neck_flex, 5, 1e-9, 'neck');
  near(back.heldTrunkDeg, -25, 1e-9, 'held');
  // Looking level and bending forward 40: the neck tilts back 40.
  const fwd = headPoseForLook(look(0, 0), { trunk_flex: 40 }, L);
  near(fwd.bendDeg, 40, 1e-9, 'bend forward');
  near(fwd.joints.neck_flex, -40, 1e-9, 'neck');
  // Looking down far enough, the whole forward bend is drawn.
  const down = headPoseForLook(look(0, -30), { trunk_flex: 60 }, L);
  near(down.bendDeg, 60, 1e-9, 'whole bend');
  near(down.joints.neck_flex, -30, 1e-9, 'neck');
});

check('past the neck\'s range the trunk gives way from its held bend, and the view still does not move', () => {
  // Looking up 20 with the trunk held 60 forward: the neck is fully back (45), so the trunk can only bend 25.
  const base = headPoseForLook(look(0, 20), null, L);
  const got = headPoseForLook(look(0, 20), { trunk_flex: 60 }, L);
  near(got.joints.neck_flex, -L.neckExtDeg, 1e-9, 'neck at the end of its range');
  near(got.bendDeg, 25, 1e-9, 'trunk bend drawn');
  near(got.heldTrunkDeg, 60, 1e-9, 'held bend asked for');
  assert.ok(got.bendDeg < got.heldTrunkDeg);
  near(got.look.pitch, base.look.pitch, 1e-9, 'pitch');
  near(got.look.yaw, base.look.yaw, 1e-9, 'yaw');
  // The other way: looking down 60 with the trunk held back 25: the neck is fully forward (45), the trunk bends 15 forward.
  const lean = headPoseForLook(look(0, -60), { trunk_flex: -25 }, L);
  near(lean.joints.neck_flex, L.neckFlexDeg, 1e-9, 'neck at the end of its range');
  near(lean.bendDeg, 15, 1e-9, 'trunk bend drawn');
});

check('a held bend beyond the trunk\'s range is taken as the end of the range', () => {
  const got = headPoseForLook(look(0, -40), { trunk_flex: 500 }, L);
  near(got.heldTrunkDeg, headBendLimit(0, 1, L), 1e-9, 'held forward');
  const lean = headPoseForLook(look(0, 30), { trunk_flex: -500 }, L);
  near(lean.heldTrunkDeg, -headBendLimit(0, -1, L), 1e-9, 'held back');
});

check('without a held bend the neck bends first and the trunk takes the rest, as before', () => {
  for (const y of YAWS) for (const p of pitchesFor(y)) {
    const got = headPoseForLook(look(y, p), null, L);
    const psi = got.bendDirDeg, f = -p;
    const neck = clamp(f, -L.neckExtDeg, L.neckFlexDeg);
    const bend = clamp(f - neck, -headBendLimit(psi, -1, L), headBendLimit(psi, 1, L));
    near(got.joints.neck_flex, neck, 1e-9, `neck at look ${y}/${p}`);
    near(got.bendDeg, bend, 1e-9, `trunk at look ${y}/${p}`);
    near(got.heldTrunkDeg, 0, 1e-12, 'no held bend');
  }
});

check('the look range does not shift with a held trunk bend', () => {
  for (const y of YAWS) {
    const base = headLookRange(null, L, look(y, 0));
    for (const h of HELD) assert.deepEqual(headLookRange({ trunk_flex: h }, L, look(y, 0)), base, `yaw ${y}, held ${h}`);
    assert.deepEqual(headLookRange({ neck_rot: 0, neck_flex: 0, trunk_flex: 60 }, L, look(y, 0)), base);
  }
});

check('a held neck movement still moves the head and the view, and shifts the look range', () => {
  // "Tilt head back" (the neck held 45 back) with the look level: the view goes up 45.
  const up = headPoseForLook(look(0, 0), { neck_flex: -45 }, L);
  near(up.look.pitch / DEG, 45, 1e-9, 'pitch');
  near(up.joints.neck_flex, -45, 1e-9, 'neck');
  // "Turn head to the left" (the neck held 70 left): the view turns 70 to the left.
  const left = headPoseForLook(look(0, 0), { neck_rot: 70 }, L);
  near(left.look.yaw / DEG, 70, 1e-9, 'yaw');
  const base = headLookRange(null, L, look(0, 0));
  const tilted = headLookRange({ neck_flex: -45 }, L, look(0, 0));
  near(tilted.pitchMinDeg, base.pitchMinDeg - 45, 1e-9, 'lowest look');
  near(tilted.pitchMaxDeg, base.pitchMaxDeg - 45, 1e-9, 'highest look');
  const turned = headLookRange({ neck_rot: 70 }, L, look(0, 0));
  near(turned.yawMinDeg, base.yawMinDeg - 70, 1e-9, 'right end');
  near(turned.yawMaxDeg, base.yawMaxDeg - 70, 1e-9, 'left end');
  // A held neck movement and a held trunk bend together: the view is the neck's alone.
  const both = headPoseForLook(look(0, 0), { neck_flex: -20, trunk_flex: -25 }, L);
  near(both.look.pitch / DEG, 20, 1e-9, 'pitch with both held');
  near(both.bendDeg, -25, 1e-9, 'trunk with both held');
});

check('the card\'s line is due only when a neck movement was taken that moves the view', () => {
  const zero = { neck_rot: 0, neck_flex: 0, trunk_flex: 0 };
  assert.equal(headGoalTaken(null, { ...zero, neck_flex: -60 }), null, 'no earlier frame');
  assert.equal(headGoalTaken(zero, null), null);
  assert.equal(headGoalTaken(zero, { ...zero }), null, 'nothing changed');
  assert.equal(headGoalTaken(zero, { ...zero, neck_flex: -60 }), 'neck_flex', 'tilt head back');
  assert.equal(headGoalTaken(zero, { ...zero, neck_rot: 80 }), 'neck_rot', 'turn head');
  assert.equal(headGoalTaken({ ...zero, neck_flex: -60 }, { ...zero, neck_flex: -60 }), null, 'still held');
  assert.equal(headGoalTaken({ ...zero, neck_flex: -60 }, { ...zero }), null, 'brought back to the start');
  assert.equal(headGoalTaken({ ...zero, neck_flex: -60 }, { ...zero, neck_flex: -60, neck_rot: -80 }), 'neck_rot', 'a second neck movement');
  assert.equal(headGoalTaken(zero, { ...zero, trunk_flex: 80 }), null, 'a trunk bend does not move the view');
  assert.equal(headGoalTaken({ ...zero, trunk_flex: -25 }, { ...zero, trunk_flex: 80 }), null);
});

// Which number key the line names, with the activity's own answer to "would this only bring the part back now?"
// (latchView().back) after real activations of the neck areas.
const keyCase = { ran: false, why: '' };
try {
  const A = createActivity();
  let s = A.step(A.state, [], 2.5); // past the start instructions
  const press = (regionId, actionId) => { s = A.step(s, [{ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 }], 0.05); s = A.step(s, [], 1.6); };
  const rowsOf = id => { const v = A.latchView(s); return infoMoves(region(id), { still: v.still, back: v.back }); };
  const goalOf = () => { const g = { neck_rot: 0, neck_flex: 0, trunk_flex: 0 }; for (const j of A.latchView(s).joints) if (j.jointId in g) g[j.jointId] = j.goalDeg - (Number.isFinite(j.restDeg) ? j.restDeg : 0); return g; };
  const rh = region('rh_neck'), lh = region('lh_neck');
  const nOf = (r, id) => r.actions.findIndex(a => a.id === id) + 1;
  keyCase.start = { goal: goalOf(), key: headBackKey(rowsOf('rh_neck'), rh, 'neck_flex') };
  const g0 = goalOf();
  press('rh_neck', 'rh_neck_extend');
  const g1 = goalOf();
  keyCase.extend = { taken: headGoalTaken(g0, g1), goal: g1.neck_flex, key: headBackKey(rowsOf('rh_neck'), rh, 'neck_flex'), want: nOf(rh, 'rh_neck_flex'),
    turnKey: headBackKey(rowsOf('rh_neck'), rh, 'neck_rot'), otherHalfKey: headBackKey(rowsOf('lh_neck'), lh, 'neck_flex'), otherWant: nOf(lh, 'lh_neck_flex') };
  press('rh_neck', 'rh_neck_turn_left');
  const g2 = goalOf();
  keyCase.turn = { taken: headGoalTaken(g1, g2), goal: g2.neck_rot, sameCardKey: headBackKey(rowsOf('rh_neck'), rh, 'neck_rot'),
    flexKey: headBackKey(rowsOf('rh_neck'), rh, 'neck_flex'), otherHalfKey: headBackKey(rowsOf('lh_neck'), lh, 'neck_rot'), otherWant: nOf(lh, 'lh_neck_turn_right') };
  press('rh_neck', 'rh_neck_flex'); // the named key: the first press brings the head back
  const g3 = goalOf();
  keyCase.back = { taken: headGoalTaken(g2, g3), goal: g3.neck_flex, key: headBackKey(rowsOf('rh_neck'), rh, 'neck_flex') };
  press('rh_trunk', 'rh_trunk_flex');
  const g4 = goalOf();
  keyCase.trunk = { taken: headGoalTaken(g3, g4), goal: g4.trunk_flex };
  keyCase.ran = true;
} catch (error) { keyCase.why = String(error); }

check('the line names the key that brings the head back, and only a key that does', () => {
  assert.ok(keyCase.ran, `the activity ran (${keyCase.why})`);
  assert.equal(keyCase.start.key, 0, 'nothing is held at the start');
  // Tilt head back: the same card's "Bend head forward" brings it back, on either half's neck area.
  assert.equal(keyCase.extend.taken, 'neck_flex');
  assert.ok(keyCase.extend.goal < 0, 'the neck is held back');
  assert.ok(keyCase.extend.want >= 1);
  assert.equal(keyCase.extend.key, keyCase.extend.want);
  assert.equal(keyCase.extend.turnKey, 0, 'no key of this card undoes a head turn');
  assert.equal(keyCase.extend.otherHalfKey, keyCase.extend.otherWant);
  // Turn head to the left, with the tilt still held: its opposite is on the other half's neck area, not on this card.
  assert.equal(keyCase.turn.taken, 'neck_rot');
  assert.ok(keyCase.turn.goal > 0, 'the neck is held to the left');
  assert.equal(keyCase.turn.sameCardKey, 0, 'the card of the turn has no key that turns it back');
  assert.equal(keyCase.turn.flexKey, keyCase.extend.want, 'the tilt keeps its own key');
  assert.ok(keyCase.turn.otherWant >= 1);
  assert.equal(keyCase.turn.otherHalfKey, keyCase.turn.otherWant, 'the other half\'s card has the key');
  // The named key: the neck is back at its start, no new line, and no key is named any more.
  assert.equal(keyCase.back.taken, null);
  near(keyCase.back.goal, 0, 1e-9, 'neck bend goal');
  assert.equal(keyCase.back.key, 0);
  // A trunk bend is not a neck movement.
  assert.equal(keyCase.trunk.taken, null);
  assert.ok(keyCase.trunk.goal > 0, 'the trunk is held forward');
});

check('headBackKey refuses what it cannot answer', () => {
  const rh = region('rh_neck');
  const rows = infoMoves(rh, { back: [`rh_neck/rh_neck_flex`] });
  assert.equal(headBackKey(rows, rh, 'neck_flex'), rh.actions.findIndex(a => a.id === 'rh_neck_flex') + 1);
  assert.equal(headBackKey(rows, rh, 'trunk_flex'), 0, 'the neck card has no trunk movement');
  assert.equal(headBackKey(rows, region('rh_trunk'), 'neck_flex'), 0, 'rows and area do not belong together');
  assert.equal(headBackKey(null, rh, 'neck_flex'), 0);
  assert.equal(headBackKey(rows, null, 'neck_flex'), 0);
  assert.equal(headBackKey(rows, rh, null), 0);
  assert.equal(headBackKey(infoMoves(rh, {}), rh, 'neck_flex'), 0, 'no row is marked');
});

check('the kept card, with the look off the area, keeps the bring-back mark, so the line can name its key', () => {
  // A neck movement throws the view off the neck area: the card is then the kept one (viewed 'last'), or the one of the
  // area still glowing (source 'live'). Both have to carry the mark the card on the area itself has.
  const id = 'rh_neck', rh = region(id);
  const back = [`${id}/rh_neck_flex`], still = [`${id}/rh_neck_extend`];
  const on = { target: 'region', regionId: id, actionId: null, regionActionId: 'rh_neck_extend', hemisphere: 'right', isLeftArm: false, u: null };
  const OFF = { target: 'none', regionId: null, actionId: null };
  const onArea = infoOverlayModel({ gaze: on, bodyMap: BODY_MOTOR_MAP, regionActivity: {}, still, back });
  const want = rh.actions.findIndex(a => a.id === 'rh_neck_flex') + 1;
  assert.equal(headBackKey(onArea.moves, rh, 'neck_flex'), want, 'on the area');
  const kept = infoOverlayModel({ gaze: OFF, bodyMap: BODY_MOTOR_MAP, regionActivity: {}, last: onArea, still, back });
  assert.equal(kept.viewed, 'last');
  assert.equal(kept.movesRegionId, id);
  assert.equal(headBackKey(kept.moves, rh, 'neck_flex'), want, 'kept card');
  assert.equal(kept.moves.find(m => m.id === 'rh_neck_extend').atEnd, true);
  const glowing = infoOverlayModel({ gaze: OFF, bodyMap: BODY_MOTOR_MAP, regionActivity: { [id]: 0.8 }, last: onArea, pulse: { regionId: id, actionId: 'rh_neck_extend' }, still, back });
  assert.equal(glowing.source, 'live');
  assert.equal(headBackKey(glowing.moves, rh, 'neck_flex'), want, 'card of the area still glowing');
});

check('the three lines exist and the key line names its key', () => {
  assert.equal(typeof NT.HUD.headMovedKey, 'function');
  assert.ok(NT.HUD.headMovedKey(2).includes('Press 2'));
  for (const k of ['headTurned', 'headMoved']) assert.ok(typeof NT.HUD[k] === 'string' && NT.HUD[k].length > 20, k);
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'head-hold', module: target.href, cases: results.length, failed: failed.length, results,
  scope: 'pure head, neck and trunk angles for a look with held offsets, the look range, and when and how the status card names the way back; no pixels, timing or biology'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
