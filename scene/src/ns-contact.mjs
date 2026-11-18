/** NeuroSurge: your own limbs meet each other and the trunk (18 November 2026, package CONTACT).
 *
 * Owner, 17 November: "And I asked for collision effects. And limb pushing limb effects"; 12 November: "And move one limb
 * into another will obviously move the other limbs (passively) by knocking them about ragdoll style."
 *
 * Pure maths, no DOM, no Three. Your body is covered by CONTACT BALLS, built once from the rig and its source meshes:
 *   - a limb segment (upper arm, forearm, hand, thigh, shank, foot) gets a chain of balls along the line between its two
 *     joint pivots: each ball sits at the centre of the slice of that segment's flesh (bones and muscles) around its
 *     station, with the radius inside which CONTACT.quantile of the slice's vertices lie;
 *   - the trunk gets rows of balls across it, one row per height band of the trunk's flesh (pelvis, belly, chest), each
 *     ball as deep as the band, carried by the vertebra at that height;
 *   - the head gets one ball.
 * A ball is a point of the source (anatomical) pose carried by its segment's matrix, so it follows every posture, the
 * spine's bend and the combined-range rule exactly as the drawn body does.
 *
 * Two balls of different limbs are in CONTACT when they are closer than their radii allow. The start posture is the
 * reference: a pair that overlaps there (a forearm resting on a thigh, the two thighs at the groin) may overlap that much
 * and no more (its `allow`), so the start posture is free of contact by definition and a limb resting on another stays
 * resting ON it, never sinks into it. Pairs that are joined in the body (a thigh at the pelvis, the upper arm at the
 * side of the chest, the head on the neck) are not tested.
 *
 * When a limb that moves meets one that does not, the still one is PUSHED: a few damped least-squares steps over its two
 * root joints (shoulder or hip: forward / back and out / in) move every ball of it that is in contact out along the
 * contact's normal, each joint inside its range and the combined-range rule (the caller's clamp). What the push cannot
 * clear (a joint at the end of its range, the pushed limb against a third part) stops the moving limb there: the largest
 * share of its move that adds no depth to any pair (holdShare).
 *
 * The balls are a coarse engineering cover of drawn display meshes for a game rule: not a measured body surface, not
 * tissue contact, not forces, not physics.
 */

/** Display choices (millimetres and degrees unless named).
 *  quantile: a ball's radius holds this share of its slice's flesh vertices (the rest, the slice's farthest bulges, may
 *    stand a little outside it). sampleVertices: about this many of the body's vertices are read to build the balls.
 *  trunkBandMm: height of a trunk band; trunkEdgeQ: the share of a band's vertices cut off at each side (stray points);
 *    trunkDepth: a trunk ball's radius as a share of half the band's depth.
 *  tolMm: depth below which a pair is not a contact. marginMm: a push moves a ball this much past touching (so the same
 *    pair is not in contact again on the next frame).
 *  pushIters / probeDeg / lambda / stepDeg: the push solve (iterations, probe for each Jacobian column, damping in mm
 *    per degree, the most one joint moves in one iteration). maxPushDeg: the most a push turns one joint in one frame
 *    (a push is spread over frames, never a fling). deepShare: a pair already deeper than this share of its smaller
 *    ball's radius on the last frame has gone through (something that cannot be stopped carried it there): it pushes
 *    nothing more (its direction is no longer known; pushing on would throw the limb the wrong way).
 *  holdSteps: bisection steps of holdShare. weight: while a limb pushes another, it makes this share of its step (the
 *    pushed limb has a little weight; the rest of the step follows on the next frames). stillShare: of two balls in
 *    contact, the one that travelled less this frame belongs to a still limb when it travelled less than this share of
 *    the other (otherwise both limbs move and neither holds the other).
 *  recoil: a pushed limb, when the push ends, swings back a little and settles (degrees, Hz, seconds; drawn only, never
 *    held). flashS: how long a contact's flash lasts; flashGapS: the same pair of limbs flashes again only after this. */
export const CONTACT = Object.freeze({
  quantile: 0.85, sampleVertices: 120000,
  trunkBandMm: 60, trunkEdgeQ: 0.04, trunkDepth: 0.95,
  tolMm: 0.5, marginMm: 1.0,
  pushIters: 3, probeDeg: 0.5, lambda: 0.6, stepDeg: 10, maxPushDeg: 6, deepShare: 0.45,
  holdSteps: 6,
  weight: 0.6, stillShare: 0.4,
  recoil: Object.freeze({ deg: 1.4, hz: 5, s: 0.36 }),
  flashS: 0.34, flashGapS: 0.45
});

