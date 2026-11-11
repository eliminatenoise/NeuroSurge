/** NeuroSurge scene: brain display transform, representative left-arm motor strip, framing and
 * gaze classification. Pure, dependency-free ES module (browser and Node); no DOM, no I/O.
 *
 * Frames:
 * - Source anatomy: BodyParts3D millimetres, +x subject LEFT, +y POSTERIOR, +z SUPERIOR
 *   (an inferred right-handed LPS frame).
 * - Display / world: Three convention, +x screen right, +y screen up, +z toward the camera.
 *   The camera sits at the world origin and looks along -z at yaw = pitch = 0.
 *
 * Round 2 (U2a-brain, appended at the end of this file): both hemispheres' precentral strips (and the medial wall /
 * paracentral meshes when present) segmented into BODY_MOTOR_MAP control regions (segmentMotorStrips), the region gaze
 * picker with hysteresis (classifyRegionGaze; classifyGaze dispatches to it for a segmentation), the brain view math
 * (BRAIN_VIEW default tilt 25 deg, frameBrain, brainViewTransform with orbit about the locked brain centre and grab
 * carry about the player), a coarse whole-brain hit grid, orbit-arrow placement and visibility diagnostics. The colour
 * ramp now lives in ns-colors.mjs (shared with the muscles). Everything earlier in the file is kept for the legacy
 * single-band path. R558 (strip audit round 2): in region mode each hemisphere's primary strip is parameterised by the
 * along-gyrus coordinate v (alongGyrusCoordinate), not by the |x| fraction u of the legacy path (stripParam, MARKERS).
 *
 * Scientific limits: the strip, markers, fields and colours are a representative, schematic,
 * simulated and unitless display. Marker positions are educational control targets placed by
 * a documented geometric rule on the FJ1801 mesh; they are not registered functional
 * coordinates. Regions overlap and vary between people. The visible precentral crown may be
 * premotor (BA6); M1 (BA4) lies largely in the sulcal bank.
 */
import {
  DEG, add, sub, scale, dot, cross, length, normalize,
  basis, multiply, translation, uniformScale, rayTriangle
} from './ns-math.mjs';
import {
  RAMP_STOPS_LINEAR, luminanceLinear, activityColor, activityColorSrgb, activityShade, smoothstep, KEY_COLORS
} from './ns-colors.mjs';

// ---------------------------------------------------------------------------------------------
// Validation helpers (errors: 'ns:<code>: message')

function vec3(v, what) {
  if (!v || v.length !== 3 || !Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) {
    throw new Error(`ns:brain_input: ${what} must be a finite [x, y, z]`);
  }
  return [v[0], v[1], v[2]];
}

function checkScale(k) {
  // A non-positive k would collapse or mirror the display (determinant <= 0).
  if (!(Number.isFinite(k) && k > 0)) throw new Error(`ns:brain_scale: display scale k must be finite and > 0 (got ${k})`);
}

function checkPositions(positions, what) {
  if (!positions || typeof positions.length !== 'number' || positions.length < 3 || positions.length % 3 !== 0) {
    throw new Error(`ns:brain_input: ${what} must be a flat xyz array with a length that is a positive multiple of 3`);
  }
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) throw new Error(`ns:brain_input: ${what}[${i}] is not finite`);
  }
  return positions;
}

function checkU(u, n) {
  if (!u || u.length !== n) throw new Error(`ns:brain_input: u must have one value per vertex (${n})`);
}

function checkBand(band) {
  if (!band || !Number.isFinite(band.uMin) || !Number.isFinite(band.uMax) || !(band.uMin < band.uMax)) {
    throw new Error('ns:brain_band: band must be { uMin, uMax } with finite uMin < uMax');
  }
  return band;
}

function checkPlacement(pl) {
  if (!pl) throw new Error('ns:brain_placement: brainPlacement { k, distance, centre } is required');
  checkScale(pl.k);
  if (!(Number.isFinite(pl.distance) && pl.distance > 0)) throw new Error('ns:brain_placement: distance must be finite and > 0');
  return { k: pl.k, distance: pl.distance, centre: vec3(pl.centre, 'brainPlacement.centre') };
}

const isIndex = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
const vtx = (pos, i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];

// ---------------------------------------------------------------------------------------------
// Display transform: display = (-(px - cx), -(py - cy), pz - cz) * k

/** Source mm point -> display units. Subject right (-x) goes to screen right (+x), anterior (-y)
 * goes up (+y), superior (+z) comes toward the camera (+z). A proper rotation (det +1) times k > 0. */
export function displayFromSource(p, centre, k) {
  checkScale(k);
  const a = vec3(p, 'p'), c = vec3(centre, 'centre');
  return [(c[0] - a[0]) * k, (c[1] - a[1]) * k, (a[2] - c[2]) * k];
}

/** Inverse of displayFromSource: display units -> source mm. */
export function sourceFromDisplay(q, centre, k) {
  checkScale(k);
  const d = vec3(q, 'q'), c = vec3(centre, 'centre');
  return [c[0] - d[0] / k, c[1] - d[1] / k, c[2] + d[2] / k];
}

/** DESIGN.md's DISPLAY_FROM_SOURCE, exposed as a frozen descriptor plus the two functions. */
export const DISPLAY_FROM_SOURCE = Object.freeze({
  axisSigns: Object.freeze([-1, -1, 1]),
  determinant: 1,
  forward: displayFromSource,
  inverse: sourceFromDisplay,
  description: 'display = (-(px - cx), -(py - cy), pz - cz) * k: subject right -> screen right, anterior -> up, superior -> toward camera; a proper rotation, never a mirror'
});

/** The 3x3 rotation part of the display transform as a column-major 4x4 (det +1). */
export function displayRotation() {
  return basis([-1, 0, 0], [0, -1, 0], [0, 0, 1]);
}

/** Source mm -> world metres for the whole brain group: world = displayFromSource(p, centre, k) + (0, 0, -distance). */
export function sourceToWorld(p, brainPlacement) {
  const { k, distance, centre } = checkPlacement(brainPlacement);
  const d = displayFromSource(p, centre, k);
  return [d[0], d[1], d[2] - distance];
}

/** World metres -> source mm (inverse of sourceToWorld). */
export function worldToSource(w, brainPlacement) {
  const { k, distance, centre } = checkPlacement(brainPlacement);
  const q = vec3(w, 'w');
  return sourceFromDisplay([q[0], q[1], q[2] + distance], centre, k);
}

/** Column-major 4x4 for the whole brain group: T(0, 0, -distance) * S(k) * R * T(-centre). */
export function brainWorldMatrix(brainPlacement) {
  const { k, distance, centre } = checkPlacement(brainPlacement);
  return multiply(translation([0, 0, -distance]),
    multiply(uniformScale(k), multiply(displayRotation(), translation([-centre[0], -centre[1], -centre[2]]))));
}

/** Orientation labels in display axes (for the R/L and anterior/posterior HUD labels). */
export const ORIENTATION = Object.freeze({
  right: Object.freeze({ label: 'R', display: Object.freeze([1, 0, 0]) }),
  left: Object.freeze({ label: 'L', display: Object.freeze([-1, 0, 0]) }),
  anterior: Object.freeze({ label: 'Anterior', display: Object.freeze([0, 1, 0]) }),
  posterior: Object.freeze({ label: 'Posterior', display: Object.freeze([0, -1, 0]) })
});

// ---------------------------------------------------------------------------------------------
// Strip parameter, band and representative markers

/** Medial-lateral strip coordinate per vertex: u = (|x| - |x|min) / (|x|max - |x|min), 0 medial .. 1 lateral.
 * side 'right' requires every x <= 0 (subject right); 'left' requires x >= 0. Returns Float32Array(n). */
export function stripParam(positions, side = 'right') {
  if (side !== 'right' && side !== 'left') throw new Error("ns:brain_side: side must be 'right' or 'left'");
  const pos = checkPositions(positions, 'positions');
  const n = pos.length / 3;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos[3 * i];
    if (side === 'right' ? x > 0 : x < 0) {
      throw new Error(`ns:brain_laterality: vertex ${i} has x = ${x}; a ${side}-hemisphere mesh needs ${side === 'right' ? 'x <= 0 (subject right)' : 'x >= 0 (subject left)'}`);
    }
    const ax = Math.abs(x);
    if (ax < lo) lo = ax;
    if (ax > hi) hi = ax;
  }
  const span = hi - lo;
  if (!(span > 0)) throw new Error('ns:brain_strip: the mesh has no medial-lateral extent');
  const u = new Float32Array(n);
  for (let i = 0; i < n; i++) u[i] = (Math.abs(pos[3 * i]) - lo) / span;
  return u;
}

/** Representative left-arm/hand territory on the right precentral gyrus (leg medial and face lateral stay glassy). */
export const ARM_BAND = Object.freeze({ uMin: 0.28, uMax: 0.78 });

/** Half-width of the u window used to place a marker. */
export const MARKER_WINDOW = 0.015;
export const MARKER_KIND = 'representative';
export const CROWN_NOTE = 'visible crown may be premotor (BA6); M1 (BA4) lies largely in the sulcal bank';

/** Representative marker u per action, in movement-map action order, on the LEGACY |x| fraction u of FJ1801 (stripParam).
 * Educational control targets only. R558: the hand markers sit on the atlas's own hand knob (|x| about 29 mm, u 0.44)
 * instead of about 8.5 mm lateral of it; all stay inside ARM_BAND, which is unchanged. R558 (strip audit round 2): these
 * u values serve only the legacy single-band path (no segmentation). Region mode picks the left-arm actions at the body
 * map's own positions in the along-gyrus coordinate (ns-bodymap LEFT_ARM_ACTION_U = action uCentre; regionActionAt) and
 * draws the dots there (placeRegionMarkers). The values are the left-arm actions' positions in the activation-point
 * layout of the |x| fraction (R558, Message 14), the coordinate this legacy path still uses. */
export const MARKERS = Object.freeze([
  ['grasp_close', 0.40657],
  ['relax_release', 0.41691],
  ['open_hand', 0.42725],
  ['spread_fingers', 0.43759],
  ['wrist_flexion', 0.35774],
  ['wrist_extension', 0.37021],
  ['elbow_flexion', 0.30002],
  ['elbow_extension', 0.31928],
  ['index_flexion', 0.53825],
  ['index_extension', 0.55135],
  ['thumb_mcp_flexion', 0.56289],
  ['thumb_mcp_extension', 0.57288]
].map(([actionId, u]) => Object.freeze({ actionId, u, kind: MARKER_KIND })));

/** True when marker `mi` has the nearest target u to `ui` (exact ties go to the earlier marker). */
function ownsU(mi, ui) {
  const d = Math.abs(ui - MARKERS[mi].u);
  for (let j = 0; j < MARKERS.length; j++) {
    if (j === mi) continue;
    const dj = Math.abs(ui - MARKERS[j].u);
    if (dj < d || (dj === d && j < mi)) return false;
  }
  return true;
}

/** Representative marker DOT geometry in source mm: vertex radius radiusMm, lift liftMm along superior (+z), activeScale
 * x when highlighted. With MARKER_OCTAHEDRON and markerSolid this is the ONE definition both the scene draws
 * (ns-scene-three builds every marker mesh from MARKER_OCTAHEDRON and places/scales it with markerSolid) and the picker
 * intersects (classifyGaze, repair R5: the same transformed triangles, not an inscribed sphere). */
export const MARKER_GEOMETRY = Object.freeze({ radiusMm: 0.8, liftMm: 0.8, activeScale: 1.7 });
/** The drawn marker mesh: a unit regular octahedron (vertex radius 1, vertices on the source axes), 8 outward
 * counter-clockwise triangles, drawn FrontSide. ns-scene-three draws exactly these arrays (as Float32/Uint32 buffers);
 * classifyGaze intersects exactly these triangles, front faces only, as three's Raycaster does for a FrontSide mesh. */
export const MARKER_OCTAHEDRON = Object.freeze({
  positions: Object.freeze([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]),
  indices: Object.freeze([0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5]),
  side: 'front'
});
/** A vertex counts as visible from above when no strip triangle lies more than this above it on its vertical. */
export const MARKER_VISIBILITY_TOL_MM = 0.25;
/** R3 placement check: rays through a candidate's lifted dot centre from these virtual viewpoints must all land on band
 * triangles of the marker's own nearest-u region, so the drawn dot sits on its own region (not a neighbour's, not empty
 * space) as the default camera sees it. Viewpoints sit above the band's aim point, found as frameBand finds it (the
 * band surface under the centre of the band's bounding box): heights in mm (the default framings put the camera
 * 39-48 mm above it) and lateral offsets in mm (centring differences between aspects), plus straight down. */
export const MARKER_VIEWPOINTS = Object.freeze({ heightsMm: Object.freeze([34, 42, 50, 60]), offsetsMm: 5 });

/** The drawn solid of a placed marker, exactly as ns-scene-three places and scales its mesh: { centre (source mm:
 * position + liftMm along superior), scale (vertex radius mm: radiusMm, x activeScale when active) }. The mesh is
 * MARKER_OCTAHEDRON scaled uniformly by `scale` about `centre` (no rotation in source axes). */
export function markerSolid(marker, active = false) {
  const p = vec3(marker && marker.position, 'marker.position');
  return { centre: [p[0], p[1], p[2] + MARKER_GEOMETRY.liftMm], scale: MARKER_GEOMETRY.radiusMm * (active ? MARKER_GEOMETRY.activeScale : 1) };
}

/** Nearest entry distance (>= 0) of a ray (dir unit) into a drawn marker solid, or null: the MARKER_OCTAHEDRON
 * triangles scaled by solid.scale about solid.centre, front faces only, edges inclusive (the arithmetic of three's
 * Ray.intersectTriangle with backface culling). From outside, the first front face hit is the surface entry; a ray
 * starting inside meets only back faces, which a FrontSide mesh does not draw, so it does not hit. */
export function rayMarkerSolid(rayOrigin, rayDir, solid) {
  // A2-render R1: scalar form of the R5 arithmetic (identical operations and order, no per-face arrays).
  const P = MARKER_OCTAHEDRON.positions, I = MARKER_OCTAHEDRON.indices;
  const c0 = solid.centre[0], c1 = solid.centre[1], c2 = solid.centre[2], s = solid.scale;
  const o0 = rayOrigin[0], o1 = rayOrigin[1], o2 = rayOrigin[2], d0 = rayDir[0], d1 = rayDir[1], d2 = rayDir[2];
  let best = null;
  for (let f = 0; f < I.length; f += 3) {
    const ia = 3 * I[f], ib = 3 * I[f + 1], ic = 3 * I[f + 2];
    const ax = c0 + s * P[ia], ay = c1 + s * P[ia + 1], az = c2 + s * P[ia + 2];
    const e1x = (c0 + s * P[ib]) - ax, e1y = (c1 + s * P[ib + 1]) - ay, e1z = (c2 + s * P[ib + 2]) - az;
    const e2x = (c0 + s * P[ic]) - ax, e2y = (c1 + s * P[ic + 1]) - ay, e2z = (c2 + s * P[ic + 2]) - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    let ddn = d0 * nx + d1 * ny + d2 * nz;
    if (!(ddn < 0)) continue; // back-facing or edge-on: not drawn from this side
    ddn = -ddn;
    const fx = o0 - ax, fy = o1 - ay, fz = o2 - az; // diff
    // b1 = -dot(dir, cross(diff, e2)); b2 = -dot(dir, cross(e1, diff))
    const b1 = -(d0 * (fy * e2z - fz * e2y) + d1 * (fz * e2x - fx * e2z) + d2 * (fx * e2y - fy * e2x));
    if (b1 < 0) continue;
    const b2 = -(d0 * (e1y * fz - e1z * fy) + d1 * (e1z * fx - e1x * fz) + d2 * (e1x * fy - e1y * fx));
    if (b2 < 0 || b1 + b2 > ddn) continue;
    const qdn = fx * nx + fy * ny + fz * nz;
    if (qdn < 0) continue; // behind the origin
    const t = qdn / ddn;
    if (best === null || t < best) best = t;
  }
  return best;
}

/** Inscribed sphere of a marker's drawn octahedron: { centre (source mm, lifted), radius (vertex radius / sqrt 3) }.
 * Every point within it is inside the drawn solid, so it is a guaranteed-inside region for placement checks and test
 * construction. It is NOT the pick target (repair R5: classifyGaze picks the drawn solid itself, markerSolid). */
export function markerDot(marker, active = false) {
  const p = vec3(marker && marker.position, 'marker.position');
  const r = (MARKER_GEOMETRY.radiusMm * (active ? MARKER_GEOMETRY.activeScale : 1)) / Math.sqrt(3);
  return { centre: [p[0], p[1], p[2] + MARKER_GEOMETRY.liftMm], radius: r };
}

/** The action whose representative u is nearest to u (exact ties go to the earlier MARKERS entry, as ownsU). With equal
 * drives this is also the argmax of the overlapping simulated fields (equal-width Gaussians), so strip selection, the
 * field highlight and the marker highlight agree. null for a non-finite u. */
export function actionForU(u) {
  if (!Number.isFinite(u)) return null;
  let best = -1, bd = Infinity;
  for (let i = 0; i < MARKERS.length; i++) {
    const d = Math.abs(u - MARKERS[i].u);
    if (d < bd) { bd = d; best = i; }
  }
  return MARKERS[best].actionId;
}

// ---------------------------------------------------------------------------------------------
// Selectable control regions (A2-render R1). These are EXACTLY the actionForU pick regions: each in-band u belongs to
// the marker with the nearest representative u, so the region borders sit at the midpoints between neighbouring
// marker u values. They are control regions of this display, not cortical borders: real representations overlap and
// vary between people (MARKER_KIND 'representative'). The drawn region tints/borders/hover outline in ns-scene-three
// use these helpers' arithmetic (nearest marker, then the midpoint with the second-nearest marker).

/** MARKERS index of the action whose representative u is nearest to u (actionForU's rule and tie-break), or -1. */
export function regionIndexForU(u) {
  if (!Number.isFinite(u)) return -1;
  let best = -1, bd = Infinity;
  for (let i = 0; i < MARKERS.length; i++) {
    const d = Math.abs(u - MARKERS[i].u);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Region identity at u: { index, actionId (= actionForU(u)), neighbour (MARKERS index of the second-nearest marker,
 * whose shared border is the nearest pick boundary), borderU (that boundary's u: the midpoint of the two markers),
 * borderDistU (|u - borderU| >= 0) }. null for a non-finite u. The shader in ns-scene-three computes the same values
 * per fragment from the interpolated u (u is affine in source x, so interpolation is exact). */
export function regionInfo(u) {
  if (!Number.isFinite(u)) return null;
  let i1 = -1, i2 = -1, d1 = Infinity, d2 = Infinity;
  for (let i = 0; i < MARKERS.length; i++) {
    const d = Math.abs(u - MARKERS[i].u);
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; }
  }
  const borderU = 0.5 * (MARKERS[i1].u + MARKERS[i2].u);
  return { index: i1, actionId: MARKERS[i1].actionId, neighbour: i2, borderU, borderDistU: Math.abs(u - borderU) };
}

/** The control regions in medial -> lateral order: frozen [{ actionId, index (MARKERS index), u, uLo, uHi }], where
 * [uLo, uHi] is the u interval actionForU assigns to the action inside `band` (outer edges clipped to the band). */
export function controlRegions(band = ARM_BAND) {
  const b = checkBand(band);
  const sorted = MARKERS.map((m, index) => ({ m, index })).sort((a, c) => a.m.u - c.m.u || a.index - c.index);
  return Object.freeze(sorted.map(({ m, index }, k) => Object.freeze({
    actionId: m.actionId,
    index,
    u: m.u,
    uLo: k === 0 ? b.uMin : Math.max(b.uMin, 0.5 * (sorted[k - 1].m.u + m.u)),
    uHi: k === sorted.length - 1 ? b.uMax : Math.min(b.uMax, 0.5 * (m.u + sorted[k + 1].m.u))
  })));
}

/** Pick boundaries (u) between neighbouring control regions, medial -> lateral (11 values for 12 markers). */
export function regionBoundaries() {
  const r = controlRegions();
  return Object.freeze(r.slice(1).map(x => x.uLo));
}

/** Highest strip z on the vertical through (x, y), or null when the vertical misses every triangle. */
function makeTopZ(pos, idx) {
  const m = idx.length / 3, n = pos.length / 3;
  const bb = new Float64Array(4 * m);
  for (let t = 0; t < m; t++) {
    const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
    if (!(isIndex(a, n) && isIndex(b, n) && isIndex(c, n))) throw new Error(`ns:brain_mesh: triangle ${t} has an out-of-range index`);
    bb[4 * t] = Math.min(pos[3 * a], pos[3 * b], pos[3 * c]); bb[4 * t + 1] = Math.max(pos[3 * a], pos[3 * b], pos[3 * c]);
    bb[4 * t + 2] = Math.min(pos[3 * a + 1], pos[3 * b + 1], pos[3 * c + 1]); bb[4 * t + 3] = Math.max(pos[3 * a + 1], pos[3 * b + 1], pos[3 * c + 1]);
  }
  let zMax = -Infinity;
  for (let i = 2; i < pos.length; i += 3) if (pos[i] > zMax) zMax = pos[i];
  const down = [0, 0, -1];
  return (x, y) => {
    const o = [x, y, zMax + 10];
    let best = null;
    for (let t = 0; t < m; t++) {
      if (x < bb[4 * t] - 1e-9 || x > bb[4 * t + 1] + 1e-9 || y < bb[4 * t + 2] - 1e-9 || y > bb[4 * t + 3] + 1e-9) continue;
      const h = rayTriangle(o, down, vtx(pos, idx[3 * t]), vtx(pos, idx[3 * t + 1]), vtx(pos, idx[3 * t + 2]));
      if (h !== null && (best === null || h < best)) best = h;
    }
    return best === null ? null : o[2] - best;
  };
}

/** Place each marker on a strip vertex. Candidates: in-band vertices with |u - target| < window whose nearest target is
 * this marker's (some DESIGN windows overlap; markers never share a vertex).
 *  - Without `indices` (R1/R2 rule): the most posterior candidate (max source y, toward the central sulcus); ties go to
 *    max z, then to the nearest u, then to the lowest vertex index.
 *  - With `indices` (the mesh triangles; R3 rule, framing/HUD repair R3; Root marker-aim review F1/F2): candidates
 *    VISIBLE FROM ABOVE (no triangle more than MARKER_VISIBILITY_TOL_MM above them on their vertical; the dorsal view
 *    looks down that vertical) are tried crown first (max z, then max y, nearest u, lowest index); the first whose dot
 *    passes the view check wins: the vertical ray and the rays from the MARKER_VIEWPOINTS virtual cameras through its
 *    lifted dot centre all first hit in-band triangles whose interpolated u selects this marker (actionForU). So, as
 *    the default camera sees it, a drawn dot sits on its own selectable region, never over a neighbour's u-band (the
 *    R2 posterior-bank dots under the crown did) or over empty space (an edge, hole or the sulcal lip). If no visible
 *    candidate passes, the first visible one is used (viewChecked false); if none is visible, the R2 rule
 *    (crownVisible false).
 * If the window holds no vertex (sparse mesh), the in-band vertex with the nearest u is used (ties: max y, then max z)
 * and `fallback` is true. Returns a frozen array, in MARKERS order, of { actionId, u, kind, vertexIndex, position
 * (source mm), uVertex, fallback, crownVisible, viewChecked } (the last two null without indices). The dot is drawn and
 * picked as markerSolid(marker). Positions are representative control targets, not registered functional coordinates;
 * the crown/BA4 note (CROWN_NOTE) still applies. */
export function placeMarkers(positions, u, { band = ARM_BAND, uWindow = MARKER_WINDOW, indices = null, visibilityTolMm = MARKER_VISIBILITY_TOL_MM, viewpoints = MARKER_VIEWPOINTS } = {}) {
  const pos = checkPositions(positions, 'positions');
  const n = pos.length / 3;
  checkU(u, n);
  const b = checkBand(band);
  if (!(Number.isFinite(uWindow) && uWindow > 0)) throw new Error('ns:brain_markers: uWindow must be finite and > 0');
  let visible = null, viewOk = null;
  if (indices !== null && indices !== undefined) {
    if (typeof indices.length !== 'number' || indices.length % 3 !== 0 || indices.length === 0) throw new Error('ns:brain_markers: indices must be triangle indices');
    const topZ = makeTopZ(pos, indices);
    const vis = new Map();
    visible = i => {
      if (!vis.has(i)) { const z = topZ(pos[3 * i], pos[3 * i + 1]); vis.set(i, z === null || pos[3 * i + 2] >= z - visibilityTolMm); }
      return vis.get(i);
    };
    // In-band triangles (as splitBand focus) for the view-cone check.
    const inBand = x => x >= b.uMin && x <= b.uMax;
    const band3 = [];
    for (let t = 0; t < indices.length; t += 3) if (inBand(u[indices[t]]) && inBand(u[indices[t + 1]]) && inBand(u[indices[t + 2]])) band3.push(t);
    // Virtual viewpoints above the band aim point (bounding-box centre of the in-band vertices, on the band surface).
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (!inBand(u[i])) continue;
      x0 = Math.min(x0, pos[3 * i]); x1 = Math.max(x1, pos[3 * i]); y0 = Math.min(y0, pos[3 * i + 1]); y1 = Math.max(y1, pos[3 * i + 1]); z1 = Math.max(z1, pos[3 * i + 2]);
    }
    const ax = (x0 + x1) / 2, ay = (y0 + y1) / 2, az = topZ(ax, ay) ?? z1;
    const eyes = [];
    for (const h of viewpoints.heightsMm) eyes.push([ax, ay, az + h]);
    const off = viewpoints.offsetsMm, hMid = viewpoints.heightsMm[Math.floor(viewpoints.heightsMm.length / 2)];
    for (const [dx, dy] of [[off, 0], [-off, 0], [0, off], [0, -off]]) eyes.push([ax + dx, ay + dy, az + hMid]);
    const uAt = (o, d) => {
      let bt = Infinity, bu = null;
      for (const t of band3) {
        const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2];
        const A = vtx(pos, ia), B = vtx(pos, ib), C = vtx(pos, ic);
        const h = rayTriangle(o, d, A, B, C);
        if (h === null || !(h < bt)) continue;
        bt = h;
        const P = add(o, scale(d, h)), v0 = sub(B, A), v1 = sub(C, A), v2 = sub(P, A);
        const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1), den = d00 * d11 - d01 * d01;
        const wb = den > 0 ? (d11 * d20 - d01 * d21) / den : 1 / 3, wc = den > 0 ? (d00 * d21 - d01 * d20) / den : 1 / 3;
        bu = (1 - wb - wc) * u[ia] + wb * u[ib] + wc * u[ic];
      }
      return bu;
    };
    viewOk = (i, actionId) => {
      const c = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2] + MARKER_GEOMETRY.liftMm];
      if (actionForU(uAt([c[0], c[1], c[2] + 30], [0, 0, -1])) !== actionId) return false; // straight down
      for (const e of eyes) {
        const d = normalize(sub(c, e));
        if (actionForU(uAt(e, d)) !== actionId) return false; // the virtual camera's ray through the dot
      }
      return true;
    };
  }
  return Object.freeze(MARKERS.map((m, mi) => {
    const candidates = [];
    for (let i = 0; i < n; i++) {
      const ui = u[i];
      if (!(ui >= b.uMin && ui <= b.uMax)) continue;
      const d = Math.abs(ui - m.u);
      if (d < uWindow && ownsU(mi, ui)) candidates.push(i);
    }
    const posterior = (i, j) => (pos[3 * j + 1] - pos[3 * i + 1]) || (pos[3 * j + 2] - pos[3 * i + 2]) || (Math.abs(u[i] - m.u) - Math.abs(u[j] - m.u)) || (i - j);
    const crown = (i, j) => (pos[3 * j + 2] - pos[3 * i + 2]) || (pos[3 * j + 1] - pos[3 * i + 1]) || (Math.abs(u[i] - m.u) - Math.abs(u[j] - m.u)) || (i - j);
    let best = -1, fallback = false, crownVisible = null, viewChecked = null;
    if (visible) {
      const vis = candidates.filter(visible).sort(crown);
      const ok = vis.find(i => viewOk(i, m.actionId));
      if (ok !== undefined) { best = ok; viewChecked = true; crownVisible = true; }
      else if (vis.length) { best = vis[0]; viewChecked = false; crownVisible = true; }
      else { crownVisible = false; viewChecked = false; }
    }
    if (best < 0 && candidates.length) best = candidates.slice().sort(posterior)[0];
    if (best < 0) {
      fallback = true;
      let by = 0, bz = 0, bd = 0;
      for (let i = 0; i < n; i++) {
        const ui = u[i];
        if (!(ui >= b.uMin && ui <= b.uMax)) continue;
        const d = Math.abs(ui - m.u);
        const y = pos[3 * i + 1], z = pos[3 * i + 2];
        if (best < 0 || d < bd || (d === bd && (y > by || (y === by && z > bz)))) {
          best = i; by = y; bz = z; bd = d;
        }
      }
      if (visible && best >= 0) { crownVisible = visible(best); viewChecked = false; }
    }
    if (best < 0) throw new Error(`ns:brain_markers: no strip vertex inside the band for ${m.actionId}`);
    return Object.freeze({
      actionId: m.actionId,
      u: m.u,
      kind: MARKER_KIND,
      vertexIndex: best,
      position: Object.freeze(vtx(pos, best)),
      uVertex: u[best],
      fallback,
      crownVisible,
      viewChecked
    });
  }));
}

/** HUD/marker label: always 'representative', with the binding's visible qualifier and the crown note.
 * `binding` is ns-actions' bindMovementMap result ({ actions: Map(id -> { label }), qualifier }). */
export function markerLabel(actionId, binding) {
  if (!MARKERS.some(m => m.actionId === actionId)) throw new Error(`ns:brain_label: unknown action ${actionId}`);
  if (!binding || typeof binding.qualifier !== 'string' || !binding.qualifier.trim()) {
    throw new Error('ns:brain_label: binding.qualifier (the visible representative-map qualifier) is required');
  }
  const acts = binding.actions;
  const entry = acts instanceof Map ? acts.get(actionId) : acts ? acts[actionId] : undefined;
  if (!entry || typeof entry.label !== 'string' || !entry.label.trim()) {
    throw new Error(`ns:brain_label: the binding has no label for ${actionId}`);
  }
  return Object.freeze({
    actionId,
    kind: MARKER_KIND,
    text: `${entry.label} (representative)`,
    qualifier: binding.qualifier,
    note: CROWN_NOTE
  });
}

// ---------------------------------------------------------------------------------------------
// Band split

function extractPart(pos, idx, u, mask, want) {
  const n = u.length, m = idx.length / 3;
  const remap = new Int32Array(n).fill(-1);
  let vCount = 0, tCount = 0;
  for (let t = 0; t < m; t++) {
    if (mask[t] !== want) continue;
    tCount++;
    for (let j = 0; j < 3; j++) {
      const v = idx[3 * t + j];
      if (remap[v] < 0) remap[v] = vCount++;
    }
  }
  const positions = new Float32Array(vCount * 3);
  const uOut = new Float32Array(vCount);
  const sourceIndex = new Uint32Array(vCount);
  for (let v = 0; v < n; v++) {
    const r = remap[v];
    if (r < 0) continue;
    positions[3 * r] = pos[3 * v];
    positions[3 * r + 1] = pos[3 * v + 1];
    positions[3 * r + 2] = pos[3 * v + 2];
    uOut[r] = u[v];
    sourceIndex[r] = v;
  }
  const indices = new Uint32Array(tCount * 3);
  const triangles = new Uint32Array(tCount);
  let j = 0;
  for (let t = 0; t < m; t++) {
    if (mask[t] !== want) continue;
    indices[3 * j] = remap[idx[3 * t]];
    indices[3 * j + 1] = remap[idx[3 * t + 1]];
    indices[3 * j + 2] = remap[idx[3 * t + 2]];
    triangles[j] = t;
    j++;
  }
  return { positions, indices, u: uOut, sourceIndex, triangles, vertexCount: vCount, faceCount: tCount };
}

/** Split a mesh by triangle: focus if all three vertices have u inside the band (inclusive), else glass.
 * Each part is compacted: { positions (source mm), indices, u, sourceIndex (original vertex per part
 * vertex), triangles (original triangle per part triangle), vertexCount, faceCount }. */
export function splitBand(mesh, u, band = ARM_BAND) {
  if (!mesh) throw new Error('ns:brain_mesh: mesh { positions, indices } is required');
  const pos = checkPositions(mesh.positions, 'mesh.positions');
  const idx = mesh.indices;
  if (!idx || typeof idx.length !== 'number' || idx.length % 3 !== 0) throw new Error('ns:brain_mesh: indices length must be a multiple of 3');
  const n = pos.length / 3, m = idx.length / 3;
  checkU(u, n);
  const b = checkBand(band);
  const inBand = new Uint8Array(n);
  for (let i = 0; i < n; i++) inBand[i] = u[i] >= b.uMin && u[i] <= b.uMax ? 1 : 0;
  const isFocus = new Uint8Array(m);
  for (let t = 0; t < m; t++) {
    const ia = idx[3 * t], ib = idx[3 * t + 1], ic = idx[3 * t + 2];
    if (!(isIndex(ia, n) && isIndex(ib, n) && isIndex(ic, n))) throw new Error(`ns:brain_mesh: triangle ${t} has an out-of-range index`);
    isFocus[t] = inBand[ia] & inBand[ib] & inBand[ic];
  }
  return { focus: extractPart(pos, idx, u, isFocus, 1), glass: extractPart(pos, idx, u, isFocus, 0) };
}

// ---------------------------------------------------------------------------------------------
// Framing

