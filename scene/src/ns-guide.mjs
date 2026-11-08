// NeuroSurge "Try this" first-time guide (round 4, lead decision D7; R4-text, 2026-11-09).
//
// A pure, DOM-free state machine. It never pauses or blocks play: it only turns plain game events into ONE short line
// for the status card ("Try this (2 of 7): Press W, A, S or D to move your left hand."). All wording lives in
// ns-text.mjs (GUIDE); nothing here says the game reads, records or sends brain signals.
//
// Goals, in teaching order (GUIDE_GOAL_IDS): look at a light-blue left-arm area -> move the hand with W/A/S/D -> make a
// fist with Space -> flip the palm with a double-tap -> switch on another body part's (grey) area -> hold Space on the
// brain and drag it down -> click or hold a curved orbit arrow. Every goal completes from a real game event, in ANY
// order: a goal the player already did is skipped when its turn comes. After the last goal a short "All done" line shows
// for GUIDE_OPTIONS.finishS seconds, then the guide hides itself. The Esc page can hide, show or restart it.
//
// Events (plain objects; unknown types are ignored; `t` (s) is optional, else the step's `now`):
//   { type: 'activate', regionId, isLeftArm, kind: 'effector' | 'integration', moves: true | false, source }
//        a motor area was switched on (look or click). isLeftArm true -> leftArmArea (if it moves something);
//        isLeftArm false and kind !== 'integration' -> otherPart.
//   { type: 'key', key: 'w' | 'a' | 's' | 'd' } or { type: 'move', axis: 'x' | 'z' }
//        A/D = axis x, W/S = axis z. moveHand needs both axes (the line asks for the missing one).
//   { type: 'fist', on: true | false, heldS? }   Space held / let go. The fist goal needs a hold of >= fistMinS (a quick
//        tap, such as half of a double-tap, is not counted).
//   { type: 'flip' }                             the forearm flipped (double-tap Space).
//   { type: 'grab', on: true }                    the brain was grabbed (Space on the brain).
//   { type: 'grab', on: false, dragRad }          the brain was let go after a drag of dragRad radians (look angle).
//   { type: 'orbit', dir?, hold? }                an orbit arrow turned the view (click step or hold).
//   { type: 'pause' } / { type: 'resume' }        Esc page shown / hidden (the line hides while paused).
//   { type: 'resetBody' }                         Reset body (no effect on the guide; accepted for completeness).
//
// guideEventsFromFrame() derives these events from two consecutive ns-app simulation states (the frame loop's
// simState before and after stepFrame), the frame's `out` and its inputs, so the integrator needs one call per frame.
//
// State is plain JSON (serialisable); every function returns a NEW state, or the SAME object when nothing changed.

import { GUIDE, guideLine } from './ns-text.mjs';

/** Goal ids in teaching order. */
export const GUIDE_GOAL_IDS = Object.freeze(['leftArmArea', 'moveHand', 'fist', 'flipPalm', 'otherPart', 'dragBrain', 'orbit']);

/** Display and completion constants (display choices, not measurements).
 *  - fistMinS 0.3: a held fist (Space down for at least 0.3 s); ns-app DOUBLE_TAP_S is 0.35 s press to press, so a
 *    double-tap's first press is usually shorter than this and does not count as the fist goal by itself.
 *  - dragMinRad 0.12 (about 7 deg): the brain was really moved, not just grabbed.
 *  - flashS 1.5: "Nice!" shows this long in front of the next goal.
 *  - finishS 8: the "All done" line shows this long, then the guide hides itself. */
export const GUIDE_OPTIONS = Object.freeze({ fistMinS: 0.3, dragMinRad: 0.12, flashS: 1.5, finishS: 8 });

/** localStorage key suggested for guideToStorage (separate from the settings key, so old settings stay valid). */
export const GUIDE_STORAGE_KEY = 'neurosurge.guide.v1';

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const nowOf = (now, fallback = 0) => (isNum(now) ? now : fallback);
const noneDone = () => Object.fromEntries(GUIDE_GOAL_IDS.map(id => [id, false]));

/**
 * A fresh guide. opts: now (s, the caller's clock), hidden (start hidden), done (goal ids already done, e.g. restored).
 * Returns { v: 1, hidden, paused, done: { id: bool }, axes: { x, z }, fistAt, flashUntil, finishedAt, startedAt }.
 */
export function createGuide({ now = 0, hidden = false, done = [] } = {}) {
  const d = noneDone();
  for (const id of Array.isArray(done) ? done : []) if (Object.prototype.hasOwnProperty.call(d, id)) d[id] = true;
  const all = GUIDE_GOAL_IDS.every(id => d[id]);
  return {
    v: 1, hidden: hidden === true, paused: false, done: d,
    axes: { x: d.moveHand, z: d.moveHand }, fistAt: null, flashUntil: null,
    finishedAt: all ? nowOf(now) - GUIDE_OPTIONS.finishS : null, startedAt: nowOf(now)
  };
}

const copy = s => ({ ...s, done: { ...s.done }, axes: { ...s.axes } });
const KEY_AXIS = Object.freeze({ a: 'x', d: 'x', w: 'z', s: 'z', keya: 'x', keyd: 'x', keyw: 'z', keys: 'z' });

