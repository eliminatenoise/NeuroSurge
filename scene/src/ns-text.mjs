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
  // FIRST_PERSON_BODY): the ordinary view draws only what is in front of your face.
  face: {
    id: 'face-layer',
    plain: 'Through your own eyes you cannot see your face, head, neck or back. Look at the mirror body to see them: ' +
      'it copies yours. Or press E to see yourself from behind.',
    more: 'In the ordinary view only what is in front of your face is drawn: your left arm, your lap and legs, and ' +
      'your right forearm and hand. The picture is taken from a little behind your eyes so that the whole left arm ' +
      'fits; your head, neck, chest and back are left out of it, not missing. The mirror body shows the same face, ' +
      'chewing, neck and trunk muscles, and the view from behind (E) shows your whole body with the head in place.'
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
    plain: 'The glow between a brain area and its muscles is only a picture. It shows which muscles that area drives in ' +
      'this game. It is not a nerve. Real signals travel from the brain down the spinal cord and along nerves to the ' +
      'muscles. For the head and face, they leave from the base of the brain.',
    more: 'The glow link displays the simulated area-to-muscle mapping, not a pathway: real corticospinal signals reach ' +
      'spinal motor neurons and then peripheral nerves; corticobulbar signals reach cranial-nerve nuclei in the brainstem.'
  },
  // R5-text (D15, user R19): the lifted outer muscles are a display choice; in the body they lie on the deeper layer.
  bodyWorlds: {
    id: 'body-worlds',
    plain: 'The outer muscles are lifted out a little, like in a Body Worlds exhibit. That lets you see the deeper ' +
      'muscles under them. In a real body, the outer muscles lie right on top of the deeper ones.',
    more: 'Superficial muscles are displaced outward (display only) so that deep muscles show in the gaps; in the body ' +
      'they lie directly on the deep layer.'
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
const STEP_TABLE = [
  { head: 'Look around.', parts: [part('You see through the eyes of a body that stays in one place. It has no skin, just ' +
    'bones and muscles. Move the mouse or trackpad to look around.')],
  intro: [part('Move the mouse or trackpad to look around. Your body has no skin, just bones and muscles.')] },
  { head: 'Your left arm.', parts: [part('Your whole left arm is in view. The hand stays three quarters up the screen. ' +
    'When you look around, the arm comes along. It is your LEFT arm: the hand reaches past the middle of the screen, ' +
    'but not to the right edge. Tap Space twice to turn your palms up or down: both forearms turn, and your hips turn ' +
    'your legs and feet a little with them.')],
  intro: [part('Your whole left arm is in view. Tap Space twice to turn your palms; your legs turn a little too.')] },
  { head: 'The glass brain.', parts: [
    part('A giant glass brain floats in front of you, out of reach. Its motor areas are the parts that send movement ' +
      'signals to muscles. They glow from dark (resting) to yellow (strongest), and the muscles use the same colours.'),
    // R5-text (D17): the brain-to-muscle glow, with its honesty in brackets (the Esc limits say it in full).
    part('A soft glow joins each switched-on area to the muscles it moves (a picture, not a nerve).', 'glow')],
  intro: [part('Its motor areas glow from dark (resting) to yellow (strongest), like the muscles.'),
    part('A soft glow joins each switched-on area to its muscles (a picture, not a nerve).', 'glow')] },
  { head: 'Two kinds of areas.', parts: [part('Light-blue areas, in the brain’s right half, are for your left arm. Pink ' +
    'areas are for your other body parts, plus a few in-between areas that move nothing.')],
  intro: [part('Light-blue areas are for your left arm. Pink areas are for other body parts.')] },
  { head: 'Switch areas on.', parts: [part('Look at a motor area to switch it on for 1 second. Click to switch it on ' +
    'again. Or click a muscle, on your own body or on the mirror body: the brain area that moves it switches on. ' +
    'Looking at empty space does nothing. Areas you have used stay a bit more solid, with a gold edge, until you ' +
    'press Reset body.')],
  intro: [part('Look at a motor area to switch it on for 1 second. Click it again, or click a muscle on the body.')] },
  { head: 'Move other body parts.', parts: [part('Your other body parts respond through the brain, not W/A/S/D. Moving the mirror image does not command their muscles. Hold ' +
    'Space while looking at the brain or visible mirror body. Look around or use W/S to move it farther/closer and A/D left/right. Let go to leave it there. Move the brain down ' +
    'to watch the legs move.')],
  intro: [part('Other body parts respond through the brain. Space on the brain or clear mirror body carries that item; look or use W/A/S/D.')] },
  // R5-text (D16, user R20 "I don't want them to be curved"): the round-4 "curved arrow" wording is gone in both forms.
  { head: 'Turn your view.', parts: [
    part('Press on the brain and drag to turn it. Four see-through arrows also sit around it, like the points of a ' +
      'compass: click one to turn your view around the brain a little, or hold it to keep turning. The arrows stay ' +
      'where they are, and the brain stays in its place. From straight above you cannot see the lowest face areas ' +
      '(the tongue): turn the brain to one side to bring them round.', 'compassArrows'),
    part('Click an arrow next to the brain to turn your view around it a little. Hold the arrow to keep turning. The ' +
      'brain itself stays put.', '!compassArrows')],
  intro: [part('Press on the brain and drag to turn it, or click or hold one of its four see-through arrows.', 'compassArrows'),
    part('Click or hold an arrow by the brain to turn your view. The brain stays put.', '!compassArrows')] },
  { head: 'See your body.', parts: [
    part('Look down to see your lap, legs and feet, and your right hand resting in front of you. Your face, chest ' +
      'and back are on the mirror body: it copies yours. Press E to see all of yourself from behind.'),
    // R5-text (D15, user R19).
    part('The outer muscles are lifted out a little, like in a Body Worlds exhibit, so you can see the deeper ones.', 'bodyWorlds'),
    part('The “What is happening” panel explains each area you look at or click.')],
  intro: [part('Look down for your lap and legs. Your face, chest and back are on the mirror body.'),
    part('The outer muscles are lifted a little to show the deeper ones.', 'bodyWorlds')] },
  // R5-text (D18, user R22).
  { head: 'See your back.', need: 'thirdPerson', parts: [part('Press E to see your body from behind (third person). ' +
    'Press E again to go back to your own eyes.')],
  intro: [part('Press E to see your back (third person). Press E again to go back.')] },
  // R5-text (D19, user R23: "to move the body around, you have to move the brain that's in front of it away").
  { head: 'The mirror body.', need: 'mirror', parts: [part('Behind the brain stands a mirror image of your body. It ' +
    'copies everything your body does. You can click its muscles through the clear glass of the brain. To carry or ' +
    'turn it, move the brain aside first: then hold Space on the mirror body to carry it with your look and W/A/S/D, ' +
    'and press on it and drag, or use its arrows, to turn it.')],
  intro: [part('The mirror body copies you. Click its muscles. Move the brain aside to carry it (Space) or drag it round.')] }
];
const CONTROL_TABLE = [
  ['Mouse / trackpad', 'look around (your left shoulder follows)'],
  ['A / D', 'move the left hand left/right; also move a held brain or mirror left/right'],
  ['W / S', 'W moves the hand forward and a held item farther away; S brings them back/closer. Combine with A/D for diagonals.'],
  ['Hold Space', 'make a fist with all five fingers; let go to open the hand'],
  ['Double-tap Space', 'turn your palms: down ↔ up. Both forearms turn (pronation ↔ supination), and both hips turn the legs and feet a little with them.'],
  ['Look / Click', 'switch on the motor area you aim at (the crosshair) for 1 second, with either mouse button'],
  // R558 (genuine note R31).
  ['Click a muscle', 'on your body or on the mirror body: switches on the brain area that moves it, for 1 second'],
  ['Press and drag', 'on the brain, or on the mirror body once the brain is out of its way: turn it by as much as you drag'],
  ['Space on brain / mirror', 'hold the item: look to carry; W farther, S closer, A/D sideways. Let go to leave it there. Near/far limits keep it in range.'],
  // R5-text (D16): no "curved" (the user's R20).
  ['Orbit arrows', 'click a see-through arrow by the brain to turn your view around it. Hold it to keep turning. The arrows stay in place.'],
  ['Mirror body arrows', 'turn the mirror body. Drag the brain out of the way first.', 'mirror'],
  ['E', 'see your body from behind (third person). Press E again to go back to your own eyes.', 'thirdPerson'],
  // R4-arm More detail key (R4-integrator: 'panel' instead of 'information panel', Flesch 66.1 -> 93.0).
  ['I', 'show or hide More detail in the panel (press I)'],
  ['Esc', 'pause and show this page: how to play, Reset body and settings']
];
/** R5-text: the short control words for the 2 s start page (introControls), by control key; the Esc page keeps
 * CONTROL_TABLE's full words. */
const INTRO_CONTROL_WORDS = {
  'Mouse / trackpad': 'look around',
  'A / D': 'hand and held item left/right',
  'W / S': 'W farther, S closer; combine with A/D',
  'Hold Space': 'fist; let go to open',
  'Double-tap Space': 'turn palms (down ↔ up); legs turn too',
  'Look / Click': 'switch on an area for 1 second',
  'Click a muscle': 'switch on its brain area',
  'Press and drag': 'turn the brain or mirror body',
  'Space on brain / mirror': 'hold item; look or W/A/S/D to move; let go to leave',
  'Orbit arrows': 'turn your view around the brain',
  'Mirror body arrows': 'turn the mirror body',
  E: 'see your back (third person)',
  I: 'More detail in the panel',
  Esc: 'pause, help, Reset body, settings'
};
const LIMIT_TABLE = [
  [`${HONESTY.simulated.plain} ${HONESTY.unitless.plain}`],
  [HONESTY.virtualInputs.plain],
  [HONESTY.emg.plain],
  [HONESTY.glow.plain, 'glow'],
  [HONESTY.muscleTap.plain],
  [HONESTY.overlapVary.plain],
  [HONESTY.notExact.plain],
  [HONESTY.leftArmRightHalf.plain],
  [HONESTY.crown.plain],
  [HONESTY.bodyWorlds.plain, 'bodyWorlds'],
  [HONESTY.face.plain],
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
  headings: { loading: 'Loading…', intro: 'How to play', playing: '', paused: 'Paused: how to play', error: 'NeuroSurge stopped' },
  introNote: 'This page closes by itself after 2 seconds. Click to start now. Press Esc to see it again.',
  // R4-integrator (R4-load W8): while the rest of the body still streams in, the 2 s timer has not started yet.
  introNoteLoading: 'This page closes by itself 2 seconds after your body has loaded. Click to start now. Press Esc to ' +
    'see it again.',
  // R4-polish (R4-player 2.5): Esc goes back too, but the browser then needs one click before the mouse is locked.
  pausedNote: 'Resume takes you back to the game and locks the mouse again. Esc also takes you back: then click once ' +
    'to look around.',
  play: 'Start now',
  resume: 'Resume (Esc)',
  resetBody: 'Reset body',
  resetBrain: 'Reset brain view',
  playUnlocked: 'Resume without locking the mouse',
  reload: 'Reload page',
  bodyReset: 'Body reset: your pose, the palm turn and the gold marks are cleared. The brain stays where you left it.',
  // R558: shown once if the game had to put things back by itself because the view could not be drawn.
  displayRescue: 'The game could not draw that view, so it put your body, the brain and the mirror body back where they started.',
  inputCleared: 'The game cleared waiting actions. Release and press again.',
  /** R3-polish: one plain line under the Esc page buttons saying what the two reset buttons do. */
  // R5-text (D19): Reset brain view also turns the mirror body back to face you (ns-mirror resetMirror). With the
  // separate button (feature mirrorResetButton) shellText uses RESET_HELP.separate instead.
  resetHelp: 'Reset body puts your arm and palm back the way they started and clears the gold marks. ' +
    'Reset brain view puts the brain back where it started, and turns the mirror body to face you again. To read More ' +
    'detail in the panel, press I while you play (or press Esc to go back with a free mouse, then click More detail).',
  brainReset: 'Brain view reset: the brain is back in its first place and angle. The mirror body faces you again.',
  // R5-text (D19, optional): a separate "Reset mirror body" button and its notice.
  resetMirror: 'Reset mirror body',
  mirrorReset: 'Mirror body reset: it is back behind the brain and faces you.',
  instructionsTitle: 'How to play',
  // R5-text: built from STEP_TABLE (every round-5 feature on); shellText(features) gives a build's own list.
  instructions: stepTexts(ALL_FEATURES),
  /** R3-polish: a short bold lead-in for each step (same order as `instructions`), so the page can be scanned. */
  instructionHeads: stepHeads(ALL_FEATURES),
  // R5-text: the SHORT step texts for the 2 s start page (loading and intro modes), same order and heads as
  // instructions; the round-5 steps and controls made the full page taller than the screen at 1280x720 (round5/
  // R5-text-NOTES.md 4.1). The Esc page keeps `instructions`.
  introInstructions: introStepTexts(ALL_FEATURES),
  controlsTitle: 'Controls',
  // R5-text: built from CONTROL_TABLE (E and the mirror arrows added; no "curved" arrows).
  controls: controlRows(ALL_FEATURES),
  // R5-text: the same controls with short words for the 2 s start page (Esc keeps `controls`).
  introControls: introControlRows(ALL_FEATURES),
  settingsTitle: 'Settings',
  sensitivity: 'Look speed',
  invertY: 'Flip up and down when looking (invert Y)',
  // R558 (genuine note R28): the keyboard picture on the start page and the Esc page. Short words sit on the keys; the
  // two lines under the picture say the same in full. Every key named here is a key the game really handles.
  keyboard: {
    title: 'Where the keys are',
    label: 'A picture of the keys the game uses. W, A, S and D sit together on the left of the keyboard: W is above S, with A and D beside S. E is just right of W. I is further right on the same row. The space bar is the long key at the bottom. Esc is at the top left.',
    keys: { Escape: 'pause', KeyW: 'forward', KeyA: 'left', KeyS: 'back', KeyD: 'right', KeyE: 'view', KeyI: 'detail' },
    names: { Escape: 'Esc', KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyE: 'E', KeyI: 'I', Space: 'Space' },
    spaceWords: 'hold: fist or carry · tap twice: turn palms',
    lineMove: 'W, A, S, D move your left hand, and anything you are carrying. E shows your back. I opens More detail. Esc pauses and shows this page.',
    lineSpace: 'Hold Space to make a fist. While you look at the brain or the mirror body, holding Space carries it. Tap Space twice to turn your palms over.',
    padTitle: 'Trackpad or mouse',
    padMove: 'Move: look around.',
    padClick: 'Click: switch on the brain area or the muscle you are aiming at.',
    padDrag: 'Press and drag on the brain or the mirror body: turn it.'
  },
  // R4-integrator (D8): the Esc-page picture-quality setting (option names in QUALITY_LABELS).
  quality: 'Picture quality',
  // R4-polish: "softer" was not what a player sees on a software renderer (a half-size, blockier picture); say it plainly.
  qualityHelp: 'Auto adjusts picture quality. Low draws a simpler, less sharp picture for slow computers. The colours and ' +
    'what they mean stay the same.',
  // R4-fix (code review M1): edge smoothing is chosen when the page loads; after a Low start, High is fully sharp only
  // after a reload.
  qualityReload: 'Reload the page for the sharpest edges.',
  // R5-text (D15, optional Esc-page setting "Body Worlds layers: on / off"; option names in BODY_WORLDS.on / .off).
  bodyWorlds: 'Lifted outer muscles (Body Worlds style)',
  bodyWorldsHelp: 'On lifts the outer muscles a little, so you can see the deeper ones. In a real body they lie flat ' +
    'on top of them.',
  limitsTitle: 'What this game is, and is not',
  // R5-text: built from LIMIT_TABLE (the glow, the lifted outer muscles and the mirror body added).
  limits: limitLines(ALL_FEATURES),
  // R4-integrator: the R4-arm More detail key (I) works in captured play, so the toast names it.
  captureHint: 'Click the scene to look around · Press I for More detail · Esc: how to play',
  lockRefused: 'The browser did not lock the mouse. After Esc it waits about a second. Click the scene to try again, or ' +
    'hold a button and drag to look. Clicks still switch areas on · Esc: how to play',
  lookOff: 'Mouse lock does not work here. W/A/S/D, Space and clicks still work · Esc: how to play',
  contextLost: 'The graphics stopped (WebGL context lost). The game waits until the browser brings them back.',
  contextLostLong: 'The graphics have not come back. Reloading the page usually fixes this.'
});

