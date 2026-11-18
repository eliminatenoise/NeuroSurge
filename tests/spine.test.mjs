/** The curved back of 18 November 2026 (user: "the shoulders rolled forward and the back convexly curved"; "see all of
 * the front of the torso at once without the chest pumping out but depressed down/inwards"; "Almost full
 * kyphosis/flexion of the spine"): the trunk bends at every vertebra, the rib cage is a fitted linkage, the shoulder
 * girdles roll forward with a bent back. These cases load the game's own body from disk (tools/load-body.mjs) and
 * check the rig's arithmetic: that the shares add up, that every frame stays a rotation, that the bones the linkage
 * joins stay together in the start posture, and that the look's bend has the room the reclined posture leaves it.
 * They establish what the rig computes on this one reference body, never how a real spine or rib cage moves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, rig, baked } = await loadBody(repo);
const rest = body.bodyPostureAngles(baked);
const DEG = Math.PI / 180;
const at = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
/** how far a 4x4's linear part is from a proper rotation */
function rotationError(m) {
  const c = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]], d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const det = d(c[0], [c[1][1] * c[2][2] - c[1][2] * c[2][1], c[1][2] * c[2][0] - c[1][0] * c[2][2], c[1][0] * c[2][1] - c[1][1] * c[2][0]]);
  return Math.max(...c.map(v => Math.abs(Math.hypot(...v) - 1)), Math.abs(d(c[0], c[1])), Math.abs(d(c[1], c[2])), Math.abs(d(c[0], c[2])), Math.abs(det - 1));
}
/** rotation angle (degrees) between two frames */
function angleBetween(a, b) {
  const tr = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6] + a[8] * b[8] + a[9] * b[9] + a[10] * b[10];
  return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) / DEG;
}

test('the trunk has one stage per vertebra and each joint table adds up to the whole movement', () => {
  assert.equal(body.SPINE_STAGES.length, 17);
  assert.equal(body.SPINE_STAGES[0][0], 'lumbar');
  assert.equal(body.SPINE_STAGES[16][0], 'thorax');
  for (const id of ['trunk_flex', 'trunk_side', 'trunk_rot']) {
    const sh = body.BODY_JOINT_SHARES[id];
    assert.deepEqual(Object.keys(sh), body.SPINE_STAGES.map(r => r[1]), id);
    assert.ok(Math.abs(Object.values(sh).reduce((a, b) => a + b, 0) - 1) < 1e-12, `${id} shares sum to 1`);
    assert.ok(Object.values(sh).every(v => v > 0 && v < 0.2), `${id}: no joint takes more than a fifth`);
  }
  for (const [seg, jid] of body.SPINE_STAGES) assert.ok(rig.pivots[jid] && rig.pivots[jid].source === 'geometry', `${jid} is found from the bones (${seg})`);
});

test('every vertebra, rib 1 to 10, costal cartilage and the breastbone is a segment with its own bone', () => {
  for (const s of [...body.SPINE_STAGES.map(r => r[0]), ...body.LINKED_SEGMENTS.filter(x => !/_gbase$/.test(x))]) assert.ok(rig.segments[s].boneIds.length >= 1, s);
  assert.equal(rig.segments.sternum.boneIds.length, 3);
  for (const s of body.LINKED_SEGMENTS) assert.ok(rig._links[s], `${s} is placed by the linkage`);
  assert.equal(rig.warnings.filter(w => /no known segment|not posed/.test(w)).length, 0);
});

test('in the source pose nothing has moved, and in the start posture the back is one even curve', () => {
  const zero = body.poseBodySegments(rig, {}, {});
  for (const s of body.BODY_SEGMENTS) for (let k = 0; k < 16; k++) assert.ok(Math.abs(zero[s][k] - (k % 5 === 0 ? 1 : 0)) < 1e-12, `${s} is the identity`);
  const S = body.poseBodySegments(rig, rest, {});
  for (const s of body.BODY_SEGMENTS) assert.ok(rotationError(S[s]) < 1e-9, `${s} is a rotation`);
  // (18 November 2026, later: the start posture's bend is the pelvis roll, in the low back only, less a little extension of the whole back)
  assert.ok(Math.abs(angleBetween(S.pelvis, S.thorax) - (rest.trunk_flex + (rest.pelvic_tilt || 0))) < 1e-6, 'the stages together bend the trunk by trunk_flex plus the pelvis roll');
  for (const seg of ['t11', 't8', 't5', 't2']) assert.ok(angleBetween(S.t12, S[seg]) < 6, `the rib-bearing spine stays straight (${seg})`);
  let prev = 'pelvis', largest = 0;
  for (const [seg] of body.SPINE_STAGES) { largest = Math.max(largest, angleBetween(S[prev], S[seg])); prev = seg; }
  // (18 November, third pass: the bend is weighted to the low back; the largest share is the lumbosacral joint's, 12.5 of 80 degrees)
  // (later: with the pelvis rolled under, the lumbosacral joint takes the most, 27 % of the roll less its share of the extension)
  assert.ok(largest < 16, `no single joint is a hinge (largest ${largest.toFixed(1)} degrees)`);
});

