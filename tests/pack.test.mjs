// Mesh packs (19 November 2026): the compact copies the game loads instead of 691 OBJ text files must be exactly what
// the game's parser reads from the source packets, and every link of the hash chain must hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { encodePack, decodePack, packScaleOf, packKeyOfUrl, packedMesh, isPackedMesh, validatePackIndex, PACK_INDEX_SHA256 } from '../scene/src/ns-pack.mjs';
import { runPackJob } from '../scene/src/ns-pack-loader.mjs';
import { parseObjFast, loadAssets, streamFullbodyAssets } from '../scene/src/ns-assets.mjs';
import { buildAll } from '../tools/build-mesh-packs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const indexBytes = fs.readFileSync(path.join(root, 'packs', 'PACK-INDEX.json'));
const index = JSON.parse(indexBytes.toString('utf8'));
const packs = validatePackIndex(index);

test('the committed pack index is the pinned one, and every pack file matches it', () => {
  assert.equal(sha256(indexBytes), PACK_INDEX_SHA256, 'ns-pack PACK_INDEX_SHA256 must be the hash of packs/PACK-INDEX.json (run tools/build-mesh-packs.mjs)');
  for (const p of packs) {
    const b = fs.readFileSync(path.join(root, 'packs', p.file));
    assert.equal(b.length, p.bytes, p.file);
    assert.equal(sha256(b), p.sha256, p.file);
  }
  assert.equal(packs.filter(p => p.stage === 'start').reduce((a, p) => a + p.files, 0), 611, 'the files the game waits for');
});

test('every packed mesh is exactly what the parser reads from its source file, and records that file\'s size and hash', () => {
  let files = 0;
  for (const p of packs) {
    const decoded = decodePack(zlib.gunzipSync(fs.readFileSync(path.join(root, 'packs', p.file))));
    assert.deepEqual([...decoded.meshes.keys()], p.keys);
    for (const [key, rec] of decoded.meshes) {
      const src = fs.readFileSync(path.join(root, 'packets', key));
      assert.equal(rec.sourceBytes, src.length, key);
      assert.equal(rec.sourceSha256, sha256(src), key);
      const parsed = parseObjFast(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(src), { knownUtf8Bytes: src.length });
      assert.deepStrictEqual(rec.mesh, parsed, `${key}: the packed mesh differs from the parsed source file`);
      files++;
    }
  }
  assert.equal(files, 691);
});

test('the packs are what the tool builds from the source packets today (nothing was edited by hand)', () => {
  const { built, indexText } = buildAll();
  assert.equal(indexText, indexBytes.toString('utf8'));
  for (const b of built) assert.equal(b.record.sha256, packs.find(p => p.name === b.record.name).sha256);
});

test('every source file a pack was made from is the one its packet\'s manifest pins', () => {
  const pinned = new Map(); // `<packet>/<path>` -> sha256
  const add = (packet, file, list = 'assets') => { for (const e of JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))[list]) pinned.set(`${e.source_packet || packet}/${e.path}`, e.sha256); };
  add('pov-demo-assets', 'inputs/MESH-MANIFEST.json');
  add('bodyparts3d-fullbody-r1', 'inputs/FULLBODY-MESH-MANIFEST.json');
  add('face-muscles-r1', 'packets/face-muscles-r1/FACE-MESH-MANIFEST.json');
  add('bodyparts3d-head-r1', 'packets/bodyparts3d-head-r1/HEAD-MESH-MANIFEST.json');
  add('missing-muscles-r1', 'packets/missing-muscles-r1/MISSING-MUSCLES-MESH-MANIFEST.json');
  const arteries = fs.readdirSync(path.join(root, 'packets/bodyparts3d-cerebral-arteries-r1')).find(f => /MANIFEST\.json$/.test(f));
  add('bodyparts3d-cerebral-arteries-r1', `packets/bodyparts3d-cerebral-arteries-r1/${arteries}`);
  let checked = 0;
  for (const p of packs) {
    const decoded = decodePack(zlib.gunzipSync(fs.readFileSync(path.join(root, 'packs', p.file))));
    for (const [key, rec] of decoded.meshes) { if (!pinned.has(key)) continue; assert.equal(rec.sourceSha256, pinned.get(key), key); checked++; }
  }
  assert.ok(checked >= 611 + 80, `only ${checked} packed files are named by a manifest`);
});

