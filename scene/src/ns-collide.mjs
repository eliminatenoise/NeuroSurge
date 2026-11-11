/** NeuroSurge scene: keeping your body, the glass brain and the mirror body apart (R558, user Message 12: "Ensure that
 * your body, the brain and the mirror do not touch or collide so adjust their initial starting locations and ensure
 * that they can be moved to and around each other but not through").
 *
 * Pure maths, no DOM, no Three. Every item is a set of SPHERES that cover the item's drawn vertices:
 *   - a sphere table is built ONCE per mesh geometry, in the geometry's own coordinates: the vertices are put into a
 *     grid of small cells (leaf cells), and each occupied cell becomes one sphere: centre = the mean of its vertices,
 *     radius = the farthest of its vertices from that centre (so every vertex lies inside, and neighbouring spheres
 *     overlap where the surface runs on, so the surface between the vertices is covered too). Leaves are grouped by a
 *     coarser grid (group spheres enclose their leaves) and the whole table has one bounding sphere;
 *   - an ITEM is a list of entries { table, matrix (geometry -> world metres, column-major 4x4), scale (the largest
 *     column length of the matrix, so a radius never shrinks under a squash), pad (extra world metres added to every
 *     radius, e.g. muscle thickness around a bone) }. A whole body is one item (one entry per mesh), the brain is one
 *     item (one entry per glass mesh), the mirror body is the body's entries seen through the mirror matrix.
 * Contact means: two spheres of different items closer than `clearance` (world metres, surface to surface). The test
 * runs from coarse to fine (item boxes, entry spheres, group spheres, leaf spheres) and stops at the first contact.
 *
 * Moving an item safely (stop at contact, never through, never a jump): given its matrix before and after a requested
 * move, clearFraction() finds by bisection the largest share f of the move (0..1) after which it is still clear, and
 * blendMatrix() gives the matrix at that share (a rigid turn about the item's centre plus the matching share of the
 * shift, so the item never shrinks or bends on the way). A move that starts already in contact is let through when it
 * does not bring the two closer (so an item that ended up touching can always be moved away again).
 *
 * The spheres are a conservative engineering cover of drawn display meshes, for a game rule. They are not a measured
 * body surface, not tissue contact and not physics.
 */

/** Sizes (display choices, world metres unless named mm).
 *  clearanceM: the gap kept between items ("a few centimetres").
 *  bodyLeafMm / bodyGroupMm: cell sizes for body meshes (BodyParts3D millimetres). A leaf sphere is at most about
 *    half the cell diagonal; measured on a 100 mm ball of points the cover stands about 1 cm outside the surface, so
 *    two bodies stop about 2 cm + clearanceM (about 4 cm) apart.
 *  brainLeafMm / brainGroupMm: cell sizes for the brain glass (brain source millimetres; the brain is drawn many
 *    times life size, so a 4 mm source cell is a few decimetres in the world, about 2 % of the brain's drawn width).
 *  armBonePadM: the left game arm's muscles are skinned on the CPU every frame, so the arm is covered by its BONES
 *    plus this pad for the muscle around them (the upper arm and forearm bellies lie within about 4 cm of the bone).
 *  bisectSteps: bisection steps of clearFraction (2^-7 of a frame's move: well under a millimetre for any key move).
 *  brainSolidCellMm: cell size (brain source mm) of the brain's solid (solidGrid; R558, Message 12). 2 mm: the sealed
 *    inside of the shipped brain meshes holds about 76,000 cells (0.6 L of the source brain), built in about 0.1 s.
 */
export const COLLIDE = Object.freeze({
  clearanceM: 0.02,
  bodyLeafMm: 20, bodyGroupMm: 100,
  brainLeafMm: 4, brainGroupMm: 24,
  armBonePadM: 0.04,
  bisectSteps: 7,
  brainSolidCellMm: 2
});

const fail = m => { throw new Error('ns:collide: ' + m); };
/* R558 (performance, P2): the same test as `m && m.length === 16 && Array.prototype.every.call(m, Number.isFinite)`
 * (every skips holes, so `i in m` does too), without the per-element callback; it runs for every entry of every moved
 * item in the stop-at-contact walks. */
const finite16 = m => {
  if (!(m && m.length === 16)) return m && m.length === 16;
  for (let i = 0; i < 16; i++) if ((i in m) && !Number.isFinite(m[i])) return false;
  return true;
};

/** Group leaf spheres by a coarse grid. R558 (performance): a number key (2^16 cells per axis either side of 0, exact
 * below 2^53) instead of a string; a cell outside that range keeps the string key. The cells, their order of first
 * appearance and so the whole table are unchanged. */
const KEY_SPAN = 65536;
function cellKey(x, y, z, size) {
  const i = Math.floor(x / size), j = Math.floor(y / size), k = Math.floor(z / size);
  if (i > -KEY_SPAN && i < KEY_SPAN && j > -KEY_SPAN && j < KEY_SPAN && k > -KEY_SPAN && k < KEY_SPAN) return ((i + KEY_SPAN) * 2 * KEY_SPAN + (j + KEY_SPAN)) * 2 * KEY_SPAN + (k + KEY_SPAN);
  return `${i},${j},${k}`;
}

/**
 * Sphere table of a point cloud (flat xyz, any units), see the module note.
 * R558 (per-frame cost: the body meshes skinned per vertex in the Space dance get new tables every frame): the same
 * cells, sums, radii and orders as sphereTableByKeys (string cell keys in Maps of point lists), found with integer cell
 * indices, a dense cell grid over the occupied box and flat arrays; every number of the table is bit-identical (checked
 * on every body mesh and the brain glass at both cell sizes), so stop-at-contact decisions do not change. Point clouds
 * whose cells would not fit the dense grid fall back to sphereTableByKeys.
 * @returns {{ leaves: Float64Array (x, y, z, r per leaf), groups: Float64Array (x, y, z, r, firstLeaf, leafCount per
 *   group), bound: number[4] (x, y, z, r), count: number }}
 */