/** Axis-aligned bounds of a flat xyz array (or of a { positions } mesh). */
export function boundsOf(positions) {
  const pos = checkPositions(positions && positions.positions ? positions.positions : positions, 'positions');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = pos[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

/** Giant display scale for the focus box. `focusBoundsDisplayUnit` = { min, max } in display axes at k = 1 (mm).
 * With the box centre on the view axis at depth `distance` (metres) and yaw = pitch = 0, the box's
 * projection fills exactly `fill` of the limiting screen dimension (NDC half-extent = fill) and is
 * centred. The near face (display +z) sets the projected size. Recompute on resize.
 * Returns { k (metres per mm), distance, limiting: 'width' | 'height', boxCentreDisplayUnit,
 * halfExtentsDisplayUnit, nearDepth }. */
export function frameStrip(focusBoundsDisplayUnit, { fovYDeg = 70, aspect, fill = 0.8, distance = 6 } = {}) {
  if (!focusBoundsDisplayUnit) throw new Error('ns:brain_frame: focus bounds { min, max } are required');
  const lo = vec3(focusBoundsDisplayUnit.min, 'bounds.min'), hi = vec3(focusBoundsDisplayUnit.max, 'bounds.max');
  if (!(hi[0] >= lo[0] && hi[1] >= lo[1] && hi[2] >= lo[2])) throw new Error('ns:brain_frame: bounds.max must be >= bounds.min');
  if (!(Number.isFinite(fovYDeg) && fovYDeg > 0 && fovYDeg < 180)) throw new Error('ns:brain_frame: fovYDeg must be in (0, 180)');
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_frame: aspect must be finite and > 0');
  if (!(Number.isFinite(fill) && fill > 0 && fill <= 1)) throw new Error('ns:brain_frame: fill must be in (0, 1]');
  if (!(Number.isFinite(distance) && distance > 0)) throw new Error('ns:brain_frame: distance must be finite and > 0');
  const hx = (hi[0] - lo[0]) / 2, hy = (hi[1] - lo[1]) / 2, hz = (hi[2] - lo[2]) / 2;
  if (!(hx > 0) && !(hy > 0)) throw new Error('ns:brain_frame: focus bounds have no screen-plane extent');
  // Near-face corner: ndc.x = k*hx / ((distance - k*hz) * tan * aspect) = fill  =>  k = f*t*a*D / (hx + f*t*a*hz).
  const ft = fill * Math.tan((fovYDeg * DEG) / 2);
  const kx = hx > 0 ? (ft * aspect * distance) / (hx + ft * aspect * hz) : Infinity;
  const ky = hy > 0 ? (ft * distance) / (hy + ft * hz) : Infinity;
  const k = Math.min(kx, ky);
  return {
    k,
    distance,
    limiting: kx <= ky ? 'width' : 'height',
    boxCentreDisplayUnit: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    halfExtentsDisplayUnit: [hx, hy, hz],
    nearDepth: distance - k * hz
  };
}

/** Convenience: brainPlacement { k, distance, centre (source mm), limiting } that frames the focus
 * vertices (flat xyz or { positions }) with frameStrip, using the focus box centre as `centre`. */
export function placementForFocus(focusPositions, viewport = {}) {
  const { min, max } = boundsOf(focusPositions);
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const a = displayFromSource(min, centre, 1), b = displayFromSource(max, centre, 1);
  const f = frameStrip({
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]
  }, viewport);
  return { k: f.k, distance: f.distance, centre, limiting: f.limiting };
}

// ---------------------------------------------------------------------------------------------
// Band framing on the actual projected vertices (framing/HUD repair R2)
//
// frameStrip fits the near FACE of the focus bounding box. The real band is 31 x 58 x 65 mm (display x, y, z) and its
// lateral part curves away from the camera, so the box face over-states the visible band: at 16:10 the real band
// covered only 0.55 of the half-height and its projected centre sat 0.16 NDC below the crosshair. frameBand fits the
// projected band vertices themselves, centres their projected bounding box on the crosshair and puts the crosshair on
// the band's top surface, so the default gaze always hits the band. The display rotation is unchanged (never mirrored).

/** Default band framing: fill = projected half-extent of the band in the limiting dimension (NDC). Viewports with
 * aspect < compactAspect use compactFill, which leaves room for the compact top/bottom HUD (ns-scene-three HUD_LAYOUT).
 * The 6 m distance keeps the nearest brain point >= 2 m from the camera at these fills (giant-brain near plane).
 * A2-render R1: fill raised from 0.66 / 0.58 to 0.85 / 0.75 so the looked-at strip fills most of the screen (user
 * requirement); the crosshair still lands on the band's top surface at yaw = pitch = 0 (frameBand aimOnBand). The
 * R2 history values are kept in BAND_FRAME_R2 for A/B checks. */
export const BAND_FRAME = Object.freeze({ fill: 0.85, compactFill: 0.75, compactAspect: 1.45, distance: 6 });
/** The previous (framing/HUD repair R2) default, retained for comparison only. */
export const BAND_FRAME_R2 = Object.freeze({ fill: 0.66, compactFill: 0.58, compactAspect: 1.45, distance: 6 });

function focusMesh(focus) {
  if (focus && focus.positions) {
    const pos = checkPositions(focus.positions, 'focus.positions');
    const idx = focus.indices && typeof focus.indices.length === 'number' && focus.indices.length % 3 === 0 && focus.indices.length > 0 ? focus.indices : null;
    return { pos, idx };
  }
  return { pos: checkPositions(focus, 'focus positions'), idx: null };
}

/** Highest (max display z) point of the band on the display-vertical line through display (x, y) (k = 1 display mm
 * about `c0`); the display vertical is the source vertical, i.e. the default camera ray. null when the line misses. */
function topHit(pos, idx, c0, x, y, zAbove) {
  if (!idx) return null;
  const n = pos.length / 3;
  const o = sourceFromDisplay([x, y, zAbove], c0, 1);
  const down = [0, 0, -1];
  let best = null;
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
    if (!(isIndex(ia, n) && isIndex(ib, n) && isIndex(ic, n))) throw new Error(`ns:brain_mesh: focus triangle ${t / 3} has an out-of-range index`);
    const h = rayTriangle(o, down, vtx(pos, ia), vtx(pos, ib), vtx(pos, ic));
    if (h !== null && (best === null || h < best)) best = h;
  }
  return best === null ? null : displayFromSource([o[0], o[1], o[2] - best], c0, 1)[2];
}

/** Display (k = 1) xy of the centroid of the band triangle nearest to (x, y), and its top display z. */
function nearestTriangleCentroid(pos, idx, c0, x, y) {
  let best = null, bd = Infinity;
  const tri = idx || null;
  const count = tri ? tri.length / 3 : pos.length / 3;
  for (let t = 0; t < count; t++) {
    const ids = tri ? [tri[3 * t], tri[3 * t + 1], tri[3 * t + 2]] : [t, t, t];
    const c = [0, 0, 0];
    for (const i of ids) { const d = displayFromSource(vtx(pos, i), c0, 1); c[0] += d[0] / 3; c[1] += d[1] / 3; c[2] += d[2] / 3; }
    const dd = (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y);
    if (dd < bd || (dd === bd && best && c[2] > best[2])) { bd = dd; best = c; }
  }
  return best;
}

function projectedBounds(disp, o, k, D, ta, t) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < disp.length; i += 3) {
    const depth = D - k * (disp[i + 2] - o[2]);
    if (!(depth > 0)) return null;
    const x = (k * (disp[i] - o[0])) / (depth * ta), y = (k * (disp[i + 1] - o[1])) / (depth * t);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1 };
}

/**
 * Frame the band on its projected vertices. focus: splitBand(...).focus ({ positions, indices }) or a flat xyz array
 * (without indices the crosshair point falls back to the nearest vertex). At yaw = pitch = 0 the projected bounding
 * box of every focus vertex is centred on the crosshair, its half-extent in the limiting dimension is `fill` (NDC) and
 * the other dimension fits; the crosshair ray meets the band's top surface at exactly `distance`.
 * Returns plain data { k, distance, centre (source mm; maps to world (0, 0, -distance)), limiting: 'width' | 'height',
 * fill, ndcBounds: { x0, x1, y0, y1 }, aimOnBand: boolean }. Recompute on resize. Same display rotation (det +1).
 */
export function frameBand(focus, { fovYDeg = 70, aspect, fill = BAND_FRAME.fill, distance = BAND_FRAME.distance, iterations = 12 } = {}) {
  if (!(Number.isFinite(fovYDeg) && fovYDeg > 0 && fovYDeg < 180)) throw new Error('ns:brain_frame: fovYDeg must be in (0, 180)');
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_frame: aspect must be finite and > 0');
  if (!(Number.isFinite(fill) && fill > 0 && fill <= 1)) throw new Error('ns:brain_frame: fill must be in (0, 1]');
  if (!(Number.isFinite(distance) && distance > 0)) throw new Error('ns:brain_frame: distance must be finite and > 0');
  const { pos, idx } = focusMesh(focus);
  const { min, max } = boundsOf(pos);
  const c0 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const n = pos.length / 3;
  const disp = new Float64Array(pos.length);
  for (let i = 0; i < n; i++) {
    const d = displayFromSource(vtx(pos, i), c0, 1);
    disp[3 * i] = d[0]; disp[3 * i + 1] = d[1]; disp[3 * i + 2] = d[2];
  }
  if (!(max[0] > min[0]) && !(max[1] > min[1])) throw new Error('ns:brain_frame: focus has no screen-plane extent');
  const t = Math.tan((fovYDeg * DEG) / 2), ta = t * aspect, D = distance;
  // The crosshair point: the band's top surface under (ox, oy); the triangle-centroid fallback keeps it on the band.
  const zAbove = (max[2] - min[2]) + 10;
  const aimAt = (x, y) => {
    const z = topHit(pos, idx, c0, x, y, zAbove);
    if (z !== null) return { o: [x, y, z], onBand: true };
    const c = nearestTriangleCentroid(pos, idx, c0, x, y);
    const zc = topHit(pos, idx, c0, c[0], c[1], zAbove);
    return { o: [c[0], c[1], zc === null ? c[2] : zc], onBand: zc !== null };
  };
  const scaleFor = o => {
    let zMax = -Infinity;
    for (let i = 2; i < disp.length; i += 3) if (disp[i] - o[2] > zMax) zMax = disp[i] - o[2];
    let lo = 0, hi = zMax > 0 ? (0.9 * D) / zMax : 1;
    const half = k => { const b = projectedBounds(disp, o, k, D, ta, t); return b ? Math.max((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2) : Infinity; };
    while (half(hi) < fill && hi < 1e6) { lo = hi; hi *= 2; if (zMax > 0 && hi >= D / zMax) { hi = (0.999 * D) / zMax; break; } }
    for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (half(mid) < fill) lo = mid; else hi = mid; }
    return lo;
  };
  let aim = aimAt(0, 0);
  let k = scaleFor(aim.o);
  for (let it = 0; it < iterations; it++) {
    const b = projectedBounds(disp, aim.o, k, D, ta, t);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6) break;
    aim = aimAt(aim.o[0] + (cx * D * ta) / k, aim.o[1] + (cy * D * t) / k);
    k = scaleFor(aim.o);
  }
  const b = projectedBounds(disp, aim.o, k, D, ta, t);
  const hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2;
  return {
    k,
    distance: D,
    centre: sourceFromDisplay(aim.o, c0, 1),
    limiting: hx >= hy ? 'width' : 'height',
    fill,
    ndcBounds: { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 },
    aimOnBand: aim.onBand
  };
}

/** The fill BAND_FRAME-style `frame` uses at this aspect, and whether the compact HUD layout applies. */
export function bandFillFor(aspect, frame = BAND_FRAME) {
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_frame: aspect must be finite and > 0');
  const compact = Number.isFinite(frame.compactAspect) && aspect < frame.compactAspect;
  return { fill: compact && Number.isFinite(frame.compactFill) ? frame.compactFill : frame.fill, compact };
}

/** brainPlacement for the default view: frameBand with the aspect-dependent fill of `frame` (BAND_FRAME shape).
 * Returns frameBand's plain data plus `compact` (the HUD layout class for this aspect). */
export function placementForBand(focus, { fovYDeg = 70, aspect, frame = BAND_FRAME } = {}) {
  const { fill, compact } = bandFillFor(aspect, frame);
  const distance = Number.isFinite(frame.distance) ? frame.distance : BAND_FRAME.distance;
  return { ...frameBand(focus, { fovYDeg, aspect, fill, distance }), compact };
}

/** Orientation-label anchor rule (NDC, default view). Anterior sits above the band and posterior below it, on the
 * vertical through the crosshair. R sits just right of the band at height rightY (between the right-column HUD
 * panels); L sits just left of the band at height leftY, above the default hand (fingertips reach NDC y ~0.4 at
 * x ~ -0.35) and clear of the forearm, which enters low left. `gap` separates each label from the band box. */
export const ORIENTATION_ANCHOR_RULE = Object.freeze({
  gap: 0.035, leftY: 0.6, rightY: -0.3,
  /** R3: alternate positions the HUD may use when the arm (or a panel) covers the primary one (ns-scene-three
   * placeOrientation). Side labels keep their side of the band and change height; axis labels shift sideways. */
  alternates: Object.freeze({
    right: Object.freeze([Object.freeze({ y: 0.6 }), Object.freeze({ y: 0.15 }), Object.freeze({ y: -0.62 })]),
    left: Object.freeze([Object.freeze({ y: 0.45 }), Object.freeze({ y: 0.3 }), Object.freeze({ y: 0.85 }), Object.freeze({ y: -0.35 })]),
    anterior: Object.freeze([Object.freeze({ x: 0.3 }), Object.freeze({ x: -0.3 })]),
    posterior: Object.freeze([Object.freeze({ x: 0.3 }), Object.freeze({ x: -0.3 }), Object.freeze({ x: 0.55 })]) // R4: +0.55 clears a right-forward forearm
  })
});

/** World anchors (metres) for the R/L and anterior/posterior labels of a band placement: points on the default-view
 * screen rays through the ORIENTATION_ANCHOR_RULE positions, at the crosshair depth (`distance`), so they are fixed in
 * the world and move with the brain when the view turns. Display axes as ORIENTATION (never mirrored). Alternates are
 * returned as extra keys `right.1`, `right.2`, ... (each a world point), so a projectWorld of the whole object also
 * projects them. */
export function orientationAnchorsForBand(focus, placement, { fovYDeg = 70, aspect, rule = ORIENTATION_ANCHOR_RULE } = {}) {
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_frame: aspect must be finite and > 0');
  const { k, distance, centre } = checkPlacement(placement);
  const { pos } = focusMesh(focus);
  const t = Math.tan((fovYDeg * DEG) / 2), ta = t * aspect;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const w = sourceToWorld([pos[i], pos[i + 1], pos[i + 2]], { k, distance, centre });
    const depth = -w[2];
    if (!(depth > 0)) continue;
    const x = w[0] / (depth * ta), y = w[1] / (depth * t);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const g = rule.gap;
  const at = (x, y) => [x * distance * ta, y * distance * t, -distance];
  const primary = { right: [x1 + g, rule.rightY], left: [x0 - g, rule.leftY], anterior: [0, y1 + g], posterior: [0, y0 - g] };
  const out = {};
  for (const [key, [x, y]] of Object.entries(primary)) out[key] = at(x, y);
  const alt = rule.alternates || {};
  for (const [key, [x, y]] of Object.entries(primary)) {
    (alt[key] || []).forEach((a, i) => {
      out[`${key}.${i + 1}`] = at(Number.isFinite(a.x) ? a.x : x, Number.isFinite(a.y) ? a.y : y);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Simulated activity field and colour ramp

/** Width of each overlapping representative field in u. */
export const FIELD_SIGMA = 0.08;
export const LEGEND_LABEL = 'simulated activity (unitless)';

function driveOf(drives, id) {
  if (!drives) return 0;
  const v = drives instanceof Map ? drives.get(id) : drives[id];
  return Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0;
}

/** Simulated unitless intensity 0..1 at a strip vertex: sum over actions of
 * exp(-(u - u_a)^2 / (2 * 0.08^2)) * drive_a (each drive clamped to 0..1), clamped to 0..1.
 * Broad and overlapping by design. `apVertex` is accepted for the DESIGN signature but the
 * DESIGN formula depends on u only, so it does not change the result. */
export function fieldIntensity(uVertex, apVertex, drives) {
  if (!Number.isFinite(uVertex)) return 0;
  const inv = 1 / (2 * FIELD_SIGMA * FIELD_SIGMA);
  let s = 0;
  for (const m of MARKERS) {
    const d = driveOf(drives, m.actionId);
    if (d <= 0) continue;
    const du = uVertex - m.u;
    s += Math.exp(-du * du * inv) * d;
  }
  return s > 1 ? 1 : s;
}

/** Batch fieldIntensity over per-vertex u values into `out` (Float32Array, created if absent). */
export function fieldIntensities(uValues, drives, out) {
  if (!uValues || typeof uValues.length !== 'number') throw new Error('ns:brain_input: uValues must be array-like');
  const n = uValues.length;
  const o = out || new Float32Array(n);
  if (o.length < n) throw new Error('ns:brain_input: out is shorter than uValues');
  const active = [];
  for (const m of MARKERS) {
    const d = driveOf(drives, m.actionId);
    if (d > 0) active.push(m.u, d);
  }
  const inv = 1 / (2 * FIELD_SIGMA * FIELD_SIGMA);
  for (let i = 0; i < n; i++) {
    const uv = uValues[i];
    let s = 0;
    if (Number.isFinite(uv)) {
      for (let j = 0; j < active.length; j += 2) {
        const du = uv - active[j];
        s += Math.exp(-du * du * inv) * active[j + 1];
      }
    }
    o[i] = s > 1 ? 1 : s;
  }
  return o;
}

// ---------------------------------------------------------------------------------------------
// Two-scale simulated display field (A2-render R1)
//
// The drawn strip shows, per action a with display drive d_a (0..1):
//   broad_a(u)    = exp(-(u - u_a)^2 / (2 * FIELD_SIGMA^2))   the DESIGN overlapping field (fieldIntensity), and
//   focal_a(u, p) = [actionForU(u) === a] * smoothstep(0, focalEdgeU, borderDistU(u)) * exp(-|p - m_a|^2 / (2 r^2))
// a narrow emphasis confined to the action's OWN selectable region (the pick region, so the focal highlight never
// spills into a neighbour's region) and centred on its representative marker position m_a (source mm; r =
// focalRadiusMm; without marker positions the radial factor is 1).
//   activity(u, p) = clamp01(broadGain * sum_a d_a broad_a + focalGain * sum_a d_a focal_a)
// With equal drives the argmax over actions of broadGain*broad_a + focalGain*focal_a is still actionForU(u): the focal
// term is non-zero only for the region owner, and the broad term peaks at the nearest u. Every value is a simulated,
// unitless display drive; the focal emphasis marks the selected control region near its representative point and is
// NOT a measured focus or a unique cortical point.

/** Two-scale display field constants (broadGain + focalGain = 1, so a full drive peaks at 1 on its marker). */
export const ACTIVITY_FIELD = Object.freeze({ broadSigmaU: FIELD_SIGMA, broadGain: 0.6, focalGain: 0.4, focalRadiusMm: 2.8, focalEdgeU: 0.006 });

/** GLSL-compatible smoothstep (re-exported from ns-colors). */
export { smoothstep };

function markerPositionFor(markers, index) {
  if (!markers) return null;
  const id = MARKERS[index].actionId;
  const list = markers instanceof Map ? null : markers;
  const mk = list ? list.find(m => m && m.actionId === id) : markers.get(id);
  const p = mk && (isVecLike(mk) ? mk : mk.position);
  return p && p.length === 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]) ? p : null;
}

/** Reference (CPU) value of the drawn two-scale field at strip u and source point p (mm; may be null).
 * markers: placeMarkers() output (or Map(actionId -> position | marker)) for the focal centre; null = no radial factor.
 * Returns { broad (unclamped sum of d_a * broad_a), focal (sum of d_a * focal_a), activity (clamped 0..1),
 * regionActionId }. The ns-scene-three strip shader evaluates the same formula per fragment. */
export function activityAt(u, p, drives, markers = null, field = ACTIVITY_FIELD) {
  if (!Number.isFinite(u)) return { broad: 0, focal: 0, activity: 0, regionActionId: null };
  const inv = 1 / (2 * field.broadSigmaU * field.broadSigmaU);
  let broad = 0;
  for (const m of MARKERS) {
    const d = driveOf(drives, m.actionId);
    if (d <= 0) continue;
    const du = u - m.u;
    broad += Math.exp(-du * du * inv) * d;
  }
  const info = regionInfo(u);
  let focal = 0;
  const dr = driveOf(drives, info.actionId);
  if (dr > 0) {
    let radial = 1;
    const mp = p ? markerPositionFor(markers, info.index) : null;
    if (mp) {
      const dx = p[0] - mp[0], dy = p[1] - mp[1], dz = p[2] - mp[2];
      radial = Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * field.focalRadiusMm * field.focalRadiusMm));
    }
    focal = dr * smoothstep(0, field.focalEdgeU, info.borderDistU) * radial;
  }
  const s = field.broadGain * broad + field.focalGain * focal;
  return { broad, focal, activity: s > 1 ? 1 : s < 0 ? 0 : s, regionActionId: info.actionId };
}

// ---------------------------------------------------------------------------------------------
// Activity colour ramp. Round 2 (U2a-brain): the ramp now lives in ns-colors.mjs, the ONE ramp shared by the brain
// regions and the muscles (same colour = same simulated activity). These names are kept for existing consumers and
// delegate to ns-colors; the values are identical to the A2-render R1 ramp (dark indigo -> purple -> crimson ->
// orange -> warm near-white, strictly rising luminance 0.0130 < 0.0628 < 0.1747 < 0.4281 < 0.8795).
export { RAMP_STOPS_LINEAR, luminanceLinear };

const clamp01 = x => (x > 1 ? 1 : x > 0 ? x : 0);

/** Linear-RGB ramp value at t (clamped to 0..1; NaN -> 0) = ns-colors activityColor(t). Use for Three vertex-colour
 * attributes, which Three r152+ treats as linear working-space colours. */
export function colormapLinear(t) {
  return activityColor(t);
}

/** Display (sRGB-encoded) [r, g, b] in 0..1 for t in 0..1 = ns-colors activityColorSrgb(t). Legend: LEGEND_LABEL. */
export function colormap(t) {
  return activityColorSrgb(t);
}

/** Legend colour stops generated from the shared ramp: n >= 2 CSS 'rgb(r, g, b)' strings at evenly spaced t in [0, 1].
 * Use enough stops (default 9, two per ramp segment) that the CSS gradient's sRGB interpolation follows the
 * linear-RGB ramp the shaders draw. (ns-colors rampLegendStops returns richer records.) */
export function legendStops(n = 9) {
  if (!(Number.isInteger(n) && n >= 2)) throw new Error('ns:brain_legend: n must be an integer >= 2');
  const out = [];
  for (let i = 0; i < n; i++) {
    const [r, g, b] = colormap(i / (n - 1));
    out.push(`rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`);
  }
  return Object.freeze(out);
}

/** CSS background for the legend bar: 'linear-gradient(to right, <legendStops(n)>)'. */
export function legendGradientCss(n = 9) {
  return `linear-gradient(to right, ${legendStops(n).join(', ')})`;
}

// ---------------------------------------------------------------------------------------------
// Strip shading reference (A2-render R1): faint region-identity tints with soft borders at the pick boundaries, a
// hover outline for the region under the crosshair, and the activity glow from the ramp. ns-scene-three's strip shader
// is generated from these constants; stripShade is the CPU reference (and the no-shader fallback colour).

/** Faint categorical identity tints per action (sRGB hex), grouped by body part: elbow teal, wrist steel blue, hand
 * green, index khaki, thumb lavender; neighbours within a group alternate lightness. Identity only: activity is the
 * separate glow channel, and region borders are control boundaries, not cortical borders. */
export const REGION_TINTS = Object.freeze({
  elbow_flexion: 0x4f9e97, elbow_extension: 0x3b7772,
  wrist_flexion: 0x5f84c6, wrist_extension: 0x45639e,
  grasp_close: 0x72a85c, relax_release: 0x557f44, open_hand: 0x86b56a, spread_fingers: 0x5f8c4b,
  index_flexion: 0xb4a75c, index_extension: 0x8c8247,
  thumb_mcp_flexion: 0xa08abd, thumb_mcp_extension: 0x7c6b9a
});

/** Strip surface constants (linear RGB / unitless display factors). */
export const STRIP_SHADE = Object.freeze({
  neutral: Object.freeze([0.30, 0.33, 0.37]), // slate albedo the tints are mixed into
  tintStrength: 0.55,     // 0 = neutral slate, 1 = full tint
  restAlbedo: 1.0,        // albedo scale at rest (lit by the scene's ambient + headlight)
  ambientScale: 0.6,      // the strip's ambient (indirect diffuse) term x this: stronger relief from the headlight
  activeDarken: 0.85,     // albedo x (1 - activeDarken * smoothstep(0, activeDarkenEnd, activity)): the emissive
  activeDarkenEnd: 0.6,   //   glow, not the lit tint, carries the activity colour (so it reads like the legend)
  softBorderU: 0.006,     // tint blend half-width at a pick boundary (u)
  borderDarken: 0.35,     // faint region border line (darkens the albedo)
  borderPx: 1.0,          // border line half-width (screen px, shader only)
  hoverBoost: 0.55,       // hovered region albedo x (1 + hoverBoost)
  hoverGlow: 0.18,        // hovered region tint added as emission
  hoverLinePx: 2.2,       // hover outline half-width (screen px, shader only)
  hoverLine: Object.freeze([0.95, 0.97, 1.0]), // hover outline emission (linear)
  glowRest: 0.0,          // glow factor at activity 0 (no emission at rest)
  glowRiseTo: 0.2,        // glow factor reaches 1 by this activity
  shimmer: 0.16           // max relative shimmer of the glow (decorative, simulated)
});

const tintCache = new Map();
/** Linear-RGB tint of an action's control region. */
export function regionTintLinear(actionId) {
  if (tintCache.has(actionId)) return tintCache.get(actionId);
  const hex = REGION_TINTS[actionId];
  if (!Number.isInteger(hex)) throw new Error(`ns:brain_region: no tint for ${actionId}`);
  const dec = v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const c = Object.freeze([dec((hex >> 16) & 255), dec((hex >> 8) & 255), dec(hex & 255)]);
  tintCache.set(actionId, c);
  return c;
}

/** CPU reference of the strip surface at (u, p): { regionActionId, albedo (linear RGB, before lighting), glow (linear
 * RGB emission), activity, hovered }. hoverActionId: the region under the crosshair (or null). Region borders here use
 * the u-space soft blend only; the screen-space border/hover lines are drawn by the shader. */
export function stripShade(u, p, drives, markers = null, { hoverActionId = null, field = ACTIVITY_FIELD, shade = STRIP_SHADE } = {}) {
  const info = regionInfo(u);
  if (!info) return { regionActionId: null, albedo: [0, 0, 0], glow: [0, 0, 0], activity: 0, hovered: false };
  const a = activityAt(u, p, drives, markers, field).activity;
  const t1 = regionTintLinear(info.actionId), t2 = regionTintLinear(MARKERS[info.neighbour].actionId);
  const s = smoothstep(0, shade.softBorderU, info.borderDistU);
  const hovered = hoverActionId !== null && hoverActionId === info.actionId;
  const k = shade.restAlbedo * (1 - shade.activeDarken * smoothstep(0, shade.activeDarkenEnd, a)) * (hovered ? 1 + shade.hoverBoost : 1);
  const albedo = [0, 1, 2].map(i => {
    const tint = 0.5 * (t1[i] + t2[i]) + (t1[i] - 0.5 * (t1[i] + t2[i])) * s;
    return (shade.neutral[i] + (tint - shade.neutral[i]) * shade.tintStrength) * k;
  });
  const g = shade.glowRest + (1 - shade.glowRest) * smoothstep(0, shade.glowRiseTo, a);
  const ramp = colormapLinear(a);
  const glow = [0, 1, 2].map(i => ramp[i] * g + (hovered ? t1[i] * shade.hoverGlow : 0));
  return { regionActionId: info.actionId, albedo, glow, activity: a, hovered };
}

// ---------------------------------------------------------------------------------------------
// Gaze

/** Camera-centre gaze direction in world/display axes. yaw (rad) positive looks left (about +y),
 * pitch (rad) positive looks up: (-sin(yaw) cos(pitch), sin(pitch), -cos(yaw) cos(pitch)). */
export function gazeDirection(yaw, pitch) {
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new Error('ns:brain_input: yaw and pitch must be finite');
  const cp = Math.cos(pitch);
  return [0 - Math.sin(yaw) * cp, Math.sin(pitch), 0 - Math.cos(yaw) * cp];
}

/** Camera-centre ray (camera at the world origin) in SOURCE mm: { origin, dir (unit) }.
 * brainPlacement = { k, distance, centre }; the brain group is unrotated in the world. */
export function gazeRayInSource(yaw, pitch, brainPlacement) {
  if (brainPlacement && brainPlacement.kind === 'ns-brain-view') return gazeRayForView(yaw, pitch, brainPlacement); // round 2
  const { k, distance, centre } = checkPlacement(brainPlacement);
  const w = gazeDirection(yaw, pitch);
  const origin = sourceFromDisplay([0, 0, distance], centre, k);
  // Inverse rotation of a direction: (wx, wy, wz) -> (-wx, -wy, wz); the scale does not change direction.
  const dir = normalize([0 - w[0], 0 - w[1], w[2]]);
  return { origin, dir };
}

const isVecLike = v => Array.isArray(v) || ArrayBuffer.isView(v);

// A2-render R1 gaze caches. classifyGaze runs every frame while the view moves; the focus AABB, the in-band triangle
// list (with per-triangle edge vectors) and the drawn marker solids are cached per input array object. Focus arrays
// and placeMarkers() output are treated as immutable once classified (the app never mutates them); call
// clearGazeCache(focus) after mutating one in place. Results are bit-identical to the uncached R5 arithmetic.
const boundsCache = new WeakMap();   // positions -> { lo, hi } (padded as rayHitsBounds)
const triCache = new WeakMap();      // positions -> WeakMap(indices -> { u, count, tri: Float64Array(9 * count) })
const dotsCache = new WeakMap();     // frozen placeMarkers() output -> drawn dots
const solidCache = new WeakMap();    // frozen marker -> [base solid, active solid]

/** Drop the cached gaze data of a focus mesh (only needed after mutating its arrays in place). */
export function clearGazeCache(focus) {
  if (focus && focus.positions && typeof focus.positions === 'object') { boundsCache.delete(focus.positions); triCache.delete(focus.positions); }
}

function cachedBounds(pos) {
  let b = boundsCache.get(pos);
  if (b) return b;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const lo = [x0, y0, z0], hi = [x1, y1, z1], mn = [0, 0, 0], mx = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const pad = 1e-6 * (Math.abs(lo[a]) + Math.abs(hi[a]) + 1);
    mn[a] = lo[a] - pad; mx[a] = hi[a] + pad;
  }
  b = { mn, mx };
  if (typeof pos === 'object') boundsCache.set(pos, b);
  return b;
}

/** rayHitsBounds against the cached padded AABB (same slab arithmetic). */
function rayHitsCachedBounds(o, d, pos) {
  const { mn, mx } = cachedBounds(pos);
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (d[a] === 0) {
      if (o[a] < mn[a] || o[a] > mx[a]) return false;
      continue;
    }
    let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

/** Validated in-band triangle table: per kept triangle [ax, ay, az, e1x, e1y, e1z, e2x, e2y, e2z] and its index. */
function cachedTriangles(pos, idx, uv) {
  let byIdx = triCache.get(pos);
  let e = byIdx && byIdx.get(idx);
  if (e && e.u === uv) return e;
  const n = pos.length / 3, m = idx.length / 3;
  const inArm = x => x >= ARM_BAND.uMin && x <= ARM_BAND.uMax;
  const tri = new Float64Array(9 * m), ids = new Int32Array(m);
  let k = 0;
  for (let t = 0; t < m; t++) {
    const ia = idx[3 * t], ib = idx[3 * t + 1], ic = idx[3 * t + 2];
    if (!(isIndex(ia, n) && isIndex(ib, n) && isIndex(ic, n))) throw new Error(`ns:brain_mesh: focus triangle ${t} has an out-of-range index`);
    if (uv && !(inArm(uv[ia]) && inArm(uv[ib]) && inArm(uv[ic]))) continue;
    const ax = pos[3 * ia], ay = pos[3 * ia + 1], az = pos[3 * ia + 2];
    tri[9 * k] = ax; tri[9 * k + 1] = ay; tri[9 * k + 2] = az;
    tri[9 * k + 3] = pos[3 * ib] - ax; tri[9 * k + 4] = pos[3 * ib + 1] - ay; tri[9 * k + 5] = pos[3 * ib + 2] - az;
    tri[9 * k + 6] = pos[3 * ic] - ax; tri[9 * k + 7] = pos[3 * ic + 1] - ay; tri[9 * k + 8] = pos[3 * ic + 2] - az;
    ids[k] = t;
    k++;
  }
  e = { u: uv, count: k, tri, ids };
  if (typeof pos === 'object' && typeof idx === 'object') {
    if (!byIdx) { byIdx = new WeakMap(); triCache.set(pos, byIdx); }
    byIdx.set(idx, e);
  }
  return e;
}

function cachedSolid(mk, active) {
  if (!Object.isFrozen(mk)) return markerSolid(mk, active);
  let s = solidCache.get(mk);
  if (!s) { s = [markerSolid(mk, false), markerSolid(mk, true)]; solidCache.set(mk, s); }
  return s[active ? 1 : 0];
}

/** Drawn dots of an actionsAt value: placeMarkers() output or Map(actionId -> position | marker); [] for a function. */
function dotsOf(actionsAt) {
  if (!actionsAt || typeof actionsAt === 'function') return [];
  if (Array.isArray(actionsAt) && Object.isFrozen(actionsAt) && dotsCache.has(actionsAt)) return dotsCache.get(actionsAt);
  const out = dotsOfUncached(actionsAt);
  if (Array.isArray(actionsAt) && Object.isFrozen(actionsAt) && actionsAt.every(m => !m || Object.isFrozen(m))) dotsCache.set(actionsAt, out);
  return out;
}

function dotsOfUncached(actionsAt) {
  const entries = actionsAt instanceof Map
    ? Array.from(actionsAt, ([id, v]) => (isVecLike(v) ? { actionId: id, position: v } : { ...v, actionId: id }))
    : actionsAt;
  if (typeof entries[Symbol.iterator] !== 'function') return [];
  const out = [];
  for (const mk of entries) {
    if (!mk || typeof mk.actionId !== 'string' || !mk.position || mk.position.length !== 3) continue;
    const band = mk.band && Number.isFinite(mk.band.uMin) && Number.isFinite(mk.band.uMax) ? mk.band : ARM_BAND; // R558: placeMarkers' own band
    if (Number.isFinite(mk.u) && (mk.u < band.uMin || mk.u > band.uMax)) continue;
    const p = mk.position;
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) continue;
    out.push(mk);
  }
  return out;
}

const EMPTY = () => ({ kind: 'empty', actionId: null, point: null, u: null });

