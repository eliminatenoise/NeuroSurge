/** The colour code of the motor strip (18 November, package MAP): the rules of the system, checked on the generated
 * table (ns-colors AREA_COLORS / AREA_RAMPS). Pure software checks; no browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA_COLORS, AREA_CHUNKS, AREA_CHUNK_SIZE, AREA_STRIP_KEYS, areaCodeColour, hexToLinear } from '../scene/src/ns-colors.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';
import { regionChunkKey, regionLabelChunkCss } from '../scene/src/ns-scene-three.mjs';

const oklab = c => {
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
};
// Machado, Oliveira & Fernandes 2009, full severity, applied to linear RGB.
const CVD = {
  normal: null,
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]
};
const sim = (c, m) => (m ? [0, 1, 2].map(i => Math.min(1, Math.max(0, m[i][0] * c[0] + m[i][1] * c[1] + m[i][2] * c[2]))) : c);
const dist = (a, b) => { const p = oklab(a), q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const hueOf = c => { const p = oklab(c); return ((Math.atan2(p[2], p[1]) * 180 / Math.PI) + 360) % 360; };
const lightOf = c => oklab(c)[0];
const lin = id => AREA_COLORS[id].colorLinear;

test('every motor area of the body map has a colour and a chunk, and both halves carry the same chunks', () => {
  for (const r of BODY_MOTOR_MAP.regions) {
    const rec = AREA_COLORS[r.id];
    assert.ok(rec, `colour for ${r.id}`);
    const key = r.id.replace(/^(rh|lh)_/, '');
    assert.equal(rec.chunk, AREA_CHUNKS[key][0], `chunk of ${r.id}`);
    assert.equal(regionChunkKey(r), rec.chunk);
  }
  assert.equal(Object.keys(AREA_COLORS).length, 2 * AREA_STRIP_KEYS.length);
  for (const [chunk, n] of Object.entries(AREA_CHUNK_SIZE)) {
    if (chunk === 'scan') continue;
    const idx = Object.values(AREA_CHUNKS).filter(([c]) => c === chunk).map(([, i]) => i).sort((a, b) => a - b);
    assert.deepEqual(idx, Array.from({ length: n }, (_, i) => i), `chunk ${chunk} is numbered 0..${n - 1}`);
  }
});

test('left and right without reading: the brain\'s right half is cool, its left half warm', () => {
  const cool = h => h >= 160 && h <= 350, warm = h => h >= 350 || h <= 150;
  for (const key of AREA_STRIP_KEYS) {
    if (AREA_CHUNKS[key][0] === 'scan') continue;
    const r = areaCodeColour('rh', key), l = areaCodeColour('lh', key);
    assert.ok(cool(r.oklch[2]), `rh_${key} hue ${r.oklch[2]} is cool`);
    assert.ok(warm(l.oklch[2]), `lh_${key} hue ${l.oklch[2]} is warm`);
    assert.ok(dist(lin(`rh_${key}`), lin(`lh_${key}`)) >= 0.05, `the two halves' ${key} differ`);
  }
});

test('the family words on screen stay true (blues, oranges, purples, yellows, greens, pinks)', () => {
  const range = { leftArm: [195, 270], rightArm: [30, 95], leftLeg: [280, 315], rightLeg: [85, 110], trunk: [135, 175] };
  for (const [id, rec] of Object.entries(AREA_COLORS)) {
    const r = range[rec.family];
    if (!r) continue;
    const h = areaCodeColour(id.slice(0, 2), id.slice(3)).oklch[2];
    assert.ok(h >= r[0] && h <= r[1], `${id} (${rec.family}) hue ${h}`);
  }
  for (const id of ['rh_neck', 'rh_brow', 'rh_lips', 'lh_neck', 'lh_brow', 'lh_lips']) assert.equal(AREA_COLORS[id].family, 'faceNeck');
});

test('inside a chunk the keys step from light (body middle) to deep (far end)', () => {
  for (const h of ['rh', 'lh']) {
    for (const chunk of Object.keys(AREA_CHUNK_SIZE)) {
      if (AREA_CHUNK_SIZE[chunk] < 2) continue;
      const keys = Object.entries(AREA_CHUNKS).filter(([, [c]]) => c === chunk).sort((a, b) => a[1][1] - b[1][1]).map(([k]) => k);
      for (let i = 0; i + 1 < keys.length; i++) {
        assert.ok(lightOf(lin(`${h}_${keys[i]}`)) > lightOf(lin(`${h}_${keys[i + 1]}`)), `${h} ${keys[i]} lighter than ${keys[i + 1]}`);
      }
    }
  }
});

test('neighbours on the strip read apart, for normal vision and under protanopia and deuteranopia', () => {
  const minInside = { normal: 0.05, protan: 0.04, deutan: 0.045 }, minAcross = { normal: 0.12, protan: 0.055, deutan: 0.07 };
  for (const [mode, M] of Object.entries(CVD)) {
    for (const h of ['rh', 'lh']) {
      for (let i = 0; i + 1 < AREA_STRIP_KEYS.length; i++) {
        const a = `${h}_${AREA_STRIP_KEYS[i]}`, b = `${h}_${AREA_STRIP_KEYS[i + 1]}`;
        const d = dist(sim(lin(a), M), sim(lin(b), M));
        const same = AREA_COLORS[a].chunk === AREA_COLORS[b].chunk;
        assert.ok(d >= (same ? minInside[mode] : minAcross[mode]), `${mode}: ${a} / ${b} = ${d.toFixed(3)}`);
      }
    }
  }
});

test('the glow is the same hue as the key, saturated and bright; the grey in-between areas glow near white', () => {
  for (const [id, rec] of Object.entries(AREA_COLORS)) {
    const g = rec.glowLinear;
    assert.ok(Math.abs(Math.max(...g) - 1) < 1e-6, `${id} glow brightest channel 1`);
    if (rec.chunk === 'scan') { assert.ok(Math.min(...g) > 0.4, `${id} glows pale`); continue; }
    const dh = Math.abs(((hueOf(g) - hueOf(rec.colorLinear)) + 540) % 360 - 180);
    assert.ok(dh < 25, `${id} glow hue within 25 degrees of its key (${dh.toFixed(1)})`);
  }
});

test('a group label takes the mean colour of its areas, the grey ones left out', () => {
  const css = regionLabelChunkCss({ regionIds: ['lh_shoulder', 'lh_elbow', 'lh_scan_superior'] });
  assert.match(css, /^#[0-9a-f]{6}$/);
  const c = hexToLinear(parseInt(css.slice(1), 16));
  assert.ok(c[0] > c[2], 'the right arm label is warm');
  assert.equal(regionLabelChunkCss({ regionIds: ['rh_scan_middle'] }), null);
  assert.equal(regionLabelChunkCss(null), null);
});
