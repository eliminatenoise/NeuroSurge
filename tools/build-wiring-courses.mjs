/** NeuroSurge tool (project code, CC0): lays the typical nerve COURSES of scene/src/ns-wiring-data.mjs over the body
 * exactly as the page prepares it, and writes them into that module's generated block.
 *
 * The atlas has no nerves. Each course here is a short list of points placed by a stated anatomical rule on things
 * the atlas does have: the rig's joint pivots, the bones' and muscles' own shapes (a nerve to a muscle ends in the
 * muscle's belly), the vertebral canal measured through the vertebra meshes, the brainstem meshes of the brain atlas
 * (which lie in the same frame as the skull), and the limb arteries' centre lines (the great nerves run with them).
 * The rule of every nerve is written beside its recipe and goes into the module with it (WIRING_GENERATED.rules).
 * Typical, simplified, hand-laid: not traced from a scan, not measured in anyone.
 *
 * It then checks every point: is it inside the body at rest (tools/wiring-geometry.mjs `enclosure`), and does a limb
 * nerve keep out of the long bones; points that fail are moved toward the bone they ride until they pass, and the
 * count of moved points is printed and stored.
 *
 * Usage:  node tools/build-wiring-courses.mjs            rebuild the generated block
 *         node tools/build-wiring-courses.mjs --check    exit 1 if the committed block differs from a fresh build
 *         node tools/build-wiring-courses.mjs --cache DIR   keep the prepared body's vertices in DIR (a folder
 *                                                       outside the repository) so a rerun is quick
 *         node tools/build-wiring-courses.mjs --dump FILE   also write the courses and the check table as JSON
 * RERUN IT after any change to the body's rest shape (ns-body BODY_BULK, ns-body-shape BODY_SHAPE, the rig's pivots):
 * tests/wiring-data.test.mjs runs this tool with --check and fails when the committed block is no longer what it builds. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWiringGeometry, makeGeometry, readSourceVertices } from './wiring-geometry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const MODULE = path.join(root, 'scene', 'src', 'ns-wiring-data.mjs');
const BEGIN = '// BEGIN GENERATED COURSES', END = '// END GENERATED COURSES';

const W = await import(MODULE);
const body = await loadWiringGeometry({ repo: root, cacheDir: opt('--cache') });
const G = makeGeometry(body);
const r1 = v => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------------------------------------------------
// small vector helpers (right side: lateral = -x, medial = +x; front = -y, back = +y; up = +z)
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const LAT = [-1, 0, 0], MED = [1, 0, 0], FRONT = [0, -1, 0], BACK = [0, 1, 0], UP = [0, 0, 1], DOWN = [0, 0, -1];
const mv = (p, ...steps) => { let q = p; for (let i = 0; i < steps.length; i += 2) q = add(q, steps[i].map(v => v * steps[i + 1])); return q; };

// --- finding things
const bone = n => G.find(n, { kind: 'bone' });
/** The right-side muscle meshes of one row of the muscle table (by the table's own name rule). */
const rightMeshes = canonical => {
  const out = G.list.filter(m => m.kind === 'muscle' && m.side === 'right' && m.names.some(n => { const r = W.nerveForMuscle(n); return r && (r.muscle === canonical || r.muscle.endsWith(` of ${canonical}`)); }));
  if (!out.length) throw new Error(`no right-side mesh for the muscle "${canonical}"`);
  return out;
};
const mus = (canonical, pick = null) => { const ms = rightMeshes(canonical); return pick ? ms.filter(m => m.names.some(n => n.includes(pick))) : ms; };
const along = (canonical, f, near = null, pick = null) => { const ms = mus(canonical, pick); return G.along(ms.length > 1 ? ms : ms[0], f, near); };
/** The middle of a bone's (or muscle's) cross-section at height z. Long shafts have few vertices, so the slab is widened
 * until it holds some, and the point is then slid along the mesh's own long axis to exactly the height asked for. */
const sliceWide = (ms, z, hw = 6) => {
  const list = Array.isArray(ms) ? ms : [ms];
  for (let w = hw; w <= 96; w *= 2) {
    const q = G.sliceZ(list, z, w);
    if (!q) continue;
    const ax = G.stat(list[0]).axis;
    return Math.abs(ax[2]) > 0.3 ? [q[0] + ax[0] * (z - q[2]) / ax[2], q[1] + ax[1] * (z - q[2]) / ax[2], z] : q;
  }
  throw new Error(`no slice at z ${z}`);
};
const sliceZ = (canonical, z, hw = 7, pick = null) => sliceWide(mus(canonical, pick), z, hw);
const cen = (canonical, pick = null) => { const ms = mus(canonical, pick), q = [0, 0, 0]; let n = 0; for (const m of ms) { const s = G.stat(m); q[0] += s.c[0] * s.n; q[1] += s.c[1] * s.n; q[2] += s.c[2] * s.n; n += s.n; } return q.map(v => v / n); };
/** A point in the muscle's own tissue near p (the mean of its 14 nearest vertices). */
const onMuscle = (canonical, p, pick = null) => { let best = null; for (const m of mus(canonical, pick)) { const s = G.snap(m, p, 14); if (!best || s.dist < best.dist) best = s; } return best.p; };
const boneSlice = (b, z, hw = 6) => sliceWide(b, z, hw);
const P = n => G.pivot(n);

// --- vessel centre lines carried to the rest frame, ordered from the heart outward
const vesselFile = JSON.parse(fs.readFileSync(path.join(root, 'packets', 'bodyparts3d-body-vessels-r1', 'BODY-VESSEL-CENTRELINES.json'), 'utf8'));
const sideOf = m => m.side === 'right' || /\bright\b/.test(m.names.join(' '));
function artery(name, proximal) {
  const v = vesselFile.vessels.find(x => x.name === name);
  if (!v) throw new Error(`no vessel "${name}"`);
  const pts = v.branches.flat().map(p => G.carry([p[0], p[1], p[2]], sideOf));
  // order along the vessel: start at the point nearest `proximal`, then always the nearest unused point
  const left = pts.slice(), out = [];
  let cur = left.reduce((b, p) => (dist(p, proximal) < dist(b, proximal) ? p : b), left[0]);
  while (left.length) { left.splice(left.indexOf(cur), 1); out.push(cur); if (!left.length) break; cur = left.reduce((b, p) => (dist(p, out[out.length - 1]) < dist(b, out[out.length - 1]) ? p : b), left[0]); }
  let len = 0; const cum = [0];
  for (let i = 1; i < out.length; i++) { len += dist(out[i], out[i - 1]); cum.push(len); }
  /** the point at fraction f of the vessel's length */
  const at = f => { const t = f * len; let i = 1; while (i < out.length - 1 && cum[i] < t) i++; const s = (t - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); return mix(out[i - 1], out[i], Math.min(1, Math.max(0, s))); };
  /** the point of the vessel at height z (the nearest point by z) */
  const atZ = z => out.reduce((b, p) => (Math.abs(p[2] - z) < Math.abs(b[2] - z) ? p : b), out[0]);
  return { pts: out, len, at, atZ };
}

// ---------------------------------------------------------------------------------------------------------------------
// The canal, the cord's stations and the root exits

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const VERT = [['C1', 'atlas'], ['C2', 'axis'], ...[3, 4, 5, 6, 7].map(i => [`C${i}`, `${ORD[i - 1]} cervical vertebra`]), ...ORD.map((o, i) => [`T${i + 1}`, `${o} thoracic vertebra`]), ...ORD.slice(0, 5).map((o, i) => [`L${i + 1}`, `${o} lumbar vertebra`])];
const pivV = new Map(W.VERTEBRAL_PIVOTS.map(([n, v]) => [v, P(n)]));
/** The height z of vertebral coordinate v (along the rig's pivots; below 24 down the sacrum, above 0 into the skull). */
function zOfV(v) {
  const vs = [...pivV.keys()].sort((a, b) => a - b);
  if (v <= 0) return pivV.get(0)[2] - v * (pivV.get(0)[2] - pivV.get(7)[2]) / 7;
  if (v >= 24) return pivV.get(24)[2] - (v - 24) * 68;
  let i = 0; while (vs[i + 1] < v) i++;
  const t = (v - vs[i]) / (vs[i + 1] - vs[i]);
  return pivV.get(vs[i])[2] + (pivV.get(vs[i + 1])[2] - pivV.get(vs[i])[2]) * t;
}
function vOfZ(z) { let lo = -2, hi = 26.5; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (zOfV(m) > z) lo = m; else hi = m; } return (lo + hi) / 2; }
const spineSegAtZ = z => W.vertebraSegmentAt(vOfZ(z));

const canal = new Map(); // v -> { p, half }
const canalNotes = [];
VERT.forEach(([label, name], k) => {
  const m = bone(name), s = G.stat(m), v = k + 0.5;
  // rays from the front to the back through this vertebra alone, at heights round its centroid: front wall of the
  // canal = where the ray leaves the vertebral body (the dens' place for the atlas), back wall = where it meets the arch
  const found = [];
  for (const dz of [0, -2, 2, -4, 4, -6, 6]) {
    const z = s.c[2] + dz, y0 = s.min[1] - 10, hits = G.rayHits([m], [s.c[0], y0, z], [0, 1, 0]).map(t => y0 + t);
    const iv = []; for (let i = 0; i + 1 < hits.length; i += 2) iv.push([hits[i], hits[i + 1]]);
    let best = null;
    for (let i = 0; i + 1 < iv.length; i++) { const a = iv[i][1], b = iv[i + 1][0], g = b - a; if (g >= 9 && g <= 36 && (!best || Math.abs((a + b) / 2 - s.c[1]) < Math.abs((best[0] + best[1]) / 2 - s.c[1]))) best = [a, b]; }
    if (!best) continue;
    // the atlas has no body: its ring holds the dens of the axis in front, so the cord lies in the back two thirds
    const yc = label === 'C1' ? best[0] + (best[1] - best[0]) * 0.64 : (best[0] + best[1]) / 2;
    const hl = G.rayHits([m], [s.c[0], yc, z], [-1, 0, 0])[0], hr = G.rayHits([m], [s.c[0], yc, z], [1, 0, 0])[0];
    found.push({ z, yc, half: hl && hr ? (hl + hr) / 2 : null });
  }
  if (!found.length) { canalNotes.push(`${label}: no canal found by rays; the vertebra's centroid is used`); canal.set(v, { p: s.c.slice(), half: 9 }); return; }
  found.sort((a, b) => a.yc - b.yc);
  const mid = found[Math.floor(found.length / 2)], halves = found.map(f => f.half).filter(h => h && h > 4 && h < 18).sort((a, b) => a - b);
  canal.set(v, { p: [s.c[0], mid.yc, s.c[2]], half: halves.length ? halves[Math.floor(halves.length / 2)] : 9 });
});
// between two vertebrae (the level of a joint): the mean of the stations above and below, at the joint's height
for (let v = 1; v <= 23; v++) { const a = canal.get(v - 0.5), b = canal.get(v + 0.5), q = mix(a.p, b.p, 0.5); canal.set(v, { p: [q[0], q[1], zOfV(v)], half: (a.half + b.half) / 2 }); }
{ // the top: the level of the skull's great opening (v = 0), and two stations inside the skull on the medulla's own axis
  const med = readSourceVertices(root, 'pov-demo-assets', 'FJ1831'); // the right half of the medulla oblongata
  const medAt = z => { const q = [0, 0, 0]; let n = 0; for (let i = 0; i < med.length; i += 3) if (Math.abs(med[i + 2] - z) < 3) { q[1] += med[i + 1]; q[2] += med[i + 2]; n++; } return n ? [0, q[1] / n, q[2] / n] : null; };
  const c05 = canal.get(0.5);
  const top = medAt(zOfV(0)) || c05.p;
  canal.set(0, { p: [c05.p[0], (top[1] + c05.p[1]) / 2, zOfV(0)], half: c05.half });
  for (const v of [-0.5, -1]) { const q = medAt(zOfV(v)); if (q) canal.set(v, { p: [c05.p[0], q[1], q[2]], half: 8 }); }
}
{ // the sacrum: its canal lies just in front of the bone's back surface (a ray from behind meets the back surface)
  const sac = bone('sacrum'), s = G.stat(sac), l5 = canal.get(23.5);
  const lastY = { v: l5.p[1] };
  for (const v of [24, 24.5, 25, 25.5, 26]) {
    const z = zOfV(v), y0 = s.max[1] + 20, hit = G.rayHits([sac], [s.c[0], y0, z], [0, -1, 0])[0];
    const y = hit ? y0 - hit - 9 : lastY.v;
    lastY.v = y;
    canal.set(v, { p: [s.c[0], v === 24 ? (y + l5.p[1]) / 2 : y, z], half: 9 });
  }
}
const canalAt = v => { const ks = [...canal.keys()].sort((a, b) => a - b); if (v <= ks[0]) return canal.get(ks[0]).p; for (let i = 0; i + 1 < ks.length; i++) if (v <= ks[i + 1]) { const t = (v - ks[i]) / (ks[i + 1] - ks[i]); return mix(canal.get(ks[i]).p, canal.get(ks[i + 1]).p, t); } return canal.get(ks[ks.length - 1]).p; };
const halfAt = v => { const ks = [...canal.keys()].sort((a, b) => a - b); let b = ks[0]; for (const k of ks) if (Math.abs(k - v) < Math.abs(b - v)) b = k; return canal.get(b).half; };

