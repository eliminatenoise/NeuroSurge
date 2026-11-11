/** NeuroSurge scene: virtual keyboard, gaze and click input state.
 *
 * WASD, Space, pointer yaw/pitch and clicks are VIRTUAL game-control inputs only. They are not real
 * neural stimulation, brain writing or neural decoding, and nothing here is a measured quantity.
 *
 * The core is DOM-free and runs in Node tests. State is plain, serializable data:
 *   { keys: { KeyW, KeyA, KeyS, KeyD, Space: boolean }, yaw: radians, pitch: radians, lookMs: number | null,
 *     events: [], ui: [], look: { sensitivity: number, invertY: boolean }, space: (the Space gesture, SPACE_GESTURE) }
 * `look` (A1-activation round 1) holds the player's look settings: `sensitivity` multiplies the base
 * sensitivityRadPerPx (1 = 0.0025 rad/px) and `invertY` flips the vertical look direction. A state without
 * `look` (older callers) uses the reducer defaults.
 *
 * U1-controls round 2. Two event queues, so a consumer that only understands the game events keeps working:
 *   events  the GAME queue, drained by drainEvents(): { type: 'click', timeMs? }
 *           | R558 (user Message 40) the Space key, read as gestures (SPACE_GESTURE): { type: 'grasp', down, behind?,
 *           safety?, timeMs? } (a hold or tap takes hold / lets go) and { type: 'turn', phase: 'step' | 'hold' | 'stop',
 *           safety?, timeMs? } (a double tap turns every limb once; held, the turn goes on slowly; let go, it stops).
 *           A release or stop produced by a safety release (blur, focus/visibility loss, Ctrl/Meta chord, pointer-lock
 *           change, Esc) carries `safety: true`. The raw { type: 'space' } key event of earlier rounds is no longer queued.
 *   ui      the UI queue, drained by drainUiEvents(): { type: 'escape' } (Esc keydown), { type: 'lock', locked }
 *           (every real pointer-lock change), and the overlay commands { type: 'orbit', dir }, { type: 'reset' },
 *           { type: 'resume' }, { type: 'pause' } (from uiCommand / `data-ns-ui` buttons). Each carries timeMs when known.
 *           ns-actions createActivity().step accepts every one of these events directly (instructions, pause,
 *           orbit and Reset body live in the activity state).
 *           R4-arm: { type: 'detail' } (the information key, DETAIL_CODE = R) asks the information panel to show or hide
 *           its More detail section. It is a page (panel) command, NOT an activity event: do not pass it to
 *           ns-actions step (which refuses unknown types); ns-app opens or closes the panel section instead (bindDom
 *           options.onDetail). Like every control it is a virtual game input: it reads nothing from the body or brain.
 * R558 (Message 40): the Space gestures (hold, tap, double tap, double tap and hold) are recognised HERE, on the input's
 * own times (timeMs), by a small pure state machine in the controls state (`space`; see SPACE_GESTURE). A hold or a tap
 * takes hold at the press itself (no wait for a possible second tap); the one timed decision without an input, "the
 * double tap is still held", is made by tickSpace(state, nowMs), which the game calls once per frame. The game tells the
 * machine what it holds and whether a turn still runs with noteSpace(state, { holding, turning }) after each frame.
 *
 * Clocks (browser-findings repair R2): every queued event carries `timeMs`, the monotonic performance-timeline time of
 * the real input (DOM event.timeStamp when it is on that timeline, else performance.now() in the handler), and
 * `lookMs` is the time of the latest look movement. ns-app places each input at its own time inside the frame
 * interval, so the 1 s pulse and the release window are measured from the input itself. Held W/A/S/D keys are an
 * aggregate STATE (axes), not events: there is no per-key causal trace of the reach movement and none is fabricated.
 * Every reducer returns a NEW state object when something changes (the same object when nothing
 * changes) and never mutates its input. drainEvents(state) is the single consuming operation: it
 * returns the queued events and empties that state's queue in place, so each event is delivered once.
 *
 * Sign conventions: yaw is left-positive about +y and pitch is up-positive, matching the ns-brain
 * camera gaze direction (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch)). Pointer right
 * (dx > 0) therefore turns the view right, and pointer down (dy > 0, screen y grows downwards)
 * tilts it down (up when invertY is set).
 *
 * R5-input (round 5, R20 / R22 / R23; lead decisions D16, D18, D19). Added state, all plain data (a state from an older
 * caller without these fields is read with the defaults):
 *   view key  E (VIEW_CODE) queues { type: 'view', seq } on the UI queue: a REQUEST to switch first person <-> third
 *           person. The camera owner decides (ns-camera toggleView, R5-camera: it may refuse, e.g. while Space drags the
 *           brain) and keeps the view state; the controls keep ONE look (state.yaw / state.pitch = the look of the active
 *           camera). On a switch the app hands the controls the camera's look with setLook (ns-camera controlsLook: the
 *           default third-person look, or the stored first-person look EXACTLY on the way back) and, optionally, the
 *           third-person pitch range with setPitchLimits (same effect as ns-camera constrainLook every frame). The mouse
 *           then turns that look with the same sensitivity and invert-Y in both views (third person: the camera boom
 *           about the body, any yaw).
 *   pitchLimits { min, max (radians), minDeg, maxDeg } | null: the pitch range pointerMove keeps (null = +/- pitchLimitDeg).
 *   pointer { x, y, timeMs } | null: the free mouse pointer in canvas CSS px (only while the pointer is NOT captured;
 *           null while captured or outside the canvas), so the 3D orbit arrows can be hovered and pressed with a free
 *           mouse (arrowPickPoint).
 *   button  { down, seq, downMs, upMs, via, x, y }: any mouse / trackpad button. seq counts presses (a press while a
 *           button is already down is the same gesture and does not count); via 'crosshair' (captured) | 'pointer'
 *           (free mouse); x / y the free pointer at the press (null when captured). Every safety release (blur,
 *           visibility, pointer-lock change, Ctrl/Meta chord, Esc) lets the button go, so no arrow hold can stick.
 * UI queue additions: { type: 'view', seq } after each E press (a camera command like 'detail', NOT an ns-actions
 * activity event: do not pass it to createActivity().step).
 * Arrows: stepArrowInput is a pure per-frame state machine for the 3D compass arrows of the brain and of the mirror
 * body (target 'brain' | 'mirror'): hover, press, hold and release from a ray pick (resolveArrowHit) and the button
 * state; a press on an arrow is one full orbit step, a held press orbits continuously after ARROW_HOLD.delayMs; the
 * brain in front of a mirror arrow blocks it (reported, never orbited). Nothing orbits without a press that began on
 * an arrow (never autonomous). Every one of these is a virtual game input as well.
 *
 * bindDom is the only function that touches the DOM; only ns-app calls it.
 */
import { DEG, clamp } from './ns-math.mjs';

/** The control codes (KeyboardEvent.code values, layout-independent). R558 (user Message 40: "So holding the spacebar,
 * get rid of F. Holding the spacebar should again be grasping"): there is no F key any more; Space grasps and turns
 * (SPACE_GESTURE). A plain F is now an ordinary key the game ignores (not prevented). */
