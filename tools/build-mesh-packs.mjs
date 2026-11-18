#!/usr/bin/env node
// NeuroSurge: make the mesh packs (packs/*.nspack and packs/PACK-INDEX.json) from the source packets.
//
//   node tools/build-mesh-packs.mjs            write the packs and the index
//   node tools/build-mesh-packs.mjs --check    build in memory and compare with the committed files (exit 1 if they differ)
//
// A pack is a lossless, compact copy of what the game reads from every OBJ file of one source packet (positions and
// triangles; see scene/src/ns-pack.mjs). The source packets stay in the repository, unchanged, with their manifests,
// SHA256SUMS and licence records; every pack entry records the byte count and SHA-256 of the file it was made from,
// and the game still checks both against its pinned manifests. This tool refuses to write a pack whose decoded
// meshes are not identical to the parsed source files. Deterministic: the same sources give the same bytes
// (files in name order, fixed gzip settings, no dates).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { encodePack, decodePack, PACK_INDEX_FORMAT } from '../scene/src/ns-pack.mjs';
import { parseObjFast } from '../scene/src/ns-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = b => createHash('sha256').update(b).digest('hex');

/** The packs: name, the source packets each holds, when the game needs it, and the licence of its sources. */
export const PACKS = Object.freeze([
  { name: 'arm-brain', packets: ['pov-demo-assets', 'pov-demo-assets-r2'], stage: 'start',
    licence: 'BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0; see CREDITS-AND-LICENCES.md and ASSET-ATTRIBUTION-INDEX.md' },
  { name: 'fullbody', packets: ['bodyparts3d-fullbody-r1'], stage: 'start',
    licence: 'BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0; see packets/bodyparts3d-fullbody-r1/ATTRIBUTION-AND-LICENCES.txt' },
  { name: 'head', packets: ['bodyparts3d-head-r1'], stage: 'start',
    licence: 'BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0; see packets/bodyparts3d-head-r1/ATTRIBUTION-AND-LICENCES.txt' },
  { name: 'face-muscles', packets: ['face-muscles-r1'], stage: 'start',
    licence: 'Z-Anatomy, CC BY-SA 4.0 (this pack is an adaptation under the same licence); see packets/face-muscles-r1/ATTRIBUTION-AND-LICENCES.txt' },
  { name: 'missing-muscles', packets: ['missing-muscles-r1'], stage: 'start',
    licence: 'Per file, as its source: BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0 (93 files) and Z-Anatomy, CC BY-SA 4.0 (18 files; adaptations under the same licence); see packets/missing-muscles-r1/ATTRIBUTION-AND-LICENCES.txt' },
  { name: 'cerebral-arteries', packets: ['bodyparts3d-cerebral-arteries-r1'], stage: 'late',
    licence: 'BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0; see packets/bodyparts3d-cerebral-arteries-r1/ATTRIBUTION-AND-LICENCES.txt' }
]);

export function buildPack(spec, { rootDir = root } = {}) {
  const entries = [];
  for (const packet of spec.packets) {
    const dir = path.join(rootDir, 'packets', packet, 'meshes');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.obj')).sort()) {
      const bytes = fs.readFileSync(path.join(dir, file));
      const mesh = parseObjFast(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), { knownUtf8Bytes: bytes.length });
      entries.push({ key: `${packet}/meshes/${file}`, sourceBytes: bytes.length, sourceSha256: sha256(bytes), mesh });
    }
  }
  const raw = encodePack({ name: spec.name, licence: spec.licence, entries });
  // The proof of losslessness, at build time: what comes back out is what the parser gave.
  const back = decodePack(raw);
  assert.equal(back.meshes.size, entries.length);
  for (const e of entries) {
    const b = back.meshes.get(e.key);
    assert.ok(b && b.sourceSha256 === e.sourceSha256 && b.sourceBytes === e.sourceBytes, `${e.key}: record`);
    assert.deepStrictEqual(b.mesh, e.mesh, `${e.key}: decoded mesh differs from the parsed source file`);
  }
  const gz = zlib.gzipSync(raw, { level: 9, memLevel: 9 });
  gz[9] = 255; // the "operating system" byte of the gzip header: fixed, so every machine writes the same bytes
  let vertices = 0, triangles = 0, sourceBytes = 0;
  for (const e of entries) { vertices += e.mesh.positions.length / 3; triangles += e.mesh.indices.length / 3; sourceBytes += e.sourceBytes; }
  return { gz, raw, record: { name: spec.name, file: `${spec.name}.nspack`, stage: spec.stage, packets: [...spec.packets], licence: spec.licence,
    bytes: gz.length, sha256: sha256(gz), rawBytes: raw.length, files: entries.length, vertices, triangles, sourceBytes,
    keys: entries.map(e => e.key) } };
}

export function buildAll(opts) {
  const built = PACKS.map(s => buildPack(s, opts));
  const index = { format: PACK_INDEX_FORMAT,
    note: 'Lossless compact copies of what the game reads from the source packets (scene/src/ns-pack.mjs; made by tools/build-mesh-packs.mjs). The source packets, their manifests, hashes and licence records are unchanged; each pack keeps the licence of its sources.',
    packs: built.map(b => b.record) };
  return { built, indexText: JSON.stringify(index, null, 1) + '\n' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { built, indexText } = buildAll();
  const dir = path.join(root, 'packs');
  let differs = false;
  if (!check) fs.mkdirSync(dir, { recursive: true });
  for (const b of built) {
    const p = path.join(dir, b.record.file);
    if (check) { if (!fs.existsSync(p) || sha256(fs.readFileSync(p)) !== b.record.sha256) { differs = true; console.log('DIFFERS', b.record.file); } }
    else fs.writeFileSync(p, b.gz);
    console.log(`${b.record.file.padEnd(26)} ${String(b.record.files).padStart(4)} files  ${(b.record.sourceBytes / 1e6).toFixed(1).padStart(6)} MB of OBJ -> ${(b.record.bytes / 1e6).toFixed(2).padStart(6)} MB  (${b.record.vertices} vertices, ${b.record.triangles} triangles)`);
  }
  const ip = path.join(dir, 'PACK-INDEX.json');
  if (check) { if (!fs.existsSync(ip) || fs.readFileSync(ip, 'utf8') !== indexText) { differs = true; console.log('DIFFERS PACK-INDEX.json'); } }
  else fs.writeFileSync(ip, indexText);
  const pin = sha256(Buffer.from(indexText));
  console.log('PACK-INDEX.json sha256', pin);
  // the pinned hash of the index, in the game's code
  const codePath = path.join(root, 'scene', 'src', 'ns-pack.mjs');
  const code = fs.readFileSync(codePath, 'utf8');
  const pinRe = /(export const PACK_INDEX_SHA256 = ')[0-9a-f]{64}(';)/;
  if (!pinRe.test(code)) { console.error('ns-pack.mjs has no PACK_INDEX_SHA256 line'); process.exit(1); }
  if (check) { if (!code.includes(`PACK_INDEX_SHA256 = '${pin}'`)) { differs = true; console.log('DIFFERS the pin in scene/src/ns-pack.mjs'); } }
  else if (!code.includes(`PACK_INDEX_SHA256 = '${pin}'`)) fs.writeFileSync(codePath, code.replace(pinRe, `$1${pin}$2`));
  if (check && differs) process.exit(1);
}
