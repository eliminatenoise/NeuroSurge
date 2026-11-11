// NeuroSurge whole-body motor map (S1-bodymap, round 2, 2026-11-08).
//
// A pure data module, importable in Node without a DOM. It exports BODY_MOTOR_MAP in the agreed schema plus small pure
// helpers (region/action lookup by strip position, joint-target composition, muscle-name matching and a validator).
//
// What it is: a REPRESENTATIVE, one-dimensional, along-the-gyrus schematic of BOTH precentral gyri, for an
// educational game. Every value the game shows from it is a simulated, unitless display drive. Gaze, clicks and keys are
// virtual inputs, not stimulation or decoding. Nothing here is measured neural activity, EMG, force or a nerve
// recording. Region borders are game control borders, not anatomical borders, and no region is a unique cortical point
// for a muscle. NeuroTranslate 0.0 is the companion/model name and is NOT a validated decoder.
//
// Strip coordinate u (R558, strip audit round 2): the ALONG-GYRUS coordinate v that ns-brain alongGyrusCoordinate
// computes for each hemisphere's precentral mesh (FJ1801 right, FJ1800 left): the harmonic field on the mesh surface
// with 0 on the medial wall (where the strip leaves the midline) and 1 at the ventral tip next to the Sylvian fissure;
// its level lines cross the gyrus, so it increases from the medial wall over the top of the brain and down its side.
// On the medial wall itself the regions are ordered by medial depth (ns-brain MEDIAL_WALL). It is a geometric display
// coordinate of one atlas mesh, not a registration to any brain. (Before, u was the fraction of the mesh's |x| span.)
//
// Region fields (agreed schema): id, label, hemisphere ('right' | 'left'), bodySide ('left' | 'right' | 'midline'),
// effector, order (0 = most medial/dorsal, increasing along the gyrus), extent [u0, u1] (overlapping display field), medialSurface,
// isLeftArm, actions [{ id, label, armActionId, joints, agonists, antagonists }], explanation, citationKeys.
// Extra fields (additive; consumers may ignore them): kind ('effector' | 'integration'), centre (extent midpoint), core
// [c0, c1] (nearest-centre cell: a non-overlapping control partition that tiles [0, 1] per hemisphere; use it for gaze
// picking and region tint borders), shortLabel, displayGroup, pathway, laterality, noActionReason, caveat (one short
// plain-language hedge restating the explanation's own qualifier, shown by the info overlay), and per action:
// uCentre (representative control position used to pick an action inside a region; left-arm values are LEFT_ARM_ACTION_U,
// which region-mode picking and the marker dots use), stabilizers, catalogRoles (existing MOVEMENT-MAP catalog keys,
// left arm only), lateralBias, note.
//
// Plain-language fields (round 3, R3-text; user R17 "simple so that anyone can understand", lead decision D3). Additive:
// the technical label/effector/explanation/caveat/citations stay unchanged and are the "More detail" layer.
//   region: plainLabel ("Left knee", "Belly and back", "In-between area (upper)"), plainLead (ONE sentence: what the area
//   does, which half of the brain it is in), plainMoves (what it moves in THIS game, or "Nothing"), plainCaveat (one short
//   plain hedge restating the explanation's own qualifier).
//   action: plainLabel ("Bend left knee") and plainMuscles { pull, relax } (everyday muscle-group words, technical group
//   names only in brackets; derived only from that action's own agonists/antagonists, never adding a muscle).
// Plain fields never use the jargon deny-list of tests/unit/R3-text-jargon.test.mjs outside brackets.

/** Recursively freeze plain objects and arrays. */
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// Agreed id vocabularies

/** Joint ids of the non-left-arm body (agreed interface 2). */
export const BODY_JOINT_IDS = Object.freeze([
  'hip_flex_L', 'hip_flex_R', 'hip_abd_L', 'hip_abd_R', 'knee_ext_L', 'knee_ext_R', 'ankle_dorsi_L', 'ankle_dorsi_R',
  'toe_flex_L', 'toe_flex_R',
  'trunk_flex', 'neck_flex', 'neck_rot', 'jaw_open', 'brow_raise', 'eye_close', 'lip_purse', 'smile',
  'r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex', 'r_wrist_flex', 'r_wrist_ext', 'r_grasp', 'r_open', 'r_pronation',
  // R558 (Messages 14 / 15 / 2): more activation points, left-right symmetry and full ranges (ns-body BODY_JOINT_IDS).
  'ankle_inv_L', 'ankle_inv_R', 'hallux_flex_L', 'hallux_flex_R', 'trunk_side', 'trunk_rot', 'neck_side', 'jaw_side',
  'hyoid_elev', 'nose_wrinkle', 'upper_lip', 'lower_lip',
  'r_wrist_dev', 'r_thumb_flex', 'r_thumb_opp', 'r_index_flex', 'r_middle_flex', 'r_ring_flex', 'r_little_flex', 'r_finger_spread',
  // R558 (Space dance): rotation about the right humerus' and each femur's own long axis (+ = external).
  'r_shoulder_rot', 'hip_rot_L', 'hip_rot_R'
]);

/** Existing left-arm action ids (ns-actions ACTION_IDS, in map order) plus forearm rotation, plus (R558, Messages 14 /
 * 15) the game-defined left-hand actions that mirror the right hand's detail (ns-actions EXTRA_ARM_ACTION_IDS). */
export const LEFT_ARM_ACTION_IDS = Object.freeze([
  'grasp_close', 'relax_release', 'open_hand', 'spread_fingers',
  'wrist_flexion', 'wrist_extension', 'elbow_flexion', 'elbow_extension',
  'index_flexion', 'index_extension', 'thumb_mcp_flexion', 'thumb_mcp_extension',
  'pronation', 'supination',
  'fingers_together', 'middle_flexion', 'middle_extension', 'ring_flexion', 'ring_extension',
  'little_flexion', 'little_extension', 'thumb_opposition', 'thumb_reposition',
  'wrist_radial_deviation', 'wrist_ulnar_deviation'
]);

const sem = (positive, negative, lo, hi, side, unit = 'deg') => ({ unit, positive, negative, suggestedRange: [lo, hi], side });

/**
 * The joint-value convention this map assumes (for ns-body / ns-actions to reconcile with BODY_JOINT_LIMITS).
 * Every value is a signed angle in degrees from the BodyParts3D SOURCE POSE, which is the standard anatomical position
 * (standing upright, arms at the sides, palms facing forward). Positive = the direction the id names. A target of 0
 * returns the joint to the source pose. R558 (latch): an action's joint value is the ABSOLUTE end angle at which the
 * joint is left (it stays there until the opposing action or a reset brings it back), chosen as the largest angle the
 * rig's own limit allows inside normal adult range of motion. The four facial ids are not joint rotations: their values are nominal display
 * degrees, 0 (rest) .. 20 (full display amplitude), and ns-body should normalise them by that range.
 * suggestedRange is a game-safe range inside normal adult range of motion; the rig's own limits take precedence.
 */
export const JOINT_SEMANTICS = deepFreeze({
  // R558 audit (Message 2: "maximum anatomically feasible range of motion but never beyond"): every suggestedRange is
  // now the full ns-body BODY_JOINT_LIMITS range (adult active norms, AAOS 1965 / AMA Guides; the basis per joint is
  // in ns-body BODY_JOINT_LIMITS), so an action's end angle may be the joint's anatomical end.
  hip_flex_L: sem('hip flexion (thigh forward and up; about 90 at most with the knee straight, ns-body HIP_KNEE_COUPLING)', 'hip extension (thigh back)', -30, 120, 'left'),
  hip_flex_R: sem('hip flexion (thigh forward and up; about 90 at most with the knee straight, ns-body HIP_KNEE_COUPLING)', 'hip extension (thigh back)', -30, 120, 'right'),
  hip_abd_L: sem('hip abduction (leg out to the side)', 'hip adduction (leg toward the midline)', -30, 45, 'left'),
  hip_abd_R: sem('hip abduction (leg out to the side)', 'hip adduction (leg toward the midline)', -30, 45, 'right'),
  knee_ext_L: sem('knee extension (0 = straight, the source pose)', 'knee flexion', -135, 0, 'left'),
  knee_ext_R: sem('knee extension (0 = straight, the source pose)', 'knee flexion', -135, 0, 'right'),
  ankle_dorsi_L: sem('ankle dorsiflexion (toes up)', 'plantarflexion (toes down)', -50, 20, 'left'),
  ankle_dorsi_R: sem('ankle dorsiflexion (toes up)', 'plantarflexion (toes down)', -50, 20, 'right'),
  ankle_inv_L: sem('foot inversion (sole turns toward the midline)', 'foot eversion (sole turns outward)', -15, 35, 'left'),
  ankle_inv_R: sem('foot inversion (sole turns toward the midline)', 'foot eversion (sole turns outward)', -15, 35, 'right'),
  toe_flex_L: sem('second to fifth toe flexion at the MTP joints (curl)', 'second to fifth toe extension (lift)', -40, 40, 'left'),
  toe_flex_R: sem('second to fifth toe flexion at the MTP joints (curl)', 'second to fifth toe extension (lift)', -40, 40, 'right'),
  hallux_flex_L: sem('big toe flexion at the first MTP joint (curl)', 'big toe extension (lift)', -70, 45, 'left'),
  hallux_flex_R: sem('big toe flexion at the first MTP joint (curl)', 'big toe extension (lift)', -70, 45, 'right'),
  trunk_flex: sem('trunk flexion (bend forward)', 'trunk extension (lean back)', -25, 80, 'midline'),
  trunk_side: sem("trunk side bend toward the subject's LEFT", "side bend toward the subject's RIGHT", -35, 35, 'midline'),
  trunk_rot: sem("trunk rotation turning the chest toward the subject's LEFT", "rotation toward the subject's RIGHT", -45, 45, 'midline'),
  neck_flex: sem('neck flexion (chin down)', 'neck extension (chin up)', -60, 50, 'midline'),
  neck_rot: sem("rotation of the face toward the subject's LEFT", "rotation toward the subject's RIGHT", -80, 80, 'midline'),
  neck_side: sem("neck side bend (left ear toward the left shoulder)", "side bend toward the subject's RIGHT", -45, 45, 'midline'),
  jaw_open: sem('mandible depression (mouth opens)', 'none (0 = closed, the source pose)', 0, 30, 'midline'),
  jaw_side: sem("jaw side shift, chin toward the subject's LEFT (millimetres)", "side shift toward the subject's RIGHT", -10, 10, 'midline', 'mm'),
  hyoid_elev: sem('swallow: hyoid lift display amplitude (0..20 lifts the hyoid bone up to 15 mm)', 'none (0 = rest)', 0, 20, 'midline', 'display_deg'),
  brow_raise: sem('brow raise display amplitude', 'brow lowering (frown) display amplitude', -20, 20, 'midline', 'display_deg'),
  eye_close: sem('eyelid closure display amplitude', 'eyes opened wide display amplitude', -20, 20, 'midline', 'display_deg'),
  nose_wrinkle: sem('nose wrinkling display amplitude', 'nostril flaring display amplitude', -20, 20, 'midline', 'display_deg'),
  lip_purse: sem('lip pursing display amplitude', 'lips stretched wide display amplitude', -20, 20, 'midline', 'display_deg'),
  upper_lip: sem('upper lip lift display amplitude', 'none (0 = rest)', 0, 20, 'midline', 'display_deg'),
  lower_lip: sem('lower lip pushed up (pout) display amplitude', 'lower lip pulled down display amplitude', -20, 20, 'midline', 'display_deg'),
  smile: sem('mouth-corner lift display amplitude', 'mouth corners pulled down display amplitude', -20, 20, 'midline', 'display_deg'),
  r_shoulder_flex: sem('right shoulder flexion (arm forward)', 'right shoulder extension (arm back)', -60, 180, 'right'),
  r_shoulder_abd: sem('right shoulder abduction (arm out to the side)', 'adduction past the source pose', 0, 180, 'right'),
  r_elbow_flex: sem('right elbow flexion', 'none (0 = straight, the source pose)', 0, 145, 'right'),
  r_wrist_flex: sem('right wrist flexion (palmar)', 'none', 0, 80, 'right'),
  r_wrist_ext: sem('right wrist extension (dorsal)', 'none', 0, 70, 'right'),
  r_wrist_dev: sem('right wrist radial deviation (toward the thumb)', 'ulnar deviation (toward the little finger)', -30, 20, 'right'),
  r_grasp: sem('right finger and thumb closure toward a fist (degrees of digit flexion)', 'none', 0, 90, 'right'),
  r_open: sem('right finger and thumb opening beyond the source pose (degrees of digit extension)', 'none', 0, 30, 'right'),
  r_thumb_flex: sem('right thumb flexion at the MCP and IP joints (net digit degrees)', 'right thumb extension', -20, 90, 'right'),
  r_thumb_opp: sem('right thumb CMC turn across the palm (opposition)', 'right thumb out away from the palm (abduction / reposition)', -15, 40, 'right'),
  r_index_flex: sem('right index finger flexion (net digit degrees: MCP 90, PIP 105, DIP 85 at 90)', 'right index finger extension (MCP hyperextension)', -30, 90, 'right'),
  r_middle_flex: sem('right middle finger flexion (net digit degrees)', 'right middle finger extension', -30, 90, 'right'),
  r_ring_flex: sem('right ring finger flexion (net digit degrees)', 'right ring finger extension', -30, 90, 'right'),
  r_little_flex: sem('right little finger flexion (net digit degrees)', 'right little finger extension', -30, 90, 'right'),
  r_finger_spread: sem('right finger spread (MCP abduction away from the middle finger)', 'none (0 = fingers together, the source pose)', 0, 20, 'right'),
  r_pronation: sem('right forearm pronation from the palm-forward source pose (palm turns back/down)', 'none (0 = supinated, the source pose)', 0, 160, 'right'),
  // R558 (Space dance; no motor-map action names these yet: the dance turns them).
  r_shoulder_rot: sem('right shoulder external rotation (the front of the upper arm turns outward)', 'internal rotation (turns inward)', -70, 90, 'right'),
  hip_rot_L: sem('left hip external rotation (the toes turn outward)', 'internal rotation (the toes turn inward)', -40, 45, 'left'),
  hip_rot_R: sem('right hip external rotation (the toes turn outward)', 'internal rotation (the toes turn inward)', -40, 45, 'right')
});

// ---------------------------------------------------------------------------------------------
// Round 5 (R5-text, 2026-11-09): the face and chewing muscle packet (lead decision D20; user R24, and the user's
// 2026-11-09 choice "Download open models": only the face and chewing muscles, from an openly licensed atlas).
//
// BodyParts3D 4.0 has no facial-expression or chewing muscles, so until round 5 the face areas only kept a number.
// R5-face downloads them into packets/face-muscles-r1/ (CC BY-SA 4.0, share-alike; the game code stays CC0). The face
// regions' text below has two forms: status 'pending' (the round-4 text, byte-identical: nothing on the face moves or
// changes colour) and status 'loaded' (the face muscles light up in the shared colours; the face shape does not change;
// clenching colours the chewing muscles; the tongue muscles are still missing).
//
// TODO(R5-face / integrator): when packets/face-muscles-r1 is registered to the skull frame AND loaded on both bodies,
//   1. set status to 'loaded';
//   2. check `muscles` against the packet manifest's concept names (tests/unit/R5-text-face.test.mjs fails when a loaded
//      face text names a muscle that neither this list nor BodyParts3D has);
//   3. fill `source` and the ZANATOMY citation (verified: true once R5-face has confirmed the page, file and licence);
//   4. update the technical-layer pin in tests/unit/R3-text-bodymap.test.mjs (the loaded value is in
//      round5/R5-text-NOTES.md and in R3-text-bodymap's FACE_LOADED_SHA256).
/** The face-muscle packet record. muscles: the concept names the packet is EXPECTED to carry (R5-face selection table
 * acquisition/face-r1/tools/selection.py, read 2026-11-09, PRELIMINARY), both sides, plus the unsided and whole-muscle
 * aliases the map's action lists use ("procerus", "orbicularis oris", "left masseter", "left lateral pterygoid",
 * "left orbicularis oculi"). Not in it: the tongue muscles, levator palpebrae superioris and the ear muscles. */
export const FACE_PACKET = deepFreeze({
  id: 'face-muscles-r1',
  // R5-integrate-core (D20, R5-text W7): the packet is pinned (ns-app PINNED_SHA256.faceManifest), registered to the
  // BodyParts3D skull frame by R5-face and loaded on the body (ns-app startFaceStream -> one rig build).
  status: 'loaded',
  source: 'Z-Anatomy, the open source 3D atlas of anatomy (CC BY-SA 4.0), built on BodyParts3D',
  licence: 'CC BY-SA 4.0',
  muscles: [
    ...['frontal belly of {s} occipitofrontalis', 'occipital belly of {s} occipitofrontalis', '{s} frontalis', '{s} occipitofrontalis',
      '{s} temporoparietalis', '{s} corrugator supercilii', '{s} half of procerus', 'orbital part of {s} orbicularis oculi',
      'palpebral part of {s} orbicularis oculi', '{s} orbicularis oculi', '{s} nasalis', '{s} depressor septi nasi',
      '{s} levator labii superioris alaeque nasi', '{s} levator labii superioris', '{s} zygomaticus minor', '{s} zygomaticus major',
      '{s} levator anguli oris', '{s} risorius', '{s} buccinator', '{s} half of orbicularis oris', '{s} depressor anguli oris',
      '{s} depressor labii inferioris', '{s} mentalis', '{s} platysma', 'superficial part of {s} masseter', 'deep part of {s} masseter',
      '{s} masseter', '{s} temporalis', '{s} medial pterygoid', 'superior head of {s} lateral pterygoid',
      'inferior head of {s} lateral pterygoid', '{s} lateral pterygoid'].flatMap(t => ['left', 'right'].map(x => t.replace('{s}', x))),
    'procerus', 'orbicularis oris', 'mentalis'
  ]
});

/** True when the face-muscle packet is in the build (FACE_PACKET.status 'loaded'). */
export const FACE_MUSCLES_LOADED = FACE_PACKET.status === 'loaded';

// ---------------------------------------------------------------------------------------------
// Citations (doi_or_url is a DOI when one exists, else an official URL). verified = the bibliographic record and DOI/URL
// were confirmed (by this agent through the publisher/PMC/official page or DOI resolution, or by the accepted
// neurosurge-functional-map-r1 / map-delta-r62 manifests). A claim is used only as far as the stated `verification`.

const cite = (key, doi_or_url, verified, authors, year, title, venue, verification, usedFor) =>
  ({ key, doi_or_url, verified, authors, year, title, venue, verification, usedFor });

const CITATIONS = [
  cite('PENFIELD1937', '10.1093/brain/60.4.389', true, 'Penfield W, Boldrey E', 1937,
    'Somatic motor and sensory representation in the cerebral cortex of man as studied by electrical stimulation', 'Brain 60(4):389-443',
    'Publisher record (academic.oup.com) fetched 2026-11-08: title, authors, volume, pages and DOI confirmed. Full text not read.',
    'Classic medial-to-lateral somatotopic sequence (homunculus); stimulation-derived, summary drawing.'),
  cite('CATANI2017', '10.1093/brain/awx270', true, 'Catani M', 2017,
    'A little man of some importance', 'Brain 140(11):3055-3061',
    'PMC full text (PMC5841206) fetched 2026-11-08: confirms the original Penfield-Boldrey maps show overlapping stimulation fields that the drawing omits, and that the homunculus is a rough approximation; trunk had too few stimulations to measure.',
    'Overlap and imprecision of the homunculus; legs dorsal to arm/hand, face/mouth/tongue ventral.'),
  cite('GORDON2023', '10.1038/s41586-023-05964-2', true, 'Gordon EM, et al.', 2023,
    'A somato-cognitive action network alternates with effector regions in motor cortex', 'Nature 617:351-359',
    'Accepted citation manifest (neurosurge-functional-map-r1) with pinned PMC snapshot; passages re-read 2026-11-08: three inter-effector regions interleaved between foot, hand and mouth regions (seeds 1-6 down the gyrus: foot, inter-effector, hand, inter-effector, mouth, inter-effector); concentric effector zones (toes, fingers, tongue at centres; knee, shoulder, larynx on the perimeter); region-centre preferred movements listed as toes, abdominal, hand, eyelid, tongue, swallowing; abdominals and eyebrow raise co-activate inter-effector regions; a stimulation re-analysis found the middle inter-effector region never elicited movement; Fig. 4b is explicitly not a precise map.',
    'SCAN/inter-effector regions, concentric zones, whole-body/posture caveats.'),
  cite('DEO2026', '10.1038/s41586-026-10653-x', true, 'Deo DR, et al.', 2026,
    'A mosaic of whole-body representations on the human precentral gyrus', 'Nature 656(8128):680-687',
    'Accepted citation manifest (neurosurge-functional-map-r1) with pinned PMC snapshot; abstract re-read 2026-11-08: arrays sample the precentral crown, "thought to be composed largely of the premotor cortex (Brodmann area 6)"; the entire body was represented in all sampled locations, with relative strengths roughly consistent with the homunculus. Clinical participants with paralysis, left hemisphere only.',
    'BA6 crown versus BA4 in the sulcus; intermixed whole-body tuning.'),
  cite('WILLETT2020', '10.1016/j.cell.2020.02.043', true, 'Willett FR, et al.', 2020,
    'Hand knob area of premotor cortex represents the whole body in a compositional way', 'Cell 181(2):396-409',
    'Bibliographic record and abstract only, via map-delta-r62 section 8. Not re-read here.',
    'Whole-body tuning in the hand knob (supporting the overlap caveat).'),
  cite('HUBER2020', '10.1016/j.neuroimage.2019.116463', true, 'Huber L, et al.', 2020,
    'Sub-millimeter fMRI reveals multiple topographical digit representations that form action maps in human motor cortex', 'NeuroImage 208:116463',
    'Accepted citation manifest with pinned snapshot (left-hand grasp and retraction measured in the RIGHT hemisphere).',
    'Left-hand grasp/open action patches in the right hemisphere.'),
  cite('ARBUCKLE2020', '10.1523/JNEUROSCI.0999-20.2020', true, 'Arbuckle SA, et al.', 2020,
    'Structure of population activity in primary motor cortex for single finger flexion and extension', 'J Neurosci 40(48):9210-9223',
    'Accepted citation manifest with pinned snapshot (right hand, left M1; flexion and extension patterns overlap).',
    'Digit flexion/extension overlap; release instruction.'),
  cite('MASSE2017', '10.1002/hbm.23816', true, 'Masse-Alarie H, et al.', 2017,
    '"Discrete peaks" of excitability and map overlap reveal task-specific organization of primary motor cortex for control of human forearm muscles', 'Hum Brain Mapp 38(12):6118-6132',
    'Accepted citation manifest with pinned snapshot.',
    'Overlapping forearm-muscle maps with task-specific peaks (wrist, grip).'),
  cite('MEIER2008', '10.1152/jn.90531.2008', true, 'Meier JD, Aflalo TN, Kastner S, Graziano MSA', 2008,
    'Complex organization of human primary motor cortex: a high-resolution fMRI study', 'J Neurophysiol 100(4):1800-1812',
    'Accepted citation manifest with pinned snapshot (right limb, left cortex; finger emphasis bracketed dorsally and ventrally by wrist/forearm emphasis; elbow dorsal to the hand).',
    'Elbow/wrist/forearm placement relative to the fingers.'),
  cite('ZGRAGGEN2009', '10.1113/jphysiol.2009.171066', true, "Z'Graggen WJ, et al.", 2009,
    'Mapping of direction and muscle representation in the human primary motor cortex controlling thumb movements', 'J Physiol 587(Pt 9)',
    'Accepted citation manifest with pinned snapshot (right thumb, left M1; mirrored for the left thumb by inference).',
    'Thumb MCP flexion/extension.'),
  cite('VANDUINEN2008', '10.1002/hbm.20388', true, 'van Duinen H, Renken R, Maurits NM, Zijdewind I', 2008,
    'Relation between muscle and brain activity during isometric contractions of the first dorsal interosseus muscle', 'Hum Brain Mapp 29(3):281-299',
    'Accepted citation manifest with pinned snapshot.',
    'Index abduction (finger spreading).'),
  cite('MOTAWAR2012', '10.1007/s00221-012-3173-x', true, 'Motawar B, Hur P, Stinear J, Seo NJ', 2012,
    'Contribution of intracortical inhibition in voluntary muscle relaxation', 'Exp Brain Res 221(3):299-308',
    'Accepted citation manifest with pinned snapshot (release lowers FDS and EDC activity; cortical inhibition involved).',
    'Grip release is not active extension; release is not cortical silence.'),
  cite('BAWA2004', '10.1007/s00221-004-2031-x', true, 'Bawa P, Hamm JD, Dhillon P, Gross PA', 2004,
    'Bilateral responses of upper limb muscles to transcranial magnetic stimulation in human subjects', 'Exp Brain Res 158(3):385-390',
    'Bibliographic record and abstract only (Europe PMC), via map-delta-r62 section 8.',
    'Contralateral responses exceed ipsilateral; weaker ipsilateral input to proximal arm muscles.'),
  cite('DEVANNE2006', '10.1111/j.1460-9568.2006.04760.x', true, 'Devanne H, Cassim F, Ethier C, Brizzi L, Thevenon A, Capaday C', 2006,
    'The comparable size and overlapping nature of upper limb distal and proximal muscle representations in the human motor cortex', 'Eur J Neurosci 23(9):2467-2476',
    'Bibliographic record and abstract only (Europe PMC), via map-delta-r62 section 8.',
    'Proximal and distal arm representations overlap; distal optimal points more lateral.'),
  cite('RADEMACHER2001', '10.1093/brain/124.11.2232', true, 'Rademacher J, et al.', 2001,
    'Variability and asymmetry in the human precentral motor system: a cytoarchitectonic and myeloarchitectonic brain mapping study', 'Brain 124(11):2232-2258',
    'Bibliographic record and abstract only, via map-delta-r62 section 8.',
    'BA4 extent varies between brains and hemispheres.'),
  cite('YOUSRY1997', '10.1093/brain/120.1.141', true, 'Yousry TA, et al.', 1997,
    'Localization of the motor hand area to a knob on the precentral gyrus. A new landmark', 'Brain 120(Pt 1):141-157',
    'Bibliographic record and abstract only (Europe PMC), via map-delta-r62 section 8.',
    'The precentral "hand knob" landmark.'),
  cite('LEMON2008', '10.1146/annurev.neuro.31.060407.125547', true, 'Lemon RN', 2008,
    'Descending pathways in motor control', 'Annu Rev Neurosci 31:195-218',
    'Search index plus publisher abstract page (annualreviews.org) and citing PMC reference list, 2026-11-08. Full text not read.',
    'Corticospinal pathway; direct cortico-motoneuronal connections for fine hand control.'),
  cite('LOTZE2000', '10.1006/nimg.2000.0556', true, 'Lotze M, Erb M, Flor H, Huelsmann E, Godde B, Grodd W', 2000,
    'fMRI evaluation of somatotopic representation in human primary motor cortex', 'NeuroImage 11(5):473-481',
    'DOI resolved (doi.org -> Elsevier PII S1053811900905561) and bibliographic record from a search index, 2026-11-08; abstract summary only.',
    'fMRI somatotopic order of movement representation including foot and lips.'),
  cite('MORECRAFT2001', '10.1093/brain/124.1.176', true, 'Morecraft RJ, Louie JL, Herrick JL, Stilwell-Morecraft KS', 2001,
    'Cortical innervation of the facial nucleus in the non-human primate: a new interpretation of the effects of stroke and related subtotal brain trauma on the muscles of facial expression', 'Brain 124(1):176-208',
    'Publisher abstract (academic.oup.com) fetched 2026-11-08: M1 face area innervates primarily contralateral lower facial muscles; bilateral upper-face innervation comes from medial (M2/M3) areas. MONKEY tract tracing, not human.',
    'Upper face bilateral, lower face mainly contralateral (corticobulbar).'),
  cite('THOMPSON1997', '10.1093/brain/120.2.245', true, 'Thompson ML, Thickbroom GW, Mastaglia FL', 1997,
    'Corticomotor representation of the sternocleidomastoid muscle', 'Brain 120(2):245-255',
    'Institutional research-portal abstract fetched 2026-11-08: projections to both ipsilateral and contralateral SCM arise high on the convexity, close to the trunk representation; contralateral monosynaptic and possibly disynaptic ipsilateral pathways.',
    'Neck (SCM) laterality and the debated position of the neck representation.'),
  cite('FERBERT1992', '10.1016/0168-5597(92)90051-C', true, 'Ferbert A, Caramia D, Priori A, Bertolasi L, Rothwell JC', 1992,
    'Cortical projection to erector spinae muscles in man as assessed by focal transcranial magnetic stimulation', 'Electroencephalogr Clin Neurophysiol 85(6):382-387',
    'DOI resolved (doi.org -> Elsevier PII 016855979290051C) and bibliographic record from search indexes, 2026-11-08; ipsilateral and contralateral projections known only from citing-paper summaries.',
    'Trunk (erector spinae) receives corticospinal input from both hemispheres.'),
  cite('NORDSTROM2007', '10.1016/j.archoralbio.2006.09.013', true, 'Nordstrom MA', 2007,
    'Insights into the bilateral cortical control of human masticatory muscles revealed by transcranial magnetic stimulation', 'Arch Oral Biol 52(4):338-342',
    'DOI resolved (doi.org -> Elsevier PII S0003996906002603) and University of Adelaide repository abstract via search, 2026-11-08: the contralateral hemisphere has the greater excitatory influence; most masseter units are excited only from the contralateral hemisphere; digastric units often from both.',
    'Jaw: bilateral but asymmetric corticobulbar control.'),
  cite('MUELLBACHER2001', '10.1097/00004691-200111000-00005', true, 'Muellbacher W, Boroojerdi B, Ziemann U, Hallett M', 2001,
    'Analogous corticocortical inhibition and facilitation in ipsilateral and contralateral human motor cortex representations of the tongue', 'J Clin Neurophysiol (2001)',
    'DOI resolved (doi.org -> ovid.com) and abstract summary from a search index, 2026-11-08: focal TMS evoked ipsilateral and contralateral tongue responses, with lower thresholds contralaterally.',
    'Tongue: bilateral evoked muscle electrical responses and lower contralateral thresholds in a magnetic brain-stimulation study (abstract-level evidence only).'),
  cite('UAMS_UPPER', 'https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/muscle-tables/muscles-of-the-upper-limb/', true,
    'University of Arkansas for Medical Sciences, Department of Neuroscience', null, 'Muscles of the Upper Limb', 'official university anatomy table',
    'Accepted citation manifest with pinned snapshot; rows for pronator teres, pronator quadratus, supinator, biceps brachii (supinates, powerful only with the elbow flexed), pectoralis major, latissimus dorsi and coracobrachialis re-read 2026-11-08.',
    'Arm and forearm-rotation muscle actions.'),
  cite('UAMS_LOWER', 'https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/muscle-tables/muscles-of-the-lower-limb/', true,
    'University of Arkansas for Medical Sciences, Department of Neuroscience', null, 'Muscles of the Lower Limb', 'official university anatomy table',
    'Page fetched 2026-11-08: actions of iliacus, psoas major, quadriceps, gluteus maximus, hamstrings, tibialis anterior, toe extensors, gastrocnemius, soleus and toe flexors.',
    'Leg muscle actions.'),
  cite('UAMS_HEADNECK', 'https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/muscle-tables/muscles-of-the-head-and-neck/', true,
    'University of Arkansas for Medical Sciences, Department of Neuroscience', null, 'Muscles of the Head and Neck', 'official university anatomy table',
    'Page fetched 2026-11-08: actions of occipitofrontalis, corrugator, procerus, orbicularis oculi, levator palpebrae superioris, orbicularis oris, zygomaticus major, risorius, levator anguli oris, masseter, temporalis, pterygoids, digastric, mylohyoid, genioglossus, styloglossus, hyoglossus, sternocleidomastoid, splenius, longus colli.',
    'Face, jaw, tongue and neck muscle actions.'),
  cite('UAMS_ABDOMEN', 'https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/muscle-tables/muscles-of-the-abdominal-region/', true,
    'University of Arkansas for Medical Sciences, Department of Neuroscience', null, 'Muscles of the Abdominal Region', 'official university anatomy table',
    'Page fetched 2026-11-08: rectus abdominis flexes the trunk; external and internal obliques flex and laterally bend the trunk.',
    'Trunk flexors.'),
  cite('UAMS_BACK', 'https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/muscle-tables/muscles-of-the-back-region/', true,
    'University of Arkansas for Medical Sciences, Department of Neuroscience', null, 'Muscles of the Back Region', 'official university anatomy table',
    'Page fetched 2026-11-08: erector spinae columns (iliocostalis, longissimus, spinalis) extend and laterally bend the trunk; splenius capitis turns the head to the same side; trapezius rotates the scapula.',
    'Trunk and neck extensors.'),
  cite('LOYOLA', 'https://www.meddean.luc.edu/lumen/meded/grossanatomy/ue/ueaction.html', true,
    'Loyola University Chicago, LUMEN (McNulty JA)', null, 'Joint Actions of Upper Limb', 'official university anatomy atlas',
    'Accepted citation manifest with pinned snapshot.',
    'Upper-limb principal action groups.'),
  cite('BODYPARTS3D', 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/', false,
    'Database Center for Life Science (DBCLS)', null, 'BodyParts3D (CC BY 4.0)', 'anatomical mesh database',
    'Concept-name style (FMA English names such as "long head of left biceps brachii") taken from the pinned MESH-MANIFEST concepts; the landing URL itself was not fetched by S1, so verified is false.',
    'Muscle-name style used for agonist/antagonist lists.')
];

