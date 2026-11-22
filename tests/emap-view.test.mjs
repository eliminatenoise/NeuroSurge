/** The electrical map's view, built with three.js in Node (22 November 2026, DESIGN-DECISIONS section 192; after an
 * independent check): its meshes, the motor areas drawn again in their own colour, a throw inside the frame step that
 * switches the map off and hides every mesh instead of leaving the dark ground; and the owner's rule that no point
 * brightens and darkens more than about three times a second, on the sum of a lit route's two lanes and the traffic,
 * and where the cord's two strands lie in one pixel. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';
import { buildEmap, brainBoxesFromManifest, syntheticAreaAnchors, createEmapState, createEmapFrame, emapStep, emapLightAt, EMAP } from '../scene/src/ns-emap.mjs';
import * as NsWiring from '../scene/src/ns-wiring-data.mjs';
import { trafficOf, trafficAt, peaksPerSecond, EMAP_STORM } from '../scene/src/ns-emap-storm.mjs';
import { createEmapView, EMAP_LOOK } from '../scene/src/ns-emap-three.mjs';
import { bodyMuscleDrives } from '../scene/src/ns-body.mjs';

const rig = JSON.parse(fs.readFileSync(new URL('../packs/BODY-RIG.json', import.meta.url), 'utf8')).rig;
const manifest = JSON.parse(fs.readFileSync(new URL('../inputs/MESH-MANIFEST.json', import.meta.url), 'utf8'));
const boxes = brainBoxesFromManifest(manifest.assets);
const areas = syntheticAreaAnchors(BODY_MOTOR_MAP, boxes);
const muscles = [];
for (const m of rig.muscles) { const s = rig.meshSegment[m.id]; if (s && s.restCentroid) muscles.push({ id: m.id, name: m.name, side: m.side, rig: 'body', seg: s.segment, centre: s.restCentroid }); }
const resolveMuscles = (r, act) => Object.keys(bodyMuscleDrives([{ actionId: act.id, level: 1, agonists: act.agonists || [], antagonists: act.antagonists || [], stabilizers: act.stabilizers || [] }], { rig }));
const INPUTS = { bodyMap: BODY_MOTOR_MAP, rig, boxes, areas, muscles, wiring: NsWiring, resolveMuscles };
const RATE = 120;

/** A scene with what the view reads: the groups, a camera, a one-piece brain glass and one motor-area block. */
function fakeObjects() {
  const scene = new THREE.Scene(), brainGroup = new THREE.Group();
  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 30, 0, 0, 0, 30, 0]), 3));
  glassGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  glassGeo.setIndex([0, 1, 2]);
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshBasicMaterial());
  glass.name = 'brain glass (every piece, one draw)';
  // a motor area as the scene makes it: its own mesh and a fill mesh (which draws the parts its own mesh leaves out)
  const areaMat = new THREE.MeshBasicMaterial({ color: 0x00ccff });
  const block = new THREE.Mesh(glassGeo.clone(), areaMat), fill = new THREE.Mesh(glassGeo.clone(), areaMat);
  block.name = 'motor region: test'; fill.name = 'motor region test (fill)';
  brainGroup.add(glass, block, fill);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 100);
  const groups = { bodyGroup: new THREE.Group(), mirrorRoot: new THREE.Group(), mirrorBodyGroup: new THREE.Group(), mirrorArmGroup: new THREE.Group(), armGroup: new THREE.Group() };
  for (const g of [brainGroup, camera, ...Object.values(groups)]) scene.add(g);
  scene.updateMatrixWorld(true);
  return { scene, camera, brainGroup, ...groups, bones: [], muscles: [], regions: [{ id: 'test', meshes: [block], fillMeshes: [fill], material: areaMat }], regionMeshes: [block] };
}
const mapMeshes = scene => scene.children.filter(m => /^ns-electrical map/.test(String(m.name)));

