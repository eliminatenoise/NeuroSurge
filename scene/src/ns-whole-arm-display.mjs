/** R378 opt-in engineering display-frame experiment. No chosen production/default view.
 * Bounds all loaded arm bones+muscles, both original/full-lift rest endpoints and every positive skin influence.
 * Uses existing fitHand/FK/coupling unchanged, except explicit camera-origin accounting in ns-arm.
 * Source-only: grammar, numeric parity, native controls/allviews/normalmechanics/pixels/performance UNRUN.
 */
import { DEG, multiply, translation, rigidInverse, transformDirection, rotationTranspose, lookRotation } from './ns-math.mjs';
import { fitHand, ARM_DEFAULTS, eyeClearance } from './ns-arm.mjs';
import { SEGMENTS } from './ns-rig.mjs';

const MODE = 'whole-posed-arm-r378', supports = new WeakSet(), planSupports = new WeakMap();
export const WHOLE_ARM_DISPLAY_BOUNDS = Object.freeze({ trials: 8, bones: 30, muscles: 45, positions: 84347 });
const fail = (reason, detail = null) => {
  const error = new Error(`ns:whole_arm_display: ${reason}`);
  error.code = 'whole_arm_display_refused'; error.detail = { status: 'refused', reason, detail };
  throw error;
};
const finite = (x, label) => { if (typeof x !== 'number' || !Number.isFinite(x)) fail('nonfinite', label); return x; };
const vec = (v, label) => { if (!v || v.length !== 3) fail('vector_shape', label); return Array.from(v, x => finite(x, label)); };
const mat = (m, label) => {
  if (!m || m.length !== 16) fail('matrix_shape', label);
  const out = Array.from(m, x => finite(x, label));
  if (out[3] !== 0 || out[7] !== 0 || out[11] !== 0 || out[15] !== 1) fail('nonaffine_matrix', label);
  return out;
};
const point = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

export function wholeArmDisplayOptions(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => k !== 'mode') || input.mode !== MODE) fail('explicit_named_option_required');
  return Object.freeze({ mode: MODE }); // no raw coordinate/FOV/gain/quality override
}

