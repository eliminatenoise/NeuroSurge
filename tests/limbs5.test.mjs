/** Limbs that follow a trunk bend without a jump, A truly across the chest, and the keys on a pushed limb kept (23
 * November 2026, round r32, LIMBS5; a check of Body update 69). Pure checks of ns-limb-pace TRUNK_RIDE (the follow of an
 * arm the view does not hold), on plain numbers and on the game's own body loaded from disk (tools/load-body.mjs). They
 * establish what these display rules compute on this one reference body; nothing here says anything about a real joint
 * or a real movement. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(path.join(repo, 'scene/src/ns-limb-pace.mjs'));
const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const G = await import(path.join(repo, 'scene/src/ns-grasp.mjs'));
const M = await import(path.join(repo, 'scene/src/ns-math.mjs'));
const sub = (a, b) => a.map((v, k) => v - b[k]), nrm = a => Math.hypot(...a);

// ---- item 1: an arm the view does not hold follows the trunk ---------------------------------------------------------
test('TRUNK_RIDE rideFollow: at least speedMps x dt, the root\'s step with the own movement, or the catch-up share of the lag; never more than maxLagMm behind and never a snap', () => {
  const o = P.TRUNK_RIDE, k60 = 1 - Math.exp(-1 / 60 / o.catchS), floor60 = o.speedMps / 60;
  assert.equal(o.on, true);
  assert.ok(o.catchS > 0 && o.maxLagMm > 0, 'the pass-2 rule (catchS, maxLagMm) is on');
  // the measured worst frame of update 69's bend: the left hand 68 mm, its shoulder 37: the shoulder's step wins
  const f = P.rideFollow([0, 0, 0], [0.068, 0, 0], { rootStepM: 0.037, dt: 1 / 60 });
  assert.ok(!f.done && Math.abs(f.at[0] - 0.037) < 1e-12 && Math.abs(f.lagM - 0.031) < 1e-12, JSON.stringify(f));
  // a still shoulder: speedMps x dt (25 mm at 60 frames a second), or the catch-up share of a long lag
  const g = P.rideFollow([0, 0, 0], [0, 0.05, 0], { rootStepM: 0, dt: 1 / 60 });
  assert.ok(Math.abs(nrm(g.at) - floor60) < 1e-12 && !g.done);
  const g2 = P.rideFollow([0, 0, 0], [0.24, 0, 0], { rootStepM: 0, dt: 1 / 60 });
  assert.ok(Math.abs(g2.at[0] - 0.24 * k60) < 1e-12 && 0.24 * k60 > floor60, `a 240 mm lag closes by ${(g2.at[0] * 1000).toFixed(1)} mm`);
  // the own movement counts with the root's step (not on top of the floor)
  assert.ok(Math.abs(P.rideFollow([0, 0, 0], [0.1, 0, 0], { rootStepM: 0.01, ownStepM: 0.02, dt: 1 / 60 }).at[0] - 0.03) < 1e-12);
  assert.ok(Math.abs(P.rideFollow([0, 0, 0], [0.1, 0, 0], { rootStepM: 0.004, ownStepM: 0.004, dt: 1 / 60 }).at[0] - floor60) < 1e-12);
  // within the step: there at once, nothing left behind
  assert.deepEqual(P.rideFollow([0, 0, 0], [0.01, 0, 0], { dt: 1 / 60 }), { at: [0.01, 0, 0], lagM: 0, capM: 0.01, done: true });
  // the check's blocker (30 frames a second, a 90 mm shoulder step): 299 and 301 mm behind give the same step, never a 301 mm jump
  const a = P.rideFollow([0, 0, 0], [0.299, 0, 0], { rootStepM: 0.09, dt: 1 / 30 }), b = P.rideFollow([0, 0, 0], [0.301, 0, 0], { rootStepM: 0.09, dt: 1 / 30 });
  assert.ok(!a.done && !b.done && Math.abs(a.at[0] - b.at[0]) < 0.003 && b.at[0] < 0.1, `299 mm: ${(a.at[0] * 1000).toFixed(1)}, 301 mm: ${(b.at[0] * 1000).toFixed(1)} mm`);
  // never more than maxLagMm behind: above it, just enough to stay at that lag (it speeds up, the rest is not jumped)
  const c = P.rideFollow([0, 0, 0], [0.6, 0, 0], { dt: 1 / 60 });
  assert.ok(!c.done && Math.abs(c.lagM - o.maxLagMm / 1000) < 1e-12 && Math.abs(c.at[0] - (0.6 - o.maxLagMm / 1000)) < 1e-12, JSON.stringify(c));
  // a long frame takes a longer step (the same pace in time), its time capped at maxDt
  assert.ok(Math.abs(P.rideFollow([0, 0, 0], [0.2, 0, 0], { dt: 1 / 15 }).at[0] - Math.max(o.speedMps / 15, 0.2 * (1 - Math.exp(-1 / 15 / o.catchS)))) < 1e-12);
  assert.ok(Math.abs(P.rideFollow([0, 0, 0], [0.2, 0, 0], { dt: 1 }).at[0] - Math.max(o.speedMps * o.maxDt, 0.2 * (1 - Math.exp(-o.maxDt / o.catchS)))) < 1e-12);
  // the same lag closes in about the same TIME at 60 and at 20 frames a second
  const closeIn = (fps) => { let p = [0, 0, 0], n = 0; const ride = [0.24, 0, 0]; while (n < 200) { const r = P.rideFollow(p, ride, { dt: 1 / fps }); n++; if (r.done) break; p = r.at; } return n / fps; };
  assert.ok(Math.abs(closeIn(60) - closeIn(20)) <= 0.1 && closeIn(60) < 0.4, `60 fps ${closeIn(60).toFixed(3)} s, 20 fps ${closeIn(20).toFixed(3)} s`);
  // no last place: there at once
  assert.equal(P.rideFollow(null, [0.1, 0, 0]).done, true);
  // the first pass's rule behind catchS 0: a gap beyond snapMm put there at once (the check's blocker)
  const old = { ...o, catchS: 0, maxLagMm: 0, speedMps: 0.9, doneMm: 0.5 };
  assert.equal(P.rideFollow([0, 0, 0], [0.31, 0, 0], { dt: 1 / 60 }, old).done, true);
  assert.ok(Math.abs(P.rideFollow([0, 0, 0], [0.05, 0, 0], { dt: 1 / 60 }, old).at[0] - 0.015) < 1e-12);
  // the most a frame's trunk step can carry a hand (reachM on the arc): within the least step, no pose is needed
  assert.ok(Math.abs(P.rideCarryBoundM(1) - Math.PI / 180 * o.reachM) < 1e-12 && o.reachM >= 1.2, 'reachM: a generous spine-to-hand distance');
  assert.ok(P.rideCarryBoundM(1) <= o.speedMps / 60 && P.rideCarryBoundM(11) > o.speedMps / 60, 'a slow return (1 degree a frame) needs no pose at 60 frames a second; the jerk (11 degrees) does');
  assert.equal(P.rideCarryBoundM(NaN), Infinity);
  // the key of the trunk's own offsets: the look's bend is not among them
  assert.equal(P.trunkRideKey({ trunk_flex: 3.21234, neck_flex: 9, trunk_rot: -1 }), '3.212|0|-1');
  assert.equal(P.trunkRideKey(null), '');
});

test('TRUNK_RIDE freeHandRide: the free left hand turned with the chest is held back to the step, its kept place untouched, and catches up', () => {
  const I = M.identity();
  const chest = deg => M.rotationAxisAngle([1, 0, 0], deg * Math.PI / 180); // (the chest turned forward about its left-right axis)
  const att = deg => ({ bodyToCamera: chest(deg), shoulderCam: [0, 0, 0], girdleShiftM: [0, 0, 0] }), shown = { cameraToWorld: I, worldToCamera: I };
  const ask = [-0.26, -0.45, -0.41]; // (the start place beside the shoulder, chest axes)
  // a still trunk: the place asked as it is, a record kept
  let r = app.freeHandRide(null, ask, { carry: false, att: att(0), shown, dt: 1 / 60 });
  assert.equal(r.lagging, false); assert.deepEqual(r.askBodyM, ask); assert.ok(r.state && r.state.lag === false);
  // a trunk bend of 8 degrees in one frame with the shoulder still: the hand goes TRUNK_RIDE's step (25 mm at 60 frames a
  // second, or the catch-up share of the gap), not the 84 mm the chest turns it
  const o = P.TRUNK_RIDE, rigid = nrm(sub(M.transformDirection(chest(8), ask), ask));
  assert.ok(rigid > 0.08, `as one piece the hand would go ${(rigid * 1000).toFixed(0)} mm`);
  r = app.freeHandRide(r.state, ask, { carry: true, att: att(8), shown, dt: 1 / 60 });
  assert.equal(r.lagging, true);
  const drawn = M.transformDirection(chest(8), r.askBodyM), want = Math.max(o.speedMps / 60, rigid * (1 - Math.exp(-1 / 60 / o.catchS)));
  assert.ok(Math.abs(nrm(sub(drawn, ask)) - want) < 1e-9, `drawn ${(nrm(sub(drawn, ask)) * 1000).toFixed(2)} mm from where it was (the step ${(want * 1000).toFixed(2)})`);
  // the trunk still: it catches up, then the place asked is the kept place again
  let n = 0;
  while (r.lagging && n < 20) { r = app.freeHandRide(r.state, ask, { carry: false, att: att(8), shown, dt: 1 / 60 }); n++; }
  assert.equal(r.lagging, false); assert.deepEqual(r.askBodyM, ask);
  assert.ok(n >= 2 && n <= 4, `caught up in ${n} frames`);
  // a frame with no time (drawn while paused): the hand stays where it was drawn
  const r0 = app.freeHandRide(null, ask, { carry: false, att: att(0), shown, dt: 1 / 60 });
  const r1 = app.freeHandRide(r0.state, ask, { carry: true, att: att(8), shown, dt: 1 / 60 });
  const r2 = app.freeHandRide(r1.state, ask, { carry: false, att: att(8), shown, dt: 0 });
  assert.equal(r2.lagging, true); assert.ok(nrm(sub(r2.askBodyM, r1.askBodyM)) < 1e-12, 'no time: no move');
  // off: the place asked as it is
  assert.equal(app.freeHandRide(r.state, ask, { carry: true, att: att(20), shown, dt: 1 / 60 }, { ...P.TRUNK_RIDE, on: false }).lagging, false);
});

// the game's body (as tests/limbs4.test.mjs loads it)
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, rig, baked } = await loadBody(repo);
const bodyOpts = { anchor: 'pelvis', baked, holdChest: false };
const segmentsFor = q => body.poseBodySegments(rig, body.softExtensionAngles(body.passiveKneeAngles(q)), bodyOpts);
const limits = body.bodyPostureLimits(baked);
const project = t => body.clampBodyJointTargets(t).applied;
const start = project(body.bodyPostureAngles(baked));
const ARM = ['r_shoulder_flex', 'r_shoulder_abd', 'r_shoulder_rot', 'r_elbow_flex', 'r_pronation', 'r_wrist_flex', 'r_wrist_ext', 'r_wrist_dev'];
// "Bend trunk forward" as drawn on update 69 at 60 frames a second (degrees from the start posture, frame by frame)
const BEND = [0, 2, 7.3, 14.8, 23.3, 31.7, 35, 31.8, 29.4, 28.1, 27.7, 28.2, 29.4, 31, 32.8, 34.5, 35, 34.3, 33.9, 33.6, 33.6];

test('TRUNK_RIDE rideLimbStep on the game\'s body: the right arm in "Bend trunk forward" goes no faster than the rule\'s step (its shoulder, 25 mm, or the catch-up share), and ends on its place', () => {
  const tf0 = start.trunk_flex;
  const env = { rig, limb: 'rightArm', ids: ARM, segmentsFor, limbPoint: G.limbPoint, toWorld: mm => mm.map(v => v / 1000), toBody: m => m.map(v => v * 1000),
    solveLimb: G.solveLimb, limits: G.holdLimits(limits, 'rightArm', start), project, opts: G.LIMB_HOLD_TRACK, memo: {}, dt: 1 / 60,
    last: () => { const s0 = segmentsFor(start), q = {}; for (const id of ARM) q[id] = start[id]; return { q, at: G.limbPoint(rig, s0, 'rightArm', 'end').map(v => v / 1000), root: G.limbPoint(rig, s0, 'rightArm', 'root').map(v => v / 1000) }; } };
  const ptOf = (T, w) => G.limbPoint(rig, segmentsFor(T), 'rightArm', w).map(v => v / 1000);
  let rec = null, prevDrawn = ptOf(start, 'end'), prevRigid = prevDrawn, prevRoot = ptOf(start, 'root'), rigidMost = 0, drawnMost = 0, worstOver = -Infinity, lagMost = 0;
  let prevElbow = ptOf(start, 'bend'), elbowOver = -Infinity;
  const frames = [...BEND, ...Array(40).fill(BEND[BEND.length - 1])];
  let last = null, lastT = null;
  for (const b of frames) {
    const T = { ...start, trunk_flex: tf0 + b };
    const r = P.rideLimbStep(rec, T, env); rec = r.rec; last = r; lastT = T;
    const drawn = ptOf(r.T, 'end'), rigid = ptOf(T, 'end'), root = ptOf(T, 'root');
    const step = nrm(sub(drawn, prevDrawn)), rootStep = nrm(sub(root, prevRoot));
    const o = P.TRUNK_RIDE, allowed = Math.max(o.speedMps / 60, rootStep, nrm(sub(rigid, prevDrawn)) * (1 - Math.exp(-1 / 60 / o.catchS)));
    rigidMost = Math.max(rigidMost, nrm(sub(rigid, prevRigid))); drawnMost = Math.max(drawnMost, step);
    worstOver = Math.max(worstOver, step - allowed); lagMost = Math.max(lagMost, nrm(sub(rigid, drawn)));
    // draw-only: only the arm's three solved joints differ from what was asked
    for (const id of Object.keys(r.T)) if (!['r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex'].includes(id)) assert.equal(r.T[id], T[id], id);
    const elbow = ptOf(r.T, 'bend'); elbowOver = Math.max(elbowOver, nrm(sub(elbow, prevElbow)) - allowed); prevElbow = elbow;
    prevDrawn = drawn; prevRigid = rigid; prevRoot = root;
  }
  assert.ok(rigidMost > 0.045, `as one piece the hand goes ${(rigidMost * 1000).toFixed(1)} mm in a frame`);
  assert.ok(worstOver < 0.002, `the hand at most ${(worstOver * 1000).toFixed(1)} mm a frame beyond the rule's step (most ${(drawnMost * 1000).toFixed(1)} mm)`);
  assert.ok(drawnMost < rigidMost * 0.75, `its largest step ${(drawnMost * 1000).toFixed(1)} mm against ${(rigidMost * 1000).toFixed(1)} as one piece`);
  assert.ok(elbowOver < 0.002, `the elbow likewise (${(elbowOver * 1000).toFixed(1)} mm beyond, also when the arm is drawn on its place again)`);
  assert.ok(lagMost > 0.02 && lagMost < 0.15, `at most ${(lagMost * 1000).toFixed(0)} mm behind its place`);
  // caught up: the angles drawn are the ones asked (nothing kept from the follow), nothing behind
  assert.equal(rec.lag, false);
  assert.equal(last.T, lastT, 'the angles asked, as they are');
  for (const id of ARM) assert.equal(last.T[id], start[id], id);
});

// "Turn trunk to the left" as drawn (the trunk's own turn offset, degrees, frame by frame) in the LIMBS5 pass-2 probes: at
// 60 frames a second, and at 30 frames a second (update 69 and this branch alike; work/limbs5/p5)
const TURN60 = [0, 2.57, 9.42, 19.07, 29.99, 40.76, 45, 40.82, 37.8, 36.09, 35.64, 36.31, 37.83, 39.89, 42.17, 44.39, 45, 44.16, 43.55, 43.21, 43.12];
const TURN30 = [0, 9.4, 30, 45, 37.8, 35.6, 37.8, 42.2, 45, 43.6, 43.1, 43.6, 44.4, 45];
test('TRUNK_RIDE rideLimbStep on the game\'s body, LIMBS5 pass 2 (the check\'s blocker): in a trunk turn at 30 frames a second and with uneven frames the right arm never jumps, is never more than maxLagMm behind, and ends on its place', () => {
  const o = P.TRUNK_RIDE, r0 = start.trunk_rot || 0;
  const ptOf = (T, w) => G.limbPoint(rig, segmentsFor(T), 'rightArm', w).map(v => v / 1000);
  const runTurn = (turn, dts) => {
    const env = { rig, limb: 'rightArm', ids: ARM, segmentsFor, limbPoint: G.limbPoint, toWorld: mm => mm.map(v => v / 1000), toBody: m => m.map(v => v * 1000),
      solveLimb: G.solveLimb, limits: G.holdLimits(limits, 'rightArm', start), project, opts: G.LIMB_HOLD_TRACK, memo: {}, dt: 1 / 60,
      last: () => { const s0 = segmentsFor(start), q = {}; for (const id of ARM) q[id] = start[id]; return { q, at: G.limbPoint(rig, s0, 'rightArm', 'end').map(v => v / 1000), root: G.limbPoint(rig, s0, 'rightArm', 'root').map(v => v / 1000) }; } };
    let rec = null, prevDrawn = ptOf(start, 'end'), prevRigid = prevDrawn, drawnMost = 0, rigidMost = 0, lagMost = 0, last = null;
    const frames = [...turn, ...Array(30).fill(turn[turn.length - 1])];
    frames.forEach((deg, i) => {
      const T = { ...start, trunk_rot: r0 + deg };
      env.dt = dts[Math.min(i, dts.length - 1)];
      const r = P.rideLimbStep(rec, T, env); rec = r.rec; last = r;
      const drawn = ptOf(r.T, 'end'), rigid = ptOf(T, 'end');
      drawnMost = Math.max(drawnMost, nrm(sub(drawn, prevDrawn))); rigidMost = Math.max(rigidMost, nrm(sub(rigid, prevRigid))); lagMost = Math.max(lagMost, nrm(sub(rigid, drawn)));
      prevDrawn = drawn; prevRigid = rigid;
    });
    return { drawnMost, rigidMost, lagMost, caught: rec.lag === false && last.rec.lag === false };
  };
  const a = runTurn(TURN30, [1 / 30]);
  assert.ok(a.rigidMost > 0.12, `as one piece ${(a.rigidMost * 1000).toFixed(0)} mm in a frame at 30 frames a second`);
  assert.ok(a.drawnMost < a.rigidMost * 0.8, `30 fps: largest step ${(a.drawnMost * 1000).toFixed(0)} mm against ${(a.rigidMost * 1000).toFixed(0)} as one piece (the first pass snapped 323 mm)`);
  assert.ok(a.lagMost <= o.maxLagMm / 1000 + 0.003, `30 fps: at most ${(a.lagMost * 1000).toFixed(0)} mm behind`);
  assert.ok(a.caught, '30 fps: caught up, on its place');
  // the check's uneven frames (17, 40, 45, 35, 40, 30, 30, 25, 25, 20, 20 ms) over the 60 fps turn's angles
  const b = runTurn(TURN60, [1 / 60, 0.04, 0.045, 0.035, 0.04, 0.03, 0.03, 0.025, 0.025, 0.02, 0.02, 1 / 60]);
  assert.ok(b.drawnMost < b.rigidMost, `uneven: largest step ${(b.drawnMost * 1000).toFixed(0)} mm against ${(b.rigidMost * 1000).toFixed(0)}`);
  assert.ok(b.lagMost <= o.maxLagMm / 1000 + 0.003 && b.caught, `uneven: at most ${(b.lagMost * 1000).toFixed(0)} mm behind, caught up`);
  // 60 frames a second: well under the rigid step
  const c = runTurn(TURN60, [1 / 60]);
  assert.ok(c.drawnMost < c.rigidMost * 0.6 && c.caught, `60 fps: largest step ${(c.drawnMost * 1000).toFixed(0)} mm against ${(c.rigidMost * 1000).toFixed(0)}, ${(c.lagMost * 1000).toFixed(0)} mm behind at most`);
});

// ---- LIMBS5 pass 2, item 2: the view's hold on the right arm while the trunk moves (HOLD_BODY trunkNow) ----------------
test('HOLD_BODY trunkNow: a place the hold could not reach is tried again once the trunk has moved; a stale drawn trunk is seen; a limb beyond reach does not wait while the trunk carries its root', () => {
  const H = app.HOLD_BODY;
  assert.equal(H.trunkNow, true);
  const bent = { trunk_rot: -30 }, rest = {};
  const h = { stuck: [1, 2, 3], stuckHead: bent, probed: [1, 2, 3], probedHead: bent };
  assert.deepEqual(app.holdTrunkForget(h, { trunk_rot: -30 }), { stuck: [1, 2, 3], probed: [1, 2, 3] }, 'the same trunk: kept');
  assert.deepEqual(app.holdTrunkForget(h, rest), { stuck: null, probed: null }, 'the trunk back at rest: tried again (update 69 kept it, 163 mm off for good)');
  assert.deepEqual(app.holdTrunkForget(h, rest, { ...H, trunkNow: false }), { stuck: [1, 2, 3], probed: [1, 2, 3] }, 'switched off: as before');
  assert.deepEqual(app.holdTrunkForget({ stuck: null }, rest), { stuck: null, probed: null });
  assert.equal(app.holdTrunkStale({ trunk_rot: 9.4, neck_flex: 1 }, { trunk_rot: 30, neck_flex: 1 }), true);
  assert.equal(app.holdTrunkStale({ trunk_rot: 30, neck_flex: 1 }, { trunk_rot: 30, neck_flex: 1 }), false);
  assert.equal(app.holdTrunkStale({}, { trunk_side: 0 }), false);
  assert.equal(app.holdTrunkStale(null, { trunk_rot: 1 }), false);
  assert.equal(app.holdWaitsBeyond(true, { trunkCarries: true, placeMovedSq: 0 }), false, 'the trunk moves the root, the place stays: the nearest answer is taken');
  assert.equal(app.holdWaitsBeyond(true, { trunkCarries: true, placeMovedSq: 1e-4 }), true, 'a look carried the place beyond reach: it waits, as before');
  assert.equal(app.holdWaitsBeyond(true, { trunkCarries: false }), true);
  assert.equal(app.holdWaitsBeyond(false, { trunkCarries: false }), false);
  assert.equal(app.holdWaitsBeyond(true, { trunkCarries: true }, { ...H, trunkNow: false }), true);
  assert.deepEqual([...H.drawnJoints].sort(), ['neck_side', 'trunk_rot', 'trunk_side']);
});

// ---- item 2: A truly across the chest -----------------------------------------------------------------------------------
test('LIMB_ACROSS open on the game\'s body: after S, held A turns the upper arm, then opens the elbow: the hand at least 150 mm across and at most 30 mm above the shoulder, at the keys\' step, the elbow point still; D undoes both', () => {
  assert.equal(P.LIMB_ACROSS.openMostDeg, 30);
  const app2 = app, way = app2.LIMB_KEYS.view.speedMps / 60; // (m a frame)
  const env = { rig, chain: G.LIMB_CHAIN.rightArm, base: start, asDrawn: segmentsFor, limbPoint: G.limbPoint, solveLimb: G.solveLimb, limits, project,
    opts: { follow: G.LIMB_HOLD_FOLLOW, track: G.LIMB_HOLD_TRACK, reach: G.LIMB_HOLD_REACH }, keyMove: app2.limbKeyMove, keyFollow: app2.limbKeyFollow, keyCut: app2.keyMoveCut,
    speedMps: app2.LIMB_KEYS.view.speedMps, leadM: app2.LIMB_KEYS.view.leadM, maxDt: 0.1 };
  const c = G.LIMB_CHAIN.rightArm, q0 = {}; for (const id of [...c.joints, c.spin.joint]) q0[id] = start[id];
  let s = P.keyShadowNew('rightArm', q0);
  for (let i = 0; i < 150; i++) s = P.keyShadowStep(s, 0, -1, 1 / 60, env);
  s = P.keyShadowStep(s, 0, 0, 1 / 60, env);
  const afterS = P.keyShadowPoints(s, env), sh = afterS.root;
  const across = p => (p.end[0] - sh[0]) * 1000, rise = p => (p.end[2] - sh[2]) * 1000; // (+x the body's left, +z up: mm from the right shoulder)
  let prev = afterS, handMost = 0, elbowMost = 0, riseMost = -Infinity;
  const at = {};
  for (let i = 1; i <= 150; i++) {
    s = P.keyShadowStep(s, -1, 0, 1 / 60, env);
    const p = P.keyShadowPoints(s, env);
    handMost = Math.max(handMost, nrm(sub(p.end, prev.end))); elbowMost = Math.max(elbowMost, nrm(sub(p.bend, prev.bend))); riseMost = Math.max(riseMost, rise(p));
    if (i === 30 || i === 60 || i === 150) at[i] = { across: across(p), rise: rise(p), elbow: s.q.r_elbow_flex, rot: s.q.r_shoulder_rot };
    prev = p;
  }
  assert.ok(handMost <= way * 1.05, `the hand at most ${(handMost * 1000).toFixed(1)} mm a frame (the keys' ${(way * 1000).toFixed(1)})`);
  assert.ok(elbowMost < 1e-3, `the elbow point still (${(elbowMost * 1000).toFixed(2)} mm a frame at most)`);
  assert.ok(at[60].across >= 150 && at[60].rise <= 30, `after 1 s of A: ${at[60].across.toFixed(0)} mm across, ${at[60].rise.toFixed(0)} mm above the shoulder (update 69: about 115 and 68, and no further)`);
  assert.ok(at[150].across >= at[60].across - 1 && at[150].rise <= 30, `after 2.5 s: ${at[150].across.toFixed(0)} / ${at[150].rise.toFixed(0)} (the arm stays across; not raised to the face)`);
  assert.ok(at[150].rot <= -69.9 && at[150].elbow < 144.3 - 25 && at[150].elbow >= 144.3 - 30 - 0.5, `turned to its end, the elbow opened ${(144.3 - at[150].elbow).toFixed(1)} degrees`);
  // (the forearm turning over: the hand passes higher on the way, the folded arm's own; reported, not hidden)
  assert.ok(riseMost < 90, `on the way at most ${riseMost.toFixed(0)} mm above the shoulder`);
  // D for 1 s: the opening closed first, then the turn back, to within a few centimetres of where S left it
  s = P.keyShadowStep(s, 0, 0, 1 / 60, env);
  let closedFirst = null;
  for (let i = 1; i <= 50; i++) { s = P.keyShadowStep(s, 1, 0, 1 / 60, env); if (closedFirst === null && s.q.r_shoulder_rot > -69.9) closedFirst = s.q.r_elbow_flex; }
  assert.ok(closedFirst !== null && closedFirst > 144.3 - 2, `the elbow closed back (${closedFirst && closedFirst.toFixed(1)}) before the upper arm turned back`);
  assert.ok(nrm(sub(P.keyShadowPoints(s, env).end, afterS.end)) < 0.04, `D brings it back: ${(nrm(sub(P.keyShadowPoints(s, env).end, afterS.end)) * 1000).toFixed(0)} mm from where S left it`);
  // the rule's parts: acrossStep at the turn's end opens; with both records at their end: 'end'
  const q = { ...s.q };
  assert.equal(P.acrossStep({ q, chain: c, across: true, way: [0.005, 0, 0], endAt: () => [0, 0, 0], limits, spinRec: null, openRec: null }, { ...P.LIMB_ACROSS, on: false }), null);
});

// ---- item 3: the keys go on along the shadow's line once a way back ends ------------------------------------------------
test('KEY_SHADOW lineAtHome: the shadow\'s line of the keys taken into the world (a direction and a length), none without one', () => {
  assert.equal(P.KEY_SHADOW.lineAtHome, true);
  // the body placed turned a quarter turn about the vertical and moved (mm in, m out)
  const toWorld = mm => [-mm[1] / 1000 + 1, mm[0] / 1000 + 2, mm[2] / 1000 + 3];
  const l = P.keyShadowLine({ keyU: [0.6, 0, 0.8], keyLen: 0.31 }, toWorld);
  assert.ok(Math.abs(l.keyU[0]) < 1e-12 && Math.abs(l.keyU[1] - 0.6) < 1e-12 && Math.abs(l.keyU[2] - 0.8) < 1e-12 && l.keyLen === 0.31, JSON.stringify(l));
  assert.equal(P.keyShadowLine({ keyU: null, keyLen: 0 }, toWorld), null);
  assert.equal(P.keyShadowLine({ keyU: [1, 0, 0], keyLen: 0 }, toWorld), null);
  assert.equal(P.keyShadowLine(null, toWorld), null);
});

// ---- LIMBS5 pass 3: keys on the held right arm during a trunk movement end where the same keys end with the trunk still --
test('KEY_SHADOW placeHome keyShadowHomeStep: the place\'s offset from the shadow\'s end is cut in step with the trunk\'s return, never grows back, goes at most homeMps, and is home at rest', () => {
  const K = P.KEY_SHADOW, home = [0, 0, 0], dt = 1 / 60, most = K.homeMps * dt;
  assert.equal(K.placeHome, true);
  // the player's keys or look this frame: nothing is cut, the count starts again
  let r = P.keyShadowHomeStep(null, { place: [0.2, 0, 0], home, away: 30, dt });
  assert.deepEqual(r, { at: [0.2, 0, 0], state: { share: 1, awayRef: 30 }, done: false });
  r = P.keyShadowHomeStep({ share: 0.4, awayRef: 10 }, { place: [0.2, 0, 0], home, away: 30, input: true, dt });
  assert.deepEqual(r.state, { share: 1, awayRef: 30 });
  assert.deepEqual(r.at, [0.2, 0, 0]);
  // the trunk half way back: half the offset (within the pace)
  r = P.keyShadowHomeStep({ share: 1, awayRef: 30 }, { place: [0.02, 0, 0], home, away: 15, dt });
  assert.ok(Math.abs(r.at[0] - 0.01) < 1e-12 && r.state.share === 0.5 && !r.done, JSON.stringify(r));
  // the spring's swing back out does not take the place out again
  const r2 = P.keyShadowHomeStep(r.state, { place: r.at, home, away: 25, dt });
  assert.equal(r2.at, r.at);
  assert.equal(r2.state.share, 0.5);
  // the trunk still going out (away above the reference): nothing is cut
  const r3 = P.keyShadowHomeStep({ share: 1, awayRef: 20 }, { place: [0.1, 0, 0], home, away: 35, dt });
  assert.equal(r3.at[0], 0.1);
  // at most homeMps x dt a frame, and on at rest at that pace until home, then done
  let s = { share: 1, awayRef: 30 }, p = [0.3, 0, 0], n = 0, big = 0;
  for (; n < 100; n++) {
    const q = P.keyShadowHomeStep(s, { place: p, home, away: 0, atRest: true, dt });
    big = Math.max(big, nrm(sub(q.at, p))); s = q.state; p = q.at;
    if (q.done) break;
  }
  assert.ok(big <= most + 1e-12 && n === Math.ceil(0.3 / most) - 1, `largest move ${(big * 1000).toFixed(2)} mm, home after ${n + 1} frames`);
  assert.ok(nrm(p) <= K.homeDoneMm / 1000);
  // no time: nothing moves; a long frame counts at most homeMaxDt
  assert.equal(P.keyShadowHomeStep({ share: 1, awayRef: 30 }, { place: [0.3, 0, 0], home, away: 0, atRest: true, dt: 0 }).at[0], 0.3);
  assert.ok(Math.abs(P.keyShadowHomeStep({ share: 1, awayRef: 30 }, { place: [0.3, 0, 0], home, away: 0, atRest: true, dt: 1 }).at[0] - (0.3 - K.homeMps * K.homeMaxDt)) < 1e-12);
  // nothing to go home to: unchanged
  assert.deepEqual(P.keyShadowHomeStep({ share: 1, awayRef: 3 }, { place: [1, 2, 3], home: null, away: 0 }).at, [1, 2, 3]);
});

/* The trunk's distance from rest (degrees, the game's holdTrunkAway) recorded each frame at 60 frames a second in the
 * browser (work/limbs5/p8, this branch; the trunk is the same on update 69): "Bend trunk forward" (KA) and a trunk turn
 * (KAT, KWT); and the hold's place's distance from the shadow's end on the frame the key was let go, recorded on pass 2. */
