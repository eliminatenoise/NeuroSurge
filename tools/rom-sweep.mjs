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
 * Usage:  node tools/rom-sweep.mjs [--rigid] [--json out.json]
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

// A. attachment samples of each muscle on each candidate segment's bones (start-posture distances)
const muscles = [];
for (const mu of rig.muscles) {
  const info = rig.meshSegment[mu.id]; if (!info || info.kind !== 'muscle') continue;
  const mesh = inputs.meshesById.get(mu.id); if (!mesh) continue;
  const p = mesh.positions, w = body.bodySkinWeights(rig, mu.id, p);
  const cands = [...new Set(info.candidates || [])].filter(s => segCloud[s]);
  const att = [];
  const step = Math.max(1, Math.floor(p.length / 3 / 1500));
  for (const s of cands) {
    let n = 0;
    for (let v = 0; v < p.length / 3 && n < 220; v += step) {
      const d = nearest(segCloud[s], p[3 * v], p[3 * v + 1], p[3 * v + 2], 1);
      if (d < 6) { att.push({ v, seg: s, d0: d }); n++; }
    }
  }
  muscles.push({ id: mu.id, name: mu.name, p, w, att, rigidSeg: info.segment });
}
// B. bone pairs that meet at a joint in the start posture: the part of bone A within 30 mm of the other segment's bones.
// The measure is the CLOSEST approach of that part to the other bones: a joint that slides or turns keeps it near zero,
// a joint that comes apart does not.
const joints = [];
for (const A of boneList) for (const s of Object.keys(segCloud)) {
  if (s === A.seg) continue;
  const near = []; let touch = Infinity;
  for (let i = 0; i < A.pts.length; i += 3) { const d = nearest(segCloud[s], A.pts[i], A.pts[i + 1], A.pts[i + 2], 3); if (d < 30) { near.push(A.pts[i], A.pts[i + 1], A.pts[i + 2]); if (d < touch) touch = d; } }
  if (near.length >= 30 && touch < 4) joints.push({ a: A, bseg: s, near: near.length > 900 ? near.slice(0, 900) : near });
}
const rest = body.bodyPostureAngles(baked);
const limits = body.bodyPostureLimits(body.DEFAULT_BODY_POSTURE);
const clampTo = t => { const out = { ...t }; for (const k of Object.keys(out)) { const L = limits[k] || body.BODY_JOINT_LIMITS[k]; if (L) out[k] = Math.min(L[1], Math.max(L[0], out[k])); } return out; };
function measure(name, joints_) {
  const targets = clampTo({ ...rest, ...joints_ });
  const det = body.poseBodyDetailed(rig, targets, { baked });
  const seg = det.segments, inv = {};
  const invOf = s => inv[s] || (inv[s] = rigidInv(seg.get(s)));
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
      const q = apply(invOf(a.seg), x, y, z);
      const d = nearest(segCloud[a.seg], q[0], q[1], q[2], 6) - a.d0, k = m.name + '>' + a.seg;
      if (!(muscleNow[k] >= d)) muscleNow[k] = d;
    }
  }
  for (const j of joints) {
    const mA = seg.get(j.a.seg), iB = invOf(j.bseg); let closest = Infinity;
    for (let i = 0; i < j.near.length; i += 3) { const w = apply(mA, j.near[i], j.near[i + 1], j.near[i + 2]); const q = apply(iB, w[0], w[1], w[2]); const d = nearest(segCloud[j.bseg], q[0], q[1], q[2], 6); if (d < closest) closest = d; }
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
poses.push(['STACK bend forward + head forward + turn head', { trunk_flex: 80, neck_flex: 50, neck_rot: 80 }]);
poses.push(['STACK both knees bent + both thighs lifted', { knee_ext_L: -135, knee_ext_R: -135, hip_flex_L: 110, hip_flex_R: 110 }]);
poses.push(['STACK right arm back + out + elbow bent + palm up', { r_shoulder_flex: -50, r_shoulder_abd: 90, r_elbow_flex: 145, r_pronation: 0 }]);

const t0 = Date.now(), results = [];
for (const [name, j] of poses) { try { results.push(measure(name, j)); } catch (e) { results.push({ name, error: String(e && e.message || e).slice(0, 200) }); } }
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
console.log('--- largest muscle-end changes');
for (const r of rows.slice().sort((a, b) => b.worstMuscle.mm - a.worstMuscle.mm).slice(0, 16)) console.log(`${r.worstMuscle.mm} mm  ${r.worstMuscle.end}  | ${r.name} ${JSON.stringify(r.joints)} (${r.loose.length} ends over 8 mm)`);
console.log('--- largest joint openings');
for (const r of rows.slice().sort((a, b) => b.worstJoint.mm - a.worstJoint.mm).slice(0, 14)) { const [id, sg] = (r.worstJoint.joint || '>').split('>'); console.log(`${r.worstJoint.mm} mm  ${names(id)} from ${sg}  | ${r.name} ${JSON.stringify(r.joints)}`); }
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
