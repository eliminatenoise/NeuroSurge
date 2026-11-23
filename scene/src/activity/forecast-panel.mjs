import { loadForecast } from './replay.mjs';
import { TARGET_OFFSETS, pairedInput, pairedMeasurement } from './paired-input.mjs';

const modes = [
  ['motion', 'Wrist angles'],
  ['emg', 'Wrist + forearm'],
  ['full', 'Wrist + forearm + scalp']
];

const descriptions = {
  paired: 'Each transformer looks for patterns across time. Compare three separately trained models using wrist angles alone, then adding voltages recorded over forearm muscles, then adding voltages from the scalp. The public example was excluded from their training and scoring. One movement illustrates their differences.',
  temporal: 'This earlier model looks for short patterns in the signal. Each row averages three trained versions. In the published three-person development comparison, wrist angles and cue time alone gave the lowest average error. The forearm traces are available to view alongside it.'
};

async function pairedRows(clip) {
  const { loadPairedPredictor } = await import('./paired/predictor.mjs');
  const predictors = await Promise.all(modes.map(([mode]) => loadPairedPredictor(mode)));
  return offset => {
    const input = pairedInput(clip, offset);
    return predictors.map((model, i) => [modes[i][1] + ' · forecast', model.predict(input).angle_deg]);
  };
}

async function temporalRows(clip) {
  const rows = await loadForecast(clip);
  return offset => {
    const row = rows.find(r => Math.round(r.timeSeconds * clip.sourceSampleRateHz) === offset);
    const both = row.forecasts.combined.meanDegrees;
    return [
      ['Wrist history · forecast', row.forecasts.motion.meanDegrees],
      ['Wrist + EEG · forecast', both],
      ['Wrist + EEG error (forecast − measured)', both.map((v, axis) => v - row.measuredDegrees[axis])]
    ];
  };
}

export function bindWristForecast(panel, on, isVisible, selectSample) {
  const q = selector => panel.querySelector(selector);
  const target = q('[data-target]'), family = q('[data-family]'), table = q('tbody');
  const status = q('[data-model-status]');
  const requests = new Map();
  let clip, version = 0;

  function draw(rows) {
    table.replaceChildren();
    for (const [name, values] of rows) {
      const tr = table.insertRow();
      const title = table.ownerDocument.createElement('th');
      title.scope = 'row';
      title.textContent = name;
      tr.append(title);
      for (const value of values) tr.insertCell().textContent = value.toFixed(1) + '°';
    }
  }

  async function show(sync) {
    if (!clip || !panel.open) return;
    const update = ++version, name = family.value;
    const offset = TARGET_OFFSETS[Number(target.value)], rate = clip.sourceSampleRateHz;
    const cutoff = offset - rate / 4, start = cutoff - rate / 2 + 1;
    const cue = clip.cueSourceRow - clip.firstSourceRow;
    const baseline = [
      ['Wrist sensor · measured', pairedMeasurement(clip, offset)],
      ['Hold last angle', [clip.series.wristExtension_deg[cue + cutoff], clip.series.wristRadialDeviation_deg[cue + cutoff]]]
    ];
    if (sync && isVisible()) selectSample(cue + offset);
    q('[data-cutoff]').textContent = 'The model reads from +' + (start / rate).toFixed(3) + ' to +' +
      (cutoff / rate).toFixed(3) + ' seconds after the cue. The wrist sensor reading is from +' + (offset / rate).toFixed(2) + ' seconds.';
    q('[data-family-note]').textContent = descriptions[name];
    draw(baseline);
    status.textContent = 'Computing the forecast on this device…';
    if (!requests.has(name)) requests.set(name, name === 'paired' ? pairedRows(clip) : temporalRows(clip));
    const request = requests.get(name);
    try {
      const forecast = await request;
      if (update !== version) return;
      draw([...baseline, ...forecast(offset)]);
      status.textContent = '';
    } catch {
      if (requests.get(name) === request) requests.delete(name);
      if (update === version) status.textContent = 'This model could not run. Choose the other model to see its forecasts.';
    }
  }

  on(panel, 'toggle', () => show(true));
  on(target, 'change', () => show(true));
  on(family, 'change', () => show(false));
  return {
    setClip(value) {
      clip = value;
      TARGET_OFFSETS.forEach((offset, i) => target.add(new Option('+' + (offset / clip.sourceSampleRateHz).toFixed(2) + ' s', String(i))));
      q('[data-comparison]').hidden = false;
      show(true);
    }
  };
}
