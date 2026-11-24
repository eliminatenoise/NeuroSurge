import {bindTakeComparison} from './take-comparison.mjs';
import {tidyTakeName as tidy, validTakeName, MAX_TAKE_FILE_BYTES, encodeNamedTake, decodeNamedTake} from './take-file.mjs';

export function namedReplayRequest(text) {
  if (typeof text !== 'string') return null;
  const match = /^(?:please )?replay (?:my |the )?take named\b(.*)$/iu.exec(tidy(text));
  return match ? tidy(match[1].replace(/[.!?]+$/, '')) : null;
}

// Put the range before “of take named” so names containing numbers, “first”
// or “last” still match in full. A malformed range stays in the F dialog.
export function namedIntervalRequest(text) {
  if (typeof text !== 'string') return null;
  const match = /^(?:please )?replay (.+?) of (?:my |the )?take named\b(.*)$/iu.exec(tidy(text));
  return match ? {range: match[1], name: tidy(match[2].replace(/[.!?]+$/, ''))} : null;
}

const decimal = '(\\d+(?:\\.\\d{1,3})?|\\.\\d{1,3})';
const timePair = new RegExp('^(?:from )?' + decimal + ' to ' + decimal + ' (?:seconds?|s)$', 'i');
const firstOrLast = new RegExp('^(?:the )?(first|last) ' + decimal + ' (?:seconds?|s)$', 'i');
const milliseconds = value => Math.round(Number(value) * 1000);

export function resolveTakeInterval(range, duration) {
  const edges = timePair.exec(range);
  let start, end;
  if (edges) {
    start = milliseconds(edges[1]);
    end = milliseconds(edges[2]);
  } else {
    const edge = firstOrLast.exec(range);
    if (!edge) return null;
    const length = milliseconds(edge[2]);
    const first = edge[1].toLowerCase() === 'first';
    start = first ? 0 : duration - length;
    end = first ? length : duration;
  }
  return start >= 0 && start < end && end <= duration ? {start, end} : null;
}

export function resolveTakeSequence(text, lookup) {
  if (typeof text !== 'string' || !/\bthen\b/iu.test(text)) return null;
  const clauses = text.split(/\bthen\b/iu);
  function parse(step) {
    const command = step.replace(/,$/u, '').trimEnd();
    const name = namedReplayRequest(command);
    return name === null ? namedIntervalRequest(command) : {name};
  }
  const requests = clauses.map((clause, index) => {
    const clean = clause.trim();
    // “And” can be the last word in a saved name or part of “and then”.
    const connector = index < clauses.length - 1 && /\s+and$/iu.test(clean);
    return {exact: parse(clean), joined: connector ? parse(clean.replace(/\s+and$/iu, '').trimEnd()) : null};
  });
  if (!requests.some(({exact, joined}) => exact || joined)) return null;
  if (requests.length > 4 || text.length > 500) {
    return {error: 'Use two to four short named take commands joined by “then”.'};
  }
  const steps = [];
  for (const [index, {exact, joined}] of requests.entries()) {
    const step = 'Step ' + (index + 1) + '. ';
    if (!exact && !joined) return {error: step + 'Enter “replay take named” and a saved name, or specify part of a named take.'};
    const exactEntry = exact && lookup(exact.name);
    const joinedEntry = joined && lookup(joined.name);
    if (exactEntry && joinedEntry) {
      return {error: step + 'Two saved names match. Put a comma before “then” to show where the name ends.'};
    }
    const entry = exactEntry || joinedEntry;
    const request = exactEntry ? exact : joined;
    if (!entry) return {error: step + 'Choose an exact name from Named takes.'};
    const interval = request.range === undefined ? undefined : resolveTakeInterval(request.range, entry.take.duration);
    if (interval === null) {
      return {error: step + 'Choose increasing times between 0 and ' + takeSeconds(entry.take.duration) + ' s for “' + entry.name + '”.'};
    }
    if (interval && !entry.take.frames.some(frame => interval.start <= frame.time && frame.time < interval.end && frame.pose)) {
      return {error: step + 'Choose a part of “' + entry.name + '” with visible poses.'};
    }
    steps.push({take: entry.take, label: entry.name, interval});
  }
  return {steps};
}

// Truncate to a millisecond so the displayed upper limit can be typed back.
export const takeSeconds = ms => (Math.floor(ms) / 1000).toString();