const AWAY_BEND = [0, 2, 7.3, 14.8, 23.3, 31.7, 35, 31.8, 29.4, 28.1, 27.7, 28.2, 29.4, 31, 32.8, 34.5, 35, 34.4, 33.9, 33.6, 33.5, 33.6, 33.9, 34.2, 34.6, 34.9, 35, 34.9, 34.8, 34.7, 34.7, 34.7, 34.8, 34.8, 34.9, 35, 35, 35, 35, 34.9, 34.9, 35, 35, 34.6, 33.7, 32.3, 30.7, 28.9, 27, 25.1, 23.2, 21.3, 19.5, 17.8, 16.2, 14.7, 13.3, 12, 10.8, 9.7, 8.7, 7.8, 7, 6.2, 5.6, 5, 4.4, 3.9, 3.5, 3.1, 2.7, 2.4, 2.1, 1.9, 1.7, 1.5, 1.3, 1.2, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0];
const AWAY_TURN = [0, 2.6, 9.4, 19.1, 30, 40.8, 45, 40.8, 37.8, 36.1, 35.6, 36.3, 37.8, 39.9, 42.2, 44.4, 45, 44.2, 43.6, 43.2, 43.1, 43.3, 43.6, 44, 44.4, 44.9, 45, 44.8, 44.7, 44.6, 44.6, 44.7, 44.7, 44.8, 44.9, 45, 45, 45, 44.9, 44.9, 44.9, 44.9, 44.9, 44.5, 43.3, 41.6, 39.5, 37.2, 34.8, 32.3, 29.8, 27.4, 25.1, 22.9, 20.8, 18.9, 17.1, 15.4, 13.9, 12.5, 11.2, 10, 9, 8, 7.1, 6.4, 5.7, 5, 4.5, 4, 3.5, 3.1, 2.8, 2.4, 2.2, 1.9, 1.7, 1.5, 1.3, 1.2, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0];
test('KEY_SHADOW placeHome on the recorded trunk of the check\'s KA, KAT and KWT at 60, 30 and 20 frames a second: the place is home once the trunk is, and never moves more than homeMps a frame', () => {
  const K = P.KEY_SHADOW, home = [0.05, -0.02, 0.1], dir = [0.6, 0, 0.8];
  for (const [name, away, upF, offMm] of [['KA', AWAY_BEND, 40, 213.3], ['KAT', AWAY_TURN, 40, 346.9], ['KWT', AWAY_TURN, 30, 312.1]]) {
    for (const fps of [60, 30, 20]) {
      const step = 60 / fps, dt = 1 / fps, most = K.homeMps * dt;
      let s = null, p = home.map((v, k) => v + dir[k] * offMm / 1000), big = 0, homeAt = null, worst = 0;
      const frames = Math.ceil(away.length / step) + 30;
      for (let f = 0; f < frames; f++) {
        const i = Math.min(away.length - 1, Math.round(f * step)), a = away[i], atRest = a === 0 && i >= away.length - 2;
        const q = P.keyShadowHomeStep(s, { place: p, home, away: a, atRest, input: i <= upF, dt });
        big = Math.max(big, nrm(sub(q.at, p)));
        // (in step with the trunk while the pace allows: the offset left is the share of the way still to go)
        if (i > upF && !atRest) worst = Math.max(worst, nrm(sub(q.at, home)) - (offMm / 1000) * q.state.share);
        s = q.state; p = q.at;
        if (q.done && homeAt === null) homeAt = f;
      }
      assert.ok(big <= most + 1e-12, `${name} ${fps} fps: a frame moved the place ${(big * 1000).toFixed(1)} mm (at most ${(most * 1000).toFixed(1)})`);
      assert.ok(homeAt !== null && nrm(sub(p, home)) <= K.homeDoneMm / 1000, `${name} ${fps} fps: home ${homeAt}, ${(nrm(sub(p, home)) * 1000).toFixed(2)} mm left`);
      assert.ok(worst < 0.03, `${name} ${fps} fps: up to ${(worst * 1000).toFixed(1)} mm behind the trunk's share`);
    }
  }
});

