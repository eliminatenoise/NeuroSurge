/** R378 opt-in engineering display-frame experiment. No chosen production/default view.
 * Bounds all loaded arm bones+muscles, both original/full-lift rest endpoints and every positive skin influence.
 * Uses existing fitHand/FK/coupling unchanged, except explicit camera-origin accounting in ns-arm.
 * Source-only: grammar, numeric parity, native controls/allviews/normalmechanics/pixels/performance UNRUN.
 */
import { DEG, multiply, translation, rigidInverse, transformDirection, rotationTranspose, lookRotation } from './ns-math.mjs';
import { fitHand, ARM_DEFAULTS, eyeClearance, ARM_PROJECTION_EPS_NDC } from './ns-arm.mjs';
import { SEGMENTS } from './ns-rig.mjs';

const MODE = 'whole-posed-arm-r378', supports = new WeakSet(), planSupports = new WeakMap(), planFits = new WeakMap(), planRequests = new WeakMap();
const sourceEndpoints = new WeakMap(); // R521 private immutable copies; no point getter/export
// R558 performance (no predicate change): a typed working copy of each frozen endpoint list (the same float64 values, read
// without boxed-number loads), and a small exact-input result memo. Both are private; neither is exported or writable
// from outside, and the frozen R521 lists above stay the certified source.
const endpointBuffers = new WeakMap(), visibilityMemo = new WeakMap();
const VISIBILITY_MEMO_ENTRIES = 12;
function endpointBuffer(group) {
  let b = endpointBuffers.get(group);
  if (!b) { b = Float64Array.from(group.endpoints); endpointBuffers.set(group, b); }
  return b;
}
export const WHOLE_ARM_DISPLAY_BOUNDS = Object.freeze({ trials: 8, bones: 30, muscles: 45, positions: 84347 });
/** R558 performance (a display choice; no check is changed). When the committed camera distance no longer shows the
 * whole arm and the farthest distance does, the search halves the gap between them to bring the camera back in. It
 * used every remaining trial for that (6 halvings, about 1 cm), and each trial is a complete hand fit; while the player
 * kept moving, that full search ran again on almost every frame (measured: 190-300 ms frames). It now halves at most
 * REFINE_HALVINGS times, so the camera settles up to an eighth of the gap farther back than the nearest distance that
 * works. The distance is only ever a floor for later frames (it never moved back in by itself before either), so the
 * small extra room means the next frames usually pass at once instead of searching again. Every candidate that is
 * accepted is still a fully evaluated one: the same fitHand, the same strict whole-arm check, the same guards. */
export const WHOLE_ARM_REFINE_HALVINGS = 3;
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
// R495: a renderer view may be an affine HOMOGENEOUS representative [A,t;0,s].
// Require exact zero projective coefficients and positive finite s, not an epsilon near1.
// Physical/source matrices still use the strict unit-w mat() contract above.
const homogeneousAffine = (m, label) => {
  if (!m || m.length !== 16) fail('matrix_shape', label);
  const out = Array.from(m, x => finite(x, label));
  if (out[3] !== 0 || out[7] !== 0 || out[11] !== 0 || !(out[15] > 0)) fail('unsupported_homogeneous_affine_view', label);
  return out;
};
function rendererView(camera) {
  const raw = homogeneousAffine(camera.worldToCamera, 'raw renderer V'), homogeneousW = raw[15];
  // Dehomogenized Cartesian coordinates/directions for the existing metric solver.
  // This is a derived representation only: raw C/V/P and raw projection arithmetic are never replaced.
  const cartesian = homogeneousW === 1 ? raw : raw.map((v, i) => i === 15 ? 1 : finite(v / homogeneousW, 'Cartesian renderer view'));
  return { raw, cartesian, homogeneousW, homogeneousResidual: homogeneousW - 1 };
}

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
    if (!g) { g = { segment, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], endpoints: [] }; groups.set(segment, g); }
    for (let k = 0; k < 3; k++) { const x = finite(p[i + k], 'rest endpoint'); if (x < g.min[k]) g.min[k] = x; if (x > g.max[k]) g.max[k] = x; g.endpoints.push(x); }
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
  sourceEndpoints.set(out, Object.freeze({ kind: 'private-source-endpoint-snapshot-r521-v1', positions, endpointInfluenceVisits,
    groups: Object.freeze(Array.from(groups.values(), g => Object.freeze({ segment: g.segment, endpoints: Object.freeze(g.endpoints) }))) }));
  supports.add(out); return out;
}

