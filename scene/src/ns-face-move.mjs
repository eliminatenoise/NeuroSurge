/** Face movements you can see (20 November 2026).
 *
 * The owner (Message 204): "make sure there's clear movement for each brain activation area. And you can clearly
 * identify what type of movement it is for each area." Before this module the face areas' movements (brow, eyelids,
 * nose, mouth corner, lips) only changed the colour of the face muscles: no part of the face moved.
 *
 * WHAT THIS IS. The face is drawn from the face packet's muscle meshes (no skin). Each face movement now moves the
 * vertices of those muscles the way that movement pulls them, exaggerated so it reads on the mirror body held near
 * (Message 154: "as exaggerated and obvious as possible within reason"):
 *   browUp        the forehead muscle (frontalis) shortens toward its fixed top edge: the brows and the upper ring of
 *                 the eye muscle go up, the forehead bunches into ridges;
 *   frown         the frown muscles (corrugator, procerus) pull the inner brows down and toward each other, and bunch;
 *   eyesShut      the eyelid part of the ring muscle round the eye slides down over the eyeball (the lower lid a little
 *                 up) until the eye is shut; the outer ring squeezes in;
 *   eyesWide      the upper lid slides up off the eyeball, the lower lid down;
 *   noseWrinkle   the nose muscles bunch up the side of the nose, the nostril wing and the upper lip next to it rise;
 *   nostrilFlare  the nostril wings pull outward, the septum's muscle pulls the nose tip down;
 *   smileR/L      a mouth corner goes up, out and back toward the cheekbone (zygomaticus major), the cheek rises;
 *   cornerDownR/L a mouth corner is pulled down toward the jaw (depressor anguli oris);
 *   purse         the ring muscle of the mouth draws the lips together and pushes them forward;
 *   stretch       the corners are pulled straight out and back, the lips thin (risorius, buccinator);
 *   upperLipUp    the upper lip is lifted (levator labii superioris);
 *   pout          the chin muscle (mentalis) pushes the chin and the lower lip up and out;
 *   lowerLipDown  the lower lip is pulled down (depressor labii inferioris).
 * A contracting muscle also thickens: its belly stands out along its own normals (the sheets are thin closed meshes,
 * so the front moves out and the back in). The parts a muscle pulls (lips, brows, eyelids) move with it, fading with
 * distance, so neighbouring meshes stay together.
 *
 * HOW. Everything is worked out once, when the body is installed (buildFaceMoves): a head frame from the meshes
 * themselves (across the eyes, chin to forehead), landmarks (mouth corners, the lips' line, the eye openings, the
 * brows, each muscle's ends), and for every shape a sparse list of the vertices it moves with their displacement at
 * full strength and the change of their normal. Drawing a face then only adds the active shapes' lists to the resting
 * positions (applyFaceMoves): linear in each shape's strength, so the face follows each activation's contraction and
 * return exactly as the face's display joints do (ns-body FACE_DISPLAY_IDS, driven by the activity like every other
 * joint). With every strength at 0 the face is exactly its resting geometry.
 *
 * The one-sided mouth movements: the lower-face area of each half of the brain lifts (or pulls down) mainly the mouth
 * corner on the other side (ns-bodymap, "Smile (mostly the right side)"); the joint itself is one number, so the caller
 * says which corner leads (faceShapeWeights sides).
 *
 * A display choice on licensed anatomy, not measured soft-tissue mechanics: the amounts are exaggerated on purpose.
 * Pure: no Three.js, no DOM.
 */

/** Everything about the face movements.
 *  on: false moves nothing (the face only changes colour, as before).
 *  fullDeg: the face display joints' full amplitude (ns-body FACE_FULL_DEG): a shape is whole at |joint| = fullDeg.
 *  otherCorner: the leading side's partner gets this share of a one-sided smile or pull-down.
 *  minMm: displacements under this (and normal changes under minN) are left out of the lists.
 *  21 November 2026 (SEEMOVE: "shapes strong enough to read on a 40 px face", the mirror body's at the start distance):
 *  the in-picture amounts about a quarter larger (brows up 13 -> 16 mm, a smile's corner 13 up / 8 out -> 15 / 10, a
 *  corner down 13 -> 16, the lips stretched 9.5 -> 12, an upper lip 9 -> 11.5, a lower lip 9 -> 11.5, frown, wide eyes,
 *  nose and nostrils likewise; closing the eyes is whole already): at the far end of what a face does, on purpose.
 *  The rest: each shape's amounts in millimetres at full strength (head frame: out = toward the subject's side, up,
 *  fwd = forward out of the face). browUp.ridgeFwd: the brows come this much forward per millimetre up, over the brow
 *  ridge (the frontal bone stands about 4 mm further forward 10 mm above the brows, measured on this skull). */
export const FACE_MOVE = Object.freeze({
  on: true,
  // 21 November 2026 (SEEMOVE): 20 -> 15. The map's face movements end at 15 degrees of their display joints (closing the
  // eyes at 20), so every shape stopped at three quarters of its strength (the browser showed 0.75 at the peak). Each
  // shape is whole at its movement's end now.
  fullDeg: 15,
  otherCorner: 0.3,
  minMm: 0.02, minN: 0.002,
  browUp: Object.freeze({ upMm: 16, ridgeFwd: 0.35, ringShare: 0.9, procerusShare: 0.75, lidShare: 0.22, temporalShare: 0.4, ridgeMm: 0.9, ridges: 3 }),
  frown: Object.freeze({ inMm: 10, downMm: 12.5, bulgeMm: 2.2, lidMm: 1.8 }),
  eyesShut: Object.freeze({ closeAt: 0.3, squeeze: 0.1, browDownMm: 1.5, cheekUpMm: 1.2, bulgeMm: 0.9 }),
  eyesWide: Object.freeze({ lidUpMm: 7, lowerDownMm: 3, browUpMm: 4.5 }),
  noseWrinkle: Object.freeze({ upMm: 10, inMm: 2, bulgeMm: 2.4, ridges: 2, wingUpMm: 11, lipUpMm: 4.5, procerusDownMm: 2.5, cheekUpMm: 2 }),
  nostrilFlare: Object.freeze({ outMm: 10.5, fwdMm: 1.5, septumDownMm: 4, bulgeMm: 1.4 }),
  smile: Object.freeze({ outMm: 10, upMm: 15, backMm: 4, radiusMm: 32, coreMm: 4, bulgeMm: 2.2, cheekUpMm: 2.2, cheekRadiusMm: 17 }),
  cornerDown: Object.freeze({ outMm: 2, downMm: 16, fwdMm: 0.5, radiusMm: 28, coreMm: 4, bulgeMm: 2 }),
  purse: Object.freeze({ inShare: 0.36, gather: 0.14, fwdMm: 10, baseFwdMm: 1.5, bulgeMm: 1.2, fadeMm: 18 }),
  stretch: Object.freeze({ outMm: 12, backMm: 3, thin: 0.2, bulgeMm: 1.6, fadeMm: 18 }),
  upperLipUp: Object.freeze({ upMm: 11.5, fwdMm: 1.5, cornerShare: 0.25, topShare: 0.5, bulgeMm: 1.6, wingUpMm: 1.5, fadeMm: 15 }),
  pout: Object.freeze({ upMm: 9, fwdMm: 10, chinUpMm: 8, chinFwdMm: 4, bulgeMm: 2.6, fadeMm: 15 }),
  lowerLipDown: Object.freeze({ downMm: 11.5, fwdMm: 1.5, bulgeMm: 1.5, fadeMm: 15 })
});

