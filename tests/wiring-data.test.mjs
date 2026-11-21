// 21 November 2026 (package WIRING, DESIGN-DECISIONS section 193): the data of the drawn nerves (ns-wiring-data):
// which nerve serves each muscle, the nerves' courses over the rig's rest frame, the cord, the brain's links.
// 22 November: after the two independent checks: the textbook rows pinned, the roots' join points, every course point
// inside its limb's outline, the pieces under one-joint turns, where the brain's fibres cross, unknown keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as W from '../scene/src/ns-wiring-data.mjs';
import { BODY_MOTOR_MAP, CATALOG_NAMES } from '../scene/src/ns-bodymap.mjs';
import { SEGMENTS as ARM_SEGMENTS } from '../scene/src/ns-rig.mjs';
import { poseStretch, poseBone, WIRING_POSES } from '../tools/wiring-geometry.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RIG = JSON.parse(read('packs/BODY-RIG.json')).rig;
const BRAIN = JSON.parse(read('inputs/MESH-MANIFEST.json')).assets;
const TRUNKS = Object.values(W.NERVE_TRUNKS);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const pivot = n => RIG.pivots[n].point;
// trunk ids carry their side: `r_...` in NERVE_TRUNKS, `l_...` for the mirrored twins; the tests name nerves without it
const short = id => id.replace(/^[rl]_/, '');
const courseOf = id => W.NERVE_TRUNKS[`r_${id}`].course.map(q => q.p);

test('the brief\'s own examples: the nerve, the roots and the main root of well-known muscles', () => {
  const is = (name, trunk, roots, main) => {
    const r = W.nerveForMuscle(name); assert.ok(r, name);
    // the nerve of the muscle's own side: `l_...` for a left-side name, `r_...` otherwise; either is a real trunk
    assert.equal(r.trunk, `${r.side === 'left' ? 'l' : 'r'}_${trunk}`, name); assert.ok(W.trunkById(r.trunk), name);
    assert.deepEqual([...r.roots], roots, name); assert.equal(r.main, main, name); return r;
  };
  is('right biceps brachii', 'musculocutaneous', ['C5', 'C6'], 'C6');
  is('long head of left biceps brachii', 'musculocutaneous', ['C5', 'C6'], 'C6');
  is('right tibialis anterior', 'deep_fibular', ['L4', 'L5'], 'L4');
  is('left deltoid', 'axillary', ['C5', 'C6'], 'C5');
  is('right triceps brachii', 'radial', ['C6', 'C7', 'C8'], 'C7');
  is('right gastrocnemius', 'tibial', ['S1', 'S2'], 'S1');
  is('left rectus femoris', 'femoral', ['L2', 'L3', 'L4'], 'L3');
  is('right gluteus maximus', 'inferior_gluteal', ['L5', 'S1', 'S2'], 'S1');
  is('abductor digiti minimi of left hand', 'ulnar_deep', ['C8', 'T1'], 'T1');
  // the face muscles: the facial nerve (VII), from the pons; the chewing muscles: V3; neither passes the cord
  for (const n of ['frontalis muscle.r', 'left zygomaticus major', 'orbicularis oris', 'platysma.l', 'right buccinator', 'mentalis']) {
    const r = W.nerveForMuscle(n); assert.deepEqual([...r.roots], ['VII'], n); assert.equal(W.trunkById(r.trunk).origin, 'pons', n);
    assert.ok(short(r.trunk) === 'facial' || short(W.trunkById(r.trunk).parent) === 'facial', n);
  }
  for (const n of ['left masseter', 'temporalis muscle.r', 'right medial pterygoid', 'superior head of left lateral pterygoid', 'right mylohyoid']) {
    const r = W.nerveForMuscle(n); assert.deepEqual([...r.roots], ['V3'], n); assert.equal(W.trunkById(r.trunk).origin, 'pons', n);
  }
  // sternocleidomastoid and trapezius: the accessory nerve (cranial nerve XI), whose fibres begin in the top of the cord
  assert.deepEqual([...is('right sternocleidomastoid', 'accessory', ['C2', 'C3'], 'C2').also], ['r_cervical_plexus']);
  is('left descending part of trapezius', 'accessory', ['C3', 'C4'], 'C4');
  const xi = W.NERVE_TRUNKS.r_accessory;
  assert.equal(xi.origin, 'cord'); assert.equal(xi.rootsLeave, 'cord'); assert.deepEqual([...xi.roots], ['C1', 'C2', 'C3', 'C4', 'C5']); assert.equal(W.CRANIAL_ORIGIN.XI, 'cord');
  assert.match(xi.name, /cranial nerve XI/); assert.match(xi.note, /great opening/); assert.match(xi.note, /jugular opening/);
  // one muscle, two nerves: the two bellies of digastric; the two halves of the deep finger bender
  assert.equal(W.nerveForMuscle('anterior belly of left digastric').trunk, 'l_mylohyoid_nerve');
  assert.equal(W.nerveForMuscle('posterior belly of right digastric').trunk, 'r_facial');
  assert.deepEqual([...W.nerveForMuscle('right flexor digitorum profundus').also], ['r_ulnar']);
  assert.deepEqual([...W.nerveForMuscle('left flexor digitorum profundus').also], ['l_ulnar']);
  // sides: left, right, none; a left-side name gives the left twin's id (`l_...`), a name without a side the right one
  assert.equal(W.nerveForMuscle('left soleus').trunk, 'l_tibial'); assert.equal(W.nerveForMuscle('right soleus').trunk, 'r_tibial');
  assert.equal(W.nerveForMuscle('orbicularis oris').trunk, 'r_facial_buccal');
  assert.ok(W.NERVE_TRUNKS.r_tibial && !W.NERVE_TRUNKS.l_tibial && W.trunkById('l_tibial').id === 'l_tibial' && W.trunkById('l_tibial') === W.mirrorTrunk('r_tibial'));
  assert.equal(W.nerveForMuscle('left soleus').side, 'left');
  assert.equal(W.nerveForMuscle('soleus muscle.r').side, 'right');
  assert.equal(W.nerveForMuscle('procerus').side, null);
  assert.equal(W.nerveForMuscle('no such muscle'), null);
  assert.equal(W.nerveForMuscle(''), null);
  // distinct muscles with nearly the same name stay distinct
  assert.equal(W.nerveForMuscle('right extensor digitorum').trunk, 'r_posterior_interosseous');
  assert.equal(W.nerveForMuscle('right extensor digitorum longus').trunk, 'r_deep_fibular');
  assert.equal(W.nerveForMuscle('right gemellus superior').trunk, 'r_nerve_to_obturator_internus');
  assert.equal(W.nerveForMuscle('right gemellus inferior').trunk, 'r_nerve_to_quadratus_femoris');
  assert.equal(W.nerveForMuscle('right serratus posterior superior').main, 'T3');
  assert.equal(W.nerveForMuscle('right serratus anterior').trunk, 'r_long_thoracic');
});

test('every muscle the game knows resolves to a nerve: the rig\'s 292, their aliases, the 142 movements, the game arm', () => {
  assert.equal(RIG.muscles.length, 292);
  for (const m of RIG.muscles) {
    for (const n of [m.id, m.name, ...(m.aliases || [])]) {
      const r = W.nerveForMuscle(n);
      assert.ok(r && W.trunkById(r.trunk), `rig muscle ${m.id} "${n}" has no nerve`);
    }
    const byId = W.MUSCLE_NERVE_BY_ID[m.id];
    assert.ok(byId, m.id);
    assert.equal(byId.name, m.name);
    assert.equal(byId.side, m.side, m.id);
    assert.equal(byId.trunk.slice(0, 2), m.side === 'left' ? 'l_' : 'r_', `${m.id}: its nerve is not on its own side`);
    assert.ok(W.MUSCLE_NERVE[m.name], `MUSCLE_NERVE has no entry for the rig name "${m.name}"`);
    assert.ok(W.MUSCLE_NERVE[m.name].ends.some(e => e.id === m.id), m.id);
  }
  assert.equal(Object.keys(W.MUSCLE_NERVE_BY_ID).length, 292);
  // the pieces the atlas names alike but that have different nerves keep them by id
  assert.equal(W.MUSCLE_NERVE_BY_ID.FJ1556.trunk, 'r_mylohyoid_nerve'); // the front belly of the right digastric
  assert.equal(W.MUSCLE_NERVE_BY_ID.FJ1579.trunk, 'r_facial');          // its back belly
  assert.equal(W.MUSCLE_NERVE_BY_ID['zf-occipitalis-l'].trunk, 'l_facial_posterior_auricular');
  assert.equal(W.MUSCLE_NERVE_BY_ID['zf-frontalis-l'].trunk, 'l_facial_temporal');
  // every muscle name of every movement of the body map
  let movements = 0; const names = new Set();
  for (const region of BODY_MOTOR_MAP.regions) for (const a of region.actions) { movements++; for (const k of ['agonists', 'antagonists', 'stabilizers']) for (const n of a[k] || []) names.add(n); }
  assert.equal(movements, 142);
  for (const n of names) { const r = W.nerveForMuscle(n); assert.ok(r && W.trunkById(r.trunk), `movement muscle "${n}" has no nerve`); }
  // the left game arm: its 25 catalogue keys (and the table of them here equals the game's), and its 51 meshes' names
  assert.deepEqual({ ...W.ARM_CATALOG_NAMES }, { ...CATALOG_NAMES });
  for (const [key, name] of Object.entries(CATALOG_NAMES)) {
    const a = W.nerveForMuscle(key), b = W.nerveForMuscle(name);
    assert.ok(a && b, key); assert.equal(a.trunk, b.trunk, key); assert.equal(a.side, 'left', key);
  }
  const armMuscles = BRAIN.filter(a => a.groups.includes('left_upper_limb_muscle'));
  assert.equal(armMuscles.length, 51);
  const armNames = a => [...(a.concepts || []).map(c => c.en), a.embedded_source_name, a.source_name].filter(Boolean);
  for (const a of armMuscles) assert.ok(armNames(a).length, `left arm mesh ${a.element_id} has no name in the manifest`);
  for (const a of armMuscles) for (const n of armNames(a)) { const r = W.nerveForMuscle(n); assert.ok(r, `left arm mesh ${a.element_id} "${n}"`); assert.equal(r.side, 'left', n); }
  // a left-arm mesh by its id (the body rig does not hold it): the nerve of its right twin, on the left
  for (const a of armMuscles) { const r = W.nerveForMuscle(a.element_id); assert.ok(r, a.element_id); assert.equal(r.side, 'left', a.element_id); assert.equal(r.trunk, W.nerveForMuscle(armNames(a)[0]).trunk, a.element_id); }
  // a left-arm mesh and its right-arm twin have the same nerve
  for (const a of armMuscles) { const twin = RIG.muscles.find(m => m.id === a.element_id.replace(/M$/, '')); if (twin) assert.equal(W.nerveForMuscle(armNames(a)[0]).trunk, W.mirrorId(W.MUSCLE_NERVE_BY_ID[twin.id].trunk), a.element_id); }
  // the 54 face muscles by the packet's own names
  const face = JSON.parse(read('packets/face-muscles-r1/FACE-MESH-MANIFEST.json')).assets;
  assert.equal(face.length, 54);
  for (const a of face) for (const n of [a.name, a.embedded_source_name, ...a.concepts.map(c => c.en)]) assert.ok(W.nerveForMuscle(n), `face muscle "${n}"`);
});

