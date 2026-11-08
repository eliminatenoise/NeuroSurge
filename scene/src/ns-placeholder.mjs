/** NeuroSurge scene: UNQUALIFIED PLACEHOLDER arm geometry.
 *
 * Constructed capsules only, for tests and the ?placeholder=1 mode. This is NOT anatomy: no real bone shape,
 * no muscles, no licensed asset. It uses the same source frame and input shape that deriveRig expects
 * (BodyParts3D-like millimetres: +x subject LEFT, +y POSTERIOR, +z SUPERIOR), posed like a LEFT arm in
 * anatomical position: hanging along -z, palm anterior (-y), thumb lateral (+x). Segment lengths are typical
 * adult magnitudes. Simplifications: no carrying angle; straight, collinear finger bones; one straight oblique
 * thumb ray. Pure, dependency-free ES module.
 */
import { add, sub, scale, cross, length, normalize, reject } from './ns-math.mjs';

export const PLACEHOLDER_LABEL = 'UNQUALIFIED PLACEHOLDER \u2014 not anatomy';

const ARM_X = 200;
const ARM_Y = -80;
const LONG_SPACING = 5;
const HAND_SPACING = 2.5;

/** Hand frame (mm): origin just distal to the forearm bones; u distal (-z), v radial (+x), w palmar (-y). */
const HAND_ORIGIN = [ARM_X, ARM_Y, 772];
const hp = (u, v, w) => [HAND_ORIGIN[0] + v, HAND_ORIGIN[1] - w, HAND_ORIGIN[2] - u];

/** Thumb ray in hand-frame coordinates: from the CMC region distally, radially and slightly palmar. */
const THUMB_START = [20, 22, 6];
const THUMB_DIR = (() => {
  const d = [38, 12, 10];
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
})();
const tp = s => hp(THUMB_START[0] + s * THUMB_DIR[0], THUMB_START[1] + s * THUMB_DIR[1], THUMB_START[2] + s * THUMB_DIR[2]);

/** Digit layout: radial offset v (mm) and [start, end] along u for metacarpal, proximal, middle, distal bones. */
const DIGIT_LAYOUT = Object.freeze({
  index: { v: 15, mc: [28, 92], pp: [95, 135], mp: [138, 161], dp: [164, 181] },
  middle: { v: 0, mc: [28, 90], pp: [93, 138], mp: [141, 168], dp: [171, 189] },
  ring: { v: -14, mc: [30, 85], pp: [88, 130], mp: [133, 159], dp: [162, 179] },
  little: { v: -27, mc: [32, 81], pp: [84, 116], mp: [119, 137], dp: [140, 155] }
});

/** [segment, label, start, end, radius, ring spacing] for every constructed bone capsule. */
function boneSpecs() {
  const specs = [
    ['upperarm', 'placeholder humerus', [ARM_X, ARM_Y, 1345], [ARM_X, ARM_Y, 1025], 14, LONG_SPACING],
    ['forearm', 'placeholder radius (lateral)', [ARM_X + 10, ARM_Y, 1021], [ARM_X + 10, ARM_Y, 776], 7, LONG_SPACING],
    ['forearm', 'placeholder ulna (medial)', [ARM_X - 10, ARM_Y, 1021], [ARM_X - 10, ARM_Y, 776], 7, LONG_SPACING],
    ['hand', 'placeholder proximal carpal (scaphoid position)', hp(0, 13, 0), hp(12, 13, 0), 4.5, HAND_SPACING],
    ['hand', 'placeholder proximal carpal (lunate position)', hp(0, 4, 0), hp(12, 4, 0), 4.5, HAND_SPACING],
    ['hand', 'placeholder proximal carpal (triquetrum position)', hp(0, -5, 0), hp(12, -5, 0), 4.5, HAND_SPACING],
    ['hand', 'placeholder proximal carpal (pisiform position)', hp(2, -12, 7), hp(10, -12, 7), 3.5, HAND_SPACING],
    ['hand', 'placeholder distal carpal (trapezium position)', hp(14, 16, 0), hp(26, 16, 0), 4.5, HAND_SPACING],
    ['hand', 'placeholder distal carpal (trapezoid position)', hp(14, 7, 0), hp(26, 7, 0), 4.5, HAND_SPACING],
    ['hand', 'placeholder distal carpal (capitate position)', hp(14, -2, 0), hp(26, -2, 0), 4.5, HAND_SPACING],
    ['hand', 'placeholder distal carpal (hamate position)', hp(14, -11, 0), hp(26, -11, 0), 4.5, HAND_SPACING]
  ];
  for (const [digit, L] of Object.entries(DIGIT_LAYOUT)) {
    specs.push(['hand', `placeholder ${digit} metacarpal`, hp(L.mc[0], L.v, 0), hp(L.mc[1], L.v, 0), 4.5, HAND_SPACING]);
    specs.push([`${digit}_pp`, `placeholder ${digit} proximal phalanx`, hp(L.pp[0], L.v, 0), hp(L.pp[1], L.v, 0), 4.5, HAND_SPACING]);
    specs.push([`${digit}_mp`, `placeholder ${digit} middle phalanx`, hp(L.mp[0], L.v, 0), hp(L.mp[1], L.v, 0), 4, HAND_SPACING]);
    specs.push([`${digit}_dp`, `placeholder ${digit} distal phalanx`, hp(L.dp[0], L.v, 0), hp(L.dp[1], L.v, 0), 3.5, HAND_SPACING]);
  }
  specs.push(
    ['thumb_mc', 'placeholder thumb metacarpal', tp(0), tp(42), 4.5, HAND_SPACING],
    ['thumb_pp', 'placeholder thumb proximal phalanx', tp(45), tp(75), 4.5, HAND_SPACING],
    ['thumb_dp', 'placeholder thumb distal phalanx', tp(78), tp(98), 4.5, HAND_SPACING]
  );
  return specs;
}

