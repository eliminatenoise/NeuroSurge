/**
 * The electrical map's model (ns-emap.mjs, section 192): the routes, their timing and the per-frame state.
 *
 * The model is built here from the repository's own files with the stand-in nerve data (ns-emap-standin.mjs): the body
 * rig of packs/BODY-RIG.json, the brain meshes' boxes of inputs/MESH-MANIFEST.json, the motor map, and the muscles the
 * game lights for each movement (ns-body bodyMuscleDrives for the body's meshes, the left game arm's meshes by name).
 * The places of the motor areas on the strip are stand-ins here (the page takes the areas' own key points from the
 * segmented strip). Nothing is drawn: what a graphics card makes of the drawer's shader is the browser test's part.
 *
 * Run: node --test tests/emap.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';
import { bodyMuscleDrives } from '../scene/src/ns-body.mjs';
import {
  EMAP, EMAP_FLAG, EMAP_MODE, buildEmap, buildEmapSteps, brainBoxesFromManifest, syntheticAreaAnchors, emapRoute, createEmapState, createEmapFrame,
  emapStep, emapLightAt, emapLastVolley, sampleCurve
} from '../scene/src/ns-emap.mjs';
import { makeStandinWiring, STANDIN_CORD_LEVELS } from '../scene/src/ns-emap-standin.mjs';
import { emapShaders, EMAP_LOOK } from '../scene/src/ns-emap-three.mjs';
import { createEmapCard } from '../scene/src/ns-emap-card.mjs';
import { EMAP as WORDS, emapRouteLines, emapSlowLine, SHELL } from '../scene/src/ns-text.mjs';
import { createControls, bindDom, EMAP_CODE, EMAP_KEY_LABEL, DETAIL_CODE, VIEW_CODE, CONTROL_CODES, MOVE_CODES, AREA_CODES } from '../scene/src/ns-controls.mjs';
import { KEYBOARD_PICTURE_ROWS, EMAP_BUILD } from '../scene/src/ns-app.mjs';
import { CONTROLS_CARD_CHUNKS } from '../scene/src/ns-controls-card.mjs';
import { fakeDoc, all, hasClass } from './fake-doc.mjs';
import * as NsWiring from '../scene/src/ns-wiring-data.mjs';

const read = f => JSON.parse(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const rig = read('packs/BODY-RIG.json').rig, manifest = read('inputs/MESH-MANIFEST.json');

/** Everything buildEmap needs, from the files (see the head of this file). */
function inputs() {
  const boxes = brainBoxesFromManifest(manifest.assets);
  const muscles = [];
  for (const m of rig.muscles) {
    const s = rig.meshSegment[m.id], b = (s && s.blend) || [];
    if (s && s.restCentroid) muscles.push({ id: m.id, name: m.name, side: m.side, rig: 'body', seg: s.segment, seg2: b[1] ? b[1][0] : null, w2: b[1] ? b[1][1] : 0, centre: s.restCentroid });
  }
  for (const a of manifest.assets) {
    if (!(a.groups || []).some(g => /left_upper_limb_muscle/.test(g))) continue;
    const c = [0, 1, 2].map(i => (a.bounds_min[i] + a.bounds_max[i]) / 2);
    muscles.push({ id: a.element_id, name: String(a.embedded_source_name), side: 'left', rig: 'arm', seg: c[2] > 1000 ? 'upperarm' : c[2] > 720 ? 'ulna' : 'hand', centre: c });
  }
  const armNames = muscles.filter(m => m.rig === 'arm').map(m => [m.id, m.name.toLowerCase()]);
  const cache = new Map();
  const resolveMuscles = (r, act) => {
    if (cache.has(act.id)) return cache.get(act.id);
    const out = new Set();
    if (r.isLeftArm) for (const n of [...(act.agonists || []), ...(act.stabilizers || []), ...(act.antagonists || [])]) { const q = String(n).toLowerCase(); for (const [id, nm] of armNames) if (nm.includes(q)) out.add(id); }
    for (const id of Object.keys(bodyMuscleDrives([{ actionId: act.id, level: 1, agonists: act.agonists || [], antagonists: act.antagonists || [], stabilizers: act.stabilizers || [] }], { rig }))) out.add(id);
    cache.set(act.id, [...out]);
    return cache.get(act.id);
  };
  return { bodyMap: BODY_MOTOR_MAP, rig, boxes, areas: syntheticAreaAnchors(BODY_MOTOR_MAP, boxes), muscles, wiring: makeStandinWiring(rig), resolveMuscles };
}
const IN = inputs();
const model = buildEmap(IN);
const regions = BODY_MOTOR_MAP.regions;
const sideOfMuscle = id => model.muscles[model.muscleIndex.get(id)].side;

/** A frame with one link of an area: the muscles the game lights for that movement. */
function linkFrame(frame, region, action, now, { level = 1, hint = false, restart = false, reduced = false, pulse = true } = {}) {
  frame.now = now; frame.reduced = reduced; frame.nLit = 0; frame.nLinks = 0;
  if (!region) return frame;
  const L = frame.links[0];
  L.area = model.areaIndex.get(region.id); L.action = action ? action.id : null; L.level = level; L.pulse = pulse; L.hint = hint; L.restart = restart; L.sig = 1; L.n = 0;
  if (action) for (const id of IN.resolveMuscles(region, action)) if (L.n < L.muscles.length) L.muscles[L.n++] = model.muscleIndex.get(id);
  frame.nLinks = 1;
  return frame;
}
const knee = regions.find(r => r.id === 'lh_knee'), kneeFlex = knee.actions[0];

test('the model builds from the files with no warning, and every one of the 54 areas and both rigs\' muscles is in it', () => {
  assert.equal(model.kind, 'ns-emap-model');
  assert.deepEqual(model.warnings, []);
  assert.equal(model.areas.length, 54);
  assert.equal(regions.reduce((n, r) => n + r.actions.length, 0), 142);
  assert.equal(model.muscles.length, new Set(IN.muscles.map(m => m.id)).size, 'every muscle mesh once (a few meshes of the left shoulder are in both rigs\' lists)');
  assert.ok(model.muscles.filter(m => m.rig === 'arm').length >= 40, 'the left game arm\'s muscles');
  assert.ok(model.standIn, 'built from the stand-in nerve data');
});