/** The face-mesh source citation, added to the map only when the face packet is loaded (R5-text). R5-integrate-core:
 * R5-face confirmed the page, file, commit, licence and attribution text (packets/face-muscles-r1/ACQUISITION-RECORD.json,
 * acquisition/face-r1/evidence; R5-face notes W5), so it is verified. */
const ZANATOMY_CITATION = cite('ZANATOMY', 'https://github.com/LluisV/Z-Anatomy/tree/6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX', true,
  'Z-Anatomy (Gauthier Kervyn, Lluis Vinent and contributors), built on BodyParts3D (Kousaku Okubo, DBCLS)', null, 'Z-Anatomy: the open source 3D atlas of anatomy (MuscularSystem100.fbx)',
  'open 3D anatomy atlas, CC BY-SA 4.0',
  'Page, file (MuscularSystem100.fbx, sha256 4c19df53...2279), commit 6c7f9016, licence and attribution text confirmed and saved by R5-face 2026-11-08T22:04-22:06Z (acquisition/face-r1/evidence; packets/face-muscles-r1/ATTRIBUTION-AND-LICENCES.txt).',
  'Face and chewing muscle meshes (packets/face-muscles-r1).');

// ---------------------------------------------------------------------------------------------
// Global caveats (shown with the info overlay / Esc page)

const CAVEATS = [
  'All activity in NeuroSurge is simulated and unitless. Gaze, clicks and keys are virtual inputs; nothing here is measured brain activity, stimulation, decoding, EMG, nerve activity or force.',
  "This is a representative, one-dimensional schematic along each precentral gyrus (u = a geometric along-the-gyrus coordinate of the atlas mesh, from the medial wall to the end next to the Sylvian fissure). It is not registered to any person's brain; real body-part representations overlap and vary between people and between hemispheres.",
  "Penfield's homunculus is a summary drawing of stimulation data whose original maps overlap a great deal (Penfield and Boldrey 1937; Catani 2017). Contemporary maps refine it: effector zones are concentric, and three inter-effector regions (the somato-cognitive action network, SCAN) interrupt the foot, hand and mouth zones (Gordon 2023).",
  'Single-neuron recordings on the precentral crown find the whole body represented, intermixed, at every sampled site (Deo 2026; Willett 2020). No region here is a unique cortical point for a muscle, and region borders are game control borders.',
  'The exposed crown of the precentral gyrus is thought to be largely premotor cortex (BA6); primary motor cortex (BA4) lies mostly in the anterior bank of the central sulcus, which the game cannot show. Coloured regions are therefore labelled motor territory, not BA4.',
  'Limb muscles are driven predominantly by the opposite (contralateral) hemisphere through the corticospinal tract; the LEFT arm is driven predominantly by the RIGHT hemisphere. Axial (trunk, neck), upper-face, jaw and tongue muscles receive substantial input from both hemispheres through corticospinal and corticobulbar pathways.',
  'Muscle lists are qualitative anatomical roles (agonist, antagonist, stabiliser) from anatomy tables, not fitted physiology. Activation does not always mean shortening, and muscle colour shows the simulated drive, not EMG or force.',
  'NeuroTranslate 0.0 is the companion/model name and is not a validated decoder; no trained translation model runs in this map.'
];

// ---------------------------------------------------------------------------------------------
// Strip layout per hemisphere (from the medial wall along the gyrus to its ventral end at the Sylvian fissure).
//
// Each region has a representative CENTRE u (strip coordinate, see the header). Its core is the set of strip points
// nearer to its centre than to any other centre of that hemisphere (cores therefore tile [0, 1] with borders at the
// midpoints between neighbouring centres), and its extent is the overlapping display field: symmetric about the centre,
// covering the whole core plus `overlap` on each side (clipped symmetrically at 0 and 1). This makes the two picking
// rules in use agree exactly: "the region whose core contains u" (regionAtU here) and "the nearest extent centre among
// the extents that contain u" (ns-brain regionOwnerAt). Every left-arm action position (LEFT_ARM_ACTION_U) lies inside
// the core of its own action's region.
//
// R558 (motor-strip accuracy audit, round 2; user: "make sure your primary motor cortex strip ... is as accurately
// placed as possible"): the strip coordinate is the ALONG-GYRUS coordinate v of ns-brain alongGyrusCoordinate (0 at the
// medial-wall edge, 1 at the ventral tip next to the Sylvian fissure, level lines across the gyrus), so the areas run in
// order all the way down the side of the brain. Before, u was the fraction of the mesh's |x| span: fine on top, but the
// gyrus is widest (|x| max) at z about 1578 mm, so its lowest 15 mm folded back (jaw, lips and lower face reappeared
// below the swallowing area, which sat above the jaw, and the lowest face areas formed rings round the side bulge).
// The centres are anchored on landmarks MEASURED in v on the atlas meshes themselves (FJ1801 / FJ1800, unmodified OBJ
// files, right / left; the meshes and their placement are unchanged):
// - Trunk end: the old trunk / shoulder border (|x| 17.2 / 16.1 mm) lies at v 0.131 / 0.141 on the gyrus seen from above
//   (median v of the visible strip in that |x| column) -> 0.135.
// - Hand knob (Yousry 1997): the posterior bulge of the precentral gyrus's posterior (central-sulcus) edge seen from above
//   peaks 3.1 / 3.2 mm behind its chord, half maximum v 0.190-0.277 / 0.198-0.284, deviation-weighted centre v 0.230 /
//   0.240 -> the hand centre 0.235. (The round-1 estimate "knob 0.34" was the median v of a whole |x| column through the
//   knob: on top the gyrus runs obliquely, so one |x| column spans v 0.23 at the posterior edge to 0.57 at the anterior
//   edge; that also is why the old |x| bands cut the gyrus slantwise.)
// - End of the hand zone: the superior frontal sulcus meets the precentral sulcus where the gyrus in front of the strip
//   changes from superior to middle frontal gyrus: v 0.373 / 0.386 along the strip's anterior edge -> the thumb ends at
//   0.38. So the hand zone (hand, fingers, thumb) spans from the knob on the central-sulcus side to the superior frontal
//   sulcus junction on the precentral-sulcus side, the two classic landmarks of the hand area; there the strip also turns
//   from the top of the brain onto its side (more of each v band seen from the side than from above beyond v 0.30-0.35).
// - Face: the inferior frontal sulcus meets the precentral sulcus at v 0.568 / 0.577 (middle -> inferior frontal gyrus in
//   front: brow / eyelid level); the lateral apex of the gyrus (|x| max, z 1577.8 / 1579.1) is at v 0.803 / 0.825 -> the jaw centre 0.814, so
//   lips lie above the apex and the tongue and the swallowing (SCAN inferior) area below it, at the ventral end.
// The new centres are the old (round-1) ones through a monotone piecewise-linear map with knots (old -> new) 0 -> 0,
// 0.2491 (trunk / shoulder border) -> 0.135, 0.44 (hand centre) -> 0.235, 0.59785 (thumb / neck border) -> 0.38 (for
// the shoulder ... thumb centres and the left-arm actions); the neck centre is then set to 0.4047 so that this border
// stays exactly at 0.38, and the face stretch maps 0.6247 (old neck centre) -> 0.4047, 0.9153 (jaw centre) -> 0.814,
// 1 -> 1; so the order
// and the relative sizes inside each stretch are kept, and the leg block (with the medial-wall regions) scales as one
// piece, which keeps the medial-wall rule's split (toes the deepest 42 % of the medial wall, ankle the upper 58 %).
// Each overlap keeps its old ratio to its region's own core. LEFT_ARM_ACTION_U moved through the same map (and the
// left-arm marker dots with it: ns-brain placeRegionMarkers). Measured result (both hemispheres): the face areas seen
// from the side are in Penfield order from neck down to the swallowing area at the ventral end, with no fold-back; the
// hand areas cover the knob on the central-sulcus edge. Still a schematic on one atlas brain (see CAVEATS).
const S = (key, centre, overlap = 0.03) => ({ key, centre, overlap });
// R558 (Message 14, "as many activation points across the motor strip ... as possible", and Message 15, symmetry): the
// hand zone has one area per digit in Penfield's medial-to-lateral order (hand, little, ring, middle, index, thumb;
// Penfield & Boldrey 1937), the face zone has a nose area, and a throat (swallowing) area follows the tongue (Penfield's
// sequence ends with swallowing); both hemispheres carry exactly the same set. Placed in the along-gyrus coordinate
// above, keeping every measured anchor: the hand stays on the knob (0.235) and the thumb keeps its centre (0.3553, its
// core still ending at the superior frontal sulcus junction, 0.38), with the four finger centres evenly between them,
// 0.02406 apart (little 0.2591, ring 0.2831, middle 0.3072, index 0.3312); brow (0.5582, the inferior frontal sulcus
// junction) and jaw (0.814, the gyrus apex) keep their centres, with eyelid, nose, lower face and lips evenly between
// them, 0.05116 apart; the throat takes the old ventral-end centre (0.9433) and scan_inferior moves to 0.981, the largest
// centre whose extent still covers its core symmetrically. Every other centre and overlap is the audited one. Each
// moved or new area's overlap keeps the audited ratio of overlap to core width (a new area takes its neighbour's ratio:
// the fingers the index's, the nose the eyelid's, the throat the old ventral area's). The narrowest sub-band on the strip
// is the hand's (core 0.03225 shared by up to five actions, 0.0065 each).
const STRIP_RIGHT = [
  S('toes', 0.0179, 0.0163), S('ankle', 0.0379, 0.0162), S('knee', 0.0623, 0.0163), S('hip', 0.084, 0.0163),
  S('scan_superior', 0.1057, 0.0163), S('trunk', 0.1274, 0.0161), S('shoulder', 0.1424, 0.0126), S('elbow', 0.1709, 0.0126),
  S('forearm', 0.1827, 0.0126), S('wrist', 0.1946, 0.0126), S('hand', 0.235, 0.0116), S('little', 0.2591, 0.0099),
  S('ring', 0.2831, 0.0099), S('middle', 0.3072, 0.0099), S('index', 0.3312, 0.0099), S('thumb', 0.3553, 0.021),
  S('neck', 0.4047, 0.0562), S('scan_middle', 0.4843, 0.0676), S('brow', 0.5582, 0.0413), S('eyelid', 0.6094, 0.0369),
  S('nose', 0.6605, 0.0369), S('lower_face', 0.7117, 0.0353), S('lips', 0.7628, 0.0353), S('jaw', 0.814, 0.0527),
  S('tongue', 0.9025, 0.0702), S('throat', 0.9433, 0.0179), S('scan_inferior', 0.981, 0.0172)
];
// Left hemisphere: the same layout; its hand and digit areas drive the right hand (one joint per digit since R558).
const RIGHT_HAND_KEYS = { hand: 'r_hand', little: 'r_little', ring: 'r_ring', middle: 'r_middle', index: 'r_index', thumb: 'r_thumb' };
const STRIP_LEFT = STRIP_RIGHT.map(x => (RIGHT_HAND_KEYS[x.key] ? S(RIGHT_HAND_KEYS[x.key], x.centre, x.overlap) : x));

const round5 = x => Math.round(x * 1e5) / 1e5;

/** Cores (nearest-centre cells) and symmetric extents from a centre sequence. Throws on an inconsistent layout (a
 * construction bug, never a runtime condition). */
function layoutStrip(seq) {
  const b = [0];
  for (let i = 0; i < seq.length - 1; i++) {
    if (!(seq[i + 1].centre > seq[i].centre)) throw new Error(`ns:bodymap_layout: centres must increase at ${seq[i + 1].key}`);
    b.push(round5((seq[i].centre + seq[i + 1].centre) / 2));
  }
  b.push(1);
  const out = {};
  seq.forEach((x, i) => {
    const m = x.centre, c0 = b[i], c1 = b[i + 1];
    const need = Math.max(m - c0, c1 - m);
    const w = round5(Math.min(need + x.overlap, m, 1 - m));
    if (w < need - 1e-9) throw new Error(`ns:bodymap_layout: the extent of ${x.key} cannot cover its core symmetrically`);
    out[x.key] = { centre: m, core: [c0, c1], extent: [round5(m - w), round5(m + w)] };
  });
  return out;
}
const LAYOUT = { right: layoutStrip(STRIP_RIGHT), left: layoutStrip(STRIP_LEFT) };
const RIGHT_HEMI_SEQUENCE = STRIP_RIGHT.map(x => x.key);
const LEFT_HEMI_SEQUENCE = STRIP_LEFT.map(x => x.key);


// ---------------------------------------------------------------------------------------------
// Region content builders. ctx: hemisphere (H), the body side it mainly controls (S) and its code (rh / lh).

function ctxFor(hemisphere) {
  return hemisphere === 'right'
    ? { H: 'right', S: 'left', So: 'right', Sc: 'Left', code: 'rh', J: 'L' }
    : { H: 'left', S: 'right', So: 'left', Sc: 'Right', code: 'lh', J: 'R' };
}
const both = n => [`left ${n}`, `right ${n}`];
/** R5-text: how the technical text names the face packet, and the face regions' citations (ZANATOMY when loaded). */
const FACE_PACKET_NAME = 'the face-muscle packet (face-muscles-r1)';
const FACE_PACKET_NAME_CAP = 'The face-muscle packet (face-muscles-r1)';
const faceCites = (c, keys) => (c.face ? [...keys, 'ZANATOMY'] : keys);
const sided = (side, ...names) => names.map(n => `${side} ${n}`);

/** R558: why each hemisphere shifts the jaw toward its own side. */
const JAW_SHIFT_NOTE = 'Game choice: the pterygoids of one side push the chin toward the other side, and each hemisphere drives the opposite pterygoids more strongly (a crossed bias, as for the masseter), so each hemisphere shifts the chin toward its own side.';
/** R558: the left wrist's sideways bends light and colour only (the game arm's hand fit has one wrist axis). */
const LEFT_WRIST_SIDE_NOTE = 'The game arm keeps its hand where you look with one wrist axis (bending toward the palm or back), so this sideways bend lights the area and colours its muscles but does not move the left hand. The right wrist does bend sideways.';

const LEG_PATHWAY = c => `Its corticospinal fibres cross in the medulla and reach the lumbosacral motor neurons of the ${c.S} leg.`;