/** Is p inside the closed surface of mesh m (parity of a slightly skew ray)? */
const insideMesh = (m, p) => G.rayHits([m], p, [0.9017, 0.3106, 0.3006]).length % 2 === 1;
const vertebraNear = v => { const out = []; for (const k of [Math.floor(v) - 1, Math.floor(v)]) if (VERT[k]) out.push(bone(VERT[k][1])); if (v >= 23) out.push(bone('sacrum')); if (v < 1) out.push(bone('occipital bone')); return out; };

const exits = {}, exitNotes = [];
for (const level of W.CORD_LEVELS) {
  const v = W.ROOT_EXIT_V[level];
  if (v <= 24) {
    // the side opening between two vertebrae: beside the canal, a little in front of its centre, just outside its wall
    // (the canal's measured half-width there, at most 13 mm, plus 4 mm); where that spot falls inside one of the two
    // vertebrae (or in any bone, on either side: the left side's opening is its mirror), the nearest free spot round it
    // (searched in steps of 2 to 3 mm, outward first)
    const c = canalAt(v), h = Math.min(13, halfAt(v));
    const nominal = [c[0] - (h + 4), c[1] - 2, c[2]], near = vertebraNear(v);
    const tries = [];
    for (const dx of [0, -2, -4, -6, -8, -10, -12]) for (const dy of [0, -3, 3, -6, 6]) for (const dz of [0, -3, 3, -6, 6]) tries.push([dx, dy, dz]);
    tries.sort((a, b) => Math.hypot(...a) - Math.hypot(...b) || a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    let p = nominal, moved = false;
    for (const d of tries) { const q = add(nominal, d); if (!near.some(m => insideMesh(m, q)) && !G.boneAt(q) && !G.boneAt([-q[0], q[1], q[2]])) { p = q; moved = Math.hypot(...d) > 0; break; } }
    if (moved) exitNotes.push(`${level}: moved ${r1(dist(p, nominal))} mm out of bone`);
    exits[level] = p;
  } else {
    // the openings in the front of the sacrum: on its front surface, 22 mm from the midline narrowing to 16 mm
    const sac = bone('sacrum'), s = G.stat(sac), z = zOfV(v), k = Number(level.slice(1)), x = s.c[0] - (24 - 2 * k);
    const y0 = s.min[1] - 20, hit = G.rayHits([sac], [x, y0, z], [0, 1, 0])[0];
    exits[level] = [x, hit ? y0 + hit - 1.5 : canalAt(v)[1] - 15, z];
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Landmarks (right side)

const sh = P('r_glenohumeral'), el = P('r_elbow'), wr = P('r_wrist'), hip = P('r_hip'), kn = P('r_knee'), an = P('r_ankle');
const humerus = bone('right humerus'), ulna = bone('right ulna'), radius = bone('right radius'), femur = bone('right femur'), tibia = bone('right tibia'), fibula = bone('right fibula');
const hipBone = bone('right hip bone'), mandible = bone('mandible'), scapula = bone('right scapula');
const armZ = f => sh[2] + (el[2] - sh[2]) * f;          // a height along the upper arm (0 shoulder, 1 elbow)
const foreZ = f => el[2] + (wr[2] - el[2]) * f;        // along the forearm (0 elbow, 1 wrist)
const thighZ = f => hip[2] + (kn[2] - hip[2]) * f;     // along the thigh (0 hip, 1 knee)
const shinZ = f => kn[2] + (an[2] - kn[2]) * f;        // along the shin (0 knee, 1 ankle)
const medEpicondyle = G.extreme(humerus, MED, (x, y, z) => z < el[2] + 22);
const latEpicondyle = G.extreme(humerus, LAT, (x, y, z) => z < el[2] + 22);
const fibHead = G.along(fibula, 0.02), fibNeckZ = G.stat(fibula).max[2] - 30;
const greaterTrochanter = G.extreme(femur, LAT, (x, y, z) => z > hip[2] - 45);
const ischialTuberosity = G.extreme(hipBone, [0, 0.45, -0.9], (x, y, z) => y > -70);
const pisiform = G.stat(bone('right pisiform')).c, capitate = G.stat(bone('right capitate')).c, hamate = G.stat(bone('right hamate')).c;
const medMalleolus = G.extreme(tibia, [0.3, 0, -1]);
const digPost = G.list.find(m => m.names.includes('posterior belly of right digastric')), digAnt = G.list.find(m => m.names.includes('anterior belly of right digastric'));
const styloid = G.along(G.find('right stylohyoid'), 0.03), mastoidNotch = G.along(digPost, 0.03);
const stylomastoid = mv(mix(styloid, mastoidNotch, 0.5), UP, 2);
const ramusBack = G.extreme(mandible, BACK, (x, y, z) => x < -30 && Math.abs(z - 1476) < 5);
const mandAngle = G.extreme(mandible, [0, 0.7, -0.7], (x, y, z) => x < -30);
const condyle = G.extreme(mandible, UP, (x, y, z) => x < -30 && y > -105);
const brain = id => readSourceVertices(root, 'pov-demo-assets', id);
const stemSlice = (id, z) => { const A = brain(id); const q = [0, 0, 0]; let n = 0, xmin = 1e9, ymin = 1e9; for (let i = 0; i < A.length; i += 3) if (Math.abs(A[i + 2] - z) < 3) { q[0] += A[i]; q[1] += A[i + 1]; q[2] += A[i + 2]; n++; xmin = Math.min(xmin, A[i]); ymin = Math.min(ymin, A[i + 1]); } if (!n) throw new Error(`no brainstem slice ${id} at ${z}`); return { c: q.map(v => v / n), xmin, ymin }; };
const MEDULLA = 'FJ1831', PONS = 'FJ1822', MIDBRAIN = 'FJ1817'; // the right halves

// ---------------------------------------------------------------------------------------------------------------------
// The recipes. course(id, rule, points): id is the nerve's name without its side (the module's ids are `r_` + id);
// points are [x, y, z] or { p, seg } (seg given where the nearest bone would be the wrong thing to ride). A branch's
// first point must BE a point of its parent's course: `from(parent, index)`.

const courses = {}, rules = {}, twigFrom = {};
const from = (parent, index) => { const c = courses[parent]; if (!c) throw new Error(`parent course ${parent} not laid yet`); const i = index < 0 ? c.length + index : index; return { p: c[i].p.slice(), seg: c[i].seg, shared: true, ref: c[i], surface: c[i].surface, passage: c[i].passage }; };
/** opts.twigFrom: the first point of the course a twig to a muscle may leave from (a cranial nerve gives no twig
 * inside the skull); opts.twigTo: the last (the facial nerve's own twigs leave before it reaches the parotid gland). */
function course(id, rule, points, opts = null) {
  if (!W.NERVE_TRUNKS[`r_${id}`]) throw new Error(`course for an unknown trunk ${id}`);
  if (opts && opts.twigFrom) twigFrom[id] = opts.twigTo ? [opts.twigFrom, opts.twigTo] : [opts.twigFrom];
  courses[id] = points.map(q => (Array.isArray(q) ? { p: q.slice(0, 3), seg: null } : { p: q.p.slice(0, 3), seg: q.seg || null, shared: Boolean(q.shared), ref: q.ref || null, surface: Boolean(q.surface), passage: Boolean(q.passage), wind: Boolean(q.wind) }));
  rules[id] = rule;
}
const S = (p, seg) => ({ p, seg });
/** A point laid on purpose inside one of the skull's own passages (a canal or an opening a nerve really runs through):
 * the bone check leaves it and the pieces that end at it alone. */
const B = (p, seg = 'skull') => ({ p, seg, passage: true });
/** A stretch of a nerve that runs under the skin: the waypoints are joined by pieces of at most `maxChord` mm and every
 * point is put on the body's outer surface as seen from the centre c (G.surfaceOut), `lift` mm outside it. The first
 * waypoint (a shared branch point) is kept as it is. seg(p) gives each point's segment. (22 November: 14 mm, was 28: a
 * 28 mm chord bridged the temple's hollow up to 8 mm off the surface.) */
function surfaceRun(points, c, seg, { maxChord = 14, lift = 2 } = {}) {
  const pos = q => (Array.isArray(q) ? q : q.p), out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = pos(points[i - 1]), b = pos(points[i]), n = Math.max(1, Math.ceil(dist(a, b) / maxChord));
    for (let k = 1; k <= n; k++) { const q = G.surfaceOut(mix(a, b, k / n), c, lift); out.push({ p: q, seg: typeof seg === 'function' ? seg(q) : seg, surface: true }); }
  }
  return out;
}

// ----- the arm
const axillaryArtery = artery('right axillary artery', [-60, -100, 1340]);
const brachialArtery = artery('right brachial artery', sh);
const ulnarArtery = artery('right ulnar artery', el);
{
  const c6 = exits.C6, c7 = exits.C7;
  const scal = mix(sliceZ('scalenus anterior', c7[2] - 8), sliceZ('scalenus medius', c7[2] - 8), 0.5);
  const a0 = axillaryArtery.at(0), a1 = axillaryArtery.at(0.4), a2 = axillaryArtery.at(0.75), a3 = axillaryArtery.at(1);
  course('brachial_plexus', 'Drawn as one bundle. Its roots (C5 to T1) meet between the front and middle scalene muscles at about the level of the seventh cervical vertebra; the bundle passes over the first rib behind the collar bone to the start of the axillary artery, then runs with that artery\'s centre line into the armpit (the plexus\'s cords lie round that artery).',
    // (the roots' meeting point is set by the openings of C6 and C7; it is held 3 mm lower since the C7 opening moved
    // 3 mm up to clear the left side's bone, so the lowest roots still reach it without climbing)
    [mv(mix(mix(c6, c7, 0.6), scal, 0.75), UP, -3), mv(mix(scal, a0, 0.5), UP, 6, BACK, 3), mv(a0, BACK, 3, UP, 3), mv(a1, BACK, 3), mv(a2, BACK, 2), a3]);
}
{
  const bic = z => sliceZ('biceps brachii', z), bra = z => sliceZ('brachialis', z);
  course('musculocutaneous', 'Leaves the bundle high in the armpit, passes through coracobrachialis, then runs down the arm between biceps and brachialis to the outer side of the elbow.',
    [from('brachial_plexus', 4), along('coracobrachialis', 0.45, sh), mix(bic(armZ(0.5)), bra(armZ(0.55)), 0.5), mix(bic(armZ(0.72)), bra(armZ(0.72)), 0.5), mv(mix(bra(armZ(0.93)), sliceZ('brachioradialis', armZ(0.95)), 0.45), FRONT, 3)]);
  const pt = along('pronator teres', 0.45, el);
  const fds = z => sliceZ('flexor digitorum superficialis', z), fdp = z => sliceZ('flexor digitorum profundus', z);
  const b = f => brachialArtery.at(f);
  course('median', 'Formed in the armpit in front of the axillary artery; follows the brachial artery\'s centre line down the inner side of the arm to the front of the elbow; passes between the two heads of pronator teres; runs down the middle of the forearm between the surface and deep finger benders; goes through the carpal tunnel (in front of the capitate bone) into the palm.',
    [from('brachial_plexus', 5), mv(b(0.3), FRONT, 3), mv(b(0.65), FRONT, 3), mv(b(1), FRONT, 2), S(pt, 'r_forearm'), S(mix(fds(foreZ(0.45)), fdp(foreZ(0.45)), 0.5), 'r_forearm'), S(mix(fds(foreZ(0.7)), fdp(foreZ(0.7)), 0.5), 'r_forearm'),
      S(mix(fds(foreZ(0.9)), fdp(foreZ(0.9)), 0.5), 'r_forearm'), mv(capitate, FRONT, 10), mv(mix(capitate, P('r_middle_mcp'), 0.45), FRONT, 9)]);
  const io = z => mix(boneSlice(ulna, z), boneSlice(radius, z), 0.5);
  // on the membrane a little nearer the ulna (a third of the way across): the radius sweeps over the membrane's
  // radial half as the forearm turns
  const ioU = z => mix(boneSlice(ulna, z), boneSlice(radius, z), 0.33);
  course('anterior_interosseous', 'Leaves the median nerve and runs down on the membrane between the two forearm bones, a third of the way across from the ulna, between the long thumb bender and the deep finger bender, to the square pronator muscle above the wrist. All its points ride the ulna (r_forearm), as the median nerve\'s forearm points do. Drawn leaving the median nerve near the middle of the forearm, lower than taught (a few centimetres below the elbow, just below pronator teres): from up there its first straight piece was crossed by the radius as the forearm turned (25 mm of it inside the radius in the game\'s own start, the forearm fully turned).',
    [from('median', 5), S(mv(ioU(foreZ(0.62)), FRONT, 6), 'r_forearm'), S(onMuscle('pronator quadratus', cen('pronator quadratus')), 'r_forearm')]);
  course('median_recurrent', 'A short twig that turns back from the median nerve as it leaves the carpal tunnel, into the muscles of the ball of the thumb.',
    [from('median', 8), mix(cen('abductor pollicis brevis'), cen('opponens pollicis'), 0.5)]);
  const hum = z => boneSlice(humerus, z);
  course('ulnar', 'Runs down the inner side of the arm beside the brachial artery to mid-arm, passes to the back, goes behind the inner knob of the elbow (the "funny bone"), enters the forearm between the two heads of flexor carpi ulnaris, runs down with the ulnar artery\'s centre line, and reaches the hand beside the pisiform bone.',
    [from('brachial_plexus', 5), mv(b(0.35), MED, 2, BACK, 3), mv(mix(b(0.8), hum(armZ(0.6)), 0.25), MED, 6, BACK, 8), mv(medEpicondyle, BACK, 7, LAT, 3, UP, 8), mv(medEpicondyle, BACK, 6, LAT, 4, DOWN, 10),
      along('flexor carpi ulnaris', 0.2, el), ulnarArtery.atZ(foreZ(0.5)), ulnarArtery.atZ(foreZ(0.78)), mv(pisiform, LAT, 7, UP, 2), mv(mix(pisiform, hamate, 0.6), FRONT, 6, DOWN, 6)]);
  const mc = (n, f) => G.along(bone(`right ${n} metacarpal bone`), f, wr);
  course('ulnar_deep', 'Leaves the ulnar nerve beside the pisiform, hooks round the hamate bone and crosses the palm deep to the finger tendons, along the bases of the hand bones, to the muscle that draws the thumb in.',
    [from('ulnar', -1), mv(mc('fifth', 0.25), FRONT, 5), mv(mc('fourth', 0.3), FRONT, 6), mv(mc('third', 0.3), FRONT, 6), mv(mc('second', 0.32), FRONT, 5), onMuscle('adductor pollicis', cen('adductor pollicis'))]);
  course('radial', 'Leaves the armpit behind the artery, passes between the heads of triceps, winds behind the humerus in its spiral groove from the inner to the outer side at mid-arm, comes forward through the outer wall of the arm and lies in front of the outer knob of the elbow, between brachialis and brachioradialis, where it divides.',
    [from('brachial_plexus', 5), mv(hum(armZ(0.3)), MED, 9, BACK, 14), mv(hum(armZ(0.45)), MED, 2, BACK, 15), mv(hum(armZ(0.58)), LAT, 9, BACK, 11), mv(hum(armZ(0.72)), LAT, 15, BACK, 1), mv(hum(armZ(0.86)), LAT, 13, FRONT, 9),
      mv(latEpicondyle, FRONT, 13, MED, 5, DOWN, 2)]);
  course('posterior_interosseous', 'The radial nerve\'s deep branch: it winds round the neck of the radius through the supinator muscle to the back of the forearm, runs down between the surface and deep layers of the muscles that straighten the fingers and thumb, then on the membrane between the two bones to the back of the wrist.',
    [from('radial', -1), onMuscle('supinator', mv(boneSlice(radius, foreZ(0.12)), LAT, 8, BACK, 4)), mix(sliceZ('extensor digitorum', foreZ(0.35)), sliceZ('abductor pollicis longus', foreZ(0.4)), 0.5),
      mix(sliceZ('extensor digitorum', foreZ(0.58)), sliceZ('extensor pollicis longus', foreZ(0.58)), 0.5), mv(io(foreZ(0.8)), BACK, 7), mv(io(foreZ(0.94)), BACK, 7)]);
  course('axillary', 'Leaves the back of the bundle, passes backward under the shoulder joint, winds round the back of the neck of the humerus and ends on the deep side of the deltoid.',
    [from('brachial_plexus', 5), mv(sh, MED, 4, BACK, 16, DOWN, 46), mv(hum(sh[2] - 56), BACK, 17), mv(hum(sh[2] - 60), LAT, 19, BACK, 6), onMuscle('deltoid', mv(hum(sh[2] - 62), LAT, 26, FRONT, 4), 'acromial')]);
  const supra = mus('supraspinatus')[0], infra = mus('infraspinatus')[0];
  course('suprascapular', 'Leaves the upper part of the bundle above the collar bone, passes back through the notch in the upper edge of the shoulder blade into supraspinatus, then round the outer edge of the blade\'s spine into infraspinatus.',
    // (one point where it passes through the notch and under supraspinatus, then round the spine: the earlier two points
    // in supraspinatus, the inner one first, made it run in, out and in again)
    [from('brachial_plexus', 1), G.along(supra, 0.42, sh), mv(mix(sh, G.along(infra, 0.25, sh), 0.75), BACK, 4), G.along(infra, 0.45, sh)].map((q, i) => (i ? S(q, 'r_girdle') : q)));
  course('dorsal_scapular', 'Leaves the highest root of the bundle, runs back through the middle scalene and down under levator scapulae along the inner edge of the shoulder blade, under the two rhomboid muscles.',
    [from('brachial_plexus', 0), S(along('levator scapulae', 0.72), 'r_girdle'), S(onMuscle('rhomboid minor', cen('rhomboid minor')), 'r_girdle'), S(onMuscle('rhomboid major', along('rhomboid major', 0.5)), 'r_girdle')]);
  const ser = mus('serratus anterior')[0];
  const serLat = z => mv(G.extreme(ser, LAT, (x, y, zz) => Math.abs(zz - z) < 6), MED, 3);
  course('long_thoracic', 'Leaves the roots of the bundle, runs down behind it and then straight down the side of the chest on the outer surface of serratus anterior.',
    [from('brachial_plexus', 0), mix(courses.brachial_plexus[0].p, serLat(1295), 0.55), serLat(1295), serLat(1245), serLat(1195), serLat(1150)]);
  course('lateral_pectoral', 'Leaves the bundle in the armpit and passes forward to the deep side of the upper part of pectoralis major.',
    [from('brachial_plexus', 3), mix(courses.brachial_plexus[3].p, onMuscle('pectoralis major', cen('pectoralis major', 'clavicular'), 'clavicular'), 0.55), onMuscle('pectoralis major', cen('pectoralis major', 'clavicular'), 'clavicular')]);
  course('medial_pectoral', 'Leaves the bundle in the armpit, passes forward through pectoralis minor and ends in the lower part of pectoralis major.',
    [from('brachial_plexus', 4), onMuscle('pectoralis minor', along('pectoralis minor', 0.35)), onMuscle('pectoralis major', mix(along('pectoralis minor', 0.45), cen('pectoralis major', 'sternocostal'), 0.6), 'sternocostal')]);
  const sub = mus('subscapularis')[0];
  course('upper_subscapular', 'A short nerve from the back of the bundle into the upper part of subscapularis.',
    [from('brachial_plexus', 4), G.snap(sub, mv(G.along(sub, 0.35, sh), UP, 12), 14).p]);
  course('lower_subscapular', 'A short nerve from the back of the bundle into the lower part of subscapularis and on to teres major.',
    [from('brachial_plexus', 4), G.snap(sub, mv(G.along(sub, 0.4, sh), DOWN, 22), 14).p, onMuscle('teres major', along('teres major', 0.45, sh))]);
  const lat = mus('latissimus dorsi')[0];
  course('thoracodorsal', 'Leaves the back of the bundle and runs down the back wall of the armpit on the deep side of latissimus dorsi.',
    [from('brachial_plexus', 4), S(G.snap(lat, [-148, -52, 1228], 14).p, 'r_girdle'), G.snap(lat, [-138, -38, 1180], 14).p, G.snap(lat, [-126, -26, 1130], 14).p]);
}

// ----- the leg
const femoralArtery = artery('right femoral artery', hip), poplitealArtery = artery('right popliteal artery', hip);
const postTibial = artery('right posterior tibial artery', kn), antTibial = artery('right anterior tibial artery', kn), dorsalisPedis = artery('right dorsalis pedis artery', an);
{
  const psoas = mus('psoas major')[0], iliacus = mus('iliacus')[0];
  const ps = z => sliceWide(psoas, z, 7);
  course('lumbar_plexus', 'Drawn as one bundle inside psoas major, beside the lumbar vertebrae: from the level where the first lumbar nerve leaves the column down to the level of the fifth lumbar vertebra. (The real plexus forms inside this muscle from L1 to L4, with a twig of T12.)',
    [mix(exits.L1, ps(exits.L1[2] - 6), 0.6), mix(exits.L2, ps(exits.L2[2] - 6), 0.65), mix(exits.L3, ps(exits.L3[2] - 6), 0.7), mix(exits.L4, ps(exits.L4[2] - 6), 0.75), ps(exits.L5[2] + 4)].map(p => S(p, spineSegAtZ(p[2]))));
  const fa0 = femoralArtery.at(0);
  course('femoral', 'Comes out of the outer edge of psoas major, runs down in the groove between psoas and iliacus, passes under the groin ligament on the outer side of the femoral artery, breaks into its muscle branches just below the groin, and its longest branches run on beside the femoral artery to mid-thigh.',
    [from('lumbar_plexus', 3), S(mix(ps(905), sliceWide(iliacus, 905, 7), 0.5), 'pelvis'), S(mix(ps(865), sliceWide(iliacus, 865, 7), 0.45), 'pelvis'), S(mv(fa0, LAT, 12, BACK, 2), 'pelvis'), mv(femoralArtery.at(0.1), LAT, 11), mv(femoralArtery.at(0.3), LAT, 7), mv(femoralArtery.at(0.5), LAT, 5)]);
  const oe = mus('obturator externus')[0], oi = mus('obturator internus')[0];
  const canalTop = mv(mix(G.extreme(oe, UP), G.extreme(oi, UP), 0.5), DOWN, 5);
  course('obturator', 'Comes out of the inner edge of psoas major at the brim of the pelvis, runs forward along the side wall of the pelvis, leaves it through the canal at the top of the obturator opening and runs down the inner thigh between the adductor muscles.',
    [from('lumbar_plexus', 3), S(mv(ps(exits.L5[2] - 8), MED, 12), 'pelvis'), S(mix(mv(ps(exits.L5[2] - 8), MED, 12), canalTop, 0.55), 'pelvis'), S(canalTop, 'pelvis'), S(mix(along('adductor longus', 0.25, hip), along('adductor brevis', 0.35, hip), 0.5), 'r_thigh'), S(mix(along('adductor longus', 0.6, hip), sliceZ('gracilis', thighZ(0.45)), 0.5), 'r_thigh')]);
  course('iliohypogastric', 'Leaves the top of the lumbar bundle, crosses the back wall of the belly in front of quadratus lumborum and runs forward in the belly wall just above the hip bone\'s crest, between the two inner flat muscles.',
    [from('lumbar_plexus', 0), S(onMuscle('quadratus lumborum', along('quadratus lumborum', 0.6)), 'l3'), S(onMuscle('transversus abdominis', [-120, -75, 960]), 'pelvis'), S(onMuscle('internal oblique', [-125, -130, 945]), 'pelvis'), S(onMuscle('internal oblique', [-62, -172, 868]), 'pelvis')]);

  const pir = mus('piriformis')[0];
  const pirAt = f => G.along(pir, f, [0, -25, 860]);  // 0 at the sacrum, 1 at the thigh bone
  course('sacral_plexus', 'Drawn as one bundle on the back wall of the pelvis: the trunk from L4 and L5 comes down over the wing of the sacrum and meets the sacral nerves in front of their openings and of piriformis; the bundle converges on the lower edge of that muscle at the great notch of the hip bone, where its nerves leave the pelvis. A point on its lower edge in front of the fourth sacral opening is where the upper branch of S4 meets it (joining S3 there).',
    [mv(mix(exits.L5, exits.S1, 0.55), LAT, 8, FRONT, 4), mv(exits.S1, LAT, 9, FRONT, 6), mv(exits.S2, LAT, 14, FRONT, 6), mv(exits.S3, LAT, 18, FRONT, 6), mv(exits.S4, LAT, 30, FRONT, 8, UP, 4), mv(pirAt(0.5), FRONT, 5, DOWN, 11), mv(pirAt(0.6), DOWN, 13)].map(p => S(p, 'pelvis')));
  const gmed = mus('gluteus medius')[0], gmin = mus('gluteus minimus')[0], gmax = mus('gluteus maximus')[0];
  course('superior_gluteal', 'Leaves the pelvis ABOVE piriformis and runs forward between gluteus medius and gluteus minimus toward the tensor of the fascia lata.',
    [from('sacral_plexus', 1), S(mv(pirAt(0.55), UP, 15), 'pelvis'), S(mix(G.stat(gmed).c, G.stat(gmin).c, 0.6), 'pelvis'), S(mix(G.along(gmin, 0.5), along('tensor fasciae latae', 0.25, hip), 0.5), 'pelvis')]);
  course('inferior_gluteal', 'Leaves the pelvis BELOW piriformis and turns straight back into the deep side of gluteus maximus.',
    [from('sacral_plexus', -1), S(G.snap(gmax, mv(courses.sacral_plexus[courses.sacral_plexus.length - 1].p, BACK, 26, DOWN, 6), 14).p, 'pelvis')]);
  course('nerve_to_obturator_internus', 'Leaves the pelvis below piriformis, crosses the spine of the ischium and re-enters to reach obturator internus; it also gives the twig to the upper gemellus.',
    [from('sacral_plexus', -1), S(onMuscle('gemellus superior', cen('gemellus superior')), 'pelvis'), { ...S(onMuscle('obturator internus', mix(cen('gemellus superior'), cen('obturator internus'), 0.6)), 'pelvis'), wind: true }]);
  course('nerve_to_quadratus_femoris', 'Leaves the pelvis below piriformis and runs down under the sciatic nerve and the gemelli to quadratus femoris; it also gives the twig to the lower gemellus.',
    [from('sacral_plexus', -1), S(onMuscle('gemellus inferior', cen('gemellus inferior')), 'pelvis'), S(onMuscle('quadratus femoris', mix(cen('quadratus femoris'), ischialTuberosity, 0.4)), 'pelvis')]);
  const ham = z => sliceWide([...mus('biceps femoris', 'long head'), ...mus('semitendinosus'), ...mus('semimembranosus')], z, 8);
  const fem = z => boneSlice(femur, z, 8);
  const sci = (z, t = 0.62) => mix(fem(z), ham(z), t);
  // behind the hip joint, 30 mm behind and 30 mm below its centre, between the sitting bone and the great knob of the
  // thigh bone; it rides the pelvis. (On the thigh, the piece from the pelvis's notch to it passed 15 to 20 mm through
  // the hip bone and the thigh bone's neck with the hip bent 100 degrees; on the pelvis, nothing passes through bone, and
  // the next piece stretches with the bent hip as the real nerve does.)
  const behindQF = [hip[0] - 12, hip[1] + 30, hip[2] - 30];
  course('sciatic', 'Leaves the pelvis below piriformis, runs down midway between the sitting bone and the great knob at the top of the thigh bone (behind quadratus femoris), then down the back of the thigh behind adductor magnus and in front of the long head of biceps femoris, to the top of the hollow behind the knee, where it divides. (A third of the way up from the knee is the usual place of the division; it can be higher.)',
    [from('sacral_plexus', -1), S(behindQF, 'pelvis'), S(sci(thighZ(0.11), 0.78), 'r_thigh'), S(sci(thighZ(0.22), 0.72), 'r_thigh'), S(sci(thighZ(0.36)), 'r_thigh'), S(sci(thighZ(0.5)), 'r_thigh'), S(sci(thighZ(0.66)), 'r_thigh')]);
  const pa = f => mv(poplitealArtery.at(f), BACK, 6), pt = z => postTibial.atZ(z);
  course('tibial', 'The sciatic nerve\'s larger half: straight down the middle of the hollow behind the knee, behind the popliteal artery, then deep in the calf with the posterior tibial artery\'s centre line, round behind the inner ankle knob with that artery and under it into the sole, where it divides into the two nerves of the sole.',
    [from('sciatic', -1), pa(0.3), pa(0.6), pa(0.95), pt(shinZ(0.3)), pt(shinZ(0.5)), pt(shinZ(0.7)), pt(shinZ(0.88)), pt(an[2] + 22), pt(an[2] - 11), postTibial.at(1)]);
  course('medial_plantar', 'Runs forward along the big-toe side of the sole between the muscle that spreads the big toe and the short toe bender.',
    [from('tibial', -1), mix(along('abductor hallucis', 0.4, an), along('flexor digitorum brevis', 0.3, an), 0.5), mix(along('abductor hallucis', 0.7, an), cen('flexor hallucis brevis'), 0.5)]);
  const cuboid = G.stat(bone('right cuboid bone')).c, mt5 = bone('right fifth metatarsal bone');
  course('lateral_plantar', 'Crosses the sole slantwise under the short toe bender toward the little-toe side, then runs forward along the outer side of the foot bones.',
    [from('tibial', -1), mv(mix(courses.tibial[courses.tibial.length - 1].p, cuboid, 0.55), DOWN, 8), mv(cuboid, DOWN, 13), mv(G.along(mt5, 0.5, an), DOWN, 8, MED, 6)]);
  const bfl = mus('biceps femoris', 'long head')[0];
  course('common_fibular', 'The sciatic nerve\'s smaller half: slants outward along the inner edge of the biceps femoris tendon to behind the head of the fibula, winds forward round the outer side of the neck of that bone (where it lies just under the skin) and divides.',
    [from('sciatic', -1), mix(courses.sciatic[courses.sciatic.length - 1].p, mv(fibHead, BACK, 10, UP, 30), 0.5), S(mv(fibHead, BACK, 11, UP, 8), 'r_shank'), mv(boneSlice(fibula, fibNeckZ + 9), LAT, 7, BACK, 10), mv(boneSlice(fibula, fibNeckZ - 2), LAT, 10, BACK, 1), mv(boneSlice(fibula, fibNeckZ - 16), LAT, 8, FRONT, 6)]);
  const at = z => antTibial.atZ(z);
  course('deep_fibular', 'Passes forward through the top of the muscles on the front of the shin, then runs down on the membrane between the two shin bones with the anterior tibial artery\'s centre line, between tibialis anterior and the long toe lifters, over the front of the ankle with that artery to the top of the foot.',
    [from('common_fibular', -1), at(shinZ(0.22)), at(shinZ(0.4)), at(shinZ(0.6)), at(shinZ(0.76)), at(shinZ(0.88)), at(shinZ(0.98)), dorsalisPedis.at(0.45), dorsalisPedis.at(1)]);
  const fl = z => sliceZ('fibularis longus', z), fb = z => sliceZ('fibularis brevis', z);
  course('superficial_fibular', 'Runs down the outer side of the shin between fibularis longus and fibularis brevis; in the lower third it comes to the surface (from there on it only serves the skin).',
    [from('common_fibular', -1), mix(fl(shinZ(0.25)), boneSlice(fibula, shinZ(0.25)), 0.5), mix(fl(shinZ(0.45)), fb(shinZ(0.45)), 0.5), mix(fb(shinZ(0.62)), sliceZ('extensor digitorum longus', shinZ(0.62)), 0.4)]);
}

// ----- the neck
{
  const e = l => exits[l];
  course('cervical_plexus', 'Drawn as one bundle beside the upper cervical vertebrae, just outside the openings where C2, C3 and C4 leave the column, under sternocleidomastoid.',
    [mv(e('C2'), LAT, 7, FRONT, 4), mv(e('C3'), LAT, 9, FRONT, 5), mv(e('C4'), LAT, 10, FRONT, 6)].map(p => S(p, 'cervical')));
  course('cervical_muscular', 'Short twigs from the front branches of the cervical nerves straight into the muscles they lie against: drawn as one short run down the side of the cervical column between longus colli in front and the scalene muscles at the side.',
    [mv(e('C3'), LAT, 3, FRONT, 6), mv(e('C5'), LAT, 4, FRONT, 6), mv(e('C7'), LAT, 6, FRONT, 5), mv(e('C8'), LAT, 9, FRONT, 4)].map(p => S(p, 'cervical')));
  course('phrenic', 'Formed at the level of C4, runs down the front of the front scalene muscle, enters the chest behind the inner end of the collar bone and runs down beside the heart to the diaphragm. (The rig has no diaphragm: the course ends where its dome would be.)',
    [from('cervical_plexus', 2), S(mv(along('scalenus anterior', 0.5), FRONT, 5), 'cervical'), S(mv(along('scalenus anterior', 0.92), FRONT, 6, MED, 8), 'thorax'), S([-34, -108, 1305], 't3'), S([-46, -112, 1245], 't6'), S([-50, -108, 1190], 't8'), S([-46, -102, 1152], 't9')]);
  course('ansa_cervicalis', 'A loop on the great vessels of the neck, from C1 to C3: it hangs down to about the level of the voice box and sends twigs forward into the strap muscles.',
    [from('cervical_plexus', 1), S([-31, -98, 1418], 'cervical'), S(mix(along('sternohyoid', 0.45), along('omohyoid', 0.25, [-17, -123, 1421]), 0.5), 'cervical'), S(mix(along('sternohyoid', 0.7), along('sternothyroid', 0.6), 0.5), 'cervical')]);
}

// ----- the cranial nerves (inside the body's own skull; the brainstem's place is the brain atlas's own coordinates)
{
  const K = (p) => S(p, 'skull');
  // XII, and the C1 fibres that ride with it
  const m1488 = stemSlice(MEDULLA, 1488), hyoidHorn = G.extreme(bone('hyoid bone'), [-0.6, 0.8, 0.2]);
  course('hypoglossal', 'Leaves the front of the medulla, passes out through its own canal above the joint between skull and neck, runs down between the great vessels, then loops forward just above the tongue bone to the tongue. (The tongue\'s muscles are not in this rig.)',
    [K([m1488.c[0] - 2, m1488.ymin + 4, 1488]), B([-15, -70, 1486]), S([-27, -85, 1463], 'cervical'), S(mv(hyoidHorn, UP, 9, LAT, 3), 'hyoid'), S(mv(cen('geniohyoid'), UP, 16, LAT, 7, BACK, 6), 'mandible'), S(mv(cen('geniohyoid'), UP, 18, LAT, 5, FRONT, 10), 'mandible')], { twigFrom: 2 });
  const hyp = courses.hypoglossal;
  course('c1_with_hypoglossal', 'Fibres of the first cervical nerve join the hypoglossal nerve just under the skull, ride forward with it, and leave it above the tongue bone as the twigs to thyrohyoid and geniohyoid.',
    [from('cervical_plexus', 0), S(mix(courses.cervical_plexus[0].p, hyp[2].p, 0.55), 'cervical'), S(mv(hyp[2].p, DOWN, 2), 'cervical'), S(mv(hyp[3].p, DOWN, 2), 'hyoid'), S(mv(hyp[4].p, DOWN, 4), 'mandible'), S(onMuscle('geniohyoid', cen('geniohyoid')), 'hyoid')]);
  // IX, X, XI leave together through the jugular opening
  const jug = [-30, -72, 1490];
  const m1500 = stemSlice(MEDULLA, 1500), m1494 = stemSlice(MEDULLA, 1494), m1482 = stemSlice(MEDULLA, 1482);
  course('glossopharyngeal', 'Leaves the side of the medulla, passes out through the jugular opening with the vagus and accessory nerves, and curves forward between the great vessels to the side of the throat and the back of the tongue. (Its one muscle, stylopharyngeus, is not in this rig.)',
    [K([m1500.xmin + 1, m1500.c[1], 1500]), B(mv(jug, FRONT, 2, UP, 1)), S([-31, -90, 1468], 'cervical'), S([-24, -106, 1452], 'cervical')], { twigFrom: 2 });
  course('vagus', 'Leaves the side of the medulla, passes out through the jugular opening and runs straight down the neck between the great artery and vein, beside the throat and voice box, into the chest. (Drawn to the root of the neck; the muscles it moves are not in this rig.)',
    [K([m1494.xmin + 1, m1494.c[1], 1494]), B(jug), S([-30, -88, 1452], 'cervical'), S([-31, -94, 1412], 'cervical'), S([-29, -97, 1372], 'cervical'), S([-27, -100, 1336], 'thorax')], { twigFrom: 2 });
  const scm = mus('sternocleidomastoid')[0];
  // XI: its fibres leave the side of the cord inside the canal (C1 to C5), climb beside the cord through the great opening,
  // and leave the skull by the jugular opening
  const besideCord = v => { const c = canalAt(v); return [c[0] - 5.5, c[1], c[2]]; };
  course('accessory', 'Its fibres leave the side of the top five segments of the cord inside the canal and join into one strand that climbs beside the cord (drawn 5.5 mm to its side) through the skull\'s great opening; the nerve then turns outward, leaves the skull through the jugular opening, runs down and back across the side of the first cervical vertebra, through the deep side of sternocleidomastoid, across the hollow at the side of the neck and down the deep side of trapezius.',
    [S(besideCord(W.CORD_SEGMENT_V.C5), 'cervical'), S(besideCord(W.CORD_SEGMENT_V.C3), 'cervical'), S(besideCord(W.CORD_SEGMENT_V.C1), 'cervical'), K([m1482.xmin - 1, m1482.c[1] + 2, 1482]), B(mv(jug, MED, 6, UP, 5, BACK, 1)), B(mv(jug, BACK, 2, DOWN, 2)),
      S([-39, -68, 1467], 'cervical'), S(G.snap(scm, G.along(scm, 0.3), 14).p, 'cervical'), S(onMuscle('trapezius', [-62, -42, 1392], 'descending'), 'cervical'), S(onMuscle('trapezius', [-78, -22, 1352], 'transverse'), 'r_girdle'), S(onMuscle('trapezius', [-52, -6, 1290], 'ascending'), 'r_girdle'), S(onMuscle('trapezius', [-30, 0, 1215], 'ascending'), spineSegAtZ(1215))], { twigFrom: 6 });
  // VII
  const p1506 = stemSlice(PONS, 1506);
  const pes = onMuscle('masseter', mv(ramusBack, LAT, 7, FRONT, 9, DOWN, 2), 'superficial');
  course('facial', 'Leaves the brainstem where the pons meets the medulla, crosses to the inner ear opening of the temporal bone, runs through that bone in its own canal (a sharp bend near the middle ear, then straight down), comes out of the skull between the styloid and mastoid processes, turns forward into the parotid gland behind the jaw and there divides into its face branches.',
    [K([p1506.xmin + 2, p1506.c[1] + 2, 1504]), B([-31, -72, 1508]), B([-43, -82, 1510]), B(stylomastoid), K(mv(ramusBack, LAT, 5, BACK, 3)), S(pes, 'mandible')], { twigFrom: 3, twigTo: 4 });
  const occ = mus('occipitalis')[0];
  const HEAD_C = [0, -75, 1545], FACE_C = [0, -98, 1488], JAW_C = [0, -112, 1456], NECK_C = [0, -85, 1425]; // centres the head's, the face's, the jaw's and the neck's surfaces are seen from
  const headSeg = q => (G.nearestBone(q).seg === 'mandible' ? 'mandible' : 'skull');
  course('facial_posterior_auricular', 'Leaves the facial nerve just below the skull and runs up behind the ear, over the mastoid process, then back over the outside of the skull to the muscle at the back of the scalp. It lies under the skin: every point is put on the outer surface.',
    surfaceRun([from('facial', 3), mv(mastoidNotch, LAT, 6, BACK, 8, UP, 12), G.snap(occ, G.along(occ, 0.8, mastoidNotch), 14).p], HEAD_C, 'skull'));
  const zyg = bone('right zygomatic bone'), fr = mus('frontalis')[0], oo = mus('orbicularis oculi', 'orbital')[0];
  const archMid = G.extreme(zyg, [-0.7, 0.7, 0]);
  course('facial_temporal', 'Runs up from the parotid gland across the cheek-bone arch and over the temple to the side of the forehead. It lies under the skin: every point is put on the outer surface.',
    [...surfaceRun([from('facial', -1), mv(archMid, UP, 4, LAT, 1)], FACE_C, headSeg), ...surfaceRun([mv(archMid, UP, 4, LAT, 1), onMuscle('temporalis', mv(archMid, UP, 28, FRONT, 12, LAT, 3)), G.snap(fr, G.along(fr, 0.3, archMid), 14).p, G.snap(fr, G.stat(fr).c, 14).p], HEAD_C, 'skull', { maxChord: 8, lift: 1.5 }).slice(1)]);
  course('facial_zygomatic', 'Runs forward and up from the parotid gland across the cheek bone to the outer corner of the eye. It lies under the skin: every point is put on the outer surface.',
    surfaceRun([from('facial', -1), mv(G.extreme(zyg, LAT), MED, 2), G.snap(oo, G.extreme(oo, [-0.8, 0.3, -0.5]), 10).p, G.snap(oo, mv(G.stat(oo).c, DOWN, 12, LAT, 6), 10).p], FACE_C, headSeg));
  course('facial_buccal', 'Runs straight forward from the parotid gland over the chewing muscle to the cheek, and on to the muscles of the nose and upper lip. It lies under the skin: every point is put on the outer surface.',
    surfaceRun([from('facial', -1), onMuscle('masseter', mv(cen('masseter', 'superficial'), UP, 6), 'superficial'), onMuscle('buccinator', cen('buccinator')), onMuscle('zygomaticus major', along('zygomaticus major', 0.75)), onMuscle('levator labii superioris', cen('levator labii superioris'))], FACE_C, headSeg));
  course('facial_mandibular', 'Runs down and forward from the parotid gland along the outside of the lower edge of the jaw to the muscles of the lower lip and chin. It lies under the skin: every point is put on the outer surface.',
    surfaceRun([from('facial', -1), onMuscle('masseter', mv(mandAngle, FRONT, 20, UP, 3, LAT, 4), 'superficial'), onMuscle('depressor anguli oris', cen('depressor anguli oris')), onMuscle('depressor labii inferioris', cen('depressor labii inferioris'))], JAW_C, 'mandible'));
  course('facial_cervical', 'Runs down from the parotid gland behind the angle of the jaw into the thin sheet of muscle under the skin of the neck. It lies under the skin: every point is put on the outer surface.',
    // (from the gland straight down behind the angle of the jaw to the sheet: a point laid on the jaw's angle swung the
    // piece in and out again)
    [from('facial', -1), ...surfaceRun([{ p: G.surfaceOut(onMuscle('platysma', [-54, -110, 1425]), NECK_C, 2), seg: 'cervical', surface: true }, onMuscle('platysma', [-51, -115, 1385])], NECK_C, 'cervical')]);
  // V3
  const p1518 = stemSlice(PONS, 1518);
  const latPt = cen('lateral pterygoid'), medPt = cen('medial pterygoid');
  const infratemporal = mix(latPt, mv(medPt, UP, 14), 0.5);
  course('mandibular_v3', 'The trigeminal nerve leaves the side of the pons; its lower-jaw branch passes forward over the tip of the temporal bone\'s ridge (where its nerve-cell knot lies), drops out of the skull through the oval opening, and breaks up between the two pterygoid muscles, deep to the jaw\'s upright part.',
    [K([p1518.xmin + 1, p1518.c[1] - 3, 1517]), B([-24, -93, 1516]), B([-27, -101, 1511]), K(infratemporal)], { twigFrom: 3 });
  course('mylohyoid_nerve', 'A branch of the inferior alveolar nerve (itself a branch of the lower-jaw nerve), given off just before that nerve enters the jaw bone. Drawn from the lower-jaw nerve between the pterygoid muscles: down the inner side of the jaw\'s upright part and forward under the floor of the mouth to mylohyoid and the front belly of digastric.',
    [from('mandibular_v3', -1), mv(G.extreme(mandible, MED, (x, y, z) => x < -25 && Math.abs(z - 1468) < 4 && y > -116), MED, 3), onMuscle('mylohyoid', along('mylohyoid', 0.35, [-30, -135, 1453])), G.snap(digAnt, G.stat(digAnt).c, 12).p]);
  // III
  const mb1536 = stemSlice(MIDBRAIN, 1536), lev = mus('levator palpebrae superioris')[0];
  course('oculomotor', 'Leaves the front of the midbrain, runs forward in the wall of the hollow beside the pituitary, enters the eye socket through the slit at its back and its upper branch runs forward over the eye to the muscle that lifts the lid. (The six muscles that turn the eyeball are not in this rig.)',
    [K([-3.5, mb1536.ymin + 2, 1534]), B([-11, -105, 1529]), B(mv(G.along(lev, 0.03, [-10, -110, 1530]), BACK, 5, MED, 1)), K(G.along(lev, 0.35, [-10, -110, 1530]))], { twigFrom: 2 });
}

// ----- the nerves of each level: the intercostal nerves and the subcostal nerve; the back branches
{
  const rect = mus('rectus abdominis')[0], io = 'internal oblique';
  const rectusZ = { 7: 1140, 8: 1095, 9: 1050, 10: 1003, 11: 955, 12: 908 }; // where each nerve reaches rectus abdominis (T7 just under the breastbone's tip, T10 at the level of the navel, about the joint between L3 and L4, T12 halfway down to the pubic bone)
  for (let n = 1; n <= 12; n++) {
    const id = n === 12 ? 'subcostal' : `intercostal_t${n}`, level = `T${n}`, start = exits[level];
    const rib = bone(`right ${ORD[n - 1]} rib`), rs = G.stat(rib), ribSeg = rib.seg;
    // the rib's own line from its head to its front end: its vertices sorted by their angle round the chest's axis
    const cx = 0, cy = (start[1] + rs.min[1]) / 2 - 8, A = rib.P, bins = 5, acc = Array.from({ length: bins }, () => [0, 0, 0, 0]);
    let a0 = Infinity, a1 = -Infinity; const ang = new Float64Array(A.length / 3);
    for (let i = 0, k = 0; i < A.length; i += 3, k++) { const t = Math.atan2(-(A[i] - cx), A[i + 1] - cy); ang[k] = t; if (t < a0) a0 = t; if (t > a1) a1 = t; }
    for (let i = 0, k = 0; i < A.length; i += 3, k++) { const b = Math.max(0, Math.min(bins - 1, Math.floor((ang[k] - a0) / (a1 - a0 + 1e-6) * bins))); acc[b][0] += A[i]; acc[b][1] += A[i + 1]; acc[b][2] += A[i + 2]; acc[b][3]++; }
    // the nerve lies in the groove under the rib's lower edge, on its inner side
    const line = acc.filter(b => b[3]).map(b => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]).map(p => S(add(mix(p, [cx, cy, p[2]], 0.04), [0, 0, -8]), ribSeg));
    const pts = [S(start, spineSegAtZ(start[2] + 1)), ...line.slice(1)];
    if (n <= 6) {
      const cc = bone(`right ${ORD[n - 1]} costal cartilage`);
      pts.push(S(mv(G.along(cc, 0.6, line[line.length - 1].p), DOWN, 6, BACK, 2), cc.seg));
    } else {
      // T7 to T12 run on past the rib's end, slanting down and forward between the two inner flat muscles of the belly
      // wall, and end in rectus abdominis
      const end = G.snap(rect, mv(G.sliceZ(rect, rectusZ[n], 8) || G.stat(rect).c, LAT, 14), 12).p, last = line[line.length - 1].p;
      const mid = mix(last, end, 0.5);
      // the upper belly wall rides the rib cage's edge, the lower the pelvis
      const midP = onMuscle(io, mid);
      pts.push(S(midP, midP[2] > 1030 ? ribSeg : 'pelvis'), S(end, end[2] > 1030 ? rect.seg : 'pelvis'));
    }
    course(id, n <= 6 ? `Leaves the column under the ${ORD[n - 1]} thoracic vertebra and runs round the chest in the groove under rib ${n}, to the front beside the breastbone.`
      : n < 12 ? `Leaves the column under the ${ORD[n - 1]} thoracic vertebra, runs round the chest under rib ${n}, then on past the rib's end, slanting down and forward between the two inner flat muscles of the belly wall, into rectus abdominis.`
        : 'Leaves the column under the twelfth thoracic vertebra, runs under the lowest rib and on, slanting down and forward between the two inner flat muscles of the belly wall, into the lowest part of rectus abdominis.', pts);
  }
  const semi = mus('semispinalis capitis')[0];
  for (const level of W.DORSAL_RAMUS_LEVELS) {
    const id = `dorsal_ramus_${level.toLowerCase()}`, start = exits[level], seg = spineSegAtZ(start[2] + (level[0] === 'C' ? -1 : 1));
    if (level === 'C2') {
      course(id, 'Leaves the column between the first and second cervical vertebrae, turns back and up through the deep muscles of the nape (its main branch, the greater occipital nerve, climbs on to the back of the scalp).',
        [S(start, 'cervical'), S(mv(start, BACK, 16, LAT, 2, UP, 2), 'cervical'), S(G.snap(semi, G.along(semi, 0.25), 14).p, 'skull')]);
      continue;
    }
    course(id, 'Leaves the column with its spinal nerve, turns straight back past the joint between the two vertebrae and ends in the deep muscles beside the spine, a little below the level it left at.',
      [S(start, seg), S(mv(start, BACK, 15, LAT, 5, DOWN, 5), seg), S(mv(start, BACK, 29, LAT, 13, DOWN, 12), seg)]);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Every trunk of the table must have a course
const short = id => id.replace(/^[rl]_/, '');
for (const id of Object.keys(W.NERVE_TRUNKS)) if (!courses[short(id)]) throw new Error(`no course laid for ${id}`);

// The segment each point rides: the one given, else the segment of the nearest bone (set again before the checks)
for (const c of Object.values(courses)) for (const q of c) if (!q.seg) q.seg = G.segmentAt(q.p);

// ---------------------------------------------------------------------------------------------------------------------
// Checks, and moving what fails. Every point must lie inside the body at rest and outside every bone (the points laid
// on purpose in one of the skull's passages excepted); then every straight piece is sampled against every bone, and
// where a piece runs through bone a point is added beside it (a detour), the smallest step aside that clears it.

// a point under the skin (surfaceRun) lies just above the outermost mesh, since the atlas has no skin
const isInside = (p, surface = false) => { if (surface) return G.nearest(p).dist <= 3.5; const e = G.enclosure(p); return e >= 12 || (e >= 10 && G.nearest(p).dist <= 4); };
// BOTH sides are checked: the left side is the mirror of the right, and the atlas is not quite symmetric, so a point
// clear of the right side's bones can lie in the left side's. (The left arm below the shoulder is the game arm, whose
// meshes are not part of this body: points on the right arm's segments are checked on the right only.)
const ARM_SEG = /^r_(upperarm|armwrap|forearm|radius|hand|thumb|index|middle|ring|little)/;
const mirrorP3 = p => [-p[0], p[1], p[2]];
const bothSides = seg => !ARM_SEG.test(seg || '');
const boneAt2 = (p, seg) => G.boneAt(p) || (bothSides(seg) ? G.boneAt(mirrorP3(p)) : null);
const pieceBone2 = (a, b, segA, segB, step = 1) => { const r = G.pieceInBone(a, b, step); if (!bothSides(segA) || !bothSides(segB)) return { ...r, left: 0 }; const l = G.pieceInBone(mirrorP3(a), mirrorP3(b), step); return { ...r, mm: r.mm + l.mm, left: l.mm, mid: r.longestRun >= l.longestRun ? r.mid : (l.mid ? mirrorP3(l.mid) : null), longestRun: Math.max(r.longestRun, l.longestRun) }; };
const report = { points: 0, moved: 0, movedList: [], outside: [], startedInBone: 0, minEnclosure: 14, histogram: {}, surface: 0, detours: [], skipped: [], pieceBone: null };
const DIRS26 = []; for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) { const l = Math.hypot(x, y, z); DIRS26.push([x / l, y / l, z / l]); }
for (const c of Object.values(courses)) for (const q of c) if (!q.seg) q.seg = G.segmentAt(q.p);
for (const [id, c] of Object.entries(courses)) {
  c.forEach((q, i) => {
    if (q.shared) return; // a branch's first point is its parent's point, checked there
    report.points++;
    if (q.surface) report.surface++;
    let p = q.p, movedMm = 0;
    // out of every bone, on both sides (not a point laid in one of the skull's passages): the smallest step that
    // clears it and stays inside the body
    if (!q.passage && boneAt2(p, q.seg)) {
      report.startedInBone++;
      let done = false;
      for (let rad = 1; rad <= 14 && !done; rad += 1) for (const d of DIRS26) { const t = [p[0] + d[0] * rad, p[1] + d[1] * rad, p[2] + d[2] * rad]; if (!boneAt2(t, q.seg) && isInside(t, q.surface)) { p = t; movedMm += rad; done = true; break; } }
    }
    // inside the body: step toward the nearest piece of the body until the point is closed in
    for (let k = 0; k < 14 && !isInside(p, q.surface); k++) {
      const n = G.nearest(p); if (!n.mesh) break;
      const t = G.snap(n.mesh, p, 24).p, d = [t[0] - p[0], t[1] - p[1], t[2] - p[2]], l = Math.hypot(...d) || 1, step = Math.min(3, l);
      p = [p[0] + d[0] / l * step, p[1] + d[1] / l * step, p[2] + d[2] / l * step]; movedMm += step;
    }
    if (movedMm > 0) { report.moved++; report.movedList.push(`${id}[${i}] ${r1(movedMm)} mm`); q.p = p; }
  });
}
// a branch's first point is its parent's point, moved or not
for (const c of Object.values(courses)) if (c[0].shared && c[0].ref) { c[0].p = c[0].ref.p.slice(); c[0].seg = c[0].ref.seg; }

// detours round bone (both sides): at most ONE point beside each piece laid by a recipe, the one that clears the most
// with the smallest step aside, and only where the line turns by 60 degrees or less at it (a sharper spike would show
// more than the stretch it clears); a piece that cannot be cleared so keeps its stretch in bone, and is reported. The
// cranial nerves' twig limits are kept by point, not by index, while points are added.
const twigRefs = Object.fromEntries(Object.entries(twigFrom).map(([id, v]) => [id, v.map(i => courses[id][i])]));
const segOfDetour = (q, a, b) => (a.seg === b.seg ? a.seg : G.nearestBoneOf(q, [a.seg, b.seg]).seg || (dist(q, a.p) <= dist(q, b.p) ? a.seg : b.seg));
const turnAt = (a, q, b) => { const u = [q[0] - a[0], q[1] - a[1], q[2] - a[2]], v = [b[0] - q[0], b[1] - q[1], b[2] - q[2]], c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1); return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI; };
const MAX_TURN = 60, WIND_TURN = 100; // WIND_TURN: where a recipe says the nerve hooks round a bone (`wind`), as the nerve to obturator internus round the ischial spine
for (const [id, c] of Object.entries(courses)) {
  for (let i = 0; i + 1 < c.length && c.length < 20; i++) {
    const a = c[i], b = c[i + 1];
    if (a.passage || b.passage) continue;
    const r = pieceBone2(a.p, b.p, a.seg, b.seg, 1);
    if (r.mm < 3 || r.longestRun < 2.5 || !r.mid) continue;
    // the plane across the piece at the middle of its longest stretch in bone: 16 directions, 2 to 24 mm out
    const e = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]], el = Math.hypot(...e) || 1; e[0] /= el; e[1] /= el; e[2] /= el;
    const ref = Math.abs(e[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = [ref[1] * e[2] - ref[2] * e[1], ref[2] * e[0] - ref[0] * e[2], ref[0] * e[1] - ref[1] * e[0]], ul = Math.hypot(...u); u[0] /= ul; u[1] /= ul; u[2] /= ul;
    const v = [e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]];
    let best = null;
    for (let rad = 2; rad <= 24; rad += 2) {
      for (let k = 0; k < 16; k++) {
        const w = 2 * Math.PI * k / 16, q = [0, 1, 2].map(j => r.mid[j] + rad * (Math.cos(w) * u[j] + Math.sin(w) * v[j]));
        if (turnAt(a.p, q, b.p) > (b.wind ? WIND_TURN : MAX_TURN)) continue;
        const sq = segOfDetour(q, a, b);
        if (boneAt2(q, sq) || !isInside(q, a.surface && b.surface)) continue;
        const left = pieceBone2(a.p, q, a.seg, sq, 2).mm + pieceBone2(q, b.p, sq, b.seg, 2).mm;
        if (left < r.mm - 2 && (!best || left + 0.4 * rad < best.left + 0.4 * best.rad)) best = { q, left, rad, seg: sq, turn: turnAt(a.p, q, b.p) };
      }
    }
    if (!best) { report.skipped.push(`${id}[${i}-${i + 1}] ${r1(r.mm)} mm (no single point within ${MAX_TURN}° clears it)`); continue; }
    c.splice(i + 1, 0, { p: best.q, seg: best.seg, surface: a.surface && b.surface, detour: true });
    report.detours.push(`${id}[${i}-${i + 1}] ${r1(r.mm)} -> ${r1(best.left)} mm (${best.rad} mm aside, turn ${Math.round(best.turn)}°)`);
    i++; // the two new pieces are left as they are: one point per piece
  }
}
for (const [id, refs] of Object.entries(twigRefs)) twigFrom[id] = refs.map(q => courses[id].indexOf(q));