test('HOLD_BODY keyCarry and KEY_SHADOW placeHome are on, and each can be switched off', () => {
  assert.equal(app.HOLD_BODY.keyCarry, true);
  assert.equal(P.KEY_SHADOW.placeHome, true);
  assert.ok(P.KEY_SHADOW.homeMps > 0 && P.KEY_SHADOW.homeMps <= app.LIMB_KEYS.view.rejoinMps, 'no faster than the hold\'s own rejoin pace');
});

/* The check's quick turn reversal (K3xT: right arm chosen, "Turn trunk to the right" at frames 0 and 5, "Turn trunk to the left"
 * at frame 12, 60 frames a second): update 69's left hand, riding the trunk as one piece, and its shoulder, mm in the world,
 * recorded in the browser by the second check (work/limbs5-check2/k4/k4.json), frames -1 to 23. */
const K3XT_HAND = [[-313,-249,-644],[-313,-249,-644],[-292,-241,-654],[-234,-224,-677],[-148,-208,-700],[-46,-201,-713],[54,-205,-711],[93,-210,-707],[37,-204,-713],[-3,-201,-714],[-27,-201,-714],[-33,-201,-713],[-24,-201,-714],[-3,-201,-714],[-23,-201,-714],[-120,-205,-705],[-263,-232,-666],[-411,-295,-584],[-522,-387,-467],[-566,-456,-379],[-541,-411,-436],[-517,-381,-474],[-501,-364,-496],[-497,-360,-501],[-503,-366,-493]];
const K3XT_ROOT = [[-168,-152,-8],[-168,-152,-8],[-165,-147,-13],[-157,-136,-27],[-141,-121,-46],[-120,-107,-64],[-95,-96,-78],[-85,-93,-83],[-100,-98,-76],[-110,-102,-70],[-115,-105,-67],[-117,-105,-66],[-115,-104,-67],[-110,-102,-70],[-114,-104,-67],[-136,-117,-51],[-161,-141,-20],[-177,-175,21],[-175,-211,67],[-164,-234,95],[-172,-220,77],[-176,-209,64],[-177,-203,56],[-177,-202,54],[-177,-204,57]];
test('TRUNK_RIDE maxLagMm 400 (LIMBS5 pass 3): the check\'s quick turn reversal replayed through rideFollow: the hand\'s largest step is under 100 mm (update 69 186, the 250 mm limit 173) and it is never more than maxLagMm behind', () => {
  const o = P.TRUNK_RIDE, mm = v => v.map(x => x / 1000);
  assert.equal(o.maxLagMm, 400);
  const run = oo => {
    let prev = mm(K3XT_HAND[0]), pr = mm(K3XT_ROOT[0]), big = 0, lag = 0;
    for (let f = 1; f < K3XT_HAND.length; f++) {
      const ride = mm(K3XT_HAND[f]), root = mm(K3XT_ROOT[f]);
      const g = P.rideFollow(prev, ride, { rootStepM: nrm(sub(root, pr)), dt: 1 / 60 }, oo);
      big = Math.max(big, nrm(sub(g.at, prev))); lag = Math.max(lag, g.lagM); prev = g.at; pr = root;
    }
    return { big, lag };
  };
  let rigid = 0; for (let f = 1; f < K3XT_HAND.length; f++) rigid = Math.max(rigid, nrm(sub(K3XT_HAND[f], K3XT_HAND[f - 1])) / 1000);
  const now = run(o), was = run({ ...o, maxLagMm: 250 });
  assert.ok(rigid > 0.18 && was.big > 0.16, `update 69 ${(rigid * 1000).toFixed(0)} mm, the 250 mm limit ${(was.big * 1000).toFixed(0)} mm`);
  assert.ok(now.big < 0.1 && now.lag <= o.maxLagMm / 1000 + 1e-9, `largest step ${(now.big * 1000).toFixed(0)} mm, lag ${(now.lag * 1000).toFixed(0)} mm`);
});