// Physical G and render C remain distinct. This transforms existing anatomy; it never changes a pivot/law.
export function frameAtBack(attachmentFrame, backM) {
  finite(backM, 'canonical back distance');
  const F = multiply(mat(attachmentFrame.eyeToWorld, 'G'), translation([0, 0, backM]));
  return { ...attachmentFrame, position: [F[12], F[13], F[14]], eyeToWorld: Array.from(F), worldToEye: Array.from(rigidInverse(F)) };
}
export function actualCameraFitOptions(armOptions, attachment, attachmentFrame, camera) {
  const G = mat(attachmentFrame.eyeToWorld, 'physical G'), C = mat(camera.cameraToWorld, 'actual C'), V = rendererView(camera).cartesian;
  const fromG = multiply(V, G), originG = point(multiply(rigidInverse(G), C), 0, 0, 0);
  const bodyAxes = multiply(fromG, mat(attachment.bodyToCamera, 'physical body axes')); bodyAxes[12] = bodyAxes[13] = bodyAxes[14] = 0;
  return { ...armOptions, attachment: null,
    shoulderCam: point(fromG, ...vec(attachment.shoulderCam, 'physical shoulder')),
    pole: point(fromG, ...vec(attachment.pole, 'physical pole')),
    bodyToCamera: bodyAxes,
    cameraOriginBodyM: transformDirection(rotationTranspose(attachment.bodyToCamera), originG) };
}
function depthMapping(request, viewport, attachmentFrame, backM, camera) {
  const F = frameAtBack(attachmentFrame, backM).eyeToWorld, K = multiply(rigidInverse(F), mat(camera.cameraToWorld, 'C'));
  const P = matProjection(camera.projectionMatrix, viewport);
  // ns-arm uses a symmetric perspective ray. Reject unsupported projection structure, never relabel it.
  if (P[0] <= 0 || P[5] <= 0 || P[1] !== 0 || P[2] !== 0 || P[3] !== 0 || P[4] !== 0 || P[6] !== 0 || P[7] !== 0 ||
      P[8] !== 0 || P[9] !== 0 || P[11] !== -1 || P[12] !== 0 || P[13] !== 0 || P[15] !== 0) fail('unsupported_actual_projection_for_anatomical_ray');
  const ray = [request.xNdc / P[0], request.yNdc / P[5], -1];
  // Canonical plane depth d = b + a*t for actual-C ray t*r, so t=(d-b)/a.
  // R425's z of a different canonical point was not this plane/ray intersection.
  const b = -K[14], a = -(K[2] * ray[0] + K[6] * ray[1] + K[10] * ray[2]);
  if (!Number.isFinite(a) || a === 0 || !Number.isFinite(b)) fail('canonical_depth_axis_degenerate', { a, b });
  return { offsetM: -b / a, scale: 1 / a, planeOffsetM: b, planeSlope: a, actualRay: ray, canonicalFromActual: Array.from(K),
    canonicalFrame: Array.from(F), canonicalDomain: 'first-person-control-camera-plane-depth-m', actualDomain: 'actual-camera-ray-depth-m',
    derivation: 't=(canonicalDepth-b)/a; exact plane/ray algebra, not a projected-point scalar proxy' };
}
const sameScalars = (a, b) => a && b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.is(a[k], b[k]));
const sameRotation = (a, b) => typeof a === 'object' && a !== null && typeof b === 'object' && b !== null ? sameScalars(a, b) : Object.is(a, b);
export function requestForDisplayPlan(plan, request) {
  if (!plan.actualCamera) return request;
  const old = planRequests.get(plan), witness = planFits.get(plan);
  const matched = Boolean(plan.handRayBinding && old && witness && request.xNdc === old.xNdc && request.yNdc === old.yNdc && request.depth === old.depth &&
    sameScalars(request.joints, old.joints) && sameRotation(request.rotation, old.rotation));
  // Same CURRENT physical command: retain the canonical controller's achieved depth/wrist clamp, not a remote-camera workspace.
  // Changed new gaze/click/activity requests remain immediate; their actual fit and final strict checks still run.
  const canonicalDepthM = matched ? witness.depth : request.depth;
  const depth = plan.depthMapping.offsetM + plan.depthMapping.scale * canonicalDepthM;
  if (!(depth > 0 && Number.isFinite(depth))) fail('canonical_target_not_in_front_of_actual_camera', { canonicalDepthM, depth });
  return { ...request, ...(matched ? { joints: { ...witness.joints } } : {}), depth };
}
export function optionsForDisplayPlan(plan, armOptions, attachment) {
  return plan.actualCamera ? actualCameraFitOptions(armOptions, attachment, plan.attachmentFrame, plan.actualCamera)
    : displayFitOptions(armOptions, attachment, plan.backM);
}
export function canonicalReachFit(plan, fit, base) {
  if (!plan.actualCamera) return fit;
  const { offsetM, scale } = plan.depthMapping, convert = d => finite((finite(d, 'actual depth scalar') - offsetM) / scale, 'canonical depth scalar');
  const interval = (lo, hi) => ({ lo: Math.min(convert(lo), convert(hi)), hi: Math.max(convert(lo), convert(hi)) });
  const witness = plan.handRayBinding ? planFits.get(plan) : null;
  const sameCurrentJoints = witness && sameScalars(witness.joints, fit.joints);
  const limitsFit = sameCurrentJoints ? witness : fit;
  const d = sameCurrentJoints ? { lo: witness.depthLimits.minDepth, hi: witness.depthLimits.maxDepth } : interval(fit.depthLimits.minDepth, fit.depthLimits.maxDepth);
  const w = sameCurrentJoints ? { lo: witness.window.near, hi: witness.window.far } : interval(fit.window.near, fit.window.far);
  return { ...fit, depth: convert(fit.depth), depthLimits: { minDepth: d.lo, maxDepth: d.hi },
    window: { ...fit.window, near: w.lo, far: w.hi },
    ...(sameCurrentJoints ? { range: witness.range, xLimits: witness.xLimits } : {}),
    envelopeReach: { ...limitsFit.envelopeReach, minDepth: sameCurrentJoints ? witness.envelopeReach.minDepth : interval(fit.envelopeReach.minDepth, fit.envelopeReach.maxDepth).lo, maxDepth: sameCurrentJoints ? witness.envelopeReach.maxDepth : interval(fit.envelopeReach.minDepth, fit.envelopeReach.maxDepth).hi },
    reach: { ...limitsFit.reach, minDepth: sameCurrentJoints ? witness.reach.minDepth : interval(fit.reach.minDepth, fit.reach.maxDepth).lo, maxDepth: sameCurrentJoints ? witness.reach.maxDepth : interval(fit.reach.minDepth, fit.reach.maxDepth).hi },
    reachState: { xNdc: base.xNdc, depth: base.depth },
    coordinateMeaning: sameCurrentJoints ? 'Current canonical witness workspace; actual achieved depth converted by exact canonical-plane intersection. out.fit/solution stay actual-C.' : 'Exact canonical-plane conversion of actual-C feedback for changed joints; canonical workspace parity for new gaze/click remains unqualified' };
}
function actualHandProjection(rigCentre, actualMatrices, viewport, camera, target, rawCameraMatrix = null) {
  const centre = vec(rigCentre, 'source handCentre');
  let homogeneousPoint;
  if (rawCameraMatrix) {
    const M = homogeneousAffine(rawCameraMatrix, 'raw renderer hand matrix');
    homogeneousPoint = Array.from({ length: 4 }, (_, r) => M[r] * centre[0] + M[4 + r] * centre[1] + M[8 + r] * centre[2] + M[12 + r]);
  } else homogeneousPoint = [...point(mat(actualMatrices.get('hand'), 'actual hand matrix'), ...centre), 1];
  if (!(homogeneousPoint[3] > 0 && homogeneousPoint.every(Number.isFinite))) fail('actual_hand_homogeneous_point_invalid', { homogeneousPoint });
  const p = homogeneousPoint.slice(0, 3).map(v => v / homogeneousPoint[3]);
  const P = camera && camera.projectionMatrix ? matProjection(camera.projectionMatrix, viewport) : null, clip = [0, 0, null, 0];
  // Use the RAW renderer representative, including w in the projection's translation/depth terms.
  if (P) { for (let r = 0; r < 4; r++) clip[r] = P[r] * homogeneousPoint[0] + P[4 + r] * homogeneousPoint[1] + P[8 + r] * homogeneousPoint[2] + P[12 + r] * homogeneousPoint[3]; }
  else { const sy = 1 / Math.tan(viewport.fovYDeg * DEG / 2); clip[0] = sy / viewport.aspect * p[0]; clip[1] = sy * p[1]; clip[3] = -p[2]; }
  if (!(clip[3] > 0 && [clip[0], clip[1], clip[3]].every(Number.isFinite) && (!P || Number.isFinite(clip[2])))) fail('actual_hand_projection_invalid', { p, clip });
  const ndc = [clip[0] / clip[3], clip[1] / clip[3]], residualNdc = [ndc[0] - target.xNdc, ndc[1] - target.yNdc];
  const px = viewport.viewportPx, css = px ? [(ndc[0] + 1) * px.width / 2, (1 - ndc[1]) * px.height / 2] : null;
  const expectedCss = px ? [(target.xNdc + 1) * px.width / 2, (1 - target.yNdc) * px.height / 2] : null;
  return { sourceHandCentreMm: Array.from(rigCentre), actualCameraPointM: p, rawCameraPointHomogeneous: homogeneousPoint, homogeneousW: homogeneousPoint[3], clip, ndc, target: { ...target }, residualNdc, css, expectedCss,
    residualCss: css ? css.map((v, i) => v - expectedCss[i]) : null,
    matrixProvenance: 'Caller-supplied matrix; pending submitted and actually retained records are separately labeled',
    producerNumericGuard: { source: 'ns-arm existing EPS_NDC', value: ARM_PROJECTION_EPS_NDC,
      passes: residualNdc.every(v => Number.isFinite(v) && Math.abs(v) <= ARM_PROJECTION_EPS_NDC),
      limit: 'Producer numeric predicate only; raw residuals retained. NOT independent projection/matrix/pixel/anatomy acceptance.' } };
}
export function retainedHandProjection(plan, retained, viewport, retainedParentToWorld) {
  if (!plan.actualCamera || !retained || !retained.matrices || !retained.matrices.hand) fail('retained_actual_hand_unavailable', { sourceRig: plan.sourceRig, actualCamera: plan.actualCamera, physicalG: plan.attachmentFrame });
  const actualParent = mat(retainedParentToWorld, 'actual retained armGroup world'), actualM = multiply(multiply(plan.actualCamera.worldToCamera, actualParent), mat(retained.matrices.hand, 'retained applied hand'));
  const projection = actualHandProjection(plan.sourceRig.handCentreMm, new Map([['hand', actualM]]), viewport, plan.actualCamera, plan.requestNdc, actualM);
  const report = { ...projection, retainedRevision: retained.revision, reskinPending: retained.reskinPending, retainedDomainLabel: retained.to, source: 'existing Scene.appliedHandPose retained CPU matrix after updatePose; not requested or fit.yNdc', retainedHandMatrix: Array.from(retained.matrices.hand), retainedParentToWorld: Array.from(actualParent) };
  if (!report.producerNumericGuard.passes) fail('retained_actual_hand_anchor_mismatch', { handProjection: report, sourceRig: plan.sourceRig, actualCamera: plan.actualCamera, physicalG: plan.attachmentFrame });
  return report;
}
function matProjection(P, viewport) {
  if (P) { if (P.length !== 16) fail('projection_shape'); return Array.from(P, v => finite(v, 'projection')); }
  fail('actual_projection_unavailable'); // legacy analytic XY is handled separately; no fabricated depth rows
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
  let tested = 0, outside = 0, behind = 0, deficitM = 0, farOutside = 0, firstOutside = null;
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
      if (bad || !(d > 0)) {
        outside++;
        if (firstOutside === null) firstOutside = Object.freeze({
          segment: box.segment, cornerIndex: box.corners.indexOf(q),
          sourceCornerMm: Object.freeze(Array.from(q)), checkedCameraPointM: Object.freeze(Array.from(p)),
          sourceToCheckedCamera: Object.freeze(Array.from(M)), depthM: d, planeGapsM: Object.freeze({ ...gaps }),
          scope: 'First failing conservative support-box corner; not necessarily a mesh vertex. The checked camera may be a canonical plan or an actual render view according to the caller.'
        });
      }
    }
  }
  return Object.freeze({ kind: 'whole-arm-envelope-framing-r378', fits: outside === 0 && tested === support.coverage.boundPoints,
    tested, outside, behind, failures: Object.freeze(failures), additionalBackDeficitM: deficitM, farOutside,
    nearM, farM, sides: Object.freeze(sides), ...(firstOutside === null ? {} : { firstOutside }), scope: support.coverage.scope });
}