const CONTENT = {
  toes: c => ({
    label: `${c.Sc} toes`, shortLabel: `${c.Sc[0]} toes`, effector: `toes (${c.S} foot): the big toe and the four small toes`, bodySide: c.S, medialSurface: true,
    displayGroup: `${c.S}_leg`, pathway: 'corticospinal', laterality: 'contralateral',
    actions: [
      // R558 (Message 14): the big toe is its own segment with its own long muscles, so it curls and lifts on its own
      // (first MTP flexion 45, extension 70: AAOS); the four small toes curl and lift together (MTP 40 / 40: AAOS).
      { id: `${c.code}_big_toe_curl`, label: `Curl ${c.S} big toe`, joints: { [`hallux_flex_${c.J}`]: 45 },
        agonists: sided(c.S, 'flexor hallucis longus', 'flexor hallucis brevis', 'abductor hallucis'),
        antagonists: sided(c.S, 'extensor hallucis longus', 'extensor hallucis brevis') },
      { id: `${c.code}_big_toe_lift`, label: `Lift ${c.S} big toe`, joints: { [`hallux_flex_${c.J}`]: -70 },
        agonists: sided(c.S, 'extensor hallucis longus', 'extensor hallucis brevis'),
        antagonists: sided(c.S, 'flexor hallucis longus', 'flexor hallucis brevis') },
      { id: `${c.code}_toes_curl`, label: `Curl ${c.S} small toes`, joints: { [`toe_flex_${c.J}`]: 40 },
        agonists: sided(c.S, 'flexor digitorum longus', 'flexor digitorum brevis'),
        antagonists: sided(c.S, 'extensor digitorum longus', 'extensor digitorum brevis') },
      { id: `${c.code}_toes_lift`, label: `Lift ${c.S} small toes`, joints: { [`toe_flex_${c.J}`]: -40 },
        agonists: sided(c.S, 'extensor digitorum longus', 'extensor digitorum brevis'),
        antagonists: sided(c.S, 'flexor digitorum longus', 'flexor digitorum brevis') }
    ],
    explanation: `Toe area for the ${c.S} foot, at the centre of the foot zone on the medial wall (paracentral lobule) of the ${c.H} hemisphere. ${LEG_PATHWAY(c)} The game sends a simulated, unitless drive that curls or lifts the ${c.S} big toe (flexor or extensor hallucis longus) or the four small toes (flexor or extensor digitorum longus) and colours those muscles with the brain's colour ramp, together with the short toe muscles of the sole (flexor hallucis and digitorum brevis) and the top of the foot (extensor hallucis and digitorum brevis). Toe movement activates this medial zone in fMRI and stimulation studies, but the position here is schematic: the strip's medial edge stands in for the medial wall, and the big toe and the small toes share one area.`,
    citationKeys: ['PENFIELD1937', 'GORDON2023', 'LOTZE2000', 'UAMS_LOWER']
  }),
  ankle: c => ({
    label: `${c.Sc} ankle`, shortLabel: `${c.Sc[0]} ankle`, effector: `ankle and foot (${c.S} leg)`, bodySide: c.S, medialSurface: true,
    displayGroup: `${c.S}_leg`, pathway: 'corticospinal', laterality: 'contralateral',
    actions: [
      { id: `${c.code}_ankle_dorsiflex`, label: `Pull ${c.S} foot up (dorsiflex)`, joints: { [`ankle_dorsi_${c.J}`]: 20 },
        agonists: sided(c.S, 'tibialis anterior', 'extensor digitorum longus', 'extensor hallucis longus', 'fibularis tertius'),
        antagonists: sided(c.S, 'gastrocnemius', 'soleus') },
      { id: `${c.code}_ankle_plantarflex`, label: `Point ${c.S} foot down (plantarflex)`, joints: { [`ankle_dorsi_${c.J}`]: -50 },
        agonists: sided(c.S, 'gastrocnemius', 'soleus', 'plantaris', 'fibularis longus', 'fibularis brevis', 'tibialis posterior'),
        antagonists: sided(c.S, 'tibialis anterior', 'fibularis tertius') },
      // R558 (Message 14): foot inversion 35 / eversion 15 (AAOS).
      { id: `${c.code}_ankle_invert`, label: `Turn ${c.S} sole inward (invert)`, joints: { [`ankle_inv_${c.J}`]: 35 },
        agonists: sided(c.S, 'tibialis posterior', 'tibialis anterior'),
        antagonists: sided(c.S, 'fibularis longus', 'fibularis brevis'),
        note: 'One turning axis through the ankle centre stands in for the joints below the ankle (subtalar and midtarsal).' },
      { id: `${c.code}_ankle_evert`, label: `Turn ${c.S} sole outward (evert)`, joints: { [`ankle_inv_${c.J}`]: -15 },
        agonists: sided(c.S, 'fibularis longus', 'fibularis brevis', 'fibularis tertius', 'extensor digitorum longus'),
        antagonists: sided(c.S, 'tibialis posterior', 'tibialis anterior'),
        note: 'One turning axis through the ankle centre stands in for the joints below the ankle (subtalar and midtarsal).' }
    ],
    explanation: `Ankle and foot area for the ${c.S} leg, beside the toe area on the medial wall and paracentral lobule. ${LEG_PATHWAY(c)} The game simulates the ${c.S} ankle pulling up (tibialis anterior) or pointing down (gastrocnemius and soleus, helped by the fibularis muscles and tibialis posterior), and the sole turning inward (tibialis posterior and anterior) or outward (the fibularis muscles). The foot zone is concentric, with the toes at its centre and ankle, knee and hip in rings around it (Gordon 2023), so these leg regions overlap rather than sit in a strict line.`,
    citationKeys: ['PENFIELD1937', 'GORDON2023', 'UAMS_LOWER']
  }),
  knee: c => ({
    label: `${c.Sc} knee`, shortLabel: `${c.Sc[0]} knee`, effector: `knee (${c.S} leg)`, bodySide: c.S, medialSurface: false,
    displayGroup: `${c.S}_leg`, pathway: 'corticospinal', laterality: 'contralateral',
    actions: [
      { id: `${c.code}_knee_flex`, label: `Bend ${c.S} knee`, joints: { [`knee_ext_${c.J}`]: -135 },
        agonists: sided(c.S, 'biceps femoris', 'semitendinosus', 'semimembranosus', 'popliteus'),
        antagonists: sided(c.S, 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'),
        stabilizers: sided(c.S, 'gastrocnemius', 'plantaris'),
        note: 'From the long-sitting start the heel stays on the ground and the thigh lift is capped (ns-body groundLegAngles), so the drawn knee bends only part of the way while the held goal is the full bend.' },
      { id: `${c.code}_knee_extend`, label: `Straighten ${c.S} knee`, joints: { [`knee_ext_${c.J}`]: 0 },
        agonists: sided(c.S, 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'),
        antagonists: sided(c.S, 'biceps femoris', 'semitendinosus', 'semimembranosus'),
        note: 'At the start pose the knee is already straight, so this shows the quadriceps without moving the knee; after a knee bend it straightens the knee again. Isometric force is not modelled.' }
    ],
    explanation: `Knee area for the ${c.S} leg, near the dorsal margin of the ${c.H} hemisphere between the foot and hip areas. ${LEG_PATHWAY(c)} The game simulates bending the ${c.S} knee (hamstrings) or straightening it (quadriceps). The knee lies in a ring of the concentric foot zone and overlaps the ankle and hip areas.`,
    citationKeys: ['PENFIELD1937', 'GORDON2023', 'UAMS_LOWER']
  }),
  hip: c => ({
    label: `${c.Sc} hip`, shortLabel: `${c.Sc[0]} hip`, effector: `hip (${c.S} leg)`, bodySide: c.S, medialSurface: false,
    displayGroup: `${c.S}_leg`, pathway: 'corticospinal', laterality: 'contralateral',
    actions: [
      // R558 (latch; start posture: sitting on an invisible flat ground, legs straight forward, hips flexed 90). Lifting
      // ends at 120 (AAOS, knee bent); the drawn hip stops at 100 while the knee is straight (ns-body HIP_KNEE_COUPLING,
      // the straight-leg limit set by the hamstrings) and at 110 where the rigid thigh and belly meshes meet
      // (BODY_POSTURE_LIMITS). Extension lowers it back to the ground (90), where the leg rests: it cannot go below a
      // flat ground (user: "an invisible ground ... flat"). Abduction ends at 45 (AAOS); adduction stops at 0, the legs
      // side by side.
      { id: `${c.code}_hip_flex`, label: `Lift ${c.S} thigh (hip flexion)`, joints: { [`hip_flex_${c.J}`]: 120 },
        agonists: sided(c.S, 'iliacus', 'psoas major', 'rectus femoris', 'sartorius', 'tensor fasciae latae', 'pectineus'),
        antagonists: sided(c.S, 'gluteus maximus', 'biceps femoris', 'semitendinosus', 'semimembranosus'),
        note: 'With the knee straight, the hamstrings stop hip flexion at about 100 degrees, 10 above the ground; bend the knee first and the thigh lifts on to 110 degrees, where the rigid thigh and belly meshes would start to pass into each other (anatomical range about 120 with a bent knee).' },
      { id: `${c.code}_hip_extend`, label: `Lower ${c.S} thigh to the ground (hip extension)`, joints: { [`hip_flex_${c.J}`]: 90 },
        agonists: sided(c.S, 'gluteus maximus', 'biceps femoris', 'semitendinosus', 'semimembranosus'),
        antagonists: sided(c.S, 'iliacus', 'psoas major') },
      // R558 (builder AN): with the hip bent 90 degrees (long sitting), piriformis swings the thigh out as well (its
      // action reverses from outward turning to abduction when the hip is bent past about 60 degrees; standard anatomy).
      { id: `${c.code}_hip_abduct`, label: `Swing ${c.S} thigh out (hip abduction)`, joints: { [`hip_abd_${c.J}`]: 45 },
        agonists: sided(c.S, 'gluteus medius', 'gluteus minimus', 'tensor fasciae latae', 'piriformis'),
        antagonists: sided(c.S, 'adductor magnus', 'adductor longus', 'adductor brevis') },
      { id: `${c.code}_hip_adduct`, label: `Swing ${c.S} thigh in (hip adduction)`, joints: { [`hip_abd_${c.J}`]: 0 },
        agonists: sided(c.S, 'adductor magnus', 'adductor longus', 'adductor brevis', 'gracilis', 'pectineus'),
        antagonists: sided(c.S, 'gluteus medius', 'gluteus minimus'),
        note: 'Stops with the legs side by side (the source pose, knees nearly touching): the full 30 degrees of adduction would take the leg into the other leg.' }
    ],
    explanation: `Hip area for the ${c.S} leg, at the outer ring of the foot zone where it meets trunk territory. ${LEG_PATHWAY(c)} The game simulates lifting the ${c.S} thigh (iliopsoas, rectus femoris and sartorius) or lowering it back to the ground (gluteus maximus and hamstrings), and swinging it out (gluteus medius and minimus) or back in (the adductors). Proximal leg muscles also take part in posture and balance, which this game does not model.`,
    citationKeys: ['PENFIELD1937', 'GORDON2023', 'UAMS_LOWER']
  }),
  scan_superior: c => ({
    label: 'Superior inter-effector (SCAN)', shortLabel: 'SCAN sup.', effector: 'inter-effector region between the foot and hand zones (somato-cognitive action network); no isolated body part',
    bodySide: 'midline', medialSurface: false, kind: 'integration', displayGroup: 'integration', pathway: 'integration', laterality: 'bilateral network',
    actions: [],
    noActionReason: 'Inter-effector regions show weak movement specificity and are linked to action planning, posture and axial control; the game moves nothing here.',
    explanation: `Superior inter-effector region of the somato-cognitive action network (SCAN), interleaved between the foot and hand zones of the ${c.H} hemisphere (Gordon 2023). It is strongly connected to the other inter-effector regions and to the cingulo-opercular action-control network, and it was most engaged by abdominal contraction and during action planning, not by moving one body part. In the game, looking here lights and marks the region but deliberately moves nothing. Any real contribution would be whole-body postural or preparatory control, which is not simulated.`,
    citationKeys: ['GORDON2023']
  }),
  trunk: c => ({
    label: 'Trunk', shortLabel: 'Trunk', effector: 'trunk (abdominal and back muscles, both sides)', bodySide: 'midline', medialSurface: false,
    displayGroup: 'trunk', pathway: 'corticospinal', laterality: 'bilateral',
    actions: [
      // R558 (Message 2): thoracolumbar flexion 80, extension 25, side bend 35, rotation 45 (AAOS).
      // R558 (builder AN): the prime movers of trunk extension, the erector spinae columns (iliocostalis, longissimus,
      // spinalis; BodyParts3D 4.0 members) and quadratus lumborum (Z-Anatomy), are drawn now (packets/missing-muscles-r1),
      // so "Lean trunk back" names them again and the issue-hunt-2 stopgap (latissimus dorsi and gluteus maximus standing
      // in for them) is dropped. Multifidus and the other transversospinal muscles are still not drawn.
      { id: `${c.code}_trunk_flex`, label: 'Bend trunk forward', joints: { trunk_flex: 80 },
        agonists: [...both('rectus abdominis'), ...both('external oblique'), ...both('internal oblique')],
        antagonists: [...both('iliocostalis lumborum'), ...both('iliocostalis thoracis'), ...both('longissimus thoracis'), ...both('spinalis thoracis'), ...both('semispinalis thoracis')],
        stabilizers: both('transversus abdominis') },
      { id: `${c.code}_trunk_extend`, label: 'Lean trunk back', joints: { trunk_flex: -25 },
        agonists: [...both('iliocostalis lumborum'), ...both('iliocostalis thoracis'), ...both('longissimus thoracis'), ...both('spinalis thoracis'), ...both('semispinalis thoracis'), ...both('quadratus lumborum')],
        antagonists: [...both('rectus abdominis'), ...both('external oblique'), ...both('internal oblique')] },
      { id: `${c.code}_trunk_side`, label: `Bend trunk to the ${c.S}`, joints: { trunk_side: c.S === 'left' ? 35 : -35 },
        agonists: sided(c.S, 'external oblique', 'internal oblique', 'quadratus lumborum', 'iliocostalis lumborum', 'iliocostalis thoracis', 'longissimus thoracis'),
        antagonists: sided(c.So, 'external oblique', 'internal oblique', 'quadratus lumborum'),
        note: 'Game choice, as for the neck: each hemisphere bends the trunk toward the opposite body side; the trunk muscles get input from both hemispheres.' },
      { id: `${c.code}_trunk_turn`, label: `Turn trunk to the ${c.S}`, joints: { trunk_rot: c.S === 'left' ? 45 : -45 },
        agonists: [`${c.So} external oblique`, `${c.S} internal oblique`],
        antagonists: [`${c.S} external oblique`, `${c.So} internal oblique`],
        note: 'Game choice, as for the neck: each hemisphere turns the trunk toward the opposite body side. The pelvis and legs stay on the ground; the chest, arms and head turn, and your view turns with the head.' }
    ],
    explanation: `Trunk area for the abdominal and back muscles, between the hip and shoulder areas and overlapping the superior inter-effector region. Axial muscles receive corticospinal input from both hemispheres (erector spinae: Ferbert 1992), so each hemisphere's trunk region moves the whole trunk in the game. The game simulates bending forward (rectus abdominis and obliques), leaning back (the erector spinae columns: iliocostalis, longissimus and spinalis, with quadratus lumborum), bending to the ${c.S} (the ${c.S} obliques, quadratus lumborum and erector spinae) and turning to the ${c.S} (the ${c.So} external and ${c.S} internal oblique). Abdominal contraction also co-activates the inter-effector regions (Gordon 2023), and Penfield's maps had too few trunk stimulations to measure (Catani 2017); breathing and posture are not modelled.`,
    citationKeys: ['GORDON2023', 'FERBERT1992', 'CATANI2017', 'UAMS_ABDOMEN', 'UAMS_BACK']
  }),
  shoulder: c => (c.H === 'right' ? {
    label: 'Left shoulder', shortLabel: 'L shoulder', effector: 'shoulder (left arm)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [],
    noActionReason: 'The left shoulder follows the camera look and W/A/S/D (the reach lane); it has no separate gaze action, so looking here only lights and marks the region.',
    explanation: 'Shoulder area for the LEFT arm, at the medial edge of the arm and hand zone of the right hemisphere. Crossed corticospinal fibres dominate, with weaker same-side input to proximal muscles such as the deltoid (Bawa 2004). In NeuroSurge the left shoulder is carried by your look and by W/A/S/D, so looking here lights and marks the region without adding a separate movement. Stimulation rarely evokes isolated shoulder movement (Gordon 2023), and the anatomical mesh collection does not establish muscle recruitment. Shoulder activity here is simulated, not measured.',
    citationKeys: ['GORDON2023', 'BAWA2004', 'DEVANNE2006', 'UAMS_UPPER']
  } : {
    label: 'Right shoulder', shortLabel: 'R shoulder', effector: 'shoulder (right arm)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      // R558 (latch; start posture: the right arm straight forward, flexion 90). R558 (Message 2): flexion raises it on to
      // 180 (AAOS, arm straight up beside the head); extension swings it down and back to -60 (AAOS). With the arm
      // forward, abduction swings it out to the side in the horizontal plane (ns-body turns abd before flex): 135 = 45
      // degrees behind the side line, the AAOS end of horizontal extension; adduction swings it back to straight
      // forward. Serratus anterior (it turns the shoulder blade up for an overhead reach), infraspinatus and teres minor
      // (horizontal abduction) and subscapularis (adduction) are movers too, so a tap on any shoulder muscle moves the arm.
      { id: 'lh_r_shoulder_flex', label: 'Raise right arm up', joints: { r_shoulder_flex: 180 },
        agonists: ['clavicular part of right deltoid', 'right pectoralis major', 'right coracobrachialis', 'long head of right biceps brachii', 'right serratus anterior'],
        antagonists: ['spinal part of right deltoid', 'right latissimus dorsi', 'right teres major', 'long head of right triceps brachii'] },
      // R558 (builder AN): the shoulder-blade muscles that go with each arm movement (standard scapulohumeral rhythm) are
      // listed as steadying muscles: the rhomboids and pectoralis minor turn the blade down with the arm swinging down and
      // back; the rhomboids pull it back with the arm swinging out and back; pectoralis minor draws it forward with the
      // arm swinging in to the front.
      { id: 'lh_r_shoulder_extend', label: 'Swing right arm down and back', joints: { r_shoulder_flex: -60 },
        agonists: ['spinal part of right deltoid', 'right latissimus dorsi', 'right teres major', 'long head of right triceps brachii'],
        antagonists: ['clavicular part of right deltoid', 'right pectoralis major', 'right coracobrachialis', 'long head of right biceps brachii'],
        stabilizers: ['right rhomboid major', 'right rhomboid minor', 'right pectoralis minor'] },
      { id: 'lh_r_shoulder_abd', label: 'Swing right arm out to the side', joints: { r_shoulder_abd: 135 },
        agonists: ['acromial part of right deltoid', 'right supraspinatus', 'spinal part of right deltoid', 'right infraspinatus', 'right teres minor'],
        antagonists: ['right pectoralis major', 'right latissimus dorsi', 'right teres major'],
        stabilizers: ['right trapezius', 'right serratus anterior', 'right rhomboid major', 'right rhomboid minor'] },
      { id: 'lh_r_shoulder_add', label: 'Swing right arm in to the front', joints: { r_shoulder_abd: 0 },
        agonists: ['right pectoralis major', 'right latissimus dorsi', 'right teres major', 'right subscapularis'],
        antagonists: ['acromial part of right deltoid', 'right supraspinatus'],
        stabilizers: ['right serratus anterior', 'right pectoralis minor'] }
    ],
    explanation: 'Shoulder area for the RIGHT arm, at the medial edge of the arm and hand zone of the left hemisphere. Crossed corticospinal fibres dominate, with weaker same-side input to proximal muscles (Bawa 2004). The game simulates raising the right arm up (front deltoid, pectoralis major, coracobrachialis) or swinging it down and back, and swinging it out to the side (middle deltoid, supraspinatus) or back in to the front; the arm starts straight forward, in front of you. Proximal and distal arm representations overlap (Devanne 2006), and stimulation rarely moves the shoulder in isolation (Gordon 2023).',
    citationKeys: ['GORDON2023', 'BAWA2004', 'DEVANNE2006', 'UAMS_UPPER']
  }),
  elbow: c => (c.H === 'right' ? {
    label: 'Left elbow', shortLabel: 'L elbow', effector: 'elbow (left arm)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('elbow_flexion', 'Flex left elbow', ['BRA', 'BIC', 'BRD'], ['TRI', 'ANC'], []),
      leftArm('elbow_extension', 'Extend left elbow', ['TRI', 'ANC'], ['BRA', 'BIC', 'BRD'], [])
    ],
    explanation: 'Elbow area for the LEFT arm in the right hemisphere, dorsal (medial) to the wrist and hand areas. Crossed corticospinal fibres reach cervical motor neurons for the arm. In the game, looking here pulses the same elbow flexion (brachialis, biceps, brachioradialis) or extension (triceps, anconeus) the visible left arm already uses. Meier 2008 placed elbow emphasis dorsal to the hand, but its alternating task did not separate a flexion centre from an extension centre, so the two control spots are representative only.',
    citationKeys: ['MEIER2008', 'GORDON2023', 'LOYOLA', 'UAMS_UPPER']
  } : {
    label: 'Right elbow', shortLabel: 'R elbow', effector: 'elbow (right arm)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_elbow_flex', label: 'Bend right elbow', joints: { r_elbow_flex: 145 },
        agonists: ['right brachialis', 'right biceps brachii', 'right brachioradialis'], antagonists: ['right triceps brachii', 'right anconeus'] },
      { id: 'lh_r_elbow_extend', label: 'Straighten right elbow', joints: { r_elbow_flex: 0 },
        agonists: ['right triceps brachii', 'right anconeus'], antagonists: ['right brachialis', 'right biceps brachii', 'right brachioradialis'],
        note: 'At the start pose the right elbow is already straight, so this shows the triceps without moving the elbow; after an elbow bend it straightens the elbow again.' }
    ],
    explanation: 'Elbow area for the RIGHT arm in the left hemisphere, dorsal (medial) to the wrist and hand areas. Crossed corticospinal fibres reach cervical motor neurons for the arm. The game simulates bending (brachialis, biceps, brachioradialis) or straightening (triceps, anconeus) the right elbow. Meier 2008 measured right-arm elbow movement in the left hemisphere dorsal to the hand, without separate flexion and extension centres.',
    citationKeys: ['MEIER2008', 'GORDON2023', 'UAMS_UPPER']
  }),
  forearm: c => (c.H === 'right' ? {
    label: 'Left forearm rotation', shortLabel: 'L forearm', effector: 'forearm rotation (left arm)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('pronation', 'Turn left palm down (pronation)', [], ['BIC'], [],
        ['left pronator teres', 'left pronator quadratus'], ['left supinator', 'left biceps brachii'],
        'Pronator teres, pronator quadratus and supinator have no catalog key in MOVEMENT-MAP r2 (ns-assets maps them to null). The game tints these three meshes by name while the forearm turns (simulated display level, same colours); they are not movement-map muscles.'),
      leftArm('supination', 'Turn left palm up (supination)', ['BIC'], [], [],
        ['left supinator', 'left biceps brachii'], ['left pronator teres', 'left pronator quadratus'],
        'Biceps brachii is a powerful supinator mainly when the elbow is flexed (UAMS).')
    ],
    explanation: 'Forearm-rotation area for the LEFT arm, placed between the elbow and wrist areas of the right hemisphere. Crossed corticospinal fibres reach the cervical motor neurons of the forearm rotators. In the game, looking here turns the left palm down (pronator teres and quadratus) or up (supinator and biceps brachii), the same flip a double-tap of Space makes. Forearm rotation is represented together with the wrist and elbow in overlapping fields (Meier 2008 tested wrist and forearm together), and no separate published pronation point exists, so this spot is a game placement.',
    citationKeys: ['MEIER2008', 'UAMS_UPPER', 'LOYOLA']
  } : {
    label: 'Right forearm rotation', shortLabel: 'R forearm', effector: 'forearm rotation (right arm)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_pronate', label: 'Turn right palm down (pronation)', joints: { r_pronation: 160 },
        agonists: ['right pronator teres', 'right pronator quadratus'], antagonists: ['right supinator', 'right biceps brachii'] },
      { id: 'lh_r_supinate', label: 'Turn right palm up (supination)', joints: { r_pronation: 0 },
        agonists: ['right supinator', 'right biceps brachii'], antagonists: ['right pronator teres', 'right pronator quadratus'],
        note: 'At the start pose the right arm points straight forward with the palm down (pronated), so this turns the palm up; after that, turning the palm down brings it back.' }
    ],
    explanation: 'Forearm-rotation area for the RIGHT arm, between the elbow and wrist areas of the left hemisphere. Crossed corticospinal fibres reach the cervical motor neurons of the forearm rotators. The game simulates turning the right palm down (pronator teres and quadratus) or up (supinator and biceps brachii). Forearm rotation shares overlapping fields with the wrist and elbow (Meier 2008), so this spot is a game placement, not a measured point.',
    citationKeys: ['MEIER2008', 'UAMS_UPPER']
  }),
  wrist: c => (c.H === 'right' ? {
    label: 'Left wrist', shortLabel: 'L wrist', effector: 'wrist (left arm)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('wrist_flexion', 'Flex left wrist', ['FCR', 'FCU'], ['ECRL', 'ECRB', 'ECU'], ['FDS', 'FDP']),
      leftArm('wrist_extension', 'Extend left wrist', ['ECRL', 'ECRB', 'ECU'], ['FCR', 'FCU'], ['ED']),
      // R558 (Messages 14 / 15): the right wrist bends sideways (radial 20 / ulnar 30, AAOS), so the left wrist area has
      // the same two spots. The game arm's hand fit has one wrist axis, so on the left these light and colour only.
      leftArm('wrist_radial_deviation', 'Bend left wrist toward the thumb (radial deviation)', ['FCR', 'ECRL', 'ECRB'], ['FCU', 'ECU'], [],
        null, null, LEFT_WRIST_SIDE_NOTE),
      leftArm('wrist_ulnar_deviation', 'Bend left wrist toward the little finger (ulnar deviation)', ['FCU', 'ECU'], ['FCR', 'ECRL', 'ECRB'], [],
        null, null, LEFT_WRIST_SIDE_NOTE)
    ],
    explanation: 'Wrist area for the LEFT hand in the right hemisphere, between the forearm-rotation and hand areas. Crossed corticospinal fibres reach the cervical motor neurons of the wrist flexors and extensors. In the game, looking here pulses the existing left wrist flexion (flexor carpi radialis and ulnaris) or extension (the three wrist extensors); the sideways bends toward the thumb (radial deviation) or the little finger (ulnar deviation) colour their muscles but do not move the game arm, whose hand fit has one wrist axis. Wrist representation overlaps the fingers and appears on both sides of the hand zone (Meier 2008; Gordon 2023), but this one-dimensional strip shows only the dorsal part, and forearm-muscle maps have task-specific peaks (Masse-Alarie 2017).',
    citationKeys: ['MEIER2008', 'MASSE2017', 'GORDON2023', 'LOYOLA', 'UAMS_UPPER']
  } : {
    label: 'Right wrist', shortLabel: 'R wrist', effector: 'wrist (right arm)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_wrist_flex', label: 'Flex right wrist', joints: { r_wrist_flex: 80, r_wrist_ext: 0 },
        agonists: ['right flexor carpi radialis', 'right flexor carpi ulnaris', 'right palmaris longus'],
        antagonists: ['right extensor carpi radialis longus', 'right extensor carpi radialis brevis', 'right extensor carpi ulnaris'] },
      { id: 'lh_r_wrist_ext', label: 'Extend right wrist', joints: { r_wrist_ext: 70, r_wrist_flex: 0 },
        agonists: ['right extensor carpi radialis longus', 'right extensor carpi radialis brevis', 'right extensor carpi ulnaris'],
        antagonists: ['right flexor carpi radialis', 'right flexor carpi ulnaris'] },
      // R558 (Message 14): radial deviation 20, ulnar deviation 30 (AAOS), about the palm's normal through the capitate.
      { id: 'lh_r_wrist_radial', label: 'Bend right wrist toward the thumb (radial deviation)', joints: { r_wrist_dev: 20 },
        agonists: ['right flexor carpi radialis', 'right extensor carpi radialis longus', 'right extensor carpi radialis brevis'],
        antagonists: ['right flexor carpi ulnaris', 'right extensor carpi ulnaris'] },
      { id: 'lh_r_wrist_ulnar', label: 'Bend right wrist toward the little finger (ulnar deviation)', joints: { r_wrist_dev: -30 },
        agonists: ['right flexor carpi ulnaris', 'right extensor carpi ulnaris'],
        antagonists: ['right flexor carpi radialis', 'right extensor carpi radialis longus', 'right extensor carpi radialis brevis'] }
    ],
    explanation: 'Wrist area for the RIGHT hand in the left hemisphere, between the forearm-rotation and hand areas. Crossed corticospinal fibres reach the cervical motor neurons of the wrist muscles. The game simulates flexing (flexor carpi radialis and ulnaris) or extending (the three wrist extensors) the right wrist, and bending it toward the thumb (radial deviation: the radial flexor and extensors) or the little finger (ulnar deviation: the two ulnar wrist muscles). In right-hand studies the wrist emphasis brackets the fingers on both sides (Meier 2008), which this one-dimensional strip simplifies to one region.',
    citationKeys: ['MEIER2008', 'MASSE2017', 'UAMS_UPPER']
  }),
  hand: () => ({
    label: 'Left hand', shortLabel: 'L hand', effector: 'whole hand (left): grasp, release, open, spread, together', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('grasp_close', 'Grasp / close left hand', ['FDS', 'FDP', 'FPB', 'FPL', 'OP', 'ADP'], ['ED', 'EI', 'EDM', 'EPB', 'EPL'], ['ECRL', 'ECRB', 'ECU', 'LUM', 'DI', 'PI'],
        null, null, 'Extensors are listed as relatively reduced, as in MOVEMENT-MAP r2. The display multiplies their simulated ' +
          'level by (1 - 0.9 * a), a = the grasp display level, so a full fist alone takes them from the 0.08 rest level to ' +
          '0.008 (unitless). The factor is a display convention, not a measured grip law, EMG or force. Real power grip can ' +
          'co-activate the extensors: Motawar 2012 recorded extensor digitorum activity during maximal isometric power grip (right ' +
          'hand, right-handed adults; map-delta D07). This virtual left-hand display is an illustrative extrapolation.'),
      leftArm('relax_release', 'Relax / release left grasp', [], ['FDS', 'FDP', 'FPB', 'FPL', 'ED', 'EI', 'EDM', 'EPB', 'EPL'], [],
        null, null, 'Release lowers flexor and extensor drive; it is not active extension and not cortical silence (Motawar 2012).'),
      leftArm('open_hand', 'Open left hand', ['ED', 'EI', 'EDM', 'EPB', 'EPL'], ['FDS', 'FDP', 'FPB', 'FPL'], ['LUM', 'DI', 'PI'],
        null, null, 'Opening on release is a game convention; natural release can be passive.'),
      leftArm('spread_fingers', 'Spread left fingers', ['DI', 'ADM'], ['PI'], ['ED', 'LUM']),
      // R558 (Messages 14 / 15 / 6): the anatomical opposite of spreading (palmar interossei), as on the right hand.
      leftArm('fingers_together', 'Bring left fingers together', ['PI'], ['DI', 'ADM'], [])
    ],
    explanation: 'Hand area (the hand knob) for the LEFT hand in the right hemisphere: whole-hand grasp, release, opening, spreading and bringing the fingers together. Crossed corticospinal fibres, including direct cortico-motoneuronal connections that support fine finger control (Lemon 2008), reach the hand motor neurons. In the game, looking here, or holding Space for the fist, drives the existing left-hand actions, and the finger flexors or extensors take the same colour ramp as the brain. Huber 2020 measured left-hand grasp and retraction in the right motor cortex as overlapping, repeated action patches that differ between people, and natural grip release can be passive (Motawar 2012), so releasing Space into an open hand is a game convention.',
    citationKeys: ['HUBER2020', 'MOTAWAR2012', 'ARBUCKLE2020', 'VANDUINEN2008', 'LEMON2008', 'YOUSRY1997', 'DEO2026', 'UAMS_UPPER']
  }),
  little: () => ({
    label: 'Left little finger', shortLabel: 'L little', effector: 'little finger (left hand)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('little_flexion', 'Flex left little finger', ['FDS', 'FDP', 'LUM'], ['ED', 'EDM'], [], [CATALOG_NAMES.FDS, CATALOG_NAMES.FDP, CATALOG_NAMES.LUM, 'flexor digiti minimi brevis of left hand', 'opponens digiti minimi of left hand'], null),
      leftArm('little_extension', 'Extend left little finger', ['ED', 'EDM'], ['FDS', 'FDP'], [])
    ],
    explanation: 'Little-finger area for the LEFT hand, inside the hand zone of the right hemisphere, between the hand area and the ring finger in Penfield\'s medial-to-lateral sequence. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. In the game, looking here bends or straightens the left little finger on its own (flexor digitorum superficialis and profundus with the lumbricals and the little finger’s own short flexor and opponens, or extensor digitorum with extensor digiti minimi). Single-finger movements share strongly overlapping activity patterns (Arbuckle 2020, right hand, mirrored here by inference), and the finger flexor and extensor meshes are whole muscles, so their colour covers every finger and this separate spot is a representative placement.',
    citationKeys: ['ARBUCKLE2020', 'PENFIELD1937', 'UAMS_UPPER']
  }),
  ring: () => ({
    label: 'Left ring finger', shortLabel: 'L ring', effector: 'ring finger (left hand)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('ring_flexion', 'Flex left ring finger', ['FDS', 'FDP', 'LUM'], ['ED'], ['PI', 'DI']),
      leftArm('ring_extension', 'Extend left ring finger', ['ED'], ['FDS', 'FDP'], ['LUM'])
    ],
    explanation: 'Ring-finger area for the LEFT hand, inside the hand zone of the right hemisphere, between the little and middle fingers in Penfield\'s medial-to-lateral sequence. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. In the game, looking here bends or straightens the left ring finger on its own (flexor digitorum superficialis and profundus with the lumbricals, or extensor digitorum). Single-finger movements share strongly overlapping activity patterns (Arbuckle 2020, right hand, mirrored here by inference), and the finger flexor and extensor meshes are whole muscles, so their colour covers every finger and this separate spot is a representative placement.',
    citationKeys: ['ARBUCKLE2020', 'PENFIELD1937', 'UAMS_UPPER']
  }),
  middle: () => ({
    label: 'Left middle finger', shortLabel: 'L middle', effector: 'middle finger (left hand)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('middle_flexion', 'Flex left middle finger', ['FDS', 'FDP', 'LUM'], ['ED'], ['DI']),
      leftArm('middle_extension', 'Extend left middle finger', ['ED'], ['FDS', 'FDP'], ['LUM'])
    ],
    explanation: 'Middle-finger area for the LEFT hand, inside the hand zone of the right hemisphere, between the ring and index fingers in Penfield\'s medial-to-lateral sequence. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. In the game, looking here bends or straightens the left middle finger on its own (flexor digitorum superficialis and profundus with the lumbricals, or extensor digitorum). Single-finger movements share strongly overlapping activity patterns (Arbuckle 2020, right hand, mirrored here by inference), and the finger flexor and extensor meshes are whole muscles, so their colour covers every finger and this separate spot is a representative placement.',
    citationKeys: ['ARBUCKLE2020', 'PENFIELD1937', 'UAMS_UPPER']
  }),
  index: () => ({
    label: 'Left index finger', shortLabel: 'L index', effector: 'index finger (left hand)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('index_flexion', 'Flex left index finger', ['FDS', 'FDP'], ['EI', 'ED'], ['LUM', 'DI']),
      leftArm('index_extension', 'Extend left index finger', ['EI', 'ED'], ['FDS', 'FDP'], ['LUM', 'DI'])
    ],
    explanation: 'Index-finger area for the LEFT hand, inside the hand zone of the right hemisphere, between the middle finger and the thumb in Penfield\'s sequence. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. In the game, looking here pulses the existing left index flexion or extension. Flexion and extension of one finger share strongly overlapping activity patterns (Arbuckle 2020, right hand, mirrored here by inference), and the finger flexor and extensor meshes are whole muscles, so their colour covers every finger.',
    citationKeys: ['ARBUCKLE2020', 'HUBER2020', 'UAMS_UPPER']
  }),
  thumb: () => ({
    label: 'Left thumb', shortLabel: 'L thumb', effector: 'thumb (left hand)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('thumb_mcp_flexion', 'Flex left thumb (MCP)', ['FPB'], ['EPB'], ['FPL']),
      leftArm('thumb_mcp_extension', 'Extend left thumb (MCP)', ['EPB'], ['FPB'], ['EPL']),
      // R558 (Messages 14 / 15): the thumb's own base joint (CMC) turns it across the palm (opposition, 40 deg, the game
      // arm's limit) or back out; the right thumb has the same two spots.
      leftArm('thumb_opposition', 'Turn left thumb across the palm (opposition)', ['OP', 'FPB'], ['EPL'], [],
        [CATALOG_NAMES.OP, 'left abductor pollicis brevis', CATALOG_NAMES.FPB], ['left abductor pollicis longus', CATALOG_NAMES.EPL]),
      leftArm('thumb_reposition', 'Move left thumb out from the palm', ['EPB', 'EPL'], ['OP', 'FPB'], [],
        ['left abductor pollicis longus', CATALOG_NAMES.EPB, CATALOG_NAMES.EPL], [CATALOG_NAMES.OP, 'left abductor pollicis brevis', CATALOG_NAMES.FPB])
    ],
    explanation: 'Thumb area for the LEFT hand, the most lateral part of the hand zone in the right hemisphere. Crossed corticospinal fibres reach the thumb muscles. In the game, looking here pulses the existing left thumb flexion (flexor pollicis brevis) or extension (extensor pollicis brevis) at the knuckle, or turns the thumb across the palm at its base (opposition: opponens pollicis and abductor pollicis brevis) or back out (abductor pollicis longus). Thumb directions were mapped with TMS for the right thumb in the left hemisphere, with contextual and individual biases (Z\'Graggen 2009), so this mirrored placement is representative.',
    citationKeys: ['ZGRAGGEN2009', 'UAMS_UPPER']
  }),
  r_hand: () => ({
    label: 'Right hand', shortLabel: 'R hand', effector: 'whole hand (right): close, open, spread, together', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      // R558 (Messages 14 / 15): the right hand moves each digit on its own (ns-body r_<digit>_flex); the whole-hand
      // actions set all five. Closing: fingers MCP 90 / PIP 104 / DIP 85, thumb CMC 30 / MCP 50 / IP 80. Opening: MCP
      // 30 into hyperextension, thumb IP 20, thumb out 15 (BODY_JOINT_SHARES; AAOS ranges).
      { id: 'lh_r_grasp', label: 'Close right hand', joints: { r_thumb_flex: 90, r_thumb_opp: 30, r_index_flex: 90, r_middle_flex: 90, r_ring_flex: 90, r_little_flex: 90 },
        agonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus', 'right flexor pollicis longus', 'right flexor pollicis brevis', 'right opponens pollicis', 'right adductor pollicis'],
        antagonists: ['right extensor digitorum', 'right extensor indicis', 'right extensor pollicis longus', 'right extensor pollicis brevis'] },
      { id: 'lh_r_open', label: 'Open right hand', joints: { r_thumb_flex: -20, r_thumb_opp: -15, r_index_flex: -30, r_middle_flex: -30, r_ring_flex: -30, r_little_flex: -30 },
        agonists: ['right extensor digitorum', 'right extensor indicis', 'right extensor digiti minimi', 'right extensor pollicis longus', 'right extensor pollicis brevis'],
        antagonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus', 'right flexor pollicis longus'] },
      { id: 'lh_r_spread', label: 'Spread right fingers', joints: { r_finger_spread: 20 },
        agonists: ['dorsal interossei of right hand', 'abductor digiti minimi of right hand'], antagonists: ['palmar interossei of right hand'],
        stabilizers: ['right extensor digitorum', 'lumbricals of right hand'] },
      { id: 'lh_r_together', label: 'Bring right fingers together', joints: { r_finger_spread: 0 },
        agonists: ['palmar interossei of right hand'], antagonists: ['dorsal interossei of right hand', 'abductor digiti minimi of right hand'] }
    ],
    explanation: 'Hand area (the hand knob) for the RIGHT hand in the left hemisphere: whole-hand closing, opening, spreading and bringing the fingers together. Crossed corticospinal fibres, including direct cortico-motoneuronal connections (Lemon 2008), reach the hand motor neurons. The game simulates the right hand, which starts straight out in front of you, closing into a fist or opening, and the fingers spreading (dorsal interossei, abductor digiti minimi) or closing together (palmar interossei). Right-hand studies in the left hemisphere find overlapping finger patterns (Arbuckle 2020), and even the hand knob crown carries whole-body tuning (Willett 2020).',
    citationKeys: ['ARBUCKLE2020', 'MEIER2008', 'LEMON2008', 'YOUSRY1997', 'WILLETT2020', 'DEO2026', 'UAMS_UPPER']
  }),
  r_little: () => ({
    label: 'Right little finger', shortLabel: 'R little', effector: 'little finger (right hand)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_little_flex', label: 'Flex right little finger', joints: { r_little_flex: 90 },
        agonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus', 'lumbricals of right hand', 'flexor digiti minimi brevis of right hand', 'opponens digiti minimi of right hand'], antagonists: ['right extensor digitorum', 'right extensor digiti minimi'] },
      { id: 'lh_r_little_extend', label: 'Extend right little finger', joints: { r_little_flex: -30 },
        agonists: ['right extensor digitorum', 'right extensor digiti minimi'], antagonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus'] }
    ],
    explanation: 'Little-finger area for the RIGHT hand, inside the hand zone of the left hemisphere, between the hand area and the ring finger in Penfield\'s medial-to-lateral sequence. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. The game simulates bending the right little finger on its own (MCP 90, PIP about 105, DIP 85) or straightening it into 30 degrees of hyperextension at the knuckle (its own short flexor and opponens help the bend; extensor digiti minimi helps the straightening). Single-finger flexion and extension share strongly overlapping patterns in the left hemisphere (Arbuckle 2020), and the long finger flexor and extensor meshes are whole muscles, so their colour covers every finger and this separate spot is a representative placement.',
    citationKeys: ['ARBUCKLE2020', 'MEIER2008', 'PENFIELD1937', 'UAMS_UPPER']
  }),
  r_ring: () => ({
    label: 'Right ring finger', shortLabel: 'R ring', effector: 'ring finger (right hand)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_ring_flex', label: 'Flex right ring finger', joints: { r_ring_flex: 90 },
        agonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus', 'lumbricals of right hand'], antagonists: ['right extensor digitorum'] },
      { id: 'lh_r_ring_extend', label: 'Extend right ring finger', joints: { r_ring_flex: -30 },
        agonists: ['right extensor digitorum'], antagonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus'] }
    ],
    explanation: 'Ring-finger area for the RIGHT hand, inside the hand zone of the left hemisphere, between the little and middle fingers in Penfield\'s medial-to-lateral sequence. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. The game simulates bending the right ring finger on its own (MCP 90, PIP about 105, DIP 85) or straightening it into 30 degrees of hyperextension at the knuckle. Single-finger flexion and extension share strongly overlapping patterns in the left hemisphere (Arbuckle 2020), and the long finger flexor and extensor meshes are whole muscles, so their colour covers every finger and this separate spot is a representative placement.',
    citationKeys: ['ARBUCKLE2020', 'MEIER2008', 'PENFIELD1937', 'UAMS_UPPER']
  }),
  r_middle: () => ({
    label: 'Right middle finger', shortLabel: 'R middle', effector: 'middle finger (right hand)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_middle_flex', label: 'Flex right middle finger', joints: { r_middle_flex: 90 },
        agonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus', 'lumbricals of right hand'], antagonists: ['right extensor digitorum'] },
      { id: 'lh_r_middle_extend', label: 'Extend right middle finger', joints: { r_middle_flex: -30 },
        agonists: ['right extensor digitorum'], antagonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus'] }
    ],
    explanation: 'Middle-finger area for the RIGHT hand, inside the hand zone of the left hemisphere, between the ring and index fingers in Penfield\'s medial-to-lateral sequence. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. The game simulates bending the right middle finger on its own (MCP 90, PIP about 105, DIP 85) or straightening it into 30 degrees of hyperextension at the knuckle. Single-finger flexion and extension share strongly overlapping patterns in the left hemisphere (Arbuckle 2020), and the long finger flexor and extensor meshes are whole muscles, so their colour covers every finger and this separate spot is a representative placement.',
    citationKeys: ['ARBUCKLE2020', 'MEIER2008', 'PENFIELD1937', 'UAMS_UPPER']
  }),
  r_index: () => ({
    label: 'Right index finger', shortLabel: 'R index', effector: 'index finger (right hand)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_index_flex', label: 'Flex right index finger', joints: { r_index_flex: 90 },
        agonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus', 'lumbricals of right hand'], antagonists: ['right extensor digitorum', 'right extensor indicis'] },
      { id: 'lh_r_index_extend', label: 'Extend right index finger', joints: { r_index_flex: -30 },
        agonists: ['right extensor digitorum', 'right extensor indicis'], antagonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus'] }
    ],
    explanation: 'Index-finger area for the RIGHT hand, inside the hand zone of the left hemisphere, between the middle finger and the thumb in Penfield\'s medial-to-lateral sequence. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. The game simulates bending the right index finger on its own (MCP 90, PIP about 105, DIP 85) or straightening it into 30 degrees of hyperextension at the knuckle (extensor indicis helps the straightening). Single-finger flexion and extension share strongly overlapping patterns in the left hemisphere (Arbuckle 2020), and the long finger flexor and extensor meshes are whole muscles, so their colour covers every finger and this separate spot is a representative placement.',
    citationKeys: ['ARBUCKLE2020', 'MEIER2008', 'PENFIELD1937', 'UAMS_UPPER']
  }),
  r_thumb: () => ({
    label: 'Right thumb', shortLabel: 'R thumb', effector: 'thumb (right hand)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      // R558 (Messages 14 / 15): the right thumb now has its own joints, like the left game thumb: MCP and IP bend (MCP
      // 50, IP 80) and straighten (IP 20 into hyperextension), and the base joint (CMC) turns it across the palm
      // (opposition, 40, the same end as the left game thumb) or out from the palm (15).
      { id: 'lh_r_thumb_flex', label: 'Flex right thumb', joints: { r_thumb_flex: 90 },
        agonists: ['right flexor pollicis longus', 'right flexor pollicis brevis'],
        antagonists: ['right extensor pollicis longus', 'right extensor pollicis brevis'] },
      { id: 'lh_r_thumb_extend', label: 'Extend right thumb', joints: { r_thumb_flex: -20 },
        agonists: ['right extensor pollicis longus', 'right extensor pollicis brevis'],
        antagonists: ['right flexor pollicis longus', 'right flexor pollicis brevis'] },
      { id: 'lh_r_thumb_oppose', label: 'Turn right thumb across the palm (opposition)', joints: { r_thumb_opp: 40 },
        agonists: ['right opponens pollicis', 'right abductor pollicis brevis', 'right flexor pollicis brevis'],
        antagonists: ['right abductor pollicis longus', 'right extensor pollicis longus'] },
      { id: 'lh_r_thumb_out', label: 'Move right thumb out from the palm', joints: { r_thumb_opp: -15 },
        agonists: ['right abductor pollicis longus', 'right extensor pollicis brevis', 'right extensor pollicis longus'],
        antagonists: ['right opponens pollicis', 'right abductor pollicis brevis', 'right flexor pollicis brevis'] }
    ],
    explanation: "Thumb area for the RIGHT hand, the most lateral part of the hand zone in the left hemisphere. Crossed corticospinal fibres reach the thumb muscles. The game simulates bending the right thumb (flexor pollicis longus and brevis) or straightening it (the two thumb extensors), and turning it across the palm at its base (opposition: opponens pollicis and abductor pollicis brevis) or back out (abductor pollicis longus). Thumb movement directions were mapped with TMS in this hemisphere for the right thumb, with contextual and individual biases (Z'Graggen 2009).",
    citationKeys: ['ZGRAGGEN2009', 'UAMS_UPPER']
  }),
  neck: c => ({
    label: 'Neck', shortLabel: 'Neck', effector: 'neck (head flexion, turning and side tilt)', bodySide: 'midline', medialSurface: false,
    displayGroup: 'neck', pathway: 'corticospinal+corticobulbar', laterality: 'bilateral_debated',
    actions: [
      // R558 (Message 2): neck flexion 50, extension 60, rotation 80 (AMA), side bend 45 (AAOS / AMA).
      { id: `${c.code}_neck_flex`, label: 'Bend head forward', joints: { neck_flex: 50 },
        agonists: [...both('sternocleidomastoid'), ...both('longus colli')],
        antagonists: [...both('splenius capitis'), ...both('semispinalis capitis'), ...both('semispinalis cervicis'), ...both('trapezius'), ...both('longissimus capitis'), ...both('longissimus cervicis'), ...both('iliocostalis cervicis')] },
      { id: `${c.code}_neck_extend`, label: 'Tilt head back', joints: { neck_flex: -60 },
        agonists: [...both('splenius capitis'), ...both('semispinalis capitis'), ...both('semispinalis cervicis'), ...both('trapezius'), ...both('longissimus capitis'), ...both('longissimus cervicis'), ...both('iliocostalis cervicis')],
        antagonists: [...both('sternocleidomastoid'), ...both('longus colli')] },
      c.H === 'right'
        ? { id: 'rh_neck_turn_left', label: 'Turn head to the left', joints: { neck_rot: 80 },
          agonists: ['right sternocleidomastoid', 'left splenius capitis'], antagonists: ['left sternocleidomastoid', 'right splenius capitis'],
          note: 'Game choice: each hemisphere turns the head toward the opposite side. Which hemisphere drives head turning is unresolved.' }
        : { id: 'lh_neck_turn_right', label: 'Turn head to the right', joints: { neck_rot: -80 },
          agonists: ['left sternocleidomastoid', 'right splenius capitis'], antagonists: ['right sternocleidomastoid', 'left splenius capitis'],
          note: 'Game choice: each hemisphere turns the head toward the opposite side. Which hemisphere drives head turning is unresolved.' },
      { id: `${c.code}_neck_side`, label: `Tilt head to the ${c.S} (ear to shoulder)`, joints: { neck_side: c.S === 'left' ? 45 : -45 },
        agonists: sided(c.S, 'sternocleidomastoid', 'scalenus anterior', 'scalenus medius', 'scalenus posterior', 'splenius capitis', 'longissimus capitis', 'levator scapulae', 'descending part of trapezius'),
        antagonists: sided(c.So, 'sternocleidomastoid', 'scalenus anterior', 'scalenus medius', 'scalenus posterior'),
        note: 'Game choice, as for turning: each hemisphere tilts the head toward the opposite side. Which hemisphere drives it is unresolved.' }
    ],
    explanation: `Neck area of the ${c.H} hemisphere, placed after the thumb as in Penfield's motor sequence. Neck muscles receive input from both hemispheres, and the sternocleidomastoid gets both crossed and uncrossed projections (Thompson 1997). The game simulates bending the head forward (sternocleidomastoid, longus colli) or back (splenius and semispinalis capitis, the upper erector spinae and the trapezius), turning it to the ${c.S} (one sternocleidomastoid with the opposite splenius capitis) or tilting it toward the ${c.S} shoulder (the ${c.S} sternocleidomastoid, scalenes and upper trapezius), which are game choices because the hemisphere that drives head turning is unresolved. Thompson 1997 found the sternocleidomastoid representation high on the convexity near the trunk area, so the neck's place on this strip is debated.`,
    citationKeys: ['PENFIELD1937', 'THOMPSON1997', 'UAMS_HEADNECK', 'UAMS_BACK']
  }),
  scan_middle: c => ({
    label: 'Middle inter-effector (SCAN)', shortLabel: 'SCAN mid.', effector: 'inter-effector region between the hand and mouth zones (somato-cognitive action network); no isolated body part',
    bodySide: 'midline', medialSurface: false, kind: 'integration', displayGroup: 'integration', pathway: 'integration', laterality: 'bilateral network',
    actions: [],
    noActionReason: 'A stimulation re-analysis found the middle inter-effector region never elicited movement in any individual (Gordon 2023); the game moves nothing here.',
    explanation: `Middle inter-effector region of the somato-cognitive action network (SCAN), between the hand and mouth zones of the ${c.H} hemisphere (Gordon 2023). It is linked with the other inter-effector regions and the cingulo-opercular network, and relatively more with visual cortex, which may relate to hand-eye coordination. In the game, looking here lights and marks the region but moves nothing. Gordon's re-analysis of cortical stimulation found that this region never elicited movement in any individual, and eyebrow raising co-activated the inter-effector regions.`,
    citationKeys: ['GORDON2023']
  }),
  brow: c => ({
    label: 'Brow', shortLabel: 'Brow', effector: 'eyebrows (upper face, both sides): raise and frown', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral',
    actions: [
      // R558 (Messages 14 / 6): the frown is the brow raise's opposite (agonist and antagonist swap); temporoparietalis,
      // part of the scalp muscle with the frontalis, helps the raise.
      { id: `${c.code}_brow_raise`, label: 'Raise both eyebrows', joints: { brow_raise: 15 },
        agonists: ['frontal belly of left occipitofrontalis', 'frontal belly of right occipitofrontalis', ...both('temporoparietalis')],
        antagonists: [...both('corrugator supercilii'), 'procerus'] },
      { id: `${c.code}_brow_lower`, label: 'Lower and draw the eyebrows together (frown)', joints: { brow_raise: -15 },
        agonists: [...both('corrugator supercilii'), 'procerus'],
        antagonists: ['frontal belly of left occipitofrontalis', 'frontal belly of right occipitofrontalis'] }
    ],
    explanation: `Brow area of the ${c.H} hemisphere, where the frontal belly of occipitofrontalis raises the eyebrows and corrugator supercilii with procerus lowers and draws them together (a frown). Corticobulbar fibres reach the facial nucleus, and the upper face is supplied from both hemispheres, which is why a cortical stroke usually spares the forehead (monkey tract tracing: Morecraft 2001). ${c.face
      ? `BodyParts3D 4.0 has no facial-expression muscles; ${FACE_PACKET_NAME} adds them, so the game colours the frontal belly of occipitofrontalis (or the frown muscles) on both sides with the simulated display level, and the face shape does not change.`
      : 'BodyParts3D 4.0 has no facial-expression muscles, so the game only records a simulated display level here: nothing on the face layer moves or changes colour.'} Eyebrow raising co-activated the inter-effector regions in fMRI (Gordon 2023), so this small area is a schematic placement.`,
    citationKeys: faceCites(c, ['MORECRAFT2001', 'GORDON2023', 'PENFIELD1937', 'UAMS_HEADNECK'])
  }),
  eyelid: c => ({
    label: 'Eyelids', shortLabel: 'Eyelids', effector: 'eyelids (upper face, both sides): close and open wide', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral',
    actions: [
      { id: `${c.code}_eye_close`, label: 'Close both eyes', joints: { eye_close: 20 },
        agonists: both('orbicularis oculi'), antagonists: both('levator palpebrae superioris'),
        note: 'Levator palpebrae superioris is supplied by the oculomotor nerve, a separate pathway.' },
      // R558 (Messages 14 / 6): opening the eyes wide is the closure's opposite.
      { id: `${c.code}_eye_open`, label: 'Open both eyes wide', joints: { eye_close: -15 },
        agonists: both('levator palpebrae superioris'), antagonists: both('orbicularis oculi'),
        note: 'Levator palpebrae superioris lights (it lies inside the eye socket, behind the eyelid muscles); it is supplied by the oculomotor nerve, a separate pathway, and the eyelids themselves are not modelled.' }
    ],
    explanation: `Eyelid area of the ${c.H} hemisphere, where orbicularis oculi closes the eyes. Corticobulbar input to the upper face comes from both hemispheres (Morecraft 2001, in monkeys). ${c.face
      ? `BodyParts3D 4.0 has no orbicularis oculi; ${FACE_PACKET_NAME} adds it, so the game colours it on both sides with the simulated display level, and the eyelids do not move.`
      : 'BodyParts3D 4.0 has no orbicularis oculi or other facial-expression muscle, so the game only records a simulated display level here: nothing on the face layer moves or changes colour.'} Eye opening (levator palpebrae superioris, oculomotor nerve) and blink reflexes are separate circuits that are not simulated, and Gordon 2023 lists eyelid movement among those most preferred at an inter-effector centre.`,
    citationKeys: faceCites(c, ['MORECRAFT2001', 'GORDON2023', 'PENFIELD1937', 'UAMS_HEADNECK'])
  }),
  nose: c => ({
    label: 'Nose', shortLabel: 'Nose', effector: 'nose: wrinkling and nostril flaring (both sides)', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral',
    actions: [
      // R558 (Message 14, "nose"): two opposite nose movements (Message 6), coloured from the face-muscle packet.
      { id: `${c.code}_nose_wrinkle`, label: 'Wrinkle the nose', joints: { nose_wrinkle: 15 },
        agonists: [...both('levator labii superioris alaeque nasi'), 'transverse part of left nasalis', 'transverse part of right nasalis'],
        antagonists: both('depressor septi nasi') },
      { id: `${c.code}_nose_flare`, label: 'Flare the nostrils', joints: { nose_wrinkle: -15 },
        agonists: ['alar part of left nasalis', 'alar part of right nasalis', ...both('depressor septi nasi')],
        antagonists: ['transverse part of left nasalis', 'transverse part of right nasalis'] }
    ],
    explanation: `Nose area of the ${c.H} hemisphere, inside the face zone between the eyelid and mouth-corner areas. The nose muscles are facial-expression muscles supplied by the facial nucleus through corticobulbar fibres. Levator labii superioris alaeque nasi and the transverse part of nasalis wrinkle the nose; the alar part of nasalis and depressor septi nasi flare the nostrils. ${c.face
      ? `BodyParts3D 4.0 has none of these muscles; ${FACE_PACKET_NAME} adds them (nasalis as one piece per side), so the game colours them with the simulated display level, and the nose does not change shape.`
      : 'BodyParts3D 4.0 has none of these muscles, so the game only records a simulated display level here: nothing on the face layer moves or changes colour.'} The face zone is one representative row here; the nose has no separately measured spot on this strip.`,
    citationKeys: faceCites(c, ['PENFIELD1937', 'MORECRAFT2001', 'UAMS_HEADNECK'])
  }),
  lower_face: c => ({
    label: `Lower face (${c.S} mouth corner)`, shortLabel: 'Smile', effector: `lower face: mouth-corner lift and pull-down (mainly the ${c.S} side)`, bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'contralateral_predominant',
    actions: [
      { id: `${c.code}_smile`, label: 'Lift mouth corner (smile)', joints: { smile: 15 },
        agonists: sided(c.S, 'zygomaticus major', 'levator anguli oris', 'risorius'),
        antagonists: sided(c.S, 'depressor anguli oris'), lateralBias: c.S,
        note: c.face
          ? `${FACE_PACKET_NAME_CAP} adds these muscles: the smile is a simulated display level shown as colour on the ${c.S} cheek muscles, and the face shape does not move (the ${c.S} side receives most of this hemisphere's drive).`
          : `BodyParts3D 4.0 has no mesh for these muscles: the smile is a simulated display level only, and nothing moves or is coloured (the ${c.S} side would receive most of this hemisphere's drive).` },
      // R558 (Messages 14 / 6): the smile's opposite: depressor anguli oris (with platysma) pulls the corner down.
      { id: `${c.code}_mouth_down`, label: 'Pull mouth corner down', joints: { smile: -15 },
        agonists: sided(c.S, 'depressor anguli oris', 'platysma'),
        antagonists: sided(c.S, 'zygomaticus major', 'levator anguli oris'), lateralBias: c.S }
    ],
    explanation: `Lower-face area of the ${c.H} hemisphere, where zygomaticus major and levator anguli oris lift the corner of the mouth and depressor anguli oris (with platysma) pulls it down. Corticobulbar fibres to the lower face are mainly crossed (Morecraft 2001, in monkeys), so the ${c.S} mouth corner gets most of this hemisphere's drive. ${c.face
      ? `BodyParts3D 4.0 has none of these facial-expression muscles; ${FACE_PACKET_NAME} adds them, so the game colours them on the ${c.S} side with the simulated display level, and the face shape does not change.`
      : 'BodyParts3D 4.0 has none of these facial-expression muscles, so the game only records a simulated display level here: nothing on the face layer moves or changes colour.'} Only voluntary smiling is described; emotional smiling also uses separate pathways.`,
    citationKeys: faceCites(c, ['MORECRAFT2001', 'PENFIELD1937', 'UAMS_HEADNECK'])
  }),
  lips: c => ({
    label: 'Lips', shortLabel: 'Lips', effector: 'lips: purse, stretch, upper lip lift, lower lip pout and pull-down', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'contralateral_predominant',
    actions: [
      // R558 (Messages 14 / 6): five lip movements in opposing pairs. Pursing also brings a lifted upper lip down
      // (orbicularis oris closes the lips), so it is the upper-lip lift's opposite.
      { id: `${c.code}_lip_purse`, label: 'Purse the lips', joints: { lip_purse: 15, upper_lip: 0 },
        agonists: ['orbicularis oris'], antagonists: [...both('zygomaticus major'), ...both('risorius')], lateralBias: c.S },
      { id: `${c.code}_lip_stretch`, label: 'Stretch the lips wide', joints: { lip_purse: -15 },
        agonists: [...both('risorius'), ...both('buccinator')], antagonists: ['orbicularis oris'], lateralBias: c.S },
      { id: `${c.code}_upper_lip_lift`, label: 'Lift the upper lip', joints: { upper_lip: 15 },
        agonists: [...both('levator labii superioris'), ...both('zygomaticus minor'), ...both('levator labii superioris alaeque nasi')],
        antagonists: ['orbicularis oris'], lateralBias: c.S },
      { id: `${c.code}_lower_lip_pout`, label: 'Push the lower lip up (pout)', joints: { lower_lip: 15 },
        agonists: both('mentalis'), antagonists: both('depressor labii inferioris'), lateralBias: c.S },
      { id: `${c.code}_lower_lip_down`, label: 'Pull the lower lip down', joints: { lower_lip: -15 },
        agonists: [...both('depressor labii inferioris'), ...both('platysma')], antagonists: both('mentalis'), lateralBias: c.S }
    ],
    explanation: `Lip area of the ${c.H} hemisphere, where orbicularis oris purses the lips, risorius and buccinator stretch them wide, levator labii superioris and zygomaticus minor lift the upper lip, and mentalis pushes the lower lip up while depressor labii inferioris pulls it down. Corticobulbar fibres reach the facial nucleus, with a crossed predominance for the lower face (Morecraft 2001). ${c.face
      ? `BodyParts3D 4.0 has no orbicularis oris mesh; ${FACE_PACKET_NAME} adds it and the other lip muscles, so the game colours them with the simulated display level, and the lips do not move.`
      : 'BodyParts3D 4.0 has no orbicularis oris mesh, so the game only records a simulated display level here: nothing on the face layer moves or changes colour.'} Lip movement is a classic landmark of fMRI motor somatotopy (Lotze 2000), and speech uses this area together with the jaw, tongue and larynx.`,
    citationKeys: faceCites(c, ['LOTZE2000', 'MORECRAFT2001', 'PENFIELD1937', 'UAMS_HEADNECK'])
  }),
  jaw: c => ({
    label: 'Jaw', shortLabel: 'Jaw', effector: 'jaw opening, closing and side shift', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral_contralateral_bias',
    actions: [
      { id: `${c.code}_jaw_open`, label: 'Open the jaw', joints: { jaw_open: 30 },
        agonists: [...both('lateral pterygoid'), 'anterior belly of left digastric', 'anterior belly of right digastric', ...both('mylohyoid')],
        antagonists: [...both('masseter'), ...both('temporalis'), ...both('medial pterygoid')] },
      { id: `${c.code}_jaw_clench`, label: 'Clench the jaw', joints: { jaw_open: 0 },
        agonists: [...both('masseter'), ...both('temporalis'), ...both('medial pterygoid')],
        antagonists: [...both('lateral pterygoid'), 'anterior belly of left digastric', 'anterior belly of right digastric'], lateralBias: c.S,
        note: c.face
          ? `Masseter, temporalis and the medial pterygoid come from ${FACE_PACKET_NAME} and are coloured with the simulated display level; the jaw is closed at rest, so clenching shows no movement then, and after the jaw has opened it closes the jaw again; bite force is not modelled.`
          : 'Masseter, temporalis and the medial pterygoid have no BodyParts3D 4.0 mesh, so clenching shows no colour; the jaw is closed at rest, so clenching shows no movement then, and after the jaw has opened it closes the jaw again; bite force is not modelled.' },
      // R558 (Message 14): side shift 10 mm (a usual adult lateral excursion). The pterygoids of one side push the chin
      // to the OTHER side; the crossed hemisphere drives the opposite pterygoids more, so each hemisphere shifts the chin
      // toward its own side (a game choice from that crossed bias).
      c.H === 'right'
        ? { id: 'rh_jaw_shift_right', label: 'Shift the jaw to the right', joints: { jaw_side: -10 },
          agonists: ['left lateral pterygoid', 'left medial pterygoid'], antagonists: ['right lateral pterygoid', 'right medial pterygoid'],
          note: JAW_SHIFT_NOTE }
        : { id: 'lh_jaw_shift_left', label: 'Shift the jaw to the left', joints: { jaw_side: 10 },
          agonists: ['right lateral pterygoid', 'right medial pterygoid'], antagonists: ['left lateral pterygoid', 'left medial pterygoid'],
          note: JAW_SHIFT_NOTE }
    ],
    explanation: `Jaw area of the ${c.H} hemisphere, which opens the mouth (lateral pterygoid, digastric), clenches it (masseter, temporalis) or shifts the chin to the ${c.So} (the ${c.S} lateral and medial pterygoids). Corticobulbar fibres reach the trigeminal motor nucleus from both hemispheres, but the crossed hemisphere has the stronger drive to the masseter (Nordstrom 2007). ${c.face
      ? `In the game, opening swings the jaw on the face of the mirror body and colours the digastric, mylohyoid and lateral pterygoid; clenching colours the masseter, temporalis and medial pterygoid (from ${FACE_PACKET_NAME}) and closes the jaw again after it has opened; from the closed rest position it shows no movement.`
      : 'In the game, opening swings the jaw on the face of the mirror body and colours the digastric and mylohyoid; masseter, temporalis and the pterygoids have no BodyParts3D 4.0 mesh, so clenching shows no colour; it closes the jaw again after it has opened, and from the closed rest position it shows no movement.'} Chewing rhythm is generated in the brainstem and is not modelled.`,
    citationKeys: faceCites(c, ['NORDSTROM2007', 'PENFIELD1937', 'UAMS_HEADNECK'])
  }),
  tongue: c => ({
    label: 'Tongue', shortLabel: 'Tongue', effector: 'tongue protrusion', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral_contralateral_bias',
    actions: [],
    noActionReason: 'Tongue movement is not ready in this loaded rig. Selecting this region can light and mark the brain area. A suitable tongue model and checked motion are still needed.',
    explanation: `Representative tongue area of the ${c.H} hemisphere within the mouth zone (Gordon 2023). A human magnetic brain-stimulation study reported evoked tongue-muscle electrical responses on both sides, with lower thresholds on the opposite side (Muellbacher 2001; abstract-level evidence). These responses do not specify normal tongue motion or a precise movement command here. This loaded rig has no qualified tongue movement or tongue-muscle display. Selecting the region can light and mark the brain area; tongue function remains unfinished. Swallowing has its own area just after this one; the larynx is not modelled.`,
    citationKeys: ['GORDON2023', 'MUELLBACHER2001', 'PENFIELD1937', 'UAMS_HEADNECK']
  }),
  throat: c => ({
    label: 'Throat (swallowing)', shortLabel: 'Swallow', effector: 'swallowing: the hyoid bone lifts (both sides)', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral',
    actions: [
      // R558 (Message 14, "swallowing / larynx"): the swallow lifts the hyoid (ns-body HYOID_LIFT, up to 15 mm); its
      // opposite lowers it again (Message 6).
      { id: `${c.code}_swallow`, label: 'Swallow (lift the hyoid)', joints: { hyoid_elev: 20 },
        agonists: [...both('digastric'), 'anterior belly of left digastric', 'anterior belly of right digastric', 'posterior belly of left digastric',
          'posterior belly of right digastric', ...both('geniohyoid'), ...both('mylohyoid'), ...both('stylohyoid'), ...both('thyrohyoid')],
        antagonists: [...both('sternohyoid'), ...both('omohyoid'), ...both('sternothyroid')] },
      { id: `${c.code}_throat_relax`, label: 'Lower the hyoid again', joints: { hyoid_elev: 0 },
        agonists: [...both('sternohyoid'), ...both('omohyoid'), ...both('sternothyroid')],
        antagonists: [...both('geniohyoid'), ...both('mylohyoid')],
        note: 'Lowering lights the muscles below the hyoid (sternohyoid, omohyoid, sternothyroid) and moves the hyoid back to rest.' }
    ],
    explanation: `Swallowing area of the ${c.H} hemisphere, at the lateral end of the strip after the tongue, where Penfield placed swallowing. Swallowing is represented in both hemispheres; the swallow itself is run by a pattern generator in the brainstem, so the cortex starts and shapes it rather than timing each muscle. In the game, a swallow lifts the hyoid bone up and forward by up to 15 mm (a display choice inside the usual adult excursion of about 1 to 2 cm) and colours the muscles above it (digastric, geniohyoid, mylohyoid, stylohyoid, thyrohyoid); lowering it colours the muscles that pull it back down (sternohyoid, omohyoid, sternothyroid). The tongue, the pharynx and the larynx have no mesh in this body. Gordon 2023 lists swallowing among the movements most preferred at inter-effector centres, so this area borders the inferior in-between region.`,
    citationKeys: ['PENFIELD1937', 'GORDON2023', 'UAMS_HEADNECK']
  }),
  scan_inferior: c => ({
    label: 'Inferior inter-effector (SCAN)', shortLabel: 'SCAN inf.', effector: 'most ventral inter-effector region, beyond the mouth zone (somato-cognitive action network); no isolated body part',
    bodySide: 'midline', medialSurface: false, kind: 'integration', displayGroup: 'integration', pathway: 'integration', laterality: 'bilateral network',
    actions: [],
    noActionReason: 'Inter-effector regions show weak movement specificity; swallowing has its own area just before this one and the larynx is not in the rig, so the game moves nothing here.',
    explanation: `Inferior inter-effector region of the somato-cognitive action network (SCAN), the most ventral of the three, beyond the mouth zone of the ${c.H} hemisphere (Gordon 2023, seed 6 of the dorsal-to-ventral line). Gordon lists swallowing among the movements most preferred at inter-effector centres, while a laryngeal vowel task stayed inside the mouth zone. In the game, looking here lights and marks the region but moves nothing; swallowing has its own area just before this one, and breathing and the larynx are not simulated.`,
    citationKeys: ['GORDON2023']
  })
};

