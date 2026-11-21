/** NeuroSurge: a STAND-IN for the data of the drawn nerves (21 November 2026, section 192).
 *
 * WHAT THIS IS. The electrical map (ns-emap.mjs) draws typical nerve routes over an atlas that has no spinal cord and
 * no nerves. The courses of the nerves, the level of each nerve and the nerve of each muscle are the work of another
 * package (section 193, module `ns-wiring-data.mjs`), written at the same time. Until that module is in this branch the
 * map is built from the small table below, IN THE SAME SHAPES (the data contract of sections 192 and 193), so the
 * change to the real data is one line in ns-app (which wiring object is handed to buildEmap) and nothing in the map.
 *
 * WHAT IT IS NOT. It is not anatomy teaching. It has one run per body part, laid straight along the rig's joint
 * centres: one for each arm (the cords of the arm's nerve network as one line), two for each leg (front of the thigh,
 * and the back of the leg down to the sole), one per rib level, one for the side of the neck, and four head nerves.
 * A muscle the name rules below do not name takes the nearest run on its own side (ns-emap's own fallback). Nothing
 * here is traced from a scan or measured; every point is a stated share of the way between two joint centres of
 * packs/BODY-RIG.json, moved by a stated offset.
 *
 * Contract (pure data and pure functions):
 *   NERVE_TRUNKS { [id]: { id, name, plain, roots: ['C5', ...], parent: id | null, origin?: 'midbrain' | 'pons' |
 *                          'medulla', course: [{ seg, p: [x, y, z] }, ...] } }  right side and midline, rest pose,
 *                          millimetres of the body atlas as the rig has it, ordered from the cord (or the brainstem) outward
 *   MUSCLE_NERVE { [muscle name]: { trunk, roots, main } },  nerveForMuscle(name) -> { trunk, roots, main } | null
 *   mirrorTrunk(id) -> the left side's trunk (an object of the same shape), mirrorPoint(p) -> [-x, y, z]
 *   CORD_LEVELS ['C1' ... 'S4'],  cordLevelAt(level) -> { fromPivot, toPivot, t }
 *   BRAIN_LINKS [{ from, to, name, plain, crosses, via? }]  (ids of brain meshes of inputs/MESH-MANIFEST.json)
 *
 * Pure: no three.js, no DOM, no imports.
 */

const freeze = Object.freeze;