/** Classify a gaze ray given in SOURCE mm (repair R3 pick order; Root marker-aim review F1/F2; repair R5 drawn solid):
 *  1. DOTS: the ray against every DRAWN marker octahedron (markerSolid + MARKER_OCTAHEDRON, front faces, exactly the
 *     triangles ns-scene-three draws; repair R5 replaced R3/R4's inscribed sphere, which missed the drawn tips and
 *     edges). The marker of `activeActionId` is tested at its drawn enlarged size (activeScale), all others at base
 *     size. The NEAREST surface entry along the ray, over all markers, wins its own action (exact ties: the earlier
 *     marker): wherever a drawn marker is hit it is selected, never a neighbour or nothing; where an enlarged active
 *     marker overlaps or occludes a neighbour it wins only where its surface is the nearer one.
 *     Phase: ns-app passes activeActionId = the previous frame's selection, which is the marker the scene drew
 *     enlarged in the frame the user is looking at (highlightMarker before render), so the pick tests the geometry as
 *     displayed. Fixed point: if this returns action X and is called again on the same ray with activeActionId = X,
 *     it returns X (X's enlarged solid contains its base solid, so its entry is no farther; the previous active marker
 *     only shrinks; no other solid changes; a strip selection X stays X whether or not X's enlarged solid is hit).
 *     -> { kind: 'strip', via: 'dot', actionId, point (the surface entry), u (the marker's vertex u) }
 *  2. STRIP: otherwise the nearest focus-triangle hit (t >= 0; with focus.u, triangles not fully inside ARM_BAND are
 *     ignored and u is interpolated); its action is actionForU(u), the nearest representative u, which is also the
 *     argmax of the overlapping simulated fields at that u. -> { kind: 'strip', via: 'strip', actionId, point, u }.
 *     A function actionsAt(point, u) -> actionId | null overrides this step (custom pickers).
 *  3. Otherwise { kind: 'empty', actionId: null, point: null, u: null }: empty space and non-strip brain (glass) never
 *     select anything. The glass never occludes the strip or a dot; the camera-attached arm is not part of the test.
 * actionsAt: placeMarkers() output, a Map(actionId -> position | marker), or a function. The R1/R2 rule (nearest
 * UNLIFTED marker in 3-D from the strip hit) is gone: it ignored the drawn dots. */
export function classifyGaze(rayOriginSrc, rayDirSrc, focus, actionsAt, opts = {}) {
  // Round 2: a segmentMotorStrips result as the third argument selects the both-hemisphere REGION picker
  // (classifyRegionGaze; result kind 'region' | 'glass' | 'empty'). Its options are the fourth argument, or the fifth
  // when the fourth is placeMarkers output (the left-arm dots). The legacy single-band picker below is unchanged.
  if (isSegmentation(focus)) {
    const isOpts = actionsAt && !Array.isArray(actionsAt) && !(actionsAt instanceof Map) && typeof actionsAt === 'object';
    const o2 = isOpts ? actionsAt : { ...(opts || {}), markers: actionsAt || (opts && opts.markers) || null };
    return classifyRegionGaze(rayOriginSrc, rayDirSrc, focus, o2);
  }
  const { activeActionId = null } = opts || {};
  const o = vec3(rayOriginSrc, 'rayOrigin'), d0 = vec3(rayDirSrc, 'rayDir');
  if (!(length(d0) > 1e-12)) throw new Error('ns:brain_ray: zero-length gaze direction');
  if (!focus || !focus.positions || !focus.indices || focus.positions.length % 3 !== 0 || focus.indices.length % 3 !== 0) {
    throw new Error('ns:brain_mesh: focus must be { positions, indices[, u] }');
  }
  const d = normalize(d0);
  // 1. drawn marker solids (nearest surface entry)
  let dotT = Infinity, dotHit = null;
  for (const mk of dotsOf(actionsAt)) {
    const t = rayMarkerSolid(o, d, cachedSolid(mk, mk.actionId === activeActionId));
    if (t !== null && t < dotT) { dotT = t; dotHit = mk; }
  }
  if (dotHit) {
    const uDot = Number.isFinite(dotHit.uVertex) ? dotHit.uVertex : Number.isFinite(dotHit.u) ? dotHit.u : null;
    return { kind: 'strip', actionId: dotHit.actionId, point: add(o, scale(d, dotT)), u: uDot, via: 'dot' };
  }
  // 2. strip (A2-render R1: cached AABB and in-band triangle table; scalar rayTriangle arithmetic, identical results)
  const pos = focus.positions, idx = focus.indices;
  const n = pos.length / 3, m = idx.length / 3;
  if (n === 0 || m === 0) return EMPTY();
  const uv = focus.u && focus.u.length === n ? focus.u : null;
  if (!rayHitsCachedBounds(o, d, pos)) return EMPTY();
  const table = cachedTriangles(pos, idx, uv);
  const T = table.tri, o0 = o[0], o1 = o[1], o2 = o[2], q0 = d[0], q1 = d[1], q2 = d[2];
  let bestT = Infinity, bestTri = -1;
  for (let k = 0; k < table.count; k++) {
    const j = 9 * k;
    const ax = T[j], ay = T[j + 1], az = T[j + 2], e1x = T[j + 3], e1y = T[j + 4], e1z = T[j + 5], e2x = T[j + 6], e2y = T[j + 7], e2z = T[j + 8];
    // ns-math rayTriangle, operation for operation: h = dir x e2, det = e1 . h, s = o - a, q = s x e1.
    const hx = q1 * e2z - q2 * e2y, hy = q2 * e2x - q0 * e2z, hz = q0 * e2y - q1 * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const sx = o0 - ax, sy = o1 - ay, sz = o2 - az;
    const bu = f * (sx * hx + sy * hy + sz * hz);
    if (bu < 0 || bu > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const bv = f * (q0 * qx + q1 * qy + q2 * qz);
    if (bv < 0 || bu + bv > 1) continue;
    const hit = f * (e2x * qx + e2y * qy + e2z * qz);
    if (hit >= 0 && hit < bestT) { bestT = hit; bestTri = table.ids[k]; }
  }
  if (bestTri < 0) return EMPTY();
  const point = add(o, scale(d, bestT));
  let u = null;
  if (uv) {
    const ia = idx[3 * bestTri], ib = idx[3 * bestTri + 1], ic = idx[3 * bestTri + 2];
    const a = vtx(pos, ia), b = vtx(pos, ib), c = vtx(pos, ic);
    const v0 = sub(b, a), v1 = sub(c, a), v2 = sub(point, a);
    const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
    const den = d00 * d11 - d01 * d01;
    const ua = uv[ia], ub = uv[ib], uc = uv[ic];
    if (den > 0) {
      const wb = (d11 * d20 - d01 * d21) / den, wc = (d00 * d21 - d01 * d20) / den;
      u = (1 - wb - wc) * ua + wb * ub + wc * uc;
    } else {
      u = (ua + ub + uc) / 3;
    }
    const uLo = Math.min(ua, ub, uc), uHi = Math.max(ua, ub, uc);
    u = u < uLo ? uLo : u > uHi ? uHi : u;
  }
  let actionId = null;
  if (typeof actionsAt === 'function') {
    const r = actionsAt(point, u);
    actionId = typeof r === 'string' && r ? r : null;
  } else if (actionsAt) {
    actionId = actionForU(u);
  }
  return { kind: 'strip', actionId, point, u, via: 'strip' };
}

// =============================================================================================
// ROUND 2 (U2a-brain): BOTH-hemisphere motor-strip REGION segmentation from BODY_MOTOR_MAP, region gaze with
// hysteresis, the brain view math (default tilt, Google-Earth-style orbit, grab carry, framing) and diagnostics.
//
// Frames are unchanged: source = BodyParts3D mm (+x subject LEFT, +y POSTERIOR, +z SUPERIOR); display/world = Three
// axes (+x screen right, +y up, +z toward the camera; camera at the world origin looking along -z at yaw = pitch = 0).
//
// Scientific limits: the regions are CONTROL regions of this display, assigned by a documented geometric rule from the
// body map's representative extents along each hemisphere's precentral strip. They are not cortical borders, not
// registered functional coordinates and not a unique cortical point per muscle; real representations overlap and vary
// between people, and contemporary maps (Gordon et al. 2023, inter-effector regions) refine Penfield's homunculus. The
// visible precentral crown may be premotor (BA6); M1 (BA4) lies largely in the sulcal bank (CROWN_NOTE). Every activity
// value is simulated and unitless; gaze and clicks are virtual inputs, not stimulation or decoding.

const freezeR2 = Object.freeze;

/** Primary precentral strip meshes (= ns-assets BRAIN.rightPrecentral / BRAIN.leftPrecentral). R558 (strip audit
 * round 2): in region mode both take the along-gyrus coordinate v (alongGyrusCoordinate); the left-arm actions are
 * picked at the body map's own positions in v (action uCentre) and the dots are placed there (placeRegionMarkers). The
 * legacy single-band path keeps the |x| fraction u of FJ1801 (stripParam, MARKERS, ARM_BAND, actionForU). */
export const STRIP_MESH_IDS = freezeR2({ right: 'FJ1801', left: 'FJ1800' });

/** Strip mesh kinds: 'precentral' (a primary convexity strip; the first one per hemisphere takes the along-gyrus
 * coordinate and defines that hemisphere's |x| range), 'strip' (any further convexity piece, parameterised with the
 * primary's |x| range), 'paracentral' (a medial-wall mesh, e.g. a paracentral lobule added by the acquisition agent; only
 * its motor part is used, see MEDIAL_WALL). */
export const STRIP_KINDS = freezeR2(['precentral', 'strip', 'paracentral']);

/** Medial-wall rule. A strip triangle is MEDIAL WALL when its centroid lies within bandMm of the hemisphere's most
 * medial |x| and its outward normal points toward the midline with cosine > minFacing (FJ1801/FJ1800 measured: the
 * medial pial surface sits at |x| - min < 4 mm, z 1589..1624, i.e. the precentral part of the paracentral lobule).
 * Medial-wall triangles are assigned to the map's medialSurface regions by medial depth (deeper = more medial in the
 * strip order). Paracentral meshes keep only triangles whose centroid y lies within the primary strip's medial y range
 * +- motorMarginMm (the precentral, motor part); the rest (posteriorly the postcentral, sensory part) stays glass.
 * minMedialTriangles: fewer medial triangles than this in a hemisphere disables the medial rule there. */
export const MEDIAL_WALL = freezeR2({ bandMm: 4.5, minFacing: 0.5, motorMarginMm: 4, minMedialTriangles: 8 });

/** Segmentation and gaze defaults, in the strip coordinate (the along-gyrus v on the convexity, medial depth s on the
 * medial wall). gapTolU: a strip point outside every applicable extent joins the nearest region if it is within this
 * distance, else it stays unassigned (drawn as glass, never activates). hysteresisU: an active region keeps the gaze
 * until the gaze point is more than this far inside a neighbour. hysteresisActionU: the same for the action inside a
 * left-arm region (action uCentre). R558 (strip audit round 2): both hysteresis widths were 0.01 / 0.004 in the old |x|
 * fraction (about 0.6 / 0.25 mm of |x|); one unit of v is about 2.7 times longer on the gyrus (about 0.006 v per mm along
 * it on FJ1801 / FJ1800), so they are 0.004 / 0.0015 now, the same distances on the brain as before. */
export const SEGMENT_DEFAULTS = freezeR2({ gapTolU: 0.03, hysteresisU: 0.004, hysteresisActionU: 0.0015 });

/** Every left-arm action id the body map may reference via armActionId (the 12 MARKERS actions plus forearm rotation,
 * plus the R558 game-defined left-hand actions of ns-actions EXTRA_ARM_ACTION_IDS). */
export const LEFT_ARM_ACTION_IDS = freezeR2([...MARKERS.map(m => m.actionId), 'pronation', 'supination',
  'fingers_together', 'middle_flexion', 'middle_extension', 'ring_flexion', 'ring_extension', 'little_flexion',
  'little_extension', 'thumb_opposition', 'thumb_reposition', 'wrist_radial_deviation', 'wrist_ulnar_deviation']);
const MARKER_U = new Map(MARKERS.map(m => [m.actionId, m.u]));

const HEMIS = freezeR2(['right', 'left']);
const isStr = s => typeof s === 'string' && s.trim().length > 0;

/** Validate a BODY_MOTOR_MAP (ns-bodymap interface) and normalise its regions. Returns { ok, errors, warnings, version,
 * caveats, citations, regions } where regions are frozen normalised copies in map order with `index` and `centre`
 * (extent midpoint). Never throws; segmentMotorStrips throws on errors. */
export function validateBodyMotorMap(map) {
  const errors = [], warnings = [];
  if (!map || typeof map !== 'object' || !Array.isArray(map.regions)) {
    return { ok: false, errors: ['map must be an object with a regions array'], warnings, version: null, caveats: [], citations: [], regions: freezeR2([]) };
  }
  if (map.regions.length === 0) errors.push('regions is empty');
  const seen = new Set(), out = [];
  map.regions.forEach((r, index) => {
    const at = `regions[${index}]`;
    if (!r || typeof r !== 'object') { errors.push(`${at} is not an object`); return; }
    const id = r.id;
    if (!isStr(id)) { errors.push(`${at}.id must be a non-empty string`); return; }
    if (seen.has(id)) errors.push(`${at}.id ${id} is duplicated`);
    seen.add(id);
    if (!['right', 'left', 'both'].includes(r.hemisphere)) errors.push(`${id}: hemisphere must be 'right' | 'left' | 'both'`);
    if (r.bodySide !== undefined && !['left', 'right', 'midline'].includes(r.bodySide)) warnings.push(`${id}: bodySide ${r.bodySide} is not 'left' | 'right' | 'midline'`);
    const ext = r.extent;
    let u0 = NaN, u1 = NaN;
    if (!Array.isArray(ext) || ext.length !== 2 || !Number.isFinite(ext[0]) || !Number.isFinite(ext[1])) errors.push(`${id}: extent must be [u0, u1]`);
    else {
      u0 = ext[0]; u1 = ext[1];
      if (!(u0 < u1)) errors.push(`${id}: extent u0 must be < u1`);
      if (u0 < -1e-9 || u1 > 1 + 1e-9) warnings.push(`${id}: extent [${u0}, ${u1}] leaves [0, 1]; it is clipped`);
      u0 = Math.max(0, u0); u1 = Math.min(1, u1);
    }
    if (!Number.isFinite(r.order)) errors.push(`${id}: order must be a finite number`);
    const isLeftArm = r.isLeftArm === true;
    if (isLeftArm && r.hemisphere !== 'right') warnings.push(`${id}: a left-arm region on hemisphere '${r.hemisphere}'; the left upper limb is driven predominantly by the contralateral RIGHT hemisphere`);
    const actions = [];
    if (!Array.isArray(r.actions)) errors.push(`${id}: actions must be an array`);
    else {
      if (r.actions.length === 0) warnings.push(`${id}: no actions (gaze selects the region only)`);
      r.actions.forEach((a, j) => {
        if (!a || !isStr(a.id)) { errors.push(`${id}: actions[${j}].id must be a non-empty string`); return; }
        const arm = a.armActionId === undefined ? null : a.armActionId;
        if (isLeftArm && arm !== null && !LEFT_ARM_ACTION_IDS.includes(arm)) warnings.push(`${id}: action ${a.id} armActionId ${arm} is not an existing left-arm action id`);
        if (!isLeftArm && arm !== null) warnings.push(`${id}: action ${a.id} has armActionId ${arm} but the region is not a left-arm region`);
        actions.push(freezeR2({
          id: a.id,
          label: isStr(a.label) ? a.label : a.id,
          armActionId: arm,
          // R558 (strip audit round 2): the map's own representative position of the action (strip coordinate), or null.
          uCentre: Number.isFinite(a.uCentre) ? a.uCentre : null,
          joints: a.joints && typeof a.joints === 'object' ? a.joints : {},
          agonists: Array.isArray(a.agonists) ? a.agonists : [],
          antagonists: Array.isArray(a.antagonists) ? a.antagonists : [],
          // R558: the map's representative control position (regionActionAt picks left-arm actions by it).
          uCentre: Number.isFinite(a.uCentre) ? a.uCentre : null
        }));
      });
    }
    out.push(freezeR2({
      id,
      label: isStr(r.label) ? r.label : id,
      hemisphere: r.hemisphere,
      bodySide: r.bodySide === undefined ? null : r.bodySide,
      effector: isStr(r.effector) ? r.effector : null,
      order: r.order,
      extent: freezeR2([u0, u1]),
      // R558: the map's own non-overlapping control cell (used to split the region between its actions); null if absent.
      core: Array.isArray(r.core) && r.core.length === 2 && Number.isFinite(r.core[0]) && Number.isFinite(r.core[1]) && r.core[0] < r.core[1]
        ? freezeR2([Math.max(0, r.core[0]), Math.min(1, r.core[1])]) : null,
      centre: (u0 + u1) / 2,
      medialSurface: r.medialSurface === true,
      isLeftArm,
      actions: freezeR2(actions),
      explanation: typeof r.explanation === 'string' ? r.explanation : '',
      citationKeys: Array.isArray(r.citationKeys) ? freezeR2(r.citationKeys.slice()) : freezeR2([]),
      index: out.length
    }));
  });
  for (const h of HEMIS) {
    const list = out.filter(r => r.hemisphere === h || r.hemisphere === 'both');
    if (list.length === 0) warnings.push(`no region applies to the ${h} hemisphere`);
  }
  return {
    ok: errors.length === 0, errors, warnings,
    version: map.version === undefined ? null : map.version,
    caveats: Array.isArray(map.caveats) ? map.caveats : [],
    citations: Array.isArray(map.citations) ? map.citations : [],
    regions: freezeR2(out)
  };
}

function meanX(pos) {
  let s = 0;
  for (let i = 0; i < pos.length; i += 3) s += pos[i];
  return s / (pos.length / 3);
}

/** Strip descriptor for one brain mesh { id, name, positions, indices[, hemisphere, kind] }, or null when it is not a
 * motor-strip mesh. Explicit hemisphere/kind fields win; else FJ1801/FJ1800 are the primary precentral strips, a name
 * containing 'paracentral' is a medial-wall mesh and any other name containing 'precentral' is an extra convexity
 * strip; the hemisphere then comes from 'Right'/'Left' in the name or the sign of the mean x (x < 0 = subject right). */
export function stripDescriptorFor(mesh) {
  if (!mesh || !mesh.positions || !mesh.indices) return null;
  const id = typeof mesh.id === 'string' ? mesh.id : null;
  const name = typeof mesh.name === 'string' ? mesh.name : '';
  let kind = STRIP_KINDS.includes(mesh.kind) ? mesh.kind : null;
  let hemisphere = HEMIS.includes(mesh.hemisphere) ? mesh.hemisphere : null;
  if (!kind) {
    if (id === STRIP_MESH_IDS.right || id === STRIP_MESH_IDS.left) kind = 'precentral';
    else if (/paracentral/i.test(name)) kind = 'paracentral';
    else if (/precentral/i.test(name)) kind = 'strip';
    else return null;
  }
  if (!hemisphere) {
    if (id === STRIP_MESH_IDS.right) hemisphere = 'right';
    else if (id === STRIP_MESH_IDS.left) hemisphere = 'left';
    else if (/\bright\b/i.test(name)) hemisphere = 'right';
    else if (/\bleft\b/i.test(name)) hemisphere = 'left';
    else hemisphere = meanX(checkPositions(mesh.positions, `${id || name || 'mesh'}.positions`)) < 0 ? 'right' : 'left';
  }
  return { id: id || name || null, name, hemisphere, kind, positions: mesh.positions, indices: mesh.indices };
}

/** All motor-strip descriptors among `meshes` (stripDescriptorFor each; non-strip meshes are skipped). A non-primary
 * 'precentral' (second precentral mesh in a hemisphere) is demoted to 'strip'; if a hemisphere has no 'precentral',
 * its first 'strip' is promoted. */
export function motorStripDescriptors(meshes) {
  if (!meshes || typeof meshes[Symbol.iterator] !== 'function') throw new Error('ns:brain_strip: meshes must be iterable');
  const out = [];
  for (const m of meshes) { const d = stripDescriptorFor(m); if (d) out.push(d); }
  for (const h of HEMIS) {
    const list = out.filter(d => d.hemisphere === h);
    const prim = list.filter(d => d.kind === 'precentral');
    prim.slice(1).forEach(d => { d.kind = 'strip'; });
    if (prim.length === 0) { const s = list.find(d => d.kind === 'strip'); if (s) s.kind = 'precentral'; }
  }
  return out;
}

function lateralityRange(pos, hemisphere, what, tolMm) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    if (hemisphere === 'right' ? x > tolMm : x < -tolMm) {
      throw new Error(`ns:brain_laterality: ${what} vertex ${i / 3} has x = ${x}; a ${hemisphere}-hemisphere strip needs ${hemisphere === 'right' ? 'x <= 0 (subject right)' : 'x >= 0 (subject left)'}`);
    }
    const a = Math.abs(x);
    if (a < lo) lo = a;
    if (a > hi) hi = a;
  }
  return { lo, hi };
}

/** Owner of strip coordinate s among `list` (normalised regions): the region whose extent contains s with the nearest
 * extent centre (ties: lower order, then lower index); with no containing extent, the region with the nearest extent
 * edge if within gapTolU; else null. Exported for tests and for renderers that shade per fragment. */
export function regionOwnerAt(list, s, gapTolU = SEGMENT_DEFAULTS.gapTolU) {
  if (!Number.isFinite(s) || !list || list.length === 0) return null;
  let best = null, bd = Infinity;
  for (const r of list) {
    if (s < r.extent[0] - 1e-12 || s > r.extent[1] + 1e-12) continue;
    const d = Math.abs(s - r.centre);
    if (d < bd - 1e-15 || (Math.abs(d - bd) <= 1e-15 && best && (r.order < best.order || (r.order === best.order && r.index < best.index)))) { bd = d; best = r; }
  }
  if (best) return best;
  let near = null, nd = Infinity;
  for (const r of list) {
    const d = s < r.extent[0] ? r.extent[0] - s : s - r.extent[1];
    if (d < nd - 1e-15 || (Math.abs(d - nd) <= 1e-15 && near && r.order < near.order)) { nd = d; near = r; }
  }
  return nd <= gapTolU ? near : null;
}

function triArea2(pos, a, b, c, out) {
  const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2];
  const e1x = pos[3 * b] - ax, e1y = pos[3 * b + 1] - ay, e1z = pos[3 * b + 2] - az;
  const e2x = pos[3 * c] - ax, e2y = pos[3 * c + 1] - ay, e2z = pos[3 * c + 2] - az;
  out[0] = e1y * e2z - e1z * e2y; out[1] = e1z * e2x - e1x * e2z; out[2] = e1x * e2y - e1y * e2x;
  return out;
}

/** Signed orientation of a closed mesh: +1 when the triangle normals point outward on average (sum over triangles of
 * (centroid - mean vertex) . areaNormal > 0), -1 otherwise. */
function meshOrientation(pos, idx) {
  const n = pos.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += pos[3 * i]; cy += pos[3 * i + 1]; cz += pos[3 * i + 2]; }
  cx /= n; cy /= n; cz /= n;
  const N = [0, 0, 0];
  let s = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    triArea2(pos, a, b, c, N);
    const gx = (pos[3 * a] + pos[3 * b] + pos[3 * c]) / 3 - cx, gy = (pos[3 * a + 1] + pos[3 * b + 1] + pos[3 * c + 1]) / 3 - cy, gz = (pos[3 * a + 2] + pos[3 * b + 2] + pos[3 * c + 2]) / 3 - cz;
    s += gx * N[0] + gy * N[1] + gz * N[2];
  }
  return s < 0 ? -1 : 1;
}

function compactPart(pos, idx, vU, vS, tris) {
  const remap = new Map();
  const ids = [];
  for (const t of tris) for (let j = 0; j < 3; j++) { const v = idx[3 * t + j]; if (!remap.has(v)) { remap.set(v, ids.length); ids.push(v); } }
  const positions = new Float32Array(ids.length * 3), u = new Float32Array(ids.length), s = new Float32Array(ids.length), sourceIndex = new Uint32Array(ids.length);
  ids.forEach((v, r) => {
    positions[3 * r] = pos[3 * v]; positions[3 * r + 1] = pos[3 * v + 1]; positions[3 * r + 2] = pos[3 * v + 2];
    u[r] = vU[v]; s[r] = vS ? vS(v) : vU[v]; sourceIndex[r] = v;
  });
  const indices = new Uint32Array(tris.length * 3), triangles = new Uint32Array(tris.length);
  tris.forEach((t, j) => { indices[3 * j] = remap.get(idx[3 * t]); indices[3 * j + 1] = remap.get(idx[3 * t + 1]); indices[3 * j + 2] = remap.get(idx[3 * t + 2]); triangles[j] = t; });
  return { positions, indices, u, s, sourceIndex, triangles, vertexCount: ids.length, faceCount: tris.length };
}

/** R558 (strip audit round 2): the along-the-gyrus strip coordinate v of each hemisphere's primary precentral mesh.
 * v is the harmonic field on the mesh surface (cotangent Laplacian, weights clamped at minCotWeight so the operator is
 * an M-matrix and v has no false extrema) with v = 0 on the medial wall (the vertices of the MEDIAL_WALL triangles, i.e.
 * the edge where the strip leaves the midline) and v = 1 at the ventral tip (vertices within tipMm of the mesh's lowest
 * source z, next to the Sylvian fissure). Its level lines cross the gyrus, so v runs down the whole gyrus in order,
 * including its lowest part next to the Sylvian fissure, where the old |x| fraction folded back. Measured on FJ1801 /
 * FJ1800 (welded: 2023 vertices each, one closed surface): Jacobi-preconditioned conjugate gradients converge to a
 * relative residual 1e-8 in about 200 iterations, 30-60 ms per hemisphere on one core, at load, every load (no data
 * file). A display coordinate on one atlas brain, not a registration. */
export const ALONG_GYRUS = freezeR2({ tipMm: 3, tol: 1e-8, maxIter: 4000, minCotWeight: 1e-4 });
/** R558 (strip audit round 2, checker's finding): v is pinned to 0 on the medial-wall vertices, so the crest next to
 * them fell in the TOES band (toes on the dorsal crest 82 -> 824 mm2), while the toes belong on the medial wall (the
 * paracentral lobule) and the crest to ankle, knee and hip. On the primary CONVEXITY strip only, v below crestTop is
 * compressed linearly into [crestFloor, crestTop]: crestFloor is the toes / ankle core border of the body map
 * (ns-bodymap STRIP centres 0.0179 / 0.0379), crestTop the trunk end (0.135), so every landmark from the trunk on stays
 * exactly where it was. A plain linear squeeze gave the ankle most of the crest (about 810 mm2 against knee 300 / hip
 * 240), so the squeeze is a power curve (gamma 0.56): ankle about 460 to 485, knee about 385 to 395, hip about 265 to
 * 290 mm2 per hemisphere, close to the proportions before the along-gyrus coordinate (ankle 488, knee 445, hip 371) with the
 * toes back on the medial wall (5 to 8 mm2 left on the crest, from 824). The medial-wall rule (the toes' place) is
 * unchanged. Display layout, not a measured border. */
export const CREST_COMPRESS = freezeR2({ crestFloor: 0.0279, crestTop: 0.135, gamma: 0.56 });

/**
 * Along-gyrus coordinate per vertex (see ALONG_GYRUS). positions / indices: one closed strip mesh (source mm).
 * medialVertex(i): true for vertices pinned to v = 0 (the medial-wall edge); the vertices within tipMm of the lowest z
 * are pinned to v = 1 (a vertex in both sets stays 0). Coincident vertices are welded first (the OBJ parser splits them
 * along seams). A part of the mesh connected to no pinned vertex takes the v of the nearest vertex that is. Throws when a
 * pin set is empty or the solve does not converge. Returns { v: Float32Array (per input vertex, 0..1), iterations,
 * residual, vertices (welded), pinnedMedial, pinnedTip, islands }.
 */
export function alongGyrusCoordinate(positions, indices, medialVertex, { tipMm = ALONG_GYRUS.tipMm, tol = ALONG_GYRUS.tol, maxIter = ALONG_GYRUS.maxIter, minCotWeight = ALONG_GYRUS.minCotWeight } = {}) {
  const P0 = checkPositions(positions, 'positions');
  const n0 = P0.length / 3;
  if (!indices || indices.length % 3 !== 0 || indices.length === 0) throw new Error('ns:brain_strip: along-gyrus coordinate needs triangle indices');
  if (typeof medialVertex !== 'function') throw new Error('ns:brain_strip: medialVertex must be a function');
  const m = indices.length / 3;
  // Weld exactly coincident vertices.
  const keyOf = new Map(), rep = new Int32Array(n0), first = [];
  for (let i = 0; i < n0; i++) {
    const k = `${P0[3 * i]},${P0[3 * i + 1]},${P0[3 * i + 2]}`;
    let r = keyOf.get(k);
    if (r === undefined) { r = first.length; keyOf.set(k, r); first.push(i); }
    rep[i] = r;
  }
  const n = first.length, P = new Float64Array(3 * n), I = new Uint32Array(3 * m);
  for (let w = 0; w < n; w++) { const i = first[w]; P[3 * w] = P0[3 * i]; P[3 * w + 1] = P0[3 * i + 1]; P[3 * w + 2] = P0[3 * i + 2]; }
  for (let j = 0; j < 3 * m; j++) { if (!isIndex(indices[j], n0)) throw new Error(`ns:brain_mesh: triangle ${Math.floor(j / 3)} has an out-of-range index`); I[j] = rep[indices[j]]; }
  // Pins: -1 free, 0 medial wall, 1 ventral tip.
  let zMin = Infinity;
  for (let w = 0; w < n; w++) if (P[3 * w + 2] < zMin) zMin = P[3 * w + 2];
  const fixed = new Int8Array(n).fill(-1);
  for (let w = 0; w < n; w++) if (P[3 * w + 2] < zMin + tipMm) fixed[w] = 1;
  for (let i = 0; i < n0; i++) if (medialVertex(i)) fixed[rep[i]] = 0;
  let pinnedMedial = 0, pinnedTip = 0;
  for (let w = 0; w < n; w++) { if (fixed[w] === 0) pinnedMedial++; else if (fixed[w] === 1) pinnedTip++; }
  if (pinnedMedial === 0 || pinnedTip === 0) throw new Error(`ns:brain_strip: along-gyrus coordinate needs medial-wall and ventral-tip vertices (got ${pinnedMedial} / ${pinnedTip})`);
  // Clamped cotangent weights per half-edge, gathered into a symmetric CSR matrix (duplicate entries are summed by the
  // products below, which is the same operator).
  const deg = new Uint32Array(n + 1);
  for (let j = 0; j < 3 * m; j++) { deg[I[j] + 1] += 2; }
  for (let w = 0; w < n; w++) deg[w + 1] += deg[w];
  const col = new Uint32Array(deg[n]), val = new Float64Array(deg[n]), fill = deg.slice(0, n), diag = new Float64Array(n);
  for (let t = 0; t < m; t++) {
    for (let k = 0; k < 3; k++) {
      const o = I[3 * t + k], a = I[3 * t + (k + 1) % 3], b = I[3 * t + (k + 2) % 3];
      const ax = P[3 * a] - P[3 * o], ay = P[3 * a + 1] - P[3 * o + 1], az = P[3 * a + 2] - P[3 * o + 2];
      const bx = P[3 * b] - P[3 * o], by = P[3 * b + 1] - P[3 * o + 1], bz = P[3 * b + 2] - P[3 * o + 2];
      const cr = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      const wgt = Math.max(minCotWeight, 0.5 * (ax * bx + ay * by + az * bz) / Math.max(cr, 1e-12));
      let p = fill[a]++; col[p] = b; val[p] = wgt;
      p = fill[b]++; col[p] = a; val[p] = wgt;
      diag[a] += wgt; diag[b] += wgt;
    }
  }
  // Components reached from the pins; the rest are islands.
  const reached = new Uint8Array(n), stack = [];
  for (let w = 0; w < n; w++) if (fixed[w] >= 0) { reached[w] = 1; stack.push(w); }
  while (stack.length) { const w = stack.pop(); for (let p = deg[w]; p < deg[w + 1]; p++) { const q = col[p]; if (!reached[q]) { reached[q] = 1; stack.push(q); } } }
  const free = new Uint8Array(n);
  let islands = 0;
  for (let w = 0; w < n; w++) { if (fixed[w] < 0 && reached[w]) free[w] = 1; if (!reached[w]) islands++; }
  // Solve L_ff x_f = W_f1 * 1 (Dirichlet values 0 and 1) with Jacobi-preconditioned conjugate gradients.
  const x = new Float64Array(n), r = new Float64Array(n), z = new Float64Array(n), d = new Float64Array(n), Ad = new Float64Array(n);
  for (let w = 0; w < n; w++) if (fixed[w] === 1) x[w] = 1;
  let bn = 0;
  for (let w = 0; w < n; w++) {
    if (!free[w]) continue;
    let b = 0;
    for (let p = deg[w]; p < deg[w + 1]; p++) if (fixed[col[p]] === 1) b += val[p];
    x[w] = 0.5;
    let ax = diag[w] * 0.5;
    for (let p = deg[w]; p < deg[w + 1]; p++) if (free[col[p]]) ax -= val[p] * 0.5;
    r[w] = b - ax; bn += b * b;
  }
  bn = Math.sqrt(bn) || 1;
  let rz = 0, res = 0;
  for (let w = 0; w < n; w++) if (free[w]) { z[w] = r[w] / diag[w]; d[w] = z[w]; rz += r[w] * z[w]; res += r[w] * r[w]; }
  res = Math.sqrt(res) / bn;
  let it = 0;
  while (res > tol && it < maxIter) {
    let dAd = 0;
    for (let w = 0; w < n; w++) {
      if (!free[w]) continue;
      let s = diag[w] * d[w];
      for (let p = deg[w]; p < deg[w + 1]; p++) { const q = col[p]; if (free[q]) s -= val[p] * d[q]; }
      Ad[w] = s; dAd += d[w] * s;
    }
    const alpha = rz / dAd;
    let rz2 = 0; res = 0;
    for (let w = 0; w < n; w++) {
      if (!free[w]) continue;
      x[w] += alpha * d[w]; r[w] -= alpha * Ad[w]; z[w] = r[w] / diag[w];
      rz2 += r[w] * z[w]; res += r[w] * r[w];
    }
    res = Math.sqrt(res) / bn;
    const beta = rz2 / rz; rz = rz2;
    for (let w = 0; w < n; w++) if (free[w]) d[w] = z[w] + beta * d[w];
    it++;
  }
  if (!(res <= tol)) throw new Error(`ns:brain_strip: the along-gyrus coordinate did not converge (relative residual ${res} after ${it} iterations)`);
  if (islands > 0) { // islands: the v of the nearest reached vertex
    for (let w = 0; w < n; w++) {
      if (reached[w]) continue;
      let best = -1, bd = Infinity;
      for (let q = 0; q < n; q++) { if (!reached[q]) continue; const dd = (P[3 * q] - P[3 * w]) ** 2 + (P[3 * q + 1] - P[3 * w + 1]) ** 2 + (P[3 * q + 2] - P[3 * w + 2]) ** 2; if (dd < bd) { bd = dd; best = q; } }
      x[w] = x[best];
    }
  }
  const v = new Float32Array(n0);
  for (let i = 0; i < n0; i++) { const y = x[rep[i]]; v[i] = y < 0 ? 0 : y > 1 ? 1 : y; }
  return { v, iterations: it, residual: res, vertices: n, pinnedMedial, pinnedTip, islands };
}

