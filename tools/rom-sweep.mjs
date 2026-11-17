/** NeuroSurge tool (project code, CC0): the range-of-motion sweep (user notes of 17 November 2026: "test all major
 * ranges of motions for plausibility, specifically of the detachments and dislocations").
 *
 * Every movement of the body map, and some stacks of movements, is posed with the game's own rig and skin, and two
 * things are measured in millimetres, as the CHANGE from the start posture:
 *   A. muscle ends: how much farther from its bone an attachment vertex of a muscle is (a vertex within 6 mm of a bone
 *      the muscle attaches to counts as an attachment vertex);
 *   B. joints: how much the closest approach of two bones that meet at a joint has grown (a joint that slides or turns
 *      keeps it near zero; a joint that comes apart does not).
 * It measures geometry in the game's own model. It says nothing about whether a real body would do the same, and it
 * does not see one part passing through another.
 *
 * Usage:  node tools/rom-sweep.mjs [--rigid] [--blocks] [--json out.json] [--poses <regexp>]
 *   --blocks measure against the lumbar spine as ONE bone and the rib cage (thoracic vertebrae, ribs, cartilages,
 *            breastbone) as ONE bone, and each collar bone with its shoulder blade, as the rig had them before
 *            18 November 2026: a muscle end or a shoulder blade that slides from one rib to the next then counts as
 *            staying on the rib cage, as it did then. For a like-for-like comparison with a sweep of that rig; the
 *            default (every vertebra, rib and cartilage its own bone) is the stricter measure.
 *   --rigid  measure every muscle as ONE rigid piece, as muscles outside the hand and neck were drawn before
 *            17 November 2026 (for comparison).
 * Not measured: the right forearm's twisted muscles (they need the twist table) and the left game arm (its own rig).
 */
import { loadBody } from './load-body.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
// --poses <regexp>: only the poses whose name matches (the start posture is always measured), for a quick look at one area
const ONLY = process.argv.includes('--poses') ? new RegExp(process.argv[process.argv.indexOf('--poses') + 1], 'i') : null;
const BLOCKS = process.argv.includes('--blocks');
const RIGID = process.argv.includes('--rigid'); // measure each muscle as ONE rigid piece (how every muscle outside the hand and neck was drawn before 17 November)
const { body, inputs, rig, baked } = await loadBody(repo);
const { BODY_MOTOR_MAP } = await import(repo + '/scene/src/ns-bodymap.mjs');

const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
function rigidInv(m) { // rotation (possibly with uniform scale 1) + translation
  const o = new Float64Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10]; o[15] = 1;
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
  return o;
}
// point clouds with a hash grid (cell 10 mm)
const CELL = 10;
function cloud(points) {
  const g = new Map();
  for (let i = 0; i < points.length; i += 3) {
    const k = `${Math.floor(points[i] / CELL)},${Math.floor(points[i + 1] / CELL)},${Math.floor(points[i + 2] / CELL)}`;
    let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(points[i], points[i + 1], points[i + 2]);
  }
  return g;
}
function nearest(g, x, y, z, maxCells = 4) {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
  let best = Infinity;
  for (let r = 0; r <= maxCells; r++) {
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
      if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
      const a = g.get(`${cx + i},${cy + j},${cz + k}`); if (!a) continue;
      for (let q = 0; q < a.length; q += 3) { const d = (a[q] - x) ** 2 + (a[q + 1] - y) ** 2 + (a[q + 2] - z) ** 2; if (d < best) best = d; }
    }
    if (best < Infinity && Math.sqrt(best) <= r * CELL) break;
  }
  return Math.sqrt(best);
}

