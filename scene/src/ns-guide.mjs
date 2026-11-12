// NeuroSurge "Try this" first-time guide (round 4, lead decision D7; R4-text, 2026-11-09).
//
// A pure, DOM-free state machine. It never pauses or blocks play: it only turns plain game events into ONE short line
// for the status card ("Try this (2 of 7): Press W, A, S or D to move your left hand."). All wording lives in
// ns-text.mjs (GUIDE); nothing here says the game reads, records or sends brain signals.
//
// Goals, in teaching order (GUIDE_GOAL_IDS). R558 (Messages 55 and 56: the game is a learning tool, so what it teaches
// comes first and the hand gestures after): look at a light-blue left-arm area -> (feature moveKeys) press a number key:
// one movement of that area's list -> switch on another body part's area -> (feature moveKeys) press a number key with
// the look off the brain, to watch the movement on the body ('watchBody') -> move the hand with W/A/S/D -> tap
// Space twice: every limb turns once (goal id 'flipPalm', kept for saved progress; R558, Message 40) -> tap Space twice
// and hold: the limbs keep turning slowly (goal id 'fist', kept) -> hold
// Space (R558, Message 40; the F key is gone) on the brain and carry it -> click or hold an orbit arrow. Every goal completes from a real game event, in ANY
// order: a goal the player already did is skipped when its turn comes. After the last goal a short "All done" line shows
// for GUIDE_OPTIONS.finishS seconds, then the guide hides itself. The Esc page can hide, show or restart it.
//
// Events (plain objects; unknown types are ignored; `t` (s) is optional, else the step's `now`):
//   { type: 'activate', regionId, isLeftArm, kind: 'effector' | 'integration', moves: true | false, source }
//        a motor area was switched on (look or click). isLeftArm true -> leftArmArea (if it moves something);
//        isLeftArm false and kind !== 'integration' -> otherPart.
//   { type: 'key', key: 'w' | 'a' | 's' | 'd' } or { type: 'move', axis: 'x' | 'z' }
//        A/D = axis x, W/S = axis z. moveHand needs both axes (the line asks for the missing one).
//   { type: 'fist', on: true | false, heldS? }   the slow limb turn of a double tap held starts / stops (R558, Message 40;
//        the event keeps its old name). The goal needs a turn of >= fistMinS.
//   { type: 'flip' }                             a double tap of Space (R558, Message 40: every limb turns once).
//   { type: 'grab', on: true }                    the brain was grabbed (a Space hold or tap on the brain).
//   { type: 'grab', on: false, dragRad }          the brain was let go after a drag of dragRad radians (look angle).
//   { type: 'armMoved', ids }                     R558 (hunt 2): the game arm really moved (a latch or the forearm turn
//        changed); completes leftArmArea. guideEventsFromFrame then marks left-arm 'activate' events awaitMove: true.
//   { type: 'carry', m }                          R558 (hunt 2): while Space holds the brain, W/A/S/D carried it m metres this
//        frame (its key offset). dragBrain completes on a release after dragMinRad of look carry OR carryMinM of keys.
//   { type: 'orbit', dir?, hold? }                an orbit arrow turned the view (click step or hold).
//   { type: 'pause' } / { type: 'resume' }        Esc page shown / hidden (the line hides while paused).
//   { type: 'resetBody' }                         Reset body (no effect on the guide; accepted for completeness).
//   { type: 'moveKey', n, moved, onBrain }        R558 (Messages 55 and 56): number key n did movement n of the information
//        card's list. moved false = that movement was already at its end (nothing moved): the line then asks for
//        another number and no goal completes. onBrain = the look was on the brain when the key went down: a key that
//        moved something completes numberKey; with onBrain false it also completes watchBody (the look was on the
//        body, where the movement shows).
//
// guideEventsFromFrame() derives these events from two consecutive ns-app simulation states (the frame loop's
// simState before and after stepFrame), the frame's `out` and its inputs, so the integrator needs one call per frame.
//
// State is plain JSON (serialisable); every function returns a NEW state, or the SAME object when nothing changed.
//
// Round 5 (R5-text, 2026-11-09; the user's overhaul R21-R23): three more goals, each tied to a round-5 feature and
// switched on only when the build has that feature (createGuide / guideFromStorage / restartGuide `features`), so a
// player is never asked for something the game cannot do:
//   glow (feature glow, D17)          after otherPart: switch an area on WHILE this line shows and see its glow drawn.
//                                     A glow left over from an earlier goal does not count (the line must be seen).
//   thirdPerson (thirdPerson, D18)    after orbit: press E (view from behind), stay at least thirdMinS, press E again.
//   mirror (mirror, D19)              last: turn the mirror body with one of its own arrows (click or hold). The brain
//                                     catches looks and clicks while it is in front, so the line first asks to drag it.
// New events (unknown types are still ignored):
//   { type: 'glow', regionId?, onScreen?, level? }  a brain-to-muscle glow link is drawn this frame (onScreen false: its
//        muscle end is off screen; level 0 = faded out). Counts for the glow goal only within glowWindowS after a
//        switch-on that happened while the glow goal was current.
//   { type: 'view', mode: 'third' | 'first' }       the camera view changed (E).
//   { type: 'mirrorOrbit', dir?, hold? }             the mirror body was turned by one of its arrows (never by Reset).
//   { type: 'mirrorBlocked' }                        a look or click at the mirror body or its arrows was caught by the
//        brain in front (ns-mirror mirrorInputTarget blocked).
//   { type: 'mirrorClear', on }                      optional: the brain no longer covers / covers the mirror arrows.
// Feature-less callers (round 4) get exactly the round-4 seven goals and behaviour.

