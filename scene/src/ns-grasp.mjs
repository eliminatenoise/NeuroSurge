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
    bend: 'r_elbow_flex', bendSign: 1, bendPivot: 'r_elbow', endSeg: 'r_hand', endCentreOf: 'r_hand', framePivot: 'r_wrist', side: 'right',
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

/**
 * 19 November 2026 (a check: looking round with a limb held ran at 48 to 55 frames a second; the solve was 4 to 5 ms
 * of every frame). The solve's options for a limb that FOLLOWS a moving target frame after frame (ns-app
 * stepLimbGrasp): each iteration poses the whole body three times, the target moves only a few mm a frame, and the
 * next frame goes on from where this one ended, so two iterations a frame track it; minGain ends the frame's solve as
 * soon as an iteration no longer brings the end 5% nearer (a target out of reach or a joint at its limit used to burn
 * all six iterations on every frame).
 */
export const LIMB_TRACK = Object.freeze({ ...LIMB_GRASP, solveIters: 2, minGain: 0.05 });
/**
 * 19 November 2026 (the chosen limb held by the view, ns-app LIMB_KEYS.view.hold). The tracking solve with the damping
 * in proportion to the limb's lever arm (lambdaShare x the distance root -> end, in place of the fixed lambdaMm): with
 * the fixed 8 a folded arm, its hand 11 cm from the shoulder, turned about a twentieth of what a frame asked for and
 * the hand sank instead of going out level; in proportion the turn is the same share of the asked one at every bend.
 */
export const LIMB_HOLD_TRACK = Object.freeze({ ...LIMB_TRACK, lambdaShare: 0.006, lambdaMinMm: 0.5, reuseDeg: 6 });
/** The same with one step a frame: for the frames on which the limb is already following (the solve of the frame
 * before ended close to its target), where one step with the remembered columns is enough. */
export const LIMB_HOLD_FOLLOW = Object.freeze({ ...LIMB_HOLD_TRACK, solveIters: 1 });
/** And for a limb that waits at the end of its range while the view goes on: one step with the columns it has (keepColumns:
 * they are not found afresh because a step did not close in; at a joint's end no columns would). */
export const LIMB_HOLD_WAIT = Object.freeze({ ...LIMB_HOLD_FOLLOW, keepColumns: true, reuseDeg: 12 });
/** 20 November 2026, evening (LIMBFREE): the one longer solve that asks whether a waiting limb can reach the place its
 * look has come to rest on (ns-app stepLimbHold: rejoin). Up to ten steps of at most stepCapDeg each, from where the
 * limb is; run once per place at rest, not every frame. */
export const LIMB_HOLD_REACH = Object.freeze({ ...LIMB_HOLD_TRACK, solveIters: 10, minGain: 0.01 });

/**
 * 19 November 2026 (a check: "a few ordinary looks tear the shoulder ... a controlled arm stays inside poses that draw
 * whole"). The range a HELD or CONTROLLED limb's joints are solved in (Space, a click and the keys; degrees), inside
 * the body's own limits. The right shoulder only: carried by the look or the keys its solve ran to the ends of the
 * anatomical range (sideways lift 180, the arm straight up beside the head), where the upper arm's muscles are drawn
 * as stretched sheets and the hand passes the view point. A movement switched on from the brain still has the whole
 * range. Display choice, found on pictures.
 */
/* 19 November 2026, later (the owner: "there's problems with some limbs, such as the right arm having a full range of
 * motion, especially when you go left all the way and it's unable to cross the body"; "We want full range of motion on
 * all axes"): no caps any more. The keys and the look move every limb through the body's own ranges (ns-body
 * BODY_JOINT_LIMITS and the combined-range rule); the caps were sideways lift 0 to 80 and forward raise -25 to 105. */
export const LIMB_HOLD_LIMITS = Object.freeze({});
/** limits with LIMB_HOLD_LIMITS applied for the pose `now` ({ jointId: degrees }): each capped joint keeps the side of
 * its cap it is already beyond (a joint a brain movement took past the cap is not snapped back; it can only come in).
 * Pure; returns `limits` itself when no cap applies to this limb. */
