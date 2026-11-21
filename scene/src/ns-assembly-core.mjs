/** NeuroSurge loading picture ("assembly"): while the game's files load, the bones, the muscles and the parts of the
 * brain are drawn as they arrive, each one flying into its place, so the player watches the body and the brain come
 * together instead of reading a loading page (user note of 17 November 2026).
 *
 * This is a PICTURE OF THE LOADING, nothing more. It draws the same atlas files the game loads (the bytes the game
 * fetched, parsed a second time here with a small reader of its own), in the atlas' own standing posture, with plain
 * colours. It checks nothing: the game's own loader still verifies every file's hash and shape before it uses it, and
 * a part shown here can still be refused there. Nothing in this module is read by the game.
 *
 * The module has no DOM: it runs in a worker on an OffscreenCanvas (ns-assembly-worker.mjs), so the picture keeps
 * moving while the page's main thread builds the body, or on the page itself where a worker canvas is not available.
 *
 * Coordinates: the atlas' millimetres (BodyParts3D: +x the body's left, +y its back, +z up). The camera stands in
 * front of the body and looks at it like a mirror, with +z up.
 */

import { ROOM, createRoomBackdrop, roomGain, roomBeatStep, isAbyss } from './ns-room.mjs';
import { ASSEMBLY_ORDER, ASSEMBLY_TIERS, assemblyDepth, createAssemblyRelease } from './ns-assembly-order.mjs';
import { HEMI_GAP, hemisphereSideOf, partedPositions } from './ns-brain-part.mjs';
import { buildEyeballs, buildNerves } from './ns-brain-eyes.mjs';
import { BODY_SHAPE, limbLengthField, trunkShapeField } from './ns-body-shape.mjs';
import { RAW_LOOK, patchRawShaders } from './ns-raw-look.mjs';

/** 20 November 2026 (the owner: "Let's make the limbs longer", "a smaller and much flatter chest essentially, and a more
 * observable bottom torso"). The game draws its body with longer limbs and a flatter chest (ns-body-shape BODY_SHAPE, on
 * the rest meshes); the picture draws the atlas's bones and muscles the same way, so the body that comes together is
 * the body the game then shows: a part of a limb (the table's `limb` and `chain`, ns-assembly assemblyPartsTable) is
 * made longer by its limb's field, and every bone and muscle goes through the trunk rule. A muscle that also lies on the
 * trunk (limb ending in '*') is weighted by its distance from the limb's axes (the game asks its nearest bones, which
 * this picture does not have). The picture still shows the atlas's own build, without the game's trained build. Pure:
 * a new array (the parsed one may be shared). */
const SHAPE_LIMB_FIELDS = new Map();
let shapeTrunkField = null;
export function assemblyShapedPositions(p, place, shape = BODY_SHAPE) {
  const limbOn = Boolean(shape && shape.limbs && shape.limbs.on && place && place.limb && Array.isArray(place.chain));
  const trunkOn = Boolean(shape && shape.trunk && shape.trunk.on);
  if (!p || (!limbOn && !trunkOn)) return p;
  let f = null, crossing = false;
  if (limbOn) {
    const key = String(place.limb).replace('*', '');
    f = shape === BODY_SHAPE ? SHAPE_LIMB_FIELDS.get(key) : null;
    if (!f) { f = limbLengthField(key.slice(2), place.chain, shape.limbs); if (shape === BODY_SHAPE) SHAPE_LIMB_FIELDS.set(key, f); }
    crossing = String(place.limb).endsWith('*');
  }
  const tf = trunkOn ? (shape === BODY_SHAPE ? (shapeTrunkField || (shapeTrunkField = trunkShapeField(shape.trunk))) : trunkShapeField(shape.trunk)) : null;
  const q = new Float32Array(p.length), D = [0, 0, 0];
  for (let i = 0; i + 2 < p.length; i += 3) {
    let x = p[i], y = p[i + 1], z = p[i + 2];
    if (f) { f.at(x, y, z, D); const w = crossing ? f.reach(x, y, z) : 1; x += w * D[0]; y += w * D[1]; z += w * D[2]; }
    if (tf) y += tf.at(x, y, z);
    q[i] = x; q[i + 1] = y; q[i + 2] = z;
  }
  return q;
}

/** 20 November 2026 (the owner, 19 November: "this also means on the loading page, you'll also see the eyes come
 * together and connect to the brain"). Once the brain's strip has lit (or could not be lit), the two eyeballs and their
 * optic nerves, built by the game's own builders (ns-brain-eyes buildEyeballs / buildNerves, the same illustration the
 * game draws), come in last: the eyeballs fly in from far apart, in front of the brain and below it, and close on
 * their places while the nerves come up under the brain to meet them; each flashes as it lands, like every other part.
 *   delayS     after the strip has lit;
 *   eyeFromMm  where each eyeball starts, from its place (brain mm: sideways outward, forward toward the viewer, up);
 *   eyeFlyS    how long the eyeballs fly (the other parts fly ASSEMBLY.flyS);
 *   nerveFromMm / nerveLagS  the nerves' start (from below) and how long after the eyeballs they set off.
 * Under reduced motion they appear in place. The brain's two halves are drawn HEMI_GAP.eachMm apart here too, as in the
 * game (ns-brain-part), so the eyeballs, which follow their halves, sit where the game puts them. A picture only. */
export const ASSEMBLY_EYES = Object.freeze({ delayS: 0.35, eyeFromMm: Object.freeze([95, -120, -45]), eyeFlyS: 1.25, nerveFromMm: Object.freeze([0, -10, -28]), nerveLagS: 0.45 });

/** Kinds of part the picture knows, and their colour (sRGB hex). 'strip' is the precentral gyrus, where the game's
 * motor areas are drawn; 'vessel' the cerebral arteries on the brain. */
export const ASSEMBLY_KINDS = Object.freeze({
  bone: 0xe8dfc8, muscle: 0xb2343c, eye: 0xf4f1ea, brain: 0xe0a39c, strip: 0xff4f9a, vessel: 0xa3161d
});

/** 20 November 2026 (the owner, Message 196: "New look for everything not just body"): in the raw look (ns-raw-look
 * RAW_LOOK.on) the picture's models are drawn in the game's raw light (patchRawShaders, no tone curve) and its bodies in
 * the game's raw colours: the ivory bone and the reference pictures' rose red (RGB 196, 92, 88) for the outer muscles,
 * a step darker for each deeper storey as before; the cortex in the game's own crown pink (ns-brain-ink BRAIN_FLESH).
 * sRGB hex by kind or tier name; anything not listed keeps its colour below. (The picture knows no muscle's name, so it
 * shows the storeys, not the game's muscle groups.) */