import { GUIDE, guideLine } from './ns-text.mjs';

/** The round-4 goal ids in teaching order (the guide of a build without the round-5 features). */
// R558 (Message 40): the double tap (flipPalm) is taught before the double tap held (fist), which builds on it.
// R558 (Messages 55 and 56): what the game teaches comes first: an area of the left arm, then an area of another body
// part; the hand, Space and arrow gestures follow. The ids are unchanged, so saved progress keeps.
export const GUIDE_GOAL_IDS = Object.freeze(['leftArmArea', 'otherPart', 'moveHand', 'flipPalm', 'fist', 'dragBrain', 'orbit']);

/** Every goal id in teaching order, the feature goals included (R5-text; R558 numberKey). */
export const GUIDE_ALL_GOAL_IDS = Object.freeze(['leftArmArea', 'numberKey', 'otherPart', 'watchBody', 'glow', 'moveHand', 'flipPalm', 'fist', 'dragBrain', 'orbit', 'thirdPerson', 'mirror']);

/** The feature goals and the build feature each one needs (ns-text ROUND5_FEATURES names; R558: moveKeys = the
 * information card draws its numbered movement list and the number keys are wired). */
export const GUIDE_FEATURE_GOALS = Object.freeze({ numberKey: 'moveKeys', watchBody: 'moveKeys', glow: 'glow', thirdPerson: 'thirdPerson', mirror: 'mirror' });

/** The full feature set for the guide (pass as `features` when every feature is wired). */
export const GUIDE_ALL_FEATURES = Object.freeze({ moveKeys: true, glow: true, thirdPerson: true, mirror: true });

/**
 * The goal list of a build, in teaching order: the seven round-4 goals plus each round-5 goal whose feature is true.
 * features: { moveKeys, glow, thirdPerson, mirror } (booleans; missing = false). goals (optional): an explicit list,
 * kept in teaching order, unknown ids dropped (used by restart to keep the same list).
 */
export function guideGoalIds(features = null, goals = null) {
  if (Array.isArray(goals) && goals.length) {
    const want = new Set(goals.filter(g => typeof g === 'string'));
    const list = GUIDE_ALL_GOAL_IDS.filter(id => want.has(id));
    if (list.length) return Object.freeze(list);
  }
  const f = features && typeof features === 'object' ? features : {};
  return Object.freeze(GUIDE_ALL_GOAL_IDS.filter(id => !GUIDE_FEATURE_GOALS[id] || f[GUIDE_FEATURE_GOALS[id]] === true));
}

/** Display and completion constants (display choices, not measurements).
 *  - fistMinS 0.3: the slow limb turn of a double tap held (R558, Message 40; goal id 'fist' kept) of at least 0.3 s.
 *  - dragMinRad 0.12 (about 7 deg): the brain was really moved, not just grabbed.
 *  - flashS 1.5: "Nice!" shows this long in front of the next goal.
 *  - finishS 8: the "All done" line shows this long, then the guide hides itself. */
// R5-text: glowWindowS 1.5: a glow drawn within 1.5 s of the switch-on (the 1 s pulse plus its fade) belongs to it;
// thirdMinS 1.0: the view from behind was on long enough to see the back (the camera eases in over 0.4 s).
// R558 (hunt 2): carryMinM 0.2: the held brain carried at least 20 cm by W/A/S/D also counts as moved (dragBrain).
export const GUIDE_OPTIONS = Object.freeze({ fistMinS: 0.3, dragMinRad: 0.12, carryMinM: 0.2, flashS: 1.5, finishS: 8, glowWindowS: 1.5, thirdMinS: 1.0 });

/** localStorage key suggested for guideToStorage (separate from the settings key, so old settings stay valid). */
export const GUIDE_STORAGE_KEY = 'neurosurge.guide.v1';

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const nowOf = (now, fallback = 0) => (isNum(now) ? now : fallback);
const noneDone = () => Object.fromEntries(GUIDE_ALL_GOAL_IDS.map(id => [id, false]));
const goalsOf = s => (s && Array.isArray(s.goals) && s.goals.length ? s.goals : GUIDE_GOAL_IDS);

/**
 * A fresh guide. opts: now (s, the caller's clock), hidden (start hidden), done (goal ids already done, e.g. restored),
 * features ({ glow, thirdPerson, mirror }: the round-5 goals this build can teach; none by default) or goals (an
 * explicit goal list, see guideGoalIds). Returns { v: 1, hidden, paused, goals: [ids], done: { id: bool } (every
 * known goal), axes: { x, z }, fistAt, flashUntil, finishedAt, startedAt, view, thirdAt, glowPending, mirrorBlocked,
 * mirrorMoved, numberStill (R558: the last number key pressed while a number-key goal showed moved nothing),
 * watchOnBrain (R558: while the watchBody goal showed, a number key moved something with the look still on the brain) }.
 */
