/** NeuroSurge loading bar (19 November 2026; the owner: "The game is currently broken as it just stays on the loading
 * page forever. There should be a loading progress bar as well to indicate the loading pages does not go on forever").
 *
 * One bar with a percentage for the WHOLE wait: the download (by bytes) and then every step the page takes to build
 * the game from the files (arm and brain, checking the body's files, the skeleton's joints, the pose, the muscle
 * layers, handing the body to the graphics card, the lift, the skin, the first picture). Each step has a share of the
 * bar equal to the time it is expected to take: the time it took on this computer the last time (kept in the
 * browser's storage), else a default. 100 % is the game's first picture.
 *
 * The page's own thread is busy for up to a few seconds inside a step, and nothing it draws can change meanwhile. So
 * while a step runs, the bar and the number move toward that step's end as an animation of `transform`, which the
 * browser's compositor plays without the page's thread; they stop short of the step's end until the step has really
 * finished. The bar therefore keeps moving, and it never shows more than has been done plus the step in hand.
 *
 * Nothing waits for ever: when no byte, no file and no step has advanced for LOAD_STALL_MS, or loading fails, a panel
 * says so in plain words with a "Try again" button. The watchdog and the panel live in ns-load-guard.mjs, the page's
 * first script, which needs no other file (they are passed on from here for those who import this module).
 *
 * createLoadModel is pure (testable in Node); createLoadBar makes DOM.
 */
import { LOAD_WORDS } from './ns-load-guard.mjs';
export { LOAD_WORDS, LOAD_STALL_MS, showLoadFailure, createLoadWatch } from './ns-load-guard.mjs';

/** The steps, in the order they usually end: [id, default expected ms, the word shown, kind]. kind 'net' = waiting for
 * files (the connection sets its time), 'cpu' = the page building (the computer sets it). The defaults are the times
 * measured on the development computer, 19 November 2026, with the coarse meshes; a computer's own last times replace
 * them, and a slower computer is noticed from its first building steps. */
export const LOAD_STEPS = Object.freeze([
  ['page', 1000, 'Loading', 'net'],   // the page's own scripts (over when the launcher starts)
  ['files', 1500, 'Loading', 'net'],  // the mesh packs (over when the last file is in)
  ['brain', 600, 'Building', 'cpu'],
  ['check', 200, 'Building', 'net'],
  ['rig', 300, 'Building', 'cpu'],
  ['pose', 300, 'Building', 'cpu'],
  ['layers', 850, 'Building', 'cpu'],
  ['body', 400, 'Building', 'cpu'],
  ['lift', 250, 'Building', 'cpu'],
  ['skin', 300, 'Building', 'cpu'],
  ['first', 700, 'Starting', 'cpu']
].map(s => Object.freeze(s)));
export const LOAD_TIMES_KEY = 'neurosurge.loading.stepMs';
/** A step that runs by the clock counts down its expected time, but never below this share of it until it really
 * ends (minLeft). When it runs on past its expected time the bar goes on into the room of the steps still to come at
 * this share of its pace, and so never further than this share of that room (beyond). unsure: while nothing is known of
 * this computer's speed (no earlier load here, no building step finished yet) the building steps are expected to take
 * this many times the default, so a slower computer's first step is not promised too soon. */
export const LOAD_CREEP = Object.freeze({ minLeft: 0.25, beyond: 0.5, unsure: 1.5 });
/** The bar shows at most this much until the game's first picture is there (finish()). */
export const LOAD_MAX_BEFORE_READY = 0.99;

const clamp01 = v => (v > 1 ? 1 : v > 0 ? v : 0);

/** Stored step times (pure): a JSON text -> { id: ms } with only known steps and sane values, or {}. */
export function parseStepTimes(text) {
  const out = {};
  try {
    const o = JSON.parse(text);
    if (o && typeof o === 'object') for (const [id] of LOAD_STEPS) { const v = Number(o[id]); if (Number.isFinite(v) && v >= 20 && v <= 300000) out[id] = Math.round(v); }
  } catch { /* none */ }
  return out;
}

