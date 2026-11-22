/** NeuroSurge: the ELECTRICAL MAP, the pure model (21 November 2026, section 192).
 *
 * The owner, 21 November: "Let's continue working on the neurosurge game. And let's try an electrical mapping view, like
 * you see in functional neuroscience, connectomic live maps, dynamic maps." And on 20 November: "a connectomic activity
 * map, or ... a functional neuroscience map where we can actually see activity, color-coded ... electrical storms and
 * electrical activity and neural activity and networks and pathways ... throughout the entire body, from brain to body
 * and body to brain. And then we can tie that to muscle contraction."
 *
 * WHAT THE PLAYER GETS (the M key; ns-controls EMAP_CODE). The picture goes dim and the nervous system appears over it
 * as fine lines of light: fibres from every block of the motor strip down through the brain to the brainstem, a cord
 * down the mirror body's spine (and your own), nerves into the limbs, the trunk and the face. An area switched on sends
 * a bright front in its own colour down its own route, crossing sides where the real fibres cross, out along the nerve
 * to the muscles of that movement; paler beads run back up beside it to the sensory strip (the body's report); fainter
 * pulses spread to the brain regions the block is linked with. At rest a few slow sparks drift along the wiring.
 *
 * WHAT IT IS. A drawn picture of the game's made-up, unitless signal on TYPICAL, SIMPLIFIED routes laid by hand over an
 * atlas that has no spinal cord and no nerves. Nothing is traced from a scan, nothing is measured, and the travel is
 * slowed so it can be seen (EMAP.realMmS against the display speed; the legend says by how much). The courses of the
 * nerves, the level of each nerve and the nerve of each muscle come from a data object in the shapes of section 193
 * (`wiring`: NERVE_TRUNKS, nerveForMuscle, mirrorTrunk, CORD_LEVELS, cordLevelAt, BRAIN_LINKS); until that module is
 * in the game a stand-in is used (ns-emap-standin.mjs).
 *
 * HOW IT IS BUILT (this file; the drawing is ns-emap-three.mjs).
 *  - A WIRE is one smooth line of nodes. Every node carries a rest place in atlas millimetres and the thing it rides:
 *    the big brain, a segment of the body rig, or a segment of the left game arm (a blend of two where a line crosses a
 *    joint, and a blend of two PLACES for the drawn bridge from the big brain to the mirror body's spine).
 *  - The body's wires are a tree per side: the cord's strand, the roots at their levels, the nerve trunks and their
 *    children, one branch per muscle. The brain's wires are one fibre per motor area (with a twig per movement's part
 *    of the block), a tail to each way out it needs (crossing in the low medulla or not, or to a head nerve's place in
 *    the brainstem), one fibre back up per area and way out to the sensory strip, and the area's links.
 *  - Every node has ONE time coordinate `a`: the display time, in seconds, at which a front that entered the cord at 0
 *    reaches it (negative inside the brain). A volley is then four numbers (start time, start coordinate, level,
 *    colour) and each lit wire two (how far the route uses it, and when the report enters it): the drawer evaluates
 *    fronts, beads and marks per pixel from those, so nothing is rewritten per vertex while the map runs.
 *  - emapStep is the per-frame state machine (slots = lit areas and sparks, wire states), with no allocation.
 *
 * Pure: no three.js, no DOM. Tested in Node (tests/emap.test.mjs).
 */
import { areaGlowColor } from './ns-colors.mjs';
import { hemisphereSideOf, backShareAt, HEMI_GAP } from './ns-brain-part.mjs';
import { SEGMENTS as ARM_SEGMENTS } from './ns-rig.mjs';

const freeze = Object.freeze;
const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };

/** The display rules of the map (21 November 2026; every value is a display choice, tuned on pictures, none measured).
 *  - slots / sparkSlots / slotWires: at most this many lit areas plus sparks at once, and wires per lit area.
 *  - dim / easeS: the dark ground. The finished picture is multiplied by (1 - dim) while the map is on (the bodies and
 *    the brain stay as a dim setting, about a third of their light), eased in and out over easeS seconds.
 *  - realMmS: a typical conduction speed of large nerve fibres, 50 metres a second (nerve conduction studies give about
 *    50 to 60 m/s in the arm and 40 to 50 m/s in the leg; the fastest fibre class of the textbooks, A-alpha, is quoted
 *    at 70 to 120 m/s). speedMmS: the slowest display speed of the command's front; the build raises it so the farthest
 *    muscle is reached within arriveMaxS (the movement itself starts at once in the game: the light must not lag it by
 *    more than a few frames). bridgeMm: what the drawn bridge between the big brain and the mirror body counts as (the
 *    two ends are one place of the body drawn twice; a little time is given so the front is seen to pass along it).
 *    upShare: the report's speed as a share of the command's (the farthest report reaches the strip in about half a
 *    second).
 *  - riseS / fadeS: a lit route comes up in riseS and, once its movement's light ends, fades over fadeS.
 *  - light: the command's line (hold: steady light behind the front; head / headS: the front's own glow and its length
 *    in seconds of travel; steady: what replaces the beads under reduced motion), the report's line (holdUp, headUp,
 *    headUpS), how much weaker the resting wiring is where something stands in front of it (hidden) and how much
 *    weaker a lit route is there (hiddenLit: less, a lit route inside the brain must still read), and how much wider
 *    than a resting line a lit one is drawn (wide).
 *  - bead: soft beads with long tails. downHz / upHz: beads passing a point per second (the calm rule: never more than
 *    three); downSpanS / upSpanS: the spacing in seconds of travel; tail / lead: the falloff behind and ahead of a
 *    bead's head (per span); brainScale: the spacing is this many times shorter inside the big brain, which is drawn
 *    many times larger than the bodies.
 *  - dot: the soft marks. A muscle's mark comes up when the front arrives (pop, fading over popS, on a steady hold);
 *    the sensory patch when the report arrives; the block's own mark while its route is lit. liftMm: a mark stands
 *    this far toward the eye so its own muscle does not hide it.
 *  - link: the pulses along a block's brain links: travelS to the far end, gone by fadeS, at gain of the route's light.
 *  - spark: the resting storm: at most `max` at once, one starting every everyS on average, each living lifeS[0..1]
 *    seconds (it rises and fades over its whole life), drifting driftMm along a line with a glow sigmaMm long (brain
 *    lines and body lines apart: the brain is drawn large).
 *  - stepMm: the spacing of the nodes along a line; jointMm: a line that passes from one bone to the next changes
 *    what it rides within this distance either side of the joint between them (where both bones put it at the same
 *    place), not all along the stretch between two course points (which bent it into a zigzag on a bent limb); widthMm: half the line's width; idle: the resting light of a line.
 *  - cord: the cord's strand lies backMm behind the line through the vertebral joint centres (toward the back, square
 *    to the column: the canal lies behind the vertebral bodies; a stated offset, not measured from the vertebrae) and
 *    halfMm to its own side; a root that runs down inside the column lies rootOutMm from the midline.
 *  - brain: hubMm: a block's twigs meet this far under its surface; sensBackMm: the sensory strip's point lies this far
 *    behind the block (then on the postcentral gyrus's nearest vertex where its surface is given); callosumUpMm: an arc
 *    between the halves passes this far above the lateral ventricles (the atlas has no corpus callosum).
 *  - sameSide: how strongly the uncrossed tail of an area is drawn, by the body map's `laterality` field.
 *  - colours (linear RGB): the idle wiring's cool grey-blue and a spark's pale light; paleUp: how far the report's
 *    colour goes toward white; whiteHead: how far the front's head goes toward white; whiteLit: how far every lit
 *    command line goes toward white (the dark area colours, the violets and blues, would not read on the dark ground). */
export const EMAP = freeze({
  slots: 32, sparkSlots: 6, slotWires: 448,
  dim: 0.68, easeS: 0.3,
  realMmS: 50000, speedMmS: 12500, arriveMaxS: 0.16, bridgeMm: 150, upShare: 0.3,
  riseS: 0.05, fadeS: 0.8,
  light: freeze({ hold: 0.42, head: 0.9, headS: 0.010, steady: 0.3, holdUp: 0.24, headUp: 0.7, headUpS: 0.006, hint: 0.4, hidden: 0.4, hiddenLit: 0.68, wide: 1.6 }),
  // (22 November 2026: downHz 1.5 -> 1.0 and upHz 2.2 -> 1.2: where the command's lane, the report's lane and the
  // traffic of part 3 lie in one pixel, their beads together came to four a second (a checker measured it in the page);
  // the lead's 1.2 and 1.4 still summed to four in the test of the summed lanes, 1.0 and 1.2 to three; then the cord's
  // two strands at several levels with the traffic weighted as drawn summed to four, and upHz is 1.0 too)
  bead: freeze({ downHz: 1.0, downSpanS: 0.05, gain: 0.75, upHz: 1.0, upSpanS: 0.03, gainUp: 0.8, tail: 4.5, lead: 28, brainScale: 4 }),
  dot: freeze({ hold: 0.5, pop: 0.8, popS: 0.22, patchHold: 0.45, patchPop: 0.95, patchS: 0.3, block: 0.8, liftMm: 55, brainLiftMm: 5,
    muscleMm: 15, patchMm: 3.3, blockMm: 2.6 }),
  link: freeze({ travelS: 0.7, fadeS: 1.0, gain: 0.6, sigmaS: 0.09, steady: 0.3 }),
  spark: freeze({ max: 6, everyS: 0.7, lifeS: freeze([1.5, 2.8]), brain: freeze({ sigmaMm: 3, driftMm: 16 }), body: freeze({ sigmaMm: 16, driftMm: 90 }) }),
  stepMm: freeze({ brain: 5, twig: 3.5, link: 7, body: 11, branch: 9, cord: 9 }), jointMm: 24,
  widthMm: freeze({ fibre: 0.17, twig: 0.13, tail: 0.17, sens: 0.15, link: 0.12, net: 0.13, bundle: 0.12, local: 0.11, bridge: 0.3, cord: 2.4, root: 1.1, trunk: 1.7, branch: 1.1 }),
  // (22 November 2026, part 3: the links of the areas rest at 0.3 instead of 0 (they carry traffic now), the network's
  // fibres: bundle and local; later the same day, after a checker: links 0.15, bundle and local 0.2)
  idle: freeze({ fibre: 0.62, twig: 0.6, tail: 0.5, sens: 0.3, link: 0.15, net: 0.4, bundle: 0.2, local: 0.2, bridge: 0.25, cord: 1.25, root: 0.8, trunk: 1, branch: 0.7 }),
  /** 22 November 2026 (part 3; the owner: "electrical wire, electrical storm activity going everywhere"): the network's
   * fibres in the brain. Every link of the wiring data is drawn as a bundle of `fibres` fine fibres, each from its own
   * point of the two regions' surfaces (fanned at the ends) through the link's middle, a little apart there (bundleMm);
   * a link with no station of its own and no crossing bends through a middle point sunk toward its half's middle by
   * bundleSink of its length (22 November 2026: 6 straight fibres a link ran as chords through the brain's middle,
   * right behind the mirror body, and buried its torso: a checker's finding; now 3, bent, resting at 0.2);
   * neighbouring surface regions of one half are joined by `local.fibres` short fibres each (at most local.perRegion
   * neighbours a region and local.max pairs in all; only between surface points nearer than local.maxMm), sunk toward
   * the half's middle by local.sink of their length (the short fibres under the cortex). Generated by these rules and
   * stated as drawn: not traced from a scan. */
  scan: freeze({ fibres: 3, bundleMm: 3.2, bundleSink: 0.3, local: freeze({ fibres: 2, perRegion: 4, max: 160, maxMm: 45, sink: 0.22 }),
    surface: /gyrus|lobe|lobul|insula|cuneus|pole|hippocamp|cerebellum/i, notRegion: /ventricle|aqueduct|white matter|habenula|tuber|pineal|colliculus/i }),
  cord: freeze({ backMm: 9, halfMm: 2.6, rootOutMm: 6 }),
  brain: freeze({ hubMm: 7, sensBackMm: 11, callosumUpMm: 4 }),
  sameSide: freeze({ contralateral: 0.4, contralateral_predominant: 0.55, bilateral_contralateral_bias: 0.75, bilateral: 1, bilateral_debated: 1, 'bilateral network': 1 }),
  colours: freeze({ idle: freeze([0.2, 0.32, 0.5]), spark: freeze([0.72, 0.88, 1.0]), paleUp: 0.62, whiteHead: 0.55, whiteLit: 0.22 })
});

/** Bits of a vertex's flags (the drawer reads them): a mark (dot) and its kind; a line lit by the report only (sens);
 * a brain link (a pulse runs along it); a two-way line (the command and the report each on its own lane); a wire of
 * the head (not drawn on your own body in the eye view, where your head is not drawn); and whose it is. */
export const EMAP_FLAG = freeze({ dot: 1, sens: 2, link: 4, lanes: 8, dotMuscle: 16, dotPatch: 32, dotBlock: 64, head: 128, own: 256, mirror: 512, bridge: 1024, brain: 2048,
  // 22 November 2026 (part 3): a fibre of the brain's network (storms run along it from its regions), a strand of the cord
  net: 4096, cord: 8192,
  // (22 November 2026, fifth pass: a root of the cord: with the cord it makes the bright line down the mirror body's back)
  root: 16384 });

/** A slot's mode in the slot table: off, a lit area (front, beads both ways, marks), a spark, a steady faint hint. */
export const EMAP_MODE = freeze({ off: 0, area: 1, spark: 3, hint: 4 });

/** The brain meshes the routes are laid through, by their ids in inputs/MESH-MANIFEST.json (BodyParts3D), per half. */
export const EMAP_BRAIN_MESH = freeze({
  capsule: freeze({ left: 'FJ1750', right: 'FJ1751' }), midbrain: freeze({ left: 'FJ1770', right: 'FJ1817' }),
  pons: freeze({ left: 'FJ1775', right: 'FJ1822' }), medulla: freeze({ left: 'FJ1769', right: 'FJ1831' }),
  postcentral: freeze({ left: 'FJ1797', right: 'FJ1798' }), precentral: freeze({ left: 'FJ1800', right: 'FJ1801' }),
  ventricle: freeze({ left: 'FJ1767', right: 'FJ1814' })
});

