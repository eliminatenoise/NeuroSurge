import {integrity} from './assets.mjs';
import {forecastReach} from './predict.mjs';

async function load(name) {
  const response = await fetch(new URL(name + '.json', import.meta.url), {integrity:integrity[name]});
  if (!response.ok) throw Error('Missing reach data');
  return response.json();
}

const objects = {
  hand: {label:'Hand marker', offset:0, axes:3, scale:1000, unit:'mm'},
  elbow: {label:'Forearm marker near the elbow', offset:3, axes:3, scale:1000, unit:'mm'},
  handle: {label:'Handle encoder', offset:6, axes:2, scale:1, unit:'cm'}
};

function displayNumber(value, digits) {
  return Number(value.toFixed(digits)).toString();
}

function addRow(body, label, values) {
  const row = body.insertRow(), head = body.ownerDocument.createElement('th');
  head.scope = 'row';
  head.textContent = label;
  row.append(head);
  for (const value of values) row.insertCell().textContent = value;
}

function drawDistance(chart, observed, predicted, sample, unit) {
  const distance = path => [0, ...path.map(p => Math.hypot(...p))];
  const lines = [distance(observed), distance(predicted)];
  const top = Math.max(1e-6, ...lines.flat());
  const x = i => 38 + i * 25, y = v => 72 - v / top * 57;
  chart.querySelector('[data-high]').textContent = displayNumber(top, 2) + ' ' + unit;
  for (const [i, field] of ['measured', 'forecast'].entries()) {
    chart.querySelector('[data-line=' + field + ']').setAttribute('points', lines[i].map((v, t) => [x(t), y(v)].join(',')).join(' '));
    const dot = chart.querySelector('[data-point=' + field + ']');
    dot.setAttribute('cx', x(sample + 1));
    dot.setAttribute('cy', y(lines[i][sample + 1]));
  }
  chart.querySelector('[data-cursor]').setAttribute('d', 'M' + x(sample + 1) + ' 12v60');
}

export function bindReachFeedback(panel, on) {
  const q = selector => panel.querySelector(selector);
  const workspace = q('[data-workspace]'), marker = q('[data-marker]'), sample = q('[data-sample]');
  const unit = q('[data-unit]'), interval = q('[data-interval]'), results = q('[data-feedback-results]');
  let bundle, pending;
  const cache = new Map();

  function draw() {
    const recording = bundle.recordings[workspace.value];
    if (!cache.has(workspace.value)) cache.set(workspace.value, forecastReach(recording.history, bundle.models));
    const forecast = cache.get(workspace.value), measured = recording.measured;
    const object = objects[marker.value], t = Number(sample.value);
    const extract = path => path.map(p => p.slice(object.offset, object.offset + object.axes).map(v => v * object.scale));
    const observed = extract(measured.movement), predicted = extract(forecast.movement);
    q('[data-motion-caption]').textContent = object.label + ' displacement (' + object.unit + '), ' + ((t + 1) * 10) + ' ms after its last observed position';
    const motionBody = q('[data-motion-table] tbody');
    motionBody.replaceChildren();
    for (let j = 0; j < object.axes; j++) {
      addRow(motionBody, 'XYZ'[j], [displayNumber(observed[t][j], 3), displayNumber(predicted[t][j], 3)]);
    }
    drawDistance(q('[data-distance-chart]'), observed, predicted, t, object.unit);
    const i = Number(unit.value), bin = Number(interval.value);
    const count = values => bin === -1 ? values.reduce((sum, row) => sum + row[i], 0) : values[bin][i];
    const countBody = q('[data-count-table] tbody');
    countBody.replaceChildren();
    addRow(countBody, 'Recorded', [count(measured.delayed)]);
    addRow(countBody, 'Expected from history', [displayNumber(count(forecast.direct), 3)]);
    addRow(countBody, 'Expected from history and forecast movement', [displayNumber(count(forecast.full), 3)]);
    const bounds = bin === -1 ? '100–200' : (100 + bin * 10) + '–' + (110 + bin * 10);
    q('[data-count-caption]').textContent = 'Spike count ' + bounds + ' ms after the forecast cutoff';
    q('[role=status]').textContent = 'Workspace ' + recording.workspace + ' · original trial ' + recording.trial + ' · second go cue';
  }
  for (const control of [workspace, marker, sample, unit, interval]) on(control, 'change', draw);
  return {async show(current) {
    pending ??= Promise.all([load('recordings'), load('models')]).then(([recordings, models]) => ({recordings, models}))
      .catch(error => { pending = null; throw error; });
    bundle = await pending;
    if (!current()) return;
    if (unit.options.length === 0) {
      for (const [i, [channel, sort]] of bundle.recordings.within.history.unit_guide.entries()) {
        unit.add(new Option('Channel ' + channel + ' · sort ' + sort, i));
      }
      for (let i = 0; i < 10; i++) {
        sample.add(new Option((i + 1) * 10 + ' ms', i));
        interval.add(new Option((100 + i * 10) + '–' + (110 + i * 10) + ' ms', i));
      }
      sample.value = '9';
    }
    draw();
    results.hidden = false;
  }};
}