export const CONTROL_CODES = Object.freeze(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
/** R558 (Message 40): the grasp key is Space (SPACE_GESTURE). Kept as names so older readers find the key. */
export const GRASP_CODE = 'Space';
/** The grasp key's label for the Esc page controls list and the key cap ("Space"). */
export const GRASP_KEY_LABEL = 'Space';

/** R558 (user Messages 33 and 34: "You should be able to grasp-move items even if they are behind another item." ...
 * "Same for the other controls of course."). Every control acts by default on what you SEE at the crosshair (or under
 * the free pointer); the brain's clear glass is see-through, so what is behind clear glass is what you see. A lead
 * decision refines this: the look reaches a motor area through your own body and the mirror body, and every control
 * then acts on what the look names (the area: the brain). ONE reach-behind gesture, the same for every control, acts on
 * the OTHER item on the line of sight (the next item behind the default one, or the body part in front of the area the
 * look names): HOLD SHIFT while you press. Shift + F holds, Shift + click switches on / taps, Shift + press-and-drag
 * turns, and Shift + a press on an arrow tip acts on what is behind the tip (ns-app controlTargets). Only the moment of
 * the press counts: Shift can be let go once F or the button is down (the hold or the turn goes on), so it never has to
 * be held for long.
 * Why Shift (design decision, alternatives weighed):
 *  - It is free: no control uses it (W/A/S/D, Space, E, the information key, Esc and the mouse), and a plain Shift has no browser or
 *    page meaning on the canvas. Ctrl / Meta (Cmd) start browser chords and release every key (CHORD_MODIFIER_CODES;
 *    Ctrl+click is a right click on macOS), and Alt alone opens the browser menu bar on Windows and Linux.
 *  - It is ONE rule for every control, which a timing gesture cannot be: a quick second click already restarts
 *    (recharges) a glowing area, a quick second press on an arrow tip is a second turn step, a quick second press of
 *    F would first take hold of the front item (and could move it) before the second press took the one behind, and a
 *    press-and-drag cannot be doubled at all. A held modifier changes nothing about the first press itself.
 *  - It is how "the other one" is reached in many programs (Shift-click), and it is shown on every page that lists keys.
 * Trade-offs: it needs a second hand on the keyboard (the left hand is there anyway for W/A/S/D and F); Shift + W/A/S/D
 * still move as usual (keys are read by position, not by letter); on Windows, pressing Shift five times in a row can
 * open the Sticky Keys question (only a quick string of presses does; one press per reach does not).
 * The press is marked `behind: true` (on the click, grasp and drag events and the button state); ns-app decides what
 * is behind. state.reach is true while Shift is held, only so the HUD can name the item behind ahead of the press. */
export const REACH_CODES = Object.freeze(['ShiftLeft', 'ShiftRight']);
/** The reach-behind key's label for the Esc page controls list and the key cap ("Shift"). */
export const REACH_KEY_LABEL = 'Shift';
const isReachCode = code => typeof code === 'string' && REACH_CODES.includes(code);

/** Modifier codes whose press starts a browser/OS chord: every held control key is released when one is pressed or
 * released (macOS does not deliver keyup for keys released while Cmd is held). */
export const CHORD_MODIFIER_CODES = Object.freeze(['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'OSLeft', 'OSRight']);

/** Click events are dropped once this many events are queued (a click flood between frames is
 * equivalent to one re-trigger). Grasp and turn events are never dropped: losing one could leave something held or the
 * limbs turning (R558). */
export const EVENT_QUEUE_LIMIT = 64;

/** At most this many UI events stay queued: a new event is dropped when full, except a lock change, which drops the
 * OLDEST queued event instead (the latest lock state always arrives; the queue stays bounded even if never drained). */
export const UI_QUEUE_LIMIT = 32;

/** Non-game keys bound by bindDom (KeyboardEvent.code). Escape toggles the instructions/controls overlay. */
export const UI_CODES = Object.freeze(['Escape']);

/** The information key (KeyboardEvent.code, layout independent): R for "read information" (user Message 48: "the key R
 * should replace the I key for information ... read information"). With the mouse captured there is no cursor to click
 * the panel's More detail line, so this key steps the information through its three states (ns-app toggleInfoDetail):
 * the side cards (the start), the side cards with More detail and the colour key, and everything hidden. No other
 * control uses R (W/A/S/D, E, Space, Shift, Esc and the mouse), and a plain R means nothing to the browser (Ctrl/Meta
 * chords such as Ctrl+R, reload, are left to the browser by the chord rule). A UI key, not one of CONTROL_CODES: it
 * never moves the arm or any body part. */
export const DETAIL_CODE = 'KeyR';
/** The information key's label for the Esc page controls list and the key cap ("R"). */
export const DETAIL_KEY_LABEL = 'R';

/** R5-input (R22, D18): the view key (KeyboardEvent.code, layout independent): E asks to switch between the first-person
 * view and the third-person view and back (the camera owner, ns-camera, does the switch). No other control uses it
 * (W/A/S/D, Space, I, Esc and the mouse), a plain E has no browser meaning (it is prevented, so a browser's
 * find-as-you-type cannot take it), and Ctrl/Meta chords
 * (Ctrl+E is the search bar in Chrome) and Alt+E (the browser menu on Windows and Linux) are left to the browser. Not
 * auto-repeat (holding E toggles once), not inside a text field. A UI key, not one of CONTROL_CODES: it never moves the
 * arm or any body part and releases no held key (W/A/S/D, Space and double-tap Space keep working in both views). */
export const VIEW_CODE = 'KeyE';
/** The view key's label for the Esc page controls list, the intro and the key cap ("E"). */
export const VIEW_KEY_LABEL = 'E';

/** R5-input (D16, D19): targets of the 3D compass arrows: the brain's four and the mirror body's four. */
export const ARROW_TARGETS = Object.freeze(['brain', 'mirror']);
/** R5-input: arrow directions (compass: top = forward, bottom = back, left, right); the orbit directions of ns-actions. */
export const ARROW_DIRS = Object.freeze(['forward', 'back', 'left', 'right']);
/** R5-input: what can stand in front of an arrow and catch the look and the click instead (D19: the brain in front of
 * the mirror body's arrows). */
export const ARROW_BLOCKERS = Object.freeze(['brain']);
/**
 * R5-input: click-and-hold timing for the 3D arrows (ms, degrees). A press on an arrow is ONE full orbit step at once
 * (the round-4 click step, ns-actions ORBIT.stepDeg 15 deg for the brain); while the button stays down, after delayMs a
 * small step of stepDeg follows every everyMs (1.2 deg / 100 ms = 12 deg/s), at most maxStepsPerFrame per frame (a slow
 * frame never jumps the orbit). The same values as round 4 (ns-scene-three ORBIT_HOLD; equality is unit-tested). Display
 * choices, not measured quantities.
 */
export const ARROW_HOLD = Object.freeze({ delayMs: 300, everyMs: 100, stepDeg: 1.2, maxStepsPerFrame: 5 });
/** R5-input: how a press reached an arrow: the crosshair (pointer captured) or the free mouse pointer. */
export const ARROW_PRESS_VIA = Object.freeze(['crosshair', 'pointer']);
/** R5-input (D19): a SUGGESTED plain hint for a look or a press on a mirror-body arrow that the brain covers (the text
 * owner, ns-text, may word it differently; keep it this plain). */
export const ARROW_COVERED_HINT = 'The brain is in the way. Look at the brain and hold Space to move it aside. ' +
  'Then use these arrows.';

/** Double-tap window (ms, press to press): a second Space press within this of the previous press (when that press was a
 * TAP, SPACE_GESTURE.tapMaxMs) is a DOUBLE TAP: one turn of all four limbs (R558, Message 40). A UI timing choice, not a
 * physiological constant.
 * R4-polish (R4-player 2.4): 350 -> 450 ms. A relaxed double tap (370-390 ms press to press, measured with real input)
 * did nothing and gave no feedback; desktop double-clicks usually allow about 500 ms. */
export const DOUBLE_TAP_MS = 450;

/**
 * R558 (user Message 40, which replaces the F key and the Space dance of Message 2): "I see now I gave confusing
 * instructions. So holding the spacebar, get rid of F. Holding the spacebar should again be grasping. And so should one
 * tap spacebar. But double tapping causes rotation, and double tapping and holding continues that rotation, but slowly."
 *
 * The four Space gestures (timings are UI choices, not physiological constants):
 *   HOLD        Space down for tapMaxMs (250 ms) or longer: take hold of what the crosshair is on (the brain, the mirror
 *               body or one of your limbs; the game picks it) AT THE PRESS, and let go at the key-up.
 *   TAP         Space down for less than tapMaxMs: take hold too (also at the press) and KEEP holding after the tap. The
 *               next single press lets go at ITS key-up (tap it, or hold it and let go: both let go), so "tap Space to
 *               let go" and "hold Space" never fight.
 *   DOUBLE TAP  a press within doubleTapMs (DOUBLE_TAP_MS, 450 ms, press to press) of a press that was a TAP: one turn
 *               step, every limb turns once ({ type: 'turn', phase: 'step' }, ns-dance). Whatever the first tap took is
 *               let go first ({ type: 'grasp', down: false } just before the step).
 *   DOUBLE TAP AND HOLD  that second press is still down tapMaxMs after it began ({ type: 'turn', phase: 'hold' }, sent
 *               by tickSpace): the turn goes on, slowly, until the key-up ({ type: 'turn', phase: 'stop' }); then every
 *               limb stays where it is. A double tap released sooner is just the step, which ends by itself.
 * Why these numbers: a deliberate tap is short (typical key presses last about 0.1 s), so 0.25 s leaves room for a
 * relaxed tap while a hold is clearly longer; only a TAP can begin a double tap, so a hold followed by a quick press is
 * never read as one; and the same 0.25 s splits the double tap's own press into "step" and "step, then keep turning".
 * The 450 ms window is the measured relaxed double tap (see DOUBLE_TAP_MS). Taking hold at the press (and dropping it if
 * a second tap comes) keeps HOLD instant; the cost is that the first tap of a double tap takes hold for a moment (up to
 * 0.45 s) before the step lets go of it again, which moves nothing unless the look or W/A/S/D move it in that moment.
 *
 * Grasp and turn never run together:
 *  - a double tap always lets go of what is held before the step (above);
 *  - while a turn runs (the step, or the slow turn) a Space press does not take hold: a press made during a step waits,
 *    and takes hold as soon as the step has ended if Space is still down then; a tap made during a step takes nothing
 *    (it can still be the first tap of the next double tap). A grasp would fight the turn for the same limb joints.
 * Safety releases (blur, focus or visibility loss, pointer-lock change, Esc, a Ctrl/Meta chord): whatever Space holds is
 * let go ({ type: 'grasp', down: false, safety: true }), a turn whose key is down stops where it is ({ type: 'turn',
 * phase: 'stop', safety: true }), and the tap chain ends. A grasp kept by a tap is let go as well: every one of these
 * either pauses the game (and a pause lets go of every carry in the game anyway) or takes the keys away, and a let-go
 * item simply stays where it is, so dropping it is always safe, while keeping it would leave the controls and the game
 * disagreeing about what is held after the pause.
 * Shift (the reach-behind key of Messages 33 and 34, builder GR): keyDown(..., { behind: true }) marks the grasp
 * { behind: true }, so Shift + Space holds the item behind the one in front.
 */
export const SPACE_GESTURE = Object.freeze({ tapMaxMs: 250, doubleTapMs: DOUBLE_TAP_MS });
/** The Space gesture's state (plain data, state.space):
 *   role     the current press: null (Space is up) | 'grasp' (it took hold) | 'release' (it lets go of a kept hold at
 *            its key-up) | 'turn' (a double tap) | 'wait' (pressed while a turn runs: takes hold once the turn ends)
 *   downMs   the time of the current (or last) press (ms, the input clock)
 *   grasp    'none' | 'held' (held while Space is down) | 'kept' (kept after a tap)
 *   turn     'none' | 'step' (the double tap's press is down, step or hold not decided yet) | 'hold' (the slow turn)
 *   tapMs    the press time of the last TAP, which a press within doubleTapMs makes a double tap (null: none)
 *   behind   the current press was made with the reach-behind key (Shift)
 *   holding  / turning: the game's answer after its last frame (noteSpace): it holds something / a turn still runs
 *   sentTurn a turn step was sent since the game last answered (so a press right after it cannot take hold first) */
export const noSpaceGesture = () => ({ role: null, downMs: null, grasp: 'none', turn: 'none', tapMs: null, behind: false, holding: false, turning: false, sentTurn: false });
const SPACE_ROLES = Object.freeze([null, 'grasp', 'release', 'turn', 'wait']);
/** R558 (genuine note R31: "if we click on the brain or body and if we drag it ... it will orbit, shift by how much we
 * drag"): a press that began on the brain or the mirror body and then moves this many CSS px or more is a DRAG (it
 * turns that item about its centre, in proportion to the movement); a press that moves less is a CLICK (it switches on
 * what is aimed at) and is delivered when the button is let go. The items a drag can turn. */
export const DRAG_CLICK_SLOP_PX = 5;
export const DRAG_TARGETS = Object.freeze(['brain', 'mirror', 'limb']);

/** Overlay commands accepted by uiCommand() and by `data-ns-ui` buttons under bindDom's options.uiRoot. */
export const UI_COMMANDS = Object.freeze(['orbit-left', 'orbit-right', 'orbit-forward', 'orbit-back', 'reset-body', 'resume', 'pause']);
const UI_COMMAND_EVENTS = Object.freeze({
  'orbit-left': { type: 'orbit', dir: 'left' },
  'orbit-right': { type: 'orbit', dir: 'right' },
  'orbit-forward': { type: 'orbit', dir: 'forward' },
  'orbit-back': { type: 'orbit', dir: 'back' },
  'reset-body': { type: 'reset' },
  resume: { type: 'resume' },
  pause: { type: 'pause' }
});

/** A pointer-lock request with no pointerlockchange/pointerlockerror answer counts as refused after this long (ms). */
export const LOCK_PENDING_MS = 2000;

/** Default base look sensitivity (radians per pointer pixel) and the allowed range of the `sensitivity` multiplier. */
export const DEFAULT_SENSITIVITY_RAD_PER_PX = 0.0025;
export const SENSITIVITY_RANGE = Object.freeze([0.05, 20]);

const isControlCode = code => typeof code === 'string' && CONTROL_CODES.includes(code);
const hasUiCommand = c => typeof c === 'string' && Object.prototype.hasOwnProperty.call(UI_COMMAND_EVENTS, c);
const isChordModifier = code => typeof code === 'string' && CHORD_MODIFIER_CODES.includes(code);
const releasedKeys = () => ({ KeyW: false, KeyA: false, KeyS: false, KeyD: false, Space: false });

function fail(code, message) {
  throw new Error(`ns:${code}: ${message}`);
}

function checkSensitivity(v) {
  if (!(Number.isFinite(v) && v >= SENSITIVITY_RANGE[0] && v <= SENSITIVITY_RANGE[1])) {
    fail('controls_options', `sensitivity must be a finite multiplier in [${SENSITIVITY_RANGE[0]}, ${SENSITIVITY_RANGE[1]}]`);
  }
}

/**
 * Create the input reducer API.
 * Options: sensitivityRadPerPx (base, default 0.0025), pitchLimitDeg (default 80), sensitivity (multiplier, default 1)
 * and invertY (default false); the last two are the initial `state.look` and can be changed with setLookOptions.
 * @returns {{ state, initialState, keyDown, keyUp, blur, releaseAll, pointerMove, click, axes, drainEvents,
 *   escape, lockChange, uiCommand, toggleDetail, drainUiEvents, setLookOptions, lookOptions,
 *   toggleView, setLook, setPitchLimits, pitchLimits, pointerAt, pointerLeave, buttonDown, buttonUp, tap, buttonState,
 *   sensitivityRadPerPx: number, pitchLimitRad: number, sensitivity: number, invertY: boolean }}
 *   `state` is a fresh initial state (as createActivity exposes its initial state); initialState()
 *   makes another.
 */
export function createControls({
  sensitivityRadPerPx = DEFAULT_SENSITIVITY_RAD_PER_PX, pitchLimitDeg = 80, sensitivity = 1, invertY = false
} = {}) {
  if (!(Number.isFinite(sensitivityRadPerPx) && sensitivityRadPerPx > 0)) {
    fail('controls_options', 'sensitivityRadPerPx must be a positive finite number');
  }
  if (!(Number.isFinite(pitchLimitDeg) && pitchLimitDeg >= 0 && pitchLimitDeg < 90)) {
    fail('controls_options', 'pitchLimitDeg must be a finite number in [0, 90)');
  }
  checkSensitivity(sensitivity);
  if (typeof invertY !== 'boolean') fail('controls_options', 'invertY must be a boolean');
  const sens = sensitivityRadPerPx;
  const pitchLimit = pitchLimitDeg * DEG;

  const releasedButton = () => ({ down: false, seq: 0, downMs: null, upMs: null, via: null, x: null, y: null, behind: false });
  /** R558: the press-and-drag gesture: target ('brain' | 'mirror' | 'limb' (one of your own limbs) | null), movement not yet taken by the game (dx, dy,
   * CSS px), total path length since the press (travel), turning = the press has moved far enough to be a drag, behind =
   * the press reached behind (REACH_CODES: Shift was held at the press). */
  const noDrag = () => ({ target: null, dx: 0, dy: 0, travel: 0, turning: false, behind: false });
  const dragOf = state => (state && state.drag && typeof state.drag === 'object' ? state.drag : noDrag());
  const initialState = () => ({
    keys: releasedKeys(), yaw: 0, pitch: 0, lookMs: null, events: [], ui: [], look: { sensitivity, invertY },
    pitchLimits: null, viewSeq: 0, pointer: null, button: releasedButton(), drag: noDrag(), reach: false, space: noSpaceGesture()
  });
  /** R5-input: the pitch range and the button of a state (older states without them read the defaults). */
  const limitsOf = state => {
    const l = state && state.pitchLimits;
    return l && Number.isFinite(l.min) && Number.isFinite(l.max) ? l : { min: -pitchLimit, max: pitchLimit };
  };
  const buttonOf = state => (state && state.button && typeof state.button.down === 'boolean' ? state.button : releasedButton());
  /** Event record with its input time when one is known (finite milliseconds). */
  const stamp = (ev, timeMs) => (Number.isFinite(timeMs) ? { ...ev, timeMs } : ev);

  /** Effective look settings of a state: { sensitivity, invertY, radPerPx }. */
  function lookOptions(state) {
    const look = state && state.look;
    const m = look && Number.isFinite(look.sensitivity) ? look.sensitivity : sensitivity;
    const inv = look && typeof look.invertY === 'boolean' ? look.invertY : invertY;
    return { sensitivity: m, invertY: inv, radPerPx: sens * m };
  }

  /** Change the look settings ({ sensitivity?, invertY? }); unknown keys are refused. */
  function setLookOptions(state, opts = {}) {
    if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) fail('controls_options', 'look options must be an object');
    for (const k of Object.keys(opts)) {
      if (k !== 'sensitivity' && k !== 'invertY') fail('controls_options', `unknown look option ${JSON.stringify(k)}`);
    }
    const cur = lookOptions(state);
    const next = { sensitivity: cur.sensitivity, invertY: cur.invertY };
    if (opts.sensitivity !== undefined) { checkSensitivity(opts.sensitivity); next.sensitivity = opts.sensitivity; }
    if (opts.invertY !== undefined) {
      if (typeof opts.invertY !== 'boolean') fail('controls_options', 'invertY must be a boolean');
      next.invertY = opts.invertY;
    }
    const look = state.look;
    if (look && look.sensitivity === next.sensitivity && look.invertY === next.invertY) return state;
    return { ...state, look: next };
  }

  // ---- R558 (user Message 40): the Space gestures (SPACE_GESTURE) -----------------------------------------------------
  /** The Space gesture state of a state (an older state without one reads as idle). */
  const spaceOf = state => {
    const sp = state && state.space;
    return sp && typeof sp === 'object' && SPACE_ROLES.includes(sp.role) ? sp : noSpaceGesture();
  };
  const finiteOrNull = v => (Number.isFinite(v) ? v : null);

  /** Space went down at timeMs (not a key repeat). Returns { space, out: [game events] } (see SPACE_GESTURE). */
  function spacePress(sp, timeMs, behind) {
    const t = finiteOrNull(timeMs), out = [];
    const double = t !== null && sp.tapMs !== null && t >= sp.tapMs && t - sp.tapMs <= SPACE_GESTURE.doubleTapMs;
    if (double) {
      // DOUBLE TAP: let go of whatever the first tap took (or a hold kept from before), then one turn step.
      if (sp.grasp !== 'none') out.push({ type: 'grasp', down: false });
      out.push({ type: 'turn', phase: 'step' });
      return { space: { ...sp, role: 'turn', downMs: t, grasp: 'none', turn: 'step', tapMs: null, behind: false, sentTurn: true }, out };
    }
    // A single press. With a hold kept from a tap, it is the press that lets go (at its key-up).
    if (sp.grasp === 'kept') return { space: { ...sp, role: 'release', downMs: t, tapMs: null, behind: false }, out };
    // While a turn runs (or one was just asked for) nothing is taken: the press waits for the turn to end (tickSpace).
    if (sp.turning || sp.sentTurn) return { space: { ...sp, role: 'wait', downMs: t, tapMs: null, behind }, out };
    // HOLD or TAP: take hold at once (the key-up decides whether it is kept).
    out.push(behind ? { type: 'grasp', down: true, behind: true } : { type: 'grasp', down: true });
    return { space: { ...sp, role: 'grasp', downMs: t, grasp: 'held', tapMs: null, behind }, out };
  }

  /** Space went up at timeMs. Returns { space, out } (see SPACE_GESTURE). */
  function spaceRelease(sp, timeMs) {
    const t = finiteOrNull(timeMs), out = [];
    // A press of unknown length counts as a hold (it lets go and starts no double tap).
    const tap = t !== null && sp.downMs !== null && t >= sp.downMs && t - sp.downMs < SPACE_GESTURE.tapMaxMs;
    const up = { ...sp, role: null, behind: false };
    switch (sp.role) {
      case 'grasp':
        if (tap) return { space: { ...up, grasp: 'kept', tapMs: sp.downMs }, out }; // TAP: keep holding
        out.push({ type: 'grasp', down: false });                                   // HOLD: let go
        return { space: { ...up, grasp: 'none', tapMs: null }, out };
      case 'release':
        out.push({ type: 'grasp', down: false });
        return { space: { ...up, grasp: 'none', tapMs: tap ? sp.downMs : null }, out };
      case 'turn':
        // The double tap held: the slow turn stops here. Released sooner: the step ends by itself.
        if (sp.turn === 'hold') out.push({ type: 'turn', phase: 'stop' });
        return { space: { ...up, turn: 'none', tapMs: null }, out };
      case 'wait':
        return { space: { ...up, tapMs: tap ? sp.downMs : null }, out };
      default:
        return { space: up, out };
    }
  }

  /** Press a control key. Repeats (keyboard auto-repeat) are idempotent; unknown codes are ignored. R558 (Message 40):
   * Space is read as a gesture (SPACE_GESTURE) and queues 'grasp' / 'turn' events; opts.behind true (the reach-behind
   * key, Shift, held at the press; Messages 33 and 34) marks its grasp { behind: true }. W/A/S/D queue nothing (they are
   * the axes). */
  function keyDown(state, code, timeMs, opts = {}) {
    if (!isControlCode(code) || state.keys[code]) return state;
    const keys = { ...state.keys, [code]: true };
    if (code !== 'Space') return { ...state, keys };
    const r = spacePress(spaceOf(state), timeMs, Boolean(opts && opts.behind === true));
    return { ...state, keys, space: r.space, events: r.out.length ? [...state.events, ...r.out.map(ev => stamp(ev, timeMs))] : state.events };
  }

  /** R558 (Messages 33 and 34): the reach-behind key (REACH_CODES, Shift) is held (on true) or not. Only the HUD reads
   * it (to name the item behind before the press); each press carries its own `behind` mark. */
  function setReach(state, on) {
    const v = on === true;
    return (state.reach === true) === v ? state : { ...state, reach: v };
  }

  /** Release a control key. Releasing a key that is not held does nothing. */
  function keyUp(state, code, timeMs) {
    if (!isControlCode(code) || !state.keys[code]) return state;
    const keys = { ...state.keys, [code]: false };
    if (code !== 'Space') return { ...state, keys };
    const r = spaceRelease(spaceOf(state), timeMs);
    return { ...state, keys, space: r.space, events: r.out.length ? [...state.events, ...r.out.map(ev => stamp(ev, timeMs))] : state.events };
  }

  /**
   * R558 (Message 40): the Space decisions that come from the passing of time, not from an input. Call once per frame
   * with the frame's time (the same clock as the inputs) BEFORE draining the events:
   *  - the double tap's press is still down tapMaxMs after it began: queue { type: 'turn', phase: 'hold' } (stamped at
   *    that moment), so the turn goes on slowly;
   *  - a press made while a turn ran is still down and the turn has ended (noteSpace): queue the grasp it waited for.
   * Returns the same state when nothing is due.
   */
  function tickSpace(state, nowMs) {
    const sp = spaceOf(state);
    if (!state.keys.Space || !Number.isFinite(nowMs)) return state;
    if (sp.role === 'turn' && sp.turn === 'step' && sp.downMs !== null && nowMs - sp.downMs >= SPACE_GESTURE.tapMaxMs) {
      return { ...state, space: { ...sp, turn: 'hold' }, events: [...state.events, stamp({ type: 'turn', phase: 'hold' }, sp.downMs + SPACE_GESTURE.tapMaxMs)] };
    }
    if (sp.role === 'wait' && !sp.turning && !sp.sentTurn) {
      const ev = sp.behind ? { type: 'grasp', down: true, behind: true } : { type: 'grasp', down: true };
      return { ...state, space: { ...sp, role: 'grasp', grasp: 'held' }, events: [...state.events, stamp(ev, nowMs)] };
    }
    return state;
  }

  /**
   * R558 (Message 40): the game's answer after a frame it has drawn: { holding } (something is held: one of your limbs,
   * the brain or the mirror body) and { turning } (a limb turn still runs: a double tap's step or the slow turn). A hold
   * kept from a tap that took nothing (or that the game let go of, e.g. Reset body) is forgotten, so the next tap takes
   * hold again instead of "letting go" of nothing. Call it only after frames whose events the game really applied (a
   * skipped frame hands its events on, and its answer would be out of date). Returns the same state when nothing changes.
   */
  function noteSpace(state, { holding = false, turning = false } = {}) {
    const sp = spaceOf(state);
    const h = holding === true, tu = turning === true;
    const grasp = sp.grasp === 'kept' && !h ? 'none' : sp.grasp;
    if (sp.holding === h && sp.turning === tu && sp.sentTurn === false && grasp === sp.grasp && state.space === sp) return state;
    return { ...state, space: { ...sp, holding: h, turning: tu, sentTurn: false, grasp } };
  }

  /** R558 (Message 40): a copy of the Space gesture state (SPACE_GESTURE; for the HUD and the drag rule). */
  function spaceGesture(state) {
    return { ...spaceOf(state) };
  }

  /** Focus loss (and every other safety release): clear every key. R558 (Message 40): whatever Space holds (held or kept
   * from a tap) is let go with one { type: 'grasp', down: false, safety: true }, a turn whose key is still down stops
   * where it is with one { type: 'turn', phase: 'stop', safety: true }, and the tap chain ends (see SPACE_GESTURE).
   * R5-input: a held mouse button is let go too (an orbit-arrow hold ends; the press count is kept). */
  function blur(state, timeMs) {
    const k = state.keys;
    const b = state.button;
    const held = Boolean(b && b.down === true);
    const sp = spaceOf(state);
    const spaceBusy = sp.role !== null || sp.grasp !== 'none' || sp.turn !== 'none' || sp.tapMs !== null;
    if (!(k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.Space || spaceBusy || held || dragOf(state).target !== null || state.reach === true)) return state;
    let events = state.events;
    if (sp.grasp !== 'none') events = [...events, stamp({ type: 'grasp', down: false, safety: true }, timeMs)];
    if (sp.turn !== 'none') events = [...events, stamp({ type: 'turn', phase: 'stop', safety: true }, timeMs)];
    const next = { ...state, keys: releasedKeys(), events, reach: false, space: { ...noSpaceGesture(), holding: sp.holding, turning: sp.turning, sentTurn: sp.sentTurn } };
    if (held) next.button = { ...b, down: false, upMs: Number.isFinite(timeMs) ? timeMs : b.upMs };
    if (dragOf(state).target !== null) next.drag = noDrag(); // R558: a pause, blur or lost pointer ends a drag at once
    return next;
  }

  /** R558: a press began on a drag target. Any earlier gesture is dropped. opts.behind: the press reached behind
   * (REACH_CODES); its click, if it stays a click, is marked so too. */
  function dragStart(state, target, opts = {}) {
    if (!DRAG_TARGETS.includes(target)) fail('controls_drag', `drag target must be one of ${DRAG_TARGETS.join(', ')}`);
    return { ...state, drag: { target, dx: 0, dy: 0, travel: 0, turning: false, behind: Boolean(opts && opts.behind === true) } };
  }
  /** R558: pointer movement during the press (CSS px). It becomes a drag once it has travelled DRAG_CLICK_SLOP_PX; from
   * then on (and including the px moved so far) the movement waits in dx / dy for the game (takeDrag). Never a look. */
  function dragMove(state, dx, dy) {
    const d = dragOf(state);
    if (d.target === null || !Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return state;
    const travel = d.travel + Math.hypot(dx, dy);
    return { ...state, drag: { target: d.target, dx: d.dx + dx, dy: d.dy + dy, travel, turning: d.turning || travel >= DRAG_CLICK_SLOP_PX, behind: d.behind === true } };
  }
  /** R558: the button was let go. Returns { state, click, behind }: click true = the press never became a drag, so it
   * is a click (the caller queues it, marked behind when the press reached behind). Movement not yet taken is dropped. */
  function dragEnd(state) {
    const d = dragOf(state);
    if (d.target === null) return { state, click: false, behind: false };
    return { state: { ...state, drag: noDrag() }, click: !d.turning, behind: d.behind === true };
  }
  /** R558: the game takes the drag movement gathered since the last call: { state, drag: { target, dx, dy } | null }
   * (null while there is no drag, or the press has not moved far enough yet). */
  function takeDrag(state) {
    const d = dragOf(state);
    if (d.target === null || !d.turning || (d.dx === 0 && d.dy === 0)) return { state, drag: null };
    return { state: { ...state, drag: { ...d, dx: 0, dy: 0 } }, drag: { target: d.target, dx: d.dx, dy: d.dy } };
  }
  /** R558: { target, turning } of the gesture now ({ target: null } when none). */
  function dragState(state) { const d = dragOf(state); return { target: d.target, turning: d.turning }; }

  /** Append one UI event (copy-on-write; a state without `ui` gets one). Bounded by UI_QUEUE_LIMIT (see there). */
  function pushUi(state, ev, timeMs) {
    const q = Array.isArray(state.ui) ? state.ui : [];
    if (q.length >= UI_QUEUE_LIMIT) {
      if (ev.type !== 'lock') return state;
      return { ...state, ui: [...q.slice(q.length - UI_QUEUE_LIMIT + 1), stamp(ev, timeMs)] };
    }
    return { ...state, ui: [...q, stamp(ev, timeMs)] };
  }

  /** Esc keydown: queue { type: 'escape' } (ns-actions toggles the instructions overlay / pause). An Esc keydown is
   * not a user activation, so it can never re-acquire pointer lock; the next press on the canvas does that. */
  function escape(state, timeMs) {
    return pushUi(state, { type: 'escape' }, timeMs);
  }

  /** A real pointer-lock change: queue { type: 'lock', locked } (lock loss shows the overlay and pauses). */
  function lockChange(state, locked, timeMs) {
    if (typeof locked !== 'boolean') fail('controls_ui', 'lockChange needs a boolean locked');
    return pushUi(state, { type: 'lock', locked }, timeMs);
  }

  /** Overlay command (one of UI_COMMANDS, e.g. 'orbit-left' or 'reset-body'): queue its UI event. */
  function uiCommand(state, command, timeMs) {
    if (!hasUiCommand(command)) fail('controls_ui', `unknown UI command ${JSON.stringify(command)}; expected one of ${UI_COMMANDS.join(', ')}`);
    return pushUi(state, { ...UI_COMMAND_EVENTS[command] }, timeMs);
  }

  /** R4-arm: the More detail key (DETAIL_CODE): queue { type: 'detail' } on the UI queue. Never touches the keys,
   * the game queue or the reach axes. */
  function toggleDetail(state, timeMs) {
    return pushUi(state, { type: 'detail' }, timeMs);
  }

  /** Return queued UI events in order and empty that queue in place (each event is delivered once). */
  function drainUiEvents(state) {
    const queue = state.ui;
    if (!Array.isArray(queue) || queue.length === 0) return [];
    const out = queue.slice();
    queue.length = 0;
    return out;
  }

  /** Pointer delta in pixels: yaw -= dx*rad, pitch -= dy*rad (pitch += dy*rad with invertY), where
   * rad = sensitivityRadPerPx * state.look.sensitivity; pitch clamped to +/- pitchLimit.
   * Non-finite deltas are ignored. Yaw is not wrapped or clamped.
   * R5-input: the pitch range is state.pitchLimits when set (setPitchLimits, e.g. the third-person range), else
   * +/- pitchLimit. */
  function pointerMove(state, dx, dy, timeMs) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return state;
    const { radPerPx, invertY: inv } = lookOptions(state);
    const lim = limitsOf(state);
    const yaw = state.yaw - dx * radPerPx;
    const pitch = clamp(state.pitch - (inv ? -dy : dy) * radPerPx, lim.min, lim.max);
    if (yaw === state.yaw && pitch === state.pitch) return state;
    return { ...state, yaw, pitch, lookMs: Number.isFinite(timeMs) ? timeMs : state.lookMs === undefined ? null : state.lookMs };
  }

  /** R5-input (R22, D18): the E key: queue { type: 'view', seq } (a request to switch first person <-> third person;
   * the camera owner decides and answers with setLook). Releases nothing: W/A/S/D, Space and double-tap Space keep
   * working in both views. */
  function toggleView(state, timeMs) {
    const seq = (Number.isSafeInteger(state.viewSeq) ? state.viewSeq : 0) + 1;
    return pushUi({ ...state, viewSeq: seq }, { type: 'view', seq }, timeMs);
  }

  /** R5-input: set the look { yaw, pitch } (radians) the camera hands over on a view switch (ns-camera toggleView's
   * controlsLook); pitch kept inside the current pitch range. Not a player look movement: lookMs is kept unless
   * opts.lookMs is given. Non-finite values are refused. */
  function setLook(state, look, { lookMs } = {}) {
    if (!look || !Number.isFinite(look.yaw) || !Number.isFinite(look.pitch)) fail('controls_look', 'setLook needs { yaw, pitch } in finite radians');
    const lim = limitsOf(state);
    const yaw = look.yaw + 0, pitch = clamp(look.pitch, lim.min, lim.max) + 0;
    const ms = Number.isFinite(lookMs) ? lookMs : state.lookMs === undefined ? null : state.lookMs;
    if (yaw === state.yaw && pitch === state.pitch && ms === state.lookMs) return state;
    return { ...state, yaw, pitch, lookMs: ms };
  }

  /** R5-input: the pitch range pointerMove keeps: { minDeg, maxDeg } (degrees, -90 < min <= max < 90; e.g. ns-camera
   * THIRD_PERSON.minPitchDeg / maxPitchDeg in third person) or null (back to +/- pitchLimitDeg). The current pitch is
   * moved inside the new range. R558 (ns-app HEAD_LOOK): with { relative: true } the range may reach to +/-180: the
   * look is then a head look added to a held neck / trunk offset, not a camera angle, and the app keeps the camera's
   * own pitch inside +/-80. */
  function setPitchLimits(state, limits) {
    let next = null;
    if (limits !== null && limits !== undefined) {
      const { minDeg, maxDeg } = limits, bound = limits.relative === true ? 180 : 90;
      if (!(Number.isFinite(minDeg) && Number.isFinite(maxDeg) && minDeg > -bound && minDeg <= maxDeg && maxDeg < bound)) {
        fail('controls_look', `pitch limits need -${bound} < minDeg <= maxDeg < ${bound} (degrees)`);
      }
      next = { min: minDeg * DEG, max: maxDeg * DEG, minDeg, maxDeg };
    }
    const cur = state.pitchLimits || null;
    const same = next === null ? cur === null : cur !== null && cur.min === next.min && cur.max === next.max;
    const lim = next || { min: -pitchLimit, max: pitchLimit };
    const pitch = clamp(state.pitch, lim.min, lim.max) + 0;
    if (same && pitch === state.pitch) return state;
    return { ...state, pitchLimits: next, pitch };
  }

  /** R5-input: the pitch range in use, { minDeg, maxDeg }. */
  function pitchLimits(state) {
    const l = limitsOf(state);
    if (Number.isFinite(l.minDeg) && Number.isFinite(l.maxDeg)) return { minDeg: l.minDeg, maxDeg: l.maxDeg };
    return l.min === -pitchLimit && l.max === pitchLimit ? { minDeg: -pitchLimitDeg, maxDeg: pitchLimitDeg } : { minDeg: l.min / DEG, maxDeg: l.max / DEG };
  }

  /** R5-input: the free mouse pointer at canvas CSS px (x, y) while the pointer is not captured (hover and press of the
   * 3D arrows with a free mouse). Non-finite values are ignored. */
  function pointerAt(state, x, y, timeMs) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return state;
    const p = state.pointer;
    if (p && p.x === x && p.y === y) return state;
    return { ...state, pointer: { x, y, timeMs: Number.isFinite(timeMs) ? timeMs : null } };
  }

  /** R5-input: the pointer left the canvas, or the pointer was captured (no free pointer). */
  function pointerLeave(state) {
    if (state.pointer === null || state.pointer === undefined) return state;
    return { ...state, pointer: null };
  }

  /** R5-input: a mouse / trackpad button went down. via 'crosshair' (captured) | 'pointer' (free mouse); x, y the free
   * pointer (canvas CSS px) or null. A press while a button is already down is the same gesture (unchanged state). */
  // R558 (Messages 33 and 34): behind true = the press reached behind (REACH_CODES held): it is never an arrow-tip press
  // (the app acts on what is behind the tip instead).
  function buttonDown(state, timeMs, { via = 'crosshair', x = null, y = null, behind = false } = {}) {
    if (!ARROW_PRESS_VIA.includes(via)) fail('controls_button', `via must be one of ${ARROW_PRESS_VIA.join(', ')}`);
    const b = buttonOf(state);
    if (b.down) return state;
    const px = Number.isFinite(x) ? x : null, py = Number.isFinite(y) ? y : null;
    return { ...state, button: { down: true, seq: (Number.isSafeInteger(b.seq) ? b.seq : 0) + 1, downMs: Number.isFinite(timeMs) ? timeMs : null, upMs: b.upMs, via, x: px, y: py, behind: behind === true } };
  }

  /** R5-input: every mouse / trackpad button is up. timeMs is when that state was observed: a mouseup event,
   * or the first reliable buttons===0 movement after a missed release. It does not infer the missing release time. */
  function buttonUp(state, timeMs) {
    const b = buttonOf(state);
    if (!b.down) return state;
    return { ...state, button: { ...b, down: false, upMs: Number.isFinite(timeMs) ? timeMs : b.upMs } };
  }

  /** R5-input: a press and release in one (a QA click, a tap): counts one press unless a button is already down (then
   * it is part of that held gesture and nothing changes). */
  function tap(state, timeMs, opts = {}) {
    if (buttonOf(state).down) return state;
    return buttonUp(buttonDown(state, timeMs, opts), timeMs);
  }

  /** R5-input: a copy of the button state { down, seq, downMs, upMs, via, x, y } (defaults for older states). */
  function buttonState(state) {
    return { ...buttonOf(state) };
  }

  /** Any mouse/trackpad button press: queue one click (re-triggers the action under the crosshair). R558 (Messages 33
   * and 34): opts.behind true marks a click that reaches behind (REACH_CODES held): { type: 'click', behind: true }. */
  function click(state, timeMs, opts = {}) {
    if (state.events.length >= EVENT_QUEUE_LIMIT) return state;
    return { ...state, events: [...state.events, stamp(opts && opts.behind === true ? { type: 'click', behind: true } : { type: 'click' }, timeMs)] };
  }

  /** Reach axes: x = D - A (right positive), z = W - S (forward positive); opposite keys cancel. */
  function axes(state) {
    const k = state.keys;
    return { x: (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), z: (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) };
  }

  /** Return queued [{ type: 'grasp', down, ... } | { type: 'turn', phase, ... } | { type: 'click', timeMs? }] in order and
   * empty the queue in place. */
  function drainEvents(state) {
    const queue = state.events;
    if (queue.length === 0) return [];
    const out = queue.slice();
    queue.length = 0;
    return out;
  }

  return {
    state: initialState(),
    initialState,
    keyDown,
    keyUp,
    blur,
    releaseAll: blur,
    pointerMove,
    click,
    axes,
    drainEvents,
    escape,
    lockChange,
    uiCommand,
    toggleDetail,
    drainUiEvents,
    setLookOptions,
    lookOptions,
    // R5-input
    toggleView,
    setLook,
    setPitchLimits,
    pitchLimits,
    pointerAt,
    pointerLeave,
    buttonDown,
    buttonUp,
    tap,
    buttonState,
    // R558 (R31): press-and-drag on the brain or the mirror body
    dragStart, dragMove, dragEnd, takeDrag, dragState,
    // R558 (Messages 33 and 34): the reach-behind key
    setReach,
    // R558 (Message 40): the Space gestures (SPACE_GESTURE)
    tickSpace, noteSpace, spaceGesture,
    sensitivityRadPerPx: sens,
    pitchLimitRad: pitchLimit,
    sensitivity,
    invertY
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// R5-input (R20 / R23, D16 / D19): 3D compass-arrow interaction (pure; no DOM)
// ---------------------------------------------------------------------------------------------------------------------

const isTarget = t => typeof t === 'string' && ARROW_TARGETS.includes(t);
const isDir = d => typeof d === 'string' && ARROW_DIRS.includes(d);

/**
 * R5-input: the arrow under a ray from the ordered list of things the ray hits (the scene's raycast; each hit
 * { kind: 'arrow', target, dir, distance } or { kind: 'brain', distance } (the glass brain, any part of it), other kinds
 * ignored; distance along the ray, any unit). Returns null (no arrow) or { target, dir, distance, blocked } where
 * blocked is 'brain' when the brain lies in front of a MIRROR arrow (D19: the brain catches the look and the click until
 * it is dragged away) and null otherwise. The brain's own arrows are never blocked (they sit a small gap outside the
 * brain). The nearest arrow wins; the near arm and the mirror body never block (the arm is not pickable: D16 keeps a
 * hidden arrow findable as a see-through silhouette). Pure.
 */
export function resolveArrowHit(hits) {
  if (!Array.isArray(hits)) return null;
  let arrow = null, brain = Infinity;
  for (const h of hits) {
    if (!h || typeof h !== 'object') continue;
    const d = Number.isFinite(h.distance) ? h.distance : Infinity;
    if (h.kind === 'brain') { if (d < brain) brain = d; continue; }
    if (h.kind !== 'arrow' || !isTarget(h.target) || !isDir(h.dir)) continue;
    if (arrow === null || d < arrow.distance) arrow = { target: h.target, dir: h.dir, distance: d };
  }
  if (arrow === null) return null;
  const blocked = arrow.target === 'mirror' && brain < arrow.distance ? 'brain' : null;
  return { target: arrow.target, dir: arrow.dir, distance: arrow.distance, blocked };
}

/**
 * R5-input: a normalised arrow hit { target, dir, blocked } or null. Accepts { target, dir, blocked? } (a
 * resolveArrowHit result), and the ns-mirror mirrorInputTarget result (R5-mirror's occlusion rule): { target:
 * 'mirror-arrow', dir } -> the mirror arrow; { target: 'brain', blocked: true, dir } (a mirror arrow under the brain's
 * outline) -> the mirror arrow blocked by the brain; anything else (the mirror body, nothing) -> null.
 */
export function arrowHitOf(hit) {
  if (!hit || typeof hit !== 'object') return null;
  if (hit.target === 'mirror-arrow' && isDir(hit.dir)) return { target: 'mirror', dir: hit.dir, blocked: null };
  if (hit.target === 'brain' && hit.blocked === true) return isDir(hit.dir) ? { target: 'mirror', dir: hit.dir, blocked: 'brain' } : null;
  if (!isTarget(hit.target) || !isDir(hit.dir)) return null;
  const blocked = typeof hit.blocked === 'string' && ARROW_BLOCKERS.includes(hit.blocked) ? hit.blocked : null;
  return { target: hit.target, dir: hit.dir, blocked };
}

/**
 * R5-input: where to cast the arrow-picking ray this frame (canvas CSS px): the crosshair (the canvas centre) while the
 * pointer is captured ({ locked: true }), else the free mouse pointer of the controls state when it is inside the
 * canvas, else null (nothing to pick). Returns { x, y, via: 'crosshair' | 'pointer' } or null. Pure.
 */
export function arrowPickPoint(state, { locked = false, width, height } = {}) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return null;
  if (locked === true) return { x: width / 2, y: height / 2, via: 'crosshair' };
  const p = state && state.pointer;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width || p.y > height) return null;
  return { x: p.x, y: p.y, via: 'pointer' };
}

/**
 * R5-input: where the latest PRESS happened (canvas CSS px), for picking the arrow a press began on: a free-mouse press
 * at its own pointer position (controls button x / y, recorded at mousedown), a captured press at the crosshair (the
 * canvas centre). Pass the arrow found there as stepArrowInput frame.pressHit on frames whose button.seq grew, so a
 * press is judged where it happened even if the pointer moved before the next frame (a quick press-and-drag measured
 * in harness/run-R5-input-r2-10-proto missed the arrow otherwise). Returns { x, y, via } or null. Pure.
 */
export function arrowPressPoint(state, { width, height } = {}) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return null;
  const b = state && state.button;
  if (b && b.via === 'pointer' && Number.isFinite(b.x) && Number.isFinite(b.y)) return { x: b.x, y: b.y, via: 'pointer' };
  return { x: width / 2, y: height / 2, via: 'crosshair' };
}