/** The shapes, the display joint each follows and on which side of 0 (ns-body FACE_DISPLAY_IDS; upper_lip has no
 * negative side). `side`: the mouth corner a one-sided shape belongs to. */
export const FACE_SHAPES = Object.freeze([
  Object.freeze({ key: 'browUp', joint: 'brow_raise', sign: 1 }),
  Object.freeze({ key: 'frown', joint: 'brow_raise', sign: -1 }),
  Object.freeze({ key: 'eyesShut', joint: 'eye_close', sign: 1 }),
  Object.freeze({ key: 'eyesWide', joint: 'eye_close', sign: -1 }),
  Object.freeze({ key: 'noseWrinkle', joint: 'nose_wrinkle', sign: 1 }),
  Object.freeze({ key: 'nostrilFlare', joint: 'nose_wrinkle', sign: -1 }),
  Object.freeze({ key: 'smileR', joint: 'smile', sign: 1, side: 'r' }),
  Object.freeze({ key: 'smileL', joint: 'smile', sign: 1, side: 'l' }),
  Object.freeze({ key: 'cornerDownR', joint: 'smile', sign: -1, side: 'r' }),
  Object.freeze({ key: 'cornerDownL', joint: 'smile', sign: -1, side: 'l' }),
  Object.freeze({ key: 'purse', joint: 'lip_purse', sign: 1 }),
  Object.freeze({ key: 'stretch', joint: 'lip_purse', sign: -1 }),
  Object.freeze({ key: 'upperLipUp', joint: 'upper_lip', sign: 1 }),
  Object.freeze({ key: 'pout', joint: 'lower_lip', sign: 1 }),
  Object.freeze({ key: 'lowerLipDown', joint: 'lower_lip', sign: -1 })
]);
export const FACE_SHAPE_KEYS = Object.freeze(FACE_SHAPES.map(s => s.key));
/** The face display joints the shapes follow. */
export const FACE_MOVE_JOINTS = Object.freeze([...new Set(FACE_SHAPES.map(s => s.joint))]);

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
/** Smoothstep from e0 to e1 (e1 < e0 gives the falling step). */
const sm = (e0, e1, x) => { if (e1 === e0) return x >= e0 ? 1 : 0; const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const finite = x => typeof x === 'number' && Number.isFinite(x);

/**
 * The shapes' strengths (0..1 each) from the face display joints (degrees, any object holding them: the activity's
 * bodyJointTargets, a pose's applied angles) and, for the mouth corners, which side leads: sides = { r, l }, each
 * 0..1 (default both 1: a symmetric smile). Missing or non-finite joints count as 0. Pure.
 */
export function faceShapeWeights(joints = {}, sides = null, o = FACE_MOVE) {
  const out = {};
  const sr = sides && finite(sides.r) ? clamp(sides.r, 0, 1) : 1, sl = sides && finite(sides.l) ? clamp(sides.l, 0, 1) : 1;
  for (const s of FACE_SHAPES) {
    const j = joints && finite(joints[s.joint]) ? joints[s.joint] : 0;
    let w = o.on ? clamp((s.sign * j) / o.fullDeg, 0, 1) + 0 : 0; // (+ 0: never -0)
    if (s.side === 'r') w *= sr; else if (s.side === 'l') w *= sl;
    out[s.key] = w;
  }
  return out;
}

/** Which mouth corner leads a one-sided movement of the lower-face area of a hemisphere ('rh' | 'lh'): the other side's
 * corner (ns-bodymap: the right hemisphere's area moves mainly the left corner). Returns { r, l }. */
export function faceSidesFor(hemisphere, o = FACE_MOVE) {
  if (hemisphere === 'rh') return { r: o.otherCorner, l: 1 };
  if (hemisphere === 'lh') return { r: 1, l: o.otherCorner };
  return { r: 1, l: 1 };
}

// ---------------------------------------------------------------- building

/** The face packet's muscle name of an element id ('zf-zygomaticus-major-r' -> { name: 'zygomaticus-major', side: 'r' }). */
export function faceMuscleOf(id) {
  const m = /^zf-(.+?)(?:-([rl]))?$/.exec(String(id || ''));
  return m ? { name: m[1], side: m[2] || null } : null;
}

/** The face packet's muscles that any shape moves (the chewing muscles, the scalp's back and the neck sheet do not). */
export const FACE_MOVING_MUSCLES = Object.freeze(['frontalis', 'temporoparietalis', 'corrugator-supercilii', 'procerus', 'orbicularis-oculi-orbital',
  'orbicularis-oculi-palpebral', 'nasalis', 'depressor-septi-nasi', 'levator-labii-superioris-alaeque-nasi', 'levator-labii-superioris',
  'zygomaticus-minor', 'zygomaticus-major', 'levator-anguli-oris', 'risorius', 'buccinator', 'orbicularis-oris', 'depressor-anguli-oris',
  'depressor-labii-inferioris', 'mentalis']);
const MOVING = new Set(FACE_MOVING_MUSCLES);
const positionsOf = m => (m && m.positions !== undefined ? m.positions : m);
const indicesOf = m => (m && m.indices !== undefined ? m.indices : null);

/** Area-weighted vertex normals of a triangle list (positions flat xyz). */
function vertexNormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
  }
  for (let i = 0; i < N.length; i += 3) { const l = len3(N[i], N[i + 1], N[i + 2]); if (l > 1e-12) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } }
  return N;
}

/** Vertex normals averaged over the triangle fan `rounds` times (the fibre-striped meshes' own normals swing from
 * vertex to vertex; a bulge along them would bristle). */
function smoothNormals(N0, I, rounds) {
  let N = N0;
  for (let r = 0; r < rounds; r++) {
    const A = Float32Array.from(N);
    for (let t = 0; t + 2 < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      for (let k = 0; k < 3; k++) { A[a + k] += N[b + k] + N[c + k]; A[b + k] += N[a + k] + N[c + k]; A[c + k] += N[a + k] + N[b + k]; }
    }
    for (let i = 0; i < A.length; i += 3) { const l = len3(A[i], A[i + 1], A[i + 2]); if (l > 1e-12) { A[i] /= l; A[i + 1] /= l; A[i + 2] /= l; } else { A[i] = N0[i]; A[i + 1] = N0[i + 1]; A[i + 2] = N0[i + 2]; } }
    N = A;
  }
  return N;
}

