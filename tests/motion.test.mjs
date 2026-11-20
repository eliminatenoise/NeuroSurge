/** No permanent movements: every activation contracts, then simply returns (20 November 2026).
 * The owner, Message 206: "I think it's better actually if there are no permanent movements ... when you tap any area of
 * the brain, you activate any area, it will contract, then return to its previous place. But in returning to its
 * previous place, you won't see corresponding activity and muscle activation. It will just return."
 * And Message 204: "make sure there's clear movement for each brain activation area ... as precise as possible".
 * The activity (ns-actions createActivity, JOINT_LATCH) is checked with the game's own start posture and joint limits
 * (ns-body), as ns-app builds it. Display values and angles only; nothing here is measured. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivity, GAZE_DWELL, JOINT_LATCH, composePose, SHOULDER_ACTION_DEG } from '../scene/src/ns-actions.mjs';
import { DEFAULT_BODY_POSTURE, bodyPostureAngles, bodyPostureLimits } from '../scene/src/ns-body.mjs';

const H = 1 / 60;
const REST = bodyPostureAngles(DEFAULT_BODY_POSTURE), LIM = bodyPostureLimits(DEFAULT_BODY_POSTURE);
const look = (regionId, actionId) => ({ type: 'gaze', kind: 'region', regionId, actionId, at: 0 });
const away = () => ({ type: 'gaze', kind: 'empty', at: 0 });
const press = (regionId, actionId) => ({ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 });
function started(opts = {}) {
  const A = createActivity({ bodyRest: REST, bodyJointLimits: LIM, ...opts });
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [away()], H);
  return { A, s };
}
/** n frames with `ev` each frame (or none); every frame's state. */
function frames(A, s0, n, ev) { const out = []; let s = s0; for (let i = 0; i < n; i++) { s = A.stepGated(s, ev ? [ev()] : [], H).state; out.push(s); } return out; }
const last = a => a[a.length - 1];

test('a press contracts the part to the movement\'s end, then it returns to where it was, and stays', () => {
  const { A, s } = started();
  const run = frames(A, A.stepGated(s, [press('lh_elbow', 'lh_r_elbow_flex')], H).state, 150);
  const peak = Math.max(...run.map(t => t.bodyPos.r_elbow_flex));
  assert.ok(peak > 135, `the right elbow bent to its end (${peak.toFixed(1)})`);
  assert.equal(last(run).bodyPos.r_elbow_flex, REST.r_elbow_flex, 'back at the start posture');
  assert.equal(last(run).bodyGoal.r_elbow_flex, REST.r_elbow_flex, 'its place never changed: nothing is held');
  assert.deepEqual(last(run).bodyJerk, {});
  assert.equal(last(frames(A, last(run), 60)).bodyPos.r_elbow_flex, REST.r_elbow_flex, 'and it stays there');
});

test('"its previous place" is where the player put it: a limb placed with the keys or a drag returns there, not to the start', () => {
  const { A, s } = started();
  // the player bends the left knee to -60 (a 'limbPose' event: the keys, a drag or a Space carry)
  const placed = A.step(s, [{ type: 'limbPose', joints: { knee_ext_L: -60 }, at: 0 }], H);
  assert.equal(placed.bodyGoal.knee_ext_L, -60);
  for (const [actionId, sign] of [['rh_knee_flex', -1], ['rh_knee_extend', 1]]) {
    const run = frames(A, A.stepGated(placed, [press('rh_knee', actionId)], H).state, 150);
    const far = sign < 0 ? Math.min(...run.map(t => t.bodyPos.knee_ext_L)) : Math.max(...run.map(t => t.bodyPos.knee_ext_L));
    assert.ok(sign < 0 ? far < -100 : far > -2, `${actionId} went toward its end (${far.toFixed(1)})`);
    assert.equal(last(run).bodyPos.knee_ext_L, -60, `${actionId}: back at the player's place`);
  }
  // a movement asked of a part already further along than its end does not pull it back: its contraction drives to the
  // part's own place (and kicks it there: it rebounds off it, the jerk's stop), then it stays there
  const crossed = A.step(s, [{ type: 'limbPose', joints: { hip_abd_L: -20 }, at: 0 }], H);
  const k = A.stepGated(crossed, [press('rh_hip', 'rh_hip_adduct')], H).state;
  assert.equal(k.bodyJerk.hip_abd_L[0], -20, '"Swing thigh in" of a thigh already further in drives to where it is, not out to its end 0');
  const run = frames(A, k, 150);
  assert.ok(run.every(t => t.bodyPos.hip_abd_L >= -20 - 1e-9), 'never further in than it was (the place is the stop)');
  assert.equal(last(run).bodyPos.hip_abd_L, -20);
});

