import {rankReaches, studyShape, takeShape} from './match.mjs';

const cyan = '#63d6ff', amber = '#ffc47b', muted = '#7290a5';
const label = r => 'Block ' + r.block + ' · workspace ' + r.workspace + ' · trial ' + r.trial;
const score = n => n < 1e-10 ? '0' : n.toPrecision(3);
const fmt = n => n.toFixed(1);

function plot(canvas, lines, index, axes = []) {
  const ctx = canvas.getContext('2d');
  const {width: w, height: h} = canvas;
  ctx.clearRect(0, 0, w, h);
  const points = [...lines.flatMap(l => l.path), [0, 0]];
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const scale = Math.min((w - 50) / Math.max(1e-7, x1 - x0), (h - 50) / Math.max(1e-7, y1 - y0));
  const pixel = ([x, y]) => [w / 2 + (x - (x0 + x1) / 2) * scale, h / 2 - (y - (y0 + y1) / 2) * scale];
  const [ox, oy] = pixel([0, 0]);
  ctx.strokeStyle = muted;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ox - 6, oy);
  ctx.lineTo(ox + 6, oy);
  ctx.moveTo(ox, oy - 6);
  ctx.lineTo(ox, oy + 6);
  ctx.stroke();
  for (const [name, x, y] of axes) {
    const cx = 36, cy = h - 29;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + x * 20, cy - y * 20);
    ctx.stroke();
    ctx.fillStyle = '#d9e2e9';
    ctx.font = '13px sans-serif';
    ctx.fillText(name, cx + x * 25 - 3, cy - y * 25 + 4);
  }
  for (const {path, color, dash} of lines) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash(dash || []);
    path.forEach((p, i) => {
      const [x, y] = pixel(p);
      if (i)
        ctx.lineTo(x, y);
      else
        ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(...pixel(path[index]), 4, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export function bindReachStudy(panel, getLatestTake, dismiss) {
  const q = s => panel.querySelector(s);
  const side = q('[data-side]'), listed = q('[data-case]'), sample = q('[data-sample]'),
        orbit = q('[data-orbit]');
  const status = q('[data-match-status]'), result = q('[data-study-result]'), play = q('[data-play]');
  const controller = new AbortController(), options = {signal: controller.signal};
  let dataPromise, cases, query, ranking, exampleMode = false, busy = 0, animation = 0;
  function stop() {
    cancelAnimationFrame(animation);
    animation = 0;
    play.textContent = 'Replay at ⅛ speed';
  }
  function reset() {
    busy++;
    if (panel.hidden) return;
    stop();
    query = null;
    ranking = null;
    exampleMode = false;
    panel.hidden = true;
    result.hidden = true;
    q('[data-shape-key]').textContent = '';
    status.textContent = '';
    for (const el of panel.querySelectorAll('canvas'))
      el.getContext('2d').clearRect(0, 0, el.width, el.height);
    listed.replaceChildren();
  }
  function draw() {
    const r = cases[Number(listed.value)], i = Number(sample.value);
    const path = studyShape(r);
    plot(q('[data-shapes]'), [{path, color: amber}, {path: query.path, color: cyan, dash: [7, 5]}], i);
    const theta = Number(orbit.value) * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
    const project = ([x, y, z]) => [c * x + s * z, y * .85 + (s * x - c * z) * .52];
    const mm = r.path.map(p => p.map((v, j) => (v - r.path[0][j]) * 1000));
    const axes =
        ['X', 'Y', 'Z'].map((name, j) => [name, ...project([0, 1, 2].map(k => Number(k === j)))]);
    plot(q('[data-spatial]'), [{path: mm.map(project), color: amber}], i, axes);
    const metric = ranking.ranked.find(row => row.index === Number(listed.value));
    q('[data-shape-key]').textContent = 'Blue dashes show the ' +
        (exampleMode ? 'example query' : 'tracked wrist') +
        '. Amber shows the study hand X/Y. Distance ' + score(metric.distance) + ' (unitless).';
    const p = r.path[i].map(v => fmt(v * 1000));
    q('[data-coordinates]').textContent = (i * 10) + ' ms · row ' + (r.k - 20 + i) +
        ' · hand relative to shoulder (mm) · X ' + p[0] + ' · Y ' + p[1] + ' · Z ' + p[2] + '.';
    q('[data-spikes]').textContent = label(r) + ', cue ' + r.cue + ' · ' +
        r.spikes.reduce((a, b) => a + b, 0) +
        ' recorded area 2 spikes across 37 contacts in the following 100 ms (rows ' + (r.k + 10) + '–' +
        (r.k + 19) + '). The electrode counts come from the macaque recordings. The wrist tracker estimates movement from pictures.';
  }
  function compare() {
    stop();
    result.hidden = true;
    side.disabled = exampleMode;
    q('[data-use-take]').hidden = !exampleMode;
    const take = getLatestTake();
    query = exampleMode ? {path: studyShape(cases[0])} : takeShape(take, side.value);
    if (query.issue) {
      status.textContent = query.issue;
      return;
    }
    ranking = rankReaches(query.path, cases);
    listed.replaceChildren();
    for (const {index, distance} of ranking.ranked)
      listed.add(new Option(
          'Block ' + cases[index].block + ' · W' + cases[index].workspace + ' · trial ' +
              cases[index].trial + ' · ' + score(distance),
          String(index)));
    const best = ranking.tied[0];
    const context = exampleMode ? 'Recorded example from ' + label(cases[0]) + '. ' :
                                  (side.value === 'leftArm' ? 'Left' : 'Right') + ' wrist · ' +
            query.samples + ' samples over ' + Math.round(query.span) + ' ms. ';
    status.textContent = context +
        (ranking.tied.length === 1 ?
             'Closest shape · ' + label(cases[best.index]) + '.' :
             'Closest shapes tied · ' + ranking.tied.map(x => label(cases[x.index])).join(' / ') + '.');
    sample.value = '0';
    result.hidden = false;
    draw();
  }
  async function open() {
    reset();
    const id = busy;
    panel.hidden = false;
    q('h2').focus();
    status.textContent = 'Opening the recordings…';
    const take = getLatestTake();
    side.value = take?.limb === 'leftArm' ? 'leftArm' : 'rightArm';
    side.disabled = q('[data-example]').disabled = true;
    q('[data-use-take]').hidden = true;
    try {
      dataPromise ??= fetch(new URL('./recordings.json', import.meta.url))
                          .then(async response => {
                            if (!response.ok) throw Error('Recording file missing');
                            return response.json();
                          })
                          .catch(error => {
                            dataPromise = undefined;
                            throw error;
                          });
      cases = await dataPromise;
      if (busy !== id) return;
      side.disabled = q('[data-example]').disabled = false;
      compare();
    } catch {
      if (busy === id)
        status.textContent =
            'The study recordings could not open. Check the game files and reopen this comparison.';
    }
  }
  side.addEventListener('change', compare, options);
  q('[data-example]').addEventListener('click', () => {
    exampleMode = true;
    compare();
  }, options);
  q('[data-use-take]').addEventListener('click', () => {
    exampleMode = false;
    compare();
  }, options);
  q('[data-return]').addEventListener('click', dismiss, options);
  listed.addEventListener('change', () => {
    stop();
    sample.value = '0';
    draw();
  }, options);
  sample.addEventListener('input', () => {
    stop();
    draw();
  }, options);
  orbit.addEventListener('input', draw, options);
  play.addEventListener('click', () => {
    if (animation) {
      stop();
      return;
    }
    if (+sample.value >= 29) {
      sample.value = '0';
      draw();
    }
    const start = performance.now() - Number(sample.value) * 80;
    play.textContent = 'Pause replay';
    function tick(now) {
      const next = Math.min(29, Math.max(0, Math.floor((now - start) / 80)));
      if (next !== Number(sample.value)) {
        sample.value = String(next);
        draw();
      }
      if (+sample.value === 29)
        stop();
      else
        animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
  }, options);
  return {
    open,
    reset,
    dispose() {
      reset();
      controller.abort();
    }
  };
}