/** Per-bin profile of a vertex set: for each bin of `binMm` along a over [lo, hi], the minimum of b over b > cut (top)
 * and the maximum of b over b < cut (bottom); empty bins take their neighbours'; smoothed over three bins. */
function gapProfile(A, B, lo, hi, binMm, cut = 0) {
  const n = Math.max(1, Math.round((hi - lo) / binMm) + 1), top = new Float64Array(n).fill(NaN), bot = new Float64Array(n).fill(NaN);
  for (let i = 0; i < A.length; i++) {
    const k = Math.round((A[i] - lo) / binMm);
    if (k < 0 || k >= n) continue;
    const b = B[i] - cut;
    if (b > 0) { if (!(top[k] <= b)) top[k] = b; } else if (!(bot[k] >= b)) bot[k] = b;
  }
  const fill = arr => { for (let k = 0; k < n; k++) if (!finite(arr[k])) arr[k] = 0; };
  fill(top); fill(bot);
  const smooth3 = arr => Float64Array.from(arr, (v, k) => (arr[Math.max(0, k - 1)] + v + arr[Math.min(n - 1, k + 1)]) / 3);
  return { lo, binMm, n, top: smooth3(top), bot: smooth3(bot) };
}
/** Per-bin lowest b of a vertex set along a (bins of binMm over [lo, hi]; empty bins take the nearest filled one). */
function lowestProfile(A, B, lo, hi, binMm) {
  const n = Math.max(1, Math.round((hi - lo) / binMm) + 1), low = new Float64Array(n).fill(NaN);
  for (let i = 0; i < A.length; i++) { const k = Math.round((A[i] - lo) / binMm); if (k >= 0 && k < n && !(low[k] <= B[i])) low[k] = B[i]; }
  for (let k = 0; k < n; k++) if (!finite(low[k])) { let d = 1; while (d < n) { if (k - d >= 0 && finite(low[k - d])) { low[k] = low[k - d]; break; } if (k + d < n && finite(low[k + d])) { low[k] = low[k + d]; break; } d++; } if (!finite(low[k])) low[k] = 0; }
  const top = Float64Array.from(low, (v, k) => (low[Math.max(0, k - 1)] + v + low[Math.min(n - 1, k + 1)]) / 3);
  return { lo, binMm, n, top, bot: top };
}
const profileAt = (pr, which, a) => {
  const x = (a - pr.lo) / pr.binMm;
  if (!(x > 0)) return pr[which][0] || 0;
  if (x >= pr.n - 1) return pr[which][pr.n - 1] || 0;
  const k = Math.floor(x), f = x - k;
  return pr[which][k] * (1 - f) + pr[which][k + 1] * f;
};

/** The longest axis of a vertex set (head coordinates): { c: centroid [u, v, w], a: unit axis, lo, hi } (projections). */
function principalAxis(U, V, W) {
  const n = U.length;
  let cu = 0, cv = 0, cw = 0;
  for (let i = 0; i < n; i++) { cu += U[i]; cv += V[i]; cw += W[i]; }
  cu /= n; cv /= n; cw /= n;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i++) { const x = U[i] - cu, y = V[i] - cv, z = W[i] - cw; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  let a = [1, 1, 1];
  for (let it = 0; it < 40; it++) {
    const b = [xx * a[0] + xy * a[1] + xz * a[2], xy * a[0] + yy * a[1] + yz * a[2], xz * a[0] + yz * a[1] + zz * a[2]];
    const l = len3(b[0], b[1], b[2]);
    if (!(l > 1e-12)) break;
    a = [b[0] / l, b[1] / l, b[2] / l];
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const p = (U[i] - cu) * a[0] + (V[i] - cv) * a[1] + (W[i] - cw) * a[2]; if (p < lo) lo = p; if (p > hi) hi = p; }
  return { c: [cu, cv, cw], a, lo, hi };
}
/** 0 at the axis end nearest `from`, 1 at the other end. */
const alongFrom = (ax, from, u, v, w) => {
  const p = (u - ax.c[0]) * ax.a[0] + (v - ax.c[1]) * ax.a[1] + (w - ax.c[2]) * ax.a[2];
  const pf = (from[0] - ax.c[0]) * ax.a[0] + (from[1] - ax.c[1]) * ax.a[1] + (from[2] - ax.c[2]) * ax.a[2];
  const t = clamp((p - ax.lo) / Math.max(1e-6, ax.hi - ax.lo), 0, 1);
  return Math.abs(pf - ax.lo) <= Math.abs(pf - ax.hi) ? t : 1 - t;
};

/**
 * Work out every shape for the face muscles of one body (once, at install). meshes: Map or object id -> { positions,
 * indices } (or a position array; without indices nothing thickens and normals do not change), all in ONE frame (the
 * frame the caller draws them in); only face packet ids (zf-...) are used. options.eyes: { r: [x, y, z], l: [...] },
 * the eyeballs' centres in that frame (else estimated behind the eyelids).
 * Returns { ok, note, frame: { origin, x, up, fwd }, marks, meshes: Map(id -> { count, keys: [shape keys], shapes:
 * Map(key -> { idx: Uint32Array, d: Float32Array, dn: Float32Array | null }) }), maxMm: { key: mm } }.
 */