test('during the return no activity is shown: the area, the muscles, the beam and the display end when the return begins', () => {
  for (const opts of [{}, { jointSpring: JOINT_LATCH.reducedMotion, armPoseTau: JOINT_LATCH.reducedArmPoseTau }]) {
    const { A, s } = started(opts);
    const key = 'rh_knee/rh_knee_flex';
    const run = frames(A, A.stepGated(s, [press('rh_knee', 'rh_knee_flex')], H).state, 150);
    const contracting = run.filter(t => t.bodyJerk.knee_ext_L && t.bodyJerk.knee_ext_L[1] > 0);
    const returning = run.filter(t => t.bodyJerk.knee_ext_L && t.bodyJerk.knee_ext_L[1] === 0);
    // (the press's own step and the last partial frame are not in the list)
    assert.ok(contracting.length >= Math.round((opts.jointSpring ? opts.jointSpring.driveS : JOINT_LATCH.driveS) / H) - 2, `${contracting.length} contracting frames`);
    assert.ok(returning.length > 10, `${returning.length} returning frames`);
    // lit while it contracts: the area, its muscles, the glow link (the beam's data)
    assert.ok(contracting.some(t => t.regionActivity.rh_knee > 0.9 && t.bodyDisplay[key] > 0.9));
    assert.ok(contracting.some(t => A.glowLinks(t).links.some(l => l.regionId === 'rh_knee')), 'a beam while it contracts');
    // dark from the first frame of the return on, and no other area or muscle lights for it (no antagonist)
    for (const t of returning) {
      assert.ok(Object.values(t.regionActivity).every(v => v === 0), 'no area lit on the way back');
      assert.ok(Object.values(t.bodyDisplay).every(v => v === 0), 'no muscle lit on the way back');
      assert.deepEqual(A.glowLinks(t).links, [], 'no beam on the way back');
      assert.ok(Object.values(A.bodyMuscleDisplay(t)).every(v => v === 0), 'no muscle display on the way back');
      assert.equal(A.motionView(t).lit, null);
      assert.ok(A.motionView(t).returning.includes('knee_ext_L'));
    }
    assert.ok(Math.abs(last(run).bodyPos.knee_ext_L - REST.knee_ext_L) < 1e-6, 'back where it was');
  }
});

test('a look that leaves an area before it switches it on moves nothing, and its glow ends with it', () => {
  const { A, s } = started();
  const glance = frames(A, s, 2, () => look('rh_knee', 'rh_knee_flex'));
  assert.ok(last(glance).regionActivity.rh_knee > 0.3, 'the area lights under the crosshair at once');
  const gone = frames(A, last(glance), 30, away);
  assert.ok(gone.every(t => t.bodyPos.knee_ext_L === REST.knee_ext_L), 'nothing moved');
  assert.ok(gone[3].regionActivity.rh_knee < 0.1 && gone[9].regionActivity.rh_knee < 0.01, `the glow ended with the look (${gone[3].regionActivity.rh_knee}, ${gone[9].regionActivity.rh_knee})`);
  // one that rests there (GAZE_DWELL.latchS) switches it on; a small look movement within the area afterwards starts
  // nothing more (its light is its contraction; a click does it again)
  const rest = frames(A, s, Math.ceil(GAZE_DWELL.latchS / H) + 1, () => look('rh_knee', 'rh_knee_flex'));
  assert.ok(last(rest).bodyJerk.knee_ext_L, 'the rest started the contraction');
  let yaw = 0;
  const wiggle = frames(A, last(rest), 120, () => ({ ...look('rh_knee', 'rh_knee_flex'), yaw: (yaw += 0.01), pitch: 0 }));
  const lastLit = wiggle.findLastIndex(t => t.regionActivity.rh_knee > 0);
  assert.ok(lastLit >= 0 && lastLit < Math.ceil(JOINT_LATCH.driveS / H) + 2, `lit only for the contraction (last lit frame ${lastLit})`);
  assert.equal(last(wiggle).bodyPos.knee_ext_L, REST.knee_ext_L, 'and it returned');
});

