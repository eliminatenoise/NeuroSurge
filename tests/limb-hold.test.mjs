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
const { LIMB_KEYS, LIMBS_PASS_ITEMS, TRUNK_KEEP_OUT, viewFrameOf, viewFramePoint, lookFramingPoint, turnToward, limbKeyMove, limbKeyFollow, keyMoveCut } = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const { FREE_HAND, freeHandAngles, freeHandInRange, freeHandPole } = await import(path.join(repo, 'scene/src/ns-arm.mjs'));
const G = await import(path.join(repo, 'scene/src/ns-grasp.mjs'));
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, rig, baked } = await loadBody(repo);
const DEG = Math.PI / 180;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
/** A place beside the shoulder from its direction angles (ns-arm's convention) and distance. */
const place = (elevDeg, planeDeg, d) => [-Math.cos(planeDeg * DEG) * Math.sin(elevDeg * DEG) * d, -Math.cos(elevDeg * DEG) * d, -Math.sin(planeDeg * DEG) * Math.sin(elevDeg * DEG) * d];

// (19 November 2026, later still: the set height, three quarters up the picture, is gone at the owner's word:
// "Disregard that rule". The look still carries the limb and the keys still move it.)
test('the view holds the chosen limb: the look carries it, the keys move it far, and it has no set height in the picture', () => {
  const V = LIMB_KEYS.view;
  assert.equal(V.hold, true);
  assert.equal(V.lookCarries, true, 'the pointer moves the chosen limb with the view (the owner: "controlling with all the control keys and the camera view")');
  assert.equal(V.frameUp, null, 'the owner, later: "Perhaps the problem ... is the 3/4 height rule. Disregard that rule"');
  assert.ok(V.bandUp > 0.3 && V.bandUp < 0.9, 'the end may move up and down in the picture before the view turns');
  assert.ok(V.band > 0.3 && V.band < 0.9, 'the end may move left and right in the picture before the view turns');
  assert.ok(V.speedMps >= 0.5, 'far more forward and far more back: at least half a metre a second');
  assert.ok(V.leadM > 0 && V.leadM <= 0.05 && V.levelM >= V.leadM);
  // where the look carries the place beyond the joints the limb waits (it does not take the nearest pose it can reach)
  assert.ok(V.waitMm >= 20 && V.waitMm <= 80 && V.waitShare > 0 && V.waitShare < 1);
  assert.equal(LIMBS_PASS_ITEMS, true, 'the brain and the mirror body do not stop a limb');
});

