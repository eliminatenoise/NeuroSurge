// NeuroTranslate shared motion predictor. The packager inserts the original float32 tensor bytes.
// One classic script works from local files. predictor.mjs provides the same API to ES modules.
(() => {
  'use strict';
  const checkpoint = {"sourceSha256": "9a3649cb8f2119984e7f9f0b96a07bdc95e1833c7068f0e9caef2680f22e3179", "weightsSha256": "950b480e52f5ae6fd880f2cb6636b697c8d22e8fefe55d3400c8500018779750", "values": 5234};
  const layout = [["blocks.0.attention_norm.bias", 24], ["blocks.0.attention_norm.weight", 24], ["blocks.0.attention_out.bias", 24], ["blocks.0.attention_out.weight", 576], ["blocks.0.ff_in.bias", 48], ["blocks.0.ff_in.weight", 1152], ["blocks.0.ff_norm.bias", 24], ["blocks.0.ff_norm.weight", 24], ["blocks.0.ff_out.bias", 24], ["blocks.0.ff_out.weight", 1152], ["blocks.0.qkv.bias", 72], ["blocks.0.qkv.weight", 1728], ["last_norm.bias", 24], ["last_norm.weight", 24], ["position", 96], ["project.bias", 24], ["project.weight", 144], ["readout.bias", 2], ["readout.weight", 48]];
  const encodedWeights = '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';
  const width = 24;
  const heads = 4;
  const headWidth = width / heads;
  const taps = [-1, -.75, -.5, -.25, 0];
  const clockEpsilon = 1e-10;
  let modelPromise;

  function domainIndex(domain) {
    if (domain === 'wrist') return 0;
    if (domain === 'rat') return 1;
    throw new RangeError('Choose wrist or rat.');
  }

  function finiteRow(row, length) {
    if (!Array.isArray(row) || row.length !== length) return false;
    for (const value of row) if (!Number.isFinite(value)) return false;
    return true;
  }

  // Raw tokens have the validation contract of the published NumPy predictor.
  // Visibility, clock agreement and continuity can only be verified on source observations.
  function checkIntervals(intervals) {
    if (!Array.isArray(intervals) || intervals.length !== 4) {
      throw new TypeError('Supply four chronological motion intervals.');
    }
    for (let i = 0; i < 4; i++) {
      if (!finiteRow(intervals[i], 5)) throw new TypeError('Each interval needs five finite numbers.');
      const [step, dt, age, twoStep, cosine] = intervals[i];
      if (step < 0 || twoStep < 0 || dt < .2-1e-7 || dt > .3+1e-7 ||
          age < -1e-7 || age > .05+1e-7 || Math.abs(cosine) > 1+1e-6 ||
          (i === 0 && (Math.abs(twoStep) > 1e-7 || Math.abs(cosine) > 1e-7))) {
        throw new RangeError('Interval falls outside the measured motion contract.');
      }
    }
  }

  function recent(intervals) {
    const [step, dt, age] = intervals[3];
    return step / dt * (.25 + age);
  }

  function recentDistance(intervals) {
    checkIntervals(intervals);
    const distance = recent(intervals);
    if (!Number.isFinite(distance)) throw new RangeError('Distance exceeds the numerical range.');
    return distance;
  }

  function difference(left, right) {
    return left.map((value, i) => value - right[i]);
  }

  function historyFromGeometry({domain, cutoffS, samples}) {
    const wrist = domainIndex(domain) === 0;
    if (!Number.isFinite(cutoffS) || !Array.isArray(samples) || samples.length < 5) {
      throw new TypeError('Supply the cutoff in seconds and a dense history from one recording.');
    }
    const observations = [];
    let lastObserved = -Infinity, lastGrid = -Infinity;
    for (const row of samples) {
      if (!row || !Number.isFinite(row.timeS) || row.timeS > cutoffS) {
        throw new RangeError('Each observation needs a finite native time at or before the cutoff.');
      }
      // The human export can repeat a native observation across multiple RGB frames.
      const grid = wrist ? row.gridTimeS : (row.gridTimeS ?? row.timeS);
      if (!Number.isFinite(grid) || grid <= lastGrid || row.timeS < lastObserved ||
          (!wrist && grid !== row.timeS)) {
        throw new RangeError('Check the source clock, frame order and grid times.');
      }
      const first = row.timeS !== lastObserved;
      lastObserved = row.timeS;
      lastGrid = grid;
      if (wrist) {
        if ([row.active, row.valid, row.tracked].some(v => typeof v !== 'boolean')) {
          throw new TypeError('Wrist observations require boolean active, valid and tracked flags.');
        }
        if (!first || !(row.active && row.valid && row.tracked)) continue;
      }
      // Explicit null marks a missing coordinate. It contributes no observed position.
      if (row.positionCm === null) continue;
      if (!finiteRow(row.positionCm, wrist ? 3 : 2)) {
        throw new TypeError('Supply finite positions in centimetres, or null for a missing observation.');
      }
      observations.push({time:row.timeS, grid, point:row.positionCm});
    }

    let index = -1;
    const selected = [];
    const ages = [];
    for (const tap of taps) {
      const requested = cutoffS + tap;
      while (index + 1 < observations.length && observations[index + 1].time <= requested) index++;
      if (index < 0 || requested - observations[index].time > .05 + clockEpsilon ||
          index === selected[selected.length - 1]) {
        throw new RangeError('Five distinct observations within 50 ms of their taps are required.');
      }
      selected.push(index);
      ages.push(requested - observations[index].time);
    }
    for (let i = selected[0] + 1; i <= selected[4]; i++) {
      if (observations[i].time - observations[i-1].time > .100 + clockEpsilon) {
        throw new RangeError('The history contains a tracking gap longer than 100 ms.');
      }
    }
    const points = selected.map(i => observations[i]);
    const clockOffsets = points.map(row => row.grid - row.time);
    if (Math.max(...clockOffsets) - Math.min(...clockOffsets) > .05 + clockEpsilon) {
      throw new RangeError('Elapsed native and grid times differ by more than 50 ms.');
    }
    const intervals = [];
    let previous;
    for (let i = 1; i < points.length; i++) {
      const step = difference(points[i].point, points[i-1].point);
      const length = Math.hypot(...step);
      let twoStep = 0, cosine = 0;
      if (previous) {
        twoStep = Math.hypot(...difference(points[i].point, points[i-2].point));
        const prevLength = intervals[i-2][0];
        if (prevLength && length) {
          const dot = step.reduce((sum, value, j) => sum + (value / length) * (previous[j] / prevLength), 0);
          cosine = Math.min(1, Math.max(-1, dot));
        }
      }
      intervals.push([length, points[i].time - points[i-1].time, ages[i], twoStep, cosine]);
      previous = step;
    }
    checkIntervals(intervals);
    return intervals;
  }

  function linear(state, key, input) {
    const weight = state[key+'.weight'], bias = state[key+'.bias'];
    const output = new Float64Array(bias.length);
    for (let row = 0; row < bias.length; row++) {
      let sum = 0;
      const offset = row * input.length;
      for (let i = 0; i < input.length; i++) sum += weight[offset+i] * input[i];
      output[row] = sum + bias[row];
    }
    return output;
  }

  function normalize(state, name, input) {
    let mean = 0, variance = 0;
    for (const value of input) mean += value;
    mean /= width;
    for (const value of input) variance += (value - mean) ** 2;
    const sd = Math.sqrt(variance / width + 1e-5);
    const weight = state[name+'.weight'], bias = state[name+'.bias'];
    return input.map((v,i) => (v - mean) / sd * weight[i] + bias[i]);
  }

  function forecast(state, domain, intervals) {
    const selected = domainIndex(domain);
    checkIntervals(intervals);
    const tokens = intervals.map(([length,dt,age,chord,cosine], index) => {
      const physical = [Math.log1p(length), (dt-.25)/.05, age/.05, Math.log1p(chord), cosine,
                        Math.log1p(.25 * length / dt)];
      const projected = linear(state, 'project', physical);
      return projected.map((v,i) => v + state.position[index*width+i]);
    });
    const block = 'blocks.0.';
    const packed = tokens.map(z => linear(state, block+'qkv', normalize(state, block+'attention_norm', z)));
    // This checkpoint has one block and a last-token readout. Its last query attends
    // to all four keys and values. Earlier output rows cannot reach the readout.
    const mixed = new Float64Array(width);
    for (let h = 0; h < heads; h++) {
      const start = h * headWidth;
      const scores = packed.map(row => {
        let score = 0;
        for (let i = start; i < start + headWidth; i++) score += packed[3][i] * row[width+i];
        return score / Math.sqrt(headWidth);
      });
      const max = Math.max(...scores);
      const exps = scores.map(score => Math.exp(score-max));
      const total = exps.reduce((sum, v) => sum+v, 0);
      for (let t = 0; t < 4; t++) {
        const attention = exps[t]/total;
        for (let i = start; i < start + headWidth; i++) mixed[i] += attention * packed[t][2*width+i];
      }
    }
    const residual = linear(state, block+'attention_out', mixed).map((v,i) => v + tokens[3][i]);
    const hidden = linear(state, block+'ff_in', normalize(state, block+'ff_norm', residual));
    const update = linear(state, block+'ff_out', hidden.map(v => Math.max(0, v)));
    const last = normalize(state, 'last_norm', update.map((v,i) => v + residual[i]));
    const correction = linear(state, 'readout', last)[selected];
    const distance = Math.expm1(Math.max(0, Math.log1p(recent(intervals)) + correction));
    if (!Number.isFinite(distance)) throw new RangeError('Distance exceeds the numerical range.');
    return distance;
  }

  async function unpack() {
    const bytes = Uint8Array.from(atob(encodedWeights), char => char.charCodeAt(0));
    if (!globalThis.crypto?.subtle) throw new Error('Open a local file, localhost or HTTPS for SHA-256 verification.');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hex = Array.from(hash, v => v.toString(16).padStart(2, '0')).join('');
    if (hex !== checkpoint.weightsSha256 || bytes.length !== checkpoint.values * 4) {
      throw new Error('Shared checkpoint failed its SHA-256 or length check.');
    }
    const data = new DataView(bytes.buffer);
    const state = Object.create(null);
    let offset = 0;
    for (const [name, count] of layout) {
      const values = new Float64Array(count);
      for (let i = 0; i < count; i++, offset += 4) values[i] = data.getFloat32(offset, true);
      state[name] = values;
    }
    if (offset !== bytes.length) throw new Error('Shared checkpoint tensor sizes differ.');
    return Object.freeze({forecast:(domain, intervals) => forecast(state, domain, intervals),
                          checkpointSha256:checkpoint.sourceSha256});
  }

  function loadSharedMotion() {
    modelPromise ??= unpack();
    return modelPromise;
  }

  globalThis.SharedMotion = Object.freeze({loadSharedMotion, historyFromGeometry, recentDistance});
})();
