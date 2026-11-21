/** NeuroSurge mesh packs (19 November 2026; the owner: "Game should not take long to load at all. Minutes are a
 * liability. Perhaps game is way too big at the moment").
 *
 * The game's anatomy is 691 OBJ text files (about 166 MB; the published host serves them uncompressed, one request
 * each). The game reads only the vertex positions and the triangles of each file. A mesh pack holds exactly that for
 * every file of one source packet, in a compact binary form: each coordinate as a whole number of 1/scale mm (the
 * files are written with a few decimals), the difference to the vertex before it, as a variable-length integer; each
 * triangle corner as a difference too; the whole then gzip-compressed (the page inflates it itself with
 * DecompressionStream, so nothing depends on what the host compresses).
 *
 * LOSSLESS: decodePack() returns, for every file, the very mesh ns-assets parseObjFast() returns for the source file
 * (positions bit for bit, indices, the counts, the bounds and the comment lines, which carry each file's own licence
 * notice). tools/build-mesh-packs.mjs makes the packs from the source packets and refuses any value that would not
 * come back exactly; tests/pack.test.mjs decodes every committed pack and compares every mesh with the parsed source
 * file. The source packets, their manifests, hashes and licence records stay in the repository unchanged.
 *
 * HASHES: each pack entry records the byte count and the SHA-256 of the source file it was made from. The game's
 * loaders (ns-assets readVerified) still compare both with their pinned manifests, file by file, before a mesh is
 * used; a pack is only decoded after its own bytes matched the SHA-256 in packs/PACK-INDEX.json, and that index is
 * only used after its bytes matched PACK_INDEX_SHA256 below. So the chain is: pinned index -> pack bytes -> recorded
 * source hash of each mesh -> the manifest's pinned hash of that source file.
 *
 * Pure (no DOM, no Node): encodePack / decodePack work on plain bytes; the caller compresses and inflates.
 */

export const PACK_FORMAT = 'ns-mesh-pack-1';
/** The SHA-256 of packs/PACK-INDEX.json as committed (tools/build-mesh-packs.mjs writes this line; tests/pack.test.mjs
 * checks it). The index is refused, and the game reads the source files instead, when its bytes do not match. */
export const PACK_INDEX_SHA256 = '2de73c341a2a417a079c24f7af63e00dba14e657893c155e0b12052cbf620d64';
export const PACK_DEFAULTS = Object.freeze({ indexUrl: '../../packs/PACK-INDEX.json', base: '../../packs/' });
export const PACK_INDEX_FORMAT = 'ns-mesh-pack-index-1';
const MAGIC = [0x4e, 0x53, 0x50, 0x4b, 0x31, 0x0a]; // "NSPK1\n"
/** The scales tried for a file's coordinates (units per mm), smallest first; 0 means raw 32-bit floats. */
export const PACK_SCALES = Object.freeze([1, 10, 100, 1000, 10000, 100000, 1000000]);

const fail = msg => { throw new Error(`ns:pack: ${msg}`); };
const zig = n => (n < 0 ? -2 * n - 1 : 2 * n);
const unzig = u => (u % 2 ? -(u + 1) / 2 : u / 2);

/** A growing byte writer with unsigned variable-length integers (7 bits a byte; values below 2^53). */
function writer(initial = 1 << 16) {
  let buf = new Uint8Array(initial), n = 0;
  const need = k => { if (n + k > buf.length) { const b = new Uint8Array(Math.max(buf.length * 2, n + k)); b.set(buf); buf = b; } };
  return {
    varint(u) {
      if (!(u >= 0) || !Number.isSafeInteger(u)) fail('varint out of range');
      need(8);
      while (u >= 128) { buf[n++] = (u % 128) | 128; u = Math.floor(u / 128); }
      buf[n++] = u;
    },
    bytes(b) { need(b.length); buf.set(b, n); n += b.length; },
    done: () => buf.subarray(0, n)
  };
}

/** Is the coordinate v stored exactly as the whole number round(v * s) of 1/s mm? (It must come back as the same
 * 32-bit float; a negative zero does not.) */
const exactAt = (v, s) => { const q = Math.round(v * s); return Number.isSafeInteger(q) && Math.fround(q / s) === v && !(q === 0 && Object.is(v, -0)); };

