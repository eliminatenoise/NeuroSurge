/** The view's follow of the chosen limb while the keys move it (LIMB_KEYS.view follow*, followTurnStep; 21 November 2026,
 * a browser hunt of update 62: H9, the limb keys alone whipped the view up to 80 degrees in a third of a second and
 * took the brain and the mirror body out of the picture; H24, a raised right arm and D spun the view round to face
 * behind you). Pure checks on a camera built like the eye view's: it stands half a metre behind the eye on the line of
 * sight and turns ABOUT THE EYE (ns-camera EYE_DOLLY). They establish what the rule computes, not how it feels. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { LIMB_KEYS, followTurnStep, keepOutBy, viewFrameOf, keepInFrameTurn } = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const DEG = Math.PI / 180, V = LIMB_KEYS.view, FOV = 54, ASPECT = 16 / 9, DT = 1 / 60;
const dir = l => [-Math.sin(l.yaw) * Math.cos(l.pitch), Math.sin(l.pitch), -Math.cos(l.yaw) * Math.cos(l.pitch)];
/** The eye view's camera for a look: 0.5 m behind the eye (at the origin) on the line of sight. */
const poseAt = (l, s = 0.5) => { const d = dir(l); return { position: [-d[0] * s, -d[1] * s, -d[2] * s], yaw: l.yaw, pitch: l.pitch }; };
const frameOf = (p, s = 0.5) => l => viewFrameOf(poseAt(l, s), p, FOV, ASPECT);
/** n frames of the follow for a point that stays where it is; the looks it went through. */
function run(look, p, n, keepOk = null, s = 0.5) {
  const looks = [look]; let l = look, last = null;
  for (let i = 0; i < n; i++) { last = followTurnStep(l, frameOf(p, s), keepOk, FOV, ASPECT, DT, V); l = last.look; looks.push(l); }
  return { looks, last, end: l };
}
const turnDeg = (a, b) => Math.hypot(b.yaw - a.yaw, b.pitch - a.pitch) / DEG;

test('the follow keeps a hand that is in the picture from leaving it, and never fetches one the look has left outside', () => {
  assert.ok(V.followFrom >= 1 && V.followFrom <= 1.3, 'only an end in the picture, or just past its edge, is kept there');
  assert.ok(V.followMinGain > 0.2 && V.followMinGain < 0.6);
  assert.ok(V.followMaxDegS >= 45 && V.followMaxDegS <= 120, 'a turn never faster than this (degrees a second)');
  assert.ok(V.keepBox > 0.6 && V.keepBox < 1 && V.keepFree > 0);
  const start = { yaw: 0, pitch: -25 * DEG };
  // a point well inside the band: no turn
  const pin = viewFrameOf(poseAt(start), [0.1, -0.3, -1.2], FOV, ASPECT);
  assert.ok(Math.abs(pin.x) < V.band && Math.abs(pin.y) < V.bandUp);
  assert.equal(followTurnStep(start, frameOf([0.1, -0.3, -1.2]), null, FOV, ASPECT, DT, V).why, 'in');
  // a point out of the picture (the look left it there): the view stays where the player put it
  const far = [1.6, -0.3, -0.6], ff = viewFrameOf(poseAt(start), far, FOV, ASPECT);
  assert.ok(Math.abs(ff.x) > V.followFrom, `the point stands at x ${ff.x.toFixed(2)}`);
  const r = followTurnStep(start, frameOf(far), null, FOV, ASPECT, DT, V);
  assert.equal(r.why, 'out'); assert.deepEqual(r.look, start);
  // behind the camera: the same (this is what spun the view round: H24)
  assert.equal(followTurnStep(start, frameOf([0, 0.2, 1.5]), null, FOV, ASPECT, DT, V).why, 'out');
});

test('a hand far in front that leaves the band: the view turns just far enough, at most followMaxDegS, and settles', () => {
  const start = { yaw: 0, pitch: -25 * DEG };
  // 1.6 m out in front and to the right, just past the band's edge
  let p = null;
  for (let x = 0.3; x < 2; x += 0.01) { const f = viewFrameOf(poseAt(start), [x, -0.6, -1.6], FOV, ASPECT); if (f.x > V.band + 0.15) { p = [x, -0.6, -1.6]; break; } }
  assert.ok(p);
  const { looks, end } = run(start, p, 90);
  for (let i = 1; i < looks.length; i++) assert.ok(turnDeg(looks[i - 1], looks[i]) <= V.followMaxDegS * DT + 1e-9, `frame ${i}: ${turnDeg(looks[i - 1], looks[i]).toFixed(3)} degrees`);
  const f = viewFrameOf(poseAt(end), p, FOV, ASPECT);
  assert.ok(f.x <= V.band + 0.01 && f.x > V.band - 0.05, `it ends at the band's edge (x ${f.x.toFixed(3)}), not in the middle`);
  assert.ok(end.yaw < 0, 'turned to the right');
  assert.ok(Math.abs(end.pitch - start.pitch) < 0.5 * DEG, 'and not up or down');
  // with the camera's swing about the eye accounted for, the turn is about what a camera turning in place would need
  const pure = keepInFrameTurn(viewFrameOf(poseAt(start), p, FOV, ASPECT), FOV, ASPECT, V.band, V.bandUp).dYaw;
  assert.ok(Math.abs(end.yaw - start.yaw) < 1.6 * Math.abs(pure), `${(end.yaw / DEG).toFixed(1)} degrees against ${(pure / DEG).toFixed(1)} for a camera that only turns`);
});