const CELL_INDEX_LIMIT = 65536, GROUP_KEY_SPAN = 131072; // cell indices within +-2^16 pack into one exact integer key
export function sphereTable(positions, { leaf, group, stride = 1 } = {}) {
  if (!positions || !(positions.length >= 3) || positions.length % 3) fail('positions must be a flat xyz array');
  if (!(leaf > 0) || !(group >= leaf)) fail('cell sizes must be leaf > 0 and group >= leaf');
  const step = Math.max(1, Math.floor(stride)) * 3, nv = Math.ceil(positions.length / step);
  // cell indices of every point (the same Math.floor(coordinate / leaf) as cellKey), then a dense grid over their box
  const ci = new Int32Array(3 * nv);
  let a0 = Infinity, b0 = Infinity, c0 = Infinity, a1 = -Infinity, b1 = -Infinity, c1 = -Infinity;
  for (let i = 0, v = 0; i < positions.length; i += step, v++) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) fail('nonfinite position');
    const a = Math.floor(x / leaf), b = Math.floor(y / leaf), c = Math.floor(z / leaf);
    if (!(Math.abs(a) < CELL_INDEX_LIMIT && Math.abs(b) < CELL_INDEX_LIMIT && Math.abs(c) < CELL_INDEX_LIMIT)) return sphereTableByKeys(positions, { leaf, group, stride });
    ci[3 * v] = a; ci[3 * v + 1] = b; ci[3 * v + 2] = c;
    if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; if (c < c0) c0 = c; if (c > c1) c1 = c;
  }
  const na = a1 - a0 + 1, nb = b1 - b0 + 1, nc = c1 - c0 + 1;
  if (na * nb * nc > 4194304) return sphereTableByKeys(positions, { leaf, group, stride });
  const grid = new Int32Array(na * nb * nc).fill(-1), cellOf = new Int32Array(nv);
  let S = new Float64Array(3 * 256), N = new Float64Array(256), k = 0;
  for (let i = 0, v = 0; i < positions.length; i += step, v++) {
    const g = ((ci[3 * v] - a0) * nb + (ci[3 * v + 1] - b0)) * nc + (ci[3 * v + 2] - c0);
    let q = grid[g];
    if (q < 0) {
      q = grid[g] = k++;
      if (k > N.length) { const S2 = new Float64Array(6 * N.length); S2.set(S); S = S2; const N2 = new Float64Array(2 * N.length); N2.set(N); N = N2; }
    }
    cellOf[v] = q;
    S[3 * q] += positions[i]; S[3 * q + 1] += positions[i + 1]; S[3 * q + 2] += positions[i + 2]; N[q]++;
  }
  if (!k) fail('no points');
  const L = new Float64Array(4 * k);
  for (let q = 0; q < k; q++) { L[4 * q] = S[3 * q] / N[q]; L[4 * q + 1] = S[3 * q + 1] / N[q]; L[4 * q + 2] = S[3 * q + 2] / N[q]; }
  // R558 (performance, P2): Math.hypot only for a point that can be the farthest so far. A point whose squared distance
  // (the plain sum of squares, within a few units in the last place of the true value, as is Math.hypot) is below
  // R^2 (1 - 1e-9) has Math.hypot(...) < R and could not raise the radius R, so skipping it leaves every radius
  // bit-identical (same Math.hypot values, same running maxima); R > 1e-100 keeps tiny radii on the full test.
  for (let i = 0, v = 0; i < positions.length; i += step, v++) {
    const o = 4 * cellOf[v], dx = positions[i] - L[o], dy = positions[i + 1] - L[o + 1], dz = positions[i + 2] - L[o + 2], R = L[o + 3];
    if (R > 1e-100 && dx * dx + dy * dy + dz * dz < R * R * (1 - 1e-9)) continue;
    const r = Math.hypot(dx, dy, dz);
    if (r > R) L[o + 3] = r;
  }
  // groups in the order of their first leaf; leaves of a group in leaf order (as the Map-of-arrays version)
  const gids = new Map(), groupOf = new Int32Array(k), gCount = [];
  let ng = 0;
  for (let q = 0; q < k; q++) {
    const a = Math.floor(L[4 * q] / group) + CELL_INDEX_LIMIT, b = Math.floor(L[4 * q + 1] / group) + CELL_INDEX_LIMIT, c = Math.floor(L[4 * q + 2] / group) + CELL_INDEX_LIMIT;
    if (a < 0 || b < 0 || c < 0 || a >= GROUP_KEY_SPAN || b >= GROUP_KEY_SPAN || c >= GROUP_KEY_SPAN) return sphereTableByKeys(positions, { leaf, group, stride });
    const key = (a * GROUP_KEY_SPAN + b) * GROUP_KEY_SPAN + c;
    let g = gids.get(key);
    if (g === undefined) { g = ng++; gids.set(key, g); gCount.push(0); }
    groupOf[q] = g; gCount[g]++;
  }
  const start = new Int32Array(ng + 1);
  for (let g = 0; g < ng; g++) start[g + 1] = start[g] + gCount[g];
  const order = new Int32Array(k), fill = start.slice(0, ng);
  for (let q = 0; q < k; q++) order[fill[groupOf[q]]++] = q;
  const leaves = new Float64Array(4 * k), groups = new Float64Array(6 * ng);
  let li = 0, bx = 0, by = 0, bz = 0;
  for (let g = 0; g < ng; g++) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = start[g]; j < start[g + 1]; j++) { const o = 4 * order[j]; cx += L[o]; cy += L[o + 1]; cz += L[o + 2]; }
    const n = start[g + 1] - start[g];
    cx /= n; cy /= n; cz /= n;
    let r = 0;
    const first = li / 4;
    for (let j = start[g]; j < start[g + 1]; j++) {
      const o = 4 * order[j];
      r = Math.max(r, Math.hypot(L[o] - cx, L[o + 1] - cy, L[o + 2] - cz) + L[o + 3]);
      leaves[li] = L[o]; leaves[li + 1] = L[o + 1]; leaves[li + 2] = L[o + 2]; leaves[li + 3] = L[o + 3]; li += 4;
    }
    const gi = 6 * g;
    groups[gi] = cx; groups[gi + 1] = cy; groups[gi + 2] = cz; groups[gi + 3] = r; groups[gi + 4] = first; groups[gi + 5] = n;
    bx += cx; by += cy; bz += cz;
  }
  bx /= ng; by /= ng; bz /= ng;
  let br = 0;
  for (let i = 0; i < groups.length; i += 6) br = Math.max(br, Math.hypot(groups[i] - bx, groups[i + 1] - by, groups[i + 2] - bz) + groups[i + 3]);
  return Object.freeze({ leaves, groups, bound: Object.freeze([bx, by, bz, br]), count: k });
}

