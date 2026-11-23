/** NeuroSurge: the DATA of the drawn nerves (21 November 2026, package WIRING, DESIGN-DECISIONS section 193).
 *
 * Owner, 20 November: "we want a view of brain activity ... so we can actually see electrical storms and electrical
 * activity and neural activity and networks and pathways, etc., etc., throughout the entire body, from brain to body
 * and body to brain. And then we can tie that to muscle contraction." 21 November: "let's try an electrical mapping
 * view, like you see in functional neuroscience, connectomic live maps, dynamic maps."
 *
 * The atlas the game draws has muscles, bones and a brain, but no spinal cord and no nerves. The electrical map
 * (ns-emap) therefore DRAWS typical nerve routes. This module is what those routes are drawn from:
 *  - MUSCLE_ROWS / MUSCLE_NERVE / nerveForMuscle: which nerve serves each muscle the game knows, from which spinal or
 *    cranial levels, and the main one (one readable row per muscle);
 *  - NERVE_TRUNKS: each named nerve and branch, with a plain name, its levels, its parent and its COURSE over the
 *    body: ordered points { seg, p } from the cord (or the brainstem) outward, p in millimetres in the rest frame of
 *    packs/BODY-RIG.json (WIRING_FRAME), seg the rig segment the point rides when the body moves. The table holds the
 *    right side under ids `r_...`; the left side is its mirror under ids `l_...` (mirrorTrunk, trunkById, mirrorPoint);
 *  - the cord: CORD_LEVELS, cordLevelAt, rootExitAt, cordCourse, caudaCourse, rootCourse (the cord is shorter than
 *    the column: its lower segments lie well above the vertebrae their roots leave under);
 *  - the ROOTS: a nerve that starts at the cord (no parent) has, for each of its levels, the point of its own course at
 *    which that root joins it: trunk.rootJoin = { level: index } (generated: the point at, or just below, where the
 *    root comes out of the column; a plexus's lower roots join it lower down, they do not all climb to its first
 *    point). A view draws each root from the cord down the canal to its opening (rootCourse) and on to that point
 *    (rootWay gives the whole line; trunkRootLines the last stretch). trunk.rootsLeave says where they come out:
 *    'opening' (between two vertebrae, rootExitAt), or 'cord' for the accessory nerve, whose roots leave the cord's
 *    side inside the canal and join a strand that climbs into the skull;
 *  - BRAIN_LINKS: typical links between the regions the brain atlas has as meshes, with where the fibres change sides
 *    as data (crossing, crossesAt);
 *  - WIRING_SOURCES: every table and every trunk names the sources its facts were taken from.
 *
 * Honesty (WIRING_NOTE, plain sentences a view can show): typical adult anatomy as it is taught, simplified, laid by
 * rule over this one atlas body by tools/build-wiring-courses.mjs; not traced from a scan and not measured in anyone;
 * real bodies vary; the "main" level of a muscle is this game's pick where books give several; the brain's links are
 * tied to the nearest part the brain model has. Where teaching sources differ the commonly taught value is taken and
 * the row's note says so, with the other value.
 *
 * Unknown keys (a level, an id, a name the data does not have, 'constructor' or '__proto__' among them) give null or
 * an empty list, never an error. Everything exported is frozen.
 *
 * Pure, dependency-free ES module (browser and Node): no three.js, no DOM, no game state.
 */

const freeze = Object.freeze;
/** o[k] only when k is one of o's own keys (so 'constructor' or '__proto__' find nothing). */
const own = (o, k) => (typeof k === 'string' && o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

// ---------------------------------------------------------------------------------------------------------------------
// Sources (facts only, in the game's own words; nothing copied). `used` says what was taken from each.

export const WIRING_SOURCES = deepFreeze({
  MRC1976: {
    ref: 'Medical Research Council. Aids to the examination of the peripheral nervous system. Memorandum No. 45. London: Her Majesty\'s Stationery Office; 1976. Table "Nerve and main root supply of muscles", pages 60 and 61.',
    url: 'https://www.ukri.org/publications/aids-to-the-examination-of-the-peripheral-nervous-system/',
    used: 'For the limb muscles it lists: the nerve, the spinal roots, and the root printed in bold as the main one.'
  },
  OPENSTAX_AP: {
    ref: 'Betts JG, Young KA, Wise JA, Johnson E, Poe B, Kruse DH, Korol O, Johnson JE, Womble M, DeSaix P. Anatomy and Physiology 2e. Houston: OpenStax; 2022. Sections 13.2, 13.4, 14.2 and 14.3. CC BY 4.0.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/13-4-the-peripheral-nervous-system',
    used: 'The cranial nerves and what they move; where the spinal nerves leave the column; the four plexuses and their great nerves; the cord shorter than the column and the horse\'s tail; the corticospinal route and its crossing; the touch route up to the sensory strip; the cerebellum\'s input through the pons.'
  },
  ISNCSCI: {
    ref: 'American Spinal Injury Association and International Spinal Cord Society. International Standards for Neurological Classification of Spinal Cord Injury (ISNCSCI), worksheet (revised 2019): the column "Motor, key muscles".',
    url: 'https://asia-spinalinjury.org/international-standards-neurological-classification-sci-isncsci-worksheet/',
    used: 'The level each key movement is tested for (C5 elbow bending, C6 wrist lifting, C7 elbow straightening, C8 finger bending, T1 little-finger spreading, L2 hip bending, L3 knee straightening, L4 foot lifting, L5 big-toe lifting, S1 foot pointing): used as the main root where the MRC table marks two roots or none.'
  },
  WIKI_MUSCLES: {
    ref: 'Wikipedia contributors. List of skeletal muscles of the human body (the "Nerve" column). Wikipedia, read 21 November 2026. CC BY-SA 4.0.',
    url: 'https://en.wikipedia.org/wiki/List_of_skeletal_muscles_of_the_human_body',
    used: 'The nerve of each muscle of the head, neck, trunk and limbs (and the branch of the facial nerve for each face muscle), with root levels where it gives them.'
  },
  WIKI_BRACHIAL: {
    ref: 'Wikipedia contributors. Brachial plexus (table of branches). Wikipedia, read 21 November 2026. CC BY-SA 4.0.',
    url: 'https://en.wikipedia.org/wiki/Brachial_plexus',
    used: 'Each branch of the plexus: where it leaves (roots, trunks, cords), its roots (the main one in bold) and its muscles.'
  },
  WIKI_LUMBAR: {
    ref: 'Wikipedia contributors. Lumbar plexus (table of nerves). Wikipedia, read 21 November 2026. CC BY-SA 4.0.',
    url: 'https://en.wikipedia.org/wiki/Lumbar_plexus',
    used: 'The nerves of the lumbar plexus, their levels and muscles; the plexus inside psoas major; the femoral nerve between psoas and iliacus; the obturator nerve through the obturator canal.'
  },
  WIKI_SACRAL: {
    ref: 'Wikipedia contributors. Sacral plexus (table of nerves). Wikipedia, read 21 November 2026. CC BY-SA 4.0.',
    url: 'https://en.wikipedia.org/wiki/Sacral_plexus',
    used: 'The nerves of the sacral plexus, their levels and muscles; the plexus in front of piriformis; the nerves converging on the greater sciatic foramen.'
  },
  WIKI_NERVES: {
    ref: 'Wikipedia contributors. Facial nerve; Accessory nerve; Ansa cervicalis; Radial nerve; Ulnar nerve; Sciatic nerve: read 21 November 2026; Mylohyoid nerve: read 22 November 2026. Wikipedia. CC BY-SA 4.0.',
    url: 'https://en.wikipedia.org/wiki/Sciatic_nerve',
    used: 'The courses: the facial nerve through the temporal bone, out at the stylomastoid foramen and through the parotid gland into five branches; the accessory nerve\'s fibres from the top of the cord up through the foramen magnum and out at the jugular foramen; the ansa cervicalis and the separate C1 branch to thyrohyoid; the nerve to mylohyoid leaving the inferior alveolar nerve just before the opening in the jaw; the radial nerve behind the humerus and its deep branch through supinator; the ulnar nerve behind the inner knob of the elbow and beside the pisiform; the sciatic nerve under piriformis, behind adductor magnus and in front of the long head of biceps femoris, dividing at the back of the knee.'
  },
  WIKI_MYOTOME: {
    ref: 'Wikipedia contributors. Myotome (the list of the movement tested for each level). Wikipedia, read 22 November 2026. CC BY-SA 4.0.',
    url: 'https://en.wikipedia.org/wiki/Myotome',
    used: 'Which level the usual charts give for a movement where the MRC table marks no main root: elbow bending C6, shrugging the shoulder C4, turning the sole outward S1.'
  },
  WIKI_CORD: {
    ref: 'Wikipedia contributors. Spinal cord. Wikipedia, read 21 November 2026. CC BY-SA 4.0.',
    url: 'https://en.wikipedia.org/wiki/Spinal_cord',
    used: 'The cord ends near the first or second lumbar vertebra; the lumbar and sacral segments lie between the ninth thoracic and the second lumbar vertebra; the cervical swelling (C4 to T1) lies at about the same vertebrae; where each nerve leaves the column.'
  },
  WIKI_TRACTS: {
    ref: 'Wikipedia contributors. Association fiber; Superior longitudinal fasciculus; Arcuate fasciculus; Cingulum (brain); Uncinate fasciculus; Inferior fronto-occipital fasciculus; Fornix (neuroanatomy); Corpus callosum; Middle cerebellar peduncle: read 21 November 2026; Corticobulbar tract: read 22 November 2026. Wikipedia. CC BY-SA 4.0.',
    url: 'https://en.wikipedia.org/wiki/Association_fiber',
    used: 'The named bundles between regions of one half of the brain and what each joins; the three parts of the superior longitudinal bundle; which part of the corpus callosum joins which lobes (and the anterior commissure with it for the temporal lobes); the fornix from the hippocampus to the mammillary bodies of the hypothalamus; the corticobulbar tract from the motor strip through the internal capsule and the midbrain to the motor nuclei of the cranial nerves, to both sides for most of them and to the opposite side only for the lower face; the pons-to-cerebellum fibres crossing to the opposite half; the cerebellum\'s way back to the motor cortex.'
  }
});

/** The frame every point of this module is given in. */
export const WIRING_FRAME = 'the rest frame of packs/BODY-RIG.json: BodyParts3D 4.0 whole-body millimetres as the game prepares the body (the trained build, the longer limbs), +x the body\'s LEFT, +y BACK, +z UP; the right side has x < 0';

/** What these routes are, in plain words, for anyone who reads or draws them (a legend or a "more detail" text can
 * use these sentences as they are). */
export const WIRING_NOTE = deepFreeze({
  what: 'Typical adult nerve routes as they are taught: which nerve goes to which muscle, from which level of the spinal cord or brainstem, along which course.',
  limits: 'Simplified and laid by rule over this one atlas body. Not traced from a scan, not measured in anyone, and real bodies vary. A plexus is drawn as one bundle, a muscle with two nerves is drawn from its first, and a nerve ends at one point in its muscle.',
  mainLevel: 'Books give most muscles several levels of the spinal cord. The one drawn here as the "main" level is this game\'s pick: the one a standard table prints in bold where it does, otherwise a choice.',
  brain: 'The links inside the brain are well-known bundles, each tied to the nearest part this brain model has. The model has no thalamus (the relay most routes to the cortex pass through), so those routes are drawn without it.'
});

// ---------------------------------------------------------------------------------------------------------------------
// Levels

/** The cord's segments this module knows, top to bottom (S5 and the coccygeal segment move no muscle of this rig). */
export const CORD_LEVELS = freeze(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'S2', 'S3', 'S4']);
/** The cranial nerves that move muscles here (V3 = the lower-jaw branch of the trigeminal nerve). */
export const CRANIAL_LEVELS = freeze(['III', 'V3', 'VII', 'IX', 'X', 'XI', 'XII']);
/** Where each of these nerves begins (OPENSTAX_AP, WIKI_NERVES): the part of the brainstem it leaves, except the
 * accessory nerve (XI): the fibres that move sternocleidomastoid and trapezius begin in the top of the CORD (C1 to
 * about C5), climb into the skull through its great opening and leave it again through the jugular opening. */
export const CRANIAL_ORIGIN = freeze({ III: 'midbrain', V3: 'pons', VII: 'pons', IX: 'medulla', X: 'medulla', XI: 'cord', XII: 'medulla' });
const LEVEL_SET = new Set([...CORD_LEVELS, ...CRANIAL_LEVELS]);
export function isKnownLevel(level) { return LEVEL_SET.has(level); }

/**
 * The vertebral coordinate v used for everything along the spine: v = 0 at the rig's pivot `atlanto_occipital` (the top
 * of the first cervical vertebra), 7 at `cervicothoracic` (between C7 and T1), then one unit per joint down to 24 at
 * `lumbosacral` (between L5 and the sacrum). Vertebra C_k spans k-1 to k, T_k spans 7+k-1 to 7+k, L_k spans 19+k-1 to
 * 19+k. The rig has no pivot between the cervical vertebrae, so 0 to 7 is one stretch. Below 24 the coordinate runs on
 * down the sacrum (26 is about its lower end); above 0 it runs up into the skull.
 */
export const VERTEBRAL_PIVOTS = deepFreeze([
  ['atlanto_occipital', 0], ['cervicothoracic', 7], ['t1_t2', 8], ['t2_t3', 9], ['t3_t4', 10], ['t4_t5', 11], ['t5_t6', 12], ['t6_t7', 13],
  ['t7_t8', 14], ['t8_t9', 15], ['t9_t10', 16], ['t10_t11', 17], ['t11_t12', 18], ['thoracolumbar', 19], ['l1_l2', 20], ['l2_l3', 21],
  ['l3_l4', 22], ['l4_l5', 23], ['lumbosacral', 24]
]);

/**
 * Where each segment of the CORD lies, as a vertebral coordinate (the middle of the segment). The taught rule: the cord
 * stops growing long before the column does, so it ends at about the joint between the first and second lumbar
 * vertebrae (v = 20), and every segment lies higher than the vertebra of its own number: by about one vertebra low in
 * the neck, two in the upper chest, three in the lower chest; the five lumbar segments lie behind the tenth to twelfth
 * thoracic vertebrae and the sacral ones behind the first lumbar (WIKI_CORD: lumbar and sacral segments between T9 and
 * L2; OPENSTAX_AP: the sacral cord at the upper lumbar vertebrae). The numbers between the
 * anchors (C1 at C1, C8 at C7, T1 at the top of T1, T12 at the top of T10, L5 at the bottom of T12, the tip at L1/L2)
 * are an even spread, which is how the rule is usually drawn; a real cord differs by a vertebra either way.
 */
export const CORD_SEGMENT_V = freeze({
  C1: 0.5, C2: 1.37, C3: 2.24, C4: 3.11, C5: 3.99, C6: 4.86, C7: 5.73, C8: 6.6,
  T1: 7.3, T2: 8.11, T3: 8.92, T4: 9.73, T5: 10.54, T6: 11.35, T7: 12.15, T8: 12.96, T9: 13.77, T10: 14.58, T11: 15.39, T12: 16.2,
  L1: 16.7, L2: 17.2, L3: 17.7, L4: 18.2, L5: 18.7,
  S1: 19.1, S2: 19.4, S3: 19.65, S4: 19.85
});
/** The cord's lower tip (the conus), as a vertebral coordinate: the joint between L1 and L2. Below it only roots run
 * on (the "horse's tail", cauda equina). */
export const CORD_END_V = 20;
/** The cord's upper end in this module: where the medulla passes through the skull's great opening. */
export const CORD_TOP_V = 0;

/**
 * Where each spinal nerve LEAVES the column, as a vertebral coordinate (OPENSTAX_AP, WIKI_CORD): C1 between the skull
 * and the first cervical vertebra; C2 to C7 above the vertebra of the same number; C8 between C7 and T1; every
 * thoracic and lumbar nerve below the vertebra of its own number; the sacral nerves through the openings in the front
 * of the sacrum (spaced by rule down it: the rig has no joints inside the sacrum).
 */
export const ROOT_EXIT_V = freeze({
  C1: 0, C2: 1, C3: 2, C4: 3, C5: 4, C6: 5, C7: 6, C8: 7,
  T1: 8, T2: 9, T3: 10, T4: 11, T5: 12, T6: 13, T7: 14, T8: 15, T9: 16, T10: 17, T11: 18, T12: 19,
  L1: 20, L2: 21, L3: 22, L4: 23, L5: 24,
  S1: 24.5, S2: 24.9, S3: 25.3, S4: 25.7
});

/** The rig segment a point of the canal rides at vertebral coordinate v (the vertebra it lies in). */
export function vertebraSegmentAt(v) {
  if (v < 0) return 'skull';
  if (v < 7) return 'cervical';
  if (v < 8) return 'thorax';
  if (v < 19) return `t${Math.floor(v) - 6}`;
  if (v < 23) return `l${Math.floor(v) - 18}`;
  if (v < 24) return 'lumbar';
  return 'pelvis';
}
/** The vertebra (or part) at vertebral coordinate v, as a label: 'C3', 'T10', 'L1', 'sacrum', 'skull'. */
export function vertebraAt(v) {
  if (v < 0) return 'skull';
  if (v < 7) return `C${Math.floor(v) + 1}`;
  if (v < 19) return `T${Math.floor(v) - 6}`;
  if (v < 24) return `L${Math.floor(v) - 18}`;
  return 'sacrum';
}

// ---------------------------------------------------------------------------------------------------------------------
// The nerves (right side). One row each: id, the anatomical name, a plain name, the levels, the parent, sources.
// The COURSE of each is in the generated block below; how it was laid is in WIRING_COURSE_RULES (same block).
// A trunk whose parent is null starts at the cord or, for a cranial nerve, at the brainstem part named in `origin`.
// The roots of a trunk from the cord join it from their openings between the vertebrae, each at its own point of the
// course (rootJoin, in the generated block; trunkRootLines); rootsLeave: 'cord' marks the one nerve whose roots leave the
// cord's side inside the canal instead (the accessory nerve). extraRoots: levels that reach a branch from outside the
// bundle it is drawn from (the note says how).

const C = s => s.split(' ');
// Every id carries its side: the table below is the right side, `r_...`; the left twin of `r_x` is `l_x` (mirrorTrunk).
const RIGHT = s => `r_${s}`;
const T = (id, name, plain, roots, parent, src, extra = null) => ({ id: RIGHT(id), name, plain, roots: C(roots), parent: parent ? RIGHT(parent) : null, src: C(src), ...(extra || {}) });

const TRUNK_ROWS = [
  // --- cranial nerves that move muscles (from the brainstem; they never pass the cord)
  T('oculomotor', 'oculomotor nerve (cranial nerve III)', 'the nerve that lifts the upper eyelid and turns the eye', 'III', null, 'OPENSTAX_AP WIKI_MUSCLES', { origin: 'midbrain' }),
  T('mandibular_v3', 'mandibular nerve (V3, the lower-jaw branch of the trigeminal nerve, cranial nerve V)', 'the nerve of the chewing muscles', 'V3', null, 'OPENSTAX_AP WIKI_MUSCLES', { origin: 'pons' }),
  T('mylohyoid_nerve', 'nerve to mylohyoid (a branch of the inferior alveolar nerve, itself a branch of the mandibular nerve, V3)', 'a twig of the chewing nerve to the floor of the mouth', 'V3', 'mandibular_v3', 'WIKI_MUSCLES WIKI_NERVES'),
  T('facial', 'facial nerve (cranial nerve VII)', 'the nerve of the face muscles', 'VII', null, 'OPENSTAX_AP WIKI_NERVES', { origin: 'pons' }),
  T('facial_posterior_auricular', 'posterior auricular branch of the facial nerve', 'the face nerve\'s branch to the muscle at the back of the scalp', 'VII', 'facial', 'WIKI_NERVES WIKI_MUSCLES'),
  T('facial_temporal', 'temporal branch of the facial nerve', 'the face nerve\'s branch to the forehead', 'VII', 'facial', 'WIKI_NERVES WIKI_MUSCLES'),
  T('facial_zygomatic', 'zygomatic branch of the facial nerve', 'the face nerve\'s branch to the muscle that shuts the eye', 'VII', 'facial', 'WIKI_NERVES WIKI_MUSCLES'),
  T('facial_buccal', 'buccal branch of the facial nerve', 'the face nerve\'s branch to the cheek, nose and upper lip', 'VII', 'facial', 'WIKI_NERVES WIKI_MUSCLES'),
  T('facial_mandibular', 'marginal mandibular branch of the facial nerve', 'the face nerve\'s branch to the lower lip and chin', 'VII', 'facial', 'WIKI_NERVES WIKI_MUSCLES'),
  T('facial_cervical', 'cervical branch of the facial nerve', 'the face nerve\'s branch to the thin sheet of muscle under the skin of the neck', 'VII', 'facial', 'WIKI_NERVES WIKI_MUSCLES'),
  T('glossopharyngeal', 'glossopharyngeal nerve (cranial nerve IX)', 'a throat nerve: it lifts the throat when you swallow', 'IX', null, 'OPENSTAX_AP WIKI_MUSCLES', { origin: 'medulla', note: 'Its one muscle (stylopharyngeus) is not in this rig: drawn as wiring only.' }),
  T('vagus', 'vagus nerve (cranial nerve X)', 'the nerve of the throat and voice box (it runs on to the heart, lungs and gut)', 'X', null, 'OPENSTAX_AP WIKI_MUSCLES', { origin: 'medulla', note: 'The muscles of the palate, throat and voice box are not in this rig: drawn as wiring only, down to the root of the neck.' }),
  T('accessory', 'accessory nerve (cranial nerve XI, its spinal part)', 'the nerve that turns the head and shrugs the shoulder', 'C1 C2 C3 C4 C5', null, 'OPENSTAX_AP WIKI_NERVES', { rootsLeave: 'cord', note: 'A cranial nerve by name, but the fibres that move its two muscles begin in the top of the cord (C1 to about C5). They leave the cord\'s side inside the canal (not through the openings between the vertebrae), climb beside the cord into the skull through its great opening, and leave the skull again through the jugular opening beside the vagus nerve. The course starts beside the cord.' }),
  T('hypoglossal', 'hypoglossal nerve (cranial nerve XII)', 'the nerve of the tongue', 'XII', null, 'OPENSTAX_AP WIKI_MUSCLES', { origin: 'medulla', note: 'The tongue\'s muscles are not in this rig: drawn as wiring only.' }),

  // --- the neck
  T('cervical_plexus', 'cervical plexus (anterior rami of C1 to C4)', 'the nerve network at the side of the neck', 'C1 C2 C3 C4', null, 'OPENSTAX_AP WIKI_NERVES'),
  T('c1_with_hypoglossal', 'C1 fibres that travel with the hypoglossal nerve (the branches to geniohyoid and thyrohyoid)', 'neck-nerve fibres that ride along the tongue nerve to two small throat muscles', 'C1', 'cervical_plexus', 'WIKI_MUSCLES WIKI_NERVES'),
  T('ansa_cervicalis', 'ansa cervicalis (C1 to C3)', 'a loop of nerve in the neck for the strap muscles under the tongue bone', 'C1 C2 C3', 'cervical_plexus', 'WIKI_NERVES WIKI_MUSCLES'),
  T('phrenic', 'phrenic nerve (C3 to C5)', 'the nerve of the breathing muscle (the diaphragm)', 'C3 C4 C5', 'cervical_plexus', 'OPENSTAX_AP WIKI_BRACHIAL', { extraRoots: ['C5'], note: 'The diaphragm is not in this rig: drawn as wiring only, down to where the diaphragm would be. Its C5 fibres join it from the top root of the brachial plexus.' }),
  T('cervical_muscular', 'muscular branches of the cervical anterior rami (C2 to C8)', 'short nerves to the deep muscles at the front and side of the neck', 'C2 C3 C4 C5 C6 C7 C8', null, 'WIKI_MUSCLES'),

  // --- the arm: the brachial plexus and its nerves
  T('brachial_plexus', 'brachial plexus (anterior rami of C5 to T1)', 'the nerve network for the arm, between the neck and the armpit', 'C5 C6 C7 C8 T1', null, 'OPENSTAX_AP WIKI_BRACHIAL'),
  T('dorsal_scapular', 'dorsal scapular nerve', 'the nerve of the muscles that pull the shoulder blade toward the spine', 'C4 C5', 'brachial_plexus', 'WIKI_BRACHIAL MRC1976', { extraRoots: ['C4'], note: 'Mainly C5, the top root of the plexus; a twig of C4 often joins it.' }),
  T('long_thoracic', 'long thoracic nerve', 'the nerve of the saw-edged muscle on the ribs that holds the shoulder blade flat', 'C5 C6 C7', 'brachial_plexus', 'WIKI_BRACHIAL MRC1976'),
  T('suprascapular', 'suprascapular nerve', 'the nerve of the two muscles on the back of the shoulder blade', 'C5 C6', 'brachial_plexus', 'WIKI_BRACHIAL MRC1976'),
  T('lateral_pectoral', 'lateral pectoral nerve', 'a nerve of the big chest muscle (its upper part)', 'C5 C6 C7', 'brachial_plexus', 'WIKI_BRACHIAL'),
  T('medial_pectoral', 'medial pectoral nerve', 'a nerve of the big chest muscle (its lower part) and the small one under it', 'C8 T1', 'brachial_plexus', 'WIKI_BRACHIAL'),
  T('upper_subscapular', 'upper subscapular nerve', 'a nerve of the muscle on the front of the shoulder blade', 'C5 C6', 'brachial_plexus', 'WIKI_BRACHIAL'),
  T('lower_subscapular', 'lower subscapular nerve', 'a nerve of the muscle on the front of the shoulder blade and of a muscle behind the armpit', 'C5 C6 C7', 'brachial_plexus', 'WIKI_BRACHIAL MRC1976', { note: 'C5 and C6 in the plexus table; the MRC table gives its muscle teres major C5, 6, 7.' }),
  T('thoracodorsal', 'thoracodorsal nerve', 'the nerve of the broad muscle of the back', 'C6 C7 C8', 'brachial_plexus', 'WIKI_BRACHIAL MRC1976'),
  T('axillary', 'axillary nerve', 'the nerve of the shoulder\'s cap muscle', 'C5 C6', 'brachial_plexus', 'OPENSTAX_AP WIKI_BRACHIAL MRC1976'),
  T('musculocutaneous', 'musculocutaneous nerve', 'the nerve of the front of the upper arm (the elbow benders)', 'C5 C6 C7', 'brachial_plexus', 'WIKI_BRACHIAL MRC1976'),
  T('radial', 'radial nerve', 'the main nerve of the back of the arm (it straightens the elbow, wrist and fingers)', 'C5 C6 C7 C8 T1', 'brachial_plexus', 'OPENSTAX_AP WIKI_NERVES MRC1976'),
  T('posterior_interosseous', 'deep branch of the radial nerve (posterior interosseous nerve)', 'the radial nerve\'s deep branch to the muscles that lift the wrist and fingers', 'C6 C7 C8', 'radial', 'WIKI_NERVES MRC1976'),
  T('median', 'median nerve', 'the main nerve of the front of the forearm and the ball of the thumb', 'C5 C6 C7 C8 T1', 'brachial_plexus', 'OPENSTAX_AP WIKI_BRACHIAL MRC1976'),
  T('anterior_interosseous', 'anterior interosseous nerve (the median nerve\'s branch in the forearm)', 'the median nerve\'s deep branch to the muscles that bend the thumb and fingertips', 'C7 C8 T1', 'median', 'WIKI_MUSCLES MRC1976'),
  T('median_recurrent', 'recurrent (thenar) branch of the median nerve', 'the median nerve\'s twig to the ball of the thumb', 'C8 T1', 'median', 'WIKI_MUSCLES MRC1976'),
  T('ulnar', 'ulnar nerve', 'the nerve behind the "funny bone": the little-finger side of the forearm and most small hand muscles', 'C7 C8 T1', 'brachial_plexus', 'OPENSTAX_AP WIKI_NERVES MRC1976'),
  T('ulnar_deep', 'deep branch of the ulnar nerve', 'the ulnar nerve\'s deep branch across the palm to the small hand muscles', 'C8 T1', 'ulnar', 'WIKI_NERVES MRC1976'),

  // --- the belly wall, below the intercostal nerves (which are added by level further down)
  T('iliohypogastric', 'iliohypogastric nerve', 'a nerve of the lowest part of the belly wall', 'T12 L1', 'lumbar_plexus', 'WIKI_LUMBAR'),

  // --- the leg: the lumbar and sacral plexuses and their nerves
  T('lumbar_plexus', 'lumbar plexus (anterior rami of L1 to L4, with a twig of T12)', 'the nerve network inside the deep muscle of the loin', 'T12 L1 L2 L3 L4', null, 'OPENSTAX_AP WIKI_LUMBAR'),
  T('femoral', 'femoral nerve', 'the main nerve of the front of the thigh', 'L2 L3 L4', 'lumbar_plexus', 'OPENSTAX_AP WIKI_LUMBAR MRC1976'),
  T('obturator', 'obturator nerve', 'the nerve of the inner thigh', 'L2 L3 L4', 'lumbar_plexus', 'WIKI_LUMBAR MRC1976'),
  T('sacral_plexus', 'sacral plexus (the lumbosacral trunk L4 and L5 with the anterior rami of S1 to S4)', 'the nerve network on the back wall of the pelvis', 'L4 L5 S1 S2 S3 S4', null, 'OPENSTAX_AP WIKI_SACRAL'),
  T('superior_gluteal', 'superior gluteal nerve', 'the nerve of the muscles on the side of the hip', 'L4 L5 S1', 'sacral_plexus', 'WIKI_SACRAL MRC1976'),
  T('inferior_gluteal', 'inferior gluteal nerve', 'the nerve of the big muscle of the buttock', 'L5 S1 S2', 'sacral_plexus', 'WIKI_SACRAL MRC1976'),
  T('nerve_to_obturator_internus', 'nerve to obturator internus', 'a short nerve to small deep muscles of the hip', 'L5 S1 S2', 'sacral_plexus', 'WIKI_SACRAL WIKI_MUSCLES'),
  T('nerve_to_quadratus_femoris', 'nerve to quadratus femoris', 'a short nerve to small deep muscles of the hip', 'L4 L5 S1', 'sacral_plexus', 'WIKI_SACRAL WIKI_MUSCLES'),
  T('sciatic', 'sciatic nerve', 'the body\'s thickest nerve, down the back of the thigh', 'L4 L5 S1 S2 S3', 'sacral_plexus', 'OPENSTAX_AP WIKI_NERVES WIKI_SACRAL MRC1976'),
  T('tibial', 'tibial nerve', 'the main nerve of the calf and the sole of the foot', 'L4 L5 S1 S2 S3', 'sciatic', 'OPENSTAX_AP WIKI_SACRAL MRC1976'),
  T('medial_plantar', 'medial plantar nerve', 'the nerve of the sole on the big-toe side', 'S1 S2', 'tibial', 'WIKI_SACRAL WIKI_MUSCLES'),
  T('lateral_plantar', 'lateral plantar nerve', 'the nerve of the sole on the little-toe side', 'S1 S2', 'tibial', 'WIKI_SACRAL WIKI_MUSCLES', { note: 'The muscles it serves (the small muscles of the outer sole, the interossei) are not in this rig: drawn as wiring only.' }),
  T('common_fibular', 'common fibular (peroneal) nerve', 'the nerve that winds round the outside of the knee', 'L4 L5 S1 S2', 'sciatic', 'OPENSTAX_AP WIKI_SACRAL MRC1976'),
  T('deep_fibular', 'deep fibular (peroneal) nerve', 'the nerve of the front of the shin (it lifts the foot and toes)', 'L4 L5 S1', 'common_fibular', 'WIKI_SACRAL WIKI_MUSCLES MRC1976'),
  T('superficial_fibular', 'superficial fibular (peroneal) nerve', 'the nerve of the outer side of the shin (it turns the sole outward)', 'L5 S1', 'common_fibular', 'WIKI_SACRAL WIKI_MUSCLES MRC1976')
];

