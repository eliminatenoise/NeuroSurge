import {readPacket} from '../read-packet.js';
import {comparePositions} from './ridge.js';
import {drawPlane} from './plane.js';

const packetURL = new URL('packet.json', import.meta.url);
const noticeURL = new URL('NOTICE.md', import.meta.url);
const digest = '6a683b82dea7260977c3464f7468943d21915633daf4ec81c7ee1a9926965d21';
const names = {motion: 'Positions', combined: 'Positions + spikes'};
const ids = ['I', 'II', 'III', 'IV'];
const seconds = t => t.toFixed(3) + ' s';
const cm = xy => xy.map(v => v.toFixed(2)).join(', ') + ' cm';
function element(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}
function cell(tr, tag, text, scope) {
  const el = element(tag, text);
  if (scope) el.scope = scope;
  tr.append(el);
  return el;
}

function drawCounts(container, units, item, region) {
  const title = region === 'PFC' ? 'Prefrontal cortex (PFC)' : 'Hippocampus (CA1)';
  const columns = units.map((unit,i) => ({...unit,i})).filter(u => u.region === region);
  const table = document.createElement('table');
  const caption = table.createCaption();
  caption.textContent = title + ' · ' + columns.length + ' units';
  const head = table.createTHead().insertRow();
  for (const text of ['Unit ID', ...ids]) cell(head, 'th', text, 'col');
  const body = table.createTBody();
  for (const unit of columns) {
    const tr = body.insertRow();
    cell(tr, 'th', unit.id, 'row');
    for (const row of item.counts) {
      const n = row[unit.i];
      const td = cell(tr, 'td', n);
      td.className = 'wt-count-' + (n === 0 ? '0' : n === 1 ? '1' : n < 5 ? '2' : n < 10 ? '3' : '4');
    }
  }
  container.setAttribute('aria-label', title + ' spike counts. Scroll for all units.');
  container.replaceChildren(table);
  container.scrollTop = 0;
}

