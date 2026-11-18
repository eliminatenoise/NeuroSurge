// NeuroSurge: make a coarser copy of a triangle mesh (19 November 2026; the owner: "Perhaps game is way too big at
// the moment"; "Performance and reliability should be our number one priority. even if that means extreme simplicity").
//
// simplifyMesh() removes vertices one at a time by sliding a vertex along one of its edges onto its neighbour (a
// half-edge collapse), always the removal that changes the surface least (the quadric error of Garland and Heckbert,
// 1997: the summed squared distance to the planes of the triangles that met at the vertices merged so far). Every
// vertex that is kept is a vertex of the source mesh, at its source position: nothing is moved, only left out.
//
// A removal is refused when it would
//   - change the surface's connections (the link condition: the two ends of the edge may share only the corners of the
//     one or two triangles on that edge), so no hole can open, no sheet can pinch, no handle can close;
//   - turn a triangle over (by more than about 72 degrees from how it lay before the removal, or to within 6 degrees of
//     edge-on to how it lay in the SOURCE mesh, so small turns cannot add up to a flip) or flatten it to a sliver;
//   - move a point of an open rim off the rim (a rim vertex slides only along the rim, and the rim's own planes are in
//     the error measure, so rims keep their shape);
//   - make an edge longer than maxEdgeMm (the muscles bend at the joints: they need vertices along their length);
//   - leave ANY vertex of the source mesh more than maxDevMm from the coarse surface. This is measured, not estimated:
//     every removed vertex stays on the books of the kept vertex it was slid onto, and whenever the triangles round
//     that kept vertex are about to change, each vertex on its books is measured against the triangles as they would
//     be. (The quadric only orders the candidates: its area-weighted mean alone lets the thin edge of a sheet muscle
//     creep inward by millimetres.)
// Vertices where more than two triangles share an edge are never removed.
//
// Before simplifying, vertices at exactly the same position are joined (some source files repeat vertices along
// seams; the game already shades such seams as one surface) and triangles with a repeated corner are dropped.
// Afterwards the triangles are put in a walking order and the vertices in the order the walk first meets them (so the
// pack is small), and measureDeviation() reports how far every SOURCE vertex lies from the coarse surface.
//
// Pure (Node or browser), deterministic: the same input gives the same output on every machine.

const sq = x => x * x;

/** Join vertices at exactly equal positions and drop triangles with a repeated corner.
 * Returns { positions: Float32Array, indices: Uint32Array, joined, dropped }. */
export function weldExact(positions, indices) {
  const n = positions.length / 3, map = new Uint32Array(n), seen = new Map();
  const u32 = new Uint32Array(positions.buffer, positions.byteOffset, positions.length);
  const out = [];
  let m = 0;
  for (let v = 0; v < n; v++) {
    // the three floats' bit patterns as a key (a negative zero is its own key: exact means exact)
    const key = `${u32[3 * v]},${u32[3 * v + 1]},${u32[3 * v + 2]}`;
    let w = seen.get(key);
    if (w === undefined) { w = m++; seen.set(key, w); out.push(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]); }
    map[v] = w;
  }
  const idx = [];
  let dropped = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = map[indices[i]], b = map[indices[i + 1]], c = map[indices[i + 2]];
    if (a === b || b === c || a === c) { dropped++; continue; }
    idx.push(a, b, c);
  }
  return { positions: new Float32Array(out), indices: new Uint32Array(idx), joined: n - m, dropped };
}

/** Counts of a mesh's connections: { vertices (used), triangles, rimEdges (one triangle), sharedEdges (two),
 * crowdedEdges (more than two), pieces (connected parts), euler (V - E + F) }. */
export function meshTopology(positions, indices) {
  const n = positions.length / 3, F = indices.length / 3;
  const edges = new Map(), parent = new Int32Array(n).fill(-1), used = new Uint8Array(n);
  const find = x => { while (parent[x] >= 0) { if (parent[parent[x]] >= 0) parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k], b = indices[i + (k + 1) % 3], key = a < b ? a * n + b : b * n + a;
      edges.set(key, (edges.get(key) || 0) + 1);
      used[a] = 1; join(a, b);
    }
  }
  let rim = 0, shared = 0, crowded = 0, V = 0, pieces = 0;
  for (const c of edges.values()) { if (c === 1) rim++; else if (c === 2) shared++; else crowded++; }
  for (let v = 0; v < n; v++) if (used[v]) { V++; if (parent[v] < 0) pieces++; }
  return { vertices: V, triangles: F, rimEdges: rim, sharedEdges: shared, crowdedEdges: crowded, pieces, euler: V - edges.size + F };
}