test('HOLD_BODY pinSkipMm holdPinKeeps: off since pass 4 (the arm trembled); switched on, an arm left at the end of its joints is not solved again while the trunk has carried its end less than pinSkipMm and its place stayed', () => {
  const H = app.HOLD_BODY, H5 = { ...H, pinSkipMm: 5 }, pin = { end: [0.1, 0.2, 0.3], place: [1, 1, 1] }, mm = H5.pinSkipMm / 1000;
  // (LIMBS5 pass 4: the skip made the pinned arm ride the trunk a few millimetres and be put back, 4 to 8 mm steps back and
  // forth for about ten frames of a right turn; off, with one solve step a frame for an arm pinned the frame before)
  assert.equal(H.pinSkipMm, 0); assert.equal(H.pinFollow, true);
  assert.equal(app.holdPinKeeps(pin, [0.1, 0.2, 0.3], { placeMovedM: 0 }), false, 'off: solved every frame');
  assert.equal(app.holdPinKeeps(pin, [0.1 + mm * 0.9, 0.2, 0.3], { placeMovedM: 0 }, H5), true);
  assert.equal(app.holdPinKeeps(pin, [0.1 + mm * 1.1, 0.2, 0.3], { placeMovedM: 0 }, H5), false, 'carried further: solved again');
  assert.equal(app.holdPinKeeps(pin, [0.1, 0.2, 0.3], { placeMovedM: 0.0011 }, H5), false, 'its place moved (the keys, the look, the way home): solved again');
  assert.equal(app.holdPinKeeps(null, [0.1, 0.2, 0.3], {}, H5), false);
  assert.equal(app.holdPinKeeps(pin, null, {}, H5), false);
  assert.ok(H.trunkCatchMm > 0 && H.keyCarry === true);
});