/**
 * The model (pure). times: { id: ms } from the last load. now(): ms.
 *   set(id, fraction)  a step's real progress (the download's bytes, the files checked)
 *   begin(id)          a step that gives no progress of its own starts (the model then counts it down by the clock)
 *   done(id)           a step has finished
 *   value(t)           the bar, 0..1, at time t (never falls; below LOAD_MAX_BEFORE_READY until every step is done)
 *   plan(t)            { from, to, ms, frames: [[ms from t, value], ...], word }: where the bar is and how it moves
 *                      with no further news (straight lines between the frames; the last frame is [ms, to]); ms = 0
 *                      when it would not move
 *   times()            the measured ms of each finished step, to store for the next load: its own time, less any
 *                      part of it that ran alongside a step that finished before it (the packs travel while the
 *                      scripts do), so the times add up to the wait
 *   lastAdvance()      the time of the last real news (set with a larger fraction, begin, done)
 *
 * The bar is TIME GONE OVER TIME GONE PLUS TIME EXPECTED TO COME, counted afresh from where the bar stood when the last
 * step began or ended:  shown = base + (1 - base) * gone / (gone + left).  `left` is the expected time of the steps not
 * yet done (a download by its bytes still to come; a step in hand by its expected time less the time it has run,
 * never under a quarter of it). So the bar moves all the time a step is in hand and never jumps: a step that ends
 * sooner than expected (a download that took six seconds last time and comes from the browser's cache today) does not
 * throw the bar forward, it only makes the rest go faster; a step that takes longer keeps the bar moving, ever more
 * slowly, and never further than half way into what the later steps will need. Where progress is measured and nothing
 * else is in hand (a download), the bar shows no more than what has come: a download that has stopped stops the bar.
 */
export function createLoadModel({ times = {}, now = () => Date.now(), steps = LOAD_STEPS, creep = LOAD_CREEP, pageMs = null, floor: floor0 = 0 } = {}) {
  const S = new Map(steps.map(([id, ms, word, kind]) => [id, { id, word, kind: kind || 'cpu', expect: Number.isFinite(times[id]) ? times[id] : ms, f: 0, state: 'waiting', t0: null, t1: null }]));
  const rank = new Map(); for (const [, , w] of steps) if (!rank.has(w)) rank.set(w, rank.size);
  // pageMs: how long the page's scripts took to arrive (the 'page' step is over when the model is made). floor: where
  // a bar already on the page stands (the model never shows less).
  const given = Number.isFinite(pageMs) && S.has('page');
  if (given) { const s = S.get('page'); s.expect = Math.max(20, pageMs); s.state = 'done'; s.f = 1; s.t0 = 0; s.t1 = s.expect; s.given = true; }
  let floor = clamp01(floor0), advanced = now(), speed = 1, word = steps[0][2];
  // is this computer's building speed known? (its own stored times, or a building step finished in this load)
  let sure = steps.some(([id, , , kind]) => (kind || 'cpu') === 'cpu' && Number.isFinite(times[id]));
  const eff = s => s.expect * (s.kind === 'cpu' ? speed * (sure ? 1 : creep.unsure) : 1);
  // the expected time still to come at time t; whole: with every clock step in hand counted as over
  const left = (t, whole = false) => {
    let r = 0;
    for (const s of S.values()) {
      if (s.state === 'done') continue;
      const e = eff(s);
      if (s.state === 'running' && s.byClock) r += whole ? 0 : Math.max(creep.minLeft * e, e - (t - s.t0));
      else r += e * (1 - s.f);
    }
    return r;
  };
  const inHand = () => { for (const s of S.values()) if (s.state === 'running' && s.byClock) return true; return false; };
  const allDone = () => { for (const s of S.values()) if (s.state !== 'done') return false; return true; };
  // the anchor: the bar stood at `base` at time tA, when `leftA` was still to come
  let tA = now(), leftA = left(tA), base = given ? S.get('page').expect / (S.get('page').expect + leftA) : 0;
  const shownAt = t => {
    if (allDone()) return 1;
    const gone = Math.max(0, t - tA), l = left(t);
    const byTime = gone + l > 0 ? gone / (gone + l) : 0;
    // of what was still to come at the anchor: what is done or measured since, with the clock steps in hand whole
    const share = leftA > 0 ? clamp01((leftA - left(t, true)) / leftA) : 1;
    const p = byTime <= share ? byTime : inHand() ? share + creep.beyond * (byTime - share) : share;
    return Math.min(LOAD_MAX_BEFORE_READY, base + (1 - base) * p);
  };
  const anchor = t => { base = Math.max(floor, shownAt(t)); floor = base; tA = t; };
  const say = w => { if ((rank.get(w) || 0) >= (rank.get(word) || 0)) word = w; }; // the word only moves forward
  return {
    set(id, fraction) {
      const s = S.get(id); if (!s || s.state === 'done') return;
      const f = clamp01(fraction);
      if (s.state === 'waiting') { s.state = 'running'; s.t0 = now(); }
      if (f > s.f) { s.f = f; advanced = now(); say(s.word); }
    },
    begin(id) {
      const s = S.get(id); if (!s || s.state !== 'waiting') return;
      const t = now();
      anchor(t); // (the step's expected time is the same before and after: the bar goes on from where it is)
      s.state = 'running'; s.t0 = t; s.byClock = true; advanced = t; say(s.word);
      leftA = left(t);
    },
    done(id) {
      const s = S.get(id); if (!s || s.state === 'done') return;
      const t = now();
      anchor(t); // where the bar stands now, before this step's end changes what is expected
      if (s.t0 === null) s.t0 = t;
      s.state = 'done'; s.t1 = t; s.f = 1; advanced = t;
      // How this computer compares with the expected times, from the building steps finished so far (when the
      // defaults came from a faster or slower computer, the steps still to come are expected at this one's pace).
      let got = 0, want = 0;
      for (const x of S.values()) if (x.state === 'done' && x.kind === 'cpu' && x.byClock && x.t1 - x.t0 > 30) { got += x.t1 - x.t0; want += x.expect; }
      if (want > 0) { speed = Math.min(8, Math.max(0.25, got / want)); sure = true; }
      leftA = left(t);
    },
    value(t = now()) { const v = Math.max(floor, shownAt(t)); floor = v; return v; },
    plan(t = now()) {
      const from = this.value(t);
      // sampled closely at first, then more widely, as far as 20 s ahead (the page may be busy for seconds and the
      // browser's compositor plays these frames meanwhile)
      const frames = [];
      let last = from;
      for (let ms = 100; ms <= 20000; ms += ms < 1000 ? 100 : ms < 4000 ? 250 : 1000) { const v = Math.max(last, shownAt(t + ms)); frames.push([ms, v]); last = v; }
      // drop a tail that no longer moves
      while (frames.length && frames[frames.length - 1][1] <= (frames.length > 1 ? frames[frames.length - 2][1] : from) + 1e-6) frames.pop();
      const end = frames.length ? frames[frames.length - 1] : [0, from];
      return { from, to: end[1], ms: end[0], frames, word };
    },
    times() {
      const o = {}, ended = [...S.values()].filter(s => s.state === 'done' && s.t0 !== null && !s.given).sort((a, b) => a.t1 - b.t1);
      let before = -Infinity; // when the step that finished before this one ended
      for (const s of ended) { o[s.id] = Math.max(20, Math.round(s.t1 - Math.max(s.t0, before))); before = Math.max(before, s.t1); }
      const out = {}; for (const s of S.values()) if (s.id in o) out[s.id] = o[s.id];
      return out;
    },
    lastAdvance: () => advanced,
    finished: allDone,
    state() { const o = {}; for (const s of S.values()) o[s.id] = { state: s.state, f: Math.round(s.f * 1000) / 1000, expect: s.expect }; return { steps: o, speed: Math.round(speed * 100) / 100, sure }; }
  };
}

