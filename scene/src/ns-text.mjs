// NeuroSurge plain UI text (round 3, R3-text, 2026-11-08). The single source of user-visible wording.
//
// Why: the user asked (R17, exact): "the language should be such that it's pretty explanatory. It's pretty simple so
// that anyone can understand. We're not trying to go extremely jargonistic or terminological or technical here."
// Lead decision D3: default visible text targets a curious 12-year-old: short sentences, everyday words, technical terms
// only in brackets after a plain phrase or inside a collapsed "More detail".
//
// A pure module: no DOM, no imports, importable in Node. Every object is deep-frozen.
// Conventions:
//  - Plain defaults may name a technical term ONLY inside round or square brackets, after a plain phrase
//    ("palm down (pronated)"). Technical text that does not fit that rule lives in a `more` field or in MORE.
//  - Keys of SHELL, HUD and INFO mirror the existing ns-app SHELL_TEXT, HUD_TEXT and INFO_TEXT keys, so ns-app can take
//    them over one to one; new keys are additive. ORBIT, LEGEND, FACE and the group labels mirror ns-scene-three.
//  - Honesty is never weakened, only said more plainly: everything shown is simulated and has no real units (unitless);
//    looks, clicks and keys are virtual inputs, not stimulation or decoding; muscle colours are not EMG, and EMG is not
//    nerve activity or force; maps overlap and vary between people (Gordon et al., 2023 refine Penfield); no exact
//    point per muscle; the left arm is moved mainly by the right half of the brain (right hemisphere); NeuroTranslate 0.0
//    is only a model name, not a validated decoder.
//  - The e2e honesty regexes (e2e/requirements.e2e.mjs HONESTY, OVERCLAIM, CONTROL_TOPICS, INFO_TOPICS) are met by the
//    plain wording itself (tests/unit/R3-text-honesty.test.mjs runs them on this module).
//
// Round 5 (R5-text, 2026-11-09; the user's overhaul of 2026-11-08T21:54Z, R19-R24): wording for the E key (third person,
// VIEW), the 3D compass arrows round the brain and the mirror body (ARROWS; the round-4 ORBIT captions stay for the HUD
// buttons until they are retired), the mirror body (MIRROR, mirrorInfoCard), the brain-to-muscle glow (GLOW, glowNote),
// the lifted outer muscles (BODY_WORLDS), the face and chewing muscles (FACE_R5, faceLayerText, faceAttributionLine)
// and the new "Try this" goals (GUIDE). SHELL now lists every round-5 feature; shellText(features) leaves out the items
// of a feature that is not in the build, so the Esc page never describes something the player cannot do.
// New honesty, said plainly: the glow is a picture of which muscles an area drives in this game, not a nerve (real
// signals go from the brain down the spinal cord, or from the base of the brain for the head, and along nerves); the
// outer muscles really lie flat on the deeper ones; the mirror body is a picture that copies your body, not a second
// person or a sensor.

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

export const TEXT_VERSION = 'ns-text-r5 (R5-text, 2026-11-09)';

/* ------------------------------------------------------------------ honesty lines (structured) */

/** The honesty statements, each as a short plain line plus the technical wording (`more`). `id` matches the e2e
 * HONESTY ids where one exists. These are the building blocks of SHELL.limits, INFO.caveats and HUD.limitsShort. */
export const HONESTY = deepFreeze({
  simulated: {
    // R4-text: one short sentence added, saying plainly what is NOT made up (Flesch 64.9 -> 72.4). Both pinned phrases
    // ("brain signals and muscle activity are made up", "3D anatomy model") are unchanged.
    id: 'H1-simulated', plain: 'The brain signals and muscle activity are made up by the computer (simulated). The body ' +
      'shapes are not. The bones and muscles come from a 3D anatomy model.',
    more: 'All activity in NeuroSurge is simulated.'
  },
  unitless: {
    id: 'H2-unitless', plain: 'The numbers go from 0 to 1 and have no real units (unitless).',
    more: 'Values are unitless display levels from 0 to 1.'
  },
  virtualInputs: {
    id: 'H3-not-stimulation-or-decoding',
    plain: 'Your looks, clicks and keys are just game controls (virtual inputs). They do not send signals into a real ' +
      'brain or read signals from one (not real stimulation or neural decoding).',
    more: 'Gaze, clicks and keys are virtual inputs; nothing here is stimulation or decoding.'
  },
  emg: {
    id: 'H7-EMG',
    // R4-text: split into three short sentences (Flesch 69.8 -> 76.3); the pinned "EMG itself is not nerve activity
    // or force" is unchanged.
    plain: 'Muscle colours show the game’s made-up signal. They are not real muscle readings (EMG). And EMG itself is ' +
      'not nerve activity or force.',
    more: 'Muscle colour shows the simulated drive, not EMG; EMG is not nerve activity or force.'
  },
  overlapVary: {
    id: 'H5-overlap-and-vary',
    // R4-text: "the body-part areas" -> "the areas for each body part" (Flesch 63.2 -> 71.3); the pinned phrase
    // "overlap and vary between people" is unchanged.
    plain: 'In real brains, the areas for each body part overlap and vary between people. Newer maps (Gordon et al., ' +
      '2023) add detail to the old “little man” map (Penfield’s homunculus).',
    more: 'Motor representations overlap and vary between people; contemporary maps (Gordon et al., 2023, Nature: ' +
      'inter-effector regions) refine Penfield’s homunculus.'
  },
  notExact: {
    id: 'H6-no-exact-point', plain: 'The coloured areas are a simplified map. They are not exact points for each muscle.',
    more: 'The areas are representative, not an exact cortical point per muscle.'
  },
  leftArmRightHalf: {
    id: 'H9-contralateral',
    plain: 'Your left arm is moved mainly by the right half of the brain (right hemisphere). Each half mainly moves the ' +
      'arm and leg on the other side. The belly, back, neck, forehead and eyelids get signals from both halves.',
    more: 'The left upper limb is driven predominantly by the contralateral (right) hemisphere.'
  },
  notDecoder: {
    id: 'model-name',
    // R4-text: "only" -> "just" and one short closing sentence (Flesch 61.3 -> 73.2); the pinned "No trained or
    // validated translation model" is unchanged.
    plain: 'NeuroTranslate 0.0 is just the name of a research model. No trained or validated translation model runs ' +
      'in this game. Nothing here reads real brains.',
    more: 'NeuroTranslate 0.0 is the companion model name only; it is not a validated decoder.'
  },
  crown: {
    id: 'crown-note',
    plain: 'The coloured band is a simplified strip along one brain fold (the precentral gyrus). Its visible top is ' +
      'thought to be mostly a planning area (premotor cortex, BA6). The main movement area (primary motor cortex, ' +
      'BA4) lies mostly in the front wall of the groove just behind it (the central sulcus), which is not shown.',
    more: 'The visible crown of the precentral gyrus is thought to be largely premotor (BA6); most primary motor cortex ' +
      '(BA4) lies in the anterior bank of the central sulcus, which is not shown separately.'
  },
  // R558 (genuine note R26: "no floating face at the top"): the separate own-face display is gone; the face is on the
  // mirror body, and on your own head when you look from behind. R558 (the user's notes of 2026-11-10; ns-scene-three
  // FIRST_PERSON_BODY): the ordinary view draws only what is in front of your face. R558 (notes of 2026-11-11): the
  // picture is taken from between the eyes, the whole body is solid, and the body sits with every limb straight forward.
  face: {
    id: 'face-layer',
    plain: 'Through your own eyes you cannot see your face, head, neck or back. Look at the mirror body to see them: ' +
      'it copies yours. Or press E to see yourself from behind.',
    // 18 November 2026 (SMALL, audit S19): the body lies back as on a sofa, its arms along its thighs.
    more: 'The ordinary view is taken from between your eyes, so your own head is behind the picture. You lie ' +
      'back as on a sofa: your arms rest beside your thighs, your legs lie straight ' +
      'out in front of you, side by side, and your chest is below you. The mirror body shows the same face, chewing, neck and trunk muscles, and ' +
      'the view from behind (E) shows your whole body with the head in place.'
  },
  // R558 (user Message 20, builder FA): the completed skull and eyes, and the scalp muscles drawn lying on that skull.
  skull: {
    id: 'skull-eyes',
    plain: 'The back of the skull and the eyes come from the same anatomy set as the other bones. The scalp muscles ' +
      'come from a second atlas whose skull is a little smaller, so they are drawn moved out onto the bone, by up to ' +
      'about 9 mm. In a real head they lie right on the skull.',
    more: 'The parietal, occipital and sphenoid bones and the sclera, iris and lens of each eye are BodyParts3D meshes ' +
      '(CC BY 4.0, unchanged files). The Z-Anatomy scalp muscles (occipital belly, temporoparietalis, upper temporalis) ' +
      'were fitted to the frontal, temporal and facial bones; where they would lie inside the parietal or occipital bone ' +
      'they are drawn lifted onto its outer surface (display only, in memory; their shape and thickness are kept).'
  },
  // R558 (genuine note R31): what a tap on a muscle does and does not show.
  muscleTap: {
    id: 'muscle-tap',
    plain: 'Clicking a muscle switches on the game’s whole motor area for that body part, the same one you can look ' +
      'at. It does not show an exact spot of a real brain for that one muscle.',
    more: 'The link from a muscle to a motor area is read from the same rough map the game uses in the other direction. ' +
      'Real motor cortex has overlapping zones that vary between people; one muscle does not have one point.'
  },
  // R5-text (D17, user R21): the glow is a picture of the game's area-to-muscle link, never a nerve path.
  glow: {
    id: 'glow-not-nerve',
    plain: 'The shared colour and the cone of light between a brain area and its muscles are only a picture. They show ' +
      'which muscles that area drives in this game. The colours are a code for the game, not a measurement, and the ' +
      'light is not a nerve. Real signals travel from the brain down the spinal cord and along nerves to the muscles. ' +
      'For the head and face, they leave from the base of the brain.',
    more: 'The area colours and the glow link display the simulated area-to-muscle mapping, not a pathway or a light ' +
      'signal (the glow only looks like light-activated tissue): real corticospinal signals reach spinal motor neurons ' +
      'and then peripheral nerves; corticobulbar signals reach cranial-nerve nuclei in the brainstem.'
  },
  // R5-text (D15, user R19): the lifted outer muscles are a display choice; in the body they lie on the deeper layer.
  // R558: the lift is a stack (outer level, a middle level by half) and the two ends of a lifted muscle stay on the
  // bone, so the part between the end and the belly is drawn longer than it is. Where a mesh meets bone is worked out
  // from the shapes of the licensed meshes; it is not a record of measured attachments. Round 3: every muscle is also
  // drawn a little fuller (the user: "full, filled-out and plumpy"), a display choice, not measured anatomy.
  // Round 4 (Message 18): smaller lift and fill (realistic, not bodybuilder bulk); the front of the belly is drawn
  // smooth where the atlas shapes the rectus abdominis into the sheet over it. R558 (builder AN): the muscles the first
  // anatomy set lacked (latissimus dorsi, erector spinae, rectus abdominis, gracilis, ...) now come from a second licensed
  // set (packets/missing-muscles-r1); the text names where they come from and the few muscles still not drawn.
  bodyWorlds: {
    id: 'body-worlds',
    plain: 'The outer muscles are lifted out a little, like in a Body Worlds exhibit. That lets you see the deeper ' +
      'muscles under them. Their ends stay on the bones, so the ends are drawn longer than they really are. Every ' +
      'muscle is also drawn a little fuller than the atlas shape. In a real body, the outer muscles lie right on top ' +
      'of the deeper ones. The back, belly, hip, inner-thigh and outer-shin muscles that the first anatomy set lacked ' +
      '(latissimus dorsi, the long back muscles, rectus abdominis, the inner belly muscles, gracilis, the adductors, ' +
      'the deep hip muscles, the fibularis muscles and others) come from a second licensed set. A few small deep ' +
      'muscles are still not drawn.',
    // 22 November 2026 (WORDS2, second pass): the honesty of the lift in two sentences, for the Esc page's limits; the
    // list of the second licensed set's muscles is on the notes page.
    short: 'The outer muscles are lifted out a little and every muscle is drawn a little fuller, like in a Body Worlds ' +
      'exhibit, so you can see the deeper ones. In a real body the outer muscles lie right on top of the deeper ones.',
    more: 'Superficial muscles are displaced outward from the long axis of their limb segment or of the trunk (up to ' +
      '20 mm on the thigh, 16 mm on the trunk), and a middle layer by half as much (display only), so that deep ' +
      'muscles show in the gaps; in the body they lie directly on the deep layer. The parts of a lifted muscle that ' +
      'touch bone at its two ends are not moved, and the tissue between is stretched, so it is drawn longer than it ' +
      'is. Every muscle is also drawn up to about 1.6 mm fuller along its surface (display only; never on its ' +
      'attachment ends, and never out through a muscle lying on it). The flat tendon sheets of the obliques that ' +
      'cover rectus abdominis (the front of its sheath) are not drawn, as if the sheath were opened in a ' +
      'dissection, so rectus abdominis shows (the white strip between the two, the linea alba, stays); without the second set the external oblique\'s sheet is drawn smooth ' +
      'near the midline, because the atlas shapes the segments of rectus abdominis into it. Where a muscle meets bone is ' +
      'estimated from the shapes of the meshes; it is not a measured attachment. The muscles added from the second ' +
      'set (packets/missing-muscles-r1) are unchanged BodyParts3D 4.0 files and, where BodyParts3D has none ' +
      '(latissimus dorsi, rectus abdominis, the internal oblique, transversus abdominis, quadratus lumborum, longus ' +
      'colli, extensor digitorum brevis and flexor hallucis brevis), Z-Anatomy shapes placed on this body by one ' +
      'fitted transform (the two short foot muscles with one more rigid correction for each foot); they lie within a ' +
      'few millimetres of where this atlas would put them. Still not drawn: multifidus and the other small deep ' +
      'spine muscles, the suboccipital muscles, subclavius, most small muscles of the sole, the pelvic floor, the ' +
      'diaphragm and the muscles between the ribs.'
  },
  // R5-text (D19, user R23): the mirror body copies the simulated body; it is a picture, not a person or a sensor.
  mirror: {
    id: 'mirror-picture',
    plain: 'The mirror body is only a picture. It copies your body’s moves and made-up colours at the same time. It is ' +
      'not a second person, and nothing is measured from it.',
    more: 'The mirror body is a reflected copy of the simulated pose and display activity; it is not a second subject, a ' +
      'sensor or a recording.'
  }
});

/** e2e ids that the always-visible limits pill must carry (core honesty items H1-H4). */
export const CORE_HONESTY_IDS = Object.freeze(['H1-simulated', 'H2-unitless', 'H3-not-stimulation-or-decoding', 'H4-virtual-inputs']);

/* ------------------------------------------------------------------ brand */

export const BRAND = deepFreeze({
  name: 'NeuroSurge',
  /** What the game is, in one plain line. */
  // R4-fix (review SL4-3): "everything in it is made up" also called the CC BY anatomy (real 3D bone and muscle shapes)
  // invented; the made-up parts are the brain signals and the muscle activity.
  tagline: 'A first-person game about how your brain moves your body. The brain signals and muscle activity in it are ' +
    'made up by the computer (simulated).',
  /** The model-name rule, always with its not-validated qualifier. */
  modelName: 'NeuroTranslate 0.0 is just the name of a model. It does not read real brains (not a validated decoder).'
});

/* ------------------------------------------------------------------ game shell: start instructions and Esc page */

/* Round 5 (R5-text): the start/Esc page steps, controls and limits as tables. An entry (or a part of a step) with `need`
 * belongs to one round-5 feature; SHELL lists everything (the round-5 build), shellText(features) leaves out what a build
 * does not have. Feature names (ROUND5_FEATURES): thirdPerson (E, D18), mirror (D19), glow (D17), bodyWorlds (D15),
 * compassArrows (the 3D arrows, D16), faceMuscles (D20), mirrorResetButton (a separate "Reset mirror body" button
 * instead of Reset brain view also turning the mirror body back). */