test('every one of the 142 movements has a complete route to each of its muscles, block to muscle, in order', () => {
  let pairs = 0;
  for (const r of regions) for (const act of r.actions) {
    const ids = IN.resolveMuscles(r, act);
    assert.ok(ids.length > 0, `${act.id} names muscles the game has`);
    for (const id of ids) {
      const rt = emapRoute(model, r.id, act.id, id);
      assert.ok(rt && rt.complete, `${r.id} ${act.id} -> ${id}`);
      pairs++;
      assert.equal(rt.wires[0].kind, 'twig');
      assert.equal(rt.wires[1].kind, 'fibre');
      assert.equal(rt.wires[2].kind, 'tail');
      assert.equal(rt.wires[3].kind, 'bridge');
      assert.equal(rt.wires[rt.wires.length - 1].kind, 'branch');
      // the coordinate never runs backward along the route: each wire is used from its start to its `tau`
      for (let i = 0; i + 1 < rt.wires.length; i++) {
        const w = rt.wires[i], end = Math.min(w.a1, w.tau), next = rt.wires[i + 1];
        assert.ok(end >= w.a0 - 1e-9, `${w.key} is used forward`);
        assert.ok(Math.abs(next.a0 - end) < 0.004, `${w.key} hands over to ${next.key} (${end} -> ${next.a0})`);
      }
      assert.ok(rt.stations.length >= 6 && rt.stations[0].startsWith('motor area') && rt.stations[rt.stations.length - 1].startsWith('muscle'));
    }
  }
  assert.ok(pairs > 900, `${pairs} routes`);
});

test('every station resolves: finite places, a real thing to ride, a wire and a coordinate for every vertex', () => {
  const V = model.vertices, n = model.vertexCount, P = model.palette;
  assert.equal(P.size, 1 + 2 * (rig.segmentOrder.length + P.armSegs.length));
  for (const a of [V.pa, V.pb, V.ta, V.tb, V.bind, V.geo, V.sig]) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) assert.fail(`a vertex value is not a number at ${i}`);
  const bridge = EMAP_FLAG.bridge;
  for (let v = 0; v < n; v++) {
    const ia = V.bind[4 * v], ib = V.bind[4 * v + 1], w = V.bind[4 * v + 2], wire = V.sig[4 * v], fl = V.sig[4 * v + 3];
    assert.ok(Number.isInteger(ia) && ia >= 0 && ia < P.size && Number.isInteger(ib) && ib >= 0 && ib < P.size, `palette of vertex ${v}`);
    assert.ok(w >= 0 && w <= 1);
    assert.ok(Number.isInteger(wire) && wire >= 0 && wire < model.wireCount);
    // a brain vertex rides the brain; a body vertex never does, except the drawn bridge (the brain at one end)
    if (fl & EMAP_FLAG.brain) assert.ok(ia === 0 && ib === 0);
    else if (fl & bridge) assert.ok(ia === 0 && ib > 0 && ib <= P.stride, 'a bridge joins the brain and the mirror body');
    else assert.ok(ia > 0 && ib > 0);
    if (fl & EMAP_FLAG.own) assert.ok(ia > P.stride && ib > P.stride, 'your own body\'s copy rides your own segments');
  }
  for (let i = 0; i < model.indexCount; i++) assert.ok(V.index[i] < n);
  // the left arm of the body atlas is the game arm's rig
  const arm = model.muscles.filter(m => m.rig === 'arm');
  for (const m of arm) assert.ok(m.seg >= P.armBase, `${m.name} rides the game arm`);
});

test('crossing follows the body map\'s laterality: a "contralateral" area crosses to every muscle; a muscle on the area\'s own side is reached without crossing', () => {
  let crossed = 0, same = 0;
  for (const r of regions) for (const act of r.actions) for (const id of IN.resolveMuscles(r, act)) {
    const rt = emapRoute(model, r.id, act.id, id), far = sideOfMuscle(id) !== (r.hemisphere === 'left' ? 1 : -1);
    assert.equal(rt.crosses, far, `${r.id} -> ${id}: crossing = the muscle is on the other side`);
    if (r.laterality === 'contralateral') assert.ok(rt.crosses, `${r.id} is contralateral: ${id} must be on the far side`);
    if (rt.crosses) { crossed++; assert.ok(rt.stations.some(s => /cross/.test(s))); } else same++;
  }
  assert.ok(crossed > 500 && same > 100, `${crossed} crossed, ${same} uncrossed`);
  // both tails exist where the map says both sides, and the uncrossed one is drawn weaker unless the field says bilateral
  assert.ok(EMAP.sameSide.contralateral < EMAP.sameSide.contralateral_predominant && EMAP.sameSide.contralateral_predominant < EMAP.sameSide.bilateral);
});

test('the areas of the face, jaw, tongue and throat do not use the cord for a muscle a head nerve serves, and a head nerve never passes the cord', () => {
  let cranial = 0;
  const headTrunks = new Set(model.trunks.filter(t => t.origin).map(t => t.id));
  assert.ok(headTrunks.size >= 4);
  for (const m of model.muscles) {
    const viaHead = headTrunks.has(m.trunk) || headTrunks.has(model.trunks.find(t => t.id === m.trunk).top);
    const kinds = [...m.wires].map(w => model.wires[w].kind);
    assert.equal(kinds.includes('cord') || kinds.includes('root'), !viaHead, `${m.name}: cord and roots only for a spinal nerve`);
    assert.equal(m.exit.startsWith('cn:'), viaHead);
  }
  for (const r of regions.filter(g => g.pathway === 'corticobulbar')) for (const act of r.actions) for (const id of IN.resolveMuscles(r, act)) {
    const rt = emapRoute(model, r.id, act.id, id), m = model.muscles[model.muscleIndex.get(id)];
    if (!m.exit.startsWith('cn:')) continue;
    cranial++;
    assert.equal(rt.usesCord, false);
    assert.ok(!rt.wires.some(w => w.kind === 'cord' || w.kind === 'root'), `${r.id} -> ${m.name}`);
    assert.ok(rt.stations.some(s => /head nerve/.test(s)));
  }
  assert.ok(cranial > 150, `${cranial} routes by head nerves`);
});

