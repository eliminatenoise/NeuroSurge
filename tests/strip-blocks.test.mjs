// 20 November 2026: the motor strip as separate blocks (the owner, Message 206: "let's actually make the motor strip
// completely segmented, so it's a bunch of slice blocks with a little bit of gap in between"), and the medial end of the
// strip turned up over the top edge so every block can be aimed at from the start view (Message 204: "make sure there's
// clear movement for each brain activation area"; the lead's BODYMAP audit: the toe areas faced the gap between the
// halves). The picker follows what is drawn: a look into a gap takes no area.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as NB from '../scene/src/ns-brain.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';
import { REGION_SLICE } from '../scene/src/ns-scene-three.mjs';

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
function atlasSeg() {
  if (cache) return cache;
  const atlas = brainEntries.map(a => {
    const rel = existsSync(new URL(`packets/pov-demo-assets/${a.path}`, root)) ? `packets/pov-demo-assets/${a.path}` : `packets/pov-demo-assets-r2/${a.path}`;
    return { id: a.element_id, name: a.embedded_source_name, ...readObj(rel) };
  });
  const strips = NB.motorStripDescriptors(atlas);
  cache = { strips, seg: NB.segmentMotorStrips(strips, BODY_MOTOR_MAP, { outline: false }) };
  return cache;
}
const triArea = (P, a, b, c) => {
  const bx = P[3 * b] - P[3 * a], by = P[3 * b + 1] - P[3 * a + 1], bz = P[3 * b + 2] - P[3 * a + 2];
  const cx = P[3 * c] - P[3 * a], cy = P[3 * c + 1] - P[3 * a + 1], cz = P[3 * c + 2] - P[3 * a + 2];
  return Math.hypot(by * cz - bz * cy, bz * cx - bx * cz, bx * cy - by * cx) / 2;
};

test('the blocks: a black gap of the same strip width on the picture and on the picker, never under a pixel a side', () => {
  assert.equal(REGION_SLICE.on, true);
  assert.equal(REGION_SLICE.halfS, NB.SEGMENT_DEFAULTS.sliceHalfS);
  assert.ok(REGION_SLICE.halfS > 0 && REGION_SLICE.halfS < 0.005, 'a little gap: well under a finger sub-band');
  assert.ok(REGION_SLICE.minCss >= 0.8 && REGION_SLICE.minCss <= 1.5);
  assert.ok(REGION_SLICE.colour.every(v => v < 0.003), 'the abyss black');
});

test('the crest map is continuous and keeps the strip order; the turn gives the first stretch of the crest to the toes', () => {
  const T = NB.MEDIAL_TURN, C = NB.CREST_COMPRESS, f = v => NB.crestStripS(v, T);
  assert.equal(T.on, true);
  assert.ok(Math.abs(f(0) - T.sTop) < 1e-12);
  assert.ok(Math.abs(f(T.crestV) - C.crestFloor) < 1e-12, 'the toes / ankle border at crestV');
  assert.ok(Math.abs(f(T.crestV - 1e-9) - f(T.crestV + 1e-9)) < 1e-4, "no step at crestV");
  assert.ok(Math.abs(f(C.crestTop - 1e-9) - C.crestTop) < 1e-6 && f(0.2) === 0.2, 'from the trunk on nothing moves');
  let last = -1;
  for (let v = 0; v <= 0.2; v += 0.0005) { const s = f(v); assert.ok(s >= last); last = s; }
  // off: the layout before
  assert.ok(Math.abs(NB.crestStripS(0, null) - C.crestFloor) < 1e-12);
});

