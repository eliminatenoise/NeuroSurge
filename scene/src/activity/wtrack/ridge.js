// The rows use the sealed Python ridge design's order and double precision.
export function predictPosition(fit, input, runStart, includeSpikes) {
  const tokens = [];
  for (let i = 1; i < input.times.length; i++) {
    const [x, y] = input.xy[i];
    const [previousX, previousY] = input.xy[i - 1];
    const dt = input.times[i] - input.times[i - 1];
    const query = input.cutoff + (i - 4) / 4;
    tokens.push([x, y, (x - previousX) / dt, (y - previousY) / dt, query - input.times[i]]);
  }
  const [lastX, lastY, vx, vy] = tokens.at(-1);
  const spatial = fit.centers.map(([x, y]) => {
    const dx = (lastX - x) / fit.spacing[0];
    const dy = (lastY - y) / fit.spacing[1];
    return Math.exp(-0.5 * (dx * dx + dy * dy));
  });
  const features = [
    ...tokens.flat(), Math.log1p(input.cutoff - input.start), Math.log1p(input.cutoff - runStart),
    ...spatial, ...spatial.map(s => s * vx), ...spatial.map(s => s * vy)
  ];
  if (includeSpikes) features.push(...input.counts.flat().map(Math.sqrt));
  if (features.length !== fit.coef.length) throw new Error('Feature count differs from the fit');
  let dx = 0, dy = 0;
  for (let i = 0; i < features.length; i++) {
    const z = (features[i] - fit.avg[i]) / fit.sd[i];
    dx += fit.coef[i][0] * z;
    dy += fit.coef[i][1] * z;
  }
  return [lastX + (dx + fit.yavg[0]), lastY + (dy + fit.yavg[1])];
}

export function comparePositions(packet, {times, xy, counts, cutoff, start}) {
  const input = {times, xy, counts, cutoff, start};
  return {
    motion: predictPosition(packet.fits.motion, input, packet.run_start, false),
    combined: predictPosition(packet.fits.combined, input, packet.run_start, true)
  };
}
