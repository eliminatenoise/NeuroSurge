/** NeuroSurge: the vessels of the brain (18 November 2026, package VESSELS). Pure ES module (browser and Node): no DOM,
 * no Three.js; the scene turns what it returns into meshes (ns-scene-three setBrainVessels).
 *
 * Owner, 18 November: "And let's get the vascularity right, especially with the cerebral veins and etc. and for all
 * other items as well." Earlier: "Everything must be anatomically correct and accurate, brain included"; "a beating
 * reacting brain as you would see in neurosurgery"; "clinical", not gory or bloody.
 *
 * What is drawn on the brain, as a neurosurgeon sees its outer surface:
 *  - ARTERIES: real meshes. BodyParts3D 4.0 (CC BY 4.0, DBCLS) models the cortical branches of the middle, anterior and
 *    posterior cerebral arteries in the same source frame as the brain the game draws; packet
 *    packets/bodyparts3d-cerebral-arteries-r1 holds 80 byte-exact archive members (both sides; the left side's files
 *    are the atlas's own mirror copies, FJ....M). Registered as they are: the median distance of a cortical branch's
 *    vertices from the nearest vertex of the game's brain is 0.8 to 4.4 mm (they lie in and over the sulci). They pulse
 *    with the beat (ARTERY_LOOK.pulseMm), the veins barely.
 *  - VEINS AND SINUSES: BodyParts3D 4.0 has no cerebral veins and no dural sinuses, so they are laid by hand
 *    (VEIN_COURSES) as courses over this brain's own landmarks (its named gyri: the central sulcus between the
 *    precentral and postcentral gyri, the lateral (Sylvian) fissure above the temporal gyri, the poles, the midline),
 *    following the typical anatomy of the superficial venous system (Rhoton, "The cerebral veins", Neurosurgery 51 (4
 *    Suppl), 2002, S159-S205; Gray's Anatomy, 42nd ed., ch. "Vascular supply of the brain"):
 *      superior cerebral veins: eight a side, rising over the convexity to the superior sagittal sinus; the frontal
 *        ones enter about at right angles, the parietal and occipital ones run forward as they rise (against the
 *        sinus's flow); each widens toward the sinus and takes small tributaries off the gyri on its way;
 *      the precentral and central (Rolandic) veins along their sulci; the superior anastomotic vein (Trolard) from the
 *        lateral fissure up to the sagittal sinus, dominant on the right here; the inferior anastomotic vein (Labbe) from
 *        the middle of the lateral fissure back and down over the temporal lobe to the transverse sinus, dominant on
 *        the left here (a common pattern; either can dominate in a real person);
 *      the superficial middle cerebral vein along the lateral fissure, forward and down round the temporal pole toward
 *        the sphenoparietal sinus; inferior cerebral veins on the temporal lobe toward the transverse sinus;
 *      the superior sagittal sinus as a broad band over the midline (it lies in the dura's falx, over the
 *        interhemispheric fissure; the dura itself is not drawn), widening toward the back, the confluence and both
 *        transverse sinuses along the occipital base.
 *    Veins lie ON the surface: flat and wide (an ellipse wider along the surface than it is tall), over the gyral
 *    crowns and bridging the sulci (they are draped on the brain's outer envelope, BRAIN_ENVELOPE, not on the folded
 *    surface). Arteries are round and mostly IN the sulci, emerging, branching and tapering: as the atlas has them.
 *  - Over the motor strip the vessels give way to the keys: a vein that crosses a key is drawn half as wide and flush
 *    with the surface, an artery there sinks under the key's surface (STRIP_GIVE), so no small area is hidden. The
 *    aim is computed on the brain's rest shape and does not see the vessels.
 *
 * Scope: a teaching picture. The courses are typical anatomy laid on one atlas brain, not this or any person's
 * angiogram; widths are display choices within real ranges; nothing is measured. The procedural vessel lines the
 * cortex shader drew before (ns-brain-ink cortexVesselGlsl) are switched off (BRAIN_FLESH.vessel null) so nothing fake
 * stays beside these.
 */

// ---------------------------------------------------------------------------------------------------------------------
// The artery packet

export const CEREBRAL_ARTERIES_PACKET = 'bodyparts3d-cerebral-arteries-r1';
/** Where the packet is (relative to the game page) and the pinned sha256 of its manifest. */
export const CEREBRAL_ARTERIES_DEFAULTS = Object.freeze({
  manifestUrl: '../../packets/bodyparts3d-cerebral-arteries-r1/CEREBRAL-ARTERIES-MESH-MANIFEST.json',
  packetBase: '../../packets/bodyparts3d-cerebral-arteries-r1/',
  manifestSha256: 'bf314c2e4da04ccd116993820bb845aa97428b0588fdbbc69e2c2291951c0595'
});
/** Territories (manifest `territory`) and what they are. */
export const ARTERY_TERRITORIES = Object.freeze({
  mca: 'middle cerebral artery: M1, the insular trunks and the cortical branches fanning out of the lateral fissure',
  aca: 'anterior cerebral artery: A1, the anterior communicating artery, pericallosal and callosomarginal arteries and their branches over the top edge',
  pca: 'posterior cerebral artery: P1, P2 and the occipital and temporal cortical branches',
  base: 'posterior communicating, basilar and superior cerebellar arteries (the back of the circle of Willis)'
});
import { isPackedMesh } from './ns-pack.mjs';

const HEX64 = /^[0-9a-f]{64}$/;
const ID_RE = /^FJ\d{4}M?$/;
const PATH_RE = /^meshes\/FJ\d{4}M?\.obj$/;

function fail(code, msg) { throw new Error(`ns:${code}: ${msg}`); }

/** Check a parsed cerebral-artery manifest. Returns the frozen list of entries { id, path, sha256, bytes, vertices,
 * name, territory, side, bounds_min, bounds_max }. Throws ns:vessel_manifest on anything malformed. */
