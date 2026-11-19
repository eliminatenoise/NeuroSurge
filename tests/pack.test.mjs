// Mesh packs (19 November 2026). The game loads its anatomy as five compact packs instead of 611 OBJ text files.
// The committed packs hold COARSER copies of the source meshes (documented derivatives, packs/README.md); these tests
// check what is promised of them against the source packets: every hash link, every kept vertex a source vertex, no
// source vertex further than the stated bound from the coarse surface, the same connections (no hole, nothing pinched,
// nothing joined), no triangle turned over. The format itself is lossless, and that is checked on exact packs built
// here from two source packets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { encodePack, decodePack, packScaleOf, packKeyOfUrl, packedMesh, isPackedMesh, validatePackIndex, PACK_INDEX_SHA256 } from '../scene/src/ns-pack.mjs';
import { runPackJob, startPackLoader } from '../scene/src/ns-pack-loader.mjs';
import { parseObjFast, streamFullbodyAssets } from '../scene/src/ns-assets.mjs';
import { buildAll, buildPack, coarseKinds, flatTriangle, PACKS, COARSE } from '../tools/build-mesh-packs.mjs';
import { simplifyMesh, weldExact, meshTopology, measureDeviation, reorderForPack } from '../tools/simplify-mesh.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const indexBytes = fs.readFileSync(path.join(root, 'packs', 'PACK-INDEX.json'));
const index = JSON.parse(indexBytes.toString('utf8'));
const packs = validatePackIndex(index);
const decoded = new Map(packs.map(p => [p.name, decodePack(zlib.gunzipSync(fs.readFileSync(path.join(root, 'packs', p.file))))]));
const parseSource = key => { const src = fs.readFileSync(path.join(root, 'packets', key)); return { src, mesh: parseObjFast(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(src), { knownUtf8Bytes: src.length }) }; };

test('the committed pack index is the pinned one, and every pack file matches it', () => {
  assert.equal(sha256(indexBytes), PACK_INDEX_SHA256, 'ns-pack PACK_INDEX_SHA256 must be the hash of packs/PACK-INDEX.json (run tools/build-mesh-packs.mjs)');
  for (const p of packs) {
    const b = fs.readFileSync(path.join(root, 'packs', p.file));
    assert.equal(b.length, p.bytes, p.file);
    assert.equal(sha256(b), p.sha256, p.file);
  }
  assert.equal(packs.reduce((a, p) => a + p.files, 0), 611, 'the files the game waits for');
  // (19 November 2026: 5.7 MB with the face's 54 muscles and the head's eyes kept as their source files; 4.6 MB before)
  assert.ok(packs.reduce((a, p) => a + p.bytes, 0) < 6e6, 'the whole download of anatomy stays under 6 MB');
  assert.deepEqual(index.rule, COARSE);
});

test('the packs and the rig file are what the tool builds from the source packets today (nothing was edited by hand; the build is repeatable)', async () => {
  const { built, indexText, rigText } = await buildAll();
  assert.equal(rigText, fs.readFileSync(path.join(root, 'packs', 'BODY-RIG.json'), 'utf8'), 'packs/BODY-RIG.json is not the rig this code builds from the source meshes: run node tools/build-mesh-packs.mjs');
  assert.equal(indexText, indexBytes.toString('utf8'));
  for (const b of built) assert.equal(b.record.sha256, packs.find(p => p.name === b.record.name).sha256);
});

