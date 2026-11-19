/** The loading picture (ns-assembly): its small OBJ reader and the part kinds it takes from the packet manifests.
 * Software checks with a small DOM/worker fixture for the display controller. The game's own loader
 * still checks every file. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseObjBytes, meshNormalsAndCentre, brainBeat, BRAIN_BEAT } from '../scene/src/ns-assembly-core.mjs';
import { assemblyKindOf, assemblyKindsOfManifest, assemblyKindOfUrl, assemblyPartsOfManifest, ASSEMBLY_EXPECTED_FILES, startAssembly } from '../scene/src/ns-assembly.mjs';
import { ASSEMBLY_TIERS, ASSEMBLY_TIER_COUNTS, ASSEMBLY_ORDER, assemblyDepth, createAssemblyRelease } from '../scene/src/ns-assembly-order.mjs';
import { bodyMuscleLayer } from '../scene/src/ns-body.mjs';

const bytes = s => new TextEncoder().encode(s);
const MANIFESTS = ['inputs/FULLBODY-MESH-MANIFEST.json', 'inputs/MESH-MANIFEST.json', 'packets/face-muscles-r1/FACE-MESH-MANIFEST.json',
  'packets/bodyparts3d-head-r1/HEAD-MESH-MANIFEST.json', 'packets/missing-muscles-r1/MISSING-MUSCLES-MESH-MANIFEST.json',
  'packets/bodyparts3d-cerebral-arteries-r1/CEREBRAL-ARTERIES-MESH-MANIFEST.json'];
const readJson = p => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
// Every part the game loads, as the loading picture places it (id -> { kind, track, tier, frac, name, ... }).
const PARTS = new Map(MANIFESTS.flatMap(p => [...assemblyPartsOfManifest(readJson(p), bodyMuscleLayer)]));
const idsOf = p => new Set(readJson(p).assets.map(e => e.element_id));
const ARM_AND_BRAIN = idsOf('inputs/MESH-MANIFEST.json');
const LATE_IDS = new Set([...idsOf('packets/missing-muscles-r1/MISSING-MUSCLES-MESH-MANIFEST.json'), ...idsOf('packets/bodyparts3d-head-r1/HEAD-MESH-MANIFEST.json'), ...idsOf('packets/face-muscles-r1/FACE-MESH-MANIFEST.json')]);

function assemblyFixture(reducedMotion) {
  const created = [], workers = [], timers = [];
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attributes = new Map();
      this.classList = new Set();
      if (tag === 'canvas') this.transferControlToOffscreen = () => new ArrayBuffer(0);
    }
    append(...children) { for (const child of children) this.appendChild(child); }
    appendChild(child) { child.parent = this; this.children.push(child); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const host = new Element('main');
  const doc = { createElement(tag) { created.push(tag); return new Element(tag); } };
  const win = {
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return { matches: reducedMotion };
    },
    innerWidth: 1024,
    innerHeight: 768,
    performance: { now: () => 1 },
    addEventListener() {},
    removeEventListener() {},
    setTimeout(callback, delay) { timers.push({ callback, delay }); },
    Worker: class {
      messages = [];
      constructor() { workers.push(this); }
      postMessage(message, transfer) { this.messages.push(structuredClone(message, { transfer })); }
      terminate() { this.terminated = true; }
    },
  };
  return { host, doc, win, created, workers, timers };
}

test('reduced motion shows stationary download progress and removes it synchronously when startup settles', () => {
  const { host, doc, win, created, workers, timers } = assemblyFixture(true);
  const assembly = startAssembly({ host, doc, win });
  assert.deepEqual(created, ['div', 'p', 'progress']);
  assert.equal(workers.length, 0);
  assert.equal(assembly.state().mode, 'static');
  const [overlay] = host.children;
  const [label, progress] = overlay.children;
  assert.equal(label.textContent, 'Loading anatomy');
  assert.equal(progress.attributes.get('aria-label'), 'Anatomy files downloaded');
  assert.equal(progress.max, ASSEMBLY_EXPECTED_FILES);
  assert.equal(progress.value, 0);
  const obj = bytes('test');
  obj.slice = () => assert.fail('stationary progress does not copy the game bytes');
  assembly.noteManifest('MANIFEST.json', '{"assets":[{"element_id":"bone","kind":"bone"}]}');
  assembly.noteBytes('MANIFEST.json', obj);
  assembly.noteBytes('bone.obj', null);
  assert.equal(progress.value, 0);
  assembly.noteBytes('bone.OBJ?v=1', obj);
  assert.equal(progress.value, 1);
  assert.equal(assembly.state().kinds, 0);
  assert.equal(assembly.state().error, null);
  for (let i = 0; i < ASSEMBLY_EXPECTED_FILES; i++) assembly.noteBytes('part.obj', obj);
  assert.equal(progress.value, ASSEMBLY_EXPECTED_FILES);
  assert.equal(host.children.length, 1, 'all downloads arriving does not remove the layer');
  assembly.finish();
  assembly.finish();
  assembly.noteBytes('late.obj', obj);
  assert.equal(host.children.length, 0);
  assert.equal(assembly.state().finished, true);
  assert.equal(assembly.state().files, ASSEMBLY_EXPECTED_FILES + 1);
  assert.equal(timers.length, 0);
});

test('the default loading picture still sends a copy to the worker and cleans up after its fade', () => {
  const { host, doc, win, workers, timers } = assemblyFixture(false);
  const assembly = startAssembly({ host, doc, win });
  assert.equal(assembly.state().mode, 'worker');
  assert.equal(host.children[0].tag, 'canvas');
  assert.equal(host.children[0].attributes.get('aria-hidden'), 'true');
  assert.equal(workers.length, 1);
  const [worker] = workers;
  assert.equal(worker.messages[0].type, 'init');
  const obj = bytes('test');
  assembly.noteManifest('MANIFEST.json', '{"assets":[{"element_id":"bone","kind":"bone"}]}');
  assembly.noteBytes('bone.obj', obj);
  assert.deepEqual(worker.messages.slice(1).map(message => message.type), ['obj', 'progress']);
  assert.equal(worker.messages[1].kind, 'bone');
  assert.deepEqual(new Uint8Array(worker.messages[1].bytes), obj);
  assert.equal(obj.byteLength, 4, 'transfer leaves the game bytes attached');
  assembly.finish();
  assert.ok(host.children[0].classList.has('ns-assembly-out'));
  assert.equal(timers[0].delay, 900);
  timers[0].callback();
  assert.equal(host.children.length, 0);
  assert.equal(worker.messages.at(-1).type, 'stop');
  timers[1].callback();
  assert.equal(worker.terminated, true);
});

test('the OBJ reader takes vertices and faces, fans polygons and skips everything else', () => {
  const m = parseObjBytes(bytes('# note\nv 0 0 0\nv 1.5 0 0\nv 1.5 2e0 0\nv 0 -2.25 1E-1\nvn 0 0 1\nf 1//1 2//1 3//1\nf 1/1/1 2/2/1 3/3/1 4/4/1\ng x\n'));
  assert.deepEqual(Array.from(m.positions), [0, 0, 0, 1.5, 0, 0, 1.5, 2, 0, 0, -2.25, Math.fround(0.1)]);
  assert.deepEqual(Array.from(m.indices), [0, 1, 2, 0, 1, 2, 0, 2, 3]);
  const n = meshNormalsAndCentre(m.positions, m.indices);
  assert.equal(n.normals.length, 12);
  assert.deepEqual(n.centre.map(v => Math.round(v * 1000) / 1000), [0.75, -0.125, 0.05]);
});

test('the OBJ reader refuses a file without a usable triangle or with a face that points outside it', () => {
  assert.equal(parseObjBytes(bytes('v 0 0 0\nv 1 0 0\n')), null);
  assert.equal(parseObjBytes(bytes('v 0 0 0\nv 1 0 0\nv 0 1 0\n')), null);
  assert.equal(parseObjBytes(bytes('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9\n')), null);
  assert.equal(parseObjBytes(bytes('')), null);
});

test('the OBJ reader agrees with a real atlas file on its vertex and triangle counts', () => {
  const man = JSON.parse(fs.readFileSync(new URL('../inputs/FULLBODY-MESH-MANIFEST.json', import.meta.url), 'utf8'));
  const e = man.assets[0];
  const m = parseObjBytes(new Uint8Array(fs.readFileSync(new URL(`../packets/bodyparts3d-fullbody-r1/${e.path}`, import.meta.url))));
  assert.equal(m.positions.length / 3, e.vertices);
  assert.equal(m.indices.length / 3, e.triangles);
  for (let k = 0; k < 3; k++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = k; i < m.positions.length; i += 3) { lo = Math.min(lo, m.positions[i]); hi = Math.max(hi, m.positions[i]); }
    assert.ok(Math.abs(lo - e.bounds_min[k]) < 0.01 && Math.abs(hi - e.bounds_max[k]) < 0.01);
  }
});

test('part kinds come from the manifests the game loads', () => {
  assert.equal(assemblyKindOf({ groups: ['brain', 'brain_motor_landmark'] }), 'strip');
  assert.equal(assemblyKindOf({ groups: ['brain'] }), 'brain');
  assert.equal(assemblyKindOf({ kind: 'bone', tissue: 'eye' }), 'eye');
  assert.equal(assemblyKindOf({ groups: ['left_upper_limb_bone'] }), 'bone');
  assert.equal(assemblyKindOf({ kind: 'muscle' }), 'muscle');
  assert.equal(assemblyKindOf({}), null);
  // 18 November 2026: the cerebral arteries' manifest marks its entries kind 'bone', tissue 'artery': they are vessels.
  assert.equal(assemblyKindOf({ kind: 'bone', tissue: 'artery', groups: ['cerebral_artery'] }), 'vessel');
  assert.equal(assemblyKindOfUrl('../../packets/bodyparts3d-head-r1/meshes/FJ3274.obj'), 'bone');
  assert.equal(assemblyKindOfUrl('../../packets/face-muscles-r1/meshes/zf-frontalis-r.obj'), 'muscle');
  assert.equal(assemblyKindOfUrl('../../packets/bodyparts3d-cerebral-arteries-r1/meshes/FJ1692.obj'), 'vessel');
  let files = 0;
  const count = {};
  for (const p of MANIFESTS) {
    const k = assemblyKindsOfManifest(JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')));
    assert.ok(k.size > 0, `${p} gives kinds`);
    files += k.size;
    for (const v of k.values()) count[v] = (count[v] || 0) + 1;
  }
  assert.equal(files - count.vessel, ASSEMBLY_EXPECTED_FILES, 'the progress bar length is the number of files the manifests list (the arteries load after ready)');
  assert.ok(count.bone > 150 && count.muscle > 250 && count.brain === 57 && count.strip === 2 && count.eye === 6 && count.vessel === 80);
  assert.equal(assemblyKindsOfManifest(null).size, 0);
  assert.equal(assemblyKindsOfManifest({ assets: 'x' }).size, 0);
});

test('the loading picture\'s brain beat is a quick rise and a slower fall, once per beat, on a slow breathing wave', () => {
  let peakAt = 0, peak = 0;
  for (let i = 0; i < 920; i++) { const v = brainBeat(i / 1000).beat; assert.ok(v >= 0 && v <= 1); if (v > peak) { peak = v; peakAt = i / 1000; } }
  assert.ok(peak > 0.99 && peakAt > 0.08 && peakAt < 0.2, 'the top of the beat comes early (a quick rise)');
  assert.ok(brainBeat(0).beat < 0.01, 'a beat starts from rest');
  assert.ok(brainBeat(0.6).beat < 0.2, 'and has mostly fallen away by two thirds of the beat');
  assert.ok(Math.abs(brainBeat(0.3).beat - brainBeat(0.3 + BRAIN_BEAT.beatS).beat) < 1e-9, 'it repeats every beat');
  assert.ok(Math.abs(brainBeat(BRAIN_BEAT.breathS / 4).breath - 1) < 1e-9 && Math.abs(brainBeat(0).breath) < 1e-9);
  assert.ok(BRAIN_BEAT.swell <= 0.02 && BRAIN_BEAT.breathSwell <= 0.02, 'a small swell, not a wobble');
});

// 18 November 2026 (owner: "for the loading animation, if possible, we want to go inside out always ... the bones and
// then the deepest muscles ... the inside of the brain as well to show the innermost structures").
test('inside out: every part the game loads has a place, bones before muscles, deep before outer, the brain from its core', () => {
  assert.equal(PARTS.size, ASSEMBLY_EXPECTED_FILES + 80);
  for (const [id, p] of PARTS) assert.ok(p.track && Number.isInteger(p.tier) && p.frac >= 0 && p.frac < 1, `${id} is placed`);
  const counts = { body: ASSEMBLY_TIERS.body.map(() => 0), brain: ASSEMBLY_TIERS.brain.map(() => 0) };
  for (const p of PARTS.values()) counts[p.track][p.tier]++;
  assert.deepEqual(counts, { body: [...ASSEMBLY_TIER_COUNTS.body], brain: [...ASSEMBLY_TIER_COUNTS.brain] }, 'the expected-count table matches the manifests (update ASSEMBLY_TIER_COUNTS when a packet changes)');
  const by = (name, kinds = ['bone', 'eye', 'muscle', 'brain', 'strip', 'vessel']) => [...PARTS.values()].filter(p => kinds.includes(p.kind) && p.name.toLowerCase().includes(name));
  const bone = name => by(name, ['bone']);
  const tierName = p => ASSEMBLY_TIERS[p.track][p.tier];
  // Bones: the spine and skull first, then the trunk's cage, then the limbs outward; every bone before every muscle.
  for (const n of ['vertebra', 'sacrum', 'parietal bone', 'occipital bone']) for (const p of bone(n)) assert.equal(tierName(p), 'spine and skull', n);
  for (const n of ['rib', 'sternum', 'hip bone', 'mandible']) for (const p of bone(n)) assert.equal(tierName(p), 'ribcage, pelvis, face and eyes', n);
  for (const [n, t] of [['humerus', 'upper arm and thigh'], ['femur', 'upper arm and thigh'], ['tibia', 'forearm and leg'], ['radius', 'forearm and leg'],
    ['talus', 'wrist and ankle'], ['scaphoid', 'wrist and ankle'], ['phalanx', 'hand and foot'], ['metatarsal', 'hand and foot']]) for (const p of bone(n)) assert.equal(tierName(p), t, n);
  const bones = [...PARTS.values()].filter(p => p.kind === 'bone' || p.kind === 'eye'), muscles = [...PARTS.values()].filter(p => p.kind === 'muscle');
  assert.ok(Math.max(...bones.map(p => p.tier)) < Math.min(...muscles.map(p => p.tier)), 'every bone comes before every muscle');
  // The spine builds upward from the sacrum into the skull.
  const sp = n => bone(n)[0].frac;
  assert.ok(sp('sacrum') < sp('fifth lumbar') && sp('fifth lumbar') < sp('first lumbar') && sp('first lumbar') < sp('first thoracic') && sp('first thoracic') < sp('atlas') && sp('atlas') < sp('parietal bone'));
  // Muscles by the game's own layer, and outward inside a layer (trunk, then upper arm, then hand).
  for (const p of muscles) assert.equal(tierName(p), { deep: 'deep muscles', intermediate: 'intermediate muscles', outer: 'outer muscles' }[p.layer] || 'intermediate muscles');
  assert.ok(by('rhomboid')[0].frac < by('vastus lateralis')[0].frac && by('vastus lateralis')[0].frac < by('soleus')[0].frac);
  assert.equal(tierName(by('trapezius')[0]), 'outer muscles');
  assert.equal(tierName(by('supraspinatus')[0]), 'deep muscles');
  // The brain: stem, cerebellum, ventricles, deep nuclei, white matter, hidden cortex, outer cortex, strip, arteries.
  for (const [n, t] of [['pons', 'brain stem'], ['medulla', 'brain stem'], ['midbrain', 'brain stem'], ['cerebellum', 'cerebellum'], ['ventricle', 'ventricles'],
    ['aqueduct', 'ventricles'], ['hypothalamus', 'deep nuclei'], ['pineal', 'deep nuclei'], ['internal capsule', 'white matter'], ['white matter', 'white matter'],
    ['insula', 'inner cortex'], ['cingulate', 'inner cortex'], ['parahippocampal', 'inner cortex'], ['superior frontal', 'outer cortex'], ['occipital lobe', 'outer cortex'],
    ['precentral', 'motor strip']]) for (const p of by(n, ['brain', 'strip'])) assert.equal(tierName(p), t, n);
  const vessels = [...PARTS.values()].filter(p => p.kind === 'vessel');
  assert.ok(vessels.length === 80 && vessels.every(p => tierName(p) === 'arteries'));
  assert.ok(by('hippocampus').filter(p => !p.name.toLowerCase().includes('para')).every(p => tierName(p) === 'deep nuclei'));
  // A part no manifest named is placed by its vertices.
  assert.deepEqual(assemblyDepth({ kind: 'bone', centre: [0, -40, 1300] }).track, 'body');
  assert.equal(assemblyDepth({ kind: 'nothing' }), null);
});

/** Feeds parts to a release rule at given times and runs it at 30 frames a second; returns [[time, track, tier, id]]. */
function runRelease(arrivals, { until = 40, counts, hurryAt = Infinity } = {}) {
  const rel = createAssemblyRelease(counts ? { counts } : {});
  const out = [], queue = arrivals.slice().sort((a, b) => a.at - b.at);
  for (let f = 0; f <= until * 30; f++) {
    const t = f / 30;
    while (queue.length && queue[0].at <= t) rel.arrive(queue.shift());
    if (t >= hurryAt) rel.hurry();
    for (const p of rel.due(t, [])) out.push([t, p.track, p.tier, p.id]);
  }
  return out;
}
const nondecreasing = (rows, track) => rows.filter(r => r[1] === track).every((r, i, a) => i === 0 || a[i - 1][2] <= r[2]);

