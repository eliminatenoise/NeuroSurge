// Coordinates already share the camera's outward/up axes in units of image height.
// Frame time is milliseconds since Record take, including time before the first observation.
export const sides = ['leftArm', 'rightArm'];
export const horizons = [8000 / 30, 15000 / 30];
export const maxGapMs = 250;
const historyMs = 500, minSpanMs = 90, minPairMs = 30;
const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const epsilonMs = 1e-7;

export function wristFrames(take) {
  if (!Array.isArray(take?.frames)) return [];
  const frames = [];
  for (const frame of take.frames) {
    // Reject a damaged time axis rather than silently sorting or bridging over bad frames.
    if (!Number.isFinite(frame?.time) || frame.time < 0 || frame.time <= (frames.at(-1)?.time ?? -1)) return [];
    const row = {time: frame.time};
    for (const side of sides) row[side] = point(frame.wrists?.[side]) ? [...frame.wrists[side]] : null;
    if (frame.armGeometry) row.armGeometry = frame.armGeometry;
    frames.push(row);
  }
  return frames;
}

function median(values) {
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

export function wristTrend(frames, index, side) {
  const anchor = frames[index];
  if (!anchor?.[side]) return {issue: 'No visible wrist at this time.'};
  let first = index;
  while (first > 0 && frames[first - 1][side] &&
         frames[first].time - frames[first - 1].time <= maxGapMs &&
         anchor.time - frames[first - 1].time <= historyMs) first--;
  const count = index - first + 1, span = anchor.time - frames[first].time;
  if (count < 3 || span < minSpanMs)
    return {issue: 'Need three uninterrupted wrist samples spanning at least 90 ms.'};
  const x = [], y = [];
  for (let j = first; j < index; j++) {
    for (let k = j + 1; k <= index; k++) {
      const dt = frames[k].time - frames[j].time;
      if (dt < minPairMs) continue;
      x.push((frames[k][side][0] - frames[j][side][0]) / dt);
      y.push((frames[k][side][1] - frames[j][side][1]) / dt);
    }
  }
  const velocity = [median(x), median(y)];
  const predictions = horizons.map(dt => anchor[side].map((v, axis) => v + dt * velocity[axis]));
  if (!predictions.every(point)) return {issue: 'Wrist coordinates exceed the numeric range.'};
  return {count, span, velocity, predictions};
}

// These later frames are consulted only for the comparison, after fitting the past.
export function wristObservation(frames, index, side, offsetMs) {
  const target = frames[index].time + offsetMs;
  let j = index + 1;
  while (j < frames.length && frames[j].time < target - epsilonMs) j++;
  if (j === frames.length) return {kind: 'beyond the last frame'};
  const after = frames[j];
  if (Math.abs(after.time - target) <= epsilonMs)
    return after[side] ? {kind: 'sampled', point: after[side]} : {kind: 'tracking gap'};
  const before = frames[j - 1], dt = after.time - before.time;
  if (!before[side] || !after[side] || dt > maxGapMs) return {kind: 'tracking gap'};
  const part = (target - before.time) / dt;
  return {kind: 'interpolated', point: before[side].map((v, axis) => v + part * (after[side][axis] - v))};
}

// An authored bilateral trajectory with an interruption on the left. No recorded person.
export function exampleTake() {
  const frames = [];
  for (let i = 0; i <= 84; i++) {
    const time = i * 50, t = time / 1000;
    const wrists = {rightArm: [.16 + .12 * Math.sin(2.4 * t), -.12 + .18 * Math.sin(1.7 * t + .4)]};
    if (i < 55 || i > 61) wrists.leftArm = [.18 + .09 * Math.sin(1.9 * t), -.1 - .16 * Math.cos(2.2 * t)];
    const shoulders = {rightArm: [.43, .39], leftArm: [.69, .36]};
    const armGeometry = {aspect: 1, shoulders};
    for (const side of sides) {
      if (!wrists[side]) continue;
      const root = shoulders[side], sign = side === 'leftArm' ? 1 : -1;
      const wrist = [root[0] + sign * wrists[side][0], root[1] - wrists[side][1]];
      const elbow = [(root[0] + wrist[0]) / 2 + sign * .04, (root[1] + wrist[1]) / 2 + .08];
      armGeometry[side] = [wrist, elbow];
    }
    frames.push({time, wrists, armGeometry});
  }
  return {frames};
}