test('every coarse mesh records its source file (size, hash, vertex count), and that file is the one a manifest pins', () => {
  const pinned = new Map(); // `<packet>/<path>` -> [sha256, vertices]
  const add = (packet, file) => { for (const e of JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).assets) pinned.set(`${e.source_packet || packet}/${e.path}`, [e.sha256, e.vertices]); };
  add('pov-demo-assets', 'inputs/MESH-MANIFEST.json');
  add('bodyparts3d-fullbody-r1', 'inputs/FULLBODY-MESH-MANIFEST.json');
  add('face-muscles-r1', 'packets/face-muscles-r1/FACE-MESH-MANIFEST.json');
  add('bodyparts3d-head-r1', 'packets/bodyparts3d-head-r1/HEAD-MESH-MANIFEST.json');
  add('missing-muscles-r1', 'packets/missing-muscles-r1/MISSING-MUSCLES-MESH-MANIFEST.json');
  let files = 0, named = 0, exact = 0;
  const kinds = coarseKinds();
  for (const p of packs) {
    assert.deepEqual([...decoded.get(p.name).meshes.keys()], p.keys);
    for (const [key, rec] of decoded.get(p.name).meshes) {
      const { src, mesh } = parseSource(key);
      assert.equal(rec.sourceBytes, src.length, key);
      assert.equal(rec.sourceSha256, sha256(src), key);
      const kind = kinds.get(key.split('/').pop().replace('.obj', '')) || 'body';
      if (kind === 'source') { assert.equal(rec.derived, undefined, key); assert.deepStrictEqual(rec.mesh, mesh, `${key}: a mesh kept as its source must be exactly what the parser reads`); exact++; }
      else {
        assert.equal(rec.derived.kind, kind, key);
        assert.equal(rec.derived.sourceVertices, mesh.positions.length / 3, key);
        assert.equal(rec.derived.sourceTriangles, mesh.indices.length / 3, key);
      }
      assert.deepEqual(rec.mesh.comments, mesh.comments, `${key}: the file's own comment lines (its licence notice) travel with the mesh`);
      if (pinned.has(key)) { assert.equal(rec.sourceSha256, pinned.get(key)[0], key); if (Number.isFinite(pinned.get(key)[1])) assert.equal(rec.derived ? rec.derived.sourceVertices : rec.mesh.positions.length / 3, pinned.get(key)[1], key); named++; }
      files++;
    }
  }
  assert.equal(files, 611);
  assert.equal(exact, 138, 'kept exactly as their source: the 32 bones of the game arm, the two precentral gyri, the two lacrimal bones, the 42 finger and toe bones, and (19 November) the 54 face muscles and the 6 parts of the head\'s two eyes');
  assert.ok(named >= 600, `only ${named} packed files are named by a manifest`);
});