/** R5-input: a fresh arrow-interaction state (plain data): { hover, covered, press, seq } (see stepArrowInput). */
export function initialArrowInput() {
  return { hover: null, covered: null, press: null, seq: null };
}

/** Steps owed by a held press at `now` (ms): { steps, last } (the round-4 orbitHoldSteps rule). */
function holdStepsDue(press, now, o) {
  if (!Number.isFinite(now) || !Number.isFinite(press.since) || now - press.since < o.delayMs) return { steps: 0, last: press.last };
  const from = Number.isFinite(press.last) ? press.last : press.since + o.delayMs - o.everyMs;
  const n = Math.min(o.maxStepsPerFrame, Math.max(0, Math.floor((now - from) / o.everyMs)));
  if (n === 0) return { steps: 0, last: press.last };
  return { steps: n, last: n === o.maxStepsPerFrame ? now : from + n * o.everyMs };
}

function checkHold(o) {
  if (!o || typeof o !== 'object') fail('arrow_hold', 'hold options must be an object');
  for (const k of Object.keys(ARROW_HOLD)) {
    const v = o[k];
    const ok = k === 'maxStepsPerFrame' ? Number.isSafeInteger(v) && v >= 1 : Number.isFinite(v) && (k === 'delayMs' ? v >= 0 : v > 0);
    if (!ok) fail('arrow_hold', `${k} must be ${k === 'maxStepsPerFrame' ? 'an integer >= 1' : 'a positive finite number'}`);
  }
  return o;
}

