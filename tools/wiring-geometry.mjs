/** NeuroSurge tool (project code, CC0): the geometry the drawn nerve courses are laid over, for
 * tools/build-wiring-courses.mjs. The body exactly as the PAGE prepares it (tools/page-body.mjs: the source meshes,
 * the flattened chest, the trained build, the longer limbs), which is the rest frame of packs/BODY-RIG.json; each
 * mesh also keeps its positions as they were in the source file, so that things given in the atlas's own frame (the
 * vessel centre lines) can be carried to the drawn body by the displacement of the nearest source vertices.
 *
 * Frame: BodyParts3D 4.0 whole-body millimetres, +x subject LEFT, +y POSTERIOR, +z SUPERIOR (right side: x < 0).
 * Everything here is measurement of one educational reference body; nothing is a claim about a real person. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r1 = v => Math.round(v * 10) / 10;

const namesOf = e => [...new Set([e.name, e.concept, e.requested_structure, e.embedded_source_name, ...((e.concepts || []).map(c => c.en)), ...(e.matched_concept_names || []), ...(e.names || [])].filter(Boolean).map(s => String(s).toLowerCase()))];

/** Load the prepared body. cacheDir (optional, outside the repository): the vertices are kept there so a rerun does
 * not prepare the body again (about half a minute). Returns { rig, meshes: Map(id -> { id, names, kind, seg, side,
 * P (rest positions), S (source positions or null), I (indices) }) }. */
export async function loadWiringGeometry({ repo = here, cacheDir = null } = {}) {
  const rigText = fs.readFileSync(path.join(repo, 'packs', 'BODY-RIG.json'), 'utf8');
  if (cacheDir && fs.existsSync(path.join(cacheDir, 'wiring-body.json'))) {
    const meta = JSON.parse(fs.readFileSync(path.join(cacheDir, 'wiring-body.json'), 'utf8'));
    if (meta.rigBytes === rigText.length) {
      const P = new Float32Array(fs.readFileSync(path.join(cacheDir, 'wiring-body-p.bin')).buffer.slice(0));
      const S = new Float32Array(fs.readFileSync(path.join(cacheDir, 'wiring-body-s.bin')).buffer.slice(0));
      const I = new Uint32Array(fs.readFileSync(path.join(cacheDir, 'wiring-body-i.bin')).buffer.slice(0));
      const meshes = new Map();
      for (const m of meta.meshes) meshes.set(m.id, { ...m, P: P.subarray(m.p0, m.p0 + m.pn), S: m.hasS ? S.subarray(m.p0, m.p0 + m.pn) : null, I: I.subarray(m.i0, m.i0 + m.in) });
      return { rig: meta.rig, meshes };
    }
  }
  const { loadPageBody } = await import(path.join(repo, 'tools', 'page-body.mjs'));
  const src = new Map();
  const L = await loadPageBody(repo, { meshFor: (id, mesh) => { if (!src.has(id) && mesh && mesh.positions) src.set(id, Float32Array.from(mesh.positions)); } });
  const rig = JSON.parse(JSON.stringify({ frame: L.rig.frame, segments: L.rig.segments, pivots: L.rig.pivots, meshSegment: L.rig.meshSegment, muscles: L.rig.muscles, segmentOrder: L.rig.segmentOrder }));
  const entryById = new Map(L.entries.map(e => [e.element_id || e.id, e])), muscleById = new Map(rig.muscles.map(m => [m.id, m]));
  const meshes = new Map();
  for (const [id, ms] of Object.entries(rig.meshSegment)) {
    const m = L.meshesById.get(id);
    if (!m || !m.positions) continue;
    const e = entryById.get(id) || {}, mu = muscleById.get(id), s = src.get(id);
    meshes.set(id, { id, names: mu ? [mu.name, ...(mu.aliases || [])].map(x => x.toLowerCase()) : namesOf(e), kind: ms.kind, seg: ms.segment, side: mu ? mu.side : (e.laterality || null),
      P: Float32Array.from(m.positions), S: s && s.length === m.positions.length ? s : null, I: Uint32Array.from(m.indices || []) });
  }
  if (cacheDir) {
    fs.mkdirSync(cacheDir, { recursive: true });
    let pn = 0, inn = 0; for (const m of meshes.values()) { pn += m.P.length; inn += m.I.length; }
    const P = new Float32Array(pn), S = new Float32Array(pn), I = new Uint32Array(inn), list = [];
    let p0 = 0, i0 = 0;
    for (const m of meshes.values()) {
      P.set(m.P, p0); if (m.S) S.set(m.S, p0); I.set(m.I, i0);
      list.push({ id: m.id, names: m.names, kind: m.kind, seg: m.seg, side: m.side, p0, pn: m.P.length, i0, in: m.I.length, hasS: Boolean(m.S) });
      p0 += m.P.length; i0 += m.I.length;
    }
    fs.writeFileSync(path.join(cacheDir, 'wiring-body-p.bin'), Buffer.from(P.buffer));
    fs.writeFileSync(path.join(cacheDir, 'wiring-body-s.bin'), Buffer.from(S.buffer));
    fs.writeFileSync(path.join(cacheDir, 'wiring-body-i.bin'), Buffer.from(I.buffer));
    fs.writeFileSync(path.join(cacheDir, 'wiring-body.json'), JSON.stringify({ rigBytes: rigText.length, rig, meshes: list }));
  }
  return { rig, meshes };
}

