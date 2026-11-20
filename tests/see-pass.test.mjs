/** The hidden-things pass (ns-see createGhostPass) built with three.js and a stand-in renderer that only records what
 * would be drawn (20 November 2026, three findings of a code review). Nothing is drawn, so these cannot show the
 * picture: only that the pass draws its ink again when a fill rises with nothing moving, gives the bodies' ghost draw
 * the ID pass's clip planes, and keeps one grid of tiles, not one per window shape. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createGhostPass, SEE_THINGS as T } from '../scene/src/ns-see.mjs';

function harness({ three = THREE, clip = null, W = 1600, H = 900 } = {}) {
  let afterId = null, rt = null;
  const renders = [], reads = [];
  const outline = { setAfterId(fn) { afterId = fn; }, invalidate() {}, composite: { visible: true } };
  const ctx = {};
  const renderer = {
    capabilities: { isWebGL2: true }, autoClear: true,
    setRenderTarget(t) { rt = t; }, getRenderTarget() { return rt; },
    render(scene) { renders.push({ scene: scene.name, batchMaterial: ctx.batch ? ctx.batch.material : null }); },
    clearDepth() {}, getClearAlpha() { return 0; }, getClearColor(c) { return c; }, setClearColor() {},
    readRenderTargetPixelsAsync(t, x, y, w, h, buf) { return new Promise(res => reads.push({ buf, res })); },
    getContext() { return null; }
  };
  const pass = createGhostPass({ THREE: three, renderer, outline, reducedMotion: true });
  const idScene = new three.Scene(); idScene.name = 'id';
  Object.assign(ctx, { renderer, idScene, batch: { material: null }, skinBatch: null, skinScene: null, target: { texture: new three.Texture() }, depthTexture: new three.Texture(),
    size: [W, H], ss: 1, pr: 1, bufW: W, bufH: H, camera: new three.PerspectiveCamera(50, W / H, 0.01, 100), pxPerCmAt1m: 10, clip });
  return { pass, draw: () => afterId(ctx), renders, reads, ctx, setSize: (w, h) => { ctx.size = [w, h]; ctx.bufW = w; ctx.bufH = h; } };
}
const inks = h => h.renders.filter(r => /ghost ink pass/.test(r.scene)).length;
const tick = () => new Promise(r => setTimeout(r, 5));

test('a trunk whose fill rises from 0 after the last ink gets its ink drawn again, with nothing moving', async () => {
  const h = harness();
  h.draw(); h.pass.frame(); // a redrawn frame: the ink runs with the mirror body's trunk at fill 0; the census is asked for
  const before = inks(h);
  assert.equal(h.reads.length, 1);
  const r = h.reads.shift();
  for (let i = 0; i < 30; i++) r.buf[4 * i + 3] = 1 << (T.mirrorTrunk - 1 - 8); // hidden in 30 cells, seen in none (behind the brain)
  r.res(r.buf); await tick();
  h.pass.frame(); h.pass.frame(); h.pass.frame(); // still frames (the outline pass draws nothing)
  assert.ok(h.pass.state().fill[T.mirrorTrunk] > 0, 'hidden and hardly seen: filled');
  assert.equal(inks(h) - before, 1, 'drawn again once, not every frame');
});

test('the bodies\' ghost draw is cut by the ID pass\'s clip planes (the collar box in the eye view)', () => {
  const planes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 1)];
  const h = harness({ clip: planes });
  h.draw();
  const m = h.renders.find(r => r.scene === 'id').batchMaterial;
  assert.ok(m && m.clipping === true);
  assert.equal(m.clippingPlanes, planes);
  assert.equal(m.clipIntersection, true, 'a point inside the box (on the cut side of every plane) is dropped, as in the ID pass');
  assert.match(m.fragmentShader, /if \( g == 1 \|\| g == 2 \) \{\s*#include <clipping_planes_fragment>/, 'only your own trunk and head, as in the ID pass');
  assert.equal(h.pass.state().clipped, true);
  const n = harness();
  n.draw();
  assert.equal(n.renders.find(r => r.scene === 'id').batchMaterial.clippingPlanes, null, 'no planes, nothing cut');
});

test('one grid of tiles is kept, for the window shape in use, and released when the shape changes', () => {
  const alive = new Set();
  class BG extends THREE.BufferGeometry { constructor() { super(); alive.add(this); } dispose() { alive.delete(this); super.dispose(); } }
  const h = harness({ three: { ...THREE, BufferGeometry: BG } });
  h.draw();
  const start = alive.size;
  for (const w of [1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 1600]) { h.setSize(w, 900); h.draw(); }
  assert.equal(alive.size, start);
  assert.equal(h.pass.state().tiles, '48x27');
  h.pass.dispose();
  assert.equal(alive.size, 0);
});
