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
 * Nothing waits for ever: when no byte, no file and no step has advanced for STALL_MS, or loading fails, a panel says
 * so in plain words with a "Try again" button (the watchdog; createLoadWatch).
 *
 * createLoadModel is pure (testable in Node); createLoadBar and showLoadFailure make DOM.
 */

/** The steps, in the order they usually end: [id, default expected ms, the word shown]. The defaults are the times
 * measured on the development computer, 19 November 2026; a computer's own last times replace them. */
export const LOAD_STEPS = Object.freeze([
  ['page', 1000, 'Loading'],   // the page's own scripts (over when this module runs; its real time is known then)
  ['files', 3500, 'Loading'],
  ['brain', 1100, 'Building'],
  ['check', 500, 'Building'],
  ['rig', 800, 'Building'],
  ['pose', 900, 'Building'],
  ['layers', 3000, 'Building'],
  ['body', 950, 'Building'],
  ['lift', 500, 'Building'],
  ['skin', 800, 'Building'],
  ['first', 1500, 'Starting']
].map(s => Object.freeze(s)));
export const LOAD_TIMES_KEY = 'neurosurge.loading.stepMs';
export const LOAD_STALL_MS = 20000;
/** While a step runs the bar moves to this share of the step over CREEP_STRETCH times its expected time. */
export const LOAD_CREEP = Object.freeze({ upTo: 0.9, stretch: 1.3 });
export const LOAD_WORDS = Object.freeze({
  label: 'Loading',
  failed: 'Loading did not finish.',
  stalled: 'Loading has stopped.',
  hint: 'Check your connection, then try again.',
  again: 'Try again'
});

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
 *   begin(id)          a step that gives no progress of its own starts (the model then creeps it by the clock)
 *   done(id)           a step has finished
 *   value(t)           the bar, 0..1, at time t (never falls)
 *   plan(t)            { from, to, ms, word }: where the bar is, where it may move to with no further news, and how long
 *                      that takes (the CSS transition); ms = 0 when nothing is running
 *   times()            the measured ms of each finished step (to store)
 *   lastAdvance()      the time of the last real news (set with a larger fraction, begin, done)
 */
export function createLoadModel({ times = {}, now = () => Date.now(), steps = LOAD_STEPS, creep = LOAD_CREEP, pageMs = null, floor: floor0 = 0 } = {}) {
  const S = new Map(steps.map(([id, ms, word]) => [id, { id, word, expect: Number.isFinite(times[id]) ? times[id] : ms, f: 0, state: 'waiting', t0: null, t1: null }]));
  // pageMs: how long the page's scripts took to arrive (the 'page' step is over when the model is made; its share is
  // that real time). floor: where a bar already on the page stands (the model never shows less).
  if (Number.isFinite(pageMs) && S.has('page')) { const s = S.get('page'); s.expect = Math.max(20, pageMs); s.state = 'done'; s.f = 1; s.t0 = 0; s.t1 = s.expect; }
  let total = 0;
  for (const s of S.values()) total += s.expect;
  let floor = clamp01(floor0), advanced = now(), speed = 1, word = steps[0][2];
  // A step that runs by the clock: its share at time t (never past creep.upTo until done).
  const fOf = (s, t) => (s.state === 'done' ? 1 : s.state === 'running' && s.t0 !== null && s.byClock ? Math.max(s.f, Math.min(creep.upTo, creep.upTo * (t - s.t0) / (creep.stretch * s.expect * speed))) : s.f);
  const valueAt = t => { let v = 0; for (const s of S.values()) v += s.expect * fOf(s, t); return clamp01(v / total); };
  return {
    set(id, fraction) {
      const s = S.get(id); if (!s || s.state === 'done') return;
      const f = clamp01(fraction);
      if (s.state === 'waiting') { s.state = 'running'; s.t0 = now(); }
      if (f > s.f) { s.f = f; advanced = now(); word = s.word; }
    },
    begin(id) {
      const s = S.get(id); if (!s || s.state !== 'waiting') return;
      s.state = 'running'; s.t0 = now(); s.byClock = true; advanced = s.t0; word = s.word;
    },
    done(id) {
      const s = S.get(id); if (!s || s.state === 'done') return;
      const t = now();
      if (s.t0 === null) s.t0 = t;
      s.state = 'done'; s.t1 = t; s.f = 1; advanced = t;
      // How this computer compares with the expected times, from the clock steps finished so far (when the defaults
      // came from a faster or slower computer, the creep of the steps still to come is paced to this one).
      let got = 0, want = 0;
      for (const x of S.values()) if (x.state === 'done' && x.byClock && x.t1 - x.t0 > 30) { got += x.t1 - x.t0; want += x.expect; }
      if (want > 0) speed = Math.min(8, Math.max(0.25, got / want));
    },
    value(t = now()) { const v = Math.max(floor, valueAt(t)); floor = v; return v; },
    plan(t = now()) {
      const from = this.value(t);
      let end = 0;
      for (const s of S.values()) if (s.state === 'running' && s.byClock) end = Math.max(end, s.t0 + creep.stretch * s.expect * speed);
      const ms = Math.max(0, end - t);
      return { from, to: ms > 0 ? Math.max(from, valueAt(end)) : from, ms, word };
    },
    times() { const o = {}; for (const s of S.values()) if (s.state === 'done' && s.t0 !== null && s.id !== 'page') o[s.id] = Math.max(20, Math.round(s.t1 - s.t0)); return o; },
    lastAdvance: () => advanced,
    finished() { for (const s of S.values()) if (s.state !== 'done') return false; return true; },
    state() { const o = {}; for (const s of S.values()) o[s.id] = { state: s.state, f: Math.round(s.f * 1000) / 1000, expect: s.expect }; return { steps: o, speed: Math.round(speed * 100) / 100 }; }
  };
}