// ---- LIMBS5 pass 4 (the third check: KLF, KAg / KAre and the history-dependent path, the game's wiring) ---------------
const shadowEnvOf = (base = start) => ({ rig, chain: G.LIMB_CHAIN.rightArm, base, asDrawn: segmentsFor, limbPoint: G.limbPoint, solveLimb: G.solveLimb, limits, project,
  opts: { follow: G.LIMB_HOLD_FOLLOW, track: G.LIMB_HOLD_TRACK, reach: G.LIMB_HOLD_REACH }, keyMove: app.limbKeyMove, keyFollow: app.limbKeyFollow, keyCut: app.keyMoveCut,
  speedMps: app.LIMB_KEYS.view.speedMps, leadM: app.LIMB_KEYS.view.leadM, maxDt: 0.1 });
const armQ = q => { const c = G.LIMB_CHAIN.rightArm, o = {}; for (const id of [...c.joints, c.spin.joint]) o[id] = q[id]; return o; };

test('KEY_SHADOW homeOnLook false (LIMBS5 pass 4): the way home is due only once the keys were played on the shadow, also on a frame it could not follow them; the look\'s carry alone never makes it due', () => {
  const K = P.KEY_SHADOW, e = shadowEnvOf();
  assert.equal(K.homeOnLook, false);
  let s = P.keyShadowNew('rightArm', armQ(start));
  assert.equal(s.keysPlayed, false);
  assert.equal(P.keyShadowHomeDue(s), false, 'a new shadow');
  // the look carries it 3 cm (as ns-app shadowCarry marks it: everMoved): not due (KLF, KLT)
  const p = P.keyShadowPoints(s, e), c = P.keyShadowCarry(s, [p.end[0], p.end[1], p.end[2] + 0.03], e);
  assert.ok(c.moved, 'the carry moved it');
  const carried = { ...c, everMoved: true };
  assert.equal(P.keyShadowHomeDue(carried), false, 'the look alone: the view\'s hold carries the arm itself');
  assert.equal(P.keyShadowHomeDue(carried, { ...K, homeOnLook: true }), true, 'homeOnLook true: pass 3');
  // a frame of A: due, and it stays due through frames with no key and the look's carry
  let k = P.keyShadowStep(carried, -1, 0, 1 / 60, e);
  assert.equal(k.keysPlayed, true);
  k = P.keyShadowStep(k, 0, 0, 1 / 60, e);
  const p2 = P.keyShadowPoints(k, e);
  k = P.keyShadowCarry(k, [p2.end[0], p2.end[1], p2.end[2] + 0.01], e);
  assert.equal(P.keyShadowHomeDue(k), true);
  // S held until the folded arm can go no further: a frame that moves nothing still counts as the keys'
  let f = P.keyShadowNew('rightArm', armQ(start)), still = null;
  for (let i = 0; i < 260 && !still; i++) { const n = P.keyShadowStep(f, 0, -1, 1 / 60, e); if (!n.moved && i > 10) still = n; f = n; }
  assert.ok(still && still.keysPlayed === true && P.keyShadowHomeDue(still), 'keys the shadow refused moved the real place all the same');
  assert.equal(P.keyShadowHomeDue(k, { ...K, placeHome: false }), false);
  assert.equal(P.keyShadowHomeDue(null), false);
});