test('the release rule holds parts back and lets the tiers out in order, whatever order the files arrive in', () => {
  // Every part the game loads, arriving in a shuffled order over 3 s: each track starts strictly tier by tier.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const all = [...PARTS].map(([id, p]) => ({ id, ...p, at: 0.05 + rnd() * 3 }));
  const rows = runRelease(all);
  assert.equal(rows.length, all.length, 'every part starts');
  assert.ok(nondecreasing(rows, 'body') && nondecreasing(rows, 'brain'), 'no part starts before a part of a deeper tier');
  assert.equal(new Set(rows.map(r => r[3])).size, all.length, 'each part once');
  // Each tier is seen for a moment before the next starts.
  const firstOf = (track, tier) => rows.find(r => r[1] === track && r[2] === tier)[0];
  // (from the tier's first part; its first start may come up to waveS after that)
  for (const tr of ['body', 'brain']) for (let k = 1; k < ASSEMBLY_TIERS[tr].length; k++) {
    assert.ok(firstOf(tr, k) - firstOf(tr, k - 1) >= ASSEMBLY_ORDER[tr].holdS[k - 1] - ASSEMBLY_ORDER[tr].waveS[k - 1] - 1e-6, `${tr} tier ${k}`);
  }
  // With every file in at once the whole body is in by about 7 s and the brain by about 6 s, not later.
  const lastOf = track => Math.max(...rows.filter(r => r[1] === track).map(r => r[0]));
  assert.ok(lastOf('body') < 3 + 8 && lastOf('brain') < 3 + 7, `body ${lastOf('body')} s, brain ${lastOf('brain')} s`);
  // The brain does not wait for the body: with every body file 20 s late the brain is built in its own time.
  const late = runRelease(all.map(p => ({ ...p, at: p.track === 'body' ? 20 + p.at : p.at })), { until: 40 });
  assert.ok(Math.max(...late.filter(r => r[1] === 'brain').map(r => r[0])) < 3 + 7);
  // The real arrival pattern on a slow computer: the arm and brain packet first, a pause of 3.3 s while the game builds
  // them, the body over 4.5 s, then the missing muscles, head and face: still strictly in order on both tracks.
  const packetOf = id => /^z[fm]-/.test(id) ? 'late' : ARM_AND_BRAIN.has(id) ? 'first' : LATE_IDS.has(id) ? 'late' : 'body';
  const slow = all.map(p => ({ ...p, at: { first: 0.6 + rnd(), body: 5 + 4.5 * rnd(), late: 9.8 + 1.7 * rnd() }[packetOf(p.id)] }));
  const sr = runRelease(slow, { until: 40 });
  assert.equal(sr.length, slow.length);
  assert.ok(nondecreasing(sr, 'body') && nondecreasing(sr, 'brain'), 'strict order through the pause');
});