test('in the start posture the ribs stay on their vertebrae and cartilages, and the collar bone on the breastbone', () => {
  const S = body.poseBodySegments(rig, rest, {});
  const residual = (seg, carrierFilter) => {
    const L = rig._links[seg]; let worst = 0;
    for (let k = 0; k < L.w.length; k++) {
      const carrier = body.BODY_SEGMENTS[L.c[k]];
      if (!carrierFilter(carrier)) continue;
      const p = [L.p[3 * k], L.p[3 * k + 1], L.p[3 * k + 2]], a = at(S[carrier], p), b = at(S[seg], p);
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
    return worst;
  };
  for (const side of ['r', 'l']) {
    for (let k = 1; k <= 10; k++) assert.ok(residual(`${side}_rib${k}`, c => /^(t\d+|thorax)$/.test(c)) < 8, `${side} rib ${k} head on its vertebra`);
    // (18 November, later: the start posture bends the trunk 70 degrees, not 60; the shared seventh cartilage is the loosest link)
    for (let k = 1; k <= 7; k++) assert.ok(residual(`${side}_cc${k}`, () => true) < (k === 7 ? 12 : 6), `${side} cartilage ${k} on its rib and the breastbone`);
    // (18 November, later: the collar bone is a strut of its own between the breastbone and the shoulder blade)
    assert.ok(residual(`${side}_clav`, c => c === 'sternum') < 8, `${side} collar bone's inner end on the breastbone`);
    assert.ok(residual(`${side}_clav`, c => c !== 'sternum') < 8, `${side} collar bone's outer end on the shoulder blade`);
    // the girdle (the shoulder blade) goes with the ribs under it
    assert.ok(residual(`${side}_gbase`, c => c !== 'sternum') < 8, `${side} shoulder blade on the ribs`);
  }
});

test('the shoulder girdles roll forward with a bent back, by the same amount on both sides', () => {
  assert.equal(body.shoulderRollDeg(0), 0);
  const rollNow = body.shoulderRollDeg(rest.trunk_flex, body.SHOULDER_ROLL, rest.pelvic_tilt || 0); // (later: the pelvis roll counts too)
  assert.ok(rollNow > 8 && rollNow <= body.SHOULDER_ROLL.maxDeg);
  assert.equal(body.shoulderRollDeg(500), body.SHOULDER_ROLL.maxDeg);
  assert.equal(body.shoulderRollDeg(-500), body.SHOULDER_ROLL.minDeg);
  const sc = rig.pivots.r_sternoclavicular, up = body.poseBodySegments(rig, {}, {}), bent = body.poseBodySegments(rig, { trunk_flex: 60 }, {});
  assert.ok(sc.rollAxis && Math.abs(Math.hypot(...sc.rollAxis) - 1) < 2e-3);
  // the shoulder (the collar bone's outer end) comes forward (-y) relative to the girdle's base, mirrored left and right
  const a = sc.acromialEnd, m = [-a[0], a[1], a[2]];
  const inBase = (S, seg, base, p) => { const q = at(S[seg], p), B = S[base]; const d = [q[0] - B[12], q[1] - B[13], q[2] - B[14]]; return [d[0] * B[0] + d[1] * B[1] + d[2] * B[2], d[0] * B[4] + d[1] * B[5] + d[2] * B[6], d[0] * B[8] + d[1] * B[9] + d[2] * B[10]]; };
  const r0 = inBase(up, 'r_girdle', 'r_gbase', a), r1 = inBase(bent, 'r_girdle', 'r_gbase', a), l0 = inBase(up, 'l_girdle', 'l_gbase', m), l1 = inBase(bent, 'l_girdle', 'l_gbase', m);
  assert.ok(r1[1] - r0[1] < -10, `the right shoulder comes forward (${(r1[1] - r0[1]).toFixed(1)} mm)`);
  assert.ok(Math.abs((r1[1] - r0[1]) - (l1[1] - l0[1])) < 1e-6 && Math.abs((r1[0] - r0[0]) + (l1[0] - l0[0])) < 1e-6, 'the left shoulder is its mirror image');
});

test('the frames the eye camera and the left game arm ride on are rotations (the game refused a near-rotation)', () => {
  for (const pitchDeg of [0, -20, -40]) {
    const fr = body.bodyHeadFrame(rig, { ...rest, neck_flex: Math.min(50, rest.neck_flex - pitchDeg) }, { baked });
    for (const k of ['pelvis', 'lumbar', 'thorax', 'sternum', 'cervical', 'skull', 'l_girdle']) assert.ok(fr[k] && rotationError(fr[k]) < 1e-9, `${k} at pitch ${pitchDeg}`);
  }
});

test('the chest turn of a wide look is exactly one turn about the top of the chest, however it is shared', () => {
  const plain = body.poseBodySegments(rig, rest, { lookBendDeg: 10, lookBendDirDeg: 30 });
  const turned = body.poseBodySegments(rig, rest, { lookBendDeg: 10, lookBendDirDeg: 30, lookTwistDeg: 40 });
  assert.ok(Math.abs(angleBetween(plain.thorax, turned.thorax) - 40) < 1e-6, 'the top of the chest has turned by the look twist');
  // about its own long axis: the turned frame's long axis is the plain frame's
  const d = plain.thorax[8] * turned.thorax[8] + plain.thorax[9] * turned.thorax[9] + plain.thorax[10] * turned.thorax[10];
  assert.ok(Math.abs(d - 1) < 1e-9, 'the chest keeps its long axis');
  assert.ok(angleBetween(plain.pelvis, turned.pelvis) < 1e-9, 'the pelvis does not turn');
  assert.ok(angleBetween(plain.t12, turned.t12) < 40, 'the turn is shared along the spine');
});

test('from the reclined posture the trunk can lean all the way back and only a little further forward', () => {
  const q = rest.trunk_flex, lim = body.BODY_JOINT_LIMITS.trunk_flex;
  assert.doesNotThrow(() => body.poseBodySegments(rig, rest, { lookBendDeg: lim[0] - q }), 'lean back to the end of the trunk range');
  assert.doesNotThrow(() => body.poseBodySegments(rig, rest, { lookBendDeg: lim[1] - q }), 'bend forward to the end of the trunk range');
  assert.throws(() => body.poseBodySegments(rig, rest, { lookBendDeg: lim[0] - q - 1 }), /lookBendDeg/);
  assert.throws(() => body.poseBodySegments(rig, rest, { lookBendDeg: lim[1] - q + 1 }), /lookBendDeg/);
  const back = body.poseBodySegments(rig, rest, { lookBendDeg: lim[0] - q });
  // (later: the pelvis roll stays under a trunk leaned all the way back)
  assert.ok(Math.abs(angleBetween(back.pelvis, back.thorax) - Math.abs(lim[0] + (rest.pelvic_tilt || 0))) < 1e-6, 'the trunk is then at its backward limit');
  // from a straight trunk the old range still holds
  assert.doesNotThrow(() => body.poseBodySegments(rig, {}, { lookBendDeg: lim[0] }));
  assert.throws(() => body.poseBodySegments(rig, {}, { lookBendDeg: lim[0] - 1 }), /lookBendDeg/);
});

// ---- third pass, 18 November 2026 (after a second independent check) ----
const EYE_BP = [0.04, -158.5, 1513.5]; // the eye reference point in the source pose (mm)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('a trunk turn turns the chest about its own long axis and leaves the head nearly where it was', () => {
  const S0 = body.poseBodySegments(rig, rest, {});
  for (const turn of [45, -45]) {
    const S = body.poseBodySegments(rig, { ...rest, trunk_rot: turn }, {});
    assert.ok(Math.abs(angleBetween(S0.thorax, S.thorax) - 45) < 1e-6, 'the top of the chest has turned by trunk_rot');
    const d = S0.thorax[8] * S.thorax[8] + S0.thorax[9] * S.thorax[9] + S0.thorax[10] * S.thorax[10];
    assert.ok(Math.abs(d - 1) < 1e-9, 'about its own long axis');
    assert.ok(angleBetween(S0.pelvis, S.pelvis) < 1e-9, 'the pelvis does not turn');
    // (with the turn about each low vertebra's own axis the eye swung some 170 mm sideways in the reclined posture)
    const moved = dist(at(S0.skull, EYE_BP), at(S.skull, EYE_BP));
    // (later: with the chest leaning back 35 degrees over a rolled pelvis the head sits further from that axis: about 120 mm at a full turn)
    assert.ok(moved < 130, `the eye moves ${moved.toFixed(0)} mm`);
  }
  // with a straight back it is the plain turn about the trunk's long axis, as before
  const up = body.poseBodySegments(rig, { trunk_rot: 30 }, {});
  assert.ok(Math.abs(up.thorax[10] - 1) < 1e-9 && Math.abs(angleBetween(body.poseBodySegments(rig, {}, {}).thorax, up.thorax) - 30) < 1e-6);
});

