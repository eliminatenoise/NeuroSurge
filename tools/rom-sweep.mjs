/** NeuroSurge tool (project code, CC0): the range-of-motion sweep (user notes of 17 November 2026: "test all major
 * ranges of motions for plausibility, specifically of the detachments and dislocations"; "No muscles or joints should
 * be pointy (unless naturally so), detached, dislocated").
 *
 * Every movement of the body map, and stacks of movements, is posed with the game's own rig and skin (the baked start
 * shape carried by each vertex's two bones, exactly what is drawn), and these things
 * are measured in the game's own model (A, B and F as the CHANGE from the start posture):
 *   A. muscle ends (mm): how much farther from its bone an attachment vertex of a muscle is (a vertex within 6 mm of a
 *      bone the muscle attaches to counts as an attachment vertex);
 *   B. joints (mm): how much the closest approach of two bones that meet at a joint has grown (a joint that slides or
 *      turns keeps it near zero; a joint that comes apart does not);
 *   C. stretch (a ratio): the longest a sampled edge of a muscle's surface has become against its length in the source
 *      (anatomical) shape, among the edges that are also at least 6 mm longer than there (a general stretch is what
 *      a lengthened muscle shows; one or two edges far above the rest are a point or a web);
 *   D. blades (mm): how much farther than in the source shape a sampled muscle vertex is from BOTH of the bones it
 *      hangs from (a part of a muscle flung out between two bones);
 *   E. bone through muscle (mm, an estimate): how much deeper than in the source shape a sampled muscle vertex lies
 *      under the surface of one of its own bones (the bone surface's outward direction at its nearest point decides
 *      "under");
 *      C, D and E are counted for a pose only where they are also clearly worse than in the start posture.
 *   F. part through part (mm, an estimate): for two body parts that are not joined to each other, how much nearer
 *      their bones are than the flesh round them allows (flesh depth of a part = the 80th percentile of the distance
 *      of its own muscle surface from its own bones, measured once in the source pose).
 * It measures geometry. It says nothing about whether a real body would do the same.
 *
 * Usage:  node tools/rom-sweep.mjs [--combos] [--rigid] [--blocks] [--json out.json] [--poses <regexp>] [--legacy]
 *   default  the 108 movements of the body map, the nine stacks of the earlier sweep (together the 117 poses its
 *            counts were quoted for; printed as their own line) and the stacks a player makes easily: thigh up + out
 *            + sole turned, arm up + out, trunk bent + turned, head back + turned, the back arched with the head
 *            bowed, the slow limb turn (Space double tap) at both ends, and the look's far left, right and down with
 *            the trunk and neck following.
 *   --combos adds every pair of movements on the same limb (legs; right arm; trunk, neck and jaw): about 380 poses.
 *   --legacy only the 117 poses of the earlier sweep.
 *   --poses <regexp> only the poses whose name matches (the start posture is always measured).
 *   --blocks measure against the lumbar spine as ONE bone and the rib cage (thoracic vertebrae, ribs, cartilages,
 *            breastbone) as ONE bone, and each collar bone with its shoulder blade, as the rig had them before
 *            18 November 2026 (for a like-for-like comparison with a sweep of that rig).
 *   --raw    pose the bare targets, without the knee that gives way under a lifted thigh and without the slightly
 *            bent straight elbow and knee the game draws (as the sweep did before 18 November 2026).
 *   --rigid  measure every muscle as ONE rigid piece, as muscles outside the hand and neck were drawn before
 *            17 November 2026 (for comparison; C, D and E are not measured then).
 * A muscle or a joint whose bones all moved together in a pose is not measured in that pose: its change is zero.
 * The right forearm's and hand's muscles are measured with their twist (since 18 November 2026; before, they were left
 * out, and a hand whose tendons did not follow the fingers read as clean). Not measured: the left game arm (its own rig).
 * The first line printed gives the processor time used as well as the wall time (the machine is often shared).
 */
import { loadBody } from './load-body.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const has = f => process.argv.includes(f), arg = f => (has(f) ? process.argv[process.argv.indexOf(f) + 1] : null);
const jsonOut = arg('--json');
const ONLY = has('--poses') ? new RegExp(arg('--poses'), 'i') : null;
const BLOCKS = has('--blocks'), RIGID = has('--rigid'), COMBOS = has('--combos'), LEGACY = has('--legacy'), RAW = has('--raw');
const T0 = Date.now(), CPU0 = process.cpuUsage();
const { body, inputs, rig, baked } = await loadBody(repo);
const { BODY_MOTOR_MAP } = await import(repo + '/scene/src/ns-bodymap.mjs');
const SEGS = body.BODY_SEGMENTS;

const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
function rigidInv(m) { // rotation + translation
  const o = new Float64Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10]; o[15] = 1;
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
  return o;
}
function mul(a, b) { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[4 * c + r] = a[r] * b[4 * c] + a[4 + r] * b[4 * c + 1] + a[8 + r] * b[4 * c + 2] + a[12 + r] * b[4 * c + 3]; return o; }