/**
 * Simplify. options: maxDevMm (how far a removed vertex may come to lie from the surface), maxEdgeMm (longest edge a
 * removal may make), minTriangles (a mesh at or under this is left as it is).
 * Returns { positions, indices, source: { vertices, triangles }, joined, dropped, removed } (welded, compacted, not
 * yet reordered).
 */
export function simplifyMesh(positions0, indices0, { maxDevMm = 0.3, maxEdgeMm = 6, minTriangles = 24 } = {}) {
  const w = weldExact(positions0, indices0);
  const P = w.positions, n = P.length / 3;
  const F0 = w.indices.length / 3;
  const src = { vertices: positions0.length / 3, triangles: indices0.length / 3 };
  if (F0 <= minTriangles) return { positions: P, indices: w.indices, source: src, joined: w.joined, dropped: w.dropped, removed: 0 };
  const T = Int32Array.from(w.indices);           // triangle corners; a dead triangle has T[3f] = -1
  // vertex -> its triangles
  const deg = new Uint32Array(n);
  for (let i = 0; i < T.length; i++) deg[T[i]]++;
  const vf = new Array(n);
  for (let v = 0; v < n; v++) vf[v] = [];
  for (let f = 0; f < F0; f++) { vf[T[3 * f]].push(f); vf[T[3 * f + 1]].push(f); vf[T[3 * f + 2]].push(f); }
  // edges: rim (one triangle) and crowded (more than two)
  const edgeCount = new Map();
  const ekey = (a, b) => (a < b ? a * n + b : b * n + a);
  for (let f = 0; f < F0; f++) for (let k = 0; k < 3; k++) { const key = ekey(T[3 * f + k], T[3 * f + (k + 1) % 3]); edgeCount.set(key, (edgeCount.get(key) || 0) + 1); }
  const rimV = new Uint8Array(n), locked = new Uint8Array(n);
  // quadrics: 10 numbers a vertex (the symmetric 4x4 of the summed plane equations) and the summed weight
  const Q = new Float64Array(10 * n), W = new Float64Array(n);
  const addPlane = (v, a, b, c, d, wgt) => {
    const o = 10 * v;
    Q[o] += wgt * a * a; Q[o + 1] += wgt * a * b; Q[o + 2] += wgt * a * c; Q[o + 3] += wgt * a * d;
    Q[o + 4] += wgt * b * b; Q[o + 5] += wgt * b * c; Q[o + 6] += wgt * b * d;
    Q[o + 7] += wgt * c * c; Q[o + 8] += wgt * c * d; Q[o + 9] += wgt * d * d;
    W[v] += wgt;
  };
  const nrm = [0, 0, 0];
  const faceNormal = (a, b, c) => {
    const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2];
    const ux = P[3 * b] - ax, uy = P[3 * b + 1] - ay, uz = P[3 * b + 2] - az, vx = P[3 * c] - ax, vy = P[3 * c + 1] - ay, vz = P[3 * c + 2] - az;
    nrm[0] = uy * vz - uz * vy; nrm[1] = uz * vx - ux * vz; nrm[2] = ux * vy - uy * vx;
    return Math.sqrt(nrm[0] * nrm[0] + nrm[1] * nrm[1] + nrm[2] * nrm[2]); // twice the area (sqrt, not hypot: the same bits on every engine)
  };
  const N0 = new Float32Array(3 * F0); // each triangle's unit normal in the source mesh
  for (let f = 0; f < F0; f++) {
    const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
    const l = faceNormal(a, b, c);
    if (!(l > 0)) continue;
    const nx = nrm[0] / l, ny = nrm[1] / l, nz = nrm[2] / l;
    N0[3 * f] = nx; N0[3 * f + 1] = ny; N0[3 * f + 2] = nz;
    const d = -(nx * P[3 * a] + ny * P[3 * a + 1] + nz * P[3 * a + 2]), area = l / 2;
    addPlane(a, nx, ny, nz, d, area); addPlane(b, nx, ny, nz, d, area); addPlane(c, nx, ny, nz, d, area);
    for (let k = 0; k < 3; k++) {
      const p = T[3 * f + k], q = T[3 * f + (k + 1) % 3], cnt = edgeCount.get(ekey(p, q));
      if (cnt > 2) { locked[p] = 1; locked[q] = 1; }
      if (cnt !== 1) continue;
      rimV[p] = 1; rimV[q] = 1;
      // a rim edge: the plane through the edge, square to the triangle, weighted strongly, keeps the rim's line
      const ex = P[3 * q] - P[3 * p], ey = P[3 * q + 1] - P[3 * p + 1], ez = P[3 * q + 2] - P[3 * p + 2];
      let mx = ey * nz - ez * ny, my = ez * nx - ex * nz, mz = ex * ny - ey * nx;
      const ml = Math.sqrt(mx * mx + my * my + mz * mz);
      if (!(ml > 0)) continue;
      mx /= ml; my /= ml; mz /= ml;
      const md = -(mx * P[3 * p] + my * P[3 * p + 1] + mz * P[3 * p + 2]), wgt = 8 * (ex * ex + ey * ey + ez * ez);
      addPlane(p, mx, my, mz, md, wgt); addPlane(q, mx, my, mz, md, wgt);
    }
  }
  const alive = new Uint8Array(n).fill(1), ver = new Uint32Array(n);
  // cost of sliding u onto v: the summed quadric of both at v's position
  const costAt = (u, v) => {
    const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], a = 10 * u, b = 10 * v;
    const q0 = Q[a] + Q[b], q1 = Q[a + 1] + Q[b + 1], q2 = Q[a + 2] + Q[b + 2], q3 = Q[a + 3] + Q[b + 3], q4 = Q[a + 4] + Q[b + 4],
      q5 = Q[a + 5] + Q[b + 5], q6 = Q[a + 6] + Q[b + 6], q7 = Q[a + 7] + Q[b + 7], q8 = Q[a + 8] + Q[b + 8], q9 = Q[a + 9] + Q[b + 9];
    return x * (q0 * x + 2 * q1 * y + 2 * q2 * z + 2 * q3) + y * (q4 * y + 2 * q5 * z + 2 * q6) + z * (q7 * z + 2 * q8) + q9;
  };
  // a binary heap of candidate removals in parallel arrays
  let cap = 1 << 16, size = 0;
  let hc = new Float64Array(cap), hu = new Int32Array(cap), hv = new Int32Array(cap), hsu = new Uint32Array(cap), hsv = new Uint32Array(cap);
  const grow = () => {
    cap *= 2;
    const c2 = new Float64Array(cap); c2.set(hc); hc = c2;
    const u2 = new Int32Array(cap); u2.set(hu); hu = u2; const v2 = new Int32Array(cap); v2.set(hv); hv = v2;
    const a2 = new Uint32Array(cap); a2.set(hsu); hsu = a2; const b2 = new Uint32Array(cap); b2.set(hsv); hsv = b2;
  };
  // order: cost, then the vertex numbers (so equal costs are taken in a fixed order on every machine)
  const less = (i, c, u, v) => hc[i] < c || (hc[i] === c && (hu[i] < u || (hu[i] === u && hv[i] < v)));
  const push = (c, u, v) => {
    if (size === cap) grow();
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(p, c, u, v)) break;
      hc[i] = hc[p]; hu[i] = hu[p]; hv[i] = hv[p]; hsu[i] = hsu[p]; hsv[i] = hsv[p]; i = p;
    }
    hc[i] = c; hu[i] = u; hv[i] = v; hsu[i] = ver[u]; hsv[i] = ver[v];
  };
  const top = { c: 0, u: 0, v: 0, su: 0, sv: 0 };
  const pop = () => {
    top.c = hc[0]; top.u = hu[0]; top.v = hv[0]; top.su = hsu[0]; top.sv = hsv[0];
    size--;
    if (size > 0) {
      const c = hc[size], u = hu[size], v = hv[size], su = hsu[size], sv = hsv[size];
      let i = 0;
      for (;;) {
        let k = 2 * i + 1;
        if (k >= size) break;
        if (k + 1 < size && !less(k, hc[k + 1], hu[k + 1], hv[k + 1])) k++;
        if (!less(k, c, u, v)) break;
        hc[i] = hc[k]; hu[i] = hu[k]; hv[i] = hv[k]; hsu[i] = hsu[k]; hsv[i] = hsv[k]; i = k;
      }
      hc[i] = c; hu[i] = u; hv[i] = v; hsu[i] = su; hsv[i] = sv;
    }
  };
  const maxEdge2 = maxEdgeMm * maxEdgeMm;
  const maxDev2 = maxDevMm * maxDevMm;
  const books = new Array(n).fill(null); // kept vertex -> the removed vertices slid onto it (source positions)
  const offer = (u, v) => {
    if (locked[u]) return;
    if (sq(P[3 * u] - P[3 * v]) + sq(P[3 * u + 1] - P[3 * v + 1]) + sq(P[3 * u + 2] - P[3 * v + 2]) > maxEdge2) return;
    push(Math.max(0, costAt(u, v)), u, v);
  };
  const stampN = new Int32Array(n).fill(-1);
  let stamp = 0;
  const neighbours = v => { const out = []; stamp++; for (const f of vf[v]) for (let k = 0; k < 3; k++) { const x = T[3 * f + k]; if (x !== v && stampN[x] !== stamp) { stampN[x] = stamp; out.push(x); } } return out; };
  for (let v = 0; v < n; v++) for (const x of neighbours(v)) offer(v, x);
  const mark = new Int32Array(n).fill(-1);
  let tick = 0, removed = 0;
  const canRemove = (u, v) => {
    // the triangles on the edge, and the link condition
    let onEdge = 0;
    tick++;
    for (const f of vf[v]) for (let k = 0; k < 3; k++) mark[T[3 * f + k]] = tick;
    let common = 0;
    stamp++;
    for (const f of vf[u]) {
      const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
      if (a === v || b === v || c === v) onEdge++;
      for (let k = 0; k < 3; k++) { const x = T[3 * f + k]; if (x !== u && x !== v && mark[x] === tick && stampN[x] !== stamp) { stampN[x] = stamp; common++; } }
    }
    if (onEdge < 1 || onEdge > 2 || common !== onEdge) return false;
    if (rimV[u] && onEdge !== 1) return false; // a rim vertex slides only along the rim
    const vx = P[3 * v], vy = P[3 * v + 1], vz = P[3 * v + 2];
    for (const f of vf[u]) {
      const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
      if (a === v || b === v || c === v) continue;
      const l0 = faceNormal(a, b, c), n0x = nrm[0], n0y = nrm[1], n0z = nrm[2];
      const p = a === u ? v : a, q = b === u ? v : b, r = c === u ? v : c;
      const l1 = faceNormal(p, q, r);
      if (!(l1 > 1e-9)) return false;
      if (n0x * nrm[0] + n0y * nrm[1] + n0z * nrm[2] < 0.3 * l0 * l1) return false; // turned by more than about 72 degrees
      if (N0[3 * f] * nrm[0] + N0[3 * f + 1] * nrm[1] + N0[3 * f + 2] * nrm[2] < 0.1 * l1) return false; // nearly edge-on to its source
      // the new edges from v, and the triangle's shape (twice its area over its longest edge squared)
      let longest = 0;
      for (const x of [a, b, c]) {
        if (x === u) continue;
        const d2 = sq(P[3 * x] - vx) + sq(P[3 * x + 1] - vy) + sq(P[3 * x + 2] - vz);
        if (d2 > maxEdge2) return false;
        if (d2 > longest) longest = d2;
      }
      const o1 = a === u ? b : a, o2 = c === u ? b : c;
      const e2 = sq(P[3 * o1] - P[3 * o2]) + sq(P[3 * o1 + 1] - P[3 * o2 + 1]) + sq(P[3 * o1 + 2] - P[3 * o2 + 2]);
      if (e2 > longest) longest = e2;
      if (l1 < 0.12 * longest) return false; // a sliver
    }
    // The deviation, measured. within(p, w): is source vertex p within maxDevMm of the triangles round kept vertex w as
    // they will be (u's triangles handed to v, the triangles on the edge gone)?
    const within = (p, w) => {
      const px = P[3 * p], py = P[3 * p + 1], pz = P[3 * p + 2];
      for (const f of vf[w]) {
        const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
        const hasU = a === u || b === u || c === u, hasV = a === v || b === v || c === v;
        if (hasU && hasV) continue;
        if (pointTriangleDist2(px, py, pz, P, 3 * (a === u ? v : a), 3 * (b === u ? v : b), 3 * (c === u ? v : c)) <= maxDev2) return true;
      }
      // v's new fan also holds the triangles it takes over from u
      if (w === v || w === u) {
        for (const f of vf[w === v ? u : v]) {
          const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
          const hasU = a === u || b === u || c === u, hasV = a === v || b === v || c === v;
          if (hasU && hasV) continue;
          if (pointTriangleDist2(px, py, pz, P, 3 * (a === u ? v : a), 3 * (b === u ? v : b), 3 * (c === u ? v : c)) <= maxDev2) return true;
        }
      }
      return false;
    };
    if (!within(u, u)) return false;
    if (books[u]) for (const p of books[u]) if (!within(p, u)) return false;
    // the kept vertices round u (v among them): their triangles change too, so their books are measured again
    stamp++;
    for (const f of vf[u]) for (let k = 0; k < 3; k++) {
      const x = T[3 * f + k];
      if (x === u || stampN[x] === stamp) continue;
      stampN[x] = stamp;
      if (books[x]) for (const p of books[x]) if (!within(p, x)) return false;
    }
    return true;
  };
  while (size > 0) {
    pop();
    const u = top.u, v = top.v;
    if (!alive[u] || !alive[v] || ver[u] !== top.su || ver[v] !== top.sv) continue;
    if (!canRemove(u, v)) continue;
    // slide u onto v
    const keep = [];
    for (const f of vf[u]) {
      const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
      if (a === v || b === v || c === v) {
        // the triangle on the edge disappears: take it out of its third corner's list
        const o = a !== u && a !== v ? a : b !== u && b !== v ? b : c;
        const lo = vf[o]; lo.splice(lo.indexOf(f), 1);
        const lv = vf[v]; lv.splice(lv.indexOf(f), 1);
        T[3 * f] = -1;
      } else {
        if (a === u) T[3 * f] = v; else if (b === u) T[3 * f + 1] = v; else T[3 * f + 2] = v;
        keep.push(f);
      }
    }
    for (const f of keep) vf[v].push(f);
    vf[u] = [];
    alive[u] = 0;
    for (let k = 0; k < 10; k++) Q[10 * v + k] += Q[10 * u + k];
    W[v] += W[u];
    if (!books[v]) books[v] = [];
    books[v].push(u);
    if (books[u]) { for (const p of books[u]) books[v].push(p); books[u] = null; }
    if (rimV[u]) rimV[v] = 1;
    ver[v]++;
    removed++;
    for (const x of neighbours(v)) { offer(v, x); offer(x, v); }
  }
  // compact
  const map = new Int32Array(n).fill(-1), pos = [], idx = [];
  for (let f = 0; f < F0; f++) {
    if (T[3 * f] < 0) continue;
    for (let k = 0; k < 3; k++) {
      const v = T[3 * f + k];
      if (map[v] < 0) { map[v] = pos.length / 3; pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); }
      idx.push(map[v]);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), source: src, joined: w.joined, dropped: w.dropped, removed };
}