test('coordinates come back bit for bit: whole numbers of 1/scale mm, the odd one kept as a raw float', () => {
  const p = new Float32Array([84.5057, -33.8807, 132.801, 1141.9365, -0.5, 0, 0.0498805, 12.25, 7, -84.0772, -110.852, 0.0415799, 3, 3, 3]);
  const { scale, exceptions } = packScaleOf(p);
  assert.equal(scale, 10000);
  assert.deepEqual(exceptions, [6, 11]);
  const mesh = { positions: p, indices: new Uint32Array([0, 1, 2, 2, 3, 4, 4, 1, 0]), vertexCount: 5, faceCount: 3, polygonCount: 3, bounds: { min: [1, 2, 3], max: [4, 5, 6] }, comments: ['a licence line'] };
  const back = decodePack(encodePack({ name: 't', entries: [{ key: 'x/meshes/a.obj', sourceBytes: 10, sourceSha256: 'ab'.repeat(32), mesh }] }));
  assert.deepStrictEqual(back.meshes.get('x/meshes/a.obj').mesh, mesh);
  // a negative zero and a value no decimal scale holds fall back to raw floats, still exact
  const odd = { ...mesh, positions: new Float32Array([-0, 1 / 3, Math.PI, 1e-20, 5, 6, 7, 8, 9]), indices: new Uint32Array([0, 1, 2]) };
  const back2 = decodePack(encodePack({ name: 't', entries: [{ key: 'x/meshes/b.obj', sourceBytes: 1, sourceSha256: 'cd'.repeat(32), mesh: odd }] })).meshes.get('x/meshes/b.obj').mesh;
  assert.ok(Object.is(back2.positions[0], -0));
  assert.deepStrictEqual(back2, odd);
  assert.throws(() => decodePack(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), /ns:pack/);
});

test('the game\'s loaders take a packed mesh only when its recorded source size and hash match the manifest', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'inputs/FULLBODY-MESH-MANIFEST.json'), 'utf8'));
  const pack = decodePack(zlib.gunzipSync(fs.readFileSync(path.join(root, 'packs', 'fullbody.nspack'))));
  const some = manifest.assets;
  const sub = manifest;
  const read = lie => async p => { const r = pack.meshes.get(`bodyparts3d-fullbody-r1/${p}`); return packedMesh(lie ? lie(r) : r); };
  const never = () => assert.fail('a packed mesh is never hashed or parsed again');
  const ok = await streamFullbodyAssets({ manifest: sub, readBytes: read(null), sha256HexBytes: never, parse: never, allOrNothing: true, autoStart: true, priorityIds: [] }).done;
  assert.equal(ok.status, 'complete');
  for (const e of some) assert.strictEqual(ok.meshes.get(e.element_id).mesh, pack.meshes.get(`bodyparts3d-fullbody-r1/${e.path}`).mesh);
  const wrongHash = await streamFullbodyAssets({ manifest: sub, readBytes: read(r => ({ ...r, sourceSha256: '0'.repeat(64) })), sha256HexBytes: never, allOrNothing: true, autoStart: true, priorityIds: [] }).done;
  assert.equal(wrongHash.status, 'rejected');
  assert.ok(wrongHash.failed.every(f => f.code === 'asset_hash'));
  const wrongSize = await streamFullbodyAssets({ manifest: sub, readBytes: read(r => ({ ...r, sourceBytes: r.sourceBytes + 1 })), sha256HexBytes: never, allOrNothing: true, autoStart: true, priorityIds: [] }).done;
  assert.ok(wrongSize.failed.every(f => f.code === 'asset_bytes'));
  assert.equal(isPackedMesh({ sourceSha256: 'x', mesh: {} }), false, 'only ns-pack packedMesh() makes one');
  assert.equal(typeof loadAssets, 'function');
});

test('file URLs map to pack keys', () => {
  assert.equal(packKeyOfUrl('../../packets/pov-demo-assets/meshes/FJ3318.obj'), 'pov-demo-assets/meshes/FJ3318.obj');
  assert.equal(packKeyOfUrl('http://x/y/packets/face-muscles-r1/meshes/zf-a-b.obj?v=1'), 'face-muscles-r1/meshes/zf-a-b.obj');
  assert.equal(packKeyOfUrl('../../packets/face-muscles-r1/FACE-MESH-MANIFEST.json'), null);
  assert.equal(packKeyOfUrl('../../inputs/MESH-MANIFEST.json'), null);
});

// The loader job against the committed packs, with a fetch that reads the repository.
function jobIo({ tamper = null, hang = null } = {}) {
  const fetch = async url => {
    const name = String(url).split('/').pop();
    if (hang && `${name}!` === hang) return new Promise(() => {}); // the answer never even begins
    if (hang && name === hang) return { ok: true, status: 200, body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {} }) } };
    let bytes = new Uint8Array(fs.readFileSync(path.join(root, 'packs', name)));
    if (tamper && name === tamper) { bytes = bytes.slice(); bytes[bytes.length >> 1] ^= 1; }
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
  assert.equal(got.reduce((a, m) => a + m.meshes.length, 0), 691);
  assert.ok(msgs.some(m => m.type === 'bytes' && m.name === 'fullbody' && m.got === packs.find(p => p.name === 'fullbody').bytes));
});

test('a pack whose bytes were changed, a pack that stops coming, and a wrong index are refused, never used', async () => {
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
  assert.deepEqual(c.map(m => m.type), ['index-failed', 'done']);
});