// bones by segment (source positions), decimated
const segPoints = {}, boneList = [];
for (const e of inputs.entries) {
  const info = rig.meshSegment[e.element_id]; if (!info || info.kind !== 'bone') continue;
  const m = inputs.meshesById.get(e.element_id); if (!m) continue;
  const p = m.positions, step = Math.max(1, Math.floor(p.length / 3 / 2500));
  const pts = []; for (let i = 0; i < p.length; i += 3 * step) pts.push(p[i], p[i + 1], p[i + 2]);
  (segPoints[info.segment] || (segPoints[info.segment] = [])).push(...pts);
  boneList.push({ id: e.element_id, seg: info.segment, pts, name: (e.concepts && e.concepts[0] && e.concepts[0].en) || e.element_id });
}
const segCloud = {}; for (const s of Object.keys(segPoints)) segCloud[s] = cloud(segPoints[s]);
// The unit a segment is measured in: itself, or with --blocks the block it belonged to before 18 November 2026.
const unitOf = s => !BLOCKS ? s : /^(thorax|t\d+|sternum|[rl]_rib\d+|[rl]_cc\d+)$/.test(s) ? 'thorax' : /^(lumbar|l[1-4])$/.test(s) ? 'lumbar' : /^[rl]_clav$/.test(s) ? s[0] + '_girdle' : s;
const unitSegs = {}; for (const s of Object.keys(segCloud)) (unitSegs[unitOf(s)] || (unitSegs[unitOf(s)] = [])).push(s);
const boxOf = {};
for (const s of Object.keys(segPoints)) { const p = segPoints[s], b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < b[k]) b[k] = p[i + k]; if (p[i + k] > b[3 + k]) b[3 + k] = p[i + k]; } boxOf[s] = b; }
const boxGap = (b, x, y, z) => Math.hypot(Math.max(b[0] - x, 0, x - b[3]), Math.max(b[1] - y, 0, y - b[4]), Math.max(b[2] - z, 0, z - b[5]));
/** Distance from a point to the bones of a unit; toLocal(seg, x, y, z) gives the point in that segment's own frame. */
function unitNearest(unit, toLocal, x, y, z, maxCells) {
  const segs = unitSegs[unit];
  if (segs.length === 1) { const q = toLocal(segs[0], x, y, z); return nearest(segCloud[segs[0]], q[0], q[1], q[2], maxCells); }
  // the nearest members first (by their boxes), so most of the others are skipped without a search
  const cand = [];
  for (const s of segs) { const q = toLocal(s, x, y, z), gap = boxGap(boxOf[s], q[0], q[1], q[2]); if (gap < maxCells * CELL) cand.push([gap, s, q]); }
  cand.sort((a, b) => a[0] - b[0]);
  let best = Infinity;
  for (const [gap, s, q] of cand) {
    if (gap >= best) break;
    const d = nearest(segCloud[s], q[0], q[1], q[2], Math.max(1, Math.min(maxCells, Math.ceil(Math.min(best, maxCells * CELL) / CELL)))); if (d < best) best = d;
  }
  return best;
}
const sourceFrame = (s, x, y, z) => [x, y, z];

