#!/usr/bin/env node
// NeuroSurge: write the loading picture's table of parts (scene/src/ns-assembly-parts.mjs) from the packet manifests.
//
//   node tools/build-assembly-parts.mjs            write the table
//   node tools/build-assembly-parts.mjs --check    compare with the committed table (exit 1 if it differs)
//
// The loading picture places each mesh by its kind and its place in the inside-out order (ns-assembly assemblyPartOf:
// the manifest entry, and the game's own layer of each muscle, ns-body bodyMuscleLayer). Since 20 November 2026 the
// picture starts before the game's own scripts are in, and draws the meshes as the packs arrive, before the game has
// fetched a manifest; so the place of every mesh the game waits for is worked out here, beforehand, and the picture
// needs neither the manifests (1.8 MB) nor ns-body (600 kB) to begin. tests/assembly-parts.test.mjs checks the table
// against the manifests and ns-body; run this tool when either changes. A mesh the table does not know is still drawn,
// later, from the manifest the game fetches. Deterministic (manifest order, fixed rounding).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemblyPartsRowsOfManifest, ASSEMBLY_PART_MANIFESTS } from '../scene/src/ns-assembly.mjs';
import { bodyMuscleLayer, bodyShapeLimbOf, bulkLimbChain } from '../scene/src/ns-body.mjs';
import { validateShoulderGirdleManifest } from '../scene/src/ns-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'scene', 'src', 'ns-assembly-parts.mjs');

export function buildAssemblyPartsSource() {
  const groups = new Map(); // packet -> rows
  let n = 0;
  for (const rel of ASSEMBLY_PART_MANIFESTS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    // (the left arm packet's eight shoulder-girdle entries are body entries in the game, with their own rig hints)
    let girdle = new Map();
    try { girdle = new Map(validateShoulderGirdleManifest(manifest).entries.map(e => [e.element_id, e])); } catch { /* not the arm packet's manifest */ }
    const limbOf = e => bodyShapeLimbOf(girdle.get(e.element_id) || e);
    for (const [packet, row] of assemblyPartsRowsOfManifest(manifest, bodyMuscleLayer, limbOf)) {
      if (!groups.has(packet)) groups.set(packet, []);
      groups.get(packet).push(row); n++;
    }
  }
  const lines = [];
  lines.push('/** NeuroSurge loading picture: where each mesh the game waits for goes in the picture (its kind, its tier in the');
  lines.push(' * inside-out order, its place in the tier, and for a part of the brain its atlas name, which says which half it is in).');
  lines.push(' * WRITTEN BY tools/build-assembly-parts.mjs from the packet manifests and ns-body bodyMuscleLayer; do not edit by hand');
  lines.push(' * (tests/assembly-parts.test.mjs checks it against them). It lets the loading picture start, and place the meshes of');
  lines.push(' * the packs as they arrive, before the game has fetched a manifest (ns-assembly). A display order, nothing measured. */');
  lines.push(`export const ASSEMBLY_PARTS_FROM = Object.freeze(${JSON.stringify(ASSEMBLY_PART_MANIFESTS)});`);
  lines.push(`export const ASSEMBLY_PARTS_COUNT = ${n};`);
  // 20 November 2026 (ns-body-shape: longer limbs): the limbs' reference chains, so the picture draws the limbs as long
  // as the game does (each body row of a limb carries the limb as its sixth item: ns-body bodyShapeLimbOf)
  const chains = {};
  for (const g of ['r_arm', 'l_arm', 'r_leg', 'l_leg']) { const c = bulkLimbChain(g.slice(2), g[0]); if (c) chains[g] = c.pts.map(p => p.map(v => Math.round(v * 1000) / 1000)); }
  lines.push('/** limb -> its reference chain [P0, P1, P2, P3] (atlas mm; ns-body bulkLimbChain), for ns-body-shape limbLengthField. */');
  lines.push(`export const ASSEMBLY_LIMB_CHAINS = Object.freeze(${JSON.stringify(chains)});`);
  lines.push('/** packet -> [[file id (the mesh file name without .obj), kind, tier, frac, name (brain parts only), limb (limb parts\n * only: ns-body bodyShapeLimbOf)], ...] */');
  lines.push('export const ASSEMBLY_PARTS = Object.freeze({');
  const packets = [...groups.keys()];
  packets.forEach((packet, i) => {
    lines.push(`  ${JSON.stringify(packet)}: Object.freeze([`);
    const rows = groups.get(packet);
    rows.forEach((r, k) => lines.push(`    ${JSON.stringify(r)}${k < rows.length - 1 ? ',' : ''}`));
    lines.push(`  ])${i < packets.length - 1 ? ',' : ''}`);
  });
  lines.push('});');
  return lines.join('\n') + '\n';
}

const invoked = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (invoked) {
  const text = buildAssemblyPartsSource();
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (now !== text) { console.error('scene/src/ns-assembly-parts.mjs is out of date: run node tools/build-assembly-parts.mjs'); process.exitCode = 1; }
    else console.log('ns-assembly-parts.mjs is up to date');
  } else {
    fs.writeFileSync(out, text);
    console.log(`wrote ${path.relative(root, out)} (${text.length} bytes)`);
  }
}
