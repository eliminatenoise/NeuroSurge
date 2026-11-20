/** The outline pass (ns-outline createOutlinePass) built with three.js and a stand-in renderer that only records what
 * would be drawn (20 November 2026, from a review of Body updates 60 and 61). Nothing is drawn, so these cannot show the
 * picture: only WHEN the passes run and what the ID batch holds when they do.
 *
 * The heart's beat (ns-scene-three applyOrgans: the organ material scales it about its centre by up to 3 %) is handed to
 * the outline as userData.nsOutlineLocal, so the heart's line follows the drawn heart. That map changes on every frame
 * while the heart beats. It used to count as a change of the scene, so the ID, edge and ink passes and the hidden-things
 * pass ran on every frame of a still view. Now the line takes the map whenever the passes are drawn anyway, and a change
 * of the map alone draws nothing.
 * Run: node --test tests/outline-idle.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createOutlinePass, OUTLINE_GROUPS } from '../scene/src/ns-outline.mjs';

function harness() {
  let rt = null;
  const renders = [];
  const renderer = {
    capabilities: { isWebGL2: true, maxTextureSize: 4096 }, autoClear: true, info: { render: { calls: 1 } },
    setRenderTarget(t) { rt = t; }, getRenderTarget() { return rt; }, render(scene) { renders.push(scene.name || ''); },
    clear() {}, clearDepth() {}, getClearAlpha() { return 0; }, getClearColor(c) { return c; }, setClearColor() {}, getContext() { return null; }
  };
  const pass = createOutlinePass({ THREE, renderer });
  pass.setSize(320, 180, 1);
  let batch = null, afterIds = 0;
  pass.setAfterId(ctx => { batch = ctx.batch; afterIds++; });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 100);
  camera.position.set(0, 0, 2); camera.updateMatrixWorld();
  // a heart (any closed indexed mesh) at some place in the body, and a muscle beside it
  const heart = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.09), new THREE.MeshStandardMaterial());
  heart.matrixAutoUpdate = false; heart.matrix.makeTranslation(0.05, 0.1, -0.3);
  const muscle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), new THREE.MeshStandardMaterial());
  muscle.matrixAutoUpdate = false; muscle.matrix.makeTranslation(-0.2, 0, -0.3);
  scene.add(heart, muscle);
  pass.register(heart, { group: OUTLINE_GROUPS.trunk });
  pass.register(muscle, { group: OUTLINE_GROUPS.trunk });
  // the heart's beat as applyOrgans gives it: one Matrix4, a scale by k about the heart's centre c, changed in place
  const c = [0.01, -0.02, 0.005], L = new THREE.Matrix4();
  const beat = k => L.set(k, 0, 0, c[0] * (1 - k), 0, k, 0, c[1] * (1 - k), 0, 0, k, c[2] * (1 - k), 0, 0, 0, 1);
  beat(1);
  heart.userData.nsOutlineLocal = L;
  const frame = () => pass.render(scene, camera);
  const counts = () => { const s = pass.state(); return { drawn: s.idFrames, skipped: s.skippedFrames, afterIds }; };
  return { pass, frame, counts, beat, L, heart, camera, renders, batch: () => batch };
}

test('a still view with a beating heart draws the passes once, then skips them', () => {
  const h = harness();
  h.frame();
  const first = h.counts();
  assert.equal(first.drawn, 1, 'the first frame draws');
  for (let i = 1; i <= 60; i++) { h.beat(1 + 0.03 * Math.sin(i / 4) ** 2); h.frame(); }
  const after = h.counts();
  assert.equal(after.drawn - first.drawn, 0, 'no ID, edge or ink pass while only the beat changes');
  assert.equal(after.afterIds - first.afterIds, 0, 'and no hidden-things pass');
  assert.equal(after.skipped - first.skipped, 60, 'every one of those frames is skipped');
});

test('when the passes are drawn, the heart\'s line takes the beat of that frame', () => {
  const h = harness();
  h.frame();
  const k = 1.027;
  h.beat(k); h.frame(); // skipped: the line keeps the swell it was drawn with
  h.camera.position.x += 0.01; h.camera.updateMatrixWorld(); // the view moves: everything is drawn again
  h.frame();
  assert.equal(h.counts().drawn, 2);
  const got = new THREE.Matrix4(), want = new THREE.Matrix4().multiplyMatrices(h.heart.matrixWorld, h.L);
  h.batch().getMatrixAt(0, got);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(got.elements[i] - want.elements[i]) < 1e-6, `element ${i}: ${got.elements[i]} vs ${want.elements[i]}`);
  // the heart itself moving draws again, with the beat of that frame
  h.beat(1.004); h.heart.matrix.makeTranslation(0.05, 0.11, -0.3); h.frame();
  assert.equal(h.counts().drawn, 3, 'a heart that moves is drawn again');
  want.multiplyMatrices(h.heart.matrixWorld, h.L); h.batch().getMatrixAt(0, got);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(got.elements[i] - want.elements[i]) < 1e-6, `element ${i} after the move`);
});

test('a forced redraw (invalidate) also takes the beat of that frame', () => {
  const h = harness();
  h.frame();
  h.beat(1.015); h.frame();
  h.pass.invalidate(); h.frame();
  assert.equal(h.counts().drawn, 2);
  const got = new THREE.Matrix4(), want = new THREE.Matrix4().multiplyMatrices(h.heart.matrixWorld, h.L);
  h.batch().getMatrixAt(0, got);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(got.elements[i] - want.elements[i]) < 1e-6, `element ${i}`);
});
