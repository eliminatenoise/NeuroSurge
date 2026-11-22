/** Limbs that never whip, flicker or pass through each other (22 November 2026, LIMBS2; a browser hunt of Body update 64,
 * findings H1, H2, H3 and H27, and a check of the SEEMOVE rounds: a leg left 87 mm off its place). Pure checks of
 * ns-limb-pace (the elbow's and knee's pace under the keys, the held limb's light at a range end, the stop where a pushed
 * limb cannot give way, the way back of a limb pushed during a trunk movement), of the eye view's swing with "Tilt head
 * back" (ns-app neckViewStep), and of the keys' solve on the game's own body loaded from disk (tools/load-body.mjs),
 * stepped as ns-app stepLimbHold steps it. They establish what these display rules compute on this one reference body;
 * nothing here says anything about a real joint or a real light. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(path.join(repo, 'scene/src/ns-limb-pace.mjs'));
const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const G = await import(path.join(repo, 'scene/src/ns-grasp.mjs'));

// ---- H1: the bend point's pace -----------------------------------------------------------------------------------
test('LIMB_PACE: no part of a limb faster than the keys move its end; a move spent on turning the limb round its own line is taken slowly', () => {
  const o = P.LIMB_PACE;
  assert.equal(o.on, true);
  assert.equal(o.bendMost, app.LIMB_KEYS.view.keyMost, 'the elbow or knee at the same pace as the end');
  assert.ok(o.creepMost > 0 && o.creepMost < 1 && o.rhoFar >= 1.5);
  assert.equal(o.releaseStops, true);
  const root = [0, 0, 0];
  // a straight arm swung as one piece: the elbow (halfway) goes half as far as the hand: nothing cut
  const st = { root, bend: [0, -0.3, 0], end: [0, -0.6, 0] }, stA = { root, bend: [0.005, -0.3, 0], end: [0.01, -0.6, 0] };
  assert.ok(Math.abs(P.limbBendRho(st, stA) - 1) < 1e-9, 'a swing as one piece is rho 1');
  assert.equal(P.limbPaceShare(st, stA, 0.01), 1);
  // the folded arm (hand 0.136 m out, elbow 0.3 m out): the hand 2 mm, the elbow 107 mm (the hunt's worst frames)
  const fo = { root, bend: [0, -0.28, -0.11], end: [0.04, 0, -0.13] }, foA = { root, bend: [0, -0.27, -0.004], end: [0.042, 0, -0.13] };
  const bm = Math.hypot(...foA.bend.map((v, i) => v - fo.bend[i]));
  assert.ok(P.limbBendRho(fo, foA) > o.rhoFar, 'the throw is far more than a swing would move the elbow');
  const k = P.limbPaceShare(fo, foA, 0.01);
  assert.ok(Math.abs(k * bm - o.creepMost * 0.01) < 1e-12, `cut to creepMost x the way: the elbow ${(k * bm * 1000).toFixed(2)} mm`);
  // a proportionate move whose elbow is merely fast (W opening a bent arm): cut to bendMost x the way
  const w = { root, bend: [0, -0.25, -0.15], end: [0, -0.2, -0.35] }, wA = { root, bend: [0, -0.265, -0.15], end: [0, -0.2, -0.362] };
  const wm = Math.hypot(...wA.bend.map((v, i) => v - w.bend[i]));
  assert.ok(P.limbBendRho(w, wA) < o.rhoFar);
  assert.ok(Math.abs(P.limbPaceShare(w, wA, 0.01) * wm - o.bendMost * 0.01) < 1e-12);
  // no way (no time passed), the rule off, or no move: nothing cut
  assert.equal(P.limbPaceShare(fo, foA, 0), 1);
  assert.equal(P.limbPaceShare(fo, foA, 0.01, { ...o, on: false }), 1);
  assert.equal(P.limbPaceShare(fo, fo, 0.01), 1);
  assert.equal(P.limbBendRho(fo, fo), 0);
});

// ---- H2: the held limb's light ---------------------------------------------------------------------------------------
test('HOLD_LIGHT: a joint trembling at the end of its range lights nothing new; tiny changes are no move; a real move lights its direction, a turn back lights the other after a degree', () => {
  const o = P.HOLD_LIGHT;
  assert.ok(o.minDeg > 1e-4 && o.minDeg <= 0.05 && o.flipDeg >= 0.5 && o.flipDeg <= 2);
  // the hunt's case: D held at the back end, the sideways joint 0.01 to 0.3 degrees back and forth every frame
  let s = null; const lit = [];
  s = P.holdLightStep(s, { r_shoulder_abd: 2, r_shoulder_flex: -1 }); lit.push(s.light); // (the arm still moving: lit)
  s = P.holdLightStep(s, { r_shoulder_abd: 1.5, r_shoulder_flex: -0.5 }); lit.push(s.light);
  assert.deepEqual(lit[0], { id: 'r_shoulder_abd', sign: 1 });
  assert.deepEqual(lit[1], lit[0], 'the same direction goes on being named');
  const wob = [-0.3, 0.25, -0.2, 0.3, -0.03, 0.12, -0.28, 0.2];
  const named = [];
  for (const v of wob) { s = P.holdLightStep(s, { r_shoulder_abd: v, r_shoulder_flex: 0 }); assert.equal(s.move, true); named.push(s.light); }
  assert.ok(named.every(x => x === null), `nothing new is lit while it trembles (${JSON.stringify(named)})`);
  // after the key is up: changes of 0.0001 to 0.004 degrees are no move at all
  for (const v of [0.0004, -0.004, 0.0001, 0.002]) { s = P.holdLightStep(s, { r_shoulder_abd: v }); assert.equal(s.move, false); assert.equal(s.light, null); }
  // a real turn back (A after D): the other direction is named once the joint has gone flipDeg that way
  let t = P.holdLightStep(null, { r_shoulder_abd: 3 }); assert.deepEqual(t.light, { id: 'r_shoulder_abd', sign: 1 });
  t = P.holdLightStep(t, { r_shoulder_abd: -0.6 }); assert.equal(t.light, null, 'under flipDeg the other way: not yet');
  t = P.holdLightStep(t, { r_shoulder_abd: -0.6 }); assert.deepEqual(t.light, { id: 'r_shoulder_abd', sign: -1 }, 'past flipDeg: the turn back is named');
  // a joint that goes on its way keeps the name when another moves a little more in one frame (no swapping of actions)
  let u = P.holdLightStep(null, { a: 2, b: 0.5 }); u = P.holdLightStep(u, { a: 1, b: 1.2 });
  assert.deepEqual(u.light, { id: 'a', sign: 1 });
  // off: as before (every change over 1e-6 a move, the joint that moved most lights)
  assert.deepEqual(P.holdLightStep(null, { a: 1e-5 }, { ...o, on: false }), { acc: {}, lit: null, move: true, light: true });
  // (second pass) a new key starts new runs (the app sets the state to null when the keys held change): left leg S then A,
  // the flexion run S left behind (+53.8) no longer outranks the abduction A is making
  let kS = null; for (let i = 0; i < 40; i++) kS = P.holdLightStep(kS, { hip_flex_L: 1.35, hip_abd_L: 0 });
  let carry = kS, fresh = null;
  for (let i = 0; i < 10; i++) { const dA = { hip_flex_L: 0.2, hip_abd_L: 0.6 }; carry = P.holdLightStep(carry, dA); fresh = P.holdLightStep(fresh, dA); }
  assert.deepEqual(carry.light, { id: 'hip_flex_L', sign: 1 }, 'carried over: S\'s joint (the fault)');
  assert.deepEqual(fresh.light, { id: 'hip_abd_L', sign: 1 }, 'started again: A\'s own joint');
  // a whole run of the hunt's frames lights at most two different things (the move, then nothing new): no flicker
  let r = null; const seq = [];
  for (let i = 0; i < 60; i++) { r = P.holdLightStep(r, { r_shoulder_abd: i < 10 ? 2 : (i % 2 ? 0.2 : -0.2), r_shoulder_flex: i < 10 ? -3 : 0 }); if (r.light) seq.push(`${r.light.id}${r.light.sign}`); }
  assert.ok(new Set(seq).size === 1, `one name only: ${[...new Set(seq)]}`);
});

// ---- H3: the stop where a pushed limb cannot give way ----------------------------------------------------------------
test('LIMB_BLOCK: a pair blocks once its overlap has grown past where they touched; then only a move deeper waits', () => {
  const o = P.LIMB_BLOCK;
  assert.ok(o.deepM > 0 && o.deepM <= 0.02 && o.tolM > 0 && o.tolM < o.deepM);
  assert.equal(P.pushBlocks(0.01, 0.005), false, 'grown less than deepM: the push still has it');
  assert.equal(P.pushBlocks(0.005 + o.deepM + 1e-4, 0.005), true);
  assert.equal(P.pushBlocks(0.05, 0.05), false, 'limbs that lay together from the start, no deeper: no block');
  assert.equal(P.pushBlocks(1, 0, { ...o, on: false }), false);
  assert.equal(P.blockRefuses(0.02, 0.02 + o.tolM / 2), false, 'along the other limb');
  assert.equal(P.blockRefuses(0.02, 0.015), false, 'away from it');
  assert.equal(P.blockRefuses(0.02, 0.026), true, 'deeper: waits');
  // drawn back out, the limb may come in again down to where they first touched plus deepM, and no deeper
  assert.equal(P.blockRefuses(0.005, 0.01, o, 0.004 + o.deepM), false);
  assert.equal(P.blockRefuses(0.005, 0.004 + o.deepM + 2 * o.tolM, o, 0.004 + o.deepM), true);
  // the overlap of two limbs' rods (the push's own rods and nearest points)
  const arm = { root: [0, 0, 0], bend: [0, -0.3, 0], tip: [0, -0.65, 0], r: [0.05, 0.04] };
  const legFar = { root: [0.3, -0.5, 0], bend: [0.3, -0.9, 0], tip: [0.3, -1.3, 0], r: [0.082, 0.056] };
  const legIn = { root: [0.1, -0.5, 0], bend: [0.1, -0.9, 0], tip: [0.1, -1.3, 0], r: [0.082, 0.056] };
  assert.ok(Math.abs(P.limbsOverlapM(arm, legFar, app.rodsNearest) - (0.04 + 0.082 - 0.3)) < 1e-12, 'apart: negative');
  assert.ok(Math.abs(P.limbsOverlapM(arm, legIn, app.rodsNearest) - (0.04 + 0.082 - 0.1)) < 1e-12, 'the forearm against the thigh');
  assert.equal(P.limbsOverlapM(arm, null, app.rodsNearest), -Infinity);
});

// ---- the right leg left 87 mm off: pushes during a trunk movement go back with it -------------------------------------
test('PUSH_BACK: a limb pushed during a trunk movement goes back to the places from before the first push, with the trunk, leaving a joint in a movement alone', () => {
  const o = P.PUSH_BACK;
  assert.equal(o.on, true);
  assert.ok(o.shareMin > 0 && o.shareMin < 0.1 && o.restDegS >= 30);
  const a = P.pushBackAfter(null, { hip_flex_R: 0, hip_abd_R: 7, knee_ext_R: -6 }, { hip_flex_R: 4, hip_abd_R: 12, knee_ext_R: -6 }, 20);
  assert.deepEqual(a.to, { hip_flex_R: 0, hip_abd_R: 7, knee_ext_R: -6 });
  const b = P.pushBackAfter(a, { hip_flex_R: 4, hip_abd_R: 12, knee_ext_R: -6 }, { hip_flex_R: 6, hip_abd_R: 15, knee_ext_R: -6 }, 30);
  assert.deepEqual(b.to, a.to, 'the places to go back to are the ones before the FIRST push');
  assert.equal(b.away0, 30); assert.equal(b.share, 1);
  // halfway back with the trunk, then home at rest at no more than restDegS; done only once all are home
  let place = { ...b.from }, st = b;
  const half = P.pushBackStep(st, { place, away: 15, dt: 1 / 60 });
  assert.ok(Math.abs(half.joints.hip_abd_R - (7 + (15 - 7) * 0.5)) < 1e-12 && Math.abs(half.joints.hip_flex_R - 3) < 1e-12);
  assert.equal(half.done, false);
  st = half.rec; place = { ...place, ...half.joints };
  let last = null;
  for (let i = 0; i < 200 && !(last && last.done); i++) { last = P.pushBackStep(st, { place, away: 0, atRest: true, dt: 1 / 60 }); for (const v of Object.values(last.joints)) assert.ok(Number.isFinite(v)); st = last.rec; place = { ...place, ...last.joints }; }
  assert.equal(last.done, true); assert.deepEqual(place, a.to);
  // P2 (the check's case): "Bend right knee" switched on during the trunk's return: the knee is left to its movement (no
  // place is set for it, which would end the movement), the hip goes on back; the record stays until the knee is free
  const moving = id => id === 'knee_ext_R';
  const p2 = P.pushBackStep(b, { place: { ...b.from }, moving, away: 10, dt: 1 / 60 });
  assert.equal('knee_ext_R' in p2.joints, false, 'nothing set for the moving knee');
  assert.ok('hip_abd_R' in p2.joints, 'the hip goes on back');
  const p2r = P.pushBackStep(p2.rec, { place: { ...b.from, ...p2.joints }, moving, away: 0, atRest: true, dt: 1 / 60 });
  assert.equal(p2r.done, false, 'at rest with the knee still moving: kept');
  // P1 (the check's case): the knee was in a movement when the leg was pushed: its PLACE (bodyGoal, -6: straight), not
  // where the movement had it (-90), is what it goes back to
  const p1 = P.pushBackAfter(null, { hip_flex_R: 0, hip_abd_R: 7, knee_ext_R: -6 }, { hip_flex_R: 3, hip_abd_R: 9, knee_ext_R: -6 }, 25);
  assert.equal(p1.to.knee_ext_R, -6);
  // a joint whose place something else changed meanwhile (another push) goes on from there, still home at rest
  const moved = P.pushBackStep(b, { place: { ...b.from, hip_abd_R: 20 }, away: 15, dt: 1 / 60 });
  assert.ok(!('hip_abd_R' in moved.joints) || Math.abs(moved.joints.hip_abd_R - 20) < 1e-9, 'from where it is now: no jump');
  const next = P.pushBackStep(moved.rec, { place: { ...b.from, hip_abd_R: 20 }, away: 7.5, dt: 1 / 60 });
  assert.ok(next.joints.hip_abd_R < 20 && next.joints.hip_abd_R > 7, `and on toward home with the trunk (${next.joints.hip_abd_R.toFixed(2)})`);
});

// (merged with SEEMOVE round 8) the app sets the way back's places with the activity's place-only 'limbPlace': "Bend right
// knee" switched on during the way back still bends the knee (the check's P2: with a limbPose every frame it did not)
test('PUSH_BACK through limbPlace: a knee movement switched on during the way back happens, and the leg ends at its places', async () => {
  const { createActivity } = await import(path.join(repo, 'scene/src/ns-actions.mjs'));
  const B = await import(path.join(repo, 'scene/src/ns-body.mjs'));
  const H = 1 / 60, REST = B.bodyPostureAngles(B.DEFAULT_BODY_POSTURE), LIM = B.bodyPostureLimits(B.DEFAULT_BODY_POSTURE);
  const press = { type: 'muscle', regionId: 'lh_knee', actionId: 'lh_knee_flex', regionOnly: false, at: 0 };
  const J = ['hip_flex_R', 'hip_abd_R', 'knee_ext_R'];
  const run = withBack => {
    const A = createActivity({ bodyRest: REST, bodyJointLimits: LIM });
    let s = A.step(A.state, [], 2.5); s = A.step(s, [{ type: 'gaze', kind: 'empty', at: 0 }], H);
    const before = {}; for (const j of J) before[j] = s.bodyGoal[j];
    const after = { ...before, hip_abd_R: before.hip_abd_R + 6, hip_flex_R: before.hip_flex_R + 4 }; // (a push of a few degrees)
    if (withBack) s = A.step(s, [{ type: 'limbPlace', joints: after }], 0);
    let rec = P.pushBackAfter(null, before, after, 30), most = 0;
    for (let f = 0; f < 150; f++) {
      s = A.stepGated(s, f === 6 ? [press] : [], H).state;
      if (withBack && rec) {
        const away = Math.max(0, 30 * (1 - (f + 1) / 60)), b = P.pushBackStep(rec, { place: s.bodyGoal, away, atRest: away === 0, dt: H });
        rec = b.done ? null : b.rec;
        if (Object.keys(b.joints).length) s = A.step(s, [{ type: 'limbPlace', joints: b.joints }], 0);
      }
      most = Math.max(most, Math.abs(s.bodyPos.knee_ext_R - before.knee_ext_R));
    }
    return { most, end: Object.fromEntries(J.map(j => [j, s.bodyPos[j]])), before, done: rec === null };
  };
  const ctl = run(false), now = run(true);
  assert.ok(ctl.most > 60, `the knee alone bends ${ctl.most.toFixed(0)} degrees`);
  assert.ok(now.most > 0.9 * ctl.most, `with the way back it still bends ${now.most.toFixed(0)} degrees (a limbPose every frame left it at about 0)`);
  assert.equal(now.done, true, 'the way back ends');
  for (const j of J) assert.ok(Math.abs(now.end[j] - now.before[j]) < 0.5, `${j} back at its place (${now.end[j].toFixed(1)} for ${now.before[j].toFixed(1)})`);
});

// ---- H27: the eye view's swing with "Tilt head back" ------------------------------------------------------------------
test('NECK_VIEW: "Tilt head back" swings the view up at most half the picture\'s half height, eased; the pure default is unchanged', () => {
  const o = app.NECK_VIEW, H = 1 / 60;
  assert.ok(o.upKeepShare > 0.2 && o.upKeepShare <= 0.6 && o.upRiseS > o.smoothS);
  const jerk = t => (t < 0.07 ? -100 * t / 0.07 : t < 0.94 ? -100 : Math.min(0, -100 + (t - 0.94) * 250)); // (to -100 in 70 ms, held, back by 1.34 s)
  const run = how => { let v = null; const out = []; for (let i = 0; i <= 150; i++) { const t = i * H; v = app.neckViewStep(v, { neck_rot: 0, neck_flex: jerk(t), neck_side: 0 }, H, o, how ? how(t) : null); out.push({ t, p: v.pitchDeg }); } return out; };
  const fov = 60;
  const now = run(t => ({ contracting: t < 0.7, smoothS: o.smoothS, fovYDeg: fov }));
  const peak = Math.max(...now.map(f => f.p));
  assert.ok(peak <= o.upKeepShare * fov / 2 + 1e-9 && peak > o.upKeepShare * fov / 2 - 0.5, `up ${peak.toFixed(2)} degrees at a 60 degree picture (was 30)`);
  // eased: under two thirds of the way 0.1 s in (the hunt: 26 of 30 degrees in 0.15 s)
  const at = s => now.find(f => f.t >= s).p;
  assert.ok(at(0.1) < 0.75 * peak && at(0.3) > 0.85 * peak, `0.1 s: ${at(0.1).toFixed(1)}, 0.3 s: ${at(0.3).toFixed(1)}`);
  // no jump from one frame to the next
  for (let i = 1; i < now.length; i++) assert.ok(Math.abs(now[i].p - now[i - 1].p) < 2.5, `smooth at ${now[i].t.toFixed(3)}`);
  // without the picture's height (the pure default) the swing is what it was: extendShare of the travel, under maxDeg
  const old = run(t => ({ contracting: t < 0.7, smoothS: o.smoothS }));
  assert.ok(Math.abs(Math.max(...old.map(f => f.p)) - Math.min(o.maxDeg, o.extendShare * 100)) < 0.05);
  // and it comes back to the pointer's look
  assert.equal(now[now.length - 1].p, 0);
});

// ---- H1 on the game's own body: S, then D, as stepLimbHold steps it with the pace and the swing ---------------------
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, rig, baked } = await loadBody(repo);
const opts = { anchor: 'pelvis', baked, holdChest: false };
const asDrawn = q => body.poseBodySegments(rig, body.softExtensionAngles(body.passiveKneeAngles(q)), opts);
const limits = body.bodyPostureLimits(baked);
const project = t => body.clampBodyJointTargets(t).applied;
const start = project(body.bodyPostureAngles(baked));
const sub = (a, b) => a.map((v, k) => v - b[k]), nrm = a => Math.hypot(...a), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const M = v => v.map(x => x / 1000), MM = v => v.map(x => x * 1000);
/** The view's hold of a limb on frames of the keys and the frames after them (no look), as stepLimbHold: the place on
 * the keys' line within leadM of the end, one solve a frame, limbKeyFollow / keyMoveCut on the end and LIMB_PACE (the
 * limb's own values, against the keys' step) on the elbow or knee, A or D alone on a folded limb swung by its upper
 * segment (limbSwingMove) with the turn of the line for a frame that waits, the place put on the end when the keys are
 * let go. mode 'old': none of LIMBS2 (the keys as update 64 had them); 'p2': as now. Body mm (+x the body's left). */
