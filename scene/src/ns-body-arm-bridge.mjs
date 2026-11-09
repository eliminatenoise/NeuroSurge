/**
 * Fitted left-arm -> full-body frame bridge. Pure CPU matrix arithmetic; no IO, DOM, engine or pose solver.
 *
 * M maps common BodyParts3D source-rest mm to the ACTUALLY RETAINED arm eye frame in m.
 * B maps those source mm to world m; C maps eye m to world m. Q = inverse(B) C M.
 * With the current pelvis anchor, ns-body applies its baked keep K AFTER options.external:
 * E = inverse(K) Q. E is the raw external l_upperarm transform (source mm -> posed body mm).
 *
 * A matching matrix/domain tag is not anatomical, registration or normal-mechanics qualification.
 * Girdle rotation is not inferred from a humeral matrix or a prescribed coupling coefficient.
 */

export const BODY_ARM_SOURCE_DOMAIN = 'BodyParts3D-4.0/source-rest-mm';
export const APPLIED_ARM_POSE_KIND = 'ns-applied-arm-pose-r173';
export const BODY_ARM_BRIDGE_KIND = 'ns-fitted-body-bridge-r173';
export const GIRDLE_INPUT_KIND = 'ns-qualified-applied-girdle-r173';
export const BODY_KEEP_FRAME_KIND = 'ns-body-keep-frame-r173';

// Numeric representation tolerances, including public Float32 baked segment matrices.
// They are not user anatomy, FOV, latency or physiological acceptance thresholds.
const ORTHO_EPS = 2e-5;
const MM_TO_M = 0.001;
const fail = (code, message) => { throw new Error(`ns:body_arm_bridge:${code}: ${message}`); };
const frozen = a => Object.freeze(Array.from(a));

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Dense finite proper affine similarity, with an explicit expected unit scale. Never repairs input. */
function checked(m, scale, label) {
  if (!m || m.length !== 16) fail('matrix', `${label} needs16 column-major elements`);
  const out = new Array(16);
  for (let i = 0; i < 16; i++) {
    if (typeof m[i] !== 'number' || !Number.isFinite(m[i])) fail('finite', `${label}[${i}] is not finite`);
    out[i] = m[i];
  }
  if (out[3] !== 0 || out[7] !== 0 || out[11] !== 0 || out[15] !== 1) {
    fail('affine', `${label} must be affine`);
  }
  const cols = [[out[0], out[1], out[2]], [out[4], out[5], out[6]], [out[8], out[9], out[10]]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const c of cols) if (Math.abs(Math.hypot(...c) / scale - 1) > ORTHO_EPS) {
    fail('units', `${label} must have positive uniform scale${scale}`);
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    if (Math.abs(dot(cols[i], cols[j]) / (scale * scale)) > ORTHO_EPS) fail('rigidity', `${label} has shear`);
  }
  const a = cols[0], b = cols[1], c = cols[2];
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) -
    b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
  if (!(det > 0 && Number.isFinite(det))) fail('handedness', `${label} must be proper and nonsingular`);
  return out;
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  }
  return out;
}

/** Full affine inverse, NOT rigidInverse: B contains the mm->m scale. Input was validated above. */
function inverseAffine(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!(det > 0 && Number.isFinite(det))) fail('inverse', 'A proper finite inverse is required');
  const out = [
    (e * i - f * h) / det, (f * g - d * i) / det, (d * h - e * g) / det, 0,
    (c * h - b * i) / det, (a * i - c * g) / det, (b * g - a * h) / det, 0,
    (b * f - c * e) / det, (c * d - a * f) / det, (a * e - b * d) / det, 0,
    0, 0, 0, 1
  ];
  for (let r = 0; r < 3; r++) out[12 + r] = -(out[r] * m[12] + out[4 + r] * m[13] + out[8 + r] * m[14]);
  return out;
}

