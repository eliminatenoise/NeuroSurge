import './predict.js';

let assets;

// Keep each marker's cutoff position fixed. Add the same linear change to
// both markers so their separation is preserved at every earlier frame.
export function withTravelChange(input, extraMm) {
  const last = input.lab_marker_mm.length - 1;
  return {
    ...input,
    lab_marker_mm: input.lab_marker_mm.map((pair, frame) =>
      pair.map(([x, y, z]) => [x + extraMm * (frame / last - 1), y, z]))
  };
}

async function read(name, integrity) {
  const response = await fetch(new URL(name, import.meta.url), {integrity});
  if (!response.ok) throw new Error('Unable to load ' + name);
  return response.json();
}

export function bindWalkingForecast(panel, on) {
  const get = selector => panel.querySelector(selector);
  const ready = get('[data-gait-ready]');
  const status = get('[role=status]');
  const slider = get('#ns-gait-travel');
  const change = get('[data-gait-change]');
  const channels = ['x', 'y', 'z', 'force'];
  let model, input;

  function writePrediction(column, extra) {
    const result = globalThis.GaitPair.predict(model, withTravelChange(input, extra));
    const coordinates = [...result.heel_delta_mm, result.plate_up_N];
    if (coordinates.length !== 4 || !coordinates.every(Number.isFinite)) {
      throw new Error('Invalid forecast');
    }
    channels.forEach((name, i) => {
      const cell = get('[data-' + column + '-' + name + ']');
      const value = coordinates[i];
      const signed = i < 3 && value > 0 ? '+' : '';
      cell.textContent = signed + value.toFixed(i < 3 ? 2 : 1) + (i < 3 ? ' mm' : ' N');
    });
  }

  function draw() {
    const extra = slider.valueAsNumber;
    writePrediction('gait', extra);
    change.value = (extra > 0 ? '+' : '') + extra.toFixed(1) + ' mm';
    slider.setAttribute('aria-valuetext', change.value);
    ready.hidden = false;
    status.textContent = 'Invented input · ' + input.offset_frames * 10 + ' ms after right foot strike at the cutoff.';
  }

  function update() {
    try {
      draw();
    } catch {
      ready.hidden = true;
      status.textContent = 'The model could not calculate this forecast. Select Walking forecast again to return to the original example.';
    }
  }
  on(slider, 'input', update);
  return {
    async show(current) {
      assets ??= Promise.all([
        read('joint-model.json', 'sha256-XHBS0Yc1ir2MJNCBwj0ucu+QzAYD/I+YHi/VAsNxB8s='),
        read('example-input.json', 'sha256-6fMb/8XOw7IOsWx50VljfKY8qsQ3Ht136v+DWsbQcbQ=')
      ]).catch(error => { assets = null; throw error; });
      [model, input] = await assets;
      if (!current()) return;
      slider.value = '0';
      writePrediction('original', 0);
      update();
    }
  };
}