const sameArrow = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.target === b.target && a.dir === b.dir);

/**
 * R5-input (D16, D19): one frame of the 3D compass-arrow interaction. Pure; never mutates `prev`.
 * frame: {
 *   nowMs    the frame time (the same performance clock as the button times),
 *   hit      the arrow under this frame's pick point (resolveArrowHit / arrowHitOf: { target, dir, blocked }) or null,
 *   pressHit optional: the arrow under the press point (arrowPressPoint) on a frame with new presses; presses use it
 *            instead of `hit` when it is given (null = the press was not on an arrow),
 *   button   the controls button state (controls.buttonState(cs): { down, seq, downMs, via }),
 *   playing  true while play runs (shell playing and the activity not paused); false releases everything,
 *   holdFor  optional { brain?: ARROW_HOLD-like, mirror?: ... } per-target hold timing (default `hold` for both)
 * }
 * Rules (round-4 behaviour, now for both targets): hover = the unblocked arrow under the pick point; a NEW press
 * (button.seq grew) on an unblocked arrow is one full orbit step at once and starts a press; while the button stays
 * down that press keeps its target and direction (the arrow may move under the crosshair as the view turns) and after
 * delayMs orbits by small steps (ARROW_HOLD); letting go, a pause, a blur or any safety release ends it. A press on an
 * arrow the brain covers ('blocked') orbits nothing and is reported (the click belongs to the brain: it is NOT consumed,
 * so it reaches the activity as a normal click). A press anywhere else is not an arrow press. Without a press nothing
 * ever orbits (never autonomous); presses made while not playing, and presses older than the first frame, are ignored.
 * @returns {{ state, events, orbit, consumed }}
 *   orbit     [{ target, dir, stepDeg: null (the full click step) | number (a held step), hold: boolean }] in order;
 *             ns-actions activity.orbitStep(state, dir, { target, stepDeg }) applies one (or the 'orbit' activity event
 *             { type: 'orbit', target, dir, stepDeg? }).
 *   consumed  presses taken by an arrow this frame: drop that many 'click' game events of this frame (with the pointer
 *             captured every press also queued a click), so an arrow press never re-activates a brain area.
 *   events    [{ type: 'arrowHover', target, dir } (target / dir null when the hover ends),
 *              { type: 'arrowCovered', target, dir, by } (a covered arrow is under the pick point; null target when
 *              that ends: show ARROW_COVERED_HINT), { type: 'arrowBlocked', target, dir, by, via, atMs } (a press on a
 *              covered arrow), { type: 'arrowPress', target, dir, via, atMs }, { type: 'arrowRelease', target, dir,
 *              holdSteps, held, reason: 'up' | 'pause' | 'new-press' }]
 */