// ---- point clouds in a hash grid (cell 10 mm, whole-number keys); a cloud keeps its points and, where given, normals
const CELL = 10, KO = 2048, KM = 4096;
const keyOf = (cx, cy, cz) => ((cx + KO) * KM + (cy + KO)) * KM + (cz + KO);
function cloud(points, normals = null) {
  const g = new Map();
  for (let i = 0; i < points.length; i += 3) {
    const k = keyOf(Math.floor(points[i] / CELL), Math.floor(points[i + 1] / CELL), Math.floor(points[i + 2] / CELL));
    let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i);
  }
  return { g, p: points, n: normals };
}
let NEAR_AT = -1; // index (x3) of the nearest point of the last nearest() call
function nearest(c, x, y, z, maxCells = 4) {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL), p = c.p, g = c.g;
  let best = Infinity; NEAR_AT = -1;
  const cell = (i, j, k) => {
    const a = g.get(keyOf(cx + i, cy + j, cz + k)); if (!a) return;
    for (let q = 0; q < a.length; q++) { const at = a[q], d = (p[at] - x) ** 2 + (p[at + 1] - y) ** 2 + (p[at + 2] - z) ** 2; if (d < best) { best = d; NEAR_AT = at; } }
  };
  for (let r = 0; r <= maxCells; r++) {
    if (r === 0) cell(0, 0, 0);
    else for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (i === -r || i === r || j === -r || j === r) for (let k = -r; k <= r; k++) cell(i, j, k);
      else { cell(i, j, -r); cell(i, j, r); }
    }
    if (best < Infinity && Math.sqrt(best) <= r * CELL) break;
  }
  return Math.sqrt(best);
}
function vertexNormals(p, ix) {
  const n = new Float32Array(p.length);
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const a = 3 * ix[t], b = 3 * ix[t + 1], c = 3 * ix[t + 2];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { n[q] += nx; n[q + 1] += ny; n[q + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}

// ---- bones by segment (source positions, decimated as in the earlier sweep), with outward normals
const segPoints = {}, segNormals = {}, boneList = [];
for (const e of inputs.entries) {
  const info = rig.meshSegment[e.element_id]; if (!info || info.kind !== 'bone') continue;
  const m = inputs.meshesById.get(e.element_id); if (!m) continue;
  const p = m.positions, step = Math.max(1, Math.floor(p.length / 3 / 2500)), vn = m.indices ? vertexNormals(p, m.indices) : null;
  const pts = [], nrm = [];
  for (let i = 0; i < p.length; i += 3 * step) { pts.push(p[i], p[i + 1], p[i + 2]); if (vn) nrm.push(vn[i], vn[i + 1], vn[i + 2]); else nrm.push(0, 0, 0); }
  (segPoints[info.segment] || (segPoints[info.segment] = [])).push(...pts);
  (segNormals[info.segment] || (segNormals[info.segment] = [])).push(...nrm);
  boneList.push({ id: e.element_id, seg: info.segment, pts, name: (e.concepts && e.concepts[0] && e.concepts[0].en) || e.element_id });
}
const segCloud = {}; for (const s of Object.keys(segPoints)) segCloud[s] = cloud(segPoints[s], segNormals[s]);
// The unit a segment is measured in: itself, or with --blocks the block it belonged to before 18 November 2026.
const unitOf = s => !BLOCKS ? s : /^(thorax|t\d+|sternum|[rl]_rib\d+|[rl]_cc\d+)$/.test(s) ? 'thorax' : /^(lumbar|l[1-4])$/.test(s) ? 'lumbar' : /^[rl]_clav$/.test(s) ? s[0] + '_girdle' : s;
const unitSegs = {}; for (const s of Object.keys(segCloud)) (unitSegs[unitOf(s)] || (unitSegs[unitOf(s)] = [])).push(s);
const boxOf = {};
for (const s of Object.keys(segPoints)) { const p = segPoints[s], b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < b[k]) b[k] = p[i + k]; if (p[i + k] > b[3 + k]) b[3 + k] = p[i + k]; } boxOf[s] = b; }
const boxGap = (b, x, y, z) => Math.hypot(Math.max(b[0] - x, 0, x - b[3]), Math.max(b[1] - y, 0, y - b[4]), Math.max(b[2] - z, 0, z - b[5]));
let NEAR_SEG = null, NEAR_Q = null; // the member segment and the local point of the last unitNearest() hit
/** Distance from a point to the bones of a unit (several segments with --blocks, or a body part); toLocal(seg, x, y, z)
 * gives the point in that segment's own frame. */
function groupNearest(segs, toLocal, x, y, z, maxCells) {
  NEAR_SEG = null;
  if (segs.length === 1) {
    const q = toLocal(segs[0], x, y, z);
    if (boxGap(boxOf[segs[0]], q[0], q[1], q[2]) > maxCells * CELL) return Infinity;
    const d = nearest(segCloud[segs[0]], q[0], q[1], q[2], maxCells); NEAR_SEG = segs[0]; NEAR_Q = q; return d;
  }
  // the nearest members first (by their boxes), so most of the others are skipped without a search
  const cand = [];
  for (const s of segs) { const q = toLocal(s, x, y, z), gap = boxGap(boxOf[s], q[0], q[1], q[2]); if (gap < maxCells * CELL) cand.push([gap, s, q]); }
  cand.sort((a, b) => a[0] - b[0]);
  let best = Infinity, at = -1;
  for (const [gap, s, q] of cand) {
    if (gap >= best) break;
    const d = nearest(segCloud[s], q[0], q[1], q[2], Math.max(1, Math.min(maxCells, Math.ceil(Math.min(best, maxCells * CELL) / CELL))));
    if (d < best) { best = d; at = NEAR_AT; NEAR_SEG = s; NEAR_Q = q; }
  }
  NEAR_AT = at;
  return best;
}
const unitNearest = (unit, toLocal, x, y, z, maxCells) => groupNearest(unitSegs[unit], toLocal, x, y, z, maxCells);
const sourceFrame = (s, x, y, z) => [x, y, z];
/** The segment with bones that stands for a segment without (the front thigh muscles' wrap segments: the thigh). */
const boneSegOf = s => (segCloud[s] ? s : segCloud[body.BODY_SEGMENT_PARENT[s]] ? body.BODY_SEGMENT_PARENT[s] : null);