/** The limbs (contact groups). rightArm, rightLeg and leftLeg can be pushed; the trunk and the head cannot (they carry the
 * eyes); leftArm is the game arm (its own rig, posed by its own solver from the look and W/A/S/D: addArmBalls), which
 * pushes what it moves into but is never pushed or held itself. */
export const CONTACT_LIMBS = Object.freeze(['rightArm', 'rightLeg', 'leftLeg', 'trunk', 'head', 'leftArm']);
/** The joints a push turns: each limb's root (shoulder / hip) forward-back and out-in. */
export const PUSH_JOINTS = Object.freeze({
  rightArm: Object.freeze(['r_shoulder_flex', 'r_shoulder_abd']),
  rightLeg: Object.freeze(['hip_flex_R', 'hip_abd_R']),
  leftLeg: Object.freeze(['hip_flex_L', 'hip_abd_L'])
});

/** Which limb a body joint belongs to (activity / ns-body joint ids). */
export function limbOfJoint(id) {
  if (typeof id !== 'string') return null;
  if (/^(trunk_|pelvic_)/.test(id)) return 'trunk';
  if (/^r_/.test(id)) return 'rightArm';
  if (/_R$/.test(id)) return 'rightLeg';
  if (/_L$/.test(id)) return 'leftLeg';
  return 'head'; // the neck, the jaw and the face
}

/** The chains of balls along the limb segments: limb, part, the segment that carries the balls, the pivots at the two
 * ends of the line, the stations (share of the way from a to b; a share past 1 runs on beyond b), and the segments whose
 * meshes give the flesh. */
const CHAINS = Object.freeze([
  { limb: 'rightArm', part: 'upperarm', seg: 'r_upperarm', a: 'r_glenohumeral', b: 'r_elbow', t: [0.3, 0.55, 0.8], flesh: ['r_upperarm'] },
  { limb: 'rightArm', part: 'forearm', seg: 'r_forearm', a: 'r_elbow', b: 'r_wrist', t: [0.12, 0.37, 0.62, 0.87], flesh: ['r_forearm', 'r_radius'] },
  { limb: 'rightArm', part: 'hand', seg: 'r_hand', a: 'r_wrist', b: 'r_middle_mcp', t: [0.4, 0.95], flesh: ['r_hand', 'r_thumb_mc'] },
  { limb: 'rightArm', part: 'fingers', seg: 'r_middle_pp', a: 'r_middle_mcp', b: 'r_middle_pip', t: [0.6], flesh: ['r_index_pp', 'r_middle_pp', 'r_ring_pp', 'r_little_pp'] },
  { limb: 'rightLeg', part: 'thigh', seg: 'r_thigh', a: 'r_hip', b: 'r_knee', t: [0.18, 0.38, 0.58, 0.78, 0.96], flesh: ['r_thigh', 'r_patella'] },
  { limb: 'rightLeg', part: 'shank', seg: 'r_shank', a: 'r_knee', b: 'r_ankle', t: [0.1, 0.3, 0.5, 0.7, 0.9], flesh: ['r_shank'] },
  { limb: 'rightLeg', part: 'foot', seg: 'r_foot', a: 'r_ankle', b: 'r_mtp', t: [0.15, 0.55, 0.95], flesh: ['r_foot', 'r_toes', 'r_hallux'] },
  { limb: 'leftLeg', part: 'thigh', seg: 'l_thigh', a: 'l_hip', b: 'l_knee', t: [0.18, 0.38, 0.58, 0.78, 0.96], flesh: ['l_thigh', 'l_patella'] },
  { limb: 'leftLeg', part: 'shank', seg: 'l_shank', a: 'l_knee', b: 'l_ankle', t: [0.1, 0.3, 0.5, 0.7, 0.9], flesh: ['l_shank'] },
  { limb: 'leftLeg', part: 'foot', seg: 'l_foot', a: 'l_ankle', b: 'l_mtp', t: [0.15, 0.55, 0.95], flesh: ['l_foot', 'l_toes', 'l_hallux'] }
]);
/** The trunk's segments (their meshes are the trunk's flesh) and the spine segments that carry its bands, bottom up. */
const TRUNK_SEG_RE = /^(pelvis|lumbar|l[1-4]|t([2-9]|1[0-2])|thorax|sternum|[rl]_rib\d+|[rl]_cc\d|[rl]_gbase|[rl]_girdle|[rl]_clav)$/;
const SPINE_CARRIERS = Object.freeze(['pelvis', 'lumbar', 'l4', 'l3', 'l2', 'l1', 't12', 't11', 't10', 't9', 't8', 't7', 't6', 't5', 't4', 't3', 't2', 'thorax']);
const HEAD_SEG_RE = /^(skull|mandible)$/;

