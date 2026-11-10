/** NeuroSurge scene: minimal dependency-free vector/matrix math (browser and Node).
 * Vectors are plain [x, y, z] arrays. Matrices are 4x4, column-major Float64Array(16),
 * the same element layout as THREE.Matrix4.elements, so they can be copied into Three.
 */

export const DEG = Math.PI / 180;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = a => Math.hypot(a[0], a[1], a[2]);
export const distance = (a, b) => length(sub(a, b));
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function normalize(a) {
  const l = length(a);
  if (!(l > 1e-12)) throw new Error('normalize: zero-length vector');
  return [a[0] / l, a[1] / l, a[2] / l];
}
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Component of v perpendicular to unit axis n. */
export const reject = (v, n) => sub(v, scale(n, dot(v, n)));

/** Signed angle (radians) from u to v about unit axis n, using their projections onto the plane normal to n. */
export function signedAngleAbout(u, v, n) {
  const pu = reject(u, n), pv = reject(v, n);
  return Math.atan2(dot(n, cross(pu, pv)), dot(pu, pv));
}

/** Right-handed orthonormal frame from a primary direction d and a secondary hint a (a is orthogonalized). */
export function frame(d, aHint) {
  const x = normalize(d);
  const y = normalize(reject(aHint, x));
  const z = cross(x, y);
  return { d: x, a: y, p: z };
}

export function identity() {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** c = a * b (apply b first, then a).
 * R558 performance: the two loops are written out. Every element is the SAME four products added in the SAME order as
 * before (a[row] b[4 col] + a[4 + row] b[4 col + 1] + a[8 + row] b[4 col + 2] + a[12 + row] b[4 col + 3]), so each
 * result is bit-for-bit what the loop gave (checked against the loop on random matrices); only the index arithmetic
 * and repeated array reads are gone. This function is the inner step of every arm pose solve. */
export function multiply(a, b) {
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

export function translation(v) {
  const m = identity();
  m[12] = v[0]; m[13] = v[1]; m[14] = v[2];
  return m;
}

export function uniformScale(s) {
  const m = identity();
  m[0] = m[5] = m[10] = s;
  return m;
}

/** Rotation by angle (radians, right-hand rule) about unit axis through the origin. */
export function rotationAxisAngle(axis, angle) {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  const m = identity();
  m[0] = t * x * x + c;     m[4] = t * x * y - s * z; m[8] = t * x * z + s * y;
  m[1] = t * x * y + s * z; m[5] = t * y * y + c;     m[9] = t * y * z - s * x;
  m[2] = t * x * z - s * y; m[6] = t * y * z + s * x; m[10] = t * z * z + c;
  return m;
}

/** Rotation about an axis through a pivot point: T(p) R T(-p). */
export function rotationAboutPivot(axis, angle, pivot) {
  return multiply(translation(pivot), multiply(rotationAxisAngle(axis, angle), translation(scale(pivot, -1))));
}

/** Rotation matrix whose columns are the given orthonormal basis vectors. */
export function basis(x, y, z) {
  const m = identity();
  m[0] = x[0]; m[1] = x[1]; m[2] = x[2];
  m[4] = y[0]; m[5] = y[1]; m[6] = y[2];
  m[8] = z[0]; m[9] = z[1]; m[10] = z[2];
  return m;
}

/** Transpose of the 3x3 rotation part (inverse for orthonormal rotations); translation dropped. */
export function rotationTranspose(m) {
  const r = identity();
  r[0] = m[0]; r[4] = m[1]; r[8] = m[2];
  r[1] = m[4]; r[5] = m[5]; r[9] = m[6];
  r[2] = m[8]; r[6] = m[9]; r[10] = m[10];
  return r;
}

export const transformPoint = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
];
export const transformDirection = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
];

