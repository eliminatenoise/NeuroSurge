/** Cancel queued GAME input at a known boundary; this does not reconstruct physical event times. */
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
  const released = api.blur(source, timeMs);
  return {
    state: {
      ...released, ui: [], pointer: null, lookMs: null,
      // Always end a possible model-side tap chain, including when key-up was already queued.
      // The ordinary next simulation step owns opening; no pose or simulation clock advances here.
      events: [{ type: 'space', down: false, safety: true, timeMs }]
    },
    canceled
  };
}

/** Clear transient carry latches while retaining every saved placement, pose and time value. */
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