const fail = m => { throw new Error('ns:contact: ' + m); };
const quantileOf = (arr, q) => { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
const at = (m, x, y, z, out, o) => { out[o] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; };

/** Every `stride`-th vertex (source mm, flat xyz) of the meshes whose rig segment matches `test`. (The radii are
 * quantiles of thousands of vertices, so a sample of the about one million vertices of the body gives the same balls
 * to well under a millimetre; built in tens of milliseconds instead of a second.) */
function fleshOf(rig, meshesById, test, stride = 1) {
  const parts = [];
  let n = 0;
  for (const [id, info] of Object.entries(rig.meshSegment || {})) {
    const sg = info && info.segment;
    if (!sg || !test(sg)) continue;
    const m = meshesById instanceof Map ? meshesById.get(id) : meshesById && meshesById[id];
    const P = m && m.positions;
    if (!P || P.length < 3) continue;
    parts.push(P); n += Math.ceil(P.length / 3 / stride) * 3;
  }
  const out = new Float64Array(n);
  let o = 0;
  for (const P of parts) for (let i = 0; i < P.length; i += 3 * stride) { out[o] = P[i]; out[o + 1] = P[i + 1]; out[o + 2] = P[i + 2]; o += 3; }
  return o === n ? out : out.subarray(0, o);
}
/** The vertex stride that keeps about `keep` vertices of the rig's meshes. */
function strideFor(rig, meshesById, keep) {
  let n = 0;
  for (const id of Object.keys(rig.meshSegment || {})) { const m = meshesById instanceof Map ? meshesById.get(id) : meshesById && meshesById[id]; if (m && m.positions) n += m.positions.length / 3; }
  return Math.max(1, Math.floor(n / keep));
}

/**
 * The contact balls of a body rig (see the module note). rig: ns-body buildBodyRig; meshesById: the source meshes the rig
 * was built from (Map id -> { positions }). Returns { n, seg[], limb[], part[], zone[], t (Float64Array: station share, -1
 * for the trunk and head), side (Int8Array: -1 right, 1 left, 0 middle), src (Float64Array 3n, source mm), r
 * (Float64Array n, mm), pairs / allow (set by contactPairs) }. Throws when the rig lacks a pivot a chain needs.
 */
export function buildContactBalls(rig, meshesById, o = CONTACT) {
  if (!rig || !rig.pivots || !rig.segments || !rig.meshSegment) fail('buildContactBalls needs an ns-body rig');
  const balls = [];
  const P = k => { const p = rig.pivots[k] && rig.pivots[k].point; if (!p) fail(`the rig has no pivot ${k}`); return p; };
  const stride = strideFor(rig, meshesById, o.sampleVertices);
  for (const c of CHAINS) {
    if (!rig.segments[c.seg]) continue;
    const a = P(c.a), b = P(c.b), ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(ax[0], ax[1], ax[2]);
    if (!(L > 1)) continue;
    const u = ax.map(v => v / L), flesh = fleshOf(rig, meshesById, sg => c.flesh.includes(sg), stride);
    const half = c.t.length > 1 ? Math.min(...c.t.slice(1).map((t, i) => t - c.t[i])) / 2 + 0.02 : 0.25;
    const share = new Float64Array(flesh.length / 3);
    for (let i = 0, v = 0; i < flesh.length; i += 3, v++) share[v] = ((flesh[i] - a[0]) * u[0] + (flesh[i + 1] - a[1]) * u[1] + (flesh[i + 2] - a[2]) * u[2]) / L;
    for (const t of c.t) {
      // the slice of flesh around the station, its centre (in the plane across the line) and how far it spreads
      const sel = [];
      for (let v = 0; v < share.length; v++) if (Math.abs(share[v] - t) <= half) sel.push(3 * v);
      const st = [a[0] + ax[0] * t, a[1] + ax[1] * t, a[2] + ax[2] * t];
      let cx = 0, cy = 0, cz = 0;
      if (sel.length >= 8) {
        for (const i of sel) { const dx = flesh[i] - st[0], dy = flesh[i + 1] - st[1], dz = flesh[i + 2] - st[2], d = dx * u[0] + dy * u[1] + dz * u[2]; cx += dx - d * u[0]; cy += dy - d * u[1]; cz += dz - d * u[2]; }
        cx /= sel.length; cy /= sel.length; cz /= sel.length;
      }
      const centre = [st[0] + cx, st[1] + cy, st[2] + cz];
      const radial = sel.map(i => { const dx = flesh[i] - centre[0], dy = flesh[i + 1] - centre[1], dz = flesh[i + 2] - centre[2], d = dx * u[0] + dy * u[1] + dz * u[2]; return Math.hypot(dx - d * u[0], dy - d * u[1], dz - d * u[2]); });
      const r = sel.length >= 8 ? quantileOf(radial, o.quantile) : 0;
      if (!(r > 5)) continue;
      balls.push({ seg: c.seg, limb: c.limb, part: c.part, zone: '', t, side: c.limb === 'rightArm' || c.limb === 'rightLeg' ? -1 : 1, p: centre, r });
    }
  }
  // The trunk: rows of balls across each height band.
  {
    const flesh = fleshOf(rig, meshesById, sg => TRUNK_SEG_RE.test(sg), stride);
    const hipZ = (P('r_hip')[2] + P('l_hip')[2]) / 2, topZ = P('cervicothoracic')[2] + 20, belly = P('l3_l4')[2], chest = P('thoracolumbar')[2];
    const carriers = SPINE_CARRIERS.filter(s => rig.segments[s] && rig.segments[s].restCentroid);
    const zStart = hipZ - o.trunkBandMm, nb = Math.max(0, Math.ceil((topZ - zStart) / o.trunkBandMm));
    const bandX = Array.from({ length: nb }, () => []), bandY = Array.from({ length: nb }, () => []);
    for (let i = 0; i < flesh.length; i += 3) { const k = Math.floor((flesh[i + 2] - zStart) / o.trunkBandMm); if (k >= 0 && k < nb) { bandX[k].push(flesh[i]); bandY[k].push(flesh[i + 1]); } }
    for (let band = 0; band < nb; band++) {
      const z0 = zStart + band * o.trunkBandMm, xs = bandX[band], ys = bandY[band];
      if (xs.length < 30) continue;
      const x0 = quantileOf(xs, o.trunkEdgeQ), x1 = quantileOf(xs, 1 - o.trunkEdgeQ), y0 = quantileOf(ys, o.trunkEdgeQ), y1 = quantileOf(ys, 1 - o.trunkEdgeQ);
      const r = ((y1 - y0) / 2) * o.trunkDepth, zc = z0 + o.trunkBandMm / 2, yc = (y0 + y1) / 2;
      if (!(r > 10)) continue;
      const span = Math.max(0, x1 - x0 - 2 * r), k = span > 0 ? Math.ceil(span / r) + 1 : 1;
      let carrier = carriers[0], best = Infinity;
      for (const s of carriers) { const d = Math.abs(rig.segments[s].restCentroid[2] - zc); if (d < best) { best = d; carrier = s; } }
      const zone = zc < belly ? 'pelvis' : zc < chest ? 'belly' : 'chest';
      for (let j = 0; j < k; j++) {
        const x = k === 1 ? (x0 + x1) / 2 : x0 + r + (span * j) / (k - 1);
        balls.push({ seg: carrier, limb: 'trunk', part: 'trunk', zone, t: -1, side: Math.abs(x) < r * 0.5 ? 0 : x > 0 ? 1 : -1, p: [x, yc, zc], r });
      }
    }
  }
  // The head.
  {
    const flesh = fleshOf(rig, meshesById, sg => HEAD_SEG_RE.test(sg), stride);
    if (flesh.length >= 30 && rig.segments.skull) {
      let cx = 0, cy = 0, cz = 0;
      const n = flesh.length / 3;
      for (let i = 0; i < flesh.length; i += 3) { cx += flesh[i]; cy += flesh[i + 1]; cz += flesh[i + 2]; }
      cx /= n; cy /= n; cz /= n;
      const d = [];
      for (let i = 0; i < flesh.length; i += 3) d.push(Math.hypot(flesh[i] - cx, flesh[i + 1] - cy, flesh[i + 2] - cz));
      balls.push({ seg: 'skull', limb: 'head', part: 'head', zone: '', t: -1, side: 0, p: [cx, cy, cz], r: quantileOf(d, o.quantile) });
    }
  }
  const n = balls.length;
  if (!n) fail('no contact balls could be built');
  const src = new Float64Array(3 * n), r = new Float64Array(n), t = new Float64Array(n), side = new Int8Array(n);
  balls.forEach((bl, i) => { src[3 * i] = bl.p[0]; src[3 * i + 1] = bl.p[1]; src[3 * i + 2] = bl.p[2]; r[i] = bl.r; t[i] = bl.t; side[i] = bl.side; });
  const limb = balls.map(bl => bl.limb), limbIndex = new Int8Array(n);
  for (let i = 0; i < n; i++) limbIndex[i] = CONTACT_LIMBS.indexOf(limb[i]);
  return { n, seg: balls.map(bl => bl.seg), limb, limbIndex, part: balls.map(bl => bl.part), zone: balls.map(bl => bl.zone), t, side, src, r, pairs: null, allow: null };
}

/** Ball centres (drawn mm, flat xyz) for segment matrices S (segment -> column-major 4x4, source -> drawn); `from`: only
 * the balls from this index on are written (the rest of `out` is left as it is). */
export function poseBalls(model, S, out = new Float64Array(3 * model.n), from = 0) {
  for (let i = from; i < model.n; i++) {
    const m = S[model.seg[i]];
    if (!m) fail(`no matrix for segment ${model.seg[i]}`);
    at(m, model.src[3 * i], model.src[3 * i + 1], model.src[3 * i + 2], out, 3 * i);
  }
  return out;
}

/** Whether balls i and j are ever tested against each other (different limbs, and not joined in the body). */
export function pairTested(model, i, j) {
  const li = model.limb[i], lj = model.limb[j];
  if (li === lj) return false;
  const one = (a, b) => (model.limb[a] === 'trunk' ? [b, a] : model.limb[b] === 'trunk' ? [a, b] : null);
  if ((li === 'head' && lj === 'trunk') || (li === 'trunk' && lj === 'head')) return false; // the head on the neck
  // the game arm keeps its own place at the trunk and the head (its solver and the reach sphere); here it meets the limbs
  if ((li === 'leftArm' || lj === 'leftArm') && (li === 'trunk' || lj === 'trunk' || li === 'head' || lj === 'head')) return false;
  const tr = one(i, j);
  if (tr) {
    const [x, k] = tr; // x: the limb's ball, k: the trunk's
    // a thigh is joined to the pelvis, and its upper half lies against the lower belly at the groin
    if (model.part[x] === 'thigh' && (model.zone[k] === 'pelvis' || (model.zone[k] === 'belly' && model.t[x] < 0.5))) return false;
    // the upper arm hangs from the shoulder at the side of the chest (its own side and the middle of the chest)
    if (model.part[x] === 'upperarm' && model.zone[k] === 'chest' && model.side[k] !== -model.side[x]) return false;
  }
  return true;
}

/** The pairs tested (Int32Array i, j, ...) and each one's allowed overlap at the start posture (Float64Array, mm): the
 * overlap the pair has in `restBalls` (poseBalls of the start posture), 0 when it is apart there. Sets model.pairs /
 * model.allow and returns the model. */
export function contactPairs(model, restBalls) {
  const pairs = [], allow = [];
  for (let i = 0; i < model.n; i++) for (let j = i + 1; j < model.n; j++) {
    if (!pairTested(model, i, j)) continue;
    const d = Math.hypot(restBalls[3 * i] - restBalls[3 * j], restBalls[3 * i + 1] - restBalls[3 * j + 1], restBalls[3 * i + 2] - restBalls[3 * j + 2]);
    pairs.push(i, j); allow.push(Math.max(0, model.r[i] + model.r[j] - d));
  }
  model.pairs = Int32Array.from(pairs);
  model.allow = Float64Array.from(allow);
  return model;
}

/** The left (game) arm's segments as this module names them, and the arm rig's segment each is carried by. */
export const ARM_BALL_SEGMENTS = Object.freeze({ 'arm:upperarm': 'upperarm', 'arm:ulna': 'ulna', 'arm:hand': 'hand' });
/**
 * A model with the left (game) arm's balls added (a new model; `model` is unchanged): the arm rig's own pivots (source
 * mm: shoulder, elbow, wrist) give the lines, and each station takes the radius of the right arm's ball at the same
 * station (the arm meshes are the right arm's mirror image; a display choice that saves reading the game arm's skinned
 * muscles). Carried by the segments 'arm:upperarm', 'arm:ulna' (the forearm without its turn) and 'arm:hand' (the
 * caller supplies their matrices, source mm -> drawn mm). The pairs are not set: armPairs does that from a pose.
 */
export function addArmBalls(model, pivots) {
  const sh = pivots && pivots.shoulder, el = pivots && pivots.elbow, wr = pivots && pivots.wrist;
  if (![sh, el, wr].every(p => p && p.length === 3 && Array.from(p).every(Number.isFinite))) fail('addArmBalls needs the arm rig pivots shoulder, elbow, wrist');
  const fa = [wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]], fl = Math.hypot(fa[0], fa[1], fa[2]) || 1;
  const handEnd = [wr[0] + (fa[0] / fl) * 100, wr[1] + (fa[1] / fl) * 100, wr[2] + (fa[2] / fl) * 100]; // about the knuckles
  const lines = [['upperarm', 'arm:upperarm', sh, el], ['forearm', 'arm:ulna', el, wr], ['hand', 'arm:hand', wr, handEnd]];
  const add = [];
  for (const [part, seg, a, b] of lines) {
    const own = [];
    for (let i = 0; i < model.n; i++) if (model.limb[i] === 'rightArm' && model.part[i] === part) own.push(i);
    for (const i of own) {
      const t = model.t[i];
      add.push({ seg, part, t, r: model.r[i], p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] });
    }
  }
  const n = model.n + add.length, src = new Float64Array(3 * n), r = new Float64Array(n), t = new Float64Array(n), side = new Int8Array(n), limbIndex = new Int8Array(n);
  src.set(model.src); r.set(model.r); t.set(model.t); side.set(model.side); limbIndex.set(model.limbIndex);
  add.forEach((b, k) => { const i = model.n + k; src[3 * i] = b.p[0]; src[3 * i + 1] = b.p[1]; src[3 * i + 2] = b.p[2]; r[i] = b.r; t[i] = b.t; side[i] = 1; limbIndex[i] = CONTACT_LIMBS.indexOf('leftArm'); });
  return { n, seg: [...model.seg, ...add.map(b => b.seg)], limb: [...model.limb, ...add.map(() => 'leftArm')], limbIndex, part: [...model.part, ...add.map(b => b.part)],
    zone: [...model.zone, ...add.map(() => '')], t, side, src, r, pairs: null, allow: null, bodyBalls: model.n };
}
/** The pairs of a model made by addArmBalls: the body's pairs keep the allowance they have in `bodyModel`; each pair with
 * a left-arm ball takes the overlap it has in B (poseBalls of the extended model at the pose seen now, before any input).
 * Sets ext.pairs / ext.allow and returns ext. */
