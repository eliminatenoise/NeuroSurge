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

test('your own left hand turns its face toward the eye while the look is on a hand or finger area or a hand movement is driven, and turns back with the finger (drawn only)', async () => {
  const app = await import('../scene/src/ns-app.mjs');
  const { LEFT_HAND_TILT: T, leftHandTiltWanted, leftHandTiltStep, leftHandTiltDeg } = app;
  assert.equal(T.on, true);
  assert.equal(T.deg, 15, 'update 65: 25 read as "Bend left wrist"');
  assert.equal(T.outS, 0.3);
  // wanted: the look on one of the six hand and finger areas, or one of the hand's own movements driven (its note's
  // drive time left above 0: contracting, or held at its end)
  for (const id of ['rh_hand', 'rh_little', 'rh_ring', 'rh_middle', 'rh_index', 'rh_thumb']) assert.equal(leftHandTiltWanted({ target: 'region', regionId: id }, null), true, id);
  for (const id of ['rh_wrist', 'rh_forearm', 'rh_elbow', 'lh_hand', 'rh_toes']) assert.equal(leftHandTiltWanted({ target: 'region', regionId: id }, null), false, id);
  assert.equal(leftHandTiltWanted(null, { armJerk: { index_extension: [0.2, 0] } }), true);
  assert.equal(leftHandTiltWanted(null, { armJerk: { index_extension: [0, 1.5] } }), false, 'not on its way back (update 65)');
  assert.equal(leftHandTiltWanted(null, { armJerk: { wrist_flexion: [0.2, 0] } }), false, 'a wrist movement is the wrist\'s own');
  assert.equal(leftHandTiltWanted({ target: 'empty' }, { armJerk: {} }), false);
  assert.equal(leftHandTiltWanted({ target: 'region', regionId: 'rh_index' }, null, { ...T, on: false }), false);
  // eased in and out, never a jump: no frame changes the share by more than a fifth at 60 frames a second
  let s = 0; const up = [];
  for (let i = 0; i < 60; i++) { const n = leftHandTiltStep(s, true, 1 / 60); assert.ok(n >= s && n - s < 0.2, `in: ${s} -> ${n}`); s = n; up.push(s); }
  assert.equal(s, 1, 'whole after a second');
  assert.ok(up[Math.round(T.inS * 60) - 1] > 0.55 && up[Math.round(T.inS * 60) - 1] < 0.7, 'two thirds in at inS');
  for (let i = 0; i < 120; i++) { const n = leftHandTiltStep(s, false, 1 / 60); assert.ok(n <= s && s - n < 0.2, `out: ${s} -> ${n}`); s = n; }
  assert.equal(s, 0, 'gone after two seconds: nothing stays moved');
  assert.equal(leftHandTiltStep(NaN, false, 1 / 60), 0);
  // a whole "Straighten left index" from the activity (the look elsewhere): the tilt goes with the finger's drive and
  // comes back with its return; it is nearly gone when the finger is back (update 64: whole until 1.9 s)
  for (const [r, id] of [['rh_index', 'index_extension'], ['rh_index', 'index_flexion'], ['rh_hand', 'open_hand'], ['rh_thumb', 'thumb_mcp_extension']]) {
    const { A, s: s0 } = started();
    const frames = run(A, A.stepGated(s0, [press(r, id)], H).state, 240);
    let share = 0, back = -1, shareBack = NaN, maxShare = 0;
    const d0 = frames[0].drive[id];
    for (let i = 0; i < frames.length; i++) {
      share = leftHandTiltStep(share, leftHandTiltWanted(null, frames[i]), H);
      maxShare = Math.max(maxShare, share);
      const d = frames[i].drive[id];
      if (back < 0 && i > 45 && Math.abs(d) < 0.02 * Math.max(Math.abs(d0), 1)) { back = i; shareBack = share; }
    }
    assert.ok(maxShare > 0.9, `${id}: the tilt comes in while the finger is driven (${maxShare.toFixed(2)})`);
    assert.ok(back > 0, `${id}: the finger comes back`);
    assert.ok(shareBack < 0.2, `${id}: the tilt has nearly gone when the finger is back (${shareBack.toFixed(2)} at ${((back + 1) / 60).toFixed(2)} s)`);
    assert.equal(share, 0, `${id}: nothing left after 4 s`);
  }
  // the side follows the forearm's turn: palm up = wrist flexion (+), palm down = extension (-), half way none
  assert.equal(leftHandTiltDeg(1, 1), 15);
  assert.equal(leftHandTiltDeg(1, 0), -15);
  assert.equal(leftHandTiltDeg(1, 0.5), 0);
  assert.equal(leftHandTiltDeg(0.5, 1), 7.5);
  assert.equal(leftHandTiltDeg(0, 1), 0);
  // inside the wrist's range and the hand-fit envelope's levels, with the reach's own wrist share on top
  const { WRIST_RANGE_DEG, ENVELOPE_GRID } = await import('../scene/src/ns-arm.mjs');
  assert.ok(T.deg < WRIST_RANGE_DEG[1] && -T.deg > WRIST_RANGE_DEG[0]);
  assert.equal(ENVELOPE_GRID.wrist_flex[0], WRIST_RANGE_DEG[0]);
  assert.equal(ENVELOPE_GRID.wrist_flex[ENVELOPE_GRID.wrist_flex.length - 1], WRIST_RANGE_DEG[1]);
});

