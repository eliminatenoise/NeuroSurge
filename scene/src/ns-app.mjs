/** NeuroSurge POV arm scene: bootstrap, hash-verified asset orchestration and the pure per-frame simulation step.
 *
 * start({ THREE, canvas, hudRoot, manifestUrl, packetBases, movementMapUrl, fetchText, sha256Hex, placeholder,
 *         shellRoot?, storage?, qa? })
 *   -> { stop(), suspend(), resume(), status(), ready: Promise<{ ok, error?, frames? }>, inspect(options?), qa }
 * `ready` resolves only after the first frame has actually been rendered (or with ok: false on a failure or stop).
 * inspect() returns a plain-JSON copy (never live simulation, mesh or Three references).
 * With `shellRoot` (game shell) a 2 s instructions intro, an Esc/pointer-lock-loss pause overlay with Reset body,
 * look-sensitivity / invert-Y settings (try/catch-guarded storage), a context-loss banner and an aria-live gaze
 * region are built inside it; without it the scene plays at once, as before. With `qa: true`, `qa` is the
 * deterministic QA API (setLook, key, click, step, pause, resume, snapshot, screenshotReady, play, showPause, shell,
 * settings); otherwise it is null. No activation ever starts without user input: the gaze is seeded silently on the
 * first frame and on every reframe/resize (stepFrame silentGaze).
 * THREE, fetching and hashing are injected. Nothing here touches THREE at module load, so the module loads in Node.
 * createSimulation / stepFrame and the HUD text builders are pure and run in Node tests. Only start() touches the
 * view of the canvas (its requestAnimationFrame) and, through ns-scene-three, Three and the HUD DOM.
 *
 * Per frame (browser-findings repair R2 order: activity first, so the pose shows this frame's drives, no lag):
 *  1. read controls (keys, yaw/pitch, drained space/click events, each with its own monotonic event time);
 *  2. classify gaze with the pure focus test; the Three Raycaster (ns-scene-three) is used only for the HUD
 *     'brain' state;
 *  3. step the activity on ACTUAL elapsed wall time with every event at its own time offset (gaze, click/space,
 *     display-only reach linkage) through the Space/pulse addendum gate: the 1 s pulse and the release window
 *     expire at real elapsed time whatever the frame rate;
 *  4. stepReach on the CAPPED pose step (MAX_FRAME_DT) -> fitHand with the pose composed from this frame's
 *     commanded drives; an elbow action becomes an explicit signed elbow-angle target (depthForElbow), re-fitted;
 *  5. skin the arm only when the pose matrices change (ns-scene-three);
 *  6. tint muscles from muscleDrives and colour the strip from fieldIntensity;
 *  7. crosshair and HUD (logical pulse expiry and residual smoothed display are reported separately).
 *
 * Round 2 (U4-app, 2026-11-08 user requirements R1-R14):
 *  - the shell starts with a 2 s instructions overlay (INTRO_MS) that hides by itself; Esc shows the full
 *    instructions/controls page (pause) with RESET BODY, Reset brain view, settings (look sensitivity, invert Y,
 *    face-view mode) and the honesty lines, and Esc again resumes; a 'click to capture the mouse' hint with the
 *    drag-to-look fallback (ns-controls bindDom) while the pointer is not captured;
 *  - A1 activation wiring (round1/A1-activation-ns-app-wiring.reference.patch): stepGated, yaw/pitch for the restart
 *    deadband, silent seeding through `seed: true`, key-intent reach events with the realised reach rates,
 *    muscleDisplayDrives and reachOutputs, and bindDom lock callbacks and look options;
 *  - whole-body plumbing coded against the shared round-2 interfaces and FEATURE-DETECTED, so the module runs with
 *    whatever sibling modules exist: normalised region gaze (ns-brain classifyGaze kind 'region' | 'glass' |
 *    'empty', legacy 'strip'), orbit / brain grab / pronation-supination / activation marks / reset (ns-actions,
 *    with small labelled fallbacks here while it lacks them), brainViewTransform (ns-brain), body joint targets ->
 *    ns-body poseBody, BODY_MOTOR_MAP (ns-bodymap) and ns-colors (both loaded optionally, see loadOptionalModules),
 *    the far-right information overlay model (infoOverlayModel; ns-scene-three draws it, or a fallback panel here);
 *  - the QA API (?qa=1) adds esc, orbit, resetBody, resetBrainView and info, and its snapshot reports region
 *    activity, activation marks, rotation state, brain view/transform, orbit, instructions, the hand NDC box and
 *    body visibility flags (null wherever the owning module does not provide them yet).
 *
 * Integration round 2 (single integration writer): the anatomical left-shoulder attachment and eye (ns-arm armAttachment,
 * ns-assets eyePosition; GAME_ARM_OPTIONS, TRUNK_FREE_DEG, NECK_FLEX), the activity's eased forearm rotation value, the
 * WASD wrist coordination (WASD_WRIST), the full body loaded by default (pinned manifest; ?fullbody=0 turns it off) and
 * placed on the same eye/trunk frame as the arm (scene setBodyFrame), recolouring on drive changes, region-mode
 * orientation labels from the drawn brain, brain framing beside the far-right info column (brainCentreForPanel), ONE
 * pause authority (the shell, forwarded to the activity by setPaused), verified QA regionTargets, and the A/D intent
 * kept across looks (U3a reachState with the xRange/depthRange wind-up guard). See round2/INTEGRATION.md.
 *
 * Scientific limits: all quantities are virtual, simulated, unitless display values. Gaze, click, Space and WASD are
 * virtual control inputs, not real stimulation or decoding. The motor map is representative; regions overlap and
 * vary between people. The rig, pivots and compartment directions are geometric approximations.
 */
import { DEG, clamp } from './ns-math.mjs';
import { createControls, bindDom, CONTROL_CODES } from './ns-controls.mjs';
import {
  loadAssets, validateManifest, boneInputs, compartmentDirections, SEGMENT_OF, MUSCLE_OF, BRAIN, ATTRIBUTION,
  MUSCLE_COVERAGE_GAPS, eyePosition, parseObjFast, streamFullbodyAssets, fullbodyAppInputs
} from './ns-assets.mjs';
import { deriveRig, segmentBoxes, skinWeights, SEGMENTS, HAND_SEGMENTS } from './ns-rig.mjs';
import {
  ARM_DEFAULTS, REACH_STATE_MAX_DEPTH, ELBOW_MAX_DEG, FOREARM_SUPPORT_KEY, fitHand, stepReach, reachStart, depthForElbow,
  armAnatomy, armAttachment, bodyYawForLook, pronationStart, pronationTarget, stepPronation, carryReachRamp, wasdWristDeg,
  handViewLimitsNdc
} from './ns-arm.mjs';
import { PLACEHOLDER_LABEL, buildPlaceholderArm } from './ns-placeholder.mjs';
import { bindMovementMap, composePose, muscleDrives, createActivity, eventOffset, ACTION_IDS } from './ns-actions.mjs';
import {
  ARM_BAND, BAND_FRAME, stripParam, splitBand, placeMarkers, placementForBand, orientationAnchorsForBand,
  gazeRayInSource, classifyGaze, colormap
} from './ns-brain.mjs';
import { createScene, createHud, armAvoidShapes, CAMERA, infoPanelRect, ORBIT_HOLD, QUALITY_LEVELS, statusCardPlanPx, STATUS_CARD_PLAN, guideFloatSpot } from './ns-scene-three.mjs';
// Namespace imports for exports the parallel round-2 owners are adding (a missing name is undefined, never a link
// error): ns-actions resetBody / orbitStep, ns-brain brainViewTransform / BRAIN_VIEW_TILT_DEG.
import * as NsActions from './ns-actions.mjs';
import * as NsBrain from './ns-brain.mjs';
// Round 3 (R3-integrator): every visible string comes from ns-text (R3-text, the single source of plain UI text; R17/D3).
import * as NT from './ns-text.mjs';
import * as NG from './ns-guide.mjs';

const fail =(code, message) => { throw new Error(`ns:${code}: ${message}`); };
const errorText = err => (err && typeof err.message === 'string' ? err.message : String(err));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* ------------------------------------------------------------------ constants */

export const FOV_Y_DEG = CAMERA.fovYDeg;
/** Narrow-layout camera (repair R3, Root R2 acceptance finding 1). With a fixed 70 deg vertical FOV a 390x844 portrait
 * view is only ~36 deg wide: 72 of the 120 extreme poses (wrist extension, spread) then fit at NO reachable depth at the
 * centre anchor, so no A/D anchor range exists and the hand was pinned at x = 0. Narrow viewports therefore widen the
 * vertical FOV until the horizontal FOV reaches MIN_HORIZONTAL_FOV_DEG (capped at MAX_FOV_Y_DEG); aspects of about
 * 0.74 and wider keep 70 deg. The safety margin, near limit, extreme-pose envelope and y = 0 rule are unchanged. */
export const MIN_HORIZONTAL_FOV_DEG = 55;
export const MAX_FOV_Y_DEG = 120;

/** Effective vertical FOV (deg) for an aspect: max(base, the FOV giving MIN_HORIZONTAL_FOV_DEG horizontally), capped. */
export function effectiveFovYDeg(aspect, { baseFovYDeg = FOV_Y_DEG, minHorizontalFovDeg = MIN_HORIZONTAL_FOV_DEG, maxFovYDeg = MAX_FOV_Y_DEG } = {}) {
  if (!(Number.isFinite(aspect) && aspect > 0)) fail('app_input', 'aspect must be a positive finite number');
  const needed = (2 * Math.atan(Math.tan((minHorizontalFovDeg * DEG) / 2) / aspect)) / DEG;
  return Math.min(maxFovYDeg, Math.max(baseFovYDeg, needed));
}
/** Default band framing (browser-findings repair R2, item 3; ns-brain BAND_FRAME / frameBand): the representative
 * left-arm/hand band's actual projected vertices fill 0.66 (0.58 below aspect 1.45) of the limiting half-screen and
 * are centred on the crosshair, at 6 m. R1's box rule (fill 0.8) overstated the band: its real extent was 0.547. */
export const FRAME = BAND_FRAME;
/** A gaze change above this (per frame, yaw or pitch) counts as 'moved'. */
export const GAZE_MOVED_DEG = 0.05;
/** Longest POSE/motion integration step per frame (s): W/S/A/D movement after a long gap (tab switch, slow
 * software rendering) is clamped so the hand never jumps. The activity clocks (1 s pulse, release window, drive
 * smoothing) are NOT capped: they run on actual elapsed wall time (browser-findings repair R2, item 1). */
export const MAX_FRAME_DT = 0.1;
/** Residual commanded drive above this, with no pulse active, is reported as display easing (not a live pulse). */
export const RESIDUAL_DISPLAY_MIN = 0.02;
/** An elbow movement short of its target by more than this (deg) is reported as limited. */
export const ELBOW_LIMIT_TOL_DEG = 0.5;
/** Single-digit actions whose catalog muscles (FDS, FDP, ED) are whole multi-digit meshes. */
export const WHOLE_GROUP_TINT_ACTIONS = Object.freeze(['index_flexion', 'index_extension']);
/** The HUD-only brain raycast runs at most this often (s) and only when the gaze changed. */
export const BRAIN_RAYCAST_INTERVAL_S = 0.2;
/** How long the HUD shows a pulse re-trigger mark (s). */
export const TRIGGER_MARK_SECONDS = 0.3;

/* Round 2 (U4-app) */

/** R10: the hand target sits three quarters up the screen (NDC y = +0.5). Passed to ns-arm fitHand / depthForElbow as
 * request.yNdc; the snapshot reports the ACHIEVED fit.yNdc (0 while ns-arm still fixes the hand at mid-height). */
export const HAND_Y_NDC = 0.5;
/**
 * WASD wrist coordination (integration round 2, R8 "WASD give coordinated shoulder + elbow + wrist + hand movement"):
 * the reach keys move the hand anchor (A/D across, W/S in depth) and the IK moves shoulder and elbow; this adds a
 * small wrist component tied to the same reach state so the wrist moves with them: reaching deeper (W) extends the
 * wrist slightly, pulling back (S) flexes it, moving the hand across the body (D) flexes it slightly and out (A)
 * extends it. A DISPLAY GAME CONVENTION (not a measured synergy, not EMG, not a decoder), capped at maxDeg and added
 * to the commanded wrist pose before the whole-hand fit (which may still limit it, see fitHand clamped.wrist).
 */
/**
 * Game arm options (integration): the starting W/S depth is 0.35 m (ns-arm default 0.30) so that at a level look the
 * elbow sits further forward and the distal upper arm is in view (measured on the real rig, 16:9: about 20 % of the
 * humerus vertices in view vs about 6 % at 0.30; the elbow stays bent about 37 deg). R3 "see the whole arm".
 */
export const GAME_ARM_OPTIONS = Object.freeze({ depthStart: 0.35 });
export const WASD_WRIST = Object.freeze({ depthRefM: GAME_ARM_OPTIONS.depthStart, degPerM: -60, xRefNdc: ARM_DEFAULTS.xNdcStart, degPerNdc: 12, maxDeg: 15 });
/**
 * Trunk follow for wide looks (ns-arm bodyYawForLook). The integration widens U3a's right free range from 45 to 60 deg
 * (left unchanged at 100): measured on the real rig the left shoulder stays inside SHOULDER_LIMITS at an 83 deg right
 * look (75 deg breaks the horizontal-adduction limit), and the right arm stays in view when looking far right (R7).
 */
export const TRUNK_FREE_DEG = Object.freeze({ right: 60, left: 100 });
/**
 * Looking far down flexes the neck (integration): the first-person eye moves forward and down with the head, so the
 * legs and feet come into view past the chest (from the upright BodyParts3D eye the chest hides them). Display
 * approximation of head flexion (not a measured kinematic): eased by smoothstep from startPitchDeg to fullPitchDeg,
 * shift in BodyParts3D mm (anterior -y, up +z). The camera stays at the world origin; the body is placed relative to
 * the shifted eye, so the arm attachment, the body frame and the face layer all use the same eye. Looks above
 * startPitchDeg are unaffected (the body stays fixed for ordinary looking). Round-2 fix F3: forwardMm 170 -> 70, so the
 * chest and abdomen stay in the lower part of the view (with 170 mm the eye passed in front of the chest and the torso
 * left the frame); the torso's see-through window (ns-scene-three BODY_SEE_THROUGH, fill 0.4) shows the legs through it.
 * Round 3 (R3-body, D4): the body now SITS (ns-body seated posture), so the thighs, knees and feet lie in front of the
 * chest and no see-through window is drawn; forwardMm 70 -> 120 and downMm 60 -> 80 bring the belly into the far-down
 * view (body-only ID buffer: belly 0.17 % -> 1.14 %, chest 15.25 % -> 6.19 %, thighs 6.44 % -> 8.24 %). Display choice,
 * implies a slight forward lean; only looks below startPitchDeg are affected.
 */
export const NECK_FLEX = Object.freeze({ startPitchDeg: -35, fullPitchDeg: -75, forwardMm: 120, downMm: 80 });
/** Eye shift (BodyParts3D mm) for a look pitch (radians) under NECK_FLEX (pure). */
export function neckFlexEyeShiftMm(pitch, o = NECK_FLEX) {
  if (!o || !Number.isFinite(pitch)) return [0, 0, 0];
  const u = clamp((pitch / DEG - o.startPitchDeg) / (o.fullPitchDeg - o.startPitchDeg), 0, 1);
  const k = u * u * (3 - 2 * u);
  return k === 0 ? [0, 0, 0] : [0, -o.forwardMm * k, -o.downMm * k];
}
/** Wrist degrees (+ flexion) for a reach state under WASD_WRIST (pure). */
export function wristReachDeg(reach, o = WASD_WRIST) {
  if (!o || !reach || !Number.isFinite(reach.depth) || !Number.isFinite(reach.xNdc)) return 0;
  const v = o.degPerM * (reach.depth - o.depthRefM) + o.degPerNdc * (reach.xNdc - o.xRefNdc);
  return clamp(v, -o.maxDeg, o.maxDeg);
}
/** Brain framing centre (NDC) that keeps the motor strips out from under the far-right info column (pure). The
 * strips are centred on the free part of the screen, scaled by `share` and limited to +-maxShift, so the crosshair
 * still lands on the brain and nothing jumps when the panel layout changes. */
export function brainCentreForPanel(size, { share = 0.8, maxShift = 0.3 } = {}) {
  if (!size || !(size.width > 0 && size.height > 0)) return [0, 0];
  const r = infoPanelRect(size);
  if (!r) return [0, 0];
  let cx = 0, cy = 0;
  if (r.layout === 'portrait') { const yTop = 1 - 2 * r.y0 / size.height; cy = share * (yTop + 1) / 2; } // free y in [yTop, 1]
  else { const xRight = 2 * r.x0 / size.width - 1; cx = share * (xRight - 1) / 2; }                     // free x in [-1, xRight]
  const q = v => Math.round(clamp(v, -maxShift, maxShift) * 1000) / 1000;
  return [q(cx), q(cy)];
}
/** Round 3 (D1, R3-brain wiring 5.1): the usable brain area (NDC) for a CSS viewport size: the view minus the far-right
 * info column (portrait: the bottom band, so the brain stays above it) with a 12 px gap, minus the top limits line
 * (ns-brain usableNdcFromLayout). null without a size or without the ns-brain helper (frameBrain then infers it from
 * centreNdc, the round-2 convention). Pure. */
/** R4-integrator (D5 priority 2 before 3, and 5): in portrait the status card is a full-width strip at the top, so the
 * brain also stays below the card's PLANNED box (top line + 12 px + statusCardPlanPx + 8 px), as it stays above the
 * bottom band. Without it the card (with the guide line) hid the brain's front end at 390x844 (e2e S29 front end seen
 * 0.0005 of its top-down share, run-R4-integrator-4-qa) and the forward arrow. Cost at 390x844: belt 0.62 -> 0.44 (e2e
 * S29; R4-fix RP2: 0.505 with the shorter phone card plan)
 * (round4/INTEGRATION.md). The planned box depends on the view size only, so the framing never moves with the text. */
// narrowToastPx: on narrow portrait screens (<= STATUS_CARD_PLAN.narrowMaxPx, the CSS breakpoint of R4-access BLOCK 1)
// the look-around toast is a full-width row just above the bottom band (two lines, 42 px at 390x844, + 6 px); it stays
// up in drag-to-look mode, so the brain stays above it too (else it covered the back end and left the back arrow no
// clear spot: plan class 4, drawn under the legend, run-R4-integrator-7-plan).
export const PORTRAIT_CARD_RESERVE = Object.freeze({ gapAbovePx: 12, gapBelowPx: 8, narrowToastPx: 48 });
export function brainUsableNdc(size, brainModule = NsBrain) {
  if (!size || !(size.width > 0 && size.height > 0) || typeof brainModule.usableNdcFromLayout !== 'function') return null;
  const r = infoPanelRect(size);
  if (!r) return null;
  try {
    const top = brainModule.BRAIN_VIEW && Number.isFinite(brainModule.BRAIN_VIEW.topReservePx) ? brainModule.BRAIN_VIEW.topReservePx : 26;
    const cardPx = top + PORTRAIT_CARD_RESERVE.gapAbovePx + statusCardPlanPx(size.width, size.height, true) + PORTRAIT_CARD_RESERVE.gapBelowPx;
    const narrow = size.width <= STATUS_CARD_PLAN.narrowMaxPx;
    return r.layout === 'portrait'
      ? brainModule.usableNdcFromLayout(size, { reserveBottomPx: size.height - r.y0 + (narrow ? PORTRAIT_CARD_RESERVE.narrowToastPx : 0), gapPx: 12, topPx: cardPx })
      : brainModule.usableNdcFromLayout(size, { reserveRightPx: size.width - r.x0, gapPx: 12 });
  } catch {
    return null;
  }
}
/** Legend note in region mode (both hemispheres' body-map regions). */
export const REGION_MODE_NOTE = NT.LEGEND.regionNote;
/** R6: the instructions overlay shows for this long on first start, then hides by itself (ms, app clock). */
export const INTRO_MS = 2000;
/** An Esc keydown this soon after Esc released the pointer lock (which already paused) is the same press (ms). */
export const ESC_UNLOCK_GUARD_MS = 400;
/** Fallback double-tap window (two Space presses, s) used only while ns-actions has no rotationState. */
export const DOUBLE_TAP_S = 0.35;
/** The forearm rotation states (R5); the fallback starts pronated (palm down). */
export const ROTATION_STATES = Object.freeze(['pronated', 'supinated']);
/** Orbit directions (R12 arrow buttons) and the fallback orbit step and limits (DEGREES, the ns-brain BRAIN_VIEW
 * values) used only while neither ns-actions orbitStep nor ns-brain orbitStepView exists. Orbit turns the view around
 * the LOCKED brain centre; the player never moves. */
export const ORBIT_DIRS = Object.freeze(['left', 'right', 'forward', 'back']);
export const ORBIT_FALLBACK = Object.freeze({ stepDeg: 15, maxYawDeg: 60, maxPitchDeg: 30 });
/** Face-view settings (R7 / body view): the ghosted facial musculoskeletal layer seen from the eyes at high pitch
 * (default), a labelled inset as the alternative, or off. ns-scene-three setFaceView(mode) renders them. */
export const FACE_VIEW_MODES = Object.freeze(['ghost', 'inset', 'off']);
export const FACE_VIEW_LABELS = NT.FACE_VIEW_LABELS;
/** Optional sibling modules (round-2 shared interfaces 1-3), loaded with loadOptionalModules(). */
export const OPTIONAL_MODULES = Object.freeze({ colors: './ns-colors.mjs', bodyMap: './ns-bodymap.mjs', body: './ns-body.mjs' });

/** Pinned sha256 of the Root-ACCEPTED current inputs (NEUROSURGE-SOURCE-INTEGRATION-APPLIED-R1): the R6 overlay
 * movement map and the 142-entry combined mesh manifest in neurosurge-integration-r1 (tests/paths.mjs). */
export const PINNED_SHA256 = Object.freeze({
  movementMap: '55205e4fd9468850d2b5e694cb4a7462892efa4f58513d9956ea66a036bef258',
  meshManifest: '0275d915148e8af4da678cd828cb577aa5e7293ffa5ef48e3786247e4ba11448',
  // inputs/FULLBODY-MESH-MANIFEST.json (U0 acquisition record, round 2): the full-body manifest is pinned like the arm's.
  fullbodyManifest: 'e66ba962e32bd7843c6b75c588e6545a6ca9ecdeb17d6ff71e9758aa05b1ea82'
});

/** The Space/pulse rules now live in ns-actions createActivity; these are the same constants (no second copy). */
export { SPACE_COMPETING, DIGIT_FLEXING as DIGIT_FLEX_PULSES } from './ns-actions.mjs';
import { SPACE_COMPETING, DIGIT_FLEXING as DIGIT_FLEX_PULSES } from './ns-actions.mjs';

export const HUD_TEXT = NT.HUD;

/** Plain words for the forearm rotation state (the technical term stays in brackets). */
export const ROTATION_PLAIN = NT.ROTATION;

/** R/L and anterior/posterior brain labels (display axes from ns-brain ORIENTATION). Polish: plain words; the brain is
 * the player's own, seen from above and not mirrored, so its right half is on the player's right. */
export const ORIENTATION_TEXT = NT.ORIENTATION;
/** Short R/L labels for narrow (portrait) viewports; anterior/posterior keep their full text. */
export const ORIENTATION_TEXT_SHORT = NT.ORIENTATION_SHORT;

/** Legend gradient stops (display sRGB) for the simulated activity colour ramp. */
export const LEGEND_STOPS = Object.freeze([0, 0.25, 0.5, 0.75, 1].map(t => {
  const [r, g, b] = colormap(t);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}));

/* ------------------------------------------------------------------ placeholder brain (constructed) */

const PH_STRIP = Object.freeze({ nu: 120, nv: 6, xMedial: 2, xSpan: 60, yCentre: -70, yWidth: 12, ySlant: 14, zTop: 1622, zDrop: 45, zCrown: 2 });

function domeMesh(centre, radii, rings, segments, maxPolarDeg) {
  const pos = [centre[0], centre[1], centre[2] + radii[2]];
  for (let r = 1; r <= rings; r++) {
    const th = maxPolarDeg * DEG * (r / rings);
    for (let s = 0; s < segments; s++) {
      const ph = (2 * Math.PI * s) / segments;
      pos.push(centre[0] + radii[0] * Math.sin(th) * Math.cos(ph), centre[1] + radii[1] * Math.sin(th) * Math.sin(ph), centre[2] + radii[2] * Math.cos(th));
    }
  }
  const ring = (r, s) => 1 + (r - 1) * segments + (s % segments);
  const idx = [];
  for (let s = 0; s < segments; s++) idx.push(0, ring(1, s), ring(1, s + 1));
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = ring(r, s), b = ring(r, s + 1), c = ring(r + 1, s + 1), d = ring(r + 1, s);
      idx.push(a, d, c, a, c, b);
    }
  }
  return { positions: new Float32Array(pos), indices: Uint32Array.from(idx) };
}

/**
 * UNQUALIFIED PLACEHOLDER brain for ?placeholder=1 and tests: a constructed right-hemisphere strip (every x < 0,
 * medial |x| = 2 mm to lateral |x| = 62 mm, so u runs 0..1 across it) plus one constructed glass dome. Not anatomy.
 * @returns {{ label, placeholder: true, strip: { label, positions, indices }, glass: [{ label, positions, indices }], notes }}
 */
export function buildPlaceholderBrain() {
  const { nu, nv } = PH_STRIP;
  const positions = new Float32Array((nu + 1) * (nv + 1) * 3);
  let k = 0;
  for (let j = 0; j <= nv; j++) {
    const s = j / nv; // 0 = anterior edge (-y) .. 1 = posterior edge (+y)
    for (let i = 0; i <= nu; i++) {
      const r = i / nu; // 0 = medial .. 1 = lateral
      positions[k++] = -(PH_STRIP.xMedial + PH_STRIP.xSpan * r);
      positions[k++] = PH_STRIP.yCentre + PH_STRIP.yWidth * (s - 0.5) - PH_STRIP.ySlant * (r - 0.5);
      positions[k++] = PH_STRIP.zTop - PH_STRIP.zDrop * r * r + PH_STRIP.zCrown * (1 - (2 * s - 1) * (2 * s - 1));
    }
  }
  const at = (i, j) => j * (nu + 1) + i;
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      idx.push(a, b, c, a, c, d);
    }
  }
  const dome = domeMesh([0, -20, 1545], [72, 95, 85], 8, 32, 80);
  return Object.freeze({
    label: PLACEHOLDER_LABEL,
    placeholder: true,
    strip: Object.freeze({ label: `${PLACEHOLDER_LABEL}: constructed right-hemisphere strip`, positions, indices: Uint32Array.from(idx) }),
    glass: Object.freeze([Object.freeze({ label: `${PLACEHOLDER_LABEL}: constructed glass dome`, positions: dome.positions, indices: dome.indices })]),
    notes: Object.freeze([
      'Constructed strip and dome for tests and placeholder display only; not anatomy and not a functional map.'
    ])
  });
}

/* ------------------------------------------------------------------ scene data (pure) */

function prepareStrip(mesh) {
  const u = stripParam(mesh.positions, 'right');
  const split = splitBand(mesh, u, ARM_BAND);
  if (split.focus.faceCount === 0) fail('app_strip', 'no strip triangle lies inside the representative arm band');
  // Repair R3 (Root marker findings): dots on the visible crown inside their own u-band, so a drawn dot, its selectable
  // region and the field highlighting agree (ns-brain placeMarkers with triangle indices).
  const markers = placeMarkers(mesh.positions, u, { band: ARM_BAND, indices: mesh.indices });
  return { focus: split.focus, glass: split.glass, markers };
}

/** Cuff (mm) proximal of the most proximal hand bone for the independent anatomical hand domain in fitBoxes. Root's QA
 * selector (ANATOMICAL-MASK-REVIEW-R1) uses 5 mm on its own distal axis; the shipped selector uses 10 mm on BOTH the
 * forearm and the hand axis, so it is a superset (checked against Root's exact published rule in tests/bounds-r3). */
export const HAND_DOMAIN_CUFF_MM = 10;

/**
 * Independent anatomical hand domain (weight-independent): per muscle, the vertex indices of (a) every muscle mesh lying
 * wholly distal of the cutoff (intrinsic hand muscles) and (b) every triangle of the other meshes touching the distal
 * half-space (all three vertices). Cutoff = min hand-bone projection - HAND_DOMAIN_CUFF_MM, from the wrist pivot along
 * each of the forearm and hand directions (union). Hand bones are covered by their rigid segment boxes.
 * @returns {Array<Uint8Array>} per muscle, 1 for selected vertices
 */
export function handDomain(rig, boneMeshes, muscles) {
  const w = rig.pivots.wrist;
  const axes = [rig.dirs.forearm, rig.dirs.hand];
  const cut = axes.map(a => {
    let m = Infinity;
    for (const seg of HAND_SEGMENTS) {
      const arrays = boneMeshes.get(seg);
      if (!arrays) continue;
      for (const arr of Array.isArray(arrays) && typeof arrays[0] !== 'number' ? arrays : [arrays]) {
        for (let i = 0; i < arr.length; i += 3) m = Math.min(m, (arr[i] - w[0]) * a[0] + (arr[i + 1] - w[1]) * a[1] + (arr[i + 2] - w[2]) * a[2]);
      }
    }
    if (!Number.isFinite(m)) fail('app_bounds', 'hand bones are required for the anatomical hand domain');
    return m - HAND_DOMAIN_CUFF_MM;
  });
  const distal = (p, i) => axes.some((a, k) => (p[i] - w[0]) * a[0] + (p[i + 1] - w[1]) * a[1] + (p[i + 2] - w[2]) * a[2] >= cut[k]);
  return muscles.map(m => {
    const n = m.positions.length / 3;
    const sel = new Uint8Array(n);
    let all = true;
    for (let v = 0; v < n; v++) if (!distal(m.positions, 3 * v)) { all = false; break; }
    if (all) { sel.fill(1); return sel; }
    const idx = m.indices;
    if (!idx) return sel;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (distal(m.positions, 3 * a) || distal(m.positions, 3 * b) || distal(m.positions, 3 * c)) sel[a] = sel[b] = sel[c] = 1;
    }
    return sel;
  });
}

function gather(positions, verts) {
  const out = new Float32Array(3 * verts.length);
  let j = 0;
  for (const v of verts) { out[j++] = positions[3 * v]; out[j++] = positions[3 * v + 1]; out[j++] = positions[3 * v + 2]; }
  return out;
}

/**
 * Conservative hand-fit boxes (repair R2 item 4; widened in R3 to the anatomical hand domain). Bones are rigid (one
 * segment each). The bounded muscle domain is the UNION of every vertex with a POSITIVE skin weight on a hand or digit
 * segment (either influence; Root's 39311-point sampler set) and the weight-independent anatomical hand domain
 * (handDomain; a superset of Root's 36080-point selector). Every domain vertex is bounded by EACH of its influences: its rest position goes into the box of each influence segment
 * with w > 0, and a forearm influence goes into the forearm-support box (ns-arm FOREARM_SUPPORT_KEY, forearm rest
 * frame). Linear blend skinning puts the rendered vertex on the segment between its two transformed positions, each
 * inside its transformed box, and the screen-safe region is convex, so checking every box corner bounds all rendered
 * hand tissue. A hand-tissue vertex with an upper-arm influence cannot be bounded in the hand frame and is refused.
 * @returns {Map<string, corners[]>} segment boxes (plus FOREARM_SUPPORT_KEY when wrist tissue blends with the forearm)
 */