export function armPairs(ext, bodyModel, B) {
  const keep = new Map();
  for (let k = 0; k < bodyModel.pairs.length / 2; k++) keep.set(bodyModel.pairs[2 * k] * 65536 + bodyModel.pairs[2 * k + 1], bodyModel.allow[k]);
  const pairs = [], allow = [];
  for (let i = 0; i < ext.n; i++) for (let j = i + 1; j < ext.n; j++) {
    if (!pairTested(ext, i, j)) continue;
    let a = keep.get(i * 65536 + j);
    if (a === undefined) {
      if (i < ext.bodyBalls && j < ext.bodyBalls) continue; // (a body pair the body model does not test)
      const d = Math.hypot(B[3 * i] - B[3 * j], B[3 * i + 1] - B[3 * j + 1], B[3 * i + 2] - B[3 * j + 2]);
      a = Math.max(0, ext.r[i] + ext.r[j] - d);
    }
    pairs.push(i, j); allow.push(a);
  }
  ext.pairs = Int32Array.from(pairs);
  ext.allow = Float64Array.from(allow);
  return ext;
}

/** Depth of pair k (mm, positive = deeper than allowed) for ball centres B. */
export function pairDepth(model, B, k) {
  const i = model.pairs[2 * k], j = model.pairs[2 * k + 1];
  const dx = B[3 * i] - B[3 * j], dy = B[3 * i + 1] - B[3 * j + 1], dz = B[3 * i + 2] - B[3 * j + 2];
  return model.r[i] + model.r[j] - Math.sqrt(dx * dx + dy * dy + dz * dz) - model.allow[k];
}