test('KEY_SHADOW replayLast armShadowStart (LIMBS5 pass 4): a shadow made from the places before the last frame at rest takes the look of the frame before and replays that frame\'s look and keys; a record of another frame is not used', () => {
  assert.equal(P.KEY_SHADOW.replayLast, true);
  const rec = { n: 41, lookBefore: { yaw: 0.10, pitch: -0.2 }, look: { yaw: 0.13, pitch: -0.19 }, ax: 0, az: 0, dt: 0.05, carried: true };
  // (the check's KLF at 20 frames a second: the look's first frame is the last frame at rest; pass 3 took the look now)
  let st = app.armShadowStart(rec, 42, true);
  assert.equal(st.look, rec.lookBefore);
  assert.equal(st.replay, rec, 'its carry is played on the new shadow');
  st = app.armShadowStart({ ...rec, carried: false, ax: -1 }, 42, true);
  assert.ok(st.replay && st.replay.ax === -1, 'a key held on that frame too');
  assert.equal(app.armShadowStart({ ...rec, carried: false }, 42, true).replay, null, 'nothing to play');
  // the places taken after that frame's step (no armRestGoal): its own look, nothing replayed
  st = app.armShadowStart(rec, 42, false);
  assert.equal(st.look, rec.look); assert.equal(st.replay, null);
  // a record from an older frame, or not the right arm's (n -1): the look now, nothing replayed
  for (const [r, n] of [[rec, 43], [{ ...rec, n: -1 }, 0], [null, 42]]) assert.deepEqual(app.armShadowStart(r, n, true), { look: null, replay: null });
  assert.equal(app.armShadowStart({ ...rec, lookBefore: { yaw: NaN, pitch: NaN } }, 42, true).look, null, 'no look before: the look now');
  assert.deepEqual(app.armShadowStart(rec, 42, true, { ...P.KEY_SHADOW, replayLast: false }), { look: null, replay: null }, 'switched off: pass 3');
});

