import { SCALP, FOREARM, SCALP_TRACES, FOREARM_TRACES, TRACES, EEG_LIMIT_UV, cueSeconds,
  loadClip, scalpColour, wristPoint, tracePath } from './replay.mjs';

const SVG = 'http://www.w3.org/2000/svg';
import { bindWristForecast } from './forecast-panel.mjs';

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

function voltageLimit(trace, values) {
  if (SCALP_TRACES.includes(trace)) return EEG_LIMIT_UV;
  return Math.max(10, 10 * Math.ceil(Math.max(...values.map(Math.abs)) / 10));
}

function makePlot(host, clip, initialTrace) {
  const row = append(host, 'div');
  row.className = 'activity-trace';
  const header = append(row, 'div');
  header.className = 'activity-trace-head';
  const label = append(header, 'span');
  const output = append(header, 'output');
  output.setAttribute('aria-live', 'off');
  const plot = svg(row, 'svg', { viewBox:'0 0 600 46', preserveAspectRatio:'none', 'aria-hidden':'true' });
  svg(plot, 'line', { x1:0, y1:23, x2:600, y2:23, stroke:'#3d4d59' });
  const cueX = 600 * (clip.cueSourceRow - clip.firstSourceRow) / (clip.lastSourceRow - clip.firstSourceRow);
  svg(plot, 'line', { x1:cueX, x2:cueX, y1:0, y2:46, stroke:'#cba75a', 'stroke-dasharray':'2 3' });
  const path = svg(plot, 'path', {'stroke-width':1});
  const cursor = svg(plot, 'line', { x1:0, x2:0, y1:0, y2:46, class:'activity-cursor' });
  function select(trace) {
    const values = clip.series[trace.key];
    // The two angle axes deliberately share a scale. A small movement cannot
    // fill its own plot and appear as large as a 50-degree wrist flexion.
    const limit = trace.angle ? 60 : voltageLimit(trace, values);
    label.textContent = trace.label;
    append(label, 'small', '±' + limit + ' ' + trace.unit);
    output.setAttribute('aria-label', trace.label);
    path.setAttribute('d', tracePath(values, limit));
    path.setAttribute('stroke', trace.color);
    return {trace, values, cursor, output, select};
  }
  return select(initialTrace);
}