// A. attachment samples of each muscle on each candidate segment's bones (start-posture distances)
const muscles = [];
for (const mu of rig.muscles) {
  const info = rig.meshSegment[mu.id]; if (!info || info.kind !== 'muscle') continue;
  const mesh = inputs.meshesById.get(mu.id); if (!mesh) continue;
  const p = mesh.positions, w = body.bodySkinWeights(rig, mu.id, p);
  const cands = [...new Set((info.candidates || []).filter(s => segCloud[s]).map(unitOf))];
  const att = [];
  const step = Math.max(1, Math.floor(p.length / 3 / 1500));
  for (const s of cands) {
    let n = 0;
    for (let v = 0; v < p.length / 3 && n < 220; v += step) {
      const d = unitNearest(s, sourceFrame, p[3 * v], p[3 * v + 1], p[3 * v + 2], 1);
      if (d < 6) { att.push({ v, seg: s, d0: d }); n++; }
    }
  }
  muscles.push({ id: mu.id, name: mu.name, p, w, att, rigidSeg: info.segment });
}
// B. bone pairs that meet at a joint in the start posture: the part of bone A within 30 mm of the other segment's bones.
// The measure is the CLOSEST approach of that part to the other bones: a joint that slides or turns keeps it near zero,
// a joint that comes apart does not.
const joints = [];
// 18 November 2026: with a segment per vertebra, rib and cartilage there are four times as many pairs to try. A point
// farther than 30 mm from the other segment's bounding box cannot be within 30 mm of its bones, so it is skipped
// without a search (the same pairs and the same points as before, found much faster).
const segBox = {};
for (const s of Object.keys(segPoints)) { const p = segPoints[s], b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < b[k]) b[k] = p[i + k]; if (p[i + k] > b[3 + k]) b[3 + k] = p[i + k]; } segBox[s] = b; }
for (const u of Object.keys(unitSegs)) { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const m of unitSegs[u]) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], segBox[m][k]); b[3 + k] = Math.max(b[3 + k], segBox[m][3 + k]); } segBox['unit:' + u] = b; }
for (const A of boneList) for (const s of Object.keys(unitSegs)) {
  if (s === unitOf(A.seg)) continue;
  const near = [], B = segBox['unit:' + s]; let touch = Infinity;
  for (let i = 0; i < A.pts.length; i += 3) {
    const x = A.pts[i], y = A.pts[i + 1], z = A.pts[i + 2];
    if (x < B[0] - 30 || x > B[3] + 30 || y < B[1] - 30 || y > B[4] + 30 || z < B[2] - 30 || z > B[5] + 30) continue;
    const d = unitNearest(s, sourceFrame, x, y, z, 3); if (d < 30) { near.push(x, y, z); if (d < touch) touch = d; }
  }
  if (near.length >= 30 && touch < 4) {
    const kept = near.length > 900 ? near.slice(0, 900) : near;
    // the closest approach of the KEPT points in the source pose (the start-posture lines below are changes from it)
    let d0 = Infinity; for (let i = 0; i < kept.length; i += 3) { const d = unitNearest(s, sourceFrame, kept[i], kept[i + 1], kept[i + 2], 3); if (d < d0) d0 = d; }
    joints.push({ a: A, bseg: s, near: kept, d0 });
  }
}
const rest = body.bodyPostureAngles(baked);
const limits = body.bodyPostureLimits(body.DEFAULT_BODY_POSTURE);
const clampTo = t => { const out = { ...t }; for (const k of Object.keys(out)) { const L = limits[k] || body.BODY_JOINT_LIMITS[k]; if (L) out[k] = Math.min(L[1], Math.max(L[0], out[k])); } return out; };
function measure(name, joints_) {
  const targets = clampTo({ ...rest, ...joints_ });
  const det = body.poseBodyDetailed(rig, targets, { baked });
  const seg = det.segments, inv = {};
  const invOf = s => inv[s] || (inv[s] = rigidInv(seg.get(s)));
  const posedFrame = (s, x, y, z) => apply(invOf(s), x, y, z);
  const muscleNow = {}, jointNow = {};
  for (const m of muscles) {
    if (!m.att.length || (m.w && m.w.tf)) continue; // (the right forearm's twisted muscles need the twist table: not measured here)
    let pos = null;
    if (RIGID) { const M = det.matrices.get(m.id), bp = baked.meshesById.get(m.id).positions; pos = new Float32Array(bp.length); for (let i = 0; i < bp.length; i += 3) { const q = apply(M, bp[i], bp[i + 1], bp[i + 2]); pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2]; } }
    else if (m.w) pos = body.skinBodyPositions(seg, m.w, m.p);
    for (const a of m.att) {
      let x, y, z;
      if (pos) { x = pos[3 * a.v]; y = pos[3 * a.v + 1]; z = pos[3 * a.v + 2]; }
      else { [x, y, z] = apply(seg.get(m.rigidSeg), m.p[3 * a.v], m.p[3 * a.v + 1], m.p[3 * a.v + 2]); }
      const d = unitNearest(a.seg, posedFrame, x, y, z, 6) - a.d0, k = m.name + '>' + a.seg;
      if (!(muscleNow[k] >= d)) muscleNow[k] = d;
    }
  }
  for (const j of joints) {
    const mA = seg.get(j.a.seg); let closest = Infinity;
    for (let i = 0; i < j.near.length; i += 3) { const w = apply(mA, j.near[i], j.near[i + 1], j.near[i + 2]); const d = unitNearest(j.bseg, posedFrame, w[0], w[1], w[2], 6); if (d < closest) closest = d; }
    jointNow[j.a.id + '>' + j.bseg] = closest;
  }
  const changed = Object.fromEntries(Object.entries(targets).filter(([k, v]) => Math.abs(v - (rest[k] || 0)) > 0.5).map(([k, v]) => [k, Math.round(v)]));
  return { name, joints: changed, muscleNow, jointNow };
}
const poses = [['start posture', {}]];
for (const r of BODY_MOTOR_MAP.regions) for (const a of r.actions || []) if (a.joints && Object.keys(a.joints).length) poses.push([`${r.label}: ${a.label}`, a.joints]);
const J = id => { for (const r of BODY_MOTOR_MAP.regions) for (const a of r.actions || []) if (a.id === id) return a.joints || {}; return {}; };
const stack = (...ids) => Object.assign({}, ...ids.map(J));
poses.push(['STACK lift left thigh + swing out + bend knee', stack('rh_hip_flex', 'rh_hip_abduct', 'rh_knee_flex')]);
poses.push(['STACK right arm up + across + bend elbow', stack('lh_shoulder_flex', 'lh_shoulder_adduct', 'lh_elbow_flex')]);
poses.push(['STACK lean back + turn + head back', { trunk_flex: -25, trunk_rot: 40, neck_flex: -60 }]);
poses.push(['STACK bend forward + head forward + turn head', { trunk_flex: 90, neck_flex: 50, neck_rot: 80 }]);
// 18 November 2026 (a check found the chest pulled apart when two trunk movements were stacked from the strip): side
// bend and turn together, to both sides, and with the back straightened.
poses.push(['STACK trunk bend right + turn right', { trunk_side: -35, trunk_rot: -45 }]);
poses.push(['STACK trunk bend left + turn right', { trunk_side: 35, trunk_rot: -45 }]);
poses.push(['STACK trunk lean back + bend left + turn left', { trunk_flex: -25, trunk_side: 35, trunk_rot: 45 }]);
poses.push(['STACK both knees bent + both thighs lifted', { knee_ext_L: -135, knee_ext_R: -135, hip_flex_L: 110, hip_flex_R: 110 }]);
poses.push(['STACK right arm back + out + elbow bent + palm up', { r_shoulder_flex: -50, r_shoulder_abd: 90, r_elbow_flex: 145, r_pronation: 0 }]);