test('the in-between areas send nothing down: no fibre, no way out, only links to other brain regions', () => {
  const scans = regions.filter(r => r.kind === 'integration');
  assert.equal(scans.length, 6);
  for (const r of scans) {
    const rec = model.areas[model.areaIndex.get(r.id)];
    assert.equal(rec.down, false);
    assert.equal(rec.fibre, null);
    assert.equal(rec.exits.size, 0);
    assert.ok(rec.links.length >= 3, 'its links are drawn');
    assert.equal(emapRoute(model, r.id, null, model.muscles[0].id), null);
  }
  for (const r of regions.filter(g => g.kind !== 'integration')) assert.ok(model.areas[model.areaIndex.get(r.id)].fibre, `${r.id} has a fibre down`);
});

test('the farthest muscle of any movement is reached within the stated time, nearer muscles sooner, and the legend\'s factor follows the speed', () => {
  assert.ok(model.speedMmS >= EMAP.speedMmS);
  let worst = 0;
  for (const r of regions) for (const act of r.actions) for (const id of IN.resolveMuscles(r, act)) worst = Math.max(worst, emapRoute(model, r.id, act.id, id).arrivalS);
  assert.ok(worst <= EMAP.arriveMaxS + 1e-9, `the farthest arrival is ${worst} s`);
  assert.ok(Math.abs(model.longest.s - worst) < 1e-9);
  const hand = regions.find(r => r.id === 'lh_hand'), toes = regions.find(r => r.id === 'lh_toes');
  const t = (r, a) => Math.max(...IN.resolveMuscles(r, a).map(id => emapRoute(model, r.id, a.id, id).arrivalS));
  assert.ok(t(hand, hand.actions[0]) < t(toes, toes.actions[0]), 'the hand answers before the foot');
  assert.ok(Math.abs(model.slow.command - EMAP.realMmS / model.speedMmS) < 1e-9);
  assert.ok(model.slow.command > 2 && model.slow.command < 6, `the command is drawn ${model.slow.command} times slower than a real one`);
  assert.ok(Math.abs(model.slow.report - model.slow.command / EMAP.upShare) < 1e-9);
  // the report of the farthest muscle is back at the strip in about half a second after its muscle lit
  assert.ok(model.longest.s / EMAP.upShare > 0.4 && model.longest.s / EMAP.upShare < 0.6);
});

test('a volley: the front leaves the block at once, reaches each muscle at its own time, the report comes back up, and the route fades', () => {
  const st = createEmapState(model), frame = createEmapFrame(model);
  const ids = IN.resolveMuscles(knee, kneeFlex), far = ids.map(id => model.muscles[model.muscleIndex.get(id)]).sort((a, b) => b.a - a.a)[0];
  const rt = emapRoute(model, knee.id, kneeFlex.id, far.id), twig = rt.wires[0], arrive = rt.arrivalS;
  const muscleLight = () => emapLightAt(model, st, { wire: far.branch, a: far.a, lane: 'down', dot: 'muscle' });
  let t = 10;
  emapStep(model, st, linkFrame(frame, knee, kneeFlex, t));
  assert.equal(st.active, 1);
  assert.equal(st.volleys, 1);
  for (let i = 1; i <= 3; i++) emapStep(model, st, linkFrame(frame, knee, kneeFlex, t + i * 0.016)); // the level comes up
  assert.ok(emapLightAt(model, st, { wire: twig.id, a: twig.a0, lane: 'down', brain: true }) > 0.3, 'the block\'s twig is lit at once');
  assert.equal(muscleLight(), 0, 'the muscle is dark before the front arrives');
  // step to just before and just after the arrival
  const until = dt => { while (st.now < t + dt - 1e-9) emapStep(model, st, linkFrame(frame, knee, kneeFlex, Math.min(st.now + 1 / 60, t + dt))); };
  until(arrive - 0.004);
  assert.equal(muscleLight(), 0);
  until(arrive + 0.004);
  assert.ok(muscleLight() > 0.5, 'the muscle\'s mark is lit when the front arrives');
  assert.ok(arrive <= EMAP.arriveMaxS);
  // the report: nothing at the cord's top yet; later it has passed, and the patch on the sensory strip is lit
  const cordWire = rt.wires.find(w => w.kind === 'cord'), rec = model.areas[model.areaIndex.get(knee.id)], sens = model.wires[rec.exits.get(far.exit).sens];
  assert.equal(emapLightAt(model, st, { wire: cordWire.id, a: cordWire.a0 + 0.001, lane: 'up' }), 0, 'the report has not reached the neck yet');
  until(arrive + (far.a - sens.a0) / model.kUp + 0.05);
  assert.ok(emapLightAt(model, st, { wire: cordWire.id, a: cordWire.a0 + 0.001, lane: 'up' }) > 0.1, 'the report has passed up the cord');
  assert.ok(emapLightAt(model, st, { wire: sens.id, a: sens.a0, lane: 'up', dot: 'patch' }) > 0.3, 'the patch on the sensory strip glows');
  const v = emapLastVolley(model, st);
  assert.equal(v.area, 'lh_knee'); assert.equal(v.movement, kneeFlex.id); assert.ok(v.stations.length >= 6); assert.ok(v.arrivalS > 0 && v.arrivalS <= EMAP.arriveMaxS);
  // the movement's own light ends: the route fades over fadeS and the slot and its wires are given back
  const end = st.now;
  while (st.now < end + EMAP.fadeS + 0.1) emapStep(model, st, linkFrame(frame, null, null, st.now + 1 / 60));
  assert.equal(st.active, 0, 'the route is gone after the fade');
  let owned = 0;
  for (let i = 0; i < model.wireCount; i++) { const k = 4 * i; const d = st.wireTex[k], u = st.wireTex[k + 2]; if ((d > 0 && d <= EMAP.slots - EMAP.sparkSlots) || u > 0) owned++; }
  assert.equal(owned, 0, 'no wire is left with the area');
});

test('the uncrossed way and the crossing are different wires, and a report never lights the command\'s lane', () => {
  const st = createEmapState(model), frame = createEmapFrame(model);
  emapStep(model, st, linkFrame(frame, knee, kneeFlex, 5));
  for (let i = 1; i < 40; i++) emapStep(model, st, linkFrame(frame, knee, kneeFlex, 5 + i / 60));
  const rec = model.areas[model.areaIndex.get(knee.id)], x = rec.exits.get('cordR');
  assert.ok(x && x.cross, 'the left half\'s knee area crosses to the right side\'s cord');
  assert.ok(emapLightAt(model, st, { wire: x.tail, a: model.wires[x.tail].a0, lane: 'down', brain: true }) > 0.2);
  assert.equal(emapLightAt(model, st, { wire: x.tail, a: model.wires[x.tail].a0, lane: 'up', brain: true }), 0, 'the fibre down carries no report');
  assert.equal(emapLightAt(model, st, { wire: x.sens, a: model.wires[x.sens].a1, lane: 'down', brain: true }), 0, 'the fibre up carries no command');
  // the left-side cord strand is not lit by a movement of the right leg
  const left = model.wires.find(w => w.key === 'cord:left');
  assert.equal(emapLightAt(model, st, { wire: left.id, a: left.a0 + 0.01, lane: 'down' }), 0);
});