// what is left: every piece against every bone, on the right and (mirrored) on the left
{
  let total = 0, inBone = 0, inPassage = 0, leftTotal = 0, leftBone = 0, leftPassage = 0; const left = [];
  for (const [id, c] of Object.entries(courses)) for (let i = 0; i + 1 < c.length; i++) {
    const r = G.pieceInBone(c[i].p, c[i + 1].p, 1), passage = c[i].passage || c[i + 1].passage;
    total += r.of; inBone += r.mm;
    if (passage) inPassage += r.mm;
    else if (r.mm >= 3) left.push([r.mm, `${id}[${i}-${i + 1}] ${r1(r.mm)} of ${r1(r.of)} mm in ${[...r.bones].join(', ')}`]);
    if (bothSides(c[i].seg) && bothSides(c[i + 1].seg)) { const l = G.pieceInBone(mirrorP3(c[i].p), mirrorP3(c[i + 1].p), 1); leftTotal += l.of; leftBone += l.mm; if (passage) leftPassage += l.mm; else if (l.mm >= 3) left.push([l.mm, `(left) l_${id}[${i}-${i + 1}] ${r1(l.mm)} of ${r1(l.of)} mm in ${[...l.bones].join(', ')}`]); }
  }
  left.sort((x, y) => y[0] - x[0]);
  let pointsInBone = 0, leftPointsInBone = 0;
  for (const c of Object.values(courses)) for (const q of c) if (!q.shared && !q.passage) { if (G.boneAt(q.p)) pointsInBone++; if (bothSides(q.seg) && G.boneAt(mirrorP3(q.p))) leftPointsInBone++; }
  // the same right-side pieces that have a left twin in this body, for a like-for-like share
  let sameTotal = 0, sameBone = 0;
  for (const c of Object.values(courses)) for (let i = 0; i + 1 < c.length; i++) if (bothSides(c[i].seg) && bothSides(c[i + 1].seg)) { const r = G.pieceInBone(c[i].p, c[i + 1].p, 1); sameTotal += r.of; sameBone += r.mm; }
  report.pieceBone = { totalMm: total, inBoneMm: inBone, inPassageMm: inPassage, pointsInBone, left, leftTotal, leftBone, leftPassage, leftPointsInBone, sameTotal, sameBone };
}
// the long bones of the right limbs as capsules (the axis of the bone and the radius of its shaft: the middle 60 %),
// for the pose test's check of pieces through bone with a joint turned (tests/wiring-data.test.mjs)
const boneCapsules = ['right humerus', 'right ulna', 'right radius', 'right femur', 'right tibia', 'right fibula'].map(name => {
  const m = bone(name), st = G.stat(m), P = m.P, rs = [];
  for (let k = 0, n = 0; k < P.length; k += 3, n++) { const t = st.T[n]; if (t < st.t0 + 0.2 * st.len || t > st.t1 - 0.2 * st.len) continue; const x = P[k] - st.c[0] - st.axis[0] * t, y = P[k + 1] - st.c[1] - st.axis[1] * t, z = P[k + 2] - st.c[2] - st.axis[2] * t; rs.push(Math.hypot(x, y, z)); }
  rs.sort((x, y) => x - y);
  const a = [0, 1, 2].map(j => st.c[j] + st.axis[j] * (st.t0 + 0.04 * st.len)), b = [0, 1, 2].map(j => st.c[j] + st.axis[j] * (st.t1 - 0.04 * st.len));
  return { name: name.replace('right ', ''), seg: m.seg, a: a.map(r1), b: b.map(r1), r: r1(0.85 * rs[Math.floor(rs.length / 2)]) };
});

