/** Seeing into the brain through the gap between its halves (20 November 2026).
 *
 * The owner: "Through the gap, you should be able to peak into the brain's inner structures."
 *
 * Pure checks of ns-brain-gap on the atlas brain as the game parts it (ns-brain-part): which meshes are cut open next
 * to the gap and which are drawn whole in their atlas colours; that the motor strip and the parts of the middle are
 * never cut; that the cut stays next to the gap (the outer look elsewhere is the same); that looking straight down into
 * the opening one now meets the ventricles and the white matter where one met cortex before; that the colours are the
 * loading picture's; and the shader text (the shell and its depth pre-pass leave out the same fragments). No browser:
 * the pictures are in the package notes. A display choice, not anatomy.
 * Run: node --test tests/brain-gap.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BRAIN_GAP, GAP_KIND, brainGapKind, gapCutKind, brainGapCut, brainGapOpen, gapWindow, brainGapPartKey, brainGapAttribute,
  brainGapGlsl, brainGapUniformValue, brainGapShellVertex, patchGapDepthShaders, brainGapAlbedoGlsl } from '../scene/src/ns-brain-gap.mjs';
import { HEMI_GAP, hemisphereSideOf, partedPositions } from '../scene/src/ns-brain-part.mjs';
import { ASSEMBLY_TIER_COLOURS } from '../scene/src/ns-assembly-core.mjs';
import { patchGlassReadShaders } from '../scene/src/ns-scene-three.mjs';
import * as NT from '../scene/src/ns-text.mjs';

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
/** The atlas brain parted as the game parts it, each mesh with its gap kind. */
function partedBrain() {
  if (cache) return cache;
  cache = brainEntries.map(a => {
    const rel = existsSync(new URL(`packets/pov-demo-assets/${a.path}`, root)) ? `packets/pov-demo-assets/${a.path}` : `packets/pov-demo-assets-r2/${a.path}`;
    const m = readObj(rel), name = a.embedded_source_name;
    const positions = partedPositions(m.positions, hemisphereSideOf({ name, positions: m.positions }), HEMI_GAP.eachMm);
    return { id: a.element_id, name, positions, indices: m.indices, gap: brainGapKind({ name, positions }) };
  });
  return cache;
}

test('every half of the cortex is cut next to the gap; the strip, the middle and the inner parts never are', () => {
  const B = partedBrain();
  const cut = B.filter(m => m.gap.side && gapCutKind(m.gap.kind)).map(m => m.name);
  assert.equal(cut.length, 28, cut.join(', ')); // 14 gyri and lobes a half, the precentral gyrus left out
  assert.ok(cut.every(n => !/precentral|white matter|ventricle|capsule|^(left|right) hippocampus$/i.test(n)));
  for (const m of B) {
    if (/precentral/i.test(m.name)) assert.equal(m.gap.kind, GAP_KIND.flesh, `${m.name}: the motor strip is never cut`);
    if (!m.gap.side) assert.ok(!gapCutKind(m.gap.kind), `${m.name}: a part of the middle is never cut`);
  }
  const kindOf = n => B.find(m => m.name === n).gap;
  assert.deepEqual(kindOf('White matter of left cerebral hemisphere'), { side: 1, kind: GAP_KIND.white });
  assert.deepEqual(kindOf('Right lateral ventricle'), { side: -1, kind: GAP_KIND.ventricle });
  assert.deepEqual(kindOf('Left internal capsule'), { side: 1, kind: GAP_KIND.innerWhite });
  assert.deepEqual(kindOf('Right hippocampus'), { side: -1, kind: GAP_KIND.deep });
  assert.deepEqual(kindOf('Third ventricle'), { side: 0, kind: GAP_KIND.ventricle });
  assert.deepEqual(kindOf('Pineal body'), { side: 0, kind: GAP_KIND.deep });
  // outer tissue of the middle and the underside keeps the flesh
  for (const n of ['Cerebellum', 'Pons', 'Midbrain', 'Hypothalamus', 'Tuber cinereum']) assert.equal(kindOf(n).kind, GAP_KIND.flesh, n);
  // the strip's left-over triangles (drawn as surface in region mode) are never cut either
  assert.equal(brainGapKind({ name: 'FJ1800 unassigned motor-strip triangles (glass)', positions: new Float32Array([20, -60, 1600]) }).kind, GAP_KIND.flesh);
});