export function createGuide({ now = 0, hidden = false, done = [], features = null, goals = null } = {}) {
  const d = noneDone();
  for (const id of Array.isArray(done) ? done : []) if (Object.prototype.hasOwnProperty.call(d, id)) d[id] = true;
  const list = [...guideGoalIds(features, goals)];
  const all = list.every(id => d[id]);
  return {
    v: 1, hidden: hidden === true, paused: false, goals: list, done: d,
    axes: { x: d.moveHand, z: d.moveHand }, fistAt: null, flashUntil: null,
    finishedAt: all ? nowOf(now) - GUIDE_OPTIONS.finishS : null, startedAt: nowOf(now),
    view: 'first', thirdAt: null, glowPending: null, mirrorBlocked: false, mirrorMoved: false, numberStill: false, watchOnBrain: false
  };
}

const copy = s => ({ ...s, done: { ...s.done }, axes: { ...s.axes } });
const VIEW_MODE = v => (typeof v !== 'string' ? null : /third/i.test(v) ? 'third' : /first/i.test(v) ? 'first' : null);
const KEY_AXIS = Object.freeze({ a: 'x', d: 'x', w: 'z', s: 'z', keya: 'x', keyd: 'x', keyw: 'z', keys: 'z' });

/** The first goal not yet done (teaching order), or null when all are done. */
export function currentGoal(state) {
  if (!state || !state.done) return GUIDE_GOAL_IDS[0];
  return goalsOf(state).find(id => !state.done[id]) || null;
}

/** Number of this guide's goals done (0..N). */
export function goalsDone(state) {
  return state && state.done ? goalsOf(state).filter(id => state.done[id]).length : 0;
}

/**
 * Apply game events. Pure: returns a new state, or the SAME state when nothing changed (cheap to call every frame).
 * now = the caller's clock in seconds (any monotonic clock; the same one guideView gets).
 */
export function guideStep(state, events = [], now = 0, opts = GUIDE_OPTIONS) {
  if (!state || typeof state !== 'object' || !state.done) state = createGuide({ now });
  const list = Array.isArray(events) ? events : [events];
  if (!list.length) return state;
  const o = { ...GUIDE_OPTIONS, ...(opts || {}) };
  const before = currentGoal(state);
  let s = null;
  const w = () => (s || (s = copy(state)));
  const mark = id => { if (!(s || state).done[id]) w().done[id] = true; };
  const cur = () => currentGoal(s || state);
  for (const ev of list) {
    if (!ev || typeof ev !== 'object') continue;
    const t = isNum(ev.t) ? ev.t : nowOf(now);
    switch (ev.type) {
      case 'activate': {
        // R5-text: a switch-on while the glow goal is current arms it (any area that drives muscles; the glow event
        // that follows proves the glow was really drawn). Checked BEFORE this event's own goal marks, so the switch-on
        // that completes otherPart never arms the next goal by itself.
        const armGlow = cur() === 'glow' && ev.kind !== 'integration' && (ev.isLeftArm === true || ev.isLeftArm === false);
        // R558 (hunt 2): awaitMove (guideEventsFromFrame): the left arm's own 'armMoved' event completes the goal instead,
        // once the arm really moves (a glance that does not dwell, or an action already held, moves nothing).
        if (ev.isLeftArm === true) { if (ev.moves !== false && ev.awaitMove !== true) mark('leftArmArea'); }
        else if (ev.isLeftArm === false && ev.kind !== 'integration' && ev.moves !== false) mark('otherPart');
        if (armGlow) w().glowPending = { at: t, regionId: typeof ev.regionId === 'string' ? ev.regionId : null };
        break;
      }
      case 'armMoved': mark('leftArmArea'); break;
      case 'glow': {
        const p = (s || state).glowPending;
        if (cur() !== 'glow' || !p || ev.onScreen === false || (isNum(ev.level) && !(ev.level > 0))) break;
        const sameArea = !p.regionId || typeof ev.regionId !== 'string' || ev.regionId === p.regionId;
        if (sameArea && t >= p.at && t - p.at <= o.glowWindowS) { mark('glow'); w().glowPending = null; }
        break;
      }
      case 'view': {
        const mode = VIEW_MODE(ev.mode);
        const c0 = s || state;
        if (mode === 'third' && c0.view !== 'third') { w().view = 'third'; s.thirdAt = t; }
        else if (mode === 'first' && c0.view === 'third') {
          const since = isNum(c0.thirdAt) ? t - c0.thirdAt : 0;
          if (since >= o.thirdMinS) mark('thirdPerson');
          w().view = 'first'; s.thirdAt = null;
        }
        break;
      }
      case 'mirrorOrbit': mark('mirror'); if ((s || state).mirrorBlocked || (s || state).mirrorMoved) { w().mirrorBlocked = false; s.mirrorMoved = false; } break;
      case 'mirrorBlocked': {
        const c0 = s || state;
        if (!c0.done.mirror && (!c0.mirrorBlocked || c0.mirrorMoved)) { w().mirrorBlocked = true; s.mirrorMoved = false; }
        break;
      }
      case 'mirrorClear': {
        const c0 = s || state;
        if (c0.done.mirror) break;
        if (ev.on === true && (!c0.mirrorMoved || c0.mirrorBlocked)) { w().mirrorMoved = true; s.mirrorBlocked = false; }
        else if (ev.on === false && c0.mirrorMoved) w().mirrorMoved = false;
        break;
      }
      case 'key':
      case 'move': {
        const axis = ev.type === 'move' ? ev.axis : KEY_AXIS[String(ev.key || ev.code || '').toLowerCase()];
        if (axis !== 'x' && axis !== 'z') break;
        const cur = s || state;
        if (!cur.axes[axis]) w().axes[axis] = true;
        if ((s || state).axes.x && (s || state).axes.z) mark('moveHand');
        break;
      }
      case 'fist': {
        if (ev.on === true) { if ((s || state).fistAt === null) w().fistAt = t; }
        else if (ev.on === false) {
          const cur = s || state;
          const held = isNum(ev.heldS) ? ev.heldS : cur.fistAt !== null ? t - cur.fistAt : 0;
          if (held >= o.fistMinS) mark('fist');
          if (cur.fistAt !== null) w().fistAt = null;
        }
        break;
      }
      case 'flip': mark('flipPalm'); break;
      case 'moveKey': {
        // R558 (Messages 55 and 56): a number key did a movement of the information card's list. One that was already
        // at its end moves nothing: the goal stays open and its line asks for another number (while a number-key goal
        // is the current one). A key that moved something completes numberKey; pressed with the look off the brain
        // (on the body, where the movement shows) it also completes watchBody.
        const c = cur(), numberGoal = c === 'numberKey' || c === 'watchBody';
        if (ev.moved === false) { if (numberGoal && (s || state).numberStill !== true) w().numberStill = true; break; }
        if ((s || state).numberStill === true) w().numberStill = false;
        if (ev.onBrain === false) mark('watchBody');
        else if (c === 'watchBody' && (s || state).watchOnBrain !== true) w().watchOnBrain = true;
        mark('numberKey');
        break;
      }
      case 'carry': if (isNum(ev.m) && ev.m > 0) w().carryM = (isNum((s || state).carryM) ? (s || state).carryM : 0) + ev.m; break;
      case 'grab': {
        // R558 (hunt 2): the W/A/S/D carry of this hold (carry events) counts as well as the look carry (dragRad).
        const carried = isNum((s || state).carryM) ? (s || state).carryM : 0;
        if (ev.on === true || ev.on === false) { if (carried !== 0) w().carryM = 0; }
        if (ev.on === false && ((isNum(ev.dragRad) && ev.dragRad >= o.dragMinRad) || carried >= (isNum(o.carryMinM) ? o.carryMinM : GUIDE_OPTIONS.carryMinM))) {
          const mirrorNow = cur() === 'mirror';
          mark('dragBrain');
          // R5-text: a real drag while the mirror goal is current: the line moves on to the mirror arrows.
          if (mirrorNow && (!(s || state).mirrorMoved || (s || state).mirrorBlocked)) { w().mirrorMoved = true; s.mirrorBlocked = false; }
        }
        break;
      }
      case 'orbit': mark('orbit'); break;
      case 'pause': if (!(s || state).paused) w().paused = true; break;
      case 'resume': if ((s || state).paused) w().paused = false; break;
      default: break; // 'resetBody' and unknown types: no change
    }
  }
  if (!s) return state;
  const after = currentGoal(s);
  if (after !== before) {
    if (after === null) { if (s.finishedAt === null) s.finishedAt = nowOf(now); s.flashUntil = null; }
    else s.flashUntil = nowOf(now) + o.flashS;
  }
  return s;
}