export function validateArteryManifest(m) {
  if (!m || typeof m !== 'object' || m.packet !== CEREBRAL_ARTERIES_PACKET || !Array.isArray(m.assets)) fail('vessel_manifest', 'not the cerebral-artery manifest');
  if (m.assets.length === 0 || m.assets.length > 200) fail('vessel_manifest', 'asset count out of range');
  const seen = new Set();
  return Object.freeze(m.assets.map(a => {
    if (!a || !ID_RE.test(a.element_id) || seen.has(a.element_id)) fail('vessel_manifest', `bad or repeated id ${a && a.element_id}`);
    seen.add(a.element_id);
    if (a.path !== `meshes/${a.element_id}.obj` || !PATH_RE.test(a.path)) fail('vessel_manifest', `bad path for ${a.element_id}`);
    if (!HEX64.test(a.sha256)) fail('vessel_manifest', `bad sha256 for ${a.element_id}`);
    if (!Number.isInteger(a.vertices) || a.vertices < 3 || !Number.isInteger(a.bytes) || a.bytes < 1 || a.bytes > 8e6) fail('vessel_manifest', `bad counts for ${a.element_id}`);
    if (!ARTERY_TERRITORIES[a.territory]) fail('vessel_manifest', `bad territory for ${a.element_id}`);
    const v3 = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
    if (!v3(a.bounds_min) || !v3(a.bounds_max)) fail('vessel_manifest', `bad bounds for ${a.element_id}`);
    return Object.freeze({ id: a.element_id, path: a.path, sha256: a.sha256, bytes: a.bytes, vertices: a.vertices, name: String(a.requested_structure || a.element_id),
      territory: a.territory, side: a.laterality || null, bounds_min: Object.freeze(a.bounds_min.slice()), bounds_max: Object.freeze(a.bounds_max.slice()) });
  }));
}

/**
 * Load the cerebral arteries: the manifest (its sha256 must equal the pin BEFORE it is parsed), then every file (its
 * sha256 must equal the manifest's before it is parsed; vertex count and bounds within 1 mm of the manifest's after).
 * fetchText(url) -> Promise<string>, sha256Hex(text) -> Promise<string> | string, parse(text) -> { positions, indices }
 * (ns-assets parseObjFast), yieldFn: optional () => Promise (between files, so a frame can paint). All or nothing:
 * any refusal rejects. Returns { entries, meshes: [{ id, name, territory, side, positions, indices }], bytes, ms }.
 */
export async function loadCerebralArteries({ fetchText, sha256Hex, parse, manifestUrl = CEREBRAL_ARTERIES_DEFAULTS.manifestUrl,
  packetBase = CEREBRAL_ARTERIES_DEFAULTS.packetBase, expectedManifestSha256 = CEREBRAL_ARTERIES_DEFAULTS.manifestSha256, yieldFn = null, now = () => Date.now(),
  fetchPacked = null } = {}) {
  if (typeof fetchText !== 'function' || typeof sha256Hex !== 'function' || typeof parse !== 'function') fail('vessel_args', 'fetchText, sha256Hex and parse must be injected');
  const t0 = now();
  const mtext = await fetchText(manifestUrl);
  const msha = await sha256Hex(mtext);
  if (expectedManifestSha256 && msha !== expectedManifestSha256) fail('vessel_manifest', `manifest sha256 ${msha} is not the pinned one`);
  const entries = validateArteryManifest(JSON.parse(mtext));
  const base = packetBase.endsWith('/') ? packetBase : `${packetBase}/`;
  const meshes = [];
  let bytes = 0;
  for (const e of entries) {
    // 19 November 2026 (mesh packs, ns-pack): fetchPacked(url) may give the mesh of a verified pack (or null). Its
    // recorded source byte count and SHA-256 are compared with the manifest's as the file's own would be.
    const packed = typeof fetchPacked === 'function' ? await fetchPacked(base + e.path) : null;
    let g;
    if (isPackedMesh(packed)) {
      if (packed.sourceSha256 !== e.sha256 || packed.sourceBytes !== e.bytes) fail('vessel_file', `${e.id}: the packed source file does not match the manifest`);
      g = packed.mesh;
    } else {
      const text = await fetchText(base + e.path);
      const sha = await sha256Hex(text);
      if (sha !== e.sha256) fail('vessel_file', `${e.id}: sha256 does not match the manifest`);
      g = parse(text);
    }
    if (!g || !g.positions || !g.indices || g.positions.length !== 3 * e.vertices) fail('vessel_file', `${e.id}: vertex count does not match the manifest`);
    const p = g.positions;
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
      const v = p[i + k];
      if (!(v >= e.bounds_min[k] - 1 && v <= e.bounds_max[k] + 1)) fail('vessel_file', `${e.id}: a vertex lies outside the manifest's bounds`);
    }
    meshes.push({ id: e.id, name: e.name, territory: e.territory, side: e.side, positions: p, indices: g.indices });
    bytes += e.bytes;
    if (yieldFn) await yieldFn();
  }
  return { entries, meshes, bytes, ms: now() - t0 };
}

// ---------------------------------------------------------------------------------------------------------------------
// The brain's outer envelope (what the veins are draped on)

/** The envelope: the largest distance from `centre` of any brain vertex in each cell of a longitude / latitude grid of
 * `cellDeg` degrees (poles on the left-right axis, so the midline is the grid's equator), then the largest of each
 * cell's (2 spreadCells + 1)^2 neighbourhood, so the envelope bridges the sulci and the midline fissure like the
 * arachnoid the surface veins lie in. Cells with no vertex take their neighbours' value. */
export const BRAIN_ENVELOPE = Object.freeze({ cellDeg: 1, spreadCells: 4, centre: Object.freeze([0, -80, 1548]) });

/** Build the envelope from flat xyz arrays (source mm). Returns { centre, cellDeg, nLat, nLon, r: Float32Array }. */
export function brainEnvelope(positionLists, o = BRAIN_ENVELOPE) {
  const C = o.centre, cd = o.cellDeg, nLat = Math.round(180 / cd), nLon = Math.round(360 / cd);
  const raw = new Float32Array(nLat * nLon);
  for (const P of positionLists) {
    if (!P) continue;
    for (let i = 0; i + 2 < P.length; i += 3) {
      const x = P[i] - C[0], y = P[i + 1] - C[1], z = P[i + 2] - C[2], r = Math.hypot(x, y, z);
      if (!(r > 1e-6)) continue;
      // the grid's poles are on the left-right axis, so the midline (and its fissure) is the grid's equator
      const la = Math.min(nLat - 1, Math.floor(Math.acos(Math.max(-1, Math.min(1, x / r))) / Math.PI * nLat));
      const lo = Math.min(nLon - 1, Math.floor((Math.atan2(z, y) + Math.PI) / (2 * Math.PI) * nLon));
      const k = la * nLon + lo;
      if (r > raw[k]) raw[k] = r;
    }
  }
  const spread = sp => {
    const r = new Float32Array(nLat * nLon);
    for (let la = 0; la < nLat; la++) for (let lo = 0; lo < nLon; lo++) {
      let m = 0;
      for (let a = -sp; a <= sp; a++) { const l2 = la + a; if (l2 < 0 || l2 >= nLat) continue; for (let b = -sp; b <= sp; b++) { const v = raw[l2 * nLon + ((lo + b + nLon) % nLon)]; if (v > m) m = v; } }
      r[la * nLon + lo] = m;
    }
    // fill empty cells (next to the grid's poles the cells are tiny; a few under the brain) from their neighbours
    for (let pass = 0; pass < 64; pass++) {
      let empty = 0;
      for (let k = 0; k < r.length; k++) {
        if (r[k] !== 0) continue;
        empty++;
        const la = Math.floor(k / nLon), lo = k % nLon;
        let m = 0;
        for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const l2 = la + a; if (l2 < 0 || l2 >= nLat) continue; m = Math.max(m, r[l2 * nLon + ((lo + b + nLon) % nLon)]); }
        r[k] = m;
      }
      if (!empty) break;
    }
    return r;
  };
  // r: the envelope the veins lie on; local: the surface itself, nearly (one cell either side), for what must sink under it
  const r = spread(o.spreadCells), local = { centre: C.slice(), cellDeg: cd, nLat, nLon, r: spread(1) };
  return { centre: C.slice(), cellDeg: cd, nLat, nLon, r, local };
}