/** Where a fibre passes through each mesh, as shares of the mesh's own box (x from the half's inner face outward, y
 * from front to back, z from bottom to top), for an area at q along the strip (0 = the mouth end, 1 = the leg end:
 * the leg's fibres lie behind the face's in the capsule and outside them in the brainstem, as taught). Typical places,
 * stated, not traced. [x0, xq, y0, yq, z]: x = x0 + xq q, y = y0 + yq q. */
export const EMAP_STATIONS = freeze({
  capTop: freeze(['capsule', 0.35, 0.3, 0.42, 0.38, 0.95]), capBot: freeze(['capsule', 0.25, 0.2, 0.45, 0.33, 0.06]),
  crus: freeze(['midbrain', 0.45, 0.35, 0.25, 0.12, 0.5]), pons: freeze(['pons', 0.25, 0.2, 0.25, 0, 0.5]),
  pyrTop: freeze(['medulla', 0.28, 0.1, 0.14, 0, 0.72]), pyrLow: freeze(['medulla', 0.25, 0.08, 0.16, 0, 0.38]),
  // the way out to the cord (one per side of the body), the crossing's middle, the uncrossed tail's bend
  cordExit: freeze(['medulla', 0.45, 0, 0.55, 0, 0]), crossMid: freeze(['medulla', 0, 0, 0.26, 0.1, 0.2]), sameBend: freeze(['medulla', 0.27, 0.07, 0.3, 0, 0.15]),
  // the report's way up: the relay low in the medulla, its crossing, then the back part of the brainstem, a point
  // inside the capsule's inner face (the atlas has no thalamus) and the back of the capsule (spread along the strip like
  // the fibres down, so the bundle is a band of lines and not one line drawn many times)
  dcn: freeze(['medulla', 0.22, 0.14, 0.8, 0, 0.3]), lemCross: freeze(['medulla', 0, 0, 0.5, 0.1, 0.55]), lem: freeze(['medulla', 0.16, 0.14, 0.5, 0, 0.85]),
  ponsBack: freeze(['pons', 0.24, 0.16, 0.7, 0, 0.5]), midBack: freeze(['midbrain', 0.42, 0.22, 0.6, 0, 0.5]),
  relay: freeze(['capsule', -0.26, 0.16, 0.66, 0.12, 0.4]), capBack: freeze(['capsule', 0.52, 0.2, 0.94, -0.14, 0.92])
});

/** A head nerve's place in the brainstem by its `origin` (the j-th of that part on its side): [mesh, x, xj, y, z, zj]. */
export const EMAP_NUCLEI = freeze({ midbrain: freeze(['midbrain', 0.3, 0.06, 0.55, 0.5, -0.12]), pons: freeze(['pons', 0.42, 0.1, 0.62, 0.6, -0.2]), medulla: freeze(['medulla', 0.32, 0.08, 0.5, 0.78, -0.16]) });

const HEAD_SEGMENTS = freeze(['skull', 'mandible', 'hyoid', 'cervical']);
const BIG = 1e9;

/* ------------------------------------------------------------------ the brain's meshes as boxes */

/** Boxes of the brain meshes from the manifest (inputs/MESH-MANIFEST.json `assets`): [{ id, name, min, max }] with the
 * two halves drawn apart exactly as the game draws them (ns-brain-part HEMI_GAP: a half's box moves eachMm away from
 * the midline, times the back share at the box's middle). For Node and for a page without loaded positions. Pure. */
export function brainBoxesFromManifest(assets, { eachMm = HEMI_GAP.eachMm } = {}) {
  const out = [];
  for (const a of Array.isArray(assets) ? assets : []) {
    if (!a || !Array.isArray(a.groups) || !a.groups.some(g => /brain/.test(g)) || !a.bounds_min || !a.bounds_max) continue;
    const name = String(a.embedded_source_name || a.element_id);
    let side = hemisphereSideOf({ name, positions: null });
    if (!side && !HEMI_GAP.middle.some(w => name.toLowerCase().includes(w))) side = a.bounds_min[0] >= -1 ? 1 : a.bounds_max[0] <= 0 ? -1 : 0;
    const d = side * eachMm * backShareAt((a.bounds_min[1] + a.bounds_max[1]) / 2);
    out.push({ id: a.element_id, name, min: [a.bounds_min[0] + d, a.bounds_min[1], a.bounds_min[2]], max: [a.bounds_max[0] + d, a.bounds_max[1], a.bounds_max[2]] });
  }
  return out;
}

/** Boxes from loaded positions (a Map id -> { name, positions }; the game's brain assets, already drawn apart), each
 * with `pts`: up to nPts of its own vertices, evenly through its list (22 November 2026, part 3: where the scan's
 * storms start and the network's fibres end). Pure. */
export function brainBoxesFromPositions(map, { nPts = 24 } = {}) {
  const out = [];
  for (const [id, m] of map) {
    const p = m && m.positions;
    if (!p || p.length < 3) continue;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let c = 0; c < 3; c++) { const v = p[i + c]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
    const nv = Math.floor(p.length / 3), k = Math.min(nPts, nv), pts = new Float32Array(3 * k);
    for (let j = 0; j < k; j++) { const v = Math.floor(((j + 0.5) / k) * nv); pts[3 * j] = p[3 * v]; pts[3 * j + 1] = p[3 * v + 1]; pts[3 * j + 2] = p[3 * v + 2]; }
    out.push({ id, name: String(m.name || id), min, max, pts });
  }
  return out;
}

/** Stand-in places of the motor areas for Node (the real ones are the areas' own key points, made by the page from the
 * segmented strip: scene.objects.regions): along a plain arc over each precentral gyrus's box by the area's `centre`
 * coordinate, each movement a little apart. For tests and tools only; says so. Pure. */
export function syntheticAreaAnchors(bodyMap, boxes) {
  const byId = new Map(boxes.map(b => [b.id, b]));
  const out = new Map();
  for (const r of bodyMap.regions) {
    const left = r.hemisphere === 'left', s = left ? 1 : -1, box = byId.get(EMAP_BRAIN_MESH.precentral[left ? 'left' : 'right']);
    if (!box) continue;
    const inner = left ? box.min[0] : box.max[0], outer = left ? box.max[0] : box.min[0];
    const place = c => { const t = Math.min(1, Math.max(0, c)); return [inner + (outer - inner) * (0.08 + 0.9 * Math.sin(t * Math.PI / 2)), box.min[1] + (box.max[1] - box.min[1]) * (0.45 + 0.2 * t), box.max[2] - (box.max[2] - box.min[2]) * (0.04 + 0.85 * t * t)]; };
    const keys = {};
    (r.actions || []).forEach((a, i) => { const p = place(Number.isFinite(a.uCentre) ? a.uCentre : r.centre); keys[a.id] = [p[0] + s * 0.4 * i, p[1] + 1.2 * i, p[2]]; });
    out.set(r.id, { centre: place(r.centre), keys });
  }
  return out;
}

/* ------------------------------------------------------------------ small geometry */

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** A node: a rest place and what it rides (`ia`; a blend toward `ib` by `w`; `q` is the second place of a bridge). */
const nodeAt = (p, seg) => ({ p: [p[0], p[1], p[2]], ia: seg, q: null, ib: seg, w: 0 });
const domSeg = n => (n.w > 0.5 ? n.ib : n.ia);

/** A smooth line through control points [{ p, seg, node? }] (a Hermite spline whose tangents follow the neighbours, as
 * long as the span: no overshoot), a node about every stepMm. A node between two points that ride different things is a
 * blend of the two (smooth across a joint): by `blend(A, B, p, t)` where given (0 = rides A's thing, 1 = B's), else
 * evenly along the span. A control point with `node` is copied exactly (a junction stays attached). */
export function sampleCurve(ctrl, stepMm, blend = null) {
  const n = ctrl.length, out = [];
  if (!n) return out;
  if (n === 1) { out.push(ctrl[0].node ? { ...ctrl[0].node } : nodeAt(ctrl[0].p, ctrl[0].seg)); return out; }
  const dir = [];
  for (let i = 0; i < n; i++) {
    const a = ctrl[Math.max(0, i - 1)].p, b = ctrl[Math.min(n - 1, i + 1)].p, l = dist3(a, b) || 1;
    dir.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]);
  }
  for (let i = 0; i + 1 < n; i++) {
    const A = ctrl[i], B = ctrl[i + 1], L = dist3(A.p, B.p), k = Math.max(1, Math.ceil(L / stepMm));
    for (let j = 0; j < k; j++) {
      if (j === 0 && A.node) { out.push({ ...A.node }); continue; }
      const t = j / k, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      const p = [0, 0, 0];
      for (let c = 0; c < 3; c++) p[c] = h00 * A.p[c] + h10 * L * dir[i][c] + h01 * B.p[c] + h11 * L * dir[i + 1][c];
      out.push({ p, ia: A.seg, q: null, ib: B.seg, w: A.seg === B.seg ? 0 : blend ? blend(A, B, p, t) : sm(t) });
    }
  }
  const Z = ctrl[n - 1];
  out.push(Z.node ? { ...Z.node } : nodeAt(Z.p, Z.seg));
  return out;
}

/* ------------------------------------------------------------------ the build */

/**
 * Build the map's model.
 *  bodyMap   ns-bodymap BODY_MOTOR_MAP ({ regions: [{ id, hemisphere, kind, pathway, laterality, order, actions }] }).
 *  rig       the body rig (ns-body buildBodyRig, or `rig` of packs/BODY-RIG.json): segmentOrder, segments, pivots.
 *  boxes     the brain meshes as boxes [{ id, name, min, max }] (brainBoxesFromManifest / brainBoxesFromPositions).
 *  areas     Map areaId -> { centre: [x, y, z], keys: { actionId: [x, y, z] } } in the drawn brain's millimetres.
 *  muscles   [{ id, name, side: 'left' | 'right', rig: 'body' | 'arm', seg, seg2?, w2?, centre: [x, y, z] }]: every
 *            muscle mesh of both rigs with its rest centre and what it rides.
 *  wiring    the nerve data in the contract's shapes (ns-emap-standin makeStandinWiring, later ns-wiring-data).
 *  resolveMuscles(region, action) -> [muscle ids]: the muscles the game lights for a movement (optional; the routes of
 *            those are complete and timed; any other pair is routed at run time as far as the wires go).
 *  surface   { left: Float32Array, right: Float32Array } positions of the two postcentral gyri (optional).
 * Returns the model: vertex arrays for the drawer, the wires, the areas' and muscles' routes, the timing.
 * buildEmapSteps is the same work as a generator that yields between its small steps (the page runs it a few
 * milliseconds at a time while the game is idle, so the first press of the map key finds it made and no frame waits for
 * it); buildEmap runs it to the end at once (Node, tests).
 */
