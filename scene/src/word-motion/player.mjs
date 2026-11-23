import { generateMotion } from './inference.mjs';
import { drawMovement, sceneBounds, translatedFrames } from './scene.mjs';

let modelRequest;
function readModel() {
  async function read(name, integrity) {
    const response = await fetch(new URL(name, import.meta.url), { integrity });
    if (!response.ok) throw new Error('Could not load ' + name);
    return response.json();
  }
  modelRequest ??= Promise.all([
    read('schema.json', 'sha256-OVPHqvLR9Ubcmu4FHHb0XZK9hQIZzklib1YiTP1m+B0='),
    read('weights.json', 'sha256-Ku7ZrMlWhIL0ZDWIAwz6dpsJDagPRgeETicP0LsCgkg=')
  ]).catch(error => { modelRequest = null; throw error; });
  return modelRequest;
}

export function bindWordMotion(panel, returnToGame) {
  const get = selector => panel.querySelector(selector);
  const doc = panel.ownerDocument;
  const view = doc.defaultView;
  const canvas = get('canvas');
  const title = get('h2');
  const status = get('[data-load]');
  const player = get('[data-player]');
  const back = get('[data-return]');
  const play = get('[data-play]');
  const timeline = get('#ns-word-time');
  const time = get('[data-time]');
  const angle = get('#ns-word-angle');
  const point = get('select');
  const details = get('details');
  const position = get('[data-position]');
  const state = { mode:'generated', frame:0, yaw:-31, pitch:10, selected:-1 };
  let version = 0;
  let scene;
  let animation = 0;

  function render() {
    if (!scene) return;
    state.selected = details.open ? point.selectedIndex : -1;
    drawMovement(canvas, scene, state);
    timeline.value = state.frame;
    time.value = (state.frame / scene.rateHz).toFixed(3) + ' s';
    timeline.setAttribute('aria-valuetext', time.value);
    if (details.open) {
      const xyz = scene.gen[state.frame][point.selectedIndex];
      position.textContent = xyz.map((v,i) => 'XYZ'[i] + ' ' + v.toFixed(1)).join(' / ') + ' mm';
    }
  }

  function stop() {
    view.cancelAnimationFrame(animation);
    animation = 0;
    play.textContent = scene && state.frame === scene.gen.length - 1 ? 'Replay' : 'Play';
  }

  function start() {
    if (!scene) return;
    const last = scene.gen.length - 1;
    if (state.frame === last) { state.frame = 0; render(); }
    const from = state.frame;
    const started = view.performance.now();
    function tick(now) {
      // The first display timestamp can precede the event that started playback.
      const elapsed = Math.max(0, now - started);
      const next = Math.min(last, from + Math.floor(elapsed * scene.rateHz / 1000));
      if (next !== state.frame) { state.frame = next; render(); }
      if (next === last) stop();
      else animation = view.requestAnimationFrame(tick);
    }
    play.textContent = 'Pause';
    animation = view.requestAnimationFrame(tick);
  }

  function reset() {
    version++;
    stop();
    scene = null;
    panel.hidden = player.hidden = true;
    details.open = false;
  }

  async function show(action) {
    reset();
    const current = version;
    title.textContent = 'Generated ' + action;
    status.textContent = 'Loading the local movement model…';
    panel.hidden = false;
    back.focus();
    try {
      const [schema, weights] = await readModel();
      if (current !== version) return;
      const clip = generateMotion(action, weights);
      const gen = translatedFrames(clip, schema);
      scene = { gen, bounds:sceneBounds(gen), edges:schema.edges, rateHz:clip.rateHz };
      state.frame = 0;
      state.yaw = -31;
      angle.value = state.yaw;
      timeline.max = gen.length - 1;
      point.replaceChildren(...schema.joints.map((name,i) =>
        new view.Option(name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), String(i))));
      point.selectedIndex = schema.joints.indexOf('rightWrist');
      status.textContent = 'Model output · The game is paused.';
      player.hidden = false;
      render();
      if (!doc.hidden && !view.matchMedia('(prefers-reduced-motion: reduce)').matches) start();
    } catch {
      if (current !== version) return;
      stop();
      scene = null;
      player.hidden = true;
      status.textContent = 'Could not open the verified model. Return to the game and try the command again.';
    }
  }

  const events = new AbortController();
  function on(target, type, listener) { target.addEventListener(type, listener, {signal:events.signal}); }
  on(back, 'click', returnToGame);
  on(play, 'click', () => { if (animation) stop(); else start(); });
  on(timeline, 'input', () => { state.frame = Number(timeline.value); stop(); render(); });
  on(angle, 'input', () => { state.yaw = Number(angle.value); render(); });
  on(details, 'toggle', render);
  on(point, 'change', render);
  on(doc, 'visibilitychange', () => { if (doc.hidden) stop(); });
  on(view, 'pagehide', stop);
  const observer = new ResizeObserver(render);
  observer.observe(canvas);
  return { show, reset, dispose() { reset(); events.abort(); observer.disconnect(); } };
}