/**
 * Segment both hemispheres' motor strips into BODY_MOTOR_MAP regions (pure geometry).
 *
 * strips: strip descriptors (motorStripDescriptors / stripDescriptorFor output; raw meshes are classified the same way)
 * with { id, hemisphere: 'right' | 'left', kind, positions (source mm), indices }. Extra hemisphere strip meshes (for
 * example from FULLBODY-MESH-MANIFEST region brain_motor) are accepted: further convexity pieces use the primary's u
 * range and paracentral meshes join the medial-wall rule.
 *
 * Rule per triangle (centroid): u = the mean of its vertices' strip coordinate. R558 (strip audit round 2): on each
 * hemisphere's PRIMARY precentral mesh that is the along-gyrus coordinate v (alongGyrusCoordinate: 0 at the medial-wall
 * edge, 1 at the ventral tip next to the Sylvian fissure, level lines across the gyrus); on further convexity pieces and
 * paracentral meshes it is (|x| - lo) / (hi - lo) with the primary's |x| range. Convexity triangles take
 * s = u and the owner among the regions applying to that hemisphere (hemisphere === h or 'both') by regionOwnerAt.
 * Medial-wall triangles (MEDIAL_WALL) take s = mLo + (mHi - mLo) * (1 - w), with w = medial depth 0 (dorsal margin) ..
 * 1 (deepest medial strip point) and [mLo, mHi] the union of that hemisphere's medialSurface extents, and the owner
 * among the medialSurface regions (if the map has none, the convexity rule applies to them too).
 *
 * Returns { kind: 'ns-motor-segmentation', version: 1, mapVersion, caveats, citations, warnings, options, regions
 * (normalised, each with triangleCount, areaMm2, byHemisphere: { right|left: { triangleCount, areaMm2, anchor, normal,
 * meanS } }, partIndices), regionById (Map), hemispheres: { right|left: { primaryId, meshIds, lo, hi, coordinate
 * ({ kind: 'along-gyrus', iterations, residual, vertices, pinnedMedial, pinnedTip, islands }), medial: null |
 * { zTop, zBottom, sLo, sHi, triangleCount }, regionIds } }, parts: [{ regionId, regionIndex, hemisphere, meshId,
 * surface: 'convexity' | 'medial', positions, indices, u, s, sourceIndex, triangles, vertexCount, faceCount }],
 * unassigned: [same shape without region; drawn as glass], strips: [per-mesh pick tables], coverage, glassGrid,
 * outline (round 3: brainOutlinePoints of glassMeshes + strips, when glassMeshes are given; option outline: false skips
 * it), beltOutline (brainOutlinePoints of the strips) }.
 * Typed arrays are not frozen; treat the result as immutable.
 */
export function segmentMotorStrips(strips, bodyMap, {
  gapTolU = SEGMENT_DEFAULTS.gapTolU, hysteresisU = SEGMENT_DEFAULTS.hysteresisU, hysteresisActionU = SEGMENT_DEFAULTS.hysteresisActionU,
  medialWall = MEDIAL_WALL, glassMeshes = null, glassVoxelMm = 3, lateralityTolMm = 0.5, outline = true, alongGyrus = ALONG_GYRUS
} = {}) {
  const v = validateBodyMotorMap(bodyMap);
  const extraWarnings = [];
  if (!v.ok) throw new Error(`ns:brain_bodymap: ${v.errors.join('; ')}`);
  if (!strips || typeof strips[Symbol.iterator] !== 'function') throw new Error('ns:brain_strip: strips must be an array of strip descriptors');
  const descs = [];
  for (const s of strips) {
    const d = s && HEMIS.includes(s.hemisphere) && STRIP_KINDS.includes(s.kind) ? s : stripDescriptorFor(s);
    if (!d) throw new Error(`ns:brain_strip: ${s && (s.id || s.name) || 'an entry'} is not a motor-strip mesh (give hemisphere and kind)`);
    checkPositions(d.positions, `${d.id}.positions`);
    if (!d.indices || d.indices.length % 3 !== 0 || d.indices.length === 0) throw new Error(`ns:brain_strip: ${d.id}.indices must be triangle indices`);
    descs.push(d);
  }
  if (descs.length === 0) throw new Error('ns:brain_strip: no strip meshes');
  const regions = v.regions;
  const hemis = {};
  for (const h of HEMIS) {
    const list = descs.filter(d => d.hemisphere === h);
    if (list.length === 0) { hemis[h] = null; continue; }
    const primary = list.find(d => d.kind === 'precentral') || list.find(d => d.kind === 'strip') || list[0];
    const { lo, hi } = lateralityRange(primary.positions, h, primary.id, 0);
    if (!(hi - lo > 0)) throw new Error(`ns:brain_strip: ${primary.id} has no medial-lateral extent`);
    const applicable = regions.filter(r => r.hemisphere === h || r.hemisphere === 'both');
    const medialRegions = applicable.filter(r => r.medialSurface);
    hemis[h] = { list, primary, lo, hi, applicable, medialRegions };
  }
  // Per-mesh triangle centroid data, medial classification and vertex strip coordinate.
  const meshes = descs.map(d => {
    const H = hemis[d.hemisphere];
    const pos = d.positions, idx = d.indices, n = pos.length / 3, m = idx.length / 3;
    for (let t = 0; t < idx.length; t++) if (!isIndex(idx[t], n)) throw new Error(`ns:brain_mesh: ${d.id} triangle ${Math.floor(t / 3)} has an out-of-range index`);
    lateralityRange(pos, d.hemisphere, d.id, d === H.primary ? 0 : lateralityTolMm);
    const orient = meshOrientation(pos, idx);
    const toMid = d.hemisphere === 'right' ? 1 : -1; // +x is toward the midline for the right hemisphere
    const triMedial = new Uint8Array(m), triU = new Float32Array(m), triArea = new Float32Array(m);
    const triN = new Float32Array(3 * m), triC = new Float32Array(3 * m);
    const N = [0, 0, 0];
    for (let t = 0; t < m; t++) {
      const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
      triArea2(pos, a, b, c, N);
      const L = Math.hypot(N[0], N[1], N[2]);
      triArea[t] = L / 2;
      const nx = L > 0 ? (orient * N[0]) / L : 0, ny = L > 0 ? (orient * N[1]) / L : 0, nz = L > 0 ? (orient * N[2]) / L : 0;
      triN[3 * t] = nx; triN[3 * t + 1] = ny; triN[3 * t + 2] = nz;
      const cx = (pos[3 * a] + pos[3 * b] + pos[3 * c]) / 3, cy = (pos[3 * a + 1] + pos[3 * b + 1] + pos[3 * c + 1]) / 3, cz = (pos[3 * a + 2] + pos[3 * b + 2] + pos[3 * c + 2]) / 3;
      triC[3 * t] = cx; triC[3 * t + 1] = cy; triC[3 * t + 2] = cz;
      triMedial[t] = Math.abs(cx) - H.lo < medialWall.bandMm && toMid * nx > medialWall.minFacing ? 1 : 0;
    }
    // R558 (strip audit round 2): the primary convexity strip of each hemisphere takes the ALONG-GYRUS coordinate v
    // (alongGyrusCoordinate: 0 at the medial-wall edge, 1 at the ventral tip next to the Sylvian fissure), so the map's
    // regions run down the whole gyrus in order. Further convexity pieces and paracentral meshes keep the medial-lateral
    // |x| fraction of the primary's range (no atlas mesh of those kinds is loaded; a warning says so).
    let vu, coordinate;
    if (d === H.primary && d.kind !== 'paracentral') {
      const medialV = new Uint8Array(n);
      for (let t = 0; t < m; t++) if (triMedial[t]) { medialV[idx[3 * t]] = 1; medialV[idx[3 * t + 1]] = 1; medialV[idx[3 * t + 2]] = 1; }
      if (!medialV.some(x => x)) for (let i = 0; i < n; i++) if (Math.abs(pos[3 * i]) - H.lo < medialWall.bandMm) medialV[i] = 1; // no medial-facing triangle: the medial band
      const g = alongGyrusCoordinate(pos, idx, i => medialV[i] === 1, alongGyrus);
      vu = g.v;
      { const { crestFloor: f0, crestTop: f1, gamma: g0 } = CREST_COMPRESS; for (let i = 0; i < n; i++) if (vu[i] < f1) vu[i] = f0 + (f1 - f0) * Math.pow(vu[i] / f1, g0); }
      coordinate = freezeR2({ kind: 'along-gyrus', iterations: g.iterations, residual: g.residual, vertices: g.vertices, pinnedMedial: g.pinnedMedial, pinnedTip: g.pinnedTip, islands: g.islands });
    } else {
      vu = new Float32Array(n);
      const span = H.hi - H.lo;
      for (let i = 0; i < n; i++) { const x = (Math.abs(pos[3 * i]) - H.lo) / span; vu[i] = x < 0 ? 0 : x > 1 ? 1 : x; }
      coordinate = freezeR2({ kind: 'medial-lateral' });
      if (d.kind !== 'paracentral') extraWarnings.push(`${d.id}: an extra ${d.hemisphere} convexity strip uses the medial-lateral |x| fraction, not the along-gyrus coordinate`);
    }
    for (let t = 0; t < m; t++) triU[t] = (vu[idx[3 * t]] + vu[idx[3 * t + 1]] + vu[idx[3 * t + 2]]) / 3;
    if (d === H.primary) H.coordinate = coordinate;
    return { d, H, pos, idx, n, m, vu, triMedial, triU, triArea, triN, triC };
  });
  // Per-hemisphere medial-wall depth range and the motor y range of the primary's medial wall.
  for (const h of HEMIS) {
    const H = hemis[h];
    if (!H) continue;
    let count = 0, zTop = -Infinity, zBottom = Infinity, yLo = Infinity, yHi = -Infinity;
    for (const M of meshes) {
      if (M.d.hemisphere !== h || M.d.kind === 'paracentral') continue;
      for (let t = 0; t < M.m; t++) {
        if (!M.triMedial[t]) continue;
        count++;
        for (let j = 0; j < 3; j++) { const vi = M.idx[3 * t + j], z = M.pos[3 * vi + 2]; if (z > zTop) zTop = z; if (z < zBottom) zBottom = z; }
        if (M.d === H.primary) { const y = M.triC[3 * t + 1]; if (y < yLo) yLo = y; if (y > yHi) yHi = y; }
      }
    }
    for (const M of meshes) { // paracentral meshes extend the medial depth range
      if (M.d.hemisphere !== h || M.d.kind !== 'paracentral') continue;
      for (let t = 0; t < M.m; t++) {
        if (!M.triMedial[t]) continue;
        const y = M.triC[3 * t + 1];
        if (Number.isFinite(yLo) && (y < yLo - medialWall.motorMarginMm || y > yHi + medialWall.motorMarginMm)) continue;
        count++;
        for (let j = 0; j < 3; j++) { const vi = M.idx[3 * t + j], z = M.pos[3 * vi + 2]; if (z > zTop) zTop = z; if (z < zBottom) zBottom = z; }
      }
    }
    const mr = H.medialRegions;
    H.medial = count >= medialWall.minMedialTriangles && zTop > zBottom
      ? { zTop, zBottom, yLo, yHi, triangleCount: count, sLo: mr.length ? Math.min(...mr.map(r => r.extent[0])) : null, sHi: mr.length ? Math.max(...mr.map(r => r.extent[1])) : null }
      : null;
  }
  const medialS = (H, z) => {
    const md = H.medial;
    const w0 = (md.zTop - z) / (md.zTop - md.zBottom), w = w0 < 0 ? 0 : w0 > 1 ? 1 : w0;
    return md.sLo + (md.sHi - md.sLo) * (1 - w);
  };
  // Assignment.
  const partsMap = new Map(); // key regionIndex|meshIdx|surface -> triangle list
  const unassignedLists = meshes.map(() => []);
  const stripTables = [];
  const regionStats = regions.map(() => ({ right: null, left: null }));
  meshes.forEach((M, mi) => {
    const { d, H } = M;
    const useMedial = H.medial && H.medialRegions.length > 0;
    const triRegion = new Int32Array(M.m).fill(-1), triS = new Float32Array(M.m), triSurface = new Uint8Array(M.m);
    for (let t = 0; t < M.m; t++) {
      const medial = M.triMedial[t] === 1 && useMedial;
      let s, owner = null;
      // A paracentral mesh contributes only its precentral (motor) part: centroid y within the primary strip's
      // medial-wall y range +- motorMarginMm. The rest (posteriorly the postcentral, sensory part; anteriorly
      // non-precentral medial cortex) stays unassigned glass.
      const yc = M.triC[3 * t + 1], md = H.medial;
      const motorY = d.kind !== 'paracentral' || !md || !Number.isFinite(md.yLo) || (yc >= md.yLo - medialWall.motorMarginMm && yc <= md.yHi + medialWall.motorMarginMm);
      if (medial) {
        s = medialS(H, M.triC[3 * t + 2]);
        owner = motorY ? regionOwnerAt(H.medialRegions, s, gapTolU) : null;
        triSurface[t] = 1;
      } else {
        s = M.triU[t]; // convexity rule (also a paracentral mesh's dorsal rim and inner faces)
        owner = motorY && !(d.kind === 'paracentral' && M.triMedial[t] === 1) ? regionOwnerAt(H.applicable, s, gapTolU) : null;
        if (M.triMedial[t] === 1) triSurface[t] = 1;
      }
      triS[t] = s;
      if (!owner) { unassignedLists[mi].push(t); continue; }
      triRegion[t] = owner.index;
      const key = `${owner.index}|${mi}|${triSurface[t]}`;
      let list = partsMap.get(key);
      if (!list) { list = []; partsMap.set(key, list); }
      list.push(t);
      let st = regionStats[owner.index][d.hemisphere];
      if (!st) st = regionStats[owner.index][d.hemisphere] = { triangleCount: 0, areaMm2: 0, c: [0, 0, 0], n: [0, 0, 0], sSum: 0, top: [0, 0, 0], topW: 0 };
      const ar = M.triArea[t];
      st.triangleCount++; st.areaMm2 += ar; st.sSum += s * ar;
      for (let j = 0; j < 3; j++) { st.c[j] += M.triC[3 * t + j] * ar; st.n[j] += M.triN[3 * t + j] * ar; }
      // label anchor: outward triangles facing superior (convexity) or the midline (medial wall)
      const facing = triSurface[t] ? (d.hemisphere === 'right' ? 1 : -1) * M.triN[3 * t] : M.triN[3 * t + 2];
      if (facing > 0.3) { const wgt = ar * facing; st.topW += wgt; for (let j = 0; j < 3; j++) st.top[j] += M.triC[3 * t + j] * wgt; }
    }
    // Pick table: [ax, ay, az, e1x, e1y, e1z, e2x, e2y, e2z] per triangle and a padded AABB.
    const tri = new Float64Array(9 * M.m);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    const P = M.pos, I = M.idx;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i] < x0) x0 = P[i]; if (P[i] > x1) x1 = P[i];
      if (P[i + 1] < y0) y0 = P[i + 1]; if (P[i + 1] > y1) y1 = P[i + 1];
      if (P[i + 2] < z0) z0 = P[i + 2]; if (P[i + 2] > z1) z1 = P[i + 2];
    }
    for (let t = 0; t < M.m; t++) {
      const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
      const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2];
      tri[9 * t] = ax; tri[9 * t + 1] = ay; tri[9 * t + 2] = az;
      tri[9 * t + 3] = P[3 * b] - ax; tri[9 * t + 4] = P[3 * b + 1] - ay; tri[9 * t + 5] = P[3 * b + 2] - az;
      tri[9 * t + 6] = P[3 * c] - ax; tri[9 * t + 7] = P[3 * c + 1] - ay; tri[9 * t + 8] = P[3 * c + 2] - az;
    }
    const pad = 1e-6 * (Math.abs(x0) + Math.abs(x1) + Math.abs(y0) + Math.abs(y1) + Math.abs(z0) + Math.abs(z1) + 1);
    stripTables.push({
      id: d.id, hemisphere: d.hemisphere, kind: d.kind, positions: P, indices: I, u: M.vu,
      triRegion, triS, triSurface, triMedial: M.triMedial, triangleCount: M.m, tri,
      boundsMin: [x0 - pad, y0 - pad, z0 - pad], boundsMax: [x1 + pad, y1 + pad, z1 + pad]
    });
  });
  // Parts (compacted per region x mesh x surface) and unassigned glass parts.
  const parts = [];
  const partIndices = regions.map(() => []);
  const keys = Array.from(partsMap.keys()).sort((a, b) => {
    const [ra, ma, sa] = a.split('|').map(Number), [rb, mb, sb] = b.split('|').map(Number);
    return (regions[ra].order - regions[rb].order) || (ra - rb) || (ma - mb) || (sa - sb);
  });
  for (const key of keys) {
    const [ri, mi, surf] = key.split('|').map(Number);
    const M = meshes[mi], H = M.H;
    const vS = surf === 1 && H.medial && H.medial.sLo !== null ? vi => medialS(H, M.pos[3 * vi + 2]) : null;
    const part = compactPart(M.pos, M.idx, M.vu, vS, partsMap.get(key));
    partIndices[ri].push(parts.length);
    parts.push({ regionId: regions[ri].id, regionIndex: ri, hemisphere: M.d.hemisphere, meshId: M.d.id, surface: surf === 1 ? 'medial' : 'convexity', ...part });
  }
  const unassigned = [];
  meshes.forEach((M, mi) => {
    if (unassignedLists[mi].length === 0) return;
    unassigned.push({ regionId: null, regionIndex: -1, hemisphere: M.d.hemisphere, meshId: M.d.id, surface: 'mixed', ...compactPart(M.pos, M.idx, M.vu, null, unassignedLists[mi]) });
  });
  const outRegions = freezeR2(regions.map((r, i) => {
    const byHemisphere = {};
    let triangleCount = 0, areaMm2 = 0;
    for (const h of HEMIS) {
      const st = regionStats[i][h];
      if (!st) continue;
      triangleCount += st.triangleCount; areaMm2 += st.areaMm2;
      const c = st.c.map(x => x / st.areaMm2);
      const nl = Math.hypot(st.n[0], st.n[1], st.n[2]) || 1;
      byHemisphere[h] = freezeR2({
        triangleCount: st.triangleCount, areaMm2: st.areaMm2, centroid: freezeR2(c),
        normal: freezeR2(st.n.map(x => x / nl)), meanS: st.sSum / st.areaMm2,
        anchor: freezeR2(st.topW > 0 ? st.top.map(x => x / st.topW) : c)
      });
    }
    return freezeR2({ ...r, triangleCount, areaMm2, byHemisphere: freezeR2(byHemisphere), partIndices: freezeR2(partIndices[i]) });
  }));
  const coverage = {};
  for (const h of HEMIS) {
    const tabs = stripTables.filter(s => s.hemisphere === h);
    let triangles = 0, assigned = 0, medial = 0;
    for (const s of tabs) for (let t = 0; t < s.triangleCount; t++) { triangles++; if (s.triRegion[t] >= 0) assigned++; if (s.triSurface[t]) medial++; }
    coverage[h] = freezeR2({ triangles, assigned, unassigned: triangles - assigned, medial, fraction: triangles ? assigned / triangles : 0 });
  }
  const hemispheres = {};
  for (const h of HEMIS) {
    const H = hemis[h];
    hemispheres[h] = H ? freezeR2({
      primaryId: H.primary.id, meshIds: freezeR2(H.list.map(d => d.id)), lo: H.lo, hi: H.hi, coordinate: H.coordinate || null,
      medial: H.medial ? freezeR2({ ...H.medial }) : null,
      regionIds: freezeR2(H.applicable.map(r => r.id)), medialRegionIds: freezeR2(H.medialRegions.map(r => r.id))
    }) : null;
  }
  const seg = {
    kind: 'ns-motor-segmentation', version: 1, mapVersion: v.version, caveats: v.caveats, citations: v.citations, warnings: freezeR2([...v.warnings, ...extraWarnings]),
    options: freezeR2({ gapTolU, hysteresisU, hysteresisActionU }),
    regions: outRegions, regionById: new Map(outRegions.map(r => [r.id, r])),
    hemispheres: freezeR2(hemispheres), parts, unassigned, strips: stripTables, coverage: freezeR2(coverage),
    glassGrid: glassMeshes ? buildBrainHitGrid(glassMeshes, { voxelMm: glassVoxelMm }) : null,
    // Round 3 (R3-brain): outline support points of the whole brain (glass meshes + strips; brainOutlinePoints) for the
    // silhouette, the framing and the orbit-arrow anchors, and of the two strips alone (the motor belt).
    outline: glassMeshes && outline !== false ? brainOutlinePoints([...Array.from(glassMeshes), ...descs]) : null,
    beltOutline: outline !== false ? brainOutlinePoints(descs, { directions: OUTLINE.beltDirections }) : null
  };
  // Private, per-hemisphere owner lists for gaze hysteresis.
  seg._owners = {};
  const own = list => list.map(r => outRegions[r.index]);
  for (const h of HEMIS) seg._owners[h] = hemis[h] ? { all: own(hemis[h].applicable), medial: hemis[h].medial && hemis[h].medialRegions.length ? own(hemis[h].medialRegions) : null } : null;
  return seg;
}

const isSegmentation = x => !!x && x.kind === 'ns-motor-segmentation' && Array.isArray(x.strips);

/** Regions of a segmentation sorted by hemisphere then strip order (medial wall first): [{ hemisphere, regionId, order,
 * meanS, triangleCount }]. */
export function regionOrderTable(seg) {
  if (!isSegmentation(seg)) throw new Error('ns:brain_segment: a segmentMotorStrips result is required');
  const out = [];
  for (const r of seg.regions) for (const h of HEMIS) {
    const b = r.byHemisphere[h];
    if (b) out.push({ hemisphere: h, regionId: r.id, order: r.order, meanS: b.meanS, triangleCount: b.triangleCount });
  }
  return out.sort((a, b) => (a.hemisphere < b.hemisphere ? -1 : a.hemisphere > b.hemisphere ? 1 : 0) || a.order - b.order || a.meanS - b.meanS);
}

// ---------------------------------------------------------------------------------------------
// Coarse whole-brain hit grid (for gaze kind 'glass' and for "the gaze is on the brain" when grabbing)

/** Occupancy grid of brain surfaces: every triangle of `meshes` ({ positions, indices } in source mm) is sampled at a
 * spacing <= voxelMm / 2 and each sample marks its voxel, so the grid is a closed voxel shell of the surfaces (a ray
 * that crosses a surface passes through a marked voxel). Returns { voxelMm, origin, dims, cells (Uint8Array),
 * occupied, bounds: { min, max } (tight source-mm bounds of the meshes) }. Coarse by design: a hit means "on the
 * glassy brain within about one voxel". Built with ALL brain meshes it also serves frameBrain (pivot = its bounds
 * centre, conservative clearance basis). */
export function buildBrainHitGrid(meshes, { voxelMm = 3 } = {}) {
  if (!(Number.isFinite(voxelMm) && voxelMm > 0)) throw new Error('ns:brain_grid: voxelMm must be finite and > 0');
  const list = Array.from(meshes || []).filter(m => m && m.positions && m.indices && m.positions.length >= 9);
  if (list.length === 0) throw new Error('ns:brain_grid: no meshes');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of list) for (let i = 0; i < m.positions.length; i += 3) for (let a = 0; a < 3; a++) {
    const x = m.positions[i + a];
    if (x < lo[a]) lo[a] = x;
    if (x > hi[a]) hi[a] = x;
  }
  const origin = lo.map(x => x - voxelMm);
  const dims = [0, 1, 2].map(a => Math.max(1, Math.ceil((hi[a] - origin[a]) / voxelMm) + 2));
  const cells = new Uint8Array(dims[0] * dims[1] * dims[2]);
  const mark = (x, y, z) => {
    const i = Math.floor((x - origin[0]) / voxelMm), j = Math.floor((y - origin[1]) / voxelMm), k = Math.floor((z - origin[2]) / voxelMm);
    if (i >= 0 && j >= 0 && k >= 0 && i < dims[0] && j < dims[1] && k < dims[2]) cells[(k * dims[1] + j) * dims[0] + i] = 1;
  };
  const step = voxelMm / 2;
  for (const m of list) {
    const P = m.positions, I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const lab = Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
      const lac = Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]);
      const lbc = Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2]);
      const n = Math.max(1, Math.ceil(Math.max(lab, lac, lbc) / step));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const wb = i / n, wc = j / n, wa = 1 - wb - wc;
        mark(wa * P[a] + wb * P[b] + wc * P[c], wa * P[a + 1] + wb * P[b + 1] + wc * P[c + 1], wa * P[a + 2] + wb * P[b + 2] + wc * P[c + 2]);
      }
    }
  }
  let occupied = 0;
  for (let i = 0; i < cells.length; i++) occupied += cells[i];
  return { kind: 'ns-brain-grid', voxelMm, origin, dims, cells, occupied, bounds: { min: lo, max: hi } };
}

/** Distance along a ray (source mm, dir unit) to the first occupied voxel of a buildBrainHitGrid grid, or null
 * (3-D DDA, Amanatides & Woo). */