/** The scale a file's coordinates are stored at: the smallest of PACK_SCALES at which every coordinate comes back bit
 * for bit, a few exceptions allowed (they are stored as raw floats beside the stream: the atlas files write six
 * significant digits, so a handful of coordinates near zero have more decimals than the rest); 0 = raw 32-bit floats.
 * Returns { scale, exceptions: [index, ...] }. */
export function packScaleOf(positions) {
  const allowed = Math.max(2, Math.floor(positions.length / 500));
  outer: for (const s of PACK_SCALES) {
    const exceptions = [];
    for (let i = 0; i < positions.length; i++) {
      if (exactAt(positions[i], s)) continue;
      const q = Math.round(positions[i] * s);
      if (!Number.isSafeInteger(q) || exceptions.length >= allowed) continue outer;
      exceptions.push(i);
    }
    return { scale: s, exceptions };
  }
  return { scale: 0, exceptions: [] };
}

/**
 * Encode meshes into one pack (uncompressed bytes). entries: [{ key, sourceBytes, sourceSha256, mesh }] where key is
 * `<packet>/<path>` and mesh is what parseObjFast returned ({ positions: Float32Array, indices: Uint32Array,
 * vertexCount, faceCount, polygonCount, bounds: { min, max }, comments }). Returns Uint8Array.
 */
export function encodePack({ name, licence = null, entries }) {
  if (typeof name !== 'string' || !Array.isArray(entries)) fail('encodePack needs a name and entries');
  const body = writer(1 << 20);
  const meta = [];
  for (const e of entries) {
    const m = e.mesh, p = m.positions, ix = m.indices;
    if (!(p instanceof Float32Array) || p.length % 3 !== 0) fail(`${e.key}: positions must be a Float32Array of triples`);
    const { scale, exceptions } = packScaleOf(p);
    const start = body.done().length;
    if (scale === 0) body.bytes(new Uint8Array(p.buffer, p.byteOffset, p.byteLength));
    else {
      let px = 0, py = 0, pz = 0;
      for (let i = 0; i < p.length; i += 3) {
        const x = Math.round(p[i] * scale), y = Math.round(p[i + 1] * scale), z = Math.round(p[i + 2] * scale);
        body.varint(zig(x - px)); body.varint(zig(y - py)); body.varint(zig(z - pz));
        px = x; py = y; pz = z;
      }
      // the exceptions: how many, then for each its place (as a difference) and its four raw bytes
      body.varint(exceptions.length);
      let pe = 0;
      const one = new Float32Array(1), oneBytes = new Uint8Array(one.buffer);
      for (const i of exceptions) { body.varint(i - pe); pe = i; one[0] = p[i]; body.bytes(oneBytes); }
    }
    const mid = body.done().length;
    // Triangles. Where every corner is either a vertex met before or the very next new one (a coarse mesh is written
    // in that order: tools/simplify-mesh reorderForPack), each corner is how far back it lies from the next new
    // vertex ('hwm': 0 = the next new one). Otherwise: the first corner as a difference to the first corner of the
    // triangle before, the other two as differences to the first. A file whose index list is not whole triangles is
    // written corner by corner.
    let inOrder = ix.length > 0;
    for (let i = 0, hwm = 0; i < ix.length && inOrder; i++) { if (ix[i] > hwm) inOrder = false; else if (ix[i] === hwm) hwm++; }
    const tri = inOrder ? 'hwm' : ix.length % 3 === 0;
    if (tri === 'hwm') { for (let i = 0, hwm = 0; i < ix.length; i++) { body.varint(hwm - ix[i]); if (ix[i] === hwm) hwm++; } }
    else if (tri) {
      let pa = 0;
      for (let i = 0; i < ix.length; i += 3) { const a = ix[i]; body.varint(zig(a - pa)); body.varint(zig(ix[i + 1] - a)); body.varint(zig(ix[i + 2] - a)); pa = a; }
    } else { let prev = 0; for (let i = 0; i < ix.length; i++) { body.varint(zig(ix[i] - prev)); prev = ix[i]; } }
    const end = body.done().length;
    meta.push({ key: e.key, sourceBytes: e.sourceBytes, sourceSha256: e.sourceSha256, scale, vertices: p.length / 3, indices: ix.length, tri,
      posBytes: mid - start, idxBytes: end - mid, vertexCount: m.vertexCount, faceCount: m.faceCount, polygonCount: m.polygonCount,
      bounds: m.bounds ? { min: Array.from(m.bounds.min), max: Array.from(m.bounds.max) } : null, comments: Array.isArray(m.comments) ? m.comments : null,
      ...(e.derived ? { derived: e.derived } : {}) });
  }
  const header = new TextEncoder().encode(JSON.stringify({ format: PACK_FORMAT, name, licence, meshes: meta }));
  const data = body.done();
  const out = new Uint8Array(MAGIC.length + 4 + header.length + data.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, header.length, true);
  out.set(header, MAGIC.length + 4);
  out.set(data, MAGIC.length + 4 + header.length);
  return out;
}

