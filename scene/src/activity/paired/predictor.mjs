// Frozen NeuroTranslate wrist-pointing model. See NOTICE.md, LICENSE and provenance.json.
import { layout, normalizers, weightHashes } from './tensors.mjs';

const WIDTH = 24, HEADS = 4, HEAD_WIDTH = WIDTH / HEADS, BINS = 16;
const OFFSETS = [384, 512, 640, 768, 896, 1024];
const f32 = Math.fround;
const sources = [
  { field: 'eeg_mean_uv', index: 3, column: 6, channels: 8 },
  { field: 'emg_rms_uv', index: 0, column: 2, channels: 4 },
  { field: 'mean_angles_deg', index: 1, column: 0, channels: 2 },
];
const cache = new Map();

function validateMode(mode) {
  if (typeof mode !== 'string' || !Object.hasOwn(weightHashes, mode)) {
    throw new RangeError('Choose motion, emg or full.');
  }
}

function readRow(row, width, field) {
  if (!Array.isArray(row) || row.length !== width) throw new TypeError(field + ' has the wrong shape.');
  for (let i = 0; i < width; i++) {
    if (!Number.isFinite(row[i])) throw new TypeError(field + ' requires finite numbers.');
  }
  return row;
}

function readHistory(payload, source) {
  const rows = payload[source.field];
  if (!Array.isArray(rows) || rows.length !== BINS) throw new TypeError(source.field + ' requires 16 bins.');
  for (let i = 0; i < BINS; i++) {
    const row = readRow(rows[i], source.channels, source.field);
    if (source.field === 'emg_rms_uv' && row.some(v => v < 0)) {
      throw new RangeError('EMG RMS amplitudes must be nonnegative.');
    }
  }
  return rows;
}

// x * Phi(x), using the positive-term series of the normal integral.
// For |x| >= 8 the omitted tail contributes less than one float32 ULP near +8.
function gelu(x) {
  if (Math.abs(x) >= 8) return x > 0 ? x : 0;
  const square = x * x;
  let sum = x, term = x;
  for (let k = 3; k < 257; k += 2) {
    term *= square / k;
    sum += term;
    if (Math.abs(term) <= 1e-15 * Math.abs(sum)) break;
  }
  return x * (0.5 + sum * Math.exp(-square / 2) / Math.sqrt(2 * Math.PI));
}

function add(left, right) {
  const out = new Float32Array(left.length);
  for (let i = 0; i < out.length; i++) out[i] = left[i] + right[i];
  return out;
}

function matvec(x, weights, bias, rows, first = 0) {
  const out = new Float32Array(rows);
  for (let row = 0; row < rows; row++) {
    const offset = (first + row) * x.length;
    let sum = bias[first + row];
    for (let k = 0; k < x.length; k++) sum += weights[offset + k] * x[k];
    out[row] = sum;
  }
  return out;
}