// R521: retain the legacy broad result, then refine ONLY a failed broad certificate.
// All checks below use one copied current matrix map. No pose/clock/fit/scene operation is performed.
// R558: the check is a pure function of (support, the 22 segment matrices, viewport, the few arm options it reads). An
// idle frame asks the same question several times with bit-identical inputs, so the frozen result of an earlier
// identical question is returned instead of visiting every endpoint again. The key holds EVERY number the check reads
// and is compared with Object.is (no tolerance); any difference, however small, runs the full check. A refusal
// (throw) is never stored.
function visibilityKey(support, matrices, viewport, armOptions) {
  const boxes = support.boxes, o = armOptions || {}, limits = o.viewLimitsNdc || {}, v = viewport || {};
  const key = new Float64Array(boxes.length * 16 + 12);
  let k = 0;
  for (let i = 0; i < boxes.length; i++) {
    const M = matrices.get(boxes[i].segment);
    if (!M || M.length !== 16) return null; // let the full check raise its own exact refusal
    for (let j = 0; j < 16; j++) { const x = M[j]; if (typeof x !== 'number') return null; key[k++] = x; }
  }
  // An option that is PRESENT but undefined overrides its default in the full check (and is refused there): never memoize it.
  for (const name of ['marginNdc', 'near', 'nearMargin', 'viewLimitsNdc']) if (name in o && o[name] === undefined) return null;
  const scalar = x => x === undefined ? -Infinity : typeof x === 'number' && Number.isFinite(x) ? x : NaN; // supplied nonfinite scalars bypass memo; missing defaults retain their key
  for (const x of [v.aspect, v.fovYDeg, v.farM, v.nearM, o.marginNdc, o.near, o.nearMargin, limits.left, limits.right, limits.bottom, limits.top]) {
    const y = scalar(x); if (y !== y) return null; key[k++] = y;
  }
  return key;
}
function checkWholeArmVisibility(support, matrices, viewport, armOptions) {
  if (!supports.has(support) || !(matrices instanceof Map)) fail('qualified_support_and_pose_required');
  const key = visibilityKey(support, matrices, viewport, armOptions);
  let memo = null;
  if (key !== null) {
    memo = visibilityMemo.get(support);
    if (!memo) { memo = []; visibilityMemo.set(support, memo); }
    search: for (let e = 0; e < memo.length; e++) {
      const stored = memo[e].key;
      if (stored.length !== key.length) continue;
      for (let i = 0; i < key.length; i++) if (!Object.is(stored[i], key[i])) continue search;
      if (e > 0) { const hit = memo[e]; memo.splice(e, 1); memo.unshift(hit); }
      return memo[0].result;
    }
  }
  const result = checkWholeArmVisibilityUncached(support, matrices, viewport, armOptions);
  if (memo !== null) { memo.unshift({ key, result }); if (memo.length > VISIBILITY_MEMO_ENTRIES) memo.length = VISIBILITY_MEMO_ENTRIES; }
  return result;
}
function checkWholeArmVisibilityUncached(support, matrices, viewport, armOptions) {
  const checkedMatrices = new Map(support.boxes.map(box => [box.segment, Object.freeze(mat(matrices.get(box.segment), box.segment))]));
  const broadCheck = checkWholeArmSupport(support, checkedMatrices, viewport, armOptions);
  if (broadCheck.fits) return broadCheck; // passing broad path retains its exact old kind/fields/values
  const source = sourceEndpoints.get(support), B = WHOLE_ARM_DISPLAY_BOUNDS;
  if (!source || source.kind !== 'private-source-endpoint-snapshot-r521-v1' || source.positions !== B.positions ||
      source.positions !== support.coverage.positions || source.endpointInfluenceVisits !== support.coverage.endpointInfluenceVisits ||
      source.endpointInfluenceVisits > 4 * B.positions || source.groups.length !== support.boxes.length || checkedMatrices.size !== source.groups.length) fail('complete_private_source_endpoint_snapshot_required');
  const { nearM, farM, sides } = broadCheck, sy = 1 / Math.tan(viewport.fovYDeg * DEG / 2), sx = sy / viewport.aspect;
  const planes = ['near', 'far', 'left', 'right', 'bottom', 'top'];
  const gapsFor = p => {
    p.forEach(x => finite(x, 'posed source endpoint'));
    const d = -p[2];
    return { d, gaps: { near: nearM - d, far: d - farM,
      left: -sx * p[0] / sides.left - d, right: sx * p[0] / sides.right - d,
      bottom: -sy * p[1] / sides.bottom - d, top: sy * p[1] / sides.top - d } };
  };
  // Recheck EVERY broad corner to identify ALL failed segments; firstOutside alone is insufficient.
  const failed = [], replayFailures = Object.fromEntries(planes.map(k => [k, 0]));
  let replayTested = 0, replayOutside = 0, replayBehind = 0, replayDeficitM = 0, replayFarOutside = 0, sourceVisits = 0;
  for (let i = 0; i < support.boxes.length; i++) {
    const box = support.boxes[i], group = source.groups[i], M = checkedMatrices.get(box.segment);
    if (!group || group.segment !== box.segment || !Object.isFrozen(group.endpoints) || !group.endpoints.length || group.endpoints.length % 3) fail('source_endpoint_group_currentness_required');
    sourceVisits += group.endpoints.length / 3;
    let segmentFailed = false;
    for (const q of box.corners) {
      const { d, gaps } = gapsFor(point(M, q[0], q[1], q[2]));
      let bad = false; replayTested++; if (!(d > 0)) replayBehind++;
      for (const k of planes) if (gaps[k] > 0) { replayFailures[k]++; bad = true; if (k !== 'far') replayDeficitM = Math.max(replayDeficitM, gaps[k]); }
      if (gaps.far > 0) replayFarOutside++;
      if (bad || !(d > 0)) { segmentFailed = true; replayOutside++; }
    }
    if (segmentFailed) failed.push(i);
  }
  if (sourceVisits !== source.endpointInfluenceVisits || replayTested !== support.coverage.boundPoints || replayTested !== broadCheck.tested ||
      replayOutside !== broadCheck.outside || replayBehind !== broadCheck.behind || replayFarOutside !== broadCheck.farOutside ||
      !Object.is(replayDeficitM, broadCheck.additionalBackDeficitM) || planes.some(k => replayFailures[k] !== broadCheck.failures[k]) || !failed.length) fail('same_current_complete_broad_certificate_required');
  // R558: identical arithmetic and predicates per endpoint (same operation order as point()+gapsFor()); only the
  // bookkeeping moved out of the loop: matrix entries and plane limits in locals, counters in locals, the endpoint
  // values read from the typed working copy, and ONE finiteness test per segment. x - x is 0 for every finite x and
  // NaN for NaN or +/-Infinity, so the sum below is nonzero exactly when some posed coordinate is not finite; the
  // refusal is then the same 'nonfinite: posed source endpoint' as before, raised before any result is returned.
  const sideL = sides.left, sideR = sides.right, sideB = sides.bottom, sideT = sides.top;
  let fNear = 0, fFar = 0, fLeft = 0, fRight = 0, fBottom = 0, fTop = 0;
  let required = 0, tested = 0, outside = 0, behind = 0;
  for (const i of failed) {
    const group = source.groups[i], M = checkedMatrices.get(group.segment), P = endpointBuffer(group), n = P.length;
    if (n !== group.endpoints.length) fail('source_endpoint_group_currentness_required');
    const m0 = M[0], m1 = M[1], m2 = M[2], m4 = M[4], m5 = M[5], m6 = M[6], m8 = M[8], m9 = M[9], m10 = M[10], m12 = M[12], m13 = M[13], m14 = M[14];
    let nonFinite = 0;
    required += n / 3;
    for (let j = 0; j < n; j += 3) {
      const px = P[j], py = P[j + 1], pz = P[j + 2];
      const x = m0 * px + m4 * py + m8 * pz + m12;
      const y = m1 * px + m5 * py + m9 * pz + m13;
      const z = m2 * px + m6 * py + m10 * pz + m14;
      nonFinite += (x - x) + (y - y) + (z - z);
      const d = -z;
      let bad = false; tested++; if (!(d > 0)) behind++;
      if (nearM - d > 0) { fNear++; bad = true; }
      if (d - farM > 0) { fFar++; bad = true; }
      if (-sx * x / sideL - d > 0) { fLeft++; bad = true; }
      if (sx * x / sideR - d > 0) { fRight++; bad = true; }
      if (-sy * y / sideB - d > 0) { fBottom++; bad = true; }
      if (sy * y / sideT - d > 0) { fTop++; bad = true; }
      if (bad || !(d > 0)) outside++;
    }
    if (nonFinite !== 0) fail('nonfinite', 'posed source endpoint');
  }
  const failures = { near: fNear, far: fFar, left: fLeft, right: fRight, bottom: fBottom, top: fTop };
  if (!(required > 0) || tested !== required || required > source.endpointInfluenceVisits) fail('complete_required_source_endpoint_census_required');
  const sourceEndpointWitness = Object.freeze({ kind: 'strict-source-endpoints-current-frustum-r521-v1',
    sourceSnapshotKind: source.kind, sourcePositions: source.positions, endpointInfluenceVisits: source.endpointInfluenceVisits,
    totalSegments: source.groups.length, narrowSegments: Object.freeze(failed.map(i => source.groups[i].segment)),
    broadCertifiedSegmentCount: source.groups.length - failed.length, broadCertifiedEndpointVisits: source.endpointInfluenceVisits - required,
    requiredEndpointVisits: required, testedEndpointVisits: tested, outside, behind, failures: Object.freeze(failures),
    coverage: 'ALL original bone and original/full-lift muscle endpoints under the builder effective carrier routing; every broad-failed segment checked, all other segments certified by their same-current passing broad corners.',
    numericLimit: 'Exact existing zero-gap CPU predicates; convex affine/positive-LBS/lift argument is exact-arithmetic only. Float32 skin/lift, GPU, occlusion and native all-geometry acceptance remain separate.' });
  return Object.freeze({ kind: 'whole-arm-source-endpoint-visibility-r521-v1', fits: outside === 0 && tested === required,
    broadCheck, sourceEndpointWitness,
    scope: 'Additional source-endpoint certificate after a retained FAILED conservative AABB check; not a renamed broad PASS or native/fullgame proof.' });
}