/** The envelope's radius in direction d (unit, from the centre), bilinear between cells. */
export function envelopeRadius(E, dx, dy, dz) {
  const la = Math.acos(Math.max(-1, Math.min(1, dx))) / Math.PI * E.nLat - 0.5;
  const lo = (Math.atan2(dz, dy) + Math.PI) / (2 * Math.PI) * E.nLon - 0.5;
  const a0 = Math.max(0, Math.min(E.nLat - 1, Math.floor(la))), a1 = Math.min(E.nLat - 1, a0 + 1), fa = Math.max(0, Math.min(1, la - a0));
  const b0 = ((Math.floor(lo) % E.nLon) + E.nLon) % E.nLon, b1 = (b0 + 1) % E.nLon, fb = lo - Math.floor(lo);
  const g = (a, b) => E.r[a * E.nLon + b];
  return (g(a0, b0) * (1 - fb) + g(a0, b1) * fb) * (1 - fa) + (g(a1, b0) * (1 - fb) + g(a1, b1) * fb) * fa;
}

// ---------------------------------------------------------------------------------------------------------------------
// The hand-laid veins and sinuses

/** Look of the vessels (sRGB 0..1 and millimetres; display choices). Arteries: a clean bright red (not the dark red of
 * blood), glossy; they swell by pulseMm along their normals at the top of a beat and brighten by pulseGlow. Veins: dark
 * blue-violet, wet; the sinus a little greyer (it is seen through the dura in life). */
// 19 November 2026 (eye comfort): a muted red (0.78, 0.13, 0.13 before), less shine and a third of the pulse.
export const ARTERY_LOOK = Object.freeze({ colour: Object.freeze([0.56, 0.24, 0.24]), roughness: 0.5, pulseMm: 0.07, pulseGlow: 0.07 });
export const VEIN_LOOK = Object.freeze({ colour: Object.freeze([0.29, 0.23, 0.45]), sinus: Object.freeze([0.33, 0.3, 0.45]), roughness: 0.22, sides: 8,
  flat: 0.5, liftMm: 0.15, stepMm: 1.2, smooth: 2, drapeWinMm: 4, meanderMm: Object.freeze([1.6, 0.6]), meanderWaveMm: Object.freeze([23, 8.5]) });
/** Over the motor strip (distance to the nearest strip vertex under nearMm, full at fullMm): a vein keeps widthKeep of
 * its width and lies flush; an artery sinks tuckMm toward the brain's centre (under the key's surface). */
export const STRIP_GIVE = Object.freeze({ nearMm: 4.5, fullMm: 1.5, widthKeep: 0.5, tuckMm: 1.6, cellMm: 3 });

/**
 * The courses, in LEFT-hemisphere source mm (x > 0; the right hemisphere is the mirror, x -> -x, moved by `shiftR` mm
 * along y where the two sides differ). Each point is near the surface; the draping puts it on the envelope. width:
 * [at the start, at the end] in mm; `to`: 'sss' | 'transverse' | null (where it drains; the end then lies under that
 * sinus). `twigs`: small tributaries [at (0..1 along), angle (deg, in the surface, from the course), length mm, width
 * mm]. `dominant`: 'l' | 'r' | null: the dominant side keeps the width, the other takes `minor` x it.
 */
export const VEIN_COURSES = Object.freeze([
  // superior sagittal sinus, confluence and transverse sinuses (sinus: drawn in the sinus colour, flatter and broader)
  { name: 'superior sagittal sinus', kind: 'sinus', side: 'mid', width: [3.5, 8], flat: 0.38, wander: false,
    points: [[0, -166, 1582], [0, -152, 1604], [0, -130, 1620], [0, -105, 1629], [0, -80, 1632], [0, -55, 1628], [0, -30, 1616], [0, -10, 1598], [0, 4, 1574], [0, 11, 1548], [0, 12, 1528]] },
  { name: 'transverse sinus', kind: 'sinus', side: 'both', width: [7, 5.5], flat: 0.42, wander: false,
    points: [[0, 12, 1528], [14, 11, 1523], [28, 6, 1520], [41, -4, 1518], [51, -18, 1517], [57, -34, 1518]] },
  // superior cerebral veins (front to back); the right side differs (shiftR: mm along y; skip: not on that side)
  { name: 'frontopolar vein', kind: 'vein', side: 'both', width: [0.8, 1.7], to: 'sss', shiftR: 5,
    points: [[36, -158, 1566], [30, -160, 1584], [17, -160, 1594], [0, -160, 1598]] },
  { name: 'anterior frontal vein', kind: 'vein', side: 'both', width: [1.0, 2.1], to: 'sss', shiftR: 8,
    points: [[50, -138, 1566], [44, -137, 1588], [30, -134, 1606], [14, -131, 1614], [0, -129, 1617]] },
  { name: 'middle frontal vein', kind: 'vein', side: 'l', width: [1.0, 2.2], to: 'sss',
    points: [[58, -118, 1570], [52, -117, 1592], [37, -113, 1612], [18, -109, 1624], [0, -107, 1627]] },
  { name: 'precentral vein', kind: 'vein', side: 'both', width: [1.0, 2.3], to: 'sss', shiftR: -6,
    points: [[63, -94, 1566], [60, -90, 1584], [53, -83, 1601], [40, -76, 1617], [22, -70, 1627], [0, -67, 1630]] },
  { name: 'central (Rolandic) vein', kind: 'vein', side: 'both', width: [1.1, 2.4], to: 'sss', shiftR: -3,
    points: [[64, -83, 1564], [62, -78, 1582], [56, -69, 1600], [43, -59, 1616], [25, -51, 1626], [0, -47, 1628]] },
  { name: 'superior anastomotic vein (Trolard)', kind: 'vein', side: 'both', width: [1.5, 2.7], to: 'sss', dominant: 'r', minor: 0.65,
    points: [[66, -64, 1560], [65, -60, 1577], [59, -51, 1595], [47, -42, 1611], [27, -35, 1621], [0, -31, 1622]] },
  { name: 'parietal vein', kind: 'vein', side: 'both', width: [1.0, 2.1], to: 'sss', shiftR: 7,
    // the posterior veins run forward as they rise (against the sinus's flow)
    points: [[57, -18, 1580], [51, -22, 1598], [37, -25, 1611], [19, -28, 1617], [0, -31, 1619]] },
  { name: 'occipital vein', kind: 'vein', side: 'both', width: [0.9, 1.9], to: 'sss', shiftR: -6,
    points: [[47, 3, 1563], [42, -1, 1581], [29, -6, 1595], [13, -10, 1601], [0, -13, 1604]] },
  // the lateral fissure and the temporal lobe
  { name: 'superficial middle cerebral vein', kind: 'vein', side: 'both', width: [1.3, 2.3],
    points: [[63, -46, 1566], [66, -62, 1561], [65, -78, 1558], [62, -95, 1555], [58, -110, 1551], [52, -120, 1544], [46, -125, 1532]],
    twigs: [[0.15, 70, 9, 0.6], [0.45, -65, 8, 0.6]] },
  { name: 'inferior anastomotic vein (Labbe)', kind: 'vein', side: 'both', width: [1.5, 2.5], to: 'transverse', dominant: 'l', minor: 0.6,
    points: [[65, -80, 1557], [66, -69, 1546], [65, -56, 1537], [62, -44, 1529], [58, -32, 1522], [56, -26, 1519]], twigs: [[0.4, 60, 9, 0.6]] },
  { name: 'inferior cerebral vein', kind: 'vein', side: 'both', width: [0.9, 1.6], to: 'transverse', shiftR: 3,
    points: [[61, -104, 1532], [59, -88, 1526], [56, -68, 1521], [53, -48, 1518], [54, -36, 1517]] }
]);
/** The tributaries of a superior cerebral vein when its course names none: three fine veins off the gyri on alternate
 * sides, entering in the direction of flow (angle, length and width varied per vein and side by its name). */
