/** The chosen limb held by the view, and every limb's whole range (19 November 2026; the owner: "that becomes the main
 * limb you're controlling with all the control keys and the camera view ... with the wrist staying in the same view,
 * which is roughly 3/4 up"; "the wrist/ankle being 3/4 up the height of the frame and staying there"; "We want full
 * range of motion on all axes"; "the right arm ... unable to cross the body"). Pure checks of the picture-place
 * arithmetic, of the free hand's range rule (ns-arm FREE_HAND), of the right shoulder's range across the body
 * (ns-body) and of the limb solve on the game's own body loaded from disk (tools/load-body.mjs). They establish what
 * these rules compute on this one reference body. How the limbs look and feel was tried in the browser; nothing here
 * says anything about a real joint. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { LIMB_KEYS, LIMBS_PASS_ITEMS, TRUNK_KEEP_OUT, viewFrameOf, viewFramePoint, lookFramingPoint, turnToward } = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const { FREE_HAND, freeHandAngles, freeHandInRange, freeHandPole } = await import(path.join(repo, 'scene/src/ns-arm.mjs'));
const G = await import(path.join(repo, 'scene/src/ns-grasp.mjs'));
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, rig, baked } = await loadBody(repo);
const DEG = Math.PI / 180;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
/** A place beside the shoulder from its direction angles (ns-arm's convention) and distance. */
const place = (elevDeg, planeDeg, d) => [-Math.cos(planeDeg * DEG) * Math.sin(elevDeg * DEG) * d, -Math.cos(elevDeg * DEG) * d, -Math.sin(planeDeg * DEG) * Math.sin(elevDeg * DEG) * d];

test('the view holds the chosen limb: three quarters up, the look carries it, the keys move it far', () => {
  const V = LIMB_KEYS.view;
  assert.equal(V.hold, true);
  assert.equal(V.lookCarries, true, 'the pointer moves the chosen limb with the view (the owner: "controlling with all the control keys and the camera view")');
  assert.equal(V.frameUp, 0.75, 'the owner: "roughly 3/4 up ... of the height of the frame"');
  assert.ok(V.band > 0.3 && V.band < 0.9, 'the end may move left and right in the picture before the view turns');
  assert.ok(V.speedMps >= 0.5, 'far more forward and far more back: at least half a metre a second');
  assert.ok(V.leadM > 0 && V.leadM <= 0.05 && V.levelM >= V.leadM);
  // where the look carries the place beyond the joints the limb waits (it does not take the nearest pose it can reach)
  assert.ok(V.waitMm >= 20 && V.waitMm <= 80 && V.waitShare > 0 && V.waitShare < 1);
  assert.equal(LIMBS_PASS_ITEMS, true, 'the brain and the mirror body do not stop a limb');
});

test('a place in the picture and a point in the room are each other\'s inverse', () => {
  const pose = { position: [0.1, 1, 0.2], yaw: 0.4, pitch: -0.3 }, P = [-0.5, 0.4, -1.2];
  const f = viewFrameOf(pose, P, 54, 16 / 9), back = viewFramePoint(pose, f, 54, 16 / 9);
  for (let i = 0; i < 3; i++) assert.ok(near(back[i], P[i], 1e-12));
  assert.ok(f.depth > 0 && f.dist >= f.depth);
  // the look that frames a point at three quarters of the height puts it at NDC y 0.5 and in the middle
  const l = lookFramingPoint(pose.position, P, 54, LIMB_KEYS.view.frameUp);
  const g = viewFrameOf({ position: pose.position, yaw: l.yaw, pitch: l.pitch }, P, 54, 16 / 9);
  assert.ok(near(g.x, 0, 1e-12) && near(g.y, 0.5, 1e-12));
  // a point behind the camera has no place in the picture
  const behind = viewFrameOf({ position: [0, 0, 0], yaw: 0, pitch: 0 }, [0, 0, 1], 54, 1);
  assert.ok(behind.depth < 0 && Number.isNaN(behind.x));
});

test('a direction turns toward another by no more than it is allowed', () => {
  const a = [1, 0, 0], b = [0, 1, 0];
  const t = turnToward(a, b, 10 * DEG);
  assert.ok(near(Math.acos(t[0]), 10 * DEG, 1e-9) && near(Math.hypot(...t), 1, 1e-12));
  assert.deepEqual(turnToward(a, b, 2), b, 'within reach: the new direction itself');
  assert.deepEqual(turnToward(a, [-1, 0, 0], 0.1), [-1, 0, 0], 'opposite directions have no shorter way round');
});

