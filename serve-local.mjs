#!/usr/bin/env node
// NeuroSurge local static server (Node >= 18, no dependencies). Project-owned code: CC0 1.0.
//
//   node serve-local.mjs [--root DIR] [--port N] [--quiet]
//   node serve-local.mjs --verify [--root DIR]      (check every file against SHA256SUMS, then exit)
//
// Serves ONE folder (default: the folder this file is in, i.e. the NeuroSurge distribution) to THIS computer only:
// it binds 127.0.0.1, never 0.0.0.0, so nothing on your network can connect. Without --port the operating system
// picks a free port. Press Ctrl+C to stop. Only GET/HEAD; no directory listings; no dotfiles; every path is checked
// to stay inside the folder; requests whose Host header is not this loopback address are refused (DNS-rebinding
// protection). A Content-Security-Policy keeps the page from contacting any other origin.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const HOST = '127.0.0.1';

export const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.obj': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream'
});
/** Extension-less files served as text (licence and checksum files). */
const TEXT_NAMES = new Set(['LICENSE', 'SHA256SUMS', 'NOTICE', 'README']);

/** Same-origin only: no request may leave the page (the game is fully client-side). */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': `${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), bluetooth=()',
  'Cache-Control': 'no-cache'
});

export function contentTypeFor(filePath) {
  const base = path.basename(filePath);
  if (TEXT_NAMES.has(base)) return 'text/plain; charset=utf-8';
  return MIME[path.extname(base).toLowerCase()] || 'application/octet-stream';
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

/**
 * Map a request target to path segments, or return an HTTP status for a refused target.
 * Refuses NUL, backslashes, encoded slashes, '.'/'..' segments, dotfiles and ':' (Windows drive/stream syntax).
 */
export function segmentsFor(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/')) return { status: 400 };
  const q = rawUrl.search(/[?#]/);
  const rawPath = q >= 0 ? rawUrl.slice(0, q) : rawUrl;
  if (/%2f|%5c|%00/i.test(rawPath) || rawPath.includes('\\')) return { status: 400 };
  const segments = [];
  const parts = rawPath.split('/');
  for (let i = 1; i < parts.length; i++) {
    let seg;
    try { seg = decodeURIComponent(parts[i]); } catch { return { status: 400 }; }
    if (seg === '' ) { if (i === parts.length - 1) break; continue; }
    if (seg === '.' || seg === '..') return { status: 400 };
    if (seg.includes('\0') || seg.includes('/') || seg.includes('\\') || seg.includes(':')) return { status: 400 };
    if (seg.startsWith('.')) return { status: 404 };
    segments.push(seg);
  }
  return { segments, trailingSlash: rawPath.endsWith('/'), query: q >= 0 ? rawUrl.slice(q) : '' };
}

/**
 * Request handler. `root` must be an existing directory; `allowedHosts` (Set of "host:port") enables the Host check.
 * Usable without a listening socket (it only needs req.method, req.url, req.headers and a writable res).
 */
export function createHandler({ root, allowedHosts = null, log = () => {} }) {
  const rootReal = fs.realpathSync(root);
  const send = (res, status, text, extra = {}) => {
    const body = Buffer.from(text + '\n', 'utf8');
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length, ...extra });
    res.end(res.req && res.req.method === 'HEAD' ? undefined : body);
  };
  return async function handle(req, res) {
    res.req = res.req || req;
    const done = status => log(`${status} ${req.method} ${String(req.url).slice(0, 200)}`);
    try {
      if (allowedHosts && !allowedHosts.has(String(req.headers.host || '').toLowerCase())) { send(res, 421, 'Misdirected request'); return done(421); }
      if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' }); return done(405); }
      const target = segmentsFor(req.url);
      if (target.status) { send(res, target.status, target.status === 404 ? 'Not found' : 'Bad request'); return done(target.status); }
      let fsPath = path.join(rootReal, ...target.segments);
      if (!isInside(fsPath, rootReal)) { send(res, 404, 'Not found'); return done(404); }
      let real = await fsp.realpath(fsPath).catch(() => null);
      if (!real || !isInside(real, rootReal)) { send(res, 404, 'Not found'); return done(404); }
      let st = await fsp.stat(real);
      if (st.isDirectory()) {
        const index = path.join(real, 'index.html');
        const indexReal = await fsp.realpath(index).catch(() => null);
        const indexStat = indexReal && isInside(indexReal, rootReal) ? await fsp.stat(indexReal).catch(() => null) : null;
        if (!indexStat || !indexStat.isFile()) { send(res, 404, 'Not found'); return done(404); } // no directory listings
        if (!target.trailingSlash) {
          const loc = '/' + target.segments.map(encodeURIComponent).join('/') + (target.segments.length ? '/' : '') + target.query;
          send(res, 301, 'Moved', { Location: loc }); return done(301);
        }
        real = indexReal; st = indexStat; fsPath = index;
      }
      if (!st.isFile()) { send(res, 404, 'Not found'); return done(404); }
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': contentTypeFor(real), 'Content-Length': st.size });
      if (req.method === 'HEAD') { res.end(); return done(200); }
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(real);
        stream.on('error', reject);
        res.on('close', () => { stream.destroy(); resolve(); });
        stream.on('end', resolve);
        stream.pipe(res);
      });
      return done(200);
    } catch (e) {
      if (!res.headersSent) send(res, 500, 'Internal error'); else res.destroy();
      log(`500 ${req.method} ${String(req.url).slice(0, 200)} ${e && e.message}`);
    }
  };
}

