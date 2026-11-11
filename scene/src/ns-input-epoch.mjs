/**
 * Input epochs: cancel queued GAME input at a known boundary (pause / resume, focus or page visibility lost, page
 * hidden, Reset body / Reset brain view, the display rescue, an overfull deferred-input list) so nothing pressed before
 * the boundary acts after it. Pure helpers, no DOM; ns-app owns the boundaries (cancelPendingGameplay). Ported from the
 * public main's input-queue update and adapted to the R558 controls (Message 40): Space is the only hand key. A hold or
 * a tap takes hold of something, a double tap turns the limbs, a double tap held keeps turning them slowly
 * (ns-controls SPACE_GESTURE). A boundary ends a grasp (held, or kept by a tap) and a running limb turn alike.
 * A cancellation does not reconstruct physical event times: its generated releases carry the time the boundary was
 * observed.
 */

/** The releases every cancelled epoch ends with, stamped at the observation time: a grasp release (lets go of
 * whatever Space held or kept: the brain grab in ns-actions, the carry of the brain or the mirror body in
 * ns-reference-graph, the app's own-limb hold) and a turn stop (ends a running limb turn; every limb stays where it
 * is). Both are no-ops for the model when nothing is held and nothing turns. */
export const EPOCH_RELEASES = Object.freeze([
  Object.freeze({ type: 'grasp', down: false, safety: true }),
  Object.freeze({ type: 'turn', phase: 'stop', safety: true })
]);

/** Cancel queued GAME input at a known boundary; this does not reconstruct physical event times.
 * api: the ns-controls reducer (needs blur); source: its state. Returns { state, canceled }: state has every key and
 * button released, no drag, no free pointer, empty UI queue and exactly the EPOCH_RELEASES on the game queue;
 * canceled counts what was dropped (plain data for inspect()). Look settings, pitch limits, the look itself, the
 * button's press sequence and the view-request sequence are kept. The source state is not changed. */
export function cancelControlsEpoch(api, source, { timeMs, reason } = {}) {
  if (!api || typeof api.blur !== 'function' || !source || !Array.isArray(source.events)) {
    throw new TypeError('ns:input_epoch: expected controls API and state');
  }
  if (!Number.isFinite(timeMs) || typeof reason !== 'string' || reason.length === 0 || reason.length > 64) {
    throw new TypeError('ns:input_epoch: expected finite observation time and a short reason');
  }
  const canceled = {
    reason, observedAtMs: timeMs,
    gameEvents: source.events.length,
    uiEvents: Array.isArray(source.ui) ? source.ui.length : 0,
    buttonHeld: Boolean(source.button && source.button.down),
    dragTarget: source.drag && source.drag.target || null
  };
  // Only counts above refer to old history. blur may append an up, so give it empty queues to avoid copying history
  // that this boundary deliberately cancels. Settings, key/button identity and all other reducer fields are retained.
  const released = api.blur({ ...source, events: [], ui: [] }, timeMs);
  return {
    state: {
      ...released, ui: [], pointer: null, lookMs: null,
      // Always end a possible model-side grasp and limb turn, including when the key-up was already queued (and is
      // now dropped). The ordinary next simulation step applies them; no pose or simulation clock advances here.
      events: EPOCH_RELEASES.map(ev => ({ ...ev, timeMs }))
    },
    canceled
  };
}

/** Inspect pending record counts before copying, draining, timestamp mapping or model planning. */
export function inspectPendingInput(carried, fresh, limit) {
  if (!Array.isArray(carried) || !Array.isArray(fresh) || !Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('ns:input_epoch: expected pending arrays and a positive integer limit');
  }
  const carriedRecords = carried.length, freshRecords = fresh.length;
  const totalRecords = carriedRecords + freshRecords;
  return { carriedRecords, freshRecords, totalRecords, limit, overflow: totalRecords > limit };
}

/** Retain an entire bounded refused-frame list, with exact event identities/order. Overflow requires cancellation. */
export function retainDeferredInput(events, limit) {
  const capacity = inspectPendingInput([], events, limit);
  return { ...capacity, events: capacity.overflow ? [] : events.slice() };
}

/** Clear transient carry latches while retaining every saved placement, pose and time value: the activity's brain
 * grab (with seedNextGaze, so the next gaze is recorded silently instead of starting a pulse), the brain view's grab
 * and the carry anchors of the brain reference. (ns-app clears the R558 object carry of the brain / mirror body with
 * ns-reference-graph clearObjectCarry and its own-limb hold itself.) Returns the same object when nothing was held. */
export function cancelCarryLatches(source) {
  if (!source || typeof source !== 'object') return source;
  let next = source;
  const replace = (key, value) => { next = { ...next, [key]: value }; };
  if (source.activity && source.activity.brainGrab && source.activity.brainGrab.active === true) {
    replace('activity', { ...source.activity, brainGrab: { ...source.activity.brainGrab, active: false }, seedNextGaze: true });
  }
  if (source.view && source.view.grab && source.view.grab.active === true) {
    replace('view', { ...source.view, grab: { ...source.view.grab, active: false } });
  }
  for (const key of ['referenceBrain', 'objectBrainReference']) {
    if (source[key] && source[key].anchor) replace(key, { ...source[key], anchor: null });
  }
  return next;
}