/** The reset help line and the Reset brain view notice for each mirror-reset choice (R5-text, D19). */
export const RESET_HELP = deepFreeze({
  noMirror: 'Reset body puts your arm and palm back the way they started and clears the gold marks. ' +
    'Reset brain view puts the brain back where it started. To read More detail in the panel, press I while you play ' +
    '(or press Esc to go back with a free mouse, then click More detail).',
  separate: 'Reset body puts your arm and palm back the way they started and clears the gold marks. ' +
    'Reset brain view puts the brain back where it started. Reset mirror body turns the mirror body to face you again. ' +
    'To read More detail in the panel, press I while you play (or press Esc to go back with a free mouse, then click ' +
    'More detail).',
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
  view: 'Seen from above, not mirrored: front at the top, your right on the right',
  rights: 'Anatomy: BodyParts3D © DBCLS, CC BY 4.0',
  placeholderRights: 'Stand-in shapes: no BodyParts3D anatomy shown',
  // R4-text: "a rough map" (Flesch 68.8 -> 72.3, 118 characters); the pinned opening and the four core honesty items
  // are unchanged.
  limitsShort: 'Signals made up (simulated, unitless) · a rough map · game controls (virtual inputs), not real stimulation or decoding',
  hint: 'Move to look. W/S reach forward or back; A/D move left or right. Hold Space to close the hand; let go to open ' +
    'it. Space on the brain or clear mirror also carries it with look and W/A/S/D, within near/far limits. Looking at a new area, or a click, gives 1 second of simulated signal. Click the scene to capture the mouse; ' +
    'Esc frees it.',
  hintShell: 'Look to aim. A/D move the hand left or right, W/S forward or back. Hold Space for a fist; double-tap to ' +
    'flip the forearm. Looking at a motor area gives 1 second of simulated signal, and a click repeats it. Space while ' +
    'looking at the brain or clear mirror body carries it: look or W/A/S/D. Release leaves it there. Esc: controls and reset.',
  markers: 'Dots are rough control spots, not exact points in the brain. The coloured areas overlap.',
  drivesTitle: 'Strongest simulated muscle signals (unitless, 0–1)',
  gazePrefix: 'Looking at: ',
  gazeEmpty: 'Looking at: empty space (nothing switches on)',
  gazeBrain: 'Looking at: the brain, but not a motor area (nothing switches on)',
  gazeGlass: 'Looking at: brain glass, not a motor area (nothing switches on)',
  gazeOtherPrefix: 'Looking at (other body part): ',
  gazeLeftArmPrefix: 'Looking at (left arm): ',
  gazeBetweenPrefix: 'Looking at (moves nothing): ',
  gazeStripPrefix: 'Looking at (left arm): ',
  pulseNone: '',
  pulseResidual: 'Arm relaxing back to rest',
  suppressedPrefix: 'Blocked while you hold a fist: ',
  grabbing: 'Item held: look to carry; W farther, S closer, A/D sideways. Let go of Space to leave it there.',
  rotationPrefix: 'Forearm: ',
  rotationHint: ' · double-tap Space to flip',
  wholeGroupTint: 'These finger muscles serve all four fingers, so all four light up, not just one',
  spaceHeld: 'Space held: making a fist (simulated)',
  spaceReleased: 'Space let go: opening the hand (simulated)',
  reachLimited: 'Reach limited so the whole hand stays on screen',
  // R4-fix (review RP3): shown in the status card while a held W/A/S/D cannot move the hand any further.
  reachBlocked: 'Your hand cannot go further that way, so it stays on screen',
  // R558: the look stops where the whole arm could no longer stay in view (the game used to stop here).
  lookLimit: 'You cannot look further that way: your arm has to stay in view',
  /** R558: shown for a few seconds after a change of view (E) could not be drawn and was undone. */
  viewKept: 'That change of view cannot be shown from this pose. Push your hand forward a little or look back toward the middle, then press E again.',
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
   * (computed with the game's own gaze test: 40 of 44 areas can be aimed at from above; one arrow click, 15 degrees,
   * brings in the two hidden ones on that side). */
  sideAreasHint: 'More face areas (the tongue) are round the side of the brain: drag the brain, or click the arrow beside it, to turn it.',
  /** R3-fix (M6): shown when looking far right at about eye level. */
  rightArmHint: 'Your right arm rests lower down: look down a little to see it',
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
  /** R5-text (D19): a look or click at the mirror body or its arrows that the brain in front catches. */
  mirrorBlocked: 'The brain is in the way. Drag it aside first: hold Space on the brain and look away.',
  /** R5-text (D19): shown with the mirror body under the crosshair while the brain still covers its arrows. */
  mirrorHint: 'To turn the mirror body, drag the brain out of the way first.'
});

