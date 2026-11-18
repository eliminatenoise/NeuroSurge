/** The trained build (18 November 2026, package BULK; the owner: "bulkier with the muscles, especially for the limbs ...
 * a bodybuilder aesthetic"; "wider wrists, wider ankles, wider feet, wider hands, wider forearms, wider forelegs";
 * "fingers and toes should never be spiky like knives, but potentially even chunky"; "naturalistic stacking deformation
 * during muscle contraction"). The cases check the rules of ns-body BODY_BULK, DIGIT_PADS and MUSCLE_SWELL on made-up
 * shapes and on the game's own body loaded from disk; they establish what the display rules compute, never a real body. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = await import(path.join(repo, 'scene/src/ns-body.mjs'));
const R = B.BODY_BULK;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = a => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
// a unit vector square to d (not unique; any will do for a point beside an axis)
const square = d => { const u = sub(d, [0, 0, 0]), l = len(u); const v = Math.abs(u[0] / l) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const cl = len(c); return c.map(x => x / cl); };

test('belly profile: nothing at the joints, all at the belly; the angular weight takes some off toward the trunk', () => {
  const b = R.arm.upper.belly;
  assert.equal(B.bulkBelly(b[0], b), 0);
  assert.equal(B.bulkBelly(b[2], b), 0);
  assert.equal(B.bulkBelly(1.2, b), 0);
  assert.ok(Math.abs(B.bulkBelly(b[1], b) - 1) < 1e-9);
  const U = R.arm.upper;
  assert.ok(B.bulkAngle(0, U.lobes, U.medial) > B.bulkAngle(270, U.lobes, U.medial), 'the front (biceps) grows more than the side facing the trunk');
});

test('limb field: a muscle swells away from its bone by the stated factor at the belly, nothing at the joint; bones of the upper arm do not move', () => {
  const chain = B.bulkLimbChain('arm', 'r'), [S, E] = chain.pts, d = sub(E, S), L = len(d), u = d.map(x => x / L), n = square(u);
  const field = B.bulkLimbField(chain, {});
  const t = R.arm.upper.belly[1], c = lerp(S, E, t);
  // with no bone map r0 = 0: the displacement is bulk x ang x rho
  const p = Float32Array.from([...c.map((x, k) => x + 30 * n[k])]), q = new Float32Array(3);
  field.apply(p, false, q);
  const moved = len(sub([...q], [...p]));
  const ax = field.axes[0], rx = n, th = Math.atan2(rx[0] * ax.o[0] + rx[1] * ax.o[1] + rx[2] * ax.o[2], rx[0] * ax.f[0] + rx[1] * ax.f[1] + rx[2] * ax.f[2]) * 180 / Math.PI;
  const want = R.arm.upper.bulk * B.bulkAngle(th < 0 ? th + 360 : th, R.arm.upper.lobes, R.arm.upper.medial) * 30;
  assert.ok(Math.abs(moved - want) < 0.05 * want + 0.05, `belly moved ${moved.toFixed(2)} mm, rule says ${want.toFixed(2)}`);
  // straight away from the axis
  const dir = sub([...q], [...p]), cosA = (dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2]) / (len(dir) || 1);
  assert.ok(cosA > 0.999, 'the swell is straight out from the axis');
  // at the shoulder joint nothing moves; a bone vertex of the upper arm does not move
  const j = Float32Array.from(S.map((x, k) => x + 25 * n[k])); field.apply(j, false, q); assert.ok(len(sub([...q], [...j])) < 1e-6);
  field.apply(p, true, q); assert.ok(len(sub([...q], [...p])) < 1e-6, 'bones are not bulked');
});

test('wider far ends: the forearm and the shin are scaled across their axis (bones too), not at the elbow / knee; both sides alike', () => {
  for (const kind of ['arm', 'leg']) {
    const F = R[kind].fore, fr = B.bulkLimbChain(kind, 'r'), fl = B.bulkLimbChain(kind, 'l');
    const fieldR = B.bulkLimbField(fr, {}), fieldL = B.bulkLimbField(fl, {});
    const [, E, W] = fr.pts, d = sub(W, E), n = square(d);
    const at = (t, r) => Float32Array.from(lerp(E, W, t).map((x, k) => x + r * n[k]));
    const q = new Float32Array(3);
    // a bone vertex 10 mm from the axis in the middle of the far range: scaled by the rule's factor (blend-free part)
    const p = at(0.7, 10); fieldR.apply(p, true, q);
    const want = F.widen + (F.end - F.widen) * (0.7 - F.widenTo) / (1 - F.widenTo);
    assert.ok(Math.abs(len(sub([...q], [...p])) - (want - 1) * 10) < 0.02, `${kind}: x${(1 + len(sub([...q], [...p])) / 10).toFixed(3)} against x${want.toFixed(3)}`);
    // just below the elbow / knee (inside widenFrom) nothing changes
    const j = at(F.widenFrom * 0.5, 10); fieldR.apply(j, true, q); assert.ok(len(sub([...q], [...j])) < 0.3, `${kind}: the joint end keeps its size`);
    // the left limb: the same factor at the same place of its own chain (the left arm's chain is the right one mirrored,
    // so there the result is the exact mirror image; the legs have their own joint centres, a few millimetres apart)
    const [, El, Wl] = fl.pts, nl = square(sub(Wl, El)), pl = Float32Array.from(lerp(El, Wl, 0.7).map((x, k) => x + 10 * nl[k])), ql = new Float32Array(3);
    fieldL.apply(pl, true, ql);
    assert.ok(Math.abs(len(sub([...ql], [...pl])) - (want - 1) * 10) < 0.02, `${kind}: the left side takes the same factor`);
    if (kind === 'arm') { const pm = Float32Array.from([-p[0], p[1], p[2]]); fieldR.apply(p, true, q); fieldL.apply(pm, true, ql); assert.ok(Math.abs(ql[0] + q[0]) < 1e-3 && Math.abs(ql[1] - q[1]) < 1e-3 && Math.abs(ql[2] - q[2]) < 1e-3, 'left arm = mirrored right arm'); }
  }
});

test('digit pads: a closed rounded sleeve round each phalanx that reaches past its tip (no point left bare)', () => {
  // a made-up last phalanx: a tapered rod 24 mm long along -z, ending in a point
  const pos = [];
  for (let k = 0; k <= 12; k++) { const z = -2 * k, r = 4 * (1 - k / 13); for (let a = 0; a < 8; a++) pos.push(r * Math.cos(a * Math.PI / 4), r * Math.sin(a * Math.PI / 4), z); }
  pos.push(0, 0, -26);
  const pads = B.digitPadMeshes([{ id: 'X', name: 'distal phalanx of right index finger', segment: 'r_index_dp', positions: Float32Array.from(pos) }], { distal: [0, 0, -1], palmar: [0, -1, 0] }, { ...B.DIGIT_PADS, on: true });
  assert.equal(pads.length, 1);
  // 19 November 2026 (the owner: bony fingertips, thin shafts and thick ends): the game makes no sleeves any more
  assert.equal(B.DIGIT_PADS.on, false);
  assert.equal(B.digitPadMeshes([{ id: 'X', name: 'distal phalanx of right index finger', segment: 'r_index_dp', positions: Float32Array.from(pos) }], { distal: [0, 0, -1], palmar: [0, -1, 0] }).length, 0);
  const { positions: P, indices: I } = pads[0];
  // closed: every edge is shared by exactly two triangles
  const edges = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = a < b ? `${a},${b}` : `${b},${a}`; edges.set(k, (edges.get(k) || 0) + 1); }
  assert.ok([...edges.values()].every(c => c === 2), 'the sleeve is a closed surface');
  let zMin = Infinity; for (let i = 2; i < P.length; i += 3) zMin = Math.min(zMin, P[i]);
  assert.ok(zMin < -26 - B.DIGIT_PADS.tipMm + 1.5, `the pulp reaches ${(-26 - zMin).toFixed(1)} mm past the bone's tip`);
  // every bone vertex of the shaft lies inside the sleeve: the sleeve at that height is wider than the bone
  for (let k = 2; k <= 11; k++) {
    const z = -2 * k; let rMin = Infinity;
    for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 2] - z) < 1.2) rMin = Math.min(rMin, Math.hypot(P[i], P[i + 1]));
    if (rMin < Infinity) assert.ok(rMin > 4 * (1 - k / 13), `at ${z} mm the sleeve (${rMin.toFixed(1)}) is outside the bone`);
  }
  assert.equal(B.digitPadName('Distal phalanx of right index finger'), 'right index finger pad');
});

test('contraction swell amount: none at rest, full when active and short, below zero when stretched', () => {
  const O = B.MUSCLE_SWELL;
  assert.equal(B.muscleSwellTarget(0.08, 0), 0);
  assert.equal(B.muscleSwellTarget(1, 0.3), O.max);
  assert.ok(B.muscleSwellTarget(0.08, -0.2) < 0 && B.muscleSwellTarget(0.08, -1) === O.min);
  assert.ok(B.muscleSwellTarget(0.5, 0.05) > B.muscleSwellTarget(0.3, 0.05));
});

test('on the game body: the far ends of the limbs and the joints keep their place, the bellies grow, both sides alike, the pads are rigged to their digits', async () => {
  process.env.NS_SOURCE_BULK = '1';
  const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
  const { body, inputs } = await loadBody(repo);
  delete process.env.NS_SOURCE_BULK;
  const o = body.bulkBody(inputs.entries, inputs.meshesById);
  const moved = (id, pred = () => true) => { const a = inputs.meshesById.get(id).positions, b = o.meshesById.get(id).positions; let mx = 0; for (let i = 0; i < a.length; i += 3) if (pred(a[i], a[i + 1], a[i + 2])) mx = Math.max(mx, Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1], b[i + 2] - a[i + 2])); return mx; };
  const J = B.REFERENCE_JOINTS, near = (pt, r) => (x, y, z) => Math.hypot(x - pt[0], y - pt[1], z - pt[2]) < r;
  // the bones at the shoulder and the hip are untouched; at the elbow and the knee less than a millimetre
  assert.equal(moved('FJ3368', near(J.r_glenohumeral.point, 40)), 0, 'humerus head');
  assert.equal(moved('FJ3365'), 0, 'femur (the thigh gets its fullness from the muscles)');
  assert.ok(moved('FJ3387', near(J.r_knee.point, 30)) < 1, 'the top of the tibia');
  // a belly grew by several millimetres: vastus lateralis, the biceps; the two thighs alike within 10 %
  const vlR = moved('FJ1442'), vlL = moved('FJ1442M');
  assert.ok(vlR > 8 && vlL > 8, `vastus lateralis grew ${vlR.toFixed(1)} / ${vlL.toFixed(1)} mm`);
  assert.ok(Math.abs(vlR - vlL) < 0.1 * Math.max(vlR, vlL), 'both thighs alike');
  assert.ok(moved('FJ1478') > 5, 'long head of the biceps');
  // the far ends are wider: the malleoli move apart
  assert.ok(moved('FJ3366', (x, y, z) => z < 20) > 2, 'the lateral malleolus moves out (wider ankle)');
  // 19 November 2026: no sleeves are made (DIGIT_PADS.on false): the finger and toe bones show
  assert.equal(o.entries.filter(e => e && e.soft_tissue).length, 0);
  // the chest is left flat: pectoralis major is not changed by the bulk
  assert.equal(moved('FJ1464'), 0);
});
