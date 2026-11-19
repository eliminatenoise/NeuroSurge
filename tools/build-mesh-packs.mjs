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
import { parseObjFast, fullbodyEyeIds } from '../scene/src/ns-assets.mjs';
import { simplifyMesh, reorderForPack, measureDeviation, weldExact, meshTopology } from './simplify-mesh.mjs';
import { RECTUS_SHEATH_OPENING, BELLY_MIDLINE, CHEST_FLATTEN, bodyRigToFile } from '../scene/src/ns-body.mjs';
import { loadPageBody } from './page-body.mjs';

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
    licence: 'Per file, as its source: BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0 (93 files) and Z-Anatomy, CC BY-SA 4.0 (18 files; adaptations under the same licence); see packets/missing-muscles-r1/ATTRIBUTION-AND-LICENCES.txt' }
]);

/** How the coarse meshes are made (tools/simplify-mesh.mjs): no vertex of a source mesh lies further than maxDevMm
 * from the coarse surface, no edge made is longer than maxEdgeMm, and the kept vertices are rounded to 1/roundPerMm mm.
 * Five kinds of mesh, by what the game does with them:
 *   body   bones and muscles: the general rule;
 *   brain  the brain is the largest thing in the picture and its folds are its look: finer;
 *   source the mesh exactly as the parser reads the source file (nothing joined, removed or rounded): the bones of
 *          the left game arm (its joints are estimated from their vertices: a sphere fitted to the capitate's head
 *          moved the wrist 17 mm on a coarse capitate), the two precentral gyri (the motor areas are laid out on their
 *          vertices), the two lacrimal bones (the eye point is taken from their vertices) and the finger and toe bones
 *          (the game draws them from a rounded copy it makes from their own vertices);
 *   cut    meshes the game itself reshapes in cells of 5 to 6 mm (the opened rectus sheath, the belly's midline, the
 *          flattened chest; ns-body RECTUS_SHEATH_OPENING, BELLY_MIDLINE, CHEST_FLATTEN): finer, so those edits keep
 *          their shape. */
const envRules = process.env.NS_COARSE_RULES ? JSON.parse(process.env.NS_COARSE_RULES) : {}; // experiments only
export const COARSE = Object.freeze({ roundPerMm: 100,
  // a closed mesh of more than volumeFromMm3 keeps at least volumeKeep of its volume (coarseMesh: the limit is lowered
  // for the mesh until it does)
  volumeKeep: 0.93, volumeFromMm3: 5,
  kinds: Object.freeze({
  body: Object.freeze({ maxDevMm: 0.5, maxEdgeMm: 10, ...envRules.body }),
  bone: Object.freeze({ maxDevMm: 0.5, maxEdgeMm: 10, ...envRules.bone }),
  brain: Object.freeze({ maxDevMm: 0.3, maxEdgeMm: 5, ...envRules.brain }),
  cut: Object.freeze({ maxDevMm: 0.4, maxEdgeMm: 5, ...envRules.cut })
}) });