export function buildEmap(input) {
  const g = buildEmapSteps(input);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
export function* buildEmapSteps({ bodyMap, rig, boxes, areas, muscles, wiring, resolveMuscles = null, surface = null, o = EMAP } = {}) {
  if (!bodyMap || !Array.isArray(bodyMap.regions)) fail('emap_input', 'bodyMap.regions is needed');
  if (!rig || !rig.segments || !rig.pivots || !Array.isArray(rig.segmentOrder)) fail('emap_input', 'the body rig is needed');
  if (!Array.isArray(boxes) || !boxes.length) fail('emap_input', 'the brain boxes are needed');
  if (!(areas instanceof Map)) fail('emap_input', 'areas must be a Map of the motor areas\' places');
  if (!wiring || typeof wiring !== 'object' || !wiring.NERVE_TRUNKS) fail('emap_input', 'the wiring data is needed');
  const warnings = [];
  const warn = s => { if (warnings.length < 60) warnings.push(s); };

  /* ---- palette: 0 the brain, then the body rig's segments, then the game arm's ---- */
  const bodySegs = rig.segmentOrder.slice(), armSegs = ARM_SEGMENTS.slice();
  const segIndex = new Map();
  bodySegs.forEach((s, i) => segIndex.set(s, 1 + i));
  const armBase = 1 + bodySegs.length, stride = bodySegs.length + armSegs.length;
  const armOf = s => { // the left arm of the body atlas belongs to the game arm's rig
    if (typeof s !== 'string' || !s.startsWith('l_')) return -1;
    const t = s.slice(2), name = t === 'forearm' ? 'ulna' : t === 'radius' ? 'forearm' : t;
    const i = armSegs.indexOf(name);
    return i < 0 ? -1 : armBase + i;
  };
  const drawnBody = new Set(bodySegs.filter(s => !(s === 'l_upperarm')));
  /** The palette index of a segment name of the wiring data (body, or the left arm's as the game arm), -1 if unknown. */
  const segOf = s => { const a = armOf(s); if (a >= 0) return a; return drawnBody.has(s) ? segIndex.get(s) : -1; };
  const armSegOf = s => { const i = armSegs.indexOf(s); return i < 0 ? -1 : armBase + i; };
  const firstSeg = (a, b, c) => (a >= 0 ? a : b >= 0 ? b : c);
  const headSeg = new Set(HEAD_SEGMENTS.map(s => segIndex.get(s)).filter(Number.isFinite));
  /* The joint between two things a line rides (palette indices), as a rest place, or null when they are not a bone and
   * its neighbour: for two body segments the pivot of the one that hangs on the other (up to three bones apart: the
   * pivot of the farther one); for two segments of the left game arm the right arm's pivot mirrored (the left arm is
   * the right arm's mirror in the atlas); between the left shoulder and the game arm the left shoulder joint. */
  const armAsBody = name => (name === 'upperarm' ? 'r_upperarm' : name === 'ulna' ? 'r_forearm' : name === 'forearm' ? 'r_radius' : `r_${name}`);
  const bodyPivot = (na, nb) => {
    const hangs = (child, anc) => { let g = rig.segments[child]; for (let i = 0; g && i < 3; i++) { if (g.parent === anc) return true; g = rig.segments[g.parent]; } return false; };
    const of = child => { const g = rig.segments[child], pv = g && g.joint ? rig.pivots[g.joint] : null; return pv && pv.point ? pv.point : null; };
    if (!rig.segments[na] || !rig.segments[nb]) return null;
    return hangs(nb, na) ? of(nb) : hangs(na, nb) ? of(na) : null;
  };
  const pivotCache = new Map();
  const pivotBetween = (ia, ib) => {
    const key = ia < ib ? ia * 1024 + ib : ib * 1024 + ia;
    if (pivotCache.has(key)) return pivotCache.get(key);
    let J = null;
    const aArm = ia >= armBase, bArm = ib >= armBase;
    if (ia > 0 && ib > 0) {
      if (!aArm && !bArm) J = bodyPivot(bodySegs[ia - 1], bodySegs[ib - 1]);
      else if (aArm && bArm) { const q = bodyPivot(armAsBody(armSegs[ia - armBase]), armAsBody(armSegs[ib - armBase])); J = q ? [-q[0], q[1], q[2]] : null; }
      else { const q = rig.pivots.r_glenohumeral && rig.pivots.r_glenohumeral.point; J = q ? [-q[0], q[1], q[2]] : null; }
    }
    pivotCache.set(key, J);
    return J;
  };
  /** How far a point between two course points has gone over to the second one's bone (0..1): see EMAP.jointMm. */
  const jointBlend = (A, B, p, t) => {
    const J = pivotBetween(A.seg, B.seg);
    if (!J) return sm(t);
    const ux = B.p[0] - A.p[0], uy = B.p[1] - A.p[1], uz = B.p[2] - A.p[2], L = Math.hypot(ux, uy, uz);
    if (!(L > 1e-6)) return sm(t);
    const along = q => ((q[0] - A.p[0]) * ux + (q[1] - A.p[1]) * uy + (q[2] - A.p[2]) * uz) / L;
    // The change is made over jointMm either side of the joint, and over more where the line passes far from the joint
    // (1.3 times that distance): on the inner side of a deep bend the two bones put the line's points far apart, and a
    // short change folded the line back on itself. Never beyond the two course points.
    // 21 November 2026, later (seen in a picture with W held: the lit nerves of your own raised arm were stair steps
    // at the shoulder): where the joint lies beside or beyond the stretch between the two course points, the change
    // was squeezed against that end (0.12 of the stretch: from one node to the next, so with the arm raised 80 degrees
    // one 9 mm step of the plexus became 39 mm with a 91 degree turn, and one of the nerve to the latissimus 104 mm).
    // The change now keeps its width, up to the whole stretch, and its middle moves inward for it (the same case:
    // 25 mm and 57 degrees; 44 mm). Stretches with the joint well inside them are as before.
    const aJ = along(J);
    const r = Math.hypot(J[0] - A.p[0] - ux / L * aJ, J[1] - A.p[1] - uy / L * aJ, J[2] - A.p[2] - uz / L * aJ);
    const zone = Math.max(1e-3, Math.min(0.5 * L, Math.max(o.jointMm, 1.3 * r)));
    const sJ = Math.min(L - zone, Math.max(zone, aJ));
    return sm((along(p) - sJ + zone) / (2 * zone));
  };

  /* ---- wires ---- */
  const wires = [];
  /** Add a wire. nodes: from the brain's end outward. a0: the coordinate (mm of travel, or seconds for a link) at the
   * first node; `back` true: a0 is at the LAST node and the coordinate falls toward the first. */
  function addWire(kind, key, nodes, { a0 = 0, unit = 'mm', back = false, flags = 0, copies = 'brain', width = o.widthMm[kind], idle = o.idle[kind], scale = 1, parent = -1, spark = true, aList = null } = {}) {
    const n = nodes.length, a = new Float64Array(n);
    let len = 0;
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) { len += dist3(nodes[i].p, nodes[i - 1].p); cum[i] = len; }
    if (aList) for (let i = 0; i < n; i++) a[i] = aList[i];
    else if (unit === 's') for (let i = 0; i < n; i++) a[i] = a0 + (len > 0 ? cum[i] / len : 0) * o.link.travelS;
    else for (let i = 0; i < n; i++) a[i] = back ? a0 - (len - cum[i]) : a0 + cum[i];
    const w = { id: wires.length, kind, key, nodes, a, unit, lenMm: len, flags, copies, width, idle, beadScale: scale, parent, spark: spark && len > 4 };
    wires.push(w);
    return w;
  }
  const nearestNode = (w, p) => { let bi = 0, bd = Infinity; for (let i = 0; i < w.nodes.length; i++) { const d = dist3(w.nodes[i].p, p); if (d < bd) { bd = d; bi = i; } } return { i: bi, d: bd }; };

  /* ---- the brain's stations ---- */
  const boxById = new Map(boxes.map(b => [b.id, b]));
  const sideKey = s => (s > 0 ? 'left' : 'right');
  const box = (mesh, s) => {
    const b = boxById.get(EMAP_BRAIN_MESH[mesh][sideKey(s)]);
    if (!b) fail('emap_brain', `the brain mesh ${mesh} (${sideKey(s)}) is not among the boxes`);
    return b;
  };
  /** A place in a mesh's box: fx from the half's inner face outward, fy from front to back, fz from bottom to top. */
  const inBox = (mesh, s, fx, fy, fz) => {
    const b = box(mesh, s), inner = s > 0 ? b.min[0] : b.max[0], outer = s > 0 ? b.max[0] : b.min[0];
    return [inner + (outer - inner) * fx, b.min[1] + (b.max[1] - b.min[1]) * fy, b.min[2] + (b.max[2] - b.min[2]) * fz];
  };
  const station = (name, s, q = 0) => { const S = EMAP_STATIONS[name]; return inBox(S[0], s, S[1] + S[2] * q, S[3] + S[4] * q, S[5]); };
  const callosumZ = Math.max(box('ventricle', 1).max[2], box('ventricle', -1).max[2]) + o.brain.callosumUpMm;
  const B0 = 0; // the brain's palette index
  const bnode = p => nodeAt(p, B0), bctrl = p => ({ p, seg: B0 });

  /* ---- the canal and the cord ---- */
  // The canal's centre line, top to bottom: [{ p, seg }]. From the wiring data where it gives one (cordCourse and
  // caudaCourse: the canal as that data placed it over the vertebrae); else by this file's own stated rule: one point
  // in the middle of each vertebra, EMAP.cord.backMm behind the line through the rig's vertebral joint centres, square
  // to the column (the canal lies behind the vertebral bodies; an offset, not measured from the vertebrae).
  let canal = [], cordEndZ = null;
  const canalFromData = [];
  for (const fn of ['cordCourse', 'caudaCourse']) {
    let pts = [];
    try { pts = typeof wiring[fn] === 'function' ? wiring[fn]() || [] : []; } catch { pts = []; }
    for (const q of pts) if (q && Array.isArray(q.p) && q.p.length === 3 && q.p.every(Number.isFinite) && segIndex.has(q.seg)) canalFromData.push({ p: q.p.slice(), seg: segIndex.get(q.seg) });
    if (fn === 'cordCourse' && canalFromData.length) cordEndZ = canalFromData[canalFromData.length - 1].p[2];
  }
  if (canalFromData.length >= 4) {
    canalFromData.sort((u, v) => v.p[2] - u.p[2]);
    for (const q of canalFromData) if (!canal.length || canal[canal.length - 1].p[2] - q.p[2] > 0.05) canal.push(q);
  } else {
    cordEndZ = null;
    const column = [];
    let sname = 'skull';
    const seen = new Set();
    while (sname && rig.segments[sname] && !seen.has(sname)) {
      seen.add(sname);
      const g = rig.segments[sname], pv = g.joint ? rig.pivots[g.joint] : null;
      if (!pv || !pv.point) break;
      column.push({ seg: sname, p: pv.point.slice() });
      sname = g.parent;
    }
    if (column.length < 3) fail('emap_rig', 'the rig has no chain of vertebral joints from the skull down');
    const base = sname && segIndex.has(sname) ? sname : 'pelvis';
    const back = (A, Bq) => { // a unit vector toward the back, square to the column's line from Bq up to A
      const l = dist3(A, Bq) || 1, ax = [(A[0] - Bq[0]) / l, (A[1] - Bq[1]) / l, (A[2] - Bq[2]) / l], k = ax[1];
      const v = [-ax[0] * k, 1 - ax[1] * k, -ax[2] * k], vl = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / vl * o.cord.backMm, v[1] / vl * o.cord.backMm, v[2] / vl * o.cord.backMm];
    };
    const top = column[0].p;
    canal.push({ p: [top[0], top[1] + o.cord.backMm, top[2] + 8], seg: segIndex.get(column[0].seg) });
    for (let i = 0; i + 1 < column.length; i++) { // the middle of the vertebra between joint i and joint i + 1
      const A = column[i].p, Bq = column[i + 1].p, m = mix3(A, Bq, 0.5), bk = back(A, Bq);
      canal.push({ p: [m[0] + bk[0], m[1] + bk[1], m[2] + bk[2]], seg: segIndex.get(column[i + 1].seg) });
    }
    const last = column[column.length - 1].p; // then down and back inside the sacrum
    canal.push({ p: [last[0], last[1] + o.cord.backMm + 10, last[2] - 30], seg: segIndex.get(base) }, { p: [last[0], last[1] + o.cord.backMm + 26, last[2] - 75], seg: segIndex.get(base) });
  }
  /** The canal at height z on side s (+1 the body's left, -1 its right, 0 the middle), `out` mm from the midline: a
   * node riding the vertebra there (between two of the canal's points a blend of what the two ride). */
  function canalAt(z, s, out = o.cord.halfMm) {
    const n = canal.length;
    let i = 0;
    while (i + 2 < n && canal[i + 1].p[2] > z) i++;
    const A = canal[i], Bq = canal[i + 1], f = Math.min(1, Math.max(0, (A.p[2] - z) / Math.max(1e-6, A.p[2] - Bq.p[2])));
    const q = mix3(A.p, Bq.p, f);
    return { p: [q[0] + s * out, q[1], q[2]], ia: A.seg, q: null, ib: Bq.seg, w: A.seg === Bq.seg ? 0 : f };
  }
  const levels = Array.isArray(wiring.CORD_LEVELS) ? wiring.CORD_LEVELS.slice() : Object.keys(wiring.CORD_LEVELS || {});
  const levelZ = new Map();
  for (const lv of levels) {
    let at = null;
    try { at = typeof wiring.cordLevelAt === 'function' ? wiring.cordLevelAt(lv) : null; } catch { at = null; }
    if (at && Array.isArray(at.p) && Number.isFinite(at.p[2])) { levelZ.set(lv, at.p[2]); continue; } // (the data's own place of the segment)
    const A = at && rig.pivots[at.fromPivot] && rig.pivots[at.fromPivot].point, Bq = at && rig.pivots[at.toPivot] && rig.pivots[at.toPivot].point;
    if (!A || !Bq || !Number.isFinite(at.t)) { warn(`cord level ${lv} has no place`); continue; }
    levelZ.set(lv, A[2] + (Bq[2] - A[2]) * at.t);
  }
  if (!levelZ.size) fail('emap_wiring', 'no cord level has a place (cordLevelAt)');
  const zTop = canal[0].p[2], zEnd = Math.max(canal[canal.length - 1].p[2], Number.isFinite(cordEndZ) ? cordEndZ : Math.min(...levelZ.values()) - 6);
  const cord = {}; // side -> { wire, aAt(z) }
  for (const s of [1, -1]) {
    const nodes = [];
    const steps = Math.max(2, Math.ceil((zTop - zEnd) / o.stepMm.cord));
    for (let i = 0; i <= steps; i++) nodes.push(canalAt(zTop + (zEnd - zTop) * i / steps, s));
    const w = addWire('cord', `cord:${sideKey(s)}`, nodes, { a0: 0, flags: EMAP_FLAG.lanes | EMAP_FLAG.cord, copies: 'body' });
    const aAt = z => { const f = Math.min(1, Math.max(0, (zTop - z) / (zTop - zEnd))) * steps, i = Math.min(steps - 1, Math.floor(f)); return w.a[i] + (w.a[i + 1] - w.a[i]) * (f - i); };
    cord[s] = { wire: w, aAt };
  }
  yield 'cord';

  /* ---- the nerve trunks (the wiring data, both sides) ---- */
  // A trunk of the data is the right side's (or the middle's); its left twin comes from the data's own mirror rule
  // (mirrorTrunk: an object with the mirrored course, under its own id or under the same id) or, without one, by
  // mirroring here. `leftOf` maps a right trunk's id to its left twin's key in this table.
  const trunks = new Map(), leftOf = new Map();
  const mirrorP = typeof wiring.mirrorPoint === 'function' ? wiring.mirrorPoint : p => [-p[0], p[1], p[2]];
  const swapSide = s => (typeof s !== 'string' ? s : s.startsWith('r_') ? `l_${s.slice(2)}` : s.startsWith('l_') ? `r_${s.slice(2)}` : s);
  const rightName = s => (typeof s === 'string' && s.startsWith('l_') ? `r_${s.slice(2)}` : s);
  const putTrunk = (t, key) => {
    if (!t || typeof key !== 'string' || !Array.isArray(t.course) || !t.course.length || trunks.has(key)) return false;
    const course = [];
    for (const c of t.course) {
      // a point of the left arm is the game arm's: rig 'arm' with that rig's segment as `armSeg` (the data's final
      // shape: seg is then the body-style name l_...), or as `seg` (the stand-in's shape), or a body name l_... alone
      const si = c && (c.rig === 'arm' ? firstSeg(armSegOf(c.armSeg), armSegOf(c.seg), segOf(c.seg)) : segOf(c.seg));
      if (!c || !Array.isArray(c.p) || c.p.length !== 3 || !c.p.every(Number.isFinite)) { warn(`trunk ${key}: a course point is not a place`); continue; }
      if (!(si >= 0)) { warn(`trunk ${key}: unknown segment ${c && c.seg}`); continue; }
      course.push({ p: c.p.slice(), seg: si, name: c.seg });
    }
    if (!course.length) return false;
    let mx = 0; for (const c of course) mx += c.p[0] / course.length;
    trunks.set(key, { id: key, dataId: typeof t.id === 'string' ? t.id : key, name: String(t.name || key), plain: String(t.plain || ''), roots: Array.isArray(t.roots) ? t.roots.filter(r => levelZ.has(r)) : [],
      parent: typeof t.parent === 'string' ? t.parent : null, origin: typeof t.origin === 'string' && EMAP_NUCLEI[t.origin] ? t.origin : null, rootsLeave: typeof t.rootsLeave === 'string' ? t.rootsLeave : null, course, side: mx > 1 ? 1 : -1, wire: null, rootWires: new Map(), nominal: null, top: null, children: [] });
    return true;
  };
  const rightIds = Object.keys(wiring.NERVE_TRUNKS);
  for (const id of rightIds) putTrunk({ ...wiring.NERVE_TRUNKS[id], id: wiring.NERVE_TRUNKS[id].id || id }, id);
  for (const id of rightIds) {
    const t = wiring.NERVE_TRUNKS[id];
    let m = null;
    try { m = typeof wiring.mirrorTrunk === 'function' ? wiring.mirrorTrunk(id) : null; } catch { m = null; }
    let twin = null, key = null;
    if (m && typeof m === 'object' && Array.isArray(m.course)) { twin = m; key = typeof m.id === 'string' && m.id !== id ? m.id : `${id}:left`; }
    else { key = typeof m === 'string' && m !== id ? m : swapSide(id) !== id ? swapSide(id) : `${id}:left`; twin = wiring.NERVE_TRUNKS[key] ? null : { ...t, course: t.course.map(c => ({ seg: swapSide(c.seg), p: mirrorP(c.p) })) }; }
    if (!twin || trunks.has(key)) { if (trunks.has(key) && key !== id) leftOf.set(id, key); continue; }
    // a trunk of the middle is its own twin: its mirrored course lies on itself
    let off = 0; for (const c of twin.course) off = Math.max(off, Math.abs(c.p[0]));
    if (off < 1.5) continue;
    if (putTrunk({ ...twin, id: t.id || id, name: String(t.name || id).replace(/\bright\b/g, 'left'), plain: String(t.plain || '').replace(/\bright\b/g, 'left') }, key)) leftOf.set(id, key);
  }
  for (const [rid, key] of leftOf) { const L = trunks.get(key), pr = wiring.NERVE_TRUNKS[rid] && wiring.NERVE_TRUNKS[rid].parent; if (L && typeof pr === 'string') L.parent = leftOf.get(pr) || (trunks.has(swapSide(pr)) && swapSide(pr) !== pr ? swapSide(pr) : pr); }
  if (!trunks.size) fail('emap_wiring', 'no nerve trunk has a usable course');
  // parents first; a trunk whose parent is unknown hangs on the cord by its own roots
  const order = [], state = new Map();
  const visit = t => { if (state.get(t.id)) return; state.set(t.id, 1); const p = t.parent && trunks.get(t.parent); if (p && p !== t) { visit(p); p.children.push(t.id); } else t.parent = null; order.push(t); };
  for (const t of trunks.values()) visit(t);
  const exits = new Map(); // exit key -> { key, kind: 'cord' | 'cranial', side, brain: [x, y, z], bridge: wire, bodyNode }
  const cranialCount = {};
  for (const t of order) {
    yield 'trunk';
    const ctrl = t.course.map(c => ({ p: c.p, seg: c.seg }));
    if (t.parent) {
      const P = trunks.get(t.parent), j = nearestNode(P.wire, ctrl[0].p), J = P.wire.nodes[j.i];
      const nodes = sampleCurve([{ p: J.p, seg: domSeg(J), node: J }, ...(j.d < 3 ? ctrl.slice(1) : ctrl)], o.stepMm.body, jointBlend);
      t.wire = addWire('trunk', `trunk:${t.id}`, nodes, { a0: P.wire.a[j.i], flags: EMAP_FLAG.lanes, copies: 'body', parent: P.wire.id });
      t.wire.parentA = P.wire.a[j.i]; t.top = P.top; t.origin = trunks.get(P.top).origin; t.side = P.side;
      continue;
    }
    t.top = t.id;
    const nodes = sampleCurve(ctrl, o.stepMm.body, jointBlend);
    if (t.origin) { // a head nerve: its own way out of the brainstem
      t.wire = addWire('trunk', `trunk:${t.id}`, nodes, { a0: 0, flags: EMAP_FLAG.lanes, copies: 'body' });
      const k = `${t.origin}:${t.side}`, j = cranialCount[k] || 0; cranialCount[k] = j + 1;
      const N = EMAP_NUCLEI[t.origin];
      exits.set(`cn:${t.id}`, { key: `cn:${t.id}`, kind: 'cranial', side: t.side, part: t.origin, trunk: t.id, brain: inBox(N[0], t.side, N[1] + N[2] * j, N[3], Math.max(0.05, N[4] + N[5] * j)), bodyNode: nodes[0], bridge: null });
      continue;
    }
    // the cord's roots: each from the strand at its level to the point of the trunk it joins (the data's rootWay, 22
    // November 2026: each root joins its bundle at its own point, not all at the bundle's first point, which drew the
    // lower roots running up by up to 97 mm; without it, the trunk's first point)
    const s = t.side, first = nodes[0];
    const cumN = [0]; for (let i = 1; i < nodes.length; i++) cumN.push(cumN[i - 1] + dist3(nodes[i].p, nodes[i - 1].p));
    const joinOf = new Map();
    let roots = t.roots.slice();
    if (!roots.length) { let best = null, bd = Infinity; for (const [lv, z] of levelZ) { const d = Math.abs(z - first.p[2]); if (d < bd) { bd = d; best = lv; } } roots = [best]; warn(`trunk ${t.id} names no cord level: the nearest (${best}) is used`); }
    t.nominal = roots[Math.floor((roots.length - 1) / 2)];
    for (const lv of roots) {
      const z = levelZ.get(lv), c0 = canalAt(z, s), ctl = [{ p: c0.p, seg: domSeg(c0), node: c0 }];
      let run = null, J = first, jIdx = 0;
      let way = null;
      try { way = typeof wiring.rootWay === 'function' ? wiring.rootWay(t.id, lv) : null; } catch { way = null; }
      const okP = q => q && Array.isArray(q.p) && q.p.length === 3 && q.p.every(Number.isFinite);
      if (Array.isArray(way) && way.length >= 2 && way.every(okP)) {
        const jp = way[way.length - 1].p;
        let bd = Infinity; for (let i = 0; i < nodes.length; i++) { const d = dist3(nodes[i].p, jp); if (d < bd) { bd = d; jIdx = i; } }
        J = nodes[jIdx];
        run = t.rootsLeave === 'cord' ? [way[0]] : way.slice(0, -1); // (a root of the accessory nerve leaves the cord's side inside the canal)
      } else {
        try { run = typeof wiring.rootCourse === 'function' ? wiring.rootCourse(lv, s > 0 ? 'left' : 'right') : null; } catch { run = null; }
      }
      joinOf.set(lv, jIdx);
      if (Array.isArray(run) && run.length >= 1 && run.every(q => q && Array.isArray(q.p) && q.p.length === 3 && q.p.every(Number.isFinite))) {
        // the data's own way of this root: down inside the canal (drawn a little to its side of the cord), then out
        // through its opening between two vertebrae (the last point)
        for (let i = 1; i + 1 < run.length; i++) { const zz = run[i].p[2]; if (zz < ctl[ctl.length - 1].p[2] - 12) { const c = canalAt(zz, s, o.cord.rootOutMm); ctl.push({ p: c.p, seg: domSeg(c) }); } }
        const e = run[run.length - 1], es = segIndex.get(e.seg);
        if (dist3(e.p, ctl[ctl.length - 1].p) > 2) ctl.push({ p: e.p.slice(), seg: es !== undefined ? es : domSeg(c0) });
      } else if (J.p[2] < z - 20) { // the root runs down inside the column first (the lowest ones as the "horse's tail")
        const zx = Math.max(J.p[2] + 10, canal[canal.length - 1].p[2]);
        for (let zz = z - 14; zz > zx; zz -= 26) { const c = canalAt(zz, s, o.cord.rootOutMm); ctl.push({ p: c.p, seg: domSeg(c) }); }
        const c = canalAt(zx, s, o.cord.rootOutMm + 3); ctl.push({ p: c.p, seg: domSeg(c) });
      } else ctl.push({ p: [c0.p[0] + (J.p[0] - c0.p[0]) * 0.45, c0.p[1] + (J.p[1] - c0.p[1]) * 0.3, c0.p[2] + (J.p[2] - c0.p[2]) * 0.25], seg: domSeg(c0) });
      if (dist3(J.p, ctl[ctl.length - 1].p) > 1) ctl.push({ p: J.p, seg: domSeg(J), node: J });
      else ctl[ctl.length - 1] = { p: J.p, seg: domSeg(J), node: J };
      const rw = addWire('root', `root:${t.id}:${lv}`, sampleCurve(ctl, o.stepMm.body, jointBlend), { a0: cord[s].aAt(z), flags: EMAP_FLAG.lanes | EMAP_FLAG.root, copies: 'body', parent: cord[s].wire.id });
      rw.parentA = cord[s].aAt(z);
      t.rootWires.set(lv, rw);
    }
    const nom = t.rootWires.get(t.nominal);
    // (the trunk's coordinate is the nominal root's at the point where that root joins it)
    t.wire = addWire('trunk', `trunk:${t.id}`, nodes, { a0: nom.a[nom.a.length - 1] - cumN[joinOf.get(t.nominal) || 0], flags: EMAP_FLAG.lanes, copies: 'body', parent: nom.id });
  }
  for (const s of [1, -1]) exits.set(s > 0 ? 'cordL' : 'cordR', { key: s > 0 ? 'cordL' : 'cordR', kind: 'cord', side: s, part: 'medulla', trunk: null, brain: station('cordExit', s), bodyNode: cord[s].wire.nodes[0], bridge: null });
  // The drawn bridges: from each way out of the big brain to the same place of the mirror body (one place, drawn
  // twice). They leave the big brain as ONE bundle: every bridge first runs down the brainstem to a point just under
  // the medulla (the neck of the big brain) and from there straight to its place in the mirror body. (The first build
  // drew each bridge straight from its own place in the brainstem: with the brain turned, sixteen lines fanned across
  // the picture from the mirror body's head.)
  {
    const eL = station('cordExit', 1), eR = station('cordExit', -1), neck = [(eL[0] + eR[0]) / 2, (eL[1] + eR[1]) / 2, Math.min(eL[2], eR[2]) - 7];
    let n = 0;
    for (const e of exits.values()) {
      const seg = domSeg(e.bodyNode), q = e.bodyNode.p.slice(), nodes = [], k = 8;
      const near = [neck[0] + (e.side || 0) * (0.6 + 0.25 * (n % 5)), neck[1] + 0.3 * ((n % 3) - 1), neck[2]]; n++;
      const down = sampleCurve([bctrl(e.brain), bctrl([(e.brain[0] + near[0]) / 2, (e.brain[1] + near[1]) / 2, Math.max(near[2] + 2, (e.brain[2] + near[2]) / 2)]), bctrl(near)], o.stepMm.brain);
      for (let i = 0; i + 1 < down.length; i++) nodes.push({ p: down[i].p, ia: B0, q, ib: seg, w: 0 });
      for (let i = 0; i < k; i++) nodes.push({ p: near.slice(), ia: B0, q, ib: seg, w: i / (k - 1) });
      const aList = nodes.map((_, i) => -o.bridgeMm * (1 - i / (nodes.length - 1)));
      e.bridge = addWire('bridge', `bridge:${e.key}`, nodes, { aList, flags: EMAP_FLAG.lanes | EMAP_FLAG.bridge, copies: 'bridge' });
      e.bridge.lenMm = o.bridgeMm;
    }
  }

  /* ---- the muscles: the nerve of each, its branch, its chain up to the way out ---- */
  const trunkList = [...trunks.values()];
  const mList = [], muscleIndex = new Map();
  const sideOf = m => (m.side === 'left' ? 1 : m.side === 'right' ? -1 : m.centre[0] > 0 ? 1 : -1);
  for (const m of Array.isArray(muscles) ? muscles : []) {
    if (mList.length % 12 === 11) yield 'muscle';
    if (!m || typeof m.id !== 'string' || !Array.isArray(m.centre) || m.centre.length !== 3 || !m.centre.every(Number.isFinite) || muscleIndex.has(m.id)) continue;
    const seg = m.rig === 'arm' ? armSegOf(m.seg) : segIndex.get(m.seg);
    if (!(seg >= 0)) { warn(`muscle ${m.id}: unknown segment ${m.seg}`); continue; }
    const seg2 = m.seg2 ? (m.rig === 'arm' ? armSegOf(m.seg2) : segIndex.get(m.seg2)) : -1, s = sideOf(m);
    let T = null, main = null, how = 'data';
    try {
      const ask = typeof wiring.nerveForMuscle === 'function' ? wiring.nerveForMuscle : null;
      const ans = ask ? ask(m.id) || ask(m.name) : null;
      if (ans && typeof ans.trunk === 'string') {
        T = trunks.get(ans.trunk) || null;
        if (T && T.side !== s) { const lk = leftOf.get(ans.trunk) || (trunks.has(swapSide(ans.trunk)) ? swapSide(ans.trunk) : null); if (lk && trunks.get(lk)) T = trunks.get(lk); }
        main = typeof ans.main === 'string' ? ans.main : null;
      }
    } catch { T = null; }
    if (!T) { // the nearest trunk of its own side; a head nerve only for a muscle of the head
      how = 'nearest';
      const head = m.rig !== 'arm' && headSeg.has(seg);
      let bd = Infinity;
      for (const t of trunkList) {
        if (t.side !== s || (t.origin && !head)) continue;
        const d = nearestNode(t.wire, m.centre).d;
        if (d < bd) { bd = d; T = t; }
      }
      if (!T) for (const t of trunkList) { const d = nearestNode(t.wire, m.centre).d; if (d < bd) { bd = d; T = t; } }
    }
    // where the twig leaves its nerve and where it ends: the data's own course point and belly point for this mesh
    // where it has them (a left game-arm mesh "...M": its right twin's course point, mirrored with the course), else
    // the nerve's nearest point and the muscle's rest centre
    const rows = wiring.MUSCLE_NERVE_BY_ID || null, own = rows && rows[m.id] ? rows[m.id] : null;
    const row = own || (rows && m.rig === 'arm' && /M$/.test(m.id) && rows[m.id.slice(0, -1)] ? rows[m.id.slice(0, -1)] : null);
    let endP = m.centre, endSeg = seg, endSeg2 = seg2, endW = Number.isFinite(m.w2) ? m.w2 : 0;
    if (own && own.end && Array.isArray(own.end.p) && own.end.p.length === 3 && own.end.p.every(Number.isFinite) && segIndex.has(own.end.seg) && Math.sign(own.end.p[0] || s) === s) { endP = own.end.p.slice(); endSeg = segIndex.get(own.end.seg); if (endSeg !== seg) { endSeg2 = -1; endW = 0; } }
    // (the row may name the nerve of either side: a left muscle's own row names l_..., a left game-arm mesh takes its
    // right twin's row, which names r_...; the twin's course has the same points in the same order)
    const at = row && how === 'data' && rightName(row.trunk) === rightName(T.dataId) && Number.isInteger(row.at) && T.course[row.at] ? T.course[row.at].p : null;
    const j = nearestNode(T.wire, at || endP), J = T.wire.nodes[j.i], d = dist3(J.p, endP);
    const jn = T.wire.nodes[Math.min(T.wire.nodes.length - 1, j.i + 1)], jp = T.wire.nodes[Math.max(0, j.i - 1)], tl = dist3(jn.p, jp.p) || 1;
    // the twig leaves along its nerve and curves to the muscle; the more the muscle lies back along the nerve, the less it
    // follows the nerve first (a muscle behind the branch point made the twig a hairpin)
    const fwd = d > 1e-6 ? Math.max(0, ((jn.p[0] - jp.p[0]) * (endP[0] - J.p[0]) + (jn.p[1] - jp.p[1]) * (endP[1] - J.p[1]) + (jn.p[2] - jp.p[2]) * (endP[2] - J.p[2])) / (tl * d)) : 0, lead = 0.3 * d * fwd;
    const c1 = [J.p[0] + (jn.p[0] - jp.p[0]) / tl * lead, J.p[1] + (jn.p[1] - jp.p[1]) / tl * lead, J.p[2] + (jn.p[2] - jp.p[2]) / tl * lead], c2 = mix3(J.p, endP, 0.7);
    const k = Math.max(2, Math.ceil(d / o.stepMm.branch)), nodes = [{ ...J }], jd = domSeg(J), bA = { p: J.p, seg: jd }, bB = { p: endP, seg: endSeg };
    for (let i = 1; i < k; i++) {
      const t = i / k, u = 1 - t, p = [0, 0, 0];
      for (let c = 0; c < 3; c++) p[c] = u * u * u * J.p[c] + 3 * u * u * t * c1[c] + 3 * u * t * t * c2[c] + t * t * t * endP[c];
      nodes.push({ p, ia: jd, q: null, ib: endSeg, w: jd === endSeg ? 0 : jointBlend(bA, bB, p, t) });
    }
    nodes.push({ p: endP.slice(), ia: endSeg, q: null, ib: endSeg2 >= 0 ? endSeg2 : endSeg, w: endSeg2 >= 0 ? Math.min(0.5, Math.max(0, endW)) : 0 });
    const bw = addWire('branch', `branch:${m.id}`, nodes, { a0: T.wire.a[j.i], flags: EMAP_FLAG.lanes, copies: 'body', parent: T.wire.id, spark: false });
    bw.parentA = T.wire.a[j.i];
    // the chain: the branch, then each wire toward the brain with how far the route uses it
    const cw = [bw.id], ct = [BIG], names = [`muscle: ${m.name}`];
    let w = T.wire, a = T.wire.a[j.i], t = T;
    for (;;) {
      cw.push(w.id); ct.push(a); names.push(`nerve: ${t.name}`);
      if (!t.parent) break;
      a = w.parentA; t = trunks.get(t.parent); w = t.wire;
    }
    let exit;
    if (t.origin) exit = `cn:${t.id}`;
    else {
      const lv = main && t.rootWires.has(main) ? main : t.nominal, rw = t.rootWires.get(lv);
      cw.push(rw.id); ct.push(BIG); names.push(`root: ${lv}`);
      cw.push(cord[t.side].wire.id); ct.push(rw.parentA); names.push(`spinal cord (${sideKey(t.side)} side)`);
      exit = t.side > 0 ? 'cordL' : 'cordR';
    }
    cw.push(exits.get(exit).bridge.id); ct.push(BIG);
    muscleIndex.set(m.id, mList.length);
    mList.push({ id: m.id, index: mList.length, name: m.name, side: s, rig: m.rig === 'arm' ? 'arm' : 'body', trunk: T.id, how, exit, aMm: bw.a[bw.a.length - 1], branch: bw.id, wires: cw, tau: ct, names, centre: endP.slice(), seg: endSeg, seg2: endSeg2, w2: nodes[nodes.length - 1].w });
  }

  /* ---- the areas: fibres, tails, twigs, the way back up, links ---- */
  const A = [], areaIndex = new Map();
  const linksIn = Array.isArray(wiring.BRAIN_LINKS) ? wiring.BRAIN_LINKS.filter(l => l && boxById.has(l.from) && boxById.has(l.to)) : [];
  const centreOf = id => { const b = boxById.get(id); return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; };
  const nearInBox = (id, p) => { const b = boxById.get(id), c = centreOf(id), q = [0, 0, 0]; for (let i = 0; i < 3; i++) q[i] = Math.min(b.max[i], Math.max(b.min[i], p[i])); return mix3(q, c, 0.35); };
  const snapSens = (p, s) => {
    const P = surface && surface[sideKey(s)];
    if (!P || P.length < 3) { const b = boxById.get(EMAP_BRAIN_MESH.postcentral[sideKey(s)]); return b ? [Math.min(b.max[0], Math.max(b.min[0], p[0])), Math.min(b.max[1], Math.max(b.min[1], p[1])), Math.min(b.max[2], p[2])] : p; }
    let bi = 0, bd = Infinity;
    for (let i = 0; i < P.length; i += 3) { const d = (P[i] - p[0]) ** 2 + (P[i + 1] - p[1]) ** 2 + (P[i + 2] - p[2]) ** 2; if (d < bd) { bd = d; bi = i; } }
    return [P[bi], P[bi + 1], P[bi + 2]];
  };
  const maxOrder = Math.max(1, ...bodyMap.regions.map(r => (Number.isFinite(r.order) ? r.order : 0)));
  const colourOf = id => { const c = areaGlowColor(id) || [0.6, 0.75, 1]; const m = Math.max(c[0], c[1], c[2], 1e-6), k = 1 / m; return [Math.max(0.04, c[0] * k), Math.max(0.04, c[1] * k), Math.max(0.04, c[2] * k)]; };
  const precentralSide = id => (id === EMAP_BRAIN_MESH.precentral.left ? 1 : id === EMAP_BRAIN_MESH.precentral.right ? -1 : 0);
  const fibreMeshes = new Map(); // a brain mesh id a fibre passes -> [station names]
  for (const [mesh, st] of [['capsule', ['capTop']], ['midbrain', ['crus']], ['pons', ['pons']], ['medulla', ['pyrTop']]]) for (const side of ['left', 'right']) fibreMeshes.set(EMAP_BRAIN_MESH[mesh][side], st);
  for (const r of bodyMap.regions) {
    const an = areas.get(r.id);
    if (!an || !Array.isArray(an.centre) || an.centre.length !== 3) { warn(`area ${r.id} has no place on the strip`); continue; }
    const sh = r.hemisphere === 'left' ? 1 : -1, q = 1 - (Number.isFinite(r.order) ? r.order : 0) / maxOrder, Cc = an.centre.slice();
    const down = r.kind !== 'integration' && r.pathway !== 'integration';
    const capTop = station('capTop', sh, q), il = dist3(capTop, Cc) || 1, hub = [Cc[0] + (capTop[0] - Cc[0]) / il * o.brain.hubMm, Cc[1] + (capTop[1] - Cc[1]) / il * o.brain.hubMm, Cc[2] + (capTop[2] - Cc[2]) / il * o.brain.hubMm];
    const sens = snapSens([Cc[0], Cc[1] + o.brain.sensBackMm, Cc[2]], sh);
    const rec = { id: r.id, index: A.length, hemisphere: sh, down, pathway: r.pathway, laterality: r.laterality, colour: colourOf(r.id), centre: Cc, sens, hub, q,
      fibre: null, actions: new Map(), a0: 0, exits: new Map(), links: [], linkNames: [], linkEnds: [], twigs: [], names: null, region: -1 };
    areaIndex.set(r.id, rec.index); A.push(rec);
    if (down) {
      // (the capsule's lower point, capBot, is not a control point: with it the line made a sharp bend between the capsule
      // and the midbrain as the brain is drawn, flattened along the view; the curve from capTop to the crus passes close to it)
      const ctl = [hub, capTop, station('crus', sh, q), station('pons', sh, q), station('pyrTop', sh, q), station('pyrLow', sh, q)].map(bctrl);
      rec.fibre = addWire('fibre', `fibre:${r.id}`, sampleCurve(ctl, o.stepMm.brain), { a0: 0, scale: o.bead.brainScale }); // its coordinate is set below, from its first way out
      rec.fibre.cum = Float64Array.from(rec.fibre.a);
    }
    if (A.length % 8 === 7) yield 'area';
  }
  /** The way out `key` of an area: the tail from its fibre, the bridge, the fibre back up and its patch. Made once. */
  function ensureExit(rec, key) {
    if (rec.exits.has(key)) return rec.exits.get(key);
    const e = exits.get(key);
    if (!e || !rec.down) return null;
    const F = rec.fibre, sh = rec.hemisphere, cross = e.side !== sh;
    let fork, ctl;
    if (e.kind === 'cord') {
      fork = F.nodes.length - 1;
      ctl = cross ? [F.nodes[fork].p, station('crossMid', sh, rec.q), e.brain] : [F.nodes[fork].p, station('sameBend', sh, rec.q), e.brain];
    } else {
      fork = F.nodes.length - 1;
      for (let i = 0; i < F.nodes.length; i++) if (F.nodes[i].p[2] <= e.brain[2] + 6) { fork = i; break; }
      const f = F.nodes[fork].p;
      ctl = cross ? [f, [(f[0] + e.brain[0]) / 2 * 0.3, (f[1] + e.brain[1]) / 2, (f[2] + e.brain[2]) / 2], e.brain] : [f, e.brain];
    }
    const first = rec.exits.size === 0;
    const nodes = sampleCurve(ctl.map(bctrl), o.stepMm.brain);
    let tailLen = 0; for (let i = 1; i < nodes.length; i++) tailLen += dist3(nodes[i].p, nodes[i - 1].p);
    if (first) { const aFork = -o.bridgeMm - tailLen; for (let i = 0; i < F.a.length; i++) F.a[i] = aFork + (F.cum[i] - F.cum[fork]); }
    const share = cross ? 1 : (o.sameSide[rec.laterality] !== undefined ? o.sameSide[rec.laterality] : 1);
    const tail = addWire('tail', `tail:${rec.id}:${key}`, nodes, { a0: F.a[fork], idle: o.idle.tail * share, scale: o.bead.brainScale, parent: F.id });
    // the way back up: from this way out to the sensory strip behind the block
    const up = [e.brain];
    const addIfAbove = p => { if (p[2] > up[up.length - 1][2] + 3) up.push(p); };
    const q = rec.q;
    if (e.kind === 'cord') { up.push(station('dcn', e.side, q)); if (cross) up.push(station('lemCross', sh, q)); addIfAbove(station('lem', sh, q)); }
    else if (cross) up.push([e.brain[0] * 0.2 + station('lem', sh, q)[0] * 0.2, e.brain[1], e.brain[2] + 4]);
    addIfAbove(station('ponsBack', sh, q)); addIfAbove(station('midBack', sh, q)); addIfAbove(station('relay', sh, q)); addIfAbove(station('capBack', sh, q));
    up.push(rec.sens);
    const sw = addWire('sens', `sens:${rec.id}:${key}`, sampleCurve(up.map(bctrl).reverse(), o.stepMm.brain), { a0: -o.bridgeMm, back: true, flags: EMAP_FLAG.sens, scale: o.bead.brainScale });
    const x = { key, cross, fork, tail: tail.id, forkA: 0, bridge: e.bridge.id, sens: sw.id, kind: e.kind, side: e.side, part: e.part, trunk: e.trunk };
    rec.exits.set(key, x);
    return x;
  }
  // every way out the game's own movements need, in the map's order (the first one sets the fibre's coordinate)
  const pairs = []; // [areaIndex, actionId, muscle indices]
  for (const r of bodyMap.regions) {
    const rec = A[areaIndex.get(r.id)];
    if (!rec || !rec.down) continue;
    if (/corticospinal/.test(String(r.pathway))) ensureExit(rec, rec.hemisphere > 0 ? 'cordR' : 'cordL');
    for (const act of r.actions || []) {
      yield 'movement';
      let ids = [];
      try { ids = typeof resolveMuscles === 'function' ? resolveMuscles(r, act) || [] : []; } catch { ids = []; }
      const ms = [];
      for (const id of ids) { const mi = muscleIndex.get(id); if (mi === undefined) continue; ms.push(mi); ensureExit(rec, mList[mi].exit); }
      pairs.push([rec.index, act.id, ms]);
    }
    if (!rec.exits.size) ensureExit(rec, rec.hemisphere > 0 ? 'cordR' : 'cordL');
  }
  const regionOf = new Map(bodyMap.regions.map(g => [g.id, g]));
  for (const rec of A) {
    yield 'links';
    const an = areas.get(rec.id), keys = an && an.keys ? an.keys : {}, region = regionOf.get(rec.id);
    const F = rec.fibre, aHub = F ? F.a[0] : 0;
    for (const x of rec.exits.values()) x.forkA = F.a[x.fork];
    // the twigs: one per movement's part of the block (or one stem), from the surface to the hub
    const acts = (region.actions || []).filter(a => Array.isArray(keys[a.id]) && keys[a.id].length === 3);
    const mk = (id, p) => {
      const w = addWire('twig', `twig:${rec.id}:${id === null ? '' : id}`, sampleCurve([bctrl(p), bctrl(rec.hub)], o.stepMm.twig), { a0: aHub, back: true, idle: rec.down ? o.idle.twig : 0.3, scale: o.bead.brainScale, parent: F ? F.id : -1, spark: false });
      rec.twigs.push(w.id);
      return { wire: w.id, a0: w.a[0], p };
    };
    for (const a of acts) { const t = mk(a.id, keys[a.id]); rec.actions.set(a.id, t); if (typeof a.armActionId === 'string' && a.armActionId) rec.actions.set(a.armActionId, t); }
    rec.stem = acts.length ? null : mk(null, rec.centre);
    rec.a0 = rec.stem ? rec.stem.a0 : Math.min(...[...rec.actions.values()].map(t => t.a0));
    // the area's links to other brain regions (pulses run along them; shown faintly at rest)
    const mine = EMAP_BRAIN_MESH.precentral[sideKey(rec.hemisphere)];
    for (const l of linksIn) {
      if (l.from !== mine && l.to !== mine) continue;
      const other = l.from === mine ? l.to : l.from, ctl = [rec.centre];
      if (fibreMeshes.has(other)) continue; // (a link down to the brainstem is the fibre itself, drawn already)
      const os = precentralSide(other);
      if (other === EMAP_BRAIN_MESH.postcentral[sideKey(rec.hemisphere)]) { // the strip behind: a short loop under the groove
        const mid = mix3(rec.centre, rec.sens, 0.5), dl = dist3(rec.hub, rec.centre) || 1;
        ctl.push([mid[0] + (rec.hub[0] - rec.centre[0]) / dl * 6, mid[1] + (rec.hub[1] - rec.centre[1]) / dl * 6, mid[2] + (rec.hub[2] - rec.centre[2]) / dl * 6], rec.sens);
      } else {
        const twin = os ? areas.get(rec.id.replace(/^(rh|lh)_/, m => (m === 'rh_' ? 'lh_' : 'rh_'))) : null;
        const end = twin && Array.isArray(twin.centre) ? twin.centre : nearInBox(other, rec.centre);
        ctl.push(rec.hub);
        for (const v of Array.isArray(l.via) ? l.via : []) {
          if (!boxById.has(v)) continue;
          const st = fibreMeshes.get(v);
          if (st) for (const name of st) ctl.push(station(name, rec.hemisphere, rec.q)); else ctl.push(centreOf(v));
        }
        if (l.crosses && !(Array.isArray(l.via) && l.via.length)) { // an arc over the middle (the atlas has no corpus callosum)
          const y = Math.min(-45, Math.max(-110, (rec.centre[1] + end[1]) / 2));
          ctl.push([rec.hemisphere * 9, y, callosumZ], [-rec.hemisphere * 9, y, callosumZ]);
        }
        ctl.push(end);
      }
      const w = addWire('link', `link:${rec.id}:${other}`, sampleCurve(ctl.map(bctrl), o.stepMm.link), { a0: 0, unit: 's', flags: EMAP_FLAG.link, scale: 1 });
      rec.links.push(w.id); rec.linkNames.push(String(l.plain || l.name || other)); rec.linkEnds.push(w.nodes[w.nodes.length - 1].p.slice());
    }
  }
  // the network at rest: the wiring data's links between other regions
  const net = [];
  for (const l of linksIn) {
    if (precentralSide(l.from) || precentralSide(l.to)) continue;
    const a = centreOf(l.from), b = centreOf(l.to), ctl = [a];
    for (const v of Array.isArray(l.via) ? l.via : []) if (boxById.has(v)) ctl.push(centreOf(v));
    if (l.crosses && !(Array.isArray(l.via) && l.via.length)) { const y = Math.min(-45, Math.max(-110, (a[1] + b[1]) / 2)); ctl.push([Math.sign(a[0] || 1) * 9, y, callosumZ], [-Math.sign(a[0] || 1) * 9, y, callosumZ]); }
    ctl.push(b);
    net.push(addWire('net', `net:${l.from}:${l.to}`, sampleCurve(ctl.map(bctrl), o.stepMm.link), { a0: 0, unit: 's', scale: 1 }).id);
  }

  /* ---- the live scan's regions and the network's fibres (22 November 2026, part 3; EMAP.scan) ---- */
  // A region of the scan is a brain mesh: its box's centre, points of its surface (the page's own vertices, boxes[i].pts;
  // for Node, points on the box's outer face) and its half. Storms start on regions and run along the fibres between
  // them (ns-emap-storm). The links of the wiring data join regions; neighbouring surface regions are joined too.
  const sRegions = [], sIndex = new Map();
  const scanRegionOf = id => {
    if (sIndex.has(id)) return sIndex.get(id);
    const b = boxById.get(id);
    if (!b || o.scan.notRegion.test(String(b.name || ''))) return -1;
    const c = centreOf(id), side = Math.abs(c[0]) < 4 ? 0 : Math.sign(c[0]);
    let pts = b.pts && b.pts.length >= 9 ? Float32Array.from(b.pts) : null;
    if (!pts) {
      const q = [];
      for (let k = 0; k < 8; k++) { const u = (k + 0.5) / 8, v = ((k * 3) % 8 + 0.5) / 8; q.push(side > 0 ? b.max[0] - 2 : side < 0 ? b.min[0] + 2 : c[0], b.min[1] + (b.max[1] - b.min[1]) * u, b.min[2] + (b.max[2] - b.min[2]) * (0.25 + 0.65 * v)); }
      pts = Float32Array.from(q);
    }
    const i = sRegions.length;
    sRegions.push({ id, name: String(b.name || id), centre: c, pts, side, surface: o.scan.surface.test(String(b.name || '')) });
    sIndex.set(id, i);
    return i;
  };
  let scanSeed = 0x5eed2211;
  const scanRnd = () => { scanSeed = (Math.imul(scanSeed, 1664525) + 1013904223) >>> 0; return scanSeed / 4294967296; };
  const surfPt = (R, k) => { const n = Math.floor(R.pts.length / 3), j = ((k % n) + n) % n; return [R.pts[3 * j], R.pts[3 * j + 1], R.pts[3 * j + 2]]; };
  const sLinks = [], netWires = [];
  // the middle of each half: the mean centre of its surface regions' boxes
  const halfAt = { 1: [0, 0, 0, 0], '-1': [0, 0, 0, 0] };
  for (const b of boxes) { if (!o.scan.surface.test(String(b.name || '')) || o.scan.notRegion.test(String(b.name || ''))) continue; const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; if (Math.abs(c[0]) < 4) continue; const h = halfAt[c[0] > 0 ? 1 : '-1']; h[0] += c[0]; h[1] += c[1]; h[2] += c[2]; h[3]++; }
  const halfCentre = sx => { const h = halfAt[sx > 0 ? 1 : '-1']; return h[3] ? [h[0] / h[3], h[1] / h[3], h[2] / h[3]] : [sx * 40, -20, 60]; };
  for (const l of linksIn) {
    const ra = scanRegionOf(l.from), rb = scanRegionOf(l.to);
    if (ra < 0 || rb < 0 || ra === rb) continue;
    const RA = sRegions[ra], RB = sRegions[rb], midCtl = [];
    // the link's own stations; where its fibres change sides, the data's crossing (crossesAt: the mesh on the side they
    // come from, the mesh on the side they go to; 22 November 2026): through both, at the station, or on from its end
    const viaIds = (Array.isArray(l.via) ? l.via : []).filter(v => boxById.has(v)), cx = Array.isArray(l.crossesAt) && l.crossesAt.length === 2 && l.crossesAt.every(v => boxById.has(v)) && !(l.crossesAt[0] === l.from && l.crossesAt[1] === l.to) ? l.crossesAt : null;
    let tailCtl = null;
    for (const v of viaIds) { midCtl.push(centreOf(v)); if (cx && v === cx[0]) midCtl.push(centreOf(cx[1])); }
    if (cx && !viaIds.includes(cx[0])) { if (cx[0] === l.to) tailCtl = centreOf(cx[1]); else midCtl.push(centreOf(cx[0]), centreOf(cx[1])); }
    if (l.crosses && !midCtl.length) { const sx = Math.sign(RA.centre[0] || 1), y = Math.min(-45, Math.max(-110, (RA.centre[1] + RB.centre[1]) / 2)); midCtl.push([sx * 9, y, callosumZ], [-sx * 9, y, callosumZ]); }
    const bent = !midCtl.length;
    const nA = Math.floor(RA.pts.length / 3), nB = Math.floor(RB.pts.length / 3);
    let len = 0;
    for (let f = 0; f < o.scan.fibres; f++) {
      const j = [(scanRnd() - 0.5) * 2 * o.scan.bundleMm, (scanRnd() - 0.5) * 2 * o.scan.bundleMm, (scanRnd() - 0.5) * 2 * o.scan.bundleMm];
      const pa = surfPt(RA, Math.floor(f * nA / o.scan.fibres + scanRnd() * 2)), pb = surfPt(RB, Math.floor(f * nB / o.scan.fibres + scanRnd() * 2));
      let mids = midCtl;
      if (bent) { // a middle point sunk toward the half's own middle (not the brain's), so the fibre runs under the surface
        const m = mix3(pa, pb, 0.5), hc = halfCentre(RA.side || RB.side || Math.sign(m[0]) || 1), d = dist3(pa, pb), dh = dist3(m, hc) || 1, k = Math.min(1, o.scan.bundleSink * d / dh);
        mids = [mix3(m, hc, k)];
      }
      const ctl = [pa, ...mids.map(m => [m[0] + j[0], m[1] + j[1], m[2] + j[2]]), pb];
      if (tailCtl) ctl.push([tailCtl[0] + j[0], tailCtl[1] + j[1], tailCtl[2] + j[2]]);
      const w = addWire('bundle', `bundle:${l.from}:${l.to}:${f}`, sampleCurve(ctl.map(bctrl), o.stepMm.link), { a0: 0, flags: EMAP_FLAG.net, spark: false });
      w.net = [ra, rb]; len += w.lenMm; netWires.push(w.id);
    }
    sLinks.push({ a: ra, b: rb, lenMm: len / o.scan.fibres, kind: 'link' });
  }
  if (sRegions.length) yield 'bundles';
  // the short fibres between neighbouring surface regions of one half (the boxes that touch, nearest first)
  for (const b of boxes) scanRegionOf(b.id);
  const surfRegions = sRegions.map((R, i) => i).filter(i => sRegions[i].surface && sRegions[i].side !== 0);
  const boxGap = (x, y) => { const A = boxById.get(sRegions[x].id), B = boxById.get(sRegions[y].id); let g = 0; for (let c = 0; c < 3; c++) g = Math.max(g, A.min[c] - B.max[c], B.min[c] - A.max[c]); return g; };
  const nearPairs = [], haveLink = new Set(sLinks.map(l => `${Math.min(l.a, l.b)}:${Math.max(l.a, l.b)}`));
  for (const x of surfRegions) {
    const near = surfRegions.filter(y => y !== x && sRegions[y].side === sRegions[x].side && boxGap(x, y) < 3).sort((p1, p2) => boxGap(x, p1) - boxGap(x, p2)).slice(0, o.scan.local.perRegion);
    for (const y of near) { const k = `${Math.min(x, y)}:${Math.max(x, y)}`; if (!haveLink.has(k)) { haveLink.add(k); nearPairs.push([x, y]); } }
  }
  for (const [x, y] of nearPairs.slice(0, o.scan.local.max)) {
    const RA = sRegions[x], RB = sRegions[y], nA = Math.floor(RA.pts.length / 3), nB = Math.floor(RB.pts.length / 3);
    // the nearest points of the two surfaces, then the next nearest for the second fibre
    const candPts = [];
    for (let i = 0; i < nA; i++) for (let k = 0; k < nB; k++) candPts.push([dist3(surfPt(RA, i), surfPt(RB, k)), i, k]);
    candPts.sort((p1, p2) => p1[0] - p2[0]);
    let madeN = 0, len = 0;
    const usedPa = new Set(), usedPb = new Set();
    for (const [d, i, k] of candPts) {
      if (madeN >= o.scan.local.fibres || d > o.scan.local.maxMm) break;
      if (usedPa.has(i) || usedPb.has(k) || d < 4) continue;
      usedPa.add(i); usedPb.add(k);
      const pa = surfPt(RA, i), pb = surfPt(RB, k), m = mix3(pa, pb, 0.5), sx = RA.side;
      const inward = [m[0] - sx * o.scan.local.sink * d, m[1], m[2] - o.scan.local.sink * d * 0.4];
      const w = addWire('local', `local:${RA.id}:${RB.id}:${madeN}`, sampleCurve([pa, inward, pb].map(bctrl), o.stepMm.brain), { a0: 0, flags: EMAP_FLAG.net, spark: false });
      w.net = [x, y]; len += w.lenMm; netWires.push(w.id); madeN++;
    }
    if (madeN) sLinks.push({ a: x, b: y, lenMm: len / madeN, kind: 'local' });
  }
  for (const rec of A) rec.region = scanRegionOf(EMAP_BRAIN_MESH.precentral[sideKey(rec.hemisphere)]);
  yield 'network';

  /* ---- the timing: one display speed, raised so the farthest muscle of any movement is reached in time ---- */
  let longest = { mm: 0, area: null, action: null, muscle: null };
  for (const [ai, actionId, ms] of pairs) {
    const rec = A[ai], t = rec.actions.get(actionId), a0 = t ? t.a0 : rec.a0;
    for (const mi of ms) { const mm = mList[mi].aMm - a0; if (mm > longest.mm) longest = { mm, area: rec.id, action: actionId, muscle: mList[mi].id }; }
  }
  if (!(longest.mm > 0)) { let mx = 0; for (const m of mList) mx = Math.max(mx, m.aMm); let mn = 0; for (const rec of A) mn = Math.min(mn, rec.a0); longest = { mm: mx - mn, area: null, action: null, muscle: null }; }
  const speed = Math.max(o.speedMmS, longest.mm / o.arriveMaxS), upSpeed = speed * o.upShare;
  for (const w of wires) if (w.unit === 'mm') for (let i = 0; i < w.a.length; i++) w.a[i] /= speed;
  for (const w of wires) { w.a0 = w.a[0]; w.a1 = w.a[w.a.length - 1]; if (Number.isFinite(w.parentA)) w.parentA /= speed; }
  for (const m of mList) { m.a = m.aMm / speed; m.tau = Float32Array.from(m.tau, v => (v >= BIG ? BIG : v / speed)); m.wires = Int32Array.from(m.wires); }
  for (const rec of A) {
    rec.a0 /= speed;
    for (const t of rec.actions.values()) if (!t.done) { t.a0 /= speed; t.done = true; }
    if (rec.stem) rec.stem.a0 /= speed;
    for (const x of rec.exits.values()) x.forkA /= speed;
    rec.links = Int32Array.from(rec.links);
  }

  /* ---- the vertices: every wire as a strip of two vertices per node, every mark as a quad ---- */
  const dots = []; // { node, wire, a, mm, lift, flags, copies }
  for (const m of mList) dots.push({ node: wires[m.branch].nodes[wires[m.branch].nodes.length - 1], wire: m.branch, a: m.a, mm: o.dot.muscleMm, lift: o.dot.liftMm, flags: EMAP_FLAG.dot | EMAP_FLAG.dotMuscle, copies: 'body' });
  for (const rec of A) {
    for (const x of rec.exits.values()) { const w = wires[x.sens]; dots.push({ node: bnode(rec.sens), wire: w.id, a: w.a[0], mm: o.dot.patchMm, lift: o.dot.brainLiftMm, flags: EMAP_FLAG.dot | EMAP_FLAG.dotPatch | EMAP_FLAG.sens, copies: 'brain' }); }
    const seen = new Set();
    for (const t of [...rec.actions.values(), ...(rec.stem ? [rec.stem] : [])]) { if (seen.has(t.wire)) continue; seen.add(t.wire); dots.push({ node: bnode(t.p), wire: t.wire, a: t.a0, mm: o.dot.blockMm, lift: o.dot.brainLiftMm, flags: EMAP_FLAG.dot | EMAP_FLAG.dotBlock, copies: 'brain' }); }
  }
  const copiesOf = c => (c === 'body' ? 2 : 1);
  let nv = 0, ni = 0;
  for (const w of wires) { const c = copiesOf(w.copies); nv += 2 * w.nodes.length * c; ni += 6 * (w.nodes.length - 1) * c; }
  for (const d of dots) { const c = copiesOf(d.copies); nv += 4 * c; ni += 6 * c; }
  const V = { pa: new Float32Array(3 * nv), pb: new Float32Array(3 * nv), ta: new Float32Array(3 * nv), tb: new Float32Array(3 * nv), bind: new Float32Array(4 * nv), geo: new Float32Array(4 * nv), sig: new Float32Array(4 * nv), net: new Float32Array(4 * nv), index: new Uint32Array(ni) };
  let v = 0, ix = 0;
  const pal = (L, copy) => (L === B0 ? 0 : L + copy * stride);
  // (part 3: each vertex also says the network regions its fibre joins (-1: none), how far along its wire it lies and
  // the wire's length, in mm of the rest places: the traffic's pulses and the storms' fronts run on these)
  let netA = -1, netB = -1, netMm = 0, netLen = 0;
  const classOf = (copies, copy) => (copies === 'brain' ? EMAP_FLAG.brain : copies === 'bridge' ? EMAP_FLAG.bridge | EMAP_FLAG.mirror : copy === 0 ? EMAP_FLAG.mirror : EMAP_FLAG.own);
  const put = (n, copy, tx, ty, tz, ux, uy, uz, dw, gx, gy, gz, gw, wire, a, idle, flags) => {
    const q = n.q || n.p;
    V.pa[3 * v] = n.p[0]; V.pa[3 * v + 1] = n.p[1]; V.pa[3 * v + 2] = n.p[2];
    V.pb[3 * v] = q[0]; V.pb[3 * v + 1] = q[1]; V.pb[3 * v + 2] = q[2];
    V.ta[3 * v] = tx; V.ta[3 * v + 1] = ty; V.ta[3 * v + 2] = tz; V.tb[3 * v] = ux; V.tb[3 * v + 1] = uy; V.tb[3 * v + 2] = uz;
    V.bind[4 * v] = pal(n.ia, copy); V.bind[4 * v + 1] = pal(n.ib, copy); V.bind[4 * v + 2] = n.w; V.bind[4 * v + 3] = dw;
    V.geo[4 * v] = gx; V.geo[4 * v + 1] = gy; V.geo[4 * v + 2] = gz; V.geo[4 * v + 3] = gw;
    V.sig[4 * v] = wire; V.sig[4 * v + 1] = a; V.sig[4 * v + 2] = idle; V.sig[4 * v + 3] = flags;
    V.net[4 * v] = netA; V.net[4 * v + 1] = netB; V.net[4 * v + 2] = netMm; V.net[4 * v + 3] = netLen;
    return v++;
  };
  yield 'timing';
  for (const w of wires) {
    if (w.id % 60 === 59) yield 'vertices';
    const N = w.nodes, n = N.length;
    netA = w.net ? w.net[0] : -1; netB = w.net ? w.net[1] : -1; netLen = w.lenMm;
    for (let copy = 0; copy < copiesOf(w.copies); copy++) {
      const cls = classOf(w.copies, copy);
      netMm = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0) netMm += dist3(N[i].p, N[i - 1].p);
        const a = N[Math.max(0, i - 1)], b = N[Math.min(n - 1, i + 1)], me = N[i];
        const aq = a.q || a.p, bq = b.q || b.p;
        const fl = w.flags | cls | (copy === 1 && headSeg.has(domSeg(me)) ? EMAP_FLAG.head : 0);
        const i0 = put(me, copy, b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2], bq[0] - aq[0], bq[1] - aq[1], bq[2] - aq[2], b.w - a.w, -1, 0, w.width, w.beadScale, w.id, w.a[i], w.idle, fl);
        put(me, copy, b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2], bq[0] - aq[0], bq[1] - aq[1], bq[2] - aq[2], b.w - a.w, 1, 0, w.width, w.beadScale, w.id, w.a[i], w.idle, fl);
        if (i + 1 < n) { V.index[ix++] = i0; V.index[ix++] = i0 + 1; V.index[ix++] = i0 + 2; V.index[ix++] = i0 + 1; V.index[ix++] = i0 + 3; V.index[ix++] = i0 + 2; }
      }
    }
  }
  const lineIndices = ix;
  netA = -1; netB = -1; netMm = 0; netLen = 0;
  for (const d of dots) {
    for (let copy = 0; copy < copiesOf(d.copies); copy++) {
      const fl = d.flags | classOf(d.copies, copy) | (copy === 1 && headSeg.has(domSeg(d.node)) ? EMAP_FLAG.head : 0);
      const i0 = v;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(d.node, copy, 0, 0, 0, 0, 0, 0, 0, sx, sy, d.mm, d.lift, d.wire, d.a, 0, fl);
      V.index[ix++] = i0; V.index[ix++] = i0 + 1; V.index[ix++] = i0 + 2; V.index[ix++] = i0 + 1; V.index[ix++] = i0 + 3; V.index[ix++] = i0 + 2;
    }
  }

  /* ---- what the per-frame step needs, as flat tables ---- */
  const nW = wires.length;
  const wireA0 = new Float32Array(nW), wireA1 = new Float32Array(nW), wirePerMm = new Float32Array(nW), wireBrain = new Uint8Array(nW);
  const sparkable = [];
  wires.forEach((w, i) => {
    wireA0[i] = Math.min(w.a0, w.a1); wireA1[i] = Math.max(w.a0, w.a1); wirePerMm[i] = w.lenMm > 0 ? Math.abs(w.a1 - w.a0) / w.lenMm : 0; wireBrain[i] = w.copies === 'brain' ? 1 : 0;
    if (w.spark && wirePerMm[i] > 0 && w.kind !== 'bridge') sparkable.push(i);
  });
  for (const rec of A) { rec.fibre = rec.fibre ? { id: rec.fibre.id } : null; delete rec.names; }
  const wireTexW = 64, wireTexH = Math.max(1, Math.ceil(nW / wireTexW));
  return {
    kind: 'ns-emap-model', standIn: wiring.standIn === true, o,
    vertices: V, vertexCount: nv, indexCount: ni, lineIndexCount: lineIndices,
    palette: { size: 1 + 2 * stride, stride, bodySegs, armSegs, armBase },
    wires: wires.map(w => ({ id: w.id, kind: w.kind, key: w.key, a0: w.a0, a1: w.a1, lenMm: w.lenMm, parent: w.parent, nodes: w.nodes.length, copies: w.copies })),
    wireCount: nW, wireA0, wireA1, wirePerMm, wireBrain, sparkable: Int32Array.from(sparkable), wireTexW, wireTexH,
    areas: A, areaIndex, muscles: mList, muscleIndex, trunks: trunkList.map(t => ({ id: t.id, name: t.name, plain: t.plain, side: t.side, origin: t.origin, top: t.top, roots: t.roots.slice() })),
    exits: [...exits.values()].map(e => ({ key: e.key, kind: e.kind, side: e.side, part: e.part, trunk: e.trunk, bridge: e.bridge.id })),
    net: Int32Array.from(net),
    // part 3: the scan's regions ({ id, name, centre, pts, side, surface }), the links between them ({ a, b, lenMm,
    // kind }) and the network's fibres (wire ids)
    scanRegions: sRegions, scanLinks: sLinks, netWires: Int32Array.from(netWires),
    speedMmS: speed, upSpeedMmS: upSpeed, kUp: o.upShare, bridgeS: o.bridgeMm / speed,
    slow: { command: o.realMmS / speed, report: o.realMmS / upSpeed },
    longest: { ...longest, s: longest.mm / speed },
    counts: { wires: nW, nodes: wires.reduce((n, w) => n + w.nodes.length, 0), dots: dots.length, trunks: trunkList.length, muscles: mList.length, areas: A.length },
    warnings
  };
}