const part = (text, need = null) => ({ text, need });
// 22 November 2026 (WORDS2, hunt H15; the owner: "Way too much text now"; "Things should be chunked together and those
// chunks should be spaced away from each other"): the full instructions ("Show the full instructions" on the Esc page)
// were about 3,400 words: these steps 1,500, the controls 890, the limits 620, and the steps said most controls a second
// time in other words. Now each step says what a thing IS in two to four short sentences, and each control is said ONCE,
// in the Controls list below. The step "Move other body parts." also said that Space on your own limb lets you carry it,
// and six sentences later that Space there chooses the limb (ns-app LIMB_KEYS.view.hold: it chooses, nothing holds it).
// Heads: "Your left arm." is "Your limbs." (the step is about all four), "The glass brain." is "The brain." (drawn solid
// since 17 November), "Move other body parts." is "Hold and carry.". The short `intro` words (the start page) are as
// they were. The older words are in DESIGN-DECISIONS section 167 and the history of this file.
const STEP_TABLE = [
  // 20 November 2026: a look turns the head and neck and then the eyes; it no longer turns the chest or bends the trunk
  // (ns-app LOOK_BENDS_TRUNK false since 19 November, headPoseForLook).
  { head: 'Look around.', parts: [part('You see through the eyes of a body that lies back in one place, as on a sofa. It has no skin, just ' +
    'bones and muscles. Drag on empty space to look around. As you look, the head and neck turn, and past their reach the eyes turn further.')],
  intro: [part('Drag on empty space to look around. Your body shows its bones and muscles.')] },
  // 19 November 2026 (the view holds the chosen limb, ns-app LIMB_KEYS.view; in the eye view only: holdCarries)
  { head: 'Your limbs.', parts: [part('One limb is always the chosen one: your left arm at the start. Press 1, 2, 3 or 4 to choose ' +
    'your left arm, left leg, right leg or right arm. In the eye view, look a little up or down to move it at the shoulder or hip. ' +
    'W, A, S and D move its hand or foot. Use the pointer to keep the limb in view.')],
  intro: [part('Keys 1 to 4 choose a limb; in the eye view it goes with your view, and W, A, S and D move its hand or foot. Tap Space twice: all four limbs turn once. Tap twice and hold: they keep turning, slowly.')] },
  // R558 (Messages 2 and 56; 19 November 2026, the brain turned half a turn): what the band is, which way the brain faces
  // and that each half mainly moves the other side (HONESTY.crown and HONESTY.leftArmRightHalf say both in full).
  { head: 'The brain.', parts: [
    part('A giant brain floats in front of you. Its coloured band is the motor strip: a simplified map of the areas that ' +
      'send movement signals to muscles. You see it from above, turned to face you: its front is at the bottom, so the ' +
      'brain’s right half is on your left. Each half mainly moves the other side of your body. When an area switches on, ' +
      'it and the muscles it moves glow in its colour, on your body and on the mirror body.'),
    part('A cone of light in that colour joins them (a picture, not a nerve).', 'glow')],
  intro: [part('The coloured band across the brain is the motor strip (a simplified map). The brain faces you (its eyeballs ' +
    'are at the bottom), so its right half is on your left. Each half of the brain mainly moves the opposite side of your ' +
    'body: the areas on your left move your left side. Each motor area has its own colour: switched on, it and its muscles glow in that colour.'),
    part('A cone of light in that colour joins them (a picture, not a nerve).', 'glow')] },
  // R558 (Message 56): the order of the body along the strip (ns-bodymap order), then the colour families.
  { head: 'A map of the body.', parts: [
    part('Along the strip, from the top middle of the brain down each side: leg (toes to hip), trunk, arm (shoulder to ' +
      'thumb), neck, face, tongue and throat. Blues: left arm. Oranges: right arm. Purples: left leg. Yellows: right leg. ' +
      'Greens: belly and back. Pinks: face and neck. Black in-between areas move nothing. This is the simple textbook ' +
      'order; real areas overlap.')],
  intro: [part('Along the strip, from the top middle of the brain down each side: leg (toes to hip), trunk, arm (shoulder ' +
    'to thumb), neck, face, tongue and throat. Blues: left arm. Oranges: right arm. Purples: left leg. Yellows: right leg. ' +
    'Greens: belly and back. Pinks: face and neck.')] },
  // 20 November 2026 (the owner, Message 206: "no permanent movements ... it will contract, then return to its previous
  // place"); the look switches an area on, a click repeats it.
  { head: 'Switch areas on.', parts: [part('Rest your look on a motor area to move its body part. Click to repeat the movement. ' +
    'The part contracts, then goes back to where it was, unlit: a rule of this game, not something measured. Click a ' +
    'muscle on either body to switch on its motor area.')],
  intro: [part('Rest your look on a motor area and its movement happens at once: the part contracts, then returns to where it was. Click to do it again. The arrow keys step to the next area.')] },
  // 20 November 2026 (Message 204): Space grips with all four limbs; 19 November (LIMB_KEYS.view.hold): Space on your own
  // limb chooses it; ns-app LIMB_PUSH and LIMB_BLOCK (sections 174, 185, 194, 195): the moved limb pushes the others and
  // stops against one that cannot give way (hunt H3); ns-reference-graph CARRY_THROUGH: a carried thing goes through anything.
  { head: 'Hold and carry.', parts: [part('Space takes hold of the brain or the mirror body; turn your view to carry it. ' +
    'A carried thing goes through you and through anything. Space on one of your own limbs only chooses that limb. ' +
    'Press on a limb and drag to turn or bend it. The limb you move pushes your other limbs aside and stops against ' +
    'one that cannot give way; it can sink in a few centimetres first.')],
  intro: [part('Other body parts respond through the brain. Hold or tap Space to take hold. Move the pointer or press W/A/S/D to carry what you hold. Hold Shift as you press to reach the other thing in line.')] },
  // R5-text (D16, user R20 "I don't want them to be curved"): no "curved" arrows.
  { head: 'Turn the brain.', parts: [
    part('Press on the brain and drag to turn it, or click or hold one of the four grey arrow tips round the motor ' +
      'strip. The brain turns in place. Turn it to one side to see the lowest face areas (the tongue).', 'compassArrows'),
    part('Click or hold an arrow by the brain to turn the brain in place.', '!compassArrows')],
  intro: [part('Press on the brain and drag to turn it, or click or hold one of its four arrow tips.', 'compassArrows'),
    part('Click or hold an arrow by the brain to turn the brain in place.', '!compassArrows')] },
  { head: 'See your body.', parts: [
    part('Look down to see your trunk, your legs and your feet. Your face and back are on the mirror body: it copies yours.'),
    // R5-text (D15, user R19).
    part('The outer muscles are lifted out a little, like in a Body Worlds exhibit, so you can see the deeper ones.', 'bodyWorlds'),
    part('The “What is happening” card explains each area you look at or click.')],
  intro: [part('Your right arm reaches forward at the lower right. Look down for your legs and feet. Your face and back are on the mirror body.'),
    part('The outer muscles are lifted a little to show the deeper ones.', 'bodyWorlds')] },
  // R5-text (D18, user R22).
  { head: 'See your back.', need: 'thirdPerson', parts: [part('Press E to see your body from behind (third person). ' +
    'Press E again to go back to your own eyes.')],
  intro: [part('Press E to see your back (third person). Press E again to go back.')] },
  // R558 (user: "a 1:1 perpendicular perfect reflection"; Message 45: all four arrows orbit).
  { head: 'The mirror body.', need: 'mirror', parts: [part('In front of you sits a mirror image of your body, as in a ' +
    'real mirror. It copies everything your body does. Click its muscles, hold Space on it to carry it, or drag it or ' +
    'use its green arrow tips to turn or tilt it.')],
  intro: [part('The mirror body copies you, like a real mirror. Click its muscles. Hold Space on it to carry it, or drag it round.')] }
];
// 22 November 2026 (WORDS2, hunt H15): every control once, in a few words. Merged: the "Look" row into "Mouse /
// trackpad", "Double-tap and hold" into "Double-tap Space". The words below are checked against ns-app and ns-controls
// as they are on this date: LIMB_KEYS (1 to 4, the double click, the view carrying the limb in the eye view), the
// limb's keys along its line (section 145, hunt H22), the press and drag on a limb and the right wrist (section 183),
// SPACE_GRIP (Message 204), LIMB_KEYS.view.hold, CARRY_THROUGH, REACH_CODES (Shift), the arrows, E (viewAfterRelease),
// R (toggleInfoDetail: read, more, off), M (EMAP, section 192) and Esc (pausedNote: Esc again keeps the pointer free).
const CONTROL_TABLE = [
  ['Mouse / trackpad', 'drag on empty space to look around. Your head and neck turn, and past their reach your eyes turn further. As you look up or down in the eye view, the chosen limb goes with your view'],
  ['1 to 4', 'choose a limb: 1 left arm, 2 left leg, 3 right leg, 4 right arm. The chosen limb lights up.'],
  ['Double click', 'choose the next limb; keep the second click held to keep stepping'],
  ['W / S', 'W reaches the chosen limb\'s hand or foot straight out from its shoulder or hip; S draws it straight back in'],
  ['A / D', 'swing the chosen limb to your left or right without changing its bend'],
  ['Look / Click', 'rest your look on a motor area: its part contracts, then returns. Click to do it again. A click never closes a hand.'],
  ['Click a muscle', 'on your body or the mirror body: switches on the brain area that moves it'],
  ['← / →', 'step your look to the next motor area on that side (hold the key to keep stepping)'],
  ['Press and drag', 'on the brain or the mirror body: turn it. On a limb: sideways turns it, up bends and down straightens it (on your right hand it bends the wrist). That limb becomes the chosen one.'],
  ['Hold Space', 'on the brain or the mirror body: take hold. Turn your view to carry it; W and S move it farther or nearer, A and D sideways. Let go to leave it there. On one of your limbs Space only chooses it. While Space is down, both hands close and the toes curl.'],
  ['Tap Space', 'take hold and keep holding; tap again to let go'],
  ['Double-tap Space', 'all four limbs turn once: the arms turn over (palms up or down) and the legs turn the feet outward or inward. Tap twice and hold: they keep turning, slowly.'],
  ['Shift + press', 'hold Shift as you click, press Space or drag to reach the other thing on the same line of sight (the body part in front of an area, or what is behind)'],
  ['Orbit arrows', 'the grey arrow tips by the brain: click to turn the brain a little, hold to keep turning'],
  ['Mirror body arrows', 'the green arrow tips: the side ones turn the mirror body round, the top and bottom ones tilt it. Click for a step, hold to keep going.', 'mirror'],
  ['E', 'see your body from behind (third person); E again: back to your own eyes. E lets go of what Space holds.', 'thirdPerson'],
  ['R', 'read information: the full cards and the colour key, then nothing, then the short card again'],
  // 21 November 2026 (EMAP, section 192): the map key (ns-controls EMAP_CODE).
  ['M', 'the electrical map: the brain as a live scan with storms of activity, and the nerves as lines of light. It is made up by the game and drawn like a brain scan: not a recording. M again: back.'],
  ['Esc', 'pause: this page, Reset body, Reset brain view and settings. Esc again plays on with a free mouse pointer.']
];
/** R5-text: the short control words for the 2 s start page (introControls), by control key. R558 (Messages 55 and 56):
 * the Esc page opens with these short words too; its "Show the full instructions" button swaps in CONTROL_TABLE's. */
const INTRO_CONTROL_WORDS = {
  'Mouse / trackpad': 'drag on empty space to look around',
  '1 to 4': 'choose the limb W A S D move',
  'Double click': 'the next limb; hold to keep stepping',
  'W / S': 'W reaches out, S draws in; combine with A/D',
  // (21 November 2026, hunt H22: along the limb's line and a swing, as the full rows say)
  'A / D': 'swing the limb (or a held item) left or right',
  'Look / Click': 'look at an area: the part moves. Click: again.',
  'Click a muscle': 'switch on its brain area',
  '← / →': 'arrow keys: step your look to the next motor area',
  'Press and drag': 'turn the brain or mirror body; turn or bend a limb',
  'Hold Space': 'hands and feet grip; hold the brain or mirror body, look to carry it',
  'Tap Space': 'take hold and keep holding; tap again to let go',
  'Double-tap Space': 'all four limbs turn once',
  'Shift + press': 'with a click, Space or a drag: reach the other thing in line',
  'Orbit arrows': 'turn the brain in place',
  'Mirror body arrows': 'turn or tilt the mirror body',
  E: 'see your back (third person)',
  R: 'read information: more detail, hide, show',
  M: 'electrical map: see the signals travel',
  Esc: 'pause, help, Reset body, settings'
};
// 22 November 2026 (WORDS2, second pass; a check of section 197: the list held atlas detail that is not honesty): the
// honesty core only, 617 -> about 300 words. Gone from this list: the left-arm crossing (step "The brain." says it),
// the strip's crown (premotor and primary motor cortex: on the notes page and in the cards), the face note (step "See
// your body." says it), the skull and scalp offsets and the second set's muscle list (the notes page has both), and
// the muscle-click line (the "simplified map ... not exact points for each muscle" line says it, and the line shown
// after a tap says "That area drives a group of muscles, not this one alone", muscleTapLine).
const LIMIT_TABLE = [
  [`${HONESTY.simulated.plain} ${HONESTY.unitless.plain}`],
  [HONESTY.virtualInputs.plain],
  [HONESTY.emg.plain],
  [HONESTY.glow.plain, 'glow'],
  [HONESTY.notExact.plain],
  [HONESTY.overlapVary.plain],
  [HONESTY.bodyWorlds.short, 'bodyWorlds'],
  [HONESTY.mirror.plain, 'mirror'],
  [HONESTY.notDecoder.plain]
];

/** The round-5 feature names shellText / VIEW / the guide understand (see the STEP_TABLE comment). */
export const ROUND5_FEATURES = Object.freeze(['thirdPerson', 'mirror', 'glow', 'bodyWorlds', 'compassArrows', 'faceMuscles', 'mirrorResetButton']);
/** Every round-5 feature in the build except the optional separate mirror reset button (Reset brain view also turns
 * the mirror body back, as ns-mirror resetMirror is wired in round 5). */
const ALL_FEATURES = Object.freeze({ thirdPerson: true, mirror: true, glow: true, bodyWorlds: true, compassArrows: true, faceMuscles: true, mirrorResetButton: false });
const featuresOf = f => {
  const o = { ...ALL_FEATURES };
  if (f && typeof f === 'object') for (const k of ROUND5_FEATURES) if (typeof f[k] === 'boolean') o[k] = f[k];
  return o;
};
const needOk = (need, f) => (!need ? true : need[0] === '!' ? f[need.slice(1)] !== true : f[need] === true);
function stepTexts(f) {
  return STEP_TABLE.filter(s => needOk(s.need, f)).map(s => s.parts.filter(p => needOk(p.need, f)).map(p => p.text).join(' '));
}
function stepHeads(f) { return STEP_TABLE.filter(s => needOk(s.need, f)).map(s => s.head); }
function controlRows(f) { return CONTROL_TABLE.filter(r => needOk(r[2], f)).map(r => [r[0], r[1]]); }
function introStepTexts(f) {
  return STEP_TABLE.filter(s => needOk(s.need, f)).map(s => (s.intro || s.parts).filter(p => needOk(p.need, f)).map(p => p.text).join(' '));
}
function introControlRows(f) { return CONTROL_TABLE.filter(r => needOk(r[2], f)).map(r => [r[0], INTRO_CONTROL_WORDS[r[0]] || r[1]]); }
function limitLines(f) { return LIMIT_TABLE.filter(r => needOk(r[1], f)).map(r => r[0]); }

/** Same keys as ns-app SHELL_TEXT. Instructions and controls keep the words the e2e instruction check looks for
 * (mouse/trackpad, W, A, Space, double-tap, Esc, click, drag, arrow, Reset, 1 second). */
export const SHELL = deepFreeze({
  title: BRAND.name,
  subtitle: `${BRAND.tagline} ${BRAND.modelName}`,
  headings: { loading: 'Loading…', intro: 'How to play', playing: '', paused: 'Paused', error: 'NeuroSurge stopped' },
  introNote: 'This page closes by itself after 2 seconds. Click to start now. Press Esc to see it again.',
  // R4-integrator (R4-load W8): while the rest of the body still streams in, the 2 s timer has not started yet.
  introNoteLoading: 'This page closes by itself 2 seconds after your body has loaded. Click to start now. Press Esc to ' +
    'see it again.',
  pausedNote: 'Resume keeps the pointer free. Choose Capture mouse to turn the view with every mouse movement. Press Esc to release it.',
  play: 'Start now',
  resume: 'Resume (Esc)',
  resetBody: 'Reset body',
  resetBrain: 'Reset brain view',
  captureMouse: 'Capture mouse',
  reload: 'Reload page',
  bodyReset: 'Body reset: your pose, the palm turn and the marks on used areas are cleared, and your head faces straight ahead again. The brain stays where you left it.',
  // R558: shown once if the game had to put things back by itself because the view could not be drawn.
  displayRescue: 'The game could not draw that view, so it put your body, the brain and the mirror body back where they started.',
  // Input epochs (public main): more actions were waiting than the game keeps (64) after frames that could not be drawn,
  // so they were all dropped and every held key let go; the player presses again.
  inputCleared: 'The game cleared waiting actions. Release and press again.',
  /** R3-polish: one plain line under the Esc page buttons saying what the two reset buttons do. */
  // R5-text (D19): Reset brain view also turns the mirror body back to face you (ns-mirror resetMirror). With the
  // separate button (feature mirrorResetButton) shellText uses RESET_HELP.separate instead.
  // R558 (Message 55): two short sentences; how to read More detail is the R row of the controls.
  resetHelp: 'Reset body puts your whole body back the way it started and clears the marks on used areas. ' +
    'Reset brain view puts the brain back where it started, and the mirror body back where a mirror shows you.',
  brainReset: 'Brain view reset: the brain is back in its first place and angle. The mirror body is back where a mirror shows you.',
  // R5-text (D19, optional): a separate "Reset mirror body" button and its notice.
  resetMirror: 'Reset mirror body',
  mirrorReset: 'Mirror body reset: it is back where a mirror shows you.',
  instructionsTitle: 'How to play',
  // R5-text: built from STEP_TABLE (every round-5 feature on); shellText(features) gives a build's own list.
  instructions: stepTexts(ALL_FEATURES),
  /** R3-polish: a short bold lead-in for each step (same order as `instructions`), so the page can be scanned. */
  instructionHeads: stepHeads(ALL_FEATURES),
  // R5-text: the SHORT step texts for the 2 s start page (loading and intro modes), same order and heads as
  // instructions; the round-5 steps and controls made the full page taller than the screen at 1280x720 (round5/
  // R5-text-NOTES.md 4.1). R558 (Messages 55 and 56): the Esc page opens with these short texts as well, and
  // `instructions` (the full words) is one click away (detailsMore / detailsLess).
  introInstructions: introStepTexts(ALL_FEATURES),
  detailsMore: 'Show the full instructions',
  detailsLess: 'Show the short instructions',
  controlsTitle: 'Controls',
  // R5-text: built from CONTROL_TABLE (E and the mirror arrows added; no "curved" arrows).
  controls: controlRows(ALL_FEATURES),
  // R5-text: the same controls with short words for the 2 s start page (and, R558, for the Esc page as it opens).
  introControls: introControlRows(ALL_FEATURES),
  settingsTitle: 'Settings',
  // 19 November 2026 (EASE; the owner: "Things should be chunked together and those chunks should be spaced away from
  // each other"; "It's not clear what the numbers do and it just adds to confusion on the menu"). The Esc page is a
  // FEW titled groups with wide gutters, not one long list: each group is one picture of its keys (ns-app
  // buildShellMenu: pad = the trackpad, wasd = the pyramid, space, keys = the key caps named) and at most five short
  // rows, [what you do, what it does]. Settings is the last group.
  // 22 November 2026 (WORDS2, hunt H14): the short page named no way to turn the brain without holding it, no limb drag,
  // no arrows and no free pointer; its one drag row ("turn a held brain or mirror") read as if a hold were needed (a
  // press and drag turns the brain or the mirror body without Space, ns-app drag; the arrow tips turn them; Esc twice
  // plays on with the pointer free, SHELL.pausedNote). Added: "Drag, arrow tips" here, the limb drag in the Move
  // group's note (its repeat of the W S and A D rows is gone), Esc twice in Views and reading; the held-drag row is gone.
  menu: [
    { id: 'look', title: 'Look and press', picture: 'pad', rows: [['Drag empty space', 'look around'], ['Click', 'press a motor area'],
      ['← →', 'aim at the next motor area'], ['Drag, arrow tips', 'turn the brain or mirror body']] }, // (second pass: one row)
    { id: 'move', title: 'Move', picture: 'wasd', rows: [
      ['1 / 2', 'choose left arm / left leg'],
      ['3 / 4', 'choose right leg / right arm'],
      ['Click limb', 'choose it'],
      // (21 November 2026, hunt H22: the rows say what the note under them says; W does not move a raised arm forward)
      ['W S', 'reach it out or draw it in'], ['A D', 'swing it left or right']],
      // 19 November 2026 (ns-app LIMB_KEYS.view: the view holds the chosen limb). 20 November 2026: "In the eye view"
      // is back (it went with the withdrawn turn to a chosen limb, Body update 50); from behind, E, the look carries no
      // limb (ns-app holdCarries).
      note: 'Double click steps to the next limb. In the eye view the chosen limb goes with your view: look up to raise ' +
        'it, down to lower it. Press on a limb and drag to turn or bend it.' },
    // (20 November 2026, evening, Message 204: Space grips with all four limbs at once; a click grips nothing)
    { id: 'hold', title: 'Hold and carry', picture: 'space', rows: [['Space', 'hands and feet grip; tap toggles'],
      ['W A S D', 'carry the held item'],
      ['Tap twice', 'Space turns your limbs'], ['Shift', 'reach behind as you press']] },
    // (21 November 2026, EMAP: M, the electrical map)
    { id: 'view', title: 'Views and reading', picture: 'keys', keys: ['E', 'R', 'M', 'Esc'], rows: [['E', 'switch eye and outside views'],
      ['R', 'information: short, more, off'], ['M', 'electrical map: on, off'], ['Esc', 'pause for controls and settings'],
      ['Capture mouse', 'look with each mouse movement']] }
  ],
  sensitivity: 'Look speed',
  invertY: 'Flip up and down (invert Y)',
  // R558 (user Message 37): off by default; the "Looking at" card (bottom left) always names what is under the crosshair.
  crosshairCaption: 'Also show the name next to the crosshair (the “Looking at” card always shows it)',
  // R558 (genuine note R28): the keyboard picture on the start page and the Esc page. Short words sit on the keys; the
  // two lines under the picture say the same in full. Every key named here is a key the game really handles.
  keyboard: {
    title: 'Where the keys are',
    label: 'A picture of the keys the game uses. W, A, S and D sit together on the left of the keyboard: W is above S, with A and D beside S. E is just right of W, and R is just right of E. Shift is the wide key at the left end of the row below A, and M is the seventh letter key right of it in that row. The space bar is the long key at the bottom: it takes hold of the brain or the mirror body, chooses a limb and turns your limbs. Esc is at the top left. The number keys are the row above W: 1 to 4 choose the limb that W, A, S and D move. The left and right arrow keys are at the bottom right: each steps your look to the next motor area on that side.',
    keys: { Escape: 'pause', KeyW: 'forward', KeyA: 'left', KeyS: 'back', KeyD: 'right', KeyE: 'view', KeyR: 'read', KeyM: 'map', ShiftLeft: 'other in line', ArrowLeft: 'area', ArrowRight: 'area' },
    names: { Escape: 'Esc', KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyE: 'E', KeyR: 'R', KeyM: 'M', Space: 'Space', ShiftLeft: 'Shift',
      Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
      ArrowLeft: '←', ArrowRight: '→' },
    // R558 (Messages 55 and 56): written once at the end of the number row (ns-app KEYBOARD_PICTURE_ROWS note).
    numWords: 'Number keys 1 to 4 (the row below): choose the limb the keys move (left arm, left leg, right leg, right arm)',
    // R558 (Message 40): the three Space gestures, in short words on the key.
    spaceWords: 'hold or tap: take hold · tap twice: turn · tap twice and hold: keep turning slowly',
    // R558 (Message 55): two short notes. The key captions already say what E, R, Esc, the arrows and the number
    // row do; the full words are in the Controls list.
    lineMove: 'W, A, S, D move the hand or foot of the limb you chose (1 to 4), or the thing Space holds. The chosen limb goes with your view. Hold Shift as you click, press Space or drag to reach the other thing in line with the crosshair.',
    // (21 November 2026, late: Space on one of your limbs chooses it, ns-app LIMB_KEYS.view.hold; the line said it takes hold of a limb)
    lineSpace: 'Space takes hold of the brain or the mirror body: hold it, or tap once (tap again to let go). On one of your limbs it chooses that limb. While Space is down, or keeps a hold after a tap, both hands close and the toes curl. Tap twice: all four limbs turn once. Tap twice and hold: they keep turning, slowly.',
    padTitle: 'Trackpad or mouse',
    padMove: 'Drag empty space to look around.',
    padClick: 'Click a motor area: its body part moves. Click a muscle: its motor area switches on.',
    padDrag: 'Press and drag: turn the brain, the mirror body or a limb.'
  },
  // R4-integrator (D8): the Esc-page picture-quality setting (option names in QUALITY_LABELS).
  quality: 'Picture quality',
  // R4-polish: "softer" was not what a player sees on a software renderer (a half-size, blockier picture); say it plainly.
  // R558 (Message 20): the thin dark outlines between limbs are drawn at every quality; the soft shading in the creases
  // only at full quality (High, or Auto on a fast computer).
  // R558 (Message 55): the help is two short sentences; the outline and crease detail is in the player guide.
  qualityHelp: 'Auto keeps the game smooth. Low draws a simpler, less sharp picture for slow computers. The colours and ' +
    'what they mean stay the same.',
  // R4-fix (code review M1): edge smoothing is chosen when the page loads; after a Low start, High is fully sharp only
  // after a reload.
  qualityReload: 'Reload the page for the sharpest edges.',
  // R5-text (D15, optional Esc-page setting "Body Worlds layers: on / off"; option names in BODY_WORLDS.on / .off).
  bodyWorlds: 'Lifted outer muscles (Body Worlds style)',
  bodyWorldsHelp: 'On lifts the outer muscles a little and draws every muscle a little fuller, so you can see the ' +
    'deeper ones. In a real body they lie flat on top of the deeper ones.',
  limitsTitle: 'What this game is, and is not',
  // R5-text: built from LIMIT_TABLE (the glow, the lifted outer muscles and the mirror body added).
  limits: limitLines(ALL_FEATURES),
  // The information key (R) works in captured play, so the toast names it.
  // 17 November 2026 (far less text): three short parts; the Esc page has the rest.
  // (21 November 2026, EMAP: the map key is named beside Esc)
  freeLookHint: 'Drag empty space to look around · M: electrical map · Esc: controls',
  lockRefused: 'Mouse capture unavailable. Drag empty space to look · Esc: controls',
  lookOff: 'Use W/A/S/D, Space and clicks · Esc: controls',
  contextLost: 'The graphics stopped (WebGL context lost). The game waits until the browser brings them back.',
  contextLostLong: 'The graphics have not come back. Reloading the page usually fixes this.'
});

