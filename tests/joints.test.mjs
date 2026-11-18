/** Joints that stay together through their whole range (18 November 2026; user: "Make sure clicking of the muscles does
 * not result in impossible ranges of motions and dislocations and detachments of muscles"; "No muscles or joints should
 * be pointy (unless naturally so), detached, dislocated"): the combined-range rule of the clamp, the kneecap's track
 * and the front thigh muscles' wrap. The cases load the game's own body from disk (tools/load-body.mjs). They establish
 * what the rig computes on this one reference body, never how a real joint moves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, inputs, rig, baked } = await loadBody(repo);
const { BODY_MOTOR_MAP } = await import(path.join(repo, 'scene/src/ns-bodymap.mjs'));
const rest = body.bodyPostureAngles(baked);
const L = body.BODY_JOINT_LIMITS;
const clampOf = t => body.clampBodyJointTargets(t).applied;
const at = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
function inv(m) {
  const o = new Float64Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10]; o[15] = 1;
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
  return o;
}

test('every movement of the body map still reaches its own end, alone, from the anatomical pose and from the start posture', () => {
  for (const from of [{}, rest]) for (const r of BODY_MOTOR_MAP.regions) for (const a of r.actions || []) {
    if (!a.joints) continue;
    // (from the start posture the thigh lift needs the knee that gives way, as the game draws it)
    const t = clampOf(body.passiveKneeAngles({ ...clampOf(from), ...a.joints }));
    for (const [id, v] of Object.entries(a.joints)) {
      const want = Math.min(L[id][1], Math.max(L[id][0], v));
      // one movement ends a little short of the single-joint limit by the rule itself: with the hip straight the knee
      // bends to 120, not 135
      // and with the trunk bent forward the thigh lifts as far as the trunk leaves room (75 at a full bend)
      const least = /^knee_ext_/.test(id) && want < -120 ? 120 : /^hip_flex_/.test(id) && want > 75 && from === rest ? Math.abs(body.combinedRange(id, clampOf(from))[1]) : Math.abs(want);
      assert.ok(Math.abs(t[id]) >= least - 1e-9 && Math.sign(t[id]) === Math.sign(want) || want === 0 && Math.abs(t[id]) < 1e-9, `${r.label}: ${a.label}: ${id} asked ${v}, got ${t[id]}`);
    }
  }
});

test('the postures of the game are untouched by the combined-range rule', () => {
  for (const name of Object.keys(body.BODY_POSTURES)) assert.deepEqual(body.clampBodyJointTargets(body.BODY_POSTURES[name]).clamped, [], name);
});

test('the combined-range rule only ever narrows, is continuous, and leaves the angle that narrows another alone', () => {
  for (const r of body.COMBINED_RANGE.rows) {
    const full = L[r.id][r.end];
    assert.ok(r.end === 0 ? r.least >= full && r.least <= 0 : r.least <= full && r.least >= 0, `${r.id}: the narrowed end lies inside the full range`);
    const by = typeof L[r.by] === 'object' ? r.by : null;
    let last = null;
    for (let k = 0; k <= 40; k++) {
      const v = r.from + (r.to - r.from) * (k / 20 - 0.5); // from before `from` to beyond `to`
      const probe = by ? { [by]: v } : r.by === 'wristBend' ? (v >= 0 ? { r_wrist_flex: v } : { r_wrist_ext: -v }) : { r_index_flex: v, r_middle_flex: v, r_ring_flex: v, r_little_flex: v };
      const t = clampOf({ knee_ext_L: -90, knee_ext_R: -90, ...probe, [r.id]: full });
      // (hip flexion has its own, older rule with the knee: the knee is bent here so that it does not act)
      if (by) assert.equal(t[by], Math.min(L[by][1], Math.max(L[by][0], v)), `${by} is not changed by narrowing ${r.id}`);
      assert.ok(r.end === 0 ? t[r.id] >= full - 1e-9 : t[r.id] <= full + 1e-9);
      if (last !== null) assert.ok(Math.abs(t[r.id] - last) <= Math.abs(r.least - full) / 9 + 1e-9, `${r.id} narrows without a jump`);
      last = t[r.id];
    }
  }
});

test('the rule, row by row: what stacked movements are cut to', () => {
  // the knee bends less with the hip straight (typical textbook range 120 against 140; here 120 against 135)
  assert.equal(clampOf({ knee_ext_L: -135, hip_flex_L: 0 }).knee_ext_L, -120);
  assert.equal(clampOf({ knee_ext_L: -135, hip_flex_L: 60 }).knee_ext_L, -135);
  assert.equal(clampOf({ knee_ext_R: -135, hip_flex_R: -20 }).knee_ext_R, -120);
  // the hip: turning in at deep flexion, turning out and abduction in extension
  assert.equal(clampOf({ hip_flex_R: 120, knee_ext_R: -90, hip_rot_R: -40 }).hip_rot_R, -25);
  assert.equal(clampOf({ hip_flex_R: 90, hip_rot_R: -40 }).hip_rot_R, -40);
  assert.equal(clampOf({ hip_flex_L: -30, hip_rot_L: 45, hip_abd_L: 45 }).hip_rot_L, 25);
  assert.equal(clampOf({ hip_flex_L: -30, hip_rot_L: 45, hip_abd_L: 45 }).hip_abd_L, 30);
  assert.equal(clampOf({ hip_flex_L: 120, knee_ext_L: -90, hip_abd_L: 45, hip_rot_L: 45 }).hip_abd_L, 45, 'thigh up, out and turned out is left alone (a position bodies reach)');
  // neck, trunk, wrist, foot, fingers
  assert.equal(clampOf({ neck_rot: 80, neck_side: 45 }).neck_side, 25);
  assert.equal(clampOf({ neck_rot: -80, neck_side: -45 }).neck_side, -25);
  assert.deepEqual([clampOf({ neck_rot: 80, neck_flex: 50 }).neck_rot, clampOf({ neck_rot: 80, neck_flex: 50 }).neck_flex], [80, 50], 'the look\'s own two neck angles are not narrowed against each other');
  assert.equal(clampOf({ trunk_flex: 90, trunk_rot: 45 }).trunk_rot, 45, 'the trunk turns to its end however far it is bent');
  assert.equal(clampOf({ trunk_rot: 45, trunk_side: 35 }).trunk_side, 25);
  assert.equal(clampOf({ r_wrist_flex: 80, r_wrist_dev: 20 }).r_wrist_dev, 8);
  assert.equal(clampOf({ r_wrist_ext: 70, r_wrist_dev: -30 }).r_wrist_dev, -12);
  assert.equal(clampOf({ ankle_dorsi_L: 20, ankle_inv_L: 35 }).ankle_inv_L, 20);
  assert.equal(clampOf({ ankle_dorsi_L: -50, ankle_inv_L: 35 }).ankle_inv_L, 35);
  assert.equal(clampOf({ r_index_flex: 90, r_middle_flex: 90, r_ring_flex: 90, r_little_flex: 90, r_finger_spread: 20 }).r_finger_spread, 5);
});

test('the right shoulder: raising wins over lifting sideways, and the upper arm is never twisted half a turn', () => {
  const dirOf = t => { // where the upper arm points (source frame, pelvis anchored): shoulder centre -> elbow centre
    const seg = body.poseBodySegments(rig, t, {}), m = seg.r_upperarm;
    const a = at(m, rig.pivots.r_glenohumeral.point), b = at(m, rig.pivots.r_elbow.point), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d);
    return d.map(x => x / l);
  };
  // raised 180 and lifted 135 sideways: the lift gives way to 15, the arm points up and a little out to the right
  const both = clampOf({ r_shoulder_flex: 180, r_shoulder_abd: 135 });
  assert.equal(both.r_shoulder_flex, 180);
  assert.equal(both.r_shoulder_abd, 15);
  const d = dirOf({ r_shoulder_flex: 180, r_shoulder_abd: 135 });
  assert.ok(d[2] > 0.9 && d[0] < 0, `the arm points up and to its own side (${d.map(x => x.toFixed(2))})`);
  // each alone is untouched
  assert.equal(clampOf({ r_shoulder_abd: 180 }).r_shoulder_abd, 180);
  assert.equal(clampOf({ r_shoulder_flex: 180 }).r_shoulder_flex, 180);
  // raised forward to shoulder height: out to the side and 30 degrees on behind (typical textbook range 30 to 45)
  assert.equal(clampOf({ r_shoulder_flex: 90, r_shoulder_abd: 180 }).r_shoulder_abd, 120);
  // lifted sideways above shoulder height: less room to swing back, none straight up
  assert.equal(clampOf({ r_shoulder_abd: 135, r_shoulder_flex: -60 }).r_shoulder_flex, -30);
  assert.equal(clampOf({ r_shoulder_abd: 180, r_shoulder_flex: -60 }).r_shoulder_flex + 0, 0);
  assert.equal(clampOf({ r_shoulder_abd: 90, r_shoulder_flex: -60 }).r_shoulder_flex, -60);
  // the upper arm's own turn: whole range to shoulder height, 30 each way straight up
  assert.equal(clampOf({ r_shoulder_flex: 90, r_shoulder_rot: 90 }).r_shoulder_rot, 90);
  assert.equal(clampOf({ r_shoulder_flex: 180, r_shoulder_rot: 90 }).r_shoulder_rot, 30);
  assert.equal(clampOf({ r_shoulder_flex: 180, r_shoulder_rot: -70 }).r_shoulder_rot, -30);
  // no reachable pair leaves the allowed region, and the limit moves without a jump
  let last = null;
  for (let f = -60; f <= 180; f += 2) {
    const t = clampOf({ r_shoulder_flex: f, r_shoulder_abd: 180 });
    if (f > 0) assert.ok(t.r_shoulder_abd <= Math.max(15, 180 - f + 30) + 1e-9);
    if (last !== null) assert.ok(Math.abs(t.r_shoulder_abd - last) <= 4.2, `no jump at ${f}`);
    last = t.r_shoulder_abd;
  }
});

test('the clamp reports what the combined rule cut, once per joint, with the angle that was asked', () => {
  const r = body.clampBodyJointTargets({ r_shoulder_flex: 200, r_shoulder_abd: 135, neck_rot: 80, neck_side: 60 });
  const by = Object.fromEntries(r.clamped.map(c => [c.id, c]));
  assert.deepEqual(by.r_shoulder_flex, { id: 'r_shoulder_flex', requested: 200, applied: 180 });
  assert.deepEqual(by.r_shoulder_abd, { id: 'r_shoulder_abd', requested: 135, applied: 15 });
  assert.deepEqual(by.neck_side, { id: 'neck_side', requested: 60, applied: 25 });
  assert.equal(r.clamped.length, 3);
});

test('the kneecap stays on the thigh bone and near the shin at every knee angle', () => {
  for (const [s, S, side] of [['r', 'R', 'right'], ['l', 'L', 'left']]) {
    const pf = rig.pivots[`${s}_patellofemoral`];
    assert.ok(pf.track && pf.track.sink.length === body.PATELLA_TRACK.maxDeg / body.PATELLA_TRACK.stepDeg + 1, 'the track was found from the bones');
    assert.equal(pf.track.sink[0], 0);
    assert.ok(pf.track.sink.every(v => v >= 0 && v < 20), 'the kneecap only sinks, by less than 20 mm');
    const id = name => inputs.entries.find(e => (e.concepts && e.concepts[0] && e.concepts[0].en) === name || e.name === name).element_id;
    const femur = inputs.meshesById.get(id(`${side} femur`)), patella = inputs.meshesById.get(id(`${side} patella`)).positions, tibia = inputs.meshesById.get(id(`${side} tibia`)).positions;
    // thigh-bone surface near the knee, sampled every millimetre or so, with the face normal
    const fp = femur.positions, fi = femur.indices, pts = [];
    for (let t = 0; t < fi.length; t += 3) {
      const A = [0, 1, 2].map(k => fp[3 * fi[t] + k]), B = [0, 1, 2].map(k => fp[3 * fi[t + 1] + k]), C = [0, 1, 2].map(k => fp[3 * fi[t + 2] + k]);
      if (Math.hypot(A[0] - pf.point[0], A[1] - pf.point[1], A[2] - pf.point[2]) > 70) continue;
      const e = Math.max(Math.hypot(...A.map((v, k) => v - B[k])), Math.hypot(...B.map((v, k) => v - C[k])), Math.hypot(...C.map((v, k) => v - A[k]))), n = Math.max(1, Math.ceil(e / 1.2));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const u = i / n, v = j / n, w = 1 - u - v; pts.push(A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v, A[2] * w + B[2] * u + C[2] * v); }
    }
    const gapAt = seg => { // closest approach of the kneecap to the thigh bone, in the thigh's frame
      const it = inv(seg[`${s}_thigh`]), mp = seg[`${s}_patella`];
      let best = Infinity;
      for (let i = 0; i < patella.length; i += 9) { const w = at(mp, [patella[i], patella[i + 1], patella[i + 2]]), q = at(it, w); for (let k = 0; k < pts.length; k += 3) { const d2 = (pts[k] - q[0]) ** 2 + (pts[k + 1] - q[1]) ** 2 + (pts[k + 2] - q[2]) ** 2; if (d2 < best) best = d2; } }
      return Math.sqrt(best);
    };
    const shinGap = seg => { // closest approach of the kneecap to the shin bone
      const it = inv(seg[`${s}_shank`]), mp = seg[`${s}_patella`];
      let best = Infinity;
      for (let i = 0; i < patella.length; i += 9) { const q = at(it, at(mp, [patella[i], patella[i + 1], patella[i + 2]])); for (let k = 0; k < tibia.length; k += 3) { const d2 = (tibia[k] - q[0]) ** 2 + (tibia[k + 1] - q[1]) ** 2 + (tibia[k + 2] - q[2]) ** 2; if (d2 < best) best = d2; } }
      return Math.sqrt(best);
    };
    const seg0 = body.poseBodySegments(rig, { [`hip_flex_${S}`]: 60 }, {}), shin0 = shinGap(seg0);
    for (const knee of [30, 60, 90, 120, 135]) {
      const seg = body.poseBodySegments(rig, { [`hip_flex_${S}`]: 60, [`knee_ext_${S}`]: -knee }, {});
      assert.ok(gapAt(seg) < 3, `${side} knee bent ${knee}: the kneecap is ${gapAt(seg).toFixed(1)} mm from the thigh bone`);
      assert.ok(shinGap(seg) < shin0 + 12, `${side} knee bent ${knee}: the kneecap is ${(shinGap(seg) - shin0).toFixed(1)} mm farther from the shin than with the knee straight`);
    }
  }
});

test('the front thigh muscles wrap: frames are rigid, a straight knee changes nothing, the weights are continuous along the thigh', () => {
  const zero = body.poseBodySegments(rig, {}, {});
  for (const s of body.BODY_SEGMENTS.filter(x => /_quad\d$/.test(x))) for (let k = 0; k < 16; k++) assert.ok(Math.abs(zero[s][k] - (k % 5 === 0 ? 1 : 0)) < 1e-12, `${s} is the identity with the knee straight`);
  assert.equal(body.BODY_SEGMENTS.filter(x => /_quad\d$/.test(x)).length, 2 * body.QUAD_WRAP.heightsMm.length);
  const id = inputs.entries.find(e => e.name === 'right rectus femoris' || (e.concepts && e.concepts[0] && e.concepts[0].en === 'right rectus femoris')).element_id;
  const info = rig.meshSegment[id];
  assert.ok(info.candidates.includes('r_patella'), 'the kneecap is one of the bones of the front thigh muscle');
  const mesh = inputs.meshesById.get(id), w = body.bodySkinWeights(rig, id, mesh.positions), SEG = body.BODY_SEGMENTS;
  const used = new Set(); for (let v = 0; v < w.i0.length; v++) { used.add(SEG[w.i0[v]]); used.add(SEG[w.i1[v]]); }
  for (const s of ['r_patella', 'r_quad1', 'r_quad2', 'r_quad3', 'r_quad4', 'r_thigh', 'pelvis', 'r_shank']) assert.ok(used.has(s), `some vertex of the muscle hangs from ${s}`);
  // with the knee fully bent no edge of the muscle between the hip and the kneecap is torn: the longest edge grows by
  // less than three times (the wrap stretches the lower thigh by 1.4 times)
  const pose = t => body.skinBodyPositions(new Map(Object.entries(body.poseBodySegments(rig, t, {}))), w, mesh.positions);
  const a = pose({ hip_flex_R: 60 }), b = pose({ hip_flex_R: 60, knee_ext_R: -135 }), ix = mesh.indices;
  let worst = 0;
  for (let t = 0; t + 2 < ix.length; t += 3) for (const [p, q] of [[ix[t], ix[t + 1]], [ix[t + 1], ix[t + 2]], [ix[t + 2], ix[t]]]) {
    const la = Math.hypot(a[3 * p] - a[3 * q], a[3 * p + 1] - a[3 * q + 1], a[3 * p + 2] - a[3 * q + 2]), lb = Math.hypot(b[3 * p] - b[3 * q], b[3 * p + 1] - b[3 * q + 1], b[3 * p + 2] - b[3 * q + 2]);
    if (la > 1 && lb / la > worst) worst = lb / la;
  }
  assert.ok(worst < 3, `the most stretched edge of the front thigh muscle at a fully bent knee is ${worst.toFixed(2)} times its length`);
});

test('a jaw shifted sideways turns about the joint head of that side: it stays in its socket, the chin goes the asked distance', () => {
  const T = rig.pivots.tmj;
  for (const mm of [10, -10, 4]) {
    const m = body.poseBodySegments(rig, { jaw_side: mm }, {}).mandible, moved = p => at(m, p).map((v, i) => v - p[i]);
    const stay = mm > 0 ? T.condyles.left : T.condyles.right, travel = mm > 0 ? T.condyles.right : T.condyles.left;
    assert.ok(Math.hypot(...moved(stay)) < 0.01, 'the joint head on the side the chin goes to does not leave its socket');
    assert.ok(Math.abs(moved(T.chin)[0] - mm) < 0.6, `the chin goes ${moved(T.chin)[0].toFixed(1)} mm sideways for ${mm}`);
    const t = moved(travel);
    assert.ok(t[1] < 0 && t[2] < 0 && Math.abs(t[0]) < 0.15 * Math.abs(mm), `the other head slides forward and down (${t.map(v => v.toFixed(1))})`);
    assert.ok(Math.hypot(...t) < 1.35 * Math.abs(mm), 'by about the distance the chin goes');
  }
});

test('the belly wall is whole: no shards in the start shape, straight, or arched back and turned', () => {
  // (before WALL_SKIN the right external oblique had over 3000 edges longer than 15 mm AND more than twice their
  // source length in the baked start shape alone, some drawn 105 mm long from under a millimetre. An edge of the
  // short flank between the ribs and the hip bone does grow to a little over twice its length when the trunk is
  // arched back and turned: that is the flank lengthening, with smooth weights; the line here is three times.)
  const SEG = body.BODY_SEGMENTS, bakedInv = SEG.map(s => inv(baked.segments.get(s)));
  const mul = (a, b) => { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[4 * c + r] = a[r] * b[4 * c] + a[4 + r] * b[4 * c + 1] + a[8 + r] * b[4 * c + 2] + a[12 + r] * b[4 * c + 3]; return o; };
  for (const name of ['right external oblique', 'left external oblique', 'rectus abdominis muscle.r', 'transversus abdominis muscle.l']) {
    const mu = rig.muscles.find(m => m.name === name), info = rig.meshSegment[mu.id];
    assert.equal(info.skin, 'wall', name);
    assert.ok(info.candidates.includes('pelvis') && info.candidates.includes('sternum') && !info.candidates.some(s => /^(lumbar|thorax|l\d|t\d+)$/.test(s)), `${name}: pelvis, breastbone, ribs and cartilages, no vertebra`);
    const mesh = inputs.meshesById.get(mu.id), p = mesh.positions, b = baked.meshesById.get(mu.id).positions, ix = mesh.indices, w = body.bodySkinWeights(rig, mu.id, p);
    for (let v = 0; v < w.w0.length; v++) assert.ok(w.w0[v] >= 0 && w.w0[v] <= 1 && Math.abs(w.w0[v] + w.w1[v] - 1) < 1e-6);
    for (const t of [null, { ...rest, trunk_flex: 0 }, { ...rest, trunk_flex: -25, trunk_rot: 45 }]) {
      let pos = b;
      if (t) { // as drawn: the baked shape carried by each vertex's two bones
        const seg = body.poseBodySegments(rig, t, { baked }), rel = SEG.map((s, i) => mul(seg[s], bakedInv[i]));
        pos = new Float32Array(b.length);
        for (let v = 0, k = 0; k < b.length; v++, k += 3) { const A = rel[w.i0[v]], B = rel[w.i1[v]], q = at(A, [b[k], b[k + 1], b[k + 2]]), r = at(B, [b[k], b[k + 1], b[k + 2]]); for (let c = 0; c < 3; c++) pos[k + c] = w.w0[v] * q[c] + w.w1[v] * r[c]; }
      }
      let shards = 0;
      for (let f = 0; f + 2 < ix.length; f += 3) for (const [u, q] of [[ix[f], ix[f + 1]], [ix[f + 1], ix[f + 2]], [ix[f + 2], ix[f]]]) {
        const ls = Math.hypot(p[3 * u] - p[3 * q], p[3 * u + 1] - p[3 * q + 1], p[3 * u + 2] - p[3 * q + 2]), ld = Math.hypot(pos[3 * u] - pos[3 * q], pos[3 * u + 1] - pos[3 * q + 1], pos[3 * u + 2] - pos[3 * q + 2]);
        if (ld > 15 && ld > 3 * ls) shards++;
      }
      assert.ok(shards <= 40, `${name}${t ? ' with the trunk at ' + t.trunk_flex : ' in the start shape'}: ${shards} edges longer than 15 mm and three times their source length`);
    }
  }
});


test('the leg turn: the foot leads, the three parts add up to the turn at both ends, and the foot line ends 90 degrees out and in', () => {
  const T = body.LEG_TURN, lim = L.leg_turn_R;
  assert.deepEqual([lim[0], lim[1]], [-T.in.deg, T.out.deg]);
  assert.equal(T.out.deg + T.restToeOutDeg, 90);
  assert.equal(T.in.deg - T.restToeOutDeg, 90);
  for (const e of [T.out, T.in]) assert.equal(e.foot + e.shank + e.thigh, e.deg);
  const sum = s => s.foot + s.shank + s.thigh;
  assert.ok(Math.abs(sum(body.legTurnShares(70)) - 70) < 1e-9 && Math.abs(sum(body.legTurnShares(-110)) + 110) < 1e-9);
  assert.deepEqual(body.legTurnShares(0), { foot: 0, shank: 0, thigh: 0 });
  // monotonic all the way, and the foot is ahead of the shank, the shank ahead of the thigh (as a share of its own end)
  for (const [end, e] of [[70, T.out], [-110, T.in]]) {
    let last = { foot: 0, shank: 0, thigh: 0 };
    for (let k = 1; k <= 40; k++) {
      const s = body.legTurnShares(end * k / 40);
      for (const part of ['foot', 'shank', 'thigh']) assert.ok(Math.abs(s[part]) >= Math.abs(last[part]) - 1e-9 && Math.abs(s[part]) <= e[part] + 1e-9, `${part} at ${end * k / 40}`);
      assert.ok(Math.abs(s.foot) / e.foot >= Math.abs(s.shank) / e.shank - 1e-9 && Math.abs(s.shank) / e.shank >= Math.abs(s.thigh) / e.thigh - 1e-9, 'the far end leads');
      last = s;
    }
  }
  // the thigh's whole turn stays inside the hip's own range, whatever the player has already turned
  for (const own of [-40, 0, 45]) for (const turn of [-110, 70]) {
    const st = body.legTurnState(rig, clampOf({ ...rest, hip_rot_R: own, leg_turn_R: turn })).R;
    assert.ok(st.hipRot >= L.hip_rot_R[0] - 1e-9 && st.hipRot <= L.hip_rot_R[1] + 1e-9, `hip ${own} + turn ${turn}: ${st.hipRot}`);
  }
  // in the game's start posture: the foot's own line (ankle centre to the second toe's joint), seen along the shank
  const P = rig.pivots, line = (segs, S) => {
    const s = S.toLowerCase(), a = at(segs.get(`${s}_foot`), P[`${s}_ankle`].point), b = at(segs.get(`${s}_foot`), P[`${s}_mtp`].rays.second.point), k = at(segs.get(`${s}_shank`), P[`${s}_knee`].point), an = at(segs.get(`${s}_shank`), P[`${s}_ankle`].point);
    const ax = [an[0] - k[0], an[1] - k[1], an[2] - k[2]], l = Math.hypot(...ax), u = ax.map(x => x / l), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return d.map((x, i) => x - t * u[i]);
  };
  const ang = (p, q) => Math.acos(Math.max(-1, Math.min(1, (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / (Math.hypot(...p) * Math.hypot(...q))))) * 180 / Math.PI;
  const pose = t => body.poseBodyDetailed(rig, { ...rest, ...t }, { baked, anchor: 'pelvis' }).segments;
  // (the start posture itself holds both legs at the turn's outward end since the game starts on the underside, so
  // the unturned leg is posed explicitly)
  const base = pose({ leg_turn_L: 0, leg_turn_R: 0 });
  for (const S of ['L', 'R']) {
    const out = pose({ [`leg_turn_${S}`]: 70 }), inn = pose({ [`leg_turn_${S}`]: -110 });
    assert.ok(Math.abs(ang(line(base, S), line(out, S)) - 70) < 6, `${S} out: ${ang(line(base, S), line(out, S))}`);
    assert.ok(Math.abs(ang(line(base, S), line(inn, S)) - 110) < 6, `${S} in: ${ang(line(base, S), line(inn, S))}`);
    assert.ok(Math.abs(ang(line(out, S), line(inn, S)) - 180) < 8, 'the two ends point opposite ways: 90 degrees either side of straight ahead');
  }
});

test('two feet turned inward do not meet: the thighs part just enough and come back', () => {
  const geo = { hipHalfMm: 87, thighMm: 420, shankMm: 406, footMm: 118 };
  const part = (h, abd) => body.legTurnPartDeg(geo, { headingOutL: h, headingOutR: h, abdL: abd, abdR: abd, kneeFlexL: 10, kneeFlexR: 10 });
  assert.equal(part(20, 0), 0, 'feet at rest: nothing');
  assert.equal(part(90, 0), 0, 'feet turned out: nothing');
  assert.ok(part(-90, 0) > 3 && part(-90, 0) <= body.LEG_TURN.partMaxDeg, 'legs together, feet in: the thighs part');
  assert.ok(part(-90, 6) < part(-90, 0) && part(-90, 20) === 0, 'the wider the legs already are, the less');
  assert.ok(part(-45, 0) < part(-90, 0), 'and less for a smaller turn');
  // in the rig: both feet turned fully in from the start posture keep their forefeet apart; turned back, the spread is back
  const st = body.legTurnState(rig, clampOf({ ...rest, leg_turn_L: -110, leg_turn_R: -110 }));
  assert.ok(st.L.headingOut < -80 && st.R.headingOut < -80);
  const st0 = body.legTurnState(rig, clampOf(rest));
  assert.equal(st0.L.abdExtra, 0); assert.equal(st0.R.abdExtra, 0);
  const tips = t => {
    const seg = body.poseBodyDetailed(rig, { ...rest, ...t }, { baked, anchor: 'pelvis' }).segments, out = {};
    for (const s of ['l', 'r']) { const m = seg.get(`${s}_hallux`), src = baked.segments.get(`${s}_hallux`), c = rig._clouds[`${s}_hallux`] || rig._clouds[`${s}_toes`]; out[s] = []; for (let i = 0; i < c.length; i += 3) out[s].push(at(m, [c[i], c[i + 1], c[i + 2]])); }
    let best = Infinity;
    for (const a of out.l) for (const b of out.r) best = Math.min(best, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    return best;
  };
  assert.ok(tips({ leg_turn_L: -110, leg_turn_R: -110 }) > 10, `big toes ${tips({ leg_turn_L: -110, leg_turn_R: -110 })} mm apart with both feet turned in`);
});

test('the small coupled movements stay inside every limit and vanish when the movement is undone', () => {
  const C = body.JOINT_COUPLINGS, same = (a, b) => { for (const [k, m] of a) { const n = b.get(k); for (let i = 0; i < 16; i++) if (Math.abs(m[i] - n[i]) > 1e-12) return false; } return true; };
  const seg = t => body.poseBodyDetailed(rig, t, { anchor: 'pelvis' }).segments;
  // at the anatomical pose nothing is added
  const zero = body.legTurnState(rig, clampOf({}));
  for (const S of ['L', 'R']) assert.deepEqual([zero[S].foot, zero[S].shank, zero[S].kneeSide, zero[S].hipRot, zero[S].abdExtra], [0, 0, 0, 0, 0]);
  // a movement made and undone gives the very same pose
  const before = seg({ ...rest });
  for (const t of [{ knee_ext_R: -90 }, { r_wrist_flex: 80 }, { ankle_dorsi_L: -50 }, { hip_flex_R: 120, knee_ext_R: -90 }, { leg_turn_L: -110 }]) { seg({ ...rest, ...t }); assert.ok(same(before, seg({ ...rest })), JSON.stringify(t)); }
  // the knee's own turn and lean are small; the hip's added turn respects the combined-range rule
  for (const k of [0, 30, 90, 135]) { const s = body.legTurnState(rig, clampOf({ knee_ext_R: -k, hip_flex_R: 60 })).R; assert.ok(Math.abs(s.shank) <= C.kneeUnlockDeg + 1e-9 && s.kneeSide === 0); }
  const deep = clampOf({ hip_flex_R: 120, knee_ext_R: -90, hip_rot_R: 45 }), sd = body.legTurnState(rig, deep).R;
  assert.ok(sd.hipRot <= L.hip_rot_R[1] + 1e-9 && sd.abdExtra <= C.hipSpreadDeg + 1e-9);
  assert.ok(body.legTurnState(rig, clampOf({ hip_flex_R: 120, knee_ext_R: -90, hip_abd_R: 45 })).R.abdExtra === 0, 'no spread is added to a thigh already at its limit');
  const turned = body.legTurnState(rig, clampOf({ leg_turn_R: 70 })).R, turnedIn = body.legTurnState(rig, clampOf({ leg_turn_R: -110 })).R;
  assert.ok(turned.kneeSide > 0 && turned.kneeSide <= 4 && turnedIn.kneeSide < 0 && turnedIn.kneeSide >= -5, 'a few degrees of valgus turned out, varus turned in');
});


test('a thigh lifted toward a bent trunk stops where they meet, and a single movement\'s goal is the end that is drawn', () => {
  assert.equal(clampOf({ trunk_flex: 0, hip_flex_R: 120, knee_ext_R: -90 }).hip_flex_R, 120, 'upright: the whole lift');
  assert.equal(clampOf({ trunk_flex: 45, hip_flex_R: 120, knee_ext_R: -90 }).hip_flex_R, 120);
  assert.equal(clampOf({ trunk_flex: 90, hip_flex_R: 120, knee_ext_R: -90 }).hip_flex_R, 75, 'trunk fully bent: 75');
  assert.equal(clampOf({ trunk_flex: 90, hip_flex_L: 120, hip_flex_R: 120, knee_ext_L: -135, knee_ext_R: -135 }).hip_flex_L, 75, 'both thighs');
  const mid = clampOf({ trunk_flex: 80, hip_flex_R: 110 }).hip_flex_R;
  assert.ok(mid > 75 && mid < 90, `start posture's trunk: ${mid}`);
  assert.equal(clampOf({ trunk_flex: 90, hip_flex_R: 60 }).hip_flex_R, 60, 'a smaller lift is left alone');
  assert.equal(clampOf({ trunk_flex: -25, hip_flex_R: 120, knee_ext_R: -90 }).hip_flex_R, 120, 'leaning back: the whole lift');
  // the goals the game gives a movement from the start posture are the drawn ends
  const PL = body.bodyPostureLimits(body.DEFAULT_BODY_POSTURE);
  for (const S of ['L', 'R']) {
    // never beyond what is drawn (the posture may cap a goal lower still: the slumped start posture caps the thigh's lift)
    assert.equal(PL[`knee_ext_${S}`][0], clampOf({ ...rest, [`knee_ext_${S}`]: -135 })[`knee_ext_${S}`]);
    assert.ok(PL[`hip_flex_${S}`][1] <= clampOf({ ...rest, [`hip_flex_${S}`]: 120, [`knee_ext_${S}`]: -90 })[`hip_flex_${S}`] + 1e-9);
  }
  for (const id of body.BODY_JOINT_IDS) assert.ok(PL[id][0] >= L[id][0] && PL[id][1] <= L[id][1] && PL[id][0] <= rest[id] && PL[id][1] >= rest[id], `${id}: the posture's limits hold the posture`);
});

test('the right shoulder\'s muscles wrap through a half-way frame: it turns half of the upper arm\'s turn, about the shoulder\'s centre', () => {
  const W = body.ARM_WRAP.segment, c = rig.pivots.r_glenohumeral.point;
  assert.ok(body.BODY_SEGMENTS.includes(W) && body.BODY_SEGMENT_PARENT[W] === 'r_girdle');
  const ang = m => Math.acos(Math.max(-1, Math.min(1, (m[0] + m[5] + m[10] - 1) / 2))) * 180 / Math.PI;
  for (const t of [{}, { r_shoulder_flex: 180 }, { r_shoulder_abd: 135 }, { r_shoulder_flex: -60 }, { r_shoulder_flex: 90, r_shoulder_abd: 60, r_shoulder_rot: 40 }]) {
    const seg = body.poseBodyDetailed(rig, t, { anchor: 'pelvis' }).segments, g = inv(seg.get('r_girdle'));
    const mul = (a, b) => { const o = new Float64Array(16); for (let cc = 0; cc < 4; cc++) for (let r = 0; r < 4; r++) o[4 * cc + r] = a[r] * b[4 * cc] + a[4 + r] * b[4 * cc + 1] + a[8 + r] * b[4 * cc + 2] + a[12 + r] * b[4 * cc + 3]; return o; };
    const up = mul(g, seg.get('r_upperarm')), half = mul(g, seg.get(W));
    assert.ok(Math.abs(ang(half) - ang(up) / 2) < 1e-3, `${JSON.stringify(t)}: half ${ang(half)} of ${ang(up)}`);
    const p = at(half, c);
    assert.ok(Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < 1e-3, 'the shoulder centre stays where it is');
  }
  // a shoulder muscle hangs from the trunk side, the half-way frame and the upper arm, and never straight from both ends
  const m = rig.muscles.find(x => /right deltoid|deltoid.*right/i.test(x.name)) || rig.muscles.find(x => /right pectoralis major|pectoralis major.*right/i.test(x.name));
  assert.ok(m, 'a right shoulder muscle is in the packet');
  const w = body.bodySkinWeights(rig, m.id, inputs.meshesById.get(m.id).positions), S = body.BODY_SEGMENTS, U = S.indexOf('r_upperarm'), Wi = S.indexOf(W);
  let viaWrap = 0, direct = 0;
  for (let v = 0; v < w.i0.length; v++) {
    const a = w.i0[v], b = w.i1[v];
    if (a === Wi || b === Wi) viaWrap++;
    if ((a === U) !== (b === U) && a !== Wi && b !== Wi && w.w0[v] > 1e-6 && w.w1[v] > 1e-6) direct++;
    assert.ok(Math.abs(w.w0[v] + w.w1[v] - 1) < 1e-5);
  }
  assert.ok(viaWrap > 0 && direct === 0, `${m.name}: ${viaWrap} vertices through the half-way frame, ${direct} straight across`);
});

test('the right elbow keeps short neighbouring muscle edges when it bends with the palm down', () => {
  // BodyParts3D meshes at the seam where the two forearm bones used to crowd out the upper arm.
  const cases = [
    ['FJ1502', 2159, 2136], // palmaris longus
    ['FJ1487', 2222, 2221], // brachioradialis
    ['FJ1473', 49, 43], // humeral head of flexor carpi ulnaris
    ['FJ1475', 1065, 1064], // flexor digitorum superficialis
  ];
  const fibres = new Map(cases.map(([id]) => [id, inputs.meshesById.get(id)]));
  const edgeLength = (p, a, b) => Math.hypot(
    p[3 * a] - p[3 * b], p[3 * a + 1] - p[3 * b + 1], p[3 * a + 2] - p[3 * b + 2]
  );
  for (const r_pronation of [0, 160]) {
    const posture = { ...rest, r_elbow_flex: 145, r_pronation };
    const bent = body.bakeBodyPosture(rig, fibres, { posture });
    for (const [id, a, b] of cases) {
      const from = edgeLength(fibres.get(id).positions, a, b);
      const to = edgeLength(bent.meshesById.get(id).positions, a, b);
      assert.ok(bent.skinned.includes(id), id);
      assert.ok(from > 1 && from < 2, `${id}: source edge ${from} mm`);
      assert.ok(to < 3 * from, `${id}: ${from} mm source edge becomes ${to} mm`);
    }
  }
});

test('the shallow anconeus correction keeps edges short and hands the unaltered skin back smoothly', () => {
  const id = 'FJ1485';
  const mesh = inputs.meshesById.get(id);
  const fixture = new Map([[id, mesh]]);
  const delta = body.bodySkinWeights(rig, id, mesh.positions);
  const original = { ...delta, anconeusDelta: null };
  for (const angle of [0, 8, 12, 67, 90, 136, 145]) assert.equal(body.anconeusBendBlend(angle), 0);
  for (const angle of [25, 45, 60]) assert.equal(body.anconeusBendBlend(angle), 1);
  for (const angle of [12, 25, 60, 67]) {
    const eps = 1e-3;
    assert.ok(Math.abs(body.anconeusBendBlend(angle + eps) - body.anconeusBendBlend(angle - eps)) < 1e-7);
  }
  const center = rig.pivots.r_elbow.point;
  const distance = (p, a, b) => Math.hypot(p[3 * a] - p[3 * b], p[3 * a + 1] - p[3 * b + 1], p[3 * a + 2] - p[3 * b + 2]);
  const near = Array.from({ length: mesh.positions.length / 3 }, (_, v) =>
    Math.hypot(...center.map((p, i) => p - mesh.positions[3 * v + i])) <= 100);
  const stretched = p => {
    const edges = new Set();
    for (let i = 0; i < mesh.indices.length; i++) {
      const a = mesh.indices[i], b = mesh.indices[i % 3 === 2 ? i - 2 : i + 1];
      const s = distance(mesh.positions, a, b), t = distance(p, a, b);
      if (near[a] && near[b] && s >= 0.7 && t > 3 * s && t - s > 2) edges.add(Math.min(a, b) + ':' + Math.max(a, b));
    }
    return edges.size;
  };
  for (const angle of [8, 62, 67, 145]) {
    const posture = { ...rest, r_elbow_flex: angle, r_pronation: 160 };
    const pose = body.bakeBodyPosture(rig, fixture, { posture, keep: 'pelvis' });
    const before = body.skinBodyPositions(pose.segments, original, mesh.positions);
    const posed = body.skinBodyPositions(pose.segments, delta, mesh.positions, undefined, { elbowFlexDeg: angle });
    if (angle !== 62) assert.deepEqual(posed, before);
    else {
      assert.ok(stretched(before) >= 2);
      assert.equal(stretched(posed), 0);
      assert.equal(stretched(pose.meshesById.get(id).positions), 0);
    }
  }
});

test('the right anconeus keeps its attachment weights and eases into the deep bend', () => {
  const id = 'FJ1485', mesh = inputs.meshesById.get(id);
  const weights = body.handSkinRecords(rig, new Map([[id, mesh]])).get(id);
  const original = { ...weights, anconeusDeepDelta: null };
  const frozen = [];
  for (let v = 0; v < weights.anconeusDeepDelta.length; v++) {
    if (!weights.anconeusDeepDelta[v]) frozen.push(v);
  }
  assert.ok(frozen.length >= 407);
  const edgeRatios = p => {
    const edges = new Set();
    const distance = (q, a, b) => Math.hypot(q[3 * a] - q[3 * b], q[3 * a + 1] - q[3 * b + 1], q[3 * a + 2] - q[3 * b + 2]);
    for (let i = 0; i < mesh.indices.length; i++) {
      const a = mesh.indices[i], b = mesh.indices[i % 3 === 2 ? i - 2 : i + 1];
      const size = distance(mesh.positions, a, b), drawn = distance(p, a, b);
      if (size >= 0.7 && drawn > 3 * size && drawn - size > 2) edges.add(`${Math.min(a, b)},${Math.max(a, b)}`);
    }
    return edges.size;
  };
  for (const angle of [8, 62, 112, 120, 145]) {
    const posture = { ...rest, r_elbow_flex: angle, r_pronation: 160 };
    const pose = body.bakeBodyPosture(rig, new Map([[id, mesh]]), { posture, keep: 'pelvis' });
    const opts = { elbowFlexDeg: angle };
    const before = body.skinBodyPositions(pose.segments, original, mesh.positions, null, opts);
    const after = body.skinBodyPositions(pose.segments, weights, mesh.positions, null, opts);
    const baked = pose.meshesById.get(id).positions;
    assert.ok(after.every((x, i) => Math.abs(x - baked[i]) < 0.0004));
    if (angle <= 112) assert.deepEqual(after, before);
    else assert.ok(edgeRatios(after) < edgeRatios(before));
    for (const v of frozen) assert.deepEqual(after.subarray(3 * v, 3 * v + 3), before.subarray(3 * v, 3 * v + 3));
  }
  for (const boundary of [112, 120]) {
    const e = 1e-3;
    assert.ok(Math.abs(body.anconeusDeepBendBlend(boundary + e) - body.anconeusDeepBendBlend(boundary - e)) < 1e-7);
  }
});