export function buildFaceMoves(meshes, options = {}, o = FACE_MOVE) {
  const out = { ok: false, note: null, frame: null, marks: null, meshes: new Map(), maxMm: {} };
  const list = meshes instanceof Map ? [...meshes] : meshes && typeof meshes === 'object' ? Object.entries(meshes) : [];
  const all = new Map();
  for (const [id, m] of list) {
    const fm = faceMuscleOf(id), P = positionsOf(m);
    if (!fm || !MOVING.has(fm.name) || !P || typeof P.length !== 'number' || P.length < 9 || P.length % 3) continue;
    let ok = true;
    for (let i = 0; i < P.length; i++) if (!finite(P[i])) { ok = false; break; }
    if (!ok) continue;
    all.set(id, { id, name: fm.name, side: fm.side, P, I: indicesOf(m), n: P.length / 3 });
  }
  const get = (name, side = null) => all.get(`zf-${name}${side ? `-${side}` : ''}`) || null;
  const centroid = (...ms) => { const c = [0, 0, 0]; let n = 0; for (const m of ms) if (m) { for (let i = 0; i < m.P.length; i += 3) { c[0] += m.P[i]; c[1] += m.P[i + 1]; c[2] += m.P[i + 2]; } n += m.n; } return n ? c.map(v => v / n) : null; };
  const eyeR = centroid(get('orbicularis-oculi-palpebral', 'r')), eyeL = centroid(get('orbicularis-oculi-palpebral', 'l'));
  const mouth = centroid(get('orbicularis-oris', 'r'), get('orbicularis-oris', 'l'));
  const chin = centroid(get('mentalis', 'r'), get('mentalis', 'l')) || mouth;
  const brow = centroid(get('frontalis', 'r'), get('frontalis', 'l'));
  if (!o.on || !eyeR || !eyeL || !mouth || !brow) { out.note = 'the face packet\'s eyelid, mouth or forehead muscles are missing'; return out; }
  // the head frame: x across the eyes (toward the subject's LEFT), up from the chin to the forehead, fwd out of the face
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = a => { const l = len3(a[0], a[1], a[2]); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
  const X = unit(sub(eyeL, eyeR));
  let up = sub(brow, chin);
  up = X ? unit(sub(up, X.map(v => v * dot(up, X)))) : null;
  if (!X || !up) { out.note = 'no head frame'; return out; }
  const F = [X[1] * up[2] - X[2] * up[1], X[2] * up[0] - X[0] * up[2], X[0] * up[1] - X[1] * up[0]];
  const O = mouth;
  out.frame = { origin: O.slice(), x: X, up, fwd: F };
  const toHead = p => { const d = sub(p, O); return [dot(d, X), dot(d, up), dot(d, F)]; };
  for (const m of all.values()) {
    m.U = new Float32Array(m.n); m.V = new Float32Array(m.n); m.W = new Float32Array(m.n);
    for (let i = 0, k = 0; i < m.n; i++, k += 3) { const dx = m.P[k] - O[0], dy = m.P[k + 1] - O[1], dz = m.P[k + 2] - O[2]; m.U[i] = dx * X[0] + dy * X[1] + dz * X[2]; m.V[i] = dx * up[0] + dy * up[1] + dz * up[2]; m.W[i] = dx * F[0] + dy * F[1] + dz * F[2]; }
    if (m.I && m.I.length >= 3) {
      m.N = vertexNormals(m.P, m.I);
      const N = smoothNormals(m.N, m.I, 5);
      m.NU = new Float32Array(m.n); m.NV = new Float32Array(m.n); m.NW = new Float32Array(m.n);
      for (let i = 0, k = 0; i < m.n; i++, k += 3) { m.NU[i] = N[k] * X[0] + N[k + 1] * X[1] + N[k + 2] * X[2]; m.NV[i] = N[k] * up[0] + N[k + 1] * up[1] + N[k + 2] * up[2]; m.NW[i] = N[k] * F[0] + N[k + 1] * F[1] + N[k + 2] * F[2]; }
    } else m.N = null;
    m.ax = principalAxis(m.U, m.V, m.W);
  }
  // ---- landmarks (head coordinates)
  const range = (m, A) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < m.n; i++) { if (m[A][i] < lo) lo = m[A][i]; if (m[A][i] > hi) hi = m[A][i]; } return [lo, hi]; };
  const mk = { eye: {}, ball: {}, fissure: {}, corner: {}, zygo: {}, cheek: {}, brow: {} };
  for (const s of ['r', 'l']) {
    const pal = get('orbicularis-oculi-palpebral', s), e = toHead(s === 'r' ? eyeR : eyeL);
    mk.eye[s] = e;
    const given = options && options.eyes && Array.isArray(options.eyes[s]) && options.eyes[s].length === 3 && options.eyes[s].every(finite) ? toHead(options.eyes[s]) : null;
    mk.ball[s] = given || [e[0], e[1] - 3, e[2] - 10];
    const du = Float64Array.from(pal.U, u => u - e[0]), dv = Float64Array.from(pal.V, v => v - e[1]);
    mk.fissure[s] = gapProfile(du, dv, -18, 18, 1);
  }
  const ooR = get('orbicularis-oris', 'r'), ooL = get('orbicularis-oris', 'l');
  const OO = [ooR, ooL].filter(Boolean);
  for (const s of ['r', 'l']) {
    // the corner: the mean of the lip ring's vertices within 1.5 mm of its outermost point on that side
    let ext = s === 'r' ? Infinity : -Infinity;
    for (const m of OO) for (let i = 0; i < m.n; i++) ext = s === 'r' ? Math.min(ext, m.U[i]) : Math.max(ext, m.U[i]);
    const c = [0, 0, 0]; let n = 0;
    for (const m of OO) for (let i = 0; i < m.n; i++) if (Math.abs(m.U[i] - ext) <= 1.5) { c[0] += m.U[i]; c[1] += m.V[i]; c[2] += m.W[i]; n++; }
    mk.corner[s] = n ? c.map(v => v / n) : [s === 'r' ? -30 : 30, 0, 0];
    // zygomaticus major's fixed end: its vertex farthest from the corner
    const z = get('zygomaticus-major', s);
    let far = null, best = -1;
    if (z) for (let i = 0; i < z.n; i++) { const d = len3(z.U[i] - mk.corner[s][0], z.V[i] - mk.corner[s][1], z.W[i] - mk.corner[s][2]); if (d > best) { best = d; far = [z.U[i], z.V[i], z.W[i]]; } }
    mk.zygo[s] = far || [mk.corner[s][0] + (s === 'r' ? -15 : 15), mk.corner[s][1] + 45, mk.corner[s][2] - 15];
    // the cheek over the cheekbone, under the eye
    const e = mk.eye[s];
    mk.cheek[s] = [e[0] + (s === 'r' ? -6 : 6), e[1] - 17, e[2] - 1];
  }
  const uK = Math.max(10, (mk.corner.l[0] - mk.corner.r[0]) / 2), vK = (mk.corner.l[1] + mk.corner.r[1]) / 2;
  // the lips' line: per 1.5 mm across the mouth, the lowest point of the upper lip and the highest of the lower lip
  const lipU = [], lipV = [];
  for (const m of OO) for (let i = 0; i < m.n; i++) { lipU.push(m.U[i]); lipV.push(m.V[i]); }
  const lips = gapProfile(lipU, lipV, -uK - 3, uK + 3, 1.5, vK);
  let vTopOO = -Infinity, vBotOO = Infinity;
  for (const m of OO) { const [lo, hi] = range(m, 'V'); vTopOO = Math.max(vTopOO, hi); vBotOO = Math.min(vBotOO, lo); }
  const lipMid = u => vK + (profileAt(lips, 'top', u) + profileAt(lips, 'bot', u)) / 2;
  const upMargin = vK + profileAt(lips, 'top', 0), loMargin = vK + profileAt(lips, 'bot', 0);
  // (how open the mouth is across it, averaged over 12 mm so that it changes gently toward the corners)
  const openAt = u => sm(0.3, 4, profileAt(lips, 'top', u) - profileAt(lips, 'bot', u));
  const opening = u => { let a = 0; for (let t = -6; t <= 6; t += 1.5) a += openAt(u + t); return a / 9; };
  // the brows: the forehead muscle's lower edge across the face (2.5 mm bins) and its top
  const fR = get('frontalis', 'r'), fL = get('frontalis', 'l');
  const fU = [], fV = [];
  for (const m of [fR, fL]) if (m) for (let i = 0; i < m.n; i++) { fU.push(m.U[i]); fV.push(m.V[i]); }
  let fLo = Infinity, fHi = -Infinity, vTopF = -Infinity;
  for (let i = 0; i < fU.length; i++) { fLo = Math.min(fLo, fU[i]); fHi = Math.max(fHi, fU[i]); vTopF = Math.max(vTopF, fV[i]); }
  const edge = lowestProfile(fU, fV, fLo, fHi, 2.5);
  const browEdge = u => profileAt(edge, 'top', u);
  mk.mouth = { uK, vK, upMargin, loMargin, vTopOO, vBotOO };
  mk.brow = { top: vTopF };
  out.marks = mk;

  // each follower vertex's distance from the lip ring (its nearest vertex, on an 8 mm grid of the ring)
  const ooPts = [];
  for (const m of OO) for (let i = 0; i < m.n; i++) ooPts.push(m.U[i], m.V[i], m.W[i]);
  const GRID = 8, cells = new Map(), key3 = (a, b, c) => ((a + 512) * 1024 + (b + 512)) * 1024 + (c + 512);
  for (let k = 0; k < ooPts.length; k += 3) {
    const kk = key3(Math.floor(ooPts[k] / GRID), Math.floor(ooPts[k + 1] / GRID), Math.floor(ooPts[k + 2] / GRID));
    let c = cells.get(kk); if (!c) cells.set(kk, c = []); c.push(k);
  }
  const nearestOO = (u, v, w, maxMm) => {
    const r = Math.ceil(maxMm / GRID), cu = Math.floor(u / GRID), cv = Math.floor(v / GRID), cw = Math.floor(w / GRID);
    let best = maxMm * maxMm, at = -1;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
      const cell = cells.get(key3(cu + a, cv + b, cw + c)); if (!cell) continue;
      for (const k of cell) { const d = (ooPts[k] - u) ** 2 + (ooPts[k + 1] - v) ** 2 + (ooPts[k + 2] - w) ** 2; if (d < best) { best = d; at = k; } }
    }
    return at < 0 ? null : { k: at, d: Math.sqrt(best) };
  };

  // ---- the lip ring's own fields (head coordinates, full strength), evaluated at a point of the ring
  const central = u => 1 - sm(0.45 * uK, 1.05 * uK, Math.abs(u));
  // (the two lips part over 2.4 mm in the middle, where the mouth's slit lies between them, and over up to 9 mm toward
  // the corners, where they meet and must move together)
  const upperOf = (u, v) => { const mid = lipMid(u), wd = 1.2 + 3.3 * (1 - central(u)); return sm(mid - wd, mid + wd, v); };
  const LIP = {
    purse(u, v, w, r) { const c = o.purse, f = Math.max(0, 1 - (u / uK) ** 2); r[0] += -c.inShare * u; r[1] += -c.gather * (v - lipMid(u)); r[2] += c.fwdMm * f + c.baseFwdMm; },
    stretch(u, v, w, r) { const c = o.stretch, a = Math.min(1.15, Math.abs(u) / uK); r[0] += Math.sign(u) * c.outMm * a ** 1.3; r[1] += -c.thin * (v - lipMid(u)) * Math.max(0, 1 - (u / uK) ** 2); r[2] += -c.backMm * Math.min(1, a) - 0.4; },
    upperLipUp(u, v, w, r) { const c = o.upperLipUp, up = upperOf(u, v), k = c.cornerShare + (1 - c.cornerShare) * central(u), top = 1 - c.topShare * sm(upMargin, vTopOO, v); r[1] += c.upMm * up * k * top; r[2] += c.fwdMm * up * central(u); },
    // (where the lips touch, toward the corners, the lower lip pushes the upper one with it; where the mouth is open the
    // upper lip stays)
    pout(u, v, w, r) { const c = o.pout, lo = 1 - upperOf(u, v), both = lo + (1 - lo) * (1 - opening(u)), k = 0.3 + 0.7 * central(u), edge = 1 - 0.4 * sm(loMargin, vBotOO, v); r[1] += c.upMm * both * k; r[2] += c.fwdMm * both * central(u) * edge; },
    lowerLipDown(u, v, w, r) { const c = o.lowerLipDown, lo = 1 - upperOf(u, v), k = 0.2 + 0.8 * central(u), edge = 1 - 0.45 * sm(loMargin, vBotOO, v); r[1] += -c.downMm * lo * k * edge; r[2] += c.fwdMm * lo * central(u); }
  };
  const FOLLOWERS = new Set(['risorius', 'buccinator', 'zygomaticus-major', 'zygomaticus-minor', 'levator-anguli-oris', 'levator-labii-superioris', 'levator-labii-superioris-alaeque-nasi', 'depressor-anguli-oris', 'depressor-labii-inferioris', 'mentalis']);
  // the shape a muscle thickens in (its agonists), with its fixed end (a point; t runs 0 there to 1 at the moving end)
  const corner = s => mk.corner[s];
  const AGONIST = {
    browUp: { frontalis: null },
    frown: { 'corrugator-supercilii': null, procerus: null },
    eyesShut: { 'orbicularis-oculi-orbital': null, 'orbicularis-oculi-palpebral': null },
    noseWrinkle: { nasalis: null, 'levator-labii-superioris-alaeque-nasi': null },
    nostrilFlare: { nasalis: null, 'depressor-septi-nasi': null },
    smileR: { 'zygomaticus-major': 'r', 'levator-anguli-oris': 'r', risorius: 'r' }, smileL: { 'zygomaticus-major': 'l', 'levator-anguli-oris': 'l', risorius: 'l' },
    cornerDownR: { 'depressor-anguli-oris': 'r' }, cornerDownL: { 'depressor-anguli-oris': 'l' },
    purse: { 'orbicularis-oris': null }, stretch: { risorius: null, buccinator: null },
    upperLipUp: { 'levator-labii-superioris': null, 'zygomaticus-minor': null },
    pout: { mentalis: null }, lowerLipDown: { 'depressor-labii-inferioris': null }
  };
  const bulgeOf = { browUp: 0, frown: o.frown.bulgeMm, eyesShut: o.eyesShut.bulgeMm, noseWrinkle: o.noseWrinkle.bulgeMm, nostrilFlare: o.nostrilFlare.bulgeMm,
    smileR: o.smile.bulgeMm, smileL: o.smile.bulgeMm, cornerDownR: o.cornerDown.bulgeMm, cornerDownL: o.cornerDown.bulgeMm, purse: o.purse.bulgeMm,
    stretch: o.stretch.bulgeMm, upperLipUp: o.upperLipUp.bulgeMm, pout: o.pout.bulgeMm, lowerLipDown: o.lowerLipDown.bulgeMm };

  /** The eyelid's slide over the eyeball (rotation about the eyeball's centre, across the face) by `mm` at the lid. */
  const slide = (r, s, v, w, mm) => {
    const b = mk.ball[s], dv = v - b[1], dw = w - b[2], rho = Math.hypot(dv, dw);
    if (!(rho > 1)) { r[1] += mm; return; }
    const be = Math.atan2(dv, dw) + mm / rho;
    r[1] += b[1] + rho * Math.sin(be) - v; r[2] += b[2] + rho * Math.cos(be) - w;
  };
  /** The corner field of a one-sided shape (flat core, smooth falloff). */
  const cornerPull = (r, s, u, v, w, c, d) => {
    const k = corner(s), dist = len3(u - k[0], v - k[1], w - k[2]), f = 1 - sm(c.coreMm, c.radiusMm, dist);
    r[0] += d[0] * f; r[1] += d[1] * f; r[2] += d[2] * f;
  };

  /** Displacement (head coordinates, added into r) of vertex i of muscle m in shape key, at full strength; returns the
   * bulge (mm along the vertex normal). */
  function field(key, m, i, r) {
    const u = m.U[i], v = m.V[i], w = m.W[i], nm = m.name, s = m.side;
    const sgn = u < 0 ? -1 : 1;
    switch (key) {
      case 'browUp': {
        const c = o.browUp;
        if (nm === 'frontalis') {
          const e = browEdge(u), h = clamp((v - e) / Math.max(5, vTopF - e), 0, 1);
          r[1] += c.upMm * (1 - h); r[2] += c.ridgeFwd * c.upMm * (1 - h) * (1 - sm(0.2, 0.6, h));
          return c.ridgeMm * Math.sin(Math.PI * h) * (0.5 - 0.5 * Math.cos(2 * Math.PI * c.ridges * h));
        }
        if (nm === 'orbicularis-oculi-orbital') { const e = mk.eye[s], up = c.upMm * c.ringShare * sm(e[1] + 2, e[1] + 17, v); r[1] += up; r[2] += c.ridgeFwd * up; return 0; }
        if (nm === 'corrugator-supercilii') { r[1] += c.upMm * 0.85; r[2] += c.ridgeFwd * c.upMm * 0.85; return 0; }
        if (nm === 'procerus') { const [lo, hi] = m.vr; r[1] += c.upMm * c.procerusShare * sm(lo, hi, v); return 0; }
        if (nm === 'orbicularis-oculi-palpebral') { const e = mk.eye[s]; slide(r, s, v, w, c.upMm * c.lidShare * sm(e[1], e[1] + 6, v)); return 0; }
        if (nm === 'temporoparietalis') { const e = browEdge(sgn * 48); r[1] += c.upMm * c.temporalShare * (1 - sm(0, 30, Math.hypot(u - sgn * 52, v - e))); return 0; }
        return 0;
      }
      case 'frown': {
        const c = o.frown, au = Math.abs(u), e = browEdge(u), eye = mk.eye[s || (u < 0 ? 'r' : 'l')];
        const env = sm(eye[1] - 6, e - 2, v) * (1 - sm(e + 6, e + 32, v));
        // (each pull grows and fades slowly enough across the face that no point overtakes its neighbour)
        const pullIn = c.inMm * sm(0, 24, au) * (1 - sm(30, 50, au)), pullDown = c.downMm * (1 - sm(20, 46, au));
        if (nm === 'frontalis' || nm === 'orbicularis-oculi-orbital') { r[0] += -sgn * pullIn * env; r[1] += -pullDown * env; return 0; }
        if (nm === 'corrugator-supercilii') { const t = alongFrom(m.ax, [0, e, eye[2]], u, v, w); r[0] += -sgn * (pullIn * env + 2 * t); r[1] += -pullDown * env; return Math.sin(Math.PI * t); }
        if (nm === 'procerus') { const [lo, hi] = m.vr, t = sm(lo, hi, v); r[1] += -c.downMm * t; r[0] += -sgn * 0.6 * t; return 0.8 * Math.sin(Math.PI * t); }
        if (nm === 'orbicularis-oculi-palpebral') { slide(r, s, v, w, -c.lidMm * sm(eye[1], eye[1] + 6, v)); return 0; }
        return 0;
      }
      case 'eyesShut':
      case 'eyesWide': {
        const e = mk.eye[s];
        if (!e) return 0;
        const du = u - e[0], dv = v - e[1];
        if (nm === 'orbicularis-oculi-palpebral') {
          const pr = mk.fissure[s], top = profileAt(pr, 'top', du), bot = profileAt(pr, 'bot', du), gap = Math.max(0, top - bot), mid = (top + bot) / 2;
          // the upper lid above the opening's middle line, the lower lid below it (blended over a millimetre, where the
          // two lids meet at the corners of the eye and the opening is nothing). Shut: the lids meet on the line closeAt
          // of the way up the opening and no lid passes it; wide: the upper lid folds up under the brow, less with
          // height (over 12 mm, so no part of it overtakes the part above).
          const upper = sm(mid - 0.5, mid + 0.5, dv);
          let mm;
          if (key === 'eyesShut') {
            const line = bot + o.eyesShut.closeAt * gap;
            const down = Math.min(Math.max(0, dv - line), (top - line) * (1 - 0.65 * sm(0, 6, dv - top)));
            const up = Math.min(Math.max(0, line - dv), (line - bot) * (1 - 0.6 * sm(0, 5, bot - dv)));
            mm = -upper * down + (1 - upper) * up;
          } else {
            const c = o.eyesWide, open = sm(0, 8, gap);
            mm = open * (upper * c.lidUpMm * (1 - 0.7 * sm(0, 12, dv - top)) - (1 - upper) * c.lowerDownMm * (1 - 0.6 * sm(0, 8, bot - dv)));
          }
          slide(r, s, v, w, mm);
          return 0;
        }
        if (nm === 'orbicularis-oculi-orbital') {
          if (key === 'eyesShut') {
            const c = o.eyesShut;
            r[0] += -c.squeeze * du; r[1] += -c.squeeze * dv - c.browDownMm * sm(2, 14, dv) + c.cheekUpMm * sm(-2, -14, dv);
            return 1;
          }
          r[1] += o.eyesWide.browUpMm * sm(2, 14, dv);
          return 0;
        }
        if (nm === 'frontalis' || nm === 'corrugator-supercilii' || nm === 'procerus') {
          const be = browEdge(u), near = 1 - sm(be + 2, be + 22, v);
          r[1] += (key === 'eyesShut' ? -o.eyesShut.browDownMm : o.eyesWide.browUpMm * 0.75) * near;
          return 0;
        }
        return 0;
      }
      case 'noseWrinkle': {
        const c = o.noseWrinkle;
        if (nm === 'nasalis') { const [lo, hi] = m.vr, t = sm(hi, lo, v); r[1] += c.upMm * (0.3 + 0.7 * t); r[0] += -sgn * c.inMm * t; return Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.cos(2 * Math.PI * c.ridges * t)); }
        if (nm === 'levator-labii-superioris-alaeque-nasi') { const [lo, hi] = m.vr, t = sm(hi, lo, v); r[1] += c.wingUpMm * t; return Math.sin(Math.PI * t); }
        if (nm === 'orbicularis-oris') { const up = upperOf(u, v); r[1] += c.lipUpMm * up * (1 - sm(0, 11, Math.abs(Math.abs(u) - 10))) * (1 - 0.4 * sm(upMargin, vTopOO, v)); return 0; }
        if (nm === 'procerus') { const [lo, hi] = m.vr, t = sm(lo, hi, v); r[1] += -c.procerusDownMm * t; return 0.6 * Math.sin(Math.PI * t); }
        if (nm === 'orbicularis-oculi-orbital') { const e = mk.eye[s], low = sm(e[1] - 2, e[1] - 14, v), medial = 1 - sm(0, 16, (u - e[0]) * -sgn); r[1] += c.cheekUpMm * low * medial; return 0; }
        if (nm === 'depressor-septi-nasi') { r[1] += 1.2; return 0; }
        if (nm === 'levator-labii-superioris') { const [lo, hi] = m.vr, t = sm(hi, lo, v); r[1] += 0.35 * c.lipUpMm * t * (1 - sm(14, 28, Math.abs(u))); return 0; }
        return 0;
      }
      case 'nostrilFlare': {
        const c = o.nostrilFlare;
        if (nm === 'nasalis') { const [lo, hi] = m.vr, t = sm(hi, lo, v), wing = sm(0.45, 1, t); r[0] += sgn * c.outMm * wing; r[2] += c.fwdMm * wing; return wing; }
        if (nm === 'depressor-septi-nasi') { const [lo, hi] = m.vr, t = sm(lo, hi, v); r[1] += -c.septumDownMm * t; r[0] += sgn * 0.6 * t; return Math.sin(Math.PI * t); }
        if (nm === 'levator-labii-superioris-alaeque-nasi') { const [lo, hi] = m.vr, t = sm(hi, lo, v); r[0] += sgn * 0.5 * c.outMm * t; return 0; }
        return 0;
      }
      case 'smileR': case 'smileL': case 'cornerDownR': case 'cornerDownL': {
        const S = key.endsWith('R') ? 'r' : 'l', so = S === 'r' ? -1 : 1, smile = key.startsWith('smile');
        if (!(nm === 'orbicularis-oris' || FOLLOWERS.has(nm) || nm === 'orbicularis-oculi-orbital')) return 0;
        // the other side's muscles (but the lip ring, which crosses the midline) stay
        if (s && s !== S && nm !== 'orbicularis-oris') return 0;
        if (smile) {
          const c = o.smile;
          if (nm === 'orbicularis-oculi-orbital') { const e = mk.eye[S], ch = 1 - sm(4, c.cheekRadiusMm, len3(u - mk.cheek[S][0], v - mk.cheek[S][1], w - mk.cheek[S][2])); r[1] += c.cheekUpMm * ch * sm(e[1] - 1, e[1] - 8, v); return 0; }
          cornerPull(r, S, u, v, w, c, [so * c.outMm, c.upMm, -c.backMm]);
          if (nm === 'zygomaticus-minor' || nm === 'levator-labii-superioris') { const ch = 1 - sm(4, c.cheekRadiusMm, len3(u - mk.cheek[S][0], v - mk.cheek[S][1], w - mk.cheek[S][2])); r[1] += c.cheekUpMm * ch; }
          if (nm === 'zygomaticus-major') { const t = alongFrom(m.ax, mk.zygo[S], u, v, w); return Math.sin(Math.PI * clamp(t, 0, 1)); }
          if (nm === 'levator-anguli-oris' || nm === 'risorius') { const t = alongFrom(m.ax, corner(S), u, v, w); return 0.6 * Math.sin(Math.PI * t); }
          return 0;
        }
        const c = o.cornerDown;
        if (nm === 'orbicularis-oculi-orbital') return 0;
        cornerPull(r, S, u, v, w, c, [so * c.outMm, -c.downMm, c.fwdMm]);
        if (nm === 'depressor-anguli-oris') { const t = alongFrom(m.ax, corner(S), u, v, w); return Math.sin(Math.PI * t); }
        return 0;
      }
      case 'purse': case 'stretch': case 'upperLipUp': case 'pout': case 'lowerLipDown': {
        const c = o[key];
        if (nm === 'orbicularis-oris') { LIP[key](u, v, w, r); return key === 'purse' ? 1 : 0; }
        if (key === 'pout' && nm === 'mentalis') { const [lo, hi] = m.vr, t = sm(hi, lo, v); r[1] += c.chinUpMm * (0.4 + 0.6 * t); r[2] += c.chinFwdMm * t; return Math.sin(Math.PI * clamp((v - lo) / Math.max(1, hi - lo), 0, 1)); }
        if (key === 'upperLipUp' && nm === 'nasalis') { const [lo, hi] = m.vr, t = sm(hi, lo, v); r[1] += c.wingUpMm * sm(0.5, 1, t); return 0; }
        if (!FOLLOWERS.has(nm)) return 0;
        // a follower moves like the lip ring would at its own place (held inside the ring's span), less with its
        // distance from the ring (both continuous, so a follower never tears)
        if (m.nearD && m.nearD[i] < c.fadeMm) {
          const f = 1 - sm(0.5, c.fadeMm, m.nearD[i]), q = [0, 0, 0];
          LIP[key](clamp(u, -1.05 * uK, 1.05 * uK), clamp(v, vBotOO, vTopOO), w, q);
          r[0] += q[0] * f; r[1] += q[1] * f; r[2] += q[2] * f;
        }
        const ag = AGONIST[key] && Object.prototype.hasOwnProperty.call(AGONIST[key], nm);
        if (ag) { const t = alongFrom(m.ax, [0, vK, 0], u, v, w); return Math.sin(Math.PI * t); }
        return 0;
      }
      default: return 0;
    }
  }

  // per-muscle helpers used by the fields: the vertical range and the followers' nearest lip-ring vertex
  for (const m of all.values()) {
    m.vr = range(m, 'V');
    if (FOLLOWERS.has(m.name) && ooPts.length) {
      m.nearD = new Float32Array(m.n).fill(Infinity);
      for (let i = 0; i < m.n; i++) { const q = nearestOO(m.U[i], m.V[i], m.W[i], 16); if (q) m.nearD[i] = q.d; }
    }
  }

  // the upper face's sheets slide over the curved bone: the outward direction there is taken from a point inside the
  // skull behind the eyes (a sphere fits the forehead and the brows, not the lower face)
  const inside = [(mk.ball.r[0] + mk.ball.l[0]) / 2, (mk.ball.r[1] + mk.ball.l[1]) / 2 - 10, (mk.ball.r[2] + mk.ball.l[2]) / 2 - 55];
  const OVER_BONE = new Set(['frontalis', 'temporoparietalis', 'procerus', 'corrugator-supercilii', 'orbicularis-oculi-orbital']);
  // ---- every shape, every face muscle: sparse lists in the caller's frame
  const r = [0, 0, 0];
  for (const m of all.values()) {
    const rec = { count: m.n, keys: [], shapes: new Map() };
    for (const key of FACE_SHAPE_KEYS) {
      const D = new Float32Array(3 * m.n);
      let any = false, max = 0;
      const ag = AGONIST[key] && Object.prototype.hasOwnProperty.call(AGONIST[key], m.name) && (AGONIST[key][m.name] === null || AGONIST[key][m.name] === m.side);
      for (let i = 0; i < m.n; i++) {
        r[0] = 0; r[1] = 0; r[2] = 0;
        let b = field(key, m, i, r);
        // a sheet slides over the bone: the part of its displacement INTO the head is taken out (moving a point of the
        // curved forehead straight across would sink it into the skull)
        if (OVER_BONE.has(m.name)) {
          const ou = m.U[i] - inside[0], ov = m.V[i] - inside[1], ow = m.W[i] - inside[2], l = len3(ou, ov, ow) || 1;
          const dn = (r[0] * ou + r[1] * ov + r[2] * ow) / l;
          if (dn < 0) { r[0] -= dn * ou / l; r[1] -= dn * ov / l; r[2] -= dn * ow / l; }
        }
        b = m.N && finite(b) ? (key === 'browUp' && m.name === 'frontalis' ? b : ag ? b * bulgeOf[key] : 0) : 0;
        const du = r[0] + b * (m.NU ? m.NU[i] : 0), dv = r[1] + b * (m.NV ? m.NV[i] : 0), dw = r[2] + b * (m.NW ? m.NW[i] : 0);
        const mm = len3(du, dv, dw);
        if (!(mm >= o.minMm) || !finite(mm)) continue;
        any = true; if (mm > max) max = mm;
        const k = 3 * i;
        D[k] = du * X[0] + dv * up[0] + dw * F[0]; D[k + 1] = du * X[1] + dv * up[1] + dw * F[1]; D[k + 2] = du * X[2] + dv * up[2] + dw * F[2];
      }
      if (!any) continue;
      // the normals' change (rest normals and the displaced shape's, both area-weighted)
      let dN = null;
      if (m.N) {
        const Q = new Float32Array(m.P.length);
        for (let k = 0; k < Q.length; k++) Q[k] = m.P[k] + D[k];
        const N1 = vertexNormals(Q, m.I);
        dN = new Float32Array(m.P.length);
        for (let k = 0; k < dN.length; k++) dN[k] = N1[k] - m.N[k];
      }
      const idx = [];
      for (let i = 0, k = 0; i < m.n; i++, k += 3) {
        const dd = Math.abs(D[k]) + Math.abs(D[k + 1]) + Math.abs(D[k + 2]), nn = dN ? Math.abs(dN[k]) + Math.abs(dN[k + 1]) + Math.abs(dN[k + 2]) : 0;
        if (dd > 0 || nn >= o.minN) idx.push(i);
      }
      const sh = { idx: Uint32Array.from(idx), d: new Float32Array(3 * idx.length), dn: dN ? new Float32Array(3 * idx.length) : null };
      idx.forEach((i, j) => { for (let a = 0; a < 3; a++) { sh.d[3 * j + a] = D[3 * i + a]; if (dN) sh.dn[3 * j + a] = dN[3 * i + a]; } });
      rec.shapes.set(key, sh); rec.keys.push(key);
      out.maxMm[key] = Math.max(out.maxMm[key] || 0, Math.round(max * 100) / 100);
    }
    if (rec.keys.length) out.meshes.set(m.id, rec);
  }
  out.ok = out.meshes.size > 0;
  if (!out.ok) out.note = 'no face muscle moves';
  return out;
}