/** Forearm state words (ns-app ROTATION_PLAIN): the plain words with the technical term in brackets. */
export const ROTATION = deepFreeze({ pronated: 'palm down (pronated)', supinated: 'palm up (supinated)' });

const fix1 = v => (Number.isFinite(v) ? v.toFixed(1) : '–');
const fix2 = v => (Number.isFinite(v) ? v.toFixed(2) : '–');
const str = v => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** HUD gaze line. kind: 'leftArm' | 'other' | 'between' (an in-between SCAN area) | 'strip' (a left-arm action point) |
 * 'mirror' (R5: the mirror body; label = the mirrored part, e.g. mirrorPartName('leftArm')) | 'glass' | 'brain' |
 * 'empty'. */
export function gazeLine(kind, label = '') {
  const l = str(label).trim();
  if (kind === 'mirror') return l ? `${HUD.gazeMirrorPrefix}${l}` : HUD.gazeMirror;
  if (kind === 'leftArm') return `${HUD.gazeLeftArmPrefix}${l}`;
  if (kind === 'strip') return `${HUD.gazeStripPrefix}${l}`;
  if (kind === 'other') return `${HUD.gazeOtherPrefix}${l}`;
  if (kind === 'between') return `${HUD.gazeBetweenPrefix}${l}`;
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
/** HUD line for a pulse the held fist blocked. */
export function suppressedLine(label) { return `${HUD.suppressedPrefix}${str(label)}`; }
/** HUD forearm line: "Forearm: palm down (pronated) · double-tap Space to flip". */
export function rotationLine(state) {
  return state ? `${HUD.rotationPrefix}${ROTATION[state] || str(state)}${HUD.rotationHint}` : '';
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
  idleBody: 'Point the crosshair at a coloured area on the brain. This panel then says what that area moves. It also ' +
    'shows which muscles pull, how the signal travels, and what is simulated or known.',
  glassTitle: 'Brain glass: no motor area here',
  // R3-polish: the first card a new player sees (the start look is on the glass) now also says what to do next.
  glassBody: 'This part of the glass brain is not a motor area, so looking at it switches nothing on. Look at a ' +
    'coloured area to switch it on. Space on the brain or visible mirror body holds it; look or W/A/S/D moves it within limits.',
  leftArmTag: 'Left-arm motor area (brain’s right half)',
  otherTag: 'Other body part’s motor area (no keys)',
  // R4-fix (review RP12): the technical names (SCAN, pathway names) are in More detail.
  integrationTag: 'In-between spot: moves nothing',
  leftArmPathway: 'Brain → crosses to the left at the base of the brain → spinal cord in the neck → arm ' +
    'nerves → muscles (corticospinal tract, brachial plexus)',
  otherPathway: 'Brain → spinal cord or base of the brain → nerves → muscles (corticospinal or corticobulbar pathway)',
  simulated: 'Simulated: a made-up level from 0 to 1 (unitless). Nothing is recorded, sent in (stimulated) or read out (decoded).',
  known: 'Known: each half of the brain mainly moves the other side of the body. Real maps overlap and vary.',
  crownNote: HONESTY.crown.plain,
  caveats: [HONESTY.overlapVary.plain, HONESTY.notExact.plain, HONESTY.emg.plain,
    HONESTY.notDecoder.plain],
  lastViewed: 'Last area you looked at',
  // R4-polish (R4-player 1.9): one line, so the card's More detail stays inside the panel.
  viewedLast: 'Last area you looked at (now on empty space)',
  rows: {
    bodyPart: 'Body part', movement: 'Movement', agonists: 'Muscles that pull', antagonists: 'Muscles that work the other way',
    pathway: 'Signal path',
    // R4-fix (review SL4-7): an action that pulls nothing (letting go) eases BOTH finger muscle groups off.
    easeOff: 'Muscles that ease off', pathwayName: 'Name of the signal path'
  },
  noMovement: 'none: this area moves nothing in the game',
  caveatPrefix: 'Keep in mind: ',
  moreDetail: 'More detail',
  sourcesPrefix: 'Sources: ',
  unverified: ' (unverified)',
  technicalName: 'Technical name',
  allMuscles: 'All muscle names',
  steadying: 'Muscles that steady the joint',
  /** R3-fix (SL-2): appended to a forearm-turn card's movement row when the palm already faces that way. */
  alreadyDown: ' (your palm is already down, so nothing moves now)',
  alreadyUp: ' (your palm is already up, so nothing moves now)'
});