/* ------------------------------------------------------------------ routes (for tests, the legend and inspect) */

/** The route of one movement of one area to one muscle: { wires: [{ id, kind, key, tau }] from the block outward,
 * stations: plain names in order, arrivalS (when the front reaches the muscle), crosses, usesCord, exit }, or null
 * when the area sends nothing down (an in-between area) or a name is unknown. Pure. */
export function emapRoute(model, areaId, actionId, muscleId) {
  const ai = model.areaIndex.get(areaId), mi = model.muscleIndex.get(muscleId);
  if (ai === undefined || mi === undefined) return null;
  const rec = model.areas[ai], m = model.muscles[mi];
  if (!rec.down) return null;
  const x = rec.exits.get(m.exit) || null, t = rec.actions.get(actionId) || rec.stem || [...rec.actions.values()][0];
  const W = model.wires, wires = [], stations = [];
  wires.push({ ...W[t.wire], tau: BIG });
  stations.push(`motor area ${rec.id}`);
  if (!x) return { wires, stations, arrivalS: m.a - t.a0, crosses: false, usesCord: false, exit: m.exit, complete: false };
  wires.push({ ...W[rec.fibre.id], tau: x.forkA }, { ...W[x.tail], tau: BIG });
  const half = rec.hemisphere > 0 ? 'left' : 'right';
  stations.push(`internal capsule (${half} half)`, `midbrain (${half} half)`);
  if (x.kind === 'cord') { stations.push(`pons (${half} half)`, `medulla (${half} half)`, x.cross ? 'crossing to the other side, low in the medulla' : 'no crossing: the same side, low in the medulla'); }
  else stations.push(`${x.part} (${x.side > 0 ? 'left' : 'right'} side${x.cross ? ', crossed' : ''}): the head nerve's cells`);
  stations.push('the drawn bridge from the big brain to the body');
  for (let i = m.wires.length - 1; i >= 0; i--) wires.push({ ...W[m.wires[i]], tau: m.tau[i] });
  for (let i = m.names.length - 1; i >= 0; i--) stations.push(m.names[i]);
  return { wires, stations, arrivalS: m.a - t.a0, crosses: x.cross, usesCord: x.kind === 'cord', exit: m.exit, complete: true };
}