/** element id -> kind, for the ids that are not 'body' (from the game's own manifest and display rules). */
export function coarseKinds({ rootDir = root } = {}) {
  const kinds = new Map();
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'inputs', 'MESH-MANIFEST.json'), 'utf8'));
  for (const a of manifest.assets) {
    const g = Array.isArray(a.groups) ? a.groups : [];
    if (g.includes('brain_motor_landmark')) kinds.set(a.element_id, 'source'); else if (g.includes('brain')) kinds.set(a.element_id, 'brain');
    else if (g.some(x => x.endsWith('_bone'))) kinds.set(a.element_id, 'source');
  }
  for (const f of ['inputs/FULLBODY-MESH-MANIFEST.json', 'packets/bodyparts3d-head-r1/HEAD-MESH-MANIFEST.json']) {
    for (const a of JSON.parse(fs.readFileSync(path.join(rootDir, f), 'utf8')).assets) {
      // 19 November 2026 (the owner: "let's fix the eyes of the mirror body ... that also means your own body"): the
      // head's eyes are three thin shells one inside the other (sclera, iris, lens); made coarse, one eye came out as a
      // dark hole and the other as a grey ball. They stay as their source files.
      if (a.tissue === 'eye') { kinds.set(a.element_id, 'source'); continue; }
      if (!(a.kind === 'bone' || a.tissue === 'bone')) continue;
      // the finger and toe bones are drawn from a rounded copy the game makes from their own vertices (ns-scene-three
      // boneTipDisplay): on coarse bones the fingers came out thin and knobbly, so they stay as their source files
      const name = String(a.embedded_source_name || (Array.isArray(a.matched_concept_names) && a.matched_concept_names[0]) || a.label || a.requested_structure || a.name || '');
      kinds.set(a.element_id, /phalan/i.test(name) ? 'source' : 'bone');
    }
  }
  // 19 November 2026 (the owner: "the mirror body's head ... the muscles are very patchy at the moment and smallpoxy"):
  // the face's muscles are sheets a millimetre or two thick lying on the skull; their coarse copies dipped under the
  // bone in patches. All 54 stay as their source files (about a megabyte more to download).
  for (const a of JSON.parse(fs.readFileSync(path.join(rootDir, 'packets', 'face-muscles-r1', 'FACE-MESH-MANIFEST.json'), 'utf8')).assets || []) if (a && typeof a.element_id === 'string') kinds.set(a.element_id, 'source');
  for (const id of fullbodyEyeIds(JSON.parse(fs.readFileSync(path.join(rootDir, 'inputs', 'FULLBODY-MESH-MANIFEST.json'), 'utf8')).assets)) kinds.set(id, 'source');
  for (const r of RECTUS_SHEATH_OPENING.rows) { kinds.set(r.sheath, 'cut'); kinds.set(r.rectus, 'cut'); }
  kinds.set(BELLY_MIDLINE.right, 'cut'); kinds.set(BELLY_MIDLINE.left, 'cut');
  for (const r of CHEST_FLATTEN.rows) kinds.set(r.id, 'cut');
  return kinds;
}

/** Six times the volume a mesh encloses (signed), and whether a triangle has no area. */
const volume6 = (P, I) => { let v = 0; for (let i = 0; i < I.length; i += 3) { const a = 3 * I[i], b = 3 * I[i + 1], c = 3 * I[i + 2]; v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]); } return v; };
export const flatTriangle = (P, a, b, c) => {
  const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2], vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  return x * x + y * y + z * z < 1e-12;
};

/** The coarse mesh of a parsed source mesh, in the parser's shape, and its record.
 * Two things are looked after beyond the kind's deviation limit (found by an independent check of the first packs):
 *  - BULK. A limit of 0.5 mm per surface is a lot for a muscle 2 mm thick: small face and neck muscles came out with
 *    half to three quarters of their volume. So a closed mesh whose coarse copy encloses less than volumeKeep of the
 *    source's volume (or that much more) is made again with a smaller limit, until it does.
 *  - NO FLAT TRIANGLES FROM ROUNDING. Rounding to 0.01 mm brought some corners of small triangles onto one point or
 *    one line (506 triangles without area in 95 meshes). The corners of such a triangle keep their source coordinates
 *    unrounded (the pack format stores a few coordinates of a file as they are), so only a triangle that is flat in
 *    the source file itself can be flat in the copy. */
