/** The shoulder skin of the arm's muscles (user Messages 36 and 48: the left shoulder muscle jutted out, and at a
 * far-left look the joint looked torn open). The muscles near the shoulder used to follow the humerus rigidly, so the
 * deltoid's origin left the shoulder girdle when the upper arm swung. The rule checked here (ns-rig SHOULDER_SKIN,
 * shoulderFrames, twistSkinPlan, skinApply; ns-arm chestMatrix): a vertex at the top of the zone follows the chest
 * frame of the pose, a vertex at its lower end follows the upper arm, the frames between take up the swing and the turn
 * step by step and all keep the joint centre in place, and a pose without a chest frame is skinned as before.
 * Pure parts only: no arm rig, model, scene or browser; every frame below is a supplied matrix. These cases establish
 * which frames the skin blends, never how the shoulder looks on screen, measured muscle paths or biology.
 * Run: node tests/shoulder-skin.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-rig.mjs', import.meta.url);
const rig = await import(target.href);
const { chestMatrix } = await import(new URL('../scene/src/ns-arm.mjs', import.meta.url).href);
const { SEGMENTS, SHOULDER_SKIN, TWIST_TABLE_STEPS, shoulderFrames, twistSkinPlan, skinApply } = rig;
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}

const K = TWIST_TABLE_STEPS, DEG = Math.PI / 180, MM = 0.001;
const UP = SEGMENTS.indexOf('upperarm'), ULNA = SEGMENTS.indexOf('ulna');
const SLOT0 = SEGMENTS.length + K + 1;   // the shoulder frames come after the segments and the twist table
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** rotation about a unit axis, 3x3 row-major */
function rot3([x, y, z], th) {
  const c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const mul3 = (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]; return o; };
const apply3 = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
/** 4x4 column-major mesh matrix from a row-major 3x3, a uniform scale and a translation */
const mat = (R, s, t) => Float64Array.of(s * R[0], s * R[3], s * R[6], 0, s * R[1], s * R[4], s * R[7], 0, s * R[2], s * R[5], s * R[8], 0, t[0], t[1], t[2], 1);
const at16 = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
const at12 = (m, o, p) => [m[o] * p[0] + m[o + 3] * p[1] + m[o + 6] * p[2] + m[o + 9], m[o + 1] * p[0] + m[o + 4] * p[1] + m[o + 7] * p[2] + m[o + 10], m[o + 2] * p[0] + m[o + 5] * p[1] + m[o + 8] * p[2] + m[o + 11]];
const dir12 = (m, o, v) => [m[o] * v[0] + m[o + 3] * v[1] + m[o + 6] * v[2], m[o + 1] * v[0] + m[o + 4] * v[1] + m[o + 7] * v[2], m[o + 2] * v[0] + m[o + 5] * v[1] + m[o + 8] * v[2]];
const twelve = M => [M[0], M[1], M[2], M[4], M[5], M[6], M[8], M[9], M[10], M[12], M[13], M[14]];
const angleDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) / DEG;
const near = (a, b, tol, what) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= tol, `${what}: ${a[i]} against ${b[i]} at ${i}`); };
const ease = t => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

const AXIS = unit([0.16, 0.04, -0.99]);  // about the rest direction shoulder -> elbow (source frame)
const PIVOT = [160, -80, 1315];          // about the rest joint centre (source millimetres)
const JOINT = [0.12, -0.21, -0.33];      // where the pose has the joint centre (camera metres)
const SWING_AXIS = unit(cross(AXIS, [0.2, 1, 0.1]));
const CHEST_ROT = rot3(unit([0.3, 0.9, -0.2]), 0.7);
/** A pose: the chest frame, and the upper arm = chest x swing x turn about the joint centre. */
function pose(swingDeg, turnDeg, { chest = true, mirrored = false } = {}) {
  const Ru = mul3(CHEST_ROT, mul3(rot3(SWING_AXIS, swingDeg * DEG), rot3(AXIS, turnDeg * DEG)));
  const place = R => { const q = apply3(R, PIVOT); return [JOINT[0] - MM * q[0], JOINT[1] - MM * q[1], JOINT[2] - MM * q[2]]; };
  const M = new Map();
  M.set('upperarm', mat(Ru, MM, place(Ru)));
  if (chest) { const Rc = mirrored ? mul3(CHEST_ROT, [-1, 0, 0, 0, 1, 0, 0, 0, 1]) : CHEST_ROT; M.set('chest', mat(Rc, MM, place(Rc))); }
  M.set('ulna', mat(I3, MM, [0, 0, 0]));
  M.set('forearm_tw2', mat(I3, MM, [0, 0, 0]));
  return M;
}
const frames = M => { const maps = new Float64Array(12 * (K + 1)); return { maps, report: shoulderFrames(M, AXIS, PIVOT, maps) }; };
const allUpperArm = (maps, M, what) => { const up = twelve(M.get('upperarm')); for (let k = 0; k <= K; k++) near(Array.from(maps.subarray(12 * k, 12 * k + 12)), up, 0, `${what}, entry ${k}`); };