/** "Simulated signal 0.80 (unitless, 0–1)" (was "Simulated activity 0.80 (unitless, 0–1)"). */
export function activityLine(v) { return `Simulated signal ${fix2(v)} (0 = resting, 1 = strongest; no units)`; }
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
  citations = [], caveats = [], rotationState = null } = {}) {
  if (!region) return null;
  const integration = region.kind === 'integration';
  const rows = [];
  // R3-fix (review SL-2): a forearm-turn area whose palm is already turned that way moves nothing; say so plainly.
  const already = action && ((action.armActionId === 'pronation' && rotationState === 'pronated') || (action.armActionId === 'supination' && rotationState === 'supinated'));
  if (action) rows.push([INFO.rows.movement, `${str(action.plainLabel) || str(action.label)}${already ? (rotationState === 'pronated' ? INFO.alreadyDown : INFO.alreadyUp) : ''}`]);
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
    tag: leftArm ? INFO.leftArmTag : integration ? INFO.integrationTag : INFO.otherTag,
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
export const ORIENTATION = deepFreeze({
  right: 'Your right →', left: '← Your left', anterior: '↑ Front (anterior)', posterior: 'Back (posterior) ↓'
});
export const ORIENTATION_SHORT = deepFreeze({ right: 'Right →', left: '← Left' });

/** Orbit arrows (ns-scene-three ORBIT_ARROWS tip/label): short hover captions start with "Orbit"; the accessible label
 * keeps the round-2 opening "Orbit the brain view" (U2b-scene-three test) and says in plain words that only your view
 * turns and the brain itself stays put (R12, R16). */
export const ORBIT = deepFreeze({
  tip: { forward: 'Orbit to the front', back: 'Orbit to the back', left: 'Orbit left', right: 'Orbit right' },
  label: {
    forward: 'Orbit the brain view toward its front. Your view turns; the brain stays put.',
    back: 'Orbit the brain view toward its back. Your view turns; the brain stays put.',
    left: 'Orbit the brain view to the left. Your view turns; the brain stays put.',
    right: 'Orbit the brain view to the right. Your view turns; the brain stays put.'
  },
  holdHint: 'Click for a small turn. Hold to keep turning.'
});

/** Colour key and legend (ns-scene-three HUD_LEGEND_KEY / HUD_LEGEND_SHARED / HUD_REGION_NOTE, ns-app
 * REGION_MODE_NOTE, ns-brain LEGEND_LABEL). key rows: [cssClass, long words, short words]. */
export const LEGEND = deepFreeze({
  label: 'Simulated signal strength (no units)',
  // R3-polish: the ramp ends say what they mean (0 = resting, 1 = strongest), as the intro does.
  lo: '0 resting',
  hi: 'strongest 1',
  shared: 'same colours on brain and muscles',
  key: [
    ['leftarm', 'Left-arm areas (brain’s right half)', 'Left arm'],
    ['other', 'Other body parts, and spots that move nothing', 'Other parts'],
    ['activated', 'Gold edge: switched on (until Reset body)', 'Switched on'],
    ['dot', 'Dots: left-arm control spots', 'Arm spots']
  ],
  // R3-fix (review SL-3): the movement map's pinned qualifier (MOVEMENT-MAP cortical_display_contract
  // .minimum_qualifier_visible) is shown VERBATIM here, in the legend that is visible in every layout.
  regionNote: 'A rough map (Representative motor map · regions overlap and vary between people). Dots: rough spots, ' +
    'not exact points.',
  tintNote: 'Colours mark the areas you can pick, not real brain borders. The brightest spot is the area you picked. ' +
    'The glow and shimmer are just for show.',
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
  controlsRow: ['E', 'see your body from behind (third person). Press E again to go back to your own eyes.'],
  thirdPersonBadge: HUD.thirdPerson,
  firstPersonNotice: HUD.firstPerson,
  // ns-camera (R5-camera): the body and the left arm keep the first-person frame they had when E was pressed.
  armNote: 'Your left arm keeps the aim it had in your own view. W, A, S, D and Space still work the same way.',
  lookNote: 'Move the mouse to go round your body and see your back and sides.'
});

/** The 3D compass arrows (D16, user R20): four arrows round the brain (top = toward the front, bottom = toward the back,
 * left, right) and four smaller ones round the mirror body. tip = the short hover caption; label = the accessible name
 * (aria-label / title), which also says what a click and a hold do. Mirror directions follow ns-mirror
 * MIRROR_COMPASS: top moves your view up over its head, bottom down under its feet, left / right round its side. The
 * round-4 ORBIT captions stay for the HUD buttons until ns-scene-three retires them. */
export const ARROWS = deepFreeze({
  brain: {
    tip: { forward: 'Turn your view toward the front', back: 'Turn your view toward the back', left: 'Turn your view to the left', right: 'Turn your view to the right' },
    label: {
      forward: 'Turn your view around the brain, toward its front. Click for a small turn. Hold to keep turning. The brain itself stays put.',
      back: 'Turn your view around the brain, toward its back. Click for a small turn. Hold to keep turning. The brain itself stays put.',
      left: 'Turn your view around the brain, to the left. Click for a small turn. Hold to keep turning. The brain itself stays put.',
      right: 'Turn your view around the brain, to the right. Click for a small turn. Hold to keep turning. The brain itself stays put.'
    }
  },
  mirror: {
    tip: { forward: 'Turn the mirror body: see it from above', back: 'Turn the mirror body: see it from below', left: 'Turn the mirror body: go round to the left', right: 'Turn the mirror body: go round to the right' },
    label: {
      forward: 'Turn the mirror body so you see it from above. Click for a small turn. Hold to keep turning.',
      back: 'Turn the mirror body so you see it from below. Click for a small turn. Hold to keep turning.',
      left: 'Turn the mirror body: go round it to the left. Click for a small turn. Hold to keep turning. Go all the way round to see its back.',
      right: 'Turn the mirror body: go round it to the right. Click for a small turn. Hold to keep turning. Go all the way round to see its back.'
    }
  },
  holdHint: 'Click for a small turn. Hold to keep turning.',
  /** An arrow behind your own arm is hidden where the arm covers it (no faint copy since R558: that copy also veiled
   * motor areas in front of an arrow). Not shown by the game at present; kept truthful for a caller that shows it. */
  behindArm: 'Your arm can hide part of an arrow. Move your arm, or press on the brain and drag instead.',
  /** A mirror arrow the brain still covers (the brain catches the look and the click, D19). */
  mirrorBlocked: 'The brain is in the way. Drag the brain aside first.'
});

/** Plain names of the mirrored parts (ns-mirror MIRROR_PART_NAMES keys). */
export const MIRROR_PART_NAMES = deepFreeze({
  leftArm: 'your left arm', rightArm: 'your right arm', torso: 'your chest, belly and back', legs: 'your legs',
  neck: 'your neck', face: 'your face and head', other: 'your body'
});

/** The mirror body (D19, user R23; ns-mirror). The first thirteen keys match ns-mirror MIRROR_TEXT one to one. Every
 * label names YOUR part plus "(mirror image)", never "its right arm" (ns-mirror CHIRALITY). */
export const MIRROR = deepFreeze({
  name: 'Mirror body',
  tag: 'A mirror image of your body',
  label: 'Mirror body (a mirror image of you)',
  lead: 'This is a mirror image of you. It copies every move your body makes, like a real mirror.',
  explanation: 'It shows the same pose, muscle colours, lifted outer muscles and glow as your body, at the same time. ' +
    'It is only a picture. It is not a second person.',
  blocked: 'The brain is in front of the mirror body. Drag the brain out of the way first: hold Space on it and look away.',
  arrows: 'Click an arrow by the mirror body to turn it a little. Hold the arrow to keep turning. Go all the way round ' +
    'to see its back.',
  turned: 'You see the mirror body from another side. Reset brain view turns it back to face you.',
  reset: SHELL.resetMirror,
  resetHelp: 'Turns the mirror body back to face you.',
  simulated: 'Simulated: it shows the same made-up signals as your body (no real units). Nothing is read from it.',
  escRow: 'Mirror body: move the brain aside. Hold Space on the visible mirror and look or use W/A/S/D to carry it; its arrows turn it.',
  partSuffix: ' (mirror image)',
  /** The task's two short lines: what it is, and how to reach its arrows. */
  what: 'A mirror image of your body. It copies every move you make.',
  reach: 'Move the brain aside. Space holds the visible mirror; look or W/A/S/D carries it, and its arrows turn it.',
  side: 'Like a real mirror: your left arm shows on the same side of the screen. Once you turn it round, you see it ' +
    'from behind.',
  turnedSeparate: 'You see the mirror body from another side. Reset mirror body turns it back to face you.',
  rows: { shows: 'What it shows', side: 'Which side', turn: 'How to turn it' },
  rowShows: 'your pose, colours, lifted muscles and glow, at the same time',
  rowSide: 'like a real mirror, your left arm is on the same side',
  rowTurn: 'move the brain aside; Space and look/WASD carry it, click/hold arrows turns it'
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
export const GLOW = deepFreeze({
  body: 'The glow shows which muscles this brain area drives in the game. Real signals travel from the brain down the ' +
    'spinal cord and along nerves to the muscles.',
  head: 'The glow shows which muscles this brain area drives in the game. Real signals for the head and face go from ' +
    'the brain to its base (brainstem), then along nerves to the muscles.',
  neck: 'The glow shows which muscles this brain area drives in the game. Real neck signals go to the base of the brain ' +
    'and the top of the spinal cord, then along nerves.',
  none: 'No glow: this area drives no muscles in the game.',
  noShape: 'No glow on the body: the 3D body has no muscles for this.',
  legend: 'Glow: which muscles a switched-on area drives (a picture, not a nerve)',
  legendShort: 'Glow',
  mirror: 'The same glow shows on the mirror body.',
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
    'under them.',
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
  changes: 'only the face and chewing muscles were taken, converted and moved to fit this body',
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
 * records or sends brain signals (looks, clicks and keys stay game controls). Goal ids match ns-guide GUIDE_GOAL_IDS,
 * in teaching order. `partial` lines replace a goal's line when half of it is done. */
export const GUIDE = deepFreeze({
  label: 'Try this',
  // Short on purpose: the line sits in the status card (about 40 characters per line there), so each goal is one or
  // two short sentences.
  goals: {
    // R4-fix (reviews SL4-4 / RP6): name areas that visibly move the arm (the shoulder area and "Relax left grip" on
    // an open hand move nothing you can see, and do not complete this goal).
    leftArmArea: 'Look at a light-blue area, like the elbow. Watch your left arm move.',
    moveHand: 'Press W, A, S or D to move your left hand.',
    // R4-fix (review RP14): Space while looking at the brain also grabs it (the user's rule), so look away first.
    fist: 'Look at empty space. Hold Space for a fist, then let go.',
    flipPalm: 'Tap Space twice, fast, to flip your palm over.',
    // R4-fix (reviews F3 / SL4-4): 14 grey areas move nothing; this goal completes only on one that moves a joint.
    otherPart: 'Look at a pink area, like a leg or the right arm. Watch that part move.',
    // R5-text (D17): points out the brain-to-muscle glow; it needs a NEW switch-on while this line shows (ns-guide).
    glow: 'Look at a light-blue area. See the glow that joins it to the muscles it moves?',
    dragBrain: 'Hold Space on the brain and look down to drag it. See your legs?',
    // R4-fix (review RP4): with the mouse captured the crosshair must look far from the brain to reach an arrow; a free
    // mouse (Esc twice) lets you click the arrows while you watch the brain. R5-text (D16): no "curved" (user R20).
    orbit: 'Press Esc twice for a free mouse. Then click or hold an arrow by the brain to turn your view.',
    // R5-text (D18): E to the view from behind, and E again back to your own eyes.
    thirdPerson: 'Press E to see your own back. Press E again to go back.',
    // R5-text (D19): the brain catches looks and clicks while it is in front of the mirror body's arrows.
    // (shortened after the 1280x720 shot: 4 lines in the status card; now 82 characters)
    mirror: 'Move the brain aside. Space carries the visible mirror with look/WASD; its arrows turn it.'
  },
  partial: {
    moveHandNeedX: 'Good! Now try A or D to move it left or right.',
    moveHandNeedZ: 'Good! Now try W or S to move it forward or back.',
    // R5-text: shown while the thirdPerson goal is current and the view from behind is on.
    thirdPersonBack: 'This is your back! Move the mouse to look around. Press E to go back.',
    // R5-text: shown while the mirror goal is current, after the brain caught a look or click at the mirror body.
    mirrorBlocked: 'The brain is in the way. Hold Space on the brain and look away to drag it aside.',
    // R5-text: shown while the mirror goal is current, after the brain was dragged.
    mirrorNowArrows: 'Good! Now click an arrow by the mirror body to turn it around.'
  },
  nice: 'Nice!',
  finished: 'All done! Press Esc any time to see all the controls.',
  // Esc page: a small "Try this guide" row in Settings (ns-guide wiring, round4/R4-text-NOTES.md).
  escTitle: 'Try this guide',
  escHelp: 'The “Try this” guide gives you one small task at a time. It never stops the game.',
  hide: 'Hide the guide',
  show: 'Show the guide',
  restart: 'Restart the guide'
});

/** The guide line shown in the status card: "Try this (2 of 7): Press W, A, S or D to move your left hand.";
 * nice = true puts "Nice! " in front (a goal was just done). */
export function guideLine(step, total, text, nice = false) {
  const n = Number.isFinite(step) ? step : 1, m = Number.isFinite(total) ? total : n;
  return `${nice ? `${GUIDE.nice} ` : ''}${GUIDE.label} (${n} of ${m}): ${str(text)}`;
}

/** Visible App error wording only. Raw status/shell/ready errors and their causes stay with ns-app. */
export function appErrorLine(error, hint = null) {
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
    ['gazeLine(leftArm)', gazeLine('leftArm', 'Left wrist')], ['gazeLine(other)', gazeLine('other', 'Right knee')],
    ['pulseLine', pulseLine('Bend left knee', 0.6)], ['triggerLine(click)', triggerLine(3, 'click', 'Bend left knee')],
    ['triggerLine(gaze)', triggerLine(4, 'gaze', 'Close left hand')], ['suppressedLine', suppressedLine('Open left hand')],
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
