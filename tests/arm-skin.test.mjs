/** The left game arm's skin on the graphics card (18 November 2026, performance): the vertex-shader rewrite
 * (patchArmSkinVertex) on Three's own standard and basic shaders, and the claim that the shader's blend is the
 * processor's: the same slots, weights and maps (ns-rig twistSkinPlan / twistPoseMaps) give the same positions as
 * skinApply when blended the way Three's skin chunk does it (4x4 matrices, four slots, identity in the unused ones). */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import(path.join(repo, 'vendor/three.module.js'));
const { patchArmSkinVertex, ARM_SKIN_MARK } = await import(path.join(repo, 'scene/src/ns-scene-three.mjs'));
const rig = await import(path.join(repo, 'scene/src/ns-rig.mjs'));

test('the skin rewrite takes Three\'s standard and basic vertex shaders, once', () => {
  for (const name of ['standard', 'basic']) {
    const vs = THREE.ShaderLib[name].vertexShader;
    const p = patchArmSkinVertex(vs);
    assert.ok(p, name);
    assert.ok(p.includes(`attribute vec3 ${ARM_SKIN_MARK};`));
    assert.ok(!p.includes('#include <skinning_vertex>'), 'Three\'s own skin is removed (it would skin twice)');
    // the posed position is set right after begin_vertex, so later lines that read `position` see it
    const at = p.indexOf('#include <begin_vertex>');
    assert.ok(p.indexOf('#define position nsSkinPos', at) > at);
    assert.ok(p.indexOf('objectNormal = nsSkinRestN;') > p.indexOf('#include <beginnormal_vertex>'));
    assert.equal(patchArmSkinVertex(p), p, 'a second patch changes nothing');
  }
  assert.equal(patchArmSkinVertex('void main() { gl_Position = vec4(0.0); }'), null);
  assert.equal(patchArmSkinVertex(null), null);
});

test('lines another patch put after begin_vertex read the skinned position', () => {
  const other = THREE.ShaderLib.standard.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvNsObj = position;');
  const p = patchArmSkinVertex(other);
  assert.ok(p.indexOf('#define position nsSkinPos') < p.indexOf('vNsObj = position;'));
});

/** Three's blend: sum over four slots of w * (M_slot * vec4(rest, 1)), in 32-bit floats. */
function shaderBlend(table, idx, wts, rest, v) {
  const f = Math.fround, out = [0, 0, 0];
  for (let j = 0; j < 4; j++) {
    const w = f(wts[4 * v + j]), o = 16 * idx[4 * v + j];
    const x = f(rest[3 * v]), y = f(rest[3 * v + 1]), z = f(rest[3 * v + 2]);
    for (let r = 0; r < 3; r++) out[r] = f(out[r] + f(w * f(f(f(f(table[o + r] * x) + f(table[o + 4 + r] * y)) + f(table[o + 8 + r] * z)) + table[o + 12 + r])));
  }
  return out;
}

test('slots, weights and maps of the twist plan give the processor\'s positions', () => {
  // a made-up arm: every segment a rotation about z by its index and a shift, rest points spread over a box
  const n = 300, S = rig.SEGMENTS, ulna = S.indexOf('ulna'), upper = S.indexOf('upperarm'), hand = S.indexOf('hand');
  const mats = new Map(S.map((s, i) => {
    const a = 0.05 * i, c = Math.cos(a), sn = Math.sin(a), k = 0.001;
    return [s, [k * c, k * sn, 0, 0, -k * sn, k * c, 0, 0, 0, 0, k, 0, 0.01 * i, -0.02 * i, 0.3, 1]];
  }));
  const rest = new Float32Array(3 * n), i0 = new Uint8Array(n), i1 = new Uint8Array(n), w0 = new Float32Array(n), w1 = new Float32Array(n), tf = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    rest[3 * v] = (v % 7) * 11 - 30; rest[3 * v + 1] = (v % 13) * 9 - 50; rest[3 * v + 2] = (v % 5) * 40 + 100;
    i0[v] = v % 3 === 0 ? ulna : hand; i1[v] = v % 2 ? upper : ulna; w0[v] = 0.25 + (v % 4) * 0.2; w1[v] = 1 - w0[v];
    tf[v] = (v % 11) / 10;
  }
  const W = { i0, i1, w0, w1, tf, twistAxis: [0, 0, 1], twistPivot: [0, 0, 120] };
  const want = rig.skinApply(mats, W, rest);
  const plan = rig.twistSkinPlan(W, n), maps = rig.twistPoseMaps(mats, W);
  const E = maps.length / 12, table = new Float32Array(16 * (E + 1));
  for (let e = 0; e < E; e++) {
    const q = 12 * e, o = 16 * e;
    table.set([maps[q], maps[q + 1], maps[q + 2], 0, maps[q + 3], maps[q + 4], maps[q + 5], 0, maps[q + 6], maps[q + 7], maps[q + 8], 0, maps[q + 9], maps[q + 10], maps[q + 11], 1], o);
  }
  table.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 16 * E);
  const idx = new Uint16Array(4 * n).fill(E), wts = new Float32Array(4 * n);
  for (let v = 0; v < n; v++) for (let j = 0; j < 3; j++) { const q = 3 * v + j; if (plan.weights[q] > 0) { idx[4 * v + j] = plan.slots[q]; wts[4 * v + j] = plan.weights[q]; } }
  let worst = 0;
  for (let v = 0; v < n; v++) {
    const g = shaderBlend(table, idx, wts, rest, v);
    for (let r = 0; r < 3; r++) worst = Math.max(worst, Math.abs(g[r] - want[3 * v + r]));
  }
  // metres: 32-bit rounding of numbers near 0.5 m is a few 1e-8 m
  assert.ok(worst < 2e-6, `largest difference ${worst} m`);
});