/** The reset help line and the Reset brain view notice for each mirror-reset choice (R5-text, D19). */
export const RESET_HELP = deepFreeze({
  noMirror: 'Reset body puts your whole body back the way it started and clears the marks on used areas. ' +
    'Reset brain view puts the brain back where it started.',
  separate: 'Reset body puts your whole body back the way it started and clears the marks on used areas. ' +
    'Reset brain view puts the brain back where it started. Reset mirror body puts the mirror body back where a mirror shows you.',
  brainResetNoMirror: 'Brain view reset: the brain is back in its first place and angle.'
});

/**
 * SHELL for one build (R5-text): `features` is { thirdPerson, mirror, glow, bodyWorlds, compassArrows, faceMuscles,
 * mirrorResetButton } (booleans; a missing one counts as the round-5 default: all on, no separate mirror reset button).
 * The steps, step heads, controls and limits of a feature that is off are left out (a step part with '!feature' is used
 * only when that feature is off), and the reset help line and notice match the mirror-reset choice. Same keys as SHELL,
 * deep-frozen; shellText() with no argument equals SHELL value for value. Pass the result to ns-app createShell({ text }).
 */
export function shellText(features = null) {
  const f = featuresOf(features);
  const resetHelp = !f.mirror ? RESET_HELP.noMirror : f.mirrorResetButton ? RESET_HELP.separate : SHELL.resetHelp;
  const brainReset = !f.mirror || f.mirrorResetButton ? RESET_HELP.brainResetNoMirror : SHELL.brainReset;
  return deepFreeze({
    ...SHELL, instructions: stepTexts(f), instructionHeads: stepHeads(f), controls: controlRows(f), limits: limitLines(f),
    introInstructions: introStepTexts(f), introControls: introControlRows(f), resetHelp, brainReset
  });
}

/** Picture-quality setting names (D8; ns-app QUALITY_SETTING_MODES, ns-scene-three QUALITY_MODES). */
export const QUALITY_LABELS = deepFreeze({
  auto: 'Auto',
  high: 'High',
  low: 'Low (for slow computers)'
});

/** R558 (genuine note R26): the face-view choice is retired. The floating own face (a see-through layer or a small
 * box) is no longer offered; the mirror body shows the face. Only 'off' remains, so an old saved choice has no name. */
export const FACE_VIEW_LABELS = deepFreeze({ off: 'Off' });

/* ------------------------------------------------------------------ HUD */

/** Same keys as ns-app HUD_TEXT (plus the new gazeStripPrefix and gazePrefix). Lines that are only in the hidden
 * details mirror are plain too, so nothing jargon-heavy is one click away. */
export const HUD = deepFreeze({
  title: 'NeuroSurge · a simulated brain-and-body game',
  brand: BRAND.modelName,
  qualifier: 'A rough map (representative). In real brains, the areas overlap and vary from person to person.',
  // R4-text: two short sentences (Flesch 67.8 -> 80.8); the pinned "not real stimulation or decoding" is unchanged.
  control: 'Your looks and keys are just game controls (virtual inputs). They are not real stimulation or decoding',
  simulated: 'All numbers are made up by the game (simulated). They go from 0 to 1 and have no real units (unitless)',
  view: 'Seen from above, not mirrored, turned to face you: front at the bottom, the brain’s right half on your left',
  rights: 'Anatomy: BodyParts3D © DBCLS, CC BY 4.0',
  placeholderRights: 'Stand-in shapes: no BodyParts3D anatomy shown',
  // R4-text: "a rough map" (Flesch 68.8 -> 72.3, 118 characters); the pinned opening and the four core honesty items
  // are unchanged.
  limitsShort: 'Signals made up (simulated, unitless) · a rough map · game controls (virtual inputs), not real stimulation or decoding',
  // (21 November 2026, late: Space on a limb chooses it; a look does the area's movement and the part goes back; the
  // numbers 1 to 4 choose a limb. The line still said Space carries a limb and a number moves a body part.)
  // (22 November 2026: nothing on screen shows this line or hintShell below. ns-app hudStatic puts one of them in the
  // HUD's hint slot, hintShell when the game shell is on, which it always is in the preview, and the style sheet hides
  // that slot inside the HUD: neurosurge.css `.ns-hud .ns-slot-hint { display: none; }`. Kept, true, for a page without
  // that style.)
  hint: 'Drag on empty space to look. Keys 1 to 4 choose a limb. W and S reach its hand or foot out or draw it in. A and D swing it left or right. ' +
    'Hold Space on the brain or mirror body to carry it. Use the view and movement keys to guide it. A tap takes hold and another tap releases it. ' +
    'Carried objects can pass through the virtual body and other objects. Space on a limb selects it. Tap Space twice to turn all four limbs once. ' +
    'Hold the second tap to keep them turning. Press Shift to reach the item behind the first one. Looking at a motor area moves its body part. Click to repeat the movement. ' +
    'In the Esc menu, choose Capture mouse if you want to look with each mouse movement. Press Esc to release it.',
  hintShell: 'Look to aim. 1 to 4 choose a limb; it goes with your view. W/S reach its hand or foot straight out or draw it in, A/D swing it left or right. Tap Space twice: all four limbs turn ' +
    'once; tap twice and hold: they keep turning slowly. Look at a motor area to see its movement; click to do it again. Hold Space on ' +
    'the brain or the mirror body. Move the pointer or press W/A/S/D to carry it. Let go to leave it there (or tap Space to take hold, and tap again to let go). Shift + a press reaches the other thing in line. Esc: controls and reset.',
  markers: 'Dots are rough control spots, not exact points in the brain. The coloured areas overlap.',
  drivesTitle: 'Strongest simulated muscle signals (unitless, 0–1)',
  gazePrefix: 'Looking at: ',
  gazeEmpty: 'Looking at: empty space (nothing switches on)',
  gazeBrain: 'Looking at: the brain, but not a motor area (nothing switches on)',
  gazeGlass: 'Looking at: brain glass, not a motor area (nothing switches on)',
  // R558 (Messages 55 and 56): one opening for every motor area, and the line names the AREA first, then its movement
  // ("Looking at (motor area): Left knee · Bend left knee"). It was "(left arm): " for the left-arm areas and
  // "(other body part): " for the rest, followed by the movement alone, which never said which area it was.
  gazeAreaPrefix: 'Looking at (motor area): ',
  gazeAreaJoin: ' · ',
  gazeBetweenPrefix: 'Looking at (moves nothing): ',
  pulseNone: '',
  pulseResidual: 'Arm relaxing back to rest',
  grabbing: 'Turn your view to carry it. W moves it farther, S nearer, and A/D sideways. Let go of Space.',
  /** R558 (Message 40): while Space holds the brain or the mirror body (what: 'brain' | 'mirror'); kept: the hold was
   * taken with a tap (it stays after the tap, so a tap lets go), else it lasts while Space is down. */
  holdingItem: (what, kept = false) => `Holding ${what === 'mirror' ? 'the mirror body' : 'the brain'}. ` +
    'Turn your view to carry it. W moves it farther, S nearer, and A/D sideways. ' +
    (kept ? 'Tap Space to let go.' : 'Let go of Space to leave it there.'),
  /** R558 (Messages 2, 12 and 40): while Space holds one of your own limbs (ns-grasp LIMB_IDS); kept as above. */
  holdingLimb: (limb, kept = false) => `Holding your ${({ rightArm: 'right hand', leftArm: 'left hand (W/A/S/D and your look move it, as always)', rightLeg: 'right foot', leftLeg: 'left foot' })[limb] || 'limb'}` +
    (limb === 'leftArm' ? (kept ? '. Tap Space to let go.' : '. Let go of Space when done.')
      : `: move the pointer sideways, up or down. W moves it farther, S nearer, and A/D sideways. ${kept ? 'Tap Space to let go.' : 'Let go of Space to leave it there.'}`),
  /** 19 November 2026 (the owner: "If we click on a limb, we now control that limb until we change the camera view"):
   * while a limb taken by a click is controlled. */
  // (later the same day, ns-app LIMB_KEYS.view: one limb is always chosen and goes with the view; nothing lets go of it)
  controllingLimb: limb => `W/A/S/D move your ${({ rightArm: 'right hand', rightLeg: 'right foot', leftLeg: 'left foot' })[limb] || 'limb'}. Look up or down to raise or lower it.`,
  /** R558 (Message 12): a move stopped where two of the three would touch (what: 'brain' | 'mirror' | 'body'). */
  contactStop: what => `${({ brain: 'The brain', mirror: 'The mirror body', body: 'Your body' })[what] || 'That'} stopped: your body, the brain and the mirror body stop where they would touch`,
  rotationPrefix: 'Left forearm: ',
  rotationHint: ' · tap Space twice: all limbs turn',
  wholeGroupTint: 'These finger muscles serve all four fingers, so all four light up, not just one',
  // R558 (Message 40): the slow turn of a double tap held, and a double tap's one step.
  spaceHeld: 'Double tap held: all four limbs keep turning slowly (simulated). Let go of Space and they stay.',
  turnStep: 'Double tap: every limb turns once (simulated)',
  spaceReleased: 'Space let go: every limb stays where it is (simulated)',
  reachLimited: 'Reach limited so the whole hand stays on screen',
  // R4-fix (review RP3): shown in the status card while a held W/A/S/D cannot move the hand any further.
  reachBlocked: 'Your hand cannot go further that way, so it stays on screen',
  // R558: the look stops where the whole arm could no longer stay in view (the game used to stop here).
  lookLimit: 'You cannot look further that way: your arm has to stay in view',
  /** R558: shown for a few seconds after a change of view (E) could not be drawn and was undone. */
  viewKept: 'That change of view cannot be shown from this pose. Push your hand forward a little or look back toward the middle, then press E again.',
  /** R558 (hunt 2 controls #4): shown for a few seconds when E is pressed while Space holds the brain or the mirror body
   * (the view does not change while something is held). */
  viewWhileHolding: 'Let go of what Space holds first (or tap Space if you tapped to take hold), then press E.',
  /** R558 (Messages 55 and 56): the area keys (left / right arrow). Shown for a few seconds when a press found no
   * further area that way, and when it was pressed while something is held (a step is a look; a held thing follows the look). */
  areaEnd: 'No more motor areas that way from here. Press the other arrow key, or turn the brain to bring more areas into view.',
  areaUnreachable: 'Could not aim at another area from here. Turn the brain or try the other arrow key.',
  areaWhileHolding: 'Let go of what you hold first, then press the arrow key.',
  /** R558 (Messages 6, 55 and 56): what a number key (n) just did when it was not the movement itself. moveStill: it
   * moved nothing. Shown for a few seconds. (20 November 2026, Message 206: moveBack, "brought the part back", and the
   * head-moved lines, which said how to bring a held head back, are gone with the latch.) */
  moveStill: n => `Key ${n}: that movement is already there, so nothing moved. Try another number on the card.`,
  contextLost: SHELL.contextLost,
  placeholderAttribution: 'Stand-in shapes only, no real body parts. The full game uses: ',
  placeholderMuscles: 'Stand-in mode has no 3D muscles. So the made-up (simulated) muscle signals are only listed.',
  unmappedPrefix: 'Not in the movement map (plain colour): ',
  // R4-fix (review SL4-5): the three forearm-turning muscles are coloured by name while a forearm turns (round-3 SL-2).
  unmappedTurnPrefix: 'Not in the movement map, coloured only while the forearm turns: ',
  unmappedPlainPrefix: 'Not in the movement map, always plain colour: ',
  /** ns-placeholder PLACEHOLDER_LABEL (the ?placeholder=1 banner). */
  placeholderBanner: 'STAND-IN SHAPES (unqualified placeholder): not real anatomy',
  /** ns-actions ARM_REACH_LABEL (the reach line in the details mirror). */
  armReachLabel: 'Simulated arm reach signal (unitless; the shoulder area is not mapped)',
  /** Round 3 (R3-integrator, R3-player item 8): shown when the dragged brain is far from where you look. */
  brainAwayHint: 'Lost the brain? Press Esc, then Reset brain view to bring it back.',
  /** R4-polish (R4-player 1.11): shown while the arrows have turned the view far round the brain. */
  turnedFarHint: 'Turned far round the brain? Press Esc, then Reset brain view to go back.',
  /** R558: shown while the crosshair is on a face area and the brain has not been turned. The lowest areas of each
   * motor strip (tongue, and the lowest in-between area) lie on the side of the brain, out of sight from straight above
   * (earlier count with the game's own gaze test: 40 of 44 areas could be aimed at from above. Strip audit round 2,
   * along-gyrus strip coordinate: the game's look targets list all 44 areas at the start view, but the tongue and the
   * lowest in-between area only as the far tip of each strip, seen with the head turned far; nearly all of their
   * surface is on the side of the brain, which turning the brain shows). */
  sideAreasHint: 'More face areas (the tongue) are round the side of the brain: drag the brain, or click the arrow beside it, to turn it.',
  /** R4-integrator (R4-player 1.8, D8): shown while the frame rate stays very low (a slow or software renderer). */
  slowComputer: 'Your computer draws only a few pictures a second, so the game moves slowly.',
  slowComputerTry: 'Try Picture quality: Low on the Esc page.',
  /** R4-integrator (R4-player 1.1 / 1.4): added to the crosshair caption when the aimed area moves nothing you can see. */
  nothingMoves: 'nothing moves on the body',
  relaxNothing: 'nothing to see: your hand is not gripping',
  /** R4-fix (review RP6): the left shoulder area has no action of its own; the look and W/A/S/D move the shoulder. */
  shoulderMoves: 'your look and W, A, S, D already move it',
  /** R5-text (D18): the status line while the view from behind is on (VIEW has the other E texts). */
  thirdPerson: 'Third-person view: you see your own back. Press E to go back.',
  /** R5-text (D18): a short notice after E brings you back to your own eyes. */
  firstPerson: 'Back in your own eyes. Press E to see your back again.',
  /** R5-text (D19): crosshair / gaze line on the mirror body (gazeLine('mirror', part)). */
  gazeMirrorPrefix: 'Looking at (mirror body): ',
  gazeMirror: 'Looking at: the mirror body (it copies your body)',
  /** R558 (hunt 2; Message 18 "differentiate each ... muscle node"): the crosshair on a muscle of the mirror body or of
   * your own body names that muscle and says what a click (and Space) does there (gazeMuscleLine). */
  gazeMuscleClick: 'click: its brain area switches on',
  // (22 November 2026, WORDS2, hunt H10: never shown, crossPick.holdable is always false in ns-app; kept true: Space on
  // your own limb chooses it, LIMB_KEYS.view.hold. It said "hold Space to hold this limb".)
  gazeMuscleHold: 'Space chooses this limb',
  gazeBone: 'a bone',
  gazeOwnPrefix: 'Looking at (your body): ',
  /** R558 (hunt 2): the crosshair on an arrow tip names what a click on it does (the tip's own caption). */
  gazeArrowPrefix: 'Looking at (arrow): ',
  /** R558 (Messages 33 and 34): the line under "Looking at": what Space and a press-and-drag take at the crosshair (the motor
   * area the look names means the brain, even behind a body; otherwise what you see: the brain's clear glass is
   * see-through) and, when another item lies on the same line of sight, how to reach that one (hold Shift as you press:
   * click, Space or drag). While Shift is held (reach), what the press will reach. front / behind: 'brain' | 'area' (a motor
   * area of the brain) | 'mirror' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg' | 'trunk' (your trunk, neck or head:
   * nothing to hold) | 'arrow' (front only: an arrow tip) | null; ahead: the other item is the brain whose clear glass is
   * IN FRONT of what you see; inFront: the other item is the body part IN FRONT of the motor area the look names; area:
   * the plain name of a motor area behind ('' = none). R558 (Messages 44 and 55): short words, e.g. "Space holds the
   * mirror body · Shift: the brain behind it", "Space holds the brain · Shift: your right arm in front of it" (a press
   * and drag takes the same thing; the controls list says so).
   * 22 November 2026 (WORDS2, hunt H10): limbsChosen is ns-app's LIMB_KEYS.view.hold, the rule TIP.spaceAim already
   * follows (section 194): Space on one of your own limbs CHOOSES it and nothing holds it, so with it a limb's line is
   * "Space chooses your right leg" and Shift held says a press "goes to" a limb rather than "takes" it. The line said
   * "Space holds your right leg" while the right card beside it said "Your right leg is chosen". Without it, as before. */
  controlTargets: ({ front = null, behind = null, ahead = false, inFront = false, area = '', reach = false, limbsChosen = false } = {}) => {
    const NAME = { brain: 'the brain', area: 'the brain', mirror: 'the mirror body', rightArm: 'your right arm', leftArm: 'your left arm', rightLeg: 'your right leg', leftLeg: 'your left leg', trunk: 'your trunk' };
    const LIMB = { rightArm: true, leftArm: true, rightLeg: true, leftLeg: true };
    const a = str(area).trim();
    const low = a ? `${a.charAt(0).toLowerCase()}${a.slice(1)}` : '';
    const far = behind === 'area' && a ? (/\barea\b/i.test(a) ? `the ${low}` : `the ${low} area`) : behind === 'area' ? 'a brain area' : NAME[behind] || '';
    const where = front === 'arrow' ? 'behind the arrow tip' : inFront ? 'in front of it' : ahead ? '(its clear glass in front)' : 'behind it';
    const chosen = limbsChosen === true;
    // Your trunk, neck or head cannot be held or turned: Shift there only taps (a click).
    if (reach) return behind === 'trunk' ? `Shift held: a click taps ${far} ${where} (nothing to hold there)` : far ? `Shift held: click, Space or drag ${chosen && LIMB[behind] ? 'goes to' : 'takes'} ${far} ${where}` : 'Shift held: nothing behind to reach here';
    const own = front === 'trunk' ? 'Space: nothing to hold here' : front && front !== 'arrow' ? `Space ${chosen && LIMB[front] ? 'chooses' : 'holds'} ${NAME[front]}` : '';
    return [own, behind === 'trunk' ? `Shift + click: ${far} ${where}` : far ? `Shift: ${far} ${where}` : ''].filter(Boolean).join(' · ');
  }
});

