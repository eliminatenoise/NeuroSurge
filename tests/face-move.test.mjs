/** Face movements you can see (20 November 2026; package FACE, ns-face-move).
 *
 * The owner, Message 204: "make sure there's clear movement for each brain activation area. And you can clearly
 * identify what type of movement it is for each area." Before, the face areas' movements only changed colour.
 *
 * Pure numbers on the face packet's muscles as the page prepares them (tools/page-body.mjs, the source frame): every
 * shape is worked out, moves the face by a visible amount and no more than a sensible one, has no NaN, folds (almost)
 * no triangle, moves the part it is named for the right way, and differs from every other shape; the face at rest is
 * exactly its resting geometry. The amounts are a display choice (exaggerated on purpose), not measured anatomy.
 * Run: node --test tests/face-move.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as FM from '../scene/src/ns-face-move.mjs';
import { loadPageBody } from '../tools/page-body.mjs';

const page = await loadPageBody();
const meshes = new Map();
const eyes = {};
for (const [id, m] of page.meshesById) {
  if (/^zf-/.test(id)) meshes.set(id, { positions: m.positions instanceof Float32Array ? m.positions : Float32Array.from(m.positions), indices: m.indices });
}
// the eyeballs' centres (the scleras of the head packet), as the scene hands them over
for (const id of ['FJ1317', 'FJ1368']) {
  const m = page.meshesById.get(id); if (!m) continue;
  const P = m.positions, c = [0, 0, 0], n = P.length / 3;
  for (let i = 0; i < P.length; i += 3) { c[0] += P[i] / n; c[1] += P[i + 1] / n; c[2] += P[i + 2] / n; }
  eyes[c[0] > 0 ? 'l' : 'r'] = c;
}
const rig = FM.buildFaceMoves(meshes, { eyes });
const only = key => Object.fromEntries(FM.FACE_SHAPE_KEYS.map(k => [k, k === key ? 1 : 0]));
const moved = (id, w) => { const base = meshes.get(id).positions, out = new Float32Array(base.length); FM.applyFaceMoves(rig, id, w, base, out); return out; };
/** Head-frame coordinates (out toward the subject's left, up, forward) of point k of a flat array. */
const head = (P, k) => {
  const f = rig.frame, d = [P[k] - f.origin[0], P[k + 1] - f.origin[1], P[k + 2] - f.origin[2]];
  return [d[0] * f.x[0] + d[1] * f.x[1] + d[2] * f.x[2], d[0] * f.up[0] + d[1] * f.up[1] + d[2] * f.up[2], d[0] * f.fwd[0] + d[1] * f.fwd[1] + d[2] * f.fwd[2]];
};
/** Mean head-frame displacement of the vertices of a muscle that pass `sel` (rest head coordinates). */
const meanMove = (id, key, sel = () => true) => {
  const base = meshes.get(id).positions, out = moved(id, only(key)), s = [0, 0, 0];
  let n = 0;
  for (let k = 0; k < base.length; k += 3) { const a = head(base, k); if (!sel(a)) continue; const b = head(out, k); s[0] += b[0] - a[0]; s[1] += b[1] - a[1]; s[2] += b[2] - a[2]; n++; }
  return n ? s.map(v => v / n) : null;
};

test('every shape is worked out for the face packet, each moves the face by a visible and sensible amount', () => {
  assert.equal(rig.ok, true, rig.note);
  assert.equal(FM.FACE_SHAPE_KEYS.length, 15);
  for (const key of FM.FACE_SHAPE_KEYS) {
    const mm = rig.maxMm[key];
    assert.ok(mm >= 6 && mm <= 20, `${key}: largest movement ${mm} mm`);
  }
  // only the face's expression muscles move; the chewing muscles, the scalp's back and the neck sheet never do
  for (const id of rig.meshes.keys()) assert.ok(FM.FACE_MOVING_MUSCLES.includes(FM.faceMuscleOf(id).name), id);
  for (const id of ['zf-temporalis-r', 'zf-masseter-superficial-l', 'zf-platysma-r', 'zf-occipitalis-l']) assert.equal(rig.meshes.has(id), false, id);
});