const t0 = Date.now(), results = [];
for (const [name, j] of ONLY ? poses.filter((p, i) => i === 0 || ONLY.test(p[0])) : poses) { try { results.push(measure(name, j)); } catch (e) { results.push({ name, error: String(e && e.message || e).slice(0, 200) }); } }
// everything is reported as the change from the start posture
const base = results[0];
const rows = [];
for (const r of results.slice(1)) {
  if (r.error) continue;
  let wm = { mm: 0 }, wj = { mm: 0 }; const loose = [], gaps = [];
  for (const [k, d] of Object.entries(r.muscleNow)) { const x = d - (base.muscleNow[k] || 0); if (x > 8) loose.push({ end: k, mm: Math.round(x) }); if (x > wm.mm) wm = { mm: Math.round(x * 10) / 10, end: k }; }
  for (const [k, d] of Object.entries(r.jointNow)) { const x = d - (base.jointNow[k] || 0); if (x > 5) gaps.push({ joint: k, mm: Math.round(x) }); if (x > wj.mm) wj = { mm: Math.round(x * 10) / 10, joint: k }; }
  rows.push({ name: r.name, joints: r.joints, worstMuscle: wm, loose: loose.sort((a, b) => b.mm - a.mm), worstJoint: wj, gaps: gaps.sort((a, b) => b.mm - a.mm) });
}
const names = id => { const b = boneList.find(x => x.id === id); return b ? b.name : id; };
console.log(`poses ${results.length} in ${Date.now() - t0} ms; muscles measured ${muscles.filter(m => m.att.length && !(m.w && m.w.tf)).length} of ${muscles.length} (skinned ${muscles.filter(m => m.w).length}); joint pairs ${joints.length}`);
console.log('errors', results.filter(r => r.error).map(r => r.name + ': ' + r.error).join(' | ') || 'none');
console.log('poses where a muscle end is more than 8 mm farther from its bone than at the start:', rows.filter(r => r.loose.length).length, 'of', rows.length);
console.log('poses where a joint is more than 5 mm farther apart than at the start:', rows.filter(r => r.gaps.length).length, 'of', rows.length);
// 18 November 2026: the start posture itself, against the anatomical source pose the meshes come in (the start posture
// bends the whole spine, so what it does to the muscle ends and the joints is worth its own lines).
{
  const ends = Object.entries(base.muscleNow).map(([k, d]) => [k, Math.round(d * 10) / 10]).sort((a, b) => b[1] - a[1]);
  const d0 = Object.fromEntries(joints.map(j => [j.a.id + '>' + j.bseg, j.d0]));
  const gaps = Object.entries(base.jointNow).map(([k, d]) => { const [id, sg] = k.split('>'); return [`${names(id)} from ${sg}`, Math.round((d - d0[k]) * 10) / 10]; }).sort((a, b) => b[1] - a[1]);
  console.log('--- the start posture itself, against the source pose');
  console.log(`muscle ends more than 8 mm farther from their bone than in the source pose: ${ends.filter(e => e[1] > 8).length} of ${ends.length}; largest: ${ends.slice(0, 6).map(e => `${e[1]} mm ${e[0]}`).join(' | ')}`);
  console.log(`joints more than 5 mm farther apart than in the source pose: ${gaps.filter(e => e[1] > 5).length} of ${gaps.length}; largest: ${gaps.slice(0, 8).map(e => `${e[1]} mm ${e[0]}`).join(' | ')}`);
}
console.log('--- largest muscle-end changes');
for (const r of rows.slice().sort((a, b) => b.worstMuscle.mm - a.worstMuscle.mm).slice(0, 16)) console.log(`${r.worstMuscle.mm} mm  ${r.worstMuscle.end}  | ${r.name} ${JSON.stringify(r.joints)} (${r.loose.length} ends over 8 mm)`);
console.log('--- largest joint openings');
for (const r of rows.slice().sort((a, b) => b.worstJoint.mm - a.worstJoint.mm).slice(0, 14)) { const [id, sg] = (r.worstJoint.joint || '>').split('>'); console.log(`${r.worstJoint.mm} mm  ${names(id)} from ${sg}  | ${r.name} ${JSON.stringify(r.joints)}`); }
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
if (jsonOut) fs.writeFileSync(jsonOut.replace(/\.json$/, '') + '-start.json', JSON.stringify({ muscleEnds: base.muscleNow, joints: base.jointNow }, null, 1));
