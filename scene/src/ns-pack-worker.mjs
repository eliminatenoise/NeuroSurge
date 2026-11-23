/** NeuroSurge mesh-pack worker: runs ns-pack-loader runPackJob off the page's own thread (download, hash check,
 * inflate, decode) and posts its messages back, the meshes' arrays transferred, not copied.
 * Message in: { type: 'start', indexUrl, base } (absolute URLs). Messages out: see runPackJob. */
import { runPackJob } from './ns-pack-loader.mjs';

self.onmessage = ev => {
  const m = ev.data || {};
  if (m.type !== 'start') return;
  self.postMessage({ type: 'hello' }); // the worker's script is in and running (the page waits only so long for this)
  runPackJob({ indexUrl: m.indexUrl, base: m.base, expectedIndexSha256: m.expectedIndexSha256, codec: m.codec, emit: (msg, transfer) => self.postMessage(msg, transfer || []),
    io: { fetch: self.fetch.bind(self), subtle: self.crypto && self.crypto.subtle, DecompressionStream: self.DecompressionStream, Response: self.Response, Blob: self.Blob,
      AbortController: self.AbortController, setTimeout: self.setTimeout.bind(self), clearTimeout: self.clearTimeout.bind(self) } })
    .catch(err => self.postMessage({ type: 'index-failed', error: String(err && err.message || err) }));
};
