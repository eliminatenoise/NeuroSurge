/** The left arm's strip movements jerk and come part of the way back, like every other part (20 November 2026).
 * The owner (19 November): "the neck moves and then returns, and then same for all the body parts. They move and then
 * return. But they don't have to return fully, just partially. So we're really thinking about a bit of a jerking
 * movement. They jerk one way and then they partially return back." The body's joints have done this since then
 * (JOINT_LATCH driveS / relax / kick); the left arm's own rig (its pose drive, 0 = neutral, 1 = the movement's end)
 * only eased into a latched movement and stayed. These cases hold it to the body's numbers. */
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
/** n frames; returns the state and the pose drive of `id` after every frame. */
function run(A, s0, n, id, ev) {
  let s = s0; const d = [];
  for (let i = 0; i < n; i++) { s = A.stepGated(s, ev ? [ev()] : [], H).state; d.push(s.drive[id]); }
  return { s, d };
}
const J = JOINT_LATCH;
const held = 1 - Math.min(J.relax, J.relaxMaxShare); // where the drive waits after the ease back (the body's share)

test('a look that rests on a left-arm area drives the movement hard to its end, then it comes part of the way back and waits', () => {
  const { A, s } = started();
  // the look's rest latches the movement (GAZE_DWELL.latchS), as on the body
  const lookFrames = Math.ceil(GAZE_DWELL.latchS / H) + 1;
  const a = run(A, s, lookFrames, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion'));
  assert.equal(a.s.armLatch.elbow_flexion, 1, 'the look latched the elbow bend');
  assert.ok(Array.isArray(a.s.armJerk.elbow_flexion), 'and noted its jerk');
  // within the drive time it reaches the end (1), never past it, and is thrown back off it at least once
  const b = run(A, a.s, Math.ceil(J.driveS / H), 'elbow_flexion');
  const top = Math.max(...b.d);
  assert.equal(top, 1, `driven all the way to the end (${top})`);
  assert.ok(b.d.every(v => v >= 0 && v <= 1), 'never past either end');
  const firstTop = b.d.indexOf(1);
  assert.ok(firstTop >= 2, `it gathers speed over several frames (end reached at frame ${firstTop})`);
  assert.ok(b.d.slice(firstTop).some(v => v < 0.95), 'it rebounds off the end (the body\'s restitution)');
  // then it eases back part of the way, the body's share, and waits there, still latched
  const c = run(A, b.s, 120, 'elbow_flexion');
  assert.ok(Math.abs(c.s.drive.elbow_flexion - held) < 0.005, `eased back to ${held} (${c.s.drive.elbow_flexion})`);
  assert.ok(held > 0.2 && held < 0.8, 'part of the way, not all of it, and not none of it');
  assert.equal(c.s.armLatch.elbow_flexion, 1, 'still held');
  const d = run(A, c.s, 120, 'elbow_flexion');
  assert.equal(d.s.drive.elbow_flexion, c.s.drive.elbow_flexion, 'and it stays there');
  // the elbow the left arm is asked for follows: the whole bend at the end, the share of it after the ease back
  assert.equal(composePose({ elbow_flexion: 1 }).elbowDeltaDeg, ELBOW_ACTION_DEG);
  assert.ok(Math.abs(composePose({ elbow_flexion: d.s.drive.elbow_flexion }).elbowDeltaDeg - held * ELBOW_ACTION_DEG) < 0.2);
});

test('each further press jerks it in again from where it waits, with no jump back first, and it comes back again', () => {
  const { A, s } = started();
  const settled = run(A, s, 120, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  assert.ok(Math.abs(settled.drive.elbow_flexion - held) < 0.005);
  const p1 = A.stepGated(settled, [press('rh_elbow', 'elbow_flexion')], H).state;
  assert.equal(p1.armLatch.elbow_flexion, 1, 'a further press keeps it latched (it does not let it go)');
  assert.ok(p1.drive.elbow_flexion > settled.drive.elbow_flexion, `moved toward its end, not thrown back (${p1.drive.elbow_flexion} from ${settled.drive.elbow_flexion})`);
  const r1 = run(A, p1, Math.ceil(J.driveS / H), 'elbow_flexion');
  assert.equal(Math.max(...r1.d), 1, 'in again, all the way');
  assert.ok(Math.abs(run(A, r1.s, 120, 'elbow_flexion').s.drive.elbow_flexion - held) < 0.005, 'and eased back again');
  // three presses in a row, each after the ease back: three jerks, the same each time
  let st = settled; const tops = [];
  for (let k = 0; k < 3; k++) {
    const r = run(A, A.stepGated(st, [press('rh_elbow', 'elbow_flexion')], H).state, 90, 'elbow_flexion');
    tops.push(Math.max(...r.d)); st = run(A, r.s, 60, 'elbow_flexion').s;
    assert.ok(Math.abs(st.drive.elbow_flexion - held) < 0.005, `press ${k + 1} came back (${st.drive.elbow_flexion})`);
  }
  assert.deepEqual(tops, [1, 1, 1]);
});

test('a press while the movement is still held at its end kicks it into the end stop, and it is thrown back off it', () => {
  const { A, s } = started();
  const a = run(A, s, 14, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s; // at (or near) the end, inside driveS
  assert.ok(a.drive.elbow_flexion > 1 - J.nearShare, `near the end (${a.drive.elbow_flexion})`);
  const k = A.stepGated(a, [press('rh_elbow', 'elbow_flexion')], H).state;
  assert.ok(k.armJerk.elbow_flexion[1] > 0, 'the hold starts again');
  const r = run(A, k, 30, 'elbow_flexion');
  assert.ok(r.d.includes(1) && Math.min(...r.d) < 0.9, `slammed in and thrown back (${Math.min(...r.d).toFixed(2)})`);
  assert.ok(r.d.every(v => v >= 0 && v <= 1));
});

test('the opposite movement lets it go as before: no jerk on the way back, and nothing latched instead (stage rule)', () => {
  const { A, s } = started();
  const settled = run(A, s, 120, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  const b = A.stepGated(settled, [press('rh_elbow', 'elbow_extension')], H).state;
  assert.equal(b.armLatch.elbow_flexion, 0, 'the bend is let go');
  assert.equal(b.armLatch.elbow_extension, 0, 'the straightening does not latch this time');
  assert.equal(b.armJerk.elbow_flexion, undefined, 'its note is gone');
  // the drive goes back to neutral with armPoseTau, as before (no spring, no overshoot)
  const r = run(A, b, 12, 'elbow_flexion');
  for (let i = 1; i < r.d.length; i++) assert.ok(r.d[i] <= r.d[i - 1], 'straight back, never overshooting');
  assert.ok(r.d[r.d.length - 1] < 0.01, `back at neutral (${r.d[r.d.length - 1]})`);
  assert.equal(r.s.drive.elbow_extension, 0);
  // a second press of the straightening now latches it, and it jerks too
  const c = run(A, A.stepGated(r.s, [press('rh_elbow', 'elbow_extension')], H).state, 120, 'elbow_extension').s;
  assert.equal(c.armLatch.elbow_extension, 1);
  assert.ok(Math.abs(c.drive.elbow_extension - held) < 0.005);
});

test('a hand movement jerks the same way; the Space grip still wins the fingers, and they come back to where they waited', () => {
  const { A, s } = started();
  const a = run(A, s, 120, 'index_flexion', () => look('rh_index', 'index_flexion'));
  assert.equal(Math.max(...a.d), 1, 'the finger was driven to its end');
  assert.ok(Math.abs(a.s.drive.index_flexion - held) < 0.005, `and waits part of the way back (${a.s.drive.index_flexion})`);
  // Space grips: the grip wins the fingers at once, as before
  const g = run(A, A.stepGated(a.s, [{ type: 'grip', on: true, at: 0 }], H).state, 20, 'index_flexion');
  assert.ok(g.s.drive.grasp_close > 0.99 && g.s.drive.index_flexion < 0.01, `the grip holds the hand (${g.s.drive.grasp_close}, ${g.s.drive.index_flexion})`);
  assert.equal(g.s.armLatch.index_flexion, 1, 'the finger stays latched under the grip');
  // let go: the finger eases back to where it waited (not to its end, not snapping)
  const u = run(A, A.stepGated(g.s, [{ type: 'grip', on: false, at: 0 }], H).state, 90, 'index_flexion');
  assert.ok(u.d.every(v => v <= held + 1e-9), 'no jerk on the way back from the grip');
  assert.ok(Math.abs(u.s.drive.index_flexion - held) < 0.005, `back where it waited (${u.s.drive.index_flexion})`);
});

test('under reduced motion there is no jerk: the movement eases straight to its end and stays (as before)', () => {
  const { A, s } = started({ jointSpring: J.reducedMotion, armPoseTau: J.reducedArmPoseTau });
  const a = run(A, s, 120, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion'));
  assert.deepEqual(a.s.armJerk, {}, 'nothing noted');
  for (let i = 1; i < a.d.length; i++) assert.ok(a.d[i] >= a.d[i - 1], 'straight there, no rebound');
  assert.ok(a.s.drive.elbow_flexion > 0.999, `held at the end (${a.s.drive.elbow_flexion})`);
  const b = run(A, A.stepGated(a.s, [press('rh_elbow', 'elbow_flexion')], H).state, 60, 'elbow_flexion');
  assert.ok(b.d.every(v => v > 0.999), 'a further press changes nothing');
});

test('a press on a held left-arm movement counts as moving it (the tutorial\'s "Click it", the card\'s "already there")', async () => {
  const NG = await import('../scene/src/ns-guide.mjs');
  const { BODY_MOTOR_MAP } = await import('../scene/src/ns-bodymap.mjs');
  const { infoActionAtEnd } = await import('../scene/src/ns-app.mjs');
  // the rule itself: latched with its note moves again; latched with none (reduced motion) moves nothing, as before
  assert.equal(NG.armActionMoves('elbow_flexion', { armLatch: { elbow_flexion: 1 }, armJerk: { elbow_flexion: [0.5, 0, 0] } }), true);
  assert.equal(NG.armActionMoves('elbow_flexion', { armLatch: { elbow_flexion: 1 }, armJerk: {} }), false);
  assert.equal(NG.armActionMoves('elbow_flexion', { armLatch: { elbow_flexion: 1 } }), false, 'an older caller without notes: as before');
  // a straighten of an elbow already straight still moves nothing, held or not
  assert.equal(NG.armActionMoves('elbow_extension', { armLatch: { elbow_extension: 1 }, armJerk: { elbow_extension: [0.5, 0, 0] }, elbowRad: 0.01 }), false);
  assert.equal(NG.armActionMoves('elbow_extension', { armLatch: { elbow_extension: 1 }, armJerk: { elbow_extension: [0.5, 0, 0] }, elbowRad: 0.5 }), true);
  // in play: the look latches the elbow bend; then a click there is a press that moves the arm
  const { A, s } = started();
  const held = run(A, s, 120, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  const r = A.stepGated(held, [{ type: 'click', at: 0 }], H);
  assert.ok(r.marks.some(m => m.source === 'click'), JSON.stringify(r.marks));
  const prev = { activity: held, elbowRad: 0.6 }, next = { activity: r.state, elbowRad: 0.6, t: 1 };
  const ev = NG.guideEventsFromFrame({ prev, next, out: { marks: r.marks }, bodyMap: BODY_MOTOR_MAP }).filter(e => e.type === 'activate');
  assert.ok(ev.length === 1 && ev[0].isLeftArm === true && ev[0].moves === true && ev[0].source === 'click', JSON.stringify(ev));
  let g = NG.createGuide({ now: 0, features: { thirdPerson: true }, tutorial: true });
  g = NG.guideStep(g, [{ type: 'look', regionId: 'rh_elbow' }], 0.5);
  assert.equal(NG.currentGoal(g), 'pressArea');
  g = NG.guideStep(g, ev, 1);
  assert.notEqual(NG.currentGoal(g), 'pressArea', 'the click on the left elbow finished "Click it: it jerks again"');
  // the card no longer says "already there" for it; under reduced motion it still does
  const bend = { id: 'elbow_flexion', armActionId: 'elbow_flexion' };
  assert.equal(infoActionAtEnd(bend, { leftArm: true, armState: { armLatch: held.armLatch, armJerk: held.armJerk, elbowRad: 0.6 } }), false);
  const R = createActivity({ jointSpring: J.reducedMotion, armPoseTau: J.reducedArmPoseTau });
  let rs = R.step(R.state, [], 2.5); rs = R.step(rs, [away()], H);
  rs = run(R, rs, 120, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  assert.equal(rs.armLatch.elbow_flexion, 1);
  assert.equal(infoActionAtEnd(bend, { leftArm: true, armState: { armLatch: rs.armLatch, armJerk: rs.armJerk, elbowRad: 0.6 } }), true);
});

test('Reset body clears the notes; the state check refuses a malformed note; an older state without notes still steps', () => {
  const { A, s } = started();
  const a = run(A, s, 30, 'elbow_flexion', () => look('rh_elbow', 'elbow_flexion')).s;
  assert.ok(a.armJerk.elbow_flexion);
  const r = A.step(a, [{ type: 'reset', at: 0 }], H);
  assert.deepEqual(r.armJerk, {});
  assert.equal(r.drive.elbow_flexion, 0);
  assert.throws(() => A.step({ ...a, armJerk: { elbow_flexion: [0.5, 0] } }, [], H), /activity_state/);
  assert.throws(() => A.step({ ...a, armJerk: { not_an_action: [0.5, 0, 0] } }, [], H), /activity_state/);
  assert.throws(() => A.step({ ...a, armJerk: { elbow_flexion: [1.5, 0, 0] } }, [], H), /activity_state/);
  assert.throws(() => A.step({ ...a, armJerk: { elbow_flexion: [0.5, -1, 0] } }, [], H), /activity_state/);
  const old = { ...a }; delete old.armJerk;
  const o = A.step(old, [], H);
  assert.deepEqual(o.armJerk, {});
  assert.equal(o.armLatch.elbow_flexion, 1, 'its latch is simply held');
});