export function fitBoxes(rig, boneMeshes, muscles = []) {
  const lists = new Map();
  const push = (seg, arr) => { if (!lists.has(seg)) lists.set(seg, []); lists.get(seg).push(arr); };
  for (const [segment, arrays] of boneMeshes) {
    for (const a of Array.isArray(arrays) && typeof arrays[0] !== 'number' ? arrays : [arrays]) push(segment, a);
  }
  const handIndex = new Set(HAND_SEGMENTS.map(s => SEGMENTS.indexOf(s)));
  const forearm = SEGMENTS.indexOf('forearm');
  const support = [];
  const domain = handDomain(rig, boneMeshes, muscles);
  muscles.forEach((m, mi) => {
    const { i0, i1, w0, w1 } = m.weights;
    const n = m.positions.length / 3;
    const bySeg = new Map();
    for (let v = 0; v < n; v++) {
      const a = w0[v] > 0 ? i0[v] : -1, b = w1[v] > 0 ? i1[v] : -1;
      if (!(handIndex.has(a) || handIndex.has(b) || domain[mi][v])) continue;
      for (const k of a === b ? [a] : [a, b]) {
        if (k < 0) continue;
        if (!handIndex.has(k) && k !== forearm) {
          fail('app_bounds', `${m.name}: hand tissue with a ${SEGMENTS[k]} skin influence cannot be bounded in the hand frame`);
        }
        if (!bySeg.has(k)) bySeg.set(k, []);
        bySeg.get(k).push(v);
      }
    }
    for (const [k, verts] of bySeg) {
      const sub = gather(m.positions, verts);
      if (k === forearm) support.push(sub); else push(SEGMENTS[k], sub);
    }
  });
  const boxes = segmentBoxes(rig, lists);
  if (support.length) boxes.set(FOREARM_SUPPORT_KEY, segmentBoxes(rig, new Map([['forearm', support]])).get('forearm'));
  return boxes;
}

/**
 * Turn loaded inputs into everything the scene and simulation need (pure; no THREE).
 * Real mode: assets from loadAssets; bones keep rest mm geometry, muscles get skin weights, FJ1801 is split into the
 * representative arm band (focus) and glass. Placeholder mode: constructed capsules and the constructed strip.
 * @returns {{ placeholder, label, rig, boxes, bones, muscles, strip: { focus, markers }, glass, unmapped, notes }}
 */
export function prepareSceneData({ binding, assets = null, placeholder = false } = {}) {
  if (!binding || !(binding.actions instanceof Map) || !binding.muscles) fail('app_args', 'binding from bindMovementMap is required');
  if (placeholder === true) {
    const arm = buildPlaceholderArm();
    const rig = deriveRig(arm.bones, { ...arm.rigOptions, palmarSource: 'palm_plane' });
    const bones = [];
    for (const [segment, list] of arm.meshes) {
      for (const m of list) bones.push({ id: null, name: m.label, segment, positions: m.positions, indices: m.indices });
    }
    const brain = buildPlaceholderBrain();
    const strip = prepareStrip(brain.strip);
    const glass = brain.glass.map(g => ({ id: null, name: g.label, positions: g.positions, indices: g.indices }));
    if (strip.glass.faceCount > 0) glass.push({ id: null, name: `${PLACEHOLDER_LABEL}: strip outside the arm band`, positions: strip.glass.positions, indices: strip.glass.indices });
    return {
      placeholder: true,
      label: PLACEHOLDER_LABEL,
      rig,
      boxes: segmentBoxes(rig, arm.bones),
      bones,
      muscles: [],
      strip: { focus: strip.focus, markers: strip.markers },
      glass,
      unmapped: [],
      notes: [...arm.notes, ...brain.notes]
    };
  }
  if (!assets || !(assets.arm instanceof Map) || !(assets.brain instanceof Map)) fail('app_args', 'assets from loadAssets are required');
  const { boneMeshes, metacarpals } = boneInputs(assets.arm);
  const dirs = compartmentDirections(assets.arm);
  // Palm-plane palmar direction (signed by the flexor compartment) so digits and wrist flex toward the palm.
  const rig = deriveRig(boneMeshes, { palmar: dirs.palmar, anteriorUpper: dirs.anteriorUpper, metacarpals, palmarSource: 'palm_plane' });
  const bones = [], muscles = [], unmapped = [];
  for (const [id, rec] of assets.arm) {
    const role = SEGMENT_OF[id];
    if (!role) fail('app_asset', `${id} has no view-model role`);
    const { positions, indices } = rec.mesh;
    if (role.kind === 'bone') {
      bones.push({ id, name: role.name, segment: role.segment, positions, indices });
      continue;
    }
    const key = hasOwn(MUSCLE_OF, id) ? MUSCLE_OF[id] : null;
    if (key !== null && !hasOwn(binding.muscles, key)) fail('app_asset', `${id} maps to ${key}, which is not a movement-map muscle_catalog key`);
    muscles.push({ id, name: role.name, muscleKey: key, positions, indices, weights: skinWeights(rig, positions) });
    if (key === null) unmapped.push({ id, name: role.name });
  }
  const right = assets.brain.get(BRAIN.rightPrecentral);
  if (!right) fail('app_asset', `${BRAIN.rightPrecentral} (right precentral gyrus) is required`);
  const strip = prepareStrip(right.mesh);
  const glass = [];
  for (const [id, rec] of assets.brain) {
    if (id === BRAIN.rightPrecentral) {
      if (strip.glass.faceCount > 0) glass.push({ id, name: 'Right precentral gyrus outside the representative arm band', positions: strip.glass.positions, indices: strip.glass.indices });
    } else {
      const name = typeof rec.entry.embedded_source_name === 'string' ? rec.entry.embedded_source_name : id;
      glass.push({ id, name, positions: rec.mesh.positions, indices: rec.mesh.indices });
    }
  }
  return {
    placeholder: false,
    label: null,
    rig,
    boxes: fitBoxes(rig, boneMeshes, muscles),
    bones,
    muscles,
    strip: { focus: strip.focus, markers: strip.markers },
    glass,
    unmapped,
    notes: [dirs.approximation, ...rig.flags]
  };
}

/**
 * Region-mode brain data (round 2, pure): both hemispheres' motor strips from the loaded brain assets (ns-brain
 * motorStripDescriptors: FJ1801 right, FJ1800 left, plus any paracentral / extra precentral meshes) segmented into
 * BODY_MOTOR_MAP regions (segmentMotorStrips, with every other brain mesh as the glass grid), and the whole brain's
 * source bounds for frameBrain. Never throws: without a valid body map, ns-brain support, both hemispheres or on a
 * segmentation error it returns { segmentation: null, reason } and the game stays in legacy mode.
 * @returns {{ segmentation: object | null, brainBounds: { min, max } | null, reason: string | null }}
 */
export function prepareBrainSegmentation({ assets = null, bodyMap = null, brainModule = NsBrain } = {}) {
  const map = bodyMapOf(bodyMap);
  const none = reason => ({ segmentation: null, brainBounds: null, reason });
  if (!map) return none('no BODY_MOTOR_MAP (ns-bodymap) loaded');
  if (!assets || !(assets.brain instanceof Map)) return none('no brain assets (placeholder mode)');
  if (!brainModule || typeof brainModule.segmentMotorStrips !== 'function' || typeof brainModule.motorStripDescriptors !== 'function') {
    return none('ns-brain has no segmentMotorStrips / motorStripDescriptors');
  }
  try {
    const meshes = [...assets.brain].map(([id, rec]) => ({
      id, name: rec.entry && typeof rec.entry.embedded_source_name === 'string' ? rec.entry.embedded_source_name : id,
      positions: rec.mesh.positions, indices: rec.mesh.indices
    }));
    const strips = brainModule.motorStripDescriptors(meshes);
    if (!strips.some(d => d.hemisphere === 'right') || !strips.some(d => d.hemisphere === 'left')) return none('both hemispheres’ motor strips are needed');
    const stripIds = new Set(strips.map(d => d.id));
    const glassMeshes = meshes.filter(m => !stripIds.has(m.id)).map(m => ({ positions: m.positions, indices: m.indices }));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const m of meshes) {
      const p = m.positions;
      for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < min[k]) min[k] = p[i + k]; if (p[i + k] > max[k]) max[k] = p[i + k]; }
    }
    const segmentation = brainModule.segmentMotorStrips(strips, map, { glassMeshes });
    return { segmentation, brainBounds: min.every(Number.isFinite) ? { min, max } : null, reason: null };
  } catch (err) {
    return none(`segmentation failed: ${errorText(err)}`);
  }
}

/** World positions (metres) for the R/L and anterior/posterior labels around the framed band for this aspect
 * (ns-brain orientationAnchorsForBand: anterior above, posterior below, R right of the band, L left of it above the
 * default hand). */
export function orientationAnchors(strip, placement, aspect, fovYDeg = FOV_Y_DEG) {
  return orientationAnchorsForBand(strip.focus, placement, { fovYDeg, aspect });
}

/** Camera yaw/pitch (rad) whose centre ray points at a world point (camera at the origin). */
/** Orientation label candidates for the giant brain (pure): each anchor ('right', 'left', 'anterior', 'posterior',
 * world points just outside the motor strips) plus versions pulled toward their common centre ('anterior.1' ...), so
 * the HUD can use the first one that is on screen and clear when the strips overflow the view. */
export function orientationCandidates(anchors, factors = [1, 0.86, 0.74, 0.62], sideSlides = ORIENTATION_SIDE_SLIDES) {
  const keys = Object.keys(anchors || {}).filter(k => Array.isArray(anchors[k]) || ArrayBuffer.isView(anchors[k]));
  if (!keys.length) return {};
  const c = [0, 1, 2].map(i => keys.reduce((s, k) => s + anchors[k][i], 0) / keys.length);
  const out = {};
  // R4-polish (labels never inside the brain): a side label ("Your left" / "Your right") whose first place is taken
  // (the arm, an arrow) first slides along the brain's side toward the front or the back, at the same sideways
  // distance. The outline narrows toward both ends, so these places stay OUTSIDE the glass; only then does the label
  // move inward (the old fallback put "← Your left" in the middle of the left half, next to "Right arm").
  const ant = anchors.anterior, axis = ant ? [0, 1, 2].map(j => ant[j] - c[j]) : null;
  for (const k of keys) {
    const list = [];
    list.push(c.map((v, j) => v + (anchors[k][j] - v) * factors[0]));
    if (axis && (k === 'right' || k === 'left')) for (const s of sideSlides) list.push(anchors[k].map((v, j) => v + axis[j] * s));
    factors.slice(1).forEach(f => list.push(c.map((v, j) => v + (anchors[k][j] - v) * f)));
    list.forEach((p, i) => { out[i ? `${k}.${i}` : k] = p; });
  }
  return out;
}
/** R4-polish: where a side orientation label may slide along the brain's side (fractions of the centre-to-front
 * distance; + toward the front, - toward the back), tried in this order before the inward fallbacks. Display choice. */
export const ORIENTATION_SIDE_SLIDES = Object.freeze([0.45, -0.45, 0.65, -0.65]);

export function gazeAnglesToward(point) {
  const l = Math.hypot(point[0], point[1], point[2]);
  if (!(l > 0)) fail('app_input', 'point must differ from the camera position');
  return { yaw: Math.atan2(-point[0] / l, -point[2] / l), pitch: Math.asin(clamp(point[1] / l, -1, 1)) };
}

/* ------------------------------------------------------------------ activity gate (addendum) */

function cancelPulse(s) {
  const old = s.pulseAction;
  const targets = { ...s.targets };
  if (old !== null && !(old === 'grasp_close' && s.spaceHeld)) targets[old] = 0;
  return { ...s, pulseAction: null, pulseRemaining: 0, targets };
}

/**
 * Step ns-actions activity with the DESIGN-ADDENDUM-SPACE-PULSE gate on ACTUAL elapsed time. Events are applied in
 * time order at their own offset `at` (seconds into the frame, default 0); the activity is integrated exactly between
 * them (dt = actual elapsed wall seconds), each non-reach event is applied on its own (dt 0) so the gate sees it in
 * order, and the display-only reach events accompany every integration piece.
 *   rule 2: while Space is held a pulse for a SPACE_COMPETING action is cancelled at once;
 *   rule 4: on Space up a DIGIT_FLEX_PULSES pulse is cancelled, so only fresh gaze/click intent recloses the hand;
 *   rule 5: every click or new-region pulse start that survives the gate is returned as a mark (with its offset).
 * @returns {{ state, marks: Array<{ actionId, source: 'click' | 'gaze', at }>, restarts: number }}
 */
export function stepActivityGated(activity, actState, events, dt) {
  const wall = Number.isFinite(dt) && dt > 0 ? dt : 0;
  let s = actState;
  const reach = [];
  const timed = [];
  events.forEach((ev, i) => {
    if (ev && ev.type === 'reach') reach.push({ type: 'reach', elbowRate: ev.elbowRate });
    else timed.push({ ev, i, at: eventOffset(ev, wall) });
  });
  timed.sort((a, b) => a.at - b.at || a.i - b.i);
  const marks = [];
  let restarts = 0, cursor = 0;
  for (const { ev, at } of timed) {
    if (at > cursor) { s = activity.step(s, reach, at - cursor); cursor = at; }
    const bare = { ...ev };
    delete bare.at;
    delete bare.timeMs;
    const before = s;
    s = activity.step(s, [bare], 0);
    if (s.spaceHeld && s.pulseAction !== null && SPACE_COMPETING.includes(s.pulseAction)) s = cancelPulse(s);
    if (ev.type === 'space' && before.spaceHeld && !s.spaceHeld && s.pulseAction !== null && DIGIT_FLEX_PULSES.includes(s.pulseAction)) {
      s = cancelPulse(s);
    }
    let started = null, source = null;
    if (ev.type === 'click' && before.gazeAction !== null) { started = before.gazeAction; source = 'click'; }
    else if (ev.type === 'gaze' && ev.actionId !== null && ev.actionId !== undefined) {
      if (ev.actionId !== before.gazeAction) { started = ev.actionId; source = 'gaze'; }
      else if (ev.moved === true) { started = ev.actionId; source = 'moved'; }
    }
    if (started !== null && s.pulseAction === started && s.pulseRemaining > 0) {
      if (source === 'moved') restarts++;
      else marks.push({ actionId: started, source, at });
    }
  }
  s = activity.step(s, reach, wall - cursor);
  return { state: s, marks, restarts };
}

/**
 * Silent gaze seeding (round-1 A4, no auto-pulse): record `actionId` as the activity's current gaze region WITHOUT
 * starting a pulse, so the following gaze event for the same region is 'not new' and starts nothing. Used on the
 * first frame and on every reframe/resize while the look did not change (nothing the user did). Prefers an
 * `activity.seedGaze(state, actionId)` helper when ns-actions provides one; otherwise sets the R5 activity state's
 * `gazeAction` field on a copy. Never mutates `actState`.
 */
export function seedActivityGaze(activity, actState, actionId) {
  if (activity && typeof activity.seedGaze === 'function') return activity.seedGaze(actState, actionId);
  if (!actState || typeof actState !== 'object' || !hasOwn(actState, 'gazeAction')) return actState;
  const id = actionId === undefined ? null : actionId;
  return actState.gazeAction === id ? actState : { ...actState, gazeAction: id };
}

/**
 * Browser-loop timing (pure; used by start() and tests): the actual elapsed wall seconds since the previous frame and
 * each input's offset `at` into this frame interval from its own monotonic time (performance timeline, ms). Inputs
 * without a usable time, and the gaze when the view did not move, are placed at the end of the interval. The first
 * frame (lastMs null) has dt 0.
 * @returns {{ dt: number, events: object[], gazeAt: number }}
 */
export function frameTiming(lastMs, nowMs, events = [], lookMs = null) {
  const known = lastMs !== null && Number.isFinite(lastMs) && Number.isFinite(nowMs);
  const dt = known ? Math.max(0, (nowMs - lastMs) / 1000) : 0;
  const offsetOf = timeMs => (known && Number.isFinite(timeMs) ? clamp((timeMs - lastMs) / 1000, 0, dt) : dt);
  return {
    dt,
    events: events.map(ev => ({ ...ev, at: offsetOf(ev.timeMs) })),
    gazeAt: known && Number.isFinite(lookMs) && lookMs > lastMs ? offsetOf(lookMs) : dt
  };
}

/* ------------------------------------------------------------------ round-2 pure helpers (U4-app) */

/**
 * Load the optional round-2 sibling modules (OPTIONAL_MODULES: ns-colors, ns-bodymap, ns-body) when they exist. Never
 * throws: a missing or failing module is null and its error text is in `errors`. `importer(url)` defaults to import().
 * @returns {Promise<{ colors, bodyMap, body, errors: { [name: string]: string } }>}
 */
export async function loadOptionalModules(importer = url => import(url), { base = import.meta.url } = {}) {
  const out = { colors: null, bodyMap: null, body: null, errors: {} };
  await Promise.all(Object.entries(OPTIONAL_MODULES).map(async ([name, spec]) => {
    try {
      out[name] = await importer(new URL(spec, base).href);
    } catch (err) {
      out.errors[name] = errorText(err);
    }
  }));
  return out;
}

/** BODY_MOTOR_MAP from an ns-bodymap module (or the map itself); null unless it has a regions array. */
export function bodyMapOf(mod) {
  const m = mod && typeof mod === 'object' && mod.BODY_MOTOR_MAP ? mod.BODY_MOTOR_MAP : mod;
  return m && typeof m === 'object' && Array.isArray(m.regions) ? m : null;
}

/** The BODY_MOTOR_MAP region with this id, or null. */
export function regionById(bodyMap, id) {
  if (!bodyMap || typeof id !== 'string') return null;
  return bodyMap.regions.find(r => r && r.id === id) || null;
}

/** The left-arm region serving an existing left-arm action id (preferring one whose extent contains u), or null. */
export function leftArmRegionFor(bodyMap, actionId, u = null) {
  if (!bodyMap || typeof actionId !== 'string') return null;
  const hits = bodyMap.regions.filter(r => r && r.isLeftArm === true && Array.isArray(r.actions) && r.actions.some(a => a && a.armActionId === actionId));
  if (Number.isFinite(u)) {
    const inside = hits.find(r => Array.isArray(r.extent) && u >= r.extent[0] && u <= r.extent[1]);
    if (inside) return inside;
  }
  return hits[0] || null;
}

const EMPTY_GAZE = Object.freeze({ kind: 'empty', target: 'empty', regionId: null, hemisphere: null, isLeftArm: false, actionId: null, u: null, point: null });

/**
 * Normalise a classifier result to { kind, target: 'region' | 'glass' | 'empty', regionId, hemisphere, isLeftArm,
 * actionId, u, point }. kind is kept as given: 'strip' (current ns-brain: the right-hemisphere left-arm band, so
 * isLeftArm and hemisphere 'right' unless stated) or 'region' (round-2 ns-brain, both hemispheres). actionId is kept
 * only for a left-arm region and only when it is a current ns-actions ACTION_IDS entry (the activity model refuses
 * others); a non-left-arm region therefore drives the activity through regionId alone. With a body map, a legacy strip
 * hit is given the left-arm regionId that serves its action.
 */
export function normalizeGaze(g, bodyMap = null) {
  if (!g || typeof g !== 'object') return EMPTY_GAZE;
  const pt = g.point;
  const point = pt && (Array.isArray(pt) || ArrayBuffer.isView(pt)) && pt.length >= 3 ? [pt[0], pt[1], pt[2]] : null;
  const u = Number.isFinite(g.u) ? g.u : null;
  const validAction = typeof g.actionId === 'string' && ACTION_IDS.includes(g.actionId) ? g.actionId : null;
  if (g.kind === 'strip' || g.kind === 'region') {
    const legacy = g.kind === 'strip';
    let region = typeof g.regionId === 'string' ? regionById(bodyMap, g.regionId) : null;
    const isLeftArm = typeof g.isLeftArm === 'boolean' ? g.isLeftArm : region ? region.isLeftArm === true : legacy;
    const actionId = isLeftArm ? validAction : null;
    if (legacy && actionId === null) return EMPTY_GAZE;
    let regionId = typeof g.regionId === 'string' ? g.regionId : null;
    if (regionId === null && legacy && bodyMap) {
      region = leftArmRegionFor(bodyMap, actionId, u);
      regionId = region ? region.id : null;
    }
    if (regionId === null && actionId === null) return EMPTY_GAZE;
    const hemisphere = typeof g.hemisphere === 'string' ? g.hemisphere : region && typeof region.hemisphere === 'string' ? region.hemisphere : isLeftArm ? 'right' : null;
    return { kind: g.kind, target: 'region', regionId, hemisphere, isLeftArm, actionId, u, point };
  }
  if (g.kind === 'glass') return { ...EMPTY_GAZE, kind: 'glass', target: 'glass', point, hemisphere: typeof g.hemisphere === 'string' ? g.hemisphere : null };
  return EMPTY_GAZE;
}

/** True when the crosshair is on any part of the brain (a motor region or the glass): Space then grabs the brain. */
export const gazeOnBrain = g => Boolean(g) && (g.target === 'region' || g.target === 'glass' || g.kind === 'strip');

/** Initial brain view: orbit around the locked brain centre (DEGREES, as ns-brain brainViewTransform takes it) and the
 * persistent grab carry offset (RADIANS, camera yaw/pitch convention, as ns-brain carryFromGrab returns it). */
export function initialBrainView() {
  return {
    orbit: { yaw: 0, pitch: 0 },
    offset: { yaw: 0, pitch: 0 },
    grab: { active: false, startYaw: null, startPitch: null, baseYaw: 0, basePitch: 0 },
    source: { orbit: 'fallback', grab: 'fallback' }
  };
}

/**
 * FALLBACK orbit step (used only while neither ns-actions orbitStep nor ns-brain orbitStepView exists; same convention
 * as orbitStepView): 'right' / 'left' move the viewpoint toward screen right / left (subject right / left), 'forward' /
 * 'back' toward the front (anterior) / back, by stepDeg, clamped. The brain centre stays locked and the player does
 * not move. Returns { yaw, pitch } in DEGREES.
 */
export function orbitStepFallback(orbit, dir, opts = ORBIT_FALLBACK) {
  if (!ORBIT_DIRS.includes(dir)) fail('app_input', `orbit direction must be one of ${ORBIT_DIRS.join(', ')}`);
  const o = orbit && Number.isFinite(orbit.yaw) && Number.isFinite(orbit.pitch) ? orbit : { yaw: 0, pitch: 0 };
  const dy = dir === 'right' ? opts.stepDeg : dir === 'left' ? -opts.stepDeg : 0;
  const dp = dir === 'forward' ? opts.stepDeg : dir === 'back' ? -opts.stepDeg : 0;
  return { yaw: clamp(o.yaw + dy, -opts.maxYawDeg, opts.maxYawDeg), pitch: clamp(o.pitch + dp, -opts.maxPitchDeg, opts.maxPitchDeg) };
}

/** The orbit step in use: ns-brain orbitStepView when it exists, else orbitStepFallback (both in degrees). */
const orbitStepAny = (orbit, dir, stepDeg = null) => {
  if (!ORBIT_DIRS.includes(dir)) fail('app_input', `orbit direction must be one of ${ORBIT_DIRS.join(', ')}`);
  const small = Number.isFinite(stepDeg) && stepDeg > 0;
  if (typeof NsBrain.orbitStepView === 'function') return small ? NsBrain.orbitStepView(orbit, dir, { orbitStepDeg: stepDeg }) : NsBrain.orbitStepView(orbit, dir);
  return orbitStepFallback(orbit, dir, small ? { ...ORBIT_FALLBACK, stepDeg } : ORBIT_FALLBACK);
};

/* Round-2 fix F4 (R16 "clicking or clicking and holding the arrows"): a click is one full orbit step; holding an arrow
 * (DOM button, or a mouse button held while the crosshair is on an arrow) keeps orbiting gently: ORBIT_HOLD.stepDeg
 * every everyMs after delayMs, within the same limits (ns-scene-three ORBIT_HOLD, re-exported here). */
export { ORBIT_HOLD };

/** An orbit request: 'left' | 'right' | 'forward' | 'back', or { dir, stepDeg } (a held-arrow step). Returns
 * { dir, stepDeg } (stepDeg null = the model's full step) or null when invalid. */
export function orbitRequest(r) {
  if (ORBIT_DIRS.includes(r)) return { dir: r, stepDeg: null };
  if (r && typeof r === 'object' && ORBIT_DIRS.includes(r.dir)) {
    return { dir: r.dir, stepDeg: Number.isFinite(r.stepDeg) && r.stepDeg > 0 ? r.stepDeg : null };
  }
  return null;
}

/** Steps owed by a held arrow at `now` (ms): { steps, hold } with hold = { dir, since, last } (pure). */
export function orbitHoldSteps(hold, now, o = ORBIT_HOLD) {
  if (!hold || !Number.isFinite(now) || !Number.isFinite(hold.since) || now - hold.since < o.delayMs) return { steps: 0, hold };
  const from = Number.isFinite(hold.last) ? hold.last : hold.since + o.delayMs - o.everyMs;
  const n = Math.min(o.maxStepsPerFrame, Math.max(0, Math.floor((now - from) / o.everyMs)));
  if (n === 0) return { steps: 0, hold };
  // Never bank more than maxStepsPerFrame (a slow frame does not jump the orbit).
  const last = n === o.maxStepsPerFrame ? now : from + n * o.everyMs;
  return { steps: n, hold: { ...hold, last } };
}

/**
 * Orbit sign between the activity's orbit state and ns-brain's view convention (yaw > 0 = viewpoint toward screen
 * right, pitch > 0 = toward the front), found by probing both modules' own 'right' / 'forward' steps. Integration
 * round 2: ns-actions stepOrbit and ns-brain orbitStepView now share ONE convention ('right' = yaw +15, 'forward' =
 * pitch +15), so this resolves to { yaw: 1, pitch: 1 } (a unit test checks it); the probe stays as a guard against a
 * future divergence (it would negate instead of silently mirroring the orbit). +1 when either probe is missing. The
 * brain view kept here (and reported) is always in the ns-brain convention.
 */
export function orbitSignFor(actionsModule = NsActions, brainModule = NsBrain) {
  const probe = (fn, dir, key) => {
    if (typeof fn !== 'function') return 0;
    try { const r = fn({ yaw: 0, pitch: 0 }, dir); return Math.sign(r && r[key]); } catch { return 0; }
  };
  const ay = probe(actionsModule && actionsModule.stepOrbit, 'right', 'yaw'), by = probe(brainModule && brainModule.orbitStepView, 'right', 'yaw');
  const ap = probe(actionsModule && actionsModule.stepOrbit, 'forward', 'pitch'), bp = probe(brainModule && brainModule.orbitStepView, 'forward', 'pitch');
  return { yaw: ay !== 0 && by !== 0 && ay !== by ? -1 : 1, pitch: ap !== 0 && bp !== 0 && ap !== bp ? -1 : 1 };
}
const ORBIT_SIGN = orbitSignFor();

const GRAB_PITCH_LIMIT = 75 * DEG; // ns-brain BRAIN_VIEW.grabPitchLimitDeg

/** Grab carry (radians): ns-brain carryFromGrab when it exists, else the same rule here. */
function carryAny(g, yaw, pitch) {
  if (typeof NsBrain.carryFromGrab === 'function') {
    const c = NsBrain.carryFromGrab({ baseYaw: g.baseYaw, basePitch: g.basePitch, startYaw: g.startYaw, startPitch: g.startPitch, yaw, pitch });
    return { yaw: c.grabYaw, pitch: c.grabPitch };
  }
  return { yaw: g.baseYaw + (yaw - g.startYaw), pitch: clamp(g.basePitch + (pitch - g.startPitch), -GRAB_PITCH_LIMIT, GRAB_PITCH_LIMIT) };
}

/**
 * Next brain view (pure). Orbit: the activity model's `orbit` (degrees, converted to the ns-brain sign convention with
 * `sign`, see orbitSignFor) when it has one, else the fallback steps for `orbitDirs`. Grab: the activity model's
 * `brainGrab` { active, startYaw, startPitch } and its carry `brainPlacement` { yaw, pitch } (radians) when it has
 * them (shared interface 4; ns-actions computes the carry from the absolute look in its gaze events), else the
 * FALLBACK rule (Space down while the crosshair is on the brain grabs; Space up releases; while grabbed the offset
 * follows the look, so the brain keeps its place in the view; on release it stays where it was left).
 */
export function nextBrainView(prev, { yaw, pitch, onBrain = false, spaceEvents = [], orbitDirs = [], act = null, sign = ORBIT_SIGN } = {}) {
  const v = prev || initialBrainView();
  const source = { ...v.source };
  let orbit = v.orbit;
  if (act && act.orbit && Number.isFinite(act.orbit.yaw) && Number.isFinite(act.orbit.pitch)) {
    orbit = { yaw: act.orbit.yaw * sign.yaw + 0, pitch: act.orbit.pitch * sign.pitch + 0 };
    source.orbit = 'activity';
  } else {
    for (const r of orbitDirs) { const q = orbitRequest(r); if (q) orbit = orbitStepAny(orbit, q.dir, q.stepDeg); }
    source.orbit = 'fallback';
  }
  let grab = v.grab;
  const begin = (sy, sp) => ({ active: true, startYaw: Number.isFinite(sy) ? sy : yaw, startPitch: Number.isFinite(sp) ? sp : pitch, baseYaw: v.offset.yaw, basePitch: v.offset.pitch });
  if (act && act.brainGrab && typeof act.brainGrab === 'object') {
    source.grab = 'activity';
    const g = act.brainGrab;
    if (g.active === true && !grab.active) grab = begin(g.startYaw, g.startPitch);
    else if (g.active !== true && grab.active) grab = { ...grab, active: false };
  } else {
    source.grab = 'fallback';
    for (const ev of spaceEvents) {
      if (!ev || ev.type !== 'space') continue;
      if (ev.down === true && !grab.active && onBrain) grab = begin(yaw, pitch);
      else if (ev.down === false && grab.active) grab = { ...grab, active: false };
    }
  }
  let offset = v.offset;
  const placed = act && (act.brainPlacement || act.brainOffset);
  if (placed && Number.isFinite(placed.yaw) && Number.isFinite(placed.pitch)) {
    offset = { yaw: placed.yaw, pitch: placed.pitch };
    if (act.brainGrab && typeof act.brainGrab === 'object') grab = { ...grab, active: act.brainGrab.active === true };
  } else if (grab.active || v.grab.active) {
    offset = carryAny(grab.active ? grab : v.grab, yaw, pitch);
  }
  return { orbit, offset, grab, source };
}

/**
 * Brain view transform for the scene: ns-brain brainViewTransform({ frame, orbitYaw, orbitPitch (deg), grabYaw,
 * grabPitch (rad) }) when it exists AND a frameBrain result is given (region mode), else null (legacy mode: the brain
 * stays where frameFocus placed it). `params` (with the units) is always returned.
 */
export function brainTransformFor(view, frame = null, brainModule = NsBrain) {
  const params = { orbitYaw: view.orbit.yaw, orbitPitch: view.orbit.pitch, grabYaw: view.offset.yaw, grabPitch: view.offset.pitch, orbitUnits: 'deg', grabUnits: 'rad' };
  const fn = brainModule && typeof brainModule.brainViewTransform === 'function' ? brainModule.brainViewTransform : null;
  const ok = fn && frame && frame.kind === 'ns-brain-frame';
  return { params, transform: ok ? fn({ frame, orbitYaw: params.orbitYaw, orbitPitch: params.orbitPitch, grabYaw: params.grabYaw, grabPitch: params.grabPitch }) : null };
}

/** FALLBACK pronation/supination (used only while ns-actions has no rotationState): two Space presses within
 * DOUBLE_TAP_S flip the forearm. state = { rotation, lastDownT, flips }; t0 = the frame start (s, wall clock). */