test('the free hand: forward and sideways the whole way, across the body to 45 degrees past straight ahead, behind as a shoulder goes', () => {
  const R = 0.57; // the arm's length here (m)
  // straight forward, straight up, out to the side, hanging: all inside
  for (const [e, p] of [[90, 90], [180, 90], [90, 0], [150, 30], [10, -170], [34, -179]]) assert.equal(freeHandInRange(place(e, p, R), R).clamped, false, `elevation ${e}, plane ${p}`);
  // a straight arm across the body stops at acrossDeg
  const across = freeHandInRange(place(90, 170, R), R);
  assert.equal(across.clamped, true);
  assert.ok(near(freeHandAngles(across.handBodyM).planeDeg, FREE_HAND.acrossDeg, 1e-6) && near(freeHandAngles(across.handBodyM).elevationDeg, 90, 1e-6));
  assert.ok(near(Math.hypot(...across.handBodyM), R, 1e-9), 'the distance is kept');
  // with the elbow bent the hand comes on round to the other shoulder (the line of the shoulders), not behind the body
  assert.equal(freeHandInRange(place(90, 170, 0.25), R).clamped, false);
  assert.equal(freeHandInRange(place(90, -170, 0.25), R).clamped, true, 'never round behind the body, bent or straight');
  // behind the line of the shoulders: 40 degrees at shoulder height, straight back only with the arm low, none straight up
  assert.equal(freeHandInRange(place(90, -30, R), R).clamped, false);
  const back = freeHandInRange(place(90, -80, R), R);
  assert.ok(back.clamped && near(freeHandAngles(back.handBodyM).planeDeg, -40, 1e-6));
  assert.equal(freeHandInRange(place(60, -89, R), R).clamped, false, 'the arm swung straight back 60 degrees (extension)');
  assert.equal(freeHandInRange(place(170, -30, R), R).clamped, true);
  // the start place is inside and within the arm's length
  assert.equal(freeHandInRange([...FREE_HAND.startBodyM], R).clamped, false);
  assert.ok(Math.hypot(...FREE_HAND.startBodyM) < R);
});

test('the elbow\'s side: down and out for a reach forward, back for an arm that hangs or reaches behind, and rarely along the arm', () => {
  // (no fixed rule can give a side that is across the arm in EVERY direction; where the rule's side comes close to the
  // arm's own line the game keeps the side the elbow had, ns-app stepFrame, so the few such directions do no harm)
  let all = 0, close = 0;
  for (let e = 5; e <= 175; e += 5) for (let p = -110; p <= 135; p += 5) {
    const h = place(e, p, 0.5);
    if (freeHandInRange(h, 0.57).clamped) continue;
    const pole = freeHandPole(h), d = Math.abs((h[0] * pole[0] + h[1] * pole[1] + h[2] * pole[2]) / 0.5);
    assert.ok(near(Math.hypot(...pole), 1, 1e-9));
    all++; if (d > 0.96) close++;
  }
  assert.ok(close / all < 0.04, `within 16 degrees of the arm's own line in ${close} of ${all} directions`);
  const fwd = freeHandPole(place(90, 90, 0.5)), hang = freeHandPole(place(5, 90, 0.5));
  assert.ok(fwd[1] < -0.7, 'a reach forward: the elbow points down');
  assert.ok(hang[2] > 0.7, 'a hanging arm: the elbow points back');
});

test('the balls that keep a hand out of the trunk ride on segments the body has', () => {
  for (const b of TRUNK_KEEP_OUT) {
    assert.ok(body.BODY_SEGMENTS.includes(b.seg), `${b.seg} is a body segment`);
    assert.ok(b.r > 0.04 && b.r < 0.15 && b.at.length === 3);
  }
});