test('a tier waits for its own late file while files keep coming, and stops waiting only when the fetch stalls', () => {
  const counts = { body: [2, 1, 0, 0, 0, 0, 0, 1, 0, 1], brain: ASSEMBLY_TIERS.brain.map(() => 0) };
  const p = (id, tier, at, frac = 0) => ({ id, track: 'body', tier, frac, at });
  // Files keep coming (the brain's, on its own track) until 6 s; the skull is late (8 s) but still comes.
  const brainTicks = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, track: 'brain', tier: 8, frac: 0, at: 0.5 * i }));
  const rows = runRelease([p('spine', 0, 0), p('skull', 0, 8), p('rib', 1, 0.2), p('deep', 7, 0.3), p('outer', 9, 0.4), ...brainTicks], { counts, until: 16 });
  const at = id => rows.find(r => r[3] === id)[0];
  assert.ok(at('spine') < 0.05, 'the first part starts at once');
  assert.ok(Math.abs(at('skull') - 8) < 0.05 && at('rib') >= at('skull'), `the rib waits for the late skull (${at('rib')} s)`);
  assert.ok(at('deep') > at('rib') && at('outer') > at('deep'), 'the rest in order');
  assert.ok(at('deep') - at('rib') < ASSEMBLY_ORDER.body.holdS[1] + 0.1, 'empty tiers are passed at once');
  // A file that never comes: the tier stops waiting stallS after the last file came, then the late-comer would come in at once.
  const r2 = runRelease([p('spine', 0, 0), p('rib', 1, 0.2), p('deep', 7, 0.3)], { counts: { body: [2, 1, 0, 0, 0, 0, 0, 1, 0, 0], brain: counts.brain }, until: 10 });
  const at2 = id => r2.find(r => r[3] === id)[0];
  assert.ok(Math.abs(at2('rib') - (0.3 + ASSEMBLY_ORDER.stallS)) < 0.1, `gives up stallS after the last file (${at2('rib')} s)`);
});