test('calm: beads pass a point at most three times a second, the light of a lit line never drops to dark between them, and no light is negative', () => {
  assert.ok(EMAP.bead.downHz <= 3 && EMAP.bead.upHz <= 3);
  assert.ok(EMAP.light.hold > 0.2, 'a lit line keeps a steady share of its light between beads');
  const st = createEmapState(model), frame = createEmapFrame(model);
  const rt = emapRoute(model, knee.id, kneeFlex.id, IN.resolveMuscles(knee, kneeFlex)[0]), trunk = rt.wires.find(w => w.kind === 'trunk');
  let lo = Infinity, hi = 0, ups = 0, last = 0, rising = false;
  for (let i = 0; i < 240; i++) {
    emapStep(model, st, linkFrame(frame, knee, kneeFlex, 20 + i / 120));
    if (i < 60) continue; // (the front has passed)
    const v = emapLightAt(model, st, { wire: trunk.id, a: trunk.a0 + 0.002, lane: 'down' });
    assert.ok(v >= 0);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
    if (v > last + 1e-6 && !rising) { rising = true; ups++; } else if (v < last - 1e-6) rising = false;
    last = v;
  }
  assert.ok(lo > 0.3 * hi, `a lit line stays lit between beads (${lo} of ${hi})`);
  assert.ok(ups <= Math.ceil(1.5 * EMAP.bead.downHz) + 1, `${ups} beads in 1.5 s`);
});

test('reduced motion: lit routes without travel, steady, and no sparks', () => {
  const st = createEmapState(model), frame = createEmapFrame(model);
  const ids = IN.resolveMuscles(knee, kneeFlex), far = model.muscles[model.muscleIndex.get(ids[0])];
  emapStep(model, st, linkFrame(frame, knee, kneeFlex, 3, { reduced: true }));
  // the whole route is lit in the first frame: no front to wait for
  const first = emapLightAt(model, st, { wire: far.branch, a: far.a, lane: 'down', dot: 'muscle' });
  assert.ok(first > 0.3, 'the muscle\'s mark is lit at once');
  const trunk = emapRoute(model, knee.id, kneeFlex.id, far.id).wires.find(w => w.kind === 'trunk');
  const seen = new Set();
  for (let i = 1; i < 90; i++) {
    emapStep(model, st, linkFrame(frame, knee, kneeFlex, 3 + i / 60, { reduced: true }));
    seen.add(emapLightAt(model, st, { wire: trunk.id, a: trunk.a0 + 0.003, lane: 'down' }).toFixed(6));
    seen.add(emapLightAt(model, st, { wire: trunk.id, a: trunk.a0 + 0.003, lane: 'up' }).toFixed(6));
    assert.equal(st.sparks, 0);
  }
  assert.ok(seen.size <= 2, `the light does not change with time (${[...seen].join(', ')})`);
  for (let i = 0; i < 600; i++) { emapStep(model, st, linkFrame(frame, null, null, 5 + i / 30, { reduced: true })); assert.equal(st.sparks, 0); }
});

test('the resting storm: a few slow sparks, never more than the stated number, each rising and fading over a second or more', () => {
  const st = createEmapState(model), frame = createEmapFrame(model);
  let most = 0, seenAny = false;
  for (let i = 0; i < 3600; i++) {
    emapStep(model, st, linkFrame(frame, null, null, i / 60));
    most = Math.max(most, st.sparks);
    if (st.sparks > 0) seenAny = true;
    assert.equal(st.active, 0);
  }
  assert.ok(seenAny && most <= EMAP.spark.max, `${most} sparks at most`);
  assert.ok(EMAP.spark.max <= 6 && EMAP.spark.lifeS[0] >= 1);
  // one spark's light at its own middle: it rises from nothing and returns to nothing
  const s = st.slots.find(q => q.mode === EMAP_MODE.spark);
  assert.ok(s, 'a spark is alive');
  const wire = s.wires[0], b = 16 * s.index, life = st.slotTex[b + 10], t0 = st.slotTex[b + 4], a0 = st.slotTex[b + 5], v = st.slotTex[b + 8];
  const keep = st.now;
  const at = f => { st.now = t0 + f * life; return emapLightAt(model, st, { wire, a: a0 + v * f * life, lane: 'down' }); };
  assert.ok(at(0) < 0.02 && at(1) < 0.02 && at(0.5) > 0.9 && at(0.25) > 0.3 && at(0.25) < at(0.5));
  st.now = keep;
});

test('a new activation of an area whose last one is still fading starts a new volley; a hint never replaces a live one', () => {
  const st = createEmapState(model), frame = createEmapFrame(model);
  for (let i = 0; i < 30; i++) emapStep(model, st, linkFrame(frame, knee, kneeFlex, 1 + i / 60));
  for (let i = 0; i < 12; i++) emapStep(model, st, linkFrame(frame, null, null, 1.5 + i / 60)); // fading
  assert.equal(st.active, 1);
  const t0 = st.slots[st.areaSlot[model.areaIndex.get(knee.id)]].t0;
  emapStep(model, st, linkFrame(frame, knee, kneeFlex, 1.75, { hint: true }));
  assert.equal(st.slots[st.areaSlot[model.areaIndex.get(knee.id)]].t0, t0, 'the hint left the fading volley alone');
  emapStep(model, st, linkFrame(frame, knee, kneeFlex, 1.8));
  assert.equal(st.volleys, 2);
  assert.ok(Math.abs(st.slots[st.areaSlot[model.areaIndex.get(knee.id)]].t0 - 1.8) < 1e-9, 'the front starts again');
  assert.equal(st.active, 1, 'still one slot for the area');
  // a movement the player holds (keys, Space, the neck following the look) comes and goes with its speed: it joins the
  // light that is there and sends no new front each time (no flicker of fronts)
  const st2 = createEmapState(model);
  for (let i = 0; i < 20; i++) emapStep(model, st2, linkFrame(frame, knee, kneeFlex, 3 + i / 60, { pulse: false }));
  for (let i = 0; i < 6; i++) emapStep(model, st2, linkFrame(frame, null, null, 3.4 + i / 60));
  for (let i = 0; i < 6; i++) emapStep(model, st2, linkFrame(frame, knee, kneeFlex, 3.5 + i / 60, { pulse: false }));
  assert.equal(st2.volleys, 1, 'one volley: the held movement rejoined it');
  assert.ok(Math.abs(st2.slots[st2.areaSlot[model.areaIndex.get(knee.id)]].t0 - 3) < 1e-9);
  emapStep(model, st2, linkFrame(frame, knee, kneeFlex, 3.7)); // then a look at the same area: an activation, a front
  assert.equal(st2.volleys, 2);
});