test('coarse meshes: every kept vertex is a source vertex (to 0.01 mm), no source vertex is further than the bound from the surface, the connections are the same, no triangle is turned over', () => {
  let srcTris = 0, tris = 0, worst = 0, against = 0, againstSource = 0, leastVolume = 1, flatAll = 0;
  const key3 = (P, i) => `${Math.round(P[i] * 100)},${Math.round(P[i + 1] * 100)},${Math.round(P[i + 2] * 100)}`;
  // Six times the volume a closed mesh encloses (signed: it changes sign if the surface is turned inside out).
  const volume6 = (P, I) => { let v = 0; for (let i = 0; i < I.length; i += 3) { const a = 3 * I[i], b = 3 * I[i + 1], c = 3 * I[i + 2]; v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]); } return v; };
  // How many triangles of mesh m face against the source surface's vertex normals at all three of their corners. The
  // source's own thin edges give a few such triangles in the source itself, so the coarse count is compared with that.
  const facingAgainst = (w, nrm, at, m) => {
    let n = 0;
    for (let i = 0; i < m.indices.length; i += 3) {
      const A = 3 * m.indices[i], B = 3 * m.indices[i + 1], C = 3 * m.indices[i + 2], P = m.positions;
      const ux = P[B] - P[A], uy = P[B + 1] - P[A + 1], uz = P[B + 2] - P[A + 2], vx = P[C] - P[A], vy = P[C + 1] - P[A + 1], vz = P[C + 2] - P[A + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      let k = 0;
      for (const V of [A, B, C]) { const q = at.get(key3(P, V)); if (nx * nrm[q] + ny * nrm[q + 1] + nz * nrm[q + 2] < 0) k++; }
      if (k === 3) n++;
    }
    return n;
  };
  for (const p of packs) {
    for (const [key, rec] of decoded.get(p.name).meshes) {
      const { mesh: src } = parseSource(key), m = rec.mesh;
      srcTris += src.indices.length / 3; tris += m.indices.length / 3;
      if (!rec.derived) continue; // kept exactly as its source (checked above)
      // kept vertices are source vertices, rounded
      const have = new Set();
      for (let i = 0; i < src.positions.length; i += 3) have.add(`${Math.round(src.positions[i] * 100)},${Math.round(src.positions[i + 1] * 100)},${Math.round(src.positions[i + 2] * 100)}`);
      for (let i = 0; i < m.positions.length; i += 3) assert.ok(have.has(`${Math.round(m.positions[i] * 100)},${Math.round(m.positions[i + 1] * 100)},${Math.round(m.positions[i + 2] * 100)}`), `${key}: vertex ${i / 3} is not a source vertex`);
      // measured here, independently of the build: every source vertex against the coarse surface
      const dev = measureDeviation(src.positions, m.positions, m.indices);
      // (the kind's limit, or a smaller one where the kind's limit cost the mesh too much of its bulk)
      const bound = rec.derived.maxDevMm;
      assert.ok(bound > 0 && bound <= COARSE.kinds[rec.derived.kind].maxDevMm, key);
      assert.ok(dev.maxMm <= bound + 0.02, `${key}: a source vertex lies ${dev.maxMm} mm from the coarse surface`);
      assert.ok(Math.abs(dev.maxMm - rec.derived.deviationMm) < 0.002, `${key}: recorded deviation`);
      if (dev.maxMm > worst) worst = dev.maxMm;
      // the same connections as the source (its exactly repeated vertices joined): pieces, Euler number, closedness
      const w = weldExact(src.positions, src.indices);
      const a = meshTopology(w.positions, w.indices), b = meshTopology(m.positions, m.indices);
      assert.equal(b.pieces, a.pieces, `${key}: pieces`);
      assert.equal(b.euler, a.euler, `${key}: Euler number (a hole, a pinch or a handle would change it)`);
      assert.equal(b.rimEdges === 0, a.rimEdges === 0, `${key}: closed stays closed`);
      assert.ok(b.rimEdges <= a.rimEdges && b.crowdedEdges <= a.crowdedEdges, `${key}: no new rim or crowded edge`);
      // not turned inside out: a closed mesh encloses a volume of the same sign and nearly the same size
      if (a.rimEdges === 0 && a.crowdedEdges === 0) {
        const v0 = volume6(w.positions, w.indices), v1 = volume6(m.positions, m.indices);
        if (Math.abs(v0) > 6 * COARSE.volumeFromMm3) {
          assert.ok(v0 * v1 > 0, `${key}: turned inside out`);
          // the bulk is kept: a thin muscle is not allowed to lose a quarter of itself to a limit meant for thick ones
          assert.ok(Math.abs(v1 / v0 - 1) <= 1 - COARSE.volumeKeep + 0.005, `${key}: volume ${v1 / v0}`);
          if (v1 / v0 < leastVolume) leastVolume = v1 / v0;
        }
      }
      // no triangle without area that the source file does not have itself (rounding made 506 of them once)
      let flat = 0, flatSource = 0;
      for (let i = 0; i < m.indices.length; i += 3) if (flatTriangle(m.positions, m.indices[i], m.indices[i + 1], m.indices[i + 2])) flat++;
      for (let i = 0; i < w.indices.length; i += 3) if (flatTriangle(w.positions, w.indices[i], w.indices[i + 1], w.indices[i + 2])) flatSource++;
      assert.ok(flat <= flatSource, `${key}: ${flat} triangles without area, the source has ${flatSource}`);
      flatAll += flat;
      // no triangle turned over: counted against the source surface's vertex normals (see facingAgainst)
      const nrm = new Float32Array(w.positions.length), at = new Map();
      for (let i = 0; i < w.indices.length; i += 3) {
        const A = 3 * w.indices[i], B = 3 * w.indices[i + 1], C = 3 * w.indices[i + 2], P = w.positions;
        const ux = P[B] - P[A], uy = P[B + 1] - P[A + 1], uz = P[B + 2] - P[A + 2], vx = P[C] - P[A], vy = P[C + 1] - P[A + 1], vz = P[C + 2] - P[A + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const V of [A, B, C]) { nrm[V] += nx; nrm[V + 1] += ny; nrm[V + 2] += nz; }
      }
      for (let i = 0; i < w.positions.length; i += 3) at.set(key3(w.positions, i), i);
      against += facingAgainst(w, nrm, at, m); againstSource += facingAgainst(w, nrm, at, w);
    }
  }
  assert.ok(against < 0.003 * tris && against <= 1.5 * againstSource + 50, `${against} of ${tris} coarse triangles face against the source surface at all three corners (the source's own thin edges: ${againstSource})`);
  // (0.38 before the face muscles and the head's eyes stayed as their source: 1 048 620 of 2 395 434 now, 43.8 %)
  assert.ok(tris < 0.45 * srcTris, `${tris} of ${srcTris} triangles`);
  assert.ok(worst <= 0.52);
  assert.ok(leastVolume >= COARSE.volumeKeep - 0.005, `a closed mesh keeps ${leastVolume} of its volume`);
  assert.ok(flatAll <= 10, `${flatAll} triangles without area in all`);
});

