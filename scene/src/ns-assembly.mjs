/** NeuroSurge loading picture, page side, and the five-second picture of the main controls (user note of
 * 17 November 2026: no start page and no loading page; "have a visual of all the parts and components coming
 * together" while they load; "for the first 5 seconds ... an overlay of the main controls. WASD, ER, space, and
 * trackpad with click").
 *
 * startAssembly() puts a canvas over the game's canvas and gives it to a worker (ns-assembly-worker.mjs), which draws
 * the parts as their files arrive. The launcher calls noteManifest() / noteBytes() from its ordinary fetch functions:
 * the picture gets a COPY of the bytes the game fetched and never changes what the game receives. finish() fades the
 * picture out over the running game. Where a worker canvas is not available the same picture is drawn on the page
 * (it then pauses while the page is busy); where even that fails there is no picture and the game loads as before.
 *
 * A loading picture only: it verifies nothing and the game reads nothing from it.
 */

/** Files the game loads at the time of writing (arm and brain 134, body 294, face 54, head 10, more muscles 111, and
 * the shoulder girdle 8): only the length of the progress bar depends on it. */
export const ASSEMBLY_EXPECTED_FILES = 611;
export const CONTROLS_CARD_MS = 5000;

/** The kind of part for a manifest entry (pure): 'bone' | 'muscle' | 'eye' | 'brain' | 'strip' | null. */
export function assemblyKindOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const groups = Array.isArray(entry.groups) ? entry.groups.map(String) : [];
  if (groups.includes('brain_motor_landmark')) return 'strip';
  if (groups.includes('brain')) return 'brain';
  if (entry.tissue === 'eye') return 'eye';
  if (entry.kind === 'bone' || entry.tissue === 'bone' || groups.some(g => g.endsWith('_bone'))) return 'bone';
  if (entry.kind === 'muscle' || entry.tissue === 'muscle' || groups.some(g => g.endsWith('_muscle'))) return 'muscle';
  return null;
}

/** element id -> kind for a parsed manifest (pure): its `assets` records (every packet manifest of this game lists
 * its files there; other lists in a manifest name files that are NOT loaded). */
export function assemblyKindsOfManifest(manifest) {
  const out = new Map();
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.assets)) return out;
  for (const e of manifest.assets) { const k = assemblyKindOf(e); if (e && typeof e.element_id === 'string' && k) out.set(e.element_id, k); }
  return out;
}

/** The kind for a file URL when no manifest named it (pure): by packet folder. */
export function assemblyKindOfUrl(url) {
  const u = String(url);
  if (u.includes('bodyparts3d-head')) return 'bone';
  return 'muscle';
}

