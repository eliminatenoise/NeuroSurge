import './model.js';

const muscles = ['Tibialis anterior', 'Soleus', 'Medial gastrocnemius', 'Peroneus longus'];
const svgNS = 'http://www.w3.org/2000/svg';
const signed = n => (n > 0 ? '+' : '') + n.toFixed(2);

async function readAsset(file, integrity) {
  const response = await fetch(new URL(file, import.meta.url), {integrity});
  if (!response.ok) throw Error('Study data unavailable');
  return response.json();
}

function loadAssets() {
  return Promise.all([
    readAsset('weights.json', 'sha256-8ngnY3eG9wS+nr0lu/dFHW4Kc3YlezAjyXrVUnQCZzY='),
    readAsset('synthetic-event.json', 'sha256-2fUaqpSzsFWEgRR6zCu5/5AtGTD6f8w/n0VEc9RiwVQ=')
  ]);
}

function fillTable(body, cells) {
  const doc = body.ownerDocument;
  const fragment = doc.createDocumentFragment();
  for (const [label, ...values] of cells) {
    const row = doc.createElement('tr');
    const heading = doc.createElement('th');
    heading.scope = 'row';
    heading.textContent = label;
    row.append(heading);
    for (const value of values) {
      const cell = doc.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    fragment.append(row);
  }
  body.replaceChildren(fragment);
}

function plotPath(panel, path) {
  const axes = panel.querySelector('[data-path-axes]');
  const lines = panel.querySelector('[data-path-lines]');
  axes.replaceChildren();
  lines.replaceChildren();
  function mark(parent, name, attrs, text) {
    const el = parent.ownerDocument.createElementNS(svgNS, name);
    for (const [key,value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    parent.append(el);
  }
  // One signed scale for all three axes. Include zero at the observation boundary.
  const limit = Math.max(1, Math.ceil(Math.max(...path.flat().map(Math.abs))));
  const x = i => 44 + 316 * i / 32;
  const y = displacement => 65 - 48 * displacement / limit;
  for (const value of [-limit, 0, limit]) {
    const height = y(value);
    mark(axes, 'line', {x1:44,x2:360,y1:height,y2:height});
    mark(axes, 'text', {x:36,y:height+4,'text-anchor':'end'}, String(value));
  }
  mark(axes, 'text', {x:44,y:140}, '0 ms');
  mark(axes, 'text', {x:360,y:140,'text-anchor':'end'}, '125 ms');
  for (const axis of [0, 1, 2]) {
    const points = [x(0) + ',' + y(0), ...path.map((v,k) => x(k+1) + ',' + y(v[axis]))];
    mark(lines, 'polyline', {points:points.join(' ')});
  }
  const outputs = panel.querySelectorAll('.muscle-path output');
  path.at(-1).forEach((value,i) => { outputs[i].textContent = signed(value) + ' mm'; });
}

export function bindMuscleMotion(panel, on) {
  const ready = panel.querySelector('[data-muscle-ready]');
  const status = panel.querySelector('[role=status]');
  const posture = panel.querySelector('[data-posture]');
  const direction = panel.querySelector('[data-direction]');
  const amplitude = panel.querySelector('[data-amplitude]');
  let loading, assets;

  function draw() {
    const [weights, example] = assets;
    const scale = Number(amplitude.value);
    const input = {...example, posture:Number(posture.value), direction:Number(direction.value),
      leg_uv:example.leg_uv.map(sample => sample.map(value => value * scale))};
    const {future_rms_uv:rms, future_path_mm:path} = globalThis.MuscleMotion.predict(weights,input);
    if (!Array.isArray(rms) || rms.length !== 8 || !rms.every(Number.isFinite) ||
        !Array.isArray(path) || path.length !== 32 ||
        !path.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) {
      throw Error('Invalid model output');
    }
    fillTable(panel.querySelector('[data-muscle-voltage-table] tbody'), muscles.map((name,i) =>
      [name, rms[i].toFixed(2), rms[i+4].toFixed(2)]));
    fillTable(panel.querySelector('[data-path] tbody'), path.map((row,i) =>
      [String(Number(((i+1)*1000/256).toFixed(2))), ...row.map(signed)]));
    plotPath(panel,path);
    status.textContent = 'Model forecast · synthetic history · ' + (input.posture ? 'walking' : 'standing');
    ready.hidden = false;
  }

  for (const control of [posture, direction, amplitude]) {
    on(control, 'change', () => {
      try { draw(); }
      catch {
        ready.hidden = true;
        status.textContent = 'The forecast could not be calculated. Select Muscle and movement to try again.';
      }
    });
  }
  return {
    async show(current, initialPosture) {
      loading ??= loadAssets().catch(error => { loading = null; throw error; });
      assets = await loading;
      if (!current()) return;
      posture.value = String(initialPosture);
      direction.value = '1';
      amplitude.value = '1';
      draw();
    }
  };
}