test('the simplifier on a known shape: a flat sheet loses its inner vertices, keeps its rim and its bump, and nothing strays', () => {
  const N = 24, pos = [], idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.push(i * 2, j * 2, i === 12 && j === 12 ? 6 : 0); // one 6 mm bump
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; idx.push(a, a + 1, a + N + 2, a, a + N + 2, a + N + 1); }
  const P = new Float32Array(pos), I = new Uint32Array(idx);
  const s = simplifyMesh(P, I, { maxDevMm: 0.2, maxEdgeMm: 100 });
  assert.ok(s.indices.length / 3 < 0.2 * (I.length / 3), 'a flat sheet needs few triangles');
  const a = meshTopology(P, I), b = meshTopology(s.positions, s.indices);
  assert.equal(b.pieces, 1); assert.equal(b.euler, a.euler);
  assert.ok(measureDeviation(P, s.positions, s.indices).maxMm <= 0.2 + 1e-6);
  let top = -Infinity, lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (let i = 0; i < s.positions.length; i += 3) { top = Math.max(top, s.positions[i + 2]); lo[0] = Math.min(lo[0], s.positions[i]); lo[1] = Math.min(lo[1], s.positions[i + 1]); hi[0] = Math.max(hi[0], s.positions[i]); hi[1] = Math.max(hi[1], s.positions[i + 1]); }
  assert.equal(top, 6, 'the bump is kept');
  assert.deepEqual([lo, hi], [[0, 0], [48, 48]], 'the corners of the rim are kept');
  // the walking order gives the same surface
  const r = reorderForPack(s.positions, s.indices);
  assert.deepEqual(meshTopology(r.positions, r.indices), b);
  for (let i = 0, hwm = 0; i < r.indices.length; i++) { assert.ok(r.indices[i] <= hwm); if (r.indices[i] === hwm) hwm++; }
});

test('the format is lossless: exact packs built here from two source packets decode to exactly what the parser reads', () => {
  for (const name of ['head', 'face-muscles']) {
    const b = buildPack(PACKS.find(p => p.name === name), { detail: 'exact' });
    const back = decodePack(zlib.gunzipSync(b.gz));
    assert.equal(back.meshes.size, b.record.files);
    for (const [key, rec] of back.meshes) assert.deepStrictEqual(rec.mesh, parseSource(key).mesh, `${key}: the packed mesh differs from the parsed source file`);
  }
});

test('coordinates come back bit for bit: whole numbers of 1/scale mm, the odd one kept as a raw float', () => {
  const p = new Float32Array([84.5057, -33.8807, 132.801, 1141.9365, -0.5, 0, 0.0498805, 12.25, 7, -84.0772, -110.852, 0.0415799, 3, 3, 3]);
  const { scale, exceptions } = packScaleOf(p);
  assert.equal(scale, 10000);
  assert.deepEqual(exceptions, [6, 11]);
  const mesh = { positions: p, indices: new Uint32Array([0, 1, 2, 2, 3, 4, 4, 1, 0]), vertexCount: 5, faceCount: 3, polygonCount: 3, bounds: { min: [1, 2, 3], max: [4, 5, 6] }, comments: ['a licence line'] };
  const back = decodePack(encodePack({ name: 't', entries: [{ key: 'x/meshes/a.obj', sourceBytes: 10, sourceSha256: 'ab'.repeat(32), mesh }] }));
  assert.deepStrictEqual(back.meshes.get('x/meshes/a.obj').mesh, mesh);
  // triangles not in first-met order (2 before 1) use the other index code; both come back the same
  const other = { ...mesh, indices: new Uint32Array([0, 2, 1, 2, 3, 4, 4, 1, 0]) };
  assert.deepStrictEqual(decodePack(encodePack({ name: 't', entries: [{ key: 'k', sourceBytes: 1, sourceSha256: 'ef'.repeat(32), mesh: other }] })).meshes.get('k').mesh, other);
  // a negative zero and a value no decimal scale holds fall back to raw floats, still exact
  const odd = { ...mesh, positions: new Float32Array([-0, 1 / 3, Math.PI, 1e-20, 5, 6, 7, 8, 9]), indices: new Uint32Array([0, 1, 2]) };
  const back2 = decodePack(encodePack({ name: 't', entries: [{ key: 'x/meshes/b.obj', sourceBytes: 1, sourceSha256: 'cd'.repeat(32), mesh: odd }] })).meshes.get('x/meshes/b.obj').mesh;
  assert.ok(Object.is(back2.positions[0], -0));
  assert.deepStrictEqual(back2, odd);
  assert.throws(() => decodePack(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), /ns:pack/);
});