for (const [id, c] of Object.entries(courses)) c.forEach((q, i) => {
  if (q.shared) return;
  const e = G.enclosure(q.p);
  report.histogram[e] = (report.histogram[e] || 0) + 1;
  if (!q.surface && e < report.minEnclosure) report.minEnclosure = e;
  if (!isInside(q.p, q.surface)) report.outside.push(`${id}[${i}] enclosure ${e}`);
});

// ---------------------------------------------------------------------------------------------------------------------
// The muscles' points: where each muscle's nerve ends.
//  - A muscle with one nerve of its own: a third of the way along the muscle from its end nearer the START of its
//    nerve (the end toward the plexus or the brainstem: for a limb muscle its upper, fleshy end, not its tendon), in
//    the middle of the muscle's cross-section there; where that middle falls outside the muscle's own surface (a
//    curved sheet), the nearest piece of the muscle itself.
//  - A muscle served level by level (the deep back muscles, the flat muscles of the belly wall), and a broad sheet
//    whose nerve runs along it (ALONG_NERVE): the piece of the muscle nearest to the course of its nerve.

const muscles = [];
const mirrorP = p => [-p[0], p[1], p[2]];
const rowOf = name => W.MUSCLE_ROWS.find(r => r.names[0] === name);
const BELLY_SPLIT_Z = 1030; // about the lower edge of the rib cage at the front: below it the belly wall rides the pelvis
const LIMB_BONES = ['right humerus', 'right ulna', 'right radius', 'right femur', 'right tibia', 'right fibula', 'left femur', 'left tibia', 'left fibula'].map(n => bone(n));
const distToLine = (p, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2, t = l2 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2)) : 0; return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t); };
// muscles whose point rides a stated segment rather than the nearest bone's: platysma lies on the neck (its mesh reaches
// up over the jaw, whose bone is nearer, and a point on the jaw swung 41 mm away when the jaw opened)
const MUSCLE_POINT_SEG = { platysma: 'cervical' };
// muscles whose point is the piece of the muscle nearest its nerve: the broad sheets the nerve runs along, and three
// muscles at the elbow whose nerve meets them there (the median nerve passes between the two heads of pronator teres;
// the radial nerve runs between brachioradialis and brachialis, beside the long radial wrist extensor). A belly point a
// third down those three lay against the radius, and the twig to it from a nerve on the ulna or the humerus was swept
// through the radius as the forearm turned.
const ALONG_NERVE = new Set(['trapezius', 'sternocleidomastoid', 'latissimus dorsi', 'serratus anterior', 'platysma', 'pronator teres', 'brachioradialis', 'extensor carpi radialis longus']);
for (const mu of body.rig.muscles) {
  const m = body.meshes.get(mu.id);
  if (!m) throw new Error(`rig muscle ${mu.id} has no mesh`);
  const alias = (mu.aliases || []).find(a => a.toLowerCase() !== mu.name.toLowerCase()) || '';
  const rec = (alias && W.nerveForMuscle(alias)) || W.nerveForMuscle(mu.name);
  if (!rec) throw new Error(`rig muscle ${mu.id} "${mu.name}" resolves to no row of the muscle table`);
  const left = mu.side === 'left', own = p => (left ? mirrorP(p) : p);
  const c = courses[short(rec.trunk)];
  let p, how;
  if (rowOf(rec.muscle).segmental || ALONG_NERVE.has(rec.muscle)) {
    let best = null;
    for (const q of c.slice((twigFrom[short(rec.trunk)] || [0])[0])) { const s = G.snap(m, own(q.p), 14); const d = dist(s.p, own(q.p)); if (!best || d < best.d) best = { d, p: s.p }; }
    p = best.p; how = 'nearest piece';
  } else {
    const top = courses[short(W.trunkChain(rec.trunk)[0])][0].p;
    p = G.along(m, 1 / 3, own(top), 0.07); how = 'cross-section';
    if (!insideMesh(m, p)) { p = G.snap(m, p, 14).p; how = 'on the muscle'; }
  }
  // the segment the point rides: the nearest bone's when a bone is near, among the segments the game moves the
  // muscle's mesh with (its rig blend: the game moves each vertex with the two nearest of them, ns-body), so the point
  // moves as the muscle drawn round it does (a muscle's own rig segment is where most of its mesh hangs, which for a
  // long muscle with its tendon can be the next bone down: its belly point must ride the bone the belly lies on); in
  // the soft wall of the belly, far from any bone, the pelvis below the navel's level and the muscle's own rig segment
  // above it
  const rigRow = body.rig.meshSegment[mu.id], rigSeg = rigRow.segment, cand = (rigRow.blend || []).map(b => b[0]);
  const nbAll = G.nearestBone(p), nbCand = cand.length ? G.nearestBoneOf(p, cand) : { dist: Infinity, seg: null };
  const nb = nbCand.dist <= 45 ? nbCand : nbAll;
  let seg = nb.dist <= 45 ? nb.seg : null;
  if (!seg) { // a long bone's shaft has few vertices: the nearest long bone by its axis, within 110 mm
    let bd = 110;
    for (const b of LIMB_BONES) { const st = G.stat(b), a = [0, 1, 2].map(k => st.c[k] + st.axis[k] * st.t0), e = [0, 1, 2].map(k => st.c[k] + st.axis[k] * st.t1), d = distToLine(p, a, e); if (d < bd) { bd = d; seg = b.seg; } }
  }
  if (!seg) seg = p[2] < BELLY_SPLIT_Z && p[2] > 800 ? 'pelvis' : rigSeg;
  if (MUSCLE_POINT_SEG[rec.muscle]) seg = left ? MUSCLE_POINT_SEG[rec.muscle].replace(/^r_/, 'l_') : MUSCLE_POINT_SEG[rec.muscle];
  muscles.push({ id: mu.id, name: mu.name, alias, side: mu.side, seg, p, how, trunk: rec.trunk });
}

