// Offline inference for one fixed gallery. The package contains normalized candidate
// representations. Only the text path and comparison run when a query is entered.
const METHOD_IDS = ['ridge', 'attention', 'chance', 'task', 'duration', 'context',
  'mask', 'joint', 'wrongRidge', 'wrongAttention', 'length'];
const COSINE = new Set(['ridge', 'wrongRidge', 'attention', 'wrongAttention', 'length']);
const ATTENTION = new Set(['attention', 'wrongAttention']);
const TIES_ALL = new Set(['chance', 'task']);

function fail(message) { throw new TypeError(message); }
function finitePositive(value) { return Number.isSafeInteger(value) && value > 0; }

function openTensors(manifest, buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== manifest.byteLength ||
      !buffer.byteLength || buffer.byteLength % 4) fail('Weight byte length does not match the manifest.');
  const owned = buffer.slice(0);
  const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  const view = new DataView(owned);
  const flat = littleEndian ? new Float32Array(owned) :
    Float32Array.from({length: owned.byteLength / 4}, (_, i) => view.getFloat32(i * 4, true));
  if (!flat.every(Number.isFinite)) fail('Weights must be finite.');
  let offset = 0;
  const tensors = new Map();
  for (const {name, shape} of manifest.tensors) {
    if (typeof name !== 'string' || tensors.has(name) || !Array.isArray(shape) ||
        !shape.length || !shape.every(finitePositive)) fail('Invalid tensor declaration.');
    const end = offset + shape.reduce((a, b) => a * b, 1);
    if (end > flat.length) fail('Tensor exceeds available weights.');
    tensors.set(name, {shape: [...shape], values: flat.subarray(offset, end)});
    offset = end;
  }
  if (offset !== flat.length) fail('Unexpected trailing weights.');
  return (name, ...shape) => {
    const data = tensors.get(name);
    if (!data || data.shape.length !== shape.length || data.shape.some((d, i) => d !== shape[i])) {
      fail('Incorrect shape for ' + name);
    }
    return data.values;
  };
}

function row(matrix, width, i) { return matrix.subarray(i * width, (i + 1) * width); }

function normalized(x) {
  let sum = 0;
  for (const n of x) sum += n * n;
  const norm = Math.max(1e-12, Math.sqrt(sum));
  return x.map(n => n / norm);
}