// ---- poses
const rest = body.bodyPostureAngles(baked);
const limits = body.bodyPostureLimits(body.DEFAULT_BODY_POSTURE);
// the targets as the game draws them: the posture's caps, then the knee that gives way under a lifted thigh and the
// slightly bent "straight" elbow and knee (ns-app does the same before it poses the body)
const clampTo = t => { let out = { ...t }; for (const k of Object.keys(out)) { const L = limits[k] || body.BODY_JOINT_LIMITS[k]; if (L) out[k] = Math.min(L[1], Math.max(L[0], out[k])); } if (!RAW) { out = body.passiveKneeAngles(out); out = body.softExtensionAngles(out); } return out; };
const poses = [{ name: 'start posture', joints: {}, set: 'start' }];
const actions = [];
for (const r of BODY_MOTOR_MAP.regions) for (const a of r.actions || []) if (a.joints && Object.keys(a.joints).length) { poses.push({ name: `${r.label}: ${a.label}`, joints: a.joints, set: 'map' }); actions.push({ region: r.label, label: a.label, joints: a.joints }); }
const J = id => { for (const r of BODY_MOTOR_MAP.regions) for (const a of r.actions || []) if (a.id === id) return a.joints || {}; return {}; };
const stack = (...ids) => Object.assign({}, ...ids.map(J));
const add = (set, name, joints, options = null) => poses.push({ name, joints, options, set });
add('stack', 'STACK lift left thigh + swing out + bend knee', stack('rh_hip_flex', 'rh_hip_abduct', 'rh_knee_flex'));
add('stack', 'STACK right arm up + across + bend elbow', stack('lh_shoulder_flex', 'lh_shoulder_adduct', 'lh_elbow_flex'));
add('stack', 'STACK lean back + turn + head back', { trunk_flex: -25, trunk_rot: 40, neck_flex: -60 });
add('stack', 'STACK bend forward + head forward + turn head', { trunk_flex: 90, neck_flex: 50, neck_rot: 80 });
// 18 November 2026 (a check found the chest pulled apart when two trunk movements were stacked from the strip): side
// bend and turn together, to both sides, and with the back straightened.
add('stack', 'STACK trunk bend right + turn right', { trunk_side: -35, trunk_rot: -45 });
add('stack', 'STACK trunk bend left + turn right', { trunk_side: 35, trunk_rot: -45 });
add('stack', 'STACK trunk lean back + bend left + turn left', { trunk_flex: -25, trunk_side: 35, trunk_rot: 45 });
add('stack', 'STACK both knees bent + both thighs lifted', { knee_ext_L: -135, knee_ext_R: -135, hip_flex_L: 110, hip_flex_R: 110 });
add('stack', 'STACK right arm back + out + elbow bent + palm up', { r_shoulder_flex: -50, r_shoulder_abd: 90, r_elbow_flex: 145, r_pronation: 0 });
// 18 November 2026 (package JOINTS): the stacks a player makes easily, the limb turn at both ends and the look's ends.
if (!LEGACY) {
  for (const S of ['L', 'R']) {
    add('more', `MORE ${S} thigh up + out + sole turned in`, { [`hip_flex_${S}`]: 120, [`hip_abd_${S}`]: 45, [`ankle_inv_${S}`]: 35 });
    add('more', `MORE ${S} thigh up + out + knee bent + foot down + toes curled`, { [`hip_flex_${S}`]: 120, [`hip_abd_${S}`]: 45, [`knee_ext_${S}`]: -135, [`ankle_dorsi_${S}`]: -50, [`toe_flex_${S}`]: 40, [`hallux_flex_${S}`]: 45 });
    add('more', `MORE ${S} thigh back + out + knee bent`, { [`hip_flex_${S}`]: -20, [`hip_abd_${S}`]: 45, [`knee_ext_${S}`]: -135 });
    add('more', `MORE ${S} knee straight + thigh up + foot up`, { [`hip_flex_${S}`]: 120, [`knee_ext_${S}`]: 0, [`ankle_dorsi_${S}`]: 20 });
    add('more', `TURN ${S} thigh turned out (limb turn end)`, { [`hip_rot_${S}`]: 45 });
    add('more', `TURN ${S} thigh turned in (limb turn end)`, { [`hip_rot_${S}`]: -40 });
    add('more', `TURN ${S} thigh up + out + turned out`, { [`hip_flex_${S}`]: 120, [`hip_abd_${S}`]: 45, [`hip_rot_${S}`]: 45 });
    add('more', `TURN ${S} thigh up + turned in`, { [`hip_flex_${S}`]: 120, [`hip_rot_${S}`]: -40 });
    add('more', `TURN ${S} thigh back + out + turned out`, { [`hip_flex_${S}`]: -20, [`hip_abd_${S}`]: 45, [`hip_rot_${S}`]: 45 });
    // 18 November 2026: the leg turn of the Space double tap (ns-body LEG_TURN) at both ends, alone and stacked
    add('more', `LEGTURN ${S} foot 90 outward (underside end)`, { [`leg_turn_${S}`]: 70 });
    add('more', `LEGTURN ${S} foot 90 inward (overside end)`, { [`leg_turn_${S}`]: -110 });
    add('more', `LEGTURN ${S} inward + knee bent + thigh lifted`, { [`leg_turn_${S}`]: -110, [`knee_ext_${S}`]: -135, [`hip_flex_${S}`]: 110 });
    add('more', `LEGTURN ${S} outward + thigh out + foot pointed`, { [`leg_turn_${S}`]: 70, [`hip_abd_${S}`]: 45, [`ankle_dorsi_${S}`]: -50 });
  }
  add('more', 'LEGTURN both feet 90 inward', { leg_turn_L: -110, leg_turn_R: -110 });
  add('more', 'LEGTURN both feet 90 outward', { leg_turn_L: 70, leg_turn_R: 70 });
  add('more', 'MORE right arm up + out to the side', { r_shoulder_flex: 180, r_shoulder_abd: 135 });
  add('more', 'MORE right arm out + back', { r_shoulder_flex: -60, r_shoulder_abd: 135 });
  add('more', 'MORE right arm forward + out + elbow bent + palm down + wrist bent', { r_shoulder_flex: 90, r_shoulder_abd: 90, r_elbow_flex: 145, r_pronation: 160, r_wrist_flex: 80 });
  add('more', 'MORE right arm up + elbow bent + palm up + fist', { r_shoulder_flex: 180, r_elbow_flex: 145, r_pronation: 0, ...J('lh_r_grasp') });
  add('more', 'MORE right elbow bent + palm down', { r_elbow_flex: 145, r_pronation: 160 });
  add('more', 'MORE right elbow bent + palm up', { r_elbow_flex: 145, r_pronation: 0 });
  add('more', 'MORE right wrist bent + to the thumb side + fist', { r_wrist_flex: 80, r_wrist_dev: 20, ...J('lh_r_grasp') });
  add('more', 'MORE right wrist back + to the little-finger side + hand open + spread', { r_wrist_ext: 70, r_wrist_flex: 0, r_wrist_dev: -30, ...J('lh_r_open'), r_finger_spread: 20 });
  add('more', 'TURN right arm turned out (limb turn end)', { r_shoulder_rot: 90 });
  add('more', 'TURN right arm turned in (limb turn end)', { r_shoulder_rot: -70 });
  add('more', 'TURN right arm out to the side + turned out', { r_shoulder_abd: 135, r_shoulder_rot: 90 });
  add('more', 'TURN right arm up + turned in', { r_shoulder_flex: 180, r_shoulder_rot: -70 });
  // 18 November 2026, late (package TURN): the limb switch turns the whole arm over (ns-dance ARM_TURN): its overside end
  // from the start (the start posture is the underside end), and the overside with the arm raised or out to the side
  // (the upper arm's turn then narrowed as the game narrows it, ns-dance shoulderTurnRange).
  {
    const { ARM_TURN, shoulderTurnRange, shoulderElevationDeg } = await import(repo + '/scene/src/ns-dance.mjs');
    const over = (f, a) => Math.max(ARM_TURN.shoulder.closed, shoulderTurnRange(shoulderElevationDeg(f, a))[0]);
    add('more', 'SWITCH right arm overside (palm down, upper arm turned in)', { r_pronation: 160, r_shoulder_rot: ARM_TURN.shoulder.closed });
    add('more', 'SWITCH right arm up + overside', { r_shoulder_flex: 180, r_pronation: 160, r_shoulder_rot: over(180, 8) });
    add('more', 'SWITCH right arm out to the side + overside', { r_shoulder_abd: 90, r_pronation: 160, r_shoulder_rot: over(37, 90) });
    add('more', 'SWITCH right arm out to the side + underside', { r_shoulder_abd: 90, r_pronation: 0, r_shoulder_rot: ARM_TURN.shoulder.open });
    add('more', 'SWITCH right elbow bent + overside', { r_elbow_flex: 145, r_pronation: 160, r_shoulder_rot: ARM_TURN.shoulder.closed });
  }
  add('more', 'MORE trunk bent forward + turned left', { trunk_flex: 90, trunk_rot: 45 });
  add('more', 'MORE trunk bent forward + bent right + turned right', { trunk_flex: 90, trunk_side: -35, trunk_rot: -45 });
  add('more', 'MORE trunk arched back + turned right', { trunk_flex: -25, trunk_rot: -45 });
  add('more', 'MORE trunk straight', { trunk_flex: 0 });
  add('more', 'MORE back arched + head bowed', { trunk_flex: -25, neck_flex: 50 });
  add('more', 'MORE back arched + head bowed + turned left', { trunk_flex: -25, neck_flex: 50, neck_rot: 80 });
  add('more', 'MORE back straight + head bowed + tilted right', { trunk_flex: 0, neck_flex: 50, neck_side: -45 });
  add('more', 'MORE head back + turned left', { neck_flex: -60, neck_rot: 80 });
  add('more', 'MORE head back + turned right + tilted right', { neck_flex: -60, neck_rot: -80, neck_side: -45 });
  add('more', 'MORE head forward + turned right + tilted left + jaw open', { neck_flex: 50, neck_rot: -80, neck_side: 45, jaw_open: 30 });
  add('more', 'MORE jaw open + shifted left', { jaw_open: 30, jaw_side: 10 });
  // the look: the neck to its end, then the chest turn (lookTwistDeg) and the trunk bend (lookBendDeg) that follow it
  const tw = body.LOOK_TWIST_LIMIT_DEG;
  add('more', 'LOOK far left (neck + chest turn)', { neck_rot: 80 }, { lookTwistDeg: tw });
  add('more', 'LOOK far right (neck + chest turn)', { neck_rot: -80 }, { lookTwistDeg: -tw });
  add('more', 'LOOK down (neck + trunk bend)', { neck_flex: 50 }, { lookBendDeg: Math.max(0, Math.min(20, body.BODY_JOINT_LIMITS.trunk_flex[1] - (rest.trunk_flex || 0))), lookBendDirDeg: 0 });
  add('more', 'LOOK up (neck + trunk lean)', { neck_flex: -60 }, { lookBendDeg: -20, lookBendDirDeg: 0 });
  add('more', 'LOOK far left and down', { neck_rot: 80, neck_flex: 50 }, { lookTwistDeg: tw });
  add('more', 'LOOK far right and up', { neck_rot: -80, neck_flex: -60 }, { lookTwistDeg: -tw });
}
if (COMBOS && !LEGACY) {
  // every pair of map movements on the same limb that set different joints
  const limbOf = a => { const ids = Object.keys(a.joints); return ids.every(k => /_L$/.test(k)) ? 'left leg' : ids.every(k => /_R$/.test(k)) ? 'right leg' : ids.every(k => /^r_(shoulder|elbow|pronation|wrist)/.test(k)) || /^Right hand$/.test(a.region) ? 'right arm' : ids.every(k => /^(trunk|neck|jaw)_/.test(k)) ? 'trunk and head' : null; };
  const seen = new Set(poses.map(p => JSON.stringify(Object.entries(clampTo({ ...rest, ...p.joints })).sort())));
  const byLimb = {};
  for (const a of actions) { const l = limbOf(a); if (l) (byLimb[l] || (byLimb[l] = [])).push(a); }
  for (const [limb, list] of Object.entries(byLimb)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (Object.keys(a.joints).some(k => k in b.joints)) continue;
    const joints = { ...a.joints, ...b.joints }, key = JSON.stringify(Object.entries(clampTo({ ...rest, ...joints })).sort());
    if (seen.has(key)) continue; seen.add(key);
    add('combo', `PAIR ${limb}: ${a.label} + ${b.label}`, joints);
  }
}
const startTargets = clampTo({ ...rest });
const chosen = ONLY ? poses.filter((p, i) => i === 0 || ONLY.test(p.name)) : poses;