// the muscles' points against the body
report.musclePoints = muscles.length; report.muscleOutside = []; report.muscleSnapped = muscles.filter(m => m.how === 'on the muscle').length; report.muscleNearest = muscles.filter(m => m.how === 'nearest piece').length;
for (const m of muscles) if (!isInside(m.p)) report.muscleOutside.push(`${m.id} ${m.name} enclosure ${G.enclosure(m.p)}`);

// ---------------------------------------------------------------------------------------------------------------------
// The generated block

const P3 = p => p.map(r1);

// Where each root joins its bundle: for every nerve that starts at the cord, for every one of its levels, the point of
// its course that the root reaches most directly from where it leaves the column (its opening; for the accessory
// nerve, its segment of the cord) without climbing more than a few millimetres (each millimetre a root would climb
// above its opening counts three times): so a plexus's lower roots join it lower down, beside their openings, instead
// of all running up to its first point. (For the accessory nerve, whose strand climbs into the skull, the other way
// round: at or just above.)
const rootJoin = {};
for (const [rid, t] of Object.entries(W.NERVE_TRUNKS)) {
  if (t.parent || t.origin !== 'cord') continue;
  const c = courses[short(rid)], fromCord = t.rootsLeave === 'cord';
  rootJoin[rid] = {};
  for (const level of t.roots) {
    const start = fromCord ? canalAt(W.CORD_SEGMENT_V[level]) : exits[level];
    let best = 0, bc = Infinity;
    // (the accessory nerve's strand climbs: its roots join at the point at, or just above, their segment instead)
    c.forEach((q, k) => { const cost = dist(start, q.p) + 3 * Math.max(0, fromCord ? start[2] - q.p[2] - 3 : q.p[2] - start[2] - 3); if (cost < bc - 1e-9) { bc = cost; best = k; } });
    rootJoin[rid][level] = best;
  }
}

