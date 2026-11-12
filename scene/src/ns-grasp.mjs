/** NeuroSurge scene: holding and turning your own limbs (R558, user Message 2: "allow you to manipulate all three items
 * (your individual's body, glass brain, mirror body) with all the control keys ... while grasping limb (your own) ... it
 * will move those accordingly ... Clicking and dragging anything shifts orbit or external/internal rotation (imagine
 * pulling/pushing in a direction or turning a dial around the center point)").
 *
 * Pure maths, no DOM. A held limb (HOLD or TAP Space on it; R558, Message 40) moves its END (the right hand, or a foot at the ankle) toward a target
 * point that W/A/S/D and the look move; solveLimb finds the joint angles that bring the end there, every joint inside
 * its anatomical range (the body rig's limits; nothing goes past them): a small solve over the limb's three joints
 * (two at the root, one bend). A drag on a limb turns it about its own long axis like a dial (rollDeg), through the
 * body's own rotation joints (the Space dance's joints, held like a latch): on the right upper arm its internal /
 * external rotation (r_shoulder_rot), on the right forearm or hand the forearm turn (pronation / supination,
 * r_pronation), on a leg its hip rotation (internal / external, hip_rot_R / hip_rot_L). The left arm is the game arm:
 * holding it is the ordinary W/A/S/D reach, and turning it activates the palm-down / palm-up areas (the app does that
 * through the activity).
 *
 * The joint names and limits are ns-body's (BODY_JOINT_LIMITS, degrees, game-safe values inside commonly quoted adult
 * ranges of motion; not measured on this body or on the player). Nothing here is measured movement or force.
 */

/** The limbs that can be held (ids used by the app and the texts). */
export const LIMB_IDS = Object.freeze(['rightArm', 'leftArm', 'rightLeg', 'leftLeg']);

/**
 * The solved limbs: joints (two root joints and the bend), the root pivot (shoulder / hip), the bend joint and its sign
 * (+1: flexion is positive, as r_elbow_flex; -1: flexion is negative, as knee_ext), the end point (a pivot or a
 * segment's rest centre carried by a segment), and the dial: the rotation joint a drag across the limb turns, the
 * sign that maps a right-handed turn about root -> end onto that joint (r_pronation counts toward palm down, so a
 * supinating turn lowers it; hip_rot_L counts external positive, which is a left-handed turn for the left leg), and
 * the motor area lit when no body-map action moves that joint. upperDial: a press on the right UPPER arm turns the
 * upper arm (r_shoulder_rot) instead of the forearm.
 */
export const LIMB_CHAIN = Object.freeze({
  rightArm: Object.freeze({ joints: Object.freeze(['r_shoulder_flex', 'r_shoulder_abd', 'r_elbow_flex']), root: 'r_glenohumeral', rootSeg: 'r_upperarm',
    bend: 'r_elbow_flex', bendSign: 1, bendPivot: 'r_elbow', endSeg: 'r_hand', endCentreOf: 'r_hand', side: 'right',
    dial: Object.freeze({ joint: 'r_pronation', sign: -1, area: 'lh_forearm' }), upperDial: Object.freeze({ joint: 'r_shoulder_rot', sign: 1, area: 'lh_shoulder' }) }),
  rightLeg: Object.freeze({ joints: Object.freeze(['hip_flex_R', 'hip_abd_R', 'knee_ext_R']), root: 'r_hip', rootSeg: 'r_thigh',
    bend: 'knee_ext_R', bendSign: -1, bendPivot: 'r_knee', endSeg: 'r_shank', endPivot: 'r_ankle', side: 'right',
    dial: Object.freeze({ joint: 'hip_rot_R', sign: 1, area: 'lh_hip' }) }),
  leftLeg: Object.freeze({ joints: Object.freeze(['hip_flex_L', 'hip_abd_L', 'knee_ext_L']), root: 'l_hip', rootSeg: 'l_thigh',
    bend: 'knee_ext_L', bendSign: -1, bendPivot: 'l_knee', endSeg: 'l_shank', endPivot: 'l_ankle', side: 'left',
    dial: Object.freeze({ joint: 'hip_rot_L', sign: -1, area: 'rh_hip' }) })
});

/** Display choices for holding and turning a limb.
 *  speedMps: how fast W/A/S/D move a held limb's end (metres per second).
 *  solveIters / tolMm / lambdaMm / stepCapDeg / probeDeg: the joint solve (damped least squares on a numerical
 *    Jacobian; at most stepCapDeg per joint per iteration; probe of probeDeg for each Jacobian column).
 *  rollDegPerPx: degrees of turn per CSS pixel of drag across the limb (about a quarter turn for a 230 px drag).
 *  (No floor: a held limb goes wherever its joints let it; the earlier groundMarginMm went with the leg ground model.)
 */