test('KEY_SHADOW placeHome armHomeLeft and the arm let go at rest (LIMBS5 pass 4, KAg): a way home under way is kept for a new movement and made into a way back to the shadow\'s places, at most armBackDegS, ending there', () => {
  const sh = P.keyShadowNew('rightArm', armQ(start));
  assert.equal(app.armHomeLeft({ at: [0, 0, 0] }, sh), true);
  assert.equal(app.armHomeLeft(null, sh), false, 'no way home under way');
  assert.equal(app.armHomeLeft({ at: [0, 0, 0] }, null), false);
  // the game's holdArmBack with the record chooseLimb now makes at rest: from the arm's places to the shadow's
  const H = app.HOLD_BODY, to = armQ(start), from = { ...to, r_shoulder_flex: to.r_shoulder_flex + 20, r_elbow_flex: to.r_elbow_flex - 12 };
  let st = { from, to, last: { ...from }, away0: 0, share: 1 }, place = { ...from }, n = 0, most = 0;
  for (; n < 200; n++) {
    const b = app.holdArmBack(st, { place, away: 0, atRest: true, dt: 1 / 60 });
    for (const id of Object.keys(b.joints)) { most = Math.max(most, Math.abs(b.joints[id] - place[id])); place[id] = b.joints[id]; }
    st = b.state;
    if (b.done) break;
  }
  assert.ok(most <= H.armBackDegS / 60 + 1e-9, `at most ${most.toFixed(2)} degrees a frame (armBackDegS ${H.armBackDegS})`);
  for (const id of Object.keys(to)) assert.ok(Math.abs(place[id] - to[id]) < 1e-9, `${id} at the shadow's place`);
  assert.equal(n, Math.ceil(20 / (H.armBackDegS / 60)) - 1, `done after ${n + 1} frames`);
});