/** Determinant of the 3x3 part. */
export function det3(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

/** Camera-space point (Three convention: +x right, +y up, camera looks along -z) to NDC.
 * Returns {x, y, depth} where depth = -z (distance in front of the camera). */
export function projectToNdc(p, tanHalfFovY, aspect) {
  const depth = -p[2];
  return { x: p[0] / (depth * tanHalfFovY * aspect), y: p[1] / (depth * tanHalfFovY), depth };
}

/** Camera-space point on the view ray through NDC (x, y) at the given depth (distance along -z). */
export function pointOnNdcRay(x, y, depth, tanHalfFovY, aspect) {
  return [x * depth * tanHalfFovY * aspect, y * depth * tanHalfFovY, -depth];
}

/** Moller-Trumbore ray/triangle intersection; returns distance t >= 0 or null. */
export function rayTriangle(origin, dir, a, b, c) {
  const e1 = sub(b, a), e2 = sub(c, a);
  const h = cross(dir, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return null;
  const f = 1 / det;
  const s = sub(origin, a);
  const u = f * dot(s, h);
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1);
  const v = f * dot(dir, q);
  if (v < 0 || u + v > 1) return null;
  const t = f * dot(e2, q);
  return t >= 0 ? t : null;
}

/** Solve the n x n linear system A x = b (A given as an array of row arrays) by Gaussian elimination with partial
 * pivoting. Returns the solution array, or null when A is (numerically) singular. Inputs are not modified. */
export function solveLinear(A, b) {
  const n = b.length;
  const a = A.map((row, i) => [...row.slice(0, n), b[i]]);
  let scaleMax = 0;
  for (const row of a) for (let j = 0; j < n; j++) scaleMax = Math.max(scaleMax, Math.abs(row[j]));
  if (!(scaleMax > 0) || !Number.isFinite(scaleMax)) return null;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (!(Math.abs(a[piv][c]) > 1e-12 * scaleMax)) return null;
    if (piv !== c) { const t = a[c]; a[c] = a[piv]; a[piv] = t; }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = a.map((row, i) => row[n] / row[i]);
  return x.every(Number.isFinite) ? x : null;
}

/**
 * Least-squares sphere through points (algebraic fit |p|^2 = 2 c.p + k, solved in coordinates centred on the point
 * centroid for conditioning). `points` is a flat array-like of x, y, z triplets.
 * Returns { centre: [x, y, z], radius, rms (geometric residual), count } or null when fewer than 4 points are given or
 * the points are degenerate (coplanar/collinear). A geometric construction for display joint centres; not a measured
 * joint centre.
 */
export function fitSphere(points) {
  if (!points || typeof points.length !== 'number' || points.length % 3 !== 0) return null;
  const n = points.length / 3;
  if (n < 4) return null;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < points.length; i += 3) { mx += points[i]; my += points[i + 1]; mz += points[i + 2]; }
  mx /= n; my /= n; mz /= n;
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], v = [0, 0, 0, 0];
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i] - mx, y = points[i + 1] - my, z = points[i + 2] - mz;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    const r = [2 * x, 2 * y, 2 * z, 1], s = x * x + y * y + z * z;
    for (let p = 0; p < 4; p++) { v[p] += r[p] * s; for (let q = 0; q < 4; q++) M[p][q] += r[p] * r[q]; }
  }
  const sol = solveLinear(M, v);
  if (!sol) return null;
  const c = [sol[0], sol[1], sol[2]];
  const r2 = sol[3] + c[0] * c[0] + c[1] * c[1] + c[2] * c[2];
  if (!(r2 > 0)) return null;
  const radius = Math.sqrt(r2);
  let res = 0;
  for (let i = 0; i < points.length; i += 3) {
    const e = Math.hypot(points[i] - mx - c[0], points[i + 1] - my - c[1], points[i + 2] - mz - c[2]) - radius;
    res += e * e;
  }
  return { centre: [c[0] + mx, c[1] + my, c[2] + mz], radius, rms: Math.sqrt(res / n), count: n };
}

/** n roughly uniform unit directions on the sphere (Fibonacci lattice), as a flat Float64Array of xyz triplets. */
export function fibonacciDirections(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error('ns:math_input: fibonacciDirections needs a positive integer count');
  const out = new Float64Array(3 * n);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), t = ga * i;
    out[3 * i] = r * Math.cos(t); out[3 * i + 1] = y; out[3 * i + 2] = r * Math.sin(t);
  }
  return out;
}

/** Support-function pruning: for every direction (flat xyz `dirs`), keep the point of `points` (flat xyz) with the largest
 * projection; returns the unique kept points (flat Float64Array, in input order). With directions no more than delta
 * radians apart, every dropped point lies within R (1 - cos delta) of the kept set's hull along any direction (R = the
 * set radius), so the kept set bounds the projected extents of the whole set to that tolerance. */