// The nerves that repeat at every level: the intercostal nerves (the front branches of T1 to T11), the subcostal nerve
// (T12), and the short back branch (posterior ramus) of every spinal nerve from C2 to L5.
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
for (let n = 1; n <= 11; n++) {
  TRUNK_ROWS.push(T(`intercostal_t${n}`, `${ORDINAL[n]} intercostal nerve (the anterior ramus of T${n})`,
    n >= 7 ? `the nerve under rib ${n}; it runs on into the wall of the belly` : `the nerve under rib ${n}`, `T${n}`, null, 'OPENSTAX_AP WIKI_MUSCLES'));
}
TRUNK_ROWS.push(T('subcostal', 'subcostal nerve (the anterior ramus of T12)', 'the nerve under the lowest rib; it runs into the wall of the belly', 'T12', null, 'WIKI_MUSCLES'));
/** The levels that have a drawn back branch. */
export const DORSAL_RAMUS_LEVELS = freeze(['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5']);
for (const lv of DORSAL_RAMUS_LEVELS) {
  TRUNK_ROWS.push(T(`dorsal_ramus_${lv.toLowerCase()}`, lv === 'C2' ? 'posterior ramus of the C2 spinal nerve (its main branch is the greater occipital nerve)' : `posterior ramus of the ${lv} spinal nerve`,
    'a short back branch to the deep muscles beside the spine at this level', lv, null, 'WIKI_MUSCLES'));
}
/** The id of the front-branch nerve of a thoracic or first lumbar level, right side ('T10' -> 'r_intercostal_t10'). */
export function ventralTrunkOf(level) {
  if (level === 'T12') return 'r_subcostal';
  if (level === 'L1') return 'r_iliohypogastric';
  return /^T([1-9]|1[01])$/.test(level) ? `r_intercostal_${level.toLowerCase()}` : null;
}
/** The id of the back-branch nerve of a level, right side ('T6' -> 'r_dorsal_ramus_t6'), or null. */
export function dorsalTrunkOf(level) { return DORSAL_RAMUS_LEVELS.includes(level) ? `r_dorsal_ramus_${level.toLowerCase()}` : null; }

// ---------------------------------------------------------------------------------------------------------------------
// The muscles: one row per muscle (side-free), readable against the sources.
//
//   M(names, nerve, roots, main, by, sources, note?, also?)
//     names   the muscle's name; more than one spelling separated by ' | ' (the game's meshes use several)
//     nerve   a NERVE_TRUNKS id without its side (the row is side-free; 'radial' is stored as 'r_radial')
//     roots   the spinal or cranial levels, in order
//     main    the main one
//     by      why that one:  M = printed in bold in the MRC table;  K = the level the ISNCSCI exam tests this movement
//             for;  W = bold in the brachial plexus table (WIKI_BRACHIAL);  S = the only one;  C = chosen: the sources
//             mark none (or two) and the note says why this one
//     also    other nerves that share the muscle (a muscle with two nerves is drawn from the first)
// A row marked DORSAL or VENTRAL is served level by level (the back branch or the front branch of each listed spinal
// nerve); its nerve is the one of its main level and `also` lists the rest.

const DORSAL = 'DORSAL', VENTRAL = 'VENTRAL';
const LIP_LIFTER_NOTE = 'Taught both ways: the list gives the buccal branch; other texts name the zygomatic and buccal branches together, the zygomatic first. It is drawn from the buccal branch.';
const DORSAL_NOTE = 'The back branches of the spinal nerves alongside it: the levels are those it is taught to span, and the middle one is given as main.';
const M = (names, trunk, roots, main, by, src, note = '', also = '') => {
  const r = C(roots);
  let t = RIGHT(trunk), a = also ? C(also).map(RIGHT) : [];
  if (trunk === DORSAL) { t = dorsalTrunkOf(main); a = r.filter(l => l !== main).map(dorsalTrunkOf).filter(Boolean); }
  if (trunk === VENTRAL) { t = ventralTrunkOf(main); a = [...r.filter(l => l !== main).map(ventralTrunkOf).filter(Boolean), ...a]; }
  return { names: names.split(' | '), trunk: t, roots: r, main, by, src: C(src), note, also: a, segmental: trunk === DORSAL ? 'dorsal' : trunk === VENTRAL ? 'ventral' : null };
};