/** A left-arm action: armActionId = id; joints {} because the existing arm rig (ns-actions ACTION_TARGETS / ns-arm)
 * drives them. Catalog keys are MOVEMENT-MAP r2 muscle_catalog keys; names are BodyParts3D concept names. */
function leftArm(id, label, primary, reduced, stabil, agonistNames = null, antagonistNames = null, note = null) {
  const names = keys => keys.map(k => CATALOG_NAMES[k]);
  const a = {
    id, label, armActionId: id, joints: {},
    agonists: agonistNames || names(primary),
    antagonists: antagonistNames || names(reduced),
    stabilizers: names(stabil),
    catalogRoles: { primary_drive_increase: [...primary], relative_drive_reduction: [...reduced], limited_stabilization_or_posture_dependent: [...stabil] }
  };
  if (note) a.note = note;
  return a;
}

/** MOVEMENT-MAP r2 muscle_catalog keys -> BodyParts3D/FMA concept names (left side). */
export const CATALOG_NAMES = Object.freeze({
  FDS: 'left flexor digitorum superficialis', FDP: 'left flexor digitorum profundus', ED: 'left extensor digitorum',
  EI: 'left extensor indicis', EDM: 'left extensor digiti minimi', LUM: 'lumbricals of left hand',
  DI: 'dorsal interossei of left hand', PI: 'palmar interossei of left hand', ADM: 'abductor digiti minimi of left hand',
  FPB: 'left flexor pollicis brevis', FPL: 'left flexor pollicis longus', EPB: 'left extensor pollicis brevis',
  EPL: 'left extensor pollicis longus', OP: 'left opponens pollicis', ADP: 'left adductor pollicis',
  FCR: 'left flexor carpi radialis', FCU: 'left flexor carpi ulnaris', ECRL: 'left extensor carpi radialis longus',
  ECRB: 'left extensor carpi radialis brevis', ECU: 'left extensor carpi ulnaris', BRA: 'left brachialis',
  BIC: 'left biceps brachii', BRD: 'left brachioradialis', TRI: 'left triceps brachii', ANC: 'left anconeus'
});

