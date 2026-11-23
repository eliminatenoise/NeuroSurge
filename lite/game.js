(() => {
  'use strict';

  const sides = ['left', 'right'];
  const limbs = [
    ['ankle', 'Ankle', [['Lift toes', 1], ['Point toes', -1]]],
    ['knee', 'Knee', [['Bend knee', 1], ['Straighten knee', 0]]],
    ['hip', 'Hip', [['Lift thigh', 1], ['Lower thigh', 0]]],
    ['shoulder', 'Shoulder', [['Raise arm', 1], ['Lower arm', 0]]],
    ['elbow', 'Elbow', [['Bend elbow', 1], ['Straighten elbow', 0]]],
    ['forearm', 'Forearm', [['Turn palm down', 1], ['Turn palm up', -1]]],
    ['wrist', 'Wrist', [['Bend wrist', 1], ['Extend wrist', -1]]],
    ['hand', 'Hand', [['Close hand', 1], ['Open hand', 0]]],
  ];
  const shared = [
    ['trunk', 'Trunk', [['Bend forward', 1], ['Stand upright', 0]]],
    ['head', 'Head', [['Look left', 1], ['Look right', -1]]],
    ['jaw', 'Jaw', [['Open jaw', 1], ['Close jaw', 0]]],
  ];
  const regions = new Map([
    ...sides.flatMap(side => limbs.map(([joint, short, moves]) =>
      [side + '-' + joint, { side, joint, short, name: side[0].toUpperCase() + side.slice(1) + ' ' + short.toLowerCase(), moves }])),
    ...shared.map(([joint, name, moves]) => [joint, { side: null, joint, short: name, name, moves }]),
  ]);

  const element = id => document.getElementById(id);
  const figures = [['player', false], ['mirror', true]];
  const status = element('movement-status');
  const buttons = new Map();
  const gentle = window.matchMedia('(prefers-reduced-motion: reduce)');
  const initialView = { yaw: -.22, pitch: .035 };
  let yaw = initialView.yaw;
  let pitch = initialView.pitch;
  let selected = 'left-elbow';
  let pending = 0;
  const motions = new Map();
  const pose = {
    left: Object.fromEntries(limbs.map(([joint]) => [joint, 0])),
    right: Object.fromEntries(limbs.map(([joint]) => [joint, 0])),
    ...Object.fromEntries(shared.map(([joint]) => [joint, 0])),
  };

  function queueRender() {
    if (!pending) pending = requestAnimationFrame(render);
  }

  function sampleMotions(now) {
    for (const [id, motion] of motions) {
      const fraction = gentle.matches ? 1 : Math.max(0, Math.min(1, (now - motion.start) / 230));
      const eased = fraction * fraction * (3 - 2 * fraction);
      motion.target[motion.joint] = motion.from + (motion.to - motion.from) * eased;
      if (fraction === 1) motions.delete(id);
    }
  }

  function drawTo(renderers) {
    for (const [canvas, renderer] of renderers) {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round(box.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      renderer.render({ pose, yaw, pitch, active: selected });
    }
  }

  function render(now) {
    pending = 0;
    sampleMotions(now);
    drawTo(renderers);
    if (motions.size) queueRender();
  }

  function moveToward(id, value) {
    const area = regions.get(id);
    const target = area.side ? pose[area.side] : pose;
    const current = target[area.joint];
    if (current === value) motions.delete(id);
    else motions.set(id, { target, joint: area.joint, from: current, to: value, start: performance.now() });
  }

  function applyMove(index) {
    const area = regions.get(selected);
    const [name, value] = area.moves[index];
    sampleMotions(performance.now());
    moveToward(selected, value);
    status.textContent = area.name + ' moves on both bodies. ' + name + '.';
    queueRender();
  }

  function select(id, focus = false) {
    if (!regions.has(id)) return;
    selected = id;
    for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === id));
    const area = regions.get(id);
    element('active-label').textContent = area.name;
    area.moves.forEach(([name], index) => {
      const button = element('action-' + (index + 1));
      button.textContent = (index + 1) + '  ' + name;
      button.setAttribute('aria-label', name);
    });
    if (focus) buttons.get(id).focus();
    queueRender();
  }

  function addArea(id, area) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'area';
    button.dataset.area = id;
    button.dataset.joint = area.joint;
    button.textContent = area.short;
    button.setAttribute('aria-label', area.name);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      select(id);
      applyMove(0);
    });
    buttons.set(id, button);
    element((area.side || 'shared') + '-areas').append(button);
  }

  function changeView(horizontal, vertical = 0) {
    const fullTurn = Math.PI * 2;
    yaw = ((((yaw + horizontal + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
    pitch = Math.max(-.55, Math.min(.55, pitch + vertical));
    queueRender();
  }

  function connectPointer(canvas, renderer) {
    let pointer = null;
    canvas.addEventListener('pointerdown', event => {
      if (pointer || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.travel += Math.hypot(dx, dy);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (pointer.travel > 3) changeView(dx * .009, dy * .008);
    });
    function finish(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const pressed = pointer;
      pointer = null;
      canvas.classList.remove('dragging');
      if (event.type !== 'pointerup' || pressed.travel > 3 || typeof renderer.pick !== 'function') return;
      const box = canvas.getBoundingClientRect();
      const part = renderer.pick(event.clientX - box.left, event.clientY - box.top);
      if (regions.has(part)) {
        select(part);
        applyMove(0);
      }
    }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, finish);
  }

  if (location.protocol === 'file:') element('offline-download').hidden = true;
  if (!globalThis.NeuroSurgeLiteBody || figures.some(([id]) => !element(id).getContext('2d'))) {
    status.textContent = 'The body view could not open. Keep the game files together and reload the page.';
    for (const button of document.querySelectorAll('button')) button.disabled = true;
    return;
  }
  const renderers = figures.map(([key, mirror]) => {
    const canvas = element(key);
    return [canvas, globalThis.NeuroSurgeLiteBody.create(canvas, { mirror })];
  });

  for (const [id, area] of regions) addArea(id, area);
  for (const index of [0, 1]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'action-' + (index + 1);
    button.addEventListener('click', () => applyMove(index));
    element('actions').append(button);
  }
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.key === '1' || event.key === '2') {
      event.preventDefault();
      applyMove(Number(event.key) - 1);
      return;
    }
    const key = event.target.closest?.('[data-area]')?.dataset.area;
    if (!key || !event.key.startsWith('Arrow')) return;
    const area = regions.get(key);
    const index = limbs.findIndex(([joint]) => joint === area.joint);
    const direction = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (area.side && direction) {
      const joint = limbs[(index + direction + limbs.length) % limbs.length][0];
      select(area.side + '-' + joint, true);
    } else if (area.side) {
      const side = event.key === 'ArrowLeft' ? 'left' : 'right';
      select(side + '-' + area.joint, true);
    } else {
      const i = shared.findIndex(([joint]) => joint === area.joint);
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      select(shared[(i + step + shared.length) % shared.length][0], true);
    }
    event.preventDefault();
  });
  element('turn-left').onclick = () => changeView(-.35);
  element('turn-right').onclick = () => changeView(.35);
  element('front-view').onclick = () => {
    yaw = initialView.yaw;
    pitch = initialView.pitch;
    queueRender();
  };
  element('neutral').onclick = () => {
    sampleMotions(performance.now());
    for (const id of regions.keys()) moveToward(id, 0);
    status.textContent = 'Both bodies return to the neutral pose.';
    queueRender();
  };
  for (const [canvas, renderer] of renderers) connectPointer(canvas, renderer);
  if ('ResizeObserver' in globalThis) {
    const changes = new ResizeObserver(queueRender);
    for (const [canvas] of renderers) changes.observe(canvas);
  }
  window.addEventListener('resize', queueRender);
  gentle.addEventListener('change', queueRender);
  select(selected);
})();
