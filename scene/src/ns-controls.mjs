/** NeuroSurge scene: virtual keyboard, gaze and click input state.
 *
 * WASD, Space, pointer yaw/pitch and clicks are VIRTUAL game-control inputs only. They are not real
 * neural stimulation, brain writing or neural decoding, and nothing here is a measured quantity.
 *
 * The core is DOM-free and runs in Node tests. State is plain, serializable data:
 *   { keys: { KeyW, KeyA, KeyS, KeyD, Space: boolean }, yaw: radians, pitch: radians, lookMs: number | null,
 *     events: [], ui: [], look: { sensitivity: number, invertY: boolean } }
 * `look` (A1-activation round 1) holds the player's look settings: `sensitivity` multiplies the base
 * sensitivityRadPerPx (1 = 0.0025 rad/px) and `invertY` flips the vertical look direction. A state without
 * `look` (older callers) uses the reducer defaults.
 *
 * U1-controls round 2. Two event queues, so a consumer that only understands the game events keeps working:
 *   events  the GAME queue, drained by drainEvents(): { type: 'space', down, safety?, timeMs? } | { type: 'click', timeMs? }.
 *           A space-up produced by a safety release (blur, focus/visibility loss, Ctrl/Meta chord, pointer-lock change,
 *           Esc) carries `safety: true`, so the activity model can reset its double-tap chain (DOUBLE_TAP_MS).
 *   ui      the UI queue, drained by drainUiEvents(): { type: 'escape' } (Esc keydown), { type: 'lock', locked }
 *           (every real pointer-lock change), and the overlay commands { type: 'orbit', dir }, { type: 'reset' },
 *           { type: 'resume' }, { type: 'pause' } (from uiCommand / `data-ns-ui` buttons). Each carries timeMs when known.
 *           ns-actions createActivity().step accepts every one of these events directly (instructions, pause,
 *           orbit and Reset body live in the activity state).
 * The double-tap (DOUBLE_TAP_MS) is detected by ns-actions on the activity clock, not here: every Space press is
 * delivered immediately (hold-to-fist is never delayed waiting for a second tap).
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
 * bindDom is the only function that touches the DOM; only ns-app calls it.
 */
import { DEG, clamp } from './ns-math.mjs';