test('the tip beside the crosshair keeps off your own left hand\'s box when it can', async () => {
  const { tipSides } = await import('../scene/src/ns-quiet.mjs');
  const P = { x: 800, y: 450, width: 1600, height: 900, side: 'left', tipW: 200, tipH: 70 };
  // the usual placement: on the left half of the picture for the brain's right half, below the point
  assert.deepEqual(tipSides(P), { right: true, low: false });
  // a hand under the usual box: above the point instead
  assert.deepEqual(tipSides({ ...P, avoid: { x0: 600, y0: 470, x1: 700, y1: 600 } }), { right: true, low: true });
  // a hand left of the point, above and below: to the other side
  assert.deepEqual(tipSides({ ...P, avoid: { x0: 500, y0: 300, x1: 790, y1: 700 } }), { right: false, low: false });
  // a hand that leaves no clear placement inside the picture: the usual one
  assert.deepEqual(tipSides({ ...P, avoid: { x0: 0, y0: 0, x1: 1600, y1: 900 } }), { right: true, low: false });
  // no box, or no size known: the rule as before (the right edge, the bottom edge)
  assert.deepEqual(tipSides({ ...P, avoid: { x0: 600, y0: 470, x1: 700, y1: 600 }, tipW: 0, tipH: 0 }), { right: true, low: false });
  assert.deepEqual(tipSides({ x: 1400, y: 800, width: 1600, height: 900 }), { right: true, low: true });
  assert.deepEqual(tipSides({ x: 300, y: 100, width: 1600, height: 900 }), { right: false, low: false });
});