export const MUSCLE_ROWS = deepFreeze([
  // ----- the eye
  M('levator palpebrae superioris', 'oculomotor', 'III', 'III', 'S', 'WIKI_MUSCLES OPENSTAX_AP'),

  // ----- the face: the facial nerve (VII), by branch
  M('frontalis | frontal belly of occipitofrontalis | occipitofrontalis', 'facial_temporal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', 'The whole name "occipitofrontalis" resolves to the forehead belly; the belly at the back of the head has its own row.'),
  M('occipitalis | occipital belly of occipitofrontalis', 'facial_posterior_auricular', 'VII', 'VII', 'S', 'WIKI_MUSCLES'),
  M('temporoparietalis', 'facial_temporal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', 'The list names the facial nerve only; the temporal branch is the one that crosses this muscle.'),
  M('corrugator supercilii', 'facial_temporal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', 'Sources differ: the list gives the zygomatic branch; the temporal branch is the one more often taught for the brow muscles.', 'facial_zygomatic'),
  M('procerus', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', 'Taught more than one way: the list gives the buccal branch; others give the temporal or the zygomatic branch.', 'facial_temporal facial_zygomatic'),
  M('orbicularis oculi', 'facial_zygomatic', 'VII', 'VII', 'S', 'WIKI_MUSCLES WIKI_NERVES', 'Both its parts; its upper half also gets twigs of the temporal branch.', 'facial_temporal'),
  M('nasalis', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES'),
  M('depressor septi nasi', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES'),
  M('levator labii superioris alaeque nasi | levator nasolabialis', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', LIP_LIFTER_NOTE, 'facial_zygomatic'),
  M('levator labii superioris', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', LIP_LIFTER_NOTE, 'facial_zygomatic'),
  M('zygomaticus minor', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', LIP_LIFTER_NOTE, 'facial_zygomatic'),
  M('zygomaticus major', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', LIP_LIFTER_NOTE, 'facial_zygomatic'),
  M('levator anguli oris', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES', 'The list names the facial nerve only. Taught both ways: the buccal branch, or the zygomatic and buccal branches together; it is drawn from the buccal branch.', 'facial_zygomatic'),
  M('risorius', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES'),
  M('buccinator | bucinator', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES'),
  M('orbicularis oris', 'facial_buccal', 'VII', 'VII', 'S', 'WIKI_MUSCLES WIKI_NERVES', 'Its lower half also gets twigs of the marginal mandibular branch.', 'facial_mandibular'),
  M('depressor anguli oris', 'facial_mandibular', 'VII', 'VII', 'S', 'WIKI_MUSCLES WIKI_NERVES'),
  M('depressor labii inferioris', 'facial_mandibular', 'VII', 'VII', 'S', 'WIKI_MUSCLES'),
  M('mentalis', 'facial_mandibular', 'VII', 'VII', 'S', 'WIKI_MUSCLES'),
  M('platysma', 'facial_cervical', 'VII', 'VII', 'S', 'WIKI_MUSCLES WIKI_NERVES'),
  M('stylohyoid', 'facial', 'VII', 'VII', 'S', 'WIKI_MUSCLES WIKI_NERVES', 'A branch given just below the skull, before the five face branches.'),
  M('posterior belly of digastric', 'facial', 'VII', 'VII', 'S', 'WIKI_MUSCLES WIKI_NERVES', 'A branch given just below the skull, before the five face branches.'),

  // ----- the chewing muscles and the floor of the mouth: the mandibular nerve (V3)
  M('masseter', 'mandibular_v3', 'V3', 'V3', 'S', 'WIKI_MUSCLES OPENSTAX_AP'),
  M('temporalis', 'mandibular_v3', 'V3', 'V3', 'S', 'WIKI_MUSCLES OPENSTAX_AP'),
  M('medial pterygoid', 'mandibular_v3', 'V3', 'V3', 'S', 'WIKI_MUSCLES'),
  M('lateral pterygoid', 'mandibular_v3', 'V3', 'V3', 'S', 'WIKI_MUSCLES'),
  M('mylohyoid', 'mylohyoid_nerve', 'V3', 'V3', 'S', 'WIKI_MUSCLES'),
  M('anterior belly of digastric', 'mylohyoid_nerve', 'V3', 'V3', 'S', 'WIKI_MUSCLES'),
  M('digastric', 'mylohyoid_nerve', 'V3 VII', 'V3', 'C', 'WIKI_MUSCLES', 'One muscle, two bellies, two nerves: the front belly by the nerve to mylohyoid (V3), the back belly by the facial nerve (VII). A piece named only "digastric" is drawn from the front belly\'s nerve.', 'facial'),

  // ----- the neck
  M('sternocleidomastoid', 'accessory', 'C2 C3', 'C2', 'C', 'WIKI_MUSCLES WIKI_NERVES OPENSTAX_AP', 'Moved by the accessory nerve (cranial nerve XI), whose fibres begin in the top of the cord (C1 to about C5); its cells for this muscle lie in the top segments (about C1 to C3), so its C2 root is drawn. C2 and C3 are also the levels of the cervical plexus quoted with this muscle (they mainly carry its position sense).', 'cervical_plexus'),
  M('trapezius', 'accessory', 'C3 C4', 'C4', 'C', 'MRC1976 WIKI_MUSCLES WIKI_NERVES WIKI_MYOTOME OPENSTAX_AP', 'All three parts. Moved by the accessory nerve (cranial nerve XI), whose fibres begin in the top of the cord (C1 to about C5); its cells for this muscle lie lower than those for sternocleidomastoid (about C2 to C5). C4 is drawn: the charts of what each level moves give shrugging the shoulder to C4. The MRC table lists the muscle with C3 and C4 and marks neither; taught both ways, other tables give C3.', 'cervical_plexus'),
  M('geniohyoid', 'c1_with_hypoglossal', 'C1', 'C1', 'S', 'WIKI_MUSCLES'),
  M('thyrohyoid', 'c1_with_hypoglossal', 'C1', 'C1', 'S', 'WIKI_MUSCLES WIKI_NERVES'),
  M('sternohyoid', 'ansa_cervicalis', 'C1 C2 C3', 'C2', 'C', 'WIKI_MUSCLES WIKI_NERVES', 'No source marks a main root; the middle one is given.'),
  M('sternothyroid', 'ansa_cervicalis', 'C1 C2 C3', 'C2', 'C', 'WIKI_MUSCLES WIKI_NERVES', 'No source marks a main root; the middle one is given.'),
  M('omohyoid', 'ansa_cervicalis', 'C1 C2 C3', 'C2', 'C', 'WIKI_MUSCLES WIKI_NERVES', 'No source marks a main root; the middle one is given.'),
  M('longus colli', 'cervical_muscular', 'C2 C3 C4 C5 C6', 'C4', 'C', 'WIKI_MUSCLES', 'Direct branches of the anterior rami alongside it; the middle one is given as main.'),
  M('scalenus anterior', 'cervical_muscular', 'C4 C5 C6', 'C5', 'C', 'WIKI_MUSCLES', 'The list gives C5 and C6; C4 to C6 is the wider range often taught.'),
  M('scalenus medius', 'cervical_muscular', 'C3 C4 C5 C6 C7 C8', 'C5', 'C', 'WIKI_MUSCLES', 'Direct branches of the third to eighth cervical nerves; a middle one is given as main.'),
  M('scalenus posterior', 'cervical_muscular', 'C6 C7 C8', 'C7', 'C', 'WIKI_MUSCLES', 'Direct branches of the lowest cervical nerves; the middle one is given as main.'),
  M('levator scapulae', 'cervical_muscular', 'C3 C4 C5', 'C4', 'C', 'WIKI_MUSCLES WIKI_BRACHIAL', 'C3 and C4 directly, and C5 by the dorsal scapular nerve. Taught both ways: some texts name the dorsal scapular nerve only. It is drawn from the cervical branches; the middle level is given as main.', 'dorsal_scapular'),

  // ----- the deep muscles of the back: the back branches (posterior rami) of the spinal nerves alongside each muscle.
  // The list says only "posterior branch of spinal nerve" for most; the levels are those the muscle is taught to span,
  // and the main one is the middle of them.
  M('splenius capitis', DORSAL, 'C2 C3 C4', 'C3', 'C', 'WIKI_MUSCLES', 'The list gives C3 and C4; C2 and C3 is also taught.'),
  M('semispinalis capitis', DORSAL, 'C2 C3', 'C2', 'C', 'WIKI_MUSCLES', 'The greater occipital nerve (the back branch of C2), with C3.'),
  M('semispinalis cervicis', DORSAL, 'C6 C7 C8', 'C7', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),
  M('semispinalis thoracis', DORSAL, 'T1 T2 T3 T4 T5 T6', 'T4', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),
  M('longissimus capitis', DORSAL, 'C3 C4 C5 C6 C7 C8', 'C5', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),
  M('longissimus cervicis', DORSAL, 'C4 C5 C6 C7 C8 T1 T2 T3', 'C7', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),
  M('longissimus thoracis', DORSAL, 'T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12 L1 L2 L3 L4 L5', 'T9', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),
  M('iliocostalis cervicis', DORSAL, 'C6 C7 C8 T1 T2', 'C8', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),
  M('iliocostalis thoracis', DORSAL, 'T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12', 'T6', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),
  M('iliocostalis lumborum', DORSAL, 'T7 T8 T9 T10 T11 T12 L1 L2 L3', 'T12', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),
  M('spinalis thoracis', DORSAL, 'T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12', 'T6', 'C', 'WIKI_MUSCLES', DORSAL_NOTE),

  // ----- the shoulder girdle and the chest: branches of the brachial plexus
  M('rhomboid major', 'dorsal_scapular', 'C4 C5', 'C5', 'W', 'MRC1976 WIKI_BRACHIAL WIKI_MUSCLES'),
  M('rhomboid minor', 'dorsal_scapular', 'C4 C5', 'C5', 'W', 'MRC1976 WIKI_BRACHIAL WIKI_MUSCLES'),
  M('serratus anterior', 'long_thoracic', 'C5 C6 C7', 'C6', 'C', 'MRC1976 WIKI_BRACHIAL', 'The MRC table marks no main root; the middle one is given.'),
  M('supraspinatus', 'suprascapular', 'C5 C6', 'C5', 'M', 'MRC1976 WIKI_BRACHIAL'),
  M('infraspinatus', 'suprascapular', 'C5 C6', 'C5', 'M', 'MRC1976 WIKI_BRACHIAL'),
  M('subscapularis', 'upper_subscapular', 'C5 C6', 'C6', 'C', 'WIKI_BRACHIAL WIKI_MUSCLES', 'Both subscapular nerves enter it. No source read marks a main root; C6 is the one usually given.', 'lower_subscapular'),
  M('teres major', 'lower_subscapular', 'C5 C6 C7', 'C6', 'C', 'MRC1976 WIKI_BRACHIAL', 'The MRC table gives C5, 6, 7 without a main root; the middle one is given.'),
  M('latissimus dorsi', 'thoracodorsal', 'C6 C7 C8', 'C7', 'M', 'MRC1976 WIKI_BRACHIAL'),
  M('pectoralis major', 'lateral_pectoral', 'C5 C6 C7 C8 T1', 'C7', 'C', 'MRC1976 WIKI_BRACHIAL WIKI_MUSCLES', 'The whole muscle: both pectoral nerves; its parts have their own rows.', 'medial_pectoral'),
  M('clavicular part of pectoralis major', 'lateral_pectoral', 'C5 C6', 'C5', 'M', 'MRC1976 WIKI_MUSCLES'),
  M('sternocostal part of pectoralis major', 'lateral_pectoral', 'C6 C7 C8 T1', 'C7', 'M', 'MRC1976 WIKI_MUSCLES WIKI_BRACHIAL', 'Both pectoral nerves reach this part. It is drawn from the lateral one, which carries its main level C7 (C5 to C7); C8 and T1 come by the medial one. The MRC table gives C6, C7, C8 with C7 in bold; the list adds T1.', 'medial_pectoral'),
  M('abdominal part of pectoralis major', 'medial_pectoral', 'C8 T1', 'C8', 'C', 'WIKI_MUSCLES WIKI_BRACHIAL', 'The lowest fibres: the medial pectoral nerve. No main root is marked; the first is given.'),
  M('pectoralis minor', 'medial_pectoral', 'C8 T1', 'C8', 'C', 'WIKI_MUSCLES WIKI_BRACHIAL', 'No main root is marked; the first is given.'),
  M('deltoid', 'axillary', 'C5 C6', 'C5', 'M', 'MRC1976 WIKI_BRACHIAL'),
  M('teres minor', 'axillary', 'C5 C6', 'C5', 'W', 'WIKI_BRACHIAL WIKI_MUSCLES'),

  // ----- the upper arm
  M('coracobrachialis', 'musculocutaneous', 'C5 C6 C7', 'C6', 'C', 'WIKI_BRACHIAL WIKI_MUSCLES', 'No main root is marked; the middle one is given.'),
  M('biceps brachii', 'musculocutaneous', 'C5 C6', 'C6', 'C', 'MRC1976 WIKI_BRACHIAL WIKI_MYOTOME ISNCSCI', 'The MRC table gives C5, C6 without a main root. Taught both ways: C6 is the one the charts of what each level moves give for elbow bending, and it is given here; the ISNCSCI exam tests elbow bending as C5.'),
  M('brachialis', 'musculocutaneous', 'C5 C6', 'C6', 'C', 'MRC1976 WIKI_BRACHIAL WIKI_MYOTOME ISNCSCI', 'As biceps (C6 here; ISNCSCI tests elbow bending as C5). A small outer part is also reached by the radial nerve.', 'radial'),
  M('triceps brachii', 'radial', 'C6 C7 C8', 'C7', 'M', 'MRC1976 WIKI_NERVES ISNCSCI'),
  M('anconeus', 'radial', 'C7 C8 T1', 'C7', 'C', 'WIKI_MUSCLES WIKI_NERVES', 'It works with triceps; triceps\' main root is given.'),

  // ----- the forearm: the back (radial nerve and its deep branch)
  M('brachioradialis', 'radial', 'C5 C6', 'C6', 'M', 'MRC1976 WIKI_NERVES'),
  M('extensor carpi radialis longus', 'radial', 'C5 C6', 'C6', 'M', 'MRC1976 WIKI_NERVES ISNCSCI'),
  M('extensor carpi radialis brevis', 'posterior_interosseous', 'C6 C7', 'C7', 'C', 'WIKI_NERVES WIKI_MUSCLES', 'The MRC table does not list it. Taught both ways in the nerve (the deep branch of the radial nerve, as here, or the radial nerve itself before it divides) and in the levels (anything from C5 to C8; C7 is given as main; ISNCSCI tests wrist lifting, both radial wrist extensors, as C6).', 'radial'),
  M('supinator', 'posterior_interosseous', 'C6 C7', 'C6', 'C', 'MRC1976 WIKI_NERVES', 'The MRC table gives C6, C7 without a main root; the first is given. Taught both ways: the list and other texts give C7, C8.'),
  M('extensor digitorum', 'posterior_interosseous', 'C7 C8', 'C7', 'M', 'MRC1976 WIKI_NERVES'),
  M('extensor digiti minimi', 'posterior_interosseous', 'C7 C8', 'C7', 'C', 'WIKI_MUSCLES WIKI_NERVES', 'Not in the MRC table; as extensor digitorum, which it runs with.'),
  M('extensor carpi ulnaris', 'posterior_interosseous', 'C7 C8', 'C7', 'M', 'MRC1976 WIKI_NERVES'),
  M('abductor pollicis longus', 'posterior_interosseous', 'C7 C8', 'C7', 'M', 'MRC1976 WIKI_NERVES'),
  M('extensor pollicis brevis', 'posterior_interosseous', 'C7 C8', 'C7', 'M', 'MRC1976 WIKI_NERVES'),
  M('extensor pollicis longus', 'posterior_interosseous', 'C7 C8', 'C7', 'M', 'MRC1976 WIKI_NERVES'),
  M('extensor indicis', 'posterior_interosseous', 'C7 C8', 'C7', 'M', 'MRC1976 WIKI_NERVES'),

  // ----- the forearm: the front (median nerve, its forearm branch, and the ulnar nerve)
  M('pronator teres', 'median', 'C6 C7', 'C6', 'C', 'MRC1976 WIKI_MUSCLES', 'The MRC table gives C6, C7 without a main root; the first is given.'),
  M('flexor carpi radialis', 'median', 'C6 C7', 'C7', 'M', 'MRC1976 WIKI_MUSCLES'),
  M('palmaris longus', 'median', 'C7 C8', 'C8', 'C', 'WIKI_MUSCLES', 'Not in the MRC table. It lies between two muscles whose main root is C8 (flexor digitorum superficialis, flexor carpi ulnaris); that one is given.'),
  M('flexor digitorum superficialis', 'median', 'C7 C8 T1', 'C8', 'M', 'MRC1976 WIKI_MUSCLES'),
  M('flexor digitorum profundus', 'anterior_interosseous', 'C7 C8', 'C8', 'C', 'MRC1976 WIKI_MUSCLES ISNCSCI', 'Two nerves: the half for the index and middle fingers by the anterior interosseous nerve, the half for the ring and little fingers by the ulnar nerve. The MRC table prints both C7 and C8 in bold for the first half and C8 for the second; C8 is given as main (the level ISNCSCI tests finger bending for). Taught both ways in the levels: other texts give C8 and T1.', 'ulnar'),
  M('flexor pollicis longus', 'anterior_interosseous', 'C7 C8', 'C8', 'M', 'MRC1976 WIKI_MUSCLES', 'Taught both ways in the levels: other texts give C8 and T1 for the muscles of this nerve.'),
  M('pronator quadratus', 'anterior_interosseous', 'C7 C8', 'C8', 'C', 'WIKI_MUSCLES', 'Not in the MRC table; as the other muscles of this nerve. Taught both ways: other texts give C8 and T1.'),
  M('flexor carpi ulnaris', 'ulnar', 'C7 C8 T1', 'C8', 'M', 'MRC1976 WIKI_NERVES'),

  // ----- the hand
  M('abductor pollicis brevis', 'median_recurrent', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_MUSCLES'),
  M('flexor pollicis brevis', 'median_recurrent', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_MUSCLES WIKI_NERVES', 'The rig has its superficial head (median nerve); the deep head is the ulnar nerve\'s. The MRC table notes the whole muscle is often the ulnar nerve\'s.', 'ulnar_deep'),
  M('opponens pollicis', 'median_recurrent', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_MUSCLES'),
  M('adductor pollicis', 'ulnar_deep', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_NERVES'),
  M('abductor digiti minimi of hand', 'ulnar_deep', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_NERVES ISNCSCI'),
  M('flexor digiti minimi brevis of hand', 'ulnar_deep', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_NERVES'),
  M('opponens digiti minimi of hand', 'ulnar_deep', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_NERVES'),
  M('lumbricals of hand', 'median', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_MUSCLES WIKI_NERVES', 'One mesh for all four. The two for the index and middle fingers by the median nerve, the two for the ring and little fingers by the deep branch of the ulnar nerve.', 'ulnar_deep'),
  M('dorsal interossei of hand', 'ulnar_deep', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_NERVES'),
  M('palmar interossei of hand', 'ulnar_deep', 'C8 T1', 'T1', 'M', 'MRC1976 WIKI_NERVES'),

  // ----- the trunk: the front branches of the thoracic nerves (intercostal and subcostal), level by level
  M('serratus posterior superior', VENTRAL, 'T2 T3 T4 T5', 'T3', 'C', 'WIKI_MUSCLES', 'The second to fifth intercostal nerves; a middle one is given as main.'),
  M('serratus posterior inferior', VENTRAL, 'T9 T10 T11 T12', 'T10', 'C', 'WIKI_MUSCLES', 'The lowest intercostal nerves and the subcostal nerve; a middle one is given as main.'),
  M('rectus abdominis', VENTRAL, 'T7 T8 T9 T10 T11 T12', 'T10', 'C', 'WIKI_MUSCLES', 'The lower intercostal nerves and the subcostal nerve; T10 (the level of the navel) is given as main.'),
  M('external oblique | external abdominal oblique', VENTRAL, 'T7 T8 T9 T10 T11 T12', 'T9', 'C', 'WIKI_MUSCLES', 'The lower intercostal nerves and the subcostal nerve; a middle one is given as main.'),
  M('internal oblique | internal abdominal oblique', VENTRAL, 'T7 T8 T9 T10 T11 T12 L1', 'T11', 'C', 'WIKI_MUSCLES WIKI_LUMBAR', 'The lower intercostal nerves, the subcostal nerve and the first lumbar nerve (iliohypogastric, ilioinguinal); a lower-middle one is given as main.'),
  M('transversus abdominis | transverse abdominal', VENTRAL, 'T7 T8 T9 T10 T11 T12 L1', 'T10', 'C', 'WIKI_MUSCLES WIKI_LUMBAR', 'As the internal oblique; a middle one is given as main.'),

  // ----- the loin and the hip: the lumbar plexus
  M('quadratus lumborum', 'lumbar_plexus', 'T12 L1 L2 L3 L4', 'L2', 'C', 'WIKI_MUSCLES WIKI_LUMBAR', 'Direct short branches (and the subcostal nerve); the middle one is given as main.', 'subcostal'),
  M('psoas major', 'lumbar_plexus', 'L1 L2 L3', 'L2', 'K', 'MRC1976 WIKI_LUMBAR ISNCSCI', 'Direct branches of the plexus, which lies inside this muscle. The MRC table marks L1 and L2 for iliopsoas; L2 is the level tested for hip bending.'),
  M('iliacus', 'femoral', 'L2 L3', 'L2', 'K', 'MRC1976 WIKI_LUMBAR WIKI_MUSCLES ISNCSCI', 'With psoas major it is the hip bender (iliopsoas).'),
  M('pectineus', 'femoral', 'L2 L3', 'L2', 'C', 'WIKI_MUSCLES WIKI_LUMBAR', 'Usually the femoral nerve; the obturator nerve reaches it in some people. No main root is marked; the first is given.', 'obturator'),
  M('sartorius', 'femoral', 'L2 L3', 'L2', 'C', 'WIKI_MUSCLES WIKI_LUMBAR', 'No main root is marked; the first is given (a hip bender).'),
  M('rectus femoris', 'femoral', 'L2 L3 L4', 'L3', 'K', 'MRC1976 WIKI_LUMBAR ISNCSCI', 'The MRC table marks both L3 and L4 for the quadriceps; L3 is the level tested for knee straightening.'),
  M('vastus lateralis', 'femoral', 'L2 L3 L4', 'L3', 'K', 'MRC1976 WIKI_LUMBAR ISNCSCI', 'As rectus femoris (one of the four heads of the quadriceps).'),
  M('vastus medialis', 'femoral', 'L2 L3 L4', 'L3', 'K', 'MRC1976 WIKI_LUMBAR ISNCSCI', 'As rectus femoris (one of the four heads of the quadriceps).'),
  M('vastus intermedius', 'femoral', 'L2 L3 L4', 'L3', 'K', 'MRC1976 WIKI_LUMBAR ISNCSCI', 'As rectus femoris (one of the four heads of the quadriceps).'),
  M('adductor longus', 'obturator', 'L2 L3 L4', 'L3', 'C', 'MRC1976 WIKI_LUMBAR', 'The MRC table marks both L2 and L3; the middle one is given.'),
  M('adductor brevis', 'obturator', 'L2 L3 L4', 'L3', 'C', 'WIKI_LUMBAR WIKI_MUSCLES', 'As adductor longus (not in the MRC table itself).'),
  M('adductor magnus', 'obturator', 'L2 L3 L4', 'L3', 'C', 'MRC1976 WIKI_LUMBAR WIKI_MUSCLES', 'Two nerves: its adductor part by the obturator nerve, its hamstring part by the tibial side of the sciatic nerve. Main root as adductor longus.', 'sciatic'),
  M('gracilis', 'obturator', 'L2 L3', 'L3', 'C', 'WIKI_LUMBAR WIKI_MUSCLES', 'As the adductors, with which it works (not in the MRC table itself).'),
  M('obturator externus', 'obturator', 'L3 L4', 'L3', 'C', 'WIKI_MUSCLES WIKI_LUMBAR', 'No main root is marked; the first is given.'),

  // ----- the buttock and the deep hip: the sacral plexus
  M('gluteus medius', 'superior_gluteal', 'L4 L5 S1', 'L5', 'C', 'MRC1976 WIKI_SACRAL', 'The MRC table marks both L4 and L5; the middle one is given.'),
  M('gluteus minimus', 'superior_gluteal', 'L4 L5 S1', 'L5', 'C', 'MRC1976 WIKI_SACRAL', 'As gluteus medius (the MRC table lists the two together).'),
  M('tensor fasciae latae', 'superior_gluteal', 'L4 L5 S1', 'L5', 'C', 'MRC1976 WIKI_SACRAL', 'As gluteus medius (the list gives L4, L5).'),
  M('gluteus maximus', 'inferior_gluteal', 'L5 S1 S2', 'S1', 'C', 'MRC1976 WIKI_SACRAL', 'The MRC table marks both L5 and S1; the middle one is given.'),
  M('piriformis', 'sacral_plexus', 'S1 S2', 'S1', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'A direct branch of the plexus (the nerve to piriformis). No main root is marked; the first is given.'),
  M('obturator internus', 'nerve_to_obturator_internus', 'L5 S1 S2', 'S1', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'No main root is marked; the middle one is given.'),
  M('gemellus superior | superior gemellus', 'nerve_to_obturator_internus', 'L5 S1 S2', 'S1', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'As obturator internus.'),
  M('quadratus femoris', 'nerve_to_quadratus_femoris', 'L4 L5 S1', 'L5', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'No main root is marked; the middle one is given.'),
  M('gemellus inferior | inferior gemellus', 'nerve_to_quadratus_femoris', 'L4 L5 S1', 'L5', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'As quadratus femoris.'),

  // ----- the back of the thigh: the sciatic nerve
  M('biceps femoris', 'sciatic', 'L5 S1 S2', 'S1', 'M', 'MRC1976 WIKI_SACRAL WIKI_MUSCLES', 'Its long head by the tibial side of the sciatic nerve, its short head by the common fibular side: both leave the sciatic nerve in the thigh.'),
  M('semitendinosus', 'sciatic', 'L5 S1 S2', 'S1', 'M', 'MRC1976 WIKI_SACRAL'),
  M('semimembranosus', 'sciatic', 'L5 S1 S2', 'S1', 'M', 'MRC1976 WIKI_SACRAL'),

  // ----- the calf and the sole: the tibial nerve and its plantar branches
  M('gastrocnemius', 'tibial', 'S1 S2', 'S1', 'K', 'MRC1976 WIKI_SACRAL ISNCSCI', 'The MRC table marks neither root; S1 is the level tested for pointing the foot.'),
  M('soleus', 'tibial', 'S1 S2', 'S1', 'K', 'MRC1976 WIKI_SACRAL ISNCSCI', 'As gastrocnemius (the MRC table lists the two together).'),
  M('plantaris', 'tibial', 'S1 S2', 'S1', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'Not in the MRC table; as gastrocnemius, which it lies with.'),
  M('popliteus', 'tibial', 'L4 L5 S1', 'L5', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'Not in the MRC table; the middle root is given.'),
  M('tibialis posterior', 'tibial', 'L4 L5', 'L4', 'M', 'MRC1976 WIKI_SACRAL', 'Taught both ways: the MRC table marks L4; many clinical texts treat it as mainly L5.'),
  M('flexor digitorum longus', 'tibial', 'L5 S1 S2', 'S2', 'C', 'MRC1976 WIKI_SACRAL', 'The MRC table marks both S1 and S2; S2 is given (toe curling is usually taught as the lower of the two).'),
  M('flexor hallucis longus', 'tibial', 'L5 S1 S2', 'S2', 'C', 'MRC1976 WIKI_SACRAL', 'As flexor digitorum longus.'),
  M('abductor hallucis', 'medial_plantar', 'S1 S2', 'S2', 'C', 'MRC1976 WIKI_SACRAL', 'The MRC table gives S1, S2 for the small muscles of the foot without a main root; the lower is given (other tables give S2, S3).'),
  M('flexor digitorum brevis', 'medial_plantar', 'S1 S2', 'S2', 'C', 'MRC1976 WIKI_SACRAL', 'As abductor hallucis.'),
  M('flexor hallucis brevis', 'medial_plantar', 'S1 S2', 'S2', 'C', 'MRC1976 WIKI_SACRAL WIKI_MUSCLES', 'As abductor hallucis. Both heads are usually given to the medial plantar nerve; one table gives the outer head to the lateral plantar nerve.', 'lateral_plantar'),

  // ----- the front and the outer side of the shin, and the top of the foot: the fibular nerves
  M('tibialis anterior', 'deep_fibular', 'L4 L5', 'L4', 'M', 'MRC1976 WIKI_SACRAL ISNCSCI'),
  M('extensor digitorum longus', 'deep_fibular', 'L5 S1', 'L5', 'M', 'MRC1976 WIKI_SACRAL'),
  M('extensor hallucis longus', 'deep_fibular', 'L5 S1', 'L5', 'M', 'MRC1976 WIKI_SACRAL ISNCSCI'),
  M('fibularis tertius | peroneus tertius', 'deep_fibular', 'L5 S1', 'L5', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'Not in the MRC table; as extensor digitorum longus, of which it is a slip.'),
  M('extensor digitorum brevis', 'deep_fibular', 'L5 S1', 'L5', 'C', 'MRC1976 WIKI_SACRAL', 'The MRC table marks neither root; L5 is given, as for the long toe lifters. Taught both ways: other tables give S1.'),
  M('extensor hallucis brevis', 'deep_fibular', 'L5 S1', 'L5', 'C', 'WIKI_SACRAL WIKI_MUSCLES', 'As extensor digitorum brevis, of which it is a slip (L5 here; other tables give S1).'),
  M('fibularis longus | peroneus longus', 'superficial_fibular', 'L5 S1', 'S1', 'C', 'MRC1976 WIKI_SACRAL WIKI_MYOTOME', 'The MRC table marks neither root. S1 is given: the charts of what each level moves give turning the sole outward to S1, which is the commoner teaching. Taught both ways: other texts, on testing the nerves, lean to L5.'),
  M('fibularis brevis | peroneus brevis', 'superficial_fibular', 'L5 S1', 'S1', 'C', 'MRC1976 WIKI_SACRAL WIKI_MYOTOME', 'As fibularis longus: S1 here (the commoner teaching for turning the sole outward); other texts lean to L5.')
]);

/** The left game arm's catalogue keys (inputs/MOVEMENT-MAP.json muscle_catalog; ns-bodymap CATALOG_NAMES), as names. */
export const ARM_CATALOG_NAMES = freeze({
  FDS: 'left flexor digitorum superficialis', FDP: 'left flexor digitorum profundus', ED: 'left extensor digitorum', EI: 'left extensor indicis',
  EDM: 'left extensor digiti minimi', LUM: 'lumbricals of left hand', DI: 'dorsal interossei of left hand', PI: 'palmar interossei of left hand',
  ADM: 'abductor digiti minimi of left hand', FPB: 'left flexor pollicis brevis', FPL: 'left flexor pollicis longus', EPB: 'left extensor pollicis brevis',
  EPL: 'left extensor pollicis longus', OP: 'left opponens pollicis', ADP: 'left adductor pollicis', FCR: 'left flexor carpi radialis',
  FCU: 'left flexor carpi ulnaris', ECRL: 'left extensor carpi radialis longus', ECRB: 'left extensor carpi radialis brevis', ECU: 'left extensor carpi ulnaris',
  BRA: 'left brachialis', BIC: 'left biceps brachii', BRD: 'left brachioradialis', TRI: 'left triceps brachii', ANC: 'left anconeus'
});

// ---------------------------------------------------------------------------------------------------------------------
// The brain: typical links between the regions the brain atlas has as meshes (inputs/MESH-MANIFEST.json, group
// "brain": 59 meshes, named by their embedded source name). The atlas has no thalamus, no basal nuclei, no corpus
// callosum, no superior temporal gyrus, no temporal pole and no orbital gyri: a link whose real way-station or end is
// one of those says so in `note` and is tied to the nearest mesh that exists.

/** The brain meshes the links use: region -> [mesh id of the LEFT half, mesh id of the RIGHT half] (left = x > 0). */
export const BRAIN_REGIONS = deepFreeze({
  precentral: ['FJ1800', 'FJ1801'], postcentral: ['FJ1797', 'FJ1798'],
  superior_frontal: ['FJ1833', 'FJ1834'], middle_frontal: ['FJ1787', 'FJ1788'], inferior_frontal: ['FJ1744', 'FJ1745'],
  superior_parietal: ['FJ1835', 'FJ1836'], supramarginal: ['FJ1841', 'FJ1842'], angular: ['FJ1732', 'FJ1733'],
  cingulate: ['FJ1739', 'FJ1740'], insula: ['FJ1748', 'FJ1749'],
  middle_temporal: ['FJ1789', 'FJ1790'], inferior_temporal: ['FJ1746', 'FJ1747'], fusiform: ['FJ1783', 'FJ1784'],
  parahippocampal: ['FJ1785', 'FJ1786'], hippocampus: ['FJ1759', 'FJ1807'], hypothalamus: ['FJ1760', 'FJ1808'],
  occipital: ['FJ1791', 'FJ1792'],
  internal_capsule: ['FJ1750', 'FJ1751'], white_matter: ['FJ1758', 'FJ1806'],
  midbrain: ['FJ1770', 'FJ1817'], pons: ['FJ1775', 'FJ1822'], medulla: ['FJ1769', 'FJ1831'], cerebellum: ['FJ1781', 'FJ1830']
});
/** The atlas's own name of each brain mesh used (for a reader; the test checks them against the manifest). */
export const BRAIN_MESH_NAMES = freeze({
  FJ1800: 'Left precentral gyrus', FJ1801: 'Right precentral gyrus', FJ1797: 'Left postcentral gyrus', FJ1798: 'Right postcentral gyrus',
  FJ1833: 'Left superior frontal gyrus', FJ1834: 'Right superior frontal gyrus', FJ1787: 'Left middle frontal gyrus', FJ1788: 'Right middle frontal gyrus',
  FJ1744: 'Left inferior frontal gyrus', FJ1745: 'Right inferior frontal gyrus', FJ1835: 'Left superior parietal lobule', FJ1836: 'Right superior parietal lobule',
  FJ1841: 'Left supramarginal gyrus', FJ1842: 'Right supramarginal gyrus', FJ1732: 'Left angular gyrus', FJ1733: 'Right angular gyrus',
  FJ1739: 'Left cingulate gyrus', FJ1740: 'Right cingulate gyrus', FJ1748: 'Left insula', FJ1749: 'Right insula',
  FJ1789: 'Left middle temporal gyrus', FJ1790: 'Right middle temporal gyrus', FJ1746: 'Left inferior temporal gyrus', FJ1747: 'Right inferior temporal gyrus',
  FJ1783: 'Left fusiform gyrus', FJ1784: 'Right fusiform gyrus', FJ1785: 'Left parahippocampal gyrus', FJ1786: 'Right parahippocampal gyrus',
  FJ1759: 'Left hippocampus', FJ1807: 'Right hippocampus', FJ1760: 'Hypothalamus', FJ1808: 'Hypothalamus',
  FJ1791: 'Left occipital lobe', FJ1792: 'Right occipital lobe', FJ1750: 'Left internal capsule', FJ1751: 'Right internal capsule',
  FJ1758: 'White matter of left cerebral hemisphere', FJ1806: 'White matter of right cerebral hemisphere',
  FJ1770: 'Midbrain', FJ1817: 'Midbrain', FJ1775: 'Pons', FJ1822: 'Pons', FJ1769: 'Medulla oblongata', FJ1831: 'Medulla oblongata',
  FJ1781: 'Cerebellum', FJ1830: 'Cerebellum'
});

// One row per kind of link. `same`: drawn in each half (from and to in the same half). `across`: from one half to the
// same or another region of the OTHER half (crosses the midline). kind: 'short' neighbouring gyri, 'long' a named
// long bundle of one half, 'callosal' between the halves, 'down' a route out of the cortex, 'up' a route into it.
// Where the fibres change sides is DATA, not only words: `cross` names the region in which they cross and when
// ('on the way': between two stations of this link, so its ends are in different halves; 'at the end': below the last
// mesh named, as the fibres go on into the cord; 'before the start': already in the cord, before the first mesh named).
// `right`: other words for the right half where the left half's would claim too much (speech is made on the left in
// most people).
const LINK_ROWS = [
  // --- the motor strip (precentral gyrus) and the sensory strip (postcentral gyrus) first
  { from: 'precentral', to: 'postcentral', mode: 'same', kind: 'short', both: true, name: 'short fibres under the central sulcus (U-fibres)', plain: 'the motor strip and the touch strip behind it talk across the groove between them', src: 'WIKI_TRACTS OPENSTAX_AP' },
  { from: 'superior_frontal', to: 'precentral', mode: 'same', kind: 'short', both: true, name: 'fibres from the supplementary motor area (on the superior frontal gyrus) to the motor strip', plain: 'the planning area on top of the brain to the motor strip', src: 'OPENSTAX_AP WIKI_TRACTS' },
  { from: 'middle_frontal', to: 'precentral', mode: 'same', kind: 'short', both: true, name: 'fibres from the premotor area (on the middle frontal gyrus) to the motor strip', plain: 'the get-ready area in front of the motor strip to the motor strip', src: 'OPENSTAX_AP WIKI_TRACTS' },
  { from: 'inferior_frontal', to: 'precentral', mode: 'same', kind: 'short', both: true, name: 'fibres from the lower premotor and speech-movement area (inferior frontal gyrus) to the face part of the motor strip', plain: 'the speech-movement area to the mouth part of the motor strip', src: 'OPENSTAX_AP WIKI_TRACTS',
    right: { name: 'fibres from the lower premotor area (inferior frontal gyrus) to the face part of the motor strip', plain: 'from the lower frontal area to the mouth part of the motor strip just behind it' } },
  { from: 'postcentral', to: 'superior_parietal', mode: 'same', kind: 'short', both: true, name: 'fibres from the sensory strip to the superior parietal lobule', plain: 'the touch strip to the area behind it that keeps track of where the limbs are', src: 'WIKI_TRACTS' },
  { from: 'postcentral', to: 'supramarginal', mode: 'same', kind: 'short', both: true, name: 'fibres from the sensory strip to the supramarginal gyrus (inferior parietal lobule)', plain: 'the touch strip to the area below and behind it', src: 'WIKI_TRACTS' },
  { from: 'superior_parietal', to: 'superior_frontal', mode: 'same', kind: 'long', both: true, name: 'superior longitudinal fasciculus, upper part (SLF I)', plain: 'a long bundle from the top of the parietal lobe to the planning areas in front of the motor strip', src: 'WIKI_TRACTS' },
  { from: 'angular', to: 'middle_frontal', mode: 'same', kind: 'long', both: true, name: 'superior longitudinal fasciculus, middle part (SLF II)', plain: 'a long bundle from the back of the parietal lobe to the side of the frontal lobe', src: 'WIKI_TRACTS' },
  { from: 'supramarginal', to: 'inferior_frontal', mode: 'same', kind: 'long', both: true, name: 'superior longitudinal fasciculus, lower part (SLF III)', plain: 'a long bundle from the lower parietal lobe to the lower frontal lobe', src: 'WIKI_TRACTS' },
  { from: 'precentral', to: 'precentral', mode: 'across', kind: 'callosal', both: true, name: 'corpus callosum: the two motor strips', plain: 'the motor strips of the two halves, joined through the great bridge of the brain', src: 'OPENSTAX_AP WIKI_TRACTS' },
  { from: 'postcentral', to: 'postcentral', mode: 'across', kind: 'callosal', both: true, name: 'corpus callosum: the two sensory strips', plain: 'the touch strips of the two halves, joined through the great bridge of the brain', src: 'OPENSTAX_AP WIKI_TRACTS' },
  { from: 'superior_frontal', to: 'superior_frontal', mode: 'across', kind: 'callosal', both: true, name: 'corpus callosum: the two supplementary motor areas', plain: 'the planning areas of the two halves, joined through the great bridge of the brain', src: 'OPENSTAX_AP WIKI_TRACTS' },
  { from: 'precentral', to: 'medulla', via: ['internal_capsule', 'midbrain', 'pons'], mode: 'same', kind: 'down', both: false, name: 'corticospinal tract (through the internal capsule, the cerebral peduncle of the midbrain and the pons to the pyramid of the medulla)', plain: 'the command route from the motor strip down through the brainstem', src: 'OPENSTAX_AP',
    cross: { in: 'medulla', when: 'at the end', share: 'most', plain: 'most of the fibres cross to the other side at the very bottom of the medulla, just above the cord', name: 'pyramidal decussation' },
    note: 'Most of its fibres cross to the other side at the very bottom of the medulla (the pyramidal decussation), below the last mesh named here, and run down the cord on that side; the rest cross lower, in the cord.' },
  { from: 'precentral', to: 'medulla', via: ['internal_capsule', 'midbrain', 'pons'], mode: 'same', kind: 'down', both: false, name: 'corticobulbar tract: the fibres that stay on their own side (through the internal capsule and the midbrain to the motor nuclei of the cranial nerves in the pons and the medulla)', plain: 'the command route from the face part of the motor strip to the brainstem\'s own nerve centres for the face, jaw, tongue and throat, on the same side', src: 'WIKI_TRACTS',
    note: 'With the crossing fibres of the next link, most of these nerve centres are driven from both halves. The centres for the lower face (and for one tongue muscle) get only the crossing fibres. The centres of nerves V and VII lie in the pons, a way-station here; those of IX, X and XII in the medulla.' },
  { from: 'precentral', to: 'pons', via: ['internal_capsule', 'midbrain'], mode: 'across', kind: 'down', both: false, name: 'corticobulbar tract: the fibres that cross (to the motor nuclei of the cranial nerves of the opposite side)', plain: 'the same command route, crossing to the nerve centres of the opposite side', src: 'WIKI_TRACTS',
    cross: { in: 'pons', when: 'on the way', share: 'about half', plain: 'about half of the fibres cross in the brainstem, each near the nerve centre it ends in', name: 'crossing of the corticobulbar fibres' },
    note: 'Drawn to the opposite half of the pons, where the nerve centre of the face (VII) lies: the lower face is driven by these crossing fibres only. The crossing fibres for the jaw (V, also in the pons) and for the throat and the tongue (IX, X, XII, in the medulla, one tongue muscle from the opposite side only) are not drawn apart. The way-stations named before the crossing are those of the starting half.' },
  { from: 'precentral', to: 'cerebellum', via: ['internal_capsule', 'midbrain', 'pons'], mode: 'across', kind: 'down', both: false, name: 'cortico-ponto-cerebellar pathway (to the pons, then across in the middle cerebellar peduncle)', plain: 'a copy of the command goes to the pons and across to the opposite half of the little brain', src: 'OPENSTAX_AP WIKI_TRACTS',
    cross: { in: 'pons', when: 'on the way', share: 'all', plain: 'the fibres cross in the pons', name: 'crossing of the pontocerebellar fibres' },
    note: 'The way-stations named are those of the starting half; the crossing is in the pons.' },
  { from: 'cerebellum', to: 'precentral', via: ['midbrain', 'internal_capsule'], mode: 'across', kind: 'up', both: false, name: 'cerebello-thalamo-cortical pathway (superior cerebellar peduncle, crossing in the midbrain, then by the thalamus to the motor cortex)', plain: 'the little brain\'s corrections come back up to the opposite motor strip', src: 'OPENSTAX_AP WIKI_TRACTS',
    cross: { in: 'midbrain', when: 'on the way', share: 'all', plain: 'the fibres cross in the midbrain', name: 'decussation of the superior cerebellar peduncles' },
    note: 'Its relay, the thalamus, is not in the atlas; the way-stations named are those of the arriving half.' },
  { from: 'medulla', to: 'postcentral', via: ['medulla', 'pons', 'midbrain', 'internal_capsule'], mode: 'across', kind: 'up', both: false, name: 'medial lemniscus and thalamocortical fibres (the dorsal column route of touch and position sense)', plain: 'the body\'s report of touch and position crosses in the medulla and climbs through the brainstem to the opposite touch strip', src: 'OPENSTAX_AP',
    cross: { in: 'medulla', when: 'on the way', share: 'all', plain: 'the fibres cross inside the medulla', name: 'sensory decussation (the start of the medial lemniscus)' },
    note: 'It starts in the half of the medulla on the body\'s own side (the report came up the cord on that side), crosses inside the medulla, and climbs in the other half; the way-stations named are those of the arriving half. Its relay, the thalamus, is not in the atlas.' },
  { from: 'medulla', to: 'postcentral', via: ['pons', 'midbrain', 'internal_capsule'], mode: 'same', kind: 'up', both: false, name: 'spinothalamic tract and thalamocortical fibres (the route of pain and temperature)', plain: 'the body\'s report of pain, heat and cold climbs through the brainstem to the touch strip', src: 'OPENSTAX_AP',
    cross: { in: 'cord', when: 'before the start', share: 'all', plain: 'the fibres crossed in the cord, near the level where they came in', name: 'crossing in the cord (anterior white commissure)' },
    note: 'It crossed in the cord, so the half named is the one opposite the body side it reports. Its relay, the thalamus, is not in the atlas.' },
  // --- a modest set of the best-known long bundles, so the resting picture is a network
  { from: 'inferior_frontal', to: 'middle_temporal', via: ['supramarginal'], mode: 'same', kind: 'long', both: true, name: 'arcuate fasciculus', plain: 'the arching bundle between the speech areas of the frontal and temporal lobes', src: 'WIKI_TRACTS',
    right: { plain: 'the arching bundle between the lower frontal lobe and the temporal lobe' },
    note: 'Its main temporal end is the back of the superior temporal gyrus, which this atlas has no mesh for; it also reaches the middle temporal gyrus, the mesh named.' },
  { from: 'cingulate', to: 'parahippocampal', mode: 'same', kind: 'long', both: true, name: 'cingulum', plain: 'the belt bundle round the middle of the brain, down to the memory areas', src: 'WIKI_TRACTS' },
  { from: 'inferior_frontal', to: 'inferior_temporal', mode: 'same', kind: 'long', both: true, name: 'uncinate fasciculus', plain: 'the hooked bundle between the underside of the frontal lobe and the front of the temporal lobe', src: 'WIKI_TRACTS',
    note: 'It joins the front of the temporal lobe (the temporal pole, the front of the parahippocampal gyrus) with the orbital gyri and the inferior frontal gyrus. The temporal pole and the orbital gyri have no mesh in this atlas: it is tied to the nearest meshes.' },
  { from: 'occipital', to: 'inferior_temporal', mode: 'same', kind: 'long', both: true, name: 'inferior longitudinal fasciculus', plain: 'a long bundle from the seeing area at the back to the temporal lobe', src: 'WIKI_TRACTS OPENSTAX_AP' },
  { from: 'occipital', to: 'inferior_frontal', mode: 'same', kind: 'long', both: true, name: 'inferior fronto-occipital fasciculus', plain: 'a long bundle from the seeing area at the back to the frontal lobe', src: 'WIKI_TRACTS' },
  { from: 'occipital', to: 'superior_parietal', mode: 'same', kind: 'short', both: true, name: 'occipito-parietal association fibres (the "where" stream of vision)', plain: 'from the seeing area up to the area that guides movement by sight', src: 'OPENSTAX_AP' },
  { from: 'hippocampus', to: 'hypothalamus', mode: 'same', kind: 'long', both: false, name: 'fornix', plain: 'the arch from the memory area to the hypothalamus', src: 'WIKI_TRACTS',
    note: 'The hippocampus\'s main way out. Its end in the mammillary bodies lies in the hypothalamus mesh.' },
  { from: 'middle_frontal', to: 'middle_frontal', mode: 'across', kind: 'callosal', both: true, name: 'corpus callosum: the two middle frontal gyri', plain: 'the frontal lobes of the two halves, joined through the great bridge of the brain', src: 'OPENSTAX_AP WIKI_TRACTS' },
  { from: 'superior_parietal', to: 'superior_parietal', mode: 'across', kind: 'callosal', both: true, name: 'corpus callosum: the two superior parietal lobules', plain: 'the parietal lobes of the two halves, joined through the great bridge of the brain', src: 'OPENSTAX_AP WIKI_TRACTS' },
  { from: 'occipital', to: 'occipital', mode: 'across', kind: 'callosal', both: true, name: 'corpus callosum: the two occipital lobes', plain: 'the seeing areas of the two halves, joined through the great bridge of the brain', src: 'OPENSTAX_AP WIKI_TRACTS' },
  { from: 'middle_temporal', to: 'middle_temporal', mode: 'across', kind: 'callosal', both: true, name: 'corpus callosum and anterior commissure: the two temporal lobes', plain: 'the temporal lobes of the two halves, joined across the midline', src: 'WIKI_TRACTS' }
];

function buildBrainLinks() {
  const out = [];
  const id = (region, half) => BRAIN_REGIONS[region][half];
  // where the fibres change sides, as data: crossesAt = [the mesh on the side they come from, the mesh on the side they
  // go to] (the two halves of the region they cross in), crossing = { when, share, name, plain }
  const crossOf = (r, h) => (r.cross ? { ...(r.cross.in !== 'cord' ? { crossesAt: [id(r.cross.in, h), id(r.cross.in, 1 - h)] } : {}), crossing: { in: r.cross.in, when: r.cross.when, share: r.cross.share, name: r.cross.name, plain: r.cross.plain } } : {});
  for (const r of LINK_ROWS) {
    const words = h => ({ name: (h === 1 && r.right && r.right.name) || r.name, plain: (h === 1 && r.right && r.right.plain) || r.plain });
    const base = { kind: r.kind, bothWays: Boolean(r.both), src: C(r.src), ...(r.note ? { note: r.note } : {}) };
    if (r.mode === 'same') {
      for (const h of [0, 1]) out.push({ from: id(r.from, h), to: id(r.to, h), ...words(h), ...base, crosses: false, half: h ? 'right' : 'left', ...(r.via ? { via: r.via.map(v => id(v, h)) } : {}), ...crossOf(r, h) });
    } else if (r.from === r.to && r.kind === 'callosal') {
      // the same region of the two halves: one link, drawn as an arc over the midline (the atlas has no corpus callosum)
      out.push({ from: id(r.from, 0), to: id(r.to, 1), ...words(0), ...base, crosses: true, half: 'both', drawnAs: 'arc', crossesAt: [id(r.from, 0), id(r.to, 1)],
        crossing: { in: 'corpus callosum', when: 'on the way', share: 'all', name: 'corpus callosum', plain: 'the fibres cross in the great bridge between the two halves' },
        note: [r.note, 'The atlas has no corpus callosum mesh: draw the link as an arc over the midline.'].filter(Boolean).join(' ') });
    } else {
      // a route that changes sides: from each half to the other. Way-stations before the crossing are those of the
      // starting half, after it those of the arriving half: a route down crosses after its last way-station unless its
      // crossing region is itself a way-station (then from that station on); a route up crosses before its first.
      for (const h of [0, 1]) {
        let via;
        if (r.via) {
          const k = r.kind === 'up' ? 0 : (r.cross && r.via.includes(r.cross.in) ? r.via.indexOf(r.cross.in) + 1 : r.via.length);
          via = r.via.map((v, i) => id(v, i < k ? h : 1 - h));
        }
        out.push({ from: id(r.from, h), to: id(r.to, 1 - h), ...words(h), ...base, crosses: true, half: h ? 'right-to-left' : 'left-to-right', ...(via ? { via } : {}), ...crossOf(r, h) });
      }
    }
  }
  return deepFreeze(out);
}
/**
 * Typical links between brain meshes: [{ from, to, name, plain, crosses, via?, kind, bothWays, half, drawnAs?,
 * crossesAt?, crossing?, src, note? }]. crosses: whether the link's two ends are in different halves. Where the fibres
 * change sides is given as data too: crossing = { in, when, share, name, plain } with when 'on the way' (inside this
 * link's own run), 'at the end' (below its last mesh: the corticospinal fibres cross at the bottom of the medulla and
 * go on down the cord on the other side) or 'before the start' (already in the cord: pain and temperature); and
 * crossesAt = [mesh on the side the fibres come from, mesh on the side they go to], the two halves of the region they
 * cross in (absent when that is the cord).
 */
export const BRAIN_LINKS = buildBrainLinks();

// ---------------------------------------------------------------------------------------------------------------------
// BEGIN GENERATED COURSES (tools/build-wiring-courses.mjs over the body as the page prepares it; regenerate, do not
// hand-edit). Points are millimetres in WIRING_FRAME. canal: [vertebral coordinate, x, y, z] the centre of the
// vertebral canal; exits: where each spinal nerve leaves the column (right side); courses: [segment, x, y, z] per point;
// rules: how each course was laid; twigFrom: [first, last?] the course points of a cranial nerve a twig to a muscle may
// leave from (none inside the skull); rootJoin: { trunk: { level: index } } the course point each root joins its
// bundle at; bones: the long bones of the right limbs as capsules (axis ends, shaft radius; for the tests); outline:
// the body's outline round each limb's axis (for the tests); muscles: [mesh id, name, alias, side,
// segment, x, y, z] the point in each muscle where its nerve ends; check: what the generator measured (rigPivots = the
// rig this block was laid over). Frozen. LICENCE: unlike the rest of this module (project code, CC0 1.0), the points
// of this block are data derived from the atlas meshes and the vessel centre lines: CC BY 4.0 (BodyParts3D, (c) The
// Database Center for Life Science) and, for the points laid on or in Z-Anatomy muscles, CC BY-SA 4.0 (Z-Anatomy);
// see CREDITS-AND-LICENCES.md.
export const WIRING_GENERATED = deepFreeze({
  canal: [[-1,-0.9,-67.7,1493.9],[-0.5,-0.9,-63.8,1486.6],[0,-0.9,-60.9,1478.3],[0.5,-0.9,-61.1,1471.3],[1,-0.9,-61.5,1462.9],[1.5,-0.8,-61.9,1452.4],[2,-0.6,-63.5,1447.5],[2.5,-0.3,-65.1,1434.7],[3,-0.2,-65.4,1432.1],[3.5,-0.1,-65.6,1421.3],[4,-0.3,-67,1416.7],[4.5,-0.4,-68.4,1405.7],[5,-0.3,-67.7,1401.3],[5.5,-0.1,-67,1391.8],[6,-0.1,-65.8,1385.9],[6.5,-0.1,-64.5,1378.8],[7,-0.8,-61.9,1370.5],[7.5,-1.4,-59.3,1362.1],[8,-0.9,-56.8,1354.4],[8.5,-0.5,-54.2,1346.7],[9,-0.2,-50.2,1335.8],[9.5,0.1,-46.2,1324.9],[10,0,-41.7,1312.9],[10.5,-0.1,-37.2,1300.8],[11,-0.6,-35.2,1287.8],[11.5,-1.2,-33.2,1274.8],[12,-1.5,-31.5,1261.1],[12.5,-1.8,-29.9,1247.5],[13,-1,-29.1,1233],[13.5,-0.2,-28.3,1218.5],[14,-0.7,-29.8,1204.3],[14.5,-1.2,-31.4,1190.1],[15,-0.9,-33.4,1177.1],[15.5,-0.6,-35.4,1164.1],[16,-0.7,-38.4,1148.9],[16.5,-0.9,-41.4,1133.8],[17,-0.5,-45.1,1120.6],[17.5,-0.1,-48.8,1107.4],[18,-0.6,-53.3,1093],[18.5,-1.2,-57.9,1078.5],[19,-1.1,-63,1062.4],[19.5,-0.9,-68.1,1046.4],[20,-1.2,-70.4,1032.5],[20.5,-1.5,-72.8,1018.7],[21,-1.4,-71.9,1004.6],[21.5,-1.3,-71,990.6],[22,-0.6,-67.6,977.1],[22.5,0.2,-64.3,963.7],[23,-0.6,-57.1,948.6],[23.5,-1.4,-49.9,933.6],[24,-0.3,-49.9,926.8],[24.5,-0.3,-27.4,892.8],[25,-0.3,-4,858.8],[25.5,-0.3,-10.2,824.8],[26,-0.3,-15.3,790.8]],
  canalHalfWidth: {"0.5":17.8,"1.5":10.2,"2.5":12.7,"3.5":9.9,"4.5":11.3,"5.5":12,"6.5":12.3,"7.5":12.6,"8.5":10.9,"9.5":9.2,"10.5":7.6,"11.5":8.2,"12.5":7.4,"13.5":9.8,"14.5":10.3,"15.5":11.2,"16.5":11.5,"17.5":13,"18.5":9,"19.5":11.8,"20.5":12.1,"21.5":10.3,"22.5":10.3,"23.5":12.5},
  exits: {
    C1: [-17.9,-59.9,1478.3],
    C2: [-17.9,-63.5,1462.9],
    C3: [-18,-65.5,1447.5],
    C4: [-15.6,-70.4,1432.1],
    C5: [-14.9,-69,1416.7],
    C6: [-15.9,-69.7,1401.3],
    C7: [-16.3,-67.8,1388.9],
    C8: [-17.2,-60.9,1373.5],
    T1: [-16.7,-58.8,1357.4],
    T2: [-16.2,-52.2,1335.8],
    T3: [-14.4,-43.7,1312.9],
    T4: [-14.6,-37.2,1287.8],
    T5: [-13.4,-33.5,1261.1],
    T6: [-15.6,-28.1,1233],
    T7: [-14.7,-31.8,1204.3],
    T8: [-15.6,-35.4,1177.1],
    T9: [-16.1,-40.4,1148.9],
    T10: [-16.8,-47.1,1120.6],
    T11: [-15.7,-55.3,1093],
    T12: [-15.5,-65,1062.4],
    L1: [-17.2,-72.4,1032.5],
    L2: [-16.6,-73.9,1004.6],
    L3: [-16.9,-69.6,977.1],
    L4: [-16,-62.1,948.6],
    L5: [-13.3,-51.9,926.8],
    S1: [-22.3,-68.5,892.8],
    S2: [-20.3,-22.6,865.6],
    S3: [-18.3,-13.7,838.4],
    S4: [-16.3,-27.2,811.2],
  },
  courses: {
    r_oculomotor: [["skull",-3.5,-92.7,1534],["skull",-11,-105,1529],["skull",-14,-116.4,1532.2],["skull",-22.7,-135.5,1532.6]],
    r_mandibular_v3: [["skull",-20.8,-80,1517],["skull",-24,-93,1516],["skull",-27,-101,1511],["skull",-31,-112.3,1496.2]],
    r_mylohyoid_nerve: [["skull",-31,-112.3,1496.2],["mandible",-32.8,-113.8,1467.1],["mandible",-21.7,-129.9,1449.3],["mandible",-19.1,-138.9,1440.9],["mandible",-10.7,-145.9,1432.6]],
    r_facial: [["skull",-18.7,-73.8,1504],["skull",-31,-72,1508],["skull",-43,-82,1510],["skull",-47.5,-77.8,1492.2],["skull",-47.5,-92.5,1478.5],["mandible",-48.2,-108,1476.3]],
    r_facial_posterior_auricular: [["skull",-47.5,-77.8,1492.2],["skull",-64.6,-68.7,1489.8],["skull",-66.6,-60.4,1501.4],["skull",-55.4,-51.1,1507.2],["skull",-53.8,-45.2,1511.2],["skull",-53.4,-37.1,1512.1],["skull",-56.8,-30.1,1510.4],["skull",-52.4,-16.5,1511.8],["skull",-45.7,-2.8,1516.5],["skull",-37.4,6.9,1522.1],["skull",-29.6,14.5,1527.5]],
    r_facial_temporal: [["mandible",-48.2,-108,1476.3],["mandible",-55.6,-113.3,1485],["skull",-61.5,-118.3,1494.1],["skull",-64.7,-119.4,1500.5],["skull",-64.6,-122.3,1502.7],["skull",-65.1,-126.1,1506.8],["skull",-55.9,-122.1,1516.4],["skull",-54.3,-124.1,1521.7],["skull",-55.4,-129,1526.3],["skull",-52.5,-134.7,1529.6],["skull",-51.9,-143.6,1532.3],["skull",-53.3,-156.5,1534.9],["skull",-49,-161.3,1538.8],["skull",-45.2,-166.8,1542.5],["skull",-40.5,-169.9,1546.1],["skull",-36.4,-173.3,1549.5],["skull",-32.3,-176.1,1552.7],["skull",-32.8,-174.3,1558.6],["skull",-34,-174.3,1564.7],["skull",-35,-173.8,1570.8]],
    r_facial_zygomatic: [["mandible",-48.2,-108,1476.3],["mandible",-58.7,-115.7,1484],["skull",-63.4,-122,1492.9],["skull",-67.1,-127.8,1501.4],["skull",-58.4,-139,1504],["skull",-53,-151.8,1508.9],["skull",-47,-157.5,1510.6],["skull",-40.7,-162.8,1512.2]],
    r_facial_buccal: [["mandible",-48.2,-108,1476.3],["mandible",-55.7,-119.8,1477.9],["skull",-58,-130.1,1480.6],["mandible",-52.3,-137.9,1475],["skull",-45.1,-145,1469.4],["skull",-37.3,-151.6,1464],["skull",-33.8,-161.1,1470.9],["skull",-28.2,-162.3,1484.1],["skull",-24.7,-168.5,1497.1]],
    r_facial_mandibular: [["mandible",-48.2,-108,1476.3],["mandible",-51.1,-115.7,1465.8],["mandible",-47.1,-123.3,1453.1],["mandible",-50.7,-140.9,1446.3],["mandible",-36.9,-150.2,1442.2],["mandible",-27.2,-158.9,1438.4],["mandible",-21.2,-169.3,1444.4]],
    r_facial_cervical: [["mandible",-48.2,-108,1476.3],["cervical",-55,-111.9,1426.2],["cervical",-54.6,-113,1415.4],["cervical",-49.1,-111.4,1406.2],["cervical",-50.7,-113.5,1394.5],["cervical",-55.1,-117.5,1379.2]],
    r_glossopharyngeal: [["skull",-13,-73,1500],["skull",-30,-74,1491],["cervical",-31,-90,1468],["cervical",-24,-106,1452]],
    r_vagus: [["skull",-12.5,-67.8,1494],["skull",-30,-72,1490],["cervical",-30,-88,1452],["cervical",-31,-94,1412],["cervical",-29,-97,1372],["thorax",-27,-100,1336]],
    r_accessory: [["cervical",-5.8,-67,1416.8],["cervical",-6,-64.3,1441.3],["cervical",-6.4,-61.1,1471.3],["skull",-9.9,-61.5,1482],["skull",-24,-71,1495],["skull",-30,-70,1488],["cervical",-39,-68,1467],["cervical",-50.2,-86.1,1450.8],["cervical",-59.3,-43,1394.6],["r_girdle",-81.7,-24.7,1353.3],["r_girdle",-52.5,0.9,1288.8],["t7",-28.6,5.5,1217.3]],
    r_hypoglossal: [["skull",-6.4,-74.2,1488],["skull",-15,-70,1486],["cervical",-27,-85,1463],["hyoid",-21.9,-94.9,1449.3],["mandible",-11.4,-132.4,1445.5],["mandible",-9.4,-148.4,1447.5]],
    r_cervical_plexus: [["cervical",-24.9,-67.5,1462.9],["cervical",-27,-70.5,1447.5],["cervical",-26.6,-73.6,1434.1],["cervical",-25.6,-76.4,1432.1]],
    r_c1_with_hypoglossal: [["cervical",-24.9,-67.5,1462.9],["cervical",-26,-77.1,1463],["cervical",-27,-85,1461],["hyoid",-21.9,-94.9,1447.3],["mandible",-11.4,-132.4,1441.5],["hyoid",-3.3,-138.8,1430]],
    r_ansa_cervicalis: [["cervical",-27,-70.5,1447.5],["cervical",-31,-98,1418],["cervical",-20.5,-111.5,1381.1],["cervical",-17.1,-113.3,1347.6]],
    r_phrenic: [["cervical",-25.6,-76.4,1432.1],["cervical",-37.4,-97.1,1378.7],["thorax",-48,-100.3,1342.4],["t3",-34,-108,1305],["t6",-46,-112,1245],["t8",-50,-108,1190],["t9",-46,-102,1152]],
    r_cervical_muscular: [["cervical",-22.2,-70.4,1446.3],["cervical",-16.2,-77.7,1427.6],["cervical",-19.6,-75,1417.4],["cervical",-27.3,-73.6,1399.3],["cervical",-22.3,-72.8,1388.9],["cervical",-20.6,-72.6,1382.5],["cervical",-26.8,-65.5,1372.9]],
    r_brachial_plexus: [["cervical",-31.4,-79.9,1381.1],["r_rib1",-63.2,-86.2,1362.4],["r_clav",-82.6,-85.8,1337.3],["r_clav",-89.8,-91.6,1335],["r_girdle",-126.1,-89.3,1315.6],["r_girdle",-142,-82.7,1285.7],["r_upperarm",-148,-83.2,1261.2]],
    r_dorsal_scapular: [["cervical",-31.4,-79.9,1381.1],["r_girdle",-59.3,-31.3,1354.6],["r_girdle",-30.7,-16.3,1335.8],["r_girdle",-48.3,-6.1,1276.5]],
    r_long_thoracic: [["cervical",-31.4,-79.9,1381.1],["r_rib2",-74.6,-68.3,1342.7],["r_rib2",-74.7,-68.3,1333.9],["r_rib3",-98.6,-66.4,1314],["r_rib3",-110.1,-61.3,1297.8],["r_rib5",-131.4,-82.3,1240.8],["r_rib6",-140.1,-105.3,1190.8],["r_rib7",-140.6,-106.6,1153.1]],
    r_suprascapular: [["r_rib1",-63.2,-86.2,1362.4],["r_girdle",-100,-59.6,1346.6],["r_girdle",-138.1,-48.9,1326.7],["r_girdle",-155.8,-47.2,1315],["r_girdle",-119.4,-35.3,1300.4]],
    r_lateral_pectoral: [["r_girdle",-126.1,-89.3,1315.6],["r_girdle",-118.7,-101.3,1309.4],["r_rib3",-112.6,-111,1304.4]],
    r_medial_pectoral: [["r_girdle",-142,-82.7,1285.7],["r_rib3",-103.2,-111.4,1276],["r_rib3",-88.6,-132.8,1252.9]],
    r_upper_subscapular: [["r_girdle",-142,-82.7,1285.7],["r_girdle",-118.4,-67.3,1304.3]],
    r_lower_subscapular: [["r_girdle",-142,-82.7,1285.7],["r_girdle",-119.1,-53.1,1272.9],["r_girdle",-143,-38.9,1245]],
    r_thoracodorsal: [["r_girdle",-142,-82.7,1285.7],["r_girdle",-153.8,-50.5,1226.3],["r_rib7",-138.3,-37.5,1179],["r_rib9",-125,-24.6,1130.4]],
    r_axillary: [["r_upperarm",-148,-83.2,1261.2],["r_upperarm",-163.1,-57,1262.3],["r_upperarm",-181.6,-56.9,1252.3],["r_upperarm",-202.1,-72.3,1248.3],["r_upperarm",-201.9,-80.1,1242.4]],
    r_musculocutaneous: [["r_girdle",-142,-82.7,1285.7],["r_upperarm",-159.1,-82.9,1242],["r_upperarm",-199.2,-83.9,1138.3],["r_upperarm",-215.8,-84.4,1075.2],["r_upperarm",-235.6,-76.9,1004.3]],
    r_radial: [["r_upperarm",-148,-83.2,1261.2],["r_upperarm",-186.1,-63.2,1211.2],["r_upperarm",-198.9,-56.7,1162.6],["r_upperarm",-218.7,-53.2,1120.5],["r_upperarm",-230,-57.2,1075.2],["r_upperarm",-231.8,-67.7,1029.8],["r_upperarm",-247.5,-73.7,993.6]],
    r_posterior_interosseous: [["r_upperarm",-247.5,-73.7,993.6],["r_radius",-247.8,-78.3,972.1],["r_radius",-251.1,-75.5,950.6],["r_radius",-256.1,-64.7,879.9],["r_radius",-256,-79.6,822.8],["r_radius",-263.7,-103.3,761.4],["r_radius",-265.6,-116.3,721.8]],
    r_median: [["r_upperarm",-148,-83.2,1261.2],["r_upperarm",-169.4,-79.5,1188.5],["r_upperarm",-190.8,-84.9,1090.6],["r_upperarm",-213.5,-86.7,993.1],["r_forearm",-239.8,-95.5,937.8],["r_forearm",-239.7,-100.2,859],["r_forearm",-251.3,-118.1,789.3],["r_forearm",-260.9,-134.8,733.5],["r_hand",-272.8,-135.6,698.6],["r_hand",-277.1,-143,667.7]],
    r_anterior_interosseous: [["r_forearm",-239.7,-100.2,859],["r_forearm",-248,-104.1,811.6],["r_forearm",-251.3,-118.5,765]],
    r_median_recurrent: [["r_hand",-272.8,-135.6,698.6],["r_thumb_mc",-301.4,-148,697.7]],
    r_ulnar: [["r_upperarm",-148,-83.2,1261.2],["r_upperarm",-172.5,-72.7,1175],["r_upperarm",-195.3,-72,1064.7],["r_upperarm",-191,-59.6,998.1],["r_upperarm",-192,-60.6,980.1],["r_forearm",-193.9,-73.5,923.5],["r_forearm",-224.9,-106.2,845.8],["r_forearm",-245.6,-122.6,766.8],["r_hand",-256.2,-141.6,701.6],["r_hand",-255.7,-139.1,690]],
    r_ulnar_deep: [["r_hand",-255.7,-139.1,690],["r_hand",-250,-137.9,676.4],["r_hand",-262.5,-136.8,670.1],["r_hand",-276.3,-134.2,670.9],["r_hand",-295.1,-136.2,667.8],["r_hand",-294.3,-137.6,673.5]],
    r_iliohypogastric: [["l2",-25.8,-74.7,1028.9],["l3",-44.4,-48.8,960.9],["pelvis",-105.7,-82.3,957.5],["pelvis",-117.7,-130.2,942.2],["pelvis",-59.9,-166.9,871.1]],
    r_lumbar_plexus: [["l2",-25.8,-74.7,1028.9],["l3",-28.1,-78,1000.7],["l4",-27.2,-79.3,972.9],["lumbar",-32.7,-68,944.1],["lumbar",-50.4,-69.5,930.8]],
    r_femoral: [["lumbar",-32.7,-68,944.1],["pelvis",-81.9,-100,905],["pelvis",-78.4,-102.1,865],["pelvis",-63.8,-114.3,823.2],["pelvis",-55.2,-128.8,791.6],["r_thigh",-48.2,-134.3,717.3],["r_thigh",-45.3,-136.2,630.2]],
    r_obturator: [["lumbar",-32.7,-68,944.1],["pelvis",-42.6,-86.6,918.8],["pelvis",-43.9,-89.1,857.3],["pelvis",-44.9,-91.2,807.1],["r_thigh",-52.1,-114.3,723.9],["r_thigh",-47.4,-104.4,605.5]],
    r_sacral_plexus: [["pelvis",-26.2,-65,908.1],["pelvis",-31.3,-74.5,892.8],["pelvis",-29.6,-46.3,871.7],["pelvis",-33.1,-29.7,864.4],["pelvis",-36.3,-19.7,838.4],["pelvis",-46.3,-35.2,815.2],["pelvis",-52.9,-35.4,815.7],["pelvis",-83.6,-47.4,823.2],["pelvis",-92.9,-48,814.6]],
    r_superior_gluteal: [["pelvis",-31.3,-74.5,892.8],["pelvis",-50.5,-52.2,858.8],["pelvis",-87.5,-46.4,846.7],["pelvis",-113.3,-63.6,868],["pelvis",-135.1,-82.1,825.4]],
    r_inferior_gluteal: [["pelvis",-92.9,-48,814.6],["pelvis",-99.2,-19.9,809.6]],
    r_nerve_to_obturator_internus: [["pelvis",-92.9,-48,814.6],["pelvis",-75.7,-40.4,813.8],["pelvis",-50.2,-34.3,811.6],["pelvis",-48.4,-60.5,809.3]],
    r_nerve_to_quadratus_femoris: [["pelvis",-92.9,-48,814.6],["pelvis",-78.8,-37,789.7],["pelvis",-80.1,-45.1,765.2]],
    r_sciatic: [["pelvis",-92.9,-48,814.6],["pelvis",-98,-46.4,781.9],["r_thigh",-65,-49.4,760],["r_thigh",-76.1,-55,710.3],["r_thigh",-79.4,-61.6,645.6],["r_thigh",-75.8,-60.6,580.9],["r_thigh",-75.5,-64.9,507]],
    r_tibial: [["r_thigh",-75.5,-64.9,507],["r_thigh",-71.6,-58.4,378.5],["r_shank",-76.9,-56.7,316],["r_shank",-88.9,-54.2,249.2],["r_shank",-77.1,-56.2,210],["r_shank",-60.4,-63,117.2],["r_shank",-55.7,-59.2,21.1],["r_shank",-48.2,-47.4,-60.1],["r_shank",-53.1,-58.5,-94.6],["r_foot",-42.6,-58,-128.5],["r_foot",-65.6,-86.5,-144.2]],
    r_medial_plantar: [["r_foot",-65.6,-86.5,-144.2],["r_foot",-76.9,-110.5,-156.5],["r_foot",-76,-156.6,-154.4]],
    r_lateral_plantar: [["r_foot",-65.6,-86.5,-144.2],["r_foot",-84.1,-93.5,-150.5],["r_foot",-93.1,-96.9,-154.7],["r_foot",-99.3,-99.2,-154.1],["r_foot",-126.7,-123,-163.4]],
    r_common_fibular: [["r_thigh",-75.5,-64.9,507],["r_thigh",-91.2,-59.6,420.1],["r_thigh",-101.4,-53.7,352.3],["r_shank",-107.5,-53.3,311.9],["r_shank",-109.1,-51.6,307.6],["r_shank",-113.4,-54.4,296.1],["r_shank",-113.9,-62.3,285.1],["r_shank",-110.3,-68,271.1]],
    r_deep_fibular: [["r_shank",-110.3,-68,271.1],["r_shank",-103.7,-76.6,245.4],["r_shank",-95.3,-97.6,162.7],["r_shank",-91.9,-95.2,77.9],["r_shank",-87.6,-91,-3.6],["r_shank",-87.3,-95.3,-34.2],["r_shank",-76.4,-94.7,-62],["r_shank",-79.9,-101.9,-80.3],["r_shank",-69.4,-95,-96.9],["r_foot",-82.5,-118.2,-109.9],["r_foot",-89.5,-153.8,-124.8]],
    r_superficial_fibular: [["r_shank",-110.3,-68,271.1],["r_shank",-113.9,-55.9,233.1],["r_shank",-115.3,-49,139.7],["r_shank",-108,-52.5,60.3]],
    r_intercostal_t1: [["thorax",-16.7,-58.8,1357.4],["r_rib1",-34.9,-72.1,1354.1],["r_rib1",-49.3,-81.1,1342],["r_rib1",-57,-93.1,1329.1],["r_rib1",-49,-108.9,1310.3],["r_cc1",-32.6,-116.7,1301.9]],
    r_intercostal_t2: [["t2",-16.2,-52.2,1335.8],["r_rib2",-55.7,-63.7,1337.9],["r_rib2",-80.2,-83.4,1319.6],["r_rib2",-76.4,-108.1,1293.9],["r_rib2",-48.9,-129.9,1273.9],["r_cc2",-25.8,-137,1271.4]],
    r_intercostal_t3: [["t3",-14.4,-43.7,1312.9],["t3",-24,-45.1,1315.3],["r_rib3",-65.3,-46.9,1316],["r_rib3",-95.3,-74.2,1295.6],["r_rib3",-93.3,-109.2,1268.9],["r_rib3",-55.9,-136.4,1246],["r_cc3",-27.8,-145.1,1242]],
    r_intercostal_t4: [["t4",-14.6,-37.2,1287.8],["t4",-24.6,-35.8,1291.5],["r_rib4",-76.5,-38.2,1287.5],["r_rib4",-103.5,-72.5,1263.7],["r_rib4",-102.2,-114.5,1236.5],["r_rib4",-66.5,-142.8,1213.8],["r_cc4",-32.2,-150.2,1214.2]],
    r_intercostal_t5: [["t5",-13.4,-33.5,1261.1],["t5",-24.3,-30.2,1266.1],["r_rib5",-80.1,-27.4,1257.4],["r_rib5",-112.3,-66.5,1231.7],["r_rib5",-116.5,-111.1,1204.2],["r_rib5",-87.3,-150.4,1177.7],["r_cc5",-39.8,-161.8,1183.2]],
    r_intercostal_t6: [["t6",-15.6,-28.1,1233],["t6",-27.2,-22.8,1235.6],["r_rib6",-85.6,-22,1222.9],["r_rib6",-118.1,-63.1,1197.7],["r_rib6",-123.4,-111.6,1168.2],["r_rib6",-96.2,-158.5,1144.2],["r_cc6",-41.4,-174.3,1157.1]],
    r_intercostal_t7: [["t7",-14.7,-31.8,1204.3],["t7",-26.2,-25.5,1206.4],["r_rib7",-84.9,-19.2,1191.5],["r_rib7",-115.7,-56.7,1166.3],["r_rib7",-126.7,-106,1139],["r_rib7",-108.7,-158.6,1113.1],["r_rib7",-45.8,-185,1115.6],["r_cc7",-58.8,-181.1,1140.6]],
    r_intercostal_t8: [["t8",-15.6,-35.4,1177.1],["t8",-32.6,-28.9,1175.9],["r_rib8",-77.9,-17.5,1159.2],["r_rib8",-107.9,-53.2,1134.8],["r_rib8",-122.4,-95.3,1107.8],["r_rib8",-116.1,-149,1081.7],["r_rib8",-94.4,-187.9,1079.4],["r_cc7",-50.8,-198.7,1092.8]],
    r_intercostal_t9: [["t9",-16.1,-40.4,1148.9],["t9",-32.9,-29.6,1146.5],["r_rib9",-73.7,-18.9,1127.2],["r_rib9",-102.5,-42.7,1105.1],["r_rib9",-118.2,-79.8,1078.6],["r_rib9",-117.1,-123.7,1054.1],["r_rib9",-113.3,-129.8,1053.4],["r_rib9",-100.4,-182.6,1048.1],["r_cc7",-56.7,-200.9,1055]],
    r_intercostal_t10: [["t10",-16.8,-47.1,1120.6],["t10",-28.6,-41.6,1119.5],["r_rib10",-70.8,-21.7,1095.7],["r_rib10",-96.6,-42.6,1068.5],["r_rib10",-112.4,-71,1046.7],["r_rib10",-113.7,-108.3,1026.4],["r_rib10",-110.5,-111.8,1025.1],["pelvis",-95.2,-165.7,1008.9],["pelvis",-59.5,-204.9,1003.4]],
    r_intercostal_t11: [["t11",-15.7,-55.3,1093],["t11",-65.1,-27,1068],["t11",-82.6,-41.6,1044.5],["t11",-96.3,-62.3,1025.5],["t11",-102.5,-88.5,1006.7],["pelvis",-98.7,-156.1,980.7],["pelvis",-54.3,-198.1,957.4]],
    r_subcostal: [["t12",-15.5,-65,1062.4],["t12",-41.8,-45.7,1056.2],["t12",-43.4,-52,1052.2],["t12",-49.8,-57,1042.7],["t12",-80.8,-58.8,1007.9],["pelvis",-106.3,-139.2,962.5],["pelvis",-52.9,-192.9,906.8]],
    r_dorsal_ramus_c2: [["cervical",-17.9,-63.5,1462.9],["cervical",-19.9,-47.5,1464.9],["skull",-6.7,-31,1467.7]],
    r_dorsal_ramus_c3: [["cervical",-18,-65.5,1447.5],["cervical",-23,-50.5,1442.5],["cervical",-31,-36.5,1435.5]],
    r_dorsal_ramus_c4: [["cervical",-15.6,-70.4,1432.1],["cervical",-20.6,-55.4,1427.1],["cervical",-28.6,-41.4,1420.1]],
    r_dorsal_ramus_c5: [["cervical",-14.9,-69,1416.7],["cervical",-14.4,-65.9,1414.3],["cervical",-19.9,-54,1411.7],["cervical",-27.9,-40,1404.7]],
    r_dorsal_ramus_c6: [["cervical",-15.9,-69.7,1401.3],["cervical",-20.9,-54.7,1396.3],["cervical",-28.9,-40.7,1389.3]],
    r_dorsal_ramus_c7: [["cervical",-16.3,-67.8,1388.9],["cervical",-21.3,-52.8,1383.9],["cervical",-29.3,-38.8,1376.9]],
    r_dorsal_ramus_c8: [["cervical",-17.2,-60.9,1373.5],["cervical",-22.2,-45.9,1368.5],["cervical",-30.2,-31.9,1361.5]],
    r_dorsal_ramus_t1: [["thorax",-16.7,-58.8,1357.4],["thorax",-21.7,-43.8,1352.4],["thorax",-29.7,-29.8,1345.4]],
    r_dorsal_ramus_t2: [["t2",-16.2,-52.2,1335.8],["t2",-21.2,-37.2,1330.8],["t2",-29.2,-23.2,1323.8]],
    r_dorsal_ramus_t3: [["t3",-14.4,-43.7,1312.9],["t3",-17.8,-31,1310.7],["t3",-19.4,-28.7,1307.9],["t3",-27.4,-14.7,1300.9]],
    r_dorsal_ramus_t4: [["t4",-14.6,-37.2,1287.8],["t4",-19.5,-26.9,1287.8],["t4",-19.6,-21.5,1282.1],["t4",-27.6,-8.2,1275.8]],
    r_dorsal_ramus_t5: [["t5",-13.4,-33.5,1261.1],["t5",-17.8,-19.2,1258.8],["t5",-18.4,-17.5,1256.1],["t5",-26.4,-4.5,1249.1]],
    r_dorsal_ramus_t6: [["t6",-15.6,-28.1,1233],["t6",-20.6,-13.1,1228],["t6",-28.6,0.9,1221]],
    r_dorsal_ramus_t7: [["t7",-14.7,-31.8,1204.3],["t7",-19.7,-16.8,1199.3],["t7",-27.7,-2.8,1192.3]],
    r_dorsal_ramus_t8: [["t8",-15.6,-35.4,1177.1],["t8",-20.6,-20.4,1172.1],["t8",-28.6,-6.4,1165.1]],
    r_dorsal_ramus_t9: [["t9",-16.1,-40.4,1148.9],["t9",-21.1,-25.4,1143.9],["t9",-29.1,-11.4,1136.9]],
    r_dorsal_ramus_t10: [["t10",-16.8,-47.1,1120.6],["t10",-21.8,-32.1,1115.6],["t10",-29.8,-18.1,1108.6]],
    r_dorsal_ramus_t11: [["t11",-15.7,-55.3,1093],["t11",-20.7,-40.3,1088],["t11",-28.7,-26.3,1081]],
    r_dorsal_ramus_t12: [["t12",-15.5,-65,1062.4],["t12",-21.6,-51.1,1058.6],["t12",-28.5,-36,1050.4]],
    r_dorsal_ramus_l1: [["l1",-17.2,-72.4,1032.5],["l1",-23,-62.8,1029.7],["l1",-22.9,-58.2,1027.5],["l1",-30.2,-43.4,1020.5]],
    r_dorsal_ramus_l2: [["l2",-16.6,-73.9,1004.6],["l2",-23.5,-66,1002.7],["l2",-22.3,-58.9,998.9],["l2",-29.6,-44.9,992.6]],
    r_dorsal_ramus_l3: [["l3",-16.9,-69.6,977.1],["l3",-16.4,-60.6,975.8],["l3",-22.4,-55.2,971.5],["l3",-29.9,-40.6,965.1]],
    r_dorsal_ramus_l4: [["l4",-16,-62.1,948.6],["l4",-14,-55.5,946.9],["l4",-21,-47.1,943.6],["l4",-29,-33.1,936.6]],
    r_dorsal_ramus_l5: [["lumbar",-13.3,-51.9,926.8],["lumbar",-13.9,-41.2,920.5],["lumbar",-18.3,-36.9,921.8],["lumbar",-26.3,-22.9,914.8]],
  },
  rules: {
    r_oculomotor: "Leaves the front of the midbrain, runs forward in the wall of the hollow beside the pituitary, enters the eye socket through the slit at its back and its upper branch runs forward over the eye to the muscle that lifts the lid. (The six muscles that turn the eyeball are not in this rig.)",
    r_mandibular_v3: "The trigeminal nerve leaves the side of the pons; its lower-jaw branch passes forward over the tip of the temporal bone's ridge (where its nerve-cell knot lies), drops out of the skull through the oval opening, and breaks up between the two pterygoid muscles, deep to the jaw's upright part.",
    r_mylohyoid_nerve: "A branch of the inferior alveolar nerve (itself a branch of the lower-jaw nerve), given off just before that nerve enters the jaw bone. Drawn from the lower-jaw nerve between the pterygoid muscles: down the inner side of the jaw's upright part and forward under the floor of the mouth to mylohyoid and the front belly of digastric.",
    r_facial: "Leaves the brainstem where the pons meets the medulla, crosses to the inner ear opening of the temporal bone, runs through that bone in its own canal (a sharp bend near the middle ear, then straight down), comes out of the skull between the styloid and mastoid processes, turns forward into the parotid gland behind the jaw and there divides into its face branches.",
    r_facial_posterior_auricular: "Leaves the facial nerve just below the skull and runs up behind the ear, over the mastoid process, then back over the outside of the skull to the muscle at the back of the scalp. It lies under the skin: every point is put on the outer surface.",
    r_facial_temporal: "Runs up from the parotid gland across the cheek-bone arch and over the temple to the side of the forehead. It lies under the skin: every point is put on the outer surface.",
    r_facial_zygomatic: "Runs forward and up from the parotid gland across the cheek bone to the outer corner of the eye. It lies under the skin: every point is put on the outer surface.",
    r_facial_buccal: "Runs straight forward from the parotid gland over the chewing muscle to the cheek, and on to the muscles of the nose and upper lip. It lies under the skin: every point is put on the outer surface.",
    r_facial_mandibular: "Runs down and forward from the parotid gland along the outside of the lower edge of the jaw to the muscles of the lower lip and chin. It lies under the skin: every point is put on the outer surface.",
    r_facial_cervical: "Runs down from the parotid gland behind the angle of the jaw into the thin sheet of muscle under the skin of the neck. It lies under the skin: every point is put on the outer surface.",
    r_glossopharyngeal: "Leaves the side of the medulla, passes out through the jugular opening with the vagus and accessory nerves, and curves forward between the great vessels to the side of the throat and the back of the tongue. (Its one muscle, stylopharyngeus, is not in this rig.)",
    r_vagus: "Leaves the side of the medulla, passes out through the jugular opening and runs straight down the neck between the great artery and vein, beside the throat and voice box, into the chest. (Drawn to the root of the neck; the muscles it moves are not in this rig.)",
    r_accessory: "Its fibres leave the side of the top five segments of the cord inside the canal and join into one strand that climbs beside the cord (drawn 5.5 mm to its side) through the skull's great opening; the nerve then turns outward, leaves the skull through the jugular opening, runs down and back across the side of the first cervical vertebra, through the deep side of sternocleidomastoid, across the hollow at the side of the neck and down the deep side of trapezius.",
    r_hypoglossal: "Leaves the front of the medulla, passes out through its own canal above the joint between skull and neck, runs down between the great vessels, then loops forward just above the tongue bone to the tongue. (The tongue's muscles are not in this rig.)",
    r_cervical_plexus: "Drawn as one bundle beside the upper cervical vertebrae, just outside the openings where C2, C3 and C4 leave the column, under sternocleidomastoid.",
    r_c1_with_hypoglossal: "Fibres of the first cervical nerve join the hypoglossal nerve just under the skull, ride forward with it, and leave it above the tongue bone as the twigs to thyrohyoid and geniohyoid.",
    r_ansa_cervicalis: "A loop on the great vessels of the neck, from C1 to C3: it hangs down to about the level of the voice box and sends twigs forward into the strap muscles.",
    r_phrenic: "Formed at the level of C4, runs down the front of the front scalene muscle, enters the chest behind the inner end of the collar bone and runs down beside the heart to the diaphragm. (The rig has no diaphragm: the course ends where its dome would be.)",
    r_cervical_muscular: "Short twigs from the front branches of the cervical nerves straight into the muscles they lie against: drawn as one short run down the side of the cervical column between longus colli in front and the scalene muscles at the side.",
    r_brachial_plexus: "Drawn as one bundle. Its roots (C5 to T1) meet between the front and middle scalene muscles at about the level of the seventh cervical vertebra; the bundle passes over the first rib behind the collar bone to the start of the axillary artery, then runs with that artery's centre line into the armpit (the plexus's cords lie round that artery).",
    r_dorsal_scapular: "Leaves the highest root of the bundle, runs back through the middle scalene and down under levator scapulae along the inner edge of the shoulder blade, under the two rhomboid muscles.",
    r_long_thoracic: "Leaves the roots of the bundle, runs down behind it and then straight down the side of the chest on the outer surface of serratus anterior.",
    r_suprascapular: "Leaves the upper part of the bundle above the collar bone, passes back through the notch in the upper edge of the shoulder blade into supraspinatus, then round the outer edge of the blade's spine into infraspinatus.",
    r_lateral_pectoral: "Leaves the bundle in the armpit and passes forward to the deep side of the upper part of pectoralis major.",
    r_medial_pectoral: "Leaves the bundle in the armpit, passes forward through pectoralis minor and ends in the lower part of pectoralis major.",
    r_upper_subscapular: "A short nerve from the back of the bundle into the upper part of subscapularis.",
    r_lower_subscapular: "A short nerve from the back of the bundle into the lower part of subscapularis and on to teres major.",
    r_thoracodorsal: "Leaves the back of the bundle and runs down the back wall of the armpit on the deep side of latissimus dorsi.",
    r_axillary: "Leaves the back of the bundle, passes backward under the shoulder joint, winds round the back of the neck of the humerus and ends on the deep side of the deltoid.",
    r_musculocutaneous: "Leaves the bundle high in the armpit, passes through coracobrachialis, then runs down the arm between biceps and brachialis to the outer side of the elbow.",
    r_radial: "Leaves the armpit behind the artery, passes between the heads of triceps, winds behind the humerus in its spiral groove from the inner to the outer side at mid-arm, comes forward through the outer wall of the arm and lies in front of the outer knob of the elbow, between brachialis and brachioradialis, where it divides.",
    r_posterior_interosseous: "The radial nerve's deep branch: it winds round the neck of the radius through the supinator muscle to the back of the forearm, runs down between the surface and deep layers of the muscles that straighten the fingers and thumb, then on the membrane between the two bones to the back of the wrist.",
    r_median: "Formed in the armpit in front of the axillary artery; follows the brachial artery's centre line down the inner side of the arm to the front of the elbow; passes between the two heads of pronator teres; runs down the middle of the forearm between the surface and deep finger benders; goes through the carpal tunnel (in front of the capitate bone) into the palm.",
    r_anterior_interosseous: "Leaves the median nerve and runs down on the membrane between the two forearm bones, a third of the way across from the ulna, between the long thumb bender and the deep finger bender, to the square pronator muscle above the wrist. All its points ride the ulna (r_forearm), as the median nerve's forearm points do. Drawn leaving the median nerve near the middle of the forearm, lower than taught (a few centimetres below the elbow, just below pronator teres): from up there its first straight piece was crossed by the radius as the forearm turned (25 mm of it inside the radius in the game's own start, the forearm fully turned).",
    r_median_recurrent: "A short twig that turns back from the median nerve as it leaves the carpal tunnel, into the muscles of the ball of the thumb.",
    r_ulnar: "Runs down the inner side of the arm beside the brachial artery to mid-arm, passes to the back, goes behind the inner knob of the elbow (the \"funny bone\"), enters the forearm between the two heads of flexor carpi ulnaris, runs down with the ulnar artery's centre line, and reaches the hand beside the pisiform bone.",
    r_ulnar_deep: "Leaves the ulnar nerve beside the pisiform, hooks round the hamate bone and crosses the palm deep to the finger tendons, along the bases of the hand bones, to the muscle that draws the thumb in.",
    r_iliohypogastric: "Leaves the top of the lumbar bundle, crosses the back wall of the belly in front of quadratus lumborum and runs forward in the belly wall just above the hip bone's crest, between the two inner flat muscles.",
    r_lumbar_plexus: "Drawn as one bundle inside psoas major, beside the lumbar vertebrae: from the level where the first lumbar nerve leaves the column down to the level of the fifth lumbar vertebra. (The real plexus forms inside this muscle from L1 to L4, with a twig of T12.)",
    r_femoral: "Comes out of the outer edge of psoas major, runs down in the groove between psoas and iliacus, passes under the groin ligament on the outer side of the femoral artery, breaks into its muscle branches just below the groin, and its longest branches run on beside the femoral artery to mid-thigh.",
    r_obturator: "Comes out of the inner edge of psoas major at the brim of the pelvis, runs forward along the side wall of the pelvis, leaves it through the canal at the top of the obturator opening and runs down the inner thigh between the adductor muscles.",
    r_sacral_plexus: "Drawn as one bundle on the back wall of the pelvis: the trunk from L4 and L5 comes down over the wing of the sacrum and meets the sacral nerves in front of their openings and of piriformis; the bundle converges on the lower edge of that muscle at the great notch of the hip bone, where its nerves leave the pelvis. A point on its lower edge in front of the fourth sacral opening is where the upper branch of S4 meets it (joining S3 there).",
    r_superior_gluteal: "Leaves the pelvis ABOVE piriformis and runs forward between gluteus medius and gluteus minimus toward the tensor of the fascia lata.",
    r_inferior_gluteal: "Leaves the pelvis BELOW piriformis and turns straight back into the deep side of gluteus maximus.",
    r_nerve_to_obturator_internus: "Leaves the pelvis below piriformis, crosses the spine of the ischium and re-enters to reach obturator internus; it also gives the twig to the upper gemellus.",
    r_nerve_to_quadratus_femoris: "Leaves the pelvis below piriformis and runs down under the sciatic nerve and the gemelli to quadratus femoris; it also gives the twig to the lower gemellus.",
    r_sciatic: "Leaves the pelvis below piriformis, runs down midway between the sitting bone and the great knob at the top of the thigh bone (behind quadratus femoris), then down the back of the thigh behind adductor magnus and in front of the long head of biceps femoris, to the top of the hollow behind the knee, where it divides. (A third of the way up from the knee is the usual place of the division; it can be higher.)",
    r_tibial: "The sciatic nerve's larger half: straight down the middle of the hollow behind the knee, behind the popliteal artery, then deep in the calf with the posterior tibial artery's centre line, round behind the inner ankle knob with that artery and under it into the sole, where it divides into the two nerves of the sole.",
    r_medial_plantar: "Runs forward along the big-toe side of the sole between the muscle that spreads the big toe and the short toe bender.",
    r_lateral_plantar: "Crosses the sole slantwise under the short toe bender toward the little-toe side, then runs forward along the outer side of the foot bones.",
    r_common_fibular: "The sciatic nerve's smaller half: slants outward along the inner edge of the biceps femoris tendon to behind the head of the fibula, winds forward round the outer side of the neck of that bone (where it lies just under the skin) and divides.",
    r_deep_fibular: "Passes forward through the top of the muscles on the front of the shin, then runs down on the membrane between the two shin bones with the anterior tibial artery's centre line, between tibialis anterior and the long toe lifters, over the front of the ankle with that artery to the top of the foot.",
    r_superficial_fibular: "Runs down the outer side of the shin between fibularis longus and fibularis brevis; in the lower third it comes to the surface (from there on it only serves the skin).",
    r_intercostal_t1: "Leaves the column under the first thoracic vertebra and runs round the chest in the groove under rib 1, to the front beside the breastbone.",
    r_intercostal_t2: "Leaves the column under the second thoracic vertebra and runs round the chest in the groove under rib 2, to the front beside the breastbone.",
    r_intercostal_t3: "Leaves the column under the third thoracic vertebra and runs round the chest in the groove under rib 3, to the front beside the breastbone.",
    r_intercostal_t4: "Leaves the column under the fourth thoracic vertebra and runs round the chest in the groove under rib 4, to the front beside the breastbone.",
    r_intercostal_t5: "Leaves the column under the fifth thoracic vertebra and runs round the chest in the groove under rib 5, to the front beside the breastbone.",
    r_intercostal_t6: "Leaves the column under the sixth thoracic vertebra and runs round the chest in the groove under rib 6, to the front beside the breastbone.",
    r_intercostal_t7: "Leaves the column under the seventh thoracic vertebra, runs round the chest under rib 7, then on past the rib's end, slanting down and forward between the two inner flat muscles of the belly wall, into rectus abdominis.",
    r_intercostal_t8: "Leaves the column under the eighth thoracic vertebra, runs round the chest under rib 8, then on past the rib's end, slanting down and forward between the two inner flat muscles of the belly wall, into rectus abdominis.",
    r_intercostal_t9: "Leaves the column under the ninth thoracic vertebra, runs round the chest under rib 9, then on past the rib's end, slanting down and forward between the two inner flat muscles of the belly wall, into rectus abdominis.",
    r_intercostal_t10: "Leaves the column under the tenth thoracic vertebra, runs round the chest under rib 10, then on past the rib's end, slanting down and forward between the two inner flat muscles of the belly wall, into rectus abdominis.",
    r_intercostal_t11: "Leaves the column under the eleventh thoracic vertebra, runs round the chest under rib 11, then on past the rib's end, slanting down and forward between the two inner flat muscles of the belly wall, into rectus abdominis.",
    r_subcostal: "Leaves the column under the twelfth thoracic vertebra, runs under the lowest rib and on, slanting down and forward between the two inner flat muscles of the belly wall, into the lowest part of rectus abdominis.",
    r_dorsal_ramus_c2: "Leaves the column between the first and second cervical vertebrae, turns back and up through the deep muscles of the nape (its main branch, the greater occipital nerve, climbs on to the back of the scalp).",
    r_dorsal_ramus_c3: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_c4: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_c5: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_c6: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_c7: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_c8: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t1: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t2: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t3: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t4: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t5: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t6: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t7: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t8: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t9: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t10: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t11: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_t12: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_l1: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_l2: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_l3: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_l4: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
    r_dorsal_ramus_l5: "Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.",
  },
  twigFrom: {"r_hypoglossal":[2],"r_glossopharyngeal":[2],"r_vagus":[2],"r_accessory":[6],"r_facial":[3,4],"r_mandibular_v3":[3],"r_oculomotor":[2]},
  bones: [{"name":"humerus","seg":"r_upperarm","a":[-222.6,-65,988.3],"b":[-161.8,-81.2,1321.6],"r":14.1},{"name":"ulna","seg":"r_forearm","a":[-252.7,-118.7,722.2],"b":[-219.6,-60.8,983.5],"r":6.9},{"name":"radius","seg":"r_radius","a":[-281.7,-120.2,719.6],"b":[-241.6,-71.6,965.2],"r":6.6},{"name":"femur","seg":"r_thigh","a":[-71.9,-78.1,344.8],"b":[-108.4,-74.8,812.1],"r":18.1},{"name":"tibia","seg":"r_shank","a":[-69.1,-75.8,-91.2],"b":[-70.2,-81.1,314.3],"r":11},{"name":"fibula","seg":"r_shank","a":[-97.8,-55.8,-110.2],"b":[-106.7,-63.1,299.2],"r":6}],
  rootJoin: {
    r_accessory: {"C1":2,"C2":2,"C3":1,"C4":1,"C5":0},
    r_cervical_plexus: {"C1":0,"C2":0,"C3":1,"C4":3},
    r_cervical_muscular: {"C2":0,"C3":0,"C4":1,"C5":2,"C6":3,"C7":4,"C8":6},
    r_brachial_plexus: {"C5":0,"C6":0,"C7":0,"C8":0,"T1":1},
    r_lumbar_plexus: {"T12":0,"L1":0,"L2":1,"L3":2,"L4":3},
    r_sacral_plexus: {"L4":0,"L5":0,"S1":1,"S2":3,"S3":4,"S4":5},
    r_intercostal_t1: {"T1":0},
    r_intercostal_t2: {"T2":0},
    r_intercostal_t3: {"T3":0},
    r_intercostal_t4: {"T4":0},
    r_intercostal_t5: {"T5":0},
    r_intercostal_t6: {"T6":0},
    r_intercostal_t7: {"T7":0},
    r_intercostal_t8: {"T8":0},
    r_intercostal_t9: {"T9":0},
    r_intercostal_t10: {"T10":0},
    r_intercostal_t11: {"T11":0},
    r_subcostal: {"T12":0},
    r_dorsal_ramus_c2: {"C2":0},
    r_dorsal_ramus_c3: {"C3":0},
    r_dorsal_ramus_c4: {"C4":0},
    r_dorsal_ramus_c5: {"C5":0},
    r_dorsal_ramus_c6: {"C6":0},
    r_dorsal_ramus_c7: {"C7":0},
    r_dorsal_ramus_c8: {"C8":0},
    r_dorsal_ramus_t1: {"T1":0},
    r_dorsal_ramus_t2: {"T2":0},
    r_dorsal_ramus_t3: {"T3":0},
    r_dorsal_ramus_t4: {"T4":0},
    r_dorsal_ramus_t5: {"T5":0},
    r_dorsal_ramus_t6: {"T6":0},
    r_dorsal_ramus_t7: {"T7":0},
    r_dorsal_ramus_t8: {"T8":0},
    r_dorsal_ramus_t9: {"T9":0},
    r_dorsal_ramus_t10: {"T10":0},
    r_dorsal_ramus_t11: {"T11":0},
    r_dorsal_ramus_t12: {"T12":0},
    r_dorsal_ramus_l1: {"L1":0},
    r_dorsal_ramus_l2: {"L2":0},
    r_dorsal_ramus_l3: {"L3":0},
    r_dorsal_ramus_l4: {"L4":0},
    r_dorsal_ramus_l5: {"L5":0},
  },
  outline: { stations: {"from":-0.25,"step":0.046875,"count":32}, sectors: 36, limbs: {
    upperarm: {"segs":["r_upperarm","r_armwrap"],"from":"r_glenohumeral","to":"r_elbow","u":[0.0054,0.9995,0.0308],"r":[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,142,172,166,0,90,117,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,100,156,180,74,89,96,152,136,0,0,0,0,0,0],[23,21,22,22,20,21,23,26,28,27,26,27,28,29,28,26,25,27,32,43,53,83,118,170,183,91,87,92,158,145,57,38,31,26,23,23],[39,38,38,38,38,39,42,44,46,46,45,44,43,42,41,45,47,50,53,60,70,89,130,174,185,90,77,72,158,144,61,53,49,46,42,39],[47,45,45,44,46,48,51,52,54,53,51,50,48,54,58,58,60,64,70,76,85,93,132,174,187,81,69,68,75,109,94,66,50,49,49,48],[51,50,48,48,50,53,56,58,59,57,56,54,52,58,61,62,64,68,73,78,86,94,132,171,188,74,64,51,42,36,88,72,53,48,50,52],[52,53,51,49,52,55,61,63,63,62,60,56,53,17,13,9,9,9,9,9,10,11,38,45,41,16,16,16,27,35,40,40,39,27,50,52],[52,53,53,50,52,58,63,65,65,64,60,57,51,22,23,20,19,15,7,7,7,41,43,45,43,8,8,9,29,34,38,38,36,24,23,50],[50,52,52,50,52,58,64,65,65,64,60,57,26,29,30,30,30,26,5,5,43,46,44,40,4,4,5,21,28,32,35,35,32,29,26,45],[42,48,49,49,50,58,62,64,64,62,57,52,33,37,39,40,40,38,29,46,51,50,46,36,9,9,6,21,27,30,33,33,33,34,32,28],[37,38,44,44,46,54,58,60,59,58,52,31,38,43,48,50,51,50,45,53,56,55,50,34,15,13,15,21,25,29,31,37,39,39,38,34],[43,44,43,40,41,47,50,52,52,48,43,36,42,47,52,56,60,59,56,59,60,58,54,39,19,17,15,20,24,27,36,40,43,44,44,40],[49,49,49,46,40,37,40,40,40,36,27,40,47,52,55,60,63,63,62,64,63,61,57,46,23,20,14,18,21,24,38,44,48,48,49,46],[52,53,53,51,45,37,28,28,27,19,35,44,52,56,57,62,65,64,67,67,65,63,58,48,26,22,15,16,18,32,40,47,52,53,54,52],[54,57,57,52,49,41,32,26,29,29,40,47,53,56,59,63,65,67,71,70,68,65,60,51,29,26,16,13,15,34,42,49,54,57,58,56],[57,59,59,54,51,44,36,33,35,34,41,49,53,57,60,63,65,70,72,71,69,67,61,52,31,28,21,9,10,35,43,50,55,58,59,58],[57,59,59,55,51,47,39,38,39,38,42,49,52,55,59,63,64,70,72,71,69,67,62,54,33,31,26,5,13,35,43,50,56,59,60,59],[57,59,58,56,51,47,40,41,42,40,42,48,51,54,57,62,64,69,71,71,68,66,62,54,34,33,28,16,20,34,43,50,55,59,60,58],[55,57,57,56,50,47,40,42,43,41,40,47,49,52,56,59,64,67,68,69,67,64,60,53,35,33,30,21,23,34,43,49,55,59,59,57],[52,55,56,54,50,46,40,43,43,40,37,45,48,50,53,56,60,63,65,65,64,61,58,52,36,34,31,25,26,31,40,47,52,56,57,54],[48,52,52,51,48,44,41,43,42,37,28,42,46,47,49,52,55,58,60,60,59,58,55,50,37,35,32,27,28,28,36,44,48,52,53,51],[44,46,48,47,44,41,41,42,39,30,30,37,41,43,44,48,50,53,55,55,54,54,51,47,37,36,33,27,29,30,32,38,44,48,49,48],[40,41,42,41,39,37,40,40,34,32,31,30,35,40,40,42,45,47,49,49,48,48,46,43,37,37,33,25,30,30,29,31,38,42,43,43],[36,35,36,35,34,37,38,37,35,34,31,27,27,32,35,37,39,40,43,43,41,42,40,38,37,36,33,22,28,29,29,28,28,34,37,38],[31,30,30,29,32,36,38,38,38,36,32,30,26,23,28,30,34,35,36,37,35,35,34,33,34,34,31,22,22,26,27,28,28,25,30,31],[26,26,25,35,40,42,42,42,40,37,36,31,26,23,20,25,27,29,31,31,30,30,29,30,31,30,34,35,34,28,23,25,25,24,22,25],[25,24,37,43,47,48,47,46,43,41,38,30,28,22,22,22,21,24,25,25,26,26,26,25,26,24,35,37,38,35,34,34,32,30,30,29],[36,39,47,52,54,54,53,50,44,43,40,29,25,22,23,23,23,23,22,23,22,22,22,24,25,26,36,42,44,44,37,39,39,39,35,36],[41,47,55,59,61,61,59,54,48,47,41,29,19,19,22,24,24,24,23,23,22,20,21,23,26,29,33,47,51,52,48,43,47,47,48,41],[44,52,61,65,66,66,62,56,51,50,42,27,19,18,18,23,24,24,23,23,21,19,18,21,24,29,36,49,56,57,55,49,51,54,54,53],[45,56,65,68,69,67,63,57,52,51,40,25,16,16,16,14,20,22,22,20,19,17,16,17,22,27,36,49,57,59,59,55,54,58,59,59],[60,56,65,70,70,68,63,54,53,50,30,22,15,15,14,13,11,10,14,15,14,14,14,13,12,24,33,45,57,60,60,59,56,61,63,63]]},
    forearm: {"segs":["r_forearm","r_radius"],"from":"r_elbow","to":"r_wrist","u":[-0.0383,0.9745,-0.221],"r":[[64,66,66,57,51,51,36,32,27,27,27,26,26,25,24,25,25,26,28,29,29,30,32,32,34,34,34,35,36,35,32,41,43,63,69,69],[57,56,56,50,48,47,38,35,30,23,22,22,22,23,23,23,24,24,26,27,27,27,29,29,30,31,34,35,35,33,33,40,41,53,60,60],[48,47,46,42,44,43,40,37,34,29,23,19,18,20,20,21,23,23,24,25,25,25,25,26,27,30,32,33,32,29,31,36,38,39,49,51],[40,39,37,38,39,40,41,40,38,34,31,26,18,16,18,19,21,22,23,24,24,24,24,25,26,29,30,30,30,26,25,32,35,35,38,40],[31,32,29,36,41,43,43,43,41,39,36,29,26,23,21,21,20,20,21,22,23,24,24,25,25,27,33,36,36,36,34,28,29,29,27,31],[26,25,33,40,44,46,46,46,44,42,40,35,29,29,28,26,26,25,25,25,24,23,24,25,24,23,37,38,38,39,39,34,28,28,28,26],[28,26,36,43,47,49,49,49,47,45,45,40,33,33,33,30,31,30,30,29,26,25,26,29,30,29,41,43,43,42,42,40,33,28,29,28],[30,30,39,47,51,53,54,53,52,49,49,46,36,38,37,35,33,34,33,31,27,26,29,31,34,35,46,48,47,44,46,45,40,35,30,31],[31,34,42,49,53,56,57,56,54,51,52,50,41,43,42,40,37,35,34,31,27,28,30,33,38,44,50,52,51,45,50,50,46,39,38,31],[31,32,41,50,55,57,58,58,56,53,54,52,44,46,45,44,40,34,33,32,27,29,32,36,41,47,53,53,53,46,50,52,50,40,40,37],[28,31,41,50,55,58,58,58,56,53,54,54,46,48,48,47,43,30,30,30,28,28,33,38,43,50,54,54,53,47,51,52,50,41,40,39],[36,27,41,48,54,58,58,58,56,52,54,54,47,49,49,49,45,37,31,28,26,26,34,39,44,50,54,54,53,47,51,51,50,41,41,40],[39,23,23,45,51,55,55,57,55,51,54,54,46,50,50,49,45,38,31,30,28,26,33,39,44,50,53,53,51,47,48,50,49,42,41,40],[40,24,24,38,47,51,52,53,53,49,52,51,44,50,50,49,45,38,32,31,29,28,32,38,43,49,52,52,50,45,46,48,47,42,42,41],[39,35,25,24,41,46,48,49,49,47,48,47,39,48,48,47,44,37,32,31,30,28,31,37,42,47,50,50,47,43,42,45,45,41,41,40],[39,35,25,24,23,38,44,45,46,44,45,44,38,46,46,44,42,36,31,31,30,29,29,37,41,45,47,47,44,41,37,42,42,40,40,39],[37,34,24,24,23,22,38,41,43,42,42,41,36,43,43,42,40,35,30,30,30,30,27,34,39,43,45,44,42,39,36,39,39,38,38,37],[34,32,23,22,22,20,30,37,40,39,39,38,34,40,41,41,37,34,30,29,30,30,28,31,37,40,42,42,39,37,34,36,37,36,35,35],[32,30,22,21,20,19,18,32,36,36,37,36,33,33,38,38,35,32,29,28,29,29,28,27,35,36,39,39,36,34,33,34,34,33,33,32],[29,29,21,20,18,17,17,28,33,33,34,33,32,29,35,35,34,30,28,27,28,29,28,28,31,33,35,36,34,32,31,31,31,31,30,30],[27,27,20,18,17,15,14,24,29,30,31,31,31,29,32,32,32,29,27,27,27,28,28,28,28,31,32,32,32,30,29,29,30,29,28,28],[26,25,18,16,14,11,13,15,26,29,29,29,29,29,29,31,30,28,26,26,26,27,28,28,26,30,30,30,29,23,27,27,28,28,26,25],[23,23,14,8,12,13,14,17,25,28,28,28,29,29,28,28,28,26,24,24,24,26,27,27,24,28,29,28,27,18,25,26,26,26,23,23],[21,20,10,14,14,14,15,17,27,30,30,29,29,28,26,25,26,24,23,22,23,23,27,27,26,25,27,27,26,18,21,24,25,25,21,21],[20,20,11,15,15,15,17,21,31,32,30,30,29,29,26,21,23,22,21,21,20,22,24,28,28,26,26,27,27,24,17,23,24,24,22,19],[20,20,19,15,15,17,20,28,32,32,32,31,31,29,24,23,22,21,20,19,19,22,23,28,29,27,26,26,28,29,27,18,21,22,22,20],[19,20,19,25,31,31,25,27,33,34,34,32,30,24,23,21,21,19,18,19,19,20,23,28,29,29,28,29,31,32,31,27,20,23,23,22],[21,22,25,32,39,42,41,41,40,39,34,27,22,21,22,21,16,18,18,17,19,19,21,25,29,31,31,31,40,38,35,25,22,23,23,22],[20,21,26,31,41,49,51,51,48,41,31,23,21,23,22,20,16,17,17,17,16,18,20,22,29,34,36,36,46,43,38,23,22,21,21,20],[16,17,19,19,39,51,60,61,55,35,32,24,24,24,22,14,14,16,16,16,14,13,20,25,25,38,40,50,51,47,34,24,20,18,17,16],[13,13,14,17,19,52,62,62,57,35,34,28,25,25,16,15,14,15,16,16,15,15,17,25,27,40,45,54,54,50,34,24,19,15,14,14],[13,15,15,18,19,22,65,65,35,33,33,28,26,25,15,14,12,13,15,15,15,15,16,20,28,31,48,55,54,49,29,23,16,16,15,15]]},
    hand: {"segs":["r_hand","r_thumb_mc","r_thumb_pp","r_thumb_dp","r_index_pp","r_index_mp","r_index_dp","r_middle_pp","r_middle_mp","r_middle_dp","r_ring_pp","r_ring_mp","r_ring_dp","r_little_pp","r_little_mp","r_little_dp"],"from":"r_wrist","to":"r_middle_mcp","u":[-0.0272,0.9779,-0.2072],"r":[[19,19,13,15,14,16,19,27,31,31,31,30,30,28,23,23,22,21,20,20,19,22,23,29,29,28,26,27,28,27,18,18,21,22,22,18],[19,19,11,15,15,15,19,28,31,31,31,31,30,23,24,23,21,21,19,19,19,21,23,29,29,27,25,25,28,28,18,18,21,22,22,18],[19,19,18,15,15,12,17,27,31,32,32,31,31,24,24,21,21,19,19,19,19,19,24,29,29,25,22,21,29,30,18,18,20,22,22,19],[19,19,19,14,15,6,16,16,28,32,32,31,24,24,23,21,21,19,18,19,19,20,24,29,29,21,22,21,28,30,30,17,20,22,22,21],[19,19,19,19,25,27,22,21,21,33,33,32,25,24,20,21,20,18,18,19,19,20,23,28,29,27,27,27,24,31,31,17,20,22,22,21],[16,19,19,23,31,31,24,28,27,33,33,25,25,19,21,21,20,18,17,19,19,20,21,25,29,28,27,28,30,31,31,16,19,23,23,21],[20,5,21,27,34,35,28,30,29,22,16,13,9,9,21,21,16,18,18,17,19,19,22,22,23,26,28,29,30,31,31,27,4,23,23,22],[21,20,23,30,37,38,34,34,32,25,23,19,16,12,21,21,14,18,18,17,19,19,21,23,24,24,28,29,33,33,32,19,4,23,23,22],[21,22,24,31,39,40,39,38,34,29,24,20,18,21,22,20,15,18,18,17,18,19,20,25,25,25,27,28,36,35,33,19,4,23,23,22],[21,22,26,33,41,43,42,42,38,29,24,20,19,22,22,19,15,17,17,17,17,19,19,24,26,25,29,30,38,37,34,1,22,23,22,21],[21,21,26,32,42,46,46,45,40,28,23,21,18,22,22,15,15,17,17,16,15,18,19,24,27,24,31,31,40,38,35,3,22,22,21,20],[19,20,24,32,41,48,49,48,41,32,24,22,18,23,21,15,14,16,16,15,15,17,20,20,28,28,32,31,41,39,36,22,22,21,20,19],[18,20,21,32,41,50,51,51,44,34,23,22,19,23,21,14,14,16,16,15,15,13,19,20,27,29,33,32,43,41,37,23,22,20,19,18],[17,19,20,29,39,51,54,54,47,35,22,22,23,24,21,14,13,16,16,15,14,11,19,21,19,31,34,34,44,41,38,24,21,19,18,18],[16,17,20,21,40,52,57,56,47,35,24,23,24,24,13,13,13,15,15,15,10,7,20,21,20,32,35,35,45,43,39,24,21,19,17,16],[15,16,19,20,21,52,60,59,48,36,25,23,24,24,13,13,13,15,15,15,10,0,19,22,22,33,36,36,47,44,38,24,21,18,16,16],[15,15,17,20,22,53,62,62,48,36,27,24,25,24,14,14,13,15,15,15,11,7,13,23,23,35,37,38,48,45,30,25,21,17,16,15],[14,14,16,19,21,54,62,62,39,37,31,26,26,24,15,14,13,15,15,14,12,6,15,23,23,36,38,39,49,46,33,26,21,17,15,14],[14,14,15,17,20,23,64,63,38,37,33,26,26,24,16,15,13,15,15,14,13,13,16,23,24,37,39,40,50,48,35,25,20,16,15,14],[14,14,15,17,20,23,64,64,40,36,34,27,26,24,16,14,13,14,14,14,13,13,15,23,24,38,41,42,51,48,36,24,21,16,15,14],[15,14,15,17,20,22,65,64,39,36,34,28,27,23,16,14,13,14,14,14,13,13,16,22,24,38,42,51,52,48,33,24,20,15,15,14],[15,14,15,16,20,23,66,65,38,36,34,28,27,17,15,12,13,13,14,14,13,13,15,18,25,37,42,51,52,48,31,23,19,15,15,15],[15,15,16,16,20,24,66,66,35,35,34,27,27,16,14,12,12,13,13,13,12,13,15,17,25,27,43,50,52,48,31,23,20,15,15,15],[16,15,16,17,21,24,68,67,34,35,34,28,27,15,12,11,12,12,13,12,12,12,13,15,25,26,44,50,52,46,30,23,20,15,15,15],[16,15,17,18,21,25,69,67,33,35,34,28,27,13,11,10,11,12,12,12,10,11,12,13,23,27,45,50,51,43,29,23,20,16,16,15],[15,14,17,18,21,22,70,68,33,35,32,28,27,10,10,9,11,11,11,11,9,10,10,12,23,27,45,50,51,16,26,20,20,7,15,15],[6,6,0,12,14,14,72,67,35,35,30,29,25,10,9,8,10,10,11,10,9,10,10,10,11,26,28,50,50,29,15,8,8,7,7,6],[6,6,7,7,12,14,73,66,36,36,31,29,8,8,8,7,9,10,10,10,8,9,9,8,7,26,27,50,51,27,15,8,7,7,7,6],[8,8,9,9,10,12,72,26,37,37,30,30,6,7,6,8,8,9,9,9,6,8,7,7,6,25,27,50,52,25,11,10,10,10,9,8],[8,0,8,10,11,11,73,29,37,37,30,30,6,6,5,7,7,7,7,7,6,4,4,5,6,7,27,51,53,20,10,10,10,9,9,0],[7,7,8,9,9,10,74,30,37,37,31,30,6,4,5,6,6,6,6,6,6,4,3,4,0,5,27,52,54,20,9,9,8,9,7,7],[7,0,7,8,9,9,75,22,36,36,31,30,4,4,5,5,5,4,4,5,5,4,3,3,4,3,27,53,56,20,9,9,8,8,7,7]]},
    thigh: {"segs":["r_thigh","r_patella","r_quad1","r_quad2","r_quad3","r_quad4"],"from":"r_hip","to":"r_knee","u":[0.0002,1,-0.0062],"r":[[0,0,0,0,73,69,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,72,75,76,73,70,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,70,74,78,78,76,71,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,63,65,73,78,80,79,76,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[23,64,64,71,77,80,80,78,21,20,20,20,21,20,20,19,19,19,19,19,19,19,19,19,19,18,18,19,21,22,22,22,23,23,23,23],[25,63,63,62,76,80,81,78,61,61,61,57,50,22,22,21,21,21,21,21,21,21,21,21,21,21,21,22,23,23,23,24,24,25,25,25],[58,61,62,60,65,79,81,78,65,65,63,59,52,47,42,38,36,34,33,33,34,16,16,16,16,16,17,16,16,84,89,87,19,19,20,19],[60,62,62,65,72,76,80,76,62,62,60,56,51,45,41,38,35,34,34,36,52,54,54,55,49,55,59,64,74,84,87,86,75,0,0,0],[63,64,69,75,80,83,83,69,69,60,51,48,40,36,34,32,30,30,29,50,53,55,56,56,57,58,62,66,73,79,84,82,77,48,0,62],[66,69,79,83,86,90,89,77,76,66,55,43,29,28,27,25,21,38,51,54,55,59,61,60,62,61,67,70,73,77,81,79,76,61,36,65],[68,79,88,93,94,93,91,84,82,71,58,47,20,17,14,41,49,53,56,57,57,64,67,66,66,67,68,72,74,76,77,76,74,66,67,68],[70,85,95,100,100,100,93,90,86,74,61,50,37,38,46,51,55,58,61,61,61,69,71,70,70,71,70,74,75,76,76,74,73,68,71,70],[76,91,101,104,105,103,95,95,89,77,63,54,41,49,54,57,60,63,65,65,66,74,77,74,76,76,74,74,76,76,76,73,72,74,74,73],[82,96,105,110,111,106,101,101,94,79,66,56,51,56,59,62,66,68,69,69,71,80,81,78,77,79,77,75,77,77,76,71,70,77,76,76],[85,101,110,114,115,107,107,105,97,82,68,56,58,62,65,67,70,72,73,72,78,82,82,80,78,80,76,77,78,78,76,68,77,77,77,77],[85,102,110,114,115,108,108,106,98,83,68,57,63,65,68,70,72,73,74,74,79,82,82,80,79,81,78,78,78,77,75,65,76,76,77,81],[87,101,108,112,112,107,108,105,97,82,69,61,66,67,68,70,72,73,74,73,79,82,81,79,79,79,78,77,78,76,73,72,74,74,76,82],[86,99,104,107,106,106,106,104,94,79,67,63,67,67,67,69,71,72,73,71,77,80,79,77,79,77,76,76,77,75,71,71,71,73,76,83],[85,95,101,103,102,104,104,102,88,74,65,64,66,67,67,68,70,71,71,67,75,77,77,74,75,75,74,75,75,72,68,68,69,70,77,83],[83,91,96,96,99,101,101,96,83,71,61,64,65,65,65,66,67,67,68,63,72,74,73,70,72,72,72,73,72,69,65,66,67,70,77,82],[81,86,89,90,94,97,96,91,78,66,54,63,64,63,62,63,63,63,63,56,66,71,69,66,66,67,70,70,68,65,63,64,66,70,75,80],[75,79,81,83,87,90,90,83,71,59,44,61,62,61,60,59,58,58,56,51,62,66,65,64,62,62,67,66,64,62,62,63,63,68,73,75],[68,72,73,75,79,81,81,74,62,50,36,57,58,57,56,54,53,52,48,46,57,62,62,61,59,61,64,62,60,61,61,61,62,67,69,69],[62,64,65,68,72,73,72,65,53,43,37,54,53,52,51,50,48,44,40,44,47,58,60,59,58,61,61,59,59,59,58,58,60,61,63,62],[56,58,59,62,64,65,64,54,45,36,41,49,48,47,46,43,41,36,0,39,44,54,58,58,56,60,59,56,57,56,56,56,57,57,57,58],[51,52,52,57,58,58,55,45,37,41,48,50,49,48,44,40,34,6,5,6,37,44,56,56,54,58,58,54,54,53,53,50,51,51,51,50],[44,46,47,51,52,50,46,38,39,41,53,54,53,49,50,49,47,43,48,50,51,49,52,55,53,51,55,52,52,51,50,34,33,40,40,42],[43,45,46,47,45,44,37,37,37,37,55,56,55,58,60,60,58,54,56,59,59,57,47,53,53,48,51,51,50,49,45,33,33,34,40,41],[40,41,41,42,42,39,39,40,39,47,55,56,58,66,72,74,72,67,64,67,67,67,57,45,48,47,44,47,48,48,46,40,32,32,31,36],[39,41,41,40,42,44,45,47,47,43,58,60,63,75,87,90,89,85,81,78,78,76,70,58,47,39,37,36,35,44,43,41,38,36,35,34],[35,36,39,42,47,48,50,52,52,58,66,67,68,81,94,99,98,96,93,90,89,88,82,70,58,49,41,34,26,26,38,38,37,36,35,35],[28,34,38,47,52,53,55,56,56,64,70,72,72,83,94,99,99,98,95,96,96,93,90,78,64,54,46,40,35,28,15,17,34,34,35,35]]},
    shank: {"segs":["r_shank"],"from":"r_knee","to":"r_ankle","u":[0.0001,0.9998,0.0194],"r":[[70,71,77,78,86,89,91,87,77,66,53,65,66,66,64,62,61,60,55,59,63,65,63,57,58,61,62,59,57,56,56,57,57,63,66,69],[64,66,70,72,78,80,81,77,67,55,41,61,61,60,58,57,56,52,46,49,58,61,61,56,56,60,60,57,56,56,56,56,57,61,63,64],[58,61,62,65,69,72,72,66,56,47,40,56,55,55,52,51,48,43,39,45,53,58,59,56,55,58,57,54,55,55,54,54,55,57,58,59],[53,55,56,59,63,64,64,55,46,37,43,51,50,49,47,44,41,34,0,40,45,53,57,56,54,58,57,53,54,53,52,52,53,53,53,53],[48,48,50,55,57,57,53,45,39,41,50,51,50,49,44,41,38,33,37,40,43,44,55,55,53,56,56,52,52,51,50,44,46,46,46,46],[42,46,47,48,49,47,41,38,39,40,52,52,51,51,51,51,49,45,50,53,53,53,47,54,53,50,53,51,50,50,48,34,33,33,38,40],[32,33,34,35,36,37,38,38,38,36,37,45,53,59,61,62,60,57,57,60,61,61,52,52,52,49,42,38,38,38,36,35,34,33,32,32],[35,39,40,40,38,40,40,40,38,46,51,52,56,65,72,75,75,72,68,70,71,70,64,53,46,45,42,37,37,37,35,33,32,32,32,33],[35,39,40,41,43,44,45,46,45,51,56,59,60,73,84,90,89,87,83,80,81,81,78,67,57,49,40,35,33,30,28,26,26,27,28,31],[35,39,41,46,48,49,50,50,49,59,64,64,64,76,88,95,95,94,92,91,91,91,89,80,67,57,50,44,38,25,25,25,24,25,27,30],[33,38,45,51,53,54,54,54,53,62,66,67,67,78,88,95,96,95,94,93,95,95,92,88,75,64,55,49,43,37,31,17,20,22,25,28],[31,37,46,53,56,58,58,57,56,64,68,70,71,79,88,94,95,94,93,94,95,95,94,91,79,68,58,52,46,40,34,18,17,20,23,26],[30,36,46,54,57,59,59,58,56,65,68,71,71,80,88,93,94,93,92,91,93,94,94,92,80,69,61,54,47,41,33,24,21,17,22,26],[29,36,45,53,58,58,59,57,54,62,67,71,71,80,88,92,93,92,90,86,90,91,93,91,80,69,61,54,48,40,33,28,22,18,22,25],[29,35,45,51,55,56,56,54,51,56,64,69,69,78,85,88,89,89,86,82,85,87,89,87,77,67,59,54,48,39,34,29,14,18,21,25],[28,35,42,48,51,53,52,52,50,52,61,67,67,74,80,83,85,84,82,79,81,83,84,83,73,64,57,51,42,39,33,28,16,18,21,24],[28,33,38,45,48,49,49,48,48,50,55,63,63,66,74,78,79,78,77,75,77,80,79,77,69,59,53,44,39,33,28,23,16,18,20,23],[27,32,36,41,44,45,45,45,47,48,50,59,60,60,66,69,71,71,69,69,72,72,72,69,62,53,45,40,34,27,21,16,16,18,20,23],[26,31,32,38,40,41,41,41,44,46,45,56,57,56,52,61,62,62,61,61,63,64,63,59,52,42,40,35,27,18,17,16,16,18,20,22],[26,30,30,34,36,37,37,37,42,44,43,52,54,54,48,50,54,53,50,51,53,53,51,44,44,39,35,27,20,18,16,15,16,18,20,23],[26,29,29,31,32,33,34,33,39,41,40,49,52,52,45,45,44,43,42,43,42,41,41,42,40,35,24,23,20,16,14,15,17,18,21,23],[26,27,27,28,29,30,30,29,36,38,38,46,49,50,44,42,42,42,41,41,41,39,41,41,36,27,26,23,17,14,15,16,18,20,22,24],[26,26,25,26,27,27,26,25,33,34,35,39,46,46,42,40,40,41,40,40,40,39,42,41,28,29,28,19,15,16,17,19,20,22,24,25],[25,24,24,25,25,24,25,27,30,31,33,35,42,42,40,39,35,38,39,40,41,42,45,42,31,32,28,18,18,19,21,22,23,25,25,25],[29,30,30,29,28,28,26,26,26,25,33,34,36,38,38,36,34,27,25,39,41,47,48,35,38,37,26,27,28,29,29,30,31,30,29,28],[51,50,51,48,43,34,27,26,26,31,33,35,35,36,36,34,31,23,22,24,28,51,51,35,43,43,36,36,38,38,38,37,34,32,42,44],[88,91,91,82,73,54,46,38,29,33,35,37,38,38,33,33,26,24,25,26,26,52,52,31,43,43,41,39,39,39,41,43,48,51,62,74],[132,127,125,115,95,62,50,42,35,30,30,33,36,36,26,26,30,37,48,48,47,48,49,38,28,41,40,29,25,38,41,44,48,52,69,95],[169,187,187,170,152,76,59,35,28,25,23,21,21,22,24,27,30,38,48,49,47,46,46,44,35,25,24,24,25,27,30,35,40,50,69,118],[169,187,187,172,156,28,21,17,14,13,12,11,11,12,12,14,18,33,37,39,40,40,39,37,29,13,9,4,7,3,5,3,6,5,11,13],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]},
    foot: {"segs":["r_foot","r_toes","r_hallux"],"from":"r_ankle","to":"r_mtp","u":[-0.185,-0.3168,0.9303],"r":[[57,54,0,14,16,33,34,33,31,30,29,29,35,37,39,52,99,173,187,140,96,76,54,42,0,0,0,0,0,0,0,0,0,53,58,59],[62,60,17,21,35,36,35,33,33,33,35,40,40,41,47,61,98,147,156,119,88,65,52,43,36,31,28,0,0,0,0,0,37,54,61,62],[63,63,30,33,36,36,27,27,36,34,39,42,43,44,51,62,94,127,132,101,77,64,51,42,37,34,30,26,25,24,10,24,40,55,62,63],[63,63,34,36,36,35,27,35,38,26,40,43,44,45,51,62,90,106,110,86,67,62,51,43,39,37,37,37,33,26,25,29,41,55,63,64],[63,61,32,36,36,27,26,38,39,26,39,43,44,46,52,62,79,89,90,74,50,52,46,43,39,38,38,38,38,32,27,28,42,53,63,63],[61,59,50,36,35,29,28,39,40,26,38,42,44,46,51,57,66,72,70,63,43,39,41,39,38,37,37,38,37,33,28,27,41,50,61,61],[57,55,49,44,25,29,29,40,41,27,29,29,28,26,21,19,17,17,46,47,19,19,18,16,14,14,15,16,19,21,22,33,40,47,58,58],[54,50,47,45,42,27,32,41,41,33,31,29,29,24,19,16,15,15,41,42,17,13,12,12,11,12,11,18,25,28,30,34,36,42,56,56],[51,48,45,44,43,41,32,41,42,41,34,32,28,26,23,21,18,15,36,36,33,0,0,0,20,22,24,27,28,29,29,33,33,37,53,53],[48,46,43,43,43,42,39,40,42,42,37,31,29,28,26,24,21,16,13,30,30,28,25,23,23,24,26,28,28,28,25,28,31,32,50,51],[46,44,41,41,42,42,41,39,42,42,39,35,31,28,26,24,21,18,18,17,25,26,26,25,25,25,26,28,28,22,24,26,28,29,48,48],[44,43,41,40,40,42,42,39,40,40,39,36,33,30,27,25,23,22,21,23,23,24,24,25,25,26,26,27,27,24,26,27,28,28,45,46],[42,41,40,38,40,42,43,42,38,39,38,36,34,30,28,26,26,25,24,24,24,24,24,24,24,26,26,26,28,29,26,27,27,28,43,43],[40,39,39,35,38,41,43,44,40,41,38,36,35,30,27,28,28,25,26,25,24,24,24,23,24,25,25,25,28,32,38,38,26,23,40,41],[38,37,37,36,34,40,44,45,41,41,39,37,36,33,29,30,29,26,26,25,23,23,23,22,24,24,24,23,22,32,39,39,33,34,37,38],[36,35,35,35,14,38,44,46,44,41,40,40,36,34,31,31,28,26,25,23,23,22,22,22,23,23,23,22,24,35,39,38,28,33,34,36],[34,33,33,34,32,24,43,47,47,44,44,43,37,34,32,31,28,24,24,22,22,21,19,20,21,21,21,20,25,33,37,36,25,32,32,32],[32,32,32,32,32,7,37,48,48,45,45,44,38,34,32,29,23,22,20,20,20,19,18,17,19,20,20,19,25,31,33,32,23,30,31,31],[30,30,31,32,31,2,34,49,50,46,45,43,39,34,29,22,20,18,18,18,17,17,13,11,18,18,18,15,27,31,31,30,13,29,29,29],[28,29,30,30,30,0,31,50,51,48,47,43,38,34,24,21,15,16,16,15,13,9,6,9,15,16,16,14,28,30,30,28,0,27,27,27],[26,27,28,29,29,0,0,51,52,49,48,43,39,25,23,20,15,15,14,14,7,0,0,8,13,15,15,14,28,30,30,0,0,26,26,25],[25,26,27,28,28,27,0,52,55,50,49,43,26,25,23,14,14,14,13,7,0,0,0,8,13,15,15,13,29,29,29,0,25,25,24,24],[22,24,25,26,28,28,0,55,56,52,50,45,27,24,13,13,13,13,12,0,0,0,0,9,13,14,14,24,29,29,28,0,25,25,22,22],[20,23,24,24,27,27,41,56,58,54,50,45,27,24,13,13,13,12,0,0,0,0,0,9,13,14,13,26,29,29,28,24,25,24,21,20],[0,21,22,22,26,28,43,57,60,56,51,45,27,24,13,13,11,0,0,0,0,0,0,9,13,13,12,33,34,31,28,25,25,19,20,18],[0,19,20,21,0,27,43,57,61,59,54,29,27,13,13,13,0,0,0,0,0,0,7,10,13,13,29,33,33,32,29,26,11,18,18,16],[5,0,19,19,9,26,28,55,61,60,55,30,28,15,14,12,0,0,0,0,0,7,8,11,13,13,28,33,33,29,26,25,14,16,16,6],[0,0,16,18,17,11,28,46,61,61,56,31,29,15,14,13,0,0,0,3,4,7,9,12,13,14,28,32,33,28,26,12,14,15,14,4],[0,0,0,16,16,14,27,28,61,61,55,30,29,15,15,13,0,0,0,3,4,6,10,13,14,14,29,30,28,26,8,12,13,13,0,0],[0,0,0,0,14,14,12,28,59,59,56,30,29,15,15,14,0,0,0,0,0,0,11,14,14,13,29,29,26,25,10,11,11,9,0,0],[0,0,0,0,0,12,12,11,45,59,57,31,30,15,16,15,0,0,0,0,0,0,13,14,14,26,31,30,26,9,10,9,0,0,0,0],[0,0,0,0,0,0,0,10,11,60,59,31,31,16,17,15,0,0,0,0,0,12,14,15,14,28,31,30,9,8,0,0,0,0,0,0]]},
  } },
  muscles: [
    ["FJ1467","acromial part of right deltoid","","right","r_upperarm",-208.5,-64.6,1308.6],
    ["FJ1468","clavicular part of right deltoid","","right","r_upperarm",-163.9,-108.6,1318.6],
    ["FJ1513","spinal part of right deltoid","","right","r_girdle",-169.6,-32.9,1315.3],
    ["FJ1478","long head of right biceps brachii","","right","r_upperarm",-195,-95.6,1204.1],
    ["FJ1512","short head of right biceps brachii","","right","r_upperarm",-169.6,-91.6,1220.3],
    ["FJ1486","right brachialis","","right","r_upperarm",-216.3,-69.1,1120.3],
    ["FJ1479","long head of right triceps brachii","","right","r_upperarm",-168.5,-32.9,1195.5],
    ["FJ1477","lateral head of right triceps brachii","","right","r_upperarm",-206.3,-30.1,1188.2],
    ["FJ1480","medial head of right triceps brachii","","right","r_upperarm",-178.6,-60.7,1162.2],
    ["FJ1496","right flexor carpi radialis","","right","r_radius",-224.4,-118.1,897.4],
    ["FJ1473","humeral head of right flexor carpi ulnaris","","right","r_forearm",-195.9,-85.6,886],
    ["FJ1518","ulnar head of right flexor carpi ulnaris","","right","r_forearm",-194.9,-70.1,898.5],
    ["FJ1502","right palmaris longus","","right","r_forearm",-215.5,-118.7,882.9],
    ["FJ1475","right flexor digitorum superficialis","","right","r_forearm",-229.6,-111.3,852.1],
    ["FJ1499","right flexor digitorum superficialis","","right","r_radius",-260.6,-98.6,863.4],
    ["FJ1497","right flexor digitorum profundus","","right","r_forearm",-246.4,-102.6,823.2],
    ["FJ1498","right flexor pollicis longus","","right","r_radius",-278.5,-101,799.3],
    ["FJ1474","humeral head of right pronator teres","","right","r_radius",-239.4,-99.6,937.6],
    ["FJ1516","ulnar head of right pronator teres","","right","r_radius",-238.3,-94.7,937],
    ["FJ1503","right pronator quadratus","","right","r_forearm",-250.8,-120.4,760.5],
    ["FJ1487","right brachioradialis","","right","r_upperarm",-229,-55.6,1075.7],
    ["FJ1490","right extensor carpi radialis longus","","right","r_upperarm",-235.5,-56.5,1033.1],
    ["FJ1489","right extensor carpi radialis brevis","","right","r_radius",-264.1,-61.9,903.6],
    ["FJ1472","right extensor carpi ulnaris","","right","r_forearm",-234.9,-66.2,880.6],
    ["FJ1517","right extensor carpi ulnaris","","right","r_forearm",-238.3,-82.3,823.4],
    ["FJ1492","right extensor digitorum","","right","r_radius",-266.9,-61.4,851.1],
    ["FJ1491","right extensor digiti minimi","","right","r_forearm",-250.4,-66.4,864.4],
    ["FJ1493","right extensor indicis","","right","r_hand",-277.8,-114.6,702.9],
    ["FJ1484","right abductor pollicis longus","","right","r_forearm",-252.4,-84.4,830.1],
    ["FJ1494","right extensor pollicis brevis","","right","r_radius",-271.7,-101,755],
    ["FJ1495","right extensor pollicis longus","","right","r_forearm",-253.3,-103.3,774.6],
    ["FJ1505","right supinator","","right","r_radius",-245.3,-68.8,948.5],
    ["FJ1485","right anconeus","","right","r_forearm",-224.9,-43.7,965.3],
    ["FJ1488","right coracobrachialis","","right","r_upperarm",-151.7,-81.9,1266.9],
    ["FJ1506","right supraspinatus","","right","r_girdle",-108.5,-30,1321.9],
    ["FJ1500","right infraspinatus muscle","","right","r_girdle",-140,-39.6,1311.6],
    ["FJ1508","right teres minor","","right","r_girdle",-152.4,-45.2,1294.6],
    ["FJ1504","right subscapularis","","right","r_girdle",-122.1,-65.3,1298],
    ["FJ1507","right teres major","","right","r_girdle",-145.2,-48.3,1247.1],
    ["FJ1483","right abductor pollicis brevis","","right","r_thumb_mc",-294.9,-150.5,704],
    ["FJ1514","superficial head of right flexor pollicis brevis","","right","r_thumb_mc",-293.8,-153.6,691.8],
    ["FJ1501","right opponens pollicis","","right","r_thumb_mc",-298.1,-146.4,700.5],
    ["FJ1481","oblique head of right adductor pollicis","","right","r_hand",-291.7,-138.7,686.4],
    ["FJ1515","transverse head of right adductor pollicis","","right","r_hand",-286.8,-139,660.3],
    ["FJ1466","abductor digiti minimi of right hand","","right","r_hand",-240.1,-145.7,677.1],
    ["FJ1470","flexor digiti minimi brevis of right hand","","right","r_hand",-246.6,-146,676.9],
    ["FJ1482","opponens digiti minimi of right hand","","right","r_hand",-250.2,-141,679.6],
    ["FJ1510","set of lumbricals of right hand","","right","r_hand",-268,-146.4,642.8],
    ["FJ1509","set of dorsal interossei of right hand","","right","r_hand",-277.7,-126.6,652.3],
    ["FJ1511","set of palmar interossei of right hand","","right","r_hand",-264.3,-140.2,648],
    ["FJ1447","clavicular part of right pectoralis major","","right","r_rib2",-93.9,-108.6,1315.9],
    ["FJ1464","sternocostal part of right pectoralis major","","right","r_rib4",-68.7,-147.1,1236.8],
    ["FJ1446","abdominal part of right pectoralis major","","right","r_rib5",-135.4,-126,1226],
    ["FJ1521","descending part of right trapezius","","right","cervical",-59,-42.4,1397.2],
    ["FJ1554","transverse part of right trapezius","","right","r_girdle",-83.1,-26.4,1353.8],
    ["FJ1520","ascending part of right trapezius","","right","r_girdle",-51.6,1,1287.9],
    ["FJ1452","right external oblique","","right","r_rib8",-103.1,-185.1,1046.6],
    ["FJ1459","right serratus anterior","","right","r_rib5",-131.5,-82.7,1240.6],
    ["FJ1447M","clavicular part of left pectoralis major","","left","l_rib2",93.9,-108.6,1315.9],
    ["FJ1464M","sternocostal part of left pectoralis major","","left","l_rib4",68.7,-147.2,1236.6],
    ["FJ1446M","abdominal part of left pectoralis major","","left","l_rib5",135.4,-126,1226],
    ["FJ1521M","descending part of left trapezius","","left","cervical",59.4,-42.4,1397.1],
    ["FJ1554M","transverse part of left trapezius","","left","l_girdle",83.1,-26.4,1353.8],
    ["FJ1520M","ascending part of left trapezius","","left","l_girdle",51.6,1,1287.9],
    ["FJ1452M","left external oblique","","left","l_rib8",103.1,-185.1,1046.6],
    ["FJ1459M","left serratus anterior","","left","l_rib5",131.5,-82.7,1240.6],
    ["FJ1418","right gluteus maximus","","right","pelvis",-30.1,-9.3,810.2],
    ["FJ1419","right gluteus medius","","right","pelvis",-111.8,-55,903.2],
    ["FJ1433","right rectus femoris","","right","r_thigh",-129.5,-134.3,672.2],
    ["FJ1442","right vastus lateralis","","right","r_thigh",-141.7,-98.7,613.6],
    ["FJ1443","right vastus medialis","","right","r_thigh",-82.7,-128.5,593.8],
    ["FJ1441","right vastus intermedius","","right","r_thigh",-124.2,-108.8,612.1],
    ["FJ1434","right sartorius","","right","r_thigh",-67.8,-142.7,671.1],
    ["FJ1395","long head of right biceps femoris","","right","r_thigh",-92.1,-33.6,605.1],
    ["FJ1436","right semitendinosus","","right","r_thigh",-38.1,-28.9,586.4],
    ["FJ1435","right semimembranosus","","right","r_thigh",-26.4,-54.3,590.9],
    ["FJ1444","short head of right biceps femoris","","right","r_thigh",-94.6,-80.7,519.4],
    ["FJ1403","right adductor magnus","","right","r_thigh",-91.1,-82,626.5],
    ["FJ1397","medial head of right gastrocnemius","","right","r_shank",-40.8,-40,272.1],
    ["FJ1394","lateral head of right gastrocnemius","","right","r_shank",-87.8,-18.5,274.5],
    ["FJ1437","right soleus","","right","r_shank",-77.4,-56,189],
    ["FJ1439","right tibialis anterior","","right","r_shank",-105.3,-93.8,157.8],
    ["FJ1422","right iliacus","","right","pelvis",-97.2,-104.4,886.7],
    ["FJ1431","right psoas major","","right","l3",-30.5,-84.5,973.5],
    ["FJ1406","right extensor digitorum longus","","right","r_shank",-115.5,-66.2,136.8],
    ["FJ1408","right extensor hallucis longus","","right","r_shank",-97.1,-68.7,14.3],
    ["FJ1414","right flexor digitorum longus","","right","r_shank",-74.6,-76,77.1],
    ["FJ1415","right flexor hallucis longus","","right","r_shank",-97.4,-62.4,43.8],
    ["FJ1418M","left gluteus maximus","","left","pelvis",30,-9.3,810.2],
    ["FJ1419M","left gluteus medius","","left","pelvis",111.8,-55,903.2],
    ["FJ1433M","left rectus femoris","","left","l_thigh",129.1,-133.9,672],
    ["FJ1442M","left vastus lateralis","","left","l_thigh",141.8,-98.5,613.6],
    ["FJ1443M","left vastus medialis","","left","l_thigh",82.4,-128.8,593.5],
    ["FJ1441M","left vastus intermedius","","left","l_thigh",124.3,-108.8,612.1],
    ["FJ1434M","left sartorius","","left","l_thigh",67.4,-143.2,671.2],
    ["FJ1395M","long head of left biceps femoris","","left","l_thigh",91.7,-32.9,605.2],
    ["FJ1436M","left semitendinosus","","left","l_thigh",37.7,-28.7,586.1],
    ["FJ1435M","left semimembranosus","","left","l_thigh",26.9,-54.4,590.8],
    ["FJ1444M","short head of left biceps femoris","","left","l_thigh",94.5,-80.4,519.1],
    ["FJ1403M","left adductor magnus","","left","l_thigh",90.8,-81.8,626.5],
    ["FJ1397M","medial head of left gastrocnemius","","left","l_shank",40.6,-39.5,272],
    ["FJ1394M","lateral head of left gastrocnemius","","left","l_shank",87.4,-18.3,274.3],
    ["FJ1437M","left soleus","","left","l_shank",77.1,-55.7,188.8],
    ["FJ1439M","left tibialis anterior","","left","l_shank",105.5,-94.3,158],
    ["FJ1422M","left iliacus","","left","pelvis",97.2,-104.4,886.7],
    ["FJ1431M","left psoas major","","left","l3",30.5,-84.5,973.5],
    ["FJ1406M","left extensor digitorum longus","","left","l_shank",114.9,-66,136.6],
    ["FJ1408M","left extensor hallucis longus","","left","l_shank",96.7,-68.5,14.1],
    ["FJ1414M","left flexor digitorum longus","","left","l_shank",74.3,-75.7,76.9],
    ["FJ1415M","left flexor hallucis longus","","left","l_shank",97.1,-62.1,43.6],
    ["FJ1595","right sternocleidomastoid","","right","cervical",-47.7,-84.6,1452.1],
    ["FJ1573","left sternocleidomastoid","","left","cervical",46,-84.1,1451.5],
    ["FJ1556","right digastric","anterior belly of right digastric","right","mandible",-11.7,-139.3,1431.4],
    ["FJ1579","right digastric","posterior belly of right digastric","right","skull",-44.3,-88.1,1473.4],
    ["FJ1583","right mylohyoid","","right","mandible",-21.7,-139.9,1443],
    ["FJ1580","right geniohyoid","","right","hyoid",-4.5,-135.6,1430.4],
    ["FJ1555","left digastric","anterior belly of left digastric","left","mandible",9.6,-139.1,1430.6],
    ["FJ1560","left digastric","","left","hyoid",13.8,-127.5,1434.7],
    ["FJ1578","left digastric","posterior belly of left digastric","left","skull",41.7,-87.6,1473.3],
    ["FJ1562","left mylohyoid","","left","mandible",18.5,-138.3,1441.5],
    ["FJ1559","left geniohyoid","","left","hyoid",3,-135.5,1430],
    ["FJ1500M","left infraspinatus muscle","","left","l_girdle",139.4,-39.6,1311.9],
    ["FJ1504M","left subscapularis","","left","l_girdle",122.1,-65.3,1298],
    ["FJ1506M","left supraspinatus","","left","l_girdle",108.5,-30,1321.9],
    ["FJ1507M","left teres major","","left","l_girdle",145.3,-48.4,1246.8],
    ["FJ1508M","left teres minor","","left","l_girdle",152.4,-45.2,1294.6],
    ["FJ1532M","left levator scapulae","","left","cervical",38.2,-65.7,1408.4],
    ["zf-frontalis-r","frontalis muscle.r","frontal belly of right occipitofrontalis","right","skull",-31.1,-171.5,1555.9],
    ["zf-frontalis-l","frontalis muscle.l","frontal belly of left occipitofrontalis","left","skull",30.2,-171.5,1555.8],
    ["zf-occipitalis-r","occipitalis muscle.r","occipital belly of right occipitofrontalis","right","skull",-55,-9.3,1528.2],
    ["zf-occipitalis-l","occipitalis muscle.l","occipital belly of left occipitofrontalis","left","skull",53.4,-9.4,1528.2],
    ["zf-temporoparietalis-r","temporoparietalis muscle.r","right temporoparietalis","right","skull",-76.2,-61.8,1545.5],
    ["zf-temporoparietalis-l","temporoparietalis muscle.l","left temporoparietalis","left","skull",74.8,-61.9,1544.8],
    ["zf-corrugator-supercilii-r","corrugator supercilii.r","right corrugator supercilii","right","skull",-16.1,-169.7,1540.1],
    ["zf-corrugator-supercilii-l","corrugator supercilii.l","left corrugator supercilii","left","skull",15.2,-169.6,1540.1],
    ["zf-procerus-r","procerus muscle.r","right half of procerus","right","skull",-4.9,-173.3,1535.6],
    ["zf-procerus-l","procerus muscle.l","left half of procerus","left","skull",3.9,-173.3,1535.6],
    ["zf-orbicularis-oculi-orbital-r","orbital part of orbicularis oculi.r","orbital part of right orbicularis oculi","right","skull",-44.7,-155,1520.1],
    ["zf-orbicularis-oculi-orbital-l","orbital part of orbicularis oculi.l","orbital part of left orbicularis oculi","left","skull",43.6,-154.9,1519.9],
    ["zf-orbicularis-oculi-palpebral-r","palpebral part of orbicularis oculi.r","palpebral part of right orbicularis oculi","right","skull",-38.9,-164.2,1525.7],
    ["zf-orbicularis-oculi-palpebral-l","palpebral part of orbicularis oculi.l","palpebral part of left orbicularis oculi","left","skull",37.9,-164.1,1525.6],
    ["zf-nasalis-r","nasalis muscle.r","right nasalis","right","skull",-10.7,-177.4,1506.9],
    ["zf-nasalis-l","nasalis muscle.l","left nasalis","left","skull",9.7,-177.4,1506.9],
    ["zf-depressor-septi-nasi-r","depressor septi nasi.r","right depressor septi nasi","right","skull",-9.9,-174.9,1475.7],
    ["zf-depressor-septi-nasi-l","depressor septi nasi.l","left depressor septi nasi","left","skull",8.8,-174.9,1475.6],
    ["zf-levator-labii-superioris-alaeque-nasi-r","levator nasolabialis.r","right levator labii superioris alaeque nasi","right","skull",-14.7,-168,1507.4],
    ["zf-levator-labii-superioris-alaeque-nasi-l","levator nasolabialis.l","left levator labii superioris alaeque nasi","left","skull",13.6,-167.9,1507.3],
    ["zf-levator-labii-superioris-r","levator labii superioris.r","right levator labii superioris","right","skull",-22.3,-164.1,1502.6],
    ["zf-levator-labii-superioris-l","levator labii superioris.l","left levator labii superioris","left","skull",21.2,-164,1502.5],
    ["zf-zygomaticus-minor-r","zygomaticus minor muscle.r","right zygomaticus minor","right","skull",-38.9,-159.1,1497.6],
    ["zf-zygomaticus-minor-l","zygomaticus minor muscle.l","left zygomaticus minor","left","skull",37.8,-159,1497.5],
    ["zf-zygomaticus-major-r","zygomaticus major muscle.r","right zygomaticus major","right","skull",-48.2,-147.9,1488],
    ["zf-zygomaticus-major-l","zygomaticus major muscle.l","left zygomaticus major","left","skull",47.1,-147.8,1487.8],
    ["zf-levator-anguli-oris-r","levator anguli oris.r","right levator anguli oris","right","skull",-20.3,-165.2,1488.4],
    ["zf-levator-anguli-oris-l","levator anguli oris.l","left levator anguli oris","left","skull",19.2,-165.1,1488.3],
    ["zf-risorius-r","risorius muscle.r","right risorius","right","mandible",-41.1,-140.9,1463.9],
    ["zf-risorius-l","risorius muscle.l","left risorius","left","mandible",39.9,-140.8,1463.8],
    ["zf-buccinator-r","bucinator.r","right buccinator","right","skull",-34.1,-143.3,1470.2],
    ["zf-buccinator-l","bucinator.l","left buccinator","left","skull",32.9,-143.2,1470.1],
    ["zf-orbicularis-oris-r","orbicularis oris muscle.r","right half of orbicularis oris","right","skull",-21.5,-171.7,1466.1],
    ["zf-orbicularis-oris-l","orbicularis oris muscle.l","left half of orbicularis oris","left","skull",20.3,-171.7,1466.1],
    ["zf-depressor-anguli-oris-r","depressor anguli oris.r","right depressor anguli oris","right","mandible",-32.1,-150.6,1450],
    ["zf-depressor-anguli-oris-l","depressor anguli oris.l","left depressor anguli oris","left","mandible",30.8,-150.6,1449.9],
    ["zf-depressor-labii-inferioris-r","depressor labii inferioris.r","right depressor labii inferioris","right","mandible",-24.4,-159.8,1448],
    ["zf-depressor-labii-inferioris-l","depressor labii inferioris.l","left depressor labii inferioris","left","mandible",23.2,-159.8,1447.9],
    ["zf-mentalis-r","mentalis muscle.r","right mentalis","right","mandible",-9.6,-166.5,1438.8],
    ["zf-mentalis-l","mentalis muscle.l","left mentalis","left","mandible",8.3,-166.5,1438.8],
    ["zf-platysma-r","platysma.r","right platysma","right","cervical",-48.5,-115.1,1394.1],
    ["zf-platysma-l","platysma.l","left platysma","left","cervical",47.1,-113.5,1406.2],
    ["zf-masseter-superficial-r","superficial part of masseter.r","superficial part of right masseter","right","mandible",-54.7,-127.5,1484.1],
    ["zf-masseter-superficial-l","superficial part of masseter.l","superficial part of left masseter","left","mandible",53.5,-127.4,1483.9],
    ["zf-masseter-deep-r","deep part of masseter.r","deep part of right masseter","right","mandible",-50.6,-110.3,1487.8],
    ["zf-masseter-deep-l","deep part of masseter.l","deep part of left masseter","left","mandible",49.4,-110.2,1487.7],
    ["zf-temporalis-r","temporalis muscle.r","right temporalis","right","skull",-53.7,-128.3,1534],
    ["zf-temporalis-l","temporalis muscle.l","left temporalis","left","skull",52.7,-128.2,1534],
    ["zf-medial-pterygoid-r","medial pterygoid muscle.r","right medial pterygoid","right","skull",-24.5,-123.2,1486],
    ["zf-medial-pterygoid-l","medial pterygoid muscle.l","left medial pterygoid","left","skull",23.3,-123.2,1485.9],
    ["zf-lateral-pterygoid-superior-r","superior head of lateral pterygoid muscle.r","superior head of right lateral pterygoid","right","skull",-35.2,-108.9,1502.8],
    ["zf-lateral-pterygoid-superior-l","superior head of lateral pterygoid muscle.l","superior head of left lateral pterygoid","left","skull",34.1,-108.8,1502.7],
    ["zf-lateral-pterygoid-inferior-r","inferior head of lateral pterygoid muscle.r","inferior head of right lateral pterygoid","right","skull",-36.7,-105.1,1500.6],
    ["zf-lateral-pterygoid-inferior-l","inferior head of lateral pterygoid muscle.l","inferior head of left lateral pterygoid","left","skull",35.5,-105,1500.5],
    ["FJ1421","right gracilis","","right","r_thigh",-18.2,-103.4,613.2],
    ["FJ1421M","left gracilis","","left","l_thigh",17.2,-103.5,613.2],
    ["FJ1402","right adductor longus","","right","r_thigh",-54,-116.8,688.7],
    ["FJ1402M","left adductor longus","","left","l_thigh",53.5,-117.1,688.5],
    ["FJ1401","right adductor brevis","","right","r_thigh",-57.8,-108.8,725.4],
    ["FJ1401M","left adductor brevis","","left","l_thigh",57.5,-109,725.4],
    ["FJ1427","right pectineus","","right","pelvis",-65.5,-120.3,765.9],
    ["FJ1427M","left pectineus","","left","pelvis",65.5,-120.5,765.7],
    ["FJ1438","right tensor fasciae latae","","right","pelvis",-141.5,-113.3,863.3],
    ["FJ1438M","left tensor fasciae latae","","left","pelvis",141.5,-113.3,863.3],
    ["FJ1420","right gluteus minimus","","right","pelvis",-102.8,-76.3,872.2],
    ["FJ1420M","left gluteus minimus","","left","pelvis",102.8,-76.3,872.2],
    ["FJ1410","right fibularis longus","","right","r_shank",-118.8,-47.8,146.1],
    ["FJ1410M","left fibularis longus","","left","l_shank",118.4,-47.7,146.3],
    ["FJ1409","right fibularis brevis","","right","r_shank",-98.9,-43.5,20.9],
    ["FJ1409M","left fibularis brevis","","left","l_shank",98.5,-43.3,20.7],
    ["FJ1411","right fibularis tertius","","right","r_shank",-94.5,-74.1,-66.3],
    ["FJ1411M","left fibularis tertius","","left","l_shank",94.2,-73.8,-66.5],
    ["FJ1440","right tibialis posterior","","right","r_shank",-100.1,-68,139.1],
    ["FJ1440M","left tibialis posterior","","left","l_shank",99.9,-67.7,139],
    ["FJ1407","right extensor hallucis brevis","","right","r_foot",-100.1,-126.6,-117.4],
    ["FJ1407M","left extensor hallucis brevis","","left","l_foot",99.8,-126.3,-117.6],
    ["FJ1413","right flexor digitorum brevis","","right","r_foot",-90.6,-106.9,-164.5],
    ["FJ1413M","left flexor digitorum brevis","","left","l_foot",90.4,-106.6,-164.7],
    ["FJ1527","right iliocostalis lumborum","","right","t12",-40.4,-19.4,1045.7],
    ["FJ1527M","left iliocostalis lumborum","","left","t12",40.4,-19.4,1045.7],
    ["FJ1528","right iliocostalis thoracis","","right","r_rib7",-67.3,-3,1217.6],
    ["FJ1528M","left iliocostalis thoracis","","left","l_rib7",67.3,-3,1217.6],
    ["FJ1526","right iliocostalis cervicis","","right","cervical",-29.6,-74.5,1387.5],
    ["FJ1526M","left iliocostalis cervicis","","left","cervical",29.1,-75,1387.8],
    ["FJ1535","right longissimus thoracis","","right","t11",-28.9,-11.8,1135.5],
    ["FJ1535M","left longissimus thoracis","","left","t11",28.9,-11.8,1135.5],
    ["FJ1534","right longissimus cervicis","","right","cervical",-36.6,-44.7,1370.5],
    ["FJ1534M","left longissimus cervicis","","left","cervical",37,-45.1,1370.9],
    ["FJ1533","right longissimus capitis","","right","cervical",-26.5,-67.4,1416],
    ["FJ1533M","left longissimus capitis","","left","cervical",26.8,-67.4,1416],
    ["FJ1544","right spinalis thoracis","","right","t6",-8.4,-2.9,1226],
    ["FJ1544M","left spinalis thoracis","","left","t7",8.4,-2.9,1226],
    ["FJ1545","right splenius capitis","","right","cervical",-25.8,-47.5,1442.1],
    ["FJ1545M","left splenius capitis","","left","cervical",25.9,-47.5,1442.1],
    ["FJ1538","right semispinalis capitis","","right","cervical",-5.2,-30.6,1468.3],
    ["FJ1538M","left semispinalis capitis","","left","cervical",5.2,-30.6,1468.3],
    ["FJ1592","right scalenus anterior","","right","cervical",-31.3,-87.2,1390.4],
    ["FJ1570","left scalenus anterior","","left","cervical",29,-86.5,1389.9],
    ["FJ1593","right scalenus medius","","right","cervical",-32.2,-79.5,1413],
    ["FJ1571","left scalenus medius","","left","cervical",30,-79.5,1411.4],
    ["FJ1594","right scalenus posterior","","right","cervical",-38,-73.2,1379.7],
    ["FJ1572","left scalenus posterior","","left","cervical",36.5,-74.2,1377.7],
    ["FJ1586","right omohyoid","","right","r_clav",-37.8,-105.3,1375.9],
    ["FJ1565","left omohyoid","","left","l_clav",37.3,-104.9,1374.5],
    ["FJ1596","right sternohyoid","","right","cervical",-11.4,-115.2,1390.6],
    ["FJ1574","left sternohyoid","","left","cervical",11.9,-114.6,1391.1],
    ["FJ1597","right sternothyroid","","right","cervical",-16,-109.7,1379.7],
    ["FJ1575","left sternothyroid","","left","cervical",15.5,-109.8,1378.3],
    ["FJ1598","right stylohyoid","","right","skull",-38.5,-101,1467.7],
    ["FJ1576","left stylohyoid","","left","skull",37,-101.6,1466.8],
    ["FJ1599","right thyrohyoid","","right","hyoid",-17.8,-114.4,1419.9],
    ["FJ1577","left thyrohyoid","","left","hyoid",14.8,-117.2,1419.7],
    ["FJ1357","right levator palpebrae superioris","","right","skull",-22.4,-134.8,1532.5],
    ["FJ1306","left levator palpebrae superioris","","left","skull",22.2,-134.4,1532.5],
    ["FJ1536","right rhomboid major","","right","t3",-14,-2.9,1298.6],
    ["FJ1536M","left rhomboid major","","left","t3",14,-2.9,1298.6],
    ["FJ1537","right rhomboid minor","","right","thorax",-17.2,-16.6,1351.8],
    ["FJ1537M","left rhomboid minor","","left","thorax",17.2,-16.6,1351.8],
    ["FJ1541","right serratus posterior inferior","","right","t11",-93.5,-39.5,1069],
    ["FJ1541M","left serratus posterior inferior","","left","t11",93.5,-39.5,1069],
    ["FJ1542","right serratus posterior superior","","right","r_rib3",-74.4,-39.7,1324.9],
    ["FJ1542M","left serratus posterior superior","","left","l_rib3",74.4,-39.7,1324.9],
    ["FJ1540","right semispinalis thoracis","","right","t5",-27.4,-11.8,1275.5],
    ["FJ1540M","left semispinalis thoracis","","left","t5",27.4,-11.8,1275.5],
    ["FJ1539","right semispinalis cervicis","","right","cervical",-21.8,-53.2,1385.1],
    ["FJ1539M","left semispinalis cervicis","","left","cervical",22.1,-53.1,1385.1],
    ["FJ1532","right levator scapulae","","right","cervical",-37.9,-65.7,1408.4],
    ["FJ1456","right pectoralis minor","","right","r_rib3",-106.2,-113.9,1279.7],
    ["FJ1456M","left pectoralis minor","","left","l_rib3",106.3,-113.9,1279.7],
    ["FJ1428","right piriformis","","right","pelvis",-62,-38.6,843.3],
    ["FJ1428M","left piriformis","","left","pelvis",62,-38.6,843.3],
    ["FJ1426","right obturator internus","","right","pelvis",-42.8,-81.3,800.6],
    ["FJ1426M","left obturator internus","","left","pelvis",42.8,-81.3,800.6],
    ["FJ1425","right obturator externus","","right","pelvis",-51.7,-67.8,774.9],
    ["FJ1425M","left obturator externus","","left","pelvis",51.7,-67.8,774.9],
    ["FJ1417","right gemellus superior","","right","pelvis",-77.8,-39.7,811.9],
    ["FJ1417M","left gemellus superior","","left","pelvis",77.8,-39.7,811.9],
    ["FJ1416","right gemellus inferior","","right","pelvis",-83.6,-37.9,791.2],
    ["FJ1416M","left gemellus inferior","","left","pelvis",83.6,-37.9,791.2],
    ["FJ1432","right quadratus femoris","","right","pelvis",-80,-48.9,766.5],
    ["FJ1432M","left quadratus femoris","","left","pelvis",80,-48.9,766.5],
    ["FJ1430","right popliteus","","right","r_shank",-92.3,-56.8,308.8],
    ["FJ1430M","left popliteus","","left","l_shank",92.1,-56.5,308.6],
    ["FJ1429","right plantaris","","right","r_shank",-62.1,-30.4,225.8],
    ["FJ1429M","left plantaris","","left","l_shank",59.7,-28.4,225.3],
    ["FJ1400","right abductor hallucis","","right","r_foot",-64.2,-105.8,-151.2],
    ["FJ1400M","left abductor hallucis","","left","l_foot",63.9,-105.6,-151.4],
    ["zm-latissimus-dorsi-r","latissimus dorsi muscle.r","right latissimus dorsi","right","r_rib9",-124.3,-23.8,1130.1],
    ["zm-latissimus-dorsi-l","latissimus dorsi muscle.l","left latissimus dorsi","left","l_rib9",122.8,-24,1130.3],
    ["zm-rectus-abdominis-r","rectus abdominis muscle.r","right rectus abdominis","right","pelvis",-59.6,-205,1003.2],
    ["zm-rectus-abdominis-l","rectus abdominis muscle.l","left rectus abdominis","left","pelvis",58.6,-203.6,1003.7],
    ["zm-internal-oblique-r","internal abdominal oblique muscle.r","right internal oblique","right","pelvis",-55.5,-198.5,958.3],
    ["zm-internal-oblique-l","internal abdominal oblique muscle.l","left internal oblique","left","pelvis",55.2,-197,957.5],
    ["zm-quadratus-lumborum-r","quadratus lumborum muscle.r","right quadratus lumborum","right","l2",-42.8,-41,1016.1],
    ["zm-quadratus-lumborum-l","quadratus lumborum muscle.l","left quadratus lumborum","left","t12",40.1,-40.9,1016],
    ["zm-longus-colli-r","longus colli muscle.r","right longus colli","right","cervical",-17.1,-86.4,1424.3],
    ["zm-longus-colli-l","longus colli muscle.l","left longus colli","left","cervical",15.6,-86.3,1424.3],
    ["zm-extensor-digitorum-brevis-r","extensor digitorum brevis.r","right extensor digitorum brevis","right","r_foot",-113,-120.3,-126.2],
    ["zm-extensor-digitorum-brevis-l","extensor digitorum brevis.l","left extensor digitorum brevis","left","l_foot",112.8,-119.9,-126.4],
    ["zm-flexor-hallucis-brevis-medial-r","medial head of flexor hallucis brevis.r","medial head of right flexor hallucis brevis","right","r_foot",-73.3,-144.8,-144.7],
    ["zm-flexor-hallucis-brevis-medial-l","medial head of flexor hallucis brevis.l","medial head of left flexor hallucis brevis","left","l_foot",73,-144.3,-144.8],
    ["zm-flexor-hallucis-brevis-lateral-r","lateral head of flexor hallucis brevis.r","lateral head of right flexor hallucis brevis","right","r_foot",-81.1,-139.9,-150.9],
    ["zm-flexor-hallucis-brevis-lateral-l","lateral head of flexor hallucis brevis.l","lateral head of left flexor hallucis brevis","left","l_foot",80.8,-139.5,-151.1],
    ["zm-transversus-abdominis-r","transversus abdominis muscle.r","right transversus abdominis","right","r_rib10",-96.5,-42,1068.5],
    ["zm-transversus-abdominis-l","transversus abdominis muscle.l","left transversus abdominis","left","l_rib10",113.1,-108,1026.5],
  ],
  check: {"coursePoints":453,"moved":29,"outside":0,"startedInBone":22,"onTheSurface":52,"detours":41,"lowestEnclosure":11,"musclePoints":292,"musclePointsPutOnTheMuscle":49,"musclePointsNearestPiece":52,"musclePointsOutside":0,"rootExitsMovedOutOfBone":12,"pieces":{"mm":13614,"inBoneMm":222,"inSkullPassagesMm":113,"pointsInBone":1,"left":{"mm":11210,"inBoneMm":199,"inSkullPassagesMm":108,"pointsInBone":1,"rightSamePiecesMm":11210,"rightSamePiecesInBoneMm":222}},"rigPivots":{"r_wrist":[-272.4,-127.9,705.6],"r_ankle":[-75.1,-70.2,-117.2],"r_elbow":[-224.1,-62.7,984.5],"r_knee":[-72,-79.3,349.8],"atlanto_occipital":[0.1,-73.5,1478.3],"lumbosacral":[-0.4,-50.6,926.8]}}
});
// END GENERATED COURSES
// ---------------------------------------------------------------------------------------------------------------------

// (null only while the block is being made for the first time: everything below then works on nothing)
const GEN = WIRING_GENERATED || deepFreeze({ canal: [], exits: {}, courses: {}, rules: {}, twigFrom: {}, rootJoin: {}, muscles: [], check: null });

// ---------------------------------------------------------------------------------------------------------------------
// The cord and the roots

const PIVOT_V = VERTEBRAL_PIVOTS.map(r => r[1]);
const r4 = x => Math.round(x * 1e4) / 1e4;
/** Between which two vertebral pivots the vertebral coordinate v lies, and how far along: { fromPivot, toPivot, t }
 * with t = 0 at fromPivot (the upper one) and 1 at toPivot (the lower one). Above the top pivot t is negative on the
 * first stretch; below the last pivot toPivot is null and t counts on in the same units down the sacrum. */
export function pivotSpanAt(v) {
  if (v <= PIVOT_V[0]) return { fromPivot: VERTEBRAL_PIVOTS[0][0], toPivot: VERTEBRAL_PIVOTS[1][0], t: r4((v - PIVOT_V[0]) / (PIVOT_V[1] - PIVOT_V[0])) };
  const last = PIVOT_V.length - 1;
  if (v > PIVOT_V[last]) return { fromPivot: VERTEBRAL_PIVOTS[last][0], toPivot: null, t: r4(v - PIVOT_V[last]) };
  let i = 0;
  while (i < last - 1 && v > PIVOT_V[i + 1]) i++;
  return { fromPivot: VERTEBRAL_PIVOTS[i][0], toPivot: VERTEBRAL_PIVOTS[i + 1][0], t: r4((v - PIVOT_V[i]) / (PIVOT_V[i + 1] - PIVOT_V[i])) };
}
/** The centre of the vertebral canal at vertebral coordinate v, in WIRING_FRAME (between the measured stations of the
 * generated block), or null before the block is generated. */
function canalAt(v) {
  const c = GEN.canal;
  if (!c.length) return null;
  if (v <= c[0][0]) return [c[0][1], c[0][2], c[0][3]];
  for (let i = 0; i + 1 < c.length; i++) {
    if (v <= c[i + 1][0]) { const t = (v - c[i][0]) / (c[i + 1][0] - c[i][0]); return [1, 2, 3].map(k => Math.round((c[i][k] + (c[i + 1][k] - c[i][k]) * t) * 10) / 10); }
  }
  const e = c[c.length - 1];
  return [e[1], e[2], e[3]];
}
/** A point of the cord (or, below CORD_END_V, of the bundle of roots) in the canal: { v, seg, p }. */
export function cordPointAt(v) { return { v, seg: vertebraSegmentAt(v), p: canalAt(v) }; }

/**
 * Where a segment of the cord lies: { level, v, vertebra, fromPivot, toPivot, t, seg, p }. fromPivot / toPivot / t
 * place it between two of the rig's vertebral pivots (t = 0 at the upper one); seg and p are the same place as a
 * rest point in the canal riding its vertebra. Null for a level that is not a cord level (a cranial nerve).
 */
export function cordLevelAt(level) {
  const v = own(CORD_SEGMENT_V, level);
  if (v === undefined) return null;
  return { level, v, vertebra: vertebraAt(v), ...pivotSpanAt(v), seg: vertebraSegmentAt(v), p: canalAt(v) };
}
/**
 * Where the nerve of a level leaves the column: { level, v, side, between, fromPivot, toPivot, t, seg, p }. The
 * point is at the side opening between two vertebrae (or, for S1 to S4, on the front of the sacrum), on the right
 * unless side is 'left'. Null for a level that is not a cord level.
 */
export function rootExitAt(level, side = 'right') {
  const v = own(ROOT_EXIT_V, level);
  if (v === undefined) return null;
  const e = own(GEN.exits, level) || null;
  const p = e ? (side === 'left' ? mirrorPoint(e) : e.slice()) : null;
  const n = CORD_LEVELS.indexOf(level);
  const between = level === 'C1' ? 'the skull and C1' : level[0] === 'C' && level !== 'C8' ? `C${n} and C${n + 1}` : level === 'C8' ? 'C7 and T1'
    : level[0] === 'T' ? (level === 'T12' ? 'T12 and L1' : `${level} and T${Number(level.slice(1)) + 1}`)
      : level[0] === 'L' ? (level === 'L5' ? 'L5 and the sacrum' : `${level} and L${Number(level.slice(1)) + 1}`) : `the sacrum (opening ${level.slice(1)})`;
  return { level, v, side: side === 'left' ? 'left' : 'right', between, ...pivotSpanAt(v), seg: vertebraSegmentAt(Math.max(v - 1e-6, 0)), p };
}
const CANAL_STEP = 0.5;
function canalRun(v0, v1) {
  const out = [];
  if (!GEN.canal.length) return out;
  const push = v => out.push(cordPointAt(Math.round(v * 100) / 100));
  push(v0);
  for (let v = Math.floor(v0 / CANAL_STEP) * CANAL_STEP + CANAL_STEP; v < v1 - 1e-9; v += CANAL_STEP) push(v);
  if (v1 > v0) push(v1);
  return out;
}
/** The cord's own centre line from its top (CORD_TOP_V; one point higher, inside the skull, comes first so a bridge
 * from the big brain has something to aim at) to its tip (CORD_END_V): [{ v, seg, p }]. */
export function cordCourse() { return GEN.canal.length ? canalRun(GEN.canal[0][0], CORD_END_V) : []; }
/** The bundle of roots below the cord's tip (the horse's tail), from the tip down to the lowest sacral opening. */
export function caudaCourse() { return canalRun(CORD_END_V, ROOT_EXIT_V.S4); }
/** The way of one root from its cord segment to where it leaves the column: down the canal (a long way for the
 * lumbar and sacral roots), then out sideways: [{ v, seg, p }], the last point being rootExitAt(level, side). */
export function rootCourse(level, side = 'right') {
  const a = own(CORD_SEGMENT_V, level), e = rootExitAt(level, side);
  if (a === undefined || !e || !e.p) return [];
  const run = a < e.v ? canalRun(a, e.v) : [cordPointAt(a)];
  return [...run, { v: e.v, seg: e.seg, p: e.p }];
}

// ---------------------------------------------------------------------------------------------------------------------
// The mirror rule: the left side is the right side with x negated. An id or a segment name `r_...` becomes `l_...`
// (mirrorId). The body rig has no left forearm or hand (the left arm is the game arm, its own rig, ns-rig SEGMENTS):
// a mirrored point on the arm keeps its `l_...` name and also says rig: 'arm' and the game arm's own segment name
// (armSeg): `l_forearm` is the game arm's `ulna`, `l_radius` its `forearm`, `l_hand` its `hand`, the finger bones alike,
// `l_upperarm` its `upperarm` (the body rig has a virtual `l_upperarm` too).

/** x -> -x. */
export function mirrorPoint(p) { return [p[0] === 0 ? 0 : -p[0], p[1], p[2]]; }
/** `r_x` <-> `l_x`; anything else (a midline name) is its own twin. */
export function mirrorId(id) { return typeof id !== 'string' ? id : id.startsWith('r_') ? `l_${id.slice(2)}` : id.startsWith('l_') ? `r_${id.slice(2)}` : id; }
/** Right-side body segments that are, on the left, segments of the game arm's rig (by the game arm's names). */
export const LEFT_ARM_SEGMENTS = freeze({
  r_upperarm: 'upperarm', r_armwrap: 'upperarm', r_forearm: 'ulna', r_radius: 'forearm', r_hand: 'hand',
  r_thumb_mc: 'thumb_mc', r_thumb_pp: 'thumb_pp', r_thumb_dp: 'thumb_dp',
  r_index_pp: 'index_pp', r_index_mp: 'index_mp', r_index_dp: 'index_dp', r_middle_pp: 'middle_pp', r_middle_mp: 'middle_mp', r_middle_dp: 'middle_dp',
  r_ring_pp: 'ring_pp', r_ring_mp: 'ring_mp', r_ring_dp: 'ring_dp', r_little_pp: 'little_pp', r_little_mp: 'little_mp', r_little_dp: 'little_dp'
});
/** The left-side twin of a right-side segment: { seg: 'l_...', rig: 'body' | 'arm', armSeg? }. A midline segment is
 * its own twin; a left-side one gives its right twin. */
export function mirrorSegment(seg) {
  const arm = own(LEFT_ARM_SEGMENTS, seg);
  return arm ? { seg: mirrorId(seg), rig: 'arm', armSeg: arm } : { seg: mirrorId(seg), rig: 'body' };
}
/** One course point mirrored to the left: { seg, p, rig, armSeg? }. */
export function mirrorCoursePoint(q) { return { ...mirrorSegment(q.seg), p: mirrorPoint(q.p) }; }

// ---------------------------------------------------------------------------------------------------------------------
// The trunks, assembled

function buildTrunks() {
  const out = {};
  for (const r of TRUNK_ROWS) {
    out[r.id] = { id: r.id, side: 'right', name: r.name, plain: r.plain, roots: r.roots, extraRoots: r.extraRoots || [], parent: r.parent, origin: r.origin || null, from: null,
      rootsLeave: null, rootJoin: null,
      course: (own(GEN.courses, r.id) || []).map(([seg, x, y, z]) => ({ seg, p: [x, y, z] })), src: r.src, rule: own(GEN.rules, r.id) || '', note: r.note || '' };
  }
  for (const t of Object.values(out)) {
    let a = t;
    for (let guard = 0; a.parent && out[a.parent] && guard < 8; guard++) a = out[a.parent];
    t.origin = a.origin || 'cord';
    if (!t.parent && t.origin === 'cord') {
      // where its roots leave the cord's side (through the openings between the vertebrae, or, for the accessory
      // nerve, inside the canal), and the course point each root joins at (the generated block's rootJoin; the first
      // point before the block is made)
      const row = TRUNK_ROWS.find(r => r.id === t.id), join = own(GEN.rootJoin, t.id) || {};
      t.rootsLeave = row.rootsLeave || 'opening';
      t.rootJoin = Object.fromEntries(t.roots.map(l => [l, Number.isInteger(join[l]) && join[l] < Math.max(1, t.course.length) ? join[l] : 0]));
    }
    if (t.parent && out[t.parent] && t.course.length) {
      const p0 = t.course[0].p, i = out[t.parent].course.findIndex(q => q.p[0] === p0[0] && q.p[1] === p0[1] && q.p[2] === p0[2]);
      t.from = i >= 0 ? i : null;
    }
  }
  return deepFreeze(out);
}
/**
 * Every drawn nerve of the RIGHT side: { [id]: { id, side, name, plain, roots, extraRoots, parent, origin, from, course,
 * rootsLeave, rootJoin, src, rule, note } }. Ids are `r_...` (`r_femoral`); the left twin of each is mirrorTrunk(id),
 * with the id `l_...`.
 * course: ordered points { seg, p } from the cord (or the brainstem) outward. parent: the id of the nerve it branches
 * from, or null; from: the index of the parent's course point where this branch leaves (its first point IS that
 * point). origin: 'cord', or for a cranial nerve and its branches 'midbrain' | 'pons' | 'medulla'.
 * For a nerve that starts at the cord (no parent, origin 'cord'): rootJoin = { level: index }, the point of ITS course
 * at which each of its roots joins it (the point at, or just below, where that root comes out: a plexus's roots do not
 * all meet at its first point); rootsLeave = 'opening' (each root reaches it from its opening between two vertebrae,
 * rootExitAt) or 'cord' (the accessory nerve: its roots leave the cord's side inside the canal, cordLevelAt). Both are
 * null for a branch and for a cranial nerve. trunkRootLines and rootWay give the lines ready.
 */
export const NERVE_TRUNKS = buildTrunks();

const MIRRORED = new Map();
/**
 * The twin of a trunk on the other side. For a right-side id (`r_femoral`): the left trunk, a record of the same
 * shape with id `l_femoral`, side 'left', parent `l_...`, and every course point mirrored (mirrorCoursePoint: x
 * negated, segment `l_...`, and for the arm rig: 'arm' with armSeg). For a left-side id: the right trunk
 * (NERVE_TRUNKS). Null for an unknown id.
 */
export function mirrorTrunk(id) {
  if (typeof id !== 'string') return null;
  const t = own(NERVE_TRUNKS, id);
  if (!t) return (id.startsWith('l_') && own(NERVE_TRUNKS, mirrorId(id))) || null;
  const mid = mirrorId(id);
  if (!MIRRORED.has(mid)) MIRRORED.set(mid, deepFreeze({ ...t, id: mid, side: 'left', parent: t.parent ? mirrorId(t.parent) : null, course: t.course.map(mirrorCoursePoint) }));
  return MIRRORED.get(mid);
}
/** A trunk of either side by its id (`r_...` from NERVE_TRUNKS, `l_...` its mirrored twin), or null. */
export function trunkById(id) { return typeof id !== 'string' ? null : own(NERVE_TRUNKS, id) || (id.startsWith('l_') && own(NERVE_TRUNKS, mirrorId(id)) ? mirrorTrunk(mirrorId(id)) : null); }
/** The chain of trunk ids from the outermost parent down to id, on id's own side
 * (['r_sacral_plexus', 'r_sciatic', 'r_tibial']). */
export function trunkChain(id) {
  const chain = [];
  for (let t = trunkById(id), guard = 0; t && guard < 8; t = trunkById(t.parent), guard++) chain.unshift(t.id);
  return chain;
}
/**
 * The drawn way from the outermost parent to a point of a trunk: the parents' courses up to where each branch leaves,
 * then this trunk's course up to index `upto` (default: its end). [{ seg, p, trunk, i, rig?, armSeg? }] (i: the point's
 * index in its trunk's course), on the trunk's
 * own side (`l_tibial` gives the mirrored way). start: the index of the OUTERMOST parent's course to begin at (default
 * 0; a root's join index, rootJoin, makes the way begin where that root joins: the way then runs on from there, or
 * back up the bundle where the branch leaves it above that point). An unknown id gives [].
 */
export function trunkPath(id, upto = null, start = 0) {
  const chain = trunkChain(id), out = [];
  chain.forEach((tid, k) => {
    const t = trunkById(tid), next = trunkById(chain[k + 1]);
    const end = next ? (next.from === null ? t.course.length - 1 : next.from) : (upto === null ? t.course.length - 1 : Math.min(upto, t.course.length - 1));
    if (k === 0) {
      const a = Math.min(Math.max(0, Number.isInteger(start) ? start : 0), t.course.length - 1);
      for (let i = a; a <= end ? i <= end : i >= end; i += a <= end ? 1 : -1) out.push({ ...t.course[i], trunk: tid, i });
    } else for (let i = 1; i <= end; i++) out.push({ ...t.course[i], trunk: tid, i });
  });
  return out;
}
/**
 * For a trunk that starts at the cord (through its outermost parent): the short line of each of that parent's roots
 * from where it leaves the column (its opening; for the accessory nerve the cord's own point of that level) to the
 * course point it joins at, on the trunk's own side: [{ level, join, leaves, points: [start, join point] }]. join is
 * the index into the outermost parent's course (its rootJoin). Empty for a cranial nerve and for an unknown id.
 */
export function trunkRootLines(id) {
  const top = trunkById(trunkChain(id)[0]);
  if (!top || top.origin !== 'cord' || !top.course.length || !top.rootJoin) return [];
  return top.roots.filter(l => own(ROOT_EXIT_V, l) !== undefined).map(level => {
    const join = top.rootJoin[level] || 0, c = cordLevelAt(level), e = rootExitAt(level, top.side);
    const start = top.rootsLeave === 'cord' ? { seg: c.seg, p: c.p } : { seg: e.seg, p: e.p };
    return { level, join, leaves: top.rootsLeave, points: [start, top.course[join]] };
  });
}
/**
 * The whole way of one root of a trunk that starts at the cord, from its segment of the cord to the point of the
 * trunk's course it joins: down inside the canal to its opening and out (rootCourse), then to the join point; for the
 * accessory nerve straight from the cord's side to the join point. [{ seg, p, v? }], the last point being
 * trunk.course[trunk.rootJoin[level]], on the trunk's own side. [] for a branch, a cranial nerve, an unknown id or a
 * level the trunk does not carry.
 */
export function rootWay(id, level) {
  const t = trunkById(id);
  if (!t || t.parent || t.origin !== 'cord' || !t.rootJoin || own(t.rootJoin, level) === undefined || !t.course.length) return [];
  const j = t.course[t.rootJoin[level]];
  if (t.rootsLeave === 'cord') { const c = cordLevelAt(level); return [{ v: c.v, seg: c.seg, p: c.p }, { seg: j.seg, p: j.p }]; }
  const run = rootCourse(level, t.side), last = run[run.length - 1];
  return last && last.p[0] === j.p[0] && last.p[1] === j.p[1] && last.p[2] === j.p[2] ? run : [...run, { seg: j.seg, p: j.p }];
}

// ---------------------------------------------------------------------------------------------------------------------
// Names: which row a muscle name means. The game's meshes and movements name one muscle in several ways ("long head
// of right biceps brachii", "left biceps brachii", "frontalis muscle.r", "set of lumbricals of right hand", "BIC").
// The rule is the game's own (ns-bodymap muscleNameMatches), kept here so this module stays free of game state: two
// names mean the same muscle when their words are the same, or when one has only extra "part words" (which head,
// which part, "muscle", "set of").

const PART_WORDS = new Set([
  'of', 'the', 'part', 'head', 'belly', 'set', 'half', 'muscle', 'muscles', 'portion', 'fibers', 'fibres',
  'long', 'short', 'lateral', 'medial', 'superficial', 'deep', 'oblique', 'transverse', 'horizontal', 'vertical',
  'clavicular', 'acromial', 'spinal', 'sternal', 'sternocostal', 'abdominal', 'costal', 'humeral', 'ulnar', 'radial', 'alar',
  'humeroulnar', 'frontal', 'occipital', 'orbital', 'palpebral', 'lacrimal',
  'superior', 'inferior', 'anterior', 'posterior', 'upper', 'lower', 'middle', 'ascending', 'descending'
]);
/** A muscle name taken apart: { side: 'left' | 'right' | null, words: Set }. Sides: the words left / right, or the
 * endings ".l" / ".r" of the face and extra packets. */
export function parseMuscleName(name) {
  let s = String(name || '').toLowerCase().trim(), side = null;
  const m = /\.(l|r)$/.exec(s);
  if (m) { side = m[1] === 'l' ? 'left' : 'right'; s = s.slice(0, -2); }
  const words = new Set();
  for (const w of s.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)) {
    if (!w) continue;
    if (w === 'left' || w === 'right') { side = side || w; continue; }
    words.add(w);
  }
  return { side, words };
}
const ROW_WORDS = MUSCLE_ROWS.map(r => r.names.map(n => parseMuscleName(n).words));
const subset = (a, b) => { for (const w of a) if (!b.has(w)) return false; return true; };
const extrasArePartWords = (big, small) => { for (const w of big) if (!small.has(w) && !PART_WORDS.has(w)) return false; return true; };
function rowIndexFor(words) {
  if (!words.size) return -1;
  for (let i = 0; i < ROW_WORDS.length; i++) for (const nw of ROW_WORDS[i]) if (nw.size === words.size && subset(nw, words)) return i;
  // the name is a part of a listed muscle ("long head of biceps brachii"): the most specific row wins
  let best = -1, size = -1;
  for (let i = 0; i < ROW_WORDS.length; i++) for (const nw of ROW_WORDS[i]) if (nw.size > size && subset(nw, words) && extrasArePartWords(words, nw)) { best = i; size = nw.size; }
  if (best >= 0) return best;
  // the name is the whole of a muscle listed only by its parts: the first such row (the name must hold a word of its
  // own: "transverse" or "abdominal" alone names no muscle)
  let real = false;
  for (const w of words) if (!PART_WORDS.has(w)) { real = true; break; }
  if (real) for (let i = 0; i < ROW_WORDS.length; i++) for (const nw of ROW_WORDS[i]) if (subset(words, nw) && extrasArePartWords(nw, words)) return i;
  return -1;
}

const BY_ID = new Map();   // mesh id -> { row index, side, name, end }
const BY_NAME = {};        // rig muscle name -> record
const RIG_ID = /^(FJ\d+M?|z[fm]-[a-z0-9-]+)$/;
const sided = (id, side) => (side === 'left' ? mirrorId(id) : id);
const LEFT_ALSO = new Map();
const alsoOf = (r, side) => { if (side !== 'left') return r.also; if (!LEFT_ALSO.has(r)) LEFT_ALSO.set(r, freeze(r.also.map(mirrorId))); return LEFT_ALSO.get(r); };
function record(rowIndex, side) {
  const r = MUSCLE_ROWS[rowIndex];
  return { trunk: sided(r.trunk, side), roots: r.roots, main: r.main, side, also: alsoOf(r, side), muscle: r.names[0], by: r.by, src: r.src, note: r.note };
}
function buildMuscles() {
  const byId = {};
  for (const [id, name, alias, side, seg, x, y, z] of GEN.muscles) {
    let i = alias ? rowIndexFor(parseMuscleName(alias).words) : -1;
    if (i < 0) i = rowIndexFor(parseMuscleName(name).words);
    if (i < 0) continue;
    const trunk = NERVE_TRUNKS[MUSCLE_ROWS[i].trunk]; // the right-side record: `at` is the same index on either side
    const end = { id, seg, p: [x, y, z] };
    // where the twig to this muscle leaves its nerve: the course point nearest the muscle's point (right-side frame);
    // a cranial nerve gives no twig inside the skull (GEN.twigFrom: the first, and where given the last, point allowed)
    let at = null;
    if (trunk && trunk.course.length) {
      const q = side === 'left' ? mirrorPoint(end.p) : end.p, tf = own(GEN.twigFrom || {}, trunk.id);
      const k0 = Array.isArray(tf) ? tf[0] : 0, k1 = Array.isArray(tf) && tf.length > 1 ? tf[1] : Infinity;
      let bd = Infinity;
      trunk.course.forEach((c, k) => { if (k < k0 || k > k1) return; const d = Math.hypot(c.p[0] - q[0], c.p[1] - q[1], c.p[2] - q[2]); if (d < bd) { bd = d; at = k; } });
      // a muscle served by a bundle from the cord itself: its twig leaves no higher than where the muscle's main root
      // joins the bundle (the way to it runs only outward; nervePathForMuscle)
      if (trunk.rootJoin) { const row = MUSCLE_ROWS[i], lv = own(trunk.rootJoin, row.main) !== undefined ? row.main : row.roots.find(l => own(trunk.rootJoin, l) !== undefined); if (lv) at = Math.max(at, trunk.rootJoin[lv]); }
    }
    const rec = { ...record(i, side), id, name, at, end };
    byId[id] = rec;
    BY_ID.set(id, rec);
    if (!BY_NAME[name]) BY_NAME[name] = { ...record(rowIndexFor(parseMuscleName(name).words) >= 0 ? rowIndexFor(parseMuscleName(name).words) : i, side), ends: [] };
    BY_NAME[name].ends.push({ ...end, at, trunk: rec.trunk });
  }
  return deepFreeze(byId);
}
/** Every muscle mesh of the rig by its id: { [mesh id]: { trunk, roots, main, side, also, muscle, by, src, note, id,
 * name, at, end: { id, seg, p } } }. `end` is the point in the muscle's belly where its nerve is drawn to end (on
 * the muscle's own side); `at` the index of the nerve's course point where the twig to it leaves. */
export const MUSCLE_NERVE_BY_ID = buildMuscles();
/** Every muscle of the rig by its name (packs/BODY-RIG.json `muscles[].name`): { [name]: { trunk, roots, main, side,
 * also, muscle, by, src, note, ends: [{ id, seg, p, at, trunk }] } }. A name shared by several meshes has several ends;
 * each end names its OWN nerve (`trunk`, the one of its mesh by id) and `at` is an index into that nerve's course: the
 * two meshes named "right digastric" are its two bellies, with two nerves. */
export const MUSCLE_NERVE = deepFreeze(BY_NAME);

/**
 * The nerve of a muscle, by any name or alias the game uses, on either side: a rig or motor-map name ("right biceps
 * brachii", "long head of left biceps brachii", "frontalis muscle.r", "orbicularis oris"), a mesh id ("FJ1478",
 * "zf-frontalis-l"), or a game-arm catalogue key ("BIC"). Returns { trunk, roots, main, side, also, muscle, by, src,
 * note } or null. trunk is the id of the nerve on the muscle's own side: `r_musculocutaneous` (a key of NERVE_TRUNKS)
 * for a right-side name or one that says no side, `l_musculocutaneous` (the id of mirrorTrunk('r_musculocutaneous'))
 * for a left-side name; trunkById(trunk) gives the record either way. side is null for a name that says no side.
 */
export function nerveForMuscle(name) {
  if (typeof name !== 'string' || !name) return null;
  if (RIG_ID.test(name) && BY_ID.has(name)) { const r = BY_ID.get(name); return { trunk: r.trunk, roots: r.roots, main: r.main, side: r.side, also: r.also, muscle: r.muscle, by: r.by, src: r.src, note: r.note }; }
  // a mesh of the left game arm ("FJ1478M"): the nerve of its right twin, on the left
  if (/^FJ\d+M$/.test(name) && BY_ID.has(name.slice(0, -1)) && BY_ID.get(name.slice(0, -1)).side === 'right') { const r = BY_ID.get(name.slice(0, -1)); return { trunk: mirrorId(r.trunk), roots: r.roots, main: r.main, side: 'left', also: freeze(r.also.map(mirrorId)), muscle: r.muscle, by: r.by, src: r.src, note: r.note }; }
  const key = own(ARM_CATALOG_NAMES, name) || name;
  const { side, words } = parseMuscleName(key);
  const i = rowIndexFor(words);
  return i < 0 ? null : record(i, side);
}
/** The muscle meshes of the rig that a trunk of either side serves first (their rows name it as `trunk`): [mesh id]. */
export function musclesOfTrunk(id) { return Object.values(MUSCLE_NERVE_BY_ID).filter(r => r.trunk === id).map(r => r.id); }

/**
 * The whole drawn way to one muscle mesh of the rig: from where its main root leaves the column (or, for a cranial
 * nerve, from the brainstem), to the point of its bundle that root joins at, along its nerve to where the twig
 * leaves, to the point in its belly.
 * Returns { id, trunk, side, level, origin, points: [{ seg, p, rig?, trunk? }] } or null. The cord's own stretch (from
 * the brain down to the main level) is cordCourse() / rootCourse(level, side). An id of the left game arm ("FJ1478M",
 * a mesh the body rig does not hold) gives its right twin's way mirrored (mirroredFrom), on the game arm's segments.
 */
export function nervePathForMuscle(id) {
  // a muscle of the left GAME ARM (the atlas's "...M" twin of a right-arm mesh; the body rig does not hold it): the
  // right twin's way, mirrored, its points on the game arm's segments
  const twin = !BY_ID.has(id) && /^FJ\d+M$/.test(String(id)) ? BY_ID.get(String(id).slice(0, -1)) : null;
  const r = twin && twin.side === 'right' ? twin : BY_ID.get(id);
  if (!r) return null;
  const mirrored = Boolean(twin && twin.side === 'right'), side = mirrored || r.side === 'left' ? 'left' : 'right';
  const trunk = mirrored ? mirrorId(r.trunk) : r.trunk, t = trunkById(trunk);
  if (!t || !t.course.length) return null;
  const chain = trunkChain(trunk), top = trunkById(chain[0]);
  // the level the way starts from: the muscle's main level where its bundle carries it, else the first of its levels
  // that the bundle carries
  const carried = l => top.origin === 'cord' && top.rootJoin && own(top.rootJoin, l) !== undefined;
  const level = carried(r.main) ? r.main : (r.roots.find(carried) || r.main);
  let pts, head = [];
  if (carried(level)) {
    // from where that root leaves the column (or, for the accessory nerve, the cord's side) to the point of the bundle
    // it joins at, then OUTWARD only: if the twig, or the branch the muscle's nerve leaves by, leaves the bundle above
    // that point, the root is taken to join there instead (the way never runs back up a bundle), and on the muscle's
    // own nerve the twig leaves no higher than the way has come
    const next = trunkById(chain[1]), join = top.rootJoin[level];
    const start = next ? Math.min(join, next.from === null ? top.course.length - 1 : next.from) : join;
    pts = trunkPath(trunk, next ? r.at : Math.max(r.at, join), start);
    const line = trunkRootLines(top.id).find(l => l.level === level), from = line.points[0], first = pts[0];
    if (!(first.p[0] === from.p[0] && first.p[1] === from.p[1] && first.p[2] === from.p[2])) head = [{ seg: from.seg, p: from.p }];
  } else pts = trunkPath(trunk, r.at);
  // the belly point is stored on the muscle's own side; for a mirrored game-arm muscle it is its twin's, mirrored
  const end = mirrored ? { ...mirrorCoursePoint({ seg: r.end.seg, p: r.end.p }), muscle: id } : { seg: r.end.seg, p: r.end.p, muscle: id };
  return { id, trunk, side, level, origin: t.origin, ...(mirrored ? { mirroredFrom: r.id } : {}), points: [...head, ...pts, end] };
}

/** Counts, for the tests and the design notes. */
export function wiringStats() {
  const trunks = Object.values(NERVE_TRUNKS);
  return {
    trunks: trunks.length, coursePoints: trunks.reduce((s, t) => s + t.course.length, 0), topLevel: trunks.filter(t => !t.parent).length,
    cranial: trunks.filter(t => t.origin !== 'cord').length, muscleRows: MUSCLE_ROWS.length, rigMuscles: Object.keys(MUSCLE_NERVE_BY_ID).length,
    brainLinks: BRAIN_LINKS.length, check: GEN.check
  };
}