function holdSim(limb, q0, mode = 'p2') {
  const V = app.LIMB_KEYS.view, lead = V.leadM * 1000, right = [-1, 0, 0], on = mode === 'p2', pace = P.paceFor(limb);
  const pt = (q, w) => G.limbPoint(rig, asDrawn(q), limb, w);
  const s = { q: { ...q0 }, world: pt(q0, 'end'), keyU: null, keyLen: 0, lastErr: 0, stuck: null, memo: {}, wasKeyed: false, swings: 0, falls: 0 };
  s.step = (ax, az) => {
    const keyed = ax !== 0 || az !== 0, sp = V.speedMps * 1000 / 60;
    const root = pt(s.q, 'root'), end = pt(s.q, 'end'), bend = pt(s.q, 'bend'), pts = { root: M(root), bend: M(bend), end: M(end) };
    if (on && s.wasKeyed && !keyed) { s.world = end.slice(); s.keyU = null; }
    const classic = p => app.limbKeyMove(p, root, right, ax, az, sp);
    const swingOn = on && ax !== 0 && az === 0 && P.limbFolded(pts, pace);
    const swingOf = p => { const w = P.limbSwingMove(pts, M(p), right, ax, sp / 1000, pace); return w ? MM(w) : null; };
    let swingT = null, T = s.world.slice();
    if (keyed) { const from = s.keyU ? root.map((v, k) => v + s.keyU[k] * s.keyLen) : end; swingT = swingOn ? swingOf(from) : null; T = swingT || classic(from); }
    const gap = nrm(sub(T, end));
    let moved = false;
    if (gap > 1.5 && !(s.stuck && !keyed && nrm(sub(T, s.stuck)) < 1)) {
      let r = G.solveLimb({ rig, segmentsFor: asDrawn, targets: s.q, limb, targetMm: T, limits, opts: s.lastErr < 12 && gap < 60 ? G.LIMB_HOLD_FOLLOW : G.LIMB_HOLD_TRACK, project, memo: s.memo, spin: keyed && Boolean(G.LIMB_CHAIN[limb].spin) });
      let off = false;
      const take = (rs, way) => {
        const paceOf = (e1, b1) => (on ? P.limbPaceShare(pts, { root: pts.root, bend: M(b1), end: M(e1) }, sp / 1000, pace) : 1);
        const fol = app.limbKeyFollow(end, rs.endMm, way), p0 = fol.take ? paceOf(rs.endMm, rs.bendMm) : 1;
        if (!fol.take) return null;
        if (!(fol.share < 1 || p0 < 1)) return rs;
        let share = Math.min(fol.share, p0), joints = {}, endMm = rs.endMm;
        for (let pass = 0; pass < 4; pass++) {
          const qs = { ...s.q }; for (const id of Object.keys(rs.joints)) qs[id] = s.q[id] + (rs.joints[id] - s.q[id]) * share;
          const p = project(qs); joints = {}; for (const id of Object.keys(rs.joints)) joints[id] = p[id];
          const sg = asDrawn({ ...s.q, ...joints }); endMm = G.limbPoint(rig, sg, limb, 'end');
          const kEnd = app.keyMoveCut(sub(endMm, end), way);
          if (!(kEnd > 0)) return null;
          const k = Math.min(kEnd, paceOf(endMm, G.limbPoint(rig, sg, limb, 'bend')));
          if (!(k < 0.999)) break;
          share *= k;
        }
        return { ...rs, joints, endMm };
      };
      if (keyed) {
        const swEnd = swingT ? swingOf(end) : null, way = sub(swEnd || classic(end), end);
        let t = take(r, way);
        if (!t && swEnd) { // (the swing waits: the turn of the line for this frame)
          const w1 = sub(classic(end), end), wl = nrm(w1);
          if (wl > 1e-6) { const r1 = G.solveLimb({ rig, segmentsFor: asDrawn, targets: s.q, limb, targetMm: end.map((v, i) => v + w1[i] * lead / wl), limits, opts: G.LIMB_HOLD_TRACK, project, memo: null, spin: Boolean(G.LIMB_CHAIN[limb].spin) }); t = take(r1, w1); if (t) s.falls++; }
        } else if (t && swEnd) s.swings++;
        if (t) r = t; else off = true;
      }
      s.lastErr = r.errorMm;
      const inner = r.folded === true && r.errorMm > lead + 2;
      if (!inner && !off) { for (const id of Object.keys(r.joints)) if (Math.abs(r.joints[id] - s.q[id]) > (on ? P.HOLD_LIGHT.minDeg : 1e-6)) moved = true; if (moved) s.q = { ...s.q, ...r.joints }; }
      s.stuck = moved ? null : T.slice();
      if ((inner || off) && keyed) T = end.slice();
    }
    const end2 = pt(s.q, 'end');
    if (keyed) {
      const v = sub(T, root), len0 = nrm(v); let u = ax === 0 && s.keyU ? s.keyU : v.map(x => x / len0), len = len0;
      const e = sub(end2, root), en = nrm(e), eh = e.map(x => x / en), th = Math.acos(Math.max(-1, Math.min(1, dot(u, eh)))), most = lead / Math.max(50, len);
      if (ax !== 0 && th > most) { const k = most / th, sn = Math.sin(th) || 1, a = Math.sin((1 - k) * th) / sn, b = Math.sin(k * th) / sn; u = eh.map((x, i) => x * a + u[i] * b); const un = nrm(u); u = u.map(x => x / un); }
      const out = dot(e, u); len = Math.max(out - lead, Math.min(out + lead, len)); T = root.map((x, i) => x + u[i] * len); s.keyU = u; s.keyLen = len;
    } else { s.keyU = null; s.keyLen = 0; }
    s.world = T; s.wasKeyed = keyed;
    return { moved, bend: nrm(sub(pt(s.q, 'bend'), bend)), end: nrm(sub(end2, end)) };
  };
  return s;
}
function run(s, ax, az, frames) { let bend = 0, most = 0, end = 0; for (let f = 0; f < frames; f++) { const i = s.step(ax, az); bend += i.bend; end += i.end; most = Math.max(most, i.bend); } return { bend, most, end }; }
/** The upper segment's direction (shoulder -> elbow, hip -> knee) in the body's frame: { left, back, up } (unit). */
const upperDir = (q, limb) => { const sg = asDrawn(q), v = sub(G.limbPoint(rig, sg, limb, 'bend'), G.limbPoint(rig, sg, limb, 'root')), n = nrm(v); return { left: v[0] / n, back: v[1] / n, up: v[2] / n }; };

