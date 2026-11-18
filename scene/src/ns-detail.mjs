/**
 * NeuroSurge — finer detail of the body at load (18 November 2026; the owner: "everything should be in as much detail as
 * possible without destabilizing the game, which of course is browser based. So we should have far more detail on
 * everything"). Pure functions, no THREE, no DOM.
 *
 * Tried and left out (numbers in the package notes): refining the meshes near the eye with curved midpoints. Where
 * the curved surface leaves a straight edge by more than a fraction of a pixel of the start view, the 99 %-reduced
 * atlas meshes are already fine enough for their outlines (an 8 mm edge on a 20 mm belly sags 0.4 mm, about 0.3 px at
 * half a metre): at 0.12 px it added 58 k muscle and 31 k bone vertices and 350 k drawn triangles, seconds of load time
 * and 7 % more per-vertex skinning, and close-ups showed no difference. What does show close up is the LIGHT on the
 * decimated triangles (smoothNormalField below), which costs nothing per frame.
 */

const keyOf = (f32, u32, x, y, z) => { f32[0] = x; f32[1] = y; f32[2] = z; return (Math.imul(u32[0], 73856093) ^ Math.imul(u32[1], 19349663) ^ Math.imul(u32[2], 83492791)) >>> 0; };

/**
 * 18 November 2026 (the owner: "far more detail on everything"; the brief: "smooth normals at load"). The decimated
 * atlas meshes are full of uneven triangles (long slivers beside small ones), and an area-weighted vertex normal leans
 * toward whichever big sliver touches the vertex: lit, every such vertex turns its own way and a smooth muscle reads as
 * flat facets close up, with highlights that break at the triangle edges. smoothNormalField evens the SHADING normals
 * out over the welded surface (the files' seam duplicates are one point): `passes` rounds in which each point's normal
 * becomes the normalised mean of its own and its neighbours', counting only neighbours within `creaseDeg` of its own (a
 * real edge, such as a bone's crest or the border of a thin sheet, keeps its turn). Positions never move: only the
 * light. normals (unit, layout of positions) are changed in place; returns the number of points changed. Pure apart
 * from writing `normals`.
 */