test('the eye camera can ride on the head of the body as drawn: the head frame takes the trunk turn and side bend', () => {
  const j = { ...rest, trunk_rot: -45, trunk_side: -35 };
  const S = body.poseBodySegments(rig, j, { baked }), fr = body.bodyHeadFrame(rig, j, { baked });
  assert.ok(dist(at(S.skull, EYE_BP), at(fr.skull, EYE_BP)) < 1e-3, 'the same eye point as the drawn skull');
  const plain = body.bodyHeadFrame(rig, rest, { baked });
  assert.ok(dist(at(plain.skull, EYE_BP), at(fr.skull, EYE_BP)) > 100, 'which a head frame without them misses by more than 10 cm');
});

test('a rounded back carries the head forward without changing where it points', () => {
  assert.equal(body.headForwardDeg(0), 0);
  assert.equal(body.headForwardDeg(-25), 0);
  const hfNow = body.headForwardDeg(rest.trunk_flex, body.HEAD_FORWARD, rest.pelvic_tilt || 0); // (later: the pelvis roll counts too)
  // (18 November 2026, late: the owner found the neck "like a giraffe neck": the start posture now carries the head
  // only a few degrees forward, was 8 or more)
  assert.ok(hfNow >= 2 && hfNow <= 6);
  const rotOf = S => { const T = S.thorax, K = S.skull, o = []; for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o.push(T[4 * r] * K[4 * c] + T[4 * r + 1] * K[4 * c + 1] + T[4 * r + 2] * K[4 * c + 2]); return o; };
  const inChest = (S, p) => { const T = S.thorax, d = [p[0] - T[12], p[1] - T[13], p[2] - T[14]]; return [d[0] * T[0] + d[1] * T[1] + d[2] * T[2], d[0] * T[4] + d[1] * T[5] + d[2] * T[6], d[0] * T[8] + d[1] * T[9] + d[2] * T[10]]; };
  for (const neck of [{ neck_flex: 20, neck_rot: 30 }, { neck_flex: -30, neck_rot: -60 }, { neck_flex: 45 }]) {
    const up = body.poseBodySegments(rig, neck, {}), bent = body.poseBodySegments(rig, { ...neck, trunk_flex: 80 }, {});
    const a = rotOf(up), b = rotOf(bent);
    assert.ok(Math.max(...a.map((v, i) => Math.abs(v - b[i]))) < 1e-9, 'the head points the same way on the chest');
  }
  const up = body.poseBodySegments(rig, {}, {}), bent = body.poseBodySegments(rig, { trunk_flex: 80 }, {});
  const e0 = inChest(up, at(up.skull, EYE_BP)), e1 = inChest(bent, at(bent.skull, EYE_BP));
  assert.ok(e0[1] - e1[1] > 20 && e0[1] - e1[1] < 60, `the eyes are carried ${(e0[1] - e1[1]).toFixed(0)} mm forward of the chest`);
});