/** Put the triangles in a walking order (each next to one already written where possible) and the vertices in the
 * order the walk first meets them. The surface is the same; the pack is smaller. */
export function reorderForPack(positions, indices) {
  const n = positions.length / 3, F = indices.length / 3;
  const edgeFaces = new Map();
  const ekey = (a, b) => (a < b ? a * n + b : b * n + a);
  for (let f = 0; f < F; f++) for (let k = 0; k < 3; k++) { const key = ekey(indices[3 * f + k], indices[3 * f + (k + 1) % 3]); const l = edgeFaces.get(key); if (l) l.push(f); else edgeFaces.set(key, [f]); }
  const done = new Uint8Array(F), order = [];
  for (let seed = 0; seed < F; seed++) {
    if (done[seed]) continue;
    const stack = [seed]; done[seed] = 1;
    while (stack.length) {
      const f = stack.pop();
      order.push(f);
      for (let k = 2; k >= 0; k--) {
        for (const g of edgeFaces.get(ekey(indices[3 * f + k], indices[3 * f + (k + 1) % 3]))) if (!done[g]) { done[g] = 1; stack.push(g); }
      }
    }
  }
  const map = new Int32Array(n).fill(-1), pos = new Float32Array(positions.length), idx = new Uint32Array(indices.length);
  let m = 0, w = 0;
  for (const f of order) for (let k = 0; k < 3; k++) {
    const v = indices[3 * f + k];
    if (map[v] < 0) { map[v] = m; pos[3 * m] = positions[3 * v]; pos[3 * m + 1] = positions[3 * v + 1]; pos[3 * m + 2] = positions[3 * v + 2]; m++; }
    idx[w++] = map[v];
  }
  return { positions: m === n ? pos : pos.slice(0, 3 * m), indices: idx };
}