test('the muscle table: one row per muscle, every row well formed and sourced', () => {
  const seen = new Set();
  for (const r of W.MUSCLE_ROWS) {
    for (const n of r.names) { assert.ok(!seen.has(n), `the name "${n}" is on two rows`); seen.add(n); }
    assert.ok(W.NERVE_TRUNKS[r.trunk], `${r.names[0]}: unknown nerve ${r.trunk}`);
    assert.ok(r.roots.length >= 1, r.names[0]);
    for (const l of r.roots) assert.ok(W.isKnownLevel(l), `${r.names[0]}: unknown level ${l}`);
    assert.ok(r.roots.includes(r.main), `${r.names[0]}: the main root is not one of its roots`);
    assert.ok(['M', 'K', 'W', 'S', 'C'].includes(r.by), r.names[0]);
    if (r.by === 'S') assert.equal(r.roots.length, 1, `${r.names[0]}: "S" means a single root`);
    if (r.by === 'C' || r.by === 'K') assert.ok(r.note.length > 20, `${r.names[0]}: a chosen main root must say why`);
    if (r.by === 'M') assert.ok(r.src.includes('MRC1976'), r.names[0]);
    if (r.by === 'K') assert.ok(r.src.includes('ISNCSCI'), r.names[0]);
    assert.ok(r.src.length >= 1, r.names[0]);
    for (const s of r.src) assert.ok(W.WIRING_SOURCES[s], `${r.names[0]}: unknown source ${s}`);
    for (const a of r.also) assert.ok(W.NERVE_TRUNKS[a], `${r.names[0]}: unknown second nerve ${a}`);
    assert.ok(!r.also.includes(r.trunk), r.names[0]);
    // the levels of a muscle are levels its nerve (or one of its second nerves) carries; a cranial nerve's muscle is a
    // cranial level
    const carried = new Set([r.trunk, ...r.also].flatMap(id => W.NERVE_TRUNKS[id].roots));
    for (const l of r.roots) assert.ok(carried.has(l), `${r.names[0]}: its nerve(s) do not carry ${l}`);
    // the main level is carried by the nerve the muscle is DRAWN from (its first nerve): the drawn way starts there
    assert.ok(W.NERVE_TRUNKS[r.trunk].roots.includes(r.main), `${r.names[0]}: its main level ${r.main} is not carried by ${r.trunk}, the nerve it is drawn from`);
    // a row "taught both ways" says so and gives the other value
    if (/taught (both|more than one) ways?/i.test(r.note)) assert.ok(/other|others|some|many|also|or /i.test(r.note), `${r.names[0]}: says it is taught both ways without the other value`);
    // every row is used by some mesh of the rig, the game arm or a movement (no dead rows), except whole-muscle rows
  }
  // rows served level by level name the nerve of their main level
  for (const r of W.MUSCLE_ROWS.filter(x => x.segmental === 'dorsal')) assert.equal(r.trunk, W.dorsalTrunkOf(r.main), r.names[0]);
  for (const r of W.MUSCLE_ROWS.filter(x => x.segmental === 'ventral')) assert.equal(r.trunk, W.ventralTrunkOf(r.main), r.names[0]);
  // the MRC table's bold roots, as read from its pages 60 and 61 (a sample across both limbs)
  const mrc = { supraspinatus: 'C5', deltoid: 'C5', 'latissimus dorsi': 'C7', 'triceps brachii': 'C7', brachioradialis: 'C6', 'extensor digitorum': 'C7', 'flexor carpi radialis': 'C7',
    'flexor digitorum superficialis': 'C8', 'abductor pollicis brevis': 'T1', 'flexor pollicis longus': 'C8', 'flexor carpi ulnaris': 'C8', 'adductor pollicis': 'T1',
    semitendinosus: 'S1', 'tibialis posterior': 'L4', 'tibialis anterior': 'L4', 'extensor hallucis longus': 'L5', 'extensor digitorum longus': 'L5' };
  for (const [n, main] of Object.entries(mrc)) { const r = W.MUSCLE_ROWS.find(x => x.names[0] === n); assert.equal(r.main, main, n); assert.equal(r.by, 'M', n); }
});

// The best-known rows, on which every textbook agrees (the nerve; and the levels where the MRC table prints them):
// a wrong nerve for any of these is the fault a reader who knows anatomy sees at once.
const TEXTBOOK = [
  ['biceps brachii', 'musculocutaneous'], ['brachialis', 'musculocutaneous'], ['coracobrachialis', 'musculocutaneous'],
  ['deltoid', 'axillary'], ['teres minor', 'axillary'], ['supraspinatus', 'suprascapular'], ['infraspinatus', 'suprascapular'],
  ['triceps brachii', 'radial'], ['brachioradialis', 'radial'], ['extensor digitorum', 'posterior_interosseous'],
  ['flexor carpi ulnaris', 'ulnar'], ['adductor pollicis', 'ulnar_deep'], ['dorsal interossei of hand', 'ulnar_deep'],
  ['flexor carpi radialis', 'median'], ['pronator teres', 'median'], ['abductor pollicis brevis', 'median_recurrent'],
  ['serratus anterior', 'long_thoracic'], ['latissimus dorsi', 'thoracodorsal'], ['rhomboid major', 'dorsal_scapular'],
  ['sartorius', 'femoral'], ['rectus femoris', 'femoral'], ['vastus medialis', 'femoral'], ['adductor longus', 'obturator'], ['gracilis', 'obturator'],
  ['gluteus maximus', 'inferior_gluteal'], ['gluteus medius', 'superior_gluteal'], ['tensor fasciae latae', 'superior_gluteal'],
  ['semitendinosus', 'sciatic'], ['gastrocnemius', 'tibial'], ['soleus', 'tibial'], ['tibialis posterior', 'tibial'],
  ['tibialis anterior', 'deep_fibular'], ['extensor hallucis longus', 'deep_fibular'], ['fibularis longus', 'superficial_fibular'],
  ['orbicularis oculi', 'facial_zygomatic'], ['frontalis', 'facial_temporal'], ['platysma', 'facial_cervical'], ['masseter', 'mandibular_v3'],
  ['temporalis', 'mandibular_v3'], ['sternocleidomastoid', 'accessory'], ['trapezius', 'accessory'], ['levator palpebrae superioris', 'oculomotor']
];
test('the textbook rows: the best-known muscles have the nerve every textbook gives', () => {
  for (const [muscle, nerve] of TEXTBOOK) {
    for (const side of ['right', 'left']) {
      const r = W.nerveForMuscle(`${side} ${muscle}`);
      assert.ok(r, muscle);
      assert.equal(r.trunk, `${side[0]}_${nerve}`, `${side} ${muscle} must be drawn from the ${nerve.replace(/_/g, ' ')} nerve`);
    }
  }
  assert.ok(TEXTBOOK.length >= 20);
  // and the main levels the MRC table prints in bold for some of them
  for (const [muscle, main] of [['deltoid', 'C5'], ['supraspinatus', 'C5'], ['triceps brachii', 'C7'], ['latissimus dorsi', 'C7'], ['tibialis anterior', 'L4'], ['extensor hallucis longus', 'L5'], ['abductor pollicis brevis', 'T1']])
    assert.equal(W.nerveForMuscle(`right ${muscle}`).main, main, muscle);
});

