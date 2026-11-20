import { TRACES, cueSeconds, loadClip, loadForecast, tracePath } from './replay.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const angle = n => n.toFixed(1) + '°';

function append(parent, tag, text) {
  const el = parent.ownerDocument.createElement(tag);
  if (text !== undefined) el.textContent = text;
  parent.append(el);
  return el;
}

function svg(parent, tag, attrs) {
  const el = parent.ownerDocument.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  parent.append(el);
  return el;
}

function makePlots(host, clip) {
  return TRACES.map(trace => {
    const values = clip.series[trace.key];
    // The two angle axes deliberately share a scale. A small movement cannot
    // fill its own plot and appear as large as a 50-degree wrist flexion.
    const limit = trace.angle ? 60 : Math.max(10, 10 * Math.ceil(Math.max(...values.map(Math.abs)) / 10));
    const row = append(host, 'div');
    row.className = 'activity-trace';
    const header = append(row, 'div');
    header.className = 'activity-trace-head';
    const label = append(header, 'span', trace.label);
    append(label, 'small', '±' + limit + ' ' + trace.unit);
    const output = append(header, 'output');
    output.setAttribute('aria-live', 'off');
    output.setAttribute('aria-label', trace.label);
    const plot = svg(row, 'svg', { viewBox:'0 0 600 46', preserveAspectRatio:'none', 'aria-hidden':'true' });
    svg(plot, 'line', { x1:0, y1:23, x2:600, y2:23, stroke:'#3d4d59' });
    const cueX = 600 * (clip.cueSourceRow - clip.firstSourceRow) / (values.length - 1);
    svg(plot, 'line', { x1:cueX, x2:cueX, y1:0, y2:46, stroke:'#cba75a', 'stroke-dasharray':'2 3' });
    svg(plot, 'path', { d:tracePath(values, limit), stroke:trace.color, 'stroke-width':1 });
    const cursor = svg(plot, 'line', { x1:0, x2:0, y1:0, y2:46, class:'activity-cursor' });
    return { trace, values, cursor, output };
  });
}

function routeWording(region, action) {
  const cranial = region.pathway === 'corticobulbar';
  const mixed = region.pathway === 'corticospinal+corticobulbar';
  const relay = cranial ? 'brainstem' : mixed ? 'brainstem and upper spinal cord' : 'spinal cord';
  return {
    motor: 'Motor cortex → ' + relay + ' → ' + (cranial ? 'cranial motor nerves' : 'motor nerves') +
      ' → ' + region.plainLabel.toLowerCase() + '.',
    sensory: region.plainLabel + ' receptors → sensory nerves → ' + relay + ' → brain.',
    muscles: action ? 'The avatar uses ' + (action.plainMuscles?.pull || action.agonists.join(', ')) +
      ' for “' + (action.plainLabel || action.label) + '.”' : region.noActionReason
  };
}