/** The original sphereTable (string cell keys; the reference the fast version reproduces bit for bit, and its fallback). */
function sphereTableByKeys(positions, { leaf, group, stride = 1 } = {}) {
  if (!positions || !(positions.length >= 3) || positions.length % 3) fail('positions must be a flat xyz array');
  if (!(leaf > 0) || !(group >= leaf)) fail('cell sizes must be leaf > 0 and group >= leaf');
  const step = Math.max(1, Math.floor(stride)) * 3;
  // R558 (performance): two passes over the points with a cell index per point, instead of a list of points per cell
  // (the same sums in the same order, the same farthest point: the table is unchanged; checked against the earlier
  // build on random clouds).
  const cells = new Map(), cellOf = new Int32Array(Math.ceil(positions.length / step));
  let sx = new Float64Array(64), sy = new Float64Array(64), sz = new Float64Array(64), cn = new Int32Array(64), nCells = 0;
  for (let i = 0, v = 0; i < positions.length; i += step, v++) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) fail('nonfinite position');
    const k = cellKey(x, y, z, leaf);
    let c = cells.get(k);
    if (c === undefined) {
      c = nCells++; cells.set(k, c);
      if (c >= sx.length) { const grow = a => { const b = new a.constructor(a.length * 2); b.set(a); return b; }; sx = grow(sx); sy = grow(sy); sz = grow(sz); cn = grow(cn); }
    }
    sx[c] += x; sy[c] += y; sz[c] += z; cn[c]++; cellOf[v] = c;
  }
  if (!nCells) fail('no points');
  const cxs = new Float64Array(nCells), cys = new Float64Array(nCells), czs = new Float64Array(nCells), rs = new Float64Array(nCells);
  for (let c = 0; c < nCells; c++) { cxs[c] = sx[c] / cn[c]; cys[c] = sy[c] / cn[c]; czs[c] = sz[c] / cn[c]; }
  for (let i = 0, v = 0; i < positions.length; i += step, v++) {
    const c = cellOf[v], d = Math.hypot(positions[i] - cxs[c], positions[i + 1] - cys[c], positions[i + 2] - czs[c]);
    if (d > rs[c]) rs[c] = d;
  }
  const leafList = new Array(nCells);
  for (let c = 0; c < nCells; c++) leafList[c] = [cxs[c], cys[c], czs[c], rs[c]];
  const groupsMap = new Map();
  for (const l of leafList) {
    const k = cellKey(l[0], l[1], l[2], group);
    let g = groupsMap.get(k);
    if (!g) { g = []; groupsMap.set(k, g); }
    g.push(l);
  }
  const leaves = new Float64Array(leafList.length * 4), groups = new Float64Array(groupsMap.size * 6);
  let li = 0, gi = 0, bx = 0, by = 0, bz = 0;
  for (const g of groupsMap.values()) {
    let cx = 0, cy = 0, cz = 0;
    for (const l of g) { cx += l[0]; cy += l[1]; cz += l[2]; }
    cx /= g.length; cy /= g.length; cz /= g.length;
    let r = 0;
    const first = li / 4;
    for (const l of g) { r = Math.max(r, Math.hypot(l[0] - cx, l[1] - cy, l[2] - cz) + l[3]); leaves.set(l, li); li += 4; }
    groups.set([cx, cy, cz, r, first, g.length], gi); gi += 6;
    bx += cx; by += cy; bz += cz;
  }
  const n = groupsMap.size;
  bx /= n; by /= n; bz /= n;
  let br = 0;
  for (let i = 0; i < groups.length; i += 6) br = Math.max(br, Math.hypot(groups[i] - bx, groups[i + 1] - by, groups[i + 2] - bz) + groups[i + 3]);
  return Object.freeze({ leaves, groups, bound: Object.freeze([bx, by, bz, br]), count: leafList.length });
}

/* ------------------------------------------------------------------ matrices */

/** c = a * b (column-major 4x4). */
export function mul(a, b) {
  // R558 (performance, P2): the loops written out; every element is the same four products added in the same order
  // (a[row] b[4 col] + a[4 + row] b[4 col + 1] + a[8 + row] b[4 col + 2] + a[12 + row] b[4 col + 3]), so the result is
  // bit-for-bit the loop's.
  const c = new Float64Array(16);
  const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
  const a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11], a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
  let x = b[0], y = b[1], z = b[2], w = b[3];
  c[0] = a0 * x + a4 * y + a8 * z + a12 * w; c[1] = a1 * x + a5 * y + a9 * z + a13 * w; c[2] = a2 * x + a6 * y + a10 * z + a14 * w; c[3] = a3 * x + a7 * y + a11 * z + a15 * w;
  x = b[4]; y = b[5]; z = b[6]; w = b[7];
  c[4] = a0 * x + a4 * y + a8 * z + a12 * w; c[5] = a1 * x + a5 * y + a9 * z + a13 * w; c[6] = a2 * x + a6 * y + a10 * z + a14 * w; c[7] = a3 * x + a7 * y + a11 * z + a15 * w;
  x = b[8]; y = b[9]; z = b[10]; w = b[11];
  c[8] = a0 * x + a4 * y + a8 * z + a12 * w; c[9] = a1 * x + a5 * y + a9 * z + a13 * w; c[10] = a2 * x + a6 * y + a10 * z + a14 * w; c[11] = a3 * x + a7 * y + a11 * z + a15 * w;
  x = b[12]; y = b[13]; z = b[14]; w = b[15];
  c[12] = a0 * x + a4 * y + a8 * z + a12 * w; c[13] = a1 * x + a5 * y + a9 * z + a13 * w; c[14] = a2 * x + a6 * y + a10 * z + a14 * w; c[15] = a3 * x + a7 * y + a11 * z + a15 * w;
  return c;
}