// 19 November 2026 (the owner: "when we're doing WS ... we want the limbs to move in a straight line from between
// proximal and distal joints ... Whilst A and D ... are really moving between medial and lateral, so abduction,
// adduction").
test('W and S move a limb\'s end along the line from its root; A and D swing it round the root with its reach unchanged', () => {
  assert.equal(LIMB_KEYS.view.keys, 'limb');
  const root = [0.2, 1.2, 0.1], right = [1, 0, 0], place = [0.3, 0.9, -0.4];
  const v = place.map((x, i) => x - root[i]), r = Math.hypot(...v), u = v.map(x => x / r);
  const dirOf = p => { const w = p.map((x, i) => x - root[i]), n = Math.hypot(...w); return [w.map(x => x / n), n]; };
  // W: further out on the same line; S: back in on the same line
  for (const az of [1, -1]) {
    const [d, n] = dirOf(limbKeyMove(place, root, right, 0, az, 0.05));
    assert.ok(near(n, r + az * 0.05, 1e-12) && d.every((x, i) => near(x, u[i], 1e-12)), 'the same direction, 5 cm further or nearer');
  }
  // S never brings the end through the root
  const [dIn, nIn] = dirOf(limbKeyMove(place, root, right, 0, -1, 5));
  assert.ok(nIn > 0 && nIn <= 0.02 + 1e-12 && dIn.every((x, i) => near(x, u[i], 1e-9)));
  // D: toward the body's right, A: toward its left, by 5 cm of arc, at the same distance from the root
  for (const ax of [1, -1]) {
    const q = limbKeyMove(place, root, right, ax, 0, 0.05), [d, n] = dirOf(q);
    assert.ok(near(n, r, 1e-12), 'the reach is unchanged');
    assert.ok(near(Math.acos(d[0] * u[0] + d[1] * u[1] + d[2] * u[2]), 0.05 / r, 1e-9), 'an arc of 5 cm');
    assert.ok(Math.sign(q[0] - place[0]) === ax, 'D to the right, A to the left');
  }
  // the swing ends where the limb points straight along the body's right (it does not go on over the top)
  let p = place.slice();
  for (let i = 0; i < 400; i++) p = limbKeyMove(p, root, right, 1, 0, 0.05);
  const [dEnd, nEnd] = dirOf(p);
  assert.ok(near(dEnd[0], 1, 1e-6) && near(nEnd, r, 1e-9));
  assert.deepEqual(limbKeyMove(p, root, right, 1, 0, 0.05).map(x => Math.round(x * 1e9)), p.map(x => Math.round(x * 1e9)), 'and stays there');
  // (20 Nov review) A then swings it back from there, out through the front of the body (the body faces -z here)
  const exact = [root[0] + r, root[1], root[2]], back = limbKeyMove(exact, root, right, -1, 0, 0.05), [dBack, nBack] = dirOf(back);
  assert.ok(near(nBack, r, 1e-12) && dBack[0] < 1 - 1e-6, 'A moves a limb pointing straight to the right');
  assert.ok(back[2] < exact[2], 'through the front');
  let q2 = back; for (let i = 0; i < 5; i++) q2 = limbKeyMove(q2, root, right, -1, 0, 0.05);
  assert.ok(dirOf(q2)[0][0] < dBack[0], 'and goes on toward the left');
  // both keys at once: the swing and the reach together
  const [dB, nB] = dirOf(limbKeyMove(place, root, right, 1, 1, 0.05));
  assert.ok(near(nB, r + 0.05, 1e-12) && dB[0] > u[0]);
  // no step, or a place on the root itself: nothing moves
  assert.deepEqual(limbKeyMove(place, root, right, 1, 1, 0), place);
  assert.deepEqual(limbKeyMove(root, root, right, 1, 1, 0.05), root);
});