export function stepArrowInput(prev, frame = {}, hold = ARROW_HOLD) {
  checkHold(hold);
  const p0 = prev && typeof prev === 'object' ? prev : initialArrowInput();
  const s = { hover: p0.hover || null, covered: p0.covered || null, press: p0.press ? { ...p0.press } : null, seq: Number.isSafeInteger(p0.seq) ? p0.seq : null };
  const events = [], orbit = [];
  let consumed = 0;
  const now = Number.isFinite(frame.nowMs) ? frame.nowMs : null;
  const b = frame.button && typeof frame.button === 'object' ? frame.button : { down: false, seq: s.seq === null ? 0 : s.seq };
  const seq = Number.isSafeInteger(b.seq) && b.seq >= 0 ? b.seq : 0;
  // The first frame only learns the press count (a press from before the machine existed never orbits).
  const presses = s.seq === null || seq < s.seq ? 0 : seq - s.seq;
  s.seq = seq;
  const holdOf = t => (frame.holdFor && frame.holdFor[t] ? checkHold(frame.holdFor[t]) : hold);
  const release = reason => {
    if (!s.press) return;
    events.push({ type: 'arrowRelease', target: s.press.target, dir: s.press.dir, holdSteps: s.press.holdSteps, held: s.press.holdSteps > 0, reason });
    s.press = null;
  };
  if (frame.playing !== true) {
    release('pause');
    if (s.hover !== null) { s.hover = null; events.push({ type: 'arrowHover', target: null, dir: null }); }
    if (s.covered !== null) { s.covered = null; events.push({ type: 'arrowCovered', target: null, dir: null, by: null }); }
    return { state: s, events, orbit, consumed };
  }
  const hit = arrowHitOf(frame.hit);
  const pHit = frame.pressHit === undefined ? hit : arrowHitOf(frame.pressHit);
  const hov = hit && hit.blocked === null ? { target: hit.target, dir: hit.dir } : null;
  if (!sameArrow(hov, s.hover)) { s.hover = hov; events.push({ type: 'arrowHover', target: hov ? hov.target : null, dir: hov ? hov.dir : null }); }
  const cov = hit && hit.blocked !== null ? { target: hit.target, dir: hit.dir, by: hit.blocked } : null;
  if (!sameArrow(cov, s.covered)) { s.covered = cov; events.push({ type: 'arrowCovered', target: cov ? cov.target : null, dir: cov ? cov.dir : null, by: cov ? cov.by : null }); }
  const via = ARROW_PRESS_VIA.includes(b.via) ? b.via : 'crosshair';
  const pressAt = Number.isFinite(b.downMs) && (now === null || b.downMs <= now) ? b.downMs : now;
  for (let i = 0; i < presses; i++) {
    // Several presses in one frame: every press but the last was already let go (a press while down is not counted).
    if (s.press) release('new-press');
    if (!pHit) continue;
    if (pHit.blocked !== null) {
      events.push({ type: 'arrowBlocked', target: pHit.target, dir: pHit.dir, by: pHit.blocked, via, atMs: pressAt });
      continue;
    }
    consumed += 1;
    s.press = { target: pHit.target, dir: pHit.dir, via, since: pressAt, last: null, holdSteps: 0 };
    events.push({ type: 'arrowPress', target: pHit.target, dir: pHit.dir, via, atMs: pressAt });
    orbit.push({ target: pHit.target, dir: pHit.dir, stepDeg: null, hold: false });
  }
  if (s.press) {
    if (b.down === true) {
      const o = holdOf(s.press.target);
      const r = holdStepsDue(s.press, now, o);
      if (r.steps > 0) {
        s.press.last = r.last;
        s.press.holdSteps += r.steps;
        for (let i = 0; i < r.steps; i++) orbit.push({ target: s.press.target, dir: s.press.dir, stepDeg: o.stepDeg, hold: true });
      }
    } else {
      release('up');
    }
  }
  return { state: s, events, orbit, consumed };
}

