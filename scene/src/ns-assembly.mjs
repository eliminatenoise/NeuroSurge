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
 * With reduced motion the loading layer shows a stationary download progress bar instead of drawing the parts.
 *
 * A loading picture only: it verifies nothing and the game reads nothing from it.
 *
 * 18 November 2026 (owner: "for the loading animation, if possible, we want to go inside out always"): each file's
 * place in the inside-out order (ns-assembly-order assemblyDepth: its track, tier and place in the tier) is read here
 * from the manifests the game fetches, with the game's own layer of each muscle (ns-body bodyMuscleLayer), and sent
 * with the bytes; the worker holds each part back until its tier comes up.
 */
import { assemblyDepth, ASSEMBLY_TIERS } from './ns-assembly-order.mjs';
import { bodyMuscleLayer } from './ns-body.mjs';

/** Files the game loads before it is ready (arm and brain 142, body 294, face 54, head 10, more muscles 111): only the
 * length of the progress bar depends on it. The cerebral arteries (80) are drawn but not counted: the game goes on
 * loading them, one at a time, after it is ready. */
export const ASSEMBLY_EXPECTED_FILES = 611;
export const CONTROLS_CARD_MS = 5000;
/** The browser-storage key of the last load's time (ms from the page's start to the game being ready). */
export const ASSEMBLY_LOAD_KEY = 'neurosurge.loading.readyMs';

/** The kind of part for a manifest entry (pure): 'bone' | 'muscle' | 'eye' | 'brain' | 'strip' | 'vessel' | null.
 * 18 November 2026: a vessel first (the cerebral arteries' manifest marks its entries kind 'bone', tissue 'artery'; the
 * picture drew them as bones in the body's head). */
export function assemblyKindOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const groups = Array.isArray(entry.groups) ? entry.groups.map(String) : [];
  if (entry.tissue === 'artery' || entry.tissue === 'vein' || groups.some(g => /artery|vein|vessel/.test(g))) return 'vessel';
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
  if (u.includes('cerebral-arteries')) return 'vessel';
  return 'muscle';
}

/** A manifest entry as the picture needs it (pure): { id, kind, name, groups, layer, track, tier, frac } (ns-assembly-order
 * assemblyDepth) or null. muscleLayer(id): the game's layer of a muscle ('deep' | 'intermediate' | 'outer' |
 * 'unclassified'). The atlas name is the file's embedded source name (or the packet's own name); the centre is the
 * middle of its bounds. Without bounds, tier and frac are null and the worker places the part by its own vertices. */
export function assemblyPartOf(entry, muscleLayer = () => 'unclassified') {
  const kind = assemblyKindOf(entry);
  if (!kind) return null;
  const lo = entry.bounds_min, hi = entry.bounds_max;
  const centre = Array.isArray(lo) && Array.isArray(hi) && lo.length === 3 && hi.length === 3 && [...lo, ...hi].every(v => Number.isFinite(Number(v))) ? lo.map((v, i) => (Number(v) + Number(hi[i])) / 2) : null;
  let layer = 'unclassified';
  if (kind === 'muscle') { try { layer = String(muscleLayer(entry.element_id) || 'unclassified'); } catch { layer = 'unclassified'; } }
  const name = String(entry.embedded_source_name || entry.name || entry.requested_structure || '');
  const groups = Array.isArray(entry.groups) ? entry.groups.map(String) : [];
  const d = centre ? assemblyDepth({ kind, name, groups, centre, layer }) : null;
  return { id: String(entry.element_id || ''), kind, name, groups, layer, track: d ? d.track : null, tier: d ? d.tier : null, frac: d ? d.frac : null };
}

/** element id -> { kind, track, tier, frac } for a parsed manifest's `assets` (pure; see assemblyPartOf). */
export function assemblyPartsOfManifest(manifest, muscleLayer) {
  const out = new Map();
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.assets)) return out;
  for (const e of manifest.assets) { const p = e && typeof e.element_id === 'string' ? assemblyPartOf(e, muscleLayer) : null; if (p) out.set(e.element_id, p); }
  return out;
}