// ---------------------------------------------------------------------------------------------
// Short plain-language caveats (round-2 fix SCI-4 / F6)

/** One short, plain-language caveat per region, always shown in the information overlay. Each one restates the hedge
 * that the region's longer explanation already gives (no new claim), so a clipped explanation never shows a claim
 * without its qualifier. Keyed by CONTENT key; c = ctxFor(hemisphere). */
const NO_FACE_MUSCLES = 'No facial-expression muscles exist in the dataset: nothing here moves or changes colour.';
// R5-text: with the face-muscle packet loaded.
const FACE_COLOUR_ONLY = 'The face muscles show the simulated level as colour only: the face shape does not change.';
const SCAN_CAVEAT = 'Moves nothing in the game: any real role (planning, posture) is not simulated.';
const REGION_CAVEATS = {
  toes: () => 'A schematic spot: the real toe area lies on the brain\u2019s inner (medial) wall; the big toe shares it.',
  ankle: () => 'Leg areas form overlapping rings around the toe area rather than a strict line.',
  knee: () => 'The knee area overlaps the ankle and hip areas.',
  hip: () => 'Hip muscles also serve posture and balance, which are not modelled.',
  scan_superior: () => SCAN_CAVEAT,
  trunk: () => 'Few trunk measurements exist; breathing and posture are not modelled.',
  shoulder: c => (c.H === 'right'
    ? 'Your look and W/A/S/D carry the left shoulder, so looking here adds no separate movement.'
    : 'Arm areas overlap, and stimulation rarely moves the shoulder on its own.'),
  elbow: () => 'The bend and straighten spots are representative, not separately measured centres.',
  forearm: () => 'No separate published spot for turning the palm exists: this is a game placement.',
  wrist: c => (c.H === 'right'
    ? 'The wrist area overlaps the fingers; the game arm cannot bend its wrist sideways, so those spots only colour.'
    : 'The wrist area overlaps the fingers; this strip shows it as one simplified region.'),
  hand: () => 'Grasp areas overlap and differ between people; opening the hand on release is a game convention.',
  index: () => 'Bending and straightening one finger use overlapping activity; the colour covers every finger.',
  thumb: () => 'Placed by mirroring right-thumb studies, so the spot is representative.',
  little: () => 'Placed by mirroring right-hand studies; single-finger patterns overlap, and the colour covers every finger.',
  ring: () => 'Placed by mirroring right-hand studies; single-finger patterns overlap, and the colour covers every finger.',
  middle: () => 'Placed by mirroring right-hand studies; single-finger patterns overlap, and the colour covers every finger.',
  r_hand: () => 'Finger areas overlap, and even the hand area responds to other body parts.',
  r_little: () => 'Single-finger patterns overlap; the finger muscles are whole meshes, so the colour covers every finger.',
  r_ring: () => 'Single-finger patterns overlap; the finger muscles are whole meshes, so the colour covers every finger.',
  r_middle: () => 'Single-finger patterns overlap; the finger muscles are whole meshes, so the colour covers every finger.',
  r_index: () => 'Single-finger patterns overlap; the finger muscles are whole meshes, so the colour covers every finger.',
  r_thumb: () => 'Thumb directions vary with the task and between people, so the spot is representative.',
  neck: () => 'The neck\u2019s place on this strip is debated, and which side turns the head is unresolved (a game choice).',
  scan_middle: () => SCAN_CAVEAT,
  brow: c => (c.face ? FACE_COLOUR_ONLY : NO_FACE_MUSCLES),
  eyelid: c => (c.face ? FACE_COLOUR_ONLY : NO_FACE_MUSCLES),
  nose: c => (c.face ? FACE_COLOUR_ONLY : NO_FACE_MUSCLES),
  lower_face: c => (c.face ? FACE_COLOUR_ONLY : NO_FACE_MUSCLES),
  lips: c => (c.face ? FACE_COLOUR_ONLY : NO_FACE_MUSCLES),
  jaw: c => (c.face ? 'The jaw is closed at rest, so clenching moves it only after it has opened.' : 'The clenching muscles have no mesh, so clenching shows no colour; it moves the jaw only after it has opened.'),
  tongue: () => 'Tongue movement and tongue-muscle colour changes are not ready in this loaded rig.',
  throat: () => 'The brainstem runs the swallow; the pharynx and the larynx have no mesh.',
  scan_inferior: () => SCAN_CAVEAT
};

// ---------------------------------------------------------------------------------------------
// Plain-language fields (round 3, R3-text: user R17, lead decision D3)
//
// Written for a curious 12-year-old: short sentences, everyday words, technical names only in brackets. Each plain field
// restates what the region's technical explanation, actions and notes already say; none adds a claim. c = ctxFor(h):
// c.H = the brain half, c.S = the body side it mainly moves (opposite), c.Sc = capitalised c.S.

const half = c => `your brain’s ${c.H} half`;
const NO_FACE_MESH_PLAIN = 'The 3D body has no face muscles for this, so nothing moves or changes colour.';
const FACE_MOVES_PLAIN = 'Nothing you can see: the game only keeps a number.';
// R5-text: with the face-muscle packet loaded. Moves still start with "Nothing" (ns-guide: no "watch it move" credit).
const FACE_COLOUR_PLAIN = 'Only the colour changes: the face itself does not move in the game.';
const SCAN_MOVES_PLAIN = 'Nothing: it only lights up and gets marked.';
const SCAN_CAVEAT_PLAIN = 'Any real job here, such as planning or posture, is not simulated.';
const LOOK_RIGHT = ' (it starts straight out in front of you)';