test('an in-between area lit by a look shows its links only: pulses run out along them and are gone within a second', () => {
  const st = createEmapState(model), frame = createEmapFrame(model);
  const scan = regions.find(r => r.kind === 'integration'), rec = model.areas[model.areaIndex.get(scan.id)];
  const lit = now => { frame.now = now; frame.reduced = false; frame.nLinks = 0; frame.nLit = 1; frame.lit[0].area = rec.index; frame.lit[0].level = 1; return frame; };
  for (let i = 0; i <= 12; i++) emapStep(model, st, lit(2 + i / 60));
  const link = model.wires[rec.links[0]];
  const near = emapLightAt(model, st, { wire: link.id, a: 0.2, lane: 'down', link: true, brain: true });
  assert.ok(near > 0.2, `the pulse is on its way (${near})`);
  for (let i = 13; i <= 66; i++) emapStep(model, st, lit(2 + i / 60));
  for (const a of [0, 0.2, 0.5, EMAP.link.travelS]) assert.ok(emapLightAt(model, st, { wire: link.id, a, lane: 'down', link: true, brain: true }) < 0.02, 'gone within a second');
  assert.equal(st.wireTex[4 * model.wires.findIndex(w => w.kind === 'cord')], 0, 'nothing went down');
});

test('the per-frame step makes no garbage: hundreds of thousands of frames with a route coming and going and sparks, and no collection', async () => {
  // A collection happens only when something was allocated, so its count over a long run is the measure. (The heap's
  // size is not: code that is not yet optimised boxes its numbers.) The loop itself keeps its clock in a typed array.
  const st = createEmapState(model), frame = createEmapFrame(model), clock = new Float64Array(1);
  let gcs = 0;
  const obs = new PerformanceObserver(list => { gcs += list.getEntries().length; });
  obs.observe({ entryTypes: ['gc'] });
  linkFrame(frame, knee, kneeFlex, 0); // filled once; the loop only sets the clock and whether the link is there
  const run = n => { for (let i = 0; i < n; i++) { clock[0] += 1 / 60; frame.now = clock[0]; frame.nLinks = i % 400 < 200 ? 1 : 0; emapStep(model, st, frame); } };
  run(20000); // warm: the optimiser
  await new Promise(r => setTimeout(r, 30));
  gcs = 0;
  run(300000);
  await new Promise(r => setTimeout(r, 30));
  obs.disconnect();
  assert.ok(st.volleys > 700, `${st.volleys} volleys started`);
  assert.ok(gcs <= 2, `${gcs} collections during 300 000 frames`);
  assert.equal(st.dropped, 0);
  // and nothing was replaced: the tables are the arrays made at the start
  assert.equal(st.slotTex.length, 16 * EMAP.slots);
  assert.equal(st.wireTex.length, 4 * model.wireTexW * model.wireTexH);
});

test('the build can be run in small steps (the page does it a few milliseconds at a time), with the same result', () => {
  const g = buildEmapSteps(IN);
  let steps = 0, r = g.next();
  while (!r.done) { steps++; r = g.next(); }
  assert.ok(steps > 200, `${steps} steps`);
  assert.equal(r.value.vertexCount, model.vertexCount);
  assert.equal(r.value.wireCount, model.wireCount);
  assert.deepEqual(Array.from(r.value.vertices.sig.subarray(0, 4000)), Array.from(model.vertices.sig.subarray(0, 4000)));
});

test('a smooth line passes through its control points, and a point between two segments is a blend of the two', () => {
  const nodes = sampleCurve([{ p: [0, 0, 0], seg: 3 }, { p: [10, 0, 0], seg: 3 }, { p: [20, 8, 0], seg: 5 }], 2);
  assert.deepEqual(nodes[0].p, [0, 0, 0]);
  assert.deepEqual(nodes[nodes.length - 1].p, [20, 8, 0]);
  assert.ok(nodes.some(n => Math.abs(n.p[0] - 10) < 1e-9 && Math.abs(n.p[1]) < 1e-9));
  const mid = nodes.filter(n => n.ia === 3 && n.ib === 5 && n.w > 0 && n.w < 1);
  assert.ok(mid.length >= 3, 'blended nodes across the joint');
  for (let i = 1; i < nodes.length; i++) assert.ok(Math.hypot(nodes[i].p[0] - nodes[i - 1].p[0], nodes[i].p[1] - nodes[i - 1].p[1]) < 3.2, 'evenly spaced');
});

test('the stand-in nerve data has the contract\'s shapes: trunks with courses on real segments, both sides, cord levels with places, links between real meshes', () => {
  const W = IN.wiring;
  assert.equal(W.standIn, true);
  const ids = new Set(manifest.assets.map(a => a.element_id));
  for (const [id, t] of Object.entries(W.NERVE_TRUNKS)) {
    assert.equal(t.id, id);
    assert.ok(typeof t.name === 'string' && typeof t.plain === 'string' && Array.isArray(t.roots) && t.course.length >= 2);
    for (const c of t.course) { assert.ok(rig.segments[c.seg], `${id}: segment ${c.seg}`); assert.ok(c.p.length === 3 && c.p.every(Number.isFinite)); assert.ok(c.p[0] <= 1, 'the right side or the middle'); }
    for (const lv of t.roots) assert.ok(STANDIN_CORD_LEVELS.includes(lv));
    assert.ok(t.roots.length > 0 || ['midbrain', 'pons', 'medulla'].includes(t.origin), `${id} hangs on the cord or the brainstem`);
    const m = W.mirrorTrunk(id);
    assert.ok(m && m.id !== id && m.course.length === t.course.length && m.course[0].p[0] === -t.course[0].p[0], 'the left side mirrors the right');
  }
  let lastZ = Infinity;
  for (const lv of W.CORD_LEVELS) {
    const at = W.cordLevelAt(lv), A = rig.pivots[at.fromPivot].point, B = rig.pivots[at.toPivot].point, z = A[2] + (B[2] - A[2]) * at.t;
    assert.ok(z < lastZ, `${lv} lies below the level above it`);
    lastZ = z;
  }
  assert.ok(lastZ > rig.pivots.l2_l3.point[2], 'the cord ends above the joint of the second and third lumbar vertebrae');
  for (const l of W.BRAIN_LINKS) { assert.ok(ids.has(l.from) && ids.has(l.to)); for (const v of l.via || []) assert.ok(ids.has(v)); assert.equal(typeof l.crosses, 'boolean'); }
  assert.equal(W.nerveForMuscle('nothing the rules name'), null);
  assert.equal(W.nerveForMuscle('left zygomaticus major').trunk, 'l_facial');
});