// The body's outline round each limb, for the tests: the limb's axis (from the rig's own joints), and, at 32 stations
// along it and in 36 sectors (10 degrees) around it, the farthest the surface of the limb's meshes (every triangle,
// sampled at most 3 mm apart) lies from the axis. A course or
// muscle point of the limb must lie inside that outline (tests/wiring-data.test.mjs), so a point moved off the limb, or
// put on the wrong one of the limb's segments, fails without loading the meshes.
const LIMB_OUTLINE = [
  ['upperarm', ['r_upperarm', 'r_armwrap'], 'r_glenohumeral', 'r_elbow'],
  ['forearm', ['r_forearm', 'r_radius'], 'r_elbow', 'r_wrist'],
  ['hand', ['r_hand', 'r_thumb_mc', 'r_thumb_pp', 'r_thumb_dp', ...['index', 'middle', 'ring', 'little'].flatMap(f => [`r_${f}_pp`, `r_${f}_mp`, `r_${f}_dp`])], 'r_wrist', 'r_middle_mcp'],
  ['thigh', ['r_thigh', 'r_patella', 'r_quad1', 'r_quad2', 'r_quad3', 'r_quad4'], 'r_hip', 'r_knee'],
  ['shank', ['r_shank'], 'r_knee', 'r_ankle'],
  ['foot', ['r_foot', 'r_toes', 'r_hallux'], 'r_ankle', 'r_mtp']
];
const OUTLINE_T0 = -0.25, OUTLINE_DT = 0.046875, OUTLINE_N = 32, OUTLINE_S = 36;
// beyond a limb's ends (round the joint: shoulder, elbow, wrist, knee, ankle) a point may ride either side of the joint,
// so there the outline also takes in the meshes of the segments next to it
const segsOf = name => LIMB_OUTLINE.find(l => l[0] === name)[1];
const OUTLINE_BEYOND = { upperarm: [['r_girdle', 'r_clav'], segsOf('forearm')], forearm: [segsOf('upperarm'), segsOf('hand')], hand: [segsOf('forearm'), []], thigh: [[], segsOf('shank')], shank: [segsOf('thigh'), segsOf('foot')], foot: [segsOf('shank'), []] };
const outline = {};
for (const [name, segs, ja, jb] of LIMB_OUTLINE) {
  const a = P(ja), b = P(jb), e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...e); e[0] /= L; e[1] /= L; e[2] /= L;
  const Y = Math.abs(e[1]) < 0.8 ? [0, 1, 0] : [0, 0, 1], d = Y[0] * e[0] + Y[1] * e[1] + Y[2] * e[2], u = [Y[0] - d * e[0], Y[1] - d * e[1], Y[2] - d * e[2]], ul = Math.hypot(...u); u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v = [e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]];
  const r = Array.from({ length: OUTLINE_N }, () => new Array(OUTLINE_S).fill(0)), set = new Set(segs);
  const [before, after] = OUTLINE_BEYOND[name], beyond = new Set([...before, ...after]);
  let only = false; // a next-door mesh: counted only before the limb's start (t < 0) or beyond its end (t > 1)
  const put = (X, Y, Z) => {
    const x = X - a[0], y = Y - a[1], z = Z - a[2], t = (x * e[0] + y * e[1] + z * e[2]) / L, st = Math.floor((t - OUTLINE_T0) / OUTLINE_DT);
    if (st < 0 || st >= OUTLINE_N) return;
    if (only && !((t < 0 && before.includes(cur)) || (t > 1 && after.includes(cur)))) return;
    const px = x - t * L * e[0], py = y - t * L * e[1], pz = z - t * L * e[2], rad = Math.hypot(px, py, pz);
    const sec = ((Math.floor((Math.atan2(px * v[0] + py * v[1] + pz * v[2], px * u[0] + py * u[1] + pz * u[2]) + Math.PI) / (2 * Math.PI) * OUTLINE_S) % OUTLINE_S) + OUTLINE_S) % OUTLINE_S;
    if (rad > r[st][sec]) r[st][sec] = rad;
  };
  // and the meshes of the muscles whose points ride the limb (the hamstrings ride the shank in the rig, their points the
  // thigh; the front of the deltoid rides the collar bone, its point the arm)
  const ridden = new Set(muscles.filter(mu => set.has(mu.seg)).map(mu => mu.id));
  let cur = null;
  for (const m of G.list) {
    if (!set.has(m.seg) && !beyond.has(m.seg) && !ridden.has(m.id)) continue;
    only = !set.has(m.seg) && !ridden.has(m.id); cur = m.seg;
    // every triangle's surface, sampled at most 3 mm apart (the coarse meshes' vertices alone leave thin bins empty)
    const Pm = m.P, Im = m.I;
    for (let k = 0; k + 2 < Im.length; k += 3) {
      const i0 = Im[k] * 3, i1 = Im[k + 1] * 3, i2 = Im[k + 2] * 3;
      const A = [Pm[i0], Pm[i0 + 1], Pm[i0 + 2]], B = [Pm[i1], Pm[i1 + 1], Pm[i1 + 2]], C = [Pm[i2], Pm[i2 + 1], Pm[i2 + 2]];
      const n = Math.max(1, Math.ceil(Math.max(dist(A, B), dist(B, C), dist(C, A)) / 3));
      for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) { const wa = 1 - (i + j) / n, wb = i / n, wc = j / n; put(A[0] * wa + B[0] * wb + C[0] * wc, A[1] * wa + B[1] * wb + C[1] * wc, A[2] * wa + B[2] * wb + C[2] * wc); }
    }
  }
  outline[name] = { segs, from: ja, to: jb, u: u.map(x => Math.round(x * 1e4) / 1e4), r: r.map(row => row.map(x => Math.round(x))) };
}