/**
 * What to show now. Returns { visible, goalId, text, line, step, total, done, nice, finished }:
 *  - visible false while hidden or paused, and after the "All done" line has shown for finishS seconds;
 *  - goalId / text: the current goal and its plain line (the moveHand line asks for the missing axis);
 *  - step = the goal's place in the teaching order (1-based), total = number of goals, done = goals done;
 *  - line: the full status-card line, e.g. "Try this (2 of 7): ..." ("Nice! " in front for flashS after a goal);
 *  - finished: every goal is done (line = the "All done" message while it is still visible).
 */
export function guideView(state, now = 0, opts = GUIDE_OPTIONS) {
  const o = { ...GUIDE_OPTIONS, ...(opts || {}) };
  const s = state && state.done ? state : createGuide({ now });
  const goals = goalsOf(s);
  const total = goals.length;
  const done = goalsDone(s);
  const id = currentGoal(s);
  const base = { visible: false, goalId: id, text: '', line: '', step: id ? goals.indexOf(id) + 1 : total, total, done, nice: false, finished: id === null };
  if (s.hidden || s.paused) return base;
  if (id === null) {
    const shown = isNum(s.finishedAt) && nowOf(now) - s.finishedAt < o.finishS;
    return { ...base, visible: shown, text: shown ? GUIDE.finished : '', line: shown ? GUIDE.finished : '' };
  }
  let text = GUIDE.goals[id];
  if (id === 'moveHand' && s.axes.x !== s.axes.z) text = s.axes.z ? GUIDE.partial.moveHandNeedX : GUIDE.partial.moveHandNeedZ;
  // R558: a number moved the part while the look was still on the brain: ask for a look down at the body.
  if (id === 'watchBody' && s.watchOnBrain === true) text = GUIDE.partial.watchBodyLookDown;
  // R558: the number just pressed moved nothing (that movement was already at its end): ask for another number.
  if ((id === 'numberKey' || id === 'watchBody') && s.numberStill === true) text = GUIDE.partial.numberKeyStill;
  // R5-text partial lines: in the view from behind; the brain in the way of the mirror arrows; the brain moved aside.
  if (id === 'thirdPerson' && s.view === 'third') text = GUIDE.partial.thirdPersonBack;
  if (id === 'mirror' && s.mirrorBlocked === true) text = GUIDE.partial.mirrorBlocked;
  else if (id === 'mirror' && s.mirrorMoved === true) text = GUIDE.partial.mirrorNowArrows;
  const nice = isNum(s.flashUntil) && nowOf(now) < s.flashUntil;
  return { ...base, visible: true, text, line: guideLine(base.step, total, text, nice), nice };
}