/** The vertices of a brain mesh of the arm-and-brain packet, straight from its source file (the brain atlas is in the
 * same whole-body frame as the skull; the game draws it large and outside the body, but its own coordinates say where
 * the brainstem would sit in this skull). */
export function readSourceVertices(repo, packet, id) {
  const text = fs.readFileSync(path.join(repo, 'packets', packet, 'meshes', `${id}.obj`), 'utf8');
  const out = [];
  for (const line of text.split('\n')) if (line.startsWith('v ')) { const t = line.split(/\s+/); out.push(+t[1], +t[2], +t[3]); }
  return Float32Array.from(out);
}

// ---------------------------------------------------------------------------------------------------------------------
// Measuring helpers over the loaded body

export function makeGeometry({ rig, meshes }) {
  const list = [...meshes.values()];
  const G = { rig, meshes, list };

  // --- statistics of one mesh
  const stats = new Map();
  G.stat = m => {
    let s = stats.get(m.id); if (s) return s;
    const P = m.P, n = P.length / 3, c = [0, 0, 0], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < P.length; i += 3) for (let j = 0; j < 3; j++) { const v = P[i + j]; c[j] += v; if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; }
    for (let j = 0; j < 3; j++) c[j] /= n;
    const C = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < P.length; i += 3) { const x = P[i] - c[0], y = P[i + 1] - c[1], z = P[i + 2] - c[2]; C[0] += x * x; C[1] += x * y; C[2] += x * z; C[3] += y * y; C[4] += y * z; C[5] += z * z; }
    let a = [0.3, 0.2, 1];
    for (let it = 0; it < 100; it++) { const b = [C[0] * a[0] + C[1] * a[1] + C[2] * a[2], C[1] * a[0] + C[3] * a[1] + C[4] * a[2], C[2] * a[0] + C[4] * a[1] + C[5] * a[2]]; const l = Math.hypot(...b) || 1; a = b.map(v => v / l); }
    const T = new Float32Array(n); let t0 = 1e9, t1 = -1e9;
    for (let i = 0, k = 0; i < P.length; i += 3, k++) { const t = (P[i] - c[0]) * a[0] + (P[i + 1] - c[1]) * a[1] + (P[i + 2] - c[2]) * a[2]; T[k] = t; if (t < t0) t0 = t; if (t > t1) t1 = t; }
    s = { n, c, min: mn, max: mx, axis: a, T, t0, t1, len: t1 - t0 };
    stats.set(m.id, s); return s;
  };

  // --- finding meshes by name
  G.find = (name, { kind = null, all = false } = {}) => {
    const q = name.toLowerCase();
    const hit = list.filter(m => (!kind || m.kind === kind) && m.names.includes(q));
    if (!hit.length) throw new Error(`wiring geometry: no mesh named "${name}"`);
    return all ? hit : hit[0];
  };
  G.has = name => list.some(m => m.names.includes(name.toLowerCase()));

  /** Centroid of the vertices of one or more meshes in a slab along the long axis of the (first) mesh: f = 0 at the
   * end nearer the point `near` (or the upper end when near is null), 1 at the other end; half-width w (fraction). */
  G.along = (m, f, near = null, w = 0.06) => {
    const ms = Array.isArray(m) ? m : [m], s = G.stat(ms[0]);
    const end0 = [s.c[0] + s.axis[0] * s.t0, s.c[1] + s.axis[1] * s.t0, s.c[2] + s.axis[2] * s.t0], end1 = [s.c[0] + s.axis[0] * s.t1, s.c[1] + s.axis[1] * s.t1, s.c[2] + s.axis[2] * s.t1];
    let from0;
    if (near) from0 = Math.hypot(end0[0] - near[0], end0[1] - near[1], end0[2] - near[2]) <= Math.hypot(end1[0] - near[0], end1[1] - near[1], end1[2] - near[2]);
    else from0 = end0[2] >= end1[2];
    const tq = from0 ? s.t0 + f * s.len : s.t1 - f * s.len, hw = Math.max(2, w * s.len);
    const q = [0, 0, 0]; let k = 0;
    for (const mm of ms) { const P = mm.P; for (let i = 0; i < P.length; i += 3) { const t = (P[i] - s.c[0]) * s.axis[0] + (P[i + 1] - s.c[1]) * s.axis[1] + (P[i + 2] - s.c[2]) * s.axis[2]; if (Math.abs(t - tq) <= hw) { q[0] += P[i]; q[1] += P[i + 1]; q[2] += P[i + 2]; k++; } } }
    if (!k) return [s.c[0] + s.axis[0] * tq, s.c[1] + s.axis[1] * tq, s.c[2] + s.axis[2] * tq];
    return q.map(v => v / k);
  };
  /** Centroid of the vertices of one or more meshes within hw mm of the height z (null when there are none). */
  G.sliceZ = (m, z, hw = 6) => {
    const ms = Array.isArray(m) ? m : [m], q = [0, 0, 0]; let k = 0;
    for (const mm of ms) { const P = mm.P; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 2] - z) <= hw) { q[0] += P[i]; q[1] += P[i + 1]; q[2] += P[i + 2]; k++; } }
    return k ? q.map(v => v / k) : null;
  };
  /** The vertex of a mesh that is furthest along the direction d among the vertices passing `keep(x, y, z)`. */
  G.extreme = (m, d, keep = null) => {
    const P = m.P; let best = -Infinity, o = null;
    for (let i = 0; i < P.length; i += 3) { if (keep && !keep(P[i], P[i + 1], P[i + 2])) continue; const v = P[i] * d[0] + P[i + 1] * d[1] + P[i + 2] * d[2]; if (v > best) { best = v; o = [P[i], P[i + 1], P[i + 2]]; } }
    return o;
  };
  /** Mean of the k vertices of a mesh nearest to p (a point inside the mesh's own tissue near p). */
  G.snap = (m, p, k = 12) => {
    const P = m.P, best = [];
    for (let i = 0; i < P.length; i += 3) { const d = (P[i] - p[0]) ** 2 + (P[i + 1] - p[1]) ** 2 + (P[i + 2] - p[2]) ** 2; if (best.length < k) { best.push([d, i]); best.sort((a, b) => a[0] - b[0]); } else if (d < best[k - 1][0]) { best[k - 1] = [d, i]; best.sort((a, b) => a[0] - b[0]); } }
    const q = [0, 0, 0]; for (const b of best) { q[0] += P[b[1]]; q[1] += P[b[1] + 1]; q[2] += P[b[1] + 2]; }
    return { p: q.map(v => v / best.length), dist: Math.sqrt(best[0][0]) };
  };

  // --- grids: every vertex (nearest mesh), bones only (which segment a point rides), source vertices (carry)
  const cell = 8, key = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  const gridAll = new Map(), gridBone = new Map(), gridSrc = new Map();
  list.forEach((m, mi) => {
    const P = m.P, S = m.S;
    for (let i = 0; i < P.length; i += 3) {
      const k = key(Math.floor(P[i] / cell), Math.floor(P[i + 1] / cell), Math.floor(P[i + 2] / cell));
      let a = gridAll.get(k); if (!a) gridAll.set(k, a = []); a.push(mi, i);
      if (m.kind === 'bone') { let b = gridBone.get(k); if (!b) gridBone.set(k, b = []); b.push(mi, i); }
      if (S) { const ks = key(Math.floor(S[i] / cell), Math.floor(S[i + 1] / cell), Math.floor(S[i + 2] / cell)); let c = gridSrc.get(ks); if (!c) gridSrc.set(ks, c = []); c.push(mi, i); }
    }
  });
  const nearestIn = (grid, p, useSource, maxReach, want = 1, filter = null) => {
    const ci = Math.floor(p[0] / cell), cj = Math.floor(p[1] / cell), ck = Math.floor(p[2] / cell), best = [];
    for (let reach = 0; reach <= maxReach; reach++) {
      for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) for (let k = -reach; k <= reach; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== reach) continue;
        const a = grid.get(key(ci + i, cj + j, ck + k)); if (!a) continue;
        for (let q = 0; q < a.length; q += 2) {
          const m = list[a[q]]; if (filter && !filter(m)) continue;
          const A = useSource ? m.S : m.P, v = a[q + 1], d = Math.hypot(A[v] - p[0], A[v + 1] - p[1], A[v + 2] - p[2]);
          best.push([d, a[q], v]);
        }
      }
      if (best.length >= want) { best.sort((x, y) => x[0] - y[0]); if (best[want - 1][0] <= reach * cell) break; }
    }
    best.sort((x, y) => x[0] - y[0]);
    return best.slice(0, want);
  };
  /** Nearest vertex of any mesh: { dist, mesh }. */
  G.nearest = (p, filter = null) => { const b = nearestIn(gridAll, p, false, 12, 1, filter)[0]; return b ? { dist: b[0], mesh: list[b[1]] } : { dist: Infinity, mesh: null }; };
  /** The rig segment a point rides: the segment of the nearest BONE (within 96 mm), else of the nearest mesh. */
  G.segmentAt = p => { const b = nearestIn(gridBone, p, false, 12, 1)[0]; if (b) return list[b[1]].seg; const a = G.nearest(p); return a.mesh ? a.mesh.seg : null; };
  /** The nearest bone to a point: { dist, seg } (dist Infinity when none within 96 mm). */
  G.nearestBone = p => { const b = nearestIn(gridBone, p, false, 12, 1)[0]; return b ? { dist: b[0], seg: list[b[1]].seg } : { dist: Infinity, seg: null }; };
  /** Carry a point given in the SOURCE frame to the rest frame: the mean displacement of the 8 nearest source vertices
   * (inverse-square weights), as the game rivets its vessels (ns-vessels bindBodyVessels). */
  G.carry = (p, filter = null) => {
    const b = nearestIn(gridSrc, p, true, 8, 8, filter);
    if (!b.length) return p.slice(0, 3);
    let ws = 0; const o = [0, 0, 0];
    for (const [d, mi, v] of b) { const m = list[mi], w = 1 / ((d + 0.5) ** 2); ws += w; o[0] += w * (m.P[v] - m.S[v]); o[1] += w * (m.P[v + 1] - m.S[v + 1]); o[2] += w * (m.P[v + 2] - m.S[v + 2]); }
    return [p[0] + o[0] / ws, p[1] + o[1] / ws, p[2] + o[2] / ws];
  };

  // --- occupancy (4 mm cells) of every surface, for "is this point inside the body?"
  const V = { cell: 4, x0: -420, y0: -320, z0: -260, nx: 210, ny: 110, nz: 500 };
  const vox = new Uint8Array(V.nx * V.ny * V.nz);
  const mark = (x, y, z) => { const i = Math.floor((x - V.x0) / V.cell), j = Math.floor((y - V.y0) / V.cell), k = Math.floor((z - V.z0) / V.cell); if (i >= 0 && j >= 0 && k >= 0 && i < V.nx && j < V.ny && k < V.nz) vox[(k * V.ny + j) * V.nx + i] = 1; };
  for (const m of list) {
    const P = m.P, I = m.I;
    for (let i = 0; i < P.length; i += 3) mark(P[i], P[i + 1], P[i + 2]);
    for (let f = 0; f + 2 < I.length; f += 3) {
      const a = 3 * I[f], b = 3 * I[f + 1], c = 3 * I[f + 2];
      const e = Math.max(Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]), Math.hypot(P[a] - P[c], P[a + 1] - P[c + 1], P[a + 2] - P[c + 2]), Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2]));
      const N = Math.min(40, Math.ceil(e / 2.5));
      if (N > 1) for (let u = 0; u <= N; u++) for (let v = 0; v <= N - u; v++) { const w = N - u - v; mark((P[a] * u + P[b] * v + P[c] * w) / N, (P[a + 1] * u + P[b + 1] * v + P[c + 1] * w) / N, (P[a + 2] * u + P[b + 2] * v + P[c + 2] * w) / N); }
    }
  }
  const at = (x, y, z) => { const i = Math.floor((x - V.x0) / V.cell), j = Math.floor((y - V.y0) / V.cell), k = Math.floor((z - V.z0) / V.cell); return i >= 0 && j >= 0 && k >= 0 && i < V.nx && j < V.ny && k < V.nz && vox[(k * V.ny + j) * V.nx + i] === 1; };
  const s3 = 1 / Math.sqrt(3);
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [s3, s3, s3], [s3, s3, -s3], [s3, -s3, s3], [s3, -s3, -s3], [-s3, s3, s3], [-s3, s3, -s3], [-s3, -s3, s3], [-s3, -s3, -s3]];
  /** How many of 14 directions (the six axes and the eight diagonals) meet a surface of the body within reach mm of p.
   * 14 = closed in on every side; a point in the open air beside the body scores about half. */
  G.enclosure = (p, reach = 320) => {
    let n = 0;
    for (const d of DIRS) for (let t = 0; t <= reach; t += 2) if (at(p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t)) { n++; break; }
    return n;
  };
  /** Sorted distances at which a ray from o along d meets the triangles of the given meshes. */
  G.rayHits = (ms, o, d) => {
    const hits = [];
    for (const m of ms) {
      const P = m.P, I = m.I;
      for (let f = 0; f + 2 < I.length; f += 3) {
        const a = 3 * I[f], b = 3 * I[f + 1], c = 3 * I[f + 2];
        const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
        const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-9) continue;
        const sx = o[0] - P[a], sy = o[1] - P[a + 1], sz = o[2] - P[a + 2];
        const u = (sx * hx + sy * hy + sz * hz) / det; if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (d[0] * qx + d[1] * qy + d[2] * qz) / det; if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) / det;
        if (t > 0) hits.push(t);
      }
    }
    return hits.sort((x, y) => x - y);
  };
  G.pivot = name => { const p = rig.pivots[name]; if (!p) throw new Error(`wiring geometry: no pivot "${name}"`); return p.point.slice(); };

  // --- is a point inside a bone? Every bone, by the parity of a ray straight up through the bone's own triangles,
  // which are kept in 5 mm cells of the ground plan so that a question looks at a handful of them. (The bones of the
  // atlas are closed surfaces; a point is nudged by a fraction of a micrometre so that it never lies exactly under an
  // edge.)
  const bones = list.filter(m => m.kind === 'bone' && m.I.length >= 3);
  const plan = new Map();
  const planOf = m => {
    let g = plan.get(m.id); if (g) return g;
    const P = m.P, I = m.I, c = 5, cells = new Map(), st = G.stat(m);
    for (let f = 0; f + 2 < I.length; f += 3) {
      const a = 3 * I[f], b = 3 * I[f + 1], d = 3 * I[f + 2];
      const x0 = Math.floor(Math.min(P[a], P[b], P[d]) / c), x1 = Math.floor(Math.max(P[a], P[b], P[d]) / c), y0 = Math.floor(Math.min(P[a + 1], P[b + 1], P[d + 1]) / c), y1 = Math.floor(Math.max(P[a + 1], P[b + 1], P[d + 1]) / c);
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = (i + 4096) * 8192 + (j + 4096); let arr = cells.get(k); if (!arr) cells.set(k, arr = []); arr.push(f); }
    }
    g = { c, cells, min: st.min, max: st.max };
    plan.set(m.id, g); return g;
  };
  const insideBone = (m, p) => {
    const g = planOf(m);
    if (p[0] < g.min[0] || p[0] > g.max[0] || p[1] < g.min[1] || p[1] > g.max[1] || p[2] < g.min[2] || p[2] > g.max[2]) return false;
    const x = p[0] + 1.3e-4, y = p[1] + 2.7e-4, z = p[2], arr = g.cells.get((Math.floor(x / g.c) + 4096) * 8192 + (Math.floor(y / g.c) + 4096));
    if (!arr) return false;
    const P = m.P, I = m.I; let n = 0;
    for (const f of arr) {
      const a = 3 * I[f], b = 3 * I[f + 1], d = 3 * I[f + 2];
      const d1 = (P[b] - P[a]) * (y - P[a + 1]) - (P[b + 1] - P[a + 1]) * (x - P[a]), d2 = (P[d] - P[b]) * (y - P[b + 1]) - (P[d + 1] - P[b + 1]) * (x - P[b]), d3 = (P[a] - P[d]) * (y - P[d + 1]) - (P[a + 1] - P[d + 1]) * (x - P[d]);
      if (!((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue;
      const den = (P[b] - P[a]) * (P[d + 1] - P[a + 1]) - (P[d] - P[a]) * (P[b + 1] - P[a + 1]);
      if (Math.abs(den) < 1e-12) continue;
      const u = ((x - P[a]) * (P[d + 1] - P[a + 1]) - (P[d] - P[a]) * (y - P[a + 1])) / den, v = ((P[b] - P[a]) * (y - P[a + 1]) - (x - P[a]) * (P[b + 1] - P[a + 1])) / den;
      if (P[a + 2] + u * (P[b + 2] - P[a + 2]) + v * (P[d + 2] - P[a + 2]) > z) n++;
    }
    return n % 2 === 1;
  };
  /** The body's outer surface along the ray from the centre c through q: marching inward from well outside, the first
   * place within 1.5 mm of a vertex of any mesh (not looking deeper than `depth` mm under q); the point `lift` mm
   * outside it. Where a nerve runs under the skin (the body has none), this is its place on the outermost muscle or
   * bone. Returns q itself when the ray meets nothing. */
  G.surfaceOut = (q, c, lift = 2, depth = 25) => {
    const d = [q[0] - c[0], q[1] - c[1], q[2] - c[2]], L = Math.hypot(d[0], d[1], d[2]) || 1, u = [d[0] / L, d[1] / L, d[2] / L];
    for (let t = L + 70; t >= Math.max(0, L - depth); t -= 0.5) {
      const p = [c[0] + u[0] * t, c[1] + u[1] * t, c[2] + u[2] * t];
      if (G.nearest(p).dist <= 1.5) return [c[0] + u[0] * (t + lift), c[1] + u[1] * (t + lift), c[2] + u[2] * (t + lift)];
    }
    return q.slice(0, 3);
  };
  const boneGrid = new Map(), BG = 20, bgKey = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  for (const m of bones) {
    const st = G.stat(m);
    for (let i = Math.floor(st.min[0] / BG); i <= Math.floor(st.max[0] / BG); i++) for (let j = Math.floor(st.min[1] / BG); j <= Math.floor(st.max[1] / BG); j++) for (let k = Math.floor(st.min[2] / BG); k <= Math.floor(st.max[2] / BG); k++) {
      const key = bgKey(i, j, k); let a = boneGrid.get(key); if (!a) boneGrid.set(key, a = []); a.push(m);
    }
  }
  /** The bone a point lies inside, or null. */
  G.boneAt = p => { const a = boneGrid.get(bgKey(Math.floor(p[0] / BG), Math.floor(p[1] / BG), Math.floor(p[2] / BG))); if (a) for (const m of a) if (insideBone(m, p)) return m; return null; };
  /** The nearest vertex of a bone riding one of the given segments: { dist, seg } (Infinity, null when none near). */
  G.nearestBoneOf = (p, segs) => { const set = new Set(segs), b = nearestIn(gridBone, p, false, 12, 1, m => set.has(m.seg))[0]; return b ? { dist: b[0], seg: list[b[1]].seg } : { dist: Infinity, seg: null }; };
  /** How much of the straight piece from a to b lies inside bone: { mm, of, bones: Set of names, longestRun, mid } with
   * mid the middle of the longest unbroken stretch inside bone (null when none), sampled every `step` mm. */
  G.pieceInBone = (a, b, step = 1) => {
    const L = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), n = Math.max(1, Math.ceil(L / step)), names = new Set();
    let inside = 0, run = 0, best = 0, bestAt = null, runStart = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n, m = G.boneAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      if (m) { names.add(m.names[m.names.length > 1 ? 1 : 0]); inside++; if (!run) runStart = i; run++; if (run > best) { best = run; bestAt = (runStart + i) / 2 / n; } } else run = 0;
    }
    return { mm: inside * L / (n + 1), of: L, bones: names, longestRun: best * L / (n + 1), mid: bestAt === null ? null : [a[0] + (b[0] - a[0]) * bestAt, a[1] + (b[1] - a[1]) * bestAt, a[2] + (b[2] - a[2]) * bestAt] };
  };
  return G;
}