/**
 * The bar on the page. host: where it is put (the body). Returns { set, begin, done, finish(), fail(kind, detail),
 * remove(), state(), model }. Every method is safe to call at any time and never throws.
 */
export function createLoadBar({ host, win = globalThis.window, doc = globalThis.document, storage = null, words = LOAD_WORDS, early = false } = {}) {
  const now = () => { try { return win.performance.now(); } catch { return Date.now(); } };
  let times = {};
  try { times = parseStepTimes(storage && storage.getItem(LOAD_TIMES_KEY)); } catch { times = {}; }
  const st = { shown: false, removed: false, failed: null, lastPct: 0, renders: 0, adopted: false };
  let root = null, fill = null, column = null, wordEl = null, model = null;
  const el = (tag, cls, parent, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  // The bar may already be on the page (preview.html has it, so it is seen before any script arrives): take it over
  // from where its own small animation stands.
  let floor = 0;
  try {
    const early = doc.querySelector('.ns-load.ns-load-early');
    const f = early && early.querySelector('.ns-load-fill'), c = early && early.querySelector('.ns-load-pct-column'), w = early && early.querySelector('.ns-load-word');
    if (early && f && c && w) {
      try { const m = /matrix\(([^,]+),/.exec(win.getComputedStyle(f).transform); floor = m ? Math.min(0.2, Math.max(0, Number(m[1]) || 0)) : 0; } catch { floor = 0; }
      root = early; fill = f; column = c; wordEl = w;
      column.textContent = '';
      for (let i = 0; i <= 100; i++) el('span', 'ns-load-pct-line', column, `${i} %`);
      fill.style.transform = `scaleX(${Math.max(0.004, floor).toFixed(4)})`;
      root.classList.remove('ns-load-early');
      st.shown = true; st.adopted = true;
    }
  } catch { root = null; }
  // early: made by the page's first small script while the game's own scripts are still on their way; otherwise the
  // scripts are in and their time is known
  model = createLoadModel({ times, now, floor, ...(early ? {} : { pageMs: now() }) });
  // (early: the 'page' step is reported by the caller as the scripts arrive, set('page', share), until pageLoaded())
  if (!root) try {
    root = el('div', 'ns-load', host);
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-label', words.label);
    root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100'); root.setAttribute('aria-valuenow', '0');
    const text = el('div', 'ns-load-text', root);
    wordEl = el('span', 'ns-load-word', text, words.label);
    // The number: a column of "0 %" ... "100 %", moved up one line per percent behind a one-line window, so the
    // compositor can change the number while the page's thread is busy.
    const windowEl = el('span', 'ns-load-pct', text);
    windowEl.setAttribute('aria-hidden', 'true');
    column = el('span', 'ns-load-pct-column', windowEl);
    for (let i = 0; i <= 100; i++) el('span', 'ns-load-pct-line', column, `${i} %`);
    const track = el('div', 'ns-load-track', root);
    fill = el('div', 'ns-load-fill', track);
    st.shown = true;
  } catch { root = null; }

  // Where the bar and the number stand (plain styles), and, while a step runs, an animation from there toward the
  // step's end (Web Animations with explicit start and end frames, so nothing depends on what was drawn before;
  // animations of `transform` are played by the compositor while the page's thread is busy).
  let anims = [];
  const scale = v => `scaleX(${Math.max(0.004, v).toFixed(4)})`;
  const still = v => {
    for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    anims = [];
    fill.style.transform = scale(v);
    column.style.transform = `translateY(${-Math.round(100 * v)}em)`;
  };
  // frames: [[ms from now, value], ...] (straight lines between; ns-load-progress plan)
  const creep = (from, frames) => {
    if (typeof fill.animate !== 'function' || !frames.length) return;
    const ms = frames[frames.length - 1][0];
    const pts = [[0, from], ...frames];
    anims.push(fill.animate(pts.map(([at, v]) => ({ offset: Math.min(1, at / ms), transform: scale(v) })), { duration: ms, easing: 'linear', fill: 'forwards' }));
    // the number: whole lines of the column, each stretch of the way in as many steps as it has percents
    const lines = pts.map(([at, v]) => [at, Math.round(100 * v)]);
    if (lines[lines.length - 1][1] > lines[0][1]) {
      anims.push(column.animate(lines.map(([at, n], i) => ({ offset: Math.min(1, at / ms), transform: `translateY(${-n}em)`,
        easing: i + 1 < lines.length && lines[i + 1][1] > n ? `steps(${lines[i + 1][1] - n}, end)` : 'linear' })), { duration: ms, fill: 'forwards' }));
    }
  };
  function render() {
    if (!root || st.removed || st.failed) return;
    try {
      const p = model.plan();
      still(p.from);
      if (p.ms > 30 && p.to > p.from) creep(p.from, p.frames);
      const pct = Math.round(100 * p.from);
      root.setAttribute('aria-valuenow', String(pct));
      if (wordEl.textContent !== p.word) wordEl.textContent = p.word;
      st.lastPct = pct; st.renders++;
    } catch { /* a bar only */ }
  }
  const touch = () => render();
  render();
  return {
    model,
    set(id, fraction) { model.set(id, fraction); touch(); },
    begin(id) { model.begin(id); touch(); },
    done(id) { model.done(id); touch(); },
    /** The game's own scripts are in (the launcher calls this when it starts). */
    pageLoaded() { model.done('page'); touch(); },
    /** The game is ready: 100 %, keep the measured times for the next load, fade the bar out. */
    finish() {
      if (st.removed) return;
      // the steps in hand end here (the first picture); a step that never started was not measured and is not stored
      let measured = {};
      try { const now0 = model.state().steps; for (const [id] of LOAD_STEPS) if (now0[id] && now0[id].state === 'running') model.done(id); measured = model.times(); } catch { measured = {}; }
      for (const [id] of LOAD_STEPS) model.done(id);
      try { if (storage && Object.keys(measured).length) storage.setItem(LOAD_TIMES_KEY, JSON.stringify(measured)); } catch { /* no storage here */ }
      try { still(1); root.setAttribute('aria-valuenow', '100'); root.classList.add('ns-load-out'); } catch { /* gone */ }
      st.removed = true;
      win.setTimeout(() => { try { root.remove(); } catch { /* gone */ } }, 900);
    },
    remove() { st.removed = true; try { root.remove(); } catch { /* gone */ } },
    /** Freeze the bar where it is (loading failed or stopped): the failure panel takes over. */
    freeze(kind) { st.failed = kind; try { still(model.value()); root.classList.add('ns-load-stopped'); } catch { /* gone */ } },
    thaw() { st.failed = null; try { root.classList.remove('ns-load-stopped'); } catch { /* gone */ } touch(); },
    state: () => ({ ...st, value: (() => { try { return Math.round(1000 * model.value()) / 1000; } catch { return null; } })(), ...model.state() })
  };
}