test('the nerves: every one named, sourced, with known levels, and its parents lead back to the cord or the brainstem', () => {
  assert.ok(TRUNKS.length >= 80 && TRUNKS.length <= 110, `${TRUNKS.length} trunks`);
  const need = ['axillary', 'musculocutaneous', 'radial', 'posterior_interosseous', 'median', 'anterior_interosseous', 'ulnar', 'lateral_pectoral', 'medial_pectoral', 'thoracodorsal',
    'long_thoracic', 'dorsal_scapular', 'suprascapular', 'upper_subscapular', 'lower_subscapular', 'femoral', 'obturator', 'superior_gluteal', 'inferior_gluteal', 'sciatic', 'tibial',
    'medial_plantar', 'lateral_plantar', 'common_fibular', 'deep_fibular', 'superficial_fibular', 'cervical_plexus', 'phrenic', 'oculomotor', 'mandibular_v3', 'facial', 'glossopharyngeal',
    'vagus', 'accessory', 'hypoglossal', 'subcostal', ...Array.from({ length: 11 }, (_, i) => `intercostal_t${i + 1}`)];
  for (const id of need) assert.ok(W.NERVE_TRUNKS[`r_${id}`], `missing nerve ${id}`);
  for (const id of Object.keys(W.NERVE_TRUNKS)) assert.match(id, /^r_[a-z0-9_]+$/, 'NERVE_TRUNKS holds the right side: ids r_...');
  for (const t of TRUNKS) {
    assert.equal(W.NERVE_TRUNKS[t.id], t); assert.equal(t.side, 'right');
    assert.ok(t.name.length > 5 && t.plain.length > 10, t.id);
    assert.ok(!/nerve of the nerve|undefined|null/.test(t.name + t.plain), t.id);
    assert.ok(t.roots.length >= 1, t.id);
    for (const l of t.roots) assert.ok(W.isKnownLevel(l), `${t.id}: unknown level ${l}`);
    for (const s of t.src) assert.ok(W.WIRING_SOURCES[s], `${t.id}: unknown source ${s}`);
    assert.ok(t.src.length >= 1, t.id);
    assert.ok(t.rule.length > 40, `${t.id}: no rule for how its course was laid`);
    // the parent chain ends, without a loop, at a trunk with no parent; that one starts at the cord or at the brainstem
    const chain = W.trunkChain(t.id);
    assert.equal(chain[chain.length - 1], t.id);
    assert.equal(new Set(chain).size, chain.length, `${t.id}: a loop in its parents`);
    const top = W.NERVE_TRUNKS[chain[0]];
    assert.equal(top.parent, null, t.id);
    assert.ok(['cord', 'midbrain', 'pons', 'medulla'].includes(t.origin), t.id);
    assert.equal(t.origin, top.origin, t.id);
    const cranial = t.roots.every(l => W.CRANIAL_LEVELS.includes(l));
    if (t.origin === 'cord') assert.ok(t.roots.every(l => W.CORD_LEVELS.includes(l)), `${t.id}: a nerve from the cord with a cranial level`);
    else { assert.ok(cranial, `${t.id}: a nerve from the brainstem with a spinal level`); assert.equal(t.origin, W.CRANIAL_ORIGIN[top.roots[0]], t.id); }
    // a branch carries only levels its parent carries
    // (or says, in extraRoots and its note, which level joins it from outside that bundle)
    if (t.parent) for (const l of t.roots) assert.ok(W.NERVE_TRUNKS[t.parent].roots.includes(l) || (t.extraRoots.includes(l) && t.note.length > 20), `${t.id}: level ${l} is not in its parent ${t.parent}`);
    for (const l of t.extraRoots) assert.ok(t.roots.includes(l), t.id);
    // a branch starts exactly at a point of its parent's course
    if (t.parent) { assert.ok(Number.isInteger(t.from), `${t.id}: its first point is not a point of ${t.parent}`); assert.deepEqual(t.course[0].p, W.NERVE_TRUNKS[t.parent].course[t.from].p, t.id); assert.equal(t.course[0].seg, W.NERVE_TRUNKS[t.parent].course[t.from].seg, t.id); } else assert.equal(t.from, null);
  }
  // the size the contract asks for: a trunk of modest length, a branch short
  for (const t of TRUNKS) assert.ok(t.course.length >= 2 && t.course.length <= 20, `${t.id}: ${t.course.length} points`);
  const total = TRUNKS.reduce((s, t) => s + t.course.length, 0);
  assert.ok(total < 600, `${total} course points`);
  // a nerve from the cord starts at the exit of its own single level, or (a bundle of several roots) within reach of its roots' exits
  for (const t of TRUNKS.filter(x => !x.parent && x.origin === 'cord')) {
    const lines = W.trunkRootLines(t.id);
    assert.equal(lines.length, t.roots.length, t.id);
    if (t.roots.length === 1) assert.ok(dist(t.course[0].p, W.rootExitAt(t.roots[0]).p) < 0.05, `${t.id} does not start at the exit of ${t.roots[0]}`);
    else for (const l of lines) assert.ok(dist(l.points[0].p, l.points[1].p) < 150, `${t.id}: root ${l.level} joins from ${Math.round(dist(l.points[0].p, l.points[1].p))} mm`);
  }
  // sources: each has a reference, a link and what was taken from it; every one is used
  const used = new Set([...TRUNKS.flatMap(t => t.src), ...W.MUSCLE_ROWS.flatMap(r => r.src), ...W.BRAIN_LINKS.flatMap(l => l.src), 'WIKI_CORD']);
  for (const [k, s] of Object.entries(W.WIRING_SOURCES)) { assert.ok(s.ref.length > 30 && /^https:\/\//.test(s.url) && s.used.length > 20, k); assert.ok(used.has(k), `source ${k} is cited nowhere`); }
});

test('every course point rides a real rig segment and lies inside the body at rest', () => {
  const segs = RIG.segments, kids = {};
  for (const [id, s] of Object.entries(segs)) if (s.parent) (kids[s.parent] = kids[s.parent] || []).push(id);
  // the "skeleton" of a rig segment, from the rig file alone: its own joint, its rest centroid, and the joints of the
  // segments that hang from it (and from those: the forearm's wrist is its child's child's joint)
  const lines = id => {
    const s = segs[id], own = s.joint && RIG.pivots[s.joint] ? RIG.pivots[s.joint].point : null, c = s.restCentroid || null, ends = [];
    for (const k of kids[id] || []) { if (segs[k].joint && RIG.pivots[segs[k].joint]) ends.push(RIG.pivots[segs[k].joint].point); for (const g of kids[k] || []) if (segs[g].joint && RIG.pivots[segs[g].joint]) ends.push(RIG.pivots[segs[g].joint].point); }
    const base = own || c, out = [];
    if (own && c) out.push([own, c]);
    for (const e of ends) out.push([base || e, e]);
    if (!out.length && base) out.push([base, base]);
    return out;
  };
  const toLine = (p, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2, t = l2 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2)) : 0; return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t); };
  // how far from its segment's skeleton a point of the body can be, by kind of segment (mm): a limb's radius, a rib's
  // half-length, the trunk's half-width at the pelvis ... (measured maxima of the laid data are a third or more below)
  const reach = seg => /_(upperarm|forearm)$/.test(seg) ? 65 : /_radius$/.test(seg) ? 60 : /_hand$/.test(seg) ? 45 : /_(thumb|index|middle|ring|little)_/.test(seg) ? 35
    : /_thigh$/.test(seg) ? 105 : /_shank$/.test(seg) ? 90 : /_foot$/.test(seg) ? 60 : /_(toes|hallux)$/.test(seg) ? 40
      : /_rib\d+$/.test(seg) ? 180 : /_cc\d$/.test(seg) ? 110 : seg === 't11' || seg === 't12' ? 150 : /^(t\d+|l\d|lumbar|thorax)$/.test(seg) ? 120
        : seg === 'pelvis' ? 190 : seg === 'skull' ? 120 : seg === 'mandible' || seg === 'cervical' ? 85 : seg === 'hyoid' ? 55 : seg === 'sternum' ? 120 : /_girdle$/.test(seg) ? 110 : /_clav$/.test(seg) ? 60 : 0;
  const check = (seg, p, what) => {
    assert.ok(segs[seg], `${what}: "${seg}" is not a segment of the rig`);
    assert.ok(Array.isArray(p) && p.length === 3 && p.every(Number.isFinite), what);
    const r = reach(seg);
    assert.ok(r > 0, `${what}: no bound is set for segment ${seg}`);
    const d = Math.min(...lines(seg).map(([a, b]) => toLine(p, a, b)));
    assert.ok(d <= r, `${what}: ${Math.round(d)} mm from the skeleton of ${seg} (bound ${r})`);
  };
  for (const t of TRUNKS) t.course.forEach((q, i) => {
    check(q.seg, q.p, `${t.id}[${i}]`);
    // right side and midline only: no point on the body's left
    assert.ok(q.p[0] <= 6, `${t.id}[${i}] lies on the left (x = ${q.p[0]})`);
    assert.ok(!/^l_/.test(q.seg), `${t.id}[${i}] rides a left-side segment`);
  });
  for (const r of Object.values(W.MUSCLE_NERVE_BY_ID)) {
    check(r.end.seg, r.end.p, `${r.id} ${r.name}`);
    // a muscle's point is on the muscle's own side
    if (r.side === 'left') assert.ok(r.end.p[0] > -12, `${r.id}: a left muscle's point at x = ${r.end.p[0]}`);
    if (r.side === 'right') assert.ok(r.end.p[0] < 20, `${r.id}: a right muscle's point at x = ${r.end.p[0]}`);
    assert.ok(Number.isInteger(r.at) && r.at >= 0 && r.at < W.trunkById(r.trunk).course.length, r.id);
    // the twig from the nerve to the muscle is short (the longest real ones, to the thigh's great muscles, are about 10 cm)
    const a = W.trunkById(r.trunk).course[r.at].p;
    assert.ok(dist(a, r.end.p) < 125, `${r.id} ${r.name}: a twig of ${Math.round(dist(a, r.end.p))} mm`);
  }
  for (const q of [...W.cordCourse(), ...W.caudaCourse()]) check(q.seg, q.p, `canal v=${q.v}`);
  for (const l of W.CORD_LEVELS) { const e = W.rootExitAt(l); check(e.seg, e.p, `exit ${l}`); }
  // what the generator measured on the real meshes when it laid the block (tools/build-wiring-courses.mjs): every
  // point inside the body, none left inside a long bone; and the block was laid over THIS rig (its pivots)
  const c = W.WIRING_GENERATED.check;
  assert.equal(c.outside, 0);
  assert.equal(c.musclePointsOutside, 0);
  assert.equal(c.musclePoints, 292);
  assert.ok(c.lowestEnclosure >= 10, `lowest enclosure ${c.lowestEnclosure}`);
  assert.equal(c.coursePoints + TRUNKS.filter(t => t.parent).length, TRUNKS.reduce((s, t) => s + t.course.length, 0));
  for (const [n, p] of Object.entries(c.rigPivots)) assert.ok(dist(p, pivot(n)) < 0.06, `the courses were laid over another rig: pivot ${n} moved by ${dist(p, pivot(n)).toFixed(1)} mm. Run node tools/build-wiring-courses.mjs`);
  // the muscles of the block are the rig's muscles
  assert.deepEqual(W.WIRING_GENERATED.muscles.map(m => [m[0], m[1], m[3]]), RIG.muscles.map(m => [m.id, m.name, m.side]));
});

