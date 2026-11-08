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

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

export const TEXT_VERSION = 'ns-text-r3 (R3-text, 2026-11-08)';

/* ------------------------------------------------------------------ honesty lines (structured) */

/** The honesty statements, each as a short plain line plus the technical wording (`more`). `id` matches the e2e
 * HONESTY ids where one exists. These are the building blocks of SHELL.limits, INFO.caveats and HUD.limitsShort. */
export const HONESTY = deepFreeze({
  simulated: {
    id: 'H1-simulated', plain: 'The brain signals and muscle activity are made up by the computer (simulated). The bones ' +
      'and muscles come from a 3D anatomy model.',
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
    plain: 'Muscle colours show the game’s made-up signal, not real muscle readings (EMG). And EMG itself is not ' +
      'nerve activity or force.',
    more: 'Muscle colour shows the simulated drive, not EMG; EMG is not nerve activity or force.'
  },
  overlapVary: {
    id: 'H5-overlap-and-vary',
    plain: 'In real brains, the body-part areas overlap and vary between people. Newer maps (Gordon et al., 2023) add ' +
      'detail to the old “little man” map (Penfield’s homunculus).',
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
    plain: 'NeuroTranslate 0.0 is only the name of a research model. No trained or validated translation model runs ' +
      'in this game.',
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
  face: {
    id: 'face-layer',
    plain: 'From inside a body you cannot see your own face. So it is shown out in front as a see-through, ghosted ' +
      'layer, or in a small box (see Settings).',
    more: 'In first person you cannot normally see your own face, so it is shown as a labelled ghosted layer or an inset.'
  }
});

/** e2e ids that the always-visible limits pill must carry (core honesty items H1-H4). */
export const CORE_HONESTY_IDS = Object.freeze(['H1-simulated', 'H2-unitless', 'H3-not-stimulation-or-decoding', 'H4-virtual-inputs']);

/* ------------------------------------------------------------------ brand */

export const BRAND = deepFreeze({
  name: 'NeuroSurge',
  /** What the game is, in one plain line. */
  tagline: 'A first-person game about how your brain moves your body. Everything in it is simulated.',
  /** The model-name rule, always with its not-validated qualifier. */
  modelName: 'NeuroTranslate 0.0 is just the name of a model. It does not read real brains (not a validated decoder).'
});

/* ------------------------------------------------------------------ game shell: start instructions and Esc page */

/** Same keys as ns-app SHELL_TEXT. Instructions and controls keep the words the e2e instruction check looks for
 * (mouse/trackpad, W, A, Space, double-tap, Esc, click, drag, arrow, Reset, 1 second). */
export const SHELL = deepFreeze({
  title: BRAND.name,
  subtitle: `${BRAND.tagline} ${BRAND.modelName}`,
  headings: { loading: 'Loading…', intro: 'How to play', playing: '', paused: 'Paused: how to play', error: 'NeuroSurge stopped' },
  introNote: 'This page closes by itself after 2 seconds. Click to start now. Press Esc to see it again.',
  pausedNote: 'Press Esc or Resume to go back to the game. Resume also locks the mouse again.',
  play: 'Start now',
  resume: 'Resume (Esc)',
  resetBody: 'Reset body',
  resetBrain: 'Reset brain view',
  playUnlocked: 'Resume without locking the mouse',
  reload: 'Reload page',
  bodyReset: 'Body reset: your pose, the palm turn and the gold marks are cleared. The brain stays where you left it.',
  /** R3-polish: one plain line under the Esc page buttons saying what the two reset buttons do. */
  resetHelp: 'Reset body puts your arm and palm back the way they started and clears the gold marks. ' +
    'Reset brain view puts the brain back where it started. To read More detail in the panel, press Esc to go back ' +
    'with a free mouse, then click More detail.',
  brainReset: 'Brain view reset: the brain is back in its first place and angle.',
  instructionsTitle: 'How to play',
  instructions: [
    'You see through the eyes of a body that stays in one place. It has no skin, just bones and muscles. Move the ' +
      'mouse or trackpad to look around.',
    'Your whole left arm is in view. The hand stays three quarters up the screen. When you look around, the arm comes ' +
      'along. It is your LEFT arm, so the hand reaches only a little past the middle of the screen to the right.',
    'A giant glass brain floats in front of you, out of reach. Its motor areas are the parts that send movement ' +
      'signals to muscles. They glow from dark (resting) to yellow (strongest), and the muscles use the same colours.',
    'Light-blue areas, in the brain’s right half, are for your left arm. Grey areas are for every other ' +
      'body part.',
    'Look at a motor area to switch it on for 1 second. Click to switch it on again. Looking at empty space does ' +
      'nothing. Areas you have used stay a bit more solid, with a gold edge, until you press Reset body.',
    'Other body parts move only through the brain, never by keys. Hold Space while looking at the brain, then look ' +
      'around to drag it. Let go to leave it there. For example, drag it down to watch the legs move.',
    'Click a curved arrow next to the brain to turn your view around it a little. Hold the arrow to keep turning. The ' +
      'brain itself stays put.',
    'Look far down to see your body and legs. Look far right and a little down for your right arm, and high up for ' +
      'your face. The “What is happening” panel explains each area you look at or click.'
  ],
  /** R3-polish: a short bold lead-in for each step (same order as `instructions`), so the page can be scanned. */
  instructionHeads: ['Look around.', 'Your left arm.', 'The glass brain.', 'Two kinds of areas.', 'Switch areas on.',
    'Move other body parts.', 'Turn your view.', 'See your body.'],
  controlsTitle: 'Controls',
  controls: [
    ['Mouse / trackpad', 'look around (your left shoulder follows)'],
    ['A / D', 'move the left hand left or right on the screen'],
    ['W / S', 'move the hand forward or back (use with A / D for diagonals)'],
    ['Hold Space', 'make a fist with all five fingers; let go to open the hand'],
    ['Double-tap Space', 'flip the forearm: palm down ↔ palm up (pronation ↔ supination)'],
    ['Look / Click', 'switch on the motor area under the crosshair for 1 second (either mouse button)'],
    ['Space on the brain', 'grab and drag the brain; let go to leave it there'],
    ['Orbit arrows', 'click a curved arrow to turn your view around the brain. Hold it to keep turning.'],
    ['Esc', 'pause and show this page: how to play, Reset body and settings']
  ],
  settingsTitle: 'Settings',
  sensitivity: 'Look speed',
  invertY: 'Flip up and down when looking (invert Y)',
  faceView: 'Face view',
  limitsTitle: 'What this game is, and is not',
  limits: [
    `${HONESTY.simulated.plain} ${HONESTY.unitless.plain}`,
    HONESTY.virtualInputs.plain,
    HONESTY.emg.plain,
    HONESTY.overlapVary.plain,
    HONESTY.notExact.plain,
    HONESTY.leftArmRightHalf.plain,
    HONESTY.crown.plain,
    HONESTY.face.plain,
    HONESTY.notDecoder.plain
  ],
  captureHint: 'Click the scene to look around · Click More detail to read more · Esc: how to play',
  lockRefused: 'The browser did not lock the mouse. After Esc it waits about a second. Click the scene to try again, or ' +
    'hold a button and drag to look. Clicks still switch areas on · Esc: how to play',
  lookOff: 'Mouse lock does not work here. W/A/S/D, Space and clicks still work · Esc: how to play',
  contextLost: 'The graphics stopped (WebGL context lost). The game waits until the browser brings them back.',
  contextLostLong: 'The graphics have not come back. Reloading the page usually fixes this.'
});

/** Face-view setting names (ns-app FACE_VIEW_LABELS). */
export const FACE_VIEW_LABELS = deepFreeze({
  ghost: 'See-through face (look up)',
  inset: 'Face in a small box',
  off: 'Off'
});

/* ------------------------------------------------------------------ HUD */

/** Same keys as ns-app HUD_TEXT (plus the new gazeStripPrefix and gazePrefix). Lines that are only in the hidden
 * details mirror are plain too, so nothing jargon-heavy is one click away. */
export const HUD = deepFreeze({
  title: 'NeuroSurge · a simulated brain-and-body game',
  brand: BRAND.modelName,
  qualifier: 'A rough map (representative). In real brains, areas overlap and vary between people.',
  control: 'Your looks and keys are game controls (virtual inputs), not real stimulation or decoding',
  simulated: 'Every number shown is simulated, from 0 to 1, with no real units (unitless)',
  view: 'Seen from above, not mirrored: front at the top, your right on the right',
  rights: 'Anatomy: BodyParts3D © DBCLS, CC BY 4.0',
  placeholderRights: 'Stand-in shapes: no BodyParts3D anatomy shown',
  limitsShort: 'Signals made up (simulated, unitless) · rough map · game controls (virtual inputs), not real stimulation or decoding',
  hint: 'Move to look. W/S reach forward or back; A/D move left or right. Hold Space to close the hand; let go to open ' +
    'it. Looking at a new area, or a click, gives 1 second of simulated signal. Click the scene to capture the mouse; ' +
    'Esc frees it.',
  hintShell: 'Look to aim. A/D move the hand left or right, W/S forward or back. Hold Space for a fist; double-tap to ' +
    'flip the forearm. Looking at a motor area gives 1 second of simulated signal, and a click repeats it. Space while ' +
    'looking at the brain drags it. Esc: how to play, reset and settings.',
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
  grabbing: 'Brain grabbed: look around to move it. Let go of Space to leave it there.',
  rotationPrefix: 'Forearm: ',
  rotationHint: ' · double-tap Space to flip',
  wholeGroupTint: 'These finger muscles serve all four fingers, so all four light up, not just one',
  spaceHeld: 'Space held: making a fist (simulated)',
  spaceReleased: 'Space let go: opening the hand (simulated)',
  reachLimited: 'Reach limited so the whole hand stays on screen',
  contextLost: SHELL.contextLost,
  placeholderAttribution: 'Stand-in shapes only, no real anatomy. The full game uses: ',
  placeholderMuscles: 'Stand-in mode has no 3D muscles. So the made-up (simulated) muscle signals are only listed.',
  unmappedPrefix: 'Not in the movement map (plain colour): ',
  /** ns-placeholder PLACEHOLDER_LABEL (the ?placeholder=1 banner). */
  placeholderBanner: 'STAND-IN SHAPES (unqualified placeholder): not real anatomy',
  /** ns-actions ARM_REACH_LABEL (the reach line in the details mirror). */
  armReachLabel: 'Simulated arm reach signal (unitless; the shoulder area is not mapped)',
  /** Round 3 (R3-integrator, R3-player item 8): shown when the dragged brain is far from where you look. */
  brainAwayHint: 'Lost the brain? Press Esc, then Reset brain view to bring it back.',
  /** R3-fix (M6): shown when looking far right at about eye level. */
  rightArmHint: 'Your right arm rests lower down: look down a little to see it'
});

/** Forearm state words (ns-app ROTATION_PLAIN): the plain words with the technical term in brackets. */
export const ROTATION = deepFreeze({ pronated: 'palm down (pronated)', supinated: 'palm up (supinated)' });

const fix1 = v => (Number.isFinite(v) ? v.toFixed(1) : '–');
const fix2 = v => (Number.isFinite(v) ? v.toFixed(2) : '–');
const str = v => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** HUD gaze line. kind: 'leftArm' | 'other' | 'between' (an in-between SCAN area) | 'strip' (a left-arm action point) |
 * 'glass' | 'brain' | 'empty'. */
export function gazeLine(kind, label = '') {
  const l = str(label).trim();
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
export function triggerLine(seq, source, label) {
  return `Signal #${seq} (${source === 'click' ? 'click' : 'new area'}): ${str(label)}`;
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
    'coloured area to switch it on. Hold Space while looking at the brain to grab and drag it.',
  leftArmTag: 'Left-arm motor area (brain’s right half)',
  otherTag: 'Other body part’s motor area (no keys)',
  integrationTag: 'In-between spot (SCAN): moves nothing',
  leftArmPathway: 'Brain → crosses to the left at the base of the brain → spinal cord in the neck → arm ' +
    'nerves → muscles (corticospinal tract, brachial plexus)',
  otherPathway: 'Brain → spinal cord or base of the brain → nerves → muscles (corticospinal or corticobulbar pathway)',
  simulated: 'Simulated: a made-up level from 0 to 1 (unitless). Nothing is recorded, sent in (stimulated) or read out (decoded).',
  known: 'Known: each half of the brain mainly moves the other side of the body. Real maps overlap and vary.',
  crownNote: HONESTY.crown.plain,
  caveats: [HONESTY.overlapVary.plain, HONESTY.notExact.plain, HONESTY.emg.plain,
    'NeuroTranslate 0.0 is just a name for a model. No validated decoder runs in this game.'],
  lastViewed: 'Last area you looked at',
  viewedLast: 'Last area you looked at (the crosshair is on empty space)',
  rows: {
    bodyPart: 'Body part', movement: 'Movement', agonists: 'Muscles that pull', antagonists: 'Muscles that work the other way',
    pathway: 'Signal path'
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
  if (region.kind === 'integration') return known('these in-between spots link up plans for the whole body (Gordon et al., 2023).');
  const h = halfOf(region.hemisphere), o = otherHalf(region.hemisphere), lat = str(region.laterality);
  if (leftArm) return known('the right half of the brain mainly moves the left arm (right hemisphere).');
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
 *   more: { title, technicalName, hemisphere, effector, explanation, muscles: { pull, relax, steady }, note, caveats,
 *   sources } }.
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
  if (pm && pm.relax) rows.push([INFO.rows.antagonists, pm.relax]);
  rows.push([INFO.rows.pathway, plainPathway(region, leftArm)]);
  const list = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string' && x) : []);
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
    more: {
      title: INFO.moreDetail,
      technicalName: str(region.label),
      hemisphere: halfOf(region.hemisphere) ? `${region.hemisphere} hemisphere` : '',
      effector: str(region.effector),
      explanation: str(region.explanation),
      muscles: { pull, relax, steady: action ? list(action.stabilizers) : [] },
      note: action ? str(action.note) : str(region.noActionReason),
      caveats: list(caveats),
      sources: sourcesLine(citations)
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
    ['other', 'Areas for every other body part', 'Other parts'],
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

/** Face layer captions (ns-scene-three FACE_LAYER ghostLabel / insetLabel). */
export const FACE = deepFreeze({
  ghostLabel: 'Your face (see-through view): skull, jawbone and neck muscles, seen from the front, not mirrored. The 3D ' +
    'body has no face, chewing or tongue muscles. From inside, you could not see your own face.',
  insetLabel: 'Your face (small view): skull, jawbone and neck muscles, seen from the front. The 3D body has no face, ' +
    'chewing or tongue muscles.'
});

/* ------------------------------------------------------------------ page (scene/example/index.html) */

export const PAGE = deepFreeze({
  title: BRAND.name,
  canvasLabel: 'NeuroSurge game view. You move a simulated body and brain with game controls (no real stimulation or ' +
    'decoding).',
  noscript: 'NeuroSurge needs JavaScript and 3D graphics (WebGL) to run.',
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
  'The old “little person” map (Penfield’s homunculus) sums up early brain tests whose maps overlapped a lot. ' +
    'Newer maps (Gordon et al., 2023) show areas in rings, with three in-between areas.',
  'Recordings from single brain cells found signals for the whole body at every spot tested, all mixed together. So ' +
    'no area here is the one exact spot for a muscle. The borders are only game borders.',
  HONESTY.crown.plain,
  'Arm and leg muscles get their signals mainly from the other half of the brain. Your left arm is moved mainly by ' +
    'the right half (right hemisphere). Trunk, neck, upper face, jaw and tongue get strong signals from both halves.',
  'Muscle lists are rough roles from anatomy tables, not measurements. A muscle that is switched on does not always ' +
    'get shorter. Muscle colour shows the made-up signal, not muscle readings (EMG) or force.',
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
  walk(HUD, 'HUD');
  walk(ROTATION, 'ROTATION');
  walk(INFO, 'INFO');
  walk(ORIENTATION, 'ORIENTATION');
  walk(ORIENTATION_SHORT, 'ORIENTATION_SHORT');
  walk(ORBIT, 'ORBIT');
  walk(LEGEND, 'LEGEND');
  walk(FACE, 'FACE');
  walk(PAGE, 'PAGE');
  walk(MAP_CAVEATS, 'MAP_CAVEATS');
  const samples = [
    ['gazeLine(leftArm)', gazeLine('leftArm', 'Left wrist')], ['gazeLine(other)', gazeLine('other', 'Right knee')],
    ['pulseLine', pulseLine('Bend left knee', 0.6)], ['triggerLine(click)', triggerLine(3, 'click', 'Bend left knee')],
    ['triggerLine(gaze)', triggerLine(4, 'gaze', 'Close left hand')], ['suppressedLine', suppressedLine('Open left hand')],
    ['rotationLine', rotationLine('supinated')], ['elbowLine', elbowLine({ commandDeg: 40, achievedDeg: 31, limited: true })],
    ['activityLine', activityLine(0.8)], ['activationsLine', activationsLine(2)], ['moreCaveatsLine', moreCaveatsLine(2)],
    ['LEFT_ARM_LABEL', LEFT_ARM_LABEL]
  ];
  for (const k of ['arm', 'leg', 'trunk', 'face']) for (const h of ['right', 'left']) samples.push([`regionGroupLabel(${k},${h})`, regionGroupLabel(k, h)]);
  for (const [p, t] of samples) out.push([p, t]);
  return out;
}