test('on the atlas brain every toe movement lies on the crest, and the medial wall carries the toes only', () => {
  const { seg } = atlasSeg();
  for (const h of ['right', 'left']) {
    const md = seg.hemispheres[h].medial;
    assert.ok(md && md.sHi === md.sLo, `${h}: the whole medial wall is the strip's medial end`);
    const code = h === 'right' ? 'rh' : 'lh';
    const toes = seg.regionById.get(`${code}_toes`);
    // crest area per toe movement (triangle centroid s, the picker's own rule)
    const per = new Map();
    let crest = 0, sSum = 0;
    for (const p of seg.parts.filter(q => q.regionId === toes.id && q.hemisphere === h)) {
      if (p.surface !== 'convexity') continue;
      for (let t = 0; t < p.indices.length; t += 3) {
        const i = p.indices, s = (p.s[i[t]] + p.s[i[t + 1]] + p.s[i[t + 2]]) / 3, a = triArea(p.positions, i[t], i[t + 1], i[t + 2]);
        const act = NB.regionActionAt(toes, s, s);
        per.set(act.id, (per.get(act.id) || 0) + a); crest += a; sSum += s * a;
      }
    }
    assert.ok(crest > 200 && crest < 450, `${h} toes on the crest: ${crest.toFixed(0)} mm2`);
    assert.equal(per.size, 4, `${h}: all four toe movements on the crest`);
    for (const [id, a] of per) assert.ok(a > 25, `${id}: ${a.toFixed(0)} mm2`);
    // the strip order on the crest: toes, ankle, knee, hip
    const meanS = k => seg.regionById.get(`${code}_${k}`).byHemisphere[h].meanS;
    const crestMean = sSum / crest;
    assert.ok(crestMean < meanS('ankle') && meanS('ankle') < meanS('knee') && meanS('knee') < meanS('hip'), `${crestMean} ${meanS('ankle')} ${meanS('knee')} ${meanS('hip')}`);
    // and none of the next areas lost its place: each keeps a fair share of the crest
    for (const k of ['ankle', 'knee', 'hip']) assert.ok(seg.regionById.get(`${code}_${k}`).byHemisphere[h].areaMm2 > 180, `${h} ${k}`);
  }
});

test('the picker follows the picture: the middle of a block takes its area, the gap between two blocks takes none', () => {
  const { seg } = atlasSeg();
  const S = seg.strips.find(x => x.hemisphere === 'right' && x.kind === 'precentral');
  const P = S.positions, I = S.indices, half = NB.SEGMENT_DEFAULTS.sliceHalfS;
  // a look from just above the strip at the point of triangle t where the strip coordinate is `target` (on the edge
  // between its lowest and highest vertex, nudged a little toward its middle: the atlas triangles are wider than a band)
  const shot = (t, target) => {
    const v = [0, 1, 2].map(k => I[3 * t + k]).sort((x, y) => S.u[x] - S.u[y]);
    const [A, , B] = v, f = (target - S.u[A]) / (S.u[B] - S.u[A]);
    const pt = [0, 1, 2].map(k => 0.98 * (P[3 * A + k] + f * (P[3 * B + k] - P[3 * A + k])) + 0.02 * (P[3 * v[0] + k] + P[3 * v[1] + k] + P[3 * v[2] + k]) / 3);
    const e1 = [0, 1, 2].map(k => P[3 * v[1] + k] - P[3 * v[0] + k]), e2 = [0, 1, 2].map(k => P[3 * v[2] + k] - P[3 * v[0] + k]);
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n); n = n.map(x => x / l);
    if (n[2] < 0) n = n.map(x => -x); // from above
    return NB.classifyRegionGaze(pt.map((x, k) => x + 0.6 * n[k]), n.map(x => -x), seg);
  };
  const border = (seg.regionById.get('rh_hand').core[1] + seg.regionById.get('rh_little').core[0]) / 2; // hand / little finger
  const centre = seg.regionById.get('rh_hand').centre;
  let inGap = null, inMiddle = null;
  for (let t = 0; t < S.triangleCount && !(inGap && inMiddle); t++) {
    if (S.triSurface[t]) continue;
    const us = [0, 1, 2].map(k => S.u[I[3 * t + k]]), lo = Math.min(...us), hi = Math.max(...us);
    if (!inGap && lo < border - half && hi > border + half) { const g = shot(t, border); if (g.kind !== 'empty' && Math.abs(g.s - border) < 0.4 * half) inGap = g; }
    if (!inMiddle && lo < centre - 0.004 && hi > centre + 0.004) { const g = shot(t, centre); if (g.kind !== 'empty' && Math.abs(g.s - centre) < 0.004) inMiddle = g; }
  }
  assert.ok(inMiddle && inGap, `found a look into a block (${Boolean(inMiddle)}) and one into a gap (${Boolean(inGap)})`);
  assert.equal(inMiddle.kind, 'region'); assert.equal(inMiddle.regionId, 'rh_hand');
  assert.equal(inGap.kind, 'glass'); assert.equal(inGap.via, 'gap');
});