test('the right arm crosses the body: the sideways angle goes 45 degrees the other way in front of the chest, none at the side', () => {
  const clampOf = t => body.clampBodyJointTargets(t).applied;
  assert.equal(body.BODY_JOINT_LIMITS.r_shoulder_abd[0], -45);
  assert.ok(near(clampOf({ r_shoulder_flex: 90, r_shoulder_abd: -60 }).r_shoulder_abd, -45, 1e-9), 'at shoulder height: the whole 45');
  assert.equal(clampOf({ r_shoulder_flex: 0, r_shoulder_abd: -30 }).r_shoulder_abd + 0, 0, 'with the arm at the side the trunk is in the way');
  assert.equal(clampOf({ r_shoulder_flex: -40, r_shoulder_abd: -30 }).r_shoulder_abd + 0, 0, 'and behind the body');
  assert.ok(near(clampOf({ r_shoulder_flex: 30, r_shoulder_abd: -45 }).r_shoulder_abd, -22.5, 1e-6), 'half of it with the arm raised 30');
  // no jump anywhere along the raise
  let last = null;
  for (let f = -60; f <= 180; f += 2) { const a = clampOf({ r_shoulder_flex: f, r_shoulder_abd: -45 }).r_shoulder_abd; if (last !== null) assert.ok(Math.abs(a - last) < 4, `no jump at ${f}`); last = a; }
  // above shoulder height the room across goes again: none from 135 degrees of raise on (the arm goes up beside the head)
  assert.equal(clampOf({ r_shoulder_flex: 150, r_shoulder_abd: -45 }).r_shoulder_abd + 0, 0);
  assert.ok(clampOf({ r_shoulder_flex: 110, r_shoulder_abd: -45 }).r_shoulder_abd < -25);
  // the outward side is as it was
  assert.equal(clampOf({ r_shoulder_abd: 180 }).r_shoulder_abd, 180);
});

// ---- the limb solve on the game's own body ---------------------------------------------------------------------------
const rest = body.bodyPostureAngles(baked);
const opts = { anchor: 'pelvis', baked, holdChest: false };
const asDrawn = q => body.poseBodySegments(rig, body.softExtensionAngles(body.passiveKneeAngles(q)), opts);
const limits = body.bodyPostureLimits(baked);
const project = t => body.clampBodyJointTargets(t).applied;
/** Move a limb's end toward a far target in small steps, as a held key does; returns the pose and the last solve. */
function drive(limb, start, stepMm, steps) {
  let q = { ...start }, last = null;
  let end = G.limbPoint(rig, asDrawn(q), limb, 'end');
  for (let i = 0; i < steps; i++) {
    const want = end.map((v, k) => v + stepMm[k]);
    const r = G.solveLimb({ rig, segmentsFor: asDrawn, targets: q, limb, targetMm: want, limits, opts: G.LIMB_HOLD_TRACK, project });
    last = r;
    if (r.folded && r.errorMm > 22) break; // (the app moves nothing then)
    q = { ...q, ...r.joints };
    end = r.endMm;
  }
  return { q, end, last };
}
const start = project(rest);

test('the right hand is brought across the body by a sideways pull: the sideways angle goes below 0', () => {
  // source frame: +x the body's left, so a move toward the body's left is +x
  const e0 = G.limbPoint(rig, asDrawn(start), 'rightArm', 'end');
  const r = drive('rightArm', start, [12, 0, 0], 60);
  assert.ok(r.q.r_shoulder_abd < -15, `the arm is across the body (sideways angle ${r.q.r_shoulder_abd.toFixed(1)})`);
  assert.ok(r.end[0] - e0[0] > 250, `the hand went ${(r.end[0] - e0[0]).toFixed(0)} mm toward the other side`);
  assert.ok(r.end[0] > 0, 'and past the middle of the body');
  // and the angles the solve returns are angles the pose accepts (the combined-range rule was applied inside it)
  const drawn = project({ ...start, ...r.q });
  for (const id of G.LIMB_CHAIN.rightArm.joints) assert.ok(near(drawn[id], r.q[id], 1e-9), `${id} is drawn as solved`);
});

