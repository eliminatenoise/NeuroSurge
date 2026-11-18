/** NeuroSurge mesh-pack loader (19 November 2026; see ns-pack.mjs for what a pack is and how it is checked).
 *
 * runPackJob() does the work: it reads packs/PACK-INDEX.json (its bytes must match the pinned SHA-256), then each pack
 * (its bytes must match the index's SHA-256), inflates and decodes it, and reports what happens through emit().
 * It runs in a worker (ns-pack-worker.mjs), so reading 19 MB and decoding 1.5 million vertices costs the page's own
 * thread nothing; where there is no worker the same job runs on the page.
 *
 * startPackLoader() is the page side: get(key) resolves to a packed mesh (ns-pack packedMesh) for a file the game
 * asks for, or to null when that file must be read the old way (no pack, a pack that failed, an unknown file); the
 * launcher then fetches the OBJ file itself, so a missing or refused pack only makes loading slower, never wrong.
 *
 * Nothing here waits for ever: a pack whose download brings no byte for STALL_MS is given up (and its files are read
 * the old way).
 */
import { decodePack, validatePackIndex, packedMesh, PACK_INDEX_SHA256, PACK_DEFAULTS } from './ns-pack.mjs';

export const PACK_STALL_MS = 15000;
export const PACK_PARALLEL = 3;

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const text = err => String(err && err.message ? err.message : err);

/** Read a response body to the end, telling onBytes(n) of every chunk; gives up when no byte comes for stallMs. */
export async function readAll(response, { onBytes, stallMs, setTimer, clearTimer, abort }) {
  const reader = response.body && typeof response.body.getReader === 'function' ? response.body.getReader() : null;
  if (!reader) { const b = new Uint8Array(await response.arrayBuffer()); onBytes(b.length); return b; }
  const chunks = [];
  let n = 0, timer = null, giveUp;
  const why = `no data for ${Math.round(stallMs / 1000)} s`;
  // the stall is its own promise, so giving up does not depend on the stalled read ever answering
  const stall = new Promise((_, reject) => { giveUp = reject; });
  stall.catch(() => {});
  const arm = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => { giveUp(new Error(why)); try { abort(); } catch { /* gone */ } try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* gone */ } }, stallMs);
  };
  arm();
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stall]);
      if (done) break;
      chunks.push(value); n += value.length; onBytes(value.length); arm();
    }
  } finally { if (timer !== null) clearTimer(timer); }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * The job. io: { fetch, subtle, DecompressionStream, Response, Blob, AbortController, setTimeout, clearTimeout }.
 * emit(message, transfer): { type: 'index', packs: [{ name, stage, bytes, files, keys }], startBytes } |
 * { type: 'bytes', name, got (bytes of that pack so far) } | { type: 'pack', name, meshes: [{ key, sourceBytes,
 * sourceSha256, mesh }] } | { type: 'pack-failed', name, error } | { type: 'index-failed', error } | { type: 'done' }.
 * Never throws.
 */