// ---- the body's muscles (patchBodySkinVertex, createScene bodyGpu) ----
const { patchBodySkinVertex, BODY_SKIN_MARK } = await import(path.join(repo, 'scene/src/ns-scene-three.mjs'));

test('the body skin rewrite: Three\'s standard and basic shaders, once, without reading position or normal when skinned', () => {
  for (const name of ['standard', 'basic']) {
    const p = patchBodySkinVertex(THREE.ShaderLib[name].vertexShader, 128);
    assert.ok(p, name);
    assert.ok(p.includes(`attribute vec4 ${BODY_SKIN_MARK};`));
    for (const k of ['skinbase_vertex', 'skinnormal_vertex', 'skinning_vertex']) assert.ok(!p.includes(`#include <${k}>`), k);
    // the two skinned blocks (between #ifdef USE_SKINNING and #else) read neither attribute
    const blocks = [...p.matchAll(/#ifdef USE_SKINNING\n([\s\S]*?)\n#else/g)].map(m => m[1]);
    assert.equal(blocks.length, 2);
    for (const b of blocks) { assert.ok(!/\bnormal\b/.test(b), 'no normal'); assert.ok(!/(?<!define )\bposition\b(?! nsSkinPos)/.test(b.replace('#define position nsSkinPos', '')), 'no position'); }
    assert.equal(patchBodySkinVertex(p), p, 'a second patch changes nothing');
  }
  assert.equal(patchBodySkinVertex('void main() {}'), null);
});

test('the shader\'s form of the body skin is the processor\'s (source plus lift offset turned back per bone)', () => {
  // made-up rigid maps: column-major 4x4 from an angle about an axis and a shift
  const rot = (ax, a, t) => { const [x, y, z] = ax, c = Math.cos(a), s = Math.sin(a), k = 1 - c;
    return [k * x * x + c, k * x * y + s * z, k * x * z - s * y, 0, k * x * y - s * z, k * y * y + c, k * y * z + s * x, 0, k * x * z + s * y, k * y * z - s * x, k * z * z + c, 0, t[0], t[1], t[2], 1]; };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[4 * c + r] += a[4 * k + r] * b[4 * c + k]; return o; };
  const inv = m => { const o = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1]; for (let r = 0; r < 3; r++) o[12 + r] = -(o[r] * m[12] + o[4 + r] * m[13] + o[8 + r] * m[14]); return o; };
  const ap = (m, p, w = 1) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + w * m[12 + r]);
  const n0 = Math.hypot(1, 2, 3), n1 = Math.hypot(-2, 1, 0.5);
  const Sa = rot([1 / n0, 2 / n0, 3 / n0], 0.7, [10, -20, 30]), Sb = rot([-2 / n1, 1 / n1, 0.5 / n1], -0.4, [-5, 8, 60]);
  const Ba = rot([0, 0, 1], 0.3, [1, 2, 3]), Bb = rot([0, 1, 0], -0.9, [4, -1, 2]), M = rot([1, 0, 0], 0.2, [7, 7, -7]), Mi = inv(M);
  const src = [12, -40, 300], d = [2.5, -1, 4], n = [0.6, 0.0, 0.8], wa = 0.35, wb = 0.65;
  // processor (skinCache + skinOne): q = source + bake^-1 x offset per bone, C = M^-1 x S
  const qa = src.map((v, i) => v + ap(inv(Ba), d, 0)[i]), qb = src.map((v, i) => v + ap(inv(Bb), d, 0)[i]);
  const cpu = [0, 1, 2].map(r => wa * ap(mul(Mi, Sa), qa)[r] + wb * ap(mul(Mi, Sb), qb)[r]);
  const ncpu = [0, 1, 2].map(r => wa * ap(mul(Mi, Sa), ap(inv(Ba), n, 0), 0)[r] + wb * ap(mul(Mi, Sb), ap(inv(Bb), n, 0), 0)[r]);
  // shader: M^-1 (wa (Sa src + Ra d) + wb (Sb src + Rb d)), R = S x bake^-1
  const Ra = mul(Sa, inv(Ba)), Rb = mul(Sb, inv(Bb));
  const inner = [0, 1, 2].map(r => wa * (ap(Sa, src)[r] + ap(Ra, d, 0)[r]) + wb * (ap(Sb, src)[r] + ap(Rb, d, 0)[r]));
  const gpu = ap(Mi, inner);
  const ngpu = ap(Mi, [0, 1, 2].map(r => wa * ap(Ra, n, 0)[r] + wb * ap(Rb, n, 0)[r]), 0);
  for (let r = 0; r < 3; r++) { assert.ok(Math.abs(cpu[r] - gpu[r]) < 1e-9, `position ${r}`); assert.ok(Math.abs(ncpu[r] - ngpu[r]) < 1e-12, `normal ${r}`); }
});
