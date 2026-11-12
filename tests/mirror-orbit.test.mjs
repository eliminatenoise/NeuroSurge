/**
 * The mirror body's four arrows orbit it (R558, user: "The body arrows for the body should also be for orbit not back
 * and forth"): the side arrows turn it about its vertical axis, the top and bottom arrows tilt it about the screen's
 * horizontal axis through its own centre, and an up / down drag does the same. This suite checks the pure parts:
 * the direction table, the step and its limits, the transform of a tilted body (mirror image, pivot, which way it
 * tilts, how far it stands back), that the start and a reset are still the literal reflection, and the wording.
 * It also checks the stand-back that lets the body be turned all the way round: the mirror image of everything your
 * left hand can reach (a sphere about the left shoulder) stays behind the mirror plane at every turn and tilt.
 *
 * Not covered here: the picture, the arrows' places on screen, the contact guard and the drag itself (browser checks),
 * and the real body's measurements (the sphere here is a made-up one of about the game's size on the fallback box).
 *
 * Run: node tests/mirror-orbit.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');

const target = new URL('../scene/src/ns-mirror.mjs', import.meta.url);
const NM = await import(target.href);
const app = await import(new URL('../scene/src/ns-app.mjs', import.meta.url).href);
const NT = await import(new URL('../scene/src/ns-text.mjs', import.meta.url).href);
const NB = await import(new URL('../scene/src/ns-brain.mjs', import.meta.url).href);

const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} is not within ${eps} of ${b}`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const body = NM.fallbackBodyBounds();
const placement = NM.mirrorReflectionPlacement({ body, eye: [0, 0, 0] });
const start = NM.createMirrorState(placement);
const withOrbit = (yaw, pitch, push = 0) => Object.freeze({ ...start, orbit: Object.freeze({ yaw, pitch, push }) });
/** The eight corners of the posed body's box (your own body, world m). */
const corners = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  corners.push([body.centre[0] + sx * body.half[0], body.centre[1] + sy * body.half[1], body.centre[2] + sz * body.half[2]]);
}
/** How far the drawn box reaches toward you, measured from the place it is carried at (m). */
const reachToward = T => Math.max(...corners.map(c => dot(sub(NM.mirrorPoint(c, T), T.carryCentre), placement.toward)));
const topOfBody = [body.centre[0], body.centre[1] + body.half[1], body.centre[2]];
/** A placement like the game's: the plane 5 cm in front of the farthest reach, and your left hand's reach sphere (the
 * left shoulder a little behind and below the eye, to your left; the arm's length and a few centimetres). */
const reach = Object.freeze({ centre: Object.freeze([-0.2, -0.15, 0.07]), radiusM: 0.668 });
const placementR = NM.mirrorReflectionPlacement({ body, eye: [0, 0, 0], foremostM: 0.917, reach });
const startR = NM.createMirrorState(placementR);
const withOrbitR = (yaw, pitch) => Object.freeze({ ...startR, orbit: Object.freeze({ yaw, pitch, push: 0 }) });
/** How far the image of the reach sphere passes the mirror plane toward you (m; negative = behind the plane). */
const pastPlane = T => dot(sub(NM.mirrorPoint(reach.centre, T), placementR.plane.pointM), placementR.toward) + reach.radiusM;

check('all four directions orbit: top and bottom tilt, the sides turn, none slides', () => {
  const D = NM.MIRROR_ORBIT_DIRECTIONS;
  assert.deepEqual({ ...D.forward }, { yaw: 0, pitch: 1, push: 0 });
  assert.deepEqual({ ...D.back }, { yaw: 0, pitch: -1, push: 0 });
  assert.deepEqual({ ...D.left }, { yaw: -1, pitch: 0, push: 0 });
  assert.deepEqual({ ...D.right }, { yaw: 1, pitch: 0, push: 0 });
  for (const d of NM.MIRROR_DIRS) assert.equal(D[d].push, 0, `${d} must not slide the body`);
});