/** Forearm state words (ns-app ROTATION_PLAIN): the plain words with the technical term in brackets. */
export const ROTATION = deepFreeze({ pronated: 'palm down (pronated)', supinated: 'palm up (supinated)' });

const fix1 = v => (Number.isFinite(v) ? v.toFixed(1) : '–');
const fix2 = v => (Number.isFinite(v) ? v.toFixed(2) : '–');
const str = v => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** HUD gaze line. kind: 'leftArm' | 'other' | 'between' (an in-between SCAN area) | 'strip' (a left-arm action point) |
 * 'mirror' (R5: the mirror body; label = the mirrored part, e.g. mirrorPartName('leftArm')) | 'glass' | 'brain' |
 * 'empty'.
 * R558 (Messages 55 and 56): for a motor area ('leftArm' | 'strip' | 'other') `label` is the movement under the look
 * and `area` the area's plain title; the line names the area, then the movement ("Looking at (motor area): Left knee ·
 * Bend left knee"). With one of the two (or the same words twice, as for an area without a movement of its own) the
 * line carries that one. */
export function gazeLine(kind, label = '', area = '') {
  const l = str(label).trim();
  if (kind === 'mirror') return l ? `${HUD.gazeMirrorPrefix}${l}` : HUD.gazeMirror;
  if (kind === 'leftArm' || kind === 'strip' || kind === 'other') {
    const t = str(area).trim();
    return `${HUD.gazeAreaPrefix}${t && l && t !== l ? `${t}${HUD.gazeAreaJoin}${l}` : t || l}`;
  }
  if (kind === 'between') return `${HUD.gazeBetweenPrefix}${l}`;
  if (kind === 'arrow') return l ? `${HUD.gazeArrowPrefix}${l}` : HUD.gazeBrain;
  if (kind === 'glass') return HUD.gazeGlass;
  if (kind === 'brain') return HUD.gazeBrain;
  return HUD.gazeEmpty;
}
/** HUD line while a pulse runs (was "Pulse (simulation clock): X (0.6 s left)"). */
export function pulseLine(label, secondsLeft) { return `Simulated signal: ${str(label)} (${fix1(secondsLeft)} s left)`; }
/** HUD line right after a pulse starts (was "Pulse #3 (click re-trigger): X"). source: 'click' | 'gaze'. */
// R4-polish (R4-player T5): the running signal number meant nothing to a player; the line now says what started it.
export function triggerLine(seq, source, label) {
  return `${source === 'click' ? 'Clicked' : 'New area'}: ${str(label)}`;
}
/** R558 (hunt 2): the gaze line for a muscle or bone under the crosshair. where: 'own' (your body) | 'mirror'; name: the
 * plain atlas name; kind: 'muscle' | 'bone'; part (mirror only): which of your parts it mirrors (MIRROR_PART_NAMES,
 * e.g. 'your legs'); holdable (own only): the muscle belongs to a limb Space can hold. E.g. "Looking at (your body): right
 * biceps brachii, click to switch on its area; hold Space to hold this limb". */
export function gazeMuscleLine({ where = 'own', name = '', kind = 'muscle', part = '', holdable = false } = {}) {
  const n = str(name).trim();
  const head = where === 'mirror' ? HUD.gazeMirrorPrefix : HUD.gazeOwnPrefix;
  if (!n) return where === 'mirror' ? HUD.gazeMirror : HUD.gazeEmpty;
  const what = where === 'mirror' && str(part) ? `${n} (${str(part)})` : n;
  if (kind !== 'muscle') return `${head}${what}, ${HUD.gazeBone}`;
  return `${head}${what}, ${HUD.gazeMuscleClick}${holdable ? `; ${HUD.gazeMuscleHold}` : ''}`;
}
/** Lead decision (refines Messages 33 and 34): the look reaches a motor area through a body part in front of it; the
 * "Looking at" line then ends with that part, e.g. "Looking at (motor area): Left elbow · Bend left elbow, behind your
 * right forearm". */
export function gazeBehindLine(line, name) {
  const l = str(line), n = str(name).trim();
  return n ? `${l}, behind ${n}` : l;
}
/** The plain name of a body part seen in front of a motor area (gazeBehindLine). where: 'own' | 'mirror'; segment: the
 * posed segment of your own body part (e.g. 'r_forearm'); limb: 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg' | null. */
export function inFrontName({ where = 'own', segment = '', limb = null } = {}) {
  if (where === 'mirror') return 'the mirror body';
  const m = /^([lr])_([a-z]+)/.exec(str(segment));
  const PART = { upperarm: 'upper arm', forearm: 'forearm', radius: 'forearm', wrist: 'wrist', hand: 'hand', digits: 'fingers', thumb: 'thumb',
    index: 'index finger', middle: 'middle finger', ring: 'ring finger', little: 'little finger', thigh: 'thigh', patella: 'knee', shank: 'lower leg', foot: 'foot', toes: 'toes' };
  if (m && PART[m[2]]) return `your ${m[1] === 'r' ? 'right' : 'left'} ${PART[m[2]]}`;
  return ({ rightArm: 'your right arm', leftArm: 'your left arm', rightLeg: 'your right leg', leftLeg: 'your left leg' })[limb] || 'your body';
}
/** HUD forearm line: "Left forearm: palm down (pronated) · tap Space twice: all limbs turn". hint false leaves out the
 * " · tap Space twice: all limbs turn" part (R558, hunt 2; Message 40: not while the limbs turn or something is held,
 * which have their own lines). */
