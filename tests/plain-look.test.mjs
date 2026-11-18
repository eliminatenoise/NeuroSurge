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
});

test('a shader without the hooks, or one already patched, is left alone (the material stays plain)', () => {
  assert.equal(patchPlainShaders(lib.vertexShader, 'void main() {}', 'bone', BONE), null);
  const m = patchPlainShaders(lib.vertexShader, lib.fragmentShader, 'muscle', BONE);
  assert.equal(patchPlainShaders(m.vertexShader, m.fragmentShader, 'muscle', BONE), null);
  assert.equal(patchPlainShaders(lib.vertexShader, lib.fragmentShader, 'muscle', null), null);
});

test('the edge is a shade, not a black line, and the tendon mix leaves a little of the muscle', () => {
  assert.ok(PLAIN_LOOK.edge >= 0.15 && PLAIN_LOOK.edge <= 0.5 && PLAIN_LOOK.edgeWidth > 0.2 && PLAIN_LOOK.edgeWidth <= 0.7);
  assert.ok(PLAIN_LOOK.tendonMix > 0.7 && PLAIN_LOOK.tendonMix <= 1);
});
