/** NeuroSurge: what can start before the game's own scripts are in (19 November 2026: "Game should load a lot faster").
 * The game's scripts are about fifty files; the anatomy is six packs. This small script comes first on the page and
 * starts the packs' download and decoding (a worker, ns-pack-loader) at once, so the packs travel while the scripts
 * do, and takes over the loading bar that is on the page (ns-load-progress), so its number moves from the start. The launcher (eye-view-r558.mjs) takes the loader from here. Only the ordinary start: the two test cases of the
 * launcher (?case=...) read the source files themselves. */
import { startPackLoader } from '../src/ns-pack-loader.mjs';
import { createLoadBar } from '../src/ns-load-progress.mjs';

/** About how many script files the page has fetched when the launcher starts (55 on 19 November 2026): the bar's
 * 'page' step is the share of them that has arrived, so it shows the scripts really coming in and stands still when
 * they stop. Only the bar depends on it; a wrong count makes that step end a little early or jump a little. */
const PAGE_SCRIPTS = 55;
const mode = new URLSearchParams(window.location.search).get('case') || 'boot';
const listeners = new Set();
let last = null;
const early = { loader: null, bar: null, startedAtMs: performance.now(),
  /** onProgress(files, of): called now with the latest count, and on every later one. */
  listen(fn) { listeners.add(fn); if (last) { try { fn(last[0], last[1]); } catch { /* advisory */ } } } };
if (mode === 'boot') {
  // the loading bar starts counting here too: the packs' bytes move it while the game's scripts are still coming
  try { let storage = null; try { storage = window.localStorage; } catch { storage = null; } early.bar = createLoadBar({ host: document.body, storage, early: true }); } catch { early.bar = null; }
  // the game's scripts as they arrive (the browser's resource timing): the real progress of the 'page' step
  try {
    if (early.bar && typeof PerformanceObserver === 'function') {
      let scripts = 0;
      const seen = new PerformanceObserver(list => {
        for (const e of list.getEntries()) if (/\.m?js(?:[?#]|$)/.test(e.name)) scripts++;
        early.bar.set('page', Math.min(0.95, scripts / PAGE_SCRIPTS));
        if (window.__nsEarly && window.__nsEarly.launched) seen.disconnect();
      });
      seen.observe({ type: 'resource', buffered: true });
    }
  } catch { /* the step then ends in one piece when the launcher starts */ }
  // the guard (ns-load-guard, the page's first script) watches the bar's own record of the last real news
  try { if (early.bar && window.__nsGuard) window.__nsGuard.attach({ bar: early.bar, lastAdvance: () => early.bar.model.lastAdvance() }); } catch { /* the guard keeps its own clock */ }
  try {
    early.loader = startPackLoader({ onProgress: (files, of) => {
      last = [files, of];
      if (listeners.size === 0 && early.bar) { const f = files / Math.max(1, of || 611); early.bar.set('files', f); if (f >= 1) early.bar.done('files'); }
      for (const fn of listeners) { try { fn(files, of); } catch { /* advisory */ } }
    } });
  } catch { early.loader = null; }
}
window.__nsEarly = early;