test('the game\'s loaders take a packed mesh only when its recorded source size, hash and vertex count match the manifest', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'inputs/FULLBODY-MESH-MANIFEST.json'), 'utf8'));
  const pack = decoded.get('fullbody');
  const read = lie => async p => { const r = pack.meshes.get(`bodyparts3d-fullbody-r1/${p}`); return packedMesh(lie ? lie(r) : r); };
  const never = () => assert.fail('a packed mesh is never hashed or parsed again');
  const ok = await streamFullbodyAssets({ manifest, readBytes: read(null), sha256HexBytes: never, parse: never, allOrNothing: true, autoStart: true, priorityIds: [] }).done;
  assert.equal(ok.status, 'complete');
  for (const e of manifest.assets) assert.strictEqual(ok.meshes.get(e.element_id).mesh, pack.meshes.get(`bodyparts3d-fullbody-r1/${e.path}`).mesh);
  const wrongHash = await streamFullbodyAssets({ manifest, readBytes: read(r => ({ ...r, sourceSha256: '0'.repeat(64) })), sha256HexBytes: never, allOrNothing: true, autoStart: true, priorityIds: [] }).done;
  assert.equal(wrongHash.status, 'rejected');
  assert.ok(wrongHash.failed.every(f => f.code === 'asset_hash'));
  const wrongSize = await streamFullbodyAssets({ manifest, readBytes: read(r => ({ ...r, sourceBytes: r.sourceBytes + 1 })), sha256HexBytes: never, allOrNothing: true, autoStart: true, priorityIds: [] }).done;
  assert.ok(wrongSize.failed.every(f => f.code === 'asset_bytes'));
  // a coarse mesh that claims another source vertex count than the manifest records is refused
  const wrongCount = await streamFullbodyAssets({ manifest, readBytes: read(r => (r.derived ? { ...r, mesh: { ...r.mesh }, derived: { ...r.derived, sourceVertices: r.derived.sourceVertices + 1 } } : r)), sha256HexBytes: never, allOrNothing: true, autoStart: true, priorityIds: [] }).done;
  assert.ok(wrongCount.failed.length >= 200 && wrongCount.failed.every(f => f.code === 'asset_vertices'), 'every coarse mesh of the pack is refused');
  assert.equal(isPackedMesh({ sourceSha256: 'x', mesh: {} }), false, 'only ns-pack packedMesh() makes one');
});

test('file URLs map to pack keys', () => {
  assert.equal(packKeyOfUrl('../../packets/pov-demo-assets/meshes/FJ3318.obj'), 'pov-demo-assets/meshes/FJ3318.obj');
  assert.equal(packKeyOfUrl('http://x/y/packets/face-muscles-r1/meshes/zf-a-b.obj?v=1'), 'face-muscles-r1/meshes/zf-a-b.obj');
  assert.equal(packKeyOfUrl('../../packets/face-muscles-r1/FACE-MESH-MANIFEST.json'), null);
  assert.equal(packKeyOfUrl('../../inputs/MESH-MANIFEST.json'), null);
});