/* ------------------------------------------------------------------ the per-frame state */

/** The state the step keeps (all arrays made once): the slot table and the wire table as the drawer uploads them
 * (slotTex: 4 texels of 4 floats per slot = colour and level; start time, start coordinate, mode, link level; a spark's
 * speed, width and life; spare. wireTex: per wire the command's slot + 1, how far the route uses the wire, the report's
 * slot + 1, and when the report enters the wire), their dirty flags, and the bookkeeping. seed: the sparks' sequence. */
export function createEmapState(model, { seed = 20261121 } = {}) {
  const o = model.o, S = o.slots, nA = model.areas.length;
  const slots = [];
  for (let i = 0; i < S; i++) slots.push({ index: i, mode: 0, area: -1, t0: 0, a0: 0, level: 0, target: 0, seen: false, wasSeen: false, pulse: false, pulseWas: false, hint: false, wires: new Int32Array(o.slotWires), nWires: 0, sigs: new Int32Array(24), nSigs: 0, endAt: 0, arrivalS: 0, farMuscle: -1, action: null, a0Set: false, stemmed: false });
  return {
    kind: 'ns-emap-state', model, slots,
    slotTex: new Float32Array(16 * S), wireTex: new Float32Array(4 * model.wireTexW * model.wireTexH),
    slotDirty: true, wireDirty: true, wireWrites: 0, slotWrites: 0,
    areaSlot: new Int16Array(nA).fill(-1),
    now: 0, lastNow: NaN, active: 0, maxLevel: 0, sparks: 0, nextSparkAt: 0, rng: seed >>> 0, reduced: false,
    lastVolley: null, lastVolleyKept: null, lvArea: -1, lvAction: null, lvMuscle: -1, lvArrival: 0, lvSerial: 0, lvKeptSerial: -1, volleys: 0, dropped: 0
  };
}

