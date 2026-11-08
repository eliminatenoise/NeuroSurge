// NeuroSurge whole-body motor map (S1-bodymap, round 2, 2026-11-08).
//
// A pure data module, importable in Node without a DOM. It exports BODY_MOTOR_MAP in the agreed schema plus small pure
// helpers (region/action lookup by strip position, joint-target composition, muscle-name matching and a validator).
//
// What it is: a REPRESENTATIVE, one-dimensional, medial-to-lateral schematic of BOTH precentral gyri, for an
// educational game. Every value the game shows from it is a simulated, unitless display drive. Gaze, clicks and keys are
// virtual inputs, not stimulation or decoding. Nothing here is measured neural activity, EMG, force or a nerve
// recording. Region borders are game control borders, not anatomical borders, and no region is a unique cortical point
// for a muscle. NeuroTranslate 0.0 is the companion/model name and is NOT a validated decoder.
//
// Strip coordinate u: the same u ns-brain.stripParam computes for each hemisphere's precentral mesh (FJ1801 right,
// FJ1800 left): u = (|x| - min|x|) / (max|x| - min|x|), 0 = most medial (the mesh's medial-wall portion near the
// midline), 1 = most lateral (ventral end near the Sylvian fissure). It is a geometric fraction of the mesh, not a
// registration to any brain.
//
// Region fields (agreed schema): id, label, hemisphere ('right' | 'left'), bodySide ('left' | 'right' | 'midline'),
// effector, order (0 = most medial/dorsal, increasing laterally), extent [u0, u1] (overlapping display field), medialSurface,
// isLeftArm, actions [{ id, label, armActionId, joints, agonists, antagonists }], explanation, citationKeys.
// Extra fields (additive; consumers may ignore them): kind ('effector' | 'integration'), centre (extent midpoint), core
// [c0, c1] (nearest-centre cell: a non-overlapping control partition that tiles [0, 1] per hemisphere; use it for gaze
// picking and region tint borders), shortLabel, displayGroup, pathway, laterality, noActionReason, caveat (one short
// plain-language hedge restating the explanation's own qualifier, shown by the info overlay), and per action:
// uCentre (representative control position used to pick an action inside a region; left-arm values equal the existing
// ns-brain MARKERS u), stabilizers, catalogRoles (existing MOVEMENT-MAP catalog keys, left arm only), lateralBias, note.
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
  'hip_flex_L', 'hip_flex_R', 'knee_ext_L', 'knee_ext_R', 'ankle_dorsi_L', 'ankle_dorsi_R', 'toe_flex_L', 'toe_flex_R',
  'trunk_flex', 'neck_flex', 'neck_rot', 'jaw_open', 'brow_raise', 'eye_close', 'lip_purse', 'smile',
  'r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex', 'r_wrist_flex', 'r_wrist_ext', 'r_grasp', 'r_open', 'r_pronation'
]);

/** Existing left-arm action ids (ns-actions ACTION_IDS, in map order) plus forearm rotation. */
export const LEFT_ARM_ACTION_IDS = Object.freeze([
  'grasp_close', 'relax_release', 'open_hand', 'spread_fingers',
  'wrist_flexion', 'wrist_extension', 'elbow_flexion', 'elbow_extension',
  'index_flexion', 'index_extension', 'thumb_mcp_flexion', 'thumb_mcp_extension',
  'pronation', 'supination'
]);

const sem = (positive, negative, lo, hi, side, unit = 'deg') => ({ unit, positive, negative, suggestedRange: [lo, hi], side });

/**
 * The joint-value convention this map assumes (for ns-body / ns-actions to reconcile with BODY_JOINT_LIMITS).
 * Every value is a signed angle in degrees from the BodyParts3D SOURCE POSE, which is the standard anatomical position
 * (standing upright, arms at the sides, palms facing forward). Positive = the direction the id names. A target of 0
 * returns the joint to the source pose. The four facial ids are not joint rotations: their values are nominal display
 * degrees, 0 (rest) .. 20 (full display amplitude), and ns-body should normalise them by that range.
 * suggestedRange is a game-safe range inside normal adult range of motion; the rig's own limits take precedence.
 */
export const JOINT_SEMANTICS = deepFreeze({
  hip_flex_L: sem('hip flexion (thigh forward and up)', 'hip extension (thigh back)', -20, 100, 'left'),
  hip_flex_R: sem('hip flexion (thigh forward and up)', 'hip extension (thigh back)', -20, 100, 'right'),
  knee_ext_L: sem('knee extension (0 = straight, the source pose)', 'knee flexion', -130, 0, 'left'),
  knee_ext_R: sem('knee extension (0 = straight, the source pose)', 'knee flexion', -130, 0, 'right'),
  ankle_dorsi_L: sem('ankle dorsiflexion (toes up)', 'plantarflexion (toes down)', -45, 20, 'left'),
  ankle_dorsi_R: sem('ankle dorsiflexion (toes up)', 'plantarflexion (toes down)', -45, 20, 'right'),
  toe_flex_L: sem('toe flexion (curl)', 'toe extension (lift)', -40, 40, 'left'),
  toe_flex_R: sem('toe flexion (curl)', 'toe extension (lift)', -40, 40, 'right'),
  trunk_flex: sem('trunk flexion (bend forward)', 'trunk extension (lean back)', -20, 45, 'midline'),
  neck_flex: sem('neck flexion (chin down)', 'neck extension (chin up)', -30, 40, 'midline'),
  neck_rot: sem("rotation of the face toward the subject's LEFT", "rotation toward the subject's RIGHT", -60, 60, 'midline'),
  jaw_open: sem('mandible depression (mouth opens)', 'none (0 = closed, the source pose)', 0, 30, 'midline'),
  brow_raise: sem('brow raise display amplitude', 'none', 0, 20, 'midline', 'display_deg'),
  eye_close: sem('eyelid closure display amplitude', 'none', 0, 20, 'midline', 'display_deg'),
  lip_purse: sem('lip pursing display amplitude', 'none', 0, 20, 'midline', 'display_deg'),
  smile: sem('mouth-corner lift display amplitude', 'none', 0, 20, 'midline', 'display_deg'),
  r_shoulder_flex: sem('right shoulder flexion (arm forward)', 'right shoulder extension (arm back)', -40, 150, 'right'),
  r_shoulder_abd: sem('right shoulder abduction (arm out to the side)', 'adduction past the source pose', 0, 150, 'right'),
  r_elbow_flex: sem('right elbow flexion', 'none (0 = straight, the source pose)', 0, 140, 'right'),
  r_wrist_flex: sem('right wrist flexion (palmar)', 'none', 0, 70, 'right'),
  r_wrist_ext: sem('right wrist extension (dorsal)', 'none', 0, 60, 'right'),
  r_grasp: sem('right finger and thumb closure toward a fist (degrees of digit flexion)', 'none', 0, 90, 'right'),
  r_open: sem('right finger and thumb opening beyond the source pose (degrees of digit extension)', 'none', 0, 30, 'right'),
  r_pronation: sem('right forearm pronation from the palm-forward source pose (palm turns back/down)', 'none (0 = supinated, the source pose)', 0, 150, 'right')
});

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
    'Tongue: bilateral corticobulbar control with a contralateral advantage.'),
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

// ---------------------------------------------------------------------------------------------
// Global caveats (shown with the info overlay / Esc page)

const CAVEATS = [
  'All activity in NeuroSurge is simulated and unitless. Gaze, clicks and keys are virtual inputs; nothing here is measured brain activity, stimulation, decoding, EMG, nerve activity or force.',
  "This is a representative, one-dimensional medial-to-lateral schematic of each precentral gyrus (u = fraction of the mesh's medial-lateral span). It is not registered to any person's brain; real body-part representations overlap and vary between people and between hemispheres.",
  "Penfield's homunculus is a summary drawing of stimulation data whose original maps overlap a great deal (Penfield and Boldrey 1937; Catani 2017). Contemporary maps refine it: effector zones are concentric, and three inter-effector regions (the somato-cognitive action network, SCAN) interrupt the foot, hand and mouth zones (Gordon 2023).",
  'Single-neuron recordings on the precentral crown find the whole body represented, intermixed, at every sampled site (Deo 2026; Willett 2020). No region here is a unique cortical point for a muscle, and region borders are game control borders.',
  'The exposed crown of the precentral gyrus is thought to be largely premotor cortex (BA6); primary motor cortex (BA4) lies mostly in the anterior bank of the central sulcus, which the game cannot show. Coloured regions are therefore labelled motor territory, not BA4.',
  'Limb muscles are driven predominantly by the opposite (contralateral) hemisphere through the corticospinal tract; the LEFT arm is driven predominantly by the RIGHT hemisphere. Axial (trunk, neck), upper-face, jaw and tongue muscles receive substantial input from both hemispheres through corticospinal and corticobulbar pathways.',
  'Muscle lists are qualitative anatomical roles (agonist, antagonist, stabiliser) from anatomy tables, not fitted physiology. Activation does not always mean shortening, and muscle colour shows the simulated drive, not EMG or force.',
  'NeuroTranslate 0.0 is the companion/model name and is not a validated decoder; no trained translation model runs in this map.'
];

// ---------------------------------------------------------------------------------------------
// Strip layout per hemisphere (medial -> lateral).
//
// Each region has a representative CENTRE u. Its core is the set of strip points nearer to its centre than to any other
// centre of that hemisphere (cores therefore tile [0, 1] with borders at the midpoints between neighbouring centres), and
// its extent is the overlapping display field: symmetric about the centre, covering the whole core plus `overlap` on
// each side (clipped symmetrically at 0 and 1). This makes the two picking rules in use agree exactly: "the region whose
// core contains u" (regionAtU here) and "the nearest extent centre among the extents that contain u" (ns-brain
// regionOwnerAt). The centres keep every existing ns-brain MARKERS u inside the core of its own action's region.

const S = (key, centre, overlap = 0.03) => ({ key, centre, overlap });
const STRIP_RIGHT = [
  S('toes', 0.033), S('ankle', 0.07), S('knee', 0.115), S('hip', 0.155), S('scan_superior', 0.195), S('trunk', 0.235),
  S('shoulder', 0.2825, 0.04), S('elbow', 0.374, 0.04), S('forearm', 0.412, 0.04), S('wrist', 0.45, 0.04),
  S('hand', 0.58, 0.04), S('index', 0.68, 0.03), S('thumb', 0.725, 0.03), S('neck', 0.7675),
  S('scan_middle', 0.8025), S('brow', 0.835, 0.02), S('eyelid', 0.8625, 0.02), S('lower_face', 0.89, 0.02),
  S('lips', 0.92, 0.02), S('jaw', 0.9475, 0.02), S('tongue', 0.9725, 0.02), S('scan_inferior', 0.984, 0.01)
];
// Left hemisphere: the same layout; its hand, finger and thumb regions drive the right hand's whole-hand rig.
const STRIP_LEFT = STRIP_RIGHT.map(x => (x.key === 'hand' ? S('r_hand', x.centre, x.overlap)
  : x.key === 'index' ? S('r_fingers', x.centre, x.overlap) : x.key === 'thumb' ? S('r_thumb', x.centre, x.overlap) : x));

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