test('no NaN anywhere; the face at rest is exactly its resting geometry; the strength is linear', () => {
  for (const [id, rec] of rig.meshes) {
    for (const sh of rec.shapes.values()) {
      for (const v of sh.d) assert.ok(Number.isFinite(v), id);
      if (sh.dn) for (const v of sh.dn) assert.ok(Number.isFinite(v), id);
      for (const i of sh.idx) assert.ok(i < rec.count, id);
    }
    const base = meshes.get(id).positions;
    const rest = moved(id, Object.fromEntries(FM.FACE_SHAPE_KEYS.map(k => [k, 0])));
    assert.deepEqual(rest, base, `${id} at rest`);
    assert.equal(FM.applyFaceMoves(rig, id, null, base, new Float32Array(base.length)), 0);
    const key = rec.keys[0], full = moved(id, only(key)), half = moved(id, { ...only(key), [key]: 0.5 });
    for (let k = 0; k < base.length; k++) assert.ok(Math.abs((half[k] - base[k]) * 2 - (full[k] - base[k])) < 1e-3, `${id} ${key} linear`);
  }
  // normals given: unit length after the move
  const id = 'zf-orbicularis-oris-l', base = meshes.get(id).positions, N = new Float32Array(base.length);
  for (let k = 0; k < N.length; k += 3) N[k + 2] = 1;
  const out = new Float32Array(base.length), outN = new Float32Array(base.length);
  FM.applyFaceMoves(rig, id, only('purse'), base, out, N, outN);
  for (let k = 0; k < outN.length; k += 3) assert.ok(Math.abs(Math.hypot(outN[k], outN[k + 1], outN[k + 2]) - 1) < 1e-4);
});

test('the strengths follow the face display joints (both sides of 0) and the leading mouth corner', () => {
  // (21 November 2026, SEEMOVE: a shape is whole at its movement's end, 15 degrees; it was three quarters there)
  const w = FM.faceShapeWeights({ brow_raise: 15, eye_close: -20, smile: 20, upper_lip: -5, lip_purse: NaN });
  assert.equal(w.browUp, 1); assert.equal(w.frown, 0);
  assert.equal(FM.faceShapeWeights({ brow_raise: 7.5 }).browUp, 0.5);
  assert.equal(w.eyesWide, 1); assert.equal(w.eyesShut, 0);
  assert.equal(w.smileR, 1); assert.equal(w.smileL, 1); assert.equal(w.cornerDownR, 0);
  assert.equal(w.upperLipUp, 0); assert.equal(w.purse, 0); assert.equal(w.stretch, 0);
  // the right hemisphere's lower-face area moves mainly the LEFT corner (ns-bodymap: contralateral)
  assert.deepEqual(FM.faceSidesFor('rh'), { r: FM.FACE_MOVE.otherCorner, l: 1 });
  assert.deepEqual(FM.faceSidesFor('lh'), { r: 1, l: FM.FACE_MOVE.otherCorner });
  const one = FM.faceShapeWeights({ smile: -20 }, FM.faceSidesFor('lh'));
  assert.equal(one.cornerDownR, 1); assert.equal(one.cornerDownL, FM.FACE_MOVE.otherCorner);
  assert.equal(FM.faceWeightsKey(FM.faceShapeWeights({})), '');
  assert.notEqual(FM.faceWeightsKey(one), '');
  // switched off: nothing moves
  assert.ok(Object.values(FM.faceShapeWeights({ brow_raise: 20 }, null, { ...FM.FACE_MOVE, on: false })).every(v => v === 0));
});