export function fitWholeArmDisplay({ rig, boxes, request, viewport, armOptions, attachment, attachmentFrame, support, committedBackM = 0, actualCamera = null, anatomicalMetadata = null, exactAnchor = false } = {}) {
  if (!supports.has(support) || !rig || rig.kind !== 'ns-rig') fail('whole_arm_inputs_unavailable');
  const G = mat(attachmentFrame && attachmentFrame.eyeToWorld, 'attachment frame');
  const maxBackM = (finite(rig.upperLength, 'upper length') + finite(rig.foreLength, 'fore length')) * 0.001;
  if (!(maxBackM > 0)) fail('source_length_bound');
  // R396: a prior JS-render-committed offset is only a floor/candidate, never an assumed fit for this request.
  const floorM = finite(committedBackM, 'committed display back distance');
  if (floorM < 0 || floorM > maxBackM) fail('committed_display_floor_out_of_bound', { floorM, maxBackM });
  let backM = floorM, lowerM = floorM, upperM = null, best = null, interiorScan = false, interiorIndex = 0, halvings = 0;
  const attempts = [];
  for (let trial = 0; trial < WHOLE_ARM_DISPLAY_BOUNDS.trials; trial++) {
    const mapping = actualCamera ? depthMapping(request, viewport, attachmentFrame, backM, actualCamera) : null;
    const fitRequest = mapping ? { ...request, depth: mapping.offsetM + mapping.scale * request.depth } : request;
    if (!(fitRequest.depth > 0 && Number.isFinite(fitRequest.depth))) fail('actual_camera_depth_not_positive', { trial, backM, fitRequest });
    const options = actualCamera ? actualCameraFitOptions(armOptions, attachment, attachmentFrame, actualCamera) : displayFitOptions(armOptions, attachment, backM);
    const fit = fitHand(rig, boxes, fitRequest, viewport, options), check = checkWholeArmVisibility(support, fit.solution.matrices, viewport, options);
    const handFits = fit.solution.reachable === true && fit.fallback !== 'unsatisfiable' && Number.isFinite(fit.yNdc) && fit.yNdc === request.yNdc && (!(actualCamera || exactAnchor) || fit.xNdc === request.xNdc);
    attempts.push(Object.freeze({ trial, backM, handFits, check, ...(mapping ? { canonicalDepthM: request.depth, requestedActualDepthM: fitRequest.depth, depthMapping: mapping, fitReachable: fit.solution.reachable, fitFallback: fit.fallback, fitXNdc: fit.xNdc, fittedActualDepthM: fit.depth, reach: fit.reach, envelopeReach: fit.envelopeReach, currentCoupling: fit.solution.coupling, fitPointsCameraM: Object.fromEntries(['shoulderCam', 'elbowCam', 'wristCam', 'handCentreCam', 'targetCam'].map(k => [k, Array.isArray(fit.solution[k]) ? fit.solution[k].slice() : null])) } : {}) }));
    if (handFits && check.fits) {
      // Keep an actually evaluated feasible witness. Later refinement failures cannot replace it.
      best = { backM, check, trial, fit }; upperM = backM;
      if (backM === floorM) break; // already rechecked against current predicted inputs; do not automatically zoom inward
      if (interiorScan) break; // fallback strict witness only; no monotone bracket/minimum claim

    } else if (upperM === null) {
      if (trial === 0 && backM !== maxBackM) { backM = maxBackM; continue; }
      // R507: two failed endpoints do not establish infeasibility of this refitted pose.
      // Spend only the remaining original fit slots on six evenly spaced interior candidates.
      // Each is refitted and checked with the SAME request, full support and exact guards.
      if (maxBackM > floorM && trial + 1 < WHOLE_ARM_DISPLAY_BOUNDS.trials) {
        // R511: fraction indices and fit trials differ when binary64 rounds a grid point to an endpoint or duplicate.
        let next = null;
        while (interiorIndex < WHOLE_ARM_DISPLAY_BOUNDS.trials - 2) {
          const candidate = floorM + (maxBackM - floorM) * (++interiorIndex) / (WHOLE_ARM_DISPLAY_BOUNDS.trials - 1);
          if (candidate > floorM && candidate < maxBackM && attempts.every(a => a.backM !== candidate)) {
            next = candidate; break;
          }
        }
        if (next !== null) { interiorScan = true; backM = next; continue; }
      }
      fail('bounded_display_bracket_not_found', { attempts, maxBackM,
        scope: 'No strict feasible witness among the bounded endpoint/interior samples (or no further representable untested grid candidate); not global infeasibility and not permission to relax visibility.' });
    } else lowerM = backM;
    // At most eight existing fitHand calls, within the original source-arm-length bound.
    // No monotonicity/minimum-camera claim: only the stored tested witness may be returned.
    if (!(upperM > lowerM)) break;
    if (halvings >= WHOLE_ARM_REFINE_HALVINGS) break; // R558: keep the tested witness found so far (see the constant)
    const next = lowerM + (upperM - lowerM) / 2;
    if (!(next > lowerM && next < upperM)) break;
    backM = next; halvings++;
  }
  if (best === null) fail('display_iteration_bound', { attempts, maxBackM });
  const selectedBackM = best.backM, check = best.check;
  const renderWorld = actualCamera ? mat(actualCamera.cameraToWorld, 'selected actual C') : multiply(G, translation([0, 0, selectedBackM]));
  const fixedAttachment = Object.freeze(Object.fromEntries(Object.entries(attachmentFrame).map(([k, v]) =>
    [k, Array.isArray(v) || ArrayBuffer.isView(v) ? Object.freeze(Array.from(v)) : v])));
  const plan = Object.freeze({ kind: 'whole-arm-display-plan-r378', backM: selectedBackM, selectedTrial: best.trial, attachmentFrame: fixedAttachment,
    renderFrame: Object.freeze({ ...fixedAttachment, position: Object.freeze([renderWorld[12], renderWorld[13], renderWorld[14]]),
      eyeToWorld: Object.freeze(Array.from(renderWorld)), worldToEye: Object.freeze(Array.from(actualCamera ? rendererView(actualCamera).raw : rigidInverse(renderWorld))) }),
    parentFromRender: Object.freeze(Array.from(multiply(rigidInverse(G), renderWorld))), coverage: support.coverage,
    backMMeaning: actualCamera ? 'canonical F reference offset only; actual C is separately frozen before picking' : 'existing first-person engineering camera offset',
    actualCamera, depthMapping: actualCamera ? Object.freeze(depthMapping(request, viewport, attachmentFrame, selectedBackM, actualCamera)) : null,
    requestNdc: Object.freeze({ xNdc: request.xNdc, yNdc: request.yNdc }),
    sourceRig: Object.freeze({ shoulderBpMm: Array.from(rig.pivots.shoulder), elbowBpMm: Array.from(rig.pivots.elbow), wristBpMm: Array.from(rig.pivots.wrist),
      upperLengthMm: rig.upperLength, foreLengthMm: rig.foreLength, handCentreMm: Array.from(rig.handCentre) }), anatomicalMetadata,
    canonicalWitness: actualCamera ? null : Object.freeze({ depthM: best.fit.depth, xNdc: best.fit.xNdc, yNdc: best.fit.yNdc, reachable: best.fit.solution.reachable, fallback: best.fit.fallback,
      requestedDepthM: request.depth, requestedJointsDeg: { ...request.joints }, fittedJointsDeg: { ...best.fit.joints }, rotation: request.rotation,
      currentCoupling: best.fit.solution.coupling, reach: best.fit.reach, envelopeReach: best.fit.envelopeReach,
      fitPointsCameraM: Object.fromEntries(['shoulderCam', 'elbowCam', 'wristCam', 'handCentreCam', 'targetCam'].map(k => [k, best.fit.solution[k] ? Array.from(best.fit.solution[k]) : null])) }),
    attempts: Object.freeze(attempts), planningCheck: check, maxBackM, committedFloorM: floorM,
    selectionPolicy: 'Revalidate committed floor first, then retain an actually tested feasible witness at or above that floor; no automatic inward minimization',
    refineHalvings: WHOLE_ARM_REFINE_HALVINGS,

    scope: 'Engineering display viewpoint; tested feasible witness only, not minimum distance or global feasibility. Final commanded pose/actual view must be rechecked; all native/normalmechanics/reference/production gates remain pending.' });
  planSupports.set(plan, support); planFits.set(plan, best.fit);
  planRequests.set(plan, { ...request, joints: { ...request.joints }, rotation: request.rotation && typeof request.rotation === 'object' ? { ...request.rotation } : request.rotation });
  return plan;
}