/**
 * Pairs that are deeper than allowed in B AND deeper than they were in B0 (a pair that was already in contact may stay
 * so while it does not get deeper: the clearFraction rule of ns-collide): [{ k, i, j, depth, gain }], deepest first.
 * `only` (optional): a limb name; then only pairs with one ball in that limb.
 */
export function contactsOf(model, B, B0, { tol = CONTACT.tolMm, only = null } = {}) {
  const out = [];
  const P = model.pairs, oi = only ? CONTACT_LIMBS.indexOf(only) : -1;
  for (let k = 0; k < P.length / 2; k++) {
    const i = P[2 * k], j = P[2 * k + 1];
    if (oi >= 0 && model.limbIndex[i] !== oi && model.limbIndex[j] !== oi) continue;
    const d = pairDepth(model, B, k);
    if (!(d > tol)) continue;
    const d0 = B0 ? pairDepth(model, B0, k) : -Infinity;
    if (d0 > tol && d <= d0 + tol) continue;
    out.push({ k, i, j, depth: d, gain: d0 > 0 ? d - d0 : d });
  }
  out.sort((a, b) => b.depth - a.depth);
  return out;
}

/** The largest depth any pair GAINS from B0 to B beyond its allowance (mm; <= tol means nothing new is in contact).
 * skip(i, j) (optional): true leaves the pair of balls i, j out (two limbs that move together hold nothing). */
