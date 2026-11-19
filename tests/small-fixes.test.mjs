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
  // a click presses it: the knee bends at once and stays
  const pressed = frames(A, A.step(s1, [{ type: 'click', at: 0 }], H), 30).s;
  assert.equal(pressed.bodyGoal.knee_ext_L, -135);
  assert.ok(pressed.bodyPos.knee_ext_L < -120, `knee ${pressed.bodyPos.knee_ext_L}`);
  assert.equal(pressed.activatedRegions.rh_knee, 1);
});

test('S4: a number key (the same event as a muscle tap) presses the area too', () => {
  const { A, s } = started({ lookArms: { ...LOOK_ARMS, on: true } });
  const s1 = frames(A, s, 30, () => look('rh_knee', 'rh_knee_flex')).s;
  const s2 = frames(A, A.step(s1, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_flex', regionOnly: false, at: 0 }], H), 30).s;
  assert.equal(s2.bodyGoal.knee_ext_L, -135);
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
  const press = (A, s, actionId) => frames(A, A.step(s, [{ type: 'muscle', regionId: 'rh_knee', actionId, regionOnly: false, at: 0 }], H), 30).s;
  const { A, s } = started({ bodyRest: { knee_ext_L: -6, knee_ext_R: -6 } });
  assert.equal(s.bodyGoal.knee_ext_L, -6);
  const straight = press(A, s, 'rh_knee_extend');
  assert.equal(straight.bodyGoal.knee_ext_L, 0);
  assert.deepEqual(A.latchView(straight).back.filter(k => k.startsWith('rh_knee')), [], 'the card does not say "first press brings it back"');
  const bent = press(A, straight, 'rh_knee_flex');
  assert.equal(bent.bodyGoal.knee_ext_L, -135, 'the first press bends');
  // a larger move still needs its opposite first (Message 6): bent, "Straighten" brings it back to the start first
  const back = press(A, bent, 'rh_knee_extend');
  assert.equal(back.bodyGoal.knee_ext_L, -6);
  assert.equal(press(A, back, 'rh_knee_extend').bodyGoal.knee_ext_L, 0);
});

test('S4: lookArms { on: false } keeps the old rule (the rest of a look moves the part)', () => {
  const { A, s } = started({ lookArms: { on: false } });
  const s1 = frames(A, s, 40, () => look('rh_knee', 'rh_knee_flex')).s;
  assert.equal(s1.bodyGoal.knee_ext_L, -135);
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
  const { MOVE_HOLD } = await import('../scene/src/ns-actions.mjs');
  const { createControls } = await import('../scene/src/ns-controls.mjs');
  const { A, s } = started({ bodyRest: { knee_ext_L: -6, knee_ext_R: -6 } });
  const down = st => A.step(st, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_flex', regionOnly: false, progressive: true, at: 0 }], H);
  const up = (st, tap) => A.step(st, [{ type: 'muscleRelease', regionId: 'rh_knee', actionId: 'rh_knee_flex', tap, at: 0 }], H);
  // held half a second: the knee goes part of the way, at MOVE_HOLD.rateDegS, and stays there when the key comes up
  const held = frames(A, down(s), 29).s;
  const want = -6 - MOVE_HOLD.rateDegS * 0.5;
  assert.ok(Math.abs(held.bodyGoal.knee_ext_L - want) < 3, `goal ${held.bodyGoal.knee_ext_L} near ${want}`);
  const stopped = frames(A, up(held, false), 60).s;
  assert.equal(stopped.progress, null);
  assert.ok(Math.abs(stopped.bodyPos.knee_ext_L - held.bodyPos.knee_ext_L) < 1.5 && stopped.bodyPos.knee_ext_L > -100 && stopped.bodyPos.knee_ext_L < -30, `stopped at ${stopped.bodyPos.knee_ext_L}`);
  // a tap: the whole movement, as before
  const tapped = frames(A, up(frames(A, down(s), 5).s, true), 30).s;
  assert.equal(tapped.bodyGoal.knee_ext_L, -135);
  // held to the end it ends there by itself; a click (no progressive flag) is the whole movement at once
  assert.equal(frames(A, down(s), 120).s.bodyGoal.knee_ext_L, -135);
  assert.equal(frames(A, A.step(s, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_flex', regionOnly: false, at: 0 }], H), 2).s.bodyGoal.knee_ext_L, -135);
  // the stage rule holds: bent, a held "Straighten" brings the knee back part way toward the start only
  const bent = frames(A, A.step(s, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_flex', regionOnly: false, at: 0 }], H), 30).s;
  const back = frames(A, A.step(bent, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_extend', regionOnly: false, progressive: true, at: 0 }], H), 29).s;
  assert.ok(back.bodyGoal.knee_ext_L > -135 && back.bodyGoal.knee_ext_L < -6, `part way back: ${back.bodyGoal.knee_ext_L}`);
  // the controls queue a key's release for the app
  const C = createControls();
  const q = C.drainUiEvents(C.moveKeyUp(C.moveKey(C.state, 3, 0), 3, 10));
  assert.deepEqual(q.map(e => e.type + e.n), ['move3', 'moveUp3']);
});

// 19 November 2026 (the owner: "go back to activation simply by cursor highlight"; "it activates heavily relaxes slightly
// and repeats that process with each further click")
test('by default a look that rests on a motor area switches it on: it drives hard to the end, eases back a little, and a further press drives it in again', () => {
  const { A, s } = started();
  const J = JOINT_LATCH, travel = -135 - s.bodyPos.knee_ext_L, eased = -135 - J.relax * travel; // the knee's travel from its start angle
  // the look's rest latches the movement; a quarter second on, the knee has been at (or past) its end angle
  let st = frames(A, s, Math.ceil(GAZE_DWELL.latchS / H) + 1, () => look('rh_knee', 'rh_knee_flex')).s, furthest = 0;
  assert.equal(st.bodyGoal.knee_ext_L, -135, 'the look bent the knee');
  for (let i = 0; i < Math.ceil(J.driveS / H); i++) { st = A.stepGated(st, [], H).state; furthest = Math.min(furthest, st.bodyPos.knee_ext_L); }
  assert.ok(furthest <= -135, `driven all the way to its end (${furthest.toFixed(1)})`);
  // then it eases back a little and waits there
  const settled = frames(A, st, 300).s;
  assert.equal(settled.bodyGoal.knee_ext_L, -135, 'still held');
  assert.ok(Math.abs(settled.bodyPos.knee_ext_L - eased) < 0.5, `eased back to ${eased.toFixed(1)} (${settled.bodyPos.knee_ext_L.toFixed(1)})`);
  assert.ok(Math.abs(eased - -135) > 10 && Math.abs(eased - -135) < 0.3 * Math.abs(travel), 'a little, not most of the way');
  // a further press of the same movement: no jump in the picture, and it is driven to its end again
  let again = A.step(settled, [{ type: 'muscle', regionId: 'rh_knee', actionId: 'rh_knee_flex', regionOnly: false, at: 0 }], H);
  assert.equal(again.bodyGoal.knee_ext_L, -135, 'the goal stays');
  assert.ok(again.bodyPos.knee_ext_L < settled.bodyPos.knee_ext_L && again.bodyVel.knee_ext_L !== 0, `it is knocked toward its end, not thrown back (${again.bodyPos.knee_ext_L.toFixed(1)} from ${settled.bodyPos.knee_ext_L.toFixed(1)})`);
  furthest = 0;
  for (let i = 0; i < Math.ceil(J.driveS / H); i++) { again = A.stepGated(again, [], H).state; furthest = Math.min(furthest, again.bodyPos.knee_ext_L); }
  assert.ok(furthest <= -135, `in again, all the way (${furthest.toFixed(1)})`);
  const back = frames(A, again, 300).s;
  assert.ok(Math.abs(back.bodyPos.knee_ext_L - eased) < 0.5, 'and eased back again');
});

test('a movement with little travel still shows: straightening a nearly straight knee kicks against its end', () => {
  // the game's start posture has the knees 6 degrees bent, and the knee's range ends at straight
  const { A, s } = started({ bodyRest: { knee_ext_L: -6, knee_ext_R: -6 }, bodyJointLimits: { knee_ext_L: [-135, 0], knee_ext_R: [-135, 0] } });
  let st = frames(A, s, Math.ceil(GAZE_DWELL.latchS / H) + 1, () => look('rh_knee', 'rh_knee_extend')).s, far = 0;
  const start = s.bodyPos.knee_ext_L;
  assert.equal(st.bodyGoal.knee_ext_L, 0);
  for (let i = 0; i < 30; i++) { st = A.stepGated(st, [], H).state; far = Math.max(far, Math.abs(st.bodyPos.knee_ext_L - 0)); }
  assert.ok(far > 8, `the knee swings ${far.toFixed(1)} degrees about its end, where its own travel is ${Math.abs(start)}`);
  const settled = frames(A, st, 300).s;
  assert.ok(settled.bodyPos.knee_ext_L <= 0 && settled.bodyPos.knee_ext_L >= Math.min(start, 0), `and waits on its own side (${settled.bodyPos.knee_ext_L.toFixed(1)})`);
});

test('under reduced motion a press neither kicks nor eases back: the joint goes to its end and stays', () => {
  const { A, s } = started({ jointSpring: JOINT_LATCH.reducedMotion });
  const st = frames(A, frames(A, s, Math.ceil(GAZE_DWELL.latchS / H) + 1, () => look('rh_knee', 'rh_knee_flex')).s, 400).s;
  assert.ok(Math.abs(st.bodyPos.knee_ext_L - -135) < 0.5, `at its end (${st.bodyPos.knee_ext_L})`);
});