export function holdLimits(limits, limb, now, caps = LIMB_HOLD_LIMITS) {
  const c = LIMB_CHAIN[limb];
  if (!c || !limits || !caps) return limits;
  let out = limits;
  for (const id of c.joints) {
    const cap = caps[id], L = limits[id];
    if (!cap || !L) continue;
    const v = now && Number.isFinite(now[id]) ? now[id] : null;
    const lo = Math.max(L[0], v === null ? cap[0] : Math.min(cap[0], v)), hi = Math.min(L[1], v === null ? cap[1] : Math.max(cap[1], v));
    if (out === limits) out = { ...limits };
    out[id] = [lo, hi];
  }
  return out;
}

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
 * 19 November 2026 (the owner: "If we click on a limb, we now control that limb until we change the camera view").
 * LIMB_CLICK is how that sentence is read. A plain click on one of your own limbs makes it the CONTROLLED limb:
 * W / A / S / D then move its end (level: A / D sideways, W farther, S nearer) instead of the left arm, and a
 * press-and-drag on it turns and bends it as always. The look stays free and does NOT carry the limb (followsLook
 * false): a check found that a limb which follows every look ends up under the crosshair, in front of the motor
 * strip and the mirror body, with no way to look at the brain without moving it.
 * "Until we change the camera view" is read both ways the owner uses those words: control ends when the view is
 * changed with E, AND when the look has turned lookAwayDeg away from where the limb was clicked or last moved (the
 * limb has left the middle of the picture: you are looking at something else). It also ends with a click on the same
 * limb again, a click on nothing (open space or bare brain), a click on another limb (that one is taken) and Reset
 * body.
 *   followsLook  true: the earlier reading (the limb's end follows the look as while Space holds it; only E, a click
 *                and Reset end it). Kept behind this switch for the lead's decision; lookAwayDeg is not used then.
 *   lookAwayDeg  null: looking away never ends it (only E and clicks do).
 */
export const LIMB_CLICK = Object.freeze({ followsLook: false, lookAwayDeg: 24 });

/**
 * Which own limb a click controls after an event. latch: the limb controlled now ('rightArm' | 'rightLeg' |
 * 'leftLeg') or null. Events:
 *   { type: 'click', limb }           a plain click on own limb `limb`: it is taken; the controlled limb itself: let go;
 *                                     'leftArm' (the game arm, which the keys move anyway): no limb is controlled
 *   { type: 'click', nothing: true }  a plain click on nothing (open space, bare brain): let go
 *   { type: 'click' }                 a click on anything else (a motor area, an arrow, the mirror body): no change
 *   { type: 'view' }                  the view was changed (E)
 *   { type: 'look', awayDeg }         how far the look has turned from where the limb was clicked or last moved
 *   { type: 'reset' }                 Reset body
 * Anything else (Space pressed or let go, a pause, a lost focus) leaves it as it is. Pure.
 */