export function rayBrainGrid(o, d, grid) {
  if (!grid || grid.kind !== 'ns-brain-grid') return null;
  const { voxelMm: s, origin, dims, cells } = grid;
  const bmin = origin, bmax = [origin[0] + dims[0] * s, origin[1] + dims[1] * s, origin[2] + dims[2] * s];
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (d[a] === 0) { if (o[a] < bmin[a] || o[a] > bmax[a]) return null; continue; }
    let ta = (bmin[a] - o[a]) / d[a], tb = (bmax[a] - o[a]) / d[a];
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  const p = [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0];
  const idx = [0, 1, 2].map(a => Math.min(dims[a] - 1, Math.max(0, Math.floor((p[a] - origin[a]) / s))));
  const stepA = [0, 1, 2].map(a => (d[a] > 0 ? 1 : d[a] < 0 ? -1 : 0));
  const tMax = [0, 1, 2].map(a => (d[a] === 0 ? Infinity : t0 + ((origin[a] + (idx[a] + (d[a] > 0 ? 1 : 0)) * s) - p[a]) / d[a]));
  const tDelta = [0, 1, 2].map(a => (d[a] === 0 ? Infinity : s / Math.abs(d[a])));
  let t = t0;
  for (let guard = 0; guard < dims[0] + dims[1] + dims[2] + 3; guard++) {
    if (cells[(idx[2] * dims[1] + idx[1]) * dims[0] + idx[0]]) return t;
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    t = tMax[a];
    if (t > t1) return null;
    idx[a] += stepA[a];
    if (idx[a] < 0 || idx[a] >= dims[a]) return null;
    tMax[a] += tDelta[a];
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Region gaze

function leftArmRegionFor(seg, armActionId, u) {
  const list = seg.regions.filter(r => r.isLeftArm && (r.hemisphere === 'right' || r.hemisphere === 'both') && r.actions.some(a => a.armActionId === armActionId));
  if (list.length === 0) return null;
  return list.find(r => Number.isFinite(u) && u >= r.extent[0] && u <= r.extent[1]) || list[0];
}

/** The action a gaze point selects inside `region`: left-arm regions pick, among their actions that have a marker dot
 * (the 12 MARKERS actions), the one whose representative position is nearest to the gaze u (the active action keeps the
 * gaze within hysteresisActionU). R558 (strip audit round 2): the representative position is the map's own action
 * uCentre (in the segmentation's strip coordinate, the along-gyrus v); only an action without one falls back to its
 * legacy MARKERS u. Otherwise (and for left-arm actions without a dot, e.g. pronation / supination, as ns-actions
 * pickRegionAction does) the region's core is split into equal control sub-bands in the listed action order (display
 * control rule, not a cortical location). Returns the action or null. */
export function regionActionAt(region, u, s, { activeActionId = null, hysteresisU = SEGMENT_DEFAULTS.hysteresisU, hysteresisActionU = SEGMENT_DEFAULTS.hysteresisActionU } = {}) {
  const acts = region && region.actions;
  if (!acts || acts.length === 0) return null;
  const matchesActive = a => activeActionId !== null && (a.id === activeActionId || a.armActionId === activeActionId);
  // R558: a left-arm action's position is its map uCentre when present (every new left-hand action has one), else the
  // legacy MARKERS u (the two agree for the 12 movement-map actions).
  const markerU = a => (Number.isFinite(a.uCentre) ? a.uCentre : a.armActionId === null ? undefined : MARKER_U.get(a.armActionId));
  if (region.isLeftArm && Number.isFinite(u)) {
    let best = null, bd = Infinity;
    for (const a of acts) {
      const mu = markerU(a);
      if (mu === undefined) continue;
      const d = Math.abs(u - mu);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) {
      const act = acts.find(matchesActive);
      const mu = act ? markerU(act) : undefined;
      if (act && mu !== undefined && Math.abs(u - mu) <= bd + 2 * hysteresisActionU) return act;
      return best;
    }
  }
  // R558 (strip audit): split the region's CORE (its non-overlapping control cell, where the look actually lands on
  // it), not its wider overlapping display extent: with the extent, the outer sub-bands lay mostly in the neighbours'
  // cores, so some actions could hardly or never be picked by looking (for example "Raise right arm up": 0 %).
  const [u0, u1] = Array.isArray(region.core) && region.core[1] > region.core[0] ? region.core : region.extent;
  const x = Number.isFinite(s) ? s : u;
  const n = acts.length, span = u1 - u0;
  const f = Number.isFinite(x) && span > 0 ? Math.min(1, Math.max(0, (x - u0) / span)) : 0;
  let i = Math.min(n - 1, Math.floor(f * n));
  const j = acts.findIndex(matchesActive);
  if (j >= 0 && j !== i) {
    const h = span > 0 ? hysteresisU / span : 0;
    if (f >= j / n - h && f <= (j + 1) / n + h) i = j;
  }
  return acts[i];
}

/**
 * R558 (strip audit round 2): the left-arm marker DOTS for region mode, placed in the segmentation's own strip coordinate
 * (the along-gyrus v of the right hemisphere's primary strip) near the body map's own action positions (uCentre), with
 * the region picker's own rule. A dot sits on the CENTROID of one strip triangle (lifted MARKER_GEOMETRY.liftMm along
 * superior, as every dot): a triangle drawn in the action's region, visible from above (no strip surface more than
 * visibilityTolMm above its centroid), whose centroid v picks the action (regionActionAt). Candidates are tried in
 * order of the share of their edge neighbours drawn in the same region with the same action (most first), then
 * nearness to uCentre; the first that passes the view check wins: the vertical ray and the rays from the
 * MARKER_VIEWPOINTS virtual cameras (above the left-arm territory's aim point) through the dot centre all first hit
 * triangles of the action's region whose point picks the action. With no passing candidate the first visible one is
 * used (viewChecked false); with no visible one, the region's triangle whose centroid v is nearest (crownVisible false).
 * So a drawn dot sits inside its own area and its own action's share of it, as the default camera sees it (the old
 * vertex placement could not: the region bands are only one or two triangles wide where the gyrus is seen from above).
 * Returns a frozen array in MARKERS order of { actionId, u (uCentre), kind, vertexIndex (a vertex of the triangle),
 * triangleIndex, position (source mm, the centroid), uVertex (v at the centroid), fallback, crownVisible, viewChecked,
 * band ({ uMin, uMax }: the left-arm cores' range, which classifyRegionGaze's dot test uses) }, or null when the
 * segmentation has no right primary strip or the map has no position for one of the MARKERS actions.
 */
export function placeRegionMarkers(seg, { visibilityTolMm = MARKER_VISIBILITY_TOL_MM, viewpoints = MARKER_VIEWPOINTS } = {}) {
  if (!isSegmentation(seg)) throw new Error('ns:brain_segment: a segmentMotorStrips result is required');
  const hemi = seg.hemispheres.right;
  const S = hemi ? seg.strips.find(t => t.hemisphere === 'right' && t.id === hemi.primaryId) : null;
  if (!S) return null;
  const arm = seg.regions.filter(r => r.isLeftArm && r.hemisphere === 'right' && !r.medialSurface);
  const at = new Map(), regionOf = new Map();
  for (const r of arm) for (const a of r.actions) if (a.armActionId !== null && Number.isFinite(a.uCentre)) { at.set(a.armActionId, a.uCentre); regionOf.set(a.armActionId, r); }
  if (!MARKERS.every(mk => at.has(mk.actionId))) return null;
  const cell = r => (Array.isArray(r.core) && r.core[1] > r.core[0] ? r.core : r.extent);
  const band = freezeR2({ uMin: Math.min(...arm.map(r => cell(r)[0])), uMax: Math.max(...arm.map(r => cell(r)[1])) });
  const P = S.positions, I = S.indices, U = S.u, m = S.triangleCount;
  const armIdx = new Set(arm.map(r => r.index));
  const actAt = (ri, u) => { const a = ri >= 0 && armIdx.has(ri) ? regionActionAt(seg.regions[ri], u, u) : null; return a ? a.armActionId : null; };
  const cen = new Float64Array(3 * m), cu = new Float64Array(m), cact = new Array(m).fill(null);
  for (let t = 0; t < m; t++) {
    const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
    for (let k = 0; k < 3; k++) cen[3 * t + k] = (P[3 * a + k] + P[3 * b + k] + P[3 * c + k]) / 3;
    cu[t] = (U[a] + U[b] + U[c]) / 3;
    cact[t] = actAt(S.triRegion[t], cu[t]);
  }
  // Edge neighbours (vertices welded by position: the parser splits them along seams).
  const keyOf = new Map(), wid = new Int32Array(P.length / 3);
  for (let i = 0; i < wid.length; i++) { const k = `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`; if (!keyOf.has(k)) keyOf.set(k, keyOf.size); wid[i] = keyOf.get(k); }
  const edges = new Map(), nbr = Array.from({ length: m }, () => []);
  for (let t = 0; t < m; t++) for (let k = 0; k < 3; k++) {
    const p = wid[I[3 * t + k]], q = wid[I[3 * t + (k + 1) % 3]], e = p < q ? `${p}|${q}` : `${q}|${p}`;
    const o = edges.get(e);
    if (o === undefined) edges.set(e, t); else { nbr[t].push(o); nbr[o].push(t); }
  }
  const topZ = makeTopZ(P, I);
  const visible = t => { const z = topZ(cen[3 * t], cen[3 * t + 1]); return z === null || cen[3 * t + 2] >= z - visibilityTolMm; };
  // Virtual default cameras above the left-arm territory's aim point (bounding-box centre of its triangles, on the strip).
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let t = 0; t < m; t++) if (armIdx.has(S.triRegion[t])) { x0 = Math.min(x0, cen[3 * t]); x1 = Math.max(x1, cen[3 * t]); y0 = Math.min(y0, cen[3 * t + 1]); y1 = Math.max(y1, cen[3 * t + 1]); z1 = Math.max(z1, cen[3 * t + 2]); }
  const ax = (x0 + x1) / 2, ay = (y0 + y1) / 2, az = topZ(ax, ay) ?? z1, eyes = [];
  for (const h of viewpoints.heightsMm) eyes.push([ax, ay, az + h]);
  const off = viewpoints.offsetsMm, hMid = viewpoints.heightsMm[Math.floor(viewpoints.heightsMm.length / 2)];
  for (const [dx, dy] of [[off, 0], [-off, 0], [0, off], [0, -off]]) eyes.push([ax + dx, ay + dy, az + hMid]);
  const firstHit = (o, d) => { const h = rayStripTable(o, d, S); if (!h) return null; const k = h.tri, w = 1 - h.b1 - h.b2; return { ri: S.triRegion[k], u: w * U[I[3 * k]] + h.b1 * U[I[3 * k + 1]] + h.b2 * U[I[3 * k + 2]] }; };
  const viewOk = (t, actionId, ri) => {
    const c = [cen[3 * t], cen[3 * t + 1], cen[3 * t + 2] + MARKER_GEOMETRY.liftMm];
    for (const e of [[c[0], c[1], c[2] + 30], ...eyes]) {
      const h = firstHit(e, normalize(sub(c, e)));
      if (!h || h.ri !== ri || actAt(h.ri, h.u) !== actionId) return false;
    }
    return true;
  };
  return freezeR2(MARKERS.map(mk => {
    const actionId = mk.actionId, target = at.get(actionId), ri = regionOf.get(actionId).index;
    const mine = [];
    for (let t = 0; t < m; t++) if (S.triRegion[t] === ri && cact[t] === actionId) mine.push(t);
    const inside = t => (nbr[t].length ? nbr[t].filter(q => S.triRegion[q] === ri && cact[q] === actionId).length / nbr[t].length : 0);
    const vis = mine.filter(visible).sort((a, b) => (inside(b) - inside(a)) || (Math.abs(cu[a] - target) - Math.abs(cu[b] - target)) || (a - b));
    let best = vis.find(t => viewOk(t, actionId, ri)), viewChecked = true, crownVisible = true, fallback = false;
    if (best === undefined && vis.length) { best = vis[0]; viewChecked = false; }
    if (best === undefined) {
      viewChecked = false; crownVisible = false; fallback = true;
      const pool = mine.length ? mine : Array.from({ length: m }, (_, t) => t).filter(t => S.triRegion[t] === ri);
      if (!pool.length) throw new Error(`ns:brain_markers: region ${seg.regions[ri].id} has no strip triangle for ${actionId}`);
      best = pool.reduce((p, t) => (Math.abs(cu[t] - target) < Math.abs(cu[p] - target) ? t : p), pool[0]);
    }
    return freezeR2({
      actionId, u: target, kind: MARKER_KIND, vertexIndex: I[3 * best], triangleIndex: best,
      position: freezeR2([cen[3 * best], cen[3 * best + 1], cen[3 * best + 2]]), uVertex: cu[best], fallback, crownVisible, viewChecked, band
    });
  }));
}

function rayStripTable(o, d, S) {
  const mn = S.boundsMin, mx = S.boundsMax;
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (d[a] === 0) { if (o[a] < mn[a] || o[a] > mx[a]) return null; continue; }
    let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  const T = S.tri, o0 = o[0], o1 = o[1], o2 = o[2], q0 = d[0], q1 = d[1], q2 = d[2];
  let bestT = Infinity, bestTri = -1, bu = 0, bv = 0;
  for (let k = 0; k < S.triangleCount; k++) {
    const j = 9 * k;
    const e1x = T[j + 3], e1y = T[j + 4], e1z = T[j + 5], e2x = T[j + 6], e2y = T[j + 7], e2z = T[j + 8];
    const hx = q1 * e2z - q2 * e2y, hy = q2 * e2x - q0 * e2z, hz = q0 * e2y - q1 * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const sx = o0 - T[j], sy = o1 - T[j + 1], sz = o2 - T[j + 2];
    const b1 = f * (sx * hx + sy * hy + sz * hz);
    if (b1 < 0 || b1 > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const b2 = f * (q0 * qx + q1 * qy + q2 * qz);
    if (b2 < 0 || b1 + b2 > 1) continue;
    const hit = f * (e2x * qx + e2y * qy + e2z * qz);
    if (hit >= 0 && hit < bestT) { bestT = hit; bestTri = k; bu = b1; bv = b2; }
  }
  return bestTri < 0 ? null : { t: bestT, tri: bestTri, b1: bu, b2: bv };
}

function regionResult(kind, extra) {
  return {
    kind, regionId: null, hemisphere: null, isLeftArm: false, actionId: null, mapActionId: null, armActionId: null,
    u: null, s: null, surface: null, meshId: null, point: null, t: null, overlaps: [], via: null, label: null, bodySide: null, effector: null,
    ...extra
  };
}

/**
 * Classify a gaze ray (SOURCE mm; gazeRayInSource) against a segmentMotorStrips result. Pick order:
 *  1. optional left-arm marker DOTS (`markers`: placeMarkers output on the right strip), the drawn octahedra exactly as
 *     the legacy picker tests them; the nearest dot entry wins if it is nearer than the strip hit, selecting that
 *     action inside its left-arm region;
 *  2. the nearest STRIP triangle over every strip mesh of both hemispheres (two-sided; the glass never occludes a
 *     strip). Its region is the owner of the hit point's strip coordinate s (regionOwnerAt over the hemisphere's owner
 *     list, the segmentation's rule applied per point; R558: the renderer draws the areas per fragment by the same rule,
 *     so what is drawn is what is picked; a point in a map gap keeps the triangle's assignment). HYSTERESIS: when
 *     `activeRegionId` applies to the hit hemisphere and the gaze point's strip coordinate s lies within hysteresisU of
 *     the active region's owned interval (same surface rule), the active region is kept. Inside the region the action
 *     is regionActionAt (with activeActionId hysteresis). An unassigned strip triangle (a map gap) is 'glass'.
 *  3. otherwise the coarse brain grid (seg.glassGrid, when built) -> 'glass'; else 'empty'.
 * Returns { kind: 'region' | 'glass' | 'empty', regionId, hemisphere, isLeftArm, actionId (the left-arm action id for
 * left-arm regions, else the map action id), mapActionId, armActionId, u (the hemisphere's strip coordinate at the hit:
 * the along-gyrus v on a primary strip), s (the assignment coordinate: u on the convexity, medial depth on the medial
 * wall), surface ('convexity' | 'medial'), meshId,
 * point (source mm), t (mm along the ray), overlaps (ids of other applicable regions whose extents also contain s:
 * representations overlap), via ('dot' | 'strip' | 'grid'), label, bodySide, effector }.
 */
export function classifyRegionGaze(rayOriginSrc, rayDirSrc, seg, {
  activeRegionId = null, activeActionId = null, markers = null,
  hysteresisU = seg && seg.options ? seg.options.hysteresisU : SEGMENT_DEFAULTS.hysteresisU,
  hysteresisActionU = seg && seg.options ? seg.options.hysteresisActionU : SEGMENT_DEFAULTS.hysteresisActionU
} = {}) {
  if (!isSegmentation(seg)) throw new Error('ns:brain_segment: a segmentMotorStrips result is required');
  const o = vec3(rayOriginSrc, 'rayOrigin'), d0 = vec3(rayDirSrc, 'rayDir');
  if (!(length(d0) > 1e-12)) throw new Error('ns:brain_ray: zero-length gaze direction');
  const d = normalize(d0);
  // 1. drawn left-arm dots
  let dotT = Infinity, dotHit = null;
  if (markers) {
    for (const mk of dotsOf(markers)) {
      const t = rayMarkerSolid(o, d, cachedSolid(mk, mk.actionId === activeActionId));
      if (t !== null && t < dotT) { dotT = t; dotHit = mk; }
    }
  }
  // 2. strips
  let best = null, bestS = null;
  for (const S of seg.strips) {
    const h = rayStripTable(o, d, S);
    if (h && (!best || h.t < best.t)) { best = h; bestS = S; }
  }
  if (dotHit && (!best || dotT <= best.t)) {
    const uDot = Number.isFinite(dotHit.uVertex) ? dotHit.uVertex : Number.isFinite(dotHit.u) ? dotHit.u : null;
    const region = leftArmRegionFor(seg, dotHit.actionId, uDot);
    if (region) {
      const act = region.actions.find(a => a.armActionId === dotHit.actionId);
      return regionResult('region', {
        regionId: region.id, hemisphere: 'right', isLeftArm: true, actionId: dotHit.actionId, mapActionId: act ? act.id : null, armActionId: dotHit.actionId,
        u: uDot, s: uDot, surface: 'convexity', meshId: STRIP_MESH_IDS.right, point: add(o, scale(d, dotT)), t: dotT, via: 'dot',
        label: region.label, bodySide: region.bodySide, effector: region.effector,
        overlaps: seg.regions.filter(r => r !== region && (r.hemisphere === 'right' || r.hemisphere === 'both') && !r.medialSurface && uDot >= r.extent[0] && uDot <= r.extent[1]).map(r => r.id)
      });
    }
  }
  if (best) {
    const S = bestS, I = S.indices, k = best.tri;
    const ia = I[3 * k], ib = I[3 * k + 1], ic = I[3 * k + 2];
    const wa = 1 - best.b1 - best.b2;
    let u = wa * S.u[ia] + best.b1 * S.u[ib] + best.b2 * S.u[ic];
    const uLo = Math.min(S.u[ia], S.u[ib], S.u[ic]), uHi = Math.max(S.u[ia], S.u[ib], S.u[ic]);
    u = u < uLo ? uLo : u > uHi ? uHi : u;
    const point = add(o, scale(d, best.t));
    const surface = S.triSurface[k] ? 'medial' : 'convexity';
    const owners = seg._owners[S.hemisphere];
    const hemi = seg.hemispheres[S.hemisphere];
    let s = u;
    const medialRule = surface === 'medial' && owners && owners.medial && hemi.medial;
    if (medialRule) {
      const md = hemi.medial;
      const w0 = (md.zTop - point[2]) / (md.zTop - md.zBottom), w = w0 < 0 ? 0 : w0 > 1 ? 1 : w0;
      s = md.sLo + (md.sHi - md.sLo) * (1 - w);
    }
    // R558 (Message 18): the region is the owner of the gaze POINT's strip coordinate (the segmentation's own rule per
    // point instead of per triangle centre), as the renderer draws the areas per fragment (ns-scene-three REGION_BORDER);
    // a point in a map gap keeps its triangle's assignment, as drawn.
    const pointList = owners ? (medialRule ? owners.medial : owners.all) : null;
    const pointOwner = pointList ? regionOwnerAt(pointList, s, seg.options.gapTolU) : null;
    let ri = pointOwner && Number.isInteger(pointOwner.index) ? pointOwner.index : S.triRegion[k];
    if (activeRegionId !== null && owners) {
      const active = seg.regionById.get(activeRegionId);
      const list = medialRule ? owners.medial : owners.all;
      if (active && list.includes(active) && (ri < 0 || seg.regions[ri] !== active)) {
        const g = seg.options.gapTolU;
        for (const delta of [0, hysteresisU, -hysteresisU, hysteresisU / 2, -hysteresisU / 2]) {
          if (regionOwnerAt(list, s + delta, g) === active) { ri = active.index; break; }
        }
      }
    }
    if (ri < 0) {
      return regionResult('glass', { hemisphere: S.hemisphere, u, s, surface, meshId: S.id, point, t: best.t, via: 'strip' });
    }
    const region = seg.regions[ri];
    const act = regionActionAt(region, u, s, { activeActionId, hysteresisU, hysteresisActionU });
    const list = medialRule ? owners.medial : owners ? owners.all : [];
    return regionResult('region', {
      regionId: region.id, hemisphere: S.hemisphere, isLeftArm: region.isLeftArm,
      actionId: act ? (act.armActionId !== null && region.isLeftArm ? act.armActionId : act.id) : null,
      mapActionId: act ? act.id : null, armActionId: act && region.isLeftArm ? act.armActionId : null,
      u, s, surface, meshId: S.id, point, t: best.t, via: 'strip', label: region.label, bodySide: region.bodySide, effector: region.effector,
      overlaps: list.filter(r => r !== region && s >= r.extent[0] && s <= r.extent[1]).map(r => r.id)
    });
  }
  if (seg.glassGrid) {
    const t = rayBrainGrid(o, d, seg.glassGrid);
    if (t !== null) return regionResult('glass', { point: add(o, scale(d, t)), t, via: 'grid' });
  }
  return regionResult('empty', {});
}

// ---------------------------------------------------------------------------------------------
// Brain view math: default tilt, orbit about the locked brain centre, grab carry about the player, framing.

/** Brain view constants.
 *  tiltDeg 25: the default view is overhead (looking down the superior axis, anterior toward the top of the screen)
 *    tilted 25 deg about the screen's left-right axis so the anterior brain comes toward the camera (viewpoint above
 *    and in front). Measured on FJ1801 + FJ1800 with an ID-buffer at 16:9 (regionVisibility; notes U2a-brain): the
 *    picked area of the lateral face territory (u 0.8 .. 1) rises from about 180 px per hemisphere at 0 deg to about
 *    815 px at 25 deg (x4.5), and the whole visible strip by about 30 %, because the lateral precentral gyrus runs
 *    forward and down and its crown faces antero-laterally. Beyond about 30 deg the gain flattens while the view
 *    stops reading as overhead. The anterior axis still projects straight up the screen (cos 25 = 0.91).
 *  The medial-wall (paracentral) leg/foot territory faces the midline and is seen edge-on at the default; orbiting
 *    one or two steps toward the opposite side shows it (orbit left shows the right hemisphere's medial wall).
 *  orbitStepDeg / orbitYawLimitDeg / orbitPitchLimitDeg: Google-Earth-style orbit about the locked brain centre;
 *    yaw > 0 moves the viewpoint toward screen right (subject right), pitch > 0 toward the front (anterior, screen top).
 *  fill / compactFill / compactAspect: projected half-extent (NDC) of both strips in the limiting dimension.
 *  aimDistance: metres from the camera to the strips' top plane at the default view.
 *  reachM: camera-to-fingertip bound of the left arm (>= ns-arm REACH_STATE_MAX_DEPTH = 1.0 m); clearanceM: extra gap.
 *    frameBrain scales the whole brain outward (projection unchanged) until every brain point stays at least
 *    reachM + clearanceM from the camera for every orbit within the limits and every grab carry.
 *  grabPitchLimitDeg: the carried brain's elevation is clamped to +- this.
 *
 * Round 3 (R3-brain, design decision D1 "optimal overview"; evidence in round3/R3-brain-NOTES.md):
 *  framing 'brain' (new default): frameBrain fits the WHOLE brain's silhouette (all brain meshes, both hemispheres),
 *    not just the two strips, into the usable screen area (free of the far-right info column / portrait bottom band
 *    and the top limits line), so the brain reads as a whole brain seen from above (front at the top, the midline gap,
 *    front and back ends visible) while the motor belt stays as wide as that allows. The round-2 rule (both strips
 *    fill 0.85 of the view, which overflowed the brain's glass far beyond the screen) is kept as framing 'strips'.
 *  tiltDeg 35 (was 25): see the notes' tilt sweep (the lateral-most face regions of BOTH hemispheres become reachable
 *    at the default orbit, the motor belt faces the player more, the view still reads as overhead with the front up).
 *  facing true: the brain's default orientation is defined relative to the line of sight from the player to the
 *    brain centre (yaw/pitch toward it), not to the straight-ahead axis. The brain sits left of the screen centre (it
 *    avoids the far-right panel); without facing the player saw it from its right side, which hid the left
 *    hemisphere's lateral-most areas. With facing it looks exactly like the centred overhead view, front still up.
 *  heightFill: the brain silhouette spans at most this fraction of the usable height (0.96: front and back ends
 *    inside the view with a small margin).
 *  comfortDeg: every brain point and every orbit arrow can be put under the crosshair with |yaw| and |pitch| at or
 *    below this (D1 c/d: comfortable looks). On a 16:9 screen with the 70 deg vertical FOV a 40 deg yaw reaches only
 *    NDC |x| <= 0.674 (the horizontal FOV is about 102 deg), so this limits the usable width.
 *  arrowGapFrac / arrowSizePx / refHeightPx: room kept beside the silhouette for the orbit arrows: a gap of this
 *    fraction of the view width ("a centimetre or a few", D1 d: 2-6 %) plus the button (arrowSizePx CSS px; the view
 *    height in CSS px is refHeightPx when the caller does not pass viewportPx).
 *  topReservePx: the always-visible limits line at the top of the view.
 *  centreShare: when frameBrain gets no usableNdc it infers the usable area from centreNdc with the ns-app
 *    brainCentreForPanel convention (centre = share x the free area's centre offset). Pass usableNdc to avoid it.
 *  arrowsOnScreen false: the forward / back arrows may sit just beyond the top / bottom screen edge (a look of at most
 *    comfortDeg reaches them), so the brain can be about 25 % larger on a 16:9 screen; true keeps all four arrows inside
 *    the view at the default look (smaller brain). Evidence for both in the notes.
 *  R3-fix (review F1 / B1, decision recorded in round3/FIX-REPORT.md): fit 'belt' (default) sizes the brain by the
 *    MOTOR BELT, not the whole outline: the belt (both precentral strips) spans beltFrac (0.62: D1(b) asks >= 0.6) of the usable width,
 *    its centre sits beltCentreShare (0.4) of the way from the screen centre (the crosshair) toward the usable area's
 *    centre, and vertically as close to the crosshair as the brain allows: the back of the brain stays inside the usable
 *    area and at most frontCropMax (0.12) of the brain's on-screen height may pass the top edge (the front end is cut by
 *    at most that much; D1(a) "most of the front end"). When that limit binds (wide screens: the usable height is what
 *    limits a front-up brain), the belt is as wide as the limit allows. fit 'brain' is the round-3 whole-outline fit.
 *    (Round 3 kept tilt 35 with frontCropMax 0.12: the smallest tilt at which all 44 regions stayed reachable within
 *    40 deg on nine screens with the eye about 0.8 brain lengths from the brain centre; superseded by R4-view below.)
 * R4-view (round-4 decision D5 "framing with less perspective"; evidence in round4/R4-view-NOTES.md):
 *  perspectiveK 6: the brain is drawn as an eye perspectiveK times farther away would see it through a perspectiveK
 *    times zoom (about 4.4 brain lengths instead of 0.8 at 16:9), so its on-screen size is unchanged and the near-eye
 *    perspective that hid the back of the brain and the lateral slivers is gone. It is done by squashing the brain
 *    along the line of sight about its centre (brainViewTransform); every ray from the eye then meets the squashed
 *    brain exactly where the matching ray from the far eye meets the real brain, so the picture, the gaze picking and
 *    the silhouette are those of the real brain seen from afar. (Moving the brain k times farther AND scaling it by k
 *    is a similarity about the eye and changes nothing on screen; that is what aimDistance and the clearance scale-up
 *    already do.) Lighting: the scene's normals become those of the squashed shape (flatter shading) unless it uses
 *    view.rotation for normals (wiring in the notes).
 *  tiltDeg 0 (was 35): straight overhead, front up. With the far eye this keeps all 44 regions within 40 deg at the
 *    default orbit on all nine screens (worst 31.7 deg at 1280x720) and shows BOTH the front and the back end and the
 *    lobes behind the motor strip; any forward tilt hides the back end again (0.52 of its top-down share at 5 deg).
 *  frontCropMax 0.03 (was 0.12): at most 3 % of the brain's height may pass the top edge, so the front end stays
 *    visible. On height-bound screens (16:9, 21:9) the belt is then 0.54 / 0.35 of the usable width (round 3: 0.62 /
 *    0.40): the lead's D5 order puts "both ends visible" above "belt >= 0.60" and no framing found meets both there.
 *    (Round-4 values kept as BRAIN_VIEW_R4 for comparison: frameBrain(seg, { ...BRAIN_VIEW_R4 }).)
 * R5-bigbrain (round 5; the user's note of 2026-11-08T23:40Z, requirement R25: "make the brain much larger so that the
 * motor areas take up more of the focus of the screen. In fact, the motor areas should fill most of the screen. But of
 * course you'll be able to move around and see the rest of the brain and drag it around."; lead thresholds and the
 * measurements in round5/R5-bigbrain-NOTES.md):
 *  fit 'motor' (new default): the MOTOR AREAS (the motor belt: every motor region of both hemispheres) are framed, not
 *    the whole brain. The belt's box is centred on motorCentreNdc (the crosshair, [0, 0]) and sized so that its part
 *    inside the usable area spans motorFrac of the usable width, capped so that (a) the belt's two lateral ends stay
 *    within a look of motorEdgeDeg from straight ahead (each end region keeps a part within the comfortDeg look range)
 *    and on the screen (motorMarginPx), and (b) the belt's whole height stays inside the usable height (motorMarginPx
 *    off its top and bottom; in portrait the belt is moved up or down only as far as that needs). The brain's front and
 *    back ends (and on narrow screens its sides) MAY leave the screen at the default view: this supersedes the round-4
 *    rule "both ends visible" (D5 priority 2); looking around, the orbit arrows and Space-drag show the rest.
 *    beltFit then reports { fit: 'motor', motorFrac, beltWidthFrac (inside the usable width), beltCentreNdc, limiting,
 *    endsOffNdc { front, back, left, right } (how far the outline passes each usable edge, NDC, <= 0 = inside) }.
 *    R558 (motor strip fills the view; the user: "should take up the entire view from top to bottom of screen and left
 *    to right of screen ... so there is more cursor area for fine motor control"): motorFrac 0.82 -> 1, the look limit
 *    motorEdgeDeg 40 -> 80 (it no longer binds on a normal window) and a side gap of motorSideFrac of the view width
 *    (0.015) on each side, so in a window that is width-limited the left-most and right-most motor area end 1.5 % of
 *    the width from the screen edges; a very wide window is height-limited instead (motorMarginPx off the top and the
 *    bottom) and keeps side gaps. This is a contain fit of the strip's TRUE shape: the whole brain is brought nearer
 *    and scaled uniformly (frame.k), the strip is never moved, stretched or reshaped on the brain (a display choice).
 *    perspectiveK 6 -> 20 (pictureAxis 'view'): at this size a nearer picture eye hid the outer (face) areas behind
 *    the curve of the hemispheres; 20 keeps all 44 motor areas in sight at the start (6, 12 and 16 were tried).
 *    The flat screen stretches the picture towards its edges, so the outer areas gain little look angle and the
 *    middle ones most (1600x900: the median area grows from about 4.8 to 9.3 degrees of look across; the thinnest
 *    slivers at the outer ends stay under 1 degree wide).
 *    R558 (user Message 43, 12 Nov: "The brain is far too big, it should only take up 50% of the width of the panorama
 *    screen view"): motorFrac 1 -> 0.475, so the WHOLE brain (its outline is a little wider than the motor belt) spans
 *    about half the width of a 16:9 view at the start; this supersedes the fill-the-view rule above.
 *  fit 'belt' (round 3 / 4) and fit 'brain' (round 3) stay available with their options.
 * R558 (the user's note of 2026-11-10: "the highlighted motor areas look far too low in the brain to be anatomically
 * realistic, the brain is probably too narrow"; measurements in DESIGN-DECISIONS.md, decision 13):
 *  What was wrong. With the 110 degree view and the motor areas filling the screen, the eye sat about 0.7 brain lengths
 *    from the brain centre (about 65 mm above the top of a 180 mm brain, in the brain's own scale). From that close the
 *    drawn outline is only the horizon of the dome: the back of the brain shrank to a thin rim just below the motor
 *    areas, the sides ended barely outside them, and the front swept far above the screen. The areas themselves were
 *    in the right place on the mesh; the picture of the brain around them was not.
 *  perspectiveK 6 (was 1): the round-4 far-eye picture again (the brain as seen from six times farther through a six
 *    times zoom), so the outline is the brain's real outline and the motor band crosses it where it does in an
 *    ordinary view from above.
 *  pictureAxis 'view' (new): the far-eye picture is laid PARALLEL TO THE SCREEN of the default look (the squash is
 *    along the straight-ahead axis, and the brain's top faces straight back at the player), instead of square to the
 *    line of sight to the brain centre. With the motor band on the crosshair that line of sight points about 22
 *    degrees above straight ahead, and a picture square to it is tilted against a 110 degree screen: its front half was
 *    stretched to several times its size (the outline reached 1.7 screen half-heights above the middle) and its back
 *    half compressed. Parallel to the screen the picture has the brain's own proportions everywhere at the default
 *    look. 'centre' is the round-4 rule (kept for comparison; it is also what perspectiveK 1 always uses). The far eye
 *    then looks along the straight-ahead axis; the brain centre is a few degrees off that axis for it (the offset on
 *    the picture divided by perspectiveK), which is why facing is not applied with 'view'.
 *  tiltDeg 0 (was 10): straight overhead, as in round 4 with the far eye. A forward tilt hides the back of the brain
 *    and pushes the motor band toward the lower edge of the outline, which is the fault being fixed. */
export const BRAIN_VIEW = freezeR2({
  tiltDeg: 0, orbitStepDeg: 15, orbitYawLimitDeg: 60, orbitPitchLimitDeg: 30,
  fill: 0.85, compactFill: 0.78, compactAspect: 1.45, aimDistance: 6,
  reachM: 1.0, clearanceM: 1.0, grabPitchLimitDeg: 75,
  framing: 'brain', facing: true, heightFill: 0.96, comfortDeg: 40,
  arrowGapFrac: 0.035, arrowSizePx: 44, refHeightPx: 720, topReservePx: 26, centreShare: 0.8, arrowsOnScreen: false,
  fit: 'motor', beltFrac: 0.62, frontCropMax: 0.03, beltCentreShare: 0.4,
  motorFrac: 0.475, motorEdgeDeg: 80, motorMarginPx: 6, motorSideFrac: 0.015, motorCentreNdc: freezeR2([0, 0]),
  perspectiveK: 20, pictureAxis: 'view'
});
/** R558: the framing of the preceding preview (near eye, 10 degree forward tilt), for comparison:
 * frameBrain(seg, { ...BRAIN_VIEW_R5 }). */
export const BRAIN_VIEW_R5 = freezeR2({ tiltDeg: 10, perspectiveK: 1, pictureAxis: 'centre' });
/** R5-bigbrain: the round-4 framing (belt-first fit, both brain ends visible), for comparison and tests:
 * frameBrain(seg, { ...BRAIN_VIEW_R4 }). */
export const BRAIN_VIEW_R4 = freezeR2({ fit: 'belt', tiltDeg: 0, perspectiveK: 6, pictureAxis: 'centre', frontCropMax: 0.03, beltFrac: 0.62, beltCentreShare: 0.4 });
/** R4-view: the round-3 framing defaults (tilt 35, no perspective change, 12 % front crop), for comparison and tests:
 * frameBrain(seg, { ...BRAIN_VIEW_R3 }). */
export const BRAIN_VIEW_R3 = freezeR2({ tiltDeg: 35, perspectiveK: 1, pictureAxis: 'centre', frontCropMax: 0.12 });

/** The round-2 strips framing defaults (frameBrain framing 'strips'): tilt 25 deg, both strips fill 0.85 (0.78 below
 * aspect 1.45) of the view, strips' top plane at 6 m. Kept for comparison and for callers that ask for it. */
export const BRAIN_VIEW_R2 = freezeR2({ tiltDeg: 25, fill: 0.85, compactFill: 0.78, compactAspect: 1.45, aimDistance: 6 });

/** Orbit step per direction, in steps of orbitStepDeg: { yaw, pitch } signs. */
export const ORBIT_DIRECTIONS = freezeR2({
  left: freezeR2({ yaw: -1, pitch: 0 }), right: freezeR2({ yaw: 1, pitch: 0 }),
  forward: freezeR2({ yaw: 0, pitch: 1 }), back: freezeR2({ yaw: 0, pitch: -1 })
});

const clampAbs = (x, lim) => (x > lim ? lim : x < -lim ? -lim : x);

/** One orbit step from `orbit` ({ yaw, pitch } in DEGREES) in direction 'left' | 'right' | 'forward' | 'back', clamped
 * to the limits. Pure; ns-actions owns the orbit state and may use this or its own equivalent. */
export function orbitStepView(orbit, dir, { orbitStepDeg = BRAIN_VIEW.orbitStepDeg, orbitYawLimitDeg = BRAIN_VIEW.orbitYawLimitDeg, orbitPitchLimitDeg = BRAIN_VIEW.orbitPitchLimitDeg } = {}) {
  const step = ORBIT_DIRECTIONS[dir];
  if (!step) throw new Error(`ns:brain_orbit: direction must be left | right | forward | back (got ${dir})`);
  const yaw = Number.isFinite(orbit && orbit.yaw) ? orbit.yaw : 0, pitch = Number.isFinite(orbit && orbit.pitch) ? orbit.pitch : 0;
  return { yaw: clampAbs(yaw + step.yaw * orbitStepDeg, orbitYawLimitDeg), pitch: clampAbs(pitch + step.pitch * orbitStepDeg, orbitPitchLimitDeg) };
}

/** Grab carry angles (RADIANS, camera yaw/pitch convention: yaw left-positive, pitch up-positive): while Space is held
 * with the gaze on the brain, the brain follows the change of look since the grab started, on top of the carry it had
 * then: { grabYaw: baseYaw + (yaw - startYaw), grabPitch: clamp(basePitch + (pitch - startPitch)) }. On release keep
 * the last values (the brain stays there). */
export function carryFromGrab({ baseYaw = 0, basePitch = 0, startYaw, startPitch, yaw, pitch, grabPitchLimitDeg = BRAIN_VIEW.grabPitchLimitDeg }) {
  for (const [k, x] of Object.entries({ baseYaw, basePitch, startYaw, startPitch, yaw, pitch })) if (!Number.isFinite(x)) throw new Error(`ns:brain_grab: ${k} must be finite`);
  return { grabYaw: baseYaw + (yaw - startYaw), grabPitch: clampAbs(basePitch + (pitch - startPitch), grabPitchLimitDeg * DEG) };
}

// 3x3 helpers, column-major [m00, m10, m20, m01, m11, m21, m02, m12, m22].
const m3 = (a) => Float64Array.from(a);
const rotX3 = a => { const c = Math.cos(a), s = Math.sin(a); return m3([1, 0, 0, 0, c, s, 0, -s, c]); };
const rotY3 = a => { const c = Math.cos(a), s = Math.sin(a); return m3([c, 0, -s, 0, 1, 0, s, 0, c]); };
const DISPLAY3 = m3([-1, 0, 0, 0, -1, 0, 0, 0, 1]);
function mul3(a, b) {
  const c = new Float64Array(9);
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) c[3 * col + row] = a[row] * b[3 * col] + a[3 + row] * b[3 * col + 1] + a[6 + row] * b[3 * col + 2];
  return c;
}
const ap3 = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const apT3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** Brain-local rotation (source difference vector -> world direction, no scale) for an orbit/tilt: Ry(-orbitYaw) .
 * Rx(tilt + orbitPitch) . DISPLAY (subject right -> screen right, anterior -> up, superior -> toward the camera). */
function localRotation(tiltDeg, orbitYawDeg, orbitPitchDeg) {
  return mul3(rotY3(-orbitYawDeg * DEG), mul3(rotX3((tiltDeg + orbitPitchDeg) * DEG), DISPLAY3));
}

/** R4-view (D5): largest accepted perspectiveK (frameBrain option / BRAIN_VIEW.perspectiveK). */
export const PERSPECTIVE_K_MAX = 20;
/** R558 (BRAIN_VIEW pictureAxis 'view'): the straight-ahead axis of the default look (the camera looks along -z). */
const VIEW_AXIS = freezeR2([0, 0, -1]);
/** R4-view (D5) squash along a line of sight: S = I + (1 / K - 1) u u^T (u = unit `dir`): lengths along u shrink by
 * 1 / K, lengths across it are unchanged. Applied about the brain centre, it makes the eye at the origin see exactly
 * what an eye K times farther away would see through a K times zoom: for any affine map the first surface hit along
 * a ray is the map of the first hit along the mapped ray, and the picture of a point at depth D + w is
 * x / (D + w / K) = K x / (K D + w). */
function squashAlong(dir, K) {
  const n = Math.hypot(dir[0], dir[1], dir[2]), u = [dir[0] / n, dir[1] / n, dir[2] / n], f = 1 / K - 1;
  const S = new Float64Array(9);
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) S[3 * col + row] = (row === col ? 1 : 0) + f * u[row] * u[col];
  return S;
}
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m; // column-major: a = m00, b = m10, c = m20, d = m01, ...
  const A = e * i - f * h, B = -(b * i - c * h), C = b * f - c * e;
  const det = a * A + d * B + g * C;
  if (!(Math.abs(det) > 0)) throw new Error('ns:brain_view: singular brain transform');
  return m3([A / det, B / det, C / det, -(d * i - g * f) / det, (a * i - g * c) / det, -(a * f - d * c) / det, (d * h - g * e) / det, -(a * h - g * b) / det, (a * e - d * b) / det]);
}
const invSquash = inv3;
/** R4-view (D5): what perspectiveK means for a frame, in plain numbers (informational). */
function perspectiveInfo(K, pivotWorld, k, box, axis = null) {
  const d = Math.hypot(pivotWorld[0], pivotWorld[1], pivotWorld[2]), lenM = k * (box.max[1] - box.min[1]);
  if (!axis) return { k: K, method: K === 1 ? 'none' : 'squash along the line of sight', centreDistanceM: d, eyeEquivalentDistanceM: K * d, zoom: K,
    brainLengthM: lenM, eyeBrainLengths: lenM > 0 ? (K * d) / lenM : null };
  // R558 pictureAxis 'view': the far eye is K times farther along the straight-ahead axis only (not along the line of
  // sight), so its distance to the brain centre is |c_perp + K c_par u|.
  const par = pivotWorld[0] * axis[0] + pivotWorld[1] * axis[1] + pivotWorld[2] * axis[2];
  const perp2 = Math.max(0, d * d - par * par), far = Math.sqrt(perp2 + K * K * par * par);
  return { k: K, method: 'squash along the straight-ahead axis of the default look (picture parallel to the screen)', centreDistanceM: d,
    eyeEquivalentDistanceM: far, zoom: K, brainLengthM: lenM, eyeBrainLengths: lenM > 0 ? far / lenM : null,
    centreOffAxisDeg: Math.atan2(Math.sqrt(perp2), K * Math.abs(par)) / DEG };
}

function stripPositionsList(input) {
  if (isSegmentation(input)) return input.strips.map(s => ({ positions: s.positions, indices: s.indices }));
  const arr = Array.isArray(input) ? input : [input];
  return arr.map(x => (x && x.positions ? { positions: x.positions, indices: x.indices || null } : { positions: x, indices: null }));
}

