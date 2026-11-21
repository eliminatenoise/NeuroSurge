/** Switching movements on (21 November 2026: the browser hunt of Body update 62, findings H1 to H8; DESIGN-DECISIONS
 * section 184). The owner, Message 206: "when you tap any area of the brain, you activate any area, it will contract,
 * then return to its previous place. But in returning to its previous place, you won't see corresponding activity and
 * muscle activation. It will just return." Message 204: "make sure there's clear movement for each brain activation
 * area. And you can clearly identify what type of movement it is for each area."
 * Pure rules checked here: the eye view's swing with a neck movement (ns-app neckViewStep, H1's flicker), the look held
 * while a movement carries the view (CARRIED_LOOK, carriedLookStep, H1 and H7), the area an arrow key starts from
 * (areaStepStartId, H6), and the game arm's sideways wrist bend (ns-rig wrist_dev; ns-actions composePose and the
 * activity, H8) on the placeholder arm rig. Angles and choices of the game's own display rules; nothing here is measured. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const NA = await import(path.join(repo, 'scene/src/ns-actions.mjs'));
const R = await import(path.join(repo, 'scene/src/ns-rig.mjs'));
const { buildPlaceholderArm } = await import(path.join(repo, 'scene/src/ns-placeholder.mjs'));
const H = 1 / 60;

// "Bend head forward" from the bowed start posture, as the browser hunt recorded it frame by frame (held neck flexion
// from the start posture, degrees): the jerk takes the neck to its 10-degree end in one frame, the stop throws it back
// almost to the start, it slams in again, and holds; then the return.
const SLAM = [0, 10, 0.5, 1.2, 0.8, 0.6, 7.3, 10, 10, 10, 9.6, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
const neckRun = (how, extraFrames = 150) => {
  const out = []; let s = null;
  const flex = i => (i < SLAM.length ? SLAM[i] : Math.max(0, 10 - (i - SLAM.length + 1) * 0.6));
  for (let i = 0; i < SLAM.length + extraFrames; i++) {
    const h = how ? { ...how, contracting: i < SLAM.length } : null;
    s = app.neckViewStep(s, { neck_rot: 0, neck_flex: flex(i), neck_side: 0 }, H, app.NECK_VIEW, h);
    out.push(s.pitchDeg);
  }
  return out;
};

test('H1: a neck movement\'s slam and rebound dip the eye view once and hold it; the view eases, never flickers, and comes back', () => {
  // the old rule (still the pure default): the picture went to the full tilt for one frame and back up again
  const old = neckRun(null);
  assert.ok(Math.abs(old[1] + 15) < 1e-9 && old[2] > -1, `the flicker the hunt saw: ${old.slice(0, 7).map(v => v.toFixed(1))}`);
  // the app's rule: the furthest point of the contraction is kept, and the view eases onto it
  const now = neckRun({ smoothS: app.NECK_VIEW.smoothS });
  const contraction = now.slice(0, SLAM.length);
  for (let i = 1; i < contraction.length; i++) assert.ok(contraction[i] <= contraction[i - 1] + 1e-9, `no back-swing at frame ${i}: ${contraction.slice(0, 10).map(v => v.toFixed(1))}`);
  assert.ok(Math.min(...contraction) === -15, `it reaches the whole dip (${Math.min(...contraction)})`);
  for (let i = 1; i < now.length; i++) assert.ok(Math.abs(now[i] - now[i - 1]) < 5, `no jump of the view at frame ${i} (${now[i - 1]} -> ${now[i]})`);
  assert.equal(now[now.length - 1], 0, 'back to the pointer\'s own view');
});

test('H1 / H7: while a movement carries the view and the player leaves the look alone, the look stays on the area that started it', () => {
  const { carriedLookStep, carriedLookMoving, CARRIED_LOOK } = app;
  assert.deepEqual([...CARRIED_LOOK.joints].sort(), ['neck_flex', 'neck_rot', 'neck_side', 'trunk_flex', 'trunk_rot', 'trunk_side']);
  assert.equal(carriedLookMoving({ trunk_flex: [-25, 0.3, 0] }), true, 'a trunk contraction');
  assert.equal(carriedLookMoving({ neck_rot: [0, 0, 0] }), true, 'a neck return');
  assert.equal(carriedLookMoving({ knee_ext_L: [10, 0.2, 0] }), false, 'a knee moves no eye');
  assert.equal(carriedLookMoving(null), false);
  const gaze = { target: 'region', kind: 'region', regionId: 'lh_trunk', actionId: null, regionActionId: 'lh_trunk_extend', u: 0.4, hemisphere: 'left', isLeftArm: false, point: [1, 2, 3] };
  const lastMove = { regionId: 'lh_trunk', actionId: 'lh_trunk_extend' };
  assert.equal(carriedLookStep(null, { carrying: false, gaze, lastMove, lookMs: 5, lookMsBefore: 5 }), null, 'nothing carries the view: no hold');
  const h1 = carriedLookStep(null, { carrying: true, gaze, lastMove, lookMs: 5, lookMsBefore: 5 });
  assert.equal(h1.off, false);
  assert.equal(h1.gaze.regionId, 'lh_trunk');
  assert.equal(h1.gaze.regionActionId, 'lh_trunk_extend', 'the spot that started it ("Lean back"), whatever spot the moving view slides onto');
  // the moving view puts the crosshair elsewhere: the hold does not look at the new gaze at all
  const h2 = carriedLookStep(h1, { carrying: true, gaze: { ...gaze, regionActionId: 'lh_trunk_side' }, lastMove, lookMs: 5, lookMsBefore: 5 });
  assert.equal(h2, h1);
  // the player moves the look: the hold ends for the rest of this movement
  const h3 = carriedLookStep(h2, { carrying: true, gaze, lastMove, lookMs: 9, lookMsBefore: 5 });
  assert.equal(h3.off, true);
  assert.equal(carriedLookStep(h3, { carrying: true, gaze, lastMove, lookMs: 9, lookMsBefore: 9 }).off, true, 'and does not come back while the movement lasts');
  assert.equal(carriedLookStep(h3, { carrying: false, gaze, lastMove, lookMs: 9, lookMsBefore: 9 }), null, 'the movement is over: ready for the next');
  // an area key's step is the player's look too
  assert.equal(carriedLookStep(h1, { carrying: true, gaze, lastMove, lookMs: 5, lookMsBefore: 5, stepped: true }).off, true);
  // no hold when the movement did not start from the area the look is on (a tapped muscle, a look already elsewhere), or
  // when the player was moving the look as it began
  assert.equal(carriedLookStep(null, { carrying: true, gaze, lastMove: { regionId: 'rh_trunk' }, lookMs: 5, lookMsBefore: 5 }).off, true);
  assert.equal(carriedLookStep(null, { carrying: true, gaze: { ...gaze, target: 'glass', regionId: null }, lastMove, lookMs: 5, lookMsBefore: 5 }).off, true);
  assert.equal(carriedLookStep(null, { carrying: true, gaze, lastMove, lookMs: 6, lookMsBefore: 5 }).off, true);
  assert.equal(carriedLookStep(null, { carrying: true, gaze, lastMove, lookMs: 5, lookMsBefore: 5 }, { ...CARRIED_LOOK, on: false }), null, 'off: no hold');
});

test('H6: the first arrow key from a look on no area goes to the nearest area on the key\'s side of the crosshair', () => {
  const { areaStepStartId } = app;
  const ray = { origin: [0, 0, 0], dir: [0, 0, -1] }; // looking along -z: the picture's right is +x
  const pts = [{ id: 'left_low', w: [-1, -0.5, -5] }, { id: 'right_low', w: [1.1, -0.5, -5] }, { id: 'right_high', w: [0.2, 2, -5] }];
  // left_low is nearest of all (the old rule took it for both keys)
  assert.equal(areaStepStartId(pts, ray, 1), 'right_low');
  assert.equal(areaStepStartId(pts, ray, -1), 'left_low');
  // nothing on the key's side: the nearest of all, so the key still goes somewhere
  assert.equal(areaStepStartId(pts.filter(p => p.id !== 'left_low'), ray, -1), 'right_low');
  // turned round (looking along +z, the picture's right is -x)
  assert.equal(areaStepStartId(pts.map(p => ({ id: p.id, w: [p.w[0], p.w[1], -p.w[2]] })), { origin: [0, 0, 0], dir: [0, 0, 1] }, 1), 'left_low');
  assert.equal(areaStepStartId([], ray, 1), null);
  assert.equal(areaStepStartId(null, ray, 1), null);
});

test('H8: the game arm\'s wrist bends sideways: toward the thumb for the radial spot, toward the little finger for the ulnar one, and back', () => {
  const pa = buildPlaceholderArm(), rig = R.deriveRig(pa.bones, pa.rigOptions);
  assert.ok(R.POSE_JOINTS.includes('wrist_dev') && Array.isArray(rig.axes.wrist_dev));
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const fk = joints => R.forwardKinematics(rig, { shoulderMatrix: I, joints });
  const at = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(...a);
  const rest = fk({}), rad = fk({ wrist_dev: 20 }), uln = fk({ wrist_dev: -30 });
  const mcp = rig.pivots.middle_mcp, wrist = rig.pivots.wrist;
  const m0 = at(rest.get('hand'), mcp), mR = at(rad.get('hand'), mcp), mU = at(uln.get('hand'), mcp);
  // (the thumb side as the posed hand has it: the rest frame's radial direction turned with the forearm's pronation)
  const F = rest.get('hand'), radial = [0, 1, 2].map(r => F[r] * rig.radial[0] + F[4 + r] * rig.radial[1] + F[8 + r] * rig.radial[2]);
  assert.ok(dot(sub(mR, m0), radial) > 0, 'radial deviation moves the hand toward the thumb side');
  assert.ok(dot(sub(mU, m0), radial) < 0, 'ulnar deviation moves it toward the little finger');
  // the turn is about the wrist: the wrist stays, the hand's length is kept, and the angle is the one asked
  assert.ok(len(sub(at(rad.get('hand'), wrist), at(rest.get('hand'), wrist))) < 1e-9, 'the wrist pivot stays put');
  const a = sub(m0, wrist), b = sub(mR, wrist), c = sub(mU, wrist);
  assert.ok(Math.abs(Math.acos(dot(a, b) / len(a) / len(b)) * 180 / Math.PI - 20) < 0.5, 'about 20 degrees toward the thumb');
  assert.ok(Math.abs(Math.acos(dot(a, c) / len(a) / len(c)) * 180 / Math.PI - 30) < 0.5, 'about 30 degrees toward the little finger');
  // the forearm does not move, and a flexion still bends the hand as before (no sideways part at 0)
  assert.deepEqual([...rad.get('forearm')], [...rest.get('forearm')]);
  assert.deepEqual([...fk({ wrist_flex: 30, wrist_dev: 0 }).get('hand')], [...fk({ wrist_flex: 30 }).get('hand')]);
  // the movements drive it to the joint's ends
  assert.deepEqual(NA.JOINT_LIMITS.wrist_dev, [-30, 20]);
  assert.equal(NA.composePose({ wrist_radial_deviation: 1 }).joints.wrist_dev, 20);
  assert.equal(NA.composePose({ wrist_ulnar_deviation: 1 }).joints.wrist_dev, -30);
  assert.equal(NA.composePose({}).joints.wrist_dev, 0, 'at rest: straight');
  assert.equal(NA.composePose({ relax_release: 1 }).joints.wrist_dev, 0, 'letting go does not drive the wrist');
  // in play: a press on the spot contracts it, then it returns, with nothing lit on the way back
  const A = NA.createActivity();
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [{ type: 'gaze', kind: 'empty', at: 0 }], H);
  s = A.stepGated(s, [{ type: 'muscle', regionId: 'rh_wrist', actionId: 'wrist_radial_deviation', regionOnly: false, at: 0 }], H).state;
  assert.ok(A.motionView(s).arm.contracting.includes('wrist_radial_deviation'), JSON.stringify(A.motionView(s).arm));
  let peak = 0, back = null;
  for (let i = 0; i < 150; i++) {
    s = A.stepGated(s, [], H).state;
    peak = Math.max(peak, s.drive.wrist_radial_deviation);
    if (back === null && A.motionView(s).arm.returning.includes('wrist_radial_deviation')) back = i;
    if (back !== null) assert.equal(s.regionActivity.rh_wrist || 0, 0, 'nothing lit on the way back');
  }
  assert.equal(peak, 1, 'driven to the end');
  assert.ok(back !== null, 'it returned');
  assert.equal(s.drive.wrist_radial_deviation, 0, 'back at its place');
});