/** Squared distance from point p to the segment from (ax, ay, az) along (dx, dy, dz). */
function pointSegmentDist2(px, py, pz, ax, ay, az, dx, dy, dz) {
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return sq(px - ax - t * dx) + sq(py - ay - t * dy) + sq(pz - az - t * dz);
}

/** Squared distance from point p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5); a triangle with no
 * area is measured as its three edges. */
function pointTriangleDist2(px, py, pz, P, a, b, c) {
  const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  {
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    if (!(nx * nx + ny * ny + nz * nz > 1e-18)) {
      return Math.min(pointSegmentDist2(px, py, pz, ax, ay, az, abx, aby, abz), pointSegmentDist2(px, py, pz, ax, ay, az, acx, acy, acz), pointSegmentDist2(px, py, pz, bx, by, bz, cx - bx, cy - by, cz - bz));
    }
  }
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); return sq(apx - t * abx) + sq(apy - t * aby) + sq(apz - t * abz); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); return sq(apx - t * acx) + sq(apy - t * acy) + sq(apz - t * acz); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const t = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return sq(bpx - t * (cx - bx)) + sq(bpy - t * (cy - by)) + sq(bpz - t * (cz - bz)); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return sq(apx - v * abx - w * acx) + sq(apy - v * aby - w * acy) + sq(apz - v * abz - w * acz);
}