export async function runPackJob({ indexUrl = PACK_DEFAULTS.indexUrl, base = PACK_DEFAULTS.base, expectedIndexSha256 = PACK_INDEX_SHA256, io, emit, stallMs = PACK_STALL_MS, parallel = PACK_PARALLEL }) {
  let packs;
  // a request whose answer does not even begin within stallMs is given up too
  const answered = (promise, abort) => new Promise((resolve, reject) => {
    const timer = io.setTimeout(() => { reject(new Error(`no answer for ${Math.round(stallMs / 1000)} s`)); try { abort(); } catch { /* gone */ } }, stallMs);
    promise.then(v => { io.clearTimeout(timer); resolve(v); }, e => { io.clearTimeout(timer); reject(e); });
  });
  try {
    if (typeof io.DecompressionStream !== 'function' || !io.subtle) throw new Error('this browser cannot inflate packs');
    const r = await answered(io.fetch(indexUrl, { credentials: 'same-origin' }), () => {});
    if (!r.ok) throw new Error(`HTTP ${r.status} for the pack index`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (hex(await io.subtle.digest('SHA-256', bytes)) !== expectedIndexSha256) throw new Error('the pack index is not the pinned one');
    packs = validatePackIndex(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch (err) { emit({ type: 'index-failed', error: text(err) }); emit({ type: 'done' }); return; }
  const startBytes = packs.filter(p => p.stage === 'start').reduce((a, p) => a + p.bytes, 0);
  emit({ type: 'index', packs: packs.map(p => ({ name: p.name, stage: p.stage, bytes: p.bytes, files: p.files, keys: p.keys })), startBytes });
  const one = async p => {
    let got = 0, lastSent = 0;
    try {
      const ac = typeof io.AbortController === 'function' ? new io.AbortController() : null;
      const r = await answered(io.fetch(base + p.file, { credentials: 'same-origin', ...(ac ? { signal: ac.signal } : {}) }), () => ac && ac.abort());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const gz = await readAll(r, { stallMs, setTimer: io.setTimeout, clearTimer: io.clearTimeout, abort: () => ac && ac.abort(),
        onBytes: n => {
          got += n;
          if (got - lastSent > 65536 || got >= p.bytes) { lastSent = got; emit({ type: 'bytes', name: p.name, got }); }
        } });
      if (gz.length !== p.bytes) throw new Error(`${gz.length} bytes, the index says ${p.bytes}`);
      if (hex(await io.subtle.digest('SHA-256', gz)) !== p.sha256) throw new Error('sha256 does not match the pack index');
      const raw = new Uint8Array(await new io.Response(new io.Blob([gz]).stream().pipeThrough(new io.DecompressionStream('gzip'))).arrayBuffer());
      const decoded = decodePack(raw);
      const meshes = [], transfer = [];
      for (const key of p.keys) {
        const rec = decoded.meshes.get(key);
        if (!rec) throw new Error(`the pack has no ${key}`);
        meshes.push(rec); transfer.push(rec.mesh.positions.buffer, rec.mesh.indices.buffer);
      }
      emit({ type: 'pack', name: p.name, meshes }, transfer);
    } catch (err) {
      emit({ type: 'pack-failed', name: p.name, error: text(err) });
    }
  };
  const queue = [...packs.filter(p => p.stage === 'start'), ...packs.filter(p => p.stage !== 'start')];
  let next = 0;
  const lane = async () => { while (next < queue.length) await one(queue[next++]); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, queue.length)) }, lane));
  emit({ type: 'done' });
}

/**
 * Page side. Returns { get(key) -> Promise<packed mesh | null>, state(), stop() }. onProgress(files, of) tells how
 * many of the start packs' files have come so far (a pack counts its files by the share of its bytes received; a
 * failed pack counts none: the page then reads those files one by one); onSettled() is called once every start pack
 * has arrived or failed. Never throws.
 */