export function mountWTrack(root) {
  if (!root.id) throw new Error('The inspector needs an element with a unique ID');
  const uid = key => root.id + '-' + key;
  const find = key => root.querySelector('[data-wt="' + key + '"]');
  root.classList.add('wt-inspector');
  root.innerHTML = `
    <h3>Where will the rat be a quarter-second from now?</h3>
    <p>The camera followed one rat between three wells on a W-shaped track. Use its last five positions to predict its next position. Try again with the spikes added. These are brief electrical signals recorded from brain cells during that same second.</p>
    <p data-wt="status" role="status"></p>
    <div data-wt="body" hidden>
      <div class="wt-controls">
        <label>Training trip <select data-wt="trip"></select></label>
        <label>Prediction to mark on the maps <select data-wt="mode"><option value="motion">Past positions</option><option value="combined">Past positions + spikes</option></select></label>
      </div>
      <p data-wt="clock" class="wt-clock"></p>
      <div class="wt-maps">
        <figure><figcaption>Where on the track?</figcaption>
          <svg data-wt="track" viewBox="0 0 276 262" aria-hidden="true"></svg></figure>
        <figure><figcaption>Near the last reading</figcaption>
          <svg data-wt="close" viewBox="0 0 276 262" aria-hidden="true"></svg></figure>
      </div>
      <ul class="wt-key" aria-label="Map symbols">
        <li><span class="wt-other">●</span> Other training trips</li><li><span class="wt-past">●</span> Past camera positions</li>
        <li><span class="wt-predicted">◇</span> Selected prediction</li><li data-wt="measured-key" hidden><span class="wt-actual">+</span> Later camera reading</li>
      </ul>
      <p class="wt-small">The axes show centimetres in the study’s track coordinates. The study names the centre well as its reference. The pale dots trace places the rat visited. Each dark dot is a camera reading. The largest is the last one the models saw.</p>
      <table class="wt-endpoints"><caption>Predicted position in centimetres</caption><thead><tr><th scope="col">Model inputs</th><th scope="col">X</th><th scope="col">Y</th><th scope="col" data-wt="error-head" hidden>Miss (cm)</th></tr></thead><tbody data-wt="results"></tbody></table>
      <button type="button" data-wt="reveal" aria-expanded="false">Reveal the later camera reading</button>
      <p data-wt="outcome" role="status"></p>
      <details class="wt-evidence" open><summary>See the spikes the model could use</summary>
        <p>Each numbered unit is a group of spikes attributed to one cell. The archive assigns each unit to one of two brain regions. Read across a row to see its spike count in four successive quarter-seconds. Darker squares contain more recorded spikes. Scroll each table for more units.</p>
        <ol class="wt-bins" data-wt="bins"></ol>
        <div class="wt-areas"><div class="wt-area" data-wt="pfc" tabindex="0" role="region"></div><div class="wt-area" data-wt="ca1" tabindex="0" role="region"></div></div>
        <p>The archive gives no intervals of reliable observation for individual units. Thirteen of the 72 units have no recorded spikes anywhere in the 34 training and test trips. A zero alone cannot establish whether a cell was quiet or a signal went undetected.</p>
      </details>
      <details class="wt-evidence"><summary>Read the camera times and how the forecasts work</summary>
        <p>The models take the latest camera reading at or before each quarter-second mark. Both use past positions, speed and direction calculated from those positions, the age of each reading, and time since the trip and run began. One also uses the four spike counts from each unit.</p>
        <table class="wt-times"><caption>Five measured inputs on the recording clock</caption><thead><tr><th scope="col">Camera row</th><th scope="col">Time (s)</th><th scope="col">X (cm)</th><th scope="col">Y (cm)</th></tr></thead><tbody data-wt="times"></tbody></table>
        <p>Each model fits weights to predict the change from the last known position. The method, called ridge regression, limits how large the weights can grow. Your browser calculates both predictions with those fitted weights. The camera measured the rat’s tracked location in two dimensions. The experiment supplies no limb positions, muscle forces or test of what caused a movement.</p>
      </details>
      <p class="wt-study">These three examples come from the 24 trips used to fit the models. Each is the first usable window of its trip, chosen by time. Across nine later test trips, the positions-only model missed by an average of 2.01 cm. Adding spikes increased the miss to 2.24 cm. Each trip counted equally.</p>
    </div>
    <p class="wt-credit">Justin Shin and Shantanu Jadhav, <i>Single Day W-Track Learning</i> (2024). Rat JS14, session 01, third running period (epoch 5). The earlier frame-by-frame replay follows trip 0 in a different running period. <a href="https://doi.org/10.48324/dandi.000978/0.240511.0307">Dataset</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a data-wt="notice">Sources and method</a> · <a href="https://github.com/eliminatenoise/NeuroTranslation/tree/0f3b3ab02e812a3f242c139c682fde57caa0df5e/benchmarks/wtrack-neural-motion">Run the original study ↗</a></p>`;
  find('notice').href = noticeURL;
  find('track').id = uid('track');
  find('close').id = uid('close');
  find('outcome').id = uid('outcome');
  find('reveal').setAttribute('aria-controls', uid('outcome'));

  let packet, forecasts, item, shown = false;
  function renderPrediction() {
    const mode = find('mode').value;
    const measured = shown ? item.target.xy : undefined;
    for (const key of ['track', 'close']) {
      drawPlane(find(key), packet.track, item.xy, {both:forecasts, mode}, measured, key === 'close');
    }
    const results = find('results');
    results.replaceChildren();
    find('error-head').hidden = !shown;
    for (const key of Object.keys(names)) {
      const xy = forecasts[key], tr = results.insertRow();
      tr.classList.toggle('wt-selected', key === mode);
      cell(tr, 'th', names[key], 'row');
      for (const v of xy) cell(tr, 'td', v.toFixed(2));
      if (shown) cell(tr, 'td', Math.hypot(xy[0]-measured[0], xy[1]-measured[1]).toFixed(2));
    }
    find('measured-key').hidden = !shown;
    find('reveal').setAttribute('aria-expanded', String(shown));
    find('reveal').textContent = shown ? 'Hide the later camera reading' : 'Reveal the later camera reading';
    find('outcome').textContent = shown ? 'Camera row ' + item.target.frame + ' recorded (X, Y) = ' +
      cm(measured) + ' at ' + seconds(item.target.time) + ', ' + ((item.target.time-item.cutoff)*1000).toFixed(1) +
      ' ms after the cutoff. The miss is the straight-line distance to that reading.' : '';
  }
  function chooseTrip() {
    item = packet.cases[find('trip').selectedIndex];
    forecasts = comparePositions(packet, item);
    shown = false;
    find('clock').textContent = 'Last input cutoff ' + seconds(item.cutoff) + ' on the recording clock. Requested forecast time ' +
      seconds(item.cutoff+0.25) + '.';
    const times = find('times');
    times.replaceChildren();
    item.times.forEach((t,i) => {
      const tr = times.insertRow();
      cell(tr, 'th', item.frames[i], 'row');
      for (const v of [t.toFixed(6), ...item.xy[i].map(v => v.toFixed(2))]) cell(tr, 'td', v);
    });
    find('bins').replaceChildren(...ids.map((id,i) =>
      element('li',id + ' · ' + (item.cutoff-1+i/4).toFixed(3) + '–' + seconds(item.cutoff-.75+i/4))));
    drawCounts(find('pfc'), packet.units, item, 'PFC');
    drawCounts(find('ca1'), packet.units, item, 'CA1');
    renderPrediction();
  }
  find('trip').onchange = chooseTrip;
  find('mode').onchange = renderPrediction;
  find('reveal').onclick = () => { shown = !shown; renderPrediction(); };
  async function load() {
    const status = find('status');
    status.textContent = 'Loading the recorded positions and fitted weights…';
    try {
      packet = await readPacket(packetURL, digest);
      find('trip').replaceChildren(...packet.cases.map(c => new Option('Trip ' + c.trip, c.trip)));
      chooseTrip();
      find('body').hidden = false;
      status.textContent = '';
    } catch {
      find('body').hidden = true;
      status.textContent = 'The recording or its weights could not be verified. Open the guide over HTTPS or on localhost. ';
      const retry = element('button', 'Try again');
      retry.type = 'button';
      retry.onclick = load;
      status.append(retry);
    }
  }
  return load();
}