/** A frame's input, made once and refilled: links[i] = { area, action, level, pulse, hint, restart, sig, muscles
 * (Int32Array), n }, and lit[i] = { area, level } for the lit areas that have no link (the in-between areas).
 * pulse: the link is an activation (a look or a click: each new one sends a front); false: a movement the player
 * holds or makes (keys, Space, the limb turn, the neck following the look), whose light may come and go with its
 * speed: it rejoins its route's light without a new front. restart: a fresh activation is marked this frame. */
export function createEmapFrame(model, { maxLinks = 64, maxMuscles = 48 } = {}) {
  const links = [], lit = [];
  for (let i = 0; i < maxLinks; i++) links.push({ area: -1, action: null, level: 0, pulse: true, hint: false, restart: false, sig: 0, muscles: new Int32Array(maxMuscles), n: 0 });
  for (let i = 0; i < model.areas.length; i++) lit.push({ area: -1, level: 0 });
  return { now: 0, reduced: false, nLinks: 0, links, nLit: 0, lit, maxLinks, maxMuscles };
}

const rnd = st => { st.rng = (Math.imul(st.rng, 1664525) + 1013904223) >>> 0; return st.rng / 4294967296; };

function freeSlot(st, s) {
  const W = st.wireTex, id = s.index + 1;
  for (let i = 0; i < s.nWires; i++) {
    const k = 4 * s.wires[i];
    if (W[k] === id) { W[k] = 0; W[k + 1] = 0; st.wireDirty = true; }
    if (W[k + 2] === id) { W[k + 2] = 0; W[k + 3] = 0; st.wireDirty = true; }
  }
  if (s.area >= 0 && st.areaSlot[s.area] === s.index) st.areaSlot[s.area] = -1;
  s.mode = 0; s.area = -1; s.nWires = 0; s.nSigs = 0; s.level = 0; s.target = 0; s.hint = false; s.seen = false; s.wasSeen = false; s.pulse = false; s.pulseWas = false;
  const T = st.slotTex, b = 16 * s.index;
  for (let i = 0; i < 16; i++) T[b + i] = 0;
  st.slotDirty = true;
}