/** How far the source's vertices lie from the coarse surface: { maxMm, meanMm, p99Mm } (a grid of the coarse
 * triangles; every source vertex is measured). */
export function measureDeviation(sourcePositions, positions, indices, { cellMm = 6 } = {}) {
  const F = indices.length / 3, grid = new Map();
  const key = (i, j, k) => `${i},${j},${k}`;
  for (let f = 0; f < F; f++) {
    const a = 3 * indices[3 * f], b = 3 * indices[3 * f + 1], c = 3 * indices[3 * f + 2];
    const lo = [0, 0, 0], hi = [0, 0, 0];
    for (let d = 0; d < 3; d++) { lo[d] = Math.floor(Math.min(positions[a + d], positions[b + d], positions[c + d]) / cellMm); hi[d] = Math.floor(Math.max(positions[a + d], positions[b + d], positions[c + d]) / cellMm); }
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const kk = key(i, j, k); const l = grid.get(kk); if (l) l.push(f); else grid.set(kk, [f]); }
  }
  const n = sourcePositions.length / 3, dist = new Float32Array(n);
  let sum = 0, max = 0;
  for (let v = 0; v < n; v++) {
    const x = sourcePositions[3 * v], y = sourcePositions[3 * v + 1], z = sourcePositions[3 * v + 2];
    const ci = Math.floor(x / cellMm), cj = Math.floor(y / cellMm), ck = Math.floor(z / cellMm);
    let best = Infinity;
    for (let r = 0; r <= 8; r++) {
      // the shell of cells at ring r; once the best found is nearer than the ring's inner edge, stop
      if (best <= sq((r - 1) * cellMm) && r > 0) break;
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== r) continue;
        const l = grid.get(key(i, j, k));
        if (!l) continue;
        for (const f of l) { const d2 = pointTriangleDist2(x, y, z, positions, 3 * indices[3 * f], 3 * indices[3 * f + 1], 3 * indices[3 * f + 2]); if (d2 < best) best = d2; }
      }
    }
    const d = Math.sqrt(best);
    dist[v] = d; sum += d; if (d > max) max = d;
  }
  const sorted = Float32Array.from(dist).sort();
  return { maxMm: max, meanMm: n ? sum / n : 0, p99Mm: n ? sorted[Math.min(n - 1, Math.floor(0.99 * n))] : 0 };
}