/**
 * The bar on the page. host: where it is put (the body). Returns { set, begin, done, finish(), fail(kind, detail),
 * remove(), state(), model }. Every method is safe to call at any time and never throws.
 */
export function createLoadBar({ host, win = globalThis.window, doc = globalThis.document, storage = null, words = LOAD_WORDS } = {}) {
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
  model = createLoadModel({ times, now, pageMs: now(), floor });
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
  const still = v => {
    for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    anims = [];
    fill.style.transform = `scaleX(${Math.max(0.004, v).toFixed(4)})`;
    column.style.transform = `translateY(${-Math.round(100 * v)}em)`;
  };
  const creep = (from, to, ms) => {
    const a = Math.round(100 * from), b = Math.round(100 * to);
    if (typeof fill.animate !== 'function') return;
    anims.push(fill.animate([{ transform: `scaleX(${Math.max(0.004, from).toFixed(4)})` }, { transform: `scaleX(${Math.max(0.004, to).toFixed(4)})` }], { duration: ms, easing: 'linear', fill: 'forwards' }));
    if (b > a) anims.push(column.animate([{ transform: `translateY(${-a}em)` }, { transform: `translateY(${-b}em)` }], { duration: ms, easing: `steps(${b - a}, end)`, fill: 'forwards' }));
  };
  function render() {
    if (!root || st.removed || st.failed) return;
    try {
      const p = model.plan();
      still(p.from);
      if (p.ms > 30 && p.to > p.from) creep(p.from, p.to, p.ms);
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
    /** The game is ready: 100 %, keep the measured times for the next load, fade the bar out. */
    finish() {
      if (st.removed) return;
      for (const [id] of LOAD_STEPS) model.done(id);
      try { if (storage) storage.setItem(LOAD_TIMES_KEY, JSON.stringify(model.times())); } catch { /* no storage here */ }
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
 * Returns { stop() }. It checks once a second; a check that comes late (the page's thread was busy) measures from the
 * last real news, which a busy step reports the moment it ends, so a long step is not taken for a stall.
 */
export function createLoadWatch({ lastAdvance, onStall, onResume = null, stallMs = LOAD_STALL_MS, win = globalThis.window, now = () => win.performance.now() } = {}) {
  let stalled = false, lastTick = now(), timer = 0;
  const tick = () => {
    const t = now();
    // a tick that comes more than 3 s late means the page itself was busy or asleep: that time does not count
    const late = t - lastTick > 3000;
    lastTick = t;
    const quiet = t - lastAdvance();
    if (!stalled && quiet > stallMs && !late) { stalled = true; try { onStall(Math.round(quiet)); } catch { /* advisory */ } }
    else if (stalled && quiet < stallMs) { stalled = false; if (typeof onResume === 'function') { try { onResume(); } catch { /* advisory */ } } }
  };
  timer = win.setInterval(tick, 1000);
  return { stop() { try { win.clearInterval(timer); } catch { /* gone */ } }, stalled: () => stalled };
}