export function rotationLine(state, { hint = true } = {}) {
  return state ? `${HUD.rotationPrefix}${ROTATION[state] || str(state)}${hint ? HUD.rotationHint : ''}` : '';
}
/** HUD line for an explicit elbow target (simulated display). */
export function elbowLine({ commandDeg, achievedDeg, limited } = {}) {
  if (!(Math.abs(commandDeg) >= 0.5)) return '';
  const sign = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}°`;
  return `Elbow ${commandDeg > 0 ? 'bending' : 'straightening'} (simulated target): ${sign(achievedDeg)} of ${sign(commandDeg)}` +
    (limited ? ' (limited so the hand stays in view)' : '');
}
/** The small label next to the crosshair (ns-scene-three render({ hover })): the plain action or area name only,
 * e.g. "Close left hand" (was "Grasp / close hand (representative)"); '' when there is nothing under the crosshair. */
export function hoverLabel(plainName) { return str(plainName).trim(); }
/** HUD muscle line (catalog key, everyday name, value), e.g. "FDS finger muscle: 0.42". */
export function muscleLine(key, name, value) { return `${str(key)} ${str(name)}: ${fix2(value)}`; }
/** Developer timing line. */
export function frameLine(ms) { return Number.isFinite(ms) ? `Update time: ${ms.toFixed(1)} ms (smoothed)` : ''; }

/* ------------------------------------------------------------------ information panel */

/** Same keys as ns-app INFO_TEXT, plus row names, prefixes and the plain "More detail" summary. */
export const INFO = deepFreeze({
  heading: 'What is happening (simulated)',
  idleTitle: 'Look at a motor area',
  // R558 (issue hunt 2: the short corner card clamps its text to three lines, and these ended mid-word, "Hold F on the
  // br…", with nothing to open on a card without More detail): short enough for three lines of the narrowest card.
  // R558 (Message 40): Space now holds (the F key is gone); glassBody keeps about the same length (100 characters).
  idleBody: 'Aim at a coloured brain area: this panel says what it moves and which muscles pull.',
  glassTitle: 'Brain glass: no motor area here',
  // R3-polish: the first card a new player sees (the start look is on the glass) now also says what to do next.
  glassBody: 'Not a motor area: nothing switches on. Aim at a coloured area, or hold Space here to carry the brain.',
  // R558 (hunt 3): the crosshair is on the brain (a motor area or its glass) behind your body or the mirror body (the
  // card no longer says "no motor area here ... carry the brain"). A click taps the muscle in front (muscleTap); Space
  // chooses your limb there (22 November 2026, WORDS2, hunt H10: it said "hold Space to hold a limb", but Space on your own
  // limb only chooses it, ns-app LIMB_KEYS.view.hold), or carries the mirror body when that is the one in front (itemAt).
  coveredOwnTitle: 'Your body is in front here',
  coveredOwnBody: 'Your body is in front of the brain. Click a muscle to switch on its area. Space on an arm or a leg chooses that limb.',
  coveredMirrorTitle: 'The mirror body is in front here',
  coveredMirrorBody: 'The mirror body is in front of the brain. Click a muscle to switch on its area; Space carries the mirror body (Shift + Space the brain).',
  leftArmTag: 'Left-arm motor area (brain’s right half)',
  // R558 (Messages 55 and 56): "(no keys)" is gone: the number keys do this area's movements too. (The panel reads
  // "left arm" in a tag to tell a left-arm card, so this tag must not say it.) Now only the fallback of areaTag (an
  // area whose part of the strip is not known); every mapped area names its part: "Left-leg motor area (...)".
  otherTag: 'Motor area for another body part',
  // R4-fix (review RP12): the technical names (SCAN, pathway names) are in More detail.
  integrationTag: 'In-between spot: moves nothing',
  leftArmPathway: 'Brain → crosses to the left at the base of the brain → spinal cord in the neck → arm ' +
    'nerves → muscles (corticospinal tract, brachial plexus)',
  otherPathway: 'Brain → spinal cord or base of the brain → nerves → muscles (corticospinal or corticobulbar pathway)',
  simulated: 'Simulated: a made-up level from 0 to 1 (unitless). Nothing is recorded, sent in (stimulated) or read out (decoded).',
  known: 'Known: each half of the brain mainly moves the other side of the body. Real maps overlap and vary.',
  crownNote: HONESTY.crown.plain,
  // (22 November 2026, WORDS2, second pass: the short "simplified map" line first; at 800 by 600 the long overlap line
  // before it pushed it to the card's foot, where it was cut. ns-scene-three fitCaveats drops whole lines from the end.)
  caveats: [HONESTY.notExact.plain, HONESTY.overlapVary.plain, HONESTY.emg.plain,
    HONESTY.notDecoder.plain],
  lastViewed: 'Last area you looked at',
  // R4-polish (R4-player 1.9): one line, so the card's More detail stays inside the panel.
  viewedLast: 'Last area shown',
  rows: {
    bodyPart: 'Body part', movement: 'Movement', agonists: 'Muscles that pull', antagonists: 'Muscles that work the other way',
    pathway: 'Signal path',
    // R4-fix (review SL4-7): an action that pulls nothing (letting go) eases BOTH finger muscle groups off.
    easeOff: 'Muscles that ease off', pathwayName: 'Name of the signal path'
  },
  noMovement: 'none: this area moves nothing in the game',
  caveatPrefix: 'Keep in mind: ',
  moreDetail: 'More detail',
  /** R558 (Message 48, the R key "read information"): the small line at the foot of the card says what R does next, and
   * the chip shown while the information is hidden says how to bring it back (ns-app toggleInfoDetail). */
  keyHint: { read: 'R: more', more: 'R: hide', off: 'R: info' },
  sourcesPrefix: 'Sources: ',
  unverified: ' (unverified)',
  technicalName: 'Technical name',
  allMuscles: 'All muscle names',
  steadying: 'Muscles that steady the joint',
  /** R3-fix (SL-2): appended to a forearm-turn card's movement row when the palm already faces that way. */
  // (21 November 2026, section 189: the forearm now twitches against its stop there, so "nothing moves now" was untrue)
  alreadyDown: ' (your palm is already down, so it does not turn further)',
  alreadyUp: ' (your palm is already up, so it does not turn further)',
  /** R558: this movement moves nothing now (a left-arm movement: an elbow already straight; 20 November 2026, Message
   * 206: a body movement always moves). (bringsBack, "the first time only brings it back", is gone with the latch.) */
  alreadyThere: ' (already there, so nothing moves now)',
  /** R558 (Messages 55 and 56): the numbered list of an area's movements on the card (ns-app infoMoves). A number key
   * does the movement beside it; `atEnd` marks a movement that would move nothing now. */
  moves: { heading: 'Movements: press a number', atEnd: 'already there', current: 'shown now' }
});

/** "Simulated signal 0.80 of 1 (no units)". R558 (Messages 44 and 55): one short line; the colour key and More detail
 * say what 0 and 1 mean. */
export function activityLine(v) { return `Simulated signal ${fix2(v)} of 1 (no units)`; }
/** "Switched on 2× (marked until Reset body)"; '' below 1. */
export function activationsLine(n) { return Number.isFinite(n) && n >= 1 ? `Switched on ${n}× (marked until Reset body)` : ''; }
/** "+2 more notes on the Esc page"; '' for 0. */
export function moreCaveatsLine(n) {
  return n > 0 ? `+${n} more note${n > 1 ? 's' : ''} on the Esc page (What this game is, and is not).` : '';
}
/** Citation list "Sources: GORDON2023 · BODYPARTS3D (unverified)". */
export function sourcesLine(citations = []) {
  const list = (Array.isArray(citations) ? citations : []).filter(c => c && str(c.key));
  return list.length ? `${INFO.sourcesPrefix}${list.map(c => `${str(c.key)}${c.verified === true ? '' : INFO.unverified}`).join(' · ')}` : '';
}

const halfOf = h => (h === 'right' || h === 'left' ? h : null);
const otherHalf = h => (h === 'right' ? 'left' : h === 'left' ? 'right' : null);
const limbOf = group => (/_leg$/.test(str(group)) ? 'leg' : /_arm$/.test(str(group)) ? 'arm' : null);

/**
 * Plain signal path for a body-map region (ns-app infoPathway, same inputs: the region's own pathway and laterality).
 * The plain route comes first; the technical pathway name is only in brackets. Integration (in-between) regions keep
 * the "No muscle output is simulated" opening the round-2 tests rely on.
 */
export function plainPathway(region, leftArm = false) {
  if (leftArm) return INFO.leftArmPathway;
  if (!region) return INFO.otherPathway;
  if ((region.id === 'rh_tongue' || region.id === 'lh_tongue') && Array.isArray(region.actions) && region.actions.length === 0) {
    return 'Tongue movement is not simulated in this body; a suitable model and checked motion are still needed.';
  }
  const o = otherHalf(region.hemisphere);
  const lat = str(region.laterality), path = str(region.pathway), limb = limbOf(region.displayGroup);
  if (region.kind === 'integration' || path === 'integration') {
    return 'No muscle output is simulated, so no pathway is shown (somato-cognitive action network; cingulo-opercular network)';
  }
  if (path.includes('corticospinal') && path.includes('corticobulbar')) {
    return 'Brain → base of the brain and top of the spinal cord, from both halves (how much from each is debated) ' +
      '→ nerves → neck muscles (corticobulbar and corticospinal pathways)';
  }
  if (path === 'corticospinal') {
    if (lat === 'bilateral') return 'Brain → spinal cord → nerves → belly and back muscles, from both halves of the brain (corticospinal pathway)';
    if (o && limb === 'leg') return `Brain → crosses to the ${o} at the base of the brain → spinal cord in the lower back → leg nerves → muscles (corticospinal tract)`;
    if (o && limb === 'arm') return `Brain → crosses to the ${o} at the base of the brain → spinal cord in the neck → arm nerves → muscles (corticospinal tract)`;
    if (o) return `Brain → crosses to the ${o} at the base of the brain → spinal cord → nerves → muscles (corticospinal tract)`;
  }
  if (path === 'corticobulbar') {
    if (lat === 'bilateral') return 'Brain → base of the brain, from both halves → face nerve → muscles (corticobulbar pathway)';
    if (lat === 'contralateral_predominant' && o) return `Brain → base of the brain, mostly crossing to the ${o} side → face nerve → muscles (corticobulbar pathway)`;
    if (lat === 'bilateral_contralateral_bias' && o) return `Brain → base of the brain, both sides (more to the ${o}) → head nerves → muscles (corticobulbar pathway)`;
  }
  return INFO.otherPathway;
}

/** Plain "Known:" line for a body-map region (ns-app infoKnown, same inputs). Keeps the "Known:" opening and, for the
 * left arm, the "right half of the brain mainly moves the left arm" sentence the round-2 tests pin. Every line ends with
 * the overlap-and-vary reminder (honesty H5), so each card carries it on its own. */
const KNOWN_TAIL = ' Real maps overlap and vary.';
export function plainKnown(region, leftArm = false) {
  if (!region) return INFO.known;
  const known = t => `Known: ${t}${KNOWN_TAIL}`;
  // R4-fix (review SL4-9): what the 2023 paper measured, not its proposal stated as known.
  if (region.kind === 'integration') return known('in brain scans these in-between spots switch on when people plan actions (Gordon et al., 2023).');
  const h = halfOf(region.hemisphere), o = otherHalf(region.hemisphere), lat = str(region.laterality);
  if (leftArm) return known('the right half of the brain mainly moves the left arm (right hemisphere).');
  if ((region.id === 'rh_tongue' || region.id === 'lh_tongue') && Array.isArray(region.actions) && region.actions.length === 0) {
    return known('a magnetic-stimulation study recorded electrical responses from tongue muscles on both sides; this does not specify normal tongue motion (Muellbacher 2001, abstract only).');
  }
  const limb = limbOf(region.displayGroup);
  if (/^contralateral/.test(lat) && limb && h) return known(`the ${h} half of the brain mainly moves the ${o} ${limb}.`);
  if (lat === 'contralateral_predominant') return known('the lower face gets most of its signals from the other half of the brain.');
  if (lat === 'bilateral_debated') return known('both halves of the brain signal the neck muscles. How much each one does is debated.');
  if (lat === 'bilateral_contralateral_bias') return known('both halves of the brain drive these muscles, and the other half drives them more.');
  if (lat === 'bilateral') return known('these muscles get signals from both halves of the brain.');
  return INFO.known;
}

/** One plain lead sentence for a region (ns-app infoPlainLead): the region's own plainLead when present (ns-bodymap
 * round 3), else a generic sentence built from the hemisphere. */
export function plainLead(region, leftArm = false) {
  if (!region) return '';
  if (typeof region.plainLead === 'string' && region.plainLead) return region.plainLead;
  if (region.kind === 'integration') return 'This in-between area is linked to planning actions, and it moves nothing in the game.';
  const h = leftArm ? 'right' : halfOf(region.hemisphere) || 'right';
  return `This part of your brain’s ${h} half sends movement signals.`;
}

/** Plain title of a region: plainLabel, else the technical label. */
export function plainTitle(region) {
  if (!region) return '';
  return str(region.plainLabel) || str(region.label) || str(region.id);
}

/** R558 (Messages 55 and 56: easier to follow; a learning tool for motor neuroanatomy): the card's line under the
 * title says which PART of the strip the area belongs to and which half of the brain it is drawn on, in the words of
 * the labels on the brain ("Left leg", "Belly and back", "Face and neck"): "Left-leg motor area (brain’s right half)".
 * It was "Motor area for another body part" for everything but the left arm. The half is where the area is drawn, not
 * a claim that only that half drives the part (the card's "Known" line says which parts both halves signal).
 * The left-arm wording is INFO.leftArmTag and is given for a left-arm card only (`leftArm`): the panel tells a
 * left-arm card by that tag, so no other tag may read "left arm". Pure. */
export function areaTag(region, leftArm = false) {
  if (leftArm === true) return INFO.leftArmTag;
  if (!region) return INFO.otherTag;
  if (region.kind === 'integration') return INFO.integrationTag;
  const h = halfOf(region.hemisphere), g = str(region.displayGroup);
  if (!h) return INFO.otherTag;
  const half = `(brain’s ${h} half)`;
  const limb = limbOf(g), side = /^left_/.test(g) ? 'Left' : /^right_/.test(g) ? 'Right' : '';
  if (limb && side && !(limb === 'arm' && side === 'Left')) return `${side}-${limb} motor area ${half}`;
  if (g === 'trunk') return `Belly-and-back motor area ${half}`;
  if (g === 'neck' || g === 'face') return `Face-and-neck motor area ${half}`;
  return INFO.otherTag;
}

/**
 * The proposed info card (lead + at most 4 short rows + short honesty lines; everything else in a collapsed
 * "More detail"). Pure: plain JSON out. Inputs:
 *  - region: a BODY_MOTOR_MAP region (with the round-3 plain fields) or null;
 *  - action: the ONE action the card explains (ns-app infoRegionAction), or null;
 *  - leftArm: the region is a left-arm area;
 *  - activity (0..1 or null), activations (count), citations ([{ key, verified }]), caveats (general caveats for More).
 * Returns { title, tag, lead, activity, activations, rows: [[label, value]] (<= 4), simulated, known, caveat,
 *   more: { title, technicalName, hemisphere, effector, explanation (plain detail), muscles: { pull, relax, steady },
 *   note (plain), caveats, sources, technical: { explanation, note } (the unchanged technical wording) } }.
 */
export function plainInfoCard({ region = null, action = null, leftArm = false, activity = null, activations = 0,
  citations = [], caveats = [], rotationState = null, atEnd = false } = {}) {
  if (!region) return null;
  const integration = region.kind === 'integration';
  const rows = [];
  // R3-fix (review SL-2): a forearm-turn area whose palm is already turned that way moves nothing; say so plainly.
  const already = action && ((action.armActionId === 'pronation' && rotationState === 'pronated') || (action.armActionId === 'supination' && rotationState === 'supinated'));
  if (action) rows.push([INFO.rows.movement, `${str(action.plainLabel) || str(action.label)}${already ? (rotationState === 'pronated' ? INFO.alreadyDown : INFO.alreadyUp) : atEnd === true ? INFO.alreadyThere : ''}`]);
  else rows.push([INFO.rows.movement, str(region.plainMoves) || INFO.noMovement]);
  const pm = action && action.plainMuscles ? action.plainMuscles : null;
  if (pm && pm.pull) rows.push([INFO.rows.agonists, pm.pull]);
  const list = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string' && x) : []);
  if (pm && pm.relax) rows.push([action && list(action.agonists).length === 0 ? INFO.rows.easeOff : INFO.rows.antagonists, pm.relax]);
  // R4-fix (review RP12): for an in-between area the bracketed network names (not a pathway) go to More detail
  // (more.pathwayName); the effector cards keep their pathway name in brackets after the plain route, which the
  // information-panel requirement (U3: "pathway") reads.
  const pw = plainPathway(region, leftArm), pwm = integration ? /^(.*?)\s*\(([^()]+)\)\s*$/.exec(pw) : null;
  rows.push([INFO.rows.pathway, pwm ? pwm[1] : pw]);
  const pull = action ? list(action.agonists) : [];
  const relax = action ? list(action.antagonists).filter(m => !pull.includes(m)) : [];
  return {
    title: plainTitle(region),
    tag: areaTag(region, leftArm),
    lead: plainLead(region, leftArm),
    activity: Number.isFinite(activity) ? activityLine(activity) : '',
    activations: activationsLine(activations),
    rows: rows.slice(0, 4),
    simulated: INFO.simulated,
    known: plainKnown(region, leftArm),
    caveat: str(region.plainCaveat || region.caveat) ? `${INFO.caveatPrefix}${str(region.plainCaveat || region.caveat)}` : '',
    // R5-text (D17): what the brain-to-muscle glow means for THIS area (show it while the area is switched on).
    glow: glowNote(region),
    more: {
      title: INFO.moreDetail,
      technicalName: str(region.label),
      pathwayName: pwm ? pwm[2] : '',
      hemisphere: halfOf(region.hemisphere) ? `${region.hemisphere} hemisphere` : '',
      effector: str(region.effector),
      // R4-text: the More detail prose is the plain restatement (ns-bodymap plainDetail / plainNote / plainNoAction:
      // short sentences, every technical term and citation kept in brackets); the technical wording is still here, in
      // `technical`, for audits and science review (the panel does not need to show it).
      explanation: str(region.plainDetail) || str(region.explanation),
      muscles: { pull, relax, steady: action ? list(action.stabilizers) : [] },
      note: action ? str(action.plainNote) || str(action.note) : str(region.plainNoAction) || str(region.noActionReason),
      caveats: list(caveats),
      sources: sourcesLine(citations),
      technical: { explanation: str(region.explanation), note: action ? str(action.note) : str(region.noActionReason) }
    }
  };
}

/**
 * R558 (Messages 50 and 56: a learning tool, so every movement names its strip part, the movement and the muscles):
 * the card for a reach key (W, A, S, D). The keys move the LEFT hand; each one switches on the left-shoulder part of
 * the motor strip (W and S the left-elbow part too). Muscle roles are the standard textbook ones for the movement
 * (prime movers only); the levels are simulated and unitless, not a measured pattern.
 */
export const REACH_INFO = deepFreeze({
  tag: INFO.leftArmTag,
  rows: { key: 'Key', area: 'Strip part', movement: 'Movement', muscles: 'Muscles that pull' },
  areaShoulder: 'Left shoulder',
  areaShoulderElbow: 'Left shoulder + left elbow',
  simulated: 'Simulated: textbook muscle roles shown at a made-up level. Nothing is measured.',
  known: '',
  dir: {
    // (21 November 2026, hunt H22: W reaches along the arm's own line, which points up when you look up: "Reach out")
    forward: { key: 'W', title: 'Reach out', movement: 'The hand reaches out along the arm\'s line: the elbow straightens and the shoulder follows',
      muscles: 'front of the deltoid, coracobrachialis, upper pectoralis major; triceps at the elbow', elbow: true },
    back: { key: 'S', title: 'Draw the hand in', movement: 'The hand draws in along the arm\'s line: the elbow bends and the shoulder follows',
      muscles: 'back of the deltoid, latissimus dorsi, teres major; biceps and brachialis at the elbow', elbow: true },
    left: { key: 'A', title: 'Swing the arm out', movement: 'The arm swings out to the left, away from the chest (horizontal abduction)',
      muscles: 'back and middle of the deltoid, infraspinatus, teres minor', elbow: false },
    right: { key: 'D', title: 'Swing the arm in', movement: 'The arm swings in across the chest (horizontal adduction)',
      muscles: 'pectoralis major, front of the deltoid, coracobrachialis', elbow: false }
  }
});

/** PURE: the information card for the reach directions shown now (ns-actions reachMuscleShow rows [{ dir, level }]).
 * The strongest direction leads; a second one held with it is added to every row. Null for no direction.
 * Returns the plainInfoCard shape { title, tag, lead, activity, activations, rows, simulated, known, caveat, more }
 * with more null (nothing technical to open), plus key (the directions, for the renderer's change test). */
export function reachInfoCard(reach) {
  const list = (Array.isArray(reach) ? reach : []).filter(r => r && REACH_INFO.dir[r.dir] && Number.isFinite(r.level))
    .slice().sort((a, b) => b.level - a.level).slice(0, 2);
  if (!list.length) return null;
  const d = list.map(r => REACH_INFO.dir[r.dir]);
  const join = (k, sep) => d.map(x => x[k]).join(sep);
  return {
    key: list.map(r => r.dir).sort().join('+'),
    title: `Left arm: ${d.map((x, i) => (i ? x.title.charAt(0).toLowerCase() + x.title.slice(1) : x.title)).join(' + ')}`,
    tag: REACH_INFO.tag,
    lead: '',
    activity: '',
    activations: '',
    rows: [
      [REACH_INFO.rows.key, `${join('key', ' + ')} (hold)`],
      [REACH_INFO.rows.area, d.some(x => x.elbow) ? REACH_INFO.areaShoulderElbow : REACH_INFO.areaShoulder],
      [REACH_INFO.rows.movement, join('movement', '. ')],
      [REACH_INFO.rows.muscles, join('muscles', '. ')]
    ],
    simulated: REACH_INFO.simulated,
    known: REACH_INFO.known,
    caveat: '',
    glow: '',
    more: null
  };
}

/**
 * R558 (Messages 48 and 56): the card for the grip of a Space grasp. While Space holds (or a tap keeps) a grasp the
 * LEFT hand of the game arm closes; when the grasp lets go the hand opens. The card names the key, the strip part (the
 * left hand's area), the movement and the muscles: the prime movers of ns-bodymap grasp_close and open_hand, with the
 * wrist extensors that steady the wrist in a grip (its listed synergists). The closed hand is a SIGN of the grasp:
 * the game carries a held item, the fingers do not touch it (said in the caveat). Levels are simulated and unitless.
 * 20 November 2026, evening (the owner, Message 204: "Let's just make spacebar grasping for all of the limbs at once"):
 * the grip closes BOTH hands and curls the toes of both feet (ns-app SPACE_GRIP), so the card names the four strip
 * parts, the toe benders with the finger benders, and both sides of the brain; a click closes nothing.
 */
export const GRASP_INFO = deepFreeze({
  tag: 'Hand and toe motor areas (both halves of the brain)',
  rows: REACH_INFO.rows,
  area: 'Left hand, right hand, left toes, right toes',
  simulated: REACH_INFO.simulated,
  close: {
    title: 'Hands and feet: grip',
    keyHeld: 'Space (held down)',
    keyKept: 'Space (tapped once)',
    movement: 'Both hands curl closed into a grip and the toes of both feet curl (finger, thumb and toe flexion)',
    muscles: 'finger benders in the forearm (flexor digitorum superficialis and profundus), long thumb bender (flexor pollicis longus), ' +
      'thumb muscles of the palm (flexor pollicis brevis, opponens pollicis, adductor pollicis); toe benders (flexor digitorum longus ' +
      'and brevis, flexor hallucis longus and brevis). The wrist extensors hold the wrists steady',
    caveat: 'Game rule: the closed hands and curled toes are a sign of the grasp. The game carries what is held; nothing touches it.'
  },
  open: {
    title: 'Hands and feet: let go',
    key: 'Space (let go)',
    movement: 'The fingers and thumbs straighten and the hands open (finger and thumb extension); the toes uncurl',
    muscles: 'finger straighteners on the back of the forearm (extensor digitorum, extensor indicis, extensor digiti minimi), ' +
      'thumb straighteners (extensor pollicis longus and brevis)',
    caveat: 'Game rule: the hands open when they let go. A real hand can also let go just by relaxing.'
  },
  holding: { brain: 'the brain', mirror: 'the mirror body', rightArm: 'your right hand', leftArm: 'your left hand', rightLeg: 'your right foot', leftLeg: 'your left foot' },
  leadHeld: 'Let go of Space to release it.',
  leadKept: 'Tap Space again to let go.',
  // (22 November 2026, WORDS2, hunt H10: "or one of your limbs" is gone: Space there chooses the limb, leadChosen below)
  leadNothingHeld: 'Nothing is held: put the crosshair on the brain or the mirror body, then press Space.',
  leadNothingKept: 'Tap Space again to open the hands.',
  // 21 November 2026 (hunt H16): Space on one of your own limbs chooses that limb (ns-app LIMB_KEYS.view.hold): nothing
  // holds it, the keys and your look move it. The card said "Nothing is held: put the crosshair on ... one of your
  // limbs, then press Space", which the player had just done.
  chosen: { leftArm: 'Your left arm', rightArm: 'Your right arm', leftLeg: 'Your left leg', rightLeg: 'Your right leg' },
  leadChosen: 'is chosen: W A S D and your look move it.'
});

/** PURE: the information card for the grip of a Space grasp. grip = { phase: 'close' | 'open', holding: 'brain' |
 * 'mirror' | a limb id (ns-grasp LIMB_IDS) | null, chosen: the limb id this press of Space chose (nothing held) | null,
 * kept: the hold was taken with a tap }. Null for no grip.
 * Returns the plainInfoCard shape (as reachInfoCard), with key for the renderer's change test. */
export function graspInfoCard(grip) {
  if (!grip || (grip.phase !== 'close' && grip.phase !== 'open')) return null;
  const closing = grip.phase === 'close', kept = grip.kept === true;
  const part = closing ? GRASP_INFO.close : GRASP_INFO.open;
  const what = typeof grip.holding === 'string' && Object.prototype.hasOwnProperty.call(GRASP_INFO.holding, grip.holding) ? GRASP_INFO.holding[grip.holding] : null;
  const chose = !what && typeof grip.chosen === 'string' && Object.prototype.hasOwnProperty.call(GRASP_INFO.chosen, grip.chosen) ? GRASP_INFO.chosen[grip.chosen] : null;
  const lead = !closing ? ''
    : what ? `Holding ${what}. ${kept ? GRASP_INFO.leadKept : GRASP_INFO.leadHeld}`
      : chose ? `${chose} ${GRASP_INFO.leadChosen}${kept ? ` ${GRASP_INFO.leadNothingKept}` : ''}`
        : kept ? GRASP_INFO.leadNothingKept : GRASP_INFO.leadNothingHeld;
  return {
    key: `${grip.phase}|${what ? grip.holding : chose ? `chose:${grip.chosen}` : '-'}|${closing && kept ? 'kept' : 'held'}`,
    title: part.title,
    tag: GRASP_INFO.tag,
    lead,
    activity: '',
    activations: '',
    rows: [
      [GRASP_INFO.rows.key, closing ? (kept ? part.keyKept : part.keyHeld) : part.key],
      [GRASP_INFO.rows.area, GRASP_INFO.area],
      [GRASP_INFO.rows.movement, part.movement],
      [GRASP_INFO.rows.muscles, part.muscles]
    ],
    simulated: GRASP_INFO.simulated,
    known: '',
    caveat: part.caveat,
    glow: '',
    more: null
  };
}

/* ------------------------------------------------------------------ brain labels, orientation, legend, arrows, face */

/** On-brain group labels (ns-scene-three regionGroupLabel / LEFT_ARM_LABEL). The part comes first; the brain half is
 * the smaller second part in brackets. */
export const LEFT_ARM_LABEL = 'Left arm (brain’s right half)';
export function regionGroupLabel(key, hemisphere) {
  const halfWords = hemisphere === 'left' ? 'brain’s left half' : 'brain’s right half';
  const side = hemisphere === 'left' ? 'Right' : 'Left';
  switch (key) {
    case 'leftArm': return LEFT_ARM_LABEL;
    case 'arm': return `${side} arm (${halfWords})`;
    case 'leg': return `${side} leg (${halfWords})`;
    case 'trunk': return `Belly and back (${halfWords})`;
    case 'face': return `Face and neck (${halfWords})`;
    default: return null;
  }
}

/** R/L and front/back labels on the brain (ns-app ORIENTATION_TEXT). Already plain; the anatomical word stays in
 * brackets because the movement-map display contract asks for anterior/posterior labels. */
/* 19 November 2026 (the brain turned half a turn, ns-brain BRAIN_VIEW.spinDeg 180): the keys are still the brain's own
 * sides and ends. Its right half is now on the LEFT of the picture and its front at the BOTTOM, so the labels name the
 * brain's half (an arrow pointing away from the half it names would mislead) and the front / back arrows are turned. */
export const ORIENTATION = deepFreeze({
  right: 'Brain’s right half', left: 'Brain’s left half', anterior: 'Front (anterior) ↓', posterior: '↑ Back (posterior)'
});
export const ORIENTATION_SHORT = deepFreeze({ right: 'Right half', left: 'Left half' });

/** Orbit arrows (ns-scene-three ORBIT_ARROWS tip/label): short hover captions start with "Orbit". R558 (hunt 2): the
 * camera stays at your eyes, so what you see is the brain turning about its own centre; it stays where it is. */
export const ORBIT = deepFreeze({
  // (19 November 2026: the brain's front is at the bottom, so the upper arrow, 'forward', now brings its BACK round)
  tip: { forward: 'Orbit: show its back', back: 'Orbit: show its front', left: 'Orbit: show the side on your left', right: 'Orbit: show the side on your right' },
  label: {
    forward: 'Orbit the brain about its own centre so more of its back faces you. It turns in place.',
    back: 'Orbit the brain about its own centre so more of its front faces you. It turns in place.',
    left: 'Orbit the brain about its own centre so more of the side on your left faces you. It turns in place.',
    right: 'Orbit the brain about its own centre so more of the side on your right faces you. It turns in place.'
  },
  holdHint: 'Click for a small turn. Hold to keep turning.'
});

/** Colour key and legend (ns-scene-three HUD_LEGEND_KEY / HUD_LEGEND_SHARED / HUD_REGION_NOTE, ns-app
 * REGION_MODE_NOTE, ns-brain LEGEND_LABEL). key rows: [cssClass, long words, short words]. */
export const LEGEND = deepFreeze({
  // R558 (user Message 2): the colour says WHICH area (one colour per area, the same on the brain, your muscles and the
  // mirror body); the brightness says HOW STRONG. The bar is the glow strength, not a colour scale any more.
  label: 'Area colours (simulated, no units)',
  // R3-polish: the ramp ends say what they mean (0 = resting, 1 = strongest), as the intro does.
  lo: '0 resting',
  hi: 'strongest 1',
  shared: 'brighter glow = stronger; same colour on brain, body and mirror',
  // R558: one chip per colour family (ns-colors AREA_FAMILIES keys): [family, words].
  families: [
    ['leftArm', 'Left arm'],
    ['rightArm', 'Right arm'],
    ['leftLeg', 'Left leg'],
    ['rightLeg', 'Right leg'],
    ['trunk', 'Belly, back'],
    ['faceNeck', 'Face, neck'],
    ['scan', 'Move nothing']
  ],
  familiesLabel: 'Colour families (light and dark shades for neighbouring areas)',
  key: [
    ['activated', 'A shade darker: used before (until Reset body)', 'Used before'],
    ['dot', 'Dots: left-arm control spots', 'Arm spots']
  ],
  // R3-fix (review SL-3): the movement map's pinned qualifier (MOVEMENT-MAP cortical_display_contract
  // .minimum_qualifier_visible) is shown VERBATIM here, in the legend that is visible in every layout.
  regionNote: 'A rough map (Representative motor map · regions overlap and vary between people). Dots: rough spots, ' +
    'not exact points.',
  tintNote: 'Each area has its own colour; it and the muscles it moves glow in that colour. A colour code for the game, ' +
    'not real brain borders or a measurement. The glow is just for show.',
  detailsSummary: 'Sources and rights',
  licenceLinks: ['Licence: CC BY 4.0', 'BodyParts3D licence page (DBCLS)', 'BodyParts3D source']
});

/** R558 (R26): the floating own-face display and its captions are removed. The keys stay (the renderer reads them when
 * it loads) but are empty, and nothing shows them. */
export const FACE = deepFreeze({ ghostLabel: '', insetLabel: '' });

/* ------------------------------------------------------------------ R558 (genuine note R31): tapping a muscle */

/** Where a tapped muscle was: on your own body or on the mirror body (which copies you; it does not swap sides). */
export const MUSCLE_TAP = deepFreeze({ onYou: 'on your body', onMirror: 'on the mirror body' });
const brainHalf = h => (h === 'left' ? 'the brain’s left half' : h === 'right' ? 'the brain’s right half' : 'the brain');
/** The plain line shown after a muscle is tapped. The link is the game's whole-area map (the same one used when you look
 * at the area), so the line says "area" and never names a spot for one muscle. movement: the area's action label when
 * the map moves this muscle, else null (only the area lights). */
export function muscleTapLine({ muscle, where, area, hemisphere = null, movement = null } = {}) {
  const head = `You tapped ${muscle} ${where}.`;
  const lit = `It switched on the ${area} area in ${brainHalf(hemisphere)}`;
  return movement
    ? `${head} ${lit}: ${movement}. That area drives a group of muscles, not this one alone (simulated).`
    : `${head} ${lit}. The game has no movement for this muscle, so only its area lights up (simulated).`;
}
/** The line for a tapped bone: bones are not switched on. */
export function muscleTapBoneLine(name, where) { return `That is a bone (${name}, ${where}). Tap a muscle to switch it on.`; }

/* ------------------------------------------------------------------ round 5 (R5-text): E, arrows, mirror, glow, layers, face */

/** The E key: first person <-> view from behind (D18, user R22; ns-camera). Keys controlsRow / thirdPersonBadge /
 * armNote match ns-camera VIEW_TEXT, so ns-camera can take them over one to one. */
export const VIEW = deepFreeze({
  key: 'E',
  controlsRow: ['E', 'see your body from straight behind your head (third person). Press E again to go back to your own eyes. E lets go of anything Space holds.'],
  thirdPersonBadge: HUD.thirdPerson,
  firstPersonNotice: HUD.firstPerson,
  // R558 (ns-camera THIRD_PERSON.followHead): the mouse turns the head in both views; only the camera moves.
  armNote: 'Your head, neck and left hand follow the mouse just as they do in your own view. W, A, S, D and Space still work the same way.',
  lookNote: 'Move the mouse or trackpad to turn your view around the body.'
});

/** The 3D compass arrows (D16, user R20): four arrows round the brain (top, bottom, left, right) and four smaller ones
 * round the mirror body. 19 November 2026: the brain is turned half a turn (its front at the bottom of the picture), so
 * the TOP arrow, whose id is still 'forward', now shows more of the brain's BACK and the bottom arrow ('back') more of
 * its FRONT: an arrow still brings round the side it stands on, and the words say which side that is. tip = the short hover caption; label = the accessible name
 * (aria-label / title), which also says what a click and a hold do. Mirror arrows: the top / bottom tips tilt it (a
 * view from above / below), the side tips turn it round. The round-4 ORBIT captions stay for the HUD buttons until
 * ns-scene-three retires them.
 * R558 (hunt 2): the camera stays at your eyes, so a brain arrow turns the BRAIN about its own centre (it stays where it
 * is) and shows more of the side the arrow points to; the same turn as a press-and-drag on the brain. */
export const ARROWS = deepFreeze({
  brain: {
    tip: { forward: 'Turn the brain: show more of its back', back: 'Turn the brain: show more of its front', left: 'Turn the brain: show more of the side on your left', right: 'Turn the brain: show more of the side on your right' },
    label: {
      forward: 'Turn the brain about its own centre so more of its back faces you. Click for a small turn. Hold to keep turning. It turns in place.',
      back: 'Turn the brain about its own centre so more of its front faces you. Click for a small turn. Hold to keep turning. It turns in place.',
      left: 'Turn the brain about its own centre so more of the side on your left faces you. Click for a small turn. Hold to keep turning. It turns in place.',
      right: 'Turn the brain about its own centre so more of the side on your right faces you. Click for a small turn. Hold to keep turning. It turns in place.'
    }
  },
  mirror: {
    // R558 (user Message 45): all four arrows orbit. The top and bottom arrows tilt the mirror body about its own
    // centre (the brain's top and bottom arrows do the same to the brain); they no longer slide it along the ground.
    tip: { forward: 'Tilt the mirror body: see it from above', back: 'Tilt the mirror body: see it from below', left: 'Turn the mirror body: go round to the left', right: 'Turn the mirror body: go round to the right' },
    label: {
      forward: 'Tilt the mirror body so you see it more from above. Click for a small turn. Hold to keep turning. It stops when you look straight down on it.',
      back: 'Tilt the mirror body so you see it more from below. Click for a small turn. Hold to keep turning. It stops when you look straight up at it.',
      left: 'Turn the mirror body: go round it to the left. Click for a small turn. Hold to keep turning. Go all the way round to see its back.',
      right: 'Turn the mirror body: go round it to the right. Click for a small turn. Hold to keep turning. Go all the way round to see its back.'
    }
  },
  holdHint: 'Click for a small turn. Hold to keep turning.'
  // R558 (Message 7): the arrow tips are drawn in front of everything and answer a click wherever they are drawn, so
  // the former "behindArm" and "mirrorBlocked" lines (an arrow hidden by the arm, a mirror arrow the brain covers) no
  // longer describe anything that can happen and are gone (no code read them).
});

/** Plain names of the mirrored parts (ns-mirror MIRROR_PART_NAMES keys). */
export const MIRROR_PART_NAMES = deepFreeze({
  leftArm: 'your left arm', rightArm: 'your right arm', torso: 'your chest, belly and back', legs: 'your legs',
  neck: 'your neck', face: 'your face and head', other: 'your body'
});

/** The mirror body (D19, user R23; ns-mirror). The first twelve keys match ns-mirror MIRROR_TEXT one to one. Every
 * label names YOUR part plus "(mirror image)", never "its right arm" (ns-mirror CHIRALITY). R558 (hunt 2): the
 * never-shown "blocked" line is gone (the brain no longer blocks the mirror body's arrows or clicks). */
export const MIRROR = deepFreeze({
  name: 'Mirror body',
  tag: 'A mirror image of your body',
  label: 'Mirror body (a mirror image of you)',
  lead: 'This is a mirror image of you, as in a real mirror in front of you. It copies every move your body makes.',
  explanation: 'It shows the same pose, muscle colours, lifted outer muscles and glow as your body, at the same time. ' +
    'It is only a picture. It is not a second person.',
  arrows: 'Click a side arrow by the mirror body to turn it a little, or the top or bottom arrow to tilt it and see it from above or below. ' +
    'Hold an arrow to keep going. Go all the way round to see its back.',
  turned: 'You see the mirror body from another side. Reset brain view puts it back.',
  reset: SHELL.resetMirror,
  resetHelp: 'Puts the mirror body back where a mirror shows you.',
  simulated: 'Simulated: it shows the same made-up signals as your body (no real units). Nothing is read from it.',
  escRow: 'Hold Space on the mirror body’s head or trunk. Move the pointer up to lift it or down to lower it. Its arrows turn or tilt it. In front of a motor area Space takes the brain, so hold Shift as you press Space; elsewhere Shift + Space takes the brain behind it.',
  partSuffix: ' (mirror image)',
  /** The task's two short lines: what it is, and how to reach its arrows. */
  what: 'A mirror image of your body. It copies every move you make.',
  reach: 'Hold Space on the head or trunk. Move the pointer to carry the mirror body. Its arrows turn or tilt it.',
  side: 'Like a real mirror: your left arm shows on the same side of the screen. Once you turn it round, you see it ' +
    'from behind.',
  turnedSeparate: 'You see the mirror body from another side. Reset mirror body puts it back.',
  rows: { shows: 'What it shows', side: 'Which side', turn: 'How to turn it' },
  rowShows: 'your pose, colours, lifted muscles and glow, at the same time',
  rowSide: 'like a real mirror, your left arm is on the same side',
  rowTurn: 'Side arrows turn it. Top and bottom arrows tilt it.'
});

/** "Your left arm (mirror image)" for an ns-mirror part id; unknown parts read "Your body (mirror image)". */
export function mirrorPartName(part) {
  const n = MIRROR_PART_NAMES[part] || MIRROR_PART_NAMES.other;
  return `${n[0].toUpperCase()}${n.slice(1)}${MIRROR.partSuffix}`;
}

/**
 * The plain panel card for a look at the mirror body (D19: "Looking at it shows plain panel info about the mirrored
 * part"). Same fields as ns-mirror mirrorInfoCard ({ key, mode, viewed, title, tag, plain, explanation, simulated,
 * caveats, part, activity }) plus lead and rows ([label, value], 3 rows) in the plainInfoCard style. resetButton true:
 * the separate "Reset mirror body" button turns it back (else Reset brain view does).
 */
export function mirrorInfoCard({ part = 'other', activity = null, turned = false, resetButton = false } = {}) {
  const p = MIRROR_PART_NAMES[part] ? part : 'other';
  const caveats = [MIRROR.explanation];
  if (turned) caveats.push(resetButton ? MIRROR.turnedSeparate : MIRROR.turned);
  caveats.push(MIRROR.arrows);
  return {
    key: `mirror|${p}|${turned ? 'turned' : 'front'}`, mode: 'mirror', viewed: 'now', title: mirrorPartName(p), tag: MIRROR.tag,
    lead: MIRROR.lead, plain: MIRROR.lead, explanation: MIRROR.explanation, simulated: MIRROR.simulated, caveats, part: p,
    rows: [[MIRROR.rows.shows, MIRROR.rowShows], [MIRROR.rows.side, MIRROR.rowSide], [MIRROR.rows.turn, MIRROR.rowTurn]],
    activity: Number.isFinite(activity) ? Math.min(1, Math.max(0, activity)) : null
  };
}

/** The brain-to-muscle glow (D17, user R21). Panel lines say plainly that it is a picture of the game's link, not a
 * nerve, and name the real route for that body part (body: spinal cord; head and face: the base of the brain; neck:
 * both). */
// 21 November 2026 (EMAP, section 192; the owner: "let's try an electrical mapping view, like you see in functional
// neuroscience, connectomic live maps, dynamic maps"; 20 November: "we can actually see electrical storms and electrical
// activity and neural activity and networks and pathways ... from brain to body and body to brain"). The words of the
// electrical map (the M key; ns-emap). Little text, one chunk: a title and three short lines on the short card (the
// command going down, the report coming up, one line of honesty); under More detail the route of the area under the
// look in plain words (the area's own sentences about its fibres where its text has them: emapRouteLines) and what
// kind of picture this is. Honesty in the four words the game uses: the signal is simulated, the routes are schematic
// (typical, simplified, drawn by hand, not traced from a scan), nothing was recorded or measured, and the travel is
// slowed (emapSlowLine states by how much, from the map's own display speed).
// Later the same day, after a picture of the "more" level: More detail was 26 lines of small type (about 1070
// characters: four sentences of route, four about the picture) and lay on the game's own information panel. The owner:
// "Way too much text now". It is now at most nine short lines in a low card above that panel (quiet.css): either the
// route of the area under the look (one sentence of the area's own, without its bracketed terms, which the
// information panel beside it gives in full; how the signal goes on; the report; "typical, simplified"), or, before
// any area was looked at, what kind of picture this is (the bridge, typical paths, simulated and how much slower).
export const EMAP = deepFreeze({
  title: 'Electrical map',
  keyHint: 'Press M to hide',
  down: 'Command: brain to muscle',
  up: 'Report: muscle back to brain',
  // 22 November 2026 (part 3, the live scan): the scan's colour bar, and the honesty line for a picture that is now a
  // live scan with storms (it was "A drawn picture, slowed down. Not a recording."; that it is slowed is said under
  // More detail)
  scan: 'Activity: calm to stormy',
  honest: 'Made-up activity, drawn like a live brain scan. Not a recording.',
  more: {
    lookAt: 'Look at a coloured area for its route.',
    cross: 'Its fibres run down through the middle of the brain and cross to the other side low in the brainstem (medulla).',
    both: 'Its fibres run down through the middle of the brain. Low in the brainstem most cross to the other side, and some stay.',
    head: 'Its fibres run down through the middle of the brain to the cells of a head nerve in the brainstem, on one side or on both.',
    out: 'Then the signal runs down the spinal cord and out along a nerve to the muscles.',
    outHead: 'Then the signal runs out along a nerve of the head or upper neck to the muscles.',
    none: 'This in-between area sends nothing down to the body in the game. Its lines show brain regions it is linked with.',
    back: 'Paler beads: the body’s report, back up to the feeling strip behind the block.',
    routeNote: 'A typical route, simplified.',
    bridge: 'The big brain is the mirror body’s own brain, drawn large. The line down to that body’s neck joins one and the same place.',
    typical: 'The paths are typical and simplified, as anatomy books teach them. They are not traced from a scan.',
    standIn: 'The named nerves could not be loaded: each body part has one plain run of nerve instead.'
  }
});

/** "About N times": a whole number from a display factor (never below 2: the map is always slower than real). */
const emapTimes = x => String(Math.max(2, Math.round(Number.isFinite(x) ? x : 2)));
/** The legend's line about the signal and its speed, from the map's own factors (ns-emap model.slow: real speed over
 * display speed, for the command and for the report; real: about 50 metres a second in large nerve fibres, a typical
 * textbook value, stated in DESIGN-DECISIONS section 192). */
export function emapSlowLine(command, report) {
  return `The signal is made up by the game (simulated). The command is drawn about ${emapTimes(command)} times slower than in a real nerve, the report about ${emapTimes(report)} times slower.`;
}
/** The route of the area under the look, in plain words, for the map's More detail: at most four short lines. First
 * the area's own sentence about its fibres where its text has one (ns-bodymap plainDetail), without its bracketed
 * terms (the information panel beside the legend gives them in full), else one plain sentence from its pathway and
 * laterality fields; then how the signal goes on (down the cord, or straight out along a nerve of the head or the upper
 * neck: some throat muscles are served by the first neck nerves), the report, and
 * that the route is typical. No area: one line that says where to look. */
export function emapRouteLines(region) {
  const T = EMAP.more;
  if (!region || typeof region !== 'object') return [T.lookAt];
  if (region.kind === 'integration' || region.pathway === 'integration') return [T.none];
  const p = String(region.pathway || ''), headOnly = /corticobulbar/.test(p) && !/corticospinal/.test(p);
  const own = (String(region.plainDetail || '').match(/[^.!?]+[.!?]+/g) || []).map(x => x.trim()).filter(x => /\bfibres?\b/i.test(x) && x.length < 260)
    .map(x => x.replace(/\s*\([^()]*\)/g, '').replace(/\s+([;,.])/g, '$1').trim()).filter(x => x.length > 20)[0];
  return [own || (headOnly ? T.head : /^contralateral/.test(String(region.laterality || '')) ? T.cross : T.both), headOnly ? T.outHead : T.out, T.back, T.routeNote];
}

export const GLOW = deepFreeze({
  body: 'The glow shows which muscles this brain area drives in the game. Real signals travel from the brain down the ' +
    'spinal cord and along nerves to the muscles.',
  head: 'The glow shows which muscles this brain area drives in the game. Real signals for the head and face go from ' +
    'the brain to its base (brainstem), then along nerves to the muscles.',
  neck: 'The glow shows which muscles this brain area drives in the game. Real neck signals go to the base of the brain ' +
    'and the top of the spinal cord, then along nerves.',
  none: 'No glow: this area drives no muscles in the game.',
  noShape: 'No glow on the body: the 3D body has no muscles for this.',
  legend: 'Same colour: the muscles a switched-on area drives (a picture, not a nerve)',
  legendShort: 'Same colour',
  mirror: 'The same colour glows on the mirror body.',
  more: 'A picture of the simulated area-to-muscle link, not a pathway (real route: corticospinal tract to spinal motor ' +
    'neurons, or corticobulbar fibres to brainstem nuclei, then peripheral or cranial nerves).'
});

/** The glow line for a body-map region (plainInfoCard `glow`). opts.musclesShown false: the area drives muscles the 3D
 * body has no shape for, so no glow end is drawn (GLOW.noShape). In-between areas and areas without an action of
 * their own (the left shoulder) drive no muscles (GLOW.none). */
export function glowNote(region, { musclesShown = true } = {}) {
  if (!region) return GLOW.body;
  if (region.kind === 'integration' || !Array.isArray(region.actions) || !region.actions.length) return GLOW.none;
  if (musclesShown === false) return GLOW.noShape;
  const p = str(region.pathway);
  if (p.includes('corticospinal') && p.includes('corticobulbar')) return GLOW.neck;
  if (p === 'corticobulbar') return GLOW.head;
  return GLOW.body;
}

/** The lifted outer muscles (D15, user R19: "Gunther von Hagens style body worlds, so that we can see into the deep
 * muscles"). note / real are the task's plain lines (the Esc limits carry HONESTY.bodyWorlds). */
export const BODY_WORLDS = deepFreeze({
  note: 'The outer muscles are lifted out a little, like in a Body Worlds exhibit. That lets you see the deeper muscles ' +
    'under them. Their ends stay on the bones. Every muscle is drawn a little fuller.',
  real: 'In a real body, the outer muscles lie right on top of the deeper ones.',
  setting: SHELL.bodyWorlds,
  help: SHELL.bodyWorldsHelp,
  on: 'On',
  off: 'Off',
  /** A panel / hover word for one muscle (optional): outer (lifted) or deeper. */
  outer: 'outer muscle (lifted a little)',
  deep: 'deeper muscle'
});

/** Face layer captions once the face and chewing muscles are in the build (D20, faceLayerText(true)). The tongue
 * muscles are still missing (the face packet has only face and chewing muscles). On the mirror body and in the view
 * from behind the head is drawn in place. */
export const FACE_R5 = deepFreeze({
  // R558 (R26): no floating own-face display, so no caption for it (keys kept empty for the renderer).
  ghostLabel: '', insetLabel: '',
  /** Shown until R5-face confirms the exact source, version, author and licence of the face meshes (faceAttributionLine). */
  // TODO(R5-face / integrator): replace with faceAttributionLine(<R5-face ATTRIBUTION-AND-LICENCES fields>).
  attributionPlaceholder: 'Face and chewing muscles: source and licence still being checked'
});

/** R5-integrate-core (D20): the confirmed credit fields of the face packet (packets/face-muscles-r1/ATTRIBUTION-AND-
 * LICENCES.txt, R5-face): the short line (faceAttributionLine), the long credit (faceAttributionDetail) and the credit
 * text the source asks for, quoted as given. */
export const FACE_CREDIT = deepFreeze({
  title: 'Face muscles',
  author: 'Z-Anatomy',
  source: 'Z-Anatomy open source 3D atlas of anatomy (built on BodyParts3D)',
  licence: 'CC BY-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  changes: 'only the face and chewing muscles were taken, converted and moved to fit this body; the game draws simplified copies of them with fewer triangles; parts of the scalp muscles are drawn lifted onto the skull',
  required: '"Z-Anatomy - The open source atlas of anatomy - CC-BY-SA 4.0"; "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan".'
});

/** R558 (builder AN): the credit fields of the missing-muscles packet (packets/missing-muscles-r1/ATTRIBUTION-AND-
 * LICENCES.txt). Its BodyParts3D 4.0 files fall under the BodyParts3D line already shown (CC BY 4.0); its Z-Anatomy
 * files need the Z-Anatomy credit and share-alike, quoted as the source asks. */
export const MISSING_MUSCLES_CREDIT = deepFreeze({
  title: 'Back, belly and foot muscles',
  author: 'Z-Anatomy',
  source: 'Z-Anatomy open source 3D atlas of anatomy (built on BodyParts3D)',
  licence: 'CC BY-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  changes: 'only latissimus dorsi, rectus abdominis, the internal oblique, transversus abdominis, quadratus lumborum, longus colli, extensor digitorum brevis and flexor hallucis brevis were taken, converted and moved to fit this body; the game draws simplified copies of them with fewer triangles',
  required: '"Z-Anatomy - The open source atlas of anatomy - CC-BY-SA 4.0"; "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan".'
});

/** R5-integrate-core (D20, R5-load W-F6): the load line while the face muscles stream in. */
export function faceLoadingLine(done, total) { return `Loading the face muscles ${done}/${total}…`; }

/** Face layer captions for a build: FACE_R5 when the face and chewing muscle meshes are loaded, else the round-4 FACE. */
export function faceLayerText(faceMuscles = false) { return faceMuscles === true ? FACE_R5 : FACE; }

/**
 * The short visible CC BY-SA credit line for the face meshes (next to HUD.rights, the same short form), from R5-face's
 * ATTRIBUTION-AND-LICENCES / manifest fields { title, author, licence, changes }. A missing author or licence gives
 * FACE_R5.attributionPlaceholder (clearly marked), so an unconfirmed line is never shown as if it were checked.
 * Example (illustration only, NOT confirmed): faceAttributionLine({ author: 'Z-Anatomy', licence: 'CC BY-SA 4.0',
 * changes: 'only these muscles, fitted to the skull' }) -> "Face muscles: Z-Anatomy, CC BY-SA 4.0 (changed)".
 */
export function faceAttributionLine(meta = null) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const author = str(m.author).trim(), licence = str(m.licence || m.license).trim();
  if (!author || !licence) return FACE_R5.attributionPlaceholder;
  const title = str(m.title).trim() || 'Face muscles';
  return `${title[0].toUpperCase()}${title.slice(1)}: ${author}, ${licence}${str(m.changes).trim() ? ' (changed)' : ''}`;
}

/**
 * The longer credit for the "Sources and rights" details (CC BY-SA needs title, author, source, licence and the
 * changes): { title, author, source, licence, url, changes } -> e.g. "Face and chewing muscles by Z-Anatomy, from the
 * Z-Anatomy atlas, CC BY-SA 4.0. Changes: only these muscles, fitted to the skull. These shapes stay under CC BY-SA 4.0."
 * A missing author, source or licence gives the placeholder.
 */
export function faceAttributionDetail(meta = null) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const author = str(m.author).trim(), source = str(m.source).trim(), licence = str(m.licence || m.license).trim();
  if (!author || !source || !licence) return FACE_R5.attributionPlaceholder;
  const title = str(m.title).trim() || 'Face and chewing muscles';
  const changes = str(m.changes).trim().replace(/\.$/, '');
  return `${title[0].toUpperCase()}${title.slice(1)} by ${author}, from the ${source.replace(/^the /i, '')}, ${licence}.` +
    (changes ? ` Changes: ${changes}.` : '') + ` These shapes stay under ${licence}.`;
}

/** Plain names of the face and chewing muscles (D20: "plain names with the technical name in brackets"), keyed by the
 * R5-face selection slugs (acquisition/face-r1/tools/selection.py, read 2026-11-09, PRELIMINARY). Same everyday words
 * as the body map's muscle groups ("the forehead muscle", "ring muscles around the eyes", "smile muscles", "the ring
 * muscle around the mouth", "jaw-closing (chewing) muscles"). TODO(R5-face / integrator): a slug the final packet adds
 * gets its label from faceMuscleLabel's fallback (the packet's own name) until it is added here. */
export const FACE_MUSCLE_NAMES = deepFreeze({
  frontalis: 'Forehead muscle (frontalis: frontal belly of occipitofrontalis)',
  occipitalis: 'Back-of-head muscle (occipitalis: occipital belly of occipitofrontalis)',
  temporoparietalis: 'Thin scalp muscle above the ear (temporoparietalis)',
  'corrugator-supercilii': 'Frown muscle between the eyebrows (corrugator supercilii)',
  procerus: 'Frown muscle at the top of the nose (procerus)',
  'orbicularis-oculi-orbital': 'Ring muscle around the eye, outer part (orbicularis oculi, orbital part)',
  'orbicularis-oculi-palpebral': 'Ring muscle in the eyelid (orbicularis oculi, palpebral part)',
  nasalis: 'Nose muscle (nasalis)',
  'depressor-septi-nasi': 'Muscle that pulls the nose tip down (depressor septi nasi)',
  'levator-labii-superioris-alaeque-nasi': 'Muscle that lifts the lip and opens the nostril (levator labii superioris alaeque nasi)',
  'levator-labii-superioris': 'Muscle that lifts the upper lip (levator labii superioris)',
  'zygomaticus-minor': 'Small smile muscle (zygomaticus minor)',
  'zygomaticus-major': 'Main smile muscle (zygomaticus major)',
  'levator-anguli-oris': 'Muscle that lifts the mouth corner (levator anguli oris)',
  risorius: 'Muscle that pulls the mouth corner out to the side (risorius)',
  buccinator: 'Cheek muscle (buccinator)',
  'orbicularis-oris': 'Ring muscle around the mouth (orbicularis oris)',
  'depressor-anguli-oris': 'Muscle that pulls the mouth corner down (depressor anguli oris)',
  'depressor-labii-inferioris': 'Muscle that pulls the lower lip down (depressor labii inferioris)',
  mentalis: 'Chin muscle (mentalis)',
  platysma: 'Thin sheet muscle of the neck (platysma)',
  'masseter-superficial': 'Chewing muscle on the cheek, outer part (masseter, superficial part)',
  'masseter-deep': 'Chewing muscle on the cheek, inner part (masseter, deep part)',
  temporalis: 'Jaw-closing chewing muscle at the side of the head (temporalis)',
  'medial-pterygoid': 'Deep jaw-closing chewing muscle (medial pterygoid)',
  'lateral-pterygoid-superior': 'Deep chewing muscle that steadies the jaw joint (lateral pterygoid, upper head)',
  'lateral-pterygoid-inferior': 'Deep chewing muscle that helps open the jaw (lateral pterygoid, lower head)'
});

/** The plain label of one face or chewing muscle: FACE_MUSCLE_NAMES[slug], else the packet's own name (fallback), else
 * the slug in words. side 'left' | 'right' adds "left" / "right" in front ("Left main smile muscle (zygomaticus major)"). */
export function faceMuscleLabel(slug, { side = null, fallback = '' } = {}) {
  const base = FACE_MUSCLE_NAMES[slug] || str(fallback).trim() || str(slug).replace(/-/g, ' ');
  if (side !== 'left' && side !== 'right' || !base) return base;
  return `${side === 'left' ? 'Left' : 'Right'} ${base[0].toLowerCase()}${base.slice(1)}`;
}

/** "plain name (technical name)" for a muscle label, e.g. muscleLabel('chewing muscle at the cheek', 'masseter'). */
export function muscleLabel(plain, technical = '') {
  const p = str(plain).trim(), t = str(technical).trim();
  return t && p && t.toLowerCase() !== p.toLowerCase() ? `${p} (${t})` : p || t;
}

/* ------------------------------------------------------------------ "Try this" guide (round 4, D7) */

/** Wording of the optional first-time "Try this" guide (ns-guide.mjs is the state machine; this is only text).
 * One short plain line at a time. Every line names a game control and what you will see; none says the game reads,
 * records or sends brain signals (looks, clicks and keys stay game controls). Goal ids match ns-guide
 * GUIDE_ALL_GOAL_IDS. `partial` lines replace a goal's line when half of it is done.
 * R558 (Messages 55 and 56: easier to use; a learning tool for motor neuroanatomy): the first lines teach what the game
 * is for (an area of the brain, its numbered movements on the card, the same for another body part, then watching the
 * movement on the body); the hand, Space and arrow gestures come after. */
export const GUIDE = deepFreeze({
  label: 'Try this',
  // Short on purpose: the line sits in the status card (about 40 characters per line there), so each goal is one or
  // two short sentences.
  goals: {
    // R4-fix (reviews SL4-4 / RP6): name areas that visibly move the arm (the shoulder area and "Relax left grip" on
    // an open hand move nothing you can see, and do not complete this goal).
    leftArmArea: 'Look at a blue area, like the left wrist. Click it to move your arm.',
    // R558 (Messages 55 and 56): the information card lists the area's movements with numbers; a number key does the
    // movement with that number (ns-app; the same simulated pulse as a tap on one of its muscles).
    numberKey: 'Now press 1 or 2. Each number does one movement from the tip or the card.',
    moveHand: 'Press W, A, S or D to move the hand or foot of the limb you chose.',
    // R558 (Message 40): the goal ids stay so saved progress keeps: 'flipPalm' = a double tap (one turn of every limb),
    // 'fist' = a double tap held (the slow turn); ns-guide now teaches flipPalm first.
    fist: 'Tap Space twice and hold: the limbs keep turning, slowly. Let go to stop.',
    flipPalm: 'Tap Space twice, fast: all four limbs turn once.',
    // R4-fix (reviews F3 / SL4-4): 14 grey areas move nothing; this goal completes only on one that moves a joint.
    // R558: names the orange right-arm areas (your right arm is in view while you look at the brain; the legs are not).
    otherPart: 'Look at an area of another colour, like an orange right-arm area. Click it to move that part.',
    // R558 (Messages 55 and 56): the card keeps the last area's numbered list while the look is somewhere else, so a
    // movement can be watched on the body. Completes on a number key that moves something with the look off the brain.
    watchBody: 'Look at a purple leg area. Then look down at the body and press 1 or 2: watch the leg move.',
    // R5-text (D17): points out the brain-to-muscle glow; it needs a NEW switch-on while this line shows (ns-guide).
    glow: 'Look at a blue area. See its muscles glow in the same blue?',
    // The brain can be carried with the pointer or with W/A/S/D while Space holds it. (20 November 2026, evening,
    // Message 204: Space grips with both hands and both feet; the line says so, since the step is where Space is taught.)
    dragBrain: 'Hold Space on the brain: both hands and feet grip. Turn your view to carry it, then let go.',
    // R4-fix (review RP4): with the mouse captured the crosshair must look far from the brain to reach an arrow; a free
    // mouse (Esc twice) lets you click the arrows while you watch the brain. R5-text (D16): no "curved" (user R20).
    orbit: 'Click or hold a grey arrow to turn the brain. If you captured the mouse, press Esc and choose Resume first.',
    // R5-text (D18): E to the view from behind, and E again back to your own eyes.
    thirdPerson: 'Press E to see your own back. Press E again to go back.',
    // The mirror step completes when the player turns the body, by arrow or drag.
    mirror: 'Click a green arrow to turn the mirror body. If you captured the mouse, press Esc and choose Resume first.',
    // 19 November 2026 (the tutorial, ns-guide TUTORIAL_GOAL_IDS): the steps the older guide did not have. A look only
    // arms an area; a click or its number presses it; a number key held runs the movement for as long as it is held.
    lookStrip: "Aim at a coloured motor area on the brain until its body part moves.",
    pressArea: "Click or tap that motor area to repeat the movement.",
    holdPart: 'Hold down 1 or 2. The part moves while you hold; let go and it stops there.',
    // (21 November 2026, evening, FIX63, review of update 63, U6: since the right wrist has its drag, section 183, a drag
    // on the right hand bends the wrist, also sideways; the line said every drag sideways turns the limb)
    dragLimb: "Drag a visible arm or leg to move it. Drag the right hand to bend the wrist.",
    // 19 November 2026 (the owner's limb keys): the step that teaches the choice of the limb
    chooseLimb: "Press 2, 3 or 4 to select another limb, or double click to cycle through the limbs.",
    readInfo: "Press R to change how much information is shown."
  },
  tutorialGoals: {
    aimJoint: "Look a little up or down to raise or lower the limb you selected. Watch its hand or foot.",
    moveHand: "Press W or S to reach, then A or D to swing the chosen limb sideways.",
    dragBrain: "Hold Space over the brain, move your view to carry it, then release Space.",
    orbit: "Drag the brain to turn it.",
    thirdPerson: "Press E to look at your body from behind, then press E again to return.",
  },
  partial: {
    aimJointOutside: 'Press E to return to the eye view and practise raising or lowering the limb.',
    // (21 November 2026, hunt H22: W and S move along the limb, A and D swing it)
    moveHandNeedX: 'Good! Now try A or D to swing it left or right.',
    moveHandNeedZ: 'Good! Now try W or S to reach it out or draw it in.',
    // R558: shown while a number-key goal is current, after a number whose movement was already at its end.
    numberKeyStill: 'That movement is already there. Press another number from the card.',
    // 21 November 2026 (hunt H18): shown while the tutorial's first step is current, after the look switched on an area
    // that moved nothing (the Tongue has no movement in this body yet; the black in-between areas move nothing).
    lookStripStill: 'Nothing moved there. Look at another coloured area: a part moves.',
    // 22 November 2026 (WORDS2, hunt H26): shown while the tutorial's second step ("Click it: it moves again") is current
    // and the look last switched on an area that moves nothing (a black in-between area, the Tongue): a click there
    // moves nothing either, and the step does not count it (ns-guide pressStill).
    pressAreaStill: 'Nothing moves there. Look at a coloured area that moves a part, then click it.',
    // R558: shown while the watchBody goal is current, after a number moved a part with the look still on the brain.
    watchBodyLookDown: 'It moved! Now look down at the body and press another number. The card keeps the list.',
    // R5-text: shown while the thirdPerson goal is current and the view from behind is on.
    thirdPersonBack: 'This is your back! Move the mouse to look around. Press E to go back.',
    // R5-text: shown while the mirror goal is current, after the brain caught a look or click at the mirror body.
    // R558 (Messages 33 and 34): Shift reaches past the brain to the mirror body (or hold the brain with Space and move it).
    mirrorBlocked: 'The brain is in the way. Press and drag the mirror body to turn it (hold Shift as you press when a brain area is in front of it).',
    // R5-text: shown while the mirror goal is current, after the brain was dragged.
    mirrorNowArrows: 'Good! Now click an arrow by the mirror body to turn it around.'
  },
  // 17 November 2026 (far less text): the same goals in a few words, for the one-line prompt of the quiet screen
  // (ns-quiet). byText gives the short line for a goal's alternative sentence (the keys are the sentences above).
  short: {
    leftArmArea: 'Look at a blue area and click it',
    numberKey: 'Press 1 or 2',
    moveHand: 'Press W, A, S or D: the limb moves',
    flipPalm: 'Tap Space twice',
    fist: 'Tap Space twice and hold',
    otherPart: 'Look at another colour and click it',
    watchBody: 'Look at a leg area, then down, and press 1',
    glow: 'Look at a blue area again: its muscles glow',
    dragBrain: 'Hold Space on the brain. Look around. Let go',
    orbit: 'Press and drag the brain to turn it',
    thirdPerson: 'Press E: the view from outside',
    mirror: 'Click a green arrow by the mirror body',
    // 19 November (the tutorial): one short line per step, each ONE action
    lookStrip: "Aim at a coloured area until its body part moves",
    pressArea: "Click or tap the same area to move it again",
    holdPart: 'Hold down 1 or 2. Let go to stop',
    dragLimb: "Drag a visible arm or leg to change its pose",
    chooseLimb: "Press 2, 3 or 4 to select another limb",
    aimJoint: "Look a little up or down to move the limb",
    readInfo: "Press R to change the information shown",
    nice: 'Nice!',
    finished: 'All done. Esc shows the controls.',
    // 19 November (the tutorial): how to pass a step, shown small beside the line (the key ns-app listens for)
    skip: 'Enter: skip',
    byText: {
      'Press E to return to the eye view and practise raising or lowering the limb.': 'Press E to return to the eye view',
      "Press W or S to reach, then A or D to swing the chosen limb sideways.": "Press W or S to reach, then A or D to swing",
      "Hold Space over the brain, move your view to carry it, then release Space.": "Hold Space on the brain, carry it, then release",
      "Drag the brain to turn it.": "Drag the brain to turn it",
      "Press E to look at your body from behind, then press E again to return.": "Press E to see your body from behind",
      'Good! Now try A or D to swing it left or right.': 'Now A or D',
      'Good! Now try W or S to reach it out or draw it in.': 'Now W or S',
      'That movement is already there. Press another number from the card.': 'Already there: press another number',
      'Nothing moved there. Look at another coloured area: a part moves.': 'Nothing moved: look at another colour',
      'Nothing moves there. Look at a coloured area that moves a part, then click it.': 'Nothing moves there: look at a colour',
      'It moved! Now look down at the body and press another number. The card keeps the list.': 'Now look down and press a number',
      'This is your back! Move the mouse to look around. Press E to go back.': 'Press E to go back',
      'The brain is in the way. Press and drag the mirror body to turn it (hold Shift as you press when a brain area is in front of it).': 'Hold Shift to reach past the brain',
      'Good! Now click an arrow by the mirror body to turn it around.': 'Now drag the mirror body to turn it'
    }
  },
  nice: 'Nice!',
  finished: 'All done! Press Esc any time to see all the controls.',
  // Esc page: a small "Try this guide" row in Settings (ns-guide wiring, round4/R4-text-NOTES.md).
  cue: {
    simpleHeading: "Simple instructions",
    technicalHeading: "Technical notes",
    progress: "Follow the current instruction as you play. Enter skips that step. Resume keeps your progress, and Restart takes you to step one.",
    technical: "Progress uses game events. The shoulder or hip step measures from the pose just before you look up or down. It checks that the wrist or ankle moves at least 2.5 cm relative to that joint. The game follows that motion for up to 0.35 seconds of game time after the look. The movement step needs input on both axes. A limb drag must reach 12 degrees. A brain carry counts on release after a turn of at least 0.12 radians or a key-driven carry of at least 0.2 game metres. Completed steps are saved on this device when local storage is available. The visual cues do not activate the areas they mark.",
    motor: "Motor area",
    limb: "Body part",
    shoulder: "Shoulder aim",
    hip: "Hip aim",
    guide: "View tutorial",
    resume: "Resume tutorial",
    restart: "Restart tutorial",
    limits: "The colours link motor areas to movements in this game. On the simplified map, a ring marks a motor area and a small square marks its related body part when both are visible.",
    jointHelp: "The shoulder or hip guide marks a fixed height one quarter of the way down the view. It is a screen reference for the wrist or ankle.",
    directions: "F opens the Command box for typed movements and on-device dictation where available.",
    camera: "Press C, then select Start camera to let the body follow visible arms and knees.",
  },
  escTitle: 'Tutorial',
  escHelp: 'The tutorial asks for one action at a time, at the top of the screen. It never stops the game. Enter skips a step.',
  hide: 'Hide',
  show: 'Show',
  restart: 'Start again'
});

/** 19 November 2026 (EASE; the owner: "It's not clear what the numbers do"): the one line under a motor area's choices
 * in the tip, shown to a newcomer only (ns-app stops it after a few presses). The filled row carries a drawn pointer:
 * a click does that one; each row's key cap is the number key that does it. */
const HELD_TARGET_WORDS = Object.freeze({
  brain: 'the brain', mirror: 'the mirror body',
  rightArm: 'your right hand', leftArm: 'your left hand', rightLeg: 'your right foot', leftLeg: 'your left foot',
});
/** 19 November 2026: the names the tip gives the two eyeballs and their nerves at the brain's front (ns-brain-eyes: an
 * illustration that shows which way the brain faces; they are not motor areas and do nothing). 20 November 2026 (GAP):
 * and the inner parts seen through the opening between the brain's halves (ns-brain-gap brainGapPartKey); they are not
 * motor areas either. */
export const BRAIN_PARTS = deepFreeze({ eyeball: 'Eyeball', nerve: 'Optic nerve',
  whiteMatter: 'White matter', lateralVentricle: 'Lateral ventricle', thirdVentricle: 'Third ventricle', fourthVentricle: 'Fourth ventricle',
  aqueduct: 'Cerebral aqueduct', internalCapsule: 'Internal capsule', hippocampus: 'Hippocampus', pineal: 'Pineal body', habenula: 'Habenula' });
/* 21 November 2026, evening (FIX63; a review of Body update 63, U4): with a free pointer over one of your own limbs the
 * tip said "Space holds your right hand". Since 19 November Space there chooses the limb and nothing holds it (ns-app
 * LIMB_KEYS.view.hold; the grip card has said so since hunt H16). spaceAim's third argument, limbsChosen, is that rule:
 * with it a limb's line is "Space chooses your right arm"; without it, the line as it was. */
const CHOSEN_LIMB_WORDS = Object.freeze({ rightArm: 'your right arm', leftArm: 'your left arm', rightLeg: 'your right leg', leftLeg: 'your left leg' });
export const TIP = deepFreeze({
  teach: 'Click, or press a number',
  spaceAim(target, behind, limbsChosen = false) {
    const key = behind ? 'Shift + Space' : 'Space';
    if (limbsChosen === true && Object.hasOwn(CHOSEN_LIMB_WORDS, target)) return `${key} chooses ${CHOSEN_LIMB_WORDS[target]}`;
    const name = Object.hasOwn(HELD_TARGET_WORDS, target) ? HELD_TARGET_WORDS[target] : null;
    return name ? `${key} holds ${name}` : '';
  },
  holding(target, kept) {
    const name = Object.hasOwn(HELD_TARGET_WORDS, target) ? HELD_TARGET_WORDS[target] : null;
    return name ? { title: `Holding ${name}`, hint: kept ? 'Tap Space to let go.' : 'Let go of Space.' } : null;
  },
  /** 19 November 2026 (the owner: "If we click on a limb, we now control that limb until we change the camera view"):
   * the tip by the crosshair while a clicked limb is controlled ({ title, hint }, drawn like the Space hold's tip).
   * Letting go needs no words: looking away does it. */
  limbTaken: limb => ({ title: ({ rightArm: 'Right arm', rightLeg: 'Right leg', leftLeg: 'Left leg' })[limb] || 'Limb', hint: 'W A S D and your look move it' }),
  /** 22 November 2026 (browser hunt of update 64, H9): the tip by the crosshair while the brain is behind you (carried
   * there and let go; ns-reference-graph brainBehind) and nothing else is under the crosshair: where it is and the two
   * ways back. */
  brainBehind: { title: 'The brain is behind you', hint: 'Turn round, or press Esc, then Reset brain view.' },
  // (and when the look has carried it out of sight: the full cards' lost-brain line, HUD.brainAwayHint; second pass: both
  // tips only while none of the brain is in the picture, ns-reference-graph brainLostWords)
  brainAway: { title: 'The brain is out of sight', hint: 'Look round, or press Esc, then Reset brain view.' },
});

/** The guide line shown in the status card: "Try this (2 of 7): Press W, A, S or D to move your left hand.";
 * nice = true puts "Nice! " in front (a goal was just done). */
export function guideLine(step, total, text, nice = false) {
  const n = Number.isFinite(step) ? step : 1, m = Number.isFinite(total) ? total : n;
  return `${nice ? `${GUIDE.nice} ` : ''}${GUIDE.label} (${n} of ${m}): ${str(text)}`;
}

/** Visible App error wording only. Raw status/shell/ready errors and their causes stay with ns-app. */
export function appErrorLine(error, hint = null) {
  if (error === 'ns:app_args: configured viewGraph requires completed source-qualified pelvis anchor') return 'The body anatomy could not finish loading. Reload the page to try again.';
  if (error === 'ns:app_args: configured viewGraph requires the complete validated54-record face packet') return 'The face anatomy could not finish loading. Reload the page to try again.';
  // R558: the whole-arm display refused every picture it was offered. hint 'narrow-window' (set by ns-app only when the
  // very first picture of an upright window was refused because no camera distance shows the whole arm): say what to
  // do. Any other whole-arm stop (the last step of the recovery in the middle of a game, or a bad input) is not about
  // the window, so it does not say so. The reason stays in the line for a report.
  const arm = /^ns:whole_arm_display: (.+)$/.exec(str(error));
  if (arm && hint === 'narrow-window') return `NeuroSurge could not fit your whole left arm into a window this shape. Make the window wider than it is tall (on a phone or tablet, turn it sideways). If the game does not start again by itself, reload the page. (Reason: ${arm[1]})`;
  if (arm) return `NeuroSurge could not show your whole left arm from here and stopped. Reload the page to start again. (Reason: ${arm[1]})`;
  return `NeuroSurge stopped: ${error}`;
}

/* ------------------------------------------------------------------ page (scene/example/index.html) */

export const PAGE = deepFreeze({
  title: BRAND.name,
  canvasLabel: 'NeuroSurge game view. You move a simulated body and brain with game controls (no real stimulation or ' +
    'decoding).',
  // R4-integrator: R4-text's proposed plainer line (Flesch 61.2 -> 84.9); index.html's static copy changes with it.
  noscript: 'This game needs JavaScript and 3D graphics (WebGL) to run.',
  fatalPrefix: 'NeuroSurge could not start: ',
  restartPrefix: 'NeuroSurge could not restart: ',
  secureContext: 'Your browser blocked a safety check (crypto.subtle). Open the game over HTTPS or from localhost.'
});

/* ------------------------------------------------------------------ map-level caveats (ns-bodymap CAVEATS) */

/** Plain versions of BODY_MOTOR_MAP.caveats, in the same order (index i explains caveats[i]); the technical text stays
 * in ns-bodymap as the "More detail" layer. */
export const MAP_CAVEATS = deepFreeze([
  `${HONESTY.simulated.plain} ${HONESTY.unitless.plain} Looks, clicks and keys are game controls (virtual inputs). ` +
    'Nothing here is a real brain reading, muscle reading (EMG), nerve signal or force.',
  'The coloured strip is a simplified map, not a scan of any real brain. Real body-part areas overlap and vary ' +
    'between people, and between the two halves of the brain.',
  'The old “little person” map (Penfield’s homunculus) sums up early brain tests, and their maps overlapped a lot. ' +
    'Newer maps (Gordon et al., 2023) show the areas in rings, with three in-between areas.',
  'Recordings from single brain cells found signals for the whole body at every spot tested, all mixed together. So ' +
    'no area here is the one exact spot for a muscle. The borders are only game borders.',
  HONESTY.crown.plain,
  'Arm and leg muscles get their signals mainly from the other half of the brain. Your left arm is moved mainly by ' +
    'the right half (right hemisphere). Trunk, neck, upper face, jaw and tongue get strong signals from both halves.',
  'The muscle lists are rough jobs taken from anatomy tables. They are not measured. A muscle that is switched on ' +
    'does not always get shorter. Muscle colour shows the made-up signal, not muscle readings (EMG) or force.',
  HONESTY.notDecoder.plain
]);

/* ------------------------------------------------------------------ inventory (for tests and audits) */

/** Every default plain string in this module, as [path, text]. Template helpers are sampled with representative
 * arguments. `more` fields (technical layer) are excluded. */
export function plainStrings() {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (v.trim()) out.push([path, v]); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) if (k !== 'more' && k !== 'id') walk(v[k], `${path}.${k}`);
  };
  walk(HONESTY, 'HONESTY');
  walk(BRAND, 'BRAND');
  walk(SHELL, 'SHELL');
  walk(FACE_VIEW_LABELS, 'FACE_VIEW_LABELS');
  walk(QUALITY_LABELS, 'QUALITY_LABELS');
  walk(HUD, 'HUD');
  walk(ROTATION, 'ROTATION');
  walk(INFO, 'INFO');
  walk(ORIENTATION, 'ORIENTATION');
  walk(ORIENTATION_SHORT, 'ORIENTATION_SHORT');
  walk(ORBIT, 'ORBIT');
  walk(LEGEND, 'LEGEND');
  walk(FACE, 'FACE');
  walk(GUIDE, 'GUIDE');
  walk(RESET_HELP, 'RESET_HELP');
  walk(VIEW, 'VIEW');
  walk(ARROWS, 'ARROWS');
  walk(MIRROR_PART_NAMES, 'MIRROR_PART_NAMES');
  walk(MIRROR, 'MIRROR');
  walk(GLOW, 'GLOW');
  walk(BODY_WORLDS, 'BODY_WORLDS');
  walk(FACE_R5, 'FACE_R5');
  walk(FACE_MUSCLE_NAMES, 'FACE_MUSCLE_NAMES');
  walk(PAGE, 'PAGE');
  walk(MAP_CAVEATS, 'MAP_CAVEATS');
  const samples = [
    ['gazeLine(leftArm)', gazeLine('leftArm', 'Left shoulder', 'Left shoulder')], ['gazeLine(other)', gazeLine('other', 'Bend right knee', 'Right knee')],
    ['areaTag(leg)', areaTag({ kind: 'effector', hemisphere: 'left', displayGroup: 'right_leg' })],
    ['areaTag(arm)', areaTag({ kind: 'effector', hemisphere: 'left', displayGroup: 'right_arm' })],
    ['areaTag(trunk)', areaTag({ kind: 'effector', hemisphere: 'right', displayGroup: 'trunk' })],
    ['areaTag(face)', areaTag({ kind: 'effector', hemisphere: 'right', displayGroup: 'face' })],
    ['pulseLine', pulseLine('Bend left knee', 0.6)], ['triggerLine(click)', triggerLine(3, 'click', 'Bend left knee')],
    ['triggerLine(gaze)', triggerLine(4, 'gaze', 'Close left hand')],
    ['gazeMuscleLine(own)', gazeMuscleLine({ where: 'own', name: 'right biceps brachii', holdable: true })],
    ['gazeMuscleLine(mirror)', gazeMuscleLine({ where: 'mirror', name: 'left rectus femoris', part: MIRROR_PART_NAMES.legs })],
    ['gazeLine(arrow)', gazeLine('arrow', 'Turn the brain: show more of its back')],
    ['rotationLine', rotationLine('supinated')], ['elbowLine', elbowLine({ commandDeg: 40, achievedDeg: 31, limited: true })],
    ['activityLine', activityLine(0.8)], ['activationsLine', activationsLine(2)], ['moreCaveatsLine', moreCaveatsLine(2)],
    ['LEFT_ARM_LABEL', LEFT_ARM_LABEL], ['guideLine', guideLine(2, 7, GUIDE.goals.moveHand)],
    ['guideLine(nice)', guideLine(3, 7, GUIDE.goals.fist, true)],
    // R5-text samples
    ['gazeLine(mirror)', gazeLine('mirror', mirrorPartName('leftArm'))], ['gazeLine(mirror,empty)', gazeLine('mirror')],
    ['mirrorPartName', mirrorPartName('torso')],
    ['faceAttributionLine(example)', faceAttributionLine({ author: 'Z-Anatomy', licence: 'CC BY-SA 4.0', changes: 'only these muscles, fitted to the skull' })],
    ['muscleLabel', muscleLabel('chewing muscle at the cheek', 'masseter')],
    ['faceMuscleLabel(left)', faceMuscleLabel('zygomaticus-major', { side: 'left' })]
  ];
  for (const [l, v] of mirrorInfoCard({ part: 'leftArm', turned: true }).rows) samples.push([`mirrorInfoCard.row(${l})`, `${l}: ${v}`]);
  for (const k of ['arm', 'leg', 'trunk', 'face']) for (const h of ['right', 'left']) samples.push([`regionGroupLabel(${k},${h})`, regionGroupLabel(k, h)]);
  for (const [p, t] of samples) out.push([p, t]);
  return out;
}