/** Inverse of an affine 4x4 (bottom row 0 0 0 1); throws on a singular matrix. */
export function affineInverse(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], k = m[10];
  const A = e * k - f * h, B = f * g - d * k, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-300)) fail('singular matrix');
  const id = 1 / det;
  const r = new Float64Array(16);
  r[0] = A * id; r[4] = (c * h - b * k) * id; r[8] = (b * f - c * e) * id;
  r[1] = B * id; r[5] = (a * k - c * g) * id; r[9] = (c * d - a * f) * id;
  r[2] = C * id; r[6] = (b * g - a * h) * id; r[10] = (a * e - b * d) * id;
  const tx = m[12], ty = m[13], tz = m[14];
  r[12] = -(r[0] * tx + r[4] * ty + r[8] * tz);
  r[13] = -(r[1] * tx + r[5] * ty + r[9] * tz);
  r[14] = -(r[2] * tx + r[6] * ty + r[10] * tz);
  r[15] = 1;
  return r;
}

/** Point through a 4x4. */
export function apply(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

/** Largest column length of the linear part (a radius scale that never shrinks a sphere). */
export function maxScale(m) {
  return Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
}

function quatOfRotation(m) {
  const t = m[0] + m[5] + m[10];
  let w, x, y, z;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (m[6] - m[9]) / s; y = (m[8] - m[2]) / s; z = (m[1] - m[4]) / s; }
  else if (m[0] > m[5] && m[0] > m[10]) { const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2; w = (m[6] - m[9]) / s; x = s / 4; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s; }
  else if (m[5] > m[10]) { const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2; w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = s / 4; z = (m[9] + m[6]) / s; }
  else { const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2; w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = s / 4; }
  const n = Math.hypot(w, x, y, z) || 1;
  return [w / n, x / n, y / n, z / n];
}
function rotationOfQuat([w, x, y, z]) {
  const m = new Float64Array(16);
  m[0] = 1 - 2 * (y * y + z * z); m[4] = 2 * (x * y - w * z); m[8] = 2 * (x * z + w * y);
  m[1] = 2 * (x * y + w * z); m[5] = 1 - 2 * (x * x + z * z); m[9] = 2 * (y * z - w * x);
  m[2] = 2 * (x * z - w * y); m[6] = 2 * (y * z + w * x); m[10] = 1 - 2 * (x * x + y * y);
  m[15] = 1;
  return m;
}
/** True when the linear part of d is a rotation (orthonormal, det +1) to 1e-6. */
function isRotation(d) {
  const c = [[d[0], d[1], d[2]], [d[4], d[5], d[6]], [d[8], d[9], d[10]]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const v = c[i][0] * c[j][0] + c[i][1] * c[j][1] + c[i][2] * c[j][2];
    if (Math.abs(v - (i === j ? 1 : 0)) > 1e-6) return false;
  }
  return c[0][0] * (c[1][1] * c[2][2] - c[1][2] * c[2][1]) - c[0][1] * (c[1][0] * c[2][2] - c[1][2] * c[2][0]) + c[0][2] * (c[1][0] * c[2][1] - c[1][1] * c[2][0]) > 0;
}

/**
 * The matrix a share f (0..1) of the way from `from` to `to`. When the move from -> to is rigid (a turn and a shift)
 * the item turns by f of the turn about `pivot` (world, the item's centre) and moves by f of its centre's shift, so it
 * keeps its size and shape on the way; otherwise (a change of size or squash) the entries are blended linearly.
 */
export function blendMatrix(from, to, f, pivot) {
  if (!finite16(from) || !finite16(to)) fail('blendMatrix needs finite 4x4 matrices');
  if (f <= 0) return Float64Array.from(from);
  if (f >= 1) return Float64Array.from(to);
  const d = mul(to, affineInverse(from));
  if (pivot && isRotation(d)) {
    let q = quatOfRotation(d);
    if (q[0] < 0) q = q.map(v => -v);
    const ang = 2 * Math.acos(Math.min(1, q[0])), s = Math.sin(ang / 2);
    let qf = [1, 0, 0, 0];
    if (ang > 1e-12 && s > 1e-12) { const a = ang * f; const k = Math.sin(a / 2) / s; qf = [Math.cos(a / 2), q[1] * k, q[2] * k, q[3] * k]; }
    const R = rotationOfQuat(qf);
    const p = pivot, pd = apply(d, p[0], p[1], p[2]);
    const rp = apply(R, p[0], p[1], p[2]);
    // x -> R (x - p) + p + f (d(p) - p)
    R[12] = p[0] - rp[0] + f * (pd[0] - p[0]); R[13] = p[1] - rp[1] + f * (pd[1] - p[1]); R[14] = p[2] - rp[2] + f * (pd[2] - p[2]);
    return mul(R, from);
  }
  const out = new Float64Array(16);
  for (let i = 0; i < 16; i++) out[i] = from[i] + (to[i] - from[i]) * f;
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  return out;
}

/* ------------------------------------------------------------------ items */

/** One entry of an item (see the module note). */
export function entry(table, matrix, pad = 0, tag = null) {
  if (!table || !table.leaves) fail('entry needs a sphereTable');
  if (!finite16(matrix)) fail('entry needs a finite 4x4 matrix');
  const m = Float64Array.from(matrix), s = maxScale(m), b = table.bound, c = apply(m, b[0], b[1], b[2]);
  return { table, m, s, pad, tag, c, r: b[3] * s + pad, g: null, l: null };
}

/** An item from entries, with its world box. */
export function item(entries) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const e of entries) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], e.c[k] - e.r); hi[k] = Math.max(hi[k], e.c[k] + e.r); }
  return { entries, lo, hi };
}

/** The item moved by world matrix d (every entry's matrix becomes d * matrix). R558 (performance): the product is used
 * as the entry's matrix directly (entry() copied it once more); the same numbers. */
export function moved(it, d) {
  if (!finite16(d)) fail('moved needs a finite 4x4 matrix');
  const out = new Array(it.entries.length);
  for (let i = 0; i < out.length; i++) {
    const e = it.entries[i], m = mul(d, e.m);
    if (!finite16(m)) fail('moved: nonfinite matrix');
    const sc = maxScale(m), b = e.table.bound;
    out[i] = { table: e.table, m, s: sc, pad: e.pad, tag: e.tag, c: apply(m, b[0], b[1], b[2]), r: b[3] * sc + e.pad, g: null, l: null };
  }
  return item(out);
}