// The loader job against the committed packs, with a fetch that reads the repository.
function jobIo({ tamper = null, hang = null, missing = null, once = false, seen = [] } = {}) {
  const asked = new Map();
  const fetch = async (url, init = {}) => {
    const name = String(url).split('/').pop();
    const n = (asked.get(name) || 0) + 1; asked.set(name, n);
    seen.push([name, init.cache || 'default']);
    const bad = !once || n === 1; // once: only the first request for a file goes wrong
    if (bad && hang && `${name}!` === hang) return new Promise(() => {}); // the answer never even begins
    if (bad && hang && name === hang) return { ok: true, status: 200, body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {} }) } };
    if (bad && missing && name === missing) return new Response('no', { status: 404 });
    let bytes = new Uint8Array(fs.readFileSync(path.join(root, 'packs', name)));
    if (bad && tamper && name === tamper) { bytes = bytes.slice(); bytes[bytes.length >> 1] ^= 1; }
    return new Response(bytes, { status: 200 });
  };
  return { fetch, subtle: webcrypto.subtle, DecompressionStream, Response, Blob, AbortController, setTimeout, clearTimeout };
}

test('the loader job gives every pack, in the index\'s order of keys, with a message per step', async () => {
  const msgs = [];
  await runPackJob({ indexUrl: 'x/PACK-INDEX.json', base: 'x/', io: jobIo(), emit: m => msgs.push(m) });
  assert.equal(msgs[0].type, 'index');
  assert.equal(msgs[msgs.length - 1].type, 'done');
  const got = msgs.filter(m => m.type === 'pack');
  assert.equal(got.length, packs.length);
  assert.equal(got.reduce((a, m) => a + m.meshes.length, 0), 611);
  assert.ok(msgs.some(m => m.type === 'bytes' && m.name === 'fullbody' && m.got === packs.find(p => p.name === 'fullbody').bytes));
});

test('a pack whose bytes were changed, a pack that stops coming, one that never answers and a wrong index are refused, never used', async () => {
  const a = [];
  await runPackJob({ indexUrl: 'x/PACK-INDEX.json', base: 'x/', io: jobIo({ tamper: 'head.nspack' }), emit: m => a.push(m) });
  assert.deepEqual(a.filter(m => m.type === 'pack-failed').map(m => m.name), ['head']);
  assert.match(a.find(m => m.type === 'pack-failed').error, /sha256/);
  assert.equal(a.filter(m => m.type === 'pack').length, packs.length - 1);
  const b = [];
  await runPackJob({ indexUrl: 'x/PACK-INDEX.json', base: 'x/', io: jobIo({ hang: 'face-muscles.nspack' }), emit: m => b.push(m), stallMs: 60 });
  assert.match(b.find(m => m.type === 'pack-failed' && m.name === 'face-muscles').error, /no data/);
  assert.equal(b[b.length - 1].type, 'done');
  const b2 = [];
  await runPackJob({ indexUrl: 'x/PACK-INDEX.json', base: 'x/', io: jobIo({ hang: 'head.nspack!' }), emit: m => b2.push(m), stallMs: 60 });
  assert.match(b2.find(m => m.type === 'pack-failed' && m.name === 'head').error, /no answer/);
  assert.equal(b2.filter(m => m.type === 'pack').length, packs.length - 1);
  const c = [];
  await runPackJob({ indexUrl: 'x/PACK-INDEX.json', base: 'x/', io: jobIo(), emit: m => c.push(m), expectedIndexSha256: '0'.repeat(64) });
  assert.deepEqual(c.map(m => m.type), ['again', 'index-failed', 'done']);
});

