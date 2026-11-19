/** NeuroSurge load guard (19 November 2026; the owner: "The game is currently broken as it just stays on the loading
 * page forever").
 *
 * The page's FIRST script, and it imports nothing: whatever else fails to arrive, this one file is enough to say so.
 * It watches the whole load and puts a plain panel on the page, with a "Try again" button, when
 *   - a script of the game cannot be had (the error event of a <script data-ns-needed> element: one missing file among
 *     the launcher's fifty leaves the launcher never run, so nothing inside the launcher can report it);
 *   - a script throws before the launcher has taken over (for example an address the launcher refuses);
 *   - nothing has advanced for LOAD_STALL_MS: no file has arrived, no byte of a pack, no step of the build
 *     (a request that never answers, a worker that never speaks, a promise nobody settles). The panel goes away by
 *     itself if loading then moves again. Long before that, after LOAD_QUIET_MS, the bar's word becomes "Waiting";
 *   - the launcher reports that loading failed (fail()).
 * The launcher and the page's second small script (early-load.mjs) hand it the loading bar and the bar's own record
 * of the last real news (attach()); until then every file the browser finishes counts as news (resource timing).
 *
 * installLoadGuard() is safe to call again: it returns the guard already on the page (window.__nsGuard).
 * createLoadWatch and showLoadFailure are plain parts, testable in Node.
 */

export const LOAD_STALL_MS = 20000;
/** After this long without news the bar's word says so ("Waiting"), long before the panel: a bar that stands still
 * with "Loading" or "Building" over it reads as stuck. */
export const LOAD_QUIET_MS = 5000;
export const LOAD_WORDS = Object.freeze({
  label: 'Loading',
  waiting: 'Waiting',
  failed: 'Loading did not finish.',
  stalled: 'Loading has stopped.',
  hint: 'Check your connection, then try again.',
  again: 'Try again'
});

/**
 * The failure panel: plain words, the reason in small print, and a "Try again" button that loads the page again.
 * kind: 'failed' | 'stalled'. Returns { remove() }. A stalled panel is removed by the caller if loading moves again.
 */