/** Clearance over the orbit range (shared by both framings). Sample points P_i with a radius e_i such that every brain
 * point lies within e_i of some P_i (the surface is what is nearest to an outside camera):
 *  'grid'   occupied voxel centres of a buildBrainHitGrid shell of ALL brain meshes (e = voxel half-diagonal;
 *           conservative), from `brainGrid` or the segmentation's glassGrid;
 *  'box'    a grid on the brainBounds box surface (conservative when the camera stays outside the box);
 *  'strips' the strip vertices only (exact for the strips, says nothing about the rest of the brain).
 * The orbit range is sampled every <= 5 deg; a point at radius r moves at most r * 2 sin(step / 4) between samples.
 * facing: the frame's facing rotation (null = none). Returns { bound (m, lower bound of the camera-to-brain distance
 * over the orbit limits after scaling), scaleUp (>= 1: multiply k and pivotWorld by it), basis }. Grab carry rotates
 * about the camera and preserves distances, so the bound holds for every carry too. */
// R22: private reuse of the SAME coverage samples already built by brainClearance.
// No frame JSON field, source-point dump, model advance or second grid construction.
const frameClearanceCoverage = new WeakMap();
/** Pure placement constraint, not a new physiological rule. All source sample balls
 * must stay outside the ORIGINAL reach+clearance sphere at the anatomical attachment.
 * Check the whole translation segment, so endpoints cannot tunnel through the brain. */
export function constrainBrainTranslation({ frame, transform, translation, armOrigin, movement } = {}) {
  const cover = frameClearanceCoverage.get(frame);
  if (!cover || cover.basis === 'strips') throw new Error('ns:brain_carry: complete clearance coverage unavailable');
  if (!transform || transform.k !== frame.k || !transform.matrix || transform.matrix.length !== 16 || !Array.from(transform.matrix).every(Number.isFinite)) throw new Error('ns:brain_carry: actual finite matching brain transform required');
  const tr = vec3(translation, 'actual brain translation'), origin = vec3(armOrigin, 'anatomical attachment origin'), delta = vec3(movement, 'requested brain movement');
  const pivot = vec3(transform.pivotWorld, 'actual brain pivot'), M = transform.matrix;
  // The source transform is k times rotations and optional nonexpansive squash (K>=1).
  // Thus each source sample's existing cover radius expands by at most k; no orbit margin is needed at this EXACT orbit.
  if (!(frame.k > 0 && (!Number.isFinite(frame.perspectiveK) || frame.perspectiveK >= 1))) throw new Error('ns:brain_carry: unsupported brain scale');
  const radius = frame.k * cover.radiusMm, need = frame.reachM + frame.clearanceM, R = need + radius, r2 = R * R;
  const a = delta.reduce((n, x) => n + x * x, 0);
  if (![radius, need, r2, a].every(Number.isFinite) || !(need > 0)) throw new Error('ns:brain_carry: finite original clearance required');
  let fraction = 1, before = Infinity, visits = 0;
  const each = callback => {
    for (let i = 0; i < cover.points.length; i += 3) {
      const qx = cover.points[i], qy = cover.points[i + 1], qz = cover.points[i + 2];
      const p = [M[0] * qx + M[4] * qy + M[8] * qz + pivot[0] + tr[0] - origin[0],
        M[1] * qx + M[5] * qy + M[9] * qz + pivot[1] + tr[1] - origin[1],
        M[2] * qx + M[6] * qy + M[10] * qz + pivot[2] + tr[2] - origin[2]];
      visits++; callback(p);
    }
  };
  each(p => {
    const p2 = p.reduce((n, x) => n + x * x, 0), b = p.reduce((n, x, j) => n + x * delta[j], 0), c = p2 - r2;
    if (![p2, b, c].every(Number.isFinite) || c < 0) throw new Error('ns:brain_carry: current placement violates certified original clearance');
    before = Math.min(before, Math.sqrt(p2) - radius);
    if (!(a > 0) || b >= 0) return;
    const discriminant = b * b - a * c;
    if (!Number.isFinite(discriminant)) throw new Error('ns:brain_carry: nonfinite segment clearance');
    if (discriminant > 0) {
      // Stable first entry root; c=0 and inward movement correctly gives zero.
      const first = c / (-b + Math.sqrt(discriminant));
      if (first >= 0 && first < fraction) fraction = first;
    }
  });
  let after = Infinity, safe = false, retries = 0;
  for (; retries <= 16; retries++) {
    safe = true; after = Infinity;
    each(p => {
      const b = p.reduce((n, x, j) => n + x * delta[j], 0), nearestT = a > 0 ? Math.max(0, Math.min(fraction, -b / a)) : 0;
      const nearest2 = p.reduce((n, x, j) => n + (x + nearestT * delta[j]) ** 2, 0);
      const end2 = p.reduce((n, x, j) => n + (x + fraction * delta[j]) ** 2, 0);
      if (!(Number.isFinite(nearest2) && Number.isFinite(end2) && nearest2 >= r2)) safe = false;
      after = Math.min(after, Math.sqrt(end2) - radius);
    });
    if (safe) break;
    fraction *= .5; // strict numerical fallback, no extra epsilon or weakened threshold
  }
  if (!safe) throw new Error('ns:brain_carry: bounded strict segment check refused movement');
  return { movement: delta.map(x => x * fraction), diagnostic: { kind: 'source-coverage-segment-clearance-r22-r1', basis: cover.basis,
    sampleCount: cover.points.length / 3, sourceCoverRadiusM: radius, requiredMinimumM: need, lowerBoundBeforeM: before, lowerBoundAfterM: after,
    acceptedFraction: fraction, numericalRetries: retries, sampleVisits: visits, armOriginWorldM: origin.slice(),
    scope: 'Existing source coverage at actual orbit/carry and anatomical origin; not muscle/normalmechanics/GPU/clinical qualification' } };
}

function brainClearance({ grid, brainBounds, box, list, count, pv, k, pivotWorld, facing, squash = null, tiltDeg, orbitYawLimitDeg, orbitPitchLimitDeg, reachM, clearanceM }) {
  const samples = [];
  let basis, eMm;
  if (grid && grid.kind === 'ns-brain-grid') {
    basis = 'grid';
    const { voxelMm, origin: go, dims, cells } = grid;
    const cf = Math.max(1, Math.ceil(5 / voxelMm)), vs = cf * voxelMm; // coarsen fine grids to >= 5 mm blocks (speed)
    const cd = dims.map(x => Math.ceil(x / cf));
    const coarse = new Uint8Array(cd[0] * cd[1] * cd[2]);
    for (let kk = 0; kk < dims[2]; kk++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) {
      if (cells[(kk * dims[1] + j) * dims[0] + i]) coarse[(Math.floor(kk / cf) * cd[1] + Math.floor(j / cf)) * cd[0] + Math.floor(i / cf)] = 1;
    }
    for (let kk = 0; kk < cd[2]; kk++) for (let j = 0; j < cd[1]; j++) for (let i = 0; i < cd[0]; i++) {
      if (!coarse[(kk * cd[1] + j) * cd[0] + i]) continue;
      samples.push([go[0] + (i + 0.5) * vs - pv[0], go[1] + (j + 0.5) * vs - pv[1], go[2] + (kk + 0.5) * vs - pv[2]]);
    }
    eMm = (Math.sqrt(3) / 2) * vs;
  } else if (brainBounds) {
    basis = 'box';
    const G = 8;
    for (let a = 0; a < 3; a++) for (const side of [0, 1]) for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
      const p = [0, 0, 0], b1 = (a + 1) % 3, b2 = (a + 2) % 3;
      p[a] = side ? box.max[a] : box.min[a];
      p[b1] = box.min[b1] + (box.max[b1] - box.min[b1]) * (i / G);
      p[b2] = box.min[b2] + (box.max[b2] - box.min[b2]) * (j / G);
      samples.push([p[0] - pv[0], p[1] - pv[1], p[2] - pv[2]]);
    }
    eMm = Math.hypot((box.max[0] - box.min[0]) / G, (box.max[1] - box.min[1]) / G, (box.max[2] - box.min[2]) / G) / 2;
  } else {
    basis = 'strips';
    const stride = Math.max(1, Math.floor(count / 20000));
    for (const s of list) { const p = s.positions; for (let i = 0; i < p.length; i += 3 * stride) samples.push([p[i] - pv[0], p[i + 1] - pv[1], p[i + 2] - pv[2]]); }
    eMm = 2;
  }
  if (basis !== 'strips') { // the strips themselves always count (a glass grid may have been built without them)
    const stride = Math.max(1, Math.floor(count / 6000));
    for (const s of list) { const p = s.positions; for (let i = 0; i < p.length; i += 3 * stride) samples.push([p[i] - pv[0], p[i + 1] - pv[1], p[i + 2] - pv[2]]); }
  }
  const rMax = samples.reduce((m, q) => Math.max(m, Math.hypot(q[0], q[1], q[2])), 0);
  const NY = Math.max(2, Math.ceil((2 * orbitYawLimitDeg) / 5) + 1), NP = Math.max(2, Math.ceil((2 * orbitPitchLimitDeg) / 5) + 1);
  const dYaw = (2 * orbitYawLimitDeg) / (NY - 1), dPitch = (2 * orbitPitchLimitDeg) / (NP - 1);
  let minDist = Infinity, cameraInside = false;
  const S3 = new Float64Array(3 * samples.length);
  samples.forEach((q, i) => { S3[3 * i] = q[0]; S3[3 * i + 1] = q[1]; S3[3 * i + 2] = q[2]; });
  for (let iy = 0; iy < NY; iy++) for (let ip = 0; ip < NP; ip++) {
    const L = localRotation(tiltDeg, -orbitYawLimitDeg + iy * dYaw, -orbitPitchLimitDeg + ip * dPitch);
    const Q = facing ? mul3(facing, L) : L;
    if (!squash) {
      // camera position in pivot-centred brain mm: c = -Q^T pivotWorld / k; distance (mm) to each sample = |q - c|
      const c = apT3(Q, [-pivotWorld[0] / k, -pivotWorld[1] / k, -pivotWorld[2] / k]);
      if (basis === 'box' && c.every((x, a) => x + pv[a] > box.min[a] && x + pv[a] < box.max[a])) cameraInside = true;
      for (let i = 0; i < S3.length; i += 3) {
        const dx = S3[i] - c[0], dy = S3[i + 1] - c[1], dz = S3[i + 2] - c[2];
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < minDist) minDist = dd;
      }
      continue;
    }
    // R4-view (D5): with the squash along the line of sight the map is not a similarity: measure each sample's world
    // distance directly, in mm units (w / k = pivotWorld / k + S Q q). S only shortens vectors, so the sampling margin
    // below (radius e_i and the orbit step) still bounds every brain point.
    const M = mul3(squash, Q), c0 = [pivotWorld[0] / k, pivotWorld[1] / k, pivotWorld[2] / k];
    if (basis === 'box') { // the eye in brain mm (the squash's inverse stretches the line of sight by K)
      const Mi = mul3(tr3(Q), invSquash(squash)), e = ap3(Mi, [-c0[0], -c0[1], -c0[2]]);
      if (e.every((x, a) => x + pv[a] > box.min[a] && x + pv[a] < box.max[a])) cameraInside = true;
    }
    for (let i = 0; i < S3.length; i += 3) {
      const q0 = S3[i], q1 = S3[i + 1], q2 = S3[i + 2];
      const wx = c0[0] + M[0] * q0 + M[3] * q1 + M[6] * q2, wy = c0[1] + M[1] * q0 + M[4] * q1 + M[7] * q2, wz = c0[2] + M[2] * q0 + M[5] * q1 + M[8] * q2;
      const dd = wx * wx + wy * wy + wz * wz;
      if (dd < minDist) minDist = dd;
    }
  }
  minDist = k * Math.sqrt(minDist);
  if (cameraInside) throw new Error('ns:brain_frame: with the box clearance basis the camera falls inside the brain bounds for some orbit (scale-invariant); pass brainGrid (buildBrainHitGrid of the brain meshes), reduce fill or the orbit limits');
  const margin = k * (eMm + rMax * 2 * Math.sin((Math.max(dYaw, dPitch) * DEG) / 4));
  const need = reachM + clearanceM;
  let bound = minDist - margin, scaleUp = 1;
  if (!(bound > 0)) throw new Error('ns:brain_frame: the brain can reach the camera within the orbit limits (scale-invariant); reduce fill or the orbit limits');
  if (bound < need) { scaleUp = need / bound; bound = need; }
  return { bound, scaleUp, basis, coverage: { points: S3, radiusMm: eMm, basis } };
}

/**
 * ROUND-2 STRIPS FRAMING (frameBrain framing 'strips'; defaults BRAIN_VIEW_R2). Frame both hemispheres' strips for the default brain view.
 * strips: a segmentMotorStrips result, or [{ positions[, indices] }] / flat xyz arrays (source mm).
 * Options: aspect (required), fovYDeg (70), fill (default by aspect from BRAIN_VIEW_R2: compactFill below compactAspect),
 *   tiltDeg (BRAIN_VIEW_R2.tiltDeg 25), aimDistance (m), pivot (source mm; the LOCKED ORBIT CENTRE; default the centre of
 *   brainBounds, else of the brain grid's bounds, else of the strips; use the WHOLE brain: a shallow strip-level
 *   pivot swings the deep brain toward the camera when orbiting and forces a large scale-up), brainBounds ({ min, max } source mm of the whole brain, for the pivot),
 *   brainGrid (buildBrainHitGrid of ALL brain meshes: the conservative clearance basis; default the segmentation's
 *   glassGrid when present), reachM, clearanceM, orbit limits (BRAIN_VIEW names).
 * At yaw = pitch = orbit = grab = 0 the projected bounding box of every strip vertex is centred on the crosshair (or on
 * centreNdc [x, y]: e.g. [0, -0.1] lowers the strips away from the hand at NDC y +0.5) with half-extent `fill` in the
 * limiting dimension, and the strips' top plane is at aimDistance (so every strip point is at
 * least that far). Clearance: brain sample points (clearanceBasis 'grid' > 'box' > 'strips', see the code) are checked
 * over the orbit range every <= 5 deg with a conservative sampling margin; if the brain could come nearer than reachM +
 * clearanceM, the whole brain is scaled outward about the camera (k, aimDistance and the pivot position by one
 * factor), which leaves the projection unchanged. Grab carry rotates about
 * the camera and preserves distances, so the bound holds for every carry too.
 * Returns frozen { kind: 'ns-brain-frame', k (m per mm), aimDistance, pivot (source mm), pivotWorld (m, default view),
 *   tiltDeg, fill, limiting, ndcBounds, aimOnStrip, minBrainDistanceM (lower bound over the orbit limits),
 *   clearanceBasis ('grid' | 'box' | 'strips'), scaleUp, reachM, clearanceM, orbitYawLimitDeg, orbitPitchLimitDeg, grabPitchLimitDeg, fovYDeg, aspect, compact }.
 * Recompute on resize (aspect / FOV change); the pivot and tilt stay.
 */
function frameStripsR2(strips, {
  aspect, fovYDeg = 70, fill = null, tiltDeg = BRAIN_VIEW_R2.tiltDeg, aimDistance = BRAIN_VIEW_R2.aimDistance,
  pivot = null, brainBounds = null, brainGrid = null, reachM = BRAIN_VIEW.reachM, clearanceM = BRAIN_VIEW.clearanceM,
  orbitYawLimitDeg = BRAIN_VIEW.orbitYawLimitDeg, orbitPitchLimitDeg = BRAIN_VIEW.orbitPitchLimitDeg,
  grabPitchLimitDeg = BRAIN_VIEW.grabPitchLimitDeg, centreNdc = [0, 0], iterations = 14
} = {}) {
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_frame: aspect must be finite and > 0');
  if (!(Number.isFinite(fovYDeg) && fovYDeg > 0 && fovYDeg < 180)) throw new Error('ns:brain_frame: fovYDeg must be in (0, 180)');
  if (!(Number.isFinite(tiltDeg) && Math.abs(tiltDeg) < 90)) throw new Error('ns:brain_frame: tiltDeg must be finite with |tilt| < 90');
  if (!(Number.isFinite(aimDistance) && aimDistance > 0)) throw new Error('ns:brain_frame: aimDistance must be finite and > 0');
  if (!(Number.isFinite(reachM) && reachM >= 0 && Number.isFinite(clearanceM) && clearanceM >= 0)) throw new Error('ns:brain_frame: reachM and clearanceM must be finite and >= 0');
  if (!Array.isArray(centreNdc) || centreNdc.length !== 2 || !centreNdc.every(Number.isFinite) || Math.abs(centreNdc[0]) >= 1 || Math.abs(centreNdc[1]) >= 1) {
    throw new Error('ns:brain_frame: centreNdc must be [x, y] inside (-1, 1)');
  }
  const [cxT, cyT] = centreNdc;
  const compact = aspect < BRAIN_VIEW_R2.compactAspect;
  const f = fill === null ? (compact ? BRAIN_VIEW_R2.compactFill : BRAIN_VIEW_R2.fill) : fill;
  if (!(Number.isFinite(f) && f > 0 && f <= 1)) throw new Error('ns:brain_frame: fill must be in (0, 1]');
  const list = stripPositionsList(strips);
  if (list.length === 0) throw new Error('ns:brain_frame: no strip positions');
  let count = 0;
  const smin = [Infinity, Infinity, Infinity], smax = [-Infinity, -Infinity, -Infinity];
  for (const s of list) {
    const p = checkPositions(s.positions, 'strip positions');
    count += p.length / 3;
    for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) { const x = p[i + a]; if (x < smin[a]) smin[a] = x; if (x > smax[a]) smax[a] = x; }
  }
  const grid = brainGrid || (isSegmentation(strips) && strips.glassGrid ? strips.glassGrid : null);
  const gridBounds = grid && grid.kind === 'ns-brain-grid' && grid.bounds ? grid.bounds : null;
  const box = brainBounds ? { min: vec3(brainBounds.min, 'brainBounds.min'), max: vec3(brainBounds.max, 'brainBounds.max') }
    : gridBounds ? { min: [...gridBounds.min], max: [...gridBounds.max] } : { min: smin, max: smax };
  const pv = pivot ? vec3(pivot, 'pivot') : [0, 1, 2].map(a => (box.min[a] + box.max[a]) / 2);
  const Q0 = localRotation(tiltDeg, 0, 0);
  const V = new Float64Array(3 * count);
  let w = 0, zTop = -Infinity;
  for (const s of list) {
    const p = s.positions;
    for (let i = 0; i < p.length; i += 3) {
      const q = ap3(Q0, [p[i] - pv[0], p[i + 1] - pv[1], p[i + 2] - pv[2]]);
      V[w++] = q[0]; V[w++] = q[1]; V[w++] = q[2];
      if (q[2] > zTop) zTop = q[2];
    }
  }
  const t = Math.tan((fovYDeg * DEG) / 2), ta = t * aspect, D = aimDistance;
  const bounds = (k, ox, oy) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < V.length; i += 3) {
      const depth = D + k * (zTop - V[i + 2]);
      const x = (k * (V[i] - ox)) / (depth * ta), y = (k * (V[i + 1] - oy)) / (depth * t);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, x1, y0, y1 };
  };
  const half = (k, ox, oy) => { const b = bounds(k, ox, oy); return Math.max((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2); };
  const scaleFor = (ox, oy) => {
    let lo = 0, hi = 1e-3;
    while (half(hi, ox, oy) < f && hi < 1e6) { lo = hi; hi *= 2; }
    if (half(hi, ox, oy) < f) throw new Error('ns:brain_frame: the strips cannot reach this fill at this aimDistance');
    for (let i = 0; i < 64; i++) { const mid = 0.5 * (lo + hi); if (half(mid, ox, oy) < f) lo = mid; else hi = mid; }
    return 0.5 * (lo + hi);
  };
  let ox = 0, oy = 0;
  { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let i = 0; i < V.length; i += 3) { x0 = Math.min(x0, V[i]); x1 = Math.max(x1, V[i]); y0 = Math.min(y0, V[i + 1]); y1 = Math.max(y1, V[i + 1]); } ox = (x0 + x1) / 2; oy = (y0 + y1) / 2; }
  let k = scaleFor(ox, oy);
  for (let it = 0; it < iterations; it++) {
    const b = bounds(k, ox, oy);
    const cx = (b.x0 + b.x1) / 2 - cxT, cy = (b.y0 + b.y1) / 2 - cyT;
    if (Math.abs(cx) < 1e-9 && Math.abs(cy) < 1e-9) break;
    ox += (cx * D * ta) / k; oy += (cy * D * t) / k;
    k = scaleFor(ox, oy);
  }
  const b = bounds(k, ox, oy);
  // Does the crosshair ray hit a strip at the default view? (L-space vertical through (ox, oy).)
  let aimOnStrip = false;
  {
    const oL = [ox, oy, zTop + 10];
    const down = [0, 0, -1];
    outer: for (const s of list) {
      if (!s.indices) continue;
      const p = s.positions, I = s.indices;
      const L = i => ap3(Q0, [p[3 * i] - pv[0], p[3 * i + 1] - pv[1], p[3 * i + 2] - pv[2]]);
      for (let q = 0; q < I.length; q += 3) {
        const A = L(I[q]), B = L(I[q + 1]), C = L(I[q + 2]);
        if (Math.max(A[0], B[0], C[0]) < ox || Math.min(A[0], B[0], C[0]) > ox || Math.max(A[1], B[1], C[1]) < oy || Math.min(A[1], B[1], C[1]) > oy) continue;
        if (rayTriangle(oL, down, A, B, C) !== null) { aimOnStrip = true; break outer; }
      }
    }
  }
  let pivotWorld = [-k * ox, -k * oy, -D - k * zTop];
  const cl = brainClearance({ grid, brainBounds, box, list, count, pv, k, pivotWorld, facing: null, tiltDeg, orbitYawLimitDeg, orbitPitchLimitDeg, reachM, clearanceM });
  const { basis, scaleUp, bound } = cl;
  k *= scaleUp; pivotWorld = pivotWorld.map(x => x * scaleUp);
  const frame = freezeR2({
    kind: 'ns-brain-frame', k, aimDistance: D * scaleUp, pivot: freezeR2(pv), pivotWorld: freezeR2(pivotWorld), tiltDeg, fill: f,
    limiting: (b.x1 - b.x0) >= (b.y1 - b.y0) ? 'width' : 'height', ndcBounds: freezeR2({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }),
    aimOnStrip, minBrainDistanceM: bound, clearanceBasis: basis, scaleUp, reachM, clearanceM, orbitYawLimitDeg, orbitPitchLimitDeg, grabPitchLimitDeg,
    fovYDeg, aspect, compact, framing: 'strips', facing: null
  });
  frameClearanceCoverage.set(frame, cl.coverage);
  return frame;
}

// ---------------------------------------------------------------------------------------------
// Round 3 (R3-brain): whole-brain framing (D1), camera-facing orientation, outline points

/** Unit vectors spread evenly over the sphere (Fibonacci lattice), flat xyz. */
function sphereDirections(n) {
  const out = new Float64Array(3 * n), g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n, r = Math.sqrt(Math.max(0, 1 - z * z)), a = g * i;
    out[3 * i] = r * Math.cos(a); out[3 * i + 1] = r * Math.sin(a); out[3 * i + 2] = z;
  }
  return out;
}

/** brainOutlinePoints defaults: support directions (all vertices are used; see the notes for the accuracy sweep). */
export const OUTLINE = freezeR2({ directions: 1024, beltDirections: 256, blockSize: 64 });

/**
 * Outline (support) points of brain meshes, for silhouettes. For each of `directions` unit vectors spread evenly over
 * the sphere, the vertex furthest along it, over EVERY vertex. These are vertices of the meshes' 3-D convex hull, so the
 * convex hull of their projection is the convex hull of the projected meshes from any camera outside the brain, up to
 * a small shortfall from the finite direction set (measured against the exact hull of all 178,743 brain vertices: at
 * most about 0.6 mm of brain at 1024 directions; brainSilhouette adds a 1 mm safety margin). Exact and fast: runs of
 * blockSize consecutive vertices carry a bounding sphere, and a run is scanned for a direction only when its sphere can
 * beat the best value found so far (about 15-25 ms for the 59 brain meshes in Node; segmentMotorStrips does it once
 * when it gets glassMeshes).
 * meshes: [{ positions }] or flat xyz arrays (source mm).
 * Returns frozen { kind: 'ns-brain-outline', points (Float64Array xyz, source mm), count, directions, vertices,
 *   centre (bounding-box centre, source mm) }.
 */
export function brainOutlinePoints(meshes, { directions = OUTLINE.directions, blockSize = OUTLINE.blockSize } = {}) {
  if (!(Number.isInteger(directions) && directions >= 8)) throw new Error('ns:brain_outline: directions must be an integer >= 8');
  if (!(Number.isInteger(blockSize) && blockSize >= 1)) throw new Error('ns:brain_outline: blockSize must be an integer >= 1');
  const list = [];
  for (const m of Array.from(meshes || [])) {
    const p = m && m.positions ? m.positions : m;
    if (p && typeof p.length === 'number' && p.length >= 3) list.push(checkPositions(p, 'outline positions'));
  }
  if (list.length === 0) throw new Error('ns:brain_outline: no mesh positions');
  let vertices = 0, nb = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of list) {
    vertices += p.length / 3; nb += Math.ceil(p.length / 3 / blockSize);
    for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) { const x = p[i + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; }
  }
  const c = [0, 1, 2].map(a => (lo[a] + hi[a]) / 2);
  // runs of consecutive vertices with a bounding sphere (centre relative to c)
  const bc = new Float64Array(3 * nb), br = new Float64Array(nb), bm = new Int32Array(nb), b0 = new Int32Array(nb), b1 = new Int32Array(nb);
  let nbk = 0;
  for (let mi = 0; mi < list.length; mi++) {
    const p = list[mi], n = p.length / 3;
    for (let s0 = 0; s0 < n; s0 += blockSize, nbk++) {
      const e = Math.min(n, s0 + blockSize);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let v = s0; v < e; v++) { const x = p[3 * v], y = p[3 * v + 1], z = p[3 * v + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
      let r2 = 0;
      for (let v = s0; v < e; v++) { const dx = p[3 * v] - cx, dy = p[3 * v + 1] - cy, dz = p[3 * v + 2] - cz; const q = dx * dx + dy * dy + dz * dz; if (q > r2) r2 = q; }
      bc[3 * nbk] = cx - c[0]; bc[3 * nbk + 1] = cy - c[1]; bc[3 * nbk + 2] = cz - c[2]; br[nbk] = Math.sqrt(r2); bm[nbk] = mi; b0[nbk] = s0; b1[nbk] = e;
    }
  }
  const D = sphereDirections(directions);
  const seen = new Set(), out = [];
  for (let d = 0; d < directions; d++) {
    const ux = D[3 * d], uy = D[3 * d + 1], uz = D[3 * d + 2];
    let L = -Infinity; // a lower bound of the support value: some vertex of each run lies at least centre.u - r along u
    for (let k = 0; k < nb; k++) { const v = bc[3 * k] * ux + bc[3 * k + 1] * uy + bc[3 * k + 2] * uz - br[k]; if (v > L) L = v; }
    let best = -Infinity, bestMesh = -1, bestAt = -1;
    for (let k = 0; k < nb; k++) {
      if (bc[3 * k] * ux + bc[3 * k + 1] * uy + bc[3 * k + 2] * uz + br[k] < Math.max(L, best)) continue;
      const p = list[bm[k]];
      for (let v = b0[k]; v < b1[k]; v++) {
        const val = (p[3 * v] - c[0]) * ux + (p[3 * v + 1] - c[1]) * uy + (p[3 * v + 2] - c[2]) * uz;
        if (val > best) { best = val; bestMesh = bm[k]; bestAt = 3 * v; }
      }
    }
    const key = `${bestMesh}:${bestAt}`;
    if (bestMesh < 0 || seen.has(key)) continue;
    seen.add(key);
    const p = list[bestMesh];
    out.push(p[bestAt], p[bestAt + 1], p[bestAt + 2]);
  }
  return freezeR2({ kind: 'ns-brain-outline', points: Float64Array.from(out), count: out.length / 3, directions, vertices, centre: freezeR2(c) });
}