test('a first request that goes wrong is made once more, past the browser\'s cache, before anything is given up', async () => {
  // a copy left in the cache by an earlier version of the game (wrong bytes), a 404: each is asked for again and the
  // second answer is used
  for (const io of [{ tamper: 'PACK-INDEX.json' }, { tamper: 'fullbody.nspack' }, { missing: 'head.nspack' }, { missing: 'BODY-RIG.json' }, { tamper: 'BODY-RIG.json' }]) {
    const seen = [], msgs = [];
    await runPackJob({ indexUrl: 'x/PACK-INDEX.json', base: 'x/', io: jobIo({ ...io, once: true, seen }), emit: m => msgs.push(m), stallMs: 60 });
    const file = io.tamper || io.missing;
    assert.deepEqual(seen.filter(x => x[0] === file).map(x => x[1]), ['default', 'reload'], `${file}: asked twice, the second time past the cache`);
    assert.equal(msgs.filter(m => m.type === 'again').length, 1);
    assert.equal(msgs.filter(m => m.type === 'pack').length, packs.length, `${file}: every pack is used`);
    assert.equal(msgs.filter(m => m.type === 'rig').length, 1);
    assert.equal(msgs.filter(m => /failed/.test(m.type)).length, 0);
  }
  // a file that is wrong both times is asked for twice and no more
  const seen = [], msgs = [];
  await runPackJob({ indexUrl: 'x/PACK-INDEX.json', base: 'x/', io: jobIo({ missing: 'BODY-RIG.json', seen }), emit: m => msgs.push(m), stallMs: 60 });
  assert.equal(seen.filter(x => x[0] === 'BODY-RIG.json').length, 2);
  assert.match(msgs.find(m => m.type === 'rig-failed').error, /HTTP 404/);
  // a request given up for being silent is NOT asked for again (a second wait would double the time before the files
  // are read the old way)
  for (const hang of ['head.nspack!', 'face-muscles.nspack']) {
    const seen2 = [], msgs2 = [];
    await runPackJob({ indexUrl: 'x/PACK-INDEX.json', base: 'x/', io: jobIo({ hang, once: true, seen: seen2 }), emit: m => msgs2.push(m), stallMs: 60 });
    assert.equal(seen2.filter(x => x[0] === hang.replace('!', '')).length, 1);
    assert.equal(msgs2.filter(m => m.type === 'pack-failed').length, 1);
  }
});

test('without the rig file the body\'s coarse meshes are not handed out (the game then reads the source files); the arm and brain still are', async () => {
  const run = async io => {
    const win = { location: { href: 'http://x/scene/example/preview.html' }, fetch: io.fetch, crypto: { subtle: webcrypto.subtle }, DecompressionStream, Response, Blob, AbortController, setTimeout, clearTimeout };
    let last = null;
    const loader = startPackLoader({ win, useWorker: false, moduleUrl: 'http://x/scene/src/ns-pack-loader.mjs', indexUrl: '../../packs/PACK-INDEX.json', base: '../../packs/', onProgress: (files, of) => { last = [files, of]; } });
    const rig = await loader.rig();
    const body = await loader.get(packs.find(p => p.name === 'fullbody').keys[0]);
    const arm = await loader.get(packs.find(p => p.name === 'arm-brain').keys[0]);
    await new Promise(r => setTimeout(r, 300));
    return { rig, body, arm, last, st: loader.state() };
  };
  const ok = await run(jobIo());
  assert.ok(ok.rig && ok.body && ok.arm);
  assert.equal(ok.last[0], 611);
  const none = await run(jobIo({ missing: 'BODY-RIG.json' }));
  assert.equal(none.rig, null);
  assert.equal(none.body, null, 'no coarse body mesh without the rig made from its source');
  assert.ok(none.arm, 'the arm and brain pack does not depend on the body rig');
  assert.equal(none.st.withoutRig, 1);
  assert.equal(none.last[0], 142, 'the bar counts only the files the packs will really give');
});

test('a pack worker that never says a word (its script never arrives) is given up and the packs are read on the page', async () => {
  let terminated = 0;
  class SilentWorker { postMessage() {} terminate() { terminated++; } }
  const io = jobIo();
  const win = { location: { href: 'http://x/scene/example/preview.html' }, Worker: SilentWorker, fetch: io.fetch, crypto: { subtle: webcrypto.subtle }, DecompressionStream, Response, Blob, AbortController, setTimeout, clearTimeout };
  const loader = startPackLoader({ win, moduleUrl: 'http://x/scene/src/ns-pack-loader.mjs', indexUrl: '../../packs/PACK-INDEX.json', base: '../../packs/', helloMs: 40 });
  assert.equal(loader.state().mode, 'worker');
  const mesh = await loader.get(packs.find(p => p.name === 'arm-brain').keys[0]);
  assert.ok(mesh, 'the mesh comes from the pack all the same');
  assert.equal(terminated, 1);
  assert.equal(loader.state().mode, 'page');
  assert.match(loader.state().errors[0], /worker: no word/);
});