export const LIMB_GRASP = Object.freeze({
  speedMps: 0.35, solveIters: 6, tolMm: 0.5, lambdaMm: 8, stepCapDeg: 12, probeDeg: 0.5,
  rollDegPerPx: 0.4
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** A point of the posed limb (drawn mm): the root ('root'), the bend ('bend') or the end ('end'). */
export function limbPoint(rig, segments, limb, which) {
  const c = LIMB_CHAIN[limb];
  if (!c) throw new Error(`ns:grasp: unknown solved limb ${JSON.stringify(limb)}`);
  const P = k => (rig.pivots[k] && rig.pivots[k].point) || null;
  if (which === 'root') return apply(segments[c.rootSeg], P(c.root));
  if (which === 'bend') return apply(segments[c.rootSeg], P(c.bendPivot));
  const p = c.endPivot ? P(c.endPivot) : rig.segments[c.endCentreOf] && rig.segments[c.endCentreOf].restCentroid;
  if (!p) throw new Error(`ns:grasp: the rig has no end point for ${limb}`);
  return apply(segments[c.endSeg], p);
}

/** Solve 3x3 (J J^T + l^2 I) y = e and return J^T y (damped least squares step). J: 3 x n columns (arrays of 3). */
function dlsStep(J, e, lambda) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const c of J) for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) A[i][k] += c[i] * c[k];
  for (let i = 0; i < 3; i++) A[i][i] += lambda * lambda;
  // Cramer's rule (3x3).
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (!(Math.abs(D) > 1e-12)) return J.map(() => 0);
  const y = [0, 1, 2].map(k => det(A.map((row, i) => row.map((v, j) => (j === k ? e[i] : v)))) / D);
  return J.map(c => c[0] * y[0] + c[1] * y[1] + c[2] * y[2]);
}

/**
 * Joint angles that bring the limb's end to targetMm (drawn mm), each inside limits[id] = [lo, hi] (degrees).
 * segmentsFor(targets) -> the posed segments for a full targets object (ns-body poseBodySegments with the drawn
 * options). The bend joint comes from the distance root -> target (law of cosines on the posed upper / lower lengths,
 * counted from the inner angle the limb has now; see the bend step below), so a straight elbow or knee bends when the end is pulled in and straightens when it is pushed out; then a few damped
 * least-squares steps over the two root joints point the limb at the target. (A first version solved all three joints
 * together; with the arm straight forward and the end lifted it folded the elbow a little every frame until the hand
 * was at the face, so the bend is now left to the distance alone.) Returns { joints: { id: deg } (the limb's three joints), endMm (where the end now is), errorMm, iterations }.
 */