/* ---- the M key, the words, the legend, the shader's text (the page's part is tests/browser-emap.mjs) ---- */

class Bucket {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, fields = {}) {
    const event = { timeStamp: performance.now(), prevented: false, preventDefault() { this.prevented = true; }, ...fields };
    for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
    return event;
  }
}

test('the M key is a page command like R: one request per press, taken from the browser, never on repeat or with Alt, and it moves nothing', () => {
  assert.equal(EMAP_CODE, 'KeyM');
  assert.equal(EMAP_KEY_LABEL, 'M');
  for (const code of [DETAIL_CODE, VIEW_CODE, ...CONTROL_CODES, ...MOVE_CODES, ...AREA_CODES, 'Escape', 'ShiftLeft', 'ShiftRight']) assert.notEqual(code, EMAP_CODE, 'no other control uses M');
  const controls = createControls();
  let state = controls.initialState(), asked = 0, gate = true;
  const view = new Bucket(), doc = new Bucket(), canvas = new Bucket();
  view.performance = performance; doc.defaultView = view; canvas.ownerDocument = doc; doc.pointerLockElement = null;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  const gated = { ...controls, toggleEmap: (s, t) => (gate ? controls.toggleEmap(s, t) : s) };
  const unbind = bindDom(canvas, gated, () => state, next => { state = next; }, { onEmap: () => { asked++; } });
  const before = state;
  let e = view.emit('keydown', { code: 'KeyM', target: canvas });
  assert.ok(e.prevented, 'the page takes the key');
  assert.equal(asked, 1);
  assert.deepEqual(state.ui.map(u => u.type), ['emap']);
  assert.deepEqual(state.keys, before.keys, 'no control key is held or let go');
  assert.equal(state.events.length, before.events.length, 'nothing is queued for the game');
  e = view.emit('keydown', { code: 'KeyM', target: canvas, repeat: true });
  assert.ok(e.prevented);
  assert.equal(asked, 1, 'a held key toggles once');
  e = view.emit('keydown', { code: 'KeyM', target: canvas, altKey: true });
  assert.ok(!e.prevented, 'Alt + M is the browser\'s');
  assert.equal(asked, 1);
  view.emit('keydown', { code: 'KeyM', target: canvas, ctrlKey: true });
  assert.equal(asked, 1, 'a Ctrl chord is the browser\'s');
  gate = false; // (the app's gate: only while playing)
  view.emit('keydown', { code: 'KeyM', target: canvas });
  assert.equal(asked, 1, 'refused behind a pause page');
  assert.equal(controls.drainUiEvents(state).length, 1);
  unbind();
});

test('M is on every list of keys: the Esc page\'s rows, the keyboard picture, the five-second card, the capture line', () => {
  assert.ok(SHELL.controls.some(row => row[0] === 'M' && /electrical map/.test(row[1]) && /not a recording/.test(row[1])));
  assert.ok(SHELL.introControls.some(row => row[0] === 'M'));
  const view = SHELL.menu.find(g => g.id === 'view');
  assert.ok(view.keys.includes('M') && view.rows.some(r => r[0] === 'M'));
  assert.ok(KEYBOARD_PICTURE_ROWS.find(r => r.row === 'z').keys.includes(EMAP_CODE), 'M sits in the bottom letter row, right of N');
  assert.equal(SHELL.keyboard.names.KeyM, 'M');
  assert.equal(SHELL.keyboard.keys.KeyM, 'map');
  assert.match(SHELL.keyboard.label, /\bM\b/);
  // (22 November 2026: M is not on the five-second card, the owner's own four chunks; it is on the capture line and the
  // Esc page)
  assert.ok(!CONTROLS_CARD_CHUNKS.some(c => c.keys && c.keys.flat().includes('M')));
  assert.match(SHELL.captureHint, /M: electrical map · Esc: controls$/);
});

