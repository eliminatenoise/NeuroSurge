/** NeuroSurge POV arm scene: Three.js scene adapter (THREE injected) and the DOM HUD.
 *
 * Nothing here imports 'three' or reads a global: createScene({ THREE, canvas }) receives the library, so this
 * module also loads in Node, where its pure helpers are tested. Three APIs used (all stable since r150): Scene,
 * PerspectiveCamera, WebGLRenderer, Group, Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial,
 * MeshBasicMaterial, Color, AmbientLight, DirectionalLight, Raycaster, Vector3, Object3D.matrix (Matrix4.fromArray)
 * and DoubleSide. No addons. Colour handling assumes r152+ colour management (linear working space, sRGB output),
 * the default of the pinned three@0.170.0, so strip vertex colours come from ns-brain colormapLinear.
 * Framing/HUD repairs R2/R3 add no constructor (THREE_API unchanged); they set plain material properties (colorWrite,
 * polygonOffset*, forceSinglePass r150+, blending = THREE.AdditiveBlending when present) and, for the glass rim,
 * Material.onBeforeCompile + customProgramCacheKey with a guarded string patch of the vertex `project_vertex` and the
 * r154+ `opaque_fragment` (or older `output_fragment`) hooks; without them the glass stays plain
 * (objects.glassRim.applied === false). See RENDER_ORDER for the passes. resize() takes an optional fovYDeg.
 *
 * Frames: the arm group is a child of the camera. Bone meshes take their rig segment matrix (rest source mm ->
 * camera metres) as their own matrix, which is the same linear map as skinApply with a single weight of 1 but runs
 * on the GPU. Muscle meshes are CPU-skinned with ns-rig skinApply (positions) and skinNormals (normals), and only
 * when the pose matrices change. The brain group sits in the world under the ns-brain display transform (subject
 * right on screen right, anterior up, superior toward the camera; determinant +1, never mirrored).
 *
 * Scientific limits: every tint, colour and number is a simulated, unitless display value. Muscle tint follows the
 * simulated drive only (no bulging, no physiology). Strip colours are a representative, overlapping simulated
 * activity field. Gaze and WASD are virtual control inputs, not real stimulation or decoding.
 *
 * HUD: textContent-only DOM. Status and legend/controls cards seek clear edge positions using the existing
 * approximate arm-avoid shapes. Text stays readable; placement estimates are not full-hand collision proof.
 *
 * A2-render R1 (motor strip and rendering):
 *  - The strip is LIT, OPAQUE and DEPTH-WRITING (MeshStandardMaterial, DoubleSide) with a guarded shader patch
 *    (patchStripShaders) that evaluates per fragment, from the interpolated strip u and source position: faint region
 *    identity tints with soft borders at exactly the ns-brain actionForU pick boundaries, a hover outline of the
 *    region under the crosshair, and the two-scale simulated field (ns-brain activityAt) as an emissive glow through
 *    the ns-brain ramp (the legend is generated from the same ramp). Drives are 12 uniforms: no per-vertex CPU
 *    recolour or upload. Without the hooks the strip falls back to CPU vertex colours from ns-brain stripShade.
 *  - Optional decorative shimmer on active regions (off under prefers-reduced-motion); simulated and unitless.
 *  - Arm ghost window: arm fragments within a small radius of the crosshair become a dithered see-through ghost with a
 *    lit silhouette rim while the gaze is on the strip (automatic; setArmGhost overrides), so the gazed motor area
 *    stays visible. Display only: the arm geometry, fit and pick are unchanged.
 *  - Glass cost: the faint additive x-ray pass is limited to a subset (GLASS_XRAY default), the depth pre-pass sorts
 *    front-to-back (guarded setTransparentSort) and static brain children skip per-frame matrix updates.
 *  - Adaptive pixel ratio (adaptPixelRatio) under the maxPixelRatio cap; resize uses one drawing-buffer allocation.
 *  - HUD: no forced layout reads after writes (ResizeObserver sizes when available), orientation labels and panel
 *    styles are written only when changed, panels also avoid the band's projected box, a hover label near the
 *    crosshair, a region note under the legend, and the empty error box no longer shows at the crosshair.
 *
 * U2b-scene (round 2; feature-detected by ns-app SCENE_HOOKS, all additive and backwards compatible):
 *  - REGION MODE (setBrain({ ..., segmentation }) with an ns-brain segmentMotorStrips result of BOTH hemispheres): every
 *    BODY_MOTOR_MAP region of both precentral strips is drawn as its own translucent, lit surface (one material per
 *    region, a colour-less depth pre-pass so only the nearest strip layer is shaded). The shading follows the ONE
 *    ns-colors rule (activityShade: lit identity tint darkened with activity + the ramp as emission) so the brain and
 *    the muscles mean the same thing by the same colour. Activated regions (activatedRegions count >= 1, persistent
 *    until Reset body) are slightly more opaque and shade-shifted (ns-brain REGION_STYLE). LEFT-ARM regions (right
 *    hemisphere) carry a cyan identity tint, a cyan boundary outline and the label 'Left arm (right hemisphere)'; every
 *    other body-part group has its own muted label. The region under the crosshair gets a bright outline and a small
 *    emissive lift. The legacy focus strip is not drawn in region mode (the same triangles are region parts); the
 *    representative left-arm dots stay (classifyRegionGaze still picks them).
 *  - setBrainTransform(view): the brain group matrix is the ns-brain brainViewTransform matrix (orbit + grab carry).
 *  - Orbit ARROW BUTTONS: four DOM buttons placed a few cm (ORBIT_ARROWS.gapCm) outside the brain's projected bounds,
 *    clamped into the free viewport (never under the far-right info panel); they are not attached to the brain. Mouse
 *    hover highlights (CSS), a click calls onOrbit(dir) / setOrbitHandler(fn) (else a 'ns-orbit' CustomEvent);
 *    orbitArrowAt(x, y) and hoverOrbitArrow(dir) serve the pointer-captured crosshair.
 *  - Far-right INFORMATION OVERLAY (setInfo(model), ns-app infoOverlayModel): region, body part, muscles, pathway,
 *    activity, explanation, simulated vs known, caveats and citations; textContent only, no pointer events.
 *  - FULL BODY (setBody / setBodyFrame / updateBody): FULLBODY-MESH-MANIFEST meshes in the BodyParts3D frame under one
 *    body-to-world matrix (eye at the camera), each posed on the GPU by its ns-body poseBody matrix, bone/muscle
 *    materials like the arm, muscle colours from ns-colors, Three frustum culling. Head/face meshes and any mesh that
 *    comes within FACE_LAYER.nearClearM of the eye are never drawn in place (they would enclose the camera); they form
 *    the FACE LAYER: 'ghost' (default) = a translucent, labelled front view of the facial skeleton and attached muscles,
 *    displaced up and out in front of the eyes and faded in only at high pitch, so it never encloses the camera or
 *    blocks the forward view; 'inset' = a labelled inset view; 'off'. bodyVisibility() reports what is in view.
 *  - Allocation discipline: per-frame paths (render, updateRegions, overlay layout) reuse preallocated vectors and
 *    write DOM/material state only when a quantised value changed.
 * R3-scene (round 3; decisions D2 / D4, brain readability, labels; round3/R3-scene-NOTES.md):
 *  - ORBIT ARROWS from the brain SILHOUETTE: supportPoints of every glass + strip vertex (built once) give the brain's
 *    projected convex hull in the REFERENCE view (the default look carried with any grab, transform.grabYaw/grabPitch);
 *    placeOrbitArrows puts each arrow a gap (arrowGapPx: 1.2 cm, kept within 2.5-5.5 % of the view width) outside it on its
 *    side, clear of the info column / portrait band, the legend, the HUD card and the toast, preferring looks within 40
 *    deg (corner rays when a side has no room). The result is stored as WORLD anchors, so the arrows stay put relative to
 *    the brain when the player looks around and follow every orbit / drag (re-planned when the transform changes). An
 *    arrow under a panel at the current look is not drawn (visibility) and not hit; it is never `hidden` in the DOM.
 *  - GLASS READABILITY: patchGlassReadShaders adds a key-light crown term and a darker groove cue from a per-vertex
 *    sulcal depth (sulcalDepth: distance to the hull's support planes) to the fresnel shell.
 *  - OUTLINES: smoothTerritoryOutline (welded union, decimated, Chaikin-smoothed, lifted toward the viewer) for the
 *    territory and region outlines; other-body region outlines only on hover / activation; softer territory borders.
 *  - BODY VIEWS: the dithered windows are gone. Torso / neck (looking down), the arm ghost window and the face layer are
 *    smooth alpha (patchSeeThroughShaders) with colour-less depth pre-pass twins, so each shows ONE clean layer.
 *  - LABELS: fewer (cap LABEL_LAYOUT), larger (R3_SCENE_CSS), plainer (regionLabelDisplay from ns-text) and placed by
 *    declutterLabels clear of the arm, the arrows, the panels and each other. Visible wording comes from ns-text when it
 *    has the entry (orbit captions, colour key, face captions, on-brain labels).
 * R4-scene (round 4; decisions D5 / D8; round4/R4-scene-NOTES.md):
 *  - CAMERA RANGE independent of the brain distance: the far plane follows the brain's farthest support point
 *    (farPlaneFor), the near plane stays at the hand; every brain-relative effect is in source mm or projected pixels, so
 *    a brain k times farther and k times larger draws the same picture (proved at k = 1, 3, 6; QA hook ?qa=1&nsBrainK=k,
 *    createScene({ brainDistanceScale }) / setBrainDistanceScale, scaleBrainDistance).
 *  - ARROWS clear of the controlled arm: setArmEnvelope(armSweepEnvelope of the arm over its A/D x W/S range at the
 *    default look) is a placement obstacle; when a side has no spot off every pose the consistent fallback is the clear,
 *    comfortable spot the fewest poses cover (it fades while the arm is over it). HUD rectangles are re-read when a
 *    Mutation/ResizeObserver says they changed (same frame), not every 12 frames.
 *  - HELD BRAIN: setBrainHeld(true) while Space-drag holds the brain: a soft glow on the glass rim (HELD_CUE).
 *  - LEFT-ARM RIM: a cyan band along the inside of the left-arm territory border at every activity level (LEFT_ARM_RIM);
 *    the fill keeps the shared activity ramp.
 *  - ADAPTIVE QUALITY (D8): QUALITY_LEVELS (render scale, then the decorative x-ray pass, then vertex-clustered LOD
 *    copies of the glass, body and arm), an automatic controller with hysteresis (stepQuality), setQuality('auto' |
 *    'high' | 'low') for the Esc page and qualityState() in the QA snapshot. Colours, activity, labels and text never
 *    change with quality.
 * R5-scene (round 5; decisions D16-D19 and the P2 strip relief; round5/R5-scene-NOTES.md). The math of each feature has
 * one owner and is imported: ns-arrows3d (R5-arrows), ns-mirror (R5-mirror), the ns-camera pose (R5-camera), ns-actions
 * glowLinks (R5-input) and the ns-colors glow / arrow / backing colours (R5-access). This file draws them:
 *  - D16 3D COMPASS ARROWS replace the DOM orbit buttons: two ns-arrows3d rigs (brain; mirror, green), planned with
 *    planCompassArrows round each target's drawn outline in its reference view (the brain's carried with any grab), clear
 *    of the info column, the HUD cards (both homes) and the toast; a see-through copy where the arm hides a brain arrow;
 *    pickArrows(x, y) returns the ray hit list for ns-controls resolveArrowHit (a mirror arrow behind the brain is
 *    blocked); setArrowHover highlights (or shows the blocked look) with a plain caption; orbitArrowAt / hoverOrbitArrow
 *    keep the round-4 crosshair API. The scene never orbits anything: presses and holds are R5-input's.
 *  - D17 GLOW LINKS (setGlowLinks, glowLinksForScene): a soft additive camera-facing ribbon on a gentle curve from the
 *    active area to each driven muscle group, on your body and on the mirror body, in the ns-colors glow colour; it fades
 *    in from the area, keeps only a thin core over the brain's drawn outline (never hiding an area), pulses gently (not
 *    under reduced motion); the area and the muscles get a fresnel glow rim (nsGlowRim). A picture of the link in this
 *    simulation, not a nerve.
 *  - D18 THIRD PERSON (setCameraPose(ns-camera pose | null)): the arm hangs on the EYE (eyeRig), the camera can leave the
 *    head; the head and face are drawn in place (copies) from headInPlace, the face ghost fades, the body is solid over the
 *    brain except a small window at the crosshair while it is on a motor area; distances and the far plane are measured
 *    from the camera; bodyKeepOut() gives the boom its keep-out spheres.
 *  - D19 MIRROR BODY: a twin of every body mesh and arm mesh (shared geometry and pose matrices, own opaque materials
 *    shaded by the same rule), under one ns-mirror reflection matrix (det < 0), placed by ns-mirror behind the brain at the
 *    default view (setMirrorView / setMirror for the orbit or a whole ns-mirror state); tinted where the glass brain covers
 *    it (BEHIND_GLASS) and dimmed behind the motor areas (ns-colors region backing); index-only LOD copies (2.5 mm at full
 *    quality, coarser first on slow renderers), built a few per frame; mirrorPartAt(x, y) names the part under a point.
 *  - P2 STRIP RELIEF: the lit motor areas (and the legacy strip) take the brain's rigid normal and the far-eye view vector
 *    under the perspective squash (patchRigidNormalShaders), as the glass did in round 4.
 *  - Retired with the DOM buttons: orbitIconSvg, the arrow plan (arrowPlanFor, projectArrowAnchors) and the pointer pins /
 *    DOM hold timers. Kept as unused pure exports for the round-3/4 tests until the integrator retires them:
 *    placeOrbitArrows, orbitArrowLayout, orbitArrowHit, arrowGapPx, ARROW_PLACEMENT, armEnvelopeHits; setArmEnvelope is
 *    a recording no-op.
 * Scientific limits (unchanged): every colour, opacity and label is a simulated, unitless DISPLAY of virtual inputs;
 * regions are control regions of a representative map, not cortical borders, and the face layer is a displaced view,
 * not something a person can see from their own eyes.
 */
import { SEGMENTS, HAND_SEGMENTS, skinApply } from './ns-rig.mjs';
import { ARM_DEFAULTS } from './ns-arm.mjs';
import {
  brainWorldMatrix, colormapLinear, gazeDirection, MARKER_GEOMETRY, MARKER_OCTAHEDRON, markerSolid, MARKERS,
  ACTIVITY_FIELD, STRIP_SHADE, RAMP_STOPS_LINEAR, regionTintLinear, stripShade, legendGradientCss
} from './ns-brain.mjs';
import * as NsBrain from './ns-brain.mjs';
import * as NsMath from './ns-math.mjs';
import {
  activityColor, activityColorCss, ACTIVITY_GLOW, RAMP_STOPS_LINEAR as SHARED_RAMP, hexToLinear, RAMP_LABEL, KEY_COLORS
} from './ns-colors.mjs';

import * as NsText from './ns-text.mjs';
// R5-scene: the fluorescent glow variant of the shared ramp (R5-access; feature-detected: glowColor / glowIntensity / GLOW).
import * as NsColors from './ns-colors.mjs';
// R5-scene: the 3D compass arrows (R5-arrows) and the mirror body's placement, transform and orbit (R5-mirror).
import * as NsArrows from './ns-arrows3d.mjs';
import * as NsMirror from './ns-mirror.mjs';
import { readAppliedArmPose } from './ns-body-arm-bridge.mjs';
import { SHOULDER_GIRDLE_INFO } from './ns-assets.mjs';

import { REGIONAL_LAYER_PROVENANCE, regionalLayerQualification, regionalLayerMetadata } from './ns-regional-layers.mjs';

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };
/** User-visible wording comes ONLY from ns-text (the single source of plain UI text; a static import). R3-fix (review
 * code F4): the unreachable round-3 fallback copies of that wording are gone. */
const NS_TEXT = NsText;
const dirText = o => Object.freeze({ forward: o.forward, back: o.back, left: o.left, right: o.right });

/** Camera contract (DESIGN.md): PerspectiveCamera(70, aspect, 0.02, 500) at the world origin. */
export const CAMERA = Object.freeze({ fovYDeg: 110, near: 0.02, far: 500 });

/** Display materials. Hex colours are sRGB (Three converts them to its linear working space). */
export const MATERIAL = Object.freeze({
  background: 0x05070b,
  bone: 0xe9dfc4, // ivory
  muscleBase: 0x7a2f24, // red-brown
  muscleHot: 0xff5a1e, // bright red / orange
  muscleEmissiveMax: 0.35,
  // Visual-clarity candidate: the nearest shell carries the outline; deeper layers stay faint.
  // Alpha values are display choices, not tissue optics or measured electrical activity.
  // R5-bigbrain (R26, user note 2026-11-08T23:40Z: the glass with no motor activity "should be considerably more
  // transparent and see-through. But it should be still obvious that it's a brain"): face-on alpha 0.025 -> 0.01, rim
  // 0.46 -> 0.34 at power 4 -> 5 (a narrower rim: the outline and the gyral walls stay, the broad veil goes), with
  // GLASS_READ crown 0.11 -> 0.035 / 0.75 -> 0.45. Measured at the default 1280x720 view (round5/R5-bigbrain-NOTES.md):
  // the glass adds 9.1 instead of 21.3 per colour channel over the non-motor glass (-57 %); motor areas unchanged.
  glass: 0xd6ebff,
  glassOpacity: 0.01,
  glassRimOpacity: 0.34,
  glassRimPower: 5,
  glassXray: 0xd8ecff,
  glassXrayOpacity: 0.0015,
  glassXrayRimOpacity: 0.035,
  glassXrayRimPower: 6,
  /** R1 translucent strip opacity; unused since A2-render R1 (the strip is opaque and lit), kept for compatibility. */
  stripOpacity: 0.58,
  /** A2-render R1 lit strip surface (MeshStandardMaterial): gloss shows the gyral relief under the headlight. */
  stripRoughness: 0.42,
  stripMetalness: 0,
  /** Polish: the representative left-arm action dots take a pale cyan of the left-arm identity (they were stark white
   * diamonds that read as debris); the selected dot stays yellow. Geometry and picking solids are unchanged. */
  marker: 0xa8eefc,
  markerActive: 0xffe066,
  markerOpacity: 0.72
});

/** Lights (display choices). Polish: a lower flat ambient plus a sky/ground hemisphere light gives the muscles and
 * bones shape (the ambient-heavy mix looked flat), and a weak camera-space rim light from behind separates silhouettes
 * from the dark background. The key light is still the camera headlight. */
export const LIGHT = Object.freeze({
  ambient: 0.5, key: 2.2,
  hemi: 1.15, hemiSky: 0xdfe9ff, hemiGround: 0x3a2622,
  rim: 1.1, rimColor: 0xbcd4ff
});

/** Glass alpha for a fragment whose interpolated normal makes |N.V| = facing with the view direction (GLSL mirror). */
export function glassAlpha(facing, body, rim, power) {
  const f = facing < 0 ? 0 : facing > 1 ? 1 : facing;
  return body + (rim - body) * Math.pow(1 - f, power);
}

/** R4-scene: the HELD-brain cue. While Space-drag holds the brain, the nearest glass shell's fresnel rim is stronger and
 * wider (a soft glow along the brain's outline and gyri in the glass's own pale colour: not cyan, gold or the activity
 * ramp, so it never reads as activity or the left arm). It eases in (inS) and out (outS) and ends on release; under
 * prefers-reduced-motion it switches without easing. Display only. */
export const HELD_CUE = Object.freeze({ rimOpacity: 0.9, rimPower: 2.4, inS: 0.1, outS: 0.12 });
/** Shell rim uniforms for a held-cue amount 0..1 (pure): linear from the resting MATERIAL rim to HELD_CUE. */
export function heldCueRim(amount, o = HELD_CUE) {
  const a = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  return { rimOpacity: MATERIAL.glassRimOpacity + (o.rimOpacity - MATERIAL.glassRimOpacity) * a, rimPower: MATERIAL.glassRimPower + (o.rimPower - MATERIAL.glassRimPower) * a };
}

/**
 * Transparent draw order (visual-clarity source candidate). All six existing passes remain:
 *  1 glass X-RAY: faint cortical context is drawn before the translucent activity field, so its existing
 *    surface traces can remain visible through that field instead of being erased by the field's depth pass;
 *  2 strip colour; 3 markers; 4 strip DEPTH (no colour); 5 glass DEPTH; 6 nearest glass SHELL.
 * The opaque arm still depth-tests every pass. No mesh, index, vertex, normal, shader hook, depth flag,
 * marker solid or draw call is removed. Reordering and alpha changes require actual rerender qualification;
 * this is a representative simulated field, not a refined motor ROI or a performance improvement.
 * A2-render R1: the strip is now OPAQUE and depth-writing, so it is drawn in the opaque list (after the arm, by
 * renderOrder) and the separate strip DEPTH pass (stripDepth) is no longer created; the key is kept for
 * compatibility. The x-ray pass covers only the GLASS_XRAY subset; the glass DEPTH pass sorts front-to-back
 * (transparentSortNs) so occluded deep layers fail the depth test early.
 */
export const RENDER_ORDER = Object.freeze({
  strip: 2, marker: 3, stripDepth: 4, glassXray: 1, glassDepth: 5, glass: 6,
  // U2b-scene region mode: nearest-layer depth pre-pass, translucent region colour, outlines (all before the glass).
  regionDepth: 1.5, region: 2, regionLine: 2.5
});

/** Transparent-list sort (renderer.setTransparentSort): Three's reversePainterSortStable, except that the glass DEPTH
 * pre-pass (colour-less, depth-writing) is sorted FRONT-to-back so nearer glass fills the depth buffer first and the
 * hidden layers behind it are rejected early. Colour passes keep back-to-front order. */
export function transparentSortNs(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  if (a.z !== b.z) return a.renderOrder === RENDER_ORDER.glassDepth ? a.z - b.z : b.z - a.z;
  return a.id - b.id;
}

/** Which glass meshes get the faint additive x-ray pass. 'deep': only non-cortical meshes (white matter, ventricles,
 * deep nuclei, brainstem, cerebellum), which are otherwise always hidden under the nearest glass shell and give the
 * see-through 'glassy' depth; 'outer': only cortical gyri/lobes; 'all' (R1 behaviour); 'off'. */
export const GLASS_XRAY_MODES = Object.freeze(['deep', 'outer', 'all', 'off']);
export const GLASS_XRAY = 'deep';
const CORTICAL_NAME = /gyrus|gyri|lobule|lobe\b|cortex/i;
/** True when a glass mesh name denotes cortical surface (gyrus, lobule, lobe or cortex; never white matter). */
export function isCorticalGlass(name) {
  const s = String(name || '');
  return CORTICAL_NAME.test(s) && !/white matter/i.test(s);
}
/** Indices of the glass list that get an x-ray pass under `mode` (GLASS_XRAY_MODES). When no name is recognisably
 * cortical (e.g. the placeholder dome), 'deep' and 'outer' fall back to every mesh. */
export function glassXraySubset(names, mode = GLASS_XRAY) {
  if (!GLASS_XRAY_MODES.includes(mode)) fail('scene_args', `glassXray must be one of ${GLASS_XRAY_MODES.join(', ')}`);
  const all = names.map((_, i) => i);
  if (mode === 'all') return all;
  if (mode === 'off') return [];
  const cortical = names.map(isCorticalGlass);
  if (!cortical.some(Boolean)) return all;
  return all.filter(i => (mode === 'outer' ? cortical[i] : !cortical[i]));
}

/** Adaptive pixel ratio (A2-render R1). The level steps down by `step` when the smoothed frame interval stays above
 * slowMs for holdMs, and back up when it stays below fastMs for holdMs, between min(min, cap) and cap (the
 * maxPixelRatio cap, never above the device ratio). Intervals are clamped to maxSampleMs (tab switches). */
export const ADAPTIVE_PIXEL_RATIO = Object.freeze({ min: 1, step: 0.25, slowMs: 1000 / 40, fastMs: 1000 / 55, holdMs: 1500, smoothing: 0.15, maxSampleMs: 250 });

/** Pure controller step: state { level, cap, smoothMs, slowFor, fastFor } (fields may be missing) + one frame
 * interval (ms) -> next state. */
export function adaptPixelRatio(state, frameMs, opts = ADAPTIVE_PIXEL_RATIO) {
  const o = { ...ADAPTIVE_PIXEL_RATIO, ...opts };
  const cap = Number.isFinite(state && state.cap) && state.cap > 0 ? state.cap : 1;
  const lo = Math.min(o.min, cap);
  let level = Number.isFinite(state && state.level) ? Math.min(cap, Math.max(lo, state.level)) : cap;
  if (!(Number.isFinite(frameMs) && frameMs > 0)) return { level, cap, smoothMs: state ? state.smoothMs ?? null : null, slowFor: 0, fastFor: 0 };
  const ms = Math.min(frameMs, o.maxSampleMs);
  const prev = state && Number.isFinite(state.smoothMs) ? state.smoothMs : ms;
  const smoothMs = prev + (ms - prev) * o.smoothing;
  let slowFor = smoothMs > o.slowMs ? (state && state.slowFor ? state.slowFor : 0) + ms : 0;
  let fastFor = smoothMs < o.fastMs ? (state && state.fastFor ? state.fastFor : 0) + ms : 0;
  if (slowFor >= o.holdMs && level > lo) { level = Math.max(lo, level - o.step); slowFor = 0; fastFor = 0; }
  else if (fastFor >= o.holdMs && level < cap) { level = Math.min(cap, level + o.step); slowFor = 0; fastFor = 0; }
  return { level, cap, smoothMs, slowFor, fastFor };
}

/* ------------------------------------------------------------------ R4-scene (D8): adaptive quality */

/** Quality settings the Esc page offers (D8): 'auto' adapts, 'high' is always full quality, 'low' always the cheapest
 * level. Quality changes only how sharply and with which decorative passes the SAME picture is drawn: colours, the
 * activity ramp, the left-arm distinction, labels and every honesty text are identical at every level. */
export const QUALITY_MODES = Object.freeze(['auto', 'high', 'low']);

/* R4-integrator (D8, R4-load measurement): multisample anti-aliasing (MSAA) is the largest single cost on a software
 * renderer: SwiftShader 1280x720 default view 253-296 ms -> 76-85 ms per frame with antialias: false, 4.1 -> 12.6 fps
 * (round4/R4-load-NOTES.md section 6.2; screenshots: only the edges are slightly less smooth). MSAA is fixed when the
 * WebGL context is created, so it is decided before the renderer exists: off on a software renderer or when the saved
 * Quality is Low, on everywhere else (the real GPU keeps MSAA and 60 fps). It changes edge smoothing only: colours,
 * activity, the left-arm distinction and every text stay the same. */
export const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
/** True when a WebGL renderer string names a software rasteriser. Pure. */
export function isSoftwareRenderer(name) { return typeof name === 'string' && SOFTWARE_RENDERER_RE.test(name); }
/** The WebGL renderer string from a detached 1x1 metadata-only context (unmasked when allowed), or null.
 * No rendering or intentional context loss. Local canvas/context references fall out of scope on return;
 * the browser owns eventual cleanup, not deterministic disposal. */
export function probeRendererName(doc) {
  try {
    if (!doc || typeof doc.createElement !== 'function') return null;
    const c = doc.createElement('canvas');
    if (!c || typeof c.getContext !== 'function') return null;
    c.width = 1; c.height = 1;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return null;
    let name = null;
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) name = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); } catch { name = null; }
    if (typeof name !== 'string' || !name) { try { name = gl.getParameter(gl.RENDERER); } catch { name = null; } }
    return typeof name === 'string' && name ? name : null;
  } catch { return null; }
}
/** MSAA on or off: antialias true / false is kept; 'auto' = off for a software renderer or Quality Low. Pure. */
export function antialiasFor({ antialias = 'auto', quality = 'auto', rendererName = null } = {}) {
  if (antialias === true || antialias === false) return antialias;
  return !(quality === 'low' || isSoftwareRenderer(rendererName));
}
/** Quality levels, best first (D8 order: render scale first, then cheaper passes, then fewer triangles).
 *  - scale: multiplies the pixel ratio (the device ratio capped at maxPixelRatio) of the drawing buffer; the browser
 *    scales the canvas up to its CSS size and the HTML text (HUD, panel, labels, arrows) stays sharp. This is what helps
 *    a fill-limited GPU.
 *  - lite: the faint additive glass x-ray pass (deep brain parts seen through the cortex, alpha 0.0015 / rim 0.035) is
 *    not drawn. It is decorative (no colour, activity or label depends on it).
 *  - lod: the glass and the full-body meshes are drawn from vertex-clustered copies (clusterDecimate, cells of
 *    lodGlassMm / lodBodyMm; the brain then has about 30 % of its glass triangles). A software renderer is limited by
 *    triangles, not pixels (SwiftShader: 975 k triangles per frame at the default view, 3-4 fps at any render scale;
 *    round4/R4-scene-NOTES.md). The motor regions, outlines, marks, the player's arm and every colour are unchanged.
 */
export const QUALITY_LEVELS = Object.freeze([
  Object.freeze({ name: 'full', scale: 1, lite: false, lod: null }),
  Object.freeze({ name: 'scale-0.75', scale: 0.75, lite: false, lod: null }),
  Object.freeze({ name: 'scale-0.5', scale: 0.5, lite: false, lod: null }),
  Object.freeze({ name: 'lite-0.5', scale: 0.5, lite: true, lod: null }),
  Object.freeze({ name: 'lod-0.5', scale: 0.5, lite: true, lod: Object.freeze({ glassMm: 2.5, bodyMm: 4 }) }),
  Object.freeze({ name: 'lod-0.4', scale: 0.4, lite: true, lod: Object.freeze({ glassMm: 4, bodyMm: 7, armMm: 2.5 }) })
]);
/* LOD cells (source mm): 2.5 mm glass = 314 k -> 93 k triangles, about 5 px at the 0.5 render scale; 4 mm glass = 52 k.
 * The body is 0.4-1.5 m from the eye, where 4-7 mm is 1-3 px. Measured in round4/R4-scene-NOTES.md. */
/** Automatic controller (hysteresis; display choices, measured on SwiftShader and the real GPU, round4/R4-scene-NOTES.md).
 *  - A frame interval is a sample only when it is in (0, gapMs]: a longer gap is a pause, a tab switch or a QA step, not
 *    a frame time, and it is ignored. The decision uses the MEDIAN of the last `window` samples (one hitch, a screenshot
 *    or a first upload, does not move it).
 *  - Down: the median stays above slowMs for downHoldMs AND downMinFrames samples -> one level cheaper (two levels when
 *    the median is above jumpMs, three above twice jumpMs: a very slow renderer converges in a few seconds).
 *  - Up: the median stays below fastMs for upHoldMs AND upMinFrames samples -> one level better, unless that level was
 *    left for being slow less than rememberMs ago (no down-up-down oscillation).
 *  - Between fastMs and slowMs nothing changes. After a change the next settleFrames samples are skipped (the buffer is
 *    re-allocated in that frame).
 *  - R4-fix (code review M2): a down-step that swaps the meshes (into a level with a different `lod`) also needs the
 *    MEAN of the window above lodDownMeanMs, so a median sitting right at slowMs does not swap meshes back and forth;
 *    and each time a level is left for being slow again, its block lasts one rememberMs longer (30 s, 60 s, 90 s ...). */
export const QUALITY_AUTO = Object.freeze({
  slowMs: 1000 / 40, fastMs: 1000 / 55, jumpMs: 1000 / 12, window: 7, gapMs: 1000,
  downHoldMs: 700, downMinFrames: 4, upHoldMs: 6000, upMinFrames: 90, rememberMs: 30000, settleFrames: 2,
  lodDownMeanMs: 1000 / 36
});

/** A fresh controller state for `mode` (QUALITY_MODES). `level` is the QUALITY_LEVELS index. */
export function qualityStart(mode = 'auto', levels = QUALITY_LEVELS) {
  const m = QUALITY_MODES.includes(mode) ? mode : 'auto';
  return { mode: m, level: m === 'low' ? levels.length - 1 : 0, samples: [], slowFor: 0, slowN: 0, fastFor: 0, fastN: 0, settle: 0, clockMs: 0, blockedUntil: {}, slowLeft: {}, changes: 0, lastChange: null };
}

const medianOf = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

/** Pure controller step: state (qualityStart) + one frame interval (ms) -> the next state (a new object). 'high' and
 * 'low' never change level. See QUALITY_AUTO for the rules. `lastChange` records { from, to, medianMs, atMs, why }. */
export function stepQuality(state, frameMs, opts = QUALITY_AUTO, levels = QUALITY_LEVELS) {
  const o = { ...QUALITY_AUTO, ...opts };
  const s = state && typeof state === 'object' ? state : qualityStart('auto', levels);
  const next = { ...s, samples: s.samples.slice(), blockedUntil: { ...s.blockedUntil }, slowLeft: { ...(s.slowLeft || {}) } };
  const last = levels.length - 1;
  if (next.mode === 'high') { next.level = 0; return next; }
  if (next.mode === 'low') { next.level = last; return next; }
  if (!(Number.isFinite(frameMs) && frameMs > 0 && frameMs <= o.gapMs)) return next; // a gap is not a frame time
  next.clockMs += frameMs;
  if (next.settle > 0) { next.settle -= 1; return next; }
  next.samples.push(frameMs);
  if (next.samples.length > o.window) next.samples.shift();
  if (next.samples.length < Math.min(3, o.window)) return next;
  const med = medianOf(next.samples);
  if (med > o.slowMs) { next.slowFor += frameMs; next.slowN += 1; next.fastFor = 0; next.fastN = 0; }
  else if (med < o.fastMs) { next.fastFor += frameMs; next.fastN += 1; next.slowFor = 0; next.slowN = 0; }
  else { next.slowFor = 0; next.slowN = 0; next.fastFor = 0; next.fastN = 0; }
  let to = next.level, why = '';
  if (next.slowFor >= o.downHoldMs && next.slowN >= o.downMinFrames && next.level < last) {
    const cand = Math.min(last, next.level + (med > 2 * o.jumpMs ? 3 : med > o.jumpMs ? 2 : 1));
    const lodKey = l => (levels[l] && levels[l].lod ? JSON.stringify(levels[l].lod) : '');
    const mean = next.samples.reduce((a, b) => a + b, 0) / next.samples.length;
    if (lodKey(cand) === lodKey(next.level) || mean > o.lodDownMeanMs) {
      to = cand; why = 'slow';
      for (let l = next.level; l < to; l++) {
        next.slowLeft[l] = (next.slowLeft[l] || 0) + 1;
        next.blockedUntil[l] = next.clockMs + o.rememberMs * next.slowLeft[l];
      }
    }
  } else if (next.fastFor >= o.upHoldMs && next.fastN >= o.upMinFrames && next.level > 0 && !(next.blockedUntil[next.level - 1] > next.clockMs)) {
    to = next.level - 1; why = 'fast';
  }
  if (to !== next.level) {
    next.lastChange = { from: next.level, to, medianMs: Math.round(med * 10) / 10, atMs: Math.round(next.clockMs), why };
    next.level = to; next.changes += 1;
    next.samples = []; next.slowFor = 0; next.slowN = 0; next.fastFor = 0; next.fastN = 0; next.settle = o.settleFrames;
  }
  return next;
}

/**
 * Vertex-clustering decimation (pure; the D8 'lod' quality levels). Vertices are merged per cubic cell of edge `cell`
 * (source units: mm for the brain and body), each cluster sits at its members' mean; a triangle whose three corners
 * fall into fewer than three clusters is dropped. Corner order (winding) is kept. `attrs` ({ name: Float32Array, one
 * value per vertex }) are averaged per cluster. Used only for the lowest quality levels: the shape stays the same at
 * screen scale (the cell is a few pixels or less), colours and meaning are untouched (motor regions are never decimated).
 * Returns { positions: Float32Array, indices: Uint32Array, attrs, vertices, triangles }.
 */
export function clusterDecimate(positions, indices, cell, attrs = null) {
  const n = positions.length / 3;
  if (!(cell > 0) || n < 3) return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), attrs, vertices: n, triangles: indices.length / 3 };
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  const nx = Math.floor((x1 - x0) / cell) + 2, ny = Math.floor((y1 - y0) / cell) + 2;
  const map = new Int32Array(n), ids = new Map();
  const sum = [];
  const names = attrs ? Object.keys(attrs) : [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const ix = Math.floor((positions[3 * i] - x0) / cell), iy = Math.floor((positions[3 * i + 1] - y0) / cell), iz = Math.floor((positions[3 * i + 2] - z0) / cell);
    const key = ix + nx * (iy + ny * iz);
    let c = ids.get(key);
    if (c === undefined) { c = k++; ids.set(key, c); sum.push(0, 0, 0, 0); }
    map[i] = c;
    sum[4 * c] += positions[3 * i]; sum[4 * c + 1] += positions[3 * i + 1]; sum[4 * c + 2] += positions[3 * i + 2]; sum[4 * c + 3] += 1;
  }
  const out = new Float32Array(3 * k);
  for (let c = 0; c < k; c++) { const w = sum[4 * c + 3]; out[3 * c] = sum[4 * c] / w; out[3 * c + 1] = sum[4 * c + 1] / w; out[3 * c + 2] = sum[4 * c + 2] / w; }
  let outAttrs = null;
  if (names.length) {
    outAttrs = {};
    for (const name of names) {
      const src = attrs[name], acc = new Float32Array(k);
      for (let i = 0; i < n; i++) acc[map[i]] += src[i];
      for (let c = 0; c < k; c++) acc[c] /= sum[4 * c + 3];
      outAttrs[name] = acc;
    }
  }
  const tri = new Uint32Array(indices.length);
  let m = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = map[indices[t]], b = map[indices[t + 1]], c = map[indices[t + 2]];
    if (a === b || b === c || a === c) continue;
    tri[m++] = a; tri[m++] = b; tri[m++] = c;
  }
  return { positions: out, indices: tri.slice(0, m), attrs: outAttrs, vertices: k, triangles: m / 3 };
}

/**
 * Index-only clustering LOD (pure; the arm in the cheapest quality level): the same cells as clusterDecimate, but every
 * cluster is represented by its ORIGINAL member vertex nearest the cluster mean, so the LOD is a new index buffer over
 * the unchanged vertex arrays. That suits CPU-skinned meshes (the arm muscles): skinning still writes the full position
 * and normal buffers, and the LOD draws a subset of them, so no extra per-frame work is needed. Returns
 * { indices: Uint32Array, triangles, clusters }.
 */
export function clusterIndexLod(positions, indices, cell) {
  const n = positions.length / 3;
  if (!(cell > 0) || n < 3) return { indices: Uint32Array.from(indices), triangles: indices.length / 3, clusters: n };
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  const nx = Math.floor((x1 - x0) / cell) + 2, ny = Math.floor((y1 - y0) / cell) + 2;
  const map = new Int32Array(n), ids = new Map(), sum = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const key = Math.floor((positions[3 * i] - x0) / cell) + nx * (Math.floor((positions[3 * i + 1] - y0) / cell) + ny * Math.floor((positions[3 * i + 2] - z0) / cell));
    let c = ids.get(key);
    if (c === undefined) { c = k++; ids.set(key, c); sum.push(0, 0, 0, 0); }
    map[i] = c;
    sum[4 * c] += positions[3 * i]; sum[4 * c + 1] += positions[3 * i + 1]; sum[4 * c + 2] += positions[3 * i + 2]; sum[4 * c + 3] += 1;
  }
  const rep = new Int32Array(k).fill(-1), best = new Float64Array(k).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const c = map[i], w = sum[4 * c + 3];
    const d = (positions[3 * i] - sum[4 * c] / w) ** 2 + (positions[3 * i + 1] - sum[4 * c + 1] / w) ** 2 + (positions[3 * i + 2] - sum[4 * c + 2] / w) ** 2;
    if (d < best[c]) { best[c] = d; rep[c] = i; }
  }
  const tri = new Uint32Array(indices.length);
  let m = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = map[indices[t]], b = map[indices[t + 1]], c = map[indices[t + 2]];
    if (a === b || b === c || a === c) continue;
    tri[m++] = rep[a]; tri[m++] = rep[b]; tri[m++] = rep[c];
  }
  return { indices: tri.slice(0, m), triangles: m / 3, clusters: k };
}

/** The pixel ratio a quality level draws at: the device ratio capped at maxPixelRatio, times the level's scale (never
 * below minRatio). */
export function qualityPixelRatio(level, deviceRatio = 1, maxPixelRatio = 2, levels = QUALITY_LEVELS, minRatio = 0.25) {
  const cap = Math.min(maxPixelRatio, Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1);
  const L = levels[Math.max(0, Math.min(levels.length - 1, level | 0))];
  return Math.max(minRatio, Math.round(cap * L.scale * 1000) / 1000);
}

/* ------------------------------------------------------------------ R4-scene: camera range independent of the brain distance */

/** Camera far plane for a brain whose farthest drawn point is `brainFarM` metres from the eye (pure): at least the base
 * far plane, else farMargin times the brain's far extent, so a brain moved k times farther (and scaled k times, R4-view
 * D5) is never clipped. The near plane stays CAMERA.near: the player's own hand is 0.2-0.6 m from the eye. */
export const CAMERA_RANGE = Object.freeze({ farMargin: 1.5, depthBits: 24 });
export function farPlaneFor(brainFarM, baseFar = CAMERA.far, o = CAMERA_RANGE) {
  return Number.isFinite(brainFarM) && brainFarM > 0 ? Math.max(baseFar, Math.ceil(brainFarM * o.farMargin)) : baseFar;
}
/** Smallest depth step (m) a `bits`-bit depth buffer resolves at distance d for a perspective camera (near, far): about
 * d^2 (far - near) / (near far 2^bits). With near 0.02 m, far 500 m and a 24-bit buffer, the round-3 brain (6-23 m from
 * the eye, about 0.1 m of world per source mm) resolves 0.001-0.016 brain-mm; drawn k = 6 times farther (36-138 m, 0.6 m
 * per mm) 0.006-0.095 brain-mm. Both stay far below the outline lift (REGION_OUTLINE.liftMm 0.8 mm), and the depth
 * pre-passes draw the SAME triangles, so the brain's own layers keep their order (renders at k = 1 / 3 / 6:
 * round4/R4-scene-NOTES.md). The near plane cannot grow: the player's hand is 0.2-0.6 m from the eye. */
export function depthStepAt(d, near = CAMERA.near, far = CAMERA.far, bits = CAMERA_RANGE.depthBits) {
  return (d * d * (far - near)) / (near * far * 2 ** bits);
}
/** A brainViewTransform-like result moved k times farther from the eye and scaled k times (same on-screen size): the
 * world matrix pre-multiplied by a uniform scale about the camera origin. The R4-scene QA test hook (?qa=1&nsBrainK=k)
 * and the unit tests use it to prove the scene is independent of the brain distance. Pure; k = 1 returns `t`. */
export function scaleBrainDistance(t, k) {
  if (!t || !(Number.isFinite(k) && k > 0) || k === 1) return t;
  const m = Float64Array.from(t.matrix);
  for (let i = 0; i < 15; i++) if (i !== 3 && i !== 7 && i !== 11) m[i] *= k;
  const out = { ...t, matrix: m, distanceScale: k };
  if (t.inverse && t.inverse.length === 16) { // inverse(S M) = M^-1 S^-1: the first three columns divided by k
    const v = Float64Array.from(t.inverse);
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) v[i] /= k;
    out.inverse = v;
  }
  if (Array.isArray(t.pivotWorld) || (t.pivotWorld && t.pivotWorld.length === 3)) out.pivotWorld = Object.freeze([t.pivotWorld[0] * k, t.pivotWorld[1] * k, t.pivotWorld[2] * k]);
  if (Number.isFinite(t.k)) out.k = t.k * k;
  return out;
}

/* ------------------------------------------------------------------ strip shader patch (A2-render R1) */

const glslFloat = x => {
  if (!Number.isFinite(x)) fail('scene_shader', `non-finite shader constant ${x}`);
  const s = Number(x).toPrecision(8);
  return /[.e]/.test(s) ? s : `${s}.0`;
};
const glslVec3 = c => `vec3( ${glslFloat(c[0])}, ${glslFloat(c[1])}, ${glslFloat(c[2])} )`;

/** GLSL source of nsRamp(t): the ns-brain RAMP_STOPS_LINEAR ramp, piecewise linear exactly as colormapLinear. */
export function rampGlsl(stops = RAMP_STOPS_LINEAR) {
  const n = stops.length;
  if (n < 2) fail('scene_shader', 'the ramp needs at least two stops');
  const lines = ['vec3 nsRamp( float t ) {', '\tfloat s = clamp( t, 0.0, 1.0 ) * ' + glslFloat(n - 1) + ';'];
  for (let i = 0; i < n - 2; i++) lines.push(`\tif ( s < ${glslFloat(i + 1)} ) return mix( ${glslVec3(stops[i])}, ${glslVec3(stops[i + 1])}, s - ${glslFloat(i)} );`);
  lines.push(`\treturn mix( ${glslVec3(stops[n - 2])}, ${glslVec3(stops[n - 1])}, s - ${glslFloat(n - 2)} );`, '}');
  return lines.join('\n');
}

const STRIP_VERTEX_HOOK = '#include <begin_vertex>';
const STRIP_COLOR_HOOK = '#include <color_fragment>';
const STRIP_EMISSIVE_HOOK = '#include <emissivemap_fragment>';
const STRIP_LIGHTS_HOOK = '#include <lights_fragment_end>'; // optional: ambient scale for relief

function stripFragmentHeader() {
  const F = ACTIVITY_FIELD, S = STRIP_SHADE;
  return [
    `#define NS_MARKERS ${MARKERS.length}`,
    `#define NS_BROAD_INV ${glslFloat(1 / (2 * F.broadSigmaU * F.broadSigmaU))}`,
    `#define NS_BROAD_GAIN ${glslFloat(F.broadGain)}`,
    `#define NS_FOCAL_GAIN ${glslFloat(F.focalGain)}`,
    `#define NS_FOCAL_INV ${glslFloat(1 / (2 * F.focalRadiusMm * F.focalRadiusMm))}`,
    `#define NS_FOCAL_EDGE_U ${glslFloat(F.focalEdgeU)}`,
    `#define NS_NEUTRAL ${glslVec3(S.neutral)}`,
    `#define NS_TINT_STRENGTH ${glslFloat(S.tintStrength)}`,
    `#define NS_REST_ALBEDO ${glslFloat(S.restAlbedo)}`,
    `#define NS_ACTIVE_DARKEN ${glslFloat(S.activeDarken)}`,
    `#define NS_ACTIVE_DARKEN_END ${glslFloat(S.activeDarkenEnd)}`,
    `#define NS_AMBIENT_SCALE ${glslFloat(S.ambientScale)}`,
    `#define NS_SOFT_U ${glslFloat(S.softBorderU)}`,
    `#define NS_BORDER_DARKEN ${glslFloat(S.borderDarken)}`,
    `#define NS_BORDER_PX ${glslFloat(S.borderPx)}`,
    `#define NS_HOVER_BOOST ${glslFloat(S.hoverBoost)}`,
    `#define NS_HOVER_GLOW ${glslFloat(S.hoverGlow)}`,
    `#define NS_HOVER_PX ${glslFloat(S.hoverLinePx)}`,
    `#define NS_HOVER_LINE ${glslVec3(S.hoverLine)}`,
    `#define NS_GLOW_REST ${glslFloat(S.glowRest)}`,
    `#define NS_GLOW_RISE ${glslFloat(S.glowRiseTo)}`,
    `#define NS_SHIMMER ${glslFloat(S.shimmer)}`,
    'uniform float nsDrive[ NS_MARKERS ];',
    'uniform float nsMarkerU[ NS_MARKERS ];',
    'uniform vec4 nsMarkerPos[ NS_MARKERS ];', // xyz: marker position (source mm); w: 1 when known, else 0
    'uniform vec3 nsTint[ NS_MARKERS ];',
    'uniform float nsHover;',
    'uniform float nsTime;',
    'uniform float nsShimmer;',
    'varying float vNsU;',
    'varying vec3 vNsSrc;',
    rampGlsl(),
    ''
  ].join('\n');
}

// Region identity (nearest marker u = ns-brain actionForU / regionInfo, strict '<' so ties go to the earlier marker),
// the two-scale field (ns-brain activityAt) and the albedo (ns-brain stripShade), per fragment.
const STRIP_COLOR_GLSL = `
	float nsD1 = 1.0e9; float nsD2 = 1.0e9; int nsI = 0; int nsJ = 0;
	for ( int i = 0; i < NS_MARKERS; i ++ ) {
		float d = abs( vNsU - nsMarkerU[ i ] );
		if ( d < nsD1 ) { nsD2 = nsD1; nsJ = nsI; nsD1 = d; nsI = i; } else if ( d < nsD2 ) { nsD2 = d; nsJ = i; }
	}
	float nsBorder = abs( vNsU - 0.5 * ( nsMarkerU[ nsI ] + nsMarkerU[ nsJ ] ) );
	float nsPx = max( fwidth( vNsU ), 1.0e-7 );
	vec3 nsT1 = nsTint[ nsI ];
	vec3 nsTintMix = mix( 0.5 * ( nsT1 + nsTint[ nsJ ] ), nsT1, smoothstep( 0.0, NS_SOFT_U, nsBorder ) );
	float nsBroad = 0.0;
	for ( int i = 0; i < NS_MARKERS; i ++ ) {
		float dr = nsDrive[ i ];
		if ( dr <= 0.0 ) continue;
		float du = vNsU - nsMarkerU[ i ];
		nsBroad += exp( - du * du * NS_BROAD_INV ) * dr;
	}
	float nsFocal = 0.0;
	float nsDrOwn = nsDrive[ nsI ];
	if ( nsDrOwn > 0.0 ) {
		vec4 nsMp = nsMarkerPos[ nsI ];
		vec3 nsDp = vNsSrc - nsMp.xyz;
		nsFocal = nsDrOwn * smoothstep( 0.0, NS_FOCAL_EDGE_U, nsBorder ) * mix( 1.0, exp( - dot( nsDp, nsDp ) * NS_FOCAL_INV ), nsMp.w );
	}
	float nsA = clamp( NS_BROAD_GAIN * nsBroad + NS_FOCAL_GAIN * nsFocal, 0.0, 1.0 );
	float nsHov = ( nsHover >= 0.0 && abs( float( nsI ) - nsHover ) < 0.5 ) ? 1.0 : 0.0;
	float nsHovN = ( nsHover >= 0.0 && abs( float( nsJ ) - nsHover ) < 0.5 ) ? 1.0 : 0.0;
	float nsLine = 1.0 - smoothstep( NS_BORDER_PX * nsPx, ( NS_BORDER_PX + 1.0 ) * nsPx, nsBorder );
	float nsHovLine = max( nsHov, nsHovN ) * ( 1.0 - smoothstep( NS_HOVER_PX * nsPx, ( NS_HOVER_PX + 1.0 ) * nsPx, nsBorder ) );
	diffuseColor.rgb = mix( NS_NEUTRAL, nsTintMix, NS_TINT_STRENGTH ) * NS_REST_ALBEDO * ( 1.0 - NS_ACTIVE_DARKEN * smoothstep( 0.0, NS_ACTIVE_DARKEN_END, nsA ) ) * ( 1.0 + NS_HOVER_BOOST * nsHov ) * ( 1.0 - NS_BORDER_DARKEN * nsLine );
`;

// Emission: the activity glow through the ramp (decorative shimmer scaled by activity), the hovered region's tint and
// its outline.
const STRIP_EMISSIVE_GLSL = `
	float nsGlowK = NS_GLOW_REST + ( 1.0 - NS_GLOW_REST ) * smoothstep( 0.0, NS_GLOW_RISE, nsA );
	float nsSh = 1.0;
	if ( nsShimmer > 0.0 ) {
		float nsW1 = sin( vNsU * 157.0 - nsTime * 4.3 );
		float nsW2 = sin( dot( vNsSrc, vec3( 0.31, 0.83, 0.47 ) ) * 1.7 + nsTime * 6.1 );
		nsSh = 1.0 + nsShimmer * NS_SHIMMER * nsA * nsW1 * nsW2;
	}
	totalEmissiveRadiance += nsRamp( nsA ) * nsGlowK * nsSh + nsT1 * ( NS_HOVER_GLOW * nsHov ) + NS_HOVER_LINE * nsHovLine;
`;

/** Pure patch of a MeshStandardMaterial { vertexShader, fragmentShader } pair for the strip; null when a hook is
 * missing (the strip then keeps CPU vertex colours from ns-brain stripShade). Needs the `nsU` vertex attribute. */
export function patchStripShaders(vertexShader, fragmentShader) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const v = vertexShader.indexOf(STRIP_VERTEX_HOOK), c = fragmentShader.indexOf(STRIP_COLOR_HOOK), e = fragmentShader.indexOf(STRIP_EMISSIVE_HOOK);
  if (v < 0 || c < 0 || e < 0 || e < c) return null;
  const ve = v + STRIP_VERTEX_HOOK.length, ce = c + STRIP_COLOR_HOOK.length, ee = e + STRIP_EMISSIVE_HOOK.length;
  let fragment = stripFragmentHeader() + fragmentShader.slice(0, ce) + STRIP_COLOR_GLSL + fragmentShader.slice(ce, ee) +
    STRIP_EMISSIVE_GLSL + fragmentShader.slice(ee);
  const l = fragment.indexOf(STRIP_LIGHTS_HOOK);
  if (l >= 0) {
    const le = l + STRIP_LIGHTS_HOOK.length;
    fragment = fragment.slice(0, le) + '\n\treflectedLight.indirectDiffuse *= NS_AMBIENT_SCALE;' + fragment.slice(le);
  }
  return {
    vertexShader: 'attribute float nsU;\nvarying float vNsU;\nvarying vec3 vNsSrc;\n' + vertexShader.slice(0, ve) +
      '\n\tvNsU = nsU;\n\tvNsSrc = position;' + vertexShader.slice(ve),
    fragmentShader: fragment
  };
}

/* ------------------------------------------------------------------ arm ghost window (A2-render R1) */

/** Arm ghost window around the crosshair: radiusFrac x min(viewport width, height) (CSS px; the soft edge starts at
 * edge x radius), fill = fraction of interior arm fragments kept (ordered-noise dither), a silhouette rim (|N.V| from
 * rimLo to rimHi) kept and lit with rimColor (linear), easeS = time constant of the automatic fade. */
export const ARM_GHOST = Object.freeze({ radiusFrac: 0.11, edge: 0.7, fill: 0.2, rimLo: 0.18, rimHi: 0.42, rimColor: Object.freeze([0.35, 0.55, 0.85]), easeS: 0.12 });

const ARM_NORMAL_HOOK = '#include <normal_fragment_begin>';
const ARM_EMISSIVE_HOOK = '#include <emissivemap_fragment>';

/** Glass rim shader patch for an UNLIT MeshBasicMaterial (which has no view normal): the vertex shader passes the
 * view-space normal and view vector, the fragment shader sets the alpha before Three's final colour write (r154+
 * `opaque_fragment`, older `output_fragment`). Hooks: vertex `#include <project_vertex>` (mvPosition in scope; the
 * `normal` attribute and `normalMatrix` are declared by Three for every built-in material). */
// R4-integrator (R4-view D5 glass fix, prototype harness/run-R4-view-6/scene-glass-prototype.diff, viewed): with the
// perspective squash (nsFarEye.w = K > 1) the glass rim uses the brain's RIGID normal (nsRigidN = view x rigid rotation)
// and the view vector from the far eye to the real, unsquashed point, so the fresnel rim looks as it would on the real
// brain seen from K times farther. K <= 1 keeps the round-3 lines exactly.
const GLASS_VARYINGS = 'varying vec3 vNsNormal;\nvarying vec3 vNsView;\nuniform mat3 nsRigidN;\nuniform vec4 nsFarEye;\n';
const GLASS_VERTEX_HOOK = '#include <project_vertex>';
const GLASS_VERTEX_GLSL = 'if (nsFarEye.w > 1.0) {\n  vNsNormal = normalize( nsRigidN * normal );\n  vec3 nsC = nsFarEye.xyz; vec3 nsU = normalize(nsC); vec3 nsD = mvPosition.xyz - nsC;\n  vNsView = - nsFarEye.w * nsC - (nsD + (nsFarEye.w - 1.0) * dot(nsD, nsU) * nsU);\n} else {\n  vNsNormal = normalize( normalMatrix * normal );\n  vNsView = - mvPosition.xyz;\n}';
const GLASS_RIM_GLSL = [
  'float nsFacing = abs( dot( normalize( vNsNormal ), normalize( vNsView ) ) );',
  'diffuseColor.a = mix( diffuseColor.a, nsRimOpacity, pow( 1.0 - nsFacing, nsRimPower ) );'
].join('\n');
const GLASS_FRAGMENT_HOOKS = Object.freeze(['#include <opaque_fragment>', '#include <output_fragment>']);

/** Pure patch of a { vertexShader, fragmentShader } pair; returns the patched pair, or null when a hook is missing (the
 * glass then keeps its plain face-on opacity; nothing else changes). */
export function patchGlassShaders(vertexShader, fragmentShader) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const v = vertexShader.indexOf(GLASS_VERTEX_HOOK);
  const hook = GLASS_FRAGMENT_HOOKS.find(h => fragmentShader.includes(h));
  if (v < 0 || !hook) return null;
  const ve = v + GLASS_VERTEX_HOOK.length, f = fragmentShader.indexOf(hook);
  return {
    vertexShader: GLASS_VARYINGS + vertexShader.slice(0, ve) + '\n' + GLASS_VERTEX_GLSL + vertexShader.slice(ve),
    fragmentShader: 'uniform float nsRimOpacity;\nuniform float nsRimPower;\n' + GLASS_VARYINGS +
      fragmentShader.slice(0, f) + GLASS_RIM_GLSL + '\n' + fragmentShader.slice(f)
  };
}

/** R3-scene glass readability (display choices). The glass shell keeps the fresnel rim and gains (a) a soft key-light
 * term on gyral CROWNS (view-space light from lightDir, upper left: lit faces get up to crownOpacity more alpha and
 * crownBright more light, which gives each gyrus a rounded, lit relief) and (b) a
 * darker, more see-through GROOVE cue from the per-vertex sulcal depth (sulcalDepth; 0 crown .. 1 deep groove): the
 * groove keeps grooveLight of the light and grooveAlpha of the alpha, and sulcal walls lose most of their rim. So the
 * gyri and sulci read at a glance; nothing about tissue optics is implied. */
export const GLASS_READ = Object.freeze({ crownOpacity: 0.035, crownBright: 0.45, grooveLight: 0.38, grooveAlpha: 0.3, rimGroove: 0.65, lightDir: Object.freeze([-0.35, 0.55, 0.75]), sulcLoMm: 1.5, sulcHiMm: 9, directions: 320 });
const GLASS_SULC_VERTEX = 'vNsSulc = nsSulc;';
const glassReadGlsl = (rimGroove = GLASS_READ.rimGroove, light = GLASS_READ.lightDir) => [
  'vec3 nsN = normalize( vNsNormal ); vec3 nsV = normalize( vNsView );',
  'if ( dot( nsN, nsV ) < 0.0 ) nsN = -nsN;', // the side facing the viewer (DoubleSide glass)
  'float nsFacing = dot( nsN, nsV );',
  `float nsLam = max( dot( nsN, normalize( vec3( ${glslFloat(light[0])}, ${glslFloat(light[1])}, ${glslFloat(light[2])} ) ) ), 0.0 );`,
  'float nsG = clamp( vNsSulc, 0.0, 1.0 );',
  'float nsA = diffuseColor.a + nsRead.x * nsLam * ( 1.0 - nsG );',
  `nsA = mix( nsA, nsRimOpacity, pow( 1.0 - nsFacing, nsRimPower ) * ( 1.0 - ${glslFloat(rimGroove)} * nsG ) );`,
  'diffuseColor.a = nsA * mix( 1.0, nsRead.w, nsG );',
  'outgoingLight *= ( 1.0 + nsRead.y * nsLam ) * mix( 1.0, nsRead.z, nsG );'
].join('\n');

/** R3-scene glass patch (pure): patchGlassShaders plus the crown / groove terms. Needs a float vertex attribute `nsSulc`
 * (a geometry without it reads 0 = crown, i.e. the plain rim look) and uniforms nsRimOpacity, nsRimPower and nsRead
 * (vec4: crownOpacity, crownBright, grooveLight, grooveAlpha). null when a hook is missing (plain glass is drawn). */
export function patchGlassReadShaders(vertexShader, fragmentShader) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const v = vertexShader.indexOf(GLASS_VERTEX_HOOK);
  const hook = GLASS_FRAGMENT_HOOKS.find(h => fragmentShader.includes(h));
  if (v < 0 || !hook || !fragmentShader.includes('outgoingLight')) return null;
  const ve = v + GLASS_VERTEX_HOOK.length, f = fragmentShader.indexOf(hook);
  return {
    vertexShader: 'attribute float nsSulc;\nvarying float vNsSulc;\n' + GLASS_VARYINGS + vertexShader.slice(0, ve) + '\n' + GLASS_VERTEX_GLSL + '\n' + GLASS_SULC_VERTEX + vertexShader.slice(ve),
    fragmentShader: 'uniform float nsRimOpacity;\nuniform float nsRimPower;\nuniform vec4 nsRead;\nvarying float vNsSulc;\n' + GLASS_VARYINGS +
      fragmentShader.slice(0, f) + glassReadGlsl() + '\n' + fragmentShader.slice(f)
  };
}

/** R3-scene smooth see-through (replaces the dithered ghost windows; display only). One alpha patch for MeshStandardMaterial
 * (transparent, drawn after the brain): uniform nsSee = (amount 0..1, alpha, rimAlpha, unused) and nsWin = (centre x,
 * centre y [drawing-buffer px], radius px, edge 0..1; radius 0 = everywhere). Inside the window the fragment alpha becomes
 * mix(alpha, rimAlpha, rim) with a NARROW silhouette band rim = 1 - smoothstep(rimLo, rimHi, |N.V|), blended in by
 * `amount`; outside it stays 1. Hooks: '#include <opaque_fragment>' (r154+) or '#include <output_fragment>'; `normal` and
 * `vViewPosition` must be in scope (they are for MeshStandardMaterial). null when a hook is missing. */
export function patchSeeThroughShaders(vertexShader, fragmentShader, { rimLo = 0.02, rimHi = 0.12 } = {}) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const hook = GLASS_FRAGMENT_HOOKS.find(h => fragmentShader.includes(h));
  if (!hook || !fragmentShader.includes('vViewPosition') || !fragmentShader.includes(ARM_NORMAL_HOOK)) return null;
  const f = fragmentShader.indexOf(hook);
  const body = `
	if ( nsSee.x > 0.0 ) {
		float nsIn = nsWin.z > 0.0 ? 1.0 - smoothstep( nsWin.z * nsWin.w, nsWin.z, length( gl_FragCoord.xy - nsWin.xy ) ) : 1.0;
		float nsFacingS = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
		float nsRimS = 1.0 - smoothstep( ${glslFloat(rimLo)}, ${glslFloat(rimHi)}, nsFacingS );
		diffuseColor.a *= mix( 1.0, mix( nsSee.y, nsSee.z, nsRimS ), nsSee.x * nsIn );
	}
`;
  return {
    vertexShader,
    fragmentShader: 'uniform vec4 nsSee;\nuniform vec4 nsWin;\n' + fragmentShader.slice(0, f) + body + fragmentShader.slice(f)
  };
}

/** R3-scene: torso / neck translucency while looking down (replaces the dithered BODY_SEE_THROUGH window). From
 * pitchStartDeg (fully at pitchFullDeg) the torso and neck meshes drawn in place become ONE smooth translucent layer:
 * a depth pre-pass keeps only the nearest torso surface, which is drawn at `alpha` (a narrow silhouette band at rimAlpha
 * keeps the outline), so the opaque thighs, knees and feet show clearly through the chest and belly. Arm ghost
 * (ARM_SEE): the same smooth alpha in a soft window around the crosshair while the gaze is on a motor area. */
// R3-fix (review M1 / F3, R3-body recommendation): the body now SITS, so looking down the chest and belly are seen in
// front of the lap and the thighs, knees and feet beyond them; the see-through torso is no longer needed and made the
// chest and belly a 20 % ghost (and a flat grey patch at the groin). enabled: false draws the torso opaque.
export const BODY_TRANSLUCENT = Object.freeze({ enabled: false, pitchStartDeg: 40, pitchFullDeg: 60, alpha: 0.2, rimAlpha: 0.75, easeS: 0.12 });
/** R3-fix (review M4, the user's "brain overlay"): where the player's own body (legs, torso, right arm, neck; never the
 * controlled left arm or the face layer) covers the brain's on-screen outline, it is drawn see-through (alpha), so a
 * dragged-down brain and the moving legs can be watched together. edge: soft edge of the ellipse (fraction of radius). */
export const BODY_OVER_BRAIN = Object.freeze({ alpha: 0.3, edge: 0.12, padFrac: 0.04 });
/** Fragment patch for BODY_OVER_BRAIN: alpha drops inside the ellipse nsOvlWin (device px: cx, cy, rx, ry). */
export function patchOverBrainShaders(vertexShader, fragmentShader, { edge = BODY_OVER_BRAIN.edge } = {}) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const hook = GLASS_FRAGMENT_HOOKS.find(h => fragmentShader.includes(h));
  if (!hook) return null;
  const f = fragmentShader.indexOf(hook);
  const body = `
	if ( nsOvl.x > 0.0 ) {
		vec2 nsOd = ( gl_FragCoord.xy - nsOvlWin.xy ) / max( nsOvlWin.zw, vec2( 1.0 ) );
		float nsOin = 1.0 - smoothstep( ${glslFloat(1 - edge)}, 1.0, length( nsOd ) );
		diffuseColor.a *= mix( 1.0, nsOvl.y, nsOvl.x * nsOin );
	}
`;
  return { vertexShader, fragmentShader: 'uniform vec4 nsOvl;\nuniform vec4 nsOvlWin;\n' + fragmentShader.slice(0, f) + body + fragmentShader.slice(f) };
}
export const ARM_SEE = Object.freeze({ radiusFrac: 0.11, edge: 0.6, alpha: 0.22, rimAlpha: 0.85 });
/** Draw order of the R3 smooth translucent body layers: after every brain pass (glass up to 6), the torso depth pre-pass,
 * the torso colour, the face-layer depth pre-pass and colour (own scene), then the arm (transparent so its ghost window
 * can blend over the brain drawn before it). */
export const BODY_ORDER = Object.freeze({ torsoDepth: 7, torso: 8, faceDepth: 1, face: 2, arm: 10 });

/** Marker dot size, highlight scale and lift toward superior (source mm, before the giant display scale): ns-brain
 * MARKER_GEOMETRY. Repair R5: each marker mesh is ns-brain MARKER_OCTAHEDRON, placed and scaled by ns-brain markerSolid,
 * the same triangles, centre and scale classifyGaze intersects, so the drawn solid is exactly the pick target. */
export const MARKER_RADIUS_MM = MARKER_GEOMETRY.radiusMm;
export const MARKER_ACTIVE_SCALE = MARKER_GEOMETRY.activeScale;
export const MARKER_LIFT_MM = MARKER_GEOMETRY.liftMm;

/** Constructors this adapter needs from the injected THREE namespace. */
export const THREE_API = Object.freeze([
  'Scene', 'PerspectiveCamera', 'WebGLRenderer', 'Group', 'Mesh', 'BufferGeometry', 'BufferAttribute',
  'MeshStandardMaterial', 'MeshBasicMaterial', 'Color', 'AmbientLight', 'DirectionalLight', 'Raycaster', 'Vector3'
]);

function requireThree(THREE) {
  if (!THREE || (typeof THREE !== 'object' && typeof THREE !== 'function')) {
    fail('scene_three', 'THREE must be injected: createScene({ THREE, canvas })');
  }
  for (const name of THREE_API) if (typeof THREE[name] !== 'function') fail('scene_three', `THREE.${name} is missing`);
  if (THREE.DoubleSide === undefined) fail('scene_three', 'THREE.DoubleSide is missing');
  return THREE;
}

/* ------------------------------------------------------------------ pure helpers (Node-testable) */

/** Area-weighted unit vertex normals of an indexed triangle mesh. Vertices without a face get [0, 0, 1]. */
export function computeNormals(positions, indices, out) {
  if (!positions || positions.length % 3 !== 0) fail('scene_input', 'positions length must be a multiple of 3');
  if (!indices || indices.length % 3 !== 0) fail('scene_input', 'indices length must be a multiple of 3');
  const n = positions.length / 3;
  const o = out || new Float32Array(positions.length);
  if (o.length !== positions.length) fail('scene_input', 'out must match positions length');
  for (let i = 0; i < o.length; i++) o[i] = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2];
    if (!(ia < n && ib < n && ic < n)) fail('scene_input', `triangle ${t / 3} has an out-of-range index`);
    const a = 3 * ia, b = 3 * ib, c = 3 * ic;
    const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    o[a] += nx; o[a + 1] += ny; o[a + 2] += nz;
    o[b] += nx; o[b + 1] += ny; o[b + 2] += nz;
    o[c] += nx; o[c + 1] += ny; o[c + 2] += nz;
  }
  for (let k = 0; k < o.length; k += 3) {
    const l = Math.hypot(o[k], o[k + 1], o[k + 2]);
    if (l > 0) { o[k] /= l; o[k + 1] /= l; o[k + 2] /= l; } else { o[k] = 0; o[k + 1] = 0; o[k + 2] = 1; }
  }
  return o;
}

/** Linear blend of the rotation parts of the segment matrices applied to rest normals, renormalised into `out`.
 * Same weights as skinApply; translations are ignored and the uniform 0.001 scale cancels in the normalisation. */
export function skinNormals(matrices, weights, restNormals, out) {
  if (!(matrices instanceof Map)) fail('scene_skin', 'matrices must be a Map(segment -> matrix)');
  if (!restNormals || restNormals.length % 3 !== 0) fail('scene_skin', 'restNormals length must be a multiple of 3');
  const n = restNormals.length / 3;
  const { i0, i1, w0, w1 } = weights || {};
  if (!i0 || !i1 || !w0 || !w1 || i0.length < n || i1.length < n || w0.length < n || w1.length < n) {
    fail('scene_skin', 'weights must provide i0, i1, w0, w1 for every vertex');
  }
  const o = out || new Float32Array(restNormals.length);
  if (o.length !== restNormals.length) fail('scene_skin', 'out must match restNormals length');
  const mats = SEGMENTS.map(s => matrices.get(s) || null);
  for (let v = 0; v < n; v++) {
    const k = 3 * v;
    const x = restNormals[k], y = restNormals[k + 1], z = restNormals[k + 2];
    const ma = mats[i0[v]];
    if (!ma) fail('scene_skin', `missing matrix for segment index ${i0[v]}`);
    let ox = ma[0] * x + ma[4] * y + ma[8] * z;
    let oy = ma[1] * x + ma[5] * y + ma[9] * z;
    let oz = ma[2] * x + ma[6] * y + ma[10] * z;
    const b = w1[v];
    if (b > 0) {
      const mb = mats[i1[v]];
      if (!mb) fail('scene_skin', `missing matrix for segment index ${i1[v]}`);
      const a = w0[v];
      ox = a * ox + b * (mb[0] * x + mb[4] * y + mb[8] * z);
      oy = a * oy + b * (mb[1] * x + mb[5] * y + mb[9] * z);
      oz = a * oz + b * (mb[2] * x + mb[6] * y + mb[10] * z);
    }
    const l = Math.hypot(ox, oy, oz);
    if (l > 0) { o[k] = ox / l; o[k + 1] = oy / l; o[k + 2] = oz / l; } else { o[k] = x; o[k + 1] = y; o[k + 2] = z; }
  }
  return o;
}

/** True when both pose maps hold element-wise identical matrices for every rig segment. */
/** Equal within `tol` per matrix element (default exact). With tol > 0 the caller compares against the last
 * SKINNED matrices, so skipped sub-visual changes never accumulate beyond tol. */
export function matricesEqual(a, b, tol = 0) {
  if (!(a instanceof Map) || !(b instanceof Map)) return false;
  for (const s of SEGMENTS) {
    const x = a.get(s), y = b.get(s);
    if (!x || !y || x.length !== 16 || y.length !== 16) return false;
    for (let i = 0; i < 16; i++) if (!(Math.abs(x[i] - y[i]) <= tol)) return false;
  }
  return true;
}

/** Pose changes below this (metres for translations; dimensionless for rotation entries) are not re-skinned:
 * about 2 micrometres, far below a pixel, so decaying drives stop costing CPU skinning once they are invisible. */
export const RESKIN_TOLERANCE = 2e-6;

/** True when two { id: drive } maps hold the same keys and values (within `tol` per value; default exact). */
export function drivesEqual(a, b, tol = 0) {
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (a[k] === b[k]) continue;
    if (!(tol > 0 && Math.abs(a[k] - b[k]) <= tol)) return false;
  }
  return true;
}

/** Display tolerance for the CPU-fallback strip recolour: drive changes below 1/512 are not visible. */
export const STRIP_DRIVE_TOLERANCE = 1 / 512;

/** Unit octahedron (outward counter-clockwise faces) used for the representative marker dots: ns-brain's one
 * definition, shared with the picker (repair R5). */
const OCTA_POSITIONS = MARKER_OCTAHEDRON.positions;
const OCTA_INDICES = MARKER_OCTAHEDRON.indices;

/* ------------------------------------------------------------------ U2b-scene pure helpers (Node-testable) */

const DEG = Math.PI / 180;
const clamp01 = x => (x > 1 ? 1 : x > 0 ? x : 0);
const fin01 = v => (Number.isFinite(v) ? clamp01(v) : 0);
const clampTo = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const smooth = (e0, e1, x) => { const t = (x - e0) / (e1 - e0); const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * (3 - 2 * c); };

/** The shared ns-colors ramp evaluated into `out` (linear RGB) without allocating; equals activityColor(v). */
export function rampInto(v, out) {
  const n = SHARED_RAMP.length - 1;
  const x = fin01(v) * n;
  const i = Math.min(n - 1, Math.floor(x)), f = x - i;
  const a = SHARED_RAMP[i], b = SHARED_RAMP[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}

/** The ns-colors "same meaning" shading rule (activityShade) written into out.albedo / out.emission without
 * allocating: albedo = base x (1 - darken * smoothstep(0, darkenEnd, v)); emission = ramp(v) x smoothstep(0, riseTo, v).
 * Used for brain regions AND muscles, so equal simulated activity looks equal on both. */
export function activityShadeInto(baseLinear, v, out, glow = ACTIVITY_GLOW) {
  const a = fin01(v);
  const k = 1 - glow.darken * smooth(0, glow.darkenEnd, a);
  out.albedo[0] = baseLinear[0] * k; out.albedo[1] = baseLinear[1] * k; out.albedo[2] = baseLinear[2] * k;
  rampInto(a, out.emission);
  const g = a > 0 ? smooth(0, glow.riseTo, a) : 0;
  out.emission[0] *= g; out.emission[1] *= g; out.emission[2] *= g;
  out.glow = g;
  return out;
}

/** Region style constants: ns-brain REGION_STYLE when present (U2a owns the values), else this identical mirror. */
const REGION_STYLE_FALLBACK = Object.freeze({
  restOpacity: 0.3, activatedOpacity: 0.54, activatedOpacityMax: 0.64, activatedOpacityPerExtra: 0.025,
  activatedShadeMix: 0.34, activatedShade: Object.freeze([0.88, 0.80, 0.62]),
  leftArmTint: KEY_COLORS.leftArmTint, otherTint: KEY_COLORS.otherTint, otherTintAlt: KEY_COLORS.otherTintAlt,
  leftArmOutline: Object.freeze([0.55, 0.95, 1.0]), hoverOpacityBoost: 0.08, leftArmLabel: 'LEFT ARM (right hemisphere)'
});
export function regionStyleConstants() {
  const s = NsBrain.REGION_STYLE;
  return s && Array.isArray(s.leftArmTint) && Number.isFinite(s.restOpacity) ? s : REGION_STYLE_FALLBACK;
}

/** Region rendering (display choices, unitless). Opacity: the ns-brain REGION_STYLE rest / activated / hover values,
 * then lifted toward maxOpacity by activityOpacityGain x the ramp glow while the region is active, so a glowing region
 * reads clearly through the glass and fades back to its rest (or persistent activated) opacity. hoverEmission: the
 * hovered region's identity tint added as emission. quantize: updates below 1/quantize activity are skipped. */
export const REGION_RENDER = Object.freeze({
  activityOpacityGain: 0.65, maxOpacity: 0.92, hoverEmission: 0.14, quantize: 256, roughness: 0.48, metalness: 0,
  /** Polish: the per-region borders inside a body-part territory are faint (they were full-strength and made the strip
   * look like cracked shards); each body-part GROUP (the on-brain label groups) gets one welded outline instead. */
  // R3-scene: left-arm sub-area borders fainter still (0.36 -> 0.22), territory borders softer (groupLineOpacity 0.5 ->
  // 0.32); all outlines are now smoothed (smoothTerritoryOutline), and other-body region borders show on hover/activation.
  hoverLine: 0xfff3a0, lineOpacity: 1, leftArmLineOpacity: 0.22,
  /** Non-left-arm regions: faint outlines so every motor area reads as a region (not glass), and a small rest opacity
   * lift; the left-arm regions keep the stronger cyan identity. */
  otherLine: KEY_COLORS.otherLine, otherLineOpacity: 0.16, otherOpacityLift: 0.06,
  /** Activated regions (persistent until Reset body) also get a warm gold outline, so the marks stay findable on the
   * busy strip; the fill change itself stays slight (shade + opacity, REGION_STYLE). */
  activatedLine: 0xffc65c, activatedLineOpacity: 0.95,
  /** Group (territory) outlines: the LEFT-ARM territory (right hemisphere) in bright cyan, every other body-part group
   * in a soft warm grey (R4-access: ns-colors KEY_COLORS; the lavender read like the cyan for red-green colour-blind
   * players), so the left-arm / other-body distinction reads at a glance. */
  territoryLine: KEY_COLORS.leftArmLine, territoryLineOpacity: 1, groupLine: KEY_COLORS.otherGroupLine, groupLineOpacity: 0.32
});
/** R3-scene outline smoothing (smoothTerritoryOutline options, source mm): Chaikin rounds, lift off the surface, specks
 * shorter than minChainMm dropped. Display choices. */
// The BodyParts3D strip parts are not consistently wound (about 40 % of the left-arm faces have +z winding normals), so
// the lift is straight toward the overhead viewer (source +z, superior), which every default and orbit view looks along
// within about 65 deg.
export const REGION_OUTLINE = Object.freeze({ iterations: 2, liftMm: 0.8, minChainMm: 4, quantum: 1e-3, decimate: 2, liftDir: Object.freeze([0, 0, 1]) });

/** Outline of the UNION of several region parts (pure): parts [{ positions (xyz), indices }] are welded by position
 * (quantum, source mm) so edges shared between neighbouring parts cancel, and the edges used by exactly one triangle
 * of the union are returned as segment end points Float32Array [ax, ay, az, bx, by, bz, ...]. */
export function weldedBoundarySegments(parts, quantum = 1e-3) {
  const ids = new Map();
  const pos = [];
  const counts = new Map();
  const tris = new Set();
  const SHIFT = 2 ** 22;
  for (const part of parts || []) {
    const P = part && part.positions, I = part && part.indices;
    if (!P || !I || I.length % 3 !== 0) continue;
    const local = new Int32Array(P.length / 3).fill(-1);
    const idOf = v => {
      if (local[v] >= 0) return local[v];
      const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
      const k = `${Math.round(x / quantum)},${Math.round(y / quantum)},${Math.round(z / quantum)}`;
      let id = ids.get(k);
      if (id === undefined) { id = pos.length / 3; ids.set(k, id); pos.push(x, y, z); }
      local[v] = id;
      return id;
    };
    const add = (u, w) => { if (u === w) return; const k = u < w ? u * SHIFT + w : w * SHIFT + u; counts.set(k, (counts.get(k) || 0) + 1); };
    for (let t = 0; t < I.length; t += 3) {
      const a = idOf(I[t]), b = idOf(I[t + 1]), c = idOf(I[t + 2]);
      // Overlapping regions may share a triangle: count each welded triangle once.
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
      const tk = `${lo},${mid},${hi}`;
      if (tris.has(tk)) continue;
      tris.add(tk);
      add(a, b); add(b, c); add(c, a);
    }
  }
  const out = [];
  for (const [k, c] of counts) {
    if (c !== 1) continue;
    const u = Math.floor(k / SHIFT), w = k % SHIFT;
    out.push(pos[3 * u], pos[3 * u + 1], pos[3 * u + 2], pos[3 * w], pos[3 * w + 1], pos[3 * w + 2]);
  }
  return Float32Array.from(out);
}

/** R4-scene (left-arm identity at every activity level, round-3 m10): a cyan RIM along the inside of the left-arm
 * territory's outer border. The fill keeps the ONE shared activity ramp (same colours on brain and muscles); only a band
 * widthMm wide at the territory edge mixes toward the territory cyan (REGION_RENDER.territoryLine), so the left-arm
 * strip is still told apart from every other area when its activity is low (dark ramp colours) or high. Display only. */
export const LEFT_ARM_RIM = Object.freeze({ widthMm: 2.5, mix: 0.85, alpha: 0.9, glow: 0.45 });

/** Per-vertex closeness (pure) to a set of boundary segments (Float32Array, 6 floats per segment, e.g.
 * weldedBoundarySegments): 1 on the boundary, falling smoothly to 0 at widthMm (smoothstep). Uses a uniform grid of
 * cell widthMm, so the cost is about linear in vertices + segments. */
export function boundaryCloseness(positions, segments, widthMm = LEFT_ARM_RIM.widthMm) {
  const n = positions.length / 3, out = new Float32Array(n);
  const m = segments ? segments.length / 6 : 0;
  if (!m || !(widthMm > 0)) return out;
  const cell = widthMm, grid = new Map();
  const key = (i, j, k) => `${i},${j},${k}`;
  for (let s = 0; s < m; s++) {
    const o = 6 * s;
    const lo = [Math.min(segments[o], segments[o + 3]), Math.min(segments[o + 1], segments[o + 4]), Math.min(segments[o + 2], segments[o + 5])];
    const hi = [Math.max(segments[o], segments[o + 3]), Math.max(segments[o + 1], segments[o + 4]), Math.max(segments[o + 2], segments[o + 5])];
    for (let i = Math.floor(lo[0] / cell); i <= Math.floor(hi[0] / cell); i++) for (let j = Math.floor(lo[1] / cell); j <= Math.floor(hi[1] / cell); j++) for (let k = Math.floor(lo[2] / cell); k <= Math.floor(hi[2] / cell); k++) {
      const kk = key(i, j, k); let l = grid.get(kk); if (!l) { l = []; grid.set(kk, l); } l.push(s);
    }
  }
  const w2 = widthMm * widthMm;
  for (let v = 0; v < n; v++) {
    const px = positions[3 * v], py = positions[3 * v + 1], pz = positions[3 * v + 2];
    const ci = Math.floor(px / cell), cj = Math.floor(py / cell), ck = Math.floor(pz / cell);
    let best = w2;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
      const l = grid.get(key(i, j, k)); if (!l) continue;
      for (const s of l) {
        const o = 6 * s, ax = segments[o], ay = segments[o + 1], az = segments[o + 2];
        const dx = segments[o + 3] - ax, dy = segments[o + 4] - ay, dz = segments[o + 5] - az;
        const L = dx * dx + dy * dy + dz * dz;
        const t = L > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L)) : 0;
        const ex = ax + t * dx - px, ey = ay + t * dy - py, ez = az + t * dz - pz;
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < best) best = d2;
      }
    }
    if (best < w2) { const x = 1 - Math.sqrt(best) / widthMm; out[v] = x * x * (3 - 2 * x); }
  }
  return out;
}

const EDGE_VERTEX_HOOK = '#include <begin_vertex>';
const EDGE_COLOR_HOOK = '#include <color_fragment>';
const EDGE_EMISSIVE_HOOK = '#include <emissivemap_fragment>';
/** Shader patch (pure) for the left-arm rim: a float vertex attribute nsEdge (boundaryCloseness) mixes the fragment's
 * colour AND its emission (the ramp glow) toward the uniform nsEdgeColor by nsEdgeParams.x (the emission toward
 * nsEdgeColor x nsEdgeParams.z), and raises its alpha to at least nsEdgeParams.y, all scaled by nsEdge (so the rim stays
 * cyan instead of adding up to white over a bright ramp colour). null when a hook is missing (the region is then drawn without a rim). */
export function patchEdgeShaders(vertexShader, fragmentShader) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  if (!vertexShader.includes(EDGE_VERTEX_HOOK) || !fragmentShader.includes(EDGE_COLOR_HOOK) || !fragmentShader.includes(EDGE_EMISSIVE_HOOK)) return null;
  return {
    vertexShader: 'attribute float nsEdge;\nvarying float vNsEdge;\n' + vertexShader.replace(EDGE_VERTEX_HOOK, `${EDGE_VERTEX_HOOK}\nvNsEdge = nsEdge;`),
    fragmentShader: 'varying float vNsEdge;\nuniform vec3 nsEdgeColor;\nuniform vec3 nsEdgeParams;\n' + fragmentShader
      .replace(EDGE_COLOR_HOOK, `${EDGE_COLOR_HOOK}\ndiffuseColor.rgb = mix( diffuseColor.rgb, nsEdgeColor, vNsEdge * nsEdgeParams.x );\ndiffuseColor.a = max( diffuseColor.a, vNsEdge * nsEdgeParams.y );`)
      .replace(EDGE_EMISSIVE_HOOK, `${EDGE_EMISSIVE_HOOK}\ntotalEmissiveRadiance = mix( totalEmissiveRadiance, nsEdgeColor * nsEdgeParams.z, vNsEdge * nsEdgeParams.x );`)
  };
}

/** Display style of one region for its simulated state (pure; `out` reused when given): { tint (identity, linear),
 * albedo, emission (linear), opacity, glow, activated }. Left-arm regions use REGION_STYLE.leftArmTint, the others
 * alternate otherTint / otherTintAlt by strip order; activatedCount >= 1 mixes activatedShadeMix toward activatedShade
 * and raises the opacity (activatedOpacity + activatedOpacityPerExtra per extra activation, capped). */
export function regionDisplayStyle(region, { activity = 0, activatedCount = 0, hovered = false } = {}, out = null, style = regionStyleConstants(), render = REGION_RENDER) {
  if (!region) fail('scene_region', 'region is required');
  const o = out || { tint: [0, 0, 0], albedo: [0, 0, 0], emission: [0, 0, 0], opacity: 0, glow: 0, activated: false };
  const base = region.isLeftArm ? style.leftArmTint : (Math.round(Number(region.order) || 0) % 2 === 0 ? style.otherTint : style.otherTintAlt);
  const n = Number.isFinite(activatedCount) ? activatedCount : 0;
  const activated = n >= 1;
  const mix = activated ? style.activatedShadeMix : 0;
  for (let i = 0; i < 3; i++) o.tint[i] = base[i] + (style.activatedShade[i] - base[i]) * mix;
  activityShadeInto(o.tint, activity, o);
  if (hovered) for (let i = 0; i < 3; i++) o.emission[i] += o.tint[i] * render.hoverEmission;
  let op = style.restOpacity;
  if (activated) op = Math.min(style.activatedOpacityMax, style.activatedOpacity + style.activatedOpacityPerExtra * Math.max(0, n - 1));
  if (!region.isLeftArm && Number.isFinite(render.otherOpacityLift)) op += render.otherOpacityLift;
  if (hovered) op = Math.min(1, op + style.hoverOpacityBoost);
  if (op < render.maxOpacity) op += (render.maxOpacity - op) * render.activityOpacityGain * o.glow;
  o.opacity = op;
  o.activated = activated;
  return o;
}

/** Boundary edges of an indexed triangle mesh: vertex index pairs of every edge used by exactly one triangle (the
 * outline of a region part). Returns a Uint32Array [a0, b0, a1, b1, ...]. */
export function boundaryEdges(indices, vertexCount) {
  if (!indices || indices.length % 3 !== 0) fail('scene_input', 'indices length must be a multiple of 3');
  const n = Math.max(1, vertexCount | 0);
  const counts = new Map();
  const add = (a, b) => { const k = a < b ? a * n + b : b * n + a; counts.set(k, (counts.get(k) || 0) + 1); };
  for (let t = 0; t < indices.length; t += 3) { add(indices[t], indices[t + 1]); add(indices[t + 1], indices[t + 2]); add(indices[t + 2], indices[t]); }
  const out = [];
  for (const [k, c] of counts) if (c === 1) out.push(Math.floor(k / n), k % n);
  return Uint32Array.from(out);
}

/** Label group of a body-map region: 'leftArm' | 'arm' | 'leg' | 'trunk' | 'face' | 'scan' | 'other'. */
export function regionGroupKey(region) {
  if (!region) return 'other';
  if (region.isLeftArm) return 'leftArm';
  const s = `${region.id || ''} ${region.effector || ''} ${region.label || ''}`.toLowerCase();
  if (/scan|inter-effector/.test(s)) return 'scan';
  if (/toe|ankle|knee|hip|leg|foot/.test(s)) return 'leg';
  if (/trunk|torso|abdom/.test(s)) return 'trunk';
  if (/shoulder|elbow|forearm|wrist|hand|finger|thumb|index|\barm\b/.test(s)) return 'arm';
  if (/neck|brow|eye|face|lip|jaw|tongue|mouth|larynx|swallow/.test(s)) return 'face';
  return 'other';
}

/** The required left-arm label (round 3, R17: ns-text plain wording, "Left arm (brain’s right half)"). */
export const LEFT_ARM_LABEL = NsText.LEFT_ARM_LABEL;

/** On-brain group label text for a label group key and hemisphere, or null (SCAN and unknown groups carry no group
 * label; the info overlay explains them when looked at). */
export function regionGroupLabel(key, hemisphere) {
  // Round 3 (R17): ns-text plain group labels ("Right leg (brain’s left half)"); null for SCAN / unknown groups.
  return NsText.regionGroupLabel(key, hemisphere);
}

/** Label groups of a segmentation's regions: [{ key, hemisphere, text, isLeftArm, regionIds, anchor (source mm, the
 * area-weighted mean of the member regions' byHemisphere anchors), areaMm2 }], left-arm group first. */
export function regionLabelGroups(regions) {
  const groups = new Map();
  for (const r of regions || []) {
    const key = regionGroupKey(r);
    for (const h of ['right', 'left']) {
      const b = r && r.byHemisphere ? r.byHemisphere[h] : null;
      if (!b || !(b.areaMm2 > 0) || !b.anchor) continue;
      const text = regionGroupLabel(key, h);
      if (!text) continue;
      const gk = `${h}|${key}`;
      let g = groups.get(gk);
      if (!g) { g = { key, hemisphere: h, text, isLeftArm: key === 'leftArm', regionIds: [], sum: [0, 0, 0], areaMm2: 0 }; groups.set(gk, g); }
      g.regionIds.push(r.id);
      for (let i = 0; i < 3; i++) g.sum[i] += b.anchor[i] * b.areaMm2;
      g.areaMm2 += b.areaMm2;
    }
  }
  return [...groups.values()].map(g => ({
    key: g.key, hemisphere: g.hemisphere, text: g.text, isLeftArm: g.isLeftArm, regionIds: g.regionIds,
    anchor: g.sum.map(x => x / g.areaMm2), areaMm2: g.areaMm2
  })).sort((a, b) => (b.isLeftArm - a.isLeftArm) || (a.hemisphere < b.hemisphere ? 1 : a.hemisphere > b.hemisphere ? -1 : 0));
}

/** Orbit arrow buttons (R12): size, a gap of gapCm on screen (CSS reference 96 px per inch) outside the brain's
 * projected bounds, margins, the crosshair hit padding, glyphs and accessible labels. */
/** Round-2 fix F4 (R16): a click on an orbit arrow is one full step; holding it (or holding a mouse button while the
 * crosshair is on it) keeps orbiting gently: stepDeg every everyMs after delayMs. Display choices; ns-app mirrors
 * them for the crosshair hold. */
/** Hold-to-orbit (R16 "slightly shift orbit"): after delayMs, stepDeg every everyMs. R3-fix (review F9 / m4): 1.2 deg per
 * 100 ms = 12 deg/s (was 30 deg/s, which swept the whole 60 deg range in about 2 s); a click stays one 15 deg step. */
export const ORBIT_HOLD = Object.freeze({ delayMs: 300, everyMs: 100, stepDeg: 1.2, maxStepsPerFrame: 5 });
export const ORBIT_ARROWS = Object.freeze({
  gapCm: 1.5, pxPerCm: 96 / 2.54, sizePx: 44, marginPx: 10, hitPadPx: 4, minVisibleFrac: 0.2, minOnScreenFrac: 0.06,
  dirs: Object.freeze(['forward', 'back', 'left', 'right']),
  glyph: Object.freeze({ forward: '▲', back: '▼', left: '◀', right: '▶' }),
  /** Polish (R16/R17): short plain hover captions shown beside each arrow. R5-integrate-core (R5-text W5): the 3D arrows'
   * words, ns-text ARROWS.brain ("Turn your view toward the front" ...; no "curved"), else the round-4 ORBIT words. */
  tip: dirText((NS_TEXT.ARROWS && NS_TEXT.ARROWS.brain && NS_TEXT.ARROWS.brain.tip) || NS_TEXT.ORBIT.tip),
  label: dirText((NS_TEXT.ARROWS && NS_TEXT.ARROWS.brain && NS_TEXT.ARROWS.brain.label) || NS_TEXT.ORBIT.label)
});

/** True when the projected brain bounds { x0, y0, x1, y1 } (CSS px) overlap at least minVisibleFrac of the free
 * width (0..freeW) AND of the free height (topPx..freeH) (pure). */
export function brainBoundsVisible(b, freeW, freeH, topPx = 0, frac = ORBIT_ARROWS.minVisibleFrac) {
  if (!b || ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) || !(freeW > 0 && freeH > topPx)) return false;
  const w = Math.min(b.x1, freeW) - Math.max(b.x0, 0), h = Math.min(b.y1, freeH) - Math.max(b.y0, topPx);
  return w >= frac * freeW && h >= frac * (freeH - topPx);
}

/** Arrow centres (CSS px) for the brain's projected bounds { x0, y0, x1, y1 } (CSS px; may exceed the viewport): left /
 * right at the vertical centre and forward (anterior = screen top) / back at the horizontal centre of the VISIBLE part
 * of the bounds, each gapPx outside the bounds, then clamped into the free viewport (margins, the top band, the
 * reserved right column and bottom band). Clamped arrows that would overlap are separated along the edge. null without
 * bounds. Each entry: { x, y, clamped }. */
export function orbitArrowLayout(bounds, { width, height } = {}, {
  gapPx = ORBIT_ARROWS.gapCm * ORBIT_ARROWS.pxPerCm, sizePx = ORBIT_ARROWS.sizePx, marginPx = ORBIT_ARROWS.marginPx,
  reserveRightPx = 0, topPx = 0, bottomPx = 0
} = {}) {
  if (!bounds || !(width > 0 && height > 0) || ![bounds.x0, bounds.y0, bounds.x1, bounds.y1].every(Number.isFinite)) return null;
  const h = sizePx / 2;
  const right = width - reserveRightPx, bottom = height - bottomPx;
  const xMin = marginPx + h, xMax = Math.max(xMin, right - marginPx - h);
  const yMin = Math.max(marginPx, topPx) + h, yMax = Math.max(yMin, bottom - marginPx - h);
  // Centre lines from the visible part of the bounds (the giant brain usually overflows the view).
  const vx0 = Math.max(bounds.x0, 0), vx1 = Math.min(bounds.x1, right), vy0 = Math.max(bounds.y0, topPx), vy1 = Math.min(bounds.y1, bottom);
  const cx = clampTo(vx1 > vx0 ? (vx0 + vx1) / 2 : (bounds.x0 + bounds.x1) / 2, xMin, xMax);
  const cy = clampTo(vy1 > vy0 ? (vy0 + vy1) / 2 : (bounds.y0 + bounds.y1) / 2, yMin, yMax);
  const at = (x, y) => { const X = clampTo(x, xMin, xMax), Y = clampTo(y, yMin, yMax); return { x: X, y: Y, clamped: X !== x || Y !== y }; };
  // Round-2 fix F2: forward / back sit on the brain's PROJECTED CENTRE column (bounds.cx, else the bounds' centre),
  // not the centre of the clipped visible span: then turning to the brain's midline and looking past its front or
  // back edge brings them under the crosshair (with the pointer captured the crosshair is the only pointer).
  const midX = Number.isFinite(bounds.cx) ? bounds.cx : (bounds.x0 + bounds.x1) / 2;
  const out = {
    left: at(bounds.x0 - gapPx - h, cy), right: at(bounds.x1 + gapPx + h, cy),
    forward: at(midX, bounds.y0 - gapPx - h), back: at(midX, bounds.y1 + gapPx + h), sizePx
  };
  // Separate overlapping buttons (possible only when several are clamped into one corner): move forward / back along x.
  const sep = sizePx + 6;
  for (const v of ['forward', 'back']) for (const s of ['left', 'right']) {
    const a = out[v], b = out[s];
    if (Math.abs(a.x - b.x) < sep && Math.abs(a.y - b.y) < sep) {
      const dir = s === 'left' ? 1 : -1;
      const x = clampTo(b.x + dir * sep, xMin, xMax);
      out[v] = { x, y: a.y, clamped: true };
      if (Math.abs(x - b.x) < sep) out[v] = { x: a.x, y: clampTo(b.y + (v === 'forward' ? sep : -sep), yMin, yMax), clamped: true };
    }
  }
  return out;
}

/** Simple label de-collision (pure): boxes [{ x, y, w, h }] (centre-anchored CSS px) in priority order; a box that
 * overlaps an earlier placed box is moved down (then up) by its height + 2 px, up to `tries` times. Returns the new
 * centres [{ x, y }]. */
export function separateLabels(boxes, tries = 3, fixed = []) {
  const placed = fixed.map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h }));
  const hit = (b, y) => placed.some(p => Math.abs(b.x - p.x) < (b.w + p.w) / 2 && Math.abs(y - p.y) < (b.h + p.h) / 2);
  return boxes.map(b => {
    let y = b.y;
    if (b.skip) return { x: b.x, y };
    for (let i = 1; i <= tries && hit(b, y); i++) {
      const down = b.y + i * (b.h + 2), up = b.y - i * (b.h + 2);
      y = !hit(b, down) ? down : !hit(b, up) ? up : down;
    }
    placed.push({ x: b.x, y, w: b.w, h: b.h });
    return { x: b.x, y };
  });
}

/** The arrow under CSS point (x, y) for an orbitArrowLayout (hit box = the button padded by padPx), or null. */
export function orbitArrowHit(layout, x, y, padPx = ORBIT_ARROWS.hitPadPx) {
  if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const r = layout.sizePx / 2 + padPx;
  for (const d of ORBIT_ARROWS.dirs) { const p = layout[d]; if (p && Math.abs(x - p.x) <= r && Math.abs(y - p.y) <= r) return d; }
  return null;
}

/** Slide a centre-anchored square button (size px) along `axis` ('x' | 'y') in steps until it no longer overlaps any of
 * `rects` ({ x0, y0, x1, y1 } CSS px), staying within [lo, hi]; returns the new { x, y } (unchanged when already clear or
 * when no clear spot exists within maxSteps). Pure. */
export function nudgeClear(p, axis, size, rects, lo, hi, step = 24, maxSteps = 12) {
  const h = size / 2 + 3;
  const clear = (x, y) => !rects.some(r => x + h > r.x0 && x - h < r.x1 && y + h > r.y0 && y - h < r.y1);
  if (!rects.length || clear(p.x, p.y)) return { x: p.x, y: p.y };
  for (let k = 1; k <= maxSteps; k++) for (const sgn of [1, -1]) {
    const v = (axis === 'x' ? p.x : p.y) + sgn * k * step;
    if (v < lo || v > hi) continue;
    const x = axis === 'x' ? v : p.x, y = axis === 'y' ? v : p.y;
    if (clear(x, y)) return { x, y };
  }
  return { x: p.x, y: p.y };
}

/* ------------------------------------------------------------------ R3-scene: silhouette, arrows, labels, outlines */

/** K unit directions spread evenly over the sphere (Fibonacci lattice): flat Float64Array [x, y, z, ...] (pure). */
export function sphereDirections(k = 320) {
  const n = Math.max(6, k | 0), out = new Float64Array(3 * n), g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n, r = Math.sqrt(Math.max(0, 1 - z * z)), a = g * i;
    out[3 * i] = r * Math.cos(a); out[3 * i + 1] = r * Math.sin(a); out[3 * i + 2] = z;
  }
  return out;
}

/** R3-scene silhouette basis (pure). For each direction of `dirs` the point with the largest projection over every point
 * list (flat xyz arrays, e.g. every glass and strip vertex in source mm) is a vertex of the 3D convex hull. Seen from a
 * camera outside the brain, the 2D convex hull of these projected support points is the projected convex hull of the
 * whole brain, up to the direction spacing (about R x (1 - cos(theta)), theta ~ 0.6 x sqrt(4 pi / K): K = 320 gives
 * about 0.6 % of the brain radius, well inside the arrow gap). Returns { points: Float32Array xyz (deduplicated),
 * support: Float64Array (the support value per direction), dirs }. */
export function supportPoints(lists, dirs = sphereDirections()) {
  const k = dirs.length / 3;
  const best = new Float64Array(k).fill(-Infinity);
  const bi = new Int32Array(k).fill(-1), bl = new Int32Array(k).fill(-1);
  const L = (lists || []).filter(P => P && P.length >= 3);
  for (let li = 0; li < L.length; li++) {
    const P = L[li];
    for (let i = 0; i + 2 < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      for (let j = 0, d = 0; j < k; j++, d += 3) {
        const s = x * dirs[d] + y * dirs[d + 1] + z * dirs[d + 2];
        if (s > best[j]) { best[j] = s; bi[j] = i; bl[j] = li; }
      }
    }
  }
  const seen = new Set(), pts = [];
  for (let j = 0; j < k; j++) {
    if (bl[j] < 0) continue;
    const key = `${bl[j]}:${bi[j]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const P = L[bl[j]], i = bi[j];
    pts.push(P[i], P[i + 1], P[i + 2]);
  }
  return { points: Float32Array.from(pts), support: best, dirs };
}

/** 2D convex hull (Andrew's monotone chain) of flat [x0, y0, x1, y1, ...]: flat Float64Array of the hull vertices,
 * every turn positive in the given axes (so a point p is inside when cross(a, b, p) >= 0 for every edge a -> b). Pure. */
export function convexHull2d(xy) {
  const n = (xy && xy.length) >> 1;
  if (n === 0) return new Float64Array(0);
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xy[2 * a] - xy[2 * b] || xy[2 * a + 1] - xy[2 * b + 1]);
  const cross = (o, a, b) => (xy[2 * a] - xy[2 * o]) * (xy[2 * b + 1] - xy[2 * o + 1]) - (xy[2 * a + 1] - xy[2 * o + 1]) * (xy[2 * b] - xy[2 * o]);
  const lower = [], upper = [];
  for (const i of idx) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop(); lower.push(i); }
  for (let t = n - 1; t >= 0; t--) { const i = idx[t]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop(); upper.push(i); }
  lower.pop(); upper.pop();
  const h = lower.concat(upper);
  if (h.length === 0) h.push(idx[0]);
  const out = new Float64Array(2 * h.length);
  h.forEach((i, k) => { out[2 * k] = xy[2 * i]; out[2 * k + 1] = xy[2 * i + 1]; });
  return out;
}

/** Signed distance from (x, y) to a convexHull2d polygon (pure): negative inside, positive outside (px when the hull is in
 * px). A degenerate hull (1-2 vertices) is treated as a point / segment. */
export function hullSignedDistance(hull, x, y) {
  const n = hull.length >> 1;
  if (n === 0) return Infinity;
  let dmin = Infinity, inside = n >= 3;
  for (let i = 0; i < n; i++) {
    const ax = hull[2 * i], ay = hull[2 * i + 1];
    const j = (i + 1) % n, bx = hull[2 * j], by = hull[2 * j + 1];
    const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey;
    if (n >= 3 && ex * (y - ay) - ey * (x - ax) < 0) inside = false;
    const t = L2 > 0 ? clampTo(((x - ax) * ex + (y - ay) * ey) / L2, 0, 1) : 0;
    const d = Math.hypot(x - ax - t * ex, y - ay - t * ey);
    if (d < dmin) dmin = d;
  }
  return inside ? -dmin : dmin;
}

/** R4-integrator (D7 "the guide never covers the brain"): does an axis-aligned rect { x0, y0, x1, y1 } overlap a
 * convexHull2d polygon (same units)? Separating-axis test over the rect's two axes and the hull's edge normals; touching
 * edges count as no overlap. Pure. */
export function rectHitsConvexHull(hull, rect) {
  const n = hull ? hull.length >> 1 : 0;
  if (n === 0 || !rect || ![rect.x0, rect.y0, rect.x1, rect.y1].every(Number.isFinite)) return false;
  let hx0 = Infinity, hx1 = -Infinity, hy0 = Infinity, hy1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = hull[2 * i], y = hull[2 * i + 1]; if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; if (y < hy0) hy0 = y; if (y > hy1) hy1 = y; }
  if (hx1 <= rect.x0 || hx0 >= rect.x1 || hy1 <= rect.y0 || hy0 >= rect.y1) return false;
  if (n < 3) return true;
  const cs = [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1]];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, nx = hull[2 * j + 1] - hull[2 * i + 1], ny = -(hull[2 * j] - hull[2 * i]);
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (let k = 0; k < n; k++) { const d = nx * hull[2 * k] + ny * hull[2 * k + 1]; if (d < p0) p0 = d; if (d > p1) p1 = d; }
    for (const [x, y] of cs) { const d = nx * x + ny * y; if (d < q0) q0 = d; if (d > q1) q1 = d; }
    if (p1 <= q0 || q1 <= p0) return false;
  }
  return true;
}

/** R4-integrator (D7): where the "Try this" line goes while the brain covers its place in the status card: a small chip
 * of chipMaxW x chipH CSS px (about the card line's width) inside the usable view (`usable`, CSS px { x0, y0, x1, y1 }:
 * left of the information column, above the portrait band). Candidates, in order: bottom right, bottom centre, top right,
 * top centre, bottom left (the bottom row stays above a bottomReservePx row kept for the look-around toast; the top left
 * is the status card itself). `clear(rect)` says whether a box is free (of the brain, the arrows ...).
 * Returns { x, y, w, h } or null when no spot is clear (the line then is not drawn). Pure. */
export const GUIDE_FLOAT = Object.freeze({ chipMaxW: 280, gapPx: 12, bottomReservePx: 48 });
export function guideFloatSpot({ usable, chipH = 40, clear = () => true, o = GUIDE_FLOAT, preferTop = false, prefer = null } = {}) {
  if (!usable || ![usable.x0, usable.y0, usable.x1, usable.y1].every(Number.isFinite)) return null;
  const g = o.gapPx, w = Math.min(o.chipMaxW, usable.x1 - usable.x0 - 2 * g), h = Math.max(1, chipH);
  if (!(w > 80) || !(usable.y1 - usable.y0 > h + 2 * g)) return null;
  const cx = (usable.x0 + usable.x1) / 2 - w / 2, xl = usable.x0 + g, xr = usable.x1 - g - w;
  const yb = usable.y1 - o.bottomReservePx - h, yt = usable.y0 + g;
  // R4-polish: looking down (preferTop), the legs you are watching fill the bottom of the view, so the top spots come
  // first (run-R4-polish-0-baseline 09b: the chip sat on the moving right knee).
  const order = preferTop ? [[xr, yt], [cx, yt], [xr, yb], [cx, yb], [xl, yb]] : [[xr, yb], [cx, yb], [xr, yt], [cx, yt], [xl, yb]];
  // R4-fix (review RP9): the spot the chip already has comes first while it stays clear, so the line does not jump
  // between screen places during one goal (prefer = { x, y } of the last chip).
  if (prefer && Number.isFinite(prefer.x) && Number.isFinite(prefer.y)) order.unshift([prefer.x, prefer.y]);
  for (const [x, y] of order) {
    const r = { x0: x, y0: y, x1: x + w, y1: y + h };
    if (y >= usable.y0 && clear(r)) return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }
  return null;
}

/** R3-scene arrow rules (display choices). gap: "a centimetre or a few centimetres" off the brain, read as gapCm on screen
 * (CSS 96 px/in) and kept within gapMinFrac..gapMaxFrac of the view WIDTH (round-3 decision D1(d): roughly 2-6 %).
 * maxLookDeg: an arrow should be reachable by the crosshair with |yaw| and |pitch| <= maxLookDeg (D1(c)/(d)).
 * slideStepPx: candidate spacing when an arrow slides along its side of the brain to clear an obstacle. */
/** Fallback distance (m) of the arrows' world anchors when the transform has no pivot (they are directions). */
export const BRAIN_ANCHOR_DIST_FALLBACK_M = 6;
// R4-integrator (R4-player 1.6): separationPx 8 -> 24 (half an arrow between two arrows): at 2560x1080 the forward and
// left arrows sat 11 px apart at the top-left corner and read as one control (run-R4-integrator-2-shots).
// R4-fix (reviews F8 / RP7, "one arrow per side"): when the forward or back arrow has no clear spot on its own side
// (the brain fills the view's height) it goes beside a corner of the brain; a turn toward the LEFT costs
// cornerLeftCostFactor times more, so it takes a right-hand corner where it can. The left side holds the player's arm,
// the status card and the left arrow, and the forward and left arrows stacked at the top left (720x1280, 2560x1080).
export const ARROW_PLACEMENT = Object.freeze({ gapCm: 1.2, gapMinFrac: 0.03, gapMaxFrac: 0.055, slideStepPx: 6, maxLookDeg: 40, padPx: 4, separationPx: 24, cornerStepDeg: 5, cornerMaxDeg: 60, cornerCostPerDeg: 8, cornerLeftCostFactor: 1.6 });

/** The arrow gap in CSS px for a view width (pure): clamp(gapCm on screen, gapMinFrac x width, gapMaxFrac x width). */
export function arrowGapPx(width, o = ARROW_PLACEMENT) {
  return clampTo(o.gapCm * ORBIT_ARROWS.pxPerCm, o.gapMinFrac * width, o.gapMaxFrac * width);
}

/** The look (degrees, relative to the reference view) that puts CSS point (x, y) under the crosshair (pure): yaw is the
 * turn left/right, pitch up/down, for a pinhole camera with vertical half-angle tan = tanHalfFovY. */
export function lookForPoint(x, y, { width, height, tanHalfFovY = Math.tan(35 * DEG) }) {
  const a = ((2 * x) / width - 1) * tanHalfFovY * (width / height), b = (1 - (2 * y) / height) * tanHalfFovY;
  return { yawDeg: -Math.atan(a) / DEG, pitchDeg: Math.atan2(b, Math.hypot(a, 1)) / DEG };
}

/** R4-scene: the A/D x W/S sample grid of the player's arm for the arrow plan (ns-app armEnvelope: hand x at xSamples
 * points across the A/D range and depthSamples points across the W/S range, at the default look). */
export const ARM_ENVELOPE_GRID = Object.freeze({ xSamples: 9, depthSamples: 3 });

/** R4-scene: the arm's sweep envelope from a list of armAvoidShapes results (one per sampled pose; viewport fractions,
 * y down). Pure. Returns { poses: [{ rects, ellipses }], count } or null when no pose has a shape. */
export function armSweepEnvelope(shapeList) {
  const poses = [];
  for (const sh of Array.isArray(shapeList) ? shapeList : []) {
    if (!sh) continue;
    const rects = (sh.rects || []).filter(r => r && [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite)).map(r => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }));
    const ellipses = (sh.ellipses || []).filter(e => e && [e.cx, e.cy, e.rx, e.ry].every(Number.isFinite)).map(e => ({ cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry }));
    if (rects.length || ellipses.length) poses.push({ rects, ellipses });
  }
  return poses.length ? { poses, count: poses.length } : null;
}

/** How many sampled arm poses of an envelope cover box b (viewport fractions). Pure. */
export function armEnvelopeHits(b, envelope) {
  if (!envelope || !Array.isArray(envelope.poses)) return 0;
  let n = 0;
  for (const p of envelope.poses) if (hitsAvoid(b, p)) n++;
  return n;
}

/**
 * R3-scene orbit-arrow placement (pure; round-3 decision D2). hull: convexHull2d of the brain silhouette in CSS px (the
 * REFERENCE view: the default look carried with the brain), centre: { x, y } (the projected brain centre; default the hull
 * vertex mean). Each arrow is a disc of sizePx; its centre is pushed out from the brain along its own side (forward = up,
 * the anterior; back = down; left; right) until the disc is `gap` clear of the hull. Candidates slide along the side in
 * slideStepPx steps (alternating, nearest first). A candidate is CLEAR when the disc's box (+padPx) is fully on screen
 * (margins, below topPx), off every obstacle rect { x0, y0, x1, y1 } (info column, legend, HUD card, toast) and apart
 * from the arrows already placed; COMFORTABLE when the look that centres it is within maxLookDeg. Preference: clear and
 * comfortable, then clear, then fully off screen (reachable by looking, never under anything), then the least bad. When
 * the side has no clear spot, rays from the centre turned up to cornerMaxDeg toward a neighbouring side are tried (the
 * arrow then sits beside a corner of the brain). The arrow is NEVER inside the hull + gap: every candidate is pushed out
 * along its ray until it clears the hull by `gap`.
 * Returns { forward, back, left, right: { x, y, clear, onScreen, comfortable, look: { yawDeg, pitchDeg }, slidePx,
 * clearancePx (disc edge to hull) }, gapPx, sizePx } or null without a usable hull.
 */
export function placeOrbitArrows(hull, {
  width, height, centre = null, sizePx = ORBIT_ARROWS.sizePx, gapPx = null, marginPx = ORBIT_ARROWS.marginPx, topPx = 0,
  obstacles = [], tanHalfFovY = Math.tan(35 * DEG), rules = ARROW_PLACEMENT, order = ['forward', 'back', 'left', 'right'],
  soft = null, armEnvelope = null
} = {}) {
  const n = hull ? hull.length >> 1 : 0;
  if (n < 3 || !(width > 0 && height > 0)) return null;
  const gap = Number.isFinite(gapPx) ? gapPx : arrowGapPx(width, rules);
  const r = sizePx / 2, target = r + gap, pad = rules.padPx;
  // Default centre: the hull's AREA centroid (the vertex mean is biased toward densely sampled edges).
  let cx = 0, cy = 0, A = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = hull[2 * i], y = hull[2 * i + 1], j = (i + 1) % n, x2 = hull[2 * j], y2 = hull[2 * j + 1];
    const c = x * y2 - x2 * y;
    A += c; cx += (x + x2) * c; cy += (y + y2) * c;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (Math.abs(A) > 1e-9) { cx /= 3 * A; cy /= 3 * A; } else { cx = (minX + maxX) / 2; cy = (minY + maxY) / 2; }
  if (centre && Number.isFinite(centre.x) && Number.isFinite(centre.y) && hullSignedDistance(hull, centre.x, centre.y) < 0) { cx = centre.x; cy = centre.y; }
  const diam = Math.hypot(maxX - minX, maxY - minY) + target;
  const U = { forward: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] };
  const xLo = marginPx + r, xHi = width - marginPx - r, yLo = Math.max(marginPx, topPx) + r, yHi = height - marginPx - r;
  const placed = [];
  const out = { gapPx: gap, sizePx };
  const boxHits = (x, y, R) => obstacles.some(o => o && x + R > o.x0 && x - R < o.x1 && y + R > o.y0 && y - R < o.y1);
  const evaluate = (x, y, slide) => {
    const onScreen = x >= xLo && x <= xHi && y >= yLo && y <= yHi;
    const offScreen = x + r < 0 || x - r > width || y + r < 0 || y - r > height;
    const apart = placed.every(p => Math.hypot(p.x - x, p.y - y) >= 2 * r + rules.separationPx);
    const clear = onScreen && apart && !boxHits(x, y, r + pad);
    const look = lookForPoint(x, y, { width, height, tanHalfFovY });
    const comfortable = Math.abs(look.yawDeg) <= rules.maxLookDeg && Math.abs(look.pitchDeg) <= rules.maxLookDeg;
    // R3-polish (R3-player item 14): `soft` shapes (the player's arm at the default pose, viewport fractions as
    // hitsAvoid takes them) are avoided when a clear, comfortable spot exists off them (class 0); a spot on the arm is
    // class 0.5, still preferred to anything that is not clear or comfortable.
    const fb = { x0: (x - r) / width, y0: (y - r) / height, x1: (x + r) / width, y1: (y + r) / height };
    const onArm = Boolean(soft) && clear && hitsAvoid(fb, soft);
    // R4-scene: `armEnvelope` (armSweepEnvelope: the arm over its whole A/D x W/S range at the default look) is a
    // placement obstacle too. A clear, comfortable spot off EVERY sampled pose is class 0; when a side has none, the
    // consistent fallback is the clear, comfortable spot off the start pose that the FEWEST sampled poses cover (class
    // 0.25, ranked by armHits; the arrow then fades while the hand is actually over it and stays clickable).
    const armHits = armEnvelope && clear && comfortable ? armEnvelopeHits(fb, armEnvelope) : 0;
    const cls = clear && comfortable ? (onArm ? 0.5 : armHits > 0 ? 0.25 : 0) : clear ? 1 : offScreen && apart && comfortable ? 2 : offScreen && apart ? 3 : 4;
    return { x, y, clear, onScreen, offScreen, comfortable, look, slidePx: Math.abs(slide), cls, onArm, armHits };
  };
  const better = (c, b) => !b || c.cls < b.cls || (c.cls === b.cls && (c.armHits < b.armHits || (c.armHits === b.armHits && c.slidePx < b.slidePx)));
  for (const dir of order) {
    const [ux, uy] = U[dir], vx = uy === 0 ? 0 : 1, vy = uy === 0 ? 1 : 0;
    let best = null;
    const maxK = Math.ceil(diam / rules.slideStepPx);
    let goneUp = false, goneDown = false;
    for (let k = 0; k <= maxK && !(goneUp && goneDown); k++) {
      for (const sgn of k === 0 ? [1] : [1, -1]) {
        if ((sgn > 0 && goneUp) || (sgn < 0 && goneDown)) continue;
        const t = sgn * k * rules.slideStepPx;
        const bx = cx + t * vx, by = cy + t * vy;
        if (hullSignedDistance(hull, bx, by) >= 0) { if (sgn > 0) goneUp = true; else goneDown = true; continue; }
        // Distance to the hull is non-decreasing along the ray once it has left the convex hull: bracket, then bisect.
        let lo = 0, hi = diam;
        while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (hullSignedDistance(hull, bx + m * ux, by + m * uy) < target) lo = m; else hi = m; }
        // R4-fix (F8 / RP7): along the top or bottom side, a slide to the LEFT costs cornerLeftCostFactor times more
        // (the left holds the arm, the status card and the left arrow), so the forward / back arrow takes the right of
        // the brain's front / back when there is a clear spot there.
        const lf = (dir === 'forward' || dir === 'back') && t < 0 && Number.isFinite(rules.cornerLeftCostFactor) ? rules.cornerLeftCostFactor : 1;
        const c = evaluate(bx + hi * ux, by + hi * uy, t * lf);
        if (better(c, best)) best = c;
      }
      // candidates are visited nearest first; stop once nothing further out can cost less than the best clear one
      if (best && best.cls === 0 && k * rules.slideStepPx >= best.slidePx) break;
    }
    // Corner family: when the side itself has no clear spot (the brain fills the view in that direction), try rays from
    // the centre turned up to cornerMaxDeg toward either neighbouring side (e.g. the back arrow beside the brain's lower
    // corner). Ranked after the slide family by turn angle (cornerCostPerDeg px per degree).
    if (!best || best.cls > 0) {
      for (let a = rules.cornerStepDeg; a <= rules.cornerMaxDeg; a += rules.cornerStepDeg) {
        for (const sg of [1, -1]) {
          const t = sg * a * DEG, c0 = Math.cos(t), s0 = Math.sin(t);
          const rx = ux * c0 - uy * s0, ry = ux * s0 + uy * c0;
          let lo = 0, hi = diam;
          while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (hullSignedDistance(hull, cx + m * rx, cy + m * ry) < target) lo = m; else hi = m; }
          const leftTurn = (dir === 'forward' || dir === 'back') && rx < 0 ? (Number.isFinite(rules.cornerLeftCostFactor) ? rules.cornerLeftCostFactor : 1) : 1;
          const c = evaluate(cx + hi * rx, cy + hi * ry, a * rules.cornerCostPerDeg * leftTurn);
          c.turnDeg = sg * a;
          if (better(c, best)) best = c;
        }
        // Stop once nothing further round can cost less than the best clear, comfortable spot (R4-fix: a right-hand
        // corner a little further round can still beat a left-hand one).
        if (best && best.cls === 0 && a * rules.cornerCostPerDeg >= best.slidePx) break;
      }
    }
    if (!best) {
      const fx = cx + ux * (Math.max(maxX - cx, cx - minX, maxY - cy, cy - minY) + target), fy = cy + uy * (Math.max(maxX - cx, cx - minX, maxY - cy, cy - minY) + target);
      best = evaluate(fx, fy, 0);
    }
    best.clearancePx = hullSignedDistance(hull, best.x, best.y) - r;
    placed.push(best);
    out[dir] = best;
  }
  return out;
}

/** R3-scene label layout rules (display choices): at most maxShown labels (maxShownCompact on narrow / portrait views),
 * gapPx between boxes, ring offsets tried around each anchor (ringSteps rings; requiredRingSteps for required labels). */
export const LABEL_LAYOUT = Object.freeze({ maxShown: 5, maxShownCompact: 4, gapPx: 4, marginPx: 6, ringSteps: 2, requiredRingSteps: 5, requiredMaxRings: 2, sideCrossFrac: 0.15 });

/**
 * Label declutter (pure). items: [{ id, x, y (anchor, CSS px), w, h, priority (higher first), required }]; a label whose
 * anchor is off screen is hidden. Each label tries its anchor, then rings of offsets around it, and takes the first box
 * that is inside the view (margins, below topPx) and clear of every obstacle rect { x0, y0, x1, y1 } and of the labels
 * already placed (gapPx apart). A non-required label with no clear box, or beyond maxShown, is hidden; a required label
 * with no clear box keeps its least-overlapping candidate. Returns [{ id, x, y, shown, moved, faded }] in the items' order.
 * R4-fix (review RP1, blocker): an item may carry `side` { x0, y0, dxdy, sign }: the screen line x = x0 + (y - y0) dxdy
 * (the brain's projected midline) that its box must stay on (sign +1: right of it, -1: left of it; at most
 * rules.sideCrossFrac of its width may cross it, so on a phone, where one half of the brain is narrower than the tag,
 * it can still sit over its area), and
 * `maxRings` (default rules.requiredMaxRings for required labels): it never moves more than that many rings from its
 * anchor. A required label with no clear candidate inside those limits keeps its least-overlapping ALLOWED candidate
 * and is marked faded (drawn see-through) instead of jumping far away or onto the other half of the brain.
 */
export function declutterLabels(items, { width, height, topPx = 0, obstacles = [], maxShown = LABEL_LAYOUT.maxShown, rules = LABEL_LAYOUT } = {}) {
  const res = new Array(items.length);
  const order = items.map((it, i) => i).sort((a, b) => (items[b].required ? 1 : 0) - (items[a].required ? 1 : 0) || (items[b].priority || 0) - (items[a].priority || 0) || a - b);
  const placed = [];
  const g = rules.gapPx, m = rules.marginPx;
  const overlap = (b, o) => Math.max(0, Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0)) * Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0));
  let shown = 0;
  // R3-polish (INTEGRATION 7.1): one label per wording. Both brain halves have a "Belly and back" and a "Face and neck"
  // area; the same words twice on screen read as clutter, so a non-required label whose text is already shown is hidden.
  const shownText = new Set();
  for (const i of order) {
    const it = items[i];
    const onScreen = Number.isFinite(it.x) && Number.isFinite(it.y) && it.x >= 0 && it.x <= width && it.y >= topPx && it.y <= height;
    const dupText = !it.required && typeof it.text === 'string' && it.text !== '' && shownText.has(it.text);
    if (!onScreen || dupText || (!it.required && shown >= maxShown)) { res[i] = { id: it.id, x: it.x, y: it.y, shown: false, moved: false, faded: false }; continue; }
    const maxRings = Number.isFinite(it.maxRings) ? it.maxRings : it.required ? (Number.isFinite(rules.requiredMaxRings) ? rules.requiredMaxRings : rules.requiredRingSteps) : rules.ringSteps;
    const rings = Math.min(it.required ? rules.requiredRingSteps : rules.ringSteps, maxRings);
    const dy = it.h + g, dx = it.w / 2 + g;
    const cands = [[0, 0]];
    for (let k = 1; k <= rings; k++) cands.push([0, -k * dy], [0, k * dy], [-k * dx, 0], [k * dx, 0], [-k * dx, -k * dy], [k * dx, -k * dy], [-k * dx, k * dy], [k * dx, k * dy]);
    const sd = it.side && [it.side.x0, it.side.y0, it.side.dxdy].every(Number.isFinite) && (it.side.sign === 1 || it.side.sign === -1) ? it.side : null;
    let pick = null, bestBad = null;
    for (const [ox, oy] of cands) {
      const x = clampTo(it.x + ox, it.w / 2 + m, Math.max(it.w / 2 + m, width - it.w / 2 - m));
      const y = clampTo(it.y + oy, topPx + 2 + it.h / 2, Math.max(topPx + 2 + it.h / 2, height - m - it.h / 2));
      const b = { x0: x - it.w / 2 - g / 2, y0: y - it.h / 2 - g / 2, x1: x + it.w / 2 + g / 2, y1: y + it.h / 2 + g / 2 };
      // R4-fix (RP1): the clamped box must still be near its anchor and on its own side of the midline.
      if (Math.abs(x - it.x) > rings * dx + 0.5 || Math.abs(y - it.y) > rings * dy + 0.5) continue;
      if (sd) {
        const mx0 = sd.x0 + (b.y0 - sd.y0) * sd.dxdy, mx1 = sd.x0 + (b.y1 - sd.y0) * sd.dxdy;
        const cross = (Number.isFinite(rules.sideCrossFrac) ? rules.sideCrossFrac : 0) * it.w;
        if (sd.sign > 0 ? b.x0 + cross < Math.max(mx0, mx1) : b.x1 - cross > Math.min(mx0, mx1)) continue;
      }
      let bad = 0;
      for (const o of obstacles) if (o) bad += overlap(b, o);
      for (const p of placed) bad += overlap(b, p);
      if (bad === 0) { pick = { x, y, b }; break; }
      if (!bestBad || bad < bestBad.bad) bestBad = { x, y, b, bad };
    }
    let faded = false;
    if (!pick && it.required && bestBad) { pick = bestBad; faded = true; }
    if (!pick) { res[i] = { id: it.id, x: it.x, y: it.y, shown: false, moved: false, faded: false }; continue; }
    placed.push(pick.b);
    shown++;
    if (typeof it.text === 'string' && it.text !== '') shownText.add(it.text);
    res[i] = { id: it.id, x: pick.x, y: pick.y, shown: true, moved: pick.x !== it.x || pick.y !== it.y, faded };
  }
  return res;
}

/** R4-fix (review F2, R11c "so you can see which parts of the brain you've activated"): a switched-on area whose
 * outline covers less than areaPx CSS px² on screen (the medial toes, tongue, jaw and lower in-between slivers at the
 * default view: 0-41 changed pixels when marked, harness/run-R4-review-spec-4-marks) also gets a small gold ring at its
 * centre, drawn over the brain, so its mark does not depend on its drawn size. "Small" = the convex hull of
 * samplePoints of the region's vertices, projected with the live camera, covers less than areaFrac of the view
 * (1280x720: 2396 px²; there the medial toes measure 1720, the jaw 1452, the elbow 3386); re-measured every everyFrames
 * frames. Display choices (harness/run-R4-fix-6-shots markDots). */
export const SMALL_MARK = Object.freeze({ areaFrac: 0.0026, sizePx: 12, samplePoints: 160, everyFrames: 6 });
/** R4-fix (RP1): opacity of a required label drawn where it overlaps something (display choice). */
export const LABEL_FADED_OPACITY = 0.4;
/** R3-scene label font sizes (CSS px; mirrored by R3_SCENE_CSS) used for the label box estimates. */
export const R3_LABEL_FONT = Object.freeze({ otherPx: 13, leftArmPx: 14.5, subPx: 10.5, padXPx: 10, padYPx: 3 });
/** R3-scene injected stylesheet (larger, plainer labels). Selectors are one class stronger than neurosurge.css so they
 * apply now; the CSS owner can move these rules into neurosurge.css (R3-scene-NOTES.md wiring). */
export const R3_SCENE_CSS = [
  `.ns-region-label.ns-r3 { font-size: ${R3_LABEL_FONT.otherPx}px; padding: ${R3_LABEL_FONT.padYPx - 1}px ${R3_LABEL_FONT.padXPx - 1}px; max-width: none; white-space: nowrap; line-height: 1.3; }`,
  `.ns-region-label.ns-r3 .ns-region-label-hemi { display: block; font-size: ${R3_LABEL_FONT.subPx}px; font-weight: 600; opacity: 0.9; }`,
  `.ns-region-label.ns-r3.ns-region-label-leftarm { font-size: ${R3_LABEL_FONT.leftArmPx}px; padding: ${R3_LABEL_FONT.padYPx}px ${R3_LABEL_FONT.padXPx}px; border-radius: 12px; line-height: 1.25; }`,
  // R4-fix (RP1): a required label with no clear place near its area, on its own half, is drawn see-through there.
  `.ns-region-label.ns-r3[data-ns-faded="true"] { opacity: ${LABEL_FADED_OPACITY}; }`,
  // R4-fix (F2): the small-area switched-on marker: a gold ring (the mark colour) with a dark edge, never clickable.
  `.ns-mark-dot { position: absolute; width: ${SMALL_MARK.sizePx}px; height: ${SMALL_MARK.sizePx}px; margin: -${SMALL_MARK.sizePx / 2}px 0 0 -${SMALL_MARK.sizePx / 2}px; box-sizing: border-box; border-radius: 50%; border: 3px solid #ffc65c; box-shadow: 0 0 0 1.5px rgba(5, 7, 11, 0.9), inset 0 0 0 1px rgba(5, 7, 11, 0.6); pointer-events: none; z-index: 2; }`,
  // R5-scene (D16): the plain caption of a hovered 3D orbit arrow (the round-4 button caption look: dark text on gold).
  '.ns-arrow-tip { position: absolute; left: 0; top: 0; padding: 2px 8px; border-radius: 6px; white-space: nowrap; font: 600 11.5px/1.3 var(--ns-font, system-ui, sans-serif); color: #05070b; background: #ffe066; pointer-events: none; z-index: 3; }',
  '.ns-arrow-tip.ns-arrow-tip-mirror { background: #e8eef5; }'
].join('\n');
/** Label priority by group (higher shows first; the left-arm label is always shown). */
export const REGION_LABEL_PRIORITY = Object.freeze({ leftArm: 100, arm: 60, leg: 50, face: 40, trunk: 10, other: 0 });
/** Plain on-brain label { main, sub } for a label group { key, hemisphere } (pure; null for groups without a label). */
export function regionLabelDisplay(group) {
  if (!group) return null;
  const leftArm = group.key === 'leftArm' || group.isLeftArm === true;
  const key = leftArm ? 'leftArm' : group.key;
  // ns-text regionGroupLabel: "Part (brain's left half)": the part is the label, the bracket its smaller second line
  // (shown for the left-arm label only: fewer words on the brain; the info panel names the half for every area).
  const full = NS_TEXT.regionGroupLabel(key, group.hemisphere);
  if (!(typeof full === 'string' && full.trim())) return null;
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(full);
  const main = m ? m[1] : full, sub = m ? m[2] : '';
  return { main, sub: leftArm ? sub : '' };
}

/** Weld region parts by position (quantum, source mm): { pos: number[] xyz, nrm: Float64Array (area-weighted face normal
 * sums per welded vertex), counts: Map(edge key -> uses), SHIFT }. Shared by the outline builders. */
function weldParts(parts, quantum) {
  const ids = new Map(), pos = [], nrmList = [], counts = new Map(), tris = new Set();
  const SHIFT = 2 ** 22;
  for (const part of parts || []) {
    const P = part && part.positions, I = part && part.indices;
    if (!P || !I || I.length % 3 !== 0) continue;
    const local = new Int32Array(P.length / 3).fill(-1);
    const idOf = v => {
      if (local[v] >= 0) return local[v];
      const k = `${Math.round(P[3 * v] / quantum)},${Math.round(P[3 * v + 1] / quantum)},${Math.round(P[3 * v + 2] / quantum)}`;
      let id = ids.get(k);
      if (id === undefined) { id = pos.length / 3; ids.set(k, id); pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); nrmList.push(0, 0, 0); }
      local[v] = id;
      return id;
    };
    const add = (u, w) => { if (u === w) return; const k = u < w ? u * SHIFT + w : w * SHIFT + u; counts.set(k, (counts.get(k) || 0) + 1); };
    for (let t = 0; t < I.length; t += 3) {
      const a = idOf(I[t]), b = idOf(I[t + 1]), c = idOf(I[t + 2]);
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
      const tk = `${lo},${mid},${hi}`;
      if (tris.has(tk)) continue;
      tris.add(tk);
      add(a, b); add(b, c); add(c, a);
      const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2];
      const e1x = pos[3 * b] - ax, e1y = pos[3 * b + 1] - ay, e1z = pos[3 * b + 2] - az;
      const e2x = pos[3 * c] - ax, e2y = pos[3 * c + 1] - ay, e2z = pos[3 * c + 2] - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const v of [a, b, c]) { nrmList[3 * v] += nx; nrmList[3 * v + 1] += ny; nrmList[3 * v + 2] += nz; }
    }
  }
  return { pos, nrm: Float64Array.from(nrmList), counts, SHIFT };
}

/**
 * R3-scene SMOOTH territory outline (pure): the outline of the UNION of region parts (edges used once after welding, as
 * weldedBoundarySegments) chained into polylines, smoothed by `iterations` rounds of Chaikin corner cutting (the
 * segmentation follows triangle edges, so the raw outline zigzags like a low-poly wireframe), and lifted `liftMm` along
 * the surface normal so the smoothed chords stay in front of the surface they outline (the normal sign is oriented away
 * from `centre` by majority, so a consistently wound mesh lifts outward; or, with `liftDir` (a unit vector), straight
 * along it: the scene lifts toward the overhead viewer, source +z = superior). Chains shorter than minChainMm are dropped
 * (specks); long chains are first decimated (every `decimate`-th vertex). Returns Float32Array line-segment end points
 * [ax, ay, az, bx, by, bz, ...] (source mm).
 */
export function smoothTerritoryOutline(parts, { quantum = 1e-3, iterations = 2, liftMm = 0.6, minChainMm = 3, centre = null, decimate = 2, liftDir = null } = {}) {
  const { pos, nrm, counts, SHIFT } = weldParts(parts, quantum);
  const nV = pos.length / 3;
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const [k, c] of counts) {
    if (c !== 1) continue;
    const u = Math.floor(k / SHIFT), w = k % SHIFT;
    link(u, w); link(w, u);
  }
  if (!adj.size) return new Float32Array(0);
  // Normal orientation: majority of welded vertices away from the centre (default: the vertex mean).
  let c0 = centre;
  if (!c0) { c0 = [0, 0, 0]; for (let i = 0; i < nV; i++) for (let a = 0; a < 3; a++) c0[a] += pos[3 * i + a] / nV; }
  let vote = 0;
  for (let i = 0; i < nV; i++) vote += Math.sign(nrm[3 * i] * (pos[3 * i] - c0[0]) + nrm[3 * i + 1] * (pos[3 * i + 1] - c0[1]) + nrm[3 * i + 2] * (pos[3 * i + 2] - c0[2]));
  const sgn = vote < 0 ? -1 : 1;
  const unitN = v => { const x = nrm[3 * v], y = nrm[3 * v + 1], z = nrm[3 * v + 2], L = Math.hypot(x, y, z) || 1; return [sgn * x / L, sgn * y / L, sgn * z / L]; };
  // Chain the boundary graph: open chains from odd / branching vertices first, then closed loops.
  const used = new Set();
  const ek = (a, b) => (a < b ? a * SHIFT + b : b * SHIFT + a);
  const chains = [];
  const walk = (start, next) => {
    const chain = [start];
    used.add(ek(start, next));
    let cur = next;
    for (;;) {
      chain.push(cur);
      if (cur === start) break;
      const nb = adj.get(cur) || [];
      if (nb.length !== 2) break; // an end or a branch point: the chain stops here
      const w = nb.find(x => !used.has(ek(cur, x)));
      if (w === undefined) break;
      used.add(ek(cur, w));
      cur = w;
    }
    return { chain, closed: chain.length > 3 && chain[0] === chain[chain.length - 1] };
  };
  for (const [v, nb] of adj) if (nb.length !== 2) for (const w of nb) if (!used.has(ek(v, w))) chains.push(walk(v, w));
  for (const [v, nb] of adj) for (const w of nb) if (!used.has(ek(v, w))) chains.push(walk(v, w));
  const out = [];
  for (const { chain, closed } of chains) {
    let P = chain.map(v => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2], ...unitN(v)]);
    if (closed) P.pop();
    let len = 0;
    for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]);
    if (closed && P.length > 1) len += Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1], P[0][2] - P[P.length - 1][2]);
    if (len < minChainMm || P.length < 2) continue;
    // Low-pass first: keep every `decimate`-th vertex of a long chain (the zigzag is at triangle-edge scale), always
    // keeping an open chain's end points; then Chaikin rounds.
    if (decimate > 1 && P.length > 4 * decimate) {
      const Q = P.filter((p, i) => i % decimate === 0);
      if (!closed && Q[Q.length - 1] !== P[P.length - 1]) Q.push(P[P.length - 1]);
      P = Q;
    }
    for (let it = 0; it < iterations && P.length >= 3; it++) {
      const Q = [];
      const m = closed ? P.length : P.length - 1;
      if (!closed) Q.push(P[0]);
      for (let i = 0; i < m; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        Q.push(a.map((x, k) => 0.75 * x + 0.25 * b[k]), a.map((x, k) => 0.25 * x + 0.75 * b[k]));
      }
      if (!closed) Q.push(P[P.length - 1]);
      P = Q;
    }
    const L = P.map(p => {
      if (liftDir) return [p[0] + liftMm * liftDir[0], p[1] + liftMm * liftDir[1], p[2] + liftMm * liftDir[2]];
      const nl = Math.hypot(p[3], p[4], p[5]) || 1;
      return [p[0] + liftMm * p[3] / nl, p[1] + liftMm * p[4] / nl, p[2] + liftMm * p[5] / nl];
    });
    const m = closed ? L.length : L.length - 1;
    for (let i = 0; i < m; i++) { const a = L[i], b = L[(i + 1) % L.length]; out.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
  }
  return Float32Array.from(out);
}

/** R3-scene groove cue (pure): a per-vertex "sulcal depth" for gyri/sulci shading. depth(p) = min over the support planes
 * of (support_j - dir_j . p): the distance from the vertex to the brain's convex hull (approximated by the planes of
 * supportPoints), in source mm. Crowns of gyri touch the hull (about 0 mm); grooves (sulci, the midline gap) are deeper.
 * Mapped to 0..1 with smoothstep(lo, hi, depth): 0 = crown, 1 = deep groove. Returns Float32Array(vertexCount). */
export function sulcalDepth(positions, support, { lo = 1.5, hi = 9 } = {}) {
  const P = positions, n = P.length / 3, out = new Float32Array(n);
  const s = support.support, d = support.dirs, k = s.length;
  for (let i = 0; i < n; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    let m = Infinity;
    for (let j = 0, q = 0; j < k; j++, q += 3) { const v = s[j] - (x * d[q] + y * d[q + 1] + z * d[q + 2]); if (v < m) m = v; }
    out[i] = smooth(lo, hi, m);
  }
  return out;
}

/* Column-major 4x4 helpers (Float64Array) for the body / face frames. */
const m4 = () => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function m4Mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[4 * c + r] = a[r] * b[4 * c] + a[4 + r] * b[4 * c + 1] + a[8 + r] * b[4 * c + 2] + a[12 + r] * b[4 * c + 3];
  return o;
}
const m4T = (x, y, z) => { const m = m4(); m[12] = x; m[13] = y; m[14] = z; return m; };
const m4S = s => { const m = m4(); m[0] = m[5] = m[10] = s; return m; };
const m4Rx = a => { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const m4Ry = a => { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
/** BodyParts3D source axes (+x subject LEFT, +y POSTERIOR, +z SUPERIOR) -> world (+x right, +y up, +z back): (-x, z, y),
 * det +1 (ns-math BP_TO_WORLD). */
const BP_AXES = Object.freeze([-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
const apply4 = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** Default eye (camera) position in BodyParts3D mm when the app gives no body frame: the shoulder-to-eye offsets ns-arm
 * documents (164 mm lateral, 214 mm below, 90 mm behind the eye) applied to the left humerus head cap centroid
 * (FJ3262, z >= zmax - 35 mm: 163.6, -79.8, 1315.4). An estimate; ns-arm armAttachment().bodyToWorld supersedes it. */
export const DEFAULT_EYE_BP = Object.freeze([0, -170, 1529]);

/** BodyParts3D mm -> world m with the eye at the origin, body turned by bodyYaw (rad, left-positive):
 * Ry(bodyYaw) BP_AXES 0.001 T(-eye). ns-math bodyToWorldMatrix when it exists (same definition), else this mirror. */
export function bodyFrameMatrix(eyeBp = DEFAULT_EYE_BP, bodyYaw = 0) {
  if (!eyeBp || eyeBp.length !== 3 || ![0, 1, 2].every(i => Number.isFinite(eyeBp[i]))) fail('scene_body', 'eyeBp must be a finite [x, y, z]');
  if (!Number.isFinite(bodyYaw)) fail('scene_body', 'bodyYaw must be finite');
  if (typeof NsMath.bodyToWorldMatrix === 'function') return Float64Array.from(NsMath.bodyToWorldMatrix([eyeBp[0], eyeBp[1], eyeBp[2]], bodyYaw));
  return m4Mul(m4Ry(bodyYaw), m4Mul(BP_AXES, m4Mul(m4S(0.001), m4T(-eyeBp[0], -eyeBp[1], -eyeBp[2]))));
}

/** Eye position (source mm) of a body frame matrix (the source point that maps to the world origin), or null. */
export function eyeFromBodyFrame(m) {
  if (!m || m.length !== 16 || !Array.prototype.every.call(m, Number.isFinite)) return null;
  // Solve A p = -t for the 3x3 linear part A (column-major).
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!(Math.abs(det) > 1e-18)) return null;
  const tx = -m[12], ty = -m[13], tz = -m[14];
  return [
    (tx * (e * i - f * h) - b * (ty * i - f * tz) + c * (ty * h - e * tz)) / det,
    (a * (ty * i - f * tz) - tx * (d * i - f * g) + c * (d * tz - ty * g)) / det,
    (a * (e * tz - ty * h) - b * (d * tz - ty * g) + tx * (d * h - e * g)) / det
  ];
}

/** Body part of a FULLBODY-MESH-MANIFEST entry: 'face' | 'neck' | 'torso' | 'legs' | 'rightArm' | 'leftArm' | 'other'
 * (from entry.region, else from the name). */
export const BODY_PART_OF_REGION = Object.freeze({
  right_arm: 'rightArm', left_arm: 'leftArm', torso: 'torso', pelvis: 'torso', right_leg: 'legs', left_leg: 'legs', head_face: 'face', neck: 'neck'
});
export const BODY_PARTS = Object.freeze(['torso', 'legs', 'rightArm', 'leftArm', 'neck', 'face']);
export function bodyPartOf(entry) {
  const r = entry && typeof entry.region === 'string' ? BODY_PART_OF_REGION[entry.region] : undefined;
  if (r) return r;
  const s = `${entry && (entry.label || entry.requested_structure || entry.name) || ''}`.toLowerCase();
  if (/skull|mandib|maxill|facial|frontal bone|zygomat|nasal|temporal bone/.test(s)) return 'face';
  if (/femur|tibia|fibula|patella|tars|foot|toe|thigh|calf|gastrocnem|soleus|quadriceps|vastus/.test(s)) return 'legs';
  if (/cervical|hyoid|sternocleidomastoid/.test(s)) return 'neck';
  if (/rib|stern|vertebra|sacrum|pelvi|hip bone|clavicle|scapula|abdomin|pectoral/.test(s)) return 'torso';
  if (/\bright\b/.test(s) && /humer|radius|ulna|carp|phalan|hand|forearm|arm/.test(s)) return 'rightArm';
  return 'other';
}
/** Only the exact validated original-packet girdle role can bypass facial-display displacement.
 * This is a rendering-domain classification, not anatomical/function/normal-mechanics acceptance. */
export function isBodyGirdleEntry(entry) {
  const id = entry && entry.element_id;
  const role = typeof id === 'string' ? SHOULDER_GIRDLE_INFO[id] : null;
  return Boolean(role && entry.source_packet === 'pov-demo-assets' && entry.girdle_body_role === 'left-shoulder-girdle' && entry.kind === role.kind);
}
/** 'bone' | 'muscle' for a manifest entry (kind, else tissue, else 'bone'). */
export function bodyKindOf(entry) {
  const k = entry && (entry.kind || entry.tissue);
  return k === 'muscle' ? 'muscle' : 'bone';
}
/** Display name of a body mesh: '<label> (<element id>)', e.g. 'right humerus (FJ3368)'. */
export function bodyMeshName(entry, id) {
  const label = entry && (entry.label || entry.requested_structure || entry.embedded_source_name || (Array.isArray(entry.matched_concept_names) && entry.matched_concept_names[0]));
  const eid = id || (entry && entry.element_id) || 'mesh';
  return `${label ? String(label) : 'body part'} (${eid})`;
}
/** Smallest distance (same units) from point p to any vertex of `positions` (every `stride`-th vertex). */
export function nearestDistance(positions, p, stride = 1) {
  let best = Infinity;
  const s = Math.max(1, stride | 0) * 3;
  for (let i = 0; i + 2 < positions.length; i += s) {
    const dx = positions[i] - p[0], dy = positions[i + 1] - p[1], dz = positions[i + 2] - p[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Face layer (body view, R7): FACE_VIEW_MODES 'ghost' | 'inset' | 'off'. In first person the own face cannot be seen,
 * so head/face meshes (and any body mesh within nearClearM of the eye) are never drawn around the camera:
 *  - 'ghost': a translucent front view of the facial skeleton and attached muscles (the same posed meshes), rotated to
 *    face the player (a rotation, never a mirror: det +1), scaled x scale and placed distanceM out along elevationDeg
 *    above the body's forward direction. It fades in only between pitchStartDeg and pitchFullDeg of camera pitch (look
 *    up), so it never appears in the forward view and never comes nearer than about distanceM - scale x head radius.
 *  - 'inset': the same front view in a labelled inset box (inset.sizePx, top centre) while looking up.
 *  - 'off': not drawn.
 * Display choices, not anatomy measurements. */
export const FACE_VIEW_MODES = Object.freeze(['ghost', 'inset', 'off']);
export const FACE_LAYER = Object.freeze({
  // Round 3 (R3-integrator, R3-brain wiring 5.4): the ghost fades in from 42 deg (full at 55 deg), above the band of
  // comfortable looks (<= 40 deg) where the whole brain, its front edge (about 32 deg) and the forward orbit arrow sit;
  // at 26 deg it covered the forward arrow with its caption. "Look up high enough" still shows the face.
  pitchStartDeg: 42, pitchFullDeg: 55, elevationDeg: 60, distanceM: 1.3, scale: 2.8, nearClearM: 0.12,
  // R3-scene: the face layer now draws only its nearest surface (depth pre-pass), so one layer must carry the look on its
  // own: bone 0.36 -> 0.6, muscle 0.55 -> 0.7 (display choices).
  boneOpacity: 0.6, muscleOpacity: 0.7, minDistanceM: 0.5,
  inset: Object.freeze({ sizePx: 220, sizeVmin: 32, fovDeg: 30, marginPx: 10, background: 0x0b1018 }),
  // R3-scene (D3/D4): plainer, shorter wording; the same three honesty points (moved, not a mirror, no face muscles).
  ghostLabel: NS_TEXT.FACE.ghostLabel,
  insetLabel: NS_TEXT.FACE.insetLabel
});
/** Face layer visibility 0..1 for a camera pitch (rad): smoothstep(pitchStartDeg, pitchFullDeg). */
export function faceLayerAmount(pitch, o = FACE_LAYER) {
  return Number.isFinite(pitch) ? smooth(o.pitchStartDeg * DEG, o.pitchFullDeg * DEG, pitch) : 0;
}
/** Ghost face transform (BodyParts3D mm -> world m, column-major Float64Array(16)):
 * Ry(bodyYaw) T(distanceM (0, sin e, -cos e)) Rx(e) Ry(pi) S(scale) BP_AXES 0.001 T(-headCentreBp), e = elevationDeg.
 * The face's anterior points back at the eye (world origin); det +1 (not mirrored). */
export function faceGhostMatrix({ headCentreBp, bodyYaw = 0, elevationDeg = FACE_LAYER.elevationDeg, distanceM = FACE_LAYER.distanceM, scale = FACE_LAYER.scale } = {}) {
  if (!headCentreBp || headCentreBp.length !== 3 || ![0, 1, 2].every(i => Number.isFinite(headCentreBp[i]))) fail('scene_face', 'headCentreBp must be a finite [x, y, z]');
  const e = elevationDeg * DEG;
  const place = m4T(0, distanceM * Math.sin(e), -distanceM * Math.cos(e));
  const local = m4Mul(m4Rx(e), m4Mul(m4Ry(Math.PI), m4Mul(m4S(scale * 0.001), m4Mul(BP_AXES, m4T(-headCentreBp[0], -headCentreBp[1], -headCentreBp[2])))));
  return m4Mul(m4Ry(bodyYaw), m4Mul(place, local));
}
/** Inset face transform: the head centre at (0, 0, -distanceM) facing +z (toward an inset camera at the origin). */
export function faceInsetMatrix({ headCentreBp, distanceM }) {
  if (!headCentreBp || headCentreBp.length !== 3) fail('scene_face', 'headCentreBp must be [x, y, z]');
  return m4Mul(m4T(0, 0, -distanceM), m4Mul(m4Ry(Math.PI), m4Mul(m4S(0.001), m4Mul(BP_AXES, m4T(-headCentreBp[0], -headCentreBp[1], -headCentreBp[2])))));
}

/** Torso see-through window (body view, display only). From the eye, the BodyParts3D chest (anterior surface about
 * y = -214 mm) lies in front of the line of sight to the feet (toes about y = -236 mm, eye about y = -170 mm), so
 * looking straight down shows only the chest. While the pitch is below -pitchStartDeg (fully at -pitchFullDeg) the
 * torso and neck meshes drawn in place become a dithered see-through window around the view centre (the same shader
 * as the arm ghost: radiusFrac x min(viewport), soft edge; the silhouette rim band is narrow because from above almost
 * the whole chest is seen at a grazing angle), so the legs show through the trunk. Round-2 fix F3: fill 0.12 -> 0.4,
 * so the torso inside the window still reads as a translucent layer (40 % of its fragments drawn) instead of a sparse
 * dot pattern, while the legs show through the rest. Geometry, posing and picking are unchanged.
 * R3-scene: NO LONGER DRAWN (the dither is replaced by the smooth BODY_TRANSLUCENT layer with a depth pre-pass); the
 * object and bodySeeThroughAmount stay exported for compatibility (the pitch ramp is the same 40 -> 60 deg). */
export const BODY_SEE_THROUGH = Object.freeze({
  pitchStartDeg: 40, pitchFullDeg: 60, radiusFrac: 0.46, lowerFrac: 0.3, edge: 0.55, fill: 0.4, rimLo: 0.015, rimHi: 0.06,
  rimColor: Object.freeze([0.42, 0.40, 0.52]), easeS: 0.12
});
/** See-through amount 0..1 for a camera pitch (rad, negative = looking down). */
export function bodySeeThroughAmount(pitch, o = BODY_SEE_THROUGH) {
  return Number.isFinite(pitch) ? smooth(o.pitchStartDeg * DEG, o.pitchFullDeg * DEG, -pitch) : 0;
}

/** Rest drive of a body muscle with no simulated drive (= ns-arm MUSCLE_BASELINE_DRIVE, the left arm's baseline). */
export const MUSCLE_REST_DRIVE = 0.08;

/** Far-right information overlay (R14) layout mirror of the CSS (.ns-infopanel): column width min(colPx, colVw vw),
 * the bottom panel height in portrait (portraitVh), and how many caveats / citations are listed. */
// Round-2 fix V1: colMaxVh 58 -> 66 so every required field (plain lead, simulated, known, caveat, body part, movement,
// muscles, pathway) fits at 1280x720; the legend under it uses its compact key at heights <= 820 px (CSS).
// Round 3 (D3): at most maxRows value rows show by default; the rest of the card is behind a collapsed More detail.
export const INFO_PANEL = Object.freeze({ colPx: 300, colVw: 25, gapPx: 12, portraitVh: 36, maxCaveats: 2, maxCitations: 4, colMaxVh: 66, maxRows: 4 });
/** R3-integrator: in portrait the top of the bottom band holds the legend (right) and the drag-to-look toast (left); the
 * information panel below them is capped to the band minus this height (CSS mirror --ns-portrait-legend-reserve). */
export const INFO_PANEL_PORTRAIT_LEGEND_PX = 172; // R3-fix (SL-3): room for the legend's map qualifier in portrait

/** Panel rectangle (CSS px) the info overlay occupies for a viewport: the far-right column (wide / compact) or a bottom
 * band (portrait). Other HUD elements and the orbit arrows avoid it. */
export function infoPanelRect({ width, height } = {}, topPx = 0) {
  if (!(width > 0 && height > 0)) return null;
  const g = INFO_PANEL.gapPx;
  if (width / height < 1) {
    const h = (INFO_PANEL.portraitVh / 100) * height;
    return { x0: g, y0: height - g - h, x1: width - g, y1: height - g, layout: 'portrait' };
  }
  const w = Math.min(INFO_PANEL.colPx, (INFO_PANEL.colVw / 100) * width);
  // Integration: the column is at most colMaxVh of the height (CSS mirror --ns-info-col-maxvh), so a compact HUD card
  // can sit under it instead of over the left arm.
  const y0 = Math.max(g, topPx);
  return { x0: width - g - w, y0, x1: width - g, y1: Math.min(height - g, Math.max(30, y0) + (INFO_PANEL.colMaxVh / 100) * height), layout: 'column' };
}

/** Plain-language row headings of the info overlay (round 3: ns-text INFO.rows, R17/D3). */
export const INFO_ROW_LABELS = NsText.INFO.rows;
/** Stable CSS/QA slugs of the rows (ns-infopanel-key-<slug> / ns-infopanel-row-<slug>). */
const ROW_SLUG = Object.freeze({
  [INFO_ROW_LABELS.bodyPart]: 'body', [INFO_ROW_LABELS.movement]: 'movement', [INFO_ROW_LABELS.agonists]: 'muscles',
  [INFO_ROW_LABELS.antagonists]: 'easing', [INFO_ROW_LABELS.pathway]: 'pathway'
});
/** How many muscle names a row lists before "(+N more)" (the full lists stay in QA info() and the model). */
export const INFO_ROW_MAX = Object.freeze({ agonists: 3, antagonists: 2 });
/** Muscle list for a row, compacted (round-2 fix V1): a left/right pair becomes "masseter (both sides)", one shared
 * side prefix is written once ("biceps femoris, semitendinosus (left)"), and only the first n names are listed. */
export function compactMuscleNames(list, n) {
  const sideRe = /(^|\bof )(left|right) /;
  const merged = [], seen = new Map();
  for (const m of list) {
    const k = sideRe.exec(m);
    const base = k ? m.replace(sideRe, '$1') : null;
    if (base !== null && seen.has(base)) {
      const e = merged[seen.get(base)];
      if (e.side !== k[2]) { e.text = `${base} (both sides)`; e.side = 'both'; }
      continue;
    }
    if (base !== null) seen.set(base, merged.length);
    merged.push({ text: m, side: k ? k[2] : null, base });
  }
  const side = ['left', 'right'].find(sd => merged.length > 0 && merged.every(e => e.side === sd && e.text.startsWith(`${sd} `)));
  const names = merged.map(e => (side ? e.text.slice(side.length + 1) : e.text));
  const text = names.length > n ? `${names.slice(0, n).join(', ')} (+${names.length - n} more)` : names.join(', ');
  return side ? `${text} (${side})` : text;
}
const firstNames = compactMuscleNames;

/** Round 3 (D3): with the model's plain `card` (ns-app infoOverlayModel -> ns-text plainInfoCard) the panel shows the
 * lead, at most INFO_PANEL.maxRows rows and the short honesty lines; `more` { summary, items, explanation, note,
 * caveats, sources } is the collapsed "More detail" layer. Round-2 description of the remaining fields:
 * Plain display content of the info overlay for an ns-app infoOverlayModel (pure): { mode, leftArm, heading, title,
 * tag, viewed, plain, simulated, known, regionCaveat, rows: [[label, text]], activity: { value, text, css } | null,
 * activations, explanation, caveats: [..], moreCaveats, citations, key }. Round-2 fixes V1 / SCI-4: the short lines
 * (plain lead, simulated, known, the region's own caveat) come BEFORE the detail rows, and the long explanation comes
 * last ("More detail"), so every required field fits the column at 1280x720. Unknown or missing fields become empty. */
export function infoPanelContent(model) {
  if (!model || typeof model !== 'object') return null;
  const s = v => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v));
  const list = a => (Array.isArray(a) ? a.map(s).filter(Boolean) : []);
  const T = NsText.INFO;
  const leftArm = /left[- ]arm/i.test(s(model.tag));
  const hemi = model.hemisphere === 'right' ? 'right' : model.hemisphere === 'left' ? 'left' : '';
  const region = model.mode === 'region';
  const card = region && model.card && typeof model.card === 'object' ? model.card : null;
  const act = model.action && typeof model.action === 'object' ? model.action : null;
  const ag = list(model.agonists), an = list(model.antagonists).filter(m => !ag.includes(m));
  const v = Number.isFinite(model.activity) ? fin01(model.activity) : null;
  const caveats = list(model.caveats);
  const cites = Array.isArray(model.citations) ? model.citations.filter(c => c && s(c.key)) : [];
  const n = Number.isFinite(model.activations) ? model.activations : 0;
  const expl = s(model.explanation);
  const citations = cites.slice(0, INFO_PANEL.maxCitations).map(c => `${s(c.key)}${c.verified === true ? '' : T.unverified}`).join(' · ');
  let rows = [], plain = s(model.plain), simulated = region ? s(model.simulated) : '', known = region ? s(model.known) : '';
  let regionCaveat = region ? s(model.regionCaveat) : '', more = null;
  if (card) {
    // Round 3 (D3): the ns-text plain card. One lead sentence, at most INFO_PANEL.maxRows rows, the short honesty lines,
    // and everything technical (technical name, hemisphere, all muscle names, the full explanation, the action note,
    // the general caveats and the sources) in a collapsed "More detail".
    rows = (Array.isArray(card.rows) ? card.rows : []).filter(r => Array.isArray(r) && s(r[0]) && s(r[1])).map(r => [s(r[0]), s(r[1])]);
    plain = s(card.lead) || plain;
    simulated = s(card.simulated) || simulated;
    known = s(card.known) || known;
    regionCaveat = s(card.caveat);
    const cm = card.more && typeof card.more === 'object' ? card.more : {};
    const mus = cm.muscles && typeof cm.muscles === 'object' ? cm.muscles : {};
    const items = [];
    const tech = [s(cm.technicalName), s(cm.hemisphere), s(cm.effector)].filter(Boolean).join(' · ');
    if (tech) items.push([T.technicalName, tech]);
    if (s(cm.pathwayName) && T.rows.pathwayName) items.push([T.rows.pathwayName, s(cm.pathwayName)]); // R4-fix (RP12)
    const pull = list(mus.pull).length ? list(mus.pull) : ag, relax = list(mus.relax).length ? list(mus.relax) : an;
    if (pull.length) items.push([T.rows.agonists, pull.join(', ')]);
    if (relax.length) items.push([T.rows.antagonists, relax.join(', ')]);
    if (list(mus.steady).length) items.push([T.steadying, list(mus.steady).join(', ')]);
    more = {
      summary: s(cm.title) || T.moreDetail, items, explanation: s(cm.explanation) || expl, note: s(cm.note),
      caveats: list(cm.caveats).length ? list(cm.caveats) : caveats, sources: s(cm.sources) || (citations ? `${T.sourcesPrefix}${citations}` : '')
    };
  } else {
    // Without a card (legacy / movement-map models): the round-2 rows in plain words, capped at maxRows. In region
    // mode the technical name, body part and hemisphere, the long explanation, caveats and sources go to More detail.
    const part = s(model.bodyPart).split(/[:;]/)[0].trim();
    if (act && s(act.plainLabel || act.label)) rows.push([INFO_ROW_LABELS.movement, s(act.plainLabel || act.label)]);
    else if (region && model.region) rows.push([INFO_ROW_LABELS.movement, T.noMovement]);
    if (ag.length) rows.push([INFO_ROW_LABELS.agonists, firstNames(ag, INFO_ROW_MAX.agonists)]);
    if (an.length) rows.push([INFO_ROW_LABELS.antagonists, firstNames(an, INFO_ROW_MAX.antagonists)]);
    if (s(model.pathway)) rows.push([INFO_ROW_LABELS.pathway, s(model.pathway)]);
    if (regionCaveat) regionCaveat = `${T.caveatPrefix}${regionCaveat}`;
    if (region) {
      const items = [];
      const tech = [s(model.technicalTitle), part, hemi ? `${hemi} hemisphere` : ''].filter(Boolean).join(' · ');
      if (tech) items.push([T.technicalName, tech]);
      if (ag.length > INFO_ROW_MAX.agonists || an.length > INFO_ROW_MAX.antagonists) items.push([T.allMuscles, [...ag, ...an].join(', ')]);
      more = { summary: T.moreDetail, items, explanation: expl, note: act ? s(act.note) : '', caveats, sources: citations ? `${T.sourcesPrefix}${citations}` : '' };
    }
  }
  return {
    key: s(model.key), mode: s(model.mode) || 'idle', leftArm,
    heading: s(model.heading) || T.heading,
    title: s(card && card.title) || s(model.title), tag: s(card && card.tag) || s(model.tag),
    viewed: model.viewed === 'last' ? T.viewedLast : '',
    plain,
    rows: rows.slice(0, INFO_PANEL.maxRows),
    activity: v === null ? null : { value: v, text: NsText.activityLine(v), css: activityColorCss(v) },
    activations: NsText.activationsLine(n),
    // Idle / glass: the explanation is the visible body text. Region mode: it is inside More detail.
    explanation: region ? '' : expl,
    simulated, known, regionCaveat,
    more,
    // Outside region mode only (region mode lists caveats and sources inside More detail).
    caveats: region ? [] : caveats.slice(0, INFO_PANEL.maxCaveats), citations: region ? '' : citations
  };
}

/* ------------------------------------------------------------------ Three scene */

/**
 * Create the renderer, camera-attached arm group and world brain group.
 * Options (A2-render R1, all optional and backwards compatible):
 *  - glassXray: GLASS_XRAY_MODES entry, which glass meshes get the faint additive x-ray pass (default GLASS_XRAY);
 *  - adaptivePixelRatio: true (default) | false | QUALITY_AUTO-style options (an object overrides QUALITY_AUTO fields,
 *    R4-fix M5: the round-3 ADAPTIVE_PIXEL_RATIO / adaptPixelRatio controller is kept exported but no longer used at run
 *    time); measure() then returns the quality level's ratio;
 *  - shimmer: 'auto' (default: on unless prefers-reduced-motion) | true | false, the decorative glow shimmer;
 *  - armGhost: 'auto' (default: ghost while the gaze is on the strip) | true | false | 0..1 (see setArmGhost).
 * R4-scene options:
 *  - quality: 'auto' (default) | 'high' | 'low' (QUALITY_MODES; setQuality changes it); adaptivePixelRatio: false = 'high'
 *    (an object overrides QUALITY_AUTO fields). Under ?qa=1 the default is 'high' unless ?nsQuality= says otherwise;
 *  - brainDistanceScale: k (default 1; the QA hook ?qa=1&nsBrainK=k wins): the brain drawn k times farther and larger.
 * U2b-scene options:
 *  - onOrbit(dir): called when an orbit arrow button is clicked (setOrbitHandler replaces it; without either a
 *    'ns-orbit' CustomEvent { detail: { dir } } is dispatched on the document instead, never both);
 *  - overlayRoot: element for the scene's DOM overlay (orbit arrows, region labels, info panel, face labels); default
 *    the canvas's parent element; without one these DOM features are off (the 3D scene still works);
 *  - faceView: FACE_VIEW_MODES entry (default 'ghost'; setFaceView changes it).
 * @returns {{ objects, measure, resize, setView, setArm, setBrain, setPlacement, updatePose, updateMuscles,
 *   updateStrip, highlightMarker, setArmGhost, setShimmer, raycastBrain, projectWorld, render, contextLost: boolean,
 *   dispose, setBrainTransform, updateRegions, setInfo, setBody, setBodyFrame, updateBody, bodyVisibility, setFaceView,
 *   orbitArrowAt, hoverOrbitArrow, setOrbitHandler, brainOrientationAnchors, regionMode: boolean,
 *   setArmEnvelope, setBrainHeld, setQuality, qualityState, setBrainDistanceScale (R4-scene) }}
 */
/* ------------------------------------------------------------------ R5-scene (round 5: D16-D19 rendering, strip relief) */
// Pure helpers (Node-testable, no THREE). Display choices; nothing here is measured physiology. round5/R5-scene-NOTES.md.
// The scene RENDERS the round-5 features; their math has one owner each and is imported, not copied:
//  - 3D compass arrows: ns-arrows3d (R5-arrows: layout, frames, geometry, lit rig, ray picks);
//  - mirror body: ns-mirror (R5-mirror: placement, mirror transform, orbit state, chirality, sync contract);
//  - third-person camera: ns-camera (R5-camera: cameraPose with headInPlace / faceGhost / overBrainSeeThrough);
//  - glow-link data: ns-actions glowLinks (R5-input) and the glow colours: ns-colors glowColor... (R5-access).

/** R5-scene display constants (display choices). mirrorLodFullMm: even at full quality the mirror body (about 15 m away
 * at about 9x: one source mm is about 0.3-0.5 px) is drawn from index-only cluster copies with 2.5 mm cells (about 1-1.5
 * px; viewed 1:1 at 2560x1080 against the full meshes: no visible change), about half the body triangles, built a few
 * meshes per frame (mirrorLodSliceMs). mirrorQualityLodFrom / mirrorLodBodyMm: from
 * this QUALITY_LEVELS index on it uses the coarser cell (or the level's own coarser one), so it is the first thing
 * simplified on a slow renderer. headInPlaceFrom: the ns-camera pose's headInPlace from which the head and
 * face are drawn in place (third person). mirrorPointsPerMesh: vertices sampled per body mesh to measure the posed body
 * for ns-mirror bodyBoundsFromPoints. arrowCaptionPx: caption offset from an arrow's outer end. */
export const R5_SCENE = Object.freeze({ mirrorLodFullMm: 2.5, mirrorQualityLodFrom: 1, mirrorLodBodyMm: 4, mirrorLodSliceMs: 4, headInPlaceFrom: 0.5, mirrorPointsPerMesh: 24, arrowCaptionPx: 8 });
/** The compass arrows (top = forward, bottom = back, left, right): ns-arrows3d COMPASS_DIRS. */
export const ARROW_DIRS = NsArrows.COMPASS_DIRS;
/** R5-bigbrain (R25 / R26; round5/R5-bigbrain-NOTES.md): motorSamples = at most this many motor-area sample points
 * (region-mesh vertices) for "never over a motor area" (the brain's edge arrows, the mirror body's place and arrows);
 * avoidCellPx / avoidDilate: their occupancy grid (CSS px cell, cells marked round each point and triangle; 2 = an 8 px
 * margin for the arrows, whose drawn hook is a little larger than their planned box); mirrorAvoidDilate: the same for the
 * mirror body's place (its arrows' rooms already keep it apart; 1 lets it fit on a phone); crosshairKeepPx: half
 * size of the box round the crosshair that no orbit arrow may cover (an arrow obstacle). */
export const R5_BIGBRAIN = Object.freeze({ motorSamples: 12000, avoidCellPx: 4, avoidDilate: 2, mirrorAvoidDilate: 1, crosshairKeepPx: 40 });
/** R5-bigbrain (R25 + D1(d)): the rect (CSS px) whose points a look of at most comfortDeg puts under the crosshair:
 * |x_ndc| <= tan(c) / (tan(fovY / 2) aspect), |y_ndc| <= tan(c) / tan(fovY / 2) (yaw and pitch separately; inside it
 * max(|yaw|, |pitch|) <= c). Pure. */
export function arrowComfortRect({ width, height, fovYDeg = CAMERA.fovYDeg, comfortDeg = (NsBrain.BRAIN_VIEW && NsBrain.BRAIN_VIEW.comfortDeg) || 40 } = {}) {
  const t = Math.tan((fovYDeg * Math.PI) / 360), tc = Math.tan((comfortDeg * Math.PI) / 180), aspect = width / height;
  const X = Math.min(1, tc / (t * aspect)), Y = Math.min(1, tc / t);
  return { x0: ((1 - X) / 2) * width, x1: ((1 + X) / 2) * width, y0: ((1 - Y) / 2) * height, y1: ((1 + Y) / 2) * height };
}

/* ---- R5-scene: glow links (D17, R21) --------------------------------------------------------------------------------- */

/** Glow-link drawing (display choices; the colours and strengths come from ns-colors glowColor / glowIntensity, owned by
 * R5-access). A link is a soft additive ribbon on a gentle curve from an active brain area to one driven muscle group;
 * corePx / haloPx: half widths on screen; lift: how far the curve bows (fraction of the link length, toward world up);
 * brainFade: the first part of the link (curve parameter) fades in, so it never covers the brain area it starts on;
 * pulse: a soft brighter band travelling from the brain to the muscle (period pulseS, strength pulseAmp; none under
 * prefers-reduced-motion); maxLinks / segments: buffer sizes; mirrorAlpha: links to the mirror body are fainter (they
 * run behind the glass). */
export const GLOW_LINK = Object.freeze({
  corePx: 1.6, haloPx: 7, lift: 0.16, segments: 40, brainFade: 0.1, muscleFade: 0.04, pulseS: 1.1, pulseAmp: 0.35, pulseWidth: 0.12,
  maxLinks: 24, minLevel: 0.02, mirrorAlpha: 0.7, nearClipM: 0.06,
  // cross-section samples (fraction of the halo half width) for the additive ribbon
  across: Object.freeze([-1, -0.62, -0.32, -0.16, 0, 0.16, 0.32, 0.62, 1])
});

/** Points of a quadratic Bezier link from a to b bowed by `lift` x |ab| along `up` (made perpendicular to ab), n + 1
 * points as a flat Float64Array [x, y, z, ...]. Pure. */
export function glowCurve(a, b, { lift = GLOW_LINK.lift, up = [0, 1, 0], n = GLOW_LINK.segments } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  let ux = up[0], uy = up[1], uz = up[2];
  if (L > 0) { const k = (ux * dx + uy * dy + uz * dz) / (L * L); ux -= k * dx; uy -= k * dy; uz -= k * dz; }
  const U = Math.hypot(ux, uy, uz);
  if (U > 1e-9) { ux /= U; uy /= U; uz /= U; } else { ux = 0; uy = 0; uz = 0; }
  const cx = (a[0] + b[0]) / 2 + ux * lift * L, cy = (a[1] + b[1]) / 2 + uy * lift * L, cz = (a[2] + b[2]) / 2 + uz * lift * L;
  const out = new Float64Array(3 * (n + 1));
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out[3 * i] = s * s * a[0] + 2 * s * t * cx + t * t * b[0];
    out[3 * i + 1] = s * s * a[1] + 2 * s * t * cy + t * t * b[1];
    out[3 * i + 2] = s * s * a[2] + 2 * s * t * cz + t * t * b[2];
  }
  return out;
}

/** Alpha along a link at curve parameter s (0 at the brain area, 1 at the muscle): fades in over brainFade (never
 * covering the area it starts on), out over muscleFade, times a travelling pulse when phase is finite (0..1). Pure. */
export function glowAlongAlpha(s, phase = NaN, o = GLOW_LINK) {
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  let a = smooth(0, o.brainFade, s) * (1 - smooth(1 - o.muscleFade, 1, s) * 0.5);
  if (Number.isFinite(phase)) {
    let d = Math.abs(s - phase); d = Math.min(d, 1 - d);
    a *= 1 - o.pulseAmp + 2 * o.pulseAmp * Math.exp(-(d * d) / (2 * o.pulseWidth * o.pulseWidth));
  }
  return a;
}

/** Normalised glow links (pure): links [{ key?, regionId, level 0..1, bodyMeshIds?: [ids] | { id: 0..1 }, armMuscleKeys?:
 * [keys] | { key: 0..1 }, armMuscleNames?: [lower-case name parts] }] -> [{ key, regionId, level, body: { id: w }, armKeys:
 * { key: w }, armNames: [..] }] (levels clamped; links below GLOW_LINK.minLevel or without a region id dropped). */
export function normaliseGlowLinks(links) {
  const out = [];
  const asMap = x => {
    const m = {};
    if (Array.isArray(x)) for (const id of x) { if (typeof id === 'string' || typeof id === 'number') m[id] = 1; }
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (Number.isFinite(v) && v > 0) m[k] = Math.min(1, v);
    return m;
  };
  for (const l of Array.isArray(links) ? links : []) {
    if (!l || typeof l.regionId !== 'string') continue;
    const level = Number.isFinite(l.level) ? Math.min(1, Math.max(0, l.level)) : 0;
    if (!(level >= GLOW_LINK.minLevel)) continue;
    out.push({ key: typeof l.key === 'string' && l.key ? l.key : l.regionId, regionId: l.regionId, level, body: asMap(l.bodyMeshIds), armKeys: asMap(l.armMuscleKeys),
      armNames: Array.isArray(l.armMuscleNames) ? l.armMuscleNames.filter(s => typeof s === 'string' && s).map(s => s.toLowerCase()) : [] });
  }
  return out;
}

/** R5-input's glow links -> setGlowLinks input (pure; the integrator's adapter). links: ns-actions glowLinks(state).links
 * ([{ key, regionId, isLeftArm, actionId, level, muscles (plain names), catalog (movement-map keys), meshNames }]);
 * bodyDrives(link): the body muscle mesh ids of a NON-left-arm link with their drives, normally
 * link => ns-body bodyMuscleDrives([{ actionId: link.actionId, level: 1 }]) (agonists 1, stabilisers / antagonists
 * lower; targets below half the link's largest drive are dropped, so a ribbon goes to the muscles that do the work).
 * A left-arm link targets the arm muscles by catalog key and by name (its meshNames and muscle names). */
export function glowLinksForScene(links, { bodyDrives = null } = {}) {
  const out = [];
  for (const l of Array.isArray(links) ? links : []) {
    if (!l || typeof l.regionId !== 'string') continue;
    const level = Number.isFinite(l.level) ? l.level : 0;
    if (l.isLeftArm) {
      const names = [...(Array.isArray(l.meshNames) ? l.meshNames : []), ...(Array.isArray(l.muscles) ? l.muscles : [])];
      out.push({ key: l.key || l.regionId, regionId: l.regionId, level, armMuscleKeys: Array.isArray(l.catalog) ? l.catalog : [], armMuscleNames: names });
      continue;
    }
    let ids = {};
    try { ids = typeof bodyDrives === 'function' ? bodyDrives(l) || {} : {}; } catch { ids = {}; }
    const vals = Object.values(ids).filter(Number.isFinite), top = vals.length ? Math.max(...vals) : 0;
    const keep = {};
    for (const [id, v] of Object.entries(ids)) if (Number.isFinite(v) && v >= 0.5 * top && v > 0) keep[id] = v / (top || 1);
    out.push({ key: l.key || l.regionId, regionId: l.regionId, level, bodyMeshIds: keep });
  }
  return out;
}

/* ---- R5-scene: lit strip relief (round4/INTEGRATION.md P2) ----------------------------------------------------------- */

/** Rigid-normal patch for LIT brain materials (MeshStandardMaterial: the motor regions and the legacy strip). With the
 * perspective squash (uniform nsFarEye.w = K > 1) the squashed matrix flattens every normal toward the viewer (normalMatrix
 * of a 1 / K squash multiplies the line-of-sight component by K), so the strips lost their gyral relief. Like the glass
 * (R4-integrator D5 fix), the vertex normal becomes the brain's RIGID normal (nsRigidN = view rotation x brain rotation)
 * and the view vector the one from the far eye to the real, unsquashed point. K <= 1 keeps Three's own lines exactly.
 * Hooks: vertex '#include <defaultnormal_vertex>' (normal) and the line 'vViewPosition = - mvPosition.xyz;' (view vector,
 * optional). Returns { vertexShader, fragmentShader, view: boolean } or null when the normal hook is missing. Pure. */
export const RIGID_NORMAL_HOOK = '#include <defaultnormal_vertex>';
export const RIGID_VIEW_LINE = 'vViewPosition = - mvPosition.xyz;';
export function patchRigidNormalShaders(vertexShader, fragmentShader) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const n = vertexShader.indexOf(RIGID_NORMAL_HOOK);
  if (n < 0) return null;
  const ne = n + RIGID_NORMAL_HOOK.length;
  let vs = 'uniform mat3 nsRigidN;\nuniform vec4 nsFarEye;\n' + vertexShader.slice(0, ne) +
    '\n\tif ( nsFarEye.w > 1.0 ) transformedNormal = nsRigidN * objectNormal;' + vertexShader.slice(ne);
  const v = vs.indexOf(RIGID_VIEW_LINE);
  const view = v >= 0;
  if (view) {
    vs = vs.slice(0, v) + 'if ( nsFarEye.w > 1.0 ) { vec3 nsC = nsFarEye.xyz; vec3 nsU = normalize( nsC ); vec3 nsD = mvPosition.xyz - nsC; ' +
      'vViewPosition = - ( nsFarEye.w * nsC + ( nsD + ( nsFarEye.w - 1.0 ) * dot( nsD, nsU ) * nsU ) ); } else { vViewPosition = - mvPosition.xyz; }' +
      vs.slice(v + RIGID_VIEW_LINE.length);
  }
  return { vertexShader: vs, fragmentShader, view };
}

/** Fresnel glow rim (D17) for lit MeshStandardMaterial muscles and brain areas: uniform nsGlowRim (rgb = glowColor x
 * glowIntensity x gain, a = GLOW.rimPower) ADDED to the emission as rgb x (1 - |N.V|)^a, i.e. ns-colors glowRim per
 * fragment (R5-access A5); rgb = 0 draws exactly as before.
 * Hook: '#include <lights_fragment_begin>' (normal and vViewPosition in scope). null when missing. Pure. */
export const GLOW_RIM_HOOK = '#include <lights_fragment_begin>';
export function patchGlowRimShaders(vertexShader, fragmentShader) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const f = fragmentShader.indexOf(GLOW_RIM_HOOK);
  if (f < 0 || !fragmentShader.includes('vViewPosition') || !fragmentShader.includes('totalEmissiveRadiance')) return null;
  const body = '\tif ( nsGlowRim.r + nsGlowRim.g + nsGlowRim.b > 0.0 ) { float nsGf = 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ); ' +
    'totalEmissiveRadiance += nsGlowRim.rgb * pow( nsGf, max( nsGlowRim.a, 0.5 ) ); }\n';
  return { vertexShader, fragmentShader: 'uniform vec4 nsGlowRim;\n' + fragmentShader.slice(0, f) + body + fragmentShader.slice(f) };
}

/** R5-scene (D19): "behind the glass". Where the brain's drawn outline covers the mirror body (the ellipse of the
 * brain's projected bounds, like BODY_OVER_BRAIN), the mirror body is drawn dimmer and a little glass-blue (dim, tint),
 * so it reads as standing BEHIND the glass brain and the brain areas in front of it stay readable; dragged clear of the
 * brain it is drawn at full strength. Display choices. */
// R5-bigbrain (R26): dim 0.6 -> 0.75 with the more see-through glass (the mirror body reads more clearly through it:
// its pixel signal at 1280x720 62.8 -> 72.1, round5/R5-bigbrain-NOTES.md); still dimmer and bluer than in the open.
export const BEHIND_GLASS = Object.freeze({ dim: 0.75, tint: Object.freeze([0.86, 0.93, 1.0]), edge: 0.1 });
/** Fragment patch (pure): outgoingLight *= mix(1, tint x dim, amount x inside(ellipse nsBgWin)). Hook: before
 * '#include <opaque_fragment>' (r154+) or '#include <output_fragment>'. null when missing. */
export function patchBehindGlassShaders(vertexShader, fragmentShader, o = BEHIND_GLASS) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const hook = GLASS_FRAGMENT_HOOKS.find(h => fragmentShader.includes(h));
  if (!hook || !fragmentShader.includes('outgoingLight')) return null;
  const f = fragmentShader.indexOf(hook);
  const t = o.tint;
  const body = `
	if ( nsBg.x > 0.0 ) {
		vec2 nsBd = ( gl_FragCoord.xy - nsBgWin.xy ) / max( nsBgWin.zw, vec2( 1.0 ) );
		float nsBin = 1.0 - smoothstep( ${glslFloat(1 - o.edge)}, 1.0, length( nsBd ) );
		outgoingLight *= mix( vec3( 1.0 ), vec3( ${glslFloat(t[0])}, ${glslFloat(t[1])}, ${glslFloat(t[2])} ) * nsBg.y, nsBg.x * nsBin );
	}
`;
  return { vertexShader, fragmentShader: 'uniform vec4 nsBg;\nuniform vec4 nsBgWin;\n' + fragmentShader.slice(0, f) + body + fragmentShader.slice(f) };
}

/** Plain hover caption of a 3D arrow (pure): ns-text ARROWS when R5-text provides it ({ brain: { tip }, mirror: { tip } }
 * or { tip, mirrorTip }), else the round-4 ORBIT captions for the brain and ARROW_TIP_FALLBACK for the mirror body.
 * (The fallback wording should move to ns-text; listed in round5/R5-scene-NOTES.md.) */
export const ARROW_TIP_FALLBACK = Object.freeze({
  forward: 'Turn the mirror body: top toward you', back: 'Turn the mirror body: bottom toward you',
  left: 'Turn the mirror body: left side toward you', right: 'Turn the mirror body: right side toward you'
});
export function arrowTipText(target, dir, text = NsText) {
  const A = text && text.ARROWS;
  const pick = o => (o && typeof o[dir] === 'string' && o[dir] ? o[dir] : null);
  if (A) {
    const t = target === 'mirror'
      ? pick(A.mirror && (A.mirror.tip || A.mirror.tips)) || pick(A.mirrorTip) || pick(A.mirrorTips)
      : pick(A.brain && (A.brain.tip || A.brain.tips)) || pick(A.tip) || pick(A.brainTip);
    if (t) return t;
  }
  if (target === 'mirror') return ARROW_TIP_FALLBACK[dir] || '';
  const o = text && text.ORBIT && text.ORBIT.tip;
  return (o && o[dir]) || ORBIT_ARROWS.tip[dir] || '';
}

/** Glow style (pure) at activity v from ns-colors (R5-access: glowColor, glowCoreColor, glowIntensity, glowHaloProfile,
 * GLOW), with local fallbacks of the same rule when an older ns-colors is loaded. Returns { halo: [r, g, b] linear, core:
 * [r, g, b] linear, intensity 0..1, K (the GLOW constants) }. */
const GLOW_K_FALLBACK = Object.freeze({ onset: 0.1, onsetFull: 0.2, floor: 0.3, coreWhite: 0.18, linkAlpha: 0.85, haloAlpha: 0.42, areaRimGain: 0.9, muscleRimGain: 0.8, rimPower: 2, riseTau: 0.05, decayTau: 0.15 });
export const GLOW_K = NsColors.GLOW && typeof NsColors.GLOW === 'object' ? NsColors.GLOW : GLOW_K_FALLBACK;
const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function rampLinearAt(v) {
  const S = SHARED_RAMP, n = S.length - 1, x = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
  return [S[i][0] + (S[i + 1][0] - S[i][0]) * f, S[i][1] + (S[i + 1][1] - S[i][1]) * f, S[i][2] + (S[i + 1][2] - S[i][2]) * f];
}
export const GLOW_SOURCE = typeof NsColors.glowColor === 'function' ? 'ns-colors' : 'fallback';
export function glowStyle(v) {
  const K = GLOW_K;
  const halo = typeof NsColors.glowColor === 'function' ? NsColors.glowColor(v) : rampLinearAt(v);
  const intensity = typeof NsColors.glowIntensity === 'function' ? NsColors.glowIntensity(v) : smooth01(K.onset, K.onsetFull, v) * (K.floor + (1 - K.floor) * Math.min(1, Math.max(0, v)));
  const core = typeof NsColors.glowCoreColor === 'function' ? NsColors.glowCoreColor(v)
    : halo.map(c => c + (1 - c) * K.coreWhite * intensity);
  return { halo, core, intensity, K };
}
/** Halo profile across a link (pure): ns-colors glowHaloProfile, else a gaussian with the same ends. */
export function glowHalo(r) {
  if (typeof NsColors.glowHaloProfile === 'function') return NsColors.glowHaloProfile(r);
  const x = Math.abs(r);
  if (x >= 1) return 0;
  if (x <= 0.16) return 1;
  const u = (x - 0.16) / 0.84;
  return Math.exp(-4.5 * u * u) * (1 - smooth01(0.8, 1, x));
}

export function createScene({
  THREE, canvas, fovYDeg = CAMERA.fovYDeg, near = CAMERA.near, far = CAMERA.far, maxPixelRatio = 2,
  glassXray: glassXrayMode = GLASS_XRAY, adaptivePixelRatio = true, shimmer = 'auto', armGhost = 'auto',
  onOrbit = null, overlayRoot = null, faceView = 'ghost', quality = 'auto', brainDistanceScale = 1, antialias = 'auto'
} = {}) {
  requireThree(THREE);
  if (!canvas || typeof canvas.addEventListener !== 'function' || !canvas.ownerDocument) {
    fail('scene_args', 'canvas must be a canvas element that belongs to a document');
  }
  if (!GLASS_XRAY_MODES.includes(glassXrayMode)) fail('scene_args', `glassXray must be one of ${GLASS_XRAY_MODES.join(', ')}`);
  if (onOrbit !== null && typeof onOrbit !== 'function') fail('scene_args', 'onOrbit must be a function');
  if (!FACE_VIEW_MODES.includes(faceView)) fail('scene_args', `faceView must be one of ${FACE_VIEW_MODES.join(', ')}`);
  const view = canvas.ownerDocument.defaultView || null;
  const perf = view && view.performance && typeof view.performance.now === 'function' ? view.performance : null;
  const nowMs = () => (perf ? perf.now() : Date.now());
  const disposables = [];
  const keep = x => { disposables.push(x); return x; };
  let reducedMotion = false;
  try { reducedMotion = Boolean(view && typeof view.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { reducedMotion = false; }
  // R4-scene (D8): the adaptive-quality controller replaces the A2 adaptive pixel ratio (which never went below the
  // device ratio, so it could not help a software renderer). adaptivePixelRatio: false keeps full quality ('high').
  // QA / test hooks (only with ?qa=1 in the page URL): nsQuality=auto|high|low|L0..L5 forces a mode or a level, and
  // nsBrainK=k draws the brain k times farther and k times larger (same on-screen size; scaleBrainDistance). Under ?qa=1
  // without nsQuality the mode is 'high', so deterministic QA screenshots never depend on the machine's speed.
  let urlParams = null;
  try { urlParams = view && view.location && typeof view.location.search === 'string' ? new URLSearchParams(view.location.search) : null; } catch { urlParams = null; }
  const qaPage = Boolean(urlParams && urlParams.get('qa') === '1');
  const qaQuality = qaPage ? urlParams.get('nsQuality') : null;
  const forcedLevel = qaQuality && /^L\d$/.test(qaQuality) ? Math.min(QUALITY_LEVELS.length - 1, Number(qaQuality.slice(1))) : null;
  // R4-integrator: the renderer is probed first (MSAA decision below). Under ?qa=1 without nsQuality a SOFTWARE renderer
  // starts in 'auto' (QA on a software renderer is there to measure the adaptive steps, e2e S43); a hardware GPU starts
  // in 'high', so deterministic QA screenshots on the real GPU never depend on the machine's load.
  const rendererName = antialias === true || antialias === false ? null : probeRendererName(canvas.ownerDocument);
  const softwareRenderer = isSoftwareRenderer(rendererName);
  const startMode = adaptivePixelRatio === false ? 'high' : qaQuality && QUALITY_MODES.includes(qaQuality) ? qaQuality : forcedLevel !== null ? 'high' : qaPage ? (softwareRenderer ? 'auto' : 'high') : QUALITY_MODES.includes(quality) ? quality : 'auto';
  let qState = qualityStart(startMode);
  if (forcedLevel !== null) qState = { ...qState, mode: 'forced', level: forcedLevel };
  const qualityOpts = { ...QUALITY_AUTO, ...(typeof adaptivePixelRatio === 'object' && adaptivePixelRatio ? adaptivePixelRatio : {}) };
  const qaBrainK = qaPage ? Number(urlParams.get('nsBrainK')) : NaN;
  let brainDistK = Number.isFinite(qaBrainK) && qaBrainK > 0 ? qaBrainK : Number.isFinite(brainDistanceScale) && brainDistanceScale > 0 ? brainDistanceScale : 1;
  let lastBrainTransform = null;
  let lastRenderAt = null;
  let lastSampleAt = null; // R4-fix (code review F1): the quality controller's own interval clock (live frames only)
  let lastRenderCpuMs = NaN;

  const msaa = antialiasFor({ antialias, quality: startMode, rendererName });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: msaa, powerPreference: 'high-performance' });
  // Front-to-back glass depth pre-pass (guarded: setTransparentSort is a core WebGLRenderer method since r142).
  const transparentSortApplied = typeof renderer.setTransparentSort === 'function';
  if (transparentSortApplied) renderer.setTransparentSort(transparentSortNs);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(MATERIAL.background);
  const camera = new THREE.PerspectiveCamera(fovYDeg, 1, near, far);
  camera.rotation.set(0, 0, 0, 'YXZ');
  scene.add(camera); // the camera must be in the scene graph for its children (the arm) to render

  // R5-scene (D18): the arm hangs on the EYE (the first-person look), not on the render camera, so a third-person camera
  // can move away from the head while the arm stays at the shoulder. In first person the eye and the camera coincide
  // (both at the origin with the same look), so every first-person picture is unchanged.
  const eyeRig = new THREE.Group();
  eyeRig.name = 'ns-eye (first-person look; the arm is attached here)';
  eyeRig.rotation.set(0, 0, 0, 'YXZ');
  scene.add(eyeRig);
  const armGroup = new THREE.Group();
  armGroup.name = 'ns-arm (eye-attached, camera metres)';
  eyeRig.add(armGroup);
  const brainGroup = new THREE.Group();
  brainGroup.name = 'ns-brain (world, display transform)';
  brainGroup.matrixAutoUpdate = false;
  scene.add(brainGroup);

  scene.add(new THREE.AmbientLight(0xffffff, LIGHT.ambient));
  if (typeof THREE.HemisphereLight === 'function') {
    const hemi = new THREE.HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, LIGHT.hemi);
    hemi.position.set(0, 1, 0);
    scene.add(hemi);
  }
  const keyLight = new THREE.DirectionalLight(0xffffff, LIGHT.key);
  keyLight.position.set(0.6, 1.2, 0.8);
  camera.add(keyLight);
  camera.add(keyLight.target); // headlight: light and target both follow the camera
  keyLight.target.position.set(0, -0.3, -1);
  // Rim light (camera space, from in front of the scene back toward the viewer): lights surfaces that face away from
  // the camera, so only the silhouettes of the arm, body and strips pick up a thin cool edge.
  const rimLight = new THREE.DirectionalLight(LIGHT.rimColor, LIGHT.rim);
  rimLight.position.set(-0.35, 0.7, -1.4);
  camera.add(rimLight);
  camera.add(rimLight.target);
  rimLight.target.position.set(0, 0, 0.6);

  const ghostMode = mode => {
    if (mode === 'auto' || mode === undefined || mode === null) return 'auto';
    if (mode === true) return 1;
    if (mode === false) return 0;
    if (Number.isFinite(mode)) return Math.min(1, Math.max(0, mode));
    return fail('scene_args', "armGhost must be 'auto', a boolean or a number in 0..1");
  };
  const armGhostState = { applied: null, mode: ghostMode(armGhost), amount: 0, smooth: true };
  // R3-scene: the arm ghost is a SMOOTH translucent window (patchSeeThroughShaders), not a dither. The arm materials are
  // transparent (alpha 1 outside the window, so the arm looks opaque) and drawn after the brain (BODY_ORDER.arm); a
  // colour-less depth pre-pass twin per arm mesh (visible only while the window is open) keeps just the nearest arm
  // surface, so the window shows the brain behind it instead of a mush of inner muscle layers.
  const armSeeUniform = { value: new Float32Array([0, ARM_SEE.alpha, ARM_SEE.rimAlpha, 0]) };
  const armWinUniform = { value: new Float32Array([0, 0, 1, ARM_SEE.edge]) };
  const ghostPatch = m => {
    m.transparent = true;
    m.onBeforeCompile = shader => {
      const patched = patchSeeThroughShaders(shader.vertexShader, shader.fragmentShader);
      armGhostState.applied = patched !== null && armGhostState.applied !== false;
      if (patched === null) return;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms.nsSee = armSeeUniform;
      shader.uniforms.nsWin = armWinUniform;
    };
    m.customProgramCacheKey = () => 'ns-arm-see-r3';
    return m;
  };
  const armDepthMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: true, transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
  disposables.push(armDepthMaterial);
  const armTwins = [];
  let armTwinsOn = false;
  /** A colour-less depth pre-pass twin of `mesh` (child: inherits its pose; shares the geometry). */
  const depthTwin = (mesh, material, order, list) => {
    const t = new THREE.Mesh(mesh.geometry, material);
    t.name = `${mesh.name} (depth pre-pass)`;
    t.matrixAutoUpdate = false;
    t.renderOrder = order;
    t.frustumCulled = mesh.frustumCulled;
    t.visible = false;
    t.userData = { depthTwin: true };
    mesh.add(t);
    list.push(t);
    return t;
  };
  const boneMaterial = ghostPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: 0.62, metalness: 0 })));
  // Strip shader state: applied is null until the strip program compiles, then whether every hook was found.
  const stripShader = { applied: null, shimmer: shimmer === 'auto' ? !reducedMotion : Boolean(shimmer), reducedMotion };
  // Glass (RENDER_ORDER 4..6). Unlit MeshBasicMaterial passes with the glassAlpha rim patch; `glassRim.applied` is
  // null until Three compiles a glass program, then whether every hook was found (Root's browser check).
  const glassRim = { applied: null, shell: null, xray: null };
  // R3-scene: the shell pass reads gyri and sulci (patchGlassReadShaders: crown light + groove cue from the nsSulc attribute).
  const glassReadUniform = { value: new Float32Array([GLASS_READ.crownOpacity, GLASS_READ.crownBright, GLASS_READ.grooveLight, GLASS_READ.grooveAlpha]) };
  const glassRead = { applied: null, sulcMs: null, supportPoints: 0 };
  // R4-integrator (D5 glass fix): shared uniforms of every glass rim material; set in render() from the brain transform.
  const farEyeRigidN = { value: new THREE.Matrix3() }, farEyeVec = { value: new THREE.Vector4(0, 0, 0, 0) };
  const farEyeView = { rot: null, pw: null, K: 1 };
  // R4-scene: the shell's rim uniforms are kept, so the held-brain cue (HELD_CUE) can change them per frame.
  const shellRimUniforms = { nsRimOpacity: { value: MATERIAL.glassRimOpacity }, nsRimPower: { value: MATERIAL.glassRimPower } };
  const heldCue = { target: 0, amount: 0 };
  // R4-scene: the left-arm rim (LEFT_ARM_RIM) uniforms and state ({ applied: null until a left-arm region compiles }).
  const leftArmRimUniforms = { color: { value: new THREE.Color(REGION_RENDER.territoryLine) }, params: { value: new THREE.Vector3(LEFT_ARM_RIM.mix, LEFT_ARM_RIM.alpha, LEFT_ARM_RIM.glow) } };
  const leftArmRim = { applied: null, ms: null, borderSegments: 0 };
  const rimMaterial = (key, params, rim, power, cacheKey, read = false) => {
    const m = keep(new THREE.MeshBasicMaterial(params));
    m.forceSinglePass = true; // r150+: DoubleSide transparent in one pass
    m.onBeforeCompile = shader => {
      const patched = read ? patchGlassReadShaders(shader.vertexShader, shader.fragmentShader) : patchGlassShaders(shader.vertexShader, shader.fragmentShader);
      if (read) { glassRead.applied = patched !== null; if (patched) shader.uniforms.nsRead = glassReadUniform; }
      glassRim[key] = patched !== null;
      glassRim.applied = glassRim.shell !== false && glassRim.xray !== false && (glassRim.shell === true || glassRim.xray === true);
      if (patched === null) return;
      shader.vertexShader = patched.vertexShader;
      shader.fragmentShader = patched.fragmentShader;
      if (key === 'shell') { shader.uniforms.nsRimOpacity = shellRimUniforms.nsRimOpacity; shader.uniforms.nsRimPower = shellRimUniforms.nsRimPower; }
      else { shader.uniforms.nsRimOpacity = { value: rim }; shader.uniforms.nsRimPower = { value: power }; }
      shader.uniforms.nsRigidN = farEyeRigidN; shader.uniforms.nsFarEye = farEyeVec;
    };
    m.customProgramCacheKey = () => cacheKey;
    return m;
  };
  // SHELL: nearest glass surface only (after the depth pre-pass), normal blending. DoubleSide so an open or inward
  // mesh still shows its nearest surface.
  const glassMaterial = rimMaterial('shell', {
    color: MATERIAL.glass, transparent: true, opacity: MATERIAL.glassOpacity, depthWrite: false, side: THREE.DoubleSide
  }, MATERIAL.glassRimOpacity, MATERIAL.glassRimPower, 'ns-glass-shell-read-r3s', true);
  // X-RAY: every camera-facing layer, additive (order-independent). FrontSide is the Material default: no `side`.
  const xrayParams = { color: MATERIAL.glassXray, transparent: true, opacity: MATERIAL.glassXrayOpacity, depthWrite: false };
  if (THREE.AdditiveBlending !== undefined) xrayParams.blending = THREE.AdditiveBlending;
  const glassXrayMaterial = rimMaterial('xray', xrayParams, MATERIAL.glassXrayRimOpacity, MATERIAL.glassXrayRimPower, 'ns-glass-xray-r3');
  // Glass depth pre-pass: nearest glass depth only, no colour; pushed back slightly so the colour pass of the same
  // surface passes LessEqual robustly while every farther glass layer fails.
  const glassDepthMaterial = keep(new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: true, transparent: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  }));
  glassDepthMaterial.forceSinglePass = true;
  // U2b-scene: muscle base colour (linear) for the shared ns-colors shading rule; muscleHot is kept for compatibility.
  const muscleBaseLinear = hexToLinear(MATERIAL.muscleBase);
  const muscleHot = new THREE.Color(MATERIAL.muscleHot);
  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3(0, 0, 0);
  const rayDir = new THREE.Vector3(0, 0, -1);
  const scratch = new THREE.Vector3();

  const bones = [];
  const muscles = [];
  const glass = [];
  const glassDepth = [];
  const glassXray = [];
  const markers = [];
  let strip = null;
  let rayTargets = null;
  let armSet = false, brainSet = false;
  let baselineDrive = 0;
  let lastMatrices = null;
  let armAppliedReady = false; // R173: distinct from a layer-triggered pending reskin.
  let lastStripDrives = null;
  let highlighted;
  let lost = false;
  let disposed = false;

  // ---- U2b-scene state ------------------------------------------------------------------------------------------
  const doc = canvas.ownerDocument;
  const hasLines = typeof THREE.LineSegments === 'function' && typeof THREE.LineBasicMaterial === 'function';
  const shadeScratch = { tint: [0, 0, 0], albedo: [0, 0, 0], emission: [0, 0, 0], opacity: 0, glow: 0, activated: false };
  const muscleShade = { albedo: [0, 0, 0], emission: [0, 0, 0], glow: 0 };
  const regionStyle = regionStyleConstants();
  /** Region mode: one record per body-map region { region, index, material, meshes, depthMeshes, outline, key }. */
  const regions = [];
  const regionById = new Map();
  const regionMeshes = [];
  const unassignedGlass = [];
  let regionMode = false;
  let segmentation = null;
  let hoveredRegionId = null;
  let gazeOnRegion = false;
  let brainTransformSet = false;
  let brainSamples = null; // Float32Array of source-mm sample points (projected bounds for the orbit arrows)
  let brainSupport = null; // R3-scene: supportPoints of every brain vertex (the silhouette hull basis)
  let brainDepthBounds = null; // R22 all glass+strip SOURCE positions, conservative AABB cached only on normal load
  let brainHullPoints = null; // R3-fix: the segmentation outline points (denser hull basis for the arrow plan)
  let compassBrainSourceRevision = 0; // R345 source replacement identity; no geometry/hash work in the cached getter
  let brainSampleCentre = null; // fix F2: their centroid (cached per sample array)
  let labelGroups = [];
  // Region depth pre-pass: nearest strip layer only (colour-less), pushed back like the glass pre-pass so the colour pass
  // and the outlines on the same surface pass LessEqual.
  // R5-access C1 (D19): the region depth pre-pass also dims what is BEHIND a translucent motor area (the mirror body,
  // drawn before it), so the area keeps its own colour; with nothing behind the brain it looks the same (ns-colors
  // MIRROR_VIEW.regionBacking; round5/access/ACCESS-REPORT.md). Without it (older ns-colors) the pre-pass stays colour-less.
  const backing = NsColors.MIRROR_VIEW && NsColors.MIRROR_VIEW.regionBacking;
  const regionDepthMaterial = keep(new THREE.MeshBasicMaterial(backing ? {
    color: backing.color, opacity: backing.alpha, colorWrite: true, depthWrite: true, transparent: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  } : {
    colorWrite: false, depthWrite: true, transparent: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  }));
  regionDepthMaterial.forceSinglePass = true;
  const leftArmLineMaterial = hasLines ? keep(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, opacity: REGION_RENDER.leftArmLineOpacity })) : null;
  if (leftArmLineMaterial) { const c = regionStyle.leftArmOutline; leftArmLineMaterial.color.setRGB(c[0], c[1], c[2]); }
  const hoverLineMaterial = hasLines ? keep(new THREE.LineBasicMaterial({ color: REGION_RENDER.hoverLine, transparent: true, depthWrite: false, opacity: REGION_RENDER.lineOpacity })) : null;
  const otherLineMaterial = hasLines ? keep(new THREE.LineBasicMaterial({ color: REGION_RENDER.otherLine, transparent: true, depthWrite: false, opacity: REGION_RENDER.otherLineOpacity })) : null;
  const activatedLineMaterial = hasLines ? keep(new THREE.LineBasicMaterial({ color: REGION_RENDER.activatedLine, transparent: true, depthWrite: false, opacity: REGION_RENDER.activatedLineOpacity })) : null;
  const territoryLineMaterial = hasLines ? keep(new THREE.LineBasicMaterial({ color: REGION_RENDER.territoryLine, transparent: true, depthWrite: false, opacity: REGION_RENDER.territoryLineOpacity })) : null;
  const groupLineMaterial = hasLines ? keep(new THREE.LineBasicMaterial({ color: REGION_RENDER.groupLine, transparent: true, depthWrite: false, opacity: REGION_RENDER.groupLineOpacity })) : null;
  /** Polish: one welded outline per on-brain label group (body-part territory). */
  const groupOutlines = [];

  // Full body (setBody): a world group under the body frame (BodyParts3D mm -> world m), GPU-posed meshes.
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'ns-body (world, BodyParts3D frame; full body)';
  bodyGroup.matrixAutoUpdate = false;
  scene.add(bodyGroup);
  let bodyFrame = bodyFrameMatrix(DEFAULT_EYE_BP, 0);
  let bodyFrameSource = 'default-eye-estimate';
  let eyeBp = DEFAULT_EYE_BP.slice();
  let bodyYaw = 0;
  bodyGroup.matrix.fromArray(bodyFrame);
  bodyGroup.matrixWorldNeedsUpdate = true;
  /** Body records { id, mesh, part, kind, material, face (bool: face layer), lastDrive }. */
  const body = [];
  const bodyById = new Map();
  const bodyBoneMaterial = keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: 0.62, metalness: 0 }));
  // Torso see-through window (BODY_SEE_THROUGH): one vec4 uniform shared by the torso/neck materials drawn in place.
  // R3-scene: SMOOTH torso translucency (BODY_TRANSLUCENT) instead of the dithered window: transparent materials (alpha 1
  // until the player looks down), drawn after the brain (BODY_ORDER.torso), and a depth pre-pass twin per torso mesh that is
  // switched on with the translucency, so only the nearest torso surface is blended over the opaque legs.
  const torsoSeeUniform = { value: new Float32Array([0, BODY_TRANSLUCENT.alpha, BODY_TRANSLUCENT.rimAlpha, 0]) };
  const torsoWinUniform = { value: new Float32Array([0, 0, 0, 1]) }; // radius 0: the whole torso
  const torsoGhost = { applied: null, amount: 0, target: 0, smooth: true, depthPrePass: false };
  const torsoMaterials = new Set();
  const torsoTwins = [];
  const torsoDepthMaterial = keep(new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: true, transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  }));
  const torsoPatch = m => {
    m.transparent = true;
    torsoMaterials.add(m);
    m.onBeforeCompile = shader => {
      const patched = patchSeeThroughShaders(shader.vertexShader, shader.fragmentShader);
      torsoGhost.applied = patched !== null && torsoGhost.applied !== false;
      if (patched === null) return;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms.nsSee = torsoSeeUniform;
      shader.uniforms.nsWin = torsoWinUniform;
    };
    m.customProgramCacheKey = () => 'ns-torso-see-r3';
    return m;
  };
  const torsoBoneMaterial = torsoPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: 0.62, metalness: 0 })));
  // R3-fix (M4): body over the brain's outline is drawn see-through (BODY_OVER_BRAIN). Composes with torsoPatch.
  const overBrainUniform = { value: new Float32Array([0, BODY_OVER_BRAIN.alpha, 0, 0]) };
  const overBrainWinUniform = { value: new Float32Array([0, 0, 1, 1]) };
  const overBrain = { amount: 0, applied: null, materials: 0 };
  const overBrainPatch = m => {
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.transparent = true;
    m.onBeforeCompile = (shader, r) => {
      if (typeof prev === 'function') prev.call(m, shader, r);
      const patched = patchOverBrainShaders(shader.vertexShader, shader.fragmentShader);
      overBrain.applied = patched !== null && overBrain.applied !== false;
      if (patched === null) return;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms.nsOvl = overBrainUniform;
      shader.uniforms.nsOvlWin = overBrainWinUniform;
    };
    m.customProgramCacheKey = () => `${typeof prevKey === 'function' ? prevKey.call(m) : ''}|ns-over-brain-r3fix`;
    overBrain.materials++;
    return m;
  };
  overBrainPatch(torsoBoneMaterial);
  overBrainPatch(bodyBoneMaterial);
  let bodySet = false;
  // Face layer: its own scene drawn as a second pass (ghost: main camera, depth-tested against the main frame; inset:
  // an inset camera in a scissored viewport). The meshes are the same posed geometry as the body.
  const faceScene = new THREE.Scene();
  faceScene.add(new THREE.AmbientLight(0xffffff, LIGHT.ambient));
  if (typeof THREE.HemisphereLight === 'function') faceScene.add(new THREE.HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, LIGHT.hemi));
  const faceKey = new THREE.DirectionalLight(0xffffff, LIGHT.key * 0.8);
  faceKey.position.set(0, 0.4, 1);
  faceScene.add(faceKey);
  const faceGroup = new THREE.Group();
  faceGroup.name = 'ns-face layer (ghost / inset; displaced view, never around the camera)';
  faceGroup.matrixAutoUpdate = false;
  faceScene.add(faceGroup);
  const faceBoneMaterial = keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: 0.62, metalness: 0, transparent: true, opacity: FACE_LAYER.boneOpacity, depthWrite: false }));
  const faceDepthMaterial = keep(new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: true, transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  }));
  const faceTwins = [];
  const insetCamera = new THREE.PerspectiveCamera(FACE_LAYER.inset.fovDeg, 1, 0.01, 50);
  const insetPrevColor = new THREE.Color();
  let faceMode = faceView;
  let faceAmount = 0;
  let faceHeadCentre = null, facePacketMeshes = 0;
  let faceRadiusMm = 0;
  let faceStateKey = '';
  let lookPitch = 0, lookYaw = 0;
  let cssW = 0, cssH = 0, cssPr = 1;
  let orbitHandler = onOrbit;
  // Overlay layout runs only when something it depends on changed (view, brain transform, size, info panel, hover, face
  // layer, body) or when the cached HUD card rectangles are due for a re-read; idle frames do no overlay work.
  let overlayDirty = true;
  let lastFaceMode = '', lastFaceQ = -1, lastFaceYaw = NaN;

  // ---- DOM overlay (orbit arrows, region labels, info panel, face label) -----------------------------------------
  const overlayParent = overlayRoot || canvas.parentElement || null;
  let overlay = null;
  if (overlayParent && typeof overlayParent.appendChild === 'function' && typeof doc.createElement === 'function') {
    overlay = doc.createElement('div');
    overlay.className = 'ns-scene-overlay';
    overlay.setAttribute('data-ns-scene-overlay', '');
    overlayParent.appendChild(overlay);
  }
  const el = (tag, cls, parent) => { const e = doc.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  // ---- R5-scene (D16, R20): 3D compass arrows round the brain and round the mirror body (ns-arrows3d, R5-arrows) ----
  // The round-2..4 DOM orbit buttons (SVG icons, the placement planner, pointer pins and DOM hold timers) are gone. Two
  // ns-arrows3d rigs (four lit 3D arrows each, a see-through copy where the near arm hides a brain arrow) are placed by
  // planCompassArrows at fixed compass positions round the brain (top = forward, bottom = back, left, right; a small gap
  // outside the drawn outline) and round the mirror body (smaller). The scene draws them, highlights the hovered one
  // (setArrowHover), answers ray picks (pickArrows: the hit list R5-input's resolveArrowHit takes) and gives their screen
  // boxes to the overlay. Presses and holds are R5-input's (ns-controls stepArrowInput); nothing ever orbits by itself.
  let arrowRigError = null;
  const makeArrowRig = kind => {
    try {
      // R5-access B1: the colours at the call site (brain grey-white, mirror green, so the two sets read apart).
      const look = typeof NsColors.arrowLook === 'function' ? { ...NsArrows.ARROW_LOOK, ...NsColors.arrowLook(kind) } : NsArrows.ARROW_LOOK;
      const rig = NsArrows.createArrowRig(THREE, { kind, look });
      rig.group.visible = false;
      scene.add(rig.group);
      // e2e detection contract (round5/R5-e2e-NOTES.md): userData.nsOrbitArrow { dir, target, hover } on each arrow root.
      for (const d of ARROW_DIRS) { rig.arrows[d].mesh.userData.nsArrow = { target: kind, dir: d }; rig.arrows[d].root.userData.nsOrbitArrow = { dir: d, target: kind, hover: false }; }
      return rig;
    } catch (err) { arrowRigError = String((err && err.message) || err); return null; }
  };
  const arrowSets = {};
  for (const target of ['brain', 'mirror']) arrowSets[target] = { target, rig: makeArrowRig(target), plan: null, frames: null, key: '', shown: false, boxes: {}, clicks: {}, boxKey: '' };
  let arrowHover = null; // { target, dir, blocked } (setArrowHover)
  let arrowsShown = false, arrowLayout = null, hoverDir = null;
  // Plain hover captions (DOM, textContent only, never pointer targets): the hovered arrow's, and every brain arrow's
  // while the "Try this" goal is 'orbit'.
  const arrowTips = {};
  if (overlay) {
    for (const target of ['brain', 'mirror']) for (const d of ARROW_DIRS) {
      const e = el('div', `ns-arrow-tip ns-arrow-tip-${target}`, overlay);
      e.setAttribute('data-ns-arrow-tip', `${target}:${d}`);
      e.setAttribute('aria-hidden', 'true');
      e.hidden = true;
      e.textContent = arrowTipText(target, d);
      arrowTips[`${target}:${d}`] = { el: e, left: '', top: '', shown: false };
    }
  }
  const labelEls = [];
  const labelBoxes = [];
  const labelItems = []; // R3-scene declutterLabels items (same order as labelEls)
  const labelObstacles = [];
  /** R3-scene: label sizes (larger, D3/task 4) as a small injected stylesheet with selectors one class stronger than
   * neurosurge.css (.ns-region-label.ns-r3), so the CSS owner can move or override them (see R3-scene-NOTES.md). */
  function injectSceneStyle() {
    try {
      if (!doc || typeof doc.getElementById !== 'function' || doc.getElementById('ns-scene-three-r3-style')) return;
      const head = doc.head || (doc.getElementsByTagName && doc.getElementsByTagName('head')[0]);
      if (!head || typeof head.appendChild !== 'function') return;
      const st = doc.createElement('style');
      st.id = 'ns-scene-three-r3-style';
      st.textContent = R3_SCENE_CSS;
      if (head.firstChild && typeof head.insertBefore === 'function') head.insertBefore(st, head.firstChild); else head.appendChild(st);
    } catch { /* styling is a convenience */ }
  }
  let brainInViewAttr = '';
  // Info panel (R14): far right, textContent only, never takes pointer events.
  let info = null;
  if (overlay) {
    const p = el('aside', 'ns-infopanel', overlay);
    p.setAttribute('data-ns-info', '');
    p.setAttribute('aria-live', 'polite');
    p.setAttribute('aria-label', `Information: ${NsText.INFO.heading}`);
    p.hidden = true;
    info = { panel: p, last: null };
    info.heading = el('div', 'ns-infopanel-heading', p);
    info.title = el('div', 'ns-infopanel-title', p);
    info.tag = el('div', 'ns-infopanel-tag', p);
    info.viewed = el('div', 'ns-infopanel-viewed', p);
    const act = el('div', 'ns-infopanel-activity', p);
    info.swatch = el('span', 'ns-infopanel-swatch', act);
    info.activity = el('span', 'ns-infopanel-activity-text', act);
    // Polish: the value on the SAME ramp as the legend, brain and muscles (a small bar with a marker).
    info.meter = el('div', 'ns-infopanel-meter', p);
    if (info.meter.style) info.meter.style.background = legendGradientCss(9);
    info.meterMark = el('span', 'ns-infopanel-meter-mark', info.meter);
    info.activations = el('div', 'ns-infopanel-activations', p);
    // Round 3 (D3): one plain lead sentence, at most INFO_PANEL.maxRows short rows, the short honesty lines (simulated,
    // known, the region's own caveat), then everything technical in a collapsed <details> "More detail" (its summary is
    // the panel's only pointer target, for the drag-to-look mode; with the mouse captured it stays collapsed).
    info.plain = el('p', 'ns-infopanel-plain', p);
    info.rows = el('dl', 'ns-infopanel-rows', p);
    info.simulated = el('p', 'ns-infopanel-simulated', p);
    info.known = el('p', 'ns-infopanel-known', p);
    info.regionCaveat = el('p', 'ns-infopanel-caveat', p);
    info.explanation = el('p', 'ns-infopanel-explanation', p);
    info.caveats = el('ul', 'ns-infopanel-caveats', p);
    info.citations = el('div', 'ns-infopanel-citations', p);
    info.more = el('details', 'ns-infopanel-detail', p);
    info.more.hidden = true;
    info.moreSummary = el('summary', 'ns-infopanel-detail-summary', info.more);
    info.moreBody = el('div', 'ns-infopanel-detail-body', info.more);
    info.moreKey = null;
    info.actRow = act;
  }
  let faceLabel = null, insetFrame = null, faceLabelW = 0, xlShift = 0, faceCaption = null;
  // R5-integrate-core (D20): the face layer's captions: the round-4 FACE ("no face, chewing or tongue muscles") until the
  // face-muscle packet's meshes are in the body, then ns-text FACE_R5 (face, chewing and neck muscles; still no tongue).
  let faceText = FACE_LAYER;
  if (overlay) {
    faceLabel = el('div', 'ns-face-label', overlay);
    faceLabel.hidden = true;
    insetFrame = el('div', 'ns-face-inset', overlay);
    insetFrame.hidden = true;
    faceCaption = el('div', 'ns-face-inset-caption', insetFrame);
    faceCaption.textContent = faceText.insetLabel;
  }
  const faceLabelLast = { left: '', top: '', text: '' };
  let faceLabelH = 0; // R3-integrator: the caption's measured height (read once it is shown)
  const insetLast = { left: '', top: '', size: '' };
  // Per-frame scratch (no allocation in render / layout).
  const pv = new THREE.Vector3();
  const brainBoundsPx = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let brainOverlayOk = false; // R3-fix (M4): brainBoundsPx is this layout's projection of a brain in front of the camera
  const frustum = typeof THREE.Frustum === 'function' ? new THREE.Frustum() : null;
  const projView = typeof THREE.Matrix4 === 'function' ? new THREE.Matrix4() : null;

  // ---- R5-scene: shared shader-patch composition (each patch keeps the previous onBeforeCompile and cache key) --------
  const composePatch = (m, tag, fn) => {
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (shader, r) => { if (typeof prev === 'function') prev.call(m, shader, r); fn(shader); };
    m.customProgramCacheKey = () => `${typeof prevKey === 'function' ? prevKey.call(m) : ''}|${tag}`;
    return m;
  };
  // ---- R5-scene (P2 strip relief): the lit region / strip materials take the brain's RIGID normal under the squash ----
  const stripRelief = { applied: null, view: null, materials: 0 };
  const rigidPatch = m => {
    stripRelief.materials++;
    return composePatch(m, 'ns-rigid-normal-r5', shader => {
      const p = patchRigidNormalShaders(shader.vertexShader, shader.fragmentShader);
      stripRelief.applied = p !== null && stripRelief.applied !== false;
      if (!p) return;
      stripRelief.view = p.view && stripRelief.view !== false;
      shader.vertexShader = p.vertexShader;
      shader.uniforms.nsRigidN = farEyeRigidN; shader.uniforms.nsFarEye = farEyeVec;
    });
  };
  // ---- R5-scene (D17): the fluorescent glow rim of driven muscles and active areas (one uniform per material) ---------
  const glowRim = { applied: null, materials: 0 };
  const glowRimPatch = m => {
    const u = { value: new THREE.Vector4(0, 0, 0, GLOW_K.rimPower) };
    m.userData.nsGlowRim = u;
    glowRim.materials++;
    return composePatch(m, 'ns-glow-rim-r5', shader => {
      const p = patchGlowRimShaders(shader.vertexShader, shader.fragmentShader);
      glowRim.applied = p !== null && glowRim.applied !== false;
      if (!p) return;
      shader.fragmentShader = p.fragmentShader;
      shader.uniforms.nsGlowRim = u;
    });
  };
  // ---- R5-scene (D19, R23): the mirror body (a reflected copy of your body and arm, behind the brain, facing you) -----
  // mirrorRoot.matrix = mirrorMatrix (player world -> mirror world, det < 0); mirrorBodyGroup carries the body frame and
  // mirrorArmGroup the eye, so every twin takes exactly the player's pose matrices (the arm muscles even share the CPU-
  // skinned buffers). Own opaque materials (no first-person see-through rules), shaded with the same ns-colors rule.
  const mirrorRoot = new THREE.Group();
  mirrorRoot.name = 'ns-mirror (a mirror image of your body, behind the brain)';
  mirrorRoot.matrixAutoUpdate = false;
  mirrorRoot.visible = false;
  mirrorRoot.userData.nsMirror = true; // e2e detection contract
  scene.add(mirrorRoot);
  const mirrorBodyGroup = new THREE.Group();
  mirrorBodyGroup.name = 'ns-mirror body (BodyParts3D frame)';
  mirrorBodyGroup.matrixAutoUpdate = false;
  mirrorRoot.add(mirrorBodyGroup);
  const mirrorArmGroup = new THREE.Group();
  mirrorArmGroup.name = 'ns-mirror arm (eye frame)';
  mirrorArmGroup.matrixAutoUpdate = false;
  mirrorRoot.add(mirrorArmGroup);
  // Behind the glass (BEHIND_GLASS): one shared window uniform (the brain's projected ellipse, set in render()).
  const behindGlass = { applied: null, amount: 0 };
  const bgUniform = { value: new THREE.Vector4(0, BEHIND_GLASS.dim, 0, 0) }, bgWinUniform = { value: new THREE.Vector4(0, 0, 1, 1) };
  const behindGlassPatch = m => composePatch(m, 'ns-behind-glass-r5', shader => {
    const p = patchBehindGlassShaders(shader.vertexShader, shader.fragmentShader);
    behindGlass.applied = p !== null && behindGlass.applied !== false;
    if (!p) return;
    shader.fragmentShader = p.fragmentShader;
    shader.uniforms.nsBg = bgUniform; shader.uniforms.nsBgWin = bgWinUniform;
  });
  const mirrorBoneMaterial = behindGlassPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: 0.62, metalness: 0 })));
  const mirrorMuscleMaterial = () => behindGlassPatch(glowRimPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: 0.55, metalness: 0 }))));
  // ns-mirror (R5-mirror) owns the math: bodyBoundsFromPoints (the posed body), brainFarDistance, mirrorPlacement,
  // createMirrorState / placeMirror (orbit kept), mirrorTransform (det < 0). The scene keeps a DEFAULT state (placed when
  // the body is posed and the brain framed; orbit from setMirrorView), unless the integrator hands a whole ns-mirror state
  // or transform (setMirrorView), which then wins.
  const mirror = {
    enabled: true, ready: false, posed: false, body: null, samples: null, placement: null, state: null, orbit: { yaw: 0, pitch: 0 },
    external: null, worldCentre: null, transform: null, outlineNdc: null, frameKey: '', serial: 0, lod: false, twins: 0, brainRadiusMm: null, error: null
  };
  // ---- R5-scene (D18): the render camera. First person: the camera is the eye. Third person: setCameraPose. ----------
  let camPose = null, firstPose = null;
  let referenceOrigin = [0, 0, 0], referenceOriginSet = false, referenceCarry = null, referenceAngles = { yaw: 0, pitch: 0 };
  const activePosition = () => camPose ? camPose.position.slice() : firstPose ? firstPose.position.slice() : [0, 0, 0];
  const brainReferenceOrigin = () => lastBrainTransform && lastBrainTransform.referenceTranslation ? lastBrainTransform.referenceTranslation.slice() : [0, 0, 0];
  const camState = { mode: 'first', headInPlace: false, eyeDistM: 0 };
  let bodyPoseSerial = 0, armPoseSerial = 0; // R5-scene: pose change counters (bodyKeepOut cache)
  // ---- R5-scene (D17): glow links -----------------------------------------------------------------------------------
  const glowState = { links: [], eased: new Map(), touched: new Set(), lastAt: null, ribbons: 0, mirrorRibbons: 0, cpuMs: 0, rimMuscles: 0, rimAreas: 0, set: 0 };
  const glowVerts = (GLOW_LINK.segments + 1) * GLOW_LINK.across.length;
  const glowIdxPer = GLOW_LINK.segments * (GLOW_LINK.across.length - 1) * 6;
  function makeRibbonMesh(name, order) {
    const cap = GLOW_LINK.maxLinks * glowVerts;
    const pos = new Float32Array(3 * cap), col = new Float32Array(4 * cap);
    const idx = new Uint32Array(GLOW_LINK.maxLinks * glowIdxPer);
    const A = GLOW_LINK.across.length;
    let k = 0;
    for (let r = 0; r < GLOW_LINK.maxLinks; r++) {
      const o = r * glowVerts;
      for (let i = 0; i < GLOW_LINK.segments; i++) for (let j = 0; j + 1 < A; j++) {
        const a = o + i * A + j, b = a + 1, c = a + A, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const g = keep(new THREE.BufferGeometry());
    const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 4);
    if (THREE.DynamicDrawUsage !== undefined && typeof pa.setUsage === 'function') { pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage); }
    g.setAttribute('position', pa);
    g.setAttribute('color', ca);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    const params = { vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false };
    if (THREE.AdditiveBlending !== undefined) params.blending = THREE.AdditiveBlending;
    const m = keep(new THREE.MeshBasicMaterial(params));
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    // e2e detection contract: userData.nsGlow { target, regionId (strongest), regionIds, muscles (element ids / arm mesh
    // names), intensity } (updated every frame by updateGlow).
    mesh.userData.nsGlow = { target: order > RENDER_ORDER.glass ? 'player' : 'mirror', regionId: null, regionIds: [], muscles: [], intensity: 0 };
    scene.add(mesh);
    return { mesh, pos, col, pa, ca, n: 0 };
  }
  // Your body's links: after the arm (BODY_ORDER.arm), depth-tested, so a link runs INTO the muscle it reaches. The mirror
  // body's links: before the brain areas and the glass (they lie behind them), so the areas and the glass draw over them.
  const glowOwn = makeRibbonMesh('ns-glow links (brain area -> your muscles; a picture of the simulation, not a nerve)', BODY_ORDER.arm + 2);
  const glowMirror = makeRibbonMesh('ns-glow links (brain area -> the mirror body)', RENDER_ORDER.glassXray - 0.5);

  const onLost = e => { if (e && typeof e.preventDefault === 'function') e.preventDefault(); lost = true; };
  const onRestored = () => {
    lost = false;
    lastMatrices = null; // re-skin and recolour on the next frame
    armAppliedReady = false; // R173: a replacement arm has no retained applied pose yet.
    lastStripDrives = null;
    for (const m of muscles) m.lastT = NaN;
    if (strip) strip.cpuDrives = null;
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  function indexedGeometry(positions, indices) {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    return g;
  }

  function checkMesh(m, what) {
    if (!m || !m.positions || !m.indices || m.positions.length % 3 !== 0 || m.indices.length % 3 !== 0 || m.positions.length === 0) {
      fail('scene_input', `${what} needs positions and triangle indices`);
    }
  }

  /** Arm meshes. bones: [{ segment, positions (rest mm), indices, name }]; muscles: [{ muscleKey|null, positions,
   * indices, weights (skinWeights), name }]; baselineDrive: the tint for muscles with no functional-map role. */
  function setArm({ bones: boneList = [], muscles: muscleList = [], baselineDrive: base = 0.08 } = {}) {
    if (armSet) fail('scene_state', 'setArm may be called once');
    armSet = true;
    baselineDrive = Number.isFinite(base) ? Math.min(1, Math.max(0, base)) : 0;
    for (const b of boneList) {
      checkMesh(b, `bone ${b && b.name}`);
      if (!SEGMENTS.includes(b.segment)) fail('scene_input', `bone ${b.name} has unknown segment ${b.segment}`);
      const geo = indexedGeometry(b.positions, b.indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, boneMaterial);
      mesh.name = String(b.name || b.segment);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = BODY_ORDER.arm;
      armGroup.add(mesh);
      // R5-scene (D19): the mirror twin shares the geometry and takes the same segment matrix.
      const tw = new THREE.Mesh(geo, mirrorBoneMaterial);
      tw.userData.nsFullGeometry = geo;
      tw.name = `mirror image: ${mesh.name}`;
      tw.matrixAutoUpdate = false;
      mirrorArmGroup.add(tw);
      mesh.userData.nsMirrorTwin = tw;
      bones.push({ mesh, segment: b.segment, mirror: tw,
        // Retain the normal loader's validated source id for copied diagnostics; placeholders may have no id.
        sourceElementId: typeof b.id === 'string' && b.id ? b.id : null });
      depthTwin(mesh, armDepthMaterial, BODY_ORDER.arm - 0.5, armTwins);
    }
    for (const m of muscleList) {
      checkMesh(m, `muscle ${m && m.name}`);
      const n = m.positions.length / 3;
      if (!m.weights || !m.weights.i0 || m.weights.i0.length < n) fail('scene_input', `muscle ${m.name} needs skin weights`);
      const pos = new Float32Array(m.positions.length);
      const nor = new Float32Array(m.positions.length);
      const geo = keep(new THREE.BufferGeometry());
      const posAttr = new THREE.BufferAttribute(pos, 3);
      const norAttr = new THREE.BufferAttribute(nor, 3);
      geo.setAttribute('position', posAttr);
      geo.setAttribute('normal', norAttr);
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      const mat = glowRimPatch(ghostPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: 0.55, metalness: 0 }))));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = String(m.name || 'muscle');
      mesh.frustumCulled = false; // CPU-skinned: the rest bounding sphere would be stale
      mesh.renderOrder = BODY_ORDER.arm;
      armGroup.add(mesh);
      depthTwin(mesh, armDepthMaterial, BODY_ORDER.arm - 0.5, armTwins);
      // R5-scene (D19): the mirror twin shares the CPU-skinned buffers (skinned once for both bodies).
      const tw = new THREE.Mesh(geo, mirrorMuscleMaterial());
      tw.userData.nsFullGeometry = geo;
      tw.name = `mirror image: ${mesh.name}`;
      tw.frustumCulled = false;
      tw.matrixAutoUpdate = false;
      mirrorArmGroup.add(tw);
      mesh.userData.nsMirrorTwin = tw;
      muscles.push({
        mesh, mat, key: m.muscleKey === undefined ? null : m.muscleKey, rest: m.positions,
        restNormals: computeNormals(m.positions, m.indices), weights: m.weights, pos, nor, posAttr, norAttr, lastT: NaN,
        mirror: tw, centre: null, centreFor: null,
        // R5-integrate-core (D15): the element id (Body Worlds layers) and the original rest geometry (the skin weights
        // were computed from it; setArmLayers skins a lifted copy with the same weights).
        id: typeof m.id === 'string' ? m.id : null, restBase: m.positions, indices: m.indices, lifted: null
      });
      mesh.userData.elementId = typeof m.id === 'string' ? m.id : null;
    }
  }

  /** R5-integrate-core (D15, R5-body "Left arm"): Body Worlds layers on the CPU-skinned left arm. liftedById: { elementId:
   * Float32Array } = ns-body detachedRestPositions(id, restPositions) for each superficial left-arm muscle (rest frame;
   * one rigid move per muscle); amount 0..1 blends the original and the lifted rest positions. The SAME skin weights
   * (from the original rest positions) skin the result, so the lift rides on every arm pose, and the mirror twins share
   * the skinned buffers. Muscles not listed stay as they are. Returns { lifted, amount }. */
  let armLayerAmount = 0;
  function setArmLayers(liftedById = null, amount = 1) {
    const a = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
    let n = 0, changed = false;
    for (const m of muscles) {
      const q = regionalLayerQualification(m.id);
      const L = q.candidate && liftedById && m.id && Object.prototype.hasOwnProperty.call(liftedById, m.id) && liftedById[m.id] && liftedById[m.id].length === m.restBase.length && liftedById[m.id] !== m.restBase ? liftedById[m.id] : null;
      if (L !== m.lifted) { m.lifted = L; changed = true; }
      if (!m.lifted) {
        if (m.rest !== m.restBase) { m.rest = m.restBase; m.restNormals = computeNormals(m.restBase, m.indices); changed = true; }
        const bw = Object.freeze({ ...regionalLayerMetadata(m.id, false), displayStatus: 'not-selected',
          offsetMm: 0, targetOffsetMm: 0, amount: a, offsetVertex: 0, offsetFrame: 'source-rest-mm' });
        m.mesh.userData.bodyWorlds = bw;
        if (m.mirror) m.mirror.userData.bodyWorlds = bw;
        continue;
      }
      n++;
      let r;
      if (a >= 1) r = m.lifted;
      else if (a <= 0) r = m.restBase;
      else { r = new Float32Array(m.restBase.length); for (let i = 0; i < r.length; i++) r[i] = m.restBase[i] + a * (m.lifted[i] - m.restBase[i]); }
      if (r !== m.rest) { m.rest = r; m.restNormals = computeNormals(r, m.indices); changed = true; }
      // First-vertex SOURCE-REST displacement, not world motion or a maximum
      // over the muscle. Keep the full target separate from the applied blend.
      let targetD = 0, appliedD = 0;
      for (let i = 0; i < 3; i++) {
        targetD += (m.lifted[i] - m.restBase[i]) ** 2;
        appliedD += (m.rest[i] - m.restBase[i]) ** 2;
      }
      const bw = Object.freeze({
        ...regionalLayerMetadata(m.id, true),
        displayStatus: a > 0 ? 'applied' : 'off',
        offsetMm: Math.round(Math.sqrt(appliedD) * 10) / 10,
        targetOffsetMm: Math.round(Math.sqrt(targetD) * 10) / 10,
        amount: a, offsetVertex: 0, offsetFrame: 'source-rest-mm'
      });
      m.mesh.userData.bodyWorlds = bw;
      if (m.mirror) m.mirror.userData.bodyWorlds = bw;
    }
    if (changed || a !== armLayerAmount) { armLayerAmount = a; lastMatrices = null; } // re-skin on the next updatePose
    return { lifted: n, amount: armLayerAmount };
  }

  /** Brain meshes in source mm: glass context [{ id?, positions, indices, name }], the focus strip { positions,
   * indices, u } (splitBand focus) and the representative markers [{ actionId, position }].
   * U2b-scene REGION MODE: with `segmentation` (ns-brain segmentMotorStrips of both hemispheres) every body-map region
   * is drawn (buildRegions), glass entries whose id is a segmented strip mesh are replaced by the segmentation's
   * unassigned strip triangles (drawn as glass) and the legacy focus strip is not drawn (`focus` is then optional). */
  function setBrain({ glass: glassListIn = [], focus, markers: markerList = [], segmentation: seg = null } = {}) {
    if (brainSet) fail('scene_state', 'setBrain may be called once');
    brainSet = true;
    if (seg && !(seg.kind === 'ns-motor-segmentation' && Array.isArray(seg.parts) && Array.isArray(seg.regions))) fail('scene_input', 'segmentation must be an ns-brain segmentMotorStrips result');
    regionMode = Boolean(seg);
    segmentation = seg;
    let glassList = glassListIn;
    if (regionMode) {
      const stripIds = new Set(seg.strips.map(s => s.id));
      glassList = glassListIn.filter(g => !(g && g.id && stripIds.has(g.id)));
      for (const u of seg.unassigned || []) {
        if (u && u.faceCount > 0) glassList.push({ id: null, name: `${u.meshId} unassigned motor-strip triangles (glass)`, positions: u.positions, indices: u.indices });
      }
    }
    // Static children of the (matrixAutoUpdate = false) brain group: identity local matrices, no per-frame recompose.
    const still = obj => { obj.matrixAutoUpdate = false; obj.updateMatrix(); return obj; };
    const xraySet = new Set(glassXraySubset(glassList.map(g => (g && g.name) || ''), glassXrayMode));
    // R3-scene: the brain's 3D support points (the silhouette basis for the orbit arrows, every glass and strip vertex)
    // and, from the same support planes, each glass vertex's groove depth for the gyri / sulci cue.
    const t0 = nowMs();
    const stripLists = regionMode ? seg.strips.map(st => st.positions) : focus && focus.positions ? [focus.positions] : [];
    const depthMin = [Infinity, Infinity, Infinity], depthMax = [-Infinity, -Infinity, -Infinity]; let depthCount = 0;
    for (const P of [...glassList.map(g => g && g.positions), ...stripLists]) {
      if (!P || !P.length) continue;
      if (P.length % 3) fail('scene_input', 'whole brain source positions need xyz triples');
      for (let i = 0; i < P.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          const v = P[i + j]; if (!Number.isFinite(v)) fail('scene_input', 'finite whole brain source positions required');
          depthMin[j] = Math.min(depthMin[j], v); depthMax[j] = Math.max(depthMax[j], v);
        }
        depthCount++;
      }
    }
    brainDepthBounds = depthCount ? { min: depthMin, max: depthMax, sourcePositionCount: depthCount } : null;
    // R3-fix (review code F3, load time): with a segmentation, its whole-brain outline (ns-brain brainOutlinePoints, the
    // extreme vertices over 1024 directions, already computed) is the basis, instead of re-scanning every vertex here.
    const outlineBasis = regionMode && seg && seg.outline && seg.outline.points && seg.outline.points.length >= 9 ? seg.outline.points : null;
    brainSupport = supportPoints(outlineBasis ? [outlineBasis] : [...glassList.map(g => g && g.positions), ...stripLists], sphereDirections(GLASS_READ.directions));
    glassRead.supportBasis = outlineBasis ? 'segmentation outline' : 'all vertices';
    // R3-fix (S31 at 21:9): the orbit-arrow plan's silhouette hull uses the denser outline (1024 directions) when there
    // is one, so the planned gap matches the drawn outline on big, close-up brains.
    brainHullPoints = outlineBasis ? Float32Array.from(outlineBasis) : null;
    compassBrainSourceRevision++;
    glassRead.supportPoints = brainSupport.points.length / 3;
    glassList.forEach((g, gi) => {
      checkMesh(g, `glass ${g && g.name}`);
      const geo = indexedGeometry(g.positions, g.indices);
      geo.computeVertexNormals();
      geo.setAttribute('nsSulc', new THREE.BufferAttribute(sulcalDepth(g.positions, brainSupport, { lo: GLASS_READ.sulcLoMm, hi: GLASS_READ.sulcHiMm }), 1));
      const mesh = still(new THREE.Mesh(geo, glassMaterial));
      mesh.name = String(g.name || 'brain glass');
      mesh.renderOrder = RENDER_ORDER.glass;
      brainGroup.add(mesh);
      glass.push(mesh);
      const depthMesh = still(new THREE.Mesh(geo, glassDepthMaterial)); // shares the geometry; disposed once via `keep`
      depthMesh.name = `${mesh.name} (depth pre-pass)`;
      depthMesh.renderOrder = RENDER_ORDER.glassDepth;
      brainGroup.add(depthMesh);
      glassDepth.push(depthMesh);
      if (!xraySet.has(gi)) return; // A2-render R1: the faint x-ray pass only for the GLASS_XRAY subset
      const xrayMesh = still(new THREE.Mesh(geo, glassXrayMaterial));
      xrayMesh.name = `${mesh.name} (x-ray)`;
      xrayMesh.renderOrder = RENDER_ORDER.glassXray;
      brainGroup.add(xrayMesh);
      glassXray.push(xrayMesh);
    });
    if (regionMode) buildRegions(seg, still);
    else buildFocusStrip(focus, markerList, still);
    buildMarkers(markerList, still);
    rayTargets = regionMode ? [...glass, ...regionMeshes] : [...glass, strip.mesh]; // HUD-only raycast targets, built once
    brainSamples = sampleBrain(glassList, regionMode ? seg.strips : (focus ? [focus] : []));
    glassRead.sulcMs = Math.round(nowMs() - t0);
  }

  /** Up to ~maxPoints source-mm points spread over the brain meshes (strided vertices), for the projected bounds that
   * place the orbit arrows. Built once. */
  function sampleBrain(glassList, stripList, maxPoints = 900) {
    const lists = [...glassList, ...stripList].filter(m => m && m.positions && m.positions.length >= 3);
    const total = lists.reduce((s, m) => s + m.positions.length / 3, 0);
    if (!total) return null;
    const stride = Math.max(1, Math.ceil(total / maxPoints));
    const out = [];
    let k = 0;
    for (const m of lists) {
      const p = m.positions;
      for (let i = 0; i < p.length; i += 3, k++) if (k % stride === 0) out.push(p[i], p[i + 1], p[i + 2]);
    }
    return Float32Array.from(out);
  }

  /** Region mode: one translucent lit material per region, a depth pre-pass mesh per part, boundary outlines (left-arm
   * regions always, others on hover), and the DOM group labels. */
  function buildRegions(seg, still) {
    // Outline normals are oriented away from the brain centre (the mean of the support points).
    let outlineCentre = null;
    if (brainSupport && brainSupport.points.length >= 3) {
      const P = brainSupport.points, k = P.length / 3;
      outlineCentre = [0, 0, 0];
      for (let i = 0; i < P.length; i += 3) { outlineCentre[0] += P[i] / k; outlineCentre[1] += P[i + 1] / k; outlineCentre[2] += P[i + 2] / k; }
    }
    // R4-scene: the left-arm territory's outer border (welded union of every left-arm part) and, per part, each vertex's
    // closeness to it (the cyan rim, LEFT_ARM_RIM).
    const leftParts = [];
    for (const r of seg.regions) if (r.isLeftArm) for (const pi of r.partIndices || []) { const part = seg.parts[pi]; if (part && part.faceCount > 0 && !leftParts.includes(part)) leftParts.push(part); }
    const t0Rim = nowMs();
    const leftBorder = leftParts.length ? weldedBoundarySegments(leftParts) : null;
    for (const r of seg.regions) {
      const material = keep(new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: REGION_RENDER.roughness, metalness: REGION_RENDER.metalness, transparent: true,
        opacity: regionStyle.restOpacity, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      }));
      material.forceSinglePass = true;
      if (r.isLeftArm && leftBorder && leftBorder.length) {
        material.onBeforeCompile = shader => {
          const patched = patchEdgeShaders(shader.vertexShader, shader.fragmentShader);
          leftArmRim.applied = patched !== null && leftArmRim.applied !== false;
          if (!patched) return;
          shader.vertexShader = patched.vertexShader;
          shader.fragmentShader = patched.fragmentShader;
          shader.uniforms.nsEdgeColor = leftArmRimUniforms.color;
          shader.uniforms.nsEdgeParams = leftArmRimUniforms.params;
        };
        material.customProgramCacheKey = () => 'ns-region-leftarm-rim-r4';
      }
      // R5-scene: the lit area keeps its gyral relief under the perspective squash (rigid normals, P2) and can glow (D17).
      glowRimPatch(rigidPatch(material));
      const rec = { region: r, id: r.id, index: regions.length, material, meshes: [], depthMeshes: [], outline: null, key: '', activity: 0, activated: 0, hovered: false, opacity: regionStyle.restOpacity };
      const edgeLists = [];
      for (const pi of r.partIndices || []) {
        const part = seg.parts[pi];
        if (!part || !(part.faceCount > 0)) continue;
        const geo = indexedGeometry(part.positions, part.indices);
        geo.computeVertexNormals();
        if (r.isLeftArm && leftBorder && leftBorder.length) geo.setAttribute('nsEdge', new THREE.BufferAttribute(boundaryCloseness(part.positions, leftBorder, LEFT_ARM_RIM.widthMm), 1));
        const mesh = still(new THREE.Mesh(geo, material));
        const hemiText = part.hemisphere === 'right' ? 'right hemisphere' : 'left hemisphere';
        mesh.name = `motor region: ${r.id} (${r.label}; ${hemiText}${r.isLeftArm ? '; LEFT ARM' : ''}; simulated activity)`;
        mesh.userData = { regionId: r.id, hemisphere: part.hemisphere, isLeftArm: r.isLeftArm === true, surface: part.surface };
        mesh.renderOrder = RENDER_ORDER.region;
        brainGroup.add(mesh);
        rec.meshes.push(mesh);
        regionMeshes.push(mesh);
        const depthMesh = still(new THREE.Mesh(geo, regionDepthMaterial));
        depthMesh.name = `motor region ${r.id} (depth pre-pass)`;
        depthMesh.renderOrder = RENDER_ORDER.regionDepth;
        brainGroup.add(depthMesh);
        rec.depthMeshes.push(depthMesh);
        if (hasLines) edgeLists.push(part);
      }
      // R3-scene: a SMOOTH region outline (Chaikin-smoothed, lifted off the surface) instead of the raw triangle-edge
      // zigzag. At rest only the left-arm sub-areas show a faint one; every region shows it while hovered or activated.
      if (hasLines && edgeLists.length) {
        const pos = smoothTerritoryOutline(edgeLists, { centre: outlineCentre, ...REGION_OUTLINE });
        if (pos.length) {
          const lg = keep(new THREE.BufferGeometry());
          lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          const line = still(new THREE.LineSegments(lg, r.isLeftArm ? leftArmLineMaterial : otherLineMaterial));
          line.name = `motor region outline: ${r.id}${r.isLeftArm ? ' (left arm)' : ''}`;
          line.renderOrder = RENDER_ORDER.regionLine;
          line.visible = r.isLeftArm === true;
          brainGroup.add(line);
          rec.outline = line;
        }
      }
      applyRegionStyle(rec, 0, 0, false, true);
      // R4-fix (review F2): up to SMALL_MARK.samplePoints of the region's own vertices (brain-local mm) and their mean,
      // for the switched-on marker of areas that are only a sliver on screen.
      {
        let total = 0;
        for (const pi of r.partIndices || []) { const part = seg.parts[pi]; if (part && part.faceCount > 0) total += part.positions.length / 3; }
        const stride = Math.max(1, Math.ceil(total / SMALL_MARK.samplePoints)), pts = [];
        let k = 0;
        for (const pi of r.partIndices || []) {
          const part = seg.parts[pi];
          if (!part || !(part.faceCount > 0)) continue;
          for (let i = 0; i < part.positions.length; i += 3, k++) if (k % stride === 0) pts.push(part.positions[i], part.positions[i + 1], part.positions[i + 2]);
        }
        const n = pts.length / 3, c = [0, 0, 0];
        for (let i = 0; i < pts.length; i += 3) { c[0] += pts[i] / n; c[1] += pts[i + 1] / n; c[2] += pts[i + 2] / n; }
        rec.markPts = n >= 3 ? Float32Array.from(pts) : null;
        rec.markCentre = n >= 1 ? c : null;
      }
      regions.push(rec);
      regionById.set(r.id, rec);
    }
    leftArmRim.ms = Math.round(nowMs() - t0Rim);
    leftArmRim.borderSegments = leftBorder ? leftBorder.length / 6 : 0;
    labelGroups = regionLabelGroups(seg.regions);
    if (hasLines) {
      for (const g of labelGroups) {
        const parts = [];
        for (const id of g.regionIds) {
          const r = seg.regions.find(x => x.id === id);
          for (const pi of (r && r.partIndices) || []) { const part = seg.parts[pi]; if (part && part.hemisphere === g.hemisphere && part.faceCount > 0) parts.push(part); }
        }
        const seg3 = smoothTerritoryOutline(parts, { centre: outlineCentre, ...REGION_OUTLINE });
        if (!seg3.length) continue;
        const lg = keep(new THREE.BufferGeometry());
        lg.setAttribute('position', new THREE.BufferAttribute(seg3, 3));
        const line = still(new THREE.LineSegments(lg, g.isLeftArm ? territoryLineMaterial : groupLineMaterial));
        line.name = `motor territory outline: ${g.isLeftArm ? 'LEFT ARM' : g.key} (${g.hemisphere} hemisphere)`;
        line.userData = { territory: `${g.hemisphere}:${g.key}`, isLeftArm: g.isLeftArm };
        line.renderOrder = RENDER_ORDER.regionLine + 0.05;
        brainGroup.add(line);
        groupOutlines.push(line);
      }
    }
    if (overlay) {
      injectSceneStyle();
      for (const g of labelGroups) {
        // R3-scene (D3): plain words. The body part reads first and large; only the left-arm label carries the hemisphere
        // line ("brain's right half (right hemisphere)"), the one science point it must make.
        const disp = regionLabelDisplay(g);
        if (!disp) continue;
        const e = el('div', `ns-region-label ns-r3${g.isLeftArm ? ' ns-region-label-leftarm' : ''}`, overlay);
        el('span', 'ns-region-label-part', e).textContent = disp.main;
        if (disp.sub) el('span', 'ns-region-label-hemi', e).textContent = disp.sub;
        e.setAttribute('data-ns-region-group', `${g.hemisphere}:${g.key}`);
        e.setAttribute('aria-label', g.text);
        e.title = g.text;
        e.hidden = true;
        labelEls.push({ el: e, group: g, display: disp, shownNow: false, last: { left: '', top: '', shown: false, hover: false, faded: false } });
        // Estimated label box (no layout reads): R3_LABEL_FONT sizes, bold sans-serif ~0.6 em per character + padding.
        const F = R3_LABEL_FONT;
        const w = g.isLeftArm ? Math.max(disp.main.length * F.leftArmPx * 0.62, disp.sub.length * F.subPx * 0.55) + 2 * F.padXPx : disp.main.length * F.otherPx * 0.6 + 2 * F.padXPx;
        const h = g.isLeftArm ? F.leftArmPx * 1.25 + F.subPx * 1.25 + 2 * F.padYPx : F.otherPx * 1.3 + 2 * F.padYPx;
        labelBoxes.push({ x: 0, y: 0, w: Math.ceil(w), h: Math.ceil(h), skip: true });
        labelItems.push({ id: `${g.hemisphere}:${g.key}`, x: NaN, y: NaN, w: Math.ceil(w), h: Math.ceil(h), priority: REGION_LABEL_PRIORITY[g.key] || 0, required: g.isLeftArm, text: disp.main });
      }
    }
  }

  /** Write one region's material state from its simulated state (skipped when the quantised state is unchanged). */
  function applyRegionStyle(rec, activity, activatedCount, hovered, force = false) {
    const a = fin01(activity);
    const q = Math.round(a * REGION_RENDER.quantize);
    const n = Number.isFinite(activatedCount) ? Math.max(0, Math.floor(activatedCount)) : 0;
    const key = `${q}|${n}|${hovered ? 1 : 0}`;
    if (!force && key === rec.key) return false;
    rec.key = key;
    rec.activity = a; rec.activated = n; rec.hovered = hovered;
    const s = regionDisplayStyle(rec.region, { activity: q / REGION_RENDER.quantize, activatedCount: n, hovered }, shadeScratch, regionStyle);
    rec.material.color.setRGB(s.albedo[0], s.albedo[1], s.albedo[2]);
    rec.material.emissive.setRGB(s.emission[0], s.emission[1], s.emission[2]);
    rec.material.opacity = s.opacity;
    rec.opacity = s.opacity;
    if (rec.outline) {
      const leftArm = rec.region.isLeftArm === true;
      rec.outline.material = hovered ? hoverLineMaterial : n >= 1 && activatedLineMaterial ? activatedLineMaterial : (leftArm ? leftArmLineMaterial : otherLineMaterial);
      rec.outline.renderOrder = hovered ? RENDER_ORDER.regionLine + 0.1 : RENDER_ORDER.regionLine;
      // R3-scene declutter: other-body region outlines only while hovered or activated.
      rec.outline.visible = hovered || n >= 1 || leftArm;
    }
    return true;
  }

  /** Legacy (pre-region) focus strip of the right precentral arm band. */
  function buildFocusStrip(focus, markerList, still) {
    checkMesh(focus, 'focus strip');
    const n = focus.positions.length / 3;
    if (!focus.u || focus.u.length !== n) fail('scene_input', 'focus strip needs one u value per vertex');
    // A2-render R1: lit, opaque, depth-writing strip. The shader patch draws region tints/borders, the hover outline and
    // the two-scale simulated glow per fragment from the `nsU` attribute (the same u the picker interpolates); the
    // vertex colours are the CPU fallback (ns-brain stripShade) used only when the patch hooks are missing.
    const geo = indexedGeometry(focus.positions, focus.indices);
    geo.computeVertexNormals();
    geo.setAttribute('nsU', new THREE.BufferAttribute(focus.u instanceof Float32Array ? focus.u : Float32Array.from(focus.u), 1));
    const colors = new Float32Array(3 * n);
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    geo.setAttribute('color', colorAttr);
    const mat = keep(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: MATERIAL.stripRoughness, metalness: MATERIAL.stripMetalness, side: THREE.DoubleSide
    }));
    const markerPos = new Float32Array(4 * MARKERS.length);
    MARKERS.forEach((m, i) => {
      const mk = markerList.find(x => x && x.actionId === m.actionId);
      const p = mk && mk.position;
      if (p && p.length === 3 && Array.prototype.every.call(p, Number.isFinite)) {
        markerPos[4 * i] = p[0]; markerPos[4 * i + 1] = p[1]; markerPos[4 * i + 2] = p[2]; markerPos[4 * i + 3] = 1;
      }
    });
    const tints = new Float32Array(3 * MARKERS.length);
    MARKERS.forEach((m, i) => { const t = regionTintLinear(m.actionId); tints[3 * i] = t[0]; tints[3 * i + 1] = t[1]; tints[3 * i + 2] = t[2]; });
    const uniforms = {
      nsDrive: { value: new Float32Array(MARKERS.length) },
      nsMarkerU: { value: Float32Array.from(MARKERS, m => m.u) },
      nsMarkerPos: { value: markerPos },
      nsTint: { value: tints },
      nsHover: { value: -1 },
      nsTime: { value: 0 },
      nsShimmer: { value: stripShader.shimmer ? 1 : 0 }
    };
    mat.onBeforeCompile = shader => {
      const patched = patchStripShaders(shader.vertexShader, shader.fragmentShader);
      stripShader.applied = patched !== null;
      if (patched === null) { if (strip) strip.cpuDrives = null; return; }
      shader.vertexShader = patched.vertexShader;
      shader.fragmentShader = patched.fragmentShader;
      Object.assign(shader.uniforms, uniforms);
    };
    mat.customProgramCacheKey = () => 'ns-strip-a2r1';
    rigidPatch(mat); // R5-scene (P2): rigid normals under the perspective squash
    const mesh = still(new THREE.Mesh(geo, mat));
    mesh.name = 'representative left-arm/hand band of the right precentral strip (simulated activity)';
    mesh.renderOrder = RENDER_ORDER.strip;
    brainGroup.add(mesh);
    strip = {
      mesh, depthMesh: null, material: mat, u: focus.u, positions: focus.positions, markers: markerList, colors, colorAttr,
      uniforms, cpuDrives: null, intensity: new Float32Array(n)
    };
    recolourStripCpu(); // rest colours for the fallback (and before the first compile)
  }

  /** Representative left-arm markers (the dots classifyGaze / classifyRegionGaze pick). */
  function buildMarkers(markerList, still) {
    if (!markerList || markerList.length === 0) return;
    const octa = keep(new THREE.BufferGeometry());
    octa.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(OCTA_POSITIONS), 3));
    octa.setIndex(new THREE.BufferAttribute(Uint32Array.from(OCTA_INDICES), 1));
    for (const mk of markerList) {
      const p = mk && mk.position;
      if (!p || p.length !== 3 || !p.every(Number.isFinite)) fail('scene_input', 'marker needs a finite source position');
      const mmat = keep(new THREE.MeshBasicMaterial({ color: MATERIAL.marker, transparent: true, opacity: MATERIAL.markerOpacity, depthWrite: false }));
      const mesh = new THREE.Mesh(octa, mmat);
      mesh.name = `representative marker: ${mk.actionId}`;
      const solid = markerSolid(mk, false); // the picker's solid (repair R5): centre = position + lift, scale = radius
      mesh.position.set(solid.centre[0], solid.centre[1], solid.centre[2]);
      mesh.scale.setScalar(solid.scale);
      still(mesh); // static; highlightMarker re-composes the matrix when the scale changes
      mesh.renderOrder = RENDER_ORDER.marker;
      brainGroup.add(mesh);
      markers.push({ mesh, mat: mmat, actionId: mk.actionId, active: false, source: mk });
    }
  }

  /** CPU strip colours (no-shader fallback and the initial rest colours): ns-brain stripShade albedo + glow. */
  function recolourStripCpu() {
    if (!strip) return;
    const dv = strip.uniforms.nsDrive.value, drives = {};
    for (let i = 0; i < MARKERS.length; i++) drives[MARKERS[i].actionId] = dv[i];
    const hoverActionId = typeof highlighted === 'string' ? highlighted : null;
    const pos = strip.positions, c = strip.colors, p = [0, 0, 0];
    for (let i = 0; i < strip.u.length; i++) {
      p[0] = pos[3 * i]; p[1] = pos[3 * i + 1]; p[2] = pos[3 * i + 2];
      const s = stripShade(strip.u[i], p, drives, strip.markers, { hoverActionId });
      c[3 * i] = Math.min(1, s.albedo[0] + s.glow[0]); c[3 * i + 1] = Math.min(1, s.albedo[1] + s.glow[1]); c[3 * i + 2] = Math.min(1, s.albedo[2] + s.glow[2]);
    }
    strip.colorAttr.needsUpdate = true;
    strip.cpuDrives = Float32Array.from(dv);
  }

  /** Place the whole brain group: world = T(0, 0, -distance) * S(k) * R * T(-centre) (ns-brain brainWorldMatrix). */
  function setPlacement(placement) {
    // Region mode: the brain is placed by setBrainTransform (orbit + grab); the legacy band placement is ignored so the
    // drawn brain always matches the transform the gaze is picked through.
    if (regionMode && brainTransformSet) return false;
    brainGroup.matrix.fromArray(brainWorldMatrix(placement));
    brainGroup.matrixWorldNeedsUpdate = true;
    brainGroup.updateMatrixWorld(true);
    return true;
  }

  /** U2b-scene: place the brain group with an ns-brain brainViewTransform result (its column-major `matrix`, world from
   * source mm; orbit about the locked brain centre and the grab carry). `params` is informational. */
  function setBrainTransform(transformIn) {
    const m0 = transformIn && transformIn.matrix;
    if (!m0 || m0.length !== 16 || !Array.prototype.every.call(m0, Number.isFinite)) fail('scene_input', 'setBrainTransform needs a brainViewTransform result with a finite 4x4 matrix');
    lastBrainTransform = transformIn;
    // R4-scene: the QA / test distance factor (1 in play): k times farther and k times larger, same on-screen size.
    const transform = brainDistK !== 1 ? scaleBrainDistance(transformIn, brainDistK) : transformIn;
    const m = transform.matrix;
    brainGroup.matrix.fromArray(m);
    brainGroup.matrixWorldNeedsUpdate = true;
    brainGroup.updateMatrixWorld(true);
    brainTransformSet = true;
    farEyeView.rot = transform.rotation ? Array.from(transform.rotation) : null;
    farEyeView.pw = transform.pivotWorld ? Array.from(transform.pivotWorld) : null;
    farEyeView.K = Number.isFinite(transform.perspectiveK) ? transform.perspectiveK : 1;
    // R3-scene: the arrows' reference view is the default look carried with the grab (brainViewTransform grabYaw /
    // grabPitch, radians), and their anchors sit at the brain pivot's distance.
    arrowRef.yaw = Number.isFinite(transform.grabYaw) ? transform.grabYaw : 0;
    arrowRef.pitch = Number.isFinite(transform.grabPitch) ? transform.grabPitch : 0;
    const pw = transform.pivotWorld;
    const rp = transform.referenceTranslation || [0, 0, 0];
    const dist = pw && pw.length === 3 ? Math.hypot(pw[0] - rp[0], pw[1] - rp[1], pw[2] - rp[2]) : NaN;
    arrowRef.dist = Number.isFinite(dist) && dist > 0 ? dist : Math.hypot(m[12], m[13], m[14]) || BRAIN_ANCHOR_DIST_FALLBACK_M;
    arrowRef.k = Number.isFinite(transform.k) && transform.k > 0 ? transform.k : null;
    arrowRef.pivot = transform.pivot && transform.pivot.length === 3 ? Array.from(transform.pivot) : null;
    updateMirrorPlacement();
    updateCameraRange();
    overlayDirty = true;
    return true;
  }

  /** R4-scene: the far plane follows the brain's farthest support point (farPlaneFor), so a brain moved farther away is
   * never clipped; the near plane stays CAMERA.near for the hand. Called whenever the brain transform changes. */
  const cameraRange = { far: far, brainFarM: null, brainNearM: null, mirrorFarM: null };
  function updateCameraRange() {
    const P = brainSupport && brainSupport.points;
    if (!P || P.length < 3) return;
    const e = brainGroup.matrixWorld.elements;
    // R5-scene (D18 / D19): distances from the RENDER camera (the eye in first person) to the brain and the mirror body.
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    let dMax = 0, dMin = Infinity;
    for (let i = 0; i < P.length; i += 3) {
      const x = e[0] * P[i] + e[4] * P[i + 1] + e[8] * P[i + 2] + e[12], y = e[1] * P[i] + e[5] * P[i + 1] + e[9] * P[i + 2] + e[13], z = e[2] * P[i] + e[6] * P[i + 1] + e[10] * P[i + 2] + e[14];
      const d = Math.hypot(x - cx, y - cy, z - cz);
      if (d > dMax) dMax = d; if (d < dMin) dMin = d;
    }
    cameraRange.brainFarM = dMax; cameraRange.brainNearM = dMin;
    let fFar = dMax;
    if (mirror.transform && mirror.body) {
      const a = mirror.transform.centre, dm = Math.hypot(a[0] - cx, a[1] - cy, a[2] - cz) + mirror.transform.scale * mirror.body.radius;
      cameraRange.mirrorFarM = dm;
      if (dm > fFar) fFar = dm;
    }
    const f = farPlaneFor(fFar, far);
    if (f !== camera.far) { camera.far = f; camera.updateProjectionMatrix(); cameraRange.far = f; }
  }

  /** R4-scene: true while Space-drag holds the brain (ns-app: out.brainView.grab.active), false on release. The glass
   * then shows the HELD_CUE glow, easing out after release. Returns the target (true / false). */
  function setBrainHeld(on) {
    heldCue.target = on === true ? 1 : 0;
    return heldCue.target === 1;
  }
  /** R4-polish (D7 + "arrows obviously clickable"): the "Try this" goal now shown (ns-guide goal id or null). While it is
   * 'orbit', the overlay carries data-ns-guide-goal="orbit" and CSS gives the four arrows a soft attention ring (a
   * steady ring under prefers-reduced-motion). Display only. */
  let guideGoalAttr = '';
  function setGuideGoal(id) {
    const v = typeof id === 'string' ? id : '';
    if (v !== guideGoalAttr && overlay) { guideGoalAttr = v; if (v) overlay.setAttribute('data-ns-guide-goal', v); else overlay.removeAttribute('data-ns-guide-goal'); overlayDirty = true; }
    // R5-scene: while the goal is 'orbit' the brain's 3D arrows get ns-arrows3d's soft attention glow (and their captions).
    if (arrowSets.brain.rig) arrowSets.brain.rig.setAttention(v === 'orbit' ? 1 : 0);
    return guideGoalAttr;
  }

  /** R4-scene test hook: draw the brain k times farther and k times larger (scaleBrainDistance; same on-screen size).
   * Gaze picking is unaffected (a ray from the eye meets the scaled brain at the same source point). Returns k. */
  function setBrainDistanceScale(k) {
    if (!(Number.isFinite(k) && k > 0)) fail('scene_args', 'setBrainDistanceScale needs k > 0');
    if (referenceOriginSet && k !== 1) fail('scene_args', 'configured reference graph requires the shared unscaled brain transform');
    brainDistK = k;
    if (lastBrainTransform) setBrainTransform(lastBrainTransform);
    return brainDistK;
  }

  /** Camera orientation: Euler YXZ (yaw about +y, then pitch), so the view direction is ns-brain gazeDirection. */
  // R5-scene (D18): setView sets the EYE look (the arm hangs on it, the mirror's arm copies it); in first person the camera
  // takes the same look. In third person (setCameraPose) the camera keeps its own pose.
  function setEyePosition(position) {
    if (!position || position.length !== 3 || !Array.from(position).every(Number.isFinite)) fail('scene_input', 'eye world position needs finite metres');
    eyeRig.position.set(position[0], position[1], position[2]); eyeRig.updateMatrixWorld(true);
    mirrorArmGroup.matrix.copy(eyeRig.matrix); mirrorArmGroup.matrixWorldNeedsUpdate = true;
    overlayDirty = true;
  }
  function setReferenceOrigin(position, initialPlacement = { yaw: 0, pitch: 0 }) {
    if (brainDistK !== 1) fail('scene_input', 'configured reference graph cannot use the legacy origin-zero distance-scale hook');
    if (!position || position.length !== 3 || !Array.from(position).every(Number.isFinite)) fail('scene_input', 'reference origin needs finite world metres');
    if (referenceOriginSet && referenceOrigin.some((v, i) => v !== position[i])) fail('scene_input', 'reference origin is constructor-owned');
    if (!initialPlacement || !Number.isFinite(initialPlacement.yaw) || !Number.isFinite(initialPlacement.pitch)) fail('scene_input', 'initial brain carry needs finite radians');
    const K = NsMath.lookRotation(initialPlacement.yaw, initialPlacement.pitch);
    if (referenceCarry && Array.from(K).some((v, i) => v !== referenceCarry[i])) fail('scene_input', 'initial brain carry is constructor-owned');
    referenceOrigin = Array.from(position); referenceCarry = Array.from(K); referenceAngles = { yaw: initialPlacement.yaw, pitch: initialPlacement.pitch }; referenceOriginSet = true; mirror.frameKey = ''; mirror.outlineNdc = null;
  }
  function setView(yaw, pitch) {
    eyeRig.rotation.set(pitch, yaw, 0, 'YXZ');
    eyeRig.updateMatrixWorld(true);
    mirrorArmGroup.matrix.copy(eyeRig.matrix);
    mirrorArmGroup.matrixWorldNeedsUpdate = true;
    if (yaw !== lookYaw || pitch !== lookPitch) overlayDirty = true;
    lookYaw = yaw; lookPitch = pitch;
    if (!camPose) { if (firstPose) { firstPose.yaw = yaw; firstPose.pitch = pitch; } camera.rotation.set(pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld(true); }
  }

  /** R5-scene (D18, R22): the render camera from an ns-camera cameraPose (R5-camera) result, or null for first person.
   * pose: { position: [x, y, z] (world m), yaw, pitch (rad; rotation.set(pitch, yaw, 0, 'YXZ')), headInPlace 0..1,
   * faceGhost 0..1, overBrainSeeThrough 0..1, nearM } (the multipliers are optional: without them a camera at least 0.35 m
   * from the eye counts as third person). pose.firstPerson === true, blend 0 or mode 'first' = first person: the camera
   * is the eye (setView), every round-4 rule applies bit for bit. In third person the head and face are drawn in place
   * from headInPlace >= R5_SCENE.headInPlaceFrom (the displaced face layer then hides), the face layer fades with
   * faceGhost, and the body is no longer see-through over the brain's outline (overBrainSeeThrough); instead a small
   * soft window opens at the crosshair while it is on a motor area. Returns cameraState(). */
  const camMul = { headInPlace: 0, faceGhost: 1, overBrain: 1, nearM: null };
  function setCameraPose(pose = null) {
    const first = pose === null || pose === undefined || pose.mode === 'first' || pose.firstPerson === true || (Number.isFinite(pose.blend) && pose.blend <= 0 && pose.thirdPerson !== true);
    if (first) {
      if (pose !== null && pose !== undefined && Object.prototype.hasOwnProperty.call(pose, 'position')) {
        if (!pose.position || pose.position.length !== 3 || !Array.from(pose.position).every(Number.isFinite) || !Number.isFinite(pose.yaw) || !Number.isFinite(pose.pitch)) fail('scene_input', 'first-person pose needs finite world position/radians');
        firstPose = { position: Array.from(pose.position), yaw: pose.yaw, pitch: pose.pitch };
        const eyeLook = pose.bodyLook && Number.isFinite(pose.bodyLook.yaw) && Number.isFinite(pose.bodyLook.pitch) ? pose.bodyLook : firstPose;
        if (lookYaw !== eyeLook.yaw || lookPitch !== eyeLook.pitch) setView(eyeLook.yaw, eyeLook.pitch);
        // R378 opt-in: physical arm-parent frame is separate from the engineering rendering camera.
        const parentPosition = pose.armParentPosition === undefined ? firstPose.position : pose.armParentPosition;
        if (!parentPosition || parentPosition.length !== 3 || !Array.from(parentPosition).every(Number.isFinite)) fail('scene_input', 'arm parent position needs finite world metres');
        if (eyeRig.position.x !== parentPosition[0] || eyeRig.position.y !== parentPosition[1] || eyeRig.position.z !== parentPosition[2]) setEyePosition(parentPosition);
      } else { if (firstPose) setEyePosition([0, 0, 0]); firstPose = null; }
      camPose = null; camMul.headInPlace = 0; camMul.faceGhost = 1; camMul.overBrain = 1; camMul.nearM = null;
    }
    else {
      const p = pose.position;
      if (!p || p.length !== 3 || !Array.prototype.every.call(p, Number.isFinite) || !Number.isFinite(pose.yaw) || !Number.isFinite(pose.pitch)) {
        fail('scene_input', 'setCameraPose needs an ns-camera pose { position: [x, y, z], yaw, pitch } (finite) or null');
      }
      camPose = { position: [p[0], p[1], p[2]], yaw: pose.yaw, pitch: pose.pitch, blend: Number.isFinite(pose.blend) ? pose.blend : 1 };
      const far0 = Math.hypot(p[0], p[1], p[2]) >= 0.35 ? 1 : 0;
      camMul.headInPlace = Number.isFinite(pose.headInPlace) ? fin01(pose.headInPlace) : far0;
      camMul.faceGhost = Number.isFinite(pose.faceGhost) ? fin01(pose.faceGhost) : 1 - far0;
      camMul.overBrain = Number.isFinite(pose.overBrainSeeThrough) ? fin01(pose.overBrainSeeThrough) : 1 - far0;
      camMul.nearM = Number.isFinite(pose.nearM) && pose.nearM > 0 ? pose.nearM : null;
    }
    applyCamera();
    updateCameraRange();
    overlayDirty = true;
    return cameraState();
  }
  function applyCamera() {
    if (camPose) {
      camera.position.set(camPose.position[0], camPose.position[1], camPose.position[2]);
      camera.rotation.set(camPose.pitch, camPose.yaw, 0, 'YXZ');
    } else {
      const p = firstPose ? firstPose.position : [0, 0, 0];
      camera.position.set(p[0], p[1], p[2]);
      camera.rotation.set(firstPose ? firstPose.pitch : lookPitch, firstPose ? firstPose.yaw : lookYaw, 0, 'YXZ');
    }
    camera.updateMatrixWorld(true);
    const headIn = camPose !== null && camMul.headInPlace >= R5_SCENE.headInPlaceFrom;
    const nearNow = camMul.nearM !== null ? camMul.nearM : near;
    if (camera.near !== nearNow) { camera.near = nearNow; camera.updateProjectionMatrix(); }
    if (headIn !== camState.headInPlace) {
      camState.headInPlace = headIn;
      faceStateKey = '';
      for (const b of body) if (b.inPlace) b.inPlace.visible = headIn;
    }
    camState.eyeDistM = camPose ? referenceOriginSet ? Math.hypot(camPose.position[0] - eyeRig.position.x, camPose.position[1] - eyeRig.position.y, camPose.position[2] - eyeRig.position.z) : Math.hypot(camPose.position[0], camPose.position[1], camPose.position[2]) : 0;
    camState.mode = camPose ? 'third' : 'first';
  }
  /** Plain-JSON camera state (QA). */
  function cameraState() {
    return { mode: camState.mode, headInPlace: camState.headInPlace, faceGhost: camMul.faceGhost, overBrainSeeThrough: camMul.overBrain, eyeDistM: Math.round(camState.eyeDistM * 1000) / 1000, near: camera.near, far: camera.far,
      position: activePosition().map(v => Math.round(v * 1000) / 1000), yaw: camPose ? camPose.yaw : firstPose ? firstPose.yaw : lookYaw, pitch: camPose ? camPose.pitch : firstPose ? firstPose.pitch : lookPitch, blend: camPose ? camPose.blend : 0 };
  }

  /** Apply pose matrices (Map(segment -> rest mm -> camera m)). Returns false and does nothing when unchanged. */
  function updatePose(matrices) {
    if (!(matrices instanceof Map)) fail('scene_input', 'matrices must be a Map(segment -> matrix)');
    if (lastMatrices !== null && matricesEqual(lastMatrices, matrices, RESKIN_TOLERANCE)) return false;
    armAppliedReady = false; // R173: a partial/throwing application is not a complete retained pose.
    for (const b of bones) {
      const m = matrices.get(b.segment);
      if (!m) fail('scene_input', `missing matrix for ${b.segment}`);
      b.mesh.matrix.fromArray(m);
      b.mesh.matrixWorldNeedsUpdate = true;
      if (b.mirror) { b.mirror.matrix.fromArray(m); b.mirror.matrixWorldNeedsUpdate = true; }
    }
    for (const m of muscles) {
      skinApply(matrices, m.weights, m.rest, m.pos);
      skinNormals(matrices, m.weights, m.restNormals, m.nor);
      m.posAttr.needsUpdate = true;
      m.norAttr.needsUpdate = true;
    }
    lastMatrices = matrices;
    armPoseSerial++;
    armAppliedReady = true;
    return true;
  }

  /** R173 public CPU scene-state readback. updatePose keeps its boolean API. On a tolerance skip, the bones still
   * contain the previous APPLIED matrices; never return the new requested Map as if it had been drawn.
   * null before an applied root / after a replacement or failed application / after disposal. A layer-only pending
   * reskin keeps the actual retained bone pose available and is reported explicitly. No native GL readback. */
  function appliedArmPose() {
    if (disposed || !armAppliedReady) return null;
    return readAppliedArmPose(bones, { revision: armPoseSerial, reskinPending: lastMatrices === null });
  }

  /** Copied ACTUAL retained hand-bone matrices in the same arm-eye frame as appliedArmPose.
   * A pending reskin keeps the previous applied pose; no requested matrix or GPU state is substituted. */
  function appliedHandPose() {
    if (disposed || !armAppliedReady) return null;
    const root = readAppliedArmPose(bones, { revision: armPoseSerial, reskinPending: lastMatrices === null });
    if (root === null) return null;
    const matrices = Object.create(null);
    for (const b of bones) {
      if (!HAND_SEGMENTS.includes(b.segment)) continue;
      const m = b.mesh && b.mesh.matrix && b.mesh.matrix.elements;
      if (!m || m.length !== 16) fail('scene_state', `retained ${b.segment} needs16 matrix elements`);
      const values = new Array(16);
      for (let i = 0; i < 16; i++) {
        if (typeof m[i] !== 'number' || !Number.isFinite(m[i])) fail('scene_state', `retained ${b.segment}[${i}] is not finite`);
        values[i] = m[i];
      }
      const previous = matrices[b.segment];
      if (previous) {
        for (let i = 0; i < 16; i++) if (previous[i] !== values[i]) fail('scene_state', `retained bones disagree for ${b.segment}`);
      } else matrices[b.segment] = Object.freeze(values);
    }
    for (const segment of HAND_SEGMENTS) {
      if (!Object.prototype.hasOwnProperty.call(matrices, segment)) fail('scene_state', `retained hand segment missing: ${segment}`);
    }
    return Object.freeze({
      kind: 'ns-applied-hand-pose-r210',
      sourceDomain: root.sourceDomain, from: root.from, to: root.to,
      revision: root.revision, reskinPending: root.reskinPending,
      matrices: Object.freeze(matrices)
    });
  }

  /** Copied retained CPU render inputs. This getter never updates transforms, bounds, clocks or rendering.
   * World matrices may still be dirty; rendererFrame includes every Three render pass, including the face pass.
   * No requested matrix, inferred source id or GPU/pixel result is substituted for missing retained state. */
  function appliedHandRenderState() {
    const kind = 'ns-applied-hand-render-state-r233';
    const frame = () => {
      const v = renderer.info && renderer.info.render && renderer.info.render.frame;
      return Number.isSafeInteger(v) && v >= 0 ? v : null;
    };
    const revision = armPoseSerial, rendererFrame = frame();
    const stamp = {
      kind, revision, rendererFrame,
      rendererFrameStatus: rendererFrame === null ? 'unavailable' : 'retained',
      counterDomain: 'Three renderer.info.render.frame; includes face passes; not a main-pass or native acknowledgement',
      reskinPending: lastMatrices === null, contextLost: lost
    };
    if (disposed) return Object.freeze({ ...stamp, status: 'disposed', reason: 'scene-disposed' });
    if (!armSet) return Object.freeze({ ...stamp, status: 'absent', reason: 'arm-not-installed' });
    if (!armAppliedReady || lost) return Object.freeze({ ...stamp, status: 'pending', reason: lost ? 'context-lost' : 'no-complete-retained-pose' });
    try {
      const finite = (v, label) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) fail('scene_readback', `${label} is not finite`);
        return v;
      };
      const integer = (v, label) => {
        if (!Number.isSafeInteger(v) || v < 0) fail('scene_readback', `${label} is not a nonnegative safe integer`);
        return v;
      };
      const bool = (v, label) => {
        if (typeof v !== 'boolean') fail('scene_readback', `${label} is not boolean`);
        return v;
      };
      const matrix = (m, label) => {
        const e = m && m.elements;
        if (!e || e.length !== 16) fail('scene_readback', `${label} needs16 retained elements`);
        const out = new Array(16);
        for (let i = 0; i < 16; i++) out[i] = finite(e[i], `${label}[${i}]`);
        return Object.freeze(out);
      };
      const vector = (v, label) => {
        if (!v) fail('scene_readback', `${label} is missing`);
        return Object.freeze([finite(v.x, `${label}.x`), finite(v.y, `${label}.y`), finite(v.z, `${label}.z`)]);
      };
      const layerMask = n => n && n.layers && Number.isInteger(n.layers.mask) ? n.layers.mask : null;
      const node = (n, label) => {
        if (!n) fail('scene_readback', `${label} is missing`);
        return Object.freeze({
          id: integer(n.id, `${label}.id`), uuid: typeof n.uuid === 'string' ? n.uuid : null,
          name: typeof n.name === 'string' ? n.name : null,
          parentId: n.parent ? integer(n.parent.id, `${label}.parentId`) : null,
          visible: bool(n.visible, `${label}.visible`), layersMask: layerMask(n),
          matrixAutoUpdate: bool(n.matrixAutoUpdate, `${label}.matrixAutoUpdate`),
          matrixWorldAutoUpdate: bool(n.matrixWorldAutoUpdate, `${label}.matrixWorldAutoUpdate`),
          matrixWorldNeedsUpdate: bool(n.matrixWorldNeedsUpdate, `${label}.matrixWorldNeedsUpdate`),
          matrix: matrix(n.matrix, `${label}.matrix`), matrixWorld: matrix(n.matrixWorld, `${label}.matrixWorld`)
        });
      };
      const attribute = (a, label) => {
        if (!a) return Object.freeze({ status: 'absent' });
        return Object.freeze({ status: 'retained', count: integer(a.count, `${label}.count`),
          itemSize: integer(a.itemSize, `${label}.itemSize`), version: integer(a.version, `${label}.version`),
          arrayLength: a.array ? integer(a.array.length, `${label}.arrayLength`) : null });
      };
      const geometry = (g, full) => {
        if (!g) fail('scene_readback', 'bone geometry is missing');
        const p = g.attributes && g.attributes.position;
        if (!p) fail('scene_readback', 'bone position attribute is missing');
        const fp = full && full.attributes && full.attributes.position;
        const box = g.boundingBox, sphere = g.boundingSphere, dr = g.drawRange;
        if (!dr) fail('scene_readback', 'geometry drawRange is missing');
        const drawCount = dr.count === Infinity ? null : integer(dr.count, 'drawRange.count');
        return Object.freeze({
          id: integer(g.id, 'geometry.id'), uuid: typeof g.uuid === 'string' ? g.uuid : null,
          fullStatus: full ? 'retained' : 'not-retained',
          fullId: full ? integer(full.id, 'fullGeometry.id') : null,
          fullUuid: full && typeof full.uuid === 'string' ? full.uuid : null,
          isFullGeometry: full ? g === full : null,
          positionIsFullAttribute: fp ? p === fp : null,
          positionIsFullArray: fp && p.array && fp.array ? p.array === fp.array : null,
          position: attribute(p, 'position'), index: attribute(g.index, 'index'),
          drawRange: Object.freeze({ start: integer(dr.start, 'drawRange.start'), count: drawCount,
            countKind: dr.count === Infinity ? 'unbounded' : 'finite' }),
          boundingBox: box ? Object.freeze({ status: 'retained', min: vector(box.min, 'box.min'), max: vector(box.max, 'box.max') }) : Object.freeze({ status: 'not-retained' }),
          boundingSphere: sphere ? Object.freeze({ status: 'retained', center: vector(sphere.center, 'sphere.center'), radius: finite(sphere.radius, 'sphere.radius') }) : Object.freeze({ status: 'not-retained' })
        });
      };
      integer(revision, 'applied revision');
      if (revision === 0) fail('scene_readback', 'applied revision must be positive');
      const cameraMask = layerMask(camera);
      const entries = bones.map((b, index) => {
        if (!b || !SEGMENTS.includes(b.segment)) fail('scene_readback', `bone[${index}] has no known segment`);
        const mesh = b.mesh, retained = node(mesh, `bone[${index}]`);
        let ancestorVisible = true, attachedToScene = false, n = mesh.parent, depth = 0;
        const seen = new Set();
        while (n && depth < 64) {
          if (seen.has(n)) fail('scene_readback', `bone[${index}] has a parent cycle`);
          seen.add(n); depth++;
          ancestorVisible = bool(n.visible, `bone[${index}] ancestor.visible`) && ancestorVisible;
          if (n === scene) { attachedToScene = true; break; }
          n = n.parent;
        }
        if (n && !attachedToScene && depth === 64) fail('scene_readback', `bone[${index}] parent depth exceeds64`);
        const mask = layerMask(mesh);
        return Object.freeze({
          index, sourceElementId: typeof b.sourceElementId === 'string' ? b.sourceElementId : null,
          sourceElementIdStatus: typeof b.sourceElementId === 'string' ? 'retained-input' : 'unavailable',
          segment: b.segment, ...retained,
          parentIsArmGroup: mesh.parent === armGroup, ancestorVisible, attachedToScene,
          cameraLayersMatch: mask === null || cameraMask === null ? null : (mask & cameraMask) !== 0,
          frustumCulled: bool(mesh.frustumCulled, `bone[${index}].frustumCulled`),
          renderOrder: finite(mesh.renderOrder, `bone[${index}].renderOrder`),
          geometry: geometry(mesh.geometry, mesh.userData && mesh.userData.nsFullGeometry || null)
        });
      });
      const viewportState = Object.freeze({ width: finite(cssW, 'cssW'), height: finite(cssH, 'cssH'), pixelRatio: finite(cssPr, 'cssPr') });
      const eyeState = node(eyeRig, 'eyeRig'), armState = node(armGroup, 'armGroup');
      const cameraStateRetained = Object.freeze({ ...node(camera, 'camera'), matrixWorldInverse: matrix(camera.matrixWorldInverse, 'camera.view'),
        projectionMatrix: matrix(camera.projectionMatrix, 'camera.projection'), mode: camState.mode });
      const endFrame = frame();
      return Object.freeze({
        ...stamp, status: 'present', revisionAfter: armPoseSerial, rendererFrameAfter: endFrame,
        countersUnchanged: armPoseSerial === revision && endFrame === rendererFrame,
        boneCount: entries.length, expectedBoneCount: 30, countMatches: entries.length === 30,
        matrixLayout: 'column-major16',
        domains: Object.freeze({ boneLocal: 'source-rest-mm -> arm-eye-m', boneWorld: 'source-rest-mm -> world-m',
          rigWorld: 'arm-eye-m -> world-m', cameraWorld: 'camera-m -> world-m', view: 'world-m -> camera-m', projection: 'camera-m -> clip', bounds: 'source-rest-mm' }),
        cssViewport: viewportState, eyeRig: eyeState, armGroup: armState,
        armParentIsEyeRig: armGroup.parent === eyeRig, eyeParentIsScene: eyeRig.parent === scene,
        camera: cameraStateRetained,
        bones: Object.freeze(entries),
        limit: 'Retained CPU inputs only; dirty flags, visibility and geometry identity do not prove draw submission, occlusion, GPU state, anatomy or atomic pixels'
      });
    } catch (err) {
      return Object.freeze({ ...stamp, status: 'error', error: err && err.message ? String(err.message) : String(err) });
    }
  }

  /** R311 opt-in retained CPU surface query; NEVER called by render/update or default inspect.
   * Only local math/report objects are written. No raycaster, bounds computation, world update or GL call.
   * This is retained geometric candidate evidence, never a fragment/pixel/occlusion or anatomy verdict. */
  function foregroundSurfaceTrace(request) {
    const kind = 'ns-foreground-surface-trace-r311';
    const bounds = { cssPoints: 2, nodes: 2048, meshes: 1024, groupsPerMesh: 128,
      triangleVisits: 8000000, reportedSurfaces: 64, noArmClosestCandidates: 8, diagnosticUtf8Bytes: 32768 };
    const counts = { nodesVisited: 0, hiddenSubtrees: 0, layerExcludedMeshes: 0, cachedFrustumExcludedMeshes: 0,
      meshesPrepared: 0, ownArmPrimaryMeshes: 0, ownArmDepthMeshes: 0, nonArmMeshes: 0,
      triangleVisits: 0, clippedIntersections: 0, excludedLinesPointsSprites: 0, registeredOwnArmPrimaries: bones.length + muscles.length };
    const observed = new Map(), attributes = new Map(), entries = [], identities = new Map();
    const stage = { name: 'request', preparedComplete: false, countedComplete: false };
    const numberTag = v => typeof v === 'number' ? (Number.isNaN(v) ? 'NaN' : v === Infinity ? '+Infinity' : v === -Infinity ? '-Infinity' : v) : typeof v;
    const refuse = (code, detail) => { throw { r311Refusal: true, code, detail }; };
    const finite = (v, field) => { if (!Number.isFinite(v)) refuse('nonfinite', { field, actual: numberTag(v) }); return v; };
    const integer = (v, field) => { if (!Number.isSafeInteger(v) || v < 0) refuse('invalid_integer', { field, actual: numberTag(v) }); return v; };
    const boolean = (v, field) => { if (typeof v !== 'boolean') refuse('invalid_boolean', { field, actualType: typeof v }); return v; };
    const array16 = (m, field) => {
      if (!m || !m.elements || m.elements.length !== 16) refuse('missing_matrix', { field });
      return Array.from(m.elements, (v, i) => finite(v, `${field}[${i}]`));
    };
    const vector = (v, field) => { if (!v) refuse('missing_vector', { field }); return [finite(v.x, `${field}.x`), finite(v.y, `${field}.y`), finite(v.z, `${field}.z`)]; };
    const layers = object => {
      const mask = object.layers && object.layers.mask;
      if (!Number.isInteger(mask) || mask < -2147483648 || mask > 4294967295) refuse('invalid_layers', { objectId: object.id, actual: numberTag(mask) });
      return mask >>> 0;
    };
    const frame = () => { const v = renderer.info && renderer.info.render && renderer.info.render.frame; return Number.isSafeInteger(v) && v >= 0 ? v : null; };
    const start = { rendererFrame: frame(), rendererFrameRaw: numberTag(renderer.info && renderer.info.render ? renderer.info.render.frame : undefined), rendererFrameStatus: frame() === null ? 'unavailable' : 'retained', armPoseSerial: numberTag(armPoseSerial), reskinPending: lastMatrices === null, contextLost: lost, disposed };
    const matricesRef = lastMatrices;
    const readNode = object => {
      if (observed.has(object)) return observed.get(object);
      const id = integer(object.id, 'object.id');
      const value = { objectId: id, name: typeof object.name === 'string' ? object.name : null,
        type: typeof object.type === 'string' ? object.type : null, parentId: object.parent ? integer(object.parent.id, 'parent.id') : null,
        visible: boolean(object.visible, `object[${id}].visible`), layersMask: layers(object),
        matrixAutoUpdate: boolean(object.matrixAutoUpdate, `object[${id}].matrixAutoUpdate`),
        matrixWorldAutoUpdate: boolean(object.matrixWorldAutoUpdate, `object[${id}].matrixWorldAutoUpdate`),
        matrixWorldNeedsUpdate: boolean(object.matrixWorldNeedsUpdate, `object[${id}].matrixWorldNeedsUpdate`),
        local: array16(object.matrix, `object[${id}].local`), world: array16(object.matrixWorld, `object[${id}].world`),
        renderOrder: finite(object.renderOrder, `object[${id}].renderOrder`) };
      observed.set(object, value);
      return value;
    };
    const stampAfter = () => {
      let unchanged = frame() === start.rendererFrame && armPoseSerial === start.armPoseSerial && lastMatrices === matricesRef && lost === start.contextLost && disposed === start.disposed;
      for (const [object, before] of observed) {
        if (object.parent && object.parent.id !== before.parentId || !object.parent && before.parentId !== null ||
            object.visible !== before.visible || (object.layers.mask >>> 0) !== before.layersMask ||
            object.matrixWorldNeedsUpdate !== before.matrixWorldNeedsUpdate || object.matrixAutoUpdate !== before.matrixAutoUpdate ||
            object.matrixWorldAutoUpdate !== before.matrixWorldAutoUpdate || object.renderOrder !== before.renderOrder) unchanged = false;
        for (let i = 0; i < 16; i++) if (object.matrix.elements[i] !== before.local[i] || object.matrixWorld.elements[i] !== before.world[i]) unchanged = false;
      }
      for (const [attribute, before] of attributes) if (attribute.array !== before.array || attribute.version !== before.version || attribute.count !== before.count) unchanged = false;
      if (cameraSnapshot) for (let i = 0; i < 16; i++) if (camera.projectionMatrix.elements[i] !== cameraSnapshot.projection[i] || camera.matrixWorldInverse.elements[i] !== cameraSnapshot.view[i]) unchanged = false;
      if (viewport && (cssW !== viewport.css[0] || cssH !== viewport.css[1] || cssPr !== viewport.cachedPixelRatio || canvas.width !== viewport.canvasBuffer[0] || canvas.height !== viewport.canvasBuffer[1])) unchanged = false;
      return { rendererFrame: frame(), rendererFrameRaw: numberTag(renderer.info && renderer.info.render ? renderer.info.render.frame : undefined), armPoseSerial: numberTag(armPoseSerial), contextLost: lost, disposed, observedFieldsUnchanged: unchanged,
        observedNodeCount: observed.size, observedAttributeCount: attributes.size,
        scope: 'Selected cached flags/matrices, attribute identities/versions/counts and counters only; no full-buffer hash, GPU synchronization or atomic pixel proof' };
    };
    const limits = [
      'CPU retained geometric surfaces only; no GPU fragment/pixel identity, visibility verdict or anatomy/mechanics acceptance',
      'Shader vertex displacement, fragment discard/alpha/maps, stencil/depth functions, polygon offset, blending/sorting, MSAA and raster coverage are not simulated',
      'Current main-camera main scene and active ghost-face pass only; inset-face pass, DOM/HUD, lines/points/sprites and scene background are outside triangle scope',
      'Cached matrices/bounds/versions can differ from submitted GPU buffers; dirty flags and unchanged counters are observations, not coherent-frame certification',
      'Hits use current position/index/drawRange/groups, not nsFullGeometry indices; transparent DoubleSide may issue two GPU passes but one geometric surface is reported',
      'No-arm fallback is closest geometric candidates only, never established foreground occlusion; equal-distance non-arm surfaces are separately counted',
      'First refusal stops this invocation; unexamined data is explicit, so refusal records are complete records, not an exhaustive scene fault inventory',
      'Local byte bound does not certify the unchanged 65536-byte enclosing callback cap; Root must check exact serialized return separately'
    ];
    let cameraSnapshot = null, viewport = null;
    try {
      if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(k => k !== 'pointsCSS')) refuse('request_shape', { expected: '{pointsCSS:[[x,y],...]}; no defaults or other controls' });
      if (!Array.isArray(request.pointsCSS) || request.pointsCSS.length < 1 || request.pointsCSS.length > bounds.cssPoints) refuse('point_count', { requiredMin: 1, requiredMax: bounds.cssPoints });
      const points = Array.from(request.pointsCSS, (p, i) => {
        if (!Array.isArray(p) || p.length !== 2) refuse('point_shape', { pointIndex: i });
        return [finite(p[0], `pointsCSS[${i}][0]`), finite(p[1], `pointsCSS[${i}][1]`)];
      });
      if (lost || disposed) refuse('scene_unavailable', { contextLost: lost, disposed });
      if (!camera.isPerspectiveCamera || camera.coordinateSystem !== THREE.WebGLCoordinateSystem) refuse('camera_unsupported', { type: camera.type, coordinateSystem: numberTag(camera.coordinateSystem) });
      const size = renderer.getSize(new THREE.Vector2()), buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
      const pr = finite(renderer.getPixelRatio(), 'renderer.pixelRatio');
      const vp = renderer.getViewport(new THREE.Vector4()), pixelVP = renderer.getCurrentViewport(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
      viewport = { css: [finite(cssW, 'cssW'), finite(cssH, 'cssH')], cachedPixelRatio: finite(cssPr, 'cssPr'),
        rendererCSS: [finite(size.x, 'renderer.width'), finite(size.y, 'renderer.height')],
        drawingBuffer: [integer(buffer.x, 'buffer.width'), integer(buffer.y, 'buffer.height')],
        canvasBuffer: [integer(canvas.width, 'canvas.width'), integer(canvas.height, 'canvas.height')],
        rendererPixelRatio: pr, devicePixelRatio: view ? numberTag(view.devicePixelRatio) : 'unavailable-no-window',
        rendererViewportCSS: [finite(vp.x, 'viewport.x'), finite(vp.y, 'viewport.y'), finite(vp.z, 'viewport.width'), finite(vp.w, 'viewport.height')],
        currentViewportPixels: [integer(pixelVP.x, 'pixelViewport.x'), integer(pixelVP.y, 'pixelViewport.y'), integer(pixelVP.z, 'pixelViewport.width'), integer(pixelVP.w, 'pixelViewport.height')],
        scissorTest: boolean(scissorTest, 'renderer.scissorTest'), qualityMode: qState.mode, qualityLevel: integer(qState.level, 'quality.level') };
      if (!(cssW > 0 && cssH > 0 && buffer.x > 0 && buffer.y > 0 && pr > 0) || size.x !== cssW || size.y !== cssH || buffer.x !== canvas.width || buffer.y !== canvas.height ||
          vp.x !== 0 || vp.y !== 0 || vp.z !== cssW || vp.w !== cssH || pixelVP.x !== 0 || pixelVP.y !== 0 || pixelVP.z !== Math.round(cssW * pr) || pixelVP.w !== Math.round(cssH * pr) || !(pixelVP.z > 0 && pixelVP.w > 0) || scissorTest) refuse('viewport_not_full_main', { viewport });
      const c = readNode(camera), projection = array16(camera.projectionMatrix, 'camera.projection'), viewMatrix = array16(camera.matrixWorldInverse, 'camera.view');
      cameraSnapshot = { ...c, projection, view: viewMatrix, mode: camState.mode,
        near: finite(camera.near, 'camera.near'), far: finite(camera.far, 'camera.far'), fovYDeg: finite(camera.fov, 'camera.fov') };
      const pv = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().fromArray(projection), new THREE.Matrix4().fromArray(viewMatrix));
      if (!Number.isFinite(pv.determinant()) || pv.determinant() === 0) refuse('singular_projection_view', {});
      const invPV = pv.clone().invert(); array16(invPV, 'inverseProjectionView');
      const frustum = new THREE.Frustum().setFromProjectionMatrix(pv, THREE.WebGLCoordinateSystem);
      for (const [i, plane] of frustum.planes.entries()) { vector(plane.normal, `frustum[${i}].normal`); finite(plane.constant, `frustum[${i}].constant`); }
      const tag = (mesh, role, sourceElementId = null, ownArm = false, segment = null, regionId = null) => {
        if (mesh) identities.set(mesh, { role, sourceElementId: typeof sourceElementId === 'string' ? sourceElementId : null,
          sourceIdStatus: typeof sourceElementId === 'string' ? 'retained-loader-id' : 'unavailable-no-inferred-id', ownArm, segment, regionId });
      };
      for (const b of bones) { tag(b.mesh, 'own-arm-bone', b.sourceElementId, true, b.segment); tag(b.mirror, 'mirror-arm-bone', b.sourceElementId, false, b.segment); }
      for (const m of muscles) { tag(m.mesh, 'own-arm-muscle', m.id, true); tag(m.mirror, 'mirror-arm-muscle', m.id); }
      for (const b of body) { tag(b.mesh, b.face ? 'face-layer' : 'own-body', b.id); tag(b.mirror, 'mirror-body', b.id); tag(b.inPlace, 'in-place-face', b.id); }
      for (const mesh of glass) tag(mesh, 'brain-glass');
      for (const mesh of glassDepth) tag(mesh, 'brain-glass-depth');
      for (const mesh of glassXray) tag(mesh, 'brain-glass-xray');
      for (const region of regions) {
        for (const mesh of region.meshes) tag(mesh, 'brain-region', null, false, null, region.id);
        for (const mesh of region.depthMeshes) tag(mesh, 'brain-region-depth', null, false, null, region.id);
      }
      tag(glowOwn.mesh, 'own-glow-link'); tag(glowMirror.mesh, 'mirror-glow-link');
      for (const target of ['brain', 'mirror']) {
        const rig = arrowSets[target] && arrowSets[target].rig;
        if (rig && rig.arrows) for (const dir of ARROW_DIRS) if (rig.arrows[dir]) tag(rig.arrows[dir].mesh, `${target}-orbit-arrow-${dir}`);
      }
      const materialState = (m, objectId, slot) => {
        if (!m) refuse('missing_material', { objectId, slot });
        const side = integer(m.side, 'material.side');
        if (![THREE.FrontSide, THREE.BackSide, THREE.DoubleSide].includes(side)) refuse('unsupported_side', { objectId, slot, side });
        if (m.wireframe === true) refuse('wireframe_not_triangles', { objectId, slot });
        const out = { materialId: integer(m.id, 'material.id'), type: typeof m.type === 'string' ? m.type : null,
          side, visible: boolean(m.visible, 'material.visible'), depthTest: boolean(m.depthTest, 'material.depthTest'),
          depthWrite: boolean(m.depthWrite, 'material.depthWrite'), colorWrite: boolean(m.colorWrite, 'material.colorWrite'),
          transparent: boolean(m.transparent, 'material.transparent'), opacity: finite(m.opacity, 'material.opacity'),
          alphaTest: finite(m.alphaTest, 'material.alphaTest'), depthFunc: finite(m.depthFunc, 'material.depthFunc'), blending: finite(m.blending, 'material.blending'),
          polygonOffset: boolean(m.polygonOffset, 'material.polygonOffset'), polygonOffsetFactor: finite(m.polygonOffsetFactor, 'material.polygonOffsetFactor'),
          polygonOffsetUnits: finite(m.polygonOffsetUnits, 'material.polygonOffsetUnits'), stencilWrite: boolean(m.stencilWrite, 'material.stencilWrite'),
          alphaHash: m.alphaHash === true, alphaToCoverage: m.alphaToCoverage === true, forceSinglePass: m.forceSinglePass === true,
          customShaderMaterial: m.isShaderMaterial === true || m.isRawShaderMaterial === true,
          customOnBeforeCompile: m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile,
          mapPresent: Boolean(m.map), alphaMapPresent: Boolean(m.alphaMap), displacementMapPresent: Boolean(m.displacementMap),
          clippingPlaneCount: Array.isArray(m.clippingPlanes) ? m.clippingPlanes.length : 0,
          uniformShaderState: 'not evaluated or invoked; CPU retained positions only' };
        return out;
      };
      const attributeState = (a, field, itemSize, indexed) => {
        if (!a || !a.isBufferAttribute || a.isInterleavedBufferAttribute || a.isGLBufferAttribute || a.normalized !== false || a.itemSize !== itemSize ||
            !ArrayBuffer.isView(a.array) || a.array instanceof DataView || (typeof SharedArrayBuffer === 'function' && a.array.buffer instanceof SharedArrayBuffer)) refuse('unsupported_attribute', { field, required: 'ordinary unnormalized nonshared CPU BufferAttribute', itemSize });
        const count = integer(a.count, `${field}.count`), length = integer(a.array.length, `${field}.array.length`);
        if (length !== count * itemSize || indexed && !['Uint8Array', 'Uint16Array', 'Uint32Array'].includes(a.array.constructor.name) || !indexed && !['Float32Array', 'Float64Array'].includes(a.array.constructor.name)) refuse('attribute_layout', { field, count, length, itemSize, type: a.array.constructor.name });
        const out = { count, itemSize, length, arrayType: a.array.constructor.name, byteLength: integer(a.array.byteLength, `${field}.bytes`),
          version: integer(a.version, `${field}.version`), normalized: false, usage: finite(a.usage, `${field}.usage`) };
        attributes.set(a, { array: a.array, version: a.version, count: a.count });
        return out;
      };
      stage.name = 'prepare';
      const activeGhostFace = faceAmount > 0 && faceGroup.visible && faceMode === 'ghost';
      const stack = [{ object: scene, path: [], pass: 'main', groupOrder: 0 }];
      if (activeGhostFace) stack.push({ object: faceScene, path: [], pass: 'ghost-face-second-pass', groupOrder: 0 });
      while (stack.length) {
        const { object, path, pass, groupOrder } = stack.pop();
        if (++counts.nodesVisited > bounds.nodes) refuse('node_work_bound', { maximum: bounds.nodes });
        if (!object || !Array.isArray(object.children)) refuse('invalid_node', { pass });
        if (object.visible === false) { counts.hiddenSubtrees++; continue; }
        const state = readNode(object), chain = [...path, object];
        const order = object.isGroup && (state.layersMask & c.layersMask) ? state.renderOrder : groupOrder;
        if (object.isLOD && object.autoUpdate && (state.layersMask & c.layersMask)) refuse('lod_auto_update_unobserved', { objectId: state.objectId });
        if (object.isLine || object.isPoints || object.isSprite) counts.excludedLinesPointsSprites++;
        if (object.isMesh && !(state.layersMask & c.layersMask)) counts.layerExcludedMeshes++;
        if (object.isMesh && (state.layersMask & c.layersMask)) {
          if (entries.length >= bounds.meshes) refuse('mesh_work_bound', { maximum: bounds.meshes });
          const geometry = object.geometry;
          if (object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh || !geometry || !geometry.isBufferGeometry || geometry.isInstancedBufferGeometry ||
              geometry.morphAttributes && Object.values(geometry.morphAttributes).some(a => a && a.length)) refuse('unsupported_mesh', { objectId: state.objectId, type: state.type, required: 'ordinary Mesh, no morph/GPU skin/instance/batch' });
          const world = new THREE.Matrix4().fromArray(state.world), det = world.determinant();
          if (!Number.isFinite(det) || det === 0) refuse('singular_world', { objectId: state.objectId, determinant: numberTag(det) });
          const inverse = world.clone().invert(); array16(inverse, `object[${state.objectId}].inverseWorld`);
          let cull = { enabled: boolean(object.frustumCulled, 'mesh.frustumCulled'), retainedSphereTest: null, source: 'not-required' };
          if (object.frustumCulled) {
            const cached = object.boundingSphere !== undefined ? object.boundingSphere : geometry.boundingSphere;
            if (!cached || !cached.center) refuse('cached_bounds_missing', { objectId: state.objectId, computedBounds: false });
            const center = vector(cached.center, 'cachedSphere.center'), radius = finite(cached.radius, 'cachedSphere.radius');
            if (radius < 0) refuse('invalid_cached_sphere', { objectId: state.objectId, radius });
            const sphere = new THREE.Sphere(new THREE.Vector3().fromArray(center), radius).applyMatrix4(world);
            vector(sphere.center, 'worldSphere.center'); finite(sphere.radius, 'worldSphere.radius');
            cull = { enabled: true, retainedSphereTest: frustum.intersectsSphere(sphere), source: object.boundingSphere !== undefined ? 'object.boundingSphere' : 'geometry.boundingSphere', localSphere: { center, radius } };
          }
          if (cull.retainedSphereTest === false) counts.cachedFrustumExcludedMeshes++;
          else {
            const position = geometry.attributes.position, index = geometry.index;
            const posState = attributeState(position, `geometry[${geometry.id}].position`, 3, false);
            const idxState = index === null ? null : attributeState(index, `geometry[${geometry.id}].index`, 1, true);
            const size = idxState ? idxState.count : posState.count;
            const range = geometry.drawRange;
            if (!range) refuse('missing_draw_range', { objectId: state.objectId });
            const rangeStart = integer(range.start, 'drawRange.start'), rangeCount = range.count === Infinity ? Infinity : integer(range.count, 'drawRange.count');
            const groups = geometry.groups;
            if (!Array.isArray(groups) || groups.length > bounds.groupsPerMesh) refuse('groups_bound_or_invalid', { objectId: state.objectId, maximum: bounds.groupsPerMesh });
            const groupStates = groups.map((g, i) => ({ index: i, start: integer(g.start, 'group.start'), count: integer(g.count, 'group.count'), materialIndex: integer(g.materialIndex, 'group.materialIndex') }));
            const materialArray = Array.isArray(object.material), drawCalls = [];
            if (!materialArray && !object.material) refuse('missing_scalar_material', { objectId: state.objectId });
            const slots = materialArray ? groupStates.map(g => ({ group: g, slot: g.materialIndex, material: object.material[g.materialIndex] })) : [{ group: null, slot: null, material: object.material }];
            for (const slot of slots) {
              // Renderer skips absent/invisible array slots; this is reported in geometry metadata, not guessed visible.
              if (!slot.material || slot.material.visible === false) continue;
              const material = materialState(slot.material, state.objectId, slot.slot);
              const begin = Math.max(0, rangeStart, slot.group ? slot.group.start : 0);
              const end = Math.min(size, rangeStart + rangeCount, slot.group ? slot.group.start + slot.group.count : Infinity);
              const count = Math.max(0, end - begin);
              if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin % 3 !== 0 || count % 3 !== 0) refuse('partial_triangle_draw_range', { objectId: state.objectId, begin, end });
              if (count > 0) drawCalls.push({ begin, end, group: slot.group ? slot.group.index : null, slot: slot.slot, material });
            }
            let identity = identities.get(object);
            if (!identity && object.userData && object.userData.depthTwin === true && identities.has(object.parent)) identity = { ...identities.get(object.parent), role: `${identities.get(object.parent).role}-depth-prepass` };
            if (!identity) identity = { role: 'unclassified-main-mesh', sourceElementId: null, sourceIdStatus: 'unavailable-no-inferred-id', ownArm: false, segment: null, regionId: null };
            const full = object.userData && object.userData.nsFullGeometry;
            const entry = { object, state, chain, pass, groupOrder: order, identity, geometry, position, index, world, inverse, cull, drawCalls,
              geometryState: { geometryId: integer(geometry.id, 'geometry.id'), uuid: typeof geometry.uuid === 'string' ? geometry.uuid : null,
                position: posState, index: idxState, drawRange: { start: rangeStart, count: rangeCount === Infinity ? 'Infinity' : rangeCount }, groups: groupStates,
                materialArray, skippedMaterialSlots: slots.filter(s => !s.material || s.material.visible === false).map(s => ({ group: s.group ? s.group.index : null, slot: s.slot, status: s.material ? 'invisible' : 'absent-renderer-skips' })),
                currentIsRetainedFullGeometry: full ? geometry === full : null, retainedFullGeometryPresent: Boolean(full),
                positionBufferDomain: identity.ownArm && identity.role.includes('muscle') ? 'actual current CPU-skinned/layered positions' : 'actual current geometry position attribute',
                fingerprintScope: 'runtime ids, versions and layout only; no invented source hash or GPU buffer attestation' } };
            entries.push(entry); counts.meshesPrepared++;
            if (identity.ownArm) { if (identity.role.endsWith('-depth-prepass')) counts.ownArmDepthMeshes++; else counts.ownArmPrimaryMeshes++; }
            else counts.nonArmMeshes++;
          }
        }
        // Visibility is inherited; layers are per object and do NOT exclude children, matching projectObject.
        for (let i = object.children.length - 1; i >= 0; i--) stack.push({ object: object.children[i], path: chain, pass, groupOrder: order });
      }
      stage.preparedComplete = true;
      const samples = points.map(([x, y], i) => {
        if (x < 0 || y < 0 || x >= cssW || y >= cssH) refuse('point_outside_canvas', { pointIndex: i, requestedCSS: [x, y], css: [cssW, cssH] });
        const bx = Math.floor(x * buffer.x / cssW), byTop = Math.floor(y * buffer.y / cssH);
        const byBottom = buffer.y - 1 - byTop;
        if (bx < pixelVP.x || bx >= pixelVP.x + pixelVP.z || byBottom < pixelVP.y || byBottom >= pixelVP.y + pixelVP.w) refuse('pixel_outside_current_viewport', { pointIndex: i, bufferPixel: [bx, byBottom] });
        // Current cached GL viewport uses rounded CSS*ratio; drawing-buffer dimensions may be floored.
        const ndc = [2 * (bx + 0.5 - pixelVP.x) / pixelVP.z - 1, 2 * (byBottom + 0.5 - pixelVP.y) / pixelVP.w - 1];
        const near = new THREE.Vector3(ndc[0], ndc[1], -1).applyMatrix4(invPV), far = new THREE.Vector3(ndc[0], ndc[1], 1).applyMatrix4(invPV);
        vector(near, 'ray.near'); vector(far, 'ray.far');
        const direction = far.clone().sub(near); if (!(finite(direction.lengthSq(), 'ray.lengthSq') > 0)) refuse('degenerate_ray', { pointIndex: i });
        direction.normalize();
        return { index: i, requestedCSS: [x, y], alignedCSS: [(bx + 0.5) * cssW / buffer.x, (byTop + 0.5) * cssH / buffer.y],
          bufferPixelTopLeft: [bx, byTop], bufferPixelBottomLeft: [bx, byBottom], ndc,
          ray: new THREE.Ray(near, direction), rayState: { originWorld: vector(near, 'ray.origin'), directionWorld: vector(direction, 'ray.direction'),
            originDomain: 'near clip plane unprojected with inverse(actual P*V), world m', cameraWorldOrigin: [c.world[12], c.world[13], c.world[14]] } };
      });
      const a = new THREE.Vector3(), b = new THREE.Vector3(), ctri = new THREE.Vector3(), localPoint = new THREE.Vector3();
      const worldPoint = new THREE.Vector3(), clip = new THREE.Vector4(), bary = new THREE.Vector3();
      const scan = (entry, sample, visit) => {
        const localRay = sample.ray.clone().applyMatrix4(entry.inverse);
        vector(localRay.origin, 'localRay.origin'); vector(localRay.direction, 'localRay.direction');
        const pos = entry.position.array, index = entry.index && entry.index.array;
        const load = (v, id) => {
          const k = 3 * id, x = pos[k], y = pos[k + 1], z = pos[k + 2];
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) refuse('nonfinite_position', { objectId: entry.state.objectId, vertexIndex: id, components: [numberTag(x), numberTag(y), numberTag(z)] });
          v.set(x, y, z);
        };
        for (const draw of entry.drawCalls) for (let offset = draw.begin; offset < draw.end; offset += 3) {
          if (++counts.triangleVisits > bounds.triangleVisits) refuse('triangle_work_bound', { maximum: bounds.triangleVisits });
          const ia = index ? index[offset] : offset, ib = index ? index[offset + 1] : offset + 1, ic = index ? index[offset + 2] : offset + 2;
          if (!Number.isSafeInteger(ia) || !Number.isSafeInteger(ib) || !Number.isSafeInteger(ic) || ia < 0 || ib < 0 || ic < 0 || ia >= entry.position.count || ib >= entry.position.count || ic >= entry.position.count) refuse('index_out_of_range', { objectId: entry.state.objectId, offset, indices: [ia, ib, ic], positionCount: entry.position.count });
          load(a, ia); load(b, ib); load(ctri, ic);
          const side = draw.material.side;
          const hit = side === THREE.BackSide ? localRay.intersectTriangle(ctri, b, a, true, localPoint) : localRay.intersectTriangle(a, b, ctri, side === THREE.FrontSide, localPoint);
          if (!hit) continue;
          worldPoint.copy(localPoint).applyMatrix4(entry.world); vector(worldPoint, 'hit.world');
          clip.set(worldPoint.x, worldPoint.y, worldPoint.z, 1).applyMatrix4(pv);
          for (const [k, v] of [['x', clip.x], ['y', clip.y], ['z', clip.z], ['w', clip.w]]) finite(v, `hit.clip.${k}`);
          if (!(clip.w > 0) || clip.z < -clip.w || clip.z > clip.w) { counts.clippedIntersections++; continue; }
          if (THREE.Triangle.getBarycoord(localPoint, a, b, ctri, bary) === null) refuse('barycentric_degenerate_after_hit', { objectId: entry.state.objectId, offset, indices: [ia, ib, ic] });
          vector(bary, 'hit.barycentric');
          visit({ entry, offset, draw, indices: [ia, ib, ic], distance: finite(sample.ray.origin.distanceTo(worldPoint), 'hit.distance'),
            worldPoint: vector(worldPoint, 'hit.worldPoint'), localPoint: vector(localPoint, 'hit.localPoint'),
            barycentric: vector(bary, 'hit.barycentric'), clip: [clip.x, clip.y, clip.z, clip.w], ndcDepth: clip.z / clip.w,
            triangleLocal: [vector(a, 'triangle.a'), vector(b, 'triangle.b'), vector(ctri, 'triangle.c')] });
        }
      };
      const counted = [];
      stage.name = 'count-nearest-arm-and-foreground';
      let totalSurfaces = 0;
      for (const sample of samples) {
        const own = [], ownMisses = [];
        for (const entry of entries) if (entry.identity.ownArm) {
          let nearest = null, ties = 0;
          scan(entry, sample, hit => { if (!nearest || hit.distance < nearest.distance) { nearest = hit; ties = 0; } else if (hit.distance === nearest.distance) ties++; });
          if (nearest) own.push({ ...nearest, equalDistanceAlternatives: ties });
          else ownMisses.push({ objectId: entry.state.objectId, sourceElementId: entry.identity.sourceElementId, role: entry.identity.role, status: 'no-side-eligible-near-far-clipped-triangle-hit' });
        }
        const armDistance = own.length ? Math.min(...own.map(h => h.distance)) : null;
        let nonArmCount = 0, equalArmDistance = 0, allNonArmHits = 0;
        const fallback = [], closer = [];
        for (const entry of entries) if (!entry.identity.ownArm) scan(entry, sample, hit => {
          allNonArmHits++;
          if (armDistance !== null) {
            if (hit.distance < armDistance) {
              nonArmCount++;
              // R332: retain sufficient payloads during the ORIGINAL count traversal, in its exact order.
              // Continue every count/validation after64; a required total>64 still refuses before publication.
              // Any permitted total<=64 implies every required nearer hit is retained (not a partial report).
              if (closer.length < bounds.reportedSurfaces) closer.push(hit);
            } else if (hit.distance === armDistance) equalArmDistance++;
          }
          else { fallback.push(hit); fallback.sort((x, y) => x.distance - y.distance || x.entry.state.objectId - y.entry.state.objectId || x.offset - y.offset); if (fallback.length > bounds.noArmClosestCandidates) fallback.pop(); }
        });
        totalSurfaces += own.length + (armDistance === null ? fallback.length : nonArmCount);
        counted.push({ sample, own, ownMisses, armDistance, nonArmCount, equalArmDistance, allNonArmHits, fallback, closer });
      }
      stage.countedComplete = true;
      if (totalSurfaces > bounds.reportedSurfaces) refuse('surface_report_bound', { requiredSurfaceRecords: totalSurfaces, maximum: bounds.reportedSurfaces,
        samples: counted.map(q => ({ pointIndex: q.sample.index, nearestPerOwnArmMesh: q.own.length, nearestArmDistance: q.armDistance, closerNonArmSurfaces: q.nonArmCount, allNonArmTriangleHits: q.allNonArmHits, equalArmDistance: q.equalArmDistance })), publishedPartialSurfaceRecords: false });
      stage.name = 'materialize-bounded-report';
      const meshReports = new Map(), nodeReports = new Map();
      const hitReport = hit => {
        const e = hit.entry;
        if (!meshReports.has(e.state.objectId)) {
          for (const object of e.chain) { const s = observed.get(object); nodeReports.set(s.objectId, s); }
          meshReports.set(e.state.objectId, { objectId: e.state.objectId, ...e.identity, pass: e.pass, ancestorIds: e.chain.map(o => o.id),
            parentWorld: e.object.parent ? observed.get(e.object.parent).world : null, customOnBeforeRender: e.object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender, worldDeterminant: e.world.determinant(), groupOrder: e.groupOrder,
            frustum: e.cull, geometry: e.geometryState, drawCalls: e.drawCalls.map(d => ({ begin: d.begin, end: d.end, group: d.group, slot: d.slot, material: d.material })) });
        }
        return { objectId: e.state.objectId, indexOffset: hit.offset, triangleIndices: hit.indices, groupIndex: hit.draw.group, materialSlot: hit.draw.slot,
          distanceFromNearPlaneM: hit.distance, localPoint: hit.localPoint, worldPointM: hit.worldPoint, barycentricABC: hit.barycentric,
          triangleLocal: hit.triangleLocal, clip: hit.clip, ndcDepth: hit.ndcDepth,
          ...(hit.equalDistanceAlternatives === undefined ? {} : { equalDistanceAlternatives: hit.equalDistanceAlternatives }) };
      };
      const resultSamples = counted.map(q => {
        // R332: complete retained payloads only; NEVER re-intersect geometry to materialize a report.
        const nonArm = q.closer.map(hitReport);
        if (q.armDistance !== null && nonArm.length !== q.nonArmCount) refuse('count_materialization_drift', { pointIndex: q.sample.index, counted: q.nonArmCount, materialized: nonArm.length });
        return { pointIndex: q.sample.index, requestedCSS: q.sample.requestedCSS, alignedCSS: q.sample.alignedCSS,
          bufferPixelTopLeft: q.sample.bufferPixelTopLeft, bufferPixelBottomLeft: q.sample.bufferPixelBottomLeft, ndc: q.sample.ndc, ray: q.sample.rayState,
          status: q.armDistance === null ? 'no-arm-hit-unverified' : 'retained-geometric-candidates', nearestArmDistanceFromNearPlaneM: q.armDistance,
          nearestPerOwnArmMesh: q.own.map(hitReport), eligibleOwnArmMisses: q.ownMisses, closerNonArmSurfaces: nonArm, equalArmDistanceNonArmSurfaces: q.equalArmDistance,
          noArmClosestCandidates: q.armDistance === null ? q.fallback.map(hitReport) : [], allNonArmTriangleHitCount: q.allNonArmHits,
          fallbackScope: q.armDistance === null ? `First ${bounds.noArmClosestCandidates} by geometric distance then runtime object id/index offset; ties beyond K are not all included; not completion/render order` : 'not-used' };
      });
      const after = stampAfter();
      if (!after.observedFieldsUnchanged) refuse('observed_state_drift', { after, publishedPartialSurfaceRecords: false });
      const out = { kind, status: 'retained-geometric-candidates', start, after, bounds, counts, camera: cameraSnapshot, viewport,
        counterDomain: 'Three renderer.info.render.frame includes face passes; not a main-pass/native acknowledgement',
        frameDomain: 'retained cached CPU transforms; column-major matrices; source-local units vary by geometry, world and camera in m',
        surfaceRule: 'One nearest per eligible own-arm registry mesh (including its visible depth twin), ALL non-arm triangle intersections strictly closer than nearest arm hit; no all-behind dump',
        referenceScope: 'Eligible traversed own-arm registry meshes only; visibility/layer/cached-frustum exclusions are counted, not certified as drawn. No full75 visibility or framing acceptance.',
        facePass: { mode: faceMode, amount: finite(faceAmount, 'faceAmount'), ghostIncluded: activeGhostFace, insetOutsideScope: faceMode === 'inset' && faceAmount > 0 },
        samples: resultSamples, meshes: [...meshReports.values()], nodes: [...nodeReports.values()], limits };
      const logicalJSON = JSON.stringify(out);
      const bytes = new TextEncoder().encode(logicalJSON).length;
      if (bytes <= bounds.diagnosticUtf8Bytes) return out; // R341: original successful raw object/JSON stays unchanged.

      // R341: oversized reports ONLY. No filtering, rounding, lost fields or changed geometry/output bounds.
      // A distinct envelope prevents old consumers treating packed miss triples as old object records.
      stage.name = 'encode-bounded-report';
      const encoding = 'eligible-own-arm-misses-table-v1';
      const envelopeKind = 'ns-foreground-surface-report-envelope-r341';
      const envelopeStatus = 'encoded-retained-geometric-candidates';
      const missStatus = 'no-side-eligible-near-far-clipped-triangle-hit';
      const columns = ['objectId', 'sourceElementId', 'role'];
      const missKeys = [...columns, 'status'];
      const reportKeys = ['kind', 'status', 'start', 'after', 'bounds', 'counts', 'camera', 'viewport', 'counterDomain',
        'frameDomain', 'surfaceRule', 'referenceScope', 'facePass', 'samples', 'meshes', 'nodes', 'limits'];
      const sampleKeys = ['pointIndex', 'requestedCSS', 'alignedCSS', 'bufferPixelTopLeft', 'bufferPixelBottomLeft', 'ndc', 'ray',
        'status', 'nearestArmDistanceFromNearPlaneM', 'nearestPerOwnArmMesh', 'eligibleOwnArmMisses', 'closerNonArmSurfaces',
        'equalArmDistanceNonArmSurfaces', 'noArmClosestCandidates', 'allNonArmTriangleHitCount', 'fallbackScope'];
      const maxLogicalBytes = 1048576; // Existing full-Scene cap; never a larger local32768-byte output allowance.
      const rejectEncoding = (reason, detail = {}) => refuse('diagnostic_encoding_refused', {
        reason, ...detail, requiredUtf8Bytes: bytes, maximum: bounds.diagnosticUtf8Bytes,
        requiredSurfaceRecords: totalSurfaces, publishedPartialSurfaceRecords: false });
      const exactRecord = (value, keys, field) => {
        if (!value || Object.getPrototypeOf(value) !== Object.prototype) rejectEncoding('record_type', { field });
        const actual = Reflect.ownKeys(value);
        if (actual.length !== keys.length || actual.some((k, i) => k !== keys[i])) rejectEncoding('record_keys_or_order', {
          field, actualKeys: actual.map(k => typeof k === 'symbol' ? String(k) : k), expectedKeys: keys });
        for (const k of keys) {
          const d = Object.getOwnPropertyDescriptor(value, k);
          if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, 'value')) rejectEncoding('non_data_property', { field, key: k });
        }
        return value;
      };
      const denseArray = (value, maximum, field) => {
        if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) rejectEncoding('array_type_or_bound', { field, maximum });
        const keys = Reflect.ownKeys(value);
        if (keys.length !== value.length + 1 || keys[value.length] !== 'length') rejectEncoding('array_extra_or_sparse', { field });
        for (let i = 0; i < value.length; i++) {
          const d = Object.getOwnPropertyDescriptor(value, String(i));
          if (keys[i] !== String(i) || !d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, 'value')) rejectEncoding('array_extra_sparse_or_accessor', { field, index: i });
        }
        return value;
      };
      const validateTriple = (id, sourceId, role, field) => {
        if (!Number.isSafeInteger(id) || id < 0 || (sourceId !== null && typeof sourceId !== 'string') || typeof role !== 'string') {
          rejectEncoding('miss_value_type', { field, objectId: numberTag(id), sourceElementIdType: sourceId === null ? 'null' : typeof sourceId, roleType: typeof role });
        }
      };
      exactRecord(out, reportKeys, 'logical');
      if (out.kind !== kind || out.status !== 'retained-geometric-candidates') rejectEncoding('logical_kind_or_status');
      if (bytes > maxLogicalBytes) refuse('diagnostic_byte_bound', { requiredUtf8Bytes: bytes, maximum: bounds.diagnosticUtf8Bytes,
        requiredSurfaceRecords: totalSurfaces, logicalSceneMaximum: maxLogicalBytes, attemptedEncoding: encoding, publishedPartialSurfaceRecords: false });
      const logicalSamples = denseArray(out.samples, bounds.cssPoints, 'logical.samples');
      if (logicalSamples.length < 1) rejectEncoding('sample_count');
      const packedSamples = logicalSamples.map((sample, si) => {
        exactRecord(sample, sampleKeys, `logical.samples[${si}]`);
        const misses = denseArray(sample.eligibleOwnArmMisses, bounds.meshes, `logical.samples[${si}].eligibleOwnArmMisses`);
        const rows = misses.map((row, ri) => {
          const field = `logical.samples[${si}].eligibleOwnArmMisses[${ri}]`;
          exactRecord(row, missKeys, field);
          validateTriple(row.objectId, row.sourceElementId, row.role, field);
          if (row.status !== missStatus) rejectEncoding('miss_status', { field, actualStatus: typeof row.status === 'string' ? row.status : typeof row.status });
          return [row.objectId, row.sourceElementId, row.role];
        });
        return { ...sample, eligibleOwnArmMisses: rows }; // overwrite preserves original sample key position/order.
      });
      const envelope = { kind: envelopeKind, status: envelopeStatus, schemaVersion: 1, encoding, logicalKind: kind,
        logicalUtf8Bytes: bytes, missTable: { columns: columns.slice(), sharedStatus: missStatus },
        payload: { ...out, samples: packedSamples } };
      const encodedJSON = JSON.stringify(envelope);
      const encodedBytes = new TextEncoder().encode(encodedJSON).length;
      if (encodedBytes > bounds.diagnosticUtf8Bytes) refuse('diagnostic_byte_bound', { requiredUtf8Bytes: bytes,
        maximum: bounds.diagnosticUtf8Bytes, requiredSurfaceRecords: totalSurfaces, attemptedEncoding: encoding,
        encodedRequiredUtf8Bytes: encodedBytes, publishedPartialSurfaceRecords: false });

      // Reconstruct from the ACTUAL serialized packed form, not the original object or a claimed roundtrip label.
      const packed = JSON.parse(encodedJSON);
      exactRecord(packed, ['kind', 'status', 'schemaVersion', 'encoding', 'logicalKind', 'logicalUtf8Bytes', 'missTable', 'payload'], 'packed');
      if (packed.kind !== envelopeKind || packed.status !== envelopeStatus || packed.schemaVersion !== 1 || packed.encoding !== encoding ||
          packed.logicalKind !== kind || !Number.isSafeInteger(packed.logicalUtf8Bytes) || packed.logicalUtf8Bytes <= bounds.diagnosticUtf8Bytes || packed.logicalUtf8Bytes > maxLogicalBytes) rejectEncoding('envelope_metadata');
      exactRecord(packed.missTable, ['columns', 'sharedStatus'], 'packed.missTable');
      const packedColumns = denseArray(packed.missTable.columns, columns.length, 'packed.missTable.columns');
      if (packedColumns.length !== columns.length || packedColumns.some((v, i) => v !== columns[i]) || packed.missTable.sharedStatus !== missStatus) rejectEncoding('table_metadata');
      exactRecord(packed.payload, reportKeys, 'packed.payload');
      if (packed.payload.kind !== kind || packed.payload.status !== 'retained-geometric-candidates') rejectEncoding('payload_kind_or_status');
      const encodedSamples = denseArray(packed.payload.samples, bounds.cssPoints, 'packed.payload.samples');
      if (encodedSamples.length < 1) rejectEncoding('encoded_sample_count');
      const reconstructedSamples = encodedSamples.map((sample, si) => {
        exactRecord(sample, sampleKeys, `packed.payload.samples[${si}]`);
        const rows = denseArray(sample.eligibleOwnArmMisses, bounds.meshes, `packed.payload.samples[${si}].eligibleOwnArmMisses`);
        const misses = rows.map((row, ri) => {
          const field = `packed.payload.samples[${si}].eligibleOwnArmMisses[${ri}]`;
          denseArray(row, columns.length, field);
          if (row.length !== columns.length) rejectEncoding('row_arity', { field });
          validateTriple(row[0], row[1], row[2], field);
          return { objectId: row[0], sourceElementId: row[1], role: row[2], status: packed.missTable.sharedStatus };
        });
        return { ...sample, eligibleOwnArmMisses: misses };
      });
      const reconstructed = { ...packed.payload, samples: reconstructedSamples };
      const reconstructedJSON = JSON.stringify(reconstructed);
      const reconstructedBytes = new TextEncoder().encode(reconstructedJSON).length;
      if (reconstructedBytes !== packed.logicalUtf8Bytes || reconstructedBytes > maxLogicalBytes || reconstructedJSON !== logicalJSON) {
        rejectEncoding('full_json_roundtrip_mismatch', { reconstructedUtf8Bytes: reconstructedBytes });
      }
      return envelope; // Explicit encoded shape only; every original logical field/value/order is reconstructable.
    } catch (err) {
      return { kind, status: 'refused', start, after: stampAfter(), bounds, counts, stage: { ...stage }, camera: cameraSnapshot, viewport,
        refusal: err && err.r311Refusal ? { code: err.code, detail: err.detail } : { code: 'unexpected_error', detail: { message: err && typeof err.message === 'string' ? err.message : 'non-Error thrown' } },
        coverage: 'No surface report accepted/published. First refusal only; remaining unexamined objects/triangles are not silently treated as valid or absent.', limits };
    }
  }

  /** Tint muscles from simulated drive by catalog key ({ key: 0..1 }); muscles with no key keep the baseline tint.
   * U2b-scene: the ONE ns-colors rule (activityShadeInto: the red-brown tissue base darkened with activity plus the
   * shared ramp as emission), the same rule and ramp as the brain regions; mesh.userData.activity records the value. */
  /** byName (optional, R3-fix SL-2): { 'pronator teres': v, ... } display levels for muscles WITHOUT a catalog key,
   * matched case-insensitively against the mesh name (the forearm-turn muscles); same colour ramp. */
  function updateMuscles(byKey, byName = null) {
    for (const m of muscles) {
      let raw = m.key === null || !byKey ? baselineDrive : byKey[m.key];
      if (m.key === null && byName) {
        const nm = String(m.mesh.name || '').toLowerCase();
        for (const [k, v] of Object.entries(byName)) if (Number.isFinite(v) && nm.includes(k) && v > raw) raw = v;
      }
      const t = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : baselineDrive;
      if (t === m.lastT) continue;
      shadeMuscle(m.mat, t);
      if (m.mirror) shadeMuscle(m.mirror.material, t);
      m.mesh.userData.activity = t;
      m.lastT = t;
    }
  }

  function shadeMuscle(mat, t) {
    activityShadeInto(muscleBaseLinear, t, muscleShade);
    mat.color.setRGB(muscleShade.albedo[0], muscleShade.albedo[1], muscleShade.albedo[2]);
    mat.emissive.setRGB(muscleShade.emission[0], muscleShade.emission[1], muscleShade.emission[2]);
  }

  /** Drive the strip's simulated field from the given action display drives ({ actionId: 0..1 } or a Map). With the
   * shader patch this only writes 12 uniforms (no per-vertex work or upload); the CPU fallback recolours when a drive
   * changed by more than STRIP_DRIVE_TOLERANCE. Returns true when a drive value changed. */
  function updateStrip(drives) {
    if (!strip) return false;
    const dv = strip.uniforms.nsDrive.value;
    let changed = false;
    for (let i = 0; i < MARKERS.length; i++) {
      const id = MARKERS[i].actionId;
      const raw = drives ? (drives instanceof Map ? drives.get(id) : drives[id]) : 0;
      const v = Number.isFinite(raw) ? (raw < 0 ? 0 : raw > 1 ? 1 : raw) : 0;
      if (dv[i] !== v) { dv[i] = v; changed = true; }
    }
    lastStripDrives = dv;
    if (stripShader.applied === false) {
      const last = strip.cpuDrives;
      let stale = last === null;
      for (let i = 0; !stale && i < MARKERS.length; i++) if (Math.abs(last[i] - dv[i]) > STRIP_DRIVE_TOLERANCE || (last[i] !== dv[i] && dv[i] === 0)) stale = true;
      if (stale) recolourStripCpu();
    }
    return changed;
  }

  /** Enlarge and brighten the marker of the action under the crosshair (null clears). A2-render R1: the same action's
   * control region gets the strip hover outline/tint, and (armGhost 'auto') the arm ghost window fades in while an
   * action is under the crosshair. */
  function highlightMarker(actionId) {
    if (actionId === highlighted) return;
    highlighted = actionId;
    for (const mk of markers) {
      const active = mk.actionId === actionId;
      if (active === mk.active) continue;
      mk.active = active;
      mk.mat.color.set(active ? MATERIAL.markerActive : MATERIAL.marker);
      mk.mesh.scale.setScalar(markerSolid(mk.source, active).scale); // radius x activeScale when active, as picked
      mk.mesh.updateMatrix();
    }
    if (strip) {
      strip.uniforms.nsHover.value = MARKERS.findIndex(m => m.actionId === actionId);
      if (stripShader.applied === false) recolourStripCpu();
    }
  }

  /** Arm ghost window control: 'auto' (default: on while the gaze is on a strip region), true / false, or a fixed
   * amount 0..1. Call once, or every frame with a flag, e.g. setArmGhost(out.gaze.kind === 'strip'). */
  function setArmGhost(mode) {
    armGhostState.mode = ghostMode(mode);
    return armGhostState.mode;
  }

  /** Turn the decorative strip shimmer on or off (it is always off under prefers-reduced-motion unless forced). */
  function setShimmer(on) {
    stripShader.shimmer = Boolean(on);
    if (strip) strip.uniforms.nsShimmer.value = stripShader.shimmer ? 1 : 0;
    return stripShader.shimmer;
  }

  /** HUD-only: does the camera-centre ray hit any brain mesh? Never used for activation. */
  function raycastBrain(yaw, pitch) {
    const d = gazeDirection(yaw, pitch);
    rayDir.set(d[0], d[1], d[2]);
    // R5-scene (D18): from the render camera (the eye in first person, the third-person camera otherwise).
    rayOrigin.copy(camera.position);
    raycaster.set(rayOrigin, rayDir);
    return raycaster.intersectObjects(rayTargets || glass, false).length > 0;
  }

  /** Project named world points to viewport fractions: { name: { x: 0..1 left->right, y: 0..1 top->bottom, visible,
   * front } }. front (A2-render R1) is false for points behind the camera, whose x/y are not meaningful. */
  function projectWorld(points) {
    const out = {};
    for (const [name, p] of Object.entries(points || {})) {
      scratch.set(p[0], p[1], p[2]).project(camera);
      const visible = scratch.z >= -1 && scratch.z <= 1 && Math.abs(scratch.x) <= 1 && Math.abs(scratch.y) <= 1;
      out[name] = { x: (scratch.x + 1) / 2, y: (1 - scratch.y) / 2, visible, front: scratch.z < 1 };
    }
    return out;
  }

  /* ---------------------------------------------------------------- U2b-scene: regions */

  /** Region shading from the simulated state (ns-actions interface 4): regionActivity { regionId: 0..1 },
   * activatedRegions { regionId: count } (persistent marks until Reset body), gaze { target, regionId } (the hovered
   * region gets the outline). Material state is written only for regions whose quantised state changed. Returns the
   * number of regions restyled. Legacy mode: only the arm-ghost gaze flag is used. */
  function updateRegions({ regionActivity = null, activatedRegions = null, gaze = null } = {}) {
    const onRegion = Boolean(gaze && (gaze.target === 'region' || gaze.kind === 'region') && gaze.regionId);
    gazeOnRegion = onRegion;
    const nextHover = onRegion ? gaze.regionId : null;
    if (nextHover !== hoveredRegionId) overlayDirty = true;
    hoveredRegionId = nextHover;
    let changed = 0;
    for (const rec of regions) {
      const a = regionActivity ? regionActivity[rec.id] : 0;
      const n = activatedRegions ? activatedRegions[rec.id] : 0;
      if (applyRegionStyle(rec, Number.isFinite(a) ? a : 0, Number.isFinite(n) ? n : 0, rec.id === hoveredRegionId)) changed++;
    }
    return changed;
  }

  // R4-fix (review F2): the small-area switched-on markers (DOM rings over the brain, one per marked small area).
  const markDots = new Map(); // region id -> { el, x, y, shown, small, at }
  let markFrame = 0;
  function updateMarkDots(reserveRight = 0, reserveBottom = 0) {
    markFrame++;
    const mw = brainGroup.matrixWorld, vi = camera.matrixWorldInverse, pm = camera.projectionMatrix;
    const proj = (x, y, z) => { pv.set(x, y, z).applyMatrix4(mw).applyMatrix4(vi); if (pv.z > -near) return null; pv.applyMatrix4(pm); return [(pv.x + 1) * 0.5 * cssW, (1 - pv.y) * 0.5 * cssH]; };
    const inView = brainTransformSet && cssW > 0 && cssH > 0;
    for (const rec of regions) {
      let d = markDots.get(rec.id);
      const want = inView && rec.activated > 0 && rec.markPts && rec.markCentre;
      if (!want) { if (d && d.shown) { d.shown = false; d.el.hidden = true; } continue; }
      if (!d) {
        const e = el('div', 'ns-mark-dot', overlay);
        e.setAttribute('data-ns-mark-dot', rec.id);
        e.setAttribute('aria-hidden', 'true');
        e.hidden = true;
        d = { el: e, x: '', y: '', shown: false, small: null, at: -1e9 };
        markDots.set(rec.id, d);
      }
      // Re-measure the drawn size every SMALL_MARK.everyFrames frames (the view, an orbit or a drag change it).
      if (d.small === null || markFrame - d.at >= SMALL_MARK.everyFrames) {
        const P = rec.markPts, xy = [];
        for (let i = 0; i < P.length; i += 3) { const q = proj(P[i], P[i + 1], P[i + 2]); if (q) xy.push(q[0], q[1]); }
        let area = 0;
        if (xy.length >= 6) { const h = convexHull2d(xy), n = h.length >> 1; for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += h[2 * i] * h[2 * j + 1] - h[2 * j] * h[2 * i + 1]; } area = Math.abs(area) / 2; }
        d.small = xy.length >= 2 && area < SMALL_MARK.areaFrac * cssW * cssH;
        d.area = Math.round(area);
        d.at = markFrame;
      }
      const c = rec.markCentre, q = d.small ? proj(c[0], c[1], c[2]) : null;
      const ok = Boolean(q) && q[0] >= 0 && q[0] <= cssW && q[1] >= 0 && q[1] <= cssH
        && !(reserveRight > 0 && q[0] > cssW - reserveRight) && !(reserveBottom > 0 && q[1] > cssH - reserveBottom);
      if (!ok) { if (d.shown) { d.shown = false; d.el.hidden = true; } continue; }
      const l = px(q[0]), t = px(q[1]);
      d.px = q[0]; d.py = q[1];
      if (d.x !== l) { d.el.style.left = l; d.x = l; }
      if (d.y !== t) { d.el.style.top = t; d.y = t; }
      if (!d.shown) { d.shown = true; d.el.hidden = false; }
    }
  }

  /** World points of the brain's orientation labels in region mode ({ right, left, anterior, posterior } just outside
   * the strips' bounds along the transform's axes), for hud.placeOrientation; null in legacy mode or before a transform. */
  function brainOrientationAnchors() {
    if (!regionMode || !brainTransformSet || !segmentation) return null;
    const m = brainGroup.matrixWorld.elements;
    const w = p => apply4(m, p);
    const pad = 6; // mm outside the brain
    // Source frame: +x subject LEFT, +y POSTERIOR, +z SUPERIOR.
    // R3-scene: with the whole brain in view (D1), "Front" / "Back" / "Your right" / "Your left" belong at the WHOLE
    // brain's poles and sides (its support points), not at the motor strips' edges (which put "Front" mid-brain).
    // Each label goes to the silhouette point that lies furthest along that anatomical direction AS SEEN ON SCREEN (the
    // tilted brain's posterior pole, for example, projects inside the outline; its outline edge is what reads as "back").
    if (brainSupport && brainSupport.points.length >= 9) {
      const P = brainSupport.points, n = P.length / 3;
      const c = [0, 0, 0];
      for (let i = 0; i < P.length; i += 3) { c[0] += P[i] / n; c[1] += P[i + 1] / n; c[2] += P[i + 2] / n; }
      camera.updateMatrixWorld(true);
      const mw = brainGroup.matrixWorld;
      const scr = (x, y, z, out) => { pv.set(x, y, z).applyMatrix4(mw).project(camera); out[0] = pv.x; out[1] = pv.y; out[2] = pv.z; return out; };
      const s0 = scr(c[0], c[1], c[2], [0, 0, 0]), s1 = [0, 0, 0], q = [0, 0, 0];
      const AX = { right: [-1, 0, 0], left: [1, 0, 0], anterior: [0, -1, 0], posterior: [0, 1, 0] };
      const out = {};
      for (const [k, a] of Object.entries(AX)) {
        scr(c[0] + 20 * a[0], c[1] + 20 * a[1], c[2] + 20 * a[2], s1);
        let dx = s1[0] - s0[0], dy = s1[1] - s0[1];
        const L = Math.hypot(dx, dy);
        let best = -1, bestV = -Infinity;
        for (let i = 0; i < P.length; i += 3) {
          // degenerate (the axis points at the camera): fall back to the extreme along the source axis
          const v = L > 1e-6 ? (scr(P[i], P[i + 1], P[i + 2], q), (q[0] - s0[0]) * dx / L + (q[1] - s0[1]) * dy / L)
            : P[i] * a[0] + P[i + 1] * a[1] + P[i + 2] * a[2];
          if (v > bestV) { bestV = v; best = i; }
        }
        const mid = k === 'anterior' || k === 'posterior';
        out[k] = w([(mid ? c[0] : P[best]) + pad * a[0], P[best + 1] + pad * a[1], P[best + 2] + pad * a[2]]);
      }
      return out;
    }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const s of segmentation.strips) {
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], s.boundsMin[i]); hi[i] = Math.max(hi[i], s.boundsMax[i]); }
    }
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]];
    return {
      right: w([lo[0] - pad, c[1], c[2]]), left: w([hi[0] + pad, c[1], c[2]]),
      anterior: w([c[0], lo[1] - pad, c[2]]), posterior: w([c[0], hi[1] + pad, c[2]])
    };
  }

  /* ---------------------------------------------------------------- U2b-scene: info overlay */

  /** Far-right information overlay (R14) for an ns-app infoOverlayModel. Rewrites text only when the content changes;
   * null hides the panel. Returns true when something was written. */
  function setInfo(model) {
    if (!info) return false;
    const c = infoPanelContent(model);
    if (!c) { if (!info.panel.hidden) { info.panel.hidden = true; hudReadIn = 0; hudDirty = true; } info.last = null; overlayDirty = true; return true; }
    const sig = JSON.stringify(c);
    if (sig === info.last) return false;
    info.last = sig;
    overlayDirty = true;
    hudDirty = true; // R4-scene: the panel's size may change with its text: re-read the obstacles in this same frame
    const put = (e, t) => { if (e.textContent !== t) e.textContent = t; const h = t === ''; if (e.hidden !== h) e.hidden = h; };
    info.panel.setAttribute('data-mode', c.mode);
    info.panel.setAttribute('data-left-arm', c.leftArm ? 'true' : 'false');
    put(info.heading, c.heading);
    put(info.title, c.title);
    put(info.tag, c.tag);
    put(info.viewed, c.viewed);
    if (c.activity) {
      put(info.activity, c.activity.text);
      if (info.swatch.style) info.swatch.style.background = c.activity.css;
      info.actRow.hidden = false;
      info.meter.hidden = false;
      if (info.meterMark.style) info.meterMark.style.left = `${(c.activity.value * 100).toFixed(1)}%`;
    } else { put(info.activity, ''); info.actRow.hidden = true; info.meter.hidden = true; }
    put(info.activations, c.activations);
    while (info.rows.firstChild) info.rows.removeChild(info.rows.firstChild);
    for (const [k, v] of c.rows) {
      const slug = ROW_SLUG[k] || k.toLowerCase().split(/[^a-z]+/)[0] || 'row';
      el('dt', `ns-infopanel-key-${slug}`, info.rows).textContent = k;
      el('dd', `ns-infopanel-row-${slug}`, info.rows).textContent = v;
    }
    info.rows.hidden = c.rows.length === 0;
    put(info.plain, c.plain);
    put(info.explanation, c.explanation);
    put(info.simulated, c.simulated);
    put(info.known, c.known);
    put(info.regionCaveat, c.regionCaveat);
    while (info.caveats.firstChild) info.caveats.removeChild(info.caveats.firstChild);
    for (const t of c.caveats) el('li', '', info.caveats).textContent = t;
    info.caveats.hidden = c.caveats.length === 0;
    put(info.citations, c.citations ? `${NsText.INFO.sourcesPrefix}${c.citations}` : '');
    // Round 3 (D3): the technical layer, collapsed again whenever the subject changes.
    while (info.moreBody.firstChild) info.moreBody.removeChild(info.moreBody.firstChild);
    if (c.more) {
      put(info.moreSummary, c.more.summary);
      for (const [k, t] of c.more.items) {
        const d = el('p', 'ns-infopanel-detail-item', info.moreBody);
        el('span', 'ns-infopanel-detail-key', d).textContent = k;
        el('span', 'ns-infopanel-detail-value', d).textContent = ` ${t}`;
      }
      if (c.more.explanation) el('p', 'ns-infopanel-detail-text', info.moreBody).textContent = c.more.explanation;
      if (c.more.note) el('p', 'ns-infopanel-detail-text', info.moreBody).textContent = c.more.note;
      if (c.more.caveats.length) {
        const ul = el('ul', 'ns-infopanel-detail-caveats', info.moreBody);
        for (const t of c.more.caveats) el('li', '', ul).textContent = t;
      }
      if (c.more.sources) el('p', 'ns-infopanel-detail-sources', info.moreBody).textContent = c.more.sources;
      if (info.moreKey !== c.key) { info.more.open = false; info.moreKey = c.key; }
      info.more.hidden = false;
    } else {
      info.more.hidden = true;
      info.more.open = false;
      info.moreKey = null;
    }
    if (info.panel.hidden) { info.panel.hidden = false; hudReadIn = 0; hudDirty = true; } // R3-scene: re-measure the obstacles now
    return true;
  }

  /* ---------------------------------------------------------------- U2b-scene: full body and face layer */

  const entryList = entries => (entries instanceof Map ? [...entries.values()] : Array.isArray(entries) ? entries : entries && Array.isArray(entries.assets) ? entries.assets : []);
  const meshOf = (meshesById, id) => (meshesById instanceof Map ? meshesById.get(id) : meshesById ? meshesById[id] : null);

  /** Full body (shared interface 3/6). entries: FULLBODY-MESH-MANIFEST assets (or ns-body entries) with element_id,
   * region, kind, label; meshesById: Map | object id -> { positions (source mm), indices }; rig (ns-body
   * buildBodyRig, optional, unused for drawing). Options: bodyToWorld (4x4, else the current body frame). Bones use the
   * arm's bone material, muscles their own material shaded by the shared ns-colors rule. Meshes listed under region
   * head_face, or with any vertex within FACE_LAYER.nearClearM of the eye, go to the face layer only. Returns
   * { meshes, inPlace, face, skipped }. */
  function setBody({ entries, meshesById, bodyToWorld = null } = {}) {
    if (bodySet) fail('scene_state', 'setBody may be called once');
    bodySet = true;
    if (bodyToWorld) setBodyFrame(bodyToWorld);
    const list = entryList(entries);
    const nearMm = FACE_LAYER.nearClearM * 1000;
    const faceLo = [Infinity, Infinity, Infinity], faceHi = [-Infinity, -Infinity, -Infinity];
    let skipped = 0;
    for (const entry of list) {
      const id = entry && (entry.element_id || entry.id);
      const m = id ? meshOf(meshesById, id) : null;
      if (!m || !m.positions || !m.indices || m.positions.length < 9 || m.indices.length < 3) { skipped++; continue; }
      const part = bodyPartOf(entry);
      const kind = bodyKindOf(entry);
      const near = nearestDistance(m.positions, eyeBp, m.positions.length > 30000 ? 2 : 1) < nearMm;
      const face = part === 'face' || (near && !isBodyGirdleEntry(entry));
      const geo = indexedGeometry(m.positions instanceof Float32Array ? m.positions : Float32Array.from(m.positions), m.indices instanceof Uint32Array ? m.indices : Uint32Array.from(m.indices));
      geo.computeVertexNormals();
      if (typeof geo.computeBoundingSphere === 'function') geo.computeBoundingSphere();
      let material;
      const trunk = !face && (part === 'torso' || part === 'neck');
      if (kind === 'muscle') {
        material = keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: 0.55, metalness: 0 }));
        if (face) { material.transparent = true; material.opacity = FACE_LAYER.muscleOpacity; material.depthWrite = false; }
        else if (trunk) torsoPatch(material);
        if (!face) overBrainPatch(material);
        glowRimPatch(material); // R5-scene (D17)
        shadeMuscle(material, MUSCLE_REST_DRIVE);
      } else material = face ? faceBoneMaterial : trunk ? torsoBoneMaterial : bodyBoneMaterial;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = bodyMeshName(entry, id) + (face ? ' [face layer]' : '');
      mesh.matrixAutoUpdate = false;
      mesh.userData = { elementId: id, bodyPart: face ? 'face' : part, anatomicalPart: part, kind, region: entry.region || null, faceLayer: face, nearEye: near, activity: kind === 'muscle' ? MUSCLE_REST_DRIVE : null };
      (face ? faceGroup : bodyGroup).add(mesh);
      // R3-scene: smooth translucent layers draw only their nearest surface (depth pre-pass twins): the torso while looking
      // down, the face layer always (a tidy single-layer ghost instead of bones showing through muscles).
      if (trunk) { mesh.renderOrder = BODY_ORDER.torso; depthTwin(mesh, torsoDepthMaterial, BODY_ORDER.torsoDepth, torsoTwins); }
      else if (!face) mesh.renderOrder = BODY_ORDER.torso; // R3-fix (M4): drawn after the brain so the see-through part blends over it
      else if (face) { mesh.renderOrder = BODY_ORDER.face; depthTwin(mesh, faceDepthMaterial, BODY_ORDER.faceDepth, faceTwins).visible = true; }
      if (face) {
        const p = m.positions;
        for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < faceLo[k]) faceLo[k] = p[i + k]; if (p[i + k] > faceHi[k]) faceHi[k] = p[i + k]; }
      }
      const rec = { id, mesh, part: face ? 'face' : part, anatomicalPart: part, kind, material, face, lastDrive: kind === 'muscle' ? MUSCLE_REST_DRIVE : null };
      // R5-scene (D17): body side from the rest centre (source +x = subject LEFT): -1 left, +1 right, 0 midline.
      {
        const c = geo.boundingSphere ? geo.boundingSphere.center : null;
        rec.side = c ? (c.x > 15 ? -1 : c.x < -15 ? 1 : 0) : 0;
      }
      // R5-scene (D19): the mirror twin (same geometry and pose matrix, opaque, head and face in place).
      {
        const tm = kind === 'muscle' ? mirrorMuscleMaterial() : mirrorBoneMaterial;
        if (kind === 'muscle') shadeMuscle(tm, MUSCLE_REST_DRIVE);
        const tw = new THREE.Mesh(geo, tm);
        tw.name = `mirror image: ${bodyMeshName(entry, id)}`;
        tw.matrixAutoUpdate = false;
        tw.userData = { mirrorOf: id, elementId: id, bodyPart: part, kind, side: rec.side, nsFullGeometry: geo };
        mirrorBodyGroup.add(tw);
        rec.mirror = tw;
        mesh.userData.nsMirrorTwin = tw;
        mirror.twins++;
      }
      // R5-scene (D18): head and face meshes also get an IN-PLACE twin on your own body, shown only in third person.
      if (face) {
        let im = bodyBoneMaterial;
        if (kind === 'muscle') { im = glowRimPatch(overBrainPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: 0.55, metalness: 0 })))); shadeMuscle(im, MUSCLE_REST_DRIVE); }
        const ip = new THREE.Mesh(geo, im);
        ip.name = `${bodyMeshName(entry, id)} [in place: third person]`;
        ip.matrixAutoUpdate = false;
        ip.visible = camState.headInPlace;
        ip.renderOrder = BODY_ORDER.torso;
        ip.userData = { elementId: id, bodyPart: 'face', anatomicalPart: part, kind, inPlace: true };
        bodyGroup.add(ip);
        rec.inPlace = ip;
        mesh.userData.nsInPlaceTwin = ip;
      }
      body.push(rec);
      bodyById.set(id, rec);
    }
    // R5-integrate-core (D20): face-muscle packet meshes (R5-face ids zf-..., source_packet face-muscles-r1) are in the body.
    const facePacket = list.filter(e => e && (e.source_packet === 'face-muscles-r1' || e.packet === 'face-muscles-r1' || /^zf-/.test(String(e.element_id || e.id || '')))).length;
    if (facePacket > 0 && NS_TEXT.FACE_R5) {
      faceText = Object.freeze({ ...FACE_LAYER, ghostLabel: NS_TEXT.FACE_R5.ghostLabel, insetLabel: NS_TEXT.FACE_R5.insetLabel });
      if (faceCaption) faceCaption.textContent = faceText.insetLabel;
      faceLabelLast.text = '';
    }
    facePacketMeshes = facePacket;
    if (faceLo.every(Number.isFinite)) {
      faceHeadCentre = [0, 1, 2].map(k => (faceLo[k] + faceHi[k]) / 2);
      faceRadiusMm = Math.hypot(faceHi[0] - faceLo[0], faceHi[1] - faceLo[1], faceHi[2] - faceLo[2]) / 2;
    }
    faceStateKey = '';
    bodyGroup.updateMatrixWorld(true);
    mirrorBodyGroup.matrix.fromArray(bodyFrame);
    mirrorBodyGroup.matrixWorldNeedsUpdate = true;
    mirror.ready = false; // R5-scene (D19): measured at the next render (computeMirrorBody)
    if (lodApplied) setLod(QUALITY_LEVELS[qState.level].lod, lodApplied); // R4-scene: a body set while a LOD level is on
    applyMirrorLod();
    const face = body.filter(b => b.face).length;
    return { meshes: body.length, inPlace: body.length - face, face, skipped };
  }

  /** R183: exact-ID regional anatomy is independent from target display selection.
   * Full scope/caveats come from the same pinned local catalogue as ns-body. Body
   * offset values here remain TARGET metadata; applied arm offsets are R174 fields. */
  let bodyLayerInfo = null;
  function setBodyLayers(summary) {
    if (summary && summary.regionalCatalogueSha256 !== REGIONAL_LAYER_PROVENANCE.classificationDataSha256) {
      fail('scene_input', 'body layer summary catalogue identity does not match the scene');
    }
    const selected = new Set(summary && Array.isArray(summary.displaySelected) ? summary.displaySelected : []);
    const off = summary && summary.offsetMm && typeof summary.offsetMm === 'object' ? summary.offsetMm : {};
    const n = { superficial: 0, intermediate_deep: 0, unclassified: 0, displaySelected: 0 };
    for (const b of body) {
      if (b.kind !== 'muscle') continue;
      const q = regionalLayerQualification(b.id);
      const isSelected = q.candidate && selected.has(b.id);
      const targetOffsetMm = isSelected && Number.isFinite(off[b.id]) ? off[b.id] : 0;
      const bw = Object.freeze({ ...regionalLayerMetadata(b.id, isSelected),
        displayStatus: isSelected ? 'selected-target' : 'not-selected',
        offsetMm: targetOffsetMm, targetOffsetMm, offsetMeaning: 'target-not-applied',
        targetAmount: summary && Number.isFinite(summary.targetAmount) ? summary.targetAmount : null });
      b.mesh.userData.bodyWorlds = bw;
      if (b.mirror) b.mirror.userData.bodyWorlds = bw;
      if (b.inPlace) b.inPlace.userData.bodyWorlds = bw;
      n[q.layer]++;
      if (isSelected) n.displaySelected++;
    }
    // Compatibility count only: scoped intermediate/deeper relations, not all unlifted meshes.
    bodyLayerInfo = { ...n, deep: n.intermediate_deep };
    return { ...bodyLayerInfo };
  }

  /** Body frame: a 4x4 BodyParts3D mm -> world m matrix (ns-arm armAttachment().bodyToWorld or ns-math
   * bodyToWorldMatrix), or { eyeBp, bodyYaw }. Changing it moves the whole body (and the face layer's anchor). */
  function setBodyFrame(frame, sourceEyeBp = null) {
    let m = null, yaw = bodyYaw;
    if (frame && frame.length === 16) m = Float64Array.from(frame);
    else if (frame && frame.eyeBp) { yaw = Number.isFinite(frame.bodyYaw) ? frame.bodyYaw : 0; m = bodyFrameMatrix(frame.eyeBp, yaw); }
    if (!m || !Array.prototype.every.call(m, Number.isFinite)) fail('scene_input', 'setBodyFrame needs a finite 4x4 matrix or { eyeBp, bodyYaw }');
    const inferredEye = eyeFromBodyFrame(m);
    if (!inferredEye) fail('scene_input', 'setBodyFrame matrix is singular');
    const eye = sourceEyeBp === null ? inferredEye : (sourceEyeBp.length === 3 && Array.from(sourceEyeBp).every(Number.isFinite) ? Array.from(sourceEyeBp) : null);
    if (!eye) fail('scene_input', 'setBodyFrame matrix is singular');
    // Body yaw: the world direction of the body's anterior (-y source) projected on the horizontal plane.
    const ax = -m[4], az = -m[6]; // A (0, -1, 0): world = -(column 1)
    if (Math.hypot(ax, az) > 1e-12) yaw = Math.atan2(-ax, -az);
    let same = true;
    for (let i = 0; i < 16; i++) if (bodyFrame[i] !== m[i]) { same = false; break; }
    if (same && sourceEyeBp !== null && (bodyFrameSource !== 'canonical-matrix-original-source-eye' || eyeBp.some((v, i) => v !== eye[i]))) same = false;
    if (same) return false;
    bodyFrame = m; eyeBp = eye; bodyYaw = yaw; bodyFrameSource = sourceEyeBp !== null ? 'canonical-matrix-original-source-eye' : frame && frame.length === 16 ? 'matrix' : 'eye';
    bodyGroup.matrix.fromArray(m);
    bodyGroup.matrixWorldNeedsUpdate = true;
    mirrorBodyGroup.matrix.fromArray(m);
    mirrorBodyGroup.matrixWorldNeedsUpdate = true;
    faceStateKey = '';
    return true;
  }

  /** Pose the full body: matrices = poseBody(rig, targets) (Map | object meshId -> column-major 4x4 in the BodyParts3D
   * frame, mm -> mm), drives = bodyMuscleDrives(...) ({ muscleMeshId: 0..1 }, missing ids keep the rest tint). GPU
   * transforms only (no CPU skinning); a matrix or drive is written only when it changed. Returns the number of meshes
   * whose matrix changed. */
  function updateBody(matrices, drives = null) {
    let n = 0;
    const get = (src, id) => (src instanceof Map ? src.get(id) : src ? src[id] : undefined);
    if (matrices) {
      for (const b of body) {
        const m = get(matrices, b.id);
        if (!m || m.length !== 16) continue;
        const e = b.mesh.matrix.elements;
        let same = true;
        for (let i = 0; i < 16; i++) if (e[i] !== m[i]) { same = false; break; }
        if (same) continue;
        b.mesh.matrix.fromArray(m);
        b.mesh.matrixWorldNeedsUpdate = true;
        if (b.mirror) { b.mirror.matrix.fromArray(m); b.mirror.matrixWorldNeedsUpdate = true; }
        if (b.inPlace) { b.inPlace.matrix.fromArray(m); b.inPlace.matrixWorldNeedsUpdate = true; }
        n++;
      }
      // R5-scene (D19): the mirror body's centre and size are measured once from the first posed body.
      if (!mirror.posed) { mirror.posed = true; mirror.ready = false; }
      if (n > 0) bodyPoseSerial++;
    }
    for (const b of body) {
      if (b.kind !== 'muscle') continue;
      const raw = drives ? get(drives, b.id) : undefined;
      const t = Number.isFinite(raw) ? fin01(raw) : MUSCLE_REST_DRIVE;
      const q = Math.round(t * 512) / 512;
      if (q === b.lastDrive) continue;
      b.lastDrive = q;
      shadeMuscle(b.material, q);
      if (b.mirror) shadeMuscle(b.mirror.material, q);
      if (b.inPlace && b.kind === 'muscle') shadeMuscle(b.inPlace.material, q);
      b.mesh.userData.activity = q;
    }
    return n;
  }

  /** Face layer mode: 'ghost' (default) | 'inset' | 'off' (FACE_VIEW_MODES). */
  function setFaceView(mode) {
    if (!FACE_VIEW_MODES.includes(mode)) fail('scene_args', `face view must be one of ${FACE_VIEW_MODES.join(', ')}`);
    faceMode = mode;
    faceStateKey = '';
    overlayDirty = true;
    return faceMode;
  }

  /** Update the face layer for the current pitch / mode (transform, opacity, label); cheap when unchanged. */
  function updateFaceLayer() {
    const hasFace = faceHeadCentre !== null && faceGroup.children.length > 0;
    // R5-scene (D18): with the camera away from the head (third person) the head and face are drawn in place instead.
    faceAmount = hasFace && faceMode !== 'off' && !camState.headInPlace ? faceLayerAmount(lookPitch) * (camPose ? camMul.faceGhost : 1) : 0;
    const q = Math.round(faceAmount * 64);
    const faceFrameKey = referenceOriginSet ? `ok|${eyeRig.position.x},${eyeRig.position.y},${eyeRig.position.z}` : 'ok';
    if (faceStateKey === faceFrameKey && faceMode === lastFaceMode && q === lastFaceQ && bodyYaw === lastFaceYaw) return;
    faceStateKey = faceFrameKey; lastFaceMode = faceMode; lastFaceQ = q; lastFaceYaw = bodyYaw;
    overlayDirty = true;
    faceGroup.visible = q > 0;
    if (q === 0) return;
    if (faceMode === 'ghost') {
      faceGroup.matrix.fromArray(faceGhostMatrix({ headCentreBp: faceHeadCentre, bodyYaw }));
      if (referenceOriginSet) { faceGroup.matrix.elements[12] += eyeRig.position.x; faceGroup.matrix.elements[13] += eyeRig.position.y; faceGroup.matrix.elements[14] += eyeRig.position.z; }
      // Light from the eye's side: along the direction from the ghost to the eye, Ry(bodyYaw) (0, -sin e, cos e).
      const e = FACE_LAYER.elevationDeg * DEG;
      faceKey.position.set(Math.cos(e) * Math.sin(bodyYaw), -Math.sin(e), Math.cos(e) * Math.cos(bodyYaw));
    } else {
      const d = Math.max(0.1, (faceRadiusMm * 0.001 * 1.25) / Math.tan((FACE_LAYER.inset.fovDeg * DEG) / 2));
      faceGroup.matrix.fromArray(faceInsetMatrix({ headCentreBp: faceHeadCentre, distanceM: d }));
      faceKey.position.set(0, 0.3, 1);
    }
    // Round-2 fix V4: update the world matrix NOW (faceScene renders after layoutOverlay), so the label projected in
    // this frame's layoutOverlay uses the new placement instead of hiding for up to HUD_READ_EVERY frames.
    faceGroup.matrixWorldNeedsUpdate = true;
    faceGroup.updateMatrixWorld(true);
    const k = q / 64;
    faceBoneMaterial.opacity = FACE_LAYER.boneOpacity * (faceMode === 'ghost' ? k : 1);
    for (const b of body) if (b.face && b.kind === 'muscle') b.material.opacity = FACE_LAYER.muscleOpacity * (faceMode === 'ghost' ? k : 1);
  }

  /** Which body parts are in view now: { torso, legs, rightArm, leftArm, neck, face, faceMode, faceAmount, counts,
   * bodyLoaded, frame } (booleans: at least one visible mesh of that part intersects the camera frustum; face: the face
   * layer is showing). Uses the last rendered camera and transforms. */
  function bodyVisibility() {
    const out = { torso: false, legs: false, rightArm: false, leftArm: false, neck: false, face: false, faceMode, faceAmount: Math.round(faceAmount * 1000) / 1000, counts: {}, bodyLoaded: body.length > 0, frame: bodyFrameSource };
    if (!frustum || !projView) return out;
    camera.updateMatrixWorld(true);
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    bodyGroup.updateMatrixWorld(true);
    faceGroup.updateMatrixWorld(true);
    for (const b of body) {
      if (b.face) continue;
      if (!b.mesh.visible || !b.mesh.geometry.boundingSphere) continue;
      if (frustum.intersectsObject(b.mesh)) { out[b.part] = true; out.counts[b.part] = (out.counts[b.part] || 0) + 1; }
    }
    if (faceMode === 'ghost' && faceGroup.visible && faceAmount > 0) {
      for (const b of body) if (b.face && b.mesh.geometry.boundingSphere && frustum.intersectsObject(b.mesh)) { out.face = true; out.counts.face = (out.counts.face || 0) + 1; }
    } else if (faceMode === 'inset' && faceGroup.visible && faceAmount > 0) out.face = true;
    // R5-scene (D18): in third person the head and face are drawn in place.
    if (camState.headInPlace) for (const b of body) if (b.inPlace && b.mesh.geometry.boundingSphere && frustum.intersectsObject(b.inPlace)) { out.face = true; out.counts.face = (out.counts.face || 0) + 1; }
    out.camera = camState.mode;
    for (const b of bones) if (b.mesh.geometry && b.mesh.geometry.boundingSphere && frustum.intersectsObject(b.mesh)) { out.leftArm = true; out.counts.leftArm = (out.counts.leftArm || 0) + 1; }
    return out;
  }

  /* ---------------------------------------------------------------- U2b-scene: orbit arrows and overlay layout */

  /** The BRAIN's orbit arrow under CSS point (x, y) (e.g. the crosshair while the pointer is captured), or null. Round-4
   * compatible wrapper of pickArrows (R5-scene: 3D arrows; mirror arrows come only from pickArrows). */
  function orbitArrowAt(x, y) {
    for (const h of pickArrows(x, y)) if (h.kind === 'arrow' && h.target === 'brain') return h.dir;
    return null;
  }
  /** Round-4 compatible: highlight one BRAIN arrow (dir) or none (null). R5-scene: setArrowHover({ target, dir, blocked }). */
  function hoverOrbitArrow(dir) {
    setArrowHover(ARROW_DIRS.includes(dir) ? { target: 'brain', dir } : null);
    return hoverDir;
  }
  /** R4-scene arm envelope: RETIRED in round 5 (the 3D arrows sit at fixed compass positions and an arm in front of one
   * shows it as a see-through silhouette). Kept so ns-app's call stays harmless; it only records the envelope. */
  let armEnv = null, armEnvSerial = 0;
  function setArmEnvelope(envelope, size = null) {
    const env = envelope && Array.isArray(envelope.poses) ? envelope : armSweepEnvelope(envelope);
    const w = size && size.width > 0 ? Math.round(size.width) : cssW, h = size && size.height > 0 ? Math.round(size.height) : cssH;
    armEnv = env ? { envelope: env, forKey: `${w}x${h}`, serial: ++armEnvSerial } : null;
    return armEnv ? { poses: env.poses.length, forKey: armEnv.forKey, used: false } : null;
  }
  /** Round-2 fix V2: the player's arm shapes (ns-app armAvoidShapes: { rects, ellipses } in viewport fractions, y
   * down) that region labels keep clear of; null clears them. The overlay re-lays out when they change noticeably. */
  let labelAvoid = null, labelAvoidKey = '';
  function setLabelAvoid(avoid) {
    const ok = avoid && typeof avoid === 'object' && (Array.isArray(avoid.rects) || Array.isArray(avoid.ellipses));
    labelAvoid = ok ? { rects: (avoid.rects || []).filter(r => r && [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite)),
      ellipses: (avoid.ellipses || []).filter(e => e && [e.cx, e.cy, e.rx, e.ry].every(Number.isFinite)) } : null;
    const q = v => Math.round(v * 50);
    const key = labelAvoid ? [...labelAvoid.rects.map(r => `${q(r.x0)},${q(r.y0)},${q(r.x1)},${q(r.y1)}`),
      ...labelAvoid.ellipses.map(e => `${q(e.cx)},${q(e.cy)},${q(e.rx)}`)].join('|') : '';
    if (key !== labelAvoidKey) { labelAvoidKey = key; overlayDirty = true; }
    return labelAvoid !== null;
  }
  /** R3-polish (INTEGRATION 7.1, labels never overlapping): the HUD's orientation-label boxes as placed THIS frame (CSS px,
   * the return value of hud.placeOrientation). Region labels then avoid them in the same frame instead of a DOM read
   * that is up to HUD_READ_EVERY frames old (a stale read let "Right leg" sit on "Back (posterior)"). null returns to the
   * DOM read. */
  let orientLive = null, orientLiveKey = '';
  function setOrientationRects(rects) {
    orientLive = Array.isArray(rects) ? rects.filter(r => r && [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite)).map(r => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, orient: true })) : null;
    const key = orientLive ? orientLive.map(r => `${Math.round(r.x0)},${Math.round(r.y0)},${Math.round(r.x1)},${Math.round(r.y1)}`).join('|') : 'dom';
    if (key !== orientLiveKey) { orientLiveKey = key; overlayDirty = true; }
    return orientLive !== null;
  }
  /** The arm shapes in CSS px as separation boxes (ellipses by their bounding boxes). */
  function labelAvoidPx() {
    const boxes = [];
    if (!labelAvoid || !(cssW > 0 && cssH > 0)) return { boxes };
    for (const r of labelAvoid.rects) boxes.push({ x0: r.x0 * cssW, y0: r.y0 * cssH, x1: r.x1 * cssW, y1: r.y1 * cssH });
    for (const e of labelAvoid.ellipses) boxes.push({ x0: (e.cx - e.rx) * cssW, y0: (e.cy - e.ry) * cssH, x1: (e.cx + e.rx) * cssW, y1: (e.cy + e.ry) * cssH });
    return { boxes };
  }
  /** Round-2 fixes V5 / V6: { brainInView, arrows: [{ dir, x0, y0, x1, y1 }] (viewport fractions, y down) } from the
   * last overlay layout, so the HUD's orientation labels hide with the brain and keep clear of the orbit arrows. */
  function overlayObstacles() {
    const arrowsOut = [];
    if (arrowsShown && arrowLayout && cssW > 0 && cssH > 0) {
      for (const d of ARROW_DIRS) {
        const p = arrowLayout[d];
        // R5-scene: the 3D arrows' projected boxes (+4 px); only on-screen brain arrows are obstacles for the HUD labels.
        if (p && p.box) arrowsOut.push({ dir: d, x0: Math.max(0, (p.box.x0 - 4) / cssW), y0: Math.max(0, (p.box.y0 - 4) / cssH), x1: Math.min(1, (p.box.x1 + 4) / cssW), y1: Math.min(1, (p.box.y1 + 4) / cssH) });
      }
    }
    // R3-fix (M6): the information panel's bottom edge (CSS px) while it is showing, so the HUD can dock the legend under it.
    let infoBottom = null;
    for (const r of hudRectCache || []) if (r.info) infoBottom = r.y1;
    // R4-polish (labels never overlap): the shown capture / drag-to-look toast (viewport fractions), so the HUD's
    // orientation labels keep clear of it too (at 390x844 "Back (posterior)" sat under the full-width toast).
    const toasts = [];
    if (cssW > 0 && cssH > 0) for (const r of hudRectCache || []) if (r.toast) toasts.push({ x0: r.x0 / cssW, y0: r.y0 / cssH, x1: r.x1 / cssW, y1: r.y1 / cssH });
    // R4-fix (review RP8): the region labels drawn this frame (CSS px), so the guide chip keeps clear of them.
    const labelsPx = [];
    for (let i = 0; i < labelEls.length; i++) { const L = labelEls[i], b = labelBoxes[i]; if (L.shownNow && b && !b.skip) labelsPx.push({ x0: b.x - b.w / 2, y0: b.y - b.h / 2, x1: b.x + b.w / 2, y1: b.y + b.h / 2 }); }
    return { brainInView: brainInViewAttr === 'true', arrows: arrowsOut, infoBottom, toasts, labelsPx };
  }
  /** R4-integrator (D7): does the brain's outline as drawn NOW (convex hull of its outline support points projected
   * with the live camera, CSS px) overlap rect { x0, y0, x1, y1 } (CSS px)? false before the brain is placed or when it
   * is behind the camera. Cached per camera / brain matrix and rect. */
  // R4-fix (code review M5): the cache key is the numbers themselves (no per-call string building; this test now also
  // runs for every side-label candidate).
  const coverKey = new Float64Array(35);
  let coverCache = { valid: false, hull: null };
  function brainCoversRect(rect) {
    const P = brainHullPoints || (brainSupport && brainSupport.points);
    if (!P || !rect || !(cssW > 0 && cssH > 0)) return false;
    camera.updateMatrixWorld(true);
    const me = brainGroup.matrixWorld.elements, ve = camera.matrixWorldInverse.elements;
    let same = coverCache.valid && coverKey[32] === cssW && coverKey[33] === cssH && coverKey[34] === camera.fov;
    for (let i = 0; i < 16 && same; i++) same = coverKey[i] === me[i] && coverKey[16 + i] === ve[i];
    if (!same) {
      for (let i = 0; i < 16; i++) { coverKey[i] = me[i]; coverKey[16 + i] = ve[i]; }
      coverKey[32] = cssW; coverKey[33] = cssH; coverKey[34] = camera.fov;
      const pm = camera.projectionMatrix, xy = [];
      for (let i = 0; i < P.length; i += 3) {
        pv.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(brainGroup.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        if (pv.z > -near) continue;
        pv.applyMatrix4(pm);
        xy.push((pv.x + 1) * 0.5 * cssW, (1 - pv.y) * 0.5 * cssH);
      }
      coverCache = { valid: true, hull: xy.length >= 6 ? convexHull2d(xy) : null };
    }
    return coverCache.hull ? rectHitsConvexHull(coverCache.hull, rect) : false;
  }
  /** R5-integrate-core (R25 / R26): does a CSS px rect cover a MOTOR AREA as drawn now (the region meshes' projected
   * triangles, ns-arrows3d occupancyGrid, 4 px cells, 1 cell margin; first or third person camera)? With the round-5 brain
   * filling the view, the see-through glass lies under almost every HUD place; a HUD line (the "Try this" guide) may sit
   * over glass but never over a motor area. Falls back to brainCoversRect without a region segmentation. */
  let motorCoverKey = '', motorCoverGrid = null;
  function motorCoversRect(rect) {
    if (!rect || !(cssW > 0 && cssH > 0)) return false;
    const P = motorSamplePoints();
    if (!P) return brainCoversRect(rect);
    camera.updateMatrixWorld(true);
    const me = brainGroup.matrixWorld.elements, ce = camera.matrixWorld.elements;
    let key = `${cssW}x${cssH}|${camera.fov}|`;
    for (let i = 0; i < 16; i++) key += `${me[i]},${ce[i]},`;
    if (key !== motorCoverKey) {
      motorCoverKey = key;
      try {
        const xy = NsArrows.projectPointsPx(P, Array.from(me), arrowCam()).xy;
        motorCoverGrid = NsArrows.occupancyGrid(xy, { width: cssW, height: cssH, cellPx: R5_BIGBRAIN.avoidCellPx, dilate: 1, indices: motorIndices });
      } catch { motorCoverGrid = null; }
    }
    return motorCoverGrid ? motorCoverGrid.hits(rect) > 0 : brainCoversRect(rect);
  }
  /** Orbit click handler (replaces createScene onOrbit); null restores the 'ns-orbit' document event. */
  function setOrbitHandler(fn) {
    if (fn !== null && typeof fn !== 'function') fail('scene_args', 'setOrbitHandler needs a function or null');
    orbitHandler = fn;
    return true;
  }

  /** Projected bounds (CSS px) of the brain sample points in front of the camera into brainBoundsPx; false when none. */
  function projectBrainBounds() {
    if (!brainSamples || !(cssW > 0 && cssH > 0)) return false;
    const mw = brainGroup.matrixWorld, vi = camera.matrixWorldInverse, pm = camera.projectionMatrix;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const s = brainSamples;
    for (let i = 0; i < s.length; i += 3) {
      pv.set(s[i], s[i + 1], s[i + 2]).applyMatrix4(mw).applyMatrix4(vi);
      if (pv.z > -near) continue;
      pv.applyMatrix4(pm);
      const x = (pv.x + 1) * 0.5 * cssW, y = (1 - pv.y) * 0.5 * cssH;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!(x1 >= x0)) return false;
    brainBoundsPx.x0 = x0; brainBoundsPx.y0 = y0; brainBoundsPx.x1 = x1; brainBoundsPx.y1 = y1;
    // Fix F2: the projected brain centre (centroid of the sample points), when it is in front of the camera.
    if (!brainSampleCentre || brainSampleCentre.src !== s) {
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < s.length; i += 3) { sx += s[i]; sy += s[i + 1]; sz += s[i + 2]; }
      const k = Math.max(1, s.length / 3);
      brainSampleCentre = { src: s, x: sx / k, y: sy / k, z: sz / k };
    }
    pv.set(brainSampleCentre.x, brainSampleCentre.y, brainSampleCentre.z).applyMatrix4(mw).applyMatrix4(vi);
    if (pv.z <= -near) { pv.applyMatrix4(pm); brainBoundsPx.cx = (pv.x + 1) * 0.5 * cssW; brainBoundsPx.cy = (1 - pv.y) * 0.5 * cssH; }
    else { brainBoundsPx.cx = NaN; brainBoundsPx.cy = NaN; }
    return true;
  }

  const px = v => `${Math.round(v)}px`;
  /** HUD card rectangles (CSS px, overlay coordinates). Orbit arrows and labels keep clear of them.
   * R4-scene: EVENT-DRIVEN instead of a 12-frame poll. A MutationObserver on the app root (text, children, `hidden`,
   * `style`, `class`, `data-ns-home` / `data-ns-alt`) and a ResizeObserver on every measured card mark the rectangles
   * dirty; layoutOverlay drains the observer's pending records synchronously (takeRecords) before it lays out, so a card
   * that grew earlier in the SAME frame (ns-app writes the HUD and the panel before scene.render) is re-read in that frame
   * and an arrow is never drawn over it, not even for one frame. The scene's own overlay writes (arrows, labels) are
   * ignored, except the information panel's; the orientation labels are ignored while ns-app hands their boxes over
   * (setOrientationRects). Without MutationObserver (Node tests) the old HUD_READ_EVERY poll is kept. */
  const HUD_READ_EVERY = 12;
  let hudRectCache = [], hudReadIn = 0, hudReadFor = '';
  let hudDirty = true, hudReads = 0, hudMo = null, hudRo = null;
  const hudRoSeen = new WeakSet();
  const inside = (root, t) => Boolean(root && t && (root === t || (typeof root.contains === 'function' && root.contains(t))));
  // HUD parts neurosurge.css never draws in play (display: none): their per-frame text (e.g. the update-time line) does
  // not move any card, so it does not trigger a layout read. A closed <details> (except its summary) likewise.
  const HUD_UNDRAWN = '.ns-slot-frame, .ns-drives, .ns-slot-drivesTitle, .ns-notices, .ns-slot-hint, .ns-slot-reach';
  function relevantHudRecord(rec) {
    let t = rec && rec.target;
    if (t && t.nodeType === 3) t = t.parentNode;
    if (!t || t === canvas) return false;
    if (inside(overlay, t)) return Boolean(info && inside(info.panel, t));
    if (typeof t.closest === 'function') {
      if (orientLive && t.closest('.ns-orient')) return false;
      if (t.closest(HUD_UNDRAWN)) return false;
      const d = t.closest('details');
      if (d && !d.open && !t.closest('summary') && !(rec.type === 'attributes' && rec.attributeName === 'open' && t === d)) return false;
    }
    return true;
  }
  if (overlay && view && typeof view.MutationObserver === 'function' && overlay.parentNode) {
    try {
      hudMo = new view.MutationObserver(recs => { for (const r of recs) if (relevantHudRecord(r)) { hudDirty = true; return; } });
      hudMo.observe(overlay.parentNode, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'open', 'data-ns-home', 'data-ns-alt'] });
      if (typeof view.ResizeObserver === 'function') { hudRo = new view.ResizeObserver(() => { hudDirty = true; }); hudRo.observe(overlay.parentNode); }
    } catch { hudMo = null; hudRo = null; }
  }
  /** Pending HUD mutations of this frame (synchronous): marks the rectangles dirty when one matters. */
  function drainHudRecords() {
    if (!hudMo || typeof hudMo.takeRecords !== 'function') return;
    const recs = hudMo.takeRecords();
    for (const r of recs) if (relevantHudRecord(r)) { hudDirty = true; break; }
  }
  const roWatch = e => { if (hudRo && e && !hudRoSeen.has(e)) { hudRoSeen.add(e); try { hudRo.observe(e); } catch { /* not observable */ } } };
  /** R3-scene: where the capture / drag-to-look toast shows (last measured at this size; before that an estimate of its
   * bottom-centre CSS box). The arrow PLAN always keeps clear of it, so the arrows do not move when the pointer is
   * captured or released (the toast comes and goes) and are never under it. */
  let toastSeen = null;
  function readHudRects() {
    const key = `${cssW}x${cssH}`;
    if (hudMo) { if (key === hudReadFor && !hudDirty) return hudRectCache; }
    else if (key === hudReadFor && hudReadIn-- > 0) return hudRectCache;
    hudReadFor = key; hudReadIn = HUD_READ_EVERY; hudDirty = false; hudReads++;
    const tRead = nowMs();
    try { return readHudRectsNow(key); } finally { hudReadMs += nowMs() - tRead; }
  }
  let hudReadMs = 0;
  function readHudRectsNow(key) {
    hudRectCache = [];
    const parent = overlay && overlay.parentNode;
    if (!parent || typeof parent.querySelectorAll !== 'function' || typeof parent.getBoundingClientRect !== 'function') return hudRectCache;
    try {
      const o = parent.getBoundingClientRect();
      for (const e of parent.querySelectorAll('.ns-hud .ns-panel')) {
        if (e.hidden) continue;
        roWatch(e);
        const r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) continue;
        const rect = { x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top };
        // R3-polish: the status card's HOME box (data-ns-home, CSS px); the arrow plan keeps that clear even while the
        // card sits in its alternate home, so the arrows do not jump when the hand pushes the card away.
        for (const [attr, k] of [['data-ns-home', 'home'], ['data-ns-alt', 'alt']]) {
          const v = typeof e.getAttribute === 'function' ? e.getAttribute(attr) : null;
          const hv = v ? v.split(',').map(Number) : null;
          if (hv && hv.length === 4 && hv.every(Number.isFinite)) rect[k] = { x0: hv[0], y0: hv[1], x1: hv[2], y1: hv[3] };
        }
        hudRectCache.push(rect);
      }
      // R4-fix (review RP8): the floating guide chip is an obstacle for the region labels only (flagged `chip`; it keeps
      // clear of the arrows itself).
      for (const e of parent.querySelectorAll('.ns-hud .ns-guide-float')) {
        if (e.hidden) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) hudRectCache.push({ x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top, chip: true });
      }
      // R3-scene: the HUD's orientation labels ("Front", "Your right", ...) are obstacles for the region labels only
      // (flagged `orient`; they already keep clear of the arrows themselves).
      for (const e of parent.querySelectorAll('.ns-hud .ns-orient')) {
        if (e.hidden) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) hudRectCache.push({ x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top, orient: true });
      }
      // R3-scene: the far-right information panel (when showing; flagged `info`, the arrow plan reserves its whole
      // column instead) and the capture / drag-to-look toast are obstacles for the arrows and labels too.
      if (info && !info.panel.hidden && typeof info.panel.getBoundingClientRect === 'function') {
        roWatch(info.panel);
        const r = info.panel.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) hudRectCache.push({ x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top, info: true });
      }
      const root = parent.ownerDocument || doc;
      if (root && typeof root.querySelectorAll === 'function') {
        for (const e of root.querySelectorAll('.ns-shell-toast')) {
          roWatch(e);
          if (e.hidden) continue;
          const r = e.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            const t = { x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top, toast: true };
            hudRectCache.push(t);
            toastSeen = { key, rect: { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 } };
          }
        }
      }
    } catch { hudRectCache = []; }
    return hudRectCache;
  }
  /* ---- R5-scene (D16): 3D compass arrows: plan (ns-arrows3d), screen boxes, picks ---------------------------------- */
  // Saved brain carry/reference data still owns mirror BODY placement and range; compass planning uses the ACTIVE view.
  const arrowRef = { yaw: 0, pitch: 0, dist: BRAIN_ANCHOR_DIST_FALLBACK_M, k: null, pivot: null };
  const arrowStats = { plans: 0, boxes: 0, picks: 0 };
  let arrowSerial = 0, arrowHeadLocal = null;
  /** Same current Euler YXZ/position camera used by applyCamera(), arrow boxes and pixel picking. */
  const arrowCam = () => ({ width: cssW, height: cssH, fovYDeg: camera.fov, yaw: camPose ? camPose.yaw : firstPose ? firstPose.yaw : lookYaw, pitch: camPose ? camPose.pitch : firstPose ? firstPose.pitch : lookPitch, position: activePosition() });
  const arrowCameraKey = cam => `${camPose ? 'third' : firstPose ? 'configured-first' : 'first'}|${cam.width}x${cam.height}|${cam.fovYDeg}|${cam.yaw},${cam.pitch}|${cam.position.join(',')}|${camera.near},${camera.far}`;
  const arrowCameraRecord = cam => ({ mode: camPose ? 'third' : firstPose ? 'configured-first' : 'first',
    width: cam.width, height: cam.height, fovYDeg: cam.fovYDeg, yaw: cam.yaw, pitch: cam.pitch,
    position: cam.position.slice(), nearM: camera.near, farM: camera.far });
  // Cached target identities only: read matrices/centres, never recompute bounds or alter a body/brain transform.
  const arrowTargetKey = target => {
    if (target === 'brain') {
      const e = brainGroup.matrixWorld.elements, c = farEyeView.pw || [e[12], e[13], e[14]];
      return `${regionMode},${brainTransformSet},${Boolean(brainSupport)},${brainGroup.visible}|${c.join(',')}|${Array.from(e).join(',')}`;
    }
    return mirror.transform ? `${mirror.serial},${mirrorRoot.visible}|${mirror.transform.centre.join(',')}|${mirror.transform.matrix.join(',')}` : 'no-mirror-transform';
  };
  // Nominal unhovered head landmarks from the SAME default design as makeArrowRig. Built during normal planning only.
  function nominalArrowHeads(frames) {
    if (!arrowHeadLocal) {
      const head = NsArrows.arrowPath(NsArrows.ARROW_DESIGN).head;
      arrowHeadLocal = { base: [head.base[0], head.base[1], 0], tip: [head.tip[0], head.tip[1], 0] };
    }
    return Object.fromEntries(ARROW_DIRS.map(d => {
      const f = frames && frames[d];
      return [d, f ? { baseWorldM: NsArrows.frameToWorld(f, arrowHeadLocal.base), tipWorldM: NsArrows.frameToWorld(f, arrowHeadLocal.tip) } : null];
    }));
  }
  /** Where arrows may go (CSS px): the view minus a margin, the top limits line and the info column (landscape) or the
   * bottom band (portrait), reserved whether or not the panel shows, so the arrows never jump when it appears. */
  function arrowUsable() {
    const m = NsArrows.ARROW_LAYOUT.marginPx, top = 26 + 2;
    const reserve = infoPanelRect({ width: cssW, height: cssH }), g = INFO_PANEL.gapPx;
    const U = { x0: m, y0: top, x1: cssW - m, y1: cssH - m };
    if (reserve && reserve.layout === 'column') U.x1 = Math.max(U.x0 + 40, reserve.x0 - g);
    else if (reserve && reserve.layout === 'portrait') U.y1 = Math.max(U.y0 + 40, reserve.y0 - g);
    return U;
  }
  /** R5-bigbrain (R25 + D1(d)): the CSS px rect a look of at most BRAIN_VIEW.comfortDeg (40) puts under the crosshair. The
   * brain now passes the comfortable look range, so the brain's arrows PREFER it (ns-arrows3d compassLayout prefer); an
   * arrow with no clear place inside it (never over a motor area, the panel or a HUD card) takes its place outside. */
  function comfortRectPx() { return arrowComfortRect({ width: cssW, height: cssH, fovYDeg: camera.fov }); }
  /** Things the arrows keep clear of (CSS px), stable while playing: the status card at BOTH its homes (data-ns-home /
   * data-ns-alt, so an arrow does not jump when the hand pushes the card away), the other HUD cards, and the capture /
   * drag-to-look toast (measured, else its estimated bottom-centre box), so no arrow sits under them. */
  let arrowObsKey = '', arrowPanelObsKey = '', arrowScreenMaskKey = '', arrowMaskCameraKey = '';
  function arrowObstacles() {
    const out = [], rects = readHudRects() || [];
    arrowPanelObsKey = rects.filter(r => r.info).map(r => `${r.x0},${r.y0},${r.x1},${r.y1}`).join(';');
    for (const r of rects) {
      if (r.info || r.orient || r.chip) continue;
      if (r.toast) continue;
      if (r.home) { out.push({ ...r.home }); if (r.alt) out.push({ ...r.alt }); } else out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
    }
    const key = `${cssW}x${cssH}`;
    out.push(toastSeen && toastSeen.key === key ? { ...toastSeen.rect } : { x0: cssW / 2 - Math.min(310, 0.46 * cssW), y0: cssH - 50, x1: cssW / 2 + Math.min(310, 0.46 * cssW), y1: cssH - 8 });
    // R5-bigbrain (R25): no arrow at the crosshair at the default look (the brain now fills the view, so an arrow pushed
    // off a motor area could otherwise land where the player aims)
    const ch = R5_BIGBRAIN.crosshairKeepPx;
    out.push({ x0: cssW / 2 - ch, y0: cssH / 2 - ch, x1: cssW / 2 + ch, y1: cssH / 2 + ch, crosshair: true });
    arrowObsKey = out.map(r => `${Math.round(r.x0 / 8)},${Math.round(r.y0 / 8)},${Math.round(r.x1 / 8)},${Math.round(r.y1 / 8)}`).join(';');
    return out;
  }
  /** R5-bigbrain: the mirror body's on-screen box (CSS px, padded 6 px) for a camera look, or null when it is not shown. */
  function mirrorBoxPx(look) {
    if (!mirrorRoot.visible || !mirror.transform) return null;
    const W = mirrorSamplesWorld();
    if (!W) return null;
    const { xy } = NsArrows.projectPointsPx(W, null, { width: cssW, height: cssH, fovYDeg: camera.fov, yaw: look.yaw, pitch: look.pitch, position: look.position || activePosition() });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < xy.length; i += 2) { if (!Number.isFinite(xy[i])) continue; x0 = Math.min(x0, xy[i]); x1 = Math.max(x1, xy[i]); y0 = Math.min(y0, xy[i + 1]); y1 = Math.max(y1, xy[i + 1]); }
    return x1 > x0 && y1 > y0 ? { x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 6, mirror: true } : null;
  }
  /** R5-bigbrain (R25): the last placement tier for a brain arrow with no clear place: the HUD cards' ACTUAL boxes (not
   * their reserved homes), the toast and the crosshair box. With the larger brain the belt's lateral end can fill the
   * gap between the status card's two reserved homes (1280x720 after an orbit step). */
  function arrowObstaclesTight() {
    const out = [];
    for (const r of readHudRects() || []) { if (r.info || r.orient || r.chip || r.toast) continue; out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }); }
    const key = `${cssW}x${cssH}`;
    out.push(toastSeen && toastSeen.key === key ? { ...toastSeen.rect } : { x0: cssW / 2 - Math.min(310, 0.46 * cssW), y0: cssH - 50, x1: cssW / 2 + Math.min(310, 0.46 * cssW), y1: cssH - 8 });
    const ch = R5_BIGBRAIN.crosshairKeepPx;
    out.push({ x0: cssW / 2 - ch, y0: cssH / 2 - ch, x1: cssW / 2 + ch, y1: cssH / 2 + ch, crosshair: true });
    return out;
  }
  // These metadata readers use retained scalar state only; no projection, bounds, matrix update, clock or GL work.
  const arrowEligibility = target => target === 'brain'
    ? { rigPresent: Boolean(arrowSets.brain.rig), regionMode: Boolean(regionMode), brainTransformSet: Boolean(brainTransformSet),
      brainSupportPresent: Boolean(brainSupport), targetVisible: brainGroup.visible,
      eligible: Boolean(arrowSets.brain.rig) && Boolean(regionMode) && brainTransformSet && Boolean(brainSupport) && brainGroup.visible }
    : { rigPresent: Boolean(arrowSets.mirror.rig), targetVisible: mirrorRoot.visible, transformPresent: mirror.transform !== null,
      samplesPresent: mirror.samples !== null,
      eligible: Boolean(arrowSets.mirror.rig) && mirrorRoot.visible && mirror.transform !== null && mirror.samples !== null };
  const arrowSourceRecord = target => target === 'brain'
    ? { key: `${compassBrainSourceRevision}|${Boolean(brainHullPoints)}|${brainHullPoints ? brainHullPoints.length : brainSupport ? brainSupport.points.length : 0}`,
      revision: compassBrainSourceRevision, basis: brainHullPoints ? 'segmentation-outline' : brainSupport ? 'supportPoints' : 'absent',
      units: 'source-mm', storage: brainHullPoints ? 'Float32Array' : 'supportPoints.points',
      rows: brainHullPoints ? brainHullPoints.length / 3 : brainSupport ? brainSupport.points.length / 3 : null }
    : { key: `${mirror.serial}|${mirror.samples !== null}|${mirror.transform !== null}`, revision: mirror.serial,
      basis: 'mirrorSamplesWorld', units: 'world-m', storage: 'ordinary-plan world samples', rows: mirror.samples ? mirror.samples.length / 3 : null };
  // Only the fixed authored report/identity tree is copied. Nonfinite values stay explicit through JSON serialization.
  const copyCompassEvidence = value => typeof value === 'number' ? (Number.isFinite(value) ? value : { nonfinite: String(value) })
    : Array.isArray(value) ? value.map(copyCompassEvidence)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyCompassEvidence(v)])) : value;
  function planSet(set, args) {
    // These private inputs are Euler-only, with the active cam and ref equal. Record the exact selected ref, not a label.
    const ref = args.ref || { yaw: 0, pitch: 0 };
    const selected = { ...args.cam, yaw: ref.yaw || 0, pitch: ref.pitch || 0, position: ref.position || [0, 0, 0] };
    set.planningCamera = arrowCameraRecord(selected); set.planningCameraKey = arrowCameraKey(selected);
    set.planningTarget = { centreWorldM: Array.from(args.centre), supportRows: args.points.length / 3 };
    set.planningTargetKey = arrowTargetKey(set.target);
    const matrix = args.matrix ? Array.from(args.matrix) : null;
    set.planningEvidence = { kind: 'ns-retained-plan-evidence-r345',
      sourceBinding: 'External exact paired module/packet manifest required; these runtime labels are not file-hash proof.',
      eligibility: arrowEligibility(set.target), source: arrowSourceRecord(set.target),
      planMatrix: { status: matrix ? matrix.length === 16 && matrix.every(Number.isFinite) ? 'FINITE_16' : 'NONFINITE_OR_UNSUPPORTED' : 'IDENTITY', elements: matrix },
      ref: { yaw: ref.yaw, pitch: ref.pitch, position: ref.position ? Array.from(ref.position) : null },
      camera: arrowCameraRecord(selected), cameraAuthority: args.cam.matrixWorld ? 'matrixWorld' : 'Euler-YXZ-position',
      cameraMatrixWorld: args.cam.matrixWorld ? Array.from(args.cam.matrixWorld) : null,
      targetKey: set.planningTargetKey, cameraKey: set.planningCameraKey, revision: (set.serial || 0) + 1,
      brainGroupVisible: brainGroup.visible, arrowRigVisibleAtPlan: set.rig ? set.rig.group.visible : null,
      report: {} };
    set.nominalHeads = null; set.planningError = null;
    try {
      if (typeof NsArrows.planCompassArrowsWithReport !== 'function') {
        set.planningEvidence.report = { outcome: 'unsupported_reporting_api', stage: 'NOT_REACHED' };
        throw new Error('Retained compass report API unavailable; paired source modules required');
      }
      const { plan: p } = NsArrows.planCompassArrowsWithReport(args, set.planningEvidence.report); arrowStats.plans++;
      set.planningOutcome = p ? 'planned' : 'no-visible-outline';
      if (p) set.nominalHeads = nominalArrowHeads(p.frames);
      return p;
    } catch (err) { set.planningOutcome = 'error'; set.planningError = arrowRigError = String((err && err.message) || err); return null; }
  }
  /** R5-bigbrain (R25): sample points of every motor area (source mm, the region meshes' vertices, at most
   * R5_BIGBRAIN.motorSamples), built once: an arrow at the screen edge never covers a motor area, and the mirror body's
   * default place keeps clear of them (ns-arrows3d occupancyGrid / compassLayout avoid). */
  let motorSamples = null, motorIndices = null;
  function motorSamplePoints() {
    if (motorSamples || !regionMode || !regionMeshes.length) return motorSamples;
    let n = 0;
    for (const m of regionMeshes) n += m.geometry.attributes.position.count;
    const stride = Math.max(1, Math.ceil(n / R5_BIGBRAIN.motorSamples)), out = [], idx = [];
    for (const m of regionMeshes) {
      const a = m.geometry.attributes.position, base = out.length / 3;
      for (let i = 0; i < a.count; i += stride) out.push(a.getX(i), a.getY(i), a.getZ(i));
      // every vertex kept (the usual case: about 8,000 region vertices): the triangles too, so their whole area counts
      const ix = m.geometry.index;
      if (stride === 1 && ix) for (let k = 0; k < ix.count; k++) idx.push(base + ix.getX(k));
    }
    motorSamples = Float32Array.from(out);
    motorIndices = idx.length ? Uint32Array.from(idx) : null;
    return motorSamples;
  }
  /** The motor areas' occupancy grid (CSS px) for a camera look at the brain's CURRENT matrix (the mirror body's place,
   * mirrorState's behindMotor share). */
  function motorGridFor(look, dilate = R5_BIGBRAIN.mirrorAvoidDilate) {
    const P = motorSamplePoints();
    if (!P || !(cssW > 0 && cssH > 0)) return null;
    const cam = { width: cssW, height: cssH, fovYDeg: camera.fov, yaw: look.yaw, pitch: look.pitch, position: look.position || activePosition() };
    return NsArrows.occupancyGrid(NsArrows.projectPointsPx(P, Array.from(brainGroup.matrixWorld.elements), cam).xy, { width: cssW, height: cssH, cellPx: R5_BIGBRAIN.avoidCellPx, dilate, indices: motorIndices });
  }
  /** Keep both rigs in the SAME active view; a camera/look/origin change replans controls, never rotates a target. */
  function updateArrows() {
    if (!(cssW > 0 && cssH > 0)) return;
    const B = arrowSets.brain, M = arrowSets.mirror, cam = arrowCam();
    const ref = { yaw: cam.yaw, pitch: cam.pitch, position: cam.position.slice() };
    const obstacles = arrowObstacles();
    const sz = `${arrowCameraKey(cam)}|${arrowObsKey}`;
    const showB = Boolean(B.rig) && regionMode && brainTransformSet && Boolean(brainSupport) && brainGroup.visible;
    if (showB) {
      const e = brainGroup.matrixWorld.elements, centre = farEyeView.pw || [e[12], e[13], e[14]];
      let key = `${sz}|${mirror.serial}|${centre.join(',')}|`;
      for (let i = 0; i < 16; i++) key += `${e[i]},`;
      if (key !== B.key) {
        B.key = key;
        // Mirror obstacle, motor samples, HUD and compass anchors are all projected in this SAME active camera.
        const mb = mirrorBoxPx(ref), obsB = mb ? [...obstacles, mb] : obstacles, tightB = arrowObstaclesTight();
        B.plan = planSet(B, { points: brainHullPoints || brainSupport.points, matrix: Array.from(e), centre,
          ref, cam, kind: 'brain', usable: arrowUsable(), obstacles: obsB, prefer: comfortRectPx(), fallbackObstacles: tightB,
          avoidPoints: motorSamplePoints(), avoidIndices: motorIndices, avoidCellPx: R5_BIGBRAIN.avoidCellPx, avoidDilate: R5_BIGBRAIN.avoidDilate });
        B.frames = B.plan ? B.plan.frames : null;
        B.serial = (B.serial || 0) + 1;
        B.rig.setFrames(B.frames);
        arrowSerial++;
      }
    }
    B.shown = showB && Boolean(B.frames);
    if (B.rig && B.rig.group.visible !== B.shown) B.rig.group.visible = B.shown;
    const showM = Boolean(M.rig) && mirrorRoot.visible && mirror.transform !== null && mirror.samples !== null;
    if (showM) {
      // Keep the existing same-view guards/tolerance; the inputs now come from the actual active planned camera.
      const pc = B.planningCamera;
      const sameOrigin = pc && cam.position.every((v, i) => Math.abs(v - pc.position[i]) < 1e-6);
      const sameRef = pc && Math.abs(cam.yaw - pc.yaw) < 1e-6 && Math.abs(cam.pitch - pc.pitch) < 1e-6 && sameOrigin && B.shown && B.plan && B.plan.layout;
      const key = `${sz}|${mirror.serial}|${sameRef ? B.serial : '-'}`;
      if (key !== M.key) {
        M.key = key;
        // Mirror arrows retain the same HUD/brain-arrow obstacle and no-extra-motor-avoid policy; picking still blocks
        // them behind the brain. No mirror BODY placement or target transform is changed by this planner.
        const obsM0 = obstacles.filter(o => !o.crosshair);
        const obsM = sameRef ? [...obsM0, ...ARROW_DIRS.map(d => B.plan.layout.arrows[d] && B.plan.layout.arrows[d].box).filter(Boolean).map(b => ({ x0: b.x0 - 4, y0: b.y0 - 4, x1: b.x1 + 4, y1: b.y1 + 4 }))] : obsM0;
        M.plan = planSet(M, { points: mirrorSamplesWorld(), matrix: null, centre: Array.from(mirror.transform.centre), ref,
          cam, kind: 'mirror', usable: arrowUsable(), obstacles: obsM });
        M.frames = M.plan ? M.plan.frames : null;
        M.serial = (M.serial || 0) + 1;
        M.rig.setFrames(M.frames);
        arrowSerial++;
      }
    }
    M.shown = showM && Boolean(M.frames);
    if (M.rig && M.rig.group.visible !== M.shown) M.rig.group.visible = M.shown;
    // A normal pick can replan before the render/overlay pass. Refresh the SAME boxes/panel mask before it uses them.
    // No recursion: arrowScreenLayout -> arrowBoxes, and neither calls updateArrows. Unchanged cache inputs do no work.
    const maskKey = `${arrowCameraKey(cam)}|${arrowSerial}|${B.shown},${M.shown}|${arrowPanelObsKey}`;
    if (maskKey !== arrowScreenMaskKey) {
      arrowScreenMaskKey = maskKey; arrowMaskCameraKey = arrowCameraKey(cam);
      if (B.shown) arrowScreenLayout(); else { underPanel.brain.clear(); arrowBoxes(); }
    }
  }
  /** Screen boxes (ns-arrows3d arrowScreenBox) and a click point (the middle of the stalk) of every shown arrow, for the
   * overlay, captions and QA; recomputed when the plan or the camera changed. */
  function arrowBoxes() {
    if (!(cssW > 0 && cssH > 0)) return;
    camera.updateMatrixWorld(true);
    const ce = camera.matrixWorld.elements;
    let ck = `${arrowSerial}|${cssW}x${cssH}|${camera.fov}|`;
    for (let i = 0; i < 16; i++) ck += `${ce[i]},`;
    const cam = arrowCam();
    const mid = [NsArrows.ARROW_DESIGN.stalk * 0.5, 0, 0];
    for (const set of [arrowSets.brain, arrowSets.mirror]) {
      if (set.boxKey === ck) continue;
      set.boxKey = ck;
      set.boxCamera = arrowCameraRecord(cam); set.boxCameraKey = arrowCameraKey(cam); set.boxPlanSerial = arrowSerial;
      for (const d of ARROW_DIRS) {
        const f = set.shown && set.frames ? set.frames[d] : null;
        let box = null, click = null;
        if (f) {
          try {
            box = NsArrows.arrowScreenBox(f, cam);
            const q = NsArrows.projectWorldPx(NsArrows.frameToWorld(f, mid), cam);
            click = q.depth > 0 ? [q.x, q.y] : null;
          } catch { box = null; click = null; }
        }
        set.boxes[d] = box && box.x1 > 0 && box.x0 < cssW && box.y1 > 0 && box.y0 < cssH ? box : null;
        set.clicks[d] = set.boxes[d] ? click : null;
      }
      arrowStats.boxes++;
    }
  }
  /** R5-scene (D16 / D19): what a ray through CSS point (x, y) hits, nearest first: [{ kind: 'arrow', target: 'brain' |
   * 'mirror', dir, distance (m along the ray) }, { kind: 'brain', distance } (the point is inside the brain's drawn
   * outline; distance = its nearest point from the camera)] (ns-arrows3d pickArrows per rig, with its pick padding).
   * Feed it to ns-controls resolveArrowHit: a mirror arrow behind the brain is then 'blocked'. */
  function pickArrows(x, y) {
    const hits = [];
    if (!(Number.isFinite(x) && Number.isFinite(y)) || !(cssW > 0 && cssH > 0)) return hits;
    updateArrows();
    arrowStats.picks++;
    let ray = null;
    try { ray = NsArrows.pixelRay(x, y, arrowCam()); } catch { ray = null; }
    if (ray) {
      for (const set of [arrowSets.brain, arrowSets.mirror]) {
        if (!set.shown || !set.frames) continue;
        let h = null;
        const hidden = set.target === 'brain' ? underPanel.brain : null;
        const only = hidden && hidden.size ? ARROW_DIRS.filter(d => !hidden.has(d)) : null;
        try { h = only && !only.length ? null : NsArrows.pickArrows(ray, set.frames, only ? { only } : {}); } catch { h = null; }
        if (h && Number.isFinite(h.t)) hits.push({ kind: 'arrow', target: set.target, dir: h.dir, distance: h.t });
      }
    }
    if (regionMode && brainTransformSet && brainCoversRect({ x0: x - 0.5, y0: y - 0.5, x1: x + 0.5, y1: y + 0.5 })) {
      hits.push({ kind: 'brain', distance: Number.isFinite(cameraRange.brainNearM) ? cameraRange.brainNearM : arrowRef.dist });
    }
    hits.sort((p, q) => p.distance - q.distance);
    return hits;
  }
  /** R5-scene: highlight the arrow under the pick point. hit: { target, dir, blocked? } (ns-controls arrowHitOf /
   * stepArrowInput's hover) or null. An unblocked arrow gets ns-arrows3d's hover look (brighter, warm white, 12 % larger)
   * and its plain caption; a mirror arrow the brain covers ('blocked') gets the rig's blocked look (grey, not enlarged, no
   * caption: it cannot be used through the brain; R5-input shows the plain hint). Returns the hover or null. */
  function setArrowHover(hit) {
    const ok = hit && typeof hit === 'object' && (hit.target === 'brain' || hit.target === 'mirror') && ARROW_DIRS.includes(hit.dir);
    const next = ok ? { target: hit.target, dir: hit.dir, blocked: typeof hit.blocked === 'string' && hit.blocked ? hit.blocked : null } : null;
    const same = (next === null && arrowHover === null) || (next && arrowHover && next.target === arrowHover.target && next.dir === arrowHover.dir && next.blocked === arrowHover.blocked);
    if (same) return arrowHover;
    arrowHover = next;
    hoverDir = next && next.target === 'brain' && !next.blocked ? next.dir : null;
    for (const set of [arrowSets.brain, arrowSets.mirror]) {
      if (!set.rig) continue;
      const hd = next && !next.blocked && next.target === set.target ? next.dir : null;
      // R5-arrows: a covered mirror arrow under the pick point shows ns-arrows3d's blocked look (grey, not enlarged).
      const bd = next && next.blocked && next.target === set.target ? next.dir : null;
      set.rig.setHover(hd || bd, { blocked: Boolean(bd && !hd) });
      for (const d of ARROW_DIRS) { const u = set.rig.arrows[d].root.userData.nsOrbitArrow; if (u) u.hover = d === hd; }
    }
    overlayDirty = true;
    return arrowHover;
  }
  /** Brain arrows' screen layout for the overlay (labels, the face caption and the HUD keep clear of the shown ones):
   * { dir: { x, y, box } | null } or null when none is on screen. */
  function arrowScreenLayout() {
    const B = arrowSets.brain;
    if (!B.shown) { underPanel.brain.clear(); return null; }
    arrowBoxes();
    // R5-integrate-core (D16 + round-3 D2 "under the info column an arrow is not drawn"): a brain arrow whose screen box
    // runs under the far-right information panel (looking aside moves the world-anchored arrows) is not drawn and not
    // pickable until it comes out again; the panel is never covered and no arrow is clicked through it.
    const infoRects = (readHudRects() || []).filter(r => r.info);
    const out = {};
    let any = false;
    for (const d of ARROW_DIRS) {
      const b = B.boxes[d], c = B.clicks[d];
      const under = Boolean(b) && infoRects.some(r => b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 && b.y1 > r.y0);
      if (under) underPanel.brain.add(d); else underPanel.brain.delete(d);
      const root = B.rig && B.rig.arrows[d] ? B.rig.arrows[d].root : null;
      if (root && root.visible === under) root.visible = !under;
      out[d] = b && !under ? { x: c ? c[0] : (b.x0 + b.x1) / 2, y: c ? c[1] : (b.y0 + b.y1) / 2, box: b } : null;
      if (out[d]) any = true;
    }
    return any ? out : null;
  }
  const underPanel = { brain: new Set() }; // R5-integrate-core: brain arrows hidden under the information panel this frame
  /** Plain captions: the hovered arrow's; every brain arrow's while the "Try this" goal is 'orbit'. */
  function layoutArrowTips(reserveRight, reserveBottom, topPx) {
    arrowBoxes();
    for (const [k, T] of Object.entries(arrowTips)) {
      const [target, d] = k.split(':');
      const set = arrowSets[target], box = set.shown ? set.boxes[d] : null;
      const want = Boolean(box) && ((arrowHover && arrowHover.target === target && arrowHover.dir === d && !arrowHover.blocked) || (target === 'brain' && guideGoalAttr === 'orbit'));
      if (!want) { if (T.shown) { T.shown = false; T.el.hidden = true; } continue; }
      const e = NsArrows.COMPASS_SCREEN[d], gap = R5_SCENE.arrowCaptionPx;
      const w = Math.min(260, 7.2 * T.el.textContent.length + 18), h = 22;
      // just past the arrow's outer end, along its compass direction
      const xMax = Math.max(4, cssW - reserveRight - w - 4), yMax = Math.max(topPx, cssH - reserveBottom - h - 4);
      const hitsBox = (x, y) => x < box.x1 + 2 && x + w > box.x0 - 2 && y < box.y1 + 2 && y + h > box.y0 - 2;
      // just past the arrow's outer end along its compass direction; where the screen edge or the panel leaves no room
      // there, under the arrow (above it for the bottom arrow), never on top of the arrow itself
      let x = clampTo(e[0] > 0 ? box.x1 + gap : e[0] < 0 ? box.x0 - gap - w : (box.x0 + box.x1) / 2 - w / 2, 4, xMax);
      let y = clampTo(e[1] > 0 ? box.y1 + gap : e[1] < 0 ? box.y0 - gap - h : (box.y0 + box.y1) / 2 - h / 2, topPx, yMax);
      if (hitsBox(x, y)) {
        x = clampTo((box.x0 + box.x1) / 2 - w / 2, 4, xMax);
        y = e[1] > 0 ? clampTo(box.y0 - gap - h, topPx, yMax) : clampTo(box.y1 + gap, topPx, yMax);
        if (hitsBox(x, y)) y = clampTo(box.y0 - gap - h, topPx, yMax);
      }
      const l = px(x), t = px(y);
      if (T.left !== l) { T.el.style.left = l; T.left = l; }
      if (T.top !== t) { T.el.style.top = t; T.top = t; }
      if (!T.shown) { T.shown = true; T.el.hidden = false; }
    }
  }
  /** QA / tests: { source, error, silhouette, hover, brain / mirror: { shown, sizes, frontDepthM, dirs: { dir: { x, y
   * (click point), box, slidPx, overOutline, onScreen, blocked, depthMode, distanceM } } }, stats }. */
  function arrowsState() {
    updateArrows();
    arrowBoxes();
    const r1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
    const one = set => {
      const L = set.plan && set.plan.layout;
      return {
        shown: set.shown, sizes: set.plan ? set.plan.sizes : null, frontDepthM: set.plan && Number.isFinite(set.plan.frontDepthM) ? Math.round(set.plan.frontDepthM * 1000) / 1000 : null,
        hovered: set.rig ? set.rig.hovered : null,
        dirs: Object.fromEntries(ARROW_DIRS.map(d => {
          const a = L && L.arrows[d], f = set.frames && set.frames[d], b = set.boxes[d], c = set.clicks[d];
          return [d, { x: c ? r1(c[0]) : null, y: c ? r1(c[1]) : null, box: b ? [r1(b.x0), r1(b.y0), r1(b.x1), r1(b.y1)] : null,
            slidPx: a ? r1(a.slidPx) : null, overOutline: a ? a.overOutline : null, onScreen: a ? a.onScreen : null, blocked: a ? a.blocked : null,
            edge: a ? a.edge === true : null, edgeShiftPx: a && Number.isFinite(a.edgeShiftPx) ? r1(a.edgeShiftPx) : null, overMotor: a && Number.isFinite(a.overAvoid) ? a.overAvoid : null, outsideComfort: a ? a.outsidePreferred === true : null, tier: a ? a.tier || null : null,
            clearancePx: a ? r1(a.clearancePx) : null, depthMode: f ? f.depthMode : null, distanceM: f && Number.isFinite(f.distance) ? Math.round(f.distance * 1000) / 1000 : null }];
        }))
      };
    };
    return { source: 'ns-arrows3d', error: arrowRigError, silhouette: Boolean(arrowSets.brain.rig && arrowSets.brain.rig.arrows.forward.xray), hover: arrowHover ? { ...arrowHover } : null,
      brain: one(arrowSets.brain), mirror: one(arrowSets.mirror), stats: { ...arrowStats } };
  }

  /** READ-ONLY cached compass evidence. Never plans, projects, updates matrices/bounds, renders or reads GPU buffers.
   * Existing arrowsState() behavior is unchanged. Root may bind this separate getter into normal App inspect opt-in.
   * A pose changed since the normal plan/box pass is exposed as STALE, never silently refreshed by this query. */
  function cachedArrowsState() {
    const active = arrowCam(), activeKey = arrowCameraKey(active), vec = v => v ? Array.from(v) : null;
    const cameraCopy = c => c ? { ...c, position: c.position.slice() } : null;
    const one = set => ({
      shown: set.shown, groupVisible: set.rig ? set.rig.group.visible : null,
      targetVisible: set.target === 'brain' ? brainGroup.visible : mirrorRoot.visible,
      planEvidence: {
        state: !arrowEligibility(set.target).eligible ? 'not_eligible' : !set.planningEvidence ? 'NOT_PLANNED'
          : set.planningCameraKey !== activeKey || set.planningTargetKey !== arrowTargetKey(set.target)
            || set.planningEvidence.source.key !== arrowSourceRecord(set.target).key ? 'STALE' : 'RETAINED_CURRENT_KEYS',
        currentEligibility: arrowEligibility(set.target), currentSource: arrowSourceRecord(set.target),
        currentTargetKey: arrowTargetKey(set.target), currentCameraKey: activeKey,
        retained: set.planningEvidence ? copyCompassEvidence(set.planningEvidence) : null,
        scope: 'Same ordinary invocation; no getter refresh. Current keys are not an atomic render/pixel or source-file identity.' },
      planningOutcome: set.planningOutcome || 'not-planned', planningError: set.planningError || null,
      planRevision: set.serial || 0, planningCamera: cameraCopy(set.planningCamera), boxCamera: cameraCopy(set.boxCamera),
      planMatchesActiveCamera: Boolean(set.planningCameraKey && set.planningCameraKey === activeKey),
      planMatchesCurrentTarget: Boolean(set.planningTargetKey && set.planningTargetKey === arrowTargetKey(set.target)),
      boxesMatchActiveCamera: Boolean(set.boxCameraKey && set.boxCameraKey === activeKey),
      boxesMatchPlanRevision: set.boxPlanSerial === arrowSerial,
      target: set.planningTarget ? { centreWorldM: set.planningTarget.centreWorldM.slice(), supportRows: set.planningTarget.supportRows } : null,
      sizes: set.plan ? { ...set.plan.sizes } : null, frontDepthM: set.plan ? set.plan.frontDepthM : null,
      hovered: set.rig ? set.rig.hovered : null, hoverBlocked: set.rig ? set.rig.hoverBlocked : null,
      dirs: Object.fromEntries(ARROW_DIRS.map(d => {
        const f = set.frames && set.frames[d], h = set.nominalHeads && set.nominalHeads[d], a = set.plan && set.plan.layout.arrows[d];
        const draw = set.rig && set.rig.arrows[d], box = set.boxes[d], click = set.clicks[d];
        return [d, { target: set.target, dir: d,
          nominal: f ? { originWorldM: vec(f.origin), d: vec(f.d), w: vec(f.w), b: vec(f.b), scale: f.scale,
            matrix: vec(f.matrix), depthMode: f.depthMode, distanceM: f.distance,
            headBaseWorldM: h ? vec(h.baseWorldM) : null, headTipWorldM: h ? vec(h.tipWorldM) : null } : null,
          retainedDraw: draw ? { rootVisible: draw.root.visible, meshVisible: draw.mesh.visible, hiddenUnderPanel: set.target === 'brain' ? underPanel.brain.has(d) : false,
            meshScale: [draw.mesh.scale.x, draw.mesh.scale.y, draw.mesh.scale.z] } : null,
          boxPx: box ? { ...box } : null, clickPx: vec(click),
          layout: a ? { onScreen: a.onScreen, blocked: a.blocked, overOutline: a.overOutline, slidPx: a.slidPx, edge: a.edge === true } : null }];
      }))
    });
    return { kind: 'ns-cached-compass-r310', source: 'ns-arrows3d', activeCamera: arrowCameraRecord(active),
      panelMaskMatchesActiveCamera: Boolean(arrowMaskCameraKey && arrowMaskCameraKey === activeKey),
      retainedRenderCamera: { position: [camera.position.x, camera.position.y, camera.position.z],
        eulerXYZRadians: [camera.rotation.x, camera.rotation.y, camera.rotation.z], eulerOrder: camera.rotation.order,
        matrixWorld: Array.from(camera.matrixWorld.elements), matrixWorldNeedsUpdate: camera.matrixWorldNeedsUpdate },
      brain: one(arrowSets.brain), mirror: one(arrowSets.mirror), stats: { ...arrowStats },
      scope: 'Cached nominal unhovered plan/head landmarks and retained CPU hover/visibility flags. Missing/nonfinite/stale is not valid current-view proof. No GPU buffer, pixel, actual draw or atomic-frame identity claimed.' };
  }

  /* ---- R5-scene (D19): mirror body (ns-mirror placement, transform and orbit; the scene draws the twins) ------------ */
  // R22 conservative enclosure of BOTH full-source and current live position buffers.
  // Primary body LOD may use a different array; no identity or decimator-enclosure assumption.
  const mirrorPositionBounds = new WeakMap();
  function mirrorMeshCorners(mesh, matrix, append) {
    const full = mesh.userData.nsFullGeometry || mesh.geometry;
    const a = full && full.attributes && full.attributes.position, live = mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position;
    if (!a || !live || !(a.count > 0 && live.count >= 0)) fail('scene_input', 'complete source and live mirror position buffers unavailable');
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const sharedArray = a.array === live.array;
    // Even distinct attributes can alias one array. Either version changing must invalidate its cached bound.
    // A shared backing array needs only its longest xyz prefix scanned; distinct arrays need BOTH bounds.
    const attributes = sharedArray ? [a.count >= live.count ? a : live] : [a, live];
    for (const attr of attributes) {
      const sharedAttribute = sharedArray ? (attr === a ? live : a) : null;
      const sharedVersion = sharedAttribute ? sharedAttribute.version : null;
      let box = mirrorPositionBounds.get(attr);
      if (!box || box.array !== attr.array || box.count !== attr.count || box.version !== attr.version || box.sharedAttribute !== sharedAttribute || box.sharedVersion !== sharedVersion
          || !Number.isFinite(attr.version) || (sharedArray && !Number.isFinite(sharedVersion))) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < attr.count; i++) {
          for (let j = 0; j < 3; j++) {
            const v = attr.array[3 * i + j]; if (!Number.isFinite(v)) fail('scene_input', 'nonfinite full or live mirror position');
            min[j] = Math.min(min[j], v); max[j] = Math.max(max[j], v);
          }
        }
        box = { lo: min, hi: max, array: attr.array, count: attr.count, version: attr.version, sharedAttribute, sharedVersion };
        mirrorPositionBounds.set(attr, box);
      }
      for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], box.lo[j]); hi[j] = Math.max(hi[j], box.hi[j]); }
    }
    for (let c = 0; c < 8; c++) {
      pv.set((c & 1 ? hi : lo)[0], (c & 2 ? hi : lo)[1], (c & 4 ? hi : lo)[2]).applyMatrix4(matrix);
      append(pv.x, pv.y, pv.z);
    }
    return sharedArray ? Math.max(a.count, live.count) : a.count + live.count;
  }
  function currentMirrorEnvelope() {
    if (!mirrorRoot.visible || !mirror.transform) return null;
    camera.updateMatrixWorld(true); mirrorRoot.updateMatrixWorld(true);
    const centre = mirror.transform.centre, V = camera.matrixWorldInverse.elements;
    let radiusM = 0, minCameraDepthM = Infinity, maxCameraDepthM = -Infinity, positions = 0, meshes = 0;
    for (const mesh of [...mirrorBodyGroup.children, ...mirrorArmGroup.children]) {
      mesh.updateMatrixWorld(true); meshes++;
      positions += mirrorMeshCorners(mesh, mesh.matrixWorld, (x, y, z) => {
        radiusM = Math.max(radiusM, Math.hypot(x - centre[0], y - centre[1], z - centre[2]));
        const depth = -(V[2] * x + V[6] * y + V[10] * z + V[14]);
        if (!Number.isFinite(depth)) fail('scene_input', 'nonfinite current mirror depth');
        minCameraDepthM = Math.min(minCameraDepthM, depth); maxCameraDepthM = Math.max(maxCameraDepthM, depth);
      });
    }
    if (!(radiusM > 0 && Number.isFinite(radiusM) && meshes > 0)) fail('scene_input', 'complete current mirror enclosure unavailable');
    return { kind: 'full-and-live-mirror-AABB-corners-r22-r3', radiusM, minCameraDepthM, maxCameraDepthM, meshes, positions,
      scope: 'Union of full-source and current live position-buffer bounds, including deformed muscles and distinct body LOD arrays; cached by each buffer/version. Conservative corners; native/GPU/normalmechanics unqualified.' };
  }
  /** Normal post-pose object-placement reconciliation only: never move the camera, body, arm or a released object. */
  function reconcileMirrorCarry({ held = false, farM = null } = {}) {
    const manipulating = Boolean(held);
    mirror.carryHeldAtReconcile = manipulating; // App supplies this normal frame's actual held-target state before render.
    if (!mirror.worldCentre || !mirrorRoot.visible) return { status: 'not-carried', movementWorldM: [0, 0, 0], envelope: null };
    const before = mirror.worldCentre.slice(); let envelope = currentMirrorEnvelope();
    // A released object is world-fixed and may cross the view's near/far planes as the user looks away.
    // Still compute the full finite geometry envelope; clipping alone is not physical contact or failed manipulation.
    if (!manipulating) return { status: 'released-world-fixed', movementWorldM: [0, 0, 0], worldCentreM: before, envelope,
      viewClip: { near: envelope.minCameraDepthM < camera.near, far: envelope.maxCameraDepthM > camera.far },
      scope: 'Released world placement is unchanged; camera clipping is permitted. No world-placement, camera-pose or model write; no physical-contact qualification.' };
    for (let tries = 0; envelope.minCameraDepthM < camera.near && tries < 4; tries++) {
      if (!(Number.isFinite(farM) && farM > 0)) fail('scene_input', 'finite original mirror carry far cap required');
      const V = camera.matrixWorldInverse.elements, p = mirror.transform.centre;
      const centreDepth = -(V[2] * p[0] + V[6] * p[1] + V[10] * p[2] + V[14]);
      const shift = camera.near - envelope.minCameraDepthM;
      if (!(Number.isFinite(shift) && centreDepth + shift <= farM)) fail('scene_input', 'current mirror pose cannot fit inside finite carry depth range');
      const C = camera.matrixWorld.elements;
      mirror.worldCentre = mirror.worldCentre.map((x, i) => x - C[8 + i] * shift);
      if (!applyMirror()) fail('scene_input', 'current mirror placement application failed');
      envelope = currentMirrorEnvelope();
    }
    if (!(envelope.minCameraDepthM >= camera.near)) fail('scene_input', 'bounded strict current mirror near-plane check failed');
    return { status: 'current-pose-near-checked', movementWorldM: mirror.worldCentre.map((x, i) => x - before[i]), worldCentreM: mirror.worldCentre.slice(), envelope,
      scope: 'Object translation only before render; no active-camera switch. Released placement never silently moved. Refusal is a failed/unresolved ordinary pose, not working R22 acceptance.' };
  }

  /** The player's posed body as world points (R5_SCENE.mirrorPointsPerMesh vertices of every body mesh, head included, and
   * of the arm at the start look) -> ns-mirror bodyBoundsFromPoints; measured once from the first posed body. */
  function computeMirrorBody() {
    if (!body.length) return false;
    bodyGroup.updateMatrixWorld(true);
    const bw = bodyGroup.matrixWorld, pts = [];
    const take = (mesh, matrix) => mirrorMeshCorners(mesh, matrix, (x, y, z) => pts.push(x, y, z));
    // Body records include face-layer primaries: their ghost/inset ancestry is not the anatomical world frame.
    // Match the in-place/mirror body route: local source-mm pose, THEN the canonical body mm-to-world-m parent.
    for (const b of body) mirrorMeshCorners(b.mesh, b.mesh.matrix, (x, y, z) => {
      pv.set(x, y, z).applyMatrix4(bw); pts.push(pv.x, pv.y, pv.z);
    });
    eyeRig.updateMatrixWorld(true);
    for (const b of bones) { b.mesh.updateMatrixWorld(true); take(b.mesh, b.mesh.matrixWorld); }
    for (const m of muscles) { m.mesh.updateMatrixWorld(true); take(m.mesh, m.mesh.matrixWorld); }
    if (pts.length < 3) return false;
    try {
      const fwd = [-Math.sin(bodyYaw), 0, -Math.cos(bodyYaw)];
      mirror.body = NsMirror.bodyBoundsFromPoints(Float64Array.from(pts), { forward: fwd });
    } catch (err) { mirror.error = String((err && err.message) || err); return false; }
    mirror.samples = mirror.body.sample;
    mirror.ready = true;
    mirror.frameKey = '';
    updateMirrorPlacement();
    return true;
  }
  /** Brain radius about its pivot (source mm, the outline support points; an orbit / squash-proof bound). */
  function brainRadiusMm() {
    if (mirror.brainRadiusMm !== null) return mirror.brainRadiusMm;
    const P = (brainHullPoints && brainHullPoints.length >= 9 ? brainHullPoints : null) || (brainSupport && brainSupport.points), pv0 = arrowRef.pivot;
    if (!P || !pv0) return null;
    let r = 0;
    for (let i = 0; i < P.length; i += 3) r = Math.max(r, Math.hypot(P[i] - pv0[0], P[i + 1] - pv0[1], P[i + 2] - pv0[2]));
    mirror.brainRadiusMm = r;
    return r;
  }
  /** Default placement (ns-mirror mirrorPlacement) from the brain frame of the DEFAULT view (the grab carry undone; the
   * brain outline at no orbit), the measured body and the camera; re-placed (orbit kept) only when the brain frame or the
   * view size changes, never by a drag or an orbit. */
  function updateMirrorPlacement() {
    if (!mirror.ready || !farEyeView.pw || !arrowRef.k || !(cssW > 0 && cssH > 0)) return false;
    const tr = brainReferenceOrigin();
    const C = farEyeView.pw.map((v, i) => v - tr[i]);
    const cy = Math.cos(-arrowRef.yaw), sy = Math.sin(-arrowRef.yaw), cp = Math.cos(-arrowRef.pitch), sp = Math.sin(-arrowRef.pitch);
    const x1 = cy * C[0] + sy * C[2], z1 = -sy * C[0] + cy * C[2];
    const P0 = [x1, cp * C[1] - sp * z1, sp * C[1] + cp * z1];
    const rMm = brainRadiusMm();
    if (!(rMm > 0)) return false;
    // The brain outline box at the default view (NDC), taken while the brain is not orbited (else the last one is kept).
    const t = lastBrainTransform, notOrbited = !t || ((!Number.isFinite(t.orbitYaw) || t.orbitYaw === 0) && (!Number.isFinite(t.orbitPitch) || t.orbitPitch === 0));
    const sizeKey = `${cssW}x${cssH}|${camera.fov}`;
    if (notOrbited && (!mirror.outlineNdc || mirror.outlineNdc.key !== sizeKey || mirror.outlineNdc.k !== arrowRef.k)) {
      const P = brainHullPoints || (brainSupport && brainSupport.points);
      try {
        const cam = { width: cssW, height: cssH, fovYDeg: camera.fov, yaw: arrowRef.yaw, pitch: arrowRef.pitch, position: brainReferenceOrigin() };
        const { xy } = NsArrows.projectPointsPx(P, Array.from(brainGroup.matrixWorld.elements), cam);
        let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
        for (let i = 0; i < xy.length; i += 2) { if (!Number.isFinite(xy[i])) continue; a = Math.min(a, xy[i]); c = Math.max(c, xy[i]); b = Math.min(b, xy[i + 1]); d = Math.max(d, xy[i + 1]); }
        if (c > a && d > b) mirror.outlineNdc = { key: sizeKey, k: arrowRef.k, x0: (2 * a) / cssW - 1, x1: (2 * c) / cssW - 1, y0: 1 - (2 * d) / cssH, y1: 1 - (2 * b) / cssH, hullPx: NsArrows.convexHullPx(xy), fit: mirrorFitNow(xy, cam, P0) };
      } catch { /* keep the last outline */ }
    }
    if (!mirror.outlineNdc) return false;
    const key = `${P0.map(v => v.toFixed(4)).join(',')}|${arrowRef.k}|${farEyeView.K}|${sizeKey}|${mirror.outlineNdc.x0.toFixed(4)},${mirror.outlineNdc.y0.toFixed(4)}`;
    if (key === mirror.frameKey) return false;
    mirror.frameKey = key;
    try {
      const farM = NsMirror.brainFarDistance({ frame: { k: arrowRef.k, perspectiveK: farEyeView.K, pivotWorld: P0 }, brainRadiusMm: rMm });
      const bounds = brainDepthBounds;
      if (!bounds || !(bounds.sourcePositionCount > 0)) throw new Error('complete brain source bounds unavailable for initial mirror separation');
      const M = brainGroup.matrixWorld.elements; let depthFarM = -Infinity;
      // AABB contains EVERY normal glass/strip source position, unlike direction-sampled silhouette support.
      // An affine depth functional is bounded by its 8 corners; include behind-camera corners without clipping.
      for (let corner = 0; corner < 8; corner++) {
        const sx = (corner & 1 ? bounds.max : bounds.min)[0], sy0 = (corner & 2 ? bounds.max : bounds.min)[1], sz = (corner & 4 ? bounds.max : bounds.min)[2];
        const x = M[0] * sx + M[4] * sy0 + M[8] * sz + M[12] - tr[0];
        const y = M[1] * sx + M[5] * sy0 + M[9] * sz + M[13] - tr[1];
        const z = M[2] * sx + M[6] * sy0 + M[10] * sz + M[14] - tr[2];
        const unYawZ = -sy * x + cy * z, depth = -(sp * y + cp * unYawZ);
        if (![x, y, z, depth].every(Number.isFinite)) throw new Error('nonfinite normal brain depth support');
        depthFarM = Math.max(depthFarM, depth);
      }
      if (!(depthFarM > 0 && Number.isFinite(depthFarM))) throw new Error('positive finite initial brain depth support required');
      const brainIn = { centre: P0, farM, depthFarM, depthBasis: { kind: 'all-source-brain-AABB-depth-r22', corners: 8, sourcePositionCount: bounds.sourcePositionCount, orbitYawDeg: t && t.orbitYaw, orbitPitchDeg: t && t.orbitPitch, scope: 'conservative all-source AABB at initial/reframe planning; future posed/orbited collision remains unqualified' }, outlineNdc: mirror.outlineNdc }, camIn = { aspect: cssW / cssH, fovYDeg: camera.fov };
      // R5-bigbrain (R25): the brain fills the view, so the body goes into the largest clear place on the brain's
      // midline (ns-mirror mirrorFitBox: no motor area, no brain arrow and no HUD card in front of it or its arrows).
      const fitBox = mirror.outlineNdc.fit && mirror.outlineNdc.fit.boxFor ? mirror.outlineNdc.fit.boxFor(NsMirror.mirrorPlacement({ body: mirror.body, brain: brainIn, camera: camIn })) : null;
      mirror.fit = fitBox ? { boxPx: fitBox.box, freePx: fitBox.free, tried: fitBox.tried, rule: 'R22 usable-view/HUD fit, geometry may limit the engineering .6-height/.94-fill target' } : null;
      mirror.placement = NsMirror.mirrorPlacement({ body: mirror.body, brain: brainIn, camera: camIn, options: fitBox ? { targetBoxNdc: { x0: (2 * fitBox.box.x0) / cssW - 1, x1: (2 * fitBox.box.x1) / cssW - 1, y0: 1 - (2 * fitBox.box.y1) / cssH, y1: 1 - (2 * fitBox.box.y0) / cssH } } : {} });
      mirror.state = mirror.state ? NsMirror.placeMirror(mirror.state, mirror.placement) : NsMirror.createMirrorState(mirror.placement);
    } catch (err) { mirror.error = String((err && err.message) || err); return false; }
    applyMirror();
    return true;
  }
  /** R22: initial mirror fit in the usable view (CSS px), preserving HUD and mirror-arrow room.
   * The old motor-free-hole restriction is superseded by the visibly larger mirror requirement.
   * Brain geometry/input occlusion and actual arrow-layout rules remain independent and unchanged.
   * Returns the bounded existing mirrorFitBox result for the source body aspect; no native footprint proof. */
  function mirrorFitNow(xy, cam, P0) {
    // R22: fit a clearly larger mirror in the usable view, rather than the old small motor-free hole in the brain.
    // The brain is geometrically in front at startup and STILL blocks mirror input; this does not alter arrow picking/layout.
    // Retain the existing .6 max-height and .94 fill as engineering targets, with source near/scale/width constraints.
    const usable = arrowUsable(), boxes = arrowObstacles().filter(o => !o.crosshair);
    const blocked = b => boxes.reduce((n, o) => n + (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0 ? 1 : 0), 0);
    const sizesM = NsArrows.arrowSizePx({ width: cssW, height: cssH }, 'mirror');
    const room = NsArrows.arrowRoomPx(sizesM), fp = NsArrows.arrowPath().footprint;
    const band = 2 * fp.half * sizesM.sizePx * NsArrows.ARROW_LAYOUT.perspectiveAllowance + 2 * NsArrows.ARROW_LAYOUT.marginPx;
    const mirrorReferenceFrame = referenceOriginSet ? NsMath.multiply(NsMath.translation(referenceOrigin), referenceCarry) : null;
    const c = NsArrows.projectWorldPx(mirrorReferenceFrame ? NsMath.transformPoint(mirrorReferenceFrame, P0) : P0, referenceOriginSet ? { ...cam, yaw: referenceAngles.yaw, pitch: referenceAngles.pitch, position: referenceOrigin.slice() } : cam);
    return {
      boxFor(trial) {
        if (!trial || !(trial.expectedHeightNdc > 0 && trial.expectedWidthNdc > 0)) return null;
        const aspect = (trial.expectedWidthNdc * cssW) / (trial.expectedHeightNdc * cssH);
        try { return NsMirror.mirrorFitBox({ width: cssW, height: cssH, usable, blocked, aspect, room: { top: room, bottom: room, side: room }, sideBand: band, hull: null, centreX: c.x }); } catch { return null; }
      }
    };
  }
  /** The transform in use: an integrator's ns-mirror transform or state (setMirrorView), else the scene's default state
   * with its orbit. */
  function applyMirror() {
    let T = null;
    try {
      if (mirror.external && mirror.external.kind === 'ns-mirror-transform') T = mirror.external;
      else if (mirror.external && mirror.external.kind === 'ns-mirror-state' && mirror.external.placement) T = NsMirror.mirrorTransform(mirror.external);
      else if (mirror.state) T = NsMirror.mirrorTransform(Object.freeze({ ...mirror.state, placement: mirrorPlacementNow(), orbit: Object.freeze({ yaw: mirror.orbit.yaw, pitch: mirror.orbit.pitch }) }));
    } catch (err) { mirror.error = String((err && err.message) || err); T = null; }
    if (!T || !T.matrix || T.matrix.length !== 16) return false;
    const matrix = Array.from(T.matrix), centre = Array.from(T.centre);
    mirrorRoot.matrix.fromArray(matrix);
    mirrorRoot.matrixWorldNeedsUpdate = true;
    mirror.transform = { matrix, centre, scale: T.scale, det: T.det, orbit: T.orbit ? { yaw: T.orbit.yaw, pitch: T.orbit.pitch } : null };
    mirror.serial++;
    overlayDirty = true;
    updateCameraRange();
    return true;
  }
  /** Mirror sample points in the world (the body sample through the mirror matrix). */
  function mirrorSamplesWorld() {
    const S = mirror.samples, M = mirror.transform && mirror.transform.matrix;
    if (!S || !M) return null;
    const out = new Float64Array(S.length);
    for (let i = 0; i < S.length; i += 3) {
      out[i] = M[0] * S[i] + M[4] * S[i + 1] + M[8] * S[i + 2] + M[12];
      out[i + 1] = M[1] * S[i] + M[5] * S[i + 1] + M[9] * S[i + 2] + M[13];
      out[i + 2] = M[2] * S[i] + M[6] * S[i + 1] + M[10] * S[i + 2] + M[14];
    }
    return out;
  }
  /** R5-scene (D19): the mirror body's view. v:
   *  - an ns-mirror STATE (createMirrorState / applyMirrorOrbit / resetMirror; its placement may be null: the scene's
   *    own placement is then used with the state's orbit) or an ns-mirror TRANSFORM (mirrorTransform): used as given;
   *  - { orbit: { yaw, pitch } } or { yawDeg, pitchDeg } (degrees, ns-mirror convention: yaw > 0 = viewpoint to the
   *    right, pitch > 0 = viewpoint up) for the scene's own state;
   *  - { visible: false | true } shows or hides it (an Esc option, if any); null resets the orbit and drops a handed state.
   * It never turns by itself. Returns mirrorState(). */
  function setMirrorView(v = null) {
    if (v && Object.prototype.hasOwnProperty.call(v, 'worldCentre')) {
      const p = v.worldCentre;
      if (p !== null && (!p || p.length !== 3 || !Array.from(p).every(Number.isFinite))) fail('scene_input', 'normal mirror placement needs finite world metres');
      mirror.worldCentre = p === null ? null : Array.from(p);
    }
    if (v === null) { mirror.external = null; mirror.worldCentre = null; mirror.orbit = { yaw: 0, pitch: 0 }; }
    else if (v && (v.kind === 'ns-mirror-transform' || v.kind === 'ns-mirror-state')) {
      if (v.kind === 'ns-mirror-state' && !v.placement) { mirror.external = null; mirror.orbit = { yaw: v.orbit ? v.orbit.yaw : 0, pitch: v.orbit ? v.orbit.pitch : 0 }; }
      else mirror.external = v;
    } else if (v && typeof v === 'object') {
      const o = v.orbit && typeof v.orbit === 'object' ? v.orbit : v;
      const yaw = Number.isFinite(o.yaw) ? o.yaw : Number.isFinite(o.yawDeg) ? o.yawDeg : null;
      const pitch = Number.isFinite(o.pitch) ? o.pitch : Number.isFinite(o.pitchDeg) ? o.pitchDeg : null;
      if (yaw !== null || pitch !== null) { mirror.external = null; mirror.orbit = { yaw: yaw !== null ? yaw : mirror.orbit.yaw, pitch: pitch !== null ? pitch : mirror.orbit.pitch }; }
      if (typeof v.visible === 'boolean') mirror.enabled = v.visible;
    } else fail('scene_input', 'setMirrorView needs an ns-mirror state / transform, an orbit object or null');
    applyMirror();
    return mirrorState();
  }
  /** The scene's current default ns-mirror placement (or null), so an integrator can keep its own state in step:
   * NsMirror.placeMirror(state, scene.mirrorPlacementNow()). */
  function mirrorPlacementNow() {
    if (!mirror.placement) return mirror.placement;
    const placement = mirror.worldCentre ? { ...mirror.placement, worldCentre: Object.freeze(mirror.worldCentre.slice()) } : mirror.placement;
    if (!referenceOriginSet) return placement;
    return Object.freeze({ ...placement, referenceFrame: Object.freeze(Array.from(NsMath.multiply(NsMath.translation(referenceOrigin), referenceCarry))), referenceMeaning: 'constructor canonical world reference; apply exactly once in ns-mirror' });
  }
  /** QA: the mirror body's state, its measured on-screen box (CSS px; the projected body sample) and the share of those
   * points inside the brain's drawn outline (coveredByBrain). */
  function mirrorState() {
    const T = mirror.transform, Pl = mirror.placement;
    const out = { source: 'ns-mirror', enabled: mirror.enabled, ready: mirror.ready, visible: mirrorRoot.visible, error: mirror.error, twins: mirror.twins, armTwins: bones.length + muscles.length,
      carriedPlacement: { carryHeldAtReconcile: typeof mirror.carryHeldAtReconcile === 'boolean' ? mirror.carryHeldAtReconcile : null, worldCentreM: mirror.worldCentre ? mirror.worldCentre.slice() : null, actualCentreWorldM: T ? T.centre.slice() : null, initialDistanceM: Pl ? Pl.distanceM : null, priorSphereDistanceM: Pl ? Pl.priorSphereDistanceM : null, initialDepthNearM: Pl ? Pl.initialDepthNearM : null, brainDepthFarM: Pl ? Pl.brainDepthFarM : null, legacyBrainSphereFarM: Pl ? Pl.legacyBrainSphereFarM : null, brainDepthBasis: Pl ? Pl.brainDepthBasis : null, distanceComparisonMeaning: 'priorSphereDistanceM is the old formula at the NEW selected fit, not an old runtime measurement', scope: 'render-placement metadata only; not current wholebody/normalmechanics proof' },
      external: mirror.external ? mirror.external.kind : null, orbit: T && T.orbit ? { yawDeg: T.orbit.yaw, pitchDeg: T.orbit.pitch } : { yawDeg: mirror.orbit.yaw, pitchDeg: mirror.orbit.pitch },
      scale: T ? Math.round(T.scale * 1000) / 1000 : null, centre: T ? T.centre.map(v => Math.round(v * 1000) / 1000) : null, determinant: T ? T.det : null,
      placement: Pl ? { distanceM: Math.round(Pl.distanceM * 1000) / 1000, nearM: Math.round(Pl.nearM * 1000) / 1000, brainFarM: Math.round(Pl.brainFarM * 1000) / 1000, limiting: Pl.limiting, expectedHeightNdc: Math.round(Pl.expectedHeightNdc * 1000) / 1000, rule: Pl.rule || null } : null,
      fit: mirror.fit ? { boxPx: ['x0', 'y0', 'x1', 'y1'].map(k => Math.round(mirror.fit.boxPx[k])), freePx: ['x0', 'y0', 'x1', 'y1'].map(k => Math.round(mirror.fit.freePx[k])), tried: mirror.fit.tried } : null,
      body: mirror.body ? { heightM: Math.round(mirror.body.height * 1000) / 1000, radiusM: Math.round(mirror.body.radius * 1000) / 1000, points: mirror.body.count } : null,
      lodCellMm: mirror.lod || 0, lodPending: mirrorLodPending, lodBuildMs: Number.isFinite(mirror.lodBuildMs) ? Math.round(mirror.lodBuildMs) : 0, behindGlass: { applied: behindGlass.applied, amount: behindGlass.amount }, onScreen: null };
    if (referenceOriginSet) out.reference = { originWorldM: referenceOrigin.slice(), initialCarryRadians: { ...referenceAngles }, constructorOwned: true };
    const W = mirrorSamplesWorld();
    if (W && cssW > 0 && cssH > 0) {
      camera.updateMatrixWorld(true);
      brainCoversRect({ x0: 0, y0: 0, x1: 1, y1: 1 }); // refreshes the outline hull cache for this camera
      const hull = coverCache.valid ? coverCache.hull : null;
      // R5-bigbrain (R25 / R26): share of the body's sample points behind a motor area (first person: the motor
      // areas' occupancy grid at the current look; a motor area's backing darkens what is behind it)
      let grid = null;
      try { grid = camPose ? null : motorGridFor({ yaw: firstPose ? firstPose.yaw : lookYaw, pitch: firstPose ? firstPose.pitch : lookPitch }); } catch { grid = null; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0, inBrain = 0, behindMotor = 0;
      for (let i = 0; i < W.length; i += 3) {
        pv.set(W[i], W[i + 1], W[i + 2]).applyMatrix4(camera.matrixWorldInverse);
        if (pv.z > -camera.near) continue;
        pv.applyMatrix4(camera.projectionMatrix);
        const x = (pv.x + 1) * 0.5 * cssW, y = (1 - pv.y) * 0.5 * cssH;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (hull && hullSignedDistance(hull, x, y) <= 0) inBrain++;
        if (grid && grid.hits({ x0: x, y0: y, x1: x + 0.01, y1: y + 0.01 }) > 0) behindMotor++;
      }
      if (n) out.onScreen = { box: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)], heightPx: Math.round(y1 - y0), heightFrac: Math.round(((y1 - y0) / cssH) * 1000) / 1000, coveredByBrain: Math.round((inBrain / n) * 1000) / 1000, behindMotor: grid ? Math.round((behindMotor / n) * 1000) / 1000 : null, samples: n };
    }
    return out;
  }
  /** R5-camera (round5/R5-camera-NOTES.md 4.3): keep-out spheres [{ centre: [x, y, z], radius }] (world m) of your body
   * for the third-person boom (ns-camera cameraPose opts.avoid): one per body mesh (head and face IN PLACE: body frame x
   * mesh matrix), one per arm bone and one per arm muscle (from its CPU-skinned points). Cached until the body pose, the
   * arm pose, the body frame or the look changes. */
  let keepOutCache = null, keepOutKey = '';
  function bodyKeepOut() {
    const key = `${bodyPoseSerial}|${lastMatrices ? armPoseSerial : 0}|${lookYaw},${lookPitch}|${bodyFrame.join(',')}`;
    if (keepOutCache && key === keepOutKey) return keepOutCache;
    bodyGroup.updateMatrixWorld(true);
    eyeRig.updateMatrixWorld(true);
    const out = [], bw = bodyGroup.matrixWorld, col = Math.hypot(bw.elements[0], bw.elements[1], bw.elements[2]) || 0.001;
    for (const b of body) {
      const g = b.mesh.userData.nsFullGeometry || b.mesh.geometry, gs = g.boundingSphere;
      if (!gs) continue;
      pv.copy(gs.center).applyMatrix4(b.mesh.matrix).applyMatrix4(bw);
      out.push({ centre: [pv.x, pv.y, pv.z], radius: gs.radius * col });
    }
    for (const b of bones) {
      const g = b.mesh.userData.nsFullGeometry || b.mesh.geometry;
      if (!g.boundingSphere && typeof g.computeBoundingSphere === 'function') g.computeBoundingSphere();
      if (!g.boundingSphere) continue;
      b.mesh.updateMatrixWorld(true);
      const e = b.mesh.matrixWorld.elements;
      pv.copy(g.boundingSphere.center).applyMatrix4(b.mesh.matrixWorld);
      out.push({ centre: [pv.x, pv.y, pv.z], radius: g.boundingSphere.radius * (Math.hypot(e[0], e[1], e[2]) || 1) });
    }
    armGroup.updateMatrixWorld(true);
    for (const m of muscles) {
      const c = armMuscleCentre(m), p = m.pos, n = p.length / 3, step = Math.max(1, Math.floor(n / 400));
      let r = 0;
      for (let i = 0; i < n; i += step) r = Math.max(r, Math.hypot(p[3 * i] - c[0], p[3 * i + 1] - c[1], p[3 * i + 2] - c[2]));
      pv.set(c[0], c[1], c[2]).applyMatrix4(armGroup.matrixWorld);
      out.push({ centre: [pv.x, pv.y, pv.z], radius: r * 1.02 });
    }
    keepOutCache = out; keepOutKey = key;
    return out;
  }
  /** R5-scene (D19): the mirror-body part under CSS point (x, y): { elementId, bodyPart, kind, side (YOUR side: -1 left,
   * +1 right, 0 midline; ns-mirror MIRROR_TEXT names it "your ... (mirror image)"), name, distance, behindBrain } or null.
   * A ray against the mirror twins (a few ms: call it throttled, like raycastBrain). behindBrain: the brain's drawn
   * outline covers the point, so the brain catches the look (ns-mirror mirrorInputTarget). */
  function mirrorPartAt(x, y) {
    if (!mirrorRoot.visible || !(cssW > 0 && cssH > 0)) return null;
    camera.updateMatrixWorld(true);
    mirrorRoot.updateMatrixWorld(true);
    pv.set((x / cssW) * 2 - 1, 1 - (y / cssH) * 2, 0.5).unproject(camera);
    rayDir.copy(pv).sub(camera.position).normalize();
    rayOrigin.copy(camera.position);
    raycaster.set(rayOrigin, rayDir);
    const hits = raycaster.intersectObjects([...mirrorBodyGroup.children, ...mirrorArmGroup.children], false);
    if (!hits.length) return null;
    const o = hits[0].object, u = o.userData || {}, arm = mirrorArmGroup.children.includes(o);
    const covered = regionMode && brainTransformSet && brainCoversRect({ x0: x - 0.5, y0: y - 0.5, x1: x + 0.5, y1: y + 0.5 });
    return { elementId: u.elementId || null, bodyPart: u.bodyPart || (arm ? 'leftArm' : null), kind: u.kind || null, side: Number.isFinite(u.side) ? u.side : arm ? -1 : 0,
      name: String(o.name || '').replace(/^mirror image: /, ''), distance: hits[0].distance, behindBrain: covered };
  }

  /** R22 normal crosshair pick only. Own body and compass arrows are never graspable.
   * Transparent glass remains an input blocker of the mirror, including when an outline projection is unavailable. */
  function graspTargetAt(x, y) {
    if (!(cssW > 0 && cssH > 0 && Number.isFinite(x) && Number.isFinite(y))) return { target: null, blocked: 'unavailable-viewport' };
    const arrows = pickArrows(x, y);
    if (arrows.some(h => h.kind === 'arrow')) return { target: null, blocked: 'orbit-arrow' };
    camera.updateMatrixWorld(true); brainGroup.updateMatrixWorld(true);
    pv.set((x / cssW) * 2 - 1, 1 - (y / cssH) * 2, 0.5).unproject(camera);
    rayDir.copy(pv).sub(camera.position).normalize(); rayOrigin.copy(camera.position); raycaster.set(rayOrigin, rayDir);
    const brainHits = brainGroup.visible ? raycaster.intersectObjects(rayTargets || glass, false) : [];
    let hits = [], mirrorEnvelope = null;
    if (mirrorRoot.visible && mirror.transform && mirror.body) {
      mirrorRoot.updateMatrixWorld(true);
      hits = raycaster.intersectObjects([...mirrorBodyGroup.children, ...mirrorArmGroup.children], false);
      mirrorEnvelope = currentMirrorEnvelope();
    }
    const bh = brainHits[0] || null, mh = hits[0] || null;
    const mirrorPick = () => ({ target: 'mirror', blocked: null, centreWorldM: mirror.transform.centre.slice(), radiusM: mirrorEnvelope.radiusM,
      pointWorldM: mh.point.toArray(), mirrorEnvelope, source: 'nearest-visible-mirror-ray/full-current-enclosure-r22-r2' });
    // Transparent foreground brain STILL catches input; a genuinely nearer mirror is no longer caught by brain behind it.
    if (bh) return mh && mh.distance < bh.distance ? mirrorPick() : { target: 'brain', blocked: null, pointWorldM: bh.point.toArray(), mirrorEnvelope, source: 'nearest-active-camera-brain-ray' };
    const outline = regionMode && brainTransformSet && brainCoversRect({ x0: x - .5, y0: y - .5, x1: x + .5, y1: y + .5 });
    if (outline) {
      // Preserve the old outline blocker at concavities, except a mirror proved IN FRONT of the full brain AABB.
      let entry = 0, exit = Infinity, intersects = Boolean(brainDepthBounds);
      if (brainDepthBounds && mh) {
        const inverse = NsMirror.invertAffine(Array.from(brainGroup.matrixWorld.elements));
        const o = NsMath.transformPoint(inverse, [rayOrigin.x, rayOrigin.y, rayOrigin.z]);
        const d = NsMath.transformDirection(inverse, [rayDir.x, rayDir.y, rayDir.z]);
        for (let j = 0; j < 3; j++) {
          if (d[j] === 0) { if (o[j] < brainDepthBounds.min[j] || o[j] > brainDepthBounds.max[j]) intersects = false; continue; }
          const a = (brainDepthBounds.min[j] - o[j]) / d[j], b = (brainDepthBounds.max[j] - o[j]) / d[j];
          entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
        }
        intersects = intersects && exit >= entry;
        if (intersects && mh.distance < entry) return mirrorPick();
      }
      return { target: 'brain', blocked: 'brain-input-outline', mirrorEnvelope, source: 'conservative-brain-outline-input-blocker' };
    }
    return mh ? mirrorPick() : { target: null, blocked: null, mirrorEnvelope };
  }

  /* ---- R5-scene (D17): glow links ------------------------------------------------------------------------------------ */
  /** R5-scene (D17, R21): the links to draw now, from the simulation (glowLinksFromActions builds them from ns-actions /
   * ns-body): [{ regionId, level 0..1 (the area's activity, which fades with the 1 s activation), bodyMeshIds,
   * armMuscleKeys, armMuscleNames }]. Call every frame (or whenever they change); [] or null clears. The area and its
   * muscles get the same fluorescent glow colour (ns-colors glowColor) and a soft additive ribbon joins them, on your
   * body and on the mirror body. Returns the number of links kept. */
  function setGlowLinks(links) {
    glowState.links = normaliseGlowLinks(links);
    glowState.set++;
    return glowState.links.length;
  }
  /** Arm muscle centre in arm (eye) coordinates from its CPU-skinned positions (cached per pose). */
  function armMuscleCentre(m) {
    if (m.centre && m.centreFor === lastMatrices) return m.centre;
    const p = m.pos, n = p.length / 3, step = Math.max(1, Math.floor(n / 400));
    let x = 0, y = 0, z = 0, k = 0;
    for (let i = 0; i < n; i += step) { x += p[3 * i]; y += p[3 * i + 1]; z += p[3 * i + 2]; k++; }
    m.centre = k ? [x / k, y / k, z / k] : [0, 0, 0];
    m.centreFor = lastMatrices;
    return m.centre;
  }
  const glowScratch = { a: [0, 0, 0], b: [0, 0, 0] };
  /** Fill one ribbon (curve a -> b, camera-facing, constant on-screen width) into buf at its next slot. */
  function emitRibbon(buf, a, b, level, phase, alphaMul) {
    if (buf.n >= GLOW_LINK.maxLinks) return false;
    const st = glowStyle(level), K = st.K;
    const curve = glowCurve(a, b, { lift: GLOW_LINK.lift, n: GLOW_LINK.segments });
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const tanPx = (2 * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, cssH);
    const A = GLOW_LINK.across, nA = A.length, o = buf.n * glowVerts, nS = GLOW_LINK.segments;
    const core = GLOW_LINK.corePx / GLOW_LINK.haloPx;
    // R5-access A3: over the brain's drawn outline (the hull refreshed once per frame in updateGlow) only overBrainCore of
    // the core and overBrainHalo of the halo are drawn, so a link never hides the brain areas it crosses.
    const hull = glowHull, oc = Number.isFinite(K.overBrainCore) ? K.overBrainCore : 0.5, oh = Number.isFinite(K.overBrainHalo) ? K.overBrainHalo : 0;
    const vi = camera.matrixWorldInverse, pm = camera.projectionMatrix;
    for (let i = 0; i <= nS; i++) {
      const px0 = curve[3 * i], py0 = curve[3 * i + 1], pz0 = curve[3 * i + 2];
      const j0 = Math.max(0, i - 1), j1 = Math.min(nS, i + 1);
      let tx = curve[3 * j1] - curve[3 * j0], ty = curve[3 * j1 + 1] - curve[3 * j0 + 1], tz = curve[3 * j1 + 2] - curve[3 * j0 + 2];
      const vx = px0 - cx, vy = py0 - cy, vz = pz0 - cz, d = Math.hypot(vx, vy, vz);
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const sL = Math.hypot(sx, sy, sz) || 1; sx /= sL; sy /= sL; sz /= sL;
      const halfM = GLOW_LINK.haloPx * d * tanPx;
      const s = i / nS;
      const along = (d < GLOW_LINK.nearClipM ? 0 : glowAlongAlpha(s, phase)) * alphaMul * st.intensity;
      let over = false;
      if (hull) {
        pv.set(px0, py0, pz0).applyMatrix4(vi);
        if (pv.z < -camera.near) { pv.applyMatrix4(pm); over = hullSignedDistance(hull, (pv.x + 1) * 0.5 * cssW, (1 - pv.y) * 0.5 * cssH) <= 0; }
      }
      for (let j = 0; j < nA; j++) {
        const r = A[j], v = o + i * nA + j;
        buf.pos[3 * v] = px0 + sx * r * halfM; buf.pos[3 * v + 1] = py0 + sy * r * halfM; buf.pos[3 * v + 2] = pz0 + sz * r * halfM;
        const inCore = Math.abs(r) <= core + 1e-6;
        const c = inCore ? st.core : st.halo, al = (inCore ? K.linkAlpha * (over ? oc : 1) : K.haloAlpha * glowHalo(r) * (over ? oh : 1)) * along;
        buf.col[4 * v] = c[0]; buf.col[4 * v + 1] = c[1]; buf.col[4 * v + 2] = c[2]; buf.col[4 * v + 3] = Math.max(0, Math.min(1, al));
      }
      if (over) glowState.overSamples++;
    }
    buf.n++;
    return true;
  }
  function finishRibbons(buf) {
    buf.mesh.visible = buf.n > 0;
    buf.mesh.geometry.setDrawRange(0, buf.n * glowIdxPer);
    if (buf.n > 0) {
      const nv = buf.n * glowVerts;
      for (const [attr, size] of [[buf.pa, 3], [buf.ca, 4]]) {
        if (typeof attr.clearUpdateRanges === 'function' && typeof attr.addUpdateRange === 'function') { attr.clearUpdateRanges(); attr.addUpdateRange(0, nv * size); }
        attr.needsUpdate = true;
      }
    }
  }
  const setRim = (mat, rgb, gain) => {
    const u = mat && mat.userData && mat.userData.nsGlowRim;
    if (!u) return false;
    u.value.set(rgb[0] * gain, rgb[1] * gain, rgb[2] * gain, GLOW_K.rimPower);
    glowState.touched.add(mat);
    return true;
  };
  /** Per frame: eased link levels (ns-colors stepGlow), the rims of the linked areas and muscles, and the ribbons. */
  let glowHull = null, glowFlag = '';
  function updateGlow(dtMs) {
    const t0 = nowMs();
    glowState.overSamples = 0;
    glowHull = null;
    if (glowState.links.length || glowState.eased.size) {
      if (regionMode && brainTransformSet && brainCoversRect({ x0: 0, y0: 0, x1: 1, y1: 1 }) !== undefined && coverCache.valid) glowHull = coverCache.hull;
    }
    const prevTouched = glowState.touched;
    glowState.touched = new Set();
    // The levels are used AS GIVEN: R5-input's link levels already follow the 1 s activation envelope (ns-actions
    // glowLinks), so a second, wall-clock smoothing here would make the glow lag behind the area (and differ between
    // live play and QA step frames). A link that leaves the list is gone at once (it is below GLOW_LINK.minLevel then).
    glowState.eased.clear();
    glowOwn.n = 0; glowMirror.n = 0;
    let rimMuscles = 0, rimAreas = 0, topLevel = 0, topRegion = null;
    const regionIds = [], targets = [];
    const phase = reducedMotion ? NaN : ((nowMs() / 1000) / GLOW_LINK.pulseS) % 1; // no travelling pulse under reduced motion
    const mirrorOn = mirrorRoot.visible && mirror.transform !== null;
    const M = mirrorOn ? mirror.transform.matrix : null;
    const toMirror = (p, out) => { out[0] = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12]; out[1] = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13]; out[2] = M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]; return out; };
    for (const link of glowState.links) {
      const lv = link.level;
      if (!(lv >= GLOW_LINK.minLevel)) continue;
      glowState.eased.set(link.key, { level: lv, link });
      const rec = regionById.get(link.regionId);
      if (!rec || !rec.markCentre) continue;
      if (!regionIds.includes(link.regionId)) regionIds.push(link.regionId);
      if (lv > topLevel) { topLevel = lv; topRegion = link.regionId; }
      for (const id of Object.keys(link.body)) targets.push(id);
      for (const n of link.armNames) targets.push(n);
      for (const k of Object.keys(link.armKeys)) targets.push(k);
      const st = glowStyle(lv);
      const em = st.halo.map(c => c * st.intensity);
      if (setRim(rec.material, em, GLOW_K.areaRimGain)) rimAreas++;
      pv.set(rec.markCentre[0], rec.markCentre[1], rec.markCentre[2]).applyMatrix4(brainGroup.matrixWorld);
      const a = [pv.x, pv.y, pv.z];
      // targets -> groups (part + side), weighted centres in the player's world
      const groups = new Map();
      const addT = (key, w, p) => { let g = groups.get(key); if (!g) { g = { w: 0, x: 0, y: 0, z: 0 }; groups.set(key, g); } g.w += w; g.x += w * p[0]; g.y += w * p[1]; g.z += w * p[2]; };
      for (const [bid, w] of Object.entries(link.body)) {
        const b = bodyById.get(bid);
        if (!b || b.kind !== 'muscle') continue;
        const gs = b.mesh.geometry.boundingSphere;
        if (!gs) continue;
        if (setRim(b.material, em, GLOW_K.muscleRimGain)) rimMuscles++;
        if (b.mirror) setRim(b.mirror.material, em, GLOW_K.muscleRimGain);
        if (b.inPlace) setRim(b.inPlace.material, em, GLOW_K.muscleRimGain);
        pv.copy(gs.center).applyMatrix4(b.mesh.matrix).applyMatrix4(bodyGroup.matrixWorld);
        addT(`${b.anatomicalPart}:${b.side}`, w, [pv.x, pv.y, pv.z]);
      }
      const armKeys = Object.keys(link.armKeys);
      if (armKeys.length || link.armNames.length) {
        armGroup.updateMatrixWorld(true);
        for (const m of muscles) {
          const nm = String(m.mesh.name || '').toLowerCase();
          const w = m.key !== null && link.armKeys[m.key] !== undefined ? link.armKeys[m.key] : link.armNames.some(s => nm.includes(s)) ? 1 : 0;
          if (!(w > 0)) continue;
          if (setRim(m.mat, em, GLOW_K.muscleRimGain)) rimMuscles++;
          if (m.mirror) setRim(m.mirror.material, em, GLOW_K.muscleRimGain);
          const c = armMuscleCentre(m);
          pv.set(c[0], c[1], c[2]).applyMatrix4(armGroup.matrixWorld);
          addT('leftArm:-1', w, [pv.x, pv.y, pv.z]);
        }
      }
      for (const g of groups.values()) {
        if (!(g.w > 0)) continue;
        const b = [g.x / g.w, g.y / g.w, g.z / g.w];
        emitRibbon(glowOwn, a, b, lv, phase, 1);
        if (mirrorOn) emitRibbon(glowMirror, a, toMirror(b, glowScratch.b), lv, phase, GLOW_LINK.mirrorAlpha);
      }
    }
    for (const mat of prevTouched) if (!glowState.touched.has(mat)) { const u = mat.userData.nsGlowRim; if (u) u.value.set(0, 0, 0, GLOW_K.rimPower); }
    finishRibbons(glowOwn);
    finishRibbons(glowMirror);
    for (const b of [glowOwn, glowMirror]) { const g = b.mesh.userData.nsGlow; g.regionId = b.n ? topRegion : null; g.regionIds = b.n ? regionIds.slice() : []; g.muscles = b.n ? [...new Set(targets)] : []; g.intensity = b.n ? Math.round(glowStyle(topLevel).intensity * 1000) / 1000 : 0; }
    glowState.ribbons = glowOwn.n; glowState.mirrorRibbons = glowMirror.n; glowState.rimMuscles = rimMuscles; glowState.rimAreas = rimAreas;
    // R5-access A7: a page flag while any link shows (the HUD text gets its darker backdrop, proposed-glow-text.css).
    const flag = glowOwn.n + glowMirror.n > 0 ? 'on' : 'off';
    if (flag !== glowFlag) { glowFlag = flag; try { if (doc && doc.documentElement && doc.documentElement.dataset) doc.documentElement.dataset.nsGlow = flag; } catch { /* a flag only */ } }
    glowState.cpuMs = nowMs() - t0;
  }
  /** QA: the glow state. */
  function glowLinkState() {
    return { source: GLOW_SOURCE, links: glowState.links.length, active: [...glowState.eased].map(([id, e]) => ({ key: id, regionId: e.link.regionId, level: Math.round(e.level * 1000) / 1000 })),
      ribbons: glowState.ribbons, mirrorRibbons: glowState.mirrorRibbons, rimMuscles: glowState.rimMuscles, rimAreas: glowState.rimAreas, overBrainSamples: glowState.overSamples || 0, flag: glowFlag || 'off',
      cpuMs: Math.round(glowState.cpuMs * 1000) / 1000, rimShader: glowRim.applied, rimMaterials: glowRim.materials };
  }

  /** Per-frame DOM overlay: orbit arrows, region group labels, face label / inset frame. Style writes only on change. */
  function layoutOverlay() {
    if (!overlay || !(cssW > 0 && cssH > 0)) return;
    drainHudRecords();
    if (hudMo ? !overlayDirty && !hudDirty : !overlayDirty && hudReadIn > 0) { if (!hudMo) hudReadIn--; return; }
    overlayDirty = false;
    const reserve = infoPanelRect({ width: cssW, height: cssH });
    const reserveRight = info && !info.panel.hidden && reserve && reserve.layout === 'column' ? cssW - reserve.x0 : 0;
    const reserveBottom = info && !info.panel.hidden && reserve && reserve.layout === 'portrait' ? cssH - reserve.y0 : 0;
    const topPx = 26; // the essential limits line
    const hudRects = readHudRects();
    brainOverlayOk = regionMode && brainTransformSet && projectBrainBounds();
    const inViewNow = brainOverlayOk && brainBoundsVisible(brainBoundsPx, cssW - reserveRight, cssH - reserveBottom, topPx);
    // R5-scene (D16): the 3D arrows' boxes this frame (labels, the face caption and the HUD keep clear of the shown ones).
    updateArrows();
    arrowLayout = arrowScreenLayout();
    arrowsShown = Boolean(arrowLayout);
    // Polish: expose whether the brain is in view, so the HUD colour key can shrink while the player looks at the body
    // (far right / down / up) and the legend stops covering the right arm or the legs.
    const inView = inViewNow ? 'true' : 'false';
    if (brainInViewAttr !== inView) { overlay.setAttribute('data-ns-brain-in-view', inView); brainInViewAttr = inView; }
    layoutArrowTips(reserveRight, reserveBottom, topPx);
    // R4-fix (review F2): small switched-on areas get a gold ring at their centre (SMALL_MARK); placed before the labels,
    // which keep clear of the rings.
    if (overlay && regionMode && regions.length) updateMarkDots(reserveRight, reserveBottom);
    // R3-scene labels: fewer, larger, plainer (regionLabelDisplay), placed by declutterLabels at their projected anchors:
    // never under the info panel / legend / HUD card / toast, the orbit arrows, the crosshair zone, the limits line, the
    // player's arm (setLabelAvoid) or each other; the left-arm label is required, the rest show by priority up to the cap.
    if (labelEls.length) {
      const mw = brainGroup.matrixWorld, vi = camera.matrixWorldInverse, pm = camera.projectionMatrix;
      const hovered = hoveredRegionId;
      const items = labelItems;
      const projPx = (x, y, z) => { pv.set(x, y, z).applyMatrix4(mw).applyMatrix4(vi); if (!(brainTransformSet && pv.z < -near)) return null; pv.applyMatrix4(pm); return [(pv.x + 1) * 0.5 * cssW, (1 - pv.y) * 0.5 * cssH]; };
      for (let i = 0; i < labelEls.length; i++) {
        const L = labelEls[i], a = L.group.anchor, it = items[i];
        pv.set(a[0], a[1], a[2]).applyMatrix4(mw).applyMatrix4(vi);
        if (brainTransformSet && pv.z < -near) { pv.applyMatrix4(pm); it.x = (pv.x + 1) * 0.5 * cssW; it.y = (1 - pv.y) * 0.5 * cssH; }
        else { it.x = NaN; it.y = NaN; }
        // An anchor under the info column / bottom band is not a place for its label.
        if (reserveRight > 0 && it.x > cssW - reserveRight) it.x = NaN;
        if (reserveBottom > 0 && it.y > cssH - reserveBottom) it.y = NaN;
        // R4-fix (review RP1, blocker): the required "Left arm / brain's right half" tag stays on ITS half of the brain:
        // the brain's midline (source x = 0, through the anchor's front-back position and height) projected as a
        // screen line; the tag's whole box keeps to the anchor's side of it (declutterLabels `side`).
        it.side = null;
        if (it.required && Number.isFinite(it.x) && Number.isFinite(it.y)) {
          const m0 = projPx(0, a[1] - 30, a[2]), m1 = projPx(0, a[1] + 30, a[2]);
          if (m0 && m1 && Math.abs(m1[1] - m0[1]) > 1e-3) {
            const dxdy = (m1[0] - m0[0]) / (m1[1] - m0[1]), mx = m0[0] + (it.y - m0[1]) * dxdy;
            if (Math.abs(it.x - mx) > 1) it.side = { x0: m0[0], y0: m0[1], dxdy, sign: it.x > mx ? 1 : -1 };
          }
        }
      }
      const obst = labelObstacles;
      obst.length = 0;
      obst.push({ x0: cssW / 2 - 60, y0: cssH / 2 - 32, x1: cssW / 2 + 60, y1: cssH / 2 + 32 }); // crosshair + hover label zone
      if (reserveRight > 0) obst.push({ x0: cssW - reserveRight, y0: 0, x1: cssW, y1: cssH });
      if (reserveBottom > 0) obst.push({ x0: 0, y0: cssH - reserveBottom, x1: cssW, y1: cssH });
      for (const r of hudRects) if (!(orientLive && r.orient)) obst.push(r);
      if (orientLive) for (const r of orientLive) obst.push(r);
      if (arrowsShown && arrowLayout) for (const d of ARROW_DIRS) {
        const p = arrowLayout[d];
        if (p && p.box) obst.push({ x0: p.box.x0 - 4, y0: p.box.y0 - 4, x1: p.box.x1 + 4, y1: p.box.y1 + 4 });
      }
      for (const r of labelAvoidPx().boxes) obst.push(r);
      // R4-fix (F2): the small-area switched-on rings stay visible (labels keep clear of them).
      for (const d of markDots.values()) if (d.shown && Number.isFinite(d.px) && Number.isFinite(d.py)) { const R = SMALL_MARK.sizePx / 2 + 3; obst.push({ x0: d.px - R, y0: d.py - R, x1: d.px + R, y1: d.py + R }); }
      const compact = cssW / cssH < 1 || cssW < 900;
      const pos = declutterLabels(items, { width: cssW, height: cssH, topPx, obstacles: obst, maxShown: compact ? LABEL_LAYOUT.maxShownCompact : LABEL_LAYOUT.maxShown });
      for (let i = 0; i < labelEls.length; i++) {
        const L = labelEls[i], q = pos[i], b = labelBoxes[i];
        const shown = q.shown;
        L.shownNow = shown;
        b.x = q.x; b.y = q.y; b.skip = !shown;
        if (L.last.shown !== shown) { L.last.shown = shown; L.el.hidden = !shown; }
        if (!shown) continue;
        const fd = q.faded === true;
        if (L.last.faded !== fd) { L.last.faded = fd; if (fd) L.el.setAttribute('data-ns-faded', 'true'); else L.el.removeAttribute('data-ns-faded'); }
        const hov = hovered !== null && L.group.regionIds.includes(hovered);
        if (L.last.hover !== hov) { L.last.hover = hov; if (hov) L.el.setAttribute('data-hover', 'true'); else L.el.removeAttribute('data-hover'); }
        const l = px(q.x), t = px(q.y);
        if (L.last.left !== l) { L.el.style.left = l; L.last.left = l; }
        if (L.last.top !== t) { L.el.style.top = t; L.last.top = t; }
      }
    }
    // Face layer label (ghost: near the projected ghost centre; inset: a fixed top-centre frame).
    if (faceLabel) {
      let showLabel = false;
      if (faceMode === 'ghost' && faceAmount > 0.05 && faceGroup.visible) {
        pv.set(faceHeadCentre[0], faceHeadCentre[1], faceHeadCentre[2]).applyMatrix4(faceGroup.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        if (pv.z < -near) {
          pv.applyMatrix4(camera.projectionMatrix);
          const x = (pv.x + 1) * 0.5 * cssW, y = (1 - pv.y) * 0.5 * cssH;
          const r = (FACE_LAYER.scale * faceRadiusMm * 0.001) / FACE_LAYER.distanceM; // angular radius (rad)
          const headPx = (r / Math.tan((camera.fov * DEG) / 2)) * 0.5 * cssH;
          const xl = clampTo(x, 120, Math.max(120, cssW - reserveRight - 120));
          // R3-integrator (R3-player item 9): the caption goes under the face unless that would run into the bottom edge or
          // the capture toast; then it goes above the face. Never on top of the toast.
          // R3-fix (review m2, portrait): never down into the bottom band (legend + information panel) either.
          let bottom = cssH - 8 - (reserveBottom > 0 ? reserveBottom + 6 : 0);
          for (const q of hudRectCache) if (q.toast && q.x1 > xl - 190 && q.x0 < xl + 190) bottom = Math.min(bottom, q.y0 - 6);
          const lh = faceLabelH > 0 ? faceLabelH : 60;
          let yl = y + headPx + 8;
          if (yl + lh > bottom) yl = y - headPx - 8 - lh;
          yl = clampTo(yl, topPx, Math.max(topPx, bottom - lh));
          // R3-fix (review m2): never under an orbit arrow: try the other side of the face, then shift sideways.
          if (!(faceLabelW > 0) && faceLabel.offsetWidth > 0) faceLabelW = faceLabel.offsetWidth;
          const lw = faceLabelW > 0 ? faceLabelW : Math.min(360, 0.44 * cssW);
          const arrowBoxes = [];
          if (arrowLayout) for (const d of ARROW_DIRS) { const q = arrowLayout[d]; if (q && q.box) arrowBoxes.push({ x0: q.box.x0 - 4, y0: q.box.y0 - 4, x1: q.box.x1 + 4, y1: q.box.y1 + 4 }); }
          const hits = (cx, ty) => arrowBoxes.some(a => cx + lw / 2 > a.x0 && cx - lw / 2 < a.x1 && ty + lh > a.y0 && ty < a.y1);
          if (hits(xl, yl)) {
            const ys = [yl, clampTo(y - headPx - 8 - lh, topPx, Math.max(topPx, bottom - lh)), clampTo(y + headPx + 8, topPx, Math.max(topPx, bottom - lh))];
            let done = false;
            for (const ty of ys) { if (!hits(xl, ty)) { yl = ty; done = true; break; } }
            for (let k = 1; !done && k <= 8; k++) for (const sg of [1, -1]) {
              const cx = clampTo(xl + sg * k * 30, lw / 2 + 6, Math.max(lw / 2 + 6, cssW - reserveRight - lw / 2 - 6));
              if (!hits(cx, yl)) { xlShift = cx - xl; done = true; break; }
            }
          }
          if (!faceLabel.hidden && !(faceLabelH > 0) && faceLabel.offsetHeight > 0) faceLabelH = faceLabel.offsetHeight;
          showLabel = true;
          const l = px(xl + xlShift), t = px(yl);
          xlShift = 0;
          if (faceLabelLast.left !== l) { faceLabel.style.left = l; faceLabelLast.left = l; }
          if (faceLabelLast.top !== t) { faceLabel.style.top = t; faceLabelLast.top = t; }
          if (faceLabelLast.text !== faceText.ghostLabel) { faceLabel.textContent = faceText.ghostLabel; faceLabelLast.text = faceText.ghostLabel; }
        }
      }
      if (faceLabel.hidden === showLabel) faceLabel.hidden = !showLabel;
      const showInset = faceMode === 'inset' && faceAmount > 0.05 && faceGroup.visible;
      if (insetFrame.hidden === showInset) insetFrame.hidden = !showInset;
      if (showInset) {
        const r = insetRect();
        const l = px(r.x), t = px(r.y), sz = px(r.size);
        if (insetLast.left !== l) { insetFrame.style.left = l; insetLast.left = l; }
        if (insetLast.top !== t) { insetFrame.style.top = t; insetLast.top = t; }
        if (insetLast.size !== sz) { insetFrame.style.width = sz; insetFrame.style.height = sz; insetLast.size = sz; }
      }
    }
  }

  /** Inset box (CSS px, origin top left): top centre below the essential line, inside the free width. */
  function insetRect() {
    const I = FACE_LAYER.inset;
    const size = Math.max(80, Math.min(I.sizePx, (I.sizeVmin / 100) * Math.min(cssW, cssH)));
    return { x: Math.round((cssW - size) / 2), y: 30, size };
  }

  const deviceRatio = () => (view && Number.isFinite(view.devicePixelRatio) && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1);
  /** Current CSS size of the canvas and the pixel ratio of the current quality level (qualityPixelRatio: the device
   * ratio capped at maxPixelRatio times the level's scale). ns-app's resizer applies it; render() also applies a level
   * change at once, so the two agree. */
  function measure() {
    return { width: Math.floor(canvas.clientWidth || 0), height: Math.floor(canvas.clientHeight || 0), pixelRatio: qualityPixelRatio(qState.level, deviceRatio(), maxPixelRatio) };
  }

  /** Drawing buffer at CSS size w x h and pixel ratio pr (one allocation; skipped when nothing changed) and the arm
   * see-through window in drawing-buffer pixels. */
  let bufferKey = '';
  function applyBuffer(width, height, pr) {
    const key = `${width}x${height}@${pr}`;
    if (key !== bufferKey) {
      bufferKey = key;
      if (typeof renderer.setDrawingBufferSize === 'function') renderer.setDrawingBufferSize(width, height, pr);
      else { renderer.setPixelRatio(pr); renderer.setSize(width, height, false); }
    }
    const w = armWinUniform.value;
    w[0] = (width * pr) / 2; w[1] = (height * pr) / 2; w[2] = ARM_SEE.radiusFrac * Math.min(width, height) * pr; w[3] = ARM_SEE.edge;
    cssPr = pr;
  }

  /** Renderer size (CSS size kept by the stylesheet), camera aspect and projection. One drawing-buffer allocation
   * (setDrawingBufferSize) when available. */
  function resize({ width, height, pixelRatio = 1, fovYDeg: fov } = {}) {
    if (!(width > 0 && height > 0)) return false;
    const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    applyBuffer(width, height, pr);
    // Optional narrow-layout FOV from ns-app (effectiveFovYDeg); absent or invalid keeps the current FOV.
    if (Number.isFinite(fov) && fov > 0 && fov < 179) camera.fov = fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    cssW = width; cssH = height;
    overlayDirty = true;
    return true;
  }

  /* ---- R4-scene (D8): quality ---------------------------------------------------------------------------------------- */
  let liteApplied = null;
  /** Apply the current quality level: the drawing-buffer pixel ratio (at once; ns-app's next measure() agrees) and the
   * lite passes (QUALITY_LEVELS). Nothing here touches a colour, an activity value, a label or a text. */
  function applyQuality() {
    const L = QUALITY_LEVELS[qState.level];
    const pr = qualityPixelRatio(qState.level, deviceRatio(), maxPixelRatio);
    if (cssW > 0 && cssH > 0 && pr !== cssPr) applyBuffer(cssW, cssH, pr);
    if (liteApplied !== L.lite) {
      liteApplied = L.lite;
      for (const m of glassXray) m.visible = !L.lite;
    }
    const lodKey = L.lod ? `${L.lod.glassMm}/${L.lod.bodyMm}/${L.lod.armMm || 0}` : '';
    if (lodApplied !== lodKey) setLod(L.lod, lodKey);
    else if ((mirror.lod || 0) !== mirrorLodCell()) applyMirrorLod();
  }
  /** The 'lod' copies: built once on first use (clusterDecimate; about 10 ms for the glass in Node) and swapped in or out
   * on every mesh that shares a geometry (the glass shell, its depth pre-pass and x-ray copies; a body mesh and its depth
   * twins). The full geometries are kept, so leaving the level restores them exactly. */
  let lodApplied = '';
  const lodOf = new Map(); // full geometry -> Map(cell -> lod geometry)
  const lodStats = {};
  function lodGeometry(geo, cell, stat) {
    let byCell = lodOf.get(geo);
    if (!byCell) { byCell = new Map(); lodOf.set(geo, byCell); }
    let lod = byCell.get(cell);
    if (lod) return lod;
    const pos = geo.attributes && geo.attributes.position, idx = geo.index;
    if (!pos || !idx) { byCell.set(cell, geo); return geo; }
    const sulc = geo.attributes.nsSulc ? geo.attributes.nsSulc.array : null;
    const d = clusterDecimate(pos.array, idx.array, cell, sulc ? { nsSulc: sulc } : null);
    lod = keep(indexedGeometry(d.positions, d.indices));
    lod.computeVertexNormals();
    if (d.attrs && d.attrs.nsSulc) lod.setAttribute('nsSulc', new THREE.BufferAttribute(d.attrs.nsSulc, 1));
    if (typeof lod.computeBoundingSphere === 'function') lod.computeBoundingSphere();
    stat[0] += idx.count / 3; stat[1] += d.triangles;
    byCell.set(cell, lod);
    return lod;
  }
  function setLod(lod, key) {
    const t0 = nowMs();
    const st = lod ? (lodStats[key] ||= { builtMs: null, glass: [0, 0], body: [0, 0] }) : null;
    const fresh = st && st.builtMs === null;
    const swap = (mesh, cell, stat) => {
      if (!mesh) return;
      const full = mesh.userData.nsFullGeometry || mesh.geometry;
      if (!mesh.userData.nsFullGeometry) mesh.userData.nsFullGeometry = full;
      const g = lod ? lodGeometry(full, cell, stat) : full;
      mesh.geometry = g;
      for (const c of mesh.children || []) if (c.userData && c.userData.depthTwin) c.geometry = g;
      if (mesh.userData.nsInPlaceTwin) mesh.userData.nsInPlaceTwin.geometry = g;
    };
    for (const list of [glass, glassDepth, glassXray]) for (const m of list) swap(m, lod ? lod.glassMm : 0, st ? st.glass : null);
    for (const b of body) swap(b.mesh, lod ? lod.bodyMm : 0, st ? st.body : null);
    // The arm (bones and CPU-skinned muscles): an index-only LOD over the unchanged (skinned) vertex buffers, only at
    // levels with armMm.
    const armCell = lod && lod.armMm > 0 ? lod.armMm : 0;
    const armMeshes = [...bones.map(b => ({ mesh: b.mesh, rest: null })), ...muscles.map(m => ({ mesh: m.mesh, rest: m.rest }))];
    for (const { mesh, rest } of armMeshes) {
      const full = mesh.userData.nsFullGeometry || mesh.geometry;
      if (!mesh.userData.nsFullGeometry) mesh.userData.nsFullGeometry = full;
      let g = full;
      if (armCell) {
        let byCell = lodOf.get(full);
        if (!byCell) { byCell = new Map(); lodOf.set(full, byCell); }
        g = byCell.get(armCell);
        if (!g) {
          const restPos = rest || (full.attributes.position && full.attributes.position.array);
          const r = clusterIndexLod(restPos, full.index.array, armCell);
          g = keep(new THREE.BufferGeometry());
          for (const name of Object.keys(full.attributes)) g.setAttribute(name, full.attributes[name]);
          g.setIndex(new THREE.BufferAttribute(r.indices, 1));
          if (full.boundingSphere) g.boundingSphere = full.boundingSphere;
          if (st) { st.arm = st.arm || [0, 0]; st.arm[0] += full.index.count / 3; st.arm[1] += r.triangles; }
          byCell.set(armCell, g);
        }
      }
      mesh.geometry = g;
      for (const c of mesh.children || []) if (c.userData && c.userData.depthTwin) c.geometry = g;
      if (mesh.userData.nsMirrorTwin) {
        mesh.userData.nsMirrorTwin.userData.nsFullGeometry = full;
        mesh.userData.nsMirrorTwin.geometry = g;
      }
    }
    lodApplied = key;
    if (fresh) st.builtMs = Math.round(nowMs() - t0);
    applyMirrorLod();
  }
  /** R5-scene (D19): the mirror body is drawn from LOD copies: R5_SCENE.mirrorLodFullMm at full quality (about a pixel at
   * its distance), and from QUALITY_LEVELS index R5_SCENE.mirrorQualityLodFrom on the coarser R5_SCENE.mirrorLodBodyMm (or
   * the level's own body cell when that is coarser), so it is the first thing simplified on a slow renderer. R5-load W-M3:
   * INDEX-ONLY copies (clusterIndexLod: the twin shares its body mesh's position and normal buffers and adds only an index
   * buffer), built lazily and time-sliced (stepMirrorLod: about R5_SCENE.mirrorLodSliceMs per frame); until a mesh's copy is
   * ready its twin draws the full mesh. */
  const mirrorLodOf = new Map(); // full geometry -> Map(cell -> index-only geometry)
  let mirrorLodWant = 0, mirrorLodPending = 0;
  function mirrorLodCell() {
    const L = QUALITY_LEVELS[qState.level];
    return qState.level >= R5_SCENE.mirrorQualityLodFrom ? Math.max(R5_SCENE.mirrorLodBodyMm, L.lod ? L.lod.bodyMm : 0) : Math.max(R5_SCENE.mirrorLodFullMm || 0, L.lod ? L.lod.bodyMm : 0);
  }
  function mirrorIndexLod(full, cell, build) {
    let byCell = mirrorLodOf.get(full);
    if (!byCell) { byCell = new Map(); mirrorLodOf.set(full, byCell); }
    let g = byCell.get(cell);
    if (g || !build) return g || null;
    const pos = full.attributes && full.attributes.position, idx = full.index;
    if (!pos || !idx) { byCell.set(cell, full); return full; }
    const r = clusterIndexLod(pos.array, idx.array, cell);
    g = keep(new THREE.BufferGeometry());
    for (const name of Object.keys(full.attributes)) g.setAttribute(name, full.attributes[name]);
    g.setIndex(new THREE.BufferAttribute(r.indices, 1));
    if (full.boundingSphere) g.boundingSphere = full.boundingSphere;
    g.userData = { nsMirrorLod: cell, triangles: r.triangles };
    byCell.set(cell, g);
    return g;
  }
  /** Point every twin at its copy for the wanted cell (those built), and count the ones still to build. */
  function applyMirrorLod() {
    const cell = mirrorLodCell();
    mirrorLodWant = cell;
    let pending = 0, n = 0;
    for (const b of body) {
      const tw = b.mirror;
      if (!tw) continue;
      const full = b.mesh.userData.nsFullGeometry || b.mesh.geometry;
      tw.userData.nsFullGeometry = full;
      const g = cell > 0 ? mirrorIndexLod(full, cell, false) : b.mesh.geometry;
      const use = g || b.mesh.geometry;
      if (!g) pending++;
      if (tw.geometry !== use) { tw.geometry = use; n++; }
    }
    mirrorLodPending = pending;
    mirror.lod = cell > 0 ? cell : false;
    return n;
  }
  /** Build some missing copies within budgetMs (called once per drawn frame). */
  function stepMirrorLod(budgetMs = R5_SCENE.mirrorLodSliceMs) {
    if (!(mirrorLodPending > 0) || !(mirrorLodWant > 0)) return 0;
    const t0 = nowMs();
    let built = 0;
    for (const b of body) {
      if (!b.mirror) continue;
      const full = b.mesh.userData.nsFullGeometry || b.mesh.geometry;
      if (mirrorIndexLod(full, mirrorLodWant, false)) continue;
      mirrorIndexLod(full, mirrorLodWant, true);
      built++;
      if (nowMs() - t0 > budgetMs) break;
    }
    mirror.lodBuildMs = (mirror.lodBuildMs || 0) + (nowMs() - t0);
    applyMirrorLod();
    return built;
  }
  /** Esc-page setting (D8): 'auto' | 'high' | 'low'. Returns qualityState(). */
  function setQuality(mode) {
    if (!QUALITY_MODES.includes(mode)) fail('scene_args', `setQuality needs one of ${QUALITY_MODES.join(', ')}`);
    if (mode !== qState.mode) {
      qState = qualityStart(mode);
      // R4-integrator: Auto starts again from full quality, as at start-up, and steps down within about a second if the
      // frames are slow (down-steps need 0.7 s, up-steps 6 s per level). Keeping the old level (R4-scene) left a player
      // who went Low -> Auto at the lowest level for 30 s or more on a fast GPU, and for ever under QA step frames.
      if (mode === 'auto') qState.level = 0;
      applyQuality();
    }
    return qualityState();
  }
  /** Plain-JSON quality state (QA snapshot via sceneState().quality). */
  function qualityState() {
    const L = QUALITY_LEVELS[qState.level];
    const med = qState.samples.length ? medianOf(qState.samples) : null;
    return {
      mode: qState.mode, level: qState.level, name: L.name, scale: L.scale, lite: L.lite,
      // R4-integrator: MSAA chosen at context creation (off on a software renderer or a saved Low) and the probe's result.
      antialias: msaa, softwareRenderer, rendererName,
      pixelRatio: qualityPixelRatio(qState.level, deviceRatio(), maxPixelRatio), deviceRatio: deviceRatio(),
      medianFrameMs: med === null ? null : Math.round(med * 10) / 10, changes: qState.changes, lastChange: qState.lastChange,
      buffer: cssW > 0 ? [Math.round(cssW * cssPr), Math.round(cssH * cssPr)] : null,
      lod: lodApplied ? { cellsMm: lodApplied, builtMs: lodStats[lodApplied].builtMs, glassTriangles: lodStats[lodApplied].glass.slice(), bodyTriangles: lodStats[lodApplied].body.slice(), armTriangles: lodStats[lodApplied].arm ? lodStats[lodApplied].arm.slice() : null } : null,
      // Last frame's draw calls and triangles (Three renderer.info; main pass only) and the main-thread ms of render().
      drawCalls: renderer.info && renderer.info.render ? renderer.info.render.calls : null,
      triangles: renderer.info && renderer.info.render ? renderer.info.render.triangles : null,
      renderMs: Number.isFinite(lastRenderCpuMs) ? Math.round(lastRenderCpuMs * 100) / 100 : null
    };
  }

  /** Draw one frame. opts.live === false (ns-app QA step frames, frozen intro / Esc-page redraws, held-loop
   * screenshots) keeps the frame out of the quality controller's samples AND restarts the interval clock, so the gap
   * after it is not a sample either (R4-fix, code review F1); every other call is a sample (the interval since the
   * previous live render). */
  function render(opts) {
    if (lost || disposed) return;
    const now = nowMs();
    const notLive = Boolean(opts && opts.live === false);
    const dtMs = lastRenderAt === null ? 0 : now - lastRenderAt; // eases (held cue, ghosts): every drawn frame
    lastRenderAt = now;
    const sampleMs = lastSampleAt === null ? 0 : now - lastSampleAt; // quality samples: live frame to live frame only
    lastSampleAt = notLive ? null : now;
    if (!notLive && sampleMs > 0 && (qState.mode === 'auto')) {
      const before = qState.level;
      qState = stepQuality(qState, sampleMs, qualityOpts);
      if (qState.level !== before) applyQuality();
    }
    if (liteApplied === null) applyQuality();
    // R4-scene held-brain cue: ease toward the target (instant under prefers-reduced-motion).
    if (heldCue.amount !== heldCue.target) {
      const tau = heldCue.target > heldCue.amount ? HELD_CUE.inS : HELD_CUE.outS;
      let h = reducedMotion || !(dtMs > 0) ? heldCue.target : heldCue.amount + (heldCue.target - heldCue.amount) * (1 - Math.exp(-dtMs / 1000 / tau));
      if (Math.abs(heldCue.target - h) < 0.03) h = heldCue.target;
      heldCue.amount = h;
      const rim = heldCueRim(h);
      shellRimUniforms.nsRimOpacity.value = rim.rimOpacity; shellRimUniforms.nsRimPower.value = rim.rimPower;
    }
    if (strip) strip.uniforms.nsTime.value = (now / 1000) % 1000;
    // Arm ghost window (auto): while the crosshair is on a control region (legacy marker or region mode).
    const target = armGhostState.mode === 'auto' ? (typeof highlighted === 'string' || gazeOnRegion ? 1 : 0) : armGhostState.mode;
    const k = dtMs > 0 ? 1 - Math.exp(-dtMs / 1000 / ARM_GHOST.easeS) : 1;
    let a = armGhostState.amount + (target - armGhostState.amount) * k;
    if (Math.abs(target - a) < 1e-3) a = target;
    armGhostState.amount = a;
    armSeeUniform.value[0] = a;
    // R3-scene: the arm's depth pre-pass twins only while its smooth window is open (otherwise the arm is drawn at alpha 1).
    const twinsOn = a > 1e-3;
    if (twinsOn !== armTwinsOn) { armTwinsOn = twinsOn; for (const t of armTwins) t.visible = twinsOn; }
    const tTarget = body.length && BODY_TRANSLUCENT.enabled !== false ? bodySeeThroughAmount(lookPitch, BODY_TRANSLUCENT) : 0;
    let ta = torsoGhost.amount + (tTarget - torsoGhost.amount) * (dtMs > 0 ? 1 - Math.exp(-dtMs / 1000 / BODY_TRANSLUCENT.easeS) : 1);
    if (Math.abs(tTarget - ta) < 1e-3) ta = tTarget;
    torsoGhost.amount = ta;
    torsoGhost.target = tTarget;
    torsoSeeUniform.value[0] = ta;
    // While translucent, the torso colour pass must not write depth (the legs behind stay visible) and its twins keep only
    // the nearest torso surface; at amount 0 the torso is drawn like an opaque body (alpha 1, depth written).
    const see = ta > 1e-3;
    if (see !== torsoGhost.depthPrePass) {
      torsoGhost.depthPrePass = see;
      for (const t of torsoTwins) t.visible = see;
      for (const m of torsoMaterials) m.depthWrite = !see;
    }
    // R5-scene (D19): the mirror body is measured from the first posed body, then shown behind the brain; its LOD copies
    // are built a few at a time.
    if (body.length && !mirror.ready) computeMirrorBody();
    if (mirrorRoot.visible) stepMirrorLod();
    {
      const showMirror = mirror.enabled && mirror.ready && mirror.transform !== null;
      if (mirrorRoot.visible !== showMirror) { mirrorRoot.visible = showMirror; overlayDirty = true; }
    }
    updateArrows();
    updateFaceLayer();
    layoutOverlay();
    // R3-fix (M4): the body is see-through where it covers the brain's on-screen outline (the ellipse in the brain's
    // projected bounds, from the overlay layout of this frame), only while the brain is in front of the camera.
    // R5-scene (D18): NOT in third person (you are there to look at your body): the body stays solid, and only a small
    // soft window at the crosshair opens while the crosshair is on a motor area, so the area you look at is never hidden.
    {
      const third = camState.headInPlace;
      const on = !third && body.length > 0 && regionMode && brainTransformSet && brainOverlayOk && cssW > 0 && cssH > 0 && (camPose ? camMul.overBrain : 1) > 0;
      const win = third && body.length > 0 && cssW > 0 && cssH > 0 && (gazeOnRegion || typeof highlighted === 'string');
      overBrain.amount = on ? (camPose ? camMul.overBrain : 1) : win ? 1 : 0;
      overBrain.mode = on ? 'brain-outline' : win ? 'crosshair' : 'off';
      overBrainUniform.value[0] = overBrain.amount;
      if (on) {
        const b = brainBoundsPx, pr = cssPr || 1, pad = BODY_OVER_BRAIN.padFrac;
        const rx = (b.x1 - b.x0) / 2, ry = (b.y1 - b.y0) / 2;
        const w = overBrainWinUniform.value;
        w[0] = ((b.x0 + b.x1) / 2) * pr; w[1] = (cssH - (b.y0 + b.y1) / 2) * pr; w[2] = rx * (1 + pad) * pr; w[3] = ry * (1 + pad) * pr;
      } else if (win) {
        const pr = cssPr || 1, r = ARM_SEE.radiusFrac * Math.min(cssW, cssH) * pr, w = overBrainWinUniform.value;
        w[0] = (cssW / 2) * pr; w[1] = (cssH / 2) * pr; w[2] = r; w[3] = r;
      }
    }
    // R5-scene (D19): the mirror body is tinted where the brain's drawn outline covers it (behind the glass).
    {
      const on = mirrorRoot.visible && regionMode && brainTransformSet && brainOverlayOk && cssW > 0 && cssH > 0;
      behindGlass.amount = on ? 1 : 0;
      bgUniform.value.x = behindGlass.amount;
      if (on) {
        const b = brainBoundsPx, pr = cssPr || 1;
        bgWinUniform.value.set(((b.x0 + b.x1) / 2) * pr, (cssH - (b.y0 + b.y1) / 2) * pr, ((b.x1 - b.x0) / 2) * pr, ((b.y1 - b.y0) / 2) * pr);
      }
    }
    // R5-scene (D17): glow links and rims for this frame (cheap; glowLinkState().cpuMs).
    updateGlow(dtMs);
    // R4-integrator (D5 glass fix): view-space rigid normal matrix and far-eye centre for the glass rim (K > 1 only).
    if (farEyeView.rot && farEyeView.pw && farEyeView.K > 1) {
      camera.updateMatrixWorld(true);
      const v = camera.matrixWorldInverse.elements, R = farEyeView.rot, nm = farEyeRigidN.value.elements, pw = farEyeView.pw;
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) nm[3 * c + r] = v[r] * R[3 * c] + v[4 + r] * R[3 * c + 1] + v[8 + r] * R[3 * c + 2];
      farEyeVec.value.set(v[0] * pw[0] + v[4] * pw[1] + v[8] * pw[2] + v[12], v[1] * pw[0] + v[5] * pw[1] + v[9] * pw[2] + v[13],
        v[2] * pw[0] + v[6] * pw[1] + v[10] * pw[2] + v[14], farEyeView.K);
    } else farEyeVec.value.w = 0;
    // Camera-range enforcement belongs to active held manipulation, not a released world-fixed object.
    if (mirror.carryHeldAtReconcile === true && mirror.worldCentre && mirrorRoot.visible) {
      const envelope = currentMirrorEnvelope();
      if (!(envelope.minCameraDepthM >= camera.near && envelope.maxCameraDepthM <= camera.far)) fail('scene_input', 'current full mirror geometry violates camera range; ordinary pose remains unresolved');
    }
    renderer.render(scene, camera);
    renderFaceLayer();
    lastRenderCpuMs = nowMs() - now;
  }

  /** Second pass for the face layer: 'ghost' with the main camera, depth-tested against the main frame (the arm in
   * front still hides it); 'inset' with the inset camera in a scissored, cleared box. */
  function renderFaceLayer() {
    if (!(faceAmount > 0) || !faceGroup.visible || faceMode === 'off') return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    try {
      if (faceMode === 'ghost') {
        renderer.render(faceScene, camera);
      } else if (faceMode === 'inset' && cssW > 0 && cssH > 0 && typeof renderer.setScissor === 'function') {
        const r = insetRect();
        const y = cssH - r.y - r.size; // WebGL viewport origin: bottom left
        insetCamera.aspect = 1;
        insetCamera.updateProjectionMatrix();
        renderer.setScissorTest(true);
        renderer.setScissor(r.x, y, r.size, r.size);
        renderer.setViewport(r.x, y, r.size, r.size);
        const prev = typeof renderer.getClearColor === 'function' ? renderer.getClearColor(insetPrevColor) : null;
        const prevAlpha = typeof renderer.getClearAlpha === 'function' ? renderer.getClearAlpha() : 1;
        renderer.setClearColor(FACE_LAYER.inset.background, 1);
        renderer.clear(true, true, false);
        renderer.render(faceScene, insetCamera);
        if (prev) renderer.setClearColor(prev, prevAlpha);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, cssW, cssH);
      }
    } finally {
      renderer.autoClear = auto;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    if (hudMo) { try { hudMo.disconnect(); } catch { /* gone */ } }
    if (hudRo) { try { hudRo.disconnect(); } catch { /* gone */ } }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    for (const set of Object.values(arrowSets)) if (set.rig) { try { set.rig.dispose(); } catch { /* gone */ } }
    for (const d of disposables.splice(0)) d.dispose();
    renderer.dispose();
  }

  return {
    objects: {
      renderer, scene, camera, armGroup, brainGroup, bones, muscles, glass, glassDepth, markers, get strip() { return strip; },
      /** R5-scene: the eye (the arm hangs on it), the mirror body groups, the 3D arrow sets and the two glow-link meshes. */
      eyeRig, mirrorRoot, mirrorBodyGroup, mirrorArmGroup, arrowSets, glowMeshes: { own: glowOwn.mesh, mirror: glowMirror.mesh },
      get mirror() { return mirror; },
      glassXray,
      materials: { bone: boneMaterial, glass: glassMaterial, glassDepth: glassDepthMaterial, glassXray: glassXrayMaterial },
      /** applied: null until the first glass compile, then whether the fresnel hook was found (Root's browser check). */
      glassRim,
      /** A2-render R1: { applied (null until the strip compiles, then whether the shader hooks were found), shimmer,
       * reducedMotion }. applied === false means the CPU vertex-colour fallback is drawn. */
      stripShader,
      /** A2-render R1: { applied (null until an arm material compiles), mode ('auto' or 0..1), amount (current 0..1) }. */
      armGhost: armGhostState,
      /** A2-render R1: the glass x-ray mode, whether the front-to-back depth sort is installed, and the adaptive
       * pixel-ratio state ({ level, cap, smoothMs, ... } or null when disabled). */
      glassXrayMode,
      transparentSortApplied,
      /** R5-scene: { applied (null until a lit region / strip compiles, then whether the rigid-normal hook was found), view
       * (whether the far-eye view-vector line was found), materials }. */
      stripRelief,
      /** R5-scene (D17): { applied (null until a glowing material compiles, then whether the rim hook was found), materials }. */
      glowRim,
      /** R4-scene: the quality state (qualityState(); replaces the A2 adaptive pixel-ratio state). */
      get pixelRatioState() { return qualityState(); },
      /** U2b-scene: region records { id, region, material, meshes, depthMeshes, outline, activity, activated, hovered,
       * opacity }, the full-body records { id, mesh, part, kind, material, face }, the body and face groups, the
       * overlay element and the face scene. */
      regions, regionMeshes, groupOutlines, body, bodyGroup, faceGroup, faceScene, overlay, unassignedGlass,
      /** { applied (null until a torso material compiles), amount (0..1), target, smooth: true, depthPrePass } of the
       * R3-scene smooth torso translucency (BODY_TRANSLUCENT). */
      torsoSeeThrough: torsoGhost,
      get segmentation() { return segmentation; }
    },
    measure,
    resize,
    setView, setEyePosition, setReferenceOrigin,
    setArm,
    setBrain,
    setPlacement,
    updatePose,
    appliedArmPose,
    appliedHandPose,
    appliedHandRenderState,
    foregroundSurfaceTrace,
    updateMuscles,
    updateStrip,
    highlightMarker,
    setArmGhost,
    setShimmer,
    raycastBrain,
    projectWorld,
    render,
    get contextLost() { return lost; },
    dispose,
    // U2b-scene (ns-app SCENE_HOOKS)
    setBrainTransform,
    updateRegions,
    brainOrientationAnchors,
    setInfo,
    setBody,
    setBodyFrame,
    updateBody,
    bodyVisibility,
    setFaceView,
    orbitArrowAt,
    hoverOrbitArrow,
    setOrbitHandler,
    setLabelAvoid,
    setOrientationRects,
    overlayObstacles,
    // R4-scene
    setArmEnvelope,
    setBrainHeld,
    setGuideGoal,
    setQuality,
    brainCoversRect,
    motorCoversRect,
    qualityState,
    setBrainDistanceScale,
    // R5-scene (round 5: D16 arrows, D17 glow, D18 third person, D19 mirror body; round5/R5-scene-NOTES.md)
    pickArrows,
    setArrowHover,
    arrowsState,
    cachedArrowsState,
    setGlowLinks,
    glowLinkState,
    setCameraPose,
    cameraState,
    setMirrorView,
    /** R5-mirror's name for it (round5/R5-mirror-NOTES.md 4.1: scene.setMirror(NM.mirrorTransform(state))). */
    setMirror: setMirrorView,
    mirrorState,
    mirrorPartAt, graspTargetAt, reconcileMirrorCarry,
    mirrorPlacementNow,
    bodyKeepOut,
    // R5-integrate-core (D15): the Body Worlds layer labels of the body's muscle meshes, and the lifted left arm.
    setBodyLayers,
    setArmLayers,
    get regionMode() { return regionMode; },
    /** Plain-JSON state of the U2b-scene features (QA / tests). */
    sceneState() {
      return {
        regionMode, brainTransformSet, regions: regions.length, hoveredRegionId, gazeOnRegion,
        activatedRegionIds: regions.filter(r => r.activated >= 1).map(r => r.id),
        // R5-scene (D16): the brain's 3D arrows on screen (x, y: a good point to click, on the outer bend), as in round 4;
        // arrows3d has both sets (brain, mirror) with boxes, distances and materials.
        arrows: arrowsShown && arrowLayout ? Object.fromEntries(ARROW_DIRS.map(d => { const c = arrowSets.brain.clicks[d]; return [d, { x: c ? Math.round(c[0]) : null, y: c ? Math.round(c[1]) : null, clamped: false, usable: Boolean(arrowLayout[d]) }]; })) : null,
        arrows3d: arrowsState(),
        mirror: mirrorState(),
        glow: glowLinkState(),
        camera: cameraState(),
        stripRelief: { ...stripRelief },
        overBrain: { amount: overBrain.amount, mode: overBrain.mode || 'off' },
        glassRead: { ...glassRead },
        // R4-scene: quality (D8), camera range, the brain distance factor (QA hook) and the player's arm shapes as the scene
        // last received them (viewport fractions).
        quality: qualityState(),
        held: { target: heldCue.target, amount: Math.round(heldCue.amount * 1000) / 1000 },
        hudRects: { mode: hudMo ? 'observers' : 'poll', reads: hudReads, msTotal: Math.round(hudReadMs * 100) / 100 },
        leftArmRim: { ...leftArmRim },
        cameraRange: { near: camera.near, far: camera.far, brainNearM: cameraRange.brainNearM, brainFarM: cameraRange.brainFarM, mirrorFarM: cameraRange.mirrorFarM, brainDistanceScale: brainDistK },
        armShapes: labelAvoid ? { rects: labelAvoid.rects.map(r => [r.x0, r.y0, r.x1, r.y1].map(v => Math.round(v * 1e4) / 1e4)), ellipses: labelAvoid.ellipses.map(e => [e.cx, e.cy, e.rx, e.ry].map(v => Math.round(v * 1e4) / 1e4)) } : null,
        arrowHover: hoverDir, mirrorArrowHover: arrowHover && arrowHover.target === 'mirror' && !arrowHover.blocked ? arrowHover.dir : null, brainBoundsPx: arrowsShown ? { ...brainBoundsPx } : null,
        markDots: [...markDots].map(([id, d]) => ({ id, shown: d.shown, small: d.small, areaPx: d.area, left: d.x, top: d.y })),
        labels: labelEls.map((L, i) => ({ text: L.group.text, display: L.display ? `${L.display.main}${L.display.sub ? ` / ${L.display.sub}` : ''}` : null, shown: L.last.shown, left: L.last.left, top: L.last.top, w: labelBoxes[i] ? labelBoxes[i].w : null, h: labelBoxes[i] ? labelBoxes[i].h : null, faded: L.last.faded === true, side: labelItems[i] && labelItems[i].side ? { ...labelItems[i].side } : null })),
        info: info ? { shown: !info.panel.hidden } : null,
        body: { meshes: body.length, face: body.filter(b => b.face).length, facePacket: facePacketMeshes, layers: bodyLayerInfo ? { ...bodyLayerInfo } : null, frame: bodyFrameSource, eyeBp: eyeBp.slice(), bodyYaw },
        face: { mode: faceMode, amount: faceAmount, visible: faceGroup.visible }
      };
    }
  };
}

/* ------------------------------------------------------------------ HUD (DOM, textContent only) */

/** Text slots the HUD renders (see ns-app hudStatic / hudFrame). */
export const HUD_SLOTS = Object.freeze([
  'banner', 'error', 'title', 'status', 'gaze', 'note', 'pulse', 'trigger', 'space', 'reach', 'drivesTitle', 'frame',
  'legendLabel', 'legendLo', 'legendHi', 'markerNote',
  'qualifier', 'control', 'simulated', 'orientation', 'limitsShort', 'rights', 'detailsSummary', 'hint', 'unmapped', 'gaps',
  'attribution',
  // A2-render R1 (appended): the label next to the crosshair and the region/legend note under the legend bar.
  'hover', 'regionNote',
  // R4-text (D7): the "Try this" guide line in the status card.
  'guide'
]);
/** Always-visible note under the legend bar (A2-render R1): what the region tints, the bright spot and the shimmer
 * mean. render({ regionNote }) may replace it; empty text restores this default (it is never hidden). */
export const HUD_REGION_NOTE = NS_TEXT.LEGEND.tintNote;
/** The hover label shown next to the crosshair when render() receives no explicit `hover` text: derived from a
 * `gaze` text of the form 'Gaze: <markerLabel text>' (ns-brain markerLabel texts end with '(representative)'). */
export function hoverTextFromGaze(gaze) {
  const m = typeof gaze === 'string' ? /^Gaze:\s*(.+\(representative\))\s*$/.exec(gaze) : null;
  return m ? m[1] : '';
}
/** The band's projected box (viewport fractions) from projectWorld output of ns-brain orientationAnchorsForBand: the
 * primary left/right anchors sit just outside the band's left/right edges and anterior/posterior just above/below it.
 * null unless all four are finite and in front of the camera. */
export function bandRectFromAnchors(projected) {
  if (!projected) return null;
  const k = ['left', 'right', 'anterior', 'posterior'].map(n => projected[n]);
  if (!k.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.front !== false)) return null;
  const r = { x0: k[0].x, x1: k[1].x, y0: k[2].y, y1: k[3].y };
  return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
}
/** Wide layout: always visible in the notice panel, as one compact paragraph under the legend. */
export const HUD_NOTICE_SLOTS = Object.freeze(['markerNote', 'qualifier', 'control', 'simulated', 'orientation']);
/** Inside <details> (existing pointer-events: auto): attribution, unmapped muscles and gaps. Controls stay in the visible legend. */
export const HUD_DETAIL_SLOTS = Object.freeze(['attribution', 'unmapped', 'gaps']);
/** Licence and source links shown in the 'Sources and rights' details (round-2 fix SCI-6; same URIs as ns-assets
 * LICENCE_LINKS, kept here so the scene does not import the asset loader). */
export const HUD_LICENCE_LINKS = Object.freeze([
  Object.freeze(['Licence: CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/']),
  Object.freeze(['BodyParts3D licence page (DBCLS)', 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html']),
  Object.freeze(['BodyParts3D source', 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html'])
]);
/** Historical textContent mirrors remain in the details DOM for slot compatibility. Primary notices and the
 * crown/tint note now remain visible in every layout; no required text relies on these hidden mirrors. */
export const HUD_MIRRORED_SLOTS = Object.freeze(['note', ...HUD_NOTICE_SLOTS]);
export const HUD_DETAILS_SUMMARY = NS_TEXT.LEGEND.detailsSummary;
/** Polish: the colour key under the activity legend (plain words, ns-text LEGEND.key rows [class, long, short]). One
 * swatch per on-brain cue, so the brain colours, the muscle colours and the activation marks are explained in one place. */
export const HUD_LEGEND_KEY = Object.freeze(NS_TEXT.LEGEND.key.map(r => Object.freeze([r[0], r[1], r[2]])));
export const HUD_LEGEND_SHARED = NS_TEXT.LEGEND.shared;
/** Always-visible simulated/representative limits notice. It wraps at a fixed readable font size.
 * The nominal top margin comes from the unchanged arm-fit setting; actual glyph/hand clearance is unverified. */
export const HUD_LIMITS_SHORT = NS_TEXT.HUD.limitsShort;
/** Nominal arm-fit margin, retained unchanged. HUD placement also considers the measured notice height;
 * neither this constant nor the approximate arm-avoid shapes prove actual whole-hand pixel bounds. */
export const ESSENTIAL_BAND = ARM_DEFAULTS.marginNdc / 2;
export const ORIENTATION_KEYS = Object.freeze(['right', 'left', 'anterior', 'posterior']);
const DRIVE_LINES = 5;
const PANEL_MEASURE_EVERY = 10; // placeOrientation calls between panel-rectangle reads (layout reads are not free)
/** R3-polish: the status card keeps one home (top left) and moves only away from the hand (to the bottom left). */
export const STATUS_CARD_HOME = true;
/** R3-fix: the status card's planned height (CSS px) for a view size: columnVh of the height in the landscape layouts
 * (the idle card is about 20 %, a card with every transient line about 33 % at 1280x720), portraitVh (at least
 * portraitMinPx) for the full-width portrait strip (idle about 7 %, with every line about 9 % at 720x1280). Pure. */
/* R4-integrator: on NARROW portrait screens (width <= narrowMaxPx) the strip's lines wrap more and the "Try this" guide
 * line adds two more; at 390x844 the card with the guide measured 164 px (run-R4-integrator-2-shots), over the 140 px
 * plan, so the plan there is at least narrowMinPx (R4-text's proposed 185). ns-app keeps the portrait brain below this
 * planned box (brainUsableNdc), as it keeps it above the bottom band. */
// R4-fix (review RP2): on narrow portrait screens the card no longer shows the "Looking at" line (the bottom panel
// names what you look at) or the brand words (the model-name line stays), so it ends above the left hand at three
// quarters up (390x844: hand top about y 180). The plan keeps room for one or two transient lines: 185 -> 150 px.
export const STATUS_CARD_PLAN = Object.freeze({ columnVh: 0.37, portraitVh: 0.11, portraitMinPx: 140, narrowMaxPx: 600, narrowMinPx: 150 });
export function statusCardPlanPx(width, height, portrait = width / height < 1, o = STATUS_CARD_PLAN) {
  const minPx = Number.isFinite(o.narrowMaxPx) && width <= o.narrowMaxPx ? o.narrowMinPx : o.portraitMinPx;
  return portrait ? Math.max(minPx, Math.round(o.portraitVh * height)) : Math.round(o.columnVh * height);
}
const clampFraction = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Planned HUD geometry in CSS px. Cards keep a readable font and content; measured sizes supersede these
 * estimates. Edge placement may be space-limited in a small viewport. No text is shrunk, faded or silently
 * hidden to manufacture clearance. All poses/aspects still require native visual and full-hand acceptance.
 */
export const HUD_LAYOUT = Object.freeze({
  gap: 12,
  compactAspect: 1.45,
  portraitAspect: 1,
  wide: Object.freeze({ colPx: 300, colVw: 26, infoPx: 300, noticePx: 370 }),
  shortHeight: Object.freeze({ maxPx: 600, infoPx: 300 }),
  compact: Object.freeze({ colPx: 250, colVw: 30, infoPx: 340, noticePx: 460 }), // A2-render R1: narrower (CSS mirror)
  portrait: Object.freeze({ infoPx: 320, noticePx: 400, noticeWPx: 320, noticeWVw: 86 }),
  label: Object.freeze({ sideW: 150, sideShortW: 48, axisW: 104, h: 24, shortBelowAspect: 1, pxPerChar: 7.4, padPx: 4 }),
  essential: Object.freeze({ fontPx: 12, lineHeight: 1.3, padY: 2, padX: 6, charEm: 0.55, colGapPx: 8 })
});

/** Planning estimate only; actual wrapping and fallback-font glyph sizes must be checked in the browser. */
export function essentialNoticeRect({ width, height } = {}, text = HUD_LIMITS_SHORT) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) fail('scene_hud', 'width and height must be positive');
  const E = HUD_LAYOUT.essential, fontPx = E.fontPx;
  const natural = String(text).length * E.charEm * fontPx + 2 * E.padX;
  const w = Math.min(natural, Math.max(1, width - 2 * HUD_LAYOUT.gap));
  const lines = Math.max(1, Math.ceil(natural / w)), h = E.lineHeight * fontPx * lines + 2 * E.padY;
  return { x0: (width - w) / 2, y0: 0, x1: (width + w) / 2, y1: h, fontPx, bandPx: ESSENTIAL_BAND * height };
}

/** Orientation label alignment: the fraction of the label box left of / above its anchor (CSS translate). Each label
 * extends away from the band: R to the right, L to the left, anterior upward, posterior downward. */
/** Polish: orientation-label edge clearances (px): below the top limits line, above the bottom hint toast, and the
 * centre-ward nudge used when no projected anchor is clear. */
/** R4-polish: an orientation label moves to a better clear place after this many placeOrientation calls in a row. */
export const ORIENT_UPGRADE_FRAMES = 12;
export const ORIENTATION_EDGE = Object.freeze({ topGapPx: 6, bottomPx: 46, nudgePx: 24, nudgeSteps: 20, axisNudgeSteps: 4 });
export const ORIENTATION_ALIGN = Object.freeze({
  right: Object.freeze([0, 0.5]), left: Object.freeze([1, 0.5]), anterior: Object.freeze([0.5, 1]), posterior: Object.freeze([0.5, 0])
});

/** HUD layout class for a viewport aspect. */
export function hudLayoutFor(aspect) {
  const L = HUD_LAYOUT;
  return aspect < L.portraitAspect ? 'portrait' : aspect < L.compactAspect ? 'compact' : 'wide';
}

/** Planned panel rectangles { x0, y0, x1, y1 } (px, origin top left) for a viewport, plus the layout class. */
export function hudPlannedRects({ width, height } = {}) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) fail('scene_hud', 'width and height must be positive');
  const L = HUD_LAYOUT, g = L.gap, layout = hudLayoutFor(width / height);
  const top = Math.max(ESSENTIAL_BAND * height, essentialNoticeRect({ width, height }).y1) + L.essential.colGapPx;
  if (layout === 'portrait') {
    const P = L.portrait, wn = Math.min(P.noticeWPx, (P.noticeWVw / 100) * width);
    return { layout, info: { x0: g, y0: top, x1: width - g, y1: top + P.infoPx }, notice: { x0: width - g - wn, y0: height - g - P.noticePx, x1: width - g, y1: height - g } };
  }
  const C = L[layout], w = Math.min(C.colPx, (C.colVw / 100) * width);
  const infoPx = layout === 'wide' && height <= L.shortHeight.maxPx ? L.shortHeight.infoPx : C.infoPx;
  // U2b-scene: the far-right column belongs to the information overlay (infoPanelRect), so the HUD cards default to
  // the LEFT edge (they still move to a clear edge slot at run time).
  return {
    layout,
    info: { x0: g, y0: top, x1: g + w, y1: top + infoPx },
    notice: { x0: g, y0: height - g - C.noticePx, x1: g + w, y1: height - g }
  };
}

/** Planned orientation-label box (px) for a label anchored at viewport fractions (fx, fy). */
export function orientationLabelRect(key, fx, fy, { width, height }) {
  const base = String(key).split('.')[0];
  const a = ORIENTATION_ALIGN[base];
  if (!a) fail('scene_hud', `unknown orientation label ${key}`);
  const side = base === 'right' || base === 'left';
  const short = width / height < HUD_LAYOUT.label.shortBelowAspect;
  const w = side ? (short ? HUD_LAYOUT.label.sideShortW : HUD_LAYOUT.label.sideW) : HUD_LAYOUT.label.axisW, h = HUD_LAYOUT.label.h;
  const x = fx * width, y = fy * height;
  return { x0: x - a[0] * w, y0: y - a[1] * h, x1: x + (1 - a[0]) * w, y1: y + (1 - a[1]) * h };
}

/* ------------------------------------------------------------------ arm avoidance (pure) */

/** HUD avoidance sizes (m): the hand is the box around its segment-box centroids padded by handPadM; the forearm and
 * upper arm are capsules of these radii (the rendered forearm is ~0.038 m in radius in the R3 diagnostic). */
export const ARM_AVOID = Object.freeze({ handPadM: 0.025, forearmRadiusM: 0.04, upperArmRadiusM: 0.05, minDepthM: 0.06, samples: 9 });

/**
 * Screen regions of the posed arm for HUD avoidance, in viewport fractions (x right, y down): the hand/digit fit boxes'
 * projected bounding box (fit.cornersNdc of the hand and digit segments) padded, plus ellipses sampled along the forearm (wrist -> elbow) and upper
 * arm (elbow -> shoulder) capsules from fit.solution.wristCam / elbowCam. Points closer than minDepthM (the shoulder is
 * behind the camera) are skipped. An approximation for placing HUD text, not a tissue bound.
 * @returns {{ rects: Array<{x0,y0,x1,y1}>, ellipses: Array<{cx,cy,rx,ry}> }}
 */
export function armAvoidShapes(fit, { aspect, fovYDeg = CAMERA.fovYDeg, shoulderCam = [-0.19, -0.24, 0.04], options = ARM_AVOID } = {}) {
  const out = { rects: [], ellipses: [] };
  if (!fit || !(Number.isFinite(aspect) && aspect > 0)) return out;
  const t = Math.tan((fovYDeg * Math.PI) / 360), ta = t * aspect, o = { ...ARM_AVOID, ...options };
  // HUD estimate only: use the centroids of the unchanged hand/digit fit boxes plus handPadM.
  // This is not the actual tissue silhouette or an all-pose containment proof. The underlying fit-box
  // corners, rig, viewport and hand-bound calculations are not changed by this visual candidate.
  const groups = new Map();
  for (const c of Array.isArray(fit.cornersNdc) ? fit.cornersNdc : []) {
    if (!c || !(c.depth > 0) || !Number.isFinite(c.x) || !Number.isFinite(c.y) || !SEGMENTS.includes(c.segment) || c.segment === 'forearm' || c.segment === 'upperarm') continue;
    if (!groups.has(c.segment)) groups.set(c.segment, []);
    groups.get(c.segment).push(c);
  }
  if (groups.size) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, dMin = Infinity;
    for (const list of groups.values()) {
      let x = 0, y = 0, d = 0;
      for (const c of list) { x += c.x / list.length; y += c.y / list.length; d += c.depth / list.length; }
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); dMin = Math.min(dMin, d);
    }
    const px = o.handPadM / (dMin * ta), py = o.handPadM / (dMin * t);
    out.rects.push({ x0: (x0 - px + 1) / 2, x1: (x1 + px + 1) / 2, y0: (1 - (y1 + py)) / 2, y1: (1 - (y0 - py)) / 2 });
  }
  const sol = fit.solution || {};
  const segment = (a, b, r) => {
    if (!a || !b || a.length !== 3 || b.length !== 3) return;
    for (let i = 0; i < o.samples; i++) {
      const s = i / (o.samples - 1);
      const P = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
      const d = -P[2];
      if (!(d >= o.minDepthM)) continue;
      out.ellipses.push({ cx: (P[0] / (d * ta) + 1) / 2, cy: (1 - P[1] / (d * t)) / 2, rx: r / (d * ta) / 2, ry: r / (d * t) / 2 });
    }
  };
  segment(sol.wristCam, sol.elbowCam, o.forearmRadiusM);
  segment(sol.elbowCam, shoulderCam, o.upperArmRadiusM);
  return out;
}

const boxesOverlap = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
/** True when box b (fractions) intersects any avoid rect or ellipse. */
export function hitsAvoid(b, avoid) {
  if (!avoid) return false;
  for (const r of avoid.rects || []) if (boxesOverlap(b, r)) return true;
  for (const e of avoid.ellipses || []) {
    if (!(e.rx > 0 && e.ry > 0)) continue;
    const dx = Math.max(b.x0 - e.cx, 0, e.cx - b.x1) / e.rx, dy = Math.max(b.y0 - e.cy, 0, e.cy - b.y1) / e.ry;
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}

/**
 * Build the HUD inside hudRoot (which must overlay the canvas exactly). pointer-events are disabled on the HUD so
 * clicks reach the canvas; only <details> (attribution, licence/source notes and coverage gaps) takes pointer
 * events, as before. Controls are in the visible legend. render(model) writes the given slots
 * (textContent only, skipping unchanged text; empty text hides the element); placeOrientation(projected, size, avoid)
 * positions cards/labels using approximate arm-avoid shapes; no blanket opacity fade is applied.
 */
export function createHud(hudRoot) {
  if (!hudRoot || typeof hudRoot.appendChild !== 'function' || !hudRoot.ownerDocument || typeof hudRoot.ownerDocument.createElement !== 'function') {
    fail('scene_hud', 'hudRoot must be an element that belongs to a document');
  }
  const doc = hudRoot.ownerDocument;
  const make = (tag, className, parent) => {
    const e = doc.createElement(tag);
    e.className = className;
    parent.appendChild(e);
    return e;
  };
  // The HUD overlays the canvas; clicks must reach the canvas (pointer lock, click re-trigger).
  if (hudRoot.style) hudRoot.style.pointerEvents = 'none';
  const root = doc.createElement('div');
  root.className = 'ns-hud';
  if (root.style) root.style.pointerEvents = 'none';
  hudRoot.appendChild(root);

  const slots = {};
  slots.banner = make('div', 'ns-banner', root);
  slots.error = make('div', 'ns-error', root);
  slots.error.setAttribute('role', 'alert');
  // A2-render R1: both start hidden; an empty padded error box used to sit over the crosshair until an error arrived.
  slots.banner.hidden = true;
  slots.error.hidden = true;

  // Two independently placed cards; their initial edge positions are supplied by CSS.
  const col = make('div', 'ns-hud-col', root);
  const info = make('section', 'ns-panel ns-panel-info', col);
  for (const k of ['title', 'guide', 'status', 'gaze', 'note', 'pulse', 'trigger', 'space', 'reach', 'drivesTitle']) {
    slots[k] = make('div', `ns-slot ns-slot-${k}`, info);
  }
  slots.status.setAttribute('aria-live', 'polite');
  // R4-integrator (D7): the "Try this" guide line is found by data-ns-guide (e2e S39).
  slots.guide.setAttribute('data-ns-guide', '');
  // R4-fix (code review M3): the visible line can move (card <-> chip) or step aside for a frame; a screen reader hears
  // the goal from this hidden copy, which changes only when the goal's words change (not on "Nice!", a move or a hide).
  // (Its class avoids the word "guide": it is not the visible line.)
  const guideLive = make('div', 'ns-sr-only ns-tip-live', info);
  guideLive.setAttribute('aria-live', 'polite');
  let guideSpoken = '';
  const drivesList = make('ol', 'ns-drives', info);
  const driveItems = [];
  for (let i = 0; i < DRIVE_LINES; i++) driveItems.push(make('li', 'ns-drive', drivesList));
  slots.frame = make('div', 'ns-slot ns-slot-frame', info);

  const legend = make('section', 'ns-panel ns-panel-legend', col);
  slots.legendLabel = make('div', 'ns-slot ns-slot-legendLabel', legend);
  const bar = make('div', 'ns-legend-bar', legend);
  // A2-render R1: the default legend is generated from the same ramp function as the strip glow (ns-brain colormap);
  // render({ legendStops }) still replaces it.
  if (bar.style) bar.style.background = legendGradientCss(9);
  const ends = make('div', 'ns-legend-ends', legend);
  slots.legendLo = make('span', 'ns-legend-lo', ends);
  make('span', 'ns-legend-mid', ends).textContent = HUD_LEGEND_SHARED;
  slots.legendHi = make('span', 'ns-legend-hi', ends);
  const legendKey = make('ul', 'ns-legend-key', legend);
  for (const [cls, text, short] of HUD_LEGEND_KEY) {
    const li = make('li', `ns-legend-item ns-legend-item-${cls}`, legendKey);
    make('span', 'ns-legend-swatch', li);
    make('span', 'ns-legend-text', li).textContent = text;
    make('span', 'ns-legend-short', li).textContent = short; // narrow (portrait) layouts show the short words
  }
  const regionNote = make('div', 'ns-slot ns-slot-regionNote', legend);
  regionNote.textContent = HUD_REGION_NOTE;
  slots.regionNote = regionNote;
  const notices = make('div', 'ns-notices', legend);
  for (const k of HUD_NOTICE_SLOTS) slots[k] = make('div', `ns-slot ns-slot-${k}`, notices);
  slots.hint = make('div', 'ns-slot ns-slot-hint', legend); // controls stay visible at the same readable font
  const rightsRow = make('div', 'ns-rights', legend);
  slots.rights = make('span', 'ns-slot ns-slot-rights', rightsRow);
  const details = make('details', 'ns-details', rightsRow);
  if (details.style) details.style.pointerEvents = 'auto'; // the one interactive HUD element
  slots.detailsSummary = make('summary', 'ns-slot ns-slot-detailsSummary', details);
  slots.detailsSummary.textContent = HUD_DETAILS_SUMMARY;
  const detailsBody = make('div', 'ns-details-body', details);
  const detailsLimits = make('div', 'ns-details-limits', detailsBody);
  const mirrors = {};
  for (const k of HUD_MIRRORED_SLOTS) { mirrors[k] = make('div', `ns-mirror ns-mirror-${k}`, detailsLimits); mirrors[k].hidden = true; }
  for (const k of HUD_DETAIL_SLOTS) slots[k] = make('div', `ns-slot ns-slot-${k}`, detailsBody);
  // Round-2 fix SCI-6: the licence and source as real links (the attribution text above also carries the URIs).
  const links = make('div', 'ns-details-links', detailsBody);
  for (const [text, href] of HUD_LICENCE_LINKS) {
    const a = make('a', 'ns-details-link', links);
    a.textContent = text;
    if (typeof a.setAttribute === 'function') { a.setAttribute('href', href); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
  }

  // Essential limits remain outside movable cards, never faded or hidden; fixed-size text may wrap.
  // Its measured height informs HUD placement, without changing camera or hand-fit geometry.
  const essential = make('div', 'ns-slot ns-slot-limitsShort ns-essential', root);
  essential.textContent = HUD_LIMITS_SHORT;
  slots.limitsShort = essential;

  const cross = make('div', 'ns-crosshair', root);
  make('span', 'ns-crosshair-h', cross);
  make('span', 'ns-crosshair-v', cross);
  // A2-render R1: label of the control region under the crosshair (explicit `hover` text, else derived from `gaze`).
  const hover = make('div', 'ns-hover', root);
  let hoverTransform = '';
  hover.hidden = true;
  slots.hover = hover;
  let hoverExplicit = false;

  const orient = {};
  const orientSize = {};
  const orientText = {};
  const orientPick = {};
  const orientUpgrade = {}; // R4-polish: calls in a row that a better place for each label was clear
  for (const k of ORIENTATION_KEYS) {
    orient[k] = make('div', `ns-orient ns-orient-${k}`, root);
    orient[k].hidden = true;
    orientSize[k] = null;
    orientText[k] = { long: '', short: '', shortWanted: false };
    orientPick[k] = k;
  }
  const showOrientText = (k, useShort) => {
    const t = orientText[k];
    const v = useShort && t.short !== '' ? t.short : t.long;
    if (orient[k].textContent !== v) { orient[k].textContent = v; orientSize[k] = null; }
  };
  const setClass = (el, cls) => { if (el.className !== cls) el.className = cls; };

  function setText(el, value) {
    const v = value === null || value === undefined ? '' : String(value);
    if (el.textContent !== v) el.textContent = v;
    const hide = v === '';
    if (el.hidden !== hide) el.hidden = hide;
  }

  function render(model) {
    if (!model) return;
    for (const key of Object.keys(model)) {
      const v = model[key];
      if (key === 'drives') {
        for (let i = 0; i < driveItems.length; i++) setText(driveItems[i], Array.isArray(v) && i < v.length ? v[i] : '');
      } else if (key === 'legendStops') {
        if (Array.isArray(v) && v.length > 1 && bar.style) bar.style.background = `linear-gradient(to right, ${v.join(', ')})`;
      } else if (key === 'orientationLabels' || key === 'orientationLabelsShort') {
        // Long texts always; short texts (optional) replace R/L in portrait viewports (HUD_LAYOUT.label).
        for (const k of ORIENTATION_KEYS) {
          if (!(v && typeof v[k] === 'string')) continue;
          if (key === 'orientationLabels') orientText[k].long = v[k]; else orientText[k].short = v[k];
          showOrientText(k, orientText[k].shortWanted);
        }
      } else if (key === 'crosshairActive') {
        setClass(cross, v ? 'ns-crosshair ns-crosshair-active' : 'ns-crosshair');
      } else if (key === 'limitsShort') {
        const t = v === null || v === undefined || String(v).trim() === '' ? HUD_LIMITS_SHORT : String(v);
        if (essential.textContent !== t) essential.textContent = t; // never hidden: empty restores the default
        if (essential.hidden) essential.hidden = false;
      } else if (key === 'regionNote') {
        const t = v === null || v === undefined || String(v).trim() === '' ? HUD_REGION_NOTE : String(v);
        if (regionNote.textContent !== t) regionNote.textContent = t; // never hidden: empty restores the default
        if (regionNote.hidden) regionNote.hidden = false;
      } else if (key === 'guideFloat') {
        // R4-integrator (D7): the guide line as a floating chip ({ x, y, w } CSS px) while the brain covers its place in
        // the status card; null / undefined puts it back in the card.
        const g = slots.guide;
        const on = Boolean(v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.w));
        if (g && g.style) {
          setClass(g, on ? 'ns-slot ns-slot-guide ns-guide-float' : 'ns-slot ns-slot-guide');
          const L = on ? `${v.x}px` : '', T = on ? `${v.y}px` : '', Wd = on ? `${v.w}px` : '';
          if (g.style.left !== L) g.style.left = L;
          if (g.style.top !== T) g.style.top = T;
          if (g.style.width !== Wd) g.style.width = Wd;
        }
      } else if (key === 'guide') {
        setText(slots.guide, v);
      } else if (key === 'guideSpoken') {
        // R4-fix (M3): the goal line while the guide is shown (also while the chip has no clear spot), '' when the guide is
        // hidden, paused or finished; "Nice!" is not repeated.
        const said = typeof v === 'string' ? v.replace(/^\S+!\s+/, '').trim() : '';
        if (said !== guideSpoken) { guideSpoken = said; guideLive.textContent = said; }
      } else if (key === 'title' && typeof v === 'string' && v.includes(NsText.HUD.brand) && v !== NsText.HUD.brand) {
        // R4-fix (review RP2): the brand words and the model-name line are two spans, so on phones the card can drop
        // the brand words (CSS) and stay above the left hand; the model-name line (honesty) always shows.
        if (slots.title.textContent !== v) {
          const i = v.indexOf(NsText.HUD.brand);
          slots.title.textContent = '';
          make('span', 'ns-title-brand', slots.title).textContent = v.slice(0, i);
          make('span', 'ns-title-model', slots.title).textContent = v.slice(i);
        }
        if (slots.title.hidden) slots.title.hidden = false;
      } else if (key === 'hover') {
        hoverExplicit = true;
        setText(hover, v);
      } else if (Object.prototype.hasOwnProperty.call(slots, key)) {
        setText(slots[key], v);
        if (mirrors[key]) setText(mirrors[key], v);
        if (key === 'gaze' && !hoverExplicit) setText(hover, hoverTextFromGaze(v));
      }
    }
  }

  // Measure at the existing bounded cadence. Placement uses cached sizes between these reads.
  // The existing arm-avoid shapes are approximate; clear-estimate is not native silhouette proof.
  // A2-render R1: when the window has a ResizeObserver, sizes come from it (delivered after layout), so placement never
  // forces a synchronous layout right after render()'s text writes; otherwise the R3 bounded-cadence reads remain.
  const panelEls = [info, legend];
  let panelRects = null, panelSizes = null, panelPick = [null, null];
  let measureCountdown = 0, sizedFor = '', essentialHeight = 0, placementStatus = '', lastBandRect = null;
  let lastGuideH = 40, lastFloatH = 40; // R4-integrator: last measured heights of the guide line in the card / as a chip
  // U2b-scene: reserve the information overlay's area (default on; hud.reserveInfo(false) releases it).
  let reserveInfo = true, reservedRect = null;
  const RO = doc.defaultView && typeof doc.defaultView.ResizeObserver === 'function' ? doc.defaultView.ResizeObserver : null;
  const observed = new Map(); // element -> [width, height] border-box px (0 x 0 while hidden)
  let ro = null;
  if (RO) {
    try {
      ro = new RO(entries => {
        for (const e of entries) {
          const b = e.borderBoxSize && (e.borderBoxSize[0] || e.borderBoxSize);
          const w = b && Number.isFinite(b.inlineSize) ? b.inlineSize : e.target.offsetWidth;
          const h = b && Number.isFinite(b.blockSize) ? b.blockSize : e.target.offsetHeight;
          observed.set(e.target, [w, h]);
        }
      });
      for (const el of [info, legend, essential, hover, ...ORIENTATION_KEYS.map(k => orient[k])]) ro.observe(el);
    } catch { ro = null; }
  }
  const sizeOf = el => { const v = observed.get(el); return v && v[0] > 0 && v[1] > 0 ? v : null; };
  const orientLast = {};
  for (const k of ORIENTATION_KEYS) orientLast[k] = { placement: '', left: '', top: '' };
  function measurePanels(W, H) {
    const off = el => (Number.isFinite(el.offsetLeft) && Number.isFinite(el.offsetTop) && el.offsetWidth > 0 && el.offsetHeight > 0);
    if (!panelEls.every(off) || !Number.isFinite(col.offsetLeft) || !Number.isFinite(col.offsetTop)) return null;
    return panelEls.map(el => {
      const x = col.offsetLeft + el.offsetLeft, y = col.offsetTop + el.offsetTop;
      return { x0: x / W, y0: y / H, x1: (x + el.offsetWidth) / W, y1: (y + el.offsetHeight) / H };
    });
  }

  function setPanelPos(el, x, y) {
    const sx = Math.round(x) + 'px', sy = Math.round(y) + 'px';
    if (el.style.left !== sx) el.style.left = sx;
    if (el.style.top !== sy) el.style.top = sy;
    if (el.style.right !== 'auto') el.style.right = 'auto';
    if (el.style.bottom !== 'auto') el.style.bottom = 'auto';
  }

  function placePanels(W, H, avoid, handAvoid = { rects: (avoid && avoid.rects) || [], ellipses: [] }, legendTopPx = null) {
    if (!(W > 0 && H > 0)) return;
    const g = HUD_LAYOUT.gap, planned = hudPlannedRects({ width: W, height: H });
    const defaults = [planned.info, planned.notice], placed = [];
    const top = Math.max(ESSENTIAL_BAND * H, essentialHeight || essentialNoticeRect({ width: W, height: H }).y1) + HUD_LAYOUT.essential.colGapPx;
    // U2b-scene: keep clear of the far-right information overlay (or its bottom band in portrait).
    const reserved = reserveInfo ? infoPanelRect({ width: W, height: H }, top) : null;
    if (reserved) placed.push({ x0: reserved.x0 / W, y0: reserved.y0 / H, x1: reserved.x1 / W, y1: reserved.y1 / H });
    // Polish: the legend's fixed slot under the information column is reserved before the status card is placed.
    let legendSlot = null;
    if (reserved && reserved.layout === 'column' && legend.style) {
      const d = defaults[1], size = panelSizes && panelSizes[1];
      const w = size ? size[0] : d.x1 - d.x0, h = size ? size[1] : d.y1 - d.y0;
      // R3-fix (review M6): in body views the information panel is a short card, so the legend docks right under it
      // (legendTopPx) instead of at the bottom-right corner, where the right arm and shoulder are seen.
      const y = Number.isFinite(legendTopPx) && legendTopPx > reserved.y0 && legendTopPx < reserved.y1 ? legendTopPx : reserved.y1 + g, x = Math.max(g, reserved.x1 - w);
      if (w <= reserved.x1 - reserved.x0 + 1 && y + h <= H - g / 2) {
        legendSlot = { x, y };
        placed.push({ x0: x / W, y0: y / H, x1: (x + w) / W, y1: (y + h) / H });
      }
    } else if (reserved && reserved.layout === 'portrait' && legend.style && panelSizes && panelSizes[1]) {
      // R3-integrator (R3-player item 10): in portrait the legend docks at the top right of the reserved bottom band,
      // above the information panel (which CSS caps to the rest of the band), so it never covers the brain or the hand.
      const [w, h] = panelSizes[1];
      if (w <= reserved.x1 - reserved.x0 + 1 && h <= INFO_PANEL_PORTRAIT_LEGEND_PX) {
        legendSlot = { x: Math.max(g, reserved.x1 - w), y: reserved.y0 };
        placed.push({ x0: legendSlot.x / W, y0: legendSlot.y / H, x1: (legendSlot.x + w) / W, y1: (legendSlot.y + h) / H });
      }
    }
    let limited = false;
    panelEls.forEach((el, i) => {
      if (!el.style) { limited = true; return; }
      const d = defaults[i], size = panelSizes && panelSizes[i];
      const w = size ? size[0] : d.x1 - d.x0, h = size ? size[1] : d.y1 - d.y0;
      // U2b-scene: in portrait the information overlay is a bottom band, so the cards' floor is just above it.
      const floor = reserved && reserved.layout === 'portrait' ? reserved.y0 - g / 2 : H - g;
      const fit = w <= W - 2 * g && h <= floor - top;
      const left = g, right = Math.max(g, W - g - w), bottom = Math.max(top, floor - h);
      const at = (x, y) => ({ x, y, box: { x0: x / W, y0: y / H, x1: (x + w) / W, y1: (y + h) / H } });
      const padded = b => ({ x0: b.x0 - g / (2 * W), y0: b.y0 - g / (2 * H), x1: b.x1 + g / (2 * W), y1: b.y1 + g / (2 * H) });
      const clearPanels = c => !placed.some(r => boxesOverlap(padded(c.box), r));
      const candidates = [];
      // Polish: the legend lives in the far-right column directly under the information panel (colour key next to the
      // explanation), at a fixed place instead of hopping between corners; it is small and translucent, so it does not
      // need to dodge the arm there. Other layouts keep the edge search below.
      if (i === 1 && legendSlot) { panelPick[i] = { x: legendSlot.x, y: legendSlot.y }; setPanelPos(el, legendSlot.x, legendSlot.y); return; }
      // R3-polish (R3-player item 9, INTEGRATION 7.2): the status card has ONE home, the top-left corner (portrait: the
      // top band), so the eye never has to hunt for it. It leaves home only while the player's HAND (not the forearm,
      // the upper arm or the brain band, which may pass under the translucent card) would be under it, e.g. A held far
      // left, and then goes to its one alternate home, the bottom-left corner.
      if (i === 0 && STATUS_CARD_HOME) {
        // Portrait: the card is a full-width top strip and the hand (three quarters up) never reaches it: no alternate.
        const portrait = reserved && reserved.layout === 'portrait';
        // R3-fix (review code F1 / F2, player m7): the card's HOME and ALTERNATE boxes, the hand test and the arrow plan
        // (data-ns-home / data-ns-alt) use a SIZE-STABLE planned card height that depends only on the view size
        // (STATUS_CARD_PLAN: the reviewers' "CSS max height" option), never on the card's current text. So a pulse, a
        // Space release or a long hint that makes the card taller never moves the card or re-plans the world-anchored
        // arrows, whatever happened before.
        const hp = Math.min(statusCardPlanPx(W, H, portrait), Math.max(h, floor - top));
        const atP = (x, y) => ({ x, y, box: { x0: x / W, y0: y / H, x1: (x + w) / W, y1: (y + hp) / H } });
        const home = atP(left, top), alt = portrait ? home : atP(left, Math.max(top, floor - hp));
        const handClear = c => fit && !hitsAvoid(padded(c.box), handAvoid) && clearPanels(c);
        const use = handClear(home) ? home : handClear(alt) ? alt : home;
        if (!handClear(use)) limited = true;
        const box = q => `${Math.round(q.x)},${Math.round(q.y)},${Math.round(q.x + w)},${Math.round(q.y + hp)}`;
        if (typeof el.getAttribute === 'function') {
          if (el.getAttribute('data-ns-home') !== box(home)) el.setAttribute('data-ns-home', box(home));
          if (el.getAttribute('data-ns-alt') !== box(alt)) el.setAttribute('data-ns-alt', box(alt));
        }
        panelPick[i] = { x: use.x, y: use.y };
        placed.push(use.box);
        setPanelPos(el, use.x, use.y);
        return;
      }
      if (panelPick[i]) candidates.push(at(clampFraction(panelPick[i].x, left, right), clampFraction(panelPick[i].y, top, bottom)));
      for (const f of i === 0 ? [0, 1, 0.5, 0.25, 0.75] : [1, 0, 0.5, 0.75, 0.25]) {
        candidates.push(at(left, top + f * (bottom - top)), at(right, top + f * (bottom - top)));
      }
      const clear = c => fit && !hitsAvoid(padded(c.box), avoid) && clearPanels(c);
      const chosen = candidates.find(clear);
      // Space-limited fallback retains full-contrast text over a light translucent card. It does not claim clearance.
      const use = chosen || candidates.find(clearPanels) || candidates[0];
      if (!chosen) limited = true;
      panelPick[i] = { x: use.x, y: use.y };
      placed.push(use.box);
      setPanelPos(el, use.x, use.y);
    });
    panelRects = placed;
    reservedRect = reserved;
    const status = limited ? 'limited' : 'clear-estimate';
    if (status !== placementStatus) { root.setAttribute('data-ns-hud-placement', status); placementStatus = status; }
  }

  /** projected anchors and approximate arm-avoid shapes are unchanged. Cards seek clear edge positions;
   * labels retain their existing hemisphere/pole anchors and choose a clear alternate when available.
   * Native tissue/glyph occlusion and all-pose clearance remain unverified; limited cases stay bright.
   * A2-render R1: opts.bandRect (viewport fractions; null = none) is the band's projected box; when omitted it is
   * derived from the projected orientation anchors (bandRectFromAnchors). While the band is looked at (its box
   * contains the crosshair) the cards also avoid it, so the HUD does not cover the strip where space allows. */
  function placeOrientation(projected, size, avoid, opts = {}) {
    const W = size && size.width > 0 ? size.width : 0, H = size && size.height > 0 ? size.height : 0;
    const shortWanted = W > 0 && H > 0 && W / H < HUD_LAYOUT.label.shortBelowAspect;
    const sizeKey = `${W}x${H}`;
    if (sizeKey !== sizedFor) { sizedFor = sizeKey; measureCountdown = 0; panelSizes = null; panelPick = [null, null]; essentialHeight = 0; for (const k of ORIENTATION_KEYS) orientSize[k] = null; } // HUD resize only
    if (ro) {
      const a = sizeOf(info), b = sizeOf(legend), e = sizeOf(essential);
      panelSizes = a && b ? [a, b] : null;
      essentialHeight = e ? e[1] : 0;
    } else if (W > 0 && H > 0 && measureCountdown-- <= 0) {
      const measured = measurePanels(W, H);
      if (measured) panelSizes = measured.map(r => [(r.x1 - r.x0) * W, (r.y1 - r.y0) * H]);
      if (essential.offsetHeight > 0) essentialHeight = essential.offsetHeight;
      measureCountdown = PANEL_MEASURE_EVERY;
    }
    let bandRect = opts && opts.bandRect !== undefined ? opts.bandRect : bandRectFromAnchors(projected);
    if (bandRect && !(bandRect.x0 < 0.5 && bandRect.x1 > 0.5 && bandRect.y0 < 0.5 && bandRect.y1 > 0.5)) bandRect = null;
    lastBandRect = bandRect || null;
    const panelAvoid = bandRect
      ? { rects: [...((avoid && avoid.rects) || []), bandRect], ellipses: (avoid && avoid.ellipses) || [] }
      : avoid;
    // R3-fix: the status card's hand test uses the HAND only (opts.handRects from ns-app); the avoid rects also carry the
    // orbit-arrow boxes for the orientation labels, and an orbiting arrow must never push the card away.
    const handRects = opts && Array.isArray(opts.handRects) ? opts.handRects : (avoid && avoid.rects) || [];
    placePanels(W, H, panelAvoid, { rects: handRects, ellipses: [] }, opts && Number.isFinite(opts.legendTopPx) ? opts.legendTopPx : null);
    // R3-polish: the boxes placed this call (CSS px), so the scene's region labels can avoid them in the same frame.
    const placedOrient = [];
    // R3-polish (labels never overlap): the crosshair and its caption (.ns-hover: left 50 %, top 50 %, translate(18px,
    // 12px)) are a box the orientation labels keep clear of; it is also handed to the scene for the region labels.
    let hoverBox = null;
    if (W > 0 && H > 0) {
      const shownHover = !hover.hidden && hover.textContent !== '';
      const hs = shownHover ? ((ro && sizeOf(hover)) || [Math.min(260, 0.4 * W, 7.2 * hover.textContent.length + 12), 18]) : [0, 0];
      // R3-fix (review m1 / SL-9): the caption sits beside the crosshair in the first corner (right-below, left-below,
      // right-above, left-above) where no orbit arrow covers it (opts.arrows: viewport-fraction boxes).
      const arrowsF = opts && Array.isArray(opts.arrows) ? opts.arrows : [];
      const corners = [[18, 12], [-18 - hs[0], 12], [18, -12 - hs[1]], [-18 - hs[0], -12 - hs[1]]];
      let pick = corners[0];
      if (shownHover) {
        // R4-fix (review RP13): nor under the information panel / legend (the caption ran into the panel and was cut).
        const boxOf = ([dx, dy]) => ({ x0: 0.5 + dx / W, y0: 0.5 + dy / H, x1: 0.5 + (dx + hs[0]) / W, y1: 0.5 + (dy + hs[1]) / H });
        const ok = c => { const b = boxOf(c); return !arrowsF.some(a => boxesOverlap(b, a)) && !(panelRects || []).some(r => boxesOverlap(b, r)) && b.x0 >= 0 && b.x1 <= 1; };
        pick = corners.find(ok) || corners.find(c => !arrowsF.some(a => boxesOverlap(boxOf(c), a))) || corners[0];
      }
      const tf = `translate(${Math.round(pick[0])}px, ${Math.round(pick[1])}px)`;
      if (hover.style && hoverTransform !== tf) { hoverTransform = tf; hover.style.transform = tf; }
      const cx0 = Math.min(-16, pick[0]), cy0 = Math.min(-16, pick[1]), cx1 = Math.max(16, shownHover ? pick[0] + hs[0] : 16), cy1 = Math.max(16, shownHover ? pick[1] + hs[1] : 16);
      hoverBox = { x0: 0.5 + cx0 / W, y0: 0.5 + cy0 / H, x1: 0.5 + cx1 / W, y1: 0.5 + cy1 / H };
      if (shownHover) placedOrient.push({ key: 'hover', x0: hoverBox.x0 * W, y0: hoverBox.y0 * H, x1: hoverBox.x1 * W, y1: hoverBox.y1 * H });
    }
    // R4-fix (SL4-2): the brain's projected midline (viewport fractions) from the front and back anchors; which side is
    // "left" on screen comes from the left anchor itself, so it stays right after any orbit.
    const brainCovers = opts && typeof opts.brainCovers === 'function' ? opts.brainCovers : null;
    let midline = null;
    {
      const a = projected && projected.anterior, b = projected && projected.posterior, l = projected && projected.left, r = projected && projected.right;
      if (a && b && a.visible !== false && b.visible !== false && [a.x, a.y, b.x, b.y].every(Number.isFinite) && Math.abs(b.y - a.y) > 1e-4) {
        const dxdy = (b.x - a.x) / (b.y - a.y);
        const xAt = (p) => a.x + (p.y - a.y) * dxdy;
        const lx = l && Number.isFinite(l.x) && Number.isFinite(l.y) ? l.x - xAt(l) : null, rx = r && Number.isFinite(r.x) && Number.isFinite(r.y) ? r.x - xAt(r) : null;
        const leftKey = lx !== null ? (lx < 0 ? 'left' : 'right') : rx !== null ? (rx > 0 ? 'left' : 'right') : 'left';
        midline = { x0: a.x, y0: a.y, dxdy, leftKey };
      }
    }
    for (const k of ORIENTATION_KEYS) {
      const el = orient[k];
      if (orientText[k].shortWanted !== shortWanted) { orientText[k].shortWanted = shortWanted; showOrientText(k, shortWanted); }
      const cands = [];
      for (let i = 0; ; i++) {
        const key = i === 0 ? k : `${k}.${i}`;
        const p = projected && projected[key];
        if (!p) { if (i > 0) break; continue; }
        if (p.visible) cands.push({ key, p });
      }
      const show = cands.length > 0 && el.textContent !== '';
      if (el.hidden !== !show) el.hidden = !show;
      if (!show || !el.style) continue;
      let w = 0, h = 0;
      if (W > 0 && H > 0) {
        if (ro) { const sz = sizeOf(el); if (sz) orientSize[k] = sz; }
        else if (orientSize[k] === null && el.offsetWidth > 0 && el.offsetHeight > 0) orientSize[k] = [el.offsetWidth, el.offsetHeight];
        const side = k === 'right' || k === 'left';
        // R4-fix (SL4-2 / RP11): a label that was never drawn (so never measured) is estimated from its text, not from
        // the widest box: side labels may no longer fall back inside the glass, and the old 150 px guess for an 88 px
        // "Your right →" ran into the panel at every outside place, so it was never drawn and never measured.
        const est = Math.ceil(el.textContent.length * HUD_LAYOUT.label.pxPerChar + HUD_LAYOUT.label.padPx);
        [w, h] = orientSize[k] || [Math.min(est, side ? (shortWanted ? HUD_LAYOUT.label.sideShortW + 30 : HUD_LAYOUT.label.sideW) : HUD_LAYOUT.label.axisW + 40), HUD_LAYOUT.label.h];
      }
      const a = ORIENTATION_ALIGN[k];
      const placeOf = p => {
        if (!(W > 0 && H > 0)) return { x: clampFraction(p.x, 0.01, 0.99), y: clampFraction(p.y, 0.01, 0.99), box: null };
        // Polish: below the top limits line and above the bottom hint toast (ORIENTATION_EDGE), not under them.
        const mx = 4 / W, myTop = (Math.max(essentialHeight, 18) + ORIENTATION_EDGE.topGapPx) / H, myBottom = ORIENTATION_EDGE.bottomPx / H;
        const fw = w / W, fh = h / H;
        const x = clampFraction(p.x, Math.min(0.5, a[0] * fw + mx), Math.max(0.5, 1 - (1 - a[0]) * fw - mx));
        const y = clampFraction(p.y, Math.min(0.5, a[1] * fh + myTop), Math.max(0.5, 1 - (1 - a[1]) * fh - myBottom));
        return { x, y, box: { x0: x - a[0] * fw, y0: y - a[1] * fh, x1: x + (1 - a[0]) * fw, y1: y + (1 - a[1]) * fh } };
      };
      const band = { x0: 0, y0: 0, x1: 1, y1: H > 0 ? Math.max(ESSENTIAL_BAND, essentialHeight / H) : ESSENTIAL_BAND }; // measured HUD text only
      const labelRects = opts && Array.isArray(opts.labelRects) ? opts.labelRects : []; // R4-polish: e.g. the shown toast
      // R4-fix (reviews SL4-2, RP11): a side label ("← Your left" / "Your right →", short "← Left" / "Right →") is a
      // claim about a side: its whole box stays on its own side of the brain's projected midline (the anterior ->
      // posterior anchor line), and it never sits on the brain's drawn outline (opts.brainCovers, viewport-fraction
      // box -> true when the brain's projected hull overlaps it). With no such place it is not drawn this frame rather
      // than drawn across the midline or inside the glass.
      const side = k === 'right' || k === 'left';
      const sideOk = pl => {
        if (!side || !pl.box) return true;
        if (midline) {
          const xm = y => midline.x0 + (y - midline.y0) * midline.dxdy;
          const m0 = xm(pl.box.y0), m1 = xm(pl.box.y1);
          if (k === midline.leftKey ? pl.box.x1 > Math.min(m0, m1) : pl.box.x0 < Math.max(m0, m1)) return false;
        }
        return !(typeof brainCovers === 'function' && brainCovers(pl.box));
      };
      const free = pl => !pl.box || (!hitsAvoid(pl.box, avoid) && !boxesOverlap(pl.box, band) && !(panelRects || []).some(r => boxesOverlap(pl.box, r)) &&
        !(hoverBox && boxesOverlap(pl.box, hoverBox)) && !labelRects.some(r => boxesOverlap(pl.box, r)) && sideOk(pl));
      const placed = cands.map(c => ({ key: c.key, ...placeOf(c.p) }));
      const current = placed.find(c => c.key === orientPick[k]);
      const best = placed.find(free) || null;
      // R4-polish: a label stays where it is while that place is clear (no flicker), but moves to a better (earlier,
      // e.g. outside the brain) place once that one has been clear for ORIENT_UPGRADE_FRAMES calls in a row; before,
      // a label that started on an inner fallback stayed there for good.
      if (best && current && best.key !== current.key && placed.indexOf(best) < placed.indexOf(current)) orientUpgrade[k] = (orientUpgrade[k] || 0) + 1;
      else orientUpgrade[k] = 0;
      let chosen = (current && free(current) && orientUpgrade[k] < ORIENT_UPGRADE_FRAMES ? current : best) || null;
      if (chosen !== current) orientUpgrade[k] = 0;
      // Polish: no free anchor -> slide the first anchor toward the screen centre (side labels along x, front/back
      // along y) until it is clear, instead of drawing it over a panel or the limits line.
      if (!chosen && placed[0] && placed[0].box && W > 0 && H > 0) {
        const side = k === 'right' || k === 'left';
        const p0 = placed[0];
        const steps = side ? ORIENTATION_EDGE.nudgeSteps : ORIENTATION_EDGE.axisNudgeSteps; // front/back stay near their edge
        for (let i = 1; i <= steps && !chosen; i++) {
          const d = i * ORIENTATION_EDGE.nudgePx;
          const nx = side ? p0.x + (p0.x > 0.5 ? -d / W : d / W) : p0.x, ny = side ? p0.y : p0.y + (p0.y > 0.5 ? -d / H : d / H);
          const c = placeOf({ x: nx, y: ny });
          if (free(c)) chosen = { key: p0.key, ...c };
        }
      }
      // R3-polish (labels never overlap): with no clear place (e.g. the brain dragged so its front is under the status
      // card) the label is not drawn this frame instead of being drawn over a card, a caption or the arm.
      if (!chosen && W > 0 && H > 0) { if (!el.hidden) el.hidden = true; continue; }
      const use = chosen || placed[0];
      orientPick[k] = use.key;
      setClass(el, `ns-orient ns-orient-${k}`);
      // A2-render R1: attribute and style writes only when the value changes (no per-frame DOM invalidation).
      const last = orientLast[k], placement = chosen ? 'clear-estimate' : 'limited';
      const left = `${(use.x * 100).toFixed(2)}%`, top = `${(use.y * 100).toFixed(2)}%`;
      if (last.placement !== placement) { el.setAttribute('data-ns-placement', placement); last.placement = placement; }
      if (last.left !== left) { el.style.left = left; last.left = left; }
      if (last.top !== top) { el.style.top = top; last.top = top; }
      if (use.box) placedOrient.push({ key: k, x0: use.box.x0 * W, y0: use.box.y0 * H, x1: use.box.x1 * W, y1: use.box.y1 * H });
    }
    return placedOrient;
  }

  function dispose() {
    if (ro) { try { ro.disconnect(); } catch { /* already gone */ } ro = null; }
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  /** U2b-scene: whether the HUD cards keep clear of the information overlay area (infoPanelRect); default true. */
  function setReserveInfo(on) { reserveInfo = on !== false; sizedFor = ''; return reserveInfo; }

  return {
    root, slots, details, essential, render, placeOrientation, dispose, reserveInfo: setReserveInfo,
    get bandRect() { return lastBandRect; }, get reservedRect() { return reservedRect; },
    /** R5-integrate-core: the HUD cards' boxes (CSS px: the status card and the legend card, as drawn now), so the
     * floating guide chip never covers them (with the larger round-5 brain the chip's free spots are fewer). */
    cardRectsPx() {
      const out = [];
      for (const e of [info, legend]) {
        if (!e || e.hidden || typeof e.getBoundingClientRect !== 'function') continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
      }
      return out;
    },
    /** R4-integrator (D7): the "Try this" guide line's box (CSS px). While the line is hidden: the place it would take,
     * with its last height (one rect read per call). R4-polish: the line is now the FIRST line of the card (the title is
     * its footer), so that place is the top of the card's content box, not "under the title". */
    guideRect() {
      const g = slots.guide, t = slots.title;
      if (!g || !t || typeof t.getBoundingClientRect !== 'function') return null;
      const floating = typeof g.className === 'string' && g.className.includes('ns-guide-float');
      if (!g.hidden && g.textContent && !floating) {
        const r = g.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { lastGuideH = r.height; return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }
      }
      if (!g.hidden && g.textContent && floating) { const r = g.getBoundingClientRect(); if (r.height > 0) lastFloatH = r.height; }
      const r = t.getBoundingClientRect();
      if (!(r.width > 0)) return null;
      const card = g.parentNode && typeof g.parentNode.getBoundingClientRect === 'function' ? g.parentNode : null;
      if (card) {
        const c = card.getBoundingClientRect();
        let pad = 8;
        try { const v = parseFloat(getComputedStyle(card).paddingTop); if (Number.isFinite(v)) pad = v; } catch { /* no computed style (DOM double) */ }
        return { x0: r.left, y0: c.top + pad, x1: r.right, y1: c.top + pad + lastGuideH };
      }
      return { x0: r.left, y0: r.bottom + 5, x1: r.right, y1: r.bottom + 5 + lastGuideH };
    },
    /** R4-integrator (D7): the floating chip's last measured height (CSS px; 40 before the first measure). */
    get guideFloatH() { return lastFloatH; }
  };
}