/** Files a git copy of the distribution carries at its top level that are not part of the game. --verify lists them
 * separately (not checked, not a problem) instead of reporting them as unlisted. `.git` is never walked. */
export const REPO_OWN_TOP_LEVEL = Object.freeze(['README.md', 'LICENSE', 'PROJECT-CONTEXT.json', '.gitignore', '.gitattributes', '.git']);

/** Check every file listed in <root>/SHA256SUMS (and that nothing unlisted is present, apart from the top-level
 * repository files in REPO_OWN_TOP_LEVEL, which are returned in `repo_files`). */
export async function verifyAgainstSums(root) {
  const text = await fsp.readFile(path.join(root, 'SHA256SUMS'), 'utf8');
  const listed = new Map();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (!m) throw new Error(`SHA256SUMS: bad line ${line.slice(0, 80)}`);
    listed.set(m[2], m[1]);
  }
  const problems = [], repoFiles = [];
  for (const [rel, want] of listed) {
    const abs = path.join(root, ...rel.split('/'));
    if (!isInside(abs, root)) { problems.push(`${rel}: outside the folder`); continue; }
    const st = await fsp.lstat(abs).catch(() => null);
    if (!st || !st.isFile()) { problems.push(`${rel}: missing or not a regular file`); continue; }
    const got = createHash('sha256').update(await fsp.readFile(abs)).digest('hex');
    if (got !== want) problems.push(`${rel}: sha256 mismatch`);
  }
  const walk = async (dir, rel) => {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (!rel && !listed.has(r) && REPO_OWN_TOP_LEVEL.includes(e.name) && (e.isFile() || (e.name === '.git' && e.isDirectory()))) { repoFiles.push(r); continue; }
      if (e.isSymbolicLink()) problems.push(`${r}: symlink`);
      else if (e.isDirectory()) await walk(path.join(dir, e.name), r);
      else if (r !== 'SHA256SUMS' && !listed.has(r)) problems.push(`${r}: not listed in SHA256SUMS`);
    }
  };
  await walk(root, '');
  return { files: listed.size, problems, repo_files: repoFiles.sort() };
}

function parseCli(argv) {
  const out = { root: path.dirname(fileURLToPath(import.meta.url)), port: 0, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--verify') out.verify = true;
    else if (a === '--root' || a.startsWith('--root=')) out.root = path.resolve(val());
    else if (a === '--port' || a.startsWith('--port=')) {
      const v = val();
      if (!/^\d{1,5}$/.test(v) || +v > 65535) throw new Error(`--port must be 0-65535 (got ${v})`);
      out.port = +v;
    } else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

async function main() {
  let opts;
  try { opts = parseCli(process.argv.slice(2)); } catch (e) { console.error(`serve-local: ${e.message}`); process.exitCode = 2; return; }
  if (opts.help) {
    console.log('usage: node serve-local.mjs [--root DIR] [--port N] [--quiet]\n' +
      '       node serve-local.mjs --verify [--root DIR]\n' +
      `Serves DIR (default: this file's folder) on http://${HOST}:<port>/ for this computer only. Ctrl+C stops it.`);
    return;
  }
  if (opts.verify) {
    try {
      const r = await verifyAgainstSums(fs.realpathSync(opts.root));
      if (r.problems.length) { console.error(`serve-local: ${r.problems.length} problem(s):\n  ${r.problems.slice(0, 40).join('\n  ')}`); process.exitCode = 1; }
      else console.log(`OK: all ${r.files} files listed in SHA256SUMS match and nothing else is present` +
        (r.repo_files.length ? ` (apart from the repository's own files, which are not part of the game: ${r.repo_files.join(', ')}).` : '.'));
    } catch (e) { console.error(`serve-local: verify failed: ${e.message}`); process.exitCode = 1; }
    return;
  }
  const st = await fsp.stat(opts.root).catch(() => null);
  if (!st || !st.isDirectory()) { console.error(`serve-local: not a directory: ${opts.root}`); process.exitCode = 2; return; }
  if (!fs.existsSync(path.join(opts.root, 'scene', 'example', 'index.html'))) {
    console.error(`serve-local: ${opts.root} does not look like a NeuroSurge distribution (scene/example/index.html is missing).\n` +
      'Run this file from inside the built distribution folder, or pass --root <dist-folder>.');
    process.exitCode = 2; return;
  }
  const allowedHosts = new Set();
  const handler = createHandler({ root: opts.root, allowedHosts, log: opts.quiet ? () => {} : m => console.log(m) });
  const server = http.createServer(handler);
  server.on('error', e => {
    console.error(e.code === 'EADDRINUSE' ? `serve-local: port ${opts.port} is already in use; omit --port to pick a free one.` : `serve-local: ${e.message}`);
    process.exitCode = 1;
  });
  server.listen({ host: HOST, port: opts.port, exclusive: true }, () => {
    const { port } = server.address();
    for (const h of [`${HOST}:${port}`, `localhost:${port}`]) allowedHosts.add(h);
    console.log(`NeuroSurge is being served from ${opts.root}`);
    console.log(`Open  http://${HOST}:${port}/  in Chrome, Edge, Firefox or Safari (this computer only). Press Ctrl+C to stop.`);
  });
  const stop = () => { server.close(); setTimeout(() => process.exit(0), 300).unref(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

const invokedPath = process.argv[1] ? (() => { try { return fs.realpathSync(process.argv[1]); } catch { return path.resolve(process.argv[1]); } })() : null;
if (invokedPath && invokedPath === fs.realpathSync(fileURLToPath(import.meta.url))) main();