/**
 * Decode a pack's uncompressed bytes. Returns { name, licence, meshes: Map(key -> { key, sourceBytes, sourceSha256,
 * mesh }) } with mesh in parseObjFast's shape. Throws ns:pack on any malformed input (a pack is only decoded after its
 * hash matched, so this guards against a wrong build, not against an attacker).
 */
export function decodePack(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < MAGIC.length; i++) if (u8[i] !== MAGIC[i]) fail('not a mesh pack');
  const hlen = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(MAGIC.length, true);
  const h0 = MAGIC.length + 4;
  if (h0 + hlen > u8.length) fail('header runs past the end');
  const header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(u8.subarray(h0, h0 + hlen)));
  if (!header || header.format !== PACK_FORMAT || !Array.isArray(header.meshes)) fail('unknown pack format');
  let at = h0 + hlen;
  const meshes = new Map();
  for (const m of header.meshes) {
    const nv = m.vertices, ni = m.indices;
    if (!Number.isSafeInteger(nv) || !Number.isSafeInteger(ni) || nv < 0 || ni < 0 || at + m.posBytes + m.idxBytes > u8.length) fail(`${m.key}: bad sizes`);
    const positions = new Float32Array(nv * 3);
    let i = at;
    const end1 = at + m.posBytes;
    if (m.scale === 0) {
      if (m.posBytes !== nv * 12) fail(`${m.key}: bad raw size`);
      new Uint8Array(positions.buffer).set(u8.subarray(at, end1));
      i = end1;
    } else {
      const s = m.scale;
      let px = 0, py = 0, pz = 0;
      for (let k = 0; k < nv * 3; k += 3) {
        // three variable-length integers, written out for speed (this loop runs for every coordinate of the game)
        let u = 0, f = 1, b;
        do { b = u8[i++]; u += (b & 127) * f; f *= 128; } while (b & 128);
        px += u % 2 ? -(u + 1) / 2 : u / 2;
        u = 0; f = 1;
        do { b = u8[i++]; u += (b & 127) * f; f *= 128; } while (b & 128);
        py += u % 2 ? -(u + 1) / 2 : u / 2;
        u = 0; f = 1;
        do { b = u8[i++]; u += (b & 127) * f; f *= 128; } while (b & 128);
        pz += u % 2 ? -(u + 1) / 2 : u / 2;
        positions[k] = px / s; positions[k + 1] = py / s; positions[k + 2] = pz / s;
      }
      let ne = 0, f = 1, b;
      do { b = u8[i++]; ne += (b & 127) * f; f *= 128; } while (b & 128);
      const pb = new Uint8Array(positions.buffer);
      for (let e = 0, pe = 0; e < ne; e++) {
        let d = 0; f = 1;
        do { b = u8[i++]; d += (b & 127) * f; f *= 128; } while (b & 128);
        pe += d;
        if (pe >= positions.length || i + 4 > end1) fail(`${m.key}: bad exception`);
        pb[pe * 4] = u8[i]; pb[pe * 4 + 1] = u8[i + 1]; pb[pe * 4 + 2] = u8[i + 2]; pb[pe * 4 + 3] = u8[i + 3]; i += 4;
      }
    }
    if (i !== end1) fail(`${m.key}: position data length`);
    const indices = new Uint32Array(ni);
    const end2 = end1 + m.idxBytes;
    const next = () => { let u = 0, f = 1, b; do { b = u8[i++]; u += (b & 127) * f; f *= 128; } while (b & 128); return unzig(u); };
    if (m.tri === 'hwm') { for (let k = 0, hwm = 0; k < ni; k++) { let u = 0, f = 1, b; do { b = u8[i++]; u += (b & 127) * f; f *= 128; } while (b & 128); if (u > hwm) fail(`${m.key}: bad index`); indices[k] = hwm - u; if (u === 0) hwm++; } }
    else if (m.tri) { let pa = 0; for (let k = 0; k < ni; k += 3) { const a = pa + next(); indices[k] = a; indices[k + 1] = a + next(); indices[k + 2] = a + next(); pa = a; } }
    else { let prev = 0; for (let k = 0; k < ni; k++) { prev += next(); indices[k] = prev; } }
    if (i !== end2) fail(`${m.key}: index data length`);
    at = end2;
    const mesh = { positions, indices, vertexCount: m.vertexCount, faceCount: m.faceCount, polygonCount: m.polygonCount,
      bounds: m.bounds ? { min: m.bounds.min, max: m.bounds.max } : undefined, comments: m.comments === null ? undefined : m.comments };
    meshes.set(m.key, { key: m.key, sourceBytes: m.sourceBytes, sourceSha256: m.sourceSha256, mesh, ...(m.derived ? { derived: m.derived } : {}) });
  }
  if (at !== u8.length) fail('trailing bytes');
  return { name: header.name, licence: header.licence || null, meshes };
}