const tr3 = m => m3([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
/** Look angles (radians, camera convention: yaw left-positive, pitch up-positive) toward a world point from the camera
 * at the origin: the look that puts the point under the crosshair. */
export function lookAnglesToward(w) {
  const q = vec3(w, 'w');
  if (!(Math.hypot(q[0], q[1], q[2]) > 0)) throw new Error('ns:brain_input: the point must differ from the camera position');
  return { yaw: Math.atan2(-q[0], -q[2]), pitch: Math.atan2(q[1], Math.hypot(q[0], q[2])) };
}
/** Facing rotation toward a world direction: Ry(yaw) Rx(pitch) of lookAnglesToward (maps the camera's -z axis onto it,
 * no roll, so a vertical screen line stays vertical). */
function facingToward(w) {
  const a = lookAnglesToward(w);
  return { yaw: a.yaw, pitch: a.pitch, rotation: mul3(rotY3(a.yaw), rotX3(a.pitch)) };
}

/** Usable screen rect (NDC) from layout reserves in CSS px (pure; for the integrator): the view minus a reserved right
 * column (reserveRightPx measured from the right edge, e.g. width - infoPanelRect(...).x0 in the column layout), a
 * reserved bottom band (reserveBottomPx, e.g. height - infoPanelRect(...).y0 in the portrait layout), an extra gapPx
 * beside a reserved area, and the top limits line (topPx). Returns frozen { x0, x1, y0, y1 } (y up). */
export function usableNdcFromLayout({ width, height } = {}, { reserveRightPx = 0, reserveBottomPx = 0, topPx = BRAIN_VIEW.topReservePx, gapPx = 0 } = {}) {
  if (!(width > 0 && height > 0)) throw new Error('ns:brain_layout: width and height must be > 0');
  for (const [k, v] of Object.entries({ reserveRightPx, reserveBottomPx, topPx, gapPx })) if (!(Number.isFinite(v) && v >= 0)) throw new Error(`ns:brain_layout: ${k} must be finite and >= 0`);
  const r = reserveRightPx > 0 ? reserveRightPx + gapPx : 0, b = reserveBottomPx > 0 ? reserveBottomPx + gapPx : 0;
  const out = { x0: -1, x1: 1 - (2 * r) / width, y0: -1 + (2 * b) / height, y1: 1 - (2 * topPx) / height };
  if (!(out.x1 - out.x0 > 0.1 && out.y1 - out.y0 > 0.1)) throw new Error('ns:brain_layout: the reserves leave no usable area');
  return freezeR2(out);
}

/** The usable rect for frameBrain: usableNdc when given, else inferred from centreNdc (ns-app brainCentreForPanel:
 * centre = share x the free area's centre offset; the free area spans to the far edge), minus the top line. */
function usableFor({ usableNdc, centreNdc, centreShare, topNdc }) {
  if (usableNdc) {
    const u = usableNdc;
    if (![u.x0, u.x1, u.y0, u.y1].every(Number.isFinite) || !(u.x1 > u.x0 && u.y1 > u.y0)) throw new Error('ns:brain_frame: usableNdc must be { x0 < x1, y0 < y1 } finite');
    return { x0: Math.max(-1, u.x0), x1: Math.min(1, u.x1), y0: Math.max(-1, u.y0), y1: Math.min(1, u.y1), source: 'usableNdc' };
  }
  const [cx, cy] = centreNdc;
  const U = { x0: -1, x1: 1, y0: -1, y1: 1 - topNdc, source: cx === 0 && cy === 0 ? 'view' : 'centreNdc' };
  if (cx < 0) U.x1 = Math.max(-0.5, 1 + (2 * cx) / centreShare); else if (cx > 0) U.x0 = Math.min(0.5, -1 + (2 * cx) / centreShare);
  if (cy > 0) U.y0 = Math.min(0.5, -1 + (2 * cy) / centreShare); else if (cy < 0) U.y1 = Math.min(U.y1, Math.max(-0.5, 1 + (2 * cy) / centreShare));
  return U;
}

/** Outline points for a segmentation or frame input (cached per object): the segmentation's outline (all brain meshes),
 * else the glass grid's occupied voxel centres, else the brainBounds box corners, else the strips. */
const OUTLINE_CACHE = new WeakMap();
function outlineBasisFor(input, { brainOutline = null, brainGrid = null, brainBounds = null } = {}) {
  if (brainOutline) {
    const pts = brainOutline.kind === 'ns-brain-outline' ? brainOutline.points : checkPositions(brainOutline, 'brainOutline');
    return { points: pts, basis: 'outline' };
  }
  const seg = isSegmentation(input) ? input : null;
  if (seg && seg.outline && seg.outline.points) return { points: seg.outline.points, basis: 'outline' };
  const grid = brainGrid || (seg && seg.glassGrid) || null;
  const keyObj = grid || (seg || null);
  if (keyObj && OUTLINE_CACHE.has(keyObj) && !brainBounds) return OUTLINE_CACHE.get(keyObj);
  let res;
  if (grid && grid.kind === 'ns-brain-grid') {
    const { voxelMm: s, origin: go, dims, cells } = grid, pts = [];
    for (let k = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) {
      if (cells[(k * dims[1] + j) * dims[0] + i]) pts.push(go[0] + (i + 0.5) * s, go[1] + (j + 0.5) * s, go[2] + (k + 0.5) * s);
    }
    const strips = stripPositionsList(input).map(x => x.positions);
    res = { points: brainOutlinePoints([Float64Array.from(pts), ...strips]).points, basis: 'grid' };
  } else if (brainBounds) {
    const a = vec3(brainBounds.min, 'brainBounds.min'), b = vec3(brainBounds.max, 'brainBounds.max'), pts = [];
    for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) pts.push(x, y, z);
    return { points: Float64Array.from(pts), basis: 'box' };
  } else {
    res = { points: brainOutlinePoints(stripPositionsList(input).map(x => x.positions)).points, basis: 'strips' };
  }
  if (keyObj) OUTLINE_CACHE.set(keyObj, res);
  return res;
}
function beltPointsFor(input) {
  if (isSegmentation(input) && input.beltOutline && input.beltOutline.points) return input.beltOutline.points;
  const key = isSegmentation(input) ? input : null;
  if (key && OUTLINE_CACHE.has(key.strips)) return OUTLINE_CACHE.get(key.strips);
  const pts = brainOutlinePoints(stripPositionsList(input).map(x => x.positions), { directions: OUTLINE.beltDirections }).points;
  if (key) OUTLINE_CACHE.set(key.strips, pts);
  return pts;
}

/**
 * Frame the brain for the default view. framing 'brain' (default, round 3) fits the WHOLE brain's silhouette; framing
 * 'strips' is the round-2 rule (frameStripsR2 above, BRAIN_VIEW_R2 defaults: the two strips fill 0.85 of the view).
 *
 * framing 'brain' (D1 "optimal overview"):
 *  - usable area U (NDC): usableNdc when given (recommended: usableNdcFromLayout with the far-right info column or the
 *    portrait bottom band reserved), else inferred from centreNdc (the ns-app brainCentreForPanel convention, share
 *    BRAIN_VIEW.centreShare), else the whole view; minus the top limits line (topReservePx).
 *  - comfort window C: the points a look of at most comfortDeg (40) puts under the crosshair (|x| <= tan(40) / (t
 *    aspect), |y| <= tan(40) / t at the default look).
 *  - arrow room: a gap of arrowGapFrac of the view width plus the arrow button (arrowSizePx on a viewportPx.height or
 *    refHeightPx tall view) on every side of the silhouette.
 *  - the silhouette's bounding box must fit: x within U and C minus the side-arrow room (the left/right arrows stay on
 *    screen, beside the panel, within the comfortable looks); y within U, and within C minus the room for the
 *    forward/back arrows (they may sit beyond the top/bottom of the view but within a comfortable look); and the
 *    silhouette spans at most heightFill of U's height. The scale is the largest that fits; the box is centred in the
 *    allowed area.
 *  - facing (default true): the brain's tilt and orbit are defined about the line of sight to its centre (no roll), so
 *    the brain looks like the centred overhead view wherever it sits on the screen, anterior still straight up.
 *  - the nearest brain point at the default view is aimDistance (6 m) away; then the same clearance rule as before
 *    scales the whole brain outward (projection unchanged) until it stays at least reachM + clearanceM away for every
 *    orbit within the limits and every grab carry (beyond reach, in front of the hand).
 * Options (besides the 'strips' ones): framing, usableNdc, viewportPx ({ width, height } CSS px), heightFill,
 *   comfortDeg, arrowGapFrac, arrowSizePx, facing, centreShare, arrowsOnScreen, brainOutline (brainOutlinePoints result or flat xyz;
 *   default the segmentation's outline, else its glass grid, else the brainBounds box, else the strips), fit, beltFrac,
 *   frontCropMax, beltCentreShare, perspectiveK (R4-view, 1..PERSPECTIVE_K_MAX: the brain is seen as from perspectiveK
 *   times farther through a perspectiveK times zoom; the fit, the clearance and every derived view include it).
 * Returns frozen { kind: 'ns-brain-frame', framing: 'brain', k (m per mm), aimDistance, pivot, pivotWorld, tiltDeg,
 *   facing: { yawDeg, pitchDeg, rotation } | null, fill (the strips' half-extent, NDC, informational), limiting
 *   ('width' | 'height': which side of the allowed box the silhouette touches), ndcBounds (the strips' NDC box at the
 *   default view), silhouetteNdc (the brain's NDC box), usableNdc (+ source), allowedNdc, comfortNdc { x, y },
 *   arrowRoomNdc { x, y }, arrowOvershootNdc { left, right, forward, back } (<= 0: each arrow button inside its limit;
 *   checked on the real arrowAnchors), arrowsOnScreen, heightFill, comfortDeg, outlineBasis, aimOnStrip, minBrainDistanceM, clearanceBasis,
 *   scaleUp, reachM, clearanceM, orbit limits, grabPitchLimitDeg, fovYDeg, aspect, compact, fit, beltFit (belt fit:
 *   { beltFrac, frontCropMax, beltCentreShare, beltWidthFrac, frontCropFrac, perspectiveK, tiltDeg }), perspectiveK,
 *   distanceM (camera to brain centre at the default view), perspective { k, method, centreDistanceM,
 *   eyeEquivalentDistanceM, zoom, brainLengthM, eyeBrainLengths } (informational) }.
 * Recompute on resize (aspect / FOV / usable area change); the pivot and tilt stay.
 */
export function frameBrain(strips, options = {}) {
  const framing = options && options.framing !== undefined ? options.framing : BRAIN_VIEW.framing;
  if (framing === 'strips') return frameStripsR2(strips, options);
  if (framing !== 'brain') throw new Error(`ns:brain_frame: framing must be 'brain' or 'strips' (got ${framing})`);
  return frameWholeBrain(strips, options);
}

function frameWholeBrain(strips, {
  aspect, fovYDeg = 70, tiltDeg = BRAIN_VIEW.tiltDeg, aimDistance = BRAIN_VIEW.aimDistance,
  pivot = null, brainBounds = null, brainGrid = null, brainOutline = null, reachM = BRAIN_VIEW.reachM, clearanceM = BRAIN_VIEW.clearanceM,
  orbitYawLimitDeg = BRAIN_VIEW.orbitYawLimitDeg, orbitPitchLimitDeg = BRAIN_VIEW.orbitPitchLimitDeg,
  grabPitchLimitDeg = BRAIN_VIEW.grabPitchLimitDeg, centreNdc = [0, 0], usableNdc = null, viewportPx = null,
  heightFill = BRAIN_VIEW.heightFill, comfortDeg = BRAIN_VIEW.comfortDeg, arrowGapFrac = BRAIN_VIEW.arrowGapFrac,
  arrowSizePx = BRAIN_VIEW.arrowSizePx, facing = BRAIN_VIEW.facing, centreShare = BRAIN_VIEW.centreShare,
  arrowsOnScreen = BRAIN_VIEW.arrowsOnScreen, iterations = 60, fit = BRAIN_VIEW.fit, beltFrac = BRAIN_VIEW.beltFrac,
  frontCropMax = BRAIN_VIEW.frontCropMax, beltCentreShare = BRAIN_VIEW.beltCentreShare, perspectiveK = BRAIN_VIEW.perspectiveK,
  backCropMax = BRAIN_VIEW.backCropMax || 0, motorFrac = BRAIN_VIEW.motorFrac, motorEdgeDeg = BRAIN_VIEW.motorEdgeDeg,
  motorMarginPx = BRAIN_VIEW.motorMarginPx, motorSideFrac = BRAIN_VIEW.motorSideFrac, motorCentreNdc = BRAIN_VIEW.motorCentreNdc,
  pictureAxis = BRAIN_VIEW.pictureAxis
} = {}) {
  if (pictureAxis !== 'view' && pictureAxis !== 'centre') throw new Error(`ns:brain_frame: pictureAxis must be 'view' or 'centre' (got ${pictureAxis})`);
  if (!(Number.isFinite(backCropMax) && backCropMax >= 0 && backCropMax < 0.5)) throw new Error('ns:brain_frame: backCropMax must be in [0, 0.5)');
  if (!(Number.isFinite(perspectiveK) && perspectiveK >= 1 && perspectiveK <= PERSPECTIVE_K_MAX)) throw new Error(`ns:brain_frame: perspectiveK must be in [1, ${PERSPECTIVE_K_MAX}]`);
  if (fit !== 'belt' && fit !== 'brain' && fit !== 'motor') throw new Error(`ns:brain_frame: fit must be 'motor', 'belt' or 'brain' (got ${fit})`);
  if (!(Number.isFinite(motorFrac) && motorFrac > 0 && motorFrac <= 1.5)) throw new Error('ns:brain_frame: motorFrac must be in (0, 1.5]');
  if (!(Number.isFinite(motorEdgeDeg) && motorEdgeDeg > 5 && motorEdgeDeg < 89)) throw new Error('ns:brain_frame: motorEdgeDeg must be in (5, 89)');
  if (!(Number.isFinite(motorMarginPx) && motorMarginPx >= 0)) throw new Error('ns:brain_frame: motorMarginPx must be finite and >= 0');
  if (!(Number.isFinite(motorSideFrac) && motorSideFrac >= 0 && motorSideFrac < 0.2)) throw new Error('ns:brain_frame: motorSideFrac must be in [0, 0.2)');
  if (!Array.isArray(motorCentreNdc) || motorCentreNdc.length !== 2 || !motorCentreNdc.every(v => Number.isFinite(v) && Math.abs(v) < 0.9)) throw new Error('ns:brain_frame: motorCentreNdc must be [x, y] inside (-0.9, 0.9)');
  if (!(Number.isFinite(beltFrac) && beltFrac > 0 && beltFrac <= 1)) throw new Error('ns:brain_frame: beltFrac must be in (0, 1]');
  if (!(Number.isFinite(frontCropMax) && frontCropMax >= 0 && frontCropMax < 0.5)) throw new Error('ns:brain_frame: frontCropMax must be in [0, 0.5)');
  if (!(Number.isFinite(beltCentreShare) && beltCentreShare >= 0 && beltCentreShare <= 1)) throw new Error('ns:brain_frame: beltCentreShare must be in [0, 1]');
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_frame: aspect must be finite and > 0');
  if (!(Number.isFinite(fovYDeg) && fovYDeg > 0 && fovYDeg < 180)) throw new Error('ns:brain_frame: fovYDeg must be in (0, 180)');
  if (!(Number.isFinite(tiltDeg) && Math.abs(tiltDeg) < 90)) throw new Error('ns:brain_frame: tiltDeg must be finite with |tilt| < 90');
  if (!(Number.isFinite(aimDistance) && aimDistance > 0)) throw new Error('ns:brain_frame: aimDistance must be finite and > 0');
  if (!(Number.isFinite(reachM) && reachM >= 0 && Number.isFinite(clearanceM) && clearanceM >= 0)) throw new Error('ns:brain_frame: reachM and clearanceM must be finite and >= 0');
  if (!Array.isArray(centreNdc) || centreNdc.length !== 2 || !centreNdc.every(Number.isFinite) || Math.abs(centreNdc[0]) >= 1 || Math.abs(centreNdc[1]) >= 1) {
    throw new Error('ns:brain_frame: centreNdc must be [x, y] inside (-1, 1)');
  }
  if (!(Number.isFinite(heightFill) && heightFill > 0 && heightFill <= 1.5)) throw new Error('ns:brain_frame: heightFill must be in (0, 1.5]');
  if (!(Number.isFinite(comfortDeg) && comfortDeg > 5 && comfortDeg < 89)) throw new Error('ns:brain_frame: comfortDeg must be in (5, 89)');
  if (!(Number.isFinite(arrowGapFrac) && arrowGapFrac >= 0 && arrowGapFrac < 0.2 && Number.isFinite(arrowSizePx) && arrowSizePx >= 0)) throw new Error('ns:brain_frame: arrowGapFrac must be in [0, 0.2) and arrowSizePx >= 0');
  if (viewportPx !== null && !(viewportPx && viewportPx.width > 0 && viewportPx.height > 0)) throw new Error('ns:brain_frame: viewportPx must be { width, height } > 0');
  const list = stripPositionsList(strips);
  if (list.length === 0) throw new Error('ns:brain_frame: no strip positions');
  let count = 0;
  const smin = [Infinity, Infinity, Infinity], smax = [-Infinity, -Infinity, -Infinity];
  for (const s of list) {
    const p = checkPositions(s.positions, 'strip positions');
    count += p.length / 3;
    for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) { const x = p[i + a]; if (x < smin[a]) smin[a] = x; if (x > smax[a]) smax[a] = x; }
  }
  const grid = brainGrid || (isSegmentation(strips) && strips.glassGrid ? strips.glassGrid : null);
  const gridBounds = grid && grid.kind === 'ns-brain-grid' && grid.bounds ? grid.bounds : null;
  const box = brainBounds ? { min: vec3(brainBounds.min, 'brainBounds.min'), max: vec3(brainBounds.max, 'brainBounds.max') }
    : gridBounds ? { min: [...gridBounds.min], max: [...gridBounds.max] } : { min: smin, max: smax };
  const pv = pivot ? vec3(pivot, 'pivot') : [0, 1, 2].map(a => (box.min[a] + box.max[a]) / 2);
  const outline = outlineBasisFor(strips, { brainOutline, brainGrid, brainBounds: grid ? null : brainBounds });
  const beltPts = beltPointsFor(strips);
  // Layout (NDC at the default look, yaw = pitch = 0).
  const t = Math.tan((fovYDeg * DEG) / 2), ta = t * aspect;
  const hPx = viewportPx ? viewportPx.height : BRAIN_VIEW.refHeightPx;
  const U = usableFor({ usableNdc, centreNdc, centreShare, topNdc: (2 * BRAIN_VIEW.topReservePx) / hPx });
  const btnY = (2 * arrowSizePx) / hPx, btnX = btnY / aspect, gapX = 2 * arrowGapFrac, gapY = gapX * aspect;
  const roomX = gapX + btnX, roomY = gapY + btnY;
  const tc = Math.tan(comfortDeg * DEG), cX = tc / ta, cY = tc / t;
  let ax0 = Math.max(U.x0, -cX) + roomX, ax1 = Math.min(U.x1, cX) - roomX;
  let ay0 = Math.max(U.y0, -cY + roomY), ay1 = Math.min(U.y1, cY - roomY);
  // A reserved band (e.g. the portrait info band below the brain) must not get an arrow on it: the forward / back
  // arrows may only leave the usable area across a real screen edge (or the thin top line), never into a band.
  if (U.y0 > -1 + roomY) ay0 = Math.max(ay0, U.y0 + roomY);
  if (U.y1 < 1 - roomY) ay1 = Math.min(ay1, U.y1 - roomY);
  if (arrowsOnScreen) { ay0 = Math.max(ay0, U.y0 + roomY); ay1 = Math.min(ay1, U.y1 - roomY); }
  const hCap = heightFill * (U.y1 - U.y0);
  if (ay1 - ay0 > hCap) { const m = (ay0 + ay1) / 2; ay0 = m - hCap / 2; ay1 = m + hCap / 2; }
  let degenerate = false;
  if (!(ax1 - ax0 > 0.05 && ay1 - ay0 > 0.05)) { // tiny or odd viewports: fit inside 80 % of U instead
    degenerate = true;
    ax0 = U.x0 + 0.1 * (U.x1 - U.x0); ax1 = U.x1 - 0.1 * (U.x1 - U.x0); ay0 = U.y0 + 0.1 * (U.y1 - U.y0); ay1 = U.y1 - 0.1 * (U.y1 - U.y0);
  }
  // Brain-local (pivot-centred, tilted) outline and belt points.
  const L0 = localRotation(tiltDeg, 0, 0);
  const toL = pts => { const out = new Float64Array(pts.length); for (let i = 0; i < pts.length; i += 3) { const q = ap3(L0, [pts[i] - pv[0], pts[i + 1] - pv[1], pts[i + 2] - pv[2]]); out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2]; } return out; };
  const P = toL(outline.points), Bt = toL(beltPts);
  let rMax = 0;
  for (let i = 0; i < P.length; i += 3) rMax = Math.max(rMax, Math.hypot(P[i], P[i + 1], P[i + 2]));
  if (!(rMax > 0)) throw new Error('ns:brain_frame: the brain outline has no extent');
  const dirFor = (px, py) => normalize([px * ta, py * t, -1]);
  // R4-view (D5): the brain-local linear map for a line of sight `dir` (unit): the facing rotation, then the squash
  // along the line of sight by 1 / perspectiveK (squashAlong; identity for K = 1). null = identity.
  // R558 (BRAIN_VIEW pictureAxis 'view'): the squash is along the straight-ahead axis of the default look and no facing
  // rotation is applied, so the far-eye picture lies parallel to the screen. Only with a far eye (K > 1): at K = 1
  // there is no picture plane and the round-3 facing rule stands.
  const flat = pictureAxis === 'view' && perspectiveK > 1;
  const facRot = dir => (facing && !flat ? facingToward(dir).rotation : null);
  const squashFor = dir => (perspectiveK === 1 ? null : squashAlong(flat ? VIEW_AXIS : dir, perspectiveK));
  const rotFor = dir => {
    const F = facRot(dir);
    if (perspectiveK === 1) return F;
    const S = squashFor(dir);
    return F ? mul3(S, F) : S;
  };
  const projBox = (pts, s, dir, F) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, near = Infinity, minDepth = Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      const q = F ? ap3(F, [pts[i], pts[i + 1], pts[i + 2]]) : [pts[i], pts[i + 1], pts[i + 2]];
      const wx = dir[0] + s * q[0], wy = dir[1] + s * q[1], wz = dir[2] + s * q[2];
      const depth = -wz, x = wx / (depth * ta), y = wy / (depth * t);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const d = Math.hypot(wx, wy, wz); if (d < near) near = d;
      if (depth < minDepth) minDepth = depth;
    }
    return { x0, x1, y0, y1, near, minDepth };
  };
  const sMax = 0.6 / rMax; // keeps every point well in front of the camera (the centre direction is within the comfort window)
  let s = 0.25 / rMax, px = 0, py = 0, b = null, limiting = 'height';
  const solve = () => { // the largest scale whose silhouette box fits [ax0, ax1] x [ay0, ay1], centred in it
    px = (ax0 + ax1) / 2; py = (ay0 + ay1) / 2;
    for (let it = 0; it < iterations; it++) {
      const dir = dirFor(px, py);
      b = projBox(P, s, dir, rotFor(dir));
      const rx = (ax1 - ax0) / (b.x1 - b.x0), ry = (ay1 - ay0) / (b.y1 - b.y0);
      limiting = rx < ry ? 'width' : 'height';
      const r = Math.min(rx, ry), dx = (ax0 + ax1) / 2 - (b.x0 + b.x1) / 2, dy = (ay0 + ay1) / 2 - (b.y0 + b.y1) / 2;
      if (Math.abs(r - 1) < 1e-10 && Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) break;
      s = Math.min(sMax, s * r); px += dx; py += dy;
    }
  };
  // Close the loop on the REAL arrow anchors (brainSilhouette + arrowAnchors on this outline, as the scene places them):
  // they sit on the brain's own axes at the gap from the margin-padded hull, which can need a little more room than the
  // box estimate. Any overshoot past its limit shrinks the allowed box on that side, then the fit is solved again.
  const limX0 = Math.max(U.x0, -cX), limX1 = Math.min(U.x1, cX);
  const limY1 = Math.min(cY, U.y1 < 1 - roomY || arrowsOnScreen ? U.y1 : Infinity);
  const limY0 = Math.max(-cY, U.y0 > -1 + roomY || arrowsOnScreen ? U.y0 : -Infinity);
  let arrowOvershoot = null, beltFit = null;
  // R3-fix: belt-first fit (see BRAIN_VIEW). The orbit arrows are placed by the scene around the drawn silhouette
  // (ns-scene-three placeOrbitArrows: side, corner or just past a screen edge within a comfortable look), so this fit
  // does not run the arrowAnchors loop below.
  const solveBelt = () => {
    const Uw = U.x1 - U.x0, Uh = U.y1 - U.y0, cxT = beltCentreShare * (U.x0 + U.x1) / 2;
    const sMaxBelt = 0.9 / rMax; // every brain point stays at least 0.1 of the centre distance in front of the eye
    s = 0.25 / rMax; px = cxT; py = 0;
    let converged = false;
    for (let it = 0; it < 12 * iterations; it++) {
      const dir = dirFor(px, py), F = rotFor(dir);
      const o = projBox(P, s, dir, F), bb = projBox(Bt, s, dir, F);
      const oh = o.y1 - o.y0, ow = o.x1 - o.x0;
      const rB = (beltFrac * Uw) / (bb.x1 - bb.x0), rH = Uh / ((1 - frontCropMax - backCropMax) * oh), rW = Uw / ow;
      const r = Math.min(rB, rH, rW);
      limiting = r === rB ? 'belt' : r === rH ? 'height' : 'width';
      let dy = -(bb.y0 + bb.y1) / 2; // belt centre toward the crosshair (y = 0) ...
      const topOver = o.y1 + dy - U.y1, lim = frontCropMax * oh;
      if (topOver > lim) dy -= topOver - lim; // ... but the front may pass the top edge by at most frontCropMax
      const botOver = U.y0 - (o.y0 + dy), botLim = backCropMax * oh;
      if (botOver > botLim) dy += botOver - botLim; // ... and the back passes the bottom edge by at most backCropMax
      let dx = cxT - (bb.x0 + bb.x1) / 2;
      if (o.x1 + dx > U.x1) dx -= o.x1 + dx - U.x1;
      if (o.x0 + dx < U.x0) dx += U.x0 - (o.x0 + dx);
      if (Math.abs(r - 1) < 1e-7 && Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7) { converged = true; break; }
      s = Math.min(sMaxBelt, s * Math.pow(r, 0.8)); px += 0.8 * dx; py += 0.8 * dy;
    }
    return converged;
  };
  // R5-bigbrain (R25): motor-first fit (see BRAIN_VIEW fit 'motor'). The belt box is centred on motorCentreNdc and its
  // part inside the usable area spans motorFrac of the usable width, capped by the lateral look limit (motorEdgeDeg), the
  // screen (motorMarginPx) and the usable height; the outline may leave the screen (the ends are shown by looking, the
  // orbit arrows and Space-drag).
  let motorInfo = null;
  const solveMotor = () => {
    const Uw = U.x1 - U.x0, [cxT, cyT] = motorCentreNdc, target = motorFrac * Uw;
    const myN = (2 * motorMarginPx) / hPx, mxN = Math.max(myN / aspect, 2 * motorSideFrac);
    const edgeX = Math.min(1 - mxN, Math.tan(motorEdgeDeg * DEG) / ta);
    // The belt stays inside the usable width (R558: in landscape the whole view, less motorSideFrac of the width on each
    // side; in portrait above the bottom band) and within the lateral look limit; its centre is as near
    // motorCentreNdc as that allows.
    const lx0 = Math.max(-edgeX, U.x0 + mxN), lx1 = Math.min(edgeX, U.x1 - mxN), ly0 = U.y0 + myN, ly1 = U.y1 - myN;
    if (!(lx1 - lx0 > 0.1 && ly1 - ly0 > 0.05)) return false;
    // R5-bigbrain: with the squash (perspectiveK) the brain is thin along the line of sight, so it may span a wider
    // angle than the round-4 cap (0.9 / rMax) while every point stays well in front of the eye (checked: minDepth).
    const sMaxM = (0.9 * perspectiveK) / rMax;
    s = 0.25 / rMax; px = cxT; py = cyT;
    let converged = false, inW = 0, why = 'belt';
    for (let it = 0; it < 16 * iterations; it++) {
      const dir = dirFor(px, py), F = rotFor(dir);
      const bb = projBox(Bt, s, dir, F);
      inW = Math.max(1e-9, Math.min(U.x1, bb.x1) - Math.max(U.x0, bb.x0));
      const wid = bb.x1 - bb.x0, hgt = bb.y1 - bb.y0;
      const rB = target / inW, rX = (lx1 - lx0) / wid, rY = (ly1 - ly0) / hgt;
      const r = Math.min(rB, rX, rY);
      why = r === rB ? 'belt' : r === rX ? (lx1 < edgeX - 1e-9 || lx0 > -edgeX + 1e-9 ? 'usable' : 'edge') : 'height';
      let dx = cxT - (bb.x0 + bb.x1) / 2, dy = cyT - (bb.y0 + bb.y1) / 2;
      if (bb.x1 + dx > lx1) dx -= bb.x1 + dx - lx1; // the whole belt inside the usable width and the look limit
      if (bb.x0 + dx < lx0) dx += lx0 - (bb.x0 + dx);
      if (bb.y1 + dy > ly1) dy -= bb.y1 + dy - ly1; // the belt's whole height stays inside the usable height
      if (bb.y0 + dy < ly0) dy += ly0 - (bb.y0 + dy);
      if (Math.abs(r - 1) < 1e-7 && Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7) { converged = true; break; }
      s = Math.min(sMaxM, s * Math.pow(r, 0.8)); px += 0.8 * dx; py += 0.8 * dy;
    }
    if (!converged) return false;
    const dir = dirFor(px, py), F = rotFor(dir), o = projBox(P, s, dir, F), bb = projBox(Bt, s, dir, F);
    if (!(o.minDepth > 0.1)) return false; // every brain point well in front of the eye (else the whole-brain fit)
    motorInfo = {
      fit: 'motor', motorFrac, motorEdgeDeg, motorMarginPx, motorCentreNdc: [cxT, cyT], limiting: why,
      beltInUsableNdc: Math.min(U.x1, bb.x1) - Math.max(U.x0, bb.x0), beltCentreNdc: [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2],
      beltBoxNdc: { x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: bb.y1 },
      endsOffNdc: { front: o.y1 - U.y1, back: U.y0 - o.y0, left: U.x0 - o.x0, right: o.x1 - U.x1 }
    };
    return true;
  };
  if (fit === 'belt' && !degenerate && solveBelt()) beltFit = { beltFrac, frontCropMax, beltCentreShare };
  else if (fit === 'motor' && !degenerate && solveMotor()) { beltFit = { ...motorInfo }; limiting = motorInfo.limiting; }
  for (let round = 0; !beltFit && round < 6; round++) {
    solve();
    const dirR = dirFor(px, py), FR = facRot(dirR);
    const probe = { kind: 'ns-brain-frame', k: s, pivot: pv, pivotWorld: dirR, tiltDeg, facing: FR ? { rotation: Array.from(FR) } : null, perspectiveK, squashAxis: flat ? VIEW_AXIS : null, orbitYawLimitDeg, orbitPitchLimitDeg, grabPitchLimitDeg };
    const sil = brainSilhouette(null, brainViewTransform({ frame: probe }), { aspect, fovYDeg, points: outline.points });
    const an = arrowAnchors(sil, { gapFrac: arrowGapFrac, sizePx: arrowSizePx, viewportPx: { width: hPx * aspect, height: hPx } });
    const hx = an.radiusNdc / aspect, hy = an.radiusNdc;
    arrowOvershoot = { left: limX0 - (an.left.xNdc - hx), right: an.right.xNdc + hx - limX1, forward: an.forward.yNdc + hy - limY1, back: limY0 - (an.back.yNdc - hy) };
    if (Math.max(...Object.values(arrowOvershoot)) <= 1e-6 || degenerate) break;
    const pad = 1e-4;
    if (arrowOvershoot.left > 0) ax0 += arrowOvershoot.left + pad;
    if (arrowOvershoot.right > 0) ax1 -= arrowOvershoot.right + pad;
    if (arrowOvershoot.forward > 0) ay1 -= arrowOvershoot.forward + pad;
    if (arrowOvershoot.back > 0) ay0 += arrowOvershoot.back + pad;
    if (!(ax1 - ax0 > 0.05 && ay1 - ay0 > 0.05)) break;
  }
  const dir = dirFor(px, py), F = rotFor(dir);
  b = projBox(P, s, dir, F);
  const bb = projBox(Bt, s, dir, F);
  const dist = aimDistance / b.near; // the nearest brain point at the default view is aimDistance away
  let k = s * dist, pivotWorld = dir.map(x => x * dist);
  const cl = brainClearance({ grid, brainBounds, box, list, count, pv, k, pivotWorld, facing: facRot(dir), squash: squashFor(dir), tiltDeg, orbitYawLimitDeg, orbitPitchLimitDeg, reachM, clearanceM });
  k *= cl.scaleUp; pivotWorld = pivotWorld.map(x => x * cl.scaleUp);
  const fa = facing && !flat ? facingToward(dir) : null;
  const frame = {
    kind: 'ns-brain-frame', framing: 'brain', k, aimDistance: aimDistance * cl.scaleUp, pivot: freezeR2(pv), pivotWorld: freezeR2(pivotWorld), tiltDeg,
    facing: fa ? freezeR2({ yawDeg: fa.yaw / DEG, pitchDeg: fa.pitch / DEG, rotation: freezeR2(Array.from(fa.rotation)) }) : null,
    fill: Math.max((bb.x1 - bb.x0) / 2, (bb.y1 - bb.y0) / 2), limiting,
    ndcBounds: freezeR2({ x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: bb.y1 }), silhouetteNdc: freezeR2({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }),
    usableNdc: freezeR2({ ...U }), allowedNdc: freezeR2({ x0: ax0, x1: ax1, y0: ay0, y1: ay1, degenerate }), comfortNdc: freezeR2({ x: cX, y: cY }),
    arrowRoomNdc: freezeR2({ x: roomX, y: roomY }), arrowOvershootNdc: arrowOvershoot ? freezeR2({ ...arrowOvershoot }) : null, arrowsOnScreen, heightFill, comfortDeg, outlineBasis: outline.basis,
    fit: beltFit ? beltFit.fit || 'belt' : 'brain',
    beltFit: beltFit ? freezeR2({ ...beltFit, beltWidthFrac: beltFit.fit === 'motor' ? beltFit.beltInUsableNdc / (U.x1 - U.x0) : (bb.x1 - bb.x0) / (U.x1 - U.x0), frontCropFrac: Math.max(0, (b.y1 - U.y1) / (b.y1 - b.y0)), perspectiveK, tiltDeg }) : null,
    perspectiveK, distanceM: Math.hypot(pivotWorld[0], pivotWorld[1], pivotWorld[2]),
    pictureAxis: flat ? 'view' : 'centre', squashAxis: flat ? VIEW_AXIS : null,
    perspective: freezeR2(perspectiveInfo(perspectiveK, pivotWorld, k, box, flat ? VIEW_AXIS : null)),
    aimOnStrip: null, minBrainDistanceM: cl.bound, clearanceBasis: cl.basis, scaleUp: cl.scaleUp, reachM, clearanceM,
    orbitYawLimitDeg, orbitPitchLimitDeg, grabPitchLimitDeg, fovYDeg, aspect, compact: aspect < BRAIN_VIEW.compactAspect
  };
  if (isSegmentation(strips)) { // does the crosshair (yaw = pitch = 0) rest on a motor strip at the default view?
    const v = brainViewTransform({ frame });
    const ray = gazeRayForView(0, 0, v);
    frame.aimOnStrip = strips.strips.some(S => rayStripTable(ray.origin, ray.dir, S) !== null);
  }
  frameClearanceCoverage.set(frame, cl.coverage);
  return freezeR2(frame);
}

/**
 * The brain group's world transform for a frame and the current orbit / grab state.
 *   world(p) = Ry(grabYaw) Rx(grabPitch) [ pivotWorld + k F Ry(-orbitYaw) Rx(tilt + orbitPitch) DISPLAY (p - pivot) ]
 * F is the frame's facing rotation (frame.facing.rotation; identity for the round-2 'strips' framing): the tilt and the
 * orbit are about the line of sight to the brain centre, so the default view is the centred overhead view, anterior up.
 * orbitYaw / orbitPitch: DEGREES (orbit about the LOCKED brain centre = frame.pivot; yaw > 0 viewpoint toward screen
 *   right, pitch > 0 toward the front), clamped to the frame's limits. grabYaw / grabPitch: RADIANS in the camera
 *   convention (carry about the player: the brain centre moves to gazeDirection(grabYaw, grabPitch) at the same
 *   distance and keeps its appearance toward the camera), grabPitch clamped to +- grabPitchLimitDeg. tiltDeg defaults
 *   to the frame's tilt. Every transform is a proper rotation times k > 0 (det > 0, never mirrored), and distances to the
 *   camera are preserved by the carry, so the brain stays beyond reach (frame.minBrainDistanceM) and in front of the hand.
 * R4-view (D5): with frame.perspectiveK = K > 1 the brain is also squashed by 1 / K along the default line of sight
 *   u = frame.pivotWorld / |frame.pivotWorld| (before the carry), about its centre:
 *     world(p) = Ry(grabYaw) Rx(grabPitch) [ pivotWorld + k S_u F Ry(-orbitYaw) Rx(tilt + orbitPitch) DISPLAY (p - pivot) ],
 *     S_u = I + (1 / K - 1) u u^T.
 *   The eye then sees exactly the real brain as seen from K times farther through a K times zoom (any orbit, any carry).
 *   The matrix is affine with det > 0 (never mirrored) but no longer a similarity: use `linear` / `linearInverse` (or
 *   `matrix` / `inverse`) for points and rays; `rotation` stays the RIGID rotation (for normals: the real brain's
 *   surface normal directions). K = 1 (or a frame without perspectiveK) gives the round-3 transform bit for bit.
 * R558: a frame with squashAxis (frameBrain pictureAxis 'view') uses that unit axis for u instead of the line of sight,
 *   and has no facing rotation F: the far-eye picture then lies parallel to the screen of the default look.
 * Returns { kind: 'ns-brain-view', matrix (Float64Array(16) column-major world-from-source; Matrix4.fromArray),
 *   restMatrix (the same with orbitYaw = orbitPitch = 0; the SAME array as matrix when the brain is not turned),
 *   inverse (source-from-world), rotation (Float64Array(9) column-major, world from source directions, rigid), linear
 *   (Float64Array(9): the matrix's linear part, m per mm, squash included), linearInverse, k, pivot, pivotWorld
 *   (carried), tiltDeg, perspectiveK, squashAxis (carried unit u), squashAxis0 (the same before the carry), pictureAxis,
 *   orbitYaw, orbitPitch, grabYaw, grabPitch, clamped,
 *   axes: { anterior, superior, subjectRight } (world unit vectors of the DRAWN anatomical axes) }.
 */