export function stepRotationFallback(prev, events, t0) {
  const p = prev || { rotation: 'pronated', lastDownT: null, flips: 0 };
  const downs = (events || []).filter(e => e && e.type === 'space' && e.down === true)
    .map(e => t0 + (Number.isFinite(e.at) ? e.at : 0)).sort((a, b) => a - b);
  if (downs.length === 0) return p;
  let { rotation, lastDownT, flips } = p;
  for (const t of downs) {
    if (lastDownT !== null && t - lastDownT <= DOUBLE_TAP_S + 1e-9) {
      rotation = rotation === 'pronated' ? 'supinated' : 'pronated';
      flips += 1;
      lastDownT = null;
    } else {
      lastDownT = t;
    }
  }
  return { rotation, lastDownT, flips };
}

/** FALLBACK activation marks per left-arm action id (pulse starts: new region, click and look restarts), persistent
 * until Reset body. Returns the same object when nothing started. */
export function countActivations(prev, marks = [], restarts = 0, gazeActionId = null) {
  const add = [];
  for (const m of marks) if (m && typeof m.actionId === 'string') add.push(m.actionId);
  if (restarts > 0 && typeof gazeActionId === 'string') for (let i = 0; i < restarts; i++) add.push(gazeActionId);
  if (add.length === 0) return prev || {};
  const next = { ...(prev || {}) };
  for (const id of add) next[id] = (next[id] || 0) + 1;
  return next;
}

/** Text of the far-right information overlay (R14). Pathway and mechanism statements are textbook-level and hedged;
 * the body map's own explanation and citations (ns-bodymap, owner S1) take precedence when present. */
export const INFO_TEXT = NT.INFO;

const muscleNames = (binding, keys) => (Array.isArray(keys) ? keys : []).map(k => {
  const e = binding && binding.muscles ? binding.muscles[k] : null;
  return e && typeof e.name === 'string' ? `${e.name} (${k})` : String(k);
});
const uniq = list => [...new Set(list.filter(x => typeof x === 'string' && x !== ''))];

/**
 * The ONE action of a body-map region the info overlay explains (round-2 fix SCI-1 / F5): the action the activity is
 * actually pulsing in this region, else the gaze's action id (region action id or arm action id), else the same
 * position rule as ns-actions pickRegionAction (the strip position u inside the region's extent), else the first
 * action. Null for a region without actions.
 */
export function infoRegionAction(region, { actionId = null, u = null, pulse = null } = {}) {
  const acts = region && Array.isArray(region.actions) ? region.actions.filter(a => a && typeof a === 'object') : [];
  if (!acts.length) return null;
  const byId = id => (typeof id === 'string' ? acts.find(a => a.id === id || a.armActionId === id) || null : null);
  if (pulse && pulse.regionId === region.id) { const p = byId(pulse.actionId); if (p) return p; }
  const g = byId(actionId);
  if (g) return g;
  const ex = region.extent;
  if (Number.isFinite(u) && Array.isArray(ex) && ex[1] > ex[0]) {
    const f = (u - ex[0]) / (ex[1] - ex[0]);
    return acts[clamp(Math.floor(f * acts.length), 0, acts.length - 1)];
  }
  return acts[0];
}

/** Plain-language pathway line for a body-map region (round-2 fixes SCI-3, SCI-5, F6): built from the region's own
 * pathway and laterality fields; technical names only in brackets. */
export function infoPathway(region, leftArm = false) {
  return NT.plainPathway(region, leftArm);
}

/** One plain sentence that leads the info card (round-2 fix F6, R17). */
export function infoPlainLead(region, leftArm = false) {
  return NT.plainLead(region, leftArm);
}

/** Short "Known:" line for a body-map region: the laterality it rests on, in plain words. */
export function infoKnown(region, leftArm = false) {
  return NT.plainKnown(region, leftArm);
}

/**
 * Model of the far-right information overlay (R14) for what the player looks at or clicks: region, hemisphere, body
 * part, the ONE simulated action and its muscles (working / easing off; never the same muscle in both), a plain lead
 * sentence, a plain pathway, simulated vs known, the region's own short caveat, the longer explanation, general caveats
 * and citations (with their verified flags). Sources, in order: the BODY_MOTOR_MAP region (ns-bodymap), else the
 * movement-map left-arm action (binding), else generic text. With the crosshair on empty space the previous model is
 * kept and marked 'last'. `pulse` = { regionId, actionId } of the activity's running pulse (ns-app stepFrame out.pulse
 * regionId / regionActionId), so the card names the action that is actually simulated.
 * Pure: plain JSON out. `key` changes only when the subject changes (the renderer re-draws text only then).
 */
export function infoOverlayModel({ gaze = null, binding = null, bodyMap = null, regionActivity = null, activatedRegions = null,
  activatedActions = null, displayDrives = null, last = null, pulse = null, rotationState = null } = {}) {
  const g = gaze && typeof gaze.target === 'string' ? gaze : normalizeGaze(gaze, bodyMap);
  const common = { heading: INFO_TEXT.heading, simulated: INFO_TEXT.simulated, known: INFO_TEXT.known, crownNote: INFO_TEXT.crownNote };
  const blank = { plain: '', regionCaveat: '', action: null };
  if (g.target === 'glass') {
    return { ...common, ...blank, key: 'glass', mode: 'glass', viewed: 'now', source: 'generic', title: INFO_TEXT.glassTitle, tag: '',
      region: null, regionId: null, actionId: null, hemisphere: g.hemisphere, bodyPart: null, agonists: [], antagonists: [],
      pathway: '', explanation: INFO_TEXT.glassBody, caveats: [...INFO_TEXT.caveats], citations: [], activity: null, activations: null };
  }
  if (g.target !== 'region') {
    if (last && last.mode === 'region') return { ...last, key: `${last.key}|last`, viewed: 'last' };
    return { ...common, ...blank, key: 'idle', mode: 'idle', viewed: 'now', source: 'generic', title: INFO_TEXT.idleTitle, tag: '',
      region: null, regionId: null, actionId: null, hemisphere: null, bodyPart: null, agonists: [], antagonists: [],
      pathway: '', explanation: INFO_TEXT.idleBody, caveats: [...INFO_TEXT.caveats], citations: [], activity: null, activations: null };
  }
  const region = regionById(bodyMap, g.regionId);
  const leftArm = region ? region.isLeftArm === true : g.isLeftArm === true;
  const integration = Boolean(region && region.kind === 'integration');
  const action = g.actionId && binding && binding.actions instanceof Map ? binding.actions.get(g.actionId) : null;
  let title, bodyPart, agonists = [], antagonists = [], explanation = '', citations = [], caveats = [...INFO_TEXT.caveats], source;
  let picked = null;
  if (region) {
    source = 'bodymap';
    // Round 3 (R17/D3): the plain name leads (ns-bodymap plainLabel); the technical label stays for More detail.
    title = NT.plainTitle(region);
    bodyPart = typeof region.effector === 'string' ? region.effector : null;
    picked = infoRegionAction(region, { actionId: g.actionId, u: g.u, pulse });
    if (picked) {
      if (Array.isArray(picked.agonists)) agonists.push(...picked.agonists);
      if (Array.isArray(picked.antagonists)) antagonists.push(...picked.antagonists);
    }
    explanation = typeof region.explanation === 'string' ? region.explanation : '';
    const known = Array.isArray(bodyMap.citations) ? bodyMap.citations : [];
    citations = (Array.isArray(region.citationKeys) ? region.citationKeys : []).map(k => {
      const c = known.find(x => x && x.key === k);
      return { key: String(k), ref: c && typeof c.doi_or_url === 'string' ? c.doi_or_url : null, verified: Boolean(c && c.verified === true) };
    });
    if (Array.isArray(bodyMap.caveats)) caveats = uniq([...bodyMap.caveats, ...caveats]);
  } else if (action) {
    source = 'movement-map';
    title = typeof action.label === 'string' ? action.label : g.actionId;
    bodyPart = 'Left arm and hand';
    agonists = muscleNames(binding, action.roles && action.roles.primary_drive_increase);
    antagonists = muscleNames(binding, action.roles && action.roles.relative_drive_reduction);
    explanation = typeof action.notes === 'string' ? action.notes : '';
  } else {
    source = 'generic';
    title = g.regionId || 'Motor area';
    bodyPart = null;
  }
  const ag = uniq(agonists);
  const an = uniq(antagonists).filter(m => !ag.includes(m)); // a muscle is never listed as working AND easing off
  const regionKey = g.regionId || g.actionId || '';
  const activity = g.regionId && regionActivity && Number.isFinite(regionActivity[g.regionId]) ? regionActivity[g.regionId]
    : g.actionId && displayDrives && Number.isFinite(displayDrives[g.actionId]) ? displayDrives[g.actionId] : null;
  const activations = g.regionId && activatedRegions && Number.isFinite(activatedRegions[g.regionId]) ? activatedRegions[g.regionId]
    : g.actionId && activatedActions && Number.isFinite(activatedActions[g.actionId]) ? activatedActions[g.actionId] : 0;
  const noAction = region && !picked && typeof region.noActionReason === 'string' ? region.noActionReason : '';
  // Round 3 (D3): the plain card (lead + at most 4 rows + short honesty lines; the technical layer in a collapsed
  // "More detail"), built by ns-text from the same region, action and numbers.
  const card = region ? NT.plainInfoCard({ region, action: picked, leftArm, activity, activations, citations, caveats: [...INFO_TEXT.caveats], rotationState }) : null;
  // R3-fix (SL-2): a forearm-turn card changes when the palm flips (its "already ... nothing moves" note).
  const rotKey = picked && (picked.armActionId === 'pronation' || picked.armActionId === 'supination') && typeof rotationState === 'string' ? `|${rotationState}` : '';
  return {
    ...common, key: `region|${regionKey}|${picked ? picked.id : g.actionId || ''}${rotKey}`, mode: 'region', viewed: 'now', source, title,
    technicalTitle: region && typeof region.label === 'string' ? region.label : title,
    tag: leftArm ? INFO_TEXT.leftArmTag : integration ? INFO_TEXT.integrationTag : INFO_TEXT.otherTag,
    region: region ? { id: region.id, label: title, bodySide: region.bodySide || null, medialSurface: region.medialSurface === true, kind: region.kind || 'effector' } : null,
    regionId: g.regionId, actionId: g.actionId, hemisphere: g.hemisphere, bodyPart,
    action: picked ? {
      id: picked.id, label: typeof picked.label === 'string' ? picked.label : picked.id, note: typeof picked.note === 'string' ? picked.note : '',
      plainLabel: typeof picked.plainLabel === 'string' ? picked.plainLabel : '',
      plainMuscles: picked.plainMuscles && typeof picked.plainMuscles === 'object' ? { pull: picked.plainMuscles.pull || '', relax: picked.plainMuscles.relax || '' } : null
    } : noAction ? { id: null, label: '', note: noAction } : null,
    agonists: ag, antagonists: an,
    plain: region ? infoPlainLead(region, leftArm) : '',
    pathway: region ? infoPathway(region, leftArm) : leftArm ? INFO_TEXT.leftArmPathway : INFO_TEXT.otherPathway,
    known: region ? infoKnown(region, leftArm) : leftArm ? infoKnown({ kind: 'effector' }, true) : INFO_TEXT.known,
    regionCaveat: region ? String(region.plainCaveat || region.caveat || '') : '',
    explanation, caveats, citations, activity, activations, card
  };
}

/* ------------------------------------------------------------------ simulation (pure) */

function frameFocus(strip, aspect, fovYDeg, frame) {
  const p = placementForBand(strip.focus, { fovYDeg, aspect, frame });
  return { k: p.k, distance: p.distance, centre: [p.centre[0], p.centre[1], p.centre[2]], limiting: p.limiting, fill: p.fill, compact: p.compact };
}

/** Next W/S/A/D base (anti wind-up) under the accepted R6 overlay. The depth base is clamped only to the anchor's
 * pose-independent reach interval: neither a pose-driven depth push (silhouette fit) nor a transient elbow action ever
 * shifts it. The horizontal anchor is fed back only for the A/D range or a viewport clamp, never for a pose. */
/** R4-fix (review RP3): the start x (NDC) of the hand on PORTRAIT screens (aspect < 1). The landscape start x -0.3 lies
 * left of the portrait A/D range (390x844: -0.156 .. +0.371, 720x1280: -0.203 .. +0.401; round4/R4-arm-NOTES.md), where
 * the hand only fits at full reach, so W, S and A moved nothing from the start pose. -0.13 is just inside both ranges
 * (S then moves the hand 6.6-7 cm, A and D move it; W is at its far limit at 390x844 and moves 1.4 cm at 720x1280;
 * harness/run-R4-fix-2-reach), and the arm still covers little of the brain (-0.05 put the forearm across the left
 * half at 720x1280, viewed run-R4-fix-6-shots). Display choice. Until the first W/A/S/D press the hand keeps the start
 * x of the current aspect. */
export const PORTRAIT_REACH_START_X = -0.13;
/** R4-fix (review RP3): a held W/A/S/D whose hand has not moved by at least xNdc (A/D) or depthM (W/S) in the key's
 * direction within `seconds` shows the plain "cannot go further" note; the guide's move goal counts the same net
 * movement (a hand held at its limit can jitter by about 0.7 mm per frame, which is not a move). Display choices. */
export const REACH_BLOCKED = Object.freeze({ seconds: 0.3, xNdc: 0.01, depthM: 0.002 });

function nextReach(base, fit, armOptions, depthKey = true) {
  const minDepth = armOptions && Number.isFinite(armOptions.minDepth) ? armOptions.minDepth : ARM_DEFAULTS.minDepth;
  const ev = fit.envelopeReach;
  // R3-fix (review M2): the W/S depth INTENT is kept like the A/D intent: an A/D sweep to a screen edge, where the hand
  // only fits at nearly full reach, no longer leaves the arm straight for good, so W reaches forward again once the
  // hand is back. While a depth key is held the intent follows the shown depth (W/S answer at once; the wind-up guard
  // is depthRangeFor).
  const depth = depthKey && ev && !ev.empty ? clamp(base.depth, ev.minDepth, ev.maxDepth) : base.depth;
  // Integration (U3a reachState): the A/D INTENT is kept when a look or pose narrows the range (the hand is clamped on
  // screen for that frame and returns when the range allows), so looking around never moves the anchor for good; the
  // wind-up guard is stepReach's xRange (the previous fit's xLimits).
  const xNdc = fit.reachState && Number.isFinite(fit.reachState.xNdc) ? fit.reachState.xNdc
    : fit.anchor === 'pose_exceeds_envelope' ? base.xNdc : fit.xNdc;
  return { xNdc: clamp(xNdc, -1, 1), depth: clamp(depth, minDepth, REACH_STATE_MAX_DEPTH) };
}

/** W/S wind-up guard range for the next frame (round-2 fix V7): the fit's depth limits, narrowed to the depth the fit
 * actually achieved when it had to clamp the request (for example at the A/D reach edge, where the whole hand cannot
 * come nearer), so holding a depth key never winds the intent past what the hand can show; the next lateral key then
 * cannot make the hand lurch. The look- and pose-preserved intent itself is not changed (only key integration is
 * bounded), and an explicit elbow target (a transient pulse) leaves the range as it was. Pure. */
export function depthRangeFor(fit, base, elbow = null) {
  const r = { minDepth: fit.depthLimits.minDepth, maxDepth: fit.depthLimits.maxDepth };
  if (elbow || !fit.clamped || !fit.clamped.depth || !base || !Number.isFinite(base.depth) || !Number.isFinite(fit.depth)) return r;
  if (fit.depth > base.depth + 1e-9) r.minDepth = Math.max(r.minDepth, fit.depth);
  else if (fit.depth < base.depth - 1e-9) r.maxDepth = Math.min(r.maxDepth, fit.depth);
  return r;
}

const copyJson = v => JSON.parse(JSON.stringify(v));

/**
 * Pure simulation core shared by start() and tests.
 * stepFrame(state, inputs, dt) with inputs = { yaw, pitch (rad), axes: { x, z }, events: [{ type: 'space', down, at? } |
 * { type: 'click', at? }], aspect, gazeAt?, silentGaze?, orbit?: ['left' | 'right' | 'forward' | 'back'] } and dt =
 * ACTUAL elapsed wall seconds since the previous frame (uncapped; non-finite or negative = 0). `at` / `gazeAt` are each
 * input's offset (s) into this frame interval (default 0 = its start; the browser loop passes the real event times).
 * Clocks: the activity (pulse / release / smoothing) advances by the full wall dt; pose/motion integration advances by
 * min(dt, MAX_FRAME_DT). Returns { state (plain data), out } where out holds the fit (with solution.matrices), the
 * pose used, the normalised gaze, commanded and display drives, muscle drives, armReach, placement, flags, clock
 * { wallDt, poseDt }, pulse { actionId, remainingS, deadlineS, residualDisplay }, elbow, and the round-2 fields
 * (brainView, brainTransform, rotationState, regionActivity, activatedRegions, activatedActions, bodyJointTargets,
 * sources: which module provided each).
 * No auto-activation (round-1 A4): the first frame, a reframe while yaw/pitch are unchanged and a frame with an orbit
 * step seed the gaze region silently (out.silentGaze true), so no pulse starts without a look change, click or key.
 *
 * Round-2 options (all optional): bodyMap (BODY_MOTOR_MAP, for region ids and the info overlay), handYNdc (default
 * HAND_Y_NDC, passed to ns-arm as request.yNdc), classifyView(yaw, pitch, placement, { params, transform }, prevGaze)
 * -> a classifier result (overrides the built-in pickers), and segmentation (an ns-brain segmentMotorStrips result of
 * BOTH hemispheres) with optional brainBounds ({ min, max } source mm). REGION MODE (segmentation given and ns-brain
 * has frameBrain, brainViewTransform, gazeRayForView and classifyRegionGaze): the brain is framed with frameBrain on
 * every reframe (out.brainFrame), placed by brainViewTransform with the orbit and grab carry (out.brainTransform, for
 * ns-scene-three setBrainTransform), and the gaze is picked by classifyRegionGaze through that transform, so what is
 * drawn is what is picked. LEGACY MODE (otherwise): the right-strip arm band, frameFocus placement and classifyGaze.
 * The activity is stepped with the look RELATIVE to the brain offset (yaw - offset.yaw, pitch - offset.pitch), so
 * dragging a grabbed brain (whose offset follows the look) is not a gaze movement and restarts nothing.
 */
