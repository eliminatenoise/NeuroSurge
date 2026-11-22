/** Every limb stopped by the others, a quick A across the chest, and the player's input kept where it ends at rest
 * (22 November 2026, round r31, LIMBS4; a check of Body update 68). Pure checks of ns-limb-pace: the left arm's stop
 * tested on its place (LEFT_ARM_BLOCK), the upper arm's own turn for A on a folded arm (LIMB_ACROSS), and the shadow of a
 * limb that plays the keys at rest (KEY_SHADOW, pushBackStep's ownTo), on the game's own body loaded from disk
 * (tools/load-body.mjs) where it matters. They establish what these display rules compute on this one reference body;
 * nothing here says anything about a real joint. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(path.join(repo, 'scene/src/ns-limb-pace.mjs'));
const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const G = await import(path.join(repo, 'scene/src/ns-grasp.mjs'));
const sub = (a, b) => a.map((v, k) => v - b[k]), nrm = a => Math.hypot(...a);

// ---- item 1: the left arm's stop, tested on its place --------------------------------------------------------------
test('LEFT_ARM_BLOCK: the two-rod arm at a trial place keeps its rods\' lengths and its elbow\'s side; the move is cut as the others\' are', () => {
  assert.equal(P.LEFT_ARM_BLOCK.on, true);
  const pts = { root: [0, 0, 0], bend: [0.02, -0.3, 0.05], end: [0, -0.3, 0.3] };
  const l1 = nrm(sub(pts.bend, pts.root)), l2 = nrm(sub(pts.end, pts.bend));
  // the same place: the same elbow
  assert.ok(nrm(sub(P.twoRodBendAt(pts, pts.end), pts.bend)) < 1e-9);
  for (const at of [[0.1, -0.25, 0.28], [-0.1, -0.35, 0.2], [0.05, -0.1, 0.4]]) {
    const b = P.twoRodBendAt(pts, at);
    assert.ok(Math.abs(nrm(sub(b, pts.root)) - l1) < 1e-9 && Math.abs(nrm(sub(at, b)) - l2) < 1e-9, 'both rods keep their lengths');
    // the elbow stays on its side of the shoulder-to-hand line (down, as it is now)
    assert.ok(b[1] < -0.15, `the elbow stays below (${b[1].toFixed(3)})`);
  }
  // beyond the reach: the arm straight toward the place
  const far = P.twoRodBendAt(pts, [0, -1, 0]);
  assert.ok(Math.abs(far[0]) < 1e-4 && far[1] < -0.29, `straight toward it (${far.map(v => v.toFixed(5))})`);
  // the cut: the share that stays within (aheadShare's halvings), none when a blocking limb would be gone into deeper
  const c1 = P.leftArmMoveCut([0, 0, 0], [0.1, 0, 0], p => p[0] - 0.025);
  assert.ok(c1.share > 0.2 && c1.share <= 0.25 && Math.abs(c1.at[0] - 0.1 * c1.share) < 1e-12, `share ${c1.share}`);
  assert.deepEqual(P.leftArmMoveCut([0, 0, 0], [0.1, 0, 0], () => -1), { share: 1, at: [0.1, 0, 0] });
  assert.deepEqual(P.leftArmMoveCut([0, 0, 0], [0.1, 0, 0], () => -1, () => true), { share: 0, at: [0, 0, 0] });
  assert.equal(P.leftArmMoveCut([0, 0, 0], [0.1, 0, 0], p => p[0] - 0.025, null, { ...P.LIMB_BLOCK, ahead: false }).share, 1);
});

// ---- item 2: A across the chest -------------------------------------------------------------------------------------
test('LIMB_ACROSS: the turn that moves the end the keys\' step, its way, its range and where D stops turning back', () => {
  const o = P.LIMB_ACROSS;
  assert.equal(o.on, true); assert.equal(o.back, true);
  const way = [0.01, 0, 0];
  // the end goes 2 mm a degree along the way: 5 degrees; against it: -5
  assert.ok(Math.abs(P.spinStepDeg([0.002, 0, 0], way, { rot: 35 }) - 5) < 1e-9);
  assert.ok(Math.abs(P.spinStepDeg([-0.002, 0, 0], way, { rot: 35 }) + 5) < 1e-9);
  // more than offDeg off the way: no turn
  assert.equal(P.spinStepDeg([0.0005, 0.002, 0], way, { rot: 35 }), 0);
  // the range: only what is left of it, nothing at its end
  assert.ok(Math.abs(P.spinStepDeg([-0.002, 0, 0], way, { rot: -67, lo: -70, hi: 90 }) + 3) < 1e-9);
  assert.equal(P.spinStepDeg([-0.002, 0, 0], way, { rot: -70, lo: -70, hi: 90 }), 0);
  // D turning back stops where A's turn began
  assert.ok(Math.abs(P.spinStepDeg([0.002, 0, 0], way, { rot: 33, stop: 35 }) - 2) < 1e-9);
  assert.equal(P.spinStepDeg([0.002, 0, 0], way, { rot: 35, stop: 35 }), 0);
  assert.equal(P.spinStepDeg([0.002, 0, 0], way, { rot: 0 }, { ...o, on: false }), 0);
});

// the game's body (as tests/limbs2.test.mjs loads it)
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, rig, baked } = await loadBody(repo);
const bodyOpts = { anchor: 'pelvis', baked, holdChest: false };
const asDrawn = q => body.poseBodySegments(rig, body.softExtensionAngles(body.passiveKneeAngles(q)), bodyOpts);
const limits = body.bodyPostureLimits(baked);
const project = t => body.clampBodyJointTargets(t).applied;
const start = project(body.bodyPostureAngles(baked));
const env = (limb, base = start) => ({ rig, chain: G.LIMB_CHAIN[limb], base, asDrawn, limbPoint: G.limbPoint, solveLimb: G.solveLimb, limits, project,
  opts: { follow: G.LIMB_HOLD_FOLLOW, track: G.LIMB_HOLD_TRACK, reach: G.LIMB_HOLD_REACH }, keyMove: app.limbKeyMove, keyFollow: app.limbKeyFollow, keyCut: app.keyMoveCut,
  speedMps: app.LIMB_KEYS.view.speedMps, leadM: app.LIMB_KEYS.view.leadM, maxDt: 0.1 });
const chainQ = (limb, q) => { const c = G.LIMB_CHAIN[limb], o = {}; for (const id of [...c.joints, ...(c.spin ? [c.spin.joint] : [])]) o[id] = q[id]; return o; };
const play = (sh, keys, e) => { for (const [ax, az, n] of keys) { for (let i = 0; i < n; i++) sh = P.keyShadowStep(sh, ax, az, 1 / 60, e); sh = P.keyShadowStep(sh, 0, 0, 1 / 60, e); } return sh; };
const endOf = (sh, e) => P.keyShadowPoints(sh, e).end;

test('LIMB_ACROSS on the game\'s body: after S, A brings the folded right arm\'s hand across at the keys\' step with the elbow still, and D brings it back', () => {
  const e = env('rightArm'), way = app.LIMB_KEYS.view.speedMps / 60;
  let s = play(P.keyShadowNew('rightArm', chainQ('rightArm', start)), [[0, -1, 150]], e);
  const afterS = P.keyShadowPoints(s, e), shoulder = afterS.root;
  assert.ok(P.limbFolded(afterS), 'S folds the arm');
  // A, frame by frame: the hand's and the elbow's steps
  let hand = 0, elbowMost = 0, prev = afterS;
  for (let i = 0; i < 15; i++) { s = P.keyShadowStep(s, -1, 0, 1 / 60, e); const p = P.keyShadowPoints(s, e); hand += nrm(sub(p.end, prev.end)); elbowMost = Math.max(elbowMost, nrm(sub(p.bend, prev.bend))); prev = p; }
  assert.ok(hand / 15 > 0.9 * way, `the hand ${(hand / 15 * 1000).toFixed(1)} mm a frame (the keys' ${(way * 1000).toFixed(0)}; update 68 about 1)`);
  assert.ok(elbowMost < 1e-3, `the elbow still (${(elbowMost * 1000).toFixed(2)} mm a frame at most)`);
  // toward the body's left (+x): from outside the shoulder to inside it
  assert.ok(afterS.end[0] < shoulder[0] && prev.end[0] > shoulder[0] + 0.03, `the hand from ${((afterS.end[0] - shoulder[0]) * 1000).toFixed(0)} to ${((prev.end[0] - shoulder[0]) * 1000).toFixed(0)} mm across the shoulder`);
  assert.ok(s.q.r_shoulder_rot < start.r_shoulder_rot - 30, 'by the upper arm\'s own turn');
  // D for as long: back where S left it (within a few centimetres), first by turning the upper arm back
  s = P.keyShadowStep(s, 0, 0, 1 / 60, e);
  s = play(s, [[1, 0, 15]], e);
  assert.ok(nrm(sub(endOf(s, e), afterS.end)) < 0.04, `D brings it back: ${(nrm(sub(endOf(s, e), afterS.end)) * 1000).toFixed(0)} mm from where S left it`);
  // (update 68's slow curl, the hand 0.4 to 0.5 mm a frame, is shown in the browser before and after: section 201)
});

// ---- items 3 and 4: the shadow plays the keys as the hold does at rest -------------------------------------------
test('KEY_SHADOW: a key played on the shadow of a pushed leg ends where the same key ends on the leg with no push; the joint changes made at the pushed pose do not', () => {
  assert.equal(P.KEY_SHADOW.on, true);
  const limb = 'rightLeg', e = env(limb), c = G.LIMB_CHAIN[limb];
  const q0 = chainQ(limb, start);
  // the control: the leg at its place, W held 1.4 s (as the check's X1), then S 1.6 s (X4)
  const offs = [];
  for (const keys of [[[0, 1, 84]], [[0, -1, 96]], [[-1, 0, 24], [1, 0, 24]]]) {
    const ctl = play(P.keyShadowNew(limb, q0), keys, e);
    // a pushed pose (the trunk's push: knee 15 degrees more bent, hip 8 more raised): the same keys there
    const pushed = { ...q0, knee_ext_R: q0.knee_ext_R - 15, hip_flex_R: q0.hip_flex_R + 8 };
    const atPush = play(P.keyShadowNew(limb, pushed), keys, e);
    // update 68's rule: the joint changes made at the pushed pose carried back onto the place
    const carried = {}; for (const id of c.joints) carried[id] = q0[id] + (atPush.q[id] - pushed[id]);
    const offCarry = nrm(sub(endOf({ ...ctl, q: project({ ...start, ...carried }) }, e), endOf(ctl, e)));
    // the shadow (standing at the place all along, played the same keys) is the control itself
    const sh = play(P.keyShadowNew(limb, q0), keys, e);
    const offShadow = nrm(sub(endOf(sh, e), endOf(ctl, e)));
    assert.ok(offShadow < 1e-6, `the shadow ends at the control (${(offShadow * 1000).toFixed(2)} mm)`);
    offs.push(offCarry);
  }
  // W (the check's X1: W moves this leg 2 mm at its place, but straightens the pushed knee 17 degrees): the joint changes
  // carried back end centimetres off; S folds the leg to its range end either way
  assert.ok(offs[0] > 0.01, `W: the carried joint changes end ${(offs[0] * 1000).toFixed(0)} mm off the control (the fault this replaces); S ${(offs[1] * 1000).toFixed(0)}, A then D ${(offs[2] * 1000).toFixed(0)}`);
});

test('KEY_SHADOW: the shadow\'s keys follow the hold\'s rules at rest (the keys\' step, the pace, no move after the key) and a carry within reach', () => {
  const way = app.LIMB_KEYS.view.speedMps / 60;
  for (const limb of ['rightLeg', 'leftLeg', 'rightArm']) {
    const e = env(limb), pace = P.paceFor(limb);
    let sh = P.keyShadowNew(limb, chainQ(limb, start)), prev = P.keyShadowPoints(sh, e), endMost = 0, bendMost = 0;
    for (const [ax, az, n] of [[0, 1, 30], [1, 0, 30], [0, -1, 30], [-1, 0, 30]]) {
      for (let i = 0; i < n; i++) {
        sh = P.keyShadowStep(sh, ax, az, 1 / 60, e);
        const p = P.keyShadowPoints(sh, e);
        endMost = Math.max(endMost, nrm(sub(p.end, prev.end))); bendMost = Math.max(bendMost, nrm(sub(p.bend, prev.bend))); prev = p;
      }
      sh = P.keyShadowStep(sh, 0, 0, 1 / 60, e);
      assert.equal(sh.keyed, false); assert.equal(sh.keyU, null);
    }
    assert.ok(endMost <= app.LIMB_KEYS.view.keyMost * way * 1.1 + 1e-4, `${limb}: the end at most ${(endMost * 1000).toFixed(1)} mm a frame`);
    assert.ok(bendMost <= pace.bendMost * way * 1.1 + 1e-4, `${limb}: the bend point at most ${(bendMost * 1000).toFixed(1)} mm a frame`);
    // nothing moves on a frame with no key
    const q = { ...sh.q }; sh = P.keyShadowStep(sh, 0, 0, 1 / 60, e); assert.deepEqual(sh.q, q);
    // a carry: to a point 3 cm from the end, reached; to one far out of reach, the shadow waits
    const p = P.keyShadowPoints(sh, e), t = [p.end[0], p.end[1], p.end[2] + 0.03];
    const cs = P.keyShadowCarry(sh, t, e);
    assert.ok(cs.moved && nrm(sub(P.keyShadowPoints(cs, e).end, t)) < 0.01, `${limb}: carried within reach`);
    const far = P.keyShadowCarry(sh, [p.root[0], p.root[1], p.root[2] + 3], e);
    assert.equal(far.moved, false); assert.deepEqual(far.q, sh.q);
  }
});

test('PUSH_BACK ownTo: the place a joint goes back to is the shadow\'s; the player\'s change shifts only where the way back starts', () => {
  const before = { hip_flex_R: 0, hip_abd_R: 7, knee_ext_R: -6 }, after = { hip_flex_R: 4, hip_abd_R: 15, knee_ext_R: -21 };
  let rec = P.pushBackAfter(null, before, after, 30), place = { ...after }, done = false, most = 0;
  const shadowTo = { hip_flex_R: 1, hip_abd_R: 7, knee_ext_R: -4 }; // (where the same keys end at rest)
  for (let f = 0; f < 240 && !done; f++) {
    const away = Math.max(0, 30 * (1 - (f + 1) / 60)), own = f === 20 ? { knee_ext_R: 9 } : true;
    if (f === 20) place = { ...place, knee_ext_R: place.knee_ext_R + 9 }; // (the key at the pushed pose: 9 degrees)
    const prev = { ...place };
    const b = P.pushBackStep(rec, { place, away, atRest: away === 0, dt: 1 / 60, own, ownTo: f >= 20 ? shadowTo : null });
    rec = b.rec; place = { ...place, ...b.joints }; done = b.done;
    for (const id of Object.keys(prev)) if (f !== 20) most = Math.max(most, Math.abs(place[id] - prev[id]));
  }
  assert.equal(done, true);
  for (const id of Object.keys(shadowTo)) assert.ok(Math.abs(place[id] - shadowTo[id]) < 1e-9, `${id} ends at the shadow's ${shadowTo[id]} (${place[id]})`);
  assert.ok(most < 3, `no jump: at most ${most.toFixed(2)} degrees a frame`);
  // without ownTo, the carried change (update 68): the knee ends 9 degrees past its place
  let r2 = P.pushBackAfter(null, before, after, 30), p2 = { ...after }, d2 = false;
  for (let f = 0; f < 240 && !d2; f++) {
    const away = Math.max(0, 30 * (1 - (f + 1) / 60)), own = f === 20 ? { knee_ext_R: 9 } : true;
    if (f === 20) p2 = { ...p2, knee_ext_R: p2.knee_ext_R + 9 };
    const b = P.pushBackStep(r2, { place: p2, away, atRest: away === 0, dt: 1 / 60, own }); r2 = b.rec; p2 = { ...p2, ...b.joints }; d2 = b.done;
  }
  assert.ok(Math.abs(p2.knee_ext_R - (before.knee_ext_R + 9)) < 1e-9);
});