export function worstGain(model, B, B0, tol = CONTACT.tolMm, skip = null) {
  let worst = 0;
  const P = model.pairs;
  for (let k = 0; k < P.length / 2; k++) {
    const d = pairDepth(model, B, k);
    if (!(d > tol)) continue;
    if (skip && skip(P[2 * k], P[2 * k + 1])) continue;
    const d0 = B0 ? pairDepth(model, B0, k) : -Infinity;
    const g = d0 > tol ? d - d0 : d;
    if (g > worst) worst = g;
  }
  return worst;
}

/** How far each ball moved from B0 to B (mm), into out (Float64Array n). */
export function ballTravel(model, B, B0, out = new Float64Array(model.n)) {
  for (let i = 0; i < model.n; i++) out[i] = Math.hypot(B[3 * i] - B0[3 * i], B[3 * i + 1] - B0[3 * i + 1], B[3 * i + 2] - B0[3 * i + 2]);
  return out;
}

/** Solve (A^T A + l^2 I) x = A^T b for a small dense A (rows of length k). */
function dampedSolve(A, b, k, lambda) {
  const M = Array.from({ length: k }, () => new Float64Array(k + 1));
  for (let r = 0; r < A.length; r++) for (let p = 0; p < k; p++) {
    for (let q = 0; q < k; q++) M[p][q] += A[r][p] * A[r][q];
    M[p][k] += A[r][p] * b[r];
  }
  for (let p = 0; p < k; p++) M[p][p] += lambda * lambda;
  for (let p = 0; p < k; p++) { // Gauss-Jordan with partial pivots (k is 2 or 3)
    let piv = p;
    for (let q = p + 1; q < k; q++) if (Math.abs(M[q][p]) > Math.abs(M[piv][p])) piv = q;
    if (piv !== p) { const t = M[p]; M[p] = M[piv]; M[piv] = t; }
    const d = M[p][p];
    if (!(Math.abs(d) > 1e-12)) return new Float64Array(k);
    for (let q = 0; q <= k; q++) M[p][q] /= d;
    for (let r = 0; r < k; r++) if (r !== p) { const f = M[r][p]; if (f) for (let q = 0; q <= k; q++) M[r][q] -= f * M[p][q]; }
  }
  return Float64Array.from(M, row => row[k]);
}