test('each shape moves its part the way the movement goes', () => {
  const mk = rig.marks, K = mk.corner;
  const near = (p, q, r) => a => Math.hypot(a[0] - p[0], a[1] - p[1], a[2] - p[2]) < r;
  // the brows go up; a frown pulls the inner brows down and toward the middle
  assert.ok(meanMove('zf-frontalis-r', 'browUp', a => a[1] < mk.eye.r[1] + 30)[1] > 7);
  const fr = meanMove('zf-corrugator-supercilii-r', 'frown');
  assert.ok(fr[1] < -3 && fr[0] > 2, `frown ${fr}`); // (the right side: toward the middle is +x)
  // the eyes shut: in the middle of each eye the upper lid comes down to the lower lid
  for (const s of ['r', 'l']) {
    const id = `zf-orbicularis-oculi-palpebral-${s}`, base = meshes.get(id).positions, e = mk.eye[s];
    const gap = P => { let up = Infinity, lo = -Infinity; for (let k = 0; k < P.length; k += 3) { const a = head(P, k); if (Math.abs(head(base, k)[0] - e[0]) > 2) continue; const dv = a[1] - e[1]; if (head(base, k)[1] > e[1]) up = Math.min(up, dv); else lo = Math.max(lo, dv); } return up - lo; };
    const g0 = gap(base), g1 = gap(moved(id, only('eyesShut'))), g2 = gap(moved(id, only('eyesWide')));
    assert.ok(g0 > 9 && g1 < 1.5, `${s}: opening ${g0.toFixed(1)} -> shut ${g1.toFixed(1)} mm`);
    assert.ok(g2 > g0 + 4, `${s}: opening ${g0.toFixed(1)} -> wide ${g2.toFixed(1)} mm`);
  }
  // a smile takes its corner up, out and back; a pull-down takes it down
  for (const s of ['r', 'l']) {
    const out = s === 'r' ? -1 : 1, sm = meanMove('zf-orbicularis-oris-' + s, s === 'r' ? 'smileR' : 'smileL', near(K[s], K[s], 3));
    assert.ok(sm[1] > 7 && sm[0] * out > 3 && sm[2] < -1, `smile ${s} ${sm}`);
    const dn = meanMove('zf-orbicularis-oris-' + s, s === 'r' ? 'cornerDownR' : 'cornerDownL', near(K[s], K[s], 3));
    assert.ok(dn[1] < -7, `corner down ${s} ${dn}`);
    // the other corner stays (a one-sided shape)
    const o = s === 'r' ? 'l' : 'r', other = meanMove('zf-orbicularis-oris-' + o, s === 'r' ? 'smileR' : 'smileL', near(K[o], K[o], 3));
    assert.ok(Math.hypot(...other) < 0.5, `smile ${s} leaves the other corner ${other}`);
  }
  // purse: the corners come in, the lips forward; stretch: the corners go out
  const pr = meanMove('zf-orbicularis-oris-l', 'purse', near(K.l, K.l, 3)), st = meanMove('zf-orbicularis-oris-l', 'stretch', near(K.l, K.l, 3));
  assert.ok(pr[0] < -6 && pr[2] > 1, `purse ${pr}`); assert.ok(st[0] > 5, `stretch ${st}`);
  const mid = a => Math.abs(a[0]) < 6;
  assert.ok(meanMove('zf-orbicularis-oris-l', 'purse', mid)[2] > 5);
  // the lips: upper up, lower up and out (pout), lower down
  const upper = a => Math.abs(a[0]) < 10 && a[1] > mk.mouth.upMargin, lower = a => Math.abs(a[0]) < 10 && a[1] < mk.mouth.loMargin;
  assert.ok(meanMove('zf-orbicularis-oris-r', 'upperLipUp', upper)[1] > 4);
  assert.ok(Math.abs(meanMove('zf-orbicularis-oris-r', 'upperLipUp', lower)[1]) < 0.3);
  const po = meanMove('zf-orbicularis-oris-r', 'pout', lower);
  assert.ok(po[1] > 2.5 && po[2] > 3, `pout ${po}`);
  assert.ok(meanMove('zf-orbicularis-oris-r', 'lowerLipDown', lower)[1] < -4);
  assert.ok(Math.abs(meanMove('zf-orbicularis-oris-r', 'lowerLipDown', upper)[1]) < 0.3);
  // the nose: wrinkled up; the nostril wings out
  assert.ok(meanMove('zf-nasalis-r', 'noseWrinkle')[1] > 3);
  const fl = meanMove('zf-nasalis-l', 'nostrilFlare', a => a[1] < mk.eye.l[1] - 22);
  assert.ok(fl[0] > 2.5, `flare ${fl}`);
});