/** Give a wire to a slot: the command's channel (down), the report's (up), or both. tau: how far along the wire the
 * route goes (the larger of the old and new when the slot has it already, or takes it over from another slot: colours
 * are never blended, the newer and stronger area wins the wire); upU: when the report enters it (the earlier). */
function takeWire(st, s, wire, tau, down, up, upU) {
  const W = st.wireTex, k = 4 * wire, id = s.index + 1;
  let had = false;
  for (let i = 0; i < s.nWires; i++) if (s.wires[i] === wire) { had = true; break; }
  if (!had) { if (s.nWires >= s.wires.length) { st.dropped++; return; } s.wires[s.nWires++] = wire; }
  W[k + 1] = W[k] !== 0 || W[k + 2] !== 0 ? Math.max(W[k + 1], tau) : tau;
  if (down) W[k] = id;
  if (up) { W[k + 3] = W[k + 2] === id ? Math.min(W[k + 3], upU) : upU; W[k + 2] = id; }
  st.wireDirty = true; st.wireWrites++;
}

function startSlot(st, areaIdx, now, hint) {
  let s = null;
  const n = st.model.o.slots - st.model.o.sparkSlots;
  for (let i = 0; i < n; i++) if (st.slots[i].mode === 0) { s = st.slots[i]; break; }
  if (!s) { // every slot is taken: the faintest fading one gives way
    let low = Infinity;
    for (let i = 0; i < n; i++) { const q = st.slots[i]; if (!q.seen && q.level < low) { low = q.level; s = q; } }
    if (!s) return null;
    freeSlot(st, s);
  }
  const rec = st.model.areas[areaIdx];
  s.mode = hint ? EMAP_MODE.hint : EMAP_MODE.area; s.area = areaIdx; s.t0 = now; s.a0 = rec.a0; s.level = 0; s.target = 0; s.hint = hint; s.nWires = 0; s.nSigs = 0; s.arrivalS = 0; s.farMuscle = -1; s.action = null; s.a0Set = false; s.stemmed = false;
  st.areaSlot[areaIdx] = s.index;
  if (!hint) for (let i = 0; i < rec.links.length; i++) takeWire(st, s, rec.links[i], BIG, true, false, 0);
  return s;
}