/** The cord's segments, top to bottom (the contract's CORD_LEVELS). */
export const STANDIN_CORD_LEVELS = freeze(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10',
  'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'S2', 'S3', 'S4']);

/** Where a cord segment lies along the column, as a count of joints down from the skull (0 = the joint between the
 * skull and the first neck vertebra; 7 = between the last neck vertebra and the first chest vertebra; 19 = between the
 * last chest vertebra and the first lumbar one; 20 = between the first and second lumbar vertebrae). The taught rule
 * in round numbers: the cord is shorter than the column and ends at about the first or second lumbar vertebra, so
 * its lower segments lie well above the vertebrae of the same name and their roots run down inside the column.
 * Straight lines between these anchors. A stand-in (see the file's head). */
export const STANDIN_CORD_AT = freeze([['C1', 0.4], ['C8', 6.6], ['T6', 11.2], ['T12', 16.4], ['L1', 17.0], ['L5', 18.6], ['S1', 18.9], ['S4', 19.7]]);

/** The joints of the column from the skull down, by their names in the rig (packs/BODY-RIG.json `pivots`). */
export const STANDIN_COLUMN = freeze(['atlanto_occipital', null, null, null, null, null, null, 'cervicothoracic', 't1_t2', 't2_t3', 't3_t4', 't4_t5', 't5_t6',
  't6_t7', 't7_t8', 't8_t9', 't9_t10', 't10_t11', 't11_t12', 'thoracolumbar', 'l1_l2', 'l2_l3', 'l3_l4', 'l4_l5', 'lumbosacral']);

/** The brain's typical links for the motor strip, per half (the contract's BRAIN_LINKS; ids of inputs/MESH-MANIFEST.json):
 * the strip to the sensory strip behind it, to the same strip of the other half, to the two frontal gyri in front of
 * it, and to the cerebellum's other half by way of the internal capsule and the pons. Four well-known links only; the
 * real table (section 193) has more. */
export const STANDIN_BRAIN_LINKS = freeze([
  freeze({ from: 'FJ1800', to: 'FJ1797', name: 'short fibres between the precentral and postcentral gyri (left)', plain: 'the movement strip and the feeling strip behind it', crosses: false }),
  freeze({ from: 'FJ1801', to: 'FJ1798', name: 'short fibres between the precentral and postcentral gyri (right)', plain: 'the movement strip and the feeling strip behind it', crosses: false }),
  freeze({ from: 'FJ1800', to: 'FJ1801', name: 'callosal fibres of the precentral gyri', plain: 'the same spot in the other half of the brain', crosses: true }),
  freeze({ from: 'FJ1800', to: 'FJ1833', name: 'fibres to the superior frontal gyrus (left)', plain: 'the planning areas in front', crosses: false }),
  freeze({ from: 'FJ1801', to: 'FJ1834', name: 'fibres to the superior frontal gyrus (right)', plain: 'the planning areas in front', crosses: false }),
  freeze({ from: 'FJ1800', to: 'FJ1787', name: 'fibres to the middle frontal gyrus (left)', plain: 'the planning areas in front', crosses: false }),
  freeze({ from: 'FJ1801', to: 'FJ1788', name: 'fibres to the middle frontal gyrus (right)', plain: 'the planning areas in front', crosses: false }),
  freeze({ from: 'FJ1800', to: 'FJ1830', name: 'cortico-ponto-cerebellar fibres (left cortex, right cerebellum)', plain: 'the little brain at the back, on the other side', crosses: true, via: freeze(['FJ1750', 'FJ1775']) }),
  freeze({ from: 'FJ1801', to: 'FJ1781', name: 'cortico-ponto-cerebellar fibres (right cortex, left cerebellum)', plain: 'the little brain at the back, on the other side', crosses: true, via: freeze(['FJ1751', 'FJ1822']) })
]);

/** Name rules of the stand-in (lower-case words of a muscle's name): which run serves it. Everything else: nearest run. */
const NAME_RULES = freeze([
  [/tongue|gloss|geniohyoid|thyrohyoid/, 'hypoglossal', 'XII'],
  [/masseter|temporalis|pterygoid|mylohyoid|digastric/, 'jaw', 'V'],
  [/sternocleidomastoid|trapezius/, 'accessory', 'XI'],
  [/stylohyoid|frontalis|occipitalis|temporoparietalis|corrugator|procerus|orbicularis|nasalis|septi|nasolabialis|labii|zygomaticus|anguli|risorius|mentalis|platysma|buccinator|auricular/, 'facial', 'VII']
]);

/** Build the stand-in for a rig (ns-body buildBodyRig, or the `rig` of packs/BODY-RIG.json). Returns the contract's
 * object: { NERVE_TRUNKS, MUSCLE_NERVE, nerveForMuscle, mirrorTrunk, mirrorPoint, CORD_LEVELS, cordLevelAt,
 * BRAIN_LINKS, standIn: true }. Throws ns:emap_standin when the rig lacks a joint it needs. Pure. */
export function makeStandinWiring(rig) {
  const pivots = rig && rig.pivots, segs = rig && rig.segments;
  if (!pivots || !segs) throw new Error('ns:emap_standin: the rig has no pivots or segments');
  const P = name => {
    const q = pivots[name] && pivots[name].point;
    if (!q || q.length !== 3) throw new Error(`ns:emap_standin: the rig has no joint centre "${name}"`);
    return [q[0], q[1], q[2]];
  };
  const C = name => {
    const q = segs[name] && segs[name].restCentroid;
    if (!q || q.length !== 3) throw new Error(`ns:emap_standin: the rig has no segment "${name}"`);
    return [q[0], q[1], q[2]];
  };
  const mix = (a, b, t, off = [0, 0, 0]) => [a[0] + (b[0] - a[0]) * t + off[0], a[1] + (b[1] - a[1]) * t + off[1], a[2] + (b[2] - a[2]) * t + off[2]];
  const at = (seg, p) => freeze({ seg, p: freeze(p.map(v => Math.round(v * 10) / 10)) });
  const ct = P('cervicothoracic'), gh = P('r_glenohumeral'), el = P('r_elbow'), wr = P('r_wrist'), mcp = P('r_middle_mcp');
  const ls = P('lumbosacral'), hip = P('r_hip'), kn = P('r_knee'), an = P('r_ankle'), mtp = P('r_mtp');
  const T = {};
  const trunk = (id, name, plain, roots, course, extra = {}) => { T[id] = freeze({ id, name, plain, roots: freeze(roots), parent: null, ...extra, course: freeze(course) }); };
  // The arm: from beside the lowest neck vertebrae, under the collar bone, through the armpit, down the inner side of
  // the upper arm, across the front of the elbow, down the middle of the forearm to the palm.
  trunk('r_arm', 'the nerves of the right arm (stand-in: one run)', 'the nerves of the right arm', ['C5', 'C6', 'C7', 'C8', 'T1'], [
    at('thorax', mix(ct, gh, 0.2, [0, 6, 4])), at('r_girdle', mix(ct, gh, 0.62, [0, -8, -14])), at('r_girdle', mix(gh, el, 0.1, [22, -6, -6])),
    at('r_upperarm', mix(gh, el, 0.5, [16, -8, 0])), at('r_forearm', mix(gh, el, 0.98, [8, -16, 0])), at('r_radius', mix(el, wr, 0.5, [4, -8, 0])),
    at('r_hand', mix(el, wr, 1, [2, -8, 0])), at('r_hand', mix(wr, mcp, 0.65, [0, -6, 0]))
  ]);
  // The back of the leg: out of the pelvis behind the hip joint, down the back of the thigh, behind the knee, down the
  // calf, behind the inner ankle to the sole.
  trunk('r_leg_back', 'the nerves of the back of the right leg (stand-in: one run)', 'the big nerve down the back of the right leg', ['L4', 'L5', 'S1', 'S2', 'S3'], [
    at('pelvis', mix(ls, hip, 0.45, [0, 34, -8])), at('pelvis', mix(ls, hip, 1, [4, 36, -18])), at('r_thigh', mix(hip, kn, 0.5, [0, 30, 0])),
    at('r_shank', mix(hip, kn, 1, [0, 30, -10])), at('r_shank', mix(kn, an, 0.5, [0, 28, 0])), at('r_foot', mix(kn, an, 1, [10, 18, 4])),
    at('r_foot', mix(an, mtp, 0.7, [0, 0, -14]))
  ]);
  // The front of the thigh: out of the pelvis in front of the hip joint, down the front of the thigh.
  trunk('r_leg_front', 'the nerves of the front of the right thigh (stand-in: one run)', 'the main nerve of the front of the right thigh', ['L2', 'L3', 'L4'], [
    at('pelvis', mix(ls, hip, 0.5, [-10, -28, 0])), at('pelvis', mix(ls, hip, 1, [6, -42, 6])), at('r_thigh', mix(hip, kn, 0.42, [4, -46, 0])),
    at('r_thigh', mix(hip, kn, 0.8, [8, -40, 0]))
  ]);
  // The rib levels: from beside the vertebra round the rib toward the front.
  const ribs = [['T1', 'thorax', 'r_rib1', 'r_cc1'], ['T2', 't2', 'r_rib2', 'r_cc2'], ['T3', 't3', 'r_rib3', 'r_cc3'], ['T4', 't4', 'r_rib4', 'r_cc4'], ['T5', 't5', 'r_rib5', 'r_cc5'],
    ['T6', 't6', 'r_rib6', 'r_cc6'], ['T7', 't7', 'r_rib7', 'r_cc7'], ['T8', 't8', 'r_rib8', null], ['T9', 't9', 'r_rib9', null], ['T10', 't10', 'r_rib10', null]];
  for (const [lv, vert, rib, cc] of ribs) {
    const v = C(vert), r = C(rib);
    const course = [at(vert, [v[0] - 22, v[1] + 6, v[2]]), at(rib, [r[0] - 30, r[1], r[2] - 6])];
    if (cc) course.push(at(cc, C(cc))); else { const c7 = C('r_cc7'); course.push(at('r_cc7', [c7[0] - 10, c7[1] + 10, r[2] - 60])); }
    trunk(`r_rib_${lv.toLowerCase()}`, `the nerve of the right rib level ${lv} (stand-in)`, 'a nerve that runs round the chest between two ribs', [lv], course);
  }
  // The belly wall and the loin: two runs from the lowest chest levels and the first lumbar level, round the flank.
  {
    const t12 = C('t12'), pel = C('pelvis'), c7 = C('r_cc7');
    trunk('r_flank_t11', 'the nerve of the right flank, level T11 (stand-in)', 'a nerve that runs round the belly wall', ['T11'], [
      at('t12', [t12[0] - 24, t12[1] + 4, t12[2] + 26]), at('t12', [t12[0] - 105, t12[1] - 40, t12[2] - 10]), at('r_cc7', [c7[0] + 8, c7[1] - 14, t12[2] - 30])]);
    trunk('r_flank_l1', 'the nerve of the right flank, level L1 (stand-in)', 'a nerve that runs round the loin to the lower belly', ['T12', 'L1'], [
      at('l1', [t12[0] - 26, t12[1] + 2, t12[2] - 32]), at('pelvis', [pel[0] - 115, pel[1] - 30, pel[2] + 110]), at('pelvis', [pel[0] - 50, pel[1] - 130, pel[2] + 90])]);
  }
  // The side of the neck.
  {
    const cv = C('cervical');
    trunk('r_neck', 'the nerves of the right side of the neck (stand-in: one run)', 'the nerves of the neck muscles', ['C1', 'C2', 'C3', 'C4'], [
      at('cervical', [cv[0] - 20, cv[1] + 6, cv[2] + 22]), at('cervical', [cv[0] - 44, cv[1] + 8, cv[2] - 8]), at('cervical', [cv[0] - 40, cv[1] - 18, cv[2] - 40])]);
  }
  // Four head nerves, each from its place in the brainstem (`origin`) to a point of the head it serves. The skull's
  // openings are not in the atlas; the first point of each is a stated place under the skull's base.
  {
    const sk = C('skull'), mn = C('mandible'), hy = C('hyoid'), cv = C('cervical');
    trunk('r_facial', 'the right facial nerve, cranial nerve VII (stand-in)', 'the nerve of the face muscles', [], [
      at('skull', [sk[0] - 50, sk[1] + 32, sk[2] - 40]), at('skull', [sk[0] - 56, sk[1] + 6, sk[2] - 38]), at('skull', [sk[0] - 42, sk[1] - 30, sk[2] - 44])], { origin: 'pons' });
    trunk('r_jaw', 'the right lower-jaw nerve, a branch of cranial nerve V (stand-in)', 'the nerve of the chewing muscles', [], [
      at('skull', [sk[0] - 26, sk[1] + 18, sk[2] - 30]), at('mandible', [mn[0] - 40, mn[1] + 14, mn[2] + 24]), at('mandible', [mn[0] - 44, mn[1] + 8, mn[2] + 6])], { origin: 'pons' });
    trunk('r_accessory', 'the right accessory nerve, cranial nerve XI (stand-in)', 'the nerve of two big neck and shoulder muscles', [], [
      at('skull', [sk[0] - 22, sk[1] + 50, sk[2] - 56]), at('cervical', [cv[0] - 40, cv[1] - 14, cv[2] + 6]), at('cervical', [cv[0] - 44, cv[1] + 24, cv[2] - 28])], { origin: 'medulla' });
    trunk('r_hypoglossal', 'the right hypoglossal nerve, cranial nerve XII (stand-in)', 'the nerve of the tongue', [], [
      at('skull', [sk[0] - 14, sk[1] + 44, sk[2] - 60]), at('hyoid', [hy[0] - 20, hy[1] + 4, hy[2] + 18]), at('hyoid', [hy[0] - 8, hy[1] - 18, hy[2] + 6])], { origin: 'medulla' });
  }
  const NERVE_TRUNKS = freeze(T);
  const mirrorPoint = p => [-p[0], p[1], p[2]];
  const mirrorName = s => (typeof s !== 'string' ? s : s.startsWith('r_') ? `l_${s.slice(2)}` : s.startsWith('l_') ? `r_${s.slice(2)}` : s);
  const mirrored = new Map();
  /** The left side's trunk for a right one (and the other way round); a trunk of the midline is itself. */
  function mirrorTrunk(id) {
    const t = NERVE_TRUNKS[id] || mirrored.get(id) || null;
    if (!t) return null;
    const mid = mirrorName(id);
    if (mid === id) return t;
    if (NERVE_TRUNKS[mid]) return NERVE_TRUNKS[mid];
    if (!mirrored.has(mid)) {
      mirrored.set(mid, freeze({ ...t, id: mid, name: t.name.replace(/\bright\b/g, 'left'), plain: t.plain.replace(/\bright\b/g, 'left'), parent: t.parent ? mirrorName(t.parent) : null,
        course: freeze(t.course.map(c => freeze({ seg: mirrorName(c.seg), p: freeze(mirrorPoint(c.p)) }))) }));
    }
    return mirrored.get(mid);
  }
  const rootsOf = id => (NERVE_TRUNKS[id] || mirrorTrunk(mirrorName(id)) || { roots: [] }).roots;
  const mainOf = roots => (roots.length ? roots[Math.floor((roots.length - 1) / 2)] : null);
  /** The stand-in's answer for a muscle's name: one of the four head runs by a word of the name, else null (ns-emap
   * then takes the nearest run on the muscle's own side). */
  function nerveForMuscle(name) {
    const n = String(name || '').toLowerCase();
    if (!n) return null;
    const left = /\bleft\b|\.l\b|-l\b/.test(n);
    for (const [re, key, main] of NAME_RULES) if (re.test(n)) { const id = `${left ? 'l' : 'r'}_${key}`; return freeze({ trunk: id, roots: rootsOf(id), main }); }
    return null;
  }
  const MUSCLE_NERVE = freeze({
    'right masseter': freeze({ trunk: 'r_jaw', roots: freeze([]), main: 'V' }),
    'right zygomaticus major': freeze({ trunk: 'r_facial', roots: freeze([]), main: 'VII' }),
    'right sternocleidomastoid': freeze({ trunk: 'r_accessory', roots: freeze([]), main: 'XI' })
  });
  const anchors = STANDIN_CORD_AT.map(([lv, u]) => [STANDIN_CORD_LEVELS.indexOf(lv), u]);
  /** { fromPivot, toPivot, t }: the cord segment `level` lies at the share t of the way from joint fromPivot (the lower
   * one) to joint toPivot (the upper one). null for an unknown level. */
  function cordLevelAt(level) {
    const i = STANDIN_CORD_LEVELS.indexOf(String(level));
    if (i < 0) return null;
    let u = anchors[anchors.length - 1][1];
    for (let k = 0; k + 1 < anchors.length; k++) if (i >= anchors[k][0] && i <= anchors[k + 1][0]) { u = anchors[k][1] + (anchors[k + 1][1] - anchors[k][1]) * (i - anchors[k][0]) / (anchors[k + 1][0] - anchors[k][0]); break; }
    // the neck is one rigid piece between the joints 0 and 7
    if (u <= 7) return freeze({ fromPivot: STANDIN_COLUMN[7], toPivot: STANDIN_COLUMN[0], t: 1 - u / 7 });
    const k = Math.min(STANDIN_COLUMN.length - 2, Math.floor(u));
    return freeze({ fromPivot: STANDIN_COLUMN[k + 1], toPivot: STANDIN_COLUMN[k], t: k + 1 - u });
  }
  return freeze({ standIn: true, NERVE_TRUNKS, MUSCLE_NERVE, nerveForMuscle, mirrorTrunk, mirrorPoint, CORD_LEVELS: STANDIN_CORD_LEVELS, cordLevelAt, BRAIN_LINKS: STANDIN_BRAIN_LINKS });
}
