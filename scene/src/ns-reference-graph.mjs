/** R266 source-derived engineering reference graph. R22 selects a110degree display FOV default; this is not a measured anatomical eye or physiological field of view. */
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
  const fovYDeg = options.fovYDeg === undefined ? 110 : options.fovYDeg;
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
/** R22: translate the already-carried brain without losing its next-frame mouse anchor. */
export function offsetBrainState(state, view, actualTransform, movementWorld) {
  const delta = vec(movementWorld, 'brain keyboard movement world m');
  if (delta.every(v => v === 0)) return state;
  let anchor = state.anchor;
  if (anchor) {
    const relative = multiply(carry(view, actualTransform), rigidInverse(anchor.carry));
    const atStart = transformDirection(rigidInverse(relative), delta);
    anchor = { ...anchor, pivotWorld: vec(anchor.pivotWorld, 'brain anchor').map((v, i) => v + atStart[i]) };
  }
  return { ...state, translation: vec(state.translation, 'brain translation').map((v, i) => v + delta[i]),
    pivotWorld: vec(state.pivotWorld, 'brain pivot').map((v, i) => v + delta[i]), anchor };
}
export function initialObjectCarry() {
  return { held: false, target: null, lastPick: null, lastLook: null, lastOrigin: null, brainKeyOffset: [0, 0, 0], mirror: null, diagnostic: null };
}
export function offsetMirrorCarry(state, movementWorld) {
  const delta = vec(movementWorld, 'post-pose mirror placement delta');
  if (delta.every(x => x === 0)) return state;
  if (!state || !state.mirror || !state.held || state.target !== 'mirror') fail('only a held mirror can reconcile placement');
  const m = state.mirror; let anchor = m.anchor;
  if (anchor) {
    const relative = multiply(lookRotation(state.lastLook.yaw, state.lastLook.pitch), rigidInverse(lookRotation(anchor.startLook.yaw, anchor.startLook.pitch)));
    const local = transformDirection(rigidInverse(relative), delta);
    anchor = { ...anchor, pivotWorld: anchor.pivotWorld.map((x, i) => x + local[i]) };
  }
  return { ...state, mirror: { ...m, anchor, centreWorldM: m.centreWorldM.map((x, i) => x + delta[i]) } };
}
export function clearObjectCarry(state) {
  const s = state || initialObjectCarry();
  return { ...s, held: false, target: null, lastPick: null,
    mirror: s.mirror ? { ...s.mirror, anchor: null } : null,
    diagnostic: { status: 'released-by-safety', target: null } };
}
/** Pure event/placement reducer only: no activity/FK/IK/clock/scene work.
 * The pick event has the SAME ordering as the existing activity gaze event: first at equal timestamps.
 * Keys use only their held-time coverage times the App's existing poseDt/wallDt ratio. */