test('a heel pulled in stops at the fully bent knee: the folded leg does not swing on round the hip', () => {
  const c = G.LIMB_CHAIN.leftLeg;
  const root = G.limbPoint(rig, asDrawn(start), 'leftLeg', 'root'), e0 = G.limbPoint(rig, asDrawn(start), 'leftLeg', 'end');
  const toRoot = root.map((v, k) => v - e0[k]), n = Math.hypot(...toRoot), step = toRoot.map(v => v / n * 12);
  const r = drive('leftLeg', start, step, 120);
  assert.equal(r.last.folded, true, 'the solve says the target is inside the folded leg\'s reach');
  assert.ok(r.q[c.bend] <= -118, `the knee is bent to its end (${r.q[c.bend].toFixed(1)})`);
  const d = Math.hypot(...r.end.map((v, k) => v - root[k]));
  assert.ok(d > 300 && d < 480, `the ankle rests ${d.toFixed(0)} mm from the hip`);
  // the ankle stayed on its line toward the hip (it did not go round under it)
  const off = r.end.map((v, k) => v - e0[k]), along = (off[0] * toRoot[0] + off[1] * toRoot[1] + off[2] * toRoot[2]) / n;
  const side = Math.hypot(off[0] - toRoot[0] / n * along, off[1] - toRoot[1] / n * along, off[2] - toRoot[2] / n * along);
  assert.ok(side < 70, `the ankle left its line by ${side.toFixed(0)} mm at most`);
});

test('each leg and the right arm cover a great distance, and the solve works with the drawn (softly bent) limb', () => {
  for (const limb of ['leftLeg', 'rightLeg', 'rightArm']) {
    const root = G.limbPoint(rig, asDrawn(start), limb, 'root'), e0 = G.limbPoint(rig, asDrawn(start), limb, 'end');
    // swung about the root: across the limb's own line and across the body's left-right axis, whichever way is the
    // limb's flexion (the other way is the short one)
    const d = root.map((v, k) => e0[k] - v), across = [0, -d[2], d[1]], an = Math.hypot(...across), stepA = across.map(v => v / an * 14);
    const a1 = drive(limb, start, stepA, 80), a2 = drive(limb, start, stepA.map(v => -v), 80);
    const dist = r => Math.hypot(...r.end.map((v, k) => v - e0[k]));
    const up = dist(a1) >= dist(a2) ? a1 : a2;
    const travel = dist(up);
    assert.ok(travel > 500, `${limb}: the end travelled ${travel.toFixed(0)} mm`);
    // the end the solve reports is the end of the pose as drawn
    const drawnEnd = G.limbPoint(rig, asDrawn({ ...start, ...up.q }), limb, 'end');
    assert.ok(Math.hypot(...drawnEnd.map((v, k) => v - up.end[k])) < 1, `${limb}: the solved end is the drawn end`);
    assert.ok(Math.hypot(...up.end.map((v, k) => v - root[k])) > 100);
  }
});

// ---- a visible answer for every control (19 November 2026) -----------------------------------------------------------
test('the marks of the controls: the limb itself lights, by part, and every outline group has its limb', async () => {
  const S = await import(path.join(repo, 'scene/src/ns-scene-three.mjs'));
  const { OUTLINE_GROUPS } = await import(path.join(repo, 'scene/src/ns-outline.mjs'));
  const { CONTROL_GLOW } = await import(path.join(repo, 'scene/src/ns-app.mjs'));
  assert.equal(S.limbPartOfOutlineGroup(OUTLINE_GROUPS.trunk), null);
  assert.equal(S.limbPartOfOutlineGroup(OUTLINE_GROUPS.head), null);
  const want = { lUpper: ['leftArm', 'upper'], lFore: ['leftArm', 'lower'], lHand: ['leftArm', 'end'], rUpper: ['rightArm', 'upper'], rFore: ['rightArm', 'lower'], rHand: ['rightArm', 'end'],
    lThigh: ['leftLeg', 'upper'], lShank: ['leftLeg', 'lower'], lFoot: ['leftLeg', 'end'], rThigh: ['rightLeg', 'upper'], rShank: ['rightLeg', 'lower'], rFoot: ['rightLeg', 'end'] };
  for (const [k, [limb, part]] of Object.entries(want)) assert.deepEqual(S.limbPartOfOutlineGroup(OUTLINE_GROUPS[k]), { limb, part }, k);
  // every limb of the number keys is one the marks know
  for (const limb of LIMB_KEYS.order) assert.ok(Object.values(want).some(w => w[0] === limb));
  // the mark is a lift of the muscle's own light, not a flood, and the flat band over the limb is no longer drawn
  assert.ok(S.PART_GLOW.glow > 0.04 && S.PART_GLOW.glow <= 0.25 && S.PART_GLOW.steps >= 8);
  assert.equal(S.LIMB_FLASH.bandAlpha, 0);
  for (const k of ['keys', 'hand', 'drag', 'steady']) assert.ok(CONTROL_GLOW[k] > 0.3 && CONTROL_GLOW[k] <= 1, k);
});
