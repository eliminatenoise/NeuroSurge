/** The left arm's strip movements jerk like every other part (20 November 2026), and since the same evening they
 * contract and return.
 * The owner (19 November): "the neck moves and then returns, and then same for all the body parts. They move and then
 * return. But they don't have to return fully, just partially." That was the rule these cases first pinned (the arm's
 * pose drive, 0 = neutral, 1 = the movement's end, driven to 1, eased half way back and held there).
 * 20 November 2026, evening, the owner's Message 206, which replaces it: "I think it's better actually if there are no
 * permanent movements ... when you tap any area of the brain, you activate any area, it will contract, then return to
 * its previous place. But in returning to its previous place, you won't see corresponding activity and muscle
 * activation. It will just return." The cases are restated for that: the drive is thrown to 1 for the contraction,
 * then goes back to where it was (0, or the grip's) with nothing lit, and stays. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivity, GAZE_DWELL, JOINT_LATCH, composePose, ELBOW_ACTION_DEG } from '../scene/src/ns-actions.mjs';

const H = 1 / 60;
const look = (regionId, actionId) => ({ type: 'gaze', kind: 'region', regionId, actionId, at: 0 });
const away = () => ({ type: 'gaze', kind: 'empty', at: 0 });
const press = (regionId, actionId) => ({ type: 'muscle', regionId, actionId, regionOnly: false, at: 0 });
function started(opts) {
  const A = createActivity(opts);
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [away()], H);
  return { A, s };
}
/** n frames; the pose drive of `id`, the area's light and the movement's display after every frame. */
function run(A, s0, n, id, ev, regionId = 'rh_elbow') {
  let s = s0; const d = [], lit = [], shown = [];
  for (let i = 0; i < n; i++) { s = A.stepGated(s, ev ? [ev()] : [], H).state; d.push(s.drive[id]); lit.push(s.regionActivity[regionId]); shown.push(s.display[id]); }
  return { s, d, lit, shown };
}
const J = JOINT_LATCH;
const contractFrames = Math.round(J.driveS / H);