/** Entries whose matrices are replaced (map tag -> new matrix); the rest are kept as they are. */
export function remapped(it, matrixFor) {
  return item(it.entries.map(e => { const m = matrixFor(e); return m ? entry(e.table, m, e.pad, e.tag) : e; }));
}

function worldGroups(e) {
  if (e.g) return e.g;
  const G = e.table.groups, out = new Float64Array(G.length / 6 * 4), m = e.m;
  for (let i = 0, j = 0; i < G.length; i += 6, j += 4) {
    const x = G[i], y = G[i + 1], z = G[i + 2];
    out[j] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[j + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[j + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    out[j + 3] = G[i + 3] * e.s + e.pad;
  }
  e.g = out;
  return out;
}
function worldLeaves(e, gi) {
  if (!e.l) e.l = new Map();
  let out = e.l.get(gi);
  if (out) return out;
  const G = e.table.groups, L = e.table.leaves, first = G[gi * 6 + 4], n = G[gi * 6 + 5], m = e.m;
  out = new Float64Array(n * 4);
  for (let k = 0; k < n; k++) {
    const i = (first + k) * 4, x = L[i], y = L[i + 1], z = L[i + 2];
    out[4 * k] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[4 * k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[4 * k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    out[4 * k + 3] = L[i + 3] * e.s + e.pad;
  }
  e.l.set(gi, out);
  return out;
}
const boxGap = (c, r, lo, hi) => {
  let d = 0;
  for (let k = 0; k < 3; k++) { const v = c[k] < lo[k] ? lo[k] - c[k] : c[k] > hi[k] ? c[k] - hi[k] : 0; d += v * v; }
  return Math.sqrt(d) - r;
};

/**
 * Smallest surface gap between items a and b (world metres), searched only below `cap`: returns the gap (may be
 * negative = overlap) when it is below cap, else cap. With `stopBelow` set, returns as soon as a gap below it is found.
 */
export function minGap(a, b, cap = Infinity, stopBelow = -Infinity) {
  if (!a || !b || !a.entries.length || !b.entries.length) return cap;
  let best = cap;
  const ea = a.entries.filter(e => boxGap(e.c, e.r, b.lo, b.hi) < best);
  if (!ea.length) return best;
  const eb = b.entries.filter(e => boxGap(e.c, e.r, a.lo, a.hi) < best);
  // Group spheres of each entry of a that come near b's box at all (a big item, such as the brain, has most of its
  // groups far from a small one): only those are carried into the pair tests.
  const near = (g, i, lo, hi) => {
    let d = 0;
    for (let k = 0; k < 3; k++) { const v = g[i + k] < lo[k] ? lo[k] - g[i + k] : g[i + k] > hi[k] ? g[i + k] - hi[k] : 0; d += v * v; }
    return Math.sqrt(d) - g[i + 3];
  };
  // R558 (performance, Space dance): "distance minus radii >= best" is tested as a squared comparison (no Math.hypot
  // in the inner loops), and each pair of entries first keeps only the groups of y that come within best of x's own
  // bounding sphere. Both are exact rewrites of the same tests: the gap found is unchanged.
  const far = (dx, dy, dz, rr) => { const lim = best + rr; return lim <= 0 ? false : dx * dx + dy * dy + dz * dz >= lim * lim; };
  const gyCand = [];
  for (const x of ea) {
    const gxAll = worldGroups(x), cand = [];
    for (let i = 0; i < gxAll.length; i += 4) if (near(gxAll, i, b.lo, b.hi) < best) cand.push(i);
    if (!cand.length) continue;
    for (const y of eb) {
      if (far(x.c[0] - y.c[0], x.c[1] - y.c[1], x.c[2] - y.c[2], x.r + y.r)) continue;
      const gx = gxAll, gy = worldGroups(y);
      gyCand.length = 0;
      for (let j = 0; j < gy.length; j += 4) if (!far(gy[j] - x.c[0], gy[j + 1] - x.c[1], gy[j + 2] - x.c[2], gy[j + 3] + x.r)) gyCand.push(j);
      if (!gyCand.length) continue;
      for (const i of cand) {
        if (far(gx[i] - y.c[0], gx[i + 1] - y.c[1], gx[i + 2] - y.c[2], gx[i + 3] + y.r)) continue;
        for (const j of gyCand) {
          if (far(gx[i] - gy[j], gx[i + 1] - gy[j + 1], gx[i + 2] - gy[j + 2], gx[i + 3] + gy[j + 3])) continue;
          const lx = worldLeaves(x, i / 4), ly = worldLeaves(y, j / 4);
          for (let p = 0; p < lx.length; p += 4) {
            // A leaf farther from the other group's sphere than the best gap so far cannot do better.
            if (Math.hypot(lx[p] - gy[j], lx[p + 1] - gy[j + 1], lx[p + 2] - gy[j + 2]) - lx[p + 3] - gy[j + 3] >= best) continue;
            for (let q = 0; q < ly.length; q += 4) {
              const g = Math.hypot(lx[p] - ly[q], lx[p + 1] - ly[q + 1], lx[p + 2] - ly[q + 2]) - lx[p + 3] - ly[q + 3];
              if (g < best) { best = g; if (best < stopBelow) return best; }
            }
          }
        }
      }
    }
  }
  return best;
}

/** True when items a and b come closer than clearance anywhere. */
export function touches(a, b, clearance = COLLIDE.clearanceM) {
  return minGap(a, b, clearance, clearance) < clearance;
}

/**
 * Largest share f (0..1) of a move after which `test(f)` still says clear: test(f) returns the smallest gap (metres)
 * to the obstacles with the move made to share f. f = 1 when the whole move is clear; when the start itself is closer
 * than clearance, a move that does not reduce the gap is let through (f = 1) and one that does is held (f = 0).
 * Bisection with COLLIDE.bisectSteps steps; never returns a share past a contact.
 */
export function clearFraction(test, { clearance = COLLIDE.clearanceM, steps = COLLIDE.bisectSteps } = {}) {
  const end = test(1);
  if (end >= clearance) return 1;
  const start = test(0);
  if (start < clearance) return end >= start - 1e-6 ? 1 : 0;
  let lo = 0, hi = 1;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (test(mid) >= clearance) lo = mid; else hi = mid;
  }
  return lo;
}

/* ------------------------------------------------------------------ the way, not only the end (R558, Message 12) */

/**
 * How far (world metres) any point of `item` can travel when it moves from matrix `from` to matrix `to` the way
 * blendMatrix moves it (a turn about `pivot` and the matching share of the centre's shift), over the whole move (share 0
 * -> 1). Every share's travel is at most that share of this bound, because a point x goes R_f (x - p) + p + f t: its
 * move between two shares s < u is at most (u - s) (angle |x - p| + |t|). Returns null when the move is not rigid (then
 * the caller keeps the end-only test). Exact upper bound from the entries' bounding spheres; pure.
 */
export function rigidTravel(from, to, pivot, it) {
  if (!finite16(from) || !finite16(to) || !it || !it.entries || !pivot) return null;
  const d = mul(to, affineInverse(from));
  if (!isRotation(d)) return null;
  let q = quatOfRotation(d);
  if (q[0] < 0) q = q.map(v => -v);
  const angle = 2 * Math.acos(Math.min(1, q[0]));
  const pd = apply(d, pivot[0], pivot[1], pivot[2]), shift = Math.hypot(pd[0] - pivot[0], pd[1] - pivot[1], pd[2] - pivot[2]);
  let reach = 0;
  for (const e of it.entries) reach = Math.max(reach, Math.hypot(e.c[0] - pivot[0], e.c[1] - pivot[1], e.c[2] - pivot[2]) + e.r);
  return shift + angle * reach;
}

/**
 * Largest share f (0..1) of a move that stays clear along its WAY (clearFraction checks only the end, so a fast move
 * could carry a thin shell, such as the glass brain's, past a body in one frame and leave the body inside it).
 * gapAt(k, cap) returns the smallest gap (m) with the move made to share k, searched up to `cap`; travelM bounds how far
 * any point moves over the whole move (rigidTravel). Conservative advancement: the end is tested first with cap
 * travelM + clearance (a gap that large at the end means every share on the way is clear); otherwise the way is walked
 * from the start in steps no longer than the gap found less the clearance, and never longer than half the clearance
 * near contact, so nothing can pass through anything between two tested places. The first place closer than clearance
 * ends the walk; the contact share inside that step is found by bisection (COLLIDE.bisectSteps). A move that starts
 * closer than clearance may go on only while it never comes closer than it started (clearFraction's rule, checked
 * along the way). The sample budget grows with the move (a step near contact is half the clearance, so a clear slide of
 * travelM needs about travelM / (clearance / 2) places; at most 256). When it runs out, one sound end test from where
 * the walk got to (the end at least the remaining travel plus the clearance away) can still clear the rest; otherwise
 * the walk stops where it has got to (conservative). No bisection there: it would test only end places and reopen the
 * tunnelling this walk closes. Returns { share, stoppedBy: 'clear' | 'contact' | 'budget' }: only 'contact' is a place
 * closer than allowed; 'budget' is a conservative stop on a way found clear so far. Pure.
 */
export function walkMove(gapAt, travelM, { clearance = COLLIDE.clearanceM, steps = COLLIDE.bisectSteps, cap = 0.5, maxSamples = null, endGap = null } = {}) {
  if (!(travelM > 0)) return { share: 1, stoppedBy: 'clear' };
  // endGap: the end's gap when the caller has already searched it up to at least travelM + clearance.
  const endOf = need => (Number.isFinite(endGap) ? endGap : gapAt(1, need));
  if (endOf(travelM + clearance) >= travelM + clearance) return { share: 1, stoppedBy: 'clear' };
  const budget = Number.isFinite(maxSamples) && maxSamples >= 0 ? maxSamples : Math.min(256, Math.ceil(travelM / (clearance / 2)) + 8);
  const capOf = need => Math.max(clearance * 2, Math.min(cap, need));
  let k = 0, g = gapAt(0, capOf(travelM + clearance));
  const floor = g < clearance ? g - 1e-6 : clearance; // start in contact: never closer than at the start
  const okAt = v => v >= floor;
  const bisect = (lo, hi) => { for (let i = 0; i < steps; i++) { const mid = (lo + hi) / 2; if (okAt(gapAt(mid, capOf(clearance * 2)))) lo = mid; else hi = mid; } return lo; };
  for (let n = 0; k < 1; n++) {
    if (n >= budget) {
      // Every point moves at most (1 - k) travelM from share k to the end, so an end that far plus the clearance from
      // everything keeps the whole rest of the way clear (the same bound as the first end test).
      const need = (1 - k) * travelM + clearance;
      return endOf(need) >= need ? { share: 1, stoppedBy: 'clear' } : { share: k, stoppedBy: 'budget' };
    }
    const room = g < clearance ? clearance / 2 : Math.max(g - clearance, clearance / 2);
    const k2 = Math.min(1, k + room / travelM);
    const g2 = gapAt(k2, capOf((1 - k2) * travelM + clearance));
    if (!okAt(g2)) return { share: bisect(k, k2), stoppedBy: 'contact' };
    k = k2; g = g2;
  }
  return { share: 1, stoppedBy: 'clear' };
}

/** walkMove's share alone (0..1). */
export function walkFraction(gapAt, travelM, options = {}) {
  return walkMove(gapAt, travelM, options).share;
}

/* ------------------------------------------------------------------ the glass brain as a solid (R558, Message 12) */

/**
 * A solid of the glass brain: the brain's meshes are open surface patches (gyri), so "inside" is not a ray parity.
 * Every triangle is sampled into a grid of cubic cells (cellMm, source millimetres; samples at most half a cell apart),
 * then the outside is flooded from the grid's border through the unmarked cells (6-connected). Cells the flood cannot
 * reach and no surface passes through are the SEALED INSIDE. A cell the surface passes through is neither (a point
 * there is within about a cell of the drawn surface: the sphere covers, not this grid, keep things off the surface).
 * meshes: [{ positions (flat xyz), indices (or null: every 3 positions a triangle) }]. Returns { lo, cell, n, state
 * (Uint8Array: 0 sealed inside, 1 surface, 2 outside), inside (count) }. A one-time build (about 0.1 s for the shipped
 * 320,000 triangles at 2 mm). Pure.
 */
export function solidGrid(meshes, { cellMm = 2 } = {}) {
  if (!Array.isArray(meshes) || !meshes.length || !(cellMm > 0)) fail('solidGrid needs meshes and a cell size');
  const cell = cellMm, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const P = m && m.positions;
    if (!P || P.length < 9 || P.length % 3) fail('solidGrid needs flat xyz positions');
    for (let i = 0; i < P.length; i += 3) for (let j = 0; j < 3; j++) { const v = P[i + j]; if (!Number.isFinite(v)) fail('nonfinite position'); if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; }
  }
  for (let j = 0; j < 3; j++) { lo[j] -= 2 * cell; hi[j] += 2 * cell; }
  const n = [0, 1, 2].map(j => Math.ceil((hi[j] - lo[j]) / cell) + 1), nx = n[0], nxy = n[0] * n[1], N = nxy * n[2];
  if (N > 4e6) fail('solidGrid: grid too large');
  const state = new Uint8Array(N);
  const mark = (x, y, z) => { state[Math.floor((x - lo[0]) / cell) + nx * Math.floor((y - lo[1]) / cell) + nxy * Math.floor((z - lo[2]) / cell)] = 1; };
  for (const { positions: P, indices } of meshes) {
    const T = indices ? indices.length : P.length / 3;
    for (let t = 0; t < T; t += 3) {
      const a = 3 * (indices ? indices[t] : t), b = 3 * (indices ? indices[t + 1] : t + 1), c = 3 * (indices ? indices[t + 2] : t + 2);
      const L = Math.max(Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]), Math.hypot(P[b] - P[c], P[b + 1] - P[c + 1], P[b + 2] - P[c + 2]), Math.hypot(P[a] - P[c], P[a + 1] - P[c + 1], P[a + 2] - P[c + 2]));
      const k = Math.max(1, Math.ceil(L / (cell * 0.5)));
      for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
        const u = i / k, v = j / k;
        mark(P[a] + u * (P[b] - P[a]) + v * (P[c] - P[a]), P[a + 1] + u * (P[b + 1] - P[a + 1]) + v * (P[c + 1] - P[a + 1]), P[a + 2] + u * (P[b + 2] - P[a + 2]) + v * (P[c + 2] - P[a + 2]));
      }
    }
  }
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  queue[tail++] = 0; state[0] = 2;
  while (head < tail) {
    const i = queue[head++], x = i % nx, y = Math.floor(i / nx) % n[1], z = Math.floor(i / nxy);
    if (x > 0 && state[i - 1] === 0) { state[i - 1] = 2; queue[tail++] = i - 1; }
    if (x < nx - 1 && state[i + 1] === 0) { state[i + 1] = 2; queue[tail++] = i + 1; }
    if (y > 0 && state[i - nx] === 0) { state[i - nx] = 2; queue[tail++] = i - nx; }
    if (y < n[1] - 1 && state[i + nx] === 0) { state[i + nx] = 2; queue[tail++] = i + nx; }
    if (z > 0 && state[i - nxy] === 0) { state[i - nxy] = 2; queue[tail++] = i - nxy; }
    if (z < n[2] - 1 && state[i + nxy] === 0) { state[i + nxy] = 2; queue[tail++] = i + nxy; }
  }
  // A coarse map (SOLID_COARSE cells a side): 1 where any sealed-inside cell lies, so a sphere over none is skipped whole.
  const C = SOLID_COARSE, cn = [0, 1, 2].map(j => Math.ceil(n[j] / C)), coarse = new Uint8Array(cn[0] * cn[1] * cn[2]);
  let inside = 0;
  for (let i = 0; i < N; i++) {
    if (state[i] !== 0) continue;
    inside++;
    const x = i % nx, y = Math.floor(i / nx) % n[1], z = Math.floor(i / nxy);
    coarse[Math.floor(x / C) + cn[0] * (Math.floor(y / C) + cn[1] * Math.floor(z / C))] = 1;
  }
  return Object.freeze({ lo: Object.freeze(lo), cell, n: Object.freeze(n), state, inside, coarse, cn: Object.freeze(cn) });
}
const SOLID_COARSE = 8;