export function createSimulation({ rig, boxes, strip, binding, armOptions = {}, activityOptions = {}, frame = FRAME, fovYDeg = FOV_Y_DEG,
  minHorizontalFovDeg = MIN_HORIZONTAL_FOV_DEG, bodyMap = null, handYNdc = HAND_Y_NDC, classifyView = null, segmentation = null,
  brainBounds = null, anatomy = null, wristReach = WASD_WRIST, trunkFreeDeg = TRUNK_FREE_DEG, neckFlex = NECK_FLEX } = {}) {
  if (!rig || rig.kind !== 'ns-rig') fail('app_args', 'rig from deriveRig is required');
  if (!(boxes instanceof Map)) fail('app_args', 'boxes from segmentBoxes are required');
  if (!strip || !strip.focus || !strip.focus.positions || !strip.focus.indices || !strip.focus.u || !Array.isArray(strip.markers)) {
    fail('app_args', 'strip { focus (splitBand focus), markers (placeMarkers) } is required');
  }
  if (!binding || !(binding.actions instanceof Map)) fail('app_args', 'binding from bindMovementMap is required');
  if (classifyView !== null && typeof classifyView !== 'function') fail('app_args', 'classifyView must be a function');
  if (!(Number.isFinite(handYNdc) && Math.abs(handYNdc) < 1)) fail('app_args', 'handYNdc must be a finite NDC value in (-1, 1)');
  if (anatomy !== null && (!anatomy || anatomy.kind !== 'ns-arm-anatomy')) fail('app_args', 'anatomy must come from ns-arm armAnatomy');
  const map = bodyMapOf(bodyMap);
  const regionMode = Boolean(segmentation) && ['frameBrain', 'brainViewTransform', 'gazeRayForView', 'classifyRegionGaze']
    .every(n => typeof NsBrain[n] === 'function');
  // The game shell (ns-app) owns the 2 s intro and the Esc page: the activity's own intro is off unless explicitly
  // requested, and the shell forwards its pause/resume (setPaused), so there is ONE instructions/pause state.
  const activity = createActivity(activityOptions && hasOwn(activityOptions, 'introSeconds') ? activityOptions
    : { ...(activityOptions || {}), introSeconds: 0 });
  const initialActivity = copyJson(activity.state);
  const movedRad = GAZE_MOVED_DEG * DEG;
  const elbowMaxRad = ELBOW_MAX_DEG * DEG;
  /** Effective vertical FOV for an aspect (narrow-layout camera); the scene camera must use the same value. */
  const fovFor = aspect => effectiveFovYDeg(aspect, { baseFovYDeg: fovYDeg, minHorizontalFovDeg });
  // Feature detection (shared interface 4): the A1 gated step, and the round-2 orbit / reset functions when present.
  const gatedStep = typeof activity.stepGated === 'function';
  const orbitFn = typeof activity.orbitStep === 'function' ? (s, d, o) => (o ? activity.orbitStep(s, d, o) : activity.orbitStep(s, d))
    : typeof NsActions.orbitStep === 'function' ? (s, d, o) => (o ? NsActions.orbitStep(s, d, o) : NsActions.orbitStep(s, d)) : null;
  const resetFn = typeof activity.resetBody === 'function' ? s => activity.resetBody(s)
    : typeof NsActions.resetBody === 'function' ? s => NsActions.resetBody(s) : null;
  const initialRotation = () => ({ rotation: 'pronated', lastDownT: null, flips: 0 });

  function initialState() {
    return {
      t: 0,           // actual elapsed wall seconds (event / expiry clock)
      poseT: 0,       // accumulated capped pose-integration seconds (motion clock)
      reach: reachStart(armOptions),
      reachTouched: false, // R4-fix (RP3): no W/A/S/D yet, so the hand keeps the start x of the current aspect
      reachBlockedS: 0,    // R4-fix (RP3): how long a held W/A/S/D has moved nothing (s)
      reachHold: null,     // R4-fix (RP3): { sig, x0, d0 } of the current W/A/S/D hold (net-movement reference)
      activity: copyJson(initialActivity),
      elbowRad: null,
      elbowRate: 0,   // last displayed elbow rate (deg per wall second); HUD/diagnostic (legacy linkage input only)
      reachRates: { depth: 0, x: 0 }, // A1: last REALISED W/S/A/D base motion (m/s, NDC/s); WASD display input
      viewport: null,
      placement: null,
      gaze: null,
      trigger: { seq: 0, at: null, actionId: null, source: null },
      fit: null,
      brainFrame: null,                  // region mode: the frameBrain result for the current viewport
      view: initialBrainView(),          // orbit + persistent grab offset (fallbacks unless the activity has them)
      rotation: initialRotation(),       // fallback pronation/supination (unless the activity has rotationState)
      pron: pronationStart('pronated'),  // eased forearm angle (ns-arm stepPronation) used with the fallback rotation
      activated: {}                      // fallback activation marks per left-arm action id (until Reset body)
    };
  }

  function classify(prev, yaw, pitch, placement, reframed, viewKey, brain) {
    if (prev && !reframed && prev.yaw === yaw && prev.pitch === pitch && prev.viewKey === viewKey) {
      return { ...prev, moved: false };
    }
    const moved = Boolean(prev) && (Math.abs(yaw - prev.yaw) > movedRad || Math.abs(pitch - prev.pitch) > movedRad);
    let raw;
    if (classifyView) {
      raw = classifyView(yaw, pitch, placement, brain, prev);
    } else if (regionMode && brain.transform) {
      // Region mode: the camera ray through the CURRENT brain transform, against both hemispheres' segmented strips
      // (dots first, then strip triangles, then the glass grid), with region and action hysteresis.
      const ray = NsBrain.gazeRayForView(yaw, pitch, brain.transform);
      raw = NsBrain.classifyRegionGaze(ray.origin, ray.dir, segmentation, {
        activeRegionId: prev ? prev.regionId : null, activeActionId: prev ? prev.actionId : null, markers: strip.markers
      });
    } else {
      const ray = gazeRayInSource(yaw, pitch, placement);
      // Repair R3: drawn dot first (the highlighted dot at its drawn, enlarged size), else the strip hit's u-band, else
      // none. The brain view rides along for a classifier that understands it (ignored by the current one).
      raw = classifyGaze(ray.origin, ray.dir, strip.focus, strip.markers, {
        activeActionId: prev ? prev.actionId : null, activeRegionId: prev ? prev.regionId : null, brainView: brain.params, transform: brain.transform
      });
    }
    return { yaw, pitch, viewKey, ...normalizeGaze(raw, map), moved };
  }

  function stepFrame(state, inputs, dt) {
    if (!state || typeof state !== 'object' || !state.reach || !state.activity) fail('app_state', 'state must come from initialState/stepFrame');
    const { yaw, pitch, axes = { x: 0, z: 0 }, events = [], aspect, gazeAt = 0, orbit = [], brainCentreNdc = null, viewportPx = null } = inputs || {};
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) fail('app_input', 'yaw and pitch must be finite radians');
    if (!(Number.isFinite(aspect) && aspect > 0)) fail('app_input', 'aspect must be a positive finite number');
    if (!Array.isArray(events)) fail('app_input', 'events must be an array');
    for (const ev of events) {
      if (!ev || (ev.type !== 'space' && ev.type !== 'click')) fail('app_event', 'control events are { type: "space", down } or { type: "click" }');
      if (ev.at !== undefined && !(Number.isFinite(ev.at) && ev.at >= 0)) fail('app_event', 'event.at must be finite seconds >= 0 into the frame');
    }
    if (!(Number.isFinite(gazeAt) && gazeAt >= 0)) fail('app_input', 'gazeAt must be finite seconds >= 0 into the frame');
    if (!Array.isArray(orbit) || orbit.some(d => orbitRequest(d) === null)) fail('app_input', `orbit must be an array of ${ORBIT_DIRS.join(' | ')} or { dir, stepDeg }`);
    const wall = Number.isFinite(dt) && dt > 0 ? dt : 0;   // actual elapsed time: activity clocks
    const h = Math.min(wall, MAX_FRAME_DT);                // capped pose/motion integration step
    const fov = fovFor(aspect);                            // narrow-layout camera (repair R3)
    // Anatomical attachment (U3a): the left shoulder is body-fixed at its BodyParts3D position relative to the eye,
    // so looking around carries the arm through the shoulder while the hand keeps its screen position.
    const eyeShift = anatomy ? neckFlexEyeShiftMm(pitch, neckFlex) : [0, 0, 0];
    const anat = anatomy && eyeShift[1] !== 0
      ? armAnatomy(rig, { eyeBp: anatomy.eyeBp.map((v, i) => v + eyeShift[i]), source: anatomy.eyeSource }) : anatomy;
    const att = anat ? armAttachment(anat, { yaw, pitch, bodyYaw: bodyYawForLook(yaw, trunkFreeDeg || undefined) }) : null;
    const centre = Array.isArray(brainCentreNdc) && brainCentreNdc.length === 2 && brainCentreNdc.every(v => Number.isFinite(v) && Math.abs(v) < 0.9)
      ? brainCentreNdc : [0, 0];
    // Round 3 (D1): the CSS viewport size gives frameBrain the exact usable area and the arrow room in pixels.
    const px = viewportPx && viewportPx.width > 0 && viewportPx.height > 0 ? { width: viewportPx.width, height: viewportPx.height } : null;
    const pxKey = px ? `${px.width}x${px.height}` : '';
    // R4-arm: the whole hand stays out from under the far-right information column (portrait: the bottom band).
    const handLimits = px ? handViewLimitsNdc(px, infoPanelRect(px)) : null;
    const armOpts0 = att ? { ...armOptions, attachment: att } : armOptions;
    const armOpts = handLimits ? { ...armOpts0, viewLimitsNdc: handLimits } : armOpts0;

    // Framing, recomputed whenever the viewport changes.
    let placement = state.placement;
    let brainFrame = state.brainFrame || null;
    let reframed = false;
    const sameCentre = state.viewport && Array.isArray(state.viewport.brainCentreNdc)
      && state.viewport.brainCentreNdc[0] === centre[0] && state.viewport.brainCentreNdc[1] === centre[1];
    const samePx = Boolean(state.viewport) && (state.viewport.pxKey || '') === pxKey;
    if (!state.viewport || state.viewport.aspect !== aspect || state.viewport.fovYDeg !== fov || !placement || (regionMode && (!brainFrame || !sameCentre || !samePx))) {
      placement = frameFocus(strip, aspect, fov, frame);
      if (regionMode) {
        const fo = { aspect, fovYDeg: fov, centreNdc: centre };
        if (brainBounds) fo.brainBounds = brainBounds;
        if (px) {
          fo.viewportPx = px;
          const usable = brainUsableNdc(px);
          if (usable) fo.usableNdc = usable;
        }
        brainFrame = NsBrain.frameBrain(segmentation, fo);
      }
      reframed = true;
    }

    let actIn = state.activity;
    // What the activity model owns (shared interface 4): orbit (orbitStep), the brain grab and its carry, the orbit
    // arrow under the crosshair. Everything it does not own uses the labelled fallbacks here.
    const owns = {
      orbit: orbitFn !== null && actIn && typeof actIn.orbit === 'object' && actIn.orbit !== null,
      grab: Boolean(actIn && actIn.brainGrab && typeof actIn.brainGrab === 'object' && actIn.brainPlacement),
      arrow: Boolean(actIn) && hasOwn(actIn, 'gazeArrow')
    };
    // Orbit arrow under the crosshair (ns-scene-three orbitArrowAt): the activity orbits on a click itself (gaze
    // `arrow`); otherwise each click on it becomes an orbit step here and does not re-activate a motor area.
    const arrow = ORBIT_DIRS.includes(inputs && inputs.arrow) ? inputs.arrow : null;
    let evs = events;
    let orbitDirs = orbit;
    if (arrow && !owns.arrow) {
      const clicks = events.filter(ev => ev.type === 'click').length;
      if (clicks > 0) { evs = events.filter(ev => ev.type !== 'click'); orbitDirs = [...orbit, ...Array(clicks).fill(arrow)]; }
    }
    if (owns.orbit) for (const r of orbitDirs) { const q = orbitRequest(r); actIn = q.stepDeg !== null ? orbitFn(actIn, q.dir, { stepDeg: q.stepDeg }) : orbitFn(actIn, q.dir); }
    // Brain view used to PICK this frame (orbit, grab, persistent offset): the previous frame's activity carry, or the
    // fallback grab (Space down while the previous frame's crosshair, what the player saw, was on the brain).
    const view = nextBrainView(state.view, {
      yaw, pitch, onBrain: gazeOnBrain(state.gaze), spaceEvents: evs, orbitDirs: owns.orbit ? [] : orbitDirs, act: actIn
    });
    const brain = brainTransformFor(view, regionMode ? brainFrame : null);
    const viewKey = `${view.orbit.yaw}|${view.orbit.pitch}|${view.offset.yaw}|${view.offset.pitch}`;

    // Gaze: pure focus-strip / region test in source mm (camera at the world origin; the arm never occludes the ray).
    // Legacy mode only knows the arm band: a scene raycast hit on the brain (inputs.glassHit, ns-scene-three
    // raycastBrain, from the previous frame) marks an otherwise empty gaze as glass, so Space can grab the brain there.
    let gaze = classify(state.gaze, yaw, pitch, placement, reframed, viewKey, brain);
    if (gaze.target === 'empty' && inputs && inputs.glassHit === true && !regionMode) gaze = { ...gaze, kind: 'glass', target: 'glass' };
    // No activation without user input (round-1 A4): on the first frame, on a reframe (resize / DPR / FOV change) while
    // the look itself did not change, and on an orbit step, the region under the crosshair is recorded silently. A
    // reframe in the same frame as a real look change is classified normally. inputs.silentGaze === true forces it.
    const lookSame = !state.gaze || (state.gaze.yaw === yaw && state.gaze.pitch === pitch);
    const silentGaze = (inputs && inputs.silentGaze === true) || (reframed && lookSame) || orbitDirs.length > 0;
    // Look given to the activity: ABSOLUTE when it owns the grab (it computes the carry from it and records the gaze
    // silently while dragging); RELATIVE to the fallback offset otherwise (constant while the grabbed brain follows the
    // look, so a drag restarts nothing).
    const relYaw = owns.grab ? yaw : yaw - view.offset.yaw, relPitch = owns.grab ? pitch : pitch - view.offset.pitch;

    // Activity on wall time: gaze at its look time, control events at their own times, display-only reach linkage.
    // kind (ns-actions GAZE_KINDS), regionId and arrow are shared-interface fields; older models ignore them.
    const kind = gaze.target === 'region' ? (gaze.regionId !== null ? 'region' : 'strip') : gaze.target;
    const gazeEv = { type: 'gaze', kind, actionId: gaze.actionId, at: Math.min(gazeAt, wall), isLeftArm: gaze.isLeftArm };
    if (gaze.regionId !== null) { gazeEv.regionId = gaze.regionId; if (gaze.u !== null) gazeEv.u = gaze.u; }
    if (gaze.hemisphere !== null) gazeEv.hemisphere = gaze.hemisphere;
    if (owns.arrow && arrow) gazeEv.arrow = arrow;
    let act;
    if (gatedStep) {
      // A1 wiring: yaw/pitch feed the restart deadband; seed: true is the silent frame; the reach event carries KEY
      // INTENT plus the previous frame's realised base motion (display only).
      gazeEv.yaw = relYaw;
      gazeEv.pitch = relPitch;
      if (silentGaze) gazeEv.seed = true;
      const rr = state.reachRates || { depth: 0, x: 0 };
      act = activity.stepGated(actIn, [gazeEv, ...evs, { type: 'reach', axes, depthRate: rr.depth, xRate: rr.x }], wall);
    } else {
      // Legacy model (no stepGated): seed by gazeAction, per-frame 'moved' boolean and the elbow-rate linkage.
      if (silentGaze) actIn = seedActivityGaze(activity, actIn, gaze.actionId);
      gazeEv.moved = silentGaze ? false : gaze.moved;
      if (silentGaze) gazeEv.seed = true;
      act = stepActivityGated(activity, actIn, [gazeEv, ...evs,
        { type: 'reach', elbowRate: Number.isFinite(state.elbowRate) ? state.elbowRate : 0 }], wall);
    }
    let trigger = state.trigger;
    if (act.marks.length > 0) {
      const last = act.marks[act.marks.length - 1];
      trigger = { seq: state.trigger.seq + act.marks.length, at: state.t + last.at, actionId: last.actionId, source: last.source,
        regionId: typeof last.regionId === 'string' ? last.regionId : null };
    }
    const a = act.state;
    const drives = activity.drives(a);
    const display = activity.displayDrives(a);
    const muscle = muscleDrives(binding, typeof activity.muscleDisplayDrives === 'function' ? activity.muscleDisplayDrives(a) : display);
    const armReach = typeof activity.reachOutputs === 'function' ? activity.reachOutputs(a) : null;
    // R3-fix (review SL-2): the forearm-turn display level of the pronator / supinator meshes (no catalog key in the
    // movement map, so they are tinted by mesh name; the same colour ramp; display only, never a pose input).
    const rotationMuscles = typeof activity.rotationOutputs === 'function' ? activity.rotationOutputs(a).muscles : null;

    // Forearm rotation: the activity's rotationState (shared interface 4) or the double-tap fallback.
    const rotation = typeof a.rotationState === 'string' ? state.rotation : stepRotationFallback(state.rotation, evs, state.t);
    // Brain view to DRAW (and keep): after the step, so an activity-owned carry follows this frame's look (a tight
    // drag); in fallback mode it equals the picking view.
    const viewOut = owns.grab || owns.orbit ? nextBrainView(view, { yaw, pitch, act: a }) : view;
    const brainOut = viewOut === view ? brain : brainTransformFor(viewOut, regionMode ? brainFrame : null);
    const rotationState = typeof a.rotationState === 'string' ? a.rotationState : rotation.rotation;
    // Forearm rotation for the rig: the activity's eased rotation value (double-tap state and pronation/supination
    // region pulses, U1) when present, else the fallback state eased by ns-arm stepPronation (0.4 s), never an
    // instant flip.
    const pron = stepPronation(state.pron || pronationStart(rotationState), pronationTarget(rotationState), h);
    const rotationReq = a.rotation && Number.isFinite(a.rotation.value) ? { value: a.rotation.value } : pron.deg;

    // Reach and whole-hand fit with the pose composed from THIS frame's commanded drives (never the display drives).
    // request.yNdc (R10, three quarters up) and request.rotation are for ns-arm (U3a); older ns-arm ignores them.
    const pose0 = composePose(drives);
    const viewport = { aspect, fovYDeg: fov };
    const lim = state.fit && state.fit.limits ? state.fit.limits : null;
    // R4-fix (review RP3): until the first W/A/S/D press the hand sits at the start x of THIS aspect (portrait screens
    // start inside their A/D range, so every key moves the hand from the start pose).
    const keyed = Boolean(axes) && (Number(axes.x) !== 0 || Number(axes.z) !== 0);
    const reachIn = state.reachTouched === true ? state.reach : { ...state.reach, xNdc: aspect < 1 ? PORTRAIT_REACH_START_X : reachStart(armOptions).xNdc };
    const base = stepReach(reachIn, axes, h, state.reachTouched === true && lim ? { ...armOptions, ...lim } : armOptions);
    // WASD wrist coordination: the wrist moves with the reach state together with shoulder and elbow. Round 3 (R3-arm):
    // ns-arm wasdWristDeg (WASD_WRIST_SYNERGY; the sideways term follows the forearm turn); `wristReach` is the on/off
    // switch (WASD_WRIST / wristReachDeg stay exported for the round-2 tests).
    const wristDeg = wristReach ? wasdWristDeg(base, rotationReq) : 0;
    const pose = wristDeg !== 0 && pose0.joints && Number.isFinite(pose0.joints.wrist_flex)
      ? { ...pose0, joints: { ...pose0.joints, wrist_flex: pose0.joints.wrist_flex + wristDeg } } : pose0;
    const request = d => ({ xNdc: base.xNdc, yNdc: handYNdc, depth: d, joints: pose.joints, rotation: rotationReq });
    let fit = fitHand(rig, boxes, request(base.depth), viewport, armOpts);
    let elbow = null;
    if (pose.elbowDeltaDeg !== 0) {
      // Explicit signed elbow target relative to the reach solution; the hand stays on its screen ray, so the depth
      // follows; the whole-hand fit may limit the movement, which is reported (achieved vs commanded).
      const baseRad = fit.solution.elbowFlexRad;
      const wanted = baseRad + pose.elbowDeltaDeg * DEG;
      const targetRad = clamp(wanted, 0, elbowMaxRad);
      const req = depthForElbow(rig, { xNdc: fit.xNdc, yNdc: handYNdc, elbowFlexRad: targetRad, joints: pose.joints, rotation: rotationReq, aspect, fovYDeg: fov }, armOpts);
      fit = fitHand(rig, boxes, request(req.depth), viewport, armOpts);
      const actualRad = fit.solution.elbowFlexRad;
      elbow = {
        commandDeg: pose.elbowDeltaDeg,
        baseDeg: baseRad / DEG,
        targetDeg: targetRad / DEG,
        actualDeg: actualRad / DEG,
        achievedDeg: (actualRad - baseRad) / DEG,
        limited: Math.abs(actualRad - wanted) / DEG > ELBOW_LIMIT_TOL_DEG
      };
    }
    // R3-arm: the 0.06 s key-level ramp is carried across frames (carryReachRamp); without it the ramp is inert.
    const reach = carryReachRamp(nextReach(base, fit, armOptions, Boolean(axes && Number(axes.z))), base);
    const reachRates = h > 0 ? { depth: (reach.depth - reachIn.depth) / h, x: (reach.xNdc - reachIn.xNdc) / h } : { depth: 0, x: 0 };
    // R4-fix (review RP3): a held key that moves the hand nothing (it is at the edge of what keeps the whole hand on
    // screen) is said in plain words after REACH_BLOCKED.seconds, instead of only lighting the muscles.
    // Net movement since the hold (or the last counted move) began, in the key's direction.
    const ax = keyed ? Math.sign(Number(axes.x) || 0) : 0, az = keyed ? Math.sign(Number(axes.z) || 0) : 0;
    const sig = `${ax},${az}`;
    let hold = keyed ? (state.reachHold && state.reachHold.sig === sig ? state.reachHold : { sig, x0: fit.xNdc, d0: fit.depth }) : null;
    const movedX = Boolean(hold) && ax !== 0 && ax * (fit.xNdc - hold.x0) >= REACH_BLOCKED.xNdc;
    const movedZ = Boolean(hold) && az !== 0 && az * (fit.depth - hold.d0) >= REACH_BLOCKED.depthM;
    if (hold && (movedX || movedZ)) hold = { sig, x0: fit.xNdc, d0: fit.depth };
    const prevHold = state.reachHold && state.reachHold.sig === sig ? state.reachBlockedS || 0 : 0;
    const reachBlockedS = !keyed || movedX || movedZ ? 0 : prevHold + wall;
    const elbowRad = fit.solution.elbowFlexRad;
    const elbowRate = wall > 0 && state.elbowRad !== null ? (elbowRad - state.elbowRad) / wall / DEG : 0;

    let residual = 0;
    for (const id of ACTION_IDS) if (a.targets[id] === 0 && a.drive[id] > residual) residual = a.drive[id];
    // Round-2 fix SCI-1: the region and region action the activity is actually pulsing (the info card explains that one).
    const pulseBodyAction = typeof a.pulseBody === 'string' && a.pulseBody.includes('/') ? a.pulseBody.slice(a.pulseBody.indexOf('/') + 1) : null;
    const pulse = {
      actionId: a.pulseAction,
      regionId: typeof a.pulseRegion === 'string' ? a.pulseRegion : null,
      regionActionId: pulseBodyAction || (typeof a.pulseRotation === 'string' ? a.pulseRotation : null) || (typeof a.pulseAction === 'string' ? a.pulseAction : null),
      remainingS: a.pulseRemaining,
      deadlineS: a.pulseAction !== null && a.lastTriggerAt !== null ? a.lastTriggerAt + activity.options.pulseSeconds : null,
      residualDisplay: residual
    };
    const activated = countActivations(state.activated, act.marks, act.restarts, gaze.actionId);
    const objOrNull = v => (v && typeof v === 'object' ? v : null);
    const nextState = {
      t: state.t + wall,
      poseT: (Number.isFinite(state.poseT) ? state.poseT : 0) + h,
      reach,
      reachTouched: state.reachTouched === true || keyed,
      reachBlockedS,
      reachHold: hold,
      activity: a,
      elbowRad,
      elbowRate,
      reachRates,
      viewport: { ...viewport, brainCentreNdc: centre, pxKey },
      placement,
      gaze: {
        yaw, pitch, relYaw, relPitch, viewKey, kind: gaze.kind, target: gaze.target, regionId: gaze.regionId, hemisphere: gaze.hemisphere,
        isLeftArm: gaze.isLeftArm, actionId: gaze.actionId, u: gaze.u, point: gaze.point
      },
      trigger,
      fit: {
        xNdc: fit.xNdc, yNdc: Number.isFinite(fit.yNdc) ? fit.yNdc : null, depth: fit.depth, fallback: fit.fallback, anchor: fit.anchor,
        limits: fit.xLimits && fit.depthLimits ? { xRange: { xMin: fit.xLimits.xMin, xMax: fit.xLimits.xMax }, depthRange: depthRangeFor(fit, base, elbow) } : null
      },
      brainFrame,
      view: viewOut,
      rotation,
      pron,
      activated
    };
    return {
      state: nextState,
      out: {
        fit, pose, base, gaze, drives, displayDrives: display, muscle, rotationMuscles, armReach, placement, reframed, silentGaze, elbowRate, elbow, pulse,
        reachBlocked: reachBlockedS >= REACH_BLOCKED.seconds,
        reachMoved: { x: movedX, z: movedZ }, // R4-fix (RP3): the hand really moved this frame (net, key direction)
        marks: act.marks, restarts: act.restarts, dt: h, clock: { wallDt: wall, poseDt: h }, fovYDeg: fov,
        brainView: viewOut, brainParams: brainOut.params, brainTransform: brainOut.transform, pickParams: brain.params, brainFrame,
        brainMode: regionMode ? 'region' : 'legacy', arrow, rotationState,
        regionActivity: objOrNull(a.regionActivity), activatedRegions: objOrNull(a.activatedRegions), activatedActions: activated,
        bodyJointTargets: objOrNull(a.bodyJointTargets), handTargetYNdc: handYNdc, attachment: att, wristReachDeg: wristDeg,
        forearmPronationDeg: fit.joints && Number.isFinite(fit.joints.forearm_pronation) ? fit.joints.forearm_pronation : null,
        sources: {
          step: gatedStep ? 'activity.stepGated' : 'stepActivityGated',
          orbit: viewOut.source.orbit, grab: viewOut.source.grab, orbitSign: ORBIT_SIGN,
          rotation: typeof a.rotationState === 'string' ? 'activity' : 'fallback',
          attachment: att ? `ns-arm.armAttachment (eye: ${anatomy.eyeSource})` : 'camera-fixed fallback shoulder',
          regions: a.regionActivity ? 'activity' : null,
          brainTransform: brain.transform ? 'ns-brain.brainViewTransform' : null,
          gaze: classifyView ? 'classifyView' : regionMode && brain.transform ? 'ns-brain.classifyRegionGaze' : 'ns-brain.classifyGaze'
        }
      }
    };
  }

  /** Reset body (Esc page, R11b): the activity's resetBody when it exists (activation marks, body joints, rotation),
   * else a fresh activity seeded silently on the current gaze; the arm reach, the fallback rotation and the fallback
   * marks return to their start. The brain view is kept (resetBrainView). No pulse starts. */
  function resetBody(state) {
    if (!state || !state.activity) fail('app_state', 'state must come from initialState/stepFrame');
    const g = state.gaze;
    let a;
    if (resetFn) a = resetFn(state.activity);
    else {
      a = copyJson(initialActivity);
      if (g && typeof activity.seed === 'function') {
        const dir = Number.isFinite(g.relYaw) && Number.isFinite(g.relPitch) ? { yaw: g.relYaw, pitch: g.relPitch } : {};
        a = activity.seed(a, { actionId: g.actionId, ...dir });
      } else if (g) a = seedActivityGaze(activity, a, g.actionId);
    }
    return {
      ...state, activity: a, reach: reachStart(armOptions), reachTouched: false, reachBlockedS: 0, reachHold: null, reachRates: { depth: 0, x: 0 }, elbowRad: null, elbowRate: 0,
      rotation: initialRotation(), pron: pronationStart('pronated'), activated: {}, trigger: { ...state.trigger, at: null }
    };
  }

  /** One pause/instructions authority (integration): the shell's pause/resume is forwarded to the activity (U1's
   * own `paused` gate and instructions flag), at zero elapsed time, so both report the same state. A resume makes
   * the next gaze silent (U1 seedNextGaze). */
  function setPaused(state, paused) {
    if (!state || !state.activity) fail('app_state', 'state must come from initialState/stepFrame');
    const a = state.activity;
    if (typeof a.paused !== 'boolean' || a.paused === (paused === true) || typeof activity.step !== 'function') return state;
    return { ...state, activity: activity.step(a, [{ type: paused === true ? 'pause' : 'resume' }], 0) };
  }

  /** Reset brain view: orbit and grab offset back to the default framing. When the activity owns them (ns-actions
   * orbit / brainPlacement / brainGrab), its state gets the same fields zeroed (validated by its own state check; on a
   * refusal the activity is left unchanged) and the next gaze is silent. */
  function resetBrainView(state) {
    if (!state || !state.activity) fail('app_state', 'state must come from initialState/stepFrame');
    let a = state.activity;
    if (a.orbit && a.brainPlacement && a.brainGrab) {
      const next = { ...a, orbit: { yaw: 0, pitch: 0 }, brainPlacement: { yaw: 0, pitch: 0 }, brainGrab: { ...a.brainGrab, active: false } };
      if (hasOwn(a, 'seedNextGaze')) next.seedNextGaze = true;
      try { activity.drives(next); a = next; } catch { /* the model refused the edited state: keep its own view */ }
    }
    return { ...state, activity: a, view: initialBrainView() };
  }

  /** QA (region mode): one VERIFIED look per body-map region for the current brain view: candidate points on the
   * region (its per-hemisphere label anchor and centroid, then sampled triangle centroids) are turned into a look
   * (gazeAnglesToward) and kept only when classifyRegionGaze through the same view returns that region. Regions not
   * reachable from this orbit/drag are omitted (orbit and look again). Cached per brain view. */
  let targetsKey = null, targetsCache = null;
  const TARGET_MARGIN_RAD = 0.006;
  function regionTargets(state) {
    if (!regionMode || !state || !state.view || !state.brainFrame) return null;
    const { transform } = brainTransformFor(state.view, state.brainFrame);
    if (!transform) return null;
    const key = `${state.gaze ? state.gaze.viewKey : ''}|${state.viewport ? state.viewport.aspect : ''}|${transform.matrix[12]}|${transform.matrix[13]}|${transform.matrix[14]}`;
    if (key === targetsKey) return targetsCache;
    const out = [];
    for (const r of segmentation.regions || []) {
      const cands = [];
      for (const h of ['right', 'left']) {
        const b = r.byHemisphere && r.byHemisphere[h];
        if (b && b.anchor) cands.push(b.anchor);
        if (b && b.centroid) cands.push(b.centroid);
      }
      for (const part of segmentation.parts || []) {
        if (part.regionId !== r.id || !part.indices || !part.positions) continue;
        // R3-integrator: 48 samples per part (was 12), so a small region seen mostly behind its neighbours (rh_tongue at
        // 16:9) still gets a verified look; computed once per view for the QA snapshot only.
        const nTri = part.indices.length / 3, stepT = Math.max(1, Math.floor(nTri / 48));
        for (let t = 0; t < nTri; t += stepT) {
          const P = part.positions, I = part.indices, c = [0, 0, 0];
          for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) c[a] += P[3 * I[3 * t + k] + a] / 3;
          cands.push(c);
        }
      }
      // R3-fix: prefer a candidate whose whole neighbourhood (+-TARGET_MARGIN_RAD) is the region, so a look at it from
      // another area is not held by the classifier's boundary hysteresis; else the first verified candidate.
      const isRegion = (yy, pp) => { const ray = NsBrain.gazeRayForView(yy, pp, transform); const q = NsBrain.classifyRegionGaze(ray.origin, ray.dir, segmentation, { markers: strip.markers }); return q && q.kind === 'region' && q.regionId === r.id ? q : null; };
      let pickC = null;
      for (const c of cands) {
        let yaw, pitch;
        try { ({ yaw, pitch } = gazeAnglesToward(NsBrain.viewSourceToWorld(c, transform))); } catch { continue; }
        const g = isRegion(yaw, pitch);
        if (!g) continue;
        const m = TARGET_MARGIN_RAD;
        const inner = isRegion(yaw + m, pitch) && isRegion(yaw - m, pitch) && isRegion(yaw, pitch + m) && isRegion(yaw, pitch - m);
        if (!pickC) pickC = { yaw, pitch, g };
        if (inner) { pickC = { yaw, pitch, g }; break; }
      }
      if (pickC) {
        const { yaw, pitch, g } = pickC;
        {
          // Ordering score: the region's area facing the camera (largest, most clearly visible first).
          let score = 0;
          for (const hh of ['right', 'left']) {
            const b = r.byHemisphere && r.byHemisphere[hh];
            if (!b || !b.normal || !b.centroid || !Number.isFinite(b.areaMm2)) continue;
            const R = transform.rotation;
            const n = [0, 1, 2].map(i => R[i] * b.normal[0] + R[3 + i] * b.normal[1] + R[6 + i] * b.normal[2]);
            const w = NsBrain.viewSourceToWorld(b.centroid, transform), l = Math.hypot(w[0], w[1], w[2]) || 1;
            score += b.areaMm2 * Math.max(0, -(n[0] * w[0] + n[1] * w[1] + n[2] * w[2]) / l);
          }
          out.push({ id: r.id, yaw, pitch, isLeftArm: r.isLeftArm === true, hemisphere: g.hemisphere || null, score: Math.round(score) });
        }
      }
    }
    out.sort((a, b) => b.score - a.score);
    targetsKey = key;
    targetsCache = out;
    return out;
  }

  /** R4-scene wiring: armAvoidShapes of the player's arm at xSamples x depthSamples poses across its A/D x W/S range,
   * at the default look (yaw 0, pitch 0), rest pose, palm down, with the WASD wrist synergy. For scene.setArmEnvelope. */
  function armEnvelope(aspect, { xSamples = 9, depthSamples = 3 } = {}) {
    const fov = fovFor(aspect);
    const att = anatomy ? armAttachment(anatomy, { yaw: 0, pitch: 0, bodyYaw: bodyYawForLook(0, trunkFreeDeg || undefined) }) : null;
    const opts = att ? { ...armOptions, attachment: att } : armOptions;
    const viewport = { aspect, fovYDeg: fov };
    const pose = composePose(activity.drives(copyJson(initialActivity)));
    const rotation = pronationStart('pronated').deg;
    const fitAt = (xNdc, depth) => {
      const wd = wristReach ? wasdWristDeg({ xNdc, depth }, rotation) : 0;
      const joints = wd !== 0 && pose.joints && Number.isFinite(pose.joints.wrist_flex) ? { ...pose.joints, wrist_flex: pose.joints.wrist_flex + wd } : pose.joints;
      return fitHand(rig, boxes, { xNdc, yNdc: handYNdc, depth, joints, rotation }, viewport, opts);
    };
    const start = { ...reachStart(armOptions), ...(aspect < 1 ? { xNdc: PORTRAIT_REACH_START_X } : {}) };
    const f0 = fitAt(start.xNdc, start.depth);
    const d0 = f0.depthLimits.minDepth, d1 = f0.depthLimits.maxDepth;
    const out = [];
    for (let j = 0; j < depthSamples; j++) {
      const depth = depthSamples > 1 ? d0 + ((d1 - d0) * j) / (depthSamples - 1) : start.depth;
      const fr = fitAt(start.xNdc, depth);
      const x0 = fr.xLimits ? fr.xLimits.xMin : f0.xLimits.xMin, x1 = fr.xLimits ? fr.xLimits.xMax : f0.xLimits.xMax;
      for (let i = 0; i < xSamples; i++) {
        const f = fitAt(xSamples > 1 ? x0 + ((x1 - x0) * i) / (xSamples - 1) : start.xNdc, depth);
        out.push(armAvoidShapes(f, { aspect, fovYDeg: fov, ...(f.solution && Array.isArray(f.solution.shoulderCam) ? { shoulderCam: f.solution.shoulderCam } : {}) }));
      }
    }
    return out;
  }

  return Object.freeze({ activity, initialState, stepFrame, resetBody, resetBrainView, setPaused, regionTargets, fovYDeg, fovFor, frame, handYNdc,
    bodyMap: map, regionMode, anatomy, armEnvelope });
}

/* ------------------------------------------------------------------ HUD text (pure) */

const actionLabel = (binding, id) => {
  const a = binding && binding.actions instanceof Map ? binding.actions.get(id) : null;
  return a && typeof a.label === 'string' ? a.label : String(id);
};
/** HUD label of a pulse trigger: the movement-map action, else the body-map region action, else the region (a region
 * without actions, e.g. an inter-effector region), never the raw id or 'null' (fix round 2). */
function triggerLabel(binding, bodyMap, tr) {
  const map = bodyMapOf(bodyMap);
  const region = tr && typeof tr.regionId === 'string' ? regionById(map, tr.regionId) : null;
  // Round 3 (R17): the plain action name first (ns-bodymap plainLabel), then the plain region name.
  if (tr && typeof tr.actionId === 'string') {
    const plain = plainActionLabel(binding, map, tr.actionId, region ? region.id : null);
    if (plain && plain !== tr.actionId) return plain;
  }
  if (region) return NT.plainTitle(region);
  return tr && typeof tr.actionId === 'string' ? tr.actionId : 'motor area';
}

/** Plain name of an action id for the HUD (round 3, R17): the body-map action whose id or armActionId matches (its
 * plainLabel, ns-bodymap round 3; else its label), searching the given region first; else the movement-map label. */
export function plainActionLabel(binding, bodyMap, id, regionId = null) {
  const map = bodyMapOf(bodyMap);
  if (map && typeof id === 'string') {
    const first = typeof regionId === 'string' ? map.regions.filter(r => r && r.id === regionId) : [];
    for (const r of [...first, ...map.regions]) {
      const a = r && Array.isArray(r.actions) ? r.actions.find(x => x && (x.id === id || x.armActionId === id)) : null;
      if (a) return (typeof a.plainLabel === 'string' && a.plainLabel) || (typeof a.label === 'string' && a.label) || id;
    }
  }
  return actionLabel(binding, id);
}

/** R3-fix (M6): looks further right than yawRad and higher than -pitchRad get the "right arm is lower" hint (rad). */
// R4-integrator (R4-body): the new seated right-arm rest (forearm forward at elbow height) shows half the right hand
// from about 10 deg down at 16:9 and 21:9 (2.5 deg in portrait), so the "look down a little" hint stops at -0.15 rad
// (about 8.6 deg) instead of -0.35 (round4/R4-body-NOTES.md, arm-view table).
export const RIGHT_ARM_HINT = Object.freeze({ yawRad: 1.0, pitchRad: 0.15 });
/** Plain lead-in for the pinned movement-map qualifier (which then follows in brackets, verbatim). */
export const QUALIFIER_LEAD = 'The brain map is a rough guide';
/** Text that changes only with the loaded inputs. `shell: true` when the game shell owns pointer capture (hint text). */
export function hudStatic({ binding = null, data = null, placeholder = false, shell = false, legendStops = null, bodyNote = '' } = {}) {
  const q = binding && typeof binding.qualifier === 'string' && binding.qualifier.trim() ? binding.qualifier : HUD_TEXT.qualifier;
  let unmapped = '';
  if (placeholder) unmapped = HUD_TEXT.placeholderMuscles;
  else if (data && data.unmapped.length) {
    // R4-fix (review SL4-5): the forearm-turning muscles (pronator teres, both heads; pronator quadratus; supinator) are
    // coloured by name while a forearm turns (round-3 SL-2), so they are listed apart from the always-plain ones.
    const turn = data.unmapped.filter(m => /pronator|supinator/i.test(m.name)), plain = data.unmapped.filter(m => !/pronator|supinator/i.test(m.name));
    unmapped = [turn.length ? HUD_TEXT.unmappedTurnPrefix + turn.map(m => m.name).join(', ') : '',
      plain.length ? HUD_TEXT.unmappedPlainPrefix + plain.map(m => m.name).join(', ') : ''].filter(Boolean).join('. ');
  }
  const gapList = !placeholder && data ? MUSCLE_COVERAGE_GAPS.map(g => `${g.muscle} (${g.status}): ${g.note}`) : [];
  if (typeof bodyNote === 'string' && bodyNote) gapList.push(bodyNote);
  const gaps = gapList.join(' ');
  return {
    banner: placeholder ? HUD_TEXT.placeholderBanner : '',
    title: `${HUD_TEXT.title} \u00b7 ${HUD_TEXT.brand}`,
    // Round 3 (R17): the pinned movement-map qualifier (cortical_display_contract.minimum_qualifier_visible) stays
    // visible VERBATIM, in brackets after a plain lead-in (no second copy of the same meaning).
    qualifier: q === HUD_TEXT.qualifier ? q : `${QUALIFIER_LEAD} (${q})`,
    control: HUD_TEXT.control,
    simulated: HUD_TEXT.simulated,
    orientation: HUD_TEXT.view,
    hint: shell === true ? HUD_TEXT.hintShell : HUD_TEXT.hint,
    legendLabel: NT.LEGEND.label,
    legendLo: NT.LEGEND.lo,
    legendHi: NT.LEGEND.hi,
    legendStops: Array.isArray(legendStops) && legendStops.length >= 2 ? legendStops : LEGEND_STOPS,
    markerNote: HUD_TEXT.markers,
    drivesTitle: HUD_TEXT.drivesTitle,
    unmapped,
    gaps,
    limitsShort: HUD_TEXT.limitsShort,
    rights: placeholder ? HUD_TEXT.placeholderRights : HUD_TEXT.rights,
    attribution: placeholder ? HUD_TEXT.placeholderAttribution + ATTRIBUTION : ATTRIBUTION,
    orientationLabels: ORIENTATION_TEXT,
    orientationLabelsShort: ORIENTATION_TEXT_SHORT
  };
}

/** The top simulated muscle drives as HUD lines (catalog key, name, value). */
export function topMuscleLines(binding, muscle, count = 5) {
  return Object.keys(muscle)
    .sort((a, b) => muscle[b] - muscle[a] || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, count)
    .map(key => {
      const entry = binding.muscles[key];
      const name = entry && typeof entry.name === 'string' ? entry.name : key;
      return `${key} ${name}: ${muscle[key].toFixed(2)}`;
    });
}

/** HUD line for an explicit elbow target: achieved vs commanded signed elbow angle (simulated display). */
export function elbowText(elbow) {
  if (!elbow || !(Math.abs(elbow.commandDeg) >= 0.5)) return '';
  const kind = elbow.commandDeg > 0 ? 'flexion' : 'extension';
  const sign = v => `${v >= 0 ? '+' : '\u2212'}${Math.abs(v).toFixed(0)}\u00b0`;
  return `Elbow ${kind} (simulated target): ${sign(elbow.achievedDeg)} of ${sign(elbow.commandDeg)}${elbow.limited ? ' (limited by reach / hand visibility)' : ''}`;
}

/** Text that changes per frame. frameMs smooths elapsed update work through render-call return, not CPU time or frame cadence. */
/** How long the HUD flags a pulse that was suppressed by the held fist (s). */
export const SUPPRESSED_FLASH_SECONDS = 0.6;
/** Round 3 (R3-player item 8): the "lost the brain" hint shows when the grab offset exceeds `dragged` and the look is
 * more than `fromLook` from the dragged brain (radians; display choice). */
export const BRAIN_AWAY_RAD = Object.freeze({ dragged: 0.5, fromLook: 0.7 });
/** R4-polish: the orbit (deg) from which the status card offers the way back (limits: yaw 60, pitch 30). Display choice. */
export const TURNED_FAR_DEG = Object.freeze({ yaw: 45, pitch: 30 });

/** R4-integrator (D7): the guide line's box is re-read every rectEveryFrames frames; after the brain covered it, the line
 * shows again after clearFrames frames clear of the brain (no flicker at the edge). R4-fix (code review M3): after the
 * chip had no clear spot (line not drawn), it is drawn again only reshowFrames frames later. */
export const GUIDE_COVER = Object.freeze({ rectEveryFrames: 6, clearFrames: 8, reshowFrames: 12 });
/** R4-polish: below this look pitch (rad, about 17 deg down) the guide chip tries the top of the view first, because the
 * body you look down at fills the bottom. Display choice. */
export const GUIDE_PREFER_TOP_PITCH = -0.3;
/** R4-fix (review RP10): an opened More detail keeps this much of the card above it in view (CSS px). Display choice. */
export const INFO_DETAIL_CONTEXT_PX = 24;
/** R4-integrator (R4-player 1.8): the slow-computer note. Live frame intervals (ms) feed a smoothed value; the note
 * turns on after `onS` seconds above `slowMs` (under about 15 fps) and off after `offS` seconds below `okMs`. Gaps
 * longer than `gapMs` (pause, tab switch, QA step) are not frame times. Pure. (R4-fix M5: this note now sits above
 * SLOW_NOTICE, not above GUIDE_COVER.) */