// Bookmarks hold completed numeric takes in the current tab.
export function bindNamedTakes(details, getLatestTake) {
  const entries = new Map();
  const dialog = details.closest('dialog');
  const list = details.querySelector('ul');
  const field = details.querySelector('#ns-take-name');
  const latest = details.querySelector('[data-latest]');
  const status = details.querySelector('[role=status]');
  const save = details.querySelector('[data-save]');
  const forget = details.querySelector('[data-forget]');
  const filePicker = details.querySelector('[data-open-take-file]');
  const confirm = details.querySelector('[data-confirm]');
  const cancel = details.querySelector('[data-cancel]');
  const controller = new details.ownerDocument.defaultView.AbortController();
  const options = {signal: controller.signal};
  const comparison = bindTakeComparison(details, entries, lookup, options);
  let pending;
  let revision = 0;

  function resetConfirmation() {
    revision++;
    pending = null;
    confirm.hidden = cancel.hidden = true;
    status.textContent = '';
  }
  function render() {
    comparison.refresh();
    const take = getLatestTake();
    details.hidden = false;
    latest.textContent = take ? 'Last finished take · ' + describe(take) : 'Use C to capture a take to name here.';
    save.disabled = !take;
    forget.disabled = entries.size === 0;
    list.replaceChildren();
    for (const entry of entries.values()) {
      const li = details.ownerDocument.createElement('li');
      li.textContent = entry.name + ' · ' + (entry.fromFile ? 'From file · ' : '') + describe(entry.take) + ' ';
      const download = details.ownerDocument.createElement('button');
      download.type = 'button';
      download.textContent = 'Download';
      download.dataset.downloadTake = entry.name;
      download.setAttribute('aria-label', 'Download ' + entry.name);
      li.append(download);
      list.append(li);
    }
  }
  function describe(take) {
    const prefix = take.source === 'pictures' ? 'Pictures · ' : take.source === 'video' ? 'Video · ' : '';
    return prefix + take.name + ' · ' + takeSeconds(take.duration) + ' s';
  }
  function lookup(name) {
    return entries.get(tidy(name).toLowerCase());
  }
  function offerReplace(key, entry, take, operation) {
    pending = {operation, key, entry, take};
    status.textContent = '“' + entry.name + '” holds ' + describe(entry.take) +
      '. Replace it with ' + describe(take) + ', or keep the existing take.';
    confirm.textContent = 'Replace take';
    confirm.hidden = cancel.hidden = false;
    cancel.focus();
  }
  function edit(operation) {
    resetConfirmation();
    const name = tidy(field.value);
    if (!validTakeName(name)) {
      status.textContent = 'Use 1–40 letters, numbers or spaces. Choose a name without “or” or “then”.';
      field.focus();
      return;
    }
    const take = getLatestTake(), key = name.toLowerCase(), entry = entries.get(key);
    if (operation === 'save') {
      if (!take) return;
      if (!entry) {
        entries.set(key, {name, take});
        render();
        status.textContent = 'Saved “' + name + '” in this tab.';
        return;
      }
      if (entry.take === take) {
        status.textContent = '“' + entry.name + '” already holds this take.';
        return;
      }
      offerReplace(key, entry, take, operation);
      return;
    } else {
      if (!entry) {
        status.textContent = 'No saved take has that exact name.';
        return;
      }
      pending = {operation, key, entry};
      status.textContent = 'Forget “' + entry.name + '” (' + describe(entry.take) + ')?';
      confirm.textContent = 'Forget take';
    }
    confirm.hidden = cancel.hidden = false;
    cancel.focus();
  }
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-download-take]');
    const entry = button && lookup(button.dataset.downloadTake);
    if (!entry) return;
    try {
      const text = encodeNamedTake(entry.name, entry.take);
      const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
      const link = details.ownerDocument.createElement('a');
      link.href = url;
      link.download = entry.name.replace(/ /g, '-') + '.neurosurge-take.json';
      try {
        details.append(link);
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      resetConfirmation();
      status.textContent = 'Choose another take to download. This take file could not be saved.';
    }
  }, options);
  filePicker.addEventListener('change', async () => {
    const file = filePicker.files[0];
    filePicker.value = '';
    if (!file) return;
    resetConfirmation();
    if (file.size > MAX_TAKE_FILE_BYTES) {
      status.textContent = 'Choose a NeuroSurge take file with a size of 2 MiB or less.';
      return;
    }
    const openedAt = revision;
    const stillOpen = () => openedAt === revision && details.open &&
      (!dialog || dialog.open) && !controller.signal.aborted;
    status.textContent = 'Opening take file…';
    try {
      const text = await file.text();
      if (!stillOpen()) return;
      const {name, take} = decodeNamedTake(text);
      const key = name.toLowerCase(), entry = entries.get(key);
      field.value = name;
      if (entry) {
        offerReplace(key, entry, take, 'import');
      } else {
        entries.set(key, {name, take, fromFile:true});
        render();
        status.textContent = 'Opened “' + name + '”. Enter “replay take named ' + name + '” in the Command box.';
      }
    } catch {
      if (!stillOpen()) return;
      status.textContent = 'Choose a valid NeuroSurge take file.';
    }
  }, options);
  save.addEventListener('click', () => edit('save'), options);
  field.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (!save.disabled) edit('save');
    }
  }, options);
  forget.addEventListener('click', () => edit('forget'), options);
  cancel.addEventListener('click', () => { resetConfirmation(); field.focus(); }, options);
  field.addEventListener('input', resetConfirmation, options);
  details.addEventListener('toggle', () => { if (!details.open) resetConfirmation(); }, options);
  confirm.addEventListener('click', () => {
    const request = pending;
    resetConfirmation();
    if (!request || lookup(field.value) !== request.entry) return;
    const {operation, key, entry, take} = request;
    if (operation === 'save' || operation === 'import') {
      if (operation === 'save' && take !== getLatestTake()) return;
      entries.set(key, {name: entry.name, take, fromFile: operation === 'import'});
    } else {
      entries.delete(key);
    }
    render();
    status.textContent = (operation === 'forget' ? 'Forgot “' : 'Replaced “') + entry.name + '”.';
    field.focus();
  }, options);
  function reset() {
    details.open = false;
    field.value = '';
    resetConfirmation();
    render();
  }
  return {
    lookup, reset, compare: comparison.command,
    get size() { return entries.size; },
    clear() { entries.clear(); reset(); },
    dispose() { controller.abort(); }
  };
}
