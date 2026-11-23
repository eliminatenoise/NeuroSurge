import {bindTakeComparison} from './take-comparison.mjs';

// Compare the entire name. Side words, accents and word order remain significant.
function tidy(text) {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ');
}
function valid(name) {
  return name.length <= 40 && /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ]*$/u.test(name) &&
    !/\b(?:or|then)\b/i.test(name);
}

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

// Truncate to a millisecond so the displayed upper limit can be typed back.
export const takeSeconds = ms => (Math.floor(ms) / 1000).toString();

// Bookmarks hold references to completed numeric takes. Each request resolves
// synchronously while the game is paused in F. Nothing is read from storage.
export function bindNamedTakes(details, getLatestTake) {
  const entries = new Map();
  const list = details.querySelector('ul');
  const field = details.querySelector('input');
  const latest = details.querySelector('[data-latest]');
  const status = details.querySelector('[role=status]');
  const save = details.querySelector('[data-save]');
  const forget = details.querySelector('[data-forget]');
  const confirm = details.querySelector('[data-confirm]');
  const cancel = details.querySelector('[data-cancel]');
  const controller = new details.ownerDocument.defaultView.AbortController();
  const options = {signal: controller.signal};
  const comparison = bindTakeComparison(details, entries, lookup, options);
  let pending;

  function resetConfirmation() {
    pending = null;
    confirm.hidden = cancel.hidden = true;
    status.textContent = '';
  }
  function render() {
    comparison.refresh();
    const take = getLatestTake();
    details.hidden = !take && !entries.size;
    latest.textContent = take ? 'Last finished take · ' + describe(take) : 'No unnamed take in this tab.';
    save.disabled = !take;
    forget.disabled = entries.size === 0;
    list.replaceChildren();
    for (const entry of entries.values()) {
      const li = details.ownerDocument.createElement('li');
      li.textContent = entry.name + ' · ' + describe(entry.take);
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
  function edit(operation) {
    resetConfirmation();
    const name = tidy(field.value);
    if (!valid(name)) {
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
      pending = {operation, key, entry, take};
      status.textContent = '“' + entry.name + '” holds ' + describe(entry.take) +
        '. Replace it with ' + describe(take) + ', or cancel and enter another name.';
      confirm.textContent = 'Replace take';
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
    if (operation === 'save') {
      if (take !== getLatestTake()) return;
      entries.set(key, {name: entry.name, take});
    } else {
      entries.delete(key);
    }
    render();
    status.textContent = (operation === 'save' ? 'Replaced “' : 'Forgot “') + entry.name + '”.';
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
