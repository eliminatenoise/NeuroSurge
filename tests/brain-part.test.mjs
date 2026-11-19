/** The two halves of the brain drawn apart (19 November 2026).
 *
 * The owner: "let's center the motor strip on either side of the head of the mirror body. So maybe we'll keep a bigger
 * gap between the hemispheres. So it looks like almost hair coming out of either side of the mirror body's head."
 *
 * Pure numbers: which atlas meshes move and which stay (ns-brain-part), that a half only MOVES (the same areas of the
 * same sizes come out of the segmentation), and that the game's loader hands on new arrays and leaves the loaded ones
 * alone (ns-app partedBrainAssets). No browser, no pixels: where the mirror body's head stands in the start picture is
 * in the package notes and in tests/brain-turn.test.mjs (the framing's ceiling). A display choice, not anatomy.
 * Run: node --test tests/brain-part.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { HEMI_GAP, hemisphereSideOf, partedPositions, backShareAt } from '../scene/src/ns-brain-part.mjs';
import * as NB from '../scene/src/ns-brain.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';
import { partedBrainAssets } from '../scene/src/ns-app.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('inputs/MESH-MANIFEST.json', root), 'utf8'));
const brainEntries = manifest.assets.filter(a => (a.groups || []).includes('brain'));
function readObj(rel) {
  const P = [], I = [];
  for (const line of readFileSync(new URL(rel, root), 'utf8').split('\n')) {
    if (line[0] === 'v' && line[1] === ' ') { const a = line.split(/\s+/); P.push(Number(a[1]), Number(a[2]), Number(a[3])); }
    else if (line[0] === 'f' && line[1] === ' ') { const a = line.trim().split(/\s+/).slice(1).map(s => parseInt(s, 10) - 1); for (let k = 1; k + 1 < a.length; k++) I.push(a[0], a[k], a[k + 1]); }
  }
  return { positions: Float32Array.from(P), indices: Uint32Array.from(I) };
}
let cache = null;
function atlasBrain() {
  if (cache) return cache;
  cache = brainEntries.map(a => {
    const rel = existsSync(new URL(`packets/pov-demo-assets/${a.path}`, root)) ? `packets/pov-demo-assets/${a.path}` : `packets/pov-demo-assets-r2/${a.path}`;
    return { id: a.element_id, name: a.embedded_source_name, ...readObj(rel) };
  });
  return cache;
}
const xRange = p => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); } return [lo, hi]; };

test('each half is drawn 6 mm from where the atlas has it; the parts of the middle are named and stay', () => {
  assert.equal(HEMI_GAP.eachMm, 6);
  assert.equal(brainEntries.length, 59);
  const sides = brainEntries.map(a => hemisphereSideOf({ name: a.embedded_source_name }));
  assert.equal(sides.filter(s => s === 1).length, 19, 'nineteen meshes of the left half');
  assert.equal(sides.filter(s => s === -1).length, 19, 'nineteen meshes of the right half');
  assert.equal(sides.filter(s => s === 0).length, 21, 'twenty-one parts of the middle');
  // every mesh that moves lies wholly on its own side of the atlas midline (about x = -0.6 mm), so no mesh is torn
  brainEntries.forEach((a, i) => {
    if (sides[i] === 1) assert.ok(a.bounds_min[0] >= -1, `${a.embedded_source_name} is on the left`);
    if (sides[i] === -1) assert.ok(a.bounds_max[0] <= 0, `${a.embedded_source_name} is on the right`);
  });
  // what stays: the brainstem, the cerebellum, the hypothalamus and the midline's ventricles, whichever half-name they carry
  const stays = name => hemisphereSideOf({ name }) === 0;
  for (const n of ['Pons', 'Midbrain', 'Medulla oblongata', 'Cerebellum', 'Hypothalamus', 'Tuber cinereum', 'Third ventricle', 'Fourth ventricle', 'Cerebral aqueduct', 'Pineal body', 'Habenula', 'Left superior colliculus', 'Right inferior colliculus']) assert.ok(stays(n), n);
  // what moves: everything of a cerebral half, the deep parts too (they lie inside its white matter)
  assert.equal(hemisphereSideOf({ name: 'Left lateral ventricle' }), 1);
  assert.equal(hemisphereSideOf({ name: 'Right internal capsule' }), -1);
  assert.equal(hemisphereSideOf({ name: 'White matter of right cerebral hemisphere' }), -1);
  assert.equal(hemisphereSideOf({ name: 'Left precentral gyrus' }), 1);
});

test('a mesh without a side in its name goes by where its points lie; one across the midline stays', () => {
  assert.equal(hemisphereSideOf({ name: 'FJ0001', positions: [2, 0, 0, 30, 5, 5] }), 1);
  assert.equal(hemisphereSideOf({ name: 'FJ0002', positions: [-2, 0, 0, -30, 5, 5] }), -1);
  assert.equal(hemisphereSideOf({ name: 'FJ0003', positions: [-8, 0, 0, 9, 5, 5] }), 0);
  assert.equal(hemisphereSideOf({ name: '', positions: [] }), 0);
  assert.equal(hemisphereSideOf(null), 0);
});

test('parting copies: the loaded array is never written, and nothing is copied when nothing moves', () => {
  // (points in front of the back of the motor strip, where a half takes its whole step: atlas y < HEMI_GAP.back.fullToYMm)
  const p = Float32Array.from([1, -80, 3, 4, -50, 6]);
  const out = partedPositions(p, 1);
  assert.notEqual(out, p);
  assert.ok(out instanceof Float32Array);
  assert.deepEqual([...out], [7, -80, 3, 10, -50, 6]);
  assert.deepEqual([...p], [1, -80, 3, 4, -50, 6]);
  assert.deepEqual([...partedPositions(p, -1, 2.5)], [-1.5, -80, 3, 1.5, -50, 6]);
  assert.equal(partedPositions(p, 0), p);
  assert.equal(partedPositions(p, 1, 0), p);
});

test('20 November 2026: the gap closes toward the back of the brain, so it does not end in an open notch behind the cerebellum', () => {
  const { fullToYMm, noneFromYMm } = HEMI_GAP.back;
  // the whole step in front of the strip's back edge (the precentral gyri end at atlas y -39), none at the occipital poles
  assert.ok(fullToYMm >= -39 && noneFromYMm <= 10 && noneFromYMm > fullToYMm);
  assert.equal(backShareAt(-100), 1);
  assert.equal(backShareAt(fullToYMm), 1);
  assert.equal(backShareAt(noneFromYMm), 0);
  assert.equal(backShareAt(10), 0);
  // smooth and falling all the way
  let last = 1;
  for (let y = fullToYMm; y <= noneFromYMm; y += 0.5) { const s = backShareAt(y); assert.ok(s <= last + 1e-12 && s >= 0 && s <= 1); last = s; }
  assert.ok(Math.abs(backShareAt((fullToYMm + noneFromYMm) / 2) - 0.5) < 1e-9);
  assert.equal(backShareAt(5, null), 1, 'no back rule: the whole step everywhere');
  const p = Float32Array.from([2, -60, 0, 2, -20, 0, 2, 8, 0]);
  const q = partedPositions(p, 1);
  assert.equal(q[0], 2 + HEMI_GAP.eachMm);
  assert.ok(q[3] > 2 && q[3] < 2 + HEMI_GAP.eachMm);
  assert.equal(q[6], 2, 'at the occipital pole a half lies where the atlas has it');
  assert.deepEqual([...partedPositions(p, 1, HEMI_GAP.eachMm, null)].filter((_, i) => i % 3 === 0), [8, 8, 8]);
  // on the atlas brain: the two occipital lobes' inner faces are as close as in the atlas, the strips 14 mm apart
  const atlas = atlasBrain(), of = id => atlas.find(m => m.id === id);
  const backGap = (L, R) => { let l = Infinity, r = -Infinity; for (let i = 0; i < L.length; i += 3) if (L[i + 1] > 0) l = Math.min(l, L[i]); for (let i = 0; i < R.length; i += 3) if (R[i + 1] > 0) r = Math.max(r, R[i]); return l - r; };
  const atlasGap = backGap(of('FJ1791').positions, of('FJ1792').positions);
  const drawnGap = backGap(partedPositions(of('FJ1791').positions, 1), partedPositions(of('FJ1792').positions, -1));
  assert.ok(Math.abs(drawnGap - atlasGap) < 1e-3, `behind y 0 the occipital lobes are ${drawnGap.toFixed(2)} mm apart, as in the atlas (${atlasGap.toFixed(2)})`);
});

test('the game\'s loader hands on a parted copy of the brain: same order, same records for the middle, the files\' arrays untouched', () => {
  const mk = (name, x) => Object.freeze({ entry: Object.freeze({ embedded_source_name: name }), mesh: Object.freeze({ positions: Float32Array.from([x, -70, 2]), indices: Uint32Array.from([0, 0, 0]) }) });
  const loaded = new Map([['FJ1', mk('Right precentral gyrus', -5)], ['FJ2', mk('Pons', 4)], ['FJ3', mk('Left precentral gyrus', 5)]]);
  const out = partedBrainAssets(loaded);
  assert.notEqual(out, loaded);
  assert.deepEqual([...out.keys()], ['FJ1', 'FJ2', 'FJ3']);
  assert.equal(out.get('FJ1').mesh.positions[0], -5 - HEMI_GAP.eachMm);
  assert.equal(out.get('FJ3').mesh.positions[0], 5 + HEMI_GAP.eachMm);
  assert.equal(out.get('FJ2'), loaded.get('FJ2'), 'a part of the middle is the loaded record itself');
  assert.equal(out.get('FJ1').mesh.indices, loaded.get('FJ1').mesh.indices, 'the triangles are shared, only the points are new');
  assert.equal(out.get('FJ1').entry, loaded.get('FJ1').entry);
  assert.equal(loaded.get('FJ1').mesh.positions[0], -5, 'the loaded array is as it came (the loading picture reads it too)');
  assert.equal(partedBrainAssets(loaded, { eachMm: 0 }), loaded);
  assert.equal(partedBrainAssets(null), null);
});

test('on the atlas brain: the gap between the two motor strips grows from 2 mm to 14 mm, and each half only moves', () => {
  const atlas = atlasBrain();
  const parted = atlas.map(m => ({ ...m, positions: partedPositions(m.positions, hemisphereSideOf(m)) }));
  const of = (list, id) => list.find(m => m.id === id);
  const gap = list => xRange(of(list, 'FJ1800').positions)[0] - xRange(of(list, 'FJ1801').positions)[1]; // left precentral's inner edge minus the right one's
  assert.ok(Math.abs(gap(atlas) - 2.2) < 0.2, `the atlas: ${gap(atlas).toFixed(2)} mm`);
  assert.ok(Math.abs(gap(parted) - (gap(atlas) + 2 * HEMI_GAP.eachMm)) < 1e-3, `drawn: ${gap(parted).toFixed(2)} mm`);
  // the same areas come out, triangle for triangle: nothing inside a half was changed by moving it
  const seg = list => {
    const strips = NB.motorStripDescriptors(list), ids = new Set(strips.map(d => d.id));
    return NB.segmentMotorStrips(strips, BODY_MOTOR_MAP, { glassMeshes: list.filter(m => !ids.has(m.id)).map(m => ({ positions: m.positions, indices: m.indices })) });
  };
  const a = seg(atlas), b = seg(parted);
  assert.equal(a.parts.length, b.parts.length);
  assert.ok(a.parts.length > 40);
  for (let i = 0; i < a.parts.length; i++) {
    const p = a.parts[i], q = b.parts[i];
    assert.equal(q.regionId, p.regionId);
    assert.equal(q.hemisphere, p.hemisphere);
    assert.equal(q.faceCount, p.faceCount);
    // each part's points are the atlas's, moved along x by the half's own step and by nothing else
    const d = (p.hemisphere === 'left' ? 1 : -1) * HEMI_GAP.eachMm;
    for (const k of [0, 3 * Math.floor(p.positions.length / 6), p.positions.length - 3]) {
      assert.ok(Math.abs(q.positions[k] - (p.positions[k] + d)) < 1e-3 && q.positions[k + 1] === p.positions[k + 1] && q.positions[k + 2] === p.positions[k + 2]);
    }
  }
  for (const h of ['right', 'left']) {
    assert.ok(Math.abs(b.hemispheres[h].lo - (a.hemispheres[h].lo + HEMI_GAP.eachMm)) < 1e-3, 'each strip starts 6 mm further from the midline');
    assert.ok(Math.abs((b.hemispheres[h].hi - b.hemispheres[h].lo) - (a.hemispheres[h].hi - a.hemispheres[h].lo)) < 1e-3, 'and is as long as it was');
  }
});