test('"Bend head forward" bows the upper body with the neck from outside only, eased, back with it, never the eye (drawn only)', async () => {
  const app = await import('../scene/src/ns-app.mjs');
  const { NECK_BOW, neckBowDeg, neckBowStep, headPoseForLook, eyeHeadPose, HEAD_LOOK } = app;
  assert.equal(NECK_BOW.on, true);
  assert.equal(NECK_BOW.deg, 15);
  assert.equal(NECK_BOW.roomDeg, 10, 'the neck\'s forward room from the bowed start posture');
  assert.equal(NECK_BOW.outsideOnly, true, 'update 65: in the eye view it showed nothing of the mirror body and lifted your own opened chest');
  assert.equal(neckBowDeg(0), 0);
  assert.equal(neckBowDeg(5), 7.5);
  assert.equal(neckBowDeg(10), 15);
  assert.equal(neckBowDeg(14), 15, 'never past the whole bow');
  assert.equal(neckBowDeg(-30), 0, 'a neck tilted back does not bow');
  assert.equal(neckBowDeg(5, { ...NECK_BOW, on: false }), 0);
  // the head pose bows only by what the frame hands in (offsets.neck_bow): a neck offset alone bows nothing
  const look = { yaw: 0, pitch: -0.445 };
  const rest = headPoseForLook(look, null, HEAD_LOOK), neck = headPoseForLook(look, { neck_flex: 10 }, HEAD_LOOK);
  const full = headPoseForLook(look, { neck_flex: 10, neck_bow: 15 }, HEAD_LOOK), half = headPoseForLook(look, { neck_flex: 5, neck_bow: 7.5 }, HEAD_LOOK);
  assert.equal(rest.bowDeg, 0);
  assert.equal(neck.bowDeg, 0, 'no bow unless the frame hands one in (the eye, the hold and the camera trials never do)');
  assert.equal(half.bowDeg, 7.5);
  assert.equal(full.bowDeg, 15);
  // drawn as the trunk's bend under the head (bendDeg, ns-body lookBendDeg); the held trunk bend itself is not changed
  assert.equal(full.bendDeg, full.heldTrunkDeg + 15);
  assert.equal(full.heldTrunkDeg, 0);
  assert.deepEqual(full.look, rest.look, 'the camera\'s look is the look alone, as before');
  // THE EYE: the head the camera stands on (eyeHeadPose, which headAttachment uses) is the same with and without the bow
  const eb = eyeHeadPose(full), en = eyeHeadPose(neck);
  assert.ok(eb && en);
  assert.notEqual(full.bendDeg, neck.bendDeg, 'the drawn trunk bows');
  for (const k of ['joints', 'bendDeg', 'bendDirDeg', 'twistDeg', 'carry']) assert.deepEqual(eb[k], en[k], `the eye's head: ${k}`);
  assert.equal(eb.bendDeg, 0);
  assert.equal(eyeHeadPose(rest), null, 'at rest the eye stands on the drawn head itself');
  // inside the trunk's own range: a trunk already at its forward end gets no bow
  const bent = headPoseForLook(look, { neck_flex: 10, trunk_flex: 80, neck_bow: 15 }, HEAD_LOOK);
  assert.equal(bent.bowDeg, 0);
  assert.ok(bent.bendDeg <= HEAD_LOOK.trunkFlexDeg + 1e-9);
  // over a whole "Bend head forward" from the activity: from outside the bow follows the neck out and back, eased (the
  // neck's spring no longer shakes the trunk), and ends at 0; in the eye view there is none at all
  const { A, s } = started();
  const frames = run(A, A.stepGated(s, [press('rh_neck', 'rh_neck_flex')], H).state, 200);
  let bowOut = 0, bowEye = 0; const bows = [];
  for (const t of frames) {
    const n = t.bodyPos.neck_flex - REST.neck_flex;
    bowOut = neckBowStep(bowOut, n, 1, H); bowEye = neckBowStep(bowEye, n, 0, H);
    bows.push(bowOut);
    assert.equal(bowEye, 0, 'the eye view: no bow');
  }
  assert.ok(Math.max(...bows) > 13, `nearly the whole bow at the neck's end (${Math.max(...bows).toFixed(1)})`);
  for (let i = 1; i < bows.length; i++) assert.ok(Math.abs(bows[i] - bows[i - 1]) < 3, `no jolt of the bow at frame ${i} (${bows[i - 1].toFixed(1)} -> ${bows[i].toFixed(1)})`);
  // (update 64 wobbled 15 -> 9.8 -> 15 degrees within 0.2 s with the neck's spring; eased it dips far less)
  const peak = bows.findIndex(b => b === Math.max(...bows)), firstTop = bows.findIndex(b => b > 10);
  const dip = Math.max(...bows.slice(firstTop, peak + 1).map((b, i, a) => Math.max(...a.slice(0, i + 1)) - b));
  assert.ok(dip < 3, `the trunk does not wobble with the neck's spring (dip ${dip.toFixed(2)} degrees)`);
  assert.equal(bows[bows.length - 1], 0, 'and none left after the return');
  // the change of view fades it in proportion (the camera's way out of the eye, ns-camera progress)
  assert.ok(Math.abs(neckBowStep(15 * 0.5, 10, 0.5, 10) - 7.5) < 1e-9);
});

test('the face\'s moving edges (eyelid margins, lips) get the ink line of their own outline code; the forehead does not', async () => {
  const { OUTLINE_FACE_EDGE_GROUP, OUTLINE_GROUPS, OUTLINE_MIRROR_OFFSET, outlineAdjacency } = await import('../scene/src/ns-outline.mjs');
  const { FACE_EDGE_INK } = await import('../scene/src/ns-scene-three.mjs');
  const { faceMuscleOf, FACE_MOVING_MUSCLES } = await import('../scene/src/ns-face-move.mjs');
  assert.equal(OUTLINE_FACE_EDGE_GROUP, 15);
  assert.ok(!Object.values(OUTLINE_GROUPS).includes(OUTLINE_FACE_EDGE_GROUP), 'a code no limb group uses');
  assert.ok(OUTLINE_FACE_EDGE_GROUP + OUTLINE_MIRROR_OFFSET < 32, 'inside the ID pass\'s table');
  const t = outlineAdjacency(32), adj = (a, b) => t[a * 32 + b] === 255;
  for (const off of [0, OUTLINE_MIRROR_OFFSET]) {
    const f = OUTLINE_FACE_EDGE_GROUP + off;
    assert.ok(adj(f, f), 'no line between the two halves of one muscle');
    for (const g of Object.values(OUTLINE_GROUPS)) assert.ok(!adj(f, g + off), `a line against ${g + off}: the ink`);
  }
  // every other pair as before
  for (const off of [0, OUTLINE_MIRROR_OFFSET]) assert.ok(adj(OUTLINE_GROUPS.head + off, OUTLINE_GROUPS.trunk + off));
  assert.equal(FACE_EDGE_INK.on, true);
  assert.deepEqual([...FACE_EDGE_INK.muscles], ['orbicularis-oculi-palpebral', 'orbicularis-oris']);
  // (update 65: the head's parts poke through the thin forehead muscle in small spots, each a strong line in a code of
  // its own: dark specks on the mirror body's forehead at rest)
  assert.ok(!FACE_EDGE_INK.muscles.includes('frontalis'));
  for (const m of FACE_EDGE_INK.muscles) assert.ok(FACE_MOVING_MUSCLES.includes(m), `${m} is a face muscle the shapes move`);
  assert.equal(faceMuscleOf('zf-orbicularis-oris-r').name, 'orbicularis-oris');
  assert.equal(faceMuscleOf('zf-frontalis-l').name, 'frontalis');
});