/**
 * How many sphere centres of `it` (every leaf of every entry, world metres) lie in the SEALED INSIDE of `solid`
 * (solidGrid), seen through worldToGrid (world -> the grid's source coordinates). Stops counting at `stopAt`. Pure.
 */
export function insideSolid(it, solid, worldToGrid, stopAt = 1) {
  if (!it || !it.entries || !solid || !finite16(worldToGrid)) return 0;
  const { lo, cell, n, state, coarse, cn } = solid, nx = n[0], nxy = n[0] * n[1], W = worldToGrid, ws = maxScale(W), C = SOLID_COARSE * cell;
  let count = 0;
  for (const e of it.entries) {
    // Skip a whole entry whose bounding sphere touches no coarse cell holding any sealed-inside cell (exact: no centre
    // of its leaves can then lie inside).
    if (coarse) {
      const cx = W[0] * e.c[0] + W[4] * e.c[1] + W[8] * e.c[2] + W[12] - lo[0], cy = W[1] * e.c[0] + W[5] * e.c[1] + W[9] * e.c[2] + W[13] - lo[1], cz = W[2] * e.c[0] + W[6] * e.c[1] + W[10] * e.c[2] + W[14] - lo[2];
      const r = e.r * ws;
      const x0 = Math.max(0, Math.floor((cx - r) / C)), x1 = Math.min(cn[0] - 1, Math.floor((cx + r) / C));
      const y0 = Math.max(0, Math.floor((cy - r) / C)), y1 = Math.min(cn[1] - 1, Math.floor((cy + r) / C));
      const z0 = Math.max(0, Math.floor((cz - r) / C)), z1 = Math.min(cn[2] - 1, Math.floor((cz + r) / C));
      let any = false;
      for (let z = z0; z <= z1 && !any; z++) for (let y = y0; y <= y1 && !any; y++) for (let x = x0; x <= x1; x++) if (coarse[x + cn[0] * (y + cn[1] * z)]) { any = true; break; }
      if (!any) continue;
    }
    const M = mul(W, e.m), L = e.table.leaves;
    for (let i = 0; i < L.length; i += 4) {
      const x = L[i], y = L[i + 1], z = L[i + 2];
      const gx = Math.floor((M[0] * x + M[4] * y + M[8] * z + M[12] - lo[0]) / cell);
      const gy = Math.floor((M[1] * x + M[5] * y + M[9] * z + M[13] - lo[1]) / cell);
      const gz = Math.floor((M[2] * x + M[6] * y + M[10] * z + M[14] - lo[2]) / cell);
      if (gx < 0 || gy < 0 || gz < 0 || gx >= nx || gy >= n[1] || gz >= n[2]) continue;
      if (state[gx + nx * gy + nxy * gz] === 0 && ++count >= stopAt) return count;
    }
  }
  return count;
}