check('the mirror body and the brain use the same names and signs for an arrow', () => {
  for (const d of NM.MIRROR_DIRS) {
    assert.equal(Math.sign(NM.MIRROR_ORBIT_DIRECTIONS[d].yaw), Math.sign(NB.ORBIT_DIRECTIONS[d].yaw), `${d} yaw`);
    assert.equal(Math.sign(NM.MIRROR_ORBIT_DIRECTIONS[d].pitch), Math.sign(NB.ORBIT_DIRECTIONS[d].pitch), `${d} pitch`);
  }
});

check('a drag on the mirror body turns it the same way as a drag on the brain', () => {
  assert.deepEqual({ ...app.DRAG_TURN_DIRS.mirror }, { ...app.DRAG_TURN_DIRS.brain });
  assert.equal(app.DRAG_TURN_DIRS.mirror.down, 'forward');
  assert.equal(app.DRAG_TURN_DIRS.mirror.up, 'back');
});

check('one click on the top or bottom arrow tilts by one step and leaves the turn and the push alone', () => {
  const o = NM.mirrorOrbitStep({ yaw: 40, pitch: 0, push: 0 }, 'forward');
  assert.deepEqual({ ...o }, { yaw: 40, pitch: NM.MIRROR_ORBIT.stepDeg, push: 0 });
  const b = NM.mirrorOrbitStep({ yaw: 40, pitch: 0, push: 0 }, 'back');
  assert.deepEqual({ ...b }, { yaw: 40, pitch: -NM.MIRROR_ORBIT.stepDeg, push: 0 });
  const named = NM.mirrorOrbitStep({ yaw: 0, pitch: 0, push: 0 }, 'top');
  assert.equal(named.pitch, NM.MIRROR_ORBIT.stepDeg, 'the compass name top is the forward arrow');
});

check('the tilt stops at the view from straight above and from straight below', () => {
  assert.equal(NM.MIRROR_ORBIT.pitchLimitDeg, 90);
  let o = { yaw: 0, pitch: 0, push: 0 };
  for (let i = 0; i < 20; i++) o = NM.mirrorOrbitStep(o, 'forward');
  assert.equal(o.pitch, 90);
  for (let i = 0; i < 40; i++) o = NM.mirrorOrbitStep(o, 'back');
  assert.equal(o.pitch, -90);
  assert.equal(o.yaw, 0);
  assert.equal(o.push, 0);
});

check('the side arrows still turn it all the way round', () => {
  let o = { yaw: 0, pitch: 30, push: 0 };
  for (let i = 0; i < 13; i++) o = NM.mirrorOrbitStep(o, 'right');
  near(o.yaw, -165, 1e-9, 'thirteen steps right wrap past the back');
  assert.equal(o.pitch, 30, 'a turn leaves the tilt alone');
});