export function bindActivityMap({dialog, trigger, canvas, canOpen, pause, resume, getBodyMap, getCurrentRegion}) {
  const doc = dialog.ownerDocument, win = doc.defaultView;
  const q = selector => dialog.querySelector(selector);
  const recording = q('#ns-act-recording'), game = q('#ns-act-game'), seek = q('[data-seek]');
  const play = q('[data-play]'), model = q('[data-model]'), target = q('[data-target]');
  const regions = q('[data-region]'), actions = q('[data-action]');
  let clip, clipRequest, plots = [], forecast, modelRequested = false, index = 0;
  let frame = 0, startTime = 0, startIndex = 0, disposed = false;
  let choices = [];
  const events = new AbortController();
  const on = (el, type, fn, capture = false) => el.addEventListener(type, fn, { capture, signal: events.signal });

  function stop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    play.textContent = index === Number(seek.max) ? 'Replay recording' : 'Play recording';
  }

  function showSample(i) {
    index = i;
    seek.value = String(i);
    const t = cueSeconds(clip, i);
    q('[data-clock]').textContent = (t > 0 ? '+' : '') + t.toFixed(3) + ' s';
    seek.setAttribute('aria-valuetext', t.toFixed(3) + ' seconds from the cue');
    const x = 600 * i / Number(seek.max);
    for (const {trace, values, cursor, output} of plots) {
      cursor.setAttribute('transform', 'translate(' + x.toFixed(2) + ')');
      output.textContent = values[i].toFixed(trace.angle ? 1 : 0) + ' ' + trace.unit;
    }
  }

  function advance(now) {
    const i = Math.min(Number(seek.max), startIndex + Math.floor((now - startTime) * clip.sourceSampleRateHz / 1000));
    if (i !== index) showSample(i);
    if (i === Number(seek.max)) stop();
    else frame = win.requestAnimationFrame(advance);
  }

  function togglePlay() {
    if (!clip) return;
    if (frame) { stop(); return; }
    if (index === Number(seek.max)) showSample(0);
    startIndex = index;
    startTime = win.performance.now();
    play.textContent = 'Pause recording';
    frame = win.requestAnimationFrame(advance);
  }

  function fillForecast(sync = false) {
    if (!forecast) return;
    const row = forecast[Number(target.value)];
    const tbody = q('[data-forecast-table]');
    tbody.replaceChildren();
    const both = row.forecasts.combined.meanDegrees;
    const rows = [
      ['Encoder · measured', row.measuredDegrees],
      ['Hold last angle', row.anchorDegrees],
      ['Wrist history · forecast', row.forecasts.motion.meanDegrees],
      ['Wrist + EEG · forecast', both],
      ['Wrist + EEG error (forecast − measured)', both.map((v, a) => v - row.measuredDegrees[a])]
    ];
    for (const [name, values] of rows) {
      const tr = append(tbody, 'tr');
      append(tr, 'th', name).scope = 'row';
      for (const value of values) append(tr, 'td', angle(value));
    }
    if (sync) {
      stop();
      showSample(clip.cueSourceRow - clip.firstSourceRow + Math.round(row.timeSeconds * clip.sourceSampleRateHz));
    }
  }

  async function ensureForecast() {
    if (!model.open || !clip || modelRequested) return;
    modelRequested = true;
    q('[data-model-status]').textContent = 'Running the wrist forecast on this device…';
    try {
      forecast = await loadForecast(clip);
      if (disposed) return;
      for (const [i, row] of forecast.entries()) target.add(new Option('+' + row.timeSeconds.toFixed(2) + ' s', String(i)));
      q('[data-model-status]').textContent = '';
      q('[data-comparison]').hidden = false;
      fillForecast(model.open && !recording.hidden && dialog.open);
    } catch {
      if (!disposed) q('[data-model-status]').textContent = 'Forecast unavailable. The recording can still be played.';
    }
  }

  async function showRecording() {
    if (clipRequest) return;
    clipRequest = loadClip();
    try {
      clip = await clipRequest;
      if (disposed) return;
      plots = makePlots(q('[data-traces]'), clip);
      seek.max = clip.lastSourceRow - clip.firstSourceRow;
      q('[data-replay]').hidden = false;
      q('[data-clip-status]').textContent = '';
      showSample(clip.cueSourceRow - clip.firstSourceRow);
      await ensureForecast();
    } catch {
      if (!disposed) q('[data-clip-status]').textContent = 'Recording unavailable or its checksum changed. Game pathways still work.';
    }
  }

  function updateRoute() {
    const region = choices[regions.selectedIndex], action = region?.actions[actions.selectedIndex];
    if (!region) return;
    const words = routeWording(region, action);
    for (const key of ['motor', 'sensory', 'muscles']) q('[data-' + key + ']').textContent = words[key];
  }

  function updateActions() {
    actions.replaceChildren();
    const region = choices[regions.selectedIndex];
    for (const a of region?.actions || []) actions.add(new Option(a.plainLabel || a.label, a.id));
    actions.disabled = !actions.options.length;
    q('[data-move]').disabled = actions.disabled;
    if (actions.disabled) actions.add(new Option('No motor-strip action', ''));
    updateRoute();
  }

  function populateRegions() {
    choices = (getBodyMap()?.regions || []).filter(r => r.kind === 'effector');
    regions.replaceChildren();
    for (const r of choices) regions.add(new Option(r.plainLabel + ' · ' + r.hemisphere + ' cortex', r.id));
    const current = getCurrentRegion();
    const choice = choices.find(r => r.id === current) || choices.find(r => r.id === 'lh_wrist') || choices[0];
    if (choice) regions.value = choice.id;
    updateActions();
  }

  function setTab(mode) {
    stop();
    recording.hidden = mode !== 'recording';
    game.hidden = mode !== 'game';
    for (const b of dialog.querySelectorAll('[data-tab]')) b.setAttribute('aria-pressed', String(b.dataset.tab === mode));
    if (!recording.hidden) showRecording();
  }

  function open() {
    if (dialog.open || !canOpen()) return;
    populateRegions();
    pause();
    dialog.showModal();
    setTab('recording');
    q('[data-close]').focus();
  }

  function close(action = null, returnFocus = true) {
    if (!dialog.open) return;
    stop();
    dialog.close();
    if (returnFocus) {
      resume(action);
      canvas.focus({preventScroll:true});
    }
  }

  on(trigger, 'click', open);
  on(win, 'keydown', e => {
    if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
    if (dialog.open && e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation(); close();
    } else if (!dialog.open && e.code === 'KeyM' && !e.repeat && canOpen() &&
        !e.target?.isContentEditable && !e.target?.closest?.('input, textarea, select, button, a[href], dialog[open]')) {
      e.preventDefault(); open();
    }
  }, true);
  for (const type of ['keydown','keyup']) on(dialog, type, e => e.stopPropagation());
  on(dialog, 'cancel', e => { e.preventDefault(); close(); });
  on(q('[data-close]'), 'click', () => close());
  for (const button of dialog.querySelectorAll('[data-tab]')) on(button, 'click', () => setTab(button.dataset.tab));
  on(play, 'click', togglePlay);
  on(seek, 'input', () => { showSample(Number(seek.value)); stop(); });
  on(model, 'toggle', ensureForecast);
  on(target, 'change', () => fillForecast(true));
  on(regions, 'change', updateActions);
  on(actions, 'change', updateRoute);
  on(q('[data-move]'), 'click', () => close({ type:'muscle', regionId:regions.value, actionId:actions.value }));
  on(doc, 'visibilitychange', () => { if (doc.hidden) stop(); });
  on(win, 'blur', stop);
  return () => { disposed = true; close(null, false); events.abort(); };
}