// ---- pose every chosen pose's segments first: which bones moved against which decides what has to be measured
const poseSegs = p => body.poseBodySegments(rig, clampTo({ ...rest, ...p.joints }), { baked, ...(p.options || {}) });
const startSeg = poseSegs(poses[0]), startInv = Object.fromEntries(SEGS.map(s => [s, rigidInv(startSeg[s])]));
function moveClasses(seg) { // segments with the same rigid motion since the start posture get the same number
  const ids = new Map(), out = {};
  for (const s of SEGS) { const d = mul(seg[s], startInv[s]); let k = ''; for (let i = 0; i < 15; i++) if (i % 4 !== 3) k += Math.round(d[i] * (i < 12 ? 2e4 : 200)) + ','; if (!ids.has(k)) ids.set(k, ids.size); out[s] = ids.get(k); }
  return out;
}
for (const p of chosen) { try { p.seg = poseSegs(p); p.cls = moveClasses(p.seg); } catch (e) { p.error = String(e && e.message || e).slice(0, 200); } }
const split = (cls, segs) => { let c = -1; for (const s of segs) { if (c < 0) c = cls[s]; else if (cls[s] !== c) return true; } return false; };

// ---- A. muscles: attachment samples on each candidate unit's bones; C, D, E: edge and vertex samples
const muscles = [];
for (const mu of rig.muscles) {
  const info = rig.meshSegment[mu.id]; if (!info || info.kind !== 'muscle') continue;
  const mesh = inputs.meshesById.get(mu.id); if (!mesh) continue;
  const p = mesh.positions, w = body.bodySkinWeights(rig, mu.id, p);
  const cands = [...new Set((info.candidates || []).filter(s => segCloud[s]).map(unitOf))];
  // every segment whose motion matters to this muscle: the bones it is skinned to and the bones it is measured against
  const used = new Set(info.candidates || []);
  if (w) for (let v = 0; v < w.i0.length; v++) { used.add(SEGS[w.i0[v]]); used.add(SEGS[w.i1[v]]); }
  for (const c of cands) for (const s of unitSegs[c]) used.add(s);
  muscles.push({ id: mu.id, name: mu.name, p, ix: mesh.indices || null, w, cands, used: [...used], rigidSeg: info.segment, twisted: Boolean(w && w.tf), att: null, wall: info.skin === 'wall', wallSegs: info.skin === 'wall' ? (info.candidates || []).filter(s => segCloud[s]) : null });
}
const needed = m => chosen.some(p => p.cls && split(p.cls, m.used));
function setUp(m) {
  if (m.att) return;
  const p = m.p, att = [], step = Math.max(1, Math.floor(p.length / 3 / 1500));
  for (const s of m.cands) {
    let n = 0;
    for (let v = 0; v < p.length / 3 && n < 220; v += step) {
      const d = unitNearest(s, sourceFrame, p[3 * v], p[3 * v + 1], p[3 * v + 2], 1);
      if (d < 6) { att.push({ v, seg: s, d0: d }); n++; }
    }
  }
  m.att = att;
  if (RIGID || !m.w) return;
  // C. up to 1500 edges of the surface; D / E. up to 300 vertices with the two bones each hangs from
  const edges = [];
  if (m.ix) { const tris = m.ix.length / 3, ts = Math.max(1, Math.floor(tris / 500)); for (let t = 0; t < tris; t += ts) { const a = m.ix[3 * t], b = m.ix[3 * t + 1], c = m.ix[3 * t + 2]; edges.push(a, b, b, c, c, a); } }
  m.edges = Uint32Array.from(edges);
  const vs = Math.max(1, Math.floor(p.length / 3 / 300)), samples = [];
  for (let v = 0; v < p.length / 3; v += vs) {
    // (a belly-wall muscle is carried by the breastbone and the pelvis wherever it is: "its bones" for D and E are
    // all the bones it can lie on)
    if (m.wall) { samples.push({ v, a: null, b: null }); continue; }
    const a = boneSegOf(SEGS[m.w.i0[v]]), b = boneSegOf(SEGS[m.w.i1[v]]);
    if (a) samples.push({ v, a: unitOf(a), b: b && b !== a ? unitOf(b) : null });
  }
  m.samples = samples;
  // the source shape's own edge lengths, distances to both bones and depths under a bone
  m.len0 = new Float32Array(m.edges.length / 2);
  for (let e = 0; e < m.len0.length; e++) { const a = 3 * m.edges[2 * e], b = 3 * m.edges[2 * e + 1]; m.len0[e] = Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]); }
  [m.both0, m.under0] = bothAndUnder(m, p, sourceFrame);
}
function bothAndUnder(m, pos, frame) {
  const both = new Float32Array(m.samples.length), under = new Float32Array(m.samples.length);
  m.samples.forEach((s, i) => {
    const x = pos[3 * s.v], y = pos[3 * s.v + 1], z = pos[3 * s.v + 2];
    let dMin = Infinity, deep = 0;
    for (const u of m.wall ? ['*'] : [s.a, s.b]) {
      if (!u) continue;
      const d = u === '*' ? groupNearest(m.wallSegs, frame, x, y, z, 6) : unitNearest(u, frame, x, y, z, 6);
      if (d < dMin) dMin = d;
      if (d < 14 && NEAR_AT >= 0) { const c = segCloud[NEAR_SEG], n = c.n, at = NEAR_AT, sd = (NEAR_Q[0] - c.p[at]) * n[at] + (NEAR_Q[1] - c.p[at + 1]) * n[at + 1] + (NEAR_Q[2] - c.p[at + 2]) * n[at + 2]; if (-sd > deep) deep = -sd; }
    }
    both[i] = Math.min(dMin, 70); under[i] = deep;
  });
  return [both, under];
}
// ---- B. bone pairs that meet at a joint in the source pose: the part of bone A within 30 mm of the other unit's bones
const joints = [];
{
  const segBox = {};
  for (const u of Object.keys(unitSegs)) { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const m of unitSegs[u]) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], boxOf[m][k]); b[3 + k] = Math.max(b[3 + k], boxOf[m][3 + k]); } segBox[u] = b; }
  for (const A of boneList) for (const s of Object.keys(unitSegs)) {
    if (s === unitOf(A.seg)) continue;
    if (!chosen.some(p => p.cls && split(p.cls, [A.seg, ...unitSegs[s]]))) continue; // never moves in the chosen poses
    const near = [], B = segBox[s]; let touch = Infinity;
    for (let i = 0; i < A.pts.length; i += 3) {
      const x = A.pts[i], y = A.pts[i + 1], z = A.pts[i + 2];
      if (x < B[0] - 30 || x > B[3] + 30 || y < B[1] - 30 || y > B[4] + 30 || z < B[2] - 30 || z > B[5] + 30) continue;
      const d = unitNearest(s, sourceFrame, x, y, z, 3); if (d < 30) { near.push(x, y, z); if (d < touch) touch = d; }
    }
    if (near.length >= 30 && touch < 4) {
      const kept = near.length > 900 ? near.slice(0, 900) : near;
      let d0 = Infinity; for (let i = 0; i < kept.length; i += 3) { const d = unitNearest(s, sourceFrame, kept[i], kept[i + 1], kept[i + 2], 3); if (d < d0) d0 = d; }
      joints.push({ a: A, bseg: s, near: kept, d0, segs: [A.seg, ...unitSegs[s]] });
    }
  }
}
// ---- F. body parts, their bones' sample points and their flesh depth
const PARTS = {
  chest: /^(thorax|t\d+|sternum|[rl]_rib\d+|[rl]_cc\d+)$/, loin: /^(lumbar|l[1-4])$/, pelvis: /^pelvis$/, head: /^(skull|mandible)$/,
  'right upper arm': /^r_upperarm$/, 'right forearm': /^r_(forearm|radius)$/, 'right hand': /^r_(hand|thumb_|index_|middle_|ring_|little_)/,
  'right thigh': /^r_(thigh|patella)$/, 'right shin': /^r_shank$/, 'right foot': /^r_(foot|toes|hallux)$/,
  'left thigh': /^l_(thigh|patella)$/, 'left shin': /^l_shank$/, 'left foot': /^l_(foot|toes|hallux)$/
};
const JOINED = [['chest', 'loin'], ['loin', 'pelvis'], ['chest', 'head'], ['chest', 'right upper arm'], ['right upper arm', 'right forearm'], ['right forearm', 'right hand'],
  ['pelvis', 'right thigh'], ['right thigh', 'right shin'], ['right shin', 'right foot'], ['pelvis', 'left thigh'], ['left thigh', 'left shin'], ['left shin', 'left foot'], ['chest', 'pelvis'], ['loin', 'right thigh'], ['loin', 'left thigh']];
