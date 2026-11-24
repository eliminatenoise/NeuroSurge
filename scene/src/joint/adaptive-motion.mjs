export const BASE_FORECASTS = ['persistence', 'velocity', 'attention', 'recent_line', 'recent_curve'];

export function movementForecast(activity, forecasts) {
  const rule = {A1D1: 'velocity', A3D1: 'recent_curve', A6D1: 'recent_curve', A9D3: 'persistence'}[activity];
  if (!rule) throw new Error('The named forecast requires one of the four tested movements');
  return {known_movement: forecasts[rule], movementRule: rule};
}

export function newCameraHistory() {
  return {pending: [], losses: null, matured: 0, observedAt: null, lastEvidence: null};
}

export function advanceCameraHistory(state, frame, observeTarget) {
  const pending = [];
  for (const comparison of state.pending) {
    observeTarget(comparison, frame);
    if (!comparison.closed) {
      pending.push(comparison);
      continue;
    }
    if (!comparison.match) continue;
    const {packet, match, forecasts} = comparison;
    const retained = state.losses ? 2 ** (-(frame.t - state.observedAt)) : 0;
    state.losses = BASE_FORECASTS.map((method, index) => {
      const [x, y] = forecasts[method];
      const distance = Math.hypot(x - match.coordinates[0], y - match.coordinates[1]) / packet.radius;
      return retained * (state.losses?.[index] ?? 0) + (1 - retained) * distance;
    });
    state.observedAt = frame.t;
    state.matured++;
    state.lastEvidence = {issue: packet.issue, target: packet.issue + packet.lead, matched: match.time, resolved: frame.t};
  }
  state.pending = pending;
}

export function cameraForecasts(state, forecasts) {
  let best = 0;
  let weights = [1, 0, 0, 0, 0];
  if (state.losses) {
    for (let index = 1; index < state.losses.length; index++) {
      if (state.losses[index] < state.losses[best]) best = index;
    }
    const scale = Math.max(.01, state.losses[0] / 4);
    const scores = state.losses.map(loss => Math.exp(-(loss - state.losses[best]) / scale));
    const total = scores.reduce((sum, score) => sum + score, 0);
    weights = scores.map(score => score / total);
  }
  const blended = [0, 1].map(axis => BASE_FORECASTS.reduce(
    (sum, method, index) => sum + weights[index] * forecasts[method][axis], 0,
  ));
  return {
    camera_choice: forecasts[BASE_FORECASTS[best]], camera_blend: blended,
    cameraEvidence: {matured: state.matured, rule: BASE_FORECASTS[best], weights,
      losses: state.losses, last: state.lastEvidence},
  };
}

export function queueCameraForecast(state, packet, forecasts) {
  state.pending.push({packet, forecasts, closed: false, match: null});
}
