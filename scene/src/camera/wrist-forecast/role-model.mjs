import {horizons, sides} from './forecast.mjs';
import {roleWeights} from './role-weights.mjs';

const stepMs = 1000 / 30, count = 15, tolerance = 1e-7;
export const roleHistoryMs = (count-1) * stepMs;
export const maxRoleGapMs = 200;
const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const mix = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
const sameShape = (row, aspect) => row?.armGeometry?.aspect === aspect;

// Restrict each interpolation to adjacent captured frames and to the requested time range.
function bracket(rows, t, start, end) {
  let j = start;
  while (j <= end && rows[j].time < t - tolerance) j++;
  if (j > end) return null;
  if (Math.abs(rows[j].time - t) <= tolerance) return {a: j, b: j, fraction: 0};
  if (j === start || rows[j].time - rows[j-1].time > maxRoleGapMs) return null;
  return {a: j-1, b: j, fraction: (t - rows[j-1].time) / (rows[j].time - rows[j-1].time)};
}

function acrossSamples(rows, cuts, read) {
  const first = cuts[0].a, last = cuts.at(-1).b;
  // Even a dropped landmark between adjacent 30 Hz grid times breaks the history.
  const values = [];
  for (let j = first; j <= last; j++) {
    if (j > first && rows[j].time - rows[j-1].time > maxRoleGapMs) return null;
    const p = read(rows[j].armGeometry);
    if (!point(p)) return null;
    values.push(p);
  }
  return cuts.map(({a, b, fraction}) => mix(values[a-first], values[b-first], fraction));
}

function shoulderFrame(lead, other) {
  const offsets = lead.map((p, i) => sub(p, other[i]));
  const widths = offsets.map(d => Math.hypot(...d)).sort((a, b) => a-b);
  const width = widths[7], mean = [0, 1].map(axis => offsets.reduce((n, d) => n + d[axis], 0) / count);
  const length = Math.hypot(...mean);
  if (width < .025 || length < .5 * width) return null;
  const x = mean.map(v => v / length);
  let up = [x[1], -x[0]];
  if (Math.abs(up[1]) < .1) return null;
  if (up[1] > 0) up = up.map(v => -v);
  return {origin: mix(lead.at(-1), other.at(-1), .5), x, up, width};
}

function project(p, frame) {
  const delta = sub(p, frame.origin);
  return [dot(delta, frame.x) / frame.width, dot(delta, frame.up) / frame.width];
}

function slope(path, n) {
  const half = (n-1) / 2, terms = path.slice(-n);
  let square = 0;
  const change = [0, 0];
  for (let i = 0; i < n; i++) {
    const t = (i - half) / 30;
    square += t * t;
    change[0] += t * terms[i][0];
    change[1] += t * terms[i][1];
  }
  return change.map(v => v / square);
}

function predictDelta(features, model) {
  return model.bias.map((bias, k) => features.reduce((sum, f, j) => sum + f * model.coef[j][k], bias));
}

function wristDelta(features, role, automatic) {
  const delta = predictDelta(features, roleWeights[role]);
  if (!automatic) return delta;
  // Swapping the reference shoulder reverses every horizontal feature and displacement.
  // The image-up axis, midpoint and shoulder width are common to both role hypotheses.
  const reverseX = (v, j) => j % 2 === 0 ? -v : v;
  const opposite = role === 'lead' ? 'other' : 'lead';
  const alternate = predictDelta(features.map(reverseX), roleWeights[opposite]).map(reverseX);
  return delta.map((v, j) => (v + alternate[j]) / 2);
}

export function roleForecast(rows, index, method = 'auto') {
  const automatic = method === 'auto';
  if (!automatic && !sides.includes(method)) return {issue: 'Unknown wrist forecast method.'};
  const lead = automatic ? 'rightArm' : method;
  const anchor = rows[index], other = sides.find(side => side !== lead);
  const aspect = anchor?.armGeometry?.aspect;
  if (!(aspect > 0) || !Number.isFinite(aspect)) return {issue: 'This frame has no projected arm landmarks. Record an arm take or try the example.'};
  const cuts = [];
  for (let k = 0; k < count; k++) {
    const cut = bracket(rows, anchor.time - (count-1-k)*stepMs, 0, index);
    if (!cut) return {issue: 'Need 0.467 s of earlier tracking, with gaps of at most 200 ms.'};
    cuts.push(cut);
  }
  const source = rows.slice(cuts[0].a, index + 1);
  if (!source.every(row => sameShape(row, aspect))) return {issue: 'Tracking or the image shape changed within the history.'};
  const shoulders = Object.fromEntries(sides.map(side => [side, acrossSamples(rows, cuts, g => g.shoulders?.[side])]));
  if (sides.some(side => !shoulders[side])) return {issue: 'Both shoulders must stay visible throughout the history.'};
  const frame = shoulderFrame(shoulders[lead], shoulders[other]);
  if (!frame) return {issue: 'The shoulders are too close or edge-on for a stable image frame.'};
  const arms = {};
  for (const side of sides) {
    const paths = [0, 1].map(joint => acrossSamples(rows, cuts, g => g[side]?.[joint]));
    if (paths.some(p => !p)) {
      arms[side] = {issue: 'Wrist or elbow missing during the history.'};
      continue;
    }
    const [wrist, elbow, shoulder] = [...paths, shoulders[side]].map(path => path.map(p => project(p, frame)));
    const last = wrist.at(-1);
    const features = [sub(last, shoulder.at(-1)), sub(elbow.at(-1), shoulder.at(-1)), slope(wrist, count),
      slope(wrist, 5), slope(elbow, count), slope(shoulder, count)].flat();
    const delta = wristDelta(features, side === lead ? 'lead' : 'other', automatic);
    const predictions = horizons.map((_, k) => [last[0] + delta[2*k], last[1] + delta[2*k+1]]);
    arms[side] = predictions.every(point) ? {last, predictions} : {issue: 'Projection exceeds the numeric range.'};
  }
  const shoulderPositions = sides.map(side => project(shoulders[side].at(-1), frame));
  return {frame, aspect, arms, shoulderPositions, originalSamples: source.length, interpolated: cuts.filter(c => c.a !== c.b).length};
}

// This is called only after prediction. Use the pre-cursor projection, even if the torso later moves.
export function laterRoleWrist(rows, index, offset, side, forecast) {
  const target = rows[index].time + offset;
  if (target > rows.at(-1).time + tolerance) return {kind: 'beyond the last frame'};
  const cut = bracket(rows, target, index, rows.length - 1);
  if (!cut) return {kind: 'tracking gap'};
  const a = rows[cut.a], b = rows[cut.b];
  if (![a, b].every(row => sameShape(row, forecast.aspect) && point(row.armGeometry[side]?.[0]))) return {kind: 'tracking gap'};
  return {kind: cut.a === cut.b ? 'sampled' : 'interpolated',
    point: project(mix(a.armGeometry[side][0], b.armGeometry[side][0], cut.fraction), forecast.frame)};
}
