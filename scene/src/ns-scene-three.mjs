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
 * Scientific limits (unchanged): every colour, opacity and label is a simulated, unitless DISPLAY of virtual inputs;
 * regions are control regions of a representative map, not cortical borders, and the face layer is a displaced view,
 * not something a person can see from their own eyes.
 */
import { SEGMENTS, skinApply } from './ns-rig.mjs';
import { ARM_DEFAULTS } from './ns-arm.mjs';
import {
  brainWorldMatrix, colormapLinear, gazeDirection, MARKER_GEOMETRY, MARKER_OCTAHEDRON, markerSolid, MARKERS,
  ACTIVITY_FIELD, STRIP_SHADE, RAMP_STOPS_LINEAR, regionTintLinear, stripShade, legendGradientCss
} from './ns-brain.mjs';
import * as NsBrain from './ns-brain.mjs';
import * as NsMath from './ns-math.mjs';
import {
  activityColor, activityColorCss, ACTIVITY_GLOW, RAMP_STOPS_LINEAR as SHARED_RAMP, hexToLinear, RAMP_LABEL
} from './ns-colors.mjs';

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };

/** Camera contract (DESIGN.md): PerspectiveCamera(70, aspect, 0.02, 500) at the world origin. */
export const CAMERA = Object.freeze({ fovYDeg: 70, near: 0.02, far: 500 });

/** Display materials. Hex colours are sRGB (Three converts them to its linear working space). */
export const MATERIAL = Object.freeze({
  background: 0x05070b,
  bone: 0xe9dfc4, // ivory
  muscleBase: 0x7a2f24, // red-brown
  muscleHot: 0xff5a1e, // bright red / orange
  muscleEmissiveMax: 0.35,
  // Visual-clarity candidate: the nearest shell carries the outline; deeper layers stay faint.
  // Alpha values are display choices, not tissue optics or measured electrical activity.
  glass: 0xd6ebff,
  glassOpacity: 0.025,
  glassRimOpacity: 0.46,
  glassRimPower: 4,
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

/** Pure patch of a MeshStandardMaterial pair for the arm ghost window; null when a hook is missing (no ghost). Uniform
 * nsGhost = (centre x, centre y [drawing-buffer px], radius px, amount 0..1); amount 0 leaves the arm unchanged. */
export function patchArmGhostShaders(vertexShader, fragmentShader, ghost = ARM_GHOST) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const n = fragmentShader.indexOf(ARM_NORMAL_HOOK), e = fragmentShader.indexOf(ARM_EMISSIVE_HOOK);
  if (n < 0 || e < 0 || e < n || !fragmentShader.includes('vViewPosition')) return null;
  const ne = n + ARM_NORMAL_HOOK.length, ee = e + ARM_EMISSIVE_HOOK.length;
  const body = `
	if ( nsGhost.w > 0.0 ) {
		float nsIn = ( 1.0 - smoothstep( nsGhost.z * ${glslFloat(ghost.edge)}, nsGhost.z, length( gl_FragCoord.xy - nsGhost.xy ) ) ) * nsGhost.w;
		if ( nsIn > 0.0 ) {
			float nsFacing = abs( dot( normal, normalize( vViewPosition ) ) );
			float nsRim = 1.0 - smoothstep( ${glslFloat(ghost.rimLo)}, ${glslFloat(ghost.rimHi)}, nsFacing );
			float nsNoise = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
			if ( nsNoise > mix( 1.0, max( nsRim, ${glslFloat(ghost.fill)} ), nsIn ) ) discard;
			nsGhostRim = nsRim * nsIn;
		}
	}
`;
  return {
    vertexShader,
    fragmentShader: 'uniform vec4 nsGhost;\nfloat nsGhostRim = 0.0;\n' + fragmentShader.slice(0, ne) + body + fragmentShader.slice(ne, ee) +
      `\n\ttotalEmissiveRadiance += ${glslVec3(ghost.rimColor)} * nsGhostRim;\n` + fragmentShader.slice(ee)
  };
}

/** Glass rim shader patch for an UNLIT MeshBasicMaterial (which has no view normal): the vertex shader passes the
 * view-space normal and view vector, the fragment shader sets the alpha before Three's final colour write (r154+
 * `opaque_fragment`, older `output_fragment`). Hooks: vertex `#include <project_vertex>` (mvPosition in scope; the
 * `normal` attribute and `normalMatrix` are declared by Three for every built-in material). */
const GLASS_VARYINGS = 'varying vec3 vNsNormal;\nvarying vec3 vNsView;\n';
const GLASS_VERTEX_HOOK = '#include <project_vertex>';
const GLASS_VERTEX_GLSL = 'vNsNormal = normalize( normalMatrix * normal );\nvNsView = - mvPosition.xyz;';
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
  restOpacity: 0.3, activatedOpacity: 0.44, activatedOpacityMax: 0.52, activatedOpacityPerExtra: 0.025,
  activatedShadeMix: 0.24, activatedShade: Object.freeze([0.88, 0.80, 0.62]),
  leftArmTint: Object.freeze([0.10, 0.52, 0.62]), otherTint: Object.freeze([0.33, 0.33, 0.45]), otherTintAlt: Object.freeze([0.27, 0.27, 0.37]),
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
  hoverLine: 0xfff3a0, lineOpacity: 1, leftArmLineOpacity: 0.36,
  /** Non-left-arm regions: faint outlines so every motor area reads as a region (not glass), and a small rest opacity
   * lift; the left-arm regions keep the stronger cyan identity. */
  otherLine: 0xb9b4d6, otherLineOpacity: 0.16, otherOpacityLift: 0.06,
  /** Activated regions (persistent until Reset body) also get a warm gold outline, so the marks stay findable on the
   * busy strip; the fill change itself stays slight (shade + opacity, REGION_STYLE). */
  activatedLine: 0xffc65c, activatedLineOpacity: 0.95,
  /** Group (territory) outlines: the LEFT-ARM territory (right hemisphere) in bright cyan, every other body-part group
   * in a soft lavender, so the left-arm / other-body distinction reads at a glance. */
  territoryLine: 0x8cf2ff, territoryLineOpacity: 1, groupLine: 0xd2cdf0, groupLineOpacity: 0.5
});

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

/** The required left-arm label (task U2b: 'Left arm (right hemisphere)'). */
export const LEFT_ARM_LABEL = 'Left arm (right hemisphere)';

/** On-brain group label text for a label group key and hemisphere, or null (SCAN and unknown groups carry no group
 * label; the info overlay explains them when looked at). */