function prepareQuery(sentence, vocabulary, idf, limit) {
  if (typeof sentence !== 'string') fail('Enter a text description.');
  const ids = [];
  let totalTokens = 0, knownTokens = 0;
  const counts = new Float32Array(idf.length);
  for (const match of sentence.toLowerCase().matchAll(/[a-z]+(?:'[a-z]+)?|[0-9]+/g)) {
    totalTokens++;
    if (ids.length === limit) continue;
    const id = vocabulary.get(match[0]) ?? 1;
    if (id > 1) knownTokens++;
    ids.push(id);
    counts[id]++;
  }
  const usedTokens = ids.length;
  if (!usedTokens) ids.push(1); // Python TextMap represents an empty sentence by one UNK.
  const bow = normalized(counts.map((n, i) => n * idf[i]));
  return {ids, bow, coverage: {totalTokens, usedTokens, knownTokens,
    unknownTokens: usedTokens - knownTokens, truncated: totalTokens > usedTokens,
    allUnknown: usedTokens > 0 && knownTokens === 0, empty: usedTokens === 0}};
}

// Exact GELU activation x*Phi(x), using a convergent positive-term series.
// Matches the frozen TransformerEncoderLayer's activation="gelu".
function gelu(x) {
  if (Math.abs(x) >= 8) return Math.max(x, 0);
  let term = x, sum = x;
  for (let k = 3; k < 257; k += 2) {
    term *= x * x / k;
    sum += term;
    if (Math.abs(term) <= 1e-15 * Math.abs(sum)) break;
  }
  return x * (0.5 + sum * Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI));
}

function affine(x, matrix, bias) {
  return bias.map((b, i) => {
    let sum = b;
    const offset = i * x.length;
    for (let j = 0; j < x.length; j++) sum += x[j] * matrix[offset + j];
    return sum;
  });
}

function textEncoder(get, family, words, limit, width, heads) {
  const tensor = (name, ...dims) => get(family + '.' + name, ...dims);
  const linear = (name, input, output) => {
    const matrix = tensor(name + '.weight', output, input), bias = tensor(name + '.bias', output);
    return x => affine(x, matrix, bias);
  };
  const norm = name => {
    const scale = tensor(name + '.weight', width), bias = tensor(name + '.bias', width);
    return x => {
      const mean = x.reduce((sum, n) => sum + n, 0) / width;
      const variance = x.reduce((sum, n) => sum + (n - mean) ** 2, 0) / width;
      const inv = 1 / Math.sqrt(variance + 1e-5);
      return x.map((n, i) => (n - mean) * inv * scale[i] + bias[i]);
    };
  };
  const embedding = tensor('word.weight', words, width);
  const positions = tensor('text.positions', limit, width);
  const norm1 = norm('text.block.norm1'), norm2 = norm('text.block.norm2');
  const qkvWeight = tensor('text.block.self_attn.in_proj_weight', 3 * width, width);
  const qkvBias = tensor('text.block.self_attn.in_proj_bias', 3 * width);
  const out = linear('text.block.self_attn.out_proj', width, width);
  const up = linear('text.block.linear1', width, 2 * width);
  const down = linear('text.block.linear2', 2 * width, width);
  const finalNorm = norm('text.norm'), project = linear('text.projection', width, width);
  const headWidth = width / heads, inverseScale = 1 / Math.sqrt(headWidth);
  return ids => {
    // Padding tokens cannot contribute to any observed token or to the masked mean.
    const input = ids.map((id, t) =>
      row(embedding, width, id).map((v, i) => v + positions[t * width + i]));
    const packed = input.map(x => affine(norm1(x), qkvWeight, qkvBias));
    const pooled = new Float64Array(width);
    for (let t = 0; t < ids.length; t++) {
      const merged = new Float32Array(width), probs = new Float64Array(ids.length);
      for (let h = 0; h < heads; h++) {
        const first = h * headWidth, end = first + headWidth;
        for (let j = 0; j < packed.length; j++) {
          let score = 0;
          for (let i = first; i < end; i++) score += packed[t][i] * packed[j][width + i];
          probs[j] = score * inverseScale;
        }
        const max = Math.max(...probs);
        let sum = 0;
        for (let j = 0; j < probs.length; j++) sum += (probs[j] = Math.exp(probs[j] - max));
        for (let i = first; i < end; i++) {
          let value = 0;
          for (let j = 0; j < probs.length; j++) value += probs[j] * packed[j][2 * width + i];
          merged[i] = value / sum;
        }
      }
      const attended = out(merged).map((v, i) => v + input[t][i]);
      const delta = down(up(norm2(attended)).map(gelu));
      for (let k = 0; k < width; k++) pooled[k] += Math.fround(attended[k] + delta[k]);
    }
    return normalized(project(finalNorm(Float32Array.from(pooled, v => v / ids.length))));
  };
}

function scoringFunction(method, config, get, meta, gallerySize, words) {
  if (TIES_ALL.has(method)) return () => new Float32Array(gallerySize);
  const dim = config.width;
  if (!finitePositive(dim)) fail('Invalid comparison width for ' + method);
  // Joint nuisance keeps each target block's full-precision 1/sqrt(width) factor.
  const candidates = method === 'joint' ? null : get(config.candidates, gallerySize, dim);
  const jointRows = method === 'joint' ? Array.from({length: gallerySize}, (_, i) => {
    const result = new Float64Array(dim);
    let offset = 0;
    for (const block of ['duration', 'context', 'mask']) {
      const width = block === 'mask' ? dim - 2 : 1;
      const target = row(get('gallery.' + block, gallerySize, width), width, i);
      for (const v of target) result[offset++] = v / Math.sqrt(width);
    }
    return result;
  }) : null;
  let predict;
  if (ATTENTION.has(method)) {
    const encode = textEncoder(get, method, words, meta.textLimit, dim, meta.heads);
    predict = query => encode(query.ids);
  } else {
    const isLength = method === 'length';
    const features = isLength ? 1 : words;
    const coeff = get(method + '.coeff', features + 1, dim);
    if (isLength && (!Number.isFinite(config.center) || !Number.isFinite(config.scale) || config.scale <= 0)) {
      fail('Invalid caption-length training scale.');
    }
    predict = query => {
      const vector = isLength ?
        [Math.fround((Math.log1p(query.coverage.totalTokens) - config.center) / config.scale)] : query.bow;
      const pred = Float64Array.from(row(coeff, dim, features)); // Last coefficient row is the intercept.
      for (let j = 0; j < features; j++) {
        if (!vector[j]) continue;
        const offset = j * dim;
        for (let k = 0; k < dim; k++) pred[k] += vector[j] * coeff[offset + k];
      }
      return COSINE.has(method) ? normalized(pred) : pred;
    };
  }
  return query => {
    const prediction = predict(query);
    return Float64Array.from({length: gallerySize}, (_, i) => {
      const candidate = jointRows ? jointRows[i] : row(candidates, dim, i);
      let sum = 0;
      if (COSINE.has(method)) {
        for (let k = 0; k < dim; k++) sum += prediction[k] * candidate[k];
        return ATTENTION.has(method) ? Math.fround(sum) : sum;
      }
      if (method === 'joint') {
        for (let k = 0; k < dim; k++) sum += (prediction[k] - candidate[k]) ** 2;
      } else {
        // Python evaluates squared candidate values in float32 before combination.
        for (let k = 0; k < dim; k++) {
          sum += prediction[k] ** 2 + Math.fround(candidate[k] ** 2) - 2 * prediction[k] * candidate[k];
        }
      }
      return -sum / dim;
    });
  };
}

/** Construct synchronously from caller-verified assets. An instance owns its weights. */
export function createHandQuery(manifest, weightsArrayBuffer) {
  if (manifest?.schema !== 'holoassist-hand-query-v1') fail('Unsupported hand query package.');
  const {recordingId, segmentIds, terms, textLimit, heads} = manifest;
  if (typeof recordingId !== 'string' || !recordingId || !Array.isArray(segmentIds) || segmentIds.length < 2 ||
      !segmentIds.every(id => typeof id === 'string' && id.length) ||
      new Set(segmentIds).size !== segmentIds.length) fail('Invalid recording gallery.');
  if (!Array.isArray(terms) || terms.length > 512 || new Set(terms).size !== terms.length ||
      !terms.every(w => typeof w === 'string' && /^(?:[a-z]+(?:'[a-z]+)?|[0-9]+)$/.test(w)) ||
      textLimit !== 32 || heads !== 4) fail('Invalid frozen text metadata.');
  const ids = Object.freeze([...segmentIds]);
  const words = terms.length + 2, vocabulary = new Map(terms.map((w, i) => [w, i + 2]));
  const get = openTensors(manifest, weightsArrayBuffer), idf = get('idf', words);
  if (idf[0] !== 0 || idf[1] !== 0) fail('PAD and UNK must contribute zero TF-IDF weight.');
  const score = new Map();
  for (const [method, cfg] of Object.entries(manifest.methods)) {
    if (!METHOD_IDS.includes(method) || (ATTENTION.has(method) && cfg.width !== 32)) fail('Unknown method layout.');
    score.set(method, scoringFunction(method, {...cfg}, get, {textLimit, heads}, ids.length, words));
  }
  if (!score.has('ridge') || !score.has('attention')) fail('Missing frozen geometry model.');
  return Object.freeze({recordingId, segmentIds: ids, methods: Object.freeze([...score.keys()]),
    rank(text, method = 'ridge') {
      if (!score.has(method)) throw new RangeError('Requested hand query method is unavailable.');
      const query = prepareQuery(text, vocabulary, idf, textLimit);
      const scores = score.get(method)(query);
      if (!scores.every(Number.isFinite)) throw new RangeError('Non-finite segment score.');
      const rows = ids.map((segmentId, i) => ({segmentId, score: scores[i]}));
      rows.sort((a, b) => b.score - a.score);
      for (let first = 0; first < rows.length;) {
        let end = first + 1;
        while (end < rows.length && rows[end].score === rows[first].score) end++;
        for (let j = first; j < end; j++) Object.assign(rows[j], {rankMin: first + 1, rankMax: end});
        first = end;
      }
      return {recordingId, method, coverage: query.coverage, rows};
    }});
}

/** Same-origin loader. A query never performs a request. Works on localhost and HTTPS. */
export async function loadHandQuery() {
  const read = async file => {
    const result = await fetch(new URL(file, import.meta.url), {mode: 'same-origin', redirect: 'error'});
    if (!result.ok) throw new Error('Could not load ' + file + ' (HTTP ' + result.status + ').');
    return result;
  };
  const [manifest, bytes] = await Promise.all([
    read('./hand-query.json').then(r => r.json()), read('./hand-query.bin').then(r => r.arrayBuffer())]);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    b => b.toString(16).padStart(2, '0')).join('');
  if (digest !== manifest.sha256) throw new Error('Hand query model does not match the manifest SHA-256.');
  return createHandQuery(manifest, bytes);
}