function sameNumbers(a, b) {
  for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Pure adapter used by scene.appliedArmPose(). Reads the actual retained bone matrix elements, never last requested M.
 * A null means no upperarm root is available; revision counts actual accepted renderer pose applications.
 * Copies are dense frozen plain arrays, so a consumer cannot mutate the renderer through this readback.
 * This is CPU scene-state readback, not native GL/GPU/pixel readback.
 */
export function readAppliedArmPose(bones, { revision, reskinPending = false } = {}) {
  if (!Array.isArray(bones)) fail('readback', 'Retained bone records must be an array');
  if (!(Number.isSafeInteger(revision) && revision > 0)) fail('revision', 'Applied pose revision must be positive');
  if (typeof reskinPending !== 'boolean') fail('readback', 'Pending-reskin status must be boolean');
  let root = null;
  for (let n = 0; n < bones.length; n++) {
    const b = bones[n];
    if (!b || b.segment !== 'upperarm') continue;
    const m = checked(b.mesh && b.mesh.matrix && b.mesh.matrix.elements, MM_TO_M, 'retained upperarm M');
    if (root && !sameNumbers(root, m)) fail('readback', 'Retained upperarm bones have different matrices');
    root = m;
  }
  if (!root) return null;
  return Object.freeze({
    kind: APPLIED_ARM_POSE_KIND, sourceDomain: BODY_ARM_SOURCE_DOMAIN,
    from: 'source-rest-mm', to: 'eye-m', revision, reskinPending, upperarm: frozen(root)
  });
}

function checkedGirdle(g, sourceDomain) {
  if (g === null) return null;
  if (!g || g.kind !== GIRDLE_INPUT_KIND || g.sourceDomain !== sourceDomain ||
      g.from !== 'source-rest-mm' || g.to !== 'corrected-posed-body-mm') {
    fail('girdle', 'An optional girdle input needs the explicit corrected body-mm frame contract');
  }
  const p = g.qualification;
  if (!p || typeof p.id !== 'string' || !p.id.trim() || p.id.length > 256 || !Array.isArray(p.sourceSha256) ||
      p.sourceSha256.length === 0 || p.sourceSha256.length > 32) {
    fail('girdle', 'An optional applied girdle transform needs caller-owned qualification provenance');
  }
  for (let n = 0; n < p.sourceSha256.length; n++) {
    if (typeof p.sourceSha256[n] !== 'string' || !/^[a-f0-9]{64}$/.test(p.sourceSha256[n])) {
      fail('girdle', 'Girdle qualification source hashes must be dense SHA256 strings');
    }
  }
  // Provenance fields are a caller assertion, not a new independent physiology/rights acceptance.
  return { matrix: checked(g.matrix, 1, 'qualified girdle Q'), id: p.id, hashes: p.sourceSha256.slice() };
}

/**
 * Build raw options.external for existing ns-body.poseBody{Detailed}.
 * Public rig/baked references identify the current immutable producer generations; no _internal fields are read.
 * Baked K comes from the validated bodyPostureKeepFrame getter, not the rounded public Float32 segment copy.
 * Only the current pelvis anchor is supported. Other anchors need a separately derived anchor/external contract.
 * Default l_girdle is NOT fabricated. Existing illustrative armFollow can remain, explicitly unqualified.
 */
export function fittedBodyBridge({
  appliedPose, bodyToWorld, eyeToWorld, rig, baked = null, keepFrame = null, anchor = 'pelvis',
  sourceDomain = BODY_ARM_SOURCE_DOMAIN, qualifiedGirdle = null
} = {}) {
  if (anchor !== 'pelvis') fail('anchor', 'Only the current pelvis anchor is supported');
  if (sourceDomain !== BODY_ARM_SOURCE_DOMAIN) fail('source', 'Unsupported source-rest domain');
  if (!rig || rig.kind !== 'ns-body-rig') fail('generation', 'Use the current body rig generation');
  if (!appliedPose || appliedPose.kind !== APPLIED_ARM_POSE_KIND ||
      appliedPose.sourceDomain !== sourceDomain || appliedPose.from !== 'source-rest-mm' || appliedPose.to !== 'eye-m' ||
      !(Number.isSafeInteger(appliedPose.revision) && appliedPose.revision > 0) || typeof appliedPose.reskinPending !== 'boolean') {
    fail('applied', 'Use the renderer retained-pose readback in the declared source/eye frames');
  }
  const M = checked(appliedPose.upperarm, MM_TO_M, 'applied upperarm M');
  const B = checked(bodyToWorld, MM_TO_M, 'source-mm to world-m B');
  const C = checked(eyeToWorld, 1, 'eye-m to world-m C');
  let K = identity();
  if (baked !== null) {
    if (!baked || baked.kind !== 'ns-body-baked-posture' || !keepFrame || keepFrame.kind !== BODY_KEEP_FRAME_KIND ||
        keepFrame.sourceDomain !== sourceDomain || keepFrame.anchor !== 'pelvis' ||
        keepFrame.from !== 'pre-keep-posed-body-mm' || keepFrame.to !== 'corrected-posed-body-mm' ||
        keepFrame.rigGeneration !== rig || keepFrame.bakeGeneration !== baked) {
      fail('bake', 'Use the validated public keep frame for this rig and bake generation');
    }
    K = checked(keepFrame.matrix, 1, 'public Float64 baked keep K');
  } else if (keepFrame !== null) fail('bake', 'An unbaked pose must not supply a baked keep frame');
  const g = checkedGirdle(qualifiedGirdle, sourceDomain);
  const Q = checked(multiply(inverseAffine(B), multiply(C, M)), 1, 'corrected upperarm Q');
  const invK = inverseAffine(K);
  const E = checked(multiply(invK, Q), 1, 'pre-keep upperarm E');
  const external = { l_upperarm: frozen(E) };
  if (g) external.l_girdle = frozen(checked(multiply(invK, g.matrix), 1, 'pre-keep girdle E'));
  // All applied frame values are included even if their changes happen to cancel in Q.
  const key = JSON.stringify([sourceDomain, anchor, M, B, C, K, g ? [g.id, g.hashes, g.matrix] : null]);
  return Object.freeze({
    kind: BODY_ARM_BRIDGE_KIND, sourceDomain, anchor, external: Object.freeze(external),
    correctedUpperarm: frozen(Q), appliedRevision: appliedPose.revision, reskinPending: appliedPose.reskinPending,
    generations: Object.freeze({ rig, baked }), key,
    report: Object.freeze({
      upperarm: 'retained-applied-pose', rawExternal: 'pre-keep-pelvis',
      keepFrame: baked ? 'validated-Float64-producer-copy' : 'identity-unbaked',
      girdle: g ? 'caller-qualified-applied-input' : 'unqualified-existing-armFollow',
      girdleQualificationId: g ? g.id : null,
      normalMechanics: 'UNVERIFIED', physiologyLaw: false
    })
  });
}

/** Body-pose cache comparison. A new revision alone is not a new root matrix; grasp-dependent fitted M IS included. */
export function sameFittedBodyBridge(a, b) {
  if (a === b) return true;
  if (!a || !b || a.kind !== BODY_ARM_BRIDGE_KIND || b.kind !== BODY_ARM_BRIDGE_KIND) return false;
  if (!a.generations || !b.generations || typeof a.key !== 'string' || typeof b.key !== 'string') return false;
  return a.key === b.key && a.generations.rig === b.generations.rig && a.generations.baked === b.generations.baked;
}
