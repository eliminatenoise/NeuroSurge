/** NeuroSurge: what can start before the game's own scripts are in (19 November 2026: "Game should load a lot faster").
 * The game's scripts are about fifty files; the anatomy is six packs. This small script comes first on the page and
 * starts the packs' download and decoding (a worker, ns-pack-loader) at once, so the packs travel while the scripts
 * do, and takes over the loading bar that is on the page (ns-load-progress), so its number moves from the start. The launcher (eye-view-r558.mjs) takes the loader from here. Only the ordinary start: the two test cases of the
 * launcher (?case=...) read the source files themselves.
 *
 * 20 November 2026 (the owner, 19 November: "Currently, I can't see the models being built on the loading page, which
 * they should be there, and the controls switch off halfway through. And the controls should stay visible the entire
 * time while loading"). Measured before: on a slow line (600 kB/s) the controls card and the loading picture both
 * waited for the launcher's own scripts (the card came at 17.6 s, the picture's first part at about 29 s, the game was
 * ready at 30.6 s). Now this script also
 *   - shows the controls card at once (ns-controls-card, a small file with no imports); the launcher takes it over and
 *     lets it go only when the game is ready;
 *   - starts the loading picture (ns-assembly, a dynamic import, so the bar and the packs above are not held up by it)
 *     and feeds it the meshes of each pack the moment the pack arrives, placed by the table of parts made beforehand
 *     (ns-assembly-parts), without the manifests or the game's scripts. The launcher takes the SAME picture over
 *     (startAssembly shared: true), so there is one picture from the start of the load to the game. */
import { startPackLoader } from '../src/ns-pack-loader.mjs';
import { editionPacks } from './edition.mjs';
import { createLoadBar } from '../src/ns-load-progress.mjs';
import { showControlsCard } from '../src/ns-controls-card.mjs';

/** About how many script files the page has fetched when the launcher starts (55 on 19 November 2026; 56 since the
 * loading picture's table of parts, ns-assembly-parts.mjs, on 20 November; 57 with the raw look's ns-raw-look.mjs; 58 with
 * the face movements' ns-face-move.mjs; 60 with the muscles seen side by side, ns-muscle-seen.mjs, and the areas' halo,
 * ns-area-halo.mjs, both 21 November; the electrical map's modules are not counted: they are fetched at the first
 * press of M, 22 November; 61 with the calm walk and the focus ring's ns-look-calm.mjs, and 62 with the limbs' pace,
 * ns-limb-pace.mjs, both 22 November): the bar's
 * 'page' step is the share of them that has arrived, so it shows the scripts really coming in and stands still when
 * they stop. Only the bar depends on it; a wrong count makes that step end a little early or jump a little. */
const PAGE_SCRIPTS = 62;
const params = new URLSearchParams(window.location.search);
const mode = params.get('case') || 'boot';
const listeners = new Set();
let last = null;
const early = { loader: null, bar: null, startedAtMs: performance.now(), controlsCard: null, controlsCardAt: null, assembly: null, assemblyReady: Promise.resolve(null),
  /** onProgress(files, of): called now with the latest count, and on every later one. */
  listen(fn) { listeners.add(fn); if (last) { try { fn(last[0], last[1]); } catch { /* advisory */ } } } };
if (mode === 'boot') {
  // the page is loading from here (assembly.css: no HUD words, the preview line hidden), not only once the launcher runs
  try { const app = document.getElementById('ns-app'); if (app && !app.dataset.nsPhase) app.dataset.nsPhase = 'loading'; } catch { /* the launcher sets it too */ }
  // the main controls, from the start of the load until the game is ready (the launcher lets the card go)
  try { early.controlsCard = showControlsCard({ host: document.body }); early.controlsCardAt = performance.now(); } catch { early.controlsCard = null; }
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
    early.loader = startPackLoader({ ...editionPacks(params), onProgress: (files, of) => {
      last = [files, of];
      if (early.assembly) early.assembly.stillComing(); // (the picture's tiers keep waiting for their files)
      if (listeners.size === 0 && early.bar) { const f = files / Math.max(1, of || 611); early.bar.set('files', f); if (f >= 1) early.bar.done('files'); }
      for (const fn of listeners) { try { fn(files, of); } catch { /* advisory */ } }
    } });
  } catch { early.loader = null; }
  // the loading picture, fed from the packs as they arrive (a picture only: if it cannot start, the game loads as before)
  try {
    early.assemblyReady = import('../src/ns-assembly.mjs').then(m => {
      if (!m.LOADING_PICTURE) return null;
      const host = document.getElementById('ns-app');
      if (!host) return null;
      const a = m.startAssembly({ host, shared: true });
      a.feedFrom(early.loader);
      early.assembly = a;
      return a;
    }).catch(() => null);
  } catch { early.assemblyReady = Promise.resolve(null); }
}
window.__nsEarly = early;
