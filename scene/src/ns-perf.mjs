/**
 * NeuroSurge: frame time by part (18 November 2026, performance package). Pure module (browser and Node; no DOM, no
 * imports). The game loop calls begin() at the start of a frame, mark(part) at the END of each part of its work (the
 * time since the previous mark, or since begin, goes to that part), and end() when the frame is drawn. The last
 * FRAME_TIMER.window frames are kept, so inspect() can show what each part costs now: the mean and the 90th percentile
 * per part, in milliseconds of main-thread time. Later packages read it to see what their change costs (compare two
 * builds on the same machine one after the other; on a shared machine the absolute numbers include time the processor
 * spent on other programs).
 *
 * Cost: one clock read per mark and a few array writes; nothing is allocated per frame.
 */

/** The parts of a frame, in the order the game does them. 'other' takes whatever is not marked. */
export const FRAME_PARTS = Object.freeze([
  'input',   // input, look and camera, up to the crosshair pick
  'pick',    // what is under the crosshair (controlTargets / the scene's ray picks)
  'sim',     // the activity, controls and joint goals (one simulation step)
  'arm',     // the left game arm: fit, pose and its skin
  'guard',   // the body pose held back where it would touch the brain or the mirror body
  'pose',    // the body rig pose and the mesh matrices
  'skin',    // the per-vertex skin of the body's muscles
  'glow',    // glow links, the brain's regions, muscle colours
  'hud',     // the screen text, the tip and the cards
  'outline', // the ink outline passes (inside the scene's render)
  'draw',    // the main picture (inside the scene's render, outline excluded)
  'other'
]);
export const FRAME_TIMER = Object.freeze({ window: 120 });

/**
 * createFrameTimer({ now, window, parts }) -> { begin(t?), mark(part, t?), add(part, ms), end(t?), state(), reset() }.
 * now: a clock in ms (performance.now in the browser). A mark of a part not in `parts` goes to 'other'.
 */
export function createFrameTimer({ now = null, window = FRAME_TIMER.window, parts = FRAME_PARTS } = {}) {
  const clock = typeof now === 'function' ? now : () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const P = parts.slice(), n = P.length, W = Math.max(1, window | 0);
  const index = new Map(P.map((p, i) => [p, i]));
  const other = index.has('other') ? index.get('other') : n - 1;
  const ring = new Float64Array(W * (n + 1)); // per frame: n parts and the total
  const cur = new Float64Array(n);
  let at = 0, filled = 0, frames = 0, open = false, t0 = 0, last = 0;
  function begin(t = clock()) {
    cur.fill(0); open = true; t0 = t; last = t;
  }
  function mark(part, t = clock()) {
    if (!open) return;
    const i = index.has(part) ? index.get(part) : other;
    const d = t - last;
    if (d > 0) cur[i] += d;
    last = t;
  }
  /** Time measured elsewhere (a part inside another call) moved from the part that holds it to `part`. */
  function add(part, ms, from = null) {
    if (!open || !(ms > 0)) return;
    const i = index.has(part) ? index.get(part) : other;
    cur[i] += ms;
    if (from !== null && index.has(from)) { const j = index.get(from); cur[j] = Math.max(0, cur[j] - ms); }
  }
  function end(t = clock()) {
    if (!open) return;
    if (t - last > 0) cur[other] += t - last;
    const o = at * (n + 1);
    let total = 0;
    for (let i = 0; i < n; i++) { ring[o + i] = cur[i]; total += cur[i]; }
    ring[o + n] = Math.max(total, t - t0);
    at = (at + 1) % W; filled = Math.min(W, filled + 1); frames++; open = false;
  }
  function reset() { at = 0; filled = 0; frames = 0; open = false; ring.fill(0); }
  /** Plain JSON: { frames, window, meanMs: { part: ms }, p90Ms: { part: ms }, totalMeanMs, totalP90Ms }. */
  function state() {
    const mean = {}, p90 = {}, col = new Float64Array(filled);
    const r2 = v => Math.round(v * 100) / 100;
    const q90 = k => {
      for (let f = 0; f < filled; f++) col[f] = ring[f * (n + 1) + k];
      col.sort();
      return filled ? col[Math.min(filled - 1, Math.floor(filled * 0.9))] : 0;
    };
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let f = 0; f < filled; f++) s += ring[f * (n + 1) + i];
      mean[P[i]] = filled ? r2(s / filled) : 0;
      p90[P[i]] = r2(q90(i));
    }
    let s = 0;
    for (let f = 0; f < filled; f++) s += ring[f * (n + 1) + n];
    return { frames, window: filled, meanMs: mean, p90Ms: p90, totalMeanMs: filled ? r2(s / filled) : 0, totalP90Ms: r2(q90(n)) };
  }
  return { begin, mark, add, end, state, reset, parts: P };
}