test('once the game is ready the rest comes in quickly and in order, without waiting for missing files', () => {
  const all = [...PARTS].map(([id, p]) => ({ id, ...p, at: 0 }));
  const rows = runRelease(all, { hurryAt: 1, until: 4 });
  assert.equal(rows.length, all.length);
  assert.ok(nondecreasing(rows, 'body') && nondecreasing(rows, 'brain'));
  assert.ok(Math.max(...rows.map(r => r[0])) < 1 + 0.12 * 8 + 0.2, `all in by ${Math.max(...rows.map(r => r[0]))} s`);
  // A file that never comes does not stop the order after the hurry.
  const counts = { body: [5, 1, 0, 0, 0, 0, 0, 0, 0, 1], brain: ASSEMBLY_TIERS.brain.map(() => 0) };
  const r2 = runRelease([{ id: 'a', track: 'body', tier: 0, frac: 0, at: 0 }, { id: 'b', track: 'body', tier: 9, frac: 0, at: 0 }], { counts, hurryAt: 0.5, until: 2 });
  assert.ok(r2.find(r => r[3] === 'b')[0] < 0.7);
});

test('knowing about when the game will be ready, the layers are paced to keep building through the whole load', () => {
  const all = [...PARTS].map(([id, p]) => ({ id, ...p, at: 0.2 }));
  const run = expect => {
    const rel = createAssemblyRelease();
    if (expect !== null) rel.expect(expect);
    const rows = [];
    for (let f = 0; f <= 40 * 30; f++) { const t = f / 30; if (t >= 0.2) for (const p of all.splice(0)) rel.arrive(p); for (const p of rel.due(t, [])) rows.push([t, p.track, p.tier]); }
    all.push(...[...PARTS].map(([id, p]) => ({ id, ...p, at: 0.2 })));
    const last = tr => Math.max(...rows.filter(r => r[1] === tr).map(r => r[0]));
    return { rows, body: last('body'), brain: last('brain') };
  };
  const plain = run(null), paced = run(24), quick = run(3);
  assert.ok(plain.body < 8 && plain.brain < 7, 'without a time, the default pace');
  assert.ok(paced.body > 17 && paced.body < 24 - ASSEMBLY_ORDER.endsBeforeS.body + 0.5, `the body's last layer starts by ${paced.body} s`);
  assert.ok(paced.brain > 13 && paced.brain < 24 - ASSEMBLY_ORDER.endsBeforeS.brain + 0.5, `the brain's last layer starts by ${paced.brain} s`);
  assert.ok(nondecreasing(paced.rows, 'body') && nondecreasing(paced.rows, 'brain'));
  // 19 November 2026 (the game now loads in a few seconds: the picture must be whole before the game takes over; the
  // earlier rule here was "a time sooner than the default pace never hurries it"): a short load quickens the pace, so
  // the last layers start inside it, in order; never quicker than minStretch.
  assert.ok(quick.body < 3 && quick.brain < 3 && quick.body < plain.body, `a 3 s load: the body's last layer starts by ${quick.body} s, the brain's by ${quick.brain} s`);
  assert.ok(nondecreasing(quick.rows, 'body') && nondecreasing(quick.rows, 'brain'));
  assert.ok(run(0.3).body >= plain.body * ASSEMBLY_ORDER.minStretch - 0.3, 'never quicker than minStretch');
  // Never stretched more than maxStretch: with a far time the body still ends within maxStretch x the default.
  assert.ok(run(400).body <= plain.body * ASSEMBLY_ORDER.maxStretch + 1);
});