export const SLOW_NOTICE = Object.freeze({ slowMs: 1000 / 15, okMs: 1000 / 22, onS: 3, offS: 2, gapMs: 1000, smooth: 0.15 });
export function stepSlowNotice(prev, frameMs, o = SLOW_NOTICE) {
  const s = prev && typeof prev === 'object' ? prev : { emaMs: null, slowFor: 0, okFor: 0, on: false };
  if (!(Number.isFinite(frameMs) && frameMs > 0 && frameMs <= o.gapMs)) return s;
  const ema = s.emaMs === null ? frameMs : s.emaMs + o.smooth * (frameMs - s.emaMs);
  const slowFor = ema > o.slowMs ? s.slowFor + frameMs / 1000 : 0;
  const okFor = ema < o.okMs ? s.okFor + frameMs / 1000 : 0;
  const on = s.on ? !(okFor >= o.offS) : slowFor >= o.onS;
  return { emaMs: ema, slowFor, okFor, on };
}

export function hudFrame({ binding, state, out, brainHit = false, frameMs = null, bodyMap = null, slowNote = '' }) {
  const g = out.gaze;
  const onStrip = (g.kind === 'strip' || g.target === 'region') && g.actionId !== null;
  const onOther = g.target === 'region' && g.actionId === null && typeof g.regionId === 'string';
  const onLeftArmRegion = onOther && g.isLeftArm === true;
  const a = state.activity;
  const tr = state.trigger;
  const marked = tr.at !== null && state.t - tr.at <= TRIGGER_MARK_SECONDS;
  const other = onOther ? regionById(bodyMapOf(bodyMap), g.regionId) : null;
  const sup = a.lastSuppressed && Number.isFinite(a.lastSuppressed.t) && state.t - a.lastSuppressed.t <= SUPPRESSED_FLASH_SECONDS ? a.lastSuppressed : null;
  const grabbing = Boolean(out.brainView && out.brainView.grab && out.brainView.grab.active);
  const reachLevel = out.armReach && Number.isFinite(out.armReach.armReach) ? out.armReach.armReach : 0;
  // Round 3 (R17/D3): plain lines from ns-text; the crosshair label is the plain action / area name only.
  let gazeText, hover = '', caption = '';
  if (onStrip) {
    hover = plainActionLabel(binding, bodyMap, g.actionId, g.regionId);
    gazeText = NT.gazeLine('strip', hover);
    // R4-integrator (R4-player 1.1): "Relax left grip" on an open hand shows nothing; the caption says so.
    if (g.actionId === 'relax_release' && !a.spaceHeld) caption = HUD_TEXT.relaxNothing;
  } else if (onOther) {
    hover = other ? NT.plainTitle(other) : g.regionId;
    gazeText = NT.gazeLine(onLeftArmRegion ? 'leftArm' : other && other.kind === 'integration' ? 'between' : 'other', hover);
    // R4-integrator (R4-player 1.4): in-between areas and the face areas the 3D body has no muscles for move nothing you
    // can see (their panel says so too: plainMoves "Nothing ..."); the caption says it at the crosshair.
    if (other && !onLeftArmRegion && typeof other.plainMoves === 'string' && /^Nothing\b/.test(other.plainMoves)) caption = HUD_TEXT.nothingMoves;
    // R4-fix (review RP6): the left shoulder area (light blue, no action of its own) says why nothing new moves.
    else if (onLeftArmRegion && other && !(Array.isArray(other.actions) && other.actions.length) && HUD_TEXT.shoulderMoves) caption = HUD_TEXT.shoulderMoves;
  } else if (g.target === 'glass') gazeText = HUD_TEXT.gazeGlass;
  else gazeText = brainHit ? HUD_TEXT.gazeBrain
    // R3-fix (review M6 / F5): far right at about eye level the seated right arm is below the view; say where it is.
    : Number.isFinite(g.yaw) && Number.isFinite(g.pitch) && g.yaw < -RIGHT_ARM_HINT.yawRad && g.pitch > -RIGHT_ARM_HINT.pitchRad ? `${HUD_TEXT.gazeEmpty} · ${NT.HUD.rightArmHint}` : HUD_TEXT.gazeEmpty;
  const rotation = NT.rotationLine(typeof out.rotationState === 'string' ? out.rotationState : '');
  const pulseRegion = out.pulse && typeof out.pulse.regionId === 'string' ? out.pulse.regionId : null;
  // R3-player item 8: after a far drag, a one-line way back while the brain is far from the crosshair (not while held).
  const off = out.brainView && out.brainView.offset ? out.brainView.offset : null;
  // R4-fix (review RP4): not while an orbit arrow is under the crosshair (the player is doing what the guide asked).
  const onArrow = typeof out.arrow === 'string' && out.arrow !== '';
  const brainAway = Boolean(off) && !grabbing && !onArrow && Number.isFinite(off.yaw) && Number.isFinite(off.pitch) && Number.isFinite(g.yaw) && Number.isFinite(g.pitch)
    && Math.hypot(off.yaw, off.pitch) > BRAIN_AWAY_RAD.dragged && Math.hypot(g.yaw - off.yaw, g.pitch - off.pitch) > BRAIN_AWAY_RAD.fromLook;
  // R4-polish (R4-player 1.11): after a long arrow hold the view can be turned far round the brain; say how to go back.
  const orb = out.brainView && out.brainView.orbit ? out.brainView.orbit : null;
  const turnedFar = !brainAway && Boolean(orb) && (Math.abs(orb.yaw) >= TURNED_FAR_DEG.yaw || Math.abs(orb.pitch) >= TURNED_FAR_DEG.pitch);
  return {
    gaze: gazeText,
    hover: caption ? `${NT.hoverLabel(hover)} · ${caption}` : NT.hoverLabel(hover),
    // Polish: the crown/sulcus caveat (CROWN_NOTE) is on the Esc limits list (INFO_TEXT.crownNote, fix SCI-3); the HUD keeps short lines.
    note: [WHOLE_GROUP_TINT_ACTIONS.some(id => out.displayDrives && out.displayDrives[id] > 0.2) ? HUD_TEXT.wholeGroupTint : '',
      sup ? NT.suppressedLine(plainActionLabel(binding, bodyMap, sup.actionId)) : '',
      out.reachBlocked === true ? HUD_TEXT.reachBlocked : '',
      brainAway ? HUD_TEXT.brainAwayHint : '', turnedFar ? HUD_TEXT.turnedFarHint : '', typeof slowNote === 'string' ? slowNote : '']
      .filter(Boolean).join(' \u00b7 '),
    pulse: a.pulseAction !== null
      ? NT.pulseLine(plainActionLabel(binding, bodyMap, out.pulse && out.pulse.regionActionId ? out.pulse.regionActionId : a.pulseAction, pulseRegion), a.pulseRemaining)
      : out.pulse && out.pulse.residualDisplay > RESIDUAL_DISPLAY_MIN ? HUD_TEXT.pulseResidual : HUD_TEXT.pulseNone,
    trigger: marked ? NT.triggerLine(tr.seq, tr.source, triggerLabel(binding, bodyMap, tr)) : '',
    crosshairActive: onStrip || onOther || marked,
    space: [grabbing ? HUD_TEXT.grabbing : a.spaceHeld ? HUD_TEXT.spaceHeld : a.openRemaining > 0 ? HUD_TEXT.spaceReleased : '', rotation]
      .filter(Boolean).join(' \u00b7 '),
    reach: [out.elbow ? NT.elbowLine(out.elbow) : '', out.fit.clamped.x || out.fit.clamped.depth || out.fit.fallback !== null ? HUD_TEXT.reachLimited : '',
      reachLevel > RESIDUAL_DISPLAY_MIN && out.armReach ? `${HUD_TEXT.armReachLabel}: ${reachLevel.toFixed(2)}` : '']
      .filter(Boolean).join(' \u00b7 '),
    drives: topMuscleLines(binding, out.muscle, 5),
    frame: NT.frameLine(frameMs)
  };
}

/* ------------------------------------------------------------------ game shell, settings and QA helpers (pure) */

/** Game-shell text (2 s start instructions, Esc page). The limits repeat the HUD honesty lines so they stay readable
 * on every overlay; the HUD keeps its own always-visible lines underneath. */
export const SHELL_TEXT = NT.SHELL;

/** The compact fallback info panel lists this many caveats (the Esc page and the HUD keep the full honesty lines). */
export const INFO_PANEL_CAVEATS = 3;

/** After this long without a restored WebGL context the banner offers a reload (ms). */
export const CONTEXT_RELOAD_HINT_MS = 8000;

/** Shell modes: 'loading' -> 'intro' (2 s instructions, then by itself) -> 'playing' <-> 'paused' (Esc page);
 * 'error' is final. */
export const SHELL_MODES = Object.freeze(['loading', 'intro', 'playing', 'paused', 'error']);

/** Initial shell state. autoPlay (no shell DOM, the pre-A4 behaviour): 'ready' goes straight to 'playing' and
 * nothing ever pauses. */
export function createShellState({ autoPlay = false } = {}) {
  return {
    mode: 'loading', autoPlay: autoPlay === true, locked: false, lockFailed: false, unlockedPlay: false,
    notice: null, error: null, contextLost: false, contextLostAtMs: null, everPlayed: false,
    introHideAtMs: null, introShown: false, unlockPausedAtMs: null
  };
}

/**
 * Pure shell reducer. Events: { type: 'ready', atMs } | { type: 'tick', atMs } (hides the intro at introHideAtMs) |
 * { type: 'esc', atMs } (intro -> paused (round 3), playing -> paused, paused -> playing; an Esc within ESC_UNLOCK_GUARD_MS of
 * the lock loss that already paused is the same press) | { type: 'fatal', message } | { type: 'play' } (overlay click
 * or QA) | { type: 'locked' } | { type: 'unlocked', atMs } | { type: 'lockError' } | { type: 'lockUnavailable' } |
 * { type: 'playUnlocked' } | { type: 'pause' } | { type: 'notice', text } | { type: 'contextLost', atMs } |
 * { type: 'contextRestored' }. Returns the same object when nothing changes.
 */
export function shellReduce(s, ev) {
  if (!s || !ev || typeof ev.type !== 'string') return s;
  const overlay = s.mode === 'intro' || s.mode === 'paused';
  const toPlaying = extra => ({ ...s, mode: 'playing', everPlayed: true, notice: null, unlockPausedAtMs: null, ...extra });
  const at = Number.isFinite(ev.atMs) ? ev.atMs : null;
  switch (ev.type) {
    case 'ready':
      if (s.mode !== 'loading') return s;
      if (s.autoPlay) return toPlaying({});
      // R4-load: holdIntro (the body is still streaming): the instructions show, Start now works, and the 2 s timer starts
      // with 'introTimer' once the body is in.
      return { ...s, mode: 'intro', introShown: true, introHideAtMs: at !== null && ev.holdIntro !== true ? at + INTRO_MS : null };
    case 'introTimer':
      return s.mode === 'intro' && s.introHideAtMs === null && at !== null ? { ...s, introHideAtMs: at + INTRO_MS } : s;
    case 'tick':
      return s.mode === 'intro' && s.introHideAtMs !== null && at !== null && at >= s.introHideAtMs ? toPlaying({}) : s;
    case 'esc':
      if (s.autoPlay) return s;
      // Round 3 (R3-player item 12, R6 "whenever you press Esc ... it shows the instructions"): Esc during the 2 s intro
      // keeps the instructions up as the Esc page (paused) instead of closing them; Esc again resumes.
      if (s.mode === 'intro') return { ...s, mode: 'paused', introHideAtMs: null, unlockPausedAtMs: null };
      if (s.mode === 'playing') return { ...s, mode: 'paused', unlockPausedAtMs: null };
      if (s.mode === 'paused') {
        if (s.unlockPausedAtMs !== null && at !== null && at - s.unlockPausedAtMs < ESC_UNLOCK_GUARD_MS) return s;
        return toPlaying({});
      }
      return s;
    case 'fatal':
      return { ...s, mode: 'error', error: typeof ev.message === 'string' && ev.message ? ev.message : 'unknown error', notice: null };
    case 'play':
      return overlay ? toPlaying({}) : s;
    case 'locked':
      if (s.mode === 'error' || s.mode === 'loading') return s.locked ? s : { ...s, locked: true };
      return toPlaying({ locked: true, lockFailed: false, unlockedPlay: false });
    case 'unlocked':
      if (!s.locked) return s;
      if (s.mode === 'playing' && !s.autoPlay) return { ...s, locked: false, mode: 'paused', unlockPausedAtMs: at };
      return { ...s, locked: false };
    case 'lockError':
      return { ...s, lockFailed: true, notice: overlay ? SHELL_TEXT.lockRefused : s.notice };
    case 'lockUnavailable':
    case 'playUnlocked':
      return overlay ? toPlaying({ unlockedPlay: true, lockFailed: ev.type === 'lockUnavailable' ? true : s.lockFailed }) : s;
    case 'pause':
      return s.mode === 'playing' && !s.autoPlay ? { ...s, mode: 'paused', unlockPausedAtMs: null } : s;
    case 'notice':
      return typeof ev.text === 'string' && ev.text !== s.notice ? { ...s, notice: ev.text } : s;
    case 'contextLost':
      return s.contextLost ? s : { ...s, contextLost: true, contextLostAtMs: at };
    case 'contextRestored':
      return s.contextLost ? { ...s, contextLost: false, contextLostAtMs: null } : s;
    default:
      return s;
  }
}

/** True when user input should drive the simulation (the shell is playing). */
export const shellIsPlaying = s => Boolean(s) && s.mode === 'playing';

/** The instructions state for the QA snapshot (shared interface 4 `instructions { visible, autoHideAt }`). */
export function instructionsState(s) {
  const visible = Boolean(s) && (s.mode === 'intro' || s.mode === 'paused');
  return { visible, mode: visible ? s.mode : null, autoHideAt: s && s.mode === 'intro' ? s.introHideAtMs : null, introMs: INTRO_MS, introShown: Boolean(s && s.introShown) };
}

/** Toast text while playing: '' when the mouse is captured, else the capture hint (with drag-to-look), the refusal
 * notice, or the no-capture notice. */
export function shellToastText(s, { dragLook = true } = {}) {
  if (!s || s.mode !== 'playing' || s.locked) return '';
  if (s.lockFailed) return SHELL_TEXT.lockRefused;
  return dragLook ? SHELL_TEXT.captureHint : SHELL_TEXT.lookOff;
}

/** Persisted player settings (localStorage key, limits, defaults). faceView: FACE_VIEW_MODES. */
export const SETTINGS_KEY = 'neurosurge.settings.v1';
export const SETTINGS_LIMITS = Object.freeze({ lookSensitivity: Object.freeze({ min: 0.25, max: 3, step: 0.05 }) });
/** R4-integrator (D8): the Esc-page picture-quality setting; equals ns-scene-three QUALITY_MODES (unit-tested). */
export const QUALITY_SETTING_MODES = Object.freeze(['auto', 'high', 'low']);
export const QUALITY_SETTING_LABELS = NT.QUALITY_LABELS;
export const SETTINGS_DEFAULTS = Object.freeze({ lookSensitivity: 1, invertY: false, faceView: 'ghost', quality: 'auto' });

/** Clamp and normalise settings from any input (unknown fields dropped; invalid values take the defaults). */
export function sanitizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const L = SETTINGS_LIMITS.lookSensitivity;
  const v = Number(src.lookSensitivity);
  let sens = Number.isFinite(v) ? clamp(v, L.min, L.max) : SETTINGS_DEFAULTS.lookSensitivity;
  sens = Math.round(Math.round(sens / L.step) * L.step * 100) / 100;
  const faceView = FACE_VIEW_MODES.includes(src.faceView) ? src.faceView : SETTINGS_DEFAULTS.faceView;
  const quality = QUALITY_SETTING_MODES.includes(src.quality) ? src.quality : SETTINGS_DEFAULTS.quality;
  return { lookSensitivity: clamp(sens, L.min, L.max), invertY: src.invertY === true, faceView, quality };
}

/** Read settings from a Storage-like object; any failure (no storage, SecurityError, bad JSON) gives the defaults. */
export function loadSettings(storage, key = SETTINGS_KEY) {
  try {
    const text = storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null;
    if (typeof text !== 'string' || text === '') return { ...SETTINGS_DEFAULTS };
    return sanitizeSettings(JSON.parse(text));
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

/** Write settings; returns false (never throws) when storage is missing, full or blocked. */
export function saveSettings(storage, settings, key = SETTINGS_KEY) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(key, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

/** Pointer-delta multipliers for the settings: x = sensitivity, y = sensitivity (negated when invertY). */
export function lookScale(settings) {
  const s = sanitizeSettings(settings);
  return { x: s.lookSensitivity, y: s.invertY ? -s.lookSensitivity : s.lookSensitivity };
}

/** Resize debounce (ms): a new canvas size is applied once it has been stable for delayMs, or after maxWaitMs of
 * continuous change. The first size applies at once. Reframing on apply is silent (stepFrame silentGaze). */
export const RESIZE_DEBOUNCE = Object.freeze({ delayMs: 150, maxWaitMs: 600 });

/** Pure resize debouncer: update({ width, height, pixelRatio }, nowMs) -> { apply: size | null, pending }. */
export function createResizeDebouncer({ delayMs = RESIZE_DEBOUNCE.delayMs, maxWaitMs = RESIZE_DEBOUNCE.maxWaitMs } = {}) {
  const delay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : RESIZE_DEBOUNCE.delayMs;
  const maxWait = Number.isFinite(maxWaitMs) && maxWaitMs >= delay ? maxWaitMs : Math.max(delay, RESIZE_DEBOUNCE.maxWaitMs);
  let applied = null, pending = null, firstSeen = null, lastChange = null;
  const same = (a, b) => Boolean(a) && Boolean(b) && a.width === b.width && a.height === b.height && a.pixelRatio === b.pixelRatio;
  const copy = z => ({ width: z.width, height: z.height, pixelRatio: z.pixelRatio });
  const take = () => { applied = pending; pending = null; firstSeen = null; lastChange = null; return { apply: applied, pending: false }; };
  return {
    update(size, nowMs) {
      if (!size || !(size.width > 0 && size.height > 0)) return { apply: null, pending: pending !== null };
      if (applied === null) { pending = copy(size); return take(); }
      if (same(size, applied)) { pending = null; firstSeen = null; lastChange = null; return { apply: null, pending: false }; }
      if (!Number.isFinite(nowMs)) { pending = copy(size); return take(); }
      if (!same(size, pending)) { pending = copy(size); lastChange = nowMs; if (firstSeen === null) firstSeen = nowMs; }
      if (nowMs - lastChange >= delay || nowMs - firstSeen >= maxWait) return take();
      return { apply: null, pending: true };
    },
    get applied() { return applied; },
    get pending() { return pending; }
  };
}

/** Throttled aria-live text: update(text, nowMs) returns the text to announce now, or null (unchanged or too soon;
 * the latest wanted text is announced once the interval has passed). */
export function createAnnouncer({ minIntervalMs = 750 } = {}) {
  let want = null, said = null, saidAt = -Infinity;
  return {
    update(text, nowMs) {
      if (typeof text === 'string' && text !== '') want = text;
      if (want === null || want === said) return null;
      const t = Number.isFinite(nowMs) ? nowMs : saidAt + minIntervalMs;
      if (t - saidAt < minIntervalMs) return null;
      said = want;
      saidAt = t;
      return said;
    }
  };
}

/**
 * Plain-JSON deep copy: typed arrays become arrays, Maps become objects, functions/undefined/symbols are dropped,
 * non-finite numbers become null, cycles become '[cycle]'. Arrays longer than maxArray are truncated with a marker.
 */
export function plainCopy(value, { maxArray = Infinity, maxDepth = 24 } = {}) {
  const seen = new WeakSet();
  const walk = (v, depth) => {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? v : null;
    if (t === 'string' || t === 'boolean') return v;
    if (t !== 'object') return undefined;
    if (depth > maxDepth) return '[depth]';
    if (seen.has(v)) return '[cycle]';
    seen.add(v);
    let out;
    if (ArrayBuffer.isView(v) || Array.isArray(v)) {
      const n = Math.min(v.length, maxArray);
      out = [];
      for (let i = 0; i < n; i++) { const c = walk(v[i], depth + 1); out.push(c === undefined ? null : c); }
      if (v.length > n) out.push(`[+${v.length - n} more]`);
    } else if (v instanceof Map) {
      out = {};
      for (const [k, x] of v) { const c = walk(x, depth + 1); if (c !== undefined) out[String(k)] = c; }
    } else if (v instanceof Set) {
      out = [];
      for (const x of v) { const c = walk(x, depth + 1); if (c !== undefined) out.push(c); }
    } else {
      out = {};
      for (const k of Object.keys(v)) { const c = walk(v[k], depth + 1); if (c !== undefined) out[k] = c; }
    }
    seen.delete(v);
    return out;
  };
  const r = walk(value, 0);
  return r === undefined ? null : r;
}

/**
 * Hand screen bounds in NDC from fitHand's projected fit-box corners (fit.cornersNdc). The boxes conservatively bound
 * every rendered hand-tissue vertex (fitBoxes), so this is an outer bound of the whole hand, digits included.
 * @returns {null | { source, count, xMin, xMax, yMin, yMax, maxAbsX, maxAbsY, minDepth, segments, insideView }}
 */
export function handBoundsNdc(cornersNdc) {
  if (!Array.isArray(cornersNdc) || cornersNdc.length === 0) return null;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, minDepth = Infinity, count = 0;
  const segments = new Set();
  for (const c of cornersNdc) {
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    count++;
    if (c.x < xMin) xMin = c.x;
    if (c.x > xMax) xMax = c.x;
    if (c.y < yMin) yMin = c.y;
    if (c.y > yMax) yMax = c.y;
    if (Number.isFinite(c.depth) && c.depth < minDepth) minDepth = c.depth;
    if (typeof c.segment === 'string') segments.add(c.segment);
  }
  if (count === 0) return null;
  const maxAbsX = Math.max(Math.abs(xMin), Math.abs(xMax)), maxAbsY = Math.max(Math.abs(yMin), Math.abs(yMax));
  return {
    source: 'fit_box_corners', count, xMin, xMax, yMin, yMax, maxAbsX, maxAbsY,
    minDepth: Number.isFinite(minDepth) ? minDepth : null, segments: [...segments].sort(),
    insideView: maxAbsX <= 1 && maxAbsY <= 1 && (!Number.isFinite(minDepth) || minDepth > 0)
  };
}

export const QA_SNAPSHOT_SCHEMA = 'neurosurge-qa-snapshot/2';

/**
 * Deterministic QA snapshot (pure, plain JSON, deep-copied): gaze (normalised: target, regionId, hemisphere,
 * isLeftArm), activity (targets, smoothed drive, pulse timer), commanded drives, display activity per field
 * (displayDrives: what colours the strip), muscle drives, reach and fit, hand centre and whole-hand bounds in NDC
 * (achieved centre y and the R10 target y), controls, shell and pointer-lock state, plus the round-2 fields of shared
 * interface 8: regionActivity, activatedRegions (activity) and activatedActions (fallback marks), rotationState, the
 * brain view (orbit, grab, offset, transform params and transform), instructions { visible, mode, autoHideAt },
 * paused, body joint targets and visibility flags, the info-overlay summary and which module provided each value.
 * Values a module does not provide yet are null.
 */
export function qaSnapshot({ phase = null, frames = 0, clock = null, shell = null, settings = null, pointerLocked = false,
  viewport = null, state = null, out = null, controls = null, axes = null, bodyVisibility = null, info = null, scene = null,
  activityView = null, regionTargets = null, sceneState = null, bodyPosedTargets = null, brainFrame = null, guide = null,
  reducedMotion = null, quality = undefined } = {}) {
  const a = state && state.activity ? state.activity : null;
  const fit = out && out.fit ? out.fit : null;
  const pulse = out && out.pulse ? out.pulse : null;
  const view = out && out.brainView ? out.brainView : state && state.view ? state.view : null;
  return plainCopy({
    schema: QA_SNAPSHOT_SCHEMA,
    phase,
    frames,
    clock: { simT: state ? state.t : null, poseT: state ? state.poseT : null, ...(clock || {}) },
    shell,
    instructions: shell ? instructionsState(shell) : null,
    paused: Boolean(shell && shell.mode === 'paused'),
    settings,
    pointerLock: { locked: pointerLocked === true },
    viewport,
    gaze: state && state.gaze ? state.gaze : null,
    activity: a,
    activityView,
    pulse: a ? {
      actionId: a.pulseAction, remainingS: a.pulseRemaining, seq: a.pulseSeq, lastTriggerAt: a.lastTriggerAt,
      deadlineS: pulse ? pulse.deadlineS : null, residualDisplay: pulse ? pulse.residualDisplay : null
    } : null,
    trigger: state ? state.trigger : null,
    drives: out ? out.drives : null,
    displayDrives: out ? out.displayDrives : null,
    muscleDrives: out ? out.muscle : null,
    armReach: out ? out.armReach || null : null,
    regionActivity: out ? out.regionActivity : a && a.regionActivity ? a.regionActivity : null,
    activatedRegions: out ? out.activatedRegions : a && a.activatedRegions ? a.activatedRegions : null,
    activatedActions: state ? state.activated || {} : null,
    rotationState: out ? out.rotationState : null,
    brain: {
      view,
      params: out ? out.brainParams || null : null,
      transform: out ? out.brainTransform || null : null,
      placement: out && out.placement ? out.placement : state ? state.placement : null
    },
    orbit: view ? view.orbit : null,
    regionTargets: Array.isArray(regionTargets) ? regionTargets : null,
    body: { jointTargets: out ? out.bodyJointTargets : null, posedTargets: bodyPosedTargets, visibility: bodyVisibility },
    // Round 3 (QA): the brain framing (D1 numbers) and the scene's own state (arrow plan, labels, glass read).
    brainFrame,
    sceneState,
    // R4-integrator: the "Try this" guide (D7, ns-guide guideView + progress) and prefers-reduced-motion (D9).
    guide,
    reducedMotion,
    // R4-integrator (D8): the scene's picture-quality state at the top level (mode, level, name, scale, pixelRatio, lite,
    // lod, antialias, ...), so it is never confused with the Picture quality SETTING (settings.quality).
    quality: quality !== undefined ? quality : sceneState && sceneState.quality ? sceneState.quality : null,
    reach: state ? state.reach : null,
    fit: fit ? { xNdc: fit.xNdc, yNdc: Number.isFinite(fit.yNdc) ? fit.yNdc : null, depth: fit.depth, anchor: fit.anchor, fallback: fit.fallback, clamped: fit.clamped, range: fit.range } : null,
    hand: fit ? {
      centreNdc: { x: fit.xNdc, y: Number.isFinite(fit.yNdc) ? fit.yNdc : 0 },
      targetYNdc: out && Number.isFinite(out.handTargetYNdc) ? out.handTargetYNdc : null,
      bboxNdc: handBoundsNdc(fit.cornersNdc)
    } : null,
    elbow: out ? out.elbow : null,
    arm: out ? {
      attachment: out.attachment ? { bodyYaw: out.attachment.bodyYaw, shoulderCam: out.attachment.shoulderCam, girdleShiftM: out.attachment.girdleShiftM } : null,
      forearmPronationDeg: Number.isFinite(out.forearmPronationDeg) ? out.forearmPronationDeg : null,
      wristReachDeg: Number.isFinite(out.wristReachDeg) ? out.wristReachDeg : null,
      wristClamped: fit && fit.clamped ? fit.clamped.wrist === true : null,
      shoulder: fit && fit.shoulder ? fit.shoulder : null
    } : null,
    info,
    scene,
    sources: out ? out.sources || null : null,
    frame: out ? { reframed: out.reframed, silentGaze: out.silentGaze === true, marks: out.marks, restarts: out.restarts, clock: out.clock, fovYDeg: out.fovYDeg } : null,
    controls: controls ? { keys: controls.keys, yaw: controls.yaw, pitch: controls.pitch, lookMs: controls.lookMs, queued: Array.isArray(controls.events) ? controls.events.length : 0 } : null,
    axes
  });
}

/** Summary of prepared scene data for inspect(): names and counts, no mesh arrays unless `meshes` is true. */
export function sceneDataSummary(data, { meshes = false } = {}) {
  if (!data) return null;
  const n3 = a => (a && Number.isFinite(a.length) ? a.length / 3 : 0);
  const summary = {
    placeholder: data.placeholder === true,
    label: data.label === undefined ? null : data.label,
    bones: (data.bones || []).map(b => ({ id: b.id, name: b.name, segment: b.segment, vertices: n3(b.positions) })),
    muscles: (data.muscles || []).map(m => ({ id: m.id, name: m.name, muscleKey: m.muscleKey, vertices: n3(m.positions) })),
    glass: (data.glass || []).map(g => ({ id: g.id, name: g.name, triangles: n3(g.indices) })),
    strip: data.strip ? {
      faceCount: data.strip.focus ? data.strip.focus.faceCount : null,
      markers: data.strip.markers,
      ...(meshes && data.strip.focus ? { focus: data.strip.focus } : {})
    } : null,
    fitBoxSegments: data.boxes instanceof Map ? [...data.boxes.keys()] : [],
    // The hand point the R10 lock applies to (metacarpal centroid, rig rest mm), so QA measures the same point.
    rig: data.rig && data.rig.handCentre ? { handCentre: Array.from(data.rig.handCentre) } : null,
    unmapped: data.unmapped || [],
    notes: data.notes || []
  };
  return plainCopy(summary);
}

/* ------------------------------------------------------------------ input loading */

const HEX64 = /^[0-9a-f]{64}$/;

async function fetchChecked(fetchText, sha256Hex, url, expected, what) {
  let text;
  try {
    text = await fetchText(url);
  } catch (err) {
    fail('app_fetch', `${what}: ${errorText(err)}`);
  }
  if (typeof text !== 'string') fail('app_fetch', `${what}: fetchText must resolve to a string`);
  const hex = await sha256Hex(text);
  if (typeof hex !== 'string' || hex.toLowerCase() !== expected) fail('app_hash', `${what}: sha256 does not match the pinned ${expected.slice(0, 12)}\u2026`);
  return text;
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return fail('app_json', `${what}: ${errorText(err)}`);
  }
}

/**
 * Fetch and verify the inputs. movement-map.json is always required (labels, roles, qualifier). In real mode the
 * accepted combined manifest is fetched from `manifestUrl`, validated, and every allowlisted OBJ is requested once
 * from `${packetBases[entry.source_packet]}${entry.path}`
 * (in parallel) and checked by loadAssets (bytes + sha256 before parsing). Placeholder mode fetches no anatomy.
 * @returns {Promise<{ binding, assets: null | { arm, brain, excluded }, placeholder }>}
 */
export async function loadInputs({ manifestUrl, packetBases, movementMapUrl, fetchText, sha256Hex, placeholder = false, expectedSha256 = PINNED_SHA256, onProgress = null,
  fetchBytes = null, sha256HexBytes = null } = {}) {
  if (typeof fetchText !== 'function') fail('app_args', 'fetchText(url) -> Promise<string> must be injected');
  if (typeof sha256Hex !== 'function') fail('app_args', 'sha256Hex(text) -> hex must be injected');
  if (typeof movementMapUrl !== 'string' || movementMapUrl === '') fail('app_args', 'movementMapUrl (URL of movement-map.json) is required');
  const pins = expectedSha256 || {};
  for (const k of ['movementMap', 'meshManifest']) {
    if (typeof pins[k] !== 'string' || !HEX64.test(pins[k])) fail('app_args', `expectedSha256.${k} must be 64 lower-case hex characters`);
  }
  const mapText = await fetchChecked(fetchText, sha256Hex, movementMapUrl, pins.movementMap, 'movement-map.json');
  const binding = bindMovementMap(parseJson(mapText, 'movement-map.json'));
  if (placeholder === true) return { binding, assets: null, placeholder: true };

  if (typeof manifestUrl !== 'string' || manifestUrl === '') fail('app_args', 'manifestUrl (URL of the accepted combined MESH-MANIFEST.json) is required');
  if (!packetBases || typeof packetBases !== 'object') fail('app_args', 'packetBases ({ packet: base URL }) is required');
  const baseOf = packet => {
    const b = packetBases[packet];
    if (typeof b !== 'string' || b === '') fail('app_args', `packetBases has no base URL for packet ${String(packet).slice(0, 60)}`);
    return b.endsWith('/') ? b : `${b}/`;
  };
  const manText = await fetchChecked(fetchText, sha256Hex, manifestUrl, pins.meshManifest, 'MESH-MANIFEST.json');
  const manifest = parseJson(manText, 'MESH-MANIFEST.json');
  const valid = validateManifest(manifest);
  const wanted = [...valid.arm, ...valid.brain];
  const pending = new Map();
  const keyOf = e => `${e.source_packet}/${e.path}`;
  // R4-load: with fetchBytes + sha256HexBytes the served bytes are hashed (no TextEncoder pass) and decoded once.
  const bytePath = typeof fetchBytes === 'function' && typeof sha256HexBytes === 'function';
  for (const e of wanted) {
    const url = baseOf(e.source_packet) + e.path;
    const p = Promise.resolve().then(() => (bytePath ? fetchBytes(url) : fetchText(url)));
    p.catch(() => {}); // handled when loadAssets reads it; avoids unhandled-rejection noise after an early failure
    pending.set(keyOf(e), p);
  }
  let done = 0;
  const readText = async (path, entry) => {
    const key = entry ? keyOf(entry) : path;
    if (!pending.has(key)) fail('app_asset', `unexpected read of ${key}`);
    const text = await pending.get(key);
    done++;
    if (typeof onProgress === 'function') onProgress(done, wanted.length);
    return text;
  };
  const assets = await loadAssets(bytePath ? { manifest, readBytes: readText, sha256HexBytes } : { manifest, readText, sha256Hex });
  return { binding, assets, placeholder: false };
}

/** Default locations of the round-2 full-body packet (acquisition agent U0; status pending Root review). */
export const FULLBODY_DEFAULTS = Object.freeze({
  manifestUrl: '../../inputs/FULLBODY-MESH-MANIFEST.json',
  packetBase: '../../packets/bodyparts3d-fullbody-r1/'
});

/**
 * Opt-in full-body loader for start({ loadBody }) (round 2). Fetches the FULLBODY-MESH-MANIFEST.json (its sha256 is
 * checked when expectedManifestSha256 is given), then every listed asset at `${packetBase}${entry.path}` with at most
 * `concurrency` requests in flight, verifies each OBJ's sha256 against the manifest BEFORE parsing (ns-assets parseObjFast, identical to ns-obj parseObj),
 * and returns { manifest, entries, meshesById: Map(element_id -> { positions, indices }) } for ns-body buildBodyRig.
 * Any fetch, hash or parse failure rejects (start() then shows it and keeps the arm game running).
 */
export async function loadFullBodyInputs({ manifestUrl = FULLBODY_DEFAULTS.manifestUrl, packetBase = FULLBODY_DEFAULTS.packetBase, fetchText, sha256Hex,
  expectedManifestSha256 = null, concurrency = 8, onProgress = null } = {}) {
  if (typeof fetchText !== 'function' || typeof sha256Hex !== 'function') fail('app_args', 'fetchText and sha256Hex must be injected');
  if (expectedManifestSha256 !== null && !(typeof expectedManifestSha256 === 'string' && HEX64.test(expectedManifestSha256))) {
    fail('app_args', 'expectedManifestSha256 must be 64 lower-case hex characters or null');
  }
  const text = expectedManifestSha256 ? await fetchChecked(fetchText, sha256Hex, manifestUrl, expectedManifestSha256, 'FULLBODY-MESH-MANIFEST.json')
    : await fetchText(manifestUrl);
  const manifest = parseJson(text, 'FULLBODY-MESH-MANIFEST.json');
  if (!manifest || !Array.isArray(manifest.assets)) fail('app_body', 'FULLBODY-MESH-MANIFEST.json has no assets array');
  const base = packetBase.endsWith('/') ? packetBase : `${packetBase}/`;
  const entries = manifest.assets.filter(e => e && typeof e.element_id === 'string' && typeof e.path === 'string' && HEX64.test(e.sha256 || ''));
  if (entries.length !== manifest.assets.length) fail('app_body', 'every full-body asset needs element_id, path and a sha256');
  for (const e of entries) {
    if (e.path.includes('..') || e.path.startsWith('/') || /^[a-z]+:/i.test(e.path)) fail('app_body', `${e.element_id}: path must stay inside the packet`);
  }
  const meshesById = new Map();
  let next = 0, done = 0;
  const worker = async () => {
    while (next < entries.length) {
      const e = entries[next++];
      const obj = await fetchChecked(fetchText, sha256Hex, base + e.path, e.sha256, e.element_id);
      const g = parseObjFast(obj);
      // R3-perf W2: the vertex count the manifest records (the arm path already checks it).
      if (Number.isSafeInteger(e.vertices) && g.vertexCount !== e.vertices) fail('app_body', `${e.element_id}: parsed ${g.vertexCount} vertices, manifest says ${e.vertices}`);
      meshesById.set(e.element_id, { positions: g.positions, indices: g.indices });
      done++;
      if (typeof onProgress === 'function') onProgress(done, entries.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, entries.length)) }, worker));
  return { manifest, entries, meshesById };
}