const parts = {};
for (const [name, re] of Object.entries(PARTS)) {
  const segs = Object.keys(segCloud).filter(s => re.test(s)); if (!segs.length) continue;
  const pts = [];
  for (const s of segs) { const p = segPoints[s], st = 3 * Math.max(1, Math.floor(p.length / 3 / Math.ceil(360 / segs.length))); for (let i = 0; i < p.length; i += st) pts.push(s, p[i], p[i + 1], p[i + 2]); }
  // flesh depth: how far this part's own muscle surface lies from its own bones (80th percentile, source pose)
  const ds = [];
  for (const m of muscles) { if (!re.test(m.rigidSeg)) continue; const st = Math.max(1, Math.floor(m.p.length / 3 / 60)); for (let v = 0; v < m.p.length / 3; v += st) { const d = groupNearest(segs, sourceFrame, m.p[3 * v], m.p[3 * v + 1], m.p[3 * v + 2], 8); if (d < Infinity) ds.push(d); } }
  ds.sort((a, b) => a - b);
  parts[name] = { name, segs, pts, flesh: ds.length ? Math.round(ds[Math.floor(ds.length * 0.8)]) : 5 };
}
const partPairs = [];
{ const names = Object.keys(parts); for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (!JOINED.some(q => (q[0] === names[i] && q[1] === names[j]) || (q[1] === names[i] && q[0] === names[j]))) partPairs.push([parts[names[i]], parts[names[j]]]); }