const PACKED = Symbol('ns.packedMesh');
/** A mesh from a verified pack, in the form a game reader may return instead of a file's bytes: ns-assets readVerified
 * then compares the recorded byte count and SHA-256 of the source file with its manifest's and uses the mesh. */
export function packedMesh(record) {
  // a coarse mesh (record.derived) also carries its source file's vertex count, which is what a manifest records
  const d = record.derived || null;
  return Object.freeze({ [PACKED]: true, sourceBytes: record.sourceBytes, sourceSha256: record.sourceSha256, mesh: record.mesh,
    derived: d, sourceVertices: d && Number.isSafeInteger(d.sourceVertices) ? d.sourceVertices : null });
}
export const isPackedMesh = x => Boolean(x && typeof x === 'object' && x[PACKED] === true);

/** Check a parsed pack index (pure). Returns its packs [{ name, file, stage, bytes, sha256, files, keys }] or throws. */
export function validatePackIndex(index) {
  if (!index || index.format !== PACK_INDEX_FORMAT || !Array.isArray(index.packs) || index.packs.length === 0 || index.packs.length > 64) fail('not a pack index');
  const names = new Set();
  return index.packs.map(p => {
    if (!p || typeof p.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(p.name) || names.has(p.name)) fail('bad pack name');
    names.add(p.name);
    if (p.file !== `${p.name}.nspack`) fail(`${p.name}: bad file name`);
    if (!/^[0-9a-f]{64}$/.test(p.sha256) || !Number.isSafeInteger(p.bytes) || p.bytes < 1 || p.bytes > 256e6) fail(`${p.name}: bad hash or size`);
    if (!Array.isArray(p.keys) || p.keys.length !== p.files || p.keys.some(k => typeof k !== 'string')) fail(`${p.name}: bad key list`);
    return { name: p.name, file: p.file, stage: p.stage === 'late' ? 'late' : 'start', bytes: p.bytes, sha256: p.sha256, files: p.files, keys: p.keys, detail: p.detail === 'coarse' ? 'coarse' : 'exact' };
  });
}

/** The body rig file an index names ({ file, bytes, sha256 }), or null (pure; see ns-body bodyRigFromFile). */
export function packIndexRig(index) {
  const r = index && index.rig;
  if (!r || typeof r.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\.json$/.test(r.file) || !/^[0-9a-f]{64}$/.test(r.sha256) || !Number.isSafeInteger(r.bytes) || r.bytes < 1 || r.bytes > 8e6) return null;
  return { file: r.file, bytes: r.bytes, sha256: r.sha256 };
}

/** The pack key of a file URL the game asks for (`<packet>/meshes/<file>.obj`), or null (pure). */
export function packKeyOfUrl(url) {
  const m = /(?:^|\/)packets\/([^/?#]+)\/(meshes\/[^/?#]+\.obj)(?:[?#].*)?$/i.exec(String(url));
  return m ? `${m[1]}/${m[2]}` : null;
}