/** One joint of the rig turned: { moved(seg), apply(p) }. The segments that hang from the joint's child segment turn
 * as one rigid piece about the joint's pivot and axis (packs/BODY-RIG.json). A pose with `rigSign` turns by `deg` as
 * the rig itself counts that joint (the right-hand rule, positive as in the game's own poses: r_pronation 0 to 160,
 * jaw_open 0 to 30); otherwise the sense is the one that moves the pivot `far` the way `moves(before, after)` says. */
export function poser(rig, pose) {
  const segs = rig.segments, piv = rig.pivots[pose.joint];
  if (!piv || !piv.axes || !piv.axes[pose.axis]) throw new Error(`poser: the rig has no axis ${pose.axis} at ${pose.joint}`);
  const c = piv.point, k0 = piv.axes[pose.axis], kl = Math.hypot(k0[0], k0[1], k0[2]) || 1, k = [k0[0] / kl, k0[1] / kl, k0[2] / kl];
  const turn = (p, a) => { // Rodrigues: p about the axis k through c by the angle a
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2], cs = Math.cos(a), sn = Math.sin(a), d = (k[0] * x + k[1] * y + k[2] * z) * (1 - cs);
    return [c[0] + x * cs + (k[1] * z - k[2] * y) * sn + k[0] * d, c[1] + y * cs + (k[2] * x - k[0] * z) * sn + k[1] * d, c[2] + z * cs + (k[0] * y - k[1] * x) * sn + k[2] * d];
  };
  const roots = Object.keys(segs).filter(s => segs[s].joint === pose.joint);
  const under = (seg, root) => { for (let s = seg, n = 0; s && n < 40; s = segs[s] && segs[s].parent, n++) if (s === root) return true; return false; };
  const a0 = pose.deg * Math.PI / 180;
  let a = a0;
  if (!pose.rigSign) { const far = rig.pivots[pose.far].point; a = pose.moves(far, turn(far, a0)) ? a0 : -a0; }
  const cache = new Map();
  const moved = seg => { let m = cache.get(seg); if (m === undefined) { m = roots.some(r => under(seg, r)); cache.set(seg, m); } return m; };
  return { moved, apply: p => turn(p, a) };
}

