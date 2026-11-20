/** Longer limbs, a flatter chest and a lower torso that comes forward (ns-body-shape, 20 November 2026; the owner: "Let's
 * make the limbs longer" and "a smaller and much flatter chest essentially, and a more observable bottom torso"). The
 * fields on their own, then the game's body as the page prepares it (tools/load-body.mjs): the rig's joints follow, a
 * muscle from the trunk onto a limb moves only on the limb, the entries' own numbers follow. Display choices on one
 * reference body; nothing here is measured anatomy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_SHAPE, limbLengthField, trunkShapeField, shapeRamp } from '../scene/src/ns-body-shape.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = await import(path.join(repo, 'scene/src/ns-body.mjs'));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

test('the ramp: nothing before the zone, all of the gain after it, smooth and rising in between', () => {
  const z = [0.15, 0.85];
  assert.equal(shapeRamp(0.1, z), 0); assert.equal(shapeRamp(0.15, z), 0); assert.equal(shapeRamp(0.9, z), 1); assert.equal(shapeRamp(0.85, z), 1);
  let last = 0;
  for (let f = 0.15; f <= 0.85; f += 0.001) { const r = shapeRamp(f, z); assert.ok(r >= last - 1e-12); assert.ok(r - last < 0.004, 'no step'); last = r; }
});

for (const kind of ['arm', 'leg']) {
  test(`the ${kind}: each long segment gains its share, the joints are carried whole, nothing above the root moves`, () => {
    const chain = B.bulkLimbChain(kind, 'r'), [P0, P1, P2] = chain.pts, S = BODY_SHAPE.limbs[kind];
    const f = limbLengthField(kind, chain.pts), D = [0, 0, 0], at = p => add(p, f.at(p[0], p[1], p[2], D));
    // the joint centres move by the gains before them, so each segment is `upper` / `fore` times as long
    assert.ok(Math.abs(dist(at(P0), at(P1)) / dist(P0, P1) - S.upper) < 1e-9);
    assert.ok(Math.abs(dist(at(P1), at(P2)) / dist(P1, P2) - S.fore) < 1e-9);
    assert.deepEqual(at(P0), P0, 'the root joint does not move');
    // round the middle joint everything moves by the same amount (the joint keeps its shape)
    const d1 = sub3(at(P1), P1);
    for (const o of [[8, 0, 0], [0, 12, 0], [0, 0, 15], [-10, -6, -12]]) { const p = add(P1, o); assert.ok(dist(sub3(at(p), p), d1) < 1e-9, `near the middle joint ${o}`); }
    // a point above the root (the trunk side) does not move
    const above = add(P0, [0, 0, 40]);
    assert.deepEqual(at(above), above);
  });
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

test('the foot is made longer below the ankle only, not the shin in front of it', () => {
  const leg = B.bulkLimbChain('leg', 'r'), f = limbLengthField('leg', leg.pts), D = [0, 0, 0], A = leg.pts[2];
  // a point 60 mm in front of the ankle and 40 below it moves forward more than the ankle; one 40 above it (the shin's
  // tendons in front of the ankle) only as the ankle does
  const ankle = f.at(...A, [0, 0, 0]).slice();
  const toe = f.at(A[0], A[1] - 60, A[2] - 40, [0, 0, 0]), shin = f.at(A[0], A[1] - 60, A[2] + 40, [0, 0, 0]);
  assert.ok(toe[1] < ankle[1] - 1, 'forward (-y) beyond the ankle');
  assert.ok(Math.abs(shin[1] - f.at(A[0], A[1], A[2] + 40, D)[1]) < 1e-9, 'not in front of the shin');
});

test('the trunk: the chest comes back toward the spine, the belly forward; the spine, the shoulders and the head do not move; front to back order is kept', () => {
  const T = trunkShapeField(), R = BODY_SHAPE.trunk;
  assert.ok(T.at(0, -210, 1250) > 25, 'the breastbone comes back');
  assert.ok(T.at(0, -215, 980) < -15, 'the belly wall comes forward');
  assert.equal(T.at(0, -40, 1200), 0, 'behind the line in front of the spine: nothing');
  assert.equal(T.at(0, -200, R.chest.zMm[0] + 1), 0, 'above the collar: nothing');
  assert.equal(T.at(-200, -150, 1250), 0, 'out at the shoulders: nothing');
  // order: for many columns, a point in front of another stays in front of it
  for (let x = -180; x <= 180; x += 15) for (let z = 820; z <= 1400; z += 20) {
    let prev = -Infinity;
    for (let y = -260; y <= 40; y += 2) { const q = y + T.at(x, y, z); assert.ok(q > prev, `order at ${x}, ${y}, ${z}`); prev = q; }
  }
  // the rule undone gives the source back
  for (const p of [[0, -210, 1250], [60, -180, 1150], [30, -215, 980], [-90, -120, 1300]]) { const y = p[1] + T.at(...p); assert.ok(Math.abs(T.sourceY(p[0], y, p[2]) - p[1]) < 1e-5); }
});

const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { inputs, rig } = await loadBody(repo);
// the same body before the bulk and the shape (tools/load-body.mjs NS_SOURCE_BULK)
const SOURCE = await (async () => { process.env.NS_SOURCE_BULK = '1'; try { return (await loadBody(repo)).inputs; } finally { delete process.env.NS_SOURCE_BULK; } })();

test('on the game body: the rig\'s limbs are as long as the rule says, both sides alike', () => {
  const P = k => rig.pivots[k].point, J = B.REFERENCE_JOINTS, S = BODY_SHAPE.limbs;
  const rows = [['r_glenohumeral', 'r_elbow', S.arm.upper], ['r_elbow', 'r_wrist', S.arm.fore], ['r_hip', 'r_knee', S.leg.upper], ['r_knee', 'r_ankle', S.leg.fore], ['l_hip', 'l_knee', S.leg.upper], ['l_knee', 'l_ankle', S.leg.fore]];
  for (const [a, b, k] of rows) {
    const got = dist(P(a), P(b)) / dist(J[a].point, J[b].point);
    assert.ok(Math.abs(got - k) < 0.02, `${a} - ${b}: ${got.toFixed(3)} times the source (rule ${k})`);
  }
  assert.ok(Math.abs(dist(P('r_hip'), P('r_ankle')) - dist(P('l_hip'), P('l_ankle'))) < 5, 'the two legs alike');
});

test('on the game body: a muscle from the trunk onto a limb moves on the limb only', () => {
  const bulkOnly = B.bulkBody(SOURCE.entries, SOURCE.meshesById, B.BODY_BULK, null).meshesById; // the same body without the shape
  const moved = (id, pred) => { const a = bulkOnly.get(id).positions, b = inputs.meshesById.get(id).positions; let mx = 0; for (let i = 0; i < a.length; i += 3) if (pred(a[i], a[i + 1], a[i + 2])) mx = Math.max(mx, Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1], b[i + 2] - a[i + 2])); return mx; };
  // latissimus dorsi: its part on the back stays (the trunk rule leaves the back alone too); its end on the upper arm
  // bone goes down with the longer upper arm
  const lat = 'zm-latissimus-dorsi-r';
  assert.ok(inputs.meshesById.get(lat), 'latissimus dorsi is in the body');
  assert.ok(moved(lat, (x, y, z) => z < 1250 && x > -120) < 1, 'its part on the back (medial of the arm) does not move');
  assert.ok(moved(lat, (x, y, z) => x < -160 && z < 1260) > 3, 'its end on the arm moves');
  // the long head of biceps femoris (from the sitting bone): its top stays, its lower end goes down with the knee
  const bf = 'FJ1395';
  assert.ok(inputs.meshesById.get(bf), 'the long head of biceps femoris is in the body');
  assert.ok(moved(bf, (x, y, z) => z > 760) < 2, 'its top on the sitting bone hardly moves');
  assert.ok(moved(bf, (x, y, z) => z < 450) > 30, 'its lower end moves with the knee');
  // 21 November 2026 (review B1): the arm's two-joint muscles (from the shoulder blade, over the elbow) move whole with the
  // arm; their inner faces hang beside the ribs and the shoulder blade near the elbow and were held back, torn
  const el = (P, u, v) => Math.hypot(P[3 * u] - P[3 * v], P[3 * u + 1] - P[3 * v + 1], P[3 * u + 2] - P[3 * v + 2]);
  for (const id of ['FJ1512', 'FJ1479']) { // short head of biceps brachii, long head of triceps brachii
    const a = bulkOnly.get(id).positions, b = inputs.meshesById.get(id).positions, I = inputs.meshesById.get(id).indices;
    let worst = 0;
    for (let t = 0; t < I.length; t += 3) for (const [u, v] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const la = el(a, u, v); if (la > 0.5) worst = Math.max(worst, el(b, u, v) / la); }
    assert.ok(worst < 1.6, `${id}: no edge stretched more than the shaft (${worst.toFixed(2)} times)`);
  }
  // and no limb muscle's surface turns over
  let flipped = 0;
  const nrm = (P, I, t) => { const [i0, i1, i2] = [3 * I[t], 3 * I[t + 1], 3 * I[t + 2]]; const ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2], vx = P[i2] - P[i0], vy = P[i2 + 1] - P[i0 + 1], vz = P[i2 + 2] - P[i0 + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
  for (const e of inputs.entries) {
    if (!B.bodyShapeLimbOf(e)) continue;
    const A = bulkOnly.get(e.element_id), M = inputs.meshesById.get(e.element_id);
    if (!A || !M || !M.indices) continue;
    for (let t = 0; t < M.indices.length; t += 3) { const p = nrm(A.positions, M.indices, t), q = nrm(M.positions, M.indices, t); if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] < 0) flipped++; }
  }
  assert.ok(flipped <= 6, `${flipped} triangles of the limbs' muscles turned over`);
});

test('on the game body: the entries\' own numbers follow (the hand\'s centroid stays by the wrist)', () => {
  const hand = rig.segments.r_hand.restCentroid, wrist = rig.pivots.r_wrist.point, srcWrist = B.REFERENCE_JOINTS.r_wrist.point;
  assert.ok(srcWrist[2] - wrist[2] > 60, 'the wrist came down');
  assert.ok(dist(hand, wrist) < 60, `the hand's centroid ${hand.map(v => v.toFixed(0))} is by the wrist ${wrist.map(v => v.toFixed(0))}`);
});

test('the left game arm is made longer by the same rule (bulkArmAssets)', async () => {
  const fs = await import('node:fs/promises'), { createHash } = await import('node:crypto');
  const app = await import(path.join(repo, 'scene/src/ns-app.mjs')), assets = await import(path.join(repo, 'scene/src/ns-assets.mjs'));
  const ex = path.join(repo, 'scene/example/');
  const io = { fetchText: u => fs.readFile(path.resolve(ex, u), 'utf8'), fetchBytes: async u => new Uint8Array(await fs.readFile(path.resolve(ex, u))),
    sha256Hex: async t => createHash('sha256').update(t, 'utf8').digest('hex'), sha256HexBytes: async b => createHash('sha256').update(b).digest('hex') };
  const packetBases = { 'pov-demo-assets': '../../packets/pov-demo-assets/', 'pov-demo-assets-r2': '../../packets/pov-demo-assets-r2/' };
  const ins = await app.loadInputs({ manifestUrl: '../../inputs/MESH-MANIFEST.json', packetBases, movementMapUrl: '../../inputs/MOVEMENT-MAP.json', ...io });
  const roleOf = id => assets.SEGMENT_OF[id] || null;
  const plain = B.bulkArmAssets(ins.assets.arm, roleOf, B.BODY_BULK, null), shaped = B.bulkArmAssets(ins.assets.arm, roleOf);
  const S = BODY_SHAPE.limbs.arm, L = shaped.report.shape.lengthsMm;
  assert.ok(Math.abs(L.after[0] / L.before[0] - S.upper) < 1e-3 && Math.abs(L.after[1] / L.before[1] - S.fore) < 1e-3);
  // the lowest point of the arm (a fingertip) comes down by about the two gains
  const low = m => { let z = Infinity; for (const [, r] of m) { const p = r && r.mesh && r.mesh.positions; if (p) for (let i = 2; i < p.length; i += 3) if (p[i] < z) z = p[i]; } return z; };
  const drop = low(plain.arm) - low(shaped.arm), gain = (S.upper - 1) * L.before[0] + (S.fore - 1) * L.before[1];
  assert.ok(drop > 0.9 * gain && drop < 1.3 * gain, `the fingertips came down ${drop.toFixed(0)} mm (the long segments gained ${gain.toFixed(0)})`);
});

test('the balls a held hand is kept out of follow the flatter chest and the forward belly (review B2 / B6)', async () => {
  const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
  const T = trunkShapeField(), S = app.TRUNK_KEEP_OUT_SOURCE, K = app.TRUNK_KEEP_OUT;
  assert.equal(K.length, S.length);
  for (let i = 0; i < K.length; i++) {
    const [x, y, z] = S[i].at, front = y - 1000 * S[i].r;
    assert.equal(K[i].seg, S[i].seg); assert.equal(K[i].r, S[i].r); assert.equal(K[i].at[0], x); assert.equal(K[i].at[2], z);
    assert.ok(Math.abs(K[i].at[1] - 1000 * K[i].r - (front + T.at(x, front, z))) < 0.06, `${S[i].seg} ${S[i].at}: its front moved with the rule`);
  }
  // the chest's balls came back, the belly's went forward, the head's did not move
  assert.ok(K[5].at[1] > S[5].at[1] + 30 && K[12].at[1] < S[12].at[1] - 10 && K[0].at[1] === S[0].at[1]);
});

test('bulkBody hands back the meshes before the shape too (for the body vessels, review B8): same vertices, unmoved', () => {
  const o = B.bulkBody(SOURCE.entries, SOURCE.meshesById), plain = B.bulkBody(SOURCE.entries, SOURCE.meshesById, B.BODY_BULK, null);
  assert.ok(o.unshaped instanceof Map);
  for (const id of ['FJ3349', 'FJ1442', 'zm-latissimus-dorsi-r']) { // right radius, vastus lateralis, latissimus dorsi
    const u = o.unshaped.get(id).positions, s = o.meshesById.get(id).positions, p = plain.meshesById.get(id).positions;
    assert.equal(u.length, s.length);
    assert.deepEqual(Array.from(u), Array.from(p), `${id}: the unshaped copy is the bulk alone`);
  }
});
