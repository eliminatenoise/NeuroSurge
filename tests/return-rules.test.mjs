/** Every movement from the brain returns, and returns unlit; a limb that rejoins its place glides (20 November 2026,
 * night: the review of Body updates 60 and 61, findings R1 to R5 and R10).
 * The owner, Message 206: "I think it's better actually if there are no permanent movements ... when you tap any area of
 * the brain, you activate any area, it will contract, then return to its previous place. But in returning to its
 * previous place, you won't see corresponding activity and muscle activation. It will just return." Message 207: "The
 * limb should never get stuck."
 * Pure rules of ns-app (lookShareOf, trunkContactStop, freeHandKeptPlace, rejoinShare, holdRejoinDue) and the activity
 * (ns-actions createActivity, the 'contractStop' event), with the game's own start posture and joint limits (ns-body),
 * the placeholder arm rig and the body loaded from disk (tools/load-body.mjs) where a solve is needed. Angles, places and
 * counts of the game's own rules only; nothing here is measured. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const body = await import(path.join(repo, 'scene/src/ns-body.mjs'));
const { createActivity, SHOULDER_ACTION_DEG } = await import(path.join(repo, 'scene/src/ns-actions.mjs'));
const arm = await import(path.join(repo, 'scene/src/ns-arm.mjs'));
const { buildPlaceholderArm } = await import(path.join(repo, 'scene/src/ns-placeholder.mjs'));
const { deriveRig, segmentBoxes } = await import(path.join(repo, 'scene/src/ns-rig.mjs'));
const G = await import(path.join(repo, 'scene/src/ns-grasp.mjs'));
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { headPoseForLook, headLookLimits, HEAD_LOOK, lookShareOf, trunkContactStop, freeHandKeptPlace, shoulderSwing, rejoinShare, holdRejoinDue, holdProbeDue, LIMB_KEYS, MAX_FRAME_DT } = app;

const H = 1 / 60, DEG = Math.PI / 180;
const REST = body.bodyPostureAngles(body.DEFAULT_BODY_POSTURE), LIM = body.bodyPostureLimits(body.DEFAULT_BODY_POSTURE);
// (the head's limits exactly as ns-app builds them: headLookLimits(mods.body, HEAD_LOOK, headRest))
const headRest = { neck_flex: REST.neck_flex || 0, trunk_flex: REST.trunk_flex || 0, neck_rot: REST.neck_rot || 0, pelvic_tilt: REST.pelvic_tilt || 0, trunkFlexMaxDeg: LIM.trunk_flex[1] };
const L = headLookLimits(body, HEAD_LOOK, headRest);
const press = (regionId, actionId) => ({ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 });
function started() {
  const A = createActivity({ bodyRest: REST, bodyJointLimits: LIM });
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [{ type: 'gaze', kind: 'empty', at: 0 }], H);
  return { A, s };
}

test('R1: a trunk movement from the brain never moves the look\'s own neck share, at any look, while it contracts or returns', () => {
  assert.equal(L.neckFlexDeg, 10, 'the bowed start posture leaves the neck 10 degrees of forward bend (the clamp the review found)');
  for (const actionId of ['rh_trunk_flex', 'rh_trunk_extend']) {
    const { A, s } = started();
    let t = A.stepGated(s, [press('rh_trunk', actionId)], H).state;
    const held = [];
    for (let i = 0; i < 150; i++) { t = A.stepGated(t, [], H).state; held.push(A.bodyJointTargets(t).trunk_flex - headRest.trunk_flex); }
    assert.ok(Math.max(...held.map(Math.abs)) > 15, `${actionId} moves the trunk`);
    for (const pitchDeg of [20.3, 0, -25.5, -41, -60, -70]) {
      const look = { yaw: 0, pitch: pitchDeg * DEG };
      const base = lookShareOf(headPoseForLook(look, null, L)).flex;
      for (const tb of held) {
        const f = lookShareOf(headPoseForLook(look, { neck_rot: 0, neck_flex: 0, trunk_flex: tb }, L)).flex;
        assert.ok(Math.abs(f - base) < 1e-9, `${actionId} at a look ${pitchDeg} degrees: the neck share stays ${base.toFixed(2)} (got ${f.toFixed(2)} with the trunk at ${tb.toFixed(1)})`);
      }
    }
  }
});

test('R1: the look itself still moves the neck share as before (no trunk bend held: the eye\'s own neck)', () => {
  let changed = 0, prev = null;
  for (let p = -80; p <= 80; p += 5) {
    const head = headPoseForLook({ yaw: 0.3, pitch: p * DEG }, null, L);
    assert.ok(Math.abs(lookShareOf(head).flex - head.eyeJoints.neck_flex) < 1e-9, `look ${p}: the same as before with no held bend`);
    if (prev !== null && Math.abs(lookShareOf(head).flex - prev) > 1e-6) changed++;
    prev = lookShareOf(head).flex;
  }
  assert.ok(changed > 10, 'and it follows the look up and down');
});

test('R2: the trunk\'s contact stop is a contractStop at the absolute angle, only for a contraction under way', () => {
  const wall = 12; // degrees of forward bend from the start posture where the head would meet the brain (a stand-in)
  const clear = (a, b) => k => a + (b - a) * k <= wall;
  assert.equal(trunkContactStop(5, 20, -5, false, clear(5, 20), 12), null, 'a return (no contraction under way) is never stopped');
  assert.equal(trunkContactStop(5, 10, -5, true, clear(5, 10), 12), null, 'a bend that stays clear is not stopped');
  assert.equal(trunkContactStop(15, 20, -5, true, clear(15, 20), 12), null, 'not when the head was in contact before the bend');
  assert.equal(trunkContactStop(5, 5, -5, true, clear(5, 5), 12), null, 'nothing moved');
  const st = trunkContactStop(5, 20, -5, true, clear(5, 20), 12);
  assert.equal(st.event.type, 'contractStop');
  assert.ok(Math.abs((st.deg - -5) - wall) < 0.01, `stopped at the wall, counted from the start posture (${(st.deg + 5).toFixed(3)})`);
  assert.equal(st.event.joints.trunk_flex, st.deg, 'the angle given is the absolute one (the start posture\'s own -5 added)');
});

test('R2: a trunk contraction stopped by contact holds there for its contraction, then returns to its place, and a later movement returns there too', () => {
  const { A, s } = started();
  const wall = 12;
  let t = A.stepGated(s, [press('rh_trunk', 'rh_trunk_flex')], H).state;
  let drawn = t.bodyPos.trunk_flex - REST.trunk_flex, stops = 0, furthest = -Infinity;
  const run = [];
  for (let i = 0; i < 300; i++) {
    t = A.stepGated(t, [], H).state;
    const a = drawn, b = t.bodyPos.trunk_flex - REST.trunk_flex, jk = t.bodyJerk.trunk_flex;
    const st = trunkContactStop(a, b, REST.trunk_flex, Array.isArray(jk) && jk[1] > 0, k => a + (b - a) * k <= wall, 12);
    if (st) { t = A.step(t, [st.event], 0); stops++; }
    drawn = t.bodyPos.trunk_flex - REST.trunk_flex; furthest = Math.max(furthest, drawn);
    run.push({ off: drawn, view: A.motionView(t), lit: t.regionActivity.rh_trunk || 0 });
  }
  assert.equal(stops, 1, 'stopped once');
  assert.ok(furthest <= wall + 1e-6 && furthest > wall - 0.5, `never past the wall (${furthest.toFixed(2)})`);
  const held = run.filter(r => r.view.contracting.includes('trunk_flex'));
  assert.ok(held.length > 10 && held.slice(3).every(r => Math.abs(r.off - wall) < 0.5), 'held at the stop while its contraction runs');
  assert.ok(run.filter(r => r.view.returning.includes('trunk_flex')).every(r => r.lit < 0.05), 'the return is unlit');
  assert.equal(t.bodyPos.trunk_flex, REST.trunk_flex, 'back at the start posture');
  assert.equal(t.bodyGoal.trunk_flex, REST.trunk_flex, 'its place never changed');
  let u = A.stepGated(t, [press('rh_trunk', 'rh_trunk_extend')], H).state;
  for (let i = 0; i < 150; i++) u = A.stepGated(u, [], H).state;
  assert.equal(u.bodyPos.trunk_flex, REST.trunk_flex, '"Lean trunk back" afterwards returns to the start posture, not to the stopped bend');
});

test('R2: contractStop leaves a returning joint and a joint at rest alone', () => {
  const { A, s } = started();
  assert.equal(A.step(s, [{ type: 'contractStop', joints: { trunk_flex: 10 }, at: 0 }], 0).bodyPos.trunk_flex, REST.trunk_flex, 'at rest: nothing');
  let t = A.stepGated(s, [press('rh_trunk', 'rh_trunk_flex')], H).state;
  while (A.motionView(t).contracting.includes('trunk_flex')) t = A.stepGated(t, [], H).state;
  const before = t.bodyPos.trunk_flex;
  assert.equal(A.step(t, [{ type: 'contractStop', joints: { trunk_flex: REST.trunk_flex + 30 }, at: 0 }], 0).bodyPos.trunk_flex, before, 'returning: never stopped');
  assert.throws(() => A.step(s, [{ type: 'contractStop', joints: { not_a_joint: 1 }, at: 0 }], 0), /not a body joint/);
});

// The free hand's kept place under a left-shoulder swing (the real fitHandAt on the placeholder arm rig).
const pa = buildPlaceholderArm(), rig = deriveRig(pa.bones, pa.rigOptions), BOX = segmentBoxes(rig, pa.bones);
const vp = { aspect: 16 / 9, fovYDeg: 60 };
const place = (e, p, d) => [-Math.cos(p * DEG) * Math.sin(e * DEG) * d, -Math.cos(e * DEG) * d, -Math.sin(p * DEG) * Math.sin(e * DEG) * d];
const fitAt = (ask, kept, swing) => arm.fitHandAt(rig, BOX, { handBodyM: ask, joints: {}, elbowSideBodyM: arm.freeHandPole(ask), stayBodyM: swing ? swing.turn(kept) : kept }, vp, {});
const REACH = arm.fitHandAt(rig, BOX, { handBodyM: arm.FREE_HAND.startBodyM, joints: {} }, vp, {}).reachM;

test('R3 / R10: a left-shoulder swing that leaves the shoulder\'s range never moves the hand\'s kept place: the arm comes back', () => {
  const S = SHOULDER_ACTION_DEG;
  let clampedCases = 0;
  for (const [e, p, f] of [[40, 150, 0.94], [120, 134, 0.86], [60, -60, 0.9], [60, -90, 0.9], [45, -100, 0.9], [47.5, 57, 0.9]]) {
    const K = place(e, p, REACH * f);
    for (const [name, lift, out] of [['raise forward', S.lift, 0], ['down and back', -S.drop, 0], ['out', 0, S.out], ['across', 0, -S.across]]) {
      let kept = K.slice(), clamped = 0;
      for (let fr = 0; fr <= 40; fr++) {
        const d = fr <= 20 ? fr / 20 : (40 - fr) / 20, swing = shoulderSwing(lift * d, out * d), ask = swing ? swing.turn(kept) : kept;
        const fit = fitAt(ask, kept, swing);
        if (fit.clamped.shoulder) clamped++;
        kept = freeHandKeptPlace(fit, kept, kept, swing);
      }
      if (clamped > 0) clampedCases++;
      // (within a nanometre: a place exactly on the range's end is put back on it with rounding when no swing is on)
      const off = Math.hypot(kept[0] - K[0], kept[1] - K[1], kept[2] - K[2]);
      assert.ok(off < 1e-9, `elevation ${e}, plane ${p}, "${name}" (${clamped} frames outside the range): the kept place is where the player put it (${(off * 1000).toFixed(1)} mm off)`);
    }
  }
  assert.ok(clampedCases >= 8, `the cases include swings the range clamps (${clampedCases})`);
});

test('R3 / R10: without a swing the kept-place rule is the one it was; with a swing a key still moves the place', () => {
  const oldRule = (fit, kept, want) => {
    let rel = fit.clamped.inner ? kept : fit.clamped.shoulder ? fit.askedBodyM : want;
    if (!fit.elbow && !fit.clamped.inner) { const got = fit.handBodyM, off = rel.map((v, i) => v - got[i]), n = Math.hypot(...off); if (n > arm.FREE_HAND.leadM) rel = got.map((v, i) => v + off[i] * arm.FREE_HAND.leadM / n); }
    return rel;
  };
  for (let e = 10; e <= 170; e += 40) for (let p = -120; p <= 180; p += 60) for (const f of [0.3, 0.9, 1.2]) {
    const K = place(e, p, REACH * 0.8), W = place(e, p + 5, REACH * f), fit = fitAt(W, K, null);
    assert.deepEqual(freeHandKeptPlace(fit, K, W, null), oldRule(fit, K, W), `no swing: elevation ${e}, plane ${p}, ${f}`);
  }
  const K = place(60, 60, REACH * 0.8), W = K.map((v, i) => v + [0.01, 0, -0.01][i]), swing = shoulderSwing(30, 0);
  const got = freeHandKeptPlace(fitAt(swing.turn(W), K, swing), K, W, swing);
  assert.ok(Math.hypot(got[0] - W[0], got[1] - W[1], got[2] - W[2]) < 1e-9, 'a key move during a swing is taken');
});

test('R4: a rejoin is never faster than rejoinMps on any frame (rejoinShare)', () => {
  const V = LIMB_KEYS.view;
  assert.equal(rejoinShare(0.01, H, V), 1, 'a move within the speed is taken whole');
  assert.ok(Math.abs(rejoinShare(0.4, H, V) * 0.4 - V.rejoinMps * H) < 1e-12, 'a big move is cut to rejoinMps x dt');
  assert.ok(Math.abs(rejoinShare(1, 1, V) - V.rejoinMps * MAX_FRAME_DT) < 1e-12, 'a long frame counts as MAX_FRAME_DT');
  assert.equal(rejoinShare(1, 0, V), 1, 'no time, no cut (as before)');
});

test('R4: a leg left lifted by the look glides back to its place at rejoinMps, the last frames included', async () => {
  const { body: B, rig: R, baked } = await loadBody(repo);
  const V = LIMB_KEYS.view, opts = { anchor: 'pelvis', baked, holdChest: false };
  const asDrawn = q => B.poseBodySegments(R, B.softExtensionAngles(B.passiveKneeAngles(q)), opts);
  const limits = B.bodyPostureLimits(baked), project = t => B.clampBodyJointTargets(t).applied, start = project(B.bodyPostureAngles(baked));
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const limb = 'leftLeg', c = G.LIMB_CHAIN[limb];
  for (const T of [G.limbPoint(R, asDrawn(start), limb, 'end'), G.limbPoint(R, asDrawn(project({ ...start, hip_flex_L: 75, hip_abd_L: -5 })), limb, 'end')]) {
    let q = project({ ...start, hip_flex_L: 110, hip_abd_L: -5 }), end = G.limbPoint(R, asDrawn(q), limb, 'end'), lastErr = 100, chase = true, fastest = 0, frames = 0;
    const memo = {}, gap0 = d(T, end);
    // (the hold's rejoin as stepLimbHold runs it: TRACK / FOLLOW solves, the wait test, then rejoinShare on every frame)
    while (chase && frames < 400) {
      const gap = d(T, end), close = lastErr < 12 && gap < 60;
      let r = G.solveLimb({ rig: R, segmentsFor: asDrawn, targets: q, limb, targetMm: T, limits: G.holdLimits(limits, limb, q), opts: close ? G.LIMB_HOLD_FOLLOW : G.LIMB_HOLD_TRACK, project, memo });
      lastErr = r.errorMm;
      let beyond = false, cut = false;
      if (r.errorMm > V.waitMm && r.errorMm > gap * V.waitShare) { beyond = !(gap - r.errorMm > 1); if (beyond) chase = false; }
      if (!beyond && chase) {
        const k = rejoinShare(d(r.endMm, end) / 1000, H, V);
        if (k < 1) { const qq = { ...q }; for (const id of c.joints) qq[id] = q[id] + (r.joints[id] - q[id]) * k; const qp = project(qq), joints = {}; for (const id of c.joints) joints[id] = qp[id]; const endMm = G.limbPoint(R, asDrawn({ ...q, ...joints }), limb, 'end'); r = { ...r, joints, endMm, errorMm: d(T, endMm) }; cut = true; }
      }
      if (!beyond && !cut && r.errorMm <= V.waitMm) chase = false;
      if (beyond) break;
      fastest = Math.max(fastest, d(r.endMm, end)); frames++;
      q = { ...q, ...r.joints }; end = r.endMm;
    }
    assert.ok(fastest <= V.rejoinMps * H * 1000 * 1.05, `gap ${gap0.toFixed(0)} mm: no frame faster than rejoinMps (fastest ${(fastest / 1000 / H).toFixed(2)} m/s)`);
    assert.ok(d(T, end) < 5, `and it arrives (${d(T, end).toFixed(1)} mm left, ${frames} frames)`);
  }
});

test('R5: a limb resting a little short of its place is not solved again every frame; a waiting limb is tried once per place', () => {
  const V = LIMB_KEYS.view, T = [0.1, 0.2, 0.3];
  assert.equal(holdRejoinDue({ lastErrMm: 20 }, T, false, 1e6, V), false, 'at a range end, the place 20 mm out and never tried: the stuck skip holds');
  assert.equal(holdRejoinDue({ lastErrMm: 60, chase: true }, T, true, 1e6, V), false, 'never on a frame of the keys');
  assert.equal(holdRejoinDue({ lastErrMm: 20, chase: true }, T, false, 1e6, V), true, 'while it rejoins its place');
  assert.equal(holdRejoinDue({ lastErrMm: 60 }, T, false, 1e6, V), true, 'a limb waiting beyond its reach whose place was not tried yet');
  assert.equal(holdRejoinDue({ lastErrMm: 60, probed: T.slice(), probeMs: 0 }, T, false, 1e6, V), false, 'its place was tried already');
  const moved = [0.1, 0.2, 0.31];
  assert.equal(holdRejoinDue({ lastErrMm: 60, probed: T.slice(), probeMs: 1e6 - 100 }, moved, false, 1e6, V), false, 'a new place, but a try was made less than rejoinEveryMs ago');
  assert.equal(holdRejoinDue({ lastErrMm: 60, probed: T.slice(), probeMs: 1e6 - V.rejoinEveryMs - 1 }, moved, false, 1e6, V), true, 'and once that time has passed');
  assert.equal(holdProbeDue({}, T, 0, V), true, 'nothing tried yet');
});