/**
 * How much each straight piece of a set of lines grows when ONE joint of the rig is turned (see poser). lines:
 * [{ id, pts: [{ seg, p }] }]; poses: WIRING_POSES. Returns [{ pose, id, i, rest, posed, grows }] for every piece whose
 * two ends ride segments on the two sides of the joint, longest growth first. Pure: used by the generator's report and
 * by tests/wiring-data.test.mjs.
 */
export function poseStretch(rig, lines, poses = WIRING_POSES) {
  const out = [];
  for (const pose of poses) {
    const P = poser(rig, pose);
    for (const ln of lines) {
      for (let i = 0; i + 1 < ln.pts.length; i++) {
        const A = ln.pts[i], Bp = ln.pts[i + 1];
        if (P.moved(A.seg) === P.moved(Bp.seg)) continue; // both ends turn together: the piece keeps its length
        const qa = P.moved(A.seg) ? P.apply(A.p) : A.p, qb = P.moved(Bp.seg) ? P.apply(Bp.p) : Bp.p;
        const rest = Math.hypot(A.p[0] - Bp.p[0], A.p[1] - Bp.p[1], A.p[2] - Bp.p[2]);
        const posed = Math.hypot(qa[0] - qb[0], qa[1] - qb[1], qa[2] - qb[2]);
        out.push({ pose: pose.name, id: ln.id, i, rest, posed, grows: posed - rest });
      }
    }
  }
  return out.sort((x, y) => y.grows - x.grows);
}

