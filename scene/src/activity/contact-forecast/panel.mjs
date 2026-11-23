import './predict.js';
import {integrity} from './assets.mjs';

async function load(name) {
  const response = await fetch(new URL(name + '.json', import.meta.url), {integrity:integrity[name]});
  if (!response.ok) throw Error('Could not load ' + name);
  return response.json();
}

export function bindContactForecast(panel, on) {
  const phase = panel.querySelector('[data-phase]');
  const offset = panel.querySelector('[data-offset]');
  const contact = panel.querySelector('[data-contact]');
  const status = panel.querySelector('[role=status]');
  const results = panel.querySelector('[data-contact-results]');
  const table = panel.querySelector('tbody');
  const kernel = globalThis.ContactForecast;
  let pending, bundle, models;

  function draw() {
    const original = bundle.phases[Number(phase.value)];
    const row = original.rows.find(r => r.offset === Number(offset.value));
    const index = bundle.contact_ids.indexOf(Number(contact.value));
    const all = kernel.predict(models.all, row.tokens);
    const countCue = kernel.predict(models.count_cue, row.tokens);
    table.replaceChildren();
    for (const [name, value] of [
      ['Recorded', row.target[index]],
      ['Forecast from movement, counts and cue', all[index].toFixed(3)],
      ['Forecast from counts and cue', countCue[index].toFixed(3)]
    ]) {
      const tr = table.insertRow();
      const th = panel.ownerDocument.createElement('th');
      th.scope = 'row';
      th.textContent = name;
      tr.append(th);
      tr.insertCell().textContent = value;
    }
    status.textContent = '13 September 2017 · original trial ' + original.trial + ' · contact ' + contact.value;
    panel.querySelector('[data-contact-history]').textContent = 'The preceding 100 ms at this contact contained ' + row.prior[index] + ' recorded events.';
  }
  function setOffsets() {
    const original = bundle.phases[Number(phase.value)];
    offset.replaceChildren(...original.rows.map(row => new Option(row.offset * 10 + ' ms', row.offset)));
    draw();
  }
  on(phase, 'change', setOffsets);
  on(offset, 'change', draw);
  on(contact, 'change', draw);
  return {async show(selection, current) {
    pending ??= Promise.all([load('samples'), load('models')]).catch(error => { pending = null; throw error; });
    [bundle, models] = await pending;
    if (!current()) return;
    contact.replaceChildren(...bundle.contact_ids.map(id => new Option(String(id), id)));
    phase.value = String([0,1,2].includes(selection) ? selection : 0);
    setOffsets();
    results.hidden = false;
  }};
}
