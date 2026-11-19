/** NeuroSurge tool (project code, CC0): the body exactly as the PAGE prepares it, step for step (ns-app
 * finishBodyOnce), from the source packets on disk with every hash checked: the full body, the eight shoulder-girdle
 * meshes of the arm packet, the flattened chest, the face muscles, the cranium and eyes (with the scalp muscles
 * conformed onto them), the missing muscles, the opened rectus sheath, the closed belly midline, the trained build;
 * then the rig (ns-body buildBodyRig).
 *
 * For tools/build-mesh-packs.mjs, which writes that rig to packs/BODY-RIG.json: the game draws coarser meshes
 * (packs/README.md), but the joints' pivots are estimated from where a bone's vertices lie, so a rig built from the
 * coarse meshes would have its pivots a few millimetres elsewhere. The game therefore takes the rig made from the
 * SOURCE meshes.
 *
 * (tools/load-body.mjs is the older, shorter variant used by the range-of-motion sweep; it leaves out the girdle,
 * the face and the head.) */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** meshFor(id, mesh): optional; lets a caller swap a mesh's geometry in before any step runs (returns a mesh or
 * nothing); rigFile: optional, the content of packs/BODY-RIG.json (the rig is then built with that rig's pivots and muscle rows, as
 * the game does). Returns { entries, meshesById (as handed to buildBodyRig), rig, notes }. */
export async function loadPageBody(repo = here, { meshFor = null, rigFile = null } = {}) {
  const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
  const body = await import(path.join(repo, 'scene/src/ns-body.mjs'));
  const assets = await import(path.join(repo, 'scene/src/ns-assets.mjs'));
  const ex = path.join(repo, 'scene/example/');
  const fetchText = async url => fs.readFile(path.resolve(ex, url), 'utf8');
  const fetchBytes = async url => new Uint8Array(await fs.readFile(path.resolve(ex, url)));
  const sha256Hex = async text => createHash('sha256').update(text, 'utf8').digest('hex');
  const sha256HexBytes = async bytes => createHash('sha256').update(bytes).digest('hex');
  const notes = [];
  const swap = x => {
    if (typeof meshFor !== 'function') return x;
    const m = new Map();
    for (const [id, mesh] of x.meshesById) { const c = meshFor(id, mesh); m.set(id, c ? { ...mesh, positions: c.positions, indices: c.indices } : mesh); }
    return { ...x, meshesById: m };
  };
  // the arm and brain inputs (the page reads them first; their ids are kept out of the body)
  const packetBases = { 'pov-demo-assets': '../../packets/pov-demo-assets/', 'pov-demo-assets-r2': '../../packets/pov-demo-assets-r2/' };
  const inputs = await app.loadInputs({ manifestUrl: '../../inputs/MESH-MANIFEST.json', packetBases, movementMapUrl: '../../inputs/MOVEMENT-MAP.json', fetchText, sha256Hex, fetchBytes, sha256HexBytes });
  const armIds = [...inputs.assets.arm.keys(), ...inputs.assets.brain.keys()];
  const deny = body.genitalAnatomyTerms;
  // 1. the full body
  const bodyJob = app.startFullBodyStream({ fetchText, sha256Hex, fetchBytes, sha256HexBytes, expectedManifestSha256: app.PINNED_SHA256.fullbodyManifest });
  let base = swap(await bodyJob.start());
  // 2. the shoulder girdle of the arm packet
  {
    const job = assets.streamShoulderGirdleAssets({ manifest: inputs.meshManifest, deny, excludeIds: [...base.entries.map(e => e.element_id), ...armIds],
      readBytes: (p, entry) => fetchBytes(packetBases[entry.source_packet] + p), sha256HexBytes, concurrency: 1 });
    const r = await job.start();
    base = assets.mergeAppInputs(base, swap(assets.shoulderGirdleAppInputs(inputs.meshManifest, r)));
  }
  // 3. the chest drawn flat
  { const o = body.flattenChest(base.meshesById); base = { ...base, meshesById: o.meshesById }; }
  const b = base;
  const excludeIds = [...b.entries.map(e => e.element_id), ...armIds];
  let inputsB = b;
  // 4. the face and chewing muscles
  const faceJob = app.startFaceStream({ fetchText, sha256Hex, fetchBytes, sha256HexBytes, expectedManifestSha256: app.PINNED_SHA256.faceManifest, fullbodyEntries: b.entries, excludeIds, deny });
  const faceR = await faceJob.start();
  if (!faceR || faceR.status !== 'complete') throw new Error(`face packet: ${faceR && (faceR.error || faceR.status)}`);
  const face = swap(assets.packetAppInputs(await faceJob.manifest, faceR));
  inputsB = assets.mergeAppInputs(b, face);
  // 5. the cranium and eyes; the scalp muscles conformed onto the new bones
  const headJob = app.startHeadStream({ fetchText, sha256Hex, fetchBytes, sha256HexBytes, expectedManifestSha256: app.PINNED_SHA256.headManifest, fullbodyEntries: b.entries, excludeIds, deny });
  const headR = await headJob.start();
  if (!headR || headR.status !== 'complete') throw new Error(`head packet: ${headR && (headR.error || headR.status)}`);
  const headIn = swap(assets.packetAppInputs(await headJob.manifest, headR));
  {
    const merged = assets.mergeAppInputs(inputsB, headIn);
    const faceIds = new Set(inputsB.entries.filter(e => e && e.source_packet === assets.FACE_PACKET_ID).map(e => e.element_id));
    const c = body.conformMusclesToBones(merged.meshesById, {
      boneIds: headIn.entries.filter(e => /parietal|occipital/.test(String(e.concept || e.name || '').toLowerCase())).map(e => e.element_id), muscleIds: [...faceIds] });
    for (const [id, positions] of c.positions) merged.meshesById.set(id, { ...merged.meshesById.get(id), positions });
    inputsB = merged;
  }
  // 6. the missing muscles; the rectus sheath opened; the belly closed at the midline
  const musclesJob = app.startMissingMusclesStream({ fetchText, sha256Hex, fetchBytes, sha256HexBytes, expectedManifestSha256: app.PINNED_SHA256.missingMusclesManifest, fullbodyEntries: b.entries, excludeIds, deny });
  const musclesR = await musclesJob.start();
  if (!musclesR || musclesR.status !== 'complete') throw new Error(`missing-muscles packet: ${musclesR && (musclesR.error || musclesR.status)}`);
  inputsB = assets.mergeAppInputs(inputsB, swap(assets.packetAppInputs(await musclesJob.manifest, musclesR)));
  { const o = body.openRectusSheath(inputsB.meshesById); inputsB = { ...inputsB, meshesById: o.meshesById }; }
  { const o = body.closeBellyMidline(inputsB.meshesById); inputsB = { ...inputsB, meshesById: o.meshesById }; }
  // 7. the trained build
  { const o = body.bulkBody(inputsB.entries, inputsB.meshesById); inputsB = { ...inputsB, entries: o.entries || inputsB.entries, meshesById: o.meshesById }; }
  // 8. the rig
  const rig = body.buildBodyRig(inputsB.entries, inputsB.meshesById, rigFile ? { prebuilt: body.bodyRigFromFile(rigFile, inputsB.entries) } : {});
  notes.push(`${inputsB.entries.length} entries, ${Object.keys(rig.meshSegment).length} meshes in the rig`);
  return { app, body, assets, entries: inputsB.entries, meshesById: inputsB.meshesById, rig, notes };
}