test('raising the right arm turns the shoulder blade where it lies on the ribs, and the arm points where it did', () => {
  const bed = rig.pivots.r_sternoclavicular.rollSphere;
  assert.ok(bed && bed.spinAxis && Math.abs(Math.hypot(...bed.spinAxis) - 1) < 2e-3, 'the rig knows the line the blade turns about');
  const A = body.poseBodySegments(rig, rest, {});
  for (const j of [{ r_shoulder_abd: 135 }, { r_shoulder_flex: 180 }, { r_shoulder_flex: -50, r_shoulder_abd: 90 }]) {
    const B = body.poseBodySegments(rig, { ...rest, ...j }, {});
    assert.ok(angleBetween(A.r_girdle, B.r_girdle) > 5, 'the girdle takes a share of the lift');
    assert.ok(dist(at(A.r_girdle, bed.center), at(B.r_girdle, bed.center)) < 1e-6, 'about the centre of the ribs under the blade: the blade stays on them');
  }
  // the upper arm's direction is the one the two shoulder angles give, with or without the girdle's share
  const free = body.poseBodySegments(rig, { r_shoulder_abd: 100 }, {}), low = body.poseBodySegments(rig, { r_shoulder_abd: 20 }, {});
  const ang = angleBetween(body.poseBodySegments(rig, {}, {}).r_upperarm, free.r_upperarm);
  assert.ok(Math.abs(ang - 100) < 1e-6, `the arm is lifted by the whole angle (${ang.toFixed(3)})`);
  assert.ok(angleBetween(body.poseBodySegments(rig, {}, {}).r_girdle, low.r_girdle) < 1e-9, 'below the threshold the blade does not turn');
});