/** Existing representative marker u of each left-arm action (ns-brain MARKERS at baseline e345f14), plus the new
 * forearm-rotation control positions. Kept so current left-arm gaze behaviour stays where players already find it. */
export const LEFT_ARM_ACTION_U = Object.freeze({
  grasp_close: 0.53, relax_release: 0.56, open_hand: 0.59, spread_fingers: 0.62,
  wrist_flexion: 0.44, wrist_extension: 0.48, elbow_flexion: 0.34, elbow_extension: 0.38,
  index_flexion: 0.65, index_extension: 0.67, thumb_mcp_flexion: 0.71, thumb_mcp_extension: 0.73,
  pronation: 0.408, supination: 0.422
});

// ---------------------------------------------------------------------------------------------
// Region content builders. ctx: hemisphere (H), the body side it mainly controls (S) and its code (rh / lh).

function ctxFor(hemisphere) {
  return hemisphere === 'right'
    ? { H: 'right', S: 'left', So: 'right', Sc: 'Left', code: 'rh', J: 'L' }
    : { H: 'left', S: 'right', So: 'left', Sc: 'Right', code: 'lh', J: 'R' };
}
const both = n => [`left ${n}`, `right ${n}`];
const sided = (side, ...names) => names.map(n => `${side} ${n}`);

const LEG_PATHWAY = c => `Its corticospinal fibres cross in the medulla and reach the lumbosacral motor neurons of the ${c.S} leg.`;