export function defaultTwigs(name, side) {
  const h = k => hash01(`${name}|${side}|${k}`), sgn = h(0) < 0.5 ? 1 : -1;
  return [[0.2 + 0.08 * h(1), sgn * (50 + 16 * h(2)), 9 + 6 * h(3), 0.65], [0.45 + 0.08 * h(4), -sgn * (46 + 16 * h(5)), 8 + 5 * h(6), 0.6], [0.7 + 0.06 * h(7), sgn * (44 + 14 * h(8)), 6 + 5 * h(9), 0.5]];
}

/** Distance field to a point set (the strip's vertices), for STRIP_GIVE. Returns near(x, y, z) -> distance in mm, capped
 * at capMm (only points within capMm are searched: (2 ceil(capMm / cellMm) + 1)^3 cells, numeric cell keys). */
export function pointField(positionLists, cellMm = STRIP_GIVE.cellMm, capMm = STRIP_GIVE.nearMm) {
  const grid = new Map(), key = (a, b, c) => ((a & 1023) * 1024 + (b & 1023)) * 1024 + (c & 1023); // < 1024 cells a side
  for (const P of positionLists) {
    if (!P) continue;
    for (let i = 0; i + 2 < P.length; i += 3) {
      const k = key(Math.floor(P[i] / cellMm), Math.floor(P[i + 1] / cellMm), Math.floor(P[i + 2] / cellMm));
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(P[i], P[i + 1], P[i + 2]);
    }
  }
  const reach = Math.ceil(capMm / cellMm), cap2 = capMm * capMm;
  return (x, y, z) => {
    const cx = Math.floor(x / cellMm), cy = Math.floor(y / cellMm), cz = Math.floor(z / cellMm);
    let best = cap2;
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) for (let k = -reach; k <= reach; k++) {
      const a = grid.get(key(cx + i, cy + j, cz + k)); if (!a) continue;
      for (let q = 0; q < a.length; q += 3) { const d = (a[q] - x) ** 2 + (a[q + 1] - y) ** 2 + (a[q + 2] - z) ** 2; if (d < best) best = d; }
    }
    return Math.sqrt(best);
  };
}

const smooth01 = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Resample a polyline every stepMm (straight pieces). */
function resample(points, stepMm) {
  const out = [points[0].slice()];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let s = stepMm - carry;
    while (s < L) { const t = s / L; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); s += stepMm; }
    carry = L - (s - stepMm);
  }
  const last = points[points.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1], last[2] - pl[2]) > 0.2 * stepMm) out.push(last.slice());
  return out;
}

/** Drape a course on the envelope: each point moves along its direction from the centre to the envelope's radius;
 * the radii along the course are then smoothed as an UPPER envelope (the largest within winMm either side, then the
 * mean of those over the same window), so the vessel runs smoothly over the crowns, bridges the sulci and never sinks
 * into the tissue (a plain re-drape of a smoothed line brought back the envelope's steps and twisted the tube). */
function drapeSmooth(E, pts, winMm, stepMm) {
  const C = E.centre, n = pts.length, dir = [], r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i], x = p[0] - C[0], y = p[1] - C[1], z = p[2] - C[2], l = Math.hypot(x, y, z) || 1;
    dir.push([x / l, y / l, z / l]); r[i] = envelopeRadius(E, x / l, y / l, z / l);
  }
  const w = Math.max(1, Math.round(winMm / stepMm)), mx = new Float64Array(n), sm = new Float64Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) if (r[j] > m) m = r[j]; mx[i] = m; }
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += mx[j]; c++; } sm[i] = Math.max(s / c, r[i]); }
  return dir.map((d, i) => [C[0] + d[0] * sm[i], C[1] + d[1] * sm[i], C[2] + d[2] * sm[i]]);
}

/** Small deterministic hash -> 0..1 (the meander's phase per vessel and side). */
function hash01(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }

/** Let a course wander a little in the surface, square to its own direction (a vein is never a ruled line): two waves
 * of amp[0] / amp[1] mm, wave[0] / wave[1] mm long, phase from `seed`; none at the two ends. */