test('a packet the game asks for last does not hold the whole body back: its parts come in when they arrive', () => {
  // The skull's top comes in the head packet, whose manifest the game fetches after the body: tier 0 waits for the
  // body's own spine, not for the head packet; with every manifest known it waits for all (the strict order).
  const counts = { body: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0], brain: ASSEMBLY_TIERS.brain.map(() => 0) };
  const known = { body: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0], brain: counts.brain };
  const p = (id, tier, at) => ({ id, track: 'body', tier, frac: 0, at });
  const parts = [p('L1', 0, 0), p('L2', 0, 0.1), p('rib', 1, 0.2), p('skullTop', 0, 12)];
  const run = (knowIt, until = 16) => {
    const rel = createAssemblyRelease({ counts });
    if (knowIt) rel.know(known);
    const queue = parts.slice(), rows = [];
    for (let f = 0; f <= until * 30; f++) { const t = f / 30; while (queue.length && queue[0].at <= t) rel.arrive(queue.shift()); for (const q of rel.due(t, [])) rows.push([t, q.id]); queue.sort((a, b) => a.at - b.at); }
    return id => rows.find(r => r[1] === id)[0];
  };
  const loose = run(true), strict = run(false);
  assert.ok(loose('rib') < 2, `the rib does not wait for the head packet (${loose('rib')} s)`);
  assert.ok(Math.abs(loose('skullTop') - 12) < 0.05, 'the late skull top comes in as it arrives');
  assert.ok(strict('rib') >= 5, 'without know(), the tier waits until the fetch stalls');
});