check('the zone runs from above the joint centre to the lower end of the deltoid, and its numbers cannot be changed', () => {
  assert.ok(Object.isFrozen(SHOULDER_SKIN) && Object.isFrozen(SHOULDER_SKIN.fadeDeg));
  assert.ok(SHOULDER_SKIN.s0Mm < 0 && SHOULDER_SKIN.swingMm > 0 && SHOULDER_SKIN.swingMm <= SHOULDER_SKIN.twistMm);
  assert.ok(SHOULDER_SKIN.fadeDeg[0] > 90 && SHOULDER_SKIN.fadeDeg[0] < SHOULDER_SKIN.fadeDeg[1] && SHOULDER_SKIN.fadeDeg[1] < 180);
});

check('a pose without a chest frame gives the upper-arm frame at every place (the skin from before)', () => {
  const M = pose(70, 35, { chest: false }), { maps, report } = frames(M);
  allUpperArm(maps, M, 'no chest');
  assert.deepEqual(report, { swingDeg: null, turnDeg: null, fade: 0 });
});

check('with the arm at rest against the chest every frame is the upper-arm frame', () => {
  const M = pose(0, 0), { maps, report } = frames(M), up = twelve(M.get('upperarm'));
  for (let k = 0; k <= K; k++) near(Array.from(maps.subarray(12 * k, 12 * k + 12)), up, 1e-12, `rest, entry ${k}`);
  assert.ok(Math.abs(report.swingDeg) < 1e-6 && Math.abs(report.turnDeg) < 1e-6 && report.fade === 1);
});

check('the top of the zone follows the chest, the lower end follows the upper arm', () => {
  const M = pose(70, 35), { maps, report } = frames(M);
  near(Array.from(maps.subarray(0, 12)), twelve(M.get('chest')), 1e-12, 'entry 0 against the chest frame');
  near(Array.from(maps.subarray(12 * K, 12 * K + 12)), twelve(M.get('upperarm')), 0, 'last entry against the upper arm');
  assert.ok(Math.abs(report.swingDeg - 70) < 1e-6, `swing ${report.swingDeg}`);
  assert.ok(Math.abs(report.turnDeg - 35) < 1e-6, `turn ${report.turnDeg}`);
  assert.equal(report.fade, 1);
});

check('every frame keeps the joint centre where the pose has it and is a rotation at the arm\'s scale', () => {
  const { maps } = frames(pose(70, 35));
  for (let k = 0; k <= K; k++) {
    const o = 12 * k;
    near(at12(maps, o, PIVOT), JOINT, 1e-12, `joint centre, entry ${k}`);
    const c0 = [maps[o], maps[o + 1], maps[o + 2]], c1 = [maps[o + 3], maps[o + 4], maps[o + 5]], c2 = [maps[o + 6], maps[o + 7], maps[o + 8]];
    for (const c of [c0, c1, c2]) assert.ok(Math.abs(Math.hypot(c[0], c[1], c[2]) - MM) < 1e-12, `scale, entry ${k}`);
    assert.ok(Math.abs(dot(c0, c1)) < 1e-15 && Math.abs(dot(c0, c2)) < 1e-15 && Math.abs(dot(c1, c2)) < 1e-15, `square axes, entry ${k}`);
    assert.ok(dot(cross(c0, c1), c2) > 0, `not mirrored, entry ${k}`);
  }
});