// ---- the muscle as the game draws it: the BAKED start shape (whose posture displacement the bake smooths), carried
// by each vertex's two bones from the baked posture to this pose (ns-scene-three skinOne does the same)
const bakedInv = SEGS.map(s => rigidInv(baked.segments.get(s)));
// 18 November 2026: the right forearm's and hand's muscles are measured too. A vertex's ulna influence is the ulna
// frame turned by the vertex's own fraction of the radius' turn (ns-body R_FOREARM_TWIST), at the bake and now, as the
// scene's skin does it (ns-scene-three skinTwisted).
const SEG_RF = SEGS.indexOf('r_forearm');
let twistBaked = null;
function twistRel(m, segObj) {
  const tw = m.w.twist;
  if (!twistBaked) twistBaked = body.rForearmTwistTable(baked.segments.get('r_forearm'), baked.segments.get('r_radius'), tw);
  const now = body.rForearmTwistTable(segObj.r_forearm, segObj.r_radius, tw), cache = new Map();
  return f => {
    const k = Math.round(Math.min(1, f) * 256);
    if (!cache.has(k)) cache.set(k, mul(body.rForearmTwistMap(now, k / 256, new Float64Array(16)), rigidInv(body.rForearmTwistMap(twistBaked, k / 256, new Float64Array(16)))));
    return cache.get(k);
  };
}
function drawnSkin(m, rel, segObj) {
  const b = baked.meshesById.get(m.id).positions, w = m.w, n = b.length / 3, out = new Float32Array(b.length);
  const tf = w.tf || null, tr = tf ? twistRel(m, segObj) : null;
  for (let v = 0, k = 0; v < n; v++, k += 3) {
    const tw = tf && tf[v] > 0;
    const A = tw && w.i0[v] === SEG_RF ? tr(tf[v]) : rel[w.i0[v]], B = tw && w.i1[v] === SEG_RF ? tr(tf[v]) : rel[w.i1[v]], wa = w.w0[v], wb = w.w1[v], x = b[k], y = b[k + 1], z = b[k + 2];
    out[k] = wa * (A[0] * x + A[4] * y + A[8] * z + A[12]) + wb * (B[0] * x + B[4] * y + B[8] * z + B[12]);
    out[k + 1] = wa * (A[1] * x + A[5] * y + A[9] * z + A[13]) + wb * (B[1] * x + B[5] * y + B[9] * z + B[13]);
    out[k + 2] = wa * (A[2] * x + A[6] * y + A[10] * z + A[14]) + wb * (B[2] * x + B[6] * y + B[10] * z + B[14]);
  }
  return out;
}
// ---- measuring one pose
function measure(p, isStart) {
  const targets = clampTo({ ...rest, ...p.joints });
  const segObj = p.seg, cls = p.cls, inv = {};
  const invOf = s => inv[s] || (inv[s] = rigidInv(segObj[s]));
  const posedFrame = (s, x, y, z) => apply(invOf(s), x, y, z);
  const rel = SEGS.map((s, i) => mul(segObj[s], bakedInv[i])); // baked start shape -> this pose, per bone
  const det = RIGID ? body.poseBodyDetailed(rig, targets, { baked, ...(p.options || {}) }) : null;
  const muscleNow = {}, jointNow = {}, shape = {}, through = {};
  for (const m of muscles) {
    if (isStart ? !needed(m) : !split(cls, m.used)) continue;
    setUp(m);
    if (!m.att.length && !m.samples) continue;
    let pos = null;
    if (RIGID) { const M = det.matrices.get(m.id), bp = baked.meshesById.get(m.id).positions; pos = new Float32Array(bp.length); for (let i = 0; i < bp.length; i += 3) { const q = apply(M, bp[i], bp[i + 1], bp[i + 2]); pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2]; } }
    else if (m.w) pos = drawnSkin(m, rel, segObj);
    for (const a of m.att) {
      let x, y, z;
      if (pos) { x = pos[3 * a.v]; y = pos[3 * a.v + 1]; z = pos[3 * a.v + 2]; }
      else { [x, y, z] = apply(segObj[m.rigidSeg], m.p[3 * a.v], m.p[3 * a.v + 1], m.p[3 * a.v + 2]); }
      const d = unitNearest(a.seg, posedFrame, x, y, z, 6) - a.d0, k = m.name + '>' + a.seg;
      if (!(muscleNow[k] >= d)) muscleNow[k] = d;
    }
    if (!pos || !m.samples) continue;
    // C. edge lengths, D. distance to both bones, E. depth under a bone's surface, each against the source shape
    const E = m.edges, len = new Float32Array(E.length / 2);
    for (let e = 0; e < len.length; e++) { const a = 3 * E[2 * e], b = 3 * E[2 * e + 1]; len[e] = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]); }
    const [both, under] = bothAndUnder(m, pos, posedFrame);
    let stretch = 0, over = 0, n = 0, away = 0, awayN = 0, sunk = 0, sunkN = 0;
    // (an edge counts as stretched only when it is also at least 6 mm longer than in the source shape: a hair-fine
    // edge of half a millimetre drawn one and a half millimetres long is not a point or a web)
    for (let e = 0; e < len.length; e++) { if (m.len0[e] < 0.5) continue; const r = len[e] / m.len0[e]; n++; if (len[e] - m.len0[e] < 6) continue; if (r > stretch) stretch = r; if (r > 1.6) over++; }
    for (let i = 0; i < both.length; i++) { const a = both[i] - m.both0[i]; if (a > away) away = a; if (a > 12) awayN++; const u = under[i] - m.under0[i]; if (u > sunk) sunk = u; if (u > 5) sunkN++; }
    shape[m.name] = { stretch: Math.round(stretch * 100) / 100, overShare: n ? Math.round(1000 * over / n) / 1000 : 0, away: Math.round(away * 10) / 10, awayShare: Math.round(1000 * awayN / both.length) / 1000, sunk: Math.round(sunk * 10) / 10, sunkShare: Math.round(1000 * sunkN / both.length) / 1000 };
  }
  for (const j of joints) {
    if (!isStart && !split(cls, j.segs)) continue;
    const mA = segObj[j.a.seg]; let closest = Infinity;
    for (let i = 0; i < j.near.length; i += 3) { const w = apply(mA, j.near[i], j.near[i + 1], j.near[i + 2]); const d = unitNearest(j.bseg, posedFrame, w[0], w[1], w[2], 6); if (d < closest) closest = d; }
    jointNow[j.a.id + '>' + j.bseg] = closest;
  }
  // F. bones of two parts that are not joined, nearer than their flesh allows
  for (const [A, B] of partPairs) {
    if (isStart ? !chosen.some(q => q.cls && split(q.cls, [...A.segs, ...B.segs])) : !split(cls, [...A.segs, ...B.segs])) continue;
    let closest = Infinity;
    for (let i = 0; i < A.pts.length; i += 4) { const w = apply(segObj[A.pts[i]], A.pts[i + 1], A.pts[i + 2], A.pts[i + 3]); const d = groupNearest(B.segs, posedFrame, w[0], w[1], w[2], 12); if (d < closest) closest = d; }
    through[A.name + ' / ' + B.name] = Math.round(Math.min(closest, 130) * 10) / 10;
  }
  const changed = Object.fromEntries(Object.entries(targets).filter(([k, v]) => Math.abs(v - (startTargets[k] || 0)) > 0.5).map(([k, v]) => [k, Math.round(v)]));
  // what the game's own clamp made of the targets (the combined-range rule shows here)
  const applied = body.clampBodyJointTargets(targets), cut = applied.clamped.filter(c => Math.abs(c.requested - c.applied) > 0.5).map(c => `${c.id} ${Math.round(c.requested)} -> ${Math.round(c.applied)}`);
  return { name: p.name, set: p.set, joints: changed, cut, options: p.options || null, muscleNow, jointNow, shape, through };
}
const t1 = Date.now(), results = [];
chosen.forEach((p, i) => { if (p.error) { results.push({ name: p.name, set: p.set, error: p.error }); return; } try { results.push(measure(p, i === 0)); } catch (e) { results.push({ name: p.name, set: p.set, error: String(e && e.stack || e).slice(0, 300) }); } });