test('every point of a limb lies inside that limb\'s outline, on the right one of its segments', () => {
  // the outline the generator measured round each limb's axis (the rig's own joints) on the limb's meshes: a point moved
  // off the limb, or riding the wrong one of its segments, falls outside it
  const O = W.WIRING_GENERATED.outline, n = O.stations.count, S = O.sectors;
  const frame = o => {
    const a = pivot(o.from), b = pivot(o.to), e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...e); e[0] /= L; e[1] /= L; e[2] /= L;
    const u = o.u, v = [e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]];
    return { a, e, L, u, v };
  };
  const where = (o, p) => {
    const { a, e, L, u, v } = frame(o);
    const x = p[0] - a[0], y = p[1] - a[1], z = p[2] - a[2], t = (x * e[0] + y * e[1] + z * e[2]) / L, st = Math.floor((t - O.stations.from) / O.stations.step);
    const px = x - t * L * e[0], py = y - t * L * e[1], pz = z - t * L * e[2];
    const sec = ((Math.floor((Math.atan2(px * v[0] + py * v[1] + pz * v[2], px * u[0] + py * u[1] + pz * u[2]) + Math.PI) / (2 * Math.PI) * S) % S) + S) % S;
    return { st, sec, rad: Math.hypot(px, py, pz) };
  };
  // the one point that lies in a hollow of the meshes, where the atlas has no fat: there the outline is bridged across
  // the hollow, as the skin is, from the bins two sectors (20 degrees) to either side
  const HOLLOW = { 'r_tibial[1]': 'behind the knee, between the hamstring tendons' };
  const allowedAt = (o, w, what) => {
    // the outline in the point's own station and its own 10-degree sector: the farthest the limb's mesh surfaces lie
    // from the axis there (an empty bin allows nothing)
    const R = k => o.r[w.st][(w.sec + k + S) % S];
    if (!own(HOLLOW, what)) return R(0);
    const bridged = Math.max(R(0), Math.min(R(-1), R(1)), Math.min(R(-2), R(2)));
    assert.ok(R(0) < bridged / 2, `${what}: not in a hollow (${R(0)} mm, ${bridged} mm bridged)`);
    return bridged;
  };
  const inside = (seg, p, what, slack = 3) => {
    for (const [name, o] of Object.entries(O.limbs)) {
      if (!o.segs.includes(seg)) continue;
      const w = where(o, p);
      if (!(w.st >= 0 && w.st < n)) return { name, ok: false, msg: `${what}: rides ${seg} but lies beyond the ${name}'s ends` };
      const allowed = allowedAt(o, w, what);
      return { name, o, w, allowed, ok: allowed > 0 && w.rad <= allowed + slack, msg: `${what}: ${Math.round(w.rad)} mm from the ${name}'s axis, outside its outline (${allowed} mm there)` };
    }
    return null;
  };
  const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  const check = (seg, p, what, slack = 3) => { const r = inside(seg, p, what, slack); if (!r) return 0; assert.ok(r.ok, r.msg); return 1; };
  let n1 = 0;
  for (const t of TRUNKS) t.course.forEach((q, i) => { n1 += check(q.seg, q.p, `${t.id}[${i}]`); });
  for (const r of Object.values(W.MUSCLE_NERVE_BY_ID)) {
    if (r.side === 'left') n1 += check(W.mirrorId(r.end.seg), W.mirrorPoint(r.end.p), `${r.id} ${r.name} (mirrored)`, 8);
    else n1 += check(r.end.seg, r.end.p, `${r.id} ${r.name}`);
  }
  assert.ok(n1 > 200, `${n1} points checked against the limbs' outlines`);
  // and it catches a point moved off its limb to ANY side: every limb point, moved 20, 40 and 60 mm to each of eight
  // sides square to the limb's axis, fails wherever the move takes it more than 5 mm beyond the limb's surface in its
  // own bin (a move that stays within the limb, across it or along it, is not caught: that needs the meshes)
  let off = 0, caught = 0, within = 0;
  for (const t of TRUNKS.filter(x => x.side === 'right')) t.course.forEach((q, i) => {
    const what = `${t.id}[${i}]`, r0 = inside(q.seg, q.p, what); if (!r0 || own(HOLLOW, what)) return;
    const { u, v } = frame(r0.o);
    for (const mm of [20, 40, 60]) for (let k = 0; k < 8; k++) {
      const d = [0, 1, 2].map(j => Math.cos(k * Math.PI / 4) * u[j] + Math.sin(k * Math.PI / 4) * v[j]);
      const r = inside(q.seg, q.p.map((x, j) => x + d[j] * mm), `${what} moved`);
      if (r.w && r.w.rad <= r.o.r[r.w.st][r.w.sec] + 5) { within++; continue; }
      off++; if (!r.ok) caught++;
    }
  });
  assert.ok(off > 1000 && caught === off, `${off - caught} of ${off} moves off the limbs pass`);
  // the case the checkers tried, the tibial nerve's mid-calf point moved outward (away from the shin's axis, which runs
  // through the shin bone at the front of the leg): moved past the calf's surface it fails, 4 mm past it as well; moved
  // 60 mm it still lies inside the calf (whose back is 84 mm behind that axis there), which the outline cannot see
  { const q = TRUNKS.find(t => t.id === 'r_tibial').course[5], r0 = inside(q.seg, q.p, 'r_tibial[5]'), { a, e } = frame(r0.o);
    const x = q.p.map((c, j) => c - a[j]), along = x[0] * e[0] + x[1] * e[1] + x[2] * e[2], out = x.map((c, j) => c - along * e[j]), ol = Math.hypot(...out);
    const moved = mm => inside(q.seg, q.p.map((c, j) => c + out[j] / ol * mm), 'moved'), surface = r0.allowed - r0.w.rad;
    assert.ok(surface > 50 && moved(60).ok, `the calf behind r_tibial[5]: ${Math.round(surface)} mm`);
    for (const past of [4, 10, 30]) assert.ok(!moved(surface + past).ok, `r_tibial[5] moved ${past} mm past the calf's surface`); }
  // the outline is a real one: about the size of each limb
  for (const [name, o] of Object.entries(O.limbs)) { const mx = Math.max(...o.r.flat()); assert.ok(mx > 25 && mx < 200, `${name}: outline up to ${mx} mm`); }
});

test('under one-joint turns, no straight piece of a nerve or of a twig stretches by more than 40 mm (60 at the ends of the ranges), nor passes through a long bone', () => {
  // each pose turns the segments that hang from one joint about the rig's own pivot and axis (WIRING_POSES); a piece
  // whose two ends ride segments on both sides of that joint changes length. A point that rides the wrong segment (the
  // nerve to latissimus on the humerus: +70 mm; a point of the shin on the thigh: well over 100 mm) shows up here.
  const lines = TRUNKS.map(t => ({ id: t.id, pts: t.course }));
  for (const r of Object.values(W.MUSCLE_NERVE_BY_ID)) if (r.side !== 'left') lines.push({ id: `twig to ${r.id} ${r.name}`, pts: [W.trunkById(r.trunk).course[r.at], { seg: r.end.seg, p: r.end.p }] });
  const rows = poseStretch(RIG, lines);
  assert.ok(rows.length > 50, `${rows.length} pieces across a turned joint`);
  for (const pose of WIRING_POSES) assert.ok(rows.some(r => r.pose === pose.name), `the pose "${pose.name}" turned nothing`);
  // 40 mm; 60 mm at the ends of the ranges (hip bent 100, knee bent 120, elbow bent 140), where soft tissue really
  // stretches and folds and rigid points cannot follow (the sciatic nerve behind the bent hip: 53 mm)
  const END = /hip bent 100|knee bent 120|elbow bent 140/;
  for (const r of rows) assert.ok(r.grows <= (END.test(r.pose) ? 60 : 40), `${r.id}[${r.i}] stretches ${Math.round(r.grows)} mm (${Math.round(r.rest)} -> ${Math.round(r.posed)}) with "${r.pose}"`);
  // with a joint turned, no piece passes more than 20 mm further through a long bone of the limbs (the generator's
  // capsules: the bone's axis and its shaft's radius, the ends trimmed by a tenth, where the joint's own shapes are) than
  // it does at rest. The ends of the ranges are left out: there the forearm's front folds onto the arm's, and the shin's
  // back onto the thigh's, which flesh allows and rigid points cannot (the median nerve's piece across the elbow at 140
  // degrees: 28 mm). With the forearm fully turned (160 degrees, the game's own start) the radius sweeps across the
  // forearm: 19 mm of the twig to extensor carpi ulnaris (from a nerve on the radius to a point on the ulna), 15 mm of
  // the ulnar nerve above the wrist, 13 mm of the twigs to pronator teres.
  const trim = b => { const d = [0, 1, 2].map(k => b.b[k] - b.a[k]); return { ...b, a: b.a.map((v, k) => v + 0.1 * d[k]), b: b.b.map((v, k) => v - 0.1 * d[k]) }; };
  const bones = W.WIRING_GENERATED.bones.map(trim);
  assert.deepEqual(bones.map(b => b.name), ['humerus', 'ulna', 'radius', 'femur', 'tibia', 'fibula']);
  for (const b of W.WIRING_GENERATED.bones) assert.ok(b.r > 3 && b.r < 20 && RIG.segments[b.seg], b.name);
  const pb = poseBone(RIG, lines, bones, WIRING_POSES.filter(p => !END.test(p.name)));
  for (const r of pb) assert.ok(r.extra <= 20, `${r.id}[${r.i}] passes ${Math.round(r.extra)} mm more through the ${r.bone} with "${r.pose}"`);
  assert.ok(WIRING_POSES.some(p => /160/.test(p.name)) && WIRING_POSES.some(p => /jaw/.test(p.name)) && WIRING_POSES.some(p => /neck turned/.test(p.name)));
  // the turns go the way they say (a bent elbow brings the wrist forward, a bent knee takes the ankle back)
  const elbow = WIRING_POSES.find(p => p.name.startsWith('elbow')), knee = WIRING_POSES.find(p => p.name.startsWith('knee'));
  // (a probe line from far in front of the body, at the joint's height, to the joint's far end: shorter when that end
  // comes forward, longer when it goes back)
  const probe = (pose, seg, far) => poseStretch(RIG, [{ id: 'probe', pts: [{ seg: 'pelvis', p: [pivot(far)[0], -3000, pivot(pose.joint)[2]] }, { seg, p: pivot(far) }] }], [pose])[0];
  assert.ok(probe(elbow, 'r_hand', 'r_wrist').grows < 0, 'the bent elbow does not bring the wrist forward');
  assert.ok(probe(knee, 'r_foot', 'r_ankle').grows > 0, 'the bent knee does not take the ankle back');
});

