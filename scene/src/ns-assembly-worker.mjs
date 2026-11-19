/** NeuroSurge loading picture, worker side (see ns-assembly-core.mjs). The page hands this worker an OffscreenCanvas
 * and a copy of each atlas file's bytes as the game fetches it; the worker reads the triangles and draws the parts
 * coming together. It runs off the page's main thread, so the picture keeps moving while the game builds the body.
 * A loading picture only: nothing here is read by the game.
 *
 * Messages in:  { type: 'init', canvas, width, height, pixelRatio, room, reducedMotion, expectReadyS } |
 *               { type: 'obj', kind, place ({ track, tier, frac, name, groups, layer } or null), bytes (ArrayBuffer) } |
 *               { type: 'mesh', kind, place, positions (ArrayBuffer of floats), indices (ArrayBuffer of 32-bit) } |
 *               { type: 'meshes', list: [{ kind, place, positions, indices }, ...] } (a whole pack, 20 November 2026) |
 *               { type: 'room', room: { fovYDeg, pitchDeg } } (the game's first view, from the launcher) |
 *               { type: 'alive' } (files are still coming: a pack's bytes) |
 *               { type: 'progress', fraction } | { type: 'resize', width, height, pixelRatio } |
 *               { type: 'known', counts } (a manifest's parts per tier) |
 *               { type: 'hurry' } (the game is ready: the parts still held come in quickly) | { type: 'stop' }
 * Messages out: { type: 'ready' } | { type: 'first' } (the first part has set off) | { type: 'error', message } |
 *               { type: 'state', ... } (once a second) |
 *               { type: 'starts', starts: [[time s, track, tier], ...], at } (once, at the hurry)
 */
import * as THREE from '../../vendor/three.module.js';
import { createAssemblyView, parseObjBytes } from './ns-assembly-core.mjs';

let view = null, running = false, lastState = 0, fraction = 0, lastObjAt = 0, lastDraw = 0, firstSent = false;
const queue = [];

const raf = typeof self.requestAnimationFrame === 'function' ? cb => self.requestAnimationFrame(cb) : cb => setTimeout(() => cb(performance.now()), 16);

function tick(now) {
  if (!running || !view) return;
  // About 30 pictures a second are plenty for a loading picture, and leave the processor to the loading itself.
  if (now - lastDraw < 30) { raf(tick); return; }
  lastDraw = now;
  // Read at most ~6 ms of files per picture, so the picture stays smooth while files pour in; 14 ms while many wait
  // (19 November 2026: a pack hands over hundreds of meshes at once, and the whole load is now a few seconds).
  const t0 = performance.now(), budget = queue.length > 40 ? 14 : 6;
  while (queue.length && performance.now() - t0 < budget) {
    const q = queue.shift();
    try { view.add(q.kind, q.mesh || parseObjBytes(new Uint8Array(q.bytes)), q.place); } catch { /* a part this picture cannot read is left out */ }
  }
  // "Finishing": nearly every file is in and none has come for a moment, so the page is now building the body.
  view.setProgress(fraction, fraction > 0.9 && queue.length === 0 && performance.now() - lastObjAt > 900);
  try { view.frame(now); } catch (err) { running = false; self.postMessage({ type: 'error', message: String(err && err.message || err) }); return; }
  // (once: the first part has set off, so the page can tell when the picture began to build)
  if (!firstSent && view.started() > 0) { firstSent = true; self.postMessage({ type: 'first' }); }
  if (now - lastState > 1000) { lastState = now; self.postMessage({ type: 'state', ...view.state(), queued: queue.length, at: Math.round(performance.now()) }); }
  raf(tick);
}

self.onmessage = ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'init') {
      view = createAssemblyView({ THREE, canvas: m.canvas, width: m.width, height: m.height, pixelRatio: m.pixelRatio, room: m.room || null, reducedMotion: m.reducedMotion === true,
        expectReadyS: Number.isFinite(m.expectReadyS) ? m.expectReadyS : null });
      running = true;
      self.postMessage({ type: 'ready' });
      raf(tick);
    } else if (m.type === 'obj') {
      if (running) { queue.push({ kind: m.kind, place: m.place || null, bytes: m.bytes }); lastObjAt = performance.now(); }
    } else if (m.type === 'mesh') {
      // 19 November 2026: a mesh from a verified pack (already positions and triangles; a copy)
      if (running) { queue.push({ kind: m.kind, place: m.place || null, mesh: { positions: new Float32Array(m.positions), indices: new Uint32Array(m.indices) } }); lastObjAt = performance.now(); }
    } else if (m.type === 'meshes') {
      // 20 November 2026: the meshes of a whole pack at once, as it arrives (copies)
      if (running && Array.isArray(m.list)) { for (const x of m.list) queue.push({ kind: x.kind, place: x.place || null, mesh: { positions: new Float32Array(x.positions), indices: new Uint32Array(x.indices) } }); lastObjAt = performance.now(); }
    } else if (m.type === 'alive') {
      if (view) view.alive();
    } else if (m.type === 'room') {
      if (view) view.setRoom(m.room);
    } else if (m.type === 'known') {
      if (view) view.know(m.counts);
    } else if (m.type === 'hurry') {
      // The order of the starts so far goes back once, for checks (the page keeps it in its state()).
      if (view) { self.postMessage({ type: 'starts', starts: view.starts(), at: Math.round(performance.now()) }); view.hurry(); }
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