test('the legend\'s words: a title and three short lines, the route of the area under the look, honest and plain', () => {
  assert.equal(WORDS.title, 'Electrical map');
  for (const line of [WORDS.down, WORDS.up, WORDS.scan]) assert.ok(line.length <= 48, `short: ${line}`);
  assert.ok(WORDS.honest.length <= 66, 'one short line of honesty');
  assert.match(WORDS.honest, /Made-up activity/); assert.match(WORDS.honest, /live brain scan/); assert.match(WORDS.honest, /Not a recording/);
  assert.match(WORDS.more.typical, /typical and simplified/); assert.match(WORDS.more.typical, /not traced from a scan/);
  assert.match(WORDS.more.bridge, /mirror body’s own brain/);
  const all54 = regions.map(r => emapRouteLines(r));
  for (const [i, lines] of all54.entries()) {
    assert.ok(lines.length >= 1 && lines.length <= 4, `${regions[i].id}: a few lines`);
    for (const line of lines) assert.ok(typeof line === 'string' && line.length > 20 && /[.!?]$/.test(line.trim()));
    // little text: the legend's More detail is a low card above the information panel (nine lines of about 42 letters)
    assert.ok(lines.join(' ').length <= 330, `${regions[i].id}: ${lines.join(' ').length} letters`);
    assert.ok(lines.every(line => !/[()]/.test(line) || line === WORDS.more.cross), `${regions[i].id}: the bracketed terms are left to the information panel`);
    if (lines.length > 1) { assert.equal(lines.at(-1), WORDS.more.routeNote); assert.equal(lines.at(-2), WORDS.more.back); assert.ok([WORDS.more.out, WORDS.more.outHead].includes(lines.at(-3))); }
  }
  const byId = id => emapRouteLines(regions.find(r => r.id === id));
  assert.equal(byId('rh_brow')[1], WORDS.more.outHead, 'a face area\'s signal leaves along a nerve of the head, not down the cord');
  assert.equal(byId('rh_toes')[1], WORDS.more.out);
  assert.match(WORDS.more.routeNote, /typical/); assert.match(WORDS.more.routeNote, /simplified/);
  assert.deepEqual(emapRouteLines(regions.find(r => r.kind === 'integration')), [WORDS.more.none]);
  assert.deepEqual(emapRouteLines(null), [WORDS.more.lookAt]);
  assert.match(emapRouteLines(knee)[0], /cross to the other side/, 'the knee area\'s own sentence about its fibres is reused');
  // the speed line states the factors in round numbers, from the map's own speeds
  const slow = emapSlowLine(model.slow.command, model.slow.report);
  assert.match(slow, /made up by the game \(simulated\)/);
  assert.match(slow, new RegExp(`command is drawn about ${Math.round(model.slow.command)} times slower than in a real nerve`));
  assert.match(slow, new RegExp(`report about ${Math.round(model.slow.report)} times slower`));
  // what kind of picture this is, before any area was looked at: short enough for the low card too
  assert.ok([WORDS.more.lookAt, WORDS.more.bridge, WORDS.more.typical, slow].join(' ').length <= 420);
  // nothing in the map's words claims a measurement or a recording
  const everything = [WORDS.title, WORDS.down, WORDS.up, WORDS.honest, ...Object.values(WORDS.more), slow].join(' ');
  assert.doesNotMatch(everything, /\b(real signal|validated|decod|stimulat)/i);
});

test('the legend card: one chunk, built with createElement and textContent, rewritten only when its words change', () => {
  const doc = fakeDoc(), root = doc.createElement('div');
  const card = createEmapCard({ doc, root, text: WORDS });
  assert.ok(card && hasClass(card.el, 'ns-emap-card'));
  assert.equal(root.children.length, 1, 'one chunk');
  assert.deepEqual(all(card.el, e => hasClass(e, 'ns-emap-words')).map(e => e.textContent), [WORDS.scan, WORDS.down, WORDS.up]);
  assert.equal(all(card.el, e => hasClass(e, 'ns-emap-mark')).length, 3, 'each line has its mark (the scan\'s colour bar, the command, the report)');
  assert.equal(all(card.el, e => hasClass(e, 'ns-emap-honest'))[0].textContent, WORDS.honest);
  assert.equal(card.setRoute('Right knee', ['One.', 'Two.']), true);
  assert.equal(card.setRoute('Right knee', ['One.', 'Two.']), false, 'the same words are not written again');
  assert.deepEqual(all(card.el, e => hasClass(e, 'ns-emap-route'))[0].children.map(e => e.textContent), ['One.', 'Two.']);
  assert.equal(card.setNotes(['A.', null, 'B.']), true);
  assert.deepEqual(all(card.el, e => hasClass(e, 'ns-emap-notes'))[0].children.map(e => e.textContent), ['A.', 'B.']);
  assert.equal(card.setRoute('Left hand', ['Three.']), true);
  assert.deepEqual(all(card.el, e => hasClass(e, 'ns-emap-route'))[0].children.map(e => e.textContent), ['Three.'], 'new words replace the old ones');
  assert.equal(card.setNotes(null), true, 'no notes (an area\'s route is shown instead)');
  assert.equal(all(card.el, e => hasClass(e, 'ns-emap-notes'))[0].children.length, 0);
  assert.equal(createEmapCard({ doc: null, root, text: WORDS }), null);
});