/** An area is lit this frame: its slot (a new one when it has none). A new volley, with its front, starts when an
 * activation arrives and none was there the frame before (also while the last one is still fading), when a fresh
 * activation is marked, or when a hint gives way to the real thing; a held movement whose light comes back joins the
 * light that is there. A hint never touches a real volley. */
function seeArea(st, areaIdx, level, hint, restart, pulse, now) {
  let s = st.areaSlot[areaIdx] >= 0 ? st.slots[st.areaSlot[areaIdx]] : null;
  if (s && hint && !s.hint) return null;
  if (s && !hint && (s.hint || (!s.pulse && ((restart && !s.seen) || (pulse && !s.pulseWas))))) { freeSlot(st, s); s = null; }
  if (!s) { s = startSlot(st, areaIdx, now, hint); if (!s) { st.dropped++; return null; } if (!hint) st.volleys++; }
  s.seen = true;
  if (pulse) s.pulse = true;
  if (level > s.target) s.target = level;
  return s;
}

/** Add one link's wires to its area's slot: the movement's twig, the fibre and tail to each way out its muscles need,
 * the bridge, the muscles' chains, and the way back up. */
function addLink(st, s, L) {
  const M = st.model, rec = M.areas[s.area], kUp = M.kUp;
  const t = (L.action !== null && rec.actions.get(L.action)) || rec.stem || null;
  if (t) { takeWire(st, s, t.wire, BIG, true, false, 0); if (!s.a0Set || t.a0 < s.a0) { s.a0 = t.a0; s.a0Set = true; } }
  else for (let i = 0; i < rec.twigs.length; i++) takeWire(st, s, rec.twigs[i], BIG, true, false, 0);
  if (!rec.down) return;
  const a0 = s.a0;
  for (let j = 0; j < L.n; j++) {
    const m = M.muscles[L.muscles[j]];
    if (!m) continue;
    const x = rec.exits.get(m.exit), T = m.a - a0, upU = T + m.a / kUp;
    if (x) { takeWire(st, s, rec.fibre.id, x.forkA, true, false, 0); takeWire(st, s, x.tail, BIG, true, false, 0); takeWire(st, s, x.sens, BIG, false, true, upU); }
    for (let i = 0; i < m.wires.length; i++) takeWire(st, s, m.wires[i], m.tau[i], true, true, upU);
    if (T > s.arrivalS) { s.arrivalS = T; s.farMuscle = m.index; s.action = L.action; }
  }
}

/** One frame. frame.now in seconds on the map's clock; frame.links / frame.lit as createEmapFrame describes. Updates
 * the slot and wire tables in place and sets their dirty flags; returns the number of lit areas. No allocation. */
export function emapStep(model, st, frame) {
  const o = model.o, now = frame.now, dt = Number.isFinite(st.lastNow) ? Math.max(0, Math.min(0.25, now - st.lastNow)) : 0;
  st.lastNow = now; st.now = now; st.reduced = frame.reduced === true;
  const nArea = o.slots - o.sparkSlots;
  for (let i = 0; i < nArea; i++) { const s = st.slots[i]; s.wasSeen = s.seen; s.seen = false; s.pulseWas = s.pulse; s.pulse = false; s.target = 0; }
  for (let i = 0; i < frame.nLinks; i++) {
    const L = frame.links[i];
    if (!(L.area >= 0) || !(L.level > 0)) continue;
    const s = seeArea(st, L.area, L.level, L.hint === true, L.restart === true, L.pulse !== false, now);
    if (!s) continue;
    let had = false;
    for (let k = 0; k < s.nSigs; k++) if (s.sigs[k] === L.sig) { had = true; break; }
    if (!had) {
      if (s.nSigs < s.sigs.length) s.sigs[s.nSigs++] = L.sig;
      addLink(st, s, L);
      // the last volley, kept as plain numbers (its slot is given back about a second later; what it was stays known)
      if (!s.hint && s.farMuscle >= 0) { st.lastVolley = s.index; st.lvArea = s.area; st.lvAction = s.action; st.lvMuscle = s.farMuscle; st.lvArrival = s.arrivalS; st.lvSerial++; }
    }
  }
  for (let i = 0; i < frame.nLit; i++) {
    const q = frame.lit[i];
    if (!(q.area >= 0) || !(q.level > 0)) continue;
    const s = seeArea(st, q.area, q.level, false, false, true, now);
    if (s && !s.stemmed) { s.stemmed = true; const rec = model.areas[q.area]; for (let k = 0; k < rec.twigs.length; k++) takeWire(st, s, rec.twigs[k], BIG, true, false, 0); }
  }
  // levels: up quickly, down over fadeS once the movement's own light has ended
  let active = 0, maxLevel = 0;
  const T = st.slotTex;
  for (let i = 0; i < nArea; i++) {
    const s = st.slots[i];
    if (s.mode === 0) continue;
    const was = s.level;
    if (s.target > s.level) s.level = st.reduced || !(dt > 0) ? s.target : Math.min(s.target, s.level + dt / o.riseS);
    else if (s.target < s.level) s.level = Math.max(s.target, s.level - dt / (s.hint ? 0.25 : o.fadeS));
    if (!s.seen && s.level <= 0.004) { freeSlot(st, s); continue; }
    active++;
    if (!s.hint && s.level > maxLevel) maxLevel = s.level;
    const b = 16 * i, c = model.areas[s.area].colour;
    if (T[b + 3] !== s.level || T[b + 4] !== s.t0 || T[b + 5] !== s.a0 || T[b + 6] !== s.mode || was === 0) {
      T[b] = c[0]; T[b + 1] = c[1]; T[b + 2] = c[2]; T[b + 3] = s.level; T[b + 4] = s.t0; T[b + 5] = s.a0; T[b + 6] = s.mode; T[b + 7] = 1;
      st.slotDirty = true; st.slotWrites++;
    }
  }
  st.active = active; st.maxLevel = maxLevel;
  // the resting storm: a few slow sparks along lines chosen at random (none under reduced motion)
  let sparks = 0;
  for (let i = nArea; i < o.slots; i++) {
    const s = st.slots[i];
    if (s.mode === 0) continue;
    if (now >= s.endAt || st.reduced) { freeSlot(st, s); continue; }
    sparks++;
  }
  if (!st.reduced && sparks < o.spark.max && now >= st.nextSparkAt && model.sparkable.length) {
    st.nextSparkAt = now + o.spark.everyS * (0.5 + rnd(st));
    let s = null;
    for (let i = nArea; i < o.slots; i++) if (st.slots[i].mode === 0) { s = st.slots[i]; break; }
    let wire = -1;
    for (let tries = 0; tries < 5 && wire < 0; tries++) { const w = model.sparkable[Math.floor(rnd(st) * model.sparkable.length)]; if (st.wireTex[4 * w] === 0) wire = w; }
    if (s && wire >= 0) {
      const brain = model.wireBrain[wire] === 1, P = brain ? o.spark.brain : o.spark.body, per = model.wirePerMm[wire];
      const a0 = model.wireA0[wire], a1 = model.wireA1[wire], span = a1 - a0, life = o.spark.lifeS[0] + (o.spark.lifeS[1] - o.spark.lifeS[0]) * rnd(st);
      const drift = Math.min(P.driftMm * per, 0.6 * span) * (rnd(st) < 0.5 ? -1 : 1), start = a0 + span * (0.2 + 0.6 * rnd(st));
      s.mode = EMAP_MODE.spark; s.area = -1; s.t0 = now; s.a0 = start; s.level = 1; s.endAt = now + life; s.nWires = 0;
      takeWire(st, s, wire, BIG, true, false, 0);
      const b = 16 * s.index, c = o.colours.spark;
      T[b] = c[0]; T[b + 1] = c[1]; T[b + 2] = c[2]; T[b + 3] = 1; T[b + 4] = now; T[b + 5] = start; T[b + 6] = EMAP_MODE.spark; T[b + 7] = 0;
      T[b + 8] = drift / life; T[b + 9] = Math.max(P.sigmaMm * per, span * 0.02); T[b + 10] = life; T[b + 11] = 0;
      st.slotDirty = true; sparks++;
    }
  }
  st.sparks = sparks;
  return active;
}

/* ------------------------------------------------------------------ the light rule (the drawer's shader, in JS) */

const fract = x => x - Math.floor(x);
const sq = x => x * x;

/** The light of a point of a wire now, exactly as the drawer's shader works it out (for tests; the shader text is
 * built from the same constants). q: { wire, a (the point's coordinate), lane: 'down' | 'up', dot: null | 'muscle' |
 * 'patch' | 'block', link: bool, brain: bool }. Returns the light (0 = dark; about 1 = a lit line). Pure. */
export function emapLightAt(model, st, q) {
  const o = model.o, W = st.wireTex, T = st.slotTex, k = 4 * q.wire, now = st.now, red = st.reduced;
  const up = q.lane === 'up' || q.dot === 'patch';
  const slot = (up ? W[k + 2] : W[k]) - 1;
  if (slot < 0) return 0;
  const b = 16 * slot, level = T[b + 3], t = now - T[b + 4], a0 = T[b + 5], mode = T[b + 6], tau = W[k + 1], upU = W[k + 3], a = q.a, kUp = model.kUp;
  const scale = q.brain ? o.bead.brainScale : 1;
  if (mode === EMAP_MODE.spark) { const life = T[b + 10], amp = sq(Math.sin(Math.PI * Math.min(1, Math.max(0, t / life)))); return amp * Math.exp(-sq((a - (a0 + T[b + 8] * t)) / T[b + 9])); }
  if (mode === EMAP_MODE.hint) return up || q.dot ? 0 : a > tau ? 0 : level * o.light.hint;
  if (mode !== EMAP_MODE.area) return 0;
  if (q.link) {
    if (red) return level * o.link.gain * o.link.steady;
    const amp = sq(Math.max(0, 1 - t / o.link.fadeS));
    return level * o.link.gain * amp * Math.exp(-sq((a - t) / o.link.sigmaS));
  }
  if (q.dot === 'block') return level * o.dot.block;
  if (!up) {
    const F = red ? BIG : a0 + t;
    if (a > Math.min(F, tau) + 1e-6) return 0;
    if (q.dot === 'muscle') return level * (o.dot.hold + (red ? 0 : o.dot.pop * Math.exp(-(F - a) / o.dot.popS)));
    const head = red ? 0 : o.light.head * Math.exp(-sq((F - a) / o.light.headS));
    const p = fract(a * scale / o.bead.downSpanS - now * o.bead.downHz);
    const bead = red ? o.light.steady : o.bead.gain * (Math.exp(-p * o.bead.tail) + Math.exp(-(1 - p) * o.bead.lead));
    return level * (o.light.hold + bead + head);
  }
  const Fu = red ? -BIG : kUp * (upU - t);
  if (a < Fu - 1e-6 || a > tau + 1e-6) return 0;
  if (q.dot === 'patch') { const since = red ? BIG : t - (upU - a / kUp); return level * (o.dot.patchHold + (red ? 0 : o.dot.patchPop * Math.exp(-since / o.dot.patchS))); }
  const head = red ? 0 : o.light.headUp * Math.exp(-sq((a - Fu) / o.light.headUpS));
  const p = fract(a * scale / o.bead.upSpanS + now * o.bead.upHz);
  const bead = red ? o.light.steady : o.bead.gainUp * (Math.exp(-p * o.bead.tail) + Math.exp(-(1 - p) * o.bead.lead));
  return level * (o.light.holdUp + bead + head);
}

/** What the map says about itself for inspect() and the legend (plain data): the last volley's area, movement, its
 * farthest muscle's route as station names and when the front reaches it. */
export function emapLastVolley(model, st) {
  if (!(st.lvArea >= 0) || !(st.lvMuscle >= 0)) return null;
  if (st.lvKeptSerial !== st.lvSerial) {
    const rec = model.areas[st.lvArea], m = model.muscles[st.lvMuscle], r = emapRoute(model, rec.id, st.lvAction, m.id);
    st.lastVolleyKept = { area: rec.id, movement: st.lvAction, muscle: m.id, stations: r ? r.stations : [], arrivalS: Math.round(st.lvArrival * 1000) / 1000 };
    st.lvKeptSerial = st.lvSerial;
  }
  return st.lastVolleyKept;
}
