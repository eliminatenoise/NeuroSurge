/**
 * NeuroSurge R558: a small bounding-volume hierarchy for ray picks against RIGID triangle meshes. Project-owned code, CC0.
 *
 * Why: every live frame asks "what is under the crosshair: the brain, the mirror body, or nothing?" (ns-scene-three
 * graspTargetAt). Three.js answers by testing the ray against every triangle of every mesh whose bounding sphere it
 * crosses. With the full-detail meshes that was more than half of the frame time while idle (measured with the
 * Chrome DevTools sampling profiler: intersectTriangle and its callers, about 15 ms of each frame). The answer does
 * not need every triangle: a tree of boxes skips almost all of them.
 *
 * What it is: for one geometry (positions + optional triangle index), a binary tree of axis-aligned boxes over its
 * triangles, built once, and a nearest-hit ray query. The hit is found with the same triangle test Three.js uses
 * (Moller-Trumbore, with the same front / back / double side rule), so a pick means the same as before; only the
 * triangles that cannot be hit are skipped. It is used for picking only, never for drawing, and it changes no mesh.
 *
 * Not for meshes whose vertices move in place (the CPU-skinned left-arm muscles): their tree would go stale. The
 * scene keeps Three's own test for those.
 */

export const BVH_LEAF_TRIANGLES = 6;

/** Sides (same meaning as Three.js FrontSide, BackSide, DoubleSide for a ray pick). */
export const BVH_SIDE = Object.freeze({ front: 0, back: 1, double: 2 });

/**
 * Build the tree. positions: flat xyz (any numeric array); index: flat triangle corner indices or null (then every 9
 * numbers of positions are one triangle). Returns null for a mesh without triangles, else a plain object of typed
 * arrays: { triangles (count), order (triangle ids in leaf order), bounds (6 per node: min xyz, max xyz), left, right
 * (child node ids; -1 in a leaf), start, count (a leaf's run in `order`), nodes }. Pure.
 */
export function buildTriangleBvh(positions, index = null, leafTriangles = BVH_LEAF_TRIANGLES) {
  const triangles = index ? Math.floor(index.length / 3) : Math.floor(positions.length / 9);
  if (!(triangles > 0)) return null;
  const order = new Uint32Array(triangles);
  const lo = new Float32Array(3 * triangles), hi = new Float32Array(3 * triangles), mid = new Float32Array(3 * triangles);
  for (let t = 0; t < triangles; t++) {
    order[t] = t;
    const a = 3 * (index ? index[3 * t] : 3 * t), b = 3 * (index ? index[3 * t + 1] : 3 * t + 1), c = 3 * (index ? index[3 * t + 2] : 3 * t + 2);
    for (let k = 0; k < 3; k++) {
      const pa = positions[a + k], pb = positions[b + k], pc = positions[c + k];
      const mn = pa < pb ? (pa < pc ? pa : pc) : (pb < pc ? pb : pc), mx = pa > pb ? (pa > pc ? pa : pc) : (pb > pc ? pb : pc);
      lo[3 * t + k] = mn; hi[3 * t + k] = mx; mid[3 * t + k] = (mn + mx) * 0.5;
    }
  }
  const leaf = Math.max(1, leafTriangles | 0);
  const bounds = [], left = [], right = [], start = [], count = [];
  const stack = [0, triangles, -1, 0]; // start, end, parent node, 0 = left child / 1 = right child
  while (stack.length) {
    const side = stack.pop(), parent = stack.pop(), end = stack.pop(), begin = stack.pop();
    const node = left.length;
    if (parent >= 0) { if (side === 0) left[parent] = node; else right[parent] = node; }
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
    for (let i = begin; i < end; i++) {
      const t = 3 * order[i];
      if (lo[t] < x0) x0 = lo[t]; if (lo[t + 1] < y0) y0 = lo[t + 1]; if (lo[t + 2] < z0) z0 = lo[t + 2];
      if (hi[t] > x1) x1 = hi[t]; if (hi[t + 1] > y1) y1 = hi[t + 1]; if (hi[t + 2] > z1) z1 = hi[t + 2];
      const mx = mid[t], my = mid[t + 1], mz = mid[t + 2];
      if (mx < cx0) cx0 = mx; if (mx > cx1) cx1 = mx; if (my < cy0) cy0 = my; if (my > cy1) cy1 = my; if (mz < cz0) cz0 = mz; if (mz > cz1) cz1 = mz;
    }
    bounds.push(x0, y0, z0, x1, y1, z1);
    left.push(-1); right.push(-1); start.push(begin); count.push(end - begin);
    if (end - begin <= leaf) continue;
    // Split the longest side of the triangles' middle points at its centre; if that separates nothing, halve the run.
    const ex = cx1 - cx0, ey = cy1 - cy0, ez = cz1 - cz0;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const cut = axis === 0 ? (cx0 + cx1) * 0.5 : axis === 1 ? (cy0 + cy1) * 0.5 : (cz0 + cz1) * 0.5;
    let i = begin, j = end - 1;
    while (i <= j) {
      if (mid[3 * order[i] + axis] < cut) i++;
      else { const tmp = order[i]; order[i] = order[j]; order[j] = tmp; j--; }
    }
    let split = i;
    if (split === begin || split === end) split = (begin + end) >> 1;
    count[node] = 0; // an inner node holds no triangles itself
    stack.push(split, end, node, 1);
    stack.push(begin, split, node, 0);
  }
  return { triangles, order, bounds: Float32Array.from(bounds), left: Int32Array.from(left), right: Int32Array.from(right),
    start: Int32Array.from(start), count: Int32Array.from(count), nodes: left.length };
}