test('a look that rests on a left-arm area drives the movement hard to its end, then it returns all the way and stays', () => {
  const { A, s } = started();
  // the look's rest starts the contraction (GAZE_DWELL.latchS), as on the body
  const lookFrames = Math.ceil(GAZE_DWELL.latchS / H) + 1;
  const a = run(A, s, lookFrames, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion'));
  assert.ok(Array.isArray(a.s.armJerk.elbow_flexion) && a.s.armJerk.elbow_flexion[0] > 0, 'the look started the elbow bend\'s contraction');
  assert.equal(a.s.armLatch, undefined, 'nothing is latched any more');
  // within the contraction it reaches the end (1), never past it, and is thrown back off it at least once
  const b = run(A, a.s, contractFrames, 'elbow_flexion');
  const top = Math.max(...b.d);
  assert.equal(top, 1, `driven all the way to the end (${top})`);
  assert.ok(b.d.every(v => v >= 0 && v <= 1), 'never past either end');
  const firstTop = b.d.indexOf(1);
  assert.ok(firstTop >= 2, `it gathers speed over several frames (end reached at frame ${firstTop})`);
  assert.ok(b.d.slice(firstTop).some(v => v < 0.95), 'it rebounds off the end (the body\'s restitution)');
  assert.ok(Math.max(...b.lit) > 0.9, 'the area is lit during the contraction');
  // then it returns, the whole way, with nothing lit, and stays
  const c = run(A, b.s, 150, 'elbow_flexion');
  assert.equal(c.s.drive.elbow_flexion, 0, `back at neutral (${c.s.drive.elbow_flexion})`);
  assert.deepEqual(c.s.armJerk, {}, 'the contraction is over');
  const returning = c.d.findIndex(v => v < 0.999);
  assert.ok(returning >= 0, 'it came back');
  assert.ok(c.lit.slice(returning).every(v => v === 0) && c.shown.slice(returning).every(v => v === 0), 'no light and no display level on the way back');
  for (let i = returning + 1; i < c.d.length; i++) assert.ok(c.d[i] <= c.d[i - 1] + 1e-12, 'straight back, never overshooting (it just returns)');
  const d = run(A, c.s, 60, 'elbow_flexion');
  assert.equal(d.s.drive.elbow_flexion, 0, 'and it stays there');
  // the elbow the left arm is asked for follows: the whole bend at the end, none after the return (the hand's own place)
  assert.equal(composePose({ elbow_flexion: 1 }).elbowDeltaDeg, ELBOW_ACTION_DEG);
  assert.equal(composePose({ elbow_flexion: d.s.drive.elbow_flexion }).elbowDeltaDeg, 0);
});

test('each further press contracts it again, also while it is on its way back, and it returns again', () => {
  const { A, s } = started();
  const settled = run(A, s, 150, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  assert.equal(settled.drive.elbow_flexion, 0);
  // three presses in a row, each after the return: three contractions to the end, the same each time
  let st = settled; const tops = [];
  for (let k = 0; k < 3; k++) {
    const r = run(A, A.stepGated(st, [press('rh_elbow', 'elbow_flexion')], H).state, contractFrames, 'elbow_flexion');
    tops.push(Math.max(...r.d)); st = run(A, r.s, 150, 'elbow_flexion').s;
    assert.equal(st.drive.elbow_flexion, 0, `press ${k + 1} came back`);
  }
  assert.deepEqual(tops, [1, 1, 1]);
  // a press while it returns: no jump, it is driven to its end again from where it is
  const half = run(A, run(A, A.stepGated(st, [press('rh_elbow', 'elbow_flexion')], H).state, contractFrames + 8, 'elbow_flexion').s, 0, 'elbow_flexion').s;
  assert.ok(half.drive.elbow_flexion > 0.05 && half.drive.elbow_flexion < 0.999 && half.armJerk.elbow_flexion[0] === 0, `on its way back (${half.drive.elbow_flexion})`);
  const p = A.stepGated(half, [press('rh_elbow', 'elbow_flexion')], H).state;
  assert.ok(p.armJerk.elbow_flexion[0] > 0, 'contracting again');
  assert.ok(p.drive.elbow_flexion >= half.drive.elbow_flexion - 0.05, `no jump back first (${p.drive.elbow_flexion} from ${half.drive.elbow_flexion})`);
  assert.equal(Math.max(...run(A, p, contractFrames, 'elbow_flexion').d), 1, 'in again, all the way');
});

test('a press while the movement is still at its end kicks it into the end stop, and it is thrown back off it', () => {
  const { A, s } = started();
  const a = run(A, s, 14, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s; // at (or near) the end, inside the contraction
  assert.ok(a.drive.elbow_flexion > 1 - J.nearShare, `near the end (${a.drive.elbow_flexion})`);
  const k = A.stepGated(a, [press('rh_elbow', 'elbow_flexion')], H).state;
  assert.ok(k.armJerk.elbow_flexion[0] > J.driveS - 2 * H, 'the contraction starts again');
  const r = run(A, k, 30, 'elbow_flexion');
  assert.ok(r.d.includes(1) && Math.min(...r.d) < 0.9, `slammed in and thrown back (${Math.min(...r.d).toFixed(2)})`);
  assert.ok(r.d.every(v => v >= 0 && v <= 1));
});

test('the opposite movement sends a contraction under way straight into its return, and contracts itself', () => {
  const { A, s } = started();
  const bending = run(A, A.stepGated(s, [press('rh_elbow', 'elbow_flexion')], H).state, 8, 'elbow_flexion').s;
  assert.ok(bending.armJerk.elbow_flexion[0] > 0);
  const b = A.stepGated(bending, [press('rh_elbow', 'elbow_extension')], H).state;
  assert.equal(b.armJerk.elbow_flexion[0], 0, 'the bend is on its way back');
  assert.ok(b.armJerk.elbow_extension[0] > 0, 'the straightening contracts');
  const r = run(A, b, 150, 'elbow_flexion');
  for (let i = 1; i < r.d.length; i++) assert.ok(r.d[i] <= r.d[i - 1] + 1e-12, 'the bend goes straight back, never overshooting');
  assert.equal(r.s.drive.elbow_flexion, 0);
  assert.equal(r.s.drive.elbow_extension, 0, 'and the straightening has returned too');
  assert.deepEqual(r.s.armJerk, {});
});

test('a hand movement contracts the same way; the Space grip wins the fingers, and the hand opens and comes back after it', () => {
  const { A, s } = started();
  const a = run(A, s, 150, 'index_flexion', () => look('rh_index', 'index_flexion'), 'rh_index');
  assert.equal(Math.max(...a.d), 1, 'the finger was driven to its end');
  assert.equal(a.s.drive.index_flexion, 0, 'and came back');
  // a finger contraction, then Space grips during it: the grip wins the fingers at once, the contraction ends
  const c = run(A, A.stepGated(a.s, [press('rh_index', 'index_flexion')], H).state, 6, 'index_flexion', null, 'rh_index').s;
  const g = run(A, A.stepGated(c, [{ type: 'grip', on: true, at: 0 }], H).state, 20, 'index_flexion');
  assert.ok(g.s.drive.grasp_close > 0.99 && g.s.drive.index_flexion < 0.01, `the grip holds the hand (${g.s.drive.grasp_close}, ${g.s.drive.index_flexion})`);
  assert.equal(g.s.armJerk.index_flexion, undefined, 'the finger\'s contraction is over');
  // let go: the hand opens for its window and comes back to neutral; the finger does not jerk
  const u = run(A, A.stepGated(g.s, [{ type: 'grip', on: false, at: 0 }], H).state, 120, 'index_flexion');
  assert.ok(u.d.every(v => v < 0.01), 'no jerk of the finger after the grip');
  assert.equal(u.s.drive.grasp_close, 0);
  assert.ok(u.s.drive.open_hand < 0.01, 'the opening is over too');
});

test('under reduced motion there is no jerk: the movement goes to its end and back without a bounce', () => {
  const { A, s } = started({ jointSpring: J.reducedMotion, armPoseTau: J.reducedArmPoseTau });
  const a = run(A, s, 150, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion'));
  const top = Math.max(...a.d), at = a.d.indexOf(top);
  assert.ok(top > 0.95, `out to (nearly) its end (${top})`);
  for (let i = 1; i <= at; i++) assert.ok(a.d[i] >= a.d[i - 1] - 1e-12, 'straight there, no rebound');
  for (let i = at + 1; i < a.d.length; i++) assert.ok(a.d[i] <= a.d[i - 1] + 1e-12, 'straight back, no overshoot');
  assert.equal(a.s.drive.elbow_flexion, 0, 'back at neutral');
  // a further press does it again (it is not "already there")
  const b = run(A, A.stepGated(a.s, [press('rh_elbow', 'elbow_flexion')], H).state, 60, 'elbow_flexion');
  assert.ok(Math.max(...b.d) > 0.95);
});

test('a press on a left-arm movement always counts as moving it (the tutorial\'s "Click it", the card\'s "already there")', async () => {
  const NG = await import('../scene/src/ns-guide.mjs');
  const { BODY_MOTOR_MAP } = await import('../scene/src/ns-bodymap.mjs');
  const { infoActionAtEnd } = await import('../scene/src/ns-app.mjs');
  // the rule itself: every movement moves (nothing is held); a straighten of an elbow already straight moves nothing,
  // unless a bend is under way. (21 November 2026, hunt H8: the sideways wrist bends move the game arm's hand now,
  // ns-rig wrist_dev; until then they moved nothing and counted as moving nothing.)
  assert.equal(NG.armActionMoves('elbow_flexion', { armJerk: {} }), true);
  assert.equal(NG.armActionMoves('elbow_flexion', { armJerk: { elbow_flexion: [0.2, 0] } }), true);
  assert.equal(NG.armActionMoves('elbow_extension', { armJerk: {}, elbowRad: 0.01 }), false);
  assert.equal(NG.armActionMoves('elbow_extension', { armJerk: { elbow_flexion: [0.1, 0] }, elbowRad: 0.01 }), true);
  assert.equal(NG.armActionMoves('elbow_extension', { armJerk: {}, elbowRad: 0.5 }), true);
  assert.equal(NG.armActionMoves('wrist_radial_deviation', {}), true);
  // in play: the look contracts the elbow bend; then a click there is a press that moves the arm
  const { A, s } = started();
  const after = run(A, s, 150, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  const r = A.stepGated(after, [{ type: 'click', at: 0 }], H);
  assert.ok(r.marks.some(m => m.source === 'click'), JSON.stringify(r.marks));
  const prev = { activity: after, elbowRad: 0.6 }, next = { activity: r.state, elbowRad: 0.6, t: 1 };
  const all = NG.guideEventsFromFrame({ prev, next, out: { marks: r.marks }, bodyMap: BODY_MOTOR_MAP });
  const ev = all.filter(e => e.type === 'activate');
  assert.ok(ev.length === 1 && ev[0].isLeftArm === true && ev[0].moves === true && ev[0].source === 'click', JSON.stringify(ev));
  assert.ok(all.some(e => e.type === 'armMoved' && e.ids.includes('elbow_flexion')), 'the arm really moved (its contraction started)');
  let g = NG.createGuide({ now: 0, features: { thirdPerson: true }, tutorial: true });
  g = NG.guideStep(g, [{ type: 'activate', regionId: 'rh_elbow', isLeftArm: true, kind: 'effector', moves: true, awaitMove: true, source: 'gaze' }], 0.5);
  assert.equal(NG.currentGoal(g), 'pressArea');
  g = NG.guideStep(g, ev, 1);
  assert.notEqual(NG.currentGoal(g), 'pressArea', 'the click on the left elbow finished "Click it"');
  // the card never says "already there" for it, also under reduced motion; only for a straighten of a straight elbow
  const bend = { id: 'elbow_flexion', armActionId: 'elbow_flexion' }, straighten = { id: 'elbow_extension', armActionId: 'elbow_extension' };
  assert.equal(infoActionAtEnd(bend, { leftArm: true, armState: { armJerk: after.armJerk, elbowRad: 0.6 } }), false);
  assert.equal(infoActionAtEnd(straighten, { leftArm: true, armState: { armJerk: {}, elbowRad: 0.01 } }), true);
  const R = createActivity({ jointSpring: J.reducedMotion, armPoseTau: J.reducedArmPoseTau });
  let rs = R.step(R.state, [], 2.5); rs = R.step(rs, [away()], H);
  rs = run(R, rs, 150, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  assert.equal(infoActionAtEnd(bend, { leftArm: true, armState: { armJerk: rs.armJerk, elbowRad: 0.6 } }), false);
});

test('Reset body clears the notes; the state check refuses a malformed note; an older state without notes still steps', () => {
  const { A, s } = started();
  const a = run(A, s, 8, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  assert.ok(a.armJerk.elbow_flexion);
  const r = A.step(a, [{ type: 'reset', at: 0 }], H);
  assert.deepEqual(r.armJerk, {});
  assert.equal(r.drive.elbow_flexion, 0);
  assert.throws(() => A.step({ ...a, armJerk: { elbow_flexion: [0.5] } }, [], H), /activity_state/);
  assert.throws(() => A.step({ ...a, armJerk: { not_an_action: [0.5, 0] } }, [], H), /activity_state/);
  assert.throws(() => A.step({ ...a, armJerk: { elbow_flexion: [-1, 0] } }, [], H), /activity_state/);
  assert.throws(() => A.step({ ...a, bodyJerk: { knee_ext_L: [-135, 0.2] } }, [], H), /activity_state/);
  assert.throws(() => A.step({ ...a, bodyJerk: { knee_ext_L: [-135, 0.2, 2] } }, [], H), /activity_state/);
  const old = { ...a }; delete old.armJerk; delete old.bodyJerk; delete old.moveSeq; delete old.lastMove; delete old.pulseMove;
  const o = A.step(old, [], H);
  assert.deepEqual(o.armJerk, {});
  assert.equal(o.moveSeq, 0);
});