test('the view built with three.js: its meshes, the scan on the glass only (the motor areas left out), nothing shown while off', () => {
  const objects = fakeObjects();
  const view = createEmapView({ THREE, objects });
  view.prepare(INPUTS);
  assert.equal(view.work(1e9), true, 'built');
  const st0 = view.state();
  assert.equal(st0.error, null);
  assert.equal(st0.scan.surfaces, 1, 'the scan is drawn on the glass only (the blocks are not in it)');
  const areaGeos = [objects.regions[0].meshes[0].geometry, objects.regions[0].fillMeshes[0].geometry];
  assert.ok(!mapMeshes(objects.scene).some(m => areaGeos.includes(m.geometry) || m.material === objects.regions[0].material), 'the map draws no copy of a block, its own mesh or its fill');
  // the dark ground and both passes of the scan stay off a pixel of a visible block: the strip's own stencil mark
  const kept = mapMeshes(objects.scene).filter(m => /dark ground|live scan/.test(m.name));
  assert.equal(kept.length, 3, 'the dark ground and the scan\'s two passes');
  for (const m of kept) {
    assert.equal(m.material.stencilWrite, true, m.name); assert.equal(m.material.stencilWriteMask, 0, `${m.name}: it reads the mark, never writes it`);
    assert.equal(m.material.stencilFunc, THREE.NotEqualStencilFunc, m.name); assert.equal(m.material.stencilRef, 1, m.name);
  }
  assert.equal(st0.scan.stripKept, true);
  const depthPass = mapMeshes(objects.scene).find(m => /depth pass/.test(m.name));
  assert.equal(depthPass.material.transparent, true, 'the scan\'s depth pass is drawn after the strip\'s own (with the transparent things)');
  assert.ok(depthPass.renderOrder > 200, 'while the map is not wholly on, the scan\'s depth pass comes after the glass');
  // the lines: the hidden pass and the network's front pass keep off a block; the routes' front pass does not, and is
  // drawn a little nearer than the hidden pass (no flip between the two complementary depth tests)
  const lines = mapMeshes(objects.scene).filter(m => /typical routes|network in front/.test(m.name));
  assert.equal(lines.length, 3);
  const net = lines.find(m => /network in front/.test(m.name)), routes = lines.find(m => /^ns-electrical map \(typical routes/.test(m.name)), hid = lines.find(m => /hidden behind/.test(m.name));
  assert.equal(net.material.stencilFunc, THREE.NotEqualStencilFunc); assert.equal(hid.material.stencilFunc, THREE.NotEqualStencilFunc);
  assert.notEqual(routes.material.stencilWrite, true, 'a route is drawn over its block');
  assert.equal(net.material.uniforms.uSel.value, 1); assert.equal(routes.material.uniforms.uSel.value, 2); assert.equal(hid.material.uniforms.uSel.value, 0);
  assert.ok(routes.material.polygonOffset && routes.material.polygonOffsetFactor < 0 && !hid.material.polygonOffset);
  assert.ok(mapMeshes(objects.scene).every(m => !m.visible), 'nothing is shown while the map is off');
  view.setOn(true);
  view.frame({ nowMs: 0 }); view.frame({ nowMs: 100 });
  const colourPass = mapMeshes(objects.scene).find(m => /live scan on the brain/.test(m.name));
  assert.ok(view.amount > 0 && view.amount < 1);
  assert.ok(depthPass.renderOrder > 200, 'easing in: the depth pass after the glass ...');
  assert.equal(colourPass.material.blendDst, THREE.OneMinusSrcAlphaFactor, '... and the scan covers the glass by the amount');
  assert.ok(Math.abs(colourPass.material.uniforms.uCover.value - view.amount) < 1e-9);
  for (const t of [250, 400]) view.frame({ nowMs: t });
  assert.equal(view.amount, 1);
  assert.ok(depthPass.renderOrder > 1.5 && depthPass.renderOrder < 5, 'wholly on: after the strip\'s depth pass (1.5) and before the brain\'s glass (5 and 6)');
  assert.equal(colourPass.material.blendDst, THREE.OneMinusSrcColorFactor);
  assert.equal(colourPass.material.uniforms.uCover.value, 0);
  view.setOn(false); view.frame({ nowMs: 450 });
  assert.ok(view.amount < 1 && depthPass.renderOrder > 200, 'easing out: after the glass again from the first frame');
  view.setOn(true); for (const t of [500, 700, 900]) view.frame({ nowMs: t });
  assert.ok(mapMeshes(objects.scene).every(m => m.visible), 'with the map on, every mesh of it is drawn');
  view.dispose();
  assert.equal(mapMeshes(objects.scene).length, 0, 'disposed: nothing of the map is left in the scene');
});

test('a throw inside the frame step switches the map off and hides every mesh of it (no dark ground left on the screen)', () => {
  const objects = fakeObjects();
  const view = createEmapView({ THREE, objects });
  view.prepare(INPUTS);
  view.work(1e9);
  view.setOn(true);
  for (const t of [0, 200, 400]) view.frame({ nowMs: t });
  assert.ok(mapMeshes(objects.scene).every(m => m.visible));
  const boom = new Proxy([], { get(target, key) { if (key === 'length') return 1; if (key === Symbol.iterator) return target[Symbol.iterator]; throw new Error('a link that cannot be read'); } });
  assert.equal(view.frame({ nowMs: 450, links: boom }), 0);
  const s = view.state();
  assert.match(String(s.error), /cannot be read/);
  assert.equal(view.on, false);
  assert.equal(view.amount, 0);
  assert.ok(mapMeshes(objects.scene).every(m => !m.visible), 'every mesh of the map is hidden');
  view.frame({ nowMs: 500 });
  assert.ok(mapMeshes(objects.scene).every(m => !m.visible), 'and stays hidden');
  view.dispose();
});

/** A lit route's light at points over `seconds`: the down lane, the up lane and the traffic, summed as one pixel would
 * if all three lay in it (the two lanes are a few pixels apart; the traffic weighted as the line shader does it: its
 * gain, your own body's share of it (the larger of the two bodies') and the wire's resting light, at least 0.35). */
function litSum(model, areaIds, points, seconds) {
  const st = createEmapState(model), fr = createEmapFrame(model), out = [];
  const w = p => EMAP_STORM.traffic.gain * EMAP_LOOK.trafficOwn * Math.max(model.wires[p.wire] ? (EMAP.idle[model.wires[p.wire].kind] ?? 0.35) : 0.35, 0.35);
  for (let f = 0; f <= seconds * RATE; f++) {
    const t = f / RATE;
    fr.now = t; fr.nLinks = 0;
    for (const id of areaIds) {
      const rec = model.areas[model.areaIndex.get(id)], region = BODY_MOTOR_MAP.regions.find(r => r.id === id), act = region.actions[0];
      const L = fr.links[fr.nLinks++];
      L.area = rec.index; L.action = act.id; L.level = 1; L.pulse = false; L.hint = false; L.sig = rec.index + 1; L.restart = false; L.n = 0;
      for (const mid of resolveMuscles(region, act)) { const mi = model.muscleIndex.get(mid); if (mi !== undefined && L.n < L.muscles.length) L.muscles[L.n++] = mi; }
    }
    emapStep(model, st, fr);
    let v = 0;
    for (const p of points) {
      const lanes = emapLightAt(model, st, { wire: p.wire, a: p.a, lane: 'down' }) + emapLightAt(model, st, { wire: p.wire, a: p.a, lane: 'up' });
      // (the resting pulses give way on a lit route, as the shader does)
      const cord = /^cord:/.test(model.wires[p.wire].key), q = ((p.a / EMAP.bead.downSpanS - t * EMAP.bead.downHz) % 1 + 1) % 1;
      const tr = cord ? Math.exp(-q * EMAP.bead.tail) + Math.exp(-(1 - q) * EMAP.bead.lead) : trafficAt(p.mm, t, trafficOf(p.wire, 'body'));
      v += lanes + w(p) * tr * (1 - Math.min(1, Math.max(0, lanes * 4)));
    }
    out.push(v);
  }
  return out;
}

test('the owner\'s rule on a lit route: the command\'s lane, the report\'s lane and the traffic together brighten and darken a point at most three times a second, along a nerve and at every level of the cord where its two strands lie in one pixel, for pairs of areas on both sides', () => {
  const model = buildEmap(INPUTS);
  // a nerve of the right leg while the left half's knee area is held: both lanes lit, steady after the front has passed
  const knee = 'lh_knee', rec = model.areas[model.areaIndex.get(knee)];
  const st = createEmapState(model), fr = createEmapFrame(model);
  const region = BODY_MOTOR_MAP.regions.find(r => r.id === knee), act = region.actions[0];
  const L = fr.links[0]; fr.nLinks = 1; fr.now = 0;
  L.area = rec.index; L.action = act.id; L.level = 1; L.pulse = false; L.hint = false; L.sig = 1; L.restart = false; L.n = 0;
  for (const mid of resolveMuscles(region, act)) { const mi = model.muscleIndex.get(mid); if (mi !== undefined && L.n < L.muscles.length) L.muscles[L.n++] = mi; }
  emapStep(model, st, fr);
  const m = model.muscles[st.slots[st.areaSlot[rec.index]].farMuscle];
  const trunkI = Array.from(m.wires).findIndex(wi => model.wires[wi].kind === 'trunk');
  const wire = m.wires[trunkI], W = model.wires[wire];
  for (const share of [0.25, 0.5, 0.75]) {
    const a = W.a0 + (Math.min(W.a1, m.tau[trunkI]) - W.a0) * share;
    const one = litSum(model, [knee], [{ wire, a, mm: 40 * share }], 4).slice(RATE); // (from the second second: the front has passed)
    assert.ok(Math.max(...one) > 0.3, 'the point is lit');
    assert.ok(peaksPerSecond(one, RATE) <= 3, `a nerve's point at ${share}: ${peaksPerSecond(one, RATE)} times in one second`);
  }
  // the cord: two areas lit (both strands carry a route, or one strand two), at six levels of the cord
  const cl = model.wires.find(x => x.key === 'cord:left'), cr = model.wires.find(x => x.key === 'cord:right');
  const top = Math.min(cl.a1, cr.a1);
  let lit = 0;
  for (const pair of [['rh_knee', 'lh_knee'], ['lh_hand', 'rh_toes'], ['rh_hand', 'lh_toes'], ['lh_hand', 'rh_hand']]) {
    for (const share of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8]) {
      const ac = top * share;
      const both = litSum(model, pair, [{ wire: cl.id, a: ac, mm: 300 * share }, { wire: cr.id, a: ac, mm: 300 * share }], 4).slice(RATE);
      if (Math.max(...both) > 0.3) lit++;
      assert.ok(peaksPerSecond(both, RATE) <= 3, `${pair.join(' + ')} at ${share} of the cord: ${peaksPerSecond(both, RATE)} times in one second`);
    }
  }
  assert.ok(lit >= 8, `${lit} lit cord points checked`);
});

test('the storms\' clocks start again with the map\'s: after a long time on, M off and on, the small flares come again at once', () => {
  const objects = fakeObjects();
  const view = createEmapView({ THREE, objects });
  view.prepare(INPUTS); view.work(1e9);
  view.setOn(true);
  for (let t = 0; t <= 60000; t += 50) view.frame({ nowMs: t });
  const before = view.state().scan.flares;
  assert.ok(before > 30, `${before} flares in a minute`);
  view.setOn(false);
  for (let t = 60050; t <= 61000; t += 50) view.frame({ nowMs: t });
  assert.equal(view.amount, 0);
  view.setOn(true);
  for (let t = 61050; t <= 66000; t += 50) view.frame({ nowMs: t });
  const after = view.state().scan.flares;
  assert.ok(after - before >= 1, `${after - before} flares in the 5 s after M off and on`);
  view.dispose();
});
