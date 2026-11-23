// Optical gaps in millimetres. Each preset is invented, including its two clocks.
export const fingers = ['index', 'middle', 'ring', 'little'];
const lags = [1, 0.5, 0.25, 0];
const presets = {
  printer: {task: 'smallprinter', duration: 1.1, gap: [[39,40,41,40],[53,54,55,54],[67,67,68,67],[76,77,78,77]]},
  camera: {task: 'dslr', duration: 1.5, gap: [[48,44,41,38],[58,54,51,49],[68,65,63,61],[76,73,71,69]]}
};

export function fictionalHistory(preset) {
  const {task, duration, gap} = presets[preset];
  const history = Object.fromEntries(fingers.map((finger, i) => [finger, {
    aperture_mm: [...gap[i]], grid_seconds: [4,4.5,4.75,5], ticks_100ns: [10000000,15000000,17500000,20000000]
  }]));
  return {task, cutoff_seconds: 5, utterance_duration_seconds: duration, right_hand_history: history};
}

// Mirror the portable scorer: URL/mail-like chunks are removed before lexing,
// and ASCII words must have complete boundaries even next to Unicode letters.
export function categoriesFor(text, model) {
  const cleaned = text.replaceAll('’', "'").toLowerCase().replace(/\S+(?:@|:\/\/)\S+/gu, ' ');
  const words = cleaned.match(/(?<![\p{L}\p{N}_'])[a-z]+(?:'[a-z]+)?(?![\p{L}\p{N}_'])/gu) || [];
  const lookup = new Map(model.categories.flatMap((category, i) =>
    model.vocabulary[category].split(' ').map(word => [word, i])));
  return words.filter(word => lookup.has(word)).map(word => lookup.get(word));
}

function orderedFeatures(sequence, width) {
  const x = Array(2 * width).fill(0);
  const scale = 1 / Math.sqrt(sequence.length || 1);
  sequence.forEach((id, pos) => {
    const opposite = sequence.length - pos - 1;
    if (pos === opposite) {
      x[id] += 0.5 * scale;
      x[width + id] += 0.5 * scale;
    } else {
      x[(pos < opposite ? 0 : width) + id] += scale;
    }
  });
  return x;
}

function contextFeatures(history, example, tasks) {
  const {aperture_mm: gap, grid_seconds: times, ticks_100ns: ticks} = history;
  if (![gap, times, ticks].every(a => Array.isArray(a) && a.length === 4) ||
      !gap.every(v => Number.isFinite(v) && v >= 0) || !times.every(Number.isFinite) ||
      !ticks.every(Number.isSafeInteger)) throw Error('Invalid hand history.');
  const offsets = times.map((t, i) => example.cutoff_seconds - lags[i] - t);
  if (offsets.some(t => t < -1e-9 || t > 0.100000001)) throw Error('Sample outside the past time window.');
  const speeds = [];
  for (let i = 1; i < 4; i++) {
    if (times[i] <= times[i-1] || ticks[i] <= ticks[i-1]) throw Error('Hand clocks must advance.');
    speeds.push((gap[i] - gap[i-1]) / ((ticks[i] - ticks[i-1]) * 1e-7));
  }
  return [gap[3] / 50, ...speeds.map(v => v / 100), ...offsets.map(t => t / 0.1),
    Math.log1p(example.utterance_duration_seconds) / 2, ...tasks.map(t => Number(t === example.task))];
}

function project(fit, x) {
  if (fit.coefficient.length !== x.length) throw Error('Unexpected feature count.');
  return fit.coefficient.reduce((sum, w, i) => sum + w * x[i], fit.intercept);
}

export function predictGrip(model, example) {
  if (!model.tasks.includes(example.task) || !Number.isFinite(example.cutoff_seconds) ||
      !Number.isFinite(example.utterance_duration_seconds) || example.utterance_duration_seconds < 0)
    throw Error('Invalid forecast context.');
  const ids = categoriesFor(example.instruction, model);
  const language = orderedFeatures(ids, model.categories.length);
  const ordered = {}, context = {};
  for (const finger of fingers) {
    const history = example.right_hand_history[finger];
    if (history == null) {
      ordered[finger] = [null, null];
      context[finger] = [null, null];
      continue;
    }
    const x = contextFeatures(history, example, model.tasks);
    const full = x.concat(language);
    const fits = model.fits[finger];
    ordered[finger] = ['0.5', '1.0'].map(h => project(fits[h].ordered, full));
    context[finger] = ['0.5', '1.0'].map(h => project(fits[h].context, x));
  }
  return {categories: ids.map(i => model.categories[i]), ordered, context};
}