check('the swing and the turn are taken up step by step along the zone, eased at both ends', () => {
  const M = pose(70, 35), { maps } = frames(M), chest = twelve(M.get('chest'));
  const zone = (SHOULDER_SKIN.swingMm - SHOULDER_SKIN.s0Mm) / (SHOULDER_SKIN.twistMm - SHOULDER_SKIN.s0Mm);
  const axisAtChest = dir12(chest, 0, AXIS);
  let last = -1;
  for (let k = 0; k <= K; k++) {
    const x = k / K, a = ease(x / zone), b = ease(x);
    const swung = angleDeg(dir12(maps, 12 * k, AXIS), axisAtChest);
    assert.ok(Math.abs(swung - 70 * a) < 1e-6, `swing at entry ${k}: ${swung} against ${70 * a}`);
    assert.ok(swung >= last - 1e-9, `the swing never goes back, entry ${k}`);
    last = swung;
    const R = mul3(CHEST_ROT, mul3(rot3(SWING_AXIS, 70 * a * DEG), rot3(AXIS, 35 * b * DEG)));
    near(Array.from(maps.subarray(12 * k, 12 * k + 9)), twelve(mat(R, MM, [0, 0, 0])).slice(0, 9), 1e-12, `frame at entry ${k}`);
  }
  assert.ok(Math.abs(last - 70) < 1e-6);
});

check('a swing between the two fade angles is split in part, and past the second the skin is rigid again', () => {
  const [f0, f1] = SHOULDER_SKIN.fadeDeg, mid = (f0 + f1) / 2;
  const M = pose(mid, 0), { maps, report } = frames(M);
  assert.ok(Math.abs(report.fade - 0.5) < 1e-9, `fade ${report.fade}`);
  const swung = angleDeg(dir12(maps, 0, AXIS), dir12(twelve(M.get('chest')), 0, AXIS));
  assert.ok(Math.abs(swung - mid / 2) < 1e-6, `entry 0 swung ${swung}`);
  near(at12(maps, 0, PIVOT), JOINT, 1e-12, 'joint centre while fading');
  const P = pose(f1 + 4, 20), past = frames(P);
  allUpperArm(past.maps, P, 'past the fade');
  assert.deepEqual(past.report, { swingDeg: null, turnDeg: null, fade: 0 });
});

check('a mirrored chest frame is refused: the skin stays rigid with the upper arm', () => {
  const M = pose(70, 35, { mirrored: true }), { maps, report } = frames(M);
  allUpperArm(maps, M, 'mirrored chest');
  assert.equal(report.swingDeg, null);
});

const TWIST = { twistAxis: [0, 0, 1], twistPivot: [0, 0, 0] };
const weightsOf = (rows, extra = {}) => ({
  i0: Uint8Array.from(rows.map(r => r.i0)), i1: Uint8Array.from(rows.map(r => r.i1 ?? r.i0)),
  w0: Float32Array.from(rows.map(r => r.w0 ?? 1)), w1: Float32Array.from(rows.map(r => r.w1 ?? 0)),
  tf: Float32Array.from(rows.map(r => r.tf ?? 0)), sf: Float32Array.from(rows.map(r => r.sf ?? 1)),
  shoulderAxis: AXIS, shoulderPivot: PIVOT, ...TWIST, ...extra
});

check('a vertex in the zone blends the two frames around its place; one outside keeps its upper-arm slot', () => {
  const w = weightsOf([{ i0: UP, sf: 0 }, { i0: UP, sf: 0.5 }, { i0: UP, sf: 1 }, { i0: UP, i1: ULNA, w0: 0.5, w1: 0.5, sf: 0.25 }, { i0: ULNA }]);
  const p = twistSkinPlan(w, 5), slot = v => Array.from(p.slots.subarray(3 * v, 3 * v + 3)), wt = v => Array.from(p.weights.subarray(3 * v, 3 * v + 3));
  assert.deepEqual([slot(0).slice(0, 2), wt(0)], [[SLOT0, SLOT0 + 1], [1, 0, 0]]);
  assert.deepEqual([slot(1).slice(0, 2), wt(1)], [[SLOT0 + K / 2, SLOT0 + K / 2 + 1], [1, 0, 0]]);
  assert.deepEqual([slot(2)[0], wt(2)], [UP, [1, 0, 0]]);
  assert.deepEqual([slot(3), wt(3)], [[SLOT0 + K / 4, SLOT0 + K / 4 + 1, ULNA], [0.5, 0, 0.5]]);
  assert.deepEqual([slot(4)[0], wt(4)], [ULNA, [1, 0, 0]]);
  assert.equal(p.shoulder, true);
  assert.equal(p.used[UP], 1, 'the shoulder frames need the upper-arm matrix');
});

check('weights without shoulder places are planned as before', () => {
  const w = weightsOf([{ i0: UP }, { i0: UP, i1: ULNA, w0: 0.5, w1: 0.5 }]);
  delete w.sf;
  const p = twistSkinPlan(w, 2);
  assert.deepEqual(Array.from(p.slots.subarray(0, 1)), [UP]);
  assert.deepEqual([Array.from(p.slots.subarray(3, 5)), Array.from(p.weights.subarray(3, 6))], [[UP, ULNA], [0.5, 0.5, 0]]);
  assert.equal(p.shoulder, false);
});