const CONTENT = {
  toes: c => ({
    label: `${c.Sc} toes`, shortLabel: `${c.Sc[0]} toes`, effector: `toes (${c.S} foot)`, bodySide: c.S, medialSurface: true,
    displayGroup: `${c.S}_leg`, pathway: 'corticospinal', laterality: 'contralateral',
    actions: [
      { id: `${c.code}_toes_curl`, label: `Curl ${c.S} toes`, joints: { [`toe_flex_${c.J}`]: 30 },
        agonists: sided(c.S, 'flexor digitorum longus', 'flexor hallucis longus', 'flexor digitorum brevis'),
        antagonists: sided(c.S, 'extensor digitorum longus', 'extensor hallucis longus') },
      { id: `${c.code}_toes_lift`, label: `Lift ${c.S} toes`, joints: { [`toe_flex_${c.J}`]: -25 },
        agonists: sided(c.S, 'extensor digitorum longus', 'extensor hallucis longus', 'extensor digitorum brevis'),
        antagonists: sided(c.S, 'flexor digitorum longus', 'flexor hallucis longus') }
    ],
    explanation: `Toe area for the ${c.S} foot, at the centre of the foot zone on the medial wall (paracentral lobule) of the ${c.H} hemisphere. ${LEG_PATHWAY(c)} The game sends a simulated, unitless drive that curls or lifts the ${c.S} toes and colours their flexors or extensors with the brain's colour ramp. Toe movement activates this medial zone in fMRI and stimulation studies, but the position here is schematic: the strip's medial edge stands in for the medial wall.`,
    citationKeys: ['PENFIELD1937', 'GORDON2023', 'LOTZE2000', 'UAMS_LOWER']
  }),
  ankle: c => ({
    label: `${c.Sc} ankle`, shortLabel: `${c.Sc[0]} ankle`, effector: `ankle and foot (${c.S} leg)`, bodySide: c.S, medialSurface: true,
    displayGroup: `${c.S}_leg`, pathway: 'corticospinal', laterality: 'contralateral',
    actions: [
      { id: `${c.code}_ankle_dorsiflex`, label: `Pull ${c.S} foot up (dorsiflex)`, joints: { [`ankle_dorsi_${c.J}`]: 15 },
        agonists: sided(c.S, 'tibialis anterior', 'extensor digitorum longus', 'extensor hallucis longus'),
        antagonists: sided(c.S, 'gastrocnemius', 'soleus') },
      { id: `${c.code}_ankle_plantarflex`, label: `Point ${c.S} foot down (plantarflex)`, joints: { [`ankle_dorsi_${c.J}`]: -25 },
        agonists: sided(c.S, 'gastrocnemius', 'soleus'),
        antagonists: sided(c.S, 'tibialis anterior') }
    ],
    explanation: `Ankle and foot area for the ${c.S} leg, beside the toe area on the medial wall and paracentral lobule. ${LEG_PATHWAY(c)} The game simulates the ${c.S} ankle pulling up (tibialis anterior) or pointing down (gastrocnemius and soleus). The foot zone is concentric, with the toes at its centre and ankle, knee and hip in rings around it (Gordon 2023), so these leg regions overlap rather than sit in a strict line.`,
    citationKeys: ['PENFIELD1937', 'GORDON2023', 'UAMS_LOWER']
  }),
  knee: c => ({
    label: `${c.Sc} knee`, shortLabel: `${c.Sc[0]} knee`, effector: `knee (${c.S} leg)`, bodySide: c.S, medialSurface: false,
    displayGroup: `${c.S}_leg`, pathway: 'corticospinal', laterality: 'contralateral',
    actions: [
      { id: `${c.code}_knee_flex`, label: `Bend ${c.S} knee`, joints: { [`knee_ext_${c.J}`]: -45 },
        agonists: sided(c.S, 'biceps femoris', 'semitendinosus', 'semimembranosus'),
        antagonists: sided(c.S, 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'),
        stabilizers: sided(c.S, 'gastrocnemius') },
      { id: `${c.code}_knee_extend`, label: `Straighten ${c.S} knee`, joints: { [`knee_ext_${c.J}`]: 0 },
        agonists: sided(c.S, 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'),
        antagonists: sided(c.S, 'biceps femoris', 'semitendinosus', 'semimembranosus'),
        note: 'At the seated rest pose the knee is bent (about 45 deg), so this straightens the knee (quadriceps); isometric force is not modelled.' }
    ],
    explanation: `Knee area for the ${c.S} leg, near the dorsal margin of the ${c.H} hemisphere between the foot and hip areas. ${LEG_PATHWAY(c)} The game simulates bending the ${c.S} knee (hamstrings) or straightening it (quadriceps). The knee lies in a ring of the concentric foot zone and overlaps the ankle and hip areas.`,
    citationKeys: ['PENFIELD1937', 'GORDON2023', 'UAMS_LOWER']
  }),
  hip: c => ({
    label: `${c.Sc} hip`, shortLabel: `${c.Sc[0]} hip`, effector: `hip (${c.S} leg)`, bodySide: c.S, medialSurface: false,
    displayGroup: `${c.S}_leg`, pathway: 'corticospinal', laterality: 'contralateral',
    actions: [
      { id: `${c.code}_hip_flex`, label: `Lift ${c.S} thigh (hip flexion)`, joints: { [`hip_flex_${c.J}`]: 35 },
        agonists: sided(c.S, 'iliacus', 'psoas major', 'rectus femoris'),
        antagonists: sided(c.S, 'gluteus maximus', 'biceps femoris', 'semitendinosus', 'semimembranosus') },
      { id: `${c.code}_hip_extend`, label: `Push ${c.S} thigh back (hip extension)`, joints: { [`hip_flex_${c.J}`]: -12 },
        agonists: sided(c.S, 'gluteus maximus', 'biceps femoris', 'semitendinosus', 'semimembranosus'),
        antagonists: sided(c.S, 'iliacus', 'psoas major') }
    ],
    explanation: `Hip area for the ${c.S} leg, at the outer ring of the foot zone where it meets trunk territory. ${LEG_PATHWAY(c)} The game simulates lifting the ${c.S} thigh (iliopsoas and rectus femoris) or pushing it back (gluteus maximus and hamstrings). Proximal leg muscles also take part in posture and balance, which this game does not model.`,
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
      { id: `${c.code}_trunk_flex`, label: 'Bend trunk forward', joints: { trunk_flex: 15 },
        agonists: [...both('rectus abdominis'), ...both('external oblique'), ...both('internal oblique')],
        antagonists: [...both('iliocostalis'), ...both('longissimus'), ...both('spinalis')] },
      { id: `${c.code}_trunk_extend`, label: 'Lean trunk back', joints: { trunk_flex: -8 },
        agonists: [...both('iliocostalis'), ...both('longissimus'), ...both('spinalis')],
        antagonists: [...both('rectus abdominis'), ...both('external oblique'), ...both('internal oblique')] }
    ],
    explanation: `Trunk area for the abdominal and back muscles, between the hip and shoulder areas and overlapping the superior inter-effector region. Axial muscles receive corticospinal input from both hemispheres (erector spinae: Ferbert 1992), so each hemisphere's trunk region moves the whole trunk in the game. The game simulates bending forward (rectus abdominis and obliques) or leaning back (erector spinae columns). Abdominal contraction also co-activates the inter-effector regions (Gordon 2023), and Penfield's maps had too few trunk stimulations to measure (Catani 2017); breathing and posture are not modelled.`,
    citationKeys: ['GORDON2023', 'FERBERT1992', 'CATANI2017', 'UAMS_ABDOMEN', 'UAMS_BACK']
  }),
  shoulder: c => (c.H === 'right' ? {
    label: 'Left shoulder', shortLabel: 'L shoulder', effector: 'shoulder (left arm)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [],
    noActionReason: 'The left shoulder follows the camera look and W/A/S/D (the reach lane); it has no separate gaze action, so looking here only lights and marks the region.',
    explanation: 'Shoulder area for the LEFT arm, at the medial edge of the arm and hand zone of the right hemisphere. Crossed corticospinal fibres dominate, with weaker same-side input to proximal muscles such as the deltoid (Bawa 2004). In NeuroSurge the left shoulder is carried by your look and by W/A/S/D, so looking here lights and marks the region without adding a separate movement. Stimulation rarely evokes isolated shoulder movement (Gordon 2023), and the model has no pectoralis, latissimus or trapezius meshes, so shoulder recruitment is not shown as measured activation.',
    citationKeys: ['GORDON2023', 'BAWA2004', 'DEVANNE2006', 'UAMS_UPPER']
  } : {
    label: 'Right shoulder', shortLabel: 'R shoulder', effector: 'shoulder (right arm)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_shoulder_flex', label: 'Raise right arm forward', joints: { r_shoulder_flex: 50 },
        agonists: ['clavicular part of right deltoid', 'right pectoralis major', 'right coracobrachialis', 'long head of right biceps brachii'],
        antagonists: ['spinal part of right deltoid', 'right latissimus dorsi', 'right teres major', 'long head of right triceps brachii'] },
      { id: 'lh_r_shoulder_abd', label: 'Raise right arm out to the side', joints: { r_shoulder_abd: 40 },
        agonists: ['acromial part of right deltoid', 'right supraspinatus'],
        antagonists: ['right pectoralis major', 'right latissimus dorsi', 'right teres major'],
        stabilizers: ['right trapezius', 'right serratus anterior'] }
    ],
    explanation: 'Shoulder area for the RIGHT arm, at the medial edge of the arm and hand zone of the left hemisphere. Crossed corticospinal fibres dominate, with weaker same-side input to proximal muscles (Bawa 2004). The game simulates raising the right arm forward (front deltoid, pectoralis major, coracobrachialis) or out to the side (middle deltoid, supraspinatus); look far right to see it. Proximal and distal arm representations overlap (Devanne 2006), and stimulation rarely moves the shoulder in isolation (Gordon 2023).',
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
      { id: 'lh_r_elbow_flex', label: 'Bend right elbow', joints: { r_elbow_flex: 80 },
        agonists: ['right brachialis', 'right biceps brachii', 'right brachioradialis'], antagonists: ['right triceps brachii', 'right anconeus'] },
      { id: 'lh_r_elbow_extend', label: 'Straighten right elbow', joints: { r_elbow_flex: 0 },
        agonists: ['right triceps brachii', 'right anconeus'], antagonists: ['right brachialis', 'right biceps brachii', 'right brachioradialis'],
        note: 'At the seated rest pose the right elbow is bent (about 85 deg) on the armrest, so this straightens it (triceps).' }
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
      { id: 'lh_r_pronate', label: 'Turn right palm down (pronation)', joints: { r_pronation: 120 },
        agonists: ['right pronator teres', 'right pronator quadratus'], antagonists: ['right supinator', 'right biceps brachii'] },
      { id: 'lh_r_supinate', label: 'Turn right palm up (supination)', joints: { r_pronation: 0 },
        agonists: ['right supinator', 'right biceps brachii'], antagonists: ['right pronator teres', 'right pronator quadratus'],
        note: 'At the seated rest pose the right forearm rests forward with the palm mostly down (mostly pronated), so this turns the palm up.' }
    ],
    explanation: 'Forearm-rotation area for the RIGHT arm, between the elbow and wrist areas of the left hemisphere. Crossed corticospinal fibres reach the cervical motor neurons of the forearm rotators. The game simulates turning the right palm down (pronator teres and quadratus) or up (supinator and biceps brachii). Forearm rotation shares overlapping fields with the wrist and elbow (Meier 2008), so this spot is a game placement, not a measured point.',
    citationKeys: ['MEIER2008', 'UAMS_UPPER']
  }),
  wrist: c => (c.H === 'right' ? {
    label: 'Left wrist', shortLabel: 'L wrist', effector: 'wrist (left arm)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('wrist_flexion', 'Flex left wrist', ['FCR', 'FCU'], ['ECRL', 'ECRB', 'ECU'], ['FDS', 'FDP']),
      leftArm('wrist_extension', 'Extend left wrist', ['ECRL', 'ECRB', 'ECU'], ['FCR', 'FCU'], ['ED'])
    ],
    explanation: 'Wrist area for the LEFT hand in the right hemisphere, between the forearm-rotation and hand areas. Crossed corticospinal fibres reach the cervical motor neurons of the wrist flexors and extensors. In the game, looking here pulses the existing left wrist flexion (flexor carpi radialis and ulnaris) or extension (the three wrist extensors). Wrist representation overlaps the fingers and appears on both sides of the hand zone (Meier 2008; Gordon 2023), but this one-dimensional strip shows only the dorsal part, and forearm-muscle maps have task-specific peaks (Masse-Alarie 2017).',
    citationKeys: ['MEIER2008', 'MASSE2017', 'GORDON2023', 'LOYOLA', 'UAMS_UPPER']
  } : {
    label: 'Right wrist', shortLabel: 'R wrist', effector: 'wrist (right arm)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_wrist_flex', label: 'Flex right wrist', joints: { r_wrist_flex: 50 },
        agonists: ['right flexor carpi radialis', 'right flexor carpi ulnaris', 'right palmaris longus'],
        antagonists: ['right extensor carpi radialis longus', 'right extensor carpi radialis brevis', 'right extensor carpi ulnaris'] },
      { id: 'lh_r_wrist_ext', label: 'Extend right wrist', joints: { r_wrist_ext: 45 },
        agonists: ['right extensor carpi radialis longus', 'right extensor carpi radialis brevis', 'right extensor carpi ulnaris'],
        antagonists: ['right flexor carpi radialis', 'right flexor carpi ulnaris'] }
    ],
    explanation: 'Wrist area for the RIGHT hand in the left hemisphere, between the forearm-rotation and hand areas. Crossed corticospinal fibres reach the cervical motor neurons of the wrist muscles. The game simulates flexing (flexor carpi radialis and ulnaris) or extending (the three wrist extensors) the right wrist. In right-hand studies the wrist emphasis brackets the fingers on both sides (Meier 2008), which this one-dimensional strip simplifies to one region.',
    citationKeys: ['MEIER2008', 'MASSE2017', 'UAMS_UPPER']
  }),
  hand: () => ({
    label: 'Left hand', shortLabel: 'L hand', effector: 'whole hand (left): grasp, release, open, spread', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('grasp_close', 'Grasp / close left hand', ['FDS', 'FDP', 'FPB', 'FPL', 'OP', 'ADP'], ['ED', 'EI', 'EDM', 'EPB', 'EPL'], ['ECRL', 'ECRB', 'ECU', 'LUM', 'DI', 'PI'],
        null, null, 'Extensors are listed as relatively reduced, as in MOVEMENT-MAP r2; strong power grip can co-activate extensor digitorum (Motawar 2012; map-delta D07), so show them as not elevated rather than suppressed.'),
      leftArm('relax_release', 'Relax / release left grasp', [], ['FDS', 'FDP', 'FPB', 'FPL', 'ED', 'EI', 'EDM', 'EPB', 'EPL'], [],
        null, null, 'Release lowers flexor and extensor drive; it is not active extension and not cortical silence (Motawar 2012).'),
      leftArm('open_hand', 'Open left hand', ['ED', 'EI', 'EDM', 'EPB', 'EPL'], ['FDS', 'FDP', 'FPB', 'FPL'], ['LUM', 'DI', 'PI'],
        null, null, 'Opening on Space release is a game convention; natural release can be passive.'),
      leftArm('spread_fingers', 'Spread left fingers', ['DI', 'ADM'], ['PI'], ['ED', 'LUM'])
    ],
    explanation: 'Hand area (the hand knob) for the LEFT hand in the right hemisphere: whole-hand grasp, release, opening and spreading. Crossed corticospinal fibres, including direct cortico-motoneuronal connections that support fine finger control (Lemon 2008), reach the hand motor neurons. In the game, looking here, or holding Space for the fist, drives the existing left-hand actions, and the finger flexors or extensors take the same colour ramp as the brain. Huber 2020 measured left-hand grasp and retraction in the right motor cortex as overlapping, repeated action patches that differ between people, and natural grip release can be passive (Motawar 2012), so releasing Space into an open hand is a game convention.',
    citationKeys: ['HUBER2020', 'MOTAWAR2012', 'ARBUCKLE2020', 'VANDUINEN2008', 'LEMON2008', 'YOUSRY1997', 'DEO2026', 'UAMS_UPPER']
  }),
  index: () => ({
    label: 'Left index finger', shortLabel: 'L index', effector: 'index finger (left hand)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('index_flexion', 'Flex left index finger', ['FDS', 'FDP'], ['EI', 'ED'], ['LUM', 'DI']),
      leftArm('index_extension', 'Extend left index finger', ['EI', 'ED'], ['FDS', 'FDP'], ['LUM', 'DI'])
    ],
    explanation: 'Index-finger area for the LEFT hand, inside the hand zone of the right hemisphere. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. In the game, looking here pulses the existing left index flexion or extension. Flexion and extension of one finger share strongly overlapping activity patterns (Arbuckle 2020, right hand, mirrored here by inference), and the finger flexor and extensor meshes are whole muscles, so their colour covers every finger.',
    citationKeys: ['ARBUCKLE2020', 'HUBER2020', 'UAMS_UPPER']
  }),
  thumb: () => ({
    label: 'Left thumb', shortLabel: 'L thumb', effector: 'thumb (left hand)', bodySide: 'left', medialSurface: false, isLeftArm: true,
    displayGroup: 'left_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      leftArm('thumb_mcp_flexion', 'Flex left thumb (MCP)', ['FPB'], ['EPB'], ['FPL']),
      leftArm('thumb_mcp_extension', 'Extend left thumb (MCP)', ['EPB'], ['FPB'], ['EPL'])
    ],
    explanation: 'Thumb area for the LEFT hand, the most lateral part of the hand zone in the right hemisphere. Crossed corticospinal fibres reach the thumb muscles. In the game, looking here pulses the existing left thumb flexion (flexor pollicis brevis) or extension (extensor pollicis brevis) at the knuckle. Thumb directions were mapped with TMS for the right thumb in the left hemisphere, with contextual and individual biases (Z\'Graggen 2009), so this mirrored placement is representative.',
    citationKeys: ['ZGRAGGEN2009', 'UAMS_UPPER']
  }),
  r_hand: () => ({
    label: 'Right hand', shortLabel: 'R hand', effector: 'whole hand (right): close and open', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_grasp', label: 'Close right hand', joints: { r_grasp: 85 },
        agonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus', 'right flexor pollicis longus', 'right flexor pollicis brevis', 'right opponens pollicis', 'right adductor pollicis'],
        antagonists: ['right extensor digitorum', 'right extensor indicis', 'right extensor pollicis longus', 'right extensor pollicis brevis'] },
      { id: 'lh_r_open', label: 'Open right hand', joints: { r_open: 20 },
        agonists: ['right extensor digitorum', 'right extensor indicis', 'right extensor digiti minimi', 'right extensor pollicis longus', 'right extensor pollicis brevis'],
        antagonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus', 'right flexor pollicis longus'] }
    ],
    explanation: 'Hand area (the hand knob) for the RIGHT hand in the left hemisphere. Crossed corticospinal fibres, including direct cortico-motoneuronal connections (Lemon 2008), reach the hand motor neurons. The game simulates closing or opening the right hand; look far right to see it. Right-hand studies in the left hemisphere find overlapping finger patterns (Arbuckle 2020), and even the hand knob crown carries whole-body tuning (Willett 2020).',
    citationKeys: ['ARBUCKLE2020', 'MEIER2008', 'LEMON2008', 'YOUSRY1997', 'WILLETT2020', 'DEO2026', 'UAMS_UPPER']
  }),
  r_fingers: () => ({
    label: 'Right fingers', shortLabel: 'R fingers', effector: 'fingers (right hand; whole-hand rig)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_fingers_curl', label: 'Curl right fingers', joints: { r_grasp: 50 },
        agonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus'], antagonists: ['right extensor digitorum', 'right extensor indicis'],
        note: 'The right-hand rig moves all digits together, so this is a partial whole-hand closure.' },
      { id: 'lh_r_fingers_straighten', label: 'Straighten right fingers', joints: { r_open: 15 },
        agonists: ['right extensor digitorum', 'right extensor indicis'], antagonists: ['right flexor digitorum superficialis', 'right flexor digitorum profundus'],
        note: 'The right-hand rig moves all digits together.' }
    ],
    explanation: 'Finger area for the RIGHT hand, inside the hand zone of the left hemisphere. Crossed corticospinal fibres reach the motor neurons of the long finger flexors and extensors. The right-hand rig has no separate finger joints, so the game shows a partial whole-hand curl or straightening and colours the finger flexors or extensors. Single-finger flexion and extension share strongly overlapping patterns in the left hemisphere (Arbuckle 2020).',
    citationKeys: ['ARBUCKLE2020', 'MEIER2008', 'UAMS_UPPER']
  }),
  r_thumb: () => ({
    label: 'Right thumb', shortLabel: 'R thumb', effector: 'thumb (right hand; whole-hand rig)', bodySide: 'right', medialSurface: false,
    displayGroup: 'right_arm', pathway: 'corticospinal', laterality: 'contralateral_predominant',
    actions: [
      { id: 'lh_r_thumb_close', label: 'Close right thumb', joints: { r_grasp: 30 },
        agonists: ['right flexor pollicis longus', 'right flexor pollicis brevis', 'right opponens pollicis', 'right adductor pollicis'],
        antagonists: ['right extensor pollicis longus', 'right extensor pollicis brevis'],
        note: 'The right-hand rig has no separate thumb joint, so this shows as a small whole-hand closure.' }
    ],
    explanation: "Thumb area for the RIGHT hand, the most lateral part of the hand zone in the left hemisphere. Crossed corticospinal fibres reach the thumb muscles. The right-hand rig has no separate thumb joint, so the game shows a small whole-hand closure and colours the thumb flexors. Thumb movement directions were mapped with TMS in this hemisphere for the right thumb, with contextual and individual biases (Z'Graggen 2009).",
    citationKeys: ['ZGRAGGEN2009', 'UAMS_UPPER']
  }),
  neck: c => ({
    label: 'Neck', shortLabel: 'Neck', effector: 'neck (head flexion and turning)', bodySide: 'midline', medialSurface: false,
    displayGroup: 'neck', pathway: 'corticospinal+corticobulbar', laterality: 'bilateral_debated',
    actions: [
      { id: `${c.code}_neck_flex`, label: 'Bend head forward', joints: { neck_flex: 15 },
        agonists: [...both('sternocleidomastoid'), ...both('longus colli')],
        antagonists: [...both('splenius capitis'), ...both('semispinalis capitis'), ...both('trapezius')] },
      c.H === 'right'
        ? { id: 'rh_neck_turn_left', label: 'Turn head to the left', joints: { neck_rot: 25 },
          agonists: ['right sternocleidomastoid', 'left splenius capitis'], antagonists: ['left sternocleidomastoid', 'right splenius capitis'],
          note: 'Game choice: each hemisphere turns the head toward the opposite side. Which hemisphere drives head turning is unresolved.' }
        : { id: 'lh_neck_turn_right', label: 'Turn head to the right', joints: { neck_rot: -25 },
          agonists: ['left sternocleidomastoid', 'right splenius capitis'], antagonists: ['right sternocleidomastoid', 'left splenius capitis'],
          note: 'Game choice: each hemisphere turns the head toward the opposite side. Which hemisphere drives head turning is unresolved.' }
    ],
    explanation: `Neck area of the ${c.H} hemisphere, placed after the thumb as in Penfield's motor sequence. Neck muscles receive input from both hemispheres, and the sternocleidomastoid gets both crossed and uncrossed projections (Thompson 1997). The game simulates bending the head forward or turning it to the ${c.S} (one sternocleidomastoid with the opposite splenius capitis), which is a game choice because the hemisphere that drives head turning is unresolved. Thompson 1997 found the sternocleidomastoid representation high on the convexity near the trunk area, so the neck's place on this strip is debated.`,
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
    label: 'Brow', shortLabel: 'Brow', effector: 'eyebrows (upper face, both sides)', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral',
    actions: [
      { id: `${c.code}_brow_raise`, label: 'Raise both eyebrows', joints: { brow_raise: 15 },
        agonists: ['frontal belly of left occipitofrontalis', 'frontal belly of right occipitofrontalis'],
        antagonists: [...both('corrugator supercilii'), 'procerus'] }
    ],
    explanation: `Brow area of the ${c.H} hemisphere, where the frontal belly of occipitofrontalis raises the eyebrows. Corticobulbar fibres reach the facial nucleus, and the upper face is supplied from both hemispheres, which is why a cortical stroke usually spares the forehead (monkey tract tracing: Morecraft 2001). BodyParts3D 4.0 has no facial-expression muscles, so the game only records a simulated display level here: nothing on the face layer moves or changes colour. Eyebrow raising co-activated the inter-effector regions in fMRI (Gordon 2023), so this small area is a schematic placement.`,
    citationKeys: ['MORECRAFT2001', 'GORDON2023', 'PENFIELD1937', 'UAMS_HEADNECK']
  }),
  eyelid: c => ({
    label: 'Eyelids', shortLabel: 'Eyelids', effector: 'eyelid closure (upper face, both sides)', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral',
    actions: [
      { id: `${c.code}_eye_close`, label: 'Close both eyes', joints: { eye_close: 20 },
        agonists: both('orbicularis oculi'), antagonists: both('levator palpebrae superioris'),
        note: 'Levator palpebrae superioris is supplied by the oculomotor nerve, a separate pathway.' }
    ],
    explanation: `Eyelid area of the ${c.H} hemisphere, where orbicularis oculi closes the eyes. Corticobulbar input to the upper face comes from both hemispheres (Morecraft 2001, in monkeys). BodyParts3D 4.0 has no orbicularis oculi or other facial-expression muscle, so the game only records a simulated display level here: nothing on the face layer moves or changes colour. Eye opening (levator palpebrae superioris, oculomotor nerve) and blink reflexes are separate circuits that are not simulated, and Gordon 2023 lists eyelid movement among those most preferred at an inter-effector centre.`,
    citationKeys: ['MORECRAFT2001', 'GORDON2023', 'PENFIELD1937', 'UAMS_HEADNECK']
  }),
  lower_face: c => ({
    label: `Lower face (${c.S} mouth corner)`, shortLabel: 'Smile', effector: `lower face: mouth-corner lift (mainly the ${c.S} side)`, bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'contralateral_predominant',
    actions: [
      { id: `${c.code}_smile`, label: 'Lift mouth corner (smile)', joints: { smile: 15 },
        agonists: sided(c.S, 'zygomaticus major', 'levator anguli oris', 'risorius'),
        antagonists: sided(c.S, 'depressor anguli oris'), lateralBias: c.S,
        note: `BodyParts3D 4.0 has no mesh for these muscles: the smile is a simulated display level only, and nothing moves or is coloured (the ${c.S} side would receive most of this hemisphere's drive).` }
    ],
    explanation: `Lower-face area of the ${c.H} hemisphere, where zygomaticus major and levator anguli oris lift the corner of the mouth. Corticobulbar fibres to the lower face are mainly crossed (Morecraft 2001, in monkeys), so the ${c.S} mouth corner gets most of this hemisphere's drive. BodyParts3D 4.0 has none of these facial-expression muscles, so the game only records a simulated display level here: nothing on the face layer moves or changes colour. Only voluntary smiling is described; emotional smiling also uses separate pathways.`,
    citationKeys: ['MORECRAFT2001', 'PENFIELD1937', 'UAMS_HEADNECK']
  }),
  lips: c => ({
    label: 'Lips', shortLabel: 'Lips', effector: 'lips (orbicularis oris)', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'contralateral_predominant',
    actions: [
      { id: `${c.code}_lip_purse`, label: 'Purse the lips', joints: { lip_purse: 15 },
        agonists: ['orbicularis oris'], antagonists: [...both('zygomaticus major'), ...both('risorius')], lateralBias: c.S }
    ],
    explanation: `Lip area of the ${c.H} hemisphere, where orbicularis oris purses the lips. Corticobulbar fibres reach the facial nucleus, with a crossed predominance for the lower face (Morecraft 2001). BodyParts3D 4.0 has no orbicularis oris mesh, so the game only records a simulated display level here: nothing on the face layer moves or changes colour. Lip movement is a classic landmark of fMRI motor somatotopy (Lotze 2000), and speech uses this area together with the jaw, tongue and larynx.`,
    citationKeys: ['LOTZE2000', 'MORECRAFT2001', 'PENFIELD1937', 'UAMS_HEADNECK']
  }),
  jaw: c => ({
    label: 'Jaw', shortLabel: 'Jaw', effector: 'jaw opening and closing', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral_contralateral_bias',
    actions: [
      { id: `${c.code}_jaw_open`, label: 'Open the jaw', joints: { jaw_open: 18 },
        agonists: [...both('lateral pterygoid'), 'anterior belly of left digastric', 'anterior belly of right digastric', ...both('mylohyoid')],
        antagonists: [...both('masseter'), ...both('temporalis'), ...both('medial pterygoid')] },
      { id: `${c.code}_jaw_clench`, label: 'Clench the jaw', joints: { jaw_open: 0 },
        agonists: [...both('masseter'), ...both('temporalis'), ...both('medial pterygoid')],
        antagonists: [...both('lateral pterygoid'), 'anterior belly of left digastric', 'anterior belly of right digastric'], lateralBias: c.S,
        note: 'Masseter, temporalis and the medial pterygoid have no BodyParts3D 4.0 mesh and the jaw is already closed at rest, so clenching shows no movement and no colour; bite force is not modelled.' }
    ],
    explanation: `Jaw area of the ${c.H} hemisphere, which opens the mouth (lateral pterygoid, digastric) or clenches it (masseter, temporalis). Corticobulbar fibres reach the trigeminal motor nucleus from both hemispheres, but the crossed hemisphere has the stronger drive to the masseter (Nordstrom 2007). In the game, opening swings the jaw on the ghosted face layer and colours the digastric and mylohyoid; masseter, temporalis and the pterygoids have no BodyParts3D 4.0 mesh, so clenching shows no movement and no colour. Chewing rhythm is generated in the brainstem and is not modelled.`,
    citationKeys: ['NORDSTROM2007', 'PENFIELD1937', 'UAMS_HEADNECK']
  }),
  tongue: c => ({
    label: 'Tongue', shortLabel: 'Tongue', effector: 'tongue protrusion', bodySide: 'midline', medialSurface: false,
    displayGroup: 'face', pathway: 'corticobulbar', laterality: 'bilateral_contralateral_bias',
    actions: [
      { id: `${c.code}_tongue_out`, label: 'Push the tongue out', joints: { jaw_open: 6 },
        agonists: ['genioglossus'], antagonists: ['styloglossus', 'hyoglossus'], lateralBias: c.S,
        note: 'The body rig has no tongue and genioglossus has no BodyParts3D 4.0 mesh: the jaw opens slightly (game convention) and nothing is coloured.' }
    ],
    explanation: `Tongue area of the ${c.H} hemisphere, at the centre of the mouth zone (Gordon 2023), where genioglossus pushes the tongue out. Corticobulbar fibres reach the hypoglossal nucleus from both hemispheres, with lower thresholds from the crossed side (Muellbacher 2001). The rig has no tongue and genioglossus has no mesh, so by game convention the jaw opens slightly and nothing is coloured. Swallowing and the larynx are not modelled.`,
    citationKeys: ['GORDON2023', 'MUELLBACHER2001', 'PENFIELD1937', 'UAMS_HEADNECK']
  }),
  scan_inferior: c => ({
    label: 'Inferior inter-effector (SCAN)', shortLabel: 'SCAN inf.', effector: 'most ventral inter-effector region, beyond the mouth zone (somato-cognitive action network); no isolated body part',
    bodySide: 'midline', medialSurface: false, kind: 'integration', displayGroup: 'integration', pathway: 'integration', laterality: 'bilateral network',
    actions: [],
    noActionReason: 'Inter-effector regions show weak movement specificity; swallowing and larynx are not in the rig, so the game moves nothing here.',
    explanation: `Inferior inter-effector region of the somato-cognitive action network (SCAN), the most ventral of the three, beyond the mouth zone of the ${c.H} hemisphere (Gordon 2023, seed 6 of the dorsal-to-ventral line). Gordon lists swallowing among the movements most preferred at inter-effector centres, while a laryngeal vowel task stayed inside the mouth zone. In the game, looking here lights and marks the region but moves nothing. Swallowing, breathing and the larynx are not simulated.`,
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
const SCAN_CAVEAT = 'Moves nothing in the game: any real role (planning, posture) is not simulated.';
const REGION_CAVEATS = {
  toes: () => 'A schematic spot: the real toe area lies on the brain\u2019s inner (medial) wall.',
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
  wrist: () => 'The wrist area overlaps the fingers; this strip shows it as one simplified region.',
  hand: () => 'Grasp areas overlap and differ between people; opening the hand on release is a game convention.',
  index: () => 'Bending and straightening one finger use overlapping activity; the colour covers every finger.',
  thumb: () => 'Placed by mirroring right-thumb studies, so the spot is representative.',
  r_hand: () => 'Finger areas overlap, and even the hand area responds to other body parts.',
  r_fingers: () => 'The right-hand rig moves all fingers together; single-finger patterns overlap.',
  r_thumb: () => 'No separate thumb joint: a small whole-hand closure stands in for it.',
  neck: () => 'The neck\u2019s place on this strip is debated, and which side turns the head is unresolved (a game choice).',
  scan_middle: () => SCAN_CAVEAT,
  brow: () => NO_FACE_MUSCLES,
  eyelid: () => NO_FACE_MUSCLES,
  lower_face: () => NO_FACE_MUSCLES,
  lips: () => NO_FACE_MUSCLES,
  jaw: () => 'The clenching muscles have no mesh, so clenching shows no movement and no colour.',
  tongue: () => 'The rig has no tongue: by game convention the jaw opens slightly and nothing is coloured.',
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
const SCAN_MOVES_PLAIN = 'Nothing: it only lights up and gets marked.';
const SCAN_CAVEAT_PLAIN = 'Any real job here, such as planning or posture, is not simulated.';
const LOOK_RIGHT = ' (look far right to see it)';

/** Region plain fields, keyed like CONTENT. Every plainLead is one sentence; every plainCaveat is <= 110 characters. */
const PLAIN_REGION = {
  toes: c => ({
    plainLabel: `${c.Sc} toes`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} toes to curl or lift.`,
    plainMoves: `Curls or lifts your ${c.S} toes.`,
    plainCaveat: 'A rough spot. The real toe area is on the inner wall, where the two brain halves meet.'
  }),
  ankle: c => ({
    plainLabel: `${c.Sc} ankle`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} foot to point up or down.`,
    plainMoves: `Pulls your ${c.S} foot up or points it down.`,
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
    plainLead: `This spot in ${half(c)} tells your ${c.S} thigh to lift or push back.`,
    plainMoves: `Lifts your ${c.S} thigh or pushes it back.`,
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
    plainMoves: 'Bends your body forward or leans it back.',
    plainCaveat: 'Few studies measured the trunk area. Breathing and posture are not shown.'
  }),
  shoulder: c => (c.H === 'right' ? {
    plainLabel: 'Left shoulder',
    plainLead: `This spot in ${half(c)} helps move your left shoulder.`,
    plainMoves: 'Nothing extra: your look and the W/A/S/D keys already move the left shoulder.',
    plainCaveat: 'Your look and W/A/S/D already move the left shoulder. Looking here adds no extra movement.'
  } : {
    plainLabel: 'Right shoulder',
    plainLead: `This spot in ${half(c)} tells your right arm to lift.`,
    plainMoves: `Raises your right arm forward or out to the side${LOOK_RIGHT}.`,
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
    plainMoves: 'Turns your left palm down or up, like a double-tap of Space.',
    plainCaveat: 'No study shows a separate spot for turning the palm. So this place is a game choice.'
  } : {
    plainLabel: 'Right forearm turn',
    plainLead: `This spot in ${half(c)} tells your right palm to turn down or up.`,
    plainMoves: `Turns your right palm down or up${LOOK_RIGHT}.`,
    plainCaveat: 'Turning the palm shares spots with the wrist and elbow. So this place is a game choice.'
  }),
  wrist: c => ({
    plainLabel: `${c.Sc} wrist`,
    plainLead: `This spot in ${half(c)} tells your ${c.S} wrist to bend either way.`,
    plainMoves: `Bends your ${c.S} wrist toward the palm or back${c.H === 'left' ? LOOK_RIGHT : ''}.`,
    plainCaveat: 'The wrist spot overlaps the finger spots. Here it is drawn as one simple area.'
  }),
  hand: c => ({
    plainLabel: 'Left hand',
    plainLead: `This spot in ${half(c)} tells your left hand to close or open.`,
    plainMoves: 'Closes, relaxes, opens or spreads your left hand. Holding Space makes a fist too.',
    plainCaveat: 'Grip areas overlap and differ between people. Opening the hand when you let go is a game rule.'
  }),
  index: c => ({
    plainLabel: 'Left index finger',
    plainLead: `This spot in ${half(c)} tells your left index finger to bend or straighten.`,
    plainMoves: 'Bends or straightens your left index finger.',
    plainCaveat: 'To bend or straighten one finger, the brain uses signals that overlap. The colour shows on all fingers.'
  }),
  thumb: c => ({
    plainLabel: 'Left thumb',
    plainLead: `This spot in ${half(c)} tells your left thumb to bend or straighten.`,
    plainMoves: 'Bends or straightens your left thumb at the knuckle.',
    plainCaveat: 'Placed by mirroring studies of the right thumb, so the spot is only a rough guide.'
  }),
  r_hand: c => ({
    plainLabel: 'Right hand',
    plainLead: `This spot in ${half(c)} tells your right hand to close or open.`,
    plainMoves: `Closes or opens your right hand${LOOK_RIGHT}.`,
    plainCaveat: 'The finger spots overlap. Even the hand spot reacts when other parts of the body move.'
  }),
  r_fingers: c => ({
    plainLabel: 'Right fingers',
    plainLead: `This spot in ${half(c)} tells your right fingers to curl or straighten.`,
    plainMoves: 'Partly closes or opens the whole right hand. The 3D hand moves all fingers together.',
    plainCaveat: 'The 3D right hand moves all its fingers at once. Signals for single fingers overlap.'
  }),
  r_thumb: c => ({
    plainLabel: 'Right thumb',
    plainLead: `This spot in ${half(c)} tells your right thumb to close.`,
    plainMoves: 'Closes the right hand a little. The 3D hand has no separate thumb joint.',
    plainCaveat: 'The 3D right hand has no separate thumb joint, so a small hand squeeze stands in.'
  }),
  neck: c => ({
    plainLabel: 'Neck',
    plainLead: `This spot in ${half(c)} tells your head to nod or turn ${c.S}.`,
    plainMoves: `Bends your head forward or turns it to the ${c.S}.`,
    plainCaveat: 'Where the neck sits here, and which half turns the head, is still debated (a game choice).'
  }),
  scan_middle: () => ({
    plainLabel: 'In-between area (middle)',
    plainLead: 'This in-between spot on the motor strip, by the hand and face, is linked to planning.',
    plainMoves: SCAN_MOVES_PLAIN,
    plainCaveat: 'In brain tests, a small electric pulse here never moved any body part.'
  }),
  brow: c => ({
    plainLabel: 'Eyebrows',
    plainLead: `This spot in ${half(c)} tells both eyebrows to rise.`,
    plainMoves: FACE_MOVES_PLAIN,
    plainCaveat: NO_FACE_MESH_PLAIN
  }),
  eyelid: c => ({
    plainLabel: 'Eyelids',
    plainLead: `This spot in ${half(c)} tells both eyes to close.`,
    plainMoves: FACE_MOVES_PLAIN,
    plainCaveat: NO_FACE_MESH_PLAIN
  }),
  lower_face: c => ({
    plainLabel: `Smile, ${c.S} side`,
    plainLead: `This spot in ${half(c)} tells your mouth to smile, mostly on the ${c.S}.`,
    plainMoves: FACE_MOVES_PLAIN,
    plainCaveat: NO_FACE_MESH_PLAIN
  }),
  lips: c => ({
    plainLabel: 'Lips',
    plainLead: `This spot in ${half(c)} tells your lips to purse.`,
    plainMoves: FACE_MOVES_PLAIN,
    plainCaveat: NO_FACE_MESH_PLAIN
  }),
  jaw: c => ({
    plainLabel: 'Jaw',
    plainLead: `This spot in ${half(c)} tells your jaw to open or clench.`,
    plainMoves: 'Opens your jaw. Clenching shows nothing.',
    plainCaveat: 'The 3D body has no chewing muscles, so clenching shows no movement or colour.'
  }),
  tongue: c => ({
    plainLabel: 'Tongue',
    plainLead: `This spot in ${half(c)} tells your tongue to push out.`,
    plainMoves: 'Opens your jaw a little, because the 3D body has no tongue.',
    plainCaveat: 'The 3D body has no tongue. So the jaw opens a little instead, and nothing gets coloured.'
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
  toes_curl: c => ({ plainLabel: `Curl ${c.S} toes`, pull: 'toe-curling muscles in the calf and sole', relax: 'toe-lifting muscles on the shin' }),
  toes_lift: c => ({ plainLabel: `Lift ${c.S} toes`, pull: 'toe-lifting muscles on the shin and top of the foot', relax: 'toe-curling muscles in the calf' }),
  ankle_dorsiflex: c => ({ plainLabel: `Pull ${c.S} foot up`, pull: 'muscles at the front of the shin', relax: 'calf muscles' }),
  ankle_plantarflex: c => ({ plainLabel: `Point ${c.S} foot down`, pull: 'calf muscles', relax: 'the muscle at the front of the shin' }),
  knee_flex: c => ({ plainLabel: `Bend ${c.S} knee`, pull: 'muscles at the back of the thigh (hamstrings)', relax: 'muscles at the front of the thigh (quadriceps)' }),
  knee_extend: c => ({ plainLabel: `Straighten ${c.S} knee`, pull: 'muscles at the front of the thigh (quadriceps)', relax: 'muscles at the back of the thigh (hamstrings)' }),
  hip_flex: c => ({ plainLabel: `Lift ${c.S} thigh`, pull: 'deep hip muscles and a front thigh muscle', relax: 'buttock muscle and back-of-thigh muscles' }),
  hip_extend: c => ({ plainLabel: `Push ${c.S} thigh back`, pull: 'buttock muscle and back-of-thigh muscles', relax: 'deep hip muscles' }),
  trunk_flex: () => ({ plainLabel: 'Bend forward', pull: 'belly muscles on both sides', relax: 'back muscles along the spine' }),
  trunk_extend: () => ({ plainLabel: 'Lean back', pull: 'back muscles along the spine', relax: 'belly muscles on both sides' }),
  r_shoulder_flex: () => ({ plainLabel: 'Raise right arm forward', pull: 'front shoulder, chest and upper-arm muscles', relax: 'back shoulder, back and upper-arm muscles' }),
  r_shoulder_abd: () => ({ plainLabel: 'Raise right arm out to the side', pull: 'top shoulder muscles', relax: 'chest and back muscles that pull the arm in' }),
  elbow_flexion: () => ({ plainLabel: 'Bend left elbow', pull: 'muscles at the front of the arm (biceps and others)', relax: 'muscles at the back of the arm (triceps)' }),
  elbow_extension: () => ({ plainLabel: 'Straighten left elbow', pull: 'muscles at the back of the arm (triceps)', relax: 'muscles at the front of the arm (biceps and others)' }),
  r_elbow_flex: () => ({ plainLabel: 'Bend right elbow', pull: 'muscles at the front of the arm (biceps and others)', relax: 'muscles at the back of the arm (triceps)' }),
  r_elbow_extend: () => ({ plainLabel: 'Straighten right elbow', pull: 'muscles at the back of the arm (triceps)', relax: 'muscles at the front of the arm (biceps and others)' }),
  pronation: () => ({ plainLabel: 'Turn left palm down', pull: PALM_DOWN_MUSCLES, relax: PALM_UP_MUSCLES }),
  supination: () => ({ plainLabel: 'Turn left palm up', pull: PALM_UP_MUSCLES, relax: PALM_DOWN_MUSCLES }),
  // R4-fix (review SL4-1): since round 4 the seated right forearm rests FORWARD on the armrest, so turning it moves the
  // palm down / up (as on the left arm); round 3's hanging arm turned it back / forward.
  r_pronate: () => ({ plainLabel: 'Turn right palm down', pull: 'forearm muscles that turn the palm down', relax: 'muscles that turn the palm up (including the biceps)' }),
  r_supinate: () => ({ plainLabel: 'Turn right palm up', pull: 'muscles that turn the palm up (including the biceps)', relax: 'forearm muscles that turn the palm down' }),
  wrist_flexion: () => ({ plainLabel: 'Bend left wrist toward the palm', pull: 'wrist muscles on the palm side of the forearm', relax: 'wrist muscles on the back of the forearm' }),
  wrist_extension: () => ({ plainLabel: 'Bend left wrist back', pull: 'wrist muscles on the back of the forearm', relax: 'wrist muscles on the palm side of the forearm' }),
  r_wrist_flex: () => ({ plainLabel: 'Bend right wrist toward the palm', pull: 'wrist muscles on the palm side of the forearm', relax: 'wrist muscles on the back of the forearm' }),
  r_wrist_ext: () => ({ plainLabel: 'Bend right wrist back', pull: 'wrist muscles on the back of the forearm', relax: 'wrist muscles on the palm side of the forearm' }),
  grasp_close: () => ({ plainLabel: 'Close left hand', pull: FINGER_BENDERS, relax: FINGER_STRAIGHTENERS }),
  relax_release: () => ({ plainLabel: 'Relax left grip', pull: 'none: the grip just lets go', relax: 'finger and thumb muscles that bend and that straighten' }),
  open_hand: () => ({ plainLabel: 'Open left hand', pull: FINGER_STRAIGHTENERS, relax: FINGER_BENDERS }),
  spread_fingers: () => ({ plainLabel: 'Spread left fingers', pull: 'small muscles between the finger bones, plus one for the little finger', relax: 'small palm muscles that pull the fingers together' }),
  index_flexion: () => ({ plainLabel: 'Bend left index finger', pull: 'finger-bending muscles in the forearm', relax: 'finger-straightening muscles' }),
  index_extension: () => ({ plainLabel: 'Straighten left index finger', pull: 'finger-straightening muscles', relax: 'finger-bending muscles in the forearm' }),
  thumb_mcp_flexion: () => ({ plainLabel: 'Bend left thumb at the knuckle', pull: 'a short thumb muscle in the palm that bends it', relax: 'a thumb muscle that straightens it' }),
  thumb_mcp_extension: () => ({ plainLabel: 'Straighten left thumb at the knuckle', pull: 'a thumb muscle that straightens it', relax: 'a short thumb muscle in the palm that bends it' }),
  r_grasp: () => ({ plainLabel: 'Close right hand', pull: FINGER_BENDERS, relax: FINGER_STRAIGHTENERS }),
  r_open: () => ({ plainLabel: 'Open right hand', pull: FINGER_STRAIGHTENERS, relax: FINGER_BENDERS }),
  r_fingers_curl: () => ({ plainLabel: 'Curl right fingers', pull: 'finger-bending muscles', relax: 'finger-straightening muscles' }),
  r_fingers_straighten: () => ({ plainLabel: 'Straighten right fingers', pull: 'finger-straightening muscles', relax: 'finger-bending muscles' }),
  r_thumb_close: () => ({ plainLabel: 'Close right thumb', pull: 'thumb muscles that bend it across the palm', relax: 'thumb muscles that straighten it' }),
  neck_flex: () => ({ plainLabel: 'Bend head forward', pull: 'muscles at the front of the neck', relax: 'muscles at the back of the neck' }),
  neck_turn_left: () => ({ plainLabel: 'Turn head to the left', pull: 'a right side-neck muscle and a left back-of-neck one', relax: 'a left side-neck muscle and a right back-of-neck one' }),
  neck_turn_right: () => ({ plainLabel: 'Turn head to the right', pull: 'a left side-neck muscle and a right back-of-neck one', relax: 'a right side-neck muscle and a left back-of-neck one' }),
  brow_raise: () => ({ plainLabel: 'Raise both eyebrows', pull: 'the forehead muscle', relax: 'frown muscles between the eyebrows' }),
  eye_close: () => ({ plainLabel: 'Close both eyes', pull: 'ring muscles around the eyes', relax: 'eyelid-lifting muscles' }),
  smile: c => ({ plainLabel: `Smile (mostly the ${c.S} side)`, pull: `smile muscles in the ${c.S} cheek`, relax: `the muscle that pulls the ${c.S} mouth corner down` }),
  lip_purse: () => ({ plainLabel: 'Purse the lips', pull: 'the ring muscle around the mouth', relax: 'smile muscles in both cheeks' }),
  // R3-fix (review SL-8): the lateral pterygoid is itself a chewing muscle; the closers are the jaw-closing chewing muscles.
  jaw_open: () => ({ plainLabel: 'Open the jaw', pull: 'muscles under the chin and one deep chewing muscle', relax: 'jaw-closing (chewing) muscles' }),
  jaw_clench: () => ({ plainLabel: 'Clench the jaw', pull: 'jaw-closing (chewing) muscles', relax: 'muscles under the chin and one deep chewing muscle' }),
  tongue_out: () => ({ plainLabel: 'Stick the tongue out', pull: 'the main tongue muscle', relax: 'muscles that pull the tongue back' })
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
const SCAN_NETWORK = 'It belongs to a newly found network for planning actions (somato-cognitive action network, SCAN).';
const SCAN_WEAK = 'In-between areas are only loosely tied to one movement (inter-effector regions show weak movement ' +
  'specificity).';

/** Region plain detail (and plainNoAction where the region has a noActionReason), keyed like CONTENT. */
const PLAIN_DETAIL = {
  toes: c => ({
    detail: `This is the toe area for your ${c.S} foot. It sits in the middle of the foot zone, on the inner wall where ` +
      `the two halves of the brain meet (medial wall, paracentral lobule, ${c.H} hemisphere). ${LEG_PATH_PLAIN(c)} The ` +
      `game sends a made-up signal with no units (a simulated, unitless drive). It curls or lifts the ${c.S} toes and ` +
      'colours the muscles that bend or straighten them (flexors or extensors) with the brain’s colours (colour ramp). ' +
      'In brain scans (fMRI) and stimulation studies, moving the toes switches on this inner zone. But the spot here is ' +
      'simplified (schematic): the inner end of the strip stands in for the inner wall (medial edge, medial wall).'
  }),
  ankle: c => ({
    detail: `This is the ankle and foot area for your ${c.S} leg, in ${BRAIN_HALF(c)}. It sits beside the toe area, on the inner wall ` +
      `(medial wall and paracentral lobule). ${LEG_PATH_PLAIN(c)} In the game, ${SIM_SIGNAL} pulls the ${c.S} foot up ` +
      'at the ankle (tibialis anterior) or points it down (gastrocnemius and soleus). The foot zone is made of rings ' +
      '(concentric). The toes are in the middle, and the ankle, knee and hip form rings around them (Gordon 2023). So ' +
      'these leg areas overlap. They do not sit in a neat line (strict line).'
  }),
  knee: c => ({
    detail: `This is the knee area for your ${c.S} leg. It sits near the top edge of ${BRAIN_HALF(c)}, between the ` +
      `foot and hip areas (dorsal margin). ${LEG_PATH_PLAIN(c)} In the game, ${SIM_SIGNAL} bends the ${c.S} knee ` +
      '(hamstrings) or straightens it (quadriceps). You are sitting, so your knee starts bent. The knee sits in one of the rings of the foot zone (concentric), and it overlaps the ankle and ' +
      'hip areas.'
  }),
  hip: c => ({
    detail: `This is the hip area for your ${c.S} leg, in ${BRAIN_HALF(c)}. It sits in the outer ring of the foot zone, where it meets the ` +
      `area for the trunk (trunk territory). ${LEG_PATH_PLAIN(c)} In the game, ${SIM_SIGNAL} lifts the ${c.S} thigh ` +
      '(iliopsoas and rectus femoris) or pushes it back (gluteus maximus and hamstrings). Muscles near the top of the leg ' +
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
  trunk: () => ({
    detail: 'This is the area for the belly and back muscles (trunk area; abdominal and back muscles). It sits between ' +
      'the hip and shoulder areas, and it overlaps the upper in-between area (superior inter-effector region). Muscles ' +
      'along the middle of the body (axial muscles) get signals from both halves of the brain (corticospinal input from ' +
      'both hemispheres; erector spinae: Ferbert 1992). So in the game, the trunk area in either half moves the whole ' +
      'trunk. A made-up signal (simulated) bends the body forward (rectus abdominis and obliques) ' +
      'or leans it back (erector spinae columns). Tightening the belly also switches on the in-between areas (abdominal ' +
      'contraction co-activates the inter-effector regions; Gordon 2023). Penfield’s maps had too few trunk tests to ' +
      'measure this area (stimulations; Catani 2017). Breathing and posture are not modelled.'
  }),
  shoulder: c => (c.H === 'right' ? {
    detail: 'This is the shoulder area for your LEFT arm. It sits at the inner edge of the arm and hand zone in the ' +
      'brain’s right half (medial edge, right hemisphere). Most of its signals cross to the other side (crossed ' +
      'corticospinal fibres dominate). Muscles near the body, such as the shoulder cap muscle, also get weaker signals ' +
      'from the same side (same-side input to proximal muscles such as the deltoid; Bawa 2004). In NeuroSurge, your look ' +
      'and the W/A/S/D keys already move the left shoulder. So looking here lights up and marks the area, but it adds no ' +
      'separate movement. Brain stimulation rarely moves the shoulder on its own (isolated shoulder movement; Gordon ' +
      '2023). The 3D model also has no chest, wide back or upper back muscles (no pectoralis, latissimus or trapezius ' +
      'meshes). So the game does not show the shoulder muscles joining in as if it were measured (shoulder recruitment, ' +
      'measured activation).',
    noAction: 'Your look and the W/A/S/D keys move the left shoulder (the reach lane). It has no separate look action ' +
      '(gaze action), so looking here only lights up and marks the area.'
  } : {
    detail: 'This is the shoulder area for your RIGHT arm. It sits at the inner edge of the arm and hand zone in the ' +
      'brain’s left half (medial edge, left hemisphere). Most of its signals cross to the other side (crossed ' +
      'corticospinal fibres dominate). Muscles near the body also get weaker signals from the same side (same-side ' +
      `input to proximal muscles; Bawa 2004). In the game, ${SIM_SIGNAL} raises the right arm forward (front deltoid, ` +
      'pectoralis major, coracobrachialis) or out to the side (middle deltoid, supraspinatus). Look far right to see ' +
      'it. The areas for the upper and lower arm overlap (proximal and distal arm representations; Devanne 2006). Brain ' +
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
      'brachii). That is the same flip a double-tap of Space makes. In the brain, turning the forearm shares overlapping ' +
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
      'carpi radialis and ulnaris) or bending back (extension: the three wrist extensors). In the brain, the wrist area ' +
      'overlaps the fingers and shows up on both sides of the hand zone (wrist representation; Meier 2008; Gordon 2023). ' +
      'But this strip runs in only one direction (one-dimensional), so it shows only the upper part (dorsal part). Maps of ' +
      'the forearm muscles also peak in different places for different tasks (task-specific peaks; Masse-Alarie 2017).'
  } : {
    detail: 'This is the wrist area for your RIGHT hand, in the brain’s left half (left hemisphere). It sits between ' +
      `the forearm-turning area and the hand area. ${ARM_PATH_PLAIN('the wrist muscles')} In the game, ${SIM_SIGNAL} ` +
      'bends the right wrist toward the palm (flexing: flexor carpi radialis and ulnaris) or bends it back (extending: ' +
      'the three wrist extensors). In studies of the right hand, the wrist area sits on both sides of the finger area ' +
      '(the wrist emphasis brackets the fingers; Meier 2008). This strip runs in only one direction (one-dimensional), so ' +
      'it shows the wrist as one area (region).'
  }),
  hand: () => ({
    detail: 'This is the hand area for your LEFT hand (the hand knob), in the brain’s right half (right hemisphere). It ' +
      'covers whole-hand moves: grasp, release, open and spread. Its fibres cross over and reach the nerve cells for the ' +
      'hand (crossed corticospinal fibres, hand motor neurons). Some of them link straight to those nerve cells, which ' +
      'helps fine finger control (direct cortico-motoneuronal connections; Lemon 2008). In the game, looking here, or ' +
      'holding Space for a fist, drives the left-hand actions. The muscles that bend or straighten the fingers (finger ' +
      'flexors or extensors) take the same colours as the brain (colour ramp). One study measured left-hand grasp and ' +
      'pulling back in the brain’s right half (Huber 2020; grasp and retraction in the right motor cortex). It found ' +
      'overlapping patches that repeat and differ between people (repeated action patches). A real hand can also let go ' +
      'of a grip without any effort (grip release can be passive; Motawar 2012). So opening the hand when you let go of ' +
      'Space is a game rule (game convention).'
  }),
  index: () => ({
    detail: 'This is the index-finger area for your LEFT hand. It sits inside the hand zone of the brain’s right half ' +
      '(right hemisphere). Its fibres cross over and reach the nerve cells for the long muscles that bend and straighten ' +
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
      'brevis) or straightening (extension: extensor pollicis brevis) at the knuckle. One study mapped thumb directions for ' +
      'the RIGHT thumb in the brain’s left half, using magnetic pulses (TMS; Z’Graggen 2009). The directions changed ' +
      'with the situation and between people (contextual and individual biases). So this mirrored spot is only a rough ' +
      'guide (representative).'
  }),
  r_hand: () => ({
    detail: 'This is the hand area for your RIGHT hand (the hand knob), in the brain’s left half (left hemisphere). Its ' +
      'fibres cross over and reach the nerve cells for the hand (crossed corticospinal fibres, hand motor neurons). Some ' +
      `link straight to those nerve cells (direct cortico-motoneuronal connections; Lemon 2008). In the game, ${SIM_SIGNAL} ` +
      'closes or opens the right hand. Look far right to see it. Studies of the right hand in the brain’s left half find ' +
      'overlapping finger patterns (Arbuckle 2020). Even the top of the hand knob responds to the whole body (the hand ' +
      'knob crown carries whole-body tuning; Willett 2020).'
  }),
  r_fingers: () => ({
    detail: 'This is the finger area for your RIGHT hand. It sits inside the hand zone of the brain’s left half (left ' +
      'hemisphere). Its fibres cross over and reach the nerve cells for the long muscles that bend and straighten the ' +
      'fingers (crossed corticospinal fibres, motor neurons, long finger flexors and extensors). The 3D right hand has no ' +
      'separate finger joints (right-hand rig). So the game shows the whole hand curling or straightening a little ' +
      '(partial whole-hand curl). It colours the muscles that bend or straighten the fingers (finger flexors or ' +
      'extensors). In the brain’s left half, bending and straightening one finger use strongly overlapping patterns ' +
      '(single-finger flexion and extension; Arbuckle 2020).'
  }),
  r_thumb: () => ({
    detail: 'This is the thumb area for your RIGHT hand. It is the outermost part of the hand zone in the brain’s left ' +
      'half (most lateral, left hemisphere). Its fibres cross over and reach the thumb muscles (crossed corticospinal ' +
      'fibres). The 3D right hand has no separate thumb joint (right-hand rig). So the game shows the whole hand closing ' +
      'a little (small whole-hand closure), and it colours the muscles that bend the thumb (thumb flexors). One study ' +
      'mapped the right thumb’s movement directions in this half of the brain, using magnetic pulses (TMS; Z’Graggen ' +
      '2009). The directions changed with the situation and between people (contextual and individual biases).'
  }),
  neck: c => ({
    detail: `This is the neck area of ${BRAIN_HALF(c)}. The game places it after the thumb, as in Penfield’s order ` +
      '(Penfield’s motor sequence). Neck muscles get signals from both halves of the brain (both hemispheres). The big ' +
      'side-neck muscle gets fibres that cross over and fibres that do not (sternocleidomastoid: crossed and uncrossed ' +
      `projections; Thompson 1997). In the game, ${SIM_SIGNAL} bends the head forward or turns it to the ${c.S} (one ` +
      'sternocleidomastoid with the opposite splenius capitis). That is a game choice, because no one knows yet which ' +
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
      'belly of occipitofrontalis). Its fibres reach the face-nerve centre at the base of the brain (corticobulbar ' +
      'fibres, facial nucleus). The upper face gets signals from both halves of the brain (both hemispheres). That is ' +
      'why a stroke on the brain’s surface usually spares the forehead (cortical stroke; monkey tract tracing: Morecraft ' +
      '2001). The 3D body has no face muscles for expressions (BodyParts3D 4.0 has no facial-expression muscles). ' +
      `${NO_FACE_LEVEL} In brain scans, raising the eyebrows also switched on the in-between areas (fMRI; co-activated ` +
      'the inter-effector regions; Gordon 2023). So this small area is a simplified placement (schematic).'
  }),
  eyelid: c => ({
    detail: `This is the eyelid area of ${BRAIN_HALF(c)}. Here the ring muscle around the eye closes the eyes ` +
      '(orbicularis oculi). Signals to the upper face come from both halves of the brain (corticobulbar input from both ' +
      'hemispheres; Morecraft 2001, in monkeys). The 3D body has no ring muscle around the eye and no other face muscles ' +
      `for expressions (BodyParts3D 4.0 has no orbicularis oculi or other facial-expression muscle). ${NO_FACE_LEVEL} ` +
      'Opening the eyes (levator palpebrae superioris, oculomotor nerve) and blinking (blink reflexes) use separate ' +
      'circuits that are not simulated. Gordon 2023 lists eyelid movement among the moves an in-between area likes best ' +
      '(most preferred at an inter-effector centre).'
  }),
  lower_face: c => ({
    detail: `This is the lower-face area of ${BRAIN_HALF(c)}. Here two cheek muscles lift the corner of the mouth ` +
      '(zygomaticus major and levator anguli oris). Most fibres to the lower face cross to the other side (corticobulbar ' +
      `fibres are mainly crossed; Morecraft 2001, in monkeys). So the ${c.S} mouth corner gets most of the signal from ` +
      'this half (this hemisphere’s drive). The 3D body has none of these face muscles (BodyParts3D 4.0 has none of these ' +
      `facial-expression muscles). ${NO_FACE_LEVEL} This only covers smiling on purpose (voluntary smiling). A smile from ` +
      'feelings also uses other pathways (emotional smiling, separate pathways).'
  }),
  lips: c => ({
    detail: `This is the lip area of ${BRAIN_HALF(c)}. Here the ring muscle around the mouth purses the lips ` +
      '(orbicularis oris). Its fibres reach the face-nerve centre at the base of the brain (corticobulbar fibres, facial ' +
      'nucleus). For the lower face, most of them cross over (crossed predominance; Morecraft 2001). The 3D body has no ' +
      `shape for the ring muscle around the mouth (BodyParts3D 4.0 has no orbicularis oris mesh). ${NO_FACE_LEVEL} ` +
      'Moving the lips is a classic landmark in brain-scan body maps (fMRI motor somatotopy; Lotze 2000). Speech uses ' +
      'this area together with the jaw, the tongue and the voice box (larynx).'
  }),
  jaw: c => ({
    detail: `This is the jaw area of ${BRAIN_HALF(c)}. It opens the mouth (lateral pterygoid, digastric) or clenches ` +
      'it (masseter, temporalis). Fibres from both halves of the brain reach the chewing-nerve centre at the base of the ' +
      'brain (corticobulbar fibres, trigeminal motor nucleus, both hemispheres). But the half on the other side sends the ' +
      'stronger signal to the main chewing muscle (the crossed hemisphere has the stronger drive to the masseter; ' +
      'Nordstrom 2007). In the game, opening swings the jaw on the see-through face layer (ghosted face layer) and colours ' +
      'two muscles under the chin (digastric and mylohyoid). The 3D body has no shape for the clenching muscles ' +
      '(the jaw-closing muscles masseter, temporalis and medial pterygoid, and the lateral pterygoid, have no BodyParts3D 4.0 mesh). So clenching shows no movement and no ' +
      'colour. The chewing rhythm comes from the base of the brain (generated in the brainstem), and it is not modelled.'
  }),
  tongue: c => ({
    detail: `This is the tongue area of ${BRAIN_HALF(c)}. It sits in the middle of the mouth zone (Gordon 2023). Here ` +
      'the main tongue muscle pushes the tongue out (genioglossus). Fibres from both halves of the brain reach the ' +
      'tongue-nerve centre at the base of the brain (corticobulbar fibres, hypoglossal nucleus, both hemispheres). The ' +
      'tongue muscle on the other side responds to weaker magnetic pulses in brain tests (lower thresholds from the crossed side; Muellbacher 2001). The 3D body has ' +
      'no tongue, and the tongue muscle has no shape (the rig has no tongue; genioglossus has no mesh). So, by a game rule, ' +
      'the jaw opens a little and nothing is coloured (game convention). Swallowing and the voice box (larynx) are not ' +
      'modelled.'
  }),
  scan_inferior: c => ({
    detail: `This is the lower in-between area (inferior inter-effector region). ${SCAN_NETWORK} It is the lowest of ` +
      `the three (most ventral), past the mouth zone of ${BRAIN_HALF(c, 'Gordon 2023, seed 6 of the dorsal-to-ventral line')}. ` +
      'Gordon lists swallowing among the moves the in-between areas like best (most preferred at inter-effector ' +
      'centres). But a vowel-sound task for the voice box stayed inside the mouth zone (laryngeal vowel task). In the ' +
      'game, looking here lights up and marks the area, but it moves nothing. Swallowing, breathing and the voice box ' +
      '(larynx) are not simulated.',
    noAction: `${SCAN_WEAK} The 3D body has no parts for swallowing and no voice box (swallowing and larynx are not in ` +
      'the rig), so the game moves nothing here.'
  })
};

const NECK_CHOICE_PLAIN = 'This is a game choice: each half of the brain turns the head toward the other side (each ' +
  'hemisphere, opposite side). Which half really drives head turning is not known (unresolved).';
/** Action plain notes (restating `note`), keyed like PLAIN_ACTION. */
// R4-fix (review SL4-1): the body sits (round 4): knees bent about 45 deg, the right elbow bent about 85 deg on the
// armrest, the right palm mostly down. These notes said the round-3 standing pose "starts out straight".
const PLAIN_NOTE = {
  knee_extend: () => 'Your knee starts bent (you are sitting), so this straightens your lower leg with the front thigh ' +
    'muscles (quadriceps). Muscle force without movement is not modelled (isometric force).',
  r_elbow_extend: () => 'Your right elbow starts bent on the armrest, so this straightens it with the muscle at the back ' +
    'of the arm (triceps).',
  pronation: () => 'The three forearm-turning muscles (pronator teres, pronator quadratus and supinator) are not in the ' +
    'game’s movement map (no catalog key in MOVEMENT-MAP r2; ns-assets maps them to null). While the forearm turns, the ' +
    'game colours these three 3D muscles by name, in the same colours (simulated display level; meshes). They are not ' +
    'movement-map muscles.',
  supination: () => 'The biceps turns the palm up strongly, mainly when the elbow is bent (biceps brachii is a powerful ' +
    'supinator mainly when the elbow is flexed; UAMS).',
  r_supinate: () => 'Your right palm starts facing mostly down (mostly pronated), so this turns it up.',
  grasp_close: () => 'The muscles that straighten the fingers are listed as working less, as in the movement map ' +
    '(extensors listed as relatively reduced, as in MOVEMENT-MAP r2). But a strong grip can switch them on too (strong ' +
    'power grip can co-activate extensor digitorum; Motawar 2012; map-delta D07). So the game shows them as not raised, ' +
    'rather than switched off (not elevated rather than suppressed).',
  relax_release: () => 'Letting go lowers the signal to the muscles that bend and straighten the fingers (flexor and ' +
    'extensor drive). It is not an active straightening, and the brain does not go quiet (not active extension and not ' +
    'cortical silence; Motawar 2012).',
  open_hand: () => 'Opening the hand when you let go of Space is a game rule (game convention). A real hand can let go ' +
    'without any effort (natural release can be passive).',
  r_fingers_curl: () => 'The 3D right hand moves all its fingers and the thumb together (the right-hand rig moves all ' +
    'digits together). So this is the whole hand closing a little (partial whole-hand closure).',
  r_fingers_straighten: () => 'The 3D right hand moves all its fingers and the thumb together (the right-hand rig moves ' +
    'all digits together).',
  r_thumb_close: () => 'The 3D right hand has no separate thumb joint (right-hand rig). So this shows as the whole hand ' +
    'closing a little (small whole-hand closure).',
  neck_turn_left: () => NECK_CHOICE_PLAIN,
  neck_turn_right: () => NECK_CHOICE_PLAIN,
  eye_close: () => 'The muscle that lifts the eyelid (levator palpebrae superioris) gets its signals through a different ' +
    'nerve (the oculomotor nerve, a separate pathway).',
  smile: c => 'The 3D body has no shape for these muscles (BodyParts3D 4.0 has no mesh for them). The smile is only a ' +
    `made-up level (a simulated display level), and nothing moves or is coloured. The ${c.S} side would get most of the ` +
    'signal from this half (this hemisphere’s drive).',
  jaw_clench: () => 'The clenching muscles have no 3D shape (masseter, temporalis and the medial pterygoid have no ' +
    'BodyParts3D 4.0 mesh). The jaw is also already closed at rest. So clenching shows no movement and no colour. Bite ' +
    'force is not modelled.',
  tongue_out: () => 'The 3D body has no tongue, and the main tongue muscle has no shape (the body rig has no tongue; ' +
    'genioglossus has no BodyParts3D 4.0 mesh). So the jaw opens a little (game convention) and nothing is coloured.'
};

// ---------------------------------------------------------------------------------------------
// Build

function buildRegions() {
  const out = [];
  for (const [hemisphere, seq] of [['right', RIGHT_HEMI_SEQUENCE], ['left', LEFT_HEMI_SEQUENCE]]) {
    const c = ctxFor(hemisphere);
    seq.forEach((key, order) => {
      const body = CONTENT[key](c);
      const { core, extent, centre } = LAYOUT[hemisphere][key];
      const actions = body.actions.map((a, i) => {
        const uCentre = a.armActionId
          ? LEFT_ARM_ACTION_U[a.armActionId]
          : Number((core[0] + ((i + 1) / (body.actions.length + 1)) * (core[1] - core[0])).toFixed(4));
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

/** The whole-body motor map (agreed schema; deep-frozen). */
export const BODY_MOTOR_MAP = deepFreeze({
  version: 'ns-bodymap-r1 (S1-bodymap, 2026-11-08)',
  caveats: CAVEATS,
  caveatCitationKeys: ['PENFIELD1937', 'CATANI2017', 'GORDON2023', 'DEO2026', 'WILLETT2020', 'RADEMACHER2001', 'LEMON2008', 'BAWA2004', 'MORECRAFT2001', 'BODYPARTS3D'],
  citations: CITATIONS,
  conventions: {
    u: "Fraction of each precentral mesh's |x| span (ns-brain.stripParam): 0 = most medial (medial-wall portion), 1 = most lateral/ventral. Geometric, not registered.",
    order: '0 = most medial/dorsal region of that hemisphere, increasing laterally; equals the index in the hemisphere sequence.',
    centre: 'Representative region position (u). Equals the extent midpoint.',
    core: 'Nearest-centre cell: a non-overlapping control partition per hemisphere tiling [0, 1]; use it for gaze picking and region borders. It equals the ns-brain regionOwnerAt rule (nearest extent centre among containing extents).',
    extent: 'Overlapping display field, symmetric about the centre and covering the whole core plus an overlap margin; use it for soft activity spread. Overlap is intentional.',
    joints: 'Degrees from the BodyParts3D source pose (anatomical position); see JOINT_SEMANTICS. Left-arm actions have joints {} and use armActionId.',
    laterality: 'right hemisphere -> left body side; left hemisphere -> right body side; bodySide midline marks bilateral/axial effectors.',
    surface: 'The visible crown is largely BA6 (premotor); BA4 lies mostly in the anterior bank of the central sulcus and is not shown separately.',
    simplifications: 'One region per effector on a 1-D strip: the ventral repeats of the concentric hand zone (wrist/elbow/shoulder below the hand) are not drawn; the supplementary motor area and swallowing/larynx are not represented.'
  },
  regions: buildRegions()
});

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

/** Frozen regions of one hemisphere ('right' | 'left') in medial -> lateral order. */
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
 * actions (inter-effector regions and the left shoulder). */
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
  'clavicular', 'acromial', 'spinal', 'sternal', 'sternocostal', 'abdominal', 'costal', 'humeral', 'ulnar', 'radial',
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