test('HOLD_BODY memoTrunk holdMemoForget on the game\'s body (LIMBS5 pass 4): columns found with the trunk elsewhere give another answer; forgotten while the trunk carries the arm, the answer is the fresh one whatever ran before', () => {
  const H = app.HOLD_BODY;
  assert.equal(H.memoTrunk, true);
  const limb = 'rightArm', lim = G.holdLimits(limits, limb, start);
  const pt = (q, w) => G.limbPoint(rig, segmentsFor(q), limb, w);
  const solve = (q, t, memo) => G.solveLimb({ rig, segmentsFor, targets: q, limb, targetMm: t, limits: lim, opts: G.LIMB_HOLD_TRACK, project, memo });
  // (a place `mm` sideways of the hand, level, at the same distance from the shoulder: the elbow stays, so the shoulder's
  // joints stay within reuseDeg of where the columns were found, as from one frame of a hold to the next)
  const side = (q, mm) => { const r = pt(q, 'root'), e = pt(q, 'end'), v = sub(e, r), c = [v[1], -v[0], 0], n = nrm(c); return e.map((x, k) => x + c[k] * mm / n); };
  // a frame with the trunk at rest fills the notes
  const q0 = { ...start }, memo = {};
  solve(q0, side(q0, 12), memo);
  assert.ok(Array.isArray(memo.J) && memo.made === 1 && !memo.stale, 'the columns are noted');
  memo.spinAcross = true; memo.spinTurn = [1, 2];
  // the next frame: the trunk turned 25 degrees (the hand carried about 22 cm), the arm's own joints the same
  const q1 = { ...start, trunk_rot: 25 }, t1 = side(q1, 12);
  const m2 = { ...memo, J: memo.J.map(c => c.slice()), at: { ...memo.at } };
  const stale = solve(q1, t1, m2), fresh = solve(q1, t1, {});
  assert.equal(m2.made, 1, 'the columns of the trunk at rest were used again (update 69 and passes 2 and 3)');
  const dj = Math.max(...Object.keys(fresh.joints).map(id => Math.abs(fresh.joints[id] - stale.joints[id])));
  assert.ok(dj > 0.02 && stale.errorMm > fresh.errorMm + 0.5, `the old columns give another answer (${dj.toFixed(3)} degrees apart, ${stale.errorMm.toFixed(2)} against ${fresh.errorMm.toFixed(2)} mm off the place): the path depended on what ran before`);
  // forgotten as the game now does while the trunk carries the root: exactly the fresh answer; spin notes kept
  app.holdMemoForget(memo, { trunkCarries: true });
  assert.equal(memo.J, null);
  assert.ok(memo.spinAcross === true && memo.spinTurn[1] === 2, 'the keys\' turn notes are kept');
  assert.deepEqual(solve(q1, t1, memo).joints, fresh.joints);
  // taken up afresh: the columns; Reset body: everything
  memo.J = [[1, 0, 0]]; app.holdMemoForget(memo, { columns: true }); assert.equal(memo.J, null);
  app.holdMemoForget(memo, { all: true }); assert.deepEqual(Object.keys(memo), []);
  const kept = { J: [[1]], made: 3 }; app.holdMemoForget(kept, { all: true }, { ...H, memoTrunk: false });
  assert.deepEqual(kept, { J: [[1]], made: 3 }, 'switched off: update 69 (the notes kept for good)');
  assert.equal(app.holdMemoForget(null, { all: true }), null);
});

// (the check: "with the fix removed from the game the test file still passes 12 of 12". These read the game's own source:
// each rule above must be wired where the game runs it; a removed or bypassed call fails here.)
const appSrc = fs.readFileSync(path.join(repo, 'scene/src/ns-app.mjs'), 'utf8');
// (a function's text: from its line to the next function at the same indent)
const fnBody = name => {
  const i = appSrc.indexOf(name.includes('(') ? `function ${name}` : `function ${name}(`); assert.ok(i >= 0, `function ${name} in ns-app`);
  const ls = appSrc.lastIndexOf('\n', i) + 1, ind = appSrc.slice(ls, i).match(/^\s*/)[0];
  const j = appSrc.indexOf(`\n${ind}function `, i + 10);
  return appSrc.slice(i, j > i ? j : i + 20000);
};
test('LIMBS5 passes 3 and 4 are wired in the game (ns-app source): the way home, its keys-only start, the kept shadow and the way back at rest, the replay, the keys carried by the look on the shadow, keyCarry, and the solve notes forgotten', () => {
  const hold = fnBody('stepLimbHoldCore');
  assert.match(hold, /if \(limb === 'rightArm'\) stepArmHome\(h, keyed \|\| carried, dt\);/, 'the hold runs the way home each frame of the right arm');
  assert.match(fnBody('stepArmHome'), /if \(!NsPace\.keyShadowHomeDue\(sh\) \|\|/, 'the way home starts only as keyShadowHomeDue says');
  assert.match(hold, /if \(keyed && trunkCarries && limb === 'rightArm' && HOLD_BODY\.keyCarry && Array\.isArray\(h\.endLast\) && !carried && camBodyToWorld\s*&& !\(Math\.hypot\(pts\.end\[0\] - h\.endLast\[0\], pts\.end\[1\] - h\.endLast\[1\], pts\.end\[2\] - h\.endLast\[2\]\) \* 1000 < HOLD_BODY\.keyCarryMinMm\)\)/, 'keyCarry, for a carry of keyCarryMinMm or more');
  assert.match(hold, /h\.endLast = pts\.end\.slice\(\);/);
  assert.match(hold, /holdMemoForget\(holdMemo, \{ columns: true \}\);/, 'the columns dropped when the hold is taken up afresh');
  assert.match(hold, /if \(!spun && trunkCarries\) holdMemoForget\(holdMemo, \{ trunkCarries \}\);\s*let r = spun \? spun\.r : NsGrasp\.solveLimb\([^]*?memo: holdMemo/, 'and while the trunk carries the root, just before the solve that uses them');
  assert.match(hold, /fr\.n = limb === 'rightArm' \? holdFrameNo : -1;/, 'the record of the frame for the replay');
  assert.match(fnBody('resetBody() {'), /holdMemoForget\(holdMemo, \{ all: true \}\);/, 'Reset body clears every note');
  assert.ok(!/\n\s+const holdMemo = \{\};[^\n]*\n\s+const holdDbg/.test(appSrc), 'no second, never-cleared memo in the hold\'s scope');
  const choose = fnBody('chooseLimb');
  assert.match(choose, /limb !== 'rightArm' && \(!holdTrunkAtRest\(\) \|\| armHomeLeft\(armHome, armShadow\)\) && armRestJ\)/, 'the arm let go at rest with its way home under way goes back to the shadow');
  assert.match(choose, /rightBack\.to\[id\] = armShadow\.q\[id\]/);
  const i = appSrc.indexOf('else if (trunkWasRest) {'), blk = appSrc.slice(i, i + 4000);
  assert.ok(i > 0 && /if \(!\(held && armHomeLeft\(armHome, armShadow\)\)\) \{/.test(blk), 'a new movement keeps the shadow while its way home runs');
  assert.match(blk, /const st = armShadowStart\(holdFrameRec, holdFrameNo, before\);/);
  assert.match(blk, /shadowNew\('rightArm', armRestJ, st\.look\)/);
  assert.match(blk, /if \(sh && st\.replay\) sh = shadowFrame\(sh, st\.replay\.ax, st\.replay\.az, st\.replay\.dt, st\.replay\.carried, st\.replay\.look\);/);
  const frame = fnBody('shadowFrame');
  assert.match(frame, /const Tb = carried && NsPace\.KEY_SHADOW\.carryKeyed \? shadowCarryTarget\(sh, env, look\) : null;\s*const n = Tb \? NsPace\.keyShadowCarryKeys\(sh, Tb, ax, az, dt, env\) : NsPace\.keyShadowStep\(sh, ax, az, dt, env\);/, 'a frame of the keys and the look: carried, then the keys, as holdTarget');
  assert.match(frame, /return shadowTake\(n, env, look\);/);
  assert.match(fnBody('stepKeyShadows'), /if \(armShadow && \(!holdTrunkAtRest\(\) \|\| armHome\)\) armShadow = shadowFrame\(armShadow, ax, az, dt, carried\);/);
  assert.equal(P.KEY_SHADOW.carryKeyed, true);
});
