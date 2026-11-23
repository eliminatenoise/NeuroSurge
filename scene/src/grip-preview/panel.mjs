import {fictionalHistory, fingers, predictGrip} from './forecast.mjs';

export function gripCommand(text) {
  const match = /^(?:please\s+)?preview\s+grip(?:\s*:\s*|\s+|$)([\s\S]*)$/i.exec(text.trim());
  return match ? match[1].trim() : null;
}

function fillTable(body, predictions, scale) {
  const doc = body.ownerDocument;
  const rows = fingers.map(finger => {
    const row = doc.createElement('tr');
    const heading = doc.createElement('th');
    heading.scope = 'row';
    heading.textContent = finger[0].toUpperCase() + finger.slice(1);
    row.append(heading);
    for (const value of predictions[finger]) {
      const cell = doc.createElement('td');
      cell.textContent = (value > 0 ? '+' : '') + value.toFixed(2);
      const track = doc.createElement('span');
      track.className = 'grip-track';
      track.setAttribute('aria-hidden', 'true');
      const bar = doc.createElement('i');
      const width = 50 * Math.abs(value) / scale;
      bar.style.width = width + '%';
      bar.style.left = (value < 0 ? 50 - width : 50) + '%';
      track.append(bar);
      cell.append(track);
      row.append(cell);
    }
    return row;
  });
  body.replaceChildren(...rows);
}

export function bindGripPreview(panel, dismiss) {
  const field = panel.querySelector('input');
  const preset = panel.querySelector('[data-history]');
  const modelChoice = panel.querySelector('[data-model-choice]');
  const status = panel.querySelector('[role=status]');
  const summary = panel.querySelector('[data-history-note]');
  const results = panel.querySelector('[data-grip-results]');
  const body = results.querySelector('tbody');
  const back = panel.querySelector('[data-return]');
  const heading = panel.querySelector('h2');
  const retry = panel.querySelector('[data-retry]');
  let weights, request;
  let revision = 0;

  function render() {
    if (panel.hidden || !weights) return;
    const example = fictionalHistory(preset.value);
    summary.textContent = 'Invented starting gaps (index to little finger): ' +
      fingers.map(f => example.right_hand_history[f].aperture_mm[3]).join(', ') +
      ' mm. The instruction lasts ' + example.utterance_duration_seconds.toFixed(1) + ' s in this example.';
    if (!field.value.trim()) {
      results.hidden = true;
      body.replaceChildren();
      status.textContent = 'Enter an instruction to see the forecast.';
      return;
    }
    const {categories, ordered, context} = predictGrip(weights, {...example, instruction: field.value});
    status.textContent = categories.length
      ? 'Recognised categories in order: ' + categories.map(c => c.toLowerCase()).join(' → ') + '.'
      : 'No recognised words. The word model uses zero word features and keeps the hand and task context.';
    const scale = Math.max(1, Math.ceil(Math.max(...Object.values(ordered).flat().map(Math.abs),
      ...Object.values(context).flat().map(Math.abs))));
    fillTable(body, modelChoice.value === 'ordered' ? ordered : context, scale);
    results.querySelector('[data-scale]').textContent = 'Bars run from −' + scale + ' to +' + scale +
      ' mm on the same scale for both models. The centre marks zero.';
    results.hidden = false;
  }

  async function load() {
    const version = ++revision;
    retry.hidden = true;
    try {
      if (!weights) {
        status.textContent = 'Opening the local model…';
        request ??= fetch(new URL('./weights.json', import.meta.url)).then(response => {
          if (!response.ok) throw Error('Could not load weights.');
          return response.json();
        }).catch(error => { request = null; throw error; });
        weights = await request;
      }
      if (version === revision) render();
    } catch {
      if (version !== revision || panel.hidden) return;
      results.hidden = true;
      status.textContent = 'The local grip model could not open.';
      retry.hidden = false;
    }
  }

  function reset() {
    if (panel.hidden) return;
    ++revision;
    panel.hidden = true;
    field.value = '';
    status.textContent = '';
    summary.textContent = '';
    results.hidden = true;
    body.replaceChildren();
    panel.querySelector('details').open = false;
  }

  field.addEventListener('input', render);
  preset.addEventListener('change', render);
  modelChoice.addEventListener('change', render);
  back.addEventListener('click', dismiss);
  retry.addEventListener('click', load);
  return {
    open(text) {
      preset.value = 'printer';
      modelChoice.value = 'ordered';
      field.value = text;
      panel.hidden = false;
      (text ? heading : field).focus();
      load();
    },
    reset,
    dispose() {
      reset();
      field.removeEventListener('input', render);
      preset.removeEventListener('change', render);
      modelChoice.removeEventListener('change', render);
      back.removeEventListener('click', dismiss);
      retry.removeEventListener('click', load);
    }
  };
}
