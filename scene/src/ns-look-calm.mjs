// NeuroSurge: calm light while walking the strip with a held arrow key, and the keyboard focus ring only for keyboard
// players (22 November 2026, package LOOK2, DESIGN-DECISIONS section 198). Pure rules (no three.js, no DOM) plus one
// small DOM binder that only sets a data attribute.
//
// The owner, 19 November 2026 (Message 133): "The game currently physically hurts to look at with your eyes." Light may
// rise, hold and fade, slowly; no blinking, no flicker.

const freeze = Object.freeze;

/**
 * AREA_WALK_QUIET (hunt of update 64, H18: "Holding Left or Right arrow lights block after block about 4 to 5 times a
 * second: a run of white flashes at the crosshair"). Each accepted step of a held arrow key (ns-controls
 * AREA_KEY_REPEAT_MS, then 180) put the look on a new block, and a look that arrives on a block switches it on at once: every
 * block passed flared white for up to 0.4 s and was cut by the next step, about 4.4 flares a second at the same spot.
 * The walk stays as it was (the look still moves one block per step, the block under the look still shows the look's
 * soft glow and its card); what changes is that the blocks PASSED while the key is held are not switched on: from the
 * key's first auto-repeat the gaze is recorded silently (as during a neck movement's carry, CARRY_ARRIVAL), and when
 * the key comes up the block the look stopped on is met as an arrival and switches on, once. A single press (no
 * repeat) switches its block on at once, as before.
 *  - keepMs: the walk also ends when no held key repeat has come for this long (a lost key-up: the window lost focus,
 *    the browser ate the release). Longer than the controls' repeat gate (AREA_KEY_REPEAT_MS 270; with a 33 ms key
 *    repeat a held repeat comes through every 297 ms) and than a slow key repeat (about 400 ms at 2.5 a second). Every
 *    repeat counts, also one the app's queue drops while the steps wait (a neck movement's swing).
 * on: false = every block passed switches on, as before. A rule of this game, nothing measured.
 */
// (22 November 2026, second pass: keepMs 450 -> 600, with the controls' gate at 270 ms a held step comes about every
// 300 ms, and every held repeat now counts, also one the app's full queue drops while the steps wait)
export const AREA_WALK_QUIET = freeze({ on: true, keepMs: 600 });

/**
 * One frame of AREA_WALK_QUIET (pure). prev: null, or { from, lastMs } (a held walk is under way; from: the activity's
 * gaze area when it began, or null). heldStep: an area key's auto-repeat (the key is held) reached the game this
 * frame; released: an area key came up this frame; pending: a held step still waits to be done (the view was still
 * changing); blocked: this frame's gaze is silent for another reason (a carry, a held limb, a seed: the arrival would
 * be lost, so the walk waits); nowMs: the frame's clock; gazeArea: the activity's gaze area as the frame begins.
 * Returns { keep (the next prev), silent (record this frame's gaze silently), arrivedFrom (undefined, or the area to
 * tell this frame's gaze event: the stop block is then an arrival when it is not the one the walk began on) }.
 */
export function walkQuietStep(prev, { heldStep = false, released = false, pending = false, blocked = false, nowMs = 0, gazeArea = null } = {}, o = AREA_WALK_QUIET) {
  const none = { keep: null, silent: false, arrivedFrom: undefined };
  if (!o || o.on !== true) return none;
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  if (heldStep) return { keep: { from: prev ? prev.from : (typeof gazeArea === 'string' ? gazeArea : null), lastMs: now }, silent: true, arrivedFrom: undefined };
  if (!prev) return none;
  const keepMs = Number.isFinite(o.keepMs) && o.keepMs > 0 ? o.keepMs : 450;
  const stale = !(now - prev.lastMs <= keepMs);
  if ((released || stale) && !pending && !blocked) return { keep: null, silent: false, arrivedFrom: typeof prev.from === 'string' ? prev.from : null };
  return { keep: prev, silent: true, arrivedFrom: undefined };
}

/**
 * One event of the controls' UI queue for the walk (pure): { push (queue the step: an area key's request while the
 * queue holds fewer than `limit`), held (an auto-repeat of a held area key: it keeps the walk quiet whether or not the
 * queue takes it), released (a held area key came up) }. queued: the requests waiting now.
 */
export function walkUiEvent(ev, queued = 0, limit = 2) {
  const area = Boolean(ev && ev.type === 'area' && (ev.dir === 1 || ev.dir === -1));
  return { push: area && queued < limit, held: area && ev.held === true, released: Boolean(ev && ev.type === 'areaUp') };
}

/**
 * FOCUS_RING (hunt of update 64, H19: "A 2-pixel light-blue frame is drawn round the whole game picture during play").
 * The canvas's keyboard focus ring (preview.css `.ns-canvas:focus-visible`) is for players who use the keyboard alone:
 * since 17 November nothing is clicked before the game focuses its canvas by script, so the browser counted that focus
 * as keyboard focus and drew the ring round the whole picture for the whole session, for mouse players too, and again
 * after every resume by mouse. The rule now follows the browser's own idea of focus-visible, kept by the game: once the
 * pointer is used on the page (a press of a mouse button, a pen or a finger) the ring is not drawn on the canvas; a Tab
 * key (moving focus by keyboard) brings it back. The game's own keys (arrows, W A S D, Space, numbers, E, M, R) do not:
 * they play, they do not move focus. Every other control keeps its own ring. Before any pointer use (a keyboard player
 * from the start) the ring shows as before.
 *  - attr: the data attribute on the document's root element ('pointer' while the pointer was used last).
 * on: false = the ring whenever the browser says focus-visible, as before.
 */
export const FOCUS_RING = freeze({ on: true, attr: 'data-ns-input' });

/** The input that decides the canvas's focus ring after an event (pure): 'pointer' after a pointer press, 'keys' after
 * a Tab key press, otherwise `prev` (null before any). type: the DOM event type; key: KeyboardEvent.key. */
export function focusRingInput(prev, type, key = null) {
  if (type === 'pointerdown' || type === 'mousedown' || type === 'touchstart') return 'pointer';
  if (type === 'keydown' && key === 'Tab') return 'keys';
  return prev === 'pointer' || prev === 'keys' ? prev : null;
}

/** Keep FOCUS_RING's data attribute on doc.documentElement up to date (capture listeners on the window: a pointer
 * press anywhere on the page, a Tab key). Returns a function that removes the listeners. Never throws. */
export function bindFocusRing(win, o = FOCUS_RING) {
  if (!o || o.on !== true || !win || !win.document || typeof win.addEventListener !== 'function') return () => {};
  const root = win.document.documentElement;
  let cur = null;
  const on = e => {
    const next = focusRingInput(cur, e && e.type, e && e.key);
    if (next === cur) return;
    cur = next;
    try { if (next) root.setAttribute(o.attr, next); else root.removeAttribute(o.attr); } catch { /* a ring is a convenience */ }
  };
  const types = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];
  for (const t of types) win.addEventListener(t, on, { capture: true, passive: true });
  return () => { for (const t of types) win.removeEventListener(t, on, { capture: true, passive: true }); };
}