test('the cut stays next to the gap, along the stretch where the ventricles lie', () => {
  const B = partedBrain();
  let cortexVerts = 0, cutVerts = 0;
  for (const m of B) {
    if (!(m.gap.side && gapCutKind(m.gap.kind))) continue;
    const P = m.positions;
    for (let i = 0; i < P.length; i += 3) {
      cortexVerts++;
      const p = [P[i], P[i + 1], P[i + 2]];
      if (!brainGapCut(p, m.gap)) continue;
      cutVerts++;
      const inner = m.gap.side * (p[0] - BRAIN_GAP.midlineMm) - HEMI_GAP.eachMm;
      assert.ok(inner < BRAIN_GAP.cutMm + 1e-6, `${m.name}: cut ${inner.toFixed(1)} mm from its inner face`);
      assert.ok(p[1] > BRAIN_GAP.fromY - BRAIN_GAP.taperMm && p[1] < BRAIN_GAP.toY + BRAIN_GAP.taperMm, `${m.name}: cut at y ${p[1].toFixed(0)}`);
    }
  }
  assert.ok(cutVerts > 0 && cutVerts / cortexVerts < 0.08, `${cutVerts} of ${cortexVerts} cortex vertices are cut`);
  // the cut ends in front of the strip's back edge (precentral gyri end at about y -39), where each half stands the whole
  // step from the midline even where the step eases off toward the back (ns-brain-part HEMI_GAP.back, when present)
  assert.ok(BRAIN_GAP.toY + BRAIN_GAP.taperMm <= (HEMI_GAP.back ? HEMI_GAP.back.fullToYMm : -39));
  assert.equal(gapWindow((BRAIN_GAP.fromY + BRAIN_GAP.toY) / 2), 1);
  assert.equal(gapWindow(BRAIN_GAP.toY + BRAIN_GAP.taperMm + 1), 0);
  assert.equal(gapWindow(BRAIN_GAP.fromY - BRAIN_GAP.taperMm - 1), 0);
  assert.equal(brainGapCut([HEMI_GAP.eachMm + 2, -90, 1600], { side: 1, kind: GAP_KIND.cortex }, { ...BRAIN_GAP, on: false }), false);
  // behind the cut's run a half may stand nearer the midline than eachMm (ns-brain-part HEMI_GAP.back eases its step
  // off behind the strip): it is not cut and not coloured there
  assert.equal(brainGapCut([2, 4, 1600], { side: 1, kind: GAP_KIND.cortex }), false);
  assert.equal(brainGapOpen([2, 4, 1600]), 0);
});

/** The topmost drawn surface straight above (x, y) (looking down the atlas z axis, as the start picture looks into the
 * gap), with the cut on or off: the mesh's name. */
function topmost(B, x, y, cutOn) {
  let best = -Infinity, who = null;
  for (const m of B) {
    const P = m.positions, I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const den = (P[b + 1] - P[c + 1]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 1] - P[c + 1]);
      if (Math.abs(den) < 1e-12) continue;
      const l1 = ((P[b + 1] - P[c + 1]) * (x - P[c]) + (P[c] - P[b]) * (y - P[c + 1])) / den;
      const l2 = ((P[c + 1] - P[a + 1]) * (x - P[c]) + (P[a] - P[c]) * (y - P[c + 1])) / den;
      if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
      const z = l1 * P[a + 2] + l2 * P[b + 2] + (1 - l1 - l2) * P[c + 2];
      if (z <= best) continue;
      if (cutOn && brainGapCut([x, y, z], m.gap)) continue;
      best = z; who = m.name;
    }
  }
  return who;
}