test('the face\'s moving edges (outline codes 15 and 31) are the head\'s in the hidden-part pass', async () => {
  const { OUTLINE_FACE_EDGE_GROUP: F, OUTLINE_GROUPS: G, OUTLINE_MIRROR_OFFSET: M } = await import('../scene/src/ns-outline.mjs');
  const { seeThingOfGroup, seeLimbOfGroup, seeShows, SEE_JOIN_MASKS, SEE_THINGS } = await import('../scene/src/ns-see.mjs');
  assert.equal(seeThingOfGroup(F), SEE_THINGS.ownTrunk);
  assert.equal(seeThingOfGroup(F + M), SEE_THINGS.mirrorTrunk);
  assert.equal(seeThingOfGroup(F), seeThingOfGroup(G.head));
  assert.equal(seeLimbOfGroup(F), 0);
  assert.equal(seeLimbOfGroup(F + M), 0);
  // a part of the mirror body's head behind its lips or eyelids is the same thing: never a ghost
  assert.equal(seeShows({ group: F + M }, { group: G.head + M }), false);
  // they join what the head joins (the head and the trunk), the head itself included, both ways
  const joins = (a, b) => ((SEE_JOIN_MASKS[a] >> b) & 1) === 1;
  assert.equal(SEE_JOIN_MASKS[F], SEE_JOIN_MASKS[G.head]);
  for (const g of Object.values(G)) assert.equal(joins(g, F), joins(g, G.head), `group ${g}`);
  assert.ok(joins(F, G.head) && joins(G.head, F) && joins(F, F) && joins(F, G.trunk));
  assert.ok(!joins(F, G.lHand));
  // the graphics card's copies of the rules say the same
  const src = (await import('node:fs')).readFileSync(new URL('../scene/src/ns-see.mjs', import.meta.url), 'utf8');
  assert.equal(src.split('if ( k == ${OUTLINE_FACE_EDGE_GROUP} ) k = ${G.head};').length, 3, 'nsLimbOf and nsThingOf');
});

