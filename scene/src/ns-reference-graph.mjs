/** R266 optional engineering reference graph. No chosen eye/FOV/look preset; source units are explicit. */
import { DEG, multiply, translation, rotationY, lookRotation, rigidInverse, transformDirection, bpToWorldAxes } from './ns-math.mjs';
const known = new WeakSet();
const fail = m => { throw new Error('ns:reference_graph: ' + m); };
const vec = (v, name) => { if (!(Array.isArray(v) || ArrayBuffer.isView(v)) || v.length !== 3 || !Array.from(v).every(Number.isFinite)) fail(name + ' must be three finite numbers'); return Array.from(v); };
const angles = (v, limit, name) => {
  if (v == null) return Object.freeze({ yaw: 0, pitch: 0 });
  if (!v || typeof v !== 'object' || Object.keys(v).some(k => k !== 'yaw' && k !== 'pitch') || !Number.isFinite(v.yaw) || !Number.isFinite(v.pitch) || Math.abs(v.pitch) > limit) fail(name + ' needs finite yaw/pitch RADIANS within the source pitch limit');
  return Object.freeze({ yaw: v.yaw, pitch: v.pitch });
};
function bounds(map) {
  if (!(map instanceof Map)) fail('validated source mesh Map required');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; let n = 0;
  for (const rec of map.values()) {
    const p = rec && (rec.mesh ? rec.mesh.positions : rec.positions);
    if (!p || !p.length || p.length % 3) fail('source positions required');
    for (let i = 0; i < p.length; i++) { if (!Number.isFinite(p[i])) fail('nonfinite source position'); const k = i % 3; lo[k] = Math.min(lo[k], p[i]); hi[k] = Math.max(hi[k], p[i]); }
    n++;
  }
  if (!n) fail('complete source reference records required');
  return { lo, hi, n };
}
/** Pure option preflight; source selection is resolved only after the normal validated assets and body anchor exist. */
export function referenceOptions(options, pitchLimitRad = 80 * DEG) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['reference', 'initialLook', 'initialBrainPlacement', 'fovYDeg'].includes(k))) fail('unknown viewGraph option or units');
  if (!(Number.isFinite(pitchLimitRad) && pitchLimitRad >= 0)) fail('actual Controls pitch limit required');
  const reference = options.reference === undefined ? 'eye' : options.reference;
  if (!['eye', 'posterior-brain-bound'].includes(reference)) fail('unsupported source reference selector');
  const fovYDeg = options.fovYDeg === undefined ? 70 : options.fovYDeg;
  if (!(Number.isFinite(fovYDeg) && fovYDeg >= 70 && fovYDeg <= 120)) fail('base FOV must remain inside existing source70..120degree bounds');
  return Object.freeze({ reference, fovYDeg, initialLook: angles(options.initialLook, Math.min(80 * DEG, pitchLimitRad), 'initialLook'), initialBrainPlacement: angles(options.initialBrainPlacement, 75 * DEG, 'initialBrainPlacement') });
}
/** Call only after normal Assets hash/schema/parser validation. Selectors derive coordinates, never accept a guessed BP point. */
export function createReferenceGraph(options, { eye, brainMeshes, rootAnchor, pitchLimitRad = 80 * DEG } = {}) {
  if (options == null) return null;
  const selected = referenceOptions(options, pitchLimitRad);
  if (!eye || eye.source !== 'skull_orbits') fail('normal validated lacrimal eye estimate required');
  const originalEyeBp = vec(eye.eyeBp, 'original source display-eye estimate');
  if (!(Number.isFinite(pitchLimitRad) && pitchLimitRad >= 0)) fail('actual Controls pitch limit required');
  const reference = selected.reference;
  const referenceBp = originalEyeBp.slice();
  if (reference === 'posterior-brain-bound') {
    const b = bounds(brainMeshes); if (b.n !== 59) fail('all59 normally validated brain meshes required');
    referenceBp[1] = b.hi[1];
  }
  if (!rootAnchor || rootAnchor.kind !== 'ns-body-root-anchor-r266' || rootAnchor.anchor !== 'pelvis') fail('actual body producer pelvis anchor required');
  const rootAnchorBp = Object.freeze(vec(rootAnchor.pointBp, 'rig-derived corrected pelvis anchor mm'));
  const fovYDeg = selected.fovYDeg;
  const graph = Object.freeze({ kind: 'ns-reference-graph-r266', reference, originalEyeBp: Object.freeze(originalEyeBp), referenceBp: Object.freeze(referenceBp),
    rootAnchorBp, rootAnchorMeaning: rootAnchor.meaning, pitchLimitRad: Math.min(80 * DEG, pitchLimitRad), initialLook: selected.initialLook,
    initialBrainPlacement: selected.initialBrainPlacement, fovYDeg,
    meaning: 'Engineering source-derived display reference; not measured eye, cranial surface or normal biomechanics', source: 'normal Assets-validated source geometry; no raw coordinate option' });
  known.add(graph); return graph;
}
export function requireReferenceGraph(graph, originalEyeBp) {
  if (!known.has(graph)) fail('use createReferenceGraph on normally validated source inputs');
  if (originalEyeBp && graph.originalEyeBp.some((v, i) => v !== originalEyeBp[i])) fail('original-eye source mismatch');
  return graph;
}
/** General yaw: add q-Ry(b)q for actual baked pelvis point q, fixing that world root while retaining source bodyYaw. */
export function frameForAttachment(graph, attachment, neckShiftBp) {
  requireReferenceGraph(graph); const n = vec(neckShiftBp, 'source neck shift mm');
  const delta = graph.referenceBp.map((v, i) => v - graph.originalEyeBp[i] + n[i]);
  const ax = transformDirection(bpToWorldAxes(), delta).map(v => v * 0.001);
  const bodyRotation = rotationY(attachment.bodyYaw);
  const offset = transformDirection(bodyRotation, ax);
  const root0 = transformDirection(bpToWorldAxes(), graph.rootAnchorBp.map((v, i) => v - graph.originalEyeBp[i])).map(v => v * 0.001);
  const rotatedRoot = transformDirection(bodyRotation, root0);
  const rootCorrection = root0.map((v, i) => v - rotatedRoot[i]);
  const position = offset.map((v, i) => v + rootCorrection[i]);
  const eyeToWorld = multiply(translation(position), attachment.cameraToWorld);
  const bodyToWorld = multiply(translation(position), attachment.bodyToWorld);
  return { position, rootCorrection, fixedPelvisWorldM: root0, pelvisAnchorBp: graph.rootAnchorBp.slice(), bodyToWorld, eyeToWorld, worldToEye: rigidInverse(eyeToWorld), eyeBp: graph.originalEyeBp.slice(), bodyYaw: attachment.bodyYaw };
}
export function applyAttachment(attachment, frame) {
  return { ...attachment, bodyToWorld: frame.bodyToWorld, cameraToWorld: frame.eyeToWorld, worldToCamera: frame.worldToEye };
}
const carry = (view, actualTransform) => {
  const a = actualTransform ? { yaw: actualTransform.grabYaw, pitch: actualTransform.grabPitch } : view.offset;
  if (!a || !Number.isFinite(a.yaw) || !Number.isFinite(a.pitch)) fail('finite actual brain carry radians required');
  return lookRotation(a.yaw, a.pitch);
};
export function initialBrainState(origin, initialPivotWorld = null) {
  return { translation: vec(origin, 'initial brain origin m'), anchor: null,
    pivotWorld: initialPivotWorld ? vec(initialPivotWorld, 'configured initial world pivot') : null,
    initialPivotWorld: initialPivotWorld ? vec(initialPivotWorld, 'configured initial world pivot') : null };
}
/** Maintain a world pivot across release/resize. During held carry rotate about the actual grab camera, not world0. */
export function advanceBrainState(state, view, origin, actualTransform) {
  if (!state || !view || !view.grab || !actualTransform) fail('constructor-owned brain state/view and actual transform required');
  const o = vec(origin, 'camera origin m'), k = carry(view, actualTransform), rawPivot = vec(actualTransform.pivotWorld, 'actual brain pivot');
  const priorShift = vec(state.translation, 'persistent brain world translation');
  let pivotWorld = state.pivotWorld ? vec(state.pivotWorld, 'persistent world pivot') : rawPivot.map((v, i) => v + priorShift[i]);
  let anchor = state.anchor;
  if (anchor) {
    if (!anchor.carry || anchor.carry.length !== 16 || !Array.from(anchor.carry).every(Number.isFinite)) fail('finite retained carry matrix required');
    const start = vec(anchor.origin, 'grab origin'), pivot = vec(anchor.pivotWorld, 'grab world pivot');
    const d = multiply(k, rigidInverse(anchor.carry));
    const q = transformDirection(d, pivot.map((v, i) => v - start[i]));
    pivotWorld = o.map((v, i) => v + q[i]);
  }
  const shift = pivotWorld.map((v, i) => v - rawPivot[i]);
  if (view.grab.active && !anchor) anchor = { origin: o.slice(), carry: Array.from(k), pivotWorld: pivotWorld.slice() };
  if (!view.grab.active) anchor = null;
  return { translation: shift, pivotWorld, anchor,
    initialPivotWorld: state.initialPivotWorld ? vec(state.initialPivotWorld, 'configured initial world pivot') : pivotWorld.slice() };
}
export function translateBrainRecord(record, state, initialOrigin) {
  if (!record.transform) fail('configured graph requires actual region-mode brain transform');
  const t = vec(state.translation, 'brain world translation'), raw = record.transform;
  if (![raw.matrix, raw.inverse].every(m => m && m.length === 16 && Array.from(m).every(Number.isFinite))) fail('actual finite brain matrix/inverse required');
  const transform = { ...raw, matrix: multiply(translation(t), raw.matrix), inverse: multiply(raw.inverse, translation(t.map(v => -v))),
    pivotWorld: raw.pivotWorld.map((v, i) => v + t[i]), referenceTranslation: t.slice(), referenceOrigin: initialOrigin.slice() };
  return { ...record, transform };
}
