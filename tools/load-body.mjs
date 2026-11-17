/** NeuroSurge tool (project code, CC0): loads the game's body from disk the way the page does (the same loaders, the
 * files read with fs, every hash checked) and builds the rig and the baked start posture. For tools/rom-sweep.mjs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function loadBody(repo) {
  const app = await import(path.join(repo, 'scene/src/ns-app.mjs'));
  const body = await import(path.join(repo, 'scene/src/ns-body.mjs'));
  const assets = await import(path.join(repo, 'scene/src/ns-assets.mjs'));
  const ex = path.join(repo, 'scene/example/');
  const fetchText = async url => fs.readFile(path.resolve(ex, url), 'utf8');
  const fetchBytes = async url => new Uint8Array(await fs.readFile(path.resolve(ex, url)));
  const sha256Hex = async text => createHash('sha256').update(text, 'utf8').digest('hex');
  const sha256HexBytes = async bytes => createHash('sha256').update(bytes).digest('hex');
  let inputs = await app.loadFullBodyInputs({ fetchText, sha256Hex });
  const notes = [];
  // the extra muscle packet (latissimus, erector spinae, rectus abdominis, inner thigh, outer shin ...)
  try {
    const job = app.startMissingMusclesStream({ fetchText, sha256Hex, fetchBytes, sha256HexBytes, fullbodyEntries: inputs.entries, excludeIds: inputs.entries.map(e => e.element_id), deny: body.genitalAnatomyTerms });
    const r = await (typeof job.start === 'function' ? job.start() : job.done);
    if (r && r.status === 'complete') { const extra = assets.packetAppInputs(await job.manifest, r); inputs = assets.mergeAppInputs(inputs, extra); notes.push(`missing muscles merged: ${extra.entries.length}`); }
    else notes.push('missing muscles: ' + (r && (r.error || r.status)));
  } catch (e) { notes.push('missing muscles not loaded: ' + String(e && e.message || e).slice(0, 200)); }
  const rig = body.buildBodyRig(inputs.entries, inputs.meshesById);
  const baked = body.bakeBodyPosture(rig, inputs.meshesById, { posture: body.DEFAULT_BODY_POSTURE });
  return { app, body, inputs, rig, baked, notes };
}