function meander(E, pts, seed, amp = VEIN_LOOK.meanderMm, wave = VEIN_LOOK.meanderWaveMm) {
  const n = pts.length; if (n < 3 || !(amp[0] || amp[1])) return pts;
  const C = E.centre, ph = 2 * Math.PI * hash01(seed), ph2 = 2 * Math.PI * hash01(seed + '+');
  let s = 0;
  return pts.map((p, i) => {
    if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const nx = p[0] - C[0], ny = p[1] - C[1], nz = p[2] - C[2];
    let bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx; const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
    const end = Math.min(1, i / 4, (n - 1 - i) / 4);
    const m = end * (amp[0] * Math.sin(2 * Math.PI * s / wave[0] + ph) + amp[1] * Math.sin(2 * Math.PI * s / wave[1] + ph2));
    return [p[0] + bx * m, p[1] + by * m, p[2] + bz * m];
  });
}

function smoothPath(pts, n) {
  if (n <= 0 || pts.length < 3) return pts;
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const w = Math.min(n, i, pts.length - 1 - i);
    const s = [0, 0, 0];
    for (let j = -w; j <= w; j++) for (let k = 0; k < 3; k++) s[k] += pts[i + j][k];
    return s.map(v => v / (2 * w + 1));
  });
}

/**
 * One vessel as a flattened tube on the envelope. pts: course (source mm, near the surface); widths: (t 0..1) -> mm;
 * flat: thickness / width; give(x, y, z) -> 0..1 how much the strip asks it to give way (null = none). Appends to
 * `acc` ({ positions: [], normals: [], indices: [] }) and returns the draped centre line.
 */
export function layVessel(E, pts, widthAt, acc, { flat = VEIN_LOOK.flat, sides = VEIN_LOOK.sides, liftMm = VEIN_LOOK.liftMm, stepMm = VEIN_LOOK.stepMm, smooth = VEIN_LOOK.smooth, give = null, capStart = true, capEnd = true, seed = '', wander = true } = {}) {
  let line = resample(pts, stepMm);
  if (wander) line = meander(E, line, seed);
  line = drapeSmooth(E, smoothPath(line, smooth), VEIN_LOOK.drapeWinMm, stepMm);
  const n = line.length;
  if (n < 2) return line;
  const C = E.centre, base = acc.positions.length / 3;
  for (let i = 0; i < n; i++) {
    const p = line[i], a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let nx = p[0] - C[0], ny = p[1] - C[1], nz = p[2] - C[2];
    const d = nx * tx + ny * ty + nz * tz; nx -= d * tx; ny -= d * ty; nz -= d * tz; // the surface normal, square to the course
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx; // across the course, in the surface
    const t = i / (n - 1);
    const g = give ? give(p[0], p[1], p[2]) : 0;
    let w = widthAt(t) * (1 - (1 - STRIP_GIVE.widthKeep) * g);
    if ((capStart && i === 0) || (capEnd && i === n - 1)) w *= 0.02; // a closed, rounded end (no open tube end)
    else if ((capStart && i === 1) || (capEnd && i === n - 2)) w *= 0.6;
    const hw = 0.5 * w, ht = 0.5 * w * flat;
    // it sits on the envelope; over a key it narrows and sinks under the key's own surface (STRIP_GIVE): below the
    // LOCAL surface radius, not the envelope's (which bridges to the neighbouring crowns and can lie mm above a key)
    let lift = liftMm + ht * 0.9;
    if (g > 0 && E.local) {
      const R = Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) || 1;
      const rl = envelopeRadius(E.local, (p[0] - C[0]) / R, (p[1] - C[1]) / R, (p[2] - C[2]) / R);
      lift += g * ((Math.min(rl, R) - R) - STRIP_GIVE.tuckMm - 2 * ht - lift);
    }
    const cx = p[0] + nx * lift, cy = p[1] + ny * lift, cz = p[2] + nz * lift;
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * 2 * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang);
      acc.positions.push(cx + bx * hw * ca + nx * ht * sa, cy + by * hw * ca + ny * ht * sa, cz + bz * hw * ca + nz * ht * sa);
      // the ellipse's normal: (cos / hw, sin / ht) in (across, up), normalised
      let qx = bx * ca / hw + nx * sa / ht, qy = by * ca / hw + ny * sa / ht, qz = bz * ca / hw + nz * sa / ht; const ql = Math.hypot(qx, qy, qz) || 1;
      acc.normals.push(qx / ql, qy / ql, qz / ql);
    }
  }
  for (let i = 0; i + 1 < n; i++) for (let s = 0; s < sides; s++) {
    const a = base + i * sides + s, b = base + i * sides + ((s + 1) % sides), c = base + (i + 1) * sides + s, d2 = base + (i + 1) * sides + ((s + 1) % sides);
    acc.indices.push(a, c, b, b, c, d2);
  }
  return line;
}

/** A tributary off a draped course: from the point at `at` (0..1), at `angleDeg` from the course in the surface (sign:
 * to one side or the other), `lengthMm` long, bending a little toward the course's direction. Returns its points. */
function twigPoints(E, line, at, angleDeg, lengthMm) {
  const n = line.length, i = Math.max(1, Math.min(n - 2, Math.round(at * (n - 1))));
  const p = line[i], a = line[i - 1], b = line[i + 1], C = E.centre;
  let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  let nx = p[0] - C[0], ny = p[1] - C[1], nz = p[2] - C[2]; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  const pts = [];
  const steps = Math.max(3, Math.round(lengthMm / 2));
  for (let k = steps; k >= 0; k--) { // from the twig's free end to the vein (so it widens toward the vein)
    const s = (k / steps) * lengthMm, ang = (angleDeg * Math.PI / 180) * (1 - 0.35 * (k / steps)); // it curves
    // pointing back along the course (-t): a tributary runs INTO the vein in the direction of flow
    const dx = -Math.cos(ang) * tx + Math.sin(ang) * bx, dy = -Math.cos(ang) * ty + Math.sin(ang) * by, dz = -Math.cos(ang) * tz + Math.sin(ang) * bz;
    pts.push([p[0] + dx * s, p[1] + dy * s, p[2] + dz * s]);
  }
  return pts;
}

/**
 * Lay every vein and sinus of VEIN_COURSES on the envelope. give: optional (x, y, z) -> 0..1 (STRIP_GIVE). Returns
 * { veins: { positions, normals, indices }, sinus: { ... }, names: [...], counts }. Arrays are plain Float32Array /
 * Uint32Array. Pure.
 */