test('each root joins its bundle at its own point: no root climbs to the bundle\'s first point', () => {
  let lines = 0;
  for (const t of TRUNKS.filter(x => !x.parent && x.origin === 'cord')) {
    assert.ok(t.rootJoin && t.rootsLeave, t.id);
    assert.deepEqual(Object.keys(t.rootJoin), [...t.roots], t.id);
    for (const [level, j] of Object.entries(t.rootJoin)) {
      assert.ok(Number.isInteger(j) && j >= 0 && j < t.course.length, `${t.id} ${level}: join ${j}`);
      const way = W.rootWay(t.id, level), line = W.trunkRootLines(t.id).find(l => l.level === level);
      assert.ok(way.length >= 2 && line, `${t.id} ${level}`);
      assert.deepEqual(way.at(-1).p, t.course[j].p, `${t.id} ${level}: the root's way ends at its join point`);
      assert.deepEqual(line.points[1].p, t.course[j].p); assert.equal(line.join, j);
      assert.deepEqual(way[0].p, W.cordLevelAt(level).p, `${t.id} ${level}: the root's way starts on the cord at its own segment`);
      if (t.rootsLeave === 'opening') {
        assert.deepEqual(line.points[0].p, W.rootExitAt(level).p);
        const rise = t.course[j].p[2] - W.rootExitAt(level).p[2];
        assert.ok(rise <= 10, `${t.id} ${level}: the root climbs ${Math.round(rise)} mm from its opening to the bundle`);
      } else assert.deepEqual(line.points[0].p, W.cordLevelAt(level).p, `${t.id} ${level}: its root leaves the cord's side inside the canal`);
      // the left twin: the same joins, mirrored
      const m = W.mirrorTrunk(t.id), ml = W.trunkRootLines(m.id).find(l => l.level === level);
      assert.equal(m.rootJoin[level], j); assert.deepEqual(ml.points[1].p, W.mirrorPoint(t.course[j].p));
      lines++;
    }
  }
  assert.ok(lines > 60, `${lines} roots`);
  // the bundles whose lower roots used to climb: their roots now join at different points, in order down the bundle
  for (const [id, levels] of [['r_lumbar_plexus', ['L2', 'L3', 'L4']], ['r_sacral_plexus', ['S1', 'S2', 'S3']], ['r_cervical_muscular', ['C3', 'C5', 'C7']]]) {
    const js = levels.map(l => W.NERVE_TRUNKS[id].rootJoin[l]);
    for (let i = 1; i < js.length; i++) assert.ok(js[i] > js[i - 1], `${id}: ${levels.join(', ')} join at ${js.join(', ')}`);
  }
  // the accessory nerve: its roots leave the cord's side inside the canal, its strand climbs into the skull
  const xi = W.NERVE_TRUNKS.r_accessory;
  assert.equal(xi.rootsLeave, 'cord');
  assert.ok(xi.course[0].p[2] < xi.course[2].p[2] && xi.course[2].p[2] < W.cordCourse()[0].p[2] + 30, 'the accessory strand does not climb beside the cord');
  // the way to a muscle starts where its main root leaves the column and goes straight to the bundle at that root's
  // point: it does not climb up the bundle and come down again
  for (const r of Object.values(W.MUSCLE_NERVE_BY_ID)) {
    const p = W.nervePathForMuscle(r.id);
    if (p.origin !== 'cord') continue;
    const top = W.trunkById(W.trunkChain(p.trunk)[0]);
    if (top.rootsLeave !== 'opening') continue;
    assert.deepEqual(p.points[0].p, W.rootExitAt(p.level, p.side).p, `${r.id}: the way does not start at the opening of ${p.level}`);
    if (!p.points[1].muscle) assert.ok(p.points[1].p[2] <= p.points[0].p[2] + 10, `${r.id} ${r.name}: from the opening of ${p.level} the way climbs ${Math.round(p.points[1].p[2] - p.points[0].p[2])} mm`);
  }
  // and the whole way runs only outward: along each nerve it uses, its points come in the order of that nerve's course
  // (never back up a bundle), every nerve of the way is the next one down the chain, and it ends at its twig
  for (const r of Object.values(W.MUSCLE_NERVE_BY_ID)) {
    const p = W.nervePathForMuscle(r.id), course = p.points.filter(q => q.trunk);
    for (let k = 1; k < course.length; k++) {
      const a = course[k - 1], b = course[k];
      if (a.trunk === b.trunk) assert.ok(b.i === a.i + 1, `${r.id} ${r.name}: its way runs back along ${a.trunk} (${a.i} then ${b.i})`);
      else { assert.equal(W.trunkById(b.trunk).parent, a.trunk, `${r.id}: ${b.trunk} does not branch from ${a.trunk}`); assert.equal(b.i, 1, r.id); assert.equal(W.trunkById(b.trunk).from, a.i, `${r.id}: leaves ${a.trunk} at ${a.i}, but ${b.trunk} branches at ${W.trunkById(b.trunk).from}`); }
    }
    // (a twig that leaves at a branch's first point leaves from its parent's point there)
    const at = W.MUSCLE_NERVE_BY_ID[r.id].at, t = W.trunkById(p.trunk), last = course.at(-1);
    if (at === 0 && t.parent) { assert.equal(last.trunk, t.parent, r.id); assert.equal(last.i, t.from, r.id); }
    else { assert.equal(last.trunk, p.trunk, r.id); assert.equal(last.i, at, `${r.id}: the way does not end where its twig leaves`); }
  }
});

test('typical courses keep their taught places (against the rig\'s own joints)', () => {
  const sh = pivot('r_glenohumeral'), el = pivot('r_elbow'), wr = pivot('r_wrist'), hip = pivot('r_hip'), kn = pivot('r_knee'), an = pivot('r_ankle');
  const onLine = (a, b, z) => { const t = (z - a[2]) / (b[2] - a[2]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z]; };
  const nearestZ = (id, z) => courseOf(id).reduce((b, p) => (Math.abs(p[2] - z) < Math.abs(b[2] - z) ? p : b));
  // +y is the body's back, +x its left (so on the right side: larger x = nearer the midline)
  // the radial nerve winds BEHIND the humerus at mid-arm, and lies in FRONT of the elbow's outer side at its end
  const rad = nearestZ('radial', (sh[2] + el[2]) / 2), hum = onLine(sh, el, rad[2]);
  assert.ok(rad[1] > hum[1] + 8, 'the radial nerve is not behind the humerus at mid-arm');
  const radEnd = courseOf('radial').at(-1);
  assert.ok(radEnd[1] < el[1] && radEnd[0] < el[0], 'the radial nerve does not end in front of the outer side of the elbow');
  // the ulnar nerve passes BEHIND the inner knob of the elbow; the median nerve in FRONT of the elbow
  const uln = nearestZ('ulnar', el[2]);
  assert.ok(uln[1] > el[1] - 2 && uln[0] > el[0] + 15, 'the ulnar nerve is not behind the inner side of the elbow');
  const med = nearestZ('median', el[2]);
  assert.ok(med[1] < el[1] - 12, 'the median nerve is not in front of the elbow');
  // at the wrist the median nerve is on the palm side (front), the deep radial branch on the back
  assert.ok(nearestZ('median', wr[2])[1] < wr[1] - 4, 'the median nerve is not on the palm side of the wrist');
  assert.ok(courseOf('posterior_interosseous').at(-1)[1] > nearestZ('median', wr[2] + 20)[1] + 12, 'the deep radial branch is not behind the median nerve above the wrist');
  // the axillary nerve passes behind the shoulder joint
  assert.ok(courseOf('axillary').some(p => p[1] > sh[1] + 10 && p[2] < sh[2]), 'the axillary nerve does not pass behind and below the shoulder joint');
  // the sciatic nerve runs BEHIND the thigh bone; the femoral nerve in FRONT of the hip joint
  for (const p of courseOf('sciatic').slice(2)) assert.ok(p[1] > onLine(hip, kn, p[2])[1] + 8, 'the sciatic nerve is not behind the thigh bone');
  assert.ok(courseOf('femoral').some(p => Math.abs(p[2] - hip[2]) < 30 && p[1] < hip[1] - 25), 'the femoral nerve is not in front of the hip joint');
  // the obturator nerve is on the inner side of the hip joint; the superior gluteal nerve climbs above the sciatic's start
  assert.ok(nearestZ('obturator', hip[2])[0] > hip[0] + 20, 'the obturator nerve is not medial to the hip joint');
  assert.ok(courseOf('superior_gluteal').slice(1).every(p => p[2] > courseOf('sciatic')[0][2]), 'the superior gluteal nerve does not leave above piriformis');
  // behind the knee the tibial nerve is at the back; the common fibular nerve winds to the OUTER side below the knee
  assert.ok(nearestZ('tibial', kn[2])[1] > kn[1] + 12, 'the tibial nerve is not behind the knee');
  assert.ok(courseOf('common_fibular').at(-1)[0] < kn[0] - 25 && courseOf('common_fibular').at(-1)[2] < kn[2], 'the common fibular nerve does not reach the outer side below the knee');
  // at the ankle: the tibial nerve behind and on the inner side, the deep fibular nerve in front
  const tib = nearestZ('tibial', an[2]);
  assert.ok(tib[1] > an[1] - 8 && tib[0] > an[0] + 12, 'the tibial nerve is not behind the inner ankle');
  assert.ok(nearestZ('deep_fibular', an[2])[1] < an[1] - 15, 'the deep fibular nerve is not in front of the ankle');
  // the plantar nerves run forward in the sole, the medial one on the big-toe side
  assert.ok(courseOf('medial_plantar').at(-1)[0] > courseOf('lateral_plantar').at(-1)[0] + 25, 'the medial plantar nerve is not on the big-toe side');
  // the intercostal nerves run round to the front; the lower ones go on down into the belly wall
  for (let n = 1; n <= 11; n++) { const c = courseOf(`intercostal_t${n}`); assert.ok(c.at(-1)[1] < c[0][1] - (n <= 2 ? 40 : 60), `intercostal T${n} does not reach the front`); if (n >= 7) assert.ok(c.at(-1)[2] < c[0][2] - 60, `intercostal T${n} does not run down into the belly wall`); }
  // every back branch ends behind (and to the side of) where it left the column
  for (const l of W.DORSAL_RAMUS_LEVELS) { const c = courseOf(short(W.dorsalTrunkOf(l))); assert.ok(c.at(-1)[1] > c[0][1] + 20, `the back branch of ${l} does not run back`); }
  // the phrenic nerve runs from the neck down into the chest; the vagus down the neck
  assert.ok(courseOf('phrenic')[0][2] - courseOf('phrenic').at(-1)[2] > 220);
  assert.ok(courseOf('vagus').at(-1)[2] < pivot('cervicothoracic')[2]);
  // the facial nerve leaves the skull below the level of the jaw joint and its branches fan out in front of it
  const fac = courseOf('facial'), tmj = pivot('tmj');
  assert.ok(fac[3][2] < tmj[2] && fac[3][2] > tmj[2] - 30, 'the facial nerve does not leave the skull just below the ear');
  assert.ok(courseOf('facial_temporal').at(-1)[2] > courseOf('facial_zygomatic').at(-1)[2] && courseOf('facial_zygomatic').at(-1)[2] > courseOf('facial_buccal').at(-2)[2]
    && courseOf('facial_buccal').at(-2)[2] > courseOf('facial_mandibular').at(-1)[2] && courseOf('facial_mandibular').at(-1)[2] > courseOf('facial_cervical').at(-1)[2], 'the five face branches are not in their order from the forehead down to the neck');
  assert.ok(courseOf('facial_posterior_auricular').at(-1)[1] > fac[3][1] + 40, 'the posterior auricular branch does not run to the back of the head');
});

