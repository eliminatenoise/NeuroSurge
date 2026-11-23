// Seed 17 of the two-stage reach study. Only the twenty pre-cutoff rows enter here.
const add = (x, y) => x.map((v, i) => v + y[i]);
const subtract = (x, y) => x.map((v, i) => v - y[i]);
const dot = (x, y) => x.reduce((sum, v, i) => sum + v * y[i], 0);
const standardize = (x, mean, scale) => x.map((v, i) => (v - mean[i]) / scale[i]);

function dense(x, weights, layer) {
  const bias = weights[layer + '.bias'];
  return weights[layer + '.weight'].map((row, i) => dot(row, x) + bias[i]);
}

function normalize(x, weights, layer) {
  const mean = x.reduce((sum, v) => sum + v, 0) / x.length;
  const centered = x.map(v => v - mean);
  const scale = Math.sqrt(dot(centered, centered) / x.length + 1e-5);
  return centered.map((v, i) => v / scale * weights[layer + '.weight'][i] + weights[layer + '.bias'][i]);
}

// Both networks use a single attention layer. Only the readout token is needed
// after it; every input token still supplies a key and value to that readout.
function attend(tokens, readout, weights) {
  const width = tokens[0].length, headWidth = 8;
  const qkv = tokens.map(x => dense(x, weights, 'qkv'));
  const merged = [];
  for (let start = 0; start < width; start += headWidth) {
    const query = qkv[readout].slice(start, start + headWidth);
    const scores = qkv.map(v => dot(query, v.slice(width + start, width + start + headWidth)) / Math.sqrt(headWidth));
    const maximum = Math.max(...scores);
    const terms = scores.map(v => Math.exp(v - maximum));
    const total = terms.reduce((a, b) => a + b, 0);
    for (let j = 0; j < headWidth; j++) {
      merged.push(terms.reduce((sum, v, i) => sum + v / total * qkv[i][2 * width + start + j], 0));
    }
  }
  return dense(merged, weights, 'project');
}

function feedForward(x, weights, first, second) {
  const positive = dense(x, weights, first).map(v => Math.max(0, v));
  return dense(positive, weights, second);
}

function movementForecast({pose, spikes, cue}, w) {
  const tokens = pose.map((position, t) => {
    const difference = subtract(position, pose[Math.max(0, t - 1)]);
    const raw = [...position, ...difference, ...spikes[t].map(Math.sqrt), ...cue[t]];
    return add(dense(standardize(raw, w.x_mean, w.x_scale), w, 'embed'), w.position[t]);
  });
  const attended = normalize(add(tokens[19], attend(tokens, 19, w)), w, 'attention_norm');
  const readout = normalize(add(attended, feedForward(attended, w, 'expand', 'reduce')), w, 'final_norm');
  const flat = dense(readout, w, 'out');
  return w.y_mean.map((mean, t) => mean.map((v, j) => v + flat[t * 8 + j] * w.y_scale[j]));
}

function patches(rows, weights, layer) {
  const out = [];
  for (let i = 0; i < rows.length; i += 5) out.push(dense(rows.slice(i, i + 5).flat(), weights, layer));
  return out;
}

function countForecast({pose, spikes, cue}, path, w) {
  const history = pose.map((position, i) => [
    ...standardize([...position, ...subtract(position, pose[19])], w.pose_mean, w.pose_scale),
    ...standardize(spikes[i], w.spikes_mean, w.spikes_scale),
    ...standardize(cue[i], w.cue_mean, w.cue_scale)
  ]);
  const future = path.map(row => w.arm === 'full'
    ? standardize(row, w.movement_mean, w.movement_scale)
    : Array(8).fill(0));
  const tokens = [Array(16).fill(0), ...patches(history, w, 'hist'), ...patches(future, w, 'path')]
    .map((x, i) => add(x, w.position[0][i]));
  const attended = add(tokens[0], attend(tokens.map(x => normalize(x, w, 'norm1')), 0, w));
  const readout = add(attended, feedForward(normalize(attended, w, 'norm2'), w, 'ff1', 'ff2'));
  const means = dense(normalize(readout, w, 'read_norm'), w, 'read')
    .map(x => Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))) + 1e-6);
  return Array.from({length:10}, (_, i) => means.slice(i * 23, (i + 1) * 23));
}

export function forecastReach(history, models) {
  for (const [field, width] of [['pose',8], ['cue',3], ['spikes',23]]) {
    const rows = history[field];
    if (rows?.length !== 20 || !rows.every(row => row.length === width && row.every(Number.isFinite))) {
      throw Error('Expected twenty complete rows of ' + field);
    }
  }
  if (history.spikes.some(row => row.some(v => !Number.isSafeInteger(v) || v < 0))) throw Error('Invalid recorded count');
  for (const [name, model] of Object.entries(models)) {
    if (model.seed !== 17 || model.family !== 'transformer' || model.arm !== (name === 'direct' ? 'direct' : 'full') ||
        JSON.stringify(model.unit_guide) !== JSON.stringify(history.unit_guide)) throw Error('Incompatible reach model or unit order');
  }
  const movement = movementForecast(history, models.motor);
  return {movement, full:countForecast(history, movement, models.full), direct:countForecast(history, movement, models.direct)};
}