export const NORMAL_SMOOTH = Object.freeze({ passes: 2, creaseDeg: 50 });
export function smoothNormalField(positions, indices, normals, { passes = NORMAL_SMOOTH.passes, creaseDeg = NORMAL_SMOOTH.creaseDeg, groups = null } = {}) {
  const n = (positions && positions.length / 3) | 0;
  if (!(n > 2) || !indices || indices.length < 3 || !normals || normals.length < 3 * n || !(passes > 0)) return 0;
  // weld by exact position (or the caller's groups from weldNormalsByPosition: one id 0..count-1 per position)
  let g, m = 0;
  if (groups && groups.length === n) { g = groups; for (let v = 0; v < n; v++) if (g[v] >= m) m = g[v] + 1; }
  else {
  let size = 16; while (size < 2 * n) size <<= 1;
  const table = new Int32Array(size).fill(-1), mask = size - 1, f32 = new Float32Array(3), u32 = new Uint32Array(f32.buffer);
  g = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    let h = keyOf(f32, u32, x, y, z) & mask;
    for (;;) {
      const j = table[h];
      if (j < 0) { table[h] = v; g[v] = m++; break; }
      if (positions[3 * j] === x && positions[3 * j + 1] === y && positions[3 * j + 2] === z) { g[v] = g[j]; break; }
      h = (h + 1) & mask;
    }
  }
  }
  // the welded points' normals (the mean of their copies) and their neighbours (CSR; duplicates kept: a neighbour on
  // two triangles counts twice, which weights it by how much of the ring it spans)
  const N = new Float64Array(3 * m), deg = new Int32Array(m + 1);
  for (let v = 0; v < n; v++) { const k = 3 * g[v]; N[k] += normals[3 * v]; N[k + 1] += normals[3 * v + 1]; N[k + 2] += normals[3 * v + 2]; }
  for (let i = 0; i < m; i++) { const l = Math.hypot(N[3 * i], N[3 * i + 1], N[3 * i + 2]); if (l > 0) { N[3 * i] /= l; N[3 * i + 1] /= l; N[3 * i + 2] /= l; } }
  const T = (indices.length / 3) | 0;
  for (let t = 0; t < T; t++) {
    const a = g[indices[3 * t]], b = g[indices[3 * t + 1]], c = g[indices[3 * t + 2]];
    if (a === undefined || b === undefined || c === undefined) return 0;
    deg[a] += 2; deg[b] += 2; deg[c] += 2;
  }
  const start = new Int32Array(m + 1);
  for (let i = 0; i < m; i++) start[i + 1] = start[i] + deg[i];
  const adj = new Int32Array(start[m]), fill = start.slice(0, m);
  for (let t = 0; t < T; t++) {
    const a = g[indices[3 * t]], b = g[indices[3 * t + 1]], c = g[indices[3 * t + 2]];
    adj[fill[a]++] = b; adj[fill[a]++] = c; adj[fill[b]++] = c; adj[fill[b]++] = a; adj[fill[c]++] = a; adj[fill[c]++] = b;
  }
  const cosMin = Math.cos(creaseDeg * Math.PI / 180), B = new Float64Array(3 * m);
  let A = N;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < m; i++) {
      const ax = A[3 * i], ay = A[3 * i + 1], az = A[3 * i + 2];
      let x = ax, y = ay, z = az;
      for (let s = start[i]; s < start[i + 1]; s++) {
        const j = 3 * adj[s], bx = A[j], by = A[j + 1], bz = A[j + 2];
        if (ax * bx + ay * by + az * bz < cosMin) continue;
        x += bx; y += by; z += bz;
      }
      const l = Math.hypot(x, y, z) || 1;
      B[3 * i] = x / l; B[3 * i + 1] = y / l; B[3 * i + 2] = z / l;
    }
    if (A === N) A = new Float64Array(3 * m);
    A.set(B);
  }
  // back to the copies: a copy whose own normal is far from its point's (two surfaces back to back, a real edge in the
  // files) keeps its own, as weldNormalsByPosition does
  let changed = 0;
  for (let v = 0; v < n; v++) {
    const k = 3 * g[v], x = A[k], y = A[k + 1], z = A[k + 2];
    if (x * normals[3 * v] + y * normals[3 * v + 1] + z * normals[3 * v + 2] < 0.2) continue;
    normals[3 * v] = x; normals[3 * v + 1] = y; normals[3 * v + 2] = z; changed++;
  }
  return changed;
}

/**
 * 18 November 2026 (the brief: "bone with its smooth shafts, rougher ends ..., cartilage caps on the joint surfaces in
 * a bluish white"). Two numbers per bone vertex, for the bone's shading (ns-flesh fleshLightGlsl, attribute nsBoneEnd):
 *   x  CARTILAGE: 1 on a joint surface, where another bone's surface comes within capNearMm (articular cartilage
 *      covers exactly the surfaces that meet another bone: the head of the femur in its socket, the condyles, the
 *      kneecap's back, the carpals and the small joints of the hand and foot), falling to 0 at capFarMm; the costal
 *      cartilages (hyaline cartilage from end to end) are 1 everywhere;
 *   y  END: how near the vertex lies to a joint surface along the bone (1 within endNearMm of a cap, 0 from endFarMm):
 *      the epiphysis, whose thin cortex over spongy bone is less smooth than the shaft.
 * Measured on the bones as handed in (one frame: the drawn posture; the joints of the start posture are where the atlas
 * has them, rotated about their own centres). Bones of the skull, the teeth and the hyoid are left out (their joints are
 * sutures, not cartilage caps). bones: [{ id, name, positions, indices }]. Returns Map(id -> Float32Array(2 x vertices)).
 * A geometric estimate for the picture, not a map of real cartilage thickness. Pure.
 */
export const BONE_ENDS = Object.freeze({ capNearMm: 2.5, capFarMm: 7, endNearMm: 6, endFarMm: 28, smoothPasses: 2,
  skip: /\b(skull|cranium|frontal bone|parietal|occipital bone|temporal bone|sphenoid|ethmoid|nasal bone|lacrimal|zygomatic|maxilla|palatine|vomer|concha|tooth|teeth|incisor|canine|premolar|molar|hyoid|mandible)\b/i,
  whole: /\bcostal cartilage\b/i });