export const ASSEMBLY_RAW_COLOURS = Object.freeze({
  bone: 0xe8e0cd, muscle: 0xc45c58, 'deep muscles': 0x9e4744, 'intermediate muscles': 0xb1514e, 'outer muscles': 0xc45c58,
  brain: 0xedbdba, 'outer cortex': 0xedbdba, 'inner cortex': 0xe2aeab
});
const RAW = RAW_LOOK.on === true;
const rawHex = (key, hex) => (RAW && ASSEMBLY_RAW_COLOURS[key] !== undefined ? ASSEMBLY_RAW_COLOURS[key] : hex);
/** The raw look's light on a loading-picture material (composed after its own patch; a clone needs it again: three.js
 * does not copy onBeforeCompile). Nothing when the raw look is off. */
function rawMaterial(m) {
  if (!RAW || !m) return m;
  const prev = m.onBeforeCompile, key = `${typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : ''}|ns-raw`;
  m.onBeforeCompile = function (shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer);
    const p = patchRawShaders(shader.vertexShader, shader.fragmentShader);
    if (p) { shader.vertexShader = p.vertexShader; shader.fragmentShader = p.fragmentShader; }
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** 18 November 2026 (inside out): a colour for each layer, so the layers read as layers while they come in: the deep
 * muscles a darker red than the outer ones; inside the brain, the ventricles in the pale blue of their fluid, the deep
 * nuclei grey, the white matter cream (the usual colours of an anatomy atlas). sRGB hex, by tier name. A tier that is
 * not listed takes its kind's colour. */
export const ASSEMBLY_TIER_COLOURS = Object.freeze({
  body: Object.freeze({ 'deep muscles': 0x8a2430, 'intermediate muscles': 0xa22c36, 'outer muscles': 0xbf3a40 }),
  brain: Object.freeze({ 'brain stem': 0xd8a596, cerebellum: 0xcc958c, ventricles: 0x7fbde6, 'deep nuclei': 0xa48a8e, 'white matter': 0xefe4d6,
    'inner cortex': 0xd99a94, 'outer cortex': 0xe0a39c, 'motor strip': 0xff4f9a, arteries: 0xa3161d })
});

/** Layout numbers (millimetres, degrees, seconds). The brain is drawn a second time, larger and tipped toward the
 * viewer, above the mirror body: the same arrangement as the game's first view (brain above, mirror body below).
 * 18 November 2026 (PKG-LOAD: "The mirror body builds the same way at its place, a beat behind your own body"): your
 * own body stands in front, nearer the viewer, turned with its back to the viewer, and the mirror body facing it is its
 * literal reflection in a vertical plane half way between them, as in the game (the game's mirror body is a 1:1
 * reflection). The viewer looks over your own body's shoulder, from behind and a little above, at the mirror body and
 * the brain: the game's arrangement seen from behind (as the E view shows it).
 *   camera: where the viewer stands and what it looks at, its vertical field of view, and the narrowest aspect at which
 *     that field still holds everything (narrower windows widen it); orbitDeg / swayS: a slow turn of the viewer round
 *     the look point (none under reduced motion).
 *   selfAheadMm: how far in front of the mirror body (toward the viewer) your own body stands.
 *   flyMm / brainFlyMm: how far a body part / a brain part (in the brain's own millimetres) flies in from. */
export const ASSEMBLY = Object.freeze({
  camera: Object.freeze({ at: Object.freeze([1650, -5800, 2300]), look: Object.freeze([-120, -800, 1530]), fovYDeg: 31, minAspect: 1.45 }),
  orbitDeg: 5, swayS: 13,
  bodyCentre: Object.freeze([0, -40, 880]), selfAheadMm: 2300,
  brainCentre: Object.freeze([-0.5, -79.7, 1547.5]), brainScale: 6.6, brainTiltDeg: 44, brainAt: Object.freeze([0, -40, 2330]),
  flyMm: 260, brainFlyMm: 26, flyS: 0.75, flashS: 1.1, maxStartsPerFrame: 14,
  // 18 November: behind the parts stands the game's own room (ns-room), seen exactly as the game's first picture sees
  // it (the field of view and the downward look the game starts with; the launcher passes its own numbers, these are
  // the same ones for a caller that passes none), so the backdrop does not jump when the game takes over.
  // (18 November 2026, late: the game's first view is now 54 degrees, 52 down: the launcher's numbers, package FLAT)
  room: Object.freeze({ fovYDeg: 54, pitchDeg: -25.5, eye: Object.freeze([0, 0.11, -0.04]), mirrorZ: -2.06 }),
  // 21 November 2026 (the owner, Message 208: "Background should still be more of an abyss."; ns-room ROOM.abyss): there
  // is no room behind the parts any more. The backdrop is the game's abyss, seen by THIS picture's own viewer: the same
  // black, with the same faintly lit dark round this picture's own brain and two bodies (their middles are the layout's
  // above; their sizes for the glow, as balls: brainMm about the drawn brain's half width, bodyMm half a body's
  // height). So the dark is lit where the things are, here as in the game, and the black away from them is the same
  // black when the game takes over. (The game's first picture has the brain much larger and nearer, so more of its dark
  // is lit: at the hand-over the picture's far corners go from about RGB 2 to about 5.) Used while ROOM.abyss.on; `room`
  // above is for the room.
  abyss: Object.freeze({ brainMm: 520, bodyMm: 880 })
});

/** Reads the vertices and faces of a Wavefront OBJ from its bytes (ASCII). Returns { positions: Float32Array,
 * indices: Uint32Array } with polygons fanned into triangles, or null when the file has no usable triangle. Only what
 * a picture needs: "v x y z" and "f a b c ..." (with or without /t/n parts); everything else is skipped. */
export function parseObjBytes(u8) {
  const n = u8.length;
  let pos = new Float32Array(3 * 8192), np = 0, idx = new Uint32Array(3 * 16384), ni = 0;
  let i = 0;
  const face = [];
  while (i < n) {
    const c = u8[i], d = i + 1 < n ? u8[i + 1] : 10;
    if (c === 118 && (d === 32 || d === 9)) { // "v "
      i += 2;
      for (let k = 0; k < 3; k++) {
        while (i < n && (u8[i] === 32 || u8[i] === 9)) i++;
        let sign = 1, v = 0, any = false;
        if (u8[i] === 45) { sign = -1; i++; } else if (u8[i] === 43) i++;
        while (i < n) { const q = u8[i] - 48; if (q < 0 || q > 9) break; v = v * 10 + q; i++; any = true; }
        if (u8[i] === 46) { i++; let f = 0.1; while (i < n) { const q = u8[i] - 48; if (q < 0 || q > 9) break; v += q * f; f *= 0.1; i++; any = true; } }
        if (any && (u8[i] === 101 || u8[i] === 69)) {
          i++; let es = 1, e = 0;
          if (u8[i] === 45) { es = -1; i++; } else if (u8[i] === 43) i++;
          while (i < n) { const q = u8[i] - 48; if (q < 0 || q > 9) break; e = e * 10 + q; i++; }
          v *= Math.pow(10, es * e);
        }
        if (np + 1 > pos.length) { const g = new Float32Array(pos.length * 2); g.set(pos); pos = g; }
        pos[np++] = any ? sign * v : 0;
      }
    } else if (c === 102 && (d === 32 || d === 9)) { // "f "
      i += 2; face.length = 0;
      while (i < n && u8[i] !== 10 && u8[i] !== 13) {
        while (i < n && (u8[i] === 32 || u8[i] === 9)) i++;
        let v = 0, any = false;
        while (i < n) { const q = u8[i] - 48; if (q < 0 || q > 9) break; v = v * 10 + q; i++; any = true; }
        if (any) face.push(v - 1);
        while (i < n && u8[i] !== 32 && u8[i] !== 9 && u8[i] !== 10 && u8[i] !== 13) i++; // the /t/n part
      }
      for (let k = 1; k + 1 < face.length; k++) {
        if (ni + 3 > idx.length) { const g = new Uint32Array(idx.length * 2); g.set(idx); idx = g; }
        idx[ni++] = face[0]; idx[ni++] = face[k]; idx[ni++] = face[k + 1];
      }
    }
    while (i < n && u8[i] !== 10) i++;
    i++;
  }
  const count = Math.floor(np / 3);
  if (count < 3 || ni < 3) return null;
  for (let k = 0; k < ni; k++) if (idx[k] >= count) return null;
  return { positions: pos.slice(0, count * 3), indices: idx.slice(0, ni) };
}

/** Smooth vertex normals (area weighted) and the centre of the bounding box of a parsed mesh. */
export function meshNormalsAndCentre(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let k = 0; k < indices.length; k += 3) {
    const a = 3 * indices[k], b = 3 * indices[k + 1], c = 3 * indices[k + 2];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < positions.length; k += 3) {
    const l = Math.hypot(normals[k], normals[k + 1], normals[k + 2]) || 1;
    normals[k] /= l; normals[k + 1] /= l; normals[k + 2] /= l;
    const x = positions[k], y = positions[k + 1], z = positions[k + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return { normals, centre: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] };
}

const easeOut = u => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/** The loading picture's brain beats, as an exposed brain does in surgery (user note of 17 November 2026: "a beating
 * reacting brain as you would see in neurosurgery"): a heartbeat-shaped swell (a quick rise, a slower fall with a small
 * second bump) on a slow rise and fall like breathing. Returns { beat: 0..1, breath: -1..1 } for a time in seconds.
 * A display rhythm for a picture; nothing is measured. Pure. */
export const BRAIN_BEAT = Object.freeze({ beatS: 0.92, breathS: 4.4, swell: 0.014, breathSwell: 0.008 });
export function brainBeat(t, o = BRAIN_BEAT) {
  const ph = ((t % o.beatS) + o.beatS) % o.beatS / o.beatS;
  const rise = ph < 0.14 ? Math.sin((Math.PI / 2) * (ph / 0.14)) ** 2 : Math.exp(-(ph - 0.14) / 0.2);
  const notch = 0.14 * Math.exp(-(((ph - 0.42) / 0.06) ** 2));
  return { beat: Math.min(1, rise + notch), breath: Math.sin((2 * Math.PI * t) / o.breathS) };
}
/** The beat's clock (seconds), shared by the loading picture and the game's living brain (ns-brain-live), so the brain
 * that came together on the loading picture goes on beating in step in the game: the wall clock, wrapped at a whole
 * number of beats and of breaths (110 beats = 23 breaths = 101.2 s), so the wrap is not seen. Pure but for the clock. */
export function brainBeatClock(epochMs = Date.now(), o = BRAIN_BEAT) {
  const wrapMs = Math.round(110 * o.beatS * 1000);
  return (((epochMs % wrapMs) + wrapMs) % wrapMs) / 1000;
}

/**
 * The picture. THREE: the three.js module; canvas: a canvas or an OffscreenCanvas; width / height: CSS pixels;
 * pixelRatio: device pixels per CSS pixel (kept at most 1.5: this is a loading picture).
 * Returns { add(kind, parsed), setProgress(fraction, finishing), resize(width, height, pixelRatio), frame(nowMs),
 * dispose(), state() }. add() takes a parseObjBytes result; frame() draws one picture.
 */
export function createAssemblyView({ THREE, canvas, width, height, pixelRatio = 1, options = ASSEMBLY, room = null, reducedMotion = false, order = ASSEMBLY_ORDER, expectReadyS = null }) {
  const o = options;
  const still = reducedMotion === true; // prefers-reduced-motion: parts appear in place; no turning, no beat
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = RAW ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; // 20 November 2026: the raw look has no tone curve
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.camera.fovYDeg, 1, 200, 20000);
  camera.up.set(0, 0, 1);
  // The room behind the parts, as the game's first picture shows it (see ASSEMBLY.room).
  const roomRule = { ...(o.room || ASSEMBLY.room), ...(room && Number.isFinite(room.fovYDeg) && Number.isFinite(room.pitchDeg) ? { fovYDeg: room.fovYDeg, pitchDeg: room.pitchDeg } : {}) };
  const roomView = { fovYDeg: roomRule.fovYDeg, aspect: 1, yawDeg: 0, pitchDeg: roomRule.pitchDeg, eye: roomRule.eye };
  // (21 November 2026: the abyss is seen by this picture's own camera; the room by the game's first view, fixed)
  const abyss = isAbyss(ROOM);
  const backdrop = createRoomBackdrop({ THREE, fixed: !abyss });
  let roomBeat = 0;
  if (abyss) {
    // the lit dark round this picture's own brain, mirror body and own body (ASSEMBLY.abyss), in its own millimetres
    const U = backdrop.uniforms, g = o.abyss || ASSEMBLY.abyss, b = o.bodyCentre;
    const put = (i, x, y, z, r) => { U.uRoomAura.value[i].set(x, y, z, 1); U.uRoomAuraN.value[i].set(1 / r, 0, 0, 0, 1 / r, 0, 0, 0, 1 / r); U.uRoomSize.value.setComponent(i, r); };
    put(0, o.brainAt[0], o.brainAt[1], o.brainAt[2], g.brainMm);
    put(1, b[0], b[1], b[2], g.bodyMm);
    put(2, -b[0], b[1] - o.selfAheadMm, b[2], g.bodyMm); // your own body: turned half round and set selfAheadMm in front
  } else {
    // the floor shadows where the game's first picture has them: under the brain, the mirror body and your own body
    const sh = backdrop.uniforms.uRoomShade.value, bx = ROOM.centre[0], bz = ROOM.centre[1];
    sh[0].set(bx, bz, ROOM.shade.brain[0], ROOM.shade.brain[1]); sh[1].set(0, roomRule.mirrorZ, ROOM.shade.mirror[0], ROOM.shade.mirror[1]); sh[2].set(ROOM.bodyAt[0], ROOM.bodyAt[2], ROOM.shade.body[0], ROOM.shade.body[1]);
  }
  scene.add(backdrop.mesh);
  scene.add(new THREE.HemisphereLight(0xf2f4ff, 0x1a1418, 1.15));
  const key = new THREE.DirectionalLight(0xfff1e2, 2.4); key.position.set(-900, -2600, 2600); scene.add(key);
  const rim = new THREE.DirectionalLight(0x69b7ff, 1.5); rim.position.set(1400, 2200, 1500); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xff8f7a, 0.5); fill.position.set(1800, -1200, 300); scene.add(fill);

  // Your own body: the atlas body turned half round its upright axis (back to the viewer) and set selfAheadMm in front of
  // the mirror body. The mirror body: the atlas body mirrored left for right (scale x -1), at the atlas' own place. The
  // two are each other's reflection in the plane y = (mirror body's y - selfAheadMm / 2) (see ASSEMBLY). Both draw the
  // same geometry. The large brain is tipped toward the viewer.
  const body = new THREE.Group(); body.rotation.z = Math.PI; body.position.set(0, 2 * o.bodyCentre[1] - o.selfAheadMm, 0); scene.add(body);
  const mirror = new THREE.Group(); mirror.scale.set(-1, 1, 1); scene.add(mirror);
  const brainPivot = new THREE.Group(); brainPivot.position.set(o.brainAt[0], o.brainAt[1], o.brainAt[2]); scene.add(brainPivot);
  // The top of the brain tips toward the viewer, so the motor strip shows.
  const brainTilt = new THREE.Group(); brainTilt.rotation.x = o.brainTiltDeg * Math.PI / 180; brainTilt.scale.setScalar(o.brainScale); brainPivot.add(brainTilt);
  const brain = new THREE.Group(); brain.position.set(-o.brainCentre[0], -o.brainCentre[1], -o.brainCentre[2]); brainTilt.add(brain);

  const base = {};
  for (const k of Object.keys(ASSEMBLY_KINDS)) {
    base[k] = rawMaterial(new THREE.MeshStandardMaterial({ color: rawHex(k, ASSEMBLY_KINDS[k]), roughness: k === 'bone' || k === 'eye' ? 0.5 : 0.42, metalness: 0.02,
      emissive: k === 'strip' ? 0xff2f86 : 0x000000, emissiveIntensity: k === 'strip' ? 0.35 : 0 }));
  }
  // One resting material per layer (ASSEMBLY_TIER_COLOURS); the strip keeps its own (its light beats).
  const tierBase = new Map();
  const restMaterial = (kind, track, tier) => {
    const name = track && Number.isInteger(tier) ? ASSEMBLY_TIERS[track][tier] : null;
    const hex = name && ASSEMBLY_TIER_COLOURS[track] ? rawHex(name, ASSEMBLY_TIER_COLOURS[track][name]) : undefined;
    if (kind === 'strip' || hex === undefined) return base[kind];
    const key = `${kind}:${track}:${tier}`;
    let m = tierBase.get(key);
    if (!m) { m = rawMaterial(base[kind].clone()); m.color.setHex(hex); if (name === 'ventricles') { m.roughness = 0.25; } tierBase.set(key, m); }
    return m;
  };
  // 18 November 2026 (PKG-LOAD: the brain is built "out to the cortex and the motor strip ... then the strip's areas
  // lighting in their colours"): once both precentral gyri are in, the picture asks the game's own modules for the
  // motor areas on them (ns-brain segmentMotorStrips with the game's body map, ns-bodymap BODY_MOTOR_MAP, and the game's
  // area colours, ns-colors areaColor), loaded only then, and the areas light one after another from the medial end of
  // the strip to the Sylvian end, each in its own colour (STRIP_LIGHT.sweepS), glowing with the beat. If that fails the
  // strip stays pink. A picture of the game's map, nothing measured.
  const STRIP_LIGHT = { sweepS: 2.6, edge: 0.06, delayS: 0.5 };
  const stripLit = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.02, emissive: 0xffffff, emissiveIntensity: 0.3 });
  stripLit.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;'); };
  stripLit.customProgramCacheKey = () => 'ns-assembly-strip-lit';
  rawMaterial(stripLit);
  const stripState = { parts: [], status: 'waiting', startS: null, done: false, ms: null, error: null };
  const PINK_LINEAR = new THREE.Color(0xff4f9a); // the strip's own colour (THREE converts the hex to linear light)
  const flash = { bone: new THREE.Color(0x9fdcff), eye: new THREE.Color(0x9fdcff), muscle: new THREE.Color(0xff7a5c), brain: new THREE.Color(0xffb3c8), strip: new THREE.Color(0xff5fb0), vessel: new THREE.Color(0xff6a5c) };

  // Progress bar: two thin quads in a screen-space scene.
  const hudScene = new THREE.Scene(), hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0.5, 0.5, 0);
  const track = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ color: 0x2a323c, transparent: true, opacity: 0.7, depthTest: false, toneMapped: false }));
  const barMat = new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false });
  const bar = new THREE.Mesh(quad, barMat);
  hudScene.add(track, bar);
  // 19 November 2026: the page now shows one clear bar with a percentage for the whole wait (ns-load-progress); this
  // hair-thin line under it is no longer drawn (setProgress still feeds the picture's own pacing).
  track.visible = false; bar.visible = false;

  // 18 November 2026 (inside out): parsed parts are held by the release rule (ns-assembly-order) until their tier comes
  // up; `pending` holds the parts the rule has released but that wait for a frame with room to start them (at most
  // maxStartsPerFrame a frame), in order.
  const release = createAssemblyRelease({ order });
  if (Number.isFinite(expectReadyS)) release.expect(expectReadyS);
  const pending = [];  // released parts waiting for a frame to start
  const moving = [];   // parts flying in or still flashing
  let W = 1, H = 1, t0 = null, lastMs = 0, parts = 0, triangles = 0, progress = 0, shown = 0, finishing = false, disposed = false, frames = 0, hurried = false, lastT = 0, mirrored = 0, renderMs = 0;
  const byKind = {}, startLog = []; // startLog: [time s, track, tier] of each start, for checks (state().starts)

  // The viewer: at camera.at, looking at camera.look, turned orbitDeg either way round the look point (frame()).
  const placeCamera = angle => {
    const c = o.camera, dx = c.at[0] - c.look[0], dy = c.at[1] - c.look[1], ca = Math.cos(angle), sa = Math.sin(angle);
    camera.position.set(c.look[0] + dx * ca - dy * sa, c.look[1] + dx * sa + dy * ca, c.at[2]);
    camera.lookAt(c.look[0], c.look[1], c.look[2]);
  };
  function resize(w, h, pr = pixelRatio) {
    W = Math.max(1, Math.floor(w)); H = Math.max(1, Math.floor(h));
    renderer.setPixelRatio(Math.min(1.5, Math.max(0.5, pr || 1)));
    renderer.setSize(W, H, false);
    const aspect = W / H;
    camera.aspect = aspect;
    // A window narrower than camera.minAspect widens the vertical field so the same width stays in view.
    const half = Math.tan(o.camera.fovYDeg * Math.PI / 360);
    camera.fov = aspect >= o.camera.minAspect ? o.camera.fovYDeg : 2 * Math.atan(half * o.camera.minAspect / aspect) * 180 / Math.PI;
    placeCamera(0);
    camera.updateProjectionMatrix();
    roomView.aspect = aspect; backdrop.setFixedView(roomView);
    // bar: 36 % of the width, 3 px tall, 26 px above the bottom edge
    const bw = 0.36, bh = 3 / H, by = 26 / H;
    track.scale.set(bw, bh, 1); track.position.set(0.5 - bw / 2, by, 0);
    bar.position.set(0.5 - bw / 2, by, 0);
  }
  resize(width, height, pixelRatio);

  /** A parsed part comes in. place: { track, tier, frac, name, groups, layer } from the manifest (ns-assembly
   * assemblyPartOf), or null: then the part is placed by its own vertices (assemblyDepth with its bounding-box centre). */
  function add(kind, parsed, place = null) {
    if (disposed || !parsed) return;
    const k = Object.prototype.hasOwnProperty.call(ASSEMBLY_KINDS, kind) ? kind : 'muscle';
    // (a bone or muscle of the body: drawn in the game's shape, assemblyShapedPositions)
    if ((k === 'bone' || k === 'muscle') && !(place && place.track === 'brain')) parsed = { ...parsed, positions: assemblyShapedPositions(parsed.positions, place) };
    const { normals, centre } = meshNormalsAndCentre(parsed.positions, parsed.indices);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setIndex(new THREE.BufferAttribute(parsed.indices, 1));
    let d = place && place.track && Number.isInteger(place.tier) ? place : null;
    if (!d) d = assemblyDepth({ kind: k, name: place && place.name, groups: place && place.groups, layer: place && place.layer, centre });
    // (a part of a cerebral half is drawn HEMI_GAP.eachMm away from the midline, as the game draws it: ASSEMBLY_EYES;
    // 20 November 2026: a cerebral artery too, by its own side, when the game fetches them: one part at a time, so not
    // by the brain under it as the game does (ns-brain-part partedOnBrain); the arteries under the brain differ a little)
    if (d && d.track === 'brain' && (k === 'brain' || k === 'strip' || k === 'vessel')) {
      const side = hemisphereSideOf({ name: place && place.name, positions: parsed.positions });
      if (side) {
        const parted = partedPositions(parsed.positions, side, HEMI_GAP.eachMm);
        g.setAttribute('position', new THREE.BufferAttribute(parted, 3));
        // (20 November 2026: the centre from the parted points themselves, since the step need not be the same for
        // every point of a half: ns-brain-part may ease it toward the back of the brain)
        if (parted !== parsed.positions) { let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < parted.length; i += 3) { if (parted[i] < x0) x0 = parted[i]; if (parted[i] > x1) x1 = parted[i]; } centre[0] = (x0 + x1) / 2; }
      }
    }
    if (!d) { g.dispose(); return; }
    release.arrive({ kind: k, track: d.track, tier: d.tier, frac: d.frac, geometry: g, centre, tris: parsed.indices.length / 3, id: place && place.id, name: place && place.name });
  }

  const mirrorDue = []; // body parts whose mirror copy starts a beat later: { p, at, jitter, reach }
  function start(p, nowS, copy = null) {
    const inBrain = p.track === 'brain';
    const rest = restMaterial(p.kind, p.track, p.tier);
    const mat = rawMaterial(rest.clone());
    const jitter = copy ? copy.jitter : p.kind === 'muscle' ? [(Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.07] : null;
    if (jitter) mat.color.offsetHSL(jitter[0], 0, jitter[1]);
    const mesh = new THREE.Mesh(p.geometry, mat);
    mesh.frustumCulled = false;
    p.geometry.userData.refs = (p.geometry.userData.refs || 0) + 1; // meshes drawing it (your body and the mirror body share it)
    // Fly-in direction: away from the body's upright axis (from the brain's centre for a brain part), a little upward.
    // Under reduced motion the part does not fly: it is in place from the start and only its light settles.
    const c = inBrain ? o.brainCentre : [o.bodyCentre[0], o.bodyCentre[1], p.centre[2]];
    let dx = p.centre[0] - c[0], dy = p.centre[1] - c[1], dz = inBrain ? p.centre[2] - c[2] : 0.25 * (p.centre[2] - o.bodyCentre[2]) / 880;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-3) { dx = 0; dy = -1; dz = 0; } else { dx /= l; dy /= l; dz /= l; }
    const reach = copy ? copy.reach : still ? 0 : (inBrain ? o.brainFlyMm : o.flyMm) * (0.75 + Math.random() * 0.6);
    (inBrain ? brain : copy ? mirror : body).add(mesh);
    moving.push({ mesh, kind: p.kind, t: nowS, dir: [dx * reach, dy * reach, dz * reach], c: p.centre, rest: mat.emissiveIntensity, restColor: mat.emissive.clone(), base: rest, keep: Boolean(jitter) });
    if (copy) { mirrored++; return; }
    parts++; triangles += p.tris; byKind[p.kind] = (byKind[p.kind] || 0) + 1;
    if (p.kind === 'strip') { stripState.parts.push({ mesh, p }); if (stripState.parts.length === 2) segmentStrip(nowS); }
    if (startLog.length < 2048) startLog.push([Math.round(nowS * 1000) / 1000, p.track, p.tier]);
    // The mirror body builds the same way, one beat behind your own body (the same flight, mirrored).
    if (!inBrain) mirrorDue.push({ p, at: nowS + (hurried ? order.lagS * order.hurry : order.lagS), jitter, reach });
  }

  // 18 November 2026: parts that have come to rest are merged, every MERGE.everyS, into one mesh per body (or brain)
  // and layer colour; a muscle's own slight shade goes into vertex colours. Two bodies of single parts were about
  // 1250 draws a picture (21.7 ms of drawing a picture in the worker, measured, on the one core the game builds on);
  // merged, a few dozen. Strip parts stay single (their colours change).
  const MERGE = { everyS: 1.0, minParts: 8 };
  const settled = [];
  const shadeMaterial = new Map(); // rest material -> its copy that takes the vertex colours
  let lastMergeS = 0, batches = 0;
  function mergeSettled() {
    const groups = new Map();
    for (const e of settled) {
      const parent = e.mesh.parent;
      if (!parent) continue;
      const key = `${parent.uuid}|${e.keep ? 'shade' : 'flat'}|${e.base.uuid}`;
      let g = groups.get(key); if (!g) { g = { parent, keep: e.keep, base: e.base, list: [] }; groups.set(key, g); }
      g.list.push(e);
    }
    settled.length = 0;
    for (const g of groups.values()) {
      let nv = 0, ni = 0;
      for (const e of g.list) { nv += e.mesh.geometry.getAttribute('position').count; ni += e.mesh.geometry.getIndex().count; }
      const P = new Float32Array(3 * nv), N = new Float32Array(3 * nv), I = new Uint32Array(ni), C = g.keep ? new Float32Array(3 * nv) : null;
      let ov = 0, oi = 0;
      for (const e of g.list) {
        const geo = e.mesh.geometry, pa = geo.getAttribute('position').array, na = geo.getAttribute('normal').array, ia = geo.getIndex().array, cnt = pa.length / 3;
        P.set(pa, 3 * ov); N.set(na, 3 * ov);
        for (let k = 0; k < ia.length; k++) I[oi + k] = ia[k] + ov;
        if (C) { const c = e.mesh.material.color; for (let v = ov; v < ov + cnt; v++) { C[3 * v] = c.r; C[3 * v + 1] = c.g; C[3 * v + 2] = c.b; } }
        ov += cnt; oi += ia.length;
        g.parent.remove(e.mesh);
        if (e.keep) e.mesh.material.dispose();
        if (--geo.userData.refs <= 0) geo.dispose();
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(P, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      if (C) merged.setAttribute('color', new THREE.BufferAttribute(C, 3));
      merged.setIndex(new THREE.BufferAttribute(I, 1));
      let mat = g.base;
      if (g.keep) { mat = shadeMaterial.get(g.base); if (!mat) { mat = rawMaterial(g.base.clone()); mat.color.setHex(0xffffff); mat.vertexColors = true; shadeMaterial.set(g.base, mat); } }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.frustumCulled = false;
      g.parent.add(mesh);
      batches++;
    }
  }

  async function segmentStrip(nowS) {
    if (stripState.status !== 'waiting') return;
    stripState.status = 'loading';
    try {
      const [brainMod, mapMod, colourMod] = await Promise.all([import('./ns-brain.mjs'), import('./ns-bodymap.mjs'), import('./ns-colors.mjs')]);
      if (disposed) return;
      const c0 = Date.now();
      const strips = stripState.parts.map(({ p }) => {
        const pos = p.geometry.getAttribute('position').array, idx = p.geometry.getIndex().array;
        let sx = 0; for (let i = 0; i < pos.length; i += 3) sx += pos[i];
        const hemisphere = sx < 0 ? 'right' : 'left'; // +x is the body's left
        return { id: p.id || `${hemisphere} precentral gyrus`, name: p.name || `${hemisphere} precentral gyrus`, hemisphere, kind: 'precentral', positions: pos, indices: idx };
      });
      const seg = brainMod.segmentMotorStrips(strips, mapMod.BODY_MOTOR_MAP, { outline: false });
      for (let k = 0; k < stripState.parts.length; k++) {
        const { p, mesh } = stripState.parts[k], n = p.geometry.getAttribute('position').count;
        const area = new Float32Array(3 * n), along = new Float32Array(n).fill(-1);
        for (let i = 0; i < n; i++) { area[3 * i] = PINK_LINEAR.r; area[3 * i + 1] = PINK_LINEAR.g; area[3 * i + 2] = PINK_LINEAR.b; }
        for (const part of seg.parts) {
          if (part.meshId !== strips[k].id) continue;
          const c = colourMod.areaColor(part.regionId);
          if (!c) continue;
          for (let r = 0; r < part.vertexCount; r++) { const v = part.sourceIndex[r]; area[3 * v] = c[0]; area[3 * v + 1] = c[1]; area[3 * v + 2] = c[2]; along[v] = Number.isFinite(part.s[r]) ? part.s[r] : part.u[r]; }
        }
        const colour = new Float32Array(3 * n);
        for (let i = 0; i < n; i++) { colour[3 * i] = PINK_LINEAR.r; colour[3 * i + 1] = PINK_LINEAR.g; colour[3 * i + 2] = PINK_LINEAR.b; }
        p.geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
        stripState.parts[k].area = area; stripState.parts[k].along = along; stripState.parts[k].mesh = mesh;
      }
      stripState.ms = Date.now() - c0;
      stripState.status = 'ready';
    } catch (err) { stripState.status = 'failed'; stripState.error = String(err && err.message || err); }
  }

  /** The strip's areas light from the medial end (s 0) to the Sylvian end (s 1) over STRIP_LIGHT.sweepS. */
  function stepStrip(t) {
    if (stripState.status !== 'ready' || stripState.done) return;
    if (stripState.parts.some(sp => moving.some(m => m.mesh === sp.mesh))) return; // still flying in
    if (stripState.startS === null) stripState.startS = t + STRIP_LIGHT.delayS;
    const sweep = hurried ? 2 : (t - stripState.startS) / STRIP_LIGHT.sweepS * (1 + STRIP_LIGHT.edge * 2) - STRIP_LIGHT.edge;
    if (sweep < -STRIP_LIGHT.edge) return;
    for (const sp of stripState.parts) {
      if (sp.mesh.material !== stripLit) { const old = sp.mesh.material; sp.mesh.material = stripLit; if (old !== base.strip && old !== stripLit && old.dispose) old.dispose(); }
      const col = sp.p.geometry.getAttribute('color'), a = col.array;
      for (let i = 0, n = sp.along.length; i < n; i++) {
        const s = sp.along[i];
        let w = s < 0 ? 0 : (sweep - s) / STRIP_LIGHT.edge; w = w <= 0 ? 0 : w >= 1 ? 1 : w * w * (3 - 2 * w);
        a[3 * i] = PINK_LINEAR.r + (sp.area[3 * i] - PINK_LINEAR.r) * w;
        a[3 * i + 1] = PINK_LINEAR.g + (sp.area[3 * i + 1] - PINK_LINEAR.g) * w;
        a[3 * i + 2] = PINK_LINEAR.b + (sp.area[3 * i + 2] - PINK_LINEAR.b) * w;
      }
      col.needsUpdate = true;
    }
    if (sweep >= 1 + STRIP_LIGHT.edge) stripState.done = true;
  }

  /** ASSEMBLY_EYES: the eyeballs and the nerves come in once the strip has lit. */
  const eyesState = { status: 'waiting', startS: null, error: null };
  const eyeMats = [];
  function stepEyes(t) {
    if (eyesState.status !== 'waiting' || disposed) return;
    const stripIn = stripState.parts.length === 2 && !stripState.parts.some(sp => moving.some(m => m.mesh === sp.mesh));
    if (!(hurried || (stripIn && (stripState.done || stripState.status === 'failed')))) return;
    if (eyesState.startS === null) { eyesState.startS = t + (hurried ? 0 : ASSEMBLY_EYES.delayS); return; }
    if (t < eyesState.startS) return;
    eyesState.status = 'flying';
    try {
      const E = buildEyeballs(), N = buildNerves(), O = ASSEMBLY_EYES;
      const nv = E.positions.length / 6, ni = E.indices.length / 2;
      const geoOf = (P, Nn, C, I) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setIndex(new THREE.BufferAttribute(I, 1)); return g; };
      const centreOf = P => { let x = 0, y = 0, z = 0; const n = P.length / 3; for (let i = 0; i < P.length; i += 3) { x += P[i]; y += P[i + 1]; z += P[i + 2]; } return [x / n, y / n, z / n]; };
      const launch = (geo, rough, c, dir, at, flyS) => {
        const base = rawMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0.02 }));
        const mat = rawMaterial(base.clone()); eyeMats.push(base, mat);
        const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
        // (hidden until the next frame's flight step places it: it was added after this frame's flight step, so it was
        // drawn once at its final place before flying in; 20 Nov review)
        mesh.visible = false;
        brain.add(mesh);
        const d = still ? [0, 0, 0] : dir;
        // (its own flight time: moving[] scales the time by flyS / ASSEMBLY.flyS; `own` keeps it out of the merging)
        moving.push({ mesh, kind: 'eye', t: at, dir: d, c, rest: 0, restColor: new THREE.Color(0x000000), base, keep: false, own: true, flyS: hurried ? flyS * 0.5 : flyS });
        parts++; triangles += geo.getIndex().count / 3; byKind.eye = (byKind.eye || 0) + 1;
      };
      for (let e = 0; e < 2; e++) {
        const P = E.positions.slice(3 * nv * e, 3 * nv * (e + 1)), Nn = E.normals.slice(3 * nv * e, 3 * nv * (e + 1)), C = E.colors.slice(3 * nv * e, 3 * nv * (e + 1));
        const I = new Uint32Array(ni); for (let k = 0; k < ni; k++) I[k] = E.indices[ni * e + k] - nv * e;
        const c = centreOf(P), side = c[0] >= 0 ? 1 : -1; // (+x is the left eye's side)
        launch(geoOf(P, Nn, C, I), 0.18, c, [side * O.eyeFromMm[0], O.eyeFromMm[1], O.eyeFromMm[2]], t, O.eyeFlyS);
      }
      launch(geoOf(N.positions, N.normals, N.colors, N.indices), 0.4, centreOf(N.positions), O.nerveFromMm.slice(), t + (still ? 0 : O.nerveLagS), O.eyeFlyS - O.nerveLagS);
    } catch (err) { eyesState.status = 'failed'; eyesState.error = String(err && err.message || err); }
  }

  function frame(nowMs) {
    if (disposed) return;
    if (t0 === null) t0 = nowMs;
    const t = (nowMs - t0) / 1000, dt = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000)); lastMs = nowMs; lastT = t;
    release.due(t, pending);
    for (let k = 0; k < (hurried ? 4 : 1) * o.maxStartsPerFrame && pending.length; k++) start(pending.shift(), t);
    for (let k = 0; k < (hurried ? 4 : 1) * o.maxStartsPerFrame && mirrorDue.length && (hurried || mirrorDue[0].at <= t); k++) { const m = mirrorDue.shift(); start(m.p, t, m); }
    const flyS = hurried ? o.flyS * 0.5 : o.flyS;
    for (let k = moving.length - 1; k >= 0; k--) {
      const m = moving[k];
      if (t < m.t) { m.mesh.visible = false; continue; } // (set off later: the nerves after the eyeballs)
      m.mesh.visible = true;
      const fS = m.flyS || flyS, u = (t - m.t) / fS, e = easeOut(u), f = Math.max(0, 1 - Math.max(0, t - m.t - Math.max(0, fS - flyS)) / o.flashS);
      // It grows about its own centre while it flies in (18 November 2026: it grew about the atlas' origin at the feet,
      // so every part came up from far below, a brain part from metres away).
      const sc = still ? 1 : 0.55 + 0.45 * e, shrink = 1 - sc;
      m.mesh.position.set(m.c[0] * shrink + m.dir[0] * (1 - e), m.c[1] * shrink + m.dir[1] * (1 - e), m.c[2] * shrink + m.dir[2] * (1 - e));
      m.mesh.scale.setScalar(sc);
      m.mesh.material.emissive.copy(m.restColor).lerp(flash[m.kind], f);
      m.mesh.material.emissiveIntensity = m.rest + ((still ? 0.45 : 0.9) - m.rest) * f * f;
      if (u >= 1 && f <= 0) {
        m.mesh.position.set(0, 0, 0); m.mesh.scale.setScalar(1);
        const old = m.mesh.material;
        if (old === stripLit) { /* lit already */ } else if (!m.keep) { m.mesh.material = m.base; old.dispose(); } else { old.emissive.setHex(0x000000); old.emissiveIntensity = 0; }
        moving.splice(k, 1);
        if (m.kind !== 'strip' && !m.own) settled.push({ mesh: m.mesh, keep: m.keep, base: m.base });
        if (m.own && eyesState.status === 'flying' && !moving.some(x => x.own)) eyesState.status = 'joined';
      }
    }
    if (!hurried && settled.length && (t - lastMergeS >= MERGE.everyS && settled.length >= MERGE.minParts || (!moving.length && !pending.length && !mirrorDue.length))) { lastMergeS = t; mergeSettled(); }
    // The viewer turns slowly a little either way round the look point (not under reduced motion).
    placeCamera(still ? 0 : Math.sin((t / o.swayS) * 2 * Math.PI) * o.orbitDeg * Math.PI / 180);
    // The brain beats (a heartbeat swell on a slow breathing rise and fall), and the strip's light beats with it,
    // brighter once everything is in and the game is being built. Not under reduced motion.
    const pulse = still ? { beat: 0, breath: 0 } : brainBeat(brainBeatClock()); // the shared clock: the game's brain takes the beat over in step
    brainTilt.scale.setScalar(o.brainScale * (1 + BRAIN_BEAT.swell * pulse.beat + BRAIN_BEAT.breathSwell * pulse.breath));
    brainPivot.position.z = o.brainAt[2] + 6 * pulse.breath;
    base.strip.emissiveIntensity = still ? 0.45 : 0.3 + (finishing ? 0.55 : 0.3) * pulse.beat;
    stripLit.emissiveIntensity = still ? 0.32 : 0.22 + (finishing ? 0.4 : 0.22) * pulse.beat;
    stepStrip(t);
    stepEyes(t);
    roomBeat = roomBeatStep(roomBeat, pulse.beat, dt, still); // softened, as in the game
    backdrop.uniforms.uRoom.value.z = roomGain(roomBeat, 0, ROOM, still); // the room's light breathes with the beat, as in the game
    shown += (progress - shown) * Math.min(1, dt * 6);
    bar.scale.set(Math.max(0.0001, 0.36 * shown), 3 / H, 1);
    barMat.opacity = finishing ? 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 6)) : 0.95;
    renderer.autoClear = true;
    const r0 = performance.now();
    renderer.render(scene, camera);
    renderMs += (performance.now() - r0 - renderMs) * 0.05; // the cost of drawing, smoothed (state().renderMs)
    renderer.autoClear = false;
    renderer.render(hudScene, hudCam);
    frames++;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.traverse(x => { if (x.isMesh) { x.geometry.dispose(); if (x.material && x.material.dispose) x.material.dispose(); } });
    for (const p of pending) p.geometry.dispose();
    for (const p of release.due(Infinity, [])) p.geometry.dispose(); // the parts still held
    for (const k of Object.keys(base)) base[k].dispose();
    for (const m of tierBase.values()) m.dispose();
    stripLit.dispose();
    for (const m of eyeMats) m.dispose();
    for (const m of shadeMaterial.values()) m.dispose();
    quad.dispose(); track.material.dispose(); barMat.dispose();
    backdrop.dispose();
    renderer.dispose();
  }

  return {
    add, resize, frame, dispose,
    setProgress(fraction, isFinishing = false) { progress = Math.min(1, Math.max(progress, Number.isFinite(fraction) ? fraction : 0)); finishing = isFinishing === true; },
    /** The game is ready: the parts still held come in quickly, in order, while the picture fades. */
    hurry() { hurried = true; release.hurry(); },
    /** A manifest has come: its parts per tier (ns-assembly-order know()). */
    know(counts) { release.know(counts); },
    /** 20 November 2026: the game's first view ({ fovYDeg, pitchDeg }), when the launcher takes the picture over (the
     * picture may have started before it, with ASSEMBLY.room): the room behind the parts as the game will show it. */
    setRoom(r) {
      if (disposed || !r || !Number.isFinite(r.fovYDeg) || !Number.isFinite(r.pitchDeg)) return;
      if (roomView.fovYDeg === r.fovYDeg && roomView.pitchDeg === r.pitchDeg) return;
      roomView.fovYDeg = r.fovYDeg; roomView.pitchDeg = r.pitchDeg; backdrop.setFixedView(roomView);
    },
    /** Files are still coming (a pack's bytes), though none has arrived just now (ns-assembly-order alive()). */
    alive() { release.alive(); },
    /** How many parts have set off so far (your body's and the brain's; not the mirror body's copies). */
    started: () => parts,
    state: () => {
      const r = release.state();
      return { parts, mirrored, triangles, pending: pending.length, moving: moving.length, progress, finishing, width: W, height: H, frames, byKind: { ...byKind },
        t: Math.round(lastT * 1000) / 1000, still, hurried, expectS: r.expectS, renderMs: Math.round(renderMs * 100) / 100, batches, single: moving.length + settled.length,
        order: { body: { tier: r.body.tier, stretch: r.body.stretch, held: r.body.held, started: r.body.started }, brain: { tier: r.brain.tier, stretch: r.brain.stretch, held: r.brain.held, started: r.brain.started } },
        strip: { status: stripState.status, lit: stripState.done, ms: stripState.ms, error: stripState.error },
        eyes: { status: eyesState.status, error: eyesState.error } };
    },
    /** [time s, track, tier] of each part's start, in order (at most 2048), for checks. */
    starts: () => startLog.slice()
  };
}