function applyModel(mode, state) {
  // Match the canonical MODALITIES order. Absent keys have zero attention weight.
  const used = sources.slice(mode === 'full' ? 0 : mode === 'emg' ? 1 : 2);
  const norm = normalizers;
  const linear = (name, x) => {
    const bias = state[name + '.bias'];
    return matvec(x, state[name + '.weight'], bias, bias.length);
  };
  const layerNorm = (name, x) => {
    let avg = 0, variance = 0;
    for (const n of x) avg += n;
    avg /= x.length;
    for (const n of x) variance += (n - avg) ** 2;
    const inverseSD = 1 / Math.sqrt(variance / x.length + 1e-5);
    const scale = state[name + '.weight'], bias = state[name + '.bias'];
    return x.map((v, i) => (v - avg) * inverseSD * scale[i] + bias[i]);
  };
  const mlp = (name1, name2, x) => linear(name2, linear(name1, x).map(gelu));
  const time = (name, seconds) => mlp(name + '.net.0', name + '.net.2',
    new Float32Array([seconds, Math.sin(seconds), Math.cos(seconds)]));

  // Queries, keys and values use separate consecutive row blocks in PyTorch's packed matrix.
  function attention(name, queries, tokens, causal = false) {
    const weights = state[name + '.in_proj_weight'], bias = state[name + '.in_proj_bias'];
    const keys = tokens.map(x => matvec(x, weights, bias, WIDTH, WIDTH));
    const values = tokens.map(x => matvec(x, weights, bias, WIDTH, 2 * WIDTH));
    return queries.map((x, position) => {
      const query = matvec(x, weights, bias, WIDTH);
      const count = causal ? position + 1 : keys.length;
      const merged = new Float32Array(WIDTH), scores = new Float64Array(count);
      for (let head = 0; head < HEADS; head++) {
        const first = head * HEAD_WIDTH;
        let max = -Infinity, sum = 0;
        for (let j = 0; j < count; j++) {
          let score = 0;
          for (let k = first; k < first + HEAD_WIDTH; k++) score += query[k] * keys[j][k];
          scores[j] = score / Math.sqrt(HEAD_WIDTH);
          max = Math.max(max, scores[j]);
        }
        for (let j = 0; j < count; j++) {
          scores[j] = Math.exp(scores[j] - max);
          sum += scores[j];
        }
        for (let k = first; k < first + HEAD_WIDTH; k++) {
          let value = 0;
          for (let j = 0; j < count; j++) value += scores[j] / sum * values[j][k];
          merged[k] = value;
        }
      }
      return linear(name + '.out_proj', merged);
    });
  }

  const historyTimes = Array.from({ length: BINS }, (_, bin) => time('history_time', (bin - 15) * 16 / 512));
  const queryTime = time('forecast_decoder.time', 128 / 512);

  function encode(source, raw, anchor) {
    const { field, index, column, channels } = source;
    const measured = new Float32Array(channels * 2).fill(1); // All channels in the selected source are observed.
    for (let i = 0; i < channels; i++) {
      const value = f32(field === 'mean_angles_deg' ? raw[i] - anchor[i] : raw[i]);
      measured[i] = f32(value - f32(norm.bins_center[column + i])) / f32(norm.bins_scale[column + i]);
    }
    const base = 'encoders.source_' + index;
    const hidden = layerNorm(base + '.2', linear(base + '.0', measured).map(gelu));
    const embedding = state['source_embeddings.weight'].subarray(index * WIDTH, (index + 1) * WIDTH);
    return add(linear(base + '.3', hidden), embedding);
  }

  return Object.freeze({ predict(payload) {
    if (!payload || typeof payload !== 'object') throw new TypeError('Supply a pointing-task window.');
    const anchor = readRow(payload.anchor_deg, 2, 'anchor_deg');
    const slot = OFFSETS.indexOf(payload.target_offset_after_cue_ticks);
    if (slot < 0) throw new RangeError('Target tick must be one of 384, 512, 640, 768, 896 or 1024.');
    const streams = used.map(source => readHistory(payload, source));
    const contextInput = new Float32Array(8);
    for (let i = 0; i < 2; i++) contextInput[i] = (anchor[i] - norm.anchor_center[i]) / norm.anchor_scale[i];
    contextInput[2 + slot] = 1;
    const context = layerNorm('context.2', linear('context.0', contextInput).map(gelu));

    const history = historyTimes.map((timestamp, bin) => {
      const tokens = used.map((source, i) => encode(source, streams[i][bin], anchor));
      tokens.push(context);
      return add(attention('fusion', [context], tokens)[0], timestamp);
    });
    const temporal = 'temporal.layers.0';
    const normalized = history.map(x => layerNorm(temporal + '.norm1', x));
    const temporalAttention = attention(temporal + '.self_attn', normalized, normalized, true);
    const memory = history.map((x, i) => {
      const attended = add(x, temporalAttention[i]);
      const z = layerNorm(temporal + '.norm2', attended);
      return add(attended, mlp(temporal + '.linear1', temporal + '.linear2', z));
    });

    const query = add(queryTime, context);
    const decoded = layerNorm('forecast_decoder.norm1',
      add(query, attention('forecast_decoder.attention', [query], memory)[0]));
    const hidden = layerNorm('forecast_decoder.norm2',
      add(decoded, mlp('forecast_decoder.ff.0', 'forecast_decoder.ff.3', decoded)));
    const output = mlp('heads.source_2.0', 'heads.source_2.2', hidden);
    const angle_deg = [], variance_deg2 = [];
    for (let axis = 0; axis < 2; axis++) {
      const scale = f32(norm.residual_scale[axis]);
      const residual = f32(f32(output[axis] * scale) + f32(norm.residual_center[axis]));
      angle_deg.push(anchor[axis] + residual);
      const logVar = Math.max(-6, Math.min(6, output[2 + axis]));
      variance_deg2.push(f32(Math.exp(f32(logVar + 2 * f32(Math.log(scale))))));
    }
    if (!angle_deg.every(Number.isFinite) || !variance_deg2.every(x => Number.isFinite(x) && x > 0)) {
      throw new RangeError('This window exceeds the numerical range of the model.');
    }
    return { angle_deg, variance_deg2 };
  } });
}

/** Create a predictor from the complete verified float32 asset for this mode. */
export async function createPairedPredictor(mode, buffer) {
  validateMode(mode);
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError('Expected an ArrayBuffer of frozen weights.');
  const owned = buffer.slice(0);
  const hash = await crypto.subtle.digest('SHA-256', owned);
  const hex = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
  if (hex !== weightHashes[mode]) throw new Error('The wrist model weights differ from the published export.');

  const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  const view = new DataView(owned);
  const floats = littleEndian ? new Float32Array(owned) :
    Float32Array.from({ length: owned.byteLength / 4 }, (_, i) => view.getFloat32(4 * i, true));
  const state = Object.create(null);
  for (const [name, [offset, ...shape]] of Object.entries(layout)) {
    state[name] = floats.subarray(offset, offset + shape.reduce((a, b) => a * b, 1));
  }
  return applyModel(mode, state);
}

/** Fetch the chosen mode once from this module's sibling weights directory. */
export async function loadPairedPredictor(mode) {
  validateMode(mode);
  if (!cache.has(mode)) {
    const pending = (async () => {
      const response = await fetch(new URL('./weights/' + mode + '.bin', import.meta.url));
      if (!response.ok) throw new Error('Could not load the ' + mode + ' wrist model (HTTP ' + response.status + ').');
      return createPairedPredictor(mode, await response.arrayBuffer());
    })();
    cache.set(mode, pending);
    pending.catch(() => cache.delete(mode));
  }
  return cache.get(mode);
}