/** R442: bind ONE already-tested canonical witness to the actual immutable Scene C/P before any pick.
 * This is coordinate algebra plus 176 support checks, not another fitHand/FK/planner invocation. */
export function bindHandRayCamera(plan, camera, viewport, armOptions, framing = null) {
  const support = planSupports.get(plan), fit = planFits.get(plan), request = planRequests.get(plan);
  if (!support || !fit || !request || plan.actualCamera) fail('canonical_current_witness_required');
  const view = rendererView(camera), F = mat(plan.renderFrame.eyeToWorld, 'canonical F'), C = mat(camera.cameraToWorld, 'actual C'), V = view.cartesian;
  const actualFromCanonical = multiply(V, F), matrices = new Map();
  for (const [id, M] of fit.solution.matrices) matrices.set(id, multiply(actualFromCanonical, mat(M, id)));
  const check = checkWholeArmVisibility(support, matrices, { ...viewport, nearM: camera.nearM, farM: camera.farM }, armOptions);
  const rawHandMatrix = multiply(multiply(view.raw, F), mat(fit.solution.matrices.get('hand'), 'canonical hand'));
  const projection = actualHandProjection(plan.sourceRig.handCentreMm, matrices, viewport, camera, plan.requestNdc, rawHandMatrix);
  const mapping = depthMapping(request, viewport, plan.attachmentFrame, plan.backM, camera);
  const binding = Object.freeze({ kind: 'canonical-witness-actual-camera-binding-r442-v1', observerPath: framing, actualFromCanonical: Array.from(actualFromCanonical),
    rawViewHomogeneous: Object.freeze({ homogeneousW: view.homogeneousW, unitWResidual: view.homogeneousResidual, CartesianDerivation: 'raw renderer V divided by its exact positive homogeneous w; raw V remains in actualCamera and raw clip/residuals are checked separately', rawMatrixSource: 'actualCamera.worldToCamera; unchanged Scene snapshot' }),
    canonicalRequest: { xNdc: request.xNdc, yNdc: request.yNdc, depthM: request.depth }, canonicalAchievedDepthM: fit.depth,
    canonicalAchievedJointsDeg: { ...fit.joints }, canonicalHandFits: fit.solution.reachable && fit.fallback !== 'unsatisfiable',
    actualSupportCheck: check, actualHandProjection: projection, mapping,
    scope: 'Transformed current canonical feasible witness only; final actual activity/fit/support/projection and retained Scene guards remain mandatory' });
  if (!check.fits || !projection.producerNumericGuard.passes) fail('canonical_witness_not_feasible_in_selected_actual_camera', { binding, sourceRig: plan.sourceRig,
    anatomy: plan.anatomicalMetadata, physicalG: plan.attachmentFrame, canonicalF: plan.renderFrame, actualCamera: camera });
  const G = mat(plan.attachmentFrame.eyeToWorld, 'physical G');
  const next = Object.freeze({ ...plan, actualCamera: camera, depthMapping: Object.freeze(mapping), handRayBinding: binding,
    renderFrame: Object.freeze({ ...plan.renderFrame, position: Object.freeze([C[12], C[13], C[14]]), eyeToWorld: Object.freeze(Array.from(C)), worldToEye: Object.freeze(Array.from(view.raw)) }),
    parentFromRender: Object.freeze(Array.from(multiply(rigidInverse(G), C))), actualPlanningCheck: check,
    backMMeaning: 'Canonical physical-control F offset; actual C follows the separately declared hand-ray observer path' });
  planSupports.set(next, support); planFits.set(next, fit); planRequests.set(next, request); return next;
}