test('the folded arm\'s swing: judged by the upper segment, carried rigidly, at the keys\' pace, only on a folded arm', () => {
  const o = P.LIMB_PACE;
  assert.equal(o.swing, true); assert.ok(o.foldShare > 0.4 && o.foldShare < 0.8);
  assert.deepEqual(P.paceFor('rightArm'), o);
  const leg = P.paceFor('leftLeg');
  assert.ok(leg.bendMost >= 2 && leg.rhoFar === null && leg.creepMost === null, 'the legs\' own values: no creep, the knee up to about twice the ankle');
  assert.equal(leg.swing, false, 'a leg is not swung (its sideways lift ends at 45 and a swing went on by lowering the thigh)');
  assert.equal(P.limbSwingMove({ root: [0, 0, 0], bend: [0, -0.3, 0.2], end: [0, -0.1, -0.1] }, [0, -0.1, -0.1], [1, 0, 0], 1, 0.01, leg), null);
  const right = [1, 0, 0], root = [0, 0, 0];
  // a folded arm hanging forward (the elbow below and in front, the hand up by the shoulder)
  const fold = { root, bend: [0, -0.27, -0.13], end: [0.02, -0.02, -0.13] };
  assert.equal(P.limbFolded(fold), true);
  assert.equal(P.limbFolded({ root, bend: [0, -0.3, 0], end: [0, -0.6, 0] }), false, 'a straight arm is not folded');
  const d = P.limbSwingMove(fold, fold.end, right, 1, 0.01);
  const rot = (p0, p1) => { const a = sub(p0, root), b = sub(p1, root); return [nrm(a), nrm(b)]; };
  const [r0, r1] = rot(fold.end, d);
  assert.ok(Math.abs(r0 - r1) < 1e-12, 'carried rigidly: the same distance from the shoulder');
  assert.ok(d[0] > fold.end[0], 'D: to the right');
  // the angle: the hand its 10 mm unless the elbow would go more than bendMost x 10 mm
  const ang = Math.acos(Math.max(-1, Math.min(1, dot(sub(fold.end, root), sub(d, root)) / (r0 * r1))));
  const bl = nrm(fold.bend);
  assert.ok(ang * bl <= o.bendMost * 0.01 + 1e-9, `the elbow ${(ang * bl * 1000).toFixed(2)} mm`);
  // no swing where the upper segment already points to the right; none when off
  assert.equal(P.limbSwingMove({ root, bend: [0.3, 0, 0], end: [0.3, 0, 0.1] }, [0.3, 0, 0.1], right, 1, 0.01), null);
  assert.equal(P.limbSwingMove(fold, fold.end, right, 1, 0.01, { ...o, swing: false }), null);
  // A swings the other way
  assert.ok(P.limbSwingMove(fold, fold.end, right, -1, 0.01)[0] < fold.end[0]);
});

