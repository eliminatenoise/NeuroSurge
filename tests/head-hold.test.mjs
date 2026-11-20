/** The view under a held trunk or neck movement (user Messages 1, 55 and 56: the head jerks with the neck areas; the
 * game has to be easier to use; a learning tool). A held trunk bend (the trunk area: bend forward / lean back) moves the
 * trunk under the head and the neck takes up the difference, so the view keeps its direction and stays on the area. A
 * held neck movement still moves the head and the view with it, and the status card then says so.
 * Pure parts are checked here: ns-app headPoseForLook (the head's direction, the neck and the trunk for a look and
 * offsets: a trunk or neck movement under way), headLookRange (the look range that goes with them). No scene, model,
 * browser or native fixture. These cases establish angles and list contents only, never pixels, timing or biology; the
 * angle limits are the game's own simplified ranges.
 * 20 November 2026 (the owner, Message 206: "no permanent movements ... it will contract, then return to its previous
 * place"): headGoalTaken and headBackKey (the status card's line that a HELD neck movement had turned the head, and the
 * number key that brought it back, from ns-actions latchView().back) and their three lines in ns-text are gone with
 * the latch. Their cases are restated below: a neck movement now contracts and returns by itself, so there is no held
 * head, no bring-back key and no such line.
 * Run: node tests/head-hold.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-app.mjs', import.meta.url);
const app = await import(target.href);
const { BODY_MOTOR_MAP } = await import(new URL('../scene/src/ns-bodymap.mjs', import.meta.url).href);
const { createActivity } = await import(new URL('../scene/src/ns-actions.mjs', import.meta.url).href);
const NT = await import(new URL('../scene/src/ns-text.mjs', import.meta.url).href);
const { HEAD_LOOK, headPoseForLook, headLookRange, headBendLimit, infoMoves, infoOverlayModel } = app;
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
      // 19 November 2026: a look no longer bends the trunk; where the neck cannot take up a held bend the eyes do
      // (the view, checked above, stays put; the head itself may point elsewhere).
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

check('past the neck\'s range the trunk stays at its held bend and the eyes take the rest: the view still does not move', () => {
  // 19 November 2026 (a look no longer bends the trunk). Looking up 20 with the trunk held 60 forward: the neck is
  // fully back (45) and the trunk stays at 60; the eyes look up the remaining 35.
  const base = headPoseForLook(look(0, 20), null, L);
  const got = headPoseForLook(look(0, 20), { trunk_flex: 60 }, L);
  near(got.joints.neck_flex, -L.neckExtDeg, 1e-9, 'neck at the end of its range');
  near(got.bendDeg, 60, 1e-9, 'trunk bend drawn');
  near(got.heldTrunkDeg, 60, 1e-9, 'held bend asked for');
  near(got.look.pitch, base.look.pitch, 1e-9, 'pitch');
  near(got.look.yaw, base.look.yaw, 1e-9, 'yaw');
  // The other way: looking down 60 with the trunk held back 25: the neck is fully forward (45), the trunk stays back.
  const lean = headPoseForLook(look(0, -60), { trunk_flex: -25 }, L);
  near(lean.joints.neck_flex, L.neckFlexDeg, 1e-9, 'neck at the end of its range');
  near(lean.bendDeg, -25, 1e-9, 'trunk bend drawn');
});

check('a held bend beyond the trunk\'s range is taken as the end of the range', () => {
  const got = headPoseForLook(look(0, -40), { trunk_flex: 500 }, L);
  near(got.heldTrunkDeg, headBendLimit(0, 1, L), 1e-9, 'held forward');
  const lean = headPoseForLook(look(0, 30), { trunk_flex: -500 }, L);
  near(lean.heldTrunkDeg, -headBendLimit(0, -1, L), 1e-9, 'held back');
});

check('without a held bend the neck bends and the trunk does not: a look never bends the trunk', () => {
  for (const y of YAWS) for (const p of pitchesFor(y)) {
    const got = headPoseForLook(look(y, p), null, L);
    const f = -p;
    near(got.joints.neck_flex, clamp(f, -L.neckExtDeg, L.neckFlexDeg), 1e-9, `neck at look ${y}/${p}`);
    near(got.bendDeg, 0, 1e-9, `trunk at look ${y}/${p}`);
    near(got.twistDeg, 0, 1e-9, `chest at look ${y}/${p}`);
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

check('a held neck movement moves the head, and the view stays on the look', () => {
  // 19 November 2026: "Tilt head back" (the neck held 45 back) with the look level: the head goes back 45, the eyes
  // look 45 down in the head, and the view stays level.
  const up = headPoseForLook(look(0, 0), { neck_flex: -45 }, L);
  near(up.look.pitch / DEG, 0, 1e-9, 'pitch');
  near(up.joints.neck_flex, -45, 1e-9, 'neck');
  near(up.headLook.pitch / DEG, 45, 1e-9, 'the head itself');
  // "Turn head to the left" (the neck held 70 left): the head turns, the view does not.
  const left = headPoseForLook(look(0, 0), { neck_rot: 70 }, L);
  near(left.look.yaw / DEG, 0, 1e-9, 'yaw');
  near(left.joints.neck_rot, 70, 1e-9, 'neck turn');
  const both = headPoseForLook(look(0, 0), { neck_flex: -20, trunk_flex: -25 }, L);
  near(both.look.pitch / DEG, 0, 1e-9, 'pitch with both held');
  near(both.bendDeg, -25, 1e-9, 'trunk with both held');
});

// 20 November 2026 (Message 206): real activations of the neck and trunk areas, followed until they have returned.
const neckCase = { ran: false, why: '' };
try {
  const A = createActivity();
  let s = A.step(A.state, [], 2.5); // past the start instructions
  const H = 1 / 60;
  const press = (regionId, actionId, joint) => {
    const from = s.bodyPos[joint]; let far = 0;
    s = A.step(s, [{ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 }], H);
    for (let i = 0; i < 150; i++) { s = A.step(s, [], H); if (Math.abs(s.bodyPos[joint] - from) > Math.abs(far)) far = s.bodyPos[joint] - from; }
    return { far, end: s.bodyPos[joint], goal: s.bodyGoal[joint] };
  };
  neckCase.extend = press('rh_neck', 'rh_neck_extend', 'neck_flex');
  neckCase.turn = press('rh_neck', 'rh_neck_turn_left', 'neck_rot');
  neckCase.trunk = press('rh_trunk', 'rh_trunk_flex', 'trunk_flex');
  neckCase.rows = infoMoves(region('rh_neck'), {});
  neckCase.ran = true;
} catch (error) { neckCase.why = String(error); }

check('a neck or trunk movement from the strip contracts and returns: nothing is held, so nothing has to be brought back', () => {
  assert.ok(neckCase.ran, `the activity ran (${neckCase.why})`);
  assert.ok(neckCase.extend.far < -40, `tilt head back tips the head back (${neckCase.extend.far})`);
  assert.equal(neckCase.extend.end, 0, 'and it returns to the start');
  assert.equal(neckCase.extend.goal, 0, 'its place never changed');
  assert.ok(neckCase.turn.far > 40, `turn head to the left turns it (${neckCase.turn.far})`);
  assert.equal(neckCase.turn.end, 0, 'and it turns back by itself (no key on the other half is needed)');
  assert.ok(neckCase.trunk.far > 20, `the trunk bends forward (${neckCase.trunk.far})`);
  assert.equal(neckCase.trunk.end, 0, 'and comes back');
  assert.ok(neckCase.rows.every(m => m.back === undefined && m.atEnd === false), 'no row of the neck card is a bring-back or "already there"');
});

check('the held-head line and its bring-back key are gone with the latch', () => {
  assert.equal(app.headGoalTaken, undefined);
  assert.equal(app.headBackKey, undefined);
  for (const k of ['headMovedKey', 'headTurned', 'headMoved']) assert.equal(NT.HUD[k], undefined, k);
  // the kept card of the neck area (the look thrown off it) still lists its movements, none of them marked
  const id = 'rh_neck';
  const on = { target: 'region', regionId: id, actionId: null, regionActionId: 'rh_neck_extend', hemisphere: 'right', isLeftArm: false, u: null };
  const onArea = infoOverlayModel({ gaze: on, bodyMap: BODY_MOTOR_MAP, regionActivity: {} });
  const kept = infoOverlayModel({ gaze: { target: 'none', regionId: null, actionId: null }, bodyMap: BODY_MOTOR_MAP, regionActivity: {}, last: onArea });
  assert.equal(kept.viewed, 'last');
  assert.equal(kept.movesRegionId, id);
  assert.ok(kept.moves.length > 0 && kept.moves.every(m => !m.atEnd && m.back === undefined));
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'head-hold', module: target.href, cases: results.length, failed: failed.length, results,
  scope: 'pure head, neck and trunk angles for a look with offsets, the look range, and (Message 206) that a neck or trunk movement returns by itself with no bring-back line; no pixels, timing or biology'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