// ---- report: everything as the change from the start posture
const base = results[0];
const rows = [];
for (const r of results.slice(1)) {
  if (r.error) continue;
  let wm = { mm: 0 }, wj = { mm: 0 }; const loose = [], gaps = [];
  for (const [k, d] of Object.entries(r.muscleNow)) { const x = d - (base.muscleNow[k] || 0); if (x > 8) loose.push({ end: k, mm: Math.round(x) }); if (x > wm.mm) wm = { mm: Math.round(x * 10) / 10, end: k }; }
  for (const [k, d] of Object.entries(r.jointNow)) { const x = d - (base.jointNow[k] || 0); if (x > 5) gaps.push({ joint: k, mm: Math.round(x) }); if (x > wj.mm) wj = { mm: Math.round(x * 10) / 10, joint: k }; }
  let ws = { ratio: 0 }, wa = { mm: 0 }, wu = { mm: 0 }; const spikes = [], blades = [], sunk = [];
  for (const [k, s] of Object.entries(r.shape)) {
    const b = base.shape[k] || { stretch: 1, away: 0, sunk: 0 };
    if (s.stretch > 2.5 && s.stretch > 1.25 * b.stretch) { spikes.push({ muscle: k, ratio: s.stretch, share: s.overShare, atStart: b.stretch }); if (s.stretch > ws.ratio) ws = { ratio: s.stretch, muscle: k, share: s.overShare, atStart: b.stretch }; }
    if (s.away > 12 && s.away - b.away > 5) { blades.push({ muscle: k, mm: s.away, share: s.awayShare, atStart: b.away }); if (s.away > wa.mm) wa = { mm: s.away, muscle: k, share: s.awayShare, atStart: b.away }; }
    if (s.sunk > 5 && s.sunkShare >= 0.02 && s.sunk - b.sunk > 3) { sunk.push({ muscle: k, mm: s.sunk, share: s.sunkShare, atStart: b.sunk }); if (s.sunk > wu.mm) wu = { mm: s.sunk, muscle: k, share: s.sunkShare, atStart: b.sunk }; }
  }
  const pressed = [];
  for (const [k, d] of Object.entries(r.through)) { const [a, b] = k.split(' / '), room = parts[a].flesh + parts[b].flesh, d0 = base.through[k] === undefined ? 130 : base.through[k], inNow = room - d, in0 = room - d0; if (inNow > 10 && inNow - Math.max(0, in0) > 5) pressed.push({ parts: k, bonesMm: d, fleshMm: room, deepMm: Math.round(inNow), atStartMm: d0 }); }
  rows.push({ name: r.name, set: r.set, joints: r.joints, cut: r.cut, worstMuscle: wm, loose: loose.sort((a, b) => b.mm - a.mm), worstJoint: wj, gaps: gaps.sort((a, b) => b.mm - a.mm),
    worstStretch: ws, spikes: spikes.sort((a, b) => b.ratio - a.ratio), worstAway: wa, blades: blades.sort((a, b) => b.mm - a.mm), worstSunk: wu, sunk: sunk.sort((a, b) => b.mm - a.mm), pressed: pressed.sort((a, b) => b.deepMm - a.deepMm) });
}
const names = id => { const b = boneList.find(x => x.id === id); return b ? b.name : id; };
const measured = muscles.filter(m => m.att && m.att.length).length;
console.log(`poses ${results.length} in ${Date.now() - t1} ms (whole run ${Date.now() - T0} ms wall, ${Math.round((u => (u.user + u.system) / 1000)(process.cpuUsage(CPU0)))} ms of processor time); muscles measured ${measured} of ${muscles.length} (skinned ${muscles.filter(m => m.w).length}); joint pairs ${joints.length}${ONLY ? ' (only what moves in the chosen poses)' : ''}`);
console.log('errors', results.filter(r => r.error).map(r => r.name + ': ' + r.error).join(' | ') || 'none');
const count = (list, f) => `${list.filter(f).length} of ${list.length}`;
const sets = [['the 117 poses of the earlier sweep (map + nine stacks)', r => r.set === 'map' || r.set === 'stack'], ['easy stacks, limb turn, look', r => r.set === 'more'], ['pairs on one limb (--combos)', r => r.set === 'combo']];
for (const [label, f] of sets) {
  const L = rows.filter(f); if (!L.length) continue;
  console.log(`=== ${label}: ${L.length} poses`);
  console.log('  A. a muscle end more than 8 mm farther from its bone than at the start:', count(L, r => r.loose.length));
  console.log('  B. a joint more than 5 mm farther apart than at the start:', count(L, r => r.gaps.length));
  if (!RIGID) {
    console.log('  C. a muscle edge stretched to more than 2.5 times its source length (and a quarter more than at the start):', count(L, r => r.spikes.length));
    console.log('  D. a muscle vertex more than 12 mm farther from both its bones than in the source shape (and 5 mm more than at the start):', count(L, r => r.blades.length));
    console.log('  E. a muscle more than 5 mm deeper under its own bone (2 % of its vertices or more, 3 mm more than at the start; estimate):', count(L, r => r.sunk.length));
  }
  console.log('  F. two parts more than 10 mm inside each other, and 5 mm more than at the start (estimate):', count(L, r => r.pressed.length));
  console.log('  the combined-range rule cut a target:', count(L, r => r.cut.length));
}
console.log(`flesh depth used for F (mm, 80th percentile of a part's own muscle surface from its own bones): ${Object.values(parts).map(p => `${p.name} ${p.flesh}`).join(', ')}`);
// 18 November 2026: the start posture itself, against the anatomical source pose the meshes come in (the start posture
// bends the whole spine, so what it does to the muscle ends and the joints is worth its own lines).
{
  const ends = Object.entries(base.muscleNow).map(([k, d]) => [k, Math.round(d * 10) / 10]).sort((a, b) => b[1] - a[1]);
  const d0 = Object.fromEntries(joints.map(j => [j.a.id + '>' + j.bseg, j.d0]));
  const gaps = Object.entries(base.jointNow).map(([k, d]) => { const [id, sg] = k.split('>'); return [`${names(id)} from ${sg}`, Math.round((d - d0[k]) * 10) / 10]; }).sort((a, b) => b[1] - a[1]);
  console.log('--- the start posture itself, against the source pose');
  console.log(`muscle ends more than 8 mm farther from their bone than in the source pose: ${ends.filter(e => e[1] > 8).length} of ${ends.length}; largest: ${ends.slice(0, 6).map(e => `${e[1]} mm ${e[0]}`).join(' | ')}`);
  console.log(`joints more than 5 mm farther apart than in the source pose: ${gaps.filter(e => e[1] > 5).length} of ${gaps.length}; largest: ${gaps.slice(0, 8).map(e => `${e[1]} mm ${e[0]}`).join(' | ')}`);
  if (!RIGID) {
    const sh = Object.entries(base.shape);
    const list = (key, n) => sh.slice().sort((a, b) => b[1][key] - a[1][key]).slice(0, n).map(([k, v]) => `${v[key]} ${k}`).join(' | ');
    console.log(`muscles with an edge over 2.5 times its source length: ${sh.filter(e => e[1].stretch > 2.5).length} of ${sh.length}; largest: ${list('stretch', 6)}`);
    console.log(`muscles with a vertex over 12 mm farther from both its bones than in the source shape: ${sh.filter(e => e[1].away > 12).length} of ${sh.length}; largest (mm): ${list('away', 6)}`);
    console.log(`muscles more than 5 mm deeper under their own bone than in the source shape (estimate): ${sh.filter(e => e[1].sunk > 5 && e[1].sunkShare >= 0.02).length} of ${sh.length}; largest (mm): ${list('sunk', 6)}`);
  }
}
const J_ = r => JSON.stringify(r.joints) + (r.options ? ' ' + JSON.stringify(r.options) : '') + (r.cut.length ? ` [rule: ${r.cut.join('; ')}]` : '');
const top = (key, n) => rows.slice().sort((a, b) => key(b) - key(a)).slice(0, n).filter(r => key(r) > 0);
console.log('--- A. largest muscle-end changes');
for (const r of top(r => r.worstMuscle.mm, 16)) console.log(`${r.worstMuscle.mm} mm  ${r.worstMuscle.end}  | ${r.name} ${J_(r)} (${r.loose.length} ends over 8 mm)`);
console.log('--- B. largest joint openings');
for (const r of top(r => r.worstJoint.mm, 14)) { const [id, sg] = (r.worstJoint.joint || '>').split('>'); console.log(`${r.worstJoint.mm} mm  ${names(id)} from ${sg}  | ${r.name} ${J_(r)}`); }
if (!RIGID) {
  console.log('--- C. largest stretch of a muscle edge (times its source length; share of the muscle\'s sampled edges over 1.6 times and 6 mm longer; the same muscle at the start)');
  for (const r of top(r => r.worstStretch.ratio, 12)) console.log(`x${r.worstStretch.ratio}  ${r.worstStretch.muscle} (${Math.round(1000 * r.worstStretch.share) / 10} %; start x${r.worstStretch.atStart})  | ${r.name} ${J_(r)}`);
  console.log('--- D. farthest a muscle vertex stands from both its bones, beyond the source shape (share of its sampled vertices over 12 mm; the same muscle at the start)');
  for (const r of top(r => r.worstAway.mm, 12)) console.log(`${r.worstAway.mm} mm  ${r.worstAway.muscle} (${Math.round(1000 * r.worstAway.share) / 10} %; start ${r.worstAway.atStart})  | ${r.name} ${J_(r)}`);
  console.log('--- E. deepest a muscle lies under its own bone, beyond the source shape (estimate; share of its sampled vertices over 5 mm; the same muscle at the start)');
  for (const r of top(r => (r.sunk[0] ? r.sunk[0].mm : 0), 12)) console.log(`${r.sunk[0].mm} mm  ${r.sunk[0].muscle} (${Math.round(1000 * r.sunk[0].share) / 10} %; start ${r.sunk[0].atStart})  | ${r.name} ${J_(r)}`);
}
console.log('--- F. parts inside each other (estimate: bones nearer than the flesh of both)');
for (const r of top(r => (r.pressed[0] ? r.pressed[0].deepMm : 0), 14)) console.log(`${r.pressed[0].deepMm} mm  ${r.pressed[0].parts} (bones ${r.pressed[0].bonesMm} mm apart, flesh ${r.pressed[0].fleshMm}; at the start ${r.pressed[0].atStartMm})  | ${r.name} ${J_(r)}`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
if (jsonOut) fs.writeFileSync(jsonOut.replace(/\.json$/, '') + '-start.json', JSON.stringify({ muscleEnds: base.muscleNow, joints: base.jointNow, through: base.through }, null, 1));
