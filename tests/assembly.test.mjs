/** The loading picture (ns-assembly): its small OBJ reader and the part kinds it takes from the packet manifests.
 * Pure software checks; no browser, no worker, no picture. The loading picture verifies nothing itself: the game's
 * own loader still checks every file. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseObjBytes, meshNormalsAndCentre, brainBeat, BRAIN_BEAT } from '../scene/src/ns-assembly-core.mjs';
import { assemblyKindOf, assemblyKindsOfManifest, assemblyKindOfUrl, ASSEMBLY_EXPECTED_FILES } from '../scene/src/ns-assembly.mjs';

const bytes = s => new TextEncoder().encode(s);

test('the OBJ reader takes vertices and faces, fans polygons and skips everything else', () => {
  const m = parseObjBytes(bytes('# note\nv 0 0 0\nv 1.5 0 0\nv 1.5 2e0 0\nv 0 -2.25 1E-1\nvn 0 0 1\nf 1//1 2//1 3//1\nf 1/1/1 2/2/1 3/3/1 4/4/1\ng x\n'));
  assert.deepEqual(Array.from(m.positions), [0, 0, 0, 1.5, 0, 0, 1.5, 2, 0, 0, -2.25, Math.fround(0.1)]);
  assert.deepEqual(Array.from(m.indices), [0, 1, 2, 0, 1, 2, 0, 2, 3]);
  const n = meshNormalsAndCentre(m.positions, m.indices);
  assert.equal(n.normals.length, 12);
  assert.deepEqual(n.centre.map(v => Math.round(v * 1000) / 1000), [0.75, -0.125, 0.05]);
});

test('the OBJ reader refuses a file without a usable triangle or with a face that points outside it', () => {
  assert.equal(parseObjBytes(bytes('v 0 0 0\nv 1 0 0\n')), null);
  assert.equal(parseObjBytes(bytes('v 0 0 0\nv 1 0 0\nv 0 1 0\n')), null);
  assert.equal(parseObjBytes(bytes('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9\n')), null);
  assert.equal(parseObjBytes(bytes('')), null);
});

test('the OBJ reader agrees with a real atlas file on its vertex and triangle counts', () => {
  const man = JSON.parse(fs.readFileSync(new URL('../inputs/FULLBODY-MESH-MANIFEST.json', import.meta.url), 'utf8'));
  const e = man.assets[0];
  const m = parseObjBytes(new Uint8Array(fs.readFileSync(new URL(`../packets/bodyparts3d-fullbody-r1/${e.path}`, import.meta.url))));
  assert.equal(m.positions.length / 3, e.vertices);
  assert.equal(m.indices.length / 3, e.triangles);
  for (let k = 0; k < 3; k++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = k; i < m.positions.length; i += 3) { lo = Math.min(lo, m.positions[i]); hi = Math.max(hi, m.positions[i]); }
    assert.ok(Math.abs(lo - e.bounds_min[k]) < 0.01 && Math.abs(hi - e.bounds_max[k]) < 0.01);
  }
});

test('part kinds come from the manifests the game loads', () => {
  assert.equal(assemblyKindOf({ groups: ['brain', 'brain_motor_landmark'] }), 'strip');
  assert.equal(assemblyKindOf({ groups: ['brain'] }), 'brain');
  assert.equal(assemblyKindOf({ kind: 'bone', tissue: 'eye' }), 'eye');
  assert.equal(assemblyKindOf({ groups: ['left_upper_limb_bone'] }), 'bone');
  assert.equal(assemblyKindOf({ kind: 'muscle' }), 'muscle');
  assert.equal(assemblyKindOf({}), null);
  assert.equal(assemblyKindOfUrl('../../packets/bodyparts3d-head-r1/meshes/FJ3274.obj'), 'bone');
  assert.equal(assemblyKindOfUrl('../../packets/face-muscles-r1/meshes/zf-frontalis-r.obj'), 'muscle');
  let files = 0;
  const count = {};
  for (const p of ['inputs/FULLBODY-MESH-MANIFEST.json', 'inputs/MESH-MANIFEST.json', 'packets/face-muscles-r1/FACE-MESH-MANIFEST.json',
    'packets/bodyparts3d-head-r1/HEAD-MESH-MANIFEST.json', 'packets/missing-muscles-r1/MISSING-MUSCLES-MESH-MANIFEST.json']) {
    const k = assemblyKindsOfManifest(JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')));
    assert.ok(k.size > 0, `${p} gives kinds`);
    files += k.size;
    for (const v of k.values()) count[v] = (count[v] || 0) + 1;
  }
  assert.equal(files, ASSEMBLY_EXPECTED_FILES, 'the progress bar length is the number of files the manifests list');
  assert.ok(count.bone > 150 && count.muscle > 250 && count.brain === 57 && count.strip === 2 && count.eye === 6);
  assert.equal(assemblyKindsOfManifest(null).size, 0);
  assert.equal(assemblyKindsOfManifest({ assets: 'x' }).size, 0);
});

test('the loading picture\'s brain beat is a quick rise and a slower fall, once per beat, on a slow breathing wave', () => {
  let peakAt = 0, peak = 0;
  for (let i = 0; i < 920; i++) { const v = brainBeat(i / 1000).beat; assert.ok(v >= 0 && v <= 1); if (v > peak) { peak = v; peakAt = i / 1000; } }
  assert.ok(peak > 0.99 && peakAt > 0.08 && peakAt < 0.2, 'the top of the beat comes early (a quick rise)');
  assert.ok(brainBeat(0).beat < 0.01, 'a beat starts from rest');
  assert.ok(brainBeat(0.6).beat < 0.2, 'and has mostly fallen away by two thirds of the beat');
  assert.ok(Math.abs(brainBeat(0.3).beat - brainBeat(0.3 + BRAIN_BEAT.beatS).beat) < 1e-9, 'it repeats every beat');
  assert.ok(Math.abs(brainBeat(BRAIN_BEAT.breathS / 4).breath - 1) < 1e-9 && Math.abs(brainBeat(0).breath) < 1e-9);
  assert.ok(BRAIN_BEAT.swell <= 0.02 && BRAIN_BEAT.breathSwell <= 0.02, 'a small swell, not a wobble');
});