export function startPackLoader({ win = globalThis.window, indexUrl = PACK_DEFAULTS.indexUrl, base = PACK_DEFAULTS.base, moduleUrl = import.meta.url,
  workerUrl = new URL('./ns-pack-worker.mjs', import.meta.url), onProgress = null, onSettled = null, useWorker = true } = {}) {
  const st = { mode: 'off', index: 'pending', packs: {}, files: 0, of: null, served: 0, missed: 0, again: 0, errors: [] };
  const abs = u => { try { return new URL(u, new URL(moduleUrl, win.location.href)).href; } catch { return String(u); } };
  let resolveIndex;
  const indexP = new Promise(r => { resolveIndex = r; });   // Map(key -> pack name) | null
  const packP = new Map(), packResolve = new Map();          // name -> Promise<Map(key -> record) | null>
  let worker = null, startLeft = 0, settled = false;
  const tell = () => {
    let files = 0, of = 0;
    for (const p of Object.values(st.packs)) { if (p.stage !== 'start') continue; of += p.files; if (p.status !== 'failed') files += p.files * Math.min(1, p.got / p.bytes); }
    st.files = Math.round(files * 10) / 10; st.of = of;
    if (typeof onProgress === 'function') { try { onProgress(files, of); } catch { /* advisory */ } }
  };
  const settle = () => { if (!settled && startLeft <= 0) { settled = true; if (typeof onSettled === 'function') { try { onSettled(); } catch { /* advisory */ } } } };
  const onMessage = m => {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'index') {
      const where = new Map();
      for (const p of m.packs) {
        st.packs[p.name] = { stage: p.stage, bytes: p.bytes, files: p.files, status: 'loading', got: 0 };
        packP.set(p.name, new Promise(r => packResolve.set(p.name, r)));
        for (const k of p.keys) where.set(k, p.name);
        if (p.stage === 'start') startLeft++;
      }
      st.index = 'ok';
      resolveIndex(where);
      tell();
    } else if (m.type === 'index-failed') {
      st.index = 'failed'; st.errors.push(`index: ${m.error}`);
      resolveIndex(null); startLeft = 0; settle();
    } else if (m.type === 'bytes') {
      const rec = st.packs[m.name];
      if (rec) { rec.got = m.got; tell(); }
    } else if (m.type === 'pack' || m.type === 'pack-failed') {
      const rec = st.packs[m.name], res = packResolve.get(m.name);
      if (!rec || !res) return;
      if (m.type === 'pack') { rec.status = 'ok'; rec.got = rec.bytes; res(new Map(m.meshes.map(x => [x.key, x]))); }
      else { rec.status = 'failed'; rec.error = m.error; st.errors.push(`${m.name}: ${m.error}`); res(null); }
      tell();
      if (rec.stage === 'start') { startLeft--; settle(); }
    } else if (m.type === 'done') {
      for (const [name, res] of packResolve) { if (st.packs[name].status === 'loading') { st.packs[name].status = 'failed'; res(null); } }
      startLeft = 0; settle();
      if (worker) { try { worker.terminate(); } catch { /* gone */ } worker = null; }
    }
  };
  const fallBack = why => { if (st.index === 'pending') onMessage({ type: 'index-failed', error: why }); else st.errors.push(why); onMessage({ type: 'done' }); };
  try {
    if (useWorker && typeof win.Worker === 'function') {
      worker = new win.Worker(workerUrl, { type: 'module' });
      st.mode = 'worker';
      worker.onmessage = ev => onMessage(ev.data);
      worker.onerror = ev => { fallBack(`worker: ${text(ev && ev.message || 'error')}`); };
      worker.postMessage({ type: 'start', indexUrl: abs(indexUrl), base: abs(base) });
    } else {
      st.mode = 'page';
      runPackJob({ indexUrl: abs(indexUrl), base: abs(base), emit: m => onMessage(m),
        io: { fetch: win.fetch.bind(win), subtle: win.crypto && win.crypto.subtle, DecompressionStream: win.DecompressionStream, Response: win.Response, Blob: win.Blob,
          AbortController: win.AbortController, setTimeout: win.setTimeout.bind(win), clearTimeout: win.clearTimeout.bind(win) } });
    }
  } catch (err) { st.mode = 'off'; fallBack(text(err)); }
  return {
    /** The packed mesh for `<packet>/meshes/<file>.obj`, once; null = read the file itself. */
    async get(key) {
      const where = await indexP;
      const name = where && where.get(key);
      if (!name) { st.missed++; return null; }
      const pack = await packP.get(name);
      const rec = pack && pack.get(key);
      if (!rec) { if (pack) st.again++; else st.missed++; return null; }
      pack.delete(key); // each mesh is handed out once (the game owns it from here); a second request reads the file
      st.served++;
      return packedMesh(rec);
    },
    state: () => JSON.parse(JSON.stringify(st)),
    stop() { if (worker) { try { worker.terminate(); } catch { /* gone */ } worker = null; } }
  };
}
