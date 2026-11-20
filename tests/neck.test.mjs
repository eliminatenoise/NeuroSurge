/** The neck of 20 November 2026 (the owner: "Let's ensure that the human neck looks natural. Right now it looks like
 * there's a scarf around the neck. And let's ensure, certainly in first person view and all other views, neck movement
 * is exaggerated, so you can see it's moving up and down, left and right, extension, flexion, etc."). Pure checks: the
 * platysma left out of the drawn meshes (ns-body NECK_SHEET). No browser, no anatomy validation. */
import test from 'node:test';
import assert from 'node:assert/strict';

test('the platysma is not handed to the scene; every other mesh, and the input, stay as they were', async () => {
  const body = await import('../scene/src/ns-body.mjs');
  const { NECK_SHEET, leaveOutNeckSheet } = body;
  assert.equal(NECK_SHEET.drawn, false);
  assert.deepEqual(NECK_SHEET.rows.map(r => r.id), ['zf-platysma-r', 'zf-platysma-l']);
  const tri = () => ({ positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) });
  const input = new Map([['zf-platysma-r', tri()], ['zf-platysma-l', tri()], ['FJ1595', tri()]]);
  const r = leaveOutNeckSheet(input);
  assert.notEqual(r.meshesById, input, 'a new map');
  assert.deepEqual(r.leftOut, ['zf-platysma-r', 'zf-platysma-l']);
  for (const id of r.leftOut) {
    const m = r.meshesById.get(id);
    assert.equal(m.indices.length, 0, 'no triangle: the scene skips it');
    assert.equal(m.positions, input.get(id).positions, 'its vertices stay (the rig and the skin records still use them)');
  }
  assert.equal(r.meshesById.get('FJ1595'), input.get('FJ1595'), 'the sternocleidomastoid is drawn as before');
  assert.equal(input.get('zf-platysma-r').indices.length, 3, 'the input is not changed');
  // nothing to do: the same map back
  const none = new Map([['FJ1595', tri()]]);
  assert.equal(leaveOutNeckSheet(none).meshesById, none);
  assert.equal(leaveOutNeckSheet(input, { ...NECK_SHEET, drawn: true }).meshesById, input, 'drawn: true draws it again');
});

// A neck movement from the strip as the activity plays it, in held degrees from the start posture: the jerk to the end
// (0.15 s), the hold there (0.3 s), the ease back half way (0.45 s), then held. 60 frames a second.
const jerkThenHalf = (end, t) => (t < 0.1 ? 0 : t < 0.25 ? end * (t - 0.1) / 0.15 : t < 0.55 ? end : t < 1.0 ? end - end / 2 * (t - 0.55) / 0.45 : end / 2);
const run = (app, joint, end, seconds = 3.5, o) => {
  const out = []; let s = null;
  for (let i = 0; i <= seconds * 60; i++) { const t = i / 60; s = app.neckViewStep(s, { neck_rot: 0, neck_flex: 0, neck_side: 0, [joint]: jerkThenHalf(end, t) }, 1 / 60, o); out.push({ t, ...s }); }
  return out;
};

test('the eye view swings with a neck movement from the strip, comes part of the way back with it, then goes back to the pointer', async () => {
  const app = await import('../scene/src/ns-app.mjs');
  const o = app.NECK_VIEW;
  // turn left 80: the view turns left by yawShare of it, at most maxDeg
  const turn = run(app, 'neck_rot', 80);
  const peak = Math.max(...turn.map(q => q.yawDeg));
  assert.ok(Math.abs(peak - Math.min(o.maxDeg, o.yawShare * 80)) < 1e-6, `the turn's swing ${peak}`);
  assert.ok(turn.every(q => q.pitchDeg === 0 && q.rollDeg === 0), 'a turn only turns');
  const atHalf = turn.find(q => q.t >= 1.05).yawDeg;
  assert.ok(Math.abs(atHalf - o.yawShare * 40) < 0.05, 'the partial return brings the view part of the way back with the head');
  const last = turn[turn.length - 1];
  assert.equal(last.yawDeg, 0, 'then the view is exactly the pointer\'s again');
  assert.equal(last.active, false);
  const back = turn.find(q => q.t > 1.0 && q.yawDeg === 0);
  assert.ok(back && back.t < 2.2, `back within about a second of the head's own return (${back && back.t})`);
  // no jump anywhere: at most the neck's own step per frame times the share, and the glide's
  for (let i = 1; i < turn.length; i++) assert.ok(Math.abs(turn[i].yawDeg - turn[i - 1].yawDeg) < 4, `smooth at ${turn[i].t}`);
  // bend forward: the view goes down by flexShare of it; tilt back: up by extendShare (capped); tilt left: the camera rolls left
  const flex = run(app, 'neck_flex', 10), ext = run(app, 'neck_flex', -100), side = run(app, 'neck_side', 45);
  assert.ok(Math.abs(Math.min(...flex.map(q => q.pitchDeg)) + o.flexShare * 10) < 1e-6, 'down by the bend');
  assert.ok(Math.abs(Math.max(...ext.map(q => q.pitchDeg)) - Math.min(o.maxDeg, o.extendShare * 100)) < 1e-6, 'up by the tilt back');
  assert.ok(Math.abs(Math.max(...side.map(q => q.rollDeg)) - Math.min(o.maxRollDeg, o.rollShare * 45)) < 1e-6, 'rolled with the side tilt');
  for (const r of [flex, ext, side]) assert.equal(r[r.length - 1].active, false, 'each one ends with the pointer\'s own view');
});