test('looking straight down into the opening one meets the ventricles and the white matter, not cortex', () => {
  const B = partedBrain();
  const inner = /ventricle|white matter|capsule|hippocamp/i;
  let before = 0, after = 0, n = 0;
  for (const side of [1, -1]) for (const y of [-75, -85, -95, -105]) for (const d of [3, 6, 9]) {
    const x = BRAIN_GAP.midlineMm + side * (HEMI_GAP.eachMm + d);
    n++;
    if (inner.test(topmost(B, x, y, false) || '')) before++;
    if (inner.test(topmost(B, x, y, true) || '')) after++;
  }
  assert.ok(before <= 2, `${before} of ${n} rays met an inner part before the cut`);
  assert.ok(after >= n - 2, `${after} of ${n} rays meet an inner part with the cut`);
});

test('the inner parts take the loading picture\'s atlas colours', () => {
  const hex = c => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
  assert.equal(hex(BRAIN_GAP.colours.white), ASSEMBLY_TIER_COLOURS.brain['white matter']);
  assert.equal(hex(BRAIN_GAP.colours.ventricle), ASSEMBLY_TIER_COLOURS.brain.ventricles);
  assert.equal(hex(BRAIN_GAP.colours.deep), ASSEMBLY_TIER_COLOURS.brain['deep nuclei']);
});

test('the tip names the inner parts seen in the opening, and only there', () => {
  const keys = new Set(partedBrain().filter(m => m.gap.kind >= GAP_KIND.white).map(m => brainGapPartKey(m.name)));
  assert.ok(!keys.has(null));
  for (const k of keys) assert.equal(typeof NT.BRAIN_PARTS[k], 'string', k);
  assert.equal(brainGapPartKey('Left superior frontal gyrus'), null);
  const mid = (BRAIN_GAP.fromY + BRAIN_GAP.toY) / 2;
  assert.equal(brainGapOpen([HEMI_GAP.eachMm + 4, mid, 1560]), 1);
  assert.equal(brainGapOpen([HEMI_GAP.eachMm + BRAIN_GAP.cutMm + BRAIN_GAP.tintMm + 2, mid, 1560]), 0);
  assert.equal(brainGapOpen([HEMI_GAP.eachMm + 4, BRAIN_GAP.toY + BRAIN_GAP.taperMm + 5, 1560]), 0);
});

test('the shell and its depth pre-pass leave out the same fragments; the attribute packs half and kind', () => {
  const V = 'void main() {\n#include <project_vertex>\n}';
  const F = 'void main() {\nvec3 outgoingLight = vec3( 0.0 );\n#include <opaque_fragment>\n}';
  const shell = patchGlassReadShaders(V, F);
  assert.ok(shell.vertexShader.includes('attribute vec2 nsGap;') && shell.vertexShader.includes('vNsGap = nsGap;'));
  assert.ok(shell.fragmentShader.includes('if ( nsGapIn( vNsObj, vNsGap ) > 0.5 ) discard;'));
  assert.ok(shell.fragmentShader.includes(brainGapAlbedoGlsl().trim().slice(0, 40)));
  const plain = patchGlassReadShaders(V, F, { gap: false });
  assert.ok(!plain.vertexShader.includes('nsGap') && !plain.fragmentShader.includes('nsGap'));
  const depth = patchGapDepthShaders(V, 'void main() {\n\tgl_FragColor = vec4( 1.0 );\n}');
  assert.ok(depth.fragmentShader.includes('if ( nsGapIn( vNsGapP, vNsGap ) > 0.5 ) discard;'));
  assert.ok(depth.fragmentShader.includes(brainGapGlsl().head));
  assert.ok(shell.fragmentShader.includes(brainGapGlsl().head));
  assert.equal(patchGapDepthShaders('void main() {}', 'void main() {}'), null);
  assert.equal(brainGapShellVertex('void main() {}'), null);
  // the rule in the shaders is the rule in brainGapCut (cut depth, run along the gap, on)
  assert.deepEqual(brainGapUniformValue(), [BRAIN_GAP.cutMm, BRAIN_GAP.fromY, BRAIN_GAP.toY, 1]);
  assert.ok(brainGapGlsl().head.includes(`- ${HEMI_GAP.eachMm}.0;`));
  assert.deepEqual([...brainGapAttribute([{ count: 2, side: 1, kind: 1 }, { count: 1, side: 0, kind: 3 }])], [1, 1, 1, 1, 0, 3]);
});