export function buildCerebralVeins(E, { courses = VEIN_COURSES, give = null } = {}) {
  const accV = { positions: [], normals: [], indices: [] }, accS = { positions: [], normals: [], indices: [] };
  const names = [];
  for (const c of courses) {
    const sides = c.side === 'mid' ? ['m'] : c.side === 'both' ? ['l', 'r'] : [c.side]; // 'l' / 'r': that side only
    for (const sd of sides) {
      const pts = c.points.map(p => (sd === 'r' ? [-p[0], p[1] + (c.shiftR || 0) * (Math.abs(p[0]) > 2 ? 1 : 0.5), p[2]] : p.slice()));
      const k = c.dominant && c.dominant !== sd ? (c.minor || 0.6) : 1;
      const w0 = c.width[0] * k, w1 = c.width[1] * k;
      const widthAt = t => w0 + (w1 - w0) * smooth01(t);
      const acc = c.kind === 'sinus' ? accS : accV;
      const seed = `${c.name}|${sd}`;
      const line = layVessel(E, pts, widthAt, acc, { flat: c.flat || VEIN_LOOK.flat, give: c.kind === 'sinus' ? null : give, seed, wander: c.wander !== false,
        capEnd: c.kind === 'sinus' ? c.name === 'transverse sinus' : !c.to, capStart: c.name !== 'transverse sinus' });
      const twigs = c.twigs || (c.to === 'sss' ? defaultTwigs(c.name, sd) : []);
      for (const [at, ang, len, w] of twigs) {
        const tp = twigPoints(E, line, at, sd === 'r' ? -ang : ang, len);
        layVessel(E, tp, t => w * k * (0.4 + 0.6 * t), acc, { flat: VEIN_LOOK.flat, give, capEnd: false, smooth: 1, seed: `${seed}|${at}`, wander: false });
      }
      names.push(`${sd === 'm' ? '' : sd === 'l' ? 'left ' : 'right '}${c.name}`);
    }
  }
  const pack = a => ({ positions: Float32Array.from(a.positions), normals: Float32Array.from(a.normals), indices: Uint32Array.from(a.indices) });
  const veins = pack(accV), sinus = pack(accS);
  return { veins, sinus, names, counts: { courses: names.length, triangles: (veins.indices.length + sinus.indices.length) / 3, vertices: (veins.positions.length + sinus.positions.length) / 3 } };
}

