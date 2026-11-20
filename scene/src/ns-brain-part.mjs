/** The two halves of the brain drawn apart (19 November 2026).
 *
 * The owner: "let's center the motor strip on either side of the head of the mirror body. So maybe we'll keep a bigger
 * gap between the hemispheres. So it looks like almost hair coming out of either side of the mirror body's head."
 *
 * WHAT THIS IS. A display choice with no anatomical meaning. Every mesh of a cerebral half is moved `eachMm` straight
 * away from the midline (the left half toward +x, the right half toward -x; BodyParts3D atlas millimetres), so the gap
 * between the two leg areas at the top of the n-shaped motor strip is wide enough for the mirror body's head to stand
 * in it. In the atlas the two halves lie about 2 mm apart. Nothing inside a half changes in front of the motor strip's
 * back edge: the same meshes, the same areas, the same distances within the half; behind it the step eases off so the
 * gap closes at the back (HEMI_GAP.back, 20 November 2026). The parts in the middle that belong to neither half (the brainstem, the
 * cerebellum, the hypothalamus, the ventricles of the midline: `middle`, words of their atlas names) stay where they
 * are and show at the bottom of the gap.
 *
 * The move is made ONCE, on the loaded positions, before anything is built from them (ns-app start; the loading
 * picture's worker does the same to the meshes it draws), so the areas, the picker, the labels, the light beams, the
 * turn arrows, the outline and the hidden-things picture all come from the parted brain and agree with what is drawn.
 * The eyeballs and the ends of their nerves follow their halves (ns-brain-eyes), and so do the brain's vessels when
 * they are drawn (partedOnBrain, partedBridging; ns-scene-three setBrainVessels). eachMm 0 = the atlas brain as it is.
 *
 * Pure: no imports, no Three.js, no DOM (the loading picture's worker imports this file).
 */
export const HEMI_GAP = Object.freeze({
  eachMm: 6,
  middle: Object.freeze(['third ventricle', 'fourth ventricle', 'aqueduct', 'habenula', 'hypothalamus', 'colliculus', 'medulla', 'midbrain', 'pons', 'tuber cinereum', 'cerebellum', 'pineal']),
  /* 20 November 2026 (package LAYOUT): the gap closes toward the back of the brain. With the whole of each half moved
   * eachMm, the gap ran open to the back, and behind the cerebellum (whose back end is about 22 mm in front of the
   * occipital poles) nothing lay under it: seen from behind and above (E), the gap ended in a dark notch of the room
   * between the two back ends of the brain. Now a point's step is the whole eachMm in front of fullToYMm (atlas y, which
   * grows toward the back), none behind noneFromYMm, eased between (backShareAt): the two occipital poles lie as close
   * as in the atlas (about 2 mm, a fissure), and the gap is open from the brain's front to just behind the motor strip
   * (the precentral gyri end at y -39), where the mirror body's head stands. Behind fullToYMm a half is bent toward
   * the midline, by at most eachMm: a display choice like the gap itself. */
  back: Object.freeze({ fullToYMm: -38, noneFromYMm: -10 })
});

/** The share (0..1) of a half's step at atlas y (mm; y grows toward the back of the head): 1 in front of
 * back.fullToYMm, 0 behind back.noneFromYMm, a smooth step between. back null: 1 everywhere. Pure. */
export function backShareAt(y, back = HEMI_GAP.back) {
  if (!back || !(back.noneFromYMm > back.fullToYMm)) return 1;
  const t = (y - back.fullToYMm) / (back.noneFromYMm - back.fullToYMm);
  if (!(t > 0)) return 1;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

/** Which way a brain mesh moves when the halves are drawn apart: +1 (the left half, toward +x), -1 (the right half) or
 * 0 (a part of the middle, or a mesh that lies across the midline). From its atlas name where that says left or right,
 * else from where its points lie. mesh: { name?, positions }. Pure. */
export function hemisphereSideOf(mesh, { middle = HEMI_GAP.middle } = {}) {
  const name = String((mesh && mesh.name) || '').toLowerCase();
  if (middle.some(w => name.includes(w))) return 0;
  if (/\bleft\b/.test(name)) return 1;
  if (/\bright\b/.test(name)) return -1;
  const p = mesh && mesh.positions;
  if (!p || !p.length) return 0;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) hi = p[i]; }
  // (the atlas midline is at about x = -0.6 mm: the left half's meshes start at -0.5 or more, the right half's end at -0.6 or less)
  return lo >= -1 ? 1 : hi <= 0 ? -1 : 0;
}

/** A copy of `positions` (xyz triples, atlas mm) moved `side * eachMm` along x, times backShareAt(y) toward the back
 * (back null: the whole step everywhere); the same array when nothing moves. Pure. */
export function partedPositions(positions, side, eachMm = HEMI_GAP.eachMm, back = HEMI_GAP.back) {
  if (!side || !(eachMm > 0)) return positions;
  const out = new positions.constructor(positions.length), d = side * eachMm;
  for (let i = 0; i < positions.length; i += 3) { out[i] = positions[i] + d * backShareAt(positions[i + 1], back); out[i + 1] = positions[i + 1]; out[i + 2] = positions[i + 2]; }
  return out;
}