/** True for an element that takes typed text (input other than buttons/checkboxes/ranges, textarea, select,
 * contenteditable): keys typed there are not game keys. */
function isTextEntry(el) {
  if (!el || typeof el !== 'object') return false;
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = typeof el.type === 'string' ? el.type.toLowerCase() : 'text';
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'].includes(type);
}

/** The UI_COMMANDS entry named by the nearest data-ns-ui attribute from `el` up to (and including) `root`, else null. */
function uiCommandOf(el, root) {
  for (let node = el, depth = 0; node && depth < 16; node = node.parentNode, depth++) {
    const v = typeof node.getAttribute === 'function' ? node.getAttribute('data-ns-ui') : null;
    if (v !== null && v !== undefined) return hasUiCommand(v) ? v : null;
    if (node === root) break;
  }
  return null;
}

/**
 * Browser binding (used only by ns-app). `target` is the canvas; its ownerDocument and that
 * document's defaultView receive the keyboard, focus and pointer-lock listeners.
 *   - keydown/keyup by event.code; preventDefault for the five control keys; keyboard auto-repeat (event.repeat) is
 *     ignored, so a key released by a safety rule stays released until it is pressed again.
 *   - Chord safety: a keydown with Ctrl or Meta held, or a press/release of Ctrl/Meta itself, RELEASES EVERY KEY
 *     (queuing one space-up if Space was held) and is left to the browser. keyup is always applied.
 *   - window blur, document visibilitychange, a genuine pointer-lock loss and any notification that does not end
 *     captured release every key (and end the pointer gesture). A genuine acquisition (not captured before, captured
 *     now) ends only the pointer gesture: keys pressed between the Resume / start click and the capture being granted
 *     stay held (R558 input port; they used to be dropped). A repeated notification that capture is still active (the
 *     page holds the lock and already knew it) preserves the current input: held keys, the queues and the press / drag.
 *   - A reliable all-buttons-up observation (a mousemove with buttons === 0, captured or not) ends the pointer gesture
 *     at once: an item drag (brain, mirror body, own limb) ends without a click, an arrow press is let go, drag-to-look
 *     stops, and the button is marked up at that observation's time (the press sequence is kept, so the next real
 *     press is a new gesture). It is cancellation, not a reconstructed mouseup; keyboard keys are not touched.
 *   - Pointer lock: a press (mousedown, any button) on the canvas while it is NOT locked requests the lock; that
 *     lock-acquiring press is NOT an activation click. Presses while locked queue one click each. After the lock
 *     is refused (pointerlockerror, a rejected request, or no answer within LOCK_PENDING_MS) unlocked presses DO
 *     queue a click (fallback mode) and still retry the lock; a successful lock leaves fallback mode. A second press
 *     while a request is still pending is not counted either.
 *   - Look: mousemove uses movementX/Y while the canvas holds the lock; while NOT locked, a drag (mousemove with a
 *     button held after a press on the canvas) changes the look by the same sensitivity (dragToLook, default on).
 *   - The canvas context menu is suppressed so a secondary (right) trackpad click can act as a click.
 *   - U1-controls round 2: Escape keydown (not auto-repeat) releases every key and queues { type: 'escape' } on the UI
 *     queue; it is not prevented (the browser still exits pointer lock) and grants no user activation, so re-locking
 *     waits for the next press on the canvas. Every real pointerlockchange also queues { type: 'lock', locked }.
 *     With options.uiRoot, a click on an element (or ancestor, up to uiRoot) carrying data-ns-ui="<UI_COMMANDS entry>"
 *     queues that command (e.g. orbit arrow buttons, the Reset body and Resume buttons). Use EITHER this delegation
 *     OR your own button handlers for a given button, never both (one click would then act twice).
 *   - R4-arm: the information key (DETAIL_CODE, R) without Ctrl/Meta/Alt and not auto-repeat calls
 *     controls.toggleDetail (when present) and, when that reducer accepted it (returned a new state: a gating reducer
 *     can refuse it outside play), options.onDetail({ timeMs }). It is prevented (no page find-as-you-type) and ignored
 *     while a text field has focus. It releases nothing and is not an activation click.
 *   - R5-input: the view key (VIEW_CODE, E) works like the More detail key: without Ctrl/Meta/Alt, not auto-repeat, not
 *     in a text field and not on a start / Esc page control, it calls controls.toggleView and, when that reducer
 *     accepted it, options.onView({ timeMs }). Prevented; releases nothing; not a click.
 *   - R5-input: every press on the canvas also records controls.buttonDown (via 'crosshair' while captured, 'pointer'
 *     otherwise, with the canvas-local pointer), every full release controls.buttonUp, and every safety release lets the
 *     button go (controls.blur). While NOT captured, mousemove over the canvas records the free pointer
 *     (controls.pointerAt, canvas CSS px; the pointer over another element, or outside, is controls.pointerLeave).
 *     options.arrowAt(xCss, yCss) (truthy when a 3D orbit arrow is drawn there; the scene's ray pick) makes a free-mouse
 *     press on an arrow an ARROW PRESS: no pointer-lock request, no drag-to-look and no click (stepArrowInput turns it
 *     into the orbit step / hold); a press anywhere else behaves as before.
 * options: { onLockChange(locked: boolean), onLockError(), onDetail({ timeMs }), onView({ timeMs }), arrowAt(x, y),
 *   dragTargetAt(x, y), onBeforeSafetyRelease(), sensitivity, invertY, dragToLook = true, uiRoot }
 *   onBeforeSafetyRelease is synchronous and runs before the safety reducer fetches its state; its owner may cancel
 *   an overfull queue. The final safety release still runs if the callback throws. cancelInput does not invoke it.
 *   sensitivity / invertY, when given, are applied to the state with controls.setLookOptions at bind time.
 * @returns {() => void} unbind, which removes every listener this call added. unbind.status() returns
 *   { locked, lockFallback, dragging, arrowPress, pressDrag } for HUD feedback. unbind.cancelInput(timeMs, options)
 *   synchronously clears the binding's private pointer gesture flags and releases reducer-held input at the caller's
 *   observation time. With { discardQueued: true } (only the app's own epoch cancellation) the queued records are
 *   discarded before blur can copy them; ordinary releases keep their queues. It neither clicks nor cancels an
 *   outstanding pointer-lock request.
 */