test('cranial nerves start in the brainstem inside the skull and never pass the cord', () => {
  const ao = pivot('atlanto_occipital');
  const cord = [...W.cordCourse().filter(q => q.v >= W.CORD_TOP_V), ...W.caudaCourse()].map(q => q.p);
  const cranial = TRUNKS.filter(t => t.origin !== 'cord');
  assert.ok(cranial.length >= 10);
  const stemZ = { medulla: [1464, 1506], pons: [1502, 1531], midbrain: [1528, 1546] }; // the brainstem meshes' heights in the atlas (inputs/MESH-MANIFEST.json bounds)
  for (const t of cranial) {
    for (const q of t.course) for (const c of cord) assert.ok(dist(q.p, c) > 6, `${t.id} touches the cord`);
    assert.ok(!W.trunkChain(t.id).some(id => W.NERVE_TRUNKS[id].origin === 'cord'), t.id);
    assert.equal(W.trunkRootLines(t.id).length, 0, t.id);
    if (!t.parent) {
      const p = t.course[0].p, [z0, z1] = stemZ[t.origin];
      assert.equal(t.course[0].seg, 'skull', t.id);
      assert.ok(p[2] >= z0 && p[2] <= z1 && Math.abs(p[0]) < 24 && p[2] > ao[2], `${t.id} does not start on the ${t.origin}`);
    }
  }
  // the brainstem heights used above are the atlas's own
  const b = id => BRAIN.find(a => a.element_id === id);
  assert.deepEqual([Math.floor(b('FJ1831').bounds_min[2]), Math.ceil(b('FJ1831').bounds_max[2])], stemZ.medulla);
  assert.deepEqual([Math.floor(b('FJ1822').bounds_min[2]), Math.ceil(b('FJ1822').bounds_max[2])], stemZ.pons);
  assert.deepEqual([Math.floor(b('FJ1817').bounds_min[2]), Math.ceil(b('FJ1817').bounds_max[2])], stemZ.midbrain);
  // and no muscle moved by a cranial nerve has a twig that leaves inside the skull
  for (const r of Object.values(W.MUSCLE_NERVE_BY_ID)) { const t = W.trunkById(r.trunk); if (t.origin !== 'cord' && !t.parent) assert.ok(r.at >= 2, `${r.id}: its twig leaves the ${t.id} inside the skull`); }
});

test('the cord: shorter than the column, each segment above the vertebra its nerve leaves under', () => {
  assert.equal(W.CORD_LEVELS.length, 29);
  assert.deepEqual(W.CORD_LEVELS.slice(0, 8), ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
  assert.deepEqual(W.CORD_LEVELS.slice(-4), ['S1', 'S2', 'S3', 'S4']);
  let last = -1, lastLag = -1;
  for (const l of W.CORD_LEVELS) {
    const c = W.cordLevelAt(l), e = W.rootExitAt(l);
    assert.ok(c && e, l);
    assert.ok(c.v > last, `${l}: the segments are not in order`); last = c.v;
    assert.ok(c.v <= W.CORD_END_V, `${l}: a cord segment below the cord's end`);
    // the nerve leaves the column at or below its segment, and the gap grows down the cord
    const lag = e.v - c.v;
    assert.ok(l === 'C1' ? Math.abs(lag) <= 0.5 : lag > -0.5, `${l}: its nerve leaves ${-lag} vertebrae ABOVE its segment`);
    if (!/^C[1-3]$/.test(l)) assert.ok(lag >= lastLag - 1e-9, `${l}: the roots do not get longer down the cord`);
    lastLag = lag;
    // the pivots it names exist in the rig, t is a share between them, and its point lies on that stretch
    assert.ok(RIG.pivots[c.fromPivot] && RIG.pivots[c.toPivot], l);
    assert.ok(c.t >= 0 && c.t <= 1, l);
    const a = pivot(c.fromPivot), b = pivot(c.toPivot), on = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * c.t);
    assert.ok(dist(on, c.p) < 16, `${l}: the cord point is ${Math.round(dist(on, c.p))} mm from the line of the pivots`);
    assert.ok(RIG.segments[c.seg], l);
    assert.ok(e.fromPivot && RIG.pivots[e.fromPivot], l);
    assert.ok(e.p[0] < -5 && Math.abs(W.rootExitAt(l, 'left').p[0] + e.p[0]) < 1e-9, `${l}: the exit is not on the right, or the left is not its mirror`);
    // beside the canal (within 3 cm; the sacral openings are on the FRONT of a thick bone, up to 5 cm from its canal)
    assert.ok(dist(e.p, W.cordPointAt(e.v).p) < (l[0] === 'S' ? 50 : 30), `${l}: the exit is ${Math.round(dist(e.p, W.cordPointAt(e.v).p))} mm from the canal`);
  }
  // the taught landmarks: the cord ends at about L1/L2; the lumbar segments lie behind T10 to T12, the sacral ones behind
  // T12 and L1; low cervical segments one vertebra up; the cervical nerves leave above their vertebra, C8 under C7,
  // thoracic and lumbar nerves under their own vertebra
  assert.equal(W.pivotSpanAt(W.CORD_END_V).fromPivot, 'thoracolumbar'); assert.equal(W.pivotSpanAt(W.CORD_END_V).toPivot, 'l1_l2'); assert.equal(W.pivotSpanAt(W.CORD_END_V).t, 1);
  for (const l of ['L1', 'L2', 'L3', 'L4', 'L5']) assert.ok(['T10', 'T11', 'T12'].includes(W.cordLevelAt(l).vertebra), `${l} at ${W.cordLevelAt(l).vertebra}`);
  for (const l of ['S1', 'S2', 'S3', 'S4']) assert.ok(['T12', 'L1'].includes(W.cordLevelAt(l).vertebra), `${l} at ${W.cordLevelAt(l).vertebra}`);
  assert.equal(W.cordLevelAt('C8').vertebra, 'C7');
  assert.equal(W.cordLevelAt('T6').vertebra, 'T5');
  assert.equal(W.cordLevelAt('T12').vertebra, 'T10');
  assert.equal(W.rootExitAt('C1').between, 'the skull and C1');
  assert.equal(W.rootExitAt('C5').between, 'C4 and C5');
  assert.equal(W.rootExitAt('C8').between, 'C7 and T1');
  assert.equal(W.rootExitAt('T4').between, 'T4 and T5');
  assert.equal(W.rootExitAt('L5').between, 'L5 and the sacrum');
  assert.equal(W.rootExitAt('T12').toPivot, 'thoracolumbar');
  assert.equal(W.cordLevelAt('VII'), null);
  assert.equal(W.rootExitAt('XI'), null);
  // the canal's centre line: at every vertebral pivot the measured canal lies within a few millimetres of the pivot
  // (the pivots are whole-vertebra centroids, which sit in the canal), and the line runs smoothly
  for (const [name, v] of W.VERTEBRAL_PIVOTS) assert.ok(dist(W.cordPointAt(v).p, pivot(name)) < 16, `${name}: the canal is ${Math.round(dist(W.cordPointAt(v).p, pivot(name)))} mm from the pivot`);
  const cc = W.cordCourse(), ca = W.caudaCourse();
  assert.ok(cc.length >= 30 && cc[0].seg === 'skull' && cc[0].v < 0, 'the cord\'s first point is inside the skull');
  assert.equal(cc.at(-1).v, W.CORD_END_V);
  assert.equal(ca[0].v, W.CORD_END_V); assert.equal(ca.at(-1).v, W.ROOT_EXIT_V.S4);
  for (const run of [cc, ca]) for (let i = 1; i < run.length; i++) { assert.ok(run[i].p[2] < run[i - 1].p[2], 'the canal line does not run down'); assert.ok(dist(run[i].p, run[i - 1].p) < 45, 'a jump in the canal line'); assert.ok(Math.abs(run[i].p[0]) < 4, 'the canal line leaves the midline'); }
  // a root's way: from its segment down the canal to its exit; the lumbar and sacral roots are long (the horse's tail)
  const len = l => { const r = W.rootCourse(l); let s = 0; for (let i = 1; i < r.length; i++) s += dist(r[i].p, r[i - 1].p); return s; };
  assert.ok(len('C5') < 40 && len('T6') > 30 && len('L3') > 100 && len('S2') > 170, `root lengths ${[len('C5'), len('T6'), len('L3'), len('S2')].map(Math.round)}`);
  assert.deepEqual(W.rootCourse('L4').at(-1).p, W.rootExitAt('L4').p);
  assert.deepEqual(W.rootCourse('L4', 'left').at(-1).p, W.rootExitAt('L4', 'left').p);
});