/* 20 November 2026 (review of updates 49 to 56): the brain's vessels (ns-vessels; switched off in the plain game,
 * ns-app PLAIN_GAME.vessels, but their code stays to be switched on again) were laid on the atlas brain and did not
 * follow its halves: the arteries stayed where the atlas has them (the middle cerebral branches sank 6 mm into their
 * moved halves, the anterior cerebral ones hung in the open gap) and the veins were draped on an envelope that sank
 * into the gap at the midline. The two rules below move them with the parting. */

/** The cerebral arteries (atlas meshes of their own, registered to the atlas brain): a copy of each mesh's positions
 * moved as the brain under it moved. A point of an artery of side s (+1 a left one, -1 a right one, 0 one of the
 * midline: it stays) moves s x eachMm x backShareAt(y) x share, share = w(own half) / (w(own half) + w(middle)), where
 * w = 1 / max(d, minMm)^2 and d is the point's distance to the nearest atlas vertex of its own cerebral half, or of the
 * parts of the middle that stay (the brainstem, the cerebellum, the hypothalamus ...); nothing within searchMm: w 0;
 * neither: share 1. So a branch on a half's cortex goes with its half and stays in its sulcus, a branch on the
 * brainstem or the cerebellum stays, and the arteries under the brain between the two (the circle of Willis: the
 * first parts of the anterior and posterior cerebral arteries, the communicating arteries) stretch between them
 * instead of tearing. The share is then averaged `smoothPasses` times over every artery point within `smoothMm`
 * (across meshes) and the mesh's own edges (when it has indices), so a vessel's cross-section moves as one, a vessel
 * stretches evenly along its length, and two vessels move alike where they meet. The opposite half is not asked: in
 * the midline fissure the other half's medial wall lies as near as a vessel's own. meshes: [{ positions, indices?,
 * side }]; brain: [{ side, positions }] in ATLAS mm (side as hemisphereSideOf). Returns new position arrays (the same
 * array for a mesh that does not move). About 0.3 s for the 80 artery meshes on the 59 brain meshes, once. Pure. */