export function buildWholeArmSupport({ bones, muscles, liftedById = null } = {}) {
  const B = WHOLE_ARM_DISPLAY_BOUNDS;
  if (!Array.isArray(bones) || !Array.isArray(muscles) || bones.length !== B.bones || muscles.length !== B.muscles) fail('complete_30bone_45muscle_inputs_required');
  if (!liftedById || ![null, Object.prototype].includes(Object.getPrototypeOf(liftedById))) fail('full_lift_endpoint_certificate_unavailable');
  const ids = new Set(), muscleIds = new Set(muscles.map(m => m.id)), groups = new Map();
  for (const key of Reflect.ownKeys(liftedById)) {
    const d = Object.getOwnPropertyDescriptor(liftedById, key);
    if (typeof key !== 'string' || !muscleIds.has(key) || !d || !Object.prototype.hasOwnProperty.call(d, 'value')) fail('invalid_lift_endpoint_record');
  }
  let positions = 0, endpointInfluenceVisits = 0, liftedMuscles = 0;
  const positionsOf = (mesh, label) => {
    if (!mesh || typeof mesh.id !== 'string' || !mesh.id || ids.has(mesh.id)) fail('missing_or_duplicate_source_identity', label);
    ids.add(mesh.id);
    const p = mesh.positions;
    if ((!Array.isArray(p) && !ArrayBuffer.isView(p)) || p instanceof DataView || !p.length || p.length % 3 !== 0) fail('position_layout', label);
    positions += p.length / 3;
    if (positions > B.positions) fail('source_position_bound');
    return p;
  };
  const include = (segment, p, i) => {
    if (!SEGMENTS.includes(segment)) fail('unknown_skin_segment', segment);
    let g = groups.get(segment);
    if (!g) { g = { segment, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; groups.set(segment, g); }
    for (let k = 0; k < 3; k++) { const x = finite(p[i + k], 'rest endpoint'); if (x < g.min[k]) g.min[k] = x; if (x > g.max[k]) g.max[k] = x; }
    endpointInfluenceVisits++;
    if (endpointInfluenceVisits > 4 * B.positions) fail('endpoint_influence_work_bound');
  };
  for (const b of bones) {
    const p = positionsOf(b, 'bone');
    for (let i = 0; i < p.length; i += 3) include(b.segment, p, i);
  }
  for (const m of muscles) {
    const p = positionsOf(m, 'muscle'), n = p.length / 3, w = m.weights;
    if (!w || ['i0', 'i1', 'w0', 'w1'].some(k => !w[k] || w[k].length < n)) fail('complete_skin_weights_required', m.id);
    const d = Object.getOwnPropertyDescriptor(liftedById, m.id), L = d ? d.value : p;
    if ((!Array.isArray(L) && !ArrayBuffer.isView(L)) || L instanceof DataView || L.length !== p.length) fail('lift_endpoint_layout', m.id);
    if (L !== p) liftedMuscles++;
    for (let v = 0; v < n; v++) {
      const a = w.i0[v], b = w.i1[v], wa = finite(w.w0[v], 'w0'), wb = finite(w.w1[v], 'w1');
      if (!Number.isInteger(a) || a < 0 || a >= SEGMENTS.length || !Number.isInteger(b) || b < 0 || b >= SEGMENTS.length || wa < 0 || wb < 0 || (wb > 0 && (!(wa + wb > 0) || !Number.isFinite(wa + wb)))) fail('invalid_nonnegative_skin_weights', m.id);
      // Matches skinApply: wb<=0 uses i0 directly; wb>0 uses positive normalized influences.
      const indices = wb > 0 ? (wa > 0 ? (a === b ? [a] : [a, b]) : [b]) : [a];
      for (const index of indices) {
        include(SEGMENTS[index], p, 3 * v);
        if (L !== p) include(SEGMENTS[index], L, 3 * v);
      }
    }
  }
  if (positions !== B.positions || ids.size !== B.bones + B.muscles) fail('incomplete_source_position_census');
  const boxes = Array.from(groups.values(), g => {
    const corners = [];
    for (const x of [g.min[0], g.max[0]]) for (const y of [g.min[1], g.max[1]]) for (const z of [g.min[2], g.max[2]]) corners.push(Object.freeze([x, y, z]));
    return Object.freeze({ segment: g.segment, corners: Object.freeze(corners) });
  });
  const out = Object.freeze({ kind: 'whole-arm-source-endpoint-support-r378', boxes: Object.freeze(boxes),
    coverage: Object.freeze({ bones: bones.length, muscles: muscles.length, positions, sourceIds: Object.freeze(Array.from(ids)), liftedMuscles,
      endpointInfluenceVisits, boundPoints: boxes.length * 8,
      scope: 'All75 loaded source-position inputs and original/full-lift linear endpoints under positive normalized LBS. Conservative envelopes; no runtime byte/GPU/occlusion/anatomy/normalmechanics proof.' }) });
  supports.add(out); return out;
}

export function displayFitOptions(armOptions, attachment, backM) {
  finite(backM, 'display back distance');
  if (backM < 0 || !attachment || attachment.kind !== 'ns-arm-attachment') fail('source_attachment_required');
  const shoulder = vec(attachment.shoulderCam, 'shoulder'), pole = vec(attachment.pole, 'pole');
  // Explicit camera-origin accounting preserves body-frame coupling pivot positions; it changes no coupling law.
  const cameraOriginBodyM = transformDirection(rotationTranspose(attachment.bodyToCamera), [0, 0, backM]);
  return { ...armOptions, attachment: null, shoulderCam: [shoulder[0], shoulder[1], shoulder[2] - backM],
    pole: [pole[0], pole[1], pole[2] - backM], bodyToCamera: attachment.bodyToCamera, cameraOriginBodyM };
}

export function checkWholeArmSupport(support, matrices, viewport, armOptions = {}) {
  if (!supports.has(support) || !(matrices instanceof Map)) fail('qualified_support_and_pose_required');
  const { aspect, fovYDeg, farM } = viewport || {};
  if (!(aspect > 0 && Number.isFinite(aspect) && fovYDeg > 0 && fovYDeg < 179 && farM > 0 && Number.isFinite(farM))) fail('finite_viewport_required');
  const o = { ...ARM_DEFAULTS, ...armOptions }, limits = o.viewLimitsNdc || {}, margin = 1 - o.marginNdc;
  const sides = Object.fromEntries(['left', 'right', 'bottom', 'top'].map(k => {
    const v = Math.min(margin, limits[k] === undefined ? 1 : finite(limits[k], k));
    if (!(v > 0 && v <= 1)) fail('invalid_existing_view_limits'); return [k, v];
  }));
  const declaredNear = viewport.nearM === undefined ? 0 : finite(viewport.nearM, 'declared camera near');
  if (declaredNear < 0) fail('invalid_declared_camera_near');
  const nearM = Math.max(finite(o.near, 'arm near') + finite(o.nearMargin, 'arm near margin'), declaredNear), sy = 1 / Math.tan(fovYDeg * DEG / 2), sx = sy / aspect;
  let tested = 0, outside = 0, behind = 0, deficitM = 0, farOutside = 0;
  const failures = { near: 0, far: 0, left: 0, right: 0, bottom: 0, top: 0 };
  for (const box of support.boxes) {
    const M = mat(matrices.get(box.segment), box.segment);
    for (const q of box.corners) {
      const p = point(M, q[0], q[1], q[2]); p.forEach(x => finite(x, 'posed support'));
      const d = -p[2], gaps = { near: nearM - d, far: d - farM,
        left: -sx * p[0] / sides.left - d, right: sx * p[0] / sides.right - d,
        bottom: -sy * p[1] / sides.bottom - d, top: sy * p[1] / sides.top - d };
      let bad = false; tested++; if (!(d > 0)) behind++;
      for (const k of Object.keys(failures)) if (gaps[k] > 0) { failures[k]++; bad = true; if (k !== 'far') deficitM = Math.max(deficitM, gaps[k]); }
      if (gaps.far > 0) farOutside++;
      if (bad || !(d > 0)) outside++;
    }
  }
  return Object.freeze({ kind: 'whole-arm-envelope-framing-r378', fits: outside === 0 && tested === support.coverage.boundPoints,
    tested, outside, behind, failures: Object.freeze(failures), additionalBackDeficitM: deficitM, farOutside,
    nearM, farM, sides: Object.freeze(sides), scope: support.coverage.scope });
}

export function fitWholeArmDisplay({ rig, boxes, request, viewport, armOptions, attachment, attachmentFrame, support, committedBackM = 0 } = {}) {
  if (!supports.has(support) || !rig || rig.kind !== 'ns-rig') fail('whole_arm_inputs_unavailable');
  const G = mat(attachmentFrame && attachmentFrame.eyeToWorld, 'attachment frame');
  const maxBackM = (finite(rig.upperLength, 'upper length') + finite(rig.foreLength, 'fore length')) * 0.001;
  if (!(maxBackM > 0)) fail('source_length_bound');
  // R396: a prior JS-render-committed offset is only a floor/candidate, never an assumed fit for this request.
  const floorM = finite(committedBackM, 'committed display back distance');
  if (floorM < 0 || floorM > maxBackM) fail('committed_display_floor_out_of_bound', { floorM, maxBackM });
  let backM = floorM, lowerM = floorM, upperM = null, best = null;
  const attempts = [];
  for (let trial = 0; trial < WHOLE_ARM_DISPLAY_BOUNDS.trials; trial++) {
    const options = displayFitOptions(armOptions, attachment, backM);
    const fit = fitHand(rig, boxes, request, viewport, options), check = checkWholeArmSupport(support, fit.solution.matrices, viewport, options);
    const handFits = fit.solution.reachable === true && fit.fallback !== 'unsatisfiable' && Number.isFinite(fit.yNdc) && fit.yNdc === request.yNdc;
    attempts.push(Object.freeze({ trial, backM, handFits, check }));
    if (handFits && check.fits) {
      // Keep an actually evaluated feasible witness. Later refinement failures cannot replace it.
      best = { backM, check, trial }; upperM = backM;
      if (backM === floorM) break; // already rechecked against current predicted inputs; do not automatically zoom inward

    } else if (upperM === null) {
      if (trial === 0 && backM !== maxBackM) { backM = maxBackM; continue; }
      fail('bounded_display_bracket_not_found', { attempts, maxBackM,
        scope: 'No feasible witness at the two tested endpoints; not global infeasibility and not permission to relax visibility.' });
    } else lowerM = backM;
    // At most eight existing fitHand calls, within the original source-arm-length bound.
    // No monotonicity/minimum-camera claim: only the stored tested witness may be returned.
    if (!(upperM > lowerM)) break;
    const next = lowerM + (upperM - lowerM) / 2;
    if (!(next > lowerM && next < upperM)) break;
    backM = next;
  }
  if (best === null) fail('display_iteration_bound', { attempts, maxBackM });
  const selectedBackM = best.backM, check = best.check;
  const renderWorld = multiply(G, translation([0, 0, selectedBackM]));
  const fixedAttachment = Object.freeze(Object.fromEntries(Object.entries(attachmentFrame).map(([k, v]) =>
    [k, Array.isArray(v) || ArrayBuffer.isView(v) ? Object.freeze(Array.from(v)) : v])));
  const plan = Object.freeze({ kind: 'whole-arm-display-plan-r378', backM: selectedBackM, selectedTrial: best.trial, attachmentFrame: fixedAttachment,
    renderFrame: Object.freeze({ ...fixedAttachment, position: Object.freeze([renderWorld[12], renderWorld[13], renderWorld[14]]),
      eyeToWorld: Object.freeze(Array.from(renderWorld)), worldToEye: Object.freeze(Array.from(rigidInverse(renderWorld))) }),
    parentFromRender: Object.freeze(Array.from(multiply(rigidInverse(G), renderWorld))), coverage: support.coverage,
    attempts: Object.freeze(attempts), planningCheck: check, maxBackM, committedFloorM: floorM,
    selectionPolicy: 'Revalidate committed floor first, then retain an actually tested feasible witness at or above that floor; no automatic inward minimization',

    scope: 'Engineering display viewpoint; tested feasible witness only, not minimum distance or global feasibility. Final commanded pose/actual view must be rechecked; all native/normalmechanics/reference/production gates remain pending.' });
  planSupports.set(plan, support); return plan;
}

export function applyWholeArmDisplayFit({ plan, fit, support, viewport, armOptions, activeCamera } = {}) {
  if (!plan || plan.kind !== 'whole-arm-display-plan-r378' || !supports.has(support) || planSupports.get(plan) !== support) fail('current_display_plan_required');
  const controlCheck = checkWholeArmSupport(support, fit.solution.matrices, viewport, armOptions);
  if (!fit.solution.reachable || fit.fallback === 'unsatisfiable' || !controlCheck.fits) fail('final_pose_outside_preselected_display_frame', { controlCheck, backM: plan.backM });
  const parentMatrices = new Map();
  for (const [segment, M] of fit.solution.matrices) parentMatrices.set(segment, multiply(plan.parentFromRender, mat(M, segment)));
  const C = multiply(translation(vec(activeCamera && activeCamera.position, 'active camera position')),
    lookRotation(finite(activeCamera && activeCamera.yaw, 'active yaw'), finite(activeCamera && activeCamera.pitch, 'active pitch')));
  const parentToActualView = multiply(rigidInverse(C), plan.attachmentFrame.eyeToWorld), actualMatrices = new Map();
  for (const [segment, M] of parentMatrices) actualMatrices.set(segment, multiply(parentToActualView, M));
  const actualCheck = checkWholeArmSupport(support, actualMatrices, { ...viewport, nearM: activeCamera.nearM }, armOptions);
  if (!actualCheck.fits) fail('whole_arm_outside_actual_camera', { actualCheck, backM: plan.backM });
  const parentSolution = { ...fit.solution };
  for (const k of ['shoulderCam', 'elbowCam', 'wristCam', 'handCentreCam', 'targetCam']) {
    if (Array.isArray(fit.solution[k])) parentSolution[k] = point(plan.parentFromRender, ...fit.solution[k]);
  }
  return { fit: { ...fit, clearance: eyeClearance(parentSolution) }, parentMatrices,
    report: Object.freeze({ kind: 'whole-arm-display-state-r378', status: 'source-envelope-fit', backM: plan.backM,
      coordinateFrames: 'fit matrices: rendering-control-camera-m; applied matrices: arm-eye-m via inverse(Cattach)*Crender; bodybridge uses Cattach*appliedM',
      fitMatrixMapDomain: 'source-rest-mm -> rendering-control-camera-m', submittedMatrixMapDomain: 'source-rest-mm -> arm-eye-m',
      parentFromRender: Array.from(plan.parentFromRender), attachmentEyeToWorld: Array.from(plan.attachmentFrame.eyeToWorld),
      renderCameraToWorld: Array.from(plan.renderFrame.eyeToWorld), actualCameraToWorld: Array.from(C),
      attachmentFrameMeaning: 'Existing source-derived engineering attachment frame; not measured anatomical eye or normal biomechanics',
      renderPositionWorldM: plan.renderFrame.position, armParentPositionWorldM: plan.attachmentFrame.position,
      activeCameraPositionWorldM: Array.from(activeCamera.position), controlCheck, actualCheck, coverage: plan.coverage,
      attempts: plan.attempts, selectedTrial: plan.selectedTrial, committedFloorM: plan.committedFloorM, selectionPolicy: plan.selectionPolicy, qualification: 'Conservative source-envelope checks only; wholearmalways/native controls/alllooks/aspects/E/pronation/normalbody/girdle/pixels/performance UNQUALIFIED.' }) };
}