test('the left side is the mirror of the right', () => {
  assert.deepEqual(W.mirrorPoint([-12.5, 3, 7]), [12.5, 3, 7]);
  assert.deepEqual(W.mirrorPoint([0, 3, 7]), [0, 3, 7]);
  const arm = new Set(ARM_SEGMENTS);
  for (const t of TRUNKS) {
    const m = W.mirrorTrunk(t.id);
    // the left twin: its own id (`l_...`), its parent's twin, the same levels, every point mirrored
    assert.equal(m.id, `l_${t.id.slice(2)}`); assert.equal(m.side, 'left'); assert.equal(m.course.length, t.course.length);
    assert.equal(m.parent, t.parent ? `l_${t.parent.slice(2)}` : null); assert.deepEqual([...m.roots], [...t.roots]); assert.equal(m.origin, t.origin); assert.equal(m.from, t.from);
    assert.equal(W.mirrorTrunk(t.id), m, 'the twin is made once'); assert.equal(W.trunkById(m.id), m); assert.equal(W.mirrorTrunk(m.id), t, 'the twin of the twin is the trunk itself');
    assert.ok(Object.isFrozen(m) && Object.isFrozen(m.course[0].p));
    m.course.forEach((q, i) => {
      const r = t.course[i];
      assert.deepEqual([...q.p], [r.p[0] === 0 ? 0 : -r.p[0], r.p[1], r.p[2]], `${t.id}[${i}]`);
      // the mirrored point's segment is `l_...` where the right one is `r_...`, and it exists: in the body rig, or (the
      // left forearm and hand, which the body rig does not have) in the game arm under the name armSeg
      assert.equal(q.seg, /^r_/.test(r.seg) ? `l_${r.seg.slice(2)}` : r.seg, `${t.id}[${i}]`);
      if (q.rig === 'arm') { assert.ok(arm.has(q.armSeg), `${t.id}[${i}]: "${q.armSeg}" is not a segment of the game arm`); assert.ok(/^l_(upperarm|forearm|radius|hand|thumb|index|middle|ring|little)/.test(q.seg), `${t.id}[${i}]`); }
      else { assert.equal(q.rig, 'body'); assert.ok(RIG.segments[q.seg] && q.seg !== 'l_upperarm', `${t.id}[${i}]: "${q.seg}" is not a segment of the body rig`); }
    });
    assert.deepEqual(W.trunkChain(m.id), W.trunkChain(t.id).map(W.mirrorId));
  }
  assert.equal(W.mirrorTrunk('nope'), null); assert.equal(W.mirrorTrunk('l_nope'), null); assert.equal(W.trunkById('nope'), null); assert.equal(W.mirrorTrunk(null), null);
  assert.equal(W.mirrorId('r_femoral'), 'l_femoral'); assert.equal(W.mirrorId('l_femoral'), 'r_femoral'); assert.equal(W.mirrorId('skull'), 'skull');
  // every right-side segment of the body rig has a twin: a body segment `l_...`, or a segment of the game arm
  for (const seg of RIG.segmentOrder.filter(s => /^r_/.test(s))) { const m = W.mirrorSegment(seg); assert.equal(m.seg, `l_${seg.slice(2)}`); assert.ok(m.rig === 'arm' ? arm.has(m.armSeg) : RIG.segments[m.seg], `${seg} has no left twin`); }
  assert.deepEqual(W.mirrorSegment('r_thigh'), { seg: 'l_thigh', rig: 'body' });
  assert.deepEqual(W.mirrorSegment('r_forearm'), { seg: 'l_forearm', rig: 'arm', armSeg: 'ulna' });
  assert.deepEqual(W.mirrorSegment('r_radius'), { seg: 'l_radius', rig: 'arm', armSeg: 'forearm' });
  assert.deepEqual(W.mirrorSegment('r_upperarm'), { seg: 'l_upperarm', rig: 'arm', armSeg: 'upperarm' });
  assert.deepEqual(W.mirrorSegment('skull'), { seg: 'skull', rig: 'body' });
  // the atlas itself is mirror-symmetric where it has both sides, so the mirrored courses fit the left limbs: the left
  // hip, knee and ankle joints lie within 6 mm of the mirrored right ones
  for (const j of ['hip', 'knee', 'ankle']) assert.ok(dist(W.mirrorPoint(pivot(`r_${j}`)), pivot(`l_${j}`)) < 6, j);
  // a left muscle and its right twin: the same nerve, their points mirror images within the atlas's own asymmetry
  for (const m of RIG.muscles.filter(x => x.side === 'left' && /M$/.test(x.id))) {
    const l = W.MUSCLE_NERVE_BY_ID[m.id], r = W.MUSCLE_NERVE_BY_ID[m.id.slice(0, -1)];
    if (!r) continue;
    assert.equal(l.trunk, W.mirrorId(r.trunk), m.id); assert.equal(l.main, r.main, m.id);
    assert.ok(dist(W.mirrorPoint(l.end.p), r.end.p) < 30, `${m.id}: ${Math.round(dist(W.mirrorPoint(l.end.p), r.end.p))} mm from its twin's mirror`);
  }
  // the whole way to a muscle, on either side
  const R = W.nervePathForMuscle('FJ1439'), L = W.nervePathForMuscle('FJ1439M'); // tibialis anterior
  assert.equal(R.level, 'L4'); assert.equal(R.origin, 'cord'); assert.equal(R.side, 'right'); assert.equal(L.side, 'left');
  assert.deepEqual(R.points[0].p, W.rootExitAt('L4').p);
  assert.deepEqual(L.points[0].p, W.rootExitAt('L4', 'left').p);
  assert.deepEqual([...new Set(R.points.map(q => q.trunk).filter(Boolean))], ['r_sacral_plexus', 'r_sciatic', 'r_common_fibular', 'r_deep_fibular']);
  assert.deepEqual([...new Set(L.points.map(q => q.trunk).filter(Boolean))], ['l_sacral_plexus', 'l_sciatic', 'l_common_fibular', 'l_deep_fibular']);
  assert.equal(R.trunk, 'r_deep_fibular'); assert.equal(L.trunk, 'l_deep_fibular');
  assert.equal(R.points.at(-1).muscle, 'FJ1439');
  assert.ok(L.points.slice(0, -1).every((q, i) => dist(q.p, W.mirrorPoint(R.points[i].p)) < 1e-9));
  // a muscle of the left game arm (a mesh the body rig does not hold): its right twin's way, mirrored, on the game
  // arm's segments beyond the shoulder
  assert.ok(!RIG.muscles.some(m => m.id === 'FJ1478M'));
  const A = W.nervePathForMuscle('FJ1478M'), B = W.nervePathForMuscle('FJ1478'); // the long head of biceps brachii
  assert.equal(A.side, 'left'); assert.equal(A.mirroredFrom, 'FJ1478'); assert.equal(A.trunk, 'l_musculocutaneous'); assert.equal(A.level, 'C6');
  assert.equal(A.points.length, B.points.length);
  A.points.forEach((q, i) => { assert.ok(dist(q.p, W.mirrorPoint(B.points[i].p)) < 1e-9); assert.ok(q.rig === 'arm' ? arm.has(q.armSeg) : RIG.segments[q.seg], `${i}: ${q.seg}`); });
  assert.equal(A.points.at(-1).rig, 'arm'); assert.equal(A.points.at(-1).seg, 'l_upperarm'); assert.equal(A.points.at(-1).armSeg, 'upperarm'); assert.equal(A.points.at(-1).muscle, 'FJ1478M');
  assert.deepEqual(A.points[0].p, W.rootExitAt('C6', 'left').p);
  assert.equal(W.nervePathForMuscle('FJ9999M'), null);
  assert.equal(W.nervePathForMuscle('nope'), null);
  for (const a of BRAIN.filter(x => x.groups.includes('left_upper_limb_muscle'))) assert.ok(W.nervePathForMuscle(a.element_id), `no way to the left arm mesh ${a.element_id}`);
  for (const m of RIG.muscles) {
    const p = W.nervePathForMuscle(m.id);
    assert.ok(p && p.points.length >= 2, m.id);
    for (let i = 1; i < p.points.length; i++) assert.ok(dist(p.points[i].p, p.points[i - 1].p) < 190, `${m.id}: a jump of ${Math.round(dist(p.points[i].p, p.points[i - 1].p))} mm on its way`);
    if (p.origin === 'cord') assert.ok(W.CORD_LEVELS.includes(p.level), m.id); else assert.ok(p.points[0].seg === 'skull', m.id);
    // nothing on the way crosses to the other side of the body
    const sign = m.side === 'left' ? 1 : -1;
    for (const q of p.points) assert.ok(q.p[0] * sign > -14, `${m.id}: its way crosses the midline (x = ${q.p[0]})`);
  }
});

test('the brain\'s links join meshes that exist, first the motor and sensory strips', () => {
  const brain = new Map(BRAIN.filter(a => a.groups.includes('brain')).map(a => [a.element_id, a]));
  assert.equal(brain.size, 59);
  assert.ok(W.BRAIN_LINKS.length >= 30 && W.BRAIN_LINKS.length <= 60, `${W.BRAIN_LINKS.length} links`);
  const halfOf = id => { const a = brain.get(id), mid = (a.bounds_min[0] + a.bounds_max[0]) / 2; return mid > 0 ? 'left' : 'right'; };
  for (const [region, [l, r]] of Object.entries(W.BRAIN_REGIONS)) {
    assert.ok(brain.has(l) && brain.has(r), region);
    assert.equal(halfOf(l), 'left', region); assert.equal(halfOf(r), 'right', region);
    assert.equal(brain.get(l).embedded_source_name, W.BRAIN_MESH_NAMES[l], l); assert.equal(brain.get(r).embedded_source_name, W.BRAIN_MESH_NAMES[r], r);
    // the two halves of one region carry the same name but for the side
    assert.equal(W.BRAIN_MESH_NAMES[l].replace(/\bleft\b|\bLeft\b/, 'X'), W.BRAIN_MESH_NAMES[r].replace(/\bright\b|\bRight\b/, 'X'), region);
  }
  const seen = new Set();
  for (const k of W.BRAIN_LINKS) {
    const what = `${k.name} (${k.from} -> ${k.to})`;
    for (const id of [k.from, k.to, ...(k.via || [])]) assert.ok(brain.has(id), `${what}: ${id} is not a brain mesh`);
    assert.ok(k.name.length > 5 && k.plain.length > 15, what);
    assert.equal(typeof k.crosses, 'boolean', what);
    assert.equal(k.crosses, halfOf(k.from) !== halfOf(k.to), `${what}: "crosses" does not say whether its ends are in different halves`);
    assert.ok(k.from !== k.to, what);
    for (const s of k.src) assert.ok(W.WIRING_SOURCES[s], `${what}: unknown source ${s}`);
    assert.ok(k.src.length >= 1, what);
    assert.ok(['short', 'long', 'callosal', 'down', 'up'].includes(k.kind), what);
    const key = `${k.from}>${k.to}>${k.name}`; assert.ok(!seen.has(key), `${what} is listed twice`); seen.add(key);
    // a link between the same regions of the two halves has no mesh to pass through (the atlas has no corpus callosum)
    if (k.kind === 'callosal') { assert.equal(k.drawnAs, 'arc', what); assert.ok(k.crosses && /no corpus callosum mesh/.test(k.note), what); assert.equal(W.BRAIN_MESH_NAMES[k.from].replace('Left', ''), W.BRAIN_MESH_NAMES[k.to].replace('Right', ''), what); }
  }
  const has = (from, to, extra = () => true) => W.BRAIN_LINKS.some(k => k.from === from && k.to === to && extra(k));
  const [preL, preR] = W.BRAIN_REGIONS.precentral, [postL, postR] = W.BRAIN_REGIONS.postcentral;
  // the motor strip and the sensory strip: to each other, to the frontal gyri in front, to the parietal lobules behind,
  // to the other half, down through the internal capsule, and to the opposite half of the cerebellum by way of the pons
  for (const [pre, post, h] of [[preL, postL, 0], [preR, postR, 1]]) {
    const R = n => W.BRAIN_REGIONS[n][h], O = n => W.BRAIN_REGIONS[n][1 - h];
    assert.ok(has(pre, post), 'motor strip to sensory strip');
    assert.ok(has(R('superior_frontal'), pre) && has(R('middle_frontal'), pre), 'frontal gyri to the motor strip');
    assert.ok(has(post, R('superior_parietal')) && has(post, R('supramarginal')), 'sensory strip to the parietal lobules');
    assert.ok(has(pre, R('medulla'), k => k.via.includes(R('internal_capsule')) && k.via.includes(R('pons')) && !k.crosses), 'down through the internal capsule');
    assert.ok(has(pre, O('cerebellum'), k => k.via.includes(R('pons')) && k.crosses), 'to the opposite half of the cerebellum by way of the pons');
    assert.ok(has(O('cerebellum'), pre, k => k.crosses), 'back from the opposite half of the cerebellum');
    assert.ok(has(R('medulla'), post, k => k.via.includes(R('internal_capsule'))), 'the report up to the sensory strip');
  }
  assert.ok(has(preL, preR, k => k.drawnAs === 'arc') && has(postL, postR, k => k.drawnAs === 'arc'), 'the strips of the two halves');
  // the named long bundles
  for (const n of ['arcuate fasciculus', 'cingulum', 'uncinate fasciculus', 'inferior longitudinal fasciculus', 'superior longitudinal fasciculus', 'fornix'])
    assert.equal(W.BRAIN_LINKS.filter(k => k.name.startsWith(n)).length >= 2, true, n);
  // the motor and sensory strips come first in the table
  assert.ok([W.BRAIN_LINKS[0].from, W.BRAIN_LINKS[0].to].includes(preL));
  // the two textbook routes added after the check: the corticobulbar route (the motor strip's face part to the motor
  // nuclei in the pons and medulla: one link on its own side, one crossing), and pain and temperature (crossed in the
  // cord, up the same way as touch)
  for (const h of [0, 1]) {
    const R = n => W.BRAIN_REGIONS[n][h], O = n => W.BRAIN_REGIONS[n][1 - h];
    const cb = W.BRAIN_LINKS.filter(k => k.name.startsWith('corticobulbar') && k.from === R('precentral'));
    assert.equal(cb.length, 2, 'the corticobulbar route');
    // its own side to the medulla; across to the OPPOSITE PONS, where the face's nerve centre lies (the lower face is
    // driven from the opposite half only)
    assert.ok(cb.some(k => !k.crosses && k.to === R('medulla')) && cb.some(k => k.crosses && k.to === O('pons')));
    for (const k of cb) assert.ok(k.via.includes(R('internal_capsule')) && k.via.includes(R('midbrain')), k.name);
    assert.ok(cb.some(k => /lower face/.test(k.note)), 'the lower face from the opposite side only');
    const st = W.BRAIN_LINKS.find(k => k.name.startsWith('spinothalamic') && k.from === R('medulla'));
    assert.ok(st && st.to === R('postcentral') && st.via.includes(R('internal_capsule')) && st.crossing.in === 'cord' && st.crossing.when === 'before the start');
  }
  // where the fibres change sides is data: the motor route at the bottom of the medulla, the touch route inside it
  const cs = W.BRAIN_LINKS.find(k => k.name.startsWith('corticospinal') && k.from === preL);
  assert.equal(cs.crossing.when, 'at the end'); assert.equal(cs.crossing.in, 'medulla'); assert.deepEqual([...cs.crossesAt], [W.BRAIN_REGIONS.medulla[0], W.BRAIN_REGIONS.medulla[1]]);
  const ml = W.BRAIN_LINKS.find(k => k.name.startsWith('medial lemniscus') && k.from === W.BRAIN_REGIONS.medulla[0]);
  assert.ok(ml.crosses && ml.to === W.BRAIN_REGIONS.postcentral[1] && ml.crossing.when === 'on the way');
  assert.deepEqual([...ml.crossesAt], [W.BRAIN_REGIONS.medulla[0], W.BRAIN_REGIONS.medulla[1]]);
  for (const k of W.BRAIN_LINKS.filter(x => x.crossing)) {
    assert.ok(['on the way', 'at the end', 'before the start'].includes(k.crossing.when) && k.crossing.plain.length > 15, k.name);
    if (k.crossesAt) { assert.equal(k.crossesAt.length, 2); for (const id of k.crossesAt) assert.ok(brain.has(id), k.name); assert.notEqual(halfOf(k.crossesAt[0]), halfOf(k.crossesAt[1]), k.name); }
    if (k.crossing.when === 'on the way') assert.ok(k.crosses, `${k.name}: crosses on the way, so its ends are in different halves`);
  }
  for (const k of W.BRAIN_LINKS.filter(x => x.crosses)) assert.ok(k.crossing, `${k.name}: crosses, but does not say where`);
  // speech is made on the left in most people: no link of the right half speaks of speech
  for (const k of W.BRAIN_LINKS.filter(x => x.half === 'right')) assert.ok(!/speech/i.test(`${k.name} ${k.plain}`), `${k.name}: speech in the right half`);
  assert.ok(W.BRAIN_LINKS.some(k => k.half === 'left' && /speech/.test(k.plain)));
});