export function coarseMesh(mesh, kind = 'body', coarse = COARSE) {
  const rule = { ...coarse.kinds[kind], roundPerMm: coarse.roundPerMm };
  const keep = coarse.volumeKeep || 0;
  const w = keep > 0 ? weldExact(mesh.positions, mesh.indices) : null, t0 = w ? meshTopology(w.positions, w.indices) : null;
  const v0 = w && t0.rimEdges === 0 && t0.crowdedEdges === 0 ? volume6(w.positions, w.indices) : 0; // closed surfaces only
  let maxDevMm = rule.maxDevMm, s, volume = null;
  for (let pass = 0; ; pass++) {
    s = simplifyMesh(mesh.positions, mesh.indices, { maxDevMm, maxEdgeMm: rule.maxEdgeMm });
    if (!(Math.abs(v0) > 6 * coarse.volumeFromMm3)) break;
    volume = volume6(s.positions, s.indices) / v0;
    if ((volume >= keep && volume <= 2 - keep) || pass >= 7) break;
    maxDevMm = Math.round(maxDevMm * 0.6 * 1000) / 1000;
  }
  const r = reorderForPack(s.positions, s.indices);
  // the kept vertices (source vertices) to the nearest 1/roundPerMm mm; the deviation below is measured after this
  const p = r.positions, exact = Float32Array.from(p);
  for (let i = 0; i < p.length; i++) p[i] = Math.round(p[i] * rule.roundPerMm) / rule.roundPerMm;
  // ... except the corners of a triangle the rounding would leave without area
  let unrounded = 0;
  for (let again = true, guard = 0; again && guard < 8; guard++) {
    again = false;
    for (let t = 0; t < r.indices.length; t += 3) {
      const a = r.indices[t], b = r.indices[t + 1], c = r.indices[t + 2];
      if (!flatTriangle(p, a, b, c) || flatTriangle(exact, a, b, c)) continue;
      for (const v of [a, b, c]) for (let k = 0; k < 3; k++) if (p[3 * v + k] !== exact[3 * v + k]) { p[3 * v + k] = exact[3 * v + k]; unrounded++; again = true; }
    }
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  const dev = measureDeviation(mesh.positions, p, r.indices);
  if (!(dev.maxMm <= maxDevMm + 2 / rule.roundPerMm)) throw new Error(`coarse mesh strays ${dev.maxMm} mm from its source`);
  const tris = r.indices.length / 3;
  return { mesh: { positions: p, indices: r.indices, vertexCount: p.length / 3, faceCount: tris, polygonCount: tris, bounds: { min, max }, comments: mesh.comments },
    derived: { how: 'half-edge collapse, measured deviation bound (tools/simplify-mesh.mjs)', kind, maxDevMm, maxEdgeMm: rule.maxEdgeMm, roundPerMm: rule.roundPerMm,
      sourceVertices: mesh.positions.length / 3, sourceTriangles: mesh.indices.length / 3, deviationMm: Math.round(dev.maxMm * 1000) / 1000,
      ...(volume !== null ? { volume: Math.round(volume * 1000) / 1000 } : {}), ...(unrounded ? { unroundedCoordinates: unrounded } : {}) } };
}

export function buildPack(spec, { rootDir = root, detail = 'coarse', rule = COARSE } = {}) {
  const entries = [];
  const kinds = detail === 'coarse' ? coarseKinds({ rootDir }) : null;
  let sourceVertices = 0, sourceTriangles = 0;
  for (const packet of spec.packets) {
    const dir = path.join(rootDir, 'packets', packet, 'meshes');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.obj')).sort()) {
      const bytes = fs.readFileSync(path.join(dir, file));
      const mesh = parseObjFast(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), { knownUtf8Bytes: bytes.length });
      sourceVertices += mesh.positions.length / 3; sourceTriangles += mesh.indices.length / 3;
      const e = { key: `${packet}/meshes/${file}`, sourceBytes: bytes.length, sourceSha256: sha256(bytes), mesh };
      const kind = detail === 'coarse' ? kinds.get(file.replace(/\.obj$/, '')) || 'body' : 'source';
      if (kind !== 'source') Object.assign(e, coarseMesh(mesh, kind, rule));
      entries.push(e);
    }
  }
  const raw = encodePack({ name: spec.name, licence: spec.licence, entries });
  // The proof, at build time: what comes back out is what went in (for an exact pack: what the parser gave).
  const back = decodePack(raw);
  assert.equal(back.meshes.size, entries.length);
  for (const e of entries) {
    const b = back.meshes.get(e.key);
    assert.ok(b && b.sourceSha256 === e.sourceSha256 && b.sourceBytes === e.sourceBytes, `${e.key}: record`);
    assert.deepStrictEqual(b.mesh, e.mesh, `${e.key}: decoded mesh differs from the mesh packed`);
  }
  const gz = zlib.gzipSync(raw, { level: 9, memLevel: 9 });
  gz[9] = 255; // the "operating system" byte of the gzip header: fixed, so every machine writes the same bytes
  let vertices = 0, triangles = 0, sourceBytes = 0;
  for (const e of entries) { vertices += e.mesh.positions.length / 3; triangles += e.mesh.indices.length / 3; sourceBytes += e.sourceBytes; }
  return { gz, raw, record: { name: spec.name, file: `${spec.name}.nspack`, stage: spec.stage, detail, packets: [...spec.packets], licence: spec.licence,
    bytes: gz.length, sha256: sha256(gz), rawBytes: raw.length, files: entries.length, vertices, triangles, sourceVertices, sourceTriangles, sourceBytes,
    keys: entries.map(e => e.key) } };
}