export function limbLatchAfter(latch, ev, rule = LIMB_CLICK) {
  const cur = typeof latch === 'string' && latch !== 'leftArm' && LIMB_CHAIN[latch] ? latch : null;
  if (!ev || typeof ev !== 'object') return cur;
  if (ev.type === 'view' || ev.type === 'reset') return null;
  if (ev.type === 'look') return cur && rule && rule.followsLook !== true && Number.isFinite(rule.lookAwayDeg) && Number.isFinite(ev.awayDeg) && ev.awayDeg > rule.lookAwayDeg ? null : cur;
  if (ev.type === 'click') {
    if (ev.nothing === true || ev.limb === 'leftArm') return null;
    if (typeof ev.limb === 'string' && LIMB_CHAIN[ev.limb]) return ev.limb === cur ? null : ev.limb;
  }
  return cur;
}
/** The angle (degrees) between two looks ({ yaw, pitch } in radians). Pure. */
export function lookAwayDeg(a, b) {
  if (!a || !b) return 0;
  const d = Math.sin(a.pitch) * Math.sin(b.pitch) + Math.cos(a.pitch) * Math.cos(b.pitch) * Math.cos(a.yaw - b.yaw);
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
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
export function solveLimb({ rig, segmentsFor, targets, limb, targetMm, limits, opts = LIMB_GRASP, project = null, memo = null, startSegments = null }) {
  const c = LIMB_CHAIN[limb];
  if (!c) throw new Error(`ns:grasp: unknown solved limb ${JSON.stringify(limb)}`);
  if (!targetMm || targetMm.length !== 3 || !targetMm.every(Number.isFinite)) throw new Error('ns:grasp: targetMm must be finite mm');
  const lim = id => (limits && limits[id] ? limits[id] : [-180, 180]);
  let q = { ...targets };
  for (const id of c.joints) q[id] = clamp(Number.isFinite(q[id]) ? q[id] : 0, lim(id)[0], lim(id)[1]);
  // project (19 November 2026): the rule that brings a whole set of targets inside the ranges that depend on each other
  // (ns-body clampBodyJointTargets' combined-range rule), applied to the limb's joints after every change, so the
  // angles returned are the angles drawn. (Without it the solve could hold an angle the drawn pose refuses, an arm
  // across the body with no forward raise, and then worked from a pose that was not on screen.)
  const fit = () => { if (typeof project !== 'function') return; const p = project(q); if (p) for (const id of c.joints) if (Number.isFinite(p[id])) q[id] = p[id]; };
  // startSegments (19 November 2026): the posed segments of `targets` when the caller has them already (one pose of the
  // whole body saved); used only while the start angles are untouched by the limits and the rule above.
  const q0 = c.joints.map(id => q[id]);
  fit();
  let seg = startSegments && c.joints.every((id, i) => q[id] === q0[i] && q[id] === targets[id]) ? startSegments : segmentsFor(q);
  // folded: the target is nearer the root than the limb can bring its end with the bend at its end (the caller may
  // then leave the limb alone instead of letting the folded limb swing round its root).
  let folded = false;
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
    const raw = q[c.bend] + c.bendSign * (innerNow - inner);
    const want = clamp(raw, lim(c.bend)[0], lim(c.bend)[1]);
    if (Math.abs(want - q[c.bend]) > 0.05) { q[c.bend] = want; fit(); seg = segmentsFor(q); }
    folded = c.bendSign * (raw - q[c.bend]) > 1; // (asked for more bend than the joint, or the combined-range rule, gives)
  }
  // Then the two root joints point the limb at the target (the bend stays as the distance asks: pulling the end in bends
  // the elbow / knee, moving it up or sideways swings the whole limb at the shoulder / hip, as a person would).
  const rootJoints = c.joints.filter(id => id !== c.bend);
  let end = limbPoint(rig, seg, limb, 'end'), it = 0;
  let lastErr = Infinity;
  const lambda = Number.isFinite(opts.lambdaShare) ? Math.max(Number.isFinite(opts.lambdaMinMm) ? opts.lambdaMinMm : 0.5, opts.lambdaShare * len(sub(end, limbPoint(rig, seg, limb, 'root')))) : opts.lambdaMm;
  for (; it < opts.solveIters; it++) {
    const e = sub(targetMm, end), err = len(e);
    if (err <= opts.tolMm) break;
    if (Number.isFinite(opts.minGain) && lastErr - err < opts.minGain * lastErr) break; // (LIMB_TRACK: no longer getting nearer)
    lastErr = err;
    // memo (19 November 2026; a caller that solves the same limb frame after frame): the two columns found last are used
    // again while the limb's joints are within opts.reuseDeg of where they were found and the last step made with them
    // still closed in on the target. Each column costs one pose of the whole body, so this halves a tracking solve.
    const reuse = memo && memo.limb === limb && memo.J && !memo.stale && Number.isFinite(opts.reuseDeg)
      && c.joints.every(id => Math.abs(q[id] - memo.at[id]) <= opts.reuseDeg);
    const J = reuse ? memo.J : rootJoints.map(id => {
      // 20 November 2026 (LIMBFREE; the owner: "The limb should never get stuck"): a probe that the combined-range rule
      // cuts back (project) went into a range the pose does not take: its column came out zero, or worse, it showed a
      // drawn coupling's move the step could never make (a thigh past 100 degrees bends its drawn knee instead), and the
      // step then never used that joint, or pushed it the wrong way: A could not bring a leg back in from the end of its
      // sideways range, and a thigh lifted to its end could not be lowered again. Such a probe is made the other way.
      // (A drawn coupling can also leave a few degrees at a range's end that move nothing: the probe then goes on, up to
      // 8 times as far, inward.)
      const at = hh => {
        if (q[id] + hh < lim(id)[0] || q[id] + hh > lim(id)[1]) return null;
        const qq = { ...q, [id]: q[id] + hh };
        if (typeof project === 'function') { const pp = project(qq); if (pp && Number.isFinite(pp[id]) && Math.abs(pp[id] - qq[id]) > 1e-6) return null; }
        const pk = limbPoint(rig, segmentsFor(qq), limb, 'end');
        return len(sub(pk, end)) >= 1e-4 ? pk : null;
      };
      const h0 = q[id] + opts.probeDeg <= lim(id)[1] ? opts.probeDeg : -opts.probeDeg;
      let h = h0, p = at(h0);
      if (!p) for (const k of [-1, -4, 4, -8, 8]) { const pk = at(h0 * k); if (pk) { h = h0 * k; p = pk; break; } }
      if (!p) { h = h0; p = limbPoint(rig, segmentsFor({ ...q, [id]: q[id] + h0 }), limb, 'end'); }
      return sub(p, end).map(v => v / h);
    });
    if (memo && !reuse) { memo.limb = limb; memo.J = J; memo.at = {}; for (const id of c.joints) memo.at[id] = q[id]; memo.stale = false; memo.made = (memo.made || 0) + 1; }
    const dq = dlsStep(J, e, lambda);
    let moved = false;
    const before = rootJoints.map(id => q[id]);
    rootJoints.forEach((id, i) => { q[id] = clamp(q[id] + clamp(dq[i], -opts.stepCapDeg, opts.stepCapDeg), lim(id)[0], lim(id)[1]); });
    fit();
    rootJoints.forEach((id, i) => { if (q[id] !== before[i]) moved = true; });
    if (!moved) break;
    seg = segmentsFor(q);
    end = limbPoint(rig, seg, limb, 'end');
    // (columns used again that no longer close in: found afresh at the next step)
    if (memo && reuse && opts.keepColumns !== true && len(sub(targetMm, end)) > 0.7 * err) memo.stale = true;
  }
  const joints = {};
  for (const id of c.joints) joints[id] = q[id];
  return { joints, endMm: end, errorMm: len(sub(targetMm, end)), iterations: it, folded };
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
 * 20 November 2026 (BODYMAP; the owner, Message 205: "That goes both ways for when you're moving the body and the brain
 * area is activating"): an action whose end IS the joint's start angle moves it nowhere from the start, but when that
 * end is also the joint's end stop (limits[id], degrees: "Turn right palm up" with the palm up, "Bring right fingers
 * together") it is the movement toward that stop, so it is the area and action of that direction (a drag that turns the
 * right palm up lit only the forearm area, not "Turn right palm up").
 */
export function jointAreaIndex(bodyMap, restDeg = {}, limits = null) {
  const out = {};
  const regions = bodyMap && Array.isArray(bodyMap.regions) ? bodyMap.regions : [];
  const stopSide = (id, end) => {
    const L = limits && Array.isArray(limits[id]) ? limits[id] : null;
    return !L ? null : Math.abs(end - L[1]) < 0.5 ? '1' : Math.abs(end - L[0]) < 0.5 ? '-1' : null;
  };
  for (const single of [true, false]) {
    for (const r of regions) {
      for (const a of (r && Array.isArray(r.actions) ? r.actions : [])) {
        const j = a && a.joints && typeof a.joints === 'object' ? Object.keys(a.joints) : [];
        if (!j.length || (single && j.length !== 1)) continue;
        for (const id of j) {
          const end = a.joints[id], rest = Number.isFinite(restDeg[id]) ? restDeg[id] : 0;
          if (!Number.isFinite(end)) continue;
          const side = Math.abs(end - rest) >= 0.5 ? (end > rest ? '1' : '-1') : stopSide(id, end);
          if (!side) continue;
          out[id] = out[id] || {};
          if (!out[id][side]) out[id][side] = { regionId: r.id, actionId: a.id };
        }
      }
    }
  }
  return out;
}
