// The rig file (19 November 2026, package LOAD). The game draws coarser meshes, and a rig estimated from them has its
// joint pivots a few millimetres elsewhere and some muscles on another bone. packs/BODY-RIG.json is the rig built from
// the SOURCE meshes exactly as the page prepares them; the game builds its rig from the meshes it has with that rig's
// pivots and muscle rows. These tests hold the file to this code (it must be rebuilt when the rig's code changes).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadPageBody } from '../tools/page-body.mjs';
import { decodePack, packIndexRig } from '../scene/src/ns-pack.mjs';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fileText = fs.readFileSync(path.join(root, 'packs', 'BODY-RIG.json'), 'utf8');
const file = JSON.parse(fileText);
const coarse = new Map();
for (const f of fs.readdirSync(path.join(root, 'packs')).filter(f => f.endsWith('.nspack'))) for (const [k, r] of decodePack(zlib.gunzipSync(fs.readFileSync(path.join(root, 'packs', f)))).meshes) coarse.set(k.split('/').pop().replace('.obj', ''), r.mesh);
const source = await loadPageBody(root);
const B = source.body;

test('the rig file is the rig this code builds from the source meshes, and the pack index pins its bytes', () => {
  assert.equal(fileText, JSON.stringify(B.bodyRigToFile(source.rig)) + '\n', 'packs/BODY-RIG.json is stale: run node tools/build-mesh-packs.mjs');
  const pin = packIndexRig(JSON.parse(fs.readFileSync(path.join(root, 'packs', 'PACK-INDEX.json'), 'utf8')));
  assert.deepEqual(pin, { file: 'BODY-RIG.json', bytes: Buffer.byteLength(fileText), sha256: createHash('sha256').update(fileText).digest('hex') });
  assert.equal(B.bodyRigMatchesFile(source.rig, file), true);
});

test('from the coarse meshes with the rig file the game gets the source rig, datum for datum; without it, pivots and muscle rows move', async () => {
  const withFile = await loadPageBody(root, { meshFor: id => coarse.get(id), rigFile: file });
  assert.equal(B.bodyRigMatchesFile(withFile.rig, file), true);
  assert.deepStrictEqual(withFile.rig.pivots, source.rig.pivots);
  assert.deepStrictEqual(withFile.rig.meshSegment, source.rig.meshSegment);
  assert.equal(Object.isFrozen(withFile.rig) && Object.isFrozen(withFile.rig.pivots), true);
  // the skin it gives is usable (the hidden sample clouds come from the coarse meshes)
  assert.equal(B.handSkinRecords(withFile.rig, withFile.meshesById).size, B.handSkinRecords(source.rig, source.meshesById).size);
  // why the file exists
  const alone = await loadPageBody(root, { meshFor: id => coarse.get(id) });
  assert.equal(B.bodyRigMatchesFile(alone.rig, file), false);
  let far = 0, moved = 0;
  for (const [id, p] of Object.entries(source.rig.pivots)) { const q = alone.rig.pivots[id]; if (p.point && q && q.point && Math.hypot(p.point[0] - q.point[0], p.point[1] - q.point[1], p.point[2] - q.point[2]) > 1) far++; }
  for (const [id, a] of Object.entries(source.rig.meshSegment)) if (alone.rig.meshSegment[id].segment !== a.segment) moved++;
  assert.ok(far > 5 && moved > 5, `a rig from the coarse meshes alone: ${far} pivots over 1 mm away, ${moved} muscles on another bone`);
});

test('a rig file for other meshes, other joint limits or another version is refused', () => {
  assert.throws(() => B.bodyRigFromFile(file, source.entries.slice(1)), /another set of meshes/);
  assert.throws(() => B.bodyRigFromFile({ ...file, rig: { ...file.rig, version: 'x' } }, source.entries), /another rig version/);
  const limits = JSON.parse(JSON.stringify(file.rig.limits)); limits[Object.keys(limits)[0]] = [0, 1];
  assert.throws(() => B.bodyRigFromFile({ ...file, rig: { ...file.rig, limits } }, source.entries), /other joint limits/);
  assert.throws(() => B.bodyRigFromFile({ format: 'x' }, source.entries), /not a rig file/);
  assert.equal(packIndexRig({ rig: { file: '../x.json', bytes: 1, sha256: 'a'.repeat(64) } }), null);
});