/**
 * One face muscle's drawn shape: out = base + the sum over the active shapes of strength x displacement (positions,
 * flat xyz), and, when both are given, outN = normalise(baseN + the sum of strength x normal change). weights: the
 * shapes' strengths (faceShapeWeights). out may be base (then base must hold the resting positions on entry). Returns
 * the number of shapes applied (0: out is exactly base).
 */
export function applyFaceMoves(rig, id, weights, base, out, baseN = null, outN = null) {
  const rec = rig && rig.meshes ? rig.meshes.get(id) : null;
  if (out !== base) out.set(base);
  if (outN && baseN && outN !== baseN) outN.set(baseN);
  if (!rec || !weights) return 0;
  let applied = 0;
  const normals = Boolean(outN && baseN);
  for (const key of rec.keys) {
    const w = weights[key];
    if (!(w > 0)) continue;
    const sh = rec.shapes.get(key), idx = sh.idx, d = sh.d, dn = normals ? sh.dn : null;
    for (let j = 0; j < idx.length; j++) {
      const k = 3 * idx[j], q = 3 * j;
      out[k] += w * d[q]; out[k + 1] += w * d[q + 1]; out[k + 2] += w * d[q + 2];
      if (dn) { outN[k] += w * dn[q]; outN[k + 1] += w * dn[q + 1]; outN[k + 2] += w * dn[q + 2]; }
    }
    applied++;
  }
  // the summed normals made unit again (a vertex in several shapes is visited again: normalising is idempotent)
  if (normals && applied) for (const key of rec.keys) {
    if (!(weights[key] > 0)) continue;
    const sh = rec.shapes.get(key);
    if (!sh.dn) continue;
    for (let j = 0; j < sh.idx.length; j++) {
      const k = 3 * sh.idx[j], l = len3(outN[k], outN[k + 1], outN[k + 2]);
      if (l > 1e-6) { outN[k] /= l; outN[k + 1] /= l; outN[k + 2] /= l; } else { outN[k] = baseN[k]; outN[k + 1] = baseN[k + 1]; outN[k + 2] = baseN[k + 2]; }
    }
  }
  return applied;
}

/** A short key of the strengths (quantised to 1/256), for "has the face changed?". */
export function faceWeightsKey(weights) {
  if (!weights) return '';
  let s = '';
  for (const k of FACE_SHAPE_KEYS) { const q = Math.round((weights[k] || 0) * 256); if (q) s += `${k}:${q},`; }
  return s;
}
