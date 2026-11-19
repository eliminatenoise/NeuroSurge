/** The limb turn of a Space double tap (ns-dance) after the owner's note of 17 November 2026: the wrist end of each
 * arm (the forearm) and the far end of each leg lead and make the whole turn; the shoulder only follows a few degrees,
 * from wherever it is. 18 November 2026 (the owner: "the ankles and the feet should be traveling the full 90 degrees
 * either way"): each leg's leader is the leg's own turn (ns-body leg_turn, LEG_TURN), which the rig shares between
 * the foot, the shank and the thigh; the dance's own hip follower turns nothing now (these cases were changed for
 * that: they used to expect the ankle's sole tip as the leader and a hip that followed 10 degrees).
 * 18 November 2026, late (the owner: "with the upper limbs, there should be quite a dramatic change in which muscles
 * are visible between the overside and underside ... That's the whole point of limb rotation."): the whole arm turns
 * over. The upper arm has ends of its own (ns-dance ARM_TURN.shoulder) and turns after the forearm in each stroke; it
 * no longer follows 14 degrees from wherever it is. The cases that expected that follower (at most 15 degrees, from
 * where it is, never winding up past 14) were changed to the new rule, and cases were added for the lag, the
 * narrowed range of a raised arm, the start posture and Reset body.
 * Pure software state on supplied times; no browser, no anatomy validation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDance, startTurnStep, startTurnHold, stepDance, stopDance, observeDance, DANCE, DANCE_LIMBS, DANCE_JOINT_IDS, DANCE_UNDERSIDE, DANCE_OVERSIDE, ARM_TURN, SHOULDER_TURN_RANGE, shoulderTurnRange, shoulderElevationDeg } from '../scene/src/ns-dance.mjs';
import { DANCE_AREAS, DANCE_MUSCLES, DANCE_BODY_JOINTS, createActivity } from '../scene/src/ns-actions.mjs';
import { BODY_POSTURES, BODY_JOINT_LIMITS, COMBINED_RANGE, shoulderCombinedRange } from '../scene/src/ns-body.mjs';
const SH = ARM_TURN.shoulder;

const start = { l_forearm: 80, l_shoulder_rot: 0, r_pronation: 160, r_shoulder_rot: 0, leg_turn_L: 0, hip_rot_L: 0, leg_turn_R: 0, hip_rot_R: 0 };
function run(d, angles, seconds, step = 1 / 60) {
  let a = { ...angles };
  for (let t = 0; t < seconds; t += step) { d = observeDance(d, a); const r = stepDance(d, a, step); d = r.dance; a = r.angles; }
  return { dance: d, angles: a };
}

test('each limb is led by its forearm or its leg turn; the upper arm turns over after the forearm, the hip is turned inside the leg turn', () => {
  for (const [limb, lead, follow] of [['leftArm', 'l_forearm', 'l_shoulder_rot'], ['rightArm', 'r_pronation', 'r_shoulder_rot'], ['leftLeg', 'leg_turn_L', 'hip_rot_L'], ['rightLeg', 'leg_turn_R', 'hip_rot_R']]) {
    assert.equal(DANCE_LIMBS[limb][0].id, lead);
    assert.equal(DANCE_LIMBS[limb][0].follow, undefined);
    assert.equal(DANCE_LIMBS[limb][1].id, follow);
    if (/Arm$/.test(limb)) {
      const fore = DANCE_LIMBS[limb][0], up = DANCE_LIMBS[limb][1];
      assert.equal(up.follow, undefined, 'the upper arm is not a small follower any more');
      assert.deepEqual([up.open, up.closed], [SH.open, SH.closed], 'both arms share the upper arm\'s two ends');
      assert.ok(up.open > 0 && up.closed < 0, 'outward on the underside (with the palm up), inward on the overside');
      assert.ok(up.open <= SHOULDER_TURN_RANGE.hi && up.closed >= SHOULDER_TURN_RANGE.lo, 'inside the shoulder\'s own turn range');
      const upTurn = up.open - up.closed, foreTurn = Math.abs(fore.open - fore.closed);
      // 19 November 2026 (the owner: "You probably overdid it with the internal or medial rotation with the arms"): 60
      // degrees in all (35 outward to 25 inward; 100 before), still enough to show the other side of the upper arm
      assert.ok(upTurn >= 50 && upTurn <= 70, `a turn of the upper arm large enough to show other muscles, without winding the arm in (${upTurn} degrees)`);
      assert.ok(upTurn < foreTurn, 'graded: the forearm turns more than the upper arm');
      assert.ok(fore.phase[0] === 0 && up.phase[0] > 0 && fore.phase[1] < 1 && up.phase[1] === 1, 'the forearm starts first, the upper arm finishes last');
    } else {
      assert.equal(DANCE_LIMBS[limb][1].follow, 0, 'the hip turns inside the leg turn (ns-body LEG_TURN), not as a follower');
      assert.deepEqual([DANCE_LIMBS[limb][0].open, DANCE_LIMBS[limb][0].closed], [25, -65], 'the foot line ends 45 degrees out (a V) and 45 degrees in (an A); it rests 20 out');
      assert.ok(Number.isFinite(1 / (DANCE_LIMBS[limb][1].open - DANCE_LIMBS[limb][1].closed)), 'a follower that turns nothing still has two different nominal ends');
    }
  }
  for (const j of DANCE_BODY_JOINTS) { assert.ok(Array.isArray(DANCE_AREAS[j]) && DANCE_AREAS[j].length, `${j} has an area`); assert.ok(DANCE_MUSCLES[j].open.length && DANCE_MUSCLES[j].closed.length, `${j} has muscles`); }
});

test('one double tap: the forearms, the upper arms and the leg turns go end to end, the hips not at all', () => {
  const r = run(startTurnStep(createDance(start)), start, 3);
  assert.equal(r.dance.mode, null, 'the step ends by itself');
  assert.ok(Math.abs(r.angles.l_forearm - -80) < 1e-6 && Math.abs(r.angles.r_pronation - 0) < 1e-6, 'both palms turned up');
  // all four limbs go to the same side (18 November 2026): with both palms down the limbs are mostly on the overside,
  // so the switch goes to the underside: palms up and the feet 45 degrees outward
  assert.ok(Math.abs(r.angles.leg_turn_L - 25) < 1e-6 && Math.abs(r.angles.leg_turn_R - 25) < 1e-6, 'both feet turned 45 degrees outward');
  assert.ok(Math.abs(r.angles.l_shoulder_rot - SH.open) < 1e-6 && Math.abs(r.angles.r_shoulder_rot - SH.open) < 1e-6, 'both upper arms turned outward to the underside end');
  for (const j of ['hip_rot_L', 'hip_rot_R']) assert.equal(r.angles[j], 0, `${j} is not turned by the dance (the rig turns the thigh inside the leg turn)`);
  for (const j of ['hip_rot_L', 'hip_rot_R']) assert.equal(r.dance.levels[j], 0);
  // the next double tap turns every leader to its other end; a third brings each joint back to where the first left it
  const second = run(startTurnStep(r.dance), r.angles, 3);
  assert.ok(Math.abs(second.angles.l_forearm - 80) < 1e-6 && Math.abs(second.angles.leg_turn_L - -65) < 1e-6 && Math.abs(second.angles.leg_turn_R - -65) < 1e-6, 'and 45 degrees inward');
  assert.ok(Math.abs(second.angles.l_shoulder_rot - SH.closed) < 1e-6 && Math.abs(second.angles.r_shoulder_rot - SH.closed) < 1e-6, 'and the upper arms inward to the overside end');
  const third = run(startTurnStep(second.dance), second.angles, 3);
  for (const j of DANCE_JOINT_IDS) assert.ok(Math.abs(third.angles[j] - r.angles[j]) < 1e-6, `${j} is back where the first stroke left it`);
});

test('an upper arm turned elsewhere joins the side; a hip the player turned stays; narrowed ranges hold', () => {
  const far = { ...start, r_shoulder_rot: 85, hip_rot_L: -38 };
  const r = run(startTurnStep(createDance(far)), far, 3);
  assert.ok(Math.abs(r.angles.r_shoulder_rot - SH.open) < 1e-6, 'the upper arm goes to the side\'s end from wherever it was');
  assert.equal(r.angles.hip_rot_L, -38, 'a hip the player has turned stays where it is');
  // a raised arm (narrowed turn range) is turned only inside it, both ways
  const narrow = { r_shoulder_rot: [-30, 30], l_shoulder_rot: [-30, 30] };
  let dn = startTurnStep(createDance(start)), an = { ...start }, lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 2; k++) {
    for (let t = 0; t < 1.5; t += 1 / 60) { const s2 = stepDance(observeDance(dn, an), an, 1 / 60, { ranges: narrow }); dn = s2.dance; an = s2.angles; lo = Math.min(lo, an.r_shoulder_rot, an.l_shoulder_rot); hi = Math.max(hi, an.r_shoulder_rot, an.l_shoulder_rot); }
    dn = startTurnStep(dn);
  }
  assert.ok(lo >= -30 - 1e-9 && hi <= 30 + 1e-9, `the upper arms stay inside the narrowed range (${lo.toFixed(1)} .. ${hi.toFixed(1)})`);
  for (const j of DANCE_JOINT_IDS) assert.ok(Number.isFinite(r.angles[j]) && Number.isFinite(r.dance.levels[j] ?? 0), `${j} stays finite`);
  // a narrowed range (the feet clearance) holds the hip
  let d = startTurnStep(createDance(start)), a = { ...start };
  for (let t = 0; t < 3; t += 1 / 60) { const s = stepDance(observeDance(d, a), a, 1 / 60, { ranges: { hip_rot_L: [-2, 2], hip_rot_R: [-2, 2] } }); d = s.dance; a = s.angles; }
  assert.ok(Math.abs(a.hip_rot_L) <= 2 + 1e-9 && Math.abs(a.hip_rot_R) <= 2 + 1e-9);
});

test('the slow turn of a double tap held keeps going and stops where it is', () => {
  let r = run(startTurnHold(createDance(start)), start, 9);
  assert.equal(r.dance.mode, 'hold');
  const stopped = stopDance(r.dance);
  assert.equal(stopped.mode, null);
  const after = stepDance(stopped, r.angles, 0.5);
  assert.deepEqual(after.angles, r.angles, 'nothing moves after the key is let go');
  for (const j of ['l_shoulder_rot', 'r_shoulder_rot']) assert.ok(r.angles[j] <= SH.open + 1e-6 && r.angles[j] >= SH.closed - 1e-6, 'the upper arms never wind up past their ends over many strokes');
});

test('the game starts on the underside; a double tap is a quick switch of all four limbs to the overside and back', () => {
  const under = { ...start, ...DANCE_UNDERSIDE };
  assert.deepEqual(DANCE_UNDERSIDE, { l_forearm: -80, l_shoulder_rot: SH.open, r_pronation: 0, r_shoulder_rot: SH.open, leg_turn_L: 25, leg_turn_R: 25 }, 'palms up, upper arms outward, feet 45 degrees outward (a V)');
  assert.deepEqual(DANCE_OVERSIDE, { l_forearm: 80, l_shoulder_rot: SH.closed, r_pronation: 160, r_shoulder_rot: SH.closed, leg_turn_L: -65, leg_turn_R: -65 }, 'palms down, upper arms inward, feet 45 degrees inward (an A)');
  let d = startTurnStep(createDance(under)), a = { ...under }, t = 0;
  assert.equal(d.target, -1, 'from the underside the switch goes to the overside');
  while (d.mode === 'step' && t < 3) { d = observeDance(d, a); const r = stepDance(d, a, 1 / 120); d = r.dance; a = r.angles; t += 1 / 120; }
  assert.ok(t <= DANCE.stepStrokeS + 0.02 && DANCE.stepStrokeS <= 0.5, `a quick switch: every limb there after ${t.toFixed(3)} s`);
  for (const j of Object.keys(DANCE_OVERSIDE)) assert.ok(Math.abs(a[j] - DANCE_OVERSIDE[j]) < 1e-6, `${j} on the overside`);
  const back = run(startTurnStep(d), a, 1);
  for (const j of Object.keys(DANCE_UNDERSIDE)) assert.ok(Math.abs(back.angles[j] - DANCE_UNDERSIDE[j]) < 1e-6, `${j} is back on the underside`);
});

test('limbs on different sides are brought to one side; a second double tap during a switch turns it round', () => {
  // an activation has turned the right palm down; the other three limbs are on the underside
  const mixed = { ...start, ...DANCE_UNDERSIDE, r_pronation: 160 };
  const r = run(startTurnStep(createDance(mixed)), mixed, 1);
  assert.ok(Math.abs(r.angles.r_pronation - 160) < 1e-6, 'the limb already on the overside stays');
  assert.ok(Math.abs(r.angles.l_forearm - 80) < 1e-6 && Math.abs(r.angles.leg_turn_L - -65) < 1e-6, 'the others join it');
  // a second double tap half way turns the switch round
  const under = { ...start, ...DANCE_UNDERSIDE };
  let d = startTurnStep(createDance(under)), a = { ...under };
  for (let t = 0; t < DANCE.stepStrokeS / 2; t += 1 / 120) { d = observeDance(d, a); const s2 = stepDance(d, a, 1 / 120); d = s2.dance; a = s2.angles; }
  assert.ok(a.l_forearm > -70 && a.l_forearm < 70, 'half way');
  d = startTurnStep(d);
  assert.equal(d.target, 1, 'turned round');
  const end = run(d, a, 1);
  for (const j of Object.keys(DANCE_UNDERSIDE)) assert.ok(Math.abs(end.angles[j] - DANCE_UNDERSIDE[j]) < 1e-6, `${j} went back to the underside`);
});

test('a double tap held goes on slowly between the two sides', () => {
  const under = { ...start, ...DANCE_UNDERSIDE };
  let d = startTurnStep(createDance(under)), a = { ...under };
  for (let t = 0; t < 0.1; t += 1 / 120) { d = observeDance(d, a); const s2 = stepDance(d, a, 1 / 120); d = s2.dance; a = s2.angles; }
  d = startTurnHold(d);
  let lo = Infinity, hi = -Infinity, turns = 0, last = a.r_pronation, lastDir = 0;
  for (let t = 0; t < 12; t += 1 / 60) { d = observeDance(d, a); const s2 = stepDance(d, a, 1 / 60); d = s2.dance; a = s2.angles; lo = Math.min(lo, a.r_pronation); hi = Math.max(hi, a.r_pronation); const dir = Math.sign(a.r_pronation - last); if (dir && lastDir && dir !== lastDir) turns++; if (dir) lastDir = dir; last = a.r_pronation; }
  assert.equal(d.mode, 'hold');
  assert.ok(lo < 1 && hi > 159, 'the right forearm reaches both sides');
  // 19 November 2026 (the owner: the slow turn was "far too slow ... quite a bit faster ... but not as fast as" the sudden
  // switch): a stroke is now 1.0 s (2.6 s before), still well over the 0.4 s of a plain double tap
  assert.ok(DANCE.slowStrokeS >= 2 * DANCE.stepStrokeS && DANCE.slowStrokeS <= 1.5, 'between the sudden switch and the old slow turn');
  const most = Math.ceil(12 / (DANCE.slowStrokeS / DANCE.tempo.rightArm)) + 2;
  assert.ok(turns >= 2 && turns <= most, `it turns round steadily (${turns} turns in 12 s, at most ${most})`);
});

test('the forearm leads and the upper arm follows within each stroke; a stroke stopped late still finishes', () => {
  const under = { ...start, ...DANCE_UNDERSIDE };
  let d = startTurnStep(createDance(under)), a = { ...under }, t = 0;
  const trace = [];
  let foreGlow = 0, upGlow = 0;
  while (d.mode === 'step' && t < 2) { d = observeDance(d, a); const r = stepDance(d, a, 1 / 240); d = r.dance; a = r.angles; t += 1 / 240; trace.push({ t, f: a.r_pronation, s: a.r_shoulder_rot, lf: a.l_forearm, ls: a.l_shoulder_rot }); foreGlow = Math.max(foreGlow, d.levels.r_pronation); upGlow = Math.max(upGlow, d.levels.r_shoulder_rot); }
  assert.ok(upGlow > 0 && upGlow <= ARM_TURN.glow + 1e-9 && foreGlow > upGlow, `the upper arm's rotators light less than the forearm's turners (${upGlow.toFixed(2)} vs ${foreGlow.toFixed(2)})`);
  const T = DANCE.stepStrokeS, at = q => trace.reduce((b, x) => (Math.abs(x.t - q * T) < Math.abs(b.t - q * T) ? x : b));
  const early = at(ARM_TURN.lag * 0.9), late = at(1 - ARM_TURN.lag * 0.5);
  assert.ok(early.f > 20 && Math.abs(early.s - SH.open) < 1e-6 && early.lf > -60 && Math.abs(early.ls - SH.open) < 1e-6, 'early in the stroke the forearms turn while the upper arms have not started');
  assert.ok(Math.abs(late.f - 160) < 1e-6 && late.s > SH.closed + 5, 'late in the stroke the forearm is over while the upper arm is still turning');
  // monotonic: no joint turns back during a stroke (no twist inside out)
  for (const k of ['f', 's', 'lf', 'ls']) { const dir = Math.sign(trace[trace.length - 1][k] - trace[0][k]); for (let i = 1; i < trace.length; i++) assert.ok(dir * (trace[i][k] - trace[i - 1][k]) >= -1e-9, `${k} turns one way only`); }
  // a slow turn stopped while only the upper arm is still moving: held again, the limb first finishes that turn (its
  // forearm is already at the end, so the stroke is measured on the upper arm) before it turns back
  let h = startTurnHold(createDance(under)), b = { ...under };
  for (let q = 0; q < DANCE.slowStrokeS / DANCE.tempo.rightArm * (1 - ARM_TURN.lag * 0.5); q += 1 / 120) { h = observeDance(h, b); const r = stepDance(h, b, 1 / 120); h = r.dance; b = r.angles; }
  assert.ok(Math.abs(b.r_pronation - 160) < 1e-6 && b.r_shoulder_rot > SH.closed + 1 && b.r_shoulder_rot < SH.open - 1, 'stopped with the right forearm over and its upper arm half way');
  h = startTurnHold(stopDance(h));
  let reached = false, foreBack = false;
  for (let q = 0; q < DANCE.slowStrokeS; q += 1 / 120) {
    h = observeDance(h, b); const r = stepDance(h, b, 1 / 120); h = r.dance; b = r.angles;
    // (in the step where the upper arm arrives, the forearm may already start back with the next stroke)
    if (Math.abs(b.r_shoulder_rot - SH.closed) < 1e-6) reached = true;
    if (!reached && b.r_pronation < 160 - 1e-6) foreBack = true;
  }
  assert.ok(reached && !foreBack, 'the right upper arm finishes its turn before the forearm turns back');
});

test('the upper arm\'s narrowed turn range and the start posture agree with ns-body', () => {
  assert.deepEqual([SHOULDER_TURN_RANGE.lo, SHOULDER_TURN_RANGE.hi], [...BODY_JOINT_LIMITS.r_shoulder_rot], 'the same joint range as ns-body');
  assert.equal(SHOULDER_TURN_RANGE.atFullElevationDeg, COMBINED_RANGE.shoulder.rotAtFullElevationDeg, 'the same narrowing as the combined-range rule');
  for (const f of [-40, 0, 37, 60, 90, 120, 150, 180]) for (const ab of [0, 8, 45, 90, 135, 180]) {
    const body = shoulderCombinedRange(f, ab).rot, mine = shoulderTurnRange(shoulderElevationDeg(Math.max(f, shoulderCombinedRange(f, ab).flexMin), Math.min(ab, shoulderCombinedRange(f, ab).abdMax)));
    assert.ok(Math.abs(body[0] - mine[0]) < 1e-9 && Math.abs(body[1] - mine[1]) < 1e-9, `flex ${f} abd ${ab}: ${body} vs ${mine}`);
  }
  for (const [j, v] of Object.entries(DANCE_UNDERSIDE)) if (j in BODY_JOINT_LIMITS) assert.equal(BODY_POSTURES.open[j], v, `the start posture holds ${j} at the underside end`);
});

test('the activity starts on the underside with both upper arms outward; a switch turns both over; Reset body returns there; a raised right arm turns less', () => {
  const rest = { ...BODY_POSTURES.open };
  const A = createActivity({ bodyRest: rest });
  let s = A.step(A.state, [], 2.5);
  const view = () => A.danceView(s).angles;
  let v = view();
  assert.ok(Math.abs(v.l_shoulder_rot - SH.open) < 1e-9 && Math.abs(v.r_shoulder_rot - SH.open) < 1e-9 && Math.abs(v.l_forearm - -80) < 1e-6 && Math.abs(v.r_pronation) < 1e-9, `start: ${JSON.stringify(v)}`);
  s = A.step(s, [{ type: 'turn', phase: 'step' }], 0.02); s = A.step(s, [], 1.0);
  v = view();
  for (const [j, e] of Object.entries(DANCE_OVERSIDE)) assert.ok(Math.abs(v[j] - e) < 1e-3, `after a double tap ${j} = ${v[j]} (overside ${e})`);
  s = A.step(s, [{ type: 'turn', phase: 'step' }], 0.02); s = A.step(s, [], 1.0);
  v = view();
  for (const [j, e] of Object.entries(DANCE_UNDERSIDE)) assert.ok(Math.abs(v[j] - e) < 1e-3, `after the second ${j} = ${v[j]} (underside ${e})`);
  s = A.step(s, [{ type: 'turn', phase: 'step' }], 0.02); s = A.step(s, [], 1.0);
  s = A.step(s, [{ type: 'reset' }], 0.02); s = A.step(s, [], 0.1);
  v = view();
  for (const [j, e] of Object.entries(DANCE_UNDERSIDE)) assert.ok(Math.abs(v[j] - e) < 1e-3, `Reset body: ${j} = ${v[j]} (underside ${e})`);
  // the right arm raised straight up: its upper arm turns only inside +-30 (ns-body COMBINED_RANGE.shoulder)
  const B = createActivity({ bodyRest: { ...rest, r_shoulder_flex: 180, r_shoulder_abd: 0 } });
  let u = B.step(B.state, [], 2.5);
  u = B.step(u, [{ type: 'turn', phase: 'step' }], 0.02); u = B.step(u, [], 1.0);
  // (the raised arm's range is -30..30; the overside end is now -25, inside it)
  assert.ok(Math.abs(B.danceView(u).angles.r_shoulder_rot - Math.max(-30, SH.closed)) < 1e-6, `raised arm on the overside: ${B.danceView(u).angles.r_shoulder_rot}`);
  u = B.step(u, [{ type: 'turn', phase: 'step' }], 0.02); u = B.step(u, [], 1.0);
  assert.ok(Math.abs(B.danceView(u).angles.r_shoulder_rot - 30) < 1e-6, `raised arm back on the underside: ${B.danceView(u).angles.r_shoulder_rot}`);
});

test('the game arm\'s upper-arm turn narrows with the arm raised, as the right arm\'s does', async () => {
  const { humeralRangeAt, HUMERAL_ROTATION_RANGE_DEG } = await import('../scene/src/ns-arm.mjs');
  const S = [0, 0, 0];
  assert.deepEqual(humeralRangeAt([0, -0.5, 0], S), [...HUMERAL_ROTATION_RANGE_DEG], 'hanging: the whole range');
  assert.deepEqual(humeralRangeAt([0, 0, -0.5], S), [...HUMERAL_ROTATION_RANGE_DEG], 'forward at shoulder height: the whole range');
  const up = humeralRangeAt([0, 0.5, 0], S);
  assert.ok(Math.abs(up[0] - -30) < 1e-9 && Math.abs(up[1] - 30) < 1e-9, `straight up: +-30 (${up})`);
  const mid = humeralRangeAt([0, Math.sin(Math.PI / 4), -Math.cos(Math.PI / 4)], S);
  assert.ok(Math.abs(mid[0] - shoulderTurnRange(135)[0]) < 1e-9 && Math.abs(mid[1] - shoulderTurnRange(135)[1]) < 1e-9, 'half way up: the right arm\'s range at the same elevation');
  // the turn's two ends fit the whole range, and at full elevation they are cut to +-30, never past
  assert.ok(SH.open <= HUMERAL_ROTATION_RANGE_DEG[1] && SH.closed >= HUMERAL_ROTATION_RANGE_DEG[0]);
});