/**
 * How much of each straight piece passes through the long bones of the limbs (as capsules: the bone's axis and the
 * radius of its shaft, from the generated block's `bones`) with one joint turned, beyond what it passes through at
 * rest. Every piece with an end on a turned segment, or near a turned bone, is sampled every 2 mm against every
 * capsule, each capsule turned with its own segment. Returns [{ pose, id, i, restMm, posedMm, extra, bone }], most extra
 * first. Pure.
 */
export function poseBone(rig, lines, bones, poses = WIRING_POSES) {
  const out = [];
  const inCap = (p, b) => {
    const ab = [b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]], ap = [p[0] - b.a[0], p[1] - b.a[1], p[2] - b.a[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2));
    return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) < b.r;
  };
  const measure = (qa, qb, caps) => {
    const L = Math.hypot(qa[0] - qb[0], qa[1] - qb[1], qa[2] - qb[2]), n = Math.max(1, Math.ceil(L / 2));
    let mm = 0, which = null;
    for (let j = 0; j <= n; j++) { const t = j / n, q = [qa[0] + (qb[0] - qa[0]) * t, qa[1] + (qb[1] - qa[1]) * t, qa[2] + (qb[2] - qa[2]) * t]; for (const c of caps) if (inCap(q, c)) { mm += L / (n + 1); which = c.name; break; } }
    return { mm, which };
  };
  for (const pose of poses) {
    const P = poser(rig, pose);
    const posedCaps = bones.map(b => (P.moved(b.seg) ? { ...b, a: P.apply(b.a), b: P.apply(b.b) } : b));
    const anyMoved = bones.some(b => P.moved(b.seg));
    if (!anyMoved) continue;
    for (const ln of lines) {
      for (let i = 0; i + 1 < ln.pts.length; i++) {
        const A = ln.pts[i], Bp = ln.pts[i + 1], ma = P.moved(A.seg), mb = P.moved(Bp.seg);
        const qa = ma ? P.apply(A.p) : A.p, qb = mb ? P.apply(Bp.p) : Bp.p;
        const rest = measure(A.p, Bp.p, bones).mm, posed = measure(qa, qb, posedCaps);
        if (posed.mm - rest > 0.5) out.push({ pose: pose.name, id: ln.id, i, restMm: rest, posedMm: posed.mm, extra: posed.mm - rest, bone: posed.which });
      }
    }
  }
  return out.sort((x, y) => y.extra - x.extra);
}
/** The turns the pose tests make, one joint at a time, each inside what the game does with that joint. `far` is a
 * pivot beyond the joint and `moves(before, after)` says which way it must go (+y is the body's back, -x its right);
 * `rigSign` poses turn as the rig counts the joint (see poser). */