export function solveLimb({ rig, segmentsFor, targets, limb, targetMm, limits, opts = LIMB_GRASP }) {
  const c = LIMB_CHAIN[limb];
  if (!c) throw new Error(`ns:grasp: unknown solved limb ${JSON.stringify(limb)}`);
  if (!targetMm || targetMm.length !== 3 || !targetMm.every(Number.isFinite)) throw new Error('ns:grasp: targetMm must be finite mm');
  const lim = id => (limits && limits[id] ? limits[id] : [-180, 180]);
  const q = { ...targets };
  for (const id of c.joints) q[id] = clamp(Number.isFinite(q[id]) ? q[id] : 0, lim(id)[0], lim(id)[1]);
  let seg = segmentsFor(q);
  // The bend, from the distance root -> target.
  {
    const root = limbPoint(rig, seg, limb, 'root'), bend = limbPoint(rig, seg, limb, 'bend'), end = limbPoint(rig, seg, limb, 'end');
    const L1 = len(sub(bend, root)), L2 = len(sub(end, bend)), D = clamp(len(sub(targetMm, root)), Math.abs(L1 - L2) + 1e-6, L1 + L2 - 1e-6);
    const angleAt = d => Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1)) * 180 / Math.PI;
    // The end point (the hand's centre, the ankle) is not exactly on the line of the lower segment, so a straight limb
    // is not a 180-degree triangle: measure the inner angle now and count the bend from it (a bend of b degrees closes
    // the inner angle by b), so the distance the limb has now asks for exactly the bend it has now (no drift).
    const innerNow = angleAt(clamp(len(sub(end, root)), Math.abs(L1 - L2) + 1e-6, L1 + L2 - 1e-6));
    const inner = angleAt(D);
    const want = clamp(q[c.bend] + c.bendSign * (innerNow - inner), lim(c.bend)[0], lim(c.bend)[1]);
    if (Math.abs(want - q[c.bend]) > 0.05) { q[c.bend] = want; seg = segmentsFor(q); }
  }
  // Then the two root joints point the limb at the target (the bend stays as the distance asks: pulling the end in bends
  // the elbow / knee, moving it up or sideways swings the whole limb at the shoulder / hip, as a person would).
  const rootJoints = c.joints.filter(id => id !== c.bend);
  let end = limbPoint(rig, seg, limb, 'end'), it = 0;
  for (; it < opts.solveIters; it++) {
    const e = sub(targetMm, end);
    if (len(e) <= opts.tolMm) break;
    const J = rootJoints.map(id => {
      const h = q[id] + opts.probeDeg <= lim(id)[1] ? opts.probeDeg : -opts.probeDeg;
      const p = limbPoint(rig, segmentsFor({ ...q, [id]: q[id] + h }), limb, 'end');
      return sub(p, end).map(v => v / h);
    });
    const dq = dlsStep(J, e, opts.lambdaMm);
    let moved = false;
    rootJoints.forEach((id, i) => {
      const v = clamp(q[id] + clamp(dq[i], -opts.stepCapDeg, opts.stepCapDeg), lim(id)[0], lim(id)[1]);
      if (v !== q[id]) { q[id] = v; moved = true; }
    });
    if (!moved) break;
    seg = segmentsFor(q);
    end = limbPoint(rig, seg, limb, 'end');
  }
  const joints = {};
  for (const id of c.joints) joints[id] = q[id];
  return { joints, endMm: end, errorMm: len(sub(targetMm, end)), iterations: it };
}

/**
 * Turn (degrees, right-handed about the limb's long axis pointing from root to end) for a drag across it, like rolling
 * a rod under a finger: the near surface (toward the eye) follows the pointer. axisWorld: root -> end (world, any
 * length); viewDirWorld: from the eye toward the limb; rightWorld / upWorld: the screen's right and up in the world;
 * dx / dy: CSS px (dy down). Returns degrees (0 when the limb points along the view).
 */
export function rollDeg({ axisWorld, viewDirWorld, rightWorld, upWorld, dx, dy, degPerPx = LIMB_GRASP.rollDegPerPx }) {
  const a = axisWorld, la = len(a);
  if (!(la > 1e-9)) return 0;
  const u = a.map(v => v / la);
  // The near surface's offset from the axis: toward the eye, perpendicular to the axis.
  const n0 = viewDirWorld.map(v => -v);
  const d = n0[0] * u[0] + n0[1] * u[1] + n0[2] * u[2];
  const n = [n0[0] - d * u[0], n0[1] - d * u[1], n0[2] - d * u[2]], ln = len(n);
  if (!(ln > 1e-6)) return 0;
  // A right-handed turn about u moves the near surface along u x n.
  const t = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]].map(v => v / ln);
  const w = [rightWorld[0] * dx - upWorld[0] * dy, rightWorld[1] * dx - upWorld[1] * dy, rightWorld[2] * dx - upWorld[2] * dy];
  return (w[0] * t[0] + w[1] * t[1] + w[2] * t[2]) * degPerPx;
}

/**
 * Which motor-map area moves a joint which way: { [jointId]: { '1': { regionId, actionId }, '-1': {...} } } from the
 * body map's region actions (an action's end angle above the joint's start angle moves it the +1 way). Actions that
 * move a single joint are preferred.
 */
export function jointAreaIndex(bodyMap, restDeg = {}) {
  const out = {};
  const regions = bodyMap && Array.isArray(bodyMap.regions) ? bodyMap.regions : [];
  for (const single of [true, false]) {
    for (const r of regions) {
      for (const a of (r && Array.isArray(r.actions) ? r.actions : [])) {
        const j = a && a.joints && typeof a.joints === 'object' ? Object.keys(a.joints) : [];
        if (!j.length || (single && j.length !== 1)) continue;
        for (const id of j) {
          const end = a.joints[id], rest = Number.isFinite(restDeg[id]) ? restDeg[id] : 0;
          if (!Number.isFinite(end) || Math.abs(end - rest) < 0.5) continue;
          const side = end > rest ? '1' : '-1';
          out[id] = out[id] || {};
          if (!out[id][side]) out[id][side] = { regionId: r.id, actionId: a.id };
        }
      }
    }
  }
  return out;
}