export function regionGroupLabel(key, hemisphere) {
  const hemi = hemisphere === 'left' ? 'left hemisphere' : 'right hemisphere';
  const contra = hemisphere === 'left' ? 'Right' : 'Left';
  switch (key) {
    case 'leftArm': return LEFT_ARM_LABEL;
    case 'arm': return `${contra} arm (${hemi})`;
    case 'leg': return `${contra} leg (${hemi})`;
    case 'trunk': return `Trunk (${hemi})`;
    case 'face': return `Face & neck (${hemi})`;
    default: return null;
  }
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
export const ORBIT_HOLD = Object.freeze({ delayMs: 300, everyMs: 100, stepDeg: 3, maxStepsPerFrame: 5 });
export const ORBIT_ARROWS = Object.freeze({
  gapCm: 1.5, pxPerCm: 96 / 2.54, sizePx: 44, marginPx: 10, hitPadPx: 4, minVisibleFrac: 0.2,
  dirs: Object.freeze(['forward', 'back', 'left', 'right']),
  glyph: Object.freeze({ forward: '▲', back: '▼', left: '◀', right: '▶' }),
  /** Polish (R16/R17): short plain hover captions shown beside each arrow. */
  tip: Object.freeze({ forward: 'Orbit toward the front', back: 'Orbit toward the back', left: 'Orbit left', right: 'Orbit right' }),
  label: Object.freeze({
    forward: 'Orbit the brain view forward (toward the front of the brain)',
    back: 'Orbit the brain view back (toward the back of the brain)',
    left: 'Orbit the brain view left', right: 'Orbit the brain view right'
  })
});

/** Curved orbit-arrow icon (inline SVG markup, 32 x 32, currentColor) for an orbit direction (pure). R16: the arrow
 * curves around a small sphere, so it reads as "swing the view around the brain", not "move the brain". The base
 * drawing points right; the other directions are the same drawing mirrored or rotated. */
export function orbitIconSvg(dir) {
  const t = dir === 'left' ? 'matrix(-1 0 0 1 32 0)' : dir === 'forward' ? 'rotate(-90 16 16)' : dir === 'back' ? 'rotate(90 16 16)' : '';
  return '<svg class="ns-orbit-icon" viewBox="0 0 32 32" width="34" height="34" aria-hidden="true" focusable="false">' +
    `<g${t ? ` transform="${t}"` : ''} fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">` +
    '<circle cx="16" cy="12.5" r="5.2" fill="currentColor" fill-opacity="0.22" stroke-width="1.6" opacity="0.75"/>' +
    '<path d="M3 12.5 Q16 32.5 29 12.5" stroke-width="3"/>' +
    '<path d="M22.8 15.7 L29 12.5 L28.6 19.5" stroke-width="3"/>' +
    '</g></svg>';
}

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
  pitchStartDeg: 26, pitchFullDeg: 42, elevationDeg: 60, distanceM: 1.3, scale: 2.8, nearClearM: 0.12,
  boneOpacity: 0.36, muscleOpacity: 0.55, minDistanceM: 0.5,
  inset: Object.freeze({ sizePx: 220, sizeVmin: 32, fovDeg: 30, marginPx: 10, background: 0x0b1018 }),
  ghostLabel: 'Your face (ghost layer): skull, jaw and neck muscles shown displaced in front of you, seen from the front (not a mirror); the dataset has no facial-expression muscles. In first person you cannot see your own face.',
  insetLabel: 'Face (inset view): your skull, jaw and neck muscles seen from the front; the dataset has no facial-expression muscles. In first person you cannot see your own face.'
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
 * dot pattern, while the legs show through the rest. Geometry, posing and picking are unchanged. */
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
export const INFO_PANEL = Object.freeze({ colPx: 300, colVw: 25, gapPx: 12, portraitVh: 36, maxCaveats: 2, maxCitations: 4, colMaxVh: 66 });

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

/** Plain-language row headings of the info overlay (round-2 fix F6, R17). */
export const INFO_ROW_LABELS = Object.freeze({
  bodyPart: 'Body part', movement: 'Movement', agonists: 'Muscles that work', antagonists: 'Muscles that ease off', pathway: 'Pathway'
});
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

/** Plain display content of the info overlay for an ns-app infoOverlayModel (pure): { mode, leftArm, heading, title,
 * tag, viewed, plain, simulated, known, regionCaveat, rows: [[label, text]], activity: { value, text, css } | null,
 * activations, explanation, caveats: [..], moreCaveats, citations, key }. Round-2 fixes V1 / SCI-4: the short lines
 * (plain lead, simulated, known, the region's own caveat) come BEFORE the detail rows, and the long explanation comes
 * last ("More detail"), so every required field fits the column at 1280x720. Unknown or missing fields become empty. */
export function infoPanelContent(model) {
  if (!model || typeof model !== 'object') return null;
  const s = v => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v));
  const list = a => (Array.isArray(a) ? a.map(s).filter(Boolean) : []);
  const leftArm = /left[- ]arm/i.test(s(model.tag));
  const hemi = model.hemisphere === 'right' ? 'right' : model.hemisphere === 'left' ? 'left' : '';
  const rows = [];
  // The body part's short name (the effector text before any ':' detail) and the hemisphere, in one line.
  const part = s(model.bodyPart).split(/[:;]/)[0].trim();
  if (part || hemi) rows.push([INFO_ROW_LABELS.bodyPart, [part, hemi ? `${hemi} hemisphere` : ''].filter(Boolean).join(' · ')]);
  const act = model.action && typeof model.action === 'object' ? model.action : null;
  if (act && s(act.label)) rows.push([INFO_ROW_LABELS.movement, s(act.label)]);
  else if (model.mode === 'region' && model.region) rows.push([INFO_ROW_LABELS.movement, 'none: this area moves nothing in the game']);
  const ag = list(model.agonists), an = list(model.antagonists).filter(m => !ag.includes(m));
  if (ag.length) rows.push([INFO_ROW_LABELS.agonists, firstNames(ag, INFO_ROW_MAX.agonists)]);
  if (an.length) rows.push([INFO_ROW_LABELS.antagonists, firstNames(an, INFO_ROW_MAX.antagonists)]);
  if (s(model.pathway)) rows.push([INFO_ROW_LABELS.pathway, s(model.pathway)]);
  const v = Number.isFinite(model.activity) ? fin01(model.activity) : null;
  const caveats = list(model.caveats);
  const cites = Array.isArray(model.citations) ? model.citations.filter(c => c && s(c.key)) : [];
  const n = Number.isFinite(model.activations) ? model.activations : 0;
  const region = model.mode === 'region';
  const expl = s(model.explanation);
  return {
    key: s(model.key), mode: s(model.mode) || 'idle', leftArm,
    heading: s(model.heading) || 'What is happening (simulated)',
    title: s(model.title), tag: s(model.tag),
    viewed: model.viewed === 'last' ? 'Last viewed area (the crosshair is on empty space)' : '',
    plain: s(model.plain),
    rows,
    activity: v === null ? null : { value: v, text: `Simulated activity ${v.toFixed(2)} (unitless, 0–1)`, css: activityColorCss(v) },
    activations: n >= 1 ? `Activated ${n}× (marked until Reset body)` : '',
    // In region mode the long explanation is the "More detail" paragraph at the end; idle/glass text stays as is.
    explanation: region && expl ? `More detail: ${expl}` : expl,
    simulated: region ? s(model.simulated) : '', known: region ? s(model.known) : '',
    regionCaveat: region ? s(model.regionCaveat) : '',
    caveats: caveats.slice(0, INFO_PANEL.maxCaveats), moreCaveats: Math.max(0, caveats.length - INFO_PANEL.maxCaveats),
    citations: cites.slice(0, INFO_PANEL.maxCitations).map(c => `${s(c.key)}${c.verified === true ? '' : ' (unverified)'}`).join(' · ')
  };
}

/* ------------------------------------------------------------------ Three scene */

/**
 * Create the renderer, camera-attached arm group and world brain group.
 * Options (A2-render R1, all optional and backwards compatible):
 *  - glassXray: GLASS_XRAY_MODES entry, which glass meshes get the faint additive x-ray pass (default GLASS_XRAY);
 *  - adaptivePixelRatio: true (default) | false | ADAPTIVE_PIXEL_RATIO-style options; measure() then returns the
 *    adapted ratio (never above maxPixelRatio or the device ratio, never below min(min, cap));
 *  - shimmer: 'auto' (default: on unless prefers-reduced-motion) | true | false, the decorative glow shimmer;
 *  - armGhost: 'auto' (default: ghost while the gaze is on the strip) | true | false | 0..1 (see setArmGhost).
 * U2b-scene options:
 *  - onOrbit(dir): called when an orbit arrow button is clicked (setOrbitHandler replaces it; without either a
 *    'ns-orbit' CustomEvent { detail: { dir } } is dispatched on the document instead, never both);
 *  - overlayRoot: element for the scene's DOM overlay (orbit arrows, region labels, info panel, face labels); default
 *    the canvas's parent element; without one these DOM features are off (the 3D scene still works);
 *  - faceView: FACE_VIEW_MODES entry (default 'ghost'; setFaceView changes it).
 * @returns {{ objects, measure, resize, setView, setArm, setBrain, setPlacement, updatePose, updateMuscles,
 *   updateStrip, highlightMarker, setArmGhost, setShimmer, raycastBrain, projectWorld, render, contextLost: boolean,
 *   dispose, setBrainTransform, updateRegions, setInfo, setBody, setBodyFrame, updateBody, bodyVisibility, setFaceView,
 *   orbitArrowAt, hoverOrbitArrow, setOrbitHandler, brainOrientationAnchors, regionMode: boolean }}
 */
