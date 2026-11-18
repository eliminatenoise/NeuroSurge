// The plain look's one small shader patch (ns-scene-three patchPlainShaders): pale tendon ends and digit tips, and a
// dark edge on every limb. Pure text checks on Three's own standard shader.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { patchPlainShaders, PLAIN_LOOK, SIMPLE_LOOK } from '../scene/src/ns-scene-three.mjs';

const lib = THREE.ShaderLib.standard, BONE = [0.8, 0.74, 0.58];

test('the plain look is the look the game runs', () => { assert.equal(SIMPLE_LOOK, true); });

test('a muscle gets the pale tendon mix and the dark edge; a bone only the edge', () => {
  const m = patchPlainShaders(lib.vertexShader, lib.fragmentShader, 'muscle', BONE);
  assert.ok(m && m.vertexShader.includes('attribute float nsTendon;') && m.vertexShader.includes('vNsTendon = nsTendon;'));
  assert.ok(m.fragmentShader.includes('vNsTendon') && m.fragmentShader.includes('nsPlainEdge'));
  const b = patchPlainShaders(lib.vertexShader, lib.fragmentShader, 'bone', BONE);
  assert.ok(b && b.vertexShader === lib.vertexShader && b.fragmentShader.includes('nsPlainEdge') && !b.fragmentShader.includes('vNsTendon'));
  // the edge is applied before the output chunk, once
  assert.ok(m.fragmentShader.indexOf('nsPlainEdge') < m.fragmentShader.indexOf('#include <opaque_fragment>'));
  assert.equal(m.fragmentShader.split('float nsPlainEdge').length, 2);
  // matte: the specular light is left out; the tones are stepped
  assert.ok(m.fragmentShader.includes('outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;') && m.fragmentShader.includes('nsPlainQ'));
});

test('a shader without the hooks, or one already patched, is left alone (the material stays plain)', () => {
  assert.equal(patchPlainShaders(lib.vertexShader, 'void main() {}', 'bone', BONE), null);
  const m = patchPlainShaders(lib.vertexShader, lib.fragmentShader, 'muscle', BONE);
  assert.equal(patchPlainShaders(m.vertexShader, m.fragmentShader, 'muscle', BONE), null);
  assert.equal(patchPlainShaders(lib.vertexShader, lib.fragmentShader, 'muscle', null), null);
});

test('a soft edge shade with a thin ink line in it, flat tone bands, no gloss; the tendon mix leaves a little of the muscle', () => {
  assert.ok(PLAIN_LOOK.edge >= 0.3 && PLAIN_LOOK.edge <= 0.8 && PLAIN_LOOK.edgeWidth > 0.2 && PLAIN_LOOK.edgeWidth <= 0.7);
  // the ink line: thin (a small share of |N.V|) and dark but not black; flat tones in a few bands; no gloss
  assert.ok(PLAIN_LOOK.inkAt > 0.05 && PLAIN_LOOK.inkAt <= 0.3 && PLAIN_LOOK.inkDark >= 0.02 && PLAIN_LOOK.inkDark <= 0.3);
  assert.ok(PLAIN_LOOK.bands >= 3 && PLAIN_LOOK.bands <= 6 && PLAIN_LOOK.matte === true);
  assert.ok(PLAIN_LOOK.tendonMix > 0.7 && PLAIN_LOOK.tendonMix <= 1);
});

// 19 November 2026: every muscle its own shade; what has been switched on keeps a dimmed shade
import { muscleOwnShadeInto, MUSCLE_OWN_SHADE, visitedShadeInto, VISITED, MUSCLE_TONES } from '../scene/src/ns-colors.mjs';
test('every muscle has its own shade of its tone, the same on both sides, inside a modest range', () => {
  const seen = new Set();
  for (const key of ['biceps brachii', 'brachialis', 'triceps brachii', 'rectus femoris', 'vastus lateralis', 'sartorius', 'gracilis', 'soleus', 'deltoid', 'pectoralis major']) {
    const a = muscleOwnShadeInto(key, [...MUSCLE_TONES[0].linear]), b = muscleOwnShadeInto(key, [...MUSCLE_TONES[0].linear]);
    assert.deepEqual(a, b, 'the same muscle, the same shade');
    seen.add(a.map(v => v.toFixed(4)).join(','));
    const f = a[0] / MUSCLE_TONES[0].linear[0];
    assert.ok(f >= 1 - MUSCLE_OWN_SHADE.light - 1e-9 && f <= 1 + MUSCLE_OWN_SHADE.light + 1e-9);
  }
  assert.ok(seen.size >= 7, `ten muscles of one tone give at least seven shades (${seen.size})`);
});
test('a visited muscle is plainly dimmer and greyer than an untried one, and never black', () => {
  const base = [...MUSCLE_TONES[0].linear], v = visitedShadeInto([...base]);
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(v) < 0.7 * lum(base) && lum(v) > 0.2 * lum(base));
  assert.ok((v[0] - v[2]) / lum(v) < (base[0] - base[2]) / lum(base), 'greyer');
  assert.ok(VISITED.areaValue > 0.2 && VISITED.areaValue < 0.7 && VISITED.markLevel >= 0.3);
});