/**
 * R4-load: PROGRESSIVE full-body loader for start({ streamBody }). Fetches FULLBODY-MESH-MANIFEST.json (sha256 checked when
 * expectedManifestSha256 is given) and streams the listed OBJs through ns-assets streamFullbodyAssets: every file is
 * checked (byte count, sha256, then parse, vertex count, laterality) exactly as before, and any failure rejects `done`
 * (allOrNothing, as loadFullBodyInputs did). Returns at once:
 *   priority: Promise<Map(id -> { entry, mesh }) | null>  the files eyePosition reads (two lacrimal bones), so the eye of
 *             the first frame is the eye of the whole body; null when they failed (the eye then falls back to the brain);
 *   start():  starts the bulk (call it after the first frame is drawn);
 *   done:     Promise<{ manifest, entries, meshesById }> (the loadFullBodyInputs shape) or rejects;
 *   cancel(): stop starting new files (stop()).
 * fetchBytes + sha256HexBytes (optional) select the byte path; yieldFn + sliceMs time-slice the parsing.
 */
export function startFullBodyStream({ manifestUrl = FULLBODY_DEFAULTS.manifestUrl, packetBase = FULLBODY_DEFAULTS.packetBase, fetchText, sha256Hex,
  fetchBytes = null, sha256HexBytes = null, expectedManifestSha256 = null, concurrency = 8, onProgress = null, sliceMs = 8, yieldFn = null } = {}) {
  if (typeof fetchText !== 'function' || typeof sha256Hex !== 'function') fail('app_args', 'fetchText and sha256Hex must be injected');
  const base = packetBase.endsWith('/') ? packetBase : `${packetBase}/`;
  const manifestP = (async () => {
    const text = expectedManifestSha256 ? await fetchChecked(fetchText, sha256Hex, manifestUrl, expectedManifestSha256, 'FULLBODY-MESH-MANIFEST.json')
      : await fetchText(manifestUrl);
    return parseJson(text, 'FULLBODY-MESH-MANIFEST.json');
  })();
  const bytePath = typeof fetchBytes === 'function' && typeof sha256HexBytes === 'function';
  const streamP = manifestP.then(manifest => streamFullbodyAssets({
    manifest, allOrNothing: true, concurrency, sliceMs, yieldFn,
    ...(bytePath ? { readBytes: p => fetchBytes(base + p), sha256HexBytes } : { readText: p => fetchText(base + p), sha256Hex }),
    onProgress: typeof onProgress === 'function' ? p => onProgress(p.done, p.total) : null
  }));
  const done = Promise.all([manifestP, streamP.then(s => s.done)]).then(([manifest, r]) => fullbodyAppInputs(manifest, r));
  done.catch(() => {}); // handled by the caller once it awaits done
  return {
    priority: streamP.then(s => s.priority).then(r => (r.status === 'complete' && r.meshes.size ? r.meshes : null), () => null),
    start: () => { streamP.then(s => s.start(), () => {}); return done; },
    done,
    cancel: () => { streamP.then(s => s.cancel(), () => {}); }
  };
}

/** The simulated baseline drive every catalog muscle has at rest (used for muscles without a map role). */
export function restMuscleDrive(binding) {
  const rest = muscleDrives(binding, {});
  const values = Object.values(rest);
  return values.length ? values[0] : 0;
}

/* ------------------------------------------------------------------ game shell DOM */

/**
 * Build the game-shell DOM inside `root` (createElement / textContent only, never innerHTML): the instructions overlay
 * (a dialog with the title, subtitle, heading, status, notice, mode note, actions, instructions, controls, settings
 * and the honesty limits; the 2 s intro shows the instructions and controls, the Esc page adds Reset body, Reset brain
 * view and the settings), a context-loss banner, the capture / drag-to-look toast, a visually hidden aria-live region
 * for gaze changes and the FALLBACK far-right information panel (setInfo; used only while ns-scene-three draws none).
 * Styling is by class name (example/index.html). Clicks: in the intro anywhere starts; on the Esc page the backdrop or
 * Resume resumes, other buttons do their own action, the card text and the settings never resume.
 * @returns {{ render(shellState), renderContext(shellState, nowMs), setStatus(text), announce(text), setDragLook(on),
 *   setSettings(settings), setInfo(model), focusPrimary(), dispose(), element, infoElement }}
 */
export function createShell({ doc, root, text = SHELL_TEXT, settings = SETTINGS_DEFAULTS, onPlay = null, onPlayUnlocked = null, onReload = null,
  onSettings = null, onResetBody = null, onResetBrain = null, guideText = NT.GUIDE, onGuide = null } = {}) {
  if (!doc || typeof doc.createElement !== 'function') fail('app_shell', 'createShell needs a document');
  if (!root || typeof root.appendChild !== 'function') fail('app_shell', 'createShell needs a root element');
  const added = [];
  const on = (obj, type, fn) => { obj.addEventListener(type, fn); added.push([obj, type, fn]); };
  const el = (tag, className, parent, content) => {
    const e = doc.createElement(tag);
    if (className) e.className = className;
    if (content !== undefined) e.textContent = content;
    if (parent) parent.appendChild(e);
    return e;
  };
  const button = (className, parent, label, action) => {
    const b = el('button', className, parent, label);
    b.type = 'button';
    b.setAttribute('data-ns-action', action);
    return b;
  };
  const uid = `ns-shell-${Math.random().toString(36).slice(2, 8)}`;

  const overlay = el('div', 'ns-shell', root);
  overlay.setAttribute('data-mode', 'loading');
  const card = el('div', 'ns-shell-card', overlay);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('data-ns-card', '');
  // R3-polish: a thin bar along the top of the card that runs down over the 2 s intro (CSS shows it only in intro mode),
  // so "this page closes by itself after 2 seconds" can be seen as well as read.
  const timer = el('div', 'ns-shell-timer', card);
  timer.setAttribute('aria-hidden', 'true');
  if (timer.style && typeof timer.style.setProperty === 'function') timer.style.setProperty('--ns-intro-ms', `${INTRO_MS}ms`);
  el('span', 'ns-shell-timer-bar', timer);
  const title = el('h1', 'ns-shell-title', card, text.title);
  title.id = `${uid}-title`;
  const subtitle = el('p', 'ns-shell-subtitle', card, text.subtitle);
  subtitle.id = `${uid}-subtitle`;
  card.setAttribute('aria-labelledby', title.id);
  card.setAttribute('aria-describedby', subtitle.id);
  const heading = el('h2', 'ns-shell-heading', card, text.headings.loading);
  const status = el('p', 'ns-shell-status', card);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const notice = el('p', 'ns-shell-notice', card);
  notice.setAttribute('role', 'alert');
  notice.hidden = true;
  const modeNote = el('p', 'ns-shell-modenote', card);
  modeNote.hidden = true;
  const actions = el('div', 'ns-shell-actions', card);
  const play = button('ns-shell-play', actions, text.play, 'play');
  play.disabled = true;
  const resetBody = button('ns-shell-secondary ns-shell-reset', actions, text.resetBody, 'reset-body');
  resetBody.hidden = true;
  const resetBrain = button('ns-shell-secondary', actions, text.resetBrain, 'reset-brain');
  resetBrain.hidden = true;
  const unlocked = button('ns-shell-secondary', actions, text.playUnlocked, 'play-unlocked');
  unlocked.hidden = true;
  const reload = button('ns-shell-secondary', actions, text.reload, 'reload');
  reload.hidden = true;
  // R3-polish: what the two reset buttons do, in one plain line under them (Esc page only).
  const resetHelp = el('p', 'ns-shell-resethelp', card, typeof text.resetHelp === 'string' ? text.resetHelp : '');
  resetHelp.hidden = true;

  const form = el('fieldset', 'ns-shell-section ns-shell-settings', card);
  form.setAttribute('data-ns-noplay', '');
  el('legend', 'ns-shell-section-title', form, text.settingsTitle);
  // R4-polish (Esc page tidy): Settings sit right under the buttons in small groups (each control with its one-line
  // help), so Picture quality and the guide are seen without scrolling; How to play and Controls follow.
  const grpLook = el('div', 'ns-shell-setgroup', form);
  const sensRow = el('label', 'ns-shell-setting', grpLook);
  el('span', 'ns-shell-setting-label', sensRow, text.sensitivity);
  const L = SETTINGS_LIMITS.lookSensitivity;
  const sens = el('input', 'ns-shell-range', sensRow);
  sens.type = 'range';
  sens.min = String(L.min);
  sens.max = String(L.max);
  sens.step = String(L.step);
  const sensOut = el('output', 'ns-shell-out', sensRow);
  sensOut.setAttribute('aria-hidden', 'true');
  const invRow = el('label', 'ns-shell-setting ns-shell-check', grpLook);
  const inv = el('input', '', invRow);
  inv.type = 'checkbox';
  el('span', 'ns-shell-setting-label', invRow, text.invertY);
  const grpView = el('div', 'ns-shell-setgroup', form);
  const faceRow = el('label', 'ns-shell-setting', grpView);
  el('span', 'ns-shell-setting-label', faceRow, text.faceView);
  const face = el('select', 'ns-shell-select', faceRow);
  for (const m of FACE_VIEW_MODES) {
    const o = el('option', '', face, FACE_VIEW_LABELS[m]);
    o.value = m;
  }
  // R4-integrator (D8): Picture quality: Auto / High / Low (ns-scene-three setQuality). Meaning never changes with it.
  const qualityRow = el('label', 'ns-shell-setting', grpView);
  el('span', 'ns-shell-setting-label', qualityRow, typeof text.quality === 'string' ? text.quality : 'Picture quality');
  const qualitySel = el('select', 'ns-shell-select ns-shell-quality', qualityRow);
  qualitySel.name = 'quality';
  for (const m of QUALITY_SETTING_MODES) {
    const o = el('option', '', qualitySel, QUALITY_SETTING_LABELS[m]);
    o.value = m;
  }
  if (typeof text.qualityHelp === 'string' && text.qualityHelp) el('p', 'ns-shell-guidehelp ns-shell-qualityhelp', grpView, text.qualityHelp);
  // R4-fix (code review M1): edge smoothing (MSAA) is fixed when the page loads; after a Low start, this line says that
  // High (or Auto on a fast computer) is fully sharp only after a reload.
  const qualityNote = el('p', 'ns-shell-guidehelp ns-shell-qualityreload', grpView, '');
  qualityNote.hidden = true;
  // R4-text (D7): the optional "Try this" guide: Hide / Show and Restart (a click here never resumes the game).
  const grpGuide = el('div', 'ns-shell-setgroup', form);
  const guideRow = el('div', 'ns-shell-setting ns-shell-guide', grpGuide);
  el('span', 'ns-shell-setting-label', guideRow, guideText.escTitle);
  const guideToggle = button('ns-shell-secondary ns-shell-guide-toggle', guideRow, guideText.hide, 'guide-toggle');
  button('ns-shell-secondary ns-shell-guide-restart', guideRow, guideText.restart, 'guide-restart');
  el('p', 'ns-shell-guidehelp', grpGuide, guideText.escHelp);

  const grid = el('div', 'ns-shell-grid', card);
  const steps = el('section', 'ns-shell-section ns-shell-instructions', grid);
  el('h3', 'ns-shell-section-title', steps, text.instructionsTitle);
  const stepList = el('ol', 'ns-shell-steps', steps);
  // R3-polish: each step starts with a short bold lead-in (text.instructionHeads), so the page can be scanned.
  const heads = Array.isArray(text.instructionHeads) ? text.instructionHeads : [];
  text.instructions.forEach((line, i) => {
    const li = el('li', '', stepList);
    if (typeof heads[i] === 'string' && heads[i]) { el('strong', 'ns-shell-step-head', li, heads[i]); el('span', '', li, ` ${line}`); }
    else li.textContent = line;
  });
  const help = el('section', 'ns-shell-section ns-shell-help', grid);
  el('h3', 'ns-shell-section-title', help, text.controlsTitle);
  const keys = el('dl', 'ns-shell-keys', help);
  for (const [k, v] of text.controls) { el('dt', '', keys, k); el('dd', '', keys, v); }

  const limits = el('section', 'ns-shell-section ns-shell-limits', card);
  el('h3', 'ns-shell-section-title', limits, text.limitsTitle);
  const list = el('ul', '', limits);
  for (const line of text.limits) el('li', '', list, line);

  const context = el('div', 'ns-shell-context', root);
  context.setAttribute('role', 'alert');
  context.hidden = true;
  const contextText = el('span', 'ns-shell-context-text', context, text.contextLost);
  const contextReload = button('ns-shell-secondary', context, text.reload, 'reload');
  contextReload.hidden = true;
  const toast = el('div', 'ns-shell-toast', root, text.captureHint);
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  const live = el('div', 'ns-sr-only', root);
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');

  // Fallback far-right information panel (R14). Built lazily on the first setInfo call.
  const firstOf = (list, n) => {
    const a = Array.isArray(list) ? list : [];
    return a.length > n ? `${a.slice(0, n).join(', ')} (+${a.length - n} more)` : a.join(', ');
  };
  const clip = (t, n) => {
    if (typeof t !== 'string' || t.length <= n) return t || '';
    const cut = t.slice(0, n);
    const sp = cut.lastIndexOf(' ');
    return `${cut.slice(0, sp > n * 0.6 ? sp : n)}\u2026`;
  };
  let info = null, infoKey = null, infoActivity = null;
  const buildInfo = () => {
    const aside = el('aside', 'ns-info', root);
    aside.setAttribute('aria-label', INFO_TEXT.heading);
    const parts = {
      aside,
      heading: el('p', 'ns-info-heading', aside, INFO_TEXT.heading),
      title: el('h2', 'ns-info-title', aside),
      tag: el('p', 'ns-info-tag', aside),
      viewed: el('p', 'ns-info-viewed', aside),
      activity: el('p', 'ns-info-activity', aside),
      rows: el('dl', 'ns-info-rows', aside),
      explanation: el('p', 'ns-info-explanation', aside),
      simulated: el('p', 'ns-info-simulated', aside),
      known: el('p', 'ns-info-known', aside),
      caveats: el('ul', 'ns-info-caveats', aside),
      citations: el('p', 'ns-info-citations', aside)
      // The compact panel shows the first few muscles, a clipped explanation and the first caveats; infoOverlayModel
      // (and QA info()) keeps the full text.
    };
    return parts;
  };

  let mode = 'loading';
  let dragLook = true;
  let lastShell = null;
  let current = sanitizeSettings(settings);
  const showSettings = () => {
    sens.value = String(current.lookSensitivity);
    sens.setAttribute('aria-valuetext', `${current.lookSensitivity.toFixed(2)} times`);
    sensOut.textContent = `${current.lookSensitivity.toFixed(2)}×`;
    inv.checked = current.invertY;
    face.value = current.faceView;
    qualitySel.value = current.quality;
  };
  showSettings();
  const call = (fn, ...args) => { if (typeof fn === 'function') fn(...args); };
  const closest = (t, sel) => (t && typeof t.closest === 'function' ? t.closest(sel) : null);
  on(overlay, 'click', e => {
    const act = closest(e.target, '[data-ns-action]');
    const kind = act ? act.getAttribute('data-ns-action') : null;
    if (kind === 'reload') { call(onReload); return; }
    if (kind === 'play-unlocked') { if (!unlocked.hidden) call(onPlayUnlocked); return; }
    if (kind === 'reset-body') { if (!resetBody.hidden) call(onResetBody); return; }
    if (kind === 'reset-brain') { if (!resetBrain.hidden) call(onResetBrain); return; }
    if (kind === 'guide-toggle') { call(onGuide, 'toggle'); return; }
    if (kind === 'guide-restart') { call(onGuide, 'restart'); return; }
    if (closest(e.target, '[data-ns-noplay]')) return;
    if (play.disabled) return;
    if (mode === 'intro' || kind === 'play') { call(onPlay); return; }
    // Esc page: only the backdrop (outside the card) resumes; reading or selecting text on the card does not.
    if (mode === 'paused' && !closest(e.target, '[data-ns-card]')) call(onPlay);
  });
  on(contextReload, 'click', () => call(onReload));
  on(sens, 'input', () => {
    current = sanitizeSettings({ ...current, lookSensitivity: Number(sens.value) });
    showSettings();
    call(onSettings, current, false);
  });
  on(sens, 'change', () => call(onSettings, current, true));
  // R4-access (D9): while the page is open, Tab and Shift+Tab stay inside the card (aria-modal dialog): they wrap from
  // the last control to the first and back, so focus never lands on the game view or the panel links behind it.
  on(overlay, 'keydown', e => {
    if (!e || e.key !== 'Tab' || overlay.hidden) return;
    const list = [...card.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter(x => !x.hidden && !x.disabled && typeof x.getClientRects === 'function' && x.getClientRects().length > 0);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1], at = doc.activeElement;
    const wrap = e.shiftKey ? (at === first || !card.contains(at)) : (at === last || !card.contains(at));
    if (!wrap) return;
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  });
  on(inv, 'change', () => {
    current = sanitizeSettings({ ...current, invertY: inv.checked === true });
    showSettings();
    call(onSettings, current, true);
  });
  on(face, 'change', () => {
    current = sanitizeSettings({ ...current, faceView: face.value });
    showSettings();
    call(onSettings, current, true);
  });
  on(qualitySel, 'change', () => {
    current = sanitizeSettings({ ...current, quality: qualitySel.value });
    showSettings();
    call(onSettings, current, true);
  });

  const setText = (e, v) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (e.textContent !== s) e.textContent = s;
    if (e.hidden !== (s === '')) e.hidden = s === '';
  };
  const show = (e, visible) => { if (e.hidden === visible) e.hidden = !visible; };
  function focusPrimary() {
    const target = !play.hidden && !play.disabled ? play : !reload.hidden ? reload : null;
    if (target && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
    }
  }
  function renderToast(s) {
    const t = shellToastText(s, { dragLook });
    if (t && toast.textContent !== t) toast.textContent = t;
    show(toast, t !== '');
  }
  function render(s) {
    if (!s) return;
    lastShell = s;
    const changed = s.mode !== mode;
    mode = s.mode;
    overlay.setAttribute('data-mode', mode);
    const visible = mode !== 'playing';
    show(overlay, visible);
    heading.textContent = text.headings[mode] || '';
    play.textContent = mode === 'paused' ? text.resume : text.play;
    play.hidden = mode === 'error';
    play.disabled = !(mode === 'intro' || mode === 'paused');
    show(resetBody, mode === 'paused');
    show(resetBrain, mode === 'paused');
    show(resetHelp, mode === 'paused' && resetHelp.textContent !== '');
    show(form, mode === 'paused');
    show(unlocked, Boolean(s.lockFailed) && mode === 'paused');
    show(reload, mode === 'error');
    // R4-integrator (R4-load W8): while the body still streams in (introHideAtMs null) the 2 s timer has not started:
    // the note says so and the timer bar waits (CSS animates it only with data-intro-timer="running").
    const introWaiting = mode === 'intro' && !Number.isFinite(s.introHideAtMs);
    overlay.setAttribute('data-intro-timer', mode === 'intro' ? (introWaiting ? 'waiting' : 'running') : 'off');
    setText(modeNote, mode === 'intro' ? (introWaiting && typeof text.introNoteLoading === 'string' ? text.introNoteLoading : text.introNote) : mode === 'paused' ? text.pausedNote : '');
    setText(notice, mode === 'error' ? `NeuroSurge stopped: ${s.error}` : s.notice);
    if (mode === 'error') setText(status, '');
    renderToast(s);
    show(context, Boolean(s.contextLost));
    if (!s.contextLost) { contextText.textContent = text.contextLost; contextReload.hidden = true; }
    // R4-integrator: the page always opens at its top (Resume, Reset body, Reset brain view first); the card scrolls,
    // and a scroll left from the last visit (e.g. down to Settings) hid those buttons the next time Esc was pressed.
    if (changed && visible) { try { card.scrollTop = 0; } catch { /* not scrollable */ } }
    if (changed && visible) focusPrimary();
  }
  function renderContext(s, nowMs) {
    if (!s || !s.contextLost) return;
    const long = Number.isFinite(s.contextLostAtMs) && Number.isFinite(nowMs) && nowMs - s.contextLostAtMs >= CONTEXT_RELOAD_HINT_MS;
    const t = long ? text.contextLostLong : text.contextLost;
    if (contextText.textContent !== t) contextText.textContent = t;
    if (contextReload.hidden === long) contextReload.hidden = !long;
  }
  /** Draw an infoOverlayModel in the fallback far-right panel (text re-written only when the subject changes). */
  function setInfo(model) {
    if (!model || typeof model !== 'object') return;
    if (!info) info = buildInfo();
    const act = Number.isFinite(model.activity) ? Math.round(model.activity * 20) / 20 : null;
    const actText = act !== null || model.activations
      ? [act !== null ? NT.activityLine(act) : '', NT.activationsLine(model.activations)].filter(Boolean).join(' · ')
      : '';
    if (actText !== infoActivity) { setText(info.activity, actText); infoActivity = actText; }
    if (model.key === infoKey) return;
    infoKey = model.key;
    info.aside.setAttribute('data-mode', String(model.mode || ''));
    info.aside.setAttribute('data-left-arm', model.tag === INFO_TEXT.leftArmTag ? 'true' : 'false');
    setText(info.title, model.title);
    setText(info.tag, model.tag);
    setText(info.viewed, model.viewed === 'last' ? INFO_TEXT.lastViewed : '');
    info.rows.textContent = '';
    const row = (k, v) => { if (v) { el('dt', '', info.rows, k); el('dd', '', info.rows, v); } };
    // Round 3 (D3): the plain card's rows (at most 4) when the model has one; else the round-2 rows in plain words.
    if (model.card && Array.isArray(model.card.rows)) for (const [k, v] of model.card.rows) row(k, v);
    else {
      row(INFO_TEXT.rows.movement, model.action && (model.action.plainLabel || model.action.label) ? model.action.plainLabel || model.action.label : '');
      row(INFO_TEXT.rows.agonists, firstOf(model.agonists, 4));
      row(INFO_TEXT.rows.antagonists, firstOf(model.antagonists, 3));
      row(INFO_TEXT.rows.pathway, model.pathway || '');
    }
    show(info.rows, info.rows.childNodes.length > 0);
    // Round-2 fixes V1 / SCI-4 / F6 (fallback panel): plain lead, simulated, known and the region caveat first.
    setText(info.explanation, clip(model.card ? model.card.lead : [model.plain || '', model.explanation || ''].filter(Boolean).join(' '), 260));
    setText(info.simulated, model.mode === 'region' ? model.simulated : '');
    setText(info.known, model.mode === 'region' ? model.known : '');
    info.caveats.textContent = '';
    const caveats = [model.regionCaveat || '', ...(model.caveats || [])].filter(Boolean).slice(0, INFO_PANEL_CAVEATS);
    for (const c of caveats) el('li', '', info.caveats, c);
    show(info.caveats, caveats.length > 0);
    setText(info.citations, NT.sourcesLine(model.citations || []));
  }
  function dispose() {
    for (const [obj, type, fn] of added.splice(0)) obj.removeEventListener(type, fn);
    for (const e of [overlay, context, toast, live, info ? info.aside : null]) if (e && e.parentNode) e.parentNode.removeChild(e);
  }
  return Object.freeze({
    render,
    renderContext,
    focusPrimary,
    dispose,
    setInfo,
    setStatus: t => setText(status, t),
    /** Toast wording: true when the input binding offers drag-to-look without pointer capture. */
    setDragLook: v => { dragLook = v === true; if (lastShell) renderToast(lastShell); },
    announce: t => { if (typeof t === 'string' && live.textContent !== t) live.textContent = t; },
    setSettings: s => { current = sanitizeSettings(s); showSettings(); },
    /** R4-fix (M1): the Picture quality reload note ('' hides it). */
    setQualityNote: t => { const v = typeof t === 'string' ? t : ''; if (qualityNote.textContent !== v) qualityNote.textContent = v; qualityNote.hidden = v === ''; },
    setGuideHidden: h => { guideToggle.textContent = h === true ? guideText.show : guideText.hide; },
    get element() { return overlay; },
    get infoElement() { return info ? info.aside : null; }
  });
}

/* ------------------------------------------------------------------ bootstrap */

/** QA method names (window.__nsQA with ?qa=1; see start().qa). index.html forwards exactly these. */
export const QA_METHODS = Object.freeze(['setLook', 'key', 'click', 'step', 'pause', 'resume', 'snapshot', 'screenshotReady',
  'play', 'showPause', 'shell', 'settings', 'esc', 'orbit', 'resetBody', 'resetBrainView', 'info', 'mouseHold']);

/** Optional ns-scene-three methods start() calls when they exist (shared interface 6; feature-detected):
 *  setBrainTransform(transform, params)  the brain view transform (orbit + grab) from ns-brain brainViewTransform;
 *  updateRegions({ regionActivity, activatedRegions, activatedActions, gaze, displayDrives })  region shading, the
 *      persistent activated marks and the left-arm distinction;
 *  setFaceView(mode)  FACE_VIEW_MODES;  setInfo(model)  the far-right info panel (else the shell fallback panel);
 *  setBody({ entries, meshesById, rig }) / updateBody(matricesByMeshId, muscleDrivesByMeshId)  the full body;
 *  bodyVisibility() -> { torso, legs, face, rightArm, ... }  flags for the QA snapshot;
 *  orbitArrowAt(xCss, yCss) -> dir | null  and  hoverOrbitArrow(dir | null)  the crosshair-driven arrow hover (with the
 *      pointer captured there is no cursor, so a click while the crosshair is on an arrow orbits instead of activating);
 *  orbit clicks reach start() through createScene({ onOrbit }), a 'ns-orbit' CustomEvent ({ detail: { dir } }) on the
 *      document, or setOrbitHandler(fn). */
export const SCENE_HOOKS = Object.freeze(['setBrainTransform', 'updateRegions', 'setFaceView', 'setInfo', 'setBody', 'updateBody',
  'bodyVisibility', 'orbitArrowAt', 'hoverOrbitArrow', 'setOrbitHandler']);

/** Legend stops (CSS colours) from an ns-colors module (rampLegendStops), or null to keep LEGEND_STOPS. */
export function legendStopsFromColors(colors, n = LEGEND_STOPS.length) {
  if (!colors || typeof colors.rampLegendStops !== 'function') return null;
  let stops;
  try { stops = colors.rampLegendStops(n); } catch { return null; }
  if (!Array.isArray(stops) || stops.length < 2) return null;
  const css = stops.map(s => {
    if (typeof s === 'string') return s;
    if (s && typeof s.css === 'string') return s.css;
    if (s && typeof s.hex === 'string') return s.hex;
    const rgb = s && Array.isArray(s.rgb) ? s.rgb : Array.isArray(s) && s.length >= 3 ? s : null;
    return rgb ? `rgb(${rgb.slice(0, 3).map(c => Math.round(clamp(c, 0, 1) * 255)).join(', ')})` : null;
  });
  return css.every(c => typeof c === 'string') ? css : null;
}

