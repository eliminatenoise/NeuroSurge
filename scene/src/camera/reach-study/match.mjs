// Both dimensions share one scale. Preserve time order, aspect and direction.
const N = 30;
const minSamples = 5;
const maxGapMs = 400;
function normalize(samples, minRadius = 0) {
  const first = samples[0], last = samples.at(-1);
  const centered = samples.map(([t, x, y]) => [t, x - first[1], y - first[2]]);
  const radius = Math.max(...centered.map(([, x, y]) => Math.hypot(x, y)));
  if (!(radius > minRadius) || !(last[0] > first[0])) return null;
  let j = 1;
  return Array.from({length: N}, (_, i) => {
    const t = first[0] + (last[0] - first[0]) * i / (N - 1);
    while (j < centered.length - 1 && t > centered[j][0]) j++;
    const a = centered[j - 1], b = centered[j];
    const u = (t - a[0]) / (b[0] - a[0]);
    return [(a[1] + u * (b[1] - a[1])) / radius, (a[2] + u * (b[2] - a[2])) / radius];
  });
}

export function studyShape(record) {
  return normalize(record.path.map(([x, y], i) => [i * 10, x, y]));
}
export function takeShape(take, side) {
  if (!take) return {issue: 'Finish an arm take with C, or try the recorded example below.'};
  if (!['leftArm', 'rightArm', 'bothArms', 'armsAndKnees'].includes(take.limb))
    return {issue: 'This take follows knees. Use C to record an arm.'};
  if (!['leftArm', 'rightArm'].includes(side)) return {issue: 'Choose one arm to compare.'};
  if ((take.limb === 'leftArm' || take.limb === 'rightArm') && take.limb !== side)
    return {issue: 'The other arm was recorded. Choose its side.'};
  const frames = take.frames;
  const valid = frame => Array.isArray(frame.wrists?.[side]) && frame.wrists[side].length === 2 &&
      frame.wrists[side].every(Number.isFinite);
  const first = frames.findIndex(valid), last = frames.findLastIndex(valid);
  if (first < 0) return {issue: 'This take has no observed wrist path for that arm. Record it with C.'};
  const samples = [];
  for (const frame of frames.slice(first, last + 1)) {
    if (!valid(frame))
      return {
        issue: 'The wrist disappeared during this reach. Keep it in view for one continuous take.'
      };
    const t = frame.time, prev = samples.at(-1)?.[0];
    if (!Number.isFinite(t) || (prev !== undefined && (t <= prev || t - prev > maxGapMs)))
      return {issue: 'The tracked samples are too far apart or out of order. Try a continuous reach.'};
    samples.push([t, ...frame.wrists[side]]);
  }
  const span = samples.at(-1)[0] - samples[0][0];
  if (samples.length < minSamples || span < 200)
    return {issue: 'Record at least five visible wrist samples across 0.2 s.'};
  const path = normalize(samples, .025);
  if (!path)
    return {
      issue:
          'Too little motion in the picture plane. Move the wrist more than 2.5% of the frame height.'
    };
  return {path, samples: samples.length, span};
}

export function rankReaches(path, cases) {
  const ranked = [];
  for (const [index, record] of cases.entries()) {
    const shape = studyShape(record);
    if (!shape) continue;
    const squared =
        shape.reduce((sum, [x, y], i) => sum + (x - path[i][0]) ** 2 + (y - path[i][1]) ** 2, 0);
    ranked.push({index, distance: Math.sqrt(squared / N)});
  }
  ranked.sort((a, b) => a.distance - b.distance || a.index - b.index);
  const tied = ranked.filter(r => r.distance - ranked[0].distance <= 1e-10);
  return {ranked, tied};
}
