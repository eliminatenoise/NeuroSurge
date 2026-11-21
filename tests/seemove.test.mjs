/** Every area's movement clear and identifiable (21 November 2026; DESIGN-DECISIONS section 189).
 * The owner, Message 204: "make sure there's clear movement for each brain activation area. And you can clearly identify
 * what type of movement it is for each area." Message 205: "That goes both ways for when you're moving the body and the
 * brain area is activating." Message 206: every activation contracts, then returns, unlit.
 * The activity is run with the game's own start posture and limits (ns-body), as ns-app builds it. Display rules only;
 * nothing here is measured. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivity, JOINT_LATCH, composePose, lookHandPose, LOOK_HAND, JOINT_LIMITS, ACTION_TARGETS, REST_POSE, ROTATION, DEFAULT_BODY_MAP } from '../scene/src/ns-actions.mjs';
import { DEFAULT_BODY_POSTURE, bodyPostureAngles, bodyPostureLimits } from '../scene/src/ns-body.mjs';
import { jointAreaIndex } from '../scene/src/ns-grasp.mjs';
import { POSE_RANGES, ENVELOPE_GRID } from '../scene/src/ns-arm.mjs';

const H = 1 / 60;
const REST = bodyPostureAngles(DEFAULT_BODY_POSTURE), LIM = bodyPostureLimits(DEFAULT_BODY_POSTURE);
const press = (regionId, actionId) => ({ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 });
function started(opts = {}) {
  const A = createActivity({ bodyRest: REST, bodyJointLimits: LIM, ...opts });
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [{ type: 'gaze', kind: 'empty', at: 0 }], H);
  return { A, s };
}
const run = (A, s, n) => { const out = []; for (let i = 0; i < n; i++) { s = A.stepGated(s, [], H).state; out.push(s); } return out; };
const bodyMoves = () => {
  const out = [];
  for (const r of DEFAULT_BODY_MAP.regions) for (const a of r.actions || []) if (a.joints && Object.keys(a.joints).length) out.push({ r, a });
  return out;
};
const endOf = (j, deg) => Math.max(LIM[j] ? LIM[j][0] : -Infinity, Math.min(LIM[j] ? LIM[j][1] : Infinity, deg));

test('a movement is never thrown back past where the part started, so it always shows the way it is named', () => {
  assert.equal(JOINT_LATCH.backStop, true);
  const { A, s } = started();
  let checked = 0;
  for (const { r, a } of bodyMoves()) {
    const frames = run(A, A.stepGated(s, [press(r.id, a.id)], H).state, 60);
    for (const [j, deg] of Object.entries(a.joints)) {
      const end = endOf(j, deg), way = Math.sign(end - REST[j]);
      if (way === 0) continue;
      for (const t of frames) assert.ok((t.bodyPos[j] - REST[j]) * way >= -1e-9, `${r.id}/${a.id}: ${j} went the other way (${(t.bodyPos[j] - REST[j]).toFixed(2)})`);
      checked++;
    }
  }
  assert.ok(checked > 90, `${checked} joints checked`);
  // the movements with little room: "Straighten left knee" was thrown 11.6 degrees into a bend; now it straightens
  for (const [rid, aid, j, want] of [['rh_knee', 'rh_knee_extend', 'knee_ext_L', 6], ['lh_elbow', 'lh_r_elbow_extend', 'r_elbow_flex', -8], ['lh_shoulder', 'lh_r_shoulder_add', 'r_shoulder_abd', -5]]) {
    const frames = run(A, A.stepGated(s, [press(rid, aid)], H).state, 60);
    const far = frames.reduce((m, t) => (Math.abs(t.bodyPos[j] - REST[j]) > Math.abs(m) ? t.bodyPos[j] - REST[j] : m), 0);
    assert.ok(Math.abs(far - want) < 0.01, `${aid}: its largest movement is its own (${far.toFixed(2)}, want ${want})`);
  }
  // without the rule (the behaviour before) the knee is thrown into a bend of more than 10 degrees
  const old = started({ jointSpring: { ...JOINT_LATCH, backStop: false } });
  const bend = run(old.A, old.A.stepGated(old.s, [press('rh_knee', 'rh_knee_extend')], H).state, 60).reduce((m, t) => Math.min(m, t.bodyPos.knee_ext_L - REST.knee_ext_L), 0);
  assert.ok(bend < -10, `before: a bend of ${(-bend).toFixed(1)} degrees`);
  // the stop bounce (a movement that ends at a stop the part is already at) still twitches off its stop
  const jaw = run(A, A.stepGated(s, [press('rh_jaw', 'rh_jaw_clench')], H).state, 30);
  assert.ok(Math.max(...jaw.map(t => t.bodyPos.jaw_open)) > 5, 'the jaw still twitches');
  // reduced motion has no rebound to stop
  assert.equal(JOINT_LATCH.reducedMotion.backStop, undefined);
});

test('both ways: moving a joint the way a movement goes lights that movement\'s own area and spot', () => {
  const idx = jointAreaIndex(DEFAULT_BODY_MAP, REST, LIM);
  const twin = id => id.replace(/^(lh|rh)_/, m => (m === 'lh_' ? 'rh_' : 'lh_'));
  let single = 0;
  for (const { r, a } of bodyMoves()) {
    const J = Object.entries(a.joints).filter(([j, deg]) => Math.abs(endOf(j, deg) - REST[j]) >= 0.5 || (LIM[j] && (Math.abs(deg - LIM[j][0]) < 0.5 || Math.abs(deg - LIM[j][1]) < 0.5)));
    for (const [j, deg] of J) {
      const rest = REST[j], side = Math.abs(deg - rest) >= 0.5 ? (deg > rest ? '1' : '-1') : Math.abs(deg - LIM[j][1]) < 0.5 ? '1' : '-1';
      const got = idx[j] && idx[j][side];
      assert.ok(got, `${r.id}/${a.id}: nothing lights for ${j} ${side}`);
      const own = (got.regionId === r.id && got.actionId === a.id) || (got.regionId === twin(r.id) && got.actionId === twin(a.id));
      if (Object.keys(a.joints).length === 1) { assert.ok(own, `${r.id}/${a.id}: ${j} ${side} lights ${got.regionId}/${got.actionId}`); single++; }
      // the whole hand's close / open moves every digit: a digit moved alone lights that digit's own movement
      else if (!own) assert.match(got.regionId, /_(thumb|index|middle|ring|little)$/, `${r.id}/${a.id}: ${j} ${side} lights ${got.regionId}`);
    }
  }
  assert.ok(single >= 100, `${single} single-joint movements`);
});

const HAND_MOVES = ['grasp_close', 'open_hand', 'spread_fingers', 'fingers_together', 'index_flexion', 'index_extension', 'middle_flexion', 'middle_extension',
  'ring_flexion', 'ring_extension', 'little_flexion', 'little_extension', 'thumb_mcp_flexion', 'thumb_mcp_extension', 'thumb_opposition', 'thumb_reposition'];
const lookOnly = look => lookHandPose(composePose({}).joints, {}, look);
const moved = (id, look, rule) => {
  const d = { [id]: 1 }, J = lookHandPose(composePose(d).joints, d, look, rule ? { rule } : undefined), base = lookOnly(look);
  return Object.keys(J).reduce((m, k) => Math.max(m, Math.abs(J[k] - base[k])), 0);
};

test('the look\'s closing or opening of the left hand never cancels a movement of the hand', () => {
  assert.equal(LOOK_HAND.rule, 'under');
  // the looks of the strip's left-hand areas: level, and a little below the point where the closing begins (under 2 %)
  for (const look of [{ close: 0 }, { close: 0.006 }, { close: 0.016 }, { close: 0.3 }, { open: 0.01 }, { open: 0.5 }]) {
    for (const id of HAND_MOVES) {
      const deg = moved(id, look);
      assert.ok(deg >= (id === 'fingers_together' ? 4.9 : 12), `${id} at ${JSON.stringify(look)}: its joints move ${deg.toFixed(1)} degrees`);
    }
  }
  // the rule before ('max'): the faintest closing cancelled every straightening, the faintest opening every bend
  for (const id of ['open_hand', 'index_extension', 'middle_extension', 'ring_extension', 'little_extension', 'thumb_mcp_extension', 'thumb_reposition']) {
    assert.equal(moved(id, { close: 0.006 }, 'max'), 0, `${id}: nothing moved under the old rule`);
  }
  for (const id of ['index_flexion', 'thumb_mcp_flexion', 'fingers_together']) assert.equal(moved(id, { open: 0.01 }, 'max'), 0, `${id}: nothing moved under the old rule`);
  // a movement at full drive ends at its own end whatever the look; nothing under way: the hand is where the look puts it
  for (const look of [{ close: 0.006 }, { close: 0.85 }, { open: 1 }]) {
    const d = { index_extension: 1 }, J = lookHandPose(composePose(d).joints, d, look);
    for (const k of ['index_mcp_flex', 'index_pip_flex', 'index_dip_flex']) assert.equal(J[k], ACTION_TARGETS.index_extension.joints[k], `${k} at ${JSON.stringify(look)}`);
    const old = lookHandPose(composePose({}).joints, {}, look, { rule: 'max' }), now = lookOnly(look);
    for (const k of Object.keys(now)) assert.ok(Math.abs(now[k] - old[k]) < 1e-9, `${k}: the look alone puts the hand where it did`);
  }
  // half way through a movement the joint is half way between the look's pose and the movement's end (no jump)
  {
    const look = { close: 0.5 }, base = lookOnly(look), d = { index_flexion: 0.5 }, J = lookHandPose(composePose(d).joints, d, look);
    assert.ok(Math.abs(J.index_mcp_flex - (base.index_mcp_flex + 90) / 2) < 1e-9, `${J.index_mcp_flex}`);
    // the other fingers keep the look's pose while one finger moves
    assert.equal(J.ring_mcp_flex, base.ring_mcp_flex);
  }
  // the Space grip wins every digit; "Relax" commands no pose of its own, so the look's pose stays under it
  const grip = { grasp_close: 1 };
  assert.deepEqual(lookHandPose(composePose(grip).joints, grip, { open: 1 }), composePose(grip).joints);
  const relax = { relax_release: 1 };
  assert.deepEqual(lookHandPose(composePose(relax).joints, relax, { close: 0.4 }), lookOnly({ close: 0.4 }));
  // every result inside the joints' limits; the wrist is never the look's; no look: the very same object back
  for (const look of [{ close: 1 }, { open: 1 }, { close: 0.3 }]) for (const id of HAND_MOVES) for (const v of [0.3, 1]) {
    const d = { [id]: v, wrist_flexion: 1 }, P = composePose(d).joints, J = lookHandPose(P, d, look);
    for (const k of Object.keys(J)) assert.ok(J[k] >= JOINT_LIMITS[k][0] - 1e-9 && J[k] <= JOINT_LIMITS[k][1] + 1e-9, `${id} ${k} ${J[k]}`);
    assert.equal(J.wrist_flex, P.wrist_flex);
  }
  const P0 = composePose({}).joints;
  assert.equal(lookHandPose(P0, {}, { close: 0, open: 0 }), P0);
  assert.equal(lookHandPose(P0, {}, null), P0);
});

test('a single finger\'s "Straighten" uncurls it to straight, and the thumb swings out from the palm (left hand)', () => {
  const restHand = composePose({}).joints;
  for (const d of ['index', 'middle', 'ring', 'little']) {
    const ext = composePose({ [`${d}_extension`]: 1 }).joints;
    // the finger as in the open hand: straight (10 past straight at the knuckle), from its relaxed bend
    assert.deepEqual([ext[`${d}_mcp_flex`], ext[`${d}_pip_flex`], ext[`${d}_dip_flex`]], [-10, 0, 0]);
    assert.ok(restHand[`${d}_mcp_flex`] - ext[`${d}_mcp_flex`] >= 30 && restHand[`${d}_pip_flex`] >= 25, `${d}: uncurls from ${restHand[`${d}_mcp_flex`]} / ${restHand[`${d}_pip_flex`]}`);
  }
  // (tried and dropped: 30 past straight at the knuckle; no clearer from the eyes, and a wider hand-fit envelope)
  assert.equal(JOINT_LIMITS.index_mcp_flex[0], -10);
  const th = composePose({ thumb_mcp_extension: 1 }).joints;
  assert.equal(th.thumb_ip_flex, -20);
  assert.ok(restHand.thumb_ip_flex - th.thumb_ip_flex >= 30, `thumb tip: ${th.thumb_ip_flex} from ${restHand.thumb_ip_flex}`);
  // "Move left thumb out from the palm" ended 12 units from the relaxed thumb's place; now as far out as the right thumb's
  assert.equal(ACTION_TARGETS.thumb_reposition.joints.thumb_cmc_opp, -15);
  assert.ok(REST_POSE.thumb_cmc_opp - composePose({ thumb_reposition: 1 }).joints.thumb_cmc_opp >= 25);
  // the hand's fit covers the new ranges: the action limits, the pose ranges and the envelope's grid agree
  assert.deepEqual([...JOINT_LIMITS.index_mcp_flex], [...POSE_RANGES.mcp_flex]);
  assert.deepEqual([...JOINT_LIMITS.thumb_ip_flex], [...POSE_RANGES.thumb_ip_flex]);
  assert.deepEqual([...JOINT_LIMITS.thumb_cmc_opp], [...POSE_RANGES.thumb_cmc_opp]);
  assert.equal(ENVELOPE_GRID.mcp_flex[0], POSE_RANGES.mcp_flex[0]);
  assert.equal(ENVELOPE_GRID.thumb_ip_flex[0], POSE_RANGES.thumb_ip_flex[0]);
  assert.equal(ENVELOPE_GRID.thumb_cmc_opp[0], POSE_RANGES.thumb_cmc_opp[0]);
  // every action's end lies inside the limits and on or between the grid's levels
  for (const [id, t] of Object.entries(ACTION_TARGETS)) for (const [k, v] of Object.entries(t.joints)) {
    assert.ok(v >= JOINT_LIMITS[k][0] && v <= JOINT_LIMITS[k][1], `${id} ${k} ${v}`);
  }
});

test('"Turn left palm up" with the palm already up strikes its stop: a twitch you can see, then back', () => {
  const { A, s } = started();
  assert.equal(s.rotation.value, 1, 'the palm is up at the start');
  const frames = run(A, A.stepGated(s, [press('rh_forearm', 'supination')], H).state, 90);
  const low = Math.min(...frames.map(t => t.rotation.value));
  // 38 of the forearm's 160 degrees (JOINT_LATCH stopBounceMaxDeg), as the right palm's twitch
  assert.ok(1 - low > 0.2 && 1 - low < 0.26, `the forearm twitches ${((1 - low) * 160).toFixed(0)} degrees off its stop`);
  const at = frames.findIndex(t => t.rotation.value === low);
  assert.ok(at * H < 0.12, `at its furthest after ${(at * H).toFixed(2)} s`);
  assert.equal(frames[frames.length - 1].rotation.value, 1, 'and it is back on the stop');
  assert.equal(frames[frames.length - 1].rotation.speed, 0);
  assert.equal(frames[frames.length - 1].rotationState, 'supinated');
  for (const t of frames) assert.ok(t.rotation.value >= 0 && t.rotation.value <= 1);
  // lit for the contraction as every movement, dark after it
  const lit = frames.filter(t => (t.regionActivity.rh_forearm || 0) > 0.5).length * H;
  assert.ok(lit > 0.3 && lit < 0.45, `lit ${lit.toFixed(2)} s`);
  // "Turn left palm down" has room: it turns the whole way, without a strike, and comes back
  const down = run(A, A.stepGated(s, [press('rh_forearm', 'pronation')], H).state, 180);
  assert.ok(Math.min(...down.map(t => t.rotation.value)) < 0.02);
  assert.equal(down[down.length - 1].rotation.value, 1);
  // under reduced motion nothing kicks: the forearm stays (as the body's stop bounce)
  const R = started({ jointSpring: JOINT_LATCH.reducedMotion, rotationTau: ROTATION.reducedMotionPoseTau });
  const calm = run(R.A, R.A.stepGated(R.s, [press('rh_forearm', 'supination')], H).state, 60);
  assert.ok(calm.every(t => t.rotation.value === 1));
});

test('a movement stays at its end long enough to read: lit for the contraction, held 0.3 s more unlit, then back unlit', async () => {
  assert.equal(JOINT_LATCH.driveS, 0.4, 'the lit contraction is not lengthened');
  assert.equal(JOINT_LATCH.holdS, 0.3);
  assert.equal(JOINT_LATCH.reducedMotion.holdS, 0.3);
  const { A, s } = started();
  const old = started({ jointSpring: { ...JOINT_LATCH, holdS: 0 } });
  let least = Infinity, leastOld = Infinity;
  for (const { r, a } of bodyMoves()) {
    const key = `${r.id}/${a.id}`;
    const frames = run(A, A.stepGated(s, [press(r.id, a.id)], H).state, 180);
    const before = run(old.A, old.A.stepGated(old.s, [press(r.id, a.id)], H).state, 180);
    for (const [j, deg] of Object.entries(a.joints)) {
      const end = endOf(j, deg), room = Math.abs(end - REST[j]);
      if (room < 0.5) continue; // (a movement that ends where the part already is: the stop bounce)
      const near = f => f.filter(t => Math.abs(t.bodyPos[j] - REST[j]) >= 0.8 * room).length * H;
      assert.ok(near(frames) >= 0.5, `${key}: ${j} near its end for ${near(frames).toFixed(2)} s`);
      least = Math.min(least, near(frames)); leastOld = Math.min(leastOld, near(before));
      // through the hold the part is at its end and the movement is still under way
      const at = Math.round((JOINT_LATCH.driveS + JOINT_LATCH.holdS) / H) - 3;
      assert.ok(Math.abs(frames[at].bodyPos[j] - end) <= 0.2 * room, `${key}: ${j} at its end late in the hold (${frames[at].bodyPos[j].toFixed(1)} of ${end})`);
      assert.ok(frames[at].bodyJerk[j] && frames[at].bodyJerk[j][1] > 0, `${key}: ${j} still held`);
    }
    // the light: the same as without the hold (the contraction's, about 0.4 s), dark through the hold and the return
    const lit = f => f.filter(t => (t.regionActivity[r.id] || 0) > 0.5).length * H;
    assert.ok(lit(frames) >= 0.3 && lit(frames) <= 0.45, `${key}: lit ${lit(frames).toFixed(2)} s`);
    assert.equal(lit(frames), lit(before), `${key}: lit exactly as long as without the hold`);
    const dark = frames.findIndex((t, i) => i > 6 && Object.values(t.regionActivity).every(v => v === 0));
    assert.ok(dark >= 0 && dark * H < 0.5, `${key}: dark ${(dark * H).toFixed(2)} s after the press`);
    for (const t of frames.slice(dark)) assert.ok(Object.values(t.regionActivity).every(v => v === 0) && Object.values(t.bodyDisplay).every(v => v === 0), `${key}: nothing lit in the hold or on the way back`);
    const last = frames[frames.length - 1];
    for (const j of Object.keys(a.joints)) assert.ok(Math.abs(last.bodyPos[j] - REST[j]) < 1e-6, `${key}: ${j} back where it was`);
    assert.deepEqual(last.bodyJerk, {}, `${key}: over`);
  }
  assert.ok(least >= 0.5 && leastOld < 0.4, `near the end for at least ${least.toFixed(2)} s (it was ${leastOld.toFixed(2)} s without the hold)`);
  // the game arm's movements and the left forearm's turn hold the same way
  const bend = run(A, A.stepGated(s, [press('rh_elbow', 'elbow_flexion')], H).state, 180);
  const at = Math.round(0.7 / H) - 3;
  assert.ok(bend[at].drive.elbow_flexion > 0.9 && bend[at].armJerk.elbow_flexion[0] > 0, 'the left elbow is held bent');
  assert.equal(bend[at].regionActivity.rh_elbow, 0, 'unlit by then');
  assert.equal(bend[bend.length - 1].drive.elbow_flexion, 0);
  const turn = run(A, A.stepGated(s, [press('rh_forearm', 'pronation')], H).state, 180);
  assert.ok(turn[at].rotation.value < 0.02 && Array.isArray(turn[at].rotation.move), 'the left forearm is held turned');
  assert.equal(turn[at].regionActivity.rh_forearm, 0, 'unlit by then');
  assert.equal(turn[turn.length - 1].rotation.value, 1);
  assert.equal(turn[turn.length - 1].rotation.move, null);
  // a press during the hold is a further press: the part is thrown into its end again and the light comes on again
  const knee = run(A, A.stepGated(s, [press('rh_knee', 'rh_knee_flex')], H).state, at);
  const again = run(A, A.stepGated(knee[knee.length - 1], [press('rh_knee', 'rh_knee_flex')], H).state, 12);
  assert.ok(again.some(t => (t.regionActivity.rh_knee || 0) > 0.9), 'lit again');
  assert.ok(again[again.length - 1].bodyJerk.knee_ext_L[1] > 0.4, 'and its own contraction and hold run from the press');
  // reduced motion: the same hold on its soft spring
  const R = started({ jointSpring: JOINT_LATCH.reducedMotion });
  const calm = run(R.A, R.A.stepGated(R.s, [press('rh_knee', 'rh_knee_flex')], H).state, 240);
  const room = Math.abs(endOf('knee_ext_L', -135) - REST.knee_ext_L);
  assert.ok(calm.filter(t => Math.abs(t.bodyPos.knee_ext_L - REST.knee_ext_L) >= 0.8 * room).length * H >= 0.5);
  assert.ok(Math.abs(calm[calm.length - 1].bodyPos.knee_ext_L - REST.knee_ext_L) < 1e-6);
});

test('the eye view keeps its swing through a neck movement\'s hold and comes back with the neck, never past the pointer', async () => {
  const app = await import('../scene/src/ns-app.mjs');
  // (22 November 2026: at the hold the game uses, 0.3 s, and at a longer one, 0.6 s. At 0.3 the neck is still moving
  // until about 0.35 s, so the view would keep its swing without neckViewStep's rule for a neck still in its movement;
  // at 0.6, without that rule, the view eased back during the hold and was then carried 9 degrees past the pointer
  // when "Tilt head back" returned, 8 after a side tilt: this test fails then.)
  for (const holdS of [JOINT_LATCH.holdS, 0.6]) {
    const { A, s } = started({ jointSpring: { ...JOINT_LATCH, holdS } });
    const keepAt = Math.round((JOINT_LATCH.driveS + holdS - 0.05) / H);
    for (const [rid, aid, field, sign] of [['rh_neck', 'rh_neck_turn_left', 'yawDeg', 1], ['rh_neck', 'rh_neck_extend', 'pitchDeg', 1], ['rh_neck', 'rh_neck_flex', 'pitchDeg', -1], ['rh_neck', 'rh_neck_side', 'rollDeg', 1]]) {
      const frames = run(A, A.stepGated(s, [press(rid, aid)], H).state, 300);
      // (the view counts from where the neck stood before the press: the start posture)
      let v = app.neckViewStep(null, { neck_rot: 0, neck_flex: 0, neck_side: 0 }, H, app.NECK_VIEW, { contracting: false, smoothS: app.NECK_VIEW.smoothS }); const view = [];
      for (const t of frames) {
        const neck = {}; let contracting = false;
        for (const j of ['neck_rot', 'neck_flex', 'neck_side']) { neck[j] = t.bodyPos[j] - REST[j]; if (t.bodyJerk[j] && t.bodyJerk[j][1] > 0) contracting = true; }
        v = app.neckViewStep(v, neck, H, app.NECK_VIEW, { contracting, smoothS: app.NECK_VIEW.smoothS });
        view.push(v[field] * sign + 0);
      }
      const peak = Math.max(...view), tag = `${aid}, hold ${holdS} s`;
      assert.ok(peak > 10, `${tag}: the view swings ${peak.toFixed(1)} degrees`);
      assert.ok(view.every(x => x > -0.31), `${tag}: never past the pointer the other way (${Math.min(...view).toFixed(2)})`);
      // held through the hold: just before the return the view is still at its swing
      assert.ok(view[keepAt] > 0.9 * peak, `${tag}: the swing is kept through the hold (${view[keepAt].toFixed(1)} of ${peak.toFixed(1)})`);
      assert.equal(view[view.length - 1], 0, `${tag}: and ends at the pointer's own view`);
      assert.equal(v.active, false);
    }
  }
});

test('no movement flashes: the part never covers more than half its room in the first frame, goes to its end without turning back, and never jumps half its room in one frame', () => {
  // 22 November 2026 (an independent check of section 189): with backStop the kick of a movement with little room crossed
  // the end inside the press frame and the part stood at its end for one frame between two at its start ("Straighten
  // left knee" 6.0, 0.0, 0.3, 1.3 ... 6.0 degrees). JOINT_LATCH.kickRoomOmega caps the kick.
  assert.equal(JOINT_LATCH.kickRoomOmega, 1);
  const check = (A, s) => {
    const bad = [];
    for (const { r, a } of bodyMoves()) for (const [j, deg] of Object.entries(a.joints)) {
      const end = endOf(j, deg), room = end - REST[j];
      if (Math.abs(room) < 0.5) continue; // (the stop strikes: a twitch off a stop, with no room of its own)
      const tr = [A.stepGated(s, [press(r.id, a.id)], H).state];
      for (let i = 0; i < 40; i++) tr.push(A.stepGated(tr[tr.length - 1], [], H).state);
      const f = tr.map(t => (t.bodyPos[j] - REST[j]) / room);
      const key = `${r.id}/${a.id} ${j}`;
      if (f[0] > 0.5) bad.push(`${key}: ${f[0].toFixed(2)} of its room in the first frame`);
      const arrive = f.findIndex(x => x >= 1 - 1e-6);
      if (arrive < 0) bad.push(`${key}: never reaches its end`);
      for (let i = 1; i <= arrive; i++) if (f[i] < f[i - 1] - 1e-9) { bad.push(`${key}: turns back at frame ${i} before its end`); break; }
      for (let i = 1; i < f.length; i++) if (Math.abs(f[i] - f[i - 1]) > 0.5) { bad.push(`${key}: jumps ${Math.abs(f[i] - f[i - 1]).toFixed(2)} of its room at frame ${i}`); break; }
      // a further press during the contraction (at 0.15 s): no jump of half the room either
      let t2 = tr[9];
      const g = [(t2.bodyPos[j] - REST[j]) / room];
      t2 = A.stepGated(t2, [press(r.id, a.id)], H).state; g.push((t2.bodyPos[j] - REST[j]) / room);
      for (let i = 0; i < 24; i++) { t2 = A.stepGated(t2, [], H).state; g.push((t2.bodyPos[j] - REST[j]) / room); }
      for (let i = 1; i < g.length; i++) if (Math.abs(g[i] - g[i - 1]) > 0.5) { bad.push(`${key}: a further press jumps ${Math.abs(g[i] - g[i - 1]).toFixed(2)} of its room`); break; }
    }
    return bad;
  };
  const { A, s } = started();
  assert.deepEqual(check(A, s), []);
  // without the cap: the five movements with little room flash (both halves), and the fast ones cover over half their room
  const old = started({ jointSpring: { ...JOINT_LATCH, kickRoomOmega: undefined } });
  const bad = check(old.A, old.s);
  for (const k of ['rh_knee/rh_knee_extend', 'lh_elbow/lh_r_elbow_extend', 'lh_shoulder/lh_r_shoulder_add', 'rh_hip/rh_hip_adduct', 'rh_neck/rh_neck_flex']) {
    assert.ok(bad.some(b => b.startsWith(k) && /jumps/.test(b)), `${k} flashed before: ${bad.filter(b => b.startsWith(k)).join('; ')}`);
  }
  // the knee frame by frame now: 2.2, 4.5, 6.0, then thrown back part of the way and in again, never past its start
  const knee = [A.stepGated(s, [press('rh_knee', 'rh_knee_extend')], H).state];
  for (let i = 0; i < 20; i++) knee.push(A.stepGated(knee[knee.length - 1], [], H).state);
  const kd = knee.map(t => t.bodyPos.knee_ext_L - REST.knee_ext_L);
  assert.deepEqual(kd.slice(0, 3).map(x => Math.round(x * 10) / 10), [2.2, 4.5, 6]);
  assert.ok(Math.min(...kd.slice(3, 12)) > 3 && Math.min(...kd.slice(3, 12)) < 5, `thrown back to ${Math.min(...kd.slice(3, 12)).toFixed(1)}, then in again`);
});

test('a face movement\'s shape is whole at the movement\'s end (it stopped at three quarters)', async () => {
  const { FACE_MOVE, faceShapeWeights, FACE_SHAPES } = await import('../scene/src/ns-face-move.mjs');
  assert.equal(FACE_MOVE.fullDeg, 15);
  let n = 0;
  for (const { r, a } of bodyMoves()) {
    const face = Object.keys(a.joints).filter(j => FACE_SHAPES.some(sh => sh.joint === j));
    for (const j of face) {
      const deg = a.joints[j]; if (deg === 0) continue;
      const w = faceShapeWeights({ [j]: deg });
      const shape = FACE_SHAPES.find(sh => sh.joint === j && sh.sign === Math.sign(deg));
      assert.equal(w[shape.key], 1, `${r.id}/${a.id}: ${shape.key} at ${w[shape.key]}`);
      n++;
    }
  }
  assert.ok(n >= 24, `${n} face movements`);
});

test('a toe movement goes from the look\'s toe pose to its own end: the look\'s curl no longer cancels "Lift toes"', async () => {
  const { digitUnderMove } = await import('../scene/src/ns-app.mjs');
  // nothing under way: the rule it was (the more curled when closing, the more lifted when opening)
  assert.equal(digitUnderMove(0, 6.7, true), 6.7);
  assert.equal(digitUnderMove(20, 6.7, true), 20);
  assert.equal(digitUnderMove(0, -10, false), -10);
  assert.equal(digitUnderMove(-20, -10, false), -20);
  // "Lift toes" (to -40 from 0) with the look's curl at 6.7: before, max(-40, 6.7) = 6.7 at every moment (nothing moved)
  const note = [-40, 0.3, -1];
  assert.equal(digitUnderMove(0, 6.7, true, note, 0), 6.7, 'at its place: where the look puts it');
  assert.equal(digitUnderMove(-40, 6.7, true, note, 0), -40, 'at its end: exactly the movement\'s end');
  const half = digitUnderMove(-20, 6.7, true, note, 0);
  assert.ok(Math.abs(half - (6.7 - 40) / 2) < 1e-9, `half way: ${half}`);
  // it comes back the same way, and a rebound past either end is not carried on
  assert.equal(digitUnderMove(5, 6.7, true, note, 0), 6.7);
  assert.equal(digitUnderMove(-45, 6.7, true, note, 0), -40);
  // a curl with the look's curl: from the look's pose to the curl's end; looking up, a curl is not cancelled either
  assert.equal(digitUnderMove(40, 6.7, true, [40, 0.2, 1], 0), 40);
  assert.equal(digitUnderMove(40, -10, false, [40, 0.2, 1], 0), 40);
  assert.equal(digitUnderMove(0, -10, false, [40, 0.2, 1], 0), -10);
  // the Space grip's own curl still wins
  assert.equal(digitUnderMove(-40, 40, true, note, 0, 40), 40);
  // a movement that ends at the joint's place, or a joint without a place: the rule it was
  assert.equal(digitUnderMove(0, 6.7, true, [0, 0.2, 0], 0), 6.7);
  assert.equal(digitUnderMove(-40, 6.7, true, note, null), 6.7);
});