const idOfUrl = url => { const m = /([^/]+)\.obj(?:[?#].*)?$/i.exec(String(url)); return m ? m[1] : null; };

/**
 * Start the loading picture. host: the element that holds the game canvas; win / doc: the window and document.
 * room: { fovYDeg, pitchDeg } = the game's first view, so the room behind the parts is the one the game then shows.
 * Returns { noteManifest(url, text), noteBytes(url, bytes), finish(), state() }; every method is safe to call at any
 * time and never throws.
 */
export function startAssembly({ host, win = globalThis.window, doc = globalThis.document, workerUrl = new URL('./ns-assembly-worker.mjs', import.meta.url), room = null } = {}) {
  const kinds = new Map();
  const st = { mode: 'off', files: 0, error: null, finished: false, lastWorkerState: null, workerStates: [] };
  let canvas = null, worker = null, local = null, localQueue = [], raf = 0, lastBytesAt = 0;
  const size = () => ({ width: Math.max(1, win.innerWidth || 1), height: Math.max(1, win.innerHeight || 1), pixelRatio: Math.min(1.5, win.devicePixelRatio || 1) });
  const post = (m, transfer) => { if (worker) { try { worker.postMessage(m, transfer || []); } catch (err) { st.error = String(err && err.message || err); } } };
  const onResize = () => { const s = size(); if (worker) post({ type: 'resize', ...s }); else if (local) local.view.resize(s.width, s.height, s.pixelRatio); };

  async function startLocal() {
    // Same picture on the page itself (no worker canvas here): it pauses while the page is busy.
    try {
      const [THREE, core] = await Promise.all([import('../../vendor/three.module.js'), import('./ns-assembly-core.mjs')]);
      if (st.finished || !canvas) return;
      const s = size();
      local = { view: core.createAssemblyView({ THREE, canvas, ...s, room }), parse: core.parseObjBytes };
      st.mode = 'page';
      const tick = now => {
        if (!local) return;
        const t0 = win.performance.now();
        while (localQueue.length && win.performance.now() - t0 < 4) { const q = localQueue.shift(); try { local.view.add(q.kind, local.parse(q.bytes)); } catch { /* left out */ } }
        local.view.setProgress(st.files / ASSEMBLY_EXPECTED_FILES, st.files > 0.9 * ASSEMBLY_EXPECTED_FILES && now - lastBytesAt > 900);
        try { local.view.frame(now); } catch (err) { st.error = String(err && err.message || err); local = null; return; }
        raf = win.requestAnimationFrame(tick);
      };
      raf = win.requestAnimationFrame(tick);
    } catch (err) { st.error = String(err && err.message || err); st.mode = 'off'; }
  }

  try {
    canvas = doc.createElement('canvas');
    canvas.className = 'ns-assembly';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const s = size();
    if (typeof canvas.transferControlToOffscreen === 'function' && typeof win.Worker === 'function') {
      try {
        const off = canvas.transferControlToOffscreen();
        worker = new win.Worker(workerUrl, { type: 'module' });
        st.mode = 'worker';
        worker.onmessage = ev => { const m = ev.data || {}; if (m.type === 'error') st.error = m.message; else if (m.type === 'state') { st.lastWorkerState = m; st.workerStates.push([m.at, m.frames, m.parts]); } };
        worker.onerror = ev => { st.error = String(ev && ev.message || 'worker error'); };
        post({ type: 'init', canvas: off, ...s, room }, [off]);
      } catch (err) {
        // The canvas may already belong to the worker attempt: use a fresh one for the page picture.
        st.error = String(err && err.message || err); worker = null;
        try { canvas.remove(); } catch { /* gone */ }
        canvas = doc.createElement('canvas'); canvas.className = 'ns-assembly'; canvas.setAttribute('aria-hidden', 'true'); host.appendChild(canvas);
        startLocal();
      }
    } else startLocal();
    win.addEventListener('resize', onResize);
  } catch (err) { st.error = String(err && err.message || err); st.mode = 'off'; }

  return {
    noteManifest(url, text) {
      try { for (const [id, k] of assemblyKindsOfManifest(JSON.parse(text))) kinds.set(id, k); } catch { /* not a manifest this picture knows */ }
    },
    noteBytes(url, bytes) {
      try {
        if (st.finished || st.mode === 'off' || !bytes || !/\.obj(?:[?#].*)?$/i.test(String(url))) return;
        const id = idOfUrl(url), kind = (id && kinds.get(id)) || assemblyKindOfUrl(url);
        st.files++;
        lastBytesAt = win.performance.now();
        const copy = bytes.slice(); // the game keeps its own bytes untouched
        if (worker) {
          post({ type: 'obj', kind, bytes: copy.buffer }, [copy.buffer]);
          post({ type: 'progress', fraction: st.files / ASSEMBLY_EXPECTED_FILES });
        } else localQueue.push({ kind, bytes: copy });
      } catch (err) { st.error = String(err && err.message || err); }
    },
    /** Fade the picture out over the game and release it. */
    finish() {
      if (st.finished) return;
      st.finished = true;
      try { win.removeEventListener('resize', onResize); } catch { /* not bound */ }
      const end = () => {
        if (worker) { post({ type: 'stop' }); const w = worker; worker = null; win.setTimeout(() => { try { w.terminate(); } catch { /* gone */ } }, 200); }
        if (local) { try { win.cancelAnimationFrame(raf); local.view.dispose(); } catch { /* gone */ } local = null; }
        localQueue = [];
        if (canvas) { try { canvas.remove(); } catch { /* gone */ } canvas = null; }
      };
      if (canvas && canvas.classList) { canvas.classList.add('ns-assembly-out'); win.setTimeout(end, 900); } else end();
    },
    state: () => ({ ...st, kinds: kinds.size })
  };
}

/** The main controls, drawn for the first CONTROLS_CARD_MS of the page (it fades by itself: a CSS animation, so it
 * goes on time even while the page is busy loading). Esc still shows the full instructions. Returns the element. */
export function showControlsCard({ host, doc = globalThis.document, ms = CONTROLS_CARD_MS } = {}) {
  try {
    const el = (tag, cls, parent, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; };
    const card = el('div', 'ns-keys', host);
    card.setAttribute('role', 'note');
    card.setAttribute('aria-label', 'Main controls: W A S D move, E view, R information, Space grab, trackpad look, click press, drag turn');
    card.style.setProperty('--ns-keys-ms', `${ms}ms`);
    // Left: the keys. Right: the trackpad. They stand either side of the picture's middle, where the body is.
    const left = el('div', 'ns-keys-panel', card);
    const keyboard = el('div', 'ns-keys-board', left);
    const wasd = el('div', 'ns-keys-wasd', keyboard);
    const row1 = el('div', 'ns-keys-row', wasd);
    el('kbd', 'ns-key', row1, 'W');
    el('kbd', 'ns-key ns-key-alt', row1, 'E');
    el('kbd', 'ns-key ns-key-alt', row1, 'R');
    const row2 = el('div', 'ns-keys-row ns-keys-row2', wasd);
    for (const k of ['A', 'S', 'D']) el('kbd', 'ns-key', row2, k);
    el('kbd', 'ns-key ns-key-space', keyboard, 'Space');
    const words = el('dl', 'ns-keys-words', left);
    for (const [k, w] of [['W A S D', 'move'], ['Space', 'grab'], ['E', 'view'], ['R', 'info']]) { el('dt', '', words, k); el('dd', '', words, w); }
    const right = el('div', 'ns-keys-panel', card);
    const plate = el('div', 'ns-pad-plate', right);
    el('span', 'ns-pad-finger', plate);
    el('span', 'ns-pad-click', plate);
    const padWords = el('dl', 'ns-keys-words', right);
    for (const [k, w] of [['Move', 'look'], ['Click', 'press'], ['Drag', 'turn']]) { el('dt', '', padWords, k); el('dd', '', padWords, w); }
    card.addEventListener('animationend', ev => { if (ev.animationName === 'ns-keys-out') { try { card.remove(); } catch { /* gone */ } } });
    return card;
  } catch { return null; }
}
