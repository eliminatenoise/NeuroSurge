/** The shading normals of the decimated body meshes, evened out (ns-detail smoothNormalField; 18 November 2026, the
 * owner: "far more detail on everything"). Pure geometry on small made-up meshes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothNormalField, NORMAL_SMOOTH } from '../scene/src/ns-detail.mjs';

// a flat 6 x 6 grid in z = 0 whose normals are tilted at random by up to about 20 degrees; one seam column is duplicated
function noisySheet() {
  const P = [], I = [], N = [], K = 6;
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let j = 0; j <= K; j++) for (let i = 0; i <= K; i++) { P.push(i * 5, j * 5, 0); const x = 0.7 * rnd(), y = 0.7 * rnd(), l = Math.hypot(x, y, 1); N.push(x / l, y / l, 1 / l); }
  const at = (i, j) => j * (K + 1) + i;
  // the seam: column i = 3 again as separate vertices for the triangles right of it
  const seam = new Map();
  for (let j = 0; j <= K; j++) { seam.set(j, P.length / 3); P.push(15, j * 5, 0); const x = 0.7 * rnd(), y = 0.7 * rnd(), l = Math.hypot(x, y, 1); N.push(x / l, y / l, 1 / l); }
  for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
    const v = (ii, jj) => (ii === 3 && i === 3 ? seam.get(jj) : at(ii, jj));
    I.push(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i, j + 1));
  }
  return { p: Float32Array.from(P), ix: Uint32Array.from(I), n: Float32Array.from(N), seam, at };
}
const tilt = (n, v) => Math.acos(Math.min(1, n[3 * v + 2])) * 180 / Math.PI;

test('noisy normals on a flat sheet are evened out, positions stay, seam copies agree', () => {
  const { p, ix, n, seam, at } = noisySheet();
  const p0 = Float32Array.from(p), n0 = Float32Array.from(n);
  const mean = a => { let s = 0; for (let v = 0; v < a.length / 3; v++) s += tilt(a, v); return s / (a.length / 3); };
  const changed = smoothNormalField(p, ix, n);
  assert.ok(changed > 40, `changed ${changed}`);
  assert.deepEqual(p, p0);
  assert.ok(mean(n) < 0.5 * mean(n0), `mean tilt ${mean(n0).toFixed(1)} -> ${mean(n).toFixed(1)} degrees`);
  for (const [j, w] of seam) for (let k = 0; k < 3; k++) assert.equal(n[3 * w + k], n[3 * at(3, j) + k]);
  for (let v = 0; v < n.length / 3; v++) assert.ok(Math.abs(Math.hypot(n[3 * v], n[3 * v + 1], n[3 * v + 2]) - 1) < 1e-5);
});

test('a real edge keeps its turn: the two faces of a right-angled fold are not averaged across it', () => {
  // two strips meeting at x = 0 at 90 degrees: z = 0 for x <= 0 and x = 0 for z >= 0 (the edge vertices are shared)
  const P = [], I = [], N = [];
  for (let j = 0; j <= 3; j++) { P.push(-10, j * 5, 0, -5, j * 5, 0, 0, j * 5, 0, 0, j * 5, 5, 0, j * 5, 10); }
  for (let j = 0; j <= 3; j++) N.push(0, 0, 1, 0, 0, 1, -Math.SQRT1_2, 0, Math.SQRT1_2, -1, 0, 0, -1, 0, 0);
  const at = (i, j) => 5 * j + i;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) I.push(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i + 1, j));
  const n = Float32Array.from(N);
  smoothNormalField(Float32Array.from(P), Uint32Array.from(I), n, NORMAL_SMOOTH);
  // the ring next to the edge leans toward it by less than 25 degrees (averaged across the fold it would be 45), and two
  // steps away each face keeps its own normal
  assert.ok(n[3 * at(1, 1) + 2] > Math.cos(25 * Math.PI / 180), `flat face next to the edge ${n[3 * at(1, 1) + 2]}`);
  assert.ok(n[3 * at(3, 1)] < -Math.cos(25 * Math.PI / 180), `upright face next to the edge ${n[3 * at(3, 1)]}`);
  assert.ok(n[3 * at(0, 1) + 2] > 0.99 && n[3 * at(4, 1)] < -0.99, `far from the edge ${n[3 * at(0, 1) + 2]} ${n[3 * at(4, 1)]}`);
});

test('refuses quietly what it cannot use', () => {
  assert.equal(smoothNormalField(new Float32Array(0), new Uint32Array(0), new Float32Array(0)), 0);
  assert.equal(smoothNormalField(new Float32Array(9), new Uint32Array([0, 1, 2]), new Float32Array(9), { passes: 0 }), 0);
});

// two long rods end to end with a 3 mm gap between their ends (a joint), as closed boxes of 2 mm triangles
function rod(x0, x1, name) {
  const P = [], I = [], s = 2, nx = Math.round((x1 - x0) / s), ny = 5, at = new Map();
  const add = (x, y, z) => { const k = `${x},${y},${z}`; if (!at.has(k)) { at.set(k, P.length / 3); P.push(x, y, z); } return at.get(k); };
  // a box x0..x1 by 0..10 by 0..10: six faces of quads
  const face = (fn, nu, nv) => { for (let u = 0; u < nu; u++) for (let v = 0; v < nv; v++) { const a = add(...fn(u, v)), b = add(...fn(u + 1, v)), c = add(...fn(u + 1, v + 1)), d = add(...fn(u, v + 1)); I.push(a, b, c, a, c, d); } };
  face((u, v) => [x0 + u * s, v * s, 0], nx, ny); face((u, v) => [x0 + u * s, v * s, 10], nx, ny);
  face((u, v) => [x0 + u * s, 0, v * s], nx, ny); face((u, v) => [x0 + u * s, 10, v * s], nx, ny);
  face((u, v) => [x0, u * s, v * s], ny, ny); face((u, v) => [x1, u * s, v * s], ny, ny);
  return { id: name, name, positions: Float32Array.from(P), indices: Uint32Array.from(I) };
}

test('cartilage caps where another bone comes near, the bone\'s end around them, none on the shaft; costal cartilage whole; skull left out', async () => {
  const { boneEndWeights, BONE_ENDS } = await import('../scene/src/ns-detail.mjs');
  const a = rod(0, 100, 'Right femur'), b = rod(103, 203, 'Right tibia'), cc = rod(300, 340, 'Right third costal cartilage'), sk = rod(-60, -3, 'Frontal bone');
  const W = boneEndWeights([a, b, cc, sk]);
  assert.ok(!W.has('Frontal bone'), 'a skull bone is left out');
  assert.ok(W.get('Right third costal cartilage').every(v => v === 1));
  const w = W.get('Right femur'), p = a.positions;
  let joint = 0, shaft = 0, nj = 0, ns = 0, endNear = 0, nen = 0;
  for (let v = 0; v < p.length / 3; v++) {
    const x = p[3 * v];
    if (x === 100) { joint += w[2 * v]; nj++; }
    if (x <= 50) { shaft += w[2 * v] + w[2 * v + 1]; ns++; }
    if (x >= 100 - BONE_ENDS.endNearMm && x < 100) { endNear += w[2 * v + 1]; nen++; }
  }
  assert.ok(joint / nj > 0.6, `cap on the joint face ${joint / nj}`);
  assert.equal(shaft, 0, 'nothing on the shaft (the far end touches no bone: the frontal bone is skipped)');
  assert.ok(endNear / nen > 0.9, `end region next to the cap ${endNear / nen}`);
});