test('a place in the picture and a point in the room are each other\'s inverse', () => {
  const pose = { position: [0.1, 1, 0.2], yaw: 0.4, pitch: -0.3 }, P = [-0.5, 0.4, -1.2];
  const f = viewFrameOf(pose, P, 54, 16 / 9), back = viewFramePoint(pose, f, 54, 16 / 9);
  for (let i = 0; i < 3; i++) assert.ok(near(back[i], P[i], 1e-12));
  assert.ok(f.depth > 0 && f.dist >= f.depth);
  // the look that frames a point at three quarters of the height puts it at NDC y 0.5 and in the middle
  const l = lookFramingPoint(pose.position, P, 54, 0.75);
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
  // the arm's length here (m): 0.57 for the source arm, times the gain the longer arm gives its start place (20 November
  // 2026, ns-body-shape; FREE_HAND.startBodyM is the source's [-0.245, -0.341, -0.373] times that gain)
  const R = 0.57 * Math.hypot(...FREE_HAND.startBodyM) / Math.hypot(-0.245, -0.341, -0.373);
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

// 20 November 2026, afternoon (a hunt: after A had swung the right arm across the chest, one 0.12 s tap of S threw the
// hand 21 cm, mostly sideways). A frame of the keys takes the solve's answer only as far as the keys' own way goes
// (keyMost) and not when it leaves that way by more than keyOffDeg (ns-app limbKeyFollow, used in stepLimbHold).
// 20 November 2026, evening (LIMBFREE; the owner, Message 207: "there are ranges of motions where the limbs get stuck.
// The limb should never get stuck"): restated. A move more than keyOffDeg off the keys' way used to wait in every case;
// where the joints cannot keep to the line at all (an arm straight up beside the head, a straight leg lifted high and
// out) that left a limb with no key that moved it. Now a move up to keyFarDeg off is taken too, slowly (its part
// across the way at most keyLatFar x the way); only one that goes nowhere the keys' way, or backwards, waits.
test('a frame of the keys: never further than the keys go, never thrown sideways, and only a move that goes nowhere the keys\' way waits', () => {
  const V = LIMB_KEYS.view, from = [0.1, 0.2, 0.3], way = [0, 0, -0.01];
  assert.ok(V.keyMost >= 1 && V.keyMost <= 1.5 && V.keyOffDeg > 45 && V.keyOffDeg < 75);
  assert.ok(V.keyFarDeg > V.keyOffDeg && V.keyFarDeg < 90, 'a move going nowhere the keys\' way, or back, still waits');
  assert.ok(V.keyLatFar > 0 && V.keyLatFar <= V.keyMost * Math.sin(V.keyOffDeg * DEG), 'far off the line the end moves sideways no faster than it may inside keyOffDeg');
  assert.deepEqual(limbKeyFollow(from, [0.1, 0.2, 0.291], way), { take: true, share: 1 }, 'the keys\' own way, a little short: taken');
  const fast = limbKeyFollow(from, [0.1, 0.2, 0.26], way);
  assert.ok(fast.take && near(fast.share, V.keyMost * 0.01 / 0.04, 1e-12), 'four times as far: cut back to keyMost');
  const off = Math.tan((V.keyOffDeg - 5) * DEG) * 0.01;
  assert.equal(limbKeyFollow(from, [0.1 + off, 0.2, 0.29], way).take, true, 'a little inside keyOffDeg: taken');
  // between keyOffDeg and keyFarDeg: taken, its sideways part cut to keyLatFar x the way
  for (const deg of [V.keyOffDeg + 5, (V.keyOffDeg + V.keyFarDeg) / 2, V.keyFarDeg - 1]) {
    const m = [Math.sin(deg * DEG) * 0.012, 0, -Math.cos(deg * DEG) * 0.012], f = limbKeyFollow(from, from.map((v, k) => v + m[k]), way);
    assert.ok(f.take, `${deg} degrees off: taken`);
    const lat = Math.abs(m[0]) * f.share, total = 0.012 * f.share;
    assert.ok(lat <= V.keyLatFar * 0.01 + 1e-12 && total <= V.keyMost * 0.01 + 1e-12, `${deg} degrees off: sideways ${(lat * 1000).toFixed(2)} mm, all ${(total * 1000).toFixed(2)} mm for a 10 mm way`);
    assert.ok(-m[2] * f.share > 0, 'and it still goes some way the keys\' way');
  }
  assert.equal(limbKeyFollow(from, [0.1 + Math.tan((V.keyFarDeg + 2) * DEG) * 0.01, 0.2, 0.29], way).take, false, 'past keyFarDeg: the limb waits');
  assert.equal(limbKeyFollow(from, [0.15, 0.2, 0.3], way).take, false, 'straight sideways: waits');
  assert.equal(limbKeyFollow(from, [0.1, 0.2, 0.31], way).take, false, 'backwards: waits');
  assert.deepEqual(limbKeyFollow(from, from, way), { take: true, share: 1 }, 'no move');
  assert.deepEqual(limbKeyFollow(from, [0.1004, 0.2, 0.3], way), { take: true, share: 1 }, 'a move under a twentieth of the way, whatever its direction (joints passing through angles the drawn pose does not show)');
  assert.deepEqual(limbKeyFollow(from, [0.2, 0.2, 0.3], [0, 0, 0]), { take: true, share: 1 }, 'no way (no time passed)');
  // keyMoveCut is the same cut, used again on the end's move as drawn
  assert.equal(keyMoveCut([0.05, 0, 0], way), 0);
  assert.ok(near(keyMoveCut([0, 0, -0.04], way), V.keyMost * 0.01 / 0.04, 1e-12));
});

// The same rule on the game's own body, as stepLimbHold runs it: S held, the place kept on the keys' line within leadM
// of the end, one solve a frame, the answer taken as limbKeyFollow says (and cut again with keyMoveCut on the drawn end).
// A frame that waits puts the place back on the end (20 November 2026, evening: as stepLimbHold now does).
function driveKeys(limb, q0, ax, az, frames) {
  const V = LIMB_KEYS.view, sp = V.speedMps * 1000 / 60, lead = V.leadM * 1000, right = [-1, 0, 0], c = G.LIMB_CHAIN[limb], memo = {};
  const sub = (a, b) => a.map((v, k) => v - b[k]), nrm = a => Math.hypot(...a), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let q = { ...q0 }, end = G.limbPoint(rig, asDrawn(q), limb, 'end'), u = null, len = 0, lastErr = 0, fastest = 0, waited = 0, widest = 0;
  const e0 = end.slice();
  for (let f = 0; f < frames; f++) {
    const root = G.limbPoint(rig, asDrawn(q), limb, 'root');
    const T = limbKeyMove(u && ax === 0 ? root.map((v, k) => v + u[k] * len) : end, root, right, ax, az, sp);
    const gap = nrm(sub(T, end)), way = sub(limbKeyMove(end, root, right, ax, az, sp), end);
    let r = G.solveLimb({ rig, segmentsFor: asDrawn, targets: q, limb, targetMm: T, limits, opts: lastErr < 12 && gap < 60 ? G.LIMB_HOLD_FOLLOW : G.LIMB_HOLD_TRACK, project, memo });
    const fol = limbKeyFollow(end, r.endMm, way);
    let wait = (r.folded && r.errorMm > lead + 2) || !fol.take;
    if (!wait && fol.share < 1) {
      // (as stepLimbHold: the share cut once more where the end's move as drawn is still over what keyMoveCut allows)
      let share = fol.share, joints = {}, endMm = r.endMm;
      for (let pass = 0; pass < 3; pass++) {
        const qs = { ...q }; for (const id of c.joints) qs[id] = q[id] + (r.joints[id] - q[id]) * share;
        const p = project(qs); joints = {}; for (const id of c.joints) joints[id] = p[id];
        endMm = G.limbPoint(rig, asDrawn({ ...q, ...joints }), limb, 'end');
        const k = keyMoveCut(sub(endMm, end), way);
        if (!(k > 0)) { wait = true; break; }
        if (!(k < 0.999)) break;
        share *= k;
      }
      r = { ...r, joints, endMm };
    }
    if (wait) {
      waited++;
      const e = sub(end, root), U = ax === 0 && u ? u : e.map(x => x / nrm(e));
      len = Math.max(dot(e, U) - lead, Math.min(dot(e, U) + lead, nrm(e))); u = U; lastErr = 0;
      continue;
    }
    const mv = sub(r.endMm, end), m = nrm(mv), wl = nrm(way), pr = wl > 0 ? dot(mv, way) / wl : 0;
    fastest = Math.max(fastest, m / sp);
    if (wl > 0 && m > 0.05 * wl && pr < m * Math.cos(V.keyOffDeg * DEG)) widest = Math.max(widest, Math.sqrt(Math.max(0, m * m - pr * pr)) / sp);
    q = { ...q, ...r.joints }; end = r.endMm; lastErr = nrm(sub(T, end));
    const e = sub(end, root), U = ax === 0 && u ? u : (() => { const v = sub(T, root), n = nrm(v); return v.map(x => x / n); })();
    len = Math.max(dot(e, U) - lead, Math.min(dot(e, U) + lead, nrm(sub(T, root)))); u = U;
  }
  return { q, end, travel: nrm(sub(end, e0)), fastest, waited, widest };
}

// 20 November 2026, evening (LIMBFREE; the owner: "The limb should never get stuck"): restated. Across the chest the
// joints cannot bring the hand in along its line (the upper arm's own turn is not theirs to change), and S used to
// wait there (it moved the hand under 3 mm). Now S curls the hand in as the joints allow: slowly, never faster than the
// keys, its sideways part never more than keyLatFar x the keys' way a frame.
test('S on the right arm across the chest curls the hand in slowly instead of throwing it sideways (or waiting); from the start it still folds the arm', () => {
  // the hunt's pose: raised 43, across 31, the elbow nearly straight
  const crossed = project({ ...start, r_shoulder_flex: 43, r_shoulder_abd: -31, r_elbow_flex: 12 });
  const e0 = G.limbPoint(rig, asDrawn(crossed), 'rightArm', 'end');
  // (what the solve itself answers for the first frame of S: the hand thrown sideways, far further than the keys go)
  const root = G.limbPoint(rig, asDrawn(crossed), 'rightArm', 'root'), toRoot = root.map((v, k) => v - e0[k]), n = Math.hypot(...toRoot);
  const raw = G.solveLimb({ rig, segmentsFor: asDrawn, targets: crossed, limb: 'rightArm', targetMm: e0.map((v, k) => v + toRoot[k] / n * 20), limits, opts: G.LIMB_HOLD_TRACK, project });
  const rawMove = Math.hypot(...raw.endMm.map((v, k) => v - e0[k]));
  assert.ok(rawMove > 2.5 * 10, `the solve alone moves the hand ${rawMove.toFixed(0)} mm for a 10 mm frame of the keys`);
  const s = driveKeys('rightArm', crossed, 0, -1, 30);
  const rIn = Math.hypot(...s.end.map((v, k) => v - root[k]));
  assert.ok(rIn < n - 30, `across the chest S brings the hand ${(n - rIn).toFixed(0)} mm nearer the shoulder in half a second`);
  assert.ok(s.fastest <= LIMB_KEYS.view.keyMost + 0.02, `never faster than the keys: ${s.fastest.toFixed(2)} x`);
  assert.ok(s.widest <= LIMB_KEYS.view.keyLatFar + 0.02, `sideways at most ${s.widest.toFixed(2)} x the keys' way a frame`);
  // from the start posture S still brings the hand all the way in, never faster than keyMost x the keys
  const f = driveKeys('rightArm', start, 0, -1, 50);
  assert.ok(f.travel > 380, `from the start S brings the hand ${f.travel.toFixed(0)} mm in`);
  assert.ok(f.fastest <= LIMB_KEYS.view.keyMost + 0.02, `at most ${f.fastest.toFixed(2)} x the keys' way a frame`);
  assert.ok(f.q.r_elbow_flex > 120, `the elbow bent to ${f.q.r_elbow_flex.toFixed(0)}`);
  // and D still swings the crossed arm back out the whole way
  const d = driveKeys('rightArm', crossed, 1, 0, 50);
  assert.ok(d.travel > 400, `D swings it ${d.travel.toFixed(0)} mm`);
});

// ---- 20 November 2026, evening (LIMBFREE; the owner, Message 207: "there are ranges of motions where the limbs get
// stuck. The limb should never get stuck") -------------------------------------------------------------------------------
const KEYS4 = [['W', 0, 1], ['S', 0, -1], ['A', -1, 0], ['D', 1, 0]];
const moves = (limb, q, frames = 6) => Object.fromEntries(KEYS4.map(([k, ax, az]) => [k, driveKeys(limb, q, ax, az, frames).travel]));
test('no pose of a leg or the right arm is a trap: from every pose on a grid through their ranges at least two keys move the end', () => {
  // (the grid inside the ranges the keys' solve works in, the combined-range rule applied; a corner of the range, a
  // joint at its end on two axes, leaves two keys; one key or none was a trap: 3 such poses of the right arm and 5 of
  // each leg on a finer grid before this change, among them the arm straight up beside the head and a straight leg
  // lifted high and out to the side)
  const grids = {
    rightArm: [['r_shoulder_flex', [-60, 0, 60, 120, 150, 180]], ['r_shoulder_abd', [-45, 0, 45, 135, 180]], ['r_elbow_flex', [0, 60, 145]]],
    rightLeg: [['hip_flex_R', [-30, 30, 90, 110]], ['hip_abd_R', [-30, 0, 45]], ['knee_ext_R', [-120, -60, 0]]],
    leftLeg: [['hip_flex_L', [-30, 30, 90, 110]], ['hip_abd_L', [-30, 0, 45]], ['knee_ext_L', [-120, -60, 0]]]
  };
  const inLim = (id, v) => Math.max(limits[id][0], Math.min(limits[id][1], v));
  for (const [limb, [[a, av], [b, bv], [c, cv]]] of Object.entries(grids)) {
    const seen = new Set();
    for (const x of av) for (const y of bv) for (const z of cv) {
      const q = project({ ...start, [a]: inLim(a, x), [b]: inLim(b, y), [c]: inLim(c, z) }), key = [a, b, c].map(id => q[id].toFixed(1)).join(',');
      if (seen.has(key)) continue; seen.add(key);
      const m = moves(limb, q), works = Object.values(m).filter(t => t >= 3).length;
      assert.ok(works >= 2, `${limb} at ${key}: only ${works} key(s) move it ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)])))}`);
    }
  }
});

test('the traps found in play: the arm straight up beside the head, a leg lifted to the top of its sideways range', () => {
  // the right arm raised straight up by the look (forward 150, no sideways lift: across the head is not allowed):
  // S used to wait (its line cannot be kept) and A could not move it; now S draws the hand in
  const up = project({ ...start, r_shoulder_flex: 150, r_shoulder_abd: 0, r_elbow_flex: 5 });
  const mu = moves('rightArm', up, 12);
  assert.ok(mu.S > 10 && mu.D > 50, `raised arm: S ${mu.S.toFixed(0)} mm, D ${mu.D.toFixed(0)} mm`);
  // a straight right leg lifted 100 and out to its sideways end: A brings it back in (the thighs' parting used to stop
  // the drawn leg a few degrees before the end, and the solve's probe of that joint came out zero)
  const hi = project({ ...start, hip_flex_R: 100, hip_abd_R: 45, knee_ext_R: 0 });
  const mh = moves('rightLeg', hi, 12);
  assert.ok(mh.A > 40 && mh.S > 10, `lifted leg: A ${mh.A.toFixed(0)} mm, S ${mh.S.toFixed(0)} mm`);
  // a leg stretched back and out to the combined-range end (sideways 30 at -30): A brings it in
  const back = project({ ...start, hip_flex_R: -30, hip_abd_R: 45, knee_ext_R: 0 });
  assert.ok(near(back.hip_abd_R, 30, 1e-9));
  assert.ok(moves('rightLeg', back, 12).A > 40, 'stretched back: A moves it');
});

test('the drawn sideways lift of a raised thigh rises with the angle all the way to its end (no stretch where nothing moves)', () => {
  for (const turn of [25, -65]) for (const flex of [70, 100, 120]) {
    let prev = -Infinity;
    for (let abd = 30; abd <= 45 + 1e-9; abd += 0.5) {
      const A = project({ ...start, leg_turn_R: turn, hip_flex_R: flex, hip_abd_R: abd }), drawn = abd + body.legTurnState(rig, A).R.abdExtra;
      assert.ok(drawn <= 45 + 1e-9, 'never past the hip\'s end');
      assert.ok(drawn > prev + 0.05, `turn ${turn}, thigh ${flex}: the drawn lift at ${abd} (${drawn.toFixed(2)}) is above the one before (${prev.toFixed(2)})`);
      prev = drawn;
    }
  }
});

test('the limb solve feels a joint that is at the end the drawn pose takes: its probe goes the other way', () => {
  // the right hip lifted sideways to its combined-range end with the thigh back: a probe further out moves nothing
  const q = project({ ...start, hip_flex_R: -30, hip_abd_R: 30 });
  const e = G.limbPoint(rig, asDrawn(q), 'rightLeg', 'end'), e1 = G.limbPoint(rig, asDrawn({ ...q, hip_abd_R: 30.5 }), 'rightLeg', 'end');
  assert.ok(Math.hypot(...e1.map((v, k) => v - e[k])) < 1e-6, 'the pose does not take more sideways lift there');
  // a target toward the middle (+x is the body's left), with the thigh's forward angle held where it is so that only
  // the sideways joint can answer: the solve brings the leg in (its probe used to go outward, find nothing, and leave
  // that joint out of every step)
  const pinned = { ...limits, hip_flex_R: [-30, -30] };
  const r = G.solveLimb({ rig, segmentsFor: asDrawn, targets: q, limb: 'rightLeg', targetMm: [e[0] + 15, e[1], e[2]], limits: pinned, opts: G.LIMB_HOLD_TRACK, project });
  assert.ok(r.joints.hip_abd_R < 29.6, `the sideways lift came down to ${r.joints.hip_abd_R.toFixed(1)}`);
  // a thigh lifted to its end (the straight knee holds it at 101 degrees; past that the drawn knee would bend): the
  // probe past the end showed the drawn knee's bend, a move the step can never make, and the solve pushed the thigh on
  // up instead of down. Now it brings the foot back to where it started (the rejoin's reach solve, LIMB_HOLD_REACH).
  const lifted = project({ ...start, hip_flex_L: 110, hip_abd_L: -5 }), home = G.limbPoint(rig, asDrawn(start), 'leftLeg', 'end');
  assert.ok(lifted.hip_flex_L > 100 && lifted.hip_flex_L < 102, `the thigh stops at ${lifted.hip_flex_L.toFixed(1)}`);
  const back = G.solveLimb({ rig, segmentsFor: asDrawn, targets: lifted, limb: 'leftLeg', targetMm: home, limits, opts: G.LIMB_HOLD_REACH, project });
  assert.ok(back.errorMm < 20 && back.joints.hip_flex_L < 10, `from the lifted end the foot comes back within ${back.errorMm.toFixed(0)} mm (thigh ${back.joints.hip_flex_L.toFixed(0)})`);
  const moved = Math.hypot(...r.endMm.map((v, k) => v - e[k]));
  assert.ok(moved > 3 && r.endMm[0] > e[0], `the ankle moved ${moved.toFixed(1)} mm toward the middle`);
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

// 20 November 2026, evening (the owner: "now right-click shouldn't lead to any grasping function. Let's just make
// spacebar grasping for all of the limbs at once"): the Space grip closes and lights all four limbs; nothing else does.
test('the Space grip is all four limbs at once, each hand and foot lit with its forearm or shank', async () => {
  const { CONTROL_GLOW, SPACE_GRIP, spaceGripGlows } = await import(path.join(repo, 'scene/src/ns-app.mjs'));
  assert.deepEqual([...SPACE_GRIP.limbs].sort(), [...LIMB_KEYS.order].sort(), 'every limb the number keys know grips');
  const g = spaceGripGlows(1);
  for (const limb of LIMB_KEYS.order) {
    assert.deepEqual(g.filter(x => x.limb === limb).map(x => [x.part, x.level]), [['end', CONTROL_GLOW.hand], ['lower', CONTROL_GLOW.hand * CONTROL_GLOW.lowerShare]], limb);
  }
  assert.equal(g.length, 8);
  // no grip, no glow; a share lights in proportion and never past full
  assert.deepEqual(spaceGripGlows(0), []);
  assert.deepEqual(spaceGripGlows(NaN), []);
  assert.ok(spaceGripGlows(0.5).every(x => Math.abs(x.level - (x.part === 'end' ? 0.5 : 0.5 * CONTROL_GLOW.lowerShare) * CONTROL_GLOW.hand) < 1e-12));
  assert.ok(spaceGripGlows(3).every(x => x.level <= CONTROL_GLOW.hand));
});