export function stepObjectCarry(previous, { pick = null, events = [], gazeAt = 0, axes = { x: 0, z: 0 }, wallDt = 0, poseDt = 0,
  origin, look, brainView, brainTransform, brainCentre, brainTranslation, brainFrame, referenceOrigin, viewport, constrainBrainMovement = null } = {}) {
  const prior = previous || initialObjectCarry(), o = vec(origin, 'active camera origin');
  if (!look || !Number.isFinite(look.yaw) || !Number.isFinite(look.pitch)) fail('finite active carry look required');
  if (!Array.isArray(events) || !Number.isFinite(wallDt) || wallDt < 0 || !Number.isFinite(poseDt) || poseDt < 0 || poseDt > wallDt || !Number.isFinite(gazeAt) || gazeAt < 0) fail('original carry event timing required');
  const axis = [Number(axes.x), Number(axes.z)];
  if (!axis.every(Number.isFinite)) fail('finite carry axes required');
  const axisNorm = Math.hypot(...axis); if (axisNorm > 1) { axis[0] /= axisNorm; axis[1] /= axisNorm; }
  const cameraRotation = lookRotation(look.yaw, look.pitch), k = carry(brainView, brainTransform), invK = rigidInverse(k);
  let held = prior.held === true, target = held ? prior.target : null, lastPick = prior.lastPick;
  let keys = vec(prior.brainKeyOffset, 'persistent brain key offset');
  let mirror = prior.mirror ? { ...prior.mirror, centreWorldM: vec(prior.mirror.centreWorldM, 'persistent mirror centre'), anchor: prior.mirror.anchor ? { ...prior.mirror.anchor } : null } : null;
  const brainMovementWorld = [0, 0, 0];
  const clearance = brainFrame && brainFrame.clearanceM, minimum = brainFrame && brainFrame.minBrainDistanceM, reach = brainFrame && brainFrame.reachM;
  const reference = vec(referenceOrigin, 'initial brain reference origin');
  const previousKeysWorld = transformDirection(k, keys);
  const baselineTranslation = vec(brainTranslation, 'actual brain translation').map((v, i) => v - previousKeysWorld[i]);
  const cameraShift = Math.hypot(...o.map((v, i) => v - baselineTranslation[i]));
  if (![clearance, minimum, reach].every(Number.isFinite) || !(clearance > 0 && reach > 0 && minimum >= reach)) fail('existing full brain clearance metadata unavailable');
  // The old global minimum is diagnostic context only: equality with reach+clearance must NOT disable W-away or safe lateral movement.
  // A brain sphere around its centre can enclose the eye in the intentional motor-focused view; it is NOT used to invent a near radius.
  const keyBudgetM = clearance; // finite FAR workspace, independent of direction-dependent near clearance
  const bounds = { brainKeyFarOffsetM: keyBudgetM, originalMinBrainDistanceM: minimum, originalReachM: reach, originalClearanceM: clearance, cameraReferenceShiftM: cameraShift, initialReferenceOriginM: reference, baselineClearanceLowerBoundM: minimum - cameraShift, unchangedRequiredMinimumM: reach + clearance, clearanceStatus: 'near bound checked against actual transformed source sample balls; global scalar is context only' };
  let heldPoseS = 0, clamped = false, selected = null, brainClearance = null;
  let carryLook = prior.lastLook ? { ...prior.lastLook } : { ...look };
  let carryOrigin = prior.lastOrigin ? vec(prior.lastOrigin, 'previous active camera origin') : o.slice();
  const mirrorRotation = a => multiply(lookRotation(carryLook.yaw, carryLook.pitch), rigidInverse(lookRotation(a.startLook.yaw, a.startLook.pitch)));
  const followMirror = () => {
    if (!held || target !== 'mirror' || !mirror || !mirror.anchor) return;
    const d = mirrorRotation(mirror.anchor), q = transformDirection(d, mirror.anchor.pivotWorld.map((v, i) => v - mirror.anchor.origin[i]));
    mirror.centreWorldM = carryOrigin.map((v, i) => v + q[i]);
  };
  const hold = seconds => {
    if (!held || !target || !(seconds > 0)) return;
    const dt = wallDt > 0 ? seconds * poseDt / wallDt : 0; heldPoseS += dt;
    if (!(dt > 0)) return;
    const speed = target === 'mirror' && mirror ? Math.max(clearance, mirror.radiusM / 2) : clearance;
    const delta = transformDirection(cameraRotation, [axis[0] * speed * dt, 0, -axis[1] * speed * dt]);
    if (target === 'brain') {
      const localDelta = transformDirection(invK, delta), next = keys.map((v, i) => v + localDelta[i]);
      const n = Math.hypot(...next); if (n > keyBudgetM) { next.forEach((v, i) => { next[i] = n > 0 ? v * keyBudgetM / n : 0; }); clamped = true; }
      if (typeof constrainBrainMovement !== 'function') fail('current whole-brain source clearance constraint unavailable');
      const requested = transformDirection(k, next.map((v, i) => v - keys[i]));
      const checked = constrainBrainMovement(requested, brainMovementWorld);
      const actual = vec(checked.movement, 'certified brain translation'); brainClearance = checked.diagnostic;
      clamped = clamped || checked.diagnostic.acceptedFraction !== 1;
      const acceptedLocal = transformDirection(invK, actual); keys = keys.map((v, i) => v + acceptedLocal[i]);
      actual.forEach((v, i) => { brainMovementWorld[i] += v; });
    } else if (target === 'mirror' && mirror && mirror.anchor) {
      const before = mirror.centreWorldM, next = before.map((v, i) => v + delta[i]);
      if (axisNorm > 0) {
        const local = transformDirection(rigidInverse(cameraRotation), next.map((v, i) => v - o[i]));
        let depth = -local[2]; const b = mirror.bounds;
        const wantedDepth = depth; depth = Math.max(b.nearM, Math.min(b.farM, depth));
        const tan = Math.tan(viewport.fovYDeg * DEG / 2), maxX = depth * tan * viewport.aspect;
        const wantedX = local[0]; local[0] = Math.max(-maxX, Math.min(maxX, local[0])); local[2] = -depth;
        const world = transformDirection(cameraRotation, local); next.splice(0, 3, ...world.map((v, i) => v + o[i]));
        clamped = clamped || wantedDepth !== depth || wantedX !== local[0];
      }
      const actual = next.map((v, i) => v - before[i]), d = mirrorRotation(mirror.anchor), inAnchor = transformDirection(rigidInverse(d), actual);
      mirror.anchor = { ...mirror.anchor, pivotWorld: mirror.anchor.pivotWorld.map((v, i) => v + inAnchor[i]) };
      mirror.centreWorldM = next;
    }
  };
  const timeline = [{ type: 'pick', at: Math.min(gazeAt, wallDt), order: 0, value: pick }];
  events.forEach((ev, i) => {
    if (!ev || ev.type !== 'space') return;
    if (typeof ev.down !== 'boolean' || (ev.at !== undefined && !(Number.isFinite(ev.at) && ev.at >= 0))) fail('original Space event required');
    timeline.push({ type: 'space', at: Math.min(ev.at === undefined ? 0 : ev.at, wallDt), order: i + 1, down: ev.down });
  });
  timeline.sort((a, b) => a.at - b.at || a.order - b.order);
  let cursor = 0;
  for (const ev of timeline) {
    hold(ev.at - cursor); cursor = ev.at;
    if (ev.type === 'pick') {
      carryLook = { ...look }; carryOrigin = o.slice(); followMirror();
      if (mirror && ev.value && ev.value.mirrorEnvelope) {
        const radius = ev.value.mirrorEnvelope.radiusM;
        if (!(Number.isFinite(radius) && radius > 0)) fail('complete current mirror radius required');
        mirror.radiusM = radius;
        if (radius + viewport.nearM > mirror.bounds.farM) fail('current mirror geometry exceeds original finite far cap');
        mirror.bounds = { ...mirror.bounds, nearM: radius + viewport.nearM };
      }
      lastPick = ev.value && ['brain', 'mirror'].includes(ev.value.target) ? { ...ev.value, look: { ...look }, origin: o.slice() } : null; continue;
    }
    if (ev.down && !held) {
      held = true; target = lastPick ? lastPick.target : null; selected = target;
      if (target === 'mirror') {
        const point = mirror ? mirror.centreWorldM.slice() : vec(lastPick.centreWorldM, 'picked mirror centre'), radius = lastPick.radiusM;
        if (!(Number.isFinite(radius) && radius > 0)) fail('normal mirror geometry radius unavailable');
        const L = transformDirection(rigidInverse(cameraRotation), point.map((v, i) => v - o[i])), depth = -L[2];
        const cameraNear = viewport && viewport.nearM;
        if (!(Number.isFinite(cameraNear) && cameraNear > 0)) fail('actual camera near plane required for mirror carry');
        const nearM = radius + cameraNear, farM = Math.max(depth + 2 * radius, nearM + 2 * radius);
        if (!(Number.isFinite(depth) && depth >= nearM && Number.isFinite(farM))) fail('picked mirror is inside its geometry-derived near limit');
        mirror = { centreWorldM: point, radiusM: radius, bounds: mirror ? { ...mirror.bounds, nearM: Math.max(mirror.bounds.nearM, nearM), farM: mirror.bounds.farM } : { nearM, farM, basis: 'source mirror bounding radius plus actual near plane; far extends one source object diameter' },
          anchor: { origin: carryOrigin.slice(), pivotWorld: point.slice(), startLook: { ...carryLook } } };
      }
    } else if (!ev.down) { held = false; target = null; if (mirror) mirror.anchor = null; }
  }
  hold(wallDt - cursor);
  if (keys.some(x => x !== 0) && !brainClearance) {
    if (typeof constrainBrainMovement !== 'function') fail('retained brain offset needs current source clearance');
    brainClearance = constrainBrainMovement([0, 0, 0], brainMovementWorld).diagnostic;
  }
  const base = vec(brainCentre, 'current brain centre').map((v, i) => v - transformDirection(k, vec(prior.brainKeyOffset, 'previous brain key offset'))[i]);
  const baseDistance = Math.hypot(...base.map((v, i) => v - o[i]));
  const diagnostic = { kind: 'bounded-object-carry-r22-r1', held, target, selectedThisFrame: selected, normalizedAxes: axis.slice(), heldPoseS,
    brainLimits: { ...bounds, centreNearM: Math.max(0, baseDistance - keyBudgetM), centreFarM: baseDistance + keyBudgetM },
    mirrorLimits: mirror ? { ...mirror.bounds } : null, brainClearance, clamped,
    timing: 'Original Space/pick timestamps and held coverage; keys use the same current-camera frame snapshot as the arm, mirror mouse-anchor follows the gaze event; no second activity/time advance',
    scope: 'Engineering limits/source clearance only; actual source/current-pose/native/wholebody/normalmechanics qualification remains open' };
  return { state: { held, target, lastPick, lastLook: { ...look }, lastOrigin: o.slice(), brainKeyOffset: keys, mirror, diagnostic }, brainMovementWorld, mirrorWorldCentre: mirror ? mirror.centreWorldM.slice() : null, diagnostic };
}

export function translateBrainRecord(record, state, initialOrigin) {
  if (!record.transform) fail('configured graph requires actual region-mode brain transform');
  const t = vec(state.translation, 'brain world translation'), raw = record.transform;
  if (![raw.matrix, raw.inverse].every(m => m && m.length === 16 && Array.from(m).every(Number.isFinite))) fail('actual finite brain matrix/inverse required');
  // The un-turned placement (ns-brain restMatrix), when the record carries one, moves with the brain like its matrix.
  const rest = raw.restMatrix && raw.restMatrix.length === 16 && Array.from(raw.restMatrix).every(Number.isFinite) ? multiply(translation(t), raw.restMatrix) : null;
  const transform = { ...raw, matrix: multiply(translation(t), raw.matrix), ...(rest ? { restMatrix: rest } : { restMatrix: undefined }), inverse: multiply(raw.inverse, translation(t.map(v => -v))),
    pivotWorld: raw.pivotWorld.map((v, i) => v + t[i]), referenceTranslation: t.slice(), referenceOrigin: initialOrigin.slice() };
  return { ...record, transform };
}
