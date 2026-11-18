/** The live effect of a switched-on area (18 November, package MAP: "a neon glowing blinking effect, shuddering effect
 * upon activity and corresponding activity"): the blink rule (CPU and GLSL from one table) and the shudder patch.
 * Pure software checks; no browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { BLINK, powerUpBlink, powerUpBlinkGlsl, powerUpEnvelope, powerUpGlsl, SHUDDER, shudderGlsl } from '../scene/src/ns-colors.mjs';
import { patchShudderVertex, patchPowerUpShaders } from '../scene/src/ns-scene-three.mjs';

test('a switched-on area gives a steady light: no strike pulses and no flicker', () => {
  // 19 November 2026 (the owner: "The game currently physically hurts to look at with your eyes"): the neon strike and
  // the flicker of 18 November are gone; the light never dips.
  for (let t = 0; t < 12; t += 0.005) assert.equal(powerUpBlink(t), 1, `steady at ${t}`);
});

test('no blink under reduced motion or for a calm hint; the envelope carries the blink in its light only', () => {
  for (const a of [0.09, 0.21, 0.68]) {
    assert.equal(powerUpBlink(a, { reduced: true }), 1);
    assert.equal(powerUpBlink(a, { calm: true }), 1);
  }
  const early = powerUpEnvelope(0.09), lit = powerUpEnvelope(0.15);
  assert.ok(early.gain > 0.5 * lit.gain, 'no dark gap in the light as it comes on');
  assert.equal(powerUpEnvelope(0.09, 0.5, { reduced: true }).gain, powerUpEnvelope(0.09, 0.5, { reduced: true }).albedo);
});

test('the shaders get the same blink table (the links on the CPU blink in step with keys and muscles)', () => {
  const g = powerUpBlinkGlsl('nsB');
  for (const d of BLINK.dips) assert.ok(g.includes(d.toFixed(6)), `dip ${d}`);
  for (const [u, l] of BLINK.strike) assert.ok(g.includes(`a < ${u.toFixed(6)} ) return ${l.toFixed(6)}`));
  assert.ok(powerUpGlsl('nsPowerUp').includes('nsPowerUpBlink( a )'));
});

test('the shudder is added after project_vertex once, along the normal for muscles and in the screen plane for keys', () => {
  const vs = THREE.ShaderLib.physical.vertexShader;
  const m = patchShudderVertex(vs, true), k = patchShudderVertex(vs, false);
  assert.ok(m.includes('nsShudder(') && m.includes('normalize( transformedNormal ) * nsSh.x'));
  assert.ok(k.includes('mvPosition.xy += nsSh.yz'));
  assert.equal(patchShudderVertex(m, true), m, 'not twice');
  assert.equal(patchShudderVertex('void main() { gl_Position = vec4( 0.0 ); }', true), 'void main() { gl_Position = vec4( 0.0 ); }', 'no hook, no change');
  assert.ok(m.includes('nsClock.y < 0.5'), 'none under reduced motion');
  assert.ok(m.includes('nsCharge.y < 0.5'), 'none for a calm hint');
  const p = patchPowerUpShaders(THREE.ShaderLib.physical.vertexShader, THREE.ShaderLib.physical.fragmentShader, 'muscle');
  assert.ok(p && p.vertexShader.includes('nsShudder('), 'the power-up patch carries it');
  assert.ok(shudderGlsl().includes(SHUDDER.kickTauS.toFixed(6)));
});