/** The rig built from the SOURCE meshes as the page prepares them (tools/page-body.mjs), as file text. */
export async function buildRigText(opts = {}) {
  const { rig } = await loadPageBody(opts.rootDir || root);
  return JSON.stringify(bodyRigToFile(rig)) + '\n';
}

export async function buildAll({ detail = 'coarse', rule = COARSE, ...opts } = {}) {
  const built = PACKS.map(s => buildPack(s, { ...opts, detail, rule }));
  const rigText = await buildRigText(opts);
  const index = { format: PACK_INDEX_FORMAT, detail,
    note: detail === 'coarse'
      ? 'Coarser copies of the source packets\' meshes, made by tools/build-mesh-packs.mjs with tools/simplify-mesh.mjs: documented derivatives (packs/README.md). The source packets, their manifests, hashes and licence records are unchanged; each pack keeps the licence of its sources.'
      : 'Lossless compact copies of what the game reads from the source packets (scene/src/ns-pack.mjs; made by tools/build-mesh-packs.mjs --exact). The source packets, their manifests, hashes and licence records are unchanged; each pack keeps the licence of its sources.',
    ...(detail === 'coarse' ? { rule } : {}),
    rig: { file: 'BODY-RIG.json', bytes: Buffer.byteLength(rigText), sha256: sha256(Buffer.from(rigText)),
      note: 'The body rig (joint pivots and axes, which bone each muscle rides), estimated by tools/page-body.mjs from the SOURCE meshes exactly as the page prepares them; the game builds its rig from the coarser meshes with these pivots and muscle rows and checks the result against this file (ns-body bodyRigFromFile, bodyRigMatchesFile).' },
    packs: built.map(b => b.record) };
  return { built, rigText, indexText: JSON.stringify(index, null, 1) + '\n' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  // --exact: lossless packs (every mesh exactly as parsed), for comparison; --out DIR: write somewhere else (the pin in
  // the game's code is only written for the default folder)
  const exact = process.argv.includes('--exact');
  const outAt = process.argv.indexOf('--out');
  const { built, indexText, rigText } = await buildAll({ detail: exact ? 'exact' : 'coarse' });
  const dir = outAt > 0 ? path.resolve(process.argv[outAt + 1]) : path.join(root, 'packs');
  const pinning = outAt < 0;
  let differs = false;
  if (!check) fs.mkdirSync(dir, { recursive: true });
  for (const b of built) {
    const p = path.join(dir, b.record.file);
    if (check) { if (!fs.existsSync(p) || sha256(fs.readFileSync(p)) !== b.record.sha256) { differs = true; console.log('DIFFERS', b.record.file); } }
    else fs.writeFileSync(p, b.gz);
    console.log(`${b.record.file.padEnd(26)} ${String(b.record.files).padStart(4)} files  ${(b.record.sourceBytes / 1e6).toFixed(1).padStart(6)} MB of OBJ -> ${(b.record.bytes / 1e6).toFixed(2).padStart(6)} MB  (${b.record.vertices} vertices, ${b.record.triangles} of ${b.record.sourceTriangles} triangles)`);
  }
  const rp = path.join(dir, 'BODY-RIG.json');
  if (check) { if (!fs.existsSync(rp) || fs.readFileSync(rp, 'utf8') !== rigText) { differs = true; console.log('DIFFERS BODY-RIG.json'); } }
  else fs.writeFileSync(rp, rigText);
  console.log(`BODY-RIG.json              ${(Buffer.byteLength(rigText) / 1e3).toFixed(0)} kB (the rig from the source meshes)`);
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
  if (!pinning) { /* a side build: the game's pin is left alone */ }
  else if (check) { if (!code.includes(`PACK_INDEX_SHA256 = '${pin}'`)) { differs = true; console.log('DIFFERS the pin in scene/src/ns-pack.mjs'); } }
  else if (!code.includes(`PACK_INDEX_SHA256 = '${pin}'`)) fs.writeFileSync(codePath, code.replace(pinRe, `$1${pin}$2`));
  if (check && differs) process.exit(1);
}