/**
 * Start the scene. Programmer errors (no THREE, canvas or hudRoot) throw ns:app_args / ns:scene_hud / ns:app_shell.
 * Every other failure (no WebGL, fetch, hash, validation, parse, runtime) stops the scene and shows an explicit HUD
 * (and shell) error; there is no silent placeholder. Placeholder mode runs only when `placeholder === true` and always
 * shows PLACEHOLDER_LABEL.
 *
 * App shell (round-1 A4, round-2 U4-app):
 *  - ready resolves { ok: true, frames: 1 } only after the first frame has actually been rendered; { ok: false, error }
 *    on a failure or stop before that.
 *  - shellRoot (optional element): game shell (createShell). The instructions and controls show for INTRO_MS (2 s)
 *    and then hide by themselves; a click on them starts at once and requests pointer capture (that click never
 *    activates anything). Esc (or losing the pointer capture) shows the Esc page; Esc again resumes. While an overlay
 *    shows the simulation is frozen: no input is consumed and no simulated time passes. While playing without capture
 *    a toast says 'click the scene to capture the mouse' and drag-to-look works (ns-controls bindDom). Without
 *    shellRoot the scene plays at once (pre-A4 behaviour).
 *  - storage (optional Storage-like): persisted look sensitivity / invert-Y / face view (try/catch guarded).
 *  - Resizes are debounced (resizeDebounce, RESIZE_DEBOUNCE) and every reframe seeds the gaze silently.
 *  - optionalModules: { colors, bodyMap, body } (or a function returning a promise of it) instead of
 *    loadOptionalModules(); loadBody({ fetchText, sha256Hex, bodyMap }) -> { entries, meshesById } (optional) builds
 *    the full body with ns-body buildBodyRig when both exist. A body failure is shown, not fatal (the arm still runs).
 *  - qa === true: returns `qa`, the deterministic QA API (QA_METHODS; round2/U4-app-NOTES.md).
 * @returns {{ stop(), suspend(), resume(), status(), ready: Promise<{ ok: boolean, error?: string, frames?: number }>,
 *   inspect(options?): object, qa: object | null }}
 */