/** Per-vertex give (0..1) of an artery mesh over the strip: smooth from nearMm to fullMm of the nearest strip vertex. */
export function stripGive(positions, near, o = STRIP_GIVE) {
  const out = new Float32Array(positions.length / 3);
  for (let i = 0; i < out.length; i++) out[i] = 1 - smooth01((near(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]) - o.fullMm) / (o.nearMm - o.fullMm));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Shader pieces (the scene adds them to MeshStandardMaterial programs that already carry the living brain's vertex rule)

const f = x => (Number.isInteger(x) ? `${x}.0` : `${x}`);
/** Vertex: after the living brain's move (`transformed += nsLiveMove( position )`): an artery swells along its normal
 * with the beat; a vessel over a key sinks toward the brain's centre by its give (attribute nsGive) x tuckMm. */
export function vesselVertexGlsl({ pulseMm = 0, tuckMm = 0 } = {}) {
  return `\n\ttransformed += objectNormal * ( ${f(pulseMm)} * nsLive.y );` +
    (tuckMm ? `\n\ttransformed += normalize( nsLiveC.xyz - position ) * ( ${f(tuckMm)} * nsGive );` : '');
}
/** Fragment: the arteries brighten a little at the top of a beat. */
export function vesselFragmentGlsl({ pulseGlow = 0 } = {}) {
  return `\n\tdiffuseColor.rgb *= 1.0 + ${f(pulseGlow)} * nsLive.y;`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The vessels of the bodies (18 November 2026, package VESSELS): "and for all other items as well"
//
// The named vessels of both legs and the right arm, from BodyParts3D 4.0 (packet bodyparts3d-body-vessels-r1): the
// great and small saphenous veins, the femoral artery and vein, the popliteal artery and vein, the anterior and
// posterior tibial arteries, the posterior tibial vein, the dorsalis pedis artery, the superficial epigastric vein; the
// axillary artery and vein, the brachial artery, the radial and ulnar arteries, the cephalic, basilic, median cubital
// and median antebrachial veins and the dorsal venous network of the hand. The atlas's meshes are heavy (24.6 MB for
// these), so the packet holds their CENTRE LINES and radii (derived offline, method in the packet), and the game
// rebuilds light round tubes. Each centre-line point is RIVETED to the BODY_VESSEL_LOOK.rivets nearest vertices of the
// drawn muscles and bones of its own side (inverse-distance weights, each with its distance along that vertex's normal):
// as those vertices are posed, skinned per vertex and lifted by the Body Worlds stack, the point follows the surface
// it lies on, so the vessels stay on the limbs through every movement without a rig of their own. Superficial veins are
// kept at least their radius + superficialGapMm off the surface (they lie on the muscles); deep vessels keep their
// place between the muscles, and show where the muscles leave them uncovered, as in a dissection.

export const BODY_VESSELS_PACKET = 'bodyparts3d-body-vessels-r1';
export const BODY_VESSELS_DEFAULTS = Object.freeze({
  url: '../../packets/bodyparts3d-body-vessels-r1/BODY-VESSEL-CENTRELINES.json',
  sha256: 'c86600f42d7541de96ab3e782b43bbecd9b19339c28f8a8c6132326ee0626c3f'
});
/** Vessels left out of the full body: your LEFT arm is the game arm, drawn and skinned by its own rig (ns-arm), not by
 * the full body these vessels are riveted to; its vessels would hang where that arm is not. Not wired yet. */
export const BODY_VESSEL_SKIP = /\bleft\b.*\b(axillary|brachial|radial|ulnar|cephalic|basilic|median cubital|median antebrachial)\b|network of left hand/;
export const BODY_VESSEL_LOOK = Object.freeze({ rivets: 4, sides: 6, every: 2, smoothPasses: 6, minR: Object.freeze({ artery: 1.0, vein: 1.1 }), maxR: 3.2, superficialGapMm: 0.3, searchMm: 40, sideMm: 12 });

/** Check the centre-line file. Returns the vessels (frozen). Throws ns:vessel_manifest. */
export function validateBodyVessels(d) {
  if (!d || d.packet !== BODY_VESSELS_PACKET || !Array.isArray(d.vessels) || !d.vessels.length || d.vessels.length > 200) fail('vessel_manifest', 'not the body-vessel centre lines');
  return Object.freeze(d.vessels.map(v => {
    if (!v || !ID_RE.test(v.element_id) || (v.kind !== 'artery' && v.kind !== 'vein') || (v.side !== 'left' && v.side !== 'right') || !Array.isArray(v.branches)) fail('vessel_manifest', `bad vessel ${v && v.element_id}`);
    for (const b of v.branches) {
      if (!Array.isArray(b) || b.length < 2 || b.length > 2000) fail('vessel_manifest', `bad branch in ${v.element_id}`);
      for (const p of b) if (!Array.isArray(p) || p.length !== 4 || !p.every(Number.isFinite) || Math.abs(p[0]) > 400 || p[2] < -200 || p[2] > 2000) fail('vessel_manifest', `bad point in ${v.element_id}`);
    }
    return Object.freeze({ id: v.element_id, name: String(v.name), kind: v.kind, side: v.side, superficial: Boolean(v.superficial), branches: v.branches });
  }));
}

/** Load the centre lines (sha256 must equal the pin before parsing). */
export async function loadBodyVessels({ fetchText, sha256Hex, url = BODY_VESSELS_DEFAULTS.url, expectedSha256 = BODY_VESSELS_DEFAULTS.sha256 } = {}) {
  if (typeof fetchText !== 'function' || typeof sha256Hex !== 'function') fail('vessel_args', 'fetchText and sha256Hex must be injected');
  const text = await fetchText(url);
  const s = await sha256Hex(text);
  if (expectedSha256 && s !== expectedSha256) fail('vessel_manifest', `body-vessel file sha256 ${s} is not the pinned one`);
  return validateBodyVessels(JSON.parse(text));
}

function vertexNormals(P, I) {
  const N = new Float32Array(P.length);
  if (I) for (let i = 0; i + 2 < I.length; i += 3) {
    const a = 3 * I[i], b = 3 * I[i + 1], c = 3 * I[i + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}

/**
 * Rivet the vessels' centre lines to the body's source meshes. vessels: validateBodyVessels() (one kind, or both);
 * meshes: [{ id, positions (source mm), indices }] (the drawn muscles and bones; the drawn geometry must keep the source
 * vertex order, as the bake, the lift and the skin do). Returns { meshIds, points, k, mesh, vertex, weight, dn, radius,
 * branchStart, names, unbound } (typed arrays; mesh[] indexes meshIds). Pure.
 */
export function bindBodyVessels(vessels, meshes, o = BODY_VESSEL_LOOK, { dropUnbound = 0.3 } = {}) {
  const B = bindOnce(vessels, meshes, o);
  if (!(dropUnbound > 0) || !B.unbound) return B;
  // a branch whose points mostly found no drawn surface of their side (the left arm's vessels on a body whose left arm
  // is drawn by the game arm's own rig) is left out, and the rest bound again
  const keep = vessels.map(v => ({ ...v, branches: v.branches.filter((b, j) => B.branchUnbound[B.vesselBranch.get(v)[j]] <= dropUnbound * (B.branchStart[B.vesselBranch.get(v)[j] + 1] - B.branchStart[B.vesselBranch.get(v)[j]])) })).filter(v => v.branches.length);
  const B2 = bindOnce(keep, meshes, o);
  B2.dropped = vessels.filter(v => !keep.some(q => q.id === v.id)).map(v => v.name);
  return B2;
}
function bindOnce(vessels, meshes, o) {
  const k = o.rivets, cell = 6;
  const side = P => { let x = 0; for (let i = 0; i < P.length; i += 3) x += P[i]; x /= P.length / 3; return x > o.sideMm ? 'left' : x < -o.sideMm ? 'right' : 'mid'; };
  const grids = { left: new Map(), right: new Map() }, key = (a, b, c) => ((a & 1023) * 1024 + (b & 1023)) * 1024 + (c & 1023);
  // only vertices near some vessel of that side are searched (the box of its points widened by searchMm)
  const box = { left: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], right: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity] };
  for (const v of vessels) { const b = box[v.side]; for (const br of v.branches) for (const p of br) for (let j = 0; j < 3; j++) { b[j] = Math.min(b[j], p[j] - o.searchMm); b[3 + j] = Math.max(b[3 + j], p[j] + o.searchMm); } }
  const inBox = (b, x, y, z) => x >= b[0] && y >= b[1] && z >= b[2] && x <= b[3] && y <= b[4] && z <= b[5];
  const meshIds = [], normals = [], positions = [];
  meshes.forEach((m, mi) => {
    meshIds.push(m.id); positions.push(m.positions); normals.push(null);
    const s = side(m.positions), P = m.positions;
    for (const sd of s === 'mid' ? ['left', 'right'] : [s]) {
      const g = grids[sd], b = box[sd];
      for (let v = 0; v < P.length / 3; v++) {
        const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
        if (!inBox(b, x, y, z)) continue;
        const kk = key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell));
        let a = g.get(kk); if (!a) g.set(kk, a = []); a.push(mi, v);
      }
    }
  });
  const normalsOf = mi => normals[mi] || (normals[mi] = vertexNormals(positions[mi], meshes[mi].indices)); // only meshes riveted to
  // every o.every-th point of the 3 mm lines is used (6 mm: limb vessels bend gently; the per-change cost is the
  // number of points), the last point always
  const thin = b => (o.every > 1 ? b.filter((p, i) => i % o.every === 0 || i === b.length - 1) : b); // keeps both ends
  let n = 0, nb = 0; for (const v of vessels) for (const b of v.branches) { n += thin(b).length; nb++; }
  const mesh = new Int32Array(n * k).fill(-1), vertex = new Int32Array(n * k), weight = new Float32Array(n * k), dn = new Float32Array(n * k), radius = new Float32Array(n);
  const branchStart = new Int32Array(nb + 1), names = [], branchUnbound = new Int32Array(nb), vesselBranch = new Map();
  let at = 0, bi = 0, unbound = 0;
  const bestD = new Float64Array(k), bestM = new Int32Array(k), bestV = new Int32Array(k);
  for (const v of vessels) {
    const g = grids[v.side], rmin = o.minR[v.kind];
    vesselBranch.set(v, []);
    for (const b0 of v.branches) {
      vesselBranch.get(v).push(bi);
      branchStart[bi++] = at; names.push(v.name);
      for (const p of thin(b0)) {
        const r = Math.min(o.maxR, Math.max(rmin, p[3]));
        radius[at] = r;
        bestD.fill(Infinity); bestM.fill(-1);
        const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
        for (let reach = 1; reach * cell <= o.searchMm; reach++) {
          for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) for (let l = -reach; l <= reach; l++) {
            if (Math.max(Math.abs(i), Math.abs(j), Math.abs(l)) !== reach && reach > 1) continue; // only the new shell
            const a = g.get(key(cx + i, cy + j, cz + l)); if (!a) continue;
            for (let q = 0; q < a.length; q += 2) {
              const P = positions[a[q]], vi = a[q + 1];
              const d = Math.hypot(P[3 * vi] - p[0], P[3 * vi + 1] - p[1], P[3 * vi + 2] - p[2]);
              if (d >= bestD[k - 1]) continue;
              let s = k - 1; while (s > 0 && bestD[s - 1] > d) { bestD[s] = bestD[s - 1]; bestM[s] = bestM[s - 1]; bestV[s] = bestV[s - 1]; s--; }
              bestD[s] = d; bestM[s] = a[q]; bestV[s] = vi;
            }
          }
          if (bestM[k - 1] >= 0 && bestD[k - 1] <= reach * cell) break;
        }
        if (bestM[0] < 0) { unbound++; branchUnbound[bi - 1]++; at++; continue; }
        let ws = 0;
        for (let s = 0; s < k; s++) {
          if (bestM[s] < 0) continue;
          const P = positions[bestM[s]], N = normalsOf(bestM[s]), vi = bestV[s];
          let d = (p[0] - P[3 * vi]) * N[3 * vi] + (p[1] - P[3 * vi + 1]) * N[3 * vi + 1] + (p[2] - P[3 * vi + 2]) * N[3 * vi + 2];
          if (v.superficial) d = Math.max(d, r + o.superficialGapMm);
          const w = 1 / ((bestD[s] + 0.5) ** 2);
          mesh[at * k + s] = bestM[s]; vertex[at * k + s] = vi; weight[at * k + s] = w; dn[at * k + s] = d; ws += w;
        }
        for (let s = 0; s < k; s++) weight[at * k + s] /= ws || 1;
        at++;
      }
    }
  }
  branchStart[nb] = at;
  return { meshIds, points: n, k, mesh, vertex, weight, dn, radius, branchStart, names, unbound, branchUnbound, vesselBranch, dropped: [] };
}