test('the drawer\'s shader text: built from the model\'s constants, no power of anything, every lookup guarded', () => {
  const { vertexShader, fragmentShader } = emapShaders(EMAP, EMAP_LOOK);
  for (const src of [vertexShader, fragmentShader]) {
    assert.ok(!/\bpow\s*\(/.test(src), 'no pow (a negative base is undefined in a shader)');
    assert.ok(!/undefined|NaN/.test(src), 'every constant is a number');
    assert.ok(!/\/\s*0\.0\b/.test(src), 'no division by a literal zero');
  }
  assert.match(fragmentShader, new RegExp(`${EMAP.bead.downHz}`.replace('.', '\\.')));
  assert.match(fragmentShader, /#include <colorspace_fragment>/);
  assert.match(fragmentShader, /min\( col, vec3\( 1\.0 \) \)/, 'the light never goes above display white (no dependence on the bloom pass)');
  assert.match(vertexShader, /texelFetch\( uPal/);
  assert.ok(EMAP_LOOK.orderDim > 100 && EMAP_LOOK.orderHidden > EMAP_LOOK.orderDim && EMAP_LOOK.orderFront > EMAP_LOOK.orderHidden, 'the dark ground, then the map, after the whole ordinary picture');
  assert.ok(EMAP.dim > 0.5 && EMAP.dim < 0.8, 'the bodies and the brain stay as a dim setting');
  assert.ok(EMAP.light.hidden < 1 && EMAP.light.hiddenLit < 1, 'a line behind something is drawn weaker');
  assert.ok(EMAP_BUILD.idleMs <= 4 && EMAP_BUILD.afterFrames >= 60, 'the model is built a little at a time, after the game has started');
  assert.equal(EMAP_BUILD.onPress, true, 'nothing of the map is fetched or built before the first M press');
  assert.ok(EMAP_BUILD.pressMs <= 8, 'and then a few milliseconds a frame');
});

/* ---- with the real nerve data (ns-wiring-data, section 193): the game's own case ---- */

const real = buildEmap({ ...IN, wiring: NsWiring });

test('with the wiring data module: no warning, every nerve on both sides, every muscle of the body rig on its own named nerve', () => {
  assert.equal(real.standIn, false);
  assert.deepEqual(real.warnings, []);
  const right = Object.keys(NsWiring.NERVE_TRUNKS).length;
  assert.ok(right >= 60, `${right} nerves in the data`);
  assert.equal(real.trunks.filter(t => t.side < 0).length, right, 'every nerve of the data is drawn on the right');
  assert.equal(real.trunks.filter(t => t.side > 0).length, right, 'and its mirrored twin on the left');
  const body = real.muscles.filter(m => m.rig === 'body'), arm = real.muscles.filter(m => m.rig === 'arm');
  assert.equal(body.filter(m => m.how !== 'data').length, 0, 'every muscle of the body rig has its nerve from the data');
  assert.ok(arm.filter(m => m.how === 'data').length >= arm.length - 1, 'and the left game arm\'s muscles by their names');
  for (const m of real.muscles) assert.equal(real.trunks.find(t => t.id === m.trunk).side, m.side, `${m.name} hangs on a nerve of its own side`);
  // the cord follows the data's own canal, top to tip
  const course = NsWiring.cordCourse(), cord = real.wires.find(w => w.key === 'cord:right');
  assert.ok(Math.abs(cord.lenMm - (course[0].p[2] - course[course.length - 1].p[2])) < 60, `the cord's strand is as long as the data's cord (${Math.round(cord.lenMm)} mm)`);
  // the head nerves of the data that leave the brainstem (six a side since 22 November: the accessory nerve's roots
  // leave the cord, so it is drawn as a nerve of the cord), each with its own way out and its own bridge
  const heads = Object.values(NsWiring.NERVE_TRUNKS).filter(t => t.origin && t.origin !== 'cord' && !t.parent).length;
  assert.equal(real.exits.filter(e => e.kind === 'cranial').length, 2 * heads);
  assert.ok(heads >= 6);
  // each root of a nerve of the cord ends where the data says it joins its nerve (rootWay), not at the nerve's first point
  if (typeof NsWiring.rootWay === 'function') {
    const lp = real.wires.find(w => w.key === 'root:r_lumbar_plexus:L4'), way = NsWiring.rootWay('r_lumbar_plexus', 'L4');
    assert.ok(lp && way.length >= 2);
    const V = real.vertices; let last = null;
    for (let v = 0; v < real.vertexCount; v += 2) if (V.sig[4 * v] === lp.id && (V.sig[4 * v + 3] & EMAP_FLAG.mirror)) last = [V.pa[3 * v], V.pa[3 * v + 1], V.pa[3 * v + 2]];
    const jp = way[way.length - 1].p;
    assert.ok(Math.hypot(last[0] - jp[0], last[1] - jp[1], last[2] - jp[2]) < 15, 'the L4 root ends at its own join point');
  }
  assert.equal(real.exits.filter(e => e.kind === 'cord').length, 2);
});

test('with the wiring data module: every movement is routed to each of its muscles, in time, crossing by the muscle\'s side, head nerves never by the cord', () => {
  let pairs = 0, worst = 0, cranial = 0;
  for (const r of regions) for (const act of r.actions) for (const id of IN.resolveMuscles(r, act)) {
    const rt = emapRoute(real, r.id, act.id, id), m = real.muscles[real.muscleIndex.get(id)];
    assert.ok(rt && rt.complete, `${r.id} ${act.id} -> ${id}`);
    pairs++;
    worst = Math.max(worst, rt.arrivalS);
    assert.equal(rt.crosses, m.side !== (r.hemisphere === 'left' ? 1 : -1));
    if (m.exit.startsWith('cn:')) { cranial++; assert.ok(!rt.wires.some(w => w.kind === 'cord' || w.kind === 'root'), `${m.name}: a head nerve`); }
    else assert.ok(rt.wires.some(w => w.kind === 'cord') && rt.wires.some(w => w.kind === 'root'), `${m.name}: by the cord and a root`);
    // each wire hands over to the next at the same coordinate; a plexus is fed by several roots of different lengths
    // and has one coordinate, so the front on it may start up to a frame before or after its root's front arrives
    for (let i = 0; i + 1 < rt.wires.length; i++) { const w = rt.wires[i], end = Math.min(w.a1, w.tau); assert.ok(Math.abs(rt.wires[i + 1].a0 - end) < (w.kind === 'root' ? 0.017 : 0.004), `${w.key} hands over to ${rt.wires[i + 1].key} (${end} -> ${rt.wires[i + 1].a0})`); }
  }
  assert.ok(pairs > 900 && cranial > 150, `${pairs} routes, ${cranial} by head nerves`);
  assert.ok(worst <= EMAP.arriveMaxS + 1e-9);
  assert.ok(real.slow.command > 2 && real.slow.command < 6);
  // named nerves on the way: the knee's benders by the sciatic nerve, the hand's closers by the median or the ulnar nerve
  const st = (r, a) => IN.resolveMuscles(r, a).map(id => emapRoute(real, r.id, a.id, id).stations.join(' > ')).join(' | ');
  assert.match(st(knee, kneeFlex), /sciatic nerve/);
  const hand = regions.find(r => r.id === 'lh_hand');
  assert.match(st(hand, hand.actions[0]), /median nerve|ulnar nerve/);
  const lips = regions.find(r => r.id === 'rh_lips');
  assert.match(st(lips, lips.actions[0]), /facial nerve/);
});

test('a line changes the bone it rides close to the joint between them, not all along the stretch between two course points', () => {
  for (const [label, m] of [['stand-in', model], ['wiring data', real]]) {
    const V = m.vertices, P = m.palette;
    let blended = 0, far = 0;
    for (let v = 0; v < m.vertexCount; v += 2) {
      const fl = V.sig[4 * v + 3];
      if (!(fl & EMAP_FLAG.mirror) || (fl & (EMAP_FLAG.dot | EMAP_FLAG.bridge))) continue;
      const kind = m.wires[V.sig[4 * v]].kind;
      if (kind !== 'trunk') continue;
      const ia = V.bind[4 * v], ib = V.bind[4 * v + 1], w = V.bind[4 * v + 2];
      if (!(w > 0.02 && w < 0.98) || ia > P.bodySegs.length || ib > P.bodySegs.length) continue;
      const a = rig.segments[P.bodySegs[ia - 1]], b = rig.segments[P.bodySegs[ib - 1]];
      const joint = b.parent === a.id ? b.joint : a.parent === b.id ? a.joint : null;
      if (!joint || !rig.pivots[joint]) continue;
      blended++;
      const J = rig.pivots[joint].point, d = Math.hypot(V.pa[3 * v] - J[0], V.pa[3 * v + 1] - J[1], V.pa[3 * v + 2] - J[2]);
      if (d > 110) far++;
    }
    assert.ok(blended > 10, `${label}: ${blended} nodes between two bones`);
    assert.ok(far <= 0.15 * blended, `${label}: ${far} of ${blended} blended nodes lie far from their joint (a few course points of the data ride a bone well past its joint)`);
  }
});