test('two different face movements look different', () => {
  // the displacement fields of every pair of shapes (all face muscles, full strength) are far from parallel
  const field = key => {
    const parts = [];
    for (const id of meshes.keys()) { if (!rig.meshes.has(id)) continue; const base = meshes.get(id).positions, out = moved(id, only(key)); for (let k = 0; k < base.length; k++) parts.push(out[k] - base[k]); }
    return parts;
  };
  const F = Object.fromEntries(FM.FACE_SHAPE_KEYS.map(k => [k, field(k)]));
  for (let i = 0; i < FM.FACE_SHAPE_KEYS.length; i++) for (let j = i + 1; j < FM.FACE_SHAPE_KEYS.length; j++) {
    const a = F[FM.FACE_SHAPE_KEYS[i]], b = F[FM.FACE_SHAPE_KEYS[j]];
    let ab = 0, aa = 0, bb = 0;
    for (let k = 0; k < a.length; k++) { ab += a[k] * b[k]; aa += a[k] * a[k]; bb += b[k] * b[k]; }
    const cos = ab / Math.sqrt(aa * bb);
    assert.ok(cos < 0.75, `${FM.FACE_SHAPE_KEYS[i]} vs ${FM.FACE_SHAPE_KEYS[j]}: cos ${cos.toFixed(2)}`);
  }
});

test('no shape tears or folds the meshes at its peak (at most a few slivers among some 55 000 triangles)', () => {
  const tri = (P, I, t) => { const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2]; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
  for (const key of FM.FACE_SHAPE_KEYS) {
    let flips = 0, torn = 0;
    for (const [id, m] of meshes) {
      if (!rig.meshes.has(id)) continue;
      const out = moved(id, only(key)), I = m.indices;
      for (let t = 0; t < I.length; t += 3) {
        const n0 = tri(m.positions, I, t), n1 = tri(out, I, t), a0 = Math.hypot(...n0) / 2, a1 = Math.hypot(...n1) / 2;
        if (a0 < 0.15) continue; // (fibre slivers under 0.15 mm²)
        if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0) flips++;
        if (a1 > 8 * a0) torn++;
      }
    }
    assert.ok(flips <= 40, `${key}: ${flips} triangles turned over`);
    assert.ok(torn <= 20, `${key}: ${torn} triangles stretched over 8 times`);
  }
});

test('a body without the face packet, or with broken meshes, moves nothing and does not throw', () => {
  const none = FM.buildFaceMoves(new Map([['FJ1234', new Float32Array(9)]]));
  assert.equal(none.ok, false); assert.equal(none.meshes.size, 0);
  const bad = FM.buildFaceMoves(new Map([...meshes].map(([id, m]) => [id, id === 'zf-orbicularis-oris-r' ? { positions: Float32Array.from(m.positions, (v, k) => (k === 4 ? NaN : v)), indices: m.indices } : m])));
  assert.equal(bad.ok, true); assert.equal(bad.meshes.has('zf-orbicularis-oris-r'), false);
  assert.equal(FM.applyFaceMoves(none, 'zf-frontalis-r', only('browUp'), new Float32Array(3), new Float32Array(3)), 0);
});
