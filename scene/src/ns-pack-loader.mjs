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
 * Nothing here waits for ever: a request (the index, a pack, the rig file) that brings no answer for PACK_ANSWER_MS,
 * or no further byte for PACK_STALL_MS, is given up and its files are read the old way. Those two limits are long on
 * purpose. Giving a pack up costs tens of megabytes of OBJ files, and on a slow line a pack's answer can be many
 * seconds in coming only because the game's scripts are ahead of it in the queue (tried with 4 s and 6 s on a
 * 2 Mbit/s line: three packs that were merely waiting their turn were dropped and the load took minutes).
 * A request that fails QUICKLY (an error answer, a broken connection, the wrong bytes) is asked for once more, past
 * the browser's cache, so a copy left over from an earlier version of the game is replaced, not taken for a failure.
 *
 * The body rig file goes with the coarse meshes of the body (packs/README.md "The rig file"). If it cannot be had,
 * the body's meshes are NOT taken from the packs: get() gives null for them, the launcher reads the source OBJ files
 * and the game estimates the rig from those, which gives the right rig (slow, but not a quietly different body).
 */
import { decodePack, validatePackIndex, packIndexRig, packedMesh, PACK_INDEX_SHA256, PACK_DEFAULTS } from './ns-pack.mjs';

export const PACK_ANSWER_MS = 15000; // a request's answer must begin within this
export const PACK_STALL_MS = 15000;  // ... and then no pause between bytes may last this long
/** At most this many packs on the line at once (they come one after another; a pack that has gone quiet for
 * PACK_QUIET_MS no longer holds the next one back, but still counts here until it is whole or given up). */
export const PACK_PARALLEL = 3;
export const PACK_QUIET_MS = 2000;
/** The next pack is asked for when the one before has less than this many seconds of bytes left at its rate. */
export const PACK_LEAD_S = 0.3;
/** The worker must say hello within this, or the same job is run on the page (a worker script that never arrives
 * would otherwise leave every mesh waiting for ever). */
export const PACK_WORKER_HELLO_MS = 8000;
/** The packs whose meshes the body rig is made of (so they are used only together with the rig file). */
export const PACK_NEEDS_RIG = Object.freeze(['fullbody', 'head', 'face-muscles', 'missing-muscles']);

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
 * sourceSha256, mesh }] } | { type: 'pack-failed', name, error } | { type: 'index-failed', error } |
 * { type: 'rig', file } | { type: 'rig-failed', error } (the body rig file, ns-body bodyRigFromFile) |
 * { type: 'again', what, error } (a first request failed and is made once more) | { type: 'done' }.
 * Never throws.
 */