/** Hide the guide (Esc page "Hide the guide"). Progress is kept, and events still count while hidden. */
export function hideGuide(state) {
  const s = state && state.done ? state : createGuide();
  return s.hidden ? s : { ...copy(s), hidden: true };
}

/** Show the guide again (Esc page "Show the guide"), at the first goal not yet done. */
export function showGuide(state, now = 0) {
  const s = state && state.done ? state : createGuide({ now });
  if (!s.hidden) return s;
  const n = { ...copy(s), hidden: false, flashUntil: null };
  // A guide that had already finished shows its "All done" line once more, then hides itself again.
  if (currentGoal(n) === null) n.finishedAt = nowOf(now);
  return n;
}

/** Restart from the first goal (Esc page "Restart the guide"): all progress cleared, shown, not paused. */
export function restartGuide(state, now = 0) {
  const n = createGuide({ now, goals: state && Array.isArray(state.goals) ? state.goals : null });
  if (state && state.paused === true) n.paused = true; // restarting from the Esc page: the line appears on resume
  return n;
}

/** Pause or resume (the line hides while the Esc page is up). Same as the 'pause' / 'resume' events. */
export function setGuidePaused(state, paused) {
  const s = state && state.done ? state : createGuide();
  return s.paused === (paused === true) ? s : { ...copy(s), paused: paused === true };
}

/** Small JSON for storage (GUIDE_STORAGE_KEY): { v, hidden, done: [ids] }. A finished or hidden guide stays that way on
 * the next visit; a guide in progress resumes at its first open goal. */
export function guideToStorage(state) {
  const s = state && state.done ? state : createGuide();
  return { v: 1, hidden: s.hidden === true, done: GUIDE_ALL_GOAL_IDS.filter(id => s.done[id]) };
}

/** Rebuild a guide from guideToStorage output (or its JSON text). Anything unreadable gives a fresh guide. A guide
 * that was already finished comes back finished and quiet (no "All done" line again). opts.features / opts.goals: this
 * build's round-5 goals (createGuide); a player who finished the round-4 guide then meets only the new goals. */
export function guideFromStorage(raw, now = 0, { features = null, goals = null } = {}) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  if (!v || typeof v !== 'object' || v.v !== 1) return createGuide({ now, features, goals });
  return createGuide({ now, hidden: v.hidden === true, done: Array.isArray(v.done) ? v.done.filter(x => typeof x === 'string') : [], features, goals });
}

/* ------------------------------------------------------------------ frame adapter (ns-app simulation states) */

const regionIndexCache = new WeakMap();
function regionIndex(bodyMap) {
  if (!bodyMap || typeof bodyMap !== 'object' || !Array.isArray(bodyMap.regions)) return null;
  let idx = regionIndexCache.get(bodyMap);
  if (!idx) {
    idx = { byId: new Map(), byAction: new Map() };
    for (const r of bodyMap.regions) {
      if (!r || typeof r.id !== 'string') continue;
      idx.byId.set(r.id, r);
      for (const a of Array.isArray(r.actions) ? r.actions : []) {
        if (a && typeof a.id === 'string') idx.byAction.set(a.id, r);
        if (a && typeof a.armActionId === 'string') idx.byAction.set(a.armActionId, r);
      }
    }
    regionIndexCache.set(bodyMap, idx);
  }
  return idx;
}

/** R558: the hand actions a relax pulse lets go of (ns-actions HAND_LATCH_IDS, kept equal by hand). */
const RELAXABLE_HAND_ACTIONS = Object.freeze(['grasp_close', 'open_hand', 'spread_fingers', 'index_flexion', 'index_extension', 'thumb_mcp_flexion', 'thumb_mcp_extension']);
/** True when an activity state holds a latched hand action (armLatch), i.e. "Relax left grip" would move the hand. */
export function handLatched(a) {
  const l = a && a.armLatch && typeof a.armLatch === 'object' ? a.armLatch : null;
  return Boolean(l && RELAXABLE_HAND_ACTIONS.some(id => l[id] > 0));
}

/** R558 (hunt 2): the game arm's elbow counts as straight below this flexion (radians; the reach solution's shown
 * elbow, ns-app state.elbowRad). Display choice: 2 degrees. */
export const ARM_STRAIGHT_ELBOW_RAD = 2 * Math.PI / 180;
/** R558 (hunt 2): false when a game-arm action (ns-actions ACTION_IDS id) would move nothing on the arm as it is now:
 * it is already latched on (ns-actions armLatch: it stays until its opposite), or it straightens an elbow that is
 * already straight (full reach) with no bend held. arm: { armLatch, elbowRad } of the activity state BEFORE the pulse;
 * missing fields count as "moves" (the old behaviour). */
export function armActionMoves(armActionId, arm = null) {
  if (typeof armActionId !== 'string' || !arm || typeof arm !== 'object') return true;
  const l = arm.armLatch && typeof arm.armLatch === 'object' ? arm.armLatch : null;
  if (l && l[armActionId] > 0) return false;
  if (armActionId === 'elbow_extension' && !(l && l.elbow_flexion > 0) && isNum(arm.elbowRad) && arm.elbowRad < ARM_STRAIGHT_ELBOW_RAD) return false;
  return true;
}