export function pruneExtremes(points, dirs) {
  const n = points.length / 3, k = dirs.length / 3;
  if (n <= k) return Float64Array.from(points);
  const best = new Int32Array(k).fill(-1), bestV = new Float64Array(k).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    const x = points[3 * i], y = points[3 * i + 1], z = points[3 * i + 2];
    for (let j = 0; j < k; j++) {
      const v = x * dirs[3 * j] + y * dirs[3 * j + 1] + z * dirs[3 * j + 2];
      if (v > bestV[j]) { bestV[j] = v; best[j] = i; }
    }
  }
  const keep = [...new Set(best)].filter(i => i >= 0).sort((a, b) => a - b);
  const out = new Float64Array(keep.length * 3);
  keep.forEach((i, m) => { out[3 * m] = points[3 * i]; out[3 * m + 1] = points[3 * i + 1]; out[3 * m + 2] = points[3 * i + 2]; });
  return out;
}

/* ------------------------------------------------------------------ U3a: frames, camera look and easing */

/** Smoothstep on [0, 1] (clamped): 3t^2 - 2t^3. */
export const smoothstep = t => { const u = t <= 0 ? 0 : t >= 1 ? 1 : t; return u * u * (3 - 2 * u); };

/** Rotation about +y (radians, right-hand rule) as a column-major 4x4. */
export function rotationY(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = identity();
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

/**
 * First-person camera orientation (camera -> world rotation, 4x4 without translation): Euler 'YXZ' with yaw about +y
 * (left-positive) applied after pitch about the camera x axis (up-positive), i.e. R = Ry(yaw) Rx(pitch). This is THREE's
 * camera.rotation.set(pitch, yaw, 0, 'YXZ'), and R (0, 0, -1) = (-sin yaw cos pitch, sin pitch, -cos yaw cos pitch) is the
 * ns-controls / ns-brain gaze direction.
 */
export function lookRotation(yaw, pitch) {
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new Error('ns:math_input: lookRotation needs finite yaw and pitch');
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const m = identity();
  m[0] = cy; m[1] = 0; m[2] = -sy;
  m[4] = sy * sp; m[5] = cp; m[6] = cy * sp;
  m[8] = sy * cp; m[9] = -sp; m[10] = cy * cp;
  return m;
}

/**
 * BP_TO_WORLD (via bpToWorldAxes()): axis change from the BodyParts3D source frame (+x subject LEFT, +y POSTERIOR, +z SUPERIOR) to the Three world frame
 * of a person standing at yaw 0 (+x the person's right, +y up, the person faces -z): world = (-x, z, y). A proper
 * rotation (det +1). Column-major 4x4, no translation or scale (frozen plain array; bpToWorldAxes() gives a typed copy).
 */
const BP_TO_WORLD_ELEMENTS = Object.freeze([-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
/** A fresh copy of the BodyParts3D -> world axis change (see bodyToWorldMatrix). */
export const bpToWorldAxes = () => Float64Array.from(BP_TO_WORLD_ELEMENTS);

/**
 * BodyParts3D millimetres -> Three world metres with the eye at the world origin, for a body turned by bodyYaw
 * (radians about +y, left-positive like the camera yaw): Ry(bodyYaw) * bpToWorldAxes() * 0.001 * T(-eyeBp).
 * Every body-frame mesh (bones, muscles, the posed full body) uses this one matrix, so the left arm, the body and the
 * camera share a single eye-centred frame.
 */
export function bodyToWorldMatrix(eyeBp, bodyYaw = 0) {
  if (!eyeBp || eyeBp.length !== 3 || ![0, 1, 2].every(i => Number.isFinite(eyeBp[i]))) throw new Error('ns:math_input: eyeBp must be a finite [x, y, z]');
  if (!Number.isFinite(bodyYaw)) throw new Error('ns:math_input: bodyYaw must be finite');
  return multiply(rotationY(bodyYaw), multiply(BP_TO_WORLD_ELEMENTS, multiply(uniformScale(0.001), translation([-eyeBp[0], -eyeBp[1], -eyeBp[2]]))));
}

/** Inverse of a rigid (rotation + translation) column-major 4x4 (no scale). */
export function rigidInverse(m) {
  const o = new Float64Array(16);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c];
  for (let r = 0; r < 3; r++) o[12 + r] = -(o[r] * m[12] + o[4 + r] * m[13] + o[8 + r] * m[14]);
  o[15] = 1;
  return o;
}

/** Shortest distance (same units) from point p to the segment [a, b]. */
export function pointSegmentDistance(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a);
  const L2 = dot(ab, ab);
  const t = L2 > 1e-24 ? clamp(dot(ap, ab) / L2, 0, 1) : 0;
  return length(sub(ap, scale(ab, t)));
}
