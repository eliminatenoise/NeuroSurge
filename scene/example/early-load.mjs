/** NeuroSurge: what can start before the game's own scripts are in (19 November 2026: "Game should load a lot faster").
 * The game's scripts are about fifty files; the anatomy is six packs. This small script comes first on the page and
 * starts the packs' download and decoding (a worker, ns-pack-loader) at once, so the packs travel while the scripts
 * do. The launcher (eye-view-r558.mjs) takes the loader from here. Only the ordinary start: the two test cases of the
 * launcher (?case=...) read the source files themselves. */
import { startPackLoader } from '../src/ns-pack-loader.mjs';

const mode = new URLSearchParams(window.location.search).get('case') || 'boot';
const listeners = new Set();
let last = null;
const early = { loader: null, startedAtMs: performance.now(),
  /** onProgress(files, of): called now with the latest count, and on every later one. */
  listen(fn) { listeners.add(fn); if (last) { try { fn(last[0], last[1]); } catch { /* advisory */ } } } };
if (mode === 'boot') {
  try { early.loader = startPackLoader({ onProgress: (files, of) => { last = [files, of]; for (const fn of listeners) { try { fn(files, of); } catch { /* advisory */ } } } }); }
  catch { early.loader = null; }
}
window.__nsEarly = early;