const idOfUrl = url => { const m = /([^/]+)\.obj(?:[?#].*)?$/i.exec(String(url)); return m ? m[1] : null; };

/**
 * Start the loading picture. host: the element that holds the game canvas; win / doc: the window and document.
 * room: { fovYDeg, pitchDeg } = the game's first view, so the room behind the parts is the one the game then shows.
 * Returns { noteManifest(url, text), noteBytes(url, bytes), noteText(url, text), finish(), state() }; every method is
 * safe to call at any time and never throws.
 */
export function startAssembly({ host, win = globalThis.window, doc = globalThis.document, workerUrl = new URL('./ns-assembly-worker.mjs', import.meta.url), room = null } = {}) {
  const kinds = new Map();
  // 18 November 2026: under prefers-reduced-motion the parts appear in place (no flying in, no turning, no beat).
  let reducedMotion = false;
  try { reducedMotion = Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { reducedMotion = false; }
  // 18 November 2026: the last load's time on this computer (this browser's storage; a convenience, never needed), so
  // the picture can pace its layers to keep building through the whole load (ns-assembly-order expect()).
  let lastLoadMs = null;
  try { const v = Number(win.localStorage && win.localStorage.getItem(ASSEMBLY_LOAD_KEY)); lastLoadMs = Number.isFinite(v) && v > 1000 && v < 600000 ? v : null; } catch { lastLoadMs = null; }
  const startedAtMs = (() => { try { return win.performance.now(); } catch { return 0; } })();
  const expectReadyS = lastLoadMs === null ? null : (lastLoadMs - startedAtMs) / 1000;
  const st = { mode: 'off', files: 0, error: null, finished: false, lastWorkerState: null, workerStates: [], reducedMotion, lastLoadMs };
  let canvas = null, worker = null, local = null, localQueue = [], raf = 0, lastBytesAt = 0;
  let staticOverlay = null, staticProgress = null;
  const size = () => ({ width: Math.max(1, win.innerWidth || 1), height: Math.max(1, win.innerHeight || 1), pixelRatio: Math.min(1.5, win.devicePixelRatio || 1) });
  const post = (m, transfer) => { if (worker) { try { worker.postMessage(m, transfer || []); } catch (err) { st.error = String(err && err.message || err); } } };
  const onResize = () => { const s = size(); if (worker) post({ type: 'resize', ...s }); else if (local) local.view.resize(s.width, s.height, s.pixelRatio); };

  async function startLocal() {
    // Same picture on the page itself (no worker canvas here): it pauses while the page is busy.
    try {
      const [THREE, core] = await Promise.all([import('../../vendor/three.module.js'), import('./ns-assembly-core.mjs')]);
      if (st.finished || !canvas) return;
      const s = size();
      local = { view: core.createAssemblyView({ THREE, canvas, ...s, room, reducedMotion, expectReadyS: expectReadyS === null ? null : expectReadyS - (win.performance.now() - startedAtMs) / 1000 }), parse: core.parseObjBytes };
      while (knownQueue.length) local.view.know(knownQueue.shift());
      st.mode = 'page';
      const tick = now => {
        if (!local) return;
        const t0 = win.performance.now();
        while (localQueue.length && win.performance.now() - t0 < 4) { const q = localQueue.shift(); try { local.view.add(q.kind, q.mesh || local.parse(q.bytes), q.place); } catch { /* left out */ } }
        local.view.setProgress(st.files / ASSEMBLY_EXPECTED_FILES, st.files > 0.9 * ASSEMBLY_EXPECTED_FILES && now - lastBytesAt > 900);
        try { local.view.frame(now); } catch (err) { st.error = String(err && err.message || err); local = null; return; }
        raf = win.requestAnimationFrame(tick);
      };
      raf = win.requestAnimationFrame(tick);
    } catch (err) { st.error = String(err && err.message || err); st.mode = 'off'; }
  }

  try {
    if (reducedMotion) {
      staticOverlay = doc.createElement('div');
      staticOverlay.className = 'ns-assembly ns-assembly-static';
      const label = doc.createElement('p');
      label.textContent = 'Loading anatomy';
      staticProgress = doc.createElement('progress');
      staticProgress.setAttribute('aria-label', 'Anatomy files downloaded');
      staticProgress.max = ASSEMBLY_EXPECTED_FILES;
      staticProgress.value = 0;
      staticOverlay.append(label, staticProgress);
      host.appendChild(staticOverlay);
      st.mode = 'static';
    } else {
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
          worker.onmessage = ev => { const m = ev.data || {}; if (m.type === 'error') st.error = m.message; else if (m.type === 'state') { st.lastWorkerState = m; st.workerStates.push([m.at, m.frames, m.parts]); } else if (m.type === 'starts') st.starts = m.starts; };
          worker.onerror = ev => { st.error = String(ev && ev.message || 'worker error'); };
          post({ type: 'init', canvas: off, ...s, room, reducedMotion, expectReadyS }, [off]);
        } catch (err) {
          // The canvas may already belong to the worker attempt: use a fresh one for the page picture.
          st.error = String(err && err.message || err); worker = null;
          try { canvas.remove(); } catch { /* gone */ }
          canvas = doc.createElement('canvas'); canvas.className = 'ns-assembly'; canvas.setAttribute('aria-hidden', 'true'); host.appendChild(canvas);
          startLocal();
        }
      } else startLocal();
      win.addEventListener('resize', onResize);
    }
  } catch (err) { st.error = String(err && err.message || err); st.mode = 'off'; }

  const knownQueue = []; // per-tier counts of manifests that came before the picture could take them
  const noteManifest = (url, text) => {
    if (reducedMotion) return; // the stationary progress bar draws no parts
    try {
      const counts = { body: ASSEMBLY_TIERS.body.map(() => 0), brain: ASSEMBLY_TIERS.brain.map(() => 0) };
      let any = false;
      for (const [id, p] of assemblyPartsOfManifest(JSON.parse(text), bodyMuscleLayer)) { if (kinds.has(id)) continue; kinds.set(id, p); if (p.track) { counts[p.track][p.tier]++; any = true; } }
      if (!any) return;
      if (worker) post({ type: 'known', counts }); else if (local) local.view.know(counts); else knownQueue.push(counts);
    } catch { /* not a manifest this picture knows */ }
  };
  return {
    noteManifest,
    noteBytes(url, bytes) {
      try {
        // 18 November 2026: the missing-muscles, head and face packets' manifests come as bytes (the game hashes them
        // as bytes), so they were never read here and their parts had no layer; read them as text too.
        if (!st.finished && st.mode !== 'off' && bytes && /MANIFEST\.json(?:[?#].*)?$/i.test(String(url))) { noteManifest(url, new TextDecoder().decode(bytes)); return; }
        if (st.finished || st.mode === 'off' || !bytes || !/\.obj(?:[?#].*)?$/i.test(String(url))) return;
        if (st.mode === 'static') {
          st.files++;
          staticProgress.value = Math.min(st.files, ASSEMBLY_EXPECTED_FILES);
          return;
        }
        const id = idOfUrl(url), known = id ? kinds.get(id) : null, kind = known ? known.kind : assemblyKindOfUrl(url);
        // Its place in the inside-out order (track, tier, place in the tier); without one the worker places it by its
        // own vertices.
        const place = known ? { id, track: known.track, tier: known.tier, frac: known.frac, name: known.name, groups: known.groups, layer: known.layer } : null;
        if (kind !== 'vessel') st.files++; // the bar counts what the game waits for (ASSEMBLY_EXPECTED_FILES)
        lastBytesAt = win.performance.now();
        const copy = bytes.slice(); // the game keeps its own bytes untouched
        if (worker) {
          post({ type: 'obj', kind, place, bytes: copy.buffer }, [copy.buffer]);
          post({ type: 'progress', fraction: st.files / ASSEMBLY_EXPECTED_FILES });
        } else localQueue.push({ kind, place, bytes: copy });
      } catch (err) { st.error = String(err && err.message || err); }
    },
    /** 19 November 2026 (mesh packs, ns-pack): a mesh the game took from a verified pack: drawn like a fetched file
     * (the picture gets a copy of its positions and triangles; nothing changes for the game). */
    noteMesh(url, mesh) {
      try {
        if (st.finished || st.mode === 'off' || !mesh || !mesh.positions || !mesh.indices) return;
        if (st.mode === 'static') { st.files++; staticProgress.value = Math.min(st.files, ASSEMBLY_EXPECTED_FILES); return; }
        const id = idOfUrl(url), known = id ? kinds.get(id) : null, kind = known ? known.kind : assemblyKindOfUrl(url);
        const place = known ? { id, track: known.track, tier: known.tier, frac: known.frac, name: known.name, groups: known.groups, layer: known.layer } : null;
        if (kind !== 'vessel') st.files++;
        lastBytesAt = win.performance.now();
        const positions = mesh.positions.slice(), indices = mesh.indices.slice();
        if (worker) {
          post({ type: 'mesh', kind, place, positions: positions.buffer, indices: indices.buffer }, [positions.buffer, indices.buffer]);
          post({ type: 'progress', fraction: st.files / ASSEMBLY_EXPECTED_FILES });
        } else localQueue.push({ kind, place, mesh: { positions, indices } });
      } catch (err) { st.error = String(err && err.message || err); }
    },
    /** A mesh file the game read as text (the cerebral arteries): drawn like the others (a copy; nothing changes for
     * the game). */
    noteText(url, text) {
      try { if (typeof text === 'string' && !st.finished && st.mode !== 'off') this.noteBytes(url, new TextEncoder().encode(text)); } catch (err) { st.error = String(err && err.message || err); }
    },
    /** Fade the picture out over the game and release it; remove it at once when loading fails or stops (immediate).
     * The parts still held back come in quickly, in order, while the picture fades, so the hand-over shows the whole
     * body and brain. */
    finish({ immediate = false } = {}) {
      if (st.finished) return;
      st.finished = true;
      if (reducedMotion) {
        try { staticOverlay?.remove(); } catch { /* gone */ }
        staticOverlay = staticProgress = null;
        return;
      }
      try { if (!immediate && st.files > 0 && win.localStorage) win.localStorage.setItem(ASSEMBLY_LOAD_KEY, String(Math.round(win.performance.now()))); } catch { /* no storage here */ }
      if (!immediate) { if (worker) post({ type: 'hurry' }); else if (local) { try { local.view.hurry(); } catch { /* gone */ } } }
      try { win.removeEventListener('resize', onResize); } catch { /* not bound */ }
      const end = () => {
        if (worker) { post({ type: 'stop' }); const w = worker; worker = null; win.setTimeout(() => { try { w.terminate(); } catch { /* gone */ } }, 200); }
        if (local) { try { win.cancelAnimationFrame(raf); local.view.dispose(); } catch { /* gone */ } local = null; }
        localQueue = [];
        if (canvas) { try { canvas.remove(); } catch { /* gone */ } canvas = null; }
      };
      if (!immediate && canvas && canvas.classList) { canvas.classList.add('ns-assembly-out'); win.setTimeout(end, 900); } else end();
    },
    state: () => ({ ...st, kinds: kinds.size, placed: [...kinds.values()].filter(p => p.tier !== null).length })
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