/** Region plain fields, keyed like CONTENT. Every plainLead is one sentence; every plainCaveat is <= 110 characters. */
const PLAIN_REGION = {
  toes: c => ({
    plainLabel: `${c.Sc} toes`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} big toe and small toes to curl or lift.`,
    plainMoves: `Curls or lifts your ${c.S} big toe, or your four small toes.`,
    plainCaveat: 'A rough spot. The real toe area is on the inner wall, where the two brain halves meet.'
  }),
  ankle: c => ({
    plainLabel: `${c.Sc} ankle`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} foot to point up or down, or turn its sole in or out.`,
    plainMoves: `Pulls your ${c.S} foot up or points it down, or turns its sole inward or outward.`,
    plainCaveat: 'The leg areas form rings around the toe area. They overlap and do not sit in a neat line.'
  }),
  knee: c => ({
    plainLabel: `${c.Sc} knee`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} knee to bend or straighten.`,
    plainMoves: `Bends or straightens your ${c.S} knee.`,
    plainCaveat: 'The knee spot overlaps the spots for the ankle and the hip.'
  }),
  hip: c => ({
    plainLabel: `${c.Sc} hip`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} thigh to lift, lower, or swing out or in.`,
    plainMoves: `Lifts your ${c.S} thigh a little (more after the knee bends) or lowers it back to the ground, or swings it out to the side or back in.`,
    plainCaveat: 'Hip muscles also help with balance and posture, which the game does not show.'
  }),
  scan_superior: () => ({
    plainLabel: 'In-between area (upper)',
    plainLead: 'This in-between spot on the motor strip is linked to planning moves of the whole body.',
    plainMoves: SCAN_MOVES_PLAIN,
    plainCaveat: SCAN_CAVEAT_PLAIN
  }),
  trunk: c => ({
    plainLabel: 'Belly and back',
    plainLead: `This spot in ${half(c)} signals the belly and back muscles on both sides.`,
    plainMoves: `Bends your body forward or back, or bends or turns it to the ${c.S}.`,
    plainCaveat: 'Few studies measured the trunk area. Breathing and posture are not shown.'
  }),
  shoulder: c => (c.H === 'right' ? {
    plainLabel: 'Left shoulder',
    plainLead: `This spot in ${half(c)} helps move your left shoulder.`,
    plainMoves: 'Nothing extra: your look and the W/A/S/D keys already move the left shoulder.',
    plainCaveat: 'Your look and W/A/S/D already move the left shoulder. Looking here adds no extra movement.'
  } : {
    plainLabel: 'Right shoulder',
    plainLead: `This spot in ${half(c)} tells your right shoulder to move the arm.`,
    plainMoves: `Raises your right arm up or swings it down, and swings it out to the side or back in${LOOK_RIGHT}.`,
    plainCaveat: 'Arm spots overlap. In studies, this spot rarely moves the shoulder on its own.'
  }),
  elbow: c => ({
    plainLabel: `${c.Sc} elbow`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} elbow to bend or straighten.`,
    plainMoves: `Bends or straightens your ${c.S} elbow${c.H === 'left' ? LOOK_RIGHT : ''}.`,
    plainCaveat: 'The bend and straighten spots are rough places, not centres that were measured one by one.'
  }),
  forearm: c => (c.H === 'right' ? {
    plainLabel: 'Left forearm turn',
    plainLead: `This spot in ${half(c)} tells your left palm to turn down or up.`,
    plainMoves: 'Turns your left palm down or up. Tapping Space twice turns it too, with all four limbs.',
    plainCaveat: 'No study shows a separate spot for turning the palm. So this place is a game choice.'
  } : {
    plainLabel: 'Right forearm turn',
    plainLead: `This spot in ${half(c)} tells your right palm to turn down or up.`,
    plainMoves: `Turns your right palm down or up${LOOK_RIGHT}.`,
    plainCaveat: 'Turning the palm shares spots with the wrist and elbow. So this place is a game choice.'
  }),
  wrist: c => ({
    plainLabel: `${c.Sc} wrist`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} wrist to bend either way, or sideways.`,
    plainMoves: c.H === 'left'
      ? `Bends your right wrist toward the palm or back, or toward the thumb or the little finger${LOOK_RIGHT}.`
      : 'Bends your left wrist toward the palm or back. The sideways bends only light up: the game arm cannot bend its wrist sideways.',
    plainCaveat: c.H === 'right'
      ? 'The wrist spot overlaps the finger spots. The game arm’s wrist bends only one way.'
      : 'The wrist spot overlaps the finger spots. Here it is drawn as one simple area.'
  }),
  hand: c => ({
    plainLabel: 'Left hand',
    plainLead: `This spot in ${half(c)} tells your left hand to close or open.`,
    plainMoves: 'Closes, relaxes, opens or spreads your left hand, or brings the fingers together.',
    plainCaveat: 'Grip areas overlap and differ between people.'
  }),
  little: c => ({
    plainLabel: 'Left little finger',
    plainLead: `This spot in ${half(c)} tells your left little finger to bend or straighten.`,
    plainMoves: 'Bends or straightens your left little finger on its own.',
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  ring: c => ({
    plainLabel: 'Left ring finger',
    plainLead: `This spot in ${half(c)} tells your left ring finger to bend or straighten.`,
    plainMoves: 'Bends or straightens your left ring finger on its own.',
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  middle: c => ({
    plainLabel: 'Left middle finger',
    plainLead: `This spot in ${half(c)} tells your left middle finger to bend or straighten.`,
    plainMoves: 'Bends or straightens your left middle finger on its own.',
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  index: c => ({
    plainLabel: 'Left index finger',
    plainLead: `This spot in ${half(c)} tells your left index finger to bend or straighten.`,
    plainMoves: 'Bends or straightens your left index finger.',
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  thumb: c => ({
    plainLabel: 'Left thumb',
    plainLead: `This spot in ${half(c)} tells your left thumb to bend, straighten, or turn across the palm.`,
    plainMoves: 'Bends or straightens your left thumb at the knuckle, or turns it across the palm and back out.',
    plainCaveat: 'Placed by mirroring studies of the right thumb, so the spot is only a rough guide.'
  }),
  r_hand: c => ({
    plainLabel: 'Right hand',
    plainLead: `This spot in ${half(c)} tells your right hand to close or open.`,
    plainMoves: `Closes or opens your right hand, or spreads the fingers or brings them together${LOOK_RIGHT}.`,
    plainCaveat: 'The finger spots overlap. Even the hand spot reacts when other parts of the body move.'
  }),
  r_little: c => ({
    plainLabel: 'Right little finger',
    plainLead: `This spot in ${half(c)} tells your right little finger to bend or straighten.`,
    plainMoves: `Bends or straightens your right little finger on its own${LOOK_RIGHT}.`,
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  r_ring: c => ({
    plainLabel: 'Right ring finger',
    plainLead: `This spot in ${half(c)} tells your right ring finger to bend or straighten.`,
    plainMoves: `Bends or straightens your right ring finger on its own${LOOK_RIGHT}.`,
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  r_middle: c => ({
    plainLabel: 'Right middle finger',
    plainLead: `This spot in ${half(c)} tells your right middle finger to bend or straighten.`,
    plainMoves: `Bends or straightens your right middle finger on its own${LOOK_RIGHT}.`,
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  r_index: c => ({
    plainLabel: 'Right index finger',
    plainLead: `This spot in ${half(c)} tells your right index finger to bend or straighten.`,
    plainMoves: `Bends or straightens your right index finger on its own${LOOK_RIGHT}.`,
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  r_thumb: c => ({
    plainLabel: 'Right thumb',
    plainLead: `This spot in ${half(c)} tells your right thumb to bend, straighten, or turn across the palm.`,
    plainMoves: `Bends or straightens your right thumb, or turns it across the palm and back out${LOOK_RIGHT}.`,
    plainCaveat: 'Thumb directions change with the task and between people, so the spot is only a rough guide.'
  }),
  neck: c => ({
    plainLabel: 'Neck',
    plainLead: `This spot in ${half(c)} tells your head to nod, turn ${c.S} or tilt ${c.S}.`,
    plainMoves: `Bends your head forward or back, turns it to the ${c.S}, or tilts it toward your ${c.S} shoulder.`,
    plainCaveat: 'Where the neck sits here, and which half turns or tilts the head, is still debated (a game choice).'
  }),
  scan_middle: () => ({
    plainLabel: 'In-between area (middle)',
    plainLead: 'This in-between spot on the motor strip, by the hand and face, is linked to planning.',
    plainMoves: SCAN_MOVES_PLAIN,
    plainCaveat: 'In brain tests, a small electric pulse here never moved any body part.'
  }),
  brow: c => ({
    plainLabel: 'Eyebrows',
    plainLead: `This spot in ${half(c)} tells both eyebrows to rise or to frown.`,
    plainMoves: c.face ? 'Nothing moves, but your forehead muscle or your frown muscles light up.' : FACE_MOVES_PLAIN,
    plainCaveat: c.face ? FACE_COLOUR_PLAIN : NO_FACE_MESH_PLAIN
  }),
  eyelid: c => ({
    plainLabel: 'Eyelids',
    plainLead: `This spot in ${half(c)} tells both eyes to close or to open wide.`,
    plainMoves: c.face ? 'Nothing moves, but the ring muscles around your eyes light up when they close.' : FACE_MOVES_PLAIN,
    plainCaveat: c.face ? FACE_COLOUR_PLAIN : NO_FACE_MESH_PLAIN
  }),
  nose: c => ({
    plainLabel: 'Nose',
    plainLead: `This spot in ${half(c)} tells your nose to wrinkle or your nostrils to flare.`,
    plainMoves: c.face ? 'Nothing moves, but the small nose muscles light up.' : FACE_MOVES_PLAIN,
    plainCaveat: c.face ? FACE_COLOUR_PLAIN : NO_FACE_MESH_PLAIN
  }),
  lower_face: c => ({
    plainLabel: `Smile, ${c.S} side`,
    plainLead: `This spot in ${half(c)} tells your mouth corner to lift or drop, mostly on the ${c.S}.`,
    plainMoves: c.face ? `Nothing moves, but the smile muscles, or the muscles that pull the mouth corner down, light up on your ${c.S} side.` : FACE_MOVES_PLAIN,
    plainCaveat: c.face ? FACE_COLOUR_PLAIN : NO_FACE_MESH_PLAIN
  }),
  lips: c => ({
    plainLabel: 'Lips',
    plainLead: `This spot in ${half(c)} tells your lips to purse, stretch, lift or drop.`,
    plainMoves: c.face ? 'Nothing moves, but the muscles around your mouth light up.' : FACE_MOVES_PLAIN,
    plainCaveat: c.face ? FACE_COLOUR_PLAIN : NO_FACE_MESH_PLAIN
  }),
  jaw: c => ({
    plainLabel: 'Jaw',
    plainLead: `This spot in ${half(c)} tells your jaw to open, clench or shift to the ${c.So}.`,
    plainMoves: c.face ? `Opens your jaw, and it stays open. Clenching lights up the chewing muscles and closes it again. It can also shift your chin to the ${c.So}.` : `Opens your jaw, and it stays open. Clenching closes it again. It can also shift your chin to the ${c.So}.`,
    plainCaveat: c.face ? 'Your jaw is closed when you rest. So clenching moves it only after it has opened.' : 'The 3D body has no chewing muscles, so clenching shows no colour.'
  }),
  tongue: c => ({
    plainLabel: 'Tongue',
    plainLead: `This marked area in ${half(c)} represents tongue movement.`,
    plainMoves: 'No tongue movement or muscle colour change. This area can still light up and keep an activation mark.',
    plainCaveat: 'Tongue movement still needs to be built and checked in this 3D body.'
  }),
  throat: c => ({
    plainLabel: 'Throat (swallow)',
    plainLead: `This spot in ${half(c)} starts a swallow.`,
    plainMoves: 'Lifts the small bone in your throat (the hyoid) up and forward, and lowers it again.',
    plainCaveat: 'The base of the brain runs the swallow. The throat and voice box have no 3D parts here.'
  }),
  scan_inferior: () => ({
    plainLabel: 'In-between area (lower)',
    plainLead: 'This in-between spot on the motor strip, past the jaw and tongue, is linked to planning.',
    plainMoves: SCAN_MOVES_PLAIN,
    plainCaveat: SCAN_CAVEAT_PLAIN
  })
};

/** Everyday names of the muscle groups an action's lists name (the Latin names stay in agonists/antagonists). */
const FINGER_BENDERS = 'finger and thumb muscles that close the hand';
const FINGER_STRAIGHTENERS = 'finger and thumb muscles that straighten';
const PALM_DOWN_MUSCLES = 'forearm muscles that turn the palm down';
const PALM_UP_MUSCLES = 'muscles that turn the palm up (including the biceps)';

/** Action plain fields, keyed by the action id without its rh_/lh_ prefix. plainMuscles name ONLY groups that appear in
 * that action's own agonists (pull) and antagonists (relax). */
const PLAIN_ACTION = {
  big_toe_curl: c => ({ plainLabel: `Curl ${c.S} big toe`, pull: 'big-toe curling muscles in the calf and sole', relax: 'big-toe lifting muscles on the shin and top of the foot' }),
  big_toe_lift: c => ({ plainLabel: `Lift ${c.S} big toe`, pull: 'big-toe lifting muscles on the shin and top of the foot', relax: 'big-toe curling muscles in the calf and sole' }),
  toes_curl: c => ({ plainLabel: `Curl ${c.S} small toes`, pull: 'toe-curling muscles in the calf and sole', relax: 'toe-lifting muscles on the shin and top of the foot' }),
  toes_lift: c => ({ plainLabel: `Lift ${c.S} small toes`, pull: 'toe-lifting muscles on the shin and top of the foot', relax: 'toe-curling muscles in the calf and sole' }),
  ankle_dorsiflex: c => ({ plainLabel: `Pull ${c.S} foot up`, pull: 'muscles at the front of the shin', relax: 'calf muscles' }),
  ankle_plantarflex: c => ({ plainLabel: `Point ${c.S} foot down`, pull: 'calf muscles', relax: 'the muscle at the front of the shin' }),
  ankle_invert: c => ({ plainLabel: `Turn ${c.S} sole inward`, pull: 'shin muscles at the front and deep in the calf', relax: 'muscles on the outer side of the shin' }),
  ankle_evert: c => ({ plainLabel: `Turn ${c.S} sole outward`, pull: 'muscles on the outer side of the shin, and a toe-lifting muscle', relax: 'shin muscles at the front and deep in the calf' }),
  knee_flex: c => ({ plainLabel: `Bend ${c.S} knee`, pull: 'muscles at the back of the thigh (hamstrings)', relax: 'muscles at the front of the thigh (quadriceps)' }),
  knee_extend: c => ({ plainLabel: `Straighten ${c.S} knee`, pull: 'muscles at the front of the thigh (quadriceps)', relax: 'muscles at the back of the thigh (hamstrings)' }),
  hip_flex: c => ({ plainLabel: `Lift ${c.S} thigh`, pull: 'deep hip muscles and two front thigh muscles', relax: 'buttock muscle and back-of-thigh muscles' }),
  hip_extend: c => ({ plainLabel: `Lower ${c.S} thigh to the ground`, pull: 'buttock muscle and back-of-thigh muscles', relax: 'deep hip muscles' }),
  hip_abduct: c => ({ plainLabel: `Swing ${c.S} thigh out`, pull: 'side buttock muscles (and one at the side of the hip)', relax: 'inner thigh muscles' }),
  hip_adduct: c => ({ plainLabel: `Swing ${c.S} thigh in`, pull: 'inner thigh muscles', relax: 'side buttock muscles' }),
  trunk_flex: () => ({ plainLabel: 'Bend forward', pull: 'belly muscles on both sides', relax: 'back muscles along the spine' }),
  trunk_extend: () => ({ plainLabel: 'Lean back', pull: 'back muscles along the spine and in the low back', relax: 'belly muscles on both sides' }),
  trunk_side: c => ({ plainLabel: `Bend to the ${c.S}`, pull: `belly and back muscles on your ${c.S} side`, relax: `belly and back muscles on your ${c.So} side` }),
  trunk_turn: c => ({ plainLabel: `Turn to the ${c.S}`, pull: `a ${c.So} outer belly muscle and a ${c.S} inner one`, relax: `a ${c.S} outer belly muscle and a ${c.So} inner one` }),
  r_shoulder_flex: () => ({ plainLabel: 'Raise right arm up', pull: 'front shoulder, chest, upper-arm and side-of-chest muscles', relax: 'back shoulder, back and upper-arm muscles' }),
  r_shoulder_extend: () => ({ plainLabel: 'Swing right arm down and back', pull: 'back shoulder, back and upper-arm muscles', relax: 'front shoulder, chest and upper-arm muscles' }),
  r_shoulder_abd: () => ({ plainLabel: 'Swing right arm out to the side', pull: 'top and back shoulder muscles (including two on the shoulder blade)', relax: 'chest and back muscles that pull the arm in' }),
  r_shoulder_add: () => ({ plainLabel: 'Swing right arm in to the front', pull: 'chest and back muscles that pull the arm in (and one under the shoulder blade)', relax: 'top shoulder muscles' }),
  elbow_flexion: () => ({ plainLabel: 'Bend left elbow', pull: 'muscles at the front of the arm (biceps and others)', relax: 'muscles at the back of the arm (triceps)' }),
  elbow_extension: () => ({ plainLabel: 'Straighten left elbow', pull: 'muscles at the back of the arm (triceps)', relax: 'muscles at the front of the arm (biceps and others)' }),
  r_elbow_flex: () => ({ plainLabel: 'Bend right elbow', pull: 'muscles at the front of the arm (biceps and others)', relax: 'muscles at the back of the arm (triceps)' }),
  r_elbow_extend: () => ({ plainLabel: 'Straighten right elbow', pull: 'muscles at the back of the arm (triceps)', relax: 'muscles at the front of the arm (biceps and others)' }),
  pronation: () => ({ plainLabel: 'Turn left palm down', pull: PALM_DOWN_MUSCLES, relax: PALM_UP_MUSCLES }),
  supination: () => ({ plainLabel: 'Turn left palm up', pull: PALM_UP_MUSCLES, relax: PALM_DOWN_MUSCLES }),
  // R4-fix (review SL4-1): since round 4 the seated right forearm rests FORWARD on the armrest, so turning it moves the
  // palm down / up (as on the left arm); round 3's hanging arm turned it back / forward. R558 (start posture 'open'):
  // the right arm was then held out to the side; since the corrections of the same day it points straight forward with
  // the palm fully down (ns-body BODY_POSTURES.open, r_pronation 160), so supination turns the palm up from there.
  r_pronate: () => ({ plainLabel: 'Turn right palm down', pull: 'forearm muscles that turn the palm down', relax: 'muscles that turn the palm up (including the biceps)' }),
  r_supinate: () => ({ plainLabel: 'Turn right palm up', pull: 'muscles that turn the palm up (including the biceps)', relax: 'forearm muscles that turn the palm down' }),
  wrist_flexion: () => ({ plainLabel: 'Bend left wrist toward the palm', pull: 'wrist muscles on the palm side of the forearm', relax: 'wrist muscles on the back of the forearm' }),
  wrist_extension: () => ({ plainLabel: 'Bend left wrist back', pull: 'wrist muscles on the back of the forearm', relax: 'wrist muscles on the palm side of the forearm' }),
  r_wrist_flex: () => ({ plainLabel: 'Bend right wrist toward the palm', pull: 'wrist muscles on the palm side of the forearm', relax: 'wrist muscles on the back of the forearm' }),
  r_wrist_ext: () => ({ plainLabel: 'Bend right wrist back', pull: 'wrist muscles on the back of the forearm', relax: 'wrist muscles on the palm side of the forearm' }),
  r_wrist_radial: () => ({ plainLabel: 'Bend right wrist toward the thumb', pull: 'wrist muscles on the thumb side of the forearm', relax: 'wrist muscles on the little-finger side' }),
  r_wrist_ulnar: () => ({ plainLabel: 'Bend right wrist toward the little finger', pull: 'wrist muscles on the little-finger side of the forearm', relax: 'wrist muscles on the thumb side' }),
  wrist_radial_deviation: () => ({ plainLabel: 'Bend left wrist toward the thumb', pull: 'wrist muscles on the thumb side of the forearm', relax: 'wrist muscles on the little-finger side' }),
  wrist_ulnar_deviation: () => ({ plainLabel: 'Bend left wrist toward the little finger', pull: 'wrist muscles on the little-finger side of the forearm', relax: 'wrist muscles on the thumb side' }),
  grasp_close: () => ({ plainLabel: 'Close left hand', pull: FINGER_BENDERS, relax: FINGER_STRAIGHTENERS }),
  relax_release: () => ({ plainLabel: 'Relax left grip', pull: 'none: the grip just lets go', relax: 'finger and thumb muscles that bend and that straighten' }),
  open_hand: () => ({ plainLabel: 'Open left hand', pull: FINGER_STRAIGHTENERS, relax: FINGER_BENDERS }),
  spread_fingers: () => ({ plainLabel: 'Spread left fingers', pull: 'small muscles between the finger bones, plus one for the little finger', relax: 'small palm muscles that pull the fingers together' }),
  fingers_together: () => ({ plainLabel: 'Bring left fingers together', pull: 'small palm muscles that pull the fingers together', relax: 'small muscles between the finger bones, plus one for the little finger' }),
  middle_flexion: () => ({ plainLabel: 'Bend left middle finger', pull: 'finger-bending muscles in the forearm and palm', relax: 'finger-straightening muscles' }),
  middle_extension: () => ({ plainLabel: 'Straighten left middle finger', pull: 'finger-straightening muscles', relax: 'finger-bending muscles in the forearm' }),
  ring_flexion: () => ({ plainLabel: 'Bend left ring finger', pull: 'finger-bending muscles in the forearm and palm', relax: 'finger-straightening muscles' }),
  ring_extension: () => ({ plainLabel: 'Straighten left ring finger', pull: 'finger-straightening muscles', relax: 'finger-bending muscles in the forearm' }),
  little_flexion: () => ({ plainLabel: 'Bend left little finger', pull: 'finger-bending muscles in the forearm and palm, and two small little-finger muscles', relax: 'finger-straightening muscles' }),
  little_extension: () => ({ plainLabel: 'Straighten left little finger', pull: 'finger-straightening muscles, including one for the little finger', relax: 'finger-bending muscles in the forearm' }),
  thumb_opposition: () => ({ plainLabel: 'Turn left thumb across the palm', pull: 'short thumb muscles in the palm', relax: 'thumb muscles on the back of the forearm' }),
  thumb_reposition: () => ({ plainLabel: 'Move left thumb out from the palm', pull: 'thumb muscles on the back of the forearm', relax: 'short thumb muscles in the palm' }),
  index_flexion: () => ({ plainLabel: 'Bend left index finger', pull: 'finger-bending muscles in the forearm', relax: 'finger-straightening muscles' }),
  index_extension: () => ({ plainLabel: 'Straighten left index finger', pull: 'finger-straightening muscles', relax: 'finger-bending muscles in the forearm' }),
  thumb_mcp_flexion: () => ({ plainLabel: 'Bend left thumb at the knuckle', pull: 'a short thumb muscle in the palm that bends it', relax: 'a thumb muscle that straightens it' }),
  thumb_mcp_extension: () => ({ plainLabel: 'Straighten left thumb at the knuckle', pull: 'a thumb muscle that straightens it', relax: 'a short thumb muscle in the palm that bends it' }),
  r_grasp: () => ({ plainLabel: 'Close right hand', pull: FINGER_BENDERS, relax: FINGER_STRAIGHTENERS }),
  r_open: () => ({ plainLabel: 'Open right hand', pull: FINGER_STRAIGHTENERS, relax: FINGER_BENDERS }),
  r_spread: () => ({ plainLabel: 'Spread right fingers', pull: 'small muscles between the finger bones, plus one for the little finger', relax: 'small palm muscles that pull the fingers together' }),
  r_together: () => ({ plainLabel: 'Bring right fingers together', pull: 'small palm muscles that pull the fingers together', relax: 'small muscles between the finger bones, plus one for the little finger' }),
  r_little_flex: () => ({ plainLabel: 'Bend right little finger', pull: 'finger-bending muscles in the forearm and palm, and two small little-finger muscles', relax: 'finger-straightening muscles' }),
  r_little_extend: () => ({ plainLabel: 'Straighten right little finger', pull: 'finger-straightening muscles, including one for the little finger', relax: 'finger-bending muscles in the forearm' }),
  r_ring_flex: () => ({ plainLabel: 'Bend right ring finger', pull: 'finger-bending muscles in the forearm and palm', relax: 'finger-straightening muscles' }),
  r_ring_extend: () => ({ plainLabel: 'Straighten right ring finger', pull: 'finger-straightening muscles', relax: 'finger-bending muscles in the forearm' }),
  r_middle_flex: () => ({ plainLabel: 'Bend right middle finger', pull: 'finger-bending muscles in the forearm and palm', relax: 'finger-straightening muscles' }),
  r_middle_extend: () => ({ plainLabel: 'Straighten right middle finger', pull: 'finger-straightening muscles', relax: 'finger-bending muscles in the forearm' }),
  r_index_flex: () => ({ plainLabel: 'Bend right index finger', pull: 'finger-bending muscles in the forearm and palm', relax: 'finger-straightening muscles' }),
  r_index_extend: () => ({ plainLabel: 'Straighten right index finger', pull: 'finger-straightening muscles', relax: 'finger-bending muscles in the forearm' }),
  r_thumb_flex: () => ({ plainLabel: 'Bend right thumb', pull: 'thumb-bending muscles in the forearm and palm', relax: 'thumb muscles that straighten it' }),
  r_thumb_extend: () => ({ plainLabel: 'Straighten right thumb', pull: 'thumb muscles that straighten it', relax: 'thumb-bending muscles in the forearm and palm' }),
  r_thumb_oppose: () => ({ plainLabel: 'Turn right thumb across the palm', pull: 'short thumb muscles in the palm', relax: 'thumb muscles on the back of the forearm' }),
  r_thumb_out: () => ({ plainLabel: 'Move right thumb out from the palm', pull: 'thumb muscles on the back of the forearm', relax: 'short thumb muscles in the palm' }),
  neck_flex: () => ({ plainLabel: 'Bend head forward', pull: 'muscles at the front of the neck', relax: 'muscles at the back of the neck' }),
  neck_extend: () => ({ plainLabel: 'Tilt head back', pull: 'muscles at the back of the neck', relax: 'muscles at the front of the neck' }),
  neck_turn_left: () => ({ plainLabel: 'Turn head to the left', pull: 'a right side-neck muscle and a left back-of-neck one', relax: 'a left side-neck muscle and a right back-of-neck one' }),
  neck_turn_right: () => ({ plainLabel: 'Turn head to the right', pull: 'a left side-neck muscle and a right back-of-neck one', relax: 'a right side-neck muscle and a left back-of-neck one' }),
  neck_side: c => ({ plainLabel: `Tilt head to the ${c.S}`, pull: `side-neck muscles on your ${c.S} side`, relax: `side-neck muscles on your ${c.So} side` }),
  // R5-integrate-core (D20 "plain names with the technical name in brackets"): with the face-muscle packet loaded (c.face) the
  // face and jaw cards name the muscles the game now draws: the plain group first, the technical names in brackets.
  brow_raise: c => ({ plainLabel: 'Raise both eyebrows', pull: c.face ? 'the forehead muscle (frontalis)' : 'the forehead muscle', relax: c.face ? 'frown muscles between the eyebrows (corrugator, procerus)' : 'frown muscles between the eyebrows' }),
  brow_lower: c => ({ plainLabel: 'Frown', pull: c.face ? 'frown muscles between the eyebrows (corrugator, procerus)' : 'frown muscles between the eyebrows', relax: c.face ? 'the forehead muscle (frontalis)' : 'the forehead muscle' }),
  eye_open: () => ({ plainLabel: 'Open both eyes wide', pull: 'eyelid-lifting muscles (levator palpebrae)', relax: 'ring muscles around the eyes' }),
  nose_wrinkle: c => ({ plainLabel: 'Wrinkle the nose', pull: c.face ? 'small muscles at the side of the nose (levator labii superioris alaeque nasi, nasalis)' : 'small muscles at the side of the nose', relax: c.face ? 'a small muscle under the nose tip (depressor septi nasi)' : 'a small muscle under the nose tip' }),
  nose_flare: c => ({ plainLabel: 'Flare the nostrils', pull: c.face ? 'the nostril muscles (nasalis, depressor septi nasi)' : 'the nostril muscles', relax: 'the part of the nose muscle that squeezes the nostrils' }),
  mouth_down: c => ({ plainLabel: `Pull mouth corner down (mostly the ${c.S} side)`, pull: c.face ? `the muscle that pulls the ${c.S} mouth corner down, and the thin neck muscle (depressor anguli oris, platysma)` : `the muscle that pulls the ${c.S} mouth corner down`, relax: `smile muscles in the ${c.S} cheek` }),
  lip_stretch: c => ({ plainLabel: 'Stretch the lips wide', pull: c.face ? 'cheek muscles that pull the mouth corners out (risorius, buccinator)' : 'cheek muscles that pull the mouth corners out', relax: 'the ring muscle around the mouth' }),
  upper_lip_lift: c => ({ plainLabel: 'Lift the upper lip', pull: c.face ? 'muscles that lift the upper lip (levator labii superioris, zygomaticus minor)' : 'muscles that lift the upper lip', relax: 'the ring muscle around the mouth' }),
  lower_lip_pout: c => ({ plainLabel: 'Push the lower lip up (pout)', pull: c.face ? 'the chin muscle (mentalis)' : 'the chin muscle', relax: 'the muscle that pulls the lower lip down' }),
  lower_lip_down: c => ({ plainLabel: 'Pull the lower lip down', pull: c.face ? 'the muscle that pulls the lower lip down, and the thin neck muscle (depressor labii inferioris, platysma)' : 'the muscle that pulls the lower lip down', relax: 'the chin muscle' }),
  eye_close: c => ({ plainLabel: 'Close both eyes', pull: c.face ? 'ring muscles around the eyes (orbicularis oculi)' : 'ring muscles around the eyes', relax: c.face ? 'eyelid-lifting muscles (levator palpebrae)' : 'eyelid-lifting muscles' }),
  smile: c => ({ plainLabel: `Smile (mostly the ${c.S} side)`, pull: c.face ? `smile muscles in the ${c.S} cheek (zygomaticus major, risorius)` : `smile muscles in the ${c.S} cheek`, relax: c.face ? `the muscle that pulls the ${c.S} mouth corner down (depressor anguli oris)` : `the muscle that pulls the ${c.S} mouth corner down` }),
  lip_purse: c => ({ plainLabel: 'Purse the lips', pull: c.face ? 'the ring muscle around the mouth (orbicularis oris)' : 'the ring muscle around the mouth', relax: c.face ? 'smile muscles in both cheeks (zygomaticus major, risorius)' : 'smile muscles in both cheeks' }),
  // R3-fix (review SL-8): the lateral pterygoid is itself a chewing muscle; the closers are the jaw-closing chewing muscles.
  jaw_open: c => ({ plainLabel: 'Open the jaw', pull: c.face ? 'muscles under the chin and one deep chewing muscle (digastric, pterygoid)' : 'muscles under the chin and one deep chewing muscle', relax: c.face ? 'jaw-closing (chewing) muscles (masseter, temporalis)' : 'jaw-closing (chewing) muscles' }),
  jaw_shift_right: () => ({ plainLabel: 'Move jaw to the right', pull: 'the deep chewing muscles on the left side (pterygoids)', relax: 'the deep chewing muscles on the right side' }),
  jaw_shift_left: () => ({ plainLabel: 'Move jaw to the left', pull: 'the deep chewing muscles on the right side (pterygoids)', relax: 'the deep chewing muscles on the left side' }),
  swallow: () => ({ plainLabel: 'Swallow', pull: 'muscles under the chin that lift the throat bone (digastric, geniohyoid, mylohyoid, stylohyoid, thyrohyoid)', relax: 'strap muscles below the throat bone (sternohyoid, omohyoid, sternothyroid)' }),
  throat_relax: () => ({ plainLabel: 'Lower the throat bone again', pull: 'strap muscles below the throat bone (sternohyoid, omohyoid, sternothyroid)', relax: 'muscles under the chin' }),
  jaw_clench: c => ({ plainLabel: 'Clench the jaw', pull: c.face ? 'jaw-closing (chewing) muscles (masseter, temporalis)' : 'jaw-closing (chewing) muscles', relax: c.face ? 'muscles under the chin and one deep chewing muscle (digastric, pterygoid)' : 'muscles under the chin and one deep chewing muscle' }),
};

/** Key of PLAIN_ACTION for an action id ('rh_knee_flex' -> 'knee_flex', 'lh_r_grasp' -> 'r_grasp', 'grasp_close'). */
export function plainActionKey(actionId) { return String(actionId).replace(/^(rh|lh)_/, ''); }

// ---------------------------------------------------------------------------------------------
// Plain "More detail" layer (round 4, R4-text; lead: More detail readable for a curious 12-year-old, Flesch >= 50,
// technical terms and citations kept, in brackets after a plain phrase).
//
// plainDetail restates the region's technical `explanation` sentence by sentence in shorter, everyday words. Every
// technical term, muscle name and citation of the explanation is kept, in brackets after its plain phrase (checked by
// tests/unit/R4-text-detail.test.mjs); nothing is added, dropped or changed in meaning. plainNoAction restates
// `noActionReason`, and an action's plainNote restates its `note`. The technical fields stay unchanged as the science
// record (the technical-layer sha256 pin in R3-text-bodymap.test.mjs strips only plain* fields, so it still holds).

const BRAIN_HALF = (c, cite = '') => `the brain’s ${c.H} half (${c.H} hemisphere${cite ? `; ${cite}` : ''})`;
const LEG_PATH_PLAIN = c => `The long fibres from here cross to the other side at the base of the brain (corticospinal fibres, ` +
  `medulla). They reach the nerve cells for the ${c.S} leg in the lower spinal cord (lumbosacral motor neurons).`;
const ARM_PATH_PLAIN = (what, terms = '') => `Its fibres cross over and reach the nerve cells for ${what} in the neck part ` +
  `of the spinal cord (crossed corticospinal fibres, cervical motor neurons${terms}).`;
const SIM_SIGNAL = 'a made-up signal (simulated)';
const NO_FACE_LEVEL = 'So the game only keeps a made-up level here (a simulated display level): nothing on the face layer ' +
  'moves or changes colour.';
// R5-text: with the face-muscle packet loaded (FACE_PACKET).
const FACE_SET_PLAIN = 'The game now gets them from an extra set of 3D face muscles (the face-muscle packet, face-muscles-r1).';
const SCAN_NETWORK = 'It belongs to a newly found network for planning actions (somato-cognitive action network, SCAN).';
const SCAN_WEAK = 'In-between areas are only loosely tied to one movement (inter-effector regions show weak movement ' +
  'specificity).';

/** Region plain detail (and plainNoAction where the region has a noActionReason), keyed like CONTENT. */
const PLAIN_DETAIL = {
  toes: c => ({
    detail: `This is the toe area for your ${c.S} foot. It sits in the middle of the foot zone, on the inner wall where ` +
      `the two halves of the brain meet (medial wall, paracentral lobule, ${c.H} hemisphere). ${LEG_PATH_PLAIN(c)} The ` +
      `game sends a made-up signal with no units (a simulated, unitless drive). It curls or lifts the ${c.S} big toe ` +
      '(flexor or extensor hallucis longus) or the four small toes (flexor or extensor digitorum longus), and colours ' +
      'those muscles in this area’s own colour, as on the brain, together with the short toe muscles in the sole (flexor ' +
      'hallucis and digitorum brevis) and on top of the foot (extensor hallucis and digitorum brevis). In brain scans (fMRI) and stimulation studies, moving the toes switches on this inner ' +
      'zone. But the spot here is simplified (schematic): the inner end of the strip stands in for the inner wall ' +
      '(medial edge, medial wall), and the big toe and the small toes share one area.'
  }),
  ankle: c => ({
    detail: `This is the ankle and foot area for your ${c.S} leg, in ${BRAIN_HALF(c)}. It sits beside the toe area, on the inner wall ` +
      `(medial wall and paracentral lobule). ${LEG_PATH_PLAIN(c)} In the game, ${SIM_SIGNAL} pulls the ${c.S} foot up ` +
      'at the ankle (tibialis anterior) or points it down (gastrocnemius and soleus, helped by the fibularis muscles and ' +
      'tibialis posterior). It can also turn the sole inward ' +
      '(tibialis posterior and anterior) or outward (the fibularis muscles). The foot zone is made of rings ' +
      '(concentric). The toes are in the middle, and the ankle, knee and hip form rings around them (Gordon 2023). So ' +
      'these leg areas overlap. They do not sit in a neat line (strict line).'
  }),
  knee: c => ({
    detail: `This is the knee area for your ${c.S} leg. It sits near the top edge of ${BRAIN_HALF(c)}, between the ` +
      `foot and hip areas (dorsal margin). ${LEG_PATH_PLAIN(c)} In the game, ${SIM_SIGNAL} bends the ${c.S} knee ` +
      '(hamstrings) or straightens it (quadriceps). You sit with your legs straight out in front, so your knee starts straight. The knee sits in one of the rings of the foot zone (concentric), and it overlaps the ankle and ' +
      'hip areas.'
  }),
  hip: c => ({
    detail: `This is the hip area for your ${c.S} leg, in ${BRAIN_HALF(c)}. It sits in the outer ring of the foot zone, where it meets the ` +
      `area for the trunk (trunk territory). ${LEG_PATH_PLAIN(c)} In the game, ${SIM_SIGNAL} lifts the ${c.S} thigh ` +
      '(iliopsoas, rectus femoris and sartorius) or lowers it back to the ground (gluteus maximus and hamstrings). It can also swing ' +
      'the thigh out to the side (gluteus medius and minimus) or back in (the adductors). Muscles near the top of the leg ' +
      '(proximal leg muscles) also help with posture and balance. The game does not model that.'
  }),
  scan_superior: c => ({
    detail: `This is the upper in-between area (superior inter-effector region). ${SCAN_NETWORK} It sits between the ` +
      `foot and hand zones of ${BRAIN_HALF(c)}, mixed in with them (interleaved; Gordon 2023). It is strongly linked to ` +
      'the other in-between areas and to a network that helps control actions (cingulo-opercular action-control ' +
      'network). It was most active when people tightened their belly (abdominal contraction) and while they planned an ' +
      'action, not when they moved one body part. In the game, looking here lights up and marks the area, but on ' +
      'purpose it moves nothing. Any real job here would be getting the whole body ready or holding a posture (whole-body ' +
      'postural or preparatory control), and that is not simulated.',
    noAction: `${SCAN_WEAK} They are linked to planning actions, posture and holding the trunk steady (axial control). ` +
      'The game moves nothing here.'
  }),
  trunk: c => ({
    detail: 'This is the trunk area for the belly and back muscles. It sits between the hip and shoulder areas, and ' +
      'it overlaps the upper in-between area (superior inter-effector region). The trunk muscles get signals from both ' +
      'halves of the brain (axial muscles receive corticospinal input from both hemispheres; erector spinae: Ferbert ' +
      '1992). So in the game, each half’s trunk area moves the whole trunk. The game bends you forward (rectus abdominis ' +
      'and obliques), leans you back (the erector spinae columns: iliocostalis, longissimus and spinalis, with quadratus ' +
      `lumborum), bends you to the ${c.S} (the ${c.S} obliques, quadratus lumborum and erector spinae) or turns you to the ${c.S} (the ${c.So} external and ${c.S} internal oblique). Tightening the belly also ` +
      'switches on the in-between areas (abdominal contraction co-activates the inter-effector regions; Gordon 2023). ' +
      'Penfield’s brain maps had too few tests of the trunk to measure it (Catani 2017). Breathing and posture are not ' +
      'modelled.'
  }),
  shoulder: c => (c.H === 'right' ? {
    detail: 'This is the shoulder area for your LEFT arm. It sits at the inner edge of the arm and hand zone in the ' +
      'brain’s right half (medial edge, right hemisphere). Most of its signals cross to the other side (crossed ' +
      'corticospinal fibres dominate). Muscles near the body, such as the shoulder cap muscle, also get weaker signals ' +
      'from the same side (same-side input to proximal muscles such as the deltoid; Bawa 2004). In NeuroSurge, your look ' +
      'and the W/A/S/D keys already move the left shoulder. So looking here lights up and marks the area, but it adds no ' +
      'separate movement. Brain stimulation rarely moves the shoulder on its own (isolated shoulder movement; Gordon ' +
      '2023). Anatomical meshes do not establish which muscles join a movement (muscle recruitment). The activity shown here is simulated, not measured.',
    noAction: 'Your look and the W/A/S/D keys move the left shoulder (the reach lane). It has no separate look action ' +
      '(gaze action), so looking here only lights up and marks the area.'
  } : {
    detail: 'This is the shoulder area for your RIGHT arm. It sits at the inner edge of the arm and hand zone in the ' +
      'brain’s left half (medial edge, left hemisphere). Most of its signals cross to the other side (crossed ' +
      'corticospinal fibres dominate). Muscles near the body also get weaker signals from the same side (same-side ' +
      `input to proximal muscles; Bawa 2004). In the game, ${SIM_SIGNAL} raises the right arm up (front deltoid, ` +
      'pectoralis major, coracobrachialis) or swings it down and back, and swings it out to the side (middle deltoid, supraspinatus) or back in to the front. ' +
      'The arm starts straight out in front of you. The areas for the upper and lower arm overlap (proximal and distal arm representations; Devanne 2006). Brain ' +
      'stimulation rarely moves the shoulder on its own (in isolation; Gordon 2023).'
  }),
  elbow: c => (c.H === 'right' ? {
    detail: 'This is the elbow area for your LEFT arm, in the brain’s right half (right hemisphere). It sits above and ' +
      `inward from the wrist and hand areas (dorsal, medial). ${ARM_PATH_PLAIN('the arm')} In the game, looking here gives ` +
      'a short burst (pulse) of the same elbow bend (flexion: brachialis, biceps, brachioradialis) or straightening ' +
      '(extension: triceps, anconeus) that your left arm already uses. One study placed the elbow mostly above the hand ' +
      'area (Meier 2008; elbow emphasis dorsal to the hand). But its task switched back and forth (alternating task), so ' +
      'it did not find a separate centre for bending and for straightening (flexion centre, extension centre). So the two ' +
      'control spots here are only rough guides (representative).'
  } : {
    detail: 'This is the elbow area for your RIGHT arm, in the brain’s left half (left hemisphere). It sits above and ' +
      `inward from the wrist and hand areas (dorsal, medial). ${ARM_PATH_PLAIN('the arm')} In the game, ${SIM_SIGNAL} ` +
      'bends the right elbow (brachialis, biceps, brachioradialis) or straightens it (triceps, anconeus). One study ' +
      'measured right elbow movement in the brain’s left half, above the hand area (Meier 2008; dorsal to the hand). It ' +
      'found no separate centres for bending and straightening (flexion and extension centres).'
  }),
  forearm: c => (c.H === 'right' ? {
    detail: 'This is the area for turning your LEFT forearm (forearm rotation). The game places it between the elbow ' +
      `and wrist areas of the brain’s right half (right hemisphere). ${ARM_PATH_PLAIN('the forearm-turning muscles', ', forearm rotators')} ` +
      'In the game, looking here turns the left palm down (pronator teres and quadratus) or up (supinator and biceps ' +
      'brachii). A double tap of Space turns it too, together with the other limbs. In the brain, turning the forearm shares overlapping ' +
      'areas with the wrist and elbow (overlapping fields; Meier 2008 tested the wrist and forearm together). No study has ' +
      'published a separate spot for turning the palm down (pronation point). So this spot is a game placement.'
  } : {
    detail: 'This is the area for turning your RIGHT forearm (forearm rotation). It sits between the elbow and wrist ' +
      `areas of the brain’s left half (left hemisphere). ${ARM_PATH_PLAIN('the forearm-turning muscles', ', forearm rotators')} ` +
      `In the game, ${SIM_SIGNAL} turns the right palm down (pronator teres and quadratus) or up (supinator and ` +
      'biceps brachii). Turning the forearm shares overlapping areas with the wrist and elbow (overlapping fields; Meier ' +
      '2008). So this spot is a game placement, not a measured point.'
  }),
  wrist: c => (c.H === 'right' ? {
    detail: 'This is the wrist area for your LEFT hand, in the brain’s right half (right hemisphere). It sits between ' +
      `the forearm-turning area and the hand area. ${ARM_PATH_PLAIN('the wrist muscles', ', wrist flexors and extensors')} ` +
      'In the game, looking here gives a short burst (pulse) of the left wrist bending toward the palm (flexion: flexor ' +
      'carpi radialis and ulnaris) or bending back (extension: the three wrist extensors). The sideways bends toward the ' +
      'thumb (radial deviation) or the little finger (ulnar deviation) colour their muscles, but the game arm does not ' +
      'move: its hand fit has only one wrist axis. In the brain, the wrist area ' +
      'overlaps the fingers and shows up on both sides of the hand zone (wrist representation; Meier 2008; Gordon 2023). ' +
      'But this strip runs in only one direction (one-dimensional), so it shows only the upper part (dorsal part). Maps of ' +
      'the forearm muscles also peak in different places for different tasks (task-specific peaks; Masse-Alarie 2017).'
  } : {
    detail: 'This is the wrist area for your RIGHT hand, in the brain’s left half (left hemisphere). It sits between ' +
      `the forearm-turning area and the hand area. ${ARM_PATH_PLAIN('the wrist muscles')} In the game, ${SIM_SIGNAL} ` +
      'bends the right wrist toward the palm (flexing: flexor carpi radialis and ulnaris) or bends it back (extending: ' +
      'the three wrist extensors). It can also bend it toward the thumb (radial deviation: the radial flexor and ' +
      'extensors) or toward the little finger (ulnar deviation: the two ulnar wrist muscles). In studies of the right hand, the wrist area sits on both sides of the finger area ' +
      '(the wrist emphasis brackets the fingers; Meier 2008). This strip runs in only one direction (one-dimensional), so ' +
      'it shows the wrist as one area (region).'
  }),
  hand: () => ({
    detail: 'This is the hand area for your LEFT hand (the hand knob), in the brain’s right half (right hemisphere). It ' +
      'covers whole-hand moves: grasp, release, open, spread and bringing the fingers together. Its fibres cross over and reach the nerve cells for the ' +
      'hand (crossed corticospinal fibres, hand motor neurons). Some of them link straight to those nerve cells, which ' +
      'helps fine finger control (direct cortico-motoneuronal connections; Lemon 2008). In the game, looking here ' +
      'drives the left-hand actions. The muscles that bend or straighten the fingers (finger ' +
      'flexors or extensors) glow in this area’s own colour, as on the brain. One study measured left-hand grasp and ' +
      'pulling back in the brain’s right half (Huber 2020; grasp and retraction in the right motor cortex). It found ' +
      'overlapping patches that repeat and differ between people (repeated action patches). A real hand can also let go ' +
      'of a grip without any effort (grip release can be passive; Motawar 2012). So opening the hand when it lets go ' +
      'is a game rule (game convention).'
  }),
  little: () => ({
    detail: 'This is the little-finger area for your LEFT hand. It sits inside the hand zone of the brain’s right half ' +
      '(right hemisphere), between the hand area and the ring finger in Penfield’s order (medial-to-lateral sequence). Its fibres cross over and reach ' +
      'the nerve cells for the long muscles that bend and straighten the fingers (crossed corticospinal fibres, motor ' +
      'neurons, long finger flexors and extensors). In the game, looking here bends the left little finger on its own ' +
      '(flexor digitorum superficialis and profundus with the lumbricals, and the little finger’s own short flexor and opponens) or straightens it (extensor digitorum with extensor digiti minimi). Moving one finger uses strongly overlapping brain patterns (single-finger ' +
      'movements share activity patterns; Arbuckle 2020). That study was of the right hand, so it is mirrored here (by ' +
      'inference). The 3D finger muscles are whole muscles (finger flexor and extensor meshes), so their colour covers ' +
      'every finger, and this separate spot is a rough placement (representative).'
  }),
  ring: () => ({
    detail: 'This is the ring-finger area for your LEFT hand. It sits inside the hand zone of the brain’s right half ' +
      '(right hemisphere), between the little and middle fingers in Penfield’s order (medial-to-lateral sequence). Its fibres cross over and reach ' +
      'the nerve cells for the long muscles that bend and straighten the fingers (crossed corticospinal fibres, motor ' +
      'neurons, long finger flexors and extensors). In the game, looking here bends the left ring finger on its own ' +
      '(flexor digitorum superficialis and profundus with the lumbricals) or straightens it (extensor digitorum). Moving one finger uses strongly overlapping brain patterns (single-finger ' +
      'movements share activity patterns; Arbuckle 2020). That study was of the right hand, so it is mirrored here (by ' +
      'inference). The 3D finger muscles are whole muscles (finger flexor and extensor meshes), so their colour covers ' +
      'every finger, and this separate spot is a rough placement (representative).'
  }),
  middle: () => ({
    detail: 'This is the middle-finger area for your LEFT hand. It sits inside the hand zone of the brain’s right half ' +
      '(right hemisphere), between the ring and index fingers in Penfield’s order (medial-to-lateral sequence). Its fibres cross over and reach ' +
      'the nerve cells for the long muscles that bend and straighten the fingers (crossed corticospinal fibres, motor ' +
      'neurons, long finger flexors and extensors). In the game, looking here bends the left middle finger on its own ' +
      '(flexor digitorum superficialis and profundus with the lumbricals) or straightens it (extensor digitorum). Moving one finger uses strongly overlapping brain patterns (single-finger ' +
      'movements share activity patterns; Arbuckle 2020). That study was of the right hand, so it is mirrored here (by ' +
      'inference). The 3D finger muscles are whole muscles (finger flexor and extensor meshes), so their colour covers ' +
      'every finger, and this separate spot is a rough placement (representative).'
  }),
  index: () => ({
    detail: 'This is the index-finger area for your LEFT hand. It sits inside the hand zone of the brain’s right half ' +
      '(right hemisphere), between the middle finger and the thumb in Penfield’s order. Its fibres cross over and reach the nerve cells for the long muscles that bend and straighten ' +
      'the fingers (crossed corticospinal fibres, motor neurons, long finger flexors and extensors). In the game, looking ' +
      'here gives a short burst (pulse) of the left index finger bending or straightening (flexion or extension). Bending ' +
      'and straightening one finger use strongly overlapping brain patterns (activity patterns; Arbuckle 2020). That study ' +
      'was of the right hand, so it is mirrored here (by inference). The 3D finger muscles are whole muscles (finger flexor ' +
      'and extensor meshes), so their colour covers every finger.'
  }),
  thumb: () => ({
    detail: 'This is the thumb area for your LEFT hand. It is the outermost part of the hand zone in the brain’s right ' +
      'half (most lateral, right hemisphere). Its fibres cross over and reach the thumb muscles (crossed corticospinal ' +
      'fibres). In the game, looking here gives a short burst (pulse) of the left thumb bending (flexion: flexor pollicis ' +
      'brevis) or straightening (extension: extensor pollicis brevis) at the knuckle. It can also turn the thumb across the ' +
      'palm at its base (opposition: opponens pollicis and abductor pollicis brevis) or back out (abductor pollicis ' +
      'longus). One study mapped thumb directions for ' +
      'the RIGHT thumb in the brain’s left half, using magnetic pulses (TMS; Z’Graggen 2009). The directions changed ' +
      'with the situation and between people (contextual and individual biases). So this mirrored spot is only a rough ' +
      'guide (representative).'
  }),
  r_hand: () => ({
    detail: 'This is the hand area for your RIGHT hand (the hand knob), in the brain’s left half (left hemisphere). It ' +
      'covers whole-hand moves: closing, opening, spreading and bringing the fingers together. Its fibres cross over and ' +
      'reach the nerve cells for the hand (crossed corticospinal fibres, hand motor neurons). Some link straight to those ' +
      `nerve cells (direct cortico-motoneuronal connections; Lemon 2008). In the game, ${SIM_SIGNAL} closes the right hand ` +
      'into a fist or opens it, and spreads the fingers (dorsal interossei, abductor digiti minimi) or brings them ' +
      'together (palmar interossei); the hand starts straight out in front of you. Studies of the right hand in the brain’s left half find ' +
      'overlapping finger patterns (Arbuckle 2020). Even the top of the hand knob responds to the whole body (the hand ' +
      'knob crown carries whole-body tuning; Willett 2020).'
  }),
  r_little: () => ({
    detail: 'This is the little-finger area for your RIGHT hand. It sits inside the hand zone of the brain’s left half ' +
      '(left hemisphere), between the hand area and the ring finger in Penfield’s order (medial-to-lateral sequence). Its fibres cross over and reach the ' +
      'nerve cells for the long muscles that bend and straighten the fingers (crossed corticospinal fibres, motor neurons, ' +
      'long finger flexors and extensors). In the game, ' + SIM_SIGNAL + ' bends the right little finger on its own (knuckle 90 ' +
      'degrees, middle joint about 105, end joint 85; MCP, PIP, DIP) or straightens it, 30 degrees past straight at the ' +
      'knuckle (hyperextension). Its own short flexor and opponens help the bend, and extensor digiti minimi helps the straightening. In the brain’s left half, bending and straightening one finger use strongly ' +
      'overlapping patterns (single-finger flexion and extension; Arbuckle 2020). The long finger muscles are whole ' +
      'muscles (finger flexor and extensor meshes), so their colour covers every finger, and this separate spot is a ' +
      'rough placement (representative).'
  }),
  r_ring: () => ({
    detail: 'This is the ring-finger area for your RIGHT hand. It sits inside the hand zone of the brain’s left half ' +
      '(left hemisphere), between the little and middle fingers in Penfield’s order (medial-to-lateral sequence). Its fibres cross over and reach the ' +
      'nerve cells for the long muscles that bend and straighten the fingers (crossed corticospinal fibres, motor neurons, ' +
      'long finger flexors and extensors). In the game, ' + SIM_SIGNAL + ' bends the right ring finger on its own (knuckle 90 ' +
      'degrees, middle joint about 105, end joint 85; MCP, PIP, DIP) or straightens it, 30 degrees past straight at the ' +
      'knuckle (hyperextension). In the brain’s left half, bending and straightening one finger use strongly ' +
      'overlapping patterns (single-finger flexion and extension; Arbuckle 2020). The long finger muscles are whole ' +
      'muscles (finger flexor and extensor meshes), so their colour covers every finger, and this separate spot is a ' +
      'rough placement (representative).'
  }),
  r_middle: () => ({
    detail: 'This is the middle-finger area for your RIGHT hand. It sits inside the hand zone of the brain’s left half ' +
      '(left hemisphere), between the ring and index fingers in Penfield’s order (medial-to-lateral sequence). Its fibres cross over and reach the ' +
      'nerve cells for the long muscles that bend and straighten the fingers (crossed corticospinal fibres, motor neurons, ' +
      'long finger flexors and extensors). In the game, ' + SIM_SIGNAL + ' bends the right middle finger on its own (knuckle 90 ' +
      'degrees, middle joint about 105, end joint 85; MCP, PIP, DIP) or straightens it, 30 degrees past straight at the ' +
      'knuckle (hyperextension). In the brain’s left half, bending and straightening one finger use strongly ' +
      'overlapping patterns (single-finger flexion and extension; Arbuckle 2020). The long finger muscles are whole ' +
      'muscles (finger flexor and extensor meshes), so their colour covers every finger, and this separate spot is a ' +
      'rough placement (representative).'
  }),
  r_index: () => ({
    detail: 'This is the index-finger area for your RIGHT hand. It sits inside the hand zone of the brain’s left half ' +
      '(left hemisphere), between the middle finger and the thumb in Penfield’s order (medial-to-lateral sequence). Its fibres cross over and reach the ' +
      'nerve cells for the long muscles that bend and straighten the fingers (crossed corticospinal fibres, motor neurons, ' +
      'long finger flexors and extensors). In the game, ' + SIM_SIGNAL + ' bends the right index finger on its own (knuckle 90 ' +
      'degrees, middle joint about 105, end joint 85; MCP, PIP, DIP) or straightens it, 30 degrees past straight at the ' +
      'knuckle (hyperextension). Extensor indicis helps the straightening. In the brain’s left half, bending and straightening one finger use strongly ' +
      'overlapping patterns (single-finger flexion and extension; Arbuckle 2020). The long finger muscles are whole ' +
      'muscles (finger flexor and extensor meshes), so their colour covers every finger, and this separate spot is a ' +
      'rough placement (representative).'
  }),
  r_thumb: () => ({
    detail: 'This is the thumb area for your RIGHT hand. It is the outermost part of the hand zone in the brain’s left ' +
      'half (most lateral, left hemisphere). Its fibres cross over and reach the thumb muscles (crossed corticospinal ' +
      `fibres). In the game, ${SIM_SIGNAL} bends the right thumb (flexor pollicis longus and brevis) or straightens it ` +
      '(the two thumb extensors). It can also turn the thumb across the palm at its base (opposition: opponens pollicis ' +
      'and abductor pollicis brevis) or back out (abductor pollicis longus). One study mapped the right thumb’s movement ' +
      'directions in this half of the brain, using magnetic pulses (TMS; Z’Graggen 2009). The directions changed with ' +
      'the situation and between people (contextual and individual biases).'
  }),
  neck: c => ({
    detail: `This is the neck area of ${BRAIN_HALF(c)}. The game places it after the thumb, as in Penfield’s order ` +
      '(Penfield’s motor sequence). Neck muscles get signals from both halves of the brain (both hemispheres). The big ' +
      'side-neck muscle gets fibres that cross over and fibres that do not (sternocleidomastoid: crossed and uncrossed ' +
      `projections; Thompson 1997). In the game, ${SIM_SIGNAL} bends the head forward (sternocleidomastoid, longus colli) ` +
      'or back (splenius and semispinalis capitis, the upper erector spinae and the trapezius), turns it to the ' +
      `${c.S} (one ` +
      `sternocleidomastoid with the opposite splenius capitis) or tilts it toward the ${c.S} shoulder (the ${c.S} ` +
      'sternocleidomastoid, scalenes and upper trapezius). Those are game choices, because no one knows yet which ' +
      'half of the brain drives head turning (unresolved). The same study found the side-neck muscle’s area high on the ' +
      'outer surface, near the trunk area (sternocleidomastoid representation high on the convexity; Thompson 1997). So ' +
      'the neck’s place on this strip is debated.'
  }),
  scan_middle: c => ({
    detail: `This is the middle in-between area (middle inter-effector region). ${SCAN_NETWORK} It sits between the ` +
      `hand and mouth zones of ${BRAIN_HALF(c, 'Gordon 2023')}. It is linked to the other in-between areas and to a ` +
      'network that helps control actions (cingulo-opercular network). It is also linked a bit more to the part of the ' +
      'brain for seeing (visual cortex). That may help the hands and eyes work together (hand-eye coordination). In the game, ' +
      'looking here lights up and marks the area, but it moves nothing. Gordon’s new look at old brain stimulation data ' +
      'found that this area never caused a movement in anyone (re-analysis of cortical stimulation). Raising the eyebrows ' +
      'also switched on the in-between areas (eyebrow raising co-activated the inter-effector regions).',
    noAction: 'A new look at old brain stimulation data found that this middle in-between area never caused a movement ' +
      'in anyone (stimulation re-analysis; middle inter-effector region; Gordon 2023). The game moves nothing here.'
  }),
  brow: c => ({
    detail: `This is the eyebrow area of ${BRAIN_HALF(c)}. Here the forehead muscle raises the eyebrows (frontal ` +
      'belly of occipitofrontalis), and two frown muscles lower them and draw them together (corrugator supercilii with ' +
      'procerus). Its fibres reach the face-nerve centre at the base of the brain (corticobulbar ' +
      'fibres, facial nucleus). The upper face gets signals from both halves of the brain (both hemispheres). That is ' +
      'why a stroke on the brain’s surface usually spares the forehead (cortical stroke; monkey tract tracing: Morecraft ' +
      '2001). The 3D body has no face muscles for expressions (BodyParts3D 4.0 has no facial-expression muscles). ' +
      `${c.face ? `${FACE_SET_PLAIN} So the game colours the forehead muscle (or the frown muscles) on both sides with ` +
        'the made-up level (frontal belly of occipitofrontalis; simulated display level). The face shape does not change.' : NO_FACE_LEVEL} ` +
      'In brain scans, raising the eyebrows also switched on the in-between areas (fMRI; co-activated ' +
      'the inter-effector regions; Gordon 2023). So this small area is a simplified placement (schematic).'
  }),
  eyelid: c => ({
    detail: `This is the eyelid area of ${BRAIN_HALF(c)}. Here the ring muscle around the eye closes the eyes ` +
      '(orbicularis oculi). Signals to the upper face come from both halves of the brain (corticobulbar input from both ' +
      'hemispheres; Morecraft 2001, in monkeys). ' + (c.face
      ? `The 3D body has no ring muscle around the eye (BodyParts3D 4.0 has no orbicularis oculi). ${FACE_SET_PLAIN} So the ` +
        'game colours the ring muscles around both eyes with the made-up level (simulated display level). The eyelids do ' +
        'not move. '
      : 'The 3D body has no ring muscle around the eye and no other face muscles ' +
        `for expressions (BodyParts3D 4.0 has no orbicularis oculi or other facial-expression muscle). ${NO_FACE_LEVEL} `) +
      'Opening the eyes (levator palpebrae superioris, oculomotor nerve) and blinking (blink reflexes) use separate ' +
      'circuits that are not simulated. Gordon 2023 lists eyelid movement among the moves an in-between area likes best ' +
      '(most preferred at an inter-effector centre).'
  }),
  nose: c => ({
    detail: `This is the nose area of ${BRAIN_HALF(c)}. It sits inside the face zone, between the eyelid and ` +
      'mouth-corner areas. The nose muscles are face muscles for expressions (facial-expression muscles); their signals ' +
      'reach the face-nerve centre at the base of the brain (corticobulbar fibres, facial nucleus). One muscle that lifts ' +
      'the lip and the side of the nose, with the crosswise part of the nose muscle, wrinkles the nose (levator labii ' +
      'superioris alaeque nasi, transverse part of nasalis). The wing part of the nose muscle and a small muscle under ' +
      'the nose tip flare the nostrils (alar part of nasalis, depressor septi nasi). ' + (c.face
      ? `The 3D body has none of these muscles (BodyParts3D 4.0). ${FACE_SET_PLAIN} The nose muscle is one piece per side ` +
        '(nasalis). So the game colours them with the made-up level (simulated display level), and the nose does not ' +
        'change shape. '
      : `The 3D body has none of these muscles (BodyParts3D 4.0). ${NO_FACE_LEVEL} `) +
      'The face zone is one simplified row here (representative); the nose has no separately measured spot on this strip.'
  }),
  lower_face: c => ({
    detail: `This is the lower-face area of ${BRAIN_HALF(c)}. Here two cheek muscles lift the corner of the mouth ` +
      '(zygomaticus major and levator anguli oris), and a muscle below the corner pulls it down, helped by the thin neck ' +
      'muscle (depressor anguli oris, platysma). Most fibres to the lower face cross to the other side (corticobulbar ' +
      `fibres are mainly crossed; Morecraft 2001, in monkeys). So the ${c.S} mouth corner gets most of the signal from ` +
      'this half (this hemisphere’s drive). The 3D body has none of these face muscles (BodyParts3D 4.0 has none of these ' +
      `facial-expression muscles). ${c.face ? `${FACE_SET_PLAIN} So the game colours them on the ${c.S} side with the made-up ` +
        'level (simulated display level). The face shape does not change.' : NO_FACE_LEVEL} This only covers smiling on purpose (voluntary smiling). A smile from ` +
      'feelings also uses other pathways (emotional smiling, separate pathways).'
  }),
  lips: c => ({
    detail: `This is the lip area of ${BRAIN_HALF(c)}. Here the ring muscle around the mouth purses the lips ` +
      '(orbicularis oris). Two cheek muscles stretch them wide (risorius and buccinator). Two others lift the upper lip ' +
      '(levator labii superioris and zygomaticus minor). The chin muscle pushes the lower lip up (mentalis), and another ' +
      'muscle pulls it down (depressor labii inferioris). Its fibres reach the face-nerve centre at the base of the brain (corticobulbar fibres, facial ' +
      'nucleus). For the lower face, most of them cross over (crossed predominance; Morecraft 2001). The 3D body has no ' +
      `shape for the ring muscle around the mouth (BodyParts3D 4.0 has no orbicularis oris mesh). ${c.face ? `${FACE_SET_PLAIN} ` +
        'So the game colours the ring muscle around the mouth, and the other lip muscles, with the made-up level ' +
        '(simulated display level). The lips do not move.' : NO_FACE_LEVEL} ` +
      'Moving the lips is a classic landmark in brain-scan body maps (fMRI motor somatotopy; Lotze 2000). Speech uses ' +
      'this area together with the jaw, the tongue and the voice box (larynx).'
  }),
  jaw: c => ({
    detail: `This is the jaw area of ${BRAIN_HALF(c)}. It opens the mouth (lateral pterygoid, digastric), clenches ` +
      `it (masseter, temporalis) or shifts the chin to the ${c.So} (the ${c.S} lateral and medial pterygoids). ` +
      'Fibres from both halves of the brain reach the chewing-nerve centre at the base of the ' +
      'brain (corticobulbar fibres, trigeminal motor nucleus, both hemispheres). But the half on the other side sends the ' +
      'stronger signal to the main chewing muscle (the crossed hemisphere has the stronger drive to the masseter; ' +
      'Nordstrom 2007). ' + (c.face
      ? 'In the game, opening swings the jaw on the face of the mirror body (and on your own head, seen from behind). It colours two muscles ' +
        'under the chin and one deep chewing muscle (digastric, mylohyoid and lateral pterygoid). Clenching colours the ' +
        'jaw-closing muscles (masseter, temporalis and medial pterygoid). They come from an extra set of 3D face muscles ' +
        '(the face-muscle packet, face-muscles-r1). Clenching closes the jaw again after it has opened. From the closed rest position it shows no movement. '
      : 'In the game, opening swings the jaw on the face of the mirror body (and on your own head, seen from behind) and colours ' +
        'two muscles under the chin (digastric and mylohyoid). The 3D body has no shape for the clenching muscles ' +
        '(the jaw-closing muscles masseter, temporalis and medial pterygoid, and the lateral pterygoid, have no BodyParts3D 4.0 mesh). So clenching shows no ' +
        'colour. It closes the jaw again after it has opened, and from the closed rest position it shows no movement. ') + 'The chewing rhythm comes from the base of the brain (generated in the brainstem), and it is not modelled.'
  }),
  tongue: c => ({
    detail: `This marked area is a simplified tongue area in ${BRAIN_HALF(c)}, within the mouth zone (Gordon 2023). ` +
      'A human study used magnetic brain stimulation and recorded electrical responses from tongue muscles on both ' +
      'sides. Less stimulation was needed for a response on the opposite side (Muellbacher 2001; abstract only). ' +
      'These are evoked electrical responses, not a measurement of normal tongue motion or a command for this game. ' +
      'Tongue movement and tongue-muscle colour changes are not ready in this loaded 3D body. Selecting this region ' +
      'can light the brain area and leave an activation mark. Tongue function remains unfinished. Swallowing has its own ' +
      'area just after this one; the voice box (larynx) is not modelled.',
    noAction: 'A suitable tongue model and checked motion are still needed in this 3D body. Selecting this region can ' +
      'light and mark the brain area, without a tongue movement or tongue-muscle colour change.'
  }),
  throat: c => ({
    detail: `This is the swallowing area of ${BRAIN_HALF(c)}. It sits at the outer end of the strip, after the tongue, ` +
      'where Penfield placed swallowing. Both halves of the brain take part in swallowing (represented in both ' +
      'hemispheres). The swallow itself is run by a timing circuit at the base of the brain (a pattern generator in the ' +
      'brainstem), so the brain’s surface starts and shapes it rather than timing each muscle. In the game, a swallow ' +
      'lifts the small throat bone up and forward by up to 15 mm (the hyoid bone; a display choice inside the usual ' +
      'adult movement of about 1 to 2 cm). It colours the muscles above that bone (digastric, geniohyoid, mylohyoid, ' +
      'stylohyoid, thyrohyoid); lowering it colours the muscles that pull it back down (sternohyoid, omohyoid, ' +
      'sternothyroid). The tongue, the throat (pharynx) and the voice box (larynx) have no 3D shape here (no mesh). Gordon 2023 lists swallowing among the moves the in-between ' +
      'areas like best (most preferred at inter-effector centres), so this area borders the lower in-between area ' +
      '(inferior in-between region).'
  }),
  scan_inferior: c => ({
    detail: `This is the lower in-between area (inferior inter-effector region). ${SCAN_NETWORK} It is the lowest of ` +
      `the three (most ventral), past the mouth zone of ${BRAIN_HALF(c, 'Gordon 2023, seed 6 of the dorsal-to-ventral line')}. ` +
      'Gordon lists swallowing among the moves the in-between areas like best (most preferred at inter-effector ' +
      'centres). But a vowel-sound task for the voice box stayed inside the mouth zone (laryngeal vowel task). In the ' +
      'game, looking here lights up and marks the area, but it moves nothing. Swallowing has its own area just before ' +
      'this one, and breathing and the voice box (larynx) are not simulated.',
    noAction: `${SCAN_WEAK} Swallowing has its own area just before this one, and the 3D body has no voice box (the ` +
      'larynx is not in the rig), so the game moves nothing here.'
  })
};

const JAW_SHIFT_PLAIN = 'This is a game choice. The deep chewing muscles of one side push the chin toward the other side ' +
  '(pterygoids), and each half of the brain drives the other side’s muscles more strongly (a crossed bias, as for the ' +
  'masseter). So each half shifts the chin toward its own side.';
const LEFT_WRIST_SIDE_PLAIN = 'The game arm keeps your hand where you look, and its wrist bends only one way (toward the palm ' +
  'or back; one wrist axis). So this sideways bend lights the area and colours its muscles, but your left hand does not ' +
  'move. Your right wrist does bend sideways.';
const NECK_CHOICE_PLAIN = 'This is a game choice: each half of the brain turns the head toward the other side (each ' +
  'hemisphere, opposite side). Which half really drives head turning is not known (unresolved).';
/** Action plain notes (restating `note`), keyed like PLAIN_ACTION. */
// R4-fix (review SL4-1): the body sits (round 4): knees bent about 45 deg, the right elbow bent about 85 deg on the
// armrest, the right palm mostly down. These notes said the round-3 standing pose "starts out straight".
// R558 (notes of 11 November 2026, "start with the limbs fully straight out", then "out straight forward" and "like a
// stick"): the body sits on an invisible ground with every limb straight forward (ns-body BODY_POSTURES.open), so the
// knees and the right elbow start straight and the right palm faces down.
const PLAIN_NOTE = {
  // Docs check: from the long-sitting start the heel stays on the ground and the thigh lift is capped (ns-body
  // groundLegAngles), so the drawn knee bends only part of the way while the latch holds the full goal.
  knee_flex: () => 'Your heel stays on the ground and your thigh lifts only so far, so from the start the knee bends only ' +
    'part of the way.',
  knee_extend: () => 'Your knee starts straight, so at first this shows the front thigh muscles (quadriceps) without moving ' +
    'your leg. After you bend the knee, it straightens the knee again. Muscle force without movement is not modelled (isometric force).',
  r_elbow_extend: () => 'Your right elbow starts straight, so at first this shows the muscle at the back of the arm (triceps) ' +
    'without moving the elbow. After you bend the elbow, it straightens the elbow again.',
  pronation: () => 'The three forearm-turning muscles (pronator teres, pronator quadratus and supinator) are not in the ' +
    'game’s movement map (no catalog key in MOVEMENT-MAP r2; ns-assets maps them to null). While the forearm turns, the ' +
    'game colours these three 3D muscles by name, in the same colours (simulated display level; meshes). They are not ' +
    'movement-map muscles.',
  supination: () => 'The biceps turns the palm up strongly, mainly when the elbow is bent (biceps brachii is a powerful ' +
    'supinator mainly when the elbow is flexed; UAMS).',
  r_supinate: () => 'Your right arm starts straight forward with the palm down, so this turns the palm up. Turning the palm down ' +
    'brings it back.',
  ankle_invert: () => 'One turning line through the ankle stands in for the joints below it (subtalar and midtarsal).',
  ankle_evert: () => 'One turning line through the ankle stands in for the joints below it (subtalar and midtarsal).',
  hip_flex: () => 'With the knee straight, the muscles at the back of the thigh stop the hip at about 100 degrees (hamstrings), ' +
    'only 10 above the ground. Bend the knee first and the thigh lifts on to 110 degrees, where the stiff 3D thigh and belly ' +
    'shapes would start to pass into each other (rigid meshes; about 120 with a bent knee in real life).',
  hip_adduct: () => 'It stops with your legs side by side (the source pose, knees nearly touching). Going the full 30 degrees ' +
    '(adduction) would push one leg into the other.',
  trunk_side: () => 'This is a game choice, as for the neck: each half of the brain bends the trunk toward the other side (each ' +
    'hemisphere, opposite body side). The trunk muscles get signals from both halves.',
  trunk_turn: () => 'This is a game choice, as for the neck: each half of the brain turns the trunk toward the other side. Your ' +
    'hips and legs stay on the ground; your chest, arms and head turn, so your view turns too.',
  neck_side: () => 'This is a game choice, as for turning: each half of the brain tilts the head toward the other side (each ' +
    'hemisphere, opposite side). Which half really drives it is not known (unresolved).',
  eye_open: () => 'The muscle that lifts the eyelid lights up (levator palpebrae superioris lights; it lies inside the eye socket, ' +
    'behind the eyelid muscles). It gets its signals through a different nerve (the oculomotor nerve, a separate pathway), ' +
    'and the eyelids themselves are not modelled.',
  jaw_shift_right: () => JAW_SHIFT_PLAIN,
  jaw_shift_left: () => JAW_SHIFT_PLAIN,
  throat_relax: () => 'The strap muscles below the throat bone light up (sternohyoid, omohyoid, sternothyroid), and the throat bone ' +
    '(hyoid) moves back to rest.',
  wrist_radial_deviation: () => LEFT_WRIST_SIDE_PLAIN,
  wrist_ulnar_deviation: () => LEFT_WRIST_SIDE_PLAIN,
  grasp_close: () => 'When the hand makes a fist, the game lowers the displayed activity of the muscles that straighten the fingers. ' +
    'Real hard grips can activate these muscles too (Motawar 2012).',
  relax_release: () => 'Letting go lowers the signal to the muscles that bend and straighten the fingers (flexor and ' +
    'extensor drive). It is not an active straightening, and the brain does not go quiet (not active extension and not ' +
    'cortical silence; Motawar 2012).',
  open_hand: () => 'Opening the hand when it lets go is a game rule (game convention). A real hand can let go ' +
    'without any effort (natural release can be passive).',
  neck_turn_left: () => NECK_CHOICE_PLAIN,
  neck_turn_right: () => NECK_CHOICE_PLAIN,
  eye_close: () => 'The muscle that lifts the eyelid (levator palpebrae superioris) gets its signals through a different ' +
    'nerve (the oculomotor nerve, a separate pathway).',
  smile: c => (c.face
    ? 'These muscles come from an extra set of 3D face muscles (the face-muscle packet, face-muscles-r1). The smile is ' +
      `only a made-up level (a simulated display level), shown as colour on the ${c.S} cheek muscles. The face shape does ` +
      `not move. The ${c.S} side gets most of the signal from this half (this hemisphere’s drive).`
    : 'The 3D body has no shape for these muscles (BodyParts3D 4.0 has no mesh for them). The smile is only a ' +
      `made-up level (a simulated display level), and nothing moves or is coloured. The ${c.S} side would get most of the ` +
      'signal from this half (this hemisphere’s drive).'),
  jaw_clench: c => (c.face
    ? 'The jaw-closing muscles come from an extra set of 3D face muscles (masseter, temporalis and the medial pterygoid; ' +
      'the face-muscle packet, face-muscles-r1). They are coloured with the made-up level (simulated display level). The ' +
      'jaw is closed at rest, so clenching shows no movement then. After the jaw has opened, clenching closes it again. Bite force is not modelled.'
    : 'The clenching muscles have no 3D shape (masseter, temporalis and the medial pterygoid have no ' +
      'BodyParts3D 4.0 mesh). So clenching shows no colour. The jaw is closed at rest, so clenching shows no movement then. After the jaw has opened, clenching closes it again. Bite ' +
      'force is not modelled.'),
};

// ---------------------------------------------------------------------------------------------
// Build

function buildRegions({ faceLoaded = false } = {}) {
  const out = [];
  for (const [hemisphere, seq] of [['right', RIGHT_HEMI_SEQUENCE], ['left', LEFT_HEMI_SEQUENCE]]) {
    // R5-text: c.face = the face-muscle packet is in the build (FACE_PACKET); it only changes the face regions' text.
    const c = { ...ctxFor(hemisphere), face: faceLoaded === true };
    seq.forEach((key, order) => {
      const body = CONTENT[key](c);
      const { core, extent, centre } = LAYOUT[hemisphere][key];
      const actions = body.actions.map((a, i) => {
        // R558: every action (left arm included) owns an equal share of its region's CORE, in list order, and uCentre
        // is the middle of that share; nearest-uCentre picking (actionAtU) and ns-brain regionActionAt's equal split of
        // the core therefore agree, and every action is reachable (the old equal split of the wider EXTENT left the
        // first and last of three or more actions almost or entirely outside the core, e.g. "Raise right arm up").
        const uCentre = Number((core[0] + ((i + 0.5) / body.actions.length) * (core[1] - core[0])).toFixed(5));
        const full = {
          id: a.id, label: a.label, armActionId: a.armActionId || null, joints: { ...a.joints },
          agonists: [...a.agonists], antagonists: [...a.antagonists], uCentre
        };
        if (a.stabilizers && a.stabilizers.length) full.stabilizers = [...a.stabilizers];
        if (a.catalogRoles) full.catalogRoles = a.catalogRoles;
        if (a.lateralBias) full.lateralBias = a.lateralBias;
        if (a.note) full.note = a.note;
        const plainA = PLAIN_ACTION[plainActionKey(a.id)];
        if (!plainA) throw new Error(`ns:bodymap_plain: no plain text for action ${a.id}`);
        const pa = plainA(c);
        full.plainLabel = pa.plainLabel;
        full.plainMuscles = { pull: pa.pull, relax: pa.relax };
        if (a.note) {
          const pn = PLAIN_NOTE[plainActionKey(a.id)];
          if (!pn) throw new Error(`ns:bodymap_plain: no plain note for action ${a.id}`);
          full.plainNote = pn(c);
        }
        return full;
      });
      const region = {
        id: `${c.code}_${key.replace(/^r_/, '')}`,
        label: body.label,
        hemisphere,
        bodySide: body.bodySide,
        effector: body.effector,
        order,
        extent: [...extent],
        medialSurface: !!body.medialSurface,
        isLeftArm: !!body.isLeftArm,
        actions,
        explanation: body.explanation,
        citationKeys: [...body.citationKeys],
        kind: body.kind || 'effector',
        core: [...core],
        centre,
        shortLabel: body.shortLabel,
        displayGroup: body.displayGroup,
        pathway: body.pathway,
        laterality: body.laterality
      };
      if (body.noActionReason) region.noActionReason = body.noActionReason;
      if (REGION_CAVEATS[key]) region.caveat = REGION_CAVEATS[key](c);
      if (!PLAIN_REGION[key]) throw new Error(`ns:bodymap_plain: no plain text for region ${key}`);
      const pr = PLAIN_REGION[key](c);
      region.plainLabel = pr.plainLabel;
      region.plainLead = pr.plainLead;
      region.plainMoves = pr.plainMoves;
      region.plainCaveat = pr.plainCaveat;
      if (!PLAIN_DETAIL[key]) throw new Error(`ns:bodymap_plain: no plain detail for region ${key}`);
      const pd = PLAIN_DETAIL[key](c);
      region.plainDetail = pd.detail;
      if (body.noActionReason) {
        if (!pd.noAction) throw new Error(`ns:bodymap_plain: no plain noAction text for region ${key}`);
        region.plainNoAction = pd.noAction;
      }
      out.push(region);
    });
  }
  return out;
}

/**
 * Build the whole-body motor map (deep-frozen). faceLoaded (R5-text): true = the face-muscle packet is in the build, so
 * the face regions say their muscles light up and cite ZANATOMY; false = the face-unloaded text variant. Both variants
 * keep the unfinished tongue regions without motor actions. BODY_MOTOR_MAP is built with FACE_MUSCLES_LOADED; the
 * helpers below (regionById, ...) index that default map.
 */
export function buildBodyMotorMap({ faceLoaded = false } = {}) {
  return deepFreeze({
  version: 'ns-bodymap-r1 (S1-bodymap, 2026-11-08)',
  caveats: CAVEATS,
  caveatCitationKeys: ['PENFIELD1937', 'CATANI2017', 'GORDON2023', 'DEO2026', 'WILLETT2020', 'RADEMACHER2001', 'LEMON2008', 'BAWA2004', 'MORECRAFT2001', 'BODYPARTS3D'],
  citations: faceLoaded === true ? [...CITATIONS, ZANATOMY_CITATION] : CITATIONS,
  conventions: {
    u: "Along-the-gyrus coordinate of each precentral mesh (ns-brain.alongGyrusCoordinate: harmonic field, 0 on the medial wall, 1 at the ventral tip next to the Sylvian fissure); on the medial wall regions follow medial depth. Geometric, not registered.",
    order: '0 = most medial/dorsal region of that hemisphere, increasing along the gyrus toward the Sylvian fissure; equals the index in the hemisphere sequence.',
    centre: 'Representative region position (u). Equals the extent midpoint.',
    core: 'Nearest-centre cell: a non-overlapping control partition per hemisphere tiling [0, 1]; use it for gaze picking and region borders. It equals the ns-brain regionOwnerAt rule (nearest extent centre among containing extents).',
    extent: 'Overlapping display field, symmetric about the centre and covering the whole core plus an overlap margin; use it for soft activity spread. Overlap is intentional.',
    joints: 'Degrees from the BodyParts3D source pose (anatomical position); see JOINT_SEMANTICS. Left-arm actions have joints {} and use armActionId.',
    laterality: 'right hemisphere -> left body side; left hemisphere -> right body side; bodySide midline marks bilateral/axial effectors.',
    surface: 'The visible crown is largely BA6 (premotor); BA4 lies mostly in the anterior bank of the central sulcus and is not shown separately.',
    simplifications: 'One region per effector on a 1-D strip: the ventral repeats of the concentric hand zone (wrist/elbow/shoulder below the hand) are not drawn; the supplementary motor area and the larynx are not represented; swallowing has its own area (throat) after the tongue.'
  },
  regions: buildRegions({ faceLoaded })
  });
}

/** The whole-body motor map (agreed schema; deep-frozen). */
export const BODY_MOTOR_MAP = buildBodyMotorMap({ faceLoaded: FACE_MUSCLES_LOADED });

/** Representative control position u of each left-arm action (R558: derived from the map, the middle of the action's
 * equal share of its region core; it used to be a fixed table of the ns-brain MARKERS u). */
export const LEFT_ARM_ACTION_U = Object.freeze(Object.fromEntries(BODY_MOTOR_MAP.regions
  .filter(r => r.isLeftArm).flatMap(r => r.actions.filter(a => a.armActionId).map(a => [a.armActionId, a.uCentre]))));

// ---------------------------------------------------------------------------------------------
// Pure helpers

const REGION_INDEX = new Map(BODY_MOTOR_MAP.regions.map(r => [r.id, r]));
const ACTION_INDEX = new Map();
for (const r of BODY_MOTOR_MAP.regions) for (const a of r.actions) ACTION_INDEX.set(a.id, { region: r, action: a });
const ARM_REGION_INDEX = new Map();
for (const r of BODY_MOTOR_MAP.regions) for (const a of r.actions) if (a.armActionId) ARM_REGION_INDEX.set(a.armActionId, r);

/** Region by id, or null. */
export function regionById(id) { return REGION_INDEX.get(id) || null; }

/** { region, action } for an action id (left-arm action ids equal their armActionId), or null. */
export function actionById(id) { return ACTION_INDEX.get(id) || null; }

/** The region that holds an existing left-arm action id (to light the brain when Space/WASD/gaze drive it), or null. */
export function regionForArmAction(armActionId) { return ARM_REGION_INDEX.get(armActionId) || null; }

/** Frozen regions of one hemisphere ('right' | 'left') in strip order (medial wall first, Sylvian end last). */
const BY_HEMI = {
  right: Object.freeze(BODY_MOTOR_MAP.regions.filter(r => r.hemisphere === 'right').sort((a, b) => a.order - b.order)),
  left: Object.freeze(BODY_MOTOR_MAP.regions.filter(r => r.hemisphere === 'left').sort((a, b) => a.order - b.order))
};
export function regionsForHemisphere(hemisphere) {
  const r = BY_HEMI[hemisphere];
  if (!r) throw new Error("ns:bodymap_hemisphere: hemisphere must be 'right' or 'left'");
  return r;
}

/** The region whose CORE contains strip coordinate u in that hemisphere (u clamped to [0, 1]; u = 1 belongs to the
 * last region), or null for a non-finite u. */
export function regionAtU(hemisphere, u) {
  if (!Number.isFinite(u)) return null;
  const list = regionsForHemisphere(hemisphere);
  const x = Math.min(1, Math.max(0, u));
  for (const r of list) if (x >= r.core[0] && x < r.core[1]) return r;
  return list[list.length - 1];
}

/** The action of `region` whose uCentre is nearest u (ties go to the earlier action), or null when the region has no
 * actions (inter-effector regions, the left shoulder and the unfinished tongue regions). */
export function actionAtU(region, u) {
  if (!region || !region.actions.length || !Number.isFinite(u)) return null;
  let best = region.actions[0], bd = Math.abs(u - best.uCentre);
  for (const a of region.actions) {
    const d = Math.abs(u - a.uCentre);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/** Soft display weight 0..1 of a region at u: 1 inside its core, a cosine fall-off to 0 at the extent edges, 0 outside
 * the extent. Overlapping regions therefore share the boundary zones (display only). */
export function regionFieldWeight(region, u) {
  if (!region || !Number.isFinite(u)) return 0;
  const [e0, e1] = region.extent, [c0, c1] = region.core;
  if (u < e0 || u > e1) return 0;
  if (u >= c0 && u <= c1) return 1;
  const t = u < c0 ? (u - e0) / Math.max(1e-9, c0 - e0) : (e1 - u) / Math.max(1e-9, e1 - c1);
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
}

/**
 * Compose non-arm joint targets from active actions: entries [{ actionId, level (0..1) }] -> { jointId: deg }.
 * Per joint the entry with the largest |level x target| wins (ties: the earlier entry), so two hemispheres driving the
 * same axial joint do not double it and an agonist/antagonist pair does not silently cancel. Left-arm actions
 * (armActionId) contribute nothing here: the arm rig owns them. Unknown ids are ignored. Display/game targets only.
 */
export function composeBodyJointTargets(entries = []) {
  const best = {};
  for (const e of entries) {
    const hit = e && ACTION_INDEX.get(e.actionId);
    if (!hit || hit.action.armActionId) continue;
    const level = Math.min(1, Math.max(0, Number(e.level) || 0));
    if (!(level > 0)) continue;
    for (const [j, deg] of Object.entries(hit.action.joints)) {
      const v = level * deg;
      if (!(j in best) || Math.abs(v) > Math.abs(best[j].v)) best[j] = { v };
    }
  }
  const out = {};
  for (const [j, { v }] of Object.entries(best)) out[j] = v;
  return out;
}

/**
 * Simulated muscle display drives by muscle NAME from active actions: entries [{ actionId, level }] ->
 * { name: 0..1 }. Agonists take `level`; stabilisers take level x stabilizerGain; antagonists take level x
 * antagonistGain (a low display floor, not inhibition data). Per name the maximum wins. ns-body maps names to mesh ids
 * with muscleNameMatches. Unitless display values, not EMG or force.
 */
export function namedMuscleDrives(entries = [], { antagonistGain = 0.08, stabilizerGain = 0.3 } = {}) {
  const out = {};
  const put = (n, v) => { if (v > 0 && (!(n in out) || v > out[n])) out[n] = v; };
  for (const e of entries) {
    const hit = e && ACTION_INDEX.get(e.actionId);
    if (!hit) continue;
    const level = Math.min(1, Math.max(0, Number(e.level) || 0));
    for (const n of hit.action.agonists) put(n, level);
    for (const n of hit.action.stabilizers || []) put(n, level * stabilizerGain);
    for (const n of hit.action.antagonists) put(n, level * antagonistGain);
  }
  return out;
}

// Muscle-name matching against BodyParts3D concept names ("long head of left biceps brachii", "set of dorsal
// interossei of left hand", "left infraspinatus muscle").
const SIDE_WORDS = new Set(['left', 'right']);
const PART_WORDS = new Set([
  'of', 'the', 'part', 'head', 'belly', 'set', 'muscle', 'muscles', 'portion', 'fibers', 'fibres',
  'long', 'short', 'lateral', 'medial', 'superficial', 'deep', 'oblique', 'transverse', 'horizontal', 'vertical',
  'clavicular', 'acromial', 'spinal', 'sternal', 'sternocostal', 'abdominal', 'costal', 'humeral', 'ulnar', 'radial', 'alar',
  'humeroulnar', 'frontal', 'occipital', 'orbital', 'palpebral', 'lacrimal', 'hand', 'foot',
  'superior', 'inferior', 'anterior', 'posterior', 'upper', 'lower', 'middle', 'ascending', 'descending'
]);

/** Lower-case word tokens of a muscle/concept name (punctuation removed). */
export function normalizeMuscleName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * True when a mesh concept name and a map muscle name denote the same muscle or one is a named part of the other:
 * their word sets are equal, or one contains the other and every extra word is a part word ("long head of", "set of",
 * "acromial part of", "muscle", ...). A side word (left/right) may be extra only when the smaller name has no side, so
 * "orbicularis oris" matches both halves while "left deltoid" never matches "right deltoid". Distinct muscles such
 * as "left extensor digitorum" and "left extensor digitorum longus" do not match.
 */
export function muscleNameMatches(conceptName, muscleName) {
  const a = new Set(normalizeMuscleName(conceptName)), b = new Set(normalizeMuscleName(muscleName));
  if (!a.size || !b.size) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const w of small) if (!big.has(w)) return false;
  const smallHasSide = [...small].some(w => SIDE_WORDS.has(w));
  for (const w of big) {
    if (small.has(w)) continue;
    if (SIDE_WORDS.has(w) && !smallHasSide) continue;
    if (!PART_WORDS.has(w)) return false;
  }
  return true;
}

/** Schema and consistency problems of a map (empty array = valid). Used by the unit tests; cheap enough to run at
 * start-up as a guard. */
export function validateBodyMotorMap(map = BODY_MOTOR_MAP) {
  const p = [];
  const fail = m => p.push(m);
  if (!map || typeof map !== 'object') return ['map is not an object'];
  if (typeof map.version !== 'string' || !map.version) fail('version missing');
  if (!Array.isArray(map.caveats) || !map.caveats.length) fail('caveats missing');
  const citeKeys = new Set();
  for (const c of map.citations || []) {
    if (!c || typeof c.key !== 'string' || !c.key) { fail('citation without key'); continue; }
    if (citeKeys.has(c.key)) fail(`duplicate citation key ${c.key}`);
    citeKeys.add(c.key);
    if (typeof c.doi_or_url !== 'string' || !(/^10\.\d{4,9}\/\S+$/.test(c.doi_or_url) || /^https:\/\/\S+$/.test(c.doi_or_url))) fail(`citation ${c.key}: doi_or_url must be a DOI or https URL`);
    if (typeof c.verified !== 'boolean') fail(`citation ${c.key}: verified must be boolean`);
  }
  const jointSet = new Set(BODY_JOINT_IDS), armSet = new Set(LEFT_ARM_ACTION_IDS);
  const ids = new Set(), actionIds = new Set();
  const seenArm = new Map();
  for (const r of map.regions || []) {
    const where = `region ${r && r.id}`;
    if (!r || typeof r.id !== 'string' || !r.id) { fail('region without id'); continue; }
    if (ids.has(r.id)) fail(`duplicate region id ${r.id}`);
    ids.add(r.id);
    for (const k of ['label', 'effector', 'explanation']) if (typeof r[k] !== 'string' || !r[k].trim()) fail(`${where}: ${k} missing`);
    if (!['right', 'left', 'both'].includes(r.hemisphere)) fail(`${where}: bad hemisphere`);
    if (!['left', 'right', 'midline'].includes(r.bodySide)) fail(`${where}: bad bodySide`);
    if (r.hemisphere === 'right' && r.bodySide === 'right') fail(`${where}: right hemisphere cannot map the right body side`);
    if (r.hemisphere === 'left' && r.bodySide === 'left') fail(`${where}: left hemisphere cannot map the left body side`);
    if (!Number.isInteger(r.order) || r.order < 0) fail(`${where}: order must be a non-negative integer`);
    const ex = r.extent;
    if (!Array.isArray(ex) || ex.length !== 2 || !(ex[0] >= 0 && ex[1] <= 1 && ex[0] < ex[1])) fail(`${where}: extent must be [u0, u1] inside 0..1 with u0 < u1`);
    if (r.core) {
      const co = r.core;
      if (!(co[0] >= 0 && co[1] <= 1 && co[0] < co[1])) fail(`${where}: bad core`);
      if (ex && !(ex[0] <= co[0] && co[1] <= ex[1])) fail(`${where}: core must lie inside extent`);
    }
    if (typeof r.medialSurface !== 'boolean' || typeof r.isLeftArm !== 'boolean') fail(`${where}: medialSurface/isLeftArm must be boolean`);
    if (r.isLeftArm && !(r.hemisphere === 'right' && r.bodySide === 'left')) fail(`${where}: left-arm regions must be right hemisphere, left body side`);
    if (!Array.isArray(r.actions)) { fail(`${where}: actions must be an array`); continue; }
    if (!Array.isArray(r.citationKeys) || !r.citationKeys.length) fail(`${where}: citationKeys missing`);
    for (const k of r.citationKeys || []) if (!citeKeys.has(k)) fail(`${where}: unknown citation key ${k}`);
    if (!r.actions.length && r.kind !== 'integration' && !r.noActionReason) fail(`${where}: no actions and no noActionReason`);
    for (const a of r.actions) {
      const aw = `${where} action ${a && a.id}`;
      if (!a || typeof a.id !== 'string' || !a.id) { fail(`${where}: action without id`); continue; }
      if (actionIds.has(a.id)) fail(`duplicate action id ${a.id}`);
      actionIds.add(a.id);
      if (typeof a.label !== 'string' || !a.label) fail(`${aw}: label missing`);
      if (r.isLeftArm) {
        if (!armSet.has(a.armActionId)) fail(`${aw}: armActionId ${a.armActionId} is not an existing left-arm action id`);
        if (seenArm.has(a.armActionId)) fail(`${aw}: armActionId ${a.armActionId} used twice`);
        seenArm.set(a.armActionId, r.id);
      } else if (a.armActionId !== null) fail(`${aw}: non-left-arm actions must have armActionId null`);
      if (!a.joints || typeof a.joints !== 'object' || Array.isArray(a.joints)) fail(`${aw}: joints must be an object`);
      for (const [j, deg] of Object.entries(a.joints || {})) {
        if (!jointSet.has(j)) fail(`${aw}: joint ${j} is not an agreed joint id`);
        else {
          const [lo, hi] = JOINT_SEMANTICS[j].suggestedRange;
          if (!Number.isFinite(deg) || deg < lo || deg > hi) fail(`${aw}: ${j} = ${deg} outside ${lo}..${hi}`);
        }
      }
      if (!r.isLeftArm && !Object.keys(a.joints || {}).length) fail(`${aw}: non-arm actions need at least one joint target`);
      if (r.isLeftArm && Object.keys(a.joints || {}).length) fail(`${aw}: left-arm actions leave joints to the arm rig`);
      for (const k of ['agonists', 'antagonists']) {
        if (!Array.isArray(a[k]) || a[k].some(n => typeof n !== 'string' || !n.trim())) fail(`${aw}: ${k} must be muscle-name strings`);
      }
      if (!a.agonists || !a.agonists.length) {
        if (a.armActionId !== 'relax_release') fail(`${aw}: agonists empty`);
      }
      if (a.uCentre !== undefined && r.core && !(a.uCentre >= r.core[0] && a.uCentre <= r.core[1])) fail(`${aw}: uCentre outside the region core`);
    }
  }
  return p;
}