/**
 * How far (world metres, an upper bound) any covered point of item `then` can have moved to become item `now`: the two
 * items list the same meshes in the same order (collisionItems builds them so; an unchanged entry is the very same
 * object). Per changed entry, with d = m_now m_then^-1: the bounding sphere's centre moves |d c - c| and any point within
 * r of it at most that plus |L_d - I| r (Frobenius norm, an upper bound of the stretch of any affine map), plus any
 * growth of the entry's radius. Infinity when
 * the two cannot be compared. Pure. R558 (performance, conservative advancement): a gap found once (minGap with a large
 * cap) stays a lower bound while the travel since then is subtracted from it.
 */
export function itemTravel(now, then) {
  if (now === then) return 0;
  if (!now || !then) return now === null && then === null ? 0 : Infinity;
  const A = now.entries, B = then.entries;
  if (!A || !B || A.length !== B.length) return Infinity;
  let worst = 0;
  for (let i = 0; i < A.length; i++) {
    const e = A[i], o = B[i];
    if (e === o) continue;
    if (e.table !== o.table || e.pad !== o.pad) return Infinity;
    let same = true;
    for (let k = 0; k < 16; k++) if (e.m[k] !== o.m[k]) { same = false; break; }
    if (same) continue;
    const d = mul(e.m, affineInverse(o.m)), c = o.c, dc = apply(d, c[0], c[1], c[2]);
    let fro = 0;
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) { const v = d[4 * col + row] - (col === row ? 1 : 0); fro += v * v; }
    // (+ any growth of the cover's radius, for a matrix whose scale grew; 0 for the rigid moves of the game)
    const t = Math.hypot(dc[0] - c[0], dc[1] - c[1], dc[2] - c[2]) + Math.sqrt(fro) * o.r + Math.max(0, e.r - o.r);
    if (!(t <= Infinity)) return Infinity;
    if (t > worst) worst = t;
  }
  return worst;
}

