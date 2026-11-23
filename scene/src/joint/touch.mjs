/* An invented spring load and earlier spike history for the passive-touch study. */
export const touchTask = 'human_touch_afferent';

export function isTouchQuestion(words) {
  const text = String(words).trim().replace(/[.?!]+$/, '').toLowerCase();
  return /^(?:how many (?:touch |sensory )?spikes (?:will|would) (?:the |a |my )?(?:fingertip|touch|sensory) nerve (?:send|fire)|(?:forecast|predict|estimate|show) (?:the )?(?:fingertip|touch|tactile) (?:nerve )?(?:spikes|spike count|firing))$/.test(text);
}

export function inventedContact(travelMm, includeSpikes) {
  if (!Number.isFinite(travelMm) || travelMm < 0 || travelMm > 5) throw Error('Choose a travel distance from 0 to 5 mm.');
  return [Array.from({length: 10}, (_, i) => {
    // Constant sliding speed, a 0.2 N/mm tangential spring and 4 N normal load.
    // Each force entry is the average over its 20 ms interval.
    const meanShear = 0.2 * travelMm * (i + 0.5) / 10;
    const count = Number(includeSpikes && (i === 3 || i === 8));
    return [meanShear, 0, 4, count, (1820 + i * 20) / 1000];
  })];
}

export const touchPanel = `<details data-touch hidden><summary>Fingertip touch</summary>
<p>Slide a virtual plate under a fingertip. A model spring sets the sideways force. The downward load stays at 4 N.</p>
<label>Plate travel in 200 ms <input data-travel type="range" min="0" max="5" step=".25" value="2"></label>
<p data-load></p>
<label>Earlier nerve activity <select data-touch-history><option value="two">Two invented spikes</option><option value="zero">No spikes</option></select></label>
<button type="button" data-touch-run>Forecast touch spikes</button><p data-touch-result role="status"></p></details>`;

export function bindTouch(node, predict) {
  const panel = node.querySelector('[data-touch]');
  const travel = panel.querySelector('[data-travel]');
  const history = panel.querySelector('[data-touch-history]');
  const button = panel.querySelector('[data-touch-run]');
  const result = panel.querySelector('[data-touch-result]');
  let generation = 0;
  let controller;
  function changed() {
    generation++;
    controller?.abort();
    const mm = Number(travel.value);
    panel.querySelector('[data-load]').textContent = mm.toFixed(2) + ' mm of slide · final sideways force ' + (.2 * mm).toFixed(2) + ' N.';
    result.textContent = '';
    button.disabled = false;
  }
  changed();
  travel.addEventListener('input', changed);
  history.addEventListener('change', changed);
  const ready = fetch('/api/tasks').then(response => {
    if (!response.ok) return false;
    return response.json().then(catalog => Object.hasOwn(catalog.tasks, touchTask));
  }).catch(() => false).then(supported => {panel.hidden = !supported; return supported;});
  async function run() {
    if (!await ready) return false;
    panel.open = true;
    controller?.abort();
    controller = new AbortController();
    const token = ++generation;
    const input = inventedContact(Number(travel.value), history.value === 'two');
    button.disabled = true;
    result.textContent = 'Forecasting…';
    try {
      const values = await predict(touchTask, input, controller.signal);
      if (token !== generation) return true;
      if (values.length !== 1 || !Number.isFinite(values[0]) || values[0] < 0) throw Error('Invalid expected spike count.');
      result.textContent = values[0].toFixed(3) + ' expected spikes in the interval 20–40 ms ahead, from the invented load and spike history.';
    } catch (e) {
      if (token === generation) result.textContent = 'Forecast unavailable. ' + e.message;
    } finally {
      if (token === generation) button.disabled = false;
    }
    return true;
  }
  button.addEventListener('click', run);
  return {run, clear: changed};
}
