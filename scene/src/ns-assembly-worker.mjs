/** NeuroSurge loading picture, worker side (see ns-assembly-core.mjs). The page hands this worker an OffscreenCanvas
 * and a copy of each atlas file's bytes as the game fetches it; the worker reads the triangles and draws the parts
 * coming together. It runs off the page's main thread, so the picture keeps moving while the game builds the body.
 * A loading picture only: nothing here is read by the game.
 *
 * Messages in:  { type: 'init', canvas, width, height, pixelRatio } | { type: 'obj', kind, bytes (ArrayBuffer) } |
 *               { type: 'progress', fraction } | { type: 'resize', width, height, pixelRatio } | { type: 'stop' }
 * Messages out: { type: 'ready' } | { type: 'error', message } | { type: 'state', ... } (once a second)
 */
import * as THREE from '../../vendor/three.module.js';
import { createAssemblyView, parseObjBytes } from './ns-assembly-core.mjs';

let view = null, running = false, lastState = 0, fraction = 0, lastObjAt = 0, lastDraw = 0;
const queue = [];

const raf = typeof self.requestAnimationFrame === 'function' ? cb => self.requestAnimationFrame(cb) : cb => setTimeout(() => cb(performance.now()), 16);

function tick(now) {
  if (!running || !view) return;
  // About 30 pictures a second are plenty for a loading picture, and leave the processor to the loading itself.
  if (now - lastDraw < 30) { raf(tick); return; }
  lastDraw = now;
  // Read at most ~6 ms of files per picture, so the picture stays smooth while files pour in.
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 6) {
    const q = queue.shift();
    try { view.add(q.kind, parseObjBytes(new Uint8Array(q.bytes))); } catch { /* a part this picture cannot read is left out */ }
  }
  // "Finishing": nearly every file is in and none has come for a moment, so the page is now building the body.
  view.setProgress(fraction, fraction > 0.9 && queue.length === 0 && performance.now() - lastObjAt > 900);
  try { view.frame(now); } catch (err) { running = false; self.postMessage({ type: 'error', message: String(err && err.message || err) }); return; }
  if (now - lastState > 1000) { lastState = now; self.postMessage({ type: 'state', ...view.state(), queued: queue.length, at: Math.round(performance.now()) }); }
  raf(tick);
}

self.onmessage = ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'init') {
      view = createAssemblyView({ THREE, canvas: m.canvas, width: m.width, height: m.height, pixelRatio: m.pixelRatio, room: m.room || null });
      running = true;
      self.postMessage({ type: 'ready' });
      raf(tick);
    } else if (m.type === 'obj') {
      if (running) { queue.push({ kind: m.kind, bytes: m.bytes }); lastObjAt = performance.now(); }
    } else if (m.type === 'progress') {
      if (Number.isFinite(m.fraction)) fraction = Math.max(fraction, m.fraction);
    } else if (m.type === 'resize') {
      if (view) view.resize(m.width, m.height, m.pixelRatio);
    } else if (m.type === 'stop') {
      running = false; queue.length = 0;
      if (view) { view.dispose(); view = null; }
      self.close();
    }
  } catch (err) {
    running = false;
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
