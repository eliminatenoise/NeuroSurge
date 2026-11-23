import {predict} from './inference.mjs';
import {editScalpHistory, exampleScalpHistory} from './scalp-history.mjs';
import {integrity} from './assets.mjs';

const studies = {
  upper:{
    names:['Right anterior deltoid', 'Right brachioradialis', 'Right flexor digitorum',
      'Right common extensor digitorum', 'Right first dorsal interosseous'],
    assessment:'Across 882 recorded lifts from three people outside training, the two-study model missed the wrist path by 4.87 mm on average. The wrist-only model missed by 5.10 mm, or 4.39 mm when given twice as many training updates. Muscle amplitude errors were 0.00785, 0.00778 and 0.00764 in source units. No lift from these people had five reliable channels.',
    offset:8, units:'source amplitude units', axes:['X', 'Y', 'Z'], marker:'right wrist',
    condition:'A light cued the right-hand grasp and lift. The forecast starts 400 ms after that light. The wrist tracker reports X, Y and Z in its own frame. The conversion from recorded muscle amplitude to volts is unknown.'
  },
  lower:{
    names:['Left tibialis anterior', 'Left soleus', 'Left medial gastrocnemius', 'Left peroneus longus',
      'Right tibialis anterior', 'Right soleus', 'Right medial gastrocnemius', 'Right peroneus longus'],
    assessment:'Across 1,759 recorded rotations from six people outside training, the two-study model missed the sacrum path by 2.17 mm on average. The balance-only model missed by 1.96 mm, or 1.98 mm when given twice as many training updates. Muscle amplitude errors were 10.28, 10.27 and 10.27 µV.',
    offset:0, units:'µV', axes:['Side to side', 'Vertical', 'Front to back'], marker:'sacrum',
    condition:'The scene in a headset tilted while people stood or walked. The forecast starts 125 to just under 129 ms after rotation began. The sacrum marker followed the back of the pelvis along the study’s three axes. Their anatomical signs are unresolved.'
  }
};
const fixed = value => value.toFixed(2);
const signed = value => (value > 0 ? '+' : '') + fixed(value);

async function readAsset(name) {
  const response = await fetch(new URL(name + '.json', import.meta.url), {integrity:integrity[name]});
  if (!response.ok) throw Error('Missing forecast data');
  return response.json();
}

function textElement(parent, tag, text) {
  const cell = parent.ownerDocument.createElement(tag);
  cell.textContent = text;
  parent.append(cell);
  return cell;
}

function rows(table, values) {
  const body = table.tBodies[0], fragment = table.ownerDocument.createDocumentFragment();
  for (const [name, ...cells] of values) {
    const row = table.ownerDocument.createElement('tr');
    textElement(row, 'th', name).scope = 'row';
    for (const value of cells) textElement(row, 'td', value);
    fragment.append(row);
  }
  body.replaceChildren(fragment);
}

function pathTables(host, study, results, branches) {
  host.replaceChildren();
  for (const [index, {path_mm}] of results.entries()) {
    const table = host.ownerDocument.createElement('table');
    table.createCaption().textContent = branches[index] + ' · ' + study.marker + ' displacement (mm)';
    const heading = table.createTHead().insertRow();
    for (const name of ['Time (ms)', ...study.axes]) textElement(heading, 'th', name).scope = 'col';
    table.createTBody();
    rows(table, path_mm.map((xyz,i) => [String(Number(((i+1)*1000/256).toFixed(3))), ...xyz.map(signed)]));
    host.append(table);
  }
}

function svgMark(parent, tag, attrs, content) {
  const node = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  parent.append(node);
  return node;
}

function plot(host, study, results) {
  host.replaceChildren();
  const limit = Math.max(1, Math.ceil(Math.max(...results.flatMap(result => result.path_mm.flat().map(Math.abs)))));
  const y = value => 39 - 20*value/limit;
  for (const [axis, name] of study.axes.entries()) {
    const svg = svgMark(host, 'svg', {viewBox:'0 0 300 78', role:'img',
      'aria-label':name + ' displacement over 125 milliseconds. Both trajectories share a scale of plus or minus ' + limit + ' millimetres.'});
    svgMark(svg, 'text', {x:0,y:12}, name);
    for (const value of [-limit,0,limit]) {
      svgMark(svg, 'line', {x1:32,x2:297,y1:y(value),y2:y(value)});
      svgMark(svg, 'text', {x:27,y:y(value)+4,'text-anchor':'end'}, String(value));
    }
    svgMark(svg, 'text', {x:32,y:74}, '0 ms');
    svgMark(svg, 'text', {x:297,y:74,'text-anchor':'end'}, '125 ms');
    for (const {path_mm} of results) {
      const points = ['32,39', ...path_mm.map((xyz,i) => (32+265*(i+1)/32)+','+y(xyz[axis]))];
      svgMark(svg, 'polyline', {points:points.join(' ')});
    }
  }
}

function checkOutput(output, mask) {
  if (!Array.isArray(output?.rms) || output.rms.length !== 13 ||
      !output.rms.every((v,j) => mask[j] ? Number.isFinite(v) && v >= 0 : v === null) ||
      !Array.isArray(output.path_mm) || output.path_mm.length !== 32 ||
      !output.path_mm.every(xyz => Array.isArray(xyz) && xyz.length === 3 && xyz.every(Number.isFinite))) {
    throw Error('Invalid movement forecast');
  }
  return output;
}

