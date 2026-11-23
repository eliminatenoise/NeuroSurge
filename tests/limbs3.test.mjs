/** No limb left out of place, no limb sinking in (22 November 2026, round r30, LIMBS3; a check of Body update 67,
 * findings 1 and 3, and the SEEMOVE checks' R7 and N2). Pure checks of ns-limb-pace (the way back of a pushed limb that
 * you choose during the trunk movement, the stop tested before a move is taken) and of ns-app HOLD_BODY's new switches,
 * and the way back through the activity's own events (ns-actions limbPlace, limbPose). They establish what these display
 * rules compute; nothing here says anything about a real joint. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(path.join(repo, 'scene/src/ns-limb-pace.mjs'));
const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));

// ---- finding 1: a pushed leg you choose during the movement still goes back; what you do to it is yours -----------
test('PUSH_BACK chosenKept: the record of a limb you choose goes on; your own change of a joint is carried into where it goes back to', () => {
  const o = P.PUSH_BACK;
  assert.equal(o.chosenKept, true);
  const before = { hip_flex_R: 0, hip_abd_R: 7, knee_ext_R: -6 }, after = { hip_flex_R: 4, hip_abd_R: 15, knee_ext_R: -6 };
  const run = ({ own, keyAt = -1, key = 5, opts = o }) => {
    let rec = P.pushBackAfter(null, before, after, 30), place = { ...after }, most = 0, done = false;
    for (let f = 0; f < 240 && !done; f++) {
      if (f === keyAt) place = { ...place, hip_abd_R: place.hip_abd_R + key }; // (the player's key: the place moves at once)
      const away = Math.max(0, 30 * (1 - (f + 1) / 60));
      const prev = { ...place };
      const b = P.pushBackStep(rec, { place, away, atRest: away === 0, dt: 1 / 60, own }, opts);
      rec = b.rec; place = { ...place, ...b.joints }; done = b.done;
      for (const id of Object.keys(prev)) if (f !== keyAt) most = Math.max(most, Math.abs(place[id] - prev[id]));
    }
    return { place, done, most };
  };
  // chosen, nothing done to it: home exactly, as an unchosen limb
  const plain = run({ own: true });
  assert.equal(plain.done, true); assert.deepEqual(plain.place, before);
  // chosen, a key of +5 on the hip during the way back: the push is undone, the key kept
  const keyed = run({ own: true, keyAt: 20 });
  assert.equal(keyed.done, true);
  assert.ok(Math.abs(keyed.place.hip_abd_R - (before.hip_abd_R + 5)) < 1e-9, `hip_abd_R ends at its place + 5 (${keyed.place.hip_abd_R})`);
  assert.equal(keyed.place.hip_flex_R, before.hip_flex_R);
  assert.ok(keyed.most < 2, `no jump after the key: at most ${keyed.most.toFixed(2)} degrees a frame`);
  // not chosen (another push moved it): taken up and undone with the trunk, as before
  const other = run({ own: false, keyAt: 20 });
  assert.ok(Math.abs(other.place.hip_abd_R - before.hip_abd_R) < 1e-9);
  // the old rule kept behind the switch: own changes nothing
  const old = run({ own: true, keyAt: 20, opts: { ...o, chosenKept: false } });
  assert.ok(Math.abs(old.place.hip_abd_R - before.hip_abd_R) < 1e-9);
  // the record handed back keeps the new places to go to; the one handed in is not changed
  const r0 = P.pushBackAfter(null, before, after, 30), r1 = P.pushBackStep(r0, { place: { ...after, hip_abd_R: 16 }, away: 25, dt: 1 / 60, own: true });
  assert.equal(r0.to.hip_abd_R, 7); assert.equal(r1.rec.to.hip_abd_R, 8);
});

// the same through the activity: the way back sets places only (limbPlace), the player's key is a limbPose
test('PUSH_BACK chosenKept through the activity: a pushed leg chosen and moved with a key ends at its place plus the key', async () => {
  const { createActivity } = await import(path.join(repo, 'scene/src/ns-actions.mjs'));
  const B = await import(path.join(repo, 'scene/src/ns-body.mjs'));
  const H = 1 / 60, REST = B.bodyPostureAngles(B.DEFAULT_BODY_POSTURE), LIM = B.bodyPostureLimits(B.DEFAULT_BODY_POSTURE);
  const J = ['hip_flex_R', 'hip_abd_R', 'knee_ext_R'];
  // (fromPos: the key as the view's hold makes it, from where the joint IS, every frame for 20 frames; own 'delta': the
  // hold's change handed over, as ns-app does)
  const run = (keyAt, own, fromPos = false) => {
    const A = createActivity({ bodyRest: REST, bodyJointLimits: LIM });
    let s = A.step(A.state, [], 2.5); s = A.step(s, [{ type: 'gaze', kind: 'empty', at: 0 }], H);
    const before = {}; for (const j of J) before[j] = s.bodyGoal[j];
    const after = { ...before, hip_abd_R: before.hip_abd_R + 6, hip_flex_R: before.hip_flex_R + 4 };
    s = A.step(s, [{ type: 'limbPose', joints: after }], 0); // (the push: placed at once, as ns-app applyLimbJoints does)
    let rec = P.pushBackAfter(null, before, after, 30), keyed = null;
    for (let f = 0; f < 200 && rec; f++) {
      s = A.stepGated(s, [], H).state;
      let ownNow = own === 'delta' ? {} : own;
      if (!fromPos && f === keyAt) { keyed = { hip_abd_R: s.bodyGoal.hip_abd_R + 3 }; s = A.step(s, [{ type: 'limbPose', joints: keyed }], 0); }
      if (fromPos && f >= keyAt && f < keyAt + 20) {
        const q = { ...after }; for (const j of J) q[j] = s.bodyPos[j]; q.hip_abd_R += 0.15; // (3 degrees in all)
        if (own === 'delta') { ownNow = {}; for (const j of J) ownNow[j] = q[j] - s.bodyPos[j]; }
        s = A.step(s, [{ type: 'limbPose', joints: q }], 0);
      }
      const away = Math.max(0, 30 * (1 - (f + 1) / 60)), b = P.pushBackStep(rec, { place: s.bodyGoal, away, atRest: away === 0, dt: H, own: ownNow });
      rec = b.done ? null : b.rec;
      if (Object.keys(b.joints).length) s = A.step(s, [{ type: 'limbPlace', joints: b.joints }], 0);
    }
    for (let f = 0; f < 60; f++) s = A.stepGated(s, [], H).state;
    return { before, end: Object.fromEntries(J.map(j => [j, s.bodyPos[j]])), done: rec === null };
  };
  const a = run(15, true);
  assert.equal(a.done, true);
  assert.ok(Math.abs(a.end.hip_abd_R - (a.before.hip_abd_R + 3)) < 0.5, `the key's 3 degrees kept (${(a.end.hip_abd_R - a.before.hip_abd_R).toFixed(2)})`);
  assert.ok(Math.abs(a.end.hip_flex_R - a.before.hip_flex_R) < 0.5, 'the push undone');
  const b = run(-1, true);
  for (const j of J) assert.ok(Math.abs(b.end[j] - b.before[j]) < 0.5, `${j} home when nothing is done to it`);
  // the hold's way: the key set from where the joints are, during the way back; handed over as the hold's change, the
  // push is undone and the key kept; read from the places alone, the joints' lag behind the way back counted as the key
  const c = run(10, 'delta', true), d = run(10, true, true);
  assert.equal(c.done, true);
  assert.ok(Math.abs(c.end.hip_abd_R - (c.before.hip_abd_R + 3)) < 0.5, `the key's 3 degrees kept (${(c.end.hip_abd_R - c.before.hip_abd_R).toFixed(2)})`);
  assert.ok(Math.abs(c.end.hip_flex_R - c.before.hip_flex_R) < 0.5, `the push undone (${(c.end.hip_flex_R - c.before.hip_flex_R).toFixed(2)})`);
  assert.ok(Math.abs(d.end.hip_flex_R - d.before.hip_flex_R) > 0.5, `(read from the places alone the push was partly kept: ${(d.end.hip_flex_R - d.before.hip_flex_R).toFixed(2)})`);
});

// ---- finding 3: the stop is tested before a move is taken, so a long frame sinks in no deeper -----------------------
test('LIMB_BLOCK ahead: a move may sink in no deeper than the overlap now or deepM past the first touch; only the share within is taken', () => {
  const o = P.LIMB_BLOCK;
  assert.equal(o.ahead, true);
  assert.ok(o.aheadSteps >= 4 && o.aheadSteps <= 8);
  const slack = app.LIMB_PUSH.slackM;
  assert.ok(Math.abs(P.aheadAllowM(-0.05, slack) - (slack + o.deepM)) < 1e-12, 'apart: down to a first touch plus deepM');
  assert.equal(P.aheadAllowM(0.09, slack), 0.09, 'already deeper: no deeper than now');
  assert.ok(Math.abs(P.aheadAllowM(0.004, 0.006) - (0.006 + o.deepM)) < 1e-12, 'touching: deepM past where they first touched');
  // the check's long frame: a knee that would come 147 mm in from 20 mm apart, with the overlap growing along the move
  const allow = P.aheadAllowM(-0.02, slack), over = s => (-0.02 + 0.167 * s) - allow;
  const share = P.aheadShare(over);
  assert.ok(share > 0 && share < 1);
  assert.ok(over(share) <= o.tolM, 'the share taken is within');
  assert.ok(over(share + 1 / 2 ** o.aheadSteps) > o.tolM - 1e-12, 'and not much short of it');
  const depth = -0.02 + 0.167 * share;
  assert.ok(depth <= slack + o.deepM + o.tolM && depth > 0, `in by ${(depth * 1000).toFixed(1)} mm, not 147`);
  // a move within, along, or away: taken whole
  assert.equal(P.aheadShare(s => -0.01 * s - 0.001), 1);
  assert.equal(P.aheadShare(() => o.tolM / 2), 1);
  // deeper at once however little of it is taken (already at the limit): none of it
  assert.equal(P.aheadShare(() => 0.01), 0);
  // the rule off: whole
  assert.equal(P.aheadShare(over, { ...o, ahead: false }), 1);
  assert.equal(P.aheadShare(null), 1);
});

// ---- N2: a look turned while a newly chosen right arm waits for the trunk --------------------------------------------------
test('HOLD_BODY waitLook is on, and the old behaviour stays behind it', () => {
  assert.equal(app.HOLD_BODY.waitLook, true);
  // the arm still waits for the trunk as before (the take-up rule itself is unchanged)
  assert.equal(app.holdTakeUpWaits({ limb: 'rightArm', fresh: true, trunkAtRest: false }), true);
  assert.equal(app.holdTakeUpWaits({ limb: 'rightLeg', fresh: true, trunkAtRest: false }), false);
});