export async function runPackJob({ indexUrl = PACK_DEFAULTS.indexUrl, base = PACK_DEFAULTS.base, expectedIndexSha256 = PACK_INDEX_SHA256, codec = 'gzip', io, emit, stallMs = PACK_STALL_MS, answerMs = Math.min(PACK_ANSWER_MS, stallMs), parallel = PACK_PARALLEL, quietMs = PACK_QUIET_MS }) {
  let packs, rigFile = null;
  // One request, whole and checked: the answer must begin within waitMs, no pause between bytes may last stallMs, and
  // the bytes must have the expected length and SHA-256 (where given). Throws otherwise.
  const whole = async (url, { bytes = null, sha256 = null, onBytes = () => {}, waitMs, cache }) => {
    const ac = typeof io.AbortController === 'function' ? new io.AbortController() : null;
    const abort = () => { try { if (ac) ac.abort(); } catch { /* gone */ } };
    const r = await new Promise((resolve, reject) => {
      const timer = io.setTimeout(() => { reject(Object.assign(new Error(`no answer for ${Math.round(waitMs / 100) / 10} s`), { slow: true })); abort(); }, waitMs);
      Promise.resolve().then(() => io.fetch(url, { credentials: 'same-origin', ...(cache ? { cache } : {}), ...(ac ? { signal: ac.signal } : {}) }))
        .then(v => { io.clearTimeout(timer); resolve(v); }, e => { io.clearTimeout(timer); reject(e); });
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let got;
    try { got = await readAll(r, { stallMs, setTimer: io.setTimeout, clearTimer: io.clearTimeout, abort, onBytes }); }
    catch (err) { throw /^no data for/.test(text(err)) ? Object.assign(err, { slow: true }) : err; }
    if (bytes !== null && got.length !== bytes) throw new Error(`${got.length} bytes, the index says ${bytes}`);
    if (sha256 !== null && hex(await io.subtle.digest('SHA-256', got)) !== sha256) throw new Error('sha256 does not match');
    return got;
  };
  // ... and once more, past the browser's cache, when the first request fails quickly (not when it was given up for
  // being silent: a second wait would only double the time before the files are read the old way)
  const twice = async (what, url, opts) => {
    try { return await whole(url, { ...opts, waitMs: answerMs }); }
    catch (err) {
      if (err && err.slow) throw err;
      emit({ type: 'again', what, error: text(err) });
      if (typeof opts.onAgain === 'function') opts.onAgain();
      return whole(url, { ...opts, waitMs: answerMs, cache: 'reload' });
    }
  };
  let rawSizes, decode;
  try {
    if (!io.subtle || (codec === 'gzip' && typeof io.DecompressionStream !== 'function')) throw new Error('this browser cannot inflate packs');
    if (codec === 'brotli') {
      try { new io.DecompressionStream('brotli'); }
      catch { decode = (await import('../../lite/brotli.mjs')).decodeLiteBrotli; }
    }
    let bytes;
    try { bytes = await twice('index', indexUrl, { sha256: expectedIndexSha256 }); }
    catch (err) { throw new Error(/sha256/.test(text(err)) ? 'the pack index is not the pinned one' : `${text(err)} for the pack index`); }
    const index = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    packs = validatePackIndex(index);
    rawSizes = new Map(index.packs.map(pack => [pack.name, pack.rawBytes]));
    rigFile = packIndexRig(index);
  } catch (err) { emit({ type: 'index-failed', error: text(err) }); emit({ type: 'done' }); return; }
  const startBytes = packs.filter(p => p.stage === 'start').reduce((a, p) => a + p.bytes, 0);
  emit({ type: 'index', packs: packs.map(p => ({ name: p.name, stage: p.stage, bytes: p.bytes, files: p.files, keys: p.keys })), startBytes });
  // (onByte: every chunk of this pack; onWhole: its bytes are all in, or it failed; it is then inflated and decoded)
  const one = async (p, { onByte = null, onWhole = null } = {}) => {
    let got = 0, lastSent = 0;
    try {
      let compressed;
      try {
        compressed = await twice(p.name, base + p.file, { bytes: p.bytes, sha256: p.sha256, onAgain: () => { got = 0; lastSent = 0; },
          onBytes: n => {
            got += n;
            if (onByte) onByte(got, p.bytes);
            if (got - lastSent > 65536 || got >= p.bytes) { lastSent = got; emit({ type: 'bytes', name: p.name, got }); }
          } });
      } finally { if (onWhole) onWhole(); }
      const rawBytes = rawSizes.get(p.name);
      if (codec === 'brotli' && !(Number.isSafeInteger(rawBytes) && rawBytes > 0)) throw new Error('missing uncompressed pack size');
      const raw = decode ? decode(compressed, rawBytes)
        : new Uint8Array(await new io.Response(new io.Blob([compressed]).stream().pipeThrough(new io.DecompressionStream(codec))).arrayBuffer());
      if (codec === 'brotli' && raw.byteLength !== rawBytes) throw new Error('uncompressed pack size mismatch');
      const decoded = decodePack(raw);
      const meshes = [], transfer = [];
      for (const key of p.keys) {
        const rec = decoded.meshes.get(key);
        if (!rec) throw new Error(`the pack has no ${key}`);
        meshes.push(rec); transfer.push(rec.mesh.positions.buffer, rec.mesh.indices.buffer);
      }
      emit({ type: 'pack', name: p.name, meshes }, transfer);
    } catch (err) {
      emit({ type: 'pack-failed', name: p.name, error: /sha256/.test(text(err)) ? 'sha256 does not match the pack index' : text(err) });
    }
  };
  const queue = [...packs.filter(p => p.stage === 'start'), ...packs.filter(p => p.stage !== 'start')];
  // the body rig made from the source meshes (a small JSON file; its bytes must match the index too)
  const startRig = async () => {
    if (!rigFile) { emit({ type: 'rig-failed', error: 'the index names no rig file' }); return; }
    try {
      const bytes = await twice('rig', base + rigFile.file, { bytes: rigFile.bytes, sha256: rigFile.sha256 });
      emit({ type: 'rig', file: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) });
    } catch (err) { emit({ type: 'rig-failed', error: /sha256|bytes, the index/.test(text(err)) ? 'the rig file does not match the pack index' : text(err) }); }
  };
  // 20 November 2026: the packs come ONE AFTER ANOTHER, in the index's order (the arm and the brain, the body, the head,
  // the face, the missing muscles: the order the game builds them in, and the loading picture begins with the brain from
  // its core). On a slow line the packs share the line with each other and with the game's scripts; three at once made
  // the first whole only after about 3.3 MB of packs (measured at 600 kB/s from a host that compresses the scripts, as
  // GitHub Pages does: the head pack at 7.4 s, the arm and brain at 9.2 s, the body at 12.5 s). The next pack starts the
  // moment the last byte of the one before is in (that one is inflated and decoded meanwhile), or as soon as the one
  // before has brought no byte for PACK_QUIET_MS, so a pack that stalls does not hold the others back for the whole time
  // it is given; at most `parallel` are on the line at once. The rig file comes with the second pack. The total to
  // download is the same. The next pack is asked for a little BEFORE the last byte of the one before is due (when, at
  // the rate it is coming, less than PACK_LEAD_S of it is left), so the line does not stand idle for a request's round
  // trip between packs (measured: one after another without that lead, the last pack came 0.3 s later than three at
  // once, four round trips of idle line).
  const jobs = [];
  let rigJob = null, downloading = 0, wake = null;
  for (let i = 0; i < queue.length; i++) {
    while (downloading >= Math.max(1, parallel)) await new Promise(r => { wake = r; });
    downloading++;
    let open = true, lastByte = Date.now(), release = null, firstAt = null, firstGot = 0;
    const opened = new Promise(r => { release = r; });
    const free = () => { if (open) { open = false; release(); } };
    const watch = () => { if (!open) return; if (Date.now() - lastByte >= quietMs) free(); else io.setTimeout(watch, Math.min(500, quietMs)); };
    io.setTimeout(watch, Math.min(500, quietMs));
    jobs.push(one(queue[i], { onByte: (got, total) => {
      const now = Date.now(); lastByte = now;
      if (firstAt === null) { firstAt = now; firstGot = got; return; }
      const dt = (now - firstAt) / 1000;
      if (dt >= 0.2 && total - got <= ((got - firstGot) / dt) * PACK_LEAD_S) free();
    },
      onWhole: () => { free(); downloading--; if (wake) { const w = wake; wake = null; w(); } } }));
    await opened;
    if (i === 0) rigJob = startRig();
  }
  if (!rigJob) rigJob = startRig();
  await Promise.all([...jobs, rigJob]);
  emit({ type: 'done' });
}

/**
 * Page side. Returns { get(key) -> Promise<packed mesh | null>, onPack(fn), state(), stop() }. onProgress(files, of)
 * tells how many of the start packs' files have come so far (a pack counts its files by the share of its bytes
 * received; a failed pack counts none: the page then reads those files one by one); onSettled() is called once every
 * start pack has arrived or failed. Never throws.
 * onPack(fn) (20 November 2026, the loading picture: ns-assembly notePack): fn(name, [{ key, mesh }]) is called with
 * the meshes of every pack the moment it arrives, before the game is given any of them (and at once with those of
 * packs that came before fn was set). fn must not change the meshes: they are the game's (the picture copies them).
 */
export function startPackLoader({ win = globalThis.window, indexUrl = PACK_DEFAULTS.indexUrl, base = PACK_DEFAULTS.base, moduleUrl = import.meta.url,
  expectedIndexSha256 = PACK_INDEX_SHA256, codec = 'gzip',
  workerUrl = new URL('./ns-pack-worker.mjs', import.meta.url), onProgress = null, onSettled = null, useWorker = true, helloMs = PACK_WORKER_HELLO_MS } = {}) {
  const packWatchers = [], arrived = []; // onPack listeners; the packs that came so far, [name, records] (for a late listener)
  const tellPack = (name, records, fns = packWatchers) => { for (const fn of fns) { try { fn(name, records); } catch { /* the picture only */ } } };
  const st = { mode: 'off', index: 'pending', packs: {}, rig: 'pending', files: 0, of: null, served: 0, missed: 0, again: 0, asked2: [], withoutRig: 0, errors: [] };
  const abs = u => { try { return new URL(u, new URL(moduleUrl, win.location.href)).href; } catch { return String(u); } };
  let resolveRig;
  const rigP = new Promise(r => { resolveRig = r; }); // the rig file's content | null
  let resolveIndex;
  const indexP = new Promise(r => { resolveIndex = r; });   // Map(key -> pack name) | null
  const packP = new Map(), packResolve = new Map();          // name -> Promise<Map(key -> record) | null>
  let worker = null, startLeft = 0, settled = false;
  const tell = () => {
    let files = 0, of = 0;
    // (a pack that failed counts none of its files, and neither does a body pack once the rig file is known to be
    // missing: the page then reads those files one by one and counts them itself)
    for (const [name, p] of Object.entries(st.packs)) { if (p.stage !== 'start') continue; of += p.files; if (p.status !== 'failed' && !(st.rig === 'failed' && PACK_NEEDS_RIG.includes(name))) files += p.files * Math.min(1, p.got / p.bytes); }
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
    } else if (m.type === 'rig') {
      st.rig = 'ok'; resolveRig(m.file);
    } else if (m.type === 'rig-failed') {
      st.rig = 'failed'; st.errors.push(`rig: ${m.error}`); resolveRig(null); tell();
    } else if (m.type === 'again') {
      st.asked2.push(`${m.what}: ${m.error}`);
    } else if (m.type === 'bytes') {
      const rec = st.packs[m.name];
      if (rec) { rec.got = m.got; tell(); }
    } else if (m.type === 'pack' || m.type === 'pack-failed') {
      const rec = st.packs[m.name], res = packResolve.get(m.name);
      if (!rec || !res) return;
      if (m.type === 'pack') {
        rec.status = 'ok'; rec.got = rec.bytes;
        const map = new Map(m.meshes.map(x => [x.key, x]));
        // the loading picture first, synchronously, before any get() waiting for this pack goes on (a picture only: it
        // shows a body pack's meshes even if the rig file is then missing and the game reads the source files instead)
        if (packWatchers.length) tellPack(m.name, m.meshes); else arrived.push([m.name, m.meshes, map]);
        res(map);
      }
      else { rec.status = 'failed'; rec.error = m.error; st.errors.push(`${m.name}: ${m.error}`); res(null); }
      tell();
      if (rec.stage === 'start') { startLeft--; settle(); }
    } else if (m.type === 'done') {
      for (const [name, res] of packResolve) { if (st.packs[name].status === 'loading') { st.packs[name].status = 'failed'; res(null); } }
      startLeft = 0; settle();
      if (st.rig === 'pending') { st.rig = 'failed'; resolveRig(null); tell(); }
      if (worker) { try { worker.terminate(); } catch { /* gone */ } worker = null; }
    }
  };
  const fallBack = why => { if (st.index === 'pending') onMessage({ type: 'index-failed', error: why }); else st.errors.push(why); onMessage({ type: 'done' }); };
  const source = { indexUrl: abs(indexUrl), base: abs(base), expectedIndexSha256, codec };
  const onPage = () => {
    st.mode = 'page';
    runPackJob({ ...source, emit: m => onMessage(m),
      io: { fetch: win.fetch.bind(win), subtle: win.crypto && win.crypto.subtle, DecompressionStream: win.DecompressionStream, Response: win.Response, Blob: win.Blob,
        AbortController: win.AbortController, setTimeout: win.setTimeout.bind(win), clearTimeout: win.clearTimeout.bind(win) } });
  };
  try {
    if (useWorker && typeof win.Worker === 'function') {
      worker = new win.Worker(workerUrl, { type: 'module' });
      st.mode = 'worker';
      // a worker whose script never arrives says nothing, not even an error: after helloMs the job runs on the page
      let hello = false;
      const noHello = win.setTimeout(() => {
        if (hello || !worker) return;
        st.errors.push(`worker: no word for ${Math.round(helloMs / 1000)} s; the packs are read on the page`);
        try { worker.terminate(); } catch { /* gone */ } worker = null;
        try { onPage(); } catch (err) { st.mode = 'off'; fallBack(text(err)); }
      }, helloMs);
      worker.onmessage = ev => { if (!hello) { hello = true; try { win.clearTimeout(noHello); } catch { /* gone */ } } onMessage(ev.data); };
      worker.onerror = ev => { hello = true; try { win.clearTimeout(noHello); } catch { /* gone */ } fallBack(`worker: ${text(ev && ev.message || 'error')}`); };
      worker.postMessage({ type: 'start', ...source });
    } else onPage();
  } catch (err) { st.mode = 'off'; fallBack(text(err)); }
  return {
    /** The packed mesh for `<packet>/meshes/<file>.obj`, once; null = read the file itself. */
    async get(key) {
      const where = await indexP;
      const name = where && where.get(key);
      if (!name) { st.missed++; return null; }
      // the body's coarse meshes only together with the rig made from their sources (see the head of this file)
      if (PACK_NEEDS_RIG.includes(name) && (await rigP) === null) { st.withoutRig++; return null; }
      const pack = await packP.get(name);
      const rec = pack && pack.get(key);
      if (!rec) { if (pack) st.again++; else st.missed++; return null; }
      pack.delete(key); // each mesh is handed out once (the game owns it from here); a second request reads the file
      if (pack.size === 0) { const i = arrived.findIndex(a => a[2] === pack); if (i >= 0) arrived.splice(i, 1); } // nothing left to show late
      st.served++;
      return packedMesh(rec);
    },
    /** The body rig file (made from the source meshes), or null when it cannot be had. */
    rig: () => rigP,
    /** See the head of startPackLoader: fn(name, [{ key, mesh }]) for every pack as it arrives. The first listener is
     * also given, at once, the meshes of packs that came before it that the game has not taken yet (a mesh the game
     * has taken may already have been changed by it; the launcher shows those itself as it hands them over). */
    onPack(fn) {
      if (typeof fn !== 'function') return;
      packWatchers.push(fn);
      if (packWatchers.length === 1) for (const [name, records, map] of arrived.splice(0)) tellPack(name, records.filter(x => map.has(x.key)), [fn]);
    },
    state: () => JSON.parse(JSON.stringify(st)),
    stop() { arrived.length = 0; if (worker) { try { worker.terminate(); } catch { /* gone */ } worker = null; } }
  };
}