test('a hand near the head, below the eye: a turn barely moves it in the picture, so the view does not chase it (H9: 25 to 70 degrees down)', () => {
  const start = { yaw: 0, pitch: -25 * DEG };
  // a hand at the right shoulder, 25 cm under the eye and a little in front: under the band
  let p = null;
  for (let z = -0.3; z < 0.1; z += 0.005) { const q = [0.2, -0.25, z], f = viewFrameOf(poseAt(start), q, FOV, ASPECT); if (f.depth > 0.05 && f.y < -V.bandUp - 0.1 && f.y > -1) { p = q; break; } }
  assert.ok(p, 'such a place exists');
  const r = followTurnStep(start, frameOf(p), null, FOV, ASPECT, DT, V);
  assert.equal(r.why, 'weak', `gain ${JSON.stringify(r.gains)}`);
  assert.ok(r.gains.pitch < V.followMinGain);
  assert.deepEqual(r.look, start);
  // the old rule (a camera that turns in place, eased) would have run on: frame after frame it asks for more
  let l = start;
  for (let i = 0; i < 120; i++) { const f = viewFrameOf(poseAt(l), p, FOV, ASPECT); const k = keepInFrameTurn(f, FOV, ASPECT, V.band, V.bandUp); l = { yaw: l.yaw, pitch: Math.max(-88 * DEG, l.pitch + k.dPitch * (1 - Math.exp(-DT / V.followS))) }; }
  const fOld = viewFrameOf(poseAt(l), p, FOV, ASPECT);
  assert.ok(l.pitch < start.pitch - 8 * DEG && fOld.y < -V.bandUp + 0.02, `the old rule pitched to ${(l.pitch / DEG).toFixed(0)} degrees in 2 s and the hand was still under the band (y ${fOld.y.toFixed(2)})`);
});

test('a hand behind the eye in the picture: a turn toward it pushes it further out, so the view does not turn (H24: the view spun round)', () => {
  // looking left and down; the hand up beside and a little behind the head, seen at the picture's left edge
  const start = { yaw: 60 * DEG, pitch: -30 * DEG };
  const d = dir(start);
  let p = null;
  for (let s = 0.05; s < 0.45 && !p; s += 0.01) for (const side of [0.15, 0.2, 0.25]) {
    const left = [-Math.cos(start.yaw), 0, Math.sin(start.yaw)]; // (the picture's left, level)
    const q = [-d[0] * s + left[0] * side, 0.1 - d[1] * s, -d[2] * s + left[2] * side], f = viewFrameOf(poseAt(start), q, FOV, ASPECT);
    if (f.depth > 0.05 && f.x < -V.band - 0.05 && f.x > -1 && Math.abs(f.y) < V.bandUp) { p = q; break; }
  }
  assert.ok(p, 'such a place exists');
  const { end, last } = run(start, p, 120);
  assert.ok(turnDeg(start, end) < 1, `the view turned ${turnDeg(start, end).toFixed(1)} degrees (${last.why}, ${JSON.stringify(last.gains)})`);
});

test('the follow never takes the brain or the mirror body out of the picture: it stops at keepBox, half steps first', () => {
  const start = { yaw: 0, pitch: -25 * DEG };
  let p = null;
  for (let x = 0.3; x < 3; x += 0.01) { const f = viewFrameOf(poseAt(start), [x, -0.6, -1.6], FOV, ASPECT); if (f.x > 1.0) { p = [x, -0.6, -1.6]; break; } }
  // a "brain" ahead and to the left, near the box's edge already
  let brain = null;
  for (let x = 0; x > -3; x -= 0.01) { const f = viewFrameOf(poseAt(start), [x, -0.9, -2.5], FOV, ASPECT); if (f.x < -V.keepBox + 0.06) { brain = [x, -0.9, -2.5]; break; } }
  assert.ok(brain && Math.abs(viewFrameOf(poseAt(start), brain, FOV, ASPECT).y) < 0.5);
  const was = keepOutBy(viewFrameOf(poseAt(start), brain, FOV, ASPECT));
  assert.equal(was, 0);
  const keepOk = l => keepOutBy(viewFrameOf(poseAt(l), brain, FOV, ASPECT)) <= was + 1e-6;
  const { end, last } = run(start, p, 120, keepOk);
  assert.equal(last.why, 'kept');
  const fb = viewFrameOf(poseAt(end), brain, FOV, ASPECT), fp = viewFrameOf(poseAt(end), p, FOV, ASPECT);
  assert.ok(fb.x >= -V.keepBox - 1e-6 && fb.x < -V.keepBox + 0.03, `the brain's middle stays in the picture at x ${fb.x.toFixed(3)}`);
  assert.ok(fp.x > V.band, 'and the hand is left where it is (the brain wins)');
  // keepOutBy: inside 0, outside by how far, behind the camera Infinity
  assert.equal(keepOutBy({ x: 0.5, y: -0.5, depth: 1 }, 0.85), 0);
  assert.ok(Math.abs(keepOutBy({ x: -0.95, y: 0.2, depth: 1 }, 0.85) - 0.1) < 1e-12);
  assert.equal(keepOutBy({ x: 0, y: 0, depth: -1 }, 0.85), Infinity);
});