test('no movement is thrown past its own end: the end is a stop for the contraction (Swing thigh in, Turn right arm inward)', () => {
  const { A, s } = started();
  for (const [rid, aid, j] of [['rh_hip', 'rh_hip_adduct', 'hip_abd_L'], ['lh_hip', 'lh_hip_adduct', 'hip_abd_R'], ['lh_shoulder', 'lh_r_shoulder_in', 'r_shoulder_rot']]) {
    const end = A.binding.bodyActions.get(`${rid}/${aid}`).joints[j];
    const run = frames(A, A.stepGated(s, [press(rid, aid)], H).state, 150);
    const low = Math.min(...run.map(t => t.bodyPos[j]));
    assert.ok(Math.abs(low - end) < 1e-9, `${aid}: reached its end ${end} and never passed it (${low.toFixed(2)})`);
    assert.equal(last(run).bodyPos[j], REST[j], `${aid}: and returned`);
  }
  assert.equal(A.binding.bodyActions.get('rh_hip/rh_hip_adduct').jerkStop, true, 'the map\'s own flag on "Swing thigh in"');
  // every movement of the map, pressed from the start posture: never past its end, back where it was
  for (const key of A.binding.bodyActionKeys) {
    const a = A.binding.bodyActions.get(key), [rid, aid] = key.split('/');
    const run = frames(A, A.stepGated(s, [press(rid, aid)], H).state, 200);
    for (const [j, deg] of Object.entries(a.joints)) {
      const end = Math.max(LIM[j] ? LIM[j][0] : -Infinity, Math.min(LIM[j] ? LIM[j][1] : Infinity, deg)), way = Math.sign(end - REST[j]);
      if (way !== 0) assert.ok(run.every(t => (t.bodyPos[j] - end) * way <= 1e-9), `${key}: ${j} past its end`);
      assert.ok(Math.abs(last(run).bodyPos[j] - REST[j]) < 1e-6, `${key}: ${j} not back (${last(run).bodyPos[j]})`);
    }
  }
});

test('a movement that ends where the part already is strikes its stop: a short twitch you can see, then back (Message 204)', () => {
  const { A, s } = started();
  const dead = [['rh_jaw', 'rh_jaw_clench', 'jaw_open'], ['lh_jaw', 'lh_jaw_clench', 'jaw_open'], ['rh_throat', 'rh_throat_relax', 'hyoid_elev'],
    ['lh_throat', 'lh_throat_relax', 'hyoid_elev'], ['lh_forearm', 'lh_r_supinate', 'r_pronation'], ['lh_hand', 'lh_r_together', 'r_finger_spread']];
  for (const [rid, aid, j] of dead) {
    assert.equal(A.binding.bodyActions.get(`${rid}/${aid}`).joints[j], REST[j], `${aid} ends where the start posture has it`);
    const run = frames(A, A.stepGated(s, [press(rid, aid)], H).state, 150);
    const far = Math.max(...run.map(t => Math.abs(t.bodyPos[j] - REST[j])));
    const range = LIM[j][1] - LIM[j][0];
    assert.ok(far > 5 && far <= Math.min(JOINT_LATCH.stopBounceMaxDeg, JOINT_LATCH.stopBounceShare * range) + 1e-6, `${aid}: twitch of ${far.toFixed(1)} degrees`);
    assert.equal(last(run).bodyPos[j], REST[j], `${aid}: and back on its stop`);
  }
  // "Purse the lips" also wants the upper lip at its start angle: only the lips purse, the upper lip does not twitch
  const purse = frames(A, A.stepGated(s, [press('rh_lips', 'rh_lip_purse')], H).state, 60);
  assert.ok(purse.every(t => t.bodyPos.upper_lip === REST.upper_lip));
  // under reduced motion nothing bounces: these show their light only
  const R = started({ jointSpring: JOINT_LATCH.reducedMotion, armPoseTau: JOINT_LATCH.reducedArmPoseTau });
  const quiet = frames(R.A, R.A.stepGated(R.s, [press('rh_jaw', 'rh_jaw_clench')], H).state, 60);
  assert.ok(quiet.every(t => t.bodyPos.jaw_open === REST.jaw_open));
  assert.ok(quiet.some(t => t.regionActivity.rh_jaw > 0.9));
});