export function start(params = {}) {
  const {
    THREE, canvas, hudRoot, manifestUrl, packetBases, movementMapUrl, fetchText, sha256Hex, placeholder = false,
    expectedSha256 = PINNED_SHA256, activityOptions = {}, controlsOptions = {}, armOptions = {},
    shellRoot = null, storage = null, qa = false, resizeDebounce = RESIZE_DEBOUNCE, optionalModules = null, loadBody = null, streamBody = null,
    fetchBytes = null, sha256HexBytes = null
  } = params || {};
  if (!THREE || (typeof THREE !== 'object' && typeof THREE !== 'function')) fail('app_args', 'THREE must be injected: start({ THREE, ... })');
  if (!canvas || typeof canvas.addEventListener !== 'function' || !canvas.ownerDocument || !canvas.ownerDocument.defaultView) {
    fail('app_args', 'canvas must be a canvas element attached to a document with a window');
  }
  if (loadBody !== null && typeof loadBody !== 'function') fail('app_args', 'loadBody must be a function');
  if (streamBody !== null && typeof streamBody !== 'function') fail('app_args', 'streamBody must be a function');
  const doc = canvas.ownerDocument;
  const view = doc.defaultView;
  if (typeof view.requestAnimationFrame !== 'function') fail('app_args', 'the canvas window must provide requestAnimationFrame');
  const hud = createHud(hudRoot);
  const isPlaceholder = placeholder === true;
  const qaEnabled = qa === true;
  const useShell = Boolean(shellRoot);
  hud.render(hudStatic({ placeholder: isPlaceholder, shell: useShell }));

  const perf = view.performance && typeof view.performance.now === 'function' ? view.performance : null;
  const clockMs = () => (perf ? perf.now() : Date.now());
  let stopped = false, failed = false, raf = 0, unbind = null, scene = null;
  let phase = 'loading', lastError = null;
  let current = { sim: null, data: null, state: null, controls: null, out: null };

  // Game shell and loop state. `tick` is installed by run() once the scene data exist.
  let settings = loadSettings(storage);
  // R4-text (D7): the "Try this" guide (pure state machine, ns-guide). Never pauses or blocks play.
  let guide = NG.guideFromStorage((() => { try { return storage && typeof storage.getItem === 'function' ? storage.getItem(NG.GUIDE_STORAGE_KEY) : null; } catch { return null; } })(), 0);
  const saveGuide = () => { try { if (storage && typeof storage.setItem === 'function') storage.setItem(NG.GUIDE_STORAGE_KEY, JSON.stringify(NG.guideToStorage(guide))); } catch { /* storage blocked */ } };
  let shellState = createShellState({ autoPlay: !useShell });
  let shell = null;
  let tick = null, controlsApi = null, cs = null, sim = null, simState = null;
  let lastMs = null, frames = 0, renderRequested = false, appliedSize = null, seedNext = false;
  const orbitQueue = [];
  let mods = { colors: null, bodyMap: null, body: null, errors: {} };
  let bodyRig = null, bodyBaked = null, bodyPosed = null, bodyNote = '', brainModeNote = null, anatomy = null, eyeNote = null, bodyFrameKey = null, bodyAnchor = 'pelvis';
  let infoModel = null, infoLastRegion = null, infoSig = null, infoRenderer = null;
  let slowState = null, slowLastMs = null; // R4-integrator: slow-computer note (stepSlowNotice) over live frames only
  let guideBox = null, guideBoxAt = -Infinity, guideCovered = false, guideClear = 0; // R4-integrator: guide vs brain
  let guideHandPx = null; // R4-polish: last frame's hand boxes (CSS px) for the guide chip
  let guideOrientPx = null; // R4-fix (RP8): last frame's orientation-label boxes (CSS px) for the guide chip
  let guideChipLast = null, guideChipGoal = null; // R4-fix (RP9): the chip's spot for the current goal
  let guideBlankUntil = -Infinity; // R4-fix (M3): no re-show before this frame after a blank
  const holds = new Set();          // reasons the real-time loop is held: 'qa' (QA pause/step), 'lifecycle' (pagehide)
  const frameWaiters = [];
  let qaClockMs = null, qaLookPending = false;
  let settleReady = null;
  const firstFrame = new Promise(resolve => { settleReady = resolve; });
  const settle = value => { if (settleReady) { const r = settleReady; settleReady = null; r(value); } };
  // R4-load: the first frame with the arm and brain (the body may still be streaming); `ready` keeps meaning "everything
  // is loaded and drawn". performance marks 'ns:first-frame' and 'ns:body-complete' time both.
  let settleFirstView = null;
  const firstView = new Promise(resolve => { settleFirstView = resolve; });
  const markPerf = name => { try { if (perf && typeof perf.mark === 'function') perf.mark(name); } catch { /* marks are advisory */ } };
  let bodyStream = null, bodyStreaming = false, bodyFinished = false;
  const flushWaiters = () => { for (const w of frameWaiters.splice(0)) w(); };
  const lockedNow = () => doc.pointerLockElement === canvas;
  const exitLock = () => {
    if (lockedNow() && typeof doc.exitPointerLock === 'function') {
      try { doc.exitPointerLock(); } catch { /* already released */ }
    }
  };
  const sceneFn = name => (scene && typeof scene[name] === 'function' ? scene[name] : null);
  const callScene = (name, ...args) => {
    const fn = sceneFn(name);
    if (!fn) return undefined;
    return fn.apply(scene, args);
  };

  function setStatus(text) {
    hud.render({ status: text });
    if (shell) shell.setStatus(text);
  }

  /** Release every held key (one space-up is queued when Space was held, so the fist opens on resume). */
  function releaseInputs() {
    if (controlsApi && cs) cs = controlsApi.blur(cs, clockMs());
  }

  // Look settings: when the controls reducer owns sensitivity / invert-Y (ns-controls setLookOptions), they are applied
  // to its state; otherwise the shell's input wrapper scales the pointer deltas (lookScale). Never both.
  let lookNative = false;
  function applyLookSettings() {
    lookNative = false;
    if (!controlsApi || !cs || typeof controlsApi.setLookOptions !== 'function') return;
    try {
      cs = controlsApi.setLookOptions(cs, { sensitivity: settings.lookSensitivity, invertY: settings.invertY });
      lookNative = true;
    } catch {
      lookNative = false; // an incompatible reducer: fall back to scaling the deltas here
    }
  }
  /** R4-integrator (D8): Picture-quality setting -> ns-scene-three setQuality (when it exists). */
  function applyQuality() {
    try { callScene('setQuality', settings.quality); } catch { /* a renderer refusal must not stop the game */ }
    renderRequested = true;
    // R4-fix (code review M1): a canvas made without edge smoothing (a saved Low) stays so until a reload.
    let q = null; try { q = sceneFn('qualityState') ? callScene('qualityState') : null; } catch { q = null; }
    const reload = Boolean(q) && q.antialias === false && q.softwareRenderer !== true && settings.quality !== 'low';
    if (shell && typeof shell.setQualityNote === 'function') shell.setQualityNote(reload ? SHELL_TEXT.qualityReload || '' : '');
  }
  /** Face-view setting -> ns-scene-three setFaceView (when it exists). */
  function applyFaceView() {
    try { callScene('setFaceView', settings.faceView); } catch { /* a renderer refusal must not stop the game */ }
    renderRequested = true;
  }

  /** ONE pause authority: the shell. Its mode is forwarded to the activity (U1 paused gate / instructions flag). */
  function syncActivityPause() {
    if (!sim || !simState || typeof sim.setPaused !== 'function') return;
    const next = sim.setPaused(simState, !shellIsPlaying(shellState));
    if (next !== simState) { simState = next; current = { ...current, state: simState }; }
  }

  function dispatch(ev) {
    const before = shellState;
    const after = shellReduce(before, ev);
    if (after === before) return;
    shellState = after;
    syncActivityPause();
    if (before.mode === 'playing' && after.mode !== 'playing') releaseInputs();
    if (after.mode === 'playing' && before.mode !== 'playing') {
      lastMs = null; // the first live frame after a frozen period has dt 0
      try { canvas.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
    }
    if (shell) shell.render(after);
  }

  /** Start / resume from the overlay click (a user gesture): leave the overlay at once and request pointer capture;
   * the click itself never activates. A refusal only shows the drag-to-look notice. */
  function requestPlay() {
    if (phase !== 'running' || failed || stopped) return;
    if (!(shellState.mode === 'intro' || shellState.mode === 'paused')) return;
    if (lockedNow()) { dispatch({ type: 'locked' }); return; }
    if (typeof canvas.requestPointerLock !== 'function') { dispatch({ type: 'lockUnavailable' }); return; }
    dispatch({ type: 'play' });
    try {
      const pending = canvas.requestPointerLock();
      // Newer browsers return a promise that rejects when the lock is refused (pointerlockerror covers the rest).
      if (pending && typeof pending.then === 'function') pending.then(undefined, () => dispatch({ type: 'lockError' }));
    } catch {
      dispatch({ type: 'lockError' });
    }
  }

  /** Esc: with the pointer captured the browser releases it (pointerlockchange pauses: the same press); otherwise the
   * shell toggles intro -> playing, playing -> paused, paused -> playing. */
  function onEscape(atMs) {
    if (phase !== 'running' || failed || stopped) return;
    if (lockedNow()) { exitLock(); return; }
    dispatch({ type: 'esc', atMs });
  }

  /** R4-arm: show or hide the information panel's More detail section (the visible region card's <details>). */
  function toggleInfoDetail() {
    if (sceneFn('toggleInfoDetail')) { try { return callScene('toggleInfoDetail'); } catch { /* fall back to the DOM */ } }
    const d = doc && typeof doc.querySelector === 'function' ? doc.querySelector('details.ns-infopanel-detail:not([hidden])') : null;
    if (!d) return false;
    d.open = !d.open;
    if (d.open) revealInfoDetail(d);
    return d.open;
  }
  /** R4-fix (review RP10): an opened More detail is scrolled into the panel's view (in portrait it opened below the
   * screen edge; at 16:9 only about two lines showed). The panel scrolls while More detail is open (CSS). */
  function revealInfoDetail(d) {
    const go = () => {
      const panel = d && typeof d.closest === 'function' ? d.closest('.ns-infopanel') : null;
      if (!panel || !d.open || typeof d.getBoundingClientRect !== 'function') return;
      const top = d.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
      panel.scrollTop = Math.max(0, top - INFO_DETAIL_CONTEXT_PX);
    };
    if (view && typeof view.requestAnimationFrame === 'function') view.requestAnimationFrame(go); else go();
  }

  function resetBody() {
    if (!sim || !simState) return false;
    simState = sim.resetBody(simState);
    seedNext = true;          // the next frame seeds the gaze silently: a reset never starts a pulse
    renderRequested = true;
    current = { ...current, state: simState };
    infoLastRegion = null;
    dispatch({ type: 'notice', text: SHELL_TEXT.bodyReset });
    return true;
  }
  function resetBrainView() {
    if (!sim || !simState) return false;
    simState = sim.resetBrainView(simState);
    seedNext = true;
    renderRequested = true;
    current = { ...current, state: simState };
    dispatch({ type: 'notice', text: SHELL_TEXT.brainReset });
    return true;
  }
  /** Queue one orbit step (R12 arrows). Scene arrows and events count only while playing; QA steps always. */
  function queueOrbit(dir, force = false) {
    const q = orbitRequest(dir);
    if (!q) return false;
    if (!force && !shellIsPlaying(shellState)) return false;
    orbitQueue.push(q.stepDeg !== null ? q : q.dir);
    return true;
  }
  // Round-2 fix F4: a mouse button held while the crosshair is on an orbit arrow (pointer captured) keeps orbiting
  // gently (ORBIT_HOLD) after the first full step; released by mouseup, pointer-lock loss, blur and pause.
  let mouseHeld = false, crossHold = null, pressSeq = 0, pressSeen = 0;
  const orbitHandler = (dir, o) => queueOrbit(o && Number.isFinite(o.stepDeg) ? { dir, stepDeg: o.stepDeg } : dir);

  if (useShell) {
    shell = createShell({
      doc,
      root: shellRoot,
      settings,
      onPlay: requestPlay,
      onPlayUnlocked: () => dispatch({ type: 'playUnlocked' }),
      onReload: () => { try { view.location.reload(); } catch { /* nothing else to do */ } },
      onResetBody: resetBody,
      onResetBrain: resetBrainView,
      onGuide: what => {
        const t = simState && Number.isFinite(simState.t) ? simState.t : 0;
        guide = what === 'restart' ? NG.restartGuide(guide, t) : guide.hidden ? NG.showGuide(guide, t) : NG.hideGuide(guide);
        saveGuide();
        if (shell) shell.setGuideHidden(guide.hidden);
      },
      onSettings: (next, persist) => {
        const faceChanged = next && next.faceView !== settings.faceView;
        const qualityChanged = next && next.quality !== settings.quality;
        settings = sanitizeSettings(next);
        applyLookSettings();
        if (faceChanged) applyFaceView();
        if (qualityChanged) applyQuality();
        if (persist) saveSettings(storage, settings);
      }
    });
    shell.render(shellState);
    shell.setGuideHidden(guide.hidden);
  }
  setStatus('Starting…');

  const pageListeners = [];
  const listen = (obj, type, fn, opts) => {
    if (!obj || typeof obj.addEventListener !== 'function') return;
    obj.addEventListener(type, fn, opts);
    pageListeners.push([obj, type, fn, opts]);
  };
  // R4-fix (review RP10): More detail opened with the mouse (free-mouse play) also scrolls into the panel's view
  // (`toggle` does not bubble, so the listener captures).
  listen(doc, 'toggle', e => { const t = e && e.target; if (t && t.open && typeof t.matches === 'function' && t.matches('details.ns-infopanel-detail')) revealInfoDetail(t); }, true);
  listen(doc, 'pointerlockchange', () => {
    const locked = lockedNow();
    if (!locked) { releaseInputs(); mouseHeld = false; crossHold = null; }
    dispatch({ type: locked ? 'locked' : 'unlocked', atMs: clockMs() });
  });
  listen(doc, 'pointerlockerror', () => dispatch({ type: 'lockError' }));
  listen(view, 'keydown', e => {
    if (!e || e.code !== 'Escape' || e.repeat === true) return;
    onEscape(clockMs());
  });
  // Orbit arrows drawn by ns-scene-three may announce clicks as a document CustomEvent.
  listen(doc, 'ns-orbit', e => { const d = e && e.detail ? e.detail : null; if (d) orbitHandler(d.dir, d); });
  listen(doc, 'mousedown', () => { if (lockedNow()) { mouseHeld = true; pressSeq += 1; } });
  listen(view, 'mouseup', e => { if (!(e && Number.isFinite(e.buttons) && e.buttons !== 0)) { mouseHeld = false; crossHold = null; } });
  listen(view, 'blur', () => { mouseHeld = false; crossHold = null; });

  function fatal(err) {
    failed = true;
    phase = 'error';
    lastError = errorText(err);
    if (raf && typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(raf);
    raf = 0;
    if (unbind) { unbind(); unbind = null; }
    if (!stopped) {
      exitLock();
      hud.render({ error: `NeuroSurge stopped: ${lastError}`, status: '' });
      dispatch({ type: 'fatal', message: lastError });
    }
    settle({ ok: false, error: lastError });
    flushWaiters();
  }

  function schedule() {
    if (raf || stopped || failed || !tick || holds.size > 0) return;
    raf = view.requestAnimationFrame(frame);
  }
  function hold(reason) {
    holds.add(reason);
    if (raf && typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(raf);
    raf = 0;
  }
  function release(reason) {
    if (!holds.delete(reason) || holds.size > 0) return;
    lastMs = null; // no catch-up: the first frame after a hold has dt 0
    schedule();
  }
  function frame(ts) {
    raf = 0;
    if (stopped || failed || !tick || holds.size > 0) return;
    try {
      tick(perf ? perf.now() : ts, false);
    } catch (err) {
      fatal(err);
      return;
    }
    schedule();
  }

  const yieldToPaint = () => new Promise(resolve => {
    if (typeof view.setTimeout === 'function') view.setTimeout(resolve, 0);
    else resolve();
  });

  /** Info overlay (R14): build the model for the current gaze and hand it to the scene's panel, the HUD's, or the
   * shell fallback panel, only when its subject or displayed activity changes. */
  function updateInfo(binding, out) {
    const model = infoOverlayModel({
      gaze: out.gaze, binding, bodyMap: sim.bodyMap, regionActivity: out.regionActivity, activatedRegions: out.activatedRegions,
      activatedActions: out.activatedActions, displayDrives: out.displayDrives, last: infoLastRegion,
      pulse: out.pulse && out.pulse.regionId ? { regionId: out.pulse.regionId, actionId: out.pulse.regionActionId } : null,
      rotationState: typeof out.rotationState === 'string' ? out.rotationState : null
    });
    if (model.mode === 'region' && model.viewed === 'now') infoLastRegion = model;
    infoModel = model;
    const sig = `${model.key}|${Number.isFinite(model.activity) ? Math.round(model.activity * 20) : '-'}|${model.activations || 0}`;
    if (sig === infoSig) return;
    infoSig = sig;
    if (sceneFn('setInfo')) { infoRenderer = 'scene.setInfo'; callScene('setInfo', model); }
    else if (typeof hud.setInfo === 'function') { infoRenderer = 'hud.setInfo'; hud.setInfo(model); }
    else if (shell) { infoRenderer = 'shell-fallback'; shell.setInfo(model); }
    else infoRenderer = null;
  }

  async function run() {
    try {
      // R4-integrator (D8): the saved Picture quality is known before the WebGL context exists (MSAA is decided then).
      // Under ?qa=1 the scene picks its own deterministic default (High on a real GPU), unless QA settings() set one.
      scene = createScene({ THREE, canvas, onOrbit: orbitHandler, ...(qaEnabled ? {} : { quality: settings.quality }) });
      if (qaEnabled && sceneFn('qualityState')) {
        // QA: the Esc page shows the mode the scene really started in (not persisted).
        try { const q = callScene('qualityState'); if (q && QUALITY_SETTING_MODES.includes(q.mode)) { settings = { ...settings, quality: q.mode }; if (shell) shell.setSettings(settings); } } catch { /* keep the saved value */ }
      }
      if (sceneFn('setOrbitHandler')) callScene('setOrbitHandler', orbitHandler);
      setStatus('Loading the movement map…');
      // R4-load: start the full-body stream now; before the first frame it reads only its priority part (the two
      // lacrimal bones that place the eye). The bulk starts after the first frame (finishBody).
      if (!isPlaceholder && streamBody) {
        bodyStream = streamBody({
          fetchText, sha256Hex,
          expectedManifestSha256: expectedSha256 && typeof expectedSha256.fullbodyManifest === 'string' ? expectedSha256.fullbodyManifest : null,
          onProgress: (n, total) => { if (!stopped && bodyStreaming) setStatus(`Loading the rest of your body ${n}/${total}…`); }
        });
      }
      const optional = typeof optionalModules === 'function' ? optionalModules() : optionalModules || loadOptionalModules();
      const [inputs, loaded] = await Promise.all([
        loadInputs({
          manifestUrl, packetBases, movementMapUrl, fetchText, sha256Hex, placeholder: isPlaceholder, expectedSha256, fetchBytes, sha256HexBytes,
          onProgress: (n, total) => { if (!stopped) setStatus(`Loading the 3D anatomy files ${n}/${total}…`); }
        }),
        Promise.resolve(optional).catch(err => ({ colors: null, bodyMap: null, body: null, errors: { all: errorText(err) } }))
      ]);
      mods = { colors: null, bodyMap: null, body: null, errors: {}, ...(loaded || {}) };
      if (stopped) return { ok: false, error: 'stopped' };
      setStatus('Getting the arm and brain ready…');
      await yieldToPaint();
      if (stopped) return { ok: false, error: 'stopped' };

      const bodyMap = bodyMapOf(mods.bodyMap);
      const data = prepareSceneData({ binding: inputs.binding, assets: inputs.assets, placeholder: isPlaceholder });
      // Region mode only when the scene can also DRAW the brain transform (what is drawn is what is picked).
      const regionPrep = sceneFn('setBrainTransform') ? prepareBrainSegmentation({ assets: inputs.assets, bodyMap })
        : { segmentation: null, brainBounds: null, reason: 'ns-scene-three has no setBrainTransform' };
      brainModeNote = regionPrep.reason;
      scene.setArm({ bones: data.bones, muscles: data.muscles, baselineDrive: restMuscleDrive(inputs.binding) });
      scene.setBrain({ glass: data.glass, focus: data.strip.focus, markers: data.strip.markers, bodyMap, segmentation: regionPrep.segmentation });
      const legendStops = legendStopsFromColors(mods.colors);
      const staticHud = () => hudStatic({ binding: inputs.binding, data, placeholder: isPlaceholder, shell: useShell, legendStops, bodyNote });
      hud.render(staticHud());

      // Full body (optional): only with an injected loader and ns-body. A failure is shown, never silent, never fatal.
      let body = null;
      const bodyModule = Boolean(mods.body && typeof mods.body.buildBodyRig === 'function');
      if (bodyStream && !bodyModule) { bodyStream.cancel(); bodyStream = null; }
      let eyeMeshes = null;
      if (bodyStream) eyeMeshes = await bodyStream.priority;
      if (stopped) return { ok: false, error: 'stopped' };
      if (!bodyStream && loadBody && bodyModule) {
        try {
          const b = await loadBody({
            fetchText, sha256Hex, bodyMap,
            expectedManifestSha256: expectedSha256 && typeof expectedSha256.fullbodyManifest === 'string' ? expectedSha256.fullbodyManifest : null,
            onProgress: (n, total) => { if (!stopped) setStatus(`Loading the 3D body files ${n}/${total}…`); }
          });
          if (b && b.entries && b.meshesById) {
            setStatus('Getting the body ready…');
            await yieldToPaint();
            bodyRig = mods.body.buildBodyRig(b.entries, b.meshesById);
            // R3-body (D4): the fixed body SITS. The seated rest posture is baked into the body geometry once (about 0.3 s,
            // ns-body bakeBodyPosture); poseBody(..., { baked }) then poses relative to it. The skull stays in place, so
            // the eye below is still computed from the source meshes.
            if (typeof mods.body.bakeBodyPosture === 'function') {
              setStatus('Seating the body…');
              await yieldToPaint();
              bodyBaked = mods.body.bakeBodyPosture(bodyRig, b.meshesById, { posture: mods.body.DEFAULT_BODY_POSTURE });
            }
            body = b;
          }
        } catch (err) {
          bodyRig = null;
          bodyBaked = null;
          bodyNote = `Full body not shown: ${errorText(err)}`;
          hud.render(staticHud());
        }
        if (stopped) return { ok: false, error: 'stopped' };
      }
      // First-person eye and the anatomical left-shoulder attachment (U3a): the eye from the skull's lacrimal bones
      // (full body), else the brain, else an offset from the shoulder; the arm then hangs from the body-fixed shoulder.
      if (!isPlaceholder) {
        try {
          const fullbody = new Map();
          if (body) for (const e of body.entries) { const m = body.meshesById.get(e.element_id); if (m) fullbody.set(e.element_id, { entry: e, positions: m.positions }); }
          else if (eyeMeshes) for (const [id, v] of eyeMeshes) fullbody.set(id, v); // R4-load: same eye as the whole body
          const eye = eyePosition({ fullbody, brain: inputs.assets && inputs.assets.brain, shoulderBp: data.rig.pivots.shoulder });
          anatomy = armAnatomy(data.rig, eye);
          eyeNote = `${eye.source} (±${eye.uncertaintyMm} mm display estimate)`;
        } catch (err) {
          anatomy = null;
          eyeNote = `camera-fixed shoulder fallback: ${errorText(err)}`;
        }
      }
      if (body && bodyRig) {
        try {
          const bodyToWorld = anatomy ? armAttachment(anatomy, { yaw: 0, pitch: 0 }).bodyToWorld : null;
          // R3-body: draw the baked (seated) geometry; poseBody(..., { baked }) matrices are relative to it.
          const drawMeshes = bodyBaked ? bodyBaked.meshesById : body.meshesById;
          callScene('setBody', bodyToWorld ? { entries: body.entries, meshesById: drawMeshes, bodyToWorld } : { entries: body.entries, meshesById: drawMeshes });
        } catch (err) {
          bodyRig = null;
          bodyNote = `Full body not shown: ${errorText(err)}`;
          hud.render(staticHud());
        }
      }

      sim = createSimulation({
        rig: data.rig, boxes: data.boxes, strip: data.strip, binding: inputs.binding, activityOptions, bodyMap,
        armOptions: anatomy ? { ...GAME_ARM_OPTIONS, ...(armOptions || {}) } : armOptions,
        segmentation: regionPrep.segmentation, brainBounds: regionPrep.brainBounds, anatomy
      });
      if (sim.regionMode) hud.render({ regionNote: REGION_MODE_NOTE });
      const base = createControls(controlsOptions);
      controlsApi = base;
      cs = base.state;
      // Shell gating: DOM key presses, clicks and look drive the game only while it is playing (key releases and focus
      // loss always apply, so nothing can stick); look deltas use the persisted sensitivity and invert-Y.
      const gated = Object.freeze({
        ...base,
        keyDown: (s, code, t) => (shellIsPlaying(shellState) ? base.keyDown(s, code, t) : s),
        click: (s, t) => (shellIsPlaying(shellState) ? base.click(s, t) : s),
        // R4-arm: the More detail key (ns-controls DETAIL_CODE, I) only while playing.
        toggleDetail: (s, t) => (shellIsPlaying(shellState) && typeof base.toggleDetail === 'function' ? base.toggleDetail(s, t) : s),
        pointerMove: (s, dx, dy, t) => {
          if (!shellIsPlaying(shellState)) return s;
          if (lookNative) return base.pointerMove(s, dx, dy, t);
          const k = lookScale(settings);
          return base.pointerMove(s, dx * k.x, dy * k.y, t);
        }
      });
      applyLookSettings();
      // A1 wiring: lock refusals switch the toast to the drag-to-look notice; look options go to the reducer.
      const bindOptions = { onLockError: () => dispatch({ type: 'lockError' }), onDetail: () => toggleInfoDetail() };
      if (lookNative) { bindOptions.sensitivity = settings.lookSensitivity; bindOptions.invertY = settings.invertY; }
      unbind = bindDom(canvas, gated, () => cs, s => { cs = s; }, bindOptions);
      // A binding with a status() (drag-to-look fallback) keeps the drag hint in the toast.
      if (shell) shell.setDragLook(typeof unbind.status === 'function');
      applyFaceView();
      simState = sim.initialState();
      syncActivityPause();
      const resizer = createResizeDebouncer(resizeDebounce || {});
      const announcer = createAnnouncer();
      let anchors = null, frameMs = null;
      let brainHit = false, raycastKey = null, raycastAt = -Infinity;
      let brainKey = null, bodyKey = null, bodyDriveKey = null, hoverDir = null;
      current = { sim, data, state: simState, controls: cs, out: null };

      // R4-load: after the first frame, stream the rest of the body, build its rig and seat it, then hand it to the scene.
      // The frame loop picks up bodyRig / bodyBaked on the next frame; `ready` settles on the first frame drawn with it.
      const finishBody = async () => {
        bodyStreaming = true;
        try {
          const b = await bodyStream.start();
          if (stopped) return;
          setStatus('Getting the body ready…');
          await yieldToPaint();
          const rig = mods.body.buildBodyRig(b.entries, b.meshesById);
          let baked = null;
          if (typeof mods.body.bakeBodyPosture === 'function') {
            setStatus('Seating the body…');
            await yieldToPaint();
            baked = mods.body.bakeBodyPosture(rig, b.meshesById, { posture: mods.body.DEFAULT_BODY_POSTURE });
          }
          if (stopped) return;
          const bodyToWorld = anatomy ? armAttachment(anatomy, { yaw: 0, pitch: 0 }).bodyToWorld : null;
          const drawMeshes = baked ? baked.meshesById : b.meshesById;
          callScene('setBody', bodyToWorld ? { entries: b.entries, meshesById: drawMeshes, bodyToWorld } : { entries: b.entries, meshesById: drawMeshes });
          bodyBaked = baked;
          bodyRig = rig;
          bodyKey = null;
        } catch (err) {
          bodyRig = null;
          bodyBaked = null;
          bodyNote = `Full body not shown: ${errorText(err)}`;
          hud.render(staticHud());
        } finally {
          bodyStreaming = false;
          bodyStream = null; // release the stream (it holds every source mesh); the scene and the rig keep what they use
          if (!stopped) {
            if (shell) shell.setStatus('');
            hud.render({ status: '' });
            bodyFinished = true;
            renderRequested = true; // the intro / Esc overlay freezes the loop: draw one frame with the body behind it
            // A held loop (QA pause, pagehide) draws no frame: settle at once.
            // R4-integrator: qaTime() (not clockMs()) keeps the intro timer on the QA clock while QA holds the loop.
            if (holds.size) { bodyFinished = false; markPerf('ns:body-complete'); dispatch({ type: 'introTimer', atMs: qaTime() }); settle({ ok: true, frames }); }
          }
        }
      };

      /** One frame at `now` (ms). fixed: the QA fixed clock (always live). Returns true when a frame was rendered. */
      tick = (now, fixed) => {
        // R4-integrator: the controls' UI queue (lock / Esc / More-detail-key events) is drained every frame. The shell
        // handles those through its own listeners, so the events are only discarded; undrained, the queue filled up after
        // enough pointer-lock changes and then refused the More detail key (UI_QUEUE_LIMIT; e2e S41 with real input).
        if (controlsApi && cs && typeof controlsApi.drainUiEvents === 'function') controlsApi.drainUiEvents(cs);
        if (shellState.mode === 'intro') dispatch({ type: 'tick', atMs: now }); // the 2 s instructions hide by themselves
        const lost = scene.contextLost === true;
        if (lost !== shellState.contextLost) dispatch(lost ? { type: 'contextLost', atMs: now } : { type: 'contextRestored' });
        if (lost) {
          // Rendering pauses; the wall clock keeps running, so a pulse still ends on time when rendering resumes.
          hud.render({ status: HUD_TEXT.contextLost });
          if (shell) shell.renderContext(shellState, now);
          return false;
        }
        const t0 = perf ? perf.now() : null;
        const measured = scene.measure();
        if (!(measured.width > 0 && measured.height > 0)) return false; // hidden canvas: nothing to fit or draw
        const rs = resizer.update(measured, now);
        if (rs.apply) {
          // The camera uses the same effective (narrow-layout) FOV as the simulation's fit and framing.
          scene.resize({ ...rs.apply, fovYDeg: sim.fovFor(rs.apply.width / rs.apply.height) });
          appliedSize = rs.apply;
          // R4-scene: the orbit arrows keep clear of the arm over its whole A/D x W/S range at the default look.
          if (sceneFn('setArmEnvelope') && typeof sim.armEnvelope === 'function') {
            try { callScene('setArmEnvelope', sim.armEnvelope(rs.apply.width / rs.apply.height), { width: rs.apply.width, height: rs.apply.height }); } catch { /* no envelope: the arrows keep the start-pose rule */ }
          }
        }
        const size = appliedSize;
        const live = fixed === true || shellIsPlaying(shellState);
        // Frozen (intro / Esc overlay): no input is consumed and no simulated time passes. Draw only the first frame,
        // an applied resize (a silent reframe) or an explicit render request (settings, reset).
        if (!live && frames > 0 && !rs.apply && !renderRequested) return false;
        renderRequested = false;
        const aspect = size.width / size.height;
        let timing;
        if (live) {
          // Actual elapsed wall time (monotonic performance clock; the rAF timestamp only as a fallback), or the QA
          // fixed clock in step(dtMs). A QA look injected before a fixed step is applied at the start of the step.
          timing = frameTiming(lastMs, now, controlsApi.drainEvents(cs), cs.lookMs);
          if (fixed === true && qaLookPending) timing = { ...timing, gazeAt: 0 };
          lastMs = Number.isFinite(now) ? now : null;
        } else {
          timing = { dt: 0, events: [], gazeAt: 0 };
          lastMs = null;
        }
        // Orbit arrows: queued arrow / event / QA steps, and the arrow under the CROSSHAIR (with the pointer captured
        // there is no cursor): stepFrame turns a click on it into an orbit step instead of a re-activation.
        let orbitDirs = [];
        let arrowDir = null;
        if (live) {
          if (sceneFn('orbitArrowAt')) {
            try { arrowDir = callScene('orbitArrowAt', size.width / 2, size.height / 2); } catch { arrowDir = null; }
            if (!ORBIT_DIRS.includes(arrowDir)) arrowDir = null;
          }
          if (arrowDir !== hoverDir) { hoverDir = arrowDir; try { callScene('hoverOrbitArrow', arrowDir); } catch { /* highlight only */ } }
          orbitDirs = orbitQueue.splice(0);
          // Fix F4: the hold starts on the arrow under the crosshair and keeps its direction while the button is held
          // (the arrow itself moves as the view orbits).
          // Only a press that BEGAN on an arrow starts a hold (looking across an arrow with a button held does not).
          const newPress = pressSeq !== pressSeen;
          pressSeen = pressSeq;
          if (mouseHeld && (crossHold || (newPress && arrowDir))) {
            if (!crossHold) crossHold = { dir: arrowDir, since: now, last: null };
            const r = orbitHoldSteps(crossHold, now);
            crossHold = r.hold;
            for (let i = 0; i < r.steps; i++) orbitDirs.push({ dir: crossHold.dir, stepDeg: ORBIT_HOLD.stepDeg });
          } else crossHold = null;
        } else {
          crossHold = null;
        }
        const look = live || !simState.gaze ? cs : simState.gaze;
        const stepInputs = {
          yaw: look.yaw, pitch: look.pitch, axes: live ? controlsApi.axes(cs) : { x: 0, z: 0 }, events: timing.events, aspect,
          gazeAt: timing.gazeAt, orbit: orbitDirs, arrow: arrowDir, glassHit: brainHit === true, silentGaze: seedNext === true,
          brainCentreNdc: brainCentreForPanel(size), viewportPx: { width: size.width, height: size.height }
        };
        const prevSim = simState;
        const step = sim.stepFrame(simState, stepInputs, timing.dt);
        seedNext = false;
        simState = step.state;
        const out = step.out;
        // R4-text (D7): the "Try this" guide follows real events of this frame (one pure call; never blocks play).
        const nextGuide = NG.guideStep(guide, NG.guideEventsFromFrame({ prev: prevSim, next: simState, out, inputs: stepInputs, bodyMap }), simState.t);
        if (nextGuide !== guide) { const saveNow = NG.goalsDone(nextGuide) !== NG.goalsDone(guide); guide = nextGuide; if (saveNow) saveGuide(); }
        scene.setView(look.yaw, look.pitch);
        // The body (and the face layer) on the same eye and trunk yaw as the arm attachment.
        if (out.attachment && sceneFn('setBodyFrame')) {
          const m = out.attachment.bodyToWorld;
          const key = Array.prototype.join.call(m, ',');
          if (key !== bodyFrameKey) { bodyFrameKey = key; callScene('setBodyFrame', m); }
        }
        if (out.reframed) {
          scene.setPlacement(out.placement);
          anchors = orientationAnchors(data.strip, out.placement, aspect, out.fovYDeg);
          raycastKey = null;
        }
        // Polish-round fix: legacy / placeholder mode has no region frame, so brainTransformFor returns no transform
        // (the brain stays where frameFocus placed it); never hand the scene a null transform (it threw at start).
        if (sceneFn('setBrainTransform') && out.brainTransform) {
          // Round 3 (S37 fix): key on the transform MATRIX too, so a reframe (resize / FOV change) re-applies the drawn
          // brain; keyed on the params alone the drawn brain kept the start framing while gaze picking re-framed.
          const m = out.brainTransform && out.brainTransform.matrix;
          const key = `${JSON.stringify(out.brainParams)}|${m ? Array.prototype.join.call(m, ',') : ''}`;
          if (key !== brainKey) { brainKey = key; callScene('setBrainTransform', out.brainTransform, out.brainParams); }
        }
        scene.updatePose(out.fit.solution.matrices);
        scene.updateMuscles(out.muscle, out.rotationMuscles || null);
        scene.updateStrip(out.displayDrives);
        scene.highlightMarker(out.gaze.actionId);
        if (sceneFn('updateRegions')) {
          callScene('updateRegions', {
            regionActivity: out.regionActivity, activatedRegions: out.activatedRegions, activatedActions: out.activatedActions,
            gaze: { target: out.gaze.target, regionId: out.gaze.regionId, actionId: out.gaze.actionId, isLeftArm: out.gaze.isLeftArm, hemisphere: out.gaze.hemisphere },
            displayDrives: out.displayDrives
          });
        }
        if (bodyRig && mods.body && typeof mods.body.poseBody === 'function' && sceneFn('updateBody')) {
          // Pose only when the joint targets change; recolour whenever the muscle drives change (quantised), so a
          // drive change with unchanged targets is still shown (U2b wiring item 3).
          // ns-body bodyMuscleDrives(activeActions): the activity's active non-arm region actions (ns-actions).
          const active = typeof sim.activity.activeBodyActions === 'function' ? sim.activity.activeBodyActions(simState.activity) : [];
          // R3-body: absolute joint targets on top of the seated rest (ns-body bodyPostureTargets; with the anatomical
          // posture it equals out.bodyJointTargets exactly).
          const targets = bodyBaked && typeof mods.body.bodyPostureTargets === 'function'
            ? mods.body.bodyPostureTargets(active, { posture: bodyBaked }) : (out.bodyJointTargets || {});
          const key = JSON.stringify(targets);
          const drives = typeof mods.body.bodyMuscleDrives === 'function' ? mods.body.bodyMuscleDrives(active) : null;
          const dkey = drives ? Object.keys(drives).sort().map(k => `${k}:${Math.round(drives[k] * 256)}`).join(',') : '';
          if (key !== bodyKey) {
            bodyKey = key;
            bodyDriveKey = dkey;
            callScene('updateBody', mods.body.poseBody(bodyRig, targets, bodyBaked ? { anchor: bodyAnchor, baked: bodyBaked } : { anchor: bodyAnchor }), drives);
            bodyPosed = targets;
          } else if (dkey !== bodyDriveKey) {
            bodyDriveKey = dkey;
            callScene('updateBody', null, drives);
          }
        }
        if (out.gaze.target !== 'empty') brainHit = false;
        else {
          const key = `${look.yaw}|${look.pitch}`;
          if (key !== raycastKey && simState.t - raycastAt >= BRAIN_RAYCAST_INTERVAL_S) {
            brainHit = scene.raycastBrain(look.yaw, look.pitch);
            raycastKey = key;
            raycastAt = simState.t;
          }
        }
        // R4-integrator (R4-player 1.8): a plain note while the picture rate stays very low (live frames only; QA steps
        // are not frame times). It suggests Low only when Low would draw a cheaper picture than now.
        if (live && fixed !== true) { slowState = stepSlowNotice(slowState, slowLastMs === null ? NaN : now - slowLastMs); slowLastMs = now; }
        else slowLastMs = null;
        let slowNote = '';
        if (slowState && slowState.on) {
          let q = null; try { q = sceneFn('qualityState') ? callScene('qualityState') : null; } catch { q = null; }
          const atLowest = q && Number.isFinite(q.level) && q.level >= QUALITY_LEVELS.length - 1;
          slowNote = atLowest ? HUD_TEXT.slowComputer : `${HUD_TEXT.slowComputer} ${HUD_TEXT.slowComputerTry}`;
        }
        const model = hudFrame({ binding: inputs.binding, state: simState, out, brainHit, frameMs, bodyMap, slowNote });
        // R4-integrator (D7 "never covers the brain, arrows or panel"): the brain is world-anchored and slides under the
        // top-left status card when you look right or down. While its outline, as drawn now, overlaps the guide line's
        // place in the card, the line moves to a small chip in a clear spot of the usable view (ns-scene-three
        // guideFloatSpot: off the brain and the drawn arrows; the usable view already excludes the information column /
        // band); with no clear spot it is not drawn. It goes back into the card GUIDE_COVER.clearFrames frames after
        // the brain has left its place (no flicker at the edge).
        const guideNow = shellIsPlaying(shellState) ? NG.guideView(guide, simState.t) : null;
        let guideText = guideNow ? guideNow.line : '';
        // R4-polish: the current goal reaches the scene, so the arrows can draw attention while the goal is "orbit".
        if (sceneFn('setGuideGoal')) callScene('setGuideGoal', guideNow && guideNow.visible ? guideNow.goalId : null);
        let guideFloat = null;
        if (guideText && sceneFn('brainCoversRect') && typeof hud.guideRect === 'function') {
          if (!guideBox || frames - guideBoxAt >= GUIDE_COVER.rectEveryFrames) { const r = hud.guideRect(); if (r) guideBox = r; guideBoxAt = frames; }
          const covers = r => { try { return callScene('brainCoversRect', r) === true; } catch { return false; } };
          if (guideBox && covers(guideBox)) { guideCovered = true; guideClear = 0; } else if (guideCovered && ++guideClear >= GUIDE_COVER.clearFrames) guideCovered = false;
          if (guideCovered) {
            const u = brainUsableNdc({ width: size.width, height: size.height });
            const usablePx = u ? { x0: ((u.x0 + 1) / 2) * size.width, x1: ((u.x1 + 1) / 2) * size.width, y0: ((1 - u.y1) / 2) * size.height, y1: ((1 - u.y0) / 2) * size.height } : null;
            let obs = null; try { obs = sceneFn('overlayObstacles') ? callScene('overlayObstacles') : null; } catch { obs = null; }
            const arrowsPx = (obs && Array.isArray(obs.arrows) ? obs.arrows : []).map(a => ({ x0: a.x0 * size.width, y0: a.y0 * size.height, x1: a.x1 * size.width, y1: a.y1 * size.height }));
            const hitsBox = (r, b) => r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0;
            const chipH = Number.isFinite(hud.guideFloatH) ? hud.guideFloatH : 40;
            // R4-polish: the chip also keeps off the player's hand (last frame's hand box) and, looking down at the body,
            // tries the top of the view first.
            const handPx = guideHandPx || [];
            // R4-fix (review RP8): also off the region labels and the orientation labels; (RP9) the last spot of this
            // goal first.
            const labelsPx = [...(obs && Array.isArray(obs.labelsPx) ? obs.labelsPx : []), ...(guideOrientPx || [])];
            if (guideChipGoal !== guideNow.goalId) { guideChipGoal = guideNow.goalId; guideChipLast = null; }
            guideFloat = guideFloatSpot({ usable: usablePx, chipH, preferTop: look.pitch < GUIDE_PREFER_TOP_PITCH, prefer: guideChipLast,
              clear: r => !covers(r) && !arrowsPx.some(b => hitsBox(r, b)) && !handPx.some(b => hitsBox(r, b)) && !labelsPx.some(b => hitsBox(r, b)) });
            if (guideFloat) guideChipLast = { x: guideFloat.x, y: guideFloat.y };
            // With no clear spot the line is not drawn (D7: it never covers the brain, the arrows or the panel).
            // R4-fix (code review M3): after a gap it comes back only GUIDE_COVER.reshowFrames frames later, so a look
            // sweep across the edge does not make it blink (the screen-reader copy is separate and does not repeat).
            if (!guideFloat) { guideText = ''; guideBlankUntil = frames + GUIDE_COVER.reshowFrames; }
            else if (frames < guideBlankUntil) { guideText = ''; guideFloat = null; }
          }
        } else guideCovered = false;
        hud.render({ status: '', ...model, guide: guideText, guideFloat, guideSpoken: guideNow && guideNow.visible ? guideNow.line : '' });
        updateInfo(inputs.binding, out);
        if (shell) {
          const say = announcer.update(model.gaze, now);
          if (say) shell.announce(say);
        }
        // Orientation labels (R / L / anterior / posterior): in region mode from the DRAWN brain transform (U2b
        // brainOrientationAnchors), else from the legacy band placement. The arm avoid shapes use the attached shoulder.
        const avoid = armAvoidShapes(out.fit, {
          aspect, fovYDeg: out.fovYDeg, ...(out.fit.solution && Array.isArray(out.fit.solution.shoulderCam) ? { shoulderCam: out.fit.solution.shoulderCam } : {})
        });
        // Round-2 fixes V2 / V5 / V6: region labels keep clear of the player's arm; orientation labels keep clear of the
        // orbit arrows and hide (like the arrows) while the brain is out of view.
        if (sceneFn('setLabelAvoid')) callScene('setLabelAvoid', avoid);
        const obstacles = sceneFn('overlayObstacles') ? callScene('overlayObstacles') : null;
        const orientAvoid = obstacles && obstacles.arrows.length ? { rects: [...avoid.rects, ...obstacles.arrows], ellipses: avoid.ellipses } : avoid;
        // R4-polish: the shown toast is an obstacle for the orientation labels only (not for the card placement).
        const labelRects = obstacles && Array.isArray(obstacles.toasts) ? obstacles.toasts : [];
        const ra = sim.regionMode && sceneFn('brainOrientationAnchors') ? callScene('brainOrientationAnchors') : null;
        let orientBoxes = null;
        const handRects = avoid.rects; // the hand only (orientAvoid adds the orbit-arrow boxes)
        guideHandPx = handRects.map(r => ({ x0: r.x0 * size.width, y0: r.y0 * size.height, x1: r.x1 * size.width, y1: r.y1 * size.height }));
        if (ra && obstacles && !obstacles.brainInView && frames > 0) orientBoxes = hud.placeOrientation({}, size, avoid, Number.isFinite(obstacles.infoBottom) ? { legendTopPx: obstacles.infoBottom + 12, handRects } : { handRects });
        else if (ra) {
          // R4-fix (reviews SL4-2, RP11): side labels never sit on the brain's drawn outline (viewport-fraction box).
          const brainCovers = sceneFn('brainCoversRect') ? r => { try { return callScene('brainCoversRect', { x0: r.x0 * size.width, y0: r.y0 * size.height, x1: r.x1 * size.width, y1: r.y1 * size.height }) === true; } catch { return false; } } : null;
          orientBoxes = hud.placeOrientation(scene.projectWorld(orientationCandidates(ra)), size, orientAvoid, { arrows: obstacles ? obstacles.arrows : [], handRects, labelRects, brainCovers });
        }
        else if (anchors) orientBoxes = hud.placeOrientation(scene.projectWorld(anchors), size, orientAvoid, { handRects });
        // R3-polish: region labels avoid the orientation labels placed in this same frame (labels never overlap).
        if (sceneFn('setOrientationRects')) callScene('setOrientationRects', Array.isArray(orientBoxes) ? orientBoxes : null);
        guideOrientPx = Array.isArray(orientBoxes) ? orientBoxes.filter(b => b && b.key !== 'hover') : null; // R4-fix (RP8)
        // R4-scene: the brain shows a soft glow while Space-drag holds it.
        if (sceneFn('setBrainHeld')) callScene('setBrainHeld', Boolean(out.brainView && out.brainView.grab && out.brainView.grab.active));
        // R4-scene (D8): QA step frames (fixed clock) are not frame-time samples for the quality controller.
        // R4-fix (code review F1): neither are frozen frames (intro / Esc page: a settings change, a resize or a reset
        // asks for one redraw); their 250-300 ms gaps had stepped a 60 fps GPU down to half size or the simplest meshes.
        scene.render(live && fixed !== true ? undefined : { live: false });
        frames++;
        current = { sim, data, state: simState, controls: cs, out };
        if (t0 !== null) {
          const ms = perf.now() - t0;
          frameMs = frameMs === null ? ms : 0.9 * frameMs + 0.1 * ms;
        }
        flushWaiters();
        if (frames === 1) {
          if (shell) shell.setStatus('');
          markPerf('ns:first-frame');
          if (settleFirstView) { settleFirstView({ ok: true, frames: 1 }); settleFirstView = null; }
          if (bodyStream) {
            dispatch({ type: 'ready', atMs: now, holdIntro: true });
            finishBody();
          } else {
            settle({ ok: true, frames: 1 });
            dispatch({ type: 'ready', atMs: now });
          }
        } else if (bodyFinished) {
          bodyFinished = false;
          markPerf('ns:body-complete');
          dispatch({ type: 'introTimer', atMs: now });
          settle({ ok: true, frames });
        }
        return true;
      };

      phase = 'running';
      setStatus('Rendering the first frame…');
      schedule();
      return await firstFrame;
    } catch (err) {
      fatal(err);
      return { ok: false, error: errorText(err) };
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (bodyStream) bodyStream.cancel();
    phase = failed ? 'error' : 'stopped';
    if (raf && typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(raf);
    raf = 0;
    if (unbind) { unbind(); unbind = null; }
    for (const [obj, type, fn, opts] of pageListeners.splice(0)) obj.removeEventListener(type, fn, opts);
    exitLock();
    if (scene) scene.dispose();
    hud.dispose();
    if (shell) { shell.dispose(); shell = null; }
    settle({ ok: false, error: 'stopped' });
    flushWaiters();
  }

  /** Page lifecycle (pagehide with persisted, i.e. back/forward cache): release keys and the lock, pause the shell and
   * hold the loop. resume() restarts the loop with no catch-up step. */
  function suspend() {
    if (stopped) return;
    releaseInputs();
    exitLock();
    dispatch({ type: 'pause' });
    hold('lifecycle');
  }
  function resume() {
    if (stopped) return;
    release('lifecycle');
  }
  function status() {
    return plainCopy({ phase, stopped, failed, error: lastError, frames, held: [...holds], shell: shellState });
  }

  const count = a => (Array.isArray(a) ? a.length : null);
  /** Which optional modules and scene hooks are present (plain JSON). */
  function features() {
    return {
      modules: { colors: Boolean(mods.colors), bodyMap: Boolean(bodyMapOf(mods.bodyMap)), body: Boolean(mods.body), errors: mods.errors || {} },
      sceneHooks: SCENE_HOOKS.filter(n => Boolean(sceneFn(n))),
      infoRenderer,
      bodyRig: Boolean(bodyRig),
      bodyNote: bodyNote || null,
      brainMode: sim ? (sim.regionMode ? 'region' : 'legacy') : null,
      armAttachment: sim ? (sim.anatomy ? 'anatomical (ns-arm armAttachment)' : 'camera-fixed fallback') : null,
      eye: eyeNote,
      bodyAnchor,
      brainModeNote
    };
  }
  /** Plain-JSON copy of the scene state (no live references). inspect({ meshes: true }) adds the strip focus mesh. */
  function inspect(options = {}) {
    const objects = scene ? scene.objects : null;
    let sceneInfo = null;
    if (objects) {
      const info = objects.renderer && objects.renderer.info ? objects.renderer.info : null;
      sceneInfo = {
        contextLost: scene.contextLost === true,
        glassRim: objects.glassRim || null,
        counts: { bones: count(objects.bones), muscles: count(objects.muscles), glass: count(objects.glass), markers: count(objects.markers) },
        // Which body parts are in view (ns-scene-three bodyVisibility; the face layer is drawn in its own pass).
        bodyVisibility: (() => { try { return sceneFn('bodyVisibility') ? callScene('bodyVisibility') : null; } catch { return null; } })(),
        render: info && info.render ? { calls: info.render.calls, triangles: info.render.triangles, frame: info.render.frame } : null
      };
    }
    return plainCopy({
      phase, error: lastError, placeholder: isPlaceholder, qa: qaEnabled, frames, loop: { held: [...holds] },
      shell: shellState, settings, pointerLocked: lockedNow(),
      state: current.state, controls: current.controls,
      data: sceneDataSummary(current.data, { meshes: Boolean(options && options.meshes === true) }),
      scene: sceneInfo,
      features: features()
    });
  }

  /** The activity model's own derived QA view (ns-actions snapshot(state)), when it has one. */
  function activityView() {
    if (!sim || !current.state || typeof sim.activity.snapshot !== 'function') return null;
    try { return sim.activity.snapshot(current.state.activity); } catch { return null; }
  }
  function snapshot() {
    const css = scene ? scene.measure() : null;
    const out = current.out;
    let bodyVisibility = null;
    if (sceneFn('bodyVisibility')) {
      try { bodyVisibility = callScene('bodyVisibility'); } catch { bodyVisibility = null; }
    }
    return qaSnapshot({
      phase,
      frames,
      clock: { qaPaused: holds.has('qa'), qaClockMs, held: [...holds] },
      shell: shellState,
      settings,
      pointerLocked: lockedNow(),
      viewport: {
        css,
        applied: appliedSize,
        aspect: appliedSize ? appliedSize.width / appliedSize.height : null,
        fovYDeg: out ? out.fovYDeg : null
      },
      state: current.state,
      out,
      controls: cs,
      axes: controlsApi && cs ? controlsApi.axes(cs) : null,
      bodyVisibility,
      activityView: activityView(),
      regionTargets: (() => { try { return sim && typeof sim.regionTargets === 'function' ? sim.regionTargets(current.state) : null; } catch { return null; } })(),
      info: infoModel ? { key: infoModel.key, mode: infoModel.mode, viewed: infoModel.viewed, title: infoModel.title, tag: infoModel.tag,
        regionId: infoModel.regionId, actionId: infoModel.actionId, source: infoModel.source, renderer: infoRenderer } : null,
      scene: features(),
      sceneState: (() => { try { return sceneFn('sceneState') ? callScene('sceneState') : null; } catch { return null; } })(),
      bodyPosedTargets: bodyPosed,
      guide: (() => { try { const t = simState && Number.isFinite(simState.t) ? simState.t : 0; return { ...NG.guideView(guide, t), done: NG.goalsDone(guide), hidden: guide.hidden === true, current: NG.currentGoal(guide) }; } catch { return null; } })(),
      reducedMotion: (() => { try { return typeof view.matchMedia === 'function' ? view.matchMedia('(prefers-reduced-motion: reduce)').matches : null; } catch { return null; } })(),
      brainFrame: (() => {
        const f = out && out.brainFrame;
        if (!f) return null;
        // R3-fix (review code F5): arrowOvershootNdc is not reported (the drawn arrows come from the scene's own plan, sceneState.arrowPlan).
        // R4-integrator (D5): perspectiveK and the far-eye numbers (perspective) are reported too.
        const pick = ['framing', 'fit', 'beltFit', 'limiting', 'tiltDeg', 'perspectiveK', 'perspective', 'distanceM', 'minBrainDistanceM', 'silhouetteNdc', 'usableNdc', 'allowedNdc', 'fill', 'ndcBounds'];
        return Object.fromEntries(pick.filter(k => f[k] !== undefined).map(k => [k, f[k]]));
      })()
    });
  }

  /** Resolves after the next rendered frame has been presented (one extra animation frame). While the loop is held,
   * the current state is redrawn at once (no simulation step); before the first frame it waits for it. */
  function screenshotReady() {
    return new Promise(resolve => {
      const after = () => view.requestAnimationFrame(() => resolve({ ok: !failed && !stopped, frames }));
      if (failed || stopped) { resolve({ ok: false, frames }); return; }
      const loopRunning = holds.size === 0 && Boolean(tick);
      if (frames === 0 || (loopRunning && shellIsPlaying(shellState) && !(scene && scene.contextLost))) { frameWaiters.push(after); return; }
      if (loopRunning && !(scene && scene.contextLost)) { renderRequested = true; frameWaiters.push(after); return; }
      if (scene && !scene.contextLost) scene.render({ live: false }); // a held-loop redraw is not a frame-time sample
      after();
    });
  }

  const requireLoop = () => {
    if (failed || stopped) fail('qa_state', `the scene is ${phase}`);
    if (!tick || !controlsApi || !cs) fail('qa_state', 'the scene is not running yet (await __nsQA.ready first)');
  };
  const qaTime = () => (holds.has('qa') && qaClockMs !== null ? qaClockMs : clockMs());
  const pinQaClock = () => { if (qaClockMs === null) qaClockMs = Number.isFinite(lastMs) ? lastMs : clockMs(); };

  /** Deterministic QA API (only with qa === true). Inputs go straight to the reducer (no shell gating); step(dtMs)
   * advances exactly dtMs on a fixed clock and renders one frame, whatever the shell state (the intro timer runs on
   * the same clock, so stepping 2000 ms hides the start instructions). */
  const qaApi = qaEnabled ? Object.freeze({
    /** Absolute look (rad): yaw left-positive, pitch up-positive (clamped to the controls' pitch limit). */
    setLook(yaw, pitch) {
      requireLoop();
      if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) fail('qa_input', 'setLook(yaw, pitch) needs finite radians');
      const lim = Number.isFinite(controlsApi.pitchLimitRad) ? controlsApi.pitchLimitRad : 80 * DEG;
      cs = { ...cs, yaw, pitch: clamp(pitch, -lim, lim), lookMs: qaTime() };
      if (holds.has('qa')) qaLookPending = true;
      return { yaw: cs.yaw, pitch: cs.pitch };
    },
    /** key('KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'Space' | 'Escape', down: boolean) -> the held keys. Escape down = esc(). */
    key(code, down) {
      requireLoop();
      if (typeof down !== 'boolean') fail('qa_input', 'key(code, down): down must be a boolean');
      if (code === 'Escape') {
        if (down) onEscape(qaTime());
        return plainCopy(cs.keys);
      }
      if (!CONTROL_CODES.includes(code)) fail('qa_input', `key(code, down): code must be one of ${[...CONTROL_CODES, 'Escape'].join(', ')}`);
      const t = qaTime();
      cs = down ? controlsApi.keyDown(cs, code, t) : controlsApi.keyUp(cs, code, t);
      return plainCopy(cs.keys);
    },
    /** One click (any button): re-triggers the region under the crosshair. Returns the queued event count. */
    click() {
      requireLoop();
      cs = controlsApi.click(cs, qaTime());
      return cs.events.length;
    },
    /** Hold the real-time loop and advance exactly dtMs (>= 0) on the fixed clock, rendering one frame. Inputs injected
     * since the previous step apply at its start (the look first, then clicks/Space in call order). */
    step(dtMs) {
      requireLoop();
      if (!(Number.isFinite(dtMs) && dtMs >= 0)) fail('qa_input', 'step(dtMs) needs finite milliseconds >= 0');
      hold('qa');
      pinQaClock();
      lastMs = qaClockMs;
      const target = qaClockMs + dtMs;
      let rendered = false;
      try {
        rendered = tick(target, true);
      } catch (err) {
        fatal(err);
        throw err;
      }
      qaClockMs = target;
      lastMs = target;
      qaLookPending = false;
      return { ...snapshot(), rendered };
    },
    pause() { requireLoop(); hold('qa'); pinQaClock(); return true; },
    resume() { requireLoop(); qaClockMs = null; qaLookPending = false; release('qa'); return true; },
    snapshot() { requireLoop(); return snapshot(); },
    screenshotReady,
    /** Leave the intro / Esc page and play without pointer capture (headless QA). */
    play() { requireLoop(); dispatch({ type: 'play' }); return plainCopy(shellState); },
    /** Show the Esc page as if the pointer capture had been lost. */
    showPause() { requireLoop(); dispatch({ type: 'pause' }); return plainCopy(shellState); },
    /** Press Esc (toggle the instructions / Esc page). Returns the shell state. */
    esc() { requireLoop(); onEscape(qaTime()); return plainCopy(shellState); },
    /** Queue one orbit step ('left' | 'right' | 'forward' | 'back') for the next frame, as an arrow click would;
     * stepDeg (optional) queues one held-arrow step instead. */
    orbit(dir, stepDeg) {
      requireLoop();
      if (!ORBIT_DIRS.includes(dir)) fail('qa_input', `orbit(dir): dir must be one of ${ORBIT_DIRS.join(', ')}`);
      queueOrbit(Number.isFinite(stepDeg) && stepDeg > 0 ? { dir, stepDeg } : dir, true);
      return orbitQueue.length;
    },
    /** Hold (true) or release (false) a mouse button as if the pointer were captured (fix F4 crosshair hold). */
    mouseHold(down) { requireLoop(); mouseHeld = down === true; if (mouseHeld) pressSeq += 1; else crossHold = null; return mouseHeld; },
    /** Reset body (the Esc-page action). Applied at once; the next frame is silent. Returns the snapshot. */
    resetBody() { requireLoop(); resetBody(); return snapshot(); },
    resetBrainView() { requireLoop(); resetBrainView(); return snapshot(); },
    shell() { return plainCopy(shellState); },
    /** The current far-right info-overlay model (plain JSON) or null before the first frame. */
    info() { return infoModel ? plainCopy(infoModel) : null; },
    /** settings() reads; settings({ lookSensitivity, invertY, faceView, quality }) sets (not persisted). */
    settings(next) {
      if (next !== undefined) {
        const faceChanged = next && next.faceView !== undefined && next.faceView !== settings.faceView;
        const qualityChanged = next && next.quality !== undefined && next.quality !== settings.quality;
        settings = sanitizeSettings({ ...settings, ...next });
        applyLookSettings();
        if (faceChanged) applyFaceView();
        if (qualityChanged) applyQuality();
        if (shell) shell.setSettings(settings);
      }
      return plainCopy({ ...settings, appliedBy: lookNative ? 'controls.setLookOptions' : 'shell-delta-scale' });
    }
  }) : null;

  const ready = run();

  return Object.freeze({ stop, suspend, resume, status, ready, firstView, inspect, qa: qaApi });
}