/**
 * A lower bound of the gap (world metres) between the sphere (c, r) and item `it`, searched below `cap` (returns cap
 * when nothing comes nearer): the item's box, then each entry's bounding sphere, then that entry's group spheres
 * (which enclose its leaves). R558 (performance): a broad phase that an enclosing item (the glass brain, whose box
 * wraps the viewer) does not defeat. Pure.
 */
/** Clusters of an item's entries (a 0.25 m grid of their centres; each cluster's sphere encloses its members' spheres),
 * built once per item object, so sphereGap skips whole parts of a body at a time. */
function clustersOf(it) {
  if (it.cl) return it.cl;
  const cells = new Map(), size = 0.25;
  for (const e of it.entries) {
    const k = cellKey(e.c[0], e.c[1], e.c[2], size);
    let g = cells.get(k);
    if (!g) { g = []; cells.set(k, g); }
    g.push(e);
  }
  const out = [];
  for (const g of cells.values()) {
    let x = 0, y = 0, z = 0;
    for (const e of g) { x += e.c[0]; y += e.c[1]; z += e.c[2]; }
    x /= g.length; y /= g.length; z /= g.length;
    let rr = 0;
    for (const e of g) rr = Math.max(rr, Math.hypot(e.c[0] - x, e.c[1] - y, e.c[2] - z) + e.r);
    out.push({ c: [x, y, z], r: rr, members: g });
  }
  it.cl = out;
  return out;
}
export function sphereGap(c, r, it, cap = Infinity) {
  if (!it || !it.entries || !it.entries.length) return cap;
  if (boxGap(c, r, it.lo, it.hi) >= cap) return cap;
  let best = cap;
  const groups = it.entries.length > 32 ? clustersOf(it) : [{ c, r: Infinity, members: it.entries }];
  for (const cl of groups) {
    if (cl.r !== Infinity) {
      const qx = c[0] - cl.c[0], qy = c[1] - cl.c[1], qz = c[2] - cl.c[2], ql = best + r + cl.r;
      if (ql > 0 && qx * qx + qy * qy + qz * qz >= ql * ql) continue;
    }
  for (const e of cl.members) {
    const dx = c[0] - e.c[0], dy = c[1] - e.c[1], dz = c[2] - e.c[2], lim = best + r + e.r;
    if (lim > 0 && dx * dx + dy * dy + dz * dz >= lim * lim) continue;
    const G = worldGroups(e);
    for (let j = 0; j < G.length; j += 4) {
      const gx = c[0] - G[j], gy = c[1] - G[j + 1], gz = c[2] - G[j + 2], gl = best + r + G[j + 3];
      if (gl > 0 && gx * gx + gy * gy + gz * gz >= gl * gl) continue;
      const g = Math.sqrt(gx * gx + gy * gy + gz * gz) - r - G[j + 3];
      if (g < best) best = g;
    }
  }
  }
  return best;
}

/** An entry's group spheres in the world (x, y, z, r per group; cached on the entry; they enclose its leaf spheres). */
export function entryGroups(e) {
  if (!e || !e.table) fail('entryGroups needs an entry');
  return worldGroups(e);
}