/** One activation report (ns-actions stepGated marks: { actionId, regionId, source }) as a guide 'activate' event.
 * ctx (optional, R4-fix reviews F3 / SL4-4 / RP6): { handHeld, rotationState, armLatch, elbowRad } of the frame BEFORE
 * the pulse, so an area whose pulse moves nothing you can see does not complete a "watch it move" goal: "Relax left
 * grip" on a hand with no latched hand action (R558: handHeld; Space no longer makes a fist), a forearm turn toward the
 * way the palm already faces, a game-arm action already held or an elbow already straight (R558, hunt 2:
 * armActionMoves), and every area whose plain movement row says "Nothing". */
export function activationEvent(mark, bodyMap = null, ctx = null) {
  if (!mark || typeof mark !== 'object') return null;
  const idx = regionIndex(bodyMap);
  let r = null;
  if (idx && typeof mark.regionId === 'string') r = idx.byId.get(mark.regionId) || null;
  if (!r && idx && typeof mark.actionId === 'string') r = idx.byAction.get(mark.actionId) || null;
  if (!r) {
    // No body map (or an unknown id): a left-arm movement-map action still counts as a left-arm area.
    if (typeof mark.actionId === 'string' && !mark.regionId) return { type: 'activate', regionId: null, isLeftArm: true, kind: 'effector', moves: true, source: mark.source || null };
    return null;
  }
  const kind = r.kind === 'integration' ? 'integration' : 'effector';
  // "moves": the area has a game action (the left shoulder only lights and marks; in-between areas move nothing) ...
  let moves = kind !== 'integration' && Array.isArray(r.actions) && r.actions.length > 0;
  // ... R4-fix (F3 / SL4-4): and its plain movement row does not say "Nothing ..." (the face areas the 3D body has no
  // muscles for) ...
  if (moves && typeof r.plainMoves === 'string' && /^Nothing\b/.test(r.plainMoves)) moves = false;
  // ... and this pulse changes the pose now (R4-fix RP6 / SL4-4: a relax pulse on an open hand, or a forearm turn
  // toward the way the palm already faces, moves nothing).
  if (moves && ctx && typeof mark.actionId === 'string') {
    const act = r.actions.find(a => a && (a.id === mark.actionId || a.armActionId === mark.actionId)) || null;
    const arm = act && typeof act.armActionId === 'string' ? act.armActionId : mark.actionId;
    if (arm === 'relax_release' && ctx.handHeld !== true) moves = false;
    if ((arm === 'pronation' && ctx.rotationState === 'pronated') || (arm === 'supination' && ctx.rotationState === 'supinated')) moves = false;
    if (r.isLeftArm === true && ctx.armLatch && !armActionMoves(arm, ctx)) moves = false;
  }
  // R558 (hunt 2): with the arm's own state known (ctx.armLatch), a left-arm switch-on waits for the arm to move
  // (guideEventsFromFrame 'armMoved': the latch commits after the look has rested GAZE_DWELL.latchS, or at once on a click).
  const awaitMove = r.isLeftArm === true && Boolean(ctx && ctx.armLatch);
  return { type: 'activate', regionId: r.id, isLeftArm: r.isLeftArm === true, kind, moves, source: mark.source || null, ...(awaitMove ? { awaitMove: true } : {}) };
}

const num = v => (isNum(v) ? v : null);
/** R4-fix (RP3): the smallest per-frame hand movement that counts as "the hand moved" (NDC in x, metres in depth). */
export const MOVE_MIN = Object.freeze({ xNdc: 2e-4, depthM: 2e-5 });

/**
 * Guide events for one frame, from the ns-app frame loop:
 *   prev = simState BEFORE sim.stepFrame, next = step.state, out = step.out, inputs = the stepFrame inputs
 *   ({ axes: { x, z } }), bodyMap = BODY_MOTOR_MAP (for region kinds).
 * Reads only plain fields and tolerates any of them missing (then that event is simply not produced):
 *   out.marks[]                         -> 'activate' (each new look or click pulse)
 *   inputs.axes.x / .z != 0              -> 'move' x / z
 *   activity.spaceHeld false -> true     -> 'fist' on;  true -> false -> 'fist' off (heldS from the state clocks); R558
 *                                            (Message 40): spaceHeld is the slow turn of a double tap held
 *   activity.rotationSeq increased       -> 'flip' (a double tap; fallback: state.rotation.flips increased)
 *   activity.grabSeq increased           -> 'grab' on
 *   activity.brainGrab.active true->false -> 'grab' off with dragRad = |placement - placement at grab start|
 *   activity.orbitSeq increased          -> 'orbit' (fallback: state.view.orbit changed)
 *   activity.paused false <-> true       -> 'pause' / 'resume'
 * Round 5 (R5-text; every field optional, the first one found wins, see round5/R5-text-NOTES.md):
 *   view mode changed                    -> 'view' { mode }   from activity.viewMode | state.camera.view |
 *                                            state.view.mode | state.viewMode ('first' | 'third'), or the boolean
 *                                            activity.thirdPerson / state.thirdPerson
 *   mirror orbit counter increased       -> 'mirrorOrbit'     activity.mirrorOrbitSeq | state.mirror.orbitSeq
 *                                            (fallback: state.mirror.orbit { yaw, pitch } changed away from 0, 0)
 *   mirror blocked counter increased     -> 'mirrorBlocked'   activity.mirrorBlockedSeq | state.mirror.blockedSeq,
 *                                            or out.mirrorBlocked === true
 *   mirror arrows reachable changed      -> 'mirrorClear' { on }  activity.mirrorReachable | state.mirror.reachable
 *   glow links drawn this frame          -> 'glow' { regionId, onScreen, level }  from the `glow` argument (the
 *                                            scene's drawn links), else out.glow / out.glowLinks: an array of
 *                                            { regionId, level, onScreen } or { links: [...] }
 * Each event carries t = next.t (the simulation's wall clock, s) when it exists.
 */