function bindInstruments(q, clip) {
  const head = q('[data-scalp]'), forearm = q('[data-pairs]'), plane = q('[data-wrist-plane]');
  const angles = q('[data-plane-angles]');
  const sites = SCALP.map(([id, x, y]) => {
    const group = svg(head, 'g', {'data-site':id, 'aria-hidden':'true'});
    const circle = svg(group, 'circle', {cx:x, cy:y, r:9});
    svg(group, 'text', {x, y:y-14, class:'site-name'}).textContent = id;
    const readout = svg(group, 'text', {x, y:y+22, class:'site-voltage'});
    return {id, circle, readout, values:clip.series['scalp' + id + '_uV']};
  });
  const pairs = FOREARM.map(([id, muscle]) => {
    const card = append(forearm, 'div');
    append(card, 'small', id + 'L − ' + id + 'R');
    append(card, 'span', muscle);
    const readout = append(card, 'output');
    readout.setAttribute('aria-live', 'off');
    readout.setAttribute('aria-label', muscle + ' pair difference');
    return {readout, values:clip.series['forearm' + id + 'Lminus' + id + 'R_uV']};
  });
  const {wristExtension_deg:extensions, wristRadialDeviation_deg:deviations} = clip.series;
  const path = [];
  for (let i = 0; i < extensions.length; i++) {
    if (i && extensions[i] === extensions[i-1] && deviations[i] === deviations[i-1]) continue;
    const [x,y] = wristPoint(extensions[i], deviations[i]);
    path.push((i ? 'L' : 'M') + x.toFixed(3) + ',' + y.toFixed(3));
  }
  svg(plane, 'path', {d:path.join(' '), fill:'none', stroke:'#86c5d6', 'stroke-width':2.5});
  const ring = svg(plane, 'circle', {r:4, fill:'#14232e', stroke:'#ffdd91', 'stroke-width':2});
  function update(i) {
    const readings = [];
    for (const {id, circle, readout, values} of sites) {
      const v = values[i];
      circle.setAttribute('fill', scalpColour(v));
      readout.textContent = (v > 0 ? '+' : '') + v;
      readings.push(id + ' ' + v);
    }
    head.setAttribute('aria-label', 'Scalp voltages in microvolts. ' + readings.join(', '));
    for (const {readout, values} of pairs) readout.textContent = values[i] + ' µV';
    const [x, y] = wristPoint(extensions[i], deviations[i]);
    ring.setAttribute('cx', x); ring.setAttribute('cy', y);
    angles.textContent = extensions[i].toFixed(2) + '° extension · ' + deviations[i].toFixed(2) + '° radial';
  }
  return update;
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
  const spatial = q('#ns-act-spatial'), play = q('[data-play]');
  const hand = q('#ns-act-hand');
  const rat = q('#ns-act-rat'), ratForecast = q('#ns-rat-forecast');
  let ratLoad, ratStyle, ratMounted = false;
  let spatialPanel, spatialLoad, handPanel, handLoad, tabVersion = 0;
  const regions = q('[data-region]'), actions = q('[data-action]');
  const scalpChoice = q('[data-scalp-select]'), forearmChoice = q('[data-emg-select]');
  let updateInstruments;
  let clip, clipRequest, plots = [], index = 0;
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
    updateInstruments(i);
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

  const forecastPanel = bindWristForecast(q('[data-model]'), on, () => {
    return !disposed && dialog.open && !recording.hidden;
  }, i => { stop(); showSample(i); });

  async function showRecording() {
    if (clipRequest) return;
    clipRequest = loadClip();
    try {
      clip = await clipRequest;
      if (disposed) return;
      plots = TRACES.map(t => makePlot(q('[data-traces]'), clip, t));
      for (const [i, select, traces] of [[0, scalpChoice, SCALP_TRACES], [1, forearmChoice, FOREARM_TRACES]]) {
        for (const t of traces) select.add(new Option(t.label.split(' · ')[1], t.key));
        select.value = plots[i].trace.key;
        on(select, 'change', () => {
          plots[i] = plots[i].select(traces[select.selectedIndex]);
          showSample(index);
        });
      }
      updateInstruments = bindInstruments(q, clip);
      seek.max = clip.lastSourceRow - clip.firstSourceRow;
      q('[data-replay]').hidden = false;
      q('[data-clip-status]').textContent = '';
      showSample(clip.cueSourceRow - clip.firstSourceRow);
      forecastPanel.setClip(clip);
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

  async function openSpatial(clipId, version) {
    try {
      spatialLoad ??= import('./spatial-panel.mjs');
      const module = await spatialLoad;
      if (disposed || !dialog.open || version !== tabVersion) return;
      spatialPanel ??= module.mountSpatialReplay(spatial);
      await spatialPanel.show(clipId);
    } catch {
      spatialLoad = null;
      if (!disposed && version === tabVersion)
        spatial.querySelector('[data-motion-status]').textContent = 'The motion viewer could not open. Reopen this view to try again.';
    }
  }

  function loadRatStyle() {
    ratStyle = doc.createElement('link');
    ratStyle.rel = 'stylesheet';
    ratStyle.href = new URL('./wtrack/style.css', import.meta.url);
    return new Promise((resolve, reject) => {
      ratStyle.onload = resolve;
      ratStyle.onerror = reject;
      doc.head.append(ratStyle);
    });
  }

  async function openRat(version) {
    if (ratMounted) return;
    try {
      ratLoad ??= Promise.all([import('./wtrack/view.js'), loadRatStyle()]);
      const [viewer] = await ratLoad;
      if (disposed || !dialog.open || version !== tabVersion) return;
      ratMounted = true;
      const ready = viewer.mountWTrack(ratForecast);
      // Keep the shared inspector intact. Its source link opens the game's
      // local disclosure, so reading the method preserves the active trip.
      const notice = ratForecast.querySelector('[data-wt=notice]');
      const sources = q('#ns-rat-sources');
      notice.href = '#' + sources.id;
      on(notice, 'click', event => {
        event.preventDefault();
        sources.open = true;
        sources.querySelector('summary').focus();
      });
      for (const link of ratForecast.querySelectorAll('a[href^="https:"]')) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      await ready;
    } catch {
      ratLoad = null;
      ratStyle?.remove();
      ratMounted = false;
      if (!disposed && version === tabVersion) ratForecast.querySelector('[role=status]').textContent =
        'The rat viewer could not open. Select Rat brain activity again to retry.';
    }
  }

  async function openHand(query, version) {
    try {
      handLoad ??= import('../hand-search/hand-search.mjs');
      const module = await handLoad;
      if (disposed || !dialog.open || version !== tabVersion) return;
      handPanel ??= module.mountHandSearch(hand, {baseUrl:new URL('../../../assets/hand-search/',import.meta.url)});
      await handPanel.show(query);
    } catch {
      handLoad = null;
      if (!disposed && version === tabVersion) hand.querySelector('[role=status]').textContent = 'Hand search could not open. Reopen this view to try again.';
    }
  }

  function setTab(mode, selection) {
    tabVersion++;
    spatialPanel?.hide();
    handPanel?.hide();
    stop();
    recording.hidden = mode !== 'recording';
    game.hidden = mode !== 'game';
    rat.hidden = mode !== 'rat';
    spatial.hidden = mode !== 'spatial';
    hand.hidden = mode !== 'hand';
    for (const b of dialog.querySelectorAll('[data-tab]')) b.setAttribute('aria-pressed', String(b.dataset.tab === mode));
    if (!recording.hidden) showRecording();
    if (!rat.hidden) openRat(tabVersion);
    if (!spatial.hidden) openSpatial(selection,tabVersion);
    if (!hand.hidden) openHand(selection,tabVersion);
  }

  function open(mode = 'recording', selection) {
    if (dialog.open || !canOpen()) return;
    populateRegions();
    pause();
    dialog.showModal();
    setTab(mode,selection);
    q('[data-close]').focus();
  }

  function close(action = null, returnFocus = true) {
    if (!dialog.open) return;
    stop();
    tabVersion++;
    spatialPanel?.hide();
    handPanel?.hide();
    dialog.close();
    if (returnFocus) {
      resume(action);
      canvas.focus({preventScroll:true});
    }
  }

  on(trigger, 'click', () => open());
  on(doc, 'ns-open-hand-search', e => {
    if (typeof e.detail?.text !== 'string') return;
    if (dialog.open) setTab('hand',e.detail.text);
    else open('hand',e.detail.text);
  });
  on(doc, 'ns-open-spatial-replay', e => {
    const id = e.detail?.clipId;
    if (typeof id !== 'string') return;
    if (dialog.open) setTab('spatial',id);
    else open('spatial',id);
  });
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
  on(regions, 'change', updateActions);
  on(actions, 'change', updateRoute);
  on(q('[data-move]'), 'click', () => close({ type:'muscle', regionId:regions.value, actionId:actions.value }));
  on(doc, 'visibilitychange', () => { if (doc.hidden) stop(); });
  on(win, 'blur', stop);
  return () => { disposed = true; close(null, false); spatialPanel?.dispose(); handPanel?.dispose(); ratStyle?.remove(); events.abort(); };
}