export const WIRING_POSES = Object.freeze([
  { name: 'arm raised forward 60°', joint: 'r_glenohumeral', axis: 'flex', deg: 60, far: 'r_elbow', moves: (b, a) => a[1] < b[1] },
  { name: 'arm raised sideways 60°', joint: 'r_glenohumeral', axis: 'abd', deg: 60, far: 'r_elbow', moves: (b, a) => a[0] < b[0] },
  { name: 'elbow bent 90°', joint: 'r_elbow', axis: 'flex', deg: 90, far: 'r_wrist', moves: (b, a) => a[1] < b[1] },
  { name: 'elbow bent 140°', joint: 'r_elbow', axis: 'flex', deg: 140, far: 'r_wrist', moves: (b, a) => a[1] < b[1] },
  { name: 'forearm turned 80° (pronation, as the rig counts it)', joint: 'r_radioulnar', axis: 'pron', deg: 80, rigSign: true },
  { name: 'forearm turned 160° (full pronation, the game\'s start)', joint: 'r_radioulnar', axis: 'pron', deg: 160, rigSign: true },
  { name: 'wrist bent 50° to the palm', joint: 'r_wrist', axis: 'flex', deg: 50, far: 'r_middle_mcp', moves: (b, a) => a[1] < b[1] },
  { name: 'wrist bent back 50°', joint: 'r_wrist', axis: 'flex', deg: 50, far: 'r_middle_mcp', moves: (b, a) => a[1] > b[1] },
  { name: 'hip bent 60°', joint: 'r_hip', axis: 'flex', deg: 60, far: 'r_knee', moves: (b, a) => a[1] < b[1] },
  { name: 'hip bent 100°', joint: 'r_hip', axis: 'flex', deg: 100, far: 'r_knee', moves: (b, a) => a[1] < b[1] },
  { name: 'thigh spread 30°', joint: 'r_hip', axis: 'abd', deg: 30, far: 'r_knee', moves: (b, a) => a[0] < b[0] },
  { name: 'knee bent 90°', joint: 'r_knee', axis: 'flex', deg: 90, far: 'r_ankle', moves: (b, a) => a[1] > b[1] },
  { name: 'knee bent 120°', joint: 'r_knee', axis: 'flex', deg: 120, far: 'r_ankle', moves: (b, a) => a[1] > b[1] },
  { name: 'foot lifted 20°', joint: 'r_ankle', axis: 'dorsi', deg: 20, far: 'r_mtp', moves: (b, a) => a[2] > b[2] },
  { name: 'foot pointed 35°', joint: 'r_ankle', axis: 'dorsi', deg: 35, far: 'r_mtp', moves: (b, a) => a[2] < b[2] },
  { name: 'jaw opened 30°', joint: 'tmj', axis: 'open', deg: 30, rigSign: true },
  { name: 'neck bent forward 30°', joint: 'cervicothoracic', axis: 'flex', deg: 30, far: 'atlanto_occipital', moves: (b, a) => a[1] < b[1] },
  { name: 'neck bent back 30°', joint: 'cervicothoracic', axis: 'flex', deg: 30, far: 'atlanto_occipital', moves: (b, a) => a[1] > b[1] },
  { name: 'neck turned 45°', joint: 'cervicothoracic', axis: 'rot', deg: 45, rigSign: true }
]);