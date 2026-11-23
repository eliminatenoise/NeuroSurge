import './predict.js';

const landmarks = ['Pelvis', 'Right heel'];
const directions = ['forward', 'left', 'up'];

async function loadJson(file, integrity) {
  const response = await fetch(new URL(file, import.meta.url), {integrity});
  if (!response.ok) throw new Error('Unable to load ' + file);
  return response.json();
}

export function bindWalkingInstruction(panel, on) {
  const doc = panel.ownerDocument;
  const ready = panel.querySelector('[data-pace-ready]');
  const status = panel.querySelector('[role=status]');
  const select = panel.querySelector('select');
  const heading = panel.querySelector('[data-pace-cue]');
  const body = panel.querySelector('tbody');
  let assets, model, sample;

  function predict(instruction) {
    const values = globalThis.WalkingForecast.predict(model, {...sample, instruction});
    if (!Array.isArray(values) || values.length !== 2 ||
        !values.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) {
      throw new Error('Unexpected displacement');
    }
    return values;
  }

  function draw() {
    const withInstruction = predict(Number(select.value));
    const withoutInstruction = predict(null);
    const rows = doc.createDocumentFragment();
    landmarks.forEach((landmark, i) => {
      directions.forEach((direction, j) => {
        const row = doc.createElement('tr');
        const label = doc.createElement('th');
        label.scope = 'row';
        label.textContent = landmark + ' ' + direction;
        row.append(label);
        for (const prediction of [withInstruction[i][j], withoutInstruction[i][j]]) {
          const cell = doc.createElement('td');
          cell.textContent = (prediction > 0 ? '+' : '') + prediction.toFixed(1) + ' mm';
          row.append(cell);
        }
        rows.append(row);
      });
    });
    heading.textContent = select.selectedOptions[0].textContent;
    body.replaceChildren(rows);
    status.textContent = 'Invented history · ' + sample.offset * 10 + ' ms after right foot strike at the cutoff.';
    ready.hidden = false;
  }

  on(select, 'change', () => {
    try {
      draw();
    } catch {
      ready.hidden = true;
      status.textContent = 'The forecast could not be calculated. Select Walking instructions to reopen it.';
    }
  });

  return {
    async show(current, instruction) {
      assets ??= Promise.all([
        loadJson('weights.json', 'sha256-u2sYR+asC6Jz3J5MebqNUJ2jDg3wlK7PDwbWsxfaFuI='),
        loadJson('input.json', 'sha256-i6gjQoVtsT8R9Q2Sv+3ZEcO2+/AY6BJSRQzhcEZjBEo=')
      ]).catch(error => { assets = null; throw error; });
      [model, sample] = await assets;
      if (!current()) return;
      select.value = String(instruction);
      draw();
    }
  };
}