test('a forearm-turn area turns the left forearm for the contraction and it turns back; the palm\'s own side is unchanged', () => {
  const { A, s } = started();
  const want = s.rotationState === 'supinated' ? 'pronation' : 'supination', home = s.rotation.value;
  const run = frames(A, A.stepGated(s, [press('rh_forearm', want)], H).state, 120);
  const far = Math.max(...run.map(t => Math.abs(t.rotation.value - home)));
  assert.ok(far > 0.8, `the forearm turned (${far.toFixed(2)} of the way)`);
  assert.ok(Math.abs(last(run).rotation.value - home) < 1e-3, 'and turned back');
  assert.equal(last(run).rotationState, s.rotationState, 'its side never changed: nothing is held');
});

test('a drag during a contraction takes the joint at once and keeps it where the drag leaves it', () => {
  const { A, s } = started();
  const mid = last(frames(A, A.stepGated(s, [press('rh_knee', 'rh_knee_flex')], H).state, 6));
  assert.ok(mid.bodyJerk.knee_ext_L && mid.bodyJerk.knee_ext_L[1] > 0, 'contracting');
  const dragged = A.step(mid, [{ type: 'limbPose', joints: { knee_ext_L: -40 }, at: 0 }], H);
  assert.equal(dragged.bodyJerk.knee_ext_L, undefined, 'the contraction of that joint ends');
  const after = frames(A, dragged, 120);
  assert.ok(after.every(t => t.bodyPos.knee_ext_L === -40), 'it stays where the drag put it');
});

test('the two planes of the right shoulder: at the peak of "out to the side" the arm is out to the side, then both go back', () => {
  const { A, s } = started();
  const raised = A.step(s, [{ type: 'limbPose', joints: { r_shoulder_flex: 150 }, at: 0 }], H);
  const run = frames(A, A.stepGated(raised, [press('lh_shoulder', 'lh_r_shoulder_abd')], H).state, 200);
  const peak = run.reduce((b, t) => (t.bodyPos.r_shoulder_abd > b.bodyPos.r_shoulder_abd ? t : b));
  assert.ok(peak.bodyPos.r_shoulder_abd > 120, `out to the side (${peak.bodyPos.r_shoulder_abd.toFixed(1)})`);
  assert.ok(Math.abs(peak.bodyPos.r_shoulder_flex - REST.r_shoulder_flex) < 20, `not raised as well (${peak.bodyPos.r_shoulder_flex.toFixed(1)})`);
  assert.equal(last(run).bodyPos.r_shoulder_flex, 150, 'raised again, where the player put it');
  assert.equal(last(run).bodyPos.r_shoulder_abd, REST.r_shoulder_abd);
});

test('the left shoulder area\'s swing contracts and returns like every other movement', () => {
  const { A, s } = started();
  const run = frames(A, A.stepGated(s, [press('rh_shoulder', 'shoulder_flexion')], H).state, 150);
  assert.equal(Math.max(...run.map(t => t.drive.shoulder_flexion)), 1, 'the swing to its end');
  assert.equal(composePose({ shoulder_flexion: 1 }).shoulderLiftDeg, SHOULDER_ACTION_DEG.lift);
  assert.equal(last(run).drive.shoulder_flexion, 0, 'and back');
  assert.equal(composePose(last(run).drive).shoulderLiftDeg, undefined, 'the arm is back on the place the look and keys give it');
});