export function boneEndWeights(bones, o = BONE_ENDS) {
  const out = new Map();
  if (!Array.isArray(bones)) return out;
  const list = bones.filter(b => b && b.positions && b.positions.length >= 9 && b.indices && b.indices.length >= 3 && !(typeof b.name === 'string' && o.skip.test(b.name)));
  // every bone vertex in one dense grid of capFarMm cells over the bones' box (counting sort into flat arrays: cell ->
  // its points' bone index and coordinates)
  const C = o.capFarMm, isWhole = b => typeof b.name === 'string' && o.whole.test(b.name);
  let total = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const b of list) { if (isWhole(b)) continue; const p = b.positions; total += p.length / 3; for (let i = 0; i < p.length; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; if (p[i + 2] < z0) z0 = p[i + 2]; if (p[i + 2] > z1) z1 = p[i + 2]; } }
  const NX = total ? Math.floor((x1 - x0) / C) + 3 : 1, NY = total ? Math.floor((y1 - y0) / C) + 3 : 1, NZ = total ? Math.floor((z1 - z0) / C) + 3 : 1;
  // (cells are offset by one so that every neighbour of an occupied cell is inside the grid)
  const cellAt = (x, y, z) => (Math.floor((x - x0) / C) + 1) + NX * ((Math.floor((y - y0) / C) + 1) + NY * (Math.floor((z - z0) / C) + 1));
  const cstart = new Int32Array(NX * NY * NZ + 1);
  for (const b of list) { if (isWhole(b)) continue; const p = b.positions; for (let v = 0; v < p.length / 3; v++) cstart[cellAt(p[3 * v], p[3 * v + 1], p[3 * v + 2]) + 1]++; }
  for (let i = 0; i < NX * NY * NZ; i++) cstart[i + 1] += cstart[i];
  const cfill = cstart.slice(0, NX * NY * NZ), ptK = new Int32Array(total), ptX = new Float32Array(3 * total);
  list.forEach((b, k) => { if (isWhole(b)) return; const p = b.positions; for (let v = 0; v < p.length / 3; v++) { const at = cfill[cellAt(p[3 * v], p[3 * v + 1], p[3 * v + 2])]++; ptK[at] = k; ptX[3 * at] = p[3 * v]; ptX[3 * at + 1] = p[3 * v + 1]; ptX[3 * at + 2] = p[3 * v + 2]; } });
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const f32 = new Float32Array(3), u32 = new Uint32Array(f32.buffer);
  list.forEach((b, k) => {
    const p = b.positions, n = p.length / 3, w = new Float32Array(2 * n);
    if (isWhole(b)) { w.fill(1); out.set(b.id, w); return; }
    const cap = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const x = p[3 * v], y = p[3 * v + 1], z = p[3 * v + 2], c0 = cellAt(x, y, z);
      let best = C * C;
      for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let c = -1; c <= 1; c++) {
        const sl = c0 + a + NX * (bb + NY * c);
        for (let i = cstart[sl]; i < cstart[sl + 1]; i++) {
          if (ptK[i] === k) continue;
          const dx = ptX[3 * i] - x, dy = ptX[3 * i + 1] - y, dz = ptX[3 * i + 2] - z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < best) best = d2;
        }
      }
      cap[v] = 1 - sstep(o.capNearMm, o.capFarMm, Math.sqrt(best));
    }
    // the surface of this bone (welded by position) as a graph (CSR), for the smoothing and the distance along the bone
    const ix = b.indices, g = new Int32Array(n);
    let size = 16; while (size < 2 * n) size <<= 1;
    const table = new Int32Array(size).fill(-1), mask = size - 1;
    let m = 0;
    for (let v = 0; v < n; v++) {
      const x = p[3 * v], y = p[3 * v + 1], z = p[3 * v + 2];
      let h = keyOf(f32, u32, x, y, z) & mask;
      for (;;) {
        const j = table[h];
        if (j < 0) { table[h] = v; g[v] = m++; break; }
        if (p[3 * j] === x && p[3 * j + 1] === y && p[3 * j + 2] === z) { g[v] = g[j]; break; }
        h = (h + 1) & mask;
      }
    }
    const pos = new Float64Array(3 * m), cw = new Float64Array(m), cnt = new Int32Array(m), start = new Int32Array(m + 1);
    for (let v = 0; v < n; v++) { const r = g[v]; pos[3 * r] = p[3 * v]; pos[3 * r + 1] = p[3 * v + 1]; pos[3 * r + 2] = p[3 * v + 2]; cw[r] += cap[v]; cnt[r]++; }
    for (let r = 0; r < m; r++) cw[r] /= cnt[r] || 1;
    const T = (ix.length / 3) | 0;
    for (let t = 0; t < T; t++) { start[g[ix[3 * t]] + 1] += 2; start[g[ix[3 * t + 1]] + 1] += 2; start[g[ix[3 * t + 2]] + 1] += 2; }
    for (let r = 0; r < m; r++) start[r + 1] += start[r];
    const adj = new Int32Array(start[m]), fill = start.slice(0, m);
    for (let t = 0; t < T; t++) { const a = g[ix[3 * t]], bq = g[ix[3 * t + 1]], c = g[ix[3 * t + 2]]; adj[fill[a]++] = bq; adj[fill[a]++] = c; adj[fill[bq]++] = c; adj[fill[bq]++] = a; adj[fill[c]++] = a; adj[fill[c]++] = bq; }
    let A = cw, B = new Float64Array(m);
    for (let pass = 0; pass < o.smoothPasses; pass++) {
      for (let r = 0; r < m; r++) { let s = A[r]; for (let q = start[r]; q < start[r + 1]; q++) s += A[adj[q]]; B[r] = s / (1 + start[r + 1] - start[r]); }
      const t = A; A = B; B = t;
    }
    // distance along the surface from the caps (Dijkstra from every point with a cap of at least a half, up to endFarMm;
    // a binary heap of point indices keyed by dist)
    const dist = new Float64Array(m).fill(Infinity), heap = new Int32Array(Math.max(1, start[m] + m)), slot = new Int32Array(m).fill(-1);
    let hn = 0;
    const up = i => { const r = heap[i]; while (i > 0) { const pa = (i - 1) >> 1; if (dist[heap[pa]] <= dist[r]) break; heap[i] = heap[pa]; slot[heap[i]] = i; i = pa; } heap[i] = r; slot[r] = i; };
    const down = i => { const r = heap[i]; for (;;) { const l = 2 * i + 1; if (l >= hn) break; const c = l + 1 < hn && dist[heap[l + 1]] < dist[heap[l]] ? l + 1 : l; if (dist[heap[c]] >= dist[r]) break; heap[i] = heap[c]; slot[heap[i]] = i; i = c; } heap[i] = r; slot[r] = i; };
    for (let r = 0; r < m; r++) if (A[r] >= 0.5) { dist[r] = 0; heap[hn] = r; slot[r] = hn++; }
    while (hn > 0) {
      const r = heap[0]; slot[r] = -2; hn--;
      if (hn > 0) { heap[0] = heap[hn]; slot[heap[0]] = 0; down(0); }
      const d = dist[r];
      if (d > o.endFarMm) continue;
      for (let q = start[r]; q < start[r + 1]; q++) {
        const k2 = adj[q];
        if (slot[k2] === -2) continue;
        const e = d + Math.hypot(pos[3 * k2] - pos[3 * r], pos[3 * k2 + 1] - pos[3 * r + 1], pos[3 * k2 + 2] - pos[3 * r + 2]);
        if (e < dist[k2]) { dist[k2] = e; if (slot[k2] < 0) { heap[hn] = k2; slot[k2] = hn++; } up(slot[k2]); }
      }
    }
    for (let v = 0; v < n; v++) { const r = g[v]; w[2 * v] = A[r]; w[2 * v + 1] = 1 - sstep(o.endNearMm, o.endFarMm, dist[r]); }
    out.set(b.id, w);
  });
  return out;
}