export function bindDom(target, controls, getState, setState, options = {}) {
  if (!target || typeof target.addEventListener !== 'function') {
    fail('controls_dom', 'target must be an EventTarget (the canvas)');
  }
  if (typeof getState !== 'function' || typeof setState !== 'function') {
    fail('controls_dom', 'getState and setState must be functions');
  }
  for (const name of ['keyDown', 'keyUp', 'blur', 'pointerMove', 'click']) {
    if (!controls || typeof controls[name] !== 'function') fail('controls_dom', `controls.${name} must be a function`);
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) fail('controls_dom', 'options must be an object');
  const { onLockChange = null, onLockError = null, onDetail = null, onView = null, onBeforeSafetyRelease = null, arrowAt = null, dragTargetAt = null, sensitivity, invertY, dragToLook = true, uiRoot = null } = options;
  if (dragTargetAt !== null && typeof dragTargetAt !== 'function') fail('controls_dom', 'dragTargetAt must be a function (xCss | null, yCss | null, behind) => "brain" | "mirror" | "limb" | null');
  const canDrag = dragTargetAt !== null && typeof controls.dragStart === 'function' && typeof controls.dragMove === 'function' && typeof controls.dragEnd === 'function';
  /** R558: the item a new press would drag: asked of the game with the pointer's place, or (null, null) for the
   * crosshair while the pointer is captured. Any failure means "nothing to drag" (the press is then an ordinary click).
   * R558 (Messages 33 and 34): behind true = the press reaches behind (Shift held, REACH_CODES): the game answers with
   * the item behind the one in front. */
  const dragTarget = (p, behind = false) => {
    if (!canDrag) return null;
    try { const t = dragTargetAt(p ? p.x : null, p ? p.y : null, behind === true); return DRAG_TARGETS.includes(t) ? t : null; } catch { return null; }
  };
  /** R558 (Messages 33 and 34): Shift held at this input (the event's own modifier flag; a missing flag reads false). */
  const reachOf = e => Boolean(e && e.shiftKey === true);
  /** Keep state.reach (the HUD's preview of the item behind) in step with the Shift flag of a pointer event, so a
   * Shift pressed while the page had no focus is seen at the next mouse movement. */
  const syncReach = e => {
    if (!e || typeof e.shiftKey !== 'boolean' || typeof controls.setReach !== 'function') return;
    const s = getState();
    if ((s && s.reach === true) !== e.shiftKey) apply(st => controls.setReach(st, e.shiftKey));
  };
  if (onLockChange !== null && typeof onLockChange !== 'function') fail('controls_dom', 'onLockChange must be a function');
  if (onView !== null && typeof onView !== 'function') fail('controls_dom', 'onView must be a function');
  if (onBeforeSafetyRelease !== null && typeof onBeforeSafetyRelease !== 'function') fail('controls_dom', 'onBeforeSafetyRelease must be a function');
  if (arrowAt !== null && typeof arrowAt !== 'function') fail('controls_dom', 'arrowAt must be a function (xCss, yCss) => truthy on an arrow');
  if (arrowAt !== null && typeof controls.buttonDown !== 'function') fail('controls_dom', 'controls.buttonDown is needed for arrowAt');
  if (uiRoot !== null && (typeof uiRoot !== 'object' || typeof uiRoot.addEventListener !== 'function')) {
    fail('controls_dom', 'uiRoot must be an EventTarget (the overlay root element)');
  }
  if (uiRoot !== null && typeof controls.uiCommand !== 'function') fail('controls_dom', 'controls.uiCommand is needed for uiRoot');
  if (onLockError !== null && typeof onLockError !== 'function') fail('controls_dom', 'onLockError must be a function');
  if (onDetail !== null && typeof onDetail !== 'function') fail('controls_dom', 'onDetail must be a function');
  if (typeof dragToLook !== 'boolean') fail('controls_dom', 'dragToLook must be a boolean');
  const doc = target.ownerDocument;
  const view = doc ? doc.defaultView : null;
  if (!doc || typeof doc.addEventListener !== 'function' || !view || typeof view.addEventListener !== 'function') {
    fail('controls_dom', 'target must belong to a document with a window');
  }

  const added = [];
  const on = (obj, type, fn) => { obj.addEventListener(type, fn); added.push([obj, type, fn]); };
  const perf = view.performance && typeof view.performance.now === 'function' ? view.performance : null;
  // Monotonic input time: the event's own timeStamp when it lies on the performance timeline (not in the future, not
  // implausibly old), else the handler time. Same clock as the frame loop's performance.now().
  const eventTime = e => {
    const now = perf ? perf.now() : NaN;
    const ts = e && e.timeStamp;
    if (Number.isFinite(ts) && ts > 0 && Number.isFinite(now) && ts <= now + 1 && now - ts < 60000) return ts;
    return now;
  };
  const apply = reduce => {
    const before = getState();
    const after = reduce(before);
    if (after !== before) setState(after);
  };
  // Every safety release (blur, visibility, Esc, Ctrl / Meta chords, pointer-lock changes) and the app's own epoch
  // cancellation end the binding's private gesture flags too (a drag-to-look, an arrow hold, an item press-drag), so a
  // stale flag can never make the next press a turn or swallow its click.
  const cancelBoundInput = (at, discardQueued = false) => {
    clearPointerFlags();
    apply(s => controls.blur(discardQueued ? { ...s, events: [], ui: [] } : s, at));
  };
  const releaseAll = (e, at = eventTime(e)) => {
    // A synchronous owner callback may replace the reducer state. Read it only AFTER that callback, never from a
    // stale apply() snapshot. cancelInput calls cancelBoundInput directly, so this hook cannot recurse through it.
    try { if (onBeforeSafetyRelease) onBeforeSafetyRelease(); }
    finally { cancelBoundInput(at); }
  };
  const call = (fn, ...args) => {
    if (!fn) return;
    try { fn(...args); } catch { /* a HUD callback must never break input handling */ }
  };

  if (sensitivity !== undefined || invertY !== undefined) {
    if (typeof controls.setLookOptions !== 'function') fail('controls_dom', 'controls.setLookOptions is needed for sensitivity/invertY');
    const look = {};
    if (sensitivity !== undefined) look.sensitivity = sensitivity;
    if (invertY !== undefined) look.invertY = invertY;
    apply(s => controls.setLookOptions(s, look));
  }

  const isLocked = () => doc.pointerLockElement === target;
  let locked = isLocked();
  let lockFallback = false;   // the lock was refused: unlocked presses count as clicks
  let lockPending = false;    // a request is outstanding (dedupes pointerlockerror + promise rejection)
  let lockRequestedAt = NaN;  // handler time of that request (ms); an answerless request expires after LOCK_PENDING_MS
  let dragging = false;
  let lastClient = null;
  let arrowPress = false;     // R5-input: the held free-mouse press began on a 3D arrow (no drag-to-look while it lasts)
  let pressDrag = false;      // R558: the held press began on the brain, the mirror body or an own limb (it may turn it)
  const hasButtons = typeof controls.buttonDown === 'function' && typeof controls.buttonUp === 'function';
  const hasPointer = typeof controls.pointerAt === 'function' && typeof controls.pointerLeave === 'function';
  function clearPointerFlags() {
    dragging = false;
    arrowPress = false;
    pressDrag = false;
    lastClient = null;
  }
  // A reliable all-buttons-up observation ends every pointer gesture, including an arrow press. This is GAME
  // cancellation at the observation time, not a reconstructed mouseup: drop any would-be click and keep the press
  // sequence so the next genuine down starts a new gesture. Keyboard keys (Space, W/A/S/D) are unaffected.
  function cancelPointerGesture(at) {
    clearPointerFlags();
    apply(s => {
      const next = canDrag ? controls.dragEnd(s).state : s;
      return hasButtons ? controls.buttonUp(next, at) : next;
    });
  }
  /** R5-input: the event's point in canvas CSS px (null without client coordinates or a layout box). */
  const localPoint = e => {
    if (!e || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return null;
    let r = null;
    try { r = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null; } catch { r = null; }
    if (!r || !Number.isFinite(r.left) || !Number.isFinite(r.top)) return null;
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  const onArrow = p => {
    if (!arrowAt || !p) return false;
    try { return Boolean(arrowAt(p.x, p.y)); } catch { return false; }
  };

  const lockRefused = () => {
    if (!lockPending) return;
    lockPending = false;
    lockFallback = true;
    call(onLockError);
  };
  const requestLock = () => {
    if (typeof target.requestPointerLock !== 'function') return false;
    lockPending = true;
    lockRequestedAt = perf ? perf.now() : NaN;
    try {
      const pending = target.requestPointerLock();
      // Newer browsers return a promise that rejects when the lock is refused.
      if (pending && typeof pending.then === 'function') pending.then(undefined, () => lockRefused());
    } catch {
      lockRefused();
    }
    return true;
  };

  // R4-access (D9): a key pressed on a control of the start / Esc page (button, checkbox, slider, menu, link) belongs to
  // that control: the game neither handles nor prevents it, so Space and Enter press the focused button and Space ticks
  // the checkbox. Play is paused while that page is open; the orbit arrows (outside the page) are not affected.
  const onPageControl = e => {
    const t = e && e.target;
    return !!(t && typeof t.closest === 'function' && t.closest('.ns-shell') && t.closest('button, input, select, textarea, summary, a[href]'));
  };
  on(view, 'keydown', e => {
    const code = e.code;
    if (e.ctrlKey || e.metaKey || isChordModifier(code)) {
      // A Ctrl/Meta chord: release everything (no keyup may follow on macOS) and leave the chord to the browser.
      releaseAll(e);
      return;
    }
    if (code === 'Escape') {
      // Not prevented: the browser still exits pointer lock. Held keys must not stay latched behind the pause overlay.
      if (e.repeat === true) return;
      const at = eventTime(e);
      releaseAll(e, at);
      if (typeof controls.escape === 'function') apply(s => controls.escape(s, at));
      return;
    }
    if (code === DETAIL_CODE) {
      // The information key (R). Not inside a text field (a typed "r" stays a letter there).
      if (e.altKey || isTextEntry(e.target)) return;
      e.preventDefault();
      if (e.repeat === true || typeof controls.toggleDetail !== 'function') return;
      const at = eventTime(e);
      const before = getState();
      const after = controls.toggleDetail(before, at);
      if (after !== before) { setState(after); call(onDetail, { timeMs: at }); }
      return;
    }
    if (code === VIEW_CODE) {
      // R5-input (R22): first person <-> third person. Not in a text field or on a page control (the page keeps it).
      if (e.altKey || isTextEntry(e.target) || onPageControl(e)) return;
      e.preventDefault();
      if (e.repeat === true || typeof controls.toggleView !== 'function') return;
      const at = eventTime(e);
      const before = getState();
      const after = controls.toggleView(before, at);
      if (after !== before) { setState(after); call(onView, { timeMs: at }); }
      return;
    }
    if (isReachCode(code)) {
      // R558 (Messages 33 and 34): Shift, the reach-behind key. Not prevented (a plain Shift has no page meaning, and a
      // focused page control keeps its own Shift behaviour); it only marks the presses made while it is held.
      if (e.repeat !== true && typeof controls.setReach === 'function') apply(s => controls.setReach(s, true));
      return;
    }
    if (!isControlCode(code)) return;
    if (onPageControl(e)) return;
    e.preventDefault();
    if (e.repeat === true) return;
    const at = eventTime(e);
    // R558 (Messages 33 and 34): Shift + F holds the item behind the one in front.
    apply(s => controls.keyDown(s, code, at, { behind: reachOf(e) }));
  });
  on(view, 'keyup', e => {
    const code = e.code;
    if (isChordModifier(code)) { releaseAll(e); return; }
    if (isReachCode(code)) { if (typeof controls.setReach === 'function') apply(s => controls.setReach(s, false)); return; }
    if (!isControlCode(code)) return;
    if (onPageControl(e)) return;
    e.preventDefault();
    const at = eventTime(e);
    apply(s => controls.keyUp(s, code, at));
  });
  on(view, 'blur', releaseAll);
  on(doc, 'visibilitychange', releaseAll);
  on(doc, 'pointerlockchange', e => {
    // A repeated captured notification is not a new input boundary. Keep held keys and the current gesture;
    // genuine acquisition/loss below still end the gesture, as do Escape, focus and visibility changes.
    if (isLocked() && locked) { lockPending = false; lockFallback = false; return; }
    const at = eventTime(e);
    // R558 (input port): a GENUINE acquisition (the page held no capture and now holds it, read after the owner's
    // synchronous pre-safety callback) is not a keyboard boundary: the page kept the keyboard focus the whole time, so
    // the keys' releases still arrive, and keys are only recorded while playing. It used to release every key, so W /
    // Space pressed in the moment between the Resume (or start) click and the capture being granted were dropped,
    // and stayed dropped while held (key repeats are ignored). It now ends the pointer gesture only (the free-pointer
    // press that asked for the capture). A loss of capture, and any notification that does not end captured, still
    // release everything.
    let acquired = false;
    try { if (onBeforeSafetyRelease) onBeforeSafetyRelease(); }
    finally {
      acquired = isLocked() && !locked;
      if (acquired) cancelPointerGesture(at); else cancelBoundInput(at);
    }
    lockPending = false;
    dragging = false;
    arrowPress = false;
    if (pressDrag) { pressDrag = false; apply(s => controls.dragEnd(s).state); } // R558: a lock change ends a drag, with no click
    const now = isLocked();
    if (now) lockFallback = false;
    if (now && hasPointer) apply(s => controls.pointerLeave(s)); // captured: no free pointer
    if (now !== locked) {
      locked = now;
      if (typeof controls.lockChange === 'function') apply(s => controls.lockChange(s, now, at));
      call(onLockChange, now);
    }
  });
  on(doc, 'pointerlockerror', () => lockRefused());
  on(target, 'mousedown', e => {
    const at = eventTime(e);
    // Review fix: a second button pressed while a press-and-drag is held is ignored. It used to start the gesture
    // afresh, so letting go gave a click on top of the turn already made.
    if (pressDrag) return;
    // R558 (Messages 33 and 34): Shift held at the press = the press reaches behind what is in front (its click, its
    // drag and its button state are marked; an arrow tip under the press is passed through to what is behind it).
    const behind = reachOf(e);
    syncReach(e);
    if (isLocked()) {
      // R558 (R31): a press with the crosshair on the brain, the mirror body or one of your own limbs may become a drag
      // that turns it. Its click is then held back until the button is let go (and dropped if the press became a drag).
      // Any other press (empty space, an arrow) is a click at once, exactly as before.
      const t = dragTarget(null, behind);
      if (t) { pressDrag = true; apply(s => controls.dragStart(s, t, { behind })); }
      else apply(s => controls.click(s, at, { behind }));
      if (hasButtons) apply(s => controls.buttonDown(s, at, { via: 'crosshair', behind }));
      return;
    }
    const local = localPoint(e);
    if (!behind && onArrow(local)) {
      // R5-input: a free-mouse press on a 3D orbit arrow: an arrow press only (no lock request, no drag, no click).
      if (typeof e.preventDefault === 'function') e.preventDefault();
      arrowPress = true;
      dragging = false;
      apply(s => controls.buttonDown(s, at, { via: 'pointer', x: local.x, y: local.y }));
      return;
    }
    if (hasButtons) apply(s => controls.buttonDown(s, at, { via: 'pointer', x: local ? local.x : null, y: local ? local.y : null, behind }));
    dragging = dragToLook;
    lastClient = Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? { x: e.clientX, y: e.clientY } : null;
    const canLock = typeof target.requestPointerLock === 'function';
    // A request that got neither pointerlockchange nor pointerlockerror counts as refused after LOCK_PENDING_MS.
    if (lockPending && Number.isFinite(lockRequestedAt) && Number.isFinite(at) && at - lockRequestedAt > LOCK_PENDING_MS) lockRefused();
    if (canLock && !lockFallback) {
      // The lock-acquiring press (or a repeat press while that request is pending): not an activation click.
      if (!lockPending) requestLock();
      return;
    }
    // R558 (R31), free pointer (the browser refused to capture it): a press on the brain or the mirror body may become a
    // drag that turns it instead of a drag that turns the look; its click waits for the release, as above.
    const t = dragTarget(local, behind);
    if (t) { pressDrag = true; dragging = false; apply(s => controls.dragStart(s, t, { behind })); }
    else apply(s => controls.click(s, at, { behind }));
    if (canLock && !lockPending) requestLock(); // retry (e.g. after the browser's post-Esc cooldown)
  });
  on(view, 'mouseup', e => {
    if (!(Number.isFinite(e.buttons) && e.buttons !== 0)) {
      dragging = false;
      arrowPress = false;
      const at = eventTime(e);
      if (pressDrag) {
        // R558: the press ends. One that never became a drag is a click, delivered now.
        pressDrag = false;
        let clicked = false, behindClick = false;
        apply(s => { const r = controls.dragEnd(s); clicked = r.click; behindClick = r.behind === true; return r.state; });
        if (clicked) apply(s => controls.click(s, at, { behind: behindClick }));
      }
      if (hasButtons) apply(s => controls.buttonUp(s, at));
    }
  });
  on(doc, 'mousemove', e => {
    syncReach(e); // R558 (Messages 33 and 34): the HUD's preview of the item behind follows Shift
    const at = eventTime(e);
    // A missed release (it happened outside the page, or the browser dropped it): with no button down any more, the
    // gesture ends here, before any arrow / drag branch can return and keep it armed, and whether or not this event's
    // movement is usable. The movement itself is then an ordinary look. (Covers the earlier R558 review fix for item
    // drags and extends it to arrow presses, drag-to-look and the button state.)
    if (Number.isFinite(e.buttons) && e.buttons === 0) cancelPointerGesture(at);
    if (isLocked()) {
      const dx = e.movementX, dy = e.movementY;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      // R558: while a press on the brain, the mirror body or an own limb is held, the movement turns it, not the look.
      if (pressDrag) {
        apply(s => controls.dragMove(s, dx, dy));
        return;
      }
      apply(s => controls.pointerMove(s, dx, dy, at));
      return;
    }
    if (hasPointer) {
      // R5-input: the free pointer over the canvas itself (an element above it, e.g. a panel, hides it).
      const local = e && e.target === target ? localPoint(e) : null;
      if (local && local.x >= 0 && local.y >= 0 && (!(local.w > 0) || local.x <= local.w) && (!(local.h > 0) || local.y <= local.h)) {
        apply(s => controls.pointerAt(s, local.x, local.y, at));
      } else apply(s => controls.pointerLeave(s));
    }
    if (arrowPress) return; // holding a 3D arrow never turns the look
    if (pressDrag) {
      // R558: free-pointer drag on the brain, the mirror body or an own limb (a missed release ended it above).
      let mx = e.movementX, my = e.movementY;
      const c = Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? { x: e.clientX, y: e.clientY } : null;
      if (!Number.isFinite(mx) || !Number.isFinite(my)) { if (!c || !lastClient) { lastClient = c; return; } mx = c.x - lastClient.x; my = c.y - lastClient.y; }
      lastClient = c;
      apply(s => controls.dragMove(s, mx, my));
      return;
    }
    if (!dragging) return;
    let dx = e.movementX, dy = e.movementY;
    const client = Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? { x: e.clientX, y: e.clientY } : null;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      if (!client || !lastClient) { lastClient = client; return; }
      dx = client.x - lastClient.x;
      dy = client.y - lastClient.y;
    }
    lastClient = client;
    apply(s => controls.pointerMove(s, dx, dy, at));
  });
  on(target, 'contextmenu', e => e.preventDefault());
  if (hasPointer) on(target, 'mouseleave', () => apply(s => controls.pointerLeave(s)));
  if (uiRoot !== null) {
    // Overlay buttons: data-ns-ui="orbit-left" | ... | "reset-body" | "resume" | "pause" (UI_COMMANDS).
    on(uiRoot, 'click', e => {
      const command = uiCommandOf(e && e.target, uiRoot);
      if (command === null) return;
      const at = eventTime(e);
      apply(s => controls.uiCommand(s, command, at));
    });
  }

  function unbind() {
    for (const [obj, type, fn] of added.splice(0)) obj.removeEventListener(type, fn);
    dragging = false;
  }
  // The App owns pause/reset boundaries; only this binding can clear its private gesture flags.
  // Keep outstanding pointer-lock requests and their normal browser acknowledgements intact.
  unbind.cancelInput = (at, options = {}) => cancelBoundInput(Number.isFinite(at) ? at : eventTime(null), Boolean(options && options.discardQueued === true));
  unbind.status = () => ({ locked: isLocked(), lockFallback, dragging, arrowPress, pressDrag });
  return unbind;
}