// what the block's points are now
let coursePoints = 0; for (const c of Object.values(courses)) for (const q of c) if (!q.shared) coursePoints++;
const gen = {
  canal: [...canal.keys()].sort((a, b) => a - b).map(v => [v, ...P3(canal.get(v).p)]),
  canalHalfWidth: Object.fromEntries([...canal.keys()].sort((a, b) => a - b).filter(v => v > 0 && v < 24 && v % 1 !== 0).map(v => [v, r1(canal.get(v).half)])),
  exits: Object.fromEntries(Object.entries(exits).map(([k, p]) => [k, P3(p)])),
  courses: Object.fromEntries(Object.keys(W.NERVE_TRUNKS).map(id => [id, courses[short(id)].map(q => [q.seg, ...P3(q.p)])])),
  rules: Object.fromEntries(Object.keys(W.NERVE_TRUNKS).map(id => [id, rules[short(id)]])),
  twigFrom: Object.fromEntries(Object.entries(twigFrom).map(([id, v]) => [`r_${id}`, v])),
  rootJoin,
  bones: boneCapsules,
  outline: { stations: { from: OUTLINE_T0, step: OUTLINE_DT, count: OUTLINE_N }, sectors: OUTLINE_S, limbs: outline },
  muscles: muscles.map(m => [m.id, m.name, m.alias, m.side, m.seg, ...P3(m.p)]),
  check: { coursePoints, moved: report.moved, outside: report.outside.length, startedInBone: report.startedInBone, onTheSurface: report.surface, detours: report.detours.length,
    lowestEnclosure: report.minEnclosure, musclePoints: report.musclePoints, musclePointsPutOnTheMuscle: report.muscleSnapped, musclePointsNearestPiece: report.muscleNearest,
    musclePointsOutside: report.muscleOutside.length, rootExitsMovedOutOfBone: exitNotes.length,
    pieces: { mm: Math.round(report.pieceBone.totalMm), inBoneMm: Math.round(report.pieceBone.inBoneMm), inSkullPassagesMm: Math.round(report.pieceBone.inPassageMm), pointsInBone: report.pieceBone.pointsInBone,
      left: { mm: Math.round(report.pieceBone.leftTotal), inBoneMm: Math.round(report.pieceBone.leftBone), inSkullPassagesMm: Math.round(report.pieceBone.leftPassage), pointsInBone: report.pieceBone.leftPointsInBone, rightSamePiecesMm: Math.round(report.pieceBone.sameTotal), rightSamePiecesInBoneMm: Math.round(report.pieceBone.sameBone) } },
    rigPivots: Object.fromEntries(['r_wrist', 'r_ankle', 'r_elbow', 'r_knee', 'atlanto_occipital', 'lumbosacral'].map(n => [n, P3(P(n))])) }
};
const lines = [];
lines.push(`${BEGIN} (tools/build-wiring-courses.mjs over the body as the page prepares it; regenerate, do not`);
lines.push('// hand-edit). Points are millimetres in WIRING_FRAME. canal: [vertebral coordinate, x, y, z] the centre of the');
lines.push('// vertebral canal; exits: where each spinal nerve leaves the column (right side); courses: [segment, x, y, z] per point;');
lines.push('// rules: how each course was laid; twigFrom: [first, last?] the course points of a cranial nerve a twig to a muscle may');
lines.push('// leave from (none inside the skull); rootJoin: { trunk: { level: index } } the course point each root joins its');
lines.push('// bundle at; bones: the long bones of the right limbs as capsules (axis ends, shaft radius; for the tests); outline:');
lines.push('// the body\'s outline round each limb\'s axis (for the tests); muscles: [mesh id, name, alias, side,');
lines.push('// segment, x, y, z] the point in each muscle where its nerve ends; check: what the generator measured (rigPivots = the');
lines.push('// rig this block was laid over). Frozen. LICENCE: unlike the rest of this module (project code, CC0 1.0), the points');
lines.push('// of this block are data derived from the atlas meshes and the vessel centre lines: CC BY 4.0 (BodyParts3D, (c) The');
lines.push('// Database Center for Life Science) and, for the points laid on or in Z-Anatomy muscles, CC BY-SA 4.0 (Z-Anatomy);');
lines.push('// see CREDITS-AND-LICENCES.md.');
lines.push('export const WIRING_GENERATED = deepFreeze({');
lines.push(`  canal: ${JSON.stringify(gen.canal)},`);
lines.push(`  canalHalfWidth: ${JSON.stringify(gen.canalHalfWidth)},`);
lines.push('  exits: {');
for (const [k, p] of Object.entries(gen.exits)) lines.push(`    ${k}: ${JSON.stringify(p)},`);
lines.push('  },');
lines.push('  courses: {');
for (const [k, c] of Object.entries(gen.courses)) lines.push(`    ${k}: ${JSON.stringify(c)},`);
lines.push('  },');
lines.push('  rules: {');
for (const [k, t] of Object.entries(gen.rules)) lines.push(`    ${k}: ${JSON.stringify(t)},`);
lines.push('  },');
lines.push(`  twigFrom: ${JSON.stringify(gen.twigFrom)},`);
lines.push(`  bones: ${JSON.stringify(gen.bones)},`);
lines.push('  rootJoin: {');
for (const [k, t] of Object.entries(gen.rootJoin)) lines.push(`    ${k}: ${JSON.stringify(t)},`);
lines.push('  },');
lines.push(`  outline: { stations: ${JSON.stringify(gen.outline.stations)}, sectors: ${gen.outline.sectors}, limbs: {`);
for (const [k, o] of Object.entries(gen.outline.limbs)) lines.push(`    ${k}: ${JSON.stringify(o)},`);
lines.push('  } },');
lines.push('  muscles: [');
for (const m of gen.muscles) lines.push(`    ${JSON.stringify(m)},`);
lines.push('  ],');
lines.push(`  check: ${JSON.stringify(gen.check)}`);
lines.push('});');
lines.push(END);
const block = lines.join('\n');