const traversal = new Int32Array(512);

/**
 * Nearest hit of the ray o + t d (t >= 0; d need not be unit length, t is in units of d) with the mesh, in the mesh's
 * own space. side: BVH_SIDE (front = a ray that meets a triangle from behind is ignored, as Three.js does for
 * FrontSide materials). Returns { t, triangle } of the nearest hit with t < tMax, or null. Pure.
 */
export function raycastTriangleBvh(bvh, positions, index, ox, oy, oz, dx, dy, dz, side = BVH_SIDE.front, tMax = Infinity) {
  if (!bvh) return null;
  const { bounds, left, right, start, count, order } = bvh;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  // A direction component that is zero (or so small that its reciprocal is not finite) makes the ray parallel to that
  // pair of box faces. It is then handled on its own: the node is skipped only when the origin lies outside the pair,
  // and otherwise that axis sets no limit. The earlier form multiplied by +/-Infinity and relied on the comparisons;
  // with the origin exactly ON a face that product is 0 x Infinity = NaN, and a node holding the hit could be skipped.
  const px = !(Math.abs(ix) < Infinity), py = !(Math.abs(iy) < Infinity), pz = !(Math.abs(iz) < Infinity);
  let best = tMax, bestTriangle = -1, top = 0;
  traversal[top++] = 0;
  while (top > 0) {
    const node = traversal[--top], b = 6 * node;
    // slab test against the node's box (faces included)
    let near = -Infinity, far = Infinity, t0, t1;
    if (px) { if (ox < bounds[b] || ox > bounds[b + 3]) continue; }
    else {
      t0 = (bounds[b] - ox) * ix; t1 = (bounds[b + 3] - ox) * ix;
      if (t0 < t1) { near = t0; far = t1; } else { near = t1; far = t0; }
    }
    if (py) { if (oy < bounds[b + 1] || oy > bounds[b + 4]) continue; }
    else {
      t0 = (bounds[b + 1] - oy) * iy; t1 = (bounds[b + 4] - oy) * iy;
      if (t0 < t1) { if (t0 > near) near = t0; if (t1 < far) far = t1; } else { if (t1 > near) near = t1; if (t0 < far) far = t0; }
    }
    if (pz) { if (oz < bounds[b + 2] || oz > bounds[b + 5]) continue; }
    else {
      t0 = (bounds[b + 2] - oz) * iz; t1 = (bounds[b + 5] - oz) * iz;
      if (t0 < t1) { if (t0 > near) near = t0; if (t1 < far) far = t1; } else { if (t1 > near) near = t1; if (t0 < far) far = t0; }
    }
    if (far < near || far < 0 || near >= best) continue;
    if (left[node] < 0) {
      for (let i = start[node], e = i + count[node]; i < e; i++) {
        const tri = order[i];
        const a = 3 * (index ? index[3 * tri] : 3 * tri), bq = 3 * (index ? index[3 * tri + 1] : 3 * tri + 1), c = 3 * (index ? index[3 * tri + 2] : 3 * tri + 2);
        const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
        const e1x = positions[bq] - ax, e1y = positions[bq + 1] - ay, e1z = positions[bq + 2] - az;
        const e2x = positions[c] - ax, e2y = positions[c + 1] - ay, e2z = positions[c + 2] - az;
        // normal = e1 x e2; a ray along the normal meets the triangle from behind (Three.js Ray.intersectTriangle)
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        let DdN = dx * nx + dy * ny + dz * nz, sign;
        if (DdN > 0) { if (side === BVH_SIDE.front) continue; sign = 1; }
        else if (DdN < 0) { if (side === BVH_SIDE.back) continue; sign = -1; DdN = -DdN; }
        else continue;
        const qx = ox - ax, qy = oy - ay, qz = oz - az;
        // u = sign * d . (q x e2), v = sign * d . (e1 x q), t = -sign * q . n   (all still scaled by DdN)
        const u = sign * (dx * (qy * e2z - qz * e2y) + dy * (qz * e2x - qx * e2z) + dz * (qx * e2y - qy * e2x));
        if (u < 0) continue;
        const v = sign * (dx * (e1y * qz - e1z * qy) + dy * (e1z * qx - e1x * qz) + dz * (e1x * qy - e1y * qx));
        if (v < 0 || u + v > DdN) continue;
        const tt = -sign * (qx * nx + qy * ny + qz * nz);
        if (tt < 0) continue;
        const t = tt / DdN;
        if (t < best) { best = t; bestTriangle = tri; }
      }
    } else if (top + 2 <= traversal.length) { traversal[top++] = left[node]; traversal[top++] = right[node]; }
  }
  return bestTriangle < 0 ? null : { t: best, triangle: bestTriangle };
}