check('the start is the literal reflection, with no stand-back', () => {
  const T = NM.mirrorTransform(start);
  assert.ok(NM.matrixMaxDiff(T.matrix, placement.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
  assert.equal(T.tiltAwayM, 0);
  assert.equal(T.standBackM, 0);
  assert.deepEqual(Array.from(T.centre), Array.from(T.carryCentre));
});

check('without a reach sphere a turn alone keeps every point at its height and does not stand back', () => {
  assert.equal(placement.reach, null);
  for (const yaw of [15, 90, -135, 180]) {
    const T = NM.mirrorTransform(withOrbit(yaw, 0));
    assert.equal(T.tiltAwayM, 0, `yaw ${yaw}`);
    assert.equal(T.reachAwayM, 0, `yaw ${yaw}`);
    assert.equal(T.standBackM, 0, `yaw ${yaw}`);
    assert.equal(NM.mirrorReachAwayM(placement, yaw, 40), 0, 'no sphere, no reach stand-back');
    for (const c of corners) near(NM.mirrorPoint(c, T)[1], c[1], 1e-12, `corner height at yaw ${yaw}`);
  }
});

check('a tilted body is still a mirror image of the same size', () => {
  for (const [yaw, pitch] of [[0, 15], [0, -90], [60, 45], [-150, 90], [180, -30]]) {
    const T = NM.mirrorTransform(withOrbit(yaw, pitch));
    near(T.det, -1, 1e-9, `det at yaw ${yaw}, pitch ${pitch}`);
    const a = NM.mirrorPoint(corners[0], T), b = NM.mirrorPoint(corners[7], T);
    near(Math.hypot(...sub(a, b)), Math.hypot(...sub(corners[0], corners[7])), 1e-9, 'the box diagonal keeps its length');
  }
});

check('the top arrow brings the top of the body toward you, the bottom arrow takes it away', () => {
  const lean = pitch => { const T = NM.mirrorTransform(withOrbit(0, pitch)); return dot(sub(NM.mirrorPoint(topOfBody, T), T.centre), placement.toward); };
  near(lean(0), 0, 1e-12, 'upright');
  assert.ok(lean(15) > 0.1, `one step up leans the top toward you: ${lean(15)}`);
  assert.ok(lean(-15) < -0.1, `one step down leans the top away: ${lean(-15)}`);
  near(lean(90), body.half[1], 1e-9, 'seen from straight above the top of the head points at you');
  near(lean(-90), -body.half[1], 1e-9, 'seen from straight below the feet end points at you');
});

check('the tilt is about the centre of the body: its centre keeps its height and only moves along the ground', () => {
  for (const [yaw, pitch] of [[0, 30], [45, -60], [-120, 90]]) {
    const T = NM.mirrorTransform(withOrbit(yaw, pitch));
    near(NM.mirrorPoint(body.centre, T)[1], placement.centre[1], 1e-12, 'centre height');
    assert.deepEqual(Array.from(T.carryCentre), Array.from(placement.centre));
    const shift = sub(T.centre, T.carryCentre);
    assert.equal(shift[1], 0, 'the stand-back is level');
    near(Math.hypot(shift[0], shift[2]), T.standBackM, 1e-12, 'the centre moves by the stand-back only');
    assert.equal(T.standBackM, T.tiltAwayM, 'with no reach sphere the stand-back is the tilt clearance');
  }
});

check('a tilted body stands back so that it never reaches nearer than the upright one', () => {
  let some = 0;
  for (let yaw = -180; yaw <= 180; yaw += 15) {
    const uprightReach = reachToward(NM.mirrorTransform(withOrbit(yaw, 0)));
    for (let pitch = -90; pitch <= 90; pitch += 7.5) {
      const T = NM.mirrorTransform(withOrbit(yaw, pitch));
      assert.ok(T.tiltAwayM >= 0, 'never negative');
      near(T.tiltAwayM, NM.mirrorTiltAwayM(placement, yaw, pitch), 0, 'the transform uses mirrorTiltAwayM');
      assert.ok(reachToward(T) <= uprightReach + 1e-9, `yaw ${yaw}, pitch ${pitch}: reaches ${reachToward(T)} m, upright ${uprightReach} m`);
      if (T.tiltAwayM > 0.01) some++;
    }
  }
  assert.ok(some > 100, `the stand-back is used for many tilts (${some})`);
  assert.equal(NM.mirrorTiltAwayM(placement, 37, 0), 0, 'none while upright');
  // Facing you and seen from straight above, the 0.72 m half height points at you where the 0.45 m half depth did.
  near(NM.mirrorTiltAwayM(placement, 0, 90), body.half[1] - body.half[2], 1e-9, 'straight above');
});

check('a reach sphere changes nothing at the start: same plane, same pivot, the literal reflection', () => {
  assert.equal(NM.MIRROR_ORBIT.reachClear, true);
  const plain = NM.mirrorReflectionPlacement({ body, eye: [0, 0, 0], foremostM: 0.917 });
  assert.deepEqual(Array.from(placementR.matrix), Array.from(plain.matrix));
  assert.deepEqual(Array.from(placementR.centre), Array.from(plain.centre));
  assert.equal(placementR.plane.distanceM, plain.plane.distanceM);
  assert.deepEqual({ centre: Array.from(placementR.reach.centre), radiusM: placementR.reach.radiusM }, { centre: [...reach.centre], radiusM: reach.radiusM });
  const T = NM.mirrorTransform(startR);
  assert.equal(T.reachAwayM, 0);
  assert.equal(T.standBackM, 0);
  assert.ok(NM.matrixMaxDiff(T.matrix, placementR.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
  assert.ok(pastPlane(T) < -0.3, `reflected, the image of your reach is well behind the plane: ${pastPlane(T)}`);
  assert.throws(() => NM.mirrorReflectionPlacement({ body, eye: [0, 0, 0], reach: { centre: [0, 0, 0], radiusM: 0 } }));
  assert.throws(() => NM.mirrorReflectionPlacement({ body, eye: [0, 0, 0], reach: { centre: [0, NaN, 0], radiusM: 0.6 } }));
});

check('turned or tilted, the image of your reach never passes the mirror plane, and stands back no more than that needs', () => {
  let touching = 0, free = 0, worst = -Infinity, most = 0;
  for (let yaw = -180; yaw <= 180; yaw += 7.5) for (let pitch = -90; pitch <= 90; pitch += 7.5) {
    const T = NM.mirrorTransform(withOrbitR(yaw, pitch));
    near(T.reachAwayM, NM.mirrorReachAwayM(placementR, yaw, pitch), 0, 'the transform uses mirrorReachAwayM');
    near(T.tiltAwayM, NM.mirrorTiltAwayM(placementR, yaw, pitch), 0, 'the tilt clearance is unchanged');
    assert.equal(T.standBackM, Math.max(T.tiltAwayM, T.reachAwayM), 'the larger of the two, never the sum');
    const past = pastPlane(T);
    worst = Math.max(worst, past);
    assert.ok(past <= 1e-9, `yaw ${yaw}, pitch ${pitch}: the image of your reach is ${past} m past the plane`);
    if (T.reachAwayM > T.tiltAwayM + 1e-6) { near(past, 0, 1e-9, `yaw ${yaw}, pitch ${pitch}: it stands back exactly to the plane`); touching++; }
    if (T.reachAwayM === 0) free++;
    most = Math.max(most, T.reachAwayM);
  }
  assert.ok(touching > 200, `the stand-back is used for many turns and tilts (${touching})`);
  assert.ok(free > 300, `and not needed for many others (${free})`);
  assert.ok(most > 0.15 && most < 0.6, `at most ${most} m here`);
  assert.ok(worst <= 1e-9);
});

check('with the reach sphere the body turns all the way round on the ground, smoothly, and comes back exactly', () => {
  // Upright, with no stand-back for the first part of a turn either way.
  for (const yaw of [-45, -30, -15, 15, 30, 45, 90]) assert.equal(NM.mirrorTransform(withOrbitR(yaw, 0)).standBackM, 0, `yaw ${yaw}`);
  // A turn keeps every point at its height, also where it stands back; the stand-back is level.
  for (const yaw of [-150, -90, 165, 180]) {
    const T = NM.mirrorTransform(withOrbitR(yaw, 0));
    assert.ok(T.standBackM > 0.05, `yaw ${yaw} stands back: ${T.standBackM}`);
    for (const c of corners) near(NM.mirrorPoint(c, T)[1], c[1], 1e-12, `corner height at yaw ${yaw}`);
    const shift = sub(T.centre, T.carryCentre);
    assert.equal(shift[1], 0);
    near(Math.hypot(shift[0], shift[2]), T.standBackM, 1e-12, 'the centre moves by the stand-back only');
    assert.ok(dot(shift, placementR.toward) < 0, 'away from you');
  }
  // One held step (1.2 degrees) never moves it by more than the shoulder's own swing over that angle.
  const off = sub(reach.centre, body.centre), arm = Math.hypot(off[0], off[2]), stepRad = NM.MIRROR_ORBIT.hold.stepDeg * Math.PI / 180;
  let prev = NM.mirrorReachAwayM(placementR, -180, 0);
  for (let i = 1; i <= 300; i++) {
    const now = NM.mirrorReachAwayM(placementR, -180 + i * NM.MIRROR_ORBIT.hold.stepDeg, 0);
    assert.ok(Math.abs(now - prev) <= arm * stepRad + 1e-12, `step ${i}: ${Math.abs(now - prev)} m`);
    prev = now;
  }
  // Twenty-four clicks one way is a whole turn: the literal reflection again.
  let s = startR;
  for (let i = 0; i < 24; i++) s = NM.applyMirrorOrbit(s, { clicks: ['right'] });
  near(s.orbit.yaw, 0, 1e-9, 'a whole turn');
  assert.ok(NM.matrixMaxDiff(NM.mirrorTransform(s).matrix, placementR.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
  s = NM.resetMirror(NM.applyMirrorOrbit(startR, { clicks: ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'left', 'left', 'left', 'forward'] }));
  assert.ok(NM.matrixMaxDiff(NM.mirrorTransform(s).matrix, placementR.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
});

check('the stand-back depends on the angles only, not on where the body has been carried', () => {
  const carried = Object.freeze({ ...placementR, worldCentre: Object.freeze([0.4, placementR.centre[1], placementR.centre[2] - 0.6]) });
  for (const [yaw, pitch] of [[-150, 0], [180, 0], [30, 75], [-120, -45]]) {
    const a = NM.mirrorTransform(withOrbitR(yaw, pitch));
    const b = NM.mirrorTransform(Object.freeze({ ...startR, placement: carried, orbit: Object.freeze({ yaw, pitch, push: 0 }) }));
    assert.equal(b.reachAwayM, a.reachAwayM, `yaw ${yaw}, pitch ${pitch}`);
    assert.equal(b.standBackM, a.standBackM, `yaw ${yaw}, pitch ${pitch}`);
    assert.deepEqual(Array.from(b.carryCentre), Array.from(carried.worldCentre));
  }
});

check('tilting back by the same amount, or a reset, stands it up again exactly', () => {
  let s = NM.applyMirrorOrbit(start, { clicks: ['forward', 'forward', 'left'] });
  assert.equal(s.orbit.pitch, 30);
  assert.equal(s.orbit.yaw, -15);
  const back = NM.applyMirrorOrbit(s, { clicks: ['back', 'back', 'right'] });
  assert.ok(NM.matrixMaxDiff(NM.mirrorTransform(back).matrix, placement.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
  s = NM.resetMirror(s);
  assert.deepEqual({ ...s.orbit }, { yaw: 0, pitch: 0, push: 0 });
  assert.ok(NM.matrixMaxDiff(NM.mirrorTransform(s).matrix, placement.matrix) <= NM.MIRROR_REFLECTION.matrixTolerance);
});

check('a held top arrow keeps tilting gently and stops at the limit', () => {
  let s = NM.applyMirrorOrbit(start, { clicks: ['forward'], press: { dir: 'forward', at: 0 }, now: 0 });
  assert.equal(s.orbit.pitch, 15);
  s = NM.applyMirrorOrbit(s, { now: 250 });
  assert.equal(s.orbit.pitch, 15, 'nothing before the hold delay');
  s = NM.applyMirrorOrbit(s, { now: 300 });
  near(s.orbit.pitch, 15 + NM.MIRROR_ORBIT.hold.stepDeg, 1e-9, 'first held step');
  for (let t = 400; t <= 12000; t += 100) s = NM.applyMirrorOrbit(s, { now: t });
  assert.equal(s.orbit.pitch, 90);
  s = NM.applyMirrorOrbit(s, { release: true, now: 12100 });
  assert.equal(s.hold, null);
});

check('the words say tilt, not slide', () => {
  const said = [NM.MIRROR_TEXT.arrows, NM.MIRROR_TEXT.escRow, NT.ARROWS.mirror.tip.forward, NT.ARROWS.mirror.tip.back,
    NT.ARROWS.mirror.label.forward, NT.ARROWS.mirror.label.back, NT.MIRROR.arrows, NT.MIRROR.escRow, NT.MIRROR.reach, NT.MIRROR.rowTurn];
  for (const s of said) {
    assert.equal(typeof s, 'string');
    assert.ok(!/slid/i.test(s), `still says slide: ${s}`);
    assert.ok(/tilt/i.test(s), `does not say tilt: ${s}`);
  }
  assert.ok(/above/.test(NT.ARROWS.mirror.tip.forward) && /below/.test(NT.ARROWS.mirror.tip.back));
  for (const s of [NT.MIRROR.turned, NT.MIRROR.turnedSeparate]) assert.ok(!/farther away/.test(s), s);
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'mirror-orbit', module: target.href, cases: results.length, failed: failed.length, results,
  scope: 'Pure checks of ns-mirror on the fallback body box. The picture, the arrow places, the contact guard and the drag are browser checks.'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
