import './visual-walk.js';

const landmarks = ['Sacrum', 'Head'];
const axes = ['side to side', 'vertical', 'front to back'];

function adjustedEvent(direction, headTravel, scalpScale) {
  const event = globalThis.VisualWalkForecast.example(0, 1);
  event.direction = direction;
  const last = event.motion_mm.length - 1;
  event.motion_mm.forEach((markers, index) => {
    markers[1][0] -= headTravel * (last - index) / last;
  });
  for (const values of [event.eeg_mean_uv, event.eeg_rms_uv]) {
    for (const bin of values) {
      for (let channel = 0; channel < bin.length; channel++) bin[channel] *= scalpScale;
    }
  }
  return event;
}

async function loadWeights() {
  const url = new URL('weights.json', import.meta.url);
  const response = await fetch(url, {integrity:'sha256-vN/g7halsl9rk3Xes7kxwe48wvIW7b9cFj/QuDaLvqc='});
  if (!response.ok) throw new Error('Unable to load balance models');
  return response.json();
}

export function bindVisualBalance(panel, on) {
  const doc = panel.ownerDocument;
  const ready = panel.querySelector('[data-balance-ready]');
  const status = panel.querySelector('[role=status]');
  const direction = panel.querySelector('[data-balance-direction]');
  const travel = panel.querySelector('[data-balance-travel]');
  const amplitude = panel.querySelector('[data-balance-amplitude]');
  const body = panel.querySelector('tbody');
  let assets, models;

  function draw() {
    const event = adjustedEvent(Number(direction.value), Number(travel.value), Number(amplitude.value));
    const predictions = [models.full, models.no_scalp].map(model => {
      const values = globalThis.VisualWalkForecast.predict(event, model);
      if (!Array.isArray(values) || values.length !== 2 ||
          !values.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) {
        throw new Error('Invalid balance prediction');
      }
      return values;
    });
    const rows = doc.createDocumentFragment();
    landmarks.forEach((name, marker) => {
      axes.forEach((axis, index) => {
        const row = doc.createElement('tr');
        const label = doc.createElement('th');
        label.scope = 'row';
        label.textContent = name + ' · ' + axis;
        row.append(label);
        for (const prediction of predictions) {
          const cell = doc.createElement('td');
          const value = prediction[marker][index];
          cell.textContent = (value > 0 ? '+' : '') + value.toFixed(2);
          row.append(cell);
        }
        rows.append(row);
      });
    });
    body.replaceChildren(rows);
    status.textContent = 'Invented walking event · 160 marker samples at 256 Hz';
    ready.hidden = false;
  }

  for (const control of [direction, travel, amplitude]) {
    on(control, 'change', () => {
      try { draw(); }
      catch {
        body.replaceChildren();
        ready.hidden = true;
        status.textContent = 'The forecasts could not be calculated. Select Visual balance to reopen them.';
      }
    });
  }

  return {
    async show(current) {
      body.replaceChildren();
      assets ??= loadWeights().catch(error => { assets = null; throw error; });
      models = await assets;
      if (!current()) return;
      direction.value = '1';
      travel.value = '0';
      amplitude.value = '1';
      draw();
    }
  };
}