check('a vertex cannot be in the shoulder zone and in the forearm\'s twist at once (three frames at most)', () => {
  const w = weightsOf([{ i0: UP, i1: ULNA, w0: 0.5, w1: 0.5, sf: 0.5, tf: 0.5 }]);
  assert.throws(() => twistSkinPlan(w, 1), /two twisted influences/);
});

const REST = Float32Array.from([...PIVOT, PIVOT[0] + 100 * AXIS[0], PIVOT[1] + 100 * AXIS[1], PIVOT[2] + 100 * AXIS[2], PIVOT[0] + 30, PIVOT[1] - 10, PIVOT[2] + 20]);
const restPoint = v => [REST[3 * v], REST[3 * v + 1], REST[3 * v + 2]];
const skinned = (M, w) => { const out = skinApply(M, w, REST); return v => [out[3 * v], out[3 * v + 1], out[3 * v + 2]]; };

check('skinned: the joint centre stays, the top of the zone goes with the chest, the lower end with the upper arm', () => {
  const M = pose(70, 35), w = weightsOf([{ i0: UP, sf: 0.3 }, { i0: UP, sf: 1 }, { i0: UP, sf: 0 }]), out = skinned(M, w);
  near(out(0), JOINT, 1e-6, 'joint centre');
  near(out(1), at16(M.get('upperarm'), restPoint(1)), 1e-6, 'lower end');
  near(out(2), at16(M.get('chest'), restPoint(2)), 1e-6, 'top of the zone');
  const rigidTop = at16(M.get('upperarm'), restPoint(2));
  assert.ok(Math.hypot(out(2)[0] - rigidTop[0], out(2)[1] - rigidTop[1], out(2)[2] - rigidTop[2]) > 0.01, 'the top of the zone no longer rides the upper arm');
});

check('skinned as before when the pose has no chest frame or the weights have no shoulder places', () => {
  const rows = [{ i0: UP, sf: 0.3 }, { i0: UP, sf: 1 }, { i0: UP, sf: 0 }];
  const bare = pose(70, 35, { chest: false }), a = skinned(bare, weightsOf(rows));
  for (let v = 0; v < 3; v++) near(a(v), at16(bare.get('upperarm'), restPoint(v)), 1e-6, `no chest, vertex ${v}`);
  const M = pose(70, 35), plain = weightsOf(rows);
  delete plain.sf;
  const b = skinned(M, plain);
  for (let v = 0; v < 3; v++) near(b(v), at16(M.get('upperarm'), restPoint(v)), 1e-6, `no places, vertex ${v}`);
});

check('the chest frame of a pose puts the rest joint centre where the arm has it, at the trunk\'s orientation', () => {
  const identity = Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const C = chestMatrix(identity, JOINT, PIVOT);
  near(at16(C, PIVOT), JOINT, 1e-12, 'joint centre');
  const up = at16(C, [PIVOT[0], PIVOT[1], PIVOT[2] + 1000]), left = at16(C, [PIVOT[0] + 1000, PIVOT[1], PIVOT[2]]);
  near([up[0] - JOINT[0], up[1] - JOINT[1], up[2] - JOINT[2]], [0, 1, 0], 1e-12, 'one metre up the body is one metre up');
  near([left[0] - JOINT[0], left[1] - JOINT[1], left[2] - JOINT[2]], [-1, 0, 0], 1e-12, 'one metre to the body\'s left');
  const turned = mat(rot3([0, 1, 0], 0.5), 1, [0, 0, 0]), T = chestMatrix(turned, JOINT, PIVOT);
  near(at16(T, PIVOT), JOINT, 1e-12, 'joint centre with the trunk turned');
  const upT = at16(T, [PIVOT[0], PIVOT[1], PIVOT[2] + 1000]);
  near([upT[0] - JOINT[0], upT[1] - JOINT[1], upT[2] - JOINT[2]], [0, 1, 0], 1e-12, 'a turn about the upright keeps up as up');
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'shoulder-skin',
  module: target.href,
  cases: results.length,
  failed: failed.length,
  results,
  scope: 'Pure checks of the frames the shoulder skin blends (ns-rig shoulderFrames, twistSkinPlan, skinApply) and of the chest frame of an arm pose (ns-arm chestMatrix), on supplied matrices and hand-made weights. No arm rig, model, scene or browser is built: these cases do not establish how the shoulder looks, which vertices are in the zone, or anything about real anatomy.'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