test('your own trunk moving the view never leaves the held limb off its place: the look carries it by its own turn, and the place is taken only in the eye view (HOLD_BODY)', async () => {
  const { HOLD_BODY, HOLD_REST, holdBodySame, holdCarryPoint, holdPlaceRule, holdSideOf, viewFrameOf } = await import('../scene/src/ns-app.mjs');
  assert.equal(HOLD_BODY.on, true);
  // the trunk as it was: the same within epsDeg; a missing joint is 0; the drawn bow counts (it moves the shoulders)
  assert.equal(holdBodySame(null, null), true);
  assert.equal(holdBodySame({ trunk_flex: 0 }, null), false);
  assert.equal(holdBodySame({ trunk_flex: 0, trunk_rot: 0 }, {}), true);
  assert.equal(holdBodySame({ trunk_flex: 12 }, { trunk_flex: 12 + HOLD_BODY.epsDeg / 2 }), true);
  assert.equal(holdBodySame({ trunk_flex: 12 }, { trunk_flex: 11 }), false);
  for (const k of ['trunk_flex', 'trunk_rot', 'trunk_side', 'neck_bow']) assert.equal(holdBodySame({}, { [k]: 3 }), false, k);
  // (the neck's own movements move neither the hold's camera, which stands on the look's own neck, nor the shoulders)
  for (const k of ['neck_rot', 'neck_flex', 'neck_side']) assert.equal(holdBodySame({}, { [k]: 30 }), true, k);
  assert.equal(holdBodySame({ neck_flex: 4 }, HOLD_REST), true, 'at rest: the trunk in its start posture');
  const fov = 60, aspect = 16 / 9, W = [0.27, 0.52, -0.33];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const side = (P, root) => holdSideOf(P.position, root, W, viewFrameOf(P, W, fov, aspect).dist, true);
  // The left hand held at W; its shoulder at R0 and the eye camera at P0 with the trunk at rest (the place's reference).
  // "Bend trunk forward" moves the camera (P1) and the shoulder (R1); the hold keeps the hand at W.
  const P0 = { position: [0, 1.02, 0.02], yaw: 0, pitch: -0.62 }, R0 = [0.19, 0.83, 0.03];
  const P1 = { position: [0, 0.93, -0.12], yaw: 0, pitch: -0.62 - 0.21 }, R1 = [0.19, 0.76, -0.07];
  const place = viewFrameOf(P0, W, fov, aspect), rho = d(W, R0), far = side(P0, R0);
  // update 64: a look during the movement drew the line from the MOVED camera round the MOVED shoulder, from the old place
  const old = holdCarryPoint(P1, place, R1, rho, far, fov, aspect);
  assert.ok(d(old, W) > 0.03, `update 64 moved the hand ${(d(old, W) * 1000).toFixed(0)} mm with no turn of the look, and it stayed there`);
  // now the carry is worked out in the reference (the camera with the trunk as it was, the shoulder as it was)
  assert.ok(d(holdCarryPoint(P0, place, R0, rho, far, fov, aspect), W) < 1e-9, 'no turn of the look: the hand stays where it is');
  // a turn of the look during the movement moves it by that turn only: back at rest it stands where the same look would
  // have put it with no movement, at its place in the picture
  const T = holdCarryPoint({ ...P0, yaw: 0.1 }, place, R0, rho, far, fov, aspect), f1 = viewFrameOf({ ...P0, yaw: 0.1 }, T, fov, aspect);
  assert.ok(Math.abs(f1.x - place.x) < 1e-9 && Math.abs(f1.y - place.y) < 1e-9 && Math.abs(d(T, R0) - rho) < 1e-9 && d(T, W) > 0.02);
  // THE EYE VIEW ONLY (a second check): a place taken from the outside camera throws the hand at the first look back
  const Po = { position: [0, 1.9, 0.62], yaw: 0, pitch: -0.95 };
  const thrown = holdCarryPoint(P0, viewFrameOf(Po, W, fov, aspect), R0, rho, side(Po, R0), fov, aspect);
  assert.ok(d(thrown, W) > 0.1, `a place taken outside throws the hand ${(d(thrown, W) * 1000).toFixed(0)} mm`);
  // the rule the hold follows at the end of each frame (stepLimbHold)
  const frames = [
    [{ eye: true, lookSame: true }, 'keep'],
    [{ eye: true, carried: true }, 'carry'],
    [{ eye: true, lookSame: true, bodyMoved: true, bodyAtRest: false }, 'keep'],
    [{ eye: true, carried: true, bodyMoved: true, bodyAtRest: false }, 'carry'],
    [{ eye: true, lookSame: true, bodyMoved: true, bodyAtRest: true }, 'rebase'],
    [{ eye: true, carried: true, bodyMoved: true, bodyAtRest: true }, 'carry'],
    [{ eye: true, keyed: true }, 'take'],
    [{ eye: true, carried: true, held: true }, 'take'],
    // E: outside, the trunk moving, the look moved, a key: nothing is taken from the outside camera
    [{ eye: false, bodyMoved: true }, 'wait'], [{ eye: false, carried: true }, 'wait'], [{ eye: false, keyed: true }, 'wait'], [{ eye: false, lookSame: true }, 'wait'],
    // back in the eye view: taken once, before anything else
    [{ eye: true, stale: true, carried: true }, 'take'], [{ eye: true, stale: true, bodyMoved: true }, 'take'], [{ eye: true, stale: true, lookSame: true }, 'take']
  ];
  for (const [f, want] of frames) assert.equal(holdPlaceRule(f), want, JSON.stringify(f));
  // the wiring (the browser checks run it): stepLimbHold follows the rule, holdReframe takes nothing outside the eye
  // view, the look carries nothing while the place is stale, and the carry is worked out in the reference
  const src = (await import('node:fs')).readFileSync(new URL('../scene/src/ns-app.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes("if (!firstPersonNow()) { h.stale = true; return; }"), 'holdReframe: the eye view only');
  assert.ok(src.includes('&& !(HOLD_BODY.on && limbHold.stale));'), 'holdCarries: not while stale');
  assert.ok(src.includes('const rule = HOLD_BODY.on ? holdPlaceRule({ eye: firstPersonNow(), stale: h.stale === true, carried,'), 'stepLimbHold: the rule');
  assert.ok(src.includes('const P = ref ? poseForCtl({ yaw: cs.yaw, pitch: cs.pitch }, h.headNow) || pose : pose;'), 'holdTarget: the reference camera');
});

test('letting go of Space or of the left hand during a trunk movement leaves nothing thrown or moved: the hand goes back at rejoinMps, the left hand let go stays held until the trunk is at rest, an arm chosen then waits for it (HOLD_BODY)', async () => {
  const { HOLD_BODY, holdRejoinStep, holdTakeUpWaits, holdKeptDrop, holdTrunkAway, holdArmBack, MAX_FRAME_DT } = await import('../scene/src/ns-app.mjs');
  // D4 of the round-4 check: Space let go during "Bend trunk forward" handed the hand's old place back in one frame
  // (107.6 mm). Now each frame goes at most rejoinMps x dt, and the hand ends exactly at its place.
  assert.ok(HOLD_BODY.rejoinMps > 0 && HOLD_BODY.rejoinMps / 60 < 0.02, 'under 20 mm a frame at 60 frames a second');
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const hz of [30, 60, 144]) {
    const goal = [0.27, 0.52, -0.33];
    let end = [goal[0] + 0.07, goal[1] - 0.06, goal[2] + 0.06], frames = 0, most = 0;
    assert.ok(Math.abs(d(end, goal) - 0.11) < 0.001, 'about as far as the check found (107.6 mm)');
    for (; frames < 200; frames++) {
      const r = holdRejoinStep(end, goal, 1 / hz);
      most = Math.max(most, d(r.at, end)); end = r.at;
      if (r.done) break;
    }
    assert.ok(d(end, goal) === 0, `${hz} Hz: back exactly at its place`);
    assert.ok(most <= HOLD_BODY.rejoinMps * Math.min(1 / hz, MAX_FRAME_DT) + 1e-12, `${hz} Hz: at most rejoinMps (${(most * 1000).toFixed(1)} mm a frame)`);
    assert.ok(frames + 1 >= Math.ceil(0.11 / (HOLD_BODY.rejoinMps / hz)) && frames < 40, `${hz} Hz: ${frames + 1} frames, not one`);
  }
  assert.deepEqual(holdRejoinStep([0, 0, 0], [0.001, 0, 0], 1 / 60), { at: [0.001, 0, 0], done: true }, 'a hand at its place is done');
  // D6 and N2 of the round-4 check: a limb chosen or let go while the trunk is bent kept the place the bent trunk gave
  // it (the left hand 273 mm raised for good). An arm (its shoulder rides on the trunk) newly chosen then waits
  for (const limb of ['leftArm', 'rightArm']) {
    assert.equal(holdTakeUpWaits({ limb, trunkAtRest: false }), true, limb);
    assert.equal(holdTakeUpWaits({ limb, trunkAtRest: true }), false, `${limb} at rest: at once`);
    assert.equal(holdTakeUpWaits({ limb, trunkAtRest: false, dragged: true }), false, `${limb} dragged: at once`);
    assert.equal(holdTakeUpWaits({ limb, trunkAtRest: false, fresh: false }), false, `${limb} already held: kept`);
  }
  for (const limb of ['leftLeg', 'rightLeg']) assert.equal(holdTakeUpWaits({ limb, trunkAtRest: false }), false, `${limb}: its hip does not ride on the trunk`);
  // K1 of the round-5 check: the kept left hand was let go as soon as the trunk was at rest, also while Space still held
  // something, and stayed 276 mm raised. The rule now (every row of it):
  const rows = [
    [{ chosen: true }, true, 'the left arm chosen again: its hold is taken back'],
    [{ trunkAtRest: false }, false, 'the trunk not at rest: kept'],
    [{ trunkAtRest: true }, true, 'at rest, nothing held, back at its place: let go'],
    [{ trunkAtRest: true, busy: true }, false, 'Space (or a drag) still held at rest: kept (K1)'],
    [{ trunkAtRest: true, rejoining: true }, false, 'at rest, Space let go, on its way back: kept until it is there'],
    [{ trunkAtRest: false, busy: true, rejoining: true }, false, 'during the movement with Space: kept']
  ];
  for (const [f, want, why] of rows) assert.equal(holdKeptDrop(f), want, why);
  // K3: the right arm let go during a trunk movement kept the angles the hold had worked out for the bent trunk (257 mm
  // off for good). Its joints' places now go back in step with the trunk's return, exactly to those before it at rest.
  assert.equal(holdTrunkAway({ trunk_flex: 3, trunk_rot: 4 }), 5);
  assert.equal(holdTrunkAway({ neck_flex: 30 }), 0, 'the neck is not the trunk');
  const to = { r_shoulder_flex: 33, r_shoulder_abd: 5, r_elbow_flex: 14 }, from = { r_shoulder_flex: 70, r_shoulder_abd: 15, r_elbow_flex: 60 };
  let st = { from: { ...from }, to: { ...to }, last: { ...from }, share: 1, away0: 35 }, place = { ...from }, prev = from;
  for (const away of [35, 30, 20, 25, 10, 4, 0]) {
    const b = holdArmBack(st, { place, away, atRest: away === 0, dt: 1 / 60 });
    assert.ok(b.state.share <= st.share, 'the share never grows again (the swing past rest does not take the arm back)');
    for (const id of Object.keys(to)) assert.ok(Math.abs(b.joints[id] - to[id]) <= Math.abs(prev[id] - to[id]) + 1e-9, `${id} only goes back`);
    st = b.state; place = { ...place, ...b.joints }; prev = b.joints;
  }
  // (at rest what is left goes at most armBackDegS, a few frames here)
  let frames = 0;
  for (let b; frames < 30; frames++) { b = holdArmBack(st, { place, atRest: true, dt: 1 / 60 }); st = b.state; place = { ...place, ...b.joints }; prev = b.joints; if (b.done) break; }
  assert.ok(frames < 10, `${frames} frames after rest`);
  assert.deepEqual(prev, to, 'then exactly the places from before the movement');
  assert.deepEqual(holdArmBack({ from, to, last: { ...from }, share: 1, away0: 35 }, { place: from, away: 35 }).joints, from, 'when let go: where the hold left it (no jump)');
  // keys (or a movement's end) moved a joint: it goes on from where it is, no jump, and is back at rest
  { const s0 = { from: { ...from }, to: { ...to }, last: { ...from }, share: 1, away0: 35 };
    const b1 = holdArmBack(s0, { place: { ...from, r_elbow_flex: 75 }, away: 20 });
    assert.ok(Math.abs(b1.joints.r_elbow_flex - 75) < 1e-9, 'the step meets the joint where the keys put it');
    const b2 = holdArmBack(b1.state, { place: { ...from, ...b1.joints }, away: 0, atRest: true, dt: 1 / 60 });
    assert.ok(b2.joints.r_elbow_flex < 75 && b2.joints.r_elbow_flex > 75 - 90 / 60 - 1e-9, 'what is left at rest goes at most armBackDegS');
    assert.equal(b2.done, false, 'not done until it is there'); }
  // R9, R10 (round-6 check) and X6, X8 (round-7 check), with the game's own activity: the arm let go during a trunk
  // movement, its places set as places only ('limbPlace', as stepArmBack does)
  const ids = ['r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex', 'r_shoulder_rot'];
  const pressEv = (r, id) => ({ type: 'muscle', regionId: r, actionId: id, regionOnly: false, at: 0 });
  const { DANCE_BODY_JOINTS } = await import('../scene/src/ns-actions.mjs');
  /** Runs one sequence: elbow pressed at frame elbowAt[], the arm let go at letGo with the hold's places a little off, the
   * trunk's way back over `ret` frames from frame retFrom, a limb turn at turnAt; withBack false = the same, no way back. */
  function run({ elbowAt = [], letGo = 24, retFrom = 24, ret = 90, turnAt = -1, withBack = true, frames = 300 } = {}) {
    const { A, s: s0 } = started();
    let s = s0;
    const placeAt = {}; for (const id of ids) placeAt[id] = s.bodyGoal[id];
    let rb = null, done = false, maxElbow = 0, maxElbowAfterLetGo = 0, maxLateStep = 0, prevE = s.bodyPos.r_elbow_flex;
    for (let f = 0; f < frames; f++) {
      const ev = [];
      if (elbowAt.includes(f)) ev.push(pressEv('lh_elbow', 'lh_r_elbow_flex'));
      if (f === turnAt) ev.push({ type: 'turn', phase: 'step' });
      s = A.stepGated(s, ev, H).state;
      if (f === letGo) {
        s = A.step(s, [{ type: 'limbPose', joints: { r_shoulder_flex: placeAt.r_shoulder_flex + 12 } }], 0);
        if (withBack) { const from = {}; for (const id of ids) from[id] = s.bodyGoal[id]; rb = { from, to: { ...placeAt }, last: { ...from }, share: 1, away0: 35 }; }
      }
      if (rb && !done) {
        const away = f < retFrom ? 35 : Math.max(0, 35 * (1 - (f - retFrom) / ret));
        const b = holdArmBack(rb, { place: s.bodyGoal, turning: Boolean(s.dance && s.dance.active), turnJoints: DANCE_BODY_JOINTS, away, atRest: away === 0, dt: H });
        rb = b.state; done = b.done;
        if (Object.keys(b.joints).length) s = A.step(s, [{ type: 'limbPlace', joints: b.joints }], 0);
      }
      maxElbow = Math.max(maxElbow, s.bodyPos.r_elbow_flex);
      if (f > letGo + 1) maxElbowAfterLetGo = Math.max(maxElbowAfterLetGo, s.bodyPos.r_elbow_flex);
      if (f > 60) maxLateStep = Math.max(maxLateStep, Math.abs(s.bodyPos.r_elbow_flex - prevE));
      prevE = s.bodyPos.r_elbow_flex;
    }
    return { s, placeAt, done, maxElbow, maxElbowAfterLetGo, maxLateStep };
  }
  { // R9 + R10: the elbow movement under way when let go, and pressed again while the arm goes back: it bends to its end
    // each time (a place set as a place does not end it) and every joint ends at its place
    const r = run({ elbowAt: [0, 54] });
    assert.ok(r.maxElbow > 140, `the elbow's movement bends it (${r.maxElbow.toFixed(1)})`);
    assert.ok(r.maxElbowAfterLetGo > 140, `and pressed again while the arm goes back, it bends it again (${r.maxElbowAfterLetGo.toFixed(1)})`);
    for (const id of ids) assert.ok(Math.abs(r.s.bodyPos[id] - r.placeAt[id]) < 0.05, `${id} ends at its place (${r.s.bodyPos[id].toFixed(2)} against ${r.placeAt[id]})`);
    assert.ok(r.done, 'and the way back ends'); }
  { // X6: a movement that ends while the trunk is still on its way back: no throw (round 7 stepped the elbow up to 52
    // degrees in one frame there); its steps are those of a return, as with no way back at all
    const r = run({ elbowAt: [30], retFrom: 60, ret: 120 }), c = run({ elbowAt: [30], retFrom: 60, ret: 120, withBack: false });
    assert.ok(r.maxElbowAfterLetGo > 140, `the movement bends the elbow (${r.maxElbowAfterLetGo.toFixed(1)})`);
    assert.ok(r.maxLateStep <= c.maxLateStep + 2, `the elbow's largest late step ${r.maxLateStep.toFixed(1)} against ${c.maxLateStep.toFixed(1)} with no way back`);
    assert.ok(r.maxLateStep < 10, `${r.maxLateStep.toFixed(1)} degrees a frame`);
    for (const id of ids) assert.ok(Math.abs(r.s.bodyPos[id] - r.placeAt[id]) < 0.05, `${id} at its place`); }
  { // X8: a limb turn (Space double tap) during the way back: the right upper arm stays where the turn put it, as with
    // no way back (round 7 took it back to its old place); the other joints still go back
    const r = run({ turnAt: 30 }), c = run({ turnAt: 30, withBack: false });
    assert.ok(Math.abs(c.s.bodyPos.r_shoulder_rot - r.placeAt.r_shoulder_rot) > 10, 'the turn turns the upper arm');
    assert.ok(Math.abs(r.s.bodyPos.r_shoulder_rot - c.s.bodyPos.r_shoulder_rot) < 0.05, `r_shoulder_rot ${r.s.bodyPos.r_shoulder_rot.toFixed(1)} as the turn left it (${c.s.bodyPos.r_shoulder_rot.toFixed(1)})`);
    for (const id of ['r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex']) assert.ok(Math.abs(r.s.bodyPos[id] - r.placeAt[id]) < 0.05, `${id} at its place`);
    assert.ok(r.done); }
  // the wiring (the browser checks run it): the left hand let go while the trunk is not at rest stays held (leftKept)
  // and takes that hold back when chosen again; Space sets the way back; the goal stays the hand's place
  const src = (await import('node:fs')).readFileSync(new URL('../scene/src/ns-app.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes("if (HOLD_BODY.on && limbHold && limbHold.limb === 'leftArm' && limb !== 'leftArm' && !holdTrunkAtRest()) leftKept = limbHold;"), 'chooseLimb keeps the left hand');
  assert.ok(src.includes("if (leftKept && holdKeptDrop({ chosen: chosenLimb() === 'leftArm', trunkAtRest: holdTrunkAtRest(), busy: holdBusy(), rejoining: leftRejoin })) leftKept = null;"), 'kept by holdKeptDrop');
  assert.ok(src.includes('stepArmBack(out, timing.dt); // (HOLD_BODY: the right arm let go during a trunk movement)'), 'the right arm goes back');
  assert.ok(src.includes('const G0 = simState && simState.activity && simState.activity.bodyGoal, RA = NsGrasp.LIMB_CHAIN.rightArm;'), 'its places, not where a movement has it (R9)');
  assert.ok(src.includes("[{ type: 'limbPlace', joints: b.joints }]"), 'places only: a movement under way goes on (R10, X6)');
  assert.ok(src.includes('turnJoints: NsActions.DANCE_BODY_JOINTS'), 'the limb turn keeps its joints (X8)');
  assert.ok(src.includes("trunkAtRest: holdTrunkAtRest() && !(limb === 'rightArm' && rightBack) });"), 'the right arm chosen again waits for its way back (X2)');
  assert.ok(src.includes('holdBusy() && (leftHeld || leftKept)) leftRejoin = true;'), 'Space: the way back');
  assert.ok(src.includes('T = Array.isArray(holdLeftGoal) ? holdLeftGoal.slice() :'), 'the goal stays the place');
  assert.ok(src.includes("if (waits && (limb !== 'rightArm' || !keyed)) { limbHold = null; return; }"), 'an arm waits; the keys move the right arm for the frame');
  assert.ok(src.includes('rho: Math.hypot(pts.end[0] - pts.root[0], pts.end[1] - pts.root[1], pts.end[2] - pts.root[2]), oneFrame: waits };'), 'a hold for the frame only');
  assert.ok(src.includes('if (limbHold && limbHold.oneFrame) limbHold = null;'), 'and let go after it');
});