export function partedOnBrain(meshes, brain, { eachMm = HEMI_GAP.eachMm, back = HEMI_GAP.back, searchMm = 10, minMm = 0.5, cellMm = 5, smoothMm = 1.5, smoothPasses = 16 } = {}) {
  const list = Array.isArray(meshes) ? meshes : [];
  if (!(eachMm > 0)) return list.map(m => m.positions);
  // one grid of atlas vertices per part: the left half (+1), the right half (-1), the middle (0)
  const grids = new Map([[1, new Map()], [-1, new Map()], [0, new Map()]]);
  const cellOf = v => Math.floor(v / cellMm), key = (a, b, c) => ((a & 1023) * 1024 + (b & 1023)) * 1024 + (c & 1023); // < 1024 cells a side
  for (const b of Array.isArray(brain) ? brain : []) {
    const g = b && grids.get(b.side), P = b && b.positions;
    if (!g || !P) continue;
    for (let i = 0; i + 2 < P.length; i += 3) { const k = key(cellOf(P[i]), cellOf(P[i + 1]), cellOf(P[i + 2])); let l = g.get(k); if (!l) g.set(k, l = []); l.push(P[i], P[i + 1], P[i + 2]); }
  }
  // the distance from (x, y, z) to the nearest vertex of grid g (Infinity beyond limitMm): rings of cells outward,
  // stopping once the best found is nearer than the next ring can be
  const nearest = (g, x, y, z, limitMm) => {
    const a = cellOf(x), b = cellOf(y), c = cellOf(z), rings = Math.ceil(limitMm / cellMm);
    let best = Infinity;
    for (let r = 0; r <= rings; r++) {
      if (best <= Math.max(0, r - 1) * cellMm) break;
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        const edge = i === -r || i === r || j === -r || j === r; // on the shell of ring r: every k; inside it: k = -r and r
        for (let k = -r; k <= r; k += edge || r === 0 ? 1 : 2 * r) {
          const l = g.get(key(a + i, b + j, c + k));
          if (!l) continue;
          for (let q = 0; q < l.length; q += 3) { const d = (l[q] - x) ** 2 + (l[q + 1] - y) ** 2 + (l[q + 2] - z) ** 2; if (d < best * best) best = Math.sqrt(d); }
        }
      }
    }
    return best <= limitMm ? best : Infinity;
  };
  const w = d => (Number.isFinite(d) ? 1 / Math.max(d, minMm) ** 2 : 0);
  // the raw share of every point of every artery (a midline artery: 0, it stays)
  const shares = list.map(m => {
    const P = m && m.positions, s = m && m.side;
    if (!P || (s !== 1 && s !== -1)) return P ? new Float64Array(P.length / 3) : null;
    const n = P.length / 3, share = new Float64Array(n), own = grids.get(s), mid = grids.get(0);
    for (let v = 0; v < n; v++) {
      // (the middle is looked for only as far as it could still matter: 10 x the own half's distance, share >= 0.99)
      const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], dOwn = nearest(own, x, y, z, searchMm);
      const wo = w(dOwn), wm = w(nearest(mid, x, y, z, Math.min(searchMm, 10 * Math.max(dOwn, minMm))));
      share[v] = wo + wm > 0 ? wo / (wo + wm) : 1;
    }
    return share;
  });
  // smoothed in space over ALL the arteries (every point within smoothMm, whatever mesh it belongs to; a midline
  // artery's points keep 0), so a vessel's cross-section moves as one and two vessels that meet move alike where they
  // meet (the atlas has the tree in separate meshes: the first part of an anterior cerebral artery, the communicating
  // artery, ...)
  if (smoothPasses > 0 && smoothMm > 0) {
    const at = [], cells = new Map(), cs = smoothMm, cellS = v => Math.floor(v / cs), keyS = (a, b, c) => ((a & 1023) * 1024 + (b & 1023)) * 1024 + (c & 1023);
    const base = new Int32Array(list.length).fill(-1);
    list.forEach((m, mi) => { const P = m && m.positions; if (!P || !shares[mi]) return; base[mi] = at.length / 2; for (let v = 0; v < P.length / 3; v++) { const k = keyS(cellS(P[3 * v]), cellS(P[3 * v + 1]), cellS(P[3 * v + 2])); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(at.length / 2); at.push(mi, v); } });
    const N = at.length / 2, val = new Float64Array(N), fixed = new Uint8Array(N), start = new Uint32Array(N + 1), nb = [];
    // (and the mesh's own edges, which can be longer than smoothMm along a vessel)
    const edges = Array.from({ length: N }, () => null);
    list.forEach((m, mi) => { const I = m && m.indices; if (base[mi] < 0 || !I) return; for (let t = 0; t + 2 < I.length; t += 3) for (let e = 0; e < 3; e++) { const u = base[mi] + I[t + e], v = base[mi] + I[t + (e + 1) % 3]; (edges[u] || (edges[u] = [])).push(v); (edges[v] || (edges[v] = [])).push(u); } });
    for (let g = 0; g < N; g++) {
      const mi = at[2 * g], v = at[2 * g + 1], m = list[mi], P = m.positions, x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
      val[g] = shares[mi][v]; fixed[g] = m.side === 1 || m.side === -1 ? 0 : 1;
      start[g] = nb.length;
      const a = cellS(x), b = cellS(y), c = cellS(z);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const l = cells.get(keyS(a + i, b + j, c + k)); if (!l) continue;
        for (const h of l) { const Q = list[at[2 * h]].positions, u = at[2 * h + 1]; if ((Q[3 * u] - x) ** 2 + (Q[3 * u + 1] - y) ** 2 + (Q[3 * u + 2] - z) ** 2 <= cs * cs) nb.push(h); }
      }
      if (edges[g]) for (const h of edges[g]) nb.push(h);
    }
    start[N] = nb.length;
    const next = new Float64Array(N);
    for (let pass = 0; pass < smoothPasses; pass++) {
      for (let g = 0; g < N; g++) { if (fixed[g]) { next[g] = val[g]; continue; } let sum = 0; for (let q = start[g]; q < start[g + 1]; q++) sum += val[nb[q]]; next[g] = sum / (start[g + 1] - start[g]); }
      val.set(next);
    }
    for (let g = 0; g < N; g++) shares[at[2 * g]][at[2 * g + 1]] = val[g];
  }
  return list.map((m, mi) => {
    const P = m && m.positions, s = m && m.side;
    if (!P || (s !== 1 && s !== -1)) return P;
    const share = shares[mi], out = new P.constructor(P.length);
    for (let v = 0; v < P.length / 3; v++) { out[3 * v] = P[3 * v] + s * eachMm * backShareAt(P[3 * v + 1], back) * share[v]; out[3 * v + 1] = P[3 * v + 1]; out[3 * v + 2] = P[3 * v + 2]; }
    return out;
  });
}

/** The hand-laid veins (ns-vessels buildCerebralVeins, laid on the ATLAS brain's envelope, where it bridges the 2 mm
 * fissure as the arachnoid does): a copy moved like the half under it by the sign of x, the whole step from
 * `bridgeMm` off the midline, none on it, smooth between. A vein of a half then lies on that half, and where it runs
 * to the superior sagittal sinus on the midline its last bridgeMm cross the gap to the sinus at the height of the
 * halves' top edges (as the bridging veins cross to the sinus in life), not down in the gap. The sinus itself (laid on
 * the midline) is not given to this: it stays over the middle of the gap. Pure. */
export function partedBridging(positions, { eachMm = HEMI_GAP.eachMm, back = HEMI_GAP.back, bridgeMm = 2 } = {}) {
  if (!positions || !(eachMm > 0)) return positions;
  const out = new positions.constructor(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], t = bridgeMm > 0 ? Math.min(1, Math.abs(x) / bridgeMm) : 1;
    out[i] = x + Math.sign(x) * eachMm * backShareAt(positions[i + 1], back) * t * t * (3 - 2 * t);
    out[i + 1] = positions[i + 1]; out[i + 2] = positions[i + 2];
  }
  return out;
}
