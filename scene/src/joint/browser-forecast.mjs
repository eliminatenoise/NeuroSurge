import { checkpointSha256, tensors } from './model/weights.mjs';

const WIDTH = 32;
const HEAD_WIDTH = 8;
const HEADS = WIDTH / HEAD_WIDTH;
const f32 = Math.fround;
const weights = Object.fromEntries(Object.entries(tensors).map(([name, encoded]) => {
  const bytes = Uint8Array.from(atob(encoded), byte => byte.charCodeAt(0));
  const littleEndian = new DataView(bytes.buffer);
  const values = new Float32Array(bytes.length / 4);
  for (let i = 0; i < values.length; i++) values[i] = littleEndian.getFloat32(i * 4, true);
  return [name, values];
}));
const frequencies = Float32Array.from({ length: WIDTH / 2 }, (_, i) =>
  f32(Math.exp(f32(2 * i * f32(-Math.log(10000) / WIDTH)))));

function linear(name, input) {
  const matrix = weights[name + '.weight'];
  return weights[name + '.bias'].map((bias, output) => {
    let sum = 0;
    const row = output * input.length;
    for (let i = 0; i < input.length; i++) sum += input[i] * matrix[row + i];
    return f32(sum) + bias;
  });
}

function layerNorm(name, residual, update) {
  const values = residual.map((value, i) => value + update[i]);
  const mean = f32(values.reduce((sum, value) => sum + value, 0) / WIDTH);
  const centered = values.map(value => value - mean);
  const variance = f32(centered.reduce((sum, value) => sum + f32(value * value), 0) / WIDTH);
  const scale = f32(Math.sqrt(f32(variance + 1e-5)));
  return centered.map((value, i) => f32(f32(value / scale) * weights[name + '.weight'][i]) + weights[name + '.bias'][i]);
}

function softmax(values) {
  const max = values.reduce((left, right) => Math.max(left, right), -Infinity);
  const exponentials = values.map(value => Math.exp(f32(value - max)));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => value / total);
}

function projectedHistory(task, history, steps, channels) {
  if (!Array.isArray(history) || history.length !== steps) throw new Error('Wrong number of model input frames.');
  let observed = false;
  const sequence = history.map((row, time) => {
    if (!Array.isArray(row) || row.length !== channels) throw new Error('Wrong number of model input channels.');
    const features = new Float32Array(channels * 2);
    for (let i = 0; i < channels; i++) {
      const value = row[i];
      if (value === null) continue;
      if (!Number.isFinite(value) || !Number.isFinite(f32(value))) throw new Error('Use finite readings or null.');
      if (task === 'rat_next_unit' && (i < 4 ? value < 0 : value !== 0 && value !== 1)) {
        throw new Error('Use nonnegative spike features and a 0 or 1 event flag.');
      }
      observed = true;
      features[i] = f32(f32(value) - weights[task + '.xmean'][i]) / weights[task + '.xscale'][i];
      features[channels + i] = 1;
    }
    const projected = linear('adapters.' + task, features);
    for (let i = 0; i < WIDTH; i += 2) {
      const phase = f32((time + 1 - steps) * frequencies[i / 2]);
      projected[i] += f32(Math.sin(phase));
      projected[i + 1] += f32(Math.cos(phase));
    }
    return projected;
  });
  if (!observed) throw new Error('A forecast needs an observed reading.');
  return sequence;
}

function inference(task, sequence) {
  const latest = sequence.at(-1);
  const query = linear('trunk.q', latest);
  const memory = [weights['trunk.null'], ...sequence];
  const keys = memory.map(row => linear('trunk.k', row));
  const values = memory.map(row => linear('trunk.v', row));
  const pooled = new Float32Array(WIDTH);
  for (let head = 0; head < HEADS; head++) {
    const first = head * HEAD_WIDTH;
    const last = first + HEAD_WIDTH;
    const scores = keys.map(key => {
      let dot = 0;
      for (let i = first; i < last; i++) dot += f32(query[i] * key[i]);
      return f32(f32(dot) / f32(Math.sqrt(HEAD_WIDTH)));
    });
    const attention = softmax(scores);
    for (let i = first; i < last; i++) {
      pooled[i] = values.reduce((sum, value, j) => sum + f32(attention[j] * value[i]), 0);
    }
  }
  const attended = layerNorm('trunk.ln1', latest, linear('trunk.proj', pooled));
  const expanded = linear('trunk.ff1', attended).map(value => Math.max(value, 0));
  const encoded = layerNorm('trunk.ln2', attended, linear('trunk.ff2', expanded));
  return linear('outputs.' + task, encoded);
}

/** Match the rows and physical units returned by the local model for one request. */
export function predictBrowserTask(task, histories) {
  if (!Array.isArray(histories) || histories.length !== 1) throw new Error('Choose one model input history.');
  const input = histories[0];
  let prediction;
  if (task === 'landmark_motion') {
    const output = inference(task, projectedHistory(task, input, 5, 8));
    prediction = Array.from(output, (value, i) => f32(f32(value * weights[task + '.yscale'][i]) + weights[task + '.ymean'][i]));
  } else if (task === 'rat_next_unit' && Array.isArray(input) && input.length) {
    prediction = softmax(input.map(history => inference(task, projectedHistory(task, history, 1, 5))[0]));
  } else throw new Error('Choose a supported browser forecast.');
  if (!prediction.every(Number.isFinite)) throw new Error('Input magnitude exceeds the model numerical range.');
  return { task, checkpoint_sha256: checkpointSha256, prediction: [prediction] };
}