/** The five control codes (KeyboardEvent.code values, layout-independent). */
export const CONTROL_CODES = Object.freeze(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

/** Modifier codes whose press starts a browser/OS chord: every held control key is released when one is pressed or
 * released (macOS does not deliver keyup for keys released while Cmd is held). */
export const CHORD_MODIFIER_CODES = Object.freeze(['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'OSLeft', 'OSRight']);

/** Click events are dropped once this many events are queued (a click flood between frames is
 * equivalent to one re-trigger). Space transitions are never dropped: losing one could leave a stale fist. */
export const EVENT_QUEUE_LIMIT = 64;

/** At most this many UI events stay queued: a new event is dropped when full, except a lock change, which drops the
 * OLDEST queued event instead (the latest lock state always arrives; the queue stays bounded even if never drained). */
export const UI_QUEUE_LIMIT = 32;

/** Non-game keys bound by bindDom (KeyboardEvent.code). Escape toggles the instructions/controls overlay. */
export const UI_CODES = Object.freeze(['Escape']);

/** Double-tap window (ms, press to press): a second Space press within this of the previous press flips the forearm
 * between pronation and supination (ns-actions). A UI timing choice, not a physiological constant. */
export const DOUBLE_TAP_MS = 350;

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
 *   escape, lockChange, uiCommand, drainUiEvents, setLookOptions, lookOptions, sensitivityRadPerPx: number,
 *   pitchLimitRad: number, sensitivity: number, invertY: boolean }}
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

  const initialState = () => ({
    keys: releasedKeys(), yaw: 0, pitch: 0, lookMs: null, events: [], ui: [], look: { sensitivity, invertY }
  });
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

  /** Press a control key. Repeats (keyboard auto-repeat) are idempotent; unknown codes are ignored. */
  function keyDown(state, code, timeMs) {
    if (!isControlCode(code) || state.keys[code]) return state;
    const keys = { ...state.keys, [code]: true };
    const events = code === 'Space' ? [...state.events, stamp({ type: 'space', down: true }, timeMs)] : state.events;
    return { ...state, keys, events };
  }

  /** Release a control key. Releasing a key that is not held does nothing. */
  function keyUp(state, code, timeMs) {
    if (!isControlCode(code) || !state.keys[code]) return state;
    const keys = { ...state.keys, [code]: false };
    const events = code === 'Space' ? [...state.events, stamp({ type: 'space', down: false }, timeMs)] : state.events;
    return { ...state, keys, events };
  }

  /** Focus loss (and every other safety release): clear every key; if Space was held, queue exactly one space-up,
   * marked `safety: true` (it is not a deliberate tap, so it never counts toward a double-tap). */
  function blur(state, timeMs) {
    const k = state.keys;
    if (!(k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.Space)) return state;
    const events = k.Space ? [...state.events, stamp({ type: 'space', down: false, safety: true }, timeMs)] : state.events;
    return { ...state, keys: releasedKeys(), events };
  }

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
   * Non-finite deltas are ignored. Yaw is not wrapped or clamped. */
  function pointerMove(state, dx, dy, timeMs) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return state;
    const { radPerPx, invertY: inv } = lookOptions(state);
    const yaw = state.yaw - dx * radPerPx;
    const pitch = clamp(state.pitch - (inv ? -dy : dy) * radPerPx, -pitchLimit, pitchLimit);
    if (yaw === state.yaw && pitch === state.pitch) return state;
    return { ...state, yaw, pitch, lookMs: Number.isFinite(timeMs) ? timeMs : state.lookMs === undefined ? null : state.lookMs };
  }

  /** Any mouse/trackpad button press: queue one click (re-triggers the action under the crosshair). */
  function click(state, timeMs) {
    if (state.events.length >= EVENT_QUEUE_LIMIT) return state;
    return { ...state, events: [...state.events, stamp({ type: 'click' }, timeMs)] };
  }

  /** Reach axes: x = D - A (right positive), z = W - S (forward positive); opposite keys cancel. */
  function axes(state) {
    const k = state.keys;
    return { x: (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), z: (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) };
  }

  /** Return queued [{type:'space', down, timeMs?}|{type:'click', timeMs?}] in order and empty the queue in place. */
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
    drainUiEvents,
    setLookOptions,
    lookOptions,
    sensitivityRadPerPx: sens,
    pitchLimitRad: pitchLimit,
    sensitivity,
    invertY
  };
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
 *   - window blur, document visibilitychange and every pointerlockchange -> release every key.
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
 * options: { onLockChange(locked: boolean), onLockError(), sensitivity, invertY, dragToLook = true, uiRoot }
 *   sensitivity / invertY, when given, are applied to the state with controls.setLookOptions at bind time.
 * @returns {() => void} unbind, which removes every listener this call added. unbind.status() returns
 *   { locked, lockFallback, dragging } for HUD feedback.
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
  const { onLockChange = null, onLockError = null, sensitivity, invertY, dragToLook = true, uiRoot = null } = options;
  if (onLockChange !== null && typeof onLockChange !== 'function') fail('controls_dom', 'onLockChange must be a function');
  if (uiRoot !== null && (typeof uiRoot !== 'object' || typeof uiRoot.addEventListener !== 'function')) {
    fail('controls_dom', 'uiRoot must be an EventTarget (the overlay root element)');
  }
  if (uiRoot !== null && typeof controls.uiCommand !== 'function') fail('controls_dom', 'controls.uiCommand is needed for uiRoot');
  if (onLockError !== null && typeof onLockError !== 'function') fail('controls_dom', 'onLockError must be a function');
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
  const releaseAll = e => { const at = eventTime(e); apply(s => controls.blur(s, at)); };
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
      apply(s => controls.blur(s, at));
      if (typeof controls.escape === 'function') apply(s => controls.escape(s, at));
      return;
    }
    if (!isControlCode(code)) return;
    e.preventDefault();
    if (e.repeat === true) return;
    const at = eventTime(e);
    apply(s => controls.keyDown(s, code, at));
  });
  on(view, 'keyup', e => {
    const code = e.code;
    if (isChordModifier(code)) { releaseAll(e); return; }
    if (!isControlCode(code)) return;
    e.preventDefault();
    const at = eventTime(e);
    apply(s => controls.keyUp(s, code, at));
  });
  on(view, 'blur', releaseAll);
  on(doc, 'visibilitychange', releaseAll);
  on(doc, 'pointerlockchange', e => {
    releaseAll(e);
    lockPending = false;
    dragging = false;
    const now = isLocked();
    if (now) lockFallback = false;
    if (now !== locked) {
      locked = now;
      if (typeof controls.lockChange === 'function') { const at = eventTime(e); apply(s => controls.lockChange(s, now, at)); }
      call(onLockChange, now);
    }
  });
  on(doc, 'pointerlockerror', () => lockRefused());
  on(target, 'mousedown', e => {
    const at = eventTime(e);
    if (isLocked()) {
      apply(s => controls.click(s, at));
      return;
    }
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
    apply(s => controls.click(s, at));
    if (canLock && !lockPending) requestLock(); // retry (e.g. after the browser's post-Esc cooldown)
  });
  on(view, 'mouseup', e => {
    if (!(Number.isFinite(e.buttons) && e.buttons !== 0)) dragging = false;
  });
  on(doc, 'mousemove', e => {
    if (isLocked()) {
      const dx = e.movementX, dy = e.movementY;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      const at = eventTime(e);
      apply(s => controls.pointerMove(s, dx, dy, at));
      return;
    }
    if (!dragging) return;
    if (Number.isFinite(e.buttons) && e.buttons === 0) { dragging = false; return; }
    let dx = e.movementX, dy = e.movementY;
    const client = Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? { x: e.clientX, y: e.clientY } : null;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      if (!client || !lastClient) { lastClient = client; return; }
      dx = client.x - lastClient.x;
      dy = client.y - lastClient.y;
    }
    lastClient = client;
    const at = eventTime(e);
    apply(s => controls.pointerMove(s, dx, dy, at));
  });
  on(target, 'contextmenu', e => e.preventDefault());
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
  unbind.status = () => ({ locked: isLocked(), lockFallback, dragging });
  return unbind;
}