test('H1 on the game\'s body: after S, D swings the folded right arm out to the side (not behind the trunk), S, A, D ends out at the side (not over the head), never faster than the keys, nothing after the key', () => {
  const way = app.LIMB_KEYS.view.speedMps * 1000 / 60;
  // before (update 64's keys): S then D took the upper arm behind the trunk in a third of a second
  const old = holdSim('rightArm', start, 'old'); run(old, 0, -1, 150); old.step(0, 0);
  const od = run(old, 1, 0, 36);
  assert.ok(old.q.r_shoulder_flex < -50 && od.most > 4 * way, `before: D swung the upper arm to ${old.q.r_shoulder_flex.toFixed(0)} degrees, the elbow up to ${od.most.toFixed(0)} mm a frame`);
  // now: S folds it, D swings it out to the side, level, at no more than the keys' pace
  const s = holdSim('rightArm', start); const S = run(s, 0, -1, 150); s.step(0, 0);
  assert.ok(s.q.r_elbow_flex > 135, `S still folds the arm (elbow ${s.q.r_elbow_flex.toFixed(0)})`);
  assert.ok(S.most <= P.LIMB_PACE.bendMost * way + 0.05);
  const d = run(s, 1, 0, 150), u = upperDir(s.q, 'rightArm');
  assert.ok(d.most <= P.LIMB_PACE.bendMost * way + 0.05, `D: the elbow at most ${d.most.toFixed(1)} mm a frame`);
  assert.ok(u.left < -0.8 && u.back < 0.3 && Math.abs(u.up) < 0.4, `D 2.5 s: the upper arm out to the right (left ${u.left.toFixed(2)}, back ${u.back.toFixed(2)}, up ${u.up.toFixed(2)})`);
  assert.ok(s.q.r_shoulder_abd > 60 && s.swings > 50, `by the sideways lift (${s.q.r_shoulder_abd.toFixed(0)}), swung on ${s.swings} frames`);
  // S, A, D: A brings it across the chest (the swing waits there, the turn of the line takes over), D out to the side
  const t = holdSim('rightArm', start); run(t, 0, -1, 150); t.step(0, 0); run(t, -1, 0, 150); t.step(0, 0);
  assert.ok(t.q.r_shoulder_abd < -30 && t.falls > 0, `A brought the folded arm across the chest (${t.q.r_shoulder_abd.toFixed(0)})`);
  run(t, 1, 0, 150); const ut = upperDir(t.q, 'rightArm');
  assert.ok(t.q.r_shoulder_flex < 120 && ut.up < 0.5, `S, A, D: not over the head (raise ${t.q.r_shoulder_flex.toFixed(0)}, up ${ut.up.toFixed(2)}; before: 164)`);
  // a 0.1 s tap: nothing moves after the key is up
  const tp = holdSim('rightArm', start); run(tp, 0, -1, 150); tp.step(0, 0); run(tp, 1, 0, 6);
  const q = { ...tp.q }, after = run(tp, 0, 0, 60);
  assert.ok(after.bend < 0.5 && Math.abs(tp.q.r_shoulder_flex - q.r_shoulder_flex) < 0.05, `after the tap: elbow ${after.bend.toFixed(2)} mm`);
  // the straight arm: D from the start as before
  const c = holdSim('rightArm', start), cd = run(c, 1, 0, 60), co = holdSim('rightArm', start, 'old'), cod = run(co, 1, 0, 60);
  assert.ok(cd.end > 0.95 * cod.end && cd.end < 1.05 * cod.end, `D from the start: the hand ${cd.end.toFixed(0)} mm (before ${cod.end.toFixed(0)})`);
});

test('a folded leg\'s A and D keep their pace: after S, each moves the ankle at least 0.8 of what it did before LIMBS2', () => {
  for (const [limb, keys] of [['leftLeg', [-1, 1]], ['rightLeg', [1, -1]]]) {
    for (const ax of keys) {
      const now = holdSim(limb, start), was = holdSim(limb, start, 'old');
      run(now, 0, -1, 150); now.step(0, 0); run(was, 0, -1, 150); was.step(0, 0);
      const a = run(now, ax, 0, 30), b = run(was, ax, 0, 30);
      assert.ok(a.end >= 0.8 * b.end, `${limb} ${ax > 0 ? 'D' : 'A'} 0.5 s: the ankle ${a.end.toFixed(0)} mm (before ${b.end.toFixed(0)})`);
      assert.ok(a.most <= P.paceFor(limb).bendMost * app.LIMB_KEYS.view.speedMps * 1000 / 60 + 0.05, `and the knee at most ${a.most.toFixed(1)} mm a frame`);
    }
  }
});