export function bindLimbForecast(panel, on) {
  const q = selector => panel.querySelector(selector);
  const ready = q('[data-forecasts]'), status = q('[role=status]');
  const task = q('[data-domain]'), posture = q('[data-posture]'), direction = q('[data-direction]');
  const amplitude = q('[data-amplitude]'), travel = q('[data-travel]');
  const models = q('[data-models]');
  const gain=q('[data-scalp-gain]'), sites=q('[data-scalp-sites]');
  const optional = {maps:['map-separate','map-matched'], scalp:['scalp-central','scalp-reference']};
  const fitted = {}, requests = {};
  let loading, assets, latestSelection = 0;

  async function getModels(mode) {
    if (!optional[mode] || fitted[mode]) return;
    requests[mode] ??= Promise.all(optional[mode].map(readAsset)).catch(error => { delete requests[mode]; throw error; });
    fitted[mode] = await requests[mode];
  }

  function resetEdits() {
    const example = assets['synthetic-' + task.value];
    if (task.value === 'lower') {
      posture.value = String(example.session);
      direction.value = String(example.direction);
    }
    amplitude.value = '1';
    travel.value = '1';
    gain.value = '1'; sites.value = 'all';
  }

  function draw() {
    const domain = task.value, study = studies[domain];
    const example = assets['synthetic-' + domain];
    const muscleScale = Number(amplitude.value), movementScale = Number(travel.value);
    const input = {...example,
      session:domain === 'lower' ? Number(posture.value) : example.session,
      direction:domain === 'lower' ? Number(direction.value) : example.direction,
      patch_rms:example.patch_rms.map(bin => bin.map(value => value * muscleScale)),
      past_rms:example.past_rms.map(value => value * muscleScale),
      patch_xyz_mm:example.patch_xyz_mm.map(xyz => xyz.map(value => value * movementScale))};
    const compareMaps = models.value === 'maps';
    const scalp = models.value === 'scalp';
    if (scalp) {
      Object.assign(input, editScalpHistory(exampleScalpHistory(input.domain), Number(gain.value), false, sites.value));
      const labels = domain === 'upper' ? ['C3','Cz','C4'] : ['D19 (C3)','A1 (Cz)','B22 (C4)'];
      q('[data-scalp-sites-note]').textContent = 'Included electrodes: '+labels.filter((_,j)=>input.scalp_mask[j]).join(', ')+'. The values are in '+(domain === 'upper' ? 'the hand study’s original scalp amplitude units.' : 'microvolts.');
    }
    const branches = scalp ? ['With scalp','Reference'] : compareMaps ? ['Body-part maps', 'Early/late maps'] : ['Both studies', 'This task only'];
    const weights = fitted[models.value] || [assets['model-joint'], assets['model-' + domain]];
    const results = weights.map(weight => checkOutput(predict(weight, input), input.muscle_mask));
    for (const label of panel.querySelectorAll('[data-first-model]')) label.textContent = branches[0];
    for (const label of panel.querySelectorAll('[data-second-model]')) label.textContent = branches[1];
    q('[data-map-explanation]').hidden = !compareMaps;
    q('[data-scalp-controls]').hidden = !scalp;
    q('[data-original-evidence]').hidden = compareMaps || scalp;
    q('[data-assessment]').hidden = compareMaps || scalp;
    for (const label of panel.querySelectorAll('[data-balance-only]')) label.hidden = domain !== 'lower';
    q('[data-condition]').textContent = study.condition;
    q('[data-assessment]').textContent = study.assessment;
    const muscleTable = q('[data-limb-rms]');
    muscleTable.caption.textContent = 'Predicted muscle amplitude (RMS) over the next 125 ms · ' + study.units;
    rows(muscleTable, study.names.map((name,i) => [name, ...results.map(result => {
      const value = result.rms[study.offset + i];
      return value === null ? 'Unavailable' : value.toFixed(domain === 'upper' ? 4 : 2);
    })]));
    q('[data-path-caption]').textContent = 'Predicted ' + study.marker + ' displacement from its last observed position (mm)';
    rows(q('[data-limb-end]'), study.axes.map((axis,j) =>
      [axis, ...results.map(r => signed(r.path_mm[31][j]))]));
    plot(q('[data-plots]'), study, results);
    pathTables(q('[data-path-tables]'), study, results, branches);
    status.textContent = 'Synthetic example · ' + (domain === 'upper' ? 'right grasp and lift' : (input.session ? 'walking' : 'standing'));
    ready.hidden = false;
  }

  for (const control of [task, posture, direction, amplitude, travel, models, gain, sites]) on(control, 'change', async () => {
    const selection = ++latestSelection;
    try {
      if (control === task) resetEdits();
      if (optional[models.value] && !fitted[models.value]) {
        status.textContent = 'Loading the model comparison. The previous forecasts are still on screen.';
        await getModels(models.value);
      }
      if (selection !== latestSelection) return;
      draw();
    } catch {
      if (selection !== latestSelection) return;
      if (optional[models.value] && !fitted[models.value]) {
        models.value = 'specialist';
        draw();
        status.textContent = 'The models could not load. The original comparison is shown. Choose the comparison again to retry.';
        return;
      }
      ready.hidden = true;
      status.textContent = 'The forecasts could not be calculated. Select Wrist and pelvis to try again.';
    }
  });
  return {
    async show(domain, current, withScalp = false) {
      loading ??= Promise.all(['model-joint','model-upper','model-lower','synthetic-upper','synthetic-lower'].map(async name => [name, await readAsset(name)]))
        .then(Object.fromEntries).catch(error => { loading = null; throw error; });
      assets = await loading;
      if (withScalp) await getModels('scalp');
      if (!current()) return;
      latestSelection++;
      task.value = domain;
      models.value = withScalp ? 'scalp' : 'specialist';
      resetEdits();
      draw();
    }
  };
}