export function showLoadFailure({ host, kind = 'failed', detail = '', win = globalThis.window, doc = globalThis.document, words = LOAD_WORDS, onAgain = null } = {}) {
  try {
    const panel = doc.createElement('div');
    panel.className = 'ns-load-fail';
    panel.dataset.kind = kind;
    panel.setAttribute('role', 'alert');
    const h = doc.createElement('p'); h.className = 'ns-load-fail-title'; h.textContent = kind === 'stalled' ? words.stalled : words.failed;
    const hint = doc.createElement('p'); hint.className = 'ns-load-fail-hint'; hint.textContent = words.hint;
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'ns-load-fail-again'; b.textContent = words.again;
    b.addEventListener('click', () => { if (typeof onAgain === 'function') onAgain(); else { try { win.location.reload(); } catch { /* the browser's own reload still works */ } } });
    panel.append(h, hint, b);
    if (detail) { const d = doc.createElement('p'); d.className = 'ns-load-fail-detail'; d.textContent = String(detail).slice(0, 240); panel.appendChild(d); }
    host.appendChild(panel);
    try { b.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
    return { remove() { try { panel.remove(); } catch { /* gone */ } } };
  } catch { return { remove() {} }; }
}

/**
 * The watchdog: calls onStall() when lastAdvance() has not moved for stallMs, and onResume() if it then moves again.
 * Returns { stop(), stalled(), news() }. It checks once a second; a check that comes late (the page's thread was busy) measures from the
 * last real news, which a busy step reports the moment it ends, so a long step is not taken for a stall.
 * onQuiet() is called once when lastAdvance() has not moved for quietMs (and again after news and another such wait).
 */
export function createLoadWatch({ lastAdvance, onStall, onResume = null, onQuiet = null, stallMs = LOAD_STALL_MS, quietMs = LOAD_QUIET_MS, win = globalThis.window, now = () => win.performance.now() } = {}) {
  let stalled = false, hushed = false, lastTick = now(), timer = 0;
  const tick = () => {
    const t = now();
    // a tick that comes more than 3 s late means the page itself was busy or asleep: that time does not count
    const late = t - lastTick > 3000;
    lastTick = t;
    const quiet = t - lastAdvance();
    if (!hushed && quiet > quietMs && !late) { hushed = true; if (typeof onQuiet === 'function') { try { onQuiet(Math.round(quiet)); } catch { /* advisory */ } } }
    else if (hushed && quiet < quietMs) hushed = false;
    if (!stalled && quiet > stallMs && !late) { stalled = true; try { onStall(Math.round(quiet)); } catch { /* advisory */ } }
    else if (stalled && quiet < stallMs) { stalled = false; if (typeof onResume === 'function') { try { onResume(); } catch { /* advisory */ } } }
  };
  timer = win.setInterval(tick, 1000);
  return { stop() { try { win.clearInterval(timer); } catch { /* gone */ } }, stalled: () => stalled,
    /** News has just come: lift a stall at once, without waiting for the next check. */
    news() { if (stalled && now() - lastAdvance() < stallMs) { stalled = false; if (typeof onResume === 'function') { try { onResume(); } catch { /* advisory */ } } } } };
}

const fileOf = url => { try { return String(url).split(/[?#]/)[0].split('/').pop() || String(url); } catch { return ''; } };

/**
 * Put the guard on the page (once). Returns { attach({ bar, lastAdvance }), takenOver(), advance(), fail(detail),
 * finish(), state() }; every method is safe to call at any time and never throws.
 *   attach      the loading bar ({ freeze(kind), thaw() }) and/or the function that gives the time of the bar's last
 *               real news; a later call replaces an earlier one
 *   takenOver   the launcher is running: from here it reports its own failures (fail) and a stray script error is no
 *               longer taken for a failed load
 *   advance     something real has happened just now
 *   fail        loading failed: the panel, with the reason in small print
 *   finish      the game is ready, or was stopped on purpose: no panel, no more watching
 */
export function installLoadGuard({ win = globalThis.window, doc = globalThis.document, stallMs = LOAD_STALL_MS, words = LOAD_WORDS } = {}) {
  if (win && win.__nsGuard) return win.__nsGuard;
  const now = () => { try { return win.performance.now(); } catch { return Date.now(); } };
  const st = { panel: null, taken: false, finished: false, stalls: 0, waits: 0, failed: null };
  let last = now(), source = null, bar = null, panel = null, watch = null, observer = null;
  const barRoots = () => { try { return Array.from(doc.querySelectorAll('.ns-load')); } catch { return []; } };
  const freeze = kind => {
    try { if (bar && typeof bar.freeze === 'function') bar.freeze(kind); } catch { /* a bar only */ }
    for (const r of barRoots()) { try { r.classList.add('ns-load-stopped'); } catch { /* gone */ } }
  };
  const thaw = () => {
    for (const r of barRoots()) { try { r.classList.remove('ns-load-stopped'); } catch { /* gone */ } }
    try { if (bar && typeof bar.thaw === 'function') bar.thaw(); } catch { /* a bar only */ }
  };
  const show = (kind, detail) => {
    if (panel) { panel.remove(); panel = null; }
    panel = showLoadFailure({ host: doc.body || doc.documentElement, kind, detail, win, doc, words });
    st.panel = kind;
  };
  const hide = () => { if (panel) { panel.remove(); panel = null; } st.panel = null; };
  const quit = () => {
    if (watch) { watch.stop(); watch = null; }
    if (observer) { try { observer.disconnect(); } catch { /* gone */ } observer = null; }
    try { win.removeEventListener('error', onError, true); } catch { /* gone */ }
  };
  const guard = {
    attach({ bar: b = undefined, lastAdvance = undefined } = {}) {
      if (b !== undefined) bar = b;
      if (typeof lastAdvance === 'function') source = lastAdvance;
      if (watch) watch.news();
      if (st.panel && bar) { try { bar.freeze(st.panel); } catch { /* a bar only */ } }
    },
    takenOver() { st.taken = true; last = now(); if (watch) watch.news(); },
    advance() { last = now(); if (watch) watch.news(); },
    fail(detail = '') {
      if (st.finished) return;
      st.failed = String(detail || 'failed'); st.finished = true;
      quit(); freeze('failed'); show('failed', detail);
    },
    finish() {
      if (st.finished && !st.failed) return;
      st.finished = true; st.failed = null;
      quit(); hide();
      for (const r of barRoots()) { try { r.classList.remove('ns-load-stopped'); } catch { /* gone */ } }
    },
    state: () => ({ ...st })
  };
  const lastAdvance = () => { let t = last; try { if (source) { const s = Number(source()); if (Number.isFinite(s) && s > t) t = s; } } catch { /* the guard's own clock */ } return t; };
  function onError(ev) {
    if (st.finished) return;
    const t = ev && ev.target;
    // a <script> of the page that could not be loaded (the event does not bubble: this listener captures)
    if (t && t !== win && typeof t.tagName === 'string' && t.tagName.toUpperCase() === 'SCRIPT') {
      if (t.dataset && t.dataset.nsNeeded !== undefined) guard.fail(`A file of the game did not arrive (${fileOf(t.src)} or one of the files it needs).`);
      return;
    }
    // a script that threw while the page's scripts were starting, before the launcher took over
    if (t === win && !st.taken && ev.error) guard.fail(String(ev.error && ev.error.message || ev.message || ev.error));
  }
  try { win.addEventListener('error', onError, true); } catch { /* no events here */ }
  // every file the browser finishes is news (the game's scripts arriving one by one, before any of them runs)
  try {
    if (typeof win.PerformanceObserver === 'function') {
      observer = new win.PerformanceObserver(list => { if (list.getEntries().length) { last = now(); if (watch) watch.news(); } });
      observer.observe({ type: 'resource', buffered: false });
    }
  } catch { observer = null; }
  try {
    watch = createLoadWatch({ lastAdvance, stallMs, win, now,
      // five seconds without news: the bar's word says "Waiting" (the bar writes its own word again at the next news)
      onQuiet: () => { if (st.finished) return; st.waits++; try { for (const w of doc.querySelectorAll('.ns-load .ns-load-word')) w.textContent = words.waiting; } catch { /* a word only */ } },
      onStall: () => { if (st.finished) return; st.stalls++; freeze('stalled'); show('stalled', ''); },
      onResume: () => { if (st.finished) return; hide(); thaw(); } });
  } catch { watch = null; }
  try { win.__nsGuard = guard; } catch { /* a frozen window: the caller still has the guard */ }
  return guard;
}

// On the page itself (preview.html loads this file first): the ordinary start only. The launcher's two test cases
// (?case=...) keep their plain page.
try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.location) {
    const mode = new URLSearchParams(window.location.search).get('case') || 'boot';
    if (mode !== 'stop-during-body' && mode !== 'missing-face') installLoadGuard();
  }
} catch { /* no page here (a test, a worker) */ }