/**
 * Push limb `limb` out of the balls it is in contact with. targets: the full joint targets (degrees) with every other
 * limb where it is going this frame; pose(targets) -> segment matrices; clamp(targets) -> targets inside every range and
 * the combined-range rule; B0: the balls as last drawn (a pair already in contact there may stay so, not deeper).
 * floor (optional, { jointId: degrees }): a push never takes that joint below the value, or below where it already is
 * when that is lower (a thigh lying on the sofa is not pressed down through it).
 * Returns { targets (new object; only the limb's push joints differ), balls, depth (the deepest contact of the limb
 * left, mm; <= tol when cleared), iterations, moved (degrees per push joint) }. Pure (apart from the callbacks).
 */
export function solvePush({ model, limb, targets, pose, clamp, B0, floor = null, o = CONTACT }) {
  const joints = PUSH_JOINTS[limb];
  if (!joints) fail(`limb ${limb} cannot be pushed`);
  let q = { ...targets }, B = poseBalls(model, pose(q));
  let list = contactsOf(model, B, B0, { tol: o.tolMm, only: limb });
  const start = Object.fromEntries(joints.map(id => [id, q[id]]));
  const least = Object.fromEntries(joints.map(id => [id, floor && Number.isFinite(floor[id]) ? Math.min(floor[id], start[id]) : -Infinity]));
  let it = 0;
  const through = c => B0 && pairDepth(model, B0, c.k) > o.deepShare * Math.min(model.r[c.i], model.r[c.j]);
  list = list.filter(c => !through(c));
  for (; it < o.pushIters && list.length; it++) {
    // each contact: move the limb's ball out along the normal (from the other ball to it, as they stood on the last
    // frame, before this step: a direction that does not flip once the balls overlap) by its depth and the margin
    const rows = list.map(c => {
      const mine = model.limb[c.i] === limb ? c.i : c.j, other = mine === c.i ? c.j : c.i, R = B0 || B;
      let nx = R[3 * mine] - R[3 * other], ny = R[3 * mine + 1] - R[3 * other + 1], nz = R[3 * mine + 2] - R[3 * other + 2];
      if (!(Math.hypot(nx, ny, nz) > 1e-6)) { nx = B[3 * mine] - B[3 * other]; ny = B[3 * mine + 1] - B[3 * other + 1]; nz = B[3 * mine + 2] - B[3 * other + 2]; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      return { mine, n: [nx / nl, ny / nl, nz / nl], want: Math.min(c.depth, 40) + o.marginMm };
    });
    const A = rows.map(() => new Float64Array(joints.length)), b = rows.map(r => r.want);
    joints.forEach((id, p) => {
      const h = clamp({ ...q, [id]: q[id] + o.probeDeg })[id] !== q[id] || q[id] - o.probeDeg < least[id] ? o.probeDeg : -o.probeDeg;
      const Bp = poseBalls(model, pose({ ...q, [id]: q[id] + h }));
      rows.forEach((r, ri) => { const m = r.mine; A[ri][p] = ((Bp[3 * m] - B[3 * m]) * r.n[0] + (Bp[3 * m + 1] - B[3 * m + 1]) * r.n[1] + (Bp[3 * m + 2] - B[3 * m + 2]) * r.n[2]) / h; });
    });
    const dq = dampedSolve(A, b, joints.length, o.lambda);
    const next = { ...q };
    joints.forEach((id, p) => { next[id] = q[id] + Math.max(-o.stepDeg, Math.min(o.stepDeg, dq[p])); });
    const cl = clamp(next);
    let moved = false;
    for (const id of joints) {
      const v = Math.max(least[id], Math.max(start[id] - o.maxPushDeg, Math.min(start[id] + o.maxPushDeg, cl[id])));
      if (Math.abs(v - q[id]) > 1e-6) moved = true;
      q[id] = v;
    }
    if (!moved) break;
    B = poseBalls(model, pose(q));
    list = contactsOf(model, B, B0, { tol: o.tolMm, only: limb }).filter(c => !through(c));
  }
  return { targets: q, balls: B, depth: list.length ? list[0].depth : 0, iterations: it, moved: Object.fromEntries(joints.map(id => [id, q[id] - start[id]])) };
}

/** Largest share f (0..1) for which ok(f) holds, ok(0) taken as true: ok(1) first, then bisection (steps). */
export function holdShare(ok, steps = CONTACT.holdSteps) {
  if (ok(1)) return 1;
  let lo = 0, hi = 1;
  for (let s = 0; s < steps; s++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}

/** The recoil of a pushed limb, t seconds after its push ended: a share (-1..1) of CONTACT.recoil.deg along the push's
 * direction (back toward where it came from first), 0 after recoil.s. Pure. */
export function recoilShare(t, o = CONTACT.recoil) {
  if (!(t >= 0) || t >= o.s) return 0;
  return -Math.sin(2 * Math.PI * o.hz * t) * Math.exp(-4 * t / o.s);
}

/** The place of a contact (drawn mm): on the surface of ball j toward ball i, halfway into the overlap. */
export function contactPoint(model, B, i, j) {
  const dx = B[3 * i] - B[3 * j], dy = B[3 * i + 1] - B[3 * j + 1], dz = B[3 * i + 2] - B[3 * j + 2], d = Math.hypot(dx, dy, dz) || 1;
  const s = Math.max(0, Math.min(d, model.r[j] - Math.max(0, model.r[i] + model.r[j] - d) / 2)) / d;
  return [B[3 * j] + dx * s, B[3 * j + 1] + dy * s, B[3 * j + 2] + dz * s];
}