/** The first goal not yet done (teaching order), or null when all are done. */
export function currentGoal(state) {
  if (!state || !state.done) return GUIDE_GOAL_IDS[0];
  return GUIDE_GOAL_IDS.find(id => !state.done[id]) || null;
}

/** Number of goals done (0..N). */
export function goalsDone(state) {
  return state && state.done ? GUIDE_GOAL_IDS.filter(id => state.done[id]).length : 0;
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
  for (const ev of list) {
    if (!ev || typeof ev !== 'object') continue;
    const t = isNum(ev.t) ? ev.t : nowOf(now);
    switch (ev.type) {
      case 'activate': {
        if (ev.isLeftArm === true) { if (ev.moves !== false) mark('leftArmArea'); }
        else if (ev.isLeftArm === false && ev.kind !== 'integration' && ev.moves !== false) mark('otherPart');
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
      case 'grab': {
        if (ev.on === false && isNum(ev.dragRad) && ev.dragRad >= o.dragMinRad) mark('dragBrain');
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
  const total = GUIDE_GOAL_IDS.length;
  const done = goalsDone(s);
  const id = currentGoal(s);
  const base = { visible: false, goalId: id, text: '', line: '', step: id ? GUIDE_GOAL_IDS.indexOf(id) + 1 : total, total, done, nice: false, finished: id === null };
  if (s.hidden || s.paused) return base;
  if (id === null) {
    const shown = isNum(s.finishedAt) && nowOf(now) - s.finishedAt < o.finishS;
    return { ...base, visible: shown, text: shown ? GUIDE.finished : '', line: shown ? GUIDE.finished : '' };
  }
  let text = GUIDE.goals[id];
  if (id === 'moveHand' && s.axes.x !== s.axes.z) text = s.axes.z ? GUIDE.partial.moveHandNeedX : GUIDE.partial.moveHandNeedZ;
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
  const n = createGuide({ now });
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
  return { v: 1, hidden: s.hidden === true, done: GUIDE_GOAL_IDS.filter(id => s.done[id]) };
}

/** Rebuild a guide from guideToStorage output (or its JSON text). Anything unreadable gives a fresh guide. A guide
 * that was already finished comes back finished and quiet (no "All done" line again). */
export function guideFromStorage(raw, now = 0) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  if (!v || typeof v !== 'object' || v.v !== 1) return createGuide({ now });
  return createGuide({ now, hidden: v.hidden === true, done: Array.isArray(v.done) ? v.done.filter(x => typeof x === 'string') : [] });
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

/** One activation report (ns-actions stepGated marks: { actionId, regionId, source }) as a guide 'activate' event.
 * ctx (optional, R4-fix reviews F3 / SL4-4 / RP6): { spaceHeld, rotationState } of the frame BEFORE the pulse, so an
 * area whose pulse moves nothing you can see does not complete a "watch it move" goal: "Relax left grip" on an open
 * hand, a forearm turn toward the way the palm already faces, and every area whose plain movement row says "Nothing". */
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
    if (arm === 'relax_release' && ctx.spaceHeld !== true) moves = false;
    if ((arm === 'pronation' && ctx.rotationState === 'pronated') || (arm === 'supination' && ctx.rotationState === 'supinated')) moves = false;
  }
  return { type: 'activate', regionId: r.id, isLeftArm: r.isLeftArm === true, kind, moves, source: mark.source || null };
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
 *   activity.spaceHeld false -> true     -> 'fist' on;  true -> false -> 'fist' off (heldS from the state clocks)
 *   activity.rotationSeq increased       -> 'flip' (fallback: state.rotation.flips increased)
 *   activity.grabSeq increased           -> 'grab' on
 *   activity.brainGrab.active true->false -> 'grab' off with dragRad = |placement - placement at grab start|
 *   activity.orbitSeq increased          -> 'orbit' (fallback: state.view.orbit changed)
 *   activity.paused false <-> true       -> 'pause' / 'resume'
 * Each event carries t = next.t (the simulation's wall clock, s) when it exists.
 */
export function guideEventsFromFrame({ prev = null, next = null, out = null, inputs = null, bodyMap = null } = {}) {
  const ev = [];
  if (!next || typeof next !== 'object') return ev;
  const t = num(next.t);
  const add = e => ev.push(t === null ? e : { ...e, t });
  const pa = prev && prev.activity && typeof prev.activity === 'object' ? prev.activity : null;
  const ctx = pa ? { spaceHeld: pa.spaceHeld === true, rotationState: typeof pa.rotationState === 'string' ? pa.rotationState : prev.rotation && prev.rotation.rotation } : null;
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
  if (num(a0.rotationSeq) !== null && num(a1.rotationSeq) !== null) { if (a1.rotationSeq > a0.rotationSeq) add({ type: 'flip' }); }
  else if (prev.rotation && next.rotation && num(prev.rotation.flips) !== null && num(next.rotation.flips) !== null && next.rotation.flips > prev.rotation.flips) add({ type: 'flip' });
  if (num(a0.grabSeq) !== null && num(a1.grabSeq) !== null && a1.grabSeq > a0.grabSeq) add({ type: 'grab', on: true });
  const g0 = a0.brainGrab, g1 = a1.brainGrab;
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
  return ev;
}
