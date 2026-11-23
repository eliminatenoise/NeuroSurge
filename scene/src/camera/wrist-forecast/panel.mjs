import {showRoleForecast} from './role-panel.mjs';
import {roleHistoryMs} from './role-model.mjs';
import {exampleTake, horizons, maxGapMs, sides, wristFrames, wristObservation, wristTrend} from './forecast.mjs';

const name = {leftArm: 'Left wrist', rightArm: 'Right wrist'};
const seconds = ms => (ms / 1000).toFixed(3) + ' s';
const coordinate = p => '(' + p.map(v => v.toFixed(4)).join(', ') + ')';
const error = (estimate, actual) => Math.hypot(estimate[0] - actual[0], estimate[1] - actual[1]).toFixed(4);

function plot(canvas, past, side, trend, observations, extent) {
  const ctx = canvas.getContext('2d'), size = canvas.width, mid = size / 2;
  const scale = (mid - 15) / extent;
  const pixel = p => [mid + p[0] * scale, mid - p[1] * scale];
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#506174';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(8, mid);
  ctx.lineTo(size - 8, mid);
  ctx.moveTo(mid, 8);
  ctx.lineTo(mid, size - 8);
  ctx.stroke();
  ctx.strokeStyle = '#72d7ff';
  ctx.fillStyle = '#72d7ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let j = 0; j < past.length; j++) {
    const row = past[j];
    if (!row[side]) continue;
    const [x, y] = pixel(row[side]);
    if (past[j - 1]?.[side] && row.time - past[j - 1].time <= maxGapMs) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  const anchor = past.at(-1)[side];
  if (anchor) {
    ctx.beginPath();
    ctx.arc(...pixel(anchor), 4, 0, 2 * Math.PI);
    ctx.fill();
  }
  if (trend.predictions) {
    ctx.strokeStyle = '#ffc578';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(...pixel(anchor));
    ctx.lineTo(...pixel(trend.predictions[1]));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of trend.predictions) {
      ctx.beginPath();
      ctx.arc(...pixel(p), 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#ebf3f8';
  ctx.lineWidth = 2;
  for (const observation of observations) {
    if (!observation.point) continue;
    const [x, y] = pixel(observation.point);
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y + 4);
    ctx.moveTo(x - 4, y + 4);
    ctx.lineTo(x + 4, y - 4);
    ctx.stroke();
  }
}

export function bindWristForecast(panel, getLatestTake, dismiss) {
  const q = selector => panel.querySelector(selector), doc = panel.ownerDocument;
  const slider = q('[data-cutoff]'), play = q('[data-play]'), controls = q('[data-wrist-results]');
  const cards = q('[data-side-readouts]'), report = q('[data-source]');
  const controller = new AbortController(), options = {signal: controller.signal};
  let frames = [], animation = 0, isExample = false, offsetsOnly = false;

  function stop() {
    cancelAnimationFrame(animation);
    animation = 0;
    play.textContent = 'Replay at half speed';
  }
  function draw() {
    const i = Number(slider.value), anchor = frames[i];
    q('[data-clock]').textContent = seconds(anchor.time);
    slider.setAttribute('aria-valuetext', seconds(anchor.time));
    const method = q('[data-wrist-method]').value;
    const fallback = method === 'auto' && offsetsOnly;
    const trend = method === 'trend' || fallback;
    q('[data-offsets-only]').hidden = !fallback;
    q('[data-role-model]').hidden = trend;
    q('[data-trend-results]').hidden = !trend;
    if (!trend) {
      showRoleForecast(q('[data-role-model]'), frames, i, method, isExample);
      return;
    }
    const past = frames.slice(0, i + 1).filter(f => anchor.time - f.time <= 1000);
    const results = sides.map(side => ({
      side, trend: wristTrend(frames, i, side),
      observations: horizons.map(ms => wristObservation(frames, i, side, ms))
    }));
    let extent = .5;
    for (const {side, trend, observations} of results) {
      const shown = [...past.map(f => f[side]), ...(trend.predictions || []), ...observations.map(o => o.point)];
      for (const p of shown) if (p) extent = Math.max(extent, Math.abs(p[0]), Math.abs(p[1]));
    }
    extent = Math.ceil(extent * 4) / 4;
    q('[data-scale]').textContent = 'Both plots span ±' + extent + ' image heights from each shoulder. Rightward means outward for either wrist. Upward means up in the picture. Coordinates and errors are in image heights.';
    cards.replaceChildren();
    for (const {side, trend, observations} of results) {
      q('[data-label="' + side + '"]').textContent = name[side] + (anchor[side] ? '' : ' · no sample');
      plot(q('[data-plot="' + side + '"]'), past, side, trend, observations, extent);
      const section = doc.createElement('section');
      section.dataset.wrist = side;
      const title = doc.createElement('h3');
      title.textContent = name[side];
      const measured = doc.createElement('p');
      measured.textContent = anchor[side] ? 'At the cursor ' + coordinate(anchor[side]) + '. ' : '';
      measured.textContent += trend.issue || (trend.count + ' earlier and current samples across ' + seconds(trend.span) + '.');
      section.append(title, measured);
      if (trend.predictions) {
        const table = doc.createElement('table'), header = table.createTHead().insertRow();
        for (const title of ['Ahead', '+8/30 s', '+15/30 s']) {
          const th = doc.createElement('th');
          th.scope = 'col';
          th.textContent = title;
          header.append(th);
        }
        const body = table.createTBody();
        function row(label, values) {
          const tr = body.insertRow(), th = doc.createElement('th');
          th.scope = 'row';
          th.textContent = label;
          tr.append(th);
          for (const value of values) tr.insertCell().textContent = value;
        }
        row('Forecast', trend.predictions.map(coordinate));
        row(isExample ? 'Example path' : 'Tracked wrist path', observations.map(o => o.point ? coordinate(o.point) + ' · ' + o.kind : o.kind));
        for (const [fraction, label] of [[1, 'Trend error'], [.5, 'Half-speed error'], [0, 'Hold error']]) {
          row(label, observations.map((o, k) => {
            if (!o.point) return '—';
            const predicted = anchor[side].map((v, axis) => v + fraction * horizons[k] * trend.velocity[axis]);
            return error(predicted, o.point);
          }));
        }
        section.append(table);
      }
      cards.append(section);
    }
  }
  function select(example) {
    stop();
    isExample = example;
    const take = example ? exampleTake() : getLatestTake();
    frames = wristFrames(take);
    const haveWrist = frames.some(f => sides.some(side => f[side]));
    offsetsOnly = haveWrist && !frames.some(f => f.armGeometry);
    controls.hidden = !haveWrist;
    q('[data-use-take]').hidden = !example;
    q('[data-example]').hidden = example;
    report.textContent = example ? 'Authored example · two synthetic wrist paths sampled every 50 ms, with a break on the left.' :
      haveWrist ? (take.source === 'pictures' ? 'Last picture take' : take.source === 'video' ? 'Last video take' : 'Last camera take') +
        ' · tracked arm positions at the original frame times. This take stays in this tab.' :
      'No wrist samples in the last take. Use the recorder to save an arm take, or try the example below.';
    if (!haveWrist) return;
    slider.max = String(frames.length - 1);
    const mid = (frames[0].time + frames.at(-1).time) / 2;
    const firstTime = Math.min(frames.at(-1).time, Math.max(mid, frames[0].time + roleHistoryMs));
    slider.value = String(frames.findIndex(f => f.time >= firstTime));
    draw();
  }
  function reset() {
    if (panel.hidden) return;
    stop();
    frames = [];
    controls.hidden = panel.hidden = true;
    cards.replaceChildren();
    q('[data-role-values]').replaceChildren();
    q('[data-role-status]').textContent = '';
    q('[data-wrist-method]').value = 'auto';
    report.textContent = '';
    q('[data-clock]').textContent = '';
    for (const c of panel.querySelectorAll('canvas')) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }
  function open() {
    panel.hidden = false;
    select(false);
    q('h2').focus();
  }
  play.addEventListener('click', () => {
    if (animation) return stop();
    let i = Number(slider.value);
    if (i === frames.length - 1) {
      slider.value = '0';
      i = 0;
      draw();
    }
    const sourceStart = frames[i].time, start = performance.now();
    play.textContent = 'Pause replay';
    function tick(now) {
      const time = sourceStart + (now - start) / 2, prior = i;
      while (i + 1 < frames.length && frames[i + 1].time <= time) i++;
      if (prior !== i) {
        slider.value = String(i);
        draw();
      }
      if (i === frames.length - 1) stop();
      else animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
  }, options);
  q('[data-wrist-method]').addEventListener('change', () => { stop(); draw(); }, options);
  slider.addEventListener('input', () => { stop(); draw(); }, options);
  q('[data-example]').addEventListener('click', () => select(true), options);
  q('[data-use-take]').addEventListener('click', () => select(false), options);
  q('[data-return]').addEventListener('click', dismiss, options);
  return {open, reset, dispose() { reset(); controller.abort(); }};
}