export function guideEventsFromFrame({ prev = null, next = null, out = null, inputs = null, bodyMap = null, glow = null } = {}) {
  const ev = [];
  if (!next || typeof next !== 'object') return ev;
  const t = num(next.t);
  const add = e => ev.push(t === null ? e : { ...e, t });
  const pa = prev && prev.activity && typeof prev.activity === 'object' ? prev.activity : null;
  // R558: Space makes no fist (it grasps and turns the limbs); a relax pulse moves the hand when a hand action is latched.
  const ctx = pa ? { handHeld: handLatched(pa), rotationState: typeof pa.rotationState === 'string' ? pa.rotationState : prev.rotation && prev.rotation.rotation,
    armLatch: pa.armLatch && typeof pa.armLatch === 'object' ? pa.armLatch : null, elbowRad: num(prev.elbowRad) } : null;
  for (const m of out && Array.isArray(out.marks) ? out.marks : []) { const e = activationEvent(m, bodyMap, ctx); if (e) add(e); }
  const ax = inputs && inputs.axes && typeof inputs.axes === 'object' ? inputs.axes : null;
  // R4-fix (review RP3): a held W/A/S/D counts only when the hand really moved this frame (the shown hand: the fit's
  // x and depth before and after); a key at the edge of the reach moves nothing and no longer completes the goal.
  // Without fit fields in both states (older callers) the key alone counts, as before.
  // The simulation's own net-movement report (out.reachMoved, ns-app REACH_BLOCKED) when present: a hand at its limit
  // jitters slightly every frame, which is not a move.
  const rm = out && out.reachMoved && typeof out.reachMoved === 'object' ? out.reachMoved : null;
  const f0 = prev && prev.fit && typeof prev.fit === 'object' ? prev.fit : null, f1 = next.fit && typeof next.fit === 'object' ? next.fit : null;
  const haveFit = Boolean(f0 && f1 && num(f0.xNdc) !== null && num(f1.xNdc) !== null && num(f0.depth) !== null && num(f1.depth) !== null);
  const movedX = rm ? rm.x === true : !haveFit || Math.abs(f1.xNdc - f0.xNdc) > MOVE_MIN.xNdc;
  const movedZ = rm ? rm.z === true : !haveFit || Math.abs(f1.depth - f0.depth) > MOVE_MIN.depthM;
  if (ax && num(ax.x) !== null && ax.x !== 0 && movedX) add({ type: 'move', axis: 'x' });
  if (ax && num(ax.z) !== null && ax.z !== 0 && movedZ) add({ type: 'move', axis: 'z' });
  if (!prev || typeof prev !== 'object') return ev;
  const a0 = prev.activity && typeof prev.activity === 'object' ? prev.activity : {};
  const a1 = next.activity && typeof next.activity === 'object' ? next.activity : {};
  if (typeof a0.spaceHeld === 'boolean' && typeof a1.spaceHeld === 'boolean' && a0.spaceHeld !== a1.spaceHeld) add({ type: 'fist', on: a1.spaceHeld });
  // R558 (hunt 2): the game arm really moved because of a left-arm area: a latch turned on or off while that area's
  // pulse runs (ns-actions armLatch; the commit comes at a click, or once the look has rested; Reset body is not a
  // pulse; a straighten on an elbow already straight moves nothing), or the forearm turn changed by a forearm pulse.
  if (a0.armLatch && a1.armLatch && typeof a0.armLatch === 'object' && typeof a1.armLatch === 'object') {
    const straight = isNum(prev.elbowRad) && prev.elbowRad < ARM_STRAIGHT_ELBOW_RAD;
    const changed = typeof a1.pulseAction === 'string' ? Object.keys(a1.armLatch).filter(k => (a0.armLatch[k] > 0) !== (a1.armLatch[k] > 0) && !(k === 'elbow_extension' && a1.armLatch[k] > 0 && straight)) : [];
    const turned = typeof a1.pulseRotation === 'string' && typeof a0.rotationState === 'string' && typeof a1.rotationState === 'string' && a0.rotationState !== a1.rotationState;
    if (changed.length || turned) add({ type: 'armMoved', ids: turned ? [...changed, 'rotation'] : changed });
  }
  if (num(a0.rotationSeq) !== null && num(a1.rotationSeq) !== null) { if (a1.rotationSeq > a0.rotationSeq) add({ type: 'flip' }); }
  else if (prev.rotation && next.rotation && num(prev.rotation.flips) !== null && num(next.rotation.flips) !== null && next.rotation.flips > prev.rotation.flips) add({ type: 'flip' });
  if (num(a0.grabSeq) !== null && num(a1.grabSeq) !== null && a1.grabSeq > a0.grabSeq) add({ type: 'grab', on: true });
  const g0 = a0.brainGrab, g1 = a1.brainGrab;
  // R558 (hunt 2): W/A/S/D move a held brain by its key offset (the carry's brainKeyOffset, world m), not its placement.
  if ((g0 && g0.active === true) || (g1 && g1.active === true)) {
    const k0 = prev.objectCarry && Array.isArray(prev.objectCarry.brainKeyOffset) ? prev.objectCarry.brainKeyOffset : null;
    const k1 = next.objectCarry && Array.isArray(next.objectCarry.brainKeyOffset) ? next.objectCarry.brainKeyOffset : null;
    if (k0 && k1 && k0.length === 3 && k1.length === 3 && k0.every(isNum) && k1.every(isNum)) {
      const m = Math.hypot(k1[0] - k0[0], k1[1] - k0[1], k1[2] - k0[2]);
      if (m > 1e-6) add({ type: 'carry', m: Math.min(m, 1) });
    }
  }
  if (g0 && g0.active === true && g1 && g1.active !== true) {
    const p = a1.brainPlacement;
    const dy = p && num(p.yaw) !== null && num(g0.originYaw) !== null ? p.yaw - g0.originYaw : null;
    const dp = p && num(p.pitch) !== null && num(g0.originPitch) !== null ? p.pitch - g0.originPitch : null;
    add({ type: 'grab', on: false, dragRad: dy === null || dp === null ? 0 : Math.hypot(dy, dp) });
  }
  if (num(a0.orbitSeq) !== null && num(a1.orbitSeq) !== null) { if (a1.orbitSeq > a0.orbitSeq) add({ type: 'orbit' }); }
  else {
    const o0 = prev.view && prev.view.orbit, o1 = next.view && next.view.orbit;
    if (o0 && o1 && (o0.yaw !== o1.yaw || o0.pitch !== o1.pitch) && (o1.yaw !== 0 || o1.pitch !== 0)) add({ type: 'orbit' });
  }
  if (typeof a0.paused === 'boolean' && typeof a1.paused === 'boolean' && a0.paused !== a1.paused) add({ type: a1.paused ? 'pause' : 'resume' });
  // R5-text: the E view, the mirror body's own arrows and the brain-to-muscle glow.
  const v0 = viewModeOf(prev), v1 = viewModeOf(next);
  if (v0 && v1 && v0 !== v1) add({ type: 'view', mode: v1 });
  const m0 = prev.mirror && typeof prev.mirror === 'object' ? prev.mirror : {}, m1 = next.mirror && typeof next.mirror === 'object' ? next.mirror : {};
  const grew = (x0, x1) => (num(x0) !== null && num(x1) !== null && x1 > x0 ? Math.min(x1 - x0, 50) : 0);
  let mo = grew(a0.mirrorOrbitSeq, a1.mirrorOrbitSeq) || grew(m0.orbitSeq, m1.orbitSeq);
  if (!mo && num(a1.mirrorOrbitSeq) === null && num(m1.orbitSeq) === null) {
    const o0 = m0.orbit, o1 = m1.orbit;
    if (o0 && o1 && (o0.yaw !== o1.yaw || o0.pitch !== o1.pitch) && (o1.yaw !== 0 || o1.pitch !== 0)) mo = 1;
  }
  if (mo) add({ type: 'mirrorOrbit' });
  if (grew(a0.mirrorBlockedSeq, a1.mirrorBlockedSeq) || grew(m0.blockedSeq, m1.blockedSeq) || (out && out.mirrorBlocked === true)) add({ type: 'mirrorBlocked' });
  const r0 = typeof a0.mirrorReachable === 'boolean' ? a0.mirrorReachable : typeof m0.reachable === 'boolean' ? m0.reachable : null;
  const r1 = typeof a1.mirrorReachable === 'boolean' ? a1.mirrorReachable : typeof m1.reachable === 'boolean' ? m1.reachable : null;
  if (r0 !== null && r1 !== null && r0 !== r1) add({ type: 'mirrorClear', on: r1 });
  for (const l of glowLinksOf(glow, out)) add({ type: 'glow', regionId: typeof l.regionId === 'string' ? l.regionId : null, onScreen: l.onScreen !== false, level: num(l.level) });
  return ev;
}

/** 'first' | 'third' | null: the camera view of one simulation state (fields listed at guideEventsFromFrame). */
function viewModeOf(st) {
  if (!st || typeof st !== 'object') return null;
  const a = st.activity && typeof st.activity === 'object' ? st.activity : {};
  for (const v of [a.viewMode, st.camera && st.camera.view, st.view && st.view.mode, st.viewMode]) {
    const m = VIEW_MODE(v); if (m) return m;
  }
  for (const b of [a.thirdPerson, st.thirdPerson]) if (typeof b === 'boolean') return b ? 'third' : 'first';
  return null;
}

/** The glow links drawn this frame: the explicit `glow` argument, else out.glow / out.glowLinks (array or { links }).
 * Faded links (level <= 0) are left out. */
function glowLinksOf(glow, out) {
  const pick = g => (Array.isArray(g) ? g : g && typeof g === 'object' && Array.isArray(g.links) ? g.links : null);
  const list = pick(glow) || (out && (pick(out.glow) || pick(out.glowLinks))) || [];
  return list.filter(l => l && typeof l === 'object' && !(num(l.level) !== null && !(l.level > 0)));
}
