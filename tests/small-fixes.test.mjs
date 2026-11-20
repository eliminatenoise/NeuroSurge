/** Small fixes from the owner's earlier notes (18 November 2026: "go over the previous messages as well. Regarding the
 * small fixes and small improvements"). Each case names the audit item it covers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { partPickName } from '../scene/src/ns-scene-three.mjs';
import { createActivity, GAZE_DWELL, LOOK_ARMS, JOINT_LATCH } from '../scene/src/ns-actions.mjs';

const H = 1 / 60;
const look = (regionId, actionId) => ({ type: 'gaze', kind: 'region', regionId, actionId, at: 0 });
const away = () => ({ type: 'gaze', kind: 'empty', at: 0 });
/** A fresh activity past its start instructions, with one look at empty space behind it (the first look is a seed). */
function started(opts) {
  const A = createActivity(opts);
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [away()], H);
  return { A, s };
}
function frames(A, s0, n, ev) { let s = s0; const marks = []; for (let i = 0; i < n; i++) { const r = A.stepGated(s, ev ? [ev()] : [], H); s = r.state; marks.push(...r.marks); } return { s, marks }; }
/** n frames; the furthest a joint got in the direction `sign` (+1 / -1), and the state after. */
function furthest(A, s0, n, joint, sign) { let s = s0, far = s0.bodyPos[joint]; for (let i = 0; i < n; i++) { s = A.stepGated(s, [], H).state; far = sign > 0 ? Math.max(far, s.bodyPos[joint]) : Math.min(far, s.bodyPos[joint]); } return { s, far }; }
// 20 November 2026 (the owner, Message 206: "I think it's better actually if there are no permanent movements ... when
// you tap any area of the brain, you activate any area, it will contract, then return to its previous place. But in
// returning to its previous place, you won't see corresponding activity and muscle activation. It will just return."):
// the cases below that pinned the latch (a pressed part HELD at its end, bodyGoal = the end, the stage rule) are
// restated: a press contracts the part to the movement's end and it returns to where it was.

test('S4: a look that rests on a motor area only arms it: the key lights, the muscles show a hint, nothing moves', () => {
  // 19 November 2026: the owner went back to activation by the look (LOOK_ARMS.on false); the arming rule stays as an
  // option of the activity and is tested as such here.
  assert.equal(LOOK_ARMS.on, false);
  const { A, s } = started({ lookArms: { ...LOOK_ARMS, on: true } });
  const knee0 = s.bodyGoal.knee_ext_L;
  const { s: s1, marks } = frames(A, s, Math.ceil((GAZE_DWELL.latchS + 0.5) / H), () => look('rh_knee', 'rh_knee_flex'));
  assert.equal(s1.bodyGoal.knee_ext_L, knee0, 'the rest of a look latched nothing');
  assert.equal(s1.bodyPos.knee_ext_L, knee0, 'the knee did not move');
  assert.deepEqual(s1.lookTaken, { regionId: 'rh_knee', n: 1 }, 'the rest armed the area (the card and the number keys take it)');
  assert.ok(marks.length === 1 && marks[0].armed === true && marks[0].regionId === 'rh_knee', JSON.stringify(marks));
  assert.equal(s1.activatedRegions.rh_knee, undefined, 'an armed look leaves no "switched on" mark');
  // during the look's pulse: the key at full, the muscles only at the hint level, no drive
  const mid = frames(A, s, 20, () => look('rh_knee', 'rh_knee_flex')).s;
  assert.ok(mid.regionDisplay.rh_knee > 0.9, `key ${mid.regionDisplay.rh_knee}`);
  assert.ok(mid.bodyDisplay['rh_knee/rh_knee_flex'] <= LOOK_ARMS.muscleLevel + 1e-9 && mid.bodyDisplay['rh_knee/rh_knee_flex'] > 0.1, `muscles ${mid.bodyDisplay['rh_knee/rh_knee_flex']}`);
  assert.equal(mid.bodyDrive['rh_knee/rh_knee_flex'], 0);
  // a click presses it: the knee bends at once (its contraction) ...
  const click = A.step(s1, [{ type: 'click', at: 0 }], H);
  const { s: pressed, far } = furthest(A, click, 30, 'knee_ext_L', -1);
  assert.ok(far <= -130, `the knee bent to its end (${far.toFixed(1)})`);
  assert.equal(pressed.activatedRegions.rh_knee, 1);
  // ... and (Message 206) it returns to where it was and stays there
  assert.equal(frames(A, pressed, 180).s.bodyPos.knee_ext_L, knee0, 'back where it was');
});