export function createScene({
  THREE, canvas, fovYDeg = CAMERA.fovYDeg, near = CAMERA.near, far = CAMERA.far, maxPixelRatio = 2,
  glassXray: glassXrayMode = GLASS_XRAY, adaptivePixelRatio = true, shimmer = 'auto', armGhost = 'auto',
  onOrbit = null, overlayRoot = null, faceView = 'ghost'
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
  const adaptiveOpts = adaptivePixelRatio === false ? null : { ...ADAPTIVE_PIXEL_RATIO, ...(typeof adaptivePixelRatio === 'object' && adaptivePixelRatio ? adaptivePixelRatio : {}) };
  let dprState = { level: NaN, cap: NaN, smoothMs: null, slowFor: 0, fastFor: 0 };
  let lastRenderAt = null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Front-to-back glass depth pre-pass (guarded: setTransparentSort is a core WebGLRenderer method since r142).
  const transparentSortApplied = typeof renderer.setTransparentSort === 'function';
  if (transparentSortApplied) renderer.setTransparentSort(transparentSortNs);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(MATERIAL.background);
  const camera = new THREE.PerspectiveCamera(fovYDeg, 1, near, far);
  camera.rotation.set(0, 0, 0, 'YXZ');
  scene.add(camera); // the camera must be in the scene graph for its children (the arm) to render

  const armGroup = new THREE.Group();
  armGroup.name = 'ns-arm (camera-attached, camera metres)';
  camera.add(armGroup);
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

  // Arm ghost window (A2-render R1): one shared vec4 uniform for every arm material.
  const ghostUniform = { value: new Float32Array(4) };
  const ghostMode = mode => {
    if (mode === 'auto' || mode === undefined || mode === null) return 'auto';
    if (mode === true) return 1;
    if (mode === false) return 0;
    if (Number.isFinite(mode)) return Math.min(1, Math.max(0, mode));
    return fail('scene_args', "armGhost must be 'auto', a boolean or a number in 0..1");
  };
  const armGhostState = { applied: null, mode: ghostMode(armGhost), amount: 0 };
  const ghostPatch = m => {
    m.onBeforeCompile = shader => {
      const patched = patchArmGhostShaders(shader.vertexShader, shader.fragmentShader);
      armGhostState.applied = patched !== null && armGhostState.applied !== false;
      if (patched === null) return;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms.nsGhost = ghostUniform;
    };
    m.customProgramCacheKey = () => 'ns-arm-ghost-a2r1';
    return m;
  };
  const boneMaterial = ghostPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: 0.62, metalness: 0 })));
  // Strip shader state: applied is null until the strip program compiles, then whether every hook was found.
  const stripShader = { applied: null, shimmer: shimmer === 'auto' ? !reducedMotion : Boolean(shimmer), reducedMotion };
  // Glass (RENDER_ORDER 4..6). Unlit MeshBasicMaterial passes with the glassAlpha rim patch; `glassRim.applied` is
  // null until Three compiles a glass program, then whether every hook was found (Root's browser check).
  const glassRim = { applied: null, shell: null, xray: null };
  const rimMaterial = (key, params, rim, power, cacheKey) => {
    const m = keep(new THREE.MeshBasicMaterial(params));
    m.forceSinglePass = true; // r150+: DoubleSide transparent in one pass
    m.onBeforeCompile = shader => {
      const patched = patchGlassShaders(shader.vertexShader, shader.fragmentShader);
      glassRim[key] = patched !== null;
      glassRim.applied = glassRim.shell !== false && glassRim.xray !== false && (glassRim.shell === true || glassRim.xray === true);
      if (patched === null) return;
      shader.vertexShader = patched.vertexShader;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms.nsRimOpacity = { value: rim };
      shader.uniforms.nsRimPower = { value: power };
    };
    m.customProgramCacheKey = () => cacheKey;
    return m;
  };
  // SHELL: nearest glass surface only (after the depth pre-pass), normal blending. DoubleSide so an open or inward
  // mesh still shows its nearest surface.
  const glassMaterial = rimMaterial('shell', {
    color: MATERIAL.glass, transparent: true, opacity: MATERIAL.glassOpacity, depthWrite: false, side: THREE.DoubleSide
  }, MATERIAL.glassRimOpacity, MATERIAL.glassRimPower, 'ns-glass-shell-r3');
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
  let brainSampleCentre = null; // fix F2: their centroid (cached per sample array)
  let labelGroups = [];
  // Region depth pre-pass: nearest strip layer only (colour-less), pushed back like the glass pre-pass so the colour pass
  // and the outlines on the same surface pass LessEqual.
  const regionDepthMaterial = keep(new THREE.MeshBasicMaterial({
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
  const torsoGhostUniform = { value: new Float32Array(4) };
  const torsoGhost = { applied: null, amount: 0, target: 0 };
  const torsoPatch = m => {
    m.onBeforeCompile = shader => {
      const patched = patchArmGhostShaders(shader.vertexShader, shader.fragmentShader, BODY_SEE_THROUGH);
      torsoGhost.applied = patched !== null && torsoGhost.applied !== false;
      if (patched === null) return;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms.nsGhost = torsoGhostUniform;
    };
    m.customProgramCacheKey = () => 'ns-torso-see-through-u2b';
    return m;
  };
  const torsoBoneMaterial = torsoPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: 0.62, metalness: 0 })));
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
  const insetCamera = new THREE.PerspectiveCamera(FACE_LAYER.inset.fovDeg, 1, 0.01, 50);
  const insetPrevColor = new THREE.Color();
  let faceMode = faceView;
  let faceAmount = 0;
  let faceHeadCentre = null;
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
  const arrows = {};
  const arrowListeners = [];
  let arrowLayout = null, arrowsShown = false, hoverDir = null;
  const arrowLast = {};
  const emitOrbit = (dir, stepDeg = null) => {
    if (!ORBIT_ARROWS.dirs.includes(dir)) return;
    const small = Number.isFinite(stepDeg) && stepDeg > 0;
    if (typeof orbitHandler === 'function') { if (small) orbitHandler(dir, { stepDeg }); else orbitHandler(dir); return; }
    if (view && typeof view.CustomEvent === 'function') doc.dispatchEvent(new view.CustomEvent('ns-orbit', { detail: small ? { dir, stepDeg } : { dir } }));
  };
  // Round-2 fix F4: press-and-hold on a DOM arrow button. The button keeps the pointer (pointer capture), because the
  // arrow moves as the view orbits; the hold ends on pointerup / pointercancel / lost capture / blur / hide.
  let arrowHold = null; // { dir, timer, repeated }
  const stopArrowHold = () => {
    if (!arrowHold) return;
    if (arrowHold.timer !== null && view) { view.clearTimeout(arrowHold.timer); view.clearInterval(arrowHold.timer); }
    arrowHold.timer = null;
    arrowHold.active = false;
  };
  const startArrowHold = (dir, e, b) => {
    stopArrowHold();
    if (!view || typeof view.setTimeout !== 'function') return;
    arrowHold = { dir, timer: null, repeated: false, active: true };
    try { if (e && Number.isFinite(e.pointerId) && typeof b.setPointerCapture === 'function') b.setPointerCapture(e.pointerId); } catch { /* optional */ }
    const h = arrowHold;
    h.timer = view.setTimeout(() => {
      if (!h.active) return;
      const tickHold = () => { if (!h.active || !arrowsShown) { stopArrowHold(); return; } h.repeated = true; emitOrbit(dir, ORBIT_HOLD.stepDeg); };
      tickHold();
      h.timer = view.setInterval(tickHold, ORBIT_HOLD.everyMs);
    }, ORBIT_HOLD.delayMs);
  };
  if (overlay) {
    for (const dir of ORBIT_ARROWS.dirs) {
      const b = el('button', `ns-orbit ns-orbit-${dir}`, overlay);
      b.type = 'button';
      b.tabIndex = -1; // Space is the grasp key: a focused button must never turn it into an orbit click
      b.textContent = ORBIT_ARROWS.glyph[dir];
      // Polish (R16): a curved orbit arrow replaces the flat triangle glyph where the DOM can parse markup.
      if (typeof b.insertAdjacentHTML === 'function') { b.textContent = ''; b.insertAdjacentHTML('beforeend', orbitIconSvg(dir)); }
      b.setAttribute('data-ns-tip', ORBIT_ARROWS.tip[dir]);
      b.title = ORBIT_ARROWS.label[dir];
      b.setAttribute('aria-label', ORBIT_ARROWS.label[dir]);
      b.setAttribute('data-ns-orbit', dir);
      b.hidden = true;
      const down = e => { if (e && typeof e.preventDefault === 'function') e.preventDefault(); if (e && typeof e.stopPropagation === 'function') e.stopPropagation(); };
      const pdown = e => {
        down(e);
        if (e && Number.isFinite(e.button) && e.button > 2) return;
        startArrowHold(dir, e, b);
      };
      const up = () => stopArrowHold();
      const click = e => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        // A press that already repeated (held) is not also a click step; a plain click is one full step.
        const held = arrowHold && arrowHold.dir === dir && arrowHold.repeated;
        stopArrowHold();
        arrowHold = null;
        if (!held) emitOrbit(dir);
        try { canvas.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
      };
      b.addEventListener('pointerdown', pdown);
      b.addEventListener('mousedown', down);
      b.addEventListener('click', click);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) { b.addEventListener(type, up); arrowListeners.push([b, type, up]); }
      arrowListeners.push([b, 'pointerdown', pdown], [b, 'mousedown', down], [b, 'click', click]);
      arrows[dir] = b;
      arrowLast[dir] = { left: '', top: '', hover: false, clamped: null };
    }
    if (view && typeof view.addEventListener === 'function') view.addEventListener('blur', stopArrowHold);
  }
  const labelEls = [];
  const labelBoxes = [];
  let brainInViewAttr = '';
  // Info panel (R14): far right, textContent only, never takes pointer events.
  let info = null;
  if (overlay) {
    const p = el('aside', 'ns-infopanel', overlay);
    p.setAttribute('data-ns-info', '');
    p.setAttribute('aria-live', 'polite');
    p.setAttribute('aria-label', 'Information: what is happening (simulated)');
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
    // Round-2 fixes V1 / SCI-4 / F6: one plain lead sentence, then simulated vs known and the region's own caveat
    // (short, always inside the column at 1280x720), then the detail rows, then the long explanation ("More detail").
    info.plain = el('p', 'ns-infopanel-plain', p);
    info.simulated = el('p', 'ns-infopanel-simulated', p);
    info.known = el('p', 'ns-infopanel-known', p);
    info.regionCaveat = el('p', 'ns-infopanel-caveat', p);
    info.rows = el('dl', 'ns-infopanel-rows', p);
    info.explanation = el('p', 'ns-infopanel-explanation', p);
    info.caveats = el('ul', 'ns-infopanel-caveats', p);
    info.citations = el('div', 'ns-infopanel-citations', p);
    info.actRow = act;
  }
  let faceLabel = null, insetFrame = null;
  if (overlay) {
    faceLabel = el('div', 'ns-face-label', overlay);
    faceLabel.hidden = true;
    insetFrame = el('div', 'ns-face-inset', overlay);
    insetFrame.hidden = true;
    const cap = el('div', 'ns-face-inset-caption', insetFrame);
    cap.textContent = FACE_LAYER.insetLabel;
  }
  const faceLabelLast = { left: '', top: '', text: '' };
  const insetLast = { left: '', top: '', size: '' };
  // Per-frame scratch (no allocation in render / layout).
  const pv = new THREE.Vector3();
  const brainBoundsPx = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const frustum = typeof THREE.Frustum === 'function' ? new THREE.Frustum() : null;
  const projView = typeof THREE.Matrix4 === 'function' ? new THREE.Matrix4() : null;

  const onLost = e => { if (e && typeof e.preventDefault === 'function') e.preventDefault(); lost = true; };
  const onRestored = () => {
    lost = false;
    lastMatrices = null; // re-skin and recolour on the next frame
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
      armGroup.add(mesh);
      bones.push({ mesh, segment: b.segment });
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
      const mat = ghostPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: 0.55, metalness: 0 })));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = String(m.name || 'muscle');
      mesh.frustumCulled = false; // CPU-skinned: the rest bounding sphere would be stale
      armGroup.add(mesh);
      muscles.push({
        mesh, mat, key: m.muscleKey === undefined ? null : m.muscleKey, rest: m.positions,
        restNormals: computeNormals(m.positions, m.indices), weights: m.weights, pos, nor, posAttr, norAttr, lastT: NaN
      });
    }
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
    glassList.forEach((g, gi) => {
      checkMesh(g, `glass ${g && g.name}`);
      const geo = indexedGeometry(g.positions, g.indices);
      geo.computeVertexNormals();
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
    for (const r of seg.regions) {
      const material = keep(new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: REGION_RENDER.roughness, metalness: REGION_RENDER.metalness, transparent: true,
        opacity: regionStyle.restOpacity, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      }));
      material.forceSinglePass = true;
      const rec = { region: r, id: r.id, index: regions.length, material, meshes: [], depthMeshes: [], outline: null, key: '', activity: 0, activated: 0, hovered: false, opacity: regionStyle.restOpacity };
      const edgeLists = [];
      for (const pi of r.partIndices || []) {
        const part = seg.parts[pi];
        if (!part || !(part.faceCount > 0)) continue;
        const geo = indexedGeometry(part.positions, part.indices);
        geo.computeVertexNormals();
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
        if (hasLines) {
          const e = boundaryEdges(part.indices, part.vertexCount || part.positions.length / 3);
          if (e.length) edgeLists.push({ positions: part.positions, edges: e });
        }
      }
      if (hasLines && edgeLists.length) {
        let n = 0;
        for (const l of edgeLists) n += l.edges.length;
        const pos = new Float32Array(3 * n);
        let w = 0;
        for (const l of edgeLists) for (let i = 0; i < l.edges.length; i++) {
          const v = 3 * l.edges[i];
          pos[w++] = l.positions[v]; pos[w++] = l.positions[v + 1]; pos[w++] = l.positions[v + 2];
        }
        const lg = keep(new THREE.BufferGeometry());
        lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const line = still(new THREE.LineSegments(lg, r.isLeftArm ? leftArmLineMaterial : otherLineMaterial));
        line.name = `motor region outline: ${r.id}${r.isLeftArm ? ' (left arm)' : ''}`;
        line.renderOrder = RENDER_ORDER.regionLine;
        line.visible = true;
        brainGroup.add(line);
        rec.outline = line;
      }
      applyRegionStyle(rec, 0, 0, false, true);
      regions.push(rec);
      regionById.set(r.id, rec);
    }
    labelGroups = regionLabelGroups(seg.regions);
    if (hasLines) {
      for (const g of labelGroups) {
        const parts = [];
        for (const id of g.regionIds) {
          const r = seg.regions.find(x => x.id === id);
          for (const pi of (r && r.partIndices) || []) { const part = seg.parts[pi]; if (part && part.hemisphere === g.hemisphere && part.faceCount > 0) parts.push(part); }
        }
        const seg3 = weldedBoundarySegments(parts);
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
      for (const g of labelGroups) {
        const e = el('div', `ns-region-label${g.isLeftArm ? ' ns-region-label-leftarm' : ''}`, overlay);
        // Polish: the body part reads first; the hemisphere is a smaller, lighter second part of the same label.
        const m = /^(.*?)\s*(\((?:left|right) hemisphere\))$/.exec(g.text);
        if (m) {
          el('span', 'ns-region-label-part', e).textContent = m[1];
          el('span', 'ns-region-label-hemi', e).textContent = ` ${m[2]}`;
        } else e.textContent = g.text;
        e.setAttribute('data-ns-region-group', `${g.hemisphere}:${g.key}`);
        e.hidden = true;
        labelEls.push({ el: e, group: g, shownNow: false, last: { left: '', top: '', shown: false, hover: false } });
        // Estimated label box (CSS 11.5-12.5 px bold sans-serif): ~6.6 px per character + padding.
        labelBoxes.push({ x: 0, y: 0, w: Math.min(g.isLeftArm ? 200 : 190, g.text.length * (g.isLeftArm ? 7.2 : 6.6) + 14), h: g.isLeftArm ? 21 : 19, skip: true });
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
  function setBrainTransform(transform) {
    const m = transform && transform.matrix;
    if (!m || m.length !== 16 || !Array.prototype.every.call(m, Number.isFinite)) fail('scene_input', 'setBrainTransform needs a brainViewTransform result with a finite 4x4 matrix');
    brainGroup.matrix.fromArray(m);
    brainGroup.matrixWorldNeedsUpdate = true;
    brainGroup.updateMatrixWorld(true);
    brainTransformSet = true;
    overlayDirty = true;
    return true;
  }

  /** Camera orientation: Euler YXZ (yaw about +y, then pitch), so the view direction is ns-brain gazeDirection. */
  function setView(yaw, pitch) {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    if (yaw !== lookYaw || pitch !== lookPitch) overlayDirty = true;
    lookYaw = yaw; lookPitch = pitch;
  }

  /** Apply pose matrices (Map(segment -> rest mm -> camera m)). Returns false and does nothing when unchanged. */
  function updatePose(matrices) {
    if (!(matrices instanceof Map)) fail('scene_input', 'matrices must be a Map(segment -> matrix)');
    if (lastMatrices !== null && matricesEqual(lastMatrices, matrices, RESKIN_TOLERANCE)) return false;
    for (const b of bones) {
      const m = matrices.get(b.segment);
      if (!m) fail('scene_input', `missing matrix for ${b.segment}`);
      b.mesh.matrix.fromArray(m);
      b.mesh.matrixWorldNeedsUpdate = true;
    }
    for (const m of muscles) {
      skinApply(matrices, m.weights, m.rest, m.pos);
      skinNormals(matrices, m.weights, m.restNormals, m.nor);
      m.posAttr.needsUpdate = true;
      m.norAttr.needsUpdate = true;
    }
    lastMatrices = matrices;
    return true;
  }

  /** Tint muscles from simulated drive by catalog key ({ key: 0..1 }); muscles with no key keep the baseline tint.
   * U2b-scene: the ONE ns-colors rule (activityShadeInto: the red-brown tissue base darkened with activity plus the
   * shared ramp as emission), the same rule and ramp as the brain regions; mesh.userData.activity records the value. */
  function updateMuscles(byKey) {
    for (const m of muscles) {
      const raw = m.key === null || !byKey ? baselineDrive : byKey[m.key];
      const t = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : baselineDrive;
      if (t === m.lastT) continue;
      shadeMuscle(m.mat, t);
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

  /** World points of the brain's orientation labels in region mode ({ right, left, anterior, posterior } just outside
   * the strips' bounds along the transform's axes), for hud.placeOrientation; null in legacy mode or before a transform. */
  function brainOrientationAnchors() {
    if (!regionMode || !brainTransformSet || !segmentation) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const s of segmentation.strips) {
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], s.boundsMin[i]); hi[i] = Math.max(hi[i], s.boundsMax[i]); }
    }
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]];
    const m = brainGroup.matrixWorld.elements;
    const w = p => apply4(m, p);
    const pad = 6; // mm outside the strips
    // Source frame: +x subject LEFT, +y POSTERIOR, +z SUPERIOR.
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
    if (!c) { if (!info.panel.hidden) info.panel.hidden = true; info.last = null; overlayDirty = true; return true; }
    const sig = JSON.stringify(c);
    if (sig === info.last) return false;
    info.last = sig;
    overlayDirty = true;
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
    put(info.regionCaveat, c.regionCaveat ? `Caveat: ${c.regionCaveat}` : '');
    while (info.caveats.firstChild) info.caveats.removeChild(info.caveats.firstChild);
    for (const t of c.caveats) el('li', '', info.caveats).textContent = t;
    if (c.moreCaveats > 0) el('li', 'ns-infopanel-more', info.caveats).textContent = `+${c.moreCaveats} more caveat${c.moreCaveats > 1 ? 's' : ''} (Esc page: limits and sources).`;
    info.caveats.hidden = c.caveats.length === 0;
    put(info.citations, c.citations ? `Sources: ${c.citations}` : '');
    if (info.panel.hidden) info.panel.hidden = false;
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
      const face = part === 'face' || near;
      const geo = indexedGeometry(m.positions instanceof Float32Array ? m.positions : Float32Array.from(m.positions), m.indices instanceof Uint32Array ? m.indices : Uint32Array.from(m.indices));
      geo.computeVertexNormals();
      if (typeof geo.computeBoundingSphere === 'function') geo.computeBoundingSphere();
      let material;
      const trunk = !face && (part === 'torso' || part === 'neck');
      if (kind === 'muscle') {
        material = keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: 0.55, metalness: 0 }));
        if (face) { material.transparent = true; material.opacity = FACE_LAYER.muscleOpacity; material.depthWrite = false; }
        else if (trunk) torsoPatch(material);
        shadeMuscle(material, MUSCLE_REST_DRIVE);
      } else material = face ? faceBoneMaterial : trunk ? torsoBoneMaterial : bodyBoneMaterial;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = bodyMeshName(entry, id) + (face ? ' [face layer]' : '');
      mesh.matrixAutoUpdate = false;
      mesh.userData = { elementId: id, bodyPart: face ? 'face' : part, anatomicalPart: part, kind, region: entry.region || null, faceLayer: face, nearEye: near, activity: kind === 'muscle' ? MUSCLE_REST_DRIVE : null };
      (face ? faceGroup : bodyGroup).add(mesh);
      if (face) {
        const p = m.positions;
        for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < faceLo[k]) faceLo[k] = p[i + k]; if (p[i + k] > faceHi[k]) faceHi[k] = p[i + k]; }
      }
      const rec = { id, mesh, part: face ? 'face' : part, anatomicalPart: part, kind, material, face, lastDrive: kind === 'muscle' ? MUSCLE_REST_DRIVE : null };
      body.push(rec);
      bodyById.set(id, rec);
    }
    if (faceLo.every(Number.isFinite)) {
      faceHeadCentre = [0, 1, 2].map(k => (faceLo[k] + faceHi[k]) / 2);
      faceRadiusMm = Math.hypot(faceHi[0] - faceLo[0], faceHi[1] - faceLo[1], faceHi[2] - faceLo[2]) / 2;
    }
    faceStateKey = '';
    bodyGroup.updateMatrixWorld(true);
    const face = body.filter(b => b.face).length;
    return { meshes: body.length, inPlace: body.length - face, face, skipped };
  }

  /** Body frame: a 4x4 BodyParts3D mm -> world m matrix (ns-arm armAttachment().bodyToWorld or ns-math
   * bodyToWorldMatrix), or { eyeBp, bodyYaw }. Changing it moves the whole body (and the face layer's anchor). */
  function setBodyFrame(frame) {
    let m = null, yaw = bodyYaw;
    if (frame && frame.length === 16) m = Float64Array.from(frame);
    else if (frame && frame.eyeBp) { yaw = Number.isFinite(frame.bodyYaw) ? frame.bodyYaw : 0; m = bodyFrameMatrix(frame.eyeBp, yaw); }
    if (!m || !Array.prototype.every.call(m, Number.isFinite)) fail('scene_input', 'setBodyFrame needs a finite 4x4 matrix or { eyeBp, bodyYaw }');
    const eye = eyeFromBodyFrame(m);
    if (!eye) fail('scene_input', 'setBodyFrame matrix is singular');
    // Body yaw: the world direction of the body's anterior (-y source) projected on the horizontal plane.
    const ax = -m[4], az = -m[6]; // A (0, -1, 0): world = -(column 1)
    if (Math.hypot(ax, az) > 1e-12) yaw = Math.atan2(-ax, -az);
    let same = true;
    for (let i = 0; i < 16; i++) if (bodyFrame[i] !== m[i]) { same = false; break; }
    if (same) return false;
    bodyFrame = m; eyeBp = eye; bodyYaw = yaw; bodyFrameSource = frame && frame.length === 16 ? 'matrix' : 'eye';
    bodyGroup.matrix.fromArray(m);
    bodyGroup.matrixWorldNeedsUpdate = true;
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
        n++;
      }
    }
    for (const b of body) {
      if (b.kind !== 'muscle') continue;
      const raw = drives ? get(drives, b.id) : undefined;
      const t = Number.isFinite(raw) ? fin01(raw) : MUSCLE_REST_DRIVE;
      const q = Math.round(t * 512) / 512;
      if (q === b.lastDrive) continue;
      b.lastDrive = q;
      shadeMuscle(b.material, q);
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
    faceAmount = hasFace && faceMode !== 'off' ? faceLayerAmount(lookPitch) : 0;
    const q = Math.round(faceAmount * 64);
    if (faceStateKey === 'ok' && faceMode === lastFaceMode && q === lastFaceQ && bodyYaw === lastFaceYaw) return;
    faceStateKey = 'ok'; lastFaceMode = faceMode; lastFaceQ = q; lastFaceYaw = bodyYaw;
    overlayDirty = true;
    faceGroup.visible = q > 0;
    if (q === 0) return;
    if (faceMode === 'ghost') {
      faceGroup.matrix.fromArray(faceGhostMatrix({ headCentreBp: faceHeadCentre, bodyYaw }));
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
    for (const b of bones) if (b.mesh.geometry && b.mesh.geometry.boundingSphere && frustum.intersectsObject(b.mesh)) { out.leftArm = true; out.counts.leftArm = (out.counts.leftArm || 0) + 1; }
    return out;
  }

  /* ---------------------------------------------------------------- U2b-scene: orbit arrows and overlay layout */

  /** The orbit arrow under CSS point (x, y) (e.g. the crosshair while the pointer is captured), or null. */
  function orbitArrowAt(x, y) {
    return arrowsShown ? orbitArrowHit(arrowLayout, x, y) : null;
  }
  /** Highlight one arrow (the one under the crosshair) or none. */
  function hoverOrbitArrow(dir) {
    hoverDir = ORBIT_ARROWS.dirs.includes(dir) ? dir : null;
    for (const d of Object.keys(arrows)) {
      const on = d === hoverDir;
      if (arrowLast[d].hover !== on) { arrowLast[d].hover = on; if (on) arrows[d].setAttribute('data-hover', 'true'); else arrows[d].removeAttribute('data-hover'); }
    }
    return hoverDir;
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
      const h = arrowLayout.sizePx / 2 + 4;
      for (const d of ORBIT_ARROWS.dirs) {
        const p = arrowLayout[d];
        if (p) arrowsOut.push({ dir: d, x0: (p.x - h) / cssW, y0: (p.y - h) / cssH, x1: (p.x + h) / cssW, y1: (p.y + h) / cssH });
      }
    }
    return { brainInView: brainInViewAttr === 'true', arrows: arrowsOut };
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
  /** HUD card rectangles (CSS px, overlay coordinates), read from the DOM at most every HUD_READ_EVERY frames (a layout
   * read; cached between reads, refreshed on resize). Orbit arrows and labels keep clear of them. */
  const HUD_READ_EVERY = 30;
  let hudRectCache = [], hudReadIn = 0, hudReadFor = '';
  const labelFixed = [];
  function readHudRects() {
    const key = `${cssW}x${cssH}`;
    if (key === hudReadFor && hudReadIn-- > 0) return hudRectCache;
    hudReadFor = key; hudReadIn = HUD_READ_EVERY;
    hudRectCache = [];
    const parent = overlay && overlay.parentNode;
    if (!parent || typeof parent.querySelectorAll !== 'function' || typeof parent.getBoundingClientRect !== 'function') return hudRectCache;
    try {
      const o = parent.getBoundingClientRect();
      for (const e of parent.querySelectorAll('.ns-hud .ns-panel')) {
        if (e.hidden) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) hudRectCache.push({ x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top });
      }
    } catch { hudRectCache = []; }
    return hudRectCache;
  }
  /** Per-frame DOM overlay: orbit arrows, region group labels, face label / inset frame. Style writes only on change. */
  function layoutOverlay() {
    if (!overlay || !(cssW > 0 && cssH > 0)) return;
    if (!overlayDirty && hudReadIn > 0) { hudReadIn--; return; }
    overlayDirty = false;
    const reserve = infoPanelRect({ width: cssW, height: cssH });
    const reserveRight = info && !info.panel.hidden && reserve && reserve.layout === 'column' ? cssW - reserve.x0 : 0;
    const reserveBottom = info && !info.panel.hidden && reserve && reserve.layout === 'portrait' ? cssH - reserve.y0 : 0;
    const topPx = 26; // the essential limits line
    const hudRects = readHudRects();
    // Orbit arrows: region mode with a brain transform and the brain in front of the camera; slid along their edge to
    // keep clear of the HUD cards when possible.
    // Integration: the arrows belong to a brain that is IN VIEW; when the player looks away (far down at the legs, up at
    // the face) and less than ORBIT_ARROWS.minVisibleFrac of the free width or height shows brain, they hide instead of
    // sticking to the screen edges.
    const showArrows = regionMode && brainTransformSet && projectBrainBounds() && brainBoundsVisible(brainBoundsPx, cssW - reserveRight, cssH - reserveBottom, topPx);
    arrowLayout = showArrows ? orbitArrowLayout(brainBoundsPx, { width: cssW, height: cssH }, { reserveRightPx: reserveRight, topPx, bottomPx: reserveBottom }) : null;
    if (arrowLayout && hudRects.length) {
      const s2 = arrowLayout.sizePx / 2, m = ORBIT_ARROWS.marginPx;
      for (const d of ORBIT_ARROWS.dirs) {
        const p = arrowLayout[d], axis = d === 'left' || d === 'right' ? 'y' : 'x';
        const alongY = q0 => nudgeClear(q0, 'y', arrowLayout.sizePx, hudRects, topPx + m + s2, cssH - reserveBottom - m - s2);
        const alongX = q0 => nudgeClear(q0, 'x', arrowLayout.sizePx, hudRects, m + s2, cssW - reserveRight - m - s2);
        let q = axis === 'y' ? alongY(p) : alongX(p);
        // Polish: a full-width card (portrait) leaves no room along the edge; then try across it (inward).
        if (q.x === p.x && q.y === p.y) q = axis === 'y' ? alongX(p) : alongY(p);
        if (q.x !== p.x || q.y !== p.y) arrowLayout[d] = { x: q.x, y: q.y, clamped: true };
      }
    }
    arrowsShown = Boolean(arrowLayout);
    // Polish: expose whether the brain is in view, so the HUD colour key can shrink while the player looks at the body
    // (far right / down / up) and the legend stops covering the right arm or the legs.
    const inView = showArrows ? 'true' : 'false';
    if (brainInViewAttr !== inView) { overlay.setAttribute('data-ns-brain-in-view', inView); brainInViewAttr = inView; }
    for (const d of Object.keys(arrows)) {
      const b = arrows[d], last = arrowLast[d];
      if (b.hidden === arrowsShown) b.hidden = !arrowsShown;
      if (!arrowsShown) continue;
      const p = arrowLayout[d];
      const l = px(p.x - arrowLayout.sizePx / 2), t = px(p.y - arrowLayout.sizePx / 2);
      if (last.left !== l) { b.style.left = l; last.left = l; }
      if (last.top !== t) { b.style.top = t; last.top = t; }
      if (last.clamped !== p.clamped) { last.clamped = p.clamped; b.setAttribute('data-ns-clamped', p.clamped ? 'true' : 'false'); }
    }
    // Region group labels at their projected anchors (hidden behind the camera, off screen or under the info panel),
    // de-collided in priority order (left arm first) with estimated text boxes (no layout reads).
    if (labelEls.length) {
      const mw = brainGroup.matrixWorld, vi = camera.matrixWorldInverse, pm = camera.projectionMatrix;
      const hovered = hoveredRegionId;
      for (let i = 0; i < labelEls.length; i++) {
        const L = labelEls[i], a = L.group.anchor, b = labelBoxes[i];
        pv.set(a[0], a[1], a[2]).applyMatrix4(mw).applyMatrix4(vi);
        let shown = brainTransformSet && pv.z < -near;
        if (shown) {
          pv.applyMatrix4(pm);
          b.x = (pv.x + 1) * 0.5 * cssW; b.y = (1 - pv.y) * 0.5 * cssH;
          shown = b.x > 8 && b.x < cssW - reserveRight - 8 && b.y > topPx && b.y < cssH - 8 - reserveBottom;
        }
        b.skip = !shown;
        L.shownNow = shown;
      }
      // Keep each label box inside the free area (never under the info panel) and away from the crosshair and HUD cards.
      for (const b of labelBoxes) if (!b.skip) b.x = clampTo(b.x, b.w / 2 + 4, Math.max(b.w / 2 + 4, cssW - reserveRight - b.w / 2 - 6));
      labelFixed.length = 0;
      labelFixed.push({ x: cssW / 2, y: cssH / 2, w: 120, h: 64 }); // crosshair + hover label zone
      for (const r of hudRects) labelFixed.push({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, w: r.x1 - r.x0, h: r.y1 - r.y0 });
      // Round-2 fixes V2 / V3 / V6: the essential limits line (a full-width band down to topPx), the orbit arrows and
      // the player's own arm (ns-app armAvoidShapes, via setLabelAvoid) are obstacles too.
      labelFixed.push({ x: cssW / 2, y: topPx / 2, w: cssW * 2, h: topPx });
      const arrowBoxes = arrowsShown && arrowLayout ? ORBIT_ARROWS.dirs.map(d => arrowLayout[d]).filter(Boolean)
        .map(p => ({ x0: p.x - arrowLayout.sizePx / 2 - 4, y0: p.y - arrowLayout.sizePx / 2 - 4, x1: p.x + arrowLayout.sizePx / 2 + 4, y1: p.y + arrowLayout.sizePx / 2 + 4 })) : [];
      for (const r of arrowBoxes) labelFixed.push({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, w: r.x1 - r.x0, h: r.y1 - r.y0 });
      const armPx = labelAvoidPx();
      for (const r of armPx.boxes) labelFixed.push({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, w: r.x1 - r.x0, h: r.y1 - r.y0 });
      const pos = separateLabels(labelBoxes, 4, labelFixed);
      for (let i = 0; i < labelEls.length; i++) {
        const L = labelEls[i], bx = labelBoxes[i];
        // Never above the limits line (V3): clamp below it.
        if (pos[i].y - bx.h / 2 < topPx + 2) pos[i] = { x: pos[i].x, y: topPx + 2 + bx.h / 2 };
        // A group label that still sits on a HUD card, an orbit arrow or the player's arm is hidden (the left-arm label
        // always stays).
        let shown = L.shownNow;
        if (shown && !L.group.isLeftArm) {
          const x0 = pos[i].x - bx.w / 2, x1 = pos[i].x + bx.w / 2, y0 = pos[i].y - bx.h / 2, y1 = pos[i].y + bx.h / 2;
          const hit = r => x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1;
          if (hudRects.some(hit) || arrowBoxes.some(hit)) shown = false;
          else if (labelAvoid && hitsAvoid({ x0: x0 / cssW, y0: y0 / cssH, x1: x1 / cssW, y1: y1 / cssH }, labelAvoid)) shown = false;
        }
        if (L.last.shown !== shown) { L.last.shown = shown; L.el.hidden = !shown; }
        if (!shown) continue;
        const hov = hovered !== null && L.group.regionIds.includes(hovered);
        if (L.last.hover !== hov) { L.last.hover = hov; if (hov) L.el.setAttribute('data-hover', 'true'); else L.el.removeAttribute('data-hover'); }
        const l = px(pos[i].x), t = px(pos[i].y);
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
          const yl = clampTo(y + (r / Math.tan((camera.fov * DEG) / 2)) * 0.5 * cssH + 8, topPx, cssH - 40);
          const xl = clampTo(x, 120, Math.max(120, cssW - reserveRight - 120));
          showLabel = true;
          const l = px(xl), t = px(yl);
          if (faceLabelLast.left !== l) { faceLabel.style.left = l; faceLabelLast.left = l; }
          if (faceLabelLast.top !== t) { faceLabel.style.top = t; faceLabelLast.top = t; }
          if (faceLabelLast.text !== FACE_LAYER.ghostLabel) { faceLabel.textContent = FACE_LAYER.ghostLabel; faceLabelLast.text = FACE_LAYER.ghostLabel; }
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

  /** Current CSS size of the canvas and the pixel ratio: the device ratio capped at maxPixelRatio and, with
   * adaptivePixelRatio, the adaptive level (adaptPixelRatio, fed by render()). ns-app resizes when it changes. */
  function measure() {
    const dpr = view && Number.isFinite(view.devicePixelRatio) && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1;
    const cap = Math.min(maxPixelRatio, dpr);
    let pixelRatio = cap;
    if (adaptiveOpts) {
      if (dprState.cap !== cap) dprState = { level: cap, cap, smoothMs: null, slowFor: 0, fastFor: 0 };
      pixelRatio = Math.min(cap, dprState.level);
    }
    return { width: Math.floor(canvas.clientWidth || 0), height: Math.floor(canvas.clientHeight || 0), pixelRatio };
  }

  /** Renderer size (CSS size kept by the stylesheet), camera aspect and projection. One drawing-buffer allocation
   * (setDrawingBufferSize) when available. */
  function resize({ width, height, pixelRatio = 1, fovYDeg: fov } = {}) {
    if (!(width > 0 && height > 0)) return false;
    const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    if (typeof renderer.setDrawingBufferSize === 'function') renderer.setDrawingBufferSize(width, height, pr);
    else { renderer.setPixelRatio(pr); renderer.setSize(width, height, false); }
    // Optional narrow-layout FOV from ns-app (effectiveFovYDeg); absent or invalid keeps the current FOV.
    if (Number.isFinite(fov) && fov > 0 && fov < 179) camera.fov = fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Arm ghost window: centred on the crosshair, in drawing-buffer pixels.
    const g = ghostUniform.value;
    g[0] = (width * pr) / 2; g[1] = (height * pr) / 2; g[2] = ARM_GHOST.radiusFrac * Math.min(width, height) * pr;
    cssW = width; cssH = height; cssPr = pr;
    overlayDirty = true;
    const tg = torsoGhostUniform.value;
    tg[0] = g[0]; tg[1] = g[1]; tg[2] = BODY_SEE_THROUGH.radiusFrac * Math.min(width, height) * pr;
    return true;
  }

  function render() {
    if (lost || disposed) return;
    const now = nowMs();
    const dtMs = lastRenderAt === null ? 0 : now - lastRenderAt;
    lastRenderAt = now;
    if (adaptiveOpts && dtMs > 0) dprState = adaptPixelRatio(dprState, dtMs, adaptiveOpts);
    if (strip) strip.uniforms.nsTime.value = (now / 1000) % 1000;
    // Arm ghost window (auto): while the crosshair is on a control region (legacy marker or region mode).
    const target = armGhostState.mode === 'auto' ? (typeof highlighted === 'string' || gazeOnRegion ? 1 : 0) : armGhostState.mode;
    const k = dtMs > 0 ? 1 - Math.exp(-dtMs / 1000 / ARM_GHOST.easeS) : 1;
    let a = armGhostState.amount + (target - armGhostState.amount) * k;
    if (Math.abs(target - a) < 1e-3) a = target;
    armGhostState.amount = a;
    ghostUniform.value[3] = a;
    const tTarget = body.length ? bodySeeThroughAmount(lookPitch) : 0;
    let ta = torsoGhost.amount + (tTarget - torsoGhost.amount) * (dtMs > 0 ? 1 - Math.exp(-dtMs / 1000 / BODY_SEE_THROUGH.easeS) : 1);
    if (Math.abs(tTarget - ta) < 1e-3) ta = tTarget;
    torsoGhost.amount = ta;
    torsoGhost.target = tTarget;
    torsoGhostUniform.value[3] = ta;
    // Integration: looking far down the trunk fills the LOWER part of the view, so the window slides down with the
    // see-through amount (lowerFrac of the height below the centre at full amount); gl_FragCoord y runs bottom-up.
    torsoGhostUniform.value[1] = cssH * cssPr * (0.5 - BODY_SEE_THROUGH.lowerFrac * ta);
    updateFaceLayer();
    layoutOverlay();
    renderer.render(scene, camera);
    renderFaceLayer();
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
    for (const [t, type, fn] of arrowListeners.splice(0)) t.removeEventListener(type, fn);
    stopArrowHold();
    if (view && typeof view.removeEventListener === 'function') view.removeEventListener('blur', stopArrowHold);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    for (const d of disposables.splice(0)) d.dispose();
    renderer.dispose();
  }

  return {
    objects: {
      renderer, scene, camera, armGroup, brainGroup, bones, muscles, glass, glassDepth, markers, get strip() { return strip; },
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
      get pixelRatioState() { return adaptiveOpts ? { ...dprState } : null; },
      /** U2b-scene: region records { id, region, material, meshes, depthMeshes, outline, activity, activated, hovered,
       * opacity }, the full-body records { id, mesh, part, kind, material, face }, the body and face groups, the
       * overlay element and the face scene. */
      regions, regionMeshes, groupOutlines, body, bodyGroup, faceGroup, faceScene, overlay, unassignedGlass,
      /** { applied (null until a torso material compiles), amount (0..1) } of the BODY_SEE_THROUGH window. */
      torsoSeeThrough: torsoGhost,
      get segmentation() { return segmentation; }
    },
    measure,
    resize,
    setView,
    setArm,
    setBrain,
    setPlacement,
    updatePose,
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
    overlayObstacles,
    get regionMode() { return regionMode; },
    /** Plain-JSON state of the U2b-scene features (QA / tests). */
    sceneState() {
      return {
        regionMode, brainTransformSet, regions: regions.length, hoveredRegionId, gazeOnRegion,
        activatedRegionIds: regions.filter(r => r.activated >= 1).map(r => r.id),
        arrows: arrowsShown && arrowLayout ? Object.fromEntries(ORBIT_ARROWS.dirs.map(d => [d, { x: Math.round(arrowLayout[d].x), y: Math.round(arrowLayout[d].y), clamped: arrowLayout[d].clamped }])) : null,
        arrowHover: hoverDir, brainBoundsPx: arrowsShown ? { ...brainBoundsPx } : null,
        labels: labelEls.map(L => ({ text: L.group.text, shown: L.last.shown, left: L.last.left, top: L.last.top })),
        info: info ? { shown: !info.panel.hidden } : null,
        body: { meshes: body.length, face: body.filter(b => b.face).length, frame: bodyFrameSource, eyeBp: eyeBp.slice(), bodyYaw },
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
  'hover', 'regionNote'
]);
/** Always-visible note under the legend bar (A2-render R1): what the region tints, the bright spot and the shimmer
 * mean. render({ regionNote }) may replace it; empty text restores this default (it is never hidden). */
export const HUD_REGION_NOTE = 'Tints = selectable control regions (nearest representative point), not cortical borders. ' +
  'Brightest spot = the selected region near its point. Glow and shimmer are simulated display only.';
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
export const HUD_DETAILS_SUMMARY = 'Sources and rights';
/** Polish: the colour key under the activity legend (plain words). One swatch per on-brain cue, so the brain colours,
 * the muscle colours and the activation marks are explained in one place, right next to the information panel. */
export const HUD_LEGEND_KEY = Object.freeze([
  Object.freeze(['leftarm', 'Left-arm areas (right half of the brain)', 'Left arm']),
  Object.freeze(['other', 'Areas for every other body part', 'Other parts']),
  Object.freeze(['activated', 'Gold edge: activated (until Reset body)', 'Activated']),
  Object.freeze(['dot', 'Dots: left-arm movement points', 'Arm points'])
]);
/** Caption between the legend bar's ends: the one ramp is shared by the brain and the muscles. */
export const HUD_LEGEND_SHARED = 'same colours on brain and muscles';
/** Always-visible simulated/representative limits notice. It wraps at a fixed readable font size.
 * The nominal top margin comes from the unchanged arm-fit setting; actual glyph/hand clearance is unverified. */
export const HUD_LIMITS_SHORT = 'Simulated \u00b7 representative map \u00b7 not real stimulation or decoding';
/** Nominal arm-fit margin, retained unchanged. HUD placement also considers the measured notice height;
 * neither this constant nor the approximate arm-avoid shapes prove actual whole-hand pixel bounds. */
export const ESSENTIAL_BAND = ARM_DEFAULTS.marginNdc / 2;
export const ORIENTATION_KEYS = Object.freeze(['right', 'left', 'anterior', 'posterior']);
const DRIVE_LINES = 5;
const PANEL_MEASURE_EVERY = 10; // placeOrientation calls between panel-rectangle reads (layout reads are not free)
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
  label: Object.freeze({ sideW: 150, sideShortW: 48, axisW: 104, h: 24, shortBelowAspect: 1 }),
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
  for (const k of ['title', 'status', 'gaze', 'note', 'pulse', 'trigger', 'space', 'reach', 'drivesTitle']) {
    slots[k] = make('div', `ns-slot ns-slot-${k}`, info);
  }
  slots.status.setAttribute('aria-live', 'polite');
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
  hover.hidden = true;
  slots.hover = hover;
  let hoverExplicit = false;

  const orient = {};
  const orientSize = {};
  const orientText = {};
  const orientPick = {};
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
      for (const el of [info, legend, essential, ...ORIENTATION_KEYS.map(k => orient[k])]) ro.observe(el);
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

  function placePanels(W, H, avoid) {
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
      const y = reserved.y1 + g, x = Math.max(g, reserved.x1 - w);
      if (w <= reserved.x1 - reserved.x0 + 1 && y + h <= H - g / 2) {
        legendSlot = { x, y };
        placed.push({ x0: x / W, y0: y / H, x1: (x + w) / W, y1: (y + h) / H });
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
    placePanels(W, H, panelAvoid);
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
        [w, h] = orientSize[k] || [side ? (shortWanted ? HUD_LAYOUT.label.sideShortW : HUD_LAYOUT.label.sideW) : HUD_LAYOUT.label.axisW, HUD_LAYOUT.label.h];
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
      const free = pl => !pl.box || (!hitsAvoid(pl.box, avoid) && !boxesOverlap(pl.box, band) && !(panelRects || []).some(r => boxesOverlap(pl.box, r)));
      const placed = cands.map(c => ({ key: c.key, ...placeOf(c.p) }));
      const current = placed.find(c => c.key === orientPick[k]);
      let chosen = (current && free(current) ? current : placed.find(free)) || null;
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
      const use = chosen || placed[0];
      orientPick[k] = use.key;
      setClass(el, `ns-orient ns-orient-${k}`);
      // A2-render R1: attribute and style writes only when the value changes (no per-frame DOM invalidation).
      const last = orientLast[k], placement = chosen ? 'clear-estimate' : 'limited';
      const left = `${(use.x * 100).toFixed(2)}%`, top = `${(use.y * 100).toFixed(2)}%`;
      if (last.placement !== placement) { el.setAttribute('data-ns-placement', placement); last.placement = placement; }
      if (last.left !== left) { el.style.left = left; last.left = left; }
      if (last.top !== top) { el.style.top = top; last.top = top; }
    }
  }

  function dispose() {
    if (ro) { try { ro.disconnect(); } catch { /* already gone */ } ro = null; }
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  /** U2b-scene: whether the HUD cards keep clear of the information overlay area (infoPanelRect); default true. */
  function setReserveInfo(on) { reserveInfo = on !== false; sizedFor = ''; return reserveInfo; }

  return {
    root, slots, details, essential, render, placeOrientation, dispose, reserveInfo: setReserveInfo,
    get bandRect() { return lastBandRect; }, get reservedRect() { return reservedRect; }
  };
}