export function brainViewTransform({ frame, orbitYaw = 0, orbitPitch = 0, grabYaw = 0, grabPitch = 0, tiltDeg = null } = {}) {
  if (!frame || frame.kind !== 'ns-brain-frame') throw new Error('ns:brain_view: frame (a frameBrain result) is required');
  for (const [key, x] of Object.entries({ orbitYaw, orbitPitch, grabYaw, grabPitch })) if (!Number.isFinite(x)) throw new Error(`ns:brain_view: ${key} must be finite`);
  const tilt = tiltDeg === null ? frame.tiltDeg : tiltDeg;
  if (!Number.isFinite(tilt)) throw new Error('ns:brain_view: tiltDeg must be finite');
  const oy = clampAbs(orbitYaw, frame.orbitYawLimitDeg), op = clampAbs(orbitPitch, frame.orbitPitchLimitDeg);
  const gp = clampAbs(grabPitch, frame.grabPitchLimitDeg * DEG);
  const clamped = oy !== orbitYaw || op !== orbitPitch || gp !== grabPitch;
  const carry = mul3(rotY3(grabYaw), rotX3(gp));
  const L = localRotation(tilt, oy, op);
  const F = frame.facing && frame.facing.rotation ? frame.facing.rotation : null;
  const Q = mul3(carry, F ? mul3(F, L) : L);
  const C = ap3(carry, frame.pivotWorld);
  const k = frame.k, pv = frame.pivot;
  // R4-view (D5): perspectiveK > 1 squashes the brain along the default line of sight (frame.pivotWorld, before the
  // carry) about its centre, so the eye sees it as an eye K times farther away would through a K times zoom.
  // R558: a frame with squashAxis (pictureAxis 'view') squashes along that fixed axis of the default look instead.
  const K = Number.isFinite(frame.perspectiveK) && frame.perspectiveK > 0 ? frame.perspectiveK : 1;
  const u0 = frame.squashAxis && frame.squashAxis.length === 3 && Array.prototype.every.call(frame.squashAxis, Number.isFinite) ? frame.squashAxis : null;
  const S0 = K === 1 ? null : squashAlong(u0 || frame.pivotWorld, K);
  const Lin = (S0 ? mul3(carry, mul3(S0, mul3(F || m3([1, 0, 0, 0, 1, 0, 0, 0, 1]), L))) : Q).map(x => x * k); // world from source (m per mm)
  const LinInv = S0 ? inv3(Lin) : m3([Q[0] / k, Q[3] / k, Q[6] / k, Q[1] / k, Q[4] / k, Q[7] / k, Q[2] / k, Q[5] / k, Q[8] / k]);
  const tq = ap3(Lin, pv);
  const matrix = new Float64Array(16);
  matrix[0] = Lin[0]; matrix[1] = Lin[1]; matrix[2] = Lin[2];
  matrix[4] = Lin[3]; matrix[5] = Lin[4]; matrix[6] = Lin[5];
  matrix[8] = Lin[6]; matrix[9] = Lin[7]; matrix[10] = Lin[8];
  matrix[12] = C[0] - tq[0]; matrix[13] = C[1] - tq[1]; matrix[14] = C[2] - tq[2]; matrix[15] = 1;
  // R558: the same placement with the orbit taken out (same frame, tilt and carry): where the brain lies when it is
  // not turned. Things placed round the brain that must stay put while it is turned (the orbit arrows) are measured
  // from this, so they are right again after a new frame (a resized window) even while the brain is turned.
  let restMatrix = matrix;
  if (oy !== 0 || op !== 0) {
    const L0 = localRotation(tilt, 0, 0);
    const Lin0 = (S0 ? mul3(carry, mul3(S0, mul3(F || m3([1, 0, 0, 0, 1, 0, 0, 0, 1]), L0))) : mul3(carry, F ? mul3(F, L0) : L0)).map(x => x * k);
    const tq0 = ap3(Lin0, pv);
    restMatrix = new Float64Array(16);
    restMatrix[0] = Lin0[0]; restMatrix[1] = Lin0[1]; restMatrix[2] = Lin0[2];
    restMatrix[4] = Lin0[3]; restMatrix[5] = Lin0[4]; restMatrix[6] = Lin0[5];
    restMatrix[8] = Lin0[6]; restMatrix[9] = Lin0[7]; restMatrix[10] = Lin0[8];
    restMatrix[12] = C[0] - tq0[0]; restMatrix[13] = C[1] - tq0[1]; restMatrix[14] = C[2] - tq0[2]; restMatrix[15] = 1;
  }
  const iC = ap3(LinInv, C);
  const inverse = new Float64Array(16);
  inverse[0] = LinInv[0]; inverse[1] = LinInv[1]; inverse[2] = LinInv[2];
  inverse[4] = LinInv[3]; inverse[5] = LinInv[4]; inverse[6] = LinInv[5];
  inverse[8] = LinInv[6]; inverse[9] = LinInv[7]; inverse[10] = LinInv[8];
  inverse[12] = pv[0] - iC[0]; inverse[13] = pv[1] - iC[1]; inverse[14] = pv[2] - iC[2]; inverse[15] = 1;
  const drawnDir = a => (S0 ? normalize(ap3(Lin, a)) : ap3(Q, a)); // the drawn (squashed) direction of an anatomical axis
  const axes = freezeR2({ anterior: freezeR2(drawnDir([0, -1, 0])), superior: freezeR2(drawnDir([0, 0, 1])), subjectRight: freezeR2(drawnDir([-1, 0, 0])) });
  const n0 = Math.hypot(C[0], C[1], C[2]) || 1;
  // The squash axis as drawn (carried with the grab) and before the carry (squashAxis0): unit vectors.
  const p0 = frame.pivotWorld, np = Math.hypot(p0[0], p0[1], p0[2]) || 1, nu = u0 ? Math.hypot(u0[0], u0[1], u0[2]) || 1 : 1;
  const axis0 = u0 ? [u0[0] / nu, u0[1] / nu, u0[2] / nu] : [p0[0] / np, p0[1] / np, p0[2] / np];
  const axisNow = u0 ? ap3(carry, axis0) : [C[0] / n0, C[1] / n0, C[2] / n0];
  return {
    kind: 'ns-brain-view', matrix, restMatrix, inverse, rotation: Q, linear: Lin, linearInverse: LinInv, k, pivot: pv, pivotWorld: freezeR2(C), tiltDeg: tilt,
    perspectiveK: K, squashAxis: freezeR2(axisNow), squashAxis0: freezeR2(axis0), pictureAxis: u0 ? 'view' : 'centre',
    orbitYaw: oy, orbitPitch: op, grabYaw, grabPitch: gp, clamped, axes
  };
}

/** Source mm -> world metres under a brainViewTransform view. */
export function viewSourceToWorld(p, view) {
  if (!view || view.kind !== 'ns-brain-view') throw new Error('ns:brain_view: a brainViewTransform result is required');
  const q = vec3(p, 'p'), m = view.matrix;
  return [m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12], m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13], m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14]];
}

/** World metres -> source mm under a brainViewTransform view. */
export function viewWorldToSource(w, view) {
  if (!view || view.kind !== 'ns-brain-view') throw new Error('ns:brain_view: a brainViewTransform result is required');
  const q = vec3(w, 'w'), m = view.inverse;
  return [m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12], m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13], m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14]];
}

/** A world direction as a source-mm direction under a view (not normalised; the rotation's transpose for a
 * similarity, the linear part's inverse with the R4-view squash). */
function viewDirToSource(w, view) {
  return view.linearInverse ? ap3(view.linearInverse, w) : apT3(view.rotation, w);
}

/** Camera-centre gaze ray in SOURCE mm under a brainViewTransform view: { origin, dir (unit) }. Equivalent to
 * gazeRayInSource(yaw, pitch, view). */
export function gazeRayForView(yaw, pitch, view) {
  const w = gazeDirection(yaw, pitch);
  const origin = viewWorldToSource([0, 0, 0], view);
  return { origin, dir: normalize(viewDirToSource(w, view)) };
}

/** Gaze ray in SOURCE mm through screen point (xNdc, yNdc) for a camera at yaw/pitch (radians) under `view`: the
 * pointer-picking counterpart of gazeRayForView (which is the crosshair ray, xNdc = yNdc = 0). { origin, dir (unit) }. */
export function pixelRayForView(xNdc, yNdc, view, { yaw = 0, pitch = 0, fovYDeg = 70, aspect }) {
  if (!(Number.isFinite(xNdc) && Number.isFinite(yNdc))) throw new Error('ns:brain_ray: xNdc and yNdc must be finite');
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_ray: aspect must be finite and > 0');
  const t = Math.tan((fovYDeg * DEG) / 2);
  const cam = mul3(rotY3(yaw), rotX3(pitch));
  const w = ap3(cam, normalize([xNdc * t * aspect, yNdc * t, -1]));
  return { origin: viewWorldToSource([0, 0, 0], view), dir: normalize(viewDirToSource(w, view)) };
}

/** Camera-space NDC of a world point for camera yaw/pitch (Three YXZ: R = Ry(yaw) Rx(pitch)), fovYDeg, aspect:
 * { x, y, depth } (depth along the view axis). */
export function projectWorldNdc(w, { yaw = 0, pitch = 0, fovYDeg = 70, aspect }) {
  const inv = mul3(rotX3(-pitch), rotY3(-yaw));
  const c = ap3(inv, w);
  const t = Math.tan((fovYDeg * DEG) / 2);
  const depth = -c[2];
  return { x: c[0] / (depth * t * aspect), y: c[1] / (depth * t), depth };
}

// ---------------------------------------------------------------------------------------------
// Orbit arrow placement (the arrows are DOM buttons drawn by ns-scene-three; this is the pure placement rule)

/** NDC bounding box of the strips' vertices under `view` for a camera at yaw/pitch: { x0, x1, y0, y1, onScreen
 * (fraction of vertices inside the view), behind (vertices behind the near plane are skipped) }. */
export function projectedStripBounds(seg, view, { aspect, fovYDeg = 70, yaw = 0, pitch = 0, near = 0.02, stride = 3 } = {}) {
  if (!isSegmentation(seg)) throw new Error('ns:brain_segment: a segmentMotorStrips result is required');
  if (!view || view.kind !== 'ns-brain-view') throw new Error('ns:brain_view: a brainViewTransform result is required');
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_frame: aspect must be finite and > 0');
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0, inside = 0, behind = 0;
  for (const S of seg.strips) {
    const P = S.positions;
    for (let i = 0; i < P.length; i += 3 * stride) {
      const p = projectWorldNdc(viewSourceToWorld([P[i], P[i + 1], P[i + 2]], view), { yaw, pitch, fovYDeg, aspect });
      if (!(p.depth > near)) { behind++; continue; }
      n++;
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      if (Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) inside++;
    }
  }
  return { x0, x1, y0, y1, onScreen: n ? inside / n : 0, behind };
}

/** Orbit arrow anchors (NDC) a small gap OUTSIDE the strips' projected bounds, NOT attached to the brain: 'forward'
 * above (the anterior is toward the top), 'back' below, 'left' / 'right' at the sides, each at the middle of its side
 * and clamped into [-limit, limit] so the buttons stay clickable when the brain is large or partly off-screen.
 * gapNdc ~0.05 is "a centimetre or a few centimetres" off the brain on a laptop screen. Returns { forward, back, left,
 * right: { x, y, clamped } } or null when the strips are not in front of the camera. */
export function orbitArrowAnchors(bounds, { gapNdc = 0.05, limit = 0.93 } = {}) {
  if (!bounds || !Number.isFinite(bounds.x0) || !Number.isFinite(bounds.x1) || !Number.isFinite(bounds.y0) || !Number.isFinite(bounds.y1)) return null;
  const cx = clampAbs((Math.max(bounds.x0, -1) + Math.min(bounds.x1, 1)) / 2, limit);
  const cy = clampAbs((Math.max(bounds.y0, -1) + Math.min(bounds.y1, 1)) / 2, limit);
  const at = (x, y) => { const X = clampAbs(x, limit), Y = clampAbs(y, limit); return { x: X, y: Y, clamped: X !== x || Y !== y }; };
  return {
    forward: at(cx, bounds.y1 + gapNdc), back: at(cx, bounds.y0 - gapNdc),
    left: at(bounds.x0 - gapNdc, cy), right: at(bounds.x1 + gapNdc, cy)
  };
}

// ---------------------------------------------------------------------------------------------
// Round 3 (R3-brain, D2): brain silhouette and orbit-arrow anchors from the real brain outline

/** Convex hull (CCW, y up) of 2-D points given as parallel arrays; returns the indices (Andrew's monotone chain). */
function hullIndices(xs, ys) {
  const n = xs.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b] || ys[a] - ys[b]);
  const cr = (o, a, b) => (xs[a] - xs[o]) * (ys[b] - ys[o]) - (ys[a] - ys[o]) * (xs[b] - xs[o]);
  const lower = [], upper = [];
  for (const i of idx) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop(); lower.push(i); }
  for (let q = n - 1; q >= 0; q--) { const i = idx[q]; while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop(); upper.push(i); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
const insideConvex = (h, x, y) => {
  for (let i = 0; i < h.length; i++) { const p = h[i], q = h[(i + 1) % h.length]; if ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) < 0) return false; }
  return true;
};
/** Distance (same units) from (x, y) to a convex CCW polygon; 0 inside. */
function distToConvex(h, x, y) {
  if (insideConvex(h, x, y)) return 0;
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2)) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - u * ex, y - a[1] - u * ey));
  }
  return best;
}

/** Silhouette references (look-invariant): per outline-points array, keyed by the UNCARRIED view (frame + orbit),
 * aspect and FOV. A grab carry is a rotation about the camera, applied per call. */
const SIL_CACHE = new WeakMap();
const SIL_CACHE_MAX = 24;
/** marginMm: the silhouette hull is pushed outward by this much brain (source mm, at the brain centre's distance) so the
 * true silhouette stays inside it (the outline points fall short of the exact hull by at most about 0.6 mm). */
export const SILHOUETTE = freezeR2({ cacheSize: SIL_CACHE_MAX, near: 0.02, marginMm: 1 });

function silhouetteReference(view, outlinePts, beltPts, aspect, fovYDeg, marginMm) {
  const carry = mul3(rotY3(view.grabYaw), rotX3(view.grabPitch));
  const cT = tr3(carry);
  // R4-view: the uncarried linear part (k, rotation and the D5 squash); k Q for views without `linear`.
  const Lin0 = mul3(cT, view.linear || view.rotation.map(x => x * view.k)), P0 = ap3(cT, view.pivotWorld), k = view.k, pv = view.pivot;
  const r10 = x => (Math.abs(x) < 1e-12 ? '0' : x.toPrecision(10)); // un-carrying leaves last-bit noise; 10 digits is plenty
  const key = `${aspect}|${fovYDeg}|${marginMm}|${r10(k)}|${pv.map(r10).join(',')}|${Array.prototype.map.call(Lin0, r10).join(',')}|${P0.map(r10).join(',')}`;
  let byPts = SIL_CACHE.get(outlinePts);
  if (!byPts) { byPts = new Map(); SIL_CACHE.set(outlinePts, byPts); }
  const hit = byPts.get(key);
  if (hit && hit.beltPts === beltPts) return hit;
  const R = facingToward(P0).rotation; // reference camera: looks at the brain centre, no roll
  const RT = tr3(R), t = Math.tan((fovYDeg * DEG) / 2), ta = t * aspect;
  const world0 = (x, y, z) => { const q = ap3(Lin0, [x - pv[0], y - pv[1], z - pv[2]]); return [P0[0] + q[0], P0[1] + q[1], P0[2] + q[2]]; };
  const toIso = w => { const c = ap3(RT, w); const depth = -c[2]; return depth > 0 ? [(c[0] / (depth * ta)) * aspect, c[1] / (depth * t)] : null; };
  const dirOfIso = (X, Y) => ap3(R, [(X / aspect) * ta, Y * t, -1]); // a world direction through an iso point
  const hullOf = (pts, delta) => {
    const xs = [], ys = [];
    for (let i = 0; i < pts.length; i += 3) {
      const p = toIso(world0(pts[i], pts[i + 1], pts[i + 2]));
      if (!p) throw new Error('ns:brain_silhouette: the brain is not in front of the reference camera');
      xs.push(p[0]); ys.push(p[1]);
    }
    const h = hullIndices(xs, ys);
    if (h.length < 3) throw new Error('ns:brain_silhouette: degenerate outline');
    let iso = h.map(i => [xs[i], ys[i]]);
    if (delta > 0) { // offset the convex CCW polygon outward by delta (mitred corners, capped)
      const n = iso.length, nrm = [];
      for (let i = 0; i < n; i++) { const a = iso[i], b = iso[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1; nrm.push([ey / l, -ex / l]); }
      iso = iso.map((v, i) => {
        const n0 = nrm[(i + n - 1) % n], n1 = nrm[i], d = 1 + n0[0] * n1[0] + n0[1] * n1[1], f = d > 0.25 ? delta / d : delta * 4;
        return [v[0] + (n0[0] + n1[0]) * f, v[1] + (n0[1] + n1[1]) * f];
      });
    }
    return { world: iso.map(([X, Y]) => dirOfIso(X, Y)), iso };
  };
  const deltaIso = (marginMm * k) / (Math.hypot(P0[0], P0[1], P0[2]) * t);
  const outlineHull = hullOf(outlinePts, deltaIso), beltHull = beltPts ? hullOf(beltPts, 0) : null;
  const pIso = toIso(P0);
  const axisIso = v => { const e = 0.02 * Math.hypot(P0[0], P0[1], P0[2]); const q = toIso([P0[0] + e * v[0], P0[1] + e * v[1], P0[2] + e * v[2]]); return q ? [q[0] - pIso[0], q[1] - pIso[1]] : [0, 0]; };
  const unit = (v, fb) => { const n = Math.hypot(v[0], v[1]); return n > 1e-9 ? [v[0] / n, v[1] / n] : fb; };
  const ref = {
    key, R, t, ta, aspect, fovYDeg, P0, pIso, outline: outlineHull, belt: beltHull, beltPts, anchors: new Map(),
    axesIso: { anterior: unit(axisIso(normalize(ap3(Lin0, [0, -1, 0]))), [0, 1]), right: unit(axisIso(normalize(ap3(Lin0, [-1, 0, 0]))), [1, 0]) }
  };
  byPts.set(key, ref);
  while (byPts.size > SIL_CACHE_MAX) byPts.delete(byPts.keys().next().value);
  return ref;
}

/** Camera-space projector (camera at the origin, YXZ yaw/pitch like Three) for carried world0 points. */
function cameraProjector(carry, { yaw, pitch, fovYDeg, aspect }) {
  const M = mul3(mul3(rotX3(-pitch), rotY3(-yaw)), carry);
  const t = Math.tan((fovYDeg * DEG) / 2), ta = t * aspect;
  return w => { const c = ap3(M, w); const depth = -c[2]; return { x: c[0] / (depth * ta), y: c[1] / (depth * t), depth }; };
}

/**
 * The brain's projected silhouette (convex hull of the WHOLE brain: every brain mesh, both hemispheres) for a camera.
 * seg: a segmentMotorStrips result (its `outline`; without it the glass grid, else the strips; or pass `points`, a
 *   brainOutlinePoints result or flat xyz). view: a brainViewTransform result (orbit + grab carry included).
 * camera: { aspect (required), fovYDeg (70), yaw, pitch (radians, camera convention), near (0.02) }; marginMm (1): the hull is
 *   pushed outward by this much brain so the true silhouette stays inside it.
 * Look-invariant core: the hull is found once per uncarried view (frame + orbit), aspect and FOV in a reference camera
 * looking at the brain centre, and cached (a central projection from the same point maps a convex hull onto the convex
 * hull, so re-projecting the hull vertices for another look or a grab carry is exact while the brain is in front of the
 * camera). Per call: about 30-60 hull vertices are projected, so it is cheap enough per frame.
 * Returns { kind: 'ns-brain-silhouette', inFront (false when part of the brain is behind the camera: hull not valid),
 *   hull: [[xNdc, yNdc], ...] (CCW), bounds: { minX, maxX, minY, maxY, cx, cy } ((cx, cy) = the projected brain
 *   centre, the locked orbit pivot), motorBelt: { minX, maxX, minY, maxY, widthNdc, hull } (both precentral strips),
 *   camera, basis ('outline' | 'grid' | 'box' | 'strips' | 'points'), ref (cache handle for arrowAnchors) }.
 */
export function brainSilhouette(seg, view, { aspect, fovYDeg = 70, yaw = 0, pitch = 0, near = SILHOUETTE.near, points = null, marginMm = SILHOUETTE.marginMm } = {}) {
  if (!view || view.kind !== 'ns-brain-view') throw new Error('ns:brain_view: a brainViewTransform result is required');
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new Error('ns:brain_silhouette: aspect must be finite and > 0');
  if (!(Number.isFinite(fovYDeg) && fovYDeg > 0 && fovYDeg < 180)) throw new Error('ns:brain_silhouette: fovYDeg must be in (0, 180)');
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new Error('ns:brain_silhouette: yaw and pitch must be finite');
  let basis, outlinePts;
  if (points) { outlinePts = points.kind === 'ns-brain-outline' ? points.points : checkPositions(points, 'points'); basis = 'points'; }
  else {
    if (!isSegmentation(seg)) throw new Error('ns:brain_segment: a segmentMotorStrips result (or points) is required');
    const o = outlineBasisFor(seg); outlinePts = o.points; basis = o.basis;
  }
  const beltPts = isSegmentation(seg) ? beltPointsFor(seg) : null;
  if (!(Number.isFinite(marginMm) && marginMm >= 0)) throw new Error('ns:brain_silhouette: marginMm must be finite and >= 0');
  const ref = silhouetteReference(view, outlinePts, beltPts, aspect, fovYDeg, marginMm);
  const carry = mul3(rotY3(view.grabYaw), rotX3(view.grabPitch));
  const proj = cameraProjector(carry, { yaw, pitch, fovYDeg, aspect });
  let inFront = true;
  const project = list => list.map(w => { const p = proj(w); if (!(p.depth > near)) inFront = false; return [p.x, p.y]; });
  const hull = project(ref.outline.world);
  const box = h => { let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; for (const [x, y] of h) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } return { minX, maxX, minY, maxY }; };
  const c = proj(ref.P0);
  const bounds = { ...box(hull), cx: c.x, cy: c.y };
  let motorBelt = null;
  if (ref.belt) { const bh = project(ref.belt.world); const bb = box(bh); motorBelt = { ...bb, widthNdc: bb.maxX - bb.minX, hull: bh }; }
  if (!(c.depth > near)) inFront = false;
  return { kind: 'ns-brain-silhouette', inFront, hull, bounds, motorBelt, camera: { aspect, fovYDeg, yaw, pitch }, basis, ref, _carry: carry };
}

/** Orbit-arrow placement defaults (D2): gap off the silhouette as a fraction of the view width and the button size. */
export const ARROW_ANCHORS = freezeR2({ gapFrac: BRAIN_VIEW.arrowGapFrac, sizePx: BRAIN_VIEW.arrowSizePx, refHeightPx: BRAIN_VIEW.refHeightPx });

/**
 * Orbit-arrow anchors just OUTSIDE the brain silhouette (D2): one per side, anchored to the brain's frame (they follow
 * orbit and drag, and stay put relative to the brain when the player looks around).
 * sil: a brainSilhouette result. opts: a number (gapNdc) or { gapNdc (NDC-x units, i.e. fraction of the half-width) |
 *   gapFrac (fraction of the view width; default ARROW_ANCHORS.gapFrac 0.035), radiusNdc (the button's half-size in
 *   NDC-y units) | sizePx + viewportPx ({ width, height } CSS px; default 44 px on a 720 px tall view) }.
 * Rule (computed once per silhouette reference, in the reference camera looking at the brain centre, in isotropic
 *   screen units): from the brain centre along the brain's own projected axes (forward = toward the anterior, back,
 *   right = toward the subject's right, left), the arrow centre is placed where its distance to the convex silhouette
 *   is exactly gap + radius, so the button's nearest edge is `gap` off the glass. At the default view these are above,
 *   below, right and left of the brain.
 * Returns { forward, back, left, right: { xNdc, yNdc (centre, current camera), tangentAngle (radians, screen space with
 *   y up: direction of the silhouette edge where the axis leaves it, counter-clockwise; rotate a curved icon by it so
 *   it hugs the brain), normalAngle (outward normal = tangentAngle - pi/2), exitNdc [x, y] (where the axis leaves the
 *   silhouette), dir (world unit vector, current carry), look { yaw, pitch } (radians, camera convention: the look
 *   that puts the arrow under the crosshair), onScreen, inFront }, gapNdc, radiusNdc }.
 */
export function arrowAnchors(sil, opts = {}) {
  if (!sil || sil.kind !== 'ns-brain-silhouette' || !sil.ref) throw new Error('ns:brain_arrows: a brainSilhouette result is required');
  const o = typeof opts === 'number' ? { gapNdc: opts } : (opts || {});
  const ref = sil.ref, aspect = ref.aspect;
  const gapNdc = o.gapNdc !== undefined && o.gapNdc !== null ? o.gapNdc : 2 * (o.gapFrac !== undefined ? o.gapFrac : ARROW_ANCHORS.gapFrac);
  const hPx = o.viewportPx && o.viewportPx.height > 0 ? o.viewportPx.height : ARROW_ANCHORS.refHeightPx;
  const radiusNdc = o.radiusNdc !== undefined && o.radiusNdc !== null ? o.radiusNdc : (o.sizePx !== undefined ? o.sizePx : ARROW_ANCHORS.sizePx) / hPx;
  if (!(Number.isFinite(gapNdc) && gapNdc >= 0 && Number.isFinite(radiusNdc) && radiusNdc >= 0)) throw new Error('ns:brain_arrows: gap and radius must be finite and >= 0');
  const gIso = gapNdc * aspect, rIso = radiusNdc, key = `${gIso}|${rIso}`;
  let A = ref.anchors.get(key);
  if (!A) {
    const H = ref.outline.iso;
    const C = insideConvex(H, ref.pIso[0], ref.pIso[1]) ? ref.pIso : H.reduce((s, p) => [s[0] + p[0] / H.length, s[1] + p[1] / H.length], [0, 0]);
    const toWorld = (X, Y) => normalize(ap3(ref.R, [(X / aspect) * ref.ta, Y * ref.t, -1]));
    const fwd = ref.axesIso.anterior, rgt = ref.axesIso.right;
    const dirs = { forward: fwd, back: [-fwd[0], -fwd[1]], right: rgt, left: [-rgt[0], -rgt[1]] };
    A = {};
    for (const [name, u] of Object.entries(dirs)) {
      // exit point: bisection on inside-ness along the ray (C is inside the convex hull)
      let lo = 0, hi = 1;
      while (insideConvex(H, C[0] + u[0] * hi, C[1] + u[1] * hi) && hi < 1e3) hi *= 2;
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (insideConvex(H, C[0] + u[0] * m, C[1] + u[1] * m)) lo = m; else hi = m; }
      const e = hi, E = [C[0] + u[0] * e, C[1] + u[1] * e];
      // anchor: distance to the hull = gap + radius (monotone along the ray outside a convex set)
      const want = gIso + rIso;
      let a0 = e, a1 = e + want + 1e-9;
      while (distToConvex(H, C[0] + u[0] * a1, C[1] + u[1] * a1) < want && a1 < 1e3) a1 = e + 2 * (a1 - e);
      for (let i = 0; i < 60; i++) { const m = (a0 + a1) / 2; if (distToConvex(H, C[0] + u[0] * m, C[1] + u[1] * m) < want) a0 = m; else a1 = m; }
      const P = [C[0] + u[0] * a1, C[1] + u[1] * a1];
      // the hull edge the axis crosses (nearest edge to E) gives the tangent (CCW direction)
      let bi = 0, bd = Infinity;
      for (let i = 0; i < H.length; i++) {
        const p = H[i], q = H[(i + 1) % H.length], ex = q[0] - p[0], ey = q[1] - p[1], L2 = ex * ex + ey * ey;
        const s = L2 > 0 ? Math.max(0, Math.min(1, ((E[0] - p[0]) * ex + (E[1] - p[1]) * ey) / L2)) : 0;
        const d = Math.hypot(E[0] - p[0] - s * ex, E[1] - p[1] - s * ey);
        if (d < bd) { bd = d; bi = i; }
      }
      const p = H[bi], q = H[(bi + 1) % H.length], tl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const tg = [(q[0] - p[0]) / tl, (q[1] - p[1]) / tl], dl = 0.05 * (want + 0.01);
      A[name] = {
        anchor: toWorld(P[0], P[1]), exit: toWorld(E[0], E[1]),
        t0: toWorld(E[0] - tg[0] * dl, E[1] - tg[1] * dl), t1: toWorld(E[0] + tg[0] * dl, E[1] + tg[1] * dl)
      };
    }
    ref.anchors.set(key, A);
  }
  const carry = sil._carry || mul3(rotY3(0), rotX3(0));
  const cam = sil.camera, proj = cameraProjector(carry, cam);
  const out = { gapNdc, radiusNdc };
  for (const name of ['forward', 'back', 'left', 'right']) {
    const a = A[name];
    const p = proj(a.anchor), e = proj(a.exit), t0 = proj(a.t0), t1 = proj(a.t1);
    const tx = (t1.x - t0.x) * cam.aspect, ty = t1.y - t0.y;
    const tangentAngle = Math.atan2(ty, tx);
    const w = ap3(carry, a.anchor);
    const look = lookAnglesToward(w);
    out[name] = {
      xNdc: p.x, yNdc: p.y, tangentAngle, normalAngle: tangentAngle - Math.PI / 2, exitNdc: [e.x, e.y], dir: w,
      look, inFront: p.depth > 0 && e.depth > 0, onScreen: p.depth > 0 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Diagnostics: which regions are actually pickable on screen

/** Software ID-buffer of every strip triangle under `view` for a camera at yaw/pitch: counts the pixels whose NEAREST
 * strip triangle belongs to each region (exactly what classifyRegionGaze would pick through that pixel, glass ignored).
 * Returns { width, height, total, regions: { regionId: { right, left, total } }, unassigned, byHemisphere: { right,
 * left }, medial: { right, left }[, buffer: { strip, triangle, depth } with returnBuffer] }. Pixel (x, y) covers NDC
 * ((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2). Pure; for tests and QA evidence (the default tilt and the orbit needs). */
export function regionVisibility(seg, view, { width = 320, height = 180, fovYDeg = 70, aspect = null, yaw = 0, pitch = 0, near = 0.02, returnBuffer = false } = {}) {
  if (!isSegmentation(seg)) throw new Error('ns:brain_segment: a segmentMotorStrips result is required');
  if (!view || view.kind !== 'ns-brain-view') throw new Error('ns:brain_view: a brainViewTransform result is required');
  const W = width, H = height, asp = aspect || W / H, t = Math.tan((fovYDeg * DEG) / 2);
  const inv = mul3(rotX3(-pitch), rotY3(-yaw));
  const zb = new Float32Array(W * H).fill(Infinity);
  const idS = new Int32Array(W * H).fill(-1), idT = new Int32Array(W * H).fill(-1);
  const m = view.matrix;
  const proj = (x, y, z) => {
    const w = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    const c = ap3(inv, w);
    const depth = -c[2];
    return [((c[0] / (depth * t * asp)) * 0.5 + 0.5) * W, (0.5 - (c[1] / (depth * t)) * 0.5) * H, depth];
  };
  seg.strips.forEach((S, si) => {
    const P = S.positions, I = S.indices;
    for (let k = 0; k < S.triangleCount; k++) {
      const a = proj(P[3 * I[3 * k]], P[3 * I[3 * k] + 1], P[3 * I[3 * k] + 2]);
      const b = proj(P[3 * I[3 * k + 1]], P[3 * I[3 * k + 1] + 1], P[3 * I[3 * k + 1] + 2]);
      const c = proj(P[3 * I[3 * k + 2]], P[3 * I[3 * k + 2] + 1], P[3 * I[3 * k + 2] + 2]);
      if (a[2] <= near || b[2] <= near || c[2] <= near) continue;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (area === 0) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const dz = 1 / (w0 / a[2] + w1 / b[2] + w2 / c[2]); // perspective-correct depth
        const q = y * W + x;
        if (dz < zb[q]) { zb[q] = dz; idS[q] = si; idT[q] = k; }
      }
    }
  });
  const regions = {};
  for (const r of seg.regions) regions[r.id] = { right: 0, left: 0, total: 0 };
  const byHemisphere = { right: 0, left: 0 }, medial = { right: 0, left: 0 };
  let total = 0, unassigned = 0;
  for (let q = 0; q < W * H; q++) {
    if (idS[q] < 0) continue;
    const S = seg.strips[idS[q]], k = idT[q];
    total++; byHemisphere[S.hemisphere]++;
    if (S.triSurface[k]) medial[S.hemisphere]++;
    const ri = S.triRegion[k];
    if (ri < 0) { unassigned++; continue; }
    const rr = regions[seg.regions[ri].id];
    rr[S.hemisphere]++; rr.total++;
  }
  const out = { width: W, height: H, total, regions, unassigned, byHemisphere, medial };
  if (returnBuffer) out.buffer = { strip: idS, triangle: idT, depth: zb }; // per pixel: seg.strips index, triangle, depth (m)
  return out;
}

// ---------------------------------------------------------------------------------------------
// Region style reference (recommended; the renderer, ns-scene-three, owns the final look)

/** Region display style constants (linear RGB / unitless). Activated regions (activatedRegions count >= 1, persistent
 * until Reset body) become slightly more opaque and shift shade toward `activatedShade`; left-arm regions carry a
 * distinct cyan identity tint and an outline, all other body-part regions a neutral warm-grey tint (alternating
 * lightness by order so neighbours read apart). Activity itself is the shared ns-colors emissive glow. */
// R4-polish (R11c, R4-player 2.1): the switched-on fill change was too faint to "see which parts of the brain you've
// activated" (0.7 % of pixels changed after 55 marks). It is now clearly visible and still slight (the unit tests keep
// the "slightly" bound: under +0.25 opacity per first switch-on): opacity 0.30 -> 0.54 (was 0.44; cap 0.64, was 0.52)
// and a shade shift of 0.34 toward the warm switched-on shade (was 0.24). The gold edge is unchanged. Evidence: round4/POLISH.md (14-marks before/after), e2e S15 / S44.
export const REGION_STYLE = freezeR2({
  // R558 (genuine note R32, "clearer"): the motor areas are more solid at rest (0.3 -> 0.56), so their folds and
  // borders read as tissue rather than as a tint on the glass. A switched-on area is still only a little more solid
  // than a resting one (0.56 -> 0.68, at most 0.78), as R8 asked ("slightly ... more opaque").
  restOpacity: 0.56, activatedOpacity: 0.68, activatedOpacityMax: 0.78, activatedOpacityPerExtra: 0.025,
  activatedShadeMix: 0.34,
  activatedShade: freezeR2([0.88, 0.80, 0.62]),
  // R4-access (D9): identity tints from ns-colors KEY_COLORS, chosen to stay apart under colour-vision deficiency.
  leftArmTint: freezeR2([...KEY_COLORS.leftArmTint]),
  otherTint: freezeR2([...KEY_COLORS.otherTint]), otherTintAlt: freezeR2([...KEY_COLORS.otherTintAlt]),
  leftArmOutline: freezeR2([0.55, 0.95, 1.0]),
  hoverOpacityBoost: 0.08,
  leftArmLabel: 'LEFT ARM (right hemisphere)'
});

/** Recommended style of a region: { opacity, tint (identity, linear), albedo, emission (ns-colors activityShade of the
 * shaded tint), outline (bool), outlineColor, activated (bool) }. activatedCount: activatedRegions[regionId] (0 when
 * never activated); activity: regionActivity[regionId] (0..1, simulated). */
export function regionStyle(region, { activity = 0, activatedCount = 0, hovered = false } = {}, style = REGION_STYLE) {
  if (!region) throw new Error('ns:brain_style: region is required');
  const base = region.isLeftArm ? style.leftArmTint : (Math.round(region.order) % 2 === 0 ? style.otherTint : style.otherTintAlt);
  const activated = Number.isFinite(activatedCount) && activatedCount >= 1;
  const mix = activated ? style.activatedShadeMix : 0;
  const tint = [0, 1, 2].map(i => base[i] + (style.activatedShade[i] - base[i]) * mix);
  let opacity = style.restOpacity;
  if (activated) opacity = Math.min(style.activatedOpacityMax, style.activatedOpacity + style.activatedOpacityPerExtra * Math.max(0, activatedCount - 1));
  if (hovered) opacity = Math.min(1, opacity + style.hoverOpacityBoost);
  const shaded = activityShade(tint, activity);
  return { opacity, tint: base.slice(), albedo: shaded.albedo, emission: shaded.emission, outline: region.isLeftArm, outlineColor: style.leftArmOutline.slice(), activated };
}