test('honesty and tidiness: plain words, no claim of measurement, no private strings', () => {
  for (const f of ['scene/src/ns-wiring-data.mjs', 'tools/build-wiring-courses.mjs', 'tools/wiring-geometry.mjs', 'tests/wiring-data.test.mjs']) {
    const text = read(f);
    for (const re of [/\/home\/[a-z]/, /\/tmp\//, /[A-Za-z0-9._-]+@(?!users\.noreply)[a-z0-9-]+\.[a-z]{2,}/, /session[_ ]?id/i, new RegExp(['cl' + 'aude', 'anthro' + 'pic', 'open' + 'ai', 'chat' + 'gpt'].join('|'), 'i')])
      assert.ok(!re.test(text), `${f} holds a private or vendor string (${re})`);
  }
  // the data says what it is and what it is not, in plain sentences a view can show: typical, simplified, not traced,
  // bodies vary; the main level is this game's pick; the brain's links are tied to the nearest part it has
  const note = Object.values(W.WIRING_NOTE).join(' ');
  assert.match(note, /Typical/); assert.match(note, /Simplified/i); assert.match(note, /Not traced from a scan/); assert.match(note, /real bodies vary/);
  assert.match(W.WIRING_NOTE.mainLevel, /this game's pick/); assert.match(W.WIRING_NOTE.brain, /nearest part/); assert.match(W.WIRING_NOTE.brain, /no thalamus/);
  for (const s of note.split(/(?<=\.)\s+/)) assert.ok(s.split(/\s+/).length <= 32, `a long sentence: "${s}"`);
  assert.match(W.WIRING_FRAME, /BODY-RIG\.json/);
  for (const t of [note, ...TRUNKS.map(x => `${x.plain} ${x.rule} ${x.note}`), ...W.BRAIN_LINKS.map(k => `${k.plain} ${k.note || ''}`)])
    assert.ok(!/\b(recorded|validated|real signal|measured in (a|the|this) (person|patient|subject))\b/i.test(t), `a claim the data cannot make: "${t.slice(0, 80)}"`);
  // a plain name for every nerve: no anatomical jargon without its everyday phrase (short, lower-case start)
  for (const t of TRUNKS) { assert.ok(t.plain.length <= 130, `${t.id}: a long plain name`); assert.match(t.plain, /^[a-z"]/, t.id); }
  // pure data: the module imports nothing and touches neither the page nor three.js
  const src = read('scene/src/ns-wiring-data.mjs');
  assert.ok(!/^\s*import\s/m.test(src), 'ns-wiring-data imports a module');
  assert.ok(!/\b(document|window|THREE)\b\s*[.(]/.test(src), 'ns-wiring-data touches the page or three.js');
  // frozen: nothing here can be changed by the view that reads it
  assert.ok(Object.isFrozen(W.NERVE_TRUNKS) && Object.isFrozen(W.NERVE_TRUNKS.r_radial.course) && Object.isFrozen(W.NERVE_TRUNKS.r_radial.course[0].p));
  assert.ok(Object.isFrozen(W.MUSCLE_NERVE) && Object.isFrozen(W.MUSCLE_ROWS[0].roots) && Object.isFrozen(W.BRAIN_LINKS[0]));
  // the generated block too (a write to it once moved the cord's points): every array and object in it
  const deep = (o, path) => { if (o && typeof o === 'object') { assert.ok(Object.isFrozen(o), `${path} is not frozen`); for (const [k, v] of Object.entries(o)) deep(v, `${path}.${k}`); } };
  deep(W.WIRING_GENERATED, 'WIRING_GENERATED');
  const before = W.cordLevelAt('C5').p.slice();
  assert.throws(() => { 'use strict'; W.WIRING_GENERATED.canal[3][1] = 48; }, TypeError);
  assert.deepEqual(W.cordLevelAt('C5').p, before);
  // the block says under which licence its points are (the rest of the module is project code, CC0)
  assert.match(src.slice(src.indexOf('// BEGIN GENERATED COURSES'), src.indexOf('export const WIRING_GENERATED')), /CC BY 4\.0[\s\S]*Z-Anatomy[\s\S]*CC BY-SA 4\.0/);
  // unknown keys give nothing, never an error ('constructor' and '__proto__' are keys every object answers to)
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'nope', '', 'C9', 'r_', 'l_constructor']) {
    assert.equal(W.mirrorTrunk(k), null, k); assert.equal(W.trunkById(k), null, k); assert.deepEqual(W.trunkPath(k), [], k); assert.deepEqual(W.trunkChain(k), [], k);
    assert.deepEqual(W.trunkRootLines(k), [], k); assert.deepEqual(W.rootWay(k, 'C5'), [], k); assert.equal(W.rootExitAt(k), null, k); assert.deepEqual(W.rootCourse(k), [], k);
    assert.equal(W.cordLevelAt(k), null, k); assert.equal(W.nerveForMuscle(k), null, k); assert.equal(W.nervePathForMuscle(k), null, k); assert.deepEqual(W.musclesOfTrunk(k), [], k);
    assert.deepEqual(W.rootWay('r_femoral', k), [], k);
  }
  for (const k of ['transverse', 'abdominal', 'left', 'muscle', 'head of']) assert.equal(W.nerveForMuscle(k), null, `"${k}" alone names no muscle`);
  // a name shared by two meshes with two nerves (the bellies of digastric): each end names its own nerve, and its `at`
  // is a point of that nerve
  for (const [name, r] of Object.entries(W.MUSCLE_NERVE)) for (const e of r.ends) {
    const t = W.trunkById(e.trunk);
    assert.ok(t && Number.isInteger(e.at) && e.at >= 0 && e.at < t.course.length, `${name} / ${e.id}: at ${e.at} on ${e.trunk}`);
    assert.equal(e.trunk, W.MUSCLE_NERVE_BY_ID[e.id].trunk, `${name} / ${e.id}`);
  }
  assert.deepEqual(new Set(W.MUSCLE_NERVE['right digastric'].ends.map(e => e.trunk)), new Set(['r_mylohyoid_nerve', 'r_facial']));
  const stats = W.wiringStats();
  assert.equal(stats.rigMuscles, 292); assert.equal(stats.trunks, TRUNKS.length); assert.equal(stats.brainLinks, W.BRAIN_LINKS.length);
});

// The full check on the real meshes: the tool prepares the body exactly as the page does (about 7 s on a free
// processor), lays every course again and measures every point; the committed block must equal that fresh build, and no
// point may be outside the body. NS_WIRING_FAST=1 skips it (the frozen results of the last build are checked above in
// any case).
test('the generated block equals a fresh build over the prepared body (the real meshes)', { skip: process.env.NS_WIRING_FAST === '1' }, () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-wiring-courses.mjs'), '--check'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  assert.match(out, /the committed block equals a fresh build/);
  assert.match(out, /still outside the body: 0/);
  assert.match(out, /muscle points: 292, .*outside the body: 0/);
});