export function applyWholeArmDisplayFit({ plan, fit, support, viewport, armOptions, activeCamera } = {}) {
  if (!plan || plan.kind !== 'whole-arm-display-plan-r378' || !supports.has(support) || planSupports.get(plan) !== support) fail('current_display_plan_required');
  const controlCheck = checkWholeArmVisibility(support, fit.solution.matrices, viewport, armOptions);
  if (!fit.solution.reachable || fit.fallback === 'unsatisfiable' || !controlCheck.fits) fail('final_pose_outside_preselected_display_frame', { controlCheck, backM: plan.backM });
  const parentMatrices = new Map();
  for (const [segment, M] of fit.solution.matrices) parentMatrices.set(segment, multiply(plan.parentFromRender, mat(M, segment)));
  let C;
  if (plan.actualCamera) {
    const q = plan.actualCamera.sourcePose;
    if (!q || activeCamera.yaw !== q.yaw || activeCamera.pitch !== q.pitch || activeCamera.position.some((v, i) => v !== q.position[i])) fail('actual_camera_changed_after_plan');
    C = mat(plan.actualCamera.cameraToWorld, 'retained actual C');
  } else C = multiply(translation(vec(activeCamera && activeCamera.position, 'active camera position')),
    lookRotation(finite(activeCamera && activeCamera.yaw, 'active yaw'), finite(activeCamera && activeCamera.pitch, 'active pitch')));
  const actualV = plan.actualCamera ? rendererView(plan.actualCamera).cartesian : rigidInverse(C);
  const parentToActualView = multiply(actualV, plan.attachmentFrame.eyeToWorld), actualMatrices = new Map();
  for (const [segment, M] of parentMatrices) actualMatrices.set(segment, multiply(parentToActualView, M));
  const actualCheck = checkWholeArmVisibility(support, actualMatrices, { ...viewport, nearM: activeCamera.nearM }, armOptions);
  if (!actualCheck.fits) fail('whole_arm_outside_actual_camera', { actualCheck, backM: plan.backM });
  const projectionTarget = plan.actualCamera ? plan.requestNdc : { xNdc: fit.xNdc, yNdc: plan.requestNdc.yNdc };
  const rawHandMatrix = plan.actualCamera ? multiply(multiply(rendererView(plan.actualCamera).raw, plan.attachmentFrame.eyeToWorld), mat(parentMatrices.get('hand'), 'submitted hand')) : null;
  const handProjection = actualHandProjection(plan.sourceRig.handCentreMm, actualMatrices, viewport, plan.actualCamera, projectionTarget, rawHandMatrix);
  if (!handProjection.producerNumericGuard.passes) fail('actual_hand_anchor_mismatch', { handProjection, actualCheck });
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
      handProjection, backMMeaning: plan.backMMeaning, projectionFrame: plan.actualCamera || { status: 'legacy-first-person-analytic-xy-only', fullPCurrentness: 'not-asserted' },
      fitCoordinateFrame: plan.actualCamera ? 'actual-render-camera-m' : 'first-person-control-camera-m', depthMapping: plan.depthMapping,
      sourceRig: plan.sourceRig, anatomicalMetadata: plan.anatomicalMetadata,
      fitPointsCameraM: Object.fromEntries(['shoulderCam', 'elbowCam', 'wristCam', 'handCentreCam', 'targetCam'].map(k => [k, Array.isArray(fit.solution[k]) ? fit.solution[k].slice() : null])),
      currentCoupling: fit.solution.coupling, physicalFrame: plan.attachmentFrame, handRayBinding: plan.handRayBinding || null,
      attempts: plan.attempts, selectedTrial: plan.selectedTrial, committedFloorM: plan.committedFloorM, selectionPolicy: plan.selectionPolicy, qualification: 'Conservative source-envelope checks only; wholearmalways/native controls/alllooks/aspects/E/pronation/normalbody/girdle/pixels/performance UNQUALIFIED.' }) };
}