/** Closed capsule mesh whose extreme points are exactly `a` and `b` (Float32 positions, outward CCW triangles). */
function capsuleMesh(a, b, radius, spacing, sides = 12, capRings = 4) {
  const axis = sub(b, a);
  const len = length(axis);
  if (!(len > 2 * radius)) throw new Error('ns:placeholder_geometry: capsule shorter than its two end caps');
  const e = scale(axis, 1 / len);
  const helper = Math.abs(e[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(reject(helper, e));
  const w = cross(e, u);
  const ca = add(a, scale(e, radius));
  const cb = sub(b, scale(e, radius));
  const cyl = len - 2 * radius;
  const cylSteps = Math.max(1, Math.ceil(cyl / spacing));
  const rings = [];
  for (let k = 1; k <= capRings; k++) {
    const th = (Math.PI / 2) * (k / capRings);
    rings.push([sub(ca, scale(e, radius * Math.cos(th))), radius * Math.sin(th)]);
  }
  for (let k = 1; k < cylSteps; k++) rings.push([add(ca, scale(e, (cyl * k) / cylSteps)), radius]);
  for (let k = capRings; k >= 1; k--) {
    const th = (Math.PI / 2) * (k / capRings);
    rings.push([add(cb, scale(e, radius * Math.cos(th))), radius * Math.sin(th)]);
  }
  const vertexCount = 2 + rings.length * sides;
  const positions = new Float32Array(vertexCount * 3);
  const put = (i, p) => { positions[3 * i] = p[0]; positions[3 * i + 1] = p[1]; positions[3 * i + 2] = p[2]; };
  put(0, a);
  rings.forEach(([centre, r], ri) => {
    for (let j = 0; j < sides; j++) {
      const ang = (2 * Math.PI * j) / sides;
      put(1 + ri * sides + j, add(centre, add(scale(u, r * Math.cos(ang)), scale(w, r * Math.sin(ang)))));
    }
  });
  put(vertexCount - 1, b);
  const ring = (ri, j) => 1 + ri * sides + (j % sides);
  const idx = [];
  for (let j = 0; j < sides; j++) idx.push(0, ring(0, j + 1), ring(0, j));
  for (let ri = 0; ri + 1 < rings.length; ri++) {
    for (let j = 0; j < sides; j++) {
      const A = ring(ri, j), B = ring(ri, j + 1), C = ring(ri + 1, j + 1), D = ring(ri + 1, j);
      idx.push(A, B, C, A, C, D);
    }
  }
  const last = rings.length - 1;
  for (let j = 0; j < sides; j++) idx.push(vertexCount - 1, ring(last, j), ring(last, j + 1));
  return { positions, indices: Uint32Array.from(idx) };
}

/**
 * Build the constructed placeholder arm.
 * @returns {{label, placeholder:true, frame, bones:Map<string, Float32Array[]>, meshes:Map<string, Array<{label, positions, indices}>>,
 *   metacarpals:{index, middle, ring, little}, palmar:number[], anteriorUpper:number[], rigOptions, notes:string[]}}
 *   deriveRig(result.bones, result.rigOptions) builds a rig. The metacarpal arrays are the same objects as in bones.get('hand').
 */
export function buildPlaceholderArm() {
  const bones = new Map();
  const meshes = new Map();
  const metacarpals = {};
  for (const [segment, label, a, b, radius, spacing] of boneSpecs()) {
    const mesh = capsuleMesh(a, b, radius, spacing);
    if (!bones.has(segment)) { bones.set(segment, []); meshes.set(segment, []); }
    bones.get(segment).push(mesh.positions);
    meshes.get(segment).push(Object.freeze({ label: `${PLACEHOLDER_LABEL}: ${label}`, positions: mesh.positions, indices: mesh.indices }));
    const m = /^placeholder (index|middle|ring|little) metacarpal$/.exec(label);
    if (m) metacarpals[m[1]] = mesh.positions;
  }
  const palmar = Object.freeze([0, -1, 0]);
  const anteriorUpper = Object.freeze([0, -1, 0]);
  Object.freeze(metacarpals);
  return Object.freeze({
    label: PLACEHOLDER_LABEL,
    placeholder: true,
    frame: 'source millimetres: +x subject LEFT, +y POSTERIOR, +z SUPERIOR; LEFT arm in anatomical position (palm -y, thumb +x)',
    bones,
    meshes,
    metacarpals,
    palmar,
    anteriorUpper,
    rigOptions: Object.freeze({ palmar, anteriorUpper, metacarpals }),
    notes: Object.freeze([
      'Constructed capsules for tests and placeholder display only; not anatomy and not acceptable as the anatomical scene.',
      'palmar and anteriorUpper are stated constants for this construction, not muscle-compartment measurements.',
      'No muscles, tendons or skin are supplied; simulated activity cannot be shown on placeholder muscles.'
    ])
  });
}