test('S4: a number key (the same event as a muscle tap) presses the area too', () => {
  const { A, s } = started({ lookArms: { ...LOOK_ARMS, on: true } });
  const s1 = frames(A, s, 30, () => look('rh_knee', 'rh_knee_flex')).s;
  const { far } = furthest(A, A.step(s1, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_flex', regionOnly: false, at: 0 }], H), 30, 'knee_ext_L', -1);
  assert.ok(far <= -130, `the knee bent to its end (${far.toFixed(1)})`);
});

test('S4: a look on the left forearm turn area does not turn the forearm for its second', () => {
  const { A, s } = started({ lookArms: { ...LOOK_ARMS, on: true } });
  const r0 = s.rotation.value;
  const s1 = frames(A, s, 50, () => look('rh_forearm', s.rotationState === 'supinated' ? 'pronation' : 'supination')).s;
  assert.equal(s1.rotation.value, r0, 'the forearm did not turn');
  assert.equal(s1.rotationState, s.rotationState);
  // a held limb's pulse is not a look: it still lights its muscles at full (it is the player moving the limb)
  const s3 = A.step(s, [{ type: 'limbPose', joints: { knee_ext_R: -40 }, regionId: 'lh_knee', actionId: 'lh_knee_flex', at: 0 }], H);
  const s4 = frames(A, s3, 10).s;
  assert.equal(s4.pulseLook, false);
  assert.ok(s4.bodyDisplay['lh_knee/lh_knee_flex'] > 0.9, `${s4.bodyDisplay['lh_knee/lh_knee_flex']}`);
});

test('S3: from the start posture, "Straighten left knee" then "Bend left knee" bends the knee on the first press', () => {
  const press = (A, s, actionId) => A.step(s, [{ type: 'muscle', regionId: 'rh_knee', actionId, regionOnly: false, at: 0 }], H);
  const { A, s } = started({ bodyRest: { knee_ext_L: -6, knee_ext_R: -6 }, bodyJointLimits: { knee_ext_L: [-135, 0], knee_ext_R: [-135, 0] } });
  assert.equal(s.bodyGoal.knee_ext_L, -6);
  const straight = furthest(A, press(A, s, 'rh_knee_extend'), 30, 'knee_ext_L', 1);
  assert.equal(straight.far, 0, 'straightened to its end');
  const bent = furthest(A, press(A, straight.s, 'rh_knee_flex'), 30, 'knee_ext_L', -1);
  assert.ok(bent.far <= -130, `the first press bends (${bent.far.toFixed(1)})`);
  // (Message 206: there is no stage rule any more: bent or not, "Straighten" straightens on the first press, and every
  // press returns to the place the knee had before it, the start posture here)
  const back = furthest(A, press(A, bent.s, 'rh_knee_extend'), 30, 'knee_ext_L', 1);
  assert.equal(back.far, 0, 'straightened on the first press, from wherever the bend had got to');
  assert.equal(frames(A, back.s, 180).s.bodyPos.knee_ext_L, -6, 'and back at the start posture');
  assert.equal(frames(A, back.s, 180).s.bodyGoal.knee_ext_L, -6, 'its place never changed');
});

test('S4: lookArms { on: false } keeps the old rule (the rest of a look moves the part)', () => {
  const { A, s } = started({ lookArms: { on: false } });
  let far = 0, st = s;
  for (let i = 0; i < 40; i++) { st = A.stepGated(st, [look('rh_knee', 'rh_knee_flex')], H).state; far = Math.min(far, st.bodyPos.knee_ext_L); }
  assert.ok(far <= -130, `the look's rest bent the knee (${far.toFixed(1)})`);
});

test('S23: the floor does not read as ground under the bodies: no grout lines under them, no shadows cast by them', async () => {
  const { ROOM, roomLight } = await import('../scene/src/ns-room.mjs');
  const EYE = [0, 0.11, -0.04], lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const at = (x, z, st, eye = EYE_OUT) => { const d = [x - eye[0], ROOM.floorY - eye[1], z - eye[2]], n = Math.hypot(...d); return lum(roomLight(eye, d.map(v => v / n), st).colour); };
  // seen from outside (the view from behind your body): the eye is not inside the body
  const EYE_OUT = [0, 1.3, 2.2];
  const body = [...ROOM.bodyAt, 0.85], aura = [null, null, body];
  // a grout line (x = 0, the light's axis) against the middle of a tile (x = 1.5), right under your body and far off
  const contrast = (z, st) => at(1.5, z, st) - at(0, z, st);
  const zUnder = ROOM.bodyAt[2] - 0.5, zFar = 41;
  // 19 November 2026 (the owner: a far blacker background with only a faint gradient): the floor has no tile lines at all
  assert.equal(ROOM.tile.dark, 0, 'no grout lines anywhere');
  assert.equal(ROOM.shade.mirror[1], 0); assert.equal(ROOM.shade.body[1], 0);
  assert.ok(ROOM.shade.brain[1] > 0, 'the brain keeps its shadow');
  // the shader text declares no variable with a GLSL reserved name (an `out` made the whole room program invalid)
  const { roomGlsl } = await import('../scene/src/ns-room.mjs');
  assert.ok(!/\b(?:float|vec[234]|int|bool)\s+(?:out|in|inout|input|output|sample|filter|active|common|partition)\b/.test(roomGlsl()));
});

test('S15: face muscles are named side first in plain words, not by their file names', () => {
  assert.equal(partPickName('Orbicularis oris muscle.r (zf-orbicularis-oris-r) [face layer]'), 'Right orbicularis oris');
  assert.equal(partPickName('Corrugator supercilii.l (zf-corrugator-l) [face layer]'), 'Left corrugator supercilii');
  assert.equal(partPickName('Superficial part of masseter.r'), 'Right superficial part of masseter');
  assert.equal(partPickName('mirror image: Platysma.l (zf-platysma-l)'), 'Left platysma');
  // other names are cleaned as before
  assert.equal(partPickName('Right external oblique (FJ1452)'), 'Right external oblique');
  assert.equal(partPickName('mirror image: Left biceps femoris (FJ1234M) [x]'), 'Left biceps femoris');
});

test('M3: a held number key moves the part only while it is held; a short press is still the whole movement', async () => {
  // 20 November 2026 (Message 206): withdrawn. A number key's progressive press is an ordinary press now: the part
  // contracts to the movement's end and returns, whatever the key does after (MOVE_HOLD); 'muscleRelease' changes
  // nothing. (The number keys choose limbs since 19 November, so no key sends these in play.)
  const { createControls } = await import('../scene/src/ns-controls.mjs');
  const { A, s } = started({ bodyRest: { knee_ext_L: -6, knee_ext_R: -6 } });
  const down = st => A.step(st, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_flex', regionOnly: false, progressive: true, at: 0 }], H);
  const up = (st, tap) => A.step(st, [{ type: 'muscleRelease', regionId: 'rh_knee', actionId: 'rh_knee_flex', tap, at: 0 }], H);
  const held = furthest(A, down(s), 29, 'knee_ext_L', -1);
  assert.ok(held.far <= -130, `the whole movement at once (${held.far.toFixed(1)})`);
  assert.equal(held.s.progress, undefined, 'no held-key movement is kept');
  const released = up(held.s, false);
  assert.equal(released.bodyGoal.knee_ext_L, -6, 'the release leaves no place behind: the knee\'s place is still the start');
  assert.equal(frames(A, released, 180).s.bodyPos.knee_ext_L, -6, 'and the knee returns');
  // the controls still queue a key's release for the app
  const C = createControls();
  const q = C.drainUiEvents(C.moveKeyUp(C.moveKey(C.state, 3, 0), 3, 10));
  assert.deepEqual(q.map(e => e.type + e.n), ['move3', 'moveUp3']);
});

// 19 November 2026 (the owner: "go back to activation simply by cursor highlight"). 20 November 2026 (Message 206):
// restated: the look's rest contracts the part, and it returns; a further press contracts it again.
test('by default a look that rests on a motor area switches it on: it contracts hard to the end, returns to where it was, and a further press does it again', () => {
  const { A, s } = started();
  const J = JOINT_LATCH, start = s.bodyPos.knee_ext_L;
  // the look's rest starts the contraction; within the contraction the knee reaches its end angle
  let st = frames(A, s, Math.ceil(GAZE_DWELL.latchS / H) + 1, () => look('rh_knee', 'rh_knee_flex')).s;
  assert.deepEqual(st.bodyJerk.knee_ext_L.slice(0, 1), [-135], 'the look started the knee\'s contraction to its end');
  assert.equal(st.bodyGoal.knee_ext_L, start, 'its place is unchanged: nothing is held');
  const c = furthest(A, st, Math.ceil(J.driveS / H), 'knee_ext_L', -1);
  assert.ok(c.far <= -134.5, `driven all the way to its end (${c.far.toFixed(1)})`);
  assert.ok(c.far >= -135 - 1e-9, 'never past it (the end is a stop for the contraction)');
  // then it returns, the whole way, and stays
  const settled = frames(A, c.s, 300).s;
  assert.equal(settled.bodyPos.knee_ext_L, start, 'back where it was');
  assert.deepEqual(settled.bodyJerk, {}, 'nothing under way');
  assert.equal(frames(A, settled, 60).s.bodyPos.knee_ext_L, start, 'and it stays there');
  // a further press: driven to its end again, and back again
  const again = furthest(A, A.step(settled, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_flex', regionOnly: false, at: 0 }], H), Math.ceil(J.driveS / H), 'knee_ext_L', -1);
  assert.ok(again.far <= -134.5, `in again, all the way (${again.far.toFixed(1)})`);
  assert.equal(frames(A, again.s, 300).s.bodyPos.knee_ext_L, start, 'and back again');
});

test('a movement with little travel still shows: straightening a nearly straight knee kicks against its end', () => {
  // the game's start posture has the knees 6 degrees bent, and the knee's range ends at straight
  const { A, s } = started({ bodyRest: { knee_ext_L: -6, knee_ext_R: -6 }, bodyJointLimits: { knee_ext_L: [-135, 0], knee_ext_R: [-135, 0] } });
  let st = frames(A, s, Math.ceil(GAZE_DWELL.latchS / H) + 1, () => look('rh_knee', 'rh_knee_extend')).s, far = 0;
  const start = s.bodyPos.knee_ext_L;
  assert.equal(st.bodyJerk.knee_ext_L[0], 0);
  for (let i = 0; i < 30; i++) { st = A.stepGated(st, [], H).state; far = Math.max(far, Math.abs(st.bodyPos.knee_ext_L - 0)); }
  assert.ok(far > 8, `the knee swings ${far.toFixed(1)} degrees about its end, where its own travel is ${Math.abs(start)}`);
  const settled = frames(A, st, 300).s;
  assert.equal(settled.bodyPos.knee_ext_L, start, `and returns to where it was (${settled.bodyPos.knee_ext_L.toFixed(1)})`);
});

test('under reduced motion a press neither kicks nor bounces: the joint goes to its end and back (Message 206)', () => {
  const { A, s } = started({ jointSpring: JOINT_LATCH.reducedMotion });
  const out = [];
  let st = frames(A, s, Math.ceil(GAZE_DWELL.latchS / H) + 1, () => look('rh_knee', 'rh_knee_flex')).s;
  for (let i = 0; i < 120; i++) { st = A.stepGated(st, [], H).state; out.push(st.bodyPos.knee_ext_L); }
  const low = Math.min(...out), at = out.indexOf(low);
  assert.ok(low < -125 && low >= -135, `out toward its end (${low.toFixed(1)})`);
  for (let i = 1; i <= at; i++) assert.ok(out[i] <= out[i - 1] + 1e-9, 'straight out, no rebound');
  for (let i = at + 1; i < out.length; i++) assert.ok(out[i] >= out[i - 1] - 1e-9, 'straight back, no overshoot');
  assert.ok(Math.abs(frames(A, st, 200).s.bodyPos.knee_ext_L - s.bodyPos.knee_ext_L) < 1e-9, 'back where it was');
});