test('the neck view is off when asked (reduced motion, outside), never swings for a creeping neck, and follows a held neck without swinging', async () => {
  const app = await import('../scene/src/ns-app.mjs');
  const off = run(app, 'neck_rot', 80, 3, { ...app.NECK_VIEW, on: false });
  assert.ok(off.every(q => q.yawDeg === 0 && !q.active), 'off: no swing at all');
  // switched on while the neck is already held at 40: no swing (the view counts from where the neck already is)
  let s = app.neckViewStep(null, { neck_rot: 40, neck_flex: 0, neck_side: 0 }, 1 / 60, { ...app.NECK_VIEW, on: false });
  s = app.neckViewStep(s, { neck_rot: 40, neck_flex: 0, neck_side: 0 }, 1 / 60);
  assert.equal(s.yawDeg, 0);
  // a creep of 1 degree a second (slower than stillDegS) never turns the view
  let c = null;
  for (let i = 0; i < 300; i++) { c = app.neckViewStep(c, { neck_rot: i / 60, neck_flex: 0, neck_side: 0 }, 1 / 60); assert.equal(c.yawDeg, 0); }
});

test('the eye camera turned by the neck stands where an ordinary look would put it and keeps the body\'s look', async () => {
  const NC = await import('../scene/src/ns-camera.mjs');
  const eye = [0.01, 0.02, 0.03], look = { yaw: 0.2, pitch: -0.4 }, turned = { yaw: 0.6, pitch: -0.2 };
  const pose = { firstPerson: true, progress: 0, position: [0, 0, 0], armParentPosition: eye, yaw: look.yaw, pitch: look.pitch, bodyLook: look, gazeLook: look,
    direction: NC.gazeDirection(look.yaw, look.pitch), gazeRay: { origin: [0, 0, 0], dir: NC.gazeDirection(look.yaw, look.pitch) } };
  const t = NC.turnEyeView(pose, turned, 0.3);
  const d = NC.eyeDolly(turned);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(t.position[i] - (eye[i] + d.offset[i])) < 1e-12, 'the camera stands where EYE_DOLLY puts it for the turned look');
  assert.equal(t.yaw, turned.yaw); assert.equal(t.pitch, turned.pitch); assert.equal(t.roll, 0.3);
  assert.deepEqual(t.bodyLook, look, 'the body, the shoulder and the left hand keep the pointer\'s look');
  assert.deepEqual(t.armParentPosition, eye, 'the eye itself does not move');
  const g = NC.gazeDirection(turned.yaw, turned.pitch);
  assert.ok(t.gazeRay.dir.every((v, i) => Math.abs(v - g[i]) < 1e-12), 'the crosshair ray goes along the turned view');
  assert.equal(Math.hypot(...NC.eyeDolly(look).offset).toFixed(9), Math.hypot(...d.offset).toFixed(9), 'the same stand-off: nothing grows or shrinks');
  const moving = { ...pose, progress: 0.5, firstPerson: false };
  assert.equal(NC.turnEyeView(moving, turned), moving, 'outside or between the views: unchanged');
});

test('"Tilt head back" reaches the neck\'s own end; the camera\'s old limits no longer cut the drawn head short', async () => {
  const app = await import('../scene/src/ns-app.mjs');
  const body = await import('../scene/src/ns-body.mjs');
  const rest = { neck_flex: body.BODY_POSTURES.open.neck_flex, trunk_flex: body.BODY_POSTURES.open.trunk_flex };
  const L = app.headLookLimits(body, app.HEAD_LOOK, { ...rest, pelvic_tilt: body.BODY_POSTURES.open.pelvic_tilt });
  const DEG = Math.PI / 180;
  // the held extension of "Tilt head back" from the posture (to the joint's -60) with a look a little up
  const held = body.BODY_JOINT_LIMITS.neck_flex[0] - rest.neck_flex;
  const h = app.headPoseForLook({ yaw: 0, pitch: -14 * DEG }, { neck_flex: held, neck_rot: 0, trunk_flex: 0 }, L);
  assert.ok(Math.abs(h.joints.neck_flex + rest.neck_flex - body.BODY_JOINT_LIMITS.neck_flex[0]) < 1e-6, `the head tilts back to the joint's end (${h.joints.neck_flex + rest.neck_flex})`);
  assert.equal(h.look.pitch, -14 * DEG, 'the view is still the look alone');
});
