/** NeuroSurge mesh-pack worker: runs ns-pack-loader runPackJob off the page's own thread (download, hash check,
 * inflate, decode) and posts its messages back, the meshes' arrays transferred, not copied.
 * Message in: { type: 'start', indexUrl, base } (absolute URLs). Messages out: see runPackJob. */
import { runPackJob } from './ns-pack-loader.mjs';

self.onmessage = ev => {
  const m = ev.data || {};
  if (m.type !== 'start') return;
  runPackJob({ indexUrl: m.indexUrl, base: m.base, emit: (msg, transfer) => self.postMessage(msg, transfer || []),
    io: { fetch: self.fetch.bind(self), subtle: self.crypto && self.crypto.subtle, DecompressionStream: self.DecompressionStream, Response: self.Response, Blob: self.Blob,
      AbortController: self.AbortController, setTimeout: self.setTimeout.bind(self), clearTimeout: self.clearTimeout.bind(self) } })
    .catch(err => self.postMessage({ type: 'index-failed', error: String(err && err.message || err) }));
};