const text = fs.readFileSync(MODULE, 'utf8');
const i0 = text.indexOf(BEGIN), i1 = text.indexOf(END);
if (i0 < 0 || i1 < 0) throw new Error('the generated block markers are missing from ns-wiring-data.mjs');
const next = text.slice(0, i0) + block + text.slice(i1 + END.length);

console.log(`courses: ${Object.keys(courses).length} trunks, ${coursePoints} points (${report.points} laid by the recipes, ${report.detours.length} added as detours round bone; plus ${Object.values(courses).filter(c => c[0].shared).length} shared branch points)`);
console.log(`moved to pass the checks: ${report.moved} point(s)${report.movedList.length ? ': ' + report.movedList.join('; ') : ''}`);
console.log(`started inside a bone: ${report.startedInBone}; laid on the surface (under the skin): ${report.surface}; still outside the body: ${report.outside.length}${report.outside.length ? ' -> ' + report.outside.join('; ') : ''}`);
console.log(`detours round bone: ${report.detours.length}${report.detours.length ? ': ' + report.detours.join('; ') : ''}`);
console.log(`pieces left in bone because no single point within ${MAX_TURN}° clears them: ${report.skipped.length}${report.skipped.length ? ': ' + report.skipped.join('; ') : ''}`);
{ const b = report.pieceBone; console.log(`pieces against every bone: ${Math.round(b.inBoneMm)} of ${Math.round(b.totalMm)} mm in bone (${(100 * b.inBoneMm / b.totalMm).toFixed(1)} %), of which ${Math.round(b.inPassageMm)} mm in pieces through the skull's own passages; points inside a bone: ${b.pointsInBone}`);
  console.log(`  the mirrored left side (its own bones; not the left arm below the shoulder, which is the game arm): ${Math.round(b.leftBone)} of ${Math.round(b.leftTotal)} mm in bone (${(100 * b.leftBone / b.leftTotal).toFixed(1)} %), of which ${Math.round(b.leftPassage)} mm in the skull's passages; points inside a bone: ${b.leftPointsInBone}; the same pieces on the right: ${Math.round(b.sameBone)} of ${Math.round(b.sameTotal)} mm (${(100 * b.sameBone / b.sameTotal).toFixed(1)} %)`);
  console.log(`  left, pieces with 3 mm or more in bone (${b.left.length}): ${b.left.map(x => x[1]).join('; ')}`); }
console.log(`enclosure histogram (14 = closed in on all sides): ${JSON.stringify(report.histogram)}`);
console.log(`muscle points: ${report.musclePoints}, of which ${report.muscleSnapped} put on the muscle itself and ${report.muscleNearest} the piece nearest the nerve (served level by level); outside the body: ${report.muscleOutside.length}${report.muscleOutside.length ? ' -> ' + report.muscleOutside.join('; ') : ''}`);
for (const n of canalNotes) console.log('canal: ' + n);
console.log(`root exits moved out of bone: ${exitNotes.length}${exitNotes.length ? ' (' + exitNotes.join('; ') + ')' : ''}`);
if (opt('--dump')) fs.writeFileSync(opt('--dump'), JSON.stringify({ gen, report }, null, 1));
if (flag('--check')) {
  if (next !== text) { console.log('DIFFERS: the committed block is not what this build gives (rerun without --check)'); process.exit(1); }
  console.log('the committed block equals a fresh build');
} else if (next !== text) { fs.writeFileSync(MODULE, next); console.log('wrote the generated block of scene/src/ns-wiring-data.mjs'); } else console.log('the generated block is unchanged');
if (report.outside.length || report.muscleOutside.length) process.exitCode = 2;