/**
 * Where the riveted points are now. R[meshIndex] = { p, n, m } (the drawn mesh's position and normal arrays in its own
 * frame and its 4x4 column-major matrix into the common frame) or null (that mesh is not drawn: its rivets are skipped
 * and the others reweighted). Writes out (Float32Array(points x 3)); returns how many points were placed. No
 * allocation.
 */
export function evalBodyVessels(B, R0, out) {
  const k = B.k; let placed = 0;
  for (let i = 0; i < B.points; i++) {
    let x = 0, y = 0, z = 0, ws = 0;
    for (let s = 0; s < k; s++) {
      const mi = B.mesh[i * k + s]; if (mi < 0) continue;
      const R = R0[mi]; if (!R) continue;
      const v = 3 * B.vertex[i * k + s], P = R.p, N = R.n, m = R.m, w = B.weight[i * k + s], d = B.dn[i * k + s];
      const px = P[v], py = P[v + 1], pz = P[v + 2], nx = N[v], ny = N[v + 1], nz = N[v + 2];
      const qx = px + nx * d, qy = py + ny * d, qz = pz + nz * d;
      x += w * (m[0] * qx + m[4] * qy + m[8] * qz + m[12]); y += w * (m[1] * qx + m[5] * qy + m[9] * qz + m[13]); z += w * (m[2] * qx + m[6] * qy + m[10] * qz + m[14]);
      ws += w;
    }
    if (ws > 0) { out[3 * i] = x / ws; out[3 * i + 1] = y / ws; out[3 * i + 2] = z / ws; placed++; }
  }
  // Where neighbouring points hang from different limb segments (across a joint), a bent joint pulls them apart: a few
  // light smoothing passes along each vessel spread that over several pieces (a short bridge, not one long wire).
  const passes = BODY_VESSEL_LOOK.smoothPasses;
  if (passes > 0) {
    const t = B.scratch || (B.scratch = new Float32Array(out.length));
    for (let it = 0; it < passes; it++) {
      t.set(out);
      for (let b = 0; b + 1 < B.branchStart.length; b++) for (let i = B.branchStart[b] + 1; i + 1 < B.branchStart[b + 1]; i++) for (let c = 0; c < 3; c++) out[3 * i + c] = 0.25 * t[3 * i - 3 + c] + 0.5 * t[3 * i + c] + 0.25 * t[3 * i + 3 + c];
    }
  }
  return placed;
}

/** Triangle indices of the tubes (rings of `sides` vertices per point; nothing between branches). */
export function bodyTubeIndex(B, sides = BODY_VESSEL_LOOK.sides) {
  const idx = [];
  for (let b = 0; b + 1 < B.branchStart.length; b++) for (let i = B.branchStart[b]; i + 1 < B.branchStart[b + 1]; i++) for (let s = 0; s < sides; s++) {
    const a = i * sides + s, c = i * sides + ((s + 1) % sides), d = (i + 1) * sides + s, e = (i + 1) * sides + ((s + 1) % sides);
    idx.push(a, d, c, c, d, e);
  }
  return Uint32Array.from(idx);
}

/** Ring vertices round the placed centre lines (round tubes, ends closed to a point). pts: evalBodyVessels' out. */
export function writeBodyTubes(B, pts, outPos, outNor, sides = BODY_VESSEL_LOOK.sides) {
  for (let b = 0; b + 1 < B.branchStart.length; b++) {
    const i0 = B.branchStart[b], i1 = B.branchStart[b + 1] - 1;
    let ux = 0, uy = 0, uz = 1; // a carried reference direction (parallel transport keeps the rings from twisting)
    for (let i = i0; i <= i1; i++) {
      const a = Math.max(i0, i - 1), c = Math.min(i1, i + 1);
      let tx = pts[3 * c] - pts[3 * a], ty = pts[3 * c + 1] - pts[3 * a + 1], tz = pts[3 * c + 2] - pts[3 * a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const dd = ux * tx + uy * ty + uz * tz; ux -= dd * tx; uy -= dd * ty; uz -= dd * tz;
      let ul = Math.hypot(ux, uy, uz);
      if (ul < 1e-3) { ux = Math.abs(tx) < 0.9 ? 1 : 0; uy = Math.abs(tx) < 0.9 ? 0 : 1; uz = 0; const d2 = ux * tx + uy * ty; ux -= d2 * tx; uy -= d2 * ty; uz -= d2 * tz; ul = Math.hypot(ux, uy, uz); }
      ux /= ul; uy /= ul; uz /= ul;
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
      const r = (i === i0 || i === i1) ? 0.05 * B.radius[i] : B.radius[i];
      for (let s = 0; s < sides; s++) {
        const an = (s / sides) * 2 * Math.PI, ca = Math.cos(an), sa = Math.sin(an), o = 3 * (i * sides + s);
        const nx = ux * ca + vx * sa, ny = uy * ca + vy * sa, nz = uz * ca + vz * sa;
        outPos[o] = pts[3 * i] + nx * r; outPos[o + 1] = pts[3 * i + 1] + ny * r; outPos[o + 2] = pts[3 * i + 2] + nz * r;
        outNor[o] = nx; outNor[o + 1] = ny; outNor[o + 2] = nz;
      }
    }
  }
}
